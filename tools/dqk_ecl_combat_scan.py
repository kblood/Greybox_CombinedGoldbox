#!/usr/bin/env python3
"""Scan DQK ECL.GLB for decoded top-level COMBAT instructions.

This is a static helper for the Gen2 DQK dialect. It walks control-flow from the
five ECL header entries in every ECL.GLB member and reports opcode 0x24 only when
it is reached as a decoded instruction boundary. Raw byte hits inside strings or
operands are deliberately ignored.
"""

from __future__ import annotations

import argparse
import struct
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from dqk_ca03_stream_decode import OPCODES, Opcode, read_opp

ECL_VBASE = 0x8000
ECL_HEADER_LEN = 20


@dataclass(frozen=True)
class Instruction:
    offset: int
    vaddr: int
    opcode: int
    mnemonic: str
    args: tuple[int | None, ...]
    size: int
    text: str


@dataclass(frozen=True)
class HlibDataArchive:
    members: list[bytes]
    ptrs: list[int]


def read_hlib_data_archive(path: Path) -> HlibDataArchive:
    data = path.read_bytes()
    if data[:4] != b"HLIB":
        raise ValueError(f"{path}: not an HLIB container")
    count = struct.unpack_from("<H", data, 8)[0] + 1
    tag = data[12:16]
    if tag == b"TILE" or tag == b"HLIB":
        raise ValueError(f"{path}: expected DATA-style GLB, got tag {tag!r}")
    ptrs = [struct.unpack_from("<I", data, 16 + i * 4)[0] for i in range(count)]
    return HlibDataArchive(
        members=[data[ptrs[i]:ptrs[i + 1]] for i in range(len(ptrs) - 1)],
        ptrs=ptrs,
    )


def read_hlib_members(path: Path) -> list[bytes]:
    return read_hlib_data_archive(path).members


def parse_id_table(member0: bytes) -> dict[int, int]:
    if len(member0) < 2:
        return {}
    count = struct.unpack_from("<H", member0, 0)[0]
    out: dict[int, int] = {}
    for i in range(count):
        off = 2 + i * 4
        if off + 4 > len(member0):
            break
        area, member = struct.unpack_from("<HH", member0, off)
        out[area] = member
    return out


# Gen2 operand counts read directly out of DQK.EXE, not inferred. Every Gen2 handler declares its
# own count by calling the shared operand prefetch routine `2033:0013` as
# `mov al,N; push ax; (push cs;) call 0x0013`, then reads operand i via `2033:0112`; `2033:0013`
# carries the operand-code table `{1,2,3,0,0x81}` at cs:0x0068 and advances the ECL PC two bytes
# per set, so N IS the word set. Near handlers sit at file base 0x031d20, overlay-body handlers at
# 0x0402c0. Operand-count changes are listed below; mnemonic and count-tail differences belong in
# `GEN2_OPCODE_OVERRIDES` so a decode never combines fields from two dialects accidentally.
#
# 0x27 and 0x31 also override complete descriptors below because their Gen1
# mnemonic/count-tail fields are wrong for DQK.
GEN2_WORD_SETS: dict[int, int] = {
    0x0C: 4,  # SETUP_MONSTER
    0x1D: 0,  # PARTYSTRENGTH
    0x1F: 1,  # UNKNOWN_1F  (was 2)
    0x21: 2,  # LOAD_FILES
    0x22: 0,  # PARTY_SURPRISE     (was 2)
    0x23: 0,  # SURPRISE           (was 4)
    0x29: 0,  # ENCOUNTER_MENU     (was 14; handler 2033:1449 is `inc [pc]; retf`)
    0x2C: 1,  # PARLAY             (was 4; handler 2033:1420 prefetches exactly 1)
    0x37: 2,  # LOAD_PIECES        (was 3)
}


GEN2_OPCODE_OVERRIDES: dict[int, Opcode] = {
    0x27: Opcode(4, "TREASURE", 3),
    0x31: Opcode(2, "SHORT_MENU", 1),
}


def opcode_for(opcode: int) -> Opcode | None:
    spec = GEN2_OPCODE_OVERRIDES.get(opcode) or OPCODES.get(opcode)
    if spec is None or opcode in GEN2_OPCODE_OVERRIDES:
        return spec
    word_set = GEN2_WORD_SETS.get(opcode, spec.word_set)
    if word_set == spec.word_set:
        return spec
    return Opcode(word_set, spec.mnemonic, spec.count_at, spec.trailing_bytes)


def word_set_for(opcode: int) -> int | None:
    spec = opcode_for(opcode)
    return None if spec is None else spec.word_set


def decode_one(block: bytes, offset: int) -> Instruction | None:
    if offset < ECL_HEADER_LEN or offset >= len(block):
        return None
    opcode = block[offset]
    spec = opcode_for(opcode)
    if spec is None:
        return None
    pos = offset + 1
    arg_words: list[int | None] = []
    arg_texts: list[str] = []
    for _ in range(spec.word_set):
        text, pos, word = read_opp(block, pos)
        arg_texts.append(text)
        arg_words.append(word)
        if text.startswith("<truncated"):
            return None
    if spec.count_at is not None and spec.count_at < len(arg_words):
        count = arg_words[spec.count_at] or 0
        for _ in range(count):
            text, pos, word = read_opp(block, pos)
            arg_texts.append(text)
            arg_words.append(word)
            if text.startswith("<truncated"):
                return None
    if pos > len(block):
        return None
    body = spec.mnemonic + ((" " + ", ".join(arg_texts)) if arg_texts else "")
    return Instruction(offset, ECL_VBASE + offset, opcode, spec.mnemonic, tuple(arg_words), pos - offset, body)


def target_offset(word: int | None) -> int | None:
    if word is None:
        return None
    return word - ECL_VBASE if word >= ECL_VBASE else word


def in_code(block: bytes, offset: int | None) -> bool:
    return offset is not None and ECL_HEADER_LEN <= offset < len(block)


def header_entries(block: bytes) -> list[int]:
    out: list[int] = []
    for slot in range(5):
        off = slot * 4 + 2
        if off + 2 <= len(block):
            out.append(struct.unpack_from("<H", block, off)[0] - ECL_VBASE)
    return out


def collect_boundaries(
    block: bytes,
    entries: list[int],
    max_steps: int,
) -> tuple[dict[int, Instruction], dict[int, int]]:
    seen: dict[int, Instruction] = {}
    parent: dict[int, int] = {}
    queue = deque(o for o in entries if in_code(block, o))

    def add(offset: int | None, source: int) -> None:
        if in_code(block, offset) and offset not in seen:
            parent.setdefault(offset, source)
            queue.append(offset)

    steps = 0
    while queue and steps < max_steps:
        steps += 1
        offset = queue.popleft()
        if offset in seen:
            continue
        ins = decode_one(block, offset)
        if ins is None:
            continue
        seen[offset] = ins
        next_off = offset + ins.size
        op = ins.opcode
        if op in (0x00, 0x13, 0x20):
            continue
        if op == 0x01:
            target = target_offset(ins.args[0] if ins.args else None)
            if in_code(block, target):
                add(target, offset)
            else:
                # DQK uses operand forms such as "GOTO cc0:0" as a dynamic/nonlocal
                # control form. The native CCECL path falls through to the decoded
                # operand-end offset for these instead of stopping the block.
                add(next_off, offset)
        elif op == 0x02:
            add(target_offset(ins.args[0] if ins.args else None), offset)
            add(next_off, offset)
        elif 0x16 <= op <= 0x1B:
            add(next_off, offset)
            guarded = decode_one(block, next_off)
            if guarded is not None:
                add(next_off + guarded.size, offset)
        elif op in (0x25, 0x26):
            add(next_off, offset)
            count = ins.args[1] if len(ins.args) > 1 else 0
            for arg in ins.args[2:2 + (count or 0)]:
                add(target_offset(arg), offset)
        else:
            add(next_off, offset)
    return seen, parent


def path_lines(
    instructions: dict[int, Instruction],
    parent: dict[int, int],
    offset: int,
    count: int = 8,
) -> list[str]:
    offsets: list[int] = []
    cur = offset
    guard = 0
    while cur in instructions and guard < 256:
        guard += 1
        offsets.append(cur)
        if cur not in parent:
            break
        cur = parent[cur]
    offsets.reverse()
    return [f"{instructions[o].vaddr:04x}h  {instructions[o].text}" for o in offsets[-count:]]


def context_lines(block: bytes, offset: int, count: int = 5) -> list[str]:
    starts = sorted(
        o for o in range(max(ECL_HEADER_LEN, offset - 80), offset + 1)
        if decode_one(block, o) is not None
    )
    best: list[Instruction] = []
    for start in starts:
        cur = start
        seq: list[Instruction] = []
        for _ in range(24):
            ins = decode_one(block, cur)
            if ins is None:
                break
            seq.append(ins)
            if cur == offset:
                best = seq
                break
            cur += ins.size
            if cur > offset:
                break
        if best and best[-1].offset == offset:
            break
    return [f"{ins.vaddr:04x}h  {ins.text}" for ins in best[-count:]]


def linear_lines(block: bytes, offset: int, count: int = 12) -> list[str]:
    out: list[str] = []
    cur = offset
    for _ in range(count):
        ins = decode_one(block, cur)
        if ins is None:
            out.append(f"{ECL_VBASE + cur:04x}h  <undecodable>")
            break
        out.append(f"{ins.vaddr:04x}h  {ins.text}")
        cur += ins.size
        if cur >= len(block):
            break
    return out


def branch_targets(ins: Instruction) -> list[int]:
    out: list[int] = []
    if ins.opcode in (0x01, 0x02):
        target = target_offset(ins.args[0] if ins.args else None)
        if target is not None:
            out.append(target)
    elif ins.opcode in (0x25, 0x26):
        count = ins.args[1] if len(ins.args) > 1 else 0
        for arg in ins.args[2:2 + (count or 0)]:
            target = target_offset(arg)
            if target is not None:
                out.append(target)
    return out


def direct_xrefs(block: bytes, target: int, allowed_offsets: set[int] | None = None) -> list[Instruction]:
    hits: list[Instruction] = []
    for offset in range(ECL_HEADER_LEN, len(block)):
        if allowed_offsets is not None and offset not in allowed_offsets:
            continue
        ins = decode_one(block, offset)
        if ins is None:
            continue
        if target in branch_targets(ins):
            hits.append(ins)
    return hits


def inspect_area_vaddr(
    archive: HlibDataArchive,
    id_to_member: dict[int, int],
    area: int,
    vaddr: int,
    max_steps: int,
    context_count: int,
) -> None:
    member_idx = id_to_member.get(area)
    if member_idx is None:
        raise SystemExit(f"area {area} is not present in the ECL id table")
    if not (1 <= member_idx < len(archive.members)):
        raise SystemExit(f"area {area} maps to invalid member {member_idx}")
    block = archive.members[member_idx]
    offset = vaddr - ECL_VBASE if vaddr >= ECL_VBASE else vaddr
    if not in_code(block, offset):
        raise SystemExit(f"vaddr 0x{vaddr:04x} / offset 0x{offset:04x} is outside area {area}")

    boundaries, parent = collect_boundaries(block, header_entries(block), max_steps)
    ins = decode_one(block, offset)
    file_off = archive.ptrs[member_idx] + offset
    print(
        f"inspect area={area:03d} member={member_idx:03d} "
        f"vaddr={ECL_VBASE + offset:04x}h offset=0x{offset:04x} "
        f"file=0x{file_off:06x} block_len={len(block)}"
    )
    if ins is None:
        print("decoded-at-target: <undecodable>")
    else:
        print(f"decoded-at-target: {ins.vaddr:04x}h  {ins.text}")
    print(f"header-cfg-reachable={offset in boundaries} boundaries={len(boundaries)}")
    if offset in boundaries:
        print("CFG path:")
        for line in path_lines(boundaries, parent, offset, count=context_count):
            print("  " + line)
    print("Linear predecessor context:")
    for line in context_lines(block, offset, count=context_count):
        print("  " + line)
    print("Linear forward decode:")
    for line in linear_lines(block, offset, count=context_count):
        print("  " + line)
    xrefs = direct_xrefs(block, offset, set(boundaries))
    print(f"direct-branch-xrefs={len(xrefs)}")
    for xref in xrefs[:40]:
        reachable = " reachable" if xref.offset in boundaries else ""
        print(f"  {xref.vaddr:04x}h{reachable}  {xref.text}")
    if len(xrefs) > 40:
        print(f"  ... {len(xrefs) - 40} more")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ecl_glb", nargs="?", default=r"The Dark Queen of Krynn\DISK3\ECL.GLB")
    ap.add_argument("--max-steps", type=int, default=20000)
    ap.add_argument("--show-context", action="store_true")
    ap.add_argument("--inspect-area", type=lambda x: int(x, 0),
                    help="inspect one ECL area id instead of listing all COMBAT rows")
    ap.add_argument("--inspect-vaddr", type=lambda x: int(x, 0),
                    help="inspect one ECL virtual address/offset in --inspect-area")
    ap.add_argument("--inspect-context", type=int, default=12,
                    help="number of context lines for --inspect-area/--inspect-vaddr")
    args = ap.parse_args()

    archive = read_hlib_data_archive(Path(args.ecl_glb))
    members = archive.members
    id_to_member = parse_id_table(members[0])

    if args.inspect_area is not None or args.inspect_vaddr is not None:
        if args.inspect_area is None or args.inspect_vaddr is None:
            raise SystemExit("--inspect-area and --inspect-vaddr must be supplied together")
        inspect_area_vaddr(
            archive,
            id_to_member,
            args.inspect_area,
            args.inspect_vaddr,
            args.max_steps,
            args.inspect_context,
        )
        return

    rows: list[tuple[int, int, Instruction, int, int]] = []
    raw_hits = 0

    for area, member_idx in sorted(id_to_member.items()):
        if not (1 <= member_idx < len(members)):
            continue
        block = members[member_idx]
        raw_hits += block.count(b"\x24")
        boundaries, parent = collect_boundaries(block, header_entries(block), args.max_steps)
        for ins in boundaries.values():
            if ins.opcode == 0x24:
                rows.append((area, member_idx, ins, len(boundaries), len(block), boundaries, parent))

    print(f"ECL.GLB={args.ecl_glb}")
    print(f"areas={len(id_to_member)} members={len(members)} raw_0x24_bytes={raw_hits}")
    print(f"decoded_entry_reachable_combat={len(rows)}")
    for area, member_idx, ins, boundary_count, block_len, boundaries, parent in rows:
        print(
            f"area={area:03d} member={member_idx:03d} combat={ins.vaddr:04x}h "
            f"offset=0x{ins.offset:04x} file=0x{archive.ptrs[member_idx] + ins.offset:06x} "
            f"boundaries={boundary_count} block_len={block_len}"
        )
        if args.show_context:
            print("  CFG path:")
            for line in path_lines(boundaries, parent, ins.offset):
                print("    " + line)
            print("  Linear local decode:")
            for line in context_lines(members[member_idx], ins.offset):
                print("  " + line)


if __name__ == "__main__":
    main()
