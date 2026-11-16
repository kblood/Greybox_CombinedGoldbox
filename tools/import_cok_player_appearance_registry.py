#!/usr/bin/env python3
"""Derive evidence-backed CoK DOS player appearance sets from the pinned manifest.

This importer adds relationships between existing CHEAD/CBODY source assets. It does not
create source identities, infer other combinations, or alter Restyle review/runtime status.
It is read-only unless --write is passed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_DEFAULT = Path("apps/web/src/ui/cokPlayerAppearanceManifest.json")
REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
EXPECTED_TUPLES = {
    (5, 24, 0, 2), (5, 24, 2, 2), (5, 1, 1, 2),
    (5, 23, 4, 2), (5, 23, 5, 2), (3, 11, 3, 1),
}
REVIEWED_APPEARANCES = {
    "cok-player-05-18-00-02": ((5, 24, 0, 2), (5, 24, 2, 2)),
    "cok-player-05-01-01-02": ((5, 1, 1, 2),),
    "cok-player-05-17-04-02": ((5, 23, 4, 2), (5, 23, 5, 2)),
    "cok-player-03-0b-03-01": ((3, 11, 3, 1),),
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    """Reviewed-input pin: CRLF is normalised to LF so CRLF and LF checkouts agree."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def source_id(family: str, block_id: int) -> str:
    return f"cok/dos-ega/install/{family.lower()}.dax/block/{block_id}/frame/0"


def validate_reviewed_mapping(manifest: dict[str, Any]) -> None:
    appearances = manifest.get("appearances", [])
    ids = [row.get("appearanceId") for row in appearances]
    if len(ids) != len(REVIEWED_APPEARANCES) or set(ids) != set(REVIEWED_APPEARANCES):
        raise ValueError("six explicitly approved player appearance IDs differ from reviewed mapping")
    keys = ("cHeadRequest", "cBodyBlock", "cBodySlot", "suffixCode")
    for appearance in appearances:
        expected = REVIEWED_APPEARANCES[appearance["appearanceId"]]
        rows = appearance.get("sourceTuples", [])
        actual = tuple(tuple(row.get(key) for key in keys) for row in rows)
        if actual != expected or any(type(v) is not int for row in actual for v in row):
            raise ValueError("six explicitly approved player selector roster/order differs from reviewed mapping")
        for index, row in enumerate(rows):
            role = "primary" if index == 0 else "storage-slot-alias"
            if row.get("role", role) != role or ("aliasOf" in row and
                    (index == 0 or type(row["aliasOf"]) is not int or row["aliasOf"] != 0)):
                raise ValueError("six explicitly approved player selector role differs from reviewed mapping")
        head, body, _slot, suffix = expected[0]
        offset = 0x40 if suffix == 2 else 0
        heads = appearance.get("head", {}).get("blockIds", [])
        bodies = [row.get("blockId") for row in appearance.get("bodyFrames", [])]
        if heads != [head + offset, head + offset + 0x80] or \
                bodies != [body + offset, body + offset + 0x80] or \
                any(type(v) is not int for v in [*heads, *bodies]):
            raise ValueError("six explicitly approved player blocks differ from reviewed selector derivation")


def derive_appearance_sets(manifest: dict[str, Any], registry: dict[str, Any], manifest_path: Path, *,
                           source_root: Path | None = None) -> list[dict[str, Any]]:
    hash_path = manifest_path if source_root is None else source_root / manifest_path
    validate_reviewed_mapping(manifest)
    assets = {row["id"]: row for row in registry.get("assets", [])}
    restyles = registry.get("restyles", [])
    containers = manifest.get("sourceContainers", {})
    expected_containers = {"CHEAD.DAX", "CBODY.DAX"}
    if set(containers) != expected_containers:
        raise ValueError("six explicitly approved player appearance manifest must pin exactly CHEAD.DAX and CBODY.DAX")
    for family in ("CHEAD", "CBODY"):
        family_sources = [row for row in assets.values()
                          if row.get("platform") == "DOS-EGA" and row.get("archive", {}).get("name", "").upper() == f"{family}.DAX"]
        if not family_sources or {row["archive"].get("sha256", "").upper() for row in family_sources} != {containers[f"{family}.DAX"].upper()}:
            raise ValueError(f"{family}.DAX manifest archive pin does not match registry")

    tuples_seen: set[tuple[int, int, int, int]] = set()
    sets: list[dict[str, Any]] = []
    for appearance in manifest.get("appearances", []):
        appearance_id = appearance.get("appearanceId")
        if not isinstance(appearance_id, str) or not appearance_id.startswith("cok-player-"):
            raise ValueError(f"invalid player appearance ID: {appearance_id!r}")
        raw_tuples = appearance.get("sourceTuples")
        if not isinstance(raw_tuples, list) or not raw_tuples:
            raise ValueError(f"{appearance_id}: missing source tuples")
        tuples = []
        for index, row in enumerate(raw_tuples):
            values = tuple(row.get(key) for key in ("cHeadRequest", "cBodyBlock", "cBodySlot", "suffixCode"))
            if any(not isinstance(value, int) or isinstance(value, bool) for value in values):
                raise ValueError(f"{appearance_id}: selector tuple must contain integer fields")
            if values in tuples_seen:
                raise ValueError(f"{appearance_id}: source tuple is already assigned to another appearance")
            tuples_seen.add(values)
            tuples.append({"cHeadRequest": values[0], "cBodyBlock": values[1], "cBodySlot": values[2],
                           "suffixCode": values[3], "role": "primary" if index == 0 else "storage-slot-alias",
                           **({"aliasOf": 0} if index > 0 else {})})

        head = appearance.get("head", {})
        bodies = appearance.get("bodyFrames", [])
        head_blocks = head.get("blockIds", [])
        if len(head_blocks) != 2 or len(bodies) != 2:
            raise ValueError(f"{appearance_id}: exactly two stored head/body variants are required")
        variants = []
        components = [("head", head, head_blocks), ("body", None, [body.get("blockId") for body in bodies])]
        for variant_index in range(2):
            component_rows = []
            for role, component_base, block_ids in components:
                block_id = block_ids[variant_index]
                component = component_base if role == "head" else bodies[variant_index]
                asset_id = source_id("CHEAD" if role == "head" else "CBODY", block_id)
                asset = assets.get(asset_id)
                if asset is None:
                    raise ValueError(f"{appearance_id}: source component is missing from registry: {asset_id}")
                expected_hash = component.get("sourceSha256")
                if asset.get("decoded", {}).get("sha256", "").upper() != expected_hash.upper():
                    raise ValueError(f"{appearance_id}: {asset_id} decoded PNG hash disagrees with manifest")
                if asset.get("archive", {}).get("sha256", "").upper() != containers[f"{'CHEAD' if role == 'head' else 'CBODY'}.DAX"].upper():
                    raise ValueError(f"{appearance_id}: {asset_id} archive hash disagrees with manifest")
                output_hash = component.get("restyleSha256", "").lower()
                matches = sorted(row["id"] for row in restyles if asset_id in row.get("sourceAssetIds", [])
                                 and any(output.get("sha256", "").lower() == output_hash for output in row.get("outputs", [])))
                if not matches:
                    raise ValueError(f"{appearance_id}: no source-linked Restyle candidate matches {asset_id} output hash")
                component_rows.append({"role": role, "assetId": asset_id, "restyleIds": matches})
            variants.append({"index": variant_index, "components": component_rows})

        sets.append({
            "id": f"cok/dos-ega/appearance/{appearance_id.removeprefix('cok-player-')}",
            "manifestId": appearance_id,
            "game": "cok",
            "platform": "DOS-EGA",
            "sourceManifest": {"path": manifest_path.as_posix(), "sha256": sha256_file(hash_path)},
            "acceptedTuples": tuples,
            "variants": variants,
            "evidence": [
                {"kind": "existing-manifest", "reference": f"{manifest_path.as_posix()}#{appearance_id}",
                 "note": "Exact source tuple, archive pins, component image hashes, and two stored variants are read from this manifest."},
                {"kind": "source-code", "reference": "docs/engine/research/cok-player-icon-source-contract-2026-10-26.md#dual-variant-caller-and-amiga-actor-writer-addendum--2026-10-27",
                 "note": "The source contract distinguishes the body-block/slot tuple from stored variant index; variant 0/1 is not established as a time animation."},
            ],
            "unresolvedCoverage": "Only these four manifest-approved appearances and six exact source tuples are represented. Other selector combinations and character identities remain unresolved; variant order does not establish temporal playback.",
        })
    if len(sets) != 4 or tuples_seen != EXPECTED_TUPLES:
        raise ValueError(f"expected four appearance sets and the six explicitly approved source tuples; got {len(sets)} sets and tuples={sorted(tuples_seen)}")
    return sets


def merge_registry(registry: dict[str, Any], appearance_sets: list[dict[str, Any]]) -> dict[str, Any]:
    result = json.loads(json.dumps(registry))
    result["appearanceSets"] = appearance_sets
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_DEFAULT)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write the merged registry; default is a read-only count report")
    args = parser.parse_args()
    manifest, registry = load_json(args.manifest), load_json(args.registry)
    sets = derive_appearance_sets(manifest, registry, args.manifest)
    merged = merge_registry(registry, sets)
    from graphics_asset_registry import validate
    errors, _warnings = validate(merged)
    if errors:
        raise ValueError("appearance registry validation failed: " + "; ".join(errors[:12]))
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"appearanceSets": len(sets), "acceptedTuples": sum(len(row["acceptedTuples"]) for row in sets),
                      "componentVariants": sum(len(row["variants"]) for row in sets), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
