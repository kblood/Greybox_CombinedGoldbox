"""Byte-level pins for dqk_npc_turn.py, with mutation controls on in-memory copies."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
pytest.importorskip("capstone")
import dqk_npc_turn as t  # noqa: E402

needs_exe = pytest.mark.skipif(not t.EXE.exists(), reason="DQK.EXE not present")
needs_moncha = pytest.mark.skipif(not t.MONCHA.exists(), reason="MONCHA.GLB not present")


@pytest.fixture(scope="module")
def exe():
    return t.EXE.read_bytes()


@needs_exe
def test_all_pins_hold(exe):
    assert t.check(exe) == []
    assert len(t.PINS) == 20


@needs_exe
@pytest.mark.parametrize("name", sorted(t.PINS))
def test_each_pin_fails_when_its_bytes_are_perturbed(exe, name):
    """Mutation control: flip one byte of the first pinned instruction in a copy."""
    first = min(t.PINS[name][2])
    mut = bytearray(exe)
    mut[first] ^= 0xFF
    assert name in t.check(bytes(mut))
    assert t.check(exe) == []  # original untouched


@needs_exe
def test_ai_stub_is_overlay2_entry(exe):
    stub = t.AI_STUB_FILE
    assert exe[stub:stub + 3] == bytes.fromhex("e88bf6") or exe[stub] == 0xE8
    assert exe[stub + 3] == 0xEA
    assert int.from_bytes(exe[stub + 4:stub + 6], "little") == 0
    assert int.from_bytes(exe[stub + 6:stub + 8], "little") == 0x28D0


@needs_exe
def test_item_gate_function_is_not_turn_dispatch(exe):
    """0x5ED25 gates on the ACTOR's +0x18C and item node fields, not turn order:
    it never touches the initiative key (+0x40 -> +3)."""
    body = exe[t.ITEM_GATE_FN:t.ITEM_GATE_FN + 0x300]
    assert bytes.fromhex("c41e67ad") in body  # les bx,[0xad67]
    assert bytes.fromhex("26c45f40") not in body  # no les bx,es:[bx+0x40]


@needs_exe
@needs_moncha
def test_gnome_id68_control_chain():
    r = t.moncha_record(68)
    assert (r[0x28], r[0x37], r[0x38]) == (0, 0, 0)
    assert r[0x66] == 0 and r[0x9B] == 0x80
    assert t.control_byte(r[0x66], r[0x9B]) == 0x80  # nonzero -> AI branch
    # model controls: a PC-side record with +0x9B < 0x80 is human
    assert t.control_byte(0, 0x00) == 0
    assert t.control_byte(1, 0x00) == 1


def test_doc_keeps_placeholder_and_names_scheduler():
    doc = (t.ROOT / "docs/engine/research/dqk-npc-combat-route.md").read_text(encoding="utf-8")
    assert "DQK_NPC_TURN_SCHEDULE_UNRESOLVED" in doc
    assert "Turn scheduler located" in doc
    for needle in ("0x22B8B", "0x29B32", "0x24EB6", "+0x18C"):
        assert needle in doc
