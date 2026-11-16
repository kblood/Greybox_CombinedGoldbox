"""ENTRY probe in the full private caller, using existing dead storage only."""
import struct
from pathlib import Path
import pytest
from tools.test_secret_reward_prepare_overlay import (
    overlay_images, commit_owner_base, final_capture, capture_image, recovery_image,
    commit_image, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.test_secret_reward_entry_serializer import serializer_image, configured, call
from tools.test_secret_reward_entry import entry_record
from tools.secret_reward import decode
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE
from tools import test_secret_reward_entry_source as source_controls

OUTPUT = r"C:\PRIVATE\ENTRY.GRT"


def full_machine(compiled, base, existing=None, **faults):
    raw, exported = compiled
    labels = dict(exported)
    # Stable startup fields are dead during this private framing invocation.
    labels.update(output=labels["kn_response"], source0=labels["kn_descriptor"],
                  source1=labels["kn_expected_source"], source2=labels["kn_expected_roster"])
    expected, _ = entry_record(base)
    record = decode(expected)
    paths = (r"C:\PRIVATE\ORIGIN.GSK", r"C:\PRIVATE\ANSWER.BIN", r"D:\ITEM.GLB")
    disk = dict(zip(paths, (record.sections[0], record.sections[1], record.sections[4][32:])))
    m = existing or RewardDiskMachine((raw, labels), disk, **faults)
    if existing is not None:
        assert not m.handles and m.get("kc_fh", 2) == b"\xff\xff"
        m.labels.update(labels)
        for path, body in disk.items():
            assert path not in m.files
            m.files[path] = bytearray(body)
    # Poison all three overlapping owners before rebuilding an exact frame.
    m.uc.mem_write(BASE + labels["rw_header"], b"\xa5" * 2224)
    for label, path in zip(("output", "source0", "source1", "source2"), (OUTPUT, *paths)):
        m.put(label, path.encode().ljust(112, b"\0"))
    m.put("rw_header", record.header)
    m.put("rw_paths", record.paths)
    m.put("rw_context", record.context)
    m.put("ep_paths", struct.pack("<3H", *(labels["source" + str(i)] for i in range(3))))
    m.put("ep_lengths", struct.pack("<3I", *(len(disk[path]) for path in paths)))
    m.put("ep_descriptor", record.sections[4][:32])
    storage = {5: ("rv_member", 756), 8: ("rt_state", 160), 10: ("rt_items", 960),
               12: ("rt_ledger", 1056), 14: ("rl_request", 128)}
    spans = []
    specs = bytearray()
    for index, part in enumerate(record.sections):
        if not part:
            specs += bytes(12)
        elif index in (0, 1, 4):
            specs += struct.pack("<HHII", 3, {0: 0, 1: 1, 4: 2}[index], 0, len(part))
        elif index in (6, 7):
            m.uc.mem_write(0x40000, part)
            specs += struct.pack("<HHII", 2, 0x4000, 0, len(part))
        elif index in (9, 11, 13):
            specs += specs[(index - 1) * 12:index * 12]
        else:
            label, capacity = storage[index]
            start = labels[label]
            assert len(part) == capacity
            end = start + capacity
            assert end <= labels["rw_header"] or start >= labels["rw_buf"] + 512
            assert end <= labels["ep_storage"] or start >= labels["ep_end"]
            assert end <= labels["stacktop"] - 512
            assert all(end <= old_start or start >= old_end for old_start, old_end in spans)
            spans.append((start, end))
            m.put(label, part)
            specs += struct.pack("<HHII", 2, BASE >> 4, start, len(part))
    m.put("rw_specs", bytes(specs))
    assert labels["kn_new_paths"] == labels["rw_paths"]
    return m, expected, disk


@pytest.fixture(scope="module")
def full_events(overlay_images, commit_owner_base):
    m, expected, disk = full_machine(overlay_images[1], commit_owner_base)
    assert not call(m, "rw_write", DX=m.labels["output"])
    writer = list(m.events)
    assert not call(m, "ep_compare", DX=m.labels["output"])
    return writer, m.events[len(writer):]


def test_full_caller_matches_default_probe_and_exact_item_path(
        overlay_images, serializer_image, commit_owner_base):
    observations = []
    for make, compiled in ((configured, serializer_image), (full_machine, overlay_images[1])):
        m, expected, disk = make(compiled, commit_owner_base)
        assert not call(m, "rw_write", DX=m.labels["output"])
        assert m.disk_snapshot() == {**disk, OUTPUT: expected}
        before, mutations = m.disk_snapshot(), m.mutations
        assert not call(m, "ep_compare", DX=m.labels["output"])
        assert m.disk_snapshot() == before and m.mutations == mutations
        assert m.get("rw_paths", 1232)[1120:] == decode(expected).paths[1120:]
        assert m.get("rw_header", 256) == decode(expected).header
        assert m.get("rw_context", 32) == decode(expected).context
        assert not m.handles
        observations.append(before)
    assert observations[0] == observations[1]


@pytest.mark.parametrize("where", ["header", "paths", "context", "origin", "answer", "descriptor",
    "archive-first", "archive-last", "paired-p1", "paired-state", "paired-items", "paired-ledger",
    "request", "trailing", "short", "member", "p1-pre", "state-pre", "items-pre", "ledger-pre"])
def test_full_caller_native_corruption_refusal(overlay_images, commit_owner_base, where):
    m, expected, disk = full_machine(overlay_images[1], commit_owner_base)
    assert not call(m, "rw_write", DX=m.labels["output"])
    raw = bytearray(expected)
    offsets = {"header": 32, "paths": 260, "context": 1496}
    sections = {"origin": 0, "answer": 1, "descriptor": 4, "archive-first": 4,
                "archive-last": 4, "paired-p1": 7, "paired-state": 9,
                "paired-items": 11, "paired-ledger": 13, "request": 14,
                "member": 5, "p1-pre": 6, "state-pre": 8, "items-pre": 10, "ledger-pre": 12}
    if where in sections:
        start, length = struct.unpack_from("<II", raw, 128 + sections[where] * 8)
        offsets[where] = start + (32 if where == "archive-first" else length - 1 if where == "archive-last" else 0)
    if where == "trailing": raw += b"\0"
    elif where == "short": del raw[-1]
    else: raw[offsets[where]] ^= 1
    m.files[OUTPUT] = raw
    before, mutations = m.disk_snapshot(), m.mutations
    assert call(m, "ep_compare", DX=m.labels["output"])
    assert m.disk_snapshot() == before and m.mutations == mutations and not m.handles


@pytest.mark.parametrize("operation,ah,last,fault", [
    ("writer", 0x5b, False, "error"), ("writer", 0x3f, False, "error"),
    ("writer", 0x3f, True, "short"), ("writer", 0x40, False, "error"),
    ("writer", 0x40, True, "short"), ("writer", 0x3e, False, "error"),
    ("writer", 0x3e, True, "error"), ("compare", 0x3d, False, "error"),
    ("compare", 0x3f, False, "error"), ("compare", 0x3f, True, "short"),
    ("compare", 0x42, False, "error"), ("compare", 0x3e, True, "error")])
def test_full_caller_file_faults_preserve_ownership(overlay_images, commit_owner_base, full_events,
                                                  operation, ah, last, fault):
    events = full_events[0 if operation == "writer" else 1]
    matches = [event for event in events if event["ax"] >> 8 == ah and "index" in event]
    assert matches
    index = matches[-1 if last else 0]["index"]
    m, expected, disk = full_machine(overlay_images[1], commit_owner_base)
    if operation == "compare":
        assert not call(m, "rw_write", DX=m.labels["output"])
    before, mutations = m.disk_snapshot(), m.mutations
    m.fault_at, m.protocol_fault = index, fault
    assert call(m, "rw_write" if operation == "writer" else "ep_compare", DX=m.labels["output"])
    assert all(bytes(m.files[path]) == body for path, body in disk.items())
    if operation == "compare":
        assert m.disk_snapshot() == before and m.mutations == mutations
    assert not any(event["ax"] >> 8 in (0x41, 0x56) for event in m.events)
    if ah == 0x3e:
        labels = ("ep_fh", "rw_fh") if operation == "writer" else ("kc_fh",)
        assert any(struct.unpack("<H", m.get(label, 2))[0] in m.handles for label in labels)
        label = "ep_read" if m.get("ep_fh", 2) != b"\xff\xff" else "rw_write" if operation == "writer" else "ep_compare"
        count = len(m.events)
        assert call(m, label, DX=m.labels["output"], BX=0, EAX=0, CX=1, DI=m.labels["rw_buf"])
        assert len(m.events) == count


def test_full_caller_exclusive_collision(overlay_images, commit_owner_base):
    m, expected, disk = full_machine(overlay_images[1], commit_owner_base)
    m.files[OUTPUT] = bytearray(b"foreign partial")
    before = m.disk_snapshot()
    assert call(m, "rw_write", DX=m.labels["output"])
    assert m.disk_snapshot() == before and not m.handles


def test_prepare_poison_real_replay_recalculate_and_writer_lifetimes(
        overlay_images, commit_owner_base):
    from tools.test_secret_reward_prepare_overlay import setup, process, calls
    from tools.secret_continuation import decode as read_continuation, encode as encode_continuation
    from tools.secret_reward import encode as encode_reward
    from tools.test_secret_reward_transaction import states, owner, request, intent
    from tools.secret_reward_state import action
    from unicorn import UC_HOOK_CODE
    f = commit_owner_base[0]
    initial = read_continuation(f.checkpoints[0][0])
    pre = states(commit_owner_base)["amount"]
    post, result = action(pre, 12, recipient=1, value=3)
    old = owner(commit_owner_base, pre)
    accepted = request(pre, 12, recipient=1, value=3)
    oracle = encode_reward(intent(old, pre, post, accepted, result))
    observations = []
    for position, compiled in enumerate(overlay_images):
        prepared_machine = setup(compiled, initial)
        raw = encode_continuation(initial)
        prepared_machine.files[r"C:\DESC.BIN"] = bytearray(raw[:24] + bytes(40) + raw[64:1216])
        if initial.part("stream"):
            prepared_machine.files[str(Path(initial.paths[4]).with_suffix(".GBS"))] = bytearray(initial.part("stream"))
        assert process(prepared_machine, compiled, r" /P C:\DESC.BIN", poison=True) == 0
        assert bytes(prepared_machine.files[initial.paths[8]]) == raw
        prepared_memory = bytes(prepared_machine.uc.mem_read(BASE + 256, len(compiled[0])))
        disk = {path: bytes(body) for path, body in prepared_machine.files.items()}
        disk[r"C:\CURRENT.GSK"] = encode_reward(old)
        m = RewardDiskMachine(compiled, disk)
        m.uc.mem_write(BASE + 256, prepared_memory)
        m.put("kn_descriptor", b"C:\\CURRENT.GSK".ljust(112, b"\0"))
        assert not call(m, "rr_index", DX=m.labels["kn_descriptor"])
        m.uc.mem_write(BASE + m.labels["rw_header"], b"\xcc" * 2224)
        m.put("kn_tail", accepted)
        entered = []
        def observe(uc, address, size, unused):
            for label in ("rl_derive", "rz_recalc"):
                if address == BASE + m.labels[label]: entered.append(label)
        hook = m.uc.hook_add(UC_HOOK_CODE, observe)
        try:
            assert not call(m, "rj_derive", SI=m.labels["kn_tail"], DX=m.labels["stacktop"])
        finally:
            m.uc.hook_del(hook)
        assert "rl_derive" in entered and "rz_recalc" in entered
        assert m.get("kn_tail", 128) == accepted
        assert m.get("rw_paths", 1232)[1120:] == old.paths[1120:]
        m.put("kn_response", b"C:\\ORDINARY.GRT".ljust(112, b"\0"))
        assert not call(m, "rw_write", DX=m.labels["kn_response"])
        assert bytes(m.files[r"C:\ORDINARY.GRT"]) == oracle
        assert not call(m, "kc_close") and not m.handles
        observations.append((m.disk_snapshot(), calls(m), entered))
        if position == 1:
            # Reuse the SAME resident memory after real R replay/recalculation.
            # No code reload, no ready flags; rebuild only the private frame.
            m, entry, sources = full_machine(compiled, commit_owner_base, existing=m)
            before = m.disk_snapshot()
            assert not call(m, "rw_write", DX=m.labels["output"])
            assert m.disk_snapshot() == {**before, OUTPUT: entry}
            assert not call(m, "ep_compare", DX=m.labels["output"])
            assert m.get("rw_paths", 1232)[1120:] == decode(entry).paths[1120:]
    assert observations[0] == observations[1]


@pytest.fixture(scope="module")
def full_provider_image(overlay_images):
    raw, exported = overlay_images[1]
    labels = dict(exported)
    # Full caller has no spare appended buffers. Both provider destinations
    # are existing dead RT arrays, below the provider. Physical below/above
    # provider placement remains covered by the original standalone controls.
    labels.update(path0=labels["kn_descriptor"], path1=labels["kn_expected_source"],
                  path2=labels["kn_expected_roster"], below=labels["rt_items"],
                  above=labels["rt_ledger"])
    for label in ("below", "above"):
        start = labels[label]
        assert start + 512 <= labels["ep_storage"]
        assert start + 512 <= labels["stacktop"] - 512
    # Standalone source fixture stores path literals in its emitted data.
    # Seed equivalent disposable data in the full caller's dead startup slots,
    # without changing code, adding bytes or setting any admission flags.
    configured_raw = bytearray(raw)
    for label, path in (("path0", r"C:\ORIGIN.GSK"), ("path1", r"C:\ANSWER.BIN"),
                        ("path2", r"D:\ITEM.GLB")):
        start = labels[label] - 256
        assert start >= 0 and start + 112 <= len(raw) - 512
        configured_raw[start:start + 112] = path.encode().ljust(112, b"\0")
    return bytes(configured_raw), labels


@pytest.mark.parametrize("buffer", ["below", "above"])
@pytest.mark.parametrize("offset", [0, 31, 32, 33, 65535, 65536])
def test_full_provider_prefix_and_large_offsets(full_provider_image, buffer, offset):
    source_controls.test_prefix_and_large_offsets_preserve_parent_window(full_provider_image, buffer, offset)


@pytest.mark.parametrize("length", [65535, 65536, 65537])
def test_full_provider_eof(full_provider_image, length):
    source_controls.test_exact_final_chunk_and_eof_bound(full_provider_image, length)


def test_full_provider_ownership_overlap(full_provider_image):
    source_controls.test_provider_control_overlap_refuses_before_dos(full_provider_image)


@pytest.mark.parametrize("call_index,effect", [(1,"error"),(2,"error"),(3,"error"),
    (3,"bad-position"),(4,"error"),(4,"short"),(5,"error")])
def test_full_provider_faults(full_provider_image, call_index, effect):
    source_controls.test_file_faults_preserve_parent_and_retained_close(full_provider_image, call_index, effect)


def test_full_composition_extent_and_final_stack(overlay_images):
    raw, labels = overlay_images[1]
    assert len(raw) + 256 == labels["stacktop"] == 65033
    assert raw[-512:] == bytes(512)
    assert labels["kn_new_paths"] == labels["rw_paths"]
