"""Task 233: effect-7 allocator / target-pointer operand joins, with mutation controls.

Static layer needs the retail GAME.OVR; trace layer needs the Task232 trace in C:\\temp
(not vendored). Each skips when its input is absent. Mutations edit a COPY (never retail).
"""
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe_cok_task233_effect7_operand_joins as p

OVR = p.GAME / "GAME.OVR"
need_ovr = pytest.mark.skipif(not OVR.exists(), reason="retail GAME.OVR absent")
need_trace = pytest.mark.skipif(not p.TRACE.exists(), reason="Task232 trace absent")


def failed(res):
    return [n for n, ok, _ in res if not ok]


@need_ovr
def test_static_joins_hold():
    res = p.static_checks(OVR.read_bytes())
    assert len(res) == 13 and not failed(res)


@need_ovr
@pytest.mark.parametrize("off,name", [(0xF2B0, "F2AF"), (0xF2B5, "F2B4"), (0x168BC, "168BB"),
                                      (0x168C0, "168BF"), (0xF2A8, "F2A7"), (0x168AE, "168AD")])
def test_static_mutation_goes_red(off, name):
    b = bytearray(OVR.read_bytes())
    b[off] ^= 0x01
    bad = failed(p.static_checks(bytes(b)))
    assert any(name in n for n in bad), (name, bad)


@need_trace
def test_trace_joins_hold():
    res = p.trace_checks(p.TRACE.read_text(encoding="latin1"))
    assert len(res) == 10 and not failed(res)


@need_trace
@pytest.mark.parametrize("old,new,expect", [
    ("ES:DI=62FD:0000 SS:SP=2491:3D98 stack24=32030000fd62", "ES:DI=62FE:0000 SS:SP=2491:3D98 stack24=32030000fd62", "F2B4 hit"),
    ("ES:DI=618B:0008", "ES:DI=618C:0008", "F2C1 hit"),
    ("016c0000fd620001 ".strip(), "016c0000fd630001", "entry SP+12"),
])
def test_trace_mutation_goes_red(old, new, expect):
    text = p.TRACE.read_text(encoding="latin1")
    assert old in text
    # mutate only the line carrying the selected-instruction anchor where relevant
    bad = failed(p.trace_checks(text.replace(old, new, 1) if "fd620001" not in old else
                                _mutate_entry(text, old, new)))
    assert any(expect in n for n in bad), (expect, bad)


def _mutate_entry(text, old, new):
    lines = text.split("\n")
    for i, l in enumerate(lines):
        if l.startswith("TASK232_CALLSITE D13_ATTACK_ENTRY ") and l.rstrip().endswith("instr=%d" % p.ENTRY_INSTR):
            lines[i] = l.replace("fd620001", "fd630001")
    return "\n".join(lines)


@need_trace
def test_trace_writer_mutation_goes_red():
    text = p.TRACE.read_text(encoding="latin1")
    # change the 1B51 writer ip to 1B50 (6993 -> 6992) in the selected context's watch only
    mut = re.sub(r"('ip': )6993(, 'instr': 68777197)", r"\g<1>6992\2", text)
    assert mut != text
    assert any("latest writers" in n for n in failed(p.trace_checks(mut)))
    # and moving the write outside the invocation window
    mut2 = text.replace("'instr': 68777197", "'instr': 69999999")
    assert any("inside the selected" in n for n in failed(p.trace_checks(mut2)))
