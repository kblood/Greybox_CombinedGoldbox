"""Treasures of the Savage Frontier opcode 0x31 contract (NATIVE-TASKS item 53).

Static only.  Verdict doc: docs/engine/research/treasures-short-menu-0x31-2026-10-07.md.
Skips cleanly when the GOG install is absent.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

PID = "treasures-of-the-savage-frontier"
DEFAULT = Path(r"C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier")
GAME = Path(os.environ.get("GB_TREASURES_DIR", DEFAULT))
OVR = GAME / "GAME.OVR"
ECL = GAME / "ECL1.DAX"

pytestmark = pytest.mark.skipif(
    not (OVR.is_file() and ECL.is_file()), reason="Treasures DOS data not present"
)

DISPATCH = 0x319E
HANDLER = 0x16B7


def _dispatch_target(ovr: bytes, opcode: int, start: int = DISPATCH) -> tuple[int, int]:
    """Return (handler_offset, pushed_flag) from the `cmp al,op` arm; flag -1 if none."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    insns = list(md.disasm(ovr[start : start + 0x400], start))
    for n, ins in enumerate(insns):
        if ins.mnemonic == "cmp" and ins.op_str == f"al, {opcode:#x}":
            flag = -1
            for j in insns[n + 2 : n + 8]:
                if j.mnemonic == "mov" and j.op_str.startswith("al, ") and flag < 0:
                    flag = int(j.op_str[4:], 0)
                if j.mnemonic == "call":
                    return int(j.op_str, 0), flag
    raise AssertionError(f"no dispatch arm for {opcode:#x}")


def _handler_frame(ovr: bytes, handler: int) -> dict[str, bool]:
    """Structural facts of the shared menu handler (operand-parser use, count read)."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    seq = []
    for ins in md.disasm(ovr[handler : handler + 0x200], handler):
        seq.append((ins.mnemonic, ins.op_str))
        if ins.mnemonic == "retf":
            break
    text = [f"{a} {b}" for a, b in seq]

    def has(*pat: str) -> bool:
        for i in range(len(text) - len(pat) + 1):
            if all(text[i + k] == pat[k] for k in range(len(pat))):
                return True
        return False

    return {
        "prologue": text[:2] == ["push bp", "mov bp, sp"],
        # parser(2): load exactly two operands (dest, count)
        "parse_two": has("mov al, 2", "push ax", "lcall 0x58, 0x2a"),
        # read operand-2's value (the label count), then parse that many more
        "read_count": has("mov al, 2", "push ax", "lcall 0x58, 0x25"),
        "parse_labels": has("mov al, byte ptr [bp - 1]", "push ax", "lcall 0x58, 0x2a"),
        "flag_branch": has("cmp byte ptr [bp + 6], 0"),
    }


def test_0x31_and_0x2b_share_one_handler_differing_only_in_flag() -> None:
    ovr = OVR.read_bytes()
    assert ovr[:4] == b"FBOV"
    h2b, f2b = _dispatch_target(ovr, 0x2B)
    h31, f31 = _dispatch_target(ovr, 0x31)
    assert (h2b, f2b) == (HANDLER, 0)
    assert (h31, f31) == (HANDLER, 1)


def test_shared_handler_is_a_two_operand_counted_menu() -> None:
    facts = _handler_frame(OVR.read_bytes(), HANDLER)
    assert all(facts.values()), facts


def test_wrong_handler_offset_is_rejected() -> None:
    """Mutation control: a neighbouring offset must fail the structural check."""
    ovr = OVR.read_bytes()
    with pytest.raises(AssertionError):
        assert _dispatch_target(ovr, 0x31)[0] == HANDLER + 1
    # A misaligned handler start decodes to something that is not the menu frame.
    assert not all(_handler_frame(ovr, HANDLER + 1).values())
    assert not all(_handler_frame(ovr, 0x1AFD).values())  # TREASURE handler


def _scan(opcodes_31):
    import goldbox_corpus as gc
    import gen1_ecl_encounter_scan as scan
    import gen1_ecl_menu_capacity_scan as m

    saved = dict(scan.PROFILE_EXTENDED_OPCODES[PID]), dict(scan.PROFILE_WORD_SETS[PID])
    try:
        scan.PROFILE_EXTENDED_OPCODES[PID] = {**saved[0], 0x31: opcodes_31}
        scan.PROFILE_WORD_SETS[PID] = {k: v for k, v in saved[1].items() if k != 0x31}
        sites31 = sites2b = valid2b = 0
        for block in gc.read_dax_blocks(ECL):
            for off, ins in m.reachable_instructions(block["raw"], PID).items():
                if ins.opcode == 0x31:
                    sites31 += 1
                elif ins.opcode == 0x2B:
                    sites2b += 1
                    t = m.inline_texts(block["raw"], ins)
                    valid2b += bool(t) and all(x for _, x in t)
        return sites31, sites2b, valid2b
    finally:
        scan.PROFILE_EXTENDED_OPCODES[PID], scan.PROFILE_WORD_SETS[PID] = saved


@pytest.mark.parametrize(
    "name,frame",
    [
        ("compact", (2, 1)),  # DoK/PoD: dest,count,labels
        ("plain-2", (2, None)),
        ("zero", (0, None)),
        ("wrong-count-slot", (2, 0)),
    ],
)
def test_no_reachable_0x31_site_under_any_frame(name: str, frame: tuple[int, int | None]) -> None:
    import gen1_ecl_encounter_scan as scan

    s31, s2b, v2b = _scan(scan.Opcode(frame[0], "SHORT_MENU", count_at=frame[1]))
    # Positive control: the same decoder reaches and reads real 0x2B menus.
    assert s2b >= 60 and v2b == s2b, (s2b, v2b)
    # The finding: no CFG-reachable 0x31 in the retail Treasures corpus.
    assert s31 == 0, (name, s31)


def test_instrument_can_see_a_0x31_menu_when_one_exists() -> None:
    """Synthetic control: relabel a real 0x2B site as 0x31; compact frame must see it,
    and a wrong count slot must not read it as a clean menu."""
    import goldbox_corpus as gc
    import gen1_ecl_encounter_scan as scan
    import gen1_ecl_menu_capacity_scan as m

    for block in gc.read_dax_blocks(ECL):
        raw = bytearray(block["raw"])
        for off, ins in m.reachable_instructions(bytes(raw), PID).items():
            if ins.opcode == 0x2B:
                raw[off] = 0x31
                saved = dict(scan.PROFILE_EXTENDED_OPCODES[PID])
                try:
                    scan.PROFILE_EXTENDED_OPCODES[PID] = {
                        **saved, 0x31: scan.Opcode(2, "SHORT_MENU", count_at=1)}
                    seen = m.reachable_instructions(bytes(raw), PID).get(off)
                    assert seen is not None and seen.opcode == 0x31
                    assert seen.size == ins.size
                    scan.PROFILE_EXTENDED_OPCODES[PID] = {
                        **saved, 0x31: scan.Opcode(2, "SHORT_MENU", count_at=0)}
                    bad = m.reachable_instructions(bytes(raw), PID).get(off)
                    assert bad is None or bad.size != ins.size
                finally:
                    scan.PROFILE_EXTENDED_OPCODES[PID] = saved
                return
    raise AssertionError("no 0x2B site found")
