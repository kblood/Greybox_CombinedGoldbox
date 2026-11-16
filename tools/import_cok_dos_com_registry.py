#!/usr/bin/env python3
"""Verify DOS CoK COMSPR/DUNGCOM/WILDCOM/RANDCOM/SKY and join exact Restyle records."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import dax_decode  # noqa: E402
import graphics_asset_registry  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
INVENTORY_SHA256 = "d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9"
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
DOS_DEFAULT = Path("Champions of Krynn")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-dos-com-visual-descriptions-v1.json")
SCALE = 4
ARCHIVES = {
    "COMSPR": {"name": "COMSPR.DAX", "sha256": "6bff177f6776339a627be3c0199518a41330f01f462e8994f649804e488a86d5",
               "blocks": [0, 128, 1, 129, 2, 130, 3, 131, 4, 132, 5, 133, 6, 134, 7, 135, 8, 136, 9, 137, 10, 138, 11, 139, 25, 153], "kind": "frames"},
    "DUNGCOM": {"name": "DUNGCOM.DAX", "sha256": "827176e941f24176f1907bde40a81928cb4c2da66231ca6b07c72b0b03a0bf2a",
                "blocks": [1], "kind": "tiles", "count": 25},
    "WILDCOM": {"name": "WILDCOM.DAX", "sha256": "00b204d63568ac0cd77c7ad64195fa1c0f682820490de5ac905f4657f30095c5",
                "blocks": [1], "kind": "tiles", "count": 35},
    "RANDCOM": {"name": "RANDCOM.DAX", "sha256": "78e5daab63d6880e8093e4bd25b50768aac81e7f004f783947f0205a0e69e925",
                "blocks": [1], "kind": "tiles", "count": 6},
    "SKY": {"name": "SKY.DAX", "sha256": "1ffe6b50f6d76116a9d72fbb05a94ea70160c8fad2a49b9c4b08776b16fbadf9",
            "blocks": [250, 251, 252], "kind": "frames"},
}
ALIAS_FAMILY = {"COMSPR": "COMSPR", "DOS DUNGCOM": "DUNGCOM", "DOS WILDCOM": "WILDCOM",
                "DOS RANDCOM": "RANDCOM", "SKY": "SKY"}
ASSET_RE = re.compile(r"^(COMSPR|DUNGCOM|WILDCOM|RANDCOM|SKY)_(\d+)(?:_tile_(\d+))?\.png$", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_inventory(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if sha256(data) != INVENTORY_SHA256:
        raise ValueError(f"{path}: inventory SHA-256 differs from the pinned gallery manifest")
    return json.loads(data)


def source_id(family: str, block: int, tile: int | None = None) -> str:
    base = f"cok/dos-ega/disk1/{family.lower()}.dax/block/{block}"
    return f"{base}/tile/{tile}" if tile is not None else f"{base}/frame/0"


def safe_file(root: Path, relative: str, context: str) -> Path:
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: path escapes approved root: {path}")
    return path


def asset_record(family: str, block: int, tile: int | None, archive_path: Path, archive_hash: str,
                 width: int, height: int, png_hash: str, pixel_hash: str) -> dict[str, Any]:
    archive_name = ARCHIVES[family]["name"]
    locator_ref = f"{archive_path.resolve().as_posix()}#{block}/" + (f"tile/{tile}" if tile is not None else "frame/0")
    locator = {"kind": "tile" if tile is not None else "block-frame", "blockId": block,
               "frameIndex": None if tile is not None else 0, "tileIndex": tile, "cellIndex": None}
    subject = f"DOS CoK {family} block {block}" + (f", tile {tile}" if tile is not None else "")
    use = f"The DOS CoK selector and consumer for {archive_name}#{block}/" + (f"tile/{tile}" if tile is not None else "frame/0") + " are not established here."
    return {
        "id": source_id(family, block, tile), "game": "cok", "edition": "DOS install", "platform": "DOS-EGA",
        "archive": {"name": archive_name, "path": archive_path.resolve().as_posix(), "sha256": archive_hash},
        "locator": locator,
        "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash, "pixelSha256": pixel_hash,
                    "width": width, "height": height},
        "identityStatus": "source-pinned",
        "description": {"text": f"{subject}; depicted subject and game use are not established here.",
                        "status": "unknown", "evidence": [{"kind": "decoded-pixels", "reference": locator_ref,
                          "note": f"Repository DOS archive SHA-256 {archive_hash}; native RGB matches the exact {SCALE}× source render."}]},
        "gameConsumers": [{"status": "unknown", "use": use,
                           "evidence": [{"kind": "decoded-pixels", "reference": locator_ref,
                                         "note": "The archive locator and pixels are pinned; selector/consumer semantics remain unknown."}]}],
        "animationGroupId": None,
    }


def decode_archives(dos_root: Path, source_root: Path, package_root: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for family, info in ARCHIVES.items():
        archive_path = safe_file(dos_root, info["name"], family)
        data = archive_path.read_bytes()
        digest = sha256(data)
        if digest != info["sha256"]:
            raise ValueError(f"{archive_path}: DAX SHA-256 differs from the pinned repository copy")
        data_base, blocks = dax_decode.parse_container(data)
        toc = [block.block_id for block in blocks]
        if len(toc) != len(info["blocks"]) or toc != info["blocks"]:
            raise ValueError(f"{archive_path}: ordered DAX TOC differs from expected roster: {toc}")
        for block in blocks:
            raw = dax_decode.decompress_block(data, data_base, block)
            if info["kind"] == "frames":
                frame = dax_decode.parse_standard_frame(raw)
                if frame is None:
                    raise ValueError(f"{family}#{block.block_id}: not a standard single-frame DAX image")
                width, height, _x, _y = frame
                pixels = bytes(dax_decode.frame_to_rgb(raw, width, height, dax_decode.FRAME_HEADER))
                items = [(None, width, height, pixels)]
            else:
                header = dax_decode.parse_ega_tile_array(raw)
                if header is None:
                    raise ValueError(f"{family}#{block.block_id}: not a fixed-size EGA tile array")
                width, height, count, header_length = header
                if count != info["count"] or (width, height) != (24, 24):
                    raise ValueError(f"{family}#{block.block_id}: unexpected tile roster or geometry {count} at {width}×{height}")
                indices = dax_decode.ega_tile_array_tiles(raw, width, height, count, header_length)
                items = [(tile, width, height, bytes(c for index in indices[tile] for c in dax_decode.EGA_PALETTE[index]))
                         for tile in range(count)]
            for tile, width, height, rgb in items:
                stem = f"{family}_{block.block_id:03d}" + (f"_tile_{tile:03d}" if tile is not None else "") + ".png"
                relative = (Path("dos_tile_render") / family / f"{family}_{block.block_id:03d}" / stem
                            if tile is not None else Path("dos_render_all") / family / stem)
                png_path = safe_file(source_root, relative.as_posix(), f"{family}#{block.block_id}/{tile}")
                png_bytes = png_path.read_bytes()
                with Image.open(png_path) as image:
                    image = image.convert("RGB")
                    if image.size != (width * SCALE, height * SCALE):
                        raise ValueError(f"{png_path}: expected RGB {width*SCALE}×{height*SCALE}")
                    reduced = image.resize((width, height), Image.Resampling.NEAREST).tobytes()
                    expanded = Image.frombytes("RGB", (width, height), rgb).resize(image.size, Image.Resampling.NEAREST)
                    if image.tobytes() != expanded.tobytes():
                        raise ValueError(f"{png_path}: full source render differs from exact nearest-neighbor DAX pixels")
                if reduced != rgb:
                    raise ValueError(f"{png_path}: exact native RGB differs from DAX decode")
                png_hash = sha256(png_bytes)
                try:
                    packaged = safe_file(package_root, f"images/{png_hash}.png",
                                         f"{family}#{block.block_id}/{tile} packaged source")
                except FileNotFoundError as exc:
                    raise ValueError(f"{png_path}: exact source PNG is absent from the generated gallery package") from exc
                if not packaged.is_file() or sha256(packaged.read_bytes()) != png_hash:
                    raise ValueError(f"{png_path}: exact source PNG is absent from the generated gallery package")
                asset = asset_record(family, block.block_id, tile, archive_path, digest, width, height,
                                     png_hash, sha256(rgb))
                result[asset["id"]] = asset
    return result


def inventory_pairs(inventory: dict[str, Any], assets: dict[str, dict[str, Any]], source_root: Path,
                    package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    alias_rows = 0
    asset_by_locator = {(row["archive"]["name"].split(".")[0].upper(), row["locator"]["blockId"], row["locator"]["tileIndex"]): row
                        for row in assets.values()}
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            family = alias.get("family")
            if alias.get("platform") != "DOS" or family not in ALIAS_FAMILY:
                continue
            alias_rows += 1
            archive_family = ALIAS_FAMILY[family]
            match = ASSET_RE.fullmatch(str(alias.get("sourceName", "")))
            if not match:
                raise ValueError(f"{pair['id']}: malformed DOS sourceName {alias.get('sourceName')!r}")
            name_family, block_text, tile_text = match.groups()
            if name_family.upper() != archive_family:
                raise ValueError(f"{pair['id']}: sourceName family conflicts with {family}")
            block = int(block_text)
            tile = int(tile_text) if tile_text is not None else None
            if tile is None:
                raw_asset = alias.get("asset")
                if raw_asset not in (None, block, f"{archive_family}_{block:03d}"):
                    raise ValueError(f"{pair['id']}: alias block conflicts with {block}")
            elif alias.get("asset") != block or alias.get("tile") != tile:
                raise ValueError(f"{pair['id']}: alias tile locator conflicts with {block}/{tile}")
            relative = (Path("dos_tile_render") / archive_family / f"{archive_family}_{block:03d}" / str(alias.get("sourceName"))
                        if tile is not None else Path("dos_render_all") / archive_family / str(alias.get("sourceName")))
            provenance = str(alias.get("sourceProvenance", "")).replace("\\", "/")
            if provenance != relative.as_posix():
                raise ValueError(f"{pair['id']}: source provenance {provenance!r} differs from {relative.as_posix()!r}")
            png_path = safe_file(source_root, relative.as_posix(), f"{pair['id']} alias")
            png_hash = sha256(png_path.read_bytes())
            if pair.get("sourceSha256") != png_hash:
                raise ValueError(f"{pair['id']}: inventory source SHA-256 differs from render")
            asset = asset_by_locator.get((archive_family, block, tile))
            if not asset or asset["decoded"]["sha256"] != png_hash:
                raise ValueError(f"{pair['id']}: alias does not resolve to a decoded archive locator")
            for side in ("source", "output"):
                image_path = safe_file(package_root, pair[side], f"{pair['id']} packaged {side}")
                if not image_path.is_file() or sha256(image_path.read_bytes()) != pair[f"{side}Sha256"]:
                    raise ValueError(f"{pair['id']}: packaged {side} image differs from inventory hash")
            prior = pairs.setdefault(pair["id"], pair)
            if prior.get("sourceSha256") != pair.get("sourceSha256") or prior.get("outputSha256") != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: duplicate gallery ID has conflicting image hashes")
            pair_sources[pair["id"]].add(asset["id"])
    if not alias_rows:
        raise ValueError("Restyle inventory contains no DOS CoK COMSPR/DUNGCOM/WILDCOM/RANDCOM/SKY aliases")
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
            "sourceAssetIds": sorted(source_ids), "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one", "prompt": prompt,
            "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
            "reviewStatus": "runtime-admitted" if pair.get("runtimeApproved") else "generated",
            "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair['id']}",
                          "note": f"Exact DOS CoK source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; source identity does not establish visual or runtime approval."}]}


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]]) -> tuple[dict[str, Any], int]:
    result = json.loads(json.dumps(registry))
    asset_map = {row["id"]: row for row in result["assets"]}
    for asset_id, incoming in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or prior.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: existing archive pin or locator conflicts")
            decoded = prior.get("decoded") or {}
            if decoded.get("sha256") not in (None, incoming["decoded"]["sha256"]):
                raise ValueError(f"{asset_id}: existing decoded source hash conflicts")
            if any(decoded.get(key) not in (None, incoming["decoded"][key]) for key in ("width", "height")):
                raise ValueError(f"{asset_id}: existing decoded geometry conflicts")
            if decoded.get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: existing decoded pixel hash conflicts")
            # Re-import refreshes verified source fields, never rebuilds an enriched record.
            # Retain ancillary top-level and nested metadata, including gallery links and reviews.
            verified = {key: incoming[key] for key in
                        ("id", "game", "edition", "platform", "archive", "locator", "decoded", "identityStatus")}
            verified["archive"] = {**prior.get("archive", {}), **incoming["archive"]}
            verified["decoded"] = {**decoded, **incoming["decoded"]}
            incoming = {**incoming, **prior, **verified}
        asset_map[asset_id] = incoming
    result["assets"] = list(asset_map.values())
    restyles = {row["id"]: row for row in result["restyles"]}
    for pair_id, pair in pairs.items():
        incoming = restyle_record(pair, pair_sources[pair_id])
        prior = restyles.get(incoming["id"])
        if prior:
            if not any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"] for out in prior.get("outputs", [])):
                raise ValueError(f"{incoming['id']}: existing output hash conflicts")
            for asset_id in prior.get("sourceAssetIds", []):
                source = asset_map.get(asset_id)
                if source is None or (source.get("decoded") or {}).get("sha256") != pair["sourceSha256"]:
                    raise ValueError(f"{incoming['id']}: existing source image hash conflicts for {asset_id}")
            source_ids = sorted(set(prior.get("sourceAssetIds", [])) | set(incoming["sourceAssetIds"]))
            prior["sourceAssetIds"] = source_ids
            prior["sourceRelation"] = "shared-output" if len(source_ids) > 1 else prior.get("sourceRelation", "one-to-one")
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
                              "reference": "tools/import_cok_dos_com_registry.py",
                              "note": f"Distinct source-qualified locators decode to identical {width}×{height} RGB SHA-256 {pixel_hash}; retain both IDs."}]})
                existing.add((from_id, to_id)); added += 1
    return result, added


def apply_visual_descriptions(registry: dict[str, Any], sources: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], package_root: Path,
                              dataset_path: Path) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply exact-source visual-only notes to the complete DOS COM archive roster."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("DOS COM visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(sources):
        raise ValueError(f"visual description roster mismatch: missing={len(set(sources)-set(by_id))}, extra={len(set(by_id)-set(sources))}")

    result = json.loads(json.dumps(registry))
    asset_map = {row["id"]: row for row in result["assets"]}
    dataset_hash = sha256(dataset_path.read_bytes())
    evidence_prefix = f"{dataset_path.as_posix()}#"
    descriptions_by_pixels: dict[tuple[int, int, str], str] = {}
    overlap_pixel_groups: set[tuple[int, int, str]] = set()
    image_root = package_root / "images"
    for asset_id, row in by_id.items():
        incoming = sources[asset_id]
        asset = asset_map.get(asset_id)
        if (asset is None or asset.get("platform") != "DOS-EGA"
                or asset.get("archive", {}).get("name", "").upper() not in {
                    "COMSPR.DAX", "DUNGCOM.DAX", "WILDCOM.DAX", "RANDCOM.DAX"
                }):
            raise ValueError(f"{asset_id}: visual description does not target a merged DOS COM source")
        decoded = asset.get("decoded") or {}
        source_hash = row.get("sourceSha256")
        pixel_hash = row.get("pixelSha256")
        visual_text = row.get("visualDescription")
        width, height = decoded.get("width"), decoded.get("height")
        if (source_hash != decoded.get("sha256") or pixel_hash != decoded.get("pixelSha256")
                or not isinstance(visual_text, str) or not visual_text.strip()
                or not isinstance(width, int) or not isinstance(height, int)):
            raise ValueError(f"{asset_id}: visual description source/file/pixel hash, dimensions, or text mismatch")
        key = (width, height, pixel_hash)
        previous_text = descriptions_by_pixels.setdefault(key, visual_text)
        if previous_text != visual_text:
            raise ValueError(f"{asset_id}: exact-pixel duplicate has conflicting visual descriptions")
        for other in result["assets"]:
            if other.get("id") == asset_id:
                continue
            other_decoded = other.get("decoded") or {}
            other_visual = (other.get("description") or {}).get("visualDescription")
            if (other_decoded.get("width") == width and other_decoded.get("height") == height
                    and other_decoded.get("pixelSha256") == pixel_hash and other_visual):
                overlap_pixel_groups.add(key)
                if other_visual != visual_text:
                    raise ValueError(f"{asset_id}: exact-pixel duplicate conflicts with existing wording on {other['id']}")

        reviews = row.get("evidence")
        if not isinstance(reviews, list) or len(reviews) != 1 or not isinstance(reviews[0], dict):
            raise ValueError(f"{asset_id}: expected exactly one visual-review evidence row")
        review = reviews[0]
        image_name = f"{source_hash}.png"
        expected_reference = f"apps/web/dist-app-cok57/restyle/cok-generated/images/{image_name}"
        if (review.get("kind") != "visual-review" or review.get("reference") != expected_reference
                or not isinstance(review.get("note"), str)
                or "visible appearance only" not in review["note"].lower()
                or source_hash not in review["note"] or pixel_hash not in review["note"]
                or "does not infer subject identity, game use, selector, or playback semantics" not in review["note"].lower()):
            raise ValueError(f"{asset_id}: visual evidence must cite exact source bytes/pixels and limit claims")
        path = safe_file(package_root, f"images/{image_name}", f"{asset_id} reviewed source preview")
        file_bytes = path.read_bytes()
        if sha256(file_bytes) != source_hash:
            raise ValueError(f"{asset_id}: reviewed PNG SHA-256 differs from the decoded source file")
        with Image.open(path) as image:
            image = image.convert("RGB")
            if image.size != (width * SCALE, height * SCALE):
                raise ValueError(f"{asset_id}: reviewed PNG must be exact {SCALE}× nearest-neighbor source render")
            native_rgb = image.resize((width, height), Image.Resampling.NEAREST).tobytes()
        if sha256(native_rgb) != pixel_hash:
            raise ValueError(f"{asset_id}: exact PNG pixels do not decode to the registered native RGB hash")

        description = asset.setdefault("description", {})
        prior_visual = description.get("visualDescription")
        if prior_visual and prior_visual != visual_text:
            raise ValueError(f"{asset_id}: existing visual description differs from the reviewed dataset")
        description["visualDescription"] = visual_text
        evidence = description.setdefault("evidence", [])
        owned = [i for i, item in enumerate(evidence) if item.get("kind") == "visual-review"
                 and str(item.get("reference", "")).startswith(evidence_prefix)]
        imported_review = {
            "kind": "visual-review", "reference": f"{evidence_prefix}{asset_id}",
            "note": f"Visible appearance manually reviewed against exact 4× source PNG SHA-256 {source_hash} and decoded {width}×{height} RGB SHA-256 {pixel_hash}; dataset SHA-256 {dataset_hash}. Subject identity, game use, selector, and playback semantics remain unproven."
        }
        if owned:
            evidence[owned[0]] = imported_review
            for i in reversed(owned[1:]):
                del evidence[i]
        else:
            evidence.append(imported_review)
    return result, {"rows": len(by_id), "uniquePixelGroups": len(descriptions_by_pixels),
                    "registryOverlapPixelGroups": len(overlap_pixel_groups)}


def validate_registry(registry: dict[str, Any]) -> None:
    errors, _warnings = graphics_asset_registry.validate(registry)
    if errors:
        raise ValueError("Merged registry validation failed: " + "; ".join(errors))


def write_registry_atomic(path: Path, registry: dict[str, Any]) -> None:
    validate_registry(registry)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=path.parent,
                                         prefix=f".{path.name}.", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(json.dumps(registry, ensure_ascii=False, indent=2) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_inventory(args.inventory)
    assets = decode_archives(args.dos_root, args.source_root, args.package_root)
    pairs, pair_sources, alias_rows = inventory_pairs(inventory, assets, args.source_root, args.package_root)
    merged, added = merge_registry(registry, assets, pairs, pair_sources)
    visual_source_assets = {asset_id: asset for asset_id, asset in assets.items()
                            if asset["archive"]["name"].upper() in {
                                "COMSPR.DAX", "DUNGCOM.DAX", "WILDCOM.DAX", "RANDCOM.DAX"
                            }}
    merged, visual_description_info = apply_visual_descriptions(
        merged, visual_source_assets, read_json(args.visual_descriptions), args.package_root, args.visual_descriptions)
    if args.write:
        write_registry_atomic(args.registry, merged)
    else:
        validate_registry(merged)
    existing_ids = {row["id"] for row in registry["assets"]}
    print(json.dumps({"verifiedSourceLocators": len(assets), "inventoryAliasRows": alias_rows,
                      "matchedSourceLocators": len({asset_id for ids in pair_sources.values() for asset_id in ids}),
                      "restyleCards": len(pairs), "newSourceIds": sum(asset_id not in existing_ids for asset_id in assets),
                      "newPixelIdenticalLinks": added, "registryAssets": len(merged["assets"]),
                      "registryRestyles": len(merged["restyles"]), "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
                      "visualDescriptions": visual_description_info,
                      "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
