"""RV comparison scratch lifetime; complete relation integration is a separate gate."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_owner import owner_image, owner_base, current
from tools.test_secret_reward_transaction import (
    image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, states, request, intent)
from tools.secret_reward import encode as encode_reward
from tools.secret_reward_state import action
from tools.secret_continuation import (
    Phase, CONTEXT_OFFSET, CONTEXT_BYTES,
    decode as decode_continuation, encode as encode_continuation)
from tools.secret_roster import encode as encode_party
from dataclasses import replace
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE, x86


EXTRA = ("rv_compare_memory", "rv_compare_buffer", "rv_compare_mode", "kc_cmp",
         "kc_buf", "kc_fh", "rt_state", "rt_items", "rt_ledger",
         "rr_read_offset", "rv_compare_offset", "rv_compare_left")


@pytest.fixture(scope="module")
def comparison_images(tmp_path_factory):
    class Factory:
        def mktemp(self, name):
            self.path = tmp_path_factory.mktemp(name)
            return self.path
    factory = Factory()
    _, labels = owner_image.__wrapped__(factory)
    base = (factory.path / "probe.asm").read_text()
    exports = tuple(dict.fromkeys(tuple(labels) + EXTRA))
    base = base.replace("dw " + ",".join(labels), "dw " + ",".join(exports), 1)
    src = Path(__file__).resolve().parents[1] / "native/src"
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    images = {}
    for alias in (False, True):
        folder = tmp_path_factory.mktemp("rv-alias" if alias else "rv-default")
        asm, binary = folder / "probe.asm", folder / "probe.bin"
        defines = "%define RZ_EXTERNAL_CATALOG rw_header\n%define RU_EXTERNAL_TABLE rl_target_ledger\n"
        if alias:
            defines += "%define RV_EXTERNAL_COMPARE kc_cmp\n"
        asm.write_text(defines + base)
        run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(asm),
                              "-o", str(binary)], capture_output=True, timeout=30)
        assert run.returncode == 0, run.stderr
        raw = binary.read_bytes()
        assert len(raw) + 256 <= 65280
        images[alias] = raw, dict(zip(exports, struct.unpack_from("<" + "H" * len(exports), raw)))
    assert len(images[False][0]) - len(images[True][0]) == 512
    for alias, (raw, p) in images.items():
        assert (p["rv_compare_buffer"] == p["kc_cmp"]) == alias
        assert p["kc_cmp"] == p["kc_buf"] + 512
        assert p["kc_cmp"] + 512 <= len(raw) + 256
        for label, size in (("kc_buf", 512), ("rt_state", 160), ("rt_items", 960),
                            ("rt_ledger", 1056), ("rr_read_offset", 4),
                            ("rv_compare_offset", 4), ("rv_compare_left", 4)):
            assert p[label] + size <= p["kc_cmp"] or p[label] >= p["kc_cmp"] + 512
    return images


def compared(image, target, length, *, corrupt=None, fault=None):
    payload = bytes((i * 29 + 17) & 255 for i in range(length))
    if target == "kc_buf":
        # The rejoin GBIR expected buffer includes the genuine kind-word patch.
        payload = payload[:8] + b"\x02\x00" + payload[10:]
    peer = bytearray(payload)
    if corrupt is not None:
        peer[corrupt] ^= 1
    prefix = b"unrelated physical prefix"
    files = {"C:\\EVENTS.BIN": prefix + peer + b"opaque suffix"}
    m = RewardDiskMachine(image, files)
    assert not m.call("kc_open", DX=m.labels["input_path"])
    m.put("rv_compare_buffer", b"\xa5" * 512)
    if target == "fx":
        mode, offset, address = 1, 40000, 0x40000 + 40000
    elif target == "party":
        mode, offset, address = 1, 0, 0x40000
    else:
        mode, offset = 0, m.labels[target]
        address = BASE + offset
    m.uc.mem_write(address, payload)
    m.put("rv_compare_mode", bytes((mode,)))
    before = m.disk_snapshot()
    start = len(m.events)
    if fault is not None:
        m.fault_at, m.protocol_fault = start + fault[0], fault[1]
    bad = m.call("rv_compare_memory", EAX=len(prefix), EDX=length, DI=offset,
                 FS=0x4000, GS=0x5000)
    assert bytes(m.uc.mem_read(address, length)) == payload
    assert m.disk_snapshot() == before and not m.mutations
    assert m.uc.reg_read(x86.UC_X86_REG_FS) == 0x4000
    assert m.uc.reg_read(x86.UC_X86_REG_GS) == 0x5000
    events = m.events[start:]
    assert all(e["ax"] >> 8 in (0x42, 0x3f) for e in events)
    m.fault_at = None
    assert not m.call("kc_close") and not m.handles
    return bad, [(e["ax"], e["cx"]) for e in events]


@pytest.mark.parametrize("target,length", [("rt_state", 160), ("rt_items", 960),
    ("rt_ledger", 1056), ("kc_buf", 346), ("fx", 5948), ("party", 1537)])
def test_expected_spans_survive_every_comparison_chunk(comparison_images, target, length):
    results = [compared(comparison_images[alias], target, length) for alias in (False, True)]
    assert results[0] == results[1] and results[0][0] is False


@pytest.mark.parametrize("target,length,position", [("kc_buf", 346, 345),
    ("rt_items", 960, 511), ("rt_items", 960, 512), ("rt_ledger", 1056, 1055),
    ("fx", 5948, 5947)])
def test_opaque_changes_refuse_with_both_allocations(comparison_images, target, length, position):
    results = [compared(comparison_images[alias], target, length, corrupt=position)
               for alias in (False, True)]
    assert results[0] == results[1] and results[0][0] is True


def test_scratch_neighbors_and_repeated_comparison_are_preserved(comparison_images):
    for alias in (False, True):
        m = RewardDiskMachine(comparison_images[alias], {"C:\\EVENTS.BIN": bytes(range(256)) * 4})
        assert not m.call("kc_open", DX=m.labels["input_path"])
        payload = bytes(range(256)) * 4
        m.uc.mem_write(0x40000, payload)
        m.put("rv_compare_mode", b"\x01")
        scratch = BASE + m.labels["rv_compare_buffer"]
        neighbors = (bytes(m.uc.mem_read(scratch - 8, 8)), bytes(m.uc.mem_read(scratch + 512, 8)))
        for changed in (False, True, False):
            m.files["C:\\EVENTS.BIN"][-1] = payload[-1] ^ int(changed)
            m.put("rv_compare_buffer", b"\xa5" * 512)
            assert m.call("rv_compare_memory", EAX=0, EDX=1024, DI=0, FS=0x4000) == changed
            assert bytes(m.uc.mem_read(0x40000, 1024)) == payload
            # Default RV storage follows its intentionally mutable loop
            # controls. The KC alias's neighbors have no such live outputs.
            if alias:
                assert bytes(m.uc.mem_read(scratch - 8, 8)) == neighbors[0]
                assert bytes(m.uc.mem_read(scratch + 512, 8)) == neighbors[1]
        assert not m.mutations
        assert not m.call("kc_close") and not m.handles


@pytest.mark.parametrize("chunk", [0, 5, 11])
@pytest.mark.parametrize("operation,kind", [(1, "error"), (1, "bad-position"),
                                           (2, "error"), (2, "short")])
def test_first_middle_final_fx_io_failure_cannot_admit(comparison_images, chunk, operation, kind):
    results = [compared(comparison_images[alias], "fx", 5948,
                       fault=(chunk * 2 + operation, kind)) for alias in (False, True)]
    assert results[0] == results[1] and results[0][0] is True


@pytest.mark.parametrize("case", ["items", "amount", "history"])
def test_whole_relation_derivation_and_cold_intent_reopen(comparison_images, owner_base, case):
    pre = states(owner_base)["amount" if case == "amount" else "items"]
    if case == "history":
        pre = action(pre, 10, recipient=1, item=11)[0]
    kind, args = (12, {"recipient": 1, "value": 3}) if case == "amount" else (10, {"recipient": 1, "item": 10})
    post, result = action(pre, kind, **args)
    old = current(owner_base, pre, 1)
    raw, req = encode_reward(old), request(pre, kind, **args)
    expected = encode_reward(intent(old, pre, post, req, result))
    outputs = []
    for alias in (False, True):
        compiled = comparison_images[alias]
        m = RewardDiskMachine(compiled, {"C:\\EVENTS.BIN": raw})
        assert not m.call("rr_index", DX=m.labels["input_path"])
        m.put("rv_compare_buffer", b"\xa5" * 512)
        assert not m.call("rv_record_relation", DX=m.labels["owned_end"], FS=0x4000, GS=0x5000)
        m.put("rj_external", req)
        assert not m.call("rj_derive", SI=m.labels["rj_external"], DX=m.labels["owned_end"], FS=0x4000, GS=0x5000)
        assert not m.call("rj_stage_intent", FS=0x4000, GS=0x5000)
        path = m.get("rj_temp", 112).split(b"\0", 1)[0].decode()
        assert m.disk_snapshot()[path] == expected
        assert m.disk_snapshot()["C:\\EVENTS.BIN"] == raw and m.get("rj_external", 128) == req
        assert not m.call("kc_close") and not m.handles
        cold = RewardDiskMachine(compiled, m.disk_snapshot())
        cold.put("ro_peer", path.encode() + b"\0")
        assert not cold.call("rr_index", DX=cold.labels["ro_peer"])
        cold.put("rv_compare_buffer", b"\x5a" * 512)
        assert not cold.call("rv_record_relation", DX=cold.labels["owned_end"], FS=0x4000, GS=0x5000)
        assert not cold.call("kc_close") and not cold.handles
        outputs.append((cold.disk_snapshot(), cold.get("rt_state", 160),
                        cold.get("rt_items", 960), cold.get("rt_ledger", 1056)))
    assert outputs[0] == outputs[1]


def rejoin_input(base, state):
    """Accepted source-bound final-input recipe, using this fixture's producer."""
    producer = decode_continuation(base[0].producer_bytes)
    parts = list(producer.sections)
    request_bytes = bytearray(parts[0])
    struct.pack_into("<H", request_bytes, 8, 2)
    fx = bytearray(producer.part("successor"))
    count = struct.unpack_from("<H", fx, 196)[0]
    keys = list(struct.unpack_from("<" + str(count) + "H", fx, 198))
    values = list(struct.unpack_from("<" + str(count) + "H", fx, 1222))
    for key in (0x7ec7, 0x7ec8, 0x7f70, 0x7f71, 0x7f72, 0x7ee3, 0x7ee6, 0x4cf5, 0x7eca):
        if key in keys:
            index = keys.index(key)
            values[index] = values[index] & 1 if key == 0x7eca else 0
        else:
            keys.append(key)
            values.append(0)
    assert len(keys) <= 512
    struct.pack_into("<H", fx, 196, len(keys))
    struct.pack_into("<" + str(len(keys)) + "H", fx, 198, *keys)
    struct.pack_into("<" + str(len(values)) + "H", fx, 1222, *values)
    struct.pack_into("<2H", fx, 5782, state.selected, state.selection_flags)
    struct.pack_into("<2H", fx, 5940, state.selection_flags, state.selected)
    parts[0], parts[1], parts[2] = bytes(request_bytes), encode_party(state.party), bytes(fx)
    parts[5:] = [b"", b"victory\r\n", b"", b"", b""]
    return encode_continuation(replace(producer, phase=Phase.COMPLETED,
                                      resume_kind=2, sections=tuple(parts)))


@pytest.mark.parametrize("kind", ["settled", "publication", "foreign-request"])
def test_genuine_phase11_rejoin_relation_with_both_allocations(comparison_images, owner_base, kind):
    main = states(owner_base)["main"]
    confirm = action(main, 14)[0]
    finished = action(confirm, 16)[0]
    rejoin = action(finished, 18)[0]
    closed = rejoin_input(owner_base, rejoin)
    if kind == "foreign-request":
        # Preserve the admitted fixture's exact framing; the deliberately
        # malformed raw request must reach the native validator.
        changed = bytearray(closed)
        changed[CONTEXT_OFFSET + CONTEXT_BYTES + 100] ^= 1
        closed = bytes(changed)
    settled = current(owner_base, rejoin, 1)
    sections = list(settled.sections)
    sections[15] = closed
    settled = replace(settled, sections=tuple(sections))
    record = intent(settled, rejoin, rejoin, request(rejoin, 19), 1) if kind == "publication" else settled
    raw = encode_reward(record)
    outputs = []
    for alias in (False, True):
        m = RewardDiskMachine(comparison_images[alias], {"C:\\EVENTS.BIN": raw})
        for poison in (0xa5, 0x5a):
            assert not m.call("rr_index", DX=m.labels["input_path"])
            m.put("rv_compare_buffer", bytes((poison,)) * 512)
            bad = m.call("rv_record_relation", DX=m.labels["owned_end"], FS=0x4000, GS=0x5000)
            assert bad == (kind == "foreign-request")
            assert m.disk_snapshot() == {"C:\\EVENTS.BIN": raw} and not m.mutations
            assert not m.call("kc_close") and not m.handles
        outputs.append((m.get("rt_state", 160), m.get("rt_items", 960), m.get("rt_ledger", 1056)))
    assert outputs[0] == outputs[1]
