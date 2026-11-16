"""Synthetic controls for the bounded DQK HLIB invocation walker."""

from __future__ import annotations

import re
from pathlib import Path
import pytest

from dqk_ca03_stream_decode import read_opp
from dqk_ecl_combat_scan import decode_one, parse_id_table, read_hlib_data_archive
from dqk_ecl_invocation_scan import (
    ACK_OPS,
    PARTY_SEED_READERS,
    PROMPT_OPS,
    SCRIPT_EVENT_MASK,
    YIELD_OPS,
    walk_area,
)


def block_with_entry(slot0: int, code: bytes) -> bytes:
    block = bytearray(20 + len(code))
    for slot in range(5):
        offset = slot0 if slot == 0 else 20
        block[slot * 4 + 2:slot * 4 + 4] = (0x8000 + offset).to_bytes(2, "little")
    block[20:] = code
    return bytes(block)


def memory_operand(address: int) -> bytes:
    return bytes([0x03]) + address.to_bytes(2, "little")


def immediate_operand(value: int) -> bytes:
    assert 0 <= value <= 0xFF
    return bytes([0x00, value])


def test_code_02_operand_is_reported_as_a_16_bit_immediate() -> None:
    assert read_opp(bytes([0x02, 0xEE, 0x02]), 0) == ("#750", 3, 750)


def target_operand(vaddr: int) -> bytes:
    return bytes([0x01, vaddr & 0xFF, (vaddr >> 8) & 0xFF])


def damage_instruction() -> bytes:
    return bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)


def test_literal_newecl_follows_selected_header_slot_and_resets_call_stack() -> None:
    # Root: GOSUB 0x801b; return to NEWECL #2. The target block's slot 0
    # points at SAVE_TABLE while its fixed entry at offset 20 exits.
    root_code = bytes([
        0x02, 0x01, 0x1B, 0x80,       # GOSUB 0x801b
        0x20, 0x00, 0x02,             # NEWECL #2
        0x2D, 0x00, 0x01,             # CALL #1 (subroutine)
        0x13,                         # RETURN
    ])
    target_code = bytes([
        0x00,                         # fixed offset-20 entry exits
        0x00, 0x00, 0x00, 0x00,       # padding
        0x35, 0x00, 0x10, 0x00, 0x20, 0x00,  # SAVE_TABLE #16,#32,#0
        0x00,
    ])
    members = [b"", block_with_entry(20, root_code), block_with_entry(25, target_code)]
    result = walk_area(members, {1: 1, 2: 2}, 1, range(1))
    assert (1, 27, 0x2D) in result.sites
    assert (2, 25, 0x35) in result.sites
    assert not result.unresolved_chains
    assert not result.capped


def test_empty_return_is_a_yield_and_does_not_reach_following_candidate() -> None:
    code = bytes([
        0x13,                         # empty RETURN exits the block
        0x2D, 0x00, 0x01,             # unreachable CALL #1
    ])
    members = [b"", block_with_entry(20, code)]
    result = walk_area(members, {1: 1}, 1, range(1))
    assert not result.sites


def test_capacity_stops_before_65th_recordable_opcode_but_allows_unrecorded_opcode() -> None:
    prints = bytes([0x11, 0x00, 0x00]) * 64  # PRINT #0 is in CCECL's event mask
    load_files = bytes([0x21, 0x00, 0x01, 0x00, 0x02])  # two-operand Gen2, not a GBSX event
    call = bytes([0x2D, 0x00, 0x01])  # recordable, so CCECL yields before executing it
    members = [b"", block_with_entry(20, prints + load_files + call + bytes([0x00]))]
    result = walk_area(members, {1: 1}, 1, range(1))
    assert (1, 212, 0x21) in result.sites
    assert (1, 217, 0x2D) in result.capacity_boundaries
    assert (1, 217, 0x2D) not in result.sites


def test_capacity_mask_matches_ccecl_source_bytes() -> None:
    source = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    match = re.search(
        r"(?ms)^script_event_mask\s+db\s+(.+?)(?=\n\s*\n)", source
    )
    assert match is not None
    values = bytes(int(value, 16) for value in re.findall(r"\b([0-9a-f]+)h\b", match.group(1)))
    assert values == SCRIPT_EVENT_MASK


def test_optional_yield_trace_records_event_count_and_capacity_chunk() -> None:
    prints = bytes([0x11, 0x00, 0x00]) * 2
    input_number = bytes([0x0F]) + immediate_operand(0) + memory_operand(0x00C1)
    code = prints + input_number + damage_instruction() + bytes([0x00])
    block = block_with_entry(20, code)

    result = walk_area([b"", block], {1: 1}, 1, range(1), collect_yields=True)
    input_offset = 20 + len(prints)

    assert (0, 1, input_offset, 0x0F, 3, False) in result.yield_points
    # Without a seeded answer, the prompt is terminal for this walk.
    assert not any(opcode == 0x2E for _, _, opcode in result.sites)

    without_trace = walk_area([b"", block], {1: 1}, 1, range(1))
    assert not without_trace.yield_points


def test_partystrength_ack_is_terminal_until_explicit_cold_resume() -> None:
    printed = bytes([0x11]) + immediate_operand(0)
    partystrength = bytes([0x1D])
    second_ack = bytes([0x1D])
    after = bytes([0x2D]) + immediate_operand(1) + bytes([0x00])
    code = printed + partystrength + second_ack + after
    block = block_with_entry(20, code)
    ack_vaddr = 0x8014 + len(printed)
    second_ack_vaddr = ack_vaddr + len(partystrength)

    stopped = walk_area([b"", block], {1: 1}, 1, range(1), collect_yields=True)
    one_resume = walk_area([b"", block], {1: 1}, 1, range(1), collect_yields=True,
                           acknowledged_yields={ack_vaddr})
    resumed = walk_area([b"", block], {1: 1}, 1, range(1), collect_yields=True,
                        acknowledged_yields={ack_vaddr, second_ack_vaddr})

    assert 0x1D in ACK_OPS and 0x1D in YIELD_OPS
    assert (0, 1, ack_vaddr - 0x8000, 0x1D, 2, False) in stopped.yield_points
    assert not any(opcode == 0x2D for _, _, opcode in stopped.sites)
    assert (0, 1, second_ack_vaddr - 0x8000, 0x1D, 1, False) in one_resume.yield_points
    assert (1, 20 + len(printed) + len(partystrength) + len(second_ack), 0x2D) in resumed.sites
    assert (0, 1, ack_vaddr - 0x8000, 0x1D, 2, False) in resumed.yield_points


def test_area22_partystrength_ack_cold_resumes_into_newecl_5() -> None:
    root = Path(__file__).resolve().parents[1]
    archive_path = root / "The Dark Queen of Krynn" / "DISK3" / "ECL.GLB"
    if not archive_path.exists():
        pytest.skip("local DQK retail ECL.GLB is unavailable")
    archive = read_hlib_data_archive(archive_path)
    id_to_member = parse_id_table(archive.members[0])
    member = id_to_member[22]
    block = archive.members[member]
    ack_at = 0x9091 - 0x8000
    ins = decode_one(block, ack_at)
    continuation = decode_one(block, ack_at + 1)
    assert ins is not None and (ins.vaddr, ins.opcode, ins.mnemonic) == (0x9091, 0x1D, "PARTYSTRENGTH")
    assert continuation is not None
    assert (continuation.vaddr, continuation.opcode, continuation.mnemonic) == (0x9092, 0x20, "NEWECL")
    assert continuation.args == (5,)

    # This is a diagnostic seed, not proof that an area-22 return arrives at
    # (4,1): that incoming host position/cooldown still needs source evidence.
    boundary_trace = walk_area(
        archive.members, id_to_member, 22, range(1, 2), start_vaddr=0x9059,
        seed_cell_descriptor=6, seed_map_position=(4, 1), collect_yields=True,
    )
    assert any(member_id == member and offset + 0x8000 == 0x9091 and opcode == 0x1D
               for _, member_id, offset, opcode, _, _ in boundary_trace.yield_points)

    stopped = walk_area(archive.members, id_to_member, 22, range(0, 1),
                        start_vaddr=0x9091, collect_yields=True)
    resumed = walk_area(archive.members, id_to_member, 22, range(0, 1),
                        start_vaddr=0x9091, collect_yields=True,
                        acknowledged_yields={0x9091})

    assert (0, member, ack_at, 0x1D, 1, False) in stopped.yield_points
    assert not stopped.sites
    assert (0, member, ack_at, 0x1D, 1, False) in resumed.yield_points
    assert not resumed.unresolved_chains
    assert not resumed.capped
    assert any(site_member == id_to_member[5] for site_member, _, _ in resumed.sites)


def test_partystrength_ack_contract_matches_ccecl_and_ccflow_sources() -> None:
    root = Path(__file__).resolve().parents[1]
    ccecl = (root / "native/src/ccecl.asm").read_text()
    ccflow = (root / "native/src/ccflow.asm").read_text()
    handler = ccecl[ccecl.index("op_partystrength:"):ccecl.index("; ----", ccecl.index("op_partystrength:"))]
    assert "call    start_script_event_cur" in handler
    assert "call    finish_script_event" in handler
    assert "mov     word [menu_pending_opcode], 001dh" in handler
    assert "mov     byte [ack_pending], 1" in handler
    assert "cmp     word [rbuf+MN_OPCODE_OFF], 001dh" in ccecl
    assert "mov     byte [resume_kind], 5" in ccecl
    reset_start = ccecl.index("vm_reset_all:\n")
    reset = ccecl[reset_start:ccecl.index("; ===", reset_start)]
    assert "call    init_fx_state" in reset
    init_start = ccecl.index("init_fx_state:\n")
    fx_init = ccecl[init_start:ccecl.index("; ===", init_start)]
    assert "mov     di, fx_script_count" in fx_init
    assert "rep     stosw" in fx_init
    ack_validator = ccflow[ccflow.index("validate_v15_ack:"):ccflow.index("; Validate a Gen2 pending menu", ccflow.index("validate_v15_ack:"))]
    assert "cmp     word [fxbuf+MN_OPCODE_OFF], 001dh" in ack_validator
    assert "cmp     word [fxbuf+bx], 001dh" in ack_validator
    assert "mov     word [fx_script_count], 0" in ccecl or "script count" in ccecl


def test_ack_yield_keeps_party_reader_damage_ordering_separate() -> None:
    prints = bytes([0x11, 0x00, 0x00]) * 64
    damage = damage_instruction()
    ack_vaddr = 0x8014 + len(prints) + len(damage)
    code = prints + damage + bytes([0x1D, 0x0A, 0x00, 0x00])
    block = block_with_entry(20, code)
    result = walk_area(
        [b"", block], {1: 1}, 1, range(1), follow_capacity=True,
        collect_yields=True, acknowledged_yields={ack_vaddr},
    )

    assert PARTY_SEED_READERS[0x1D] == "PARTYSTRENGTH"
    assert ACK_OPS == {0x1D}
    assert (1, 20 + len(prints) + len(damage) + 1, 0x0A) in result.post_capacity_damage_reads
    assert (1, 20 + len(prints) + len(damage), 0x1D) in result.post_capacity_damage_reads


def test_seeded_menu_answer_prunes_on_goto_and_resets_cold_event_count() -> None:
    # A selected vertical-menu answer writes its zero-based value to [00bf],
    # then ON_GOTO takes only that arm. A cold resume starts a new GBSX count.
    vertical = bytes([0x15]) + memory_operand(0x00BF) + immediate_operand(0) + immediate_operand(2)
    vertical += immediate_operand(0) + immediate_operand(1)
    damage = damage_instruction()
    printed = bytes([0x11]) + immediate_operand(0)
    numeric = bytes([0x0F]) + immediate_operand(1) + memory_operand(0x0100)
    first_target = 0x8000 + 20 + len(vertical) + 12
    second_target = first_target + len(damage) + len(printed) + len(numeric) + 1
    on_goto = (bytes([0x25]) + memory_operand(0x00BF) + immediate_operand(2) +
               target_operand(first_target) + target_operand(second_target))
    other = bytes([0x2D]) + immediate_operand(1) + bytes([0x00])
    code = vertical + on_goto + damage + printed + numeric + bytes([0x00]) + other
    block = block_with_entry(20, code)

    choice_zero = walk_area([b"", block], {1: 1}, 1, range(1), collect_yields=True,
                            menu_answers={0x8014: 0})
    choice_one = walk_area([b"", block], {1: 1}, 1, range(1),
                           menu_answers={0x8014: 1})

    assert (1, 20 + len(vertical) + 12, 0x2E) in choice_zero.sites
    assert any(opcode == 0x2D for _, _, opcode in choice_one.sites)
    assert not any(opcode == 0x2D for _, _, opcode in choice_zero.sites)
    assert not any(opcode == 0x2E for _, _, opcode in choice_one.sites)
    assert (0, 1, first_target - 0x8000 + len(damage) + len(printed),
            0x0F, 3, False) in choice_zero.yield_points


def test_headless_prompt_answers_continue_without_cold_event_reset() -> None:
    numeric = bytes([0x0F]) + immediate_operand(0) + memory_operand(0x00C1)
    compare_value = bytes([0x03]) + memory_operand(0x00C1) + immediate_operand(7)
    damage = damage_instruction()
    code = numeric + compare_value + bytes([0x16]) + damage + bytes([0x00])
    block = block_with_entry(20, code)
    prompt = 0x8014

    interactive = walk_area([b"", block], {1: 1}, 1, range(1), collect_yields=True)
    headless = walk_area([b"", block], {1: 1}, 1, range(1), collect_yields=True,
                         prompt_answers={prompt: 7}, headless_prompts=True)

    assert not any(opcode == 0x2E for _, _, opcode in interactive.sites)
    assert (0, 1, 20, 0x0F, 1, False) in interactive.yield_points
    assert (1, 20 + len(numeric) + len(compare_value) + 1, 0x2E) in headless.sites
    assert not any(opcode == 0x0F for _, _, _, opcode, _, _ in headless.yield_points)


def test_headless_party_surprise_answer_selects_yes_no_branch() -> None:
    prompt = bytes([0x22])
    damage = damage_instruction()
    code = prompt + bytes([0x16]) + damage + bytes([0x00])
    block = block_with_entry(20, code)

    yes = walk_area([b"", block], {1: 1}, 1, range(1),
                    prompt_answers={0x8014: 0}, headless_prompts=True)
    no = walk_area([b"", block], {1: 1}, 1, range(1),
                   prompt_answers={0x8014: 1}, headless_prompts=True)

    assert (1, 21 + 1, 0x2E) in yes.sites
    assert not any(opcode == 0x2E for _, _, opcode in no.sites)


def test_retail_area61_lift_lid_route_has_no_capacity_before_terminal_prompts() -> None:
    root = Path(__file__).resolve().parents[1]
    archive_path = root / "The Dark Queen of Krynn" / "DISK3" / "ECL.GLB"
    if not archive_path.exists():
        pytest.skip("local DQK retail ECL.GLB is unavailable")
    archive = read_hlib_data_archive(archive_path)
    result = walk_area(
        archive.members,
        parse_id_table(archive.members[0]),
        61,
        entry_slots=range(4, 5),
        follow_capacity=True,
        start_vaddr=0x9DBE,
        collect_yields=True,
        acknowledged_yields={0x9DBE},
        menu_answers={0x9DBF: 3, 0x9FB5: 0, 0x9FF5: 0},
    )

    assert not result.capacity_boundaries
    assert not result.post_capacity_damage_reads
    assert not result.unresolved_chains
    assert not result.capped
    assert (4, 41, 0x1DBF, 0x15, 1, False) in result.yield_points
    assert (4, 41, 0x1FB5, 0x39, 1, False) in result.yield_points
    assert (4, 41, 0x1FF5, 0x31, 4, False) in result.yield_points


def test_retail_area61_look_inside_branch_reaches_second_menu_before_capacity() -> None:
    root = Path(__file__).resolve().parents[1]
    archive_path = root / "The Dark Queen of Krynn" / "DISK3" / "ECL.GLB"
    if not archive_path.exists():
        pytest.skip("local DQK retail ECL.GLB is unavailable")
    archive = read_hlib_data_archive(archive_path)
    result = walk_area(
        archive.members,
        parse_id_table(archive.members[0]),
        61,
        entry_slots=range(4, 5),
        follow_capacity=True,
        start_vaddr=0x9DBE,
        collect_yields=True,
        acknowledged_yields={0x9DBE},
        menu_answers={0x9DBF: 3, 0x9FB5: 0, 0x9FF5: 1},
    )

    assert not result.capacity_boundaries
    assert not result.post_capacity_damage_reads
    assert not result.unresolved_chains
    assert not result.capped
    assert (4, 41, 0x2110, 0x31, 8, False) in result.yield_points
    assert not any(opcode == 0x36 for _, _, opcode in result.sites)


def test_follow_capacity_reports_prompt_after_private_chunk() -> None:
    prints = bytes([0x11, 0x00, 0x00]) * 64
    input_number = bytes([0x0F]) + immediate_operand(0) + memory_operand(0x00C1)
    block = block_with_entry(20, prints + input_number + bytes([0x00]))
    input_offset = 20 + len(prints)

    result = walk_area(
        [b"", block], {1: 1}, 1, range(1), follow_capacity=True, collect_yields=True
    )

    assert (1, input_offset, 0x0F) in result.capacity_boundaries
    assert (0, 1, input_offset, 0x0F, 1, True) in result.yield_points
    assert 0x0F in PROMPT_OPS and 0x22 in PROMPT_OPS
    assert 0x00 not in PROMPT_OPS and 0x1F not in PROMPT_OPS and 0x39 not in PROMPT_OPS


def test_follow_capacity_tracks_map_and_picture_consumers_after_replay() -> None:
    prints = bytes([0x11, 0x00, 0x00]) * 64
    picture = bytes([0x0E]) + immediate_operand(1)
    load_files = bytes([0x21, 0x00, 0x02, 0x00, 0x03])
    prompt = bytes([0x0F]) + immediate_operand(0) + memory_operand(0x00C1)
    code = prints + picture + load_files + prompt + bytes([0x00])
    block = block_with_entry(20, code)
    members = [b"", block]

    first_chunk = walk_area(members, {1: 1}, 1, range(1))
    replayed = walk_area(members, {1: 1}, 1, range(1), follow_capacity=True,
                         collect_yields=True)

    picture_offset = 20 + len(prints)
    load_files_offset = picture_offset + len(picture)
    assert not first_chunk.post_capacity_interests
    assert (1, picture_offset, 0x0E) in replayed.post_capacity_interests
    assert (1, load_files_offset, 0x21) in replayed.post_capacity_interests
    assert any(row[3] == 0x0F and row[5] for row in replayed.yield_points)


def test_seeded_selector_rules_match_ccecl_if_and_on_goto_handlers() -> None:
    source = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    if_handler = source[source.index("op_if:"):source.index("; ---- 0x09 SAVE")]
    assert "jnz     .pass" in if_handler
    assert "call    skip_one_instruction" in if_handler
    on_handler = source[source.index("op_ongoto:"):source.index("; Preserve a deterministic halt boundary")]
    assert "cmp     ax, [t0]" in on_handler
    assert "je      .goto" in on_handler
    assert "je      .fall" in on_handler


def test_seeded_and_or_refresh_compare_flags_like_native_logic_store() -> None:
    compare = bytes([0x03]) + immediate_operand(0) + immediate_operand(0)
    # COMPARE first sets EQ; each logical operation then produces a nonzero
    # result, so native logic_store replaces the flags and IF_EQ skips DAMAGE.
    for opcode, right in ((0x2F, 1), (0x30, 2)):
        logical = bytes([opcode]) + immediate_operand(1) + immediate_operand(right) + memory_operand(0x009B)
        code = compare + logical + bytes([0x16]) + damage_instruction() + bytes([0x00])
        result = walk_area([b"", block_with_entry(20, code)], {1: 1}, 1, range(1),
                           seed_cell_descriptor=0)
        assert not any(opcode == 0x2E for _, _, opcode in result.sites)

    source = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    logic_store = source[source.index("logic_store:"):source.index("; ---- 0x08 RANDOM")]
    assert "call    set_cmp_flags" in logic_store


def test_gen2_surprise_is_terminal_and_matches_native_handler() -> None:
    code = bytes([0x1F]) + bytes(4) + damage_instruction() + bytes([0x00])
    result = walk_area([b"", block_with_entry(20, code)], {1: 1}, 1, range(1),
                       seed_cell_descriptor=0)

    assert not any(opcode == 0x2E for _, _, opcode in result.sites)
    source = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    handler = source[source.index("op_surprise:"):source.index("; ---- 0x2A GETTABLE")]
    assert "cmp     byte [is_gen2], 1" in handler
    assert "je      .short" in handler
    assert "mov     byte [flow_stop], 1" in handler


def test_gen2_short_menu_consumes_counted_packed_labels_before_next_opcode() -> None:
    # Retail area 61/member 41 at vaddr 0x9ff5 begins:
    # 31 01 BF 00 00 02, then 13- and 14-byte packed labels. This synthetic
    # control preserves the exact operand framing and verifies the next opcode
    # begins after all 37 bytes instead of inside the first label.
    menu = bytes([0x31, 0x01, 0xBF, 0x00, 0x00, 0x02])
    menu += bytes([0x80, 13]) + bytes(13)
    menu += bytes([0x80, 14]) + bytes(14)
    block = bytes(20) + menu + bytes([0x00])

    decoded = decode_one(block, 20)
    following = decode_one(block, 20 + len(menu))

    assert decoded is not None
    assert (decoded.mnemonic, decoded.size, len(decoded.args)) == ("SHORT_MENU", 37, 4)
    assert following is not None and following.opcode == 0x00


def test_gen2_treasure_consumes_counted_tail_from_fourth_operand() -> None:
    operands = b"".join(bytes([0x00, value]) for value in (1, 2, 3, 2, 4, 5))
    block = bytes(20) + bytes([0x27]) + operands + bytes([0x00])

    decoded = decode_one(block, 20)
    following = decode_one(block, 20 + 13)

    assert decoded is not None
    assert (decoded.mnemonic, decoded.size, len(decoded.args)) == ("TREASURE", 13, 6)
    assert following is not None and following.opcode == 0x00


def test_seeded_fresh_sparse_cells_start_zero_and_known_saves_replace_them() -> None:
    for address in (0x0020, 0x00BE, 0x00FB):
        compare_zero_to_one = bytes([0x03]) + memory_operand(address) + immediate_operand(1)
        damage = damage_instruction()
        conditional = block_with_entry(20, compare_zero_to_one + bytes([0x19]) + damage + bytes([0x00]))
        seeded = walk_area([b"", conditional], {1: 1}, 1, range(1), seed_cell_descriptor=0)
        assert not any(opcode == 0x2E for _, _, opcode in seeded.sites)

    save_one = bytes([0x09]) + immediate_operand(1) + memory_operand(0x0020)
    compare_written = bytes([0x03]) + memory_operand(0x0020) + immediate_operand(1)
    written_block = block_with_entry(20, save_one + compare_written + bytes([0x16]) + damage + bytes([0x00]))
    written = walk_area([b"", written_block], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert any(opcode == 0x2E for _, _, opcode in written.sites)


def test_seeded_fresh_sparse_counter_defaults_to_zero() -> None:
    source = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    mem_get = source[source.index("mem_get:"):source.index("; mem_set:")]
    assert "xor     ax, ax" in mem_get
    reset = source[source.index("vm_reset_all:"):source.index("; ============================================================================\n;  vm_start_block")]
    mem_get = source[source.index("mem_get:"):source.index("selected_in_combat_value:")]
    call_handler = source[source.index("op_call:"):source.index("; ---- 0x34 ECL_CLOCK")]
    known_call = call_handler[call_handler.index(".known:"):call_handler.index(".redraw_dungeon_view:")]
    assert "mov     word [memcount], 0" in reset
    assert ".miss:" in mem_get and "xor     ax, ax" in mem_get
    assert "cmp     ax, 0001h" in call_handler and "cmp     ax, 0002h" in call_handler
    assert "call    mem_set" not in known_call

    setup_duel = bytes([0x2D]) + immediate_operand(1)
    increment = bytes([0x04]) + immediate_operand(1) + memory_operand(0x013D) + memory_operand(0x013D)
    compare = bytes([0x03]) + memory_operand(0x013D) + immediate_operand(2)
    damage = bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)
    code = setup_duel + increment + compare + bytes([0x16]) + damage + bytes([0x00])
    members = [b"", block_with_entry(20, code)]

    unconstrained = walk_area(members, {1: 1}, 1, range(1))
    fresh_vm = walk_area(members, {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert (1, 20 + len(setup_duel) + len(increment) + len(compare) + 1, 0x2E) in unconstrained.sites
    # CALL #1 is itself a recordable event candidate; the seeded counter must
    # prune only the DAMAGE behind the now-false comparison branch.
    assert (1, 20, 0x2D) in fresh_vm.sites
    assert not any(opcode == 0x2E for _, _, opcode in fresh_vm.sites)


def test_seeded_fresh_sparse_009d_prunes_guard_and_tracks_known_save() -> None:
    compare = bytes([0x03]) + memory_operand(0x009D) + immediate_operand(1)
    damage = bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)
    guarded = block_with_entry(20, compare + bytes([0x16]) + damage + bytes([0x00]))
    fresh = walk_area([b"", guarded], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    unconstrained = walk_area([b"", guarded], {1: 1}, 1, range(1))
    assert not any(opcode == 0x2E for _, _, opcode in fresh.sites)
    assert any(opcode == 0x2E for _, _, opcode in unconstrained.sites)

    write_one = bytes([0x09]) + immediate_operand(1) + memory_operand(0x009D)
    written = block_with_entry(20, write_one + compare + bytes([0x16]) + damage + bytes([0x00]))
    after_save = walk_area([b"", written], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert any(opcode == 0x2E for _, _, opcode in after_save.sites)


def test_seeded_host_position_resolves_compare_branch() -> None:
    compare = bytes([0x03]) + memory_operand(0x0111) + immediate_operand(3)
    damage = bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)
    code = compare + bytes([0x16]) + damage + bytes([0x00])
    members = [b"", block_with_entry(20, code)]

    unknown = walk_area(members, {1: 1}, 1, range(1), seed_cell_descriptor=0)
    east = walk_area(members, {1: 1}, 1, range(1), seed_cell_descriptor=0,
                     seed_map_position=(3, 0))
    west = walk_area(members, {1: 1}, 1, range(1), seed_cell_descriptor=0,
                     seed_map_position=(2, 0))
    assert any(opcode == 0x2E for _, _, opcode in unknown.sites)
    assert any(opcode == 0x2E for _, _, opcode in east.sites)
    assert not any(opcode == 0x2E for _, _, opcode in west.sites)


def test_gettable_reads_inline_byte_and_truncates_offset_to_one_byte() -> None:
    gettable = (bytes([0x2A]) + target_operand(0x8050) + memory_operand(0x00C0)
                + memory_operand(0x00BF))
    compare = bytes([0x03]) + memory_operand(0x00BF) + immediate_operand(1)
    code = (
        bytes([0x09]) + immediate_operand(255) + memory_operand(0x00C0)
        + bytes([0x04]) + immediate_operand(2) + memory_operand(0x00C0) + memory_operand(0x00C0)
        + gettable + compare + bytes([0x16]) + damage_instruction() + bytes([0x00])
    )
    block = bytearray(block_with_entry(20, code))
    block.extend(bytes(max(0, 0x52 - len(block))))
    block[0x51] = 1

    result = walk_area([b"", bytes(block)], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    damage_offset = 20 + len(code) - len(damage_instruction()) - 1
    assert (1, damage_offset, 0x2E) in result.sites

    block[0x51] = 2
    no_damage = walk_area([b"", bytes(block)], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert not any(opcode == 0x2E for _, _, opcode in no_damage.sites)


def test_gettable_honors_sparse_override_before_inline_bytes() -> None:
    save_table = (bytes([0x35]) + immediate_operand(2) + target_operand(0x8050)
                  + immediate_operand(0))
    gettable = (bytes([0x2A]) + target_operand(0x8050) + immediate_operand(0)
                + memory_operand(0x009B))
    compare = bytes([0x03]) + memory_operand(0x009B) + immediate_operand(1)
    code = save_table + gettable + compare + bytes([0x16]) + damage_instruction() + bytes([0x00])
    block = bytearray(block_with_entry(20, code))
    block.extend(bytes(max(0, 0x51 - len(block))))
    block[0x50] = 1  # Inline value disagrees with the sparse SAVE_TABLE value.

    result = walk_area([b"", bytes(block)], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert any(opcode == 0x35 for _, _, opcode in result.sites)
    assert not any(opcode == 0x2E for _, _, opcode in result.sites)


def test_savetable_keeps_full_word_address_offset() -> None:
    seed_offset = (
        bytes([0x09]) + immediate_operand(255) + memory_operand(0x00C0)
        + bytes([0x04]) + immediate_operand(1) + memory_operand(0x00C0) + memory_operand(0x00C0)
    )
    save_table = (bytes([0x35]) + immediate_operand(2) + target_operand(0x8050)
                  + memory_operand(0x00C0))
    gettable = (bytes([0x2A]) + target_operand(0x8050) + immediate_operand(0)
                + memory_operand(0x009B))
    compare = bytes([0x03]) + memory_operand(0x009B) + immediate_operand(1)
    code = seed_offset + save_table + gettable + compare + bytes([0x16]) + damage_instruction() + bytes([0x00])
    block = bytearray(block_with_entry(20, code))
    block.extend(bytes(max(0, 0x51 - len(block))))
    block[0x50] = 1

    result = walk_area([b"", bytes(block)], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert any(opcode == 0x2E for _, _, opcode in result.sites)


def test_unknown_savetable_write_widens_later_gettable_result() -> None:
    # A table read must not keep using the inline byte after its sparse-memory
    # key becomes uncertain.
    save_table = (bytes([0x35]) + memory_operand(0x00CC) + target_operand(0x8050)
                  + immediate_operand(0))
    gettable = (bytes([0x2A]) + target_operand(0x8050) + immediate_operand(0)
                + memory_operand(0x009B))
    compare = bytes([0x03]) + memory_operand(0x009B) + immediate_operand(1)
    code = save_table + gettable + compare + bytes([0x16]) + damage_instruction() + bytes([0x00])
    block = bytearray(block_with_entry(20, code))
    block.extend(bytes(max(0, 0x51 - len(block))))
    block[0x50] = 2  # Inline alone would prune the damage branch.

    result = walk_area([b"", bytes(block)], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert any(opcode == 0x2E for _, _, opcode in result.sites)


def test_parlay_destination_invalidates_matching_sparse_table_override() -> None:
    save_table = (bytes([0x35]) + immediate_operand(2) + target_operand(0x8050)
                  + immediate_operand(0))
    parlay = bytes([0x2C]) + target_operand(0x8050)
    gettable = (bytes([0x2A]) + target_operand(0x8050) + immediate_operand(0)
                + memory_operand(0x009B))
    compare = bytes([0x03]) + memory_operand(0x009B) + immediate_operand(1)
    code = save_table + parlay + gettable + compare + bytes([0x16]) + damage_instruction() + bytes([0x00])
    block = bytearray(block_with_entry(20, code))
    block.extend(bytes(max(0, 0x51 - len(block))))
    block[0x50] = 2  # The eventual value is unknown after PARLAY writes it.

    result = walk_area([b"", bytes(block)], {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert any(opcode == 0x2E for _, _, opcode in result.sites)


def test_gettable_and_savetable_source_contract_matches_native_width_rules() -> None:
    source = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    gettable = source[source.index("op_gettable:"):source.index("; ---- 0x35 SAVE_TABLE")]
    savetable = source[source.index("op_savetable:"):source.index("; ---- 0x1C CLEAR_MONSTERS")]
    assert "and     ax, 00ffh" in gettable
    assert "je      .mem_hit" in gettable
    assert gettable.index(".mem_miss:") < gettable.index("mov     al, [blk+si]") < gettable.index(".mem_hit:")
    assert "add     ax, [t1]" in savetable
    assert "cmp     byte [t2], 1" in savetable
    assert "and     ax, 00ffh" in savetable
    parlay = source[source.index("op_parlay:"):source.index("; ---- 0x39 WHO")]
    assert "mov     bx, [o_word]" in parlay and "call    mem_set" in parlay


def test_seeded_divide_and_multiply_feed_exact_selector_values() -> None:
    arithmetic = (
        bytes([0x06]) + immediate_operand(12) + immediate_operand(3) + memory_operand(0x00CA)
        + bytes([0x07]) + immediate_operand(2) + memory_operand(0x00CA) + memory_operand(0x00CB)
    )
    compare = bytes([0x03]) + memory_operand(0x00CB) + immediate_operand(8)
    damage = bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)
    code = arithmetic + compare + bytes([0x16]) + damage + bytes([0x00])
    members = [b"", block_with_entry(20, code)]
    result = walk_area(members, {1: 1}, 1, range(1), seed_cell_descriptor=0)
    assert any(opcode == 0x2E for _, _, opcode in result.sites)

    source = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    divide = source[source.index("op_div:"):source.index("op_mul:")]
    multiply = source[source.index("op_mul:"):source.index("op_and:")]
    assert "div     word [t1]" in divide
    assert "mov     [t2], ax" in divide
    assert "mul     word [t1]" in multiply


def test_explicit_start_vaddr_bypasses_other_header_entry_prefix() -> None:
    damage = bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)
    code = bytes([0x00]) + damage + bytes([0x00])
    members = [b"", block_with_entry(20, code)]

    header_entry = walk_area(members, {1: 1}, 1, range(1))
    direct_trace = walk_area(members, {1: 1}, 1, range(1), start_vaddr=0x8015)
    assert not any(opcode == 0x2E for _, _, opcode in header_entry.sites)
    assert any(opcode == 0x2E for _, _, opcode in direct_trace.sites)


def assert_loadpieces_source_contract(ccecl: str) -> None:
    section = ccecl[ccecl.index("op_loadpieces:"):ccecl.index("note_loadfiles_repeat:")]
    code = re.sub(r"\s+", " ", " ".join(line.split(";", 1)[0] for line in section.splitlines()))
    assert "mov al, [is_gen2] and al, 1 or al, [short2_frames] jnz loadpieces_gen2" in code
    legacy, gen2 = section.split("loadpieces_gen2:", 1)
    assert len(re.findall(r"call\s+read_opp\b", legacy)) == 3
    assert "call op_script_effect" in re.sub(r"\s+", " ", gen2)
    assert "party_names" in gen2 and "party_ext+bx" in gen2
    assert "FX_HAVE_PIECES" not in section


def test_loadpieces_guard_rejects_wrong_dialect_and_missing_lookup() -> None:
    ccecl = (Path(__file__).resolve().parents[1] / "native/src/ccecl.asm").read_text()
    assert_loadpieces_source_contract(ccecl)
    prefix, handler = ccecl.split("op_loadpieces:", 1)
    for old, new in (
        ("mov     al, [is_gen2]", "mov     al, [is_dok]"),
        ("and     al, 1", "and     al, 2"),
        ("and     al, 1", "or      al, al"),
        ("or      al, [short2_frames]", "or      al, al"),
        ("jnz     loadpieces_gen2", "jnz     op_script_effect"),
    ):
        mutated = prefix + "op_loadpieces:" + handler.replace(old, new, 1)
        assert mutated != ccecl
        with pytest.raises(AssertionError):
            assert_loadpieces_source_contract(mutated)


def test_effect_producers_and_known_consumers_keep_the_documented_split() -> None:
    root = Path(__file__).resolve().parents[1]
    ccecl = (root / "native/src/ccecl.asm").read_text()
    gbboot = (root / "native/src/gbboot.asm").read_text()
    ccflow = (root / "native/src/ccflow.asm").read_text()
    ccfp = (root / "native/src/ccfp.asm").read_text()
    ccefx = (root / "native/src/ccefx.asm").read_text()

    add_npc = ccecl[ccecl.index("op_addnpc:"):ccecl.index("; ---- 0x37 LOAD_PIECES")]
    assert "fx_npc_joins" in add_npc and "FX_HAVE_NPC" in add_npc
    assert_loadpieces_source_contract(ccecl)

    ecl_return = gbboot[gbboot.index(".ecl_return:"):gbboot.index(".combat_effect_geo:")]
    assert ecl_return.index("call    read_effect_header") < ecl_return.index("call    apply_effect_damage_roster")
    assert ecl_return.index("call    apply_effect_damage_roster") < ecl_return.index("call    mutation_bridge")
    private_replay = ccflow[ccflow.index(".run:\n"):ccflow.index(".terminal:")]
    for operation in ("call    is_script_full", "call    append_current_chunk", "call    use_resume_tail", "jmp     .run"):
        assert operation in private_replay
    assert "call    apply_effect_damage_roster" not in private_replay

    page_start = ccfp.index("build_effect_page:")
    page_builder = ccfp[page_start:page_start + 5000]
    for opcode in ("3Dh", "33h", "11h", "12h"):
        assert opcode in page_builder
    assert "FX_HAVE_NPC" in ccefx and "FX_NPC_JOINS_OFF" in ccefx


def test_ccflow_capacity_replay_carries_deferred_damage_to_seeded_reader() -> None:
    prints = bytes([0x11, 0x00, 0x00]) * 64
    damage = bytes([0x2E]) + bytes([0x00, 0x01]) * 5
    checkparty = bytes([0x1E]) + bytes([0x00, 0x01]) * 6
    code = prints + damage + checkparty + bytes([0x22])  # prompt yields after the read
    members = [b"", block_with_entry(20, code)]

    stopped = walk_area(members, {1: 1}, 1, range(1))
    replayed = walk_area(members, {1: 1}, 1, range(1), follow_capacity=True)
    assert not stopped.post_capacity_damage_reads
    assert (1, 20 + len(prints) + len(damage), 0x1E) in replayed.post_capacity_damage_reads


def test_follow_capacity_stops_at_second_full_chunk() -> None:
    first_chunk = bytes([0x11, 0x00, 0x00]) * 64
    damage = bytes([0x2E]) + bytes([0x00, 0x01]) * 5
    second_chunk = bytes([0x11, 0x00, 0x00]) * 63
    party_strength = bytes([0x1D])  # Recordable seeded reader.
    code = first_chunk + damage + second_chunk + party_strength + bytes([0x22])
    members = [b"", block_with_entry(20, code)]

    replayed = walk_area(members, {1: 1}, 1, range(1), follow_capacity=True)
    assert (1, 20 + len(first_chunk) + len(damage) + len(second_chunk), 0x1D) in replayed.capacity_boundaries
    assert not replayed.post_capacity_damage_reads


def test_capacity_chunk_limit_reaches_multiple_private_replays() -> None:
    prints = bytes([0x11, 0x00, 0x00]) * 200
    block = block_with_entry(20, prints + bytes([0x00]))

    replayed = walk_area([b"", block], {1: 1}, 1, range(1), capacity_replays=2)

    assert {level + 1 for _, _, _, level in replayed.capacity_boundary_levels} == {1, 2, 3}


def test_seeded_cell_descriptor_resolves_if_polarity_and_on_goto_selector() -> None:
    compare = bytes([0x03]) + memory_operand(0x002D) + immediate_operand(8)
    damage = bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)
    conditional = block_with_entry(20, compare + bytes([0x16]) + damage + bytes([0x00]))
    matching = walk_area([b"", conditional], {1: 1}, 1, range(1), seed_cell_descriptor=8)
    nonmatching = walk_area([b"", conditional], {1: 1}, 1, range(1), seed_cell_descriptor=7)
    assert (1, 20 + len(compare) + 1, 0x2E) in matching.sites
    assert not nonmatching.sites

    and_cell = bytes([0x2F]) + memory_operand(0x002D) + immediate_operand(127) + memory_operand(0x009B)
    subtract = bytes([0x05]) + immediate_operand(1) + memory_operand(0x009B) + memory_operand(0x00BF)
    on_size = 1 + len(memory_operand(0x00BF)) + len(immediate_operand(2)) + 2 * len(target_operand(0x8000))
    target0_offset = 20 + len(and_cell) + len(subtract) + on_size
    damage_site = bytes([0x2E]) + immediate_operand(16) + immediate_operand(2) + immediate_operand(6) + immediate_operand(0) + immediate_operand(60)
    target1_offset = target0_offset + len(damage_site) + 1
    on_goto = (bytes([0x25]) + memory_operand(0x00BF) + immediate_operand(2)
               + target_operand(0x8000 + target0_offset)
               + target_operand(0x8000 + target1_offset))
    call_site = bytes([0x2D]) + immediate_operand(1)
    selectors = and_cell + subtract + on_goto + damage_site + bytes([0x00]) + call_site + bytes([0x00])
    selector_block = block_with_entry(20, selectors)
    unknown = walk_area([b"", selector_block], {1: 1}, 1, range(1))
    selected = walk_area([b"", selector_block], {1: 1}, 1, range(1), seed_cell_descriptor=2)
    assert (1, target0_offset, 0x2E) in unknown.sites
    assert (1, target0_offset, 0x2E) not in selected.sites
    assert (1, target1_offset, 0x2D) in selected.sites
