#!/usr/bin/env python3
"""Summarize a read-only CoK town-menu -> Outpost GameLink checkpoint transition.

This does not assign meanings to DOS addresses.  It turns the bounded snapshots produced by
``cok_gamelink_saved_outpost_route.ps1`` into a compact, reviewable report: changed-byte runs and
ASCII resource/UI strings that entered or left the captured RAM.  A later DS/DGROUP calibration is
still required before any reported offset can be treated as a game-state variable.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable


REGIONS = (("lowram", 0), ("midram", 0x20000))


def changed_runs(before: bytes, after: bytes) -> list[dict[str, int]]:
    runs: list[dict[str, int]] = []
    start: int | None = None
    for index, (left, right) in enumerate(zip(before, after)):
        if left != right and start is None:
            start = index
        elif left == right and start is not None:
            runs.append({"offset": start, "length": index - start})
            start = None
    if start is not None:
        runs.append({"offset": start, "length": len(before) - start})
    return runs


def printable_strings(data: bytes, minimum: int = 6) -> dict[int, str]:
    found: dict[int, str] = {}
    start: int | None = None
    for index, value in enumerate(data + b"\0"):
        if 32 <= value <= 126:
            if start is None:
                start = index
        elif start is not None:
            if index - start >= minimum:
                found[start] = data[start:index].decode("ascii", "replace")
            start = None
    return found


def string_deltas(before: bytes, after: bytes) -> list[dict[str, object]]:
    old = printable_strings(before)
    new = printable_strings(after)
    result: list[dict[str, object]] = []
    for offset in sorted(set(old) | set(new)):
        left, right = old.get(offset), new.get(offset)
        if left != right:
            result.append({"offset": offset, "before": left, "after": right})
    return result


def load_region(checkpoint: Path, name: str) -> bytes:
    path = checkpoint / f"{name}.bin"
    if not path.is_file():
        raise ValueError(f"checkpoint lacks {name}: {path}")
    return path.read_bytes()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True, help="town-destination-menu checkpoint directory")
    parser.add_argument("--after", type=Path, required=True, help="outpost-confirmation checkpoint directory")
    parser.add_argument("--output", type=Path, required=True, help="JSON report path (must not already exist)")
    args = parser.parse_args()

    if args.output.exists():
        raise SystemExit(f"refusing to overwrite output: {args.output}")
    report: dict[str, object] = {
        "kind": "cok-town-to-outpost-transition",
        "claim_boundary": "Offsets are physical GameLink snapshot offsets, not proven DGROUP/ECL variables.",
        "before": str(args.before),
        "after": str(args.after),
        "regions": [],
    }
    regions: list[dict[str, object]] = []
    for name, base in REGIONS:
        before, after = load_region(args.before, name), load_region(args.after, name)
        if len(before) != len(after):
            raise SystemExit(f"mismatched {name} sizes: {len(before)} != {len(after)}")
        runs = changed_runs(before, after)
        strings = string_deltas(before, after)
        regions.append({
            "name": name,
            "physical_base": f"0x{base:05X}",
            "length": len(before),
            "changed_bytes": sum(run["length"] for run in runs),
            "changed_runs": runs,
            "ascii_string_deltas": strings,
        })
    report["regions"] = regions
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "regions": len(regions)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
