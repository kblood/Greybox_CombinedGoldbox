#!/usr/bin/env python3
"""Locate exact CPIC combat figures in one or more native combat screenshots.

Every standard 24x24 or 48x48 CPIC block is tested at each 24-pixel combat-grid anchor. Early EGA
CPIC background indices 0 and 8 are transparent; Gateway's prefixed planar5 CPIC proves only index
0 is a mask and keeps source 8 as opaque black. An exact match proves both the picture block and
placement while allowing native DUNGCOM terrain to show through. Cursor/spell overlays may obscure
a figure in one frame; pass several chronological screenshots to recover it in another.
"""
from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass
from pathlib import Path

from PIL import Image
import cv2
import numpy as np

try:
    import dax_decode
    from match_gen1_frame_tiles import normalize_screenshot
except ModuleNotFoundError:  # Imported as tools.match_gen1_combat_icons by tests.
    from tools import dax_decode
    from tools.match_gen1_frame_tiles import normalize_screenshot


FRAME_HEADER = 17
GATEWAY_PREFIX = 33
# CPIC standard frames use both black 0 and dark-gray 8 as mask/background planes. Native Secret
# block 6 proves every one of its 581 index-0 and 500 index-8 pixels reveals DUNGCOM underneath.
TRANSPARENT_INDICES = frozenset((0, 8))
ORIGIN = (8, 8)
CELL_SIZE = 24
GRID_SIZE = 7


@dataclass(frozen=True)
class Icon:
    block_id: int
    width: int
    height: int
    indices: tuple[int, ...]
    rgb: tuple[tuple[int, int, int], ...]
    transparent_indices: frozenset[int] = TRANSPARENT_INDICES


def decode_icon(raw: bytes, block_id: int) -> Icon | None:
    chunky = dax_decode.parse_vga_chunky_items(raw)
    if chunky and chunky["count"] == 1 and (chunky["width"], chunky["height"]) in {(24, 24), (24, 48), (48, 24), (48, 48)}:
        indices = tuple(chunky["frames"][0])
        return Icon(
            block_id=block_id,
            width=chunky["width"],
            height=chunky["height"],
            indices=indices,
            rgb=tuple(chunky["palette"][index] for index in indices),
        )
    if len(raw) >= FRAME_HEADER + GATEWAY_PREFIX:
        height, width_div8 = struct.unpack_from("<HH", raw, 0)
        width = width_div8 * 8
        expected = FRAME_HEADER + GATEWAY_PREFIX + height * 5 * width_div8
        if raw[8] == 1 and (width, height) in {(24, 24), (24, 48), (48, 24), (48, 48)} and len(raw) == expected:
            indices = []
            pixel_offset = FRAME_HEADER + GATEWAY_PREFIX
            for y in range(height):
                row_offset = pixel_offset + y * 5 * width_div8
                for x in range(width):
                    value = 0
                    for plane in range(5):
                        packed = raw[row_offset + plane * width_div8 + x // 8]
                        value |= ((packed >> (7 - (x & 7))) & 1) << plane
                    indices.append(value)
            # RGB values are irrelevant to palette-invariant matching. Preserve EGA colours for
            # the base range and unique sentinels above it so diagnostics remain distinguishable.
            palette = tuple(dax_decode.EGA_PALETTE) + tuple((index, 255 - index, index * 7 % 256) for index in range(16, 32))
            return Icon(
                block_id=block_id,
                width=width,
                height=height,
                indices=tuple(indices),
                rgb=tuple(palette[index] for index in indices),
                transparent_indices=frozenset((0,)),
            )
    if len(raw) < FRAME_HEADER or raw[8] != 1:
        return None
    height, width_div8 = struct.unpack_from("<HH", raw, 0)
    width = width_div8 * 8
    if (width, height) not in {(24, 24), (48, 48)}:
        return None
    packed_bytes = width * height // 2
    if len(raw) < FRAME_HEADER + packed_bytes:
        return None
    indices: list[int] = []
    for byte in raw[FRAME_HEADER:FRAME_HEADER + packed_bytes]:
        indices.extend((byte >> 4, byte & 0x0F))
    return Icon(
        block_id=block_id,
        width=width,
        height=height,
        indices=tuple(indices),
        rgb=tuple(dax_decode.EGA_PALETTE[index] for index in indices),
    )


def dax_icons(path: Path) -> list[Icon]:
    data = path.read_bytes()
    base, blocks = dax_decode.parse_container(data)
    icons = []
    for block in blocks:
        icon = decode_icon(dax_decode.decompress_block(data, base, block), block.block_id)
        if icon:
            icons.append(icon)
    if not icons:
        raise ValueError(f"no standard 24x24/48x48 CPIC blocks found in {path}")
    return icons


def compare_at(image: Image.Image, col: int, row: int, icon: Icon, flipped: bool = False) -> tuple[int, int, int]:
    x0 = ORIGIN[0] + col * CELL_SIZE
    y0 = ORIGIN[1] + row * CELL_SIZE
    if x0 + icon.width > 176 or y0 + icon.height > 176:
        return (icon.width * icon.height, 2**63 - 1, 0)
    actual = tuple(image.crop((x0, y0, x0 + icon.width, y0 + icon.height)).getdata())
    mismatch = 0
    squared_error = 0
    opaque = 0
    source_indices = icon.indices
    expected_rgb = icon.rgb
    if flipped:
        source_indices = tuple(
            icon.indices[y * icon.width + (icon.width - 1 - x)]
            for y in range(icon.height)
            for x in range(icon.width)
        )
        expected_rgb = tuple(
            icon.rgb[y * icon.width + (icon.width - 1 - x)]
            for y in range(icon.height)
            for x in range(icon.width)
        )
    for source_index, expected, seen in zip(source_indices, expected_rgb, actual):
        if source_index in icon.transparent_indices:
            continue
        opaque += 1
        if expected != seen:
            mismatch += 1
            squared_error += sum((a - b) ** 2 for a, b in zip(expected, seen))
    return mismatch, squared_error, opaque


def compare_at_palette_invariant(
    image: Image.Image,
    col: int,
    row: int,
    icon: Icon,
    flipped: bool = False,
) -> tuple[int, int, dict[int, tuple[int, int, int]]]:
    """Compare CPIC index structure while allowing the native DAC colours to differ."""
    x0 = ORIGIN[0] + col * CELL_SIZE
    y0 = ORIGIN[1] + row * CELL_SIZE
    if x0 + icon.width > 176 or y0 + icon.height > 176:
        return (icon.width * icon.height, 0, {})
    actual = tuple(image.crop((x0, y0, x0 + icon.width, y0 + icon.height)).getdata())
    mapping: dict[int, tuple[int, int, int]] = {}
    mismatch = 0
    opaque = 0
    for y in range(icon.height):
        for x in range(icon.width):
            source_x = icon.width - 1 - x if flipped else x
            source_index = icon.indices[y * icon.width + source_x]
            if source_index in icon.transparent_indices:
                continue
            opaque += 1
            seen = actual[y * icon.width + x]
            expected = mapping.setdefault(source_index, seen)
            if expected != seen:
                mismatch += 1
    return mismatch, opaque, mapping


def scan_exact_pixels(image: Image.Image, icon: Icon, min_opaque_pixels: int, flipped: bool = False) -> list[tuple[int, int]]:
    """Return exact top-left matches anywhere inside the 168x168 retail battle box."""
    source = np.asarray(image.crop((ORIGIN[0], ORIGIN[1], 176, 176)), dtype=np.uint8)
    template = np.asarray(icon.rgb, dtype=np.uint8).reshape(icon.height, icon.width, 3)
    index_array = np.asarray(icon.indices, dtype=np.uint8).reshape(icon.height, icon.width)
    if flipped:
        template = template[:, ::-1]
        index_array = index_array[:, ::-1]
    opaque = ~np.isin(index_array, tuple(icon.transparent_indices))
    if int(np.count_nonzero(opaque)) < min_opaque_pixels:
        return []
    mask = np.repeat((opaque.astype(np.uint8) * 255)[:, :, None], 3, axis=2)
    scores = cv2.matchTemplate(source, template, cv2.TM_SQDIFF, mask=mask)
    # OpenCV can leave tiny floating-point residue for a byte-identical masked match.
    ys, xs = np.where(scores <= 0.5)
    return [(int(x) + ORIGIN[0], int(y) + ORIGIN[1]) for y, x in zip(ys, xs)]


def build_report(
    screenshot_paths: list[Path],
    cpic_path: Path,
    min_opaque_pixels: int = 12,
    palette_invariant: bool = False,
) -> dict[str, object]:
    icons = dax_icons(cpic_path)
    matches: list[dict[str, object]] = []
    best_candidates: list[dict[str, object]] = []
    pixel_matches: list[dict[str, object]] = []
    invariant_matches: list[dict[str, object]] = []
    for screenshot_path in screenshot_paths:
        image = normalize_screenshot(screenshot_path)
        for icon in icons:
            opaque = sum(index not in icon.transparent_indices for index in icon.indices)
            for flipped in (False, True):
                for x, y in scan_exact_pixels(image, icon, min_opaque_pixels, flipped):
                    pixel_matches.append({
                        "screenshot": str(screenshot_path),
                        "x": x,
                        "y": y,
                        "grid_col": (x - ORIGIN[0]) / CELL_SIZE,
                        "grid_row": (y - ORIGIN[1]) / CELL_SIZE,
                        "block_id": icon.block_id,
                        "flipped": flipped,
                        "width": icon.width,
                        "height": icon.height,
                        "opaque_pixels": opaque,
                    })
        for row in range(GRID_SIZE):
            for col in range(GRID_SIZE):
                ranked = []
                for icon in icons:
                    for flipped in (False, True):
                        mismatch, squared_error, opaque = compare_at(image, col, row, icon, flipped)
                        if opaque >= min_opaque_pixels:
                            ranked.append((mismatch, squared_error, -opaque, icon.block_id, flipped, icon))
                        if palette_invariant:
                            inv_mismatch, inv_opaque, mapping = compare_at_palette_invariant(
                                image, col, row, icon, flipped,
                            )
                            distinct_colours = len(set(mapping.values()))
                            if inv_opaque >= min_opaque_pixels and inv_mismatch == 0 and distinct_colours >= 2:
                                invariant_matches.append({
                                    "screenshot": str(screenshot_path),
                                    "col": col,
                                    "row": row,
                                    "block_id": icon.block_id,
                                    "flipped": flipped,
                                    "width": icon.width,
                                    "height": icon.height,
                                    "opaque_pixels": inv_opaque,
                                    "source_indices": len(mapping),
                                    "observed_colours": distinct_colours,
                                    "palette_mapping": {str(index): list(rgb) for index, rgb in sorted(mapping.items())},
                                })
                if not ranked:
                    continue
                mismatch, squared_error, neg_opaque, _, flipped, icon = min(ranked, key=lambda entry: entry[:4])
                candidate = {
                    "screenshot": str(screenshot_path),
                    "col": col,
                    "row": row,
                    "block_id": icon.block_id,
                    "flipped": flipped,
                    "width": icon.width,
                    "height": icon.height,
                    "opaque_pixels": -neg_opaque,
                    "exact": mismatch == 0,
                    "mismatched_pixels": mismatch,
                    "squared_error": squared_error,
                }
                best_candidates.append(candidate)
                if mismatch == 0:
                    matches.append(candidate)
    unique = []
    seen = set()
    for match in matches:
        key = (match["col"], match["row"], match["block_id"], match["width"], match["height"])
        if key not in seen:
            seen.add(key)
            unique.append({key_name: match[key_name] for key_name in ("col", "row", "block_id", "width", "height", "opaque_pixels")})
    return {
        "schema_version": 1,
        "screenshots": [str(path) for path in screenshot_paths],
        "cpic_dax": str(cpic_path),
        "icon_count": len(icons),
        "pixel_exact_matches": pixel_matches,
        "palette_invariant_matches": invariant_matches,
        "exact_matches": unique,
        "per_frame_exact_matches": matches,
        "best_candidates": best_candidates,
        "claim_boundary": "Exact RGB matches prove CPIC block and grid anchor. Palette-invariant matches prove the source-index pattern and anchor under a consistent native DAC mapping; absent figures may be covered by native cursor/effects.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshot", type=Path, required=True, nargs="+")
    parser.add_argument("--cpic-dax", type=Path, required=True)
    parser.add_argument("--min-opaque-pixels", type=int, default=12)
    parser.add_argument("--palette-invariant", action="store_true")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    report = build_report(args.screenshot, args.cpic_dax, args.min_opaque_pixels, args.palette_invariant)
    rendered = json.dumps(report, indent=2) + "\n"
    print(rendered, end="")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(rendered, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
