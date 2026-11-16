#!/usr/bin/env python3
"""Conservative DQK HLIB invocation walk across NEWECL chains and calls.

This reports decoded host-effect candidate sites that can occur before a
CCECL yield. It explores both sides of conditional branches and all ON_*
targets, follows literal NEWECL IDs, and models the bounded GOSUB stack. It is
an overapproximation: VM-memory conditions and dynamic chain IDs are unknown.
Optional entry-slot and cell-descriptor seeds prune only the tracked cell
selector slice. Seeded mode starts with fresh sparse memory, then tracks cells
0x0020, 0x0097, 0x009d, 0x00be, 0x00fb, 0x013d, and 0x013e; optional
host-position seeds track 0x0111/0x0112. Known arithmetic carries selector cells 0x00bf,
0x00c0/0x00c1, and 0x00ca/0x00cb/0x00cc. Seeded GETTABLE reads check tracked
sparse overrides before the inline ECL member byte. An unknown write widens
later table reads; other VM memory remains unknown.

`--menu-answer VADDR=CHOICE` supplies one zero-based reply at a specific menu
instruction and follows that cold-resume continuation. `--prompt-answer
VADDR=VALUE` supplies a raw 16-bit `INPUT_NUMBER` value or a `PARTY_SURPRISE`
reply (`0=Yes`, `1=No`). Both follow the cold-resume continuation and reset
the invocation-local event count. This is a route probe, not a claim about
unknown answers elsewhere in the walk. With `--headless-prompts`, supplied
answers instead continue inside the same CCECL invocation, matching configured
headless inputs and menu choices. `--acknowledge VADDR` models an explicit
cold acknowledgement of DQK `PARTYSTRENGTH` (`0x1D`): it resumes after that
opcode with a fresh event count and injects no player answer.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass, replace
from pathlib import Path

from dqk_ecl_combat_scan import (
    ECL_HEADER_LEN,
    Instruction,
    decode_one,
    header_entries,
    in_code,
    parse_id_table,
    read_hlib_data_archive,
    target_offset,
)
from dqk_ca03_stream_decode import read_opp

CALLCAP = 32
STATECAP = 500_000
SCRIPTCAP = 64
# CCECL's script_event_mask bytes for opcodes 0x00..0xFF (native/src/ccecl.asm).
SCRIPT_EVENT_MASK = bytes.fromhex(
    "00 c0 27 a0 8c 7b 9a 27 6e 18 00 00 00 00 00 00 "
    "00 00 00 00 02 00 00 00 00 00 00 00 00 00 00 00"
)

# Candidates are collected for review; their presence does not assert that the
# native host applies them. SAVE_TABLE is included as a VM-local write control.
EFFECT_CANDIDATES = {
    0x21: "LOAD_FILES",
    0x27: "TREASURE",
    0x2D: "CALL",
    0x2E: "DAMAGE",
    0x35: "SAVE_TABLE",
    0x36: "ADD_NPC",
    0x37: "LOAD_PIECES",
    0x38: "PROGRAM",
    0x3B: "SPELL",
}

# These Gen2 operations stop CCECL and return an effect to its caller. Empty
# RETURN is handled separately because RETURN with a nonempty stack is local.
YIELD_OPS = {0x00, 0x0F, 0x10, 0x15, 0x1D, 0x1F, 0x22, 0x23, 0x24, 0x2B, 0x31, 0x39}
ACK_OPS = {0x1D}
PROMPT_OPS = {0x0F, 0x10, 0x15, 0x22, 0x2B, 0x2C, 0x31}
PARTY_SEED_READERS = {
    0x0A: "LOAD_CHARACTER",
    0x1D: "PARTYSTRENGTH",
    0x1E: "CHECKPARTY",
    0x32: "FIND_ITEM",
    0x3B: "SPELL",
    0x3F: "FIND_SPECIAL",
    0x40: "DESTROY_ITEMS",
}

# ECL operations whose source or host effect can depend on loaded title data or
# mutable host state. Record these only after CCFLOW has replayed at least one
# full private chunk so a reviewer can distinguish them from first-chunk sites.
POST_CAPACITY_INTERESTS = {
    0x0E: "PICTURE",
    **EFFECT_CANDIDATES,
    **PARTY_SEED_READERS,
}


@dataclass(frozen=True)
class TrackedValues:
    cell_descriptor: int | None
    value_009b: int | None = None
    value_00bf: int | None = None
    compare: int | None = None
    value_013d: int | None = None
    value_013e: int | None = None
    value_009d: int | None = None
    value_0097: int | None = None
    value_0111: int | None = None
    value_0112: int | None = None
    value_00ca: int | None = None
    value_00cb: int | None = None
    value_00cc: int | None = None
    value_00c0: int | None = None
    value_00c1: int | None = None
    value_0020: int | None = None
    value_00be: int | None = None
    value_00fb: int | None = None
    sparse_overrides: tuple[tuple[int, int | None], ...] | None = ()


@dataclass(frozen=True)
class State:
    member: int
    offset: int
    entry_slot: int
    stack: tuple[int, ...]
    event_count: int
    damage_pending: bool
    capacity_replays: int
    tracked: TrackedValues


@dataclass
class AreaWalk:
    sites: set[tuple[int, int, int]]
    unresolved_chains: set[tuple[int, int]]
    capacity_boundaries: set[tuple[int, int, int]]
    post_capacity_damage_reads: set[tuple[int, int, int]]
    post_capacity_interests: set[tuple[int, int, int]]
    yield_points: set[tuple[int, int, int, int, int, bool]]
    capacity_boundary_levels: set[tuple[int, int, int, int]]
    states: int
    capped: bool


def _valid_entry(block: bytes, slot: int) -> int | None:
    entries = header_entries(block)
    if slot >= len(entries):
        return None
    entry = entries[slot]
    return entry if in_code(block, entry) else None


def _operand_frames(block: bytes, ins: Instruction, count: int) -> list[tuple[str, int | None]]:
    pos = ins.offset + 1
    out: list[tuple[str, int | None]] = []
    for _ in range(count):
        text, pos, value = read_opp(block, pos)
        out.append((text, value))
    return out


def _known_operand(frame: tuple[str, int | None], tracked: TrackedValues) -> int | None:
    text, value = frame
    if text.startswith("#"):
        return value
    if not text.startswith("0x") or value is None:
        return None
    if value == 0x002D:
        return tracked.cell_descriptor
    if value == 0x009B:
        return tracked.value_009b
    if value == 0x00BF:
        return tracked.value_00bf
    if value == 0x013D:
        return tracked.value_013d
    if value == 0x013E:
        return tracked.value_013e
    if value == 0x009D:
        return tracked.value_009d
    if value == 0x0097:
        return tracked.value_0097
    if value == 0x0111:
        return tracked.value_0111
    if value == 0x0112:
        return tracked.value_0112
    if value == 0x00CA:
        return tracked.value_00ca
    if value == 0x00CB:
        return tracked.value_00cb
    if value == 0x00CC:
        return tracked.value_00cc
    if value == 0x00C0:
        return tracked.value_00c0
    if value == 0x00C1:
        return tracked.value_00c1
    if value == 0x0020:
        return tracked.value_0020
    if value == 0x00BE:
        return tracked.value_00be
    if value == 0x00FB:
        return tracked.value_00fb
    return None


def _destination(frame: tuple[str, int | None]) -> int | None:
    text, value = frame
    return value if text.startswith("0x") else None


def _set_tracked(tracked: TrackedValues, destination: int | None, value: int | None) -> TrackedValues:
    field = {
        0x002D: "cell_descriptor",
        0x009B: "value_009b",
        0x00BF: "value_00bf",
        0x013D: "value_013d",
        0x013E: "value_013e",
        0x009D: "value_009d",
        0x0097: "value_0097",
        0x0111: "value_0111",
        0x0112: "value_0112",
        0x00CA: "value_00ca",
        0x00CB: "value_00cb",
        0x00CC: "value_00cc",
        0x00C0: "value_00c0",
        0x00C1: "value_00c1",
        0x0020: "value_0020",
        0x00BE: "value_00be",
        0x00FB: "value_00fb",
    }.get(destination)
    return tracked if field is None else replace(tracked, **{field: value})


def _write_sparse(tracked: TrackedValues, destination: int | None,
                  value: int | None) -> TrackedValues:
    """Apply one known VM sparse-memory write, or widen if its key is unknown."""
    if tracked.sparse_overrides is None:
        return tracked
    if destination is None:
        return replace(tracked, sparse_overrides=None)
    overrides = dict(tracked.sparse_overrides)
    overrides[destination & 0xFFFF] = value
    return replace(tracked, sparse_overrides=tuple(sorted(overrides.items())))


def _gettable_value(block: bytes, address: int,
                    tracked: TrackedValues) -> int | None:
    """Match DQK GETTABLE: sparse override first, then one inline ECL byte."""
    if tracked.sparse_overrides is None:
        return None
    overrides = dict(tracked.sparse_overrides)
    key = address & 0xFFFF
    if key in overrides:
        return overrides[key]
    offset = key - 0x8000 if key >= 0x8000 else key
    if ECL_HEADER_LEN <= offset < len(block):
        return block[offset]
    return 0


def _menu_answer_valid(block: bytes, ins: Instruction, tracked: TrackedValues,
                       menu_answers: dict[int, int]) -> bool:
    answer = menu_answers.get(ins.vaddr)
    if answer is None:
        return False
    if ins.opcode == 0x39:  # WHO's selection count comes from the imported party roster.
        return 0 <= answer < 6
    if ins.opcode == 0x15:
        frames = _operand_frames(block, ins, 3)
        count = _known_operand(frames[2], tracked)
    elif ins.opcode in (0x2B, 0x31):
        frames = _operand_frames(block, ins, 2)
        count = _known_operand(frames[1], tracked)
    else:
        return False
    return count is not None and 0 <= answer < count


def _prompt_answer_valid(ins: Instruction, prompt_answers: dict[int, int]) -> bool:
    answer = prompt_answers.get(ins.vaddr)
    if answer is None:
        return False
    if ins.opcode == 0x0F:  # INPUT_NUMBER stores a 16-bit result.
        return 0 <= answer <= 0xFFFF
    if ins.opcode == 0x22:  # Gen2 PARTY_SURPRISE: 0=Yes, 1=No.
        return answer in (0, 1)
    return False


def _track_instruction(block: bytes, ins: Instruction, tracked: TrackedValues,
                       menu_answers: dict[int, int] | None = None,
                       prompt_answers: dict[int, int] | None = None) -> TrackedValues:
    """Track the DQK cell descriptor and small selector temporaries when seeded."""
    answers = menu_answers or {}
    prompt_values = prompt_answers or {}
    if tracked.cell_descriptor is None and not answers and not prompt_values:
        return tracked
    op = ins.opcode
    if op in (0x03, 0x04, 0x05, 0x06, 0x07, 0x2F, 0x30):
        count = 2 if op == 0x03 else 3
        frames = _operand_frames(block, ins, count)
        values = [_known_operand(frame, tracked) for frame in frames]
        if op == 0x03:
            left, right = values
            if left is None or right is None:
                compare = None
            else:
                signed_left = left - 0x10000 if left & 0x8000 else left
                signed_right = right - 0x10000 if right & 0x8000 else right
                compare = (signed_left > signed_right) - (signed_left < signed_right)
            return replace(tracked, compare=compare)
        destination = _destination(frames[2])
        if op == 0x2F:
            value = None if values[0] is None or values[1] is None else values[0] & values[1]
        elif op == 0x30:
            value = None if values[0] is None or values[1] is None else values[0] | values[1]
        elif op == 0x05:  # ECL SUBTRACT is operand 2 minus operand 1.
            value = None if values[0] is None or values[1] is None else (values[1] - values[0]) & 0xFFFF
        elif op == 0x06:
            value = None if values[0] is None or values[1] is None else (
                0 if values[1] == 0 else values[0] // values[1]
            )
        elif op == 0x07:
            value = None if values[0] is None or values[1] is None else (values[0] * values[1]) & 0xFFFF
        else:
            value = None if values[0] is None or values[1] is None else (values[0] + values[1]) & 0xFFFF
        tracked = _write_sparse(tracked, destination, value)
        tracked = _set_tracked(tracked, destination, value)
        if op in (0x2F, 0x30):
            if value is None:
                compare = None
            else:
                signed_value = value - 0x10000 if value & 0x8000 else value
                compare = (signed_value > 0) - (signed_value < 0)
            tracked = replace(tracked, compare=compare)
        return tracked
    if op == 0x09:  # SAVE source,destination
        frames = _operand_frames(block, ins, 2)
        destination = _destination(frames[1])
        value = _known_operand(frames[0], tracked)
        tracked = _write_sparse(tracked, destination, value)
        return _set_tracked(tracked, destination, value)
    if op == 0x08:  # RANDOM writes operand 2.
        frames = _operand_frames(block, ins, 2)
        destination = _destination(frames[1])
        tracked = _write_sparse(tracked, destination, None)
        return _set_tracked(tracked, destination, None)
    if op in (0x0F, 0x10):  # INPUT_NUMBER / INPUT_STRING write operand 2.
        frames = _operand_frames(block, ins, 2)
        destination = _destination(frames[1])
        value = (prompt_values[ins.vaddr]
                 if op == 0x0F and _prompt_answer_valid(ins, prompt_values) else None)
        tracked = _write_sparse(tracked, destination, value)
        tracked = _set_tracked(tracked, destination, value)
    elif op == 0x15:  # VERTICAL_MENU writes its first operand.
        frames = _operand_frames(block, ins, 3)
        destination = _destination(frames[0])
        if _menu_answer_valid(block, ins, tracked, answers):
            answer = answers[ins.vaddr]
            tracked = _write_sparse(tracked, destination, answer)
            tracked = _set_tracked(tracked, destination, answer)
        else:
            tracked = _write_sparse(tracked, destination, None)
            tracked = _set_tracked(tracked, destination, None)
    elif op in (0x2B, 0x31):  # HORIZONTAL_MENU / Gen2 SHORT_MENU.
        frames = _operand_frames(block, ins, 2)
        destination = _destination(frames[0])
        value = answers.get(ins.vaddr) if _menu_answer_valid(block, ins, tracked, answers) else None
        tracked = _write_sparse(tracked, destination, value)
        tracked = _set_tracked(tracked, destination, value)
    elif op == 0x2A:  # GETTABLE reads literal base + byte(offset), writes operand 3.
        frames = _operand_frames(block, ins, 3)
        base = frames[0][1]  # Native handler uses operand 1 as a literal address.
        offset = _known_operand(frames[1], tracked)
        value = None if base is None or offset is None else _gettable_value(
            block, (base + (offset & 0xFF)) & 0xFFFF, tracked
        )
        destination = _destination(frames[2])
        tracked = _write_sparse(tracked, destination, value)
        tracked = _set_tracked(tracked, destination, value)
    elif op == 0x3B:  # SPELL writes slot and player result destinations.
        frames = _operand_frames(block, ins, 3)
        for frame in frames[1:]:
            destination = _destination(frame)
            tracked = _write_sparse(tracked, destination, None)
            tracked = _set_tracked(tracked, destination, None)
    elif op == 0x2C:  # PARLAY writes its selected response to operand 1.
        frames = _operand_frames(block, ins, 1)
        destination = _destination(frames[0])
        tracked = _write_sparse(tracked, destination, None)
        tracked = _set_tracked(tracked, destination, None)
    elif op == 0x22 and _prompt_answer_valid(ins, prompt_values):
        # DQK clears EQ/NE/LT/GT, then sets EQ for Yes and NE for No.
        return replace(tracked, compare=0 if prompt_values[ins.vaddr] == 0 else 1)
    if op == 0x1E:  # CHECKPARTY destination framing is not modeled here.
        return replace(TrackedValues(None), sparse_overrides=None)
    if op == 0x35:  # SAVE_TABLE uses a full-word address and may alias any cell.
        frames = _operand_frames(block, ins, 3)
        value = _known_operand(frames[0], tracked)
        base = frames[1][1]  # Native handler uses operand 2 as a literal address.
        offset = _known_operand(frames[2], tracked)
        if base is None or offset is None:
            return replace(tracked, sparse_overrides=None)
        address = (base + offset) & 0xFFFF
        if value is not None:
            # DQK writes one byte for base operand types 0/1, otherwise a word.
            p = ins.offset + 1
            _, p, _ = read_opp(block, p)
            base_type = block[p] if p < len(block) else 0xFF
            if base_type <= 1:
                value &= 0xFF
        tracked = _write_sparse(tracked, address, value)
        return tracked
    if op == 0x2D:
        # CCECL's DQK direct routine ids 1/2 only record the event and advance
        # PC; they do not mutate VM memory or comparison flags.
        if ins.args and ins.args[0] in (1, 2):
            return tracked
        return replace(TrackedValues(None), sparse_overrides=None)  # Other local routine effects are unknown.
    # DQK's host comparisons and input/menu responses can change comparison
    # flags, so do not carry a stale COMPARE result through those operations.
    if op in (0x0F, 0x10, 0x14, 0x15, 0x1D, 0x1F, 0x22, 0x23, 0x24,
              0x28, 0x29, 0x2B, 0x2C, 0x32, 0x39, 0x3B, 0x3F, 0x40):
        return replace(tracked, compare=None)
    return tracked


def _if_result(opcode: int, compare: int) -> bool:
    return {
        0x16: compare == 0,
        0x17: compare != 0,
        0x18: compare < 0,
        0x19: compare > 0,
        0x1A: compare <= 0,
        0x1B: compare >= 0,
    }[opcode]


def walk_area(
    members: list[bytes],
    id_to_member: dict[int, int],
    area: int,
    entry_slots: range = range(5),
    follow_capacity: bool = False,
    seed_cell_descriptor: int | None = None,
    seed_map_position: tuple[int, int] | None = None,
    start_vaddr: int | None = None,
    collect_yields: bool = False,
    menu_answers: dict[int, int] | None = None,
    prompt_answers: dict[int, int] | None = None,
    acknowledged_yields: set[int] | None = None,
    headless_prompts: bool = False,
    capacity_replays: int | None = None,
) -> AreaWalk:
    """Walk one area and carry its header slot across literal NEWECL chains."""
    root_member = id_to_member.get(area)
    if root_member is None or not (0 <= root_member < len(members)):
        return AreaWalk(set(), set(), set(), set(), set(), set(), 0, False)

    replay_limit = (int(follow_capacity) if capacity_replays is None
                    else max(0, capacity_replays))

    queue: deque[State] = deque()
    # A fresh CCECL invocation starts with memcount=0; absent VM cells read as
    # zero. Host position is unknown unless the caller supplies an explicit seed.
    seeded = seed_cell_descriptor is not None
    active_tracked = TrackedValues(
        seed_cell_descriptor,
        value_013d=0 if seeded else None,
        value_013e=0 if seeded else None,
        value_009d=0 if seeded else None,
        value_0097=0 if seeded else None,
        value_0111=None if seed_map_position is None else seed_map_position[0],
        value_0112=None if seed_map_position is None else seed_map_position[1],
        value_0020=0 if seeded else None,
        value_00be=0 if seeded else None,
        value_00fb=0 if seeded else None,
    )
    for slot in entry_slots:
        entry = (start_vaddr - 0x8000 if start_vaddr is not None
                 else _valid_entry(members[root_member], slot))
        if entry is not None:
            if in_code(members[root_member], entry):
                queue.append(State(root_member, entry, slot, (), 0, False, 0, active_tracked))

    seen: set[State] = set()
    sites: set[tuple[int, int, int]] = set()
    unresolved: set[tuple[int, int]] = set()
    capacity_boundaries: set[tuple[int, int, int]] = set()
    capacity_boundary_levels: set[tuple[int, int, int, int]] = set()
    post_capacity_damage_reads: set[tuple[int, int, int]] = set()
    post_capacity_interests: set[tuple[int, int, int]] = set()
    yield_points: set[tuple[int, int, int, int, int, bool]] = set()

    def add(
        member: int,
        offset: int | None,
        slot: int,
        stack: tuple[int, ...],
        event_count: int,
        damage_pending: bool,
        replay_count: int,
        tracked: TrackedValues | None = None,
    ) -> None:
        if 0 <= member < len(members) and in_code(members[member], offset):
            next_tracked = active_tracked if tracked is None else tracked
            queue.append(State(member, int(offset), slot, stack, event_count, damage_pending,
                               replay_count, next_tracked))

    state_cap = STATECAP * max(1, replay_limit + 1)
    while queue and len(seen) < state_cap:
        state = queue.popleft()
        if state in seen:
            continue
        seen.add(state)
        active_tracked = state.tracked
        block = members[state.member]
        ins = decode_one(block, state.offset)
        if ins is None:
            continue

        mask_byte = SCRIPT_EVENT_MASK[ins.opcode >> 3]
        is_event = bool(mask_byte & (1 << (ins.opcode & 7)))
        if is_event and state.event_count >= SCRIPTCAP:
            capacity_boundaries.add((state.member, ins.offset, ins.opcode))
            capacity_boundary_levels.add((state.member, ins.offset, ins.opcode,
                                          state.capacity_replays))
            if state.capacity_replays < replay_limit:
                # CCFLOW stores this full chunk, resumes at the unconsumed PC,
                # and starts a fresh invocation-local GBSX count. Follow only
                # this next chunk: another capacity boundary terminates the
                # walk because the question is about effects/readers before
                # the next terminal yield, unless a larger replay limit is set.
                add(state.member, ins.offset, state.entry_slot, state.stack, 0,
                    state.damage_pending, state.capacity_replays + 1, state.tracked)
            continue
        event_count = state.event_count + int(is_event)
        if state.damage_pending and state.capacity_replays and ins.opcode in PARTY_SEED_READERS:
            post_capacity_damage_reads.add((state.member, ins.offset, ins.opcode))
        if state.capacity_replays and ins.opcode in POST_CAPACITY_INTERESTS:
            post_capacity_interests.add((state.member, ins.offset, ins.opcode))
        damage_pending = state.damage_pending or ins.opcode == 0x2E

        if ins.opcode in EFFECT_CANDIDATES:
            sites.add((state.member, ins.offset, ins.opcode))

        active_tracked = _track_instruction(
            block, ins, state.tracked, menu_answers, prompt_answers
        )

        following = ins.offset + ins.size
        op = ins.opcode

        if op in YIELD_OPS:
            acknowledged = (op in ACK_OPS and acknowledged_yields is not None
                            and ins.vaddr in acknowledged_yields)
            menu_answered = (op in (0x15, 0x2B, 0x31, 0x39)
                             and menu_answers is not None
                             and _menu_answer_valid(block, ins, state.tracked, menu_answers))
            prompt_answered = (op in (0x0F, 0x22)
                               and prompt_answers is not None
                               and _prompt_answer_valid(ins, prompt_answers))
            # In configured headless mode these answers continue in the same
            # invocation; reporting them as yields invents host returns and
            # cold-resume boundaries that CCECL never reaches.
            if collect_yields and not (headless_prompts and (menu_answered or prompt_answered)):
                yield_points.add((state.entry_slot, state.member, ins.offset, op,
                                  event_count, bool(state.capacity_replays)))
            if menu_answered:
                # Interactive replies cold-resume CCECL and reset GBSX count;
                # headless configured answers continue within this invocation.
                add(state.member, ins.offset + ins.size, state.entry_slot, state.stack,
                    event_count if headless_prompts else 0, damage_pending,
                    state.capacity_replays, active_tracked)
            elif prompt_answered:
                add(state.member, ins.offset + ins.size, state.entry_slot, state.stack,
                    event_count if headless_prompts else 0, damage_pending,
                    state.capacity_replays, active_tracked)
            elif acknowledged:
                # A v15 PARTYSTRENGTH acknowledgement cold-starts CCECL; it
                # supplies no selected value. Preserve replay/damage state so
                # the continuation's reader ordering stays visible.
                add(state.member, ins.offset + ins.size, state.entry_slot, state.stack,
                    0, damage_pending, state.capacity_replays, active_tracked)
            continue
        if op == 0x13:  # RETURN pops a local frame; otherwise CCECL returns.
            if state.stack:
                add(state.member, state.stack[-1], state.entry_slot, state.stack[:-1], event_count,
                    damage_pending, state.capacity_replays)
            continue
        if op == 0x20:  # NEWECL resolves in the same VM invocation.
            direct_immediate = ins.offset + 1 < len(block) and block[ins.offset + 1] == 0
            chain_id = ins.args[0] if ins.args else None
            target_member = id_to_member.get(chain_id) if direct_immediate and chain_id is not None else None
            if target_member is None:
                unresolved.add((state.member, ins.offset))
                continue
            target_entry = _valid_entry(members[target_member], state.entry_slot)
            if target_entry is not None:
                # CCECL vm_start_block clears callsp at every chain transition.
                add(target_member, target_entry, state.entry_slot, (), event_count,
                    damage_pending, state.capacity_replays,
                    replace(active_tracked, compare=None))
            continue
        if op == 0x01:  # GOTO; nonlocal target falls through in CCECL.
            target = target_offset(ins.args[0] if ins.args else None)
            add(state.member, target if in_code(block, target) else following,
                state.entry_slot, state.stack, event_count, damage_pending, state.capacity_replays)
            continue
        if op == 0x02:  # GOSUB; nonlocal target falls through.
            target = target_offset(ins.args[0] if ins.args else None)
            if not in_code(block, target):
                add(state.member, following, state.entry_slot, state.stack, event_count,
                    damage_pending, state.capacity_replays)
            elif len(state.stack) < CALLCAP:
                add(state.member, target, state.entry_slot, state.stack + (following,), event_count,
                    damage_pending, state.capacity_replays)
            # A local GOSUB at CALLCAP halts CCECL; it does not fall through.
            continue
        if op in (0x25, 0x26):  # ON_GOTO / ON_GOSUB: explore all targets + fallthrough.
            count = ins.args[1] if len(ins.args) > 1 and ins.args[1] else 0
            selector = _known_operand(_operand_frames(block, ins, 1)[0], state.tracked)
            if selector is not None:
                targets = ins.args[2 + selector:3 + selector] if 0 <= selector < count else ()
                chosen = False
                for raw_target in targets:
                    target = target_offset(raw_target)
                    if in_code(block, target):
                        if op == 0x25:
                            add(state.member, target, state.entry_slot, state.stack, event_count,
                                damage_pending, state.capacity_replays)
                        elif len(state.stack) < CALLCAP:
                            add(state.member, target, state.entry_slot, state.stack + (following,), event_count,
                                damage_pending, state.capacity_replays)
                        chosen = True
                if not chosen:
                    add(state.member, following, state.entry_slot, state.stack, event_count,
                        damage_pending, state.capacity_replays)
                continue
            for raw_target in ins.args[2:2 + count]:
                target = target_offset(raw_target)
                if in_code(block, target):
                    if op == 0x25:
                        add(state.member, target, state.entry_slot, state.stack, event_count,
                            damage_pending, state.capacity_replays)
                    elif len(state.stack) < CALLCAP:
                        add(state.member, target, state.entry_slot, state.stack + (following,), event_count,
                            damage_pending, state.capacity_replays)
            add(state.member, following, state.entry_slot, state.stack, event_count,
                damage_pending, state.capacity_replays)
            continue
        if 0x16 <= op <= 0x1B:  # conditional skips exactly one following instruction
            guarded = decode_one(block, following)
            decision = None if state.tracked.compare is None else _if_result(op, state.tracked.compare)
            # ECL IF_* executes the next instruction when its condition is
            # true and skips that instruction when false (CCECL op_if).
            if decision is not False:
                add(state.member, following, state.entry_slot, state.stack, event_count,
                    damage_pending, state.capacity_replays)
            if decision is not True and guarded is not None:
                add(state.member, following + guarded.size, state.entry_slot, state.stack, event_count,
                    damage_pending, state.capacity_replays)
            continue
        add(state.member, following, state.entry_slot, state.stack, event_count,
            damage_pending, state.capacity_replays)

    return AreaWalk(sites, unresolved, capacity_boundaries, post_capacity_damage_reads,
                    post_capacity_interests,
                    yield_points, capacity_boundary_levels, len(seen), bool(queue))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ecl_glb", nargs="?", default=r"The Dark Queen of Krynn\DISK3\ECL.GLB")
    parser.add_argument("--area", type=int, help="report one root area")
    parser.add_argument("--follow-capacity", action="store_true",
                        help="replay one full CCFLOW chunk and report post-capacity host/data consumers")
    parser.add_argument("--follow-capacity-chunks", type=int,
                        help="replay up to this many consecutive full CCFLOW chunks")
    parser.add_argument("--list-post-capacity-yields", action="store_true",
                        help="list terminal prompts reached after one private capacity replay (requires --follow-capacity)")
    parser.add_argument("--entry-slot", type=int, choices=range(5),
                        help="walk only one of the five HLIB entry slots")
    parser.add_argument("--seed-cell-descriptor", type=lambda value: int(value, 0),
                        help="seed fresh sparse memory and track a DQK descriptor, host coordinates, selectors, and GETTABLE reads")
    parser.add_argument("--seed-map-position", metavar="X,Y",
                        help="track host-seeded sparse coordinates 0x0111/0x0112")
    parser.add_argument("--start-vaddr", type=lambda value: int(value, 0),
                        help="start one source trace at a member virtual address instead of a header entry")
    parser.add_argument("--menu-answer", action="append", default=[], metavar="VADDR=CHOICE",
                        help="follow a zero-based answer at one menu address; repeat for a constrained route")
    parser.add_argument("--prompt-answer", action="append", default=[], metavar="VADDR=VALUE",
                        help="follow an INPUT_NUMBER raw value or PARTY_SURPRISE 0=Yes/1=No answer")
    parser.add_argument("--acknowledge", action="append", default=[], metavar="VADDR",
                        help="cold-resume after DQK PARTYSTRENGTH 0x1D; no answer is inferred")
    parser.add_argument("--headless-prompts", action="store_true",
                        help="continue seeded prompt answers in one invocation instead of cold-resuming")
    args = parser.parse_args()

    if args.list_post_capacity_yields and not args.follow_capacity:
        parser.error("--list-post-capacity-yields requires --follow-capacity")
    if args.follow_capacity_chunks is not None and args.follow_capacity_chunks < 0:
        parser.error("--follow-capacity-chunks must be nonnegative")

    archive = read_hlib_data_archive(Path(args.ecl_glb))
    map_position = None
    if args.seed_map_position is not None:
        if args.seed_cell_descriptor is None:
            parser.error("--seed-map-position requires --seed-cell-descriptor")
        try:
            x_text, y_text = args.seed_map_position.split(",", 1)
            map_position = (int(x_text, 0), int(y_text, 0))
        except ValueError as error:
            parser.error(f"invalid --seed-map-position {args.seed_map_position!r}; expected X,Y")
    if args.start_vaddr is not None and args.entry_slot is None:
        parser.error("--start-vaddr requires --entry-slot so NEWECL retains a selected header slot")
    menu_answers: dict[int, int] = {}
    for specification in args.menu_answer:
        try:
            address_text, choice_text = specification.split("=", 1)
            address, choice = int(address_text, 0), int(choice_text, 0)
        except ValueError:
            parser.error(f"invalid --menu-answer {specification!r}; expected VADDR=CHOICE")
        if address < 0x8000 or choice < 0 or address in menu_answers:
            parser.error(f"invalid or duplicate --menu-answer {specification!r}")
        menu_answers[address] = choice
    prompt_answers: dict[int, int] = {}
    for specification in args.prompt_answer:
        try:
            address_text, value_text = specification.split("=", 1)
            address, value = int(address_text, 0), int(value_text, 0)
        except ValueError:
            parser.error(f"invalid --prompt-answer {specification!r}; expected VADDR=VALUE")
        if address < 0x8000 or value < 0 or value > 0xFFFF or address in prompt_answers:
            parser.error(f"invalid or duplicate --prompt-answer {specification!r}")
        prompt_answers[address] = value
    acknowledged_yields: set[int] = set()
    for address_text in args.acknowledge:
        try:
            address = int(address_text, 0)
        except ValueError:
            parser.error(f"invalid --acknowledge {address_text!r}; expected VADDR")
        if address < 0x8000 or address in acknowledged_yields:
            parser.error(f"invalid or duplicate --acknowledge {address_text!r}")
        acknowledged_yields.add(address)
    replay_limit = (args.follow_capacity_chunks if args.follow_capacity_chunks is not None
                    else int(args.follow_capacity))
    id_to_member = parse_id_table(archive.members[0])
    areas = [args.area] if args.area is not None else sorted(id_to_member)
    candidate_totals = {opcode: set() for opcode in EFFECT_CANDIDATES}
    post_capacity_by_opcode: dict[int, set[tuple[int, int, int]]] = {
        opcode: set() for opcode in POST_CAPACITY_INTERESTS
    }
    capacity_by_area: dict[int, int] = {}
    post_capacity_yields: dict[tuple[int, int, int, int, int], tuple[int, int]] = {}
    total_states = total_unresolved = total_capacity = total_deferred_reads = capped_areas = 0

    for area in areas:
        slots = range(args.entry_slot, args.entry_slot + 1) if args.entry_slot is not None else range(5)
        walk = walk_area(archive.members, id_to_member, area, entry_slots=slots,
                         follow_capacity=args.follow_capacity,
                         capacity_replays=replay_limit,
                         seed_cell_descriptor=args.seed_cell_descriptor,
                         seed_map_position=map_position,
                         start_vaddr=args.start_vaddr,
                         collect_yields=args.area is not None or args.list_post_capacity_yields,
                         menu_answers=menu_answers,
                         prompt_answers=prompt_answers,
                         acknowledged_yields=acknowledged_yields,
                         headless_prompts=args.headless_prompts)
        total_states += walk.states
        total_unresolved += len(walk.unresolved_chains)
        total_capacity += len(walk.capacity_boundaries)
        total_deferred_reads += len(walk.post_capacity_damage_reads)
        capacity_by_area[area] = len(walk.capacity_boundaries)
        capped_areas += int(walk.capped)
        for site in walk.sites:
            candidate_totals[site[2]].add((area, site[0], site[1]))
        for member, offset, opcode in walk.post_capacity_interests:
            post_capacity_by_opcode[opcode].add((area, member, offset))
        if args.list_post_capacity_yields:
            for slot, member, offset, opcode, event_count, after_capacity in walk.yield_points:
                if after_capacity and opcode in PROMPT_OPS:
                    key = (area, slot, member, offset, opcode)
                    previous = post_capacity_yields.get(key)
                    if previous is None:
                        post_capacity_yields[key] = (event_count, event_count)
                    else:
                        post_capacity_yields[key] = (
                            min(previous[0], event_count), max(previous[1], event_count)
                        )
        if args.area is not None:
            levels = sorted({level + 1 for _, _, _, level in walk.capacity_boundary_levels})
            print(f"area={area} states={walk.states} capacity_boundaries={len(walk.capacity_boundaries)} capacity_chunk_halts={','.join(map(str, levels)) or 'none'} post_capacity_damage_reads={len(walk.post_capacity_damage_reads)} unresolved_dynamic_or_missing_chains={len(walk.unresolved_chains)} state_cap={walk.capped}")
            rows = sorted(walk.sites, key=lambda row: (row[2], row[0], row[1]))
            for member, offset, opcode in rows[:80]:
                ins = decode_one(archive.members[member], offset)
                assert ins is not None
                print(f"  member={member:02d} {ins.vaddr:04x}h {EFFECT_CANDIDATES[opcode]}")
            if len(rows) > 80:
                print(f"  ... {len(rows) - 80} more candidate sites")
            rows = sorted(walk.capacity_boundaries)
            for member, offset, opcode in rows[:80]:
                ins = decode_one(archive.members[member], offset)
                assert ins is not None
                print(f"  CAPACITY before member={member:02d} {ins.vaddr:04x}h opcode={ins.mnemonic}")
            if len(rows) > 80:
                print(f"  ... {len(rows) - 80} more capacity sites")
            rows = sorted(walk.post_capacity_damage_reads)
            for member, offset, opcode in rows[:80]:
                ins = decode_one(archive.members[member], offset)
                assert ins is not None
                print(f"  DAMAGE_PENDING_READ member={member:02d} {ins.vaddr:04x}h {PARTY_SEED_READERS[opcode]}")
            if len(rows) > 80:
                print(f"  ... {len(rows) - 80} more deferred-damage read sites")
            rows = sorted(walk.post_capacity_interests)
            for member, offset, opcode in rows[:120]:
                ins = decode_one(archive.members[member], offset)
                assert ins is not None
                print(f"  POST_CAPACITY_CONSUMER member={member:02d} {ins.vaddr:04x}h {POST_CAPACITY_INTERESTS[opcode]}")
            if len(rows) > 120:
                print(f"  ... {len(rows) - 120} more post-capacity consumer sites")
            rows = sorted(walk.yield_points, key=lambda row: (row[5], row[0], row[1], row[2], row[4]))
            for slot, member, offset, opcode, event_count, after_capacity in rows[:120]:
                ins = decode_one(archive.members[member], offset)
                assert ins is not None
                chunk = "after_capacity" if after_capacity else "first_chunk"
                print(f"  YIELD slot={slot} member={member:02d} {ins.vaddr:04x}h {ins.mnemonic} event_count={event_count} chunk={chunk}")
            if len(rows) > 120:
                print(f"  ... {len(rows) - 120} more yield points")

    if args.area is None:
        print(f"areas={len(areas)} states={total_states} capacity_boundary_area_sites={total_capacity} post_capacity_damage_read_sites={total_deferred_reads} unresolved_dynamic_or_missing_chains={total_unresolved} capped_areas={capped_areas}")
        for opcode, label in POST_CAPACITY_INTERESTS.items():
            rows = post_capacity_by_opcode[opcode]
            roots = sorted({root for root, _, _ in rows})
            print(f"POST_CAPACITY {label:12} area_root_site_combinations={len(rows)} roots={','.join(map(str, roots)) or 'none'}")
        for opcode, label in EFFECT_CANDIDATES.items():
            rows = candidate_totals[opcode]
            roots = sorted({r[0] for r in rows})
            print(f"{label:12} area_root_site_combinations={len(rows)} roots={','.join(map(str, roots)) or 'none'}")
        active_capacity = ", ".join(f"{area}:{count}" for area, count in capacity_by_area.items() if count)
        print(f"capacity_boundary_roots={active_capacity or 'none'}")
        if args.list_post_capacity_yields:
            print(f"post_capacity_prompt_sites={len(post_capacity_yields)}")
            rows = sorted(post_capacity_yields)
            for area, slot, member, offset, opcode in rows[:200]:
                ins = decode_one(archive.members[member], offset)
                assert ins is not None
                minimum, maximum = post_capacity_yields[(area, slot, member, offset, opcode)]
                counts = str(minimum) if minimum == maximum else f"{minimum}-{maximum}"
                print(f"PROMPT_AFTER_CAPACITY area={area} slot={slot} member={member:02d} {ins.vaddr:04x}h {ins.mnemonic} event_count={counts}")
            if len(rows) > 200:
                print(f"... {len(rows) - 200} more post-capacity prompt sites")


if __name__ == "__main__":
    main()
