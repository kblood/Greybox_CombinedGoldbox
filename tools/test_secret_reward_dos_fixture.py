"""Protocol fidelity tests for the disk-only reward DOS fixture.

These compile a small private DOS INT 21h probe; they do not assemble or run
shared native binaries and do not launch DOSBox.
"""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut
from tools.test_secret_continuation_io import ROOT, BASE, x86

EXPORTS = (
    "probe_open", "probe_create", "probe_delete", "probe_rename", "probe_close",
    "probe_seek", "probe_read", "probe_write", "probe_attribute",
    "path_a", "path_b", "payload", "scratch",
)


@pytest.fixture(scope="module")
def dos_probe_image(tmp_path_factory):
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    if not Path(nasm).is_file() and not shutil.which(nasm):
        pytest.skip("NASM absent")
    folder = tmp_path_factory.mktemp("secret-reward-dos-fixture")
    asm, binary = folder / "dos_probe.asm", folder / "dos_probe.bin"
    asm.write_text("""cpu 386
bits 16
org 100h
dw """ + ",".join(EXPORTS) + """
probe_open:  mov ax,3d00h
             int 21h
             ret
probe_create: mov ax,5b00h
              xor cx,cx
              int 21h
              ret
probe_delete: mov ah,41h
              int 21h
              ret
probe_rename: mov ah,56h
              int 21h
              ret
probe_close: mov ah,3eh
             int 21h
             ret
probe_seek:  mov ax,4200h
             int 21h
             ret
probe_read:  mov ah,3fh
             int 21h
             ret
probe_write: mov ah,40h
              int 21h
              ret
probe_attribute: mov ax,4300h
                 int 21h
                 ret
path_a db 'C:\\A.TMP',0
a times 1 db 0
path_b db 'C:\\B.TMP',0
b times 1 db 0
payload db 'abc',0
scratch times 16 db 0
""", encoding="ascii")
    proc = subprocess.run(
        [nasm, "-f", "bin", str(asm), "-o", str(binary)],
        capture_output=True, text=True, timeout=30,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    data = binary.read_bytes()
    labels = dict(zip(EXPORTS, struct.unpack_from("<" + "H" * len(EXPORTS), data)))
    return data, labels


def path_addr(image, label):
    return image[1][label]


def last_event(machine):
    return machine.events[-1]


def test_open_absence_access_delete_and_open_handle(dos_probe_image):
    image = dos_probe_image
    files = {"C:\\A.TMP": b"abc", "C:\\DENIED.TMP": b"deny"}
    m = RewardDiskMachine(image, files, denied_paths=("C:\\DENIED.TMP",))

    assert m.call("probe_open", DX=path_addr(image, "path_a")) is False
    handle = last_event(m)["result"]
    assert last_event(m)["path"] == "C:\\A.TMP"
    assert m.call("probe_delete", DX=path_addr(image, "path_a")) is True
    assert last_event(m)["result"] == 5 and "C:\\A.TMP" in m.files
    assert m.call("probe_close", BX=handle) is False
    assert m.call("probe_delete", DX=path_addr(image, "path_a")) is False
    assert "C:\\A.TMP" not in m.files

    assert m.call("probe_open", DX=path_addr(image, "path_b")) is True
    assert last_event(m)["result"] == 2
    assert m.call("probe_delete", DX=path_addr(image, "path_b")) is True
    assert last_event(m)["result"] == 2

    m.put("path_a", b"C:\\DENIED.TMP\0")
    assert m.call("probe_open", DX=path_addr(image, "path_a")) is True
    assert last_event(m)["result"] == 5
    assert m.call("probe_delete", DX=path_addr(image, "path_a")) is True
    assert last_event(m)["result"] == 5
    assert m.files["C:\\DENIED.TMP"] == bytearray(b"deny")


def test_exclusive_create_existing_vs_injected_failure(dos_probe_image):
    image = dos_probe_image
    m = RewardDiskMachine(image, {"C:\\A.TMP": b"original"})
    assert m.call("probe_create", DX=path_addr(image, "path_a")) is True
    assert last_event(m)["result"] == 80
    assert m.files["C:\\A.TMP"] == bytearray(b"original")

    assert m.call("probe_create", DX=path_addr(image, "path_b")) is False
    handle = last_event(m)["result"]
    assert "C:\\B.TMP" in m.files and m.files["C:\\B.TMP"] == bytearray()
    assert m.call("probe_close", BX=handle) is False
    assert m.call("probe_create", DX=path_addr(image, "path_b")) is True
    assert last_event(m)["result"] == 80

    faulted = RewardDiskMachine(image, {}, fault_at=1, fault="error", error=5)
    assert faulted.call("probe_create", DX=path_addr(image, "path_a")) is True
    assert last_event(faulted)["result"] == 5
    assert "C:\\A.TMP" not in faulted.files


def test_rename_conflicts_and_open_handles(dos_probe_image):
    image = dos_probe_image
    m = RewardDiskMachine(image, {"C:\\A.TMP": b"a", "C:\\B.TMP": b"b"})
    assert m.call("probe_rename", DX=path_addr(image, "path_a"), DI=path_addr(image, "path_b")) is True
    assert last_event(m)["result"] == 5
    assert m.disk_snapshot() == {"C:\\A.TMP": b"a", "C:\\B.TMP": b"b"}

    # A handle on either endpoint makes rename fail without changing the map.
    assert m.call("probe_open", DX=path_addr(image, "path_a")) is False
    source_handle = last_event(m)["result"]
    assert m.call("probe_rename", DX=path_addr(image, "path_a"), DI=path_addr(image, "path_b")) is True
    assert last_event(m)["result"] == 5
    assert m.call("probe_close", BX=source_handle) is False

    assert m.call("probe_rename", DX=path_addr(image, "path_a"), DI=path_addr(image, "path_b")) is True
    assert last_event(m)["result"] == 5  # B still exists
    m.put("path_b", b"C:\\C.TMP\0")
    assert m.call("probe_rename", DX=path_addr(image, "path_a"), DI=path_addr(image, "path_b")) is False
    assert m.disk_snapshot() == {"C:\\B.TMP": b"b", "C:\\C.TMP": b"a"}

    target_open = RewardDiskMachine(image, {"C:\\A.TMP": b"a"})
    assert target_open.call("probe_create", DX=path_addr(image, "path_b")) is False
    target_handle = last_event(target_open)["result"]
    target_open.put("path_b", b"C:\\B.TMP\0")
    assert target_open.call("probe_rename", DX=path_addr(image, "path_a"), DI=path_addr(image, "path_b")) is True
    assert last_event(target_open)["result"] == 5
    assert target_open.call("probe_close", BX=target_handle) is False


def test_indexed_short_seek_bad_position_and_failed_close(dos_probe_image):
    image = dos_probe_image
    m = RewardDiskMachine(image, {"C:\\A.TMP": b"abcdef"}, fault_at=2, fault="short")
    assert m.call("probe_open", DX=path_addr(image, "path_a")) is False
    handle = last_event(m)["result"]
    assert m.call("probe_read", BX=handle, CX=4, DX=path_addr(image, "scratch")) is False
    assert last_event(m)["result"] == 3
    assert m.get("scratch", 4) == b"abc\0"

    seek = RewardDiskMachine(image, {"C:\\A.TMP": b"abcdef"}, fault_at=2, fault="bad-position")
    assert seek.call("probe_open", DX=path_addr(image, "path_a")) is False
    handle = last_event(seek)["result"]
    assert seek.call("probe_seek", BX=handle, CX=0, DX=5) is False
    assert last_event(seek)["result"] == 4  # requested 5, returned 5 xor 1
    assert seek.handles[handle][1] == 5

    readonly = RewardDiskMachine(image, {"C:\\A.TMP": b"abcdef"})
    assert readonly.call("probe_open", DX=path_addr(image, "path_a")) is False
    handle = last_event(readonly)["result"]
    assert readonly.call("probe_seek", BX=handle, CX=0, DX=2) is False
    assert readonly.call("probe_write", BX=handle, CX=3, DX=path_addr(image, "payload")) is True
    assert last_event(readonly)["result"] == 5
    assert readonly.files["C:\\A.TMP"] == bytearray(b"abcdef")
    assert readonly.handles[handle][1] == 2

    writer = RewardDiskMachine(image, {}, fault_at=1, fault="error", error=5)
    assert writer.call("probe_create", DX=path_addr(image, "path_a")) is True
    assert "C:\\A.TMP" not in writer.files

    short_writer = RewardDiskMachine(image, {}, fault_at=2, fault="short")
    assert short_writer.call("probe_create", DX=path_addr(image, "path_a")) is False
    handle = last_event(short_writer)["result"]
    assert short_writer.call("probe_write", BX=handle, CX=3, DX=path_addr(image, "payload")) is False
    assert [event["index"] for event in short_writer.events] == [1, 2]
    assert last_event(short_writer)["result"] == 2
    assert short_writer.files["C:\\A.TMP"] == bytearray(b"ab")
    assert short_writer.call("probe_close", BX=handle) is False

    closed = RewardDiskMachine(image, {"C:\\A.TMP": b"x"}, fault_at=2, fault="error", error=5)
    assert closed.call("probe_open", DX=path_addr(image, "path_a")) is False
    handle = last_event(closed)["result"]
    assert closed.call("probe_close", BX=handle) is True
    assert last_event(closed)["result"] == 5
    assert handle in closed.handles
    assert closed.call("probe_close", BX=handle) is False
    assert handle not in closed.handles

    writable = RewardDiskMachine(image, {}, fault_at=2, fault="error", error=5)
    assert writable.call("probe_create", DX=path_addr(image, "path_a")) is False
    handle = last_event(writable)["result"]
    assert writable.call("probe_close", BX=handle) is True
    assert handle in writable.handles and handle in writable.writable_handles
    assert writable.call("probe_write", BX=handle, CX=3, DX=path_addr(image, "payload")) is False
    assert writable.files["C:\\A.TMP"] == bytearray(b"abc")
    assert handle in writable.writable_handles
    assert writable.call("probe_close", BX=handle) is False
    assert handle not in writable.writable_handles


def test_zero_length_write_truncates_and_extends_at_seek_position(dos_probe_image):
    image = dos_probe_image
    truncated = RewardDiskMachine(image, {})
    assert truncated.call("probe_create", DX=path_addr(image, "path_a")) is False
    handle = last_event(truncated)["result"]
    assert truncated.call("probe_write", BX=handle, CX=3, DX=path_addr(image, "payload")) is False
    assert truncated.call("probe_seek", BX=handle, CX=0, DX=2) is False
    assert truncated.call("probe_write", BX=handle, CX=0, DX=path_addr(image, "payload")) is False
    assert truncated.files["C:\\A.TMP"] == bytearray(b"ab")
    assert truncated.call("probe_close", BX=handle) is False

    extended = RewardDiskMachine(image, {})
    assert extended.call("probe_create", DX=path_addr(image, "path_a")) is False
    handle = last_event(extended)["result"]
    assert extended.call("probe_write", BX=handle, CX=3, DX=path_addr(image, "payload")) is False
    assert extended.call("probe_seek", BX=handle, CX=0, DX=6) is False
    assert extended.call("probe_write", BX=handle, CX=0, DX=path_addr(image, "payload")) is False
    assert extended.files["C:\\A.TMP"] == bytearray(b"abc\0\0\0")
    assert extended.call("probe_close", BX=handle) is False


def test_invalid_handle_and_missing_parent_error_codes(dos_probe_image):
    image = dos_probe_image
    m = RewardDiskMachine(image, {})
    assert m.call("probe_close", BX=0x1234) is True
    assert last_event(m)["result"] == 6
    assert m.call("probe_seek", BX=0x1234, CX=0, DX=0) is True
    assert last_event(m)["result"] == 6

    missing_parent = RewardDiskMachine(image, {}, missing_parents=("C:",))
    assert missing_parent.call("probe_open", DX=path_addr(image, "path_a")) is True
    assert last_event(missing_parent)["result"] == 3
    assert missing_parent.call("probe_create", DX=path_addr(image, "path_a")) is True
    assert last_event(missing_parent)["result"] == 3


def test_readonly_attributes_owner_parent_file_absent_and_access(dos_probe_image):
    image = dos_probe_image
    owner = "C:\\SAVE\\OWNER.GSK"
    m = RewardDiskMachine(image, {owner: b"owned", "C:\\SAVE\\ITEM.GLB": b"item"})

    m.put("path_a", b"C:\\SAVE\\\0")
    assert m.call("probe_attribute", DX=path_addr(image, "path_a")) is False
    assert m.uc.reg_read(x86.UC_X86_REG_CX) == 0x10
    assert last_event(m)["path"] == "C:\\SAVE\\"

    m.put("path_a", owner.encode("ascii") + b"\0")
    assert m.call("probe_attribute", DX=path_addr(image, "path_a")) is False
    assert m.uc.reg_read(x86.UC_X86_REG_CX) == 0x20
    assert last_event(m)["path"] == owner

    m.put("path_a", b"C:\\SAVE\\MISSING.GSK\0")
    assert m.call("probe_attribute", DX=path_addr(image, "path_a")) is True
    assert last_event(m)["result"] == 2

    denied = RewardDiskMachine(image, {owner: b"owned"}, denied_paths=(owner,))
    denied.put("path_a", owner.encode("ascii") + b"\0")
    assert denied.call("probe_attribute", DX=path_addr(image, "path_a")) is True
    assert last_event(denied)["result"] == 5

    missing_parent = RewardDiskMachine(image, {}, missing_parents=("C:\\SAVE",))
    missing_parent.put("path_a", owner.encode("ascii") + b"\0")
    assert missing_parent.call("probe_attribute", DX=path_addr(image, "path_a")) is True
    assert last_event(missing_parent)["result"] == 3


def test_diskcut_snapshots_reboot_from_mutated_disk_only(dos_probe_image):
    image = dos_probe_image
    before = {"C:\\A.TMP": b"a"}
    cut = RewardDiskMachine(image, before, cut_after=1)
    with pytest.raises(DiskCut):
        cut.call("probe_rename", DX=path_addr(image, "path_a"), DI=path_addr(image, "path_b"))
    snapshot = cut.disk_snapshot()
    assert snapshot == {"C:\\B.TMP": b"a"}
    assert cut.mutations == 1
    assert len(cut.handles) == 0

    cold = RewardDiskMachine(image, snapshot)
    assert cold.disk_snapshot() == snapshot
    assert cold.handles == {} and cold.events == [] and cold.mutations == 0
    assert cold.get("scratch", 16) == bytes(16)
    assert cold.call("probe_open", DX=path_addr(image, "path_b")) is False
    assert last_event(cold)["path"] == "C:\\B.TMP"


def test_diskcut_after_successful_close_restarts_from_exact_file_map(dos_probe_image):
    image = dos_probe_image
    cut = RewardDiskMachine(image, {}, cut_after_call=3)
    assert cut.call("probe_create", DX=path_addr(image, "path_a")) is False
    handle = last_event(cut)["result"]
    assert cut.call("probe_write", BX=handle, CX=3, DX=path_addr(image, "payload")) is False
    with pytest.raises(DiskCut):
        cut.call("probe_close", BX=handle)
    assert last_event(cut)["index"] == 3 and last_event(cut)["carry"] is False
    assert handle not in cut.handles and handle not in cut.writable_handles
    snapshot = cut.disk_snapshot()
    assert snapshot == {"C:\\A.TMP": b"abc"}

    cold = RewardDiskMachine(image, snapshot)
    assert cold.disk_snapshot() == snapshot
    assert cold.handles == {} and cold.writable_handles == set() and cold.events == []
    assert cold.get("scratch", 16) == bytes(16)

    failed_close = RewardDiskMachine(image, {}, fault_at=3, fault="error", error=5)
    assert failed_close.call("probe_create", DX=path_addr(image, "path_a")) is False
    handle = last_event(failed_close)["result"]
    assert failed_close.call("probe_write", BX=handle, CX=3, DX=path_addr(image, "payload")) is False
    assert failed_close.call("probe_close", BX=handle) is True
    assert last_event(failed_close)["index"] == 3 and last_event(failed_close)["carry"] is True
    assert handle in failed_close.handles and handle in failed_close.writable_handles
    assert failed_close.disk_snapshot() == {"C:\\A.TMP": b"abc"}
