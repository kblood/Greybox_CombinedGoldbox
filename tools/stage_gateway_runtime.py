#!/usr/bin/env python3
"""Create an isolated, hash-locked Gateway DOS runtime stage."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


DEFAULT_SOURCE = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier")
EXPECTED_HASHES = {
    "GAME.EXE": "0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00",
    "GAME.OVR": "c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd",
    "START1.EXE": "f95b71aeecbb6c222cb59da6ccdecaed5a387bb9a6c7d252e3c6a12067e28df9",
}
RUNTIME_SUFFIXES = {".bat", ".cfg", ".com", ".dax", ".exe", ".ovr"}
RUNTIME_NAMES = {"ITEMS.1"}
REQUIRED_ROUTE_FILES = {"ECL5.DAX", "GEO5.DAX", "GAME.CFG", "GAME.EXE", "GAME.OVR"}
EXCLUDED_RUNTIME_PREFIXES = ("UNINS", "SETUP")


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
    save_source: Path | None = None,
) -> dict[str, Any]:
    source = source.resolve()
    output = output.resolve()
    if not source.is_dir():
        raise ValueError(f"Gateway source directory does not exist: {source}")
    if output.exists():
        raise ValueError(f"output directory already exists: {output}")
    source_save = save_source.resolve() if save_source is not None else source / "SAVE"
    if save_source is not None and not source_save.is_dir():
        raise ValueError(f"Gateway save source directory does not exist: {source_save}")

    files = runtime_source_files(source)
    names = {path.name.upper() for path in files}
    missing = sorted(REQUIRED_ROUTE_FILES - names)
    if missing:
        raise ValueError(f"Gateway runtime source is missing: {', '.join(missing)}")

    expected_hashes = expected_hashes or {}
    for name, expected in expected_hashes.items():
        path = source / name
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"Gateway source hash mismatch: {name}")

    output.mkdir(parents=True)
    for path in files:
        shutil.copy2(path, output / path.name)

    output_save = output / "SAVE"
    output_save.mkdir()
    if source_save.is_dir():
        for path in sorted((item for item in source_save.rglob("*") if item.is_file())):
            relative = path.relative_to(source_save)
            destination = output_save / relative
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
    manifest: dict[str, Any] = {
        "schema_version": 1,
        "title": "Gateway isolated DOS runtime stage",
        "source_root": str(source),
        "output_root": str(output),
        "launch": {"executable": "GAME.EXE", "argument": "UseStart", "save_directory": "C:\\SAVE\\"},
        "route_target": {"ecl": "ECL5.DAX#19", "choice": "FIGHT", "combat_vaddr": "0x8C34"},
        "file_count": len(rows),
        "files": rows,
        "save_source": str(source_save),
        "save_files": save_files,
        "save_bundle_present": bool(save_files),
        "route_ready": False,
        "route_validation": None,
        "status": "base_stage_no_save" if not save_files else "save_stage_pending_route_validation",
        "claim_boundary": (
            "This is an isolated byte-identical DOS runtime copy. Route readiness requires a separate "
            "validated save and original-DOS archive/member/cursor proof."
        ),
    }
    (output / "gateway-stage-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--save-source", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    manifest = build_stage(
        args.source,
        args.output,
        EXPECTED_HASHES if args.strict else None,
        args.save_source,
    )
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
