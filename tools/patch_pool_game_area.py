#!/usr/bin/env python3
"""Reproduce the rejected two-selector Pool game-area save probe."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


EXPECTED_SOURCE_SHA256 = "2bc5a41f17c3dcc69555866e459a6db8da839fd22bb559aecd2797dba595a1a4"
EXPECTED_SIZE = 13137
WRAPPER_GAME_AREA_OFFSET = 0
AREA1_FILE_OFFSET = 1
AREA_STRUCT_SIZE = 0x800
AREA2_FILE_OFFSET = AREA1_FILE_OFFSET + AREA_STRUCT_SIZE
AREA2_GAME_AREA_FIELD_OFFSET = 0x624
AREA2_GAME_AREA_FILE_OFFSET = AREA2_FILE_OFFSET + AREA2_GAME_AREA_FIELD_OFFSET
GAME_AREA_OFFSETS = (WRAPPER_GAME_AREA_OFFSET, AREA2_GAME_AREA_FILE_OFFSET)
SOURCE_GAME_AREA = 2
TARGET_GAME_AREA = 1


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def patch_game_area(data: bytes, expected_sha256: str = EXPECTED_SOURCE_SHA256) -> bytes:
    actual_sha256 = sha256(data)
    if actual_sha256 != expected_sha256:
        raise ValueError(f"unsupported Pool route save: expected {expected_sha256}, got {actual_sha256}")
    if len(data) != EXPECTED_SIZE:
        raise ValueError(f"unsupported Pool save size: expected {EXPECTED_SIZE}, got {len(data)}")
    before = [data[offset] for offset in GAME_AREA_OFFSETS]
    if before != [SOURCE_GAME_AREA, SOURCE_GAME_AREA]:
        raise ValueError(f"inconsistent source game-area selectors: {before}")
    output = bytearray(data)
    for offset in GAME_AREA_OFFSETS:
        output[offset] = TARGET_GAME_AREA
    changed = [index for index, pair in enumerate(zip(data, output)) if pair[0] != pair[1]]
    if changed != list(GAME_AREA_OFFSETS):
        raise RuntimeError(f"unexpected changed offsets: {changed}")
    return bytes(output)


def write_patch(source_path: Path, output_path: Path) -> dict[str, object]:
    source_path = source_path.resolve()
    output_path = output_path.resolve()
    if source_path == output_path:
        raise ValueError("input and output files must differ")
    if output_path.exists():
        raise FileExistsError(f"output already exists: {output_path}")
    source = source_path.read_bytes()
    output = patch_game_area(source)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(output)
    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Pool of Radiance",
        "source": {"filename": source_path.name, "size": len(source), "sha256": sha256(source)},
        "output": {"filename": output_path.name, "size": len(output), "sha256": sha256(output)},
        "patch": {
            "file_offsets": list(GAME_AREA_OFFSETS),
            "before": SOURCE_GAME_AREA,
            "after": TARGET_GAME_AREA,
            "layout": "game_area wrapper byte, Area1 0x800 bytes, Area2 game_area at +0x624",
            "executable_evidence": [
                "GAME.OVR:0xE9A3 initializes DGROUP 0x5376",
                "GAME.OVR:0x1FBA7 restores DGROUP 0x5376 from area2_ptr+0x624",
            ],
        },
        "claim_boundary": (
            "rejected probe only: even with both serialized selectors changed consistently, the "
            "save fails before Pool establishes its game DGROUP; this cannot create ECL1 state"
        ),
    }
    output_path.with_suffix(output_path.suffix + ".game-area.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = write_patch(args.source, args.output)
    print(
        f"[pool-game-area] input={manifest['source']['sha256']} "  # type: ignore[index]
        f"output={manifest['output']['sha256']} offsets={list(GAME_AREA_OFFSETS)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
