#!/usr/bin/env python3
"""Map Secret's relocated Area1 setter from retained 1 MiB RAM snapshots."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


PROLOGUE = bytes.fromhex("55 89 E5 83 EC 02 FF 76 08 0E E8 2D")
WRITE = bytes.fromhex("26 89 95 00 6A")
PROLOGUE_IP = 0x0507
WRITE_IP = 0x0561
WRITE_FROM_PROLOGUE = WRITE_IP - PROLOGUE_IP


def find_all(data: bytes, needle: bytes) -> list[int]:
    hits: list[int] = []
    start = 0
    while (offset := data.find(needle, start)) >= 0:
        hits.append(offset)
        start = offset + 1
    return hits


def map_snapshot(label: str, path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) != 0x100000:
        raise ValueError(f"{label}: expected a 1 MiB RAM snapshot, got {len(data)} bytes")
    prologue_hits = find_all(data, PROLOGUE)
    if len(prologue_hits) != 1:
        raise ValueError(f"{label}: expected one setter prologue, found {len(prologue_hits)}")

    prologue_physical = prologue_hits[0]
    write_physical = prologue_physical + WRITE_FROM_PROLOGUE
    if data[write_physical : write_physical + len(WRITE)] != WRITE:
        raise ValueError(f"{label}: setter write bytes do not follow the prologue at +0x5A")

    segment_base = prologue_physical - PROLOGUE_IP
    if segment_base < 0 or segment_base % 16:
        raise ValueError(f"{label}: prologue does not normalize to a CS:0507 alias")
    segment = segment_base >> 4
    return {
        "phase": label,
        "snapshot": str(path),
        "snapshot_sha256": hashlib.sha256(data).hexdigest(),
        "prologue_physical": f"0x{prologue_physical:05X}",
        "write_physical": f"0x{write_physical:05X}",
        "runtime_segment": f"{segment:04X}",
        "prologue_pointer": f"{segment:04X}:{PROLOGUE_IP:04X}",
        "write_pointer": f"{segment:04X}:{WRITE_IP:04X}",
        "write_bytes": WRITE.hex(),
    }


def parse_snapshot(value: str) -> tuple[str, Path]:
    label, separator, raw_path = value.partition("=")
    if not separator or not label or not raw_path:
        raise argparse.ArgumentTypeError("snapshot must use PHASE=PATH")
    return label, Path(raw_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", action="append", type=parse_snapshot, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    phases = [map_snapshot(label, path) for label, path in args.snapshot]
    report = {
        "schema_version": 1,
        "title": "Secret relocated Area1 setter runtime map",
        "retail_file_write": "GAME.OVR+0x9F94",
        "runtime_layout": {
            "prologue_ip": f"0x{PROLOGUE_IP:04X}",
            "write_ip": f"0x{WRITE_IP:04X}",
            "write_from_prologue": f"0x{WRITE_FROM_PROLOGUE:02X}",
        },
        "phases": phases,
        "claim_boundary": (
            "Pointers are derived from exact bytes retained in each RAM snapshot. "
            "Only an execution breakpoint can promote a phase pointer to an executed setter symbol."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
