#!/usr/bin/env python3
"""Patch only the byte-proven pose fields in a Pool of Radiance save copy."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


EXPECTED_SAVE_SHA256 = "abca248371287c43c99e1b34e03394819fca3cf406bed184e7e4fbfe4f0c08f1"
EXPECTED_SIZE = 13137
POSE_OFFSETS = {"x": 12801, "y": 12802, "facing": 12803}
FACING_VALUES = {"north": 0, "east": 2, "south": 4, "west": 6}
EXPECTED_SOURCE_POSE = {"x": 15, "y": 4, "facing": FACING_VALUES["west"]}
COHERENT_ECL18_SAVE_SHA256 = "0dba44a8a5fc50d04c3870dd5ace19b31a18593eb4247586c94f5559162651d6"
SUPPORTED_SOURCE_POSES = {
    EXPECTED_SAVE_SHA256: EXPECTED_SOURCE_POSE,
    COHERENT_ECL18_SAVE_SHA256: {"x": 14, "y": 5, "facing": FACING_VALUES["south"]},
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def decode_pose(data: bytes) -> dict[str, int]:
    if len(data) != EXPECTED_SIZE:
        raise ValueError(f"unsupported Pool save size: expected {EXPECTED_SIZE}, got {len(data)}")
    return {name: data[offset] for name, offset in POSE_OFFSETS.items()}


def patch_pose(
    data: bytes,
    x: int,
    y: int,
    facing: str,
    expected_sha256: str | None = None,
) -> bytes:
    actual_sha256 = sha256(data)
    if expected_sha256 is not None and actual_sha256 != expected_sha256:
        raise ValueError(
            f"unsupported SAVGAMA.DAT revision: expected {expected_sha256}, got {actual_sha256}"
        )
    expected_pose = SUPPORTED_SOURCE_POSES.get(actual_sha256)
    if expected_pose is None:
        if expected_sha256 is None:
            supported = ", ".join(sorted(SUPPORTED_SOURCE_POSES))
            raise ValueError(
                f"unsupported SAVGAMA.DAT revision: got {actual_sha256}; supported: {supported}"
            )
        expected_pose = EXPECTED_SOURCE_POSE
    source_pose = decode_pose(data)
    if source_pose != expected_pose:
        raise ValueError(f"source pose mismatch: expected {expected_pose}, got {source_pose}")
    if not 0 <= x < 16 or not 0 <= y < 16:
        raise ValueError("x and y must be in 0..15")
    if facing not in FACING_VALUES:
        raise ValueError(f"unsupported facing: {facing}")

    patched = bytearray(data)
    patched[POSE_OFFSETS["x"]] = x
    patched[POSE_OFFSETS["y"]] = y
    patched[POSE_OFFSETS["facing"]] = FACING_VALUES[facing]
    return bytes(patched)


def write_patched_save(source_path: Path, output_path: Path, x: int, y: int, facing: str) -> dict[str, object]:
    source_path = source_path.resolve()
    output_path = output_path.resolve()
    if source_path == output_path:
        raise ValueError("input and output files must differ")
    if output_path.exists():
        raise FileExistsError(f"output file already exists: {output_path}")
    source = source_path.read_bytes()
    patched = patch_pose(source, x, y, facing)
    changed = [index for index, pair in enumerate(zip(source, patched)) if pair[0] != pair[1]]
    expected_changed = [
        offset
        for name, offset in POSE_OFFSETS.items()
        if source[offset] != patched[offset]
    ]
    if changed != expected_changed:
        raise RuntimeError(f"unexpected changed offsets: {changed}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(patched)
    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Pool of Radiance",
        "source": {"filename": source_path.name, "size": len(source), "sha256": sha256(source)},
        "output": {"filename": output_path.name, "size": len(patched), "sha256": sha256(patched)},
        "pose": {
            "offsets": POSE_OFFSETS,
            "before": decode_pose(source),
            "after": decode_pose(patched),
            "facing_name": facing,
        },
        "claim_boundary": (
            "patches pose within the save's existing area only; it does not select an ECL/GEO block "
            "or initialize route state"
        ),
    }
    manifest_path = output_path.with_suffix(output_path.suffix + ".pose.json")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--x", type=int, required=True)
    parser.add_argument("--y", type=int, required=True)
    parser.add_argument("--facing", choices=FACING_VALUES, required=True)
    args = parser.parse_args()
    manifest = write_patched_save(args.source, args.output, args.x, args.y, args.facing)
    print(
        f"[pool-save-pose] input={manifest['source']['sha256']} "  # type: ignore[index]
        f"output={manifest['output']['sha256']} pose={manifest['pose']['after']}"  # type: ignore[index]
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
