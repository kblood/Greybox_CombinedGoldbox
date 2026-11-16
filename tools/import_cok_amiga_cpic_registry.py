#!/usr/bin/env python3
"""Verify Amiga CoK CPIC1/2 DAA blocks and join them to exact Restyle pairs."""

from __future__ import annotations

import argparse
import hashlib
import json
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
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/amiga_render_all/daa")
RENDER_MANIFEST_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/amiga_render_all/manifest.json")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-amiga-cpic-visual-descriptions-v1.json")

ARCHIVES = {
    "CPIC1.DAA": {"relative": "disk2/CPIC1.DAA", "sha256": "e5da65728a66d7c7ba1eb968c01a0821ee5ff13ae8a6270b6a68b0ef5607848e", "disk": 2},
    "CPIC2.DAA": {"relative": "disk3/cpic2.daa", "sha256": "38acd9a87e577e9ce619a25549cd91fcb92c3e1990a02b643cade534fe696c34", "disk": 3},
}
SCALE = 4


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def contained_file(root: Path, path: Path | str, label: str, *, allow_absolute: bool = False) -> Path:
    """Resolve a required file and reject path traversal and symlink escapes."""
    root_path = root.resolve(strict=True)
    candidate = Path(path)
    if candidate.is_absolute():
        if not allow_absolute:
            raise ValueError(f"{label}: expected a path relative to {root_path}")
        target = candidate
    else:
        if candidate.drive or candidate.root or any(part == ".." for part in candidate.parts):
            raise ValueError(f"{label}: parent traversal is not allowed")
        target = root_path / candidate
    resolved = target.resolve(strict=True)
    try:
        resolved.relative_to(root_path)
    except ValueError as exc:
        raise ValueError(f"{label}: resolved path escapes {root_path}") from exc
    if not resolved.is_file():
        raise ValueError(f"{label}: expected a file under {root_path}")
    return resolved


def contained_directory(root: Path, relative_path: Path | str, label: str) -> Path:
    """Resolve a required directory and reject traversal and symlink escapes."""
    root_path = root.resolve(strict=True)
    candidate = Path(relative_path)
    if candidate.is_absolute() or candidate.drive or candidate.root or any(part == ".." for part in candidate.parts):
        raise ValueError(f"{label}: expected a safe path relative to {root_path}")
    resolved = (root_path / candidate).resolve(strict=True)
    try:
        resolved.relative_to(root_path)
    except ValueError as exc:
        raise ValueError(f"{label}: resolved path escapes {root_path}") from exc
    if not resolved.is_dir():
        raise ValueError(f"{label}: expected a directory under {root_path}")
    return resolved


def source_id(archive: str, block_id: int) -> str:
    info = ARCHIVES[archive]
    return f"cok/amiga/disk{info['disk']}/{archive.lower()}/block/{block_id}/frame/0"


def render_rows(path: Path) -> dict[tuple[str, int], dict[str, Any]]:
    result: dict[tuple[str, int], dict[str, Any]] = {}
    for row in read_json(path).get("assets", []):
        if row.get("game") != "cok" or str(row.get("family", "")).upper() != "CPIC":
            continue
        archive = Path(str(row.get("file", ""))).name.upper()
        if archive not in ARCHIVES:
            raise ValueError(f"unsupported Amiga CPIC render archive: {archive!r}")
        try:
            block_id = int(row["block_id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"{archive}: CPIC render row has no integer block_id") from exc
        key = archive, block_id
        if key in result:
            raise ValueError(f"duplicate Amiga CPIC render locator: {key}")
        result[key] = row
    if not result:
        raise ValueError("render manifest contains no CoK Amiga CPIC rows")
    return result


def inventory_pairs(inventory: dict[str, Any]) -> dict[tuple[str, int], list[dict[str, Any]]]:
    pairs: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "Amiga" or str(alias.get("family", "")).upper() != "CPIC":
                continue
            archive = Path(str(alias.get("sourceArchive", ""))).name.upper()
            if archive not in ARCHIVES:
                raise ValueError(f"{pair.get('id')}: unsupported Amiga CPIC source archive {archive!r}")
            try:
                block_id = int(alias["asset"])
                frame = int(alias.get("frame", 0))
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"{pair.get('id')}: CPIC alias needs exact block and frame") from exc
            if frame != 0:
                raise ValueError(f"{pair.get('id')}: CPIC standard frame must use frame/0, got {frame}")
            expected_name = f"{Path(archive).stem}_{block_id:03d}.png"
            if str(alias.get("sourceName", "")).upper() != expected_name.upper():
                raise ValueError(f"{pair.get('id')}: sourceName disagrees with {archive}#{block_id}")
            pairs[(archive, block_id)].append(pair)
    if not pairs:
        raise ValueError("Restyle inventory contains no Amiga CPIC aliases")
    return pairs


def verify_source_png(path: Path, width: int, height: int, expected_rgb: bytes) -> tuple[str, str]:
    png = path.read_bytes()
    with Image.open(path) as image:
        if image.format != "PNG" or image.mode != "RGB" or image.size != (width * SCALE, height * SCALE):
            raise ValueError(f"{path}: expected RGB {width*SCALE}×{height*SCALE} PNG")
        reduced = image.resize((width, height), Image.Resampling.NEAREST)
        if reduced.tobytes() != expected_rgb:
            raise ValueError(f"{path}: exact native RGB differs from the archive decode")
    return sha256(png), sha256(expected_rgb)


def _build_assets_and_pairs(
    amiga_root: Path,
    source_root: Path,
    package_root: Path,
    inventory: dict[str, Any],
    renders: dict[tuple[str, int], dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, set[str]]]:
    aliases = inventory_pairs(inventory)
    if set(aliases) != set(renders):
        raise ValueError(f"Amiga CPIC aliases differ from render denominator (missing={sorted(set(renders)-set(aliases))}, extra={sorted(set(aliases)-set(renders))})")

    decoded: dict[tuple[str, int], dict[str, Any]] = {}
    assets: dict[str, dict[str, Any]] = {}
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    for archive, info in ARCHIVES.items():
        archive_path = contained_file(amiga_root, info["relative"], f"{archive} archive")
        archive_bytes = archive_path.read_bytes()
        archive_hash = sha256(archive_bytes)
        if archive_hash != info["sha256"]:
            raise ValueError(f"{archive_path}: DAA SHA-256 differs from source pin")
        kind, data_base, blocks = daa_decode.parse_container(archive_bytes)
        if kind != "blocks":
            raise ValueError(f"{archive_path}: expected a standard 9-byte DAA block container")
        by_id = {block.block_id: block for block in blocks}
        wanted_ids = {block_id for family, block_id in renders if family == archive}
        if len(by_id) != len(blocks) or set(by_id) != wanted_ids:
            raise ValueError(f"{archive_path}: TOC IDs differ from the full render denominator")

        for block_id in sorted(wanted_ids):
            row = renders[(archive, block_id)]
            raw = daa_decode.decompress_block(archive_bytes, data_base, by_id[block_id])
            frame = daa_decode.parse_frame_header(raw)
            if frame is None:
                raise ValueError(f"{archive}#{block_id}: not a standard Amiga image frame")
            width, height, palette, pixel_offset = frame
            expected_size = tuple(row.get("native_size", []))
            if expected_size != (width, height):
                raise ValueError(f"{archive}#{block_id}: decoded {width}×{height}, render manifest says {expected_size}")
            rgb = bytes(daa_decode.planar_frame_to_rgb(raw, width, height, palette, pixel_offset))
            png_path = contained_file(source_root, str(row.get("output", "")),
                                      f"{archive}#{block_id} render output", allow_absolute=True)
            png_hash, pixel_hash = verify_source_png(png_path, width, height, rgb)
            key = archive, block_id
            decoded[key] = {"width": width, "height": height, "rgb": rgb, "pngHash": png_hash,
                            "pixelHash": pixel_hash, "archiveHash": archive_hash, "archivePath": archive_path}
            asset_key = source_id(archive, block_id)
            assets[asset_key] = {
                "id": asset_key,
                "game": "cok",
                "edition": f"Amiga disk {info['disk']}",
                "platform": "Amiga",
                "archive": {"name": archive, "path": archive_path.as_posix(), "sha256": archive_hash},
                "locator": {"kind": "block-frame", "blockId": block_id, "frameIndex": 0,
                            "tileIndex": None, "cellIndex": None},
                "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                            "pixelSha256": pixel_hash, "width": width, "height": height},
                "identityStatus": "source-pinned",
                "description": {"text": f"Amiga {archive[:-4]} combat-art block {block_id}; depicted subject is not identified here.",
                                "status": "unknown", "evidence": [{"kind": "decoded-pixels",
                                    "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                    "note": f"Candidate-copy DAA SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}]},
                "gameConsumers": [{"status": "unknown",
                                   "use": f"The Amiga selector and in-game consumer for {archive}#{block_id} are not established here.",
                                   "evidence": [{"kind": "decoded-pixels",
                                                 "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                                 "note": "Exact archive locator and pixels are pinned; the game caller remains unknown."}]}],
                "animationGroupId": None,
            }

            for pair in aliases[key]:
                if pair.get("sourceSha256") != png_hash:
                    raise ValueError(f"{pair['id']}: inventory source hash differs from DAA-verified PNG")
                for side, expected_hash in (("source", pair["sourceSha256"]), ("output", pair["outputSha256"])):
                    file_path = contained_file(package_root, pair[side], f"{pair['id']} packaged {side}")
                    if sha256(file_path.read_bytes()) != expected_hash:
                        raise ValueError(f"{pair['id']}: packaged {side} image hash differs from inventory")
                old_pair = pairs.setdefault(pair["id"], pair)
                if old_pair.get("sourceSha256") != pair.get("sourceSha256") or old_pair.get("outputSha256") != pair.get("outputSha256"):
                    raise ValueError(f"{pair['id']}: shared gallery pair has conflicting source/output hashes")
                pair_sources[pair["id"]].add(asset_key)

    return assets, pairs, pair_sources


def _restyle_record(pair: dict[str, Any], source_ids: list[str]) -> dict[str, Any]:
    prompt_refs = pair.get("promptReferences", [])
    prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None, "textSha256": None,
              "inputPath": f"images/{pair['sourceSha256']}.png", "inputSha256": pair["sourceSha256"],
              "text": None, "references": [], "referenceAssetIds": []}
    if len(prompt_refs) == 1:
        ref = prompt_refs[0]
        prompt.update({"status": "linked-full-text", "batch": ref.get("batch"), "path": ref.get("file"),
                       "sha256": ref.get("sha256"), "text": ref.get("text")})
    return {"id": f"restyle/cok-generated/{pair['id']}",
            "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair["id"],
                                    "reference": f"restyle/cok-generated/manifest.json#{pair['id']}"}],
            "sourceAssetIds": sorted(source_ids),
            "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one",
            "prompt": prompt,
            "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
            "reviewStatus": "runtime-admitted" if pair.get("runtimeApproved") else "generated",
            "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair['id']}",
                          "note": f"Exact Amiga CPIC source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; prompt and composition review remain separate."}]}


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]],
                   pairs: dict[str, dict[str, Any]], pair_sources: dict[str, set[str]]) -> dict[str, Any]:
    result = json.loads(json.dumps(registry))
    asset_map = {row["id"]: row for row in result["assets"]}
    for asset_id, incoming in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or prior.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: archive pin or locator conflicts with verified DAA")
            if (prior.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: prior decoded pixel hash conflicts")
            incoming = {**incoming, "description": prior.get("description") or incoming["description"],
                        "gameConsumers": prior.get("gameConsumers") or incoming["gameConsumers"]}
        asset_map[asset_id] = incoming
    result["assets"] = list(asset_map.values())

    restyle_map = {row["id"]: row for row in result["restyles"]}
    for pair_id, pair in pairs.items():
        restyle = _restyle_record(pair, sorted(pair_sources[pair_id]))
        prior = restyle_map.get(restyle["id"])
        if prior:
            prior_refs = prior.get("externalReferences", [])
            if not any(ref.get("system") == "cok-restyle-inventory-v1" and ref.get("id") == pair_id for ref in prior_refs):
                prior_refs.append(restyle["externalReferences"][0])
            prior_ids = set(prior.get("sourceAssetIds", []))
            prior["sourceAssetIds"] = sorted(prior_ids | set(restyle["sourceAssetIds"]))
            prior["sourceRelation"] = "shared-output" if len(prior["sourceAssetIds"]) > 1 else prior.get("sourceRelation", "one-to-one")
            if any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"] for out in prior.get("outputs", [])):
                pass
            else:
                raise ValueError(f"{restyle['id']}: existing Restyle output conflicts with exact gallery pair")
        else:
            restyle_map[restyle["id"]] = restyle
    result["restyles"] = list(restyle_map.values())

    # Record exact duplicate Amiga frames as separate locators connected by pixel evidence.
    by_pixels: dict[str, list[str]] = defaultdict(list)
    for row in assets.values():
        by_pixels[row["decoded"]["pixelSha256"]].append(row["id"])
    links = result["crossVersionLinks"]
    existing = {(link.get("fromAssetId"), link.get("toAssetId")) for link in links}
    for ids in by_pixels.values():
        if len(ids) < 2:
            continue
        ordered = sorted(ids)
        for other in ordered[1:]:
            first = ordered[0]
            a, b = asset_map[first], asset_map[other]
            for duplicate, representative in ((a, b), (b, a)):
                duplicate["description"] = {"text": f"{duplicate['archive']['name']} block {duplicate['locator']['blockId']} has the same decoded source pixels as {representative['archive']['name']} block {representative['locator']['blockId']}; the archive locators and callers remain distinct.",
                                             "status": "verified", "evidence": [{"kind": "decoded-pixels",
                                             "reference": "tools/import_cok_amiga_cpic_registry.py",
                                             "note": f"Both DAA blocks decode to RGB pixel SHA-256 {duplicate['decoded']['pixelSha256']}."}]}
            key = first, other
            if key not in existing:
                links.append({"fromAssetId": first, "toAssetId": other, "relation": "pixel-identical",
                              "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                              "reference": "tools/import_cok_amiga_cpic_registry.py",
                              "note": f"Distinct Amiga CPIC DAA locators decode to identical row-major RGB pixel SHA-256 {a['decoded']['pixelSha256']}; keep both source IDs."}]})
                existing.add(key)
    return result


def apply_visual_descriptions(registry: dict[str, Any], sources: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply exact-source, visible-appearance-only notes to all decoded CPIC blocks."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("Amiga CPIC visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(sources):
        raise ValueError(f"visual description coverage differs from decoded CPIC blocks: missing={len(set(sources)-set(by_id))}, extra={len(set(by_id)-set(sources))}")

    result = json.loads(json.dumps(registry))
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    dataset_sha = sha256(dataset_path.read_bytes())
    evidence_ref = f"{dataset_path.as_posix()}#"
    descriptions_by_pixel: dict[str, str] = {}
    for asset_id, row in by_id.items():
        source = sources[asset_id]
        asset = asset_map.get(asset_id)
        if asset is None or asset.get("platform") != "Amiga" or asset.get("archive", {}).get("name", "").upper() not in ARCHIVES:
            raise ValueError(f"{asset_id}: visual description does not target a merged Amiga CPIC source")
        decoded = asset.get("decoded") or {}
        source_hash = row.get("sourceSha256")
        pixel_hash = row.get("pixelSha256")
        description = row.get("visualDescription")
        if source_hash != decoded.get("sha256") or pixel_hash != source.get("pixelHash") or not isinstance(description, str) or not description.strip():
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
        image_path = contained_file(image_store, image_name, f"{asset_id} reviewed source PNG")
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
    return result, {"rows": len(by_id), "uniquePixelHashes": len({row["pixelSha256"] for row in by_id.values()})}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--render-manifest", type=Path, default=RENDER_MANIFEST_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    renders = render_rows(args.render_manifest)
    assets, pairs, pair_sources = _build_assets_and_pairs(args.amiga_root, args.source_root, args.package_root, inventory, renders)
    merged = merge_registry(registry, assets, pairs, pair_sources)
    source_rows = {asset_id: {"pixelHash": asset["decoded"]["pixelSha256"]}
                   for asset_id, asset in assets.items()}
    image_store = contained_directory(args.package_root, "images", "packaged CPIC source image store")
    merged, visual_description_counts = apply_visual_descriptions(
        merged, source_rows, read_json(args.visual_descriptions), image_store, args.visual_descriptions)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"verifiedAmigaCpicSources": len(assets), "galleryPairs": len(pairs),
                      "sharedGalleryPairs": sum(len(ids) > 1 for ids in pair_sources.values()),
                      "visualDescriptionRows": visual_description_counts["rows"],
                      "visualDescriptionUniquePixels": visual_description_counts["uniquePixelHashes"],
                      "newSourceIds": sum(asset_id not in {row["id"] for row in registry["assets"]} for asset_id in assets),
                      "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
