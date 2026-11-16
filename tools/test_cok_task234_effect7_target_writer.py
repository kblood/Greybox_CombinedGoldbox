"""Task 234: writers of the CoK effect-7 target pointer, with mutation controls.

Static layer needs retail GAME.OVR; trace layer needs the Task234 replay log in C:\\temp
(produced by `probe_cok_task234_effect7_target_writer.py --replay`, ~25 min, not vendored).
Each skips cleanly when its input is absent. Mutations edit COPIES only.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe_cok_task234_effect7_target_writer as p

OVR = p.GAME / "GAME.OVR"
need_ovr = pytest.mark.skipif(not OVR.exists(), reason="retail GAME.OVR absent")
need_trace = pytest.mark.skipif(not p.OUT.exists(), reason="Task234 replay log absent")


def failed(res):
    return [n for n, ok, _ in res if not ok]


def trace():
    return p.OUT.read_text(encoding="latin1")


@need_ovr
def test_static_holds():
    res = p.static_checks(OVR.read_bytes())
    assert len(res) == 9 and not failed(res)


@need_ovr
@pytest.mark.parametrize("ip,name", [(0x123C + 1, "123C/1240"), (0x1251 + 1, "1251"),
                                     (0x410C + 1, "410C/4110"), (0x4143 + 1, "4143"),
                                     (0x4151 + 1, "4151/4155"), (0x4134 + 1, "4134")])
def test_static_mutation_goes_red(ip, name):
    b = bytearray(OVR.read_bytes())
    b[p.MOD + ip] ^= 0x01
    assert any(name in n for n in failed(p.static_checks(bytes(b)))), name


@need_trace
def test_trace_holds():
    res, bw = p.trace_checks(trace())
    assert len(res) == 10 and not failed(res)
    assert len(p.parse(trace())) == 20 and len(bw) == 32


@need_trace
@pytest.mark.parametrize("old,new,expect", [
    ("instr=68559074 CS:IP=47A3:1240", "instr=68559075 CS:IP=47A3:1240", "FIRST writer"),
    ("instr=68559074 CS:IP=47A3:1240", "instr=68559074 CS:IP=47A3:1241", "FIRST writer"),
    ("instr=68559115 CS:IP=47A3:4155", "instr=68559115 CS:IP=47A3:4156", "complete 47A3 writer sequence"),
    ("instr=68559097 CS:IP=47A3:1263 addr=399556 size=2 old=016c new=0000",
     "instr=68559097 CS:IP=47A3:1263 addr=399556 size=2 old=016c new=016c", "rolled back"),
    ("instr=68559074 CS:IP=47A3:1240 addr=399556 size=2 old=0000 new=016c",
     "instr=68559074 CS:IP=47A3:1240 addr=399556 size=2 old=0000 new=026c", "FIRST writer"),
])
def test_trace_mutation_goes_red(old, new, expect):
    text = trace()
    assert text.count(old) == 1, old
    assert any(expect in n for n in failed(p.trace_checks(text.replace(old, new))[0])), expect


@need_trace
def test_instrument_removed_goes_red():
    # Deleting the watch output must not leave a vacuous pass.
    text = "\n".join(l for l in trace().split("\n") if not l.startswith("TASK234_WRITE"))
    assert "write watch produced events (instrument ran)" in failed(p.trace_checks(text)[0])


@need_trace
def test_late_writer_goes_red():
    text = trace().replace("instr=68777198", "instr=69999999")
    assert failed(p.trace_checks(text)[0])
