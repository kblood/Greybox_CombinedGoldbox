"""Mutation-tested pins for the DQK AI body (docs/engine/research/dqk-npc-ai-body.md)
and the 0x86DE decode verdict (docs/engine/research/dqk-area27-86de-decode.md).
Everything is checked against the real DQK.EXE / ECL.GLB and skips when absent."""
from __future__ import annotations

import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
pytest.importorskip("capstone")
import dqk_ai_body_pins as t  # noqa: E402

needs_exe = pytest.mark.skipif(not t.EXE.exists(), reason="DQK.EXE not present")
needs_ecl = pytest.mark.skipif(not (t.EXE.exists() and t.ECL_GLB.exists()),
                               reason="DQK.EXE / DISK3/ECL.GLB not present")


@pytest.fixture(scope="module")
def exe():
    return t.EXE.read_bytes()


# ---------------------------------------------------------------- part (a)
@needs_exe
def test_all_ai_body_pins_hold(exe):
    assert t.check(exe) == []
    assert len(t.PINS) == 11 and len(t.RAW) == 3


@needs_exe
@pytest.mark.parametrize("name", sorted(t.PINS))
def test_each_text_pin_goes_red_when_its_first_byte_is_flipped(exe, name):
    mut = bytearray(exe)
    mut[min(t.PINS[name][2])] ^= 0xFF
    assert name in t.check(bytes(mut))
    assert t.check(exe) == []


@needs_exe
@pytest.mark.parametrize("name", sorted(t.PINS))
def test_each_text_pin_goes_red_when_its_last_byte_is_flipped(exe, name):
    """Second mutation site per pin, so a pin cannot pass by checking only its head."""
    mut = bytearray(exe)
    mut[max(t.PINS[name][2])] ^= 0xFF
    assert name in t.check(bytes(mut))


@needs_exe
@pytest.mark.parametrize("name", sorted(t.RAW))
def test_each_raw_pin_goes_red_on_last_byte_flip(exe, name):
    off, want = t.RAW[name]
    mut = bytearray(exe)
    mut[off + len(want) - 1] ^= 0x01
    assert name in t.check(bytes(mut))


@needs_exe
def test_spell_id_table_end_pin_goes_red_if_a_31st_id_appears(exe):
    mut = bytearray(exe)
    struct.pack_into("<H", mut, t.SPELL_ID_TABLE + 60, 0x0087)
    assert "spell_id_table_ends_after_30" in t.check(bytes(mut))


@needs_exe
def test_space_walk_never_reads_plus_0x64(exe):
    """The SPACE walk (0x22FA3..0x22FD4) must not touch +0x64, unlike its AI twin."""
    body = exe[0x22FA3:0x22FD4]
    assert bytes.fromhex("64 00") not in body.replace(bytes.fromhex("9b 00"), b"")
    mut = bytearray(exe)
    mut[0x22FB5] = 0x64          # cmp byte ptr es:[bx+0x9b] -> +0x64 displacement
    mut[0x22FB6] = 0x00
    assert "space_walk" in t.check(bytes(mut))


# ------------------------------------------- C2DE / C6B8 writers (DERIVED)
@needs_exe
def test_c2de_and_c6b8_store_census(exe):
    c2 = t.census(exe, 0xC2DE)
    c6 = t.census(exe, 0xC6B8)
    assert c2["store"] == t.EXPECTED_C2DE_STORES
    assert c6["store"] == t.EXPECTED_C6B8_STORES
    assert c2["addr_taken"] == [] and c6["addr_taken"] == []


@needs_exe
def test_census_goes_red_on_a_planted_extra_store_and_on_a_removed_one(exe):
    # plant `mov [0xc6b8], al` (a2 b8 c6) over 3 padding-free bytes elsewhere
    mut = bytearray(exe)
    mut[0x1000:0x1003] = bytes.fromhex("a2 b8 c6")
    assert t.census(bytes(mut), 0xC6B8)["store"] != t.EXPECTED_C6B8_STORES
    # turn the real C6B8 store into a load (a2 -> a0)
    mut = bytearray(exe)
    assert mut[0x277CF] == 0xA2
    mut[0x277CF] = 0xA0
    assert t.census(bytes(mut), 0xC6B8)["store"] == []
    # change one C2DE store's opcode
    mut = bytearray(exe)
    mut[0x2EF8A] = 0xA0
    assert t.census(bytes(mut), 0xC2DE)["store"] != t.EXPECTED_C2DE_STORES


# ---------------------------------------------------------------- part (b)
@needs_exe
def test_dispatch_table_operand_counts_from_handler_bytes(exe):
    """Operand counts read straight from DQK's own handlers (not from any tool table)."""
    assert t.prefetch_count(exe, 0x1D) == 0 and t.pc_advance_without_prefetch(exe, 0x1D)
    assert t.prefetch_count(exe, 0x1E) == 6
    assert t.prefetch_count(exe, 0x37) == 2
    assert t.prefetch_count(exe, 0x36) == 2          # ADD_NPC
    assert t.handler_file_offset(exe, 0x1E) == 0x32532
    assert t.handler_file_offset(exe, 0x37) == 0x434A8
    assert t.handler_file_offset(exe, 0x36) == 0x4333B


@needs_exe
@pytest.mark.parametrize("site,op,newval", [(0x434AE, 0x37, 3), (0x32532, 0x1E, 5)])
def test_operand_count_derivation_goes_red_when_the_handler_byte_changes(exe, site, op, newval):
    mut = bytearray(exe)
    assert mut[site] in (0xB0,) or mut[site + 1] in (2, 6)
    mut[site + 1] = newval
    assert t.prefetch_count(bytes(mut), op) == newval
    assert t.prefetch_count(exe, op) != newval


@needs_ecl
def test_0x86de_is_load_pieces_not_checkparty(exe):
    m = t.area27_member()
    d = t.decode_area27(exe, m)
    rows = {r[0]: r for r in d}
    assert [hex(r[0]) for r in d[:5]] == ["0x86b9", "0x86dd", "0x86de", "0x86e5", "0x86eb"]
    assert rows[0x86B9][1] == 0x12 and rows[0x86B9][2] == 36
    assert "HULDERFOLK KING AND QUEEN" in rows[0x86B9][3]
    assert rows[0x86DD][1] == 0x1D and rows[0x86DD][2] == 1
    assert rows[0x86DE][1] == 0x37 and rows[0x86DE][2] == 7
    assert rows[0x86DE][3] == "memstr[0x01ca] 0x00c0"
    assert rows[0x86E5][1] == 0x03 and rows[0x86E5][3] == "0x00c0 #255"
    # the retail string spans 0x86BC..0x86DC, so 0x86D4 lies inside it
    assert 0x86BC <= 0x86D4 < 0x86BC + 0x21


@needs_ecl
def test_0x86d4_is_never_an_instruction_boundary_and_checkparty_is_never_reached():
    from dqk_ecl_combat_scan import (collect_boundaries, header_entries,
                                     parse_id_table, read_hlib_data_archive)
    a = read_hlib_data_archive(t.ECL_GLB)
    m = a.members[parse_id_table(a.members[0])[27]]
    seen, _ = collect_boundaries(m, header_entries(m), 500_000)
    assert {0x86B9 - 0x8000, 0x86DD - 0x8000, 0x86DE - 0x8000, 0x86E5 - 0x8000} <= set(seen)
    assert 0x86D4 - 0x8000 not in seen
    reached_1e = reached_37 = 0
    for mem in a.members[1:]:
        s, _ = collect_boundaries(mem, header_entries(mem), 500_000)
        for o, ins in s.items():
            reached_1e += ins.opcode == 0x1E
            if ins.opcode == 0x37:
                reached_37 += 1
                assert mem[o + 1] in (0x80, 0x81)    # operand 1 is a name string
    assert reached_1e == 0          # CHECKPARTY is not reached anywhere in DQK's 47 ECL members
    assert reached_37 == 89


@needs_ecl
def test_hypothesis_checkparty_at_0x86d4_has_invalid_operand_codes():
    """The competing reading: 0x1E at 0x86D4 with six operands.  Its operand type
    bytes would be 00,12,55,53,1d,81 -> four fall outside the codes the retail
    prefetch table at cs:0x68 recognises {1,2,3,0x80,0x81} plus immediate 0."""
    m = t.area27_member()
    p, codes = 0x86D4 - 0x8000 + 1, []
    for _ in range(6):
        codes.append(m[p])
        p += 3 if m[p] in (1, 2, 3, 0x81) else 2
    assert m[0x86D4 - 0x8000] == 0x1E
    assert codes == [0x00, 0x12, 0x55, 0x53, 0x1D, 0x81]
    assert [c for c in codes if c not in (0, 1, 2, 3, 0x80, 0x81)] == [0x12, 0x55, 0x53, 0x1D]
    assert p + 0x8000 == 0x86E2


@needs_ecl
def test_verdict_goes_red_if_the_0x37_operand_count_is_mutated(exe):
    m = t.area27_member()
    mut = bytearray(exe)
    mut[0x434AF] = 3                      # mov al,2 -> mov al,3 : LOAD_PIECES takes 3
    d = t.decode_area27(bytes(mut), m)
    rows = {r[0]: r for r in d}
    assert rows[0x86DE][2] != 7 or rows.get(0x86E5, (0, 0, 0, ""))[3] != "0x00c0 #255"
