#!/usr/bin/env python3
"""Render C64 `WALLSET{id}` glyph banks under both plausible VIC-II character modes, and
cross-check against the DOS `8X8D{n}.DAX` wall-tile art of the SAME title/id, to settle the
"WALLSET records are VIC-II character-generator glyphs" reading BY LOOKING AT THE DECODED
PIXELS -- not by hunting the (still-unfound) consumer routine. See
docs/engine/research/c64-wallset-format.md section 7 for the writeup this tool produced.

Companion to `tools/c64_wallset.py` (container-shape parsing, `parse_wallset`/`glyph_bits`,
unchanged by this pass) -- this module only adds rendering and the DOS cross-check. Outputs go
to a caller-supplied `--outdir` (default `renders/c64_wallset/`, itself git-ignored); this tool
does not write anywhere under the repo proper.

Two renders per WALLSET body, both built from the exact same 8 bytes/glyph -- only the *bit
grouping* differs, per `c64_wallset.py`'s own module docstring:

  * hires   -- 1 bit/pixel, 8x8 px/glyph, 2-tone (black/white). The "VIC hires character" mode.
  * multicolor -- 2 bits/pixel, 4x8 px/glyph doubled horizontally to 8x8 (C64 multicolor-mode
    convention: each bit-pair is one double-wide pixel). Rendered on a 4-step GREYSCALE ramp
    (black/dark-grey/light-grey/white), not real VIC-II colours -- the real background/
    multicolor1/multicolor2/foreground register values for this asset are UNKNOWN (WALLSET
    ships no palette; nothing in this project's disassembly has pinned a screen-mode setup
    specific to this family -- see the research doc's still-open consumer question). Greyscale
    is an honest choice here: it reveals STRUCTURE (which is what this task asks to judge)
    without asserting colours nobody has proven.

DOS cross-check: `dos_8x8d_tile_strip` decodes the SAME-ID block out of a title's `8X8D*.DAX`
files via `dax_decode.py`'s existing, verified pipeline (`parse_container` / `decompress_block`
/ `parse_tile_strip` / `frame_to_rgb`) -- this is the DOS pixel art the C64 `WALLDEF`/`WALLSET`
id most plausibly corresponds to (verified below to share the SAME id numbering as WALLDEF's own
DOS block ids -- see the module-level NOTE and the research doc's section 7.3). C64 and DOS art
are independently redrawn, not shared bytes (established elsewhere in this project), so a match
here means "same wall motif, redrawn," never a byte match.

NOTE on id correspondence (established this pass, not assumed): DOS `WALLDEF*.DAX` block ids are
ALREADY known (docs, section 3.1) to equal the C64 hex id's decimal value (e.g. C64 `WALLDEF17`
<-> DOS block id 23 = 0x17) -- that correspondence was proven for content-inequality, not
identity, by the DOS-parity test, but the ID KEYING itself checks out: every DOS WALLDEF id in
this project's CoK/DoK corpus is a decimal reading of some C64 WALLSET/WALLDEF hex id. This
module additionally confirms (see `--id-crosscheck`) that DOS `8X8D*.DAX` files carry a handful
of LOW block ids (in addition to many unrelated higher ids -- other tile families sharing the
same per-area archive) that also land in that same id set, and for Death Knights of Krynn the
low `8X8D*.DAX` ids are EXACTLY the title's 7 WALLDEF ids {1..7}, a clean 1:1 match. That is the
basis for treating a `8X8D` block at block_id == C64's decimal id as "the DOS wall art for that
same area", not a guess.

Usage:
    python tools/c64_wallset_render.py --render TITLE_DIR --id 17 --outdir renders/c64_wallset
    python tools/c64_wallset_render.py --compare-dos TITLE_DIR DOS_DIR --id 17 \
        --outdir renders/c64_wallset
    python tools/c64_wallset_render.py --walldef-index-check TITLE_DIR
"""
from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_wallset as wallset  # noqa: E402
import dax_decode as dax  # noqa: E402

# --------------------------------------------------------------------------------------------
# Palettes. Both are ILLUSTRATIVE -- see module docstring for why greyscale, not real VIC colour,
# is the honest choice for the multicolor reading (no register values are known for this asset).
# --------------------------------------------------------------------------------------------

HIRES_PALETTE = [(0x00, 0x00, 0x00), (0xFF, 0xFF, 0xFF)]
MULTICOLOR_PALETTE = [(0x00, 0x00, 0x00), (0x55, 0x55, 0x55), (0xAA, 0xAA, 0xAA), (0xFF, 0xFF, 0xFF)]


# --------------------------------------------------------------------------------------------
# Bit-grouping readings of one 8-byte glyph
# --------------------------------------------------------------------------------------------


def expand_multicolor(glyph: bytes) -> list[list[int]]:
    """One WALLSET glyph (8 bytes) as an 8x8 grid of 0..3 multicolor pixel VALUES.

    C64 multicolor-character convention: each byte's 4 bit-PAIRS (MSB-first) are one
    double-wide pixel each, so 8 bits -> 4 logical pixels -> 8 physical columns. This is the
    same 8 bytes `c64_wallset.glyph_bits` reads as 8 independent 1-bit pixels -- only the
    grouping differs, exactly as that function's own docstring says.
    """
    if len(glyph) != wallset.GLYPH_SIZE:
        raise ValueError(f"glyph must be exactly {wallset.GLYPH_SIZE} bytes, got {len(glyph)}")
    rows: list[list[int]] = []
    for byte in glyph:
        row: list[int] = []
        for pair in range(4):
            v = (byte >> (6 - 2 * pair)) & 0x3
            row.append(v)
            row.append(v)  # doubled horizontally -- multicolor pixels are 2 dots wide
        rows.append(row)
    return rows


# --------------------------------------------------------------------------------------------
# Contact-sheet rendering
# --------------------------------------------------------------------------------------------


class Sheet(NamedTuple):
    width: int
    height: int
    rgb: bytes
    glyph_count: int


def render_sheet(body: bytes, mode: str, cols: int = 16, scale: int = 3) -> Sheet:
    """Lay out every glyph in a WALLSET body as an 8x8 (or 4x8-doubled) grid sheet.

    `mode` is "hires" or "multicolor". Raises ValueError for any other mode -- callers should
    not silently fall back to a default, since which mode is "right" is exactly the open
    question this tool exists to help settle.
    """
    if mode not in ("hires", "multicolor"):
        raise ValueError(f"mode must be 'hires' or 'multicolor', got {mode!r}")
    glyphs = wallset.parse_wallset(body).glyphs
    n = len(glyphs)
    rows = (n + cols - 1) // cols
    w, h = cols * 8 * scale, rows * 8 * scale
    img = bytearray(w * h * 3)
    palette = HIRES_PALETTE if mode == "hires" else MULTICOLOR_PALETTE

    def blot(px: int, py: int, val: int) -> None:
        r, g, b = palette[val]
        for dx in range(scale):
            for dy in range(scale):
                x, y = px * scale + dx, py * scale + dy
                if x < w and y < h:
                    o = (y * w + x) * 3
                    img[o], img[o + 1], img[o + 2] = r, g, b

    for i, glyph in enumerate(glyphs):
        grid = (wallset.glyph_bits(glyph) if mode == "hires" else expand_multicolor(glyph))
        base_x, base_y = (i % cols) * 8, (i // cols) * 8
        for ry in range(8):
            for rx in range(8):
                blot(base_x + rx, base_y + ry, grid[ry][rx])

    return Sheet(w, h, bytes(img), n)


def write_png(path: Path, width: int, height: int, rgb: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
        Image.frombytes("RGB", (width, height), bytes(rgb)).save(path)
        return
    except ImportError:
        pass
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgb[y * width * 3:(y + 1) * width * 3]

    def chunk(typ: bytes, payload: bytes) -> bytes:
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


# --------------------------------------------------------------------------------------------
# DOS cross-check: decode the same-id 8X8D*.DAX tile strip
# --------------------------------------------------------------------------------------------


class DosTileStrip(NamedTuple):
    width: int
    height: int
    rgb: bytes
    source_file: str
    block_id: int


def dos_8x8d_tile_strip(dos_dir: Path, block_id: int) -> DosTileStrip | None:
    """The decoded tile-strip render of the `8X8D*.DAX` block with this exact `block_id`, or
    None if no `8X8D*.DAX` file under `dos_dir` carries it (or the block doesn't parse as a
    tile strip -- see `dax_decode.parse_tile_strip`). Scans every `8X8D*.DAX`/`8x8d*.dax` file
    directly under `dos_dir`, first match wins (this project's corpus has never shown the same
    block_id repeated with different content across a title's own 8X8D files).
    """
    for f in sorted(dos_dir.glob("8X8D*.DAX")) + sorted(dos_dir.glob("8x8d*.dax")):
        data = f.read_bytes()
        try:
            base, blocks = dax.parse_container(data)
        except ValueError:
            continue
        for b in blocks:
            if b.block_id != block_id:
                continue
            raw = dax.decompress_block(data, base, b)
            parsed = dax.parse_tile_strip(raw)
            if parsed is None:
                continue
            width, height, header_len = parsed
            rgb = dax.frame_to_rgb(raw, width, height, header_len)
            return DosTileStrip(width, height, bytes(rgb), f.name, block_id)
    return None


def reshape_strip_to_grid(width: int, height: int, rgb: bytes, cols: int = 16, scale: int = 3
                           ) -> Sheet:
    """Reflow a DOS 8X8D tile strip (always 16px wide = 2 tiles/row per `dax_decode.
    parse_tile_strip`) into a `cols`-wide grid of individual 8x8 tiles, the same layout
    `render_sheet` uses for WALLSET -- so the two renders can be eyeballed side by side at
    comparable scale instead of one being a tall 16px-wide ribbon. Any trailing partial 8-row
    band (payload not an exact multiple of 8 pixel rows) is dropped, not padded with garbage.
    """
    band_h = 8
    bands = height // band_h
    tiles: list[bytes] = []  # each is band_h*8*3 bytes, left tile then right tile per band
    for band in range(bands):
        for tile_x in (0, 8):
            tile = bytearray(8 * 8 * 3)
            for ty in range(8):
                src_y = band * band_h + ty
                src_row_off = (src_y * width + tile_x) * 3
                dst_off = ty * 8 * 3
                tile[dst_off:dst_off + 8 * 3] = rgb[src_row_off:src_row_off + 8 * 3]
            tiles.append(bytes(tile))
    n = len(tiles)
    if n == 0:
        return Sheet(0, 0, b"", 0)
    rows = (n + cols - 1) // cols
    w, h = cols * 8 * scale, rows * 8 * scale
    img = bytearray(w * h * 3)
    for i, tile in enumerate(tiles):
        base_x, base_y = (i % cols) * 8, (i // cols) * 8
        for ty in range(8):
            for tx in range(8):
                r, g, b = tile[(ty * 8 + tx) * 3:(ty * 8 + tx) * 3 + 3]
                for dx in range(scale):
                    for dy in range(scale):
                        x, y = (base_x + tx) * scale + dx, (base_y + ty) * scale + dy
                        o = (y * w + x) * 3
                        img[o], img[o + 1], img[o + 2] = r, g, b
    return Sheet(w, h, bytes(img), n)


def dos_8x8d_low_ids(dos_dir: Path) -> set[int]:
    """Every block_id < 64 across a title's `8X8D*.DAX` files -- the id range WALLSET/WALLDEF
    hex ids (2 hex digits, so 0..255, but observed corpus-wide to stay under 64) live in. Used
    by `--id-crosscheck` to report how much of a title's WALLDEF id set the 8X8D family's own
    ids actually cover, without assuming every 8X8D id is wall-related (many are not -- door/
    decoration/other per-area tile strips share the same archive under higher ids).
    """
    out: set[int] = set()
    for f in sorted(dos_dir.glob("8X8D*.DAX")) + sorted(dos_dir.glob("8x8d*.dax")):
        data = f.read_bytes()
        try:
            base, blocks = dax.parse_container(data)
        except ValueError:
            continue
        out.update(b.block_id for b in blocks if b.block_id < 64)
    return out


def dos_walldef_ids(dos_dir: Path) -> set[int]:
    """Every block_id across a title's `WALLDEF*.DAX` files (mirrors `dos_8x8d_low_ids`)."""
    out: set[int] = set()
    for f in sorted(dos_dir.glob("WALLDEF*.DAX")) + sorted(dos_dir.glob("walldef*.dax")):
        data = f.read_bytes()
        try:
            base, blocks = dax.parse_container(data)
        except ValueError:
            continue
        out.update(b.block_id for b in blocks)
    return out


# --------------------------------------------------------------------------------------------
# Objective, corpus-scale mode discriminator (2026-08-12): a quantitative complement to "look
# at the render and judge" -- a falsifiable, rerunnable number instead of an eyeballed opinion.
#
# The idea: real hand-drawn tile art has VERTICAL structure -- adjacent scanline ROWS within a
# glyph tend to repeat the same pixel value in the same column (that is what "an edge" or "a
# solid region" or "a step" IS, pixel-wise). Noise does not. This is grouping-agnostic in one
# important sense (the SAME 8 bytes are read both ways) but NOT baseline-agnostic: a hires
# (2-value) reading has a 50% chance of two random bits matching, while a multicolor (4-value)
# reading only has a 25% chance of two random 2-bit values matching by chance. A raw comparison
# of "same fraction" is therefore biased toward hires and cannot be used directly -- it must be
# compared against EACH reading's own chance baseline (the "excess" below). This bias direction
# and magnitude were confirmed empirically (see HIRES_CHANCE_BASELINE/MULTICOLOR_CHANCE_BASELINE
# docstrings) on 320 genuinely random synthetic bodies before trusting it on the real corpus --
# see `RandomControlTests` in the test file, which pins that a random-byte control produces an
# even split, not a hires-favoring one, ruling out "the metric just always prefers multicolor"
# as an alternative explanation for the real corpus's lopsided result.
# --------------------------------------------------------------------------------------------

#: Chance-level fraction of adjacent-row same-value hits for a 2-valued (hires) reading.
HIRES_CHANCE_BASELINE = 0.5
#: Chance-level fraction of adjacent-row same-value hits for a 4-valued (multicolor) reading.
MULTICOLOR_CHANCE_BASELINE = 0.25


def vertical_row_continuity(body: bytes, mode: str) -> float:
    """Fraction of (row, col) pairs in every glyph of `body` where row r and row r+1 have the
    SAME decoded pixel value in the same column, under `mode` ("hires" or "multicolor"). A
    pure per-glyph, per-column, adjacent-row measure -- it says nothing about continuity
    BETWEEN glyphs (the contact-sheet layout is arbitrary and glyphs are not claimed to be
    adjacent on screen), only about vertical coherence WITHIN one 8x8 glyph, which is exactly
    what makes a rendered pixel look like "an edge" or "a filled region" rather than static.
    """
    if mode not in ("hires", "multicolor"):
        raise ValueError(f"mode must be 'hires' or 'multicolor', got {mode!r}")
    glyphs = wallset.parse_wallset(body).glyphs
    same = total = 0
    for g in glyphs:
        grid = wallset.glyph_bits(g) if mode == "hires" else expand_multicolor(g)
        for r in range(7):
            row, next_row = grid[r], grid[r + 1]
            for c in range(8):
                total += 1
                if row[c] == next_row[c]:
                    same += 1
    return same / total if total else 0.0


def vertical_continuity_excess(body: bytes, mode: str) -> float:
    """`vertical_row_continuity` minus that mode's own random-chance baseline.

    **DO NOT USE THIS TO CHOOSE A MODE. Corrected 2026-08-12 by the lead session: this
    statistic is NON-DISCRIMINATING, and the "bias-corrected / comparable between modes"
    claim this docstring used to make is wrong.** It was introduced as quantitative support
    for "WALLSET is multicolor" (96.9% of real files favour multicolor) against a stated
    chance level of 50%. That null is the wrong null. Measured against proper structural
    nulls -- see `structure_null_controls()`, which reproduces all of these:

      real corpus                        310/320  (96.9%)
      glyph ORDER shuffled, rows intact  310/320  (96.9%)   <- unchanged
      rows shuffled WITHIN each glyph    320/320  (100.0%)  <- *higher* than real
      uniform random @ corpus bit density 0.437   ~52%

    Shuffling rows inside each glyph destroys exactly the vertical continuity this metric
    claims to measure, and multicolor then wins MORE often than on the real data. So the
    96.9% figure is a property of the byte histogram and of the two decodings' differing
    pixel geometry, not evidence about which mode is correct. The uniform-random control
    that shipped with it only tested p(bit=1)=0.5, where the metric happens to be balanced;
    it is not balanced at other densities (~97.5% multicolor at p=0.25).

    Kept, not deleted, because the underlying measurement is real and the null figures above
    are worth being able to reproduce -- and because a reader who finds the 96.9% number
    elsewhere needs to find this warning attached to it."""
    baseline = HIRES_CHANCE_BASELINE if mode == "hires" else MULTICOLOR_CHANCE_BASELINE
    return vertical_row_continuity(body, mode) - baseline


def structure_null_controls(c64_root: Path, seed: int = 11) -> dict[str, tuple[int, int]]:
    """Null controls for `corpus_mode_verdict`, as {label: (multicolor_wins, total)}.

    Each null keeps something about the real data and destroys something else, so that a
    metric which is genuinely measuring within-glyph vertical structure must score lower on
    the nulls than on the real corpus:

      "real"          the untouched corpus
      "glyph_order"   glyph order permuted, each glyph's 8 rows intact  (structure kept)
      "row_shuffle"   the 8 rows permuted WITHIN each glyph             (structure destroyed)

    `row_shuffle` is the tightest null available for a vertical-continuity claim. It scores
    at or above "real", which is what proves the metric non-discriminating. Deterministic
    for a given `seed` so the numbers in the docs stay reproducible."""
    import random as _random

    rnd = _random.Random(seed)
    out: dict[str, list[int]] = {k: [0, 0] for k in ("real", "glyph_order", "row_shuffle")}

    def _wins(b: bytes) -> bool:
        return vertical_continuity_excess(b, "multicolor") > vertical_continuity_excess(b, "hires")

    for title_dir in sorted(p for p in Path(c64_root).iterdir() if p.is_dir()):
        for f in wallset.inventory(title_dir)["WALLSET"]:
            body = f.body
            rows = [list(body[i : i + 8]) for i in range(0, len(body) - len(body) % 8, 8)]
            if not rows:
                continue
            order = list(rows)
            rnd.shuffle(order)
            within = [(lambda r: (rnd.shuffle(r), r)[1])(list(g)) for g in rows]
            for label, variant in (
                ("real", body),
                ("glyph_order", bytes(b for g in order for b in g)),
                ("row_shuffle", bytes(b for g in within for b in g)),
            ):
                out[label][0] += _wins(variant)
                out[label][1] += 1
    return {k: (v[0], v[1]) for k, v in out.items()}


class ModeVerdict(NamedTuple):
    total_files: int
    multicolor_wins: int
    hires_wins: int

    @property
    def multicolor_fraction(self) -> float:
        return self.multicolor_wins / self.total_files if self.total_files else 0.0


def corpus_mode_verdict(c64_root: Path) -> ModeVerdict:
    """Run `vertical_continuity_excess` for both modes on every real WALLSET body under every
    title directory directly inside `c64_root`, and tally which mode's excess wins per file.
    This is the corpus-scale version of the single-file check above -- the rerunnable half of
    the doc's "310/320 files favour multicolor" corpus-wide claim.
    """
    mc_wins = hi_wins = 0
    for title_dir in sorted(p for p in c64_root.iterdir() if p.is_dir()):
        for f in wallset.iter_wall_files(title_dir, "WALLSET"):
            if f.problem or not f.body:
                continue
            h = vertical_continuity_excess(f.body, "hires")
            m = vertical_continuity_excess(f.body, "multicolor")
            if m > h:
                mc_wins += 1
            else:
                hi_wins += 1
    return ModeVerdict(mc_wins + hi_wins, mc_wins, hi_wins)


# --------------------------------------------------------------------------------------------
# WALLDEF-as-glyph-index check (task item 4): does WALLDEF's body scale with its partner
# WALLSET's glyph count, and do its bytes index validly into that glyph range?
# --------------------------------------------------------------------------------------------


class IndexValidity(NamedTuple):
    glyph_count: int
    body_len: int
    in_range: int          # bytes whose value is < glyph_count
    out_of_range: int       # bytes whose value is >= glyph_count
    min_byte: int
    max_byte: int

    @property
    def in_range_fraction(self) -> float:
        total = self.in_range + self.out_of_range
        return self.in_range / total if total else 0.0


def walldef_index_validity(walldef_body: bytes, glyph_count: int) -> IndexValidity:
    """How many of `walldef_body`'s bytes would be valid glyph indices into a WALLSET bank of
    `glyph_count` glyphs, if WALLDEF were literally an array of glyph-index bytes (the simplest
    possible reading of "routing data referencing a glyph bank", by analogy with the DOS
    WALLDEF->8X8D tile-id split). This is a STRUCTURAL test, not a decode -- it does not attempt
    to interpret WALLDEF as anything beyond a flat byte array of candidate indices.
    """
    if not walldef_body:
        return IndexValidity(glyph_count, 0, 0, 0, 0, 0)
    in_range = sum(1 for b in walldef_body if b < glyph_count)
    out_of_range = len(walldef_body) - in_range
    return IndexValidity(
        glyph_count, len(walldef_body), in_range, out_of_range,
        min(walldef_body), max(walldef_body),
    )


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------


def _find_wall_body(title_dir: Path, prefix: str, id_str: str) -> bytes | None:
    for f in wallset.iter_wall_files(title_dir, prefix):
        if f.suffix.upper() == id_str.upper() and not f.problem:
            return f.body
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--render", type=Path, metavar="TITLE_DIR",
                     help="render WALLSET{--id} from this title's disk set, both modes")
    ap.add_argument("--compare-dos", nargs=2, type=Path, metavar=("TITLE_DIR", "DOS_DIR"),
                     help="render WALLSET{--id} (both modes) plus the same-id DOS 8X8D tile strip")
    ap.add_argument("--id", help="hex id suffix, e.g. 17 or 0B")
    ap.add_argument("--outdir", type=Path, default=Path("renders/c64_wallset"))
    ap.add_argument("--id-crosscheck", type=Path, metavar="DOS_DIR",
                     help="report WALLDEF-id vs 8X8D-low-id overlap for one title's DOS folder")
    ap.add_argument("--mode-verdict", type=Path, metavar="C64_ROOT",
                     help="corpus-wide hires-vs-multicolor vertical-continuity tally "
                          "(the directory containing all titles' subfolders)")
    ap.add_argument("--walldef-index-check", type=Path, metavar="TITLE_DIR",
                     help="print WALLDEF-body-vs-partner-WALLSET-glyph-count index validity "
                          "for every paired id in one C64 title folder")
    args = ap.parse_args(argv)

    if args.render:
        if not args.id:
            print("--render needs --id", file=sys.stderr)
            return 2
        body = _find_wall_body(args.render, "WALLSET", args.id)
        if body is None:
            print(f"WALLSET{args.id} not found under {args.render}", file=sys.stderr)
            return 1
        args.outdir.mkdir(parents=True, exist_ok=True)
        for mode in ("hires", "multicolor"):
            sheet = render_sheet(body, mode)
            out = args.outdir / f"WALLSET{args.id}_{mode}.png"
            write_png(out, sheet.width, sheet.height, sheet.rgb)
            print(f"{mode}: {sheet.glyph_count} glyphs -> {out} ({sheet.width}x{sheet.height})")
        return 0

    if args.compare_dos:
        title_dir, dos_dir = args.compare_dos
        if not args.id:
            print("--compare-dos needs --id", file=sys.stderr)
            return 2
        body = _find_wall_body(title_dir, "WALLSET", args.id)
        if body is None:
            print(f"WALLSET{args.id} not found under {title_dir}", file=sys.stderr)
            return 1
        args.outdir.mkdir(parents=True, exist_ok=True)
        for mode in ("hires", "multicolor"):
            sheet = render_sheet(body, mode)
            out = args.outdir / f"WALLSET{args.id}_{mode}.png"
            write_png(out, sheet.width, sheet.height, sheet.rgb)
            print(f"C64 {mode}: {sheet.glyph_count} glyphs -> {out}")
        bid = int(args.id, 16)
        strip = dos_8x8d_tile_strip(dos_dir, bid)
        if strip is None:
            print(f"no DOS 8X8D block with id {bid} (0x{bid:02X}) under {dos_dir}")
        else:
            out = args.outdir / f"DOS_8X8D_id{bid}.png"
            write_png(out, strip.width, strip.height, strip.rgb)
            print(f"DOS {strip.source_file}#{strip.block_id} -> {out} "
                  f"({strip.width}x{strip.height})")
            grid = reshape_strip_to_grid(strip.width, strip.height, strip.rgb)
            if grid.glyph_count:
                out_grid = args.outdir / f"DOS_8X8D_id{bid}_grid.png"
                write_png(out_grid, grid.width, grid.height, grid.rgb)
                print(f"DOS {strip.source_file}#{strip.block_id} grid ({grid.glyph_count} "
                      f"8x8 tiles) -> {out_grid}")
        return 0

    if args.id_crosscheck:
        wd = dos_walldef_ids(args.id_crosscheck)
        low = dos_8x8d_low_ids(args.id_crosscheck)
        print(f"WALLDEF*.DAX ids:     {sorted(wd)}")
        print(f"8X8D*.DAX low ids:    {sorted(low)}")
        print(f"overlap:              {sorted(wd & low)}  ({len(wd & low)}/{len(wd)} of WALLDEF ids)")
        return 0

    if args.mode_verdict:
        v = corpus_mode_verdict(args.mode_verdict)
        print(f"total files={v.total_files}  multicolor_wins={v.multicolor_wins}  "
              f"hires_wins={v.hires_wins}  multicolor_fraction={v.multicolor_fraction:.1%}")
        return 0

    if args.walldef_index_check:
        title_dir = args.walldef_index_check
        inv = wallset.inventory(title_dir)
        wallsets = {f.suffix: f for f in inv["WALLSET"] if not f.problem}
        walldefs = {f.suffix: f for f in inv["WALLDEF"] if not f.problem}
        for sid in sorted(set(wallsets) & set(walldefs)):
            ws, wd = wallsets[sid], walldefs[sid]
            gc = wallset.parse_wallset(ws.body).count
            v = walldef_index_validity(wd.body, gc)
            print(f"id {sid}: glyphs={gc:4} walldef_len={v.body_len:5} "
                  f"in_range={v.in_range_fraction:.2%} min={v.min_byte} max={v.max_byte}")
        return 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
