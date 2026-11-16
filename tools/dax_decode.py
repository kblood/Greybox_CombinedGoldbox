#!/usr/bin/env python3
"""
dax_decode.py - Decoder/renderer for SSI Gold Box DOS .DAX graphics files
                (Champions of Krynn / Death Knights of Krynn, EGA 16-color).

Verified empirically against the bytes and cross-checked against DaxDump.exe
(the COAB DaxDump tool) which produces byte-identical decompressed blocks.

CONTAINER (little-endian)
  offset 0 : uint16  toc_bytes   (== entry_count * 9)
  offset 2 : TOC, `entry_count` entries of 9 bytes each:
               uint8  block_id     (sparse id; NOT a sequential index)
               uint32 data_offset  (relative to the data section base)
               uint16 raw_size     (decompressed size in bytes)
               uint16 comp_size    (compressed size in bytes)
  data section base = 2 + toc_bytes
  Each block's compressed bytes = data[base+data_offset : +comp_size].

RLE  (signed-byte run length; copy-literal / repeat)
  read control byte c:
    c <  0x80 : copy next (c + 1) bytes literally
    c >= 0x80 : repeat the next single byte (256 - c) times
  Produces exactly raw_size bytes.

STANDARD IMAGE FRAME (TITLE, BIGPIC, backdrops, combat heads, full-rect walls, ...)
  The header is 17 bytes, NOT 8.  Verified against the COAB clean-room decompile
  (`coab_extracted/Classes/DaxFiles/DaxBlock.cs`) and re-checked across every CoK/DoK
  graphics DAX: all 734 single-frame blocks have item_count == 1 and
  `17 + width*height/2 == raw_size` exactly.  See docs/dax-format.md section 4a, and
  `FRAME_HDR equ 17` in native/src/cgb.asm (and native/src/cgbc.asm).

    offset  size  field
    0       2     uint16 height        (pixels)
    2       2     uint16 width_div8    (image width in pixels = width_div8 * 8)
    4       2     uint16 placement A   (usually 0)
    6       2     uint16 placement B   (usually 0)
    8       1     uint8  item_count    (1 = single standard frame; >= 2 = tile array)
    9       8     uint8[8] field_9     EGA-plane / editor metadata, ignored for render
    17      ...   pixel data: item_count * height * (width/2) bytes
                    chunky 4 bits-per-pixel, 2 pixels per byte, HIGH nibble = left pixel;
                    each nibble is an index 0..15 into the fixed EGA palette.
  (`parse_standard_frame` tolerates up to 16 trailing pad bytes after the pixel data.)

  CORRECTED 2026-09-05.  This docstring previously documented an 8-byte header of
  `height, width_div8, y_offset, x_offset` with pixels at byte 8.  The module's CODE has
  used the verified 17 since `FRAME_HEADER = 17` was introduced -- the error was confined
  to this prose, and no caller of `frame_to_rgb` relies on its `header_len=8` default
  (every one of the five call sites passes the value explicitly).  The 8-byte reading is
  not merely short: it lands 9 bytes early and cyclically rolls each frame RIGHT by 18 px.

  Word order at offsets 4 and 6 is UNRESOLVED and deliberately not asserted here:
  docs/dax-format.md section 4a names them `x_pos` then `y_pos`, while
  `parse_standard_frame` below unpacks them as `y_off` then `x_off`.  Both words are 0 in
  every block observed, so nothing in the corpus distinguishes the two orders and neither
  claim has been verified against a non-zero example.

COMPLEX FRAMES (most PIC* and SPRIT* blocks): these begin with word1 (width_div8)
  == 0 and carry extra header words (a transparency/sub-frame variant, related to
  UA "drawing method 23").  The codec itself is SOLVED -- see docs/dax-format.md
  section 4c, docs/engine/research/dax-complex-subframe.md, and the implementations in
  packages/engine/src/loaders/dax.ts and native/src/ccdaa.asm + native/src/cgb.asm.
  THIS Python tool does not implement it: it detects such blocks and reports them as
  "complex/unsupported" rather than guessing.  (Corrected 2026-09-05: this paragraph
  used to point at a docs/dax-format.md "Unsolved" heading for the codec, which has said
  SOLVED since 2026-06.)

EGA palette: standard IBM EGA 16-color default (documented in dax-format.md).
"""
from __future__ import annotations
import argparse, struct, os, sys
from pathlib import Path

# Standard IBM EGA 16-color palette (the default text/CGA-compatible arrangement,
# with the classic "brown" fix at index 6). RGB 0-255.
EGA_PALETTE = [
    (0x00, 0x00, 0x00),  # 0  black
    (0x00, 0x00, 0xAA),  # 1  blue
    (0x00, 0xAA, 0x00),  # 2  green
    (0x00, 0xAA, 0xAA),  # 3  cyan
    (0xAA, 0x00, 0x00),  # 4  red
    (0xAA, 0x00, 0xAA),  # 5  magenta
    (0xAA, 0x55, 0x00),  # 6  brown
    (0xAA, 0xAA, 0xAA),  # 7  light gray
    (0x55, 0x55, 0x55),  # 8  dark gray
    (0x55, 0x55, 0xFF),  # 9  bright blue
    (0x55, 0xFF, 0x55),  # 10 bright green
    (0x55, 0xFF, 0xFF),  # 11 bright cyan
    (0xFF, 0x55, 0x55),  # 12 bright red
    (0xFF, 0x55, 0xFF),  # 13 bright magenta
    (0xFF, 0xFF, 0x55),  # 14 yellow
    (0xFF, 0xFF, 0xFF),  # 15 white
]

ENTRY_SIZE = 9


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
    """Return (data_base, [Block,...]). Raises ValueError on a non-DAX file."""
    if len(data) < 2:
        raise ValueError("file too small")
    toc_bytes = struct.unpack_from("<H", data, 0)[0]
    if toc_bytes == 0 or toc_bytes % ENTRY_SIZE != 0:
        raise ValueError(f"word0={toc_bytes} is not a multiple of {ENTRY_SIZE}; "
                         "not a DAX graphics container?")
    n = toc_bytes // ENTRY_SIZE
    data_base = 2 + toc_bytes
    blocks = []
    for i in range(n):
        off = 2 + i * ENTRY_SIZE
        block_id = data[off]
        data_offset, raw_size, comp_size = struct.unpack_from("<IHH", data, off + 1)
        blocks.append(Block(i, block_id, data_offset, raw_size, comp_size))
    return data_base, blocks


def rle_decode(buf: bytes, expected: int | None = None) -> bytes:
    """SSI signed-byte RLE. Returns decompressed bytes."""
    out = bytearray()
    i = 0
    n = len(buf)
    while i < n:
        if expected is not None and len(out) >= expected:
            break
        c = buf[i]; i += 1
        if c < 0x80:                      # literal run of c+1 bytes
            cnt = c + 1
            out += buf[i:i + cnt]; i += cnt
        else:                             # repeat next byte (256-c) times
            cnt = 256 - c
            if i < n:
                out += bytes([buf[i]]) * cnt
            i += 1
    return bytes(out)


def decompress_block(data: bytes, data_base: int, blk: Block) -> bytes:
    start = data_base + blk.data_offset
    comp = data[start:start + blk.comp_size]
    raw = rle_decode(comp, blk.raw_size)
    blk.raw = raw
    return raw


def parse_vga_chunky_items(raw: bytes):
    """Decode the late-Gen1 Treasures/Pools embedded-palette item-array framing.

    Returns a dict with ``width``, ``height``, ``count``, ``palette`` and one direct-8bpp
    byte string per item, or ``None`` unless the resource consumes exactly.  The 28-byte
    palette-32 special record is the same retail mode-2 branch proven for Treasures 8X8D1.
    """
    if len(raw) < 11:
        return None
    height, width8 = raw[0], raw[1]
    if not height or not width8:
        return None
    width = width8 * 8
    declared_count = struct.unpack_from("<H", raw, 6)[0]
    count = declared_count or 1
    palette_base, num_colors = raw[8], raw[9] + 1
    if num_colors < 2 or palette_base + num_colors > 256:
        return None
    palette_start = 10
    pixel_start = palette_start + num_colors * 3 + num_colors // 2 + 4
    if palette_base == 0x20 and num_colors == 0x70:
        pixel_start += 0x1C
    item_bytes = width * height
    if pixel_start + item_bytes * count != len(raw):
        return None
    palette = list(EGA_PALETTE) + [(0, 0, 0)] * (256 - len(EGA_PALETTE))
    for i in range(num_colors):
        r6, g6, b6 = raw[palette_start + i * 3:palette_start + i * 3 + 3]
        if max(r6, g6, b6) > 63:
            return None
        palette[palette_base + i] = tuple(round(value * 255 / 63) for value in (r6, g6, b6))
    frames = [raw[pixel_start + i * item_bytes:pixel_start + (i + 1) * item_bytes]
              for i in range(count)]
    return {
        "width": width,
        "height": height,
        "x_offset": struct.unpack_from("<h", raw, 2)[0],
        "y_offset": struct.unpack_from("<h", raw, 4)[0],
        "count": count,
        "palette": palette,
        "frames": frames,
    }


def _decode_draw18_flat(source: bytes, expected: int):
    """Strict flat DRAW18/PackBits decode used by late-Gen1 VGA portraits."""
    output = bytearray()
    offset = 0
    while offset < len(source) and len(output) < expected:
        control = source[offset]
        offset += 1
        if control < 0x80:
            count = control + 1
            if offset + count > len(source) or len(output) + count > expected:
                return None
            output.extend(source[offset:offset + count])
            offset += count
        else:
            count = 257 - control
            if offset >= len(source) or len(output) + count > expected:
                return None
            output.extend(bytes((source[offset],)) * count)
            offset += 1
    if offset != len(source) or len(output) != expected:
        return None
    return bytes(output)


def parse_vga_compressed_picture(raw: bytes):
    """Decode Treasures/Pools/Buck `PIC*.DAX` and `SPRIT*.DAX` embedded-palette VGA pictures.

    The outer record carries a 6-bit-DAC palette followed by one flat DRAW18 stream per declared
    frame. The mode byte sits immediately before each stream but is not included in that stream's
    declared compressed length. Returns a dict compatible with :func:`parse_vga_chunky_items`
    (``indices`` is frame 0; ``frames`` holds them all), or ``None`` unless every source and
    destination byte is consumed exactly.

    The frame count is the standard DAX header's ``item_count`` at byte 8, as ``raw[8] + 1`` -- not
    the word at ``record_start``, which agrees on 275 of 293 corpus blocks and takes values like
    256, 1029 and 1541 on the multi-frame PIC blocks where it does not. The mode byte is carried
    uninterpreted (observed 0..8, 10, 20, 99). See
    ``packages/engine/src/loaders/daxVgaCompressedPicture.ts`` for the evidence and the null.
    """
    header_len = 11
    if len(raw) < header_len + 10:
        return None
    height, width8 = struct.unpack_from("<HH", raw, 0)
    width = width8 * 8
    if not width or not height or width > 4096 or height > 2048:
        return None
    palette_base, color_count = raw[9], raw[10]
    if color_count < 2 or color_count & 1 or palette_base + color_count > 256:
        return None
    palette_end = header_len + color_count * 3
    seed_end = palette_end + color_count // 2
    record_start = seed_end + 4
    if record_start + 5 > len(raw):
        return None
    palette = list(EGA_PALETTE) + [(0, 0, 0)] * (256 - len(EGA_PALETTE))
    for i in range(color_count):
        rgb6 = raw[header_len + i * 3:header_len + i * 3 + 3]
        if len(rgb6) != 3 or max(rgb6) > 63:
            return None
        palette[palette_base + i] = tuple(round(value * 255 / 63) for value in rgb6)
    record_word = struct.unpack_from("<H", raw, record_start)[0]
    frame_count = raw[8] + 1
    if frame_count > 16:
        return None
    headers_end = record_start + 2 + frame_count * 3
    if headers_end > len(raw):
        return None
    headers = []
    declared = 0
    for i in range(frame_count):
        at = record_start + 2 + i * 3
        length = struct.unpack_from("<H", raw, at)[0]
        headers.append((length, raw[at + 2]))
        declared += length
    if headers_end + declared != len(raw):
        return None
    frames = []
    payload_at = headers_end
    for length, mode in headers:
        decoded = _decode_draw18_flat(raw[payload_at:payload_at + length], width * height)
        if decoded is None:
            return None
        frames.append(decoded)
        payload_at += length
    return {
        "width": width,
        "height": height,
        "x_offset": struct.unpack_from("<h", raw, 6)[0],
        "y_offset": struct.unpack_from("<h", raw, 4)[0],
        "mode": headers[0][1],
        "record_word": record_word,
        "palette_base": palette_base,
        "color_count": color_count,
        "palette": palette,
        "indices": frames[0],
        "frames": frames,
    }


# DAX block header is 17 bytes (COAB DaxBlock.cs): height,u16 width_div8,u16 x,u16 y,
# u8 item_count@8, u8[8] field_9@9, pixels@17. A "standard frame" is item_count==1.
FRAME_HEADER = 17


def parse_standard_frame(raw: bytes):
    """
    Return (width, height, x_off, y_off) if `raw` is a standard single-frame image
    (item_count == 1), else None. Pixel data starts at byte 17 (not 8): an earlier
    8-byte assumption read frames 9 bytes early, rolling them right by 18 px. Verified
    across every CoK/DoK graphics DAX (17 + width*height/2 == rawSize exactly).
    """
    if len(raw) < FRAME_HEADER:
        return None
    height, width_div8, y_off, x_off = struct.unpack_from("<HHHH", raw, 0)
    item_count = raw[8]
    if width_div8 == 0 or height == 0 or item_count != 1:
        return None
    width = width_div8 * 8
    need = width * (height) // 2          # bytes of pixel data (2 px/byte)
    payload = len(raw) - FRAME_HEADER
    # Allow up to 16 trailing pad bytes; reject if payload too small.
    if payload < need or payload - need > 16:
        return None
    if width > 4096 or height > 2048:
        return None
    return width, height, x_off, y_off


def parse_tile_strip(raw: bytes):
    """
    8X8 dungeon-tile blocks (and similar) are not single rectangles: the header is
    {u16 tile_height=8, u16 width_div8=1, ...} and the payload is a tall vertical
    strip of stacked 8x8 tiles laid out 16 pixels wide (two tiles per row).
    Detect them and return (width, height, header_len) or None.
    """
    if len(raw) < 8:
        return None
    h0, h1 = struct.unpack_from("<HH", raw, 0)
    if h0 != 8 or h1 != 1:
        return None
    # payload after the 8-byte header is (8*k + 1): one extra byte, rest = 8 bytes/row at 16px.
    payload = len(raw) - 8
    if payload < 8:
        return None
    width = 16
    height = payload // 8            # 8 bytes per 16-px row (2 px/byte)
    if height == 0:
        return None
    return width, height, 8


# Bytes before the first tile in the 17-byte multi-item tile array (see `parse_ega_tile_array`).
EGA_TILE_ARRAY_HEADER = 17


def parse_ega_tile_array(raw: bytes):
    """
    Fixed-size multi-item 8x8-tile array -- the 17-byte-header DaxBlock layout documented in
    `packages/engine/src/loaders/tiles8x8.ts` (`sniff8x8dBlock`/`decode8x8dBlock`'s 4bpp branch),
    used for CoK's DUNGCOM/8X8D banks and for **DoK's seven 256-tile `8X8D*.DAX` dungeon wall
    banks** (`dungeonWalls.ts`'s `singleBank` addressing). `tools/dok_amiga_wallbank.py` used to
    read those wall banks through `parse_tile_strip` above (the 8-byte-header, 16px-wide strip),
    which is the WRONG format for them and interleaves rows of neighbouring tiles -- see
    `docs/engine/research/dok-8x8d-amiga-format.md` for the correction this caused (R1,
    2026-09-02: a tool bug, not a property of the data).

    Header:
      off 0  u16 tile_height (px)
      off 2  u16 tile_width_div8 (x8 = px)
      off 4  u16 x_pos, off 6 u16 y_pos  (ignored)
      off 8  u8  item_count       (SATURATES at 0xFF -- a uint8 cannot express a count of
                                    exactly 256, so DoK's 256-tile wall banks read back 0xFF)
      off 9  u8[8] field_9        (ignored -- EGA-plane/editor metadata)
      off 17 pixels               item_count (or the exact-framed count, see below) tiles of
                                   height*width_div8*4 chunky-4bpp bytes each, high nibble =
                                   left pixel, no gap/trailer between tiles

    The count byte is authoritative UNLESS it has saturated at 0xFF: DoK's wall banks are
    exactly `17 + 256*32 == 8209` bytes with `raw[8] == 0xFF` (255), so the true count (256) is
    derived from the exact-framing division `(len(raw)-17) // tile_bytes` whenever the byte
    reads 0xFF, that framing divides evenly, and it is itself >= 0xFF -- the identical rule
    `tiles8x8.ts` applies. Otherwise the count byte is used directly, clamped to what the bytes
    actually frame (matches `decode8x8dBlock`'s `available`/`count` computation).

    Returns (width, height, count, header_len=17), or None unless the framing consumes `raw`
    EXACTLY (17 + count*tile_bytes == len(raw)) -- the same exact-consume gate every other frame
    parser in this module uses.
    """
    if len(raw) < EGA_TILE_ARRAY_HEADER:
        return None
    height, width_div8 = struct.unpack_from("<HH", raw, 0)
    if height == 0 or width_div8 == 0:
        return None
    tile_bytes = height * width_div8 * 4
    if tile_bytes == 0:
        return None
    count_byte = raw[8]
    payload = len(raw) - EGA_TILE_ARRAY_HEADER
    framed = payload // tile_bytes
    if count_byte == 0xFF and payload % tile_bytes == 0 and framed >= 0xFF:
        count = framed
    else:
        count = min(count_byte, framed)
    if count < 1:
        return None
    if EGA_TILE_ARRAY_HEADER + count * tile_bytes != len(raw):
        return None
    return width_div8 * 8, height, count, EGA_TILE_ARRAY_HEADER


def compose_ega_tile_array_rgb(raw: bytes, cols: int = 2):
    """
    Compose an EGA 8x8 tile array into one whole-block RGB image: tile k sits at column k % cols,
    row k // cols (row-major), with the last row zero-padded (EGA index 0) when the count is not a
    multiple of `cols`. Returns (width, height, rgb_bytes). Each tile's pixels are verified
    separately against the per-tile renders (see the 2026-11-10 decode finding note); the
    arrangement is a documented layout choice, not a property read from the game.
    """
    frame = parse_ega_tile_array(raw)
    if frame is None:
        raise ValueError("block is not an exact-framed EGA 8x8 tile array")
    tile_w, tile_h, count, header_len = frame
    tiles = ega_tile_array_tiles(raw, tile_w, tile_h, count, header_len)
    rows = (count + cols - 1) // cols
    width, height = tile_w * cols, tile_h * rows
    indices = [0] * (width * height)
    for k, tile in enumerate(tiles):
        ox, oy = (k % cols) * tile_w, (k // cols) * tile_h
        for y in range(tile_h):
            for x in range(tile_w):
                indices[(oy + y) * width + ox + x] = tile[y * tile_w + x]
    rgb = bytearray(width * height * 3)
    for i, value in enumerate(indices):
        rgb[3 * i:3 * i + 3] = bytes(EGA_PALETTE[value])
    return width, height, bytes(rgb)


def ega_tile_array_tiles(raw: bytes, width: int, height: int, count: int,
                          header_len: int = EGA_TILE_ARRAY_HEADER) -> list[tuple[int, ...]]:
    """Decode `count` contiguous chunky-4bpp `width`x`height` tiles (as `parse_ega_tile_array`
    frames them) into a list of raw EGA palette-index tuples (0..15), row-major -- the same
    per-tile layout `decode8x8dBlock`'s `decodeTile` produces."""
    row_bytes = width // 2
    tile_bytes = row_bytes * height
    tiles = []
    for i in range(count):
        off = header_len + i * tile_bytes
        idx = [0] * (width * height)
        o = 0
        for y in range(height):
            base = off + y * row_bytes
            for xb in range(row_bytes):
                byte = raw[base + xb]
                idx[o] = byte >> 4
                idx[o + 1] = byte & 0x0F
                o += 2
        tiles.append(tuple(idx))
    return tiles


def _deroll_indices(idx: list, width: int, height: int) -> None:
    """Undo a horizontal cyclic ROLL in a full-screen frame (in place).

    A few SSI title screens are stored shifted sideways (rightmost columns wrap onto the left
    margin) and the original engine un-rolled them on display -- e.g. CoK TITLE.DAX block 1, the
    "Strategic Simulations" boot screen, is rolled +13 px. The decompressed bytes are correct
    (byte-identical to DaxDump.exe); only the framing is shifted, so we recover it from the pixels:
    a correctly-framed full-screen image has a uniform background border, so its left and right
    border columns match. Find the cyclic de-roll k that makes those border columns pixel-identical;
    if the borders are clearly torn at k=0 but clean at a small k>0, shift every row left by k.
    Strict (torn -> clean) so full-bleed art and already-correct frames are never touched.
    """
    if width < 64 or height < 64:
        return
    lim = min(40, width // 4)

    def miss_at(k: int) -> int:
        m = 0
        for y in range(height):
            row = y * width
            if idx[row + (k % width)] != idx[row + ((width - 1 + k) % width)]:
                m += 1
        return m

    miss0 = miss_at(0)
    best_k, best_miss = 0, miss0
    for k in range(1, lim + 1):
        m = miss_at(k)
        if m < best_miss:
            best_miss, best_k = m, k
    rolled = (best_k > 0 and best_miss <= 2
              and miss0 >= max(8, height // 10) and miss0 >= 8 * max(1, best_miss))
    if not rolled:
        return
    for y in range(height):
        row = y * width
        shifted = [idx[row + ((j + best_k) % width)] for j in range(width)]
        idx[row:row + width] = shifted


def frame_to_rgb(raw: bytes, width: int, height: int, header_len: int = 8):
    """Decode chunky-4bpp (2px/byte, high nibble first) into a flat RGB bytearray."""
    pix = raw[header_len:]
    row_bytes = width // 2
    idx = [0] * (width * height)
    o = 0
    for y in range(height):
        base = y * row_bytes
        for xb in range(row_bytes):
            i = base + xb
            byte = pix[i] if i < len(pix) else 0
            idx[o] = byte >> 4; idx[o + 1] = byte & 0x0F; o += 2
    _deroll_indices(idx, width, height)
    img = bytearray(width * height * 3)
    pal = EGA_PALETTE
    o = 0
    for p in idx:
        r, g, b = pal[p]
        img[o] = r; img[o + 1] = g; img[o + 2] = b; o += 3
    return img


def indexed_to_rgb(indices: bytes, palette):
    """Expand direct 8-bit indices through a 256-entry RGB tuple palette."""
    image = bytearray(len(indices) * 3)
    offset = 0
    for index in indices:
        r, g, b = palette[index]
        image[offset:offset + 3] = bytes((r, g, b))
        offset += 3
    return image


def write_png(path: Path, width: int, height: int, rgb: bytes, scale: int = 1):
    try:
        from PIL import Image
    except ImportError:
        _write_png_raw(path, width, height, rgb)
        return
    im = Image.frombytes("RGB", (width, height), bytes(rgb))
    if scale != 1:
        im = im.resize((width * scale, height * scale), Image.NEAREST)
    im.save(path)


def _write_png_raw(path: Path, width: int, height: int, rgb: bytes):
    """Minimal zlib-compressed PNG writer (fallback when Pillow is absent)."""
    import zlib
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgb[y * width * 3:(y + 1) * width * 3]
    def chunk(typ, payload):
        c = struct.pack(">I", len(payload)) + typ + payload
        c += struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
        return c
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    ap = argparse.ArgumentParser(description="Decode/render SSI Gold Box DOS .DAX graphics")
    ap.add_argument("file", type=Path, help="path to a .DAX file")
    ap.add_argument("--out", type=Path, default=None,
                    help="output directory (default: renders/dax/<stem>)")
    ap.add_argument("--scale", type=int, default=4, help="PNG nearest-neighbour upscale (default 4)")
    ap.add_argument("--list", action="store_true", help="list blocks only; do not render")
    args = ap.parse_args()

    data = args.file.read_bytes()
    try:
        data_base, blocks = parse_container(data)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)

    out_dir = args.out or (Path("renders") / "dax" / args.file.stem)
    print(f"{args.file}  ({len(data)} bytes)")
    print(f"  entries={len(blocks)}  data_base={data_base}")

    rendered = standard = complex_ = 0
    for blk in blocks:
        try:
            raw = decompress_block(data, data_base, blk)
        except Exception as e:
            print(f"  id={blk.block_id:<4} DECOMPRESS FAILED: {e}")
            continue
        chunky = parse_vga_chunky_items(raw)
        compressed = None if chunky else parse_vga_compressed_picture(raw)
        fr = None if chunky or compressed else parse_standard_frame(raw)
        header_len = FRAME_HEADER
        kind = "complex/unsupported"
        if chunky:
            kind = f"vga-chunky-items {chunky['width']}x{chunky['height']} x{chunky['count']}"
            standard += chunky["count"]
            if not args.list:
                out_dir.mkdir(parents=True, exist_ok=True)
                for frame_index, indices in enumerate(chunky["frames"]):
                    rgb = indexed_to_rgb(indices, chunky["palette"])
                    suffix = f"_{frame_index:03d}" if chunky["count"] > 1 else ""
                    png = out_dir / f"{args.file.stem}_{blk.block_id:03d}{suffix}.png"
                    write_png(png, chunky["width"], chunky["height"], rgb, scale=args.scale)
                    rendered += 1
        elif compressed:
            count = len(compressed["frames"])
            kind = f"vga-compressed-picture {compressed['width']}x{compressed['height']} x{count}"
            standard += count
            if not args.list:
                out_dir.mkdir(parents=True, exist_ok=True)
                for frame_index, indices in enumerate(compressed["frames"]):
                    rgb = indexed_to_rgb(indices, compressed["palette"])
                    suffix = f"_{frame_index:03d}" if count > 1 else ""
                    png = out_dir / f"{args.file.stem}_{blk.block_id:03d}{suffix}.png"
                    write_png(png, compressed["width"], compressed["height"], rgb, scale=args.scale)
                    rendered += 1
        elif not fr:
            strip = parse_tile_strip(raw)
            if strip:
                width, height, header_len = strip
                fr = (width, height, 0, 0)
                kind = f"tile-strip {width}x{height}"
        if fr:
            width, height, xo, yo = fr
            if kind == "complex/unsupported":
                kind = f"frame {width}x{height}"
            standard += 1
            if not args.list:
                out_dir.mkdir(parents=True, exist_ok=True)
                rgb = frame_to_rgb(raw, width, height, header_len)
                png = out_dir / f"{args.file.stem}_{blk.block_id:03d}.png"
                write_png(png, width, height, rgb, scale=args.scale)
                rendered += 1
        elif not chunky and not compressed:
            complex_ += 1
        print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} comp={blk.comp_size:<6} {kind}")

    print(f"  -> standard frames: {standard}, complex/unsupported: {complex_}, "
          f"PNGs written: {rendered}")
    if rendered:
        print(f"  output: {out_dir}")


if __name__ == "__main__":
    main()
