#!/usr/bin/env python3
"""dqk_ai_body_pins.py - byte pins for the DQK NPC AI body facts that
docs/engine/research/dqk-npc-ai-body.md calls READ, plus the 0x86DE decode
verdict (docs/engine/research/dqk-area27-86de-decode.md).

Capstone 16-bit reading of the real DQK.EXE only (no Unicorn, no DOSBox).
`check(data)` returns the names of pins that do NOT hold, so a byte-mutated
copy of the EXE is a negative control.  Never writes to the game folder.

Reuses dqk_npc_turn.dis and the same (addr, window, {addr: text}) pin shape.
"""
from __future__ import annotations

import struct

from dqk_npc_turn import dis, EXE, ROOT

ECL_GLB = ROOT / "The Dark Queen of Krynn" / "DISK3" / "ECL.GLB"

# --- segment bases (file = base + offset) -----------------------------------
CS2033_BASE = 0x31D20           # 2033:0000 (table 2033:0d34 = file 0x32a54)
TRAMP_1D99_BASE = 0x1FD90       # 1d99:0000 (AI stub 1d99:0ff9 = file 0x20d89)
OVL_25A4_BASE = 0x402C0         # 25a4:0000 (handler 25a4:31e8 = file 0x434a8)
ECL_DISPATCH = 0x32A54          # 0x42 word slots, direct-indexed by opcode
PREFETCH_FN = 0x31D33           # 2033:0013 operand prefetch

# --- the 30-spell id table at 0x2907B (words) --------------------------------
SPELL_ID_TABLE = 0x2907B
SPELL_IDS = (0x01, 0x03, 0x0A, 0x0F, 0x15, 0x17, 0x24, 0x25, 0x2A, 0x2B, 0x2F,
             0x31, 0x33, 0x3A, 0x44, 0x47, 0x4A, 0x4C, 0x51, 0x52, 0x54, 0x5B,
             0x5E, 0x60, 0x6E, 0x73, 0x78, 0x82, 0x85, 0x86)

# --- instruction-text pins: name -> (start, window, {addr: text}) ------------
PINS = {
    # 0x2EB87: random in-reach pick. Gate on the "route" local, find_target,
    # then (else branch at 0x2EBE0) roll(count,1) via 048f:1968.
    "rand_pick_gate": (0x2EB87, 0x08, {
        0x2EB87: "cmp byte ptr [bp - 0xe], 0", 0x2EB8B: "jne 0x2ebe0"}),
    "rand_pick_find_target": (0x2EB96, 0x10, {
        0x2EB96: "mov al, 0xff", 0x2EB9F: "lcall 0x21e4, 0x3d9e"}),
    "rand_pick_roll_count_1": (0x2EBE0, 0x10, {
        0x2EBE0: "push word ptr [bp - 0xe]", 0x2EBE3: "mov al, 1",
        0x2EBE6: "lcall 0x48f, 0x1968", 0x2EBED: "mov byte ptr [bp - 0xd], al"}),
    # 0x22FA3: SPACE walk. +0x9B < 0x80 -> +0x18C = 0; follow +0 link. No +0x64.
    "space_walk": (0x22FA3, 0x30, {
        0x22FA3: "les bx, ptr [0xc6e5]",
        0x22FB2: "cmp byte ptr es:[bx + 0x9b], 0x80",
        0x22FB8: "jae 0x22fc0",
        0x22FBA: "mov byte ptr es:[bx + 0x18c], 0",
        0x22FC3: "les bx, ptr es:[bx]",
        0x22FD2: "jne 0x22faf"}),
    # 0x2E105: wand step stub, returns 0
    "wand_stub": (0x2E105, 0x11, {
        0x2E105: "push bp", 0x2E108: "sub sp, 2",
        0x2E10B: "mov byte ptr [bp - 1], 0", 0x2E10F: "mov al, byte ptr [bp - 1]",
        0x2E115: "retf"}),
    # Hold-back test at 0x2E5B3: d100 + [C2DE] >= [C6B8], only for +0x9B bit 7
    "holdback_formula": (0x2E5AC, 0x28, {
        0x2E5AC: "test byte ptr [bx + 0x9b], 0x80",
        0x2E5B3: "mov al, 0x64", 0x2E5B6: "mov al, 1",
        0x2E5B9: "lcall 0x48f, 0x1968",
        0x2E5C0: "mov dl, byte ptr [0xc2de]", 0x2E5C6: "add ax, dx",
        0x2E5C8: "mov dl, byte ptr [0xc6b8]", 0x2E5CE: "cmp ax, dx",
        0x2E5D0: "jge 0x2e5df",
        0x2E5D5: "cmp word ptr es:[bx + 0x66], 1"}),
    # [C6B8] writer: enemy-side (+0x66==1, +0x64!=9, alive +0x18B) hp% in steps of 5
    "c6b8_writer_filter": (0x27770, 0x20, {
        0x27770: "cmp word ptr es:[bx + 0x66], 1",
        0x27777: "cmp word ptr es:[bx + 0x64], 9",
        0x2777E: "cmp byte ptr es:[bx + 0x18b], 0",
        0x27786: "mov al, byte ptr es:[bx + 0x198]"}),
    "c6b8_writer_store": (0x277C0, 0x16, {
        0x277C0: "mov dx, 0x14", 0x277C3: "mul dx", 0x277C7: "div word ptr [bp - 8]",
        0x277CA: "mov dx, 5", 0x277CD: "mul dx",
        0x277CF: "mov byte ptr [0xc6b8], al"}),
    # [C2DE] in the flee check: morale = (+0x9B & 0x7F) * 2, later [C2DE] = [C6B8]
    "c2de_flee_morale": (0x2EF86, 0x0C, {
        0x2EF86: "and al, 0x7f", 0x2EF88: "shl al, 1",
        0x2EF8A: "mov byte ptr [0xc2de], al"}),
    "c2de_flee_hp_break": (0x2EFA7, 0x28, {
        0x2EFA7: "mov dx, 0x64", 0x2EFB6: "idiv bx",
        0x2EFBB: "sub dx, ax", 0x2EFBD: "mov al, byte ptr [0xc2de]",
        0x2EFC2: "cmp dx, ax", 0x2EFC4: "jg 0x2efd0",
        0x2EFD0: "mov al, byte ptr [0xc6b8]", 0x2EFD3: "mov byte ptr [0xc2de], al"}),
    "c2de_group_adjusters": (0x4DFCB, 0x30, {
        0x4DFCB: "add byte ptr [0xc2de], 5",
        0x4DFE6: "mov byte ptr [0xc2de], 0",
        0x4DFED: "sub byte ptr [0xc2de], 5"}),
}

# raw-byte pins: name -> (offset, bytes)
RAW = {
    "wand_stub_bytes": (0x2E105, bytes.fromhex("55 8b ec 83 ec 02 c6 46 ff 00 8a 46 ff 8b e5 5d cb")),
    "spell_id_table_30_words": (SPELL_ID_TABLE, b"".join(struct.pack("<H", i) for i in SPELL_IDS)),
    "c2de_set_100": (0x538D5, bytes.fromhex("c6 06 de c2 64")),
}


def check(data: bytes) -> list[str]:
    bad = []
    for name, (_start, _n, want) in PINS.items():
        first, last = min(want), max(want)
        got = dis(data, first, last - first + 12)
        if any(got.get(a) != t for a, t in want.items()):
            bad.append(name)
    for name, (off, want) in RAW.items():
        if data[off:off + len(want)] != want:
            bad.append(name)
    # the id table is exactly 30 words: the next word is not a spell id
    nxt = struct.unpack_from("<H", data, SPELL_ID_TABLE + 60)[0]
    if nxt < 0x100:
        bad.append("spell_id_table_ends_after_30")
    return bad


# --- static census of stores to the two globals -------------------------------
_RMW_REG_WRITES = {0x80: lambda r: r != 7, 0x81: lambda r: r != 7,
                   0x83: lambda r: r != 7, 0xFE: lambda r: r in (0, 1),
                   0xFF: lambda r: r in (0, 1)}
_MODRM_WRITE_OPS = {0x88, 0x89, 0xC6, 0xC7, 0x00, 0x01, 0x08, 0x09, 0x20, 0x21,
                    0x28, 0x29, 0x30, 0x31}


def census(data: bytes, addr: int) -> dict[str, list[int]]:
    """Absolute-address DS references to `addr`: instruction start addresses
    split into stores, loads/compares, and address-taken (mov r16, imm16)."""
    pat = struct.pack("<H", addr)
    out = {"store": [], "other": [], "addr_taken": []}
    i = -1
    while True:
        i = data.find(pat, i + 1)
        if i < 0:
            break
        if i >= 1 and data[i - 1] in (0xA2, 0xA3):
            out["store"].append(i - 1)
        elif i >= 1 and data[i - 1] in (0xA0, 0xA1):
            out["other"].append(i - 1)
        elif i >= 1 and 0xB8 <= data[i - 1] <= 0xBF:
            out["addr_taken"].append(i - 1)
        elif i >= 2 and data[i - 1] & 0xC7 == 0x06:
            op, reg = data[i - 2], (data[i - 1] >> 3) & 7
            if op in _MODRM_WRITE_OPS or (op in _RMW_REG_WRITES and _RMW_REG_WRITES[op](reg)):
                out["store"].append(i - 2)
            elif op in (0x8A, 0x8B, 0x38, 0x39, 0x3A, 0x3B, 0x80, 0x81, 0x83, 0x02, 0x03, 0x2A, 0x2B):
                out["other"].append(i - 2)
    return out


EXPECTED_C2DE_STORES = [0x2EF8A, 0x2EFD3, 0x4DFCB, 0x4DFE6, 0x4DFED, 0x538D5]
EXPECTED_C6B8_STORES = [0x277CF]


# --- 0x86DE decode, from the EXE's own dispatch table -------------------------
def handler_file_offset(exe: bytes, opcode: int) -> int:
    """Resolve opcode -> handler body file offset through slot stubs:
    `push cs; call near` (0e e8 rel16), or `lcall 1d99:X` -> trampoline
    `jmp far 25a4:Y`."""
    slot = struct.unpack_from("<H", exe, ECL_DISPATCH + 2 * opcode)[0]
    s = CS2033_BASE + slot
    if exe[s] == 0x0E and exe[s + 1] == 0xE8:
        rel = struct.unpack_from("<h", exe, s + 2)[0]
        return CS2033_BASE + ((slot + 4 + rel) & 0xFFFF)
    if exe[s] == 0x9A:
        off, seg = struct.unpack_from("<HH", exe, s + 1)
        if seg == 0x1D99:
            t = TRAMP_1D99_BASE + off
            j = exe.find(b"\xEA", t, t + 16)
            if j >= 0:
                yoff, yseg = struct.unpack_from("<HH", exe, j + 1)
                if yseg == 0x25A4:
                    return OVL_25A4_BASE + yoff
    raise ValueError(f"unresolved slot stub for opcode {opcode:#x}")


def prefetch_count(exe: bytes, opcode: int) -> int:
    """Operand count the handler declares: `mov al,N; push ax; (push cs; call
    2033:0013 | lcall 2033:0013)`.  0 when the handler never calls the
    prefetch within its first 0x30 bytes."""
    h = handler_file_offset(exe, opcode)
    body = exe[h:h + 0x30]
    for j in range(len(body) - 8):
        if body[j] == 0xB0 and body[j + 2] == 0x50:
            if body[j + 3:j + 8] == bytes.fromhex("9a 13 00 33 20"):
                return body[j + 1]
            if body[j + 3] == 0x0E and body[j + 4] == 0xE8:
                rel = struct.unpack_from("<h", body, j + 5)[0]
                if h + j + 7 + rel == PREFETCH_FN:
                    return body[j + 1]
    return 0


def pc_advance_without_prefetch(exe: bytes, opcode: int) -> bool:
    """True when a zero-operand handler does `inc word ptr [0xb7f9]` (PC+1)."""
    h = handler_file_offset(exe, opcode)
    return bytes.fromhex("ff 06 f9 b7") in exe[h:h + 0x30]


def decode_area27(exe: bytes, ecl_member: bytes, start_vaddr: int = 0x86B9, n: int = 6):
    """Linear decode from a known instruction boundary using operand counts
    read from the EXE handlers for 0x1D/0x1E/0x37 (PRINTCLEAR 0x12: one
    string operand; COMPARE 0x03: two).  Returns [(vaddr, opcode, size, text)]."""
    from dqk_ca03_stream_decode import read_opp
    counts = {0x12: 1, 0x1D: prefetch_count(exe, 0x1D), 0x1E: prefetch_count(exe, 0x1E),
              0x37: prefetch_count(exe, 0x37), 0x03: 2}
    out, pos = [], start_vaddr - 0x8000
    for _ in range(n):
        op = ecl_member[pos]
        if op not in counts:
            out.append((pos + 0x8000, op, 0, "?"))
            break
        p, texts = pos + 1, []
        for _k in range(counts[op]):
            t, p, _w = read_opp(ecl_member, p)
            texts.append(t)
        out.append((pos + 0x8000, op, p - pos, " ".join(texts)))
        pos = p
    return out


def area27_member() -> bytes:
    from dqk_ecl_combat_scan import read_hlib_data_archive, parse_id_table
    a = read_hlib_data_archive(ECL_GLB)
    return a.members[parse_id_table(a.members[0])[27]]
