#!/usr/bin/env python3
"""Decode the relocated DQK WHO form dispatcher from a full GameLink RAM image.

The intended input is one of the 0xA0000-byte ``full.bin`` checkpoints captured by
``dqk-native-control-route.ps1 -Stage Dispatch``.  The decoder is deliberately
small and dependency-free: it reports exact table and RAM values, leaving semantic
claims to the accompanying research memo.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


RAM_SIZE = 0xA0000
DISPATCH_SEG = 0x1D42
DISPATCH_CODE_TABLE = 0x0114
DISPATCH_TARGET_TABLE = 0x0194
DISPATCH_ENTRY_COUNT = 0x40
DATA_SEG = 0x3A52


def physical(segment: int, offset: int) -> int:
    """Return the 20-bit real-mode address used by these sub-1MiB captures."""

    return ((segment << 4) + offset) & 0xFFFFF


def read_u16(ram: bytes, segment: int, offset: int) -> int:
    address = physical(segment, offset)
    return int.from_bytes(ram[address : address + 2], "little")


def read_u8(ram: bytes, segment: int, offset: int) -> int:
    return ram[physical(segment, offset)]


def read_far(ram: bytes, segment: int, offset: int) -> tuple[int, int]:
    return read_u16(ram, segment, offset), read_u16(ram, segment, offset + 2)


def format_far(pointer: tuple[int, int]) -> str:
    offset, segment = pointer
    return f"{segment:04X}:{offset:04X}"


def decode_dispatch_table(ram: bytes) -> list[dict[str, Any]]:
    entries = []
    for index in range(DISPATCH_ENTRY_COUNT):
        code = read_u16(ram, DISPATCH_SEG, DISPATCH_CODE_TABLE + index * 2)
        target = read_u16(ram, DISPATCH_SEG, DISPATCH_TARGET_TABLE + index * 2)
        entries.append(
            {
                "index": index,
                "bios_ax": f"0x{code:04X}",
                "target": f"{DISPATCH_SEG:04X}:{target:04X}",
            }
        )
    return entries


def normalize_key(ram: bytes, bios_ax: int) -> dict[str, Any]:
    """Apply the exact table search/fallback performed at 1D42:00FB..029D."""

    entries = decode_dispatch_table(ram)
    for entry in entries:
        if int(entry["bios_ax"], 16) == bios_ax:
            target = int(entry["target"].split(":")[1], 16)
            # Every dispatch-table target used by the named keys is ``mov ax,imm16``.
            address = physical(DISPATCH_SEG, target)
            if ram[address] != 0xB8:
                raise ValueError(
                    f"table target {DISPATCH_SEG:04X}:{target:04X} is not mov ax,imm16"
                )
            normalized = int.from_bytes(ram[address + 1 : address + 3], "little")
            return {
                "bios_ax": f"0x{bios_ax:04X}",
                "matched_index": entry["index"],
                "target": entry["target"],
                "normalized_ax": f"0x{normalized:04X}",
                "path": "table",
            }
    return {
        "bios_ax": f"0x{bios_ax:04X}",
        "matched_index": None,
        "target": f"{DISPATCH_SEG:04X}:0298",
        "normalized_ax": f"0x{bios_ax & 0xFF:04X}",
        "path": "low-byte fallback",
    }


def walk_party_list(ram: bytes, head: tuple[int, int], limit: int = 16) -> list[str]:
    nodes = []
    pointer = head
    seen: set[tuple[int, int]] = set()
    while pointer != (0, 0) and pointer not in seen and len(nodes) < limit:
        seen.add(pointer)
        nodes.append(format_far(pointer))
        offset, segment = pointer
        pointer = read_far(ram, segment, offset)
    if pointer != (0, 0):
        nodes.append(f"STOP:{format_far(pointer)}")
    return nodes


def analyze_snapshot(path: Path) -> dict[str, Any]:
    ram = path.read_bytes()
    if len(ram) != RAM_SIZE:
        raise ValueError(f"expected a 0x{RAM_SIZE:X}-byte full RAM image, got 0x{len(ram):X}")

    dispatcher_core = bytes.fromhex(
        "59 8B F0 8B C6 B9 40 00 BB 14 01 2E 3B 07 74 07 43 43 E2 F7 E9 89 01"
    )
    core_address = physical(DISPATCH_SEG, 0x00F8)
    if ram[core_address : core_address + len(dispatcher_core)] != dispatcher_core:
        raise ValueError("relocated dispatcher bytes at 1D42:00F8 do not match the captured build")

    table = decode_dispatch_table(ram)
    current = read_far(ram, DATA_SEG, 0xA7B5)
    head = read_far(ram, DATA_SEG, 0xC6E5)
    current_offset, current_segment = current
    current_next = read_far(ram, current_segment, current_offset)

    form_pointer = read_far(ram, DATA_SEG, 0xDAC7)
    form_offset, form_segment = form_pointer
    form_entries = []
    for index in range(read_u16(ram, DATA_SEG, 0xDAC0)):
        base = form_offset + index * 0x20
        primary_callback = read_far(ram, form_segment, base)
        event5_callback = read_far(ram, form_segment, base + 4)
        form_entries.append(
            {
                "index": index,
                "address": f"{form_segment:04X}:{base:04X}",
                "primary_callback": format_far(primary_callback),
                "event5_callback": format_far(event5_callback),
                "flags_byte": f"0x{read_u8(ram, form_segment, base + 0x1C):02X}",
            }
        )

    who_codes = [read_u16(ram, 0x335E, 0x3C12 + i * 2) for i in range(6)]
    who_targets = [read_u16(ram, 0x335E, 0x3C1E + i * 2) for i in range(6)]

    return {
        "snapshot": str(path),
        "size": len(ram),
        "sha256": hashlib.sha256(ram).hexdigest(),
        "dispatcher": {
            "entry": "1D42:00E7",
            "post_int16_stop": "1D42:00F8",
            "code_table": "1D42:0114",
            "target_table": "1D42:0194",
            "entries": table,
            "down": normalize_key(ram, 0x5000),
            "up": normalize_key(ram, 0x4800),
            "bios_enter": normalize_key(ram, 0x1C0D),
        },
        "form": {
            "count": read_u16(ram, DATA_SEG, 0xDAC0),
            "table": format_far(form_pointer),
            "entries": form_entries,
            "last_normalized_key": f"0x{read_u16(ram, DATA_SEG, 0xA6B2):04X}",
            "flagged_input": read_u8(ram, DATA_SEG, 0xC2F5),
        },
        "who_selector": {
            "active_pointer": format_far(current),
            "active_next_pointer": format_far(current_next),
            "party_head": format_far(head),
            "party_nodes": walk_party_list(ram, head),
            "guard": "335E:3BE9 tests DS:C2F5",
            "switch_codes": [f"0x{code:04X}" for code in who_codes],
            "switch_targets": [f"335E:{target:04X}" for target in who_targets],
            "down_branch": "335E:3C3D follows the active node's next far pointer",
            "flagged_enter_branch": "335E:3C36 changes the local result to 0 before commit",
            "commit": "335E:3D00 calls 13FF:02D1 to store the active far pointer",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path, help="0xA0000-byte GameLink full.bin checkpoint")
    parser.add_argument("--indent", type=int, default=2)
    args = parser.parse_args()
    print(json.dumps(analyze_snapshot(args.snapshot), indent=args.indent))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
