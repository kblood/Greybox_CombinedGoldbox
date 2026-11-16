#!/usr/bin/env python3
"""Inspect a Pool of Radiance save and its referenced sidecars without modifying them."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


EXPECTED_SIZE = 13137
AREA1_FILE_OFFSET = 1
AREA2_FILE_OFFSET = AREA1_FILE_OFFSET + 0x800
OFFSETS = {
    "wrapper_game_area": 0,
    "ecl_member": AREA1_FILE_OFFSET + 0x1E4,
    "area2_game_area": AREA2_FILE_OFFSET + 0x624,
    "x": 12801,
    "y": 12802,
    "facing": 12803,
}
FACING_NAMES = {0: "north", 2: "east", 4: "south", 6: "west"}
SIDECAR_EXTENSIONS = {".SAV", ".ITM", ".SPC"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inspect_save(save_path: Path) -> dict[str, object]:
    save_path = save_path.resolve()
    data = save_path.read_bytes()
    if len(data) != EXPECTED_SIZE:
        raise ValueError(f"unsupported Pool save size: expected {EXPECTED_SIZE}, got {len(data)}")

    text = data.decode("ascii", errors="ignore")
    references = sorted(set(re.findall(r"CHRDAT[A-J][1-6]", text)))
    available = sorted(
        path.name
        for path in save_path.parent.iterdir()
        if path.is_file()
        and path.stem.upper() in references
        and path.suffix.upper() in SIDECAR_EXTENSIONS
    )
    available_stems = {Path(name).stem.upper() for name in available}
    missing_characters = [reference for reference in references if reference not in available_stems]

    facing_raw = data[OFFSETS["facing"]]
    pose = {
        "x": data[OFFSETS["x"]],
        "y": data[OFFSETS["y"]],
        "facing_raw": facing_raw,
        "facing_name": FACING_NAMES.get(facing_raw, "unknown"),
    }
    host = {
        "wrapper_game_area": data[OFFSETS["wrapper_game_area"]],
        "area2_game_area": data[OFFSETS["area2_game_area"]],
        "ecl_member": data[OFFSETS["ecl_member"]],
    }
    candidate = (
        host["wrapper_game_area"] == 2
        and host["area2_game_area"] == 2
        and host["ecl_member"] == 20
        and pose["x"] == 14
        and pose["y"] == 10
        and pose["facing_name"] == "west"
        and len(references) > 0
        and not missing_characters
    )
    return {
        "schema_version": 1,
        "title": "Pool of Radiance manual save intake",
        "save": {
            "filename": save_path.name,
            "size": len(data),
            "sha256": sha256(data),
        },
        "offsets": OFFSETS,
        "host": host,
        "pose": pose,
        "sidecars": {
            "embedded_character_references": references,
            "available_files": available,
            "missing_characters": missing_characters,
        },
        "ecl2_descriptor3_adjacent_candidate": candidate,
        "claim_boundary": (
            "save bytes and sidecar presence only; runtime loading must confirm facing, live "
            "ECL2.DAX#20 header identity, descriptor-3 dispatch, and combat/resume execution"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--require-ecl2-adjacent", action="store_true")
    args = parser.parse_args()

    report = inspect_save(args.save)
    rendered = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8", newline="\n")
    else:
        print(rendered, end="")
    if args.require_ecl2_adjacent and not report["ecl2_descriptor3_adjacent_candidate"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
