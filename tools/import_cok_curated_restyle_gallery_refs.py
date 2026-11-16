#!/usr/bin/env python3
"""Join the curated CoK before/after gallery to source IDs by exact PNG SHA-256.

The curated row ID remains a gallery reference, not a canonical graphics ID. The
importer is read-only by default; --write adds only unambiguous hash joins to the
source registry. Duplicate source pixels intentionally receive the same gallery
reference on every distinct source locator.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_DEFAULT = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
MANIFEST_DEFAULT = ROOT / "docs/engine/data/cok-curated-restyle-manifest-v1.json"
MANIFEST_SHA256 = "1cb3e1eca86d42dc53bfbfaebe8949d9e89bca1b3fd48bca4ecb43fe95cb1ee2"
MANIFEST_REFERENCE = "apps/web/dist-app-cok57/restyle/manifest.json"
SYSTEM = "cok-curated-restyle-v1"
SAFE_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def manifest_reference(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return path.name


def build_expected(
    registry: dict[str, Any],
    manifest: dict[str, Any],
    manifest_sha256: str,
    gallery_root: Path,
    manifest_ref: str,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, int]]:
    if not isinstance(manifest.get("items"), list):
        raise ValueError("curated manifest must have an items array")
    rows = [item for item in manifest["items"] if isinstance(item, dict) and item.get("game") == "cok"]
    ids: set[str] = set()
    by_source_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for asset in registry.get("assets", []):
        decoded = asset.get("decoded")
        source_hash = decoded.get("sha256") if isinstance(decoded, dict) else None
        if isinstance(source_hash, str):
            by_source_hash[source_hash].append(asset)

    expected: dict[str, list[dict[str, Any]]] = defaultdict(list)
    counts = {"unique": 0, "ambiguous": 0, "unmatched": 0, "links": 0, "rows": len(rows)}
    for item in rows:
        item_id = item.get("id")
        stem = item.get("stem")
        if not isinstance(item_id, str) or not SAFE_NAME.fullmatch(item_id) or item_id in ids:
            raise ValueError(f"invalid or duplicate CoK curated gallery ID: {item_id!r}")
        ids.add(item_id)
        if not isinstance(stem, str) or not SAFE_NAME.fullmatch(stem):
            raise ValueError(f"{item_id}: invalid curated gallery stem")

        source_path = gallery_root / "orig" / f"{stem}.png"
        output_path = gallery_root / "out" / f"{stem}.png"
        if not source_path.is_file() or not output_path.is_file():
            raise ValueError(f"{item_id}: packaged original/output PNG pair is incomplete")
        source_hash = sha256(source_path.read_bytes())
        output_hash = sha256(output_path.read_bytes())
        matches = by_source_hash.get(source_hash, [])
        if not matches:
            counts["unmatched"] += 1
            continue
        counts["unique" if len(matches) == 1 else "ambiguous"] += 1
        description = item.get("description")
        if description is not None and not isinstance(description, str):
            raise ValueError(f"{item_id}: curated description must be a string or null")
        label = item.get("label")
        if not isinstance(label, str) or not label.strip():
            label = item_id
        reference = {
            "system": SYSTEM,
            "id": item_id,
            "manifest": manifest_ref,
            "manifestSha256": manifest_sha256,
            "sourceSha256": source_hash,
            "outputSha256": output_hash,
            "label": label,
            "description": description,
            "promptFile": item.get("prompt") if isinstance(item.get("prompt"), str) else None,
            "inputFile": item.get("input") if isinstance(item.get("input"), str) else None,
        }
        for asset in matches:
            expected[asset["id"]].append(reference)
            counts["links"] += 1
    for references in expected.values():
        references.sort(key=lambda ref: ref["id"])
    return expected, counts


def reconcile(
    registry: dict[str, Any],
    expected: dict[str, list[dict[str, Any]]],
) -> tuple[dict[str, Any], dict[str, int]]:
    updated = json.loads(json.dumps(registry))
    counts = {"added": 0, "unchanged": 0}
    errors: list[str] = []
    expected_ids = set(expected)
    seen_expected = set()
    for asset in updated.get("assets", []):
        asset_id = asset.get("id")
        wanted = expected.get(asset_id, [])
        seen_expected.add(asset_id)
        current = asset.get("galleryReferences", [])
        if not isinstance(current, list):
            errors.append(f"{asset_id}: galleryReferences is not an array")
            continue
        existing_ours = [ref for ref in current if isinstance(ref, dict) and ref.get("system") == SYSTEM]
        other_refs = [ref for ref in current if not (isinstance(ref, dict) and ref.get("system") == SYSTEM)]
        if existing_ours == wanted:
            counts["unchanged"] += len(wanted)
            continue
        if existing_ours:
            errors.append(f"{asset_id}: existing curated gallery hashes/metadata differ; refusing silent rewrite")
            continue
        if wanted:
            asset["galleryReferences"] = other_refs + wanted
            counts["added"] += len(wanted)

    missing_assets = expected_ids - seen_expected
    for asset_id in sorted(missing_assets):
        errors.append(f"expected source asset is absent from registry: {asset_id}")

    # Existing links absent from the current exact-hash join are stale. This catches
    # source/output tampering and manifest drift rather than silently dropping them.
    for asset in updated.get("assets", []):
        for ref in asset.get("galleryReferences", []) if isinstance(asset.get("galleryReferences", []), list) else []:
            if isinstance(ref, dict) and ref.get("system") == SYSTEM:
                if ref.get("id") not in {item.get("id") for item in expected.get(asset.get("id"), [])}:
                    errors.append(f"{asset.get('id')}: stale curated gallery reference {ref.get('id')}")

    if errors:
        raise ValueError("; ".join(errors))
    return updated, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_DEFAULT)
    parser.add_argument("--gallery-root", type=Path, required=True,
                        help="external directory containing the manifest's orig/ and out/ PNG files")
    parser.add_argument("--manifest-reference", default=MANIFEST_REFERENCE,
                        help="stable provenance reference retained in canonical registry rows")
    parser.add_argument("--write", action="store_true", help="write new exact-hash references to the registry")
    args = parser.parse_args()

    manifest_bytes = args.manifest.read_bytes()
    actual_manifest_sha256 = sha256(manifest_bytes)
    if actual_manifest_sha256 != MANIFEST_SHA256:
        raise ValueError(f"Refusing curated manifest SHA-256 {actual_manifest_sha256}; expected {MANIFEST_SHA256}")
    manifest = json.loads(manifest_bytes)
    registry = read_json(args.registry)
    expected, join_counts = build_expected(
        registry,
        manifest,
        actual_manifest_sha256,
        args.gallery_root,
        args.manifest_reference,
    )
    updated, change_counts = reconcile(registry, expected)
    print(json.dumps({**join_counts, **change_counts}, sort_keys=True))
    if args.write and change_counts["added"]:
        args.registry.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[import_cok_curated_restyle_gallery_refs] {error}", file=sys.stderr)
        raise SystemExit(1)
