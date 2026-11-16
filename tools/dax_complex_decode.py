#!/usr/bin/env python3
"""
dax_complex_decode.py - Decoder for the SSI Gold Box DOS .DAX *animated /
multi-frame* picture format (SPRIT*, PIC*, COMSPR, BODY*, animated monster
pictures, etc.) used by Champions of Krynn / Death Knights of Krynn (EGA).

This is the format that tools/dax_decode.py labels "complex/unsupported".
It is NOT a transparent-RLE / drawing-method-23 variant; it is simply a
multi-frame container whose per-frame pixel data is the same chunky 4bpp
packing as standard frames. Reverse-engineered from the open-source COAB
re-implementation (simeonpilgrim/coab, engine/ovr030.cs + DaxBlock.cs),
which targets the same older Gold Box engine, and verified byte-exact against
the CoK files in this repo.

CONTAINER + RLE: identical to tools/dax_decode.py (reused here).

ANIMATED-PICTURE BLOCK LAYOUT (after RLE decompression):
  offset 0 : uint8   numFrames
  then, repeated numFrames times:
     +0  uint32  delay        (animation frame delay; 0 in CoK sprites)
     +4  uint16  height       (pixels)
     +6  uint16  width        (in 8-pixel units; pixel width = width * 8)
     +8  uint16  x_pos        (placement X)
     +10 uint16  y_pos        (placement Y)  -- then ONE pad byte is skipped
     +13 uint8[8] field_9     (replicated per frame; original EGA-plane bytes)
     +21 ...     pixel data, (height * width * 4) bytes
                 chunky 4bpp, 2 px/byte, HIGH nibble = left pixel,
                 index 0..15 into the fixed EGA palette.

PER-FRAME pixel byte count = (bpp/2) where bpp = height*width*8, i.e.
height*width*4 bytes -- consumes the block exactly.

XOR-DELTA (animated "pic/final" files only):  for files drawn through the
"is_pic_or_final" path, frame 0's pixel bytes are stored verbatim and every
later frame's pixel bytes are XORed against frame 0's bytes before decoding
(simple delta animation).  SPRIT* monster sprites in CoK do NOT use this --
their 3 frames are the 3 view sizes (near/mid/far), each stored verbatim.
Use --xor to apply the delta if you know a file is of the pic/final kind.

USAGE:
  python tools/dax_complex_decode.py <file.dax> [--list] [--out DIR]
                                     [--scale N] [--xor]
"""
from __future__ import annotations
import argparse, struct, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dax_decode as dx   # reuse verified container + RLE + palette + PNG writer

FRAME_HDR = 21  # 4 delay + 2 h + 2 w + 2 x + 2 y + 1 pad + 8 field9


def parse_anim_frames(raw: bytes, apply_xor: bool = False):
    """
    Parse a multi-frame animated picture block.
    Returns list of dicts {delay,width,height,x,y,field9,pixels} or None if the
    block does not parse exactly as this format.
    """
    if len(raw) < 1 + FRAME_HDR:
        return None
    off = 0
    num = raw[off]; off += 1
    if num == 0 or num > 32:
        return None
    frames = []
    first_pixels = None
    for f in range(num):
        if off + FRAME_HDR > len(raw):
            return None
        delay = struct.unpack_from("<I", raw, off)[0]; off += 4
        height = struct.unpack_from("<H", raw, off)[0]; off += 2
        width = struct.unpack_from("<H", raw, off)[0]; off += 2
        x_pos = struct.unpack_from("<H", raw, off)[0]; off += 2
        y_pos = struct.unpack_from("<H", raw, off)[0]; off += 3   # word + 1 pad byte
        field9 = raw[off:off + 8]; off += 8
        if width == 0 or height == 0 or width > 80 or height > 256:
            return None
        nbytes = height * width * 4          # (bpp/2), bpp = h*w*8
        if off + nbytes > len(raw):
            return None
        pix = bytearray(raw[off:off + nbytes]); off += nbytes
        if apply_xor:
            if f == 0:
                first_pixels = bytes(pix)
            elif first_pixels is not None:
                for i in range(min(len(pix), len(first_pixels))):
                    pix[i] ^= first_pixels[i]
        frames.append(dict(delay=delay, width=width * 8, height=height,
                            x=x_pos, y=y_pos, field9=field9.hex(),
                            pixels=bytes(pix)))
    if off != len(raw):
        return None                          # must consume the whole block
    return frames


def frame_pixels_to_rgb(pixels: bytes, width: int, height: int):
    """Chunky-4bpp (2px/byte, high nibble first) -> flat RGB bytearray."""
    pal = dx.EGA_PALETTE
    row_bytes = width // 2
    img = bytearray(width * height * 3)
    o = 0
    for y in range(height):
        base = y * row_bytes
        for xb in range(row_bytes):
            idx = base + xb
            byte = pixels[idx] if idx < len(pixels) else 0
            for p in (byte >> 4, byte & 0x0F):
                r, g, b = pal[p]
                img[o] = r; img[o + 1] = g; img[o + 2] = b; o += 3
    return img


def main():
    ap = argparse.ArgumentParser(description="Decode SSI Gold Box DOS animated/multi-frame .DAX pictures")
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--xor", action="store_true",
                    help="apply frame-0 XOR delta (for pic/final animated files)")
    args = ap.parse_args()

    data = args.file.read_bytes()
    data_base, blocks = dx.parse_container(data)
    out_dir = args.out or (Path("renders") / "dax_complex" / args.file.stem)
    print(f"{args.file}  entries={len(blocks)}")

    ok = bad = 0
    for blk in blocks:
        raw = dx.decompress_block(data, data_base, blk)
        frames = parse_anim_frames(raw, apply_xor=args.xor)
        if frames is None:
            print(f"  id={blk.block_id:<4} raw={blk.raw_size:<5} NOT animated-multiframe (standard/other)")
            bad += 1
            continue
        dims = ", ".join(f"{fr['width']}x{fr['height']}" for fr in frames)
        print(f"  id={blk.block_id:<4} raw={blk.raw_size:<5} frames={len(frames)}  [{dims}]")
        ok += 1
        if not args.list:
            out_dir.mkdir(parents=True, exist_ok=True)
            for i, fr in enumerate(frames):
                rgb = frame_pixels_to_rgb(fr["pixels"], fr["width"], fr["height"])
                png = out_dir / f"{args.file.stem}_{blk.block_id:03d}_f{i}.png"
                dx.write_png(png, fr["width"], fr["height"], rgb, scale=args.scale)
    print(f"  -> animated blocks: {ok}, other: {bad}")
    if ok and not args.list:
        print(f"  output: {out_dir}")


if __name__ == "__main__":
    main()
