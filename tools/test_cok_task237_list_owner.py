"""Task 237: owner of the CoK DS:609A list (append/remove/reorder routines, allocators, callers), with mutation controls.

Static layer needs retail GAME.OVR (+ START.EXE for the descriptor chain); trace layer needs the Task237 replay
log in C:\\temp (produced by `probe_cok_task237_list_owner.py --replay`, ~25 min, not vendored). Each skips
cleanly when its input is absent. Mutations edit COPIES only.
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import probe_cok_task237_list_owner as p

OVR = p.GAME / "GAME.OVR"
START = p.GAME / "START.EXE"
need_ovr = pytest.mark.skipif(not OVR.exists(), reason="retail GAME.OVR absent")
need_start = pytest.mark.skipif(not (OVR.exists() and START.exists()), reason="retail START.EXE/GAME.OVR absent")
need_trace = pytest.mark.skipif(not p.OUT.exists(), reason="Task237 replay log absent")


def failed(res):
    return [n for n, ok, _ in res if not ok]


def start_image():
    from tools.exepack_unpack import unpack
    return unpack(START)[0]


def trace():
    return p.OUT.read_text(encoding="latin1")


@need_start
def test_static_holds_with_descriptor_chain():
    res = p.static_checks(OVR.read_bytes(), start_image())
    assert len(res) == 40 and not failed(res)


@need_ovr
def test_static_holds_without_start_image():
    res = p.static_checks(OVR.read_bytes())
    assert len(res) == 37 and not failed(res)


@need_ovr
@pytest.mark.parametrize("off,frag", [
    (p.OVR17 + 0x19A7, "609A store 1F082"),               # head store opcode
    (p.OVR17 + 0x1989, "1989 prologue"),
    (p.OVR17 + 0x19EA, "19EA tail link"),
    (p.OVR17 + 0x1910, "1910 push 199h"),
    (p.OVR17 + 0x1F52, "1F52"),
    (p.OVR17 + 0x193F, "193F near call"),
    (p.OVR2 + 0x3139, "9A 43 00 9E 00"),                  # the single far caller of 18FC
    (p.OVR18 + 0x38DD, "9A 52 00 9E 00"),
    (p.OVR18 + 0x3C04, "609A store 23E0D"),
    (p.OVR16 + 0x1DAC, "609A store 1C41A"),
    (p.OVR16 + 0x1ECD, "609A store 1C53B"),
    (p.OVR11 + 0x09AE, "609A store 10A46"),
    (p.OVR10 + 0x1C37, "1C32"),
])
def test_static_mutation_goes_red(off, frag):
    b = bytearray(OVR.read_bytes())
    b[off] ^= 0x01
    assert any(frag in n for n in failed(p.static_checks(bytes(b)))), frag


@need_ovr
def test_new_far_caller_of_18fc_goes_red():
    b = bytearray(OVR.read_bytes())
    b[0x100:0x105] = b"\x9a\x43\x00\x9e\x00"
    assert any("far call 18FC" in n for n in failed(p.static_checks(bytes(b))))


@need_ovr
def test_new_next_link_store_routine_goes_red():
    b = bytearray(OVR.read_bytes())
    b[p.OVR2 + 0x2800:p.OVR2 + 0x2805] = bytes.fromhex("2689857f01")   # inside an unrelated ovr2 routine
    assert any("storing the +17F" in n for n in failed(p.static_checks(bytes(b))))


@need_ovr
def test_new_609a_store_site_goes_red():
    b = bytearray(OVR.read_bytes())
    b[0x100:0x103] = b"\xa3\x9a\x60"
    assert any("sites in GAME.OVR" in n for n in failed(p.static_checks(bytes(b))))


@need_ovr
def test_old_base_0x1aa73_is_not_the_executed_site():
    ovr = OVR.read_bytes()
    # Task236 used base 0x1AA73: there 36AA:19AE is `mov ax,[6096]` (a1 96 60), not the replay's `eb 44`
    assert ovr[0x1AA73 + 0x19AE:0x1AA73 + 0x19B1] == bytes.fromhex("a19660")
    assert ovr[p.OVR17 + 0x19AE:p.OVR17 + 0x19B0] == bytes.fromhex("eb44")


# ------------------------------------------------------------ trace layer
@need_trace
def test_trace_holds():
    res = p.trace_checks(trace())
    assert len(res) == 13 and not failed(res)


def _red(text, frag):
    return any(frag in n for n in failed(p.trace_checks(text)))


@need_trace
@pytest.mark.parametrize("old,new,frag", [
    ("instr=27666561 ", "instr=27666560 ", "19A7"),                    # head-store instr moved
    ("instr=27927601 ", "instr=27927602 ", "19EF"),                    # tail link moved
    ("instr=51402630 ", "instr=51402631 ", "each chain link"),         # ovr2 link store moved
    ("instr=51003080 ", "instr=51003081 ", "routine 0465"),
    ("instr=54873627 ", "instr=54873626 ", "node 15"),
    ("instr=27639478 ", "instr=27639477 ", "18FC entered"),
])
def test_trace_mutation_goes_red(old, new, frag):
    t = trace()
    assert old in t
    assert _red(t.replace(old, new), frag), frag


@need_trace
def test_trace_without_instruments_goes_red():
    t = "\n".join(l for l in trace().split("\n") if not l.startswith("TASK237_LINKW"))
    assert _red(t, "instruments ran")


@need_trace
def test_trace_spurious_overlay_filter_matters():
    # relabel one non-overlay-17 hit's code bytes as overlay 17: the genuine-hit count (15) must break
    t = trace()
    lines = t.split("\n")
    for i, l in enumerate(lines):
        if l.startswith("TASK237_HOOK ip=18FC") and "code=5589e5" not in l:
            lines[i] = l.replace(l.split("code=")[1].split(" ")[0], "5589e5", 1)
            break
    else:
        pytest.skip("no spurious 18FC hit")
    assert _red("\n".join(lines), "36AA is shared")
