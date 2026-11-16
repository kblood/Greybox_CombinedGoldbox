#!/usr/bin/env python3
"""Apply a hash-pinned visual-description review dataset to existing registry source IDs."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_DEFAULT = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
DATASET_DEFAULT = ROOT / "docs/engine/research/cok-small-picture-visual-descriptions-v1.json"
PACKAGE_DEFAULT = ROOT / "apps/web/dist-app-cok57/restyle/cok-generated"
EVIDENCE_PREFIX = "apps/web/dist-app-cok57/restyle/cok-generated/images/"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def apply_dataset(registry: dict[str, Any], dataset: dict[str, Any], dataset_path: Path,
                  package_root: Path, repo_root: Path = ROOT) -> tuple[dict[str, Any], dict[str, int]]:
    if dataset.get("version") != 1 or not isinstance(dataset.get("assets"), list):
        raise ValueError("visual-description dataset must be version 1 with an assets array")
    asset_map = {asset["id"]: asset for asset in registry.get("assets", []) if isinstance(asset, dict) and isinstance(asset.get("id"), str)}
    rows_by_id: dict[str, dict[str, Any]] = {}
    for row in dataset["assets"]:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in rows_by_id:
            raise ValueError(f"invalid or duplicate dataset asset ID: {asset_id!r}")
        if asset_id not in asset_map:
            raise ValueError(f"dataset references unknown source ID {asset_id!r}")
        rows_by_id[asset_id] = row

    unresolved = dataset.get("unresolvedAssets", [])
    if not isinstance(unresolved, list):
        raise ValueError("unresolvedAssets must be an array when present")
    unresolved_ids: set[str] = set()
    for row in unresolved:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in unresolved_ids or asset_id in rows_by_id:
            raise ValueError(f"invalid, duplicate, or resolved unresolved ID: {asset_id!r}")
        asset = asset_map.get(asset_id)
        if asset is None:
            raise ValueError(f"unresolved list references unknown source ID {asset_id!r}")
        if asset.get("decoded") is not None:
            raise ValueError(f"{asset_id}: unresolved source has decoded evidence and needs review")
        unresolved_ids.add(asset_id)

    merged = json.loads(json.dumps(registry))
    merged_assets = {asset["id"]: asset for asset in merged["assets"]}
    wording_by_pixels: dict[tuple[int, int, str], str] = {}
    image_hashes: set[str] = set()
    for asset_id, row in rows_by_id.items():
        asset = merged_assets[asset_id]
        decoded = asset.get("decoded")
        if not isinstance(decoded, dict):
            raise ValueError(f"{asset_id}: source has no decoded image evidence")
        source_hash, pixel_hash = row.get("sourceSha256"), row.get("pixelSha256")
        description = row.get("visualDescription")
        if (source_hash != decoded.get("sha256") or pixel_hash != decoded.get("pixelSha256")
                or not isinstance(description, str) or not description.strip()):
            raise ValueError(f"{asset_id}: dataset file/pixel hash or visualDescription mismatch")
        width, height = decoded.get("width"), decoded.get("height")
        if not isinstance(width, int) or width <= 0 or not isinstance(height, int) or height <= 0:
            raise ValueError(f"{asset_id}: decoded dimensions must be positive integers")
        appearance_key = width, height, pixel_hash
        prior_wording = wording_by_pixels.setdefault(appearance_key, description)
        if prior_wording != description:
            raise ValueError(f"{asset_id}: duplicate pixels in dataset have conflicting descriptions")
        for other in merged["assets"]:
            if other.get("id") == asset_id:
                continue
            other_decoded = other.get("decoded") or {}
            other_description = (other.get("description") or {}).get("visualDescription")
            if (other_decoded.get("width") == width and other_decoded.get("height") == height
                    and other_decoded.get("pixelSha256") == pixel_hash and other_description
                    and other_description != description):
                raise ValueError(f"{asset_id}: wording conflicts with pixel-identical source {other['id']}")

        evidence = row.get("evidence")
        if not isinstance(evidence, list) or len(evidence) != 1 or not isinstance(evidence[0], dict):
            raise ValueError(f"{asset_id}: expected exactly one visual-review evidence item")
        review = evidence[0]
        expected_reference = f"{EVIDENCE_PREFIX}{source_hash}.png"
        reference = review.get("reference")
        if (review.get("kind") != "visual-review"
                or not isinstance(review.get("note"), str)
                or "visible appearance only" not in review["note"].lower()
                or "does not infer" not in review["note"].lower()):
            raise ValueError(f"{asset_id}: evidence must identify the exact preview and limit claims")
        if reference == expected_reference:
            package_root_resolved = package_root.resolve(strict=True)
            image_path = (repo_root / expected_reference).resolve(strict=True)
            packaged_path = (package_root_resolved / "images" / f"{source_hash}.png").resolve(strict=True)
            if (not image_path.is_relative_to(package_root_resolved)
                    or image_path != packaged_path):
                raise ValueError(f"{asset_id}: evidence reference does not resolve inside the supplied image package")
        elif isinstance(reference, str) and reference.startswith("C:/GoldBoxImg/"):
            source_root = Path("C:/GoldBoxImg").resolve(strict=True)
            image_path = Path(reference).resolve()
            if not image_path.is_relative_to(source_root):
                raise ValueError(f"{asset_id}: source evidence path escapes the approved GoldBoxImg root")
        else:
            raise ValueError(f"{asset_id}: evidence reference must use the exact packaged PNG or an approved local source PNG")
        png_bytes = image_path.read_bytes()
        if sha256(png_bytes) != source_hash:
            raise ValueError(f"{asset_id}: exact preview PNG is missing or has a different file hash")
        with Image.open(image_path) as image:
            image = image.convert("RGB")
            if image.width < width or image.height < height or image.width % width or image.height % height:
                raise ValueError(f"{asset_id}: preview dimensions are not an integer scale of decoded dimensions")
            if image.width // width != image.height // height:
                raise ValueError(f"{asset_id}: preview scales differ across width and height")
            native = image.resize((width, height), Image.Resampling.NEAREST)
            if sha256(native.tobytes()) != pixel_hash:
                raise ValueError(f"{asset_id}: preview RGB does not match decoded pixel SHA-256")
        image_hashes.add(source_hash)

        description_obj = asset.setdefault("description", {})
        prior = description_obj.get("visualDescription")
        if prior and prior != description:
            raise ValueError(f"{asset_id}: existing description conflicts with dataset wording")
        description_obj["visualDescription"] = description
        evidence_list = description_obj.setdefault("evidence", [])
        if not isinstance(evidence_list, list):
            raise ValueError(f"{asset_id}: registry description evidence must be an array")
        owned = [item for item in evidence_list
                 if isinstance(item, dict) and item.get("kind") == "visual-review"
                 and item.get("reference") == f"{dataset_path.as_posix()}#{asset_id}"]
        imported_evidence = {
            "kind": "visual-review",
            "reference": f"{dataset_path.as_posix()}#{asset_id}",
            "note": f"Visible appearance reviewed against exact source PNG SHA-256 {source_hash} and decoded pixel SHA-256 {pixel_hash}; dataset SHA-256 {sha256(dataset_path.read_bytes())}. Subject identity, game use, selector, and playback semantics are unproven.",
        }
        if owned:
            first = evidence_list.index(owned[0])
            evidence_list[first] = imported_evidence
            evidence_list[:] = [item for item in evidence_list if item not in owned[1:]]
        else:
            evidence_list.append(imported_evidence)
    return merged, {"rows": len(rows_by_id), "uniquePixelGroups": len(wording_by_pixels),
                    "unresolvedRows": len(unresolved_ids), "verifiedPreviewFiles": len(image_hashes)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--dataset", type=Path, default=DATASET_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    dataset = read_json(args.dataset)
    merged, counts = apply_dataset(registry, dataset, args.dataset, args.package_root)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**counts, "registryAssets": len(merged["assets"]),
                      "registryVisualDescriptions": sum(bool((asset.get("description") or {}).get("visualDescription"))
                                                         for asset in merged["assets"]),
                      "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
