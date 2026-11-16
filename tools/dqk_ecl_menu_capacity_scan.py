"""Census CFG-reachable inline DQK ECL.GLB menus against CCECL's GBMT payload.

The decoder is the measured Gen2 DQK dialect from ``dqk_ecl_combat_scan``.
This is structural evidence only: it does not prove a player route to every
candidate and does not generalize to FRUA's separate corpus.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import dqk_ecl_combat_scan as scan
from dqk_ca03_stream_decode import decode_ecl_string


MENU_OPCODES = {0x15, 0x2B, 0x31}


def storage_bytes(packed_bytes: int, segment_count: int) -> int:
    """Return GBMT bytes: each raw packed string has a length prefix."""
    return packed_bytes + segment_count


def read_operand(block: bytes, pos: int) -> tuple[int, int, str, int] | None:
    if pos + 2 > len(block):
        return None
    code, low = block[pos], block[pos + 1]
    pos += 2
    word = low
    if code in (1, 2, 3, 0x81):
        if pos >= len(block):
            return None
        word |= block[pos] << 8
        pos += 1
    if code == 0x80:
        if pos + low > len(block):
            return None
        text = decode_ecl_string(block[pos : pos + low])
        pos += low
        return code, low, text, pos
    return code, word, "", pos


def menu_operands(block: bytes, instruction: scan.Instruction) -> list[tuple[int, int, str]] | None:
    """Re-read one decoded menu preserving raw operand form and packed byte size."""
    pos = instruction.offset + 1
    operands: list[tuple[int, int, str]] = []
    fixed = scan.word_set_for(instruction.opcode)
    if fixed is None:
        return None
    for _ in range(fixed):
        decoded = read_operand(block, pos)
        if decoded is None:
            return None
        code, word, text, pos = decoded
        operands.append((code, word, text))
    count_at = 2 if instruction.opcode == 0x15 else 1
    if count_at >= len(operands):
        return None
    for _ in range(operands[count_at][1]):
        decoded = read_operand(block, pos)
        if decoded is None:
            return None
        code, word, text, pos = decoded
        operands.append((code, word, text))
    return operands


def scan_archive(path: Path, max_steps: int = 20_000) -> list[dict[str, object]]:
    archive = scan.read_hlib_data_archive(path)
    id_to_member = scan.parse_id_table(archive.members[0])
    rows: list[dict[str, object]] = []
    for area, member_index in sorted(id_to_member.items()):
        if not 1 <= member_index < len(archive.members):
            continue
        block = archive.members[member_index]
        boundaries, _ = scan.collect_boundaries(block, scan.header_entries(block), max_steps)
        for instruction in boundaries.values():
            if instruction.opcode not in MENU_OPCODES:
                continue
            operands = menu_operands(block, instruction)
            if operands is None:
                continue
            text_operands = operands[1:2] + operands[3:] if instruction.opcode == 0x15 else operands[2:]
            if not text_operands or any(code != 0x80 or not text for code, _, text in text_operands):
                continue
            text = " | ".join(text for _, _, text in text_operands)
            if sum(char.isprintable() for char in text) / len(text) < 0.95:
                continue
            packed_bytes = sum(size for _, size, _ in text_operands)
            segment_count = len(text_operands)
            rows.append({
                "packed_bytes": packed_bytes,
                "segment_count": segment_count,
                "storage_bytes": storage_bytes(packed_bytes, segment_count),
                "area": area,
                "member": member_index,
                "offset": instruction.offset,
                "vaddr": instruction.vaddr,
                "opcode": instruction.opcode,
                "mnemonic": instruction.mnemonic,
                "texts": [text for _, _, text in text_operands],
            })
    return sorted(rows, key=lambda row: (int(row["storage_bytes"]), int(row["area"])), reverse=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ecl_glb", nargs="?", type=Path, default=Path("The Dark Queen of Krynn/DISK3/ECL.GLB"))
    parser.add_argument("--limit", type=int, default=80)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    rows = scan_archive(args.ecl_glb)
    if args.json:
        print(json.dumps({"candidates": len(rows), "rows": rows}, indent=2))
        return 0
    for row in rows[:args.limit]:
        print(
            f"{row['storage_bytes']:3} ({row['packed_bytes']:3}+{row['segment_count']}) "
            f"area={row['area']:3} member={row['member']:3} "
            f"off={row['offset']:04X} {row['mnemonic']:16} " + " | ".join(row["texts"])
        )
    print(f"candidates={len(rows)} max_storage={rows[0]['storage_bytes'] if rows else 0}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
