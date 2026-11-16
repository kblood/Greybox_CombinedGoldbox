#!/usr/bin/env python3
"""
solve_8x8d_planes.py

Solve the Amiga 8X8D tile plane order by exhaustive enumeration against the
DOS oracle (block 202 of 8X8D1.DAX). Writes a montage PNG of the winning decode.

Usage:
    python tools/solve_8x8d_planes.py [--render]
"""
from __future__ import annotations
import struct, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from daa_decode import rle_decode, parse_container
from dax_decode import rle_decode as rle_dos

# ---------------------------------------------------------------------------
# DOS oracle: extract block 202 tiles from 8X8D1.DAX
# ---------------------------------------------------------------------------
def load_dos_tiles():
    dos_file = Path("Champions of Krynn/8X8D1.DAX")
    dos_data = dos_file.read_bytes()
    toc_bytes = struct.unpack_from("<H", dos_data, 0)[0]
    data_base = 2 + toc_bytes
    for i in range(toc_bytes // 9):
        off = 2 + i * 9
        bid = dos_data[off]
        d_off, raw_sz, comp_sz = struct.unpack_from("<IHH", dos_data, off + 1)
        if bid == 202:
            raw = rle_dos(dos_data[data_base + d_off : data_base + d_off + comp_sz], raw_sz)
            return raw
    raise RuntimeError("DOS block 202 not found")

def extract_dos_tile(pix_data: bytes, t: int):
    """Extract DOS tile t (0-based) from the chunky 4bpp tile-strip pixel data."""
    pair_row = t // 2
    tile_col = t % 2
    tile = []
    for y in range(8):
        row = []
        for x in range(8):
            x_strip = tile_col * 8 + x
            bo = pair_row * 64 + y * 8 + x_strip // 2
            bv = pix_data[bo] if bo < len(pix_data) else 0
            row.append((bv >> 4) & 0xF if x_strip % 2 == 0 else bv & 0xF)
        tile.append(row)
    return tile

def get_dos_shapes():
    raw_dos = load_dos_tiles()
    pix = raw_dos[8:]   # skip 8-byte header
    shapes = {}
    for t in range(38):
        tile = extract_dos_tile(pix, t)
        shapes[t] = frozenset((y, x) for y in range(8) for x in range(8) if tile[y][x] != 0)
    return shapes

# ---------------------------------------------------------------------------
# Amiga tile loading
# ---------------------------------------------------------------------------
def load_amiga_tiles():
    afile = Path("amiga_extracted/ChampionsOfKrynn/disk2/8X8D1.DAA")
    data = afile.read_bytes()
    kind, data_base, blocks = parse_container(data)
    for blk in blocks:
        if blk.block_id == 202:
            start = data_base + blk.data_offset
            raw = rle_decode(data[start : start + blk.comp_size], blk.raw_size)
            count = raw[8]
            raw_tiles = raw[9:]   # 38*32 = 1216 bytes
            return raw_tiles, count
    raise RuntimeError("Amiga block 202 not found")

# ---------------------------------------------------------------------------
# Decode candidates
# ---------------------------------------------------------------------------
def decode_individual_planar_contiguous(raw_tiles: bytes, tile_idx: int,
                                         bit_order: str, plane_sig: str):
    """
    Each tile = 32 bytes = 4 planes * 8 rows * 1 byte/row (no word-align).
    Plane-contiguous: bytes 0-7 = plane0, 8-15 = plane1, 16-23 = plane2, 24-31 = plane3.
    """
    tb = raw_tiles[tile_idx * 32 : tile_idx * 32 + 32]
    pixels = []
    for y in range(8):
        row = []
        for x in range(8):
            bit = (7 - x) if bit_order == "msb" else x
            idx = 0
            for p in range(4):
                b = tb[p * 8 + y]
                bv = (b >> bit) & 1
                if plane_sig == "lsb_first":
                    idx |= bv << p
                else:
                    idx |= bv << (3 - p)
            row.append(idx)
        pixels.append(row)
    return pixels


def decode_individual_row_interleaved(raw_tiles: bytes, tile_idx: int,
                                       bit_order: str, plane_sig: str):
    """
    Each tile = 32 bytes = 8 rows * 4 bytes/row (4 planes interleaved).
    Row y: bytes [y*4, y*4+1, y*4+2, y*4+3] = planes 0,1,2,3 (or reversed by plane_sig).
    """
    tb = raw_tiles[tile_idx * 32 : tile_idx * 32 + 32]
    pixels = []
    for y in range(8):
        row = []
        for x in range(8):
            bit = (7 - x) if bit_order == "msb" else x
            idx = 0
            for p in range(4):
                b = tb[y * 4 + p]
                bv = (b >> bit) & 1
                if plane_sig == "lsb_first":
                    idx |= bv << p
                else:
                    idx |= bv << (3 - p)
            row.append(idx)
        pixels.append(row)
    return pixels


def decode_pair_contiguous(raw_tiles: bytes, tile_idx: int,
                             bit_order: str, plane_sig: str):
    """
    Tiles stored as 19 pairs (pair = two tiles side by side = 16px wide).
    Each pair = 64 bytes = 4 planes * 8 rows * 2 bytes/row (word-aligned).
    Plane-contiguous within pair.
    """
    pair = tile_idx // 2
    c = tile_idx % 2      # 0=left tile, 1=right tile
    pb = raw_tiles[pair * 64 : pair * 64 + 64]
    pixels = []
    for y in range(8):
        row = []
        for x in range(8):
            x_strip = c * 8 + x
            bit = (7 - (x_strip & 7)) if bit_order == "msb" else (x_strip & 7)
            byte_in_row = x_strip >> 3
            idx = 0
            for p in range(4):
                b = pb[p * 16 + y * 2 + byte_in_row]
                bv = (b >> bit) & 1
                if plane_sig == "lsb_first":
                    idx |= bv << p
                else:
                    idx |= bv << (3 - p)
            row.append(idx)
        pixels.append(row)
    return pixels


def decode_pair_row_interleaved(raw_tiles: bytes, tile_idx: int,
                                  bit_order: str, plane_sig: str):
    """
    Tiles stored as 19 pairs (16px wide), row-interleaved within pair.
    Each pair = 64 bytes = 8 rows * 4 planes * 2 bytes/row.
    """
    pair = tile_idx // 2
    c = tile_idx % 2
    pb = raw_tiles[pair * 64 : pair * 64 + 64]
    pixels = []
    for y in range(8):
        row = []
        for x in range(8):
            x_strip = c * 8 + x
            bit = (7 - (x_strip & 7)) if bit_order == "msb" else (x_strip & 7)
            byte_in_row = x_strip >> 3
            idx = 0
            for p in range(4):
                b = pb[y * 8 + p * 2 + byte_in_row]
                bv = (b >> bit) & 1
                if plane_sig == "lsb_first":
                    idx |= bv << p
                else:
                    idx |= bv << (3 - p)
            row.append(idx)
        pixels.append(row)
    return pixels


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def score(raw_tiles: bytes, decode_fn, bit_order: str, plane_sig: str, dos_shapes: dict):
    total_iou = 0.0
    total_xor = 0
    per_tile = {}
    for t in range(20, 38):
        pix = decode_fn(raw_tiles, t, bit_order, plane_sig)
        amiga_set = frozenset((y, x) for y in range(8) for x in range(8) if pix[y][x] != 0)
        dos_set = dos_shapes[t]
        intersection = len(amiga_set & dos_set)
        union = len(amiga_set | dos_set)
        iou = intersection / max(union, 1)
        xor = len(amiga_set ^ dos_set)
        total_iou += iou
        total_xor += xor
        per_tile[t] = (iou, xor, len(amiga_set), len(dos_set))
    return total_iou / 18, total_xor, per_tile


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", action="store_true", help="Write PNG montages")
    args = ap.parse_args()

    print("Loading DOS oracle (8X8D1.DAX block 202)...")
    dos_shapes = get_dos_shapes()
    print(f"  Tiles 20-37 set-pixel counts: " +
          " ".join(f"t{t}={len(dos_shapes[t])}" for t in range(20, 38)))

    print("\nLoading Amiga tiles (8X8D1.DAA block 202)...")
    raw_tiles, count = load_amiga_tiles()
    print(f"  count={count}, raw_tile_bytes={len(raw_tiles)}")
    print(f"  Bytes per tile: {len(raw_tiles) // count} (32 -> individual 4p x 8r x 1b; or 64 -> pair)")

    decode_fns = [
        (decode_individual_planar_contiguous, "indiv_planar_contiguous"),
        (decode_individual_row_interleaved,   "indiv_row_interleaved"),
        (decode_pair_contiguous,              "pair_planar_contiguous"),
        (decode_pair_row_interleaved,         "pair_row_interleaved"),
    ]

    candidates = []
    for fn, layout in decode_fns:
        for bit_order in ["msb", "lsb"]:
            for plane_sig in ["lsb_first", "msb_first"]:
                name = f"{layout}_{bit_order}_{plane_sig}"
                avg_iou, total_xor, per_tile = score(raw_tiles, fn, bit_order, plane_sig, dos_shapes)
                candidates.append((avg_iou, total_xor, name, fn, bit_order, plane_sig, per_tile))

    candidates.sort(key=lambda x: (-x[0], x[1]))

    print("\n=== Candidate ranking by avg IoU (tiles 20-37 vs DOS oracle) ===")
    print(f"{'Rank':4} {'avg_IoU':8} {'total_XOR':10} {'candidate'}")
    for i, (iou, xor, name, *_) in enumerate(candidates):
        marker = " <-- BEST" if i == 0 else ""
        print(f"  {i+1:2d}   {iou:.4f}   {xor:7d}     {name}{marker}")

    print()
    best_iou, best_xor, best_name, best_fn, best_bo, best_ps, best_per = candidates[0]
    print(f"=== BEST CANDIDATE: {best_name} ===")
    print(f"avg_IoU = {best_iou:.4f}, total_XOR_diff = {best_xor}")
    print()
    print(f"{'tile':4} {'IoU':6} {'XOR':5} {'amiga_set':9} {'dos_set':7}")
    for t in range(20, 38):
        iou, xor, acnt, dcnt = best_per[t]
        print(f"  t{t:2d}  {iou:.4f}  {xor:4d}   {acnt:4d}       {dcnt:4d}")

    # Print pixel grids for key tiles under best candidate
    print()
    print("=== Key tile pixel grids (best candidate) ===")
    for t in [20, 24, 26, 29, 30, 33, 34, 37]:
        pix = best_fn(raw_tiles, t, best_bo, best_ps)
        dos_pix_raw = load_dos_tiles()
        dos_pix = dos_pix_raw[8:]
        dos_t = extract_dos_tile(dos_pix, t)
        print(f"Tile {t}: Amiga (left) vs DOS (right)")
        for y in range(8):
            a = "".join(f"{v:x}" for v in pix[y])
            d = "".join(f"{v:x}" for v in dos_t[y])
            amatch = "".join("." if pix[y][x] != 0 else " " for x in range(8))
            dmatch = "".join("." if dos_t[y][x] != 0 else " " for x in range(8))
            print(f"  {a} [{amatch}]    {d} [{dmatch}]")
        print()

    # Check second-best to see gap
    if len(candidates) > 1:
        print(f"Second-best: {candidates[1][2]} avg_IoU={candidates[1][0]:.4f}")
        print(f"IoU gap: {best_iou - candidates[1][0]:.4f}")

    if args.render:
        _render_tiles(raw_tiles, best_fn, best_bo, best_ps, best_name)

    return best_name, best_iou, best_xor


def _render_tiles(raw_tiles, decode_fn, bit_order, plane_sig, name):
    """Render a montage of tiles 20-37 as a PNG (indexed, false-color)."""
    # Simple 16-color false palette for visualization
    FALSE_PAL = [
        (0,0,0),(0,0,170),(0,170,0),(0,170,170),
        (170,0,0),(170,0,170),(170,85,0),(170,170,170),
        (85,85,85),(85,85,255),(85,255,85),(85,255,255),
        (255,85,85),(255,85,255),(255,255,85),(255,255,255),
    ]
    SCALE = 8
    TILES_PER_ROW = 6
    ntiles = 18  # tiles 20-37
    nrows = (ntiles + TILES_PER_ROW - 1) // TILES_PER_ROW
    img_w = TILES_PER_ROW * 8 * SCALE
    img_h = nrows * 8 * SCALE

    try:
        from PIL import Image
        img = Image.new("RGB", (img_w, img_h), (0, 0, 0))
        for i, t in enumerate(range(20, 38)):
            pix = decode_fn(raw_tiles, t, bit_order, plane_sig)
            col = i % TILES_PER_ROW
            row = i // TILES_PER_ROW
            for y in range(8):
                for x in range(8):
                    idx = pix[y][x] & 0xF
                    r, g, b = FALSE_PAL[idx]
                    for sy in range(SCALE):
                        for sx in range(SCALE):
                            px = col * 8 * SCALE + x * SCALE + sx
                            py = row * 8 * SCALE + y * SCALE + sy
                            img.putpixel((px, py), (r, g, b))
        out_dir = Path("renders/daa/8X8D1_solved")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"frame_tiles_{name[:40]}.png"
        img.save(out_path)
        print(f"\nMontage written to {out_path}")
    except ImportError:
        print("\nPillow not available; skipping PNG render (install Pillow to render)")


if __name__ == "__main__":
    main()
