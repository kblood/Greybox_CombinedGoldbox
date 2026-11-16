"""Compiled read-only fixed-gift admission; general host mutation stays closed."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")

from tools.test_secret_continuation_io import Machine, BASE

EXPORTS = ("rv_check_gift_dispatch", "kv_check_readonly_dispatch", "kc_open",
           "kc_close", "kc_view_begin", "kc_view_end", "kc_verified",
           "kc_extent", "kc_view_active", "kr_header", "kr_offsets",
           "kv_stream_count", "input_path", "owned_end")


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp("reward-admission-private")
    source, binary = folder / "probe.asm", folder / "probe.bin"
    source.write_text("cpu 386\nbits 16\norg 100h\ndw " + ",".join(EXPORTS) + '''
%include "ccnext.asm"
%include "secretreward_record.inc"
%include "secretreward_names.inc"
%include "secretreward_resource.inc"
%include "secretreward_party.inc"
%include "secretreward_currency.inc"
%include "secretreward_xp.inc"
%include "secretreward_roster.inc"
%include "secretreward_state.inc"
%include "secretreward_replay.inc"
%include "secretreward_write.inc"
%include "secretreward_admission.inc"
input_path db 'C:\\EVENTS.BIN',0
times 512 db 0
owned_end:
''', encoding="ascii")
    root = Path(__file__).resolve().parents[1]
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    run = subprocess.run([nasm, "-I", str(root / "native/src") + "/", "-f", "bin",
                          str(source), "-o", str(binary)], capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    assert len(raw) + 256 < 65536
    return raw, dict(zip(EXPORTS, struct.unpack_from("<" + "H" * len(EXPORTS), raw)))


def row(opcode=0x27, argc=8, args=(0, 0, 0, 0, 0, 20, 0, 18)):
    return struct.pack("<10H", opcode, argc, *args)


def inspect(image, rows, *, stream=0, npc=0, fault=None, legacy_reject=False):
    # Event policy consumes already admitted records. The private stream fixture
    # models its read-only nested window, without claiming complete GSK authority.
    payload = b"GBSL" + struct.pack("<HH", stream or 1, len(rows))
    payload += b"".join(r + bytes(34) for r in rows)
    parent = b"unrelated prefix" + payload + b"unrelated suffix"
    m = Machine(image, {"C:\\EVENTS.BIN": parent})
    assert not m.call("kc_open", DX=m.labels["input_path"])
    if stream:
        assert not m.call("kc_view_begin", EAX=16, EDX=len(payload))
    m.put("kr_header", bytes(64))
    m.put("kr_offsets", bytes(36))
    m.put("kv_stream_count", struct.pack("<H", len(rows)))
    if stream:
        m.uc.mem_write(BASE + m.labels["kr_header"] + 56, struct.pack("<I", len(payload)))
    fx = bytearray(5948)
    struct.pack_into("<H", fx, 82, npc)
    # Terminal inline rows may differ from the earlier authoritative stream rows.
    inline = rows[-64:] if stream else rows
    struct.pack_into("<H", fx, 2250, len(inline))
    for i, data in enumerate(inline): fx[2252 + 20*i:2272 + 20*i] = data
    m.uc.mem_write(0x40000 + 40000, bytes(fx))
    before = dict(m.files)
    m.put("kc_verified", b"\1\0")
    if fault: m.fault = fault
    bad = m.call("rv_check_gift_dispatch", FS=0x4000)
    assert m.get("kc_verified", 2) == bytes(2)
    assert bytes(m.uc.mem_read(0x40000 + 40000, 5948)) == bytes(fx)
    assert m.files == before
    assert all(e["ax"] >> 8 not in (0x3c, 0x40, 0x41, 0x56) for e in m.events)
    if legacy_reject:
        assert not bad
        assert m.call("kv_check_readonly_dispatch", FS=0x4000)
    m.fault = None
    if stream:
        assert m.get("kc_view_active", 1) == b"\1"
        assert not m.call("kc_view_end")
    assert m.get("kc_extent", 4) == struct.pack("<I", len(parent))
    assert not m.call("kc_close") and not m.handles
    return bad


@pytest.mark.parametrize("stream", [0, 1, 2])
def test_exact_retained_gift_and_legacy_mutation_barrier(image, stream):
    assert not inspect(image, [row(0x1c, 0), row(), row(0x24, 0)], stream=stream,
                       legacy_reject=True)


@pytest.mark.parametrize("stream", [0, 1, 2])
@pytest.mark.parametrize("field", range(1, 10))
def test_all_required_argument_words_are_exact(image, stream, field):
    data = bytearray(row()); data[2*field] ^= 1
    assert inspect(image, [bytes(data)], stream=stream)


@pytest.mark.parametrize("stream", [0, 1, 2])
@pytest.mark.parametrize("case", ["absent", "duplicate", "npc", 0x28, 0x2e, 0x36, 0x41])
def test_unrelated_mutations_and_missing_or_repeated_gift_reject(image, stream, case):
    rows = [row()]; npc = 0
    if case == "absent": rows = [row(0x24, 0)]
    elif case == "duplicate": rows += [row()]
    elif case == "npc": npc = 1
    else: rows += [row(case, 0)]
    assert inspect(image, rows, stream=stream, npc=npc)


def test_stream_prefix_is_inspected_beyond_terminal_inline_chunk(image):
    rows = [row()] + [row(0x11, 0)] * 65
    assert not inspect(image, rows, stream=2)
    rows[0] = row(0x41, 0)
    rows[1] = row()
    assert inspect(image, rows, stream=2)


@pytest.mark.parametrize("fault", ["seek", "read", "short-read"])
def test_event_stream_checked_io_rejects_without_mutation(image, fault):
    assert inspect(image, [row()], stream=2, fault=fault)
