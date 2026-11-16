#!/usr/bin/env python3
"""Validate a captured native Gateway ECL6 wilderness trace.

This helper is deliberately read-only apart from its JSON output.  It does not launch DOSBox,
inject input, mutate saves, or infer process-local addresses from a different emulator session.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


AREA1_BYTES = 0x800
AREA1_SAVE_OFFSET = 1
AREA1_ANCHOR_OFFSET = 0x180
AREA1_ANCHOR_LENGTH = 32
INITIAL_POSE = bytes((8, 2, 6, 0, 9))
MOVED_POSE = bytes((7, 2, 6, 0, 9))


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def all_offsets(raw: bytes, pattern: bytes) -> list[int]:
    offsets: list[int] = []
    cursor = 0
    while True:
        hit = raw.find(pattern, cursor)
        if hit < 0:
            return offsets
        offsets.append(hit)
        cursor = hit + 1


def area1_offset(address: int) -> int:
    return (0x6A00 + address * 2) & 0xFFFF


def file_evidence(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    return {"path": str(path), "bytes": len(raw), "sha256": digest(raw)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, required=True)
    parser.add_argument("--pre-ram", type=Path, required=True)
    parser.add_argument("--moved-ram", type=Path, required=True)
    parser.add_argument("--gate-ram", type=Path, required=True)
    parser.add_argument("--dos-log", type=Path, required=True)
    parser.add_argument("--screenshot", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    save = args.save.read_bytes()
    pre = args.pre_ram.read_bytes()
    moved = args.moved_ram.read_bytes()
    gate = args.gate_ram.read_bytes()
    if len(save) < AREA1_SAVE_OFFSET + AREA1_BYTES:
        raise ValueError("save is too short to contain the Gateway Area1 record")
    if not (len(pre) == len(moved) == len(gate)):
        raise ValueError("RAM captures must have equal bounds from the same DOSBox process")

    pose_hits = all_offsets(pre, INITIAL_POSE)
    if len(pose_hits) != 1:
        raise ValueError(f"expected one initial live-pose candidate, found {pose_hits}")
    pose_address = pose_hits[0]
    if moved[pose_address : pose_address + 5] != MOVED_POSE:
        raise ValueError("same-process forward step did not update only the expected live X byte")

    anchor = save[
        AREA1_SAVE_OFFSET + AREA1_ANCHOR_OFFSET :
        AREA1_SAVE_OFFSET + AREA1_ANCHOR_OFFSET + AREA1_ANCHOR_LENGTH
    ]
    anchor_hits = all_offsets(pre, anchor)
    if len(anchor_hits) != 1:
        raise ValueError(f"expected one resident-Area1 anchor, found {anchor_hits}")
    area1_base = anchor_hits[0] - AREA1_ANCHOR_OFFSET
    if area1_base < 0 or area1_base + AREA1_BYTES > len(pre):
        raise ValueError("derived Area1 base falls outside the RAM capture")

    saved_area1 = save[AREA1_SAVE_OFFSET : AREA1_SAVE_OFFSET + AREA1_BYTES]
    resident_area1 = pre[area1_base : area1_base + AREA1_BYTES]
    differences = [
        {"offset": f"0x{index:03X}", "save": saved, "ram": resident}
        for index, (saved, resident) in enumerate(zip(saved_area1, resident_area1))
        if saved != resident
    ]

    counter_offset = area1_offset(0x4C00)
    submap_offset = area1_offset(0x4C24)
    log_text = args.dos_log.read_text(encoding="utf-8", errors="replace")
    required_archives = ("ECL6.DAX", "GEO6.DAX", "ECL5.DAX", "GEO5.DAX")
    archive_opens = {
        name: log_text.upper().count(f"FILE OPEN COMMAND 2 FILE C:\\{name}")
        for name in required_archives
    }
    if any(count == 0 for count in archive_opens.values()):
        raise ValueError(f"DOS file log lacks required native archive opens: {archive_opens}")

    screenshots = [file_evidence(path) for path in args.screenshot]
    report = {
        "schema_version": 1,
        "kind": "gateway_ecl6_native_runtime_trace",
        "inputs": {
            "save": file_evidence(args.save),
            "pre_ram": file_evidence(args.pre_ram),
            "moved_ram": file_evidence(args.moved_ram),
            "gate_ram": file_evidence(args.gate_ram),
            "dos_log": file_evidence(args.dos_log),
            "screenshots": screenshots,
        },
        "live_pose": {
            "physical_address": f"0x{pose_address:X}",
            "initial": list(pre[pose_address : pose_address + 5]),
            "after_one_forward_step": list(moved[pose_address : pose_address + 5]),
            "at_sundabar_gate": list(gate[pose_address : pose_address + 5]),
            "field_interpretation": ["x", "y", "raw_direction", "wall_type", "descriptor"],
        },
        "resident_area1": {
            "physical_address": f"0x{area1_base:X}",
            "anchor": {
                "save_area1_offset": f"0x{AREA1_ANCHOR_OFFSET:X}",
                "bytes": anchor.hex(),
                "ram_hits": [f"0x{hit:X}" for hit in anchor_hits],
            },
            "save_differences": differences,
            "pre_move": {
                "0x4C00_encounter_counter": pre[area1_base + counter_offset],
                "0x4C24_submap": pre[area1_base + submap_offset],
            },
            "at_sundabar_gate": {
                "0x4C00_encounter_counter": gate[area1_base + counter_offset],
                "0x4C24_submap": gate[area1_base + submap_offset],
            },
        },
        "native_archive_open_counts": archive_opens,
        "claim_boundary": (
            "The pose and Area1 addresses are calibrated only within these same-process RAM dumps. "
            "The report proves resident values and native archive opens, not the unobserved "
            "ECL2#1-to-ECL6#21 campaign hop or the semantic identity of arbitrary RAM elsewhere."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
