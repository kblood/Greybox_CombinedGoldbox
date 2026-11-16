#!/usr/bin/env python3
"""Conservatively locate possible CoK runtime combatant records in RAM snapshots.

CoK's on-disk MON*n*CHA records are 409-byte CCH-family records.  CoK's own
``GAME.OVR`` battle-XP routine (file offset 0x6335) proves its title-local
combat fields: rolled HP at +0x11b, flat XP (u16) at +0x130, and per-HP XP at
+0x132.  This tool makes a live-record experiment reproducible:

* extract named 409-byte static anchors from one or more CoK MON*n*CHA.DAX;
* find RAM offsets carrying independently chosen, stable static anchors;
* report known CoK runtime observations, including the title-local XP inputs;
* retain the historical CoAB-relative bytes only as an explicitly unproven
  cross-title comparison, never as a CoK mapping.

The JSON report never calls a candidate a Player record.  A live pre-combat /
post-combat differential or a known DS/segment mapping is still required.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from tools import dax_decode
except ModuleNotFoundError:
    import dax_decode

RECORD_SIZE = 409
# Stable identity/stat fields used only to find CCH-family copies. Avoid HP and
# XP: they are exactly the values under study.
ANCHOR_RANGES = ((0, 28), (89, 91), (207, 215), (231, 232), (269, 272), (275, 276))
# CoK's own GAME.OVR disassembly, not a CoAB projection.  ``calc_battle_exp``
# at GAME.OVR file 0x6335 reads rolled_hp +0x11B, flat_xp +0x130 (u16), and
# per_hp_xp +0x132.  See decompile-ovr006-xp-treasure.md.
COK_RUNTIME_OFFSETS = {
    "max_hp": 0x62,
    "control_morale": 0xE7,
    "rolled_hp": 0x11B,
    "flat_xp": 0x130,
    "per_hp_xp": 0x132,
    "status": 0x188,
    "enemy_team": 0x18A,
    "current_hp": 0x197,
    # CORRECTED 2026-09-07: this key was "initiative". The offset is right and
    # the name was wrong -- 0x198 is the per-combatant MOVEMENT RATE. CoK's own
    # CalcMoves reads es:[di+0x198] at 0x14EC0 (bytes 26 8a 85 98 01, identical
    # to the read at 0xA9E2 that earned the old label) and stores the result as
    # the movement budget. The CoAB decompile names that routine
    # calc_group_movement and carries "calc_group_inituative" only as a stale
    # trailing comment, which is where the misnomer came from. Full retraction:
    # docs/engine/research/disasm-combat-cok.md, CORRECTION section.
    "movement_rate": 0x198,
}
# ``flat_xp`` is the only multi-byte member of COK_RUNTIME_OFFSETS.
COK_RUNTIME_FIELD_WIDTHS = {"flat_xp": 2}
COAB_CANDIDATE_OFFSETS = {"rolled_hp": 0x12C, "flat_xp": 0x13C, "per_hp_xp": 0x13E}


def record_name(raw: bytes) -> str:
    if not raw:
        return ""
    length = min(raw[0], 15, len(raw) - 1)
    return raw[1:1 + length].decode("ascii", errors="replace").rstrip("\0 ")


def read_dax_blocks(path: Path) -> list[bytes]:
    """Read only the DAX framing needed for static anchors; no game-data import."""
    data = path.read_bytes()
    base, entries = dax_decode.parse_container(data)
    return [dax_decode.decompress_block(data, base, entry) for entry in entries]


def anchor_bytes(record: bytes) -> list[tuple[int, int]]:
    if len(record) != RECORD_SIZE:
        raise ValueError(f"expected a {RECORD_SIZE}-byte CoK record, found {len(record)}")
    return [(offset, record[offset]) for start, end in ANCHOR_RANGES for offset in range(start, end)]


def score_at(ram: bytes, offset: int, anchor: list[tuple[int, int]]) -> int:
    return sum(ram[offset + relative] == value for relative, value in anchor)


def observed_cok_fields(ram: bytes, start: int) -> dict[str, int]:
    """Read only title-local, byte-verified CoK combat observations."""
    return {
        name: int.from_bytes(ram[start + offset:start + offset + COK_RUNTIME_FIELD_WIDTHS.get(name, 1)], "little")
        for name, offset in COK_RUNTIME_OFFSETS.items()
    }


def find_candidates(ram: bytes, record: bytes, minimum: int) -> list[dict[str, Any]]:
    anchor = anchor_bytes(record)
    if minimum > len(anchor):
        raise ValueError(f"minimum {minimum} exceeds {len(anchor)} stable anchor bytes")
    out: list[dict[str, Any]] = []
    # First-byte name-length prefilter keeps full 16 MiB scans practical.
    first = record[0]
    for start in range(0, len(ram) - RECORD_SIZE + 1):
        if ram[start] != first:
            continue
        score = score_at(ram, start, anchor)
        if score < minimum:
            continue
        candidate: dict[str, Any] = {"offset": f"0x{start:X}", "stable_matches": score,
                                      "stable_total": len(anchor),
                                      "static_name": record_name(record)}
        candidate["cok_runtime_observation"] = observed_cok_fields(ram, start)
        relative = {name: start + value for name, value in COAB_CANDIDATE_OFFSETS.items()}
        if all(value < len(ram) for value in relative.values()):
            candidate["coab_relative_candidate_bytes"] = {
                name: ram[value] for name, value in relative.items()
            }
        else:
            candidate["coab_relative_candidate_bytes"] = None
        out.append(candidate)
    return out


def candidate_transitions(snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Report only observed CoK-field changes for the same named RAM candidate."""
    series: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for snapshot in snapshots:
        for candidate in snapshot["candidates"]:
            series.setdefault((candidate["static_name"], candidate["offset"]), []).append({
                "snapshot": snapshot["label"], "cok_runtime_observation": candidate["cok_runtime_observation"],
            })
    transitions: list[dict[str, Any]] = []
    for (name, offset), observations in sorted(series.items()):
        if len(observations) < 2:
            continue
        changed = [field for field in COK_RUNTIME_OFFSETS
                   if len({row["cok_runtime_observation"][field] for row in observations}) > 1]
        if changed:
            transitions.append({"static_name": name, "offset": offset, "changed_cok_fields": changed,
                                "observations": observations})
    return transitions


def selected_records(dax: Path, names: list[str]) -> list[bytes]:
    requested = {name.upper() for name in names}
    found: dict[str, bytes] = {}
    for raw in read_dax_blocks(dax):
        if len(raw) != RECORD_SIZE:
            continue
        name = record_name(raw).upper()
        if name in requested:
            found[name] = raw
    missing = sorted(requested - set(found))
    if missing:
        raise ValueError(f"named CoK 409-byte records not found in {dax}: {', '.join(missing)}")
    return [found[name] for name in sorted(found)]


def parse_snapshot(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("snapshot must be LABEL=PATH")
    label, path = value.split("=", 1)
    if not label.replace("-", "").replace("_", "").isalnum():
        raise argparse.ArgumentTypeError("snapshot label may contain letters, digits, '-' and '_'")
    return label, Path(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dax", type=Path, required=True, help="retail CoK MON*n*CHA.DAX archive")
    parser.add_argument("--monster", action="append", required=True, help="exact monster name from the archive; repeat")
    parser.add_argument("--snapshot", type=parse_snapshot, action="append", required=True,
                        help="LABEL=full GameLink RAM snapshot; repeat")
    parser.add_argument("--minimum", type=int, default=35,
                        help="minimum equal stable anchor bytes (default 35; current anchor set totals 43)")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    records = selected_records(args.dax, args.monster)
    if args.minimum < 1:
        parser.error("--minimum must be positive")
    report: dict[str, Any] = {
        "schema_version": 1,
        "purpose": "candidate discovery; CoK XP offsets are title-local GAME.OVR evidence, CoAB offsets remain comparison-only",
        "anchor_ranges": [[start, end] for start, end in ANCHOR_RANGES],
        "cok_runtime_offsets": {key: f"0x{value:X}" for key, value in COK_RUNTIME_OFFSETS.items()},
        "cok_runtime_field_widths": COK_RUNTIME_FIELD_WIDTHS,
        "coab_relative_offsets": {key: f"0x{value:X}" for key, value in COAB_CANDIDATE_OFFSETS.items()},
        "minimum_stable_matches": args.minimum,
        "anchors": [{"name": record_name(raw), "stable_bytes": len(anchor_bytes(raw))} for raw in records],
        "snapshots": [],
    }
    for label, path in args.snapshot:
        ram = path.read_bytes()
        matches = [candidate for raw in records for candidate in find_candidates(ram, raw, args.minimum)]
        report["snapshots"].append({"label": label, "path": str(path), "ram_bytes": len(ram), "candidates": matches})
    report["candidate_transitions"] = candidate_transitions(report["snapshots"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
