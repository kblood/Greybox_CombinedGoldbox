#!/usr/bin/env python3
"""Normalize Pool's natural ECL18 route-time AH=42 trace into durable evidence."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import parse_dosbox_vroomm_trace as startup


REGISTER_RE = re.compile(r"\b(EAX|EBX|ECX|EDX|ES|CS|EIP)=([0-9A-F]{4,8})\b")
SNAPSHOT_RE = re.compile(r"debugger_console_(\d+)\.txt$")
EXPECTED_SAVE_SHA256 = "2bc5a41f17c3dcc69555866e459a6db8da839fd22bb559aecd2797dba595a1a4"
EXPECTED_PREFIX = [20, 28, 7, 24]
COMBAT_SETUP_DESCRIPTOR = 8
REJECTED_STATIC_DESCRIPTOR = 3


def registers(path: Path) -> dict[str, int]:
    return {name: int(value, 16) for name, value in REGISTER_RE.findall(path.read_text(errors="replace"))}


def canonical_ranges(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    if metadata.get("phase_ranges"):
        return list(metadata["phase_ranges"])
    counts = metadata.get("phase_seek_counts", {})
    ordered_names = ["entry"]
    ordered_names.extend(sorted(name for name in counts if name.startswith("look-")))
    ordered_names.extend(["encounter-continue", "combat-choice"])
    ranges: list[dict[str, Any]] = []
    start = 0
    for name in ordered_names:
        count = int(counts.get(name, 0))
        ranges.append({"phase": name, "start_snapshot": start, "snapshot_count": count})
        start += count
    if start != int(metadata["seek_count"]):
        raise ValueError(f"phase counts cover {start} snapshots, expected {metadata['seek_count']}")
    return ranges


def phase_for(snapshot: int, ranges: list[dict[str, Any]]) -> str:
    for item in ranges:
        start = int(item["start_snapshot"])
        if start <= snapshot < start + int(item["snapshot_count"]):
            return str(item["phase"])
    raise ValueError(f"snapshot {snapshot} is outside phase ranges")


def normalize(trace_dir: Path, map_path: Path) -> dict[str, Any]:
    metadata = json.loads((trace_dir / "route-trace.json").read_text(encoding="utf-8-sig"))
    if metadata["save_sha256"] != EXPECTED_SAVE_SHA256:
        raise ValueError("route save hash mismatch")
    if int(metadata["sidecar_count"]) != 16:
        raise ValueError("route trace lacks the complete 16-file sidecar set")
    ranges = canonical_ranges(metadata)
    profile = startup.load_profile(map_path, "pool-of-radiance")
    descriptors = {
        (int(item["ovr_file_offset"]), int(item["code_size"])): item
        for item in profile["descriptors"]
    }

    records: list[dict[str, Any]] = []
    handles: Counter[int] = Counter()
    paths = sorted(
        trace_dir.glob("debugger_console_*.txt"),
        key=lambda path: int(SNAPSHOT_RE.search(path.name).group(1)),  # type: ignore[union-attr]
    )
    for path in paths:
        snapshot = int(SNAPSHOT_RE.search(path.name).group(1))  # type: ignore[union-attr]
        regs = registers(path)
        if ((regs.get("EAX", 0) >> 8) & 0xFF) != 0x42:
            continue
        handle = regs["EBX"]
        handles[handle] += 1
        if handle != 5:
            continue
        parsed = startup.parse_snapshot(path)
        if parsed is None or parsed.destination_segment is None or parsed.code_size is None:
            raise ValueError(f"incomplete GAME.OVR seek snapshot: {path.name}")
        descriptor = descriptors.get((parsed.seek_offset, parsed.code_size))
        if descriptor is None:
            raise ValueError(
                f"unmapped GAME.OVR load offset=0x{parsed.seek_offset:X} size=0x{parsed.code_size:X}"
            )
        records.append(
            {
                "snapshot": snapshot,
                "phase": phase_for(snapshot, ranges),
                "descriptor_index": int(descriptor["index"]),
                "seek_offset": parsed.seek_offset,
                "code_size": parsed.code_size,
                "destination_segment": parsed.destination_segment,
                "loader_cs_ip": f"{parsed.cs:04X}:{parsed.eip:04X}",
            }
        )

    indices = [item["descriptor_index"] for item in records]
    errors: list[str] = []
    if indices[: len(EXPECTED_PREFIX)] != EXPECTED_PREFIX:
        errors.append(f"expected route prefix {EXPECTED_PREFIX}, observed {indices[:4]}")
    if COMBAT_SETUP_DESCRIPTOR not in indices:
        errors.append("combat setup descriptor 8 was not loaded")
    if REJECTED_STATIC_DESCRIPTOR in indices:
        errors.append("stale startup descriptor 3 unexpectedly reloaded during route")
    if len(records) != int(metadata["game_ovr_seek_count"]):
        errors.append(
            f"metadata reports {metadata['game_ovr_seek_count']} GAME.OVR seeks, parsed {len(records)}"
        )

    combat_setup = next(
        (item for item in records if item["descriptor_index"] == COMBAT_SETUP_DESCRIPTOR),
        None,
    )
    combat_was_forced = metadata.get("combat_was_forced")
    if combat_was_forced is None and combat_setup is not None:
        combat_was_forced = combat_setup["phase"] == "encounter-continue"

    return {
        "schema_version": 1,
        "captured_at": "2026-07-15",
        "profile_id": "pool-of-radiance",
        "title": "Pool of Radiance",
        "source": profile["fbov"],
        "route": {
            "ecl": "ECL1#18",
            "position": [14, 8],
            "search": True,
            "save_sha256": metadata["save_sha256"],
            "sidecar_count": metadata["sidecar_count"],
            "combat_was_forced": combat_was_forced,
            "handoff_kind": "generic_random_encounter_not_bound_to_ecl_combat",
        },
        "phase_ranges": ranges,
        "all_seek_count": int(metadata["seek_count"]),
        "handle_counts": {str(key): value for key, value in sorted(handles.items())},
        "game_ovr_records": records,
        "descriptor_sequence": indices,
        "rejected_startup_candidate": {
            "game_ovr_file_offset": 0x24E1,
            "startup_descriptor": REJECTED_STATIC_DESCRIPTOR,
            "route_time_reload_count": indices.count(REJECTED_STATIC_DESCRIPTOR),
            "verdict": "not_resident_by_route_time_load_evidence",
        },
        "validation": {"ok": not errors, "errors": errors},
        "claim_boundary": (
            "proves route-time overlay loads through a visible generic random-encounter tactical "
            "setup; does not prove execution of ECL1#18 COMBAT 0xB1A0 or its resume CS:IP"
        ),
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Pool route-time VROOMM trace",
        "",
        "> Generated by `tools/parse_pool_route_vroomm_trace.py` from the bounded ECL1#18 DEBUGBOX trace.",
        "",
        f"- Validation: **{'PASS' if payload['validation']['ok'] else 'FAIL'}**",
        f"- Total AH=42 seeks: {payload['all_seek_count']}",
        f"- GAME.OVR loads: {len(payload['game_ovr_records'])}",
        f"- Descriptor sequence: `{payload['descriptor_sequence']}`",
        "- Static descriptor-3 candidate: **rejected for this route**; it was never reloaded after eviction.",
        "- Handoff classification: **generic random encounter**, not the selected ECL COMBAT path.",
        "",
        "| Snapshot | Phase | Descriptor | GAME.OVR seek | Size | Destination |",
        "| ---: | --- | ---: | ---: | ---: | ---: |",
    ]
    for record in payload["game_ovr_records"]:
        lines.append(
            f"| {record['snapshot']} | `{record['phase']}` | {record['descriptor_index']} | "
            f"`0x{record['seek_offset']:X}` | `0x{record['code_size']:X}` | "
            f"`{record['destination_segment']:04X}` |"
        )
    if payload["validation"]["errors"]:
        lines.extend(["", "## Validation errors", ""])
        lines.extend(f"- {error}" for error in payload["validation"]["errors"])
    lines.extend(["", "## Claim boundary", "", payload["claim_boundary"], ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace-dir", type=Path, required=True)
    parser.add_argument("--map-json", type=Path, default=Path("build/gen1-all-games-map.json"))
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--markdown", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    payload = normalize(args.trace_dir, args.map_json)
    args.fixture.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="\n")
    args.markdown.write_text(render_markdown(payload), encoding="utf-8", newline="\n")
    print(
        f"[pool-route-vroomm] game_ovr={len(payload['game_ovr_records'])} "
        f"sequence={payload['descriptor_sequence']} ok={payload['validation']['ok']}"
    )
    return 1 if args.strict and not payload["validation"]["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
