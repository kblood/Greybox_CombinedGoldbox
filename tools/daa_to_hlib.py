#!/usr/bin/env python3
"""
daa_to_hlib.py - REBUILD-PIPELINE art converter: Amiga .DAA  ->  DQK HLIB .TLB.

Realizes the project's core idea ("best Amiga artwork on the newest DQK/HLIB/VGA
engine"; CLAUDE.md roadmap step 5: "Convert Amiga art -> DQK HLIB TILE
(planar->chunky; Amiga 32-color -> VGA 256-color palette -- the lossless
direction)").

PIPELINE
  INPUT  : an Amiga .DAA member, decoded by tools/daa_decode.py.  daa_decode
           already does the planar->chunky work: a standard frame yields an 8bpp
           index buffer (indices 0..31) + a 32-entry Amiga palette; an 8X8D CoK
           tile strip yields indices 0..15 against the shared EGA palette.
  OUTPUT : a valid DQK HLIB "TILE" leaf container (tools/hlib_encode.py), 8bpp
           VGA chunky pixels (Chain-4 interleaved) + an embedded 8-bit RGB
           VGA colour table.

THE PALETTE REMAP (lossless, 32 <= 256)
  The Amiga frame carries <=32 distinct colours; VGA has 256 slots.  We keep the
  pixel INDICES BIT-IDENTICAL and place each Amiga colour at the SAME index in
  the VGA colour table.  daa_decode already returns Amiga 4-bit channels scaled
  to 8-bit (channel*17), and the HLIB colour table stores FULL 8-bit RGB (verified
  in hlib_decode.py:read_palette -- "FULL 8-bit, *not* 6-bit DAC").  So the stored
  RGB == the rendered Amiga RGB exactly, with no index churn.  Re-decoding the
  produced HLIB and looking each index up through the embedded palette reproduces
  the original Amiga RGB image byte-for-byte.

  (The task brief mentions "6-bit-per-channel DAC".  The HLIB *colour table* on
   disk is 8-bit per channel -- the 6-bit DAC is only the VGA hardware register
   width the game down-shifts to at load time.  Storing 8-bit here is what the
   real DQK files do and is the lossless choice; see hlib_decode.py.)

CHAIN-4 WIDTH
  HLIB pixels are Chain-4 interleaved, so width must be a multiple of 4.  Amiga
  frame width = width_div8*8 and 8X8D strip width = tile_count*8 are both
  multiples of 8, hence always valid.

WHAT CONVERTS / WHAT DOES NOT
  - Standard 5-plane frames (BIGPIC*, CPIC*, BACK*, BORDER, DUNGCOM, ...): yes.
  - CoK 8X8D tile strips (h=8,w8=1 + count byte, 4-plane EGA): yes (EGA palette
    embedded into the VGA table so the output is self-contained).
  - 6-byte sub-frame index files (SPRIT*, PIC*, larger HEAD*): NOT convertible --
    daa_decode lists them but the inner sub-frame pixel encoding is unsolved.
    These are reported and skipped.

Usage:
  daa_to_hlib.py FILE.DAA [--block ID] [--out OUT.TLB] [--method 16|18]
  Default: convert every renderable block into ONE HLIB master? -- no: HLIB
  TILE is a single leaf of images, so we pack all convertible blocks of the file
  as images in one TILE leaf, sharing the colour table of the FIRST block that
  carries a palette (Amiga blocks within a file generally share one palette).
"""
from __future__ import annotations
import argparse
import struct
import sys
from pathlib import Path

# Import the verified DAA decoder + HLIB encoder as libraries.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import daa_decode as daa
import hlib_encode as he


# --------------------------------------------------------------------------- #
# Decode one .DAA file into a list of convertible frames.
# --------------------------------------------------------------------------- #
class Frame:
    __slots__ = ("block_id", "width", "height", "indices", "palette", "src")

    def __init__(self, block_id, width, height, indices, palette, src):
        self.block_id = block_id
        self.width = width
        self.height = height
        self.indices = indices      # list[int] length width*height, values 0..255
        self.palette = palette      # list[(r,g,b)] (Amiga colours, 8-bit channels)
        self.src = src              # "frame" or "8x8d"


def decode_daa_frames(data: bytes):
    """Return (frames, skipped) where frames is a list[Frame] and skipped is a
    list of (block_id, reason) for blocks that cannot convert."""
    kind, data_base, items = daa.parse_container(data)
    frames = []
    skipped = []
    if kind == "index":
        for bid, off in items:
            skipped.append((bid, "6-byte sub-frame index (inner encoding unsolved)"))
        return frames, skipped

    for blk in items:
        try:
            raw = daa.decompress_block(data, data_base, blk)
        except Exception as e:
            skipped.append((blk.block_id, f"decompress failed: {e}"))
            continue

        # CoK 8X8D tile strip?
        thdr = daa.parse_8x8d_header(raw)
        if thdr:
            tile_count, n_planes, row_bytes, plane_size = thdr
            width = tile_count * 8
            height = 8
            indices = [0] * (width * height)
            for t in range(tile_count):
                tile = daa.decode_8x8d_tile(raw, tile_count, row_bytes, plane_size, t)
                for y in range(8):
                    for x in range(8):
                        indices[y * width + t * 8 + x] = tile[y][x]
            # 8X8D has no embedded palette: use the shared EGA palette (16 entries).
            pal = list(daa.EGA_PALETTE)
            frames.append(Frame(blk.block_id, width, height, indices, pal, "8x8d"))
            continue

        # Standard 5-plane frame?
        fr = daa.parse_frame_header(raw)
        if fr:
            width, height, pal, pix_off = fr
            indices = decode_planar_indices(raw, width, height, pix_off)
            frames.append(Frame(blk.block_id, width, height, indices, pal, "frame"))
            continue

        h0, w0 = (struct.unpack_from(">HH", raw, 0) if len(raw) >= 4 else (0, 0))
        skipped.append((blk.block_id, f"unrecognized block (hdr {h0},{w0})"))

    return frames, skipped


def decode_planar_indices(raw: bytes, width: int, height: int, pix_off: int):
    """Like daa.planar_frame_to_rgb but returns palette INDICES (0..31) instead
    of RGB -- the chunky index buffer we feed straight into HLIB."""
    row_bytes = ((width + 15) // 16) * 2
    plane_size = row_bytes * height
    pix = raw[pix_off:]
    out = [0] * (width * height)
    o = 0
    for y in range(height):
        rbase = y * row_bytes
        for x in range(width):
            byte_i = rbase + (x >> 3)
            bit = 7 - (x & 7)
            idx = 0
            for p in range(daa.NUM_PLANES):
                b = pix[p * plane_size + byte_i]
                idx |= ((b >> bit) & 1) << p
            out[o] = idx
            o += 1
    return out


# --------------------------------------------------------------------------- #
# Build VGA palette: place Amiga colours at identical indices (lossless).
# --------------------------------------------------------------------------- #
def build_vga_palette(amiga_pal):
    """Return a 256-entry VGA palette (list[(r,g,b)]) with the Amiga colours at
    the SAME indices, remaining slots black.  Indices are preserved bit-exactly,
    so the conversion is lossless."""
    vga = [(0, 0, 0)] * 256
    for i, c in enumerate(amiga_pal):
        if i < 256:
            vga[i] = c
    return vga


# --------------------------------------------------------------------------- #
# Convert frames -> HLIB TILE container.
# --------------------------------------------------------------------------- #
def frames_to_hlib(frames, method: int = 16):
    """Pack a list[Frame] into one HLIB TILE leaf (magic=0): region[0] = colour
    table, region[1..] = images.

    An HLIB TILE leaf carries exactly ONE colour table, so EVERY frame packed
    together MUST share an identical palette (else the shared table would
    mis-colour the others -- the indices are correct but the lookup is wrong).
    This raises if the frames disagree; use group_by_palette() to split a file
    whose blocks carry distinct palettes (BIGPIC* does -- each scene block has
    its own 32-colour table)."""
    if not frames:
        raise ValueError("no convertible frames")
    base = frames[0].palette
    for f in frames[1:]:
        if f.palette != base:
            raise ValueError(
                f"frames have differing palettes (block {f.block_id} vs "
                f"{frames[0].block_id}); split with group_by_palette()")

    pal = build_vga_palette(base)
    ncolors = len(base)
    pal_region = he.build_palette_region(pal, first_col=0, ncolors=ncolors)

    regions = [pal_region]
    for f in frames:
        if method == 18:
            img = he.encode_image_18(f.indices, f.width, f.height)
        else:
            img = he.encode_image_16(f.indices, f.width, f.height)
        regions.append(img)

    return he.build_container(magic=0, tag=b"TILE", regions=regions)


def group_by_palette(frames):
    """Split frames into ordered groups, each sharing one identical palette.
    Returns list[list[Frame]] preserving first-seen order.  Each group becomes
    one HLIB TILE container."""
    groups = []
    keys = []
    for f in frames:
        key = tuple(f.palette)
        if key in keys:
            groups[keys.index(key)].append(f)
        else:
            keys.append(key)
            groups.append([f])
    return groups


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(
        description="Convert Amiga .DAA art into a DQK HLIB .TLB (lossless palette remap)")
    ap.add_argument("file", type=Path, help="input .DAA file")
    ap.add_argument("--block", type=int, default=None,
                    help="only convert this block id (default: all renderable)")
    ap.add_argument("--method", type=int, default=16, choices=(16, 18),
                    help="HLIB image method: 16 uncompressed (default) or 18 RLE")
    ap.add_argument("--out", type=Path, default=None,
                    help="output .TLB path (keep OUTSIDE the repo -- derived art)")
    ap.add_argument("--list", action="store_true", help="list convertible blocks only")
    args = ap.parse_args()

    data = args.file.read_bytes()
    frames, skipped = decode_daa_frames(data)
    if args.block is not None:
        frames = [f for f in frames if f.block_id == args.block]

    print(f"{args.file}: {len(frames)} convertible frame(s), {len(skipped)} skipped")
    for f in frames:
        print(f"  block {f.block_id:<4} {f.src:<5} {f.width}x{f.height} "
              f"palette={len(f.palette)} maxidx={max(f.indices)}")
    for bid, reason in skipped:
        print(f"  block {bid:<4} SKIP: {reason}")

    if args.list:
        return
    if not frames:
        print("  nothing to convert", file=sys.stderr)
        sys.exit(1)

    groups = group_by_palette(frames)
    base_out = args.out or args.file.with_suffix(".TLB")
    if len(groups) == 1:
        out = frames_to_hlib(groups[0], method=args.method)
        Path(base_out).write_bytes(out)
        print(f"  -> wrote HLIB TILE: {base_out} ({len(out)} bytes, "
              f"{len(groups[0])} image(s))")
    else:
        # Distinct palettes -> one TILE container per palette group.
        print(f"  {len(groups)} distinct palette group(s) -> one .TLB each")
        for gi, grp in enumerate(groups):
            out = frames_to_hlib(grp, method=args.method)
            p = Path(base_out)
            gp = p.with_name(f"{p.stem}_pal{gi:02d}{p.suffix}")
            gp.write_bytes(out)
            ids = ",".join(str(f.block_id) for f in grp)
            print(f"  -> {gp} ({len(out)} bytes, blocks {ids})")


if __name__ == "__main__":
    main()
