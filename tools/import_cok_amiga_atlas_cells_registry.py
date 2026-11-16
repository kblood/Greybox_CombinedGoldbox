#!/usr/bin/env python3
"""Verify three CoK atlas selectors on six pinned ILBMs; dry-run unless --write."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
AMIGA_DEFAULT = Path("C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json")
CONTRACT = "docs/engine/research/cok-player-icon-source-contract-2026-10-26.md"
CELLS = (1, 32, 67)
ATLAS_PINS = {
    "charS.LBM": ("51cfc7de6f3c8004de820ee9758eb3f785bedff6a808c21d58d0d2964b7963c3",
                  "b61f17f3a7e0c908dee28db5c71162e1dbcb58b1b5dda30cb8862b35cb99cebe"),
    "charT.LBM": ("e17783a48aec7d7708bc3d3af4c7cc3adc496376d11aa4cf2abbea4ac9d1ce72",
                  "566ff7ad72db7d9173c1ca00c7b02ef1300b077d8d29de22fe631590849126b8"),
}
# Independent historical pins from the 2026-10-26 source contract, not regenerated goldens.
CHART_PINS = {
    1: ("d9cee48c65c0ef7579ad93979a73ba6dbd746218fae3836b0e3f7df3a8efb585",
        "f9d1ca2fd376cee2597b988d443824c110986e22248831e844ff546d78743aab", 172),
    32: ("4ee6edc24d17b246e40bee987544f1000f498cd165b6c04733b9d182a0b36fe2",
         "afcd9411d9bcfe0a4d4c183397bb4f493887f7afd947835cc84f32a6580594a5", 160),
    67: ("c16ae6024f26497cb3d5e0db63cdd8d6a8cb77f7042866717f4056dd3f4f5d41",
         "10b95930d6221318f2cc87831513e563305493f60927460fa6d0e894b43bc5ca", 27),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cell_origin(cell: int) -> tuple[int, int]:
    if isinstance(cell, bool) or not isinstance(cell, int) or not 1 <= cell <= 96:
        raise ValueError("cell must be a one-based selector in the bounded 12-column grid")
    return ((cell - 1) % 12) * 24, ((cell - 1) // 12) * 24


def decode_five_planes(data: bytes) -> bytes:
    """Strict independent ILBM decoder; return five-bit indices in row-major order."""
    if len(data) < 12 or data[:4] != b"FORM" or data[8:12] != b"ILBM":
        raise ValueError("expected FORM ILBM")
    form_end = struct.unpack_from(">I", data, 4)[0] + 8
    # charS has 1,244 trailing bytes outside its declared FORM. Decode the complete
    # declared BODY only; tolerate this exact historical input, not arbitrary tails.
    if form_end != len(data) and not (form_end == 15260 and len(data) == 16504
                                      and sha256(data) == ATLAS_PINS["charS.LBM"][0]):
        raise ValueError("FORM extent differs from file size")
    chunks: dict[bytes, bytes] = {}
    cursor = 12
    while cursor < form_end:
        if cursor + 8 > form_end:
            raise ValueError("truncated chunk header")
        kind, size = struct.unpack_from(">4sI", data, cursor)
        start = cursor + 8
        cursor = start + size + (size & 1)
        if cursor > form_end or (kind in (b"BMHD", b"BODY") and kind in chunks):
            raise ValueError("truncated or repeated ILBM chunk")
        chunks[kind] = data[start:start + size]
    header = chunks.get(b"BMHD", b"")
    if len(header) != 20 or b"BODY" not in chunks:
        raise ValueError("missing BODY or invalid BMHD")
    width, height, _x, _y, planes, masking, compression = struct.unpack_from(">HHhhBBB", header)
    if (width, height, planes, masking) != (320, 200, 5, 0) or compression not in (0, 1):
        raise ValueError("expected 320x200 five image planes, masking=0, compression 0/1")
    row_bytes, need = 40, 40 * 5 * 200
    body = chunks[b"BODY"]
    if compression == 0:
        raw = body
    else:
        expanded = bytearray()
        pos = 0
        while pos < len(body):
            control = body[pos]
            pos += 1
            if control == 128:
                continue
            count = control + 1 if control < 128 else 257 - control
            consumed = count if control < 128 else 1
            if pos + consumed > len(body):
                raise ValueError("truncated ByteRun1 packet")
            expanded.extend(body[pos:pos + count] if control < 128 else body[pos:pos + 1] * count)
            pos += consumed
            if len(expanded) > need:
                raise ValueError("ByteRun1 BODY overflow")
        raw = bytes(expanded)
    if len(raw) != need:
        raise ValueError("BODY extent differs from five-plane geometry")
    indices = bytearray(width * height)
    for y in range(height):
        for plane in range(5):
            base = (y * 5 + plane) * row_bytes
            for x in range(width):
                indices[y * width + x] |= ((raw[base + x // 8] >> (7 - x % 8)) & 1) << plane
    return bytes(indices)


def extract_cell(indices: bytes, cell: int) -> tuple[bytes, bytes, bytes]:
    if len(indices) != 320 * 200 or any(value > 31 for value in indices):
        raise ValueError("expected complete five-bit atlas index array")
    x, y = cell_origin(cell)
    raw = b"".join(indices[(y + row) * 320 + x:(y + row) * 320 + x + 24] for row in range(24))
    colors = bytes(value & 15 for value in raw)
    opaque = bytes(1 - ((value >> 4) & 1) for value in raw)
    return raw, colors, opaque


def decode_cmap(data: bytes) -> bytes:
    """Return the source ILBM's normalized low-four-bit RGB palette, without saving pixels."""
    if len(data) < 12 or data[:4] != b"FORM" or data[8:12] != b"ILBM":
        raise ValueError("expected FORM ILBM for CMAP decode")
    form_end = struct.unpack_from(">I", data, 4)[0] + 8
    if form_end != len(data) and not (form_end == 15260 and len(data) == 16504
                                      and sha256(data) == ATLAS_PINS["charS.LBM"][0]):
        raise ValueError("FORM extent differs from file size")
    cursor = 12
    cmap = None
    while cursor < form_end:
        if cursor + 8 > form_end:
            raise ValueError("truncated ILBM chunk header")
        kind, size = struct.unpack_from(">4sI", data, cursor)
        start, end = cursor + 8, cursor + 8 + size
        cursor = end + (size & 1)
        if end > form_end:
            raise ValueError("truncated ILBM chunk")
        if kind == b"CMAP":
            if cmap is not None:
                raise ValueError("repeated CMAP chunks")
            cmap = data[start:end]
    if cmap is None or len(cmap) < 48 or len(cmap) % 3:
        raise ValueError("CMAP must contain at least 16 complete RGB colors")
    palette_rgb = bytes(cmap[:48])
    if all(value % 16 == 0 for value in palette_rgb):
        palette_rgb = bytes(value | (value >> 4) for value in palette_rgb)
    return palette_rgb


def render_cell_rgba(colors: bytes, opaque: bytes, palette_rgb: bytes) -> bytes:
    """Decode a 24x24 RGBA view using the source palette and verified fifth-plane mask."""
    if len(colors) != 576 or len(opaque) != 576 or len(palette_rgb) != 48:
        raise ValueError("expected 24x24 color/mask planes and 16 RGB palette entries")
    rgba = bytearray(576 * 4)
    for index, (color, alpha) in enumerate(zip(colors, opaque)):
        if color > 15 or alpha not in (0, 1):
            raise ValueError("cell color/mask values are outside their decoded ranges")
        rgba[index * 4:index * 4 + 3] = palette_rgb[color * 3:color * 3 + 3]
        rgba[index * 4 + 3] = 255 if alpha else 0
    return bytes(rgba)


def source_id(disk: int, filename: str, cell: int | None = None) -> str:
    base = f"cok/amiga/disk{disk}/lbm/{filename.lower()}"
    return f"{base}/whole" if cell is None else f"{base}/cell/{cell}"


def decode_sources(amiga_root: Path) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    root = amiga_root.resolve(strict=True)
    records: dict[str, dict[str, Any]] = {}
    receipt: list[dict[str, Any]] = []
    canonical: dict[str, bytes] = {}
    for disk in (1, 2, 3):
        for filename, (archive_hash, index_hash) in ATLAS_PINS.items():
            path = (root / f"disk{disk}" / filename).resolve(strict=True)
            if not path.is_relative_to(root):
                raise ValueError("atlas path escapes approved root")
            data = path.read_bytes()
            if sha256(data) != archive_hash:
                raise ValueError(f"{path}: source LBM hash differs from pin")
            if filename in canonical and data != canonical[filename]:
                raise ValueError(f"{path}: duplicate disk atlas bytes differ")
            canonical[filename] = data
            indices = decode_five_planes(data)
            if sha256(indices) != index_hash:
                raise ValueError(f"{path}: complete five-plane indices differ from source-contract pin")
            palette_rgb = decode_cmap(data)
            for cell in CELLS:
                raw, colors, opaque = extract_cell(indices, cell)
                raw_hash, mask_hash, count = sha256(raw), sha256(opaque), sum(opaque)
                color_hash = sha256(colors)
                palette_hash = sha256(palette_rgb)
                rgba_hash = sha256(render_cell_rgba(colors, opaque, palette_rgb))
                if filename == "charT.LBM" and (raw_hash, mask_hash, count) != CHART_PINS[cell]:
                    raise ValueError(f"{path} cell {cell}: historical raw-index/mask/count pins differ")
                asset_id = source_id(disk, filename, cell)
                x, y = cell_origin(cell)
                detail = {"assetId": asset_id, "x": x, "y": y, "width": 24, "height": 24,
                          "rawIndexSha256": raw_hash, "colorIndexSha256": color_hash,
                          "opaqueMaskSha256": mask_hash, "paletteRgbSha256": palette_hash,
                          "renderedRgbaSha256": rgba_hash, "opaquePixels": count}
                receipt.append(detail)
                decoded_evidence = {"kind": "decoded-pixels", "reference": f"{path.as_posix()}#cell/{cell}",
                    "note": f"24x24 at ({x},{y}), one-based 12-column grid; raw five-bit index SHA-256 {raw_hash}; "
                            f"low-four-bit color SHA-256 {color_hash}; inverted fifth-plane one-byte opaque-mask "
                            f"SHA-256 {mask_hash}; {count}/576 opaque pixels. No cell PNG is admitted."}
                selector_evidence = {"kind": "research-doc", "reference": CONTRACT,
                    "note": "Pinned disk1/game SHA-256 99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102; "
                            "static hunk66:0D2A extraction, 0EC6..0F20 body<=31 selection: atlas selector1 chooses "
                            "charS, other branch charT; body1 selects 1/32, head5 selects 67. The documented "
                            "creation-derived candidate selects charT only; charS uses the same extraction geometry. "
                            "This is retained source provenance, not fresh executable validation or observed runtime use."}
                records[asset_id] = {
                    "id": asset_id, "game": "cok", "edition": f"Amiga disk {disk}", "platform": "Amiga",
                    "archive": {"name": filename, "path": path.as_posix(), "sha256": archive_hash},
                    "locator": {"kind": "atlas-cell", "blockId": None, "frameIndex": None,
                                "tileIndex": None, "cellIndex": cell},
                    "decoded": None, "identityStatus": "source-pinned",
                    "description": {"text": f"{filename} cell {cell}: a source-verified atlas selector; "
                                            "subject identity and logical appearance remain unresolved.",
                                    "status": "unknown", "evidence": [decoded_evidence]},
                    "gameConsumers": [{"status": "partial", "use": "Static player-atlas extraction provenance only; "
                                       "no observed game use, DOS counterpart, composed appearance or runtime admission.",
                                       "evidence": [selector_evidence]}],
                    "animationGroupId": None,
                }
    return records, receipt


def apply_visual_descriptions(records: dict[str, dict[str, Any]], receipt: list[dict[str, Any]],
                              dataset: dict[str, Any], dataset_path: Path) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    """Attach visible-only wording to the exact 18 cells using pinned archive/plane evidence."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("atlas-cell visual-description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate atlas-cell visual-description ID: {asset_id!r}")
        by_id[asset_id] = row
    if set(by_id) != set(records):
        raise ValueError(f"atlas-cell visual-description coverage differs: missing={len(set(records)-set(by_id))}, extra={len(set(by_id)-set(records))}")
    receipt_by_id = {row["assetId"]: row for row in receipt}
    if len(receipt_by_id) != len(receipt) or set(receipt_by_id) != set(records):
        raise ValueError("atlas-cell receipt must exactly cover description targets")
    result = copy.deepcopy(records)
    dataset_hash = sha256(dataset_path.read_bytes())
    wordings: dict[tuple[Any, ...], str] = {}
    for asset_id, row in by_id.items():
        asset = result[asset_id]
        detail = receipt_by_id[asset_id]
        archive_path = asset["archive"]["path"]
        cell = asset["locator"]["cellIndex"]
        if row.get("archivePath") != archive_path:
            raise ValueError(f"{asset_id}: archivePath differs from pinned source")
        if row.get("archiveSha256") != asset["archive"]["sha256"]:
            raise ValueError(f"{asset_id}: archiveSha256 differs from pinned source")
        if row.get("cellIndex") != cell:
            raise ValueError(f"{asset_id}: cellIndex differs from pinned source")
        hash_fields = ("rawIndexSha256", "colorIndexSha256", "opaqueMaskSha256", "paletteRgbSha256", "renderedRgbaSha256")
        for field in hash_fields:
            if row.get(field) != detail.get(field):
                raise ValueError(f"{asset_id}: {field} differs from decoded archive/cell evidence")
        description = row.get("visualDescription")
        if not isinstance(description, str) or not description.strip():
            raise ValueError(f"{asset_id}: visualDescription must be nonempty text")
        duplicate_key = (detail["width"], detail["height"], detail["renderedRgbaSha256"])
        prior = wordings.setdefault(duplicate_key, description)
        if prior != description:
            raise ValueError(f"{asset_id}: exact archive/cell duplicate has conflicting visual wording")
        evidence = row.get("evidence")
        expected_reference = f"{archive_path}#cell/{cell}"
        if (not isinstance(evidence, list) or len(evidence) != 1 or not isinstance(evidence[0], dict)
                or evidence[0].get("kind") != "visual-review" or evidence[0].get("reference") != expected_reference
                or not isinstance(evidence[0].get("note"), str)
                or "visible appearance only" not in evidence[0]["note"].lower()
                or "does not infer" not in evidence[0]["note"].lower()):
            raise ValueError(f"{asset_id}: visual review must cite exact archive cell and limit claims")
        note = evidence[0]["note"].lower()
        for digest in (row["archiveSha256"], *(row[field] for field in hash_fields)):
            if digest.lower() not in note:
                raise ValueError(f"{asset_id}: visual-review note omits an exact source/render hash")
        desc = asset["description"]
        desc["visualDescription"] = description
        review_reference = f"{dataset_path.as_posix()}#{asset_id}"
        imported_review = {"kind": "visual-review", "reference": review_reference,
                           "note": f"Visible appearance manually reviewed from exact source palette and fifth-plane mask; archive SHA-256 {row['archiveSha256']}, raw-index SHA-256 {row['rawIndexSha256']}, color-index SHA-256 {row['colorIndexSha256']}, opaque-mask SHA-256 {row['opaqueMaskSha256']}, palette RGB SHA-256 {row['paletteRgbSha256']}, rendered RGBA SHA-256 {row['renderedRgbaSha256']}; dataset SHA-256 {dataset_hash}. No subject identity, observed runtime use, selector semantics, or playback meaning is inferred."}
        owned = [i for i, item in enumerate(desc["evidence"])
                 if item.get("kind") == "visual-review" and item.get("reference") == review_reference]
        if owned:
            desc["evidence"][owned[0]] = imported_review
            for index in reversed(owned[1:]):
                del desc["evidence"][index]
        else:
            desc["evidence"].append(imported_review)
    return result, {"rows": len(by_id), "uniquePixelGroups": len(wordings)}


def merge_registry(registry: dict[str, Any], records: dict[str, dict[str, Any]],
                   receipt: list[dict[str, Any]]) -> tuple[dict[str, Any], int]:
    result = copy.deepcopy(registry)
    assets = {asset["id"]: asset for asset in result["assets"]}
    for asset_id, record in records.items():
        whole_id = asset_id.rsplit("/cell/", 1)[0] + "/whole"
        whole = assets.get(whole_id)
        if not whole or whole.get("archive") != record["archive"] or whole.get("locator", {}).get("kind") != "whole-image":
            raise ValueError(f"{asset_id}: pinned whole-image parent missing or conflicting")
        if asset_id in assets and assets[asset_id] != record:
            old = assets[asset_id]
            old_base, new_base = copy.deepcopy(old), copy.deepcopy(record)
            old_description = old_base.pop("description", {})
            new_description = new_base.pop("description", {})
            old_visual = old_description.pop("visualDescription", None)
            new_visual = new_description.pop("visualDescription", None)
            old_evidence = old_description.pop("evidence", [])
            new_evidence = new_description.pop("evidence", [])
            remaining = list(new_evidence)
            for item in old_evidence:
                if item not in remaining:
                    break
                remaining.remove(item)
            else:
                refinement = (old_base == new_base and old_description == new_description
                              and (old_visual is None or old_visual == new_visual)
                              and bool(new_visual) and all(item.get("kind") == "visual-review" for item in remaining))
                if refinement:
                    assets[asset_id] = copy.deepcopy(record)
                    continue
            raise ValueError(f"{asset_id}: existing atlas-cell record conflicts")
        assets[asset_id] = copy.deepcopy(record)
    result["assets"] = list(assets.values())
    # New IDs only. Exact duplicate disk locators retain independent IDs and direct edges.
    groups: dict[tuple[Any, ...], list[str]] = {}
    if len(receipt) != len(records) or {row["assetId"] for row in receipt} != set(records):
        raise ValueError("cell receipt does not exactly cover records")
    for row in receipt:
        key = (row["width"], row["height"], row["rawIndexSha256"], row["colorIndexSha256"], row["opaqueMaskSha256"],
               records[row["assetId"]]["archive"]["sha256"])
        groups.setdefault(key, []).append(row["assetId"])
    links = {frozenset((link["fromAssetId"], link["toAssetId"])) for link in result["crossVersionLinks"]}
    added = 0
    for key, ids in groups.items():
        for index, first in enumerate(sorted(ids)):
            for second in sorted(ids)[index + 1:]:
                edge = frozenset((first, second))
                if edge in links:
                    continue
                result["crossVersionLinks"].append({"fromAssetId": first, "toAssetId": second,
                    "relation": "pixel-identical", "confidence": "verified", "evidence": [{
                        "kind": "decoded-pixels", "reference": "tools/import_cok_amiga_atlas_cells_registry.py",
                        "note": f"Pinned duplicate Amiga disk atlases yield equal 24x24 raw five-bit indices "
                                f"SHA-256 {key[2]}, low-four-bit colors {key[3]} and opaque masks {key[4]}. "
                                "Separate disk locators; no DOS or logical-appearance equivalence is asserted."}]})
                links.add(edge)
                added += 1
    return result, added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write verified metadata only to the registry")
    args = parser.parse_args()
    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    records, receipt = decode_sources(args.amiga_root)
    records, visual_counts = apply_visual_descriptions(
        records, receipt, json.loads(args.visual_descriptions.read_text(encoding="utf-8")), args.visual_descriptions)
    merged, links = merge_registry(registry, records, receipt)
    # Never allow a registry destination inside the read-only source tree.
    if args.write:
        if args.registry.resolve().is_relative_to(args.amiga_root.resolve()):
            raise ValueError("registry output must be outside read-only source root")
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    previous = {asset["id"] for asset in registry["assets"]}
    print(json.dumps({"verifiedAtlasFiles": 6, "verifiedAtlasCells": len(records),
                      "newSourceIds": len(set(records) - previous), "newPixelIdenticalLinks": links,
                      "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
                      "registryAnimationGroups": len(merged["animationGroups"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
                      "visualDescriptionRows": visual_counts["rows"],
                      "visualDescriptionUniqueGroups": visual_counts["uniquePixelGroups"],
                      "write": args.write, "cells": receipt}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
