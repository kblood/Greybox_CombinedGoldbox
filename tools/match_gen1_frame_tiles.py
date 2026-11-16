#!/usr/bin/env python3
"""Match native 320x200 Gold Box chrome cells to one 8X8D DAX tile block.

The retail framebuffer is the oracle.  Each standard frame coordinate is compared with every
decoded 8x8 tile, ignoring the conventional EGA-magenta transparent pixels by default.  The JSON
report records the best tile, opaque mismatch count, squared RGB error, and direct-index arrays
that can be transcribed into ``ExploreFrameLayout`` only where the match is exact.

DOSBox-X/GameLink commonly returns an integer-scaled 640x400 screenshot; it is normalized back to
320x200 with nearest-neighbour sampling before comparison.  No title-specific layout assumptions
are used beyond the shared Gold Box screen geometry.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from collections import Counter, defaultdict
from typing import Iterable

from PIL import Image

try:
    import dax_decode
except ModuleNotFoundError:  # Imported as tools.match_gen1_frame_tiles by tests.
    from tools import dax_decode


SCREEN_SIZE = (320, 200)
TILE_SIZE = 8
TILE_HEADER = 17
TILE_BYTES = 32
VGA_TILE_BYTES = 40
VGA_TRAILER_BYTES = (33, 41)
TRANSPARENT_INDEX = 13


@dataclass(frozen=True)
class Tile:
    index: int
    indices: tuple[int, ...]
    rgb: tuple[tuple[int, int, int], ...]


def dax_block(path: Path, block_id: int) -> bytes:
    data = path.read_bytes()
    base, blocks = dax_decode.parse_container(data)
    for block in blocks:
        if block.block_id == block_id:
            return dax_decode.decompress_block(data, base, block)
    raise ValueError(f"DAX block {block_id} not found in {path}")


def decode_tiles(raw: bytes) -> list[Tile]:
    chunky = dax_decode.parse_vga_chunky_items(raw)
    if chunky and chunky["width"] == 8 and chunky["height"] == 8:
        return [Tile(
            index=i,
            indices=tuple(frame),
            rgb=tuple(chunky["palette"][value] for value in frame),
        ) for i, frame in enumerate(chunky["frames"])]
    if len(raw) < TILE_HEADER or raw[0:4] != b"\x08\x00\x01\x00":
        raise ValueError("block is not a standard 8X8D tile set")
    count_byte = raw[8]
    is_gateway_vga = len(raw) - TILE_HEADER - count_byte * VGA_TILE_BYTES in VGA_TRAILER_BYTES
    tile_bytes = VGA_TILE_BYTES if is_gateway_vga else TILE_BYTES
    available = (len(raw) - TILE_HEADER) // tile_bytes
    count = available if count_byte == 0xFF and len(raw) == TILE_HEADER + available * tile_bytes else count_byte
    if count < 1 or len(raw) < TILE_HEADER + count * tile_bytes:
        raise ValueError("8X8D tile count disagrees with block length")
    tiles: list[Tile] = []
    for tile_index in range(count):
        indices: list[int] = []
        prefix = len(raw) - TILE_HEADER - count * tile_bytes if is_gateway_vga else 0
        offset = TILE_HEADER + prefix + tile_index * tile_bytes
        if is_gateway_vga:
            for row in range(8):
                for x in range(8):
                    value = 0
                    for plane in range(5):
                        value |= ((raw[offset + row * 5 + plane] >> (7 - x)) & 1) << plane
                    indices.append(value)
        else:
            packed = raw[offset:offset + TILE_BYTES]
            for byte in packed:
                indices.extend((byte >> 4, byte & 0x0F))
        tiles.append(Tile(
            index=tile_index,
            indices=tuple(indices),
            # Gateway's 5-bit palette is runtime-programmed and only partially recovered. The
            # palette-invariant matcher ignores this placeholder and infers the actual RGB table.
            rgb=tuple(dax_decode.EGA_PALETTE[value & 0x0F] for value in indices),
        ))
    return tiles


def normalize_screenshot(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    if image.size == SCREEN_SIZE:
        return image
    if width % SCREEN_SIZE[0] or height % SCREEN_SIZE[1] or width // SCREEN_SIZE[0] != height // SCREEN_SIZE[1]:
        raise ValueError(f"screenshot must be 320x200 or an integer nearest-neighbour scale, got {width}x{height}")
    return image.resize(SCREEN_SIZE, Image.Resampling.NEAREST)


def standard_frame_cells() -> dict[str, list[tuple[int, int]]]:
    return {
        "outerTop": [(col, 0) for col in range(40)],
        "outerBottom": [(col, 23) for col in range(40)],
        "outerLeft": [(0, row) for row in range(24)],
        "outerRight": [(39, row) for row in range(24)],
        "hsep": [(col, 16) for col in range(40)],
        "vsep": [(16, row) for row in range(17)],
        "innerTop": [(col, 2) for col in range(2, 15)],
        "innerBottom": [(col, 14) for col in range(2, 15)],
        "innerLeft": [(2, row) for row in range(2, 15)],
        "innerRight": [(14, row) for row in range(2, 15)],
    }


def match_cell(
    screenshot: Image.Image,
    col: int,
    row: int,
    tiles: Iterable[Tile],
    transparent_index: int | None = TRANSPARENT_INDEX,
    palette_invariant: bool = False,
) -> dict[str, object]:
    pixels = tuple(screenshot.crop((col * TILE_SIZE, row * TILE_SIZE, (col + 1) * TILE_SIZE, (row + 1) * TILE_SIZE)).getdata())
    ranked: list[tuple[int, int, int, int, int, dict[int, tuple[int, int, int]]]] = []
    for tile in tiles:
        mismatch = 0
        squared_error = 0
        compared = 0
        mapping: dict[int, tuple[int, int, int]] = {}
        if palette_invariant:
            observed: dict[int, list[tuple[int, int, int]]] = defaultdict(list)
            for source_index, actual in zip(tile.indices, pixels):
                if transparent_index is not None and source_index == transparent_index:
                    continue
                observed[source_index].append(actual)
                compared += 1
            for source_index, colors in observed.items():
                color, frequency = Counter(colors).most_common(1)[0]
                mapping[source_index] = color
                mismatch += len(colors) - frequency
            # Exact structural matches with more independently-constrained source colours are less
            # ambiguous than a solid tile, so use that as the deterministic tie-breaker.
            unique_rank = -len(mapping)
        else:
            for source_index, expected, actual in zip(tile.indices, tile.rgb, pixels):
                if transparent_index is not None and source_index == transparent_index:
                    continue
                compared += 1
                if expected != actual:
                    mismatch += 1
                    squared_error += sum((a - b) ** 2 for a, b in zip(expected, actual))
            unique_rank = 0
        ranked.append((mismatch, squared_error, unique_rank, tile.index, compared, mapping))
    mismatch, squared_error, _unique_rank, tile_index, compared, mapping = min(ranked)
    return {
        "tile": tile_index,
        "exact": mismatch == 0,
        "mismatched_pixels": mismatch,
        "compared_pixels": compared,
        "squared_error": squared_error,
        "palette_mapping": {str(index): list(rgb) for index, rgb in sorted(mapping.items())},
    }


def build_report(
    screenshot_path: Path,
    tiles_path: Path,
    block_id: int = 202,
    transparent_index: int | None = TRANSPARENT_INDEX,
    palette_invariant: bool = False,
) -> dict[str, object]:
    screenshot = normalize_screenshot(screenshot_path)
    tiles = decode_tiles(dax_block(tiles_path, block_id))
    cell_groups: dict[str, list[dict[str, object]]] = {}
    arrays: dict[str, list[int | None]] = {}
    for name, coords in standard_frame_cells().items():
        results = []
        direct: list[int | None] = [None, None] if name.startswith("inner") else []
        for col, row in coords:
            match = match_cell(screenshot, col, row, tiles, transparent_index, palette_invariant)
            results.append({"col": col, "row": row, **match})
            direct.append(int(match["tile"]) if match["exact"] else None)
        cell_groups[name] = results
        arrays[name] = direct
    all_results = [result for group in cell_groups.values() for result in group]
    exact = sum(1 for result in all_results if result["exact"])
    global_colors: dict[int, set[tuple[int, int, int]]] = defaultdict(set)
    for result in all_results:
        if not result["exact"]:
            continue
        for source, rgb in result["palette_mapping"].items():
            global_colors[int(source)].add(tuple(rgb))
    return {
        "schema_version": 1,
        "screenshot": str(screenshot_path),
        "normalized_size": list(SCREEN_SIZE),
        "tiles_dax": str(tiles_path),
        "block_id": block_id,
        "tile_count": len(tiles),
        "transparent_index_ignored": transparent_index,
        "palette_invariant": palette_invariant,
        "inferred_palette": {
            str(index): [list(rgb) for rgb in sorted(colors)]
            for index, colors in sorted(global_colors.items())
        },
        "palette_conflicts": [index for index, colors in sorted(global_colors.items()) if len(colors) > 1],
        "summary": {"exact_cells": exact, "total_cells": len(all_results)},
        "arrays": arrays,
        "cells": cell_groups,
        "claim_boundary": "Only exact=true cells prove a tile placement; covered/text/content cells remain null in arrays.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshot", type=Path, required=True)
    parser.add_argument("--tiles-dax", type=Path, required=True)
    parser.add_argument("--block-id", type=int, default=202)
    parser.add_argument("--opaque", action="store_true", help="compare EGA-magenta pixels instead of treating them as transparent")
    parser.add_argument(
        "--palette-invariant",
        action="store_true",
        help="match each tile's index pattern while inferring index-to-RGB colours from the screenshot",
    )
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    report = build_report(
        args.screenshot,
        args.tiles_dax,
        args.block_id,
        None if args.opaque else TRANSPARENT_INDEX,
        args.palette_invariant,
    )
    rendered = json.dumps(report, indent=2) + "\n"
    print(rendered, end="")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(rendered, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
