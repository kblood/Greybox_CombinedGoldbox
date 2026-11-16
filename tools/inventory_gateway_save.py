#!/usr/bin/env python3
"""Inventory Gateway GOG save roots without mutating the installation."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


DEFAULT_INSTALL = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier")
CONTAINER_RE = re.compile(r"^SAVGAM[A-Z]?(?:\..+)?$", re.IGNORECASE)
CHARACTER_RE = re.compile(r"^(?:CHRDATA|CHRDAT)\d+(?:\..+)?$", re.IGNORECASE)
# Gateway's character-creation flow writes a compact letter-slot pair (for
# example A.GUY + A.FX), not the SAVGAM/CHRDATA naming used by DoK/Treasures.
# It is native character persistence, but it is not by itself a playable-party
# save or evidence for the ECL5#19 route.
GATEWAY_CHARACTER_RE = re.compile(r"^[A-J]\.(?:GUY|FX)$", re.IGNORECASE)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def classify(name: str) -> str:
    if CONTAINER_RE.fullmatch(name):
        return "save_container"
    if CHARACTER_RE.fullmatch(name):
        return "character_sidecar"
    if GATEWAY_CHARACTER_RE.fullmatch(name):
        return "character_sidecar"
    return "other_sidecar"


def inventory(install: Path, extra_roots: list[Path] | None = None) -> dict[str, Any]:
    install = install.resolve()
    roots = [install / "cloud_saves" / "SAVE", install / "SAVE"]
    roots.extend(path.resolve() for path in extra_roots or [])
    unique_roots = list(dict.fromkeys(roots))

    rows: list[dict[str, Any]] = []
    for root in unique_roots:
        if not root.is_dir():
            continue
        for path in sorted(item for item in root.rglob("*") if item.is_file()):
            rows.append(
                {
                    "root": str(root),
                    "relative_path": path.relative_to(root).as_posix(),
                    "size": path.stat().st_size,
                    "sha256": sha256(path),
                    "kind": classify(path.name),
                }
            )

    config_rows = []
    for name in ("dosbox_gateway_single.conf", "GAME.CFG"):
        path = install / name
        if path.is_file():
            config_rows.append(
                {"path": str(path), "size": path.stat().st_size, "sha256": sha256(path)}
            )
    containers = [row for row in rows if row["kind"] == "save_container"]
    character_sidecars = [row for row in rows if row["kind"] == "character_sidecar"]
    return {
        "schema_version": 1,
        "title": "Gateway GOG save inventory",
        "install_root": str(install),
        "candidate_roots": [str(path) for path in unique_roots],
        "gog_mount_contract": {
            "base": 'mount c ".."',
            "overlay": 'mount C "..\\cloud_saves" -t overlay',
            "game_save_path": "C:\\SAVE\\",
            "expected_host_root": str(install / "cloud_saves" / "SAVE"),
        },
        "config_files": config_rows,
        "files": rows,
        "save_container_count": len(containers),
        "save_bundle_present": bool(containers),
        "character_sidecar_count": len(character_sidecars),
        "native_character_bundle_present": bool(character_sidecars),
        "route_ready": False,
        "claim_boundary": (
            "A detected SAVGAM container is eligible for copy-only staging. Gateway's A.GUY/A.FX "
            "pair proves only native character persistence; route readiness still requires "
            "an original-DOS load, title-local cursor, and ECL5#19 route proof."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", type=Path, default=DEFAULT_INSTALL)
    parser.add_argument("--root", action="append", type=Path, default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = inventory(args.install, args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
