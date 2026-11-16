#!/usr/bin/env python3
"""Match the native 7x7 combat viewport to DUNGCOM 24x24 tiles.

Exact cells prove retail terrain indices.  Cells covered by combatants, cursors, or spell effects
remain ``null`` rather than being guessed.  Multiple DAX tileset blocks are flattened in the same
file/block/frame order used by the browser combat loader.
"""
from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

try:
    import dax_decode
    from match_gen1_frame_tiles import normalize_screenshot
except ModuleNotFoundError:  # Imported as tools.match_gen1_combat_tiles by tests.
    from tools import dax_decode
    from tools.match_gen1_frame_tiles import normalize_screenshot


TILESET_HEADER = 17
COMBAT_TILE_SIZE = 24
COMBAT_ORIGIN = (8, 8)
COMBAT_GRID = (7, 7)


@dataclass(frozen=True)
class CombatTile:
    flat_index: int
    block_id: int
    frame_index: int
    rgb: tuple[tuple[int, int, int], ...]


def decode_tileset(raw: bytes, block_id: int, flat_start: int = 0) -> list[CombatTile]:
    chunky = dax_decode.parse_vga_chunky_items(raw)
    if chunky and chunky["width"] == COMBAT_TILE_SIZE and chunky["height"] == COMBAT_TILE_SIZE:
        return [CombatTile(
            flat_start + frame_index,
            block_id,
            frame_index,
            tuple(chunky["palette"][value] for value in frame),
        ) for frame_index, frame in enumerate(chunky["frames"])]
    if len(raw) < TILESET_HEADER:
        return []
    height, width_div8 = struct.unpack_from("<HH", raw, 0)
    count = raw[8]
    width = width_div8 * 8
    tile_bytes = height * width_div8 * 4
    if height != COMBAT_TILE_SIZE or width != COMBAT_TILE_SIZE or count < 2:
        return []
    if TILESET_HEADER + count * tile_bytes != len(raw):
        return []
    out: list[CombatTile] = []
    for frame_index in range(count):
        packed = raw[TILESET_HEADER + frame_index * tile_bytes:TILESET_HEADER + (frame_index + 1) * tile_bytes]
        rgb: list[tuple[int, int, int]] = []
        for byte in packed:
            rgb.extend((dax_decode.EGA_PALETTE[byte >> 4], dax_decode.EGA_PALETTE[byte & 0x0F]))
        out.append(CombatTile(flat_start + frame_index, block_id, frame_index, tuple(rgb)))
    return out


def dax_combat_tiles(path: Path) -> list[CombatTile]:
    data = path.read_bytes()
    base, blocks = dax_decode.parse_container(data)
    tiles: list[CombatTile] = []
    for block in blocks:
        raw = dax_decode.decompress_block(data, base, block)
        decoded = decode_tileset(raw, block.block_id, len(tiles))
        tiles.extend(decoded)
    if not tiles:
        raise ValueError(f"no 24x24 DUNGCOM tilesets found in {path}")
    return tiles


def match_combat_cell(image: Image.Image, col: int, row: int, tiles: list[CombatTile]) -> dict[str, object]:
    x = COMBAT_ORIGIN[0] + col * COMBAT_TILE_SIZE
    y = COMBAT_ORIGIN[1] + row * COMBAT_TILE_SIZE
    actual = tuple(image.crop((x, y, x + COMBAT_TILE_SIZE, y + COMBAT_TILE_SIZE)).getdata())
    ranked: list[tuple[int, int, int, CombatTile]] = []
    for tile in tiles:
        mismatch = 0
        squared_error = 0
        for expected, seen in zip(tile.rgb, actual):
            if expected != seen:
                mismatch += 1
                squared_error += sum((a - b) ** 2 for a, b in zip(expected, seen))
        ranked.append((mismatch, squared_error, tile.flat_index, tile))
    mismatch, squared_error, _, best = min(ranked, key=lambda row: row[:3])
    return {
        "col": col,
        "row": row,
        "tile": best.flat_index,
        "block_id": best.block_id,
        "frame_index": best.frame_index,
        "exact": mismatch == 0,
        "mismatched_pixels": mismatch,
        "squared_error": squared_error,
    }


def _snapshot(screenshot_path: Path, tiles: list[CombatTile]) -> dict[str, object]:
    image = normalize_screenshot(screenshot_path)
    cells = [
        match_combat_cell(image, col, row, tiles)
        for row in range(COMBAT_GRID[1])
        for col in range(COMBAT_GRID[0])
    ]
    return {
        "screenshot": str(screenshot_path),
        "summary": {"exact_cells": sum(1 for cell in cells if cell["exact"]), "total_cells": len(cells)},
        "tile_indices": [int(cell["tile"]) if cell["exact"] else None for cell in cells],
        "cells": cells,
    }


def build_report(screenshot_paths: Path | list[Path], dungcom_path: Path) -> dict[str, object]:
    paths = [screenshot_paths] if isinstance(screenshot_paths, Path) else screenshot_paths
    if not paths:
        raise ValueError("at least one screenshot is required")
    tiles = dax_combat_tiles(dungcom_path)
    snapshots = [_snapshot(path, tiles) for path in paths]
    merged: list[int | None] = []
    conflicts: list[dict[str, object]] = []
    for cell_index in range(COMBAT_GRID[0] * COMBAT_GRID[1]):
        values = sorted({
            int(snapshot["tile_indices"][cell_index])
            for snapshot in snapshots
            if snapshot["tile_indices"][cell_index] is not None
        })
        merged.append(values[0] if len(values) == 1 else None)
        if len(values) > 1:
            conflicts.append({"cell_index": cell_index, "col": cell_index % 7, "row": cell_index // 7, "tiles": values})
    return {
        "schema_version": 1,
        "screenshots": [str(path) for path in paths],
        "normalized_size": [320, 200],
        "dungcom_dax": str(dungcom_path),
        "tile_count": len(tiles),
        "geometry": {"origin": list(COMBAT_ORIGIN), "tile_size": COMBAT_TILE_SIZE, "grid": list(COMBAT_GRID)},
        "summary": {
            "merged_exact_cells": sum(value is not None for value in merged),
            "total_cells": len(merged),
            "conflicts": len(conflicts),
        },
        "tile_indices": merged,
        "conflicts": conflicts,
        "snapshots": snapshots,
        "claim_boundary": "Only exact cells prove terrain; merged nulls are obscured or conflict because the camera/map changed.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshot", type=Path, required=True, nargs="+")
    parser.add_argument("--dungcom-dax", type=Path, required=True)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    report = build_report(args.screenshot, args.dungcom_dax)
    rendered = json.dumps(report, indent=2) + "\n"
    print(rendered, end="")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(rendered, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
