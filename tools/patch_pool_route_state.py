#!/usr/bin/env python3
"""Patch only source-mapped Pool ECL route-state words in a coherent save copy."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


EXPECTED_SAVE_SHA256 = "8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619"
EXPECTED_SIZE = 13137
AREA1_FILE_OFFSET = 1
ECL_AREA_BASE = 0x4900
AREA_WORD_BIAS = 0x6E00
ROUTE_VALUES = {0x49F2: 18, 0x4A35: 0x00FF, 0x4A38: 0x0000}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def area_offset(location: int) -> int:
    """Pool `GAME.OVR:0x814A/0x82DF`: `(location*2 + 0x6E00) & 0xffff`."""
    if not ECL_AREA_BASE <= location <= 0x4CFF:
        raise ValueError(f"location 0x{location:04X} is outside Pool's area-memory window")
    return (location * 2 + AREA_WORD_BIAS) & 0xFFFF


def file_offset(location: int) -> int:
    return AREA1_FILE_OFFSET + area_offset(location)


def read_word(data: bytes, location: int) -> int:
    offset = file_offset(location)
    if offset + 2 > len(data):
        raise ValueError(f"save is too short for ECL location 0x{location:04X}")
    return int.from_bytes(data[offset : offset + 2], "little")


def patch_route_state(
    data: bytes,
    expected_sha256: str = EXPECTED_SAVE_SHA256,
) -> bytes:
    actual_sha256 = sha256(data)
    if actual_sha256 != expected_sha256:
        raise ValueError(
            f"unsupported coherent Pool save revision: expected {expected_sha256}, got {actual_sha256}"
        )
    if len(data) != EXPECTED_SIZE:
        raise ValueError(f"unsupported Pool save size: expected {EXPECTED_SIZE}, got {len(data)}")

    expected_before = {0x49F2: 20, 0x4A35: 0x0000, 0x4A38: 0x0000}
    actual_before = {location: read_word(data, location) for location in ROUTE_VALUES}
    if actual_before != expected_before:
        raise ValueError(f"route-state source mismatch: expected {expected_before}, got {actual_before}")

    output = bytearray(data)
    for location, value in ROUTE_VALUES.items():
        offset = file_offset(location)
        output[offset : offset + 2] = value.to_bytes(2, "little")
    patched = bytes(output)
    changed = [index for index, pair in enumerate(zip(data, patched)) if pair[0] != pair[1]]
    expected_changes = [file_offset(0x49F2), file_offset(0x4A35)]
    if changed != expected_changes:
        raise RuntimeError(f"unexpected route-state changes: {changed}")
    return patched


def write_patched_save(source_path: Path, output_path: Path) -> dict[str, object]:
    source_path = source_path.resolve()
    output_path = output_path.resolve()
    if source_path == output_path:
        raise ValueError("input and output files must differ")
    if output_path.exists():
        raise FileExistsError(f"output file already exists: {output_path}")
    source = source_path.read_bytes()
    output = patch_route_state(source)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(output)

    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Pool of Radiance",
        "source": {"filename": source_path.name, "size": len(source), "sha256": sha256(source)},
        "output": {"filename": output_path.name, "size": len(output), "sha256": sha256(output)},
        "mapping": {
            "ecl_area_window": [ECL_AREA_BASE, 0x4CFF],
            "formula": "area_offset=(location*2+0x6e00)&0xffff; file_offset=1+area_offset",
            "executable_evidence": ["GAME.OVR:0x7BCE", "GAME.OVR:0x814A", "GAME.OVR:0x82DF"],
        },
        "route_state": [
            {
                "location": location,
                "area_offset": area_offset(location),
                "file_offset": file_offset(location),
                "before": read_word(source, location),
                "after": read_word(output, location),
            }
            for location in ROUTE_VALUES
        ],
        "claim_boundary": (
            "sets only Pool's source-mapped LastEclBlockId and two decoded ECL1#18 route words; "
            "runtime menu/combat/resume evidence is still required"
        ),
    }
    output_path.with_suffix(output_path.suffix + ".route.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = write_patched_save(args.source, args.output)
    print(
        f"[pool-route-state] input={manifest['source']['sha256']} "  # type: ignore[index]
        f"output={manifest['output']['sha256']}"  # type: ignore[index]
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
