#!/usr/bin/env python3
"""
hlib_decode.py - Decoder/renderer for SSI Gold Box DOS "HLIB" / DataLib graphics
                 containers (The Dark Queen of Krynn, .TLB / .GLB).

DQK is VGA 256-color, 8 bits-per-pixel (1 byte = 1 palette index). This is the
DataLib/FRUA-lineage container documented in hackdocs_extracted/TLBFORM.TXT,
DRAW18.TXT, DRAW23.TXT, UAPALETT.TXT -- verified empirically against the bytes.

Contrast with the two sibling formats (see docs/dax-format.md / daa-format.md):
  DAX (DOS CoK/DoK)  : little-endian, headerless TOC {id,off,raw,comp}, signed-byte
                       RLE, 4bpp chunky EGA, fixed 16-color palette (none in file).
  DAA (Amiga)        : big-endian, same TOC idea, signed-byte RLE, 5-plane PLANAR
                       32-color, 12-bit Amiga palette in each frame.
  HLIB (DOS DQK)     : little-endian, *pointer-table* directory (not a sized TOC),
                       8bpp chunky 256-color, an 8-bit RGB palette in a colour table,
                       Chain-4 interleaved pixels, per-row PCX-style compression.

CONTAINER (little-endian)
  off 0  ASCII "HLIB"
  off 4  DWORD file size
  off 8  WORD  number of pointers in the file  (this count ALREADY INCLUDES the
               trailing EOF pointer; the stored value is count-1)
  off 10 BYTE  unused
  off 11 BYTE  magic (0 = no image-id table, 1 = table present)
  off 12 ASCII tag: "TILE" => a leaf tile library; "HLIB" => a MASTER library
  off 16 DWORD[count] pointer list. The last pointer == file size (EOF).

  LEAF (tag "TILE"): the pointers locate, in order:
    - if magic==1: ptr[0] -> image-id table, ptr[1] -> colour table, ptr[2..] images
    - if magic==0: ptr[0] -> colour table (or first image for cpic combat icons),
                   ptr[1..] -> images
    Each image runs from its pointer to the next pointer (EOF for the last).

  MASTER (tag "HLIB"): ptr[0] -> set-id table, ptr[1..] -> "sets". Each set is a
    complete, self-contained leaf HLIB/TILE file whose own pointers are relative
    to the start of that set. (BIGPIC, TITLE, 8X8DB, SPRIT, BACK ... are masters.)

COLOUR TABLE (8-byte header, then RGB triplets)  -- field names per DQK.EXE:0x01a296
  WORD flags      bit0 = record declares its own first_col/ncolors
                  bit1 = nranges range records follow the RGB block
                  bit2 = a ceil(ncolors/2)-byte EGA-16 nibble block follows
  WORD first_col  (index of first palette entry stored)
  WORD ncolors    (0..256; 0 => install nothing, inherit -- e.g. TOPVIEW)
  BYTE nranges    (ignored, and forced to 0, unless flags bit1 is set)
  BYTE type       low nibble 8 == colour table; full byte is 24 in every DOS record
  then ncolors * 3 bytes: R,G,B each 0..255 (FULL 8-bit in the file -- verified; the
       engine stores byte>>2 for its 6-bit DAC, so DOS drops the low two bits)
  then nranges * 4 bytes {key0, key1, first_col, count} -- palette-slot registrations,
       not (as hackdocs guesses) {dir, speed, start, count}. Skipped here.
  then the bit2 EGA-16 block, then 0..1 pad bytes to an even length. Skipped here.
  This layout accounts for the length of 438 of 438 DOS colour tables. See
  docs/hlib-format.md sections 2, 2c and 2d; nothing in DQK's palette path reads the
  EGA block, and its consumer has not been found.

IMAGE (8-byte header, then pixel data)
  WORD height
  WORD vertical offset   (signed; placement hint, ignored for rendering)
  WORD horizontal offset (signed; placement hint, ignored for rendering)
  BYTE width / 4         (actual width = this * 4)
  BYTE drawing method

PIXELS are stored Chain-4 interleaved: the image is swept in 4 passes, pass p
emitting screen columns p, p+4, p+8, ... So byte k of the *logical* (deinterlaced)
stream maps to screen x = (k // (width/4)) within the row's quarter... concretely
we reconstruct a left-to-right row by interleaving the 4 quarter-rows.

DRAWING METHODS
  16 uncompressed, opaque              21 uncompressed, transparent (idx 255 skipped)
  17 uncompressed, AND-mask+OR-mask    23 compressed, transparent
  18 compressed, opaque (per-row, PCX/LBM-style)
  Methods 18/23 compress each *quarter-sweep*: control c<128 => copy c+1 literals;
  c>=128 => for 18, repeat next byte 257-c times; for 23, c==0 ends the row and
  c>=128 skips (257-c)*1 transparent pixels.
"""
from __future__ import annotations
import argparse, struct, sys
from pathlib import Path


# --------------------------------------------------------------------------- #
# Low-level container parsing
# --------------------------------------------------------------------------- #
def read_header(data: bytes, base: int = 0):
    """Return dict with sig, fsize, count, magic, tag, ptrs (absolute offsets)."""
    sig = data[base:base + 4]
    if sig != b"HLIB":
        raise ValueError(f"bad signature {sig!r} at {base}; not an HLIB container")
    fsize = struct.unpack_from("<I", data, base + 4)[0]
    count = struct.unpack_from("<H", data, base + 8)[0] + 1  # includes EOF ptr
    magic = data[base + 11]
    tag = data[base + 12:base + 16]
    ptrs = [struct.unpack_from("<I", data, base + 16 + 4 * i)[0] for i in range(count)]
    return {"sig": sig, "fsize": fsize, "count": count, "magic": magic,
            "tag": tag, "ptrs": ptrs, "base": base}


def read_palette(data: bytes, off: int):
    """Parse a colour table at absolute offset `off`.
    Returns (palette_list_of_256_rgb, ncolors, first_col) or (None, 0, 0)."""
    cycle, first, ncol = struct.unpack_from("<HHH", data, off)
    # nranges = data[off + 6]; cmagic = data[off + 7]
    if ncol == 0:
        return None, 0, 0
    pal = [(0, 0, 0)] * 256
    p = off + 8
    for c in range(ncol):
        r, g, b = data[p], data[p + 1], data[p + 2]
        idx = first + c
        if 0 <= idx < 256:
            pal[idx] = (r, g, b)
        p += 3
    return pal, ncol, first


# --------------------------------------------------------------------------- #
# Chain-4 deinterlace + drawing methods -> 8bpp index buffer
# --------------------------------------------------------------------------- #
def decode_image(data: bytes, start: int, end: int):
    """Decode one image (header at `start`, bytes up to `end`).
    Returns (width, height, indices[bytearray width*height], drawmethod,
    x_offset, y_offset) or None. The file stores signed offsets with inverse screen-space sign.
    255 is the transparent index; opaque output uses 255 where untouched too."""
    if end - start < 8:
        return None
    height, voff, hoff = struct.unpack_from("<Hhh", data, start)
    x_offset, y_offset = -hoff, -voff
    w4 = data[start + 6]
    dm = data[start + 7]
    width = w4 * 4
    if width == 0 or height == 0 or width > 4096 or height > 2048:
        return None
    body = data[start + 8:end]
    # transparent default so methods 21/23 leave a clean key colour (255)
    px = bytearray([255]) * (width * height)
    q = width // 4            # quarter width (pixels per sweep per row)

    if dm in (16, 21):        # uncompressed (opaque/transparent identical layout)
        # data is height rows, each row = 4 quarter-sweeps of q bytes,
        # quarter s contributes columns s, s+4, s+8 ...
        need = width * height
        if len(body) < need:
            return None
        k = 0
        for y in range(height):
            for s in range(4):
                for i in range(q):
                    x = i * 4 + s
                    px[y * width + x] = body[k]; k += 1
        return width, height, px, dm, x_offset, y_offset

    if dm == 17:              # AND mask then XOR pixels, uncompressed
        # dst = (mask & dst) ^ pixels (DQK.EXE 0x00342a). First plane is the mask, 0x00/0xFF only
        # (34 of 34 members); mask 0xFF implies pixel 0 in 8284 of 8284 positions. Transparency
        # is NOT recoverable from the pixel plane -- 1201 of 5276 opaque positions hold index 0
        # legitimately -- so the mask must be applied here. 255 is unambiguous as the key: no
        # opaque position holds 0xFF. See docs/hlib-format.md section 5c.
        need = width * height
        if len(body) < 2 * need:
            return None
        andmask = body[:need]
        ormask = body[need:2 * need]
        k = 0
        for y in range(height):
            for s in range(4):
                for i in range(q):
                    x = i * 4 + s
                    px[y * width + x] = 255 if andmask[k] == 0xFF else ormask[k]
                    k += 1
        return width, height, px, dm, x_offset, y_offset

    # column-visit order within a row, Chain-4: sweep0 cols 0,4,8.. then sweep1 1,5,9.. etc
    order = [i * 4 + s for s in range(4) for i in range(q)]   # length == width

    if dm == 18:              # compressed opaque; runs span the whole row (4 sweeps)
        pos = 0
        n = len(body)
        for y in range(height):
            col = 0                       # index into `order` (0..width-1)
            while col < width and pos < n:
                c = body[pos]; pos += 1
                if c < 128:               # literal run of c+1
                    cnt = c + 1
                    for _ in range(cnt):
                        if col < width and pos < n:
                            px[y * width + order[col]] = body[pos]; pos += 1; col += 1
                else:                     # repeat next byte 257-c times
                    cnt = 257 - c
                    val = body[pos] if pos < n else 0; pos += 1
                    for _ in range(cnt):
                        if col < width:
                            px[y * width + order[col]] = val; col += 1
        return width, height, px, dm, x_offset, y_offset

    if dm == 23:              # compressed transparent: 4 image sweeps; 0 ends a row
        pos = 0
        n = len(body)
        for s in range(4):
            sweep_cols = [i * 4 + s for i in range(q)]   # this sweep's columns L->R
            for y in range(height):
                col = 0
                while pos < n:
                    c = body[pos]; pos += 1
                    if c == 0:            # end of this row
                        break
                    if c >= 128:          # skip (256-c) transparent pixels
                        col += (256 - c)
                    else:                 # copy c literal pixels
                        for _ in range(c):
                            if pos < n and col < q:
                                px[y * width + sweep_cols[col]] = body[pos]
                            pos += 1; col += 1
        return width, height, px, dm, x_offset, y_offset

    return None               # method 25 (image-id list) and unknowns: skip


def indices_to_rgb(px, width, height, pal):
    img = bytearray(width * height * 3)
    o = 0
    for idx in px:
        r, g, b = pal[idx] if pal and idx < 256 else (idx, idx, idx)
        img[o] = r; img[o + 1] = g; img[o + 2] = b; o += 3
    return img


# --------------------------------------------------------------------------- #
# Leaf / master walking
# --------------------------------------------------------------------------- #
def iter_leaf_images(data, base, hdr, fallback_pal):
    """Yield (img_index, start, end, palette) for each image in a leaf TILE.
    `base` is the absolute offset of this leaf; leaf pointers are relative to it."""
    ptrs = [base + p for p in hdr["ptrs"]]   # make absolute
    magic = hdr["magic"]
    # locate colour table + first image index in the pointer list
    pal = fallback_pal
    if magic == 1:
        # ptr[0] = image-id table, ptr[1] = colour table, ptr[2..] images
        first_img = 2
        if len(ptrs) > 2:
            p, ncol, _ = read_palette(data, ptrs[1])
            if p:
                pal = p
    else:
        # ptr[0] = colour table (or first image if cpic). Detect: try palette.
        first_img = 1
        p, ncol, _ = read_palette(data, ptrs[0])
        if p:
            pal = p
        else:
            # no palette stored here (cpic combat icons / topview) -> ptr[0] is image
            first_img = 0
    # images run ptr[first_img] .. EOF (last pointer)
    for i in range(first_img, len(ptrs) - 1):
        yield i, ptrs[i], ptrs[i + 1], pal


def walk(data, base=0, fallback_pal=None):
    """Generator of (label, width, height, indices, palette, drawmethod, x, y)."""
    hdr = read_header(data, base)
    if hdr["tag"] == b"HLIB":          # master: ptr[0]=setid table, ptr[1..]=sets
        ptrs = [base + p for p in hdr["ptrs"]]
        # sets run ptr[1] .. EOF
        for si in range(1, len(ptrs) - 1):
            set_base = ptrs[si]
            sub = read_header(data, set_base)
            for img_i, s, e, pal in iter_leaf_images(data, set_base, sub, fallback_pal):
                r = decode_image(data, s, e)
                if r:
                    w, h, px, dm, x, y = r
                    yield f"set{si:02d}_img{img_i:03d}", w, h, px, pal, dm, x, y
    elif hdr["tag"] == b"TILE":
        for img_i, s, e, pal in iter_leaf_images(data, base, hdr, fallback_pal):
            r = decode_image(data, s, e)
            if r:
                w, h, px, dm, x, y = r
                yield f"img{img_i:03d}", w, h, px, pal, dm, x, y
    else:
        raise ValueError(f"unknown tag {hdr['tag']!r}")


# --------------------------------------------------------------------------- #
# PNG output
# --------------------------------------------------------------------------- #
def write_png(path: Path, width, height, rgb, scale=1):
    try:
        from PIL import Image
    except ImportError:
        _write_png_raw(path, width, height, rgb); return
    im = Image.frombytes("RGB", (width, height), bytes(rgb))
    if scale != 1:
        im = im.resize((width * scale, height * scale), Image.NEAREST)
    im.save(path)


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
DEFAULT_VGA = [(0, 0, 0)] * 256   # last-resort grayscale handled in indices_to_rgb


def main():
    ap = argparse.ArgumentParser(description="Decode/render SSI Gold Box DQK .TLB/.GLB (HLIB)")
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--list", action="store_true", help="list images only")
    args = ap.parse_args()

    data = args.file.read_bytes()
    out_dir = args.out or (Path("renders") / "hlib" / args.file.stem)

    try:
        hdr = read_header(data, 0)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr); sys.exit(2)

    print(f"{args.file}  ({len(data)} bytes)  tag={hdr['tag'].decode(errors='replace')} "
          f"magic={hdr['magic']} pointers={hdr['count']} EOF_ok={hdr['ptrs'][-1]==hdr['fsize']}")

    if hdr["tag"] not in (b"TILE", b"HLIB"):
        # .GLB sound/data libraries (DIG4 / DATA): same container, non-image members.
        print(f"  non-image library (member tag {hdr['tag']!r}); "
              f"{hdr['count'] - 1} members. Image rendering not applicable.")
        return

    rendered = 0
    last_pal = None
    for label, w, h, px, pal, dm, x, y in walk(data):
        pal = pal or last_pal
        last_pal = pal or last_pal
        idxmax = max(px) if px else 0
        print(f"  {label}: {w}x{h} at ({x},{y}) method={dm} maxidx={idxmax}")
        if not args.list:
            out_dir.mkdir(parents=True, exist_ok=True)
            rgb = indices_to_rgb(px, w, h, pal)
            write_png(out_dir / f"{args.file.stem}_{label}.png", w, h, rgb, scale=args.scale)
            rendered += 1
    print(f"  -> PNGs written: {rendered}")
    if rendered:
        print(f"  output: {out_dir}")


if __name__ == "__main__":
    main()
