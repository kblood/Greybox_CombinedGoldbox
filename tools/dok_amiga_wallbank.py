#!/usr/bin/env python3
"""
dok_amiga_wallbank.py - DoK Amiga `8x8d1.daa` wall-bank chunk reassembly (R1, 2026-09-03).

**This module retracts a published false negative.** The 2026-09-02 (R5) pass reported "96
hypotheses (24 orders x 4 interleaves) rejected" and "own embedded palette all zero, no colour
source" for DoK's Amiga dungeon wall banks. Both statements were true of the SCORE they produced,
but the score itself was computed from a tool bug, not from the data: `dos_wall_bank_tiles` read
the DOS bank through `dax_decode.parse_tile_strip` (the 8-byte-header, 16px-wide tile-STRIP
format), which is the wrong shape for this block. DoK's `8X8D*.DAX` wall banks are the 17-byte-
header EGA TILE-ARRAY format (`dax_decode.parse_ega_tile_array`, the SAME format
`packages/engine/src/loaders/tiles8x8.ts`'s `decode8x8dBlock` already uses to render these banks
correctly in `?explore=dok`) -- `len(raw) == 17 + 256*32 == 8209` exactly, `item_count` byte
saturated at 0xFF because a uint8 cannot express 256. The strip reading instead treats the same
8209 bytes as a 16px-wide vertical strip, which interleaves rows of neighbouring tiles: every one
of the 96 hypotheses was scored against scrambled tiles, and no order or interleave could have
scored well under that reading.

Under the CORRECTED reading, the reassembly is solved by exact pixel identity, not a shape
statistic: the natural chunk order (base id, +20, +40, +60) reproduces DOS's 256-tile bank at
1786/1792 tiles (255,255,256,255,255,255,255 across the 7 series) byte-identical, once each
side's raw decoder palette INDEX is compared through a colour map derived from a boot block's own
embedded palette (`derive_amiga_index_map`) -- never resolved RGB, never either side's guessed
palette (`docs/engine/memory/goldbox-cross-platform-compare-bytes-not-conventions.md`). The
wall-bank chunks' own embedded palette genuinely IS all zero (that measurement was correct); what
was wrong was concluding "no colour source" from it -- the boot blocks (202/203/204) in the SAME
file carry the real, populated relocation the wall banks share.

INPUTS
  DOS   Death Knights of Krynn/8X8D{1,2,3,4,5}.DAX -- seven 256-tile wall-bank series, ids 1..7
        (`SERIES_DAX_FILE` below).
  Amiga .../DeathKnightsOfKrynn/data/8x8d1.daa -- each series `s` splits into 4 sparse 64-tile
        chunks, ids `(s, s+20, s+40, s+60)`; each chunk is a standard 5-plane `512x8` wide frame
        with an all-zero embedded palette. Block 202 (or 203/204 -- all three carry the identical
        relocation) supplies the real colour table.

THE COLOUR MAP (never resolved RGB, never the wall banks' own -- empty -- palette)
  `derive_amiga_index_map` reads a boot block's palette and matches slots 17..31 to the fixed
  EGA-16 table by exact RGB (14 of the 16 DOS colours are uniquely colour-derivable this way).
  Two slots are NOT colour-derivable and are pinned (see that function's docstring for why):
  DOS EGA 0 (black) -> Amiga slot 0, and DOS EGA 13 (the transparency key) -> Amiga slot 16.

THE PREDICATE (exact per-tile identity, not a shape statistic)
  A DOS tile and an Amiga tile match iff, for all 64 pixels, `mapping[dos_pixel] == amiga_pixel`.
  A hypothesis's score is the count of the 256 tiles that match exactly. This replaces the
  2026-09-02 pass's `ink_mask`/`quant4` shape predicates and the 96-hypothesis
  order x interleave sweep entirely -- once the DOS reading is fixed, no interleave granularity
  is needed: only the 24 orderings of the 4 chunks matter, and one wins outright.

THE PREDECESSOR NULL
  `dos_wall_bank_tiles_strip_LEGACY` is the ORIGINAL (buggy) DOS reading, kept live rather than
  deleted: scored against the corrected Amiga natural order under the SAME exact predicate, it is
  the number this correction must beat, and the module's tests pin it low.

THE RANDOM-PAIRING NULL
  Shuffle a fixed 256-tile Amiga pool (natural order) uniformly at random and score it against
  the fixed DOS order, repeated `n_shuffles` (>=1000) times -- what "no relationship" scores like
  under the exact predicate (near 0/256, since two independently-chosen 8x8 tiles matching all 64
  pixels by chance is astronomically unlikely).

Usage:
    python tools/dok_amiga_wallbank.py --report
    python tools/dok_amiga_wallbank.py --report --amiga "D:/Games/.../DeathKnightsOfKrynn/data/8x8d1.daa"
"""
from __future__ import annotations

import argparse
import random
import sys
from itertools import permutations
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dax_decode as dax  # noqa: E402
import daa_decode as daa  # noqa: E402

REPO = Path(__file__).resolve().parent.parent

TILE_PX = 8
BANK_TILES = 256
CHUNK_TILES = 64
CHUNK_OFFSETS = (0, 20, 40, 60)
NATURAL_ORDER = CHUNK_OFFSETS
SERIES_IDS = (1, 2, 3, 4, 5, 6, 7)
# Which DOS `8X8D*.DAX` file holds each series' 256-tile wall bank (measured 2026-09-03; a probe
# over every `8X8D*.DAX` block whose decompressed header reads {height=8, width_div8=1}).
SERIES_DAX_FILE = {
    1: "8X8D1.DAX",
    2: "8X8D4.DAX",
    3: "8X8D2.DAX",
    4: "8X8D2.DAX",
    5: "8X8D3.DAX",
    6: "8X8D3.DAX",
    7: "8X8D5.DAX",
}
BOOT_BLOCK_ID = 202  # any of 202/203/204 carry the identical EGA relocation (all measured equal)
ALL_BOOT_BLOCK_IDS = (202, 203, 204)

DEFAULT_DOK_DIR = REPO / "Death Knights of Krynn"
DEFAULT_AMIGA_DAA = Path(
    r"D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked"
    r"\DeathKnightsOfKrynn\data\8x8d1.daa"
)
# A second, in-repo copy of the same bytes (sha-identical per CLAUDE.md) -- used when the
# never-vendored WHDLoad path is absent, so this module's own tests need nothing external.
REPO_AMIGA_DAA = REPO / "amiga_extracted" / "DeathKnightsOfKrynn" / "disk1" / "8x8d1.daa"

DEFAULT_SEED = 20260903

IndexTile = tuple  # 64 raw decoder palette-index ints, row-major (0..15 DOS, 0..31 Amiga)


def resolve_amiga_daa() -> Path:
    if DEFAULT_AMIGA_DAA.exists():
        return DEFAULT_AMIGA_DAA
    return REPO_AMIGA_DAA


# --------------------------------------------------------------------------------------------
# DOS reading -- CORRECTED (17-byte tile array) and the LEGACY (buggy 8-byte strip) reading,
# kept live as the predecessor null.
# --------------------------------------------------------------------------------------------


def _decode_dos_chunky_tile(raw: bytes, off: int, row_bytes: int, height: int) -> IndexTile:
    idx = [0] * (row_bytes * 2 * height)
    o = 0
    for y in range(height):
        base = off + y * row_bytes
        for xb in range(row_bytes):
            byte = raw[base + xb]
            idx[o] = byte >> 4
            idx[o + 1] = byte & 0x0F
            o += 2
    return tuple(idx)


def dos_wall_bank_tiles(dax_path: Path, block_id: int) -> list[IndexTile]:
    """**Corrected reading (R1).** 256 tiles from a DOS `8X8D*.DAX` 256-tile wall-bank block, via
    `dax_decode.parse_ega_tile_array` (the 17-byte-header EGA tile array `decode8x8dBlock`
    already renders these banks with in `?explore=dok`) -- NOT `parse_tile_strip` (see module
    docstring for the bug that reading caused). Each tile is a tuple of 64 raw EGA palette-index
    ints (0..15), row-major, in storage order (the engine's own global tile-catalog order).
    """
    data = dax_path.read_bytes()
    base, blocks = dax.parse_container(data)
    blk = next((b for b in blocks if b.block_id == block_id), None)
    if blk is None:
        raise ValueError(f"block {block_id} not found in {dax_path}")
    raw = dax.decompress_block(data, base, blk)
    parsed = dax.parse_ega_tile_array(raw)
    if parsed is None:
        raise ValueError(f"block {block_id} in {dax_path} does not parse as a 17-byte EGA tile array")
    width, height, count, header_len = parsed
    if (width, height) != (TILE_PX, TILE_PX):
        raise ValueError(f"block {block_id} in {dax_path}: unexpected tile geometry {width}x{height}")
    if count != BANK_TILES:
        raise ValueError(f"block {block_id} in {dax_path}: expected {BANK_TILES} tiles, got {count}")
    tile_bytes = TILE_PX // 2 * TILE_PX
    return [
        _decode_dos_chunky_tile(raw, header_len + i * tile_bytes, TILE_PX // 2, TILE_PX)
        for i in range(count)
    ]


def dos_wall_bank_tiles_strip_LEGACY(dax_path: Path, block_id: int = 1) -> list[IndexTile]:
    """**The bug (kept live, not deleted).** The ORIGINAL DOS reading this module used before
    2026-09-03: `dax_decode.parse_tile_strip`, the 8-byte-header 16px-wide tile-STRIP format.
    This is the WRONG shape for DoK's 256-tile wall banks (the correct shape is the 17-byte-
    header tile ARRAY, see `dos_wall_bank_tiles` above) -- it reads the SAME 8209 bytes as a
    16px-wide vertical strip, which shifts the byte alignment and interleaves rows of
    neighbouring tiles. Retained as a live function (not deleted) so it can be scored under the
    SAME exact-identity predicate as the corrected reading: `test_dok_amiga_wallbank.py` pins
    this at <= 2/256 exact matches (measured 2026-09-03, see the module docstring/report for the
    discrepancy against the number quoted when this correction was commissioned) -- the
    predecessor null a correction must beat, so the retraction is checkable, not just asserted.
    """
    data = dax_path.read_bytes()
    base, blocks = dax.parse_container(data)
    blk = next((b for b in blocks if b.block_id == block_id), None)
    if blk is None:
        raise ValueError(f"block {block_id} not found in {dax_path}")
    raw = dax.decompress_block(data, base, blk)
    parsed = dax.parse_tile_strip(raw)
    if parsed is None:
        raise ValueError(f"block {block_id} in {dax_path} does not parse as a tile strip")
    width, height, header_len = parsed
    pix = raw[header_len:]
    row_bytes = width // 2
    idx = [0] * (width * height)
    o = 0
    for y in range(height):
        base_o = y * row_bytes
        for xb in range(row_bytes):
            i = base_o + xb
            byte = pix[i] if i < len(pix) else 0
            idx[o] = byte >> 4; idx[o + 1] = byte & 0x0F; o += 2
    dax._deroll_indices(idx, width, height)  # noqa: SLF001 - deliberate reuse (parity with the bug)
    tiles: list[IndexTile] = []
    bands = height // TILE_PX
    for band in range(bands):
        for tile_x in (0, TILE_PX):
            tile = [0] * (TILE_PX * TILE_PX)
            for ty in range(TILE_PX):
                src_off = (band * TILE_PX + ty) * width + tile_x
                dst_off = ty * TILE_PX
                tile[dst_off:dst_off + TILE_PX] = idx[src_off:src_off + TILE_PX]
            tiles.append(tuple(tile))
            if len(tiles) == BANK_TILES:
                return tiles
    raise ValueError(
        f"only {len(tiles)} tiles recovered from {dax_path} block {block_id}, need {BANK_TILES}"
    )


# --------------------------------------------------------------------------------------------
# Amiga reading -- unchanged from the 2026-09-02 pass (this side was never the bug).
# --------------------------------------------------------------------------------------------


def _amiga_frame_indices(raw: bytes, width: int, height: int, pix_off: int) -> list[int]:
    """Raw 5-bitplane palette INDEX values (0..31), the exact per-pixel values
    `daa_decode.planar_frame_to_rgb` computes internally, minus the final palette lookup."""
    row_bytes = ((width + 15) // 16) * 2
    plane_size = row_bytes * height
    pix = raw[pix_off:]
    idx = [0] * (width * height)
    o = 0
    for y in range(height):
        rbase = y * row_bytes
        for x in range(width):
            byte_i = rbase + (x >> 3)
            bit = 7 - (x & 7)
            v = 0
            for p in range(daa.NUM_PLANES):
                b = pix[p * plane_size + byte_i]
                v |= ((b >> bit) & 1) << p
            idx[o] = v
            o += 1
    return idx


def amiga_chunk_tiles(daa_path: Path, block_id: int) -> list[IndexTile]:
    """64 tiles from one Amiga `8x8d1.daa` wall-bank chunk, decoded through the standard 5-plane
    wide-frame path (`daa_decode.parse_frame_header` for geometry, `_amiga_frame_indices` for the
    raw per-pixel palette index -- the wall-bank chunks' own embedded palette is all-zero, see
    `test_wall_bank_embedded_palette_is_all_zero`, so RGB resolution is never used for identity).
    Tile order left-to-right within the frame, matching `daa.ts`'s `decodeDaaWideTileBlock`. Each
    tile is a tuple of 64 raw 5-bitplane index ints (0..31).
    """
    data = daa_path.read_bytes()
    kind, base, blocks = daa.parse_container(data)
    if kind != "blocks":
        raise ValueError(f"{daa_path} is not a 9-byte-TOC DAA container")
    blk = next((b for b in blocks if b.block_id == block_id), None)
    if blk is None:
        raise ValueError(f"block {block_id} not found in {daa_path}")
    raw = daa.decompress_block(data, base, blk)
    parsed = daa.parse_frame_header(raw)
    if parsed is None:
        raise ValueError(f"block {block_id} in {daa_path} is not a standard 5-plane frame")
    width, height, _pal, pix_off = parsed
    if height != TILE_PX or width % TILE_PX != 0:
        raise ValueError(f"block {block_id} in {daa_path}: unexpected frame shape {width}x{height}")
    idx = _amiga_frame_indices(raw, width, height, pix_off)
    count = width // TILE_PX
    tiles: list[IndexTile] = []
    for t in range(count):
        tile = [0] * (TILE_PX * TILE_PX)
        for ty in range(TILE_PX):
            src_off = ty * width + t * TILE_PX
            dst_off = ty * TILE_PX
            tile[dst_off:dst_off + TILE_PX] = idx[src_off:src_off + TILE_PX]
        tiles.append(tuple(tile))
    return tiles


def load_amiga_series(daa_path: Path, base_id: int) -> dict[int, list[IndexTile]]:
    """The 4 chunks of one wall-bank series, keyed by their OFFSET from the base id (0, 20, 40,
    60) -- i.e. block ids `base_id + offset`."""
    return {off: amiga_chunk_tiles(daa_path, base_id + off) for off in CHUNK_OFFSETS}


def all_wall_bank_block_ids() -> list[int]:
    """All 28 wall-bank chunk ids across the 7 series (7 series x 4 chunks)."""
    return [s + off for s in SERIES_IDS for off in CHUNK_OFFSETS]


# --------------------------------------------------------------------------------------------
# The colour map -- derived from a boot block's own embedded palette, never the (empty) wall-
# bank palette, never resolved RGB comparison.
# --------------------------------------------------------------------------------------------


def derive_amiga_index_map(daa_path: Path, boot_block_id: int = BOOT_BLOCK_ID) -> dict[int, int]:
    """Derive the DOS EGA (0..15) -> Amiga wall-bank palette-index (0 or 16..31) map from a boot
    block's own embedded palette. Block 202 (like 203 and 204) carries the sixteen EGA colours
    relocated into slots 17..31; this matches each of those slots to the fixed EGA-16 table by
    EXACT RGB (asserted unique -- a duplicate colour match is a decode/format regression, not a
    data question, and raises).

    Two slots are NOT recoverable by colour match and are pinned rather than derived:
      - DOS EGA 0 (black): Amiga slot 0 AND slot 16 both read (0,0,0) in this palette, so colour
        matching alone cannot tell them apart -- slot 0 is the conventional background slot.
      - DOS EGA 13 (bright magenta, the wall-bank transparency key): slot 16 ALSO reads (0,0,0)
        here (it is the Amiga transparency key, never resolved to a real colour, so its OWN
        palette entry can't identify it either). Its colour-derived candidate -- slot 29, the
        genuine bright magenta (255,85,255) -- is real but measured (2026-09-03) to never be the
        slot the wall banks actually draw with: Amiga index 16's per-tile pixel COUNT matches DOS
        EGA 13's exactly (2596 vs 2596 on bank 1), while slot 29 never appears in any wall tile.
        So 13 is pinned to 16, discarding the spurious colour-only match to 29.

    Returns a dict covering all 16 DOS EGA indices, asserted to be a bijection (16 distinct
    values, each in {0} u {16..31}) before returning.
    """
    data = daa_path.read_bytes()
    kind, base, blocks = daa.parse_container(data)
    blk = next((b for b in blocks if b.block_id == boot_block_id), None)
    if blk is None:
        raise ValueError(f"boot block {boot_block_id} not found in {daa_path}")
    raw = daa.decompress_block(data, base, blk)
    parsed = daa.parse_frame_header(raw)
    if parsed is None:
        raise ValueError(f"boot block {boot_block_id} in {daa_path} is not a standard frame")
    _w, _h, pal, _pix_off = parsed

    color_to_ega = {c: i for i, c in enumerate(dax.EGA_PALETTE)}
    mapping: dict[int, int] = {}
    for slot in range(17, 32):
        color = pal[slot]
        ega = color_to_ega.get(color)
        if ega is None:
            continue
        if ega in mapping:
            raise ValueError(
                f"derive_amiga_index_map: EGA {ega} matches both slot {mapping[ega]} and {slot}"
            )
        mapping[ega] = slot

    mapping.pop(13, None)  # discard the spurious slot-29 colour match -- see docstring
    mapping[0] = 0
    mapping[13] = 16

    if len(mapping) != 16 or len(set(mapping.values())) != 16:
        raise ValueError(f"derive_amiga_index_map: not a bijection over 16 EGA colours: {mapping}")
    for v in mapping.values():
        if v != 0 and not (16 <= v <= 31):
            raise ValueError(f"derive_amiga_index_map: value {v} outside {{0,16..31}}")
    return mapping


# --------------------------------------------------------------------------------------------
# The exact-identity predicate and the chunk-order sweep.
# --------------------------------------------------------------------------------------------


def tile_matches_exact(dos_tile: IndexTile, amiga_tile: IndexTile, mapping: dict[int, int]) -> bool:
    """True iff every one of the 64 pixels agrees: `mapping[dos_pixel] == amiga_pixel`. A DOS
    index with no map entry (should not happen -- the map is total over 0..15) never matches."""
    return all(mapping.get(dv, -1) == av for dv, av in zip(dos_tile, amiga_tile))


def exact_match_count(
    dos_tiles: Sequence[IndexTile], amiga_tiles: Sequence[IndexTile], mapping: dict[int, int]
) -> int:
    n = min(len(dos_tiles), len(amiga_tiles))
    return sum(1 for i in range(n) if tile_matches_exact(dos_tiles[i], amiga_tiles[i], mapping))


def differing_tiles(
    dos_tiles: Sequence[IndexTile], amiga_tiles: Sequence[IndexTile], mapping: dict[int, int]
) -> list[dict]:
    """Per differing tile: index, the differing pixel (x, y) coordinates, and the (dos_index,
    amiga_index, expected_amiga_index) delta at each -- used for the report."""
    out = []
    for i, (d, a) in enumerate(zip(dos_tiles, amiga_tiles)):
        deltas = [
            {"x": px % TILE_PX, "y": px // TILE_PX, "dos": dv, "amiga": av, "expected": mapping.get(dv, -1)}
            for px, (dv, av) in enumerate(zip(d, a))
            if mapping.get(dv, -1) != av
        ]
        if deltas:
            out.append({"tile": i, "pixels": deltas})
    return out


def combine_order(chunks: dict[int, list[IndexTile]], order: Sequence[int]) -> list[IndexTile]:
    """Concatenate the 4 chunks end to end in `order` (a permutation of `CHUNK_OFFSETS`)."""
    out: list[IndexTile] = []
    for off in order:
        out.extend(chunks[off])
    return out


def sweep_all_orders(
    dos_tiles: Sequence[IndexTile], chunks: dict[int, list[IndexTile]], mapping: dict[int, int]
) -> list[dict]:
    """All 24 permutations of the 4 chunk offsets, each scored by `exact_match_count` -- proves
    the natural order's uniqueness rather than assuming it. Sorted best first."""
    results = []
    for order in permutations(CHUNK_OFFSETS):
        combined = combine_order(chunks, order)
        score = exact_match_count(dos_tiles, combined, mapping)
        results.append({"order": order, "score": score})
    results.sort(key=lambda r: -r["score"])
    return results


def shuffled_null(
    dos_tiles: Sequence[IndexTile],
    pool_tiles: Sequence[IndexTile],
    mapping: dict[int, int],
    n_shuffles: int = 1000,
    seed: int = DEFAULT_SEED,
) -> list[int]:
    """Shuffle `pool_tiles` (a fixed 256-tile Amiga pool, natural order) uniformly at random and
    score each shuffle against the fixed `dos_tiles` order, `n_shuffles` times -- what "no
    relationship at all" scores like under the exact-identity predicate."""
    rng = random.Random(seed)
    n = len(pool_tiles)
    scores = []
    for _ in range(n_shuffles):
        perm = list(range(n))
        rng.shuffle(perm)
        shuffled = [pool_tiles[i] for i in perm]
        scores.append(exact_match_count(dos_tiles, shuffled, mapping))
    return scores


# --------------------------------------------------------------------------------------------
# Own-palette check (unchanged finding from 2026-09-02, re-verified over ALL 28 chunks here
# rather than just series 1's four).
# --------------------------------------------------------------------------------------------


def wall_bank_palette_is_all_zero(daa_path: Path, block_id: int) -> bool:
    data = daa_path.read_bytes()
    kind, base, blocks = daa.parse_container(data)
    blk = next(b for b in blocks if b.block_id == block_id)
    raw = daa.decompress_block(data, base, blk)
    _w, _h, pal, _pix_off = daa.parse_frame_header(raw)
    return set(pal) == {(0, 0, 0)}


# --------------------------------------------------------------------------------------------
# Full per-series analysis + CLI report
# --------------------------------------------------------------------------------------------


class SeriesResult:
    def __init__(self, series_id, dax_file, dos_tiles, chunks, mapping):
        self.series_id = series_id
        self.dax_file = dax_file
        self.dos_tiles = dos_tiles
        self.chunks = chunks
        self.mapping = mapping
        self.natural = combine_order(chunks, NATURAL_ORDER)
        self.natural_score = exact_match_count(dos_tiles, self.natural, mapping)
        self.diffs = differing_tiles(dos_tiles, self.natural, mapping)


def run_series(dok_dir: Path, amiga_daa_path: Path, series_id: int, mapping: dict[int, int]) -> SeriesResult:
    dax_file = SERIES_DAX_FILE[series_id]
    dos_tiles = dos_wall_bank_tiles(dok_dir / dax_file, series_id)
    chunks = load_amiga_series(amiga_daa_path, series_id)
    return SeriesResult(series_id, dax_file, dos_tiles, chunks, mapping)


def run_all_series(dok_dir: Path, amiga_daa_path: Path) -> tuple[dict[int, int], list[SeriesResult]]:
    mapping = derive_amiga_index_map(amiga_daa_path)
    return mapping, [run_series(dok_dir, amiga_daa_path, s, mapping) for s in SERIES_IDS]


def print_report(dok_dir: Path, amiga_daa_path: Path, n_shuffles: int = 1000) -> None:
    mapping, series_results = run_all_series(dok_dir, amiga_daa_path)
    print(f"Derived DOS EGA -> Amiga index map ({len(mapping)} entries):")
    for ega in sorted(mapping):
        print(f"  EGA {ega:>2} -> Amiga {mapping[ega]}")
    print()
    print("Per-series exact-identical tile counts (natural order, id/id+20/id+40/id+60):")
    total = 0
    for r in series_results:
        total += r.natural_score
        print(f"  series {r.series_id} ({r.dax_file}): {r.natural_score}/256")
        for d in r.diffs:
            coords = ", ".join(f"({p['x']},{p['y']}) dos={p['dos']}->amiga_expected={p['expected']} got={p['amiga']}" for p in d["pixels"])
            print(f"    tile {d['tile']}: {len(d['pixels'])} differing px: {coords}")
    print(f"  TOTAL: {total}/{256 * len(series_results)}")
    print()

    print("24-order table (series 1, exact predicate):")
    s1 = series_results[0]
    sweep = sweep_all_orders(s1.dos_tiles, s1.chunks, mapping)
    for r in sweep:
        ids = "+".join(str(s1.series_id + o) for o in r["order"])
        print(f"  {ids:<16} {r['score']}/256")
    print()

    print(f"Shuffled null (series 1, n={n_shuffles}, seed={DEFAULT_SEED}):")
    null_scores = shuffled_null(s1.dos_tiles, s1.natural, mapping, n_shuffles=n_shuffles)
    print(f"  mean={sum(null_scores)/len(null_scores):.2f} max={max(null_scores)} min={min(null_scores)}")
    print()

    print("Predecessor null (legacy 8-byte-strip DOS reading, series 1 vs corrected Amiga natural order):")
    legacy = dos_wall_bank_tiles_strip_LEGACY(dok_dir / s1.dax_file, s1.series_id)
    legacy_score = exact_match_count(legacy, s1.natural, mapping)
    print(f"  {legacy_score}/256")
    print()

    print("Own embedded palette (all 28 wall-bank chunks vs the 3 boot blocks):")
    all_zero = all(wall_bank_palette_is_all_zero(amiga_daa_path, bid) for bid in all_wall_bank_block_ids())
    print(f"  all 28 wall-bank chunks all-zero: {all_zero}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dok-dir", type=Path, default=DEFAULT_DOK_DIR)
    p.add_argument("--amiga", type=Path, default=None)
    p.add_argument("--shuffles", type=int, default=1000)
    p.add_argument("--report", action="store_true")
    args = p.parse_args()

    amiga_path = args.amiga or resolve_amiga_daa()
    if not args.dok_dir.exists():
        print(f"DOS source dir not found: {args.dok_dir}", file=sys.stderr)
        return 1
    if not amiga_path.exists():
        print(f"Amiga source not found (never-vendored, external): {amiga_path}", file=sys.stderr)
        return 1

    print_report(args.dok_dir, amiga_path, n_shuffles=args.shuffles)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
