#!/usr/bin/env python3
"""Register exact CoK DOS title/cursor/body and duplicate Amiga body archive frames."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import daa_decode  # noqa: E402
import dax_decode  # noqa: E402
import graphics_source_render  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
DOS_DEFAULT = Path("Champions of Krynn")
AMIGA_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/assets/amiga_extracted/ChampionsOfKrynn")
VISUALS_DEFAULT = Path("docs/engine/research/cok-title-body-cursor-visual-descriptions-v1.json")
SCALE = 4

ARCHIVES = {
    "title": {"platform": "DOS-EGA", "edition": "DOS install", "name": "TITLE.DAX", "relative": "TITLE.DAX",
              "sha256": "5276ba718f3c31018c25852f0b6858a292aed5a94f8bd938803961bb1ade0a00",
              "kind": "dax", "family": "TITLE", "disk": "disk1", "blocks": [1, 2, 3, 4],
              "render_dir": "dos_render_all/TITLE", "render_family": "TITLE"},
    "cursor": {"platform": "DOS-EGA", "edition": "DOS install", "name": "CURSOR.DAX", "relative": "CURSOR.DAX",
               "sha256": "0d47e2fabc26b4e4dbea63fa034ec1c075e7031401536cea5171c40bd1307c00",
               "kind": "dax", "family": "CURSOR", "disk": "disk1", "blocks": [1],
               "render_dir": "dos_render_all/CURSOR", "render_family": "CURSOR"},
    "body2": {"platform": "DOS-EGA", "edition": "DOS install", "name": "BODY2.DAX", "relative": "BODY2.DAX",
              "sha256": "7edd8e0841581b1643828a21787594f6c96dddc1718710de9a8159575bef467f",
              "kind": "dax", "family": "BODY2", "disk": "disk1", "blocks": [68],
              "render_dir": "dos_render_all/BODY2", "render_family": "BODY2"},
    "body3": {"platform": "DOS-EGA", "edition": "DOS install", "name": "BODY3.DAX", "relative": "BODY3.DAX",
              "sha256": "7edd8e0841581b1643828a21787594f6c96dddc1718710de9a8159575bef467f",
              "kind": "dax", "family": "BODY3", "disk": "disk1", "blocks": [68],
              "render_dir": "dos_render_all/BODY3", "render_family": "BODY3"},
    "amiga_body1": {"platform": "Amiga", "edition": "Amiga disk 2", "name": "BODY1.DAA", "relative": "disk2/BODY1.DAA",
                     "sha256": "dd567b695a1849bc70c9a1e9eb22f603bb70b823b78b2b0ecce645cfa290db4c",
                     "kind": "daa", "family": "BODY1", "disk": "disk2", "blocks": [68],
                     "render_dir": "amiga_render_all/daa/CoK_BODY1", "render_family": "BODY1"},
    "amiga_body2": {"platform": "Amiga", "edition": "Amiga disk 3", "name": "BODY2.DAA", "relative": "disk3/BODY2.DAA",
                     "sha256": "dd567b695a1849bc70c9a1e9eb22f603bb70b823b78b2b0ecce645cfa290db4c",
                     "kind": "daa", "family": "BODY2", "disk": "disk3", "blocks": [68],
                     "render_dir": "amiga_render_all/daa/CoK_BODY1", "render_family": "BODY1",
                     "render_source_key": "amiga_body1"},
}

ALIAS_CONFIG = {
    ("DOS", "TITLE"): "title",
    ("DOS", "CURSOR"): "cursor",
    ("DOS", "BODY2"): "body2",
    ("DOS", "BODY3"): "body3",
    ("Amiga", "BODY"): "amiga_body1",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def safe_file(root: Path, relative: str, context: str) -> Path:
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: path escapes approved root: {path}")
    return path


def source_id(key: str, block_id: int) -> str:
    info = ARCHIVES[key]
    return f"cok/{info['platform'].lower()}/{info['disk']}/{info['name'].lower()}/block/{block_id}/frame/0"


def decoded_rgb(data: bytes, base: int, block: Any, kind: str) -> tuple[int, int, bytes]:
    raw = dax_decode.decompress_block(data, base, block) if kind == "dax" else daa_decode.decompress_block(data, base, block)
    if kind == "dax":
        frame = dax_decode.parse_standard_frame(raw)
        if frame is None:
            raise ValueError(f"DAX block {block.block_id}: expected standard frame")
        width, height, _x, _y = frame
        rgb = bytes(dax_decode.frame_to_rgb(raw, width, height, dax_decode.FRAME_HEADER))
    else:
        frame = daa_decode.parse_frame_header(raw)
        if frame is None:
            raise ValueError(f"DAA block {block.block_id}: expected standard frame")
        width, height, palette, offset = frame
        rgb = bytes(daa_decode.planar_frame_to_rgb(raw, width, height, palette, offset))
    return width, height, rgb


def decode_archives(dos_root: Path, amiga_root: Path, source_root: Path,
                    package_root: Path) -> dict[str, dict[str, Any]]:
    assets: dict[str, dict[str, Any]] = {}
    archive_records: dict[str, tuple[Path, bytes, int, list[Any]]] = {}
    for key, info in ARCHIVES.items():
        root = amiga_root if info["kind"] == "daa" else dos_root
        archive_path = safe_file(root, info["relative"], key)
        data = archive_path.read_bytes()
        if sha256(data) != info["sha256"]:
            raise ValueError(f"{archive_path}: archive SHA-256 differs from pinned candidate")
        if info["kind"] == "daa":
            container, base, blocks = daa_decode.parse_container(data)
            if container != "blocks":
                raise ValueError(f"{archive_path}: expected DAA block container")
        else:
            base, blocks = dax_decode.parse_container(data)
        if [block.block_id for block in blocks] != info["blocks"]:
            raise ValueError(f"{archive_path}: ordered block roster differs from pinned roster")
        archive_records[key] = (archive_path, data, base, blocks)

    for key, info in ARCHIVES.items():
        archive_path, data, base, blocks = archive_records[key]
        render_key = info.get("render_source_key", key)
        render_info = ARCHIVES[render_key]
        for block in blocks:
            width, height, rgb = decoded_rgb(data, base, block, info["kind"])
            stem = f"{render_info['render_family']}_{block.block_id:03}.png"
            relative = f"{render_info['render_dir']}/{stem}"
            source = safe_file(source_root, relative, f"{info['name']}#{block.block_id}")
            png_bytes = source.read_bytes()
            with Image.open(source) as image:
                if image.size != (width * SCALE, height * SCALE):
                    raise ValueError(f"{source}: expected {width*SCALE}×{height*SCALE} 4× render")
                if not graphics_source_render.exact_nearest_neighbor_render(image, rgb, width, height, SCALE):
                    raise ValueError(f"{source}: full 4× render differs from decoded archive pixels")
            if key == "amiga_body2":
                peer_id = source_id("amiga_body1", block.block_id)
                peer = assets.get(peer_id)
                if not peer or peer["decoded"]["pixelSha256"] != sha256(rgb):
                    raise ValueError(f"{info['name']}#{block.block_id}: duplicate Amiga body pixels lack the disk-2 peer")
            png_hash = sha256(png_bytes)
            packaged = package_root / "images" / f"{png_hash}.png"
            if not packaged.is_file() or sha256(packaged.read_bytes()) != png_hash:
                raise ValueError(f"{source}: exact source PNG is absent from the generated inventory package")
            asset_id = source_id(key, block.block_id)
            assets[asset_id] = {
                "id": asset_id, "game": "cok", "edition": info["edition"], "platform": info["platform"],
                "archive": {"name": info["name"], "path": archive_path.resolve().as_posix(), "sha256": info["sha256"]},
                "locator": {"kind": "block-frame", "blockId": block.block_id, "frameIndex": 0,
                            "tileIndex": None, "cellIndex": None},
                "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                            "pixelSha256": sha256(rgb), "width": width, "height": height},
                "identityStatus": "source-pinned",
                "description": {"text": f"CoK {info['family']} frame {block.block_id}; assembly, selector and in-game use are not established.",
                                "status": "unknown", "evidence": [{"kind": "decoded-pixels",
                                  "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/frame/0",
                                  "note": f"Pinned archive SHA-256 {info['sha256']}; native {width}×{height} RGB matches the source render."}]},
                "gameConsumers": [{"status": "unknown", "use": f"Consumer and selection behavior for {info['name']}#{block.block_id} are not established.",
                                   "evidence": [{"kind": "decoded-pixels",
                                                 "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/frame/0",
                                                 "note": "Archive locator and decoded pixels are pinned; game-use semantics remain unknown."}]}],
                "animationGroupId": None,
            }
    return assets


def apply_visual_descriptions(assets: dict[str, dict[str, Any]], dataset: dict[str, Any], package_root: Path) -> None:
    rows = dataset.get("assets")
    if not isinstance(rows, list) or {row.get("assetId") for row in rows if isinstance(row, dict)} != set(assets):
        raise ValueError("visual observation IDs do not exactly cover the decoded source frames")
    for row in rows:
        asset = assets[row["assetId"]]
        decoded = asset["decoded"]
        if row.get("sourceSha256") != decoded["sha256"] or row.get("pixelSha256") != decoded["pixelSha256"]:
            raise ValueError(f"{asset['id']}: visual source/pixel hash mismatch")
        text, evidence = row.get("visualDescription"), row.get("evidence")
        if not isinstance(text, str) or not text.strip() or not isinstance(evidence, list) or len(evidence) != 1:
            raise ValueError(f"{asset['id']}: malformed visual observation")
        item = evidence[0]
        expected = f"{decoded['sha256']}.png"
        if (item.get("kind") != "visual-review" or Path(str(item.get("reference", ""))).name != expected
                or "visible appearance only" not in str(item.get("note", "")).lower()
                or "does not infer assembly, subject identity, game use, selector, or playback semantics" not in str(item.get("note", "")).lower()):
            raise ValueError(f"{asset['id']}: visual observation evidence is malformed or overclaims")
        image = package_root / "images" / expected
        if not image.is_file() or sha256(image.read_bytes()) != decoded["sha256"]:
            raise ValueError(f"{asset['id']}: exact reviewed source PNG is missing")
        asset["description"]["visualDescription"] = text
        asset["description"]["evidence"].append({"kind": "visual-review",
            "reference": f"{dataset.get('evidenceImagePathPattern', '')}#{asset['id']}",
            "note": f"Visible appearance only; reviewed against PNG SHA-256 {decoded['sha256']} and pixel SHA-256 {decoded['pixelSha256']}; assembly, subject identity, game use, selector and playback semantics remain unproven."})


def inventory_pairs(inventory: dict[str, Any], assets: dict[str, dict[str, Any]], source_root: Path,
                    package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    alias_rows = 0
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            key = ALIAS_CONFIG.get((alias.get("platform"), alias.get("family")))
            if key is None:
                continue
            alias_rows += 1
            info = ARCHIVES[key]
            name = str(alias.get("sourceName", ""))
            stem = Path(name).stem
            expected_stem = f"{info['family']}_{int(name.rsplit('_', 1)[-1].split('.')[0]):03}"
            if stem.upper() != expected_stem.upper():
                raise ValueError(f"{pair['id']}: unexpected {info['family']} sourceName {name!r}")
            block_id = int(name.rsplit('_', 1)[-1].split('.')[0])
            if block_id not in info["blocks"]:
                raise ValueError(f"{pair['id']}: source block outside pinned {info['name']} roster")
            asset_id = source_id(key, block_id)
            asset = assets.get(asset_id)
            if asset is None or pair.get("sourceSha256") != asset["decoded"]["sha256"]:
                raise ValueError(f"{pair['id']}: alias source hash does not match its archive frame")
            if alias.get("platform") == "Amiga":
                if alias.get("asset") != block_id or alias.get("frame") != 0 or Path(alias.get("sourceArchive", "")).name.upper() != info["name"]:
                    raise ValueError(f"{pair['id']}: Amiga locator/archive fields conflict")
            else:
                if alias.get("asset") != f"{info['family']}_{block_id:03}" or alias.get("frame") is not None:
                    raise ValueError(f"{pair['id']}: DOS locator fields conflict")
            expected_rel = f"{info['render_dir']}/{info['render_family']}_{block_id:03}.png"
            if str(alias.get("sourceProvenance", "")).replace("\\", "/") != expected_rel:
                raise ValueError(f"{pair['id']}: source provenance path differs from exact render")
            source = safe_file(source_root, expected_rel, f"{pair['id']} alias")
            if sha256(source.read_bytes()) != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: source PNG differs from inventory hash")
            for side in ("source", "output"):
                packaged = package_root / pair[side]
                if not packaged.is_file() or sha256(packaged.read_bytes()) != pair[f"{side}Sha256"]:
                    raise ValueError(f"{pair['id']}: packaged {side} hash differs from inventory")
            prior = pairs.setdefault(pair["id"], pair)
            if prior.get("sourceSha256") != pair.get("sourceSha256") or prior.get("outputSha256") != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: duplicate gallery card has conflicting hashes")
            pair_sources[pair["id"]].add(asset_id)
    if alias_rows != 8 or len(pairs) != 7:
        raise ValueError(f"expected eight aliases on seven cards, got {alias_rows}/{len(pairs)}")
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
                          "note": f"Exact source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; visual and runtime meanings remain separate."}]}


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]]) -> tuple[dict[str, Any], int]:
    result = copy.deepcopy(registry)
    asset_map = {row["id"]: row for row in result["assets"]}
    for asset_id, incoming in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or prior.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: existing archive pin or locator conflicts")
            if (prior.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: decoded source pixels conflict")
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
                raise ValueError(f"{incoming['id']}: existing Restyle output conflicts")
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
    links = {(link.get("fromAssetId"), link.get("toAssetId")) for link in result["crossVersionLinks"]}
    added = 0
    for (width, height, pixel_hash), ids in by_pixels.items():
        for source in sorted(set(ids) & set(assets)):
            for target in sorted(set(ids)):
                if source == target or (source, target) in links or (target, source) in links:
                    continue
                result["crossVersionLinks"].append({"fromAssetId": source, "toAssetId": target,
                    "relation": "pixel-identical", "confidence": "verified", "evidence": [{
                        "kind": "decoded-pixels", "reference": "tools/import_cok_title_body_cursor_registry.py",
                        "note": f"Distinct archive locators decode to identical {width}×{height} RGB SHA-256 {pixel_hash}."}]})
                links.add((source, target)); added += 1
    return result, added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_DEFAULT)
    parser.add_argument("--visuals", type=Path, default=VISUALS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    visuals = read_json(args.visuals)
    assets = decode_archives(args.dos_root, args.amiga_root, args.source_root, args.package_root)
    apply_visual_descriptions(assets, visuals, args.package_root)
    pairs, pair_sources, alias_rows = inventory_pairs(inventory, assets, args.source_root, args.package_root)
    merged, added = merge_registry(registry, assets, pairs, pair_sources)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    previous = {row["id"] for row in registry["assets"]}
    print(json.dumps({"verifiedArchiveFrames": len(assets), "visualDescriptions": len(visuals["assets"]),
                      "inventoryAliasRows": alias_rows, "restyleCards": len(pairs),
                      "newSourceIds": sum(asset_id not in previous for asset_id in assets),
                      "newPixelIdenticalLinks": added, "registryAssets": len(merged["assets"]),
                      "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
