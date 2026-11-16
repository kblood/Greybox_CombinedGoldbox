#!/usr/bin/env python3
"""Register exact whole-block DOS 8X8D tile-strip images and Restyle links."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import dax_decode  # noqa: E402
import graphics_source_render  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
DOS_DEFAULT = Path("Champions of Krynn")
SCALE = 4
ARCHIVES = {
    "8X8D1": {"disk": 1, "sha256": "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915",
              "toc": [201, 202, 203, 11, 12, 31, 32, 23], "blocks": [11, 12, 23, 31, 32, 202, 203]},
    "8X8D2": {"disk": 2, "sha256": "0ddd323d8732b5fce0a0f1fdc07f10b0a77bd3709b27d1d0c98f47f487685649",
              "toc": [51, 52, 7, 81, 82, 191, 192, 211, 212], "blocks": [7, 51, 52, 81, 82, 191, 192, 211, 212]},
    "8X8D3": {"disk": 3, "sha256": "069e54395cc51f705ec5576e9f3d29199f3baf56d5848fb2176d7395897aa2c9",
              "toc": [10, 11, 23, 13, 14, 151, 152, 171, 172], "blocks": [10, 11, 13, 14, 23, 151, 152, 171, 172]},
}
ASSET_NAME = re.compile(r"^(8X8D[123])_(\d+)\.png$", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def source_id(family: str, block_id: int) -> str:
    disk = ARCHIVES[family]["disk"]
    return f"cok/dos-ega/disk{disk}/{family.lower()}.dax/block/{block_id}/whole"


def safe_file(root: Path, relative: str, context: str) -> Path:
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: path escapes approved root: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def package_file(root: Path, relative: str, context: str) -> Path:
    """Resolve an inventory package path, requiring a clean relative file path."""
    if not isinstance(relative, str) or not relative.strip():
        raise ValueError(f"{context}: package path must be a nonempty relative file path")
    candidate = Path(relative)
    normalized = relative.replace("\\", "/")
    parts = normalized.split("/")
    if candidate.is_absolute() or candidate.drive or any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"{context}: package path must be a clean relative file path: {relative!r}")
    return safe_file(root, relative, context)


def decode_archives(dos_root: Path, source_root: Path, package_root: Path) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for family, info in ARCHIVES.items():
        archive_path = safe_file(dos_root, f"{family}.DAX", family)
        data = archive_path.read_bytes()
        if sha256(data) != info["sha256"]:
            raise ValueError(f"{archive_path}: archive hash differs from pinned source")
        base, blocks = dax_decode.parse_container(data)
        if [block.block_id for block in blocks] != info["toc"]:
            raise ValueError(f"{family}: ordered TOC differs from pin")
        by_id = {block.block_id: block for block in blocks}
        for block_id in info["blocks"]:
            block = by_id[block_id]
            raw = dax_decode.decompress_block(data, base, block)
            # Whole blocks are EGA 8x8 tile arrays (17-byte header, exact framing), not 16-px strips:
            # see docs/engine/research/cok-dos-whole-strip-decode-finding-2026-11-10.md.
            if dax_decode.parse_ega_tile_array(raw) is None:
                raise ValueError(f"{family}#{block_id}: block is not an exact-framed EGA 8×8 tile array")
            width, height, rgb = dax_decode.compose_ega_tile_array_rgb(raw, cols=2)
            if width != 16 or height < 8:
                raise ValueError(f"{family}#{block_id}: malformed whole-block tile array dimensions")
            relative = f"dos_render_all/{family}/{family}_{block_id:03}.png"
            source = safe_file(source_root, relative, f"{family}#{block_id}")
            png = source.read_bytes()
            with Image.open(source) as image:
                if image.size != (width * SCALE, height * SCALE):
                    raise ValueError(f"{source}: expected {width*SCALE}×{height*SCALE} 4× block render")
                if not graphics_source_render.exact_nearest_neighbor_render(image, rgb, width, height, SCALE):
                    raise ValueError(f"{source}: full 4× DAX strip render differs from source archive")
            png_hash = sha256(png)
            packaged = package_file(package_root, f"images/{png_hash}.png", f"{family}#{block_id} packaged render")
            if sha256(packaged.read_bytes()) != png_hash:
                raise ValueError(f"{source}: exact source image is absent from gallery package")
            asset_id = source_id(family, block_id)
            records[asset_id] = {
                "id": asset_id, "game": "cok", "edition": "DOS install", "platform": "DOS-EGA",
                "archive": {"name": f"{family}.DAX", "path": archive_path.resolve().as_posix(), "sha256": info["sha256"]},
                "locator": {"kind": "whole-image", "blockId": block_id, "frameIndex": None,
                            "tileIndex": None, "cellIndex": None},
                "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                            "pixelSha256": sha256(rgb), "width": width, "height": height},
                "identityStatus": "source-pinned",
                "description": {"text": f"Whole {width}×{height} composed EGA 8×8 tile-array image from {family} block {block_id} (tiles 2 per row, row-major); individual tile boundaries and selectors are not identified by this whole-image ID.",
                                "status": "partial", "evidence": [{"kind": "decoded-pixels",
                                  "reference": f"{archive_path.resolve().as_posix()}#{block_id}/whole",
                                  "note": f"Pinned DAX SHA-256 {info['sha256']}; the composed 2-column tile array matches the exact 4× render."}]},
                "gameConsumers": [{"status": "unknown", "use": f"The consumer and purpose of {family}#{block_id} are not established.",
                                   "evidence": [{"kind": "decoded-pixels", "reference": f"{archive_path.resolve().as_posix()}#{block_id}/whole",
                                                 "note": "This identifies the decoded archive block image only; it does not identify individual tile selectors or game use."}]}],
                "animationGroupId": None,
            }
    if len(records) != 25:
        raise ValueError(f"expected 25 Restyle-referenced tile-array blocks, got {len(records)}")
    return records


def inventory_pairs(inventory: dict[str, Any], records: dict[str, dict[str, Any]],
                    source_root: Path, package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    aliases = 0
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "DOS" or alias.get("family") not in ARCHIVES:
                continue
            name = str(alias.get("sourceName", ""))
            match = ASSET_NAME.fullmatch(name)
            if not match:
                continue
            aliases += 1
            family, block_text = match.groups()
            family = family.upper()
            block_id = int(block_text)
            if alias.get("frame") is not None or alias.get("tile") is not None:
                raise ValueError(f"{pair['id']}: whole-block preview has frame/tile selector")
            if alias.get("asset") != f"{family}_{block_id:03}":
                raise ValueError(f"{pair['id']}: whole-block locator fields disagree with sourceName")
            asset_id = source_id(family, block_id)
            asset = records.get(asset_id)
            if asset is None or pair.get("sourceSha256") != asset["decoded"]["sha256"]:
                raise ValueError(f"{pair['id']}: inventory source hash does not match exact archive block")
            relative = f"dos_render_all/{family}/{family}_{block_id:03}.png"
            if str(alias.get("sourceProvenance", "")).replace("\\", "/") != relative:
                raise ValueError(f"{pair['id']}: source render path differs from expected block image")
            source = safe_file(source_root, relative, f"{pair['id']} alias")
            if sha256(source.read_bytes()) != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: source PNG hash differs from inventory")
            for side in ("source", "output"):
                packaged = package_file(package_root, pair[side], f"{pair['id']} package {side}")
                if sha256(packaged.read_bytes()) != pair[f"{side}Sha256"]:
                    raise ValueError(f"{pair['id']}: package {side} hash differs from manifest")
            prior = pairs.setdefault(pair["id"], pair)
            if prior.get("sourceSha256") != pair.get("sourceSha256") or prior.get("outputSha256") != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: duplicate card has conflicting image hashes")
            pair_sources[pair["id"]].add(asset_id)
    if aliases != 25 or len(pairs) != 24:
        raise ValueError(f"expected 25 block aliases on 24 cards, got {aliases}/{len(pairs)}")
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
                          "note": f"Exact source/output pair {pair['sourceSha256']} → {pair['outputSha256']}; tile and gameplay meaning remain separate."}]}


STRIP_DESCRIPTION = re.compile(r"Whole \d+×\d+ decoded tile-strip image")
STRIP_EVIDENCE = "the decoded 16-pixel-wide strip matches the exact 4× render."


def _is_superseded_strip(old: dict[str, Any], incoming: dict[str, Any]) -> bool:
    """A row may be superseded only if its old decode was the 16-px strip misread (see the finding note)."""
    decoded = old.get("decoded") or {}
    return (decoded.get("width") == 16 and decoded.get("height", 0) >= 153
            and incoming["decoded"]["width"] == 16 and incoming["decoded"]["height"] >= 8)


def _restate_description(description: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """Keep the curated status and evidence; replace only the strip wording and dimensions."""
    width, height = incoming["decoded"]["width"], incoming["decoded"]["height"]
    text = STRIP_DESCRIPTION.sub(
        f"Whole {width}×{height} composed EGA 8×8 tile-array image (tiles 2 per row, row-major)",
        description.get("text", ""))
    evidence = [{**item, "note": item.get("note", "").replace("the decoded 16-pixel-wide strip",
                                                             "the composed 2-column tile array")}
                for item in description.get("evidence", [])]
    return {**description, "text": text, "evidence": evidence or incoming.get("description", {}).get("evidence", [])}


def merge_registry(registry: dict[str, Any], records: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]], supersede: bool = False) -> tuple[dict[str, Any], int]:
    result = copy.deepcopy(registry)
    assets = {row["id"]: row for row in result["assets"]}
    changed: set[str] = set()
    superseded_old: dict[str, str] = {}
    for asset_id, incoming in records.items():
        old = assets.get(asset_id)
        if old:
            if old.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or old.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: existing locator/archive conflicts")
            if (old.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                if not (supersede and _is_superseded_strip(old, incoming)):
                    raise ValueError(f"{asset_id}: existing pixel hash conflicts")
                # Superseding the misread strip: take the corrected decode and wording; keep curation fields.
                changed.add(asset_id)
                superseded_old[asset_id] = old["decoded"]["pixelSha256"]
                assets[asset_id] = {**old, "decoded": incoming["decoded"],
                                    "description": _restate_description(old.get("description", {}), incoming)}
                continue
            incoming = {**incoming, "description": old.get("description") or incoming["description"],
                        "gameConsumers": old.get("gameConsumers") or incoming["gameConsumers"],
                        "animationGroupId": old.get("animationGroupId")}
        assets[asset_id] = incoming
    if changed:
        # Amiga twins: the same archive bytes at the same block number carry the same misread strip,
        # so a twin is superseded only when its old pixel hash equals the superseded DOS row's old hash.
        for dos_id, old_pixel in list(superseded_old.items()):
            dos_row = assets[dos_id]
            for asset_id, row in list(assets.items()):
                if asset_id in changed or row.get("locator", {}).get("kind") != "whole-image":
                    continue
                if (row.get("archive", {}).get("sha256") == dos_row["archive"]["sha256"]
                        and row["locator"].get("blockId") == dos_row["locator"]["blockId"]
                        and (row.get("decoded") or {}).get("pixelSha256") == old_pixel):
                    assets[asset_id] = {**row, "decoded": dos_row["decoded"],
                                        "description": _restate_description(row.get("description", {}), {"decoded": dos_row["decoded"], "description": dos_row.get("description", {})})}
                    changed.add(asset_id)
    result["assets"] = list(assets.values())
    restyles = {row["id"]: row for row in result["restyles"]}
    for pair_id, pair in pairs.items():
        incoming = restyle_record(pair, pair_sources[pair_id])
        old = restyles.get(incoming["id"])
        if old:
            if not any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"] for out in old.get("outputs", [])):
                raise ValueError(f"{incoming['id']}: existing gallery output conflicts")
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
        image = asset.get("decoded") or {}
        if image.get("pixelSha256"):
            pixel_groups[(image.get("width"), image.get("height"), image["pixelSha256"])].append(asset["id"])
    if changed:
        result["crossVersionLinks"] = [link for link in result["crossVersionLinks"]
                                       if link.get("fromAssetId") not in changed and link.get("toAssetId") not in changed]
    existing = {(item.get("fromAssetId"), item.get("toAssetId")) for item in result["crossVersionLinks"]}
    added = 0
    for (width, height, digest), ids in pixel_groups.items():
        for source in sorted(set(ids) & (set(records) | changed)):
            for target in sorted(set(ids)):
                if source == target or (source, target) in existing or (target, source) in existing:
                    continue
                result["crossVersionLinks"].append({"fromAssetId": source, "toAssetId": target,
                    "relation": "pixel-identical", "confidence": "verified", "evidence": [{
                        "kind": "decoded-pixels", "reference": "tools/import_cok_dos_tile_block_previews_registry.py",
                        "note": f"Distinct DAX block locators decode to identical {width}×{height} RGB SHA-256 {digest}."}]})
                existing.add((source, target)); added += 1
    return result, added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--supersede-strip-decode", action="store_true",
                        help="replace the 16-px strip rows with the tile-array decode (finding 2026-11-10)")
    args = parser.parse_args()
    registry, inventory = read_json(args.registry), read_json(args.inventory)
    records = decode_archives(args.dos_root, args.source_root, args.package_root)
    pairs, pair_sources, alias_count = inventory_pairs(inventory, records, args.source_root, args.package_root)
    merged, added = merge_registry(registry, records, pairs, pair_sources, supersede=args.supersede_strip_decode)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    previous = {row["id"] for row in registry["assets"]}
    print(json.dumps({"verifiedBlockStrips": len(records), "galleryAliases": alias_count,
                      "restyleCards": len(pairs), "newSourceIds": sum(item not in previous for item in records),
                      "newPixelIdenticalLinks": added, "registryAssets": len(merged["assets"]),
                      "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
