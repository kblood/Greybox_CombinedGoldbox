#!/usr/bin/env python3
"""Create an isolated, hash-locked Death Knights of Krynn (DoK) DOS runtime stage.

Mirrors `tools/stage_coab_runtime.py`'s copy-only, hash-locked staging convention for the
DoK GOG install (profile id `death-knights-of-krynn` in `tools/goldbox_corpus.py`). DoK is
family `gen1-fbov` (same VROOMM/FBOV overlay-loader shape as CoAB/Pool of Radiance): a single
`START.EXE` resident image plus `GAME.OVR` overlay, no separate `GAME.EXE`/`START1.EXE`
split -- confirmed directly (`GAME.OVR` starts with ASCII `FBOV`, `START.EXE` carries 511
`CD 3F` overlay-swap stubs, same shape `tools/disasm_dok.py` already reverse-engineered).
Unlike CoAB/Pool (a single `SAVE/` directory), DoK's own `DKK.CFG` embeds TWO literal DOS
paths -- `C:\\SAVE\\` (party/dungeon state, e.g. the retail-shipped `SAVGAMA.PTY`) and
`C:\\SAVE_CH\\` (per-character `.CCH`-family records) -- so this script stages both. This
script never touches the original GOG install -- it only reads from it and writes into a
fresh --output directory under build/.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


DEFAULT_SOURCE = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Death Knights of Krynn")
EXPECTED_HASHES = {
    "START.EXE": "91b672327e7a950bcf8f044990156bbe254103c79820a4b07433aee86d3dde40",
    "GAME.OVR": "fdbe7265ac9b04c67f8648331d9845bf33c6a1438e676389eae3f4526796c817",
}
RUNTIME_SUFFIXES = {".bat", ".cfg", ".com", ".dax", ".exe", ".ovr"}
RUNTIME_NAMES = {"ITEMS"}
REQUIRED_ROUTE_FILES = {"ECL1.DAX", "GEO1.DAX", "DKK.CFG", "START.EXE", "GAME.OVR"}
EXCLUDED_RUNTIME_PREFIXES = ("UNINS", "SETUP")
SAVE_DIR_NAMES = ("SAVE", "SAVE_CH")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def runtime_source_files(source: Path) -> list[Path]:
    return sorted(
        (
            path
            for path in source.iterdir()
            if path.is_file()
            and not path.name.upper().startswith(EXCLUDED_RUNTIME_PREFIXES)
            and (path.suffix.lower() in RUNTIME_SUFFIXES or path.name.upper() in RUNTIME_NAMES)
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
        raise ValueError(f"DoK source directory does not exist: {source}")
    if output.exists():
        raise ValueError(f"output directory already exists: {output}")

    files = runtime_source_files(source)
    names = {path.name.upper() for path in files}
    missing = sorted(REQUIRED_ROUTE_FILES - names)
    if missing:
        raise ValueError(f"DoK runtime source is missing: {', '.join(missing)}")

    expected_hashes = expected_hashes or {}
    for name, expected in expected_hashes.items():
        path = source / name
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"DoK source hash mismatch: {name}")

    output.mkdir(parents=True)
    for path in files:
        shutil.copy2(path, output / path.name)

    save_dirs: dict[str, Path] = {}
    for dir_name in SAVE_DIR_NAMES:
        source_dir = source / dir_name
        output_dir = output / dir_name
        output_dir.mkdir()
        if source_dir.is_dir():
            save_dirs[dir_name] = source_dir
            for path in sorted((item for item in source_dir.rglob("*") if item.is_file())):
                relative = path.relative_to(source_dir)
                destination = output_dir / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination)

    staged_files = sorted(path for path in output.rglob("*") if path.is_file())
    rows = [
        {
            "path": path.relative_to(output).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in staged_files
    ]
    save_files = [row for row in rows if row["path"].upper().startswith("SAVE/")]
    save_ch_files = [row for row in rows if row["path"].upper().startswith("SAVE_CH/")]
    manifest: dict[str, Any] = {
        "schema_version": 1,
        "title": "Death Knights of Krynn isolated DOS runtime stage",
        "profile_id": "death-knights-of-krynn",
        "source_root": str(source),
        "output_root": str(output),
        "launch": {
            "executable": "START.EXE",
            "argument": None,
            "save_directory": "C:\\SAVE\\",
            "save_ch_directory": "C:\\SAVE_CH\\",
        },
        "file_count": len(rows),
        "files": rows,
        "save_source": str(save_dirs.get("SAVE")) if "SAVE" in save_dirs else None,
        "save_ch_source": str(save_dirs.get("SAVE_CH")) if "SAVE_CH" in save_dirs else None,
        "save_files": save_files,
        "save_ch_files": save_ch_files,
        "save_bundle_present": bool(save_files),
        "route_ready": False,
        "route_validation": None,
        "status": "base_stage_no_save" if not save_files else "save_stage_pending_route_validation",
        "claim_boundary": (
            "This is an isolated byte-identical DOS runtime copy. It stages every runtime file "
            "already present in the GOG install root (including the retail-shipped SAVE/ party "
            "state such as SAVGAMA.PTY and the SAVE_CH/ per-character records) but does not "
            "itself construct or validate a route-ready save. Route readiness for a specific "
            "ECL/GEO target requires separate validated evidence, matching the CoAB/Pool "
            "staging convention this script mirrors."
        ),
    }
    (output / "dok-stage-manifest.json").write_text(
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
