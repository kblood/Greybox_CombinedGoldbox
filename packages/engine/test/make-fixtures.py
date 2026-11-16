#!/usr/bin/env python3
"""
make-fixtures.py - Golden-file fixture generator for the TS DAX loader.

Imports the EXISTING, verified decoder (tools/dax_decode.py) and dumps a few
representative DAX blocks at NATIVE resolution (scale=1, NOT upscaled) as compact
JSON the Vitest parity test consumes:

    { "file": "...", "blockId": N, "width": W, "height": H,
      "palette": [[r,g,b], ...16...],
      "indices": [ ...W*H palette indices... ] }

The palette-indexed `indices` are derived straight from dax_decode's own
frame_to_rgb output (the only rendering it exposes) by mapping each RGB triple
back through EGA_PALETTE — so we do NOT fork the decode algorithm; we reuse it.

Fixtures derive from copyrighted game assets and are git-ignored: only THIS
script is committed. Run it locally (the game files exist in the repo) to
(re)generate test/fixtures/dax/*.json before running `npm test`.

Usage:
    python packages/engine/test/make-fixtures.py
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

# --- locate the repo root and import the reference decoder unchanged ----------
# Monorepo layout: this file is packages/engine/test/make-fixtures.py
#   HERE.parent           = packages/engine/test
#   ENGINE  (parent.parent) = packages/engine
#   REPO_ROOT             = packages/engine/../../.. = C:\Modding\GoldBox
HERE = Path(__file__).resolve()
ENGINE = HERE.parent.parent              # packages/engine/
REPO_ROOT = ENGINE.parent.parent         # C:\Modding\GoldBox
TOOLS = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS))

import dax_decode as dx  # noqa: E402  (the verified oracle)
import daa_decode as da  # noqa: E402  (the verified Amiga DAA + ILBM oracle)
import hlib_decode as hl  # noqa: E402  (the verified DQK HLIB oracle)
import glib_decode as gl  # noqa: E402  (the verified Amiga GLIB oracle)

OUT_DIR = ENGINE / "test" / "fixtures" / "dax"
DAA_DIR = ENGINE / "test" / "fixtures" / "daa"
HLIB_DIR = ENGINE / "test" / "fixtures" / "hlib"
ILBM_DIR = ENGINE / "test" / "fixtures" / "ilbm"
GLIB_DIR = ENGINE / "test" / "fixtures" / "glib"

# Reverse map: EGA RGB triple -> palette index (the palette has no duplicates).
_RGB_TO_IDX = {rgb: i for i, rgb in enumerate(dx.EGA_PALETTE)}

# Representative blocks: a big-pic scene, a small combat head, a full title screen.
# (file path relative to repo root, block_id)
TARGETS = [
    ("Champions of Krynn/BIGPIC1.DAX", 114),
    ("Champions of Krynn/CHEAD.DAX", 0),
    ("Champions of Krynn/CHEAD.DAX", 64),
    ("Champions of Krynn/TITLE.DAX", 1),
    ("Champions of Krynn/TITLE.DAX", 3),
]


def rgb_to_indices(rgb: bytes, width: int, height: int) -> list[int]:
    """Map the flat RGB buffer (3 bytes/pixel) back to EGA palette indices."""
    out = []
    for p in range(width * height):
        triple = (rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])
        out.append(_RGB_TO_IDX[triple])
    return out


def decode_block(path: Path, block_id: int):
    """Return (width, height, indices) for the standard/tile-strip block."""
    data = path.read_bytes()
    data_base, blocks = dx.parse_container(data)
    blk = next((b for b in blocks if b.block_id == block_id), None)
    if blk is None:
        raise SystemExit(f"block {block_id} not found in {path}")
    raw = dx.decompress_block(data, data_base, blk)

    fr = dx.parse_standard_frame(raw)
    header_len = dx.FRAME_HEADER  # DAX pixel data starts at byte 17 (COAB DaxBlock.cs)
    if not fr:
        strip = dx.parse_tile_strip(raw)
        if not strip:
            raise SystemExit(
                f"block {block_id} in {path} is complex/unsupported — not a golden target"
            )
        width, height, header_len = strip
    else:
        width, height, _xo, _yo = fr

    rgb = dx.frame_to_rgb(raw, width, height, header_len)
    indices = rgb_to_indices(rgb, width, height)
    return width, height, indices


# --------------------------------------------------------------------------- #
# DAA (Amiga, big-endian, 5-plane planar, 32-color per-frame palette)
# --------------------------------------------------------------------------- #
# (file path relative to repo root, block_id)
DAA_TARGETS = [
    ("amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA", 114),
    ("amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA", 112),
    ("amiga_extracted/DeathKnightsOfKrynn/disk1/BIGPIC1.DAA", 113),
    # The formerly "mis-routed" 9/6-ambiguous families (word0 divisible by both
    # 9 and 6): really 9-byte-TOC standard frames. One golden per family locks
    # the chain-validated routing + pixel decode (see docs/daa-format.md #1b).
    ("amiga_extracted/ChampionsOfKrynn/disk1/comspr.daa", 0),
    ("amiga_extracted/ChampionsOfKrynn/disk2/CPIC1.DAA", 129),
    ("amiga_extracted/ChampionsOfKrynn/disk2/HEAD1.DAA", 68),
    ("amiga_extracted/DeathKnightsOfKrynn/disk1/COMSPR.DAA", 0),
    ("amiga_extracted/DeathKnightsOfKrynn/disk1/CPIC1.daa", 1),
]


def write_daa_fixtures() -> int:
    DAA_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for rel, block_id in DAA_TARGETS:
        src = REPO_ROOT / rel
        if not src.exists():
            print(f"  SKIP (missing game file): {rel}")
            continue
        data = src.read_bytes()
        kind, data_base, items = da.parse_container(data)
        if kind != "blocks":
            print(f"  SKIP (6-byte index; covered by daa.test.ts real-file "
                  f"cases, not golden JSON): {rel}")
            continue
        blk = next((b for b in items if b.block_id == block_id), None)
        if blk is None:
            # pick the first renderable block instead
            blk = items[0]
            block_id = blk.block_id
        raw = da.decompress_block(data, data_base, blk)
        fr = da.parse_frame_header(raw)
        if not fr:
            print(f"  SKIP (block {block_id} not a frame): {rel}")
            continue
        width, height, pal, pix_off = fr
        # palette indices straight from the planar decoder's logic
        row_bytes = ((width + 15) // 16) * 2
        plane_size = row_bytes * height
        pix = raw[pix_off:]
        indices = []
        for y in range(height):
            rbase = y * row_bytes
            for x in range(width):
                byte_i = rbase + (x >> 3)
                bit = 7 - (x & 7)
                idx = 0
                for p in range(da.NUM_PLANES):
                    b = pix[p * plane_size + byte_i]
                    idx |= ((b >> bit) & 1) << p
                indices.append(idx)
        rgb = da.planar_frame_to_rgb(raw, width, height, pal, pix_off)
        stem = Path(rel).stem
        fixture = {
            "file": rel.replace("\\", "/"),
            "stem": stem,
            "blockId": block_id,
            "width": width,
            "height": height,
            "palette": [list(c) for c in pal] + [[0, 0, 0]] * (256 - len(pal)),
            "indices": indices,
            "rgb": list(rgb),
        }
        out_path = DAA_DIR / f"{stem}_{block_id}.json"
        out_path.write_text(json.dumps(fixture, separators=(",", ":")))
        print(f"  wrote daa/{out_path.name}  ({width}x{height}, {len(indices)} px)")
        written += 1
    return written


# --------------------------------------------------------------------------- #
# HLIB (DQK, little-endian, Chain-4, 8bpp, per-leaf/inherited palette)
# --------------------------------------------------------------------------- #
# (file path relative to repo root, walk-label of the target image)
HLIB_TARGETS = [
    ("The Dark Queen of Krynn/DISK1/TITLE.TLB", "set01_img001"),  # title backdrop (18)
    ("The Dark Queen of Krynn/DISK1/TITLE.TLB", "set02_img001"),  # credits frame (23)
    ("The Dark Queen of Krynn/DISK2/BIGPIC.TLB", "set01_img001"),  # bigpic (18)
    ("The Dark Queen of Krynn/DISK2/PICA.TLB", "set02_img001"),    # encounter pic (18)
    ("The Dark Queen of Krynn/DISK2/PICA.TLB", "set04_img001"),    # encounter pic (16, raw)
]


def write_hlib_fixtures() -> int:
    HLIB_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for rel, target_label in HLIB_TARGETS:
        src = REPO_ROOT / rel
        if not src.exists():
            print(f"  SKIP (missing game file): {rel}")
            continue
        data = src.read_bytes()
        try:
            hl.read_header(data, 0)
        except ValueError as e:
            print(f"  SKIP ({e}): {rel}")
            continue
        # walk and replicate main()'s palette-inheritance exactly
        last_pal = None
        found = None
        for label, w, h, px, pal, dm, _x, _y in hl.walk(data):
            pal = pal or last_pal
            last_pal = pal or last_pal
            if label == target_label:
                found = (label, w, h, px, pal, dm)
                break
        if found is None:
            print(f"  SKIP (label {target_label} not found): {rel}")
            continue
        label, w, h, px, pal, dm = found
        rgb = hl.indices_to_rgb(px, w, h, pal)
        stem = Path(rel).stem
        fixture = {
            "file": rel.replace("\\", "/"),
            "stem": stem,
            "label": label,
            "width": w,
            "height": h,
            "drawMethod": dm,
            "indices": list(px),
            "rgb": list(rgb),
        }
        out_path = HLIB_DIR / f"{stem}_{label}.json"
        out_path.write_text(json.dumps(fixture, separators=(",", ":")))
        print(f"  wrote hlib/{out_path.name}  ({w}x{h}, method {dm})")
        written += 1
    return written


# --------------------------------------------------------------------------- #
# ILBM (.LBM title screens — standard IFF, per-row interleaved planes)
# --------------------------------------------------------------------------- #
ILBM_TARGETS = [
    "amiga_extracted/ChampionsOfKrynn/disk1/scrn1b.lbm",
    "amiga_extracted/DeathKnightsOfKrynn/disk1/Title1.LBM",
]


def write_ilbm_fixtures() -> int:
    ILBM_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for rel in ILBM_TARGETS:
        src = REPO_ROOT / rel
        if not src.exists():
            print(f"  SKIP (missing game file): {rel}")
            continue
        data = src.read_bytes()
        try:
            w, h, rgb, pal = da.read_lbm(data)
        except ValueError as e:
            print(f"  SKIP ({e}): {rel}")
            continue
        # derive the raw palette-index buffer directly from the body
        indices = _ilbm_indices(data, w, h)
        stem = Path(rel).stem
        fixture = {
            "file": rel.replace("\\", "/"),
            "stem": stem,
            "width": w,
            "height": h,
            "palette": [list(c) for c in pal] + [[0, 0, 0]] * (256 - len(pal)),
            "indices": indices,
            "rgb": list(rgb),
        }
        out_path = ILBM_DIR / f"{stem}.json"
        out_path.write_text(json.dumps(fixture, separators=(",", ":")))
        print(f"  wrote ilbm/{out_path.name}  ({w}x{h}, {len(pal)} colors)")
        written += 1
    return written


def _ilbm_indices(data: bytes, w: int, h: int) -> list[int]:
    """Re-run read_lbm's deinterleave to recover the raw palette-index buffer."""
    import struct
    off = 12
    bmhd = body = None
    while off + 8 <= len(data):
        cid = data[off:off + 4]
        csz = struct.unpack_from(">I", data, off + 4)[0]
        payload = data[off + 8: off + 8 + csz]
        if cid == b"BMHD":
            bmhd = payload
        elif cid == b"BODY":
            body = payload
        off += 8 + csz + (csz & 1)
    _w, _h, _, _, nplanes, mask, comp = struct.unpack_from(">HHhhBBB", bmhd, 0)
    if comp == 1:
        raw = bytearray()
        i = 0
        while i < len(body):
            n = body[i]; i += 1
            if n < 128:
                cnt = n + 1; raw += body[i:i + cnt]; i += cnt
            elif n > 128:
                cnt = 257 - n; raw += bytes([body[i]]) * cnt; i += 1
        body = bytes(raw)
    row_bytes = (w + 15) // 16 * 2
    total_planes = nplanes + (1 if mask == 1 else 0)
    out = []
    for y in range(h):
        rbase = y * row_bytes * total_planes
        for x in range(w):
            byte_i = x >> 3; bit = 7 - (x & 7); idx = 0
            for p in range(nplanes):
                b = body[rbase + p * row_bytes + byte_i]
                idx |= ((b >> bit) & 1) << p
            out.append(idx)
    return out


# --------------------------------------------------------------------------- #
# GLIB (Amiga .TLB/.GLB — big-endian HLIB sibling; see docs/glib-format.md)
#
# Sources are the user's EXTERNAL Amiga WHDLoad installs (read-only, not
# vendored), so these targets use ABSOLUTE paths and are skipped wholesale on
# machines without the drive. Coverage: 5-plane raw-masked (0xE1) leaf,
# LZ77-compressed master with a two-stream 0xE3 image, LZW-compressed master
# with a chunky-4bpp 0x02 image, and a 4-plane two-stream 0x03 leaf.
# --------------------------------------------------------------------------- #
_AMIGA_ROOT = Path(r"D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks"
                   r"\WHDLoad Collection\Games-WHDLoad\unpacked")
GLIB_TARGETS = [
    # (absolute source path, walk label)
    (_AMIGA_ROOT / "DarkQueenOfKrynn/data/Disk2/CPIC.TLB", "img002"),          # 0xE1 raw masked (mask=1 -> 255), stored
    (_AMIGA_ROOT / "DarkQueenOfKrynn/data/Disk1/TITLE.TLB", "set10_img002"),   # 0xE3 two-stream, LZ77 sets
    (_AMIGA_ROOT / "CurseOfTheAzureBonds/data/DISKB/PIC.TLB", "set01_img000"), # 0x02 chunky RLE, LZW sets
    (_AMIGA_ROOT / "CurseOfTheAzureBonds/data/DISKA/SKY.TLB", "img000"),       # 0x03 4-plane two-stream
    (_AMIGA_ROOT / "CurseOfTheAzureBonds/data/DISKB/TITLE.TLB", "img001"),     # 0xD2 4-plane RLE + real 0x08 palette
    (_AMIGA_ROOT / "DarkQueenOfKrynn/data/Disk3/FRAME.TLB", "img013"),         # 0xE1 + first_col=16 0xE8 table merge
]


def write_glib_fixtures() -> int:
    GLIB_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for src, target_label in GLIB_TARGETS:
        if not src.exists():
            print(f"  SKIP (missing external Amiga file): {src}")
            continue
        data = src.read_bytes()
        found = None
        for label, w, h, px, pal, dm in gl.walk(data):
            if label == target_label:
                found = (label, w, h, px, pal, dm)
                break
        if found is None:
            print(f"  SKIP (label {target_label} not found): {src}")
            continue
        label, w, h, px, pal, dm = found
        rgb = gl.indices_to_rgb(px, w, h, pal)
        stem = src.stem
        fixture = {
            "file": str(src).replace("\\", "/"),
            "stem": stem,
            "label": label,
            "width": w,
            "height": h,
            "drawMethod": dm,
            "indices": list(px),
            "rgb": list(rgb),
        }
        out_path = GLIB_DIR / f"{stem}_{label}.json"
        out_path.write_text(json.dumps(fixture, separators=(",", ":")))
        print(f"  wrote glib/{out_path.name}  ({w}x{h}, method {dm:#04x})")
        written += 1
    return written


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    palette = [list(c) for c in dx.EGA_PALETTE]
    written = 0
    for rel, block_id in TARGETS:
        src = REPO_ROOT / rel
        if not src.exists():
            print(f"  SKIP (missing game file): {rel}")
            continue
        width, height, indices = decode_block(src, block_id)
        stem = Path(rel).stem
        fixture = {
            "file": rel.replace("\\", "/"),
            "stem": stem,
            "blockId": block_id,
            "width": width,
            "height": height,
            "palette": palette,
            "indices": indices,
        }
        out_path = OUT_DIR / f"{stem}_{block_id}.json"
        out_path.write_text(json.dumps(fixture, separators=(",", ":")))
        print(f"  wrote dax/{out_path.name}  ({width}x{height}, {len(indices)} px)")
        written += 1

    print(f"DAX: {written} fixture(s) in {OUT_DIR}")
    print("DAA:")
    nd = write_daa_fixtures()
    print("HLIB:")
    nh = write_hlib_fixtures()
    print("ILBM:")
    ni = write_ilbm_fixtures()
    print("GLIB:")
    ng = write_glib_fixtures()
    print(f"Done: DAX={written} DAA={nd} HLIB={nh} ILBM={ni} GLIB={ng}")


if __name__ == "__main__":
    main()
