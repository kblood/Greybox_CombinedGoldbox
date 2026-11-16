#!/usr/bin/env python3
"""Verify and merge CoK DOS PIC1/2/3 frames into the graphics identity registry.

The importer is read-only unless --write is supplied. It pins repository archive copies,
decodes every TOC frame, checks the existing 4x Restyle renders pixel-for-pixel, and links
gallery cards only after source and packaged-file hashes also match.
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
import dax_complex_decode  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
SCHEMA_DEFAULT = Path("docs/engine/research/graphics-asset-registry.schema.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
DOS_DEFAULT = Path("Champions of Krynn")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
RECEIPT_DEFAULT = Path("docs/engine/research/cok-dos-pic-decode-receipt-v1.json")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-dos-pic123-visual-descriptions-v1.json")
ALTERNATE_VISUAL_DESCRIPTION_DEFAULTS = (
    Path("docs/engine/research/cok-dos-pic1-visual-descriptions-v1.json"),
    Path("docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json"),
)
SCALE = 4
ARCHIVES = {
    "PIC1": {
        "sha256": "2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97",
        "toc": [23, 57, 58, 34, 18, 59, 60, 1, 8, 12, 15, 30, 34, 35, 41, 61, 62, 63],
    },
    "PIC2": {
        "sha256": "b4c07f963edcb88973ba7f3caa80cbcae4c88b3c71aa4c7ad3132ccbed1dbc51",
        "toc": [1, 2, 5, 6, 8, 14, 19, 35, 41, 44, 48, 51, 54, 67, 59, 60, 4, 10, 17, 23, 25, 28, 33, 34, 56, 70],
    },
    "PIC3": {
        "sha256": "21d5a2bfc40041611657c2a4a9f6de0f3edd67bb5c9692b61cf2007060d6cfa4",
        "toc": [3, 16, 17, 24, 25, 26, 35, 44, 48, 67, 72, 73, 59, 60, 0, 4, 18, 19, 22, 32, 64, 65, 71, 66],
    },
}
ALIAS = re.compile(r"^(PIC[123])_(\d+)(?:_entry([1-9]\d*))?_f(\d+)\.png$", re.I)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def indexed_rgb(pixels: bytes, width: int, height: int) -> bytes:
    if width % 2 or len(pixels) != width * height // 2:
        raise ValueError(f"{width}x{height}: invalid chunky 4bpp pixel length {len(pixels)}")
    indices = bytearray(width * height)
    for i, value in enumerate(pixels):
        indices[i * 2] = value >> 4
        indices[i * 2 + 1] = value & 15
    return bytes(dax_decode.indexed_to_rgb(indices, dax_decode.EGA_PALETTE))


def canonical_asset_id(family: str, block_id: int, entry_index: int | None,
                       frame_index: int, duplicate_ids: set[int]) -> str:
    base = f"cok/dos-ega/disk{int(family[-1])}/{family.lower()}.dax/block/{block_id}"
    if block_id in duplicate_ids:
        if entry_index is None:
            raise ValueError(f"{family}#{block_id}: duplicate TOC block needs entry index")
        base += f"/entry/{entry_index}"
    elif entry_index is not None:
        raise ValueError(f"{family}#{block_id}: unexpected TOC entry index")
    return f"{base}/frame/{frame_index}"


def canonical_group_id(family: str, block_id: int, entry_index: int | None,
                       duplicate_ids: set[int]) -> str:
    base = f"cok/dos-ega/disk{int(family[-1])}/{family.lower()}.dax/block/{block_id}"
    if block_id in duplicate_ids:
        if entry_index is None:
            raise ValueError(f"{family}#{block_id}: duplicate TOC block needs entry index")
        base += f"/entry/{entry_index}"
    elif entry_index is not None:
        raise ValueError(f"{family}#{block_id}: unexpected TOC entry index")
    return base + "/frames"


def decode_archives(dos_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    receipt: dict[str, Any] = {}
    for family, expected in ARCHIVES.items():
        path = dos_root / f"{family}.DAX"
        try:
            archive_path = path.resolve(strict=True).relative_to(ROOT.resolve()).as_posix()
        except ValueError as exc:
            raise ValueError(f"{path}: archive must be inside the repository for portable provenance") from exc
        data = path.read_bytes()
        archive_hash = sha256(data)
        if archive_hash != expected["sha256"]:
            raise ValueError(f"{path}: SHA-256 differs from pinned repository source")
        data_base, blocks = dax_decode.parse_container(data)
        toc = [block.block_id for block in blocks]
        if toc != expected["toc"]:
            raise ValueError(f"{family}: ordered TOC differs from audited roster: {toc}")
        multiplicity = Counter(toc)
        duplicates = {block_id for block_id, count in multiplicity.items() if count > 1}
        occurrence: Counter[int] = Counter()
        entries = []
        for entry_index, block in enumerate(blocks):
            occurrence[block.block_id] += 1
            raw = dax_decode.decompress_block(data, data_base, block)
            frames = dax_complex_decode.parse_anim_frames(raw, apply_xor=False)
            if frames is None:
                raise ValueError(f"{family} TOC entry {entry_index} (#{block.block_id}) is not a complete complex-picture block")
            frame_rows = [{**frame, "pixelFormat": "indexed"} for frame in frames]
            frame_receipts = []
            for frame_index, frame in enumerate(frame_rows):
                width, height = frame["width"], frame["height"]
                rgb = frame["pixels"] if frame["pixelFormat"] == "rgb" else indexed_rgb(frame["pixels"], width, height)
                pixel_hash = sha256(rgb)
                asset_id = canonical_asset_id(family, block.block_id,
                                              entry_index if block.block_id in duplicates else None,
                                              frame_index, duplicates)
                if asset_id in records:
                    raise ValueError(f"duplicate source identity: {asset_id}")
                records[asset_id] = {
                    "id": asset_id, "family": family, "blockId": block.block_id,
                    "entryIndex": entry_index if block.block_id in duplicates else None,
                    "entryOccurrence": occurrence[block.block_id], "frameIndex": frame_index,
                    "width": width, "height": height, "xOffset": frame["x"], "yOffset": frame["y"],
                    "rgb": rgb, "pixelSha256": pixel_hash, "archiveSha256": archive_hash,
                    "archivePath": archive_path,
                }
                frame_receipts.append({"frameIndex": frame_index, "width": width, "height": height,
                                       "xOffset": frame["x"], "yOffset": frame["y"], "rgbSha256": pixel_hash})
            entries.append({"entryIndex": entry_index, "blockId": block.block_id,
                            "rawSize": block.raw_size, "compressedSize": block.comp_size,
                            "dataOffset": block.data_offset, "frames": frame_receipts})
        receipt[family] = {"path": archive_path, "sha256": archive_hash, "byteLength": len(data),
                           "dataBase": data_base, "orderedTocBlockIds": toc,
                           "entryCount": len(blocks), "frameCount": sum(len(e["frames"]) for e in entries),
                           "entries": entries}
    if len(records) != 125:
        raise ValueError(f"expected 125 decoded frame locators, got {len(records)}")
    return records, receipt


def alias_locator(alias: dict[str, Any], pair: dict[str, Any]) -> tuple[str, int, int | None, int]:
    match = ALIAS.fullmatch(str(alias.get("sourceName") or ""))
    if not match:
        raise ValueError(f"{pair.get('id')}: invalid PIC sourceName {alias.get('sourceName')!r}")
    family, block_text, occurrence_text, frame_text = match.groups()
    family = family.upper()
    block_id, frame = int(block_text), int(frame_text)
    if alias.get("family", "").upper() != family or alias.get("platform") != "DOS":
        raise ValueError(f"{pair['id']}: family/platform conflicts with sourceName")
    asset_hint = f"{family}_{block_id:03d}"
    if occurrence_text:
        asset_hint += f"_ENTRY{int(occurrence_text)}"
    asset_hint += f"_F{frame}"
    if str(alias.get("asset", "")).upper() != asset_hint:
        raise ValueError(f"{pair['id']}: alias asset conflicts with sourceName")
    if alias.get("frame") not in (None, frame, str(frame)):
        raise ValueError(f"{pair['id']}: frame field conflicts with sourceName")
    return family, block_id, int(occurrence_text) if occurrence_text else None, frame


def match_inventory(inventory: dict[str, Any], source_root: Path, package_root: Path,
                    records: dict[str, dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[tuple[str, int, int, int], set[str]]]:
    by_id = {pair["id"]: pair for pair in inventory.get("assets", [])}
    source_by_locator = {(r["family"], r["blockId"], r["entryOccurrence"], r["frameIndex"]): r
                        for r in records.values()}
    alias_locators: set[tuple[str, int, int, int]] = set()
    pair_ids_by_locator: dict[tuple[str, int, int, int], set[str]] = defaultdict(set)
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "DOS" or alias.get("family") not in ARCHIVES:
                continue
            family, block_id, occurrence, frame_index = alias_locator(alias, pair)
            duplicate_count = Counter(ARCHIVES[family]["toc"])[block_id]
            if duplicate_count > 1 and occurrence is None:
                raise ValueError(f"{pair['id']}: duplicate {family}#{block_id} alias needs entry occurrence")
            if duplicate_count == 1 and occurrence is not None:
                raise ValueError(f"{pair['id']}: unique {family}#{block_id} alias must not specify duplicate entry")
            resolved_occurrence = occurrence or 1
            locator = (family, block_id, resolved_occurrence, frame_index)
            source = source_by_locator.get(locator)
            if source is None:
                raise ValueError(f"{pair['id']}: alias locator {locator} is absent from pinned archive")
            relative = alias.get("sourceProvenance")
            if not isinstance(relative, str) or not relative:
                raise ValueError(f"{pair['id']}: sourceProvenance is missing")
            source_path = (source_root / relative).resolve(strict=True)
            if not source_path.is_relative_to(source_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: sourceProvenance escapes source root")
            source_bytes = source_path.read_bytes()
            source_hash = sha256(source_bytes)
            if source_hash != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: source PNG hash differs from inventory")
            packaged_source = (package_root / pair["source"]).resolve(strict=True)
            if not packaged_source.is_relative_to(package_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: packaged source path escapes package")
            if sha256(packaged_source.read_bytes()) != source_hash:
                raise ValueError(f"{pair['id']}: packaged source differs from provenance PNG")
            packaged_output = (package_root / pair["output"]).resolve(strict=True)
            if not packaged_output.is_relative_to(package_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: packaged output path escapes package")
            if sha256(packaged_output.read_bytes()) != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: packaged output hash differs from inventory")
            with Image.open(source_path) as image:
                image = image.convert("RGB")
                expected = Image.frombytes("RGB", (source["width"], source["height"]), source["rgb"])
                if image.size != (source["width"] * SCALE, source["height"] * SCALE):
                    raise ValueError(f"{source_path}: dimensions are not exact {SCALE}x for {source['id']}")
                if image.tobytes() != expected.resize(image.size, Image.Resampling.NEAREST).tobytes():
                    raise ValueError(f"{pair['id']}: render pixels differ from decoded {source['id']}")
            alias_locators.add(locator)
            pair_ids_by_locator[locator].add(pair["id"])
            source["sourceSha256"] = source_hash
            source["sourceSize"] = [source["width"] * SCALE, source["height"] * SCALE]
    expected_locators = {(r["family"], r["blockId"], r["entryOccurrence"], r["frameIndex"])
                         for r in records.values()}
    if alias_locators != expected_locators:
        raise ValueError(f"PIC Restyle aliases do not cover exact decoded frame set: missing={sorted(expected_locators-alias_locators)}, extra={sorted(alias_locators-expected_locators)}")
    if len(alias_locators) != 125:
        raise ValueError(f"expected 125 distinct PIC aliases, got {len(alias_locators)}")
    return by_id, pair_ids_by_locator


def make_asset(source: dict[str, Any], group_id: str | None,
               prior: dict[str, Any] | None) -> dict[str, Any]:
    entry_suffix = f"/entry/{source['entryIndex']}" if source["entryIndex"] is not None else ""
    asset = {
        "id": source["id"], "game": "cok", "edition": f"DOS disk {source['family'][-1]}", "platform": "DOS-EGA",
        "archive": {"name": f"{source['family']}.DAX", "path": source["archivePath"], "sha256": source["archiveSha256"]},
        "locator": {"kind": "block-frame", "blockId": source["blockId"], "entryIndex": source["entryIndex"],
                    "frameIndex": source["frameIndex"], "tileIndex": None, "cellIndex": None},
        "decoded": {"path": f"images/{source['sourceSha256']}.png", "sha256": source["sourceSha256"],
                    "pixelSha256": source["pixelSha256"], "width": source["width"],
                    "height": source["height"]},
        "identityStatus": "source-pinned",
        "description": {"text": f"DOS {source['family']} block {source['blockId']} frame {source['frameIndex']}; depicted subject and scene are not identified.",
                        "status": "unknown", "evidence": [{"kind": "decoded-pixels",
                        "reference": f"{source['archivePath']}#{source['blockId']}{entry_suffix}/frame/{source['frameIndex']}",
                        "note": f"Repository archive SHA-256 {source['archiveSha256']}; {source['width']}×{source['height']} EGA pixels exactly match the 4× Restyle source render."}]},
        "gameConsumers": [{"status": "unknown", "use": f"The exact CoK selector and scene use for {source['family']}#{source['blockId']} frame {source['frameIndex']} are not mapped.",
                           "evidence": [{"kind": "research-doc", "reference": "tools/dax_complex_decode.py + pinned DAX archive",
                                         "note": "Stored frame membership/order is established; this does not prove temporal animation or a game caller."}]}],
        "animationGroupId": group_id,
    }
    if prior:
        prior_locator = dict(prior.get("locator", {}))
        current_locator = dict(asset["locator"])
        for locator in (prior_locator, current_locator):
            locator.setdefault("entryIndex", None)
        if prior.get("archive", {}).get("sha256") != asset["archive"]["sha256"] or prior_locator != current_locator:
            raise ValueError(f"{source['id']}: existing source archive or locator conflicts")
        old_hash = (prior.get("decoded") or {}).get("sha256")
        if old_hash not in (None, source["sourceSha256"]):
            raise ValueError(f"{source['id']}: existing decoded PNG hash conflicts")
        old_pixels = (prior.get("decoded") or {}).get("pixelSha256")
        if old_pixels not in (None, source["pixelSha256"]):
            raise ValueError(f"{source['id']}: existing decoded pixel hash conflicts")
        if prior.get("description"):
            description = dict(prior["description"])
            prior_evidence = [item for item in description.get("evidence", [])
                              if item.get("kind") != "decoded-pixels"]
            decoded_evidence = [item for item in asset["description"]["evidence"]
                                if item.get("kind") == "decoded-pixels"]
            description["evidence"] = prior_evidence + decoded_evidence
            asset["description"] = description
        for field in ("gameConsumers", "identityStatus", "galleryReferences"):
            if prior.get(field):
                asset[field] = prior[field]
    return asset


def gallery_restyle(pair: dict[str, Any], source_ids: list[str]) -> dict[str, Any]:
    references = pair.get("promptReferences", [])
    if len(references) == 1:
        prompt_ref = references[0]
        prompt = {"status": "linked-full-text", "batch": prompt_ref.get("batch"), "path": prompt_ref.get("file"),
                  "sha256": prompt_ref.get("sha256"), "textSha256": None,
                  "inputPath": f"images/{pair['sourceSha256']}.png", "inputSha256": pair["sourceSha256"],
                  "text": prompt_ref.get("text"), "references": [], "referenceAssetIds": []}
    else:
        prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None,
                  "textSha256": None, "inputPath": f"images/{pair['sourceSha256']}.png",
                  "inputSha256": pair["sourceSha256"], "text": None, "references": [], "referenceAssetIds": []}
    return {"id": f"restyle/cok-generated/{pair['id']}",
            "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair["id"],
                                    "reference": f"restyle/cok-generated/manifest.json#{pair['id']}"}],
            "sourceAssetIds": sorted(source_ids),
            "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one",
            "prompt": prompt,
            "outputs": [{"path": f"images/{pair['outputSha256']}.png", "sha256": pair["outputSha256"], "role": "gallery-copy"}],
            "reviewStatus": "runtime-admitted" if pair.get("runtimeApproved") else "generated",
            "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair['id']}",
                          "note": f"Exact source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; source frame is archive-decoded and pixel-verified; composition review remains separate."}]}


def merge_registry(registry: dict[str, Any], records: dict[str, dict[str, Any]],
                   by_id: dict[str, dict[str, Any]],
                   pair_ids_by_locator: dict[tuple[str, int, int, int], set[str]]) -> dict[str, Any]:
    result = json.loads(json.dumps(registry))
    old_assets = {a["id"]: a for a in result["assets"]}
    old_groups = {g["id"]: g for g in result["animationGroups"]}
    assets = {asset_id: asset for asset_id, asset in old_assets.items()}
    groups = {group["id"]: group for group in result["animationGroups"]}
    multiplicities = {family: Counter(spec["toc"]) for family, spec in ARCHIVES.items()}
    groups_for_source: dict[str, str | None] = {}
    for source in records.values():
        family, block_id, entry_index = source["family"], source["blockId"], source["entryIndex"]
        duplicate_ids = {bid for bid, count in multiplicities[family].items() if count > 1}
        group_id = canonical_group_id(family, block_id, entry_index, duplicate_ids) if sum(
            1 for row in records.values() if row["family"] == family and row["blockId"] == block_id and row["entryIndex"] == entry_index
        ) > 1 else None
        groups_for_source[source["id"]] = group_id
        assets[source["id"]] = make_asset(source, group_id, old_assets.get(source["id"]))
    for group_id in sorted({gid for gid in groups_for_source.values() if gid}):
        members = sorted((record for record in records.values() if groups_for_source[record["id"]] == group_id),
                         key=lambda row: row["frameIndex"])
        previous = old_groups.get(group_id)
        group = previous or {"id": group_id, "semantics": "unknown", "playback": "unknown", "status": "unknown",
                             "evidence": [{"kind": "research-doc", "reference": "tools/dax_complex_decode.py + pinned DOS PIC archives",
                                           "note": "Frame membership and storage order are decoded; temporal, pose, distance, compositing, and caller semantics are not inferred."}],
                             "frames": [{"assetId": row["id"], "order": row["frameIndex"], "role": f"stored frame {row['frameIndex']}"} for row in members]}
        if {f["assetId"] for f in group.get("frames", [])} != {r["id"] for r in members}:
            raise ValueError(f"{group_id}: existing frame membership differs from decoded archive")
        groups[group_id] = group
    result["assets"] = list(assets.values())
    result["animationGroups"] = list(groups.values())

    source_ids_by_pair: dict[str, set[str]] = defaultdict(set)
    for (family, block_id, occurrence, frame_index), pair_ids in pair_ids_by_locator.items():
        candidates = [r for r in records.values() if r["family"] == family and r["blockId"] == block_id
                      and r["entryOccurrence"] == occurrence and r["frameIndex"] == frame_index]
        if len(candidates) != 1:
            raise ValueError(f"{family}#{block_id} occurrence {occurrence} frame {frame_index}: expected one decoded row")
        for pair_id in pair_ids:
            source_ids_by_pair[pair_id].add(candidates[0]["id"])
    target_pair_ids = set(source_ids_by_pair)
    result["restyles"] = [restyle for restyle in result["restyles"] if not any(
        ref.get("system") == "cok-restyle-inventory-v1" and ref.get("id") in target_pair_ids
        for ref in restyle.get("externalReferences", []))]
    for pair_id, source_ids in sorted(source_ids_by_pair.items()):
        result["restyles"].append(gallery_restyle(by_id[pair_id], sorted(source_ids)))

    pixel_members: dict[tuple[int, int, str], list[str]] = defaultdict(list)
    for row in records.values():
        pixel_members[(row["width"], row["height"], row["pixelSha256"])].append(row["id"])
    existing_links = result["crossVersionLinks"]
    known = {tuple(sorted((link["fromAssetId"], link["toAssetId"]))) for link in existing_links}
    for (width, height, pixel_hash), ids in pixel_members.items():
        for target in sorted(ids)[1:]:
            pair = tuple(sorted((sorted(ids)[0], target)))
            if pair in known:
                continue
            existing_links.append({"fromAssetId": pair[0], "toAssetId": pair[1], "relation": "pixel-identical",
                                   "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                                   "reference": "tools/import_cok_dos_pic_registry.py + pinned PIC1/2/3.DAX",
                                   "note": f"Exact decoded row-major RGB equality at {width}×{height}; source locators remain distinct. Pixel SHA-256 {pixel_hash}."}]})
            known.add(pair)
    return result


def apply_visual_descriptions(registry: dict[str, Any], records: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path,
                              alternate_datasets: dict[str, dict[str, Any]] | None = None
                              ) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply reviewed appearance-only notes to every decoded DOS PIC1/PIC2/PIC3 frame."""
    expected = dict(records)
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("DOS PIC visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(expected):
        raise ValueError(f"visual description coverage differs from decoded PIC1/PIC2/PIC3 frames: missing={len(set(expected)-set(by_id))}, extra={len(set(by_id)-set(expected))}")

    result, _ = reconcile_superseded_visual_evidence(registry, dataset, dataset_path, alternate_datasets or {})
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    dataset_sha = sha256(dataset_path.read_bytes())
    evidence_ref = f"{dataset_path.as_posix()}#"
    descriptions_by_pixel: dict[str, str] = {}
    for asset_id, row in by_id.items():
        source = expected[asset_id]
        asset = asset_map.get(asset_id)
        if asset is None or asset.get("platform") != "DOS-EGA" or asset.get("archive", {}).get("name", "").upper() not in {"PIC1.DAX", "PIC2.DAX", "PIC3.DAX"}:
            raise ValueError(f"{asset_id}: visual description does not target a merged DOS PIC1/PIC2/PIC3 source")
        decoded = asset.get("decoded") or {}
        source_hash = row.get("sourceSha256")
        pixel_hash = row.get("pixelSha256")
        description = row.get("visualDescription")
        if source_hash != source.get("sourceSha256") or source_hash != decoded.get("sha256") or pixel_hash != source.get("pixelSha256") or pixel_hash != decoded.get("pixelSha256") or not isinstance(description, str) or not description.strip():
            raise ValueError(f"{asset_id}: visual description source/file/pixel hash or text mismatch")
        prior_description = descriptions_by_pixel.setdefault(pixel_hash, description)
        if prior_description != description:
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
        evidence_item = {"kind": "visual-review", "reference": f"{evidence_ref}{asset_id}",
                         "note": f"Visible appearance manually reviewed against exact source PNG SHA-256 {source_hash} and decoded pixel SHA-256 {pixel_hash}; dataset SHA-256 {dataset_sha}. Subject identity, game use, selector, and playback semantics remain unproven."}
        if owned:
            evidence[owned[0]] = evidence_item
            for index in reversed(owned[1:]):
                del evidence[index]
        else:
            evidence.append(evidence_item)
    return result, {"rows": len(by_id), "uniquePixelHashes": len(descriptions_by_pixel)}


def reconcile_superseded_visual_evidence(registry: dict[str, Any], canonical_dataset: dict[str, Any],
                                         canonical_path: Path,
                                         alternate_datasets: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    """Remove only alternate visual-review refs whose hash-pinned wording differs from canonical data."""
    canonical_rows = {}
    for row in canonical_dataset.get("assets", []):
        asset_id = row.get("assetId", row.get("id"))
        if isinstance(asset_id, str):
            if asset_id in canonical_rows:
                raise ValueError(f"duplicate canonical visual description ID: {asset_id}")
            canonical_rows[asset_id] = row

    superseded: set[str] = set()
    canonical_prefix = canonical_path.as_posix() + "#"
    for alternate_path, alternate in alternate_datasets.items():
        rows = alternate.get("assets")
        if not isinstance(rows, list):
            raise ValueError(f"alternate visual description dataset has no assets array: {alternate_path}")
        seen: set[str] = set()
        for row in rows:
            asset_id = row.get("assetId", row.get("id")) if isinstance(row, dict) else None
            if not isinstance(asset_id, str) or asset_id in seen:
                raise ValueError(f"invalid or duplicate alternate visual description ID: {asset_id!r}")
            seen.add(asset_id)
            canonical = canonical_rows.get(asset_id)
            if canonical is None or row.get("visualDescription") == canonical.get("visualDescription"):
                continue
            if (row.get("sourceSha256") != canonical.get("sourceSha256")
                    or row.get("pixelSha256") != canonical.get("pixelSha256")):
                continue
            superseded.add(f"{alternate_path}#{asset_id}")

    result = json.loads(json.dumps(registry))
    removed: list[str] = []
    for asset in result.get("assets", []):
        description = asset.get("description") or {}
        evidence = description.get("evidence")
        if not isinstance(evidence, list):
            continue
        keep = []
        for row in evidence:
            reference = row.get("reference") if isinstance(row, dict) else None
            if isinstance(row, dict) and row.get("kind") == "visual-review" and reference in superseded:
                removed.append(reference)
            else:
                keep.append(row)
        description["evidence"] = keep
    return result, sorted(set(removed))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--schema", type=Path, default=SCHEMA_DEFAULT)
    parser.add_argument("--receipt", type=Path, default=RECEIPT_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--reconcile-existing-visual-evidence", action="store_true",
                        help="remove conflicting hash-matched alternate visual-review refs without rebuilding PIC sources")
    parser.add_argument("--write", action="store_true", help="write registry and receipt (default is read-only)")
    args = parser.parse_args()
    registry = read_json(args.registry)
    if args.reconcile_existing_visual_evidence:
        canonical = read_json(args.visual_descriptions)
        alternates = {path.as_posix(): read_json(path) for path in ALTERNATE_VISUAL_DESCRIPTION_DEFAULTS}
        reconciled, removed = reconcile_superseded_visual_evidence(
            registry, canonical, args.visual_descriptions, alternates)
        from graphics_asset_registry import validate
        from import_cok_amiga_sprit_registry import validate_evidence_kinds
        errors, warnings = validate(reconciled)
        if errors:
            raise ValueError("reconciled registry validation failed: " + "; ".join(errors[:12]))
        validate_evidence_kinds(reconciled, args.schema)
        output = args.output or args.registry
        if args.write:
            output.write_text(json.dumps(reconciled, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"removedSupersededVisualReviewRefs": len(removed), "references": removed,
                          "registryAssets": len(reconciled["assets"]), "registryWarnings": len(warnings),
                          "write": args.write, "output": str(output.resolve())}, indent=2))
        return 0

    inventory = read_json(args.inventory)
    records, archives = decode_archives(args.dos_root.resolve(strict=True))
    by_id, pair_ids = match_inventory(inventory, args.source_root.resolve(strict=True),
                                      args.package.resolve(strict=True), records)
    merged = merge_registry(registry, records, by_id, pair_ids)
    merged, visual_description_counts = apply_visual_descriptions(
        merged, records, read_json(args.visual_descriptions), args.package.resolve(strict=True) / "images",
        args.visual_descriptions,
        {path.as_posix(): read_json(path) for path in ALTERNATE_VISUAL_DESCRIPTION_DEFAULTS})
    from graphics_asset_registry import validate
    from import_cok_amiga_sprit_registry import validate_evidence_kinds
    errors, warnings = validate(merged)
    if errors:
        raise ValueError("merged registry validation failed: " + "; ".join(errors[:12]))
    validate_evidence_kinds(merged, args.schema)
    receipt = {"schema": "cok-dos-pic-decode-receipt-v1",
               "provenance": "Repository game-folder copies; archive pins identify current bytes, not independent retail-install verification.",
               "scale": SCALE, "frameCount": len(records),
               "galleryPairCount": len({pair for pairs in pair_ids.values() for pair in pairs}),
               "archives": archives}
    output = args.output or args.registry
    if args.write:
        output.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"decodedSourceFrames": len(records), "distinctFrameAliases": sum(map(len, pair_ids.values())),
                      "restylePairs": receipt["galleryPairCount"], "registryAssets": len(merged["assets"]),
                      "registryAnimationGroups": len(merged["animationGroups"]),
                      "registryRestyles": len(merged["restyles"]), "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
                      "visualDescriptionRows": visual_description_counts["rows"],
                      "visualDescriptionUniquePixels": visual_description_counts["uniquePixelHashes"],
                      "registryWarnings": len(warnings), "write": args.write, "output": str(output.resolve()),
                      "receipt": str(args.receipt.resolve())}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
