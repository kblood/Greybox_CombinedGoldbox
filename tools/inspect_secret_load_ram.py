#!/usr/bin/env python3
"""Inspect Secret load-route RAM dumps for filename anchors and complete save buffers."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


NEEDLES = {
    "savgam": b"savgam",
    "dot_dat": b".dat",
    "load_which_game": b"Load Which Game",
    "save_path": b"C:\\SAVE\\",
}


def find_all(data: bytes, needle: bytes) -> list[int]:
    offsets: list[int] = []
    cursor = 0
    while True:
        found = data.find(needle, cursor)
        if found < 0:
            return offsets
        offsets.append(found)
        cursor = found + 1


def stable_window(save: bytes, size: int = 128) -> tuple[int, bytes]:
    if len(save) < size:
        return 0, save
    candidates = range(0, len(save) - size + 1, size)
    offset = max(
        candidates,
        key=lambda start: (len(set(save[start : start + size])), sum(byte != 0 for byte in save[start : start + size])),
    )
    return offset, save[offset : offset + size]


def inspect_dump(dump_path: Path, save_path: Path) -> dict[str, object]:
    data = dump_path.read_bytes()
    save = save_path.read_bytes()
    anchors = {name: find_all(data, needle) for name, needle in NEEDLES.items()}

    save_candidates: list[dict[str, object]] = []
    save_window_offset, window = stable_window(save)
    for window_offset in find_all(data, window):
        start = window_offset - save_window_offset
        if start < 0 or start + len(save) > len(data):
            continue
        candidate = data[start : start + len(save)]
        different = [index for index, pair in enumerate(zip(candidate, save)) if pair[0] != pair[1]]
        save_candidates.append(
            {
                "physical_offset": start,
                "sha256": hashlib.sha256(candidate).hexdigest(),
                "exact_save_match": not different,
                "different_byte_count": len(different),
                "first_different_offsets": different[:16],
            }
        )

    return {
        "dump": str(dump_path),
        "dump_sha256": hashlib.sha256(data).hexdigest(),
        "save": str(save_path),
        "save_sha256": hashlib.sha256(save).hexdigest(),
        "stable_window_offset": save_window_offset,
        "anchors": anchors,
        "save_buffer_candidates": save_candidates,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", nargs=3, action="append", metavar=("NAME", "DUMP", "SAVE"), required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    payload = {
        "schema_version": 1,
        "cases": {
            name: inspect_dump(Path(dump_path), Path(save_path))
            for name, dump_path, save_path in args.case
        },
        "claim_boundary": "anchors and exact byte matches only; absence does not prove a file was never opened",
    }
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8", newline="\n")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
