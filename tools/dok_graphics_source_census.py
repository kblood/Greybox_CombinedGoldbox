#!/usr/bin/env python3
"""Verify the pinned DoK DOS graphics roster and reproduce source-only metadata."""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys

from cok_graphics_source_census import (
    RESEARCH, ROOT, child, digest, entry_spans, font_glyph_rgb, registry_identity_digest, serialize, strict_rle, summarize,
)
from dax_complex_decode import frame_pixels_to_rgb, parse_anim_frames
from dax_decode import FRAME_HEADER, parse_ega_tile_array, parse_standard_frame
from dok_graphics_visual_descriptions import GROWTH_LIMIT, SIDECAR, build_outputs
from dok_graphics_pixel_visual_descriptions import EXTENSION, GLYPH_REGISTRY_SHA256, build_extension
from graphics_asset_registry import validate

DOS_ROOT = ROOT / "Death Knights of Krynn"
INVENTORY = "docs/dos-inventory.md"
ROSTER = RESEARCH / "dok-graphics-source-roster-v1.json"
REGISTRY = RESEARCH / "dok-graphics-identity-registry-v1.json"
CENSUS = RESEARCH / "dok-graphics-source-census-v1.json"
COMPLEX = re.compile(r"(?:PIC[1-7]|SPRIT[1-4])\.DAX")
STANDARD = re.compile(r"(?:BACK[1-5]|BIGPIC[1-3]|CBODY|CHEAD|COMSPR|CPIC1|SKYGRND|TITLE)\.DAX")
TILE_ARRAY = re.compile(r"(?:8X8D[1-5]|DUNGCOM|WILDCOM)\.DAX")
STRUCTURAL = re.compile(r"WALLDEF[1-5]\.DAX")
SHA = re.compile(r"[0-9a-f]{64}")
SOURCE_SET = "dos-install"
EDITION = "DOS install"
PLATFORM = "DOS-EGA"
COMPLEX_PROFILE = "dos-complex-stored-frames"
STANDARD_PROFILE = "dos-standard-stored-frame"
TILE_PROFILE = "dos-stored-ega-tile-array"
GLYPH_PROFILE = "dos-raw-font-201"
METADATA_LIMIT = 5 * 1024**2
EXTENSION_LIMIT = 384 * 1024
REGISTRY_DELTA_LIMIT = 256 * 1024
PROVENANCE = "Pinned local installed DoK DOS/GOG copy; independent retail provenance is unestablished."


def inventory_rows(doc):
    section = doc.split("## 2. Death Knights of Krynn (DoK) — DAX Inventory", 1)[1]
    section = section.split("### Graphics resources subsection (DoK)", 1)[0]
    rows = [(name, int(count)) for name, count in re.findall(
        r"^\| (\S+\.DAX) \| [^|]+ \| (\d+) \| GRAPHICS\b", section, re.M)]
    if len(rows) != 37 or len(dict(rows)) != 37 or sum(n for _, n in rows) != 430:
        raise ValueError("documented DoK graphics roster changed; review scope before refreshing pins")
    return dict(rows)


def source_bytes(root, name):
    path = (root / name).resolve(strict=True)
    if not path.is_relative_to(root):
        raise ValueError(f"{name}: source path outside root")
    return path.read_bytes()


def check_roster(roster, inventory):
    if (set(roster) != {"schema", "inventoryReference", "files"}
            or roster["schema"] != "dok-graphics-source-roster-v1" or roster["inventoryReference"] != INVENTORY):
        raise ValueError("invalid DoK roster schema or inventory reference")
    if [row["path"] for row in roster["files"]] != sorted(inventory):
        raise ValueError("DoK roster does not match documented occurrences in sorted order")
    for row in roster["files"]:
        if (set(row) != {"path", "sha256", "bytes", "tocBlockIds"}
                or not SHA.fullmatch(row["sha256"]) or type(row["bytes"]) is not int or row["bytes"] < 11
                or len(row["tocBlockIds"]) != inventory[row["path"]]
                or not all(type(bid) is int and 0 <= bid <= 255 for bid in row["tocBlockIds"])):
            raise ValueError(f"{row['path']}: invalid archive/TOC pin")


def scan_archive(pin, root, assets, groups):
    name, sha = pin["path"], pin["sha256"]
    data = source_bytes(root, name)
    if len(data) != pin["bytes"] or digest(data) != sha:
        raise ValueError(f"{name}: source byte pin mismatch")
    table, spans = entry_spans(data, "dax", len(pin["tocBlockIds"]))
    if [span[0] for span in spans] != pin["tocBlockIds"]:
        raise ValueError(f"{name}: stored TOC pin mismatch")
    previous_end = 2 + 9 * len(spans)
    for _, offset, size, raw_size in sorted(spans, key=lambda span: span[1]):
        if offset < previous_end or size <= 0 or raw_size <= 0 or offset + size > len(data):
            raise ValueError(f"{name}: invalid or overlapping stored entry span")
        previous_end = offset + size
    structural = bool(STRUCTURAL.fullmatch(name))
    rows, occurrences = [], Counter()
    for ordinal, (block, offset, size, raw_size) in enumerate(spans):
        occurrences[block] += 1
        payload = data[offset:offset + size]
        try:
            raw = strict_rle(payload, raw_size)
        except ValueError as exc:
            raise ValueError(f"{name} entry {ordinal}: {exc}") from exc
        if structural:
            profile, children = "structural", []
        else:
            profile, children = decode_entry(pin, ordinal, block, raw, assets, groups)
        rows.append(dict(entryIndex=ordinal, blockId=block, sameIdOccurrence=occurrences[block],
                         offset=offset, storedBytes=size, declaredRawBytes=raw_size, payloadSha256=digest(payload),
                         rawSha256=digest(raw), status="structural" if structural else "decoded",
                         issue=None, profile=profile, drawableCount=len(children), children=children, derived=[],
                         locatorSourceIds=[item["sourceIds"][0] for item in children]))
    return dict(sourceSet=SOURCE_SET, path=name, category="structural" if structural else "graphics",
                sha256=sha, bytes=len(data), expectedEntries=len(spans), observedSha256=sha, observedBytes=len(data),
                format=table, status="scanned", issue=None,
                entries=rows, children=[], derived=[], locatorSourceIds=[],
                drawableCount=sum(row["drawableCount"] for row in rows))


def decode_entry(pin, ordinal, block, raw, assets, groups):
    name = pin["path"]
    if COMPLEX.fullmatch(name):
        return COMPLEX_PROFILE, decode_frames(pin, ordinal, block, raw, assets, groups)
    if STANDARD.fullmatch(name):
        frame = parse_standard_frame(raw)
        if frame is None or FRAME_HEADER + frame[0] * frame[1] // 2 != len(raw):
            raise ValueError(f"{name} entry {ordinal}: invalid exact standard frame layout")
        return STANDARD_PROFILE, add_children(pin, ordinal, block, "block-frame", *frame[:2], [raw[FRAME_HEADER:]], assets)
    if name == "8X8D1.DAX" and ordinal == 0 and block == 201:
        if len(raw) != 177 * 8:
            raise ValueError(f"{name} entry {ordinal}: invalid raw font layout")
        return GLYPH_PROFILE, add_children(pin, ordinal, block, "glyph", 8, 8,
                                          (raw[i:i + 8] for i in range(0, len(raw), 8)), assets)
    if TILE_ARRAY.fullmatch(name):
        frame = parse_ega_tile_array(raw)
        dim = 8 if name.startswith("8X8D") else 24
        if (frame is None or frame[:2] != (dim, dim) or frame[2] != (256 if raw[8] == 255 else raw[8])
                or (name == "8X8D1.DAX" and block == 204 and frame[2] != 1)):
            raise ValueError(f"{name} entry {ordinal}: invalid exact tile array layout")
        _, _, count, header = frame
        size = dim * dim // 2
        return TILE_PROFILE, add_children(pin, ordinal, block, "tile", dim, dim,
                                         (raw[header + i * size:header + (i + 1) * size] for i in range(count)), assets)
    raise ValueError(f"{name} entry {ordinal}: no approved DoK source profile")


def add_children(pin, ordinal, block, kind, width, height, packed_children, assets):
    return [add_child(pin, ordinal, block, kind, i, width, height, packed, assets)
            for i, packed in enumerate(packed_children)]


def add_child(pin, ordinal, block, kind, index, width, height, packed, assets, group=None):
    name = pin["path"]
    prefix, field = {"block-frame": ("frame", "frameIndex"), "tile": ("tile", "tileIndex"),
                     "glyph": ("glyph", "glyphIndex")}[kind]
    base = f"dok/dos-ega/dos-install/{name.lower()}/block/{block}/entry/{ordinal}"
    asset_id = f"{base}/{prefix}/{index}"
    rgb = font_glyph_rgb(packed) if kind == "glyph" else frame_pixels_to_rgb(packed, width, height)
    row = child(kind, index, width, height, rgb=rgb, indices=packed)
    row["sourceIds"] = [asset_id]
    locator = dict(kind=kind, blockId=block, entryIndex=ordinal, frameIndex=None, tileIndex=None, cellIndex=None)
    locator[field] = index
    assets.append(dict(id=asset_id, game="dok", edition=EDITION, platform=PLATFORM,
                       archive=dict(name=name, path=name, sha256=pin["sha256"]),
                       locator=locator, identityStatus="source-pinned",
                       sourceContentSha256=row["indexSha256"], sourcePixelSha256=row["rgbSha256"], decoded=None,
                       description=dict(text="", status="unknown", evidence=[]), gameConsumers=[], animationGroupId=group))
    return row


def decode_frames(pin, ordinal, block, raw, assets, groups):
    name = pin["path"]
    frames = parse_anim_frames(raw, apply_xor=False)
    if not frames:
        raise ValueError(f"{name} entry {ordinal}: invalid stored frame layout")
    base = f"dok/dos-ega/dos-install/{name.lower()}/block/{block}/entry/{ordinal}"
    group = f"{base}/stored-frame-set" if len(frames) > 1 else None
    evidence = [dict(kind="game-data", reference=f"{name}#entry/{ordinal}/block/{block}",
                     note="Pinned DoK DOS archive; stored frame order only. No game use or playback meaning is established.")]
    children = [add_child(pin, ordinal, block, "block-frame", i, frame["width"], frame["height"],
                          frame["pixels"], assets, group) for i, frame in enumerate(frames)]
    if group:
        groups.append(dict(id=group, semantics="unknown", playback="unknown", status="unknown", evidence=evidence,
                           frames=[dict(assetId=row["sourceIds"][0], order=i, role=f"stored frame {i}")
                                   for i, row in enumerate(children)]))
    return children


def generate(roster, inventory, root):
    check_roster(roster, inventory)
    assets, groups = [], []
    files = [scan_archive(pin, root, assets, groups) for pin in roster["files"]]
    assets.sort(key=lambda row: row["id"])
    groups.sort(key=lambda row: row["id"])
    registry = dict(registryVersion=1, assets=assets, animationGroups=groups, restyles=[], crossVersionLinks=[])
    errors, _ = validate(registry)
    if errors:
        raise ValueError("DoK registry: " + "; ".join(errors))
    summary = summarize(files)
    expected = dict(rosterFiles=37, pinMatchedFiles=37, storedEntries=430, structuralFiles=5,
                    structuralStoredEntries=7, filesWithRegistryEntryLocators=32, entryLocatorsWithRegistryRows=423,
                    drawableChildrenWithExactBinding=2614, filesWithUnknownDrawableCount=0,
                    entriesWithUnknownDrawableCount=0, totalDrawableCount=2614)
    profiles = Counter(entry["profile"] for file in files for entry in file["entries"] for _ in entry["children"])
    if (any(summary[key] != value for key, value in expected.items()) or len(groups) != 30
            or profiles != {COMPLEX_PROFILE: 140, STANDARD_PROFILE: 351, TILE_PROFILE: 1946, GLYPH_PROFILE: 177}):
        raise ValueError(f"DoK admission denominator changed: {summary}")
    census = dict(schema="dok-graphics-source-census-v1", game="dok", inventoryReferences=[INVENTORY],
                  rosterSha256=digest(serialize(roster)), registryAssetIdentitySha256=registry_identity_digest(assets, "dok"),
                  sourceSets=[dict(id=SOURCE_SET, platform=PLATFORM, provenance=PROVENANCE, summary=summary)],
                  unresolvedRegistryBindings=[], files=files)
    return {REGISTRY: registry, CENSUS: census}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dos-root", type=Path, default=DOS_ROOT)
    parser.add_argument("--write", action="store_true", help="write the exact visual descriptions and sidecar after all pins pass")
    args = parser.parse_args()
    roster_bytes = ROSTER.read_bytes()
    roster = json.loads(roster_bytes)
    if roster_bytes != serialize(roster):
        raise ValueError("DoK roster serialization differs from its pinned form")
    inventory = inventory_rows((ROOT / INVENTORY).read_text(encoding="utf-8"))
    generated = generate(roster, inventory, args.dos_root.resolve(strict=True))
    census_bytes = CENSUS.read_bytes()
    if census_bytes != serialize(generated[CENSUS]):
        raise ValueError(f"{CENSUS.name}: generated bytes differ")
    baseline = generated[REGISTRY]
    glyph_registry, glyph_sidecar = build_outputs(baseline, census_bytes, roster_bytes)
    annotated, extension = build_extension(glyph_registry, glyph_sidecar, census_bytes, roster_bytes,
                                          verify_source_files=True)
    outputs = {REGISTRY: serialize(annotated), RESEARCH / SIDECAR: serialize(glyph_sidecar),
               RESEARCH / EXTENSION: serialize(extension)}
    baseline_bytes = serialize(baseline)
    added_bytes = sum(map(len, outputs.values())) - len(baseline_bytes)
    if len(outputs[RESEARCH / EXTENSION]) > EXTENSION_LIMIT:
        raise ValueError("DoK pixel-transfer sidecar exceeds the reviewed 384 KiB limit")
    if len(outputs[REGISTRY]) - len(serialize(glyph_registry)) > REGISTRY_DELTA_LIMIT:
        raise ValueError("DoK pixel-transfer registry delta exceeds the reviewed 256 KiB limit")
    if added_bytes > GROWTH_LIMIT:
        raise ValueError("DoK descriptions exceed the reviewed 1 MiB growth limit")
    if len(roster_bytes) + len(census_bytes) + sum(map(len, outputs.values())) > METADATA_LIMIT:
        raise ValueError("DoK source metadata exceeds the reviewed 5 MiB limit")
    current_registry = REGISTRY.read_bytes()
    if current_registry not in (outputs[REGISTRY], baseline_bytes) and digest(current_registry) != GLYPH_REGISTRY_SHA256:
        raise ValueError("DoK current registry differs from both reviewed versions")
    for name in (SIDECAR, EXTENSION):
        path = RESEARCH / name
        if path.exists() and path.read_bytes() != outputs[path]:
            raise ValueError(f"{name}: existing bytes differ from the reviewed derivation")
    for path, output in outputs.items():
        if args.write:
            if not path.exists() or path.read_bytes() != output:
                path.write_bytes(output)
        elif path.read_bytes() != output:
            raise ValueError(f"{path.name}: generated bytes differ")
    print("DoK source census: 37 archives, 430 entries, 2,614 exact source child IDs; "
          "691 visual descriptions across 497 exact appearances; all pins matched")


if __name__ == "__main__":
    try:
        main()
    except (OSError, KeyError, TypeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
