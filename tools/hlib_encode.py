#!/usr/bin/env python3
"""
hlib_encode.py - WRITER / repacker for SSI Gold Box DOS "HLIB" / DataLib
                 graphics containers (The Dark Queen of Krynn, .TLB / .GLB).

This is the inverse of tools/hlib_decode.py and the project's REBUILD-TARGET
packer: the rebuilt DOS executables ship HLIB containers, so this is the tool
that emits valid DQK .TLB/.GLB files (ASCII 'HLIB' magic + typed sub-chunks:
TILE graphics frames WITH embedded VGA palette, and DATA/generic regions).

The HLIB container is a header + a pointer table + a run of contiguous regions
(no padding/alignment between them -- verified: first region pointer always
equals 16 + count*4, and every region abuts the next). That makes the layout
fully deterministic from the region byte-lengths, so a structural repack is
byte-exact.

Two layers are provided:

  1. CONTAINER WRITER  (build_container) -- low level.
     Given magic, tag ('TILE' or 'HLIB'), and an ordered list of raw region
     byte-blobs, emits:
        off 0   'HLIB'
        off 4   DWORD  file size
        off 8   WORD   (#pointers) - 1               (the stored count-1 quirk)
        off 10  BYTE   0
        off 11  BYTE   magic
        off 12  tag (4 bytes)
        off 16  DWORD[count]  pointers; ptr[i] = absolute offset of region i,
                              ptr[-1] = file size (EOF sentinel).
     #pointers == len(regions)+1 (one per region plus the EOF sentinel).

  2. TILE / palette / image ENCODERS (the inverse of hlib_decode.decode_image
     and read_palette): turn a decoded (palette, frames) description back into
     region blobs, re-applying Chain-4 interleave and method 16/17/18/21/23
     encoding, then hand them to build_container.

REPACK (structural, byte-exact) -- parse_container / repack:
     Read a real .TLB, capture each region's RAW bytes, and re-emit. Because
     regions are contiguous the result is byte-identical to the original. This
     is the strongest writer proof: it shows our header/pointer-table emission
     is exactly what the game shipped.

Verification lives in scratchpad/hlib_roundtrip.py (decode->encode->decode and
byte-compare; plus a CCHLIB /D cross-check).
"""
from __future__ import annotations
import struct
from pathlib import Path


# --------------------------------------------------------------------------- #
# 1. Low-level container writer
# --------------------------------------------------------------------------- #
def build_container(magic: int, tag: bytes, regions: list[bytes]) -> bytes:
    """Assemble an HLIB container from ordered raw region blobs.

    magic   : 0 (no id table) or 1 (id/set table is regions[0]).
    tag     : b'TILE' (leaf) or b'HLIB' (master).  4 bytes.
    regions : ordered list of the bytes pointed to by ptr[0], ptr[1], ...
              (id table, palette, images, ... -- caller decides order/meaning).

    Returns the full container bytes.  Pointer list has len(regions)+1 entries
    (regions + EOF sentinel); stored count word = len(ptrs)-1.
    """
    if len(tag) != 4:
        raise ValueError("tag must be exactly 4 bytes")
    nptr = len(regions) + 1                 # +1 for the EOF sentinel
    header_len = 16 + 4 * nptr
    # compute absolute pointer for each region (contiguous, no padding)
    ptrs = []
    off = header_len
    for r in regions:
        ptrs.append(off)
        off += len(r)
    fsize = off                             # end of last region == file size
    ptrs.append(fsize)                      # EOF sentinel

    out = bytearray()
    out += b"HLIB"
    out += struct.pack("<I", fsize)
    out += struct.pack("<H", nptr - 1)      # stored count-1 quirk
    out += bytes([0])                       # off 10 unused
    out += bytes([magic & 0xFF])            # off 11 magic
    out += tag                              # off 12 tag
    for p in ptrs:
        out += struct.pack("<I", p)
    for r in regions:
        out += r
    assert len(out) == fsize, (len(out), fsize)
    return bytes(out)


# --------------------------------------------------------------------------- #
# 2a. Palette (colour table) encoder  -- inverse of hlib_decode.read_palette
# --------------------------------------------------------------------------- #
def build_palette_region(pal, first_col: int, ncolors: int,
                         cycle: int = 0, nranges: int = 0, cmagic: int = 24,
                         cycle_bytes: bytes = b"") -> bytes:
    """Emit a colour-table region.

    pal      : list of (r,g,b) 256 entries (8-bit each), as produced by decode.
    first_col: palette index of the first stored colour.
    ncolors  : number of colours stored (pal[first_col .. first_col+ncolors-1]).
    cycle/nranges/cmagic/cycle_bytes: header fields + trailing cycle range data
               to reproduce (use cycle_bytes verbatim for a byte-exact repack).
    """
    out = bytearray()
    out += struct.pack("<HHH", cycle, first_col, ncolors)
    out += bytes([nranges & 0xFF, cmagic & 0xFF])
    for c in range(ncolors):
        r, g, b = pal[first_col + c]
        out += bytes([r & 0xFF, g & 0xFF, b & 0xFF])
    out += cycle_bytes
    return bytes(out)


# --------------------------------------------------------------------------- #
# 2b. Chain-4 interleave (forward) + image encoders
#     -- inverse of hlib_decode.decode_image
# --------------------------------------------------------------------------- #
def _chain4_rows(px, width, height):
    """Yield, per row, the Chain-4 *stream* order of indices:
    sweep0 cols 0,4,8.. then sweep1 1,5,9.. -- i.e. body byte order for a row.
    `order[col]` in the decoder == (col%q)*4 + (col//q).  We invert: stream
    position k (0..width-1) -> screen x = (k%q)*4 + (k//q)."""
    q = width // 4
    for y in range(height):
        row = []
        for s in range(4):
            for i in range(q):
                x = i * 4 + s
                row.append(px[y * width + x])
        yield row                            # length == width


def encode_image_16(px, width, height, voff=0, hoff=0, transparent=False):
    """Method 16 (opaque) / 21 (transparent) -- uncompressed, Chain-4 order."""
    method = 21 if transparent else 16
    out = bytearray(struct.pack("<HHHBB", height, voff & 0xFFFF, hoff & 0xFFFF,
                                width // 4, method))
    for row in _chain4_rows(px, width, height):
        out += bytes(row)
    return bytes(out)


def _rle18_row(row):
    """Encode one row (Chain-4 stream, len=width) with method-18 RLE.
    Control c<128 => copy c+1 literals; c>=128 => repeat next byte 257-c times.
    Mirror the decoder exactly so re-decode is identical.  This produces a
    canonical (greedy: runs of length>=2 become a repeat, max 128 per token)
    encoding; it need not match the game's encoder bit-for-bit, only round-trip.
    """
    out = bytearray()
    n = len(row)
    i = 0
    while i < n:
        # length of the run of identical bytes starting at i
        run = 1
        while i + run < n and row[i + run] == row[i] and run < 128:
            run += 1
        if run >= 2:
            # repeat token: c = 257 - run  (run in 2..128 -> c in 255..129)
            c = 257 - run
            out.append(c & 0xFF)
            out.append(row[i])
            i += run
        else:
            # gather a literal span until a >=2 run appears (or 128 literals)
            j = i
            lit = bytearray()
            while j < n and len(lit) < 128:
                # stop if a run of >=2 begins at j (worth a repeat token)
                if j + 1 < n and row[j + 1] == row[j]:
                    break
                lit.append(row[j])
                j += 1
            out.append((len(lit) - 1) & 0xFF)   # c = count-1
            out += lit
            i = j
    return out


def encode_image_18(px, width, height, voff=0, hoff=0):
    """Method 18 -- compressed opaque, one RLE stream per Chain-4 row."""
    out = bytearray(struct.pack("<HHHBB", height, voff & 0xFFFF, hoff & 0xFFFF,
                                width // 4, 18))
    for row in _chain4_rows(px, width, height):
        out += _rle18_row(row)
    return bytes(out)


def encode_image_23(px, width, height, voff=0, hoff=0, key=255):
    """Method 23 -- compressed transparent. 4 image sweeps; per row: 0 ends row,
    c<128 copy c literals, c>=128 skip (256-c) transparent.  `key` is the
    transparent index (255)."""
    out = bytearray(struct.pack("<HHHBB", height, voff & 0xFFFF, hoff & 0xFFFF,
                                width // 4, 23))
    q = width // 4
    for s in range(4):
        for y in range(height):
            # this sweep's columns left->right
            cols = [px[y * width + (i * 4 + s)] for i in range(q)]
            col = 0
            while col < q:
                if cols[col] == key:
                    # transparent run -> skip token c = 256 - skip (skip 1..128)
                    run = 1
                    while col + run < q and cols[col + run] == key and run < 128:
                        run += 1
                    out.append((256 - run) & 0xFF)
                    col += run
                else:
                    # literal run of visible pixels (1..127 per token)
                    lit = bytearray()
                    while col < q and cols[col] != key and len(lit) < 127:
                        lit.append(cols[col])
                        col += 1
                    out.append(len(lit) & 0xFF)
                    out += lit
            out.append(0)                    # end-of-row
    return bytes(out)


# --------------------------------------------------------------------------- #
# 3. Structural repack (byte-exact) -- parse a real container, re-emit it.
# --------------------------------------------------------------------------- #
def parse_container(data: bytes):
    """Return (magic, tag, regions) where regions are the RAW byte-spans
    [ptr[i], ptr[i+1]).  Reproducing them with build_container is byte-exact
    for any well-formed HLIB (leaf or master -- master sub-files ride along
    inside their region blobs untouched)."""
    if data[:4] != b"HLIB":
        raise ValueError("not an HLIB container")
    count = struct.unpack_from("<H", data, 8)[0] + 1
    magic = data[11]
    tag = data[12:16]
    ptrs = [struct.unpack_from("<I", data, 16 + 4 * i)[0] for i in range(count)]
    regions = [data[ptrs[i]:ptrs[i + 1]] for i in range(count - 1)]
    return magic, tag, regions


def repack(data: bytes) -> bytes:
    """Decode -> re-encode a container structurally; byte-exact for valid HLIB."""
    magic, tag, regions = parse_container(data)
    return build_container(magic, tag, regions)


# --------------------------------------------------------------------------- #
# CLI: structural repack self-test on a real file.
# --------------------------------------------------------------------------- #
def main():
    import argparse
    ap = argparse.ArgumentParser(description="HLIB writer / repacker (DQK .TLB/.GLB)")
    ap.add_argument("file", type=Path, help="a real .TLB/.GLB to repack-verify")
    ap.add_argument("--out", type=Path, default=None, help="write repacked copy here")
    args = ap.parse_args()
    data = args.file.read_bytes()
    out = repack(data)
    same = out == data
    print(f"{args.file.name}: {len(data)} bytes -> repack {len(out)} bytes "
          f"BYTE-IDENTICAL={same}")
    if args.out:
        args.out.write_bytes(out)
        print(f"  wrote {args.out}")
    raise SystemExit(0 if same else 1)


if __name__ == "__main__":
    main()
