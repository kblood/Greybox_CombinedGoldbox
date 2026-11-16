#!/usr/bin/env python3
"""Create an isolated, hash-locked Curse of the Azure Bonds (CoAB) DOS runtime stage.

Mirrors tools/stage_gateway_runtime.py's copy-only, hash-locked staging convention for the
CoAB GOG install (profile id `curse-of-the-azure-bonds` in tools/goldbox_corpus.py). CoAB is
family `gen1-fbov` (same VROOMM/FBOV overlay-loader shape as Pool of Radiance, not Gateway's
`gen1-fbov-vga` variant): a single `START.EXE` resident image plus `GAME.OVR` overlay, no
separate `GAME.EXE`/`START1.EXE` split. This script never touches the original GOG install --
it only reads from it and writes into a fresh --output directory under build/.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


DEFAULT_SOURCE = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Curse of the Azure Bonds")
EXPECTED_HASHES = {
    "START.EXE": "42fcefd6785679568b00bc1fb5b1d81ac2773416be4a35e0363920ddf6b78acd",
    "GAME.OVR": "a894282513c2af0a99081c5f888451af14d5ccca686a4a09b4057749a1da51ef",
}
RUNTIME_SUFFIXES = {".bat", ".cfg", ".com", ".dax", ".exe", ".ovr"}
RUNTIME_NAMES = {"ITEMS"}
REQUIRED_ROUTE_FILES = {"ECL1.DAX", "GEO2.DAX", "CURSE.CFG", "START.EXE", "GAME.OVR"}
EXCLUDED_RUNTIME_PREFIXES = ("UNINS", "SETUP")
EXCLUDED_RUNTIME_NAMES = {"CODEWHEEL.EXE", "COPYCURS.EXE"}


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
            and path.name.upper() not in EXCLUDED_RUNTIME_NAMES
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
        raise ValueError(f"CoAB source directory does not exist: {source}")
    if output.exists():
        raise ValueError(f"output directory already exists: {output}")
    source_save = save_source.resolve() if save_source is not None else source / "SAVE"
    if save_source is not None and not source_save.is_dir():
        raise ValueError(f"CoAB save source directory does not exist: {source_save}")

    files = runtime_source_files(source)
    names = {path.name.upper() for path in files}
    missing = sorted(REQUIRED_ROUTE_FILES - names)
    if missing:
        raise ValueError(f"CoAB runtime source is missing: {', '.join(missing)}")

    expected_hashes = expected_hashes or {}
    for name, expected in expected_hashes.items():
        path = source / name
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f"CoAB source hash mismatch: {name}")

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
        "title": "Curse of the Azure Bonds isolated DOS runtime stage",
        "profile_id": "curse-of-the-azure-bonds",
        "source_root": str(source),
        "output_root": str(output),
        "launch": {"executable": "START.EXE", "argument": None, "save_directory": "C:\\SAVE\\"},
        "file_count": len(rows),
        "files": rows,
        "save_source": str(source_save),
        "save_files": save_files,
        "save_bundle_present": bool(save_files),
        "route_ready": False,
        "route_validation": None,
        "status": "base_stage_no_save" if not save_files else "save_stage_pending_route_validation",
        "claim_boundary": (
            "This is an isolated byte-identical DOS runtime copy. Route readiness requires a "
            "separate validated save and original-DOS archive/member/cursor proof."
        ),
    }
    (output / "coab-stage-manifest.json").write_text(
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
