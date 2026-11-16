"""Task 236: DS:609A/609C writers and how [bp-0B]=9 arises in the CoK effect-7 table routine, with mutation controls.

Static layer needs retail GAME.OVR; trace layer needs the Task236 replay log in C:\\temp
(produced by `probe_cok_task236_effect7_source_global.py --replay`, ~25 min, not vendored).
Each skips cleanly when its input is absent. Mutations edit COPIES only.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe_cok_task236_effect7_source_global as p

OVR = p.GAME / "GAME.OVR"
need_ovr = pytest.mark.skipif(not OVR.exists(), reason="retail GAME.OVR absent")
need_trace = pytest.mark.skipif(not p.OUT.exists(), reason="Task236 replay log absent")


def failed(res):
    return [n for n, ok, _ in res if not ok]


def trace():
    return p.OUT.read_text(encoding="latin1")


@need_ovr
def test_static_holds():
    res = p.static_checks(OVR.read_bytes())
    assert len(res) == 13 and not failed(res)


@need_ovr
@pytest.mark.parametrize("base,ip,frag", [
    (p.MOD33A8, 0x1D41, "1D3F"), (p.MOD33A8, 0x17F7, "17F7"), (p.MOD33A8, 0x180A, "180A"),
    (p.MOD33A8, 0x1BA0, "1BA0"), (p.MOD33A8, 0x1C15, "1C15"), (p.MOD33A8, 0x19EF, "19EF"),
    (p.MOD33A8, 0x1C1C, "1C1C"), (p.MOD36AA, 0x19A7, "19A7"), (p.MOD36AA, 0x1986, "1986"),
    (p.MOD30A9, 0x0571, "0571")])
def test_static_mutation_goes_red(base, ip, frag):
    b = bytearray(OVR.read_bytes())
    b[base + ip] ^= 0x01
    assert any(frag in n for n in failed(p.static_checks(bytes(b)))), frag


@need_ovr
def test_new_store_to_bp_minus_0b_goes_red():
    b = bytearray(OVR.read_bytes())
    at = p.MOD33A8 + 0x1B00          # plant `mov [bp-0B],al` (88 46 f5) over three bytes mid-routine
    b[at:at + 3] = b"\x88\x46\xf5"
    assert any("[bp-0B]" in n for n in failed(p.static_checks(bytes(b))))


@need_ovr
def test_extra_609a_store_site_goes_red():
    b = bytearray(OVR.read_bytes())
    b[0x100:0x103] = b"\xa3\x9a\x60"
    assert any("609A" in n for n in failed(p.static_checks(bytes(b))))


@need_trace
def test_trace_holds():
    res = p.trace_checks(trace())
    assert len(res) == 12 and not failed(res)
    assert len(p.parse_writes(trace())) == 4 and len(p.parse_hooks(trace())) == 51


@need_trace
@pytest.mark.parametrize("old,new,expect", [
    ("instr=27666562 CS:IP=36AA:19AA", "instr=27666562 CS:IP=36AA:19AB", "exactly 4 writes"),
    ("instr=54681002 CS=33A8", "instr=54681004 CS=33A8", "caller 33A8:1D41"),
    ("instr=54712653 CS=33A8 k=ff", "instr=54712653 CS=33A8 k=fe", "19EF once"),
    ("instr=54755062 CS=33A8 k=09", "instr=54755063 CS=33A8 k=09", "k=9 store"),
    ("node=0000016c", "node=0000026c", "1A33 stores 15"),
    ("instr=54755011 CS=33A8", "instr=54755012 CS=33A8", "steps only at 1BA0"),
])
def test_trace_mutation_goes_red(old, new, expect):
    text = trace()
    assert text.count(old) >= 1, old
    assert any(expect in n for n in failed(p.trace_checks(text.replace(old, new)))), expect


@need_trace
def test_late_write_to_head_goes_red():
    line = next(l for l in trace().split("\n") if l.startswith("TASK236_WRITE") and "36AA:19AA" in l)
    late = line.replace("instr=27666562", "instr=54700000")
    text = trace().replace(line, late)
    assert any("precedes the routine entry" in n for n in failed(p.trace_checks(text)))


@need_trace
def test_instrument_removed_goes_red():
    text = "\n".join(l for l in trace().split("\n") if not l.startswith("TASK236_HOOK"))
    assert "code hooks in 33A8 fired (instrument ran)" in failed(p.trace_checks(text))
    text = "\n".join(l for l in trace().split("\n") if not l.startswith("TASK236_WRITE"))
    assert "write watch produced events (instrument ran)" in failed(p.trace_checks(text))


@need_trace
def test_hook_line_removed_goes_red():
    text = "\n".join(l for l in trace().split("\n") if not ("TASK236_HOOK ip=1A33 n=9 " in l))
    assert failed(p.trace_checks(text))
