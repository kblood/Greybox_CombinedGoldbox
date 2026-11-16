#!/usr/bin/env python3
"""Verify Amiga CoK 8X8D0/D1 tile banks and link exact Restyle aliases."""

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
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-amiga-8x8d0-visual-descriptions-v1.json")
VISUAL_DESCRIPTIONS_D1_DEFAULT = Path("docs/engine/research/cok-amiga-8x8d1-visual-descriptions-v1.json")
AMIGA_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/assets/amiga_extracted/ChampionsOfKrynn")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
ARCHIVE_SHA256 = "1a4d646b205cc586baf05f058018ea8ab122a6060d99e24e7dbb7eacd043df97"
SCALE = 8
ARCHIVES = {
    "8X8D0": {"relative": "disk1/8X8D0.DAA", "disk": 1,
              "toc": [201, 202, 203, 11, 12, 31, 32, 23, 51, 52, 7, 81, 82],
              "tiles": {202: 38, 203: 45, 11: 70, 12: 70, 31: 70, 32: 70, 23: 70,
                        51: 70, 52: 70, 7: 70, 81: 70, 82: 70}},
    "8X8D1": {"relative": "disk2/8X8D1.DAA", "disk": 2,
              "toc": [201, 202, 203, 11, 12, 31, 32, 23, 51, 52, 7, 81, 82],
              "tiles": {202: 38, 203: 45, 11: 70, 12: 70, 31: 70, 32: 70, 23: 70,
                        51: 70, 52: 70, 7: 70, 81: 70, 82: 70}},
}
FAMILY_BY_KEY = {"Amiga 8X8D0": "8X8D0", "Amiga 8X8D1 (byte-identical to 8X8D0)": "8X8D1"}
ASSET_RE = re.compile(r"^8X8D0_(\d+)_tile_(\d+)\.png$", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def source_id(family: str, block: int, tile: int) -> str:
    info = ARCHIVES[family]
    return f"cok/amiga/disk{info['disk']}/{family.lower()}.daa/block/{block}/tile/{tile}"


def safe_file(root: Path, relative: str, context: str) -> Path:
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: path escapes approved root: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def package_file(root: Path, relative: str, context: str) -> Path:
    """Resolve a clean inventory-relative package file and reject symlink escapes."""
    if not isinstance(relative, str) or not relative.strip():
        raise ValueError(f"{context}: package path must be a nonempty relative file path")
    candidate = Path(relative)
    parts = relative.replace("\\", "/").split("/")
    if candidate.is_absolute() or candidate.drive or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"{context}: package path must be a clean relative file path: {relative!r}")
    return safe_file(root, relative, context)


def decode_archives(amiga_root: Path, source_root: Path, package_root: Path) -> tuple[dict[str, dict[str, Any]], int]:
    result: dict[str, dict[str, Any]] = {}
    excluded_blank_blocks = 0
    for family, info in ARCHIVES.items():
        archive_path = safe_file(amiga_root, info["relative"], family)
        data = archive_path.read_bytes()
        archive_hash = sha256(data)
        if archive_hash != ARCHIVE_SHA256:
            raise ValueError(f"{archive_path}: DAA SHA-256 differs from pinned candidate copy")
        kind, data_base, blocks = daa_decode.parse_container(data)
        toc = [block.block_id for block in blocks]
        if kind != "blocks" or toc != info["toc"]:
            raise ValueError(f"{archive_path}: DAA TOC differs from complete expected roster: {toc}")
        total_tiles = 0
        for block in blocks:
            raw = daa_decode.decompress_block(data, data_base, block)
            if block.block_id == 201:
                if any(raw):
                    raise ValueError(f"{family}#201: expected the pinned all-zero non-image block")
                excluded_blank_blocks += 1
                continue
            parsed = daa_decode.parse_8x8d_header(raw)
            if parsed is None:
                raise ValueError(f"{family}#{block.block_id}: not an Amiga 8X8D 4-plane tile strip")
            count, planes, row_bytes, plane_size = parsed
            if count != info["tiles"][block.block_id] or planes != 4:
                raise ValueError(f"{family}#{block.block_id}: unexpected tile count/planes {count}/{planes}")
            total_tiles += count
            for tile in range(count):
                rows = daa_decode.decode_8x8d_tile(raw, count, row_bytes, plane_size, tile)
                rgb = bytes(channel for row in rows for index in row for channel in daa_decode.EGA_PALETTE[index])
                stem = f"8X8D0_{block.block_id:03d}_tile_{tile:02d}.png"
                relative = f"amiga_non_picture_source/8X8D0_{block.block_id:03d}/{stem}"
                source = safe_file(source_root, relative, f"{family}#{block.block_id}/tile/{tile}")
                png_bytes = source.read_bytes()
                with Image.open(source) as image:
                    image = image.convert("RGB")
                    if image.size != (8 * SCALE, 8 * SCALE):
                        raise ValueError(f"{source}: expected RGB {8*SCALE}×{8*SCALE} source render")
                    native = image.resize((8, 8), Image.Resampling.NEAREST).tobytes()
                if native != rgb:
                    raise ValueError(f"{source}: exact native RGB differs from the DAA tile")
                png_hash = sha256(png_bytes)
                packaged = package_file(package_root, f"images/{png_hash}.png",
                                        f"{family}#{block.block_id}/tile/{tile} packaged image")
                if sha256(packaged.read_bytes()) != png_hash:
                    raise ValueError(f"{source}: exact source PNG is absent from the generated gallery package")
                pixel_hash = sha256(rgb)
                asset_id = source_id(family, block.block_id, tile)
                result[asset_id] = {
                    "id": asset_id, "game": "cok", "edition": f"Amiga disk {info['disk']}", "platform": "Amiga",
                    "archive": {"name": f"{family}.DAA", "path": archive_path.resolve().as_posix(), "sha256": archive_hash},
                    "locator": {"kind": "tile", "blockId": block.block_id, "frameIndex": None,
                                "tileIndex": tile, "cellIndex": None},
                    "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                                "pixelSha256": pixel_hash, "width": 8, "height": 8},
                    "identityStatus": "source-pinned",
                    "description": {"text": f"Amiga {family} block {block.block_id}, tile {tile}; visual role and game use are not established here.",
                                    "status": "unknown", "evidence": [{"kind": "decoded-pixels",
                                      "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/tile/{tile}",
                                      "note": f"Candidate DAA SHA-256 {archive_hash}; exact native 8×8 RGB matches the 64×64 source render."}]},
                    "gameConsumers": [{"status": "unknown", "use": f"The in-game consumer for {family}#{block.block_id}/tile/{tile} is not established here.",
                                       "evidence": [{"kind": "decoded-pixels",
                                                     "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/tile/{tile}",
                                                     "note": "Archive locator and pixels are pinned; tile selector and consumer remain unknown."}]}],
                    "animationGroupId": None,
                }
        expected_tiles = sum(info["tiles"].values())
        if total_tiles != expected_tiles:
            raise ValueError(f"{family}: expected {expected_tiles} tile locators outside the blank #201 block, got {total_tiles}")
    return result, excluded_blank_blocks


def inventory_pairs(inventory: dict[str, Any], assets: dict[str, dict[str, Any]], source_root: Path,
                    package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    alias_rows = 0
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            family = alias.get("family")
            archive_family = FAMILY_BY_KEY.get(family)
            if alias.get("platform") != "Amiga" or not archive_family:
                continue
            alias_rows += 1
            match = ASSET_RE.fullmatch(str(alias.get("sourceName", "")))
            if not match:
                raise ValueError(f"{pair['id']}: malformed 8X8D sourceName {alias.get('sourceName')!r}")
            block_text, tile_text = match.groups()
            block, tile = int(block_text), int(tile_text)
            if alias.get("asset") != block or alias.get("tile") != tile:
                raise ValueError(f"{pair['id']}: alias locator fields conflict with {block}/{tile}")
            declared_archive = str(alias.get("sourceArchive", "")).upper()
            if declared_archive and declared_archive != f"{archive_family}.DAA":
                raise ValueError(f"{pair['id']}: source archive conflicts with {family}")
            expected_relative = f"amiga_non_picture_source/8X8D0_{block:03d}/8X8D0_{block:03d}_tile_{tile:02d}.png"
            provenance = str(alias.get("sourceProvenance", "")).replace("\\", "/")
            if provenance != expected_relative:
                raise ValueError(f"{pair['id']}: source provenance differs from expected 8X8D0 render")
            source = safe_file(source_root, expected_relative, f"{pair['id']} alias")
            source_hash = sha256(source.read_bytes())
            if pair.get("sourceSha256") != source_hash:
                raise ValueError(f"{pair['id']}: inventory source SHA-256 differs from exact tile PNG")
            asset_id = source_id(archive_family, block, tile)
            asset = assets.get(asset_id)
            if not asset or asset["decoded"]["sha256"] != source_hash:
                raise ValueError(f"{pair['id']}: alias does not resolve to exact {archive_family} archive/tile ID")
            for side in ("source", "output"):
                image_path = package_file(package_root, pair[side], f"{pair['id']} packaged {side}")
                if sha256(image_path.read_bytes()) != pair[f"{side}Sha256"]:
                    raise ValueError(f"{pair['id']}: packaged {side} hash differs from manifest")
            prior = pairs.setdefault(pair["id"], pair)
            if prior.get("sourceSha256") != pair.get("sourceSha256") or prior.get("outputSha256") != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: duplicate card has conflicting hashes")
            pair_sources[pair["id"]].add(asset_id)
    if alias_rows != 1566:
        raise ValueError(f"expected 1,566 8X8D0/D1 Restyle aliases, got {alias_rows}")
    return pairs, pair_sources, alias_rows


def restyle_record(pair: dict[str, Any], source_ids: set[str]) -> dict[str, Any]:
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
            "sourceAssetIds": sorted(source_ids),
            "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one", "prompt": prompt,
            "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
            "reviewStatus": "runtime-admitted" if pair.get("runtimeApproved") else "generated",
            "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair['id']}",
                          "note": f"Exact source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; archive aliases remain separate source IDs."}]}


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]]) -> tuple[dict[str, Any], int]:
    result = json.loads(json.dumps(registry))
    asset_map = {row["id"]: row for row in result["assets"]}
    for asset_id, incoming in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or prior.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: existing archive pin or tile locator conflicts")
            if (prior.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: existing pixel hash conflicts")
            incoming = {**incoming, "description": prior.get("description") or incoming["description"],
                        "gameConsumers": prior.get("gameConsumers") or incoming["gameConsumers"],
                        "animationGroupId": prior.get("animationGroupId")}
        asset_map[asset_id] = incoming
    result["assets"] = list(asset_map.values())
    restyles = {row["id"]: row for row in result["restyles"]}
    for pair_id, pair in pairs.items():
        incoming = restyle_record(pair, pair_sources[pair_id])
        prior = restyles.get(incoming["id"])
        if prior:
            if not any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"] for out in prior.get("outputs", [])):
                raise ValueError(f"{incoming['id']}: existing gallery output conflicts")
            ids = sorted(set(prior.get("sourceAssetIds", [])) | set(incoming["sourceAssetIds"]))
            prior["sourceAssetIds"] = ids
            prior["sourceRelation"] = "shared-output" if len(ids) > 1 else prior.get("sourceRelation", "one-to-one")
            refs = prior.setdefault("externalReferences", [])
            for ref in incoming["externalReferences"]:
                if ref not in refs:
                    refs.append(ref)
        else:
            restyles[incoming["id"]] = incoming
    result["restyles"] = list(restyles.values())
    by_pixels: dict[tuple[int, int, str], list[str]] = defaultdict(list)
    for row in result["assets"]:
        decoded = row.get("decoded") or {}
        if decoded.get("pixelSha256"):
            by_pixels[(decoded.get("width"), decoded.get("height"), decoded["pixelSha256"])].append(row["id"])
    links = result["crossVersionLinks"]
    existing = {(link.get("fromAssetId"), link.get("toAssetId")) for link in links}
    added = 0
    for (width, height, pixel_hash), ids in by_pixels.items():
        new_ids = sorted(set(ids) & set(assets))
        for from_id in new_ids:
            for to_id in sorted(set(ids)):
                if from_id == to_id or (from_id, to_id) in existing or (to_id, from_id) in existing:
                    continue
                links.append({"fromAssetId": from_id, "toAssetId": to_id, "relation": "pixel-identical",
                              "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                              "reference": "tools/import_cok_amiga_8x8d0_registry.py",
                              "note": f"Distinct archive-qualified locators decode to identical {width}×{height} RGB SHA-256 {pixel_hash}; keep both IDs."}]})
                existing.add((from_id, to_id)); added += 1
    return result, added


def apply_visual_descriptions(registry: dict[str, Any], sources: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path, archive_name: str = "8X8D0.DAA",
                              package_root: Path | None = None) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply source-hash-pinned visible-appearance notes to one Amiga 8X8D archive."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError(f"Amiga {archive_name} visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(sources):
        raise ValueError(f"visual description coverage differs from {archive_name} tiles: missing={len(set(sources)-set(by_id))}, extra={len(set(by_id)-set(sources))}")

    result = json.loads(json.dumps(registry))
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    dataset_sha = sha256(dataset_path.read_bytes())
    evidence_ref = f"{dataset_path.as_posix()}#"
    descriptions_by_pixel: dict[str, str] = {}
    for asset_id, row in by_id.items():
        source = sources[asset_id]
        asset = asset_map.get(asset_id)
        if (asset is None or asset.get("platform") != "Amiga"
                or asset.get("archive", {}).get("name", "").upper() != archive_name.upper()):
            raise ValueError(f"{asset_id}: visual description does not target a merged Amiga {archive_name} source")
        decoded = asset.get("decoded") or {}
        source_hash, pixel_hash = row.get("sourceSha256"), row.get("pixelSha256")
        description = row.get("visualDescription")
        if (source_hash != decoded.get("sha256") or pixel_hash != source.get("pixelHash")
                or not isinstance(description, str) or not description.strip()):
            raise ValueError(f"{asset_id}: visual description source/file/pixel hash or text mismatch")
        if descriptions_by_pixel.setdefault(pixel_hash, description) != description:
            raise ValueError(f"{asset_id}: exact-pixel duplicate has conflicting visual descriptions")
        for other in result["assets"]:
            if other.get("id") == asset_id:
                continue
            other_decoded = other.get("decoded") or {}
            other_description = (other.get("description") or {}).get("visualDescription")
            if (other_decoded.get("width") == decoded.get("width")
                    and other_decoded.get("height") == decoded.get("height")
                    and other_decoded.get("pixelSha256") == pixel_hash
                    and other_description and other_description != description):
                raise ValueError(f"{asset_id}: exact-pixel duplicate conflicts with existing wording on {other['id']}")
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
        image_path = package_file(root, image_store.name + "/" + image_name,
                                  f"{asset_id} visual-review image")
        if sha256(image_path.read_bytes()) != source_hash:
            raise ValueError(f"{asset_id}: reviewed source PNG is missing or its SHA-256 differs")
        description_obj = asset.setdefault("description", {})
        description_obj["visualDescription"] = description
        evidence = description_obj.setdefault("evidence", [])
        owned = [i for i, item in enumerate(evidence) if item.get("kind") == "visual-review"
                 and str(item.get("reference", "")).startswith(evidence_ref)]
        item = {"kind": "visual-review", "reference": f"{evidence_ref}{asset_id}",
                "note": f"Visible appearance manually reviewed against exact source PNG SHA-256 {source_hash} and decoded pixel SHA-256 {pixel_hash}; dataset SHA-256 {dataset_sha}. Subject identity, game use, selector, and playback semantics remain unproven."}
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
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--visual-descriptions-d1", type=Path, default=VISUAL_DESCRIPTIONS_D1_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    assets, blank_blocks = decode_archives(args.amiga_root, args.source_root, args.package_root)
    pairs, pair_sources, alias_rows = inventory_pairs(inventory, assets, args.source_root, args.package_root)
    merged, added = merge_registry(registry, assets, pairs, pair_sources)
    d0_ids = {asset_id: {"pixelHash": row["decoded"]["pixelSha256"]}
              for asset_id, row in assets.items() if row["archive"]["name"].upper() == "8X8D0.DAA"}
    merged, d0_visual_counts = apply_visual_descriptions(
        merged, d0_ids, read_json(args.visual_descriptions), args.package_root / "images",
        args.visual_descriptions, "8X8D0.DAA", args.package_root)
    d1_ids = {asset_id: {"pixelHash": row["decoded"]["pixelSha256"]}
              for asset_id, row in assets.items() if row["archive"]["name"].upper() == "8X8D1.DAA"}
    merged, d1_visual_counts = apply_visual_descriptions(
        merged, d1_ids, read_json(args.visual_descriptions_d1), args.package_root / "images",
        args.visual_descriptions_d1, "8X8D1.DAA", args.package_root)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    old_ids = {row["id"] for row in registry["assets"]}
    print(json.dumps({"verifiedTileLocators": len(assets), "excludedAllZeroBlocks": blank_blocks,
                      "inventoryAliasRows": alias_rows,
                      "matchedSourceLocators": len({asset_id for ids in pair_sources.values() for asset_id in ids}),
                      "restyleCards": len(pairs), "newSourceIds": sum(asset_id not in old_ids for asset_id in assets),
                      "newPixelIdenticalLinks": added, "registryAssets": len(merged["assets"]),
                      "visualDescriptionRows": d0_visual_counts["rows"] + d1_visual_counts["rows"],
                      "visualDescriptionUniquePixels": len({row["decoded"]["pixelSha256"] for row in assets.values()
                          if row["archive"]["name"].upper() in {"8X8D0.DAA", "8X8D1.DAA"}}),
                      "visualDescriptionsByArchive": {"8X8D0.DAA": d0_visual_counts, "8X8D1.DAA": d1_visual_counts},
                      "registryRestyles": len(merged["restyles"]), "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
                      "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
