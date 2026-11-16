#!/usr/bin/env python3
"""
glib_decode.py - Decoder/renderer for SSI Gold Box AMIGA "GLIB" / DataLib
                 graphics containers (.TLB / .GLB), the big-endian Amiga
                 sibling of the DOS "HLIB" format (see tools/hlib_decode.py,
                 docs/hlib-format.md, docs/glib-format.md).

Used by the Amiga ports of the DataLib-era Gold Box games:
  The Dark Queen of Krynn, Pools of Darkness      (5-plane, 32-colour era)
  Gateway to the Savage Frontier, Treasures of
  the Savage Frontier                              (mixed 5-plane + 4-plane)
  Curse of the Azure Bonds, Secret of the Silver
  Blades                                           (4-plane, 16-colour era)

Everything below was derived empirically from the shipped files plus a
disassembly (capstone M68K) of the Amiga DQK executable
("DarkQueenOfKrynn/data/The Dark Queen of Krynn", AmigaOS HUNK format,
code hunk at file offset 40).  Key executable routines:
  0x48d62 file loader           0x48e82 compression method dispatch
  0x4c372 method-5 LZ77         0x49198/0x49720 method-3 LZW wrapper/core
  0x4912a method-3 table init   0x490ac method-3 table reclaim (mark/sweep)
  0x4688a image header parse    0x4ac4c method-E3 two-stream decoder

CONTAINER (big-endian; DOS HLIB is the same layout little-endian)
  off 0  ASCII "GLIB"
  off 4  DWORD file size (decompressed size incl. this 16-byte header)
  off 8  WORD  pointer count - 1 (stored count excludes the trailing EOF ptr)
  off 10 BYTE  compression method (0 = stored, 3 = LZW, 5 = LZ77; methods
               1/2/4 exist in the exe dispatch but no shipped file uses them)
  off 11 BYTE  magic (0 = no image-id table, 1 = id table present at ptr[0])
  off 12 ASCII tag: "TILE" leaf, "GLIB" master (CoAB/Gateway-era masters say
               "HLIB" instead - engine drift), "DATA"/"DIG8"/"TEXT" non-image
  off 16 DWORD[count] pointer list, last pointer == file size (occasionally
               fsize-1 when the file got Amiga even-length padding)

  COMPRESSED FILES (method != 0): the 16-byte header and pointer data it
  describes refer to the DECOMPRESSED image of the file.  On disk the layout
  is: 16-byte header (stored), WORD slack (in-place-decompression margin, not
  stream data), then the compressed stream producing fsize-16 bytes.  Output
  is produced in 0x2000-byte chunks; each chunk is a self-contained stream
  restart (method 5: ends with an 0xE0+ opcode; method 3: begins with a fresh
  16-bit seed word) but method 3's LZW string table PERSISTS across chunks.

  MASTER: ptr[0] = set-id table (when magic==1), remaining pointers = "sets",
  each a complete self-contained GLIB leaf whose pointers are relative to the
  set start.  Sets are individually compressed (their own method byte).

METHOD 5 - LZ77 (exe 0x4c372), opcodes:
  c < 0x80:    next byte d5; emit (d5>>3)&3 literals; then match:
               dist = ((d5<<2)&0x380)|c, len = (d5&7)+3
  0x80..0xBF:  next bytes d5,d6; emit d6&3 literals; then match:
               dist = ((d5&0xE0)<<1)|(c&0x3F)|((d6<<7)&0x7E00), len=(d5&0x1F)+3
  0xC0..0xDF:  literal run: n = c&0x0F; if !(c&0x10): n=(n+1)<<2
  0xE0..0xFF:  end of 0x2000-output chunk
  Matches copy forward from out[len(out)-dist-1].

METHOD 3 - LZW (exe 0x49198/0x49720/0x4912a/0x490ac):
  10-bit fixed-width codes, big-endian bit packing.  Each 0x2000 chunk starts
  with a 16-bit word: top 10 bits = first code, low 6 bits = start of the bit
  buffer.  Table: codes 0..0xFF literal, 0x100..0x3FF dynamic entries
  {prefix, append-char} with a free-flag byte per code (0 free, 1 recently
  used, 0xFF allocated).  After each code: mark prev used, allocate entry
  {prefix=prev, append=first char of current expansion} at next free slot
  (linear scan for flag==0, sentinel at 0x400).  When the table is full a
  mark/sweep reclaim frees >=0x55 entries (allocated-but-not-recently-used,
  prefixes of live entries protected) and allocation restarts at the lowest
  freed code.  The table survives across chunks of one file.

IMAGE (8-byte big-endian header, then pixel data - planar, unlike DOS)
  WORD height
  WORD vertical offset   (placement hint, ignored for rendering)
  WORD horizontal offset (placement hint, ignored for rendering)
  BYTE width in BYTES per plane row (actual width = this * 8)
  BYTE drawing method

  Amiga bit order is MSB-first: pixel x lives in bit 7-(x&7) of plane byte
  x>>3; plane p contributes bit p of the colour index.

DRAWING METHODS  (dm >= 0xE0 -> 5 planes/32 colours; dm < 0xE0 -> 4/16)
  0xE0 / 0x00  raw opaque:   planes stored contiguously (plane p = whole
               h*wb block p)
  0xE1 / 0x01  raw masked:   6 (5) contiguous blocks: MASK plane first,
               then colour planes 0..n-1.  Mask polarity: bit 1 = TRANSPARENT
               (keep destination), bit 0 = draw the pixel.  Proven corpus-wide:
               across all 10,587 masked members, mask=1 pixels carry ZERO
               colour-plane bits while mask=0 pixels are 85% nonzero.
  0xE2 / 0xD2 / 0x02  compressed opaque: one continuous PCX-style RLE stream
               (c<128: copy c+1 literals; c>=128: repeat next byte 257-c
               times).  The decompressed layout differs per method:
                 0xE2 (5-plane): planar, ROW-INTERLEAVED - for each screen
                      row, 5 sub-rows of wb bytes (plane 0 row, plane 1, ...)
                 0xD2 (4-plane): planar, ROW-INTERLEAVED, 4 sub-rows per row
                      (the 4-plane sibling of 0xE2; CoAB/Secret title screens
                      and ALWAYS.TLB UI strips)
                 0x02 (4-plane): CHUNKY 4bpp, high nibble = left pixel - the
                      only non-planar method in the format (DOS-style pixels,
                      presumably converted to planar at load)
  0xE3 / 0x03  compressed masked (exe 0x4ac4c): body = WORD dataOffset,
               WORD planeStride, ctrl stream (body[4 .. 4+dataOffset]), then
               nplanes per-plane data streams of planeStride bytes each.
               The single ctrl stream is re-executed once per plane, each
               time against that plane's data stream.  Ctrl opcodes, per row:
                 0x00        end of row
                 0x01..0x3F  skip n bytes (transparent)
                 0x40 | n    masked copy: n data bytes, each preceded (in the
                             ctrl stream) by a mask byte m; dest=(dest&~m)|(d&m)
                 0x80 | n    run: next data byte repeated n times
                 0xC0 | n    copy n literal data bytes
  0x19 (25)    image-id list, not pixels (same as DOS; skipped)

COLOUR TABLE (both eras; detected by cmagic, absorbed - never an image)
  WORD cycle?, WORD first_col, WORD ncolors, BYTE nranges, BYTE cmagic,
  then RGB triplets, full 8-bit values.  Two shapes:
    cmagic 0xE8, 104 bytes: 32 triplet slots (5-plane era)
    cmagic 0x08,  56 bytes: 16 triplet slots (4-plane era; same cmagic value
                            as the DOS HLIB colour table, which uses 8 or 24)
    cmagic 0x08,   8 bytes: header-only empty table (no triplets)
  Valid triplets = min(ncolors, capacity) when ncolors > 0, else the full
  capacity; they are loaded at palette index first_col (e.g. FRAME.TLB tables
  say first_col=16, ncolors=16 -> colours 16..31, matching their DOS twins;
  slots past the valid count are packer garbage).  Detection: region size in
  (8, 56, 104) and byte +7 in (0x08, 0xE8).

Transparency in this tool's output: masked pixels (E3/03 pixels never touched
by the ctrl stream, and E1/01 pixels whose mask bit is 1) -> index 255.
"""
from __future__ import annotations
import argparse, struct, sys
from pathlib import Path


# --------------------------------------------------------------------------- #
# File-level decompression (methods 3 and 5)
# --------------------------------------------------------------------------- #
class _Lzw:
    """Method-3 LZW state (exe 0x4912a init / 0x49720 core / 0x490ac reclaim)."""

    def __init__(self):
        self.flag = bytearray(0x402)          # includes sentinel byte at 0x400
        for i in range(0x100):
            self.flag[i] = 0xFF               # literal codes: permanently taken
        self.append = bytearray(0x400)
        for i in range(0x100):
            self.append[i] = i
        self.prefix = [0xFFFF] * 0x400
        self.next_code = 0x100

    def expand(self, code: int, out: bytearray) -> int:
        stack = []
        c = code
        while c >= 0x100:
            stack.append(self.append[c])
            c = self.prefix[c]
        out.append(c)
        first = c
        while stack:
            out.append(stack.pop())
        return first

    def reclaim(self, prev: int, cur_next: int) -> int:
        freed, new_min = 0, cur_next
        while True:
            for c in range(0x100, 0x400):
                f = self.flag[c]
                if f >= 0x80:                 # allocated, not recently used
                    if c != prev:
                        self.flag[c] = 0
                        freed += 1
                        if c < new_min:
                            new_min = c
                elif f > 0:                   # recently used -> demote
                    self.flag[c] = 0xFF
            for c in range(0x100, 0x400):     # protect prefixes of live entries
                if self.flag[c] != 0:
                    self.flag[self.prefix[c] & 0x3FF] = 1
            if freed >= 0x55:
                return new_min

    def chunk(self, src: bytes, pos: int, out: bytearray, target: int) -> int:
        base = len(out)
        bitbuf = (src[pos] << 8) | src[pos + 1]
        pos += 2
        bits = 6
        prev = bitbuf >> 6
        self.expand(prev, out)
        nc = self.next_code
        while len(out) - base < target:
            if bits:
                bitbuf = ((bitbuf << 8) & 0xFFFF) | src[pos]
                pos += 1
                bits -= 2
            else:
                bitbuf = (src[pos] << 8) | src[pos + 1]
                pos += 2
                bits = 6
            code = (bitbuf >> bits) & 0x3FF
            first = self.expand(code, out)
            if nc >= 0x400:
                nc = self.reclaim(prev, nc)
            self.flag[prev] = 1
            self.flag[nc] = 0xFF
            self.append[nc] = first
            self.prefix[nc] = prev
            c = nc + 1
            while self.flag[c] != 0:
                c += 1
            nc = c
            prev = code
        self.next_code = nc
        return pos


def decompress3(src: bytes, total: int) -> bytes:
    """Method-3 LZW body: src = whole (sub-)file starting at its GLIB header."""
    lzw = _Lzw()
    out = bytearray()
    pos = 18                                  # 16-byte header + WORD slack
    while len(out) < total:
        pos = lzw.chunk(src, pos, out, min(0x2000, total - len(out)))
    return bytes(out[:total])


def decompress5(src: bytes, total: int) -> bytes:
    """Method-5 LZ77 body (exe 0x4c372): src starts at the GLIB header."""
    out = bytearray()
    pos = 18
    while len(out) < total:
        while True:                           # one 0x2000-output chunk
            c = src[pos]; pos += 1
            if c < 0x80:
                d5 = src[pos]; pos += 1
                lit = (d5 >> 3) & 3
                out += src[pos:pos + lit]; pos += lit
                dist = ((d5 << 2) & 0x380) | c
                n = (d5 & 7) + 3
                s = len(out) - dist - 1
                for _ in range(n):
                    out.append(out[s]); s += 1
            elif c < 0xC0:
                d5 = src[pos]; d6 = src[pos + 1]; pos += 2
                lit = d6 & 3
                out += src[pos:pos + lit]; pos += lit
                dist = ((d5 & 0xE0) << 1) | (c & 0x3F) | ((d6 << 7) & 0x7E00)
                n = (d5 & 0x1F) + 3
                s = len(out) - dist - 1
                for _ in range(n):
                    out.append(out[s]); s += 1
            elif c < 0xE0:
                n = c & 0x0F
                if not (c & 0x10):
                    n = (n + 1) << 2
                out += src[pos:pos + n]; pos += n
            else:
                break                         # 0xE0.. = end of chunk
    return bytes(out[:total])


def load_container(data: bytes, base: int = 0) -> bytes:
    """Return the fully-decompressed bytes of the (sub-)file at `base`."""
    if data[base:base + 4] != b"GLIB":
        raise ValueError(f"bad signature {data[base:base+4]!r} at {base}")
    fsize = struct.unpack_from(">I", data, base + 4)[0]
    method = data[base + 10]
    if method == 0:
        return bytes(data[base:base + fsize])
    if method == 3:
        return bytes(data[base:base + 16]) + decompress3(data[base:], fsize - 16)
    if method == 5:
        return bytes(data[base:base + 16]) + decompress5(data[base:], fsize - 16)
    raise ValueError(f"unsupported compression method {method} at {base}")


# --------------------------------------------------------------------------- #
# Low-level container parsing (mirrors hlib_decode.read_header)
# --------------------------------------------------------------------------- #
def read_header(data: bytes, base: int = 0):
    """Return dict with sig, fsize, count, method, magic, tag, ptrs, base."""
    sig = data[base:base + 4]
    if sig != b"GLIB":
        raise ValueError(f"bad signature {sig!r} at {base}; not a GLIB container")
    fsize = struct.unpack_from(">I", data, base + 4)[0]
    count = struct.unpack_from(">H", data, base + 8)[0] + 1   # + EOF pointer
    method = data[base + 10]
    magic = data[base + 11]
    tag = data[base + 12:base + 16]
    ptrs = [struct.unpack_from(">I", data, base + 16 + 4 * i)[0]
            for i in range(count)]
    return {"sig": sig, "fsize": fsize, "count": count, "method": method,
            "magic": magic, "tag": tag, "ptrs": ptrs, "base": base}


def read_id_table(data: bytes, off: int):
    """magic==1 id table at ptr[0]: WORD n, then n * {WORD id, WORD ptr#}."""
    n = struct.unpack_from(">H", data, off)[0]
    return [struct.unpack_from(">HH", data, off + 2 + 4 * i) for i in range(n)]


def read_palette(data: bytes, off: int, size: int, base=None):
    """Parse a GLIB colour table member. Two shapes exist: cmagic 0xE8 with
    32 triplet slots (104 bytes, 5-plane era) and cmagic 0x08 with 16 slots
    (56 bytes, 4-plane era) or none (8 bytes, header-only empty table).
    min(ncolors, capacity) triplets (all of them when ncolors == 0) are loaded
    at palette index first_col, merged over `base` (a 256-entry palette list,
    copied - e.g. FRAME.TLB tables target colours 16..31 only).
    Returns a 256-entry palette list or None if this region is not a table."""
    if size not in (8, 56, 104) or off + size > len(data):
        return None
    if data[off + 7] not in (0x08, 0xE8):
        return None
    first_col = struct.unpack_from(">H", data, off + 2)[0]
    ncolors = struct.unpack_from(">H", data, off + 4)[0]
    capacity = (size - 8) // 3
    n = min(ncolors, capacity) if ncolors > 0 else capacity
    if first_col + n > 256:
        return None
    pal = list(base) if base is not None else [(0, 0, 0)] * 256
    p = off + 8
    for c in range(n):
        pal[first_col + c] = (data[p], data[p + 1], data[p + 2])
        p += 3
    return pal


# Fallback for 4-plane (16-colour) sets that carry no colour-table member.
# Many 4-plane sets DO ship a real 56-byte cmagic-0x08 table (all Secret
# BIGPIC/PIC sets; CoAB ALWAYS/TITLE) which is absorbed automatically; sets
# without one (CoAB BIGPIC/PIC/8X8D...) inherit the game-global ALWAYS.TLB
# palette at runtime.  Pass --pal <file with a colour table> to use the real
# palette; otherwise this EGA stand-in is used.
EGA16 = [
    (0x00, 0x00, 0x00), (0x00, 0x00, 0xAA), (0x00, 0xAA, 0x00), (0x00, 0xAA, 0xAA),
    (0xAA, 0x00, 0x00), (0xAA, 0x00, 0xAA), (0xAA, 0x55, 0x00), (0xAA, 0xAA, 0xAA),
    (0x55, 0x55, 0x55), (0x55, 0x55, 0xFF), (0x55, 0xFF, 0x55), (0x55, 0xFF, 0xFF),
    (0xFF, 0x55, 0x55), (0xFF, 0x55, 0xFF), (0xFF, 0xFF, 0x55), (0xFF, 0xFF, 0xFF),
]
EGA16_PAL = EGA16 + [(0, 0, 0)] * 240


# --------------------------------------------------------------------------- #
# Planar decode -> chunky index buffer
# --------------------------------------------------------------------------- #
def _rle18(src: bytes, out_len: int):
    """PCX-style RLE shared by dm 2/0xE2 (and DOS method 18, hence the name)."""
    out = bytearray()
    pos = 0
    while len(out) < out_len:
        c = src[pos]; pos += 1
        if c < 128:
            out += src[pos:pos + c + 1]
            pos += c + 1
        else:
            out += bytes([src[pos]]) * (257 - c)
            pos += 1
    return bytes(out[:out_len])


def _planes_to_chunky(planes, h: int, wb: int, mask=None) -> bytearray:
    """MSB-first planar -> chunky. Where `mask` (bytearray h*wb) bit is 0 the
    pixel becomes 255 (transparent)."""
    w = wb * 8
    px = bytearray(w * h)
    for y in range(h):
        row = y * wb
        for x in range(w):
            byi = row + (x >> 3)
            bit = 7 - (x & 7)
            if mask is not None and not (mask[byi] >> bit) & 1:
                px[y * w + x] = 255
                continue
            v = 0
            for p, pl in enumerate(planes):
                v |= ((pl[byi] >> bit) & 1) << p
            px[y * w + x] = v
    return px


def _decode_e3(body: bytes, h: int, wb: int, nplanes: int):
    """dm 3 / 0xE3 two-stream decoder (exe 0x4ac4c). Returns (planes, mask)."""
    data_off, stride = struct.unpack_from(">HH", body, 0)
    ctrl = body[4:4 + data_off]
    planes = []
    mask = bytearray(h * wb)
    for p in range(nplanes):
        data = body[4 + data_off + p * stride: 4 + data_off + (p + 1) * stride]
        plane = bytearray(h * wb)
        cp = dp = 0
        for row in range(h):
            o = row * wb
            while True:
                op = ctrl[cp]; cp += 1
                if op == 0:
                    break
                k = op & 0x3F
                if op < 0x40:                       # skip (transparent)
                    o += op
                elif op < 0x80:                     # masked copy
                    for _ in range(k):
                        m = ctrl[cp]; cp += 1
                        plane[o] = (plane[o] & (~m & 0xFF)) | (data[dp] & m)
                        mask[o] |= m
                        dp += 1; o += 1
                elif op < 0xC0:                     # run
                    b = data[dp]; dp += 1
                    for _ in range(k):
                        plane[o] = b; mask[o] = 0xFF; o += 1
                else:                               # literal copy
                    for _ in range(k):
                        plane[o] = data[dp]; mask[o] = 0xFF
                        dp += 1; o += 1
        planes.append(plane)
    return planes, mask


def decode_image(data: bytes, start: int, end: int):
    """Decode one image member (header at `start`, bytes up to `end`).
    Returns (width, height, indices, drawmethod) with 255 = transparent,
    or None if the member is not a decodable image (id lists, unknown dm)."""
    if end - start < 8:
        return None
    h, _voff, _hoff = struct.unpack_from(">HHH", data, start)
    wb = data[start + 6]
    dm = data[start + 7]
    if h == 0 or wb == 0:
        return None
    nplanes = 5 if dm >= 0xE0 else 4
    variant = dm & 0x1F if dm >= 0xE0 else dm
    body = data[start + 8:end]
    plane_sz = h * wb
    try:
        if variant == 0:                            # raw opaque
            if len(body) < nplanes * plane_sz:
                return None
            planes = [body[p * plane_sz:(p + 1) * plane_sz]
                      for p in range(nplanes)]
            px = _planes_to_chunky(planes, h, wb)
        elif variant == 1:                          # raw masked (mask first)
            if len(body) < (nplanes + 1) * plane_sz:
                return None
            planes = [body[(p + 1) * plane_sz:(p + 2) * plane_sz]
                      for p in range(nplanes)]
            # Mask polarity (proven corpus-wide): bit 1 = transparent (keep
            # destination), bit 0 = draw.  _planes_to_chunky keys on bit 0,
            # so pass the INVERTED mask plane.
            inv = bytes(~b & 0xFF for b in body[:plane_sz])
            px = _planes_to_chunky(planes, h, wb, inv)
        elif variant == 2 or dm == 0xD2:            # RLE-compressed opaque
            dec = _rle18(body, nplanes * plane_sz)
            if nplanes == 5 or dm == 0xD2:
                # 0xE2 / 0xD2: planar, ROW-INTERLEAVED (nplanes sub-rows of
                # wb bytes per screen row)
                planes = [bytearray(plane_sz) for _ in range(nplanes)]
                for row in range(h):
                    for p in range(nplanes):
                        o = (row * nplanes + p) * wb
                        planes[p][row * wb:(row + 1) * wb] = dec[o:o + wb]
                px = _planes_to_chunky(planes, h, wb)
            else:
                # 4-plane era: CHUNKY 4bpp, high nibble = left pixel (the one
                # non-planar method; verified CoAB PIC + Secret BIGPIC)
                w = wb * 8
                px = bytearray(w * h)
                for y in range(h):
                    row = y * (w >> 1)
                    for x in range(w):
                        b = dec[row + (x >> 1)]
                        px[y * w + x] = (b >> 4) & 0xF if (x & 1) == 0 else b & 0xF
        elif variant == 3:                          # two-stream masked
            planes, mask = _decode_e3(body, h, wb, nplanes)
            px = _planes_to_chunky(planes, h, wb, mask)
        else:                                       # 0x19 id-list, ...
            return None
    except (IndexError, struct.error):
        return None
    return wb * 8, h, px, dm


def indices_to_rgb(px, width, height, pal):
    img = bytearray(width * height * 3)
    o = 0
    for idx in px:
        r, g, b = pal[idx] if pal and idx < 256 else (idx, idx, idx)
        img[o] = r; img[o + 1] = g; img[o + 2] = b
        o += 3
    return img


# --------------------------------------------------------------------------- #
# Leaf / master walking (mirrors hlib_decode)
# --------------------------------------------------------------------------- #
def iter_leaf_regions(full: bytes, hdr):
    """Yield (member_index, start, end) for the members of a decompressed
    leaf, skipping the id table when present."""
    ptrs = hdr["ptrs"]
    first = 1 if hdr["magic"] == 1 else 0
    for i in range(first, len(ptrs) - 1):
        yield i, ptrs[i], ptrs[i + 1]


def iter_leaf_images(full: bytes, hdr, fallback_pal):
    """Yield (member_index, start, end, palette) for image members of a
    decompressed leaf TILE (colour-table members are absorbed into `palette`)."""
    pal = fallback_pal
    for i, s, e in iter_leaf_regions(full, hdr):
        p = read_palette(full, s, e - s, base=pal)
        if p is not None:
            pal = p
            continue
        yield i, s, e, pal


def walk(data: bytes, skipped=None, fallback_pal=None):
    """Generator of (label, width, height, indices, palette, drawmethod) over
    a whole GLIB file (raw on-disk bytes; decompression handled internally).
    Unknown-format image members are appended to `skipped` (label, dm, size).
    `fallback_pal` overrides the EGA stand-in for 4-plane sets that carry no
    colour table (e.g. the game-global ALWAYS.TLB palette)."""
    hdr = read_header(data, 0)
    if hdr["tag"] in (b"GLIB", b"HLIB"):    # master ("HLIB" tag = CoAB-era)
        first = 1 if hdr["magic"] == 1 else 0
        for si in range(first, len(hdr["ptrs"]) - 1):
            set_base = hdr["ptrs"][si]
            if data[set_base:set_base + 4] != b"GLIB":
                continue
            full = load_container(data, set_base)
            sub = read_header(full, 0)
            fallback = (fallback_pal or EGA16_PAL) if _set_is_4plane(full, sub) else None
            for i, s, e, pal in iter_leaf_images(full, sub, fallback):
                r = decode_image(full, s, e)
                if r:
                    w, h, px, dm = r
                    yield f"set{si:02d}_img{i:03d}", w, h, px, pal, dm
                elif skipped is not None and e - s >= 8:
                    skipped.append((f"set{si:02d}_img{i:03d}", full[s + 7], e - s))
    elif hdr["tag"] == b"TILE":
        full = load_container(data, 0)
        hdr = read_header(full, 0)
        fallback = (fallback_pal or EGA16_PAL) if _set_is_4plane(full, hdr) else None
        for i, s, e, pal in iter_leaf_images(full, hdr, fallback):
            r = decode_image(full, s, e)
            if r:
                w, h, px, dm = r
                yield f"img{i:03d}", w, h, px, pal, dm
            elif skipped is not None and e - s >= 8:
                skipped.append((f"img{i:03d}", full[s + 7], e - s))
    else:
        raise ValueError(f"unknown/non-image tag {hdr['tag']!r}")


def first_palette_in_file(data: bytes):
    """Return the first colour table found in a GLIB file (any leaf), or None.
    Used to source a game-global palette (e.g. CoAB/Secret ALWAYS.TLB)."""
    hdr = read_header(data, 0)
    bases = []
    if hdr["tag"] in (b"GLIB", b"HLIB"):
        first = 1 if hdr["magic"] == 1 else 0
        bases = [p for p in hdr["ptrs"][first:-1] if data[p:p + 4] == b"GLIB"]
    elif hdr["tag"] == b"TILE":
        bases = [0]
    for base in bases:
        full = load_container(data, base)
        sub = read_header(full, 0)
        for _i, s, e in iter_leaf_regions(full, sub):
            p = read_palette(full, s, e - s)
            if p is not None and e - s > 8:     # skip header-only empties
                return p
    return None


def _set_is_4plane(full: bytes, hdr) -> bool:
    """True when every recognisable image in the leaf uses a low (4-plane)
    drawing method."""
    for _i, s, e in iter_leaf_regions(full, hdr):
        if e - s >= 8 and read_palette(full, s, e - s) is None:
            dm = full[s + 7]
            if dm >= 0xE0:
                return False
            if dm in (0, 1, 2, 3, 0xD2):
                return True
    return False


# --------------------------------------------------------------------------- #
# PNG output (identical to hlib_decode)
# --------------------------------------------------------------------------- #
def write_png(path: Path, width, height, rgb, scale=1):
    try:
        from PIL import Image                     # noqa: F401  (optional)
        img = Image.frombytes("RGB", (width, height), bytes(rgb))
        if scale > 1:
            img = img.resize((width * scale, height * scale), Image.NEAREST)
        img.save(path)
        return
    except ImportError:
        pass
    if scale > 1:
        s = bytearray()
        for y in range(height):
            row = bytearray()
            for x in range(width):
                row += rgb[(y * width + x) * 3:(y * width + x) * 3 + 3] * scale
            s += row * scale
        rgb, width, height = s, width * scale, height * scale
    _write_png_raw(path, width, height, rgb)


def _write_png_raw(path: Path, width, height, rgb):
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
    ap = argparse.ArgumentParser(
        description="Decode/render SSI Gold Box Amiga .TLB/.GLB (GLIB)")
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--list", action="store_true", help="list images only")
    ap.add_argument("--extract", action="store_true",
                    help="dump raw (decompressed) members instead of PNGs")
    ap.add_argument("--pal", type=Path, default=None, metavar="GLIBFILE",
                    help="use the first colour table in this GLIB file as the "
                         "fallback palette for 4-plane sets without their own "
                         "(e.g. the game's ALWAYS.TLB)")
    args = ap.parse_args()

    data = args.file.read_bytes()
    out_dir = args.out or (Path("renders") / "glib" / args.file.stem)

    try:
        hdr = read_header(data, 0)
        # The pointer table of a compressed file is itself compressed; check
        # the EOF pointer against the decompressed image.
        chk = read_header(load_container(data, 0), 0) if hdr["method"] else hdr
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)

    eof_ok = chk["ptrs"][-1] in (chk["fsize"], chk["fsize"] - 1)
    print(f"{args.file}  ({len(data)} bytes)  tag={hdr['tag'].decode(errors='replace')} "
          f"method={hdr['method']} magic={hdr['magic']} pointers={chk['count']} "
          f"EOF_ok={eof_ok}")

    if hdr["tag"] not in (b"TILE", b"GLIB", b"HLIB"):
        # DATA / DIG8 / TEXT libraries: same container, non-image members.
        full = load_container(data, 0)
        h2 = read_header(full, 0)
        print(f"  non-image library (member tag {hdr['tag']!r}); "
              f"{h2['count'] - 1} members.")
        if args.extract:
            out_dir.mkdir(parents=True, exist_ok=True)
            for i, s, e in iter_leaf_regions(full, h2):
                (out_dir / f"{args.file.stem}_{i:03d}.bin").write_bytes(full[s:e])
            print(f"  -> members dumped to {out_dir}")
        return

    fallback_pal = None
    if args.pal:
        fallback_pal = first_palette_in_file(args.pal.read_bytes())
        if fallback_pal is None:
            print(f"WARNING: no colour table found in {args.pal}", file=sys.stderr)

    rendered = 0
    skipped = []
    for label, w, h, px, pal, dm in walk(data, skipped, fallback_pal):
        idxmax = max(px) if px else 0
        print(f"  {label}: {w}x{h} method={dm:#04x} maxidx={idxmax}")
        if not args.list and not args.extract:
            out_dir.mkdir(parents=True, exist_ok=True)
            rgb = indices_to_rgb(px, w, h, pal)
            write_png(out_dir / f"{args.file.stem}_{label}.png", w, h, rgb,
                      scale=args.scale)
            rendered += 1
    for label, dm, size in skipped:
        print(f"  {label}: SKIPPED method={dm:#04x} ({size} bytes)")
    if rendered:
        print(f"  -> PNGs written: {rendered}")
        print(f"  output: {out_dir}")


if __name__ == "__main__":
    main()
