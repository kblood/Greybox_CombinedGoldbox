#!/usr/bin/env python3
"""Verify and merge the CoK DOS 8X8D1/2/3 tile banks into the graphics registry.

Read-only by default. Every canonical tile is decoded from its pinned DAX archive and
matched against its 4x source render. Restyle gallery cards are linked only when the
generated inventory's exact source PNG and packaged copy match that decoded tile.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import dax_decode  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
SCHEMA_DEFAULT = Path("docs/engine/research/graphics-asset-registry.schema.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
DOS_DEFAULT = Path("Champions of Krynn")
COVERAGE_DEFAULT = SOURCE_DEFAULT / "dos_tile_alias_coverage.json"
RECEIPT_DEFAULT = Path("docs/engine/research/cok-dos-tiles-decode-receipt-v1.json")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-dos-8x8d1-visual-descriptions-v1.json")
VISUAL_DESCRIPTIONS_D23_DEFAULT = Path("docs/engine/research/cok-dos-8x8d23-visual-descriptions-v1.json")
VISUAL_PREVIEW_PREFIX = "apps/web/dist-app-cok57/restyle/cok-generated/images/"
VISUAL_RENDER_ROOTS = {
    "8X8D1.DAX": SOURCE_DEFAULT / "dos_tile_render" / "8X8D1",
    "8X8D2.DAX": SOURCE_DEFAULT / "dos_tile_render" / "8X8D2",
    "8X8D3.DAX": SOURCE_DEFAULT / "dos_tile_render" / "8X8D3",
}
VISUAL_DESCRIPTION_ROSTERS = {
    "8X8D1.DAX": {"assets": 441, "tile": 433, "whole-image": 8},
    "8X8D2.DAX": {"assets": 639, "tile": 630, "whole-image": 9},
    "8X8D3.DAX": {"assets": 639, "tile": 630, "whole-image": 9},
}
SCALE = 4
COVERAGE_SHA256 = "59f9f9b6fafd64cc61efd2072bcde0ab55d0eb4e82d3967562e702d48b0377c9"

# These pins identify the current repository game-folder copies. They are not an
# independent claim about which retail installation supplied those files.
ARCHIVES = {
    "8X8D1": {
        "disk": 1,
        "sha256": "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915",
        "toc": [201, 202, 203, 11, 12, 31, 32, 23],
        "tileBlocks": 7,
        "tileCount": 433,
    },
    "8X8D2": {
        "disk": 2,
        "sha256": "0ddd323d8732b5fce0a0f1fdc07f10b0a77bd3709b27d1d0c98f47f487685649",
        "toc": [51, 52, 7, 81, 82, 191, 192, 211, 212],
        "tileBlocks": 9,
        "tileCount": 630,
    },
    "8X8D3": {
        "disk": 3,
        "sha256": "069e54395cc51f705ec5576e9f3d29199f3baf56d5848fb2176d7395897aa2c9",
        "toc": [10, 11, 23, 13, 14, 151, 152, 171, 172],
        "tileBlocks": 9,
        "tileCount": 630,
    },
}
EXPECTED_ROWS = {"8X8D1": 433, "8X8D2": 630, "8X8D3": 630}
ALIAS_KIND = "dos-tile-alias"
ASSET_NAME = re.compile(r"^(8X8D[123])_(\d+)_tile_(\d{3})\.png$", re.I)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def source_id(family: str, block_id: int, tile_index: int) -> str:
    disk = ARCHIVES[family]["disk"]
    return f"cok/dos-ega/disk{disk}/{family.lower()}.dax/block/{block_id}/tile/{tile_index}"


def indexed_rgb(indices: tuple[int, ...]) -> bytes:
    return bytes(channel for index in indices for channel in dax_decode.EGA_PALETTE[index])


def _safe_source_path(root: Path, path_text: str, context: str) -> Path:
    path = Path(path_text).resolve(strict=True)
    if not path.is_relative_to(root.resolve(strict=True)):
        raise ValueError(f"{context}: source path escapes source root: {path}")
    return path


def _safe_reference_path(path_text: str, roots: tuple[Path, ...], context: str) -> Path:
    path = Path(path_text).resolve(strict=True)
    allowed = [root.resolve(strict=True) for root in roots if root.exists()]
    if not any(path.is_relative_to(root) for root in allowed):
        raise ValueError(f"{context}: reference path is outside approved source/reference roots: {path}")
    return path


def decode_archives(dos_root: Path, coverage_path: Path, source_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    coverage_bytes = coverage_path.read_bytes()
    coverage_hash = sha256(coverage_bytes)
    if coverage_hash != COVERAGE_SHA256:
        raise ValueError(f"{coverage_path}: coverage ledger SHA-256 differs from the reviewed pin")
    coverage = json.loads(coverage_bytes.decode("utf-8"))
    if coverage.get("source_scope") != "DOS CoK individual 8X8D1/8X8D2/8X8D3 tile renders":
        raise ValueError("coverage ledger has an unexpected source scope")
    rows = coverage.get("entries")
    if not isinstance(rows, list) or len(rows) != sum(EXPECTED_ROWS.values()):
        raise ValueError(f"coverage ledger must contain {sum(EXPECTED_ROWS.values())} rows")
    if (coverage.get("total_source_tiles"), coverage.get("covered_source_tiles"), coverage.get("missing_source_tiles")) != (1693, 1693, 0):
        raise ValueError("coverage ledger top-level tile totals differ from the verified 1,693-row roster")

    records: dict[str, dict[str, Any]] = {}
    receipt_archives: dict[str, Any] = {}
    rendered_rows: dict[tuple[str, int, int], dict[str, Any]] = {}
    field_semantics: Counter[str] = Counter()
    for family, expected in ARCHIVES.items():
        archive_path = dos_root / f"{family}.DAX"
        try:
            archive_ref = archive_path.resolve(strict=True).relative_to(ROOT.resolve()).as_posix()
        except ValueError as exc:
            raise ValueError(f"{archive_path}: archive must be inside repository for portable registry paths") from exc
        data = archive_path.read_bytes()
        archive_hash = sha256(data)
        if archive_hash != expected["sha256"]:
            raise ValueError(f"{archive_path}: archive SHA-256 differs from pinned repository source")
        data_base, blocks = dax_decode.parse_container(data)
        toc = [block.block_id for block in blocks]
        if toc != expected["toc"]:
            raise ValueError(f"{family}: ordered TOC differs from pinned roster: {toc}")
        by_block: dict[int, tuple[int, list[tuple[int, ...]], int, int]] = {}
        entries_receipt = []
        tile_block_count = 0
        for block in blocks:
            raw = dax_decode.decompress_block(data, data_base, block)
            parsed = dax_decode.parse_ega_tile_array(raw)
            if parsed is None:
                entries_receipt.append({"entryIndex": block.index, "blockId": block.block_id,
                                        "rawSize": block.raw_size, "tileArray": False,
                                        "reason": "not an exact framed 8x8 tile array"})
                continue
            width, height, count, header_len = parsed
            if (width, height) != (8, 8):
                raise ValueError(f"{family} TOC entry {block.index} (#{block.block_id}) is {width}x{height}, expected 8x8")
            tiles = dax_decode.ega_tile_array_tiles(raw, width, height, count, header_len)
            if len(tiles) != count:
                raise ValueError(f"{family}#{block.block_id}: tile decoder returned an incomplete array")
            by_block[block.block_id] = (block.index, tiles, block.raw_size, block.comp_size)
            tile_block_count += 1
            entries_receipt.append({"entryIndex": block.index, "blockId": block.block_id,
                                    "rawSize": block.raw_size, "compressedSize": block.comp_size,
                                    "tileArray": True, "width": width, "height": height,
                                    "tileCount": count})
        if tile_block_count != expected["tileBlocks"] or sum(len(item[1]) for item in by_block.values()) != expected["tileCount"]:
            raise ValueError(f"{family}: decoded tile blocks/count differ from pinned roster")
        receipt_archives[family] = {"path": archive_ref, "sha256": archive_hash,
                                    "byteLength": len(data), "dataBase": data_base,
                                    "orderedTocBlockIds": toc, "entryCount": len(blocks),
                                    "tileBlockCount": tile_block_count,
                                    "tileCount": sum(len(item[1]) for item in by_block.values()),
                                    "entries": entries_receipt}

        family_rows = [row for row in rows if row.get("family") == family]
        if len(family_rows) != EXPECTED_ROWS[family]:
            raise ValueError(f"{family}: coverage ledger row count differs from {EXPECTED_ROWS[family]}")
        seen: set[tuple[int, int]] = set()
        for row in family_rows:
            block_id, tile_index = row.get("block"), row.get("tile_index")
            if not isinstance(block_id, int) or not isinstance(tile_index, int):
                raise ValueError(f"{family}: block and tile_index must be integers")
            key = (block_id, tile_index)
            if key in seen:
                raise ValueError(f"{family}: duplicate tile locator {key}")
            seen.add(key)
            block = by_block.get(block_id)
            if block is None or tile_index < 0 or tile_index >= len(block[1]):
                raise ValueError(f"{family}#{block_id}/tile/{tile_index}: coverage locator is not in DAX")
            source_path = _safe_source_path(source_root, row.get("source", ""), f"{family}#{block_id}/tile/{tile_index}")
            with Image.open(source_path) as opened:
                image = opened.convert("RGB")
                if image.size != (32, 32) or row.get("source_size") != [32, 32]:
                    raise ValueError(f"{source_path}: source render must be exact 32x32 (4x native tile)")
                rgb32 = image.tobytes()
                rgb8 = image.resize((8, 8), Image.Resampling.NEAREST).tobytes()
            decoded_rgb = indexed_rgb(block[1][tile_index])
            if rgb8 != decoded_rgb:
                raise ValueError(f"{source_path}: 4x render pixels differ from {family}#{block_id}/tile/{tile_index}")
            claimed = row.get("logical_pixel_sha256")
            if claimed == sha256(rgb8):
                field_semantics["native-8x8-rgb"] += 1
            elif claimed == sha256(rgb32):
                field_semantics["upscaled-32x32-rgb"] += 1
            else:
                raise ValueError(f"{source_path}: external logical_pixel_sha256 matches neither native nor rendered RGB")
            source_bytes = source_path.read_bytes()
            output_path = _safe_source_path(source_root, row.get("restyle_output", ""),
                                           f"{family}#{block_id}/tile/{tile_index} Restyle output")
            output_bytes = output_path.read_bytes()
            with Image.open(output_path) as output_image:
                output_size = list(output_image.size)
            if output_size != row.get("output_size"):
                raise ValueError(f"{output_path}: output dimensions differ from coverage ledger")
            restyle_source_path = None
            restyle_source_sha256 = None
            if row.get("restyle_source"):
                restyle_source_path = _safe_reference_path(
                    row["restyle_source"], (source_root, Path.home() / ".codex" / "generated_images"),
                    f"{family}#{block_id}/tile/{tile_index} Restyle source")
                restyle_source_bytes = restyle_source_path.read_bytes()
                with Image.open(restyle_source_path) as opened:
                    restyle_source_image = opened.convert("RGB")
                    if row.get("restyle_alias_family"):
                        if (restyle_source_image.width % 8 or restyle_source_image.height % 8
                                or restyle_source_image.width // 8 not in (SCALE, 8)
                                or restyle_source_image.height // 8 not in (SCALE, 8)
                                or restyle_source_image.resize((8, 8), Image.Resampling.NEAREST).tobytes() != decoded_rgb):
                            raise ValueError(f"{restyle_source_path}: cross-platform Restyle source is not exact native tile RGB")
                restyle_source_sha256 = sha256(restyle_source_bytes)
            asset_id = source_id(family, block_id, tile_index)
            if asset_id in records:
                raise ValueError(f"duplicate canonical source ID {asset_id}")
            records[asset_id] = {
                "id": asset_id, "family": family, "blockId": block_id, "tileIndex": tile_index,
                "tocEntryIndex": block[0], "width": 8, "height": 8,
                "rgb": decoded_rgb, "pixelSha256": sha256(decoded_rgb),
                "sourcePngSha256": sha256(source_bytes), "sourcePngPath": source_path,
                "sourcePngSize": [32, 32], "archiveSha256": archive_hash,
                "archivePath": archive_ref, "coverageStatus": row.get("status"),
                "restyleSourcePath": restyle_source_path,
                "restyleSourceSha256": restyle_source_sha256,
                "restyleOutputPath": output_path,
                "restyleOutputSha256": sha256(output_bytes),
                "restyleOutputSize": output_size,
            }
            rendered_rows[(family, block_id, tile_index)] = row
        expected_locators = {(block_id, tile_index) for block_id, (_, tiles, _, _) in by_block.items()
                             for tile_index in range(len(tiles))}
        if seen != expected_locators:
            raise ValueError(f"{family}: ledger/DAX locator sets differ (missing={len(expected_locators-seen)}, extra={len(seen-expected_locators)})")
    return records, {"archives": receipt_archives, "coverageSha256": coverage_hash,
                     "coverageRowCount": len(rows), "coveragePixelHashFieldSemantics": dict(field_semantics),
                     "coverageRows": rendered_rows}


def match_inventory(inventory: dict[str, Any], source_root: Path, package_root: Path,
                    records: dict[str, dict[str, Any]], coverage_rows: dict[tuple[str, int, int], dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[tuple[str, int, int], str]]:
    pairs = {item["id"]: item for item in inventory.get("assets", [])}
    by_locator: dict[tuple[str, int, int], str] = {}
    alias_count = 0
    saw_aliases: set[tuple[str, int, int]] = set()
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("ledgerKind") != ALIAS_KIND:
                continue
            alias_count += 1
            family = str(alias.get("family", "")).upper()
            if family not in ARCHIVES or alias.get("platform") != "DOS CoK":
                raise ValueError(f"{pair['id']}: unexpected DOS tile alias family/platform {family}/{alias.get('platform')}")
            match = ASSET_NAME.fullmatch(str(alias.get("sourceName", "")))
            if not match:
                raise ValueError(f"{pair['id']}: invalid sourceName {alias.get('sourceName')!r}")
            name_family, block_text, tile_text = match.groups()
            block_id, tile_index = int(block_text), int(tile_text)
            if name_family.upper() != family or alias.get("asset") != block_id or alias.get("tile") != tile_index:
                raise ValueError(f"{pair['id']}: alias fields conflict with sourceName")
            key = (family, block_id, tile_index)
            if key not in coverage_rows:
                raise ValueError(f"{pair['id']}: tile alias points outside exact DAX/coverage roster: {key}")
            if key in by_locator:
                raise ValueError(f"multiple gallery cards claim the same DOS tile locator {key}")
            source = records[source_id(family, block_id, tile_index)]
            row = coverage_rows[key]
            alias_path = alias.get("sourceProvenance")
            if not isinstance(alias_path, str) or not alias_path:
                raise ValueError(f"{pair['id']}: sourceProvenance is missing")
            expected_path = source["sourcePngPath"].relative_to(source_root.resolve(strict=True)).as_posix()
            if Path(alias_path.replace("\\", "/")).as_posix() != expected_path:
                raise ValueError(f"{pair['id']}: alias sourceProvenance differs from coverage render path")
            # The pair's own source may be an Amiga rendering of the same exact 8x8 cell.
            # The alias carries a separate DOS source path, so verify each file independently
            # and compare both images to the decoded native DAX pixels instead of demanding
            # that their encoded PNG bytes or dimensions be equal.
            if sha256(source["sourcePngPath"].read_bytes()) != source["sourcePngSha256"]:
                raise ValueError(f"{pair['id']}: DOS source render hash changed after DAX verification")
            if source["restyleSourcePath"] is None:
                raise ValueError(f"{pair['id']}: gallery alias lacks the exact Restyle source image from coverage evidence")
            if not row.get("restyle_alias_family"):
                raise ValueError(f"{pair['id']}: inventory alias does not identify a cross-platform source chain")
            if source["restyleSourceSha256"] != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: coverage Restyle source hash differs from generated inventory")
            package_path = (package_root / pair["source"]).resolve(strict=True)
            if not package_path.is_relative_to(package_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: package source path escapes inventory package")
            source_hash = sha256(package_path.read_bytes())
            if source_hash != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: packaged source hash differs from generated inventory")
            with Image.open(package_path) as opened:
                package_image = opened.convert("RGB")
                if (package_image.width % 8 or package_image.height % 8
                        or package_image.width // 8 not in (SCALE, 8)
                        or package_image.height // 8 not in (SCALE, 8)
                        or package_image.resize((8, 8), Image.Resampling.NEAREST).tobytes() != source["rgb"]):
                    raise ValueError(f"{pair['id']}: packaged source pixels fail exact native DAX tile equality")
            output_hash = pair.get("outputSha256")
            if not isinstance(output_hash, str) or len(output_hash) != 64:
                raise ValueError(f"{pair['id']}: missing output SHA-256")
            output_path = (package_root / pair["output"]).resolve(strict=True)
            if not output_path.is_relative_to(package_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: package output path escapes inventory package")
            if sha256(output_path.read_bytes()) != output_hash:
                raise ValueError(f"{pair['id']}: packaged output hash differs from manifest")
            if source["restyleOutputSha256"] != output_hash:
                raise ValueError(f"{pair['id']}: coverage output hash differs from generated inventory")
            by_locator[key] = pair["id"]
            saw_aliases.add(key)
    if alias_count != 1599:
        raise ValueError(f"expected 1,599 DOS 8X8D gallery aliases, got {alias_count}")
    if len(saw_aliases) != 1599:
        raise ValueError(f"expected 1,599 unique DOS tile alias locators, got {len(saw_aliases)}")
    return pairs, by_locator


def make_asset(source: dict[str, Any], previous: dict[str, Any] | None,
               gallery_source_sha256: str | None = None) -> dict[str, Any]:
    family, block_id, tile_index = source["family"], source["blockId"], source["tileIndex"]
    asset = {
        "id": source["id"], "game": "cok", "edition": "DOS install", "platform": "DOS-EGA",
        "archive": {"name": f"{family}.DAX", "path": source["archivePath"], "sha256": source["archiveSha256"]},
        "locator": {"kind": "tile", "blockId": block_id, "entryIndex": None, "frameIndex": None,
                    "tileIndex": tile_index, "cellIndex": None},
        "decoded": {"path": f"images/{gallery_source_sha256 or source['sourcePngSha256']}.png",
                    "sha256": gallery_source_sha256 or source["sourcePngSha256"], "pixelSha256": source["pixelSha256"],
                    "width": 8, "height": 8},
        "identityStatus": "source-pinned",
        "description": {"text": f"DOS {family} block {block_id} tile {tile_index}; depicted content and exact game role are not yet identified.",
                        "status": "unknown",
                        "evidence": [{"kind": "decoded-pixels", "reference": f"{source['archivePath']}#{block_id}/tile/{tile_index}",
                                      "note": f"Pinned archive SHA-256 {source['archiveSha256']}; native 8×8 EGA RGB is exact and the 32×32 source render is a 4× nearest-neighbor match."}]},
        "gameConsumers": [{"status": "unknown", "use": "The exact tile selector and in-game use are not mapped by this source identity import.",
                           "evidence": [{"kind": "decoded-pixels", "reference": f"{source['archivePath']}#{block_id}/tile/{tile_index}",
                                         "note": "Archive decoding establishes the stored tile locator, not its consumer or screen position."}]}],
        "animationGroupId": None,
    }
    if previous:
        prev_decoded = previous.get("decoded") or {}
        if prev_decoded.get("pixelSha256") not in (None, source["pixelSha256"]):
            raise ValueError(f"{source['id']}: previous registry pixel hash conflicts with DAX decode")
        for field in ("identityStatus", "description", "gameConsumers"):
            if previous.get(field):
                asset[field] = previous[field]
        if prev_decoded.get("sha256") not in (None, asset["decoded"]["sha256"], source["sourcePngSha256"]):
            raise ValueError(f"{source['id']}: previous registered source PNG hash conflicts")
    return asset


def make_restyle(item: dict[str, Any], source_ids: list[str]) -> dict[str, Any]:
    refs = item.get("promptReferences", [])
    if len(refs) == 1:
        ref = refs[0]
        prompt = {"status": "linked-full-text" if ref.get("text") else "linked-hash-only",
                  "batch": ref.get("batch"), "path": ref.get("file"), "sha256": ref.get("sha256"),
                  "textSha256": ref.get("sha256"), "inputPath": f"images/{ref.get('inputSha256')}.png" if ref.get("inputSha256") else None,
                  "inputSha256": ref.get("inputSha256"), "text": ref.get("text"), "references": [], "referenceAssetIds": []}
    else:
        prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None,
                  "textSha256": None, "inputPath": None, "inputSha256": None, "text": None,
                  "references": [], "referenceAssetIds": []}
    return {
        "id": f"restyle/cok-generated/{item['id']}",
        "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": item["id"],
                                "reference": f"restyle/cok-generated/manifest.json#{item['id']}"}],
        "sourceAssetIds": sorted(source_ids),
        "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one",
        "prompt": prompt,
        "outputs": [{"path": f"images/{item['outputSha256']}.png", "sha256": item["outputSha256"], "role": "gallery-copy"}],
        # The inventory's boolean is not admission evidence. Existing independently reviewed
        # statuses are preserved by merge_registry; newly imported pairs stay generated.
        "reviewStatus": "generated",
        "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{item['id']}",
                      "note": f"Exact Restyle pair hashes {item['sourceSha256']} → {item['outputSha256']}; source pixels were verified against the pinned DOS DAX tile."}],
    }


def merge_registry(registry: dict[str, Any], pairs: dict[str, dict[str, Any]],
                   records: dict[str, dict[str, Any]], by_locator: dict[tuple[str, int, int], str]) -> dict[str, Any]:
    prior_assets = {asset["id"]: asset for asset in registry["assets"]}
    gallery_hash_by_source: dict[str, str] = {}
    for (family, block_id, tile_index), pair_id in by_locator.items():
        gallery_hash_by_source[source_id(family, block_id, tile_index)] = pairs[pair_id]["sourceSha256"]
    new_assets = [make_asset(source, prior_assets.get(asset_id), gallery_hash_by_source.get(asset_id))
                  for asset_id, source in records.items()]
    target_ids = set(records)
    registry["assets"] = [asset for asset in registry["assets"] if asset["id"] not in target_ids] + new_assets

    pair_source_ids: dict[str, list[str]] = defaultdict(list)
    for (family, block_id, tile_index), pair_id in by_locator.items():
        pair_source_ids[pair_id].append(source_id(family, block_id, tile_index))
    by_external_id: dict[str, dict[str, Any]] = {}
    for restyle in registry["restyles"]:
        for reference in restyle.get("externalReferences", []):
            if reference.get("system") == "cok-restyle-inventory-v1":
                by_external_id[reference["id"]] = restyle
    for pair_id, source_ids in sorted(pair_source_ids.items()):
        incoming = make_restyle(pairs[pair_id], source_ids)
        existing = by_external_id.get(pair_id)
        if existing is None:
            registry["restyles"].append(incoming)
            by_external_id[pair_id] = incoming
            continue
        existing_output_hashes = {output.get("sha256") for output in existing.get("outputs", [])}
        if incoming["outputs"][0]["sha256"] not in existing_output_hashes:
            raise ValueError(f"{pair_id}: existing Restyle output conflicts with generated inventory")
        existing["sourceAssetIds"] = sorted(set(existing.get("sourceAssetIds", [])) | set(source_ids))
        if len(existing["sourceAssetIds"]) > 1:
            existing["sourceRelation"] = "shared-output"
    # Rebuild duplicate-pixel links from the complete tile roster while preserving unrelated links.
    pixel_groups: dict[tuple[int, int, str], list[str]] = defaultdict(list)
    for source in records.values():
        pixel_groups[(source["width"], source["height"], source["pixelSha256"])].append(source["id"])
    existing_pairs = {tuple(sorted((link["fromAssetId"], link["toAssetId"]))) for link in registry["crossVersionLinks"]}
    for (_width, _height, pixel_hash), ids in pixel_groups.items():
        ordered = sorted(ids)
        for target in ordered[1:]:
            pair = tuple(sorted((ordered[0], target)))
            if pair in existing_pairs:
                continue
            registry["crossVersionLinks"].append({
                "fromAssetId": pair[0], "toAssetId": pair[1], "relation": "pixel-identical", "confidence": "verified",
                "evidence": [{"kind": "decoded-pixels", "reference": "tools/dax_decode.py + Champions of Krynn/8X8D1/2/3.DAX",
                              "note": f"Exact native row-major 8×8 EGA RGB equality; source archive/tile IDs remain distinct. Pixel SHA-256 {pixel_hash}."}],
            })
            existing_pairs.add(pair)
    return registry


def apply_visual_descriptions(registry: dict[str, Any], dataset_path: Path,
                              package_root: Path) -> dict[str, int]:
    """Apply a complete source-pinned visual-description dataset for DOS tile archives.

    Each dataset declares its exact ``archiveFamilies`` roster. All asset identities,
    source and pixel hashes, visual evidence paths, PNG bytes and decoded RGB bytes are
    checked. Non-packaged PNGs are allowed only from the matching archive's source-render
    directory. Existing exact-pixel wording is canonical and must be reused.
    """
    dataset = read_json(dataset_path)
    if dataset.get("version") != 1:
        raise ValueError(f"{dataset_path}: visual description dataset version must be 1")
    if dataset.get("evidenceImagePathPattern") != VISUAL_PREVIEW_PREFIX + "{sourceSha256}.png":
        raise ValueError(f"{dataset_path}: unexpected visual evidence image path pattern")
    families = dataset.get("archiveFamilies")
    if (not isinstance(families, list) or not families
            or any(family not in VISUAL_DESCRIPTION_ROSTERS for family in families)
            or len(set(families)) != len(families)):
        raise ValueError(f"{dataset_path}: archiveFamilies must list unique supported DOS 8X8D archive names")
    families = set(families)
    expected_roster = {family: VISUAL_DESCRIPTION_ROSTERS[family] for family in families}
    rows = dataset.get("assets")
    if not isinstance(rows, list):
        raise ValueError(f"{dataset_path}: assets must be a list")

    targets = {
        asset["id"]: asset for asset in registry.get("assets", [])
        if asset.get("platform") == "DOS-EGA"
        and asset.get("archive", {}).get("name", "").upper() in families
        and asset.get("locator", {}).get("kind") in {"tile", "whole-image"}
    }
    for family, roster in expected_roster.items():
        family_targets = [asset for asset in targets.values()
                          if asset.get("archive", {}).get("name", "").upper() == family]
        if len(family_targets) != roster["assets"]:
            raise ValueError(f"expected {roster['assets']} {family} tile/whole IDs, got {len(family_targets)}")
        for kind in ("tile", "whole-image"):
            actual = sum(asset.get("locator", {}).get("kind") == kind for asset in family_targets)
            if actual != roster[kind]:
                raise ValueError(f"expected {roster[kind]} {family} {kind} IDs, got {actual}")
    if not targets:
        raise ValueError(f"{dataset_path}: declared archiveFamilies resolve to no DOS tile sources")
    target_ids = set(targets)
    canonical_wording: dict[tuple[int, int, str], set[str]] = defaultdict(set)
    for asset in registry.get("assets", []):
        if asset.get("id") in target_ids:
            continue
        decoded = asset.get("decoded")
        if not isinstance(decoded, dict):
            decoded = {}
        existing_description = asset.get("description", {}).get("visualDescription")
        if existing_description and all(isinstance(decoded.get(field), int) for field in ("width", "height")):
            pixel_hash = decoded.get("pixelSha256")
            if isinstance(pixel_hash, str):
                canonical_wording[(decoded["width"], decoded["height"], pixel_hash)].add(existing_description)
    conflicts = [key for key, wordings in canonical_wording.items() if len(wordings) > 1]
    if conflicts:
        raise ValueError(f"registry already has conflicting visual wording for {len(conflicts)} exact pixel identities")
    seen: set[str] = set()
    wording_by_pixels: dict[tuple[int, int, str], str] = {}
    package_root = package_root.resolve(strict=True)
    reference_roots = (package_root / "images", *(VISUAL_RENDER_ROOTS[family] for family in families))
    for row in rows:
        asset_id = row.get("assetId")
        if not isinstance(asset_id, str) or asset_id not in targets:
            raise ValueError(f"{dataset_path}: unexpected visual-description asset ID {asset_id!r}")
        if asset_id in seen:
            raise ValueError(f"{dataset_path}: duplicate visual-description asset ID {asset_id}")
        seen.add(asset_id)
        asset = targets[asset_id]
        archive_name = asset.get("archive", {}).get("name", "").upper()
        if archive_name not in families:
            raise ValueError(f"{asset_id}: source archive is outside dataset archiveFamilies")
        decoded = asset.get("decoded")
        if not isinstance(decoded, dict):
            decoded = {}
        source_hash = row.get("sourceSha256")
        pixel_hash = row.get("pixelSha256")
        if source_hash != decoded.get("sha256") or pixel_hash != decoded.get("pixelSha256"):
            raise ValueError(f"{asset_id}: description source/pixel hashes differ from the registry")
        description = row.get("visualDescription")
        if not isinstance(description, str) or not description.strip():
            raise ValueError(f"{asset_id}: visualDescription must be nonempty text")
        width, height = decoded.get("width"), decoded.get("height")
        if not isinstance(width, int) or not isinstance(height, int):
            raise ValueError(f"{asset_id}: registry decoded dimensions are invalid")
        pixel_key = (width, height, pixel_hash)
        canonical = canonical_wording.get(pixel_key, set())
        if canonical and description not in canonical:
            raise ValueError(f"{asset_id}: visualDescription differs from the existing wording for identical decoded pixels")
        prior_wording = wording_by_pixels.setdefault(pixel_key, description)
        if prior_wording != description:
            raise ValueError(f"{asset_id}: duplicate pixel SHA-256 has inconsistent wording")
        evidence = row.get("evidence")
        if not isinstance(evidence, list) or len(evidence) != 1 or evidence[0].get("kind") != "visual-review":
            raise ValueError(f"{asset_id}: exactly one visual-review evidence item is required")
        item = evidence[0]
        reference = item.get("reference")
        note = item.get("note", "")
        if "Visible appearance only" not in note or "does not infer subject identity, game use, selector, or playback semantics" not in note:
            raise ValueError(f"{asset_id}: visual-review note must limit claims to visible appearance")
        if isinstance(reference, str) and reference.startswith(VISUAL_PREVIEW_PREFIX):
            expected_reference = VISUAL_PREVIEW_PREFIX + source_hash + ".png"
            if reference != expected_reference:
                raise ValueError(f"{asset_id}: packaged evidence reference differs from source hash")
            resolved_images = (package_root / "images").resolve(strict=True)
            if not resolved_images.is_relative_to(package_root):
                raise ValueError(f"{asset_id}: packaged evidence images directory escapes the package root")
            image_path = (resolved_images / f"{source_hash}.png").resolve(strict=True)
            if not image_path.is_relative_to(resolved_images):
                raise ValueError(f"{asset_id}: packaged evidence image escapes the package images directory")
            if not image_path.is_file():
                raise FileNotFoundError(image_path)
        else:
            image_path = _safe_reference_path(
                str(reference), reference_roots, f"{asset_id} visual-review evidence")
            family_render_root = VISUAL_RENDER_ROOTS[archive_name].resolve(strict=True)
            if not image_path.is_relative_to(family_render_root):
                raise ValueError(f"{asset_id}: non-packaged evidence is outside the approved {archive_name} source-render directory")
        image_bytes = image_path.read_bytes()
        if sha256(image_bytes) != source_hash:
            raise ValueError(f"{asset_id}: visual evidence PNG SHA-256 differs from sourceSha256")
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
            width, height = decoded.get("width"), decoded.get("height")
            if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
                raise ValueError(f"{asset_id}: registry decoded dimensions are invalid")
            if image.size != (width, height):
                if (image.width % width or image.height % height
                        or image.width // width != image.height // height):
                    raise ValueError(f"{asset_id}: evidence dimensions do not match decoded image dimensions")
                image = image.resize((width, height), Image.Resampling.NEAREST)
            if sha256(image.tobytes()) != pixel_hash:
                raise ValueError(f"{asset_id}: visual evidence RGB differs from decoded pixel SHA-256")
        registry_description = asset.setdefault("description", {})
        prior_description = registry_description.get("visualDescription")
        if prior_description not in (None, description) and not canonical:
            raise ValueError(f"{asset_id}: existing visualDescription conflicts with the reviewed dataset")
        registry_description["visualDescription"] = description
        registry_evidence = registry_description.setdefault("evidence", [])
        visual_evidence = {"kind": item["kind"], "reference": reference, "note": note}
        matching_indices = [index for index, existing in enumerate(registry_evidence)
                            if existing.get("kind") == "visual-review" and existing.get("reference") == reference]
        if matching_indices:
            registry_evidence[matching_indices[0]] = visual_evidence
            for index in reversed(matching_indices[1:]):
                del registry_evidence[index]
        else:
            registry_evidence.append(visual_evidence)
    if seen != set(targets):
        raise ValueError(f"{dataset_path}: visual-description ID set differs from the {len(targets)} registry targets (missing={len(set(targets) - seen)}, extra={len(seen - set(targets))})")
    return {"assets": len(rows), "tileAssets": sum(targets[asset_id]["locator"]["kind"] == "tile" for asset_id in seen),
            "wholeAssets": sum(targets[asset_id]["locator"]["kind"] == "whole-image" for asset_id in seen),
            "uniquePixelDescriptions": len(wording_by_pixels),
            "registryOverlapPixelIdentities": sum(key in canonical_wording for key in wording_by_pixels)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--coverage", type=Path, default=COVERAGE_DEFAULT)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--schema", type=Path, default=SCHEMA_DEFAULT)
    parser.add_argument("--receipt", type=Path, default=RECEIPT_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--visual-descriptions-d23", type=Path, default=VISUAL_DESCRIPTIONS_D23_DEFAULT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--write", action="store_true", help="write registry and receipt (default is read-only)")
    args = parser.parse_args()

    source_root = args.source_root.resolve(strict=True)
    coverage = read_json(args.coverage)
    records, decode_info = decode_archives(args.dos_root.resolve(strict=True), args.coverage.resolve(strict=True), source_root)
    inventory_bytes = args.inventory.read_bytes()
    inventory = json.loads(inventory_bytes.decode("utf-8"))
    registry = read_json(args.registry)
    pairs, by_locator = match_inventory(inventory, source_root, args.package.resolve(strict=True), records, decode_info["coverageRows"])
    merged = merge_registry(registry, pairs, records, by_locator)
    visual_description_d1 = apply_visual_descriptions(merged, args.visual_descriptions, args.package)
    visual_description_d23 = apply_visual_descriptions(merged, args.visual_descriptions_d23, args.package)
    visual_description_info = {
        "datasets": [
            {"path": str(args.visual_descriptions), **visual_description_d1},
            {"path": str(args.visual_descriptions_d23), **visual_description_d23},
        ],
        "assets": visual_description_d1["assets"] + visual_description_d23["assets"],
        "tileAssets": visual_description_d1["tileAssets"] + visual_description_d23["tileAssets"],
        "wholeAssets": visual_description_d1["wholeAssets"] + visual_description_d23["wholeAssets"],
    }
    from graphics_asset_registry import validate
    from import_cok_amiga_sprit_registry import validate_evidence_kinds
    errors, warnings = validate(merged)
    if errors:
        raise ValueError("merged registry validation failed: " + "; ".join(errors[:12]))
    validate_evidence_kinds(merged, args.schema)
    alias_ids = set(by_locator)
    coverage_rows = decode_info["coverageRows"]
    unhashed_preview_ids = [source_id(*key) for key in coverage_rows if key not in alias_ids]
    unique_pixel_patterns = len({source["pixelSha256"] for source in records.values()})
    if unique_pixel_patterns != coverage.get("unique_logical_patterns"):
        raise ValueError(f"coverage unique logical pattern count {coverage.get('unique_logical_patterns')} differs from decoded count {unique_pixel_patterns}")
    packaged_tile_preview_count = sum(
        (args.package / "images" / f"{records[asset_id]['sourcePngSha256']}.png").is_file()
        for asset_id in unhashed_preview_ids
    )
    output = args.output or args.registry
    receipt = {
        "schema": "cok-dos-tiles-decode-receipt-v1",
        "provenance": "Repository game-folder archive copies and local tile-render coverage; source pixels are verified, but the archive copies are not independently tied to a retail installation.",
        "coverageLedger": {"path": str(args.coverage.resolve()), "sha256": decode_info["coverageSha256"],
                           "rowCount": decode_info["coverageRowCount"],
                           "pixelHashFieldSemantics": decode_info["coveragePixelHashFieldSemantics"],
                           "canonicalPixelHash": "recomputed from decoded native 8x8 EGA RGB; external logical_pixel_sha256 is checked but never copied blindly"},
        "inventoryManifestSha256": sha256(inventory_bytes),
        "tileCount": len(records), "galleryAliasCount": len(by_locator),
        "galleryPairCount": len(set(by_locator.values())),
        "uniqueNativePixelPatterns": unique_pixel_patterns,
        "coverageTilesWithoutGalleryAlias": len(unhashed_preview_ids),
        "unaliasedSourcePreviewsAlreadyInPackage": packaged_tile_preview_count,
        "unaliasedSourcePreviewsMissingFromPackage": len(unhashed_preview_ids) - packaged_tile_preview_count,
        "unadmittedGeneratedCandidates": [
            {"id": asset_id, "coverageStatus": records[asset_id]["coverageStatus"],
             "outputPath": str(records[asset_id]["restyleOutputPath"]),
             "outputSha256": records[asset_id]["restyleOutputSha256"],
             "outputSize": records[asset_id]["restyleOutputSize"],
             "restyleSourcePath": str(records[asset_id]["restyleSourcePath"]) if records[asset_id]["restyleSourcePath"] else None,
             "restyleSourceSha256": records[asset_id]["restyleSourceSha256"],
             "claimLimit": "No generated-inventory card alias was verified; preserved as an external unadmitted output candidate."}
            for asset_id in unhashed_preview_ids
        ],
        "tileEvidence": [
            [source["id"], source["sourcePngSha256"], source["pixelSha256"]]
            for source in sorted(records.values(), key=lambda row: row["id"])
        ],
        "archives": decode_info["archives"],
    }
    if args.write:
        output.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        args.receipt.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "archiveEntries": sum(item["entryCount"] for item in decode_info["archives"].values()),
        "decodedTiles": len(records), "restyleAliasesJoined": len(by_locator),
        "uniqueRestyleCardsJoined": len(set(by_locator.values())),
        "tilesWithoutGalleryAlias": len(unhashed_preview_ids),
        "uniqueNativePixelPatterns": unique_pixel_patterns,
        "unaliasedSourcePreviewsMissingFromPackage": len(unhashed_preview_ids) - packaged_tile_preview_count,
        "coveragePixelHashFieldSemantics": decode_info["coveragePixelHashFieldSemantics"],
        "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
        "registryAnimationGroups": len(merged["animationGroups"]),
        "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
        "visualDescriptions": visual_description_info,
        "registryWarnings": len(warnings), "write": args.write,
        "output": str(output.resolve()), "receipt": str(args.receipt.resolve()),
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
