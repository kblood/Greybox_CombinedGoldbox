"""Task 235: writer of the CoK effect-7 far-pointer table entry DS:[68D1+4k], with mutation controls.

Static layer needs retail GAME.OVR; trace layer needs the Task235 replay log in C:\\temp
(produced by `probe_cok_task235_effect7_table_writer.py --replay`, ~25 min, not vendored).
Each skips cleanly when its input is absent. Mutations edit COPIES only.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe_cok_task235_effect7_table_writer as p

OVR = p.GAME / "GAME.OVR"
need_ovr = pytest.mark.skipif(not OVR.exists(), reason="retail GAME.OVR absent")
need_trace = pytest.mark.skipif(not p.OUT.exists(), reason="Task235 replay log absent")


def failed(res):
    return [n for n, ok, _ in res if not ok]


def trace():
    return p.OUT.read_text(encoding="latin1")


@need_ovr
def test_static_holds():
    res = p.static_checks(OVR.read_bytes())
    assert len(res) == 4 and not failed(res)


@need_ovr
@pytest.mark.parametrize("ip,name", [(0x1A33 + 1, "1A33/1A37"), (0x1A22 + 1, "1A22"),
                                     (0x1A28 + 1, "1A28"), (0x19F8 + 1, "19F8")])
def test_static_mutation_goes_red(ip, name):
    b = bytearray(OVR.read_bytes())
    b[p.MOD33A8 + ip] ^= 0x01
    assert any(name in n for n in failed(p.static_checks(bytes(b)))), name


@need_trace
def test_trace_holds():
    res, bw, h = p.trace_checks(trace())
    assert len(res) == 10 and not failed(res)
    assert h["k"] == 9 and h["instr"] == 68_558_833 and len(p.parse_hits(trace())) == 4
    assert len(bw) == 4 and {w[1] for w in bw} == {54_755_062, 54_755_063}


@need_trace
@pytest.mark.parametrize("k", [8, 10, 0])
def test_wrong_k_goes_red(k):
    res, _, _ = p.trace_checks(trace(), k_override=k)
    assert failed(res)


@need_trace
@pytest.mark.parametrize("delta", [4, -4, 2, 0x100])
def test_wrong_table_base_goes_red(delta):
    res, _, _ = p.trace_checks(trace(), base_override=p.TABLE_LO + delta)
    assert failed(res)


@need_trace
@pytest.mark.parametrize("old,new,expect", [
    ("instr=54755063 CS:IP=33A8:1A37", "instr=54755063 CS:IP=33A8:1A38", "exactly 2 writes"),
    ("instr=54755062 CS:IP=33A8:1A33", "instr=54755062 CS:IP=33A8:1A34", "exactly 2 writes"),
    ("AX=0009 BX=6C01 CX=0000", "AX=0009 BX=6C02 CX=0000", "source operand"),
])
def test_trace_mutation_goes_red(old, new, expect):
    text = trace()
    assert text.count(old) >= 1, old
    assert any(expect in n for n in failed(p.trace_checks(text.replace(old, new))[0])), expect


@need_trace
def test_instrument_removed_goes_red():
    text = "\n".join(l for l in trace().split("\n") if not l.startswith(("TASK235_WRITE", "TASK235_HIT")))
    assert "code hook at 47A3:4114 fired (instrument ran)" in failed(p.trace_checks(text)[0])
    text = "\n".join(l for l in trace().split("\n") if not l.startswith("TASK235_WRITE"))
    assert "write watch produced events (instrument ran)" in failed(p.trace_checks(text)[0])


@need_trace
def test_hit_line_removed_goes_red():
    text = "\n".join(l for l in trace().split("\n") if not ("TASK235_HIT" in l and " k=9 " in l))
    assert failed(p.trace_checks(text)[0])
