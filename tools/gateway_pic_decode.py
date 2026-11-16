#!/usr/bin/env python3
"""
gateway_pic_decode.py - Decoder for Gateway to the Savage Frontier's PIC*.DAX
single-frame VGA-extended portrait/scene pictures (the packing Parts 3/6/7/8 of
docs/engine/research/gateway-vga-picture-format.md left UNLOCATED, solved in
Part 17 with the live-captured loader output buffer as oracle).

PROVEN FORMAT (oracle: the 7,744-byte PIC-loader output buffer captured live at
RETF in two independent DOSBox-X sessions, sha256 25293b40cd5114cf..., byte-
identical to this decoder's output for PIC2.DAX block id 5 across all 7,736
comparable bytes -- see --verify-capture below):

  After the standard Gen1 DAX RLE decompression, a single-frame block is:

    raw[0]        u8  numFrames (== 1 for every block this decoder handles)
    raw[1..21]    21-byte animation frame header (dax.ts ANIM_FRAME_HEADER):
                    u32 delay, u16 height, u16 width_div8, u16 x, u16 y(+pad),
                    u8[9] tail -- tail byte 1 (raw[14]) is the Part 6
                    categorical format/prefix predictor
    raw[22..]     PREFIX structure -- 17/33/41 bytes by category byte
                    (0x0c -> 17, 0x0e -> 33, 0x0f -> 41). Part 3/6 derived the
                    same lengths by byte arithmetic but placed them as a
                    TRAILER after the pixels; the oracle proves the structure
                    sits BEFORE the pixel data. Meaning still unidentified.
    then          PIXELS: height rows, each row = 5 bit-planes of width_div8
                    bytes each (plane order LSB..MSB: bit0,bit1,bit2,bit3,
                    bit4/extension), bits MSB-first within a byte.
                    Row stride = 5*width_div8; total = height*5*width_div8
                    (88x88 blocks: 55-byte rows, 4,840 bytes, zero slop).
                    Pixel value = 5-bit palette index 0..31.

  Category 0x00 = plain EGA (no prefix, chunky 4bpp 2px/byte high-nibble-first,
  height*width_div8*4 bytes) -- the already-known Gen1 path, included here only
  for rendering completeness.

  MULTI-FRAME blocks (numFrames > 1, solved in Part 18): frame 0 is the full
  single-frame layout above; every subsequent frame is exactly

    14-byte header (u32 delay, u16 height, u16 width_div8, u16 x, u16 y,
                    u8 pad=0x01, u8 category=0x04 -- the "reuse frame 0's
                    parsed tail structure" marker, per the loader disassembly)
    then a FULL height*5*width8-byte planar5 image that is the XOR delta
    against frame 0's planar pixel stream (aligned at byte 0).

  frameN = decode_planar5(frame0_pixels XOR deltaN). The engine XORs the
  UNPACKED chunky buffers (loop bound = height*width, disassembly 0x46bfd..),
  but XOR commutes with bit-plane unpacking, so planar-domain XOR is
  byte-identical. Part 6's "4,833-byte payload, 7 bytes short" was a
  misattribution: tail frames have a 14-byte header (not 21) -- the 7 "header
  tail" zero bytes are really the delta's first 7 (unchanged) pixel bytes.
  Exact-consume: 22 + prefix + P + (numFrames-1)*(14 + P), P = height*5*width8
  (PIC.DAX id 29: 1 + 4894 + 5*4854 = 29165, zero slop).

  Every prior "noise" render (9 ruled-out hypotheses, Parts 6+8) failed because
  pixels were assumed to start at raw[22]; the 17/33/41-byte prefix misaligned
  every candidate against the true 5-plane 55-byte row grid.

PALETTE (honest): indices 0..15 = EGA16; 16/17 = the two DAC registers proven
in Part 2 (RGB 243,194,65 / 243,146,65); 18..31 = UNPROVEN (Part 4: indices
enumerated, RGB values still unlocated) -- rendered as a neutral gray ramp
placeholder, clearly NOT a claim about the real colors. --gray renders
5-bit grayscale instead.

STRUCTURE RECORDS (Part 19, 2026-07-23): Gateway's COMSPR.DAX blocks 254/255 are
pixel-less planar5 STRUCTURE RECORDS -- zero geometry (h=0, w8=0 -> 0 pixel
bytes), the 0x01 pad/count byte, a category byte, then the exact Part 18
component stream ([comp8][comp16][core24] for 0x0f, [comp16][core24] for 0x0e)
and nothing else. Retail GAME.OVR loads them at boot into DS:0x53F8 (id 0xFF,
+0x11751) / DS:0x53FC (id 0xFE, +0x11773) and "draws" each once via the
draw-image primitive 0x149:0x43(1, 1, ptr), gated on video mode == 3 (VGA):
id 255 after the exploration area-view draw (+0x41E6A), id 254 after the 3D
dungeon-view draw (+0x48410) -- VGA-only color/structure setup for the two
picture-less play screens. Component meanings stay unidentified (Part 18).

USAGE
  python tools/gateway_pic_decode.py PIC.DAX PIC2.DAX ... [--out DIR] [--scale N] [--gray]
  python tools/gateway_pic_decode.py --verify-capture BUFFER.BIN PIC2.DAX
  python tools/gateway_pic_decode.py --structure-records COMSPR.DAX [...]

  --verify-capture decodes PIC2.DAX block id 5 and requires byte-identity with
  the captured loader buffer on bytes 8..7743 (the buffer's first 8 bytes hold
  non-pixel metadata words 0000 8354 0000 01E4 -- 3 of those bytes exceed the
  0x1F pixel-index maximum, so they cannot be pixels; their meaning is
  unidentified). Exit code 0 = oracle match, 1 = mismatch.

  --structure-records scans DAX files for pixel-less structure records (the
  strict zero-geometry gate) and prints their parsed components. Exit code 0 =
  every candidate (all-zero-geometry, count 1) block parsed exactly; 1 = some
  candidate failed the grammar.
"""
from __future__ import annotations
import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dax_decode import (  # noqa: E402
    EGA_PALETTE, parse_container, decompress_block, write_png,
)

PREFIX_BY_CATEGORY = {0x0C: 17, 0x0E: 33, 0x0F: 41}
ANIM_FRAME_HEADER = 21
ORACLE_SHA256 = "25293b40cd5114cf915670904b4353cc7fea00c6b8bd0fbe376d9fab9af17ecb"


#: DAC registers 16/17, set once via INT 10h AX=1010h at GAME.OVR 0x515a2. Known independently
#: of the per-picture palette below, which is what makes that palette self-checking.
PROVEN_EXT_DAC = {16: (0x3C, 0x30, 0x10), 17: (0x3C, 0x24, 0x10)}


def _dac6(triple):
    return tuple(round(v * 255 / 63) for v in triple)


def extended_dac_from_core24(core24: bytes):
    """The 16 extended DAC registers (16..31) carried by a picture's own prefix.

    Taken in byte order, the LOW nibbles grouped in threes give registers 16..23 and the HIGH
    nibbles grouped in threes give 24..31; each nibble is a 6-bit DAC component << 2. That is the
    split GAME.OVR 0x51513 performs into its two work buffers at DS:0xA102/0xA11A before writing
    14 triplets starting at register 18 (`mov si,0xA108; mov cx,0x0E; mov dx,0x3C8; mov bl,0x12`,
    the overlay's only `mov dx,0x3c8`, at 0x5156e).

    Returns None when the self-check fails: registers 16 and 17 are known from elsewhere, so a
    block whose first six low nibbles are not `f c 4 f 9 4` is not carrying this structure.
    """
    if len(core24) != 24:
        return None
    low = [tuple((core24[i + k] & 0x0F) << 2 for k in range(3)) for i in range(0, 24, 3)]
    high = [tuple((core24[i + k] >> 4) << 2 for k in range(3)) for i in range(0, 24, 3)]
    regs = low + high
    for idx, want in PROVEN_EXT_DAC.items():
        if regs[idx - 16] != want:
            return None
    return [_dac6(t) for t in regs]


def build_palette(gray: bool = False, core24: bytes | None = None):
    """32-entry render palette: EGA16 below, extended DAC registers above.

    With `core24` (the last 24 bytes of the block's prefix) all of 16..31 are the picture's own
    real colours. Without it, only 16/17 are known and 18..31 fall back to a neutral ramp that is
    a placeholder, not a claim.
    """
    if gray:
        return [((i * 255) // 31,) * 3 for i in range(32)]
    pal = list(EGA_PALETTE)
    ext = extended_dac_from_core24(core24) if core24 is not None else None
    if ext is not None:
        return pal + ext
    pal.append(_dac6(PROVEN_EXT_DAC[16]))
    pal.append(_dac6(PROVEN_EXT_DAC[17]))
    for i in range(18, 32):      # no core24 available -- neutral placeholder ramp
        v = 60 + (i - 18) * 14
        pal.append((v, v, v))
    return pal


def parse_frame0_header(raw: bytes):
    """Return (height, width_div8, category) for a numFrames>=1 block."""
    if len(raw) < 1 + ANIM_FRAME_HEADER:
        return None
    height, width8 = struct.unpack_from("<HH", raw, 5)
    category = raw[14]           # frame-header tail byte 1 (Part 6 predictor)
    return height, width8, category


def decode_planar5(raw: bytes, pix_off: int, height: int, width8: int) -> bytearray:
    """5 row-interleaved bit-planes (LSB plane first, MSB-first bits) -> chunky
    1 byte/pixel, values 0..31."""
    width = width8 * 8
    img = bytearray(width * height)
    for y in range(height):
        row_base = y * width
        for plane in range(5):
            off = pix_off + y * 5 * width8 + plane * width8
            for k in range(width8):
                v = raw[off + k]
                base = row_base + k * 8
                for j in range(8):
                    img[base + j] |= ((v >> (7 - j)) & 1) << plane
    return img


def decode_chunky4(raw: bytes, pix_off: int, height: int, width8: int) -> bytearray:
    """Plain-EGA category 0x00: chunky 4bpp, 2 px/byte, high nibble = left."""
    width = width8 * 8
    img = bytearray(width * height)
    o = 0
    for i in range(height * width8 * 4):
        b = raw[pix_off + i]
        img[o] = b >> 4
        img[o + 1] = b & 0x0F
        o += 2
    return img


#: Tail-frame header: u32 delay, u16 h, u16 w8, u16 x, u16 y, u8 pad, u8 cat=0x04.
TAIL_FRAME_HEADER = 14
#: Category byte marking a "reuse the reference frame's tail structure" delta frame.
TAIL_FRAME_CATEGORY = 0x04


def decode_block(raw: bytes):
    """Decode a PIC*.DAX block (all frames). Returns dict or None (unsupported)."""
    hdr = parse_frame0_header(raw)
    if hdr is None:
        return None
    height, width8, category = hdr
    if height == 0 or width8 == 0 or height > 256 or width8 > 64:
        return None
    if category == 0x00:
        pix_off = 1 + ANIM_FRAME_HEADER
        need = pix_off + height * width8 * 4
        if len(raw) < need:
            return None
        img = decode_chunky4(raw, pix_off, height, width8)
        kind = "plain-ega"
        frames = [img]
    elif category in PREFIX_BY_CATEGORY:
        prefix = PREFIX_BY_CATEGORY[category]
        pix_off = 1 + ANIM_FRAME_HEADER + prefix
        pixel_bytes = height * 5 * width8
        need = pix_off + pixel_bytes
        nf = raw[0]
        # strict exact-consume gate (single- AND multi-frame)
        if len(raw) != need + (nf - 1) * (TAIL_FRAME_HEADER + pixel_bytes):
            return None
        img = decode_planar5(raw, pix_off, height, width8)
        kind = "vga-planar5"
        frames = [img]
        f0_pix = raw[pix_off:pix_off + pixel_bytes]
        s = need
        for _ in range(nf - 1):
            th, tw8 = struct.unpack_from("<HH", raw, s + 4)
            tcat = raw[s + 13]
            if th != height or tw8 != width8 or tcat != TAIL_FRAME_CATEGORY:
                return None        # not the proven multi-frame layout
            delta = raw[s + TAIL_FRAME_HEADER:s + TAIL_FRAME_HEADER + pixel_bytes]
            stream = bytes(a ^ b for a, b in zip(f0_pix, delta))
            frames.append(decode_planar5(stream, 0, height, width8))
            s += TAIL_FRAME_HEADER + pixel_bytes
    else:
        return None
    # The block's own extended palette is the last 24 bytes before the pixels. Plain-EGA blocks
    # carry no prefix, so they have none.
    core24 = raw[pix_off - 24:pix_off] if kind != "plain-ega" else None
    return {
        "width": width8 * 8, "height": height, "pixels": frames[0],
        "frames": frames, "category": category, "kind": kind,
        "num_frames": raw[0], "core24": core24,
    }


def render(dec, path: Path, scale: int, gray: bool, frame: int = 0):
    pal = build_palette(gray, dec.get("core24"))
    w, h = dec["width"], dec["height"]
    rgb = bytearray(w * h * 3)
    for i, v in enumerate(dec["frames"][frame]):
        r, g, b = pal[v & 0x1F]
        rgb[3 * i] = r
        rgb[3 * i + 1] = g
        rgb[3 * i + 2] = b
    write_png(path, w, h, rgb, scale=scale)


#: Component-stream length after the category byte, by category (Part 18 grammar).
STRUCTURE_COMPONENTS = {0x0C: 24, 0x0E: 40, 0x0F: 48}


def parse_structure_record(raw: bytes):
    """Parse a pixel-less planar5 structure record (Part 19; COMSPR.DAX 254/255).

    Strict gate: 8 zero geometry bytes, pad/count byte 0x01, known category,
    EXACT length 10 + component bytes. Returns dict or None."""
    if len(raw) < 10 or any(raw[:8]) or raw[8] != 1:
        return None
    cat = raw[9]
    s_len = STRUCTURE_COMPONENTS.get(cat)
    if s_len is None or len(raw) != 10 + s_len:
        return None
    off = 10
    comp8 = comp16 = None
    if cat == 0x0F:
        comp8 = raw[off:off + 8]
        off += 8
    if cat in (0x0E, 0x0F):
        comp16 = raw[off:off + 16]
        off += 16
    core24 = raw[off:off + 24]
    return {"category": cat, "comp8": comp8, "comp16": comp16, "core24": core24}


def scan_structure_records(paths) -> int:
    """--structure-records mode: print parsed records; verify every candidate
    (all-zero-geometry, count 1) block parses exactly. 0 = ok, 1 = failure."""
    bad = 0
    for f in paths:
        data = f.read_bytes()
        base, blocks = parse_container(data)
        for blk in blocks:
            raw = decompress_block(data, base, blk)
            if len(raw) < 10 or any(raw[:8]) or raw[8] != 1:
                continue                       # not a candidate
            rec = parse_structure_record(raw)
            if rec is None:
                print(f"{f} id={blk.block_id}: CANDIDATE FAILED the structure "
                      f"grammar (len={len(raw)} cat={raw[9]:#04x})")
                bad += 1
                continue
            print(f"{f} id={blk.block_id}: structure record cat={rec['category']:#04x} "
                  f"({len(raw)} bytes, zero slop)")
            for name in ("comp8", "comp16", "core24"):
                if rec[name] is not None:
                    print(f"    {name:6} = {rec[name].hex(' ')}")
            lows = [v & 0xF for v in rec["core24"][:6]]
            print(f"    core24 low-nibble signature f c 4 f 9 4: "
                  f"{'MATCH' if lows == [0xF, 0xC, 4, 0xF, 9, 4] else 'NO MATCH'}")
    return 1 if bad else 0


def verify_capture(buffer_path: Path, dax_path: Path) -> int:
    import hashlib
    buf = buffer_path.read_bytes()
    print(f"capture buffer: {buffer_path} ({len(buf)} bytes) "
          f"sha256={hashlib.sha256(buf).hexdigest()}")
    data = dax_path.read_bytes()
    base, blocks = parse_container(data)
    blk = next((b for b in blocks if b.block_id == 5), None)
    if blk is None:
        print("FAIL: no block id 5 in", dax_path)
        return 1
    raw = decompress_block(data, base, blk)
    dec = decode_block(raw)
    if dec is None or dec["kind"] != "vga-planar5":
        print("FAIL: block 5 did not decode as vga-planar5")
        return 1
    img = dec["pixels"]
    if len(buf) != len(img):
        print(f"FAIL: length mismatch buffer={len(buf)} decode={len(img)}")
        return 1
    # Bytes 0..7 of the captured buffer are non-pixel metadata (values 0x54,
    # 0x83, 0xE4 exceed the 0x1F index maximum); bytes 8..7743 must be
    # byte-identical to the decode.
    mism = [i for i in range(8, len(buf)) if buf[i] != img[i]]
    print(f"compared bytes 8..{len(buf)-1}: {len(buf)-8-len(mism)} match, "
          f"{len(mism)} mismatch")
    print(f"buffer[0:8]={buf[:8].hex()} (metadata, excluded) "
          f"decode[0:8]={bytes(img[:8]).hex()} (pixels the capture window "
          f"does not preserve)")
    if mism:
        print("FAIL: first mismatches:", mism[:10])
        return 1
    print("ORACLE MATCH: decoder output is byte-identical to the captured "
          "loader buffer on all 7,736 comparable bytes")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, default=None,
                    help="output dir (default renders/gateway-pic/<stem>)")
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--gray", action="store_true",
                    help="render 5-bit grayscale instead of the palette")
    ap.add_argument("--verify-capture", action="store_true",
                    help="args = BUFFER.BIN PIC2.DAX; oracle regression check")
    ap.add_argument("--structure-records", action="store_true",
                    help="scan DAX files for pixel-less structure records "
                         "(COMSPR.DAX 254/255) and print their components")
    args = ap.parse_args()

    if args.verify_capture:
        if len(args.files) != 2:
            ap.error("--verify-capture needs exactly: BUFFER.BIN PIC2.DAX")
        sys.exit(verify_capture(args.files[0], args.files[1]))

    if args.structure_records:
        sys.exit(scan_structure_records(args.files))

    for f in args.files:
        data = f.read_bytes()
        base, blocks = parse_container(data)
        out_dir = args.out or (Path("renders") / "gateway-pic" / f.stem)
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"{f} entries={len(blocks)}")
        n = 0
        for blk in blocks:
            raw = decompress_block(data, base, blk)
            dec = decode_block(raw)
            if dec is None:
                print(f"  id={blk.block_id:<4} raw={len(raw):<6} "
                      f"numFrames={raw[0]} cat={raw[14]:#04x} -- unsupported "
                      f"(unknown category / not this format)")
                continue
            suffix = "_gray" if args.gray else ""
            nf = len(dec["frames"])
            for fr in range(nf):
                fsuf = f"_f{fr}" if nf > 1 else ""
                png = out_dir / f"{f.stem.lower()}_{blk.block_id:03d}{fsuf}{suffix}.png"
                render(dec, png, args.scale, args.gray, frame=fr)
            n += 1
            print(f"  id={blk.block_id:<4} {dec['kind']:<11} "
                  f"{dec['width']}x{dec['height']} cat={dec['category']:#04x} "
                  f"frames={nf} -> {f.stem.lower()}_{blk.block_id:03d}{suffix}.png")
        print(f"  rendered {n}")


if __name__ == "__main__":
    main()
