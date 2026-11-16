#!/usr/bin/env python3
"""Create an isolated Pool of Radiance runtime stage with protection skipped."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


EXPECTED_GAME_OVR_SHA256 = "872964a32cef0fc32bbf83bab68b15e04ad36d59076f37b00a179dfee7928614"
PROTECTION_ENTRY_OFFSET = 0xAA9
EXPECTED_ENTRY = bytes.fromhex("55 89 E5")
PATCHED_ENTRY = bytes.fromhex("CB 89 E5")  # RETF; trailing bytes remain unreachable.


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def patch_overlay(data: bytes, expected_sha256: str = EXPECTED_GAME_OVR_SHA256) -> bytes:
    actual_sha256 = sha256(data)
    if actual_sha256 != expected_sha256:
        raise ValueError(
            f"unsupported GAME.OVR revision: expected {expected_sha256}, got {actual_sha256}"
        )
    actual_entry = data[PROTECTION_ENTRY_OFFSET : PROTECTION_ENTRY_OFFSET + len(EXPECTED_ENTRY)]
    if actual_entry != EXPECTED_ENTRY:
        raise ValueError(
            f"protection entry mismatch at 0x{PROTECTION_ENTRY_OFFSET:X}: "
            f"expected {EXPECTED_ENTRY.hex(' ')}, got {actual_entry.hex(' ')}"
        )
    patched = bytearray(data)
    patched[PROTECTION_ENTRY_OFFSET : PROTECTION_ENTRY_OFFSET + len(PATCHED_ENTRY)] = PATCHED_ENTRY
    return bytes(patched)


def create_stage(game_dir: Path, out_dir: Path) -> dict[str, object]:
    game_dir = game_dir.resolve()
    out_dir = out_dir.resolve()
    if game_dir == out_dir or game_dir in out_dir.parents or out_dir in game_dir.parents:
        raise ValueError("input and output directories must differ and may not be nested")
    if out_dir.exists():
        raise FileExistsError(f"output directory already exists: {out_dir}")
    source_overlay = game_dir / "GAME.OVR"
    source = source_overlay.read_bytes()
    patched = patch_overlay(source)

    shutil.copytree(game_dir, out_dir)
    output_overlay = out_dir / "GAME.OVR"
    output_overlay.write_bytes(patched)
    changed = [index for index, (left, right) in enumerate(zip(source, patched)) if left != right]
    if changed != [PROTECTION_ENTRY_OFFSET]:
        raise RuntimeError(f"unexpected changed offsets: {changed}")

    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Pool of Radiance",
        "source": {
            "filename": "GAME.OVR",
            "size": len(source),
            "sha256": sha256(source),
        },
        "output": {
            "filename": "GAME.OVR",
            "size": len(patched),
            "sha256": sha256(patched),
        },
        "patch": {
            "file_offset": PROTECTION_ENTRY_OFFSET,
            "before": EXPECTED_ENTRY.hex(" "),
            "after": PATCHED_ENTRY.hex(" "),
            "changed_byte_count": len(changed),
            "purpose": "return from translator-wheel routine before prompting",
            "claim_boundary": "runtime-stage bypass only; no original GOG file is modified",
        },
    }
    (out_dir / "pool-protection-patch.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest = create_stage(args.game_dir, args.out_dir)
    print(
        f"[pool-protection] offset=0x{PROTECTION_ENTRY_OFFSET:X} "
        f"input={manifest['source']['sha256']} output={manifest['output']['sha256']}"  # type: ignore[index]
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
