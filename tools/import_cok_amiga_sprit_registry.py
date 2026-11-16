#!/usr/bin/env python3
"""Verify CoK Amiga SPRIT1/2 frames and merge source identities into the registry.

The default invocation is read-only. The archive copies used here are pinned fixture/candidate
copies; they have not been matched to the original WHDLoad install. This importer deliberately
records them as candidates and does not admit Restyle outputs to the game runtime.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import struct
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import daa_decode  # noqa: E402
import amiga_cokdok_render  # noqa: E402


REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
SCHEMA_DEFAULT = Path("docs/engine/research/graphics-asset-registry.schema.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
RENDER_MANIFEST_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/amiga_render_all/manifest.json")
RENDER_ROOT_DEFAULT = RENDER_MANIFEST_DEFAULT.parent
ARCHIVE_ROOT_DEFAULT = Path("C:/GoldBoxImg/batch03_work/e2e-amiga-fixture-view/ChampionsOfKrynn")
RECEIPT_DEFAULT = Path("docs/engine/research/cok-amiga-sprit-decode-receipt-v1.json")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-amiga-sprit-visual-descriptions-v1.json")
FRAME_W = 88
FRAME_H = 88
SCALE = 4
FRAME_LIMIT = 4_000_000
ARCHIVES = {
    "SPRIT1.DAA": {
        "disk": "disk2",
        "sha256": "3a851746076c54f097dce925e9866491c754364962754cd1bb663d3d06764694",
        "block_ids": {1, 2, 4, 5, 6, 8, 12, 14, 17, 19, 25, 28, 30, 35, 48, 51, 56},
    },
    "SPRIT2.DAA": {
        "disk": "disk3",
        "sha256": "d962bbb9b86775c996fddd39420e33b87612ec593a58d76ce7bd51dee3973785",
        "block_ids": {0, 3, 4, 5, 10, 14, 16, 17, 19, 22, 24, 25, 26, 28, 35, 48, 56},
    },
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes())


def contained_file(root: Path, raw_path: str | Path, label: str) -> Path:
    """Resolve a file under root, rejecting traversal and resolved symlink escapes."""
    base = root.resolve(strict=True)
    candidate = Path(raw_path)
    path = (candidate if candidate.is_absolute() else base / candidate).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{label}: path escapes approved root: {path}")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_evidence_kinds(document: Any, schema_path: Path = SCHEMA_DEFAULT) -> None:
    """Check every registry evidence kind against the declared JSON Schema enum."""
    schema = load_json(schema_path)
    allowed = set(schema["$defs"]["evidence"]["properties"]["kind"]["enum"])

    def visit(value: Any, location: str = "$") -> None:
        if isinstance(value, dict):
            if "kind" in value and "reference" in value and value["kind"] not in allowed:
                raise ValueError(f"{location}: evidence kind {value['kind']!r} is not allowed by {schema_path}")
            for key, child in value.items():
                visit(child, f"{location}.{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{location}[{index}]")

    visit(document)


def strict_amiga_rle(comp: bytes, output_limit: int = FRAME_LIMIT) -> bytes:
    """Decode the Amiga sprite RLE and reject truncated runs or excessive output."""
    result = bytearray()
    cursor = 0
    while cursor < len(comp):
        control = comp[cursor]
        cursor += 1
        if control <= 0x7F:
            count = control + 1
            end = cursor + count
            if end > len(comp):
                raise ValueError(f"truncated literal run at compressed offset {cursor - 1}")
            result.extend(comp[cursor:end])
            cursor = end
        elif control == 0x80:
            continue
        else:
            if cursor >= len(comp):
                raise ValueError(f"truncated repeat run at compressed offset {cursor - 1}")
            count = (0x100 - control) + 1
            result.extend(bytes((comp[cursor],)) * count)
            cursor += 1
        if len(result) > output_limit:
            raise ValueError(f"decoded stream exceeds {output_limit} bytes")
    return bytes(result)


def decode_indices(planar: bytes, width: int, height: int) -> bytes:
    row_bytes = ((width + 15) // 16) * 2
    plane_size = row_bytes * height
    if len(planar) != plane_size * 5:
        raise ValueError(f"expected {plane_size * 5} planar bytes, got {len(planar)}")
    out = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            byte_index = y * row_bytes + (x >> 3)
            shift = 7 - (x & 7)
            value = 0
            for plane in range(5):
                value |= ((planar[plane * plane_size + byte_index] >> shift) & 1) << plane
            out[row + x] = value
    return bytes(out)


def verify_4x_source_png(image: Image.Image, expected_rgb: bytes) -> str:
    """Require every 4x4 cell to equal one exact decoded native RGB pixel."""
    if image.format != "PNG" or image.mode != "RGB" or image.size != (FRAME_W * SCALE, FRAME_H * SCALE):
        raise ValueError(f"expected an RGB 4x PNG of {FRAME_W * SCALE}x{FRAME_H * SCALE}")
    pixels = np.asarray(image, dtype="uint8").reshape(FRAME_H, SCALE, FRAME_W, SCALE, 3)
    samples = pixels[:, 0, :, 0, :]
    if not (pixels == samples[:, None, :, None, :]).all():
        raise ValueError("source PNG is not exact 4x nearest-neighbour art")
    sampled = samples.tobytes()
    if sampled != expected_rgb:
        raise ValueError("source PNG RGB differs from strict archive decode")
    return sha256(sampled)


def palette_rgb(header: bytes) -> tuple[list[tuple[int, int, int]], bytes]:
    raw = header[11:75]
    if len(raw) != 64:
        raise ValueError("Amiga SPRIT palette is truncated")
    words = struct.unpack(">32H", raw)
    colors = [(((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17) for v in words]
    return colors, raw


def decode_block(comp: bytes) -> dict[str, Any]:
    stream = strict_amiga_rle(comp)
    if len(stream) < 75:
        raise ValueError("decompressed sub-block is shorter than its palette header")
    pix_off = stream[0]
    height, width_eighths = struct.unpack_from(">HH", stream, 1)
    nframes = stream[10]
    width = width_eighths * 8
    row_bytes = ((width + 15) // 16) * 2
    plane_size = row_bytes * height
    planar_size = plane_size * 5
    stride = planar_size + 1
    start = len(stream) - nframes * stride
    if (width, height, nframes) != (FRAME_W, FRAME_H, 3):
        raise ValueError(f"expected 88x88 with 3 frames, got {width}x{height} x{nframes}")
    if pix_off != 81 or start != 87 or len(stream) != start + nframes * stride:
        raise ValueError(f"unexpected stream layout: pixOff={pix_off}, start={start}, bytes={len(stream)}")
    palette, palette_bytes = palette_rgb(stream)
    stored: list[bytes] = []
    stored_rgb: list[bytes] = []
    candidate_rendered: list[bytes] = []
    frame_records: list[dict[str, Any]] = []
    for frame in range(nframes):
        offset = start + frame * stride
        planar = stream[offset:offset + planar_size]
        trailing = stream[offset + planar_size:offset + stride]
        if len(planar) != planar_size or len(trailing) != 1:
            raise ValueError(f"frame {frame}: truncated bitmap or trailing byte")
        indices = decode_indices(planar, width, height)
        raw_rgb = bytes(channel for index in indices for channel in palette[index])
        candidate_indices = indices if frame == 0 else bytes(
            a ^ b for a, b in zip(indices, decode_indices(stored[0], width, height)))
        candidate_rgb = bytes(channel for index in candidate_indices for channel in palette[index])
        transform = "candidate-tail-offset" if frame == 0 else "candidate-tail-offset-frame0-xor"
        # Keep archive-stored pixels distinct from the experimental tail/XOR display hypothesis.
        stored.append(planar)
        stored_rgb.append(raw_rgb)
        candidate_rendered.append(candidate_rgb)
        frame_records.append({
            "frame": frame,
            "renderingTransform": transform,
            "storedPlanarSha256": sha256(planar),
            "storedIndexSha256": sha256(indices),
            "storedRgbPixelSha256": sha256(raw_rgb),
            "candidateRenderedIndexSha256": sha256(candidate_indices),
            "candidateRenderedRgbPixelSha256": sha256(candidate_rgb),
            "trailingByteHex": trailing.hex(),
            "storedRgb": raw_rgb,
            "candidateRgb": candidate_rgb,
        })
    return {
        "stream": stream,
        "pixOff": pix_off,
        "width": width,
        "height": height,
        "frameCount": nframes,
        "rowBytes": row_bytes,
        "planeBytes": plane_size,
        "frameBytes": planar_size,
        "frameStride": stride,
        "bitmapStart": start,
        "palette": palette,
        "paletteSha256": sha256(palette_bytes),
        "frames": frame_records,
    }


def render_rows(path: Path) -> dict[tuple[str, int, int], dict[str, Any]]:
    rows = load_json(path).get("assets", [])
    result: dict[tuple[str, int, int], dict[str, Any]] = {}
    for row in rows:
        if row.get("game") != "cok" or row.get("family") != "SPRIT":
            continue
        archive = str(row.get("file", "")).upper()
        block = row.get("block_id")
        frame = row.get("frame")
        key = (archive, block, frame)
        if key in result:
            raise ValueError(f"duplicate Amiga render-manifest locator: {key}")
        result[key] = row
    return result


def pair_aliases(inventory: dict[str, Any]) -> dict[tuple[str, int, int], list[dict[str, Any]]]:
    by_locator: dict[tuple[str, int, int], list[dict[str, Any]]] = defaultdict(list)
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "Amiga" or alias.get("family") != "SPRIT":
                continue
            archive = str(alias.get("sourceArchive") or "").upper()
            block, frame = alias.get("asset"), alias.get("frame")
            if archive not in ARCHIVES or not isinstance(block, int) or not isinstance(frame, int):
                continue
            by_locator[(archive, block, frame)].append({"pair": pair, "alias": alias})
    return by_locator


def identity_id(archive: str, block: int, frame: int) -> str:
    entry = ARCHIVES[archive]
    return f"cok/amiga/{entry['disk']}/{archive.lower()}/block/{block}/frame/{frame}"


def asset_record(archive: str, archive_path: Path, archive_hash: str, block: int, frame: int,
                 frame_data: dict[str, Any], pair: dict[str, Any], source_path: Path) -> dict[str, Any]:
    source_file_hash = file_sha256(source_path)
    source_hash = pair["sourceSha256"]
    if source_file_hash != source_hash:
        raise ValueError(f"{archive}#{block}/f{frame}: source-PNG file hash differs from package pair")
    rgb = frame_data["candidateRgb"]
    pixel_hash = frame_data["candidateRenderedRgbPixelSha256"]
    transform = frame_data["renderingTransform"]
    return {
        "id": identity_id(archive, block, frame),
        "game": "cok",
        "edition": f"Amiga {ARCHIVES[archive]['disk']} candidate copy",
        "platform": "Amiga",
        "archive": {
            "name": archive,
            "path": archive_path.as_posix(),
            "sha256": archive_hash,
        },
        "locator": {"kind": "block-frame", "blockId": block, "frameIndex": frame,
                    "tileIndex": None, "cellIndex": None},
        "decoded": {"path": f"images/{source_hash}.png", "sha256": source_hash,
                    "pixelSha256": pixel_hash, "width": FRAME_W, "height": FRAME_H,
                    "renderingTransform": transform},
        "identityStatus": "candidate",
        "description": {
            "text": f"Amiga {archive} block {block} frame {frame}; depicted subject and game selector remain unknown.",
            "status": "unknown",
            "evidence": [
                {"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_sprit_registry.py",
                 "note": f"Archive-stored index and RGB hashes are recorded separately. The linked PNG is an experimental {transform} view; exact package pixels reproduce that candidate renderer, not native segment lengths or frame reconstruction."},
                {"kind": "existing-manifest", "reference": "C:/GoldBoxImg/cok_restyle_work/amiga_render_all/manifest.json",
                 "note": f"Source PNG SHA-256 {source_hash}; native row-major RGB SHA-256 {pixel_hash}."},
                {"kind": "game-data", "reference": archive_path.as_posix(),
                 "note": "Archive bytes are hash-pinned from a fixture/candidate copy. The original WHDLoad installation path was unavailable; source identity remains candidate."},
            ],
        },
        "gameConsumers": [{
            "status": "unknown",
            "use": f"Exact Amiga selector and route for {archive} block {block} frame {frame} are not established.",
            "evidence": [{"kind": "research-doc", "reference": "docs/engine/research/cok-art-identity-crosswalk-2026-10-31.md",
                          "note": "This registry import establishes archive frame identity and Restyle provenance only; no runtime admission."}],
        }],
        "animationGroupId": f"cok/amiga/{ARCHIVES[archive]['disk']}/{archive.lower()}/block/{block}/frames",
    }


def restyle_record(pair: dict[str, Any], source_ids: list[str]) -> dict[str, Any]:
    pair_id = pair["id"]
    source_hash = pair["sourceSha256"]
    output_hash = pair["outputSha256"]
    return {
        "id": f"restyle/cok-generated/{pair_id}",
        "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair_id,
                                "reference": f"restyle/cok-generated/manifest.json#{pair_id}"}],
        "sourceAssetIds": sorted(source_ids),
        "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one",
        "prompt": {"status": "unknown", "batch": None, "path": None, "sha256": None,
                   "textSha256": None, "inputPath": None, "inputSha256": None, "text": None,
                   "references": [], "referenceAssetIds": []},
        "outputs": [{"path": pair["output"], "sha256": output_hash, "role": "gallery-copy"}],
        "reviewStatus": "generated",
        "evidence": [{
            "kind": "existing-manifest",
            "reference": f"restyle/cok-generated/manifest.json#{pair_id}",
        "note": f"Exact inventory source/output pair {source_hash} → {output_hash}; the source PNG matches the current candidate tail/XOR rendering for these archive locators, not an independent native pixel golden; prompt text is unknown and composition review is not-reviewed.",
        }],
    }


def merge_records(registry: dict[str, Any], new_assets: list[dict[str, Any]],
                  new_restyles: list[dict[str, Any]], new_groups: list[dict[str, Any]],
                  new_links: list[dict[str, Any]]) -> tuple[int, int, int, int]:
    additions = []
    for field, incoming in (("assets", new_assets), ("restyles", new_restyles),
                            ("animationGroups", new_groups), ("crossVersionLinks", new_links)):
        key = "id" if field != "crossVersionLinks" else None
        existing = {row["id"]: row for row in registry[field]} if key else None
        for row in incoming:
            if key:
                row_id = row["id"]
                prior = existing.get(row_id)  # type: ignore[union-attr]
                if prior is not None and prior != row:
                    if field == "assets" and _merge_asset_visual_description(prior, row):
                        pass
                    elif field == "assets" and _is_candidate_render_refinement(prior, row):
                        old_decoded = prior.get("decoded", {})
                        old_description = prior.get("description", {})
                        preserve_visual = (old_description.get("visualDescription")
                                           and old_decoded.get("sha256") == row.get("decoded", {}).get("sha256")
                                           and old_decoded.get("pixelSha256") == row.get("decoded", {}).get("pixelSha256"))
                        visual_evidence = [copy.deepcopy(item) for item in old_description.get("evidence", [])
                                           if item.get("kind") == "visual-review"] if preserve_visual else []
                        visual_description = old_description.get("visualDescription") if preserve_visual else None
                        prior.clear()
                        prior.update(row)
                        if visual_description:
                            description = prior.setdefault("description", {})
                            description["visualDescription"] = visual_description
                            evidence = description.setdefault("evidence", [])
                            known_evidence = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in evidence}
                            for item in visual_evidence:
                                marker = json.dumps(item, sort_keys=True, ensure_ascii=False)
                                if marker not in known_evidence:
                                    evidence.append(item)
                                    known_evidence.add(marker)
                    elif field in {"restyles", "animationGroups"} and _merge_evidence_note_refinement(prior, row):
                        pass
                    else:
                        raise ValueError(f"conflicting existing {field} row: {row_id}")
                if prior is None:
                    registry[field].append(row)
                    additions.append(field)
            else:
                signature = (row["fromAssetId"], row["toAssetId"], row["relation"])
                prior = next((old for old in registry[field]
                              if (old["fromAssetId"], old["toAssetId"], old["relation"]) == signature), None)
                if prior is not None and prior != row:
                    if (prior.get("confidence") != row.get("confidence")
                            or set(prior) - {"evidence"} != set(row) - {"evidence"}
                            or {key: value for key, value in prior.items() if key != "evidence"}
                               != {key: value for key, value in row.items() if key != "evidence"}):
                        raise ValueError(f"conflicting existing cross-version link: {signature}")
                    evidence = prior.setdefault("evidence", [])
                    known = {(item.get("kind"), item.get("reference"), item.get("note")) for item in evidence}
                    for item in row.get("evidence", []):
                        marker = (item.get("kind"), item.get("reference"), item.get("note"))
                        if marker not in known:
                            evidence.append(item)
                            known.add(marker)
                elif prior is None:
                    registry[field].append(row)
                    additions.append(field)
    registry["assets"].sort(key=lambda row: row["id"])
    registry["restyles"].sort(key=lambda row: row["id"])
    registry["animationGroups"].sort(key=lambda row: row["id"])
    registry["crossVersionLinks"].sort(key=lambda row: (row["fromAssetId"], row["toAssetId"], row["relation"]))
    return tuple(additions.count(name) for name in ("assets", "restyles", "animationGroups", "crossVersionLinks"))


def _merge_asset_visual_description(prior: dict[str, Any], incoming: dict[str, Any]) -> bool:
    """Preserve a reviewed visible description on an otherwise exact importer rerun."""
    old = copy.deepcopy(prior)
    description = old.get("description")
    if not isinstance(description, dict) or not description.get("visualDescription"):
        return False
    visual_description = description.pop("visualDescription")
    evidence = description.get("evidence")
    if not isinstance(evidence, list):
        return False
    visual_reviews = [copy.deepcopy(item) for item in evidence if item.get("kind") == "visual-review"]
    description["evidence"] = [item for item in evidence if item.get("kind") != "visual-review"]
    if not visual_reviews or old != incoming:
        return False
    old_decoded, new_decoded = prior.get("decoded", {}), incoming.get("decoded", {})
    if (old_decoded.get("sha256") != new_decoded.get("sha256")
            or old_decoded.get("pixelSha256") != new_decoded.get("pixelSha256")):
        return False
    merged = copy.deepcopy(incoming)
    merged_description = merged.setdefault("description", {})
    merged_description["visualDescription"] = visual_description
    merged_evidence = merged_description.setdefault("evidence", [])
    known = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in merged_evidence}
    for item in visual_reviews:
        marker = json.dumps(item, sort_keys=True, ensure_ascii=False)
        if marker not in known:
            merged_evidence.append(item)
            known.add(marker)
    prior.clear()
    prior.update(merged)
    return True


def apply_visual_descriptions(registry: dict[str, Any], sources: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path, package_root: Path | None = None) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply candidate-render appearance notes to the exact Amiga SPRIT frame set."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("Amiga SPRIT visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(sources):
        raise ValueError(f"visual description coverage differs from decoded Amiga SPRIT frames: missing={len(set(sources)-set(by_id))}, extra={len(set(by_id)-set(sources))}")

    asset_map = {asset["id"]: asset for asset in registry["assets"]}
    dataset_sha = file_sha256(dataset_path)
    evidence_ref = f"{dataset_path.as_posix()}#"
    descriptions_by_pixel: dict[str, str] = {}
    for asset_id, row in by_id.items():
        source = sources[asset_id]
        asset = asset_map.get(asset_id)
        archive = str((asset or {}).get("archive", {}).get("name", "")).upper()
        if asset is None or asset.get("platform") != "Amiga" or archive not in ARCHIVES:
            raise ValueError(f"{asset_id}: visual description does not target a merged Amiga SPRIT source")
        decoded = asset.get("decoded") or {}
        source_hash = row.get("sourceSha256")
        pixel_hash = row.get("pixelSha256")
        description = row.get("visualDescription")
        if (source_hash != (source.get("decoded") or {}).get("sha256")
                or source_hash != decoded.get("sha256")
                or pixel_hash != (source.get("decoded") or {}).get("pixelSha256")
                or pixel_hash != decoded.get("pixelSha256")
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
        image_path = contained_file(root, image_store.name + "/" + image_name,
                                    f"{asset_id} visual-review image")
        if file_sha256(image_path) != source_hash:
            raise ValueError(f"{asset_id}: reviewed source PNG is missing or its SHA-256 differs")
        description_obj = asset.setdefault("description", {})
        description_obj["visualDescription"] = description
        evidence = description_obj.setdefault("evidence", [])
        owned = [i for i, item in enumerate(evidence) if item.get("kind") == "visual-review"
                 and str(item.get("reference", "")).startswith(evidence_ref)]
        item = {"kind": "visual-review", "reference": f"{evidence_ref}{asset_id}",
                "note": f"Visible appearance manually reviewed against exact candidate-view PNG SHA-256 {source_hash} and decoded pixel SHA-256 {pixel_hash}; dataset SHA-256 {dataset_sha}. Subject identity, game use, selector, and playback semantics remain unproven; the source frame rendering transform is recorded separately."}
        if owned:
            evidence[owned[0]] = item
            for index in reversed(owned[1:]):
                del evidence[index]
        else:
            evidence.append(item)
    return registry, {"rows": len(by_id), "uniquePixelHashes": len(descriptions_by_pixel)}


def _merge_evidence_note_refinement(prior: dict[str, Any], incoming: dict[str, Any]) -> bool:
    """Update importer-owned evidence notes while preserving historical alias evidence."""
    old, new = copy.deepcopy(prior), copy.deepcopy(incoming)
    old_evidence, new_evidence = old.pop("evidence", None), new.pop("evidence", None)
    if old != new or not isinstance(old_evidence, list) or not isinstance(new_evidence, list):
        return False
    if not new_evidence:
        return False
    def importer_owned(old_item: dict[str, Any], new_item: dict[str, Any]) -> bool:
        pair_note = old_item.get("note", "").startswith("Exact inventory source/output pair")
        sprit_receipt_note = (new_item.get("reference") == "docs/engine/research/cok-amiga-sprit-decode-receipt-v1.json"
                              and new_item.get("kind") == "decoded-pixels")
        return pair_note or sprit_receipt_note

    for new_item in new_evidence:
        match = next((old_item for old_item in old_evidence
                      if (old_item.get("kind"), old_item.get("reference"))
                      == (new_item.get("kind"), new_item.get("reference"))
                      and importer_owned(old_item, new_item)), None)
        if match is None:
            return False
    for new_item in new_evidence:
        match = next(old_item for old_item in old_evidence
                     if (old_item.get("kind"), old_item.get("reference"))
                     == (new_item.get("kind"), new_item.get("reference"))
                     and importer_owned(old_item, new_item))
        match["note"] = new_item.get("note")
    prior["evidence"] = old_evidence
    return True


def _is_candidate_render_refinement(prior: dict[str, Any], incoming: dict[str, Any]) -> bool:
    if (prior.get("platform") != "Amiga" or incoming.get("platform") != "Amiga"
            or prior.get("archive", {}).get("name", "").upper() not in ARCHIVES
            or prior.get("id") != incoming.get("id")):
        return False
    old, new = copy.deepcopy(prior), copy.deepcopy(incoming)
    old_decoded = old.get("decoded")
    new_decoded = new.get("decoded")
    if not isinstance(old_decoded, dict) or not isinstance(new_decoded, dict):
        return False
    old_transform = old_decoded.pop("renderingTransform", None)
    new_transform = new_decoded.pop("renderingTransform", None)
    if old_transform is not None or new_transform not in {
        "candidate-tail-offset", "candidate-tail-offset-frame0-xor",
    }:
        return False
    old_description = old.get("description")
    new_description = new.get("description")
    if not isinstance(old_description, dict) or not isinstance(new_description, dict):
        return False
    old_description.pop("visualDescription", None)
    old_evidence = old_description.get("evidence")
    new_evidence = new_description.get("evidence")
    if not isinstance(old_evidence, list) or not isinstance(new_evidence, list):
        return False
    old_evidence[:] = [item for item in old_evidence if item.get("kind") != "visual-review"]
    if len(old_evidence) != len(new_evidence):
        return False
    for left, right in zip(old_evidence, new_evidence):
        if (left.get("kind"), left.get("reference")) != (right.get("kind"), right.get("reference")):
            return False
        left.pop("note", None)
        right.pop("note", None)
    return old == new


def build(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any], dict[str, int]]:
    archive_root = args.archive_root.resolve(strict=True)
    render_root = args.render_root.resolve(strict=True)
    package_root = (args.package_root or args.inventory.parent).resolve(strict=True)
    render_manifest = contained_file(render_root, args.render_manifest, "SPRIT render manifest")
    render_index = render_rows(render_manifest)
    inventory = load_json(args.inventory)
    pairs_by_locator = pair_aliases(inventory)
    registry = load_json(args.registry)
    old_asset_ids = {row["id"] for row in registry["assets"]}
    old_restyle_ids = {row["id"] for row in registry["restyles"]}
    old_group_ids = {row["id"] for row in registry["animationGroups"]}
    old_link_count = len(registry["crossVersionLinks"])
    archive_receipts: list[dict[str, Any]] = []
    assets_by_id: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, tuple[dict[str, Any], set[str]]] = {}
    pixel_members: dict[str, list[str]] = defaultdict(list)
    seen_locators: set[tuple[str, int, int]] = set()
    added_counts = (0, 0, 0, 0)

    # Decode the archive denominator first; Restyle inventory rows cannot define source coverage.
    for archive, spec in ARCHIVES.items():
        archive_path = contained_file(archive_root, Path(spec["disk"]) / archive,
                                      f"{archive} source archive")
        data = archive_path.read_bytes()
        archive_hash = sha256(data)
        if archive_hash != spec["sha256"]:
            raise ValueError(f"{archive_path}: archive SHA-256 {archive_hash} != pinned {spec['sha256']}")
        kind, data_base, entries = daa_decode.parse_container(data)
        if kind != "index" or data_base != 104:
            raise ValueError(f"{archive}: expected validated six-byte index with base 104, got {kind}/{data_base}")
        ids = [entry[0] for entry in entries]
        if len(ids) != 17 or len(set(ids)) != len(ids) or set(ids) != spec["block_ids"]:
            raise ValueError(f"{archive}: six-byte TOC IDs differ from the pinned 17-block denominator")
        offsets = [entry[1] for entry in entries]
        if offsets != sorted(offsets) or not offsets or offsets[0] != 0:
            raise ValueError(f"{archive}: invalid sub-block offset order")
        frame_rows: list[dict[str, Any]] = []
        reference_pics, notes = amiga_cokdok_render.decode_daa("cok", str(archive_path), spec["disk"])
        if notes:
            raise ValueError(f"{archive}: reference renderer notes: {notes}")
        reference_frames = {(pic.block, pic.frame): pic for pic in reference_pics if pic.family == "SPRIT"}
        for index, (block, offset) in enumerate(entries):
            end = offsets[index + 1] if index + 1 < len(offsets) else len(data) - data_base
            if not (0 <= offset < end <= len(data) - data_base):
                raise ValueError(f"{archive}#{block}: invalid compressed span {offset}:{end}")
            comp = data[data_base + offset:data_base + end]
            decoded = decode_block(comp)
            block_frames: list[dict[str, Any]] = []
            for frame_data in decoded["frames"]:
                frame = frame_data["frame"]
                locator = (archive, block, frame)
                render_row = render_index.get(locator)
                matches = pairs_by_locator.get(locator, [])
                if render_row is None:
                    raise ValueError(f"render manifest is missing frame locator {locator}")
                if len(matches) != 1:
                    raise ValueError(f"expected one exact Restyle pair for {locator}, got {len(matches)}")
                pair, alias = matches[0]["pair"], matches[0]["alias"]
                if alias.get("sourceArchive", "").upper() != archive:
                    raise ValueError(f"{locator}: alias source archive is not exact")
                source_path = contained_file(render_root, render_row["output"],
                                              f"{archive}#{block}/frame/{frame} render input")
                with Image.open(source_path) as source_image:
                    pixel_hash = verify_4x_source_png(source_image, frame_data["candidateRgb"])
                    source_png_hash = file_sha256(source_path)
                if (source_png_hash != pair["sourceSha256"]
                        or render_row.get("pixel_sha256") != pixel_hash
                        or pixel_hash != frame_data["candidateRenderedRgbPixelSha256"]):
                    raise ValueError(f"{locator}: packaged/render source SHA does not match exact source PNG")
                packaged_source = contained_file(package_root, f"images/{source_png_hash}.png",
                                                 f"{archive}#{block}/frame/{frame} packaged source")
                packaged_output = contained_file(package_root, pair["output"],
                                                 f"{archive}#{block}/frame/{frame} packaged output")
                if file_sha256(packaged_source) != source_png_hash:
                    raise ValueError(f"{locator}: packaged source copy is missing or hash-mismatched")
                if file_sha256(packaged_output) != pair["outputSha256"]:
                    raise ValueError(f"{locator}: packaged output copy is missing or hash-mismatched")
                reference = reference_frames.get((block, frame))
                if reference is None or reference.w != FRAME_W or reference.h != FRAME_H:
                    raise ValueError(f"{archive}#{block}/f{frame}: corrected reference decoder omitted the frame")
                if reference.rgb().tobytes() != frame_data["candidateRgb"]:
                    raise ValueError(f"{archive}#{block}/f{frame}: strict decode differs from corrected reference decoder")

                source_id = identity_id(archive, block, frame)
                record = asset_record(archive, archive_path, archive_hash, block, frame,
                                      frame_data, pair, packaged_source)
                assets_by_id[source_id] = record
                pixel_members[frame_data["storedRgbPixelSha256"]].append(source_id)
                if pair["id"] not in pair_sources:
                    pair_sources[pair["id"]] = (pair, set())
                pair_sources[pair["id"]][1].add(source_id)
                seen_locators.add(locator)
                block_frames.append({k: v for k, v in frame_data.items()
                                     if k not in {"storedRgb", "candidateRgb"}})

            frame_rows.append({
                "blockId": block,
                "compressedOffset": offset,
                "compressedBytes": len(comp),
                "compressedSha256": sha256(comp),
                "decompressedBytes": len(decoded["stream"]),
                "decompressedSha256": sha256(decoded["stream"]),
                "pixOff": decoded["pixOff"],
                "bitmapStart": decoded["bitmapStart"],
                "width": decoded["width"],
                "height": decoded["height"],
                "frameCount": decoded["frameCount"],
                "rowBytes": decoded["rowBytes"],
                "planeBytes": decoded["planeBytes"],
                "planarFrameBytes": decoded["frameBytes"],
                "frameStrideBytes": decoded["frameStride"],
                "paletteSha256": decoded["paletteSha256"],
                "frames": block_frames,
            })
        archive_receipts.append({
            "name": archive,
            "disk": spec["disk"],
            "path": archive_path.as_posix(),
            "sha256": archive_hash,
            "bytes": len(data),
            "dataBase": data_base,
            "tocBlockCount": len(entries),
            "tocBlockIds": ids,
            "blocks": frame_rows,
        })

    expected_locators = {(archive, block, frame) for archive, spec in ARCHIVES.items()
                         for block in spec["block_ids"] for frame in range(3)}
    if seen_locators != expected_locators:
        missing = sorted(expected_locators - seen_locators)
        extra = sorted(seen_locators - expected_locators)
        raise ValueError(f"source/pair join denominator mismatch: missing={missing[:8]}, extra={extra[:8]}")
    expected_render_keys = {(archive, block, frame) for archive, spec in ARCHIVES.items()
                            for block in spec["block_ids"] for frame in range(3)}
    if set(render_index) != expected_render_keys:
        raise ValueError("render manifest does not match the complete 102-frame archive denominator")

    groups: list[dict[str, Any]] = []
    for archive, spec in ARCHIVES.items():
        for block in sorted(spec["block_ids"]):
            group_id = f"cok/amiga/{spec['disk']}/{archive.lower()}/block/{block}/frames"
            ids = [identity_id(archive, block, frame) for frame in range(3)]
            evidence = [{
                "kind": "decoded-pixels",
                "reference": args.receipt.as_posix(),
                "note": "Frames are stored separately in the archive. Tail offset and frame0-XOR are experimental preview hypotheses, not native-proven rendering. Exact animation selector/playback semantics remain unknown.",
            }]
            groups.append({"id": group_id, "semantics": "unknown", "playback": "unknown",
                           "status": "unknown", "evidence": evidence,
                           "frames": [{"assetId": asset_id, "order": frame, "role": f"frame {frame}"}
                                      for frame, asset_id in enumerate(ids)]})

    restyles = [restyle_record(pair, sorted(source_ids)) for pair, source_ids in pair_sources.values()]
    links: list[dict[str, Any]] = []
    for pixel_hash, ids in sorted(pixel_members.items()):
        ids = sorted(set(ids))
        for left, right in zip(ids, ids[1:]):
            links.append({"fromAssetId": left, "toAssetId": right, "relation": "pixel-identical",
                          "confidence": "verified", "evidence": [{
                              "kind": "decoded-pixels",
                              "reference": args.receipt.as_posix(),
                              "note": f"Exact 88x88 stored-frame row-major RGB equality under the hash-pinned per-block palette; pixel SHA-256 {pixel_hash}. Archive-qualified IDs remain distinct; candidate preview transforms are excluded from this edge.",
                          }]})

    added_counts = merge_records(registry, list(assets_by_id.values()), restyles, groups, links)
    visual_sources = {asset_id: {"decoded": asset["decoded"]}
                      for asset_id, asset in assets_by_id.items()}
    registry, visual_description_counts = apply_visual_descriptions(
        registry, visual_sources, load_json(args.visual_descriptions),
        package_root / "images", args.visual_descriptions, package_root)
    validate_evidence_kinds(registry)

    render_manifest_hash = file_sha256(render_manifest)
    inventory_hash = file_sha256(args.inventory)
    registry_input_hash = file_sha256(args.registry)
    receipt = {
        "schema": "cok-amiga-sprit-decode-receipt-v1",
        "generatedBy": "tools/import_cok_amiga_sprit_registry.py",
        "decoderScriptSha256": file_sha256(Path(__file__).resolve()),
        "referenceRendererSha256": file_sha256(ROOT / "tools/amiga_cokdok_render.py"),
        "sourceRenderManifest": {"path": args.render_manifest.as_posix(), "sha256": render_manifest_hash},
        "restyleInventory": {"path": args.inventory.as_posix(), "sha256": inventory_hash},
        "baseRegistry": {"path": args.registry.as_posix(), "sha256": registry_input_hash},
        "identityStatus": "candidate",
        "provenanceLimit": "Both archive hashes are pinned from fixture/candidate copies; the original WHDLoad installation path was unavailable.",
        "decoderFindings": {
            "rle": "Strict full-entry candidate decode; native CoK SPRIT1/SPRIT2 entries use separately length-delimited compressed chunks as recorded by cok-amiga-sprit-native-audit-v1.json.",
            "candidateFrameStart": "The offline candidate renderer uses decoded length - 3 * (planar frame bytes + 1); native Hunk42 segment capacities do not establish an exact flat bitmap start.",
            "candidateXorView": "The offline candidate renderer leaves frame0 stored pixels unchanged and XORs frames1/2 against frame0. The exact native CoK Amiga SPRIT1/SPRIT2 candidate archive audit confirms minterm 0x60 source/destination XOR composition for selected work frames; the whole-entry/tail parse remains a candidate framing explanation, not the native chunk model.",
            "nativeLoaderAudit": "Exact CoK Amiga SPRIT1.DAA and SPRIT2.DAA candidate evidence is in docs/engine/research/cok-amiga-sprit-native-audit-v1.json: all 34 entries use the 81-byte compressed header and three length-delimited frame chunks; all 102 segmented frames match the existing stored planar hashes and consume each entry exactly. The shared Hunk42 selector passes minterm 0x60 to graphics.library BltBitMap, which the official AmigaOS minterm reference defines as source/destination XOR. This covers only the two hash-pinned candidate archives and does not prove clean-retail provenance or runtime behavior.",
            "semantics": "Frame selector/playback semantics remain unknown. This registry import does not admit runtime art.",
            "independentGoldenLimit": "Exact source-PNG comparison reproduces the experimental tail/XOR renderer; it is not an independent historical or native pixel golden.",
        },
        "archives": archive_receipts,
    }
    summary = {
        "verifiedArchiveBlocks": sum(len(a["blocks"]) for a in archive_receipts),
        "verifiedFrameLocators": len(assets_by_id),
        "uniqueRestylePairs": len(restyles),
        "animationGroups": len(groups),
        "duplicatePixelGroups": sum(len(v) > 1 for v in pixel_members.values()),
        "pixelIdenticalLinks": len(links),
        "restyleGalleryReferences": len(restyles),
    }
    return registry, receipt, {**summary, "_newAssets": added_counts[0], "_newRestyles": added_counts[1],
                               "visualDescriptionRows": visual_description_counts["rows"],
                               "visualDescriptionUniquePixels": visual_description_counts["uniquePixelHashes"],
                               "_newGroups": added_counts[2], "_newLinks": added_counts[3],
                               "_oldAssets": len(old_asset_ids), "_oldRestyles": len(old_restyle_ids),
                               "_oldGroups": len(old_group_ids), "_oldLinks": old_link_count,
                               "_unused": len(pair_sources)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--render-manifest", type=Path, default=RENDER_MANIFEST_DEFAULT)
    parser.add_argument("--render-root", type=Path, default=RENDER_ROOT_DEFAULT)
    parser.add_argument("--archive-root", type=Path, default=ARCHIVE_ROOT_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=None,
                        help="root containing the generated Restyle images; defaults to --inventory's directory")
    parser.add_argument("--receipt", type=Path, default=RECEIPT_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write the merged registry and hash-only receipt")
    args = parser.parse_args()
    try:
        registry, receipt, summary = build(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({k: v for k, v in summary.items() if not k.startswith("_")} | {
        "registryAssets": len(registry["assets"]), "registryRestyles": len(registry["restyles"]),
        "registryAnimationGroups": len(registry["animationGroups"]),
        "registryCrossVersionLinks": len(registry["crossVersionLinks"]),
        "visualDescriptionRows": summary["visualDescriptionRows"],
        "visualDescriptionUniquePixels": summary["visualDescriptionUniquePixels"],
        "write": args.write,
    }, indent=2))
    if args.write:
        write_json_atomic(args.receipt, receipt)
        write_json_atomic(args.registry, registry)
    return 0


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as temp:
            json.dump(value, temp, ensure_ascii=False, indent=2)
            temp.write("\n")
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


if __name__ == "__main__":
    raise SystemExit(main())
