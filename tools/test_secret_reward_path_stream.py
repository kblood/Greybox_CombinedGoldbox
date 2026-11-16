"""Native view-aware raw-path helper; whole relation cleanup is a separate gate."""
from pathlib import Path
import re
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.secret_reward_dos_fixture import RewardDiskMachine


EXPORTS = ("rv_match_view_paths", "rv_paths", "kc_cmp", "kc_buf", "kc_open", "kc_close",
           "kc_view_begin", "kc_view_end", "kc_view_active", "kc_view_base",
           "kc_extent", "kc_view_parent_extent", "kc_fh", "input_path")


@pytest.fixture(scope="module")
def path_image(tmp_path_factory):
    src = Path(__file__).resolve().parents[1] / "native/src"
    source = (src / "secretreward_admission.inc").read_text()
    match = re.search(r"(?ms)^rv_match_view_paths:\n(.*?)(?=^%endif\s*$)", source)
    assert match and match.group(1).rstrip().endswith("ret")
    folder = tmp_path_factory.mktemp("view-path-stream")
    asm, binary = folder / "probe.asm", folder / "probe.bin"
    asm.write_text("cpu 386\nbits 16\norg 100h\ndw " + ",".join(EXPORTS)
                   + '\n%include "secretcontinuation_io.inc"\n'
                   + "rv_match_view_paths:\n" + match.group(1)
                   + "rv_paths times 1232 db 0\nrv_compare_offset dd 0\n"
                   + "rv_compare_left dd 0\nrv_compare_memory_offset dw 0\n"
                   + "rv_compare_chunk dw 0\ninput_path db 'C:\\PARENT.BIN',0\n")
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(asm),
                          "-o", str(binary)], capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    return raw, dict(zip(EXPORTS, struct.unpack_from("<" + "H" * len(EXPORTS), raw)))


def opened(path_image, *, change=None, length=1400, active=True):
    paths = b"".join((f"C:\\PATH{i}.BIN".encode().ljust(112, b"\0")) for i in range(10))
    nested = bytearray(b"h" * 64 + paths + b"nested opaque suffix" * 20)
    if change == "case":
        nested[64] = ord("c")
    elif change is not None:
        nested[64 + change] ^= 1
    prefix = b"unrelated outer prefix" * 7
    files = {"C:\\PARENT.BIN": prefix + nested + b"unrelated outer suffix"}
    m = RewardDiskMachine(path_image, files)
    m.put("rv_paths", paths + b"D:\\ITEM.GLB\0".ljust(112, b"\0"))
    assert not m.call("kc_open", DX=m.labels["input_path"])
    parent_extent = m.get("kc_extent", 4)
    if active:
        assert not m.call("kc_view_begin", EAX=len(prefix), EDX=length)
    return m, len(prefix), parent_extent


def compared(m, prefix, parent_extent, *, effect=None, call_index=None, active=True, es=None):
    paths = m.get("rv_paths", 1232)
    files = m.disk_snapshot()
    start = len(m.events)
    view = (m.get("kc_view_active",1), m.get("kc_view_base",4), m.get("kc_extent",4))
    handle = m.get("kc_fh",2)
    ordinary_buffer = m.get("kc_buf",512)
    # The preceding512-byte KC buffer and following native code are separate
    # from the streamed read destination; their bytes must survive.
    scratch = m.labels["kc_cmp"]
    neighbors = (bytes(m.uc.mem_read(0x10000+scratch-8,8)),
                 bytes(m.uc.mem_read(0x10000+scratch+512,8)))
    if effect is not None:
        m.fault_at, m.protocol_fault = start + call_index, effect
    bad = m.call("rv_match_view_paths", **({"ES":es} if es is not None else {}))
    assert m.get("rv_paths",1232) == paths
    assert m.disk_snapshot() == files and not m.mutations
    assert m.get("kc_fh",2) == handle
    assert m.get("kc_buf",512) == ordinary_buffer
    assert bytes(m.uc.mem_read(0x10000+scratch-8,8)) == neighbors[0]
    assert bytes(m.uc.mem_read(0x10000+scratch+512,8)) == neighbors[1]
    assert (m.get("kc_view_active",1),m.get("kc_view_base",4),m.get("kc_extent",4)) == view
    events = m.events[start:]
    m.fault_at = None
    if active:
        assert not m.call("kc_view_end")
        assert m.get("kc_view_active",1) == b"\0"
        assert m.get("kc_view_base",4) == bytes(4)
        assert m.get("kc_extent",4) == parent_extent
    assert not m.call("kc_close") and not m.handles
    return bad, events


def test_exact_chunk_addresses_and_lengths(path_image):
    m, prefix, extent = opened(path_image)
    bad, events = compared(m, prefix, extent)
    assert not bad
    seeks = [e for e in events if e["ax"] == 0x4200]
    assert [(e["cx"] << 16) + e["dx"] for e in seeks] == [prefix+64,prefix+576,prefix+1088]
    reads = [e for e in events if e["ax"] >> 8 == 0x3f]
    assert [(e["dx"],e["cx"]) for e in reads] == [(m.labels["kc_cmp"],512),(m.labels["kc_cmp"],512),(m.labels["kc_cmp"],96)]


@pytest.mark.parametrize("position", ["case",0,1,112,511,512,1023,1024,1119])
def test_raw_case_padding_and_boundary_changes_refuse(path_image, position):
    m, prefix, extent = opened(path_image, change=position)
    assert compared(m,prefix,extent)[0]


@pytest.mark.parametrize("chunk", [0,1,2])
@pytest.mark.parametrize("operation,effect", [(1,"error"),(1,"bad-position"),(2,"error"),(2,"short")])
def test_each_chunk_io_failure_preserves_view_for_caller(path_image, chunk, operation, effect):
    m, prefix, extent = opened(path_image)
    assert compared(m,prefix,extent,effect=effect,call_index=chunk*2+operation)[0]


def test_short_view_never_borrows_outer_bytes(path_image):
    m,prefix,extent = opened(path_image,length=1183)
    bad,events = compared(m,prefix,extent)
    assert bad and [e["cx"] for e in events if e["ax"]>>8==0x3f] == [512,512]


@pytest.mark.parametrize("active,es", [(False,None),(True,0x2000)])
def test_helper_contract_failure_performs_no_io(path_image, active, es):
    m,prefix,extent = opened(path_image,active=active)
    bad,events = compared(m,prefix,extent,active=active,es=es)
    assert bad and not events
