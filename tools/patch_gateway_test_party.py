#!/usr/bin/env python3
"""Create a deterministic high-power Gateway party in an isolated runtime save slot.

This is a test-fixture mutator, not a save editor for a user's installation. It patches only
Gateway's seven 422-byte per-character ``CHRDAT{slot}#.SAV`` sidecars, copies every original into a
new backup directory first, and emits a hash manifest. Party-level ``SAVGAM?.DAT`` and all retail
ECL/GEO/MON bytes remain untouched, so native encounter reachability, roster, script outcome, and
resume behavior still execute in the original DOS engine; only the deliberately overpowered party
makes a bounded victory capture reliable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path


RECORD_SIZE = 422
OFFSETS = {
    # The native Gateway player sheet from the isolated slot-J run showed these source slots as
    # DAMAGE 8D20+104 and effective AC -12 after load. They are also the title-local fields its
    # descriptor-29 monster loader copies into the canonical runtime combat tail.
    "source_attack1_dice": 0x11E,
    "source_attack2_dice": 0x11F,
    "source_attack1_sides": 0x120,
    "source_attack2_sides": 0x121,
    "source_attack1_bonus": 0x122,
    "source_attack2_bonus": 0x123,
    "source_armor_class_store": 0x124, # base AC = 60 - stored byte
    # Player CHRDAT is already a 422-byte runtime-shaped record. These two fields produced the
    # bounded control-party HP used by the first native run and avoid relying on monster-source
    # offsets (0x73/0xE4), whose player meanings differ.
    "runtime_thac0_store": 0x199,      # decoded THAC0 = 60 - stored byte
    "runtime_current_hp": 0x1A4,
}
PATCH_VALUES = {
    "source_attack1_dice": 8,
    "source_attack2_dice": 8,
    "source_attack1_sides": 20,
    "source_attack2_sides": 20,
    "source_attack1_bonus": 100,
    "source_attack2_bonus": 100,
    "source_armor_class_store": 70, # base AC -10 before Dex
    "runtime_thac0_store": 60,      # THAC0 0
    "runtime_current_hp": 250,
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sidecar_stem(slot: str, member: int) -> str:
    slot = slot.upper()
    if slot not in "ABCDEFGHIJ":
        raise ValueError(f"slot must be A..J, got {slot!r}")
    return f"CHRDATA{member}" if slot == "A" else f"CHRDAT{slot}{member}"


def character_name(raw: bytes) -> str:
    length = min(raw[0], 15)
    return raw[1 : 1 + length].split(b"\0", 1)[0].decode("ascii", errors="replace")


def patched_record(raw: bytes) -> bytes:
    if len(raw) != RECORD_SIZE:
        raise ValueError(f"expected {RECORD_SIZE}-byte Gateway character, got {len(raw)}")
    if not character_name(raw).strip():
        raise ValueError("Gateway character record has no sane name")
    out = bytearray(raw)
    for field, value in PATCH_VALUES.items():
        out[OFFSETS[field]] = value
    return bytes(out)


def patch_slot(save_dir: Path, slot: str, backup_dir: Path) -> dict[str, object]:
    save_dir = save_dir.resolve()
    backup_dir = backup_dir.resolve()
    if not save_dir.is_dir():
        raise FileNotFoundError(f"save directory does not exist: {save_dir}")
    if backup_dir.exists():
        raise FileExistsError(f"backup directory already exists: {backup_dir}")

    inputs = [save_dir / f"{sidecar_stem(slot, member)}.SAV" for member in range(1, 8)]
    missing = [path.name for path in inputs if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"missing Gateway character sidecars: {', '.join(missing)}")

    originals = [(path, path.read_bytes()) for path in inputs]
    patched = [(path, patched_record(raw)) for path, raw in originals]
    backup_dir.mkdir(parents=True)

    rows: list[dict[str, object]] = []
    for (path, before), (_, after) in zip(originals, patched, strict=True):
        backup = backup_dir / path.name
        shutil.copy2(path, backup)
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_bytes(after)
        os.replace(temp, path)
        rows.append(
            {
                "file": path.name,
                "name": character_name(before),
                "size": len(before),
                "before_sha256": sha256(before),
                "after_sha256": sha256(after),
                "backup": backup.name,
                "before": {field: before[offset] for field, offset in OFFSETS.items()},
                "after": {field: after[offset] for field, offset in OFFSETS.items()},
            }
        )

    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Gateway isolated deterministic-victory test party",
        "slot": slot.upper(),
        "record_size": RECORD_SIZE,
        "offsets": OFFSETS,
        "patch_values": PATCH_VALUES,
        "characters": rows,
        "claim_boundary": (
            "Only isolated CHRDAT sidecars are changed. SAVGAM, ECL, GEO, MON, GAME.EXE and "
            "GAME.OVR remain untouched; use an unmodified control capture for native difficulty."
        ),
    }
    manifest_path = backup_dir / "gateway-test-party-patch.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save-dir", type=Path, required=True)
    parser.add_argument("--slot", choices=list("ABCDEFGHIJ"), required=True)
    parser.add_argument("--backup-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest = patch_slot(args.save_dir, args.slot, args.backup_dir)
    print(f"[gateway-test-party] slot={manifest['slot']} characters={len(manifest['characters'])} backup={args.backup_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
