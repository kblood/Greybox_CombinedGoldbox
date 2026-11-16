#!/usr/bin/env python3
"""Apply visual-only descriptions to exact CoK DOS block-201 glyph IDs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image

import cok_ecl_picture_consumers as common
import import_cok_dos_font_glyph_registry as glyphs

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "docs/engine/research/cok-dos-font-glyph-visual-descriptions-v1.json"
LINEAGE = ROOT / "docs/engine/research/cok-dos-font-source-lineage-v1.json"
REGISTRY = common.REGISTRY
SHEET_DEFAULT = ROOT / "apps/web/dist-app-cok57/restyle/cok-generated/images/81284951d116eb51c12d454254e83cbb74cf15cbe1366e71b30d3de8de486a4d.png"
GLYPH_COUNT = 177
GLYPH_ID_PREFIX = "cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_atlas(path: Path, lineage: dict[str, Any], raw: bytes) -> None:
    sheet_meta = lineage["sourceSheet"]
    recipe = lineage["renderRecipe"]
    data = path.read_bytes()
    if sha(data) != sheet_meta["sha256"]:
        raise ValueError("font source atlas SHA-256 differs from the pinned lineage")
    image = Image.open(path).convert("RGB")
    if image.size != (sheet_meta["width"], sheet_meta["height"]):
        raise ValueError("font source atlas dimensions differ from the lineage")
    colors = {color for _count, color in image.getcolors(image.width * image.height) or []}
    foreground = tuple(recipe["foregroundRGB"])
    background = tuple(recipe["backgroundRGB"])
    if colors != {foreground, background}:
        raise ValueError("font source atlas uses unexpected colors")
    columns, scale, gap = recipe["columns"], recipe["scale"], recipe["gapPixels"]
    glyph_width, glyph_height = recipe["glyphCount"] and 8, 8
    pitch_x, pitch_y = glyph_width * scale + gap, glyph_height * scale + gap
    for index in range(GLYPH_COUNT):
        left, top = (index % columns) * pitch_x, (index // columns) * pitch_y
        crop = image.crop((left, top, left + glyph_width * scale, top + glyph_height * scale))
        sample = crop.resize((glyph_width, glyph_height), Image.Resampling.NEAREST)
        decoded = bytes(15 if sample.getpixel((x, y)) == foreground else 0
                        for y in range(glyph_height) for x in range(glyph_width))
        if decoded != glyphs.glyph_pixels(raw[index * glyphs.GLYPH_BYTES:(index + 1) * glyphs.GLYPH_BYTES]):
            raise ValueError(f"atlas glyph {index} does not match its exact source bytes")


def validate_rows(registry: dict[str, Any], dataset: dict[str, Any]) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    if dataset.get("version") != 1 or dataset.get("schema") != "cok-dos-font-glyph-visual-descriptions-v1":
        raise ValueError("unsupported glyph visual-description dataset")
    if (dataset.get("sourceArchiveSha256") != glyphs.ARCHIVE_SHA
            or dataset.get("sourceBlockSha256") != glyphs.RAW_SHA):
        raise ValueError("dataset source archive/block pins differ")
    rows = dataset.get("assets")
    if not isinstance(rows, list) or len(rows) != GLYPH_COUNT:
        raise ValueError(f"expected exactly {GLYPH_COUNT} glyph description rows")
    registry_by_id = {asset.get("id"): asset for asset in registry.get("assets", [])}
    if len(registry_by_id) != len(registry.get("assets", [])):
        raise ValueError("registry contains duplicate source IDs")
    by_index: dict[int, tuple[dict[str, Any], dict[str, Any]]] = {}
    pixel_wording: dict[str, str] = {}
    for row in rows:
        index = row.get("glyphIndex") if isinstance(row, dict) else None
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < GLYPH_COUNT or index in by_index:
            raise ValueError(f"invalid, out-of-range, or duplicate glyph index: {index!r}")
        asset_id = f"{GLYPH_ID_PREFIX}{index}"
        if row.get("assetId") != asset_id:
            raise ValueError(f"glyph {index}: canonical source ID differs")
        asset = registry_by_id.get(asset_id)
        if asset is None or asset.get("locator", {}).get("kind") != "glyph":
            raise ValueError(f"glyph {index}: canonical registry source ID is missing")
        locator = asset["locator"]
        if locator.get("blockId") != 201 or locator.get("entryIndex") != 0 or locator.get("glyphIndex") != index:
            raise ValueError(f"glyph {index}: registry locator differs")
        if row.get("sourceContentSha256") != asset.get("sourceContentSha256"):
            raise ValueError(f"glyph {index}: source-content hash differs from registry")
        pixel_hash = asset.get("sourcePixelSha256")
        if row.get("pixelSha256") != pixel_hash:
            raise ValueError(f"glyph {index}: decoded-pixel hash differs from registry")
        description = row.get("visualDescription")
        if not isinstance(description, str) or not description.strip():
            raise ValueError(f"glyph {index}: visual description is empty")
        previous = pixel_wording.setdefault(pixel_hash, description)
        if previous != description:
            raise ValueError(f"glyph {index}: pixel-identical glyphs have conflicting wording")
        by_index[index] = (asset, row)
    if set(by_index) != set(range(GLYPH_COUNT)):
        raise ValueError("glyph description rows do not cover every stored index")
    return [by_index[index] for index in range(GLYPH_COUNT)]


def apply_dataset(registry: dict[str, Any], dataset: dict[str, Any], dataset_path: Path) -> tuple[dict[str, Any], dict[str, int]]:
    rows = validate_rows(registry, dataset)
    merged = json.loads(json.dumps(registry))
    merged_by_id = {asset["id"]: asset for asset in merged["assets"]}
    evidence_path = dataset_path.as_posix()
    for asset, row in rows:
        target = merged_by_id[asset["id"]]
        description = target.setdefault("description", {})
        text = row["visualDescription"]
        prior = description.get("visualDescription")
        if prior and prior != text:
            raise ValueError(f"{asset['id']}: existing visual description conflicts with reviewed wording")
        description["visualDescription"] = text
        evidence = description.setdefault("evidence", [])
        if not isinstance(evidence, list):
            raise ValueError(f"{asset['id']}: description evidence must be an array")
        reference = f"{evidence_path}#{asset['id']}"
        note = (f"Visible 8×8 pixel pattern reviewed against source atlas SHA-256 {dataset['sourceAtlasSha256']}; "
                f"stored glyph bytes SHA-256 {row['sourceContentSha256']} and decoded pixel SHA-256 {row['pixelSha256']}. "
                "Character/codepoint, subject, game use, selector, and playback semantics are not inferred.")
        record = {"kind": "visual-review", "reference": reference, "note": note}
        owned = [i for i, item in enumerate(evidence) if isinstance(item, dict)
                 and item.get("kind") == "visual-review" and item.get("reference") == reference]
        if owned:
            evidence[owned[0]] = record
            for index in reversed(owned[1:]):
                evidence.pop(index)
        else:
            evidence.append(record)
    return merged, {"rows": len(rows), "uniquePixelGroups": len({asset["sourcePixelSha256"] for asset, _ in rows})}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--archive", type=Path, default=glyphs.ARCHIVE)
    parser.add_argument("--atlas", type=Path, default=SHEET_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    try:
        lineage = json.loads(LINEAGE.read_text(encoding="utf-8"))
        raw = glyphs.read_raw_archive(args.archive)
        verify_atlas(args.atlas, lineage, raw)
        registry = json.loads(args.registry.read_text(encoding="utf-8"))
        dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
        merged, counts = apply_dataset(registry, dataset, args.dataset.relative_to(ROOT))
        errors, warnings = common.graphics_asset_registry.validate(merged)
        if errors:
            raise ValueError("registry validation failed: " + "; ".join(errors))
        if args.write:
            common.atomic_json(args.registry, merged, validate_registry=True)
        print(json.dumps({**counts, "registryChanged": merged != registry,
                          "validationErrors": len(errors), "validationWarnings": len(warnings),
                          "atlasSha256": dataset["sourceAtlasSha256"], "write": args.write}, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(1, f"font visual descriptions: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
