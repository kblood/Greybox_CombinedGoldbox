#!/usr/bin/env python3
"""Register exact CoK Amiga LBM whole-image identities and their Restyle lineage."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import amiga_cokdok_render  # noqa: E402
import graphics_source_render  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
AMIGA_DEFAULT = Path("C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn")
VISUALS_DEFAULT = Path("docs/engine/research/cok-amiga-lbm-visual-descriptions-v1.json")
SCALE = 4

ASSETS = {
    "gothic": {"filename": "gothic.lbm", "disk": 1, "sha256": "7026e61d16b3a65dedb18d5c9c3609e509e1cbdd290580fddb80febd2a4a6531",
               "render": "CoK_gothic.png", "width": 128, "height": 32,
               "visual": "A pale pixel-font glyph sheet on a dark background, with letters, numerals, punctuation and arrow-like symbols arranged in rows."},
    "scrn2": {"filename": "scrn2.lbm", "disk": 1, "sha256": "02f1f3cd1933d3a41310db72d76be0845975dadea14830e0a5fc472e9ab35227",
              "render": "CoK_scrn2.png", "width": 320, "height": 200,
              "visual": "A starry blue-black scene with a pale moon, dark silhouette, jeweled crown, red roses and a long diagonal sword."},
    "text1": {"filename": "text1.lbm", "disk": 1, "sha256": "0da6825970f82dde295600a24d2cd94aa641cf73a44b14755278e50786608809",
              "render": "CoK_text1.png", "width": 240, "height": 88,
              "visual": "Ornate pink lettering reading “Champions of Krynn” over the starry moon-and-sword scene."},
    "text2": {"filename": "text2.lbm", "disk": 1, "sha256": "d86b1b4664890b7fe4b704788c19f5695075e0183d73ee4e2d06fd190aa1ccd7",
              "render": "CoK_text2.png", "width": 320, "height": 89,
              "visual": "An ornate Dragonlance wordmark with the subtitle “Fantasy Role-Playing Vol. 1” over the moonlit sword-and-roses scene."},
    "charS_disk1": {"filename": "charS.LBM", "disk": 1, "sha256": "51cfc7de6f3c8004de820ee9758eb3f785bedff6a808c21d58d0d2964b7963c3",
                    "render": "CoK_charS.png", "width": 320, "height": 200,
                    "visual": "A sprite atlas with many small, palette-limited character poses arranged in rows on a dark gray field."},
    "charS_disk2": {"filename": "charS.LBM", "disk": 2, "sha256": "51cfc7de6f3c8004de820ee9758eb3f785bedff6a808c21d58d0d2964b7963c3",
                    "render": "CoK_charS.png", "width": 320, "height": 200,
                    "visual": "A sprite atlas with many small, palette-limited character poses arranged in rows on a dark gray field."},
    "charS_disk3": {"filename": "charS.LBM", "disk": 3, "sha256": "51cfc7de6f3c8004de820ee9758eb3f785bedff6a808c21d58d0d2964b7963c3",
                    "render": "CoK_charS.png", "width": 320, "height": 200,
                    "visual": "A sprite atlas with many small, palette-limited character poses arranged in rows on a dark gray field."},
    "charT_disk1": {"filename": "charT.LBM", "disk": 1, "sha256": "e17783a48aec7d7708bc3d3af4c7cc3adc496376d11aa4cf2abbea4ac9d1ce72",
                    "render": "CoK_charT.png", "width": 320, "height": 200,
                    "visual": "A sprite atlas with rows of small fantasy figures in varied poses on a lavender-gray field, plus small glyphs near the lower right."},
    "charT_disk2": {"filename": "charT.LBM", "disk": 2, "sha256": "e17783a48aec7d7708bc3d3af4c7cc3adc496376d11aa4cf2abbea4ac9d1ce72",
                    "render": "CoK_charT.png", "width": 320, "height": 200,
                    "visual": "A sprite atlas with rows of small fantasy figures in varied poses on a lavender-gray field, plus small glyphs near the lower right."},
    "charT_disk3": {"filename": "charT.LBM", "disk": 3, "sha256": "e17783a48aec7d7708bc3d3af4c7cc3adc496376d11aa4cf2abbea4ac9d1ce72",
                    "render": "CoK_charT.png", "width": 320, "height": 200,
                    "visual": "A sprite atlas with rows of small fantasy figures in varied poses on a lavender-gray field, plus small glyphs near the lower right."},
}

ALIASES = {
    "gothic": ("gothic.lbm", "CoK_gothic.png"),
    "scrn2": ("scrn2.lbm", "CoK_scrn2.png"),
    "text1": ("text1.lbm", "CoK_text1.png"),
    "text2": ("text2.lbm", "CoK_text2.png"),
    "charS_disk1": ("charS.LBM", "CoK_charS.png"),
    "charT_disk1": ("charT.LBM", "CoK_charT.png"),
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


def source_id(info: dict[str, Any]) -> str:
    name = info["filename"].lower()
    return f"cok/amiga/disk{info['disk']}/lbm/{name}/whole"


def decode_rgb(data: bytes) -> tuple[int, int, bytes]:
    decoded = amiga_cokdok_render.decode_ilbm(data)
    if not decoded.get("body_ok"):
        raise ValueError("ILBM BODY decoded short")
    palette = np.asarray(decoded["palette"] + [(0, 0, 0)] * (256 - len(decoded["palette"])), dtype=np.uint8)
    rgb = palette[decoded["indices"]]
    return int(decoded["width"]), int(decoded["height"]), rgb.tobytes()


def decode_sources(amiga_root: Path, source_root: Path, package_root: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    canonical: dict[str, tuple[str, bytes, int, int]] = {}
    for key, info in ASSETS.items():
        archive_rel = f"disk{info['disk']}/{info['filename']}"
        archive = safe_file(amiga_root, archive_rel, key)
        data = archive.read_bytes()
        if sha256(data) != info["sha256"]:
            raise ValueError(f"{archive}: source LBM hash differs from pinned candidate")
        width, height, rgb = decode_rgb(data)
        if (width, height) != (info["width"], info["height"]):
            raise ValueError(f"{archive}: decoded dimensions {(width, height)} differ from pin")
        source_rel = f"amiga_render_all/amiga_cokdok/lbm/{info['render']}"
        source = safe_file(source_root, source_rel, key)
        png = source.read_bytes()
        with Image.open(source) as image:
            if image.size != (width * SCALE, height * SCALE):
                raise ValueError(f"{source}: expected exact 4× render")
            if not graphics_source_render.exact_nearest_neighbor_render(image, rgb, width, height, SCALE):
                raise ValueError(f"{archive}: full 4× LBM render differs from decoded source")
        if key in ("charS_disk2", "charS_disk3", "charT_disk2", "charT_disk3"):
            base_key = key.replace("disk2", "disk1").replace("disk3", "disk1")
            previous = canonical.get(base_key)
            if not previous or previous[0] != sha256(png) or previous[1] != data:
                raise ValueError(f"{archive}: duplicate character atlas bytes/render differ from disk 1")
        else:
            canonical[key] = (sha256(png), data, width, height)
        png_hash = sha256(png)
        packaged = package_root / "images" / f"{png_hash}.png"
        if not packaged.is_file() or sha256(packaged.read_bytes()) != png_hash:
            raise ValueError(f"{source}: exact source render is absent from gallery package")
        asset_id = source_id(info)
        result[asset_id] = {
            "id": asset_id, "game": "cok", "edition": f"Amiga disk {info['disk']}", "platform": "Amiga",
            "archive": {"name": info["filename"], "path": archive.resolve().as_posix(), "sha256": info["sha256"]},
            "locator": {"kind": "whole-image", "blockId": None, "frameIndex": None,
                        "tileIndex": None, "cellIndex": None},
            "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                        "pixelSha256": sha256(rgb), "width": width, "height": height},
            "identityStatus": "source-pinned",
            "description": {"text": f"CoK Amiga {info['filename']} whole-image locator; internal sprite-cell boundaries and in-game consumer are not established.",
                            "status": "unknown", "visualDescription": info["visual"],
                            "evidence": [{"kind": "decoded-pixels", "reference": f"{archive.resolve().as_posix()}#whole",
                                          "note": f"Pinned extracted LBM SHA-256 {info['sha256']}; decoded {width}×{height} RGB matches the exact 4× source render."},
                                         {"kind": "visual-review", "reference": f"{source.resolve().as_posix()}#{asset_id}",
                                          "note": f"Visible appearance only; reviewed against source PNG SHA-256 {png_hash} and pixel SHA-256 {sha256(rgb)}; cell selectors, subject identity, game use and playback semantics remain unproven."}]},
            "gameConsumers": [{"status": "unknown", "use": f"The consumer, selectors and internal-cell use for {info['filename']} are not established.",
                               "evidence": [{"kind": "decoded-pixels", "reference": f"{archive.resolve().as_posix()}#whole",
                                             "note": "Whole-image identity only; no in-game caller or internal cell roster is asserted."}]}],
            "animationGroupId": None,
        }
    return result


def inventory_pairs(inventory: dict[str, Any], records: dict[str, dict[str, Any]], source_root: Path,
                    package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    aliases = 0
    alias_key = {(info["filename"].lower(), info["render"].lower()): key for key, info in ASSETS.items() if key in ALIASES}
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "Amiga" or alias.get("family") != "LBM":
                continue
            key = alias_key.get((str(alias.get("sourceArchive", "")).lower(), str(alias.get("sourceName", "")).lower()))
            if key is None:
                continue
            aliases += 1
            info = ASSETS[key]
            asset_id = source_id(info)
            asset = records.get(asset_id)
            if asset is None or alias.get("asset") is not None or alias.get("frame") != 0 or alias.get("tile") is not None:
                raise ValueError(f"{pair['id']}: LBM alias locator fields disagree with whole-image source")
            if pair.get("sourceSha256") != asset["decoded"]["sha256"]:
                raise ValueError(f"{pair['id']}: LBM inventory hash does not match decoded archive/render")
            source_rel = f"amiga_render_all/amiga_cokdok/lbm/{info['render']}"
            if str(alias.get("sourceProvenance", "")).replace("\\", "/") != source_rel:
                raise ValueError(f"{pair['id']}: LBM source provenance path differs")
            source = safe_file(source_root, source_rel, f"{pair['id']} alias")
            if sha256(source.read_bytes()) != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: source PNG hash differs from inventory")
            for side in ("source", "output"):
                packaged = package_root / pair[side]
                if not packaged.is_file() or sha256(packaged.read_bytes()) != pair[f"{side}Sha256"]:
                    raise ValueError(f"{pair['id']}: packaged {side} hash differs from manifest")
            prior = pairs.setdefault(pair["id"], pair)
            if prior.get("sourceSha256") != pair.get("sourceSha256") or prior.get("outputSha256") != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: duplicate LBM gallery card has conflicting hashes")
            pair_sources[pair["id"]].add(asset_id)
    if aliases != 6 or len(pairs) != 6:
        raise ValueError(f"expected six exact LBM aliases/cards, got {aliases}/{len(pairs)}")
    return pairs, pair_sources, aliases


def restyle_record(pair: dict[str, Any], source_ids: set[str]) -> dict[str, Any]:
    prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None, "textSha256": None,
              "inputPath": f"images/{pair['sourceSha256']}.png", "inputSha256": pair["sourceSha256"],
              "text": None, "references": [], "referenceAssetIds": []}
    refs = pair.get("promptReferences", [])
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
                          "note": f"Exact LBM source/output pair {pair['sourceSha256']} → {pair['outputSha256']}; visual and runtime semantics are separate."}]}


def merge_registry(registry: dict[str, Any], records: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]]) -> tuple[dict[str, Any], int]:
    result = copy.deepcopy(registry)
    assets = {item["id"]: item for item in result["assets"]}
    for asset_id, incoming in records.items():
        old = assets.get(asset_id)
        if old:
            if old.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or old.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: existing LBM archive/locator conflicts")
            if (old.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: existing LBM pixels conflict")
            incoming = {**incoming, "description": old.get("description") or incoming["description"],
                        "gameConsumers": old.get("gameConsumers") or incoming["gameConsumers"],
                        "animationGroupId": old.get("animationGroupId")}
        assets[asset_id] = incoming
    result["assets"] = list(assets.values())
    restyles = {item["id"]: item for item in result["restyles"]}
    for pair_id, pair in pairs.items():
        incoming = restyle_record(pair, pair_sources[pair_id])
        old = restyles.get(incoming["id"])
        if old:
            if not any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"] for out in old.get("outputs", [])):
                raise ValueError(f"{incoming['id']}: existing LBM output conflicts")
            ids = sorted(set(old.get("sourceAssetIds", [])) | set(incoming["sourceAssetIds"]))
            old["sourceAssetIds"] = ids
            old["sourceRelation"] = "shared-output" if len(ids) > 1 else old.get("sourceRelation", "one-to-one")
            refs = old.setdefault("externalReferences", [])
            for ref in incoming["externalReferences"]:
                if ref not in refs:
                    refs.append(ref)
        else:
            restyles[incoming["id"]] = incoming
    result["restyles"] = list(restyles.values())
    pixel_groups: dict[tuple[int, int, str], list[str]] = defaultdict(list)
    for asset in result["assets"]:
        decoded = asset.get("decoded") or {}
        if decoded.get("pixelSha256"):
            pixel_groups[(decoded.get("width"), decoded.get("height"), decoded["pixelSha256"])].append(asset["id"])
    links = {(link.get("fromAssetId"), link.get("toAssetId")) for link in result["crossVersionLinks"]}
    added = 0
    for (width, height, digest), ids in pixel_groups.items():
        for source in sorted(set(ids) & set(records)):
            for target in sorted(set(ids)):
                if source == target or (source, target) in links or (target, source) in links:
                    continue
                result["crossVersionLinks"].append({"fromAssetId": source, "toAssetId": target,
                    "relation": "pixel-identical", "confidence": "verified", "evidence": [{
                        "kind": "decoded-pixels", "reference": "tools/import_cok_amiga_lbm_registry.py",
                        "note": f"Distinct Amiga LBM file locators decode to identical {width}×{height} RGB SHA-256 {digest}."}]})
                links.add((source, target)); added += 1
    return result, added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_DEFAULT)
    parser.add_argument("--visuals", type=Path, default=VISUALS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry, inventory, visuals = read_json(args.registry), read_json(args.inventory), read_json(args.visuals)
    records = decode_sources(args.amiga_root, args.source_root, args.package_root)
    apply_visuals(records, visuals)
    pairs, pair_sources, aliases = inventory_pairs(inventory, records, args.source_root, args.package_root)
    merged, added = merge_registry(registry, records, pairs, pair_sources)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    previous = {item["id"] for item in registry["assets"]}
    print(json.dumps({"verifiedLbmImages": len(records), "visualDescriptions": len(visuals["assets"]),
                      "inventoryAliases": aliases, "restyleCards": len(pairs),
                      "newSourceIds": sum(asset_id not in previous for asset_id in records),
                      "newPixelIdenticalLinks": added, "registryAssets": len(merged["assets"]),
                      "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]), "write": args.write}, indent=2))
    return 0


def apply_visuals(records: dict[str, dict[str, Any]], dataset: dict[str, Any]) -> None:
    rows = dataset.get("assets")
    if not isinstance(rows, list) or {row.get("assetId") for row in rows if isinstance(row, dict)} != set(records):
        raise ValueError("LBM visual dataset IDs do not exactly cover all registered disk locators")
    for row in rows:
        asset = records[row["assetId"]]
        if row.get("sourceSha256") != asset["decoded"]["sha256"] or row.get("pixelSha256") != asset["decoded"]["pixelSha256"]:
            raise ValueError(f"{asset['id']}: LBM visual source/pixel hashes differ")
        if row.get("visualDescription") != asset["description"].get("visualDescription"):
            raise ValueError(f"{asset['id']}: visual observation text differs from reviewed inventory")


if __name__ == "__main__":
    raise SystemExit(main())
