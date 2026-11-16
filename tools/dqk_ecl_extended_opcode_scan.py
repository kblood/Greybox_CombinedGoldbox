#!/usr/bin/env python3
"""Census DQK's own extended (>0x40) ECL opcode bytes at DECODED INSTRUCTION BOUNDARIES.

Companion to `dqk_ecl_combat_scan.py` (which walks entry-reachable CFG for the
already-known 0x00-0x40 Gen1 opcode table and reports 0x24 COMBAT rows). This
script reuses the SAME CFG walker and the SAME known-opcode table
(`dqk_ca03_stream_decode.OPCODES`, 65 entries 0x00-0x40), but instead of only
reporting COMBAT, it also records every point where the walk reaches a
TOP-LEVEL (decoded-boundary-reachable) byte that is NOT decodable because its
value is > 0x40 and therefore absent from the known table.

Why this is meaningfully different from a raw byte-frequency histogram (the
2026-07 static pass in decompile-dqk-ecl-dispatch.md): a raw grep for e.g.
byte 0x4E anywhere in ECL.GLB conflates real top-level opcodes with operand
bytes, inline 6-bit-packed string payloads (PRINT/PRINTCLEAR bodies), and
COMPARE/branch immediates -- exactly the false-positive class the existing
doc documents for 0x24 at Palanthas ("0x8439 is a PRINTCLEAR inline-string
length, not an opcode"). By walking the SAME control-flow-boundary decoder
used for the trusted COMBAT census, a byte is only counted here if it is
reached as the FIRST byte of what the walker believes is an instruction --
i.e. it sits exactly where a real opcode byte would sit, in real decoded
script control flow reachable from one of the five per-member ECL header
entries.

Caveats (stated plainly, not smoothed over):
  - This is still a STATIC lower bound, not a live dispatch-table dump. A
    byte that never appears as a CFG-boundary target in the reachable graph
    (e.g. gated behind a runtime condition this walker can't evaluate, or an
    unreachable dead area) will not be counted even if DQK.EXE's real
    interpreter would decode it as an opcode somewhere at runtime.
  - The walker can only step 0x00-0x40 opcodes: the moment it decodes a KNOWN
    opcode whose operand word_set is wrong for the real Gen2 dialect, or hits
    an actual unknown opcode, it STOPS at that boundary (correct -- it cannot
    guess the operand width of an opcode it doesn't know, so it does not walk
    past it and does not risk mis-decoding downstream bytes as further
    "opcodes"). This means each unknown-opcode occurrence is a genuine
    frontier of the currently-reachable graph, not a guess about what comes
    next.
  - Multiple raw hits of the same opcode value across different call sites
    are all recorded (not deduped) so usage counts are real ECL script counts,
    not "number of distinct blocks".

Usage:
  python tools/dqk_ecl_extended_opcode_scan.py [ecl_glb] [--max-steps N] [--top N]
  python tools/dqk_ecl_extended_opcode_scan.py --opcode 0x4E   # every occurrence of one opcode
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dqk_ca03_stream_decode import OPCODES  # noqa: E402
from dqk_ecl_combat_scan import (  # noqa: E402
    ECL_HEADER_LEN,
    ECL_VBASE,
    Instruction,
    HlibDataArchive,
    decode_one,
    header_entries,
    in_code,
    parse_id_table,
    read_hlib_data_archive,
    target_offset,
)

KNOWN_MAX = max(OPCODES)  # 0x40


@dataclass(frozen=True)
class UnknownHit:
    area: int
    member_idx: int
    offset: int
    opcode: int
    source_offset: int | None  # CFG predecessor offset, for a one-hop "how did we get here"


def collect_boundaries_and_unknowns(
    block: bytes,
    entries: list[int],
    max_steps: int,
) -> tuple[dict[int, Instruction], dict[int, int], list[tuple[int, int]]]:
    """Same CFG walk as dqk_ecl_combat_scan.collect_boundaries, but ALSO returns
    every (offset, opcode_byte) pair where the walker reached a boundary whose
    byte value is > KNOWN_MAX (an extended/unknown opcode), instead of silently
    dropping it."""
    seen: dict[int, Instruction] = {}
    parent: dict[int, int] = {}
    unknown: list[tuple[int, int]] = []
    unknown_offsets: set[int] = set()
    queue = deque(o for o in entries if in_code(block, o))

    def add(offset: int | None, source: int) -> None:
        if offset is None:
            return
        if in_code(block, offset) and offset not in seen and offset not in unknown_offsets:
            parent.setdefault(offset, source)
            queue.append(offset)

    steps = 0
    while queue and steps < max_steps:
        steps += 1
        offset = queue.popleft()
        if offset in seen or offset in unknown_offsets:
            continue
        ins = decode_one(block, offset)
        if ins is None:
            # Distinguish "unknown top-level opcode byte" from other decode failures
            # (truncated operand stream, off-the-end): only the former is opcode census
            # signal. block[offset] is safe: in_code() already bounded offset < len(block).
            opcode_byte = block[offset]
            if opcode_byte > KNOWN_MAX:
                unknown.append((offset, opcode_byte))
                unknown_offsets.add(offset)
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
            for arg in ins.args[2 : 2 + (count or 0)]:
                add(target_offset(arg), offset)
        else:
            add(next_off, offset)
    return seen, parent, unknown


def scan(archive: HlibDataArchive, id_to_member: dict[int, int], max_steps: int):
    by_opcode: dict[int, list[UnknownHit]] = defaultdict(list)
    total_boundaries = 0
    for area, member_idx in sorted(id_to_member.items()):
        if not (1 <= member_idx < len(archive.members)):
            continue
        block = archive.members[member_idx]
        boundaries, parent, unknowns = collect_boundaries_and_unknowns(
            block, header_entries(block), max_steps
        )
        total_boundaries += len(boundaries)
        for offset, opcode_byte in unknowns:
            by_opcode[opcode_byte].append(
                UnknownHit(area, member_idx, offset, opcode_byte, parent.get(offset))
            )
    return by_opcode, total_boundaries


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ecl_glb", nargs="?", default=r"The Dark Queen of Krynn\DISK3\ECL.GLB")
    ap.add_argument("--max-steps", type=int, default=20000)
    ap.add_argument("--top", type=int, default=64, help="max opcode rows to print")
    ap.add_argument("--opcode", type=lambda x: int(x, 0), default=None,
                     help="print every occurrence of one opcode value instead of the summary")
    args = ap.parse_args()

    archive = read_hlib_data_archive(Path(args.ecl_glb))
    id_to_member = parse_id_table(archive.members[0])

    by_opcode, total_boundaries = scan(archive, id_to_member, args.max_steps)

    if args.opcode is not None:
        hits = by_opcode.get(args.opcode, [])
        print(f"opcode=0x{args.opcode:02x} occurrences={len(hits)}")
        for h in hits:
            file_off = archive.ptrs[h.member_idx] + h.offset
            print(
                f"  area={h.area:03d} member={h.member_idx:03d} "
                f"vaddr={ECL_VBASE + h.offset:04x}h offset=0x{h.offset:04x} file=0x{file_off:06x}"
            )
        return

    print(f"ECL.GLB={args.ecl_glb}")
    print(f"areas={len(id_to_member)} members={len(archive.members)}")
    print(f"total decoded (known 0x00-0x40) CFG boundaries reached across all areas={total_boundaries}")
    print(f"distinct extended (>0x40) opcode VALUES reached as a CFG boundary={len(by_opcode)}")
    ordered = sorted(by_opcode.items(), key=lambda kv: -len(kv[1]))
    print(f"{'opcode':>8}  {'count':>6}  example (area/member/vaddr/file-offset)")
    for opcode_byte, hits in ordered[: args.top]:
        h = hits[0]
        file_off = archive.ptrs[h.member_idx] + h.offset
        print(
            f"0x{opcode_byte:02x}      {len(hits):6d}  "
            f"area={h.area:03d} member={h.member_idx:03d} vaddr={ECL_VBASE + h.offset:04x}h "
            f"file=0x{file_off:06x}"
        )


if __name__ == "__main__":
    main()
