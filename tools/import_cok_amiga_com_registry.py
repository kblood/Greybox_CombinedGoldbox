#!/usr/bin/env python3
"""Verify Amiga CoK combat strips and non-picture archives, then link exact Restyle pairs."""

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
AMIGA_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/assets/amiga_extracted/ChampionsOfKrynn")
SOURCE_ROOT_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-amiga-com-visual-descriptions-v1.json")

# These hashes pin the candidate/fixture archive copies used here. They do not establish that
# either copy came independently from a retail/WHLoad installation.
ARCHIVES: dict[str, dict[str, Any]] = {
    "COMSPR.DAA": {"relative": "disk1/comspr.daa", "disk": 1,
                   "sha256": "4b2aaf61b11bc65ac15b7fa4c2587480523f36d94415a6183ad16795ae54a222",
                   "kind": "frames", "blocks": list(range(12)) + list(range(25, 29)) + list(range(128, 140)) + list(range(153, 157))},
    "DUNGCOM.DAA@disk1": {"relative": "disk1/DUNGCOM.DAA", "disk": 1,
                          "sha256": "ee4aa9463e5923dd71fbd459abb4be98924e95de23d4e046d15a4973c59a4070",
                          "kind": "com-strip", "blocks": [1], "items": 25},
    "DUNGCOM.DAA@disk2": {"relative": "disk2/DUNGCOM.DAA", "disk": 2,
                          "sha256": "ee4aa9463e5923dd71fbd459abb4be98924e95de23d4e046d15a4973c59a4070",
                          "kind": "com-strip", "blocks": [1], "items": 25},
    "WILDCOM.DAA": {"relative": "disk2/WILDCOM.DAA", "disk": 2,
                    "sha256": "b8c40848a32498aa4c92c7caf4b88a1bd096f89986c4f7165e713f917d500a4e",
                    "kind": "com-strip", "blocks": [1], "items": 35},
    "RANDCOM.DAA": {"relative": "disk1/RANDCOM.DAA", "disk": 1,
                    "sha256": "678d0ab7dab82b389ca08e548a8fbd6d8f4a7f2046c3ba50138b99a0448fc69e",
                    "kind": "com-strip", "blocks": [1], "items": 6},
    "SKY.DAA": {"relative": "disk1/SKY.DAA", "disk": 1,
                "sha256": "75b4dbeac028d7bb21ff4702894223eea076149a79eb7dfb109bbbd4e941cd34",
                "kind": "frames", "blocks": [250, 251, 252]},
    "BORDER.DAA": {"relative": "disk1/BORDER.DAA", "disk": 1,
                   "sha256": "23d900e504922fbec242236014f53a7cf0de7a1529ef15f66fdf915391b91b5d",
                   "kind": "frames", "blocks": [99]},
}
FAMILY_TO_ARCHIVES = {
    "Amiga COMSPR": ["COMSPR.DAA"],
    "Amiga DUNGCOM": ["DUNGCOM.DAA@disk1", "DUNGCOM.DAA@disk2"],
    "Amiga WILDCOM": ["WILDCOM.DAA"],
    "Amiga RANDCOM": ["RANDCOM.DAA"],
    "Amiga SKY": ["SKY.DAA"],
    "Amiga BORDER": ["BORDER.DAA"],
}
ASSET_RE = re.compile(r"^(?:comspr|DUNGCOM|WILDCOM|RANDCOM|SKY|BORDER)_(\d+)(?:_tile_(\d+))?\.png$", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def source_id(archive_key: str, block_id: int, item_index: int | None = None) -> str:
    info = ARCHIVES[archive_key]
    archive = Path(info["relative"]).name.lower()
    prefix = f"cok/amiga/disk{info['disk']}/{archive}/block/{block_id}"
    return f"{prefix}/tile/{item_index}" if item_index is not None else f"{prefix}/frame/0"


def safe_file(root: Path, relative: str, context: str) -> Path:
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: path escapes approved root: {path}")
    return path


def _render_standard(raw: bytes) -> tuple[int, int, bytes]:
    frame = daa_decode.parse_frame_header(raw)
    if frame is None:
        raise ValueError("DAA block does not decode as a standard image frame")
    width, height, palette, pixel_offset = frame
    return width, height, bytes(daa_decode.planar_frame_to_rgb(raw, width, height, palette, pixel_offset))


def _asset_record(archive_key: str, block_id: int, item_index: int | None, archive_path: Path,
                  archive_hash: str, width: int, height: int, png_hash: str, pixel_hash: str,
                  render_scale: int) -> dict[str, Any]:
    archive_name = Path(ARCHIVES[archive_key]["relative"]).name
    loc_kind = "tile" if item_index is not None else "block-frame"
    locator = {"kind": loc_kind, "blockId": block_id, "frameIndex": None if item_index is not None else 0,
               "tileIndex": item_index, "cellIndex": None}
    locator_ref = f"{archive_path.as_posix()}#{block_id}/" + (f"tile/{item_index}" if item_index is not None else "frame/0")
    if item_index is None:
        subject = f"Amiga {archive_name[:-4]} block {block_id}"
        use = f"The in-game selector and consumer for {archive_name}#{block_id}/frame/0 are not established here."
    else:
        subject = f"Amiga {archive_name[:-4]} block {block_id}, tile {item_index}"
        use = f"The in-game selector and consumer for {archive_name}#{block_id}/tile/{item_index} are not established here."
    return {
        "id": source_id(archive_key, block_id, item_index), "game": "cok",
        "edition": f"Amiga disk {ARCHIVES[archive_key]['disk']}", "platform": "Amiga",
        "archive": {"name": archive_name, "path": archive_path.resolve().as_posix(), "sha256": archive_hash},
        "locator": locator,
        "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                    "pixelSha256": pixel_hash, "width": width, "height": height},
        "identityStatus": "source-pinned",
        "description": {"text": f"{subject}; depicted subject and game use are not established here.",
                        "status": "unknown", "evidence": [{"kind": "decoded-pixels", "reference": locator_ref,
                          "note": f"Candidate-copy DAA SHA-256 {archive_hash}; decoded native RGB matches the exact {render_scale}× source render."}]},
        "gameConsumers": [{"status": "unknown", "use": use,
                           "evidence": [{"kind": "decoded-pixels", "reference": locator_ref,
                                         "note": "The archive locator and pixels are pinned; game selector/consumer semantics remain unknown."}]}],
        "animationGroupId": None,
    }


def decode_archives(amiga_root: Path, source_root: Path, package_root: Path) -> dict[str, dict[str, Any]]:
    assets: dict[str, dict[str, Any]] = {}
    for archive_key, info in ARCHIVES.items():
        archive_path = safe_file(amiga_root, info["relative"], archive_key)
        archive_bytes = archive_path.read_bytes()
        archive_hash = sha256(archive_bytes)
        if archive_hash != info["sha256"]:
            raise ValueError(f"{archive_path}: DAA SHA-256 differs from its pinned fixture copy")
        kind, data_base, blocks = daa_decode.parse_container(archive_bytes)
        toc = [block.block_id for block in blocks]
        if kind != "blocks" or len(toc) != len(info["blocks"]) or set(toc) != set(info["blocks"]):
            raise ValueError(f"{archive_path}: DAA TOC differs from complete roster: {toc}")
        if len(toc) != len(set(toc)):
            raise ValueError(f"{archive_path}: duplicate block IDs require explicit TOC-entry reconciliation")
        for block in blocks:
            raw = daa_decode.decompress_block(archive_bytes, data_base, block)
            if info["kind"] == "frames":
                width, height, rgb = _render_standard(raw)
                items: list[tuple[int | None, int, int, bytes]] = [(None, width, height, rgb)]
            else:
                parsed = daa_decode.parse_com_strip_header(raw)
                if parsed is None:
                    raise ValueError(f"{archive_path}#{block.block_id}: not a solved Amiga COM strip")
                count, row_bytes, plane_size = parsed
                if count != info["items"]:
                    raise ValueError(f"{archive_path}#{block.block_id}: expected {info['items']} strip items, got {count}")
                palette = daa_decode.read_palette(raw, 9)
                items = []
                for item_index in range(count):
                    indices = daa_decode.decode_com_item(raw, row_bytes, plane_size, item_index)
                    rgb = bytes(channel for row in indices for index in row for channel in palette[index])
                    items.append((item_index, 24, 24, rgb))
            for item_index, width, height, rgb in items:
                family = next(family for family, keys in FAMILY_TO_ARCHIVES.items() if archive_key in keys)
                stem = (f"comspr_{block.block_id:03d}.png" if family == "Amiga COMSPR" else
                        f"{family.removeprefix('Amiga ')}_{block.block_id:03d}" +
                        (f"_tile_{item_index:02d}" if item_index is not None else "") + ".png")
                relative = f"amiga_non_picture_source/{family.removeprefix('Amiga ')}/{stem}"
                source_path = safe_file(source_root, relative, f"{archive_key}#{block.block_id}/{item_index}")
                png_bytes = source_path.read_bytes()
                with Image.open(source_path) as image:
                    image = image.convert("RGB")
                    if image.width % width or image.height % height or image.width // width != image.height // height:
                        raise ValueError(f"{source_path}: source dimensions are not an integer nearest-neighbor render of {width}×{height}")
                    render_scale = image.width // width
                    if render_scale not in (4, 8):
                        raise ValueError(f"{source_path}: unsupported source-render scale {render_scale}×")
                    native = image.resize((width, height), Image.Resampling.NEAREST).tobytes()
                if native != rgb:
                    raise ValueError(f"{source_path}: exact native RGB differs from DAA decode")
                png_hash = sha256(png_bytes)
                packaged = safe_file(package_root, f"images/{png_hash}.png",
                                     f"{archive_key}#{block.block_id}/{item_index} packaged render")
                if sha256(packaged.read_bytes()) != png_hash:
                    raise ValueError(f"{source_path}: exact source PNG is absent from the generated gallery package")
                pixel_hash = sha256(rgb)
                asset = _asset_record(archive_key, block.block_id, item_index, archive_path, archive_hash,
                                      width, height, png_hash, pixel_hash, render_scale)
                asset_id = asset["id"]
                if asset_id in assets and assets[asset_id]["archive"]["sha256"] != archive_hash:
                    raise ValueError(f"{asset_id}: conflicting source archive bytes")
                assets[asset_id] = asset
    return assets


def inventory_pairs(inventory: dict[str, Any], assets: dict[str, dict[str, Any]],
                    source_root: Path, package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    alias_rows = 0
    records_by_png: dict[str, list[str]] = defaultdict(list)
    for asset_id, asset in assets.items():
        records_by_png[asset["decoded"]["sha256"]].append(asset_id)
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            family = alias.get("family")
            if alias.get("platform") != "Amiga" or family not in FAMILY_TO_ARCHIVES:
                continue
            alias_rows += 1
            source_name = str(alias.get("sourceName", ""))
            match = ASSET_RE.fullmatch(source_name)
            if not match:
                raise ValueError(f"{pair['id']}: malformed Amiga sourceName {source_name!r}")
            block_text, tile_text = match.groups()
            block_id = int(block_text)
            item_index = int(tile_text) if tile_text is not None else None
            expected_path = (Path("amiga_non_picture_source") / family.removeprefix("Amiga ") / source_name).as_posix()
            provenance = str(alias.get("sourceProvenance", "")).replace("\\", "/")
            if provenance != expected_path:
                raise ValueError(f"{pair['id']}: source provenance {provenance!r} differs from {expected_path!r}")
            if item_index is None:
                if alias.get("tile") is not None:
                    raise ValueError(f"{pair['id']}: frame source unexpectedly has a tile locator")
                if alias.get("asset") not in (None, block_id):
                    raise ValueError(f"{pair['id']}: alias block conflicts with {source_name}")
            elif alias.get("asset") != block_id or alias.get("tile") != item_index:
                raise ValueError(f"{pair['id']}: alias locator fields conflict with {source_name}")
            if alias.get("sourceArchive"):
                archive_name = Path(str(alias["sourceArchive"])).name.upper()
                if not any(Path(ARCHIVES[key]["relative"]).name.upper() == archive_name for key in FAMILY_TO_ARCHIVES[family]):
                    raise ValueError(f"{pair['id']}: source archive conflicts with {family}: {archive_name}")
            source = safe_file(source_root, expected_path, f"{pair['id']} alias")
            source_hash = sha256(source.read_bytes())
            if pair.get("sourceSha256") != source_hash:
                raise ValueError(f"{pair['id']}: inventory source SHA-256 differs from source render")
            matching = []
            for asset_id in records_by_png.get(source_hash, []):
                asset = assets[asset_id]
                loc = asset["locator"]
                if loc["blockId"] != block_id or loc["tileIndex"] != item_index:
                    continue
                if Path(asset["archive"]["name"]).stem.upper() != family.removeprefix("Amiga ").upper():
                    continue
                matching.append(asset_id)
            # DUNGCOM's disk 1 and disk 2 files are byte-identical. Preserve both edition-qualified IDs.
            expected_archives = FAMILY_TO_ARCHIVES[family]
            matching = sorted(set(matching))
            if len(matching) != len(expected_archives):
                raise ValueError(f"{pair['id']}: {source_name} resolves to {matching}, expected {len(expected_archives)} pinned archive locator(s)")
            if any(assets[asset_id]["archive"]["sha256"] == "" for asset_id in matching):
                raise ValueError(f"{pair['id']}: source locator lacks an archive hash pin")
            for side in ("source", "output"):
                expected_hash = pair[f"{side}Sha256"]
                image_path = safe_file(package_root, pair[side], f"{pair['id']} packaged {side}")
                if sha256(image_path.read_bytes()) != expected_hash:
                    raise ValueError(f"{pair['id']}: packaged {side} image differs from inventory hash")
            prior = pairs.setdefault(pair["id"], pair)
            if (prior.get("sourceSha256") != pair.get("sourceSha256") or prior.get("outputSha256") != pair.get("outputSha256")):
                raise ValueError(f"{pair['id']}: duplicate gallery ID has conflicting image hashes")
            pair_sources[pair["id"]].update(matching)
    if not alias_rows:
        raise ValueError("Restyle inventory contains no Amiga COM/non-picture aliases")
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
                          "note": f"Exact Amiga source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; prompt and visual/game-use review remain separate."}]}


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]]) -> dict[str, Any]:
    result = json.loads(json.dumps(registry))
    asset_map = {row["id"]: row for row in result["assets"]}
    for asset_id, incoming in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if (prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"]
                    or prior.get("locator") != incoming["locator"]):
                raise ValueError(f"{asset_id}: existing archive pin or locator conflicts")
            if (prior.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: existing decoded pixel hash conflicts")
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
            ids = sorted(set(prior.get("sourceAssetIds", [])) | set(incoming["sourceAssetIds"]))
            output_ok = any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"]
                            for out in prior.get("outputs", []))
            if not output_ok:
                raise ValueError(f"{incoming['id']}: existing gallery output conflicts")
            refs = prior.setdefault("externalReferences", [])
            for ref in incoming["externalReferences"]:
                if ref not in refs:
                    refs.append(ref)
            prior["sourceAssetIds"] = ids
            prior["sourceRelation"] = "shared-output" if len(ids) > 1 else prior.get("sourceRelation", "one-to-one")
        else:
            restyles[incoming["id"]] = incoming
    result["restyles"] = list(restyles.values())

    by_pixels: dict[tuple[int, int, str], list[str]] = defaultdict(list)
    for row in result["assets"]:
        decoded = row.get("decoded") or {}
        pixel_hash = decoded.get("pixelSha256")
        if pixel_hash:
            by_pixels[(decoded.get("width"), decoded.get("height"), pixel_hash)].append(row["id"])
    links = result["crossVersionLinks"]
    existing = {(link.get("fromAssetId"), link.get("toAssetId")) for link in links}
    added = 0
    for (width, height, pixel_hash), ids in by_pixels.items():
        ordered = sorted(set(ids))
        new_ids = [asset_id for asset_id in ordered if asset_id in assets]
        if not new_ids:
            continue
        for from_id in new_ids:
            for to_id in ordered:
                if from_id == to_id or (from_id, to_id) in existing or (to_id, from_id) in existing:
                    continue
                links.append({"fromAssetId": from_id, "toAssetId": to_id, "relation": "pixel-identical",
                              "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                              "reference": "tools/import_cok_amiga_com_registry.py",
                              "note": f"Distinct source-qualified locators decode to identical {width}×{height} native RGB SHA-256 {pixel_hash}; keep both IDs."}]})
                existing.add((from_id, to_id)); added += 1
    return result, added


def apply_visual_descriptions(registry: dict[str, Any], sources: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path, package_root: Path | None = None) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply source-pinned visible-appearance descriptions to the reviewed Amiga COM families."""
    allowed_archives = {"COMSPR.DAA", "DUNGCOM.DAA", "WILDCOM.DAA", "RANDCOM.DAA"}
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("Amiga COM visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(sources):
        raise ValueError(f"visual description coverage differs from reviewed Amiga COM assets: missing={len(set(sources)-set(by_id))}, extra={len(set(by_id)-set(sources))}")

    result = json.loads(json.dumps(registry))
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    dataset_sha = sha256(dataset_path.read_bytes())
    evidence_ref = f"{dataset_path.as_posix()}#"
    descriptions_by_pixel: dict[str, str] = {}
    for asset_id, row in by_id.items():
        source = sources[asset_id]
        asset = asset_map.get(asset_id)
        archive_name = str((asset or {}).get("archive", {}).get("name", "")).upper()
        if asset is None or asset.get("platform") != "Amiga" or archive_name not in allowed_archives:
            raise ValueError(f"{asset_id}: visual description does not target a merged Amiga COM source")
        decoded = asset.get("decoded") or {}
        source_hash, pixel_hash = row.get("sourceSha256"), row.get("pixelSha256")
        description = row.get("visualDescription")
        if (source_hash != decoded.get("sha256") or pixel_hash != source.get("pixelSha256")
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
        image_path = safe_file(root, image_store.name + "/" + image_name,
                               f"{asset_id} visual-review image")
        if sha256(image_path.read_bytes()) != source_hash:
            raise ValueError(f"{asset_id}: reviewed source PNG is missing or its SHA-256 differs")
        description_obj = asset.setdefault("description", {})
        description_obj["visualDescription"] = description
        evidence = description_obj.setdefault("evidence", [])
        owned = [index for index, item in enumerate(evidence)
                 if item.get("kind") == "visual-review" and str(item.get("reference", "")).startswith(evidence_ref)]
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
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    assets = decode_archives(args.amiga_root, args.source_root, args.package_root)
    pairs, pair_sources, alias_rows = inventory_pairs(inventory, assets, args.source_root, args.package_root)
    merged, added_links = merge_registry(registry, assets, pairs, pair_sources)
    visual_sources = {asset_id: {"pixelSha256": asset["decoded"]["pixelSha256"]}
                      for asset_id, asset in assets.items()
                      if asset["archive"]["name"].upper() in {"COMSPR.DAA", "DUNGCOM.DAA", "WILDCOM.DAA", "RANDCOM.DAA"}}
    merged, visual_counts = apply_visual_descriptions(
        merged, visual_sources, read_json(args.visual_descriptions), args.package_root / "images",
        args.visual_descriptions, args.package_root)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    old_ids = {row["id"] for row in registry["assets"]}
    print(json.dumps({"verifiedSourceLocators": len(assets), "inventoryAliasRows": alias_rows,
                      "matchedSourceLocators": len({asset_id for ids in pair_sources.values() for asset_id in ids}),
                      "restyleCards": len(pairs), "sharedRestyleCards": sum(len(ids) > 1 for ids in pair_sources.values()),
                      "newSourceIds": sum(asset_id not in old_ids for asset_id in assets),
                      "newPixelIdenticalLinks": added_links, "registryAssets": len(merged["assets"]),
                      "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
                      "visualDescriptionRows": visual_counts["rows"],
                      "visualDescriptionUniquePixels": visual_counts["uniquePixelHashes"],
                      "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
