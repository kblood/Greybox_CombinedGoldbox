#!/usr/bin/env python3
"""Verify and merge all nine DOS CoK BIGPIC source frames into the identity registry.

This source-data importer is additive. It checks archive pins, DAX-decoded pixels, exact source
PNG hashes, and gallery pair hashes before writing the requested registry file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import dax_decode  # noqa: E402
import cok_ecl_picture_consumers as picture_consumers  # noqa: E402
import graphics_asset_registry  # noqa: E402


REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
DOS_DEFAULT = Path("Champions of Krynn")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/dos_render_all")
ARCHIVE_PINS = {
    "BIGPIC1": "34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec",
    "BIGPIC2": "553dc458be8209bea0ca5f1dea6406b5cd8a96750d3badc05658f5a8ef241f0a",
    "BIGPIC3": "2be3773e7f4ed0611c8e7d36ee1593160756ab2742c458d6adc7d14fd0900f25",
}
BLOCKS = {"BIGPIC1": [112, 114, 115, 121], "BIGPIC2": [116, 119], "BIGPIC3": [117, 118, 120]}
RUNTIME_ID = "cok_overland_bigpic1_121"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def package_file(root: Path, relative: str, context: str) -> Path:
    """Resolve a clean inventory-relative gallery file and reject resolved escapes."""
    if not isinstance(relative, str) or not relative.strip():
        raise ValueError(f"{context}: package path must be a nonempty relative file path")
    candidate = Path(relative)
    parts = relative.replace("\\", "/").split("/")
    if candidate.is_absolute() or candidate.drive or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"{context}: package path must be a clean relative file path: {relative!r}")
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: path escapes approved root: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def source_id(family: str, block: int) -> str:
    disk = int(family[-1])
    return f"cok/dos-ega/disk{disk}/{family.lower()}.dax/block/{block}/frame/0"


def inventory_bigpic_pairs(inventory: dict[str, Any]) -> dict[tuple[str, int], dict[str, Any]]:
    pairs: dict[tuple[str, int], dict[str, Any]] = {}
    pair_owners: dict[str, tuple[str, int]] = {}
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            family = alias.get("family")
            if alias.get("platform") != "DOS" or family not in BLOCKS:
                continue
            match = re.fullmatch(rf"{family}_(\d+)", str(alias.get("asset", "")), re.IGNORECASE)
            if not match or alias.get("frame") not in (None, 0, "0"):
                continue
            key = family, int(match.group(1))
            previous = pairs.get(key)
            if previous and previous["id"] != pair["id"]:
                raise ValueError(f"multiple gallery pairs claim {family}#{key[1]}")
            prior_owner = pair_owners.get(pair["id"])
            if prior_owner is not None and prior_owner != key:
                raise ValueError(f"gallery pair {pair['id']} aliases multiple BIGPIC source locators: {prior_owner}, {key}")
            pair_owners[pair["id"]] = key
            pairs[key] = pair
    return pairs


def decoded_records(dos_root: Path, source_root: Path, package_root: Path,
                    inventory: dict[str, Any], receipt: dict[str, Any] | None = None) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    receipt = receipt or picture_consumers.build_receipt(dos_root=dos_root, png=source_root / "BIGPIC1/BIGPIC1_114.png")
    pairs = inventory_bigpic_pairs(inventory)
    expected_pair_keys = {(family, block) for family, blocks in BLOCKS.items() for block in blocks if block != 121}
    if set(pairs) != expected_pair_keys:
        missing = sorted(expected_pair_keys - set(pairs))
        extra = sorted(set(pairs) - expected_pair_keys)
        raise ValueError(f"DOS BIGPIC gallery pair set differs (missing={missing}, extra={extra})")

    assets: dict[str, dict[str, Any]] = {}
    matched_pairs: dict[str, dict[str, Any]] = {}
    for family, block_ids in BLOCKS.items():
        archive_path = dos_root / f"{family}.DAX"
        archive_bytes = archive_path.read_bytes()
        archive_hash = sha256(archive_bytes)
        if archive_hash != ARCHIVE_PINS[family]:
            raise ValueError(f"{archive_path}: archive SHA-256 differs from the source pin")
        data_base, blocks = dax_decode.parse_container(archive_bytes)
        blocks_by_id = {block.block_id: block for block in blocks}
        if len(blocks) != len(block_ids) or len(blocks_by_id) != len(blocks) or set(blocks_by_id) != set(block_ids):
            raise ValueError(f"{archive_path}: TOC block IDs differ from the audited denominator")

        for block_id in block_ids:
            raw = dax_decode.decompress_block(archive_bytes, data_base, blocks_by_id[block_id])
            dimensions = dax_decode.parse_standard_frame(raw)
            if not dimensions:
                raise ValueError(f"{family}#{block_id}: not a standard single-frame image")
            width, height, x_offset, y_offset = dimensions
            decoded_rgb = bytes(dax_decode.frame_to_rgb(raw, width, height, header_len=dax_decode.FRAME_HEADER))
            png_path = source_root / family / f"{family}_{block_id}.png"
            png_bytes = png_path.read_bytes()
            source_hash = sha256(png_bytes)
            with Image.open(png_path) as source_image:
                source_image = source_image.convert("RGB")
                if source_image.size != (width * 4, height * 4):
                    raise ValueError(f"{png_path}: expected exact 4x source render")
                if source_image.resize((width, height), Image.Resampling.NEAREST).tobytes() != decoded_rgb:
                    raise ValueError(f"{family}#{block_id}: archive decode differs from source render pixels")

            asset_key = source_id(family, block_id)
            description = {
                "text": f"DOS {family} scene-art block {block_id}; depicted subject is not identified here.",
                "status": "unknown",
                "evidence": [{"kind": "decoded-pixels",
                              "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                              "note": f"Archive SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}],
            }
            consumer = {"status": "unknown",
                        "use": f"Exact selector, scene, and route for {family}#{block_id} are not established in the current registry.",
                        "evidence": [{"kind": "decoded-pixels",
                                      "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                      "note": "The DOS source bank and exact block frame are verified; this does not identify its caller."}]}
            if family == "BIGPIC1" and block_id == 112:
                description = {"text": "DOS BIGPIC1 block 112 is the cottage scene selected by the CoK ECL1#36 opening route.",
                               "status": "verified",
                               "evidence": [
                                   {"kind": "research-doc", "reference": "docs/engine/research/cok-ecl-picture-consumer-register-2026-10-27.md",
                                    "note": "ECL1#36 opening emits PICTURE 112 and the bounded opening supplies the cottage art."},
                                   {"kind": "decoded-pixels", "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                    "note": f"Archive SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}],
                               }
                consumer = {"status": "verified", "use": "CoK ECL1#36 opening cottage scene selects BIGPIC1#112.",
                            "evidence": [description["evidence"][0]]}
            elif family == "BIGPIC1" and block_id == 114:
                description = {"text": "DOS BIGPIC1 block 114 is the caravan presentation before a CoK combat encounter; the full route mapping and runtime admission are still partial.",
                               "status": "partial",
                               "evidence": [
                                   {"kind": "research-doc", "reference": "docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md",
                                    "note": "The source audit identifies the caravan presentation immediately before combat; exact route-specific Restyle admission remains open."},
                                   {"kind": "decoded-pixels", "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                    "note": f"Archive SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}],
                               }
                consumer = picture_consumers.consumer_114(receipt)
            elif family == "BIGPIC2" and block_id == 116:
                description = {
                    "text": "DOS BIGPIC2 block 116 depicts the same banquet scene as Amiga BIGPIC1#116, but its row-major RGB pixels are not identical; the archive-qualified source IDs remain separate.",
                    "status": "verified",
                    "evidence": [
                        {"kind": "decoded-pixels", "reference": "tools/import_cok_dos_bigpic_registry.py + Champions of Krynn/BIGPIC2.DAX#116",
                         "note": f"Pinned DAX SHA-256 {archive_hash}; decoded RGB pixel SHA-256 {sha256(decoded_rgb)} matches the exact 4× DOS source render."},
                        {"kind": "research-doc", "reference": "docs/engine/research/graphics-identity-and-restyle-browser-architecture-2026-10-31.md",
                         "note": "The Amiga/DOS relationship is classified as same-scene with color/pixel-rendering differences, not pixel-identical."},
                    ],
                }
            assets[asset_key] = {
                "id": asset_key,
                "game": "cok",
                "edition": f"DOS disk {family[-1]}",
                "platform": "DOS-EGA",
                "archive": {"name": f"{family}.DAX", "path": archive_path.as_posix(), "sha256": archive_hash},
                "locator": {"kind": "block-frame", "blockId": block_id, "frameIndex": 0,
                            "tileIndex": None, "cellIndex": None},
                "decoded": {"path": f"images/{source_hash}.png", "sha256": source_hash,
                            "pixelSha256": sha256(decoded_rgb), "width": width, "height": height},
                "identityStatus": "source-pinned",
                "description": description,
                "gameConsumers": [consumer],
                "animationGroupId": None,
            }

            pair = pairs.get((family, block_id))
            if pair:
                if pair["sourceSha256"] != source_hash:
                    raise ValueError(f"{family}#{block_id}: gallery source hash differs from DAX-verified PNG")
                for key in ("source", "output"):
                    file_path = package_file(package_root, pair[key], f"{pair['id']} packaged {key}")
                    if sha256(file_path.read_bytes()) != pair["sourceSha256" if key == "source" else "outputSha256"]:
                        raise ValueError(f"{pair['id']}: packaged {key} file hash differs from inventory")
                matched_pairs[asset_key] = pair

    return assets, matched_pairs


def gallery_restyle(pair: dict[str, Any], asset_key: str) -> dict[str, Any]:
    return {
        "id": f"restyle/cok-generated/{pair['id']}",
        "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair["id"],
                                "reference": f"restyle/cok-generated/manifest.json#{pair['id']}"}],
        "sourceAssetIds": [asset_key],
        "sourceRelation": "one-to-one",
        "prompt": {"status": "unknown", "batch": None, "path": None, "sha256": None, "textSha256": None,
                   "inputPath": f"images/{pair['sourceSha256']}.png", "inputSha256": pair["sourceSha256"],
                   "text": None, "references": [], "referenceAssetIds": []},
        "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
        "reviewStatus": "generated",
        "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair['id']}",
                      "note": f"Exact source/output SHA-256 pair {pair['sourceSha256']} → {pair['outputSha256']}; composition review and prompt are not established."}],
    }


def merge(registry: dict[str, Any], new_assets: dict[str, dict[str, Any]],
          pairs: dict[str, dict[str, Any]], inventory: dict[str, Any], receipt: dict[str, Any] | None = None) -> dict[str, Any]:
    if picture_consumers.ASSET_ID in new_assets:
        receipt = receipt or picture_consumers.build_receipt()
        picture_consumers.verify_receipt(receipt)
        picture_consumers.verify_asset_114(new_assets[picture_consumers.ASSET_ID])
    result = json.loads(json.dumps(registry))
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    for asset_key, asset in new_assets.items():
        prior = asset_map.get(asset_key)
        if prior:
            if asset_key == picture_consumers.ASSET_ID:
                # This slice cannot silently repair a conflicting enriched caravan source pin.
                picture_consumers.verify_asset_114(prior)
            if (prior.get("archive", {}).get("sha256") != asset["archive"]["sha256"]
                    or prior.get("locator") != asset["locator"]):
                raise ValueError(f"{asset_key}: existing archive pin or locator conflicts with verified DAX source")
            if prior.get("decoded", {}).get("sha256") != asset["decoded"]["sha256"]:
                prior["decoded"] = asset["decoded"]
                prior.setdefault("description", {}).setdefault("evidence", []).append({
                    "kind": "decoded-pixels",
                    "reference": f"tools/import_cok_dos_bigpic_registry.py + {asset['archive']['path']}#{asset['locator']['blockId']}/frame/0",
                    "note": "Corrected the prior decoded-PNG SHA-256 and logical RGB-pixel SHA-256 after verifying the pinned archive frame against the exact 4× source PNG.",
                })
            elif prior.get("decoded", {}).get("pixelSha256") != asset["decoded"]["pixelSha256"]:
                prior["decoded"]["pixelSha256"] = asset["decoded"]["pixelSha256"]
                prior.setdefault("description", {}).setdefault("evidence", []).append({
                    "kind": "decoded-pixels",
                    "reference": f"tools/import_cok_dos_bigpic_registry.py + {asset['archive']['path']}#{asset['locator']['blockId']}/frame/0",
                    "note": "Corrected the prior logical-pixel SHA-256 to the row-major RGB hash of the pinned DAX decode.",
                })
            if asset_key == "cok/dos-ega/disk2/bigpic2.dax/block/116/frame/0":
                # Keep visual descriptions and extra review metadata. Add only the pinned
                # semantic evidence from this importer; never replace a richer description.
                current = prior.setdefault("description", {})
                incoming = asset["description"]
                if current.get("status") == "unknown" or not current.get("text"):
                    current["text"] = incoming["text"]
                    current["status"] = incoming["status"]
                evidence = current.setdefault("evidence", [])
                if not isinstance(evidence, list):
                    raise ValueError(f"{asset_key}: description evidence must be an array")
                for row in incoming["evidence"]:
                    if row not in evidence:
                        evidence.append(row)
            # Preserve researched consumer and semantic description for existing records.
            continue
        asset_map[asset_key] = asset
    result["assets"] = list(asset_map.values())

    restyles = {entry["id"]: entry for entry in result["restyles"]}
    for asset_key, pair in pairs.items():
        record = gallery_restyle(pair, asset_key)
        prior = restyles.get(record["id"])
        if prior:
            if asset_key not in prior.get("sourceAssetIds", []) or not any(
                    output.get("role") == "gallery-copy" and output.get("sha256") == pair["outputSha256"] for output in prior.get("outputs", [])):
                raise ValueError(f"{record['id']}: existing Restyle ID conflicts with verified inventory pair")
            # Keep researched prompts/review/evidence and ancillary metadata intact.
        else:
            restyles[record["id"]] = record

    # Preserve the existing source-pinned Runtime comparison ID for DOS BIGPIC1#121.
    runtime = next((item for item in inventory.get("externalComparisons", []) if item.get("id") == RUNTIME_ID), None)
    if not runtime:
        raise ValueError(f"generated inventory is missing expected Runtime comparison {RUNTIME_ID}")
    runtime_asset_id = source_id("BIGPIC1", 121)
    if runtime.get("sourceSha256") != asset_map[runtime_asset_id]["decoded"]["sha256"]:
        raise ValueError("BIGPIC1#121 Runtime comparison source hash does not match the DAX-verified source")
    runtime_restyle = next((entry for entry in restyles.values()
                            if runtime.get("outputSha256") in {out.get("sha256") for out in entry.get("outputs", [])}
                            and runtime_asset_id in entry.get("sourceAssetIds", [])), None)
    if not runtime_restyle:
        raise ValueError("BIGPIC1#121 Runtime comparison has no matching Restyle lineage")
    reference = {"system": "cok-runtime-comparison-v1", "id": RUNTIME_ID,
                 "reference": "apps/web/src/ui/cokTravelRestyleManifest.json#BIGPIC1_121"}
    ext = runtime_restyle.setdefault("externalReferences", [])
    if reference not in ext:
        ext.append(reference)

    result["restyles"] = list(restyles.values())
    if picture_consumers.ASSET_ID in new_assets:
        result = picture_consumers.apply_consumer_114(result, receipt)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write verified additions to the registry")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    receipt = picture_consumers.build_receipt(dos_root=args.dos_root, png=args.source_root / "BIGPIC1/BIGPIC1_114.png")
    new_assets, pairs = decoded_records(args.dos_root, args.source_root, args.package_root, inventory, receipt)
    merged = merge(registry, new_assets, pairs, inventory, receipt)
    errors, _warnings = graphics_asset_registry.validate(merged)
    if errors:
        raise ValueError("Merged registry validation failed: " + "; ".join(errors))
    if args.write:
        picture_consumers.atomic_json(args.registry, merged, validate_registry=True)
    print(json.dumps({"verifiedBigpicAssets": len(new_assets), "galleryPairs": len(pairs),
                      "newSourceIds": sum(asset["id"] not in {entry["id"] for entry in registry["assets"]}
                                          for asset in new_assets.values()),
                      "newRestylePairs": sum(f"restyle/cok-generated/{pair['id']}" not in {entry["id"] for entry in registry["restyles"]}
                                              for pair in pairs.values()),
                      "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
                      "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
