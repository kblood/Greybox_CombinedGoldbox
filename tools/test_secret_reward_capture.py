"""Private actual producer capture/reuse; no public outer-owner fabrication."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")

from tools.test_secret_continuation import prepared, inputs, effect
from tools.test_secret_continuation_coordinator import setup, EXPORTS
from tools.test_secret_narration_upgrade import NativeProducerCoordinator
from tools.test_secret_narration_native import consumers, producer_image
from tools.test_secret_who_names import image as party_image, Machine as PartyMachine
from tools.secret_continuation import Phase, encode, decode
from tools.test_secret_continuation_io import BASE, x86

ROOT = Path(__file__).resolve().parents[1]
EXTRA = ("kn_capture_producer", "kn_capture_mode", "kn_capture_input_path", "kn_names",
         "kn_admit", "capture_input_name", "kc_close", "kn_restore_authorized", "kc_view_active")


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp("reward-capture")
    source, binary = folder / "probe.asm", folder / "probe.bin"
    labels = EXPORTS + EXTRA
    source.write_text("cpu 386\nbits 16\norg 100h\ndw " + ",".join(labels) + '''
%include "ccnext.asm"
capture_input_name db 'C:\\INPUT.GRC',0
''')
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    run = subprocess.run([nasm, "-I", str(ROOT / "native/src") + "/", "-f", "bin",
                          str(source), "-o", str(binary)], capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    return raw, dict(zip(labels, struct.unpack_from("<" + "H" * len(labels), raw)))


class ActualCoordinator(NativeProducerCoordinator):
    def __init__(self, *args, party, **kwargs):
        super().__init__(*args, **kwargs)
        self.party = party

    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if ax == 0x4b00:
            path = self.path((uc.reg_read(x86.UC_X86_REG_DS) << 4) + uc.reg_read(x86.UC_X86_REG_DX))
            if path.endswith("CCPARTY.COM"):
                size = self.get("kn_tail", 1)[0]
                tail = self.get("kn_tail", 128)[1:1 + size].decode()
                self.children.append((path, tail))
                child = PartyMachine(self.party, {p:bytes(b) for p,b in self.files.items()})
                child.exit_code = None
                child.uc.mem_write(BASE + 0x80, bytes((size,)) + tail.encode() + b"\r")
                child.call("start")
                assert child.exit_code == 0
                self.files = {p:bytearray(b) for p,b in child.files.items()}
                uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS) & ~1)
                return
        super().interrupt(uc, number, unused)


def empty_completed(prepared):
    parts = list(prepared.sections)
    parts[6] = b"victory\r\n"
    return replace(prepared, phase=Phase.COMPLETED, resume_kind=2, sections=tuple(parts))


def configured(image, prepared, completed, consumers, producer_image, party_image, files=None, directories=None):
    if files is None:
        base = setup(image, prepared)
        # Fixture-only ordinary native PREPARE establishes its own workspace;
        # CCHOST's existing declared test callback is outside this capture call.
        assert not base.call("kn_prepare")
        files = {p:bytes(b) for p,b in base.files.items()}
        # The authored empty cursor has no HP transaction. The PREPARE fixture
        # above creates a host-only GSC; retain the first rejection and remove
        # that declared fixture claim before testing this different cursor.
        files.pop(prepared.paths[1].rsplit(".", 1)[0] + ".GSC", None)
        files["C:\\INPUT.GRC"] = encode(completed)
        # The public bytes are a preservation sentinel, NOT claimed valid4.
        files[prepared.paths[8]] = b"uninterpreted public owner preservation sentinel"
        directories = base.directories.copy()
    else:
        assert directories is not None  # Cold reopen never invokes a creator.
    m = ActualCoordinator(image, files, completed, consumers=consumers, producer=producer_image, party=party_image)
    m.directories = directories
    for name, value in (("kn_expected_roster", prepared.paths[1]), ("kn_expected_source", prepared.paths[0]),
                        ("kn_response", "C:\\NEXT.BIN"), ("kn_prefix", "C:\\")):
        m.put(name, value.encode() + b"\0")
    assert not m.call("kn_names")
    assert not m.call("kn_admit", DX=m.labels["capture_input_name"])
    return m


def capture(m):
    stage = m.get("kw_stage", 112)
    m.put("kc_verified", b"\1\0")
    bad = m.call("kn_capture_producer", DX=m.labels["capture_input_name"])
    assert m.get("kw_stage", 112) == stage
    assert m.get("kn_capture_mode", 1) == bytes(1)
    assert m.get("kc_verified", 2) == m.get("kn_restore_authorized", 2) == bytes(2)
    assert m.get("kc_view_active", 1) == bytes(1)
    assert m.cwd == "C:\\"
    return bad


def test_actual_producer_capture_and_true_cold_reuse_no_public_swap(image, prepared, consumers, producer_image, party_image):
    completed = empty_completed(prepared)
    m = configured(image, prepared, completed, consumers, producer_image, party_image)
    public = bytes(m.files[prepared.paths[8]])
    party = bytes(m.files[prepared.paths[1]])
    outcome = bytes(m.files.get(prepared.paths[6], b""))
    bad = capture(m)
    if bad:
        import json
        print(json.dumps({"failures":m.failures,"events":m.events[-25:],"children":m.children,
                          "files":list(m.files),"labels":{k:m.labels[k] for k in ("kn_bad","kv_bad","kw_fail")}}))
    assert not bad, (m.failures, m.events[-10:])
    assert len(m.productions) == 1 and len(m.productions[0]) == 1
    frozen = bytes(m.files["C:\\WORK\\CAPTURE.GSK"])
    active = decode(frozen)
    assert active.phase == Phase.ACTIVE and active.resume_kind == 2
    receipt = active.part("receipt")
    sizes = struct.unpack_from("<3I", receipt, 8)
    assert receipt[24:24 + sizes[0]] == encode(completed)
    assert receipt[24 + sizes[0]:24 + sizes[0] + sizes[1]] == active.part("successor")
    assert receipt[24 + sizes[0] + sizes[1]:] == active.part("stream")
    assert bytes(m.files[prepared.paths[8]]) == public and bytes(m.files[prepared.paths[1]]) == party
    assert bytes(m.files.get(prepared.paths[6], b"")) == outcome
    cold = configured(image, prepared, completed, consumers, producer_image, party_image,
                      files={p:bytes(b) for p,b in m.files.items()}, directories=m.directories.copy())
    before = {p:bytes(b) for p,b in cold.files.items()}
    assert not capture(cold), cold.failures
    assert cold.uc.reg_read(x86.UC_X86_REG_AX) == 1
    assert not cold.children and not cold.productions
    assert {p:bytes(b) for p,b in cold.files.items()} == before
