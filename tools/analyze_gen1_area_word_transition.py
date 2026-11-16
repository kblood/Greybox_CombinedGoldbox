#!/usr/bin/env python3
"""Resolve and validate a Gen1 ECL Area1 word transition from runtime RAM."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


AREA_LOGICAL_MIN = 0x4B00
AREA_LOGICAL_MAX = 0x4EFF


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_segment(snapshot: str, name: str) -> int:
    match = re.search(rf"\b{name}=([0-9A-Fa-f]{{4}})\b", snapshot)
    if not match:
        raise ValueError(f"debugger snapshot has no {name} register")
    return int(match.group(1), 16)


def area_word_offset(logical_address: int) -> int:
    if not AREA_LOGICAL_MIN <= logical_address <= AREA_LOGICAL_MAX:
        raise ValueError("logical address is outside the Gen1 Area1 word range")
    return (0x6A00 + logical_address * 2) & 0xFFFF


def read_u16(ram: bytes, address: int) -> int:
    if address < 0 or address + 2 > len(ram):
        raise ValueError(f"RAM checkpoint does not contain word at 0x{address:X}")
    return int.from_bytes(ram[address : address + 2], "little")


def build_transition(
    snapshot: str,
    before_ram: bytes,
    after_ram: bytes,
    logical_address: int,
    expected_before: int,
    expected_after: int,
) -> dict[str, Any]:
    ds = parse_segment(snapshot, "DS")
    es = parse_segment(snapshot, "ES")
    resolved_offset = area_word_offset(logical_address)
    resolved_physical = (es << 4) + resolved_offset
    rejected_direct_physical = (ds << 4) + logical_address
    before = read_u16(before_ram, resolved_physical)
    after = read_u16(after_ram, resolved_physical)
    direct_before = read_u16(before_ram, rejected_direct_physical)
    direct_after = read_u16(after_ram, rejected_direct_physical)
    exact = before == expected_before and after == expected_after
    return {
        "schema_version": 1,
        "title": "Gen1 ECL Area1 word runtime transition",
        "resolver": {
            "logical_range": ["0x4B00", "0x4EFF"],
            "formula": "ES:((0x6A00 + logical_address * 2) & 0xFFFF)",
            "source_oracle": "coab_extracted/engine/ovr008.cs vm_GetMemoryValue/vm_SetMemoryValue",
            "ds": f"0x{ds:04X}",
            "area_segment_es": f"0x{es:04X}",
        },
        "transition": {
            "logical_address": f"0x{logical_address:04X}",
            "resolved_pointer": f"{es:04X}:{resolved_offset:04X}",
            "resolved_physical": f"0x{resolved_physical:05X}",
            "word_before": before,
            "word_after": after,
            "expected": [expected_before, expected_after],
            "exact": exact,
        },
        "rejected_direct_ds_alias": {
            "pointer": f"{ds:04X}:{logical_address:04X}",
            "physical": f"0x{rejected_direct_physical:05X}",
            "word_before": direct_before,
            "word_after": direct_after,
            "reason": "ECL Area1 addresses are logical word keys, not direct DGROUP offsets",
        },
        "evidence": {
            "before_ram_sha256": sha256(before_ram),
            "after_ram_sha256": sha256(after_ram),
        },
        "verdict": "area_word_transition_proven" if exact else "not_proven",
        "claim_boundary": (
            "This resolves one Area1 logical word through live ES and validates its transition. "
            "It does not assign semantics to unrelated RAM differences."
        ),
    }


def parse_int(value: str) -> int:
    return int(value, 0)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--before-ram", type=Path, required=True)
    parser.add_argument("--after-ram", type=Path, required=True)
    parser.add_argument("--logical-address", type=parse_int, required=True)
    parser.add_argument("--expected-before", type=parse_int, required=True)
    parser.add_argument("--expected-after", type=parse_int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    proof = build_transition(
        args.snapshot.read_text(encoding="utf-8-sig"),
        args.before_ram.read_bytes(),
        args.after_ram.read_bytes(),
        args.logical_address,
        args.expected_before,
        args.expected_after,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(proof, indent=2))
    return 1 if args.strict and proof["verdict"] != "area_word_transition_proven" else 0


if __name__ == "__main__":
    raise SystemExit(main())
