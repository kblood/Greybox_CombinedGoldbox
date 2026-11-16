#!/usr/bin/env python3
"""Verify and merge DOS CoK SPRIT1/2/3 frames into the source identity registry.

Read-only by default. Restyle aliases are joined only after their source-file SHA-256 and
4x nearest-neighbor RGB pixels match the exact decoded frame. Repeated DAX block IDs are
disambiguated by their zero-based TOC entry index.
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
import dax_complex_decode  # noqa: E402
import dax_decode  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
SCHEMA_DEFAULT = Path("docs/engine/research/graphics-asset-registry.schema.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
DOS_DEFAULT = Path("Champions of Krynn")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
RECEIPT_DEFAULT = Path("docs/engine/research/cok-dos-sprit-decode-receipt-v1.json")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-dos-sprit-visual-descriptions-v1.json")
SCALE = 4

# These pins identify the current repository copies. They are not a claim that the files were
# independently recovered from a particular original retail installation.
ARCHIVES = {
    "SPRIT1": {
        "sha256": "9a625c1c78776cd2f733175ea6ceeedf733928b39fa747377eb0ce625fdff115",
        "toc": [1, 8, 12, 30, 35],
    },
    "SPRIT2": {
        "sha256": "888a2786d382836e611e3cbcc17b9c33eebdd2af27085324be9e12586846d77a",
        "toc": [1, 2, 5, 6, 8, 14, 19, 35, 48, 51, 4, 10, 14, 17, 25, 28, 26, 56],
    },
    "SPRIT3": {
        "sha256": "2cd809baa9eb6bc8485562775c753a256b0dd0b4416bfa9ab93bb3a8c5892d24",
        "toc": [3, 16, 17, 24, 25, 26, 35, 48, 0, 4, 19, 22, 35],
    },
}
ASSET_NAME = re.compile(r"^(SPRIT[123])_(\d+)(?:_entry([1-9]\d*))?_f(\d+)\.png$", re.I)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_asset_id(family: str, block_id: int, entry_index: int | None, frame_index: int,
                       duplicate_block_ids: set[int]) -> str:
    base = f"cok/dos-ega/dos-install/{family.lower()}.dax/block/{block_id}"
    if block_id in duplicate_block_ids:
        if entry_index is None:
            raise ValueError(f"{family}#{block_id}: repeated block ID needs a TOC entry index")
        base += f"/entry/{entry_index}"
    elif entry_index is not None:
        raise ValueError(f"{family}#{block_id}: unexpected TOC entry index for unique block ID")
    return f"{base}/frame/{frame_index}"


def canonical_group_id(family: str, block_id: int, entry_index: int | None,
                       duplicate_block_ids: set[int]) -> str:
    base = f"cok/dos-ega/dos-install/{family.lower()}.dax/block/{block_id}"
    if block_id in duplicate_block_ids:
        if entry_index is None:
            raise ValueError(f"{family}#{block_id}: repeated block ID needs a TOC entry index")
        base += f"/entry/{entry_index}"
    return base + "/frames"


def indexed_rgb(pixels: bytes, width: int, height: int) -> bytes:
    if len(pixels) != width * height // 2:
        raise ValueError(f"{width}x{height}: expected {width * height // 2} chunky bytes, got {len(pixels)}")
    indices = bytearray(width * height)
    for source_index, value in enumerate(pixels):
        indices[source_index * 2] = value >> 4
        indices[source_index * 2 + 1] = value & 15
    return bytes(dax_decode.indexed_to_rgb(indices, dax_decode.EGA_PALETTE))


def alias_locator(alias: dict[str, Any], pair: dict[str, Any]) -> tuple[str, int, int | None, int]:
    source_name = alias.get("sourceName")
    match = ASSET_NAME.fullmatch(str(source_name or ""))
    if not match:
        raise ValueError(f"{pair['id']}: unrecognized DOS SPRIT sourceName {source_name!r}")
    family, block_text, occurrence_text, frame_text = match.groups()
    family = family.upper()
    if alias.get("family", "").upper() != family or alias.get("platform") != "DOS":
        raise ValueError(f"{pair['id']}: alias family/platform conflicts with {source_name}")
    hinted_asset = str(alias.get("asset", "")).upper()
    expected_asset = f"{family}_{int(block_text):03d}"
    if occurrence_text:
        expected_asset += f"_ENTRY{int(occurrence_text)}"
    expected_asset += f"_F{int(frame_text)}"
    if hinted_asset != expected_asset:
        raise ValueError(f"{pair['id']}: alias asset {hinted_asset!r} conflicts with sourceName {source_name!r}")
    if alias.get("frame") not in (None, int(frame_text), str(frame_text)):
        raise ValueError(f"{pair['id']}: explicit frame field conflicts with {source_name}")
    return family, int(block_text), int(occurrence_text) if occurrence_text else None, int(frame_text)


def decode_archives(dos_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    receipt_archives: dict[str, Any] = {}
    for family, expected in ARCHIVES.items():
        path = dos_root / f"{family}.DAX"
        try:
            archive_ref = path.resolve(strict=True).relative_to(ROOT.resolve()).as_posix()
        except ValueError as exc:
            raise ValueError(f"{path}: DOS archive must be inside the repository so registry paths stay portable") from exc
        data = path.read_bytes()
        archive_hash = sha256(data)
        if archive_hash != expected["sha256"]:
            raise ValueError(f"{path}: SHA-256 differs from the pinned repository source")
        data_base, blocks = dax_decode.parse_container(data)
        actual_toc = [block.block_id for block in blocks]
        if actual_toc != expected["toc"]:
            raise ValueError(f"{family}: ordered TOC differs from pinned roster: {actual_toc}")
        multiplicity = Counter(actual_toc)
        occurrence: Counter[int] = Counter()
        receipt_entries = []
        for entry_index, block in enumerate(blocks):
            occurrence[block.block_id] += 1
            entry_occurrence = occurrence[block.block_id]
            raw = dax_decode.decompress_block(data, data_base, block)
            frames = dax_complex_decode.parse_anim_frames(raw, apply_xor=False)
            if frames is None or len(frames) != 3:
                raise ValueError(f"{family} TOC entry {entry_index} (#{block.block_id}) is not an exact 3-frame SPRIT block")
            frame_rows = []
            for frame_index, frame in enumerate(frames):
                width, height = frame["width"], frame["height"]
                rgb = indexed_rgb(frame["pixels"], width, height)
                pixel_hash = sha256(rgb)
                duplicate_ids = {block_id for block_id, count in multiplicity.items() if count > 1}
                asset_id = canonical_asset_id(
                    family, block.block_id, entry_index if block.block_id in duplicate_ids else None,
                    frame_index, duplicate_ids,
                )
                if asset_id in records:
                    raise ValueError(f"duplicate canonical source ID: {asset_id}")
                records[asset_id] = {
                    "id": asset_id, "family": family, "blockId": block.block_id,
                    "entryIndex": entry_index if block.block_id in duplicate_ids else None,
                    "entryOccurrence": entry_occurrence,
                    "frameIndex": frame_index, "width": width, "height": height,
                    "xOffset": frame["x"], "yOffset": frame["y"],
                    "rgb": rgb, "pixelSha256": pixel_hash,
                    "archiveSha256": archive_hash, "archivePath": archive_ref,
                }
                frame_rows.append({
                    "frameIndex": frame_index, "width": width, "height": height,
                    "xOffset": frame["x"], "yOffset": frame["y"],
                    "transparentIndex": 13, "rgbSha256": pixel_hash,
                })
            receipt_entries.append({
                "entryIndex": entry_index, "blockId": block.block_id,
                "rawSize": block.raw_size, "compressedSize": block.comp_size,
                "dataOffset": block.data_offset, "frames": frame_rows,
            })
        receipt_archives[family] = {
            "path": archive_ref, "sha256": archive_hash, "byteLength": len(data),
            "dataBase": data_base, "orderedTocBlockIds": actual_toc,
            "entryCount": len(blocks), "frameCount": sum(len(entry["frames"]) for entry in receipt_entries),
            "entries": receipt_entries,
        }
    return records, receipt_archives


def match_inventory(
    inventory: dict[str, Any], source_root: Path, package_root: Path, records: dict[str, dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], dict[str, str]]:
    by_locator: dict[tuple[str, int, int | None, int], set[str]] = defaultdict(set)
    by_id = {item["id"]: item for item in inventory.get("assets", [])}
    seen_aliases = 0
    alias_locators: set[tuple[str, int, int | None, int]] = set()
    record_by_source_locator: dict[tuple[str, int, int, int], dict[str, Any]] = {}
    for source in records.values():
        record_by_source_locator[(source["family"], source["blockId"], source["entryOccurrence"], source["frameIndex"])] = source

    # An alias provides a candidate source locator; its archive-rendered source file and pixels
    # must independently match before the gallery pair can be joined to that locator.
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "DOS" or alias.get("family") not in ARCHIVES:
                continue
            seen_aliases += 1
            family, block_id, entry_occurrence, frame_index = alias_locator(alias, pair)
            is_duplicate = Counter(ARCHIVES[family]["toc"])[block_id] > 1
            if is_duplicate != (entry_occurrence is not None):
                raise ValueError(f"{pair['id']}: duplicate block aliases must specify their entry occurrence")
            if entry_occurrence is None:
                # Unique block: occurrence 1 is the only physical TOC entry.
                entry_occurrence = 1
            source = record_by_source_locator.get((family, block_id, entry_occurrence, frame_index))
            if source is None:
                raise ValueError(f"{pair['id']}: alias locator {family}#{block_id} entry {entry_occurrence} frame {frame_index} is absent from DAX TOC")
            source_relative = alias.get("sourceProvenance")
            if not isinstance(source_relative, str) or not source_relative:
                raise ValueError(f"{pair['id']}: alias sourceProvenance is missing")
            source_path = (source_root / source_relative).resolve(strict=True)
            if not source_path.is_relative_to(source_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: sourceProvenance escapes the source root")
            source_bytes = source_path.read_bytes()
            source_hash = sha256(source_bytes)
            if source_hash != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: source PNG hash differs from inventory at {source_path}")
            image_path = (package_root / pair["source"]).resolve(strict=True)
            if not image_path.is_relative_to(package_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: packaged source path escapes the inventory package")
            if sha256(image_path.read_bytes()) != source_hash:
                raise ValueError(f"{pair['id']}: hash-addressed source PNG differs from sourceProvenance")
            with Image.open(source_path) as source_image:
                image = source_image.convert("RGB")
                frame_rgb = source["rgb"]
                expected = Image.frombytes("RGB", (source["width"], source["height"]), frame_rgb)
                if image.size != (source["width"] * SCALE, source["height"] * SCALE):
                    raise ValueError(f"{pair['id']}: source PNG size is not exact {SCALE}x for {source['id']}")
                if image.tobytes() != expected.resize(image.size, Image.Resampling.NEAREST).tobytes():
                    raise ValueError(f"{pair['id']}: source PNG pixels differ from decoded frame {source['id']}")
            locator = (family, block_id, entry_occurrence if is_duplicate else None, frame_index)
            by_locator[locator].add(pair["id"])
            alias_locators.add(locator)
            if source.get("sourceSha256") not in (None, source_hash):
                raise ValueError(f"{source['id']}: aliases claim conflicting source image hashes")
            source["sourceSha256"] = source_hash
            source["sourcePngPath"] = image_path.relative_to(package_root.resolve()).as_posix()
            source["sourceSize"] = list(image.size)

    expected_locator_keys = {
        (row["family"], row["blockId"], row["entryOccurrence"] if row["entryIndex"] is not None else None, row["frameIndex"])
        for row in records.values()
    }
    if alias_locators != expected_locator_keys:
        raise ValueError(f"Restyle aliases do not cover exact DAX frames (missing={sorted(expected_locator_keys - alias_locators)}, extra={sorted(alias_locators - expected_locator_keys)})")
    if seen_aliases != 108:
        raise ValueError(f"expected 108 candidate DOS SPRIT aliases, got {seen_aliases}")
    linked_pair_ids = {pair_id for ids in by_locator.values() for pair_id in ids}
    return by_id, by_locator, {pair_id: by_id[pair_id]["sourceSha256"] for pair_id in linked_pair_ids}


def make_asset(source: dict[str, Any], previous: dict[str, Any] | None,
               group_id: str, toc_multiplicity: Counter[int]) -> dict[str, Any]:
    family, block_id, frame_index = source["family"], source["blockId"], source["frameIndex"]
    asset = {
        "id": source["id"], "game": "cok", "edition": "DOS install", "platform": "DOS-EGA",
        "archive": {"name": f"{family}.DAX", "path": source["archivePath"], "sha256": source["archiveSha256"]},
        "locator": {"kind": "block-frame", "blockId": block_id,
                    "entryIndex": source["entryIndex"], "frameIndex": frame_index,
                    "tileIndex": None, "cellIndex": None},
        "decoded": {"path": source.get("sourcePngPath", f"images/{source.get('sourceSha256', '')}.png"),
                    "sha256": source.get("sourceSha256", source["pixelSha256"]),
                    "pixelSha256": source["pixelSha256"],
                    "width": source.get("sourceSize", [source["width"], source["height"]])[0],
                    "height": source.get("sourceSize", [source["width"], source["height"]])[1],
                    "transparentIndex": 13},
        "identityStatus": "source-pinned",
        "description": {"text": f"DOS {family} block {block_id} frame {frame_index}; depicted subject is not identified.",
                        "status": "unknown",
                        "evidence": [{"kind": "decoded-pixels", "reference": f"{source['archivePath']}#{block_id}/entry/{source.get('entryIndex')}/frame/{frame_index}",
                                      "note": f"Repository archive SHA-256 {source['archiveSha256']}; decoded {source['width']}×{source['height']} EGA pixels are exact."}]},
        "gameConsumers": [{"status": "unknown",
                           "use": "The exact SPRIT block selector and scene/encounter use are not established.",
                           "evidence": [{"kind": "research-doc", "reference": "docs/engine/research/dax-complex-subframe.md",
                                         "note": "The exact block frame is decoded as a stored SPRIT view; this format evidence does not establish its caller or playback rule."}] }],
        "animationGroupId": group_id,
    }
    if previous:
        previous_decoded = previous.get("decoded") or {}
        if previous_decoded.get("pixelSha256") not in (None, source["pixelSha256"]):
            raise ValueError(f"{source['id']}: previous registry pixel hash conflicts with DAX decode")
        for field in ("identityStatus", "description", "gameConsumers"):
            if previous.get(field):
                asset[field] = previous[field]
        if previous.get("decoded", {}).get("sha256") != asset["decoded"]["sha256"]:
            raise ValueError(f"{source['id']}: previous registered source PNG hash conflicts")
    return asset


def gallery_restyle(item: dict[str, Any], source_ids: list[str]) -> dict[str, Any]:
    refs = item.get("promptReferences", [])
    if len(refs) == 1:
        ref = refs[0]
        prompt = {"status": "linked-full-text", "batch": ref.get("batch"), "path": ref.get("file"),
                  "sha256": ref.get("sha256"), "textSha256": None,
                  "inputPath": f"images/{ref.get('inputSha256')}.png", "inputSha256": ref.get("inputSha256"),
                  "text": ref.get("text"), "references": [], "referenceAssetIds": []}
    else:
        prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None,
                  "textSha256": None, "inputPath": None, "inputSha256": None, "text": None,
                  "references": [], "referenceAssetIds": []}
    evidence = [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{item['id']}",
                 "note": f"Exact source/output inventory hashes {item['sourceSha256']} → {item['outputSha256']}; every linked frame was checked against the pinned DAX decode."}]
    return {
        "id": f"restyle/cok-generated/{item['id']}",
        "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": item["id"],
                                "reference": f"restyle/cok-generated/manifest.json#{item['id']}"}],
        "sourceAssetIds": sorted(source_ids),
        "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one",
        "prompt": prompt,
        "outputs": [{"path": f"images/{item['outputSha256']}.png", "sha256": item["outputSha256"], "role": "gallery-copy"}],
        "reviewStatus": "runtime-admitted" if item.get("runtimeApproved") else "generated",
        "evidence": evidence,
    }


def merge_registry(registry: dict[str, Any], inventory: dict[str, Any],
                   records: dict[str, dict[str, Any]], by_id: dict[str, dict[str, Any]],
                   by_locator: dict[tuple[str, int, int | None, int], set[str]]) -> dict[str, Any]:
    old_assets = {asset["id"]: asset for asset in registry["assets"]}
    old_dos_sprit = {asset_id: asset for asset_id, asset in old_assets.items()
                     if asset.get("platform") == "DOS-EGA" and asset.get("archive", {}).get("name", "").upper() in {f"{family}.DAX" for family in ARCHIVES}}
    seen_group_ids: set[str] = set()
    new_assets = []
    new_groups = []
    for source in records.values():
        family, block_id = source["family"], source["blockId"]
        archive_toc = ARCHIVES[family]["toc"]
        multiplicity = Counter(archive_toc)
        entry_index = source["entryIndex"]
        group_id = canonical_group_id(family, block_id, entry_index, {bid for bid, count in multiplicity.items() if count > 1})
        if block_id == 1 and family == "SPRIT1" and entry_index is None:
            group_id = "cok/dos-ega/dos-install/sprit1.dax/block/1/zoom-set"
        new_assets.append(make_asset(source, old_dos_sprit.get(source["id"]), group_id, multiplicity))
        if group_id in seen_group_ids:
            continue
        seen_group_ids.add(group_id)
        prior_group = next((group for group in registry["animationGroups"] if group.get("id") == group_id), None)
        frames = [{"assetId": record["id"], "order": record["frameIndex"],
                   "role": f"stored frame {record['frameIndex']}"}
                  for record in records.values() if record["family"] == family and record["blockId"] == block_id and record["entryIndex"] == entry_index]
        frames.sort(key=lambda row: row["order"])
        group = prior_group or {
            "id": group_id, "semantics": "unknown", "playback": "unknown", "status": "unknown",
            "evidence": [{"kind": "research-doc", "reference": "docs/engine/research/dax-complex-subframe.md",
                          "note": "Three frames are stored in this DAX entry; only source frame membership/order is established here, while this block's game selection and playback semantics remain unknown."}],
            "frames": frames,
        }
        if prior_group and {row["assetId"] for row in prior_group.get("frames", [])} != {row["assetId"] for row in frames}:
            raise ValueError(f"{group_id}: previous animation group members differ from decoded frames")
        new_groups.append(group)

    replaced_ids = set(old_dos_sprit) | set(records)
    registry["assets"] = [asset for asset in registry["assets"] if asset["id"] not in replaced_ids] + new_assets
    group_ids = {group["id"] for group in new_groups}
    registry["animationGroups"] = [group for group in registry["animationGroups"] if group["id"] not in group_ids] + new_groups

    # Replace gallery lineage only for exact DOS SPRIT pair references. Other Restyle records stay intact.
    pair_source_ids: dict[str, set[str]] = defaultdict(set)
    for locator, pair_ids in by_locator.items():
        family, block_id, occurrence, frame_index = locator
        archive_toc = ARCHIVES[family]["toc"]
        block_occurrences = [index for index, bid in enumerate(archive_toc) if bid == block_id]
        entry_index = block_occurrences[occurrence - 1] if occurrence is not None else block_occurrences[0]
        row = next(record for record in records.values() if record["family"] == family and record["blockId"] == block_id and record["entryIndex"] == (entry_index if len(block_occurrences) > 1 else None) and record["frameIndex"] == frame_index)
        for pair_id in pair_ids:
            pair_source_ids[pair_id].add(row["id"])
    old_restyles = registry["restyles"]
    target_gallery_ids = set(pair_source_ids)
    kept_restyles = [record for record in old_restyles if not any(
        ref.get("system") == "cok-restyle-inventory-v1" and ref.get("id") in target_gallery_ids
        for ref in record.get("externalReferences", []))]
    for pair_id in sorted(pair_source_ids):
        item = by_id[pair_id]
        kept_restyles.append(gallery_restyle(item, sorted(pair_source_ids[pair_id])))
    registry["restyles"] = kept_restyles

    # Keep archive locators distinct; link exact duplicate pixels without merging their IDs.
    pixel_groups: dict[tuple[int, int, str], list[str]] = defaultdict(list)
    for row in records.values():
        pixel_groups[(row["width"], row["height"], row["pixelSha256"])].append(row["id"])
    links = registry["crossVersionLinks"]
    known_pairs = {tuple(sorted((link["fromAssetId"], link["toAssetId"]))) for link in links}
    for (width, height, pixel_hash), ids in pixel_groups.items():
        for target_id in sorted(ids)[1:]:
            pair = tuple(sorted((sorted(ids)[0], target_id)))
            if pair in known_pairs:
                continue
            links.append({"fromAssetId": pair[0], "toAssetId": pair[1], "relation": "pixel-identical",
                          "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                          "reference": "tools/dax_complex_decode.py + Champions of Krynn/SPRIT*.DAX",
                          "note": f"Exact row-major EGA RGB equality at {width}×{height}; archive entries remain separate. Pixel SHA-256 {pixel_hash}."}]})
            known_pairs.add(pair)
    return registry


def apply_visual_descriptions(registry: dict[str, Any], records: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply source-reviewed visible-only descriptions to every decoded DOS SPRIT frame."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("DOS SPRIT visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(records):
        raise ValueError(f"visual description coverage differs from decoded DOS SPRIT frames: missing={len(set(records)-set(by_id))}, extra={len(set(by_id)-set(records))}")

    asset_map = {asset["id"]: asset for asset in registry["assets"]}
    dataset_sha = sha256(dataset_path.read_bytes())
    evidence_ref = f"{dataset_path.as_posix()}#"
    descriptions_by_pixel: dict[str, str] = {}
    for asset_id, row in by_id.items():
        source = records[asset_id]
        asset = asset_map.get(asset_id)
        archive = str((asset or {}).get("archive", {}).get("name", "")).upper()
        if asset is None or asset.get("platform") != "DOS-EGA" or archive not in {f"{family}.DAX" for family in ARCHIVES}:
            raise ValueError(f"{asset_id}: visual description does not target a merged DOS SPRIT source")
        decoded = asset.get("decoded") or {}
        source_hash = row.get("sourceSha256")
        pixel_hash = row.get("pixelSha256")
        description = row.get("visualDescription")
        if (source_hash != source.get("sourceSha256") or source_hash != decoded.get("sha256")
                or pixel_hash != source.get("pixelSha256") or pixel_hash != decoded.get("pixelSha256")
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
        image_path = image_store / image_name
        if not image_path.is_file() or sha256(image_path.read_bytes()) != source_hash:
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
    return registry, {"rows": len(by_id), "uniquePixelHashes": len(descriptions_by_pixel)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--schema", type=Path, default=SCHEMA_DEFAULT)
    parser.add_argument("--receipt", type=Path, default=RECEIPT_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--write", action="store_true", help="write registry/receipt (default is read-only)")
    args = parser.parse_args()

    inventory = read_json(args.inventory)
    registry = read_json(args.registry)
    records, receipt_archives = decode_archives(args.dos_root.resolve(strict=True))
    by_id, by_locator, pair_hashes = match_inventory(
        inventory, args.source_root.resolve(strict=True), args.package.resolve(strict=True), records)
    # Require actual source coverage from the archive, not merely a count inferred from gallery aliases.
    if len(records) != 108:
        raise ValueError(f"expected 108 source frames from 36 DAX entries, got {len(records)}")
    merged = merge_registry(registry, inventory, records, by_id, by_locator)
    merged, visual_description_counts = apply_visual_descriptions(
        merged, records, read_json(args.visual_descriptions), args.package.resolve(strict=True) / "images",
        args.visual_descriptions)
    from graphics_asset_registry import validate
    from import_cok_amiga_sprit_registry import validate_evidence_kinds
    errors, warnings = validate(merged)
    if errors:
        raise ValueError("merged registry validation failed: " + "; ".join(errors[:12]))
    validate_evidence_kinds(merged, args.schema)
    receipt = {
        "schema": "cok-dos-sprit-decode-receipt-v1",
        "provenance": "Repository game-folder copies; archive pins identify current bytes, not independent retail-install verification.",
        "scale": SCALE, "frameCount": len(records), "restylePairCount": len(pair_hashes),
        "archives": receipt_archives,
    }
    output = args.output or args.registry
    if args.write:
        output.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        args.receipt.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "archiveEntries": sum(row["entryCount"] for row in receipt_archives.values()),
        "decodedSourceFrames": len(records),
        "restyleAliasesJoined": sum(len(ids) for ids in by_locator.values()),
        "uniqueRestylePairsJoined": len(pair_hashes),
        "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
        "registryAnimationGroups": len(merged["animationGroups"]),
        "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
        "registryWarnings": len(warnings), "write": args.write, "output": str(output.resolve()),
        "visualDescriptionRows": visual_description_counts["rows"],
        "visualDescriptionUniquePixels": visual_description_counts["uniquePixelHashes"],
        "receipt": str(args.receipt.resolve()),
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
