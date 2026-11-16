#!/usr/bin/env python3
"""Verify the complete Amiga CoK 8X8D2 tile bank and link exact Restyle/DOS matches."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import daa_decode  # noqa: E402


REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-amiga-8x8d2-visual-descriptions-v1.json")
ARCHIVE_DEFAULT = Path("C:/GoldBoxImg/batch03_work/e2e-amiga-fixture-view/ChampionsOfKrynn/disk3/8X8D2.DAA")
SOURCE_ROOT_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
ARCHIVE_SHA256 = "8d988c94fbc4e0338f763cb1a8dc14fc0dd72564607a88091a89132330fe4c9d"
EXPECTED_TOC = [191, 192, 211, 212, 10, 11, 23, 13, 14, 151, 152, 171, 172]
TILES_PER_BLOCK = 70
SCALE = 8
ASSET_NAME = re.compile(r"^8X8D2_(\d+)_tile_(\d+)\.png$", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def source_id(block_id: int, tile_index: int) -> str:
    return f"cok/amiga/disk3/8x8d2.daa/block/{block_id}/tile/{tile_index}"


def _source_path(root: Path, relative: str, context: str) -> Path:
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: source path escapes approved root: {path}")
    return path


def _package_file(root: Path, relative: str, context: str) -> Path:
    """Resolve a clean inventory-relative package file and reject symlink escapes."""
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


def decode_archive(archive_path: Path, source_root: Path, package_root: Path) -> dict[str, dict[str, Any]]:
    archive_bytes = archive_path.read_bytes()
    archive_hash = sha256(archive_bytes)
    if archive_hash != ARCHIVE_SHA256:
        raise ValueError(f"{archive_path}: DAA SHA-256 differs from the pinned fixture copy")
    kind, data_base, blocks = daa_decode.parse_container(archive_bytes)
    toc = [block.block_id for block in blocks]
    if kind != "blocks" or toc != EXPECTED_TOC:
        raise ValueError(f"{archive_path}: DAA TOC differs from the complete 8X8D2 roster: {toc}")

    records: dict[str, dict[str, Any]] = {}
    for block in blocks:
        raw = daa_decode.decompress_block(archive_bytes, data_base, block)
        parsed = daa_decode.parse_8x8d_header(raw)
        if parsed is None:
            raise ValueError(f"8X8D2#{block.block_id}: block does not decode as an Amiga 8×8D tile strip")
        count, planes, row_bytes, plane_size = parsed
        if count != TILES_PER_BLOCK or planes != 4:
            raise ValueError(f"8X8D2#{block.block_id}: expected 70 four-plane tiles, got {count}/{planes}")
        for tile_index in range(count):
            rows = daa_decode.decode_8x8d_tile(raw, count, row_bytes, plane_size, tile_index)
            rgb = bytes(channel for row in rows for index in row for channel in daa_decode.EGA_PALETTE[index])
            relative = (Path("amiga_non_picture_source") / f"8X8D2_{block.block_id:03d}" /
                        f"8X8D2_{block.block_id:03d}_tile_{tile_index:02d}.png")
            png_path = _source_path(source_root, relative.as_posix(), f"8X8D2#{block.block_id}/tile/{tile_index}")
            with Image.open(png_path) as image:
                image = image.convert("RGB")
                if image.size != (64, 64):
                    raise ValueError(f"{png_path}: expected an exact 64×64 8× render")
                native = image.resize((8, 8), Image.Resampling.NEAREST).tobytes()
            if native != rgb:
                raise ValueError(f"{png_path}: exact rendered pixels differ from DAA decode")

            png_hash = sha256(png_path.read_bytes())
            packaged = _package_file(package_root, f"images/{png_hash}.png",
                                     f"8X8D2#{block.block_id}/tile/{tile_index} packaged image")
            if sha256(packaged.read_bytes()) != png_hash:
                raise ValueError(f"{png_path}: exact source PNG is absent from the generated gallery package")
            asset_id = source_id(block.block_id, tile_index)
            pixel_hash = sha256(rgb)
            records[asset_id] = {
                "id": asset_id,
                "game": "cok",
                "edition": "Amiga disk 3",
                "platform": "Amiga",
                "archive": {"name": "8X8D2.DAA", "path": archive_path.resolve().as_posix(), "sha256": archive_hash},
                "locator": {"kind": "tile", "blockId": block.block_id, "frameIndex": None,
                            "tileIndex": tile_index, "cellIndex": None},
                "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                            "pixelSha256": pixel_hash, "width": 8, "height": 8},
                "identityStatus": "source-pinned",
                "description": {"text": f"Amiga 8X8D2 block {block.block_id}, tile {tile_index}; visual role and game use are not established here.",
                                "status": "unknown", "evidence": [{"kind": "decoded-pixels",
                                    "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/tile/{tile_index}",
                                    "note": f"Fixture DAA SHA-256 {archive_hash}; exact decoded 8×8 RGB pixels match the 64×64 source render."}]},
                "gameConsumers": [{"status": "unknown",
                                   "use": f"The in-game consumer for Amiga 8X8D2#{block.block_id}/tile/{tile_index} is not established here.",
                                   "evidence": [{"kind": "decoded-pixels",
                                                 "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/tile/{tile_index}",
                                                 "note": "The archive locator and pixels are pinned; tile selector and screen consumer remain unknown."}]}],
                "animationGroupId": None,
            }
    if len(records) != len(blocks) * TILES_PER_BLOCK:
        raise ValueError("decoded Amiga 8X8D2 tile denominator is incomplete")
    return records


def inventory_pairs(inventory: dict[str, Any], records: dict[str, dict[str, Any]],
                    source_root: Path, package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    alias_rows = 0
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "Amiga" or Path(str(alias.get("sourceArchive", ""))).name.upper() != "8X8D2.DAA":
                continue
            alias_rows += 1
            match = ASSET_NAME.fullmatch(str(alias.get("sourceName", "")))
            if not match:
                raise ValueError(f"{pair['id']}: invalid Amiga tile sourceName {alias.get('sourceName')!r}")
            block_text, tile_text = match.groups()
            block_id, tile_index = int(block_text), int(tile_text)
            if alias.get("asset") != block_id or alias.get("tile") != tile_index:
                raise ValueError(f"{pair['id']}: alias locator fields conflict with {alias['sourceName']}")
            asset_id = source_id(block_id, tile_index)
            record = records.get(asset_id)
            if record is None:
                raise ValueError(f"{pair['id']}: alias points outside the pinned 8X8D2 tile denominator")
            relative = str(alias.get("sourceProvenance", "")).replace("\\", "/")
            source = _source_path(source_root, relative, f"{pair['id']} alias")
            if source != _source_path(source_root, f"amiga_non_picture_source/8X8D2_{block_id:03d}/8X8D2_{block_id:03d}_tile_{tile_index:02d}.png", f"{pair['id']} expected tile"):
                raise ValueError(f"{pair['id']}: alias provenance differs from the archive tile render")
            source_hash = sha256(source.read_bytes())
            if pair.get("sourceSha256") != source_hash or record["decoded"]["sha256"] != source_hash:
                raise ValueError(f"{pair['id']}: exact source PNG SHA-256 differs from the decoded tile")
            for side, expected in (("source", pair["sourceSha256"]), ("output", pair["outputSha256"])):
                candidate = _package_file(package_root, pair[side], f"{pair['id']} packaged {side}")
                if sha256(candidate.read_bytes()) != expected:
                    raise ValueError(f"{pair['id']}: packaged {side} hash differs from the inventory")
            prior = pairs.setdefault(pair["id"], pair)
            if (prior.get("sourceSha256") != pair.get("sourceSha256")
                    or prior.get("outputSha256") != pair.get("outputSha256")):
                raise ValueError(f"{pair['id']}: duplicate gallery ID has conflicting image hashes")
            pair_sources[pair["id"]].add(asset_id)
    return pairs, pair_sources, alias_rows


def restyle_record(pair: dict[str, Any], asset_ids: set[str]) -> dict[str, Any]:
    refs = pair.get("promptReferences", [])
    prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None, "textSha256": None,
              "inputPath": f"images/{pair['sourceSha256']}.png", "inputSha256": pair["sourceSha256"],
              "text": None, "references": [], "referenceAssetIds": []}
    if len(refs) == 1:
        ref = refs[0]
        prompt.update({"status": "linked-full-text", "batch": ref.get("batch"), "path": ref.get("file"),
                       "sha256": ref.get("sha256"), "text": ref.get("text")})
    return {"id": f"restyle/cok-generated/{pair['id']}",
            "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair["id"],
                                    "reference": f"restyle/cok-generated/manifest.json#{pair['id']}"}],
            "sourceAssetIds": sorted(asset_ids),
            "sourceRelation": "shared-output" if len(asset_ids) > 1 else "one-to-one",
            "prompt": prompt,
            "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
            "reviewStatus": "runtime-admitted" if pair.get("runtimeApproved") else "generated",
            "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair['id']}",
                          "note": f"Exact Amiga 8X8D2 source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; prompt and composition review remain separate."}]}


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]]) -> dict[str, Any]:
    result = json.loads(json.dumps(registry))
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    for asset_id, incoming in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if (prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"]
                    or prior.get("locator") != incoming["locator"]):
                raise ValueError(f"{asset_id}: existing archive pin or tile locator conflicts")
            if (prior.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: existing decoded pixels conflict")
            incoming = {**incoming, "description": prior.get("description") or incoming["description"],
                        "gameConsumers": prior.get("gameConsumers") or incoming["gameConsumers"]}
        asset_map[asset_id] = incoming
    result["assets"] = list(asset_map.values())

    restyles = {row["id"]: row for row in result["restyles"]}
    for pair_id, pair in pairs.items():
        incoming = restyle_record(pair, pair_sources[pair_id])
        prior = restyles.get(incoming["id"])
        if prior:
            source_ids = sorted(set(prior.get("sourceAssetIds", [])) | set(incoming["sourceAssetIds"]))
            output_ok = any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"]
                            for out in prior.get("outputs", []))
            if not output_ok:
                raise ValueError(f"{incoming['id']}: existing gallery output conflicts")
            refs = prior.setdefault("externalReferences", [])
            for ref in incoming["externalReferences"]:
                if ref not in refs:
                    refs.append(ref)
            prior["sourceAssetIds"] = source_ids
            prior["sourceRelation"] = "shared-output" if len(source_ids) > 1 else prior.get("sourceRelation", "one-to-one")
        else:
            restyles[incoming["id"]] = incoming
    result["restyles"] = list(restyles.values())

    links = result["crossVersionLinks"]
    existing = {(link.get("fromAssetId"), link.get("toAssetId")) for link in links}
    by_pixels: dict[str, list[str]] = defaultdict(list)
    for asset in assets.values():
        by_pixels[asset["decoded"]["pixelSha256"]].append(asset["id"])
    for pixel_hash, ids in by_pixels.items():
        ordered = sorted(ids)
        for other in ordered[1:]:
            first = ordered[0]
            link = (first, other)
            if (link[0], link[1]) not in existing and (link[1], link[0]) not in existing:
                links.append({"fromAssetId": first, "toAssetId": other, "relation": "pixel-identical",
                              "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                              "reference": "tools/import_cok_amiga_8x8d2_registry.py",
                              "note": f"Distinct Amiga DAA block/tile locators decode to identical RGB SHA-256 {pixel_hash}; retain both IDs."}]})
                existing.add(link)
    dos_by_pixels: dict[str, list[str]] = defaultdict(list)
    for asset in result["assets"]:
        if asset.get("platform") == "DOS-EGA" and asset.get("locator", {}).get("kind") == "tile":
            pixel_hash = (asset.get("decoded") or {}).get("pixelSha256")
            if pixel_hash:
                dos_by_pixels[pixel_hash].append(asset["id"])
    cross_matches = 0
    for amiga_id, asset in assets.items():
        pixel_hash = asset["decoded"]["pixelSha256"]
        for dos_id in dos_by_pixels.get(pixel_hash, []):
            if (amiga_id, dos_id) in existing or (dos_id, amiga_id) in existing:
                continue
            links.append({"fromAssetId": amiga_id, "toAssetId": dos_id, "relation": "pixel-identical",
                          "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                          "reference": "tools/import_cok_amiga_8x8d2_registry.py + tools/import_cok_dos_tiles_registry.py",
                          "note": f"The pinned Amiga 8X8D2 DAA tile and DOS EGA tile decode to identical 8×8 RGB SHA-256 {pixel_hash}; archive locators remain distinct."}]})
            existing.add((amiga_id, dos_id))
            cross_matches += 1
    return result, cross_matches


def apply_visual_descriptions(registry: dict[str, Any], sources: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path, package_root: Path | None = None) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply exact-preview visible-appearance notes to the full disk-3 8X8D2 tile set."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("Amiga 8X8D2 visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(sources):
        raise ValueError(f"visual description coverage differs from decoded Amiga 8X8D2 tiles: missing={len(set(sources)-set(by_id))}, extra={len(set(by_id)-set(sources))}")

    result = json.loads(json.dumps(registry))
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    dataset_sha = sha256(dataset_path.read_bytes())
    evidence_ref = f"{dataset_path.as_posix()}#"
    descriptions_by_pixel: dict[str, str] = {}
    for asset_id, row in by_id.items():
        source = sources[asset_id]
        asset = asset_map.get(asset_id)
        if (asset is None or asset.get("platform") != "Amiga"
                or asset.get("archive", {}).get("name", "").upper() != "8X8D2.DAA"):
            raise ValueError(f"{asset_id}: visual description does not target a merged Amiga 8X8D2 source")
        decoded = asset.get("decoded") or {}
        source_hash, pixel_hash = row.get("sourceSha256"), row.get("pixelSha256")
        description = row.get("visualDescription")
        if (source_hash != decoded.get("sha256") or pixel_hash != source.get("pixelHash")
                or not isinstance(description, str) or not description.strip()):
            raise ValueError(f"{asset_id}: visual description source/file/pixel hash or text mismatch")
        if descriptions_by_pixel.setdefault(pixel_hash, description) != description:
            raise ValueError(f"{asset_id}: exact-pixel duplicate has conflicting visual descriptions")
        reviews = row.get("evidence")
        if not isinstance(reviews, list) or len(reviews) != 1:
            raise ValueError(f"{asset_id}: expected exactly one visual-review evidence row")
        review = reviews[0]
        image_name = f"{source_hash}.png"
        expected_reference = f"apps/web/dist-app-cok57/restyle/cok-generated/images/{image_name}"
        if (review.get("kind") != "visual-review" or review.get("reference") != expected_reference
                or not isinstance(review.get("note"), str)
                or "visible appearance only" not in review["note"].lower()
                or "does not infer subject identity, game use, selector, or playback semantics" not in review["note"].lower()):
            raise ValueError(f"{asset_id}: visual review evidence must point to its exact source PNG and limit claims")
        root = package_root if package_root is not None else image_store.parent
        image_path = _package_file(root, image_store.name + "/" + image_name,
                                   f"{asset_id} visual-review image")
        if sha256(image_path.read_bytes()) != source_hash:
            raise ValueError(f"{asset_id}: reviewed source PNG is missing or its SHA-256 differs")
        description_obj = asset.setdefault("description", {})
        description_obj["visualDescription"] = description
        evidence = description_obj.setdefault("evidence", [])
        owned = [i for i, item in enumerate(evidence) if item.get("kind") == "visual-review"
                 and str(item.get("reference", "")).startswith(evidence_ref)]
        item = {"kind": "visual-review", "reference": f"{evidence_ref}{asset_id}",
                "note": f"Visible appearance reviewed on labeled contact sheets against exact source PNG SHA-256 {source_hash} and decoded pixel SHA-256 {pixel_hash}; dataset SHA-256 {dataset_sha}. Subject identity, game use, selector, and playback semantics remain unproven."}
        if owned:
            evidence[owned[0]] = item
            for index in reversed(owned[1:]):
                del evidence[index]
        else:
            evidence.append(item)
    return result, {"rows": len(by_id), "uniquePixelHashes": len(descriptions_by_pixel)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--archive", type=Path, default=ARCHIVE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    assets = decode_archive(args.archive, args.source_root, args.package_root)
    pairs, pair_sources, alias_rows = inventory_pairs(inventory, assets, args.source_root, args.package_root)
    merged, cross_matches = merge_registry(registry, assets, pairs, pair_sources)
    source_rows = {asset_id: {"pixelHash": asset["decoded"]["pixelSha256"]}
                   for asset_id, asset in assets.items()}
    merged, visual_counts = apply_visual_descriptions(
        merged, source_rows, read_json(args.visual_descriptions), args.package_root / "images",
        args.visual_descriptions, args.package_root)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"verifiedAmigaTiles": len(assets), "inventoryAliasRows": alias_rows,
                      "matchedSourceLocators": len({asset_id for ids in pair_sources.values() for asset_id in ids}),
                      "restyleCards": len(pairs), "sharedRestyleCards": sum(len(ids) > 1 for ids in pair_sources.values()),
                      "crossPlatformPixelMatches": cross_matches,
                      "newSourceIds": sum(asset_id not in {row["id"] for row in registry["assets"]} for asset_id in assets),
                      "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
                      "visualDescriptionRows": visual_counts["rows"],
                      "visualDescriptionUniquePixels": visual_counts["uniquePixelHashes"],
                      "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
