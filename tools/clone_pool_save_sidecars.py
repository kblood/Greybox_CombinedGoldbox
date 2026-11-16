#!/usr/bin/env python3
"""Clone Pool of Radiance per-character save sidecars between save slots."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


SAVE_RE = re.compile(r"^SAVGAM([A-J])\.DAT$", re.IGNORECASE)
SIDECAR_RE = re.compile(r"^CHRDAT([A-J])(\d+)\.(SAV|ITM|SPC)$", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def slot_from_save(path: Path) -> str:
    match = SAVE_RE.fullmatch(path.name)
    if not match:
        raise ValueError(f"unsupported Pool save filename: {path.name}")
    return match.group(1).upper()


def embedded_sidecar_slot(data: bytes) -> str:
    slots = {
        match.group(1).decode("ascii").upper()
        for match in re.finditer(rb"CHRDAT([A-J])[1-6]", data, re.IGNORECASE)
    }
    if len(slots) != 1:
        raise ValueError(f"expected one embedded CHRDAT slot, found {sorted(slots)}")
    return slots.pop()


def clone_sidecars(source_save: Path, target_save: Path) -> dict[str, object]:
    source_save = source_save.resolve()
    target_save = target_save.resolve()
    if not source_save.is_file() or not target_save.is_file():
        raise FileNotFoundError("source and target save files must already exist")
    source_slot = slot_from_save(source_save)
    target_filename_slot = slot_from_save(target_save)
    if source_slot == target_filename_slot and source_save.parent == target_save.parent:
        raise ValueError("source and target slots must differ")
    target_reference_slot = embedded_sidecar_slot(target_save.read_bytes())
    if target_reference_slot != source_slot:
        raise ValueError(
            f"target DAT references CHRDAT{target_reference_slot}, not source slot {source_slot}"
        )

    source_files: list[tuple[Path, re.Match[str]]] = []
    for path in source_save.parent.iterdir():
        match = SIDECAR_RE.fullmatch(path.name)
        if match and match.group(1).upper() == source_slot:
            source_files.append((path, match))
    source_files.sort(key=lambda item: (int(item[1].group(2)), item[1].group(3).upper()))
    if not source_files:
        raise FileNotFoundError(f"no CHRDAT{source_slot} sidecars found beside {source_save.name}")

    outputs: list[dict[str, object]] = []
    planned: list[tuple[Path, Path, bytes]] = []
    for source, match in source_files:
        target_name = source.name.upper()
        target = target_save.parent / target_name
        if target.exists():
            raise FileExistsError(f"target sidecar already exists: {target}")
        data = source.read_bytes()
        planned.append((source, target, data))

    for source, target, data in planned:
        target.write_bytes(data)
        outputs.append(
            {
                "source": source.name,
                "target": target.name,
                "size": len(data),
                "sha256": sha256(data),
            }
        )

    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Pool of Radiance",
        "source_save": source_save.name,
        "source_save_sha256": sha256(source_save.read_bytes()),
        "target_save": target_save.name,
        "target_save_sha256": sha256(target_save.read_bytes()),
        "embedded_sidecar_slot": target_reference_slot,
        "sidecars": outputs,
        "claim_boundary": (
            "copies character/item/spell sidecars under names embedded in target DAT; "
            "does not patch save data"
        ),
    }
    manifest_path = target_save.with_suffix(target_save.suffix + ".sidecars.json")
    if manifest_path.exists():
        raise FileExistsError(f"manifest already exists: {manifest_path}")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-save", type=Path, required=True)
    parser.add_argument("--target-save", type=Path, required=True)
    args = parser.parse_args()
    manifest = clone_sidecars(args.source_save, args.target_save)
    print(f"[pool-sidecars] copied={len(manifest['sidecars'])} target={manifest['target_save']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
