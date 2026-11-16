"""Actual RV caller restores its nested file window after path-read failure."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
unicorn = pytest.importorskip("unicorn")
from tools.test_secret_reward_entry import (
    entry_image, entry_files, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE, x86

EXTRA = ("rv_match_view_paths", "kc_view_end", "kc_view_active", "kc_view_base",
         "kc_view_parent_extent", "kc_extent", "kc_fh", "rv_prerequisites_valid",
         "rv_relation_valid", "rv_paths")


@pytest.fixture(scope="module")
def error_image(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path = tmp_path_factory.mktemp(name)
            return self.path
    factory = Factory()
    _, labels = entry_image.__wrapped__(factory)
    asm = factory.path / "probe.asm"
    text = asm.read_text()
    exports = tuple(dict.fromkeys(tuple(labels) + EXTRA))
    text = text.replace("dw " + ",".join(labels), "dw " + ",".join(exports), 1)
    asm.write_text("%define RV_STREAM_PATHS 1\n" + text)
    binary = asm.with_suffix(".bin")
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    src = Path(__file__).resolve().parents[1] / "native/src"
    run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(asm),
                          "-o", str(binary)], capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    assert len(raw) + 256 <= 65280
    return raw, dict(zip(exports, struct.unpack_from("<" + "H" * len(exports), raw)))


class PathErrorMachine(RewardDiskMachine):
    def __init__(self, compiled, files, operation, chunk, effect):
        super().__init__(compiled, files)
        self.operation, self.chunk, self.effect = operation, chunk, effect
        self.armed = False
        self.in_helper = False
        self.count = 0
        self.return_address = None
        self.failed_return = False
        self.unwinds = 0
        self.injected = False
        self.uc.hook_add(unicorn.UC_HOOK_CODE, self.observe)

    def observe(self, uc, address, size, unused):
        if address == BASE + self.labels["rv_match_view_paths"]:
            self.in_helper, self.count = True, 0
            stack = (uc.reg_read(x86.UC_X86_REG_SS) << 4) + uc.reg_read(x86.UC_X86_REG_SP)
            self.return_address = BASE + struct.unpack("<H", bytes(uc.mem_read(stack, 2)))[0]
        elif address == self.return_address:
            if self.injected and self.in_helper:
                assert uc.reg_read(x86.UC_X86_REG_EFLAGS) & 1
                assert self.get("kc_view_active",1) == b"\x01"
                self.failed_return = True
            self.in_helper = False
            self.return_address = None
        if self.failed_return and address == BASE + self.labels["kc_view_end"]:
            self.unwinds += 1

    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        matches = ax == 0x4200 if self.operation == "seek" else ax >> 8 == 0x3f
        if self.armed and self.in_helper and number == 0x21 and matches:
            self.count += 1
            if self.count == self.chunk + 1:
                self.fault_at, self.protocol_fault = len(self.events) + 1, self.effect
                self.injected, self.armed = True, False
        super().interrupt(uc, number, unused)


@pytest.mark.parametrize("chunk", [0,1,2])
@pytest.mark.parametrize("operation,effect", [("seek","error"),("seek","bad-position"),
                                             ("read","error"),("read","short")])
def test_full_rv_caller_clears_prior_admission_and_unwinds_once(error_image, commit_owner_base, chunk, operation, effect):
    files, paths, _ = entry_files(commit_owner_base)
    journal = str(Path(paths[0]).with_suffix(".GRJ"))
    m = PathErrorMachine(error_image, files, operation, chunk, effect)
    m.put("rc_test_inputs", journal.encode().ljust(112,b"\0"))
    assert not m.call("rr_index", DX=m.labels["rc_test_inputs"])
    assert not m.call("rv_record_relation", DX=m.labels["owned_end"], FS=0x4000, GS=0x5000)
    assert m.get("rv_prerequisites_valid",1) == m.get("rv_relation_valid",1) == b"\x01"
    extent, handle, frozen_paths = m.get("kc_extent",4), m.get("kc_fh",2), m.get("rv_paths",1232)
    m.armed = True
    assert m.call("rv_record_relation", DX=m.labels["owned_end"], FS=0x4000, GS=0x5000)
    assert m.injected and m.failed_return and m.unwinds == 1
    assert m.get("kc_view_active",1) == b"\0" and m.get("kc_view_base",4) == bytes(4)
    assert m.get("kc_extent",4) == extent and m.get("kc_fh",2) == handle
    assert m.get("rv_paths",1232) == frozen_paths
    assert m.get("rv_prerequisites_valid",1) == m.get("rv_relation_valid",1) == b"\0"
    assert m.disk_snapshot() == files and not m.mutations
    m.fault_at = None
    assert not m.call("kc_close") and not m.handles
