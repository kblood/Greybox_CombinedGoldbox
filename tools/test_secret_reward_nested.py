"""Nested read-only GSK3 admission through real legacy validators, no swaps."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")

from tools.test_secret_continuation_validate import image as validator_image
from tools.test_secret_continuation import prepared, inputs, result, effect
from tools.secret_continuation import encode, bind_result, activate, make_receipt, projected_roster
from tools.test_secret_continuation_io import Machine, BASE, x86

EXTRA = ("kc_open", "kc_close", "kc_view_begin", "kc_view_end", "kc_view_active",
         "kc_view_base", "kc_extent", "kc_fh", "kr_index_open", "kv_validate", "filename", "kc_buf")
EXTRA += ("kc_read_at",)
EXTRA += ("kc_transfer", "kc_publish", "kc_replace", "kc_recover", "kc_mode")


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    class Factory:
        def mktemp(self, name):
            self.path = tmp_path_factory.mktemp(name)
            return self.path
    factory = Factory()
    _, original = validator_image.__wrapped__(factory)
    source = factory.path / "probe.asm"
    text = source.read_text().replace("org 0\n", "org 100h\n")
    exports = tuple(original) + EXTRA
    old = "dw " + ",".join(original) + "\n"
    text = text.replace(old, "dw " + ",".join(exports) + "\n", 1)
    source.write_text(text)
    binary = factory.path / "nested.bin"
    native = Path(__file__).resolve().parents[1] / "native/src"
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    run = subprocess.run([nasm, "-I", str(native) + "/", "-f", "bin", str(source), "-o", str(binary)],
                         capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    return raw, dict(zip(exports, struct.unpack_from("<" + "H" * len(exports), raw)))


class Reader(Machine):
    bad_position = False
    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        super().interrupt(uc, number, unused)
        if ax == 0x4200 and self.bad_position:
            uc.reg_write(x86.UC_X86_REG_AX, uc.reg_read(x86.UC_X86_REG_AX) ^ 1)


def reader(image, payload, base=1520):
    raw = b"parent framing".ljust(base, b"P") + payload + b"unrelated parent suffix"
    machine = Reader(image, {"C:\\PARTY.GSK": raw})
    assert not machine.call("kc_open", DX=machine.labels["filename"])
    machine.put("kc_verified", b"\1\0")
    assert not machine.call("kc_view_begin", EAX=base, EDX=len(payload))
    assert machine.get("kc_verified", 2) == bytes(2)
    return machine, raw


def active(complete):
    settlement = result(complete)
    return activate(complete, effect(0),
                    producer_receipt=make_receipt(complete, effect(0), wrapper_exit=0),
                    settled_result=settlement[:14] + b"\1\0" + settlement[16:],
                    settled_roster=projected_roster(complete, settlement))


@pytest.mark.parametrize("kind", ["prepared", "completed", "active"])
@pytest.mark.parametrize("base", [1520, 65535, 65536])
def test_exact_nested_gsk3_and_whole_receipt_uses_existing_validator(image, prepared, kind, base):
    record = prepared
    if kind != "prepared":
        record = bind_result(prepared, result(prepared), b"party\r\n")
    if kind == "active":
        record = active(record)
    machine, raw = reader(image, encode(record), base)
    before = dict(machine.files)
    assert not machine.call("kr_index_open")
    assert not machine.call("kv_validate", FS=0x4000, GS=0x5000)
    assert machine.get("kc_verified", 2) == bytes(2)
    assert machine.get("kc_view_active", 1) == b"\1"
    assert machine.files == before
    assert not machine.call("kc_view_end")
    assert machine.get("kc_extent", 4) == struct.pack("<I", len(raw))
    assert not machine.call("kc_close") and not machine.handles
    assert all(e["ax"] >> 8 not in (0x3c, 0x40, 0x41, 0x56) for e in machine.events)


@pytest.mark.parametrize("case", ["short", "foreign", "trailing", "receipt"])
def test_nested_framing_failure_retains_parent_handle_and_does_not_escape_section(image, prepared, case):
    complete = bind_result(prepared, result(prepared), b"party\r\n")
    record = active(complete)
    raw = bytearray(encode(record))
    if case == "short": del raw[-1:]
    if case == "foreign": raw[:4] = b"GSK4"
    if case == "trailing": raw += b"x"
    if case == "receipt": raw[-1] ^= 1
    machine, parent = reader(image, bytes(raw))
    handle = machine.get("kc_fh", 2)
    assert machine.call("kr_index_open")
    assert machine.get("kc_fh", 2) == handle
    assert machine.get("kc_verified", 2) == bytes(2)
    assert machine.files["C:\\PARTY.GSK"] == parent
    assert not machine.call("kc_view_end")
    assert not machine.call("kc_close") and not machine.handles


@pytest.mark.parametrize("fault", ["seek", "read", "short-read", "bad-position"])
def test_nested_checked_io_failure_never_grants_authority(image, prepared, fault):
    machine, parent = reader(image, encode(prepared))
    if fault == "bad-position": machine.bad_position = True
    else: machine.fault = fault
    assert machine.call("kr_index_open")
    assert machine.get("kc_verified", 2) == bytes(2)
    assert machine.files["C:\\PARTY.GSK"] == parent
    machine.fault = None
    assert not machine.call("kc_close") and not machine.handles
    assert machine.get("kc_view_active", 1) == bytes(1)


def test_view_boundary_rejects_recursion_and_out_of_section_read_before_io(image, prepared):
    machine, _ = reader(image, encode(prepared))
    before = len(machine.events)
    assert machine.call("kc_view_begin", EAX=1, EDX=1)
    assert machine.call("kc_read_at", EAX=len(encode(prepared)), CX=1, DI=machine.labels["kc_buf"])
    assert len(machine.events) == before
    assert machine.get("kc_verified", 2) == bytes(2)
    assert not machine.call("kc_close")


@pytest.mark.parametrize("entry", ["kc_publish", "kc_replace", "kc_recover", "kc_transfer"])
def test_nested_view_blocks_all_file_writes_and_clears_stale_grant(image, prepared, entry):
    machine, _ = reader(image, encode(prepared))
    before = dict(machine.files)
    events = len(machine.events)
    machine.put("kc_verified", b"\1\0")
    machine.put("kc_mode", bytes(1))
    assert machine.call(entry, EAX=0, EDX=16, BX=8, SI=machine.labels["filename"],
                        DI=machine.labels["filename"], BP=machine.labels["filename"])
    assert machine.get("kc_verified", 2) == bytes(2)
    assert machine.files == before and len(machine.events) == events
    assert not machine.call("kc_close")


@pytest.mark.parametrize("offset,length", [(0xffffffff, 2), (0, 0), (20, 0xffffffff)])
def test_invalid_window_begin_clears_grant_without_io(image, prepared, offset, length):
    raw = encode(prepared)
    machine = Reader(image, {"C:\\PARTY.GSK": raw})
    assert not machine.call("kc_open", DX=machine.labels["filename"])
    machine.put("kc_verified", b"\1\0")
    events = len(machine.events)
    assert machine.call("kc_view_begin", EAX=offset, EDX=length)
    assert machine.get("kc_verified", 2) == bytes(2)
    assert machine.get("kc_view_active", 1) == bytes(1)
    assert machine.get("kc_extent", 4) == struct.pack("<I", len(raw))
    assert len(machine.events) == events
    assert not machine.call("kc_close")
