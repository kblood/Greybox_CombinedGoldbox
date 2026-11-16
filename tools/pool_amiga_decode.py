#!/usr/bin/env python3
"""
pool_amiga_decode.py - Decoder for the AMIGA Pool of Radiance (1989) `.dax`
container format -- the 4th, previously unsolved Amiga Gold Box container
generation (distinct from DOS DAX, Amiga DAA and Amiga GLIB).

Format spec: docs/pool-amiga-format.md. Reverse-engineered 2026-07-22 by
disassembling the Amiga 68000 `program` executable (hunk 27 + 0x7346 is the
decompressor) and verified against the DOS Pool of Radiance GOG release:
28/29 ECL blocks decompress BYTE-IDENTICAL to the DOS `ECL*.DAX` plaintext.

CONTAINER (all integers BIG-ENDIAN):
  u16 word0 = entry_count * 10
  TOC: entry_count x 10 bytes: { u16 block_id, u32 data_offset,
                                 u16 comp_size, u16 raw_size }
  data_base = 2 + word0;  block bytes = file[data_base+off : +comp_size]

COMPRESSION: backwards bit-stream LZSS with XOR checksum ("Pool LZSS"):
  Read 32-bit big-endian longs BACKWARDS from the end of the block:
    long[-1] = raw_size (u32), long[-2] = XOR checksum over all data longs,
    then bit-buffer longs. Bits come out of each long LSB-first; the highest
    set bit of each long is a sentinel (not data). Refilled longs get a
    forced bit-31 sentinel, so they carry a full 32 data bits.
  Output is written BACKWARDS from the end of the output buffer. Fields are
  assembled MSB-first from the bit stream. Token grammar:
    0 0        -> literal run: 3-bit n, then (n+1) x 8-bit literal bytes
    0 1        -> match: 8-bit offset, copy 2 bytes
    1 v(2bits) -> v=0: 9-bit offset,  copy 3 bytes
                  v=1: 10-bit offset, copy 4 bytes
                  v=2: 8-bit (len), 12-bit offset, copy len+1 bytes
                  v=3: literal run: 8-bit n, then (n+9) x 8-bit literals
  Matches copy from HIGHER addresses (already-decoded bytes, since output
  grows downwards):  out[--p] = out[p + offset]  repeated.

FRAMES (after decompression):
  standard: { u16 h, u16 w8, u16 y, u16 x, u16 nframes, u16 plane_size }
            then nframes x (4 contiguous bitplanes of plane_size bytes).
            width = w8*8; row_bytes = ceil(width/16)*2; plane_size =
            row_bytes*h. 16 colors, plane 0 = LSB, MSB-first pixels.
  animated (pic/final/sprit): { u16 0, u16 nframes } then per frame
            { u32 delay } + a standard 12-byte frame header + planes.
  Non-graphics files (ecl/geo/item/moncha/monitm/monspc/walldef/items...)
  are raw data blocks -- use --raw to dump them.

PALETTES: no palette in the files. The game keeps five 16-color Amiga
12-bit palettes in `program` hunk 23 (+0,+32,+64,+96,+128). The per-context
dispatch was traced through the five setter functions at hunk22+0x11c/0x146/
0x172/0x19e/0x1ca (each installs one fixed table into the ViewPort) and
their call sites (docs/pool-amiga-format.md section 4):
  dark  (+0x00)  3D dungeon exploration view ambient
  combat(+0x20)  chargen combat-icon editor + combat screen family
  pic   (+0x40)  HEAD/BODY paper dolls (chargen, character view, NPC
                 parley) and the ambient menu/story-picture palette
  combat2(+0x60) == combat; combat screen + wilderness view + FINAL zooms
  alt   (+0x80)  camp scene (PIC 29), treasure (PIC 1), FINAL block 2,
                 PIC-portrait NPCs (record icon id 0xff)
Values embedded below; --pal selects (default auto: pic for pic/final/
bacpac/head/body, combat otherwise).

PAPER DOLLS: chargen head index 1..14 / body index 1..12 map to block ids
through two byte tables in `program` hunk 31 (+0x1a4e / +0x1a5c); the doll
is an 88x88 composite: head (56x40) at (16,0), body (88x48) at (0,40) --
DrawHeadBody at hunk19+0x1636 draws head at col x+2, body at row y+5.
--paperdoll renders composites (pic palette, per the engine).

USAGE:
  python tools/pool_amiga_decode.py <file.dax> [--list] [--raw] [--out DIR]
                                    [--scale N] [--pal pic|combat|combat2|alt|dark]
                                    [--paperdoll all|H:B[,H:B...]]
Default --out: renders/pool_amiga/<stem>/
"""
from __future__ import annotations
import argparse, struct, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dax_decode as dx  # PNG writer reuse

# The five 16-color palettes from `program` hunk 23 (Amiga 12-bit 0RGB words).
# Context dispatch proven by disassembly (see module docstring / format doc s.4).
PALETTES_RAW = {
    "dark":    [0x222,0x06B,0x096,0x0AA,0x000,0x940,0xB44,0xFAA,0xFE9,0x59F,0x0D8,0x5FF,0x555,0x777,0xAAA,0xFFF],  # +0    dungeon 3D view
    "combat":  [0x000,0x06B,0x096,0x0AA,0x000,0x940,0xB44,0xFAA,0xFE9,0x59F,0x0D8,0x5FF,0x555,0x777,0xAAA,0xFFF],  # +32 (== +96)  combat/icons/wilderness
    "pic":     [0x000,0xDB9,0xB97,0x964,0x521,0x742,0xA84,0xCB6,0xFF9,0x007,0x44B,0x444,0x555,0x777,0xAAA,0xFFF],  # +64   paper dolls + menu/story ambient
    "alt":     [0x000,0x124,0x953,0xB97,0xECB,0x710,0xA42,0xDB0,0xFF5,0x074,0x053,0x369,0x555,0x777,0xAAA,0xFFF],  # +128  camp/treasure/special scenes
}
PALETTES = {k: [((w >> 8 & 15) * 17, (w >> 4 & 15) * 17, (w & 15) * 17) for w in v]
            for k, v in PALETTES_RAW.items()}
PALETTES["combat2"] = PALETTES["combat"]

# files whose engine display context installs the `pic` palette:
# pic/final/bacpac story pictures (menu-ambient contexts) and the HEAD/BODY
# paper dolls (ShowPaperDoll hunk4+0x5dc + the hunk13+0x5b58 screen-refresh
# dispatcher both install SetPal_pic before DrawHeadBody).
PIC_FILES = {"pic", "final", "bacpac", "head", "body"}

# Chargen paper-doll id maps from `program` hunk 31 (+0x1a4e head, +0x1a5c
# body), indexed by the 1-based chargen cycle position (head 'H' cycles 1..14,
# body 'B' cycles 1..12 -- hunk10+0x37b4/0x37f6). Table slots 13/14 of the
# body map point at blocks 49/50 which do not exist in body.dax, matching the
# engine's 12-body cap.
CHARGEN_HEAD_IDS = [0x00, 0x08, 0x09, 0x0D, 0x10, 0x12, 0x16, 0x22, 0x2D, 0x33, 0x35, 0x39, 0x43, 0x44]
CHARGEN_BODY_IDS = [0x01, 0x02, 0x03, 0x04, 0x07, 0x08, 0x12, 0x05, 0x1A, 0x21, 0x23, 0x25]


class Block:
    def __init__(self, index, block_id, data_offset, comp_size, raw_size):
        self.index = index
        self.block_id = block_id
        self.data_offset = data_offset
        self.comp_size = comp_size
        self.raw_size = raw_size


def parse_container(data: bytes):
    """Return (data_base, [Block,...]). Raises ValueError if not this format."""
    if len(data) < 12:
        raise ValueError("too small")
    word0 = struct.unpack(">H", data[:2])[0]
    if word0 == 0 or word0 % 10 != 0:
        raise ValueError("word0 not a multiple of 10")
    n = word0 // 10
    base = 2 + word0
    if base > len(data):
        raise ValueError("TOC exceeds file")
    blocks = []
    prev_end = 0
    for i in range(n):
        bid, off, csz, rsz = struct.unpack(">HIHH", data[2 + i * 10:12 + i * 10])
        if off != prev_end:
            raise ValueError(f"entry {i}: offset {off} does not chain (expected {prev_end})")
        prev_end = off + csz
        blocks.append(Block(i, bid, off, csz, rsz))
    if base + prev_end != len(data):
        raise ValueError(f"last block ends at {base + prev_end}, file is {len(data)}")
    return base, blocks


def decompress(comp: bytes, verify: bool = True) -> bytes:
    """The Pool-Amiga backwards bit-stream LZSS (program hunk27+0x7346)."""
    pos = len(comp)

    def rdlong():
        nonlocal pos
        pos -= 4
        return int.from_bytes(comp[pos:pos + 4], "big")

    raw_size = rdlong()
    d5 = rdlong()          # checksum long
    d0 = rdlong()
    d5 ^= d0
    state = [d0, d5]

    def getbit():
        b = state[0] & 1
        state[0] >>= 1
        if state[0] == 0:          # sentinel exhausted: refill, discard b
            v = rdlong()
            state[1] ^= v
            b = v & 1
            state[0] = 0x80000000 | (v >> 1)
        return b

    def getbits(nb):
        v = 0
        for _ in range(nb):
            v = (v << 1) | getbit()
        return v

    out = bytearray(raw_size)
    p = raw_size
    while p > 0:
        if getbit() == 0:
            if getbit() == 0:                       # 00: short literal run
                for _ in range(getbits(3) + 1):
                    p -= 1
                    out[p] = getbits(8)
            else:                                   # 01: 2-byte match
                off = getbits(8)
                for _ in range(2):
                    p -= 1
                    out[p] = out[p + off]
        else:
            v = getbits(2)
            if v == 3:                              # long literal run
                for _ in range(getbits(8) + 9):
                    p -= 1
                    out[p] = getbits(8)
            elif v == 2:                            # long match
                length = getbits(8)
                off = getbits(12)
                for _ in range(length + 1):
                    p -= 1
                    out[p] = out[p + off]
            else:                                   # 3/4-byte match
                off = getbits(9 + v)
                for _ in range(v + 3):
                    p -= 1
                    out[p] = out[p + off]
    if verify and state[1] != 0:
        raise ValueError(f"XOR checksum residual 0x{state[1]:08x}")
    return bytes(out)


def decompress_block(data: bytes, base: int, blk: Block) -> bytes:
    raw = decompress(data[base + blk.data_offset: base + blk.data_offset + blk.comp_size])
    if len(raw) != blk.raw_size:
        raise ValueError(f"block {blk.block_id}: raw {len(raw)} != TOC {blk.raw_size}")
    return raw


def planar_to_indices(pix: bytes, w: int, h: int, plane_size: int):
    """4 contiguous bitplanes, word-aligned rows, plane 0 = LSB."""
    row_bytes = ((w + 15) // 16) * 2
    idx = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            v = 0
            byte_off = y * row_bytes + (x >> 3)
            bit = 7 - (x & 7)
            for p in range(4):
                v |= ((pix[p * plane_size + byte_off] >> bit) & 1) << p
            idx[y * w + x] = v
    return idx


def parse_standard(raw: bytes):
    """Standard frame block -> (w, h, [indices per frame]) or None."""
    if len(raw) < 12:
        return None
    h, w8, y, x, nf, plane = struct.unpack(">HHHHHH", raw[:12])
    if h == 0 or w8 == 0 or nf == 0 or nf > 512 or h > 256 or w8 > 64:
        return None
    w = w8 * 8
    row_bytes = ((w + 15) // 16) * 2
    if plane != row_bytes * h:
        return None
    if 12 + nf * 4 * plane != len(raw):
        return None
    return w, h, [planar_to_indices(raw[12 + f * 4 * plane:], w, h, plane) for f in range(nf)]


def parse_animated(raw: bytes):
    """pic/final/sprit block -> list of (delay, w, h, indices) or None."""
    if len(raw) < 20:
        return None
    zero, nf = struct.unpack(">HH", raw[:4])
    if zero != 0 or nf == 0 or nf > 64:
        return None
    off = 4
    frames = []
    for _ in range(nf):
        if off + 16 > len(raw):
            return None
        delay, = struct.unpack(">I", raw[off:off + 4])
        h, w8, y, x, nsub, plane = struct.unpack(">HHHHHH", raw[off + 4:off + 16])
        if h == 0 or w8 == 0 or nsub != 1 or h > 256 or w8 > 64:
            return None
        w = w8 * 8
        row_bytes = ((w + 15) // 16) * 2
        if plane != row_bytes * h or off + 16 + 4 * plane > len(raw):
            return None
        frames.append((delay, w, h, planar_to_indices(raw[off + 16:], w, h, plane)))
        off += 16 + 4 * plane
    if off != len(raw):
        return None
    return frames


def _load_frame_blocks(path: Path):
    """Decode every std-frame block of a container -> {block_id: (w, h, indices)}."""
    data = path.read_bytes()
    base, blocks = parse_container(data)
    out = {}
    for blk in blocks:
        std = parse_standard(decompress_block(data, base, blk))
        if std:
            w, h, frames = std
            out[blk.block_id] = (w, h, frames[0])
    return out


def compose_paperdoll(head, body):
    """88x88 composite exactly as DrawHeadBody (hunk19+0x1636) places it:
    head (56x40) at col x+2 -> pixel (16, 0); body (88x48) at row y+5 ->
    pixel (0, 40). head+body never overlap."""
    hw, hh, hidx = head
    bw, bh, bidx = body
    W, H = max(bw, hw + 16), hh + bh
    canvas = bytearray(W * H)
    for y in range(hh):
        canvas[y * W + 16: y * W + 16 + hw] = hidx[y * hw:(y + 1) * hw]
    for y in range(bh):
        canvas[(hh + y) * W: (hh + y) * W + bw] = bidx[y * bw:(y + 1) * bw]
    return W, H, canvas


def render_paperdolls(datadir: Path, spec: str, outdir: Path, pal, scale: int):
    heads = _load_frame_blocks(datadir / "head.dax")
    bodies = _load_frame_blocks(datadir / "body.dax")
    if spec == "all":
        pairs = [(h, b) for h in range(1, len(CHARGEN_HEAD_IDS) + 1)
                 for b in range(1, len(CHARGEN_BODY_IDS) + 1)]
    else:
        pairs = [tuple(int(v) for v in p.split(":")) for p in spec.split(",")]
    outdir.mkdir(parents=True, exist_ok=True)
    n = 0
    for hix, bix in pairs:
        hid = CHARGEN_HEAD_IDS[hix - 1]
        bid = CHARGEN_BODY_IDS[bix - 1]
        w, h, idx = compose_paperdoll(heads[hid], bodies[bid])
        write_indexed_png(outdir / f"doll_h{hix:02d}_b{bix:02d}.png", w, h, idx, pal, scale)
        n += 1
    print(f"wrote {n} paper-doll composites -> {outdir}")


def write_indexed_png(path: Path, w: int, h: int, idx, pal, scale: int):
    rgb = bytearray(w * h * 3)
    for i, v in enumerate(idx):
        rgb[i * 3:i * 3 + 3] = bytes(pal[v])
    dx.write_png(path, w, h, bytes(rgb), scale=scale)


def main():
    ap = argparse.ArgumentParser(description="Decode AMIGA Pool of Radiance .dax containers")
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--raw", action="store_true", help="dump decompressed blocks as .bin")
    ap.add_argument("--pal", choices=sorted(PALETTES), default=None)
    ap.add_argument("--paperdoll", metavar="all|H:B[,H:B...]", default=None,
                    help="render chargen paper-doll composites (head 1..14, body 1..12); "
                         "FILE must be head.dax, body.dax or any file in the data dir")
    args = ap.parse_args()

    if args.paperdoll:
        datadir = args.file if args.file.is_dir() else args.file.parent
        pal = PALETTES[args.pal] if args.pal else PALETTES["pic"]
        render_paperdolls(datadir, args.paperdoll,
                          args.out or Path("renders/pool_amiga/paperdoll"), pal, args.scale)
        return

    data = args.file.read_bytes()
    base, blocks = parse_container(data)
    stem = args.file.stem.lower()
    pal = PALETTES[args.pal] if args.pal else PALETTES["pic" if stem.rstrip("0123456789") in PIC_FILES else "combat"]
    outdir = args.out or Path("renders/pool_amiga") / stem

    print(f"{args.file.name}: {len(blocks)} blocks, data_base={base}")
    rendered = raws = 0
    for blk in blocks:
        raw = decompress_block(data, base, blk)
        if args.list:
            kind = "std" if parse_standard(raw) else ("anim" if parse_animated(raw) else "data")
            print(f"  id={blk.block_id:5d} comp={blk.comp_size:6d} raw={blk.raw_size:6d} {kind}")
            continue
        outdir.mkdir(parents=True, exist_ok=True)
        std = parse_standard(raw)
        anim = None if std else parse_animated(raw)
        if std:
            w, h, frames = std
            for f, idx in enumerate(frames):
                suffix = f"_{blk.block_id}" + (f"_t{f}" if len(frames) > 1 else "")
                write_indexed_png(outdir / f"{stem}{suffix}.png", w, h, idx, pal, args.scale)
                rendered += 1
        elif anim:
            for f, (delay, w, h, idx) in enumerate(anim):
                write_indexed_png(outdir / f"{stem}_{blk.block_id}_f{f}.png", w, h, idx, pal, args.scale)
                rendered += 1
        elif args.raw:
            (outdir / f"{stem}_{blk.block_id}.bin").write_bytes(raw)
            raws += 1
        else:
            print(f"  id={blk.block_id}: data block ({len(raw)} bytes), use --raw to dump")
    if rendered or raws:
        print(f"wrote {rendered} PNGs, {raws} raw dumps -> {outdir}")


if __name__ == "__main__":
    main()
