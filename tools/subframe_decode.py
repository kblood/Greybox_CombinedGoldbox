#!/usr/bin/env python3
"""
subframe_decode.py - Decoder for the SSI Gold Box multi-sub-frame "animation
                     array" graphics used by SPRIT*, PIC* and big HEAD* blocks
                     (Champions of Krynn / Death Knights of Krynn).

This is the variant the older decoders (tools/dax_decode.py, tools/daa_decode.py)
detected but skipped as "complex / 6-byte sub-frame index (unsolved)". This tool
solves the DOS .DAX side completely and characterizes the Amiga .DAA side.

Reuses the container + RLE helpers from dax_decode / daa_decode.

================================================================================
DOS .DAX  (SOLVED, verified: 163/163 SPRIT/PIC blocks parse exactly; pixels
           render as coherent sprites/portraits)
================================================================================
A SPRIT/PIC/big-HEAD block lives in a normal 9-byte-TOC .DAX container. After
RLE decompression the block is an *animation array* (this is exactly how the
COAB DOS-engine decompile loads it -- coab_extracted/engine/ovr030.cs, the
"daxArray" loader, the Rosetta Stone for this format):

  offset 0 : uint8  numFrames
  then, repeated numFrames times, a per-frame record:
     +0   int32   delay        (animation delay, 1/10 s; 0 for static pics)
     +4   uint16  height       (pixels, little-endian)
     +6   uint16  width_div8   (width in pixels = width_div8 * 8, little-endian)
     +8   uint16  x_pos        (placement offset)
     +10  uint16  y_pos        (placement offset)
     +12  1 byte  pad          (the engine does y_pos read then src += 3, i.e.
                                a 1-byte pad follows the 2-byte y_pos)
     +13  8 bytes field_9      (EGA-plane / editor metadata; ignored for render)
     +21  pixels: height * width_div8 * 4 bytes
            chunky 4 bits-per-pixel, 2 px/byte, HIGH nibble = left pixel.
            (Per row: width_div8*4 bytes -> width_div8*8 = width pixels.)

  A "complex"/skipped frame in the old decoder is exactly this: width_div8 is
  stored at offset 6 of the WHOLE block only for the FIRST frame's header inside
  the array; the block's own first two bytes are numFrames(+pad), so the old
  single-frame parser saw width_div8 == 0 and bailed.

Frames are the classic Gold Box zoom levels: e.g. a CoK monster SPRIT has 3
frames ~ (56x80, 32x65, 24x57). A DoK PIC encounter picture is usually 1 frame
of 88x88.

Transparency: index used as the mask key is the picture's mask color (the COAB
loader passes masked=1 and recolors that index to a transparent sentinel). For
plain rendering we keep all 16 EGA indices; pass --mask N to paint index N as
transparent (checkerboard) in the PNG. Empirically the magenta-ish index is the
background for CoK sprites.

PIC XOR-delta (multi-frame PIC/FINAL only): when numFrames > 1 for a file named
PIC*/FINAL*, frame 0's pixel bytes are stored verbatim and each later frame's
pixel bytes are XORed against frame 0 (delta animation). The engine does this in
ovr030.cs (first_frame_ega_layout XOR). SPRIT frames are NOT delta-coded.

================================================================================
Amiga .DAA  (SOLVED 2026-06-25 by disassembling the Amiga 68000 'game' binary;
             see docs/engine/research/subframe-format.md for the routine cites)
================================================================================
Only the true 6-byte-index files use this codec: SPRIT*, CoK pic1/pic2, DoK
PIC1/PIC2. The lookalike families comspr/COMSPR, CPIC*, and HEAD* are ordinary
9-byte-TOC standard-frame containers (their word0 is divisible by both 9 and 6;
routing is decided by the 9-byte chain validation in daa_decode.parse_container,
and this tool renders them via the standard-frame path). Verified 2026-07-18:
Amiga HEAD1.DAA ids 68/69 (88x40) match DOS HEAD2.DAX ids 68/69 scene-for-scene.

Amiga SPRIT*/PIC* .DAA 6-byte INDEX container layout:
  word0(BE) = 2 + n*6 = data_base
  n entries of 6 bytes: { uint8 id, uint8 0, uint32 sub_offset(BE) }
  Each indexed sub-block's bytes = data[data_base+sub_offset : next_sub_offset]
  (last entry runs to EOF). The sub-block is a SINGLE compressed stream.

The sub-block is compressed with the Amiga sprite RLE (decoder = hunk 88 of the
CoK Amiga 'game' executable, entry @ offset 12). It is a signed-byte run length
that differs slightly from the outer-container RLE:
    read control byte c:
      c <= 0x7f          : copy next (c + 1) literal bytes
      c == 0x80          : no-op (emit nothing)
      0x81 <= c <= 0xff  : repeat next single byte ((256 - c) + 1) times
The engine decompresses this stream in CONSECUTIVE SEGMENTS into one output:
  segment 1 = the header+palette (pix_off bytes)
  segment 2..(numFrames+1) = numFrames * (a full Amiga planar BitMap)
A single continuous decode position walks the whole sub-block.

Decompressed header (big-endian):
  +0  uint8   pix_off        (= 75 + 2*numFrames; size of the header segment)
  +1  uint16  height (BE)    (88 for PIC/SPRIT)
  +3  uint16  width_div8(BE) (11 -> 88 px)
  +5  uint16  x_pos (BE)
  +7  uint16  y_pos (BE)
  +9  uint8   flag           (0)
  +10 uint8   numFrames      (frame/zoom count: 1, 3, ... matches the DOS count)
  +11 64      palette        32 x BE uint16 0x0RGB (12-bit Amiga; channel*17)
  +75 ...     per-frame table (CoK: 2 bytes per frame, so pix_off = 75 + 2*nF;
              DoK uses a slightly different table size, so always trust pix_off
              for the pixel start and offset 10 for the frame count).

Each frame's pixel segment is a 5-plane CONTIGUOUS (non-interleaved),
word-aligned planar bitmap:
  row_bytes  = ceil(width/16)*2        (= 12 for width 88)
  plane_size = row_bytes * height       (= 1056 for 88x88)
  frame_size = plane_size * 5           (= 5280 for 88x88)
  pixel(x,y) index = sum_p  bit(plane[p], y*row_bytes + x/8, 7-(x&7)) << p
  (plane 0 = LSB, MSB-first within each byte, same convention as the standard
   .DAA frames and the 8X8D tile strips.)

VERIFIED: CoK PIC1.DAA id 60 decodes to the same treasure/grail scene as the
DOS PIC1.DAX id 60 (88x88), 0.93 background-match (the residual is the genuine
16- vs 32-colour art difference). SPRIT1.DAA decodes to 3-frame 88x88 sprite
arrays; every sub-block consumes its whole compressed stream (<=2 trailing
bytes). Index 0 is the transparent/background colour.
"""
from __future__ import annotations
import argparse, struct, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dax_decode as DAX   # 9-byte TOC container, RLE, EGA palette, PNG writer
import daa_decode as DAA   # big-endian container + RLE


# --------------------------------------------------------------------------- #
# DOS .DAX animation array (SOLVED)
# --------------------------------------------------------------------------- #
FRAME_HDR = 21  # delay(4) h(2) w8(2) x(2) y(2) pad(1) field_9(8)


def parse_anim_array(raw: bytes, is_pic: bool = False):
    """
    Parse a DOS SPRIT/PIC/HEAD animation-array block.
    Returns (frames, consumed) where frames is a list of dicts:
      {delay, height, width, width_div8, x, y, pixels(bytes)}  -- or None if the
    block is not a valid animation array (so callers can fall back to the
    standard-frame parser).

    For multi-frame PIC*/FINAL* blocks (is_pic=True), frames after frame 0 are
    XOR-delta against frame 0 and are un-deltaed here.
    """
    if len(raw) < 1 + FRAME_HDR:
        return None
    o = 0
    num_frames = raw[o]; o += 1
    if num_frames == 0 or num_frames > 16:
        return None
    frames = []
    first_pix = None
    for f in range(num_frames):
        if o + FRAME_HDR > len(raw):
            return None
        delay = struct.unpack_from("<i", raw, o)[0]; o += 4
        height = struct.unpack_from("<H", raw, o)[0]; o += 2
        width8 = struct.unpack_from("<H", raw, o)[0]; o += 2
        x = struct.unpack_from("<H", raw, o)[0]; o += 2
        y = struct.unpack_from("<H", raw, o)[0]; o += 3   # +2 for y, +1 pad
        o += 8                                             # field_9
        if height == 0 or width8 == 0 or width8 > 64 or height > 256:
            return None
        pix_bytes = height * width8 * 4
        if o + pix_bytes > len(raw):
            return None
        seg = bytearray(raw[o:o + pix_bytes]); o += pix_bytes
        if is_pic:
            if f == 0:
                first_pix = bytes(seg)
            else:
                for i in range(min(len(seg), len(first_pix))):
                    seg[i] ^= first_pix[i]
        frames.append({
            "delay": delay, "height": height, "width": width8 * 8,
            "width_div8": width8, "x": x, "y": y, "pixels": bytes(seg),
        })
    return frames, o


def frame_to_rgb(pixels: bytes, width: int, height: int, mask: int | None = None):
    """Chunky 4bpp (2px/byte, high nibble left) -> flat RGB; mask index -> a
    magenta checkerboard so transparency is visible in the PNG."""
    rb = width // 2
    img = bytearray(width * height * 3)
    pal = DAX.EGA_PALETTE
    o = 0
    for y in range(height):
        base = y * rb
        for xb in range(rb):
            i = base + xb
            byte = pixels[i] if i < len(pixels) else 0
            for nib in (byte >> 4, byte & 0x0F):
                if mask is not None and nib == mask:
                    # visible transparency: checkerboard grey
                    c = 0x40 if ((o // 3) // width + (o // 3) % width) & 1 else 0x60
                    img[o] = c; img[o + 1] = c; img[o + 2] = c
                else:
                    r, g, b = pal[nib]
                    img[o] = r; img[o + 1] = g; img[o + 2] = b
                o += 3
    return img


def decode_dax_file(path: Path, out_dir: Path, scale: int, list_only: bool,
                    mask: int | None):
    data = path.read_bytes()
    base, blocks = DAX.parse_container(data)
    is_pic = "PIC" in path.stem.upper() or "FINAL" in path.stem.upper()
    print(f"{path}  ({len(data)} b)  entries={len(blocks)}  is_pic={is_pic}")
    rendered = anim = std = 0
    for blk in blocks:
        raw = DAX.decompress_block(data, base, blk)
        # animation array only when the standard-frame width_div8 (offset 2) == 0
        w8_std = struct.unpack_from("<H", raw, 2)[0] if len(raw) >= 4 else 1
        res = parse_anim_array(raw, is_pic) if w8_std == 0 else None
        if res:
            frames, consumed = res
            anim += 1
            tag = f"anim {len(frames)} frame(s) " + \
                  ",".join(f"{fr['width']}x{fr['height']}" for fr in frames)
            print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} {tag}"
                  f"  consumed={consumed}/{len(raw)}")
            if not list_only:
                out_dir.mkdir(parents=True, exist_ok=True)
                for fi, fr in enumerate(frames):
                    rgb = frame_to_rgb(fr["pixels"], fr["width"], fr["height"], mask)
                    png = out_dir / f"{path.stem}_{blk.block_id:03d}_f{fi}.png"
                    DAX.write_png(png, fr["width"], fr["height"], rgb, scale=scale)
                    rendered += 1
        else:
            fr = DAX.parse_standard_frame(raw)
            if fr:
                std += 1
                w, h, xo, yo = fr
                print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} std frame {w}x{h}")
                if not list_only:
                    out_dir.mkdir(parents=True, exist_ok=True)
                    rgb = DAX.frame_to_rgb(raw, w, h, DAX.FRAME_HEADER)
                    png = out_dir / f"{path.stem}_{blk.block_id:03d}.png"
                    DAX.write_png(png, w, h, rgb, scale=scale)
                    rendered += 1
            else:
                print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} (unrecognized)")
    print(f"  -> anim blocks: {anim}, std frames: {std}, PNGs: {rendered}")
    if rendered:
        print(f"  output: {out_dir}")


# --------------------------------------------------------------------------- #
# Amiga .DAA 6-byte index (SOLVED -- hunk 88 RLE + 5-plane planar frames)
# --------------------------------------------------------------------------- #
def rle_amiga_sprite(comp: bytes, start: int, out_budget: int):
    """The Amiga SPRIT/PIC inner RLE (CoK 'game' hunk 88 @+12). Decodes exactly
    `out_budget` output bytes starting at `comp[start]`; returns (out, new_pos)."""
    out = bytearray()
    pos = start
    budget = out_budget
    while budget > 0:
        c = comp[pos]; pos += 1
        if c <= 0x7f:                       # literal run of (c+1) bytes
            n = c + 1
            out += comp[pos:pos + n]; pos += n
            budget -= n
        elif c == 0x80:                     # 0x80 = no-op (emit nothing)
            continue
        else:                               # repeat next byte ((256-c)+1) times
            n = (0x100 - c) + 1
            b = comp[pos]; pos += 1
            out += bytes([b]) * n
            budget -= n
    return bytes(out), pos


def amiga_index_entries(data: bytes):
    """Return (data_base, [(id, comp_bytes)]) for a 6-byte-index .DAA, or None
    when the file is really a 9-byte-TOC block container (or not a DAA at all).

    Routing MUST match daa_decode.parse_container: the 9-byte TOC is tried
    first and accepted only when every data_offset chains and the last block
    ends at EOF; only then is the 6-byte index considered. A naive
    `body % 6 == 0` test (this function's pre-2026-07-18 behavior) mis-routes
    the 11 files whose word0 is divisible by BOTH 9 and 6 -- CoK comspr.daa x3,
    CPIC1.DAA, cpic2.daa, HEAD1.DAA, HEAD2.DAA; DoK COMSPR.DAA x2, CPIC1.daa x2
    -- which are all really 9-byte standard-frame containers (the "~11
    mis-routed files" note formerly in docs/daa-format.md #1b)."""
    try:
        kind, base, items = DAA.parse_container(data)
    except ValueError:
        return None
    if kind != "index":
        return None
    ents = sorted(items, key=lambda e: e[1])
    out = []
    for i, (bid, sub) in enumerate(ents):
        end = ents[i + 1][1] if i + 1 < len(ents) else (len(data) - base)
        out.append((bid, data[base + sub: base + end]))
    return base, out


def decode_amiga_subframe(comp: bytes):
    """Decode one 6-byte-index sub-block. Returns dict with header fields, the
    32-entry RGB palette, and a list of per-frame index buffers (w*h each)."""
    # peek the header (decode a small fixed prefix) to read pix_off + fields
    peek, _ = rle_amiga_sprite(comp, 0, 96)
    if len(peek) < 75:
        raise ValueError("header too short (not a 6-byte-index sprite block)")
    pix_off = peek[0]
    height = struct.unpack_from(">H", peek, 1)[0]
    width_div8 = struct.unpack_from(">H", peek, 3)[0]
    x = struct.unpack_from(">H", peek, 5)[0]
    y = struct.unpack_from(">H", peek, 7)[0]
    num_frames = peek[10]                 # frame count (offset 10, not 9)
    width = width_div8 * 8
    # decode the header segment (pix_off bytes) so the stream position lands on
    # the first frame's planar bitmap.
    hdr, pos = rle_amiga_sprite(comp, 0, pix_off)
    pal_words = [struct.unpack_from(">H", hdr, 11 + 2 * i)[0] for i in range(32)]
    pal = [((((w >> 8) & 0xF) * 17), (((w >> 4) & 0xF) * 17), ((w & 0xF) * 17))
           for w in pal_words]
    row_bytes = ((width + 15) // 16) * 2
    plane_size = row_bytes * height
    frame_size = plane_size * 5
    frames = []
    for _ in range(max(num_frames, 0)):
        bm, pos = rle_amiga_sprite(comp, pos, frame_size)
        idx = bytearray(width * height)
        for yy in range(height):
            for xx in range(width):
                v = 0
                bbase = yy * row_bytes + (xx >> 3)
                shift = 7 - (xx & 7)
                for p in range(5):
                    v |= ((bm[p * plane_size + bbase] >> shift) & 1) << p
                idx[yy * width + xx] = v
        frames.append(bytes(idx))
    return {"pix_off": pix_off, "height": height, "width": width,
            "width_div8": width_div8, "x": x, "y": y, "num_frames": num_frames,
            "palette": pal, "frames": frames, "consumed": pos, "comp_len": len(comp)}


def amiga_idx_to_rgb(idx: bytes, width: int, height: int, pal, mask: int | None):
    img = bytearray(width * height * 3)
    o = 0
    for i in range(width * height):
        v = idx[i]
        if mask is not None and v == mask:
            c = 0x40 if ((i // width) + (i % width)) & 1 else 0x60
            img[o] = c; img[o + 1] = c; img[o + 2] = c
        else:
            r, g, b = pal[v]
            img[o] = r; img[o + 1] = g; img[o + 2] = b
        o += 3
    return img


def decode_daa_blocks_file(path: Path, data: bytes, out_dir: Path, scale: int,
                           list_only: bool):
    """Render a 9-byte-TOC .DAA (standard 5-plane frames) -- the correct path
    for comspr/COMSPR/CPIC*/HEAD*, which a naive %6 test used to mis-route to
    the 6-byte-index decoder. Mirrors tools/daa_decode.py's frame rendering so
    this tool does the right thing for every family it documents."""
    kind, base, blocks = DAA.parse_container(data)
    assert kind == "blocks"
    print(f"{path}  ({len(data)} b)  9-byte block TOC ({len(blocks)} blocks) -- "
          f"standard frames, NOT the 6-byte sub-frame index")
    rendered = 0
    for blk in blocks:
        raw = DAA.decompress_block(data, base, blk)
        fr = DAA.parse_frame_header(raw)
        if not fr:
            print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} (not a standard "
                  f"frame; try tools/daa_decode.py for 8X8D tile strips)")
            continue
        w, h, pal, pix_off = fr
        print(f"  id={blk.block_id:<4} raw={blk.raw_size:<6} frame {w}x{h}")
        if not list_only:
            out_dir.mkdir(parents=True, exist_ok=True)
            rgb = DAA.planar_frame_to_rgb(raw, w, h, pal, pix_off)
            png = out_dir / f"{path.stem}_{blk.block_id:03d}.png"
            DAX.write_png(png, w, h, rgb, scale=scale)
            rendered += 1
    if rendered:
        print(f"  -> {rendered} PNG(s) in {out_dir}")


def decode_daa_file(path: Path, out_dir: Path, scale: int, list_only: bool,
                    mask: int | None):
    data = path.read_bytes()
    res = amiga_index_entries(data)
    if res is None:
        try:
            kind, _, _ = DAA.parse_container(data)
        except ValueError as e:
            print(f"{path}: not a DAA container ({e})")
            return
        if kind == "blocks":
            decode_daa_blocks_file(path, data, out_dir, scale, list_only)
        else:
            print(f"{path}: not a 6-byte index DAA; use tools/daa_decode.py")
        return
    base, ents = res
    print(f"{path}  ({len(data)} b)  6-byte index, {len(ents)} sub-frames, "
          f"data_base={base}")
    print("  id    comp     pix_off  WxH        nFrames  consumed")
    rendered = 0
    for bid, comp in ents:
        if len(comp) < 12:
            print(f"  {bid:<4}  {len(comp):<7} (sub-block too small)")
            continue
        try:
            d = decode_amiga_subframe(comp)
        except (IndexError, struct.error, ValueError) as e:
            print(f"  {bid:<4}  {len(comp):<7} (decode failed: {e})")
            continue
        print(f"  {bid:<4}  {len(comp):<7} {d['pix_off']:<7}  "
              f"{d['width']}x{d['height']:<6} {d['num_frames']:<8} "
              f"{d['consumed']}/{d['comp_len']}")
        if not list_only and d["frames"]:
            out_dir.mkdir(parents=True, exist_ok=True)
            for fi, idx in enumerate(d["frames"]):
                rgb = amiga_idx_to_rgb(idx, d["width"], d["height"],
                                       d["palette"], mask)
                png = out_dir / f"{path.stem}_{bid:03d}_f{fi}.png"
                DAX.write_png(png, d["width"], d["height"], rgb, scale=scale)
                rendered += 1
    if rendered:
        print(f"  -> {rendered} PNG(s) in {out_dir}")


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(
        description="Decode SSI Gold Box multi-sub-frame SPRIT/PIC/HEAD blocks")
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--list", action="store_true", help="list/analyze only; no PNGs")
    ap.add_argument("--mask", type=int, default=None,
                    help="EGA index to render as transparency (DOS only)")
    ap.add_argument("--amiga", action="store_true",
                    help="treat input as an Amiga .DAA 6-byte index")
    args = ap.parse_args()

    out_dir = args.out or (Path("renders") / "subframe" / args.file.stem)
    if args.amiga or args.file.suffix.lower() == ".daa":
        decode_daa_file(args.file, out_dir, args.scale, args.list, args.mask)
        return

    decode_dax_file(args.file, out_dir, args.scale, args.list, args.mask)


if __name__ == "__main__":
    main()
