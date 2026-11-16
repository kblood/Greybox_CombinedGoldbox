#!/usr/bin/env python3
"""dqk_npc_turn.py - static pins for who gives DQK roster nodes (incl. NPC ID 68)
their combat turns.  Companion to docs/engine/research/dqk-npc-combat-route.md
("Turn scheduler located" section).  Capstone 16-bit reading of DQK.EXE only;
no Unicorn/DOSBox run (organic Unicorn runs never reach COMBAT: see
unicorn-dqk-trace.md / dqk-ca03-runtime-probe.md).

Every pin is (file_offset, length, [expected disassembly lines]).  `check(data)`
returns the list of pins that do NOT hold, so a mutated copy of the EXE can be
used as a negative control.  Never writes to the game folder.

Segment bases (verified from `disasm_dqk.py --stubs 0`): overlay 0 sub-segments
1f4e->0x22400, 20cb->0x23bd0, 21e4->0x24d60, 2740->0x2a320.
"""
from __future__ import annotations

import sys
from pathlib import Path

import capstone

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "The Dark Queen of Krynn" / "DQK.EXE"
MONCHA = ROOT / "The Dark Queen of Krynn" / "DISK2" / "MONCHA.GLB"

# --- derived constants -------------------------------------------------------
SEG_21E4_BASE = 0x24D60
COMBAT_MAIN = 0x2299D          # sets [AE57]=5 (combat mode), runs the round loop
PER_ACTOR_INIT = 0x24D64       # 21e4:0004, called once per roster node (0x22A24)
INIT_ROLL_STORE = 0x24EB6      # roster->+0x40 ->+3 = rand(1,6) + mod
TURN_ORDER_BUILDER = 0x22847   # insertion sort into DS:BD99[0x49] by +0x40->+3
PER_ACTOR_TURN = 0x22B8B       # one actor's turn
CONTROL_INIT = 0x29B32         # 21e4:4dd2, writes roster +0x18C
AI_STUB_FILE = 0x20D89         # 1D99:0FF9 FBOV stub -> overlay 2 entry
AI_ENTRY = 0x2DE10
ITEM_GATE_FN = 0x5ED25         # the formerly-suspected "turn dispatch"


def _md():
    return capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)


def dis(data: bytes, off: int, n: int) -> dict[int, str]:
    return {i.address: f"{i.mnemonic} {i.op_str}".strip()
            for i in _md().disasm(data[off:off + n], off)}


# (addr, window, {addr: text})  -- exact instruction text at exact addresses
PINS = {
    # --- combat main loop ---------------------------------------------------
    "combat_mode_5": (COMBAT_MAIN, 0x30, {0x229A8: "mov word ptr [0xae57], 5"}),
    "calls_control_init": (0x229B4, 0x10, {0x229BA: "lcall 0x21e4, 0x4dd2"}),
    "per_node_init_call": (0x22A1E, 0x10, {0x22A24: "lcall 0x21e4, 4"}),
    "builder_call": (0x22A3F, 0x10, {0x22A49: "call 0x22847"}),
    "per_actor_turn_call": (0x22A5E, 0x10, {0x22A65: "call 0x22b8b"}),
    # --- initiative key ------------------------------------------------------
    "initiative_store": (0x24EAF, 0x0C, {
        0x24EB2: "les bx, ptr es:[bx + 0x40]",
        0x24EB6: "mov word ptr es:[bx + 3], dx"}),
    "initiative_floor_1": (0x24EC1, 0x14, {
        0x24EC1: "cmp word ptr es:[bx + 3], 1",
        0x24ECF: "mov word ptr es:[bx + 3], 1"}),
    "initiative_participation_gate": (0x24E85, 0x06, {
        0x24E85: "cmp byte ptr es:[bx + 0x18b], 0"}),
    # --- turn-order builder ---------------------------------------------------
    "builder_array": (0x22857, 0x14, {
        0x2285A: "mov ax, 0x124", 0x2285F: "mov ax, 0xbd99"}),
    "builder_key": (0x22876, 0x0F, {
        0x22879: "les bx, ptr es:[bx + 0x40]",
        0x2287D: "mov al, byte ptr es:[bx + 3]"}),
    # --- per-actor turn --------------------------------------------------------
    "turn_requires_moves": (0x22BC1, 0x0F, {
        0x22BC4: "les bx, ptr es:[bx + 0x40]",
        0x22BC8: "cmp word ptr es:[bx + 3], 0",
        0x22BCD: "jg 0x22bd2"}),
    "turn_branch_on_18c": (0x22C86, 0x24, {
        0x22C89: "cmp byte ptr es:[bx + 0x18c], 0",
        0x22C8F: "je 0x22c9e",
        0x22C95: "lcall 0x1d99, 0xff9",
        0x22CA5: "call 0x22ccf"}),
    # --- control init (writes +0x18C) ------------------------------------------
    "control_init_side0": (0x29B44, 0x16, {
        0x29B47: "cmp word ptr es:[bx + 0x66], 0",
        0x29B4E: "mov al, byte ptr es:[bx + 0x9b]",
        0x29B53: "and al, 0x80",
        0x29B55: "mov byte ptr es:[bx + 0x18c], al"}),
    "control_init_side_nonzero": (0x29B5C, 0x08, {
        0x29B5F: "mov byte ptr es:[bx + 0x18c], 1"}),
    # --- AI entry -----------------------------------------------------------------
    "ai_stub_resolves_to_ovl2": (AI_ENTRY, 0x0A, {
        0x2DE10: "push bp", 0x2DE16: "les bx, ptr [bp + 6]",
        0x2DE19: "les bx, ptr es:[bx + 0x40]"}),
    # --- item-ness of +0x28/+0x37/+0x38 ------------------------------------------------
    # roster builder: a 0x3D-byte node is allocated from table 0xC3A9 and copied
    # into the list head at roster +8
    "roster_item_node_alloc": (0x42E9E, 0x2A, {
        0x42E9F: "mov ax, 0xc3a9", 0x42EA3: "mov ax, 0x3d",
        0x42EAC: "add ax, 8"}),
    # combat-command item menu: list cursor starts at [AD67]->+8
    "item_menu_cursor_from_plus8": (0x5DAF8, 0x10, {
        0x5DAF8: "les bx, ptr [0xad67]",
        0x5DB02: "les bx, ptr es:[bx + 8]"}),
    # AI overlay: +0x28 of the node at roster+0xC indexes a 16-byte table [AE3E]
    "ai_item_type_table": (0x2EA63, 0x22, {
        0x2EA63: "mov ax, word ptr es:[bx + 0xc]",
        0x2EA6D: "les bx, ptr es:[bx + 0xc]",
        0x2EA71: "mov al, byte ptr es:[bx + 0x28]",
        0x2EA79: "shl ax, cl", 0x2EA7B: "les bx, ptr [0xae3e]"}),
    # cursed-style flag test on +0x36/+0x37/+0x38 high bits, chained via +0x39
    "item_flag_bits": (0x5D98A, 0x18, {
        0x5D98A: "test byte ptr es:[bx + 0x36], 0x80",
        0x5D991: "test byte ptr es:[bx + 0x37], 0x80",
        0x5D998: "test byte ptr es:[bx + 0x38], 0x80"}),
    "item_chain_plus39": (0x5DAB5, 0x0C, {
        0x5DAB8: "les bx, ptr es:[bx + 0x39]"}),
}


def check(data: bytes) -> list[str]:
    """Names of pins that do not hold in `data`."""
    bad = []
    for name, (start, n, want) in PINS.items():
        # disassemble from the first expected address: pins list real instruction
        # boundaries, so start there, and read a window past the last expected one
        first = min(want)
        last = max(want)
        got = dis(data, first, last - first + 12)
        if any(got.get(a) != t for a, t in want.items()):
            bad.append(name)
    return bad


def control_byte(side66: int, ctl9b: int) -> int:
    """Model of 0x29B32's +0x18C assignment (pinned by `control_init_*`)."""
    return (ctl9b & 0x80) if side66 == 0 else 1


def moncha_record(member_id: int) -> bytes:
    sys.path.insert(0, str(ROOT / "tools"))
    import moncha_rle
    mem = dict(moncha_rle.iter_moncha_members(MONCHA.read_bytes()))
    return moncha_rle.decode_moncha_member(mem[member_id])


def main() -> int:
    data = EXE.read_bytes()
    bad = check(data)
    print(f"pins: {len(PINS)}  failing: {bad or 'none'}")
    if MONCHA.exists():
        r = moncha_record(68)
        for o in (0x28, 0x37, 0x38, 0x66, 0x9B, 0x18B, 0x18C):
            print(f"  GNOME WARRIOR +{o:#x} = {r[o]:#x}")
        print("  +0x18C after control init:",
              hex(control_byte(r[0x66], r[0x9B])))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
