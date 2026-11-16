#!/usr/bin/env python3
"""
daa_decode.py - Decoder/renderer for SSI Gold Box AMIGA .DAA graphics files
                (Champions of Krynn / Death Knights of Krynn, 32-color).

The Amiga .DAA format is the big-endian, bitplanar, palette-carrying cousin of
the DOS .DAX format (see docs/dax-format.md and tools/dax_decode.py). Verified
empirically against the bytes and cross-checked against the DOS .DAX renders of
the same-named files (BIGPIC1, 8X8D, BACK1, CPIC1...) and against the game's own
IFF ILBM title screens (which carry the same 32-color palette).

CONTAINER (BIG-ENDIAN)
  offset 0 : uint16  word0  ==  2 + entry_count * 9   (== data section base)
  offset 2 : TOC, `entry_count` entries of 9 bytes each (big-endian):
               uint8  block_id     (sparse id; NOT a sequential index)
               uint32 data_offset  (relative to the data section base = word0)
               uint16 raw_size     (decompressed size in bytes)
               uint16 comp_size    (compressed size in bytes)
  data section base = word0.  Each block's compressed bytes =
  data[base+data_offset : +comp_size].  data_offsets chain perfectly and the
  last block ends exactly at end-of-file.

  Some files (SPRIT*, CoK pic1/pic2, DoK PIC1/PIC2) instead use a 6-byte
  sub-frame INDEX (word0 == 2 + n*6; entries {u8 id, u8 0, u32 offset}; no
  sizes - each sub-frame's length is next.offset - this.offset). These are
  detected and listed here; the inner pixel codec is SOLVED -- decode them with
  tools/subframe_decode.py (docs/engine/research/subframe-format.md #3).
  NOTE the routing order: the 9-byte TOC is tried FIRST (accepted only when
  every data_offset chains to EOF). comspr/COMSPR, CPIC* and HEAD* have word0
  divisible by both 9 and 6 but are ordinary 9-byte block containers -- they
  render here via the standard-frame path (verified against the DOS DAX
  renders of the same block ids, e.g. HEAD1.DAA 68/69 == DOS HEAD2.DAX 68/69).

RLE  (identical to DAX: signed-byte run length; byte-order independent)
  read control byte c:
    c <  0x80 : copy next (c + 1) bytes literally
    c >= 0x80 : repeat the next single byte (256 - c) times
  Produces exactly raw_size bytes.

IMAGE FRAME (big-endian header + embedded palette + PLANAR pixels)
  uint16 height
  uint16 width_div8     (image width in pixels = width_div8 * 8)
  uint16 y_offset       (usually 0)
  uint16 x_offset       (usually 0)
  uint8  pad            (1 byte, observed 0x01)
  32 x uint16  palette  (big-endian 0x0RGB 12-bit Amiga words; channel*17 -> 8bpp)
  pixel row stride is word-aligned: row_bytes = ceil(width/16)*2
  then the pixel data as 5 CONTIGUOUS (non-interleaved) BITPLANES (32 colors):
     plane 0 covers the whole image (width/8 * height bytes, MSB = leftmost px),
     then plane 1, ... then plane 4. The 5 plane bits of a pixel (LSB = plane 0)
     form a 0..31 index into the palette.
  (This is NOT the ILBM per-row interleave; it is plane-contiguous. Verified by
   rendering BIGPIC1 as a coherent CoK scene.)

8X8D TILE BLOCKS (CoK only -- SOLVED, see docs/engine/research/amiga-8x8d-planeorder.md)
  uint16 height       (=8, big-endian)
  uint16 width_div8   (=1, big-endian -- treat as IGNORED for this format)
  uint16 y_offset     (=0)
  uint16 x_offset     (=0)
  uint8  tile_count   N (e.g. 38 for block 202, 45/46 for block 203, 70 for wall blocks)
  then: 4-plane contiguous bitplane strip, width = N*8 pixels, height = 8 pixels
     row_bytes = ceil(N*8/16)*2   (word-aligned, 1 byte per 8px tile column)
     plane_size = row_bytes * 8
     pixel data = 4 * plane_size bytes (4 planes for 16 colors)
     tile t occupies byte-column t within each plane row:
       pixel(t, x, y) index = sum_over_p( bit(plane[p], row=y, byte=t, bit=7-x) << p )
  Palette: NO embedded palette. Uses the shared EGA-compatible dungeon palette
  loaded from DUNGCOM.DAA / BORDER.DAA (first 16 colors = standard IBM EGA).

  Note: DoK 8x8d1.daa uses a DIFFERENT format -- standard 5-plane frames with
  embedded palette, width = tile_count*8 pixels (same count-byte convention but
  stored as a full 73-byte header + 5-plane pixel data block).

IFF ILBM (.LBM) reader is included (--lbm) as the palette/pipeline oracle.
"""
from __future__ import annotations
import argparse, struct, sys
from pathlib import Path

ENTRY_SIZE = 9
NUM_PLANES = 5
PAL_COLORS = 32
PAL_BYTES = PAL_COLORS * 2
# header(8) + pad(1) + palette(64) = 73 bytes before planar pixel data
FRAME_PIX_OFFSET = 8 + 1 + PAL_BYTES

# Standard IBM EGA 16-color palette (shared dungeon/exploration palette,
# confirmed by DUNGCOM.DAA and BORDER.DAA which both embed these as colors 0-15
# of their 32-color Amiga palette). Used by 8X8D* tile blocks (4-plane, 16-color).
EGA_PALETTE = [
    (0x00, 0x00, 0x00),  # 0  black
    (0x00, 0x00, 0xAA),  # 1  dark blue
    (0x00, 0xAA, 0x00),  # 2  dark green
    (0x00, 0xAA, 0xAA),  # 3  cyan
    (0xAA, 0x00, 0x00),  # 4  dark red
    (0xAA, 0x00, 0xAA),  # 5  magenta
    (0xAA, 0x55, 0x00),  # 6  brown
    (0xAA, 0xAA, 0xAA),  # 7  light gray
    (0x55, 0x55, 0x55),  # 8  dark gray
    (0x55, 0x55, 0xFF),  # 9  light blue
    (0x55, 0xFF, 0x55),  # 10 light green
    (0x55, 0xFF, 0xFF),  # 11 bright cyan
    (0xFF, 0x55, 0x55),  # 12 light red
    (0xFF, 0x55, 0xFF),  # 13 bright magenta
    (0xFF, 0xFF, 0x55),  # 14 yellow
    (0xFF, 0xFF, 0xFF),  # 15 white
]


# --------------------------------------------------------------------------- #
# RLE (shared with DAX, byte-order independent)
# --------------------------------------------------------------------------- #
def rle_decode(buf: bytes, expected: int | None = None) -> bytes:
    out = bytearray()
    i = 0
    n = len(buf)
    while i < n:
        if expected is not None and len(out) >= expected:
            break
        c = buf[i]; i += 1
        if c < 0x80:
            cnt = c + 1
            out += buf[i:i + cnt]; i += cnt
        else:
            cnt = 256 - c
            if i < n:
                out += bytes([buf[i]]) * cnt
            i += 1
    return bytes(out)


# --------------------------------------------------------------------------- #
# Container
# --------------------------------------------------------------------------- #
class Block:
    __slots__ = ("index", "block_id", "data_offset", "raw_size", "comp_size", "raw")

    def __init__(self, index, block_id, data_offset, raw_size, comp_size):
        self.index = index
        self.block_id = block_id
        self.data_offset = data_offset
        self.raw_size = raw_size
        self.comp_size = comp_size
        self.raw = None


def parse_container(data: bytes):
    """
    Return (kind, data_base, blocks). kind is "blocks" for the 9-byte TOC
    (renderable) or "index" for the 6-byte sub-frame index (listed only).
    Raises ValueError if not a DAA graphics container.
    """
    if len(data) < 11:
        raise ValueError("file too small")
    word0 = struct.unpack_from(">H", data, 0)[0]
    if word0 < 11 or word0 > len(data):
        raise ValueError(f"word0={word0} out of range; not a DAA container")
    body = word0 - 2
    data_base = word0

    # Try the 9-byte block TOC first and validate by chaining + EOF.
    if body % ENTRY_SIZE == 0:
        n = body // ENTRY_SIZE
        blocks = []
        ok = True
        expected_off = 0
        for i in range(n):
            off = 2 + i * ENTRY_SIZE
            bid = data[off]
            d_off, raw, comp = struct.unpack_from(">IHH", data, off + 1)
            if d_off != expected_off:
                ok = False; break
            blocks.append(Block(i, bid, d_off, raw, comp))
            expected_off = d_off + comp
        if ok and blocks:
            last_end = data_base + blocks[-1].data_offset + blocks[-1].comp_size
            # Allow a couple trailing pad bytes.
            if 0 <= len(data) - last_end <= 4:
                return "blocks", data_base, blocks

    # Otherwise treat as a 6-byte sub-frame index (SPRIT/PIC family): entries are
    # {u8 block_id, u8 zero_pad, u32 BE sub_offset}.
    #
    # This branch VALIDATES, which it did not until 2026-08-25. `body % 6 == 0` alone is a
    # rubber stamp: it accepted all nine Amiga Pool of Radiance resources -- a fourth, still
    # unsolved container format -- as sub-frame indices, with sub-offsets up to 4,245,164,308
    # inside a 270 KB file and 77 of 98 entries past EOF. The block branch above has always
    # validated by chaining on EOF; only this one did not, and a sniffer that cannot say no is
    # not a sniffer.
    #
    # Three independent checks, each perfect and two-sided on the whole Amiga corpus (14 genuine
    # index files vs the 9 Pool ones): the pad byte is zero 14/14 vs 0/9, offsets are
    # non-decreasing 14/14 vs 0/9, and every offset lands inside the file 14/14 vs 0/9. Note
    # which check is NOT used and why -- `sub_offset[0] == 0` holds for 9/9 of the Pool files
    # too, so a plausible-looking invariant can separate nothing at all.
    if body % 6 == 0:
        n = body // 6
        idx = []
        prev = -1
        for i in range(n):
            off = 2 + i * 6
            bid = data[off]
            if data[off + 1] != 0:
                raise ValueError(
                    f"6-byte index entry {i}: pad byte is {data[off + 1]}, not 0; "
                    "not a DAA sub-frame index"
                )
            sub_off = struct.unpack_from(">I", data, off + 2)[0]
            if sub_off < prev:
                raise ValueError(
                    f"6-byte index entry {i}: sub_offset {sub_off} goes backwards from {prev}"
                )
            if data_base + sub_off > len(data):
                raise ValueError(
                    f"6-byte index entry {i}: sub_offset {sub_off} lands past EOF {len(data)}"
                )
            prev = sub_off
            idx.append((bid, sub_off))
        return "index", data_base, idx

    raise ValueError(f"word0={word0} (body {body}) not a multiple of 9 or 6")


def decompress_block(data: bytes, data_base: int, blk: Block) -> bytes:
    start = data_base + blk.data_offset
    comp = data[start:start + blk.comp_size]
    raw = rle_decode(comp, blk.raw_size)
    blk.raw = raw
    return raw


# --------------------------------------------------------------------------- #
# 8X8D tile block detection and decode -- SOLVED
# --------------------------------------------------------------------------- #
def parse_8x8d_header(raw: bytes):
    """
    Detect and parse a CoK-style 8X8D tile block.
    Returns (tile_count, n_planes, row_bytes, plane_size) or None.

    The block header is {h=8, w8=1, y=0, x=0} (8 bytes, big-endian),
    followed by a 1-byte tile_count N, then 4-plane contiguous pixel data
    for a strip of width = N*8 pixels, height = 8 rows.

    Plane layout (SOLVED):
      - 4 planes, plane 0 = LSB of color index
      - Contiguous (not interleaved): plane p occupies bytes [p*plane_size : (p+1)*plane_size]
      - Within each plane, row y occupies bytes [y*row_bytes : +row_bytes]
      - Tile t occupies BYTE COLUMN t within each row (1 byte = 8 pixels, MSB = leftmost)
      - Pixel(tile=t, x, y) bit = (plane[p][y*row_bytes + t] >> (7-x)) & 1

    row_bytes = ceil(N*8/16)*2  (Amiga word-align; equals N for N tiles since N*8/8=N bytes)
    plane_size = row_bytes * 8

    No embedded palette. Palette source: shared EGA-compatible 16-color dungeon
    palette (EGA_PALETTE above), confirmed by DUNGCOM.DAA and BORDER.DAA.
    """
    if len(raw) < 9:
        return None
    h, w8 = struct.unpack_from(">HH", raw, 0)
    if h != 8 or w8 != 1:
        return None
    tile_count = raw[8]
    if tile_count == 0:
        return None
    # For 4 planes: row_bytes = ceil(tile_count*8/16)*2 = tile_count (since tile_count bytes)
    row_bytes = ((tile_count * 8 + 15) // 16) * 2
    plane_size = row_bytes * 8
    needed = 9 + 4 * plane_size
    if len(raw) < needed:
        return None
    return tile_count, 4, row_bytes, plane_size


def decode_8x8d_tile(raw: bytes, tile_count: int, row_bytes: int, plane_size: int, t: int):
    """
    Decode tile t (0-based) from a 4-plane contiguous CoK 8X8D strip.
    Returns list of 8 rows, each a list of 8 color indices (0-15).
    """
    pix = raw[9:]
    tile_pixels = []
    for y in range(8):
        row = []
        for x in range(8):
            bit = 7 - x
            idx = 0
            for p in range(4):
                b = pix[p * plane_size + y * row_bytes + t]
                idx |= ((b >> bit) & 1) << p
            row.append(idx)
        tile_pixels.append(row)
    return tile_pixels


def tiles_8x8d_to_rgb(raw: bytes, tile_count: int, row_bytes: int, plane_size: int,
                       pal=None):
    """
    Render all tiles in a CoK 8X8D block as a single wide RGB strip image.
    Returns (width, height, rgb_bytearray) where width = tile_count*8, height = 8.
    """
    if pal is None:
        pal = EGA_PALETTE
    width = tile_count * 8
    img = bytearray(width * 8 * 3)
    for t in range(tile_count):
        tile = decode_8x8d_tile(raw, tile_count, row_bytes, plane_size, t)
        for y in range(8):
            for x in range(8):
                idx = tile[y][x]
                r, g, b = pal[idx] if idx < len(pal) else (0, 0, 0)
                o = (y * width + t * 8 + x) * 3
                img[o] = r; img[o + 1] = g; img[o + 2] = b
    return width, 8, img


# --------------------------------------------------------------------------- #
# 24x24 *COM combat-backdrop strips (DUNGCOM / WILDCOM / RANDCOM) -- SOLVED
# --------------------------------------------------------------------------- #
COM_PX = 24
COM_TRAILER = 2   # bytes after the plane data in every shipped *COM block


def parse_com_strip_header(raw: bytes):
    """
    Detect and parse an Amiga 24x24 combat-backdrop block (DUNGCOM/WILDCOM/RANDCOM).
    Returns (item_count, row_bytes, plane_size) or None.

    SOLVED 2026-08-22. These blocks are laid out like the 8X8D strips above, not like a
    sequence of per-item frames: the N items form ONE virtual image N*24 px wide and 24 px
    tall, and item t is the pixel-column band [t*24, t*24+24) inside it. The row stride is
    word-aligned across the WHOLE strip -- row_bytes = ceil(N*24/16)*2 -- not per item.

    That is why every per-item stride sweep failed: assuming 5 planes x 3-byte rows = 360
    bytes/item leaves an unexplained residue that is 122 bytes for DUNGCOM/WILDCOM but 2 for
    RANDCOM. Under the strip rule the residue is a constant 2 trailing bytes for all four
    shipped blocks (N = 6, 25, 35, 45 across CoK and DoK).

    Layout:
      offset  0  8-byte big-endian frame header {height=24, width_div8=3, y, x}
                 (width_div8 describes ONE item, NOT the strip -- parse_frame_header
                  must not be used on these blocks)
      offset  8  item_count N
      offset  9  32-colour palette (64 bytes)
      offset 73  5 contiguous bitplanes, each row_bytes*24 bytes, plane 0 = LSB
      end        2 trailing bytes, purpose unknown

    Verified against the DOS .DAX oracle (17-byte header + N*288-byte chunky 4bpp items):
    for CoK and DoK DUNGCOM the decoded Amiga index map determines the DOS index map exactly
    (1 - H(DOS|Amiga)/H(DOS) = 1.0000 vs 0.19 for an item-permuted null); WILDCOM/RANDCOM
    score 0.918/0.898, the shortfall being Amiga detail EGA could not carry. A preamble sweep
    over 0..199 selects 73 uniquely (next best 0.1898).
    """
    if len(raw) < FRAME_PIX_OFFSET + 1:
        return None
    height, width_div8 = struct.unpack_from(">HH", raw, 0)
    if height != COM_PX or width_div8 * 8 != COM_PX:
        return None
    count = raw[8]
    if count == 0:
        return None
    row_bytes = ((count * COM_PX + 15) // 16) * 2
    plane_size = row_bytes * COM_PX
    if len(raw) - FRAME_PIX_OFFSET != NUM_PLANES * plane_size + COM_TRAILER:
        return None
    return count, row_bytes, plane_size


def decode_com_item(raw: bytes, row_bytes: int, plane_size: int, t: int):
    """Decode item t of a *COM strip. Returns 24 rows of 24 colour indices (0-31)."""
    out = []
    for y in range(COM_PX):
        row_base = y * row_bytes
        row = []
        for x in range(COM_PX):
            px = t * COM_PX + x
            b_i = row_base + (px >> 3)
            bit = 7 - (px & 7)
            idx = 0
            for p in range(NUM_PLANES):
                idx |= ((raw[FRAME_PIX_OFFSET + p * plane_size + b_i] >> bit) & 1) << p
            row.append(idx)
        out.append(row)
    return out


def com_strip_to_rgb(raw: bytes):
    """Render a whole *COM block as one wide RGB strip. Returns (width, height, rgb) or None."""
    parsed = parse_com_strip_header(raw)
    if parsed is None:
        return None
    count, row_bytes, plane_size = parsed
    pal = read_palette(raw, 9)
    width = count * COM_PX
    img = bytearray(width * COM_PX * 3)
    for t in range(count):
        item = decode_com_item(raw, row_bytes, plane_size, t)
        for y in range(COM_PX):
            for x in range(COM_PX):
                r, g, b = pal[item[y][x]]
                o = (y * width + t * COM_PX + x) * 3
                img[o] = r; img[o + 1] = g; img[o + 2] = b
    return width, COM_PX, img


# --------------------------------------------------------------------------- #
# Frame -> RGB
# --------------------------------------------------------------------------- #
def parse_frame_header(raw: bytes):
    """Return (width, height, palette[32], pix_offset) or None."""
    if len(raw) < FRAME_PIX_OFFSET:
        return None
    height, width_div8, y_off, x_off = struct.unpack_from(">HHHH", raw, 0)
    if width_div8 == 0 or height == 0 or width_div8 > 256 or height > 2048:
        return None
    width = width_div8 * 8
    row_bytes = ((width + 15) // 16) * 2     # Amiga rows are word (16-bit) aligned
    need = row_bytes * height * NUM_PLANES
    if len(raw) - FRAME_PIX_OFFSET < need:
        return None
    pal = read_palette(raw, 8 + 1)
    return width, height, pal, FRAME_PIX_OFFSET


def read_palette(raw: bytes, off: int):
    pal = []
    for c in range(PAL_COLORS):
        v = struct.unpack_from(">H", raw, off + c * 2)[0]
        r = ((v >> 8) & 0xF) * 17
        g = ((v >> 4) & 0xF) * 17
        b = (v & 0xF) * 17
        pal.append((r, g, b))
    return pal


def planar_frame_to_rgb(raw: bytes, width: int, height: int, pal, pix_off: int):
    """Decode 5 contiguous (non-interleaved) bitplanes to a flat RGB bytearray."""
    row_bytes = ((width + 15) // 16) * 2     # Amiga word-aligned row stride
    plane_size = row_bytes * height
    pix = raw[pix_off:]
    img = bytearray(width * height * 3)
    o = 0
    for y in range(height):
        rbase = y * row_bytes
        for x in range(width):
            byte_i = rbase + (x >> 3)
            bit = 7 - (x & 7)
            idx = 0
            for p in range(NUM_PLANES):
                b = pix[p * plane_size + byte_i]
                idx |= ((b >> bit) & 1) << p
            r, g, b = pal[idx]
            img[o] = r; img[o + 1] = g; img[o + 2] = b; o += 3
    return img


# --------------------------------------------------------------------------- #
# IFF ILBM reader (palette/pipeline oracle)
# --------------------------------------------------------------------------- #
def read_lbm(data: bytes):
    if data[:4] != b"FORM" or data[8:12] != b"ILBM":
        raise ValueError("not an IFF ILBM")
    off = 12
    bmhd = cmap = body = camg = None
    while off + 8 <= len(data):
        cid = data[off:off + 4]
        csz = struct.unpack_from(">I", data, off + 4)[0]
        payload = data[off + 8: off + 8 + csz]
        if cid == b"BMHD": bmhd = payload
        elif cid == b"CMAP": cmap = payload
        elif cid == b"BODY": body = payload
        elif cid == b"CAMG": camg = payload
        off += 8 + csz + (csz & 1)
    w, h, _, _, nplanes, mask, comp = struct.unpack_from(">HHhhBBB", bmhd, 0)
    pal = [tuple(cmap[i * 3:i * 3 + 3]) for i in range(len(cmap) // 3)]
    # ByteRun1 decompress (per scanline implied by total size; decode whole body)
    if comp == 1:
        raw = bytearray()
        i = 0
        while i < len(body):
            n = body[i]; i += 1
            if n < 128:
                cnt = n + 1; raw += body[i:i + cnt]; i += cnt
            elif n > 128:
                cnt = 257 - n; raw += bytes([body[i]]) * cnt; i += 1
            # n == 128 -> noop
        body = bytes(raw)
    row_bytes = (w + 15) // 16 * 2
    total_planes = nplanes + (1 if mask == 1 else 0)
    img = bytearray(w * h * 3)
    o = 0
    for y in range(h):
        rbase = y * row_bytes * total_planes
        for x in range(w):
            byte_i = x >> 3; bit = 7 - (x & 7); idx = 0
            for p in range(nplanes):
                b = body[rbase + p * row_bytes + byte_i]
                idx |= ((b >> bit) & 1) << p
            r, g, bb = pal[idx] if idx < len(pal) else (0, 0, 0)
            img[o] = r; img[o + 1] = g; img[o + 2] = bb; o += 3
    return w, h, img, pal


# --------------------------------------------------------------------------- #
# PNG output
# --------------------------------------------------------------------------- #
def write_png(path: Path, width: int, height: int, rgb: bytes, scale: int = 1):
    try:
        from PIL import Image
    except ImportError:
        _write_png_raw(path, width, height, rgb); return
    im = Image.frombytes("RGB", (width, height), bytes(rgb))
    if scale != 1:
        im = im.resize((width * scale, height * scale), Image.NEAREST)
    im.save(path)


def _write_png_raw(path: Path, width: int, height: int, rgb: bytes):
    import zlib
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgb[y * width * 3:(y + 1) * width * 3]
    def chunk(typ, payload):
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(sig + chunk(b"IHDR", ihdr)
                     + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
                     + chunk(b"IEND", b""))


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Decode/render SSI Gold Box Amiga .DAA graphics (and .LBM)")
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--list", action="store_true", help="list blocks only")
    ap.add_argument("--lbm", action="store_true", help="treat input as an IFF ILBM")
    args = ap.parse_args()

    data = args.file.read_bytes()
    out_dir = args.out or (Path("renders") / "daa" / args.file.stem)

    if args.lbm or args.file.suffix.lower() in (".lbm",):
        w, h, rgb, pal = read_lbm(data)
        print(f"{args.file}: ILBM {w}x{h}, {len(pal)} colors")
        if not args.list:
            out_dir.mkdir(parents=True, exist_ok=True)
            png = out_dir / f"{args.file.stem}.png"
            write_png(png, w, h, rgb, scale=max(1, args.scale // 2))
            print(f"  -> {png}")
        return

    try:
        kind, data_base, items = parse_container(data)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr); sys.exit(2)

    print(f"{args.file}  ({len(data)} bytes)  kind={kind}  data_base={data_base}")
    if kind == "index":
        print(f"  6-byte sub-frame index, {len(items)} entries (decode pixels "
              f"with tools/subframe_decode.py):")
        for bid, off in items:
            print(f"    id={bid:<4} sub_offset={off}")
        return

    rendered = 0
    for blk in items:
        try:
            raw = decompress_block(data, data_base, blk)
        except Exception as e:
            print(f"  id={blk.block_id:<4} DECOMPRESS FAILED: {e}"); continue

        # Try 8X8D tile block first (CoK format: h=8, w8=1, count byte, 4 planes)
        tile_hdr = parse_8x8d_header(raw)
        if tile_hdr:
            tile_count, n_planes, row_bytes, plane_size = tile_hdr
            kindstr = f"8x8d-tile-strip  count={tile_count}  4-plane  strip={tile_count*8}x8"
            if not args.list:
                out_dir.mkdir(parents=True, exist_ok=True)
                width, height, rgb_data = tiles_8x8d_to_rgb(
                    raw, tile_count, row_bytes, plane_size, pal=EGA_PALETTE)
                png = out_dir / f"{args.file.stem}_{blk.block_id:03d}.png"
                write_png(png, width, height, rgb_data, scale=args.scale)
                rendered += 1
            print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} comp={blk.comp_size:<6} {kindstr}")
            continue

        # Try standard 5-plane frame (BIGPIC, CPIC, BACK, BORDER, etc.)
        fr = parse_frame_header(raw)
        if fr:
            width, height, pal, pix_off = fr
            kindstr = f"frame {width}x{height}"
            if not args.list:
                out_dir.mkdir(parents=True, exist_ok=True)
                rgb_data = planar_frame_to_rgb(raw, width, height, pal, pix_off)
                png = out_dir / f"{args.file.stem}_{blk.block_id:03d}.png"
                write_png(png, width, height, rgb_data, scale=args.scale)
                rendered += 1
        else:
            h0, w0_ = (struct.unpack_from(">HH", raw, 0) if len(raw) >= 4 else (0, 0))
            kindstr = f"unrecognized (hdr {h0},{w0_})"
        print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} comp={blk.comp_size:<6} {kindstr}")
    print(f"  -> PNGs written: {rendered}")
    if rendered:
        print(f"  output: {out_dir}")


if __name__ == "__main__":
    main()
