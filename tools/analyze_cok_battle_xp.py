#!/usr/bin/env python3
"""Report the title-local CoK battle-XP inputs in full GameLink RAM snapshots.

This is an evidence reporter, not a memory editor or a DGROUP locator.  It combines
the proven CoK ``calc_battle_exp`` CCH fields with named static anchors and can read
the seven pooled-money longs only when the caller explicitly supplies the same-process
segment to inspect.  The report preserves raw status/team values instead of assigning
their enum meanings.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from tools.analyze_cok_runtime_players import RECORD_SIZE, find_candidates, selected_records
except ModuleNotFoundError:
    from analyze_cok_runtime_players import RECORD_SIZE, find_candidates, selected_records


POOLED_MONEY_OFFSET = 0x6B0C
POOLED_MONEY_DIVISORS = (100, 20, 10, 1, 2, 250, 2200)


def base_xp(observation: dict[str, int]) -> int:
    """CoK GAME.OVR:0x640e..0x6432, before pooled money/items/division."""
    return observation["flat_xp"] + observation["per_hp_xp"] * observation["rolled_hp"]


def pooled_money_xp(slots: list[int]) -> int:
    """Exact positive-value conversion in CoK GAME.OVR:0x6555..0x65e9."""
    if len(slots) != len(POOLED_MONEY_DIVISORS):
        raise ValueError("expected seven pooled-money slots")
    return sum(value // divisor for value, divisor in zip(slots, POOLED_MONEY_DIVISORS))


def u32_slots(ram: bytes, segment: int) -> dict[str, Any]:
    physical = segment * 16 + POOLED_MONEY_OFFSET
    end = physical + 4 * len(POOLED_MONEY_DIVISORS)
    if end > len(ram):
        raise ValueError(f"segment 0x{segment:X} pooled-money range exceeds snapshot")
    slots = [int.from_bytes(ram[physical + 4 * index:physical + 4 * index + 4], "little")
             for index in range(len(POOLED_MONEY_DIVISORS))]
    return {"segment": f"0x{segment:X}", "offset": f"0x{POOLED_MONEY_OFFSET:X}",
            "physical_offset": f"0x{physical:X}", "slots_u32": slots,
            "converted_xp": pooled_money_xp(slots)}


def analyze(ram: bytes, records: list[bytes], minimum: int, segment: int | None) -> dict[str, Any]:
    candidates = [candidate for record in records for candidate in find_candidates(ram, record, minimum)]
    report: dict[str, Any] = {"ram_bytes": len(ram), "candidates": []}
    for candidate in candidates:
        observed = candidate["cok_runtime_observation"]
        report["candidates"].append({
            "static_name": candidate["static_name"], "offset": candidate["offset"],
            "stable_matches": candidate["stable_matches"], "status_raw": observed["status"],
            "enemy_team_raw": observed["enemy_team"], "current_hp": observed["current_hp"],
            "rolled_hp": observed["rolled_hp"], "flat_xp": observed["flat_xp"],
            "per_hp_xp": observed["per_hp_xp"], "base_xp": base_xp(observed),
            # These fields are raw CCH item-link words; a nonzero pointer requires a separate
            # item-chain decode before it can be called loot or awarded XP.
            "item_link_offset": int.from_bytes(ram[int(candidate["offset"], 0) + 0x143:int(candidate["offset"], 0) + 0x145], "little"),
            "item_link_segment": int.from_bytes(ram[int(candidate["offset"], 0) + 0x145:int(candidate["offset"], 0) + 0x147], "little"),
        })
    # A later snapshot may have already deallocated defeated CCH records.  This is
    # deliberately the sum of candidates still observable in *this snapshot*, not
    # a claim about the original encounter roster.
    report["observable_candidate_base_xp_total"] = sum(row["base_xp"] for row in report["candidates"])
    if segment is not None:
        report["supplied_pooled_money_window"] = u32_slots(ram, segment)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dax", type=Path, required=True)
    parser.add_argument("--monster", action="append", required=True)
    parser.add_argument("--snapshot", type=Path, action="append", required=True)
    parser.add_argument("--minimum", type=int, default=35)
    parser.add_argument("--dgroup-segment", type=lambda value: int(value, 0),
                        help="only an explicitly observed same-process segment; never guessed")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.minimum < 1:
        parser.error("--minimum must be positive")
    records = selected_records(args.dax, args.monster)
    payload = {"schema_version": 1,
               "purpose": "CoK title-local battle-XP evidence; raw status/item links stay unclassified",
               "cch_fields": {"rolled_hp": "0x11B", "flat_xp_u16": "0x130", "per_hp_xp": "0x132",
                              "item_link": "0x143/0x145"},
               "pooled_money": {"offset": f"0x{POOLED_MONEY_OFFSET:X}", "divisors": POOLED_MONEY_DIVISORS},
               "snapshots": []}
    for path in args.snapshot:
        payload["snapshots"].append({"path": str(path), **analyze(path.read_bytes(), records, args.minimum, args.dgroup_segment)})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
