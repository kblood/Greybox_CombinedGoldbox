#!/usr/bin/env python3
"""Convert one solved C64 Gold Box `PIC*` scene into CCFP's DOS-native GBIM resource.

The input remains the user's C64 asset: pass a `.d64` image plus the picture's
directory name (for example `PIC70`).  The converter reads its sibling CHARSET,
decodes the documented 304x120 VIC-II picture layout, and writes a bounded
`GBIM` v1 file that `native/src/ccfp.asm` can display through `/K`.

This deliberately covers C64 narrative scenes only.  The C64 WALLDEF layout is
not solved, so this tool does not claim to provide a C64 first-person wall set.

Example:
    python tools/c64_native_scene.py --disk ".../Champions of Krynn - Side 1.D64" \
        --picture PIC70 --block 112 --out C64SCENE.GBI
"""
from __future__ import annotations

import argparse
import struct
from pathlib import Path

import c64_pic


GBIM_MAGIC = b"GBIM"
GBIM_VERSION = 1
GBIM_ROW_MAJOR = 0x01
GBIM_HEADER_SIZE = 14
GBIM_PALETTE_SIZE = 256 * 3


def gbim_scene(picture: c64_pic.Picture, resident: bytes, block_id: int) -> bytes:
    """Encode a C64 picture as CCFP's self-contained row-major GBIM v1 scene."""
    if not 0 <= block_id <= 0xFFFF:
        raise ValueError(f"block id {block_id} is outside uint16")
    pixels = picture.indices(resident)
    if len(pixels) != c64_pic.WIDTH * c64_pic.HEIGHT:
        raise ValueError("C64 picture decoder returned an unexpected pixel length")

    palette = bytearray(GBIM_PALETTE_SIZE)
    for index, rgb in enumerate(c64_pic.PALETTE):
        palette[index * 3:index * 3 + 3] = bytes(rgb)
    header = struct.pack(
        "<4sHHBBHH",
        GBIM_MAGIC,
        GBIM_VERSION,
        block_id,
        GBIM_ROW_MAJOR,
        0,
        c64_pic.WIDTH,
        c64_pic.HEIGHT,
    )
    assert len(header) == GBIM_HEADER_SIZE
    return header + pixels + bytes(palette)


def convert_disk(disk: Path, picture_name: str, block_id: int) -> bytes:
    """Read one picture and its required CHARSET from a C64 disk image."""
    files = c64_pic.disk_files(disk)
    try:
        source = files[picture_name]
    except KeyError as exc:
        raise FileNotFoundError(f"{picture_name} is not a readable PRG on {disk}") from exc
    if not c64_pic.is_picture(source):
        raise ValueError(f"{picture_name} on {disk} is not a fixed-size C64 PIC resource")
    resident = c64_pic.find_charset(disk, files)
    picture = c64_pic.Picture(source, glyph_dest_shift=c64_pic.buck_glyph_shift(str(disk), picture_name))
    return gbim_scene(picture, resident, block_id)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--disk", type=Path, required=True, help="source C64 .d64/.g64 image")
    parser.add_argument("--picture", required=True, help="C64 directory name, e.g. PIC70")
    parser.add_argument("--block", type=lambda value: int(value, 0), required=True, help="logical GBIM block id")
    parser.add_argument("--out", type=Path, required=True, help="output GBIM v1 resource")
    args = parser.parse_args(argv)

    output = convert_disk(args.disk, args.picture, args.block)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(output)
    print(f"{args.disk.name}:{args.picture} -> {args.out} ({len(output)} bytes, block {args.block})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
