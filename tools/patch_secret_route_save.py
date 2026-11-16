#!/usr/bin/env python3
"""Create a hash-locked synthetic Secret ECL3/GEO3#97 save-host probe."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


EXPECTED_SOURCE_SHA256 = "54296c23138b345726bf2fd36ffa207320378a2d8e15ec477098ec9b5fd49ed9"
EXPECTED_SIZE = 5469
AREA1_OFFSET = 1
AREA2_OFFSET = AREA1_OFFSET + 0x800

# Early Gen1 wrapper/Area1 fields corroborated by the local played CoK save. The later flat
# SAVGAM.TXT global/mirror layout does not apply to this wrapper and must not be patched here.
BYTE_PATCHES = {
    0: 3,  # wrapper game_area / ECL archive set
    AREA1_OFFSET + 0x18A: 97,  # current 3D GEO member
    AREA2_OFFSET + 0x624: 3,  # Area2.game_area restored by loadSaveGame
    5121: 13,  # active mapPosX tail record
    5122: 3,  # active mapPosY tail record
    5123: 6,  # active mapDirection west
}
WORD_PATCHES = {
    AREA1_OFFSET + 0x1E0: 13,  # Area1.lastXPos
    AREA1_OFFSET + 0x1E2: 3,  # Area1.lastYPos
    AREA1_OFFSET + 0x1E4: 97,  # Area1.lastEclBlockId
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def patch_route_save(
    data: bytes, expected_sha256: str = EXPECTED_SOURCE_SHA256, *, keep_wrapper_game_area: bool = False
) -> bytes:
    actual_sha256 = sha256(data)
    if actual_sha256 != expected_sha256:
        raise ValueError(f"unsupported Secret save: expected {expected_sha256}, got {actual_sha256}")
    if len(data) != EXPECTED_SIZE:
        raise ValueError(f"unsupported Secret save size: expected {EXPECTED_SIZE}, got {len(data)}")
    output = bytearray(data)
    byte_patches = {offset: value for offset, value in BYTE_PATCHES.items() if not (keep_wrapper_game_area and offset == 0)}
    for offset, value in byte_patches.items():
        output[offset] = value
    for offset, value in WORD_PATCHES.items():
        output[offset : offset + 2] = value.to_bytes(2, "little")
    return bytes(output)


def write_patch(source_path: Path, output_path: Path, *, keep_wrapper_game_area: bool = False) -> dict[str, object]:
    source_path = source_path.resolve()
    output_path = output_path.resolve()
    if source_path == output_path:
        raise ValueError("input and output files must differ")
    if output_path.exists():
        raise FileExistsError(f"output already exists: {output_path}")
    source = source_path.read_bytes()
    output = patch_route_save(source, keep_wrapper_game_area=keep_wrapper_game_area)
    changed = [index for index, pair in enumerate(zip(source, output)) if pair[0] != pair[1]]
    expected_changed = sorted(
        {offset for offset in BYTE_PATCHES if not (keep_wrapper_game_area and offset == 0)}
        | {
            offset + byte_index
            for offset, value in WORD_PATCHES.items()
            for byte_index, byte in enumerate(value.to_bytes(2, "little"))
            if source[offset + byte_index] != byte
        }
    )
    expected_changed = [offset for offset in expected_changed if source[offset] != output[offset]]
    if changed != expected_changed:
        raise RuntimeError(f"unexpected changed offsets: expected {expected_changed}, got {changed}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(output)
    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Secret of the Silver Blades synthetic route-host probe",
        "source": {"filename": source_path.name, "size": len(source), "sha256": sha256(source)},
        "output": {"filename": output_path.name, "size": len(output), "sha256": sha256(output)},
        "target": {
            "game_area": 3,
            "wrapper_game_area_patched": not keep_wrapper_game_area,
            "geo_member": 97,
            "ecl_member": 97,
            "pose": {"x": 13, "y": 3, "facing": 6, "facing_name": "west"},
            "next_cell": {"x": 12, "y": 3, "descriptor": 3},
        },
        "changed_offsets": changed,
        "provenance": {
            "area1_fields": "packages/engine/src/loaders/area1.ts",
            "wrapper_shape_control": "local played CoK SAVGAMA.DAT 8ceceb298de6a711...",
            "active_pose_tail": "5-byte mapPosX/mapPosY/mapDirection/mapWallType/mapWallRoof record at 5121",
            "route": "docs/engine/research/secret-natural-encounter-route.md",
        },
        "claim_boundary": (
            "synthetic host-state probe only; runtime must prove save acceptance, live archive/member "
            "selection, pose, ECL3.DAX#97 header identity, descriptor dispatch, combat, and resume"
        ),
    }
    output_path.with_suffix(output_path.suffix + ".secret-route.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--keep-wrapper-game-area",
        action="store_true",
        help="diagnostic variant: preserve byte 0 while applying the remaining route fields",
    )
    args = parser.parse_args()
    manifest = write_patch(args.source, args.output, keep_wrapper_game_area=args.keep_wrapper_game_area)
    print(
        f"[secret-route-save] input={manifest['source']['sha256']} "  # type: ignore[index]
        f"output={manifest['output']['sha256']} changes={len(manifest['changed_offsets'])}"  # type: ignore[index]
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
