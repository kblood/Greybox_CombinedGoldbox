#!/usr/bin/env python3
"""Create an isolated, hash-locked Pool of Radiance DOS runtime stage.

Mirrors `tools/stage_coab_runtime.py` and `tools/stage_gateway_runtime.py`'s copy-only,
hash-locked staging convention, applied to Pool of Radiance's GOG install. Pool is family
`gen1-fbov` (same VROOMM/FBOV overlay-loader shape as CoAB): a single `START.EXE` resident
image plus `GAME.OVR` overlay, no separate `GAME.EXE`/`START1.EXE` split. Unlike CoAB, Pool's
GOG install keeps every runtime file one level down, in a `POOLRAD` subdirectory (the
existing `tools/trace_pool_ecl18_route.ps1` route probe already relies on this: it mounts the
stage root as `C:` and issues `CD POOLRAD` before `START`, because the unchanged retail
`POOL.CFG` embeds the literal path `C:\POOLRAD\`). This script preserves that same
`<stage>/POOLRAD/...` layout so a probe can reuse the identical mount + `CD POOLRAD` + `START`
launch shape. It never touches the original GOG install -- it only reads from it and writes
into a fresh --output directory under build/.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


DEFAULT_SOURCE = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance")
GAME_SUBDIR = "POOLRAD"
EXPECTED_HASHES = {
    "GAME.OVR": "872964a32cef0fc32bbf83bab68b15e04ad36d59076f37b00a179dfee7928614",
    "START.EXE": "d825df2b174675c9088ba1489488bdeebe66ad2a22943f17d3a198e60b6a07bd",
}
REQUIRED_ROUTE_FILES = {"ECL1.DAX", "GEO1.DAX", "POOL.CFG", "START.EXE", "GAME.OVR"}
EXCLUDED_PREFIXES = ("UNINS", "SETUP")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def runtime_source_files(game_dir: Path) -> list[Path]:
    return sorted(
        (
            path
            for path in game_dir.iterdir()
            if path.is_file() and not path.name.upper().startswith(EXCLUDED_PREFIXES)
        ),
        key=lambda path: path.name.upper(),
    )


def build_stage(
    source: Path,
    output: Path,
    expected_hashes: dict[str, str] | None = None,
) -> dict[str, Any]:
    source = source.resolve()
    output = output.resolve()
    if not source.is_dir():
        raise ValueError(f"Pool source directory does not exist: {source}")
    if output.exists():
        raise ValueError(f"output directory already exists: {output}")
    game_dir = source / GAME_SUBDIR
    if not game_dir.is_dir():
        raise ValueError(f"Pool game subdirectory does not exist: {game_dir}")

    files = runtime_source_files(game_dir)
    names = {path.name.upper() for path in files}
    missing = sorted(REQUIRED_ROUTE_FILES - names)
    if missing:
        raise ValueError(f"Pool runtime source is missing: {', '.join(missing)}")

    expected_hashes = expected_hashes or {}
    for name, expected in expected_hashes.items():
        path = game_dir / name
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"Pool source hash mismatch: {name}")

    output.mkdir(parents=True)
    output_game_dir = output / GAME_SUBDIR
    output_game_dir.mkdir()
    for path in files:
        shutil.copy2(path, output_game_dir / path.name)

    staged_files = sorted(path for path in output.rglob("*") if path.is_file())
    rows = [
        {
            "path": path.relative_to(output).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in staged_files
    ]
    manifest: dict[str, Any] = {
        "schema_version": 1,
        "title": "Pool of Radiance isolated DOS runtime stage",
        "profile_id": "pool-of-radiance",
        "source_root": str(source),
        "output_root": str(output),
        "launch": {
            "executable": "START.EXE",
            "argument": None,
            "dos_working_dir": GAME_SUBDIR,
        },
        "file_count": len(rows),
        "files": rows,
        "save_bundle_present": any(
            row["path"].upper().endswith(".SAV") or "SAVGAM" in row["path"].upper()
            for row in rows
        ),
        "route_ready": False,
        "route_validation": None,
        "status": "base_stage_no_save",
        "claim_boundary": (
            "This is an isolated byte-identical DOS runtime copy. It stages every file already "
            "present in the GOG install's POOLRAD directory (including any retail-shipped "
            "SAVGAM*/CHRDAT* files) but does not itself construct or validate a route-ready "
            "save. Route readiness for a specific ECL/GEO target requires a separate validated "
            "save, exactly as tools/trace_pool_ecl18_route.ps1 already establishes."
        ),
    }
    (output / "pool-stage-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    manifest = build_stage(
        args.source,
        args.output,
        EXPECTED_HASHES if args.strict else None,
    )
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
