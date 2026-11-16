"""Census reachable Gen1 inline ECL menu text against CCECL's fixed payload.

This walks decoded control flow rather than looking for menu opcode bytes at
every file offset, which would report false menus inside packed text. It covers
inline Gen1 menus only; it does not establish player-route reachability or
cover Gen2 ECL.GLB.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import goldbox_corpus
import gen1_ecl_encounter_scan as scan


MENU_OPCODES = {0x15, 0x2B, 0x31}


def storage_bytes(packed_bytes: int, segment_count: int) -> int:
    """Return GBMT bytes: each raw packed string has a length prefix."""
    return packed_bytes + segment_count


def decode6(raw: bytes, offset: int, length: int) -> str:
    """Decode one packed six-bit inline string without crossing its operand."""
    acc = bits = 0
    out: list[str] = []
    for byte in raw[offset : offset + length]:
        acc = (acc << 8) | byte
        bits += 8
        while bits >= 6:
            bits -= 6
            value = (acc >> bits) & 0x3F
            if value == 0:
                return "".join(out)
            out.append(chr(value + 64) if value < 32 else chr(value))
    return "".join(out)


def inline_texts(raw: bytes, instruction: scan.Instruction) -> list[tuple[int, str]] | None:
    """Return every inline operand text, or None when the decoded frame is invalid."""
    pos = instruction.offset + 1
    result: list[tuple[int, str]] = []
    for _ in instruction.args:
        if pos + 2 > len(raw):
            return None
        code, size = raw[pos], raw[pos + 1]
        pos += 2
        if code in (1, 2, 3, 0x81):
            pos += 1
        elif code == 0x80:
            if pos + size > len(raw):
                return None
            result.append((size, decode6(raw, pos, size)))
            pos += size
        if pos > len(raw):
            return None
    return result


def reachable_instructions(raw: bytes, profile_id: str) -> dict[int, scan.Instruction]:
    """Decode CFG-reachable instructions for one retail ECL block."""
    word_sets = scan.word_sets_for_profile(profile_id)
    opcodes = scan.opcodes_for_profile(profile_id)
    addend = scan.PROFILE_ADDRESS_ADDENDS.get(profile_id, scan.DEFAULT_ADDRESS_ADDEND)
    queue = [(offset, (), scan.ALL_COMPARE_OUTCOMES) for _, offset in scan.header_entries(raw, addend)]
    seen: set[tuple[int, tuple[int, ...], int]] = set()
    result: dict[int, scan.Instruction] = {}
    while queue and len(seen) < 50_000:
        offset, stack, outcomes = queue.pop()
        key = (offset, stack[-8:], outcomes)
        if key in seen:
            continue
        seen.add(key)
        instruction = scan.decode_one(raw, offset, word_sets, opcodes)
        if instruction is None:
            continue
        result.setdefault(offset, instruction)
        for target, next_stack, _, next_outcomes in scan.successors(
            raw, instruction, stack, addend, outcomes, word_sets, opcodes
        ):
            if scan.ECL_HEADER_LEN <= target < len(raw) and len(next_stack) <= 24:
                queue.append((target, next_stack, next_outcomes))
    return result


def menu_text_operands(instruction: scan.Instruction) -> tuple[scan.Operand, ...]:
    """Select prompt/labels that CCECL stores in GBMT for this menu shape."""
    if instruction.opcode == 0x15:  # dest, prompt, count, labels...
        return instruction.args[1:2] + instruction.args[3:]
    return instruction.args[2:]  # dest, count, labels...


def scan_installs() -> list[dict[str, object]]:
    """Return structurally valid, CFG-reachable inline menu payloads, largest first."""
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    rows: list[dict[str, object]] = []
    for profile in goldbox_corpus.PROFILES:
        profile_id = profile["id"]
        if not profile["family"].startswith("gen1-"):
            continue
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        if install is None:
            continue
        for name, path in sorted(goldbox_corpus.file_index(install).items()):
            if not name.startswith("ECL") or path.suffix.upper() != ".DAX":
                continue
            for block in goldbox_corpus.read_dax_blocks(path):
                for offset, instruction in reachable_instructions(block["raw"], profile_id).items():
                    if instruction.opcode not in MENU_OPCODES:
                        continue
                    text_operands = menu_text_operands(instruction)
                    if not text_operands or any(operand.code != 0x80 for operand in text_operands):
                        continue
                    texts = inline_texts(block["raw"], instruction)
                    if texts is None or len(texts) != len(text_operands) or any(not text for _, text in texts):
                        continue
                    label_text = " | ".join(text for _, text in texts)
                    printable = sum(char.isprintable() for char in label_text) / len(label_text)
                    if printable < 0.95:
                        continue
                    packed_bytes = sum(operand.word for operand in text_operands)
                    segment_count = len(text_operands)
                    rows.append({
                        "packed_bytes": packed_bytes,
                        "segment_count": segment_count,
                        "storage_bytes": storage_bytes(packed_bytes, segment_count),
                        "profile_id": profile_id,
                        "file": name,
                        "block_id": block["block_id"],
                        "offset": offset,
                        "opcode": instruction.opcode,
                        "mnemonic": instruction.mnemonic,
                        "texts": [text for _, text in texts],
                    })
    return sorted(rows, key=lambda row: (int(row["storage_bytes"]), str(row["profile_id"])), reverse=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit the complete ordered census as JSON")
    parser.add_argument("--limit", type=int, default=80, help="human-readable rows to print (default: 80)")
    args = parser.parse_args()
    rows = scan_installs()
    if args.json:
        print(json.dumps({"candidates": len(rows), "rows": rows}, indent=2))
        return 0
    for row in rows[: args.limit]:
        print(
            f"{row['storage_bytes']:3} ({row['packed_bytes']:3}+{row['segment_count']}) "
            f"{row['profile_id']:36} {row['file']}#{row['block_id']:3} "
            f"off={row['offset']:04X} {row['mnemonic']:16} " + " | ".join(row["texts"])
        )
    print(f"candidates={len(rows)} max_storage={rows[0]['storage_bytes'] if rows else 0}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
