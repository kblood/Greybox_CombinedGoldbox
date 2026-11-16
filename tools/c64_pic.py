#!/usr/bin/env python3
"""Decode the C64 Gold Box fixed-size full-screen picture (the `PIC*` family, 2681/2682 bytes).

This is the C64 counterpart of the DOS `BIGPIC*.DAX` frames, and it renders at the same geometry:
304x120 pixels = 38x8 by 15x8 character cells. The DOS DAX header states that geometry
independently, which is how the size was confirmed without fitting it to a byte count.

Layout (body coordinates = file offset minus the 2-byte CBM load word):

    body    0.. 569   570 B   screen map, 38 cols x 15 rows, row-major -> $CC00 + 40*row + col
    body  570..1139   570 B   colour map, same geometry, low nibble only -> $D800 + 40*row + col
    body 1140..2675  1536 B   192 glyph bitmaps for char codes $40..$FF -> $D200
    body 2676..2678     3 B   VIC registers $D021, $D022, $D023 (background 0/1/2)
    body 2679                 one trailing byte in the 2682-byte files; role unproven

570 + 570 + 1536 + 3 = 2679 exactly. Glyphs $00..$3F are NOT in the picture file -- they come
from the separate 514-byte `CHARSET` file staged at $D000, which is why every earlier fit that
assumed a 2048-byte in-file character set failed to close.

The blit is `GDRIVE02` (stored load word $4000, real origin $C000, entry $C000 -> JMP $C045). It
writes the colour byte with `STA ($B0),Y` and no masking, so the file's high nibble is dirty and
hardware-ignored -- and bit 3 of the low nibble genuinely selects multicolour vs hires per cell.

Scope: the layout decodes Champions of Krynn, Death Knights of Krynn, Curse of the Azure Bonds,
Secret of the Silver Blades, Buck Rogers and Gateway to the Savage Frontier. The blit code above
is byte-identical for the first four; Buck Rogers has a picture-id special case, and Gateway's
blit is a different routine that has not been read -- its data fits the layout regardless.
Pool of Radiance ships no picture of this size at all.

Buck Rogers' own `GDRIVE02` special-cases exactly two ids, PIC71 and PIC72: at $C066 it reads the
picture id and, only for $71/$72, decrements the glyph copy's *destination* pointer from $D200 to
$D1FF before the 1536-byte glyph copy -- one byte early, not a whole glyph. Disassembling that
branch to completion (docs/engine/research/c64-disk-format.md 7.4) shows it changes nothing else:
same 1536-byte source ($7374), same screen/colour copy. But a destination one byte low means the
picture's own glyph bytes land one byte into what is otherwise the *resident* CHARSET's tail (row
7 of glyph $3F, at $D1FF is the CHARSET's last byte), and the copy then ends one byte short of the
normal $D7FF, leaving the table's last byte (row 7 of glyph $FF) unwritten. `glyph_dest_shift`
below models exactly that address collision; it is not a naive block/byte shift of the picture's
own glyph plane, which is what earlier attempts (recorded in the doc) tried and failed with.

See docs/engine/research/c64-disk-format.md section 7.4.

Usage:
    python tools/c64_pic.py --disk "D:/.../Champions of Krynn - Side 1.d64" --name PIC70 --out a.png
    python tools/c64_pic.py --disk DISK.d64 --all --outdir renders/c64
    python tools/c64_pic.py PIC70.prg --charset CHARSET.prg --out a.png
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disk as c64  # noqa: E402

COLS, ROWS = 38, 15
CELL = 8
WIDTH, HEIGHT = COLS * CELL, ROWS * CELL

SCREEN_LEN = COLS * ROWS          # 570
COLOUR_OFF = SCREEN_LEN           # 570
GLYPH_OFF = SCREEN_LEN * 2        # 1140
GLYPH_COUNT = 192                 # codes $40..$FF
GLYPH_LEN = GLYPH_COUNT * 8       # 1536
REG_OFF = GLYPH_OFF + GLYPH_LEN   # 2676
BODY_LEN = REG_OFF + 3            # 2679
SIZES = (BODY_LEN + 2, BODY_LEN + 3)  # 2681, 2682

RESIDENT_GLYPHS = 0x40            # codes below this come from the CHARSET file
CHARSET_BODY = RESIDENT_GLYPHS * 8  # 512
TABLE_LEN = 256 * 8                # 2048 -- the full VIC character table, codes $00..$FF

# Buck Rogers ids that GDRIVE02's $C066 branch special-cases (glyph destination $D1FF, not $D200).
# Scoped to Buck Rogers specifically: CoK/DoK/CoAB/Secret share one byte-identical GDRIVE02 with no
# such branch, and Gateway's own (unread) GDRIVE02 already decodes its pictures with no shift.
BUCK_GLYPH_SHIFT_IDS = {"PIC71": -1, "PIC72": -1}


def buck_glyph_shift(disk_or_title: str, name: str) -> int:
    """The `glyph_dest_shift` for a picture `name` from a disk/title path, 0 unless it is one of
    the two Buck Rogers ids above and the source is actually Buck Rogers."""
    if "buck rogers" in disk_or_title.lower():
        return BUCK_GLYPH_SHIFT_IDS.get(name, 0)
    return 0


def glyph_table(resident: bytes, shipped: bytes, glyph_dest_shift: int = 0) -> bytes:
    """The 2048-byte VIC character table ($D000..$D7FF, codes $00-$FF) as it actually lands in
    memory. With `glyph_dest_shift` 0 this is just `resident + shipped` back to back (512 + 1536 =
    2048, no interaction) -- the ordinary case. A non-zero shift moves where `shipped` lands
    relative to `resident`'s end, which can overwrite `resident`'s tail and/or leave the table's
    own tail unwritten (default 0) -- exactly what Buck Rogers' GDRIVE02 does for ids $71/$72."""
    table = bytearray(TABLE_LEN)
    table[:len(resident)] = resident
    start = len(resident) + glyph_dest_shift
    table[start:start + len(shipped)] = shipped
    return bytes(table)

# The VIC-II palette, in the widely-used Pepto colodore measurement.
PALETTE = [
    (0x00, 0x00, 0x00), (0xFF, 0xFF, 0xFF), (0x81, 0x33, 0x38), (0x75, 0xCE, 0xC8),
    (0x8E, 0x3C, 0x97), (0x56, 0xAC, 0x4D), (0x2E, 0x2C, 0x9B), (0xED, 0xF1, 0x71),
    (0x8E, 0x50, 0x29), (0x55, 0x38, 0x00), (0xC4, 0x6C, 0x71), (0x4A, 0x4A, 0x4A),
    (0x7B, 0x7B, 0x7B), (0xA9, 0xFF, 0x9F), (0x70, 0x6D, 0xEB), (0xB2, 0xB2, 0xB2),
]


def body(prg: bytes) -> bytes:
    """Strip the 2-byte CBM load word. For this corpus it is a staging buffer, not a destination."""
    return prg[2:]


def is_picture(prg: bytes) -> bool:
    return len(prg) in SIZES


def charset_glyphs(prg: bytes) -> bytes:
    """The 64 resident glyphs ($00..$3F) from a CHARSET file."""
    data = body(prg)
    if len(data) < CHARSET_BODY:
        raise ValueError(f"CHARSET too short: {len(data)} body bytes, need {CHARSET_BODY}")
    return data[:CHARSET_BODY]


class Picture:
    """A parsed picture. Fields are views into the body, so a bad file fails at parse, not at draw."""

    def __init__(self, prg: bytes, glyph_dest_shift: int = 0):
        """`glyph_dest_shift` is 0 for every picture except Buck Rogers ids $71/$72 (see
        `BUCK_GLYPH_SHIFT_IDS` and `glyph_table` above) -- it is a property of which id the game
        requested, not of the file bytes, so callers must supply it (`buck_glyph_shift` helps)."""
        if not is_picture(prg):
            raise ValueError(f"not a fixed-size picture: {len(prg)} bytes, expected one of {SIZES}")
        b = body(prg)
        self.screen = b[:SCREEN_LEN]
        self.colour = b[COLOUR_OFF:COLOUR_OFF + SCREEN_LEN]
        self.glyphs = b[GLYPH_OFF:GLYPH_OFF + GLYPH_LEN]
        self.bg0, self.bg1, self.bg2 = b[REG_OFF], b[REG_OFF + 1], b[REG_OFF + 2]
        self.trailing = b[BODY_LEN] if len(b) > BODY_LEN else None
        self.glyph_dest_shift = glyph_dest_shift
        self._table_cache: tuple[bytes, bytes] | None = None  # (resident, built table)

    def glyph(self, code: int, resident: bytes) -> bytes:
        if self._table_cache is None or self._table_cache[0] != resident:
            table = glyph_table(resident, self.glyphs, self.glyph_dest_shift)
            self._table_cache = (resident, table)
        return self._table_cache[1][code * 8:code * 8 + 8]

    def indices(self, resident: bytes) -> bytearray:
        """Render to WIDTH*HEIGHT palette indices.

        Per cell, the colour RAM nibble's bit 3 chooses the mode -- that is VIC-II hardware, and the
        blit stores the byte unmasked, so the file's high nibble never reaches the decision.
        """
        px = bytearray(WIDTH * HEIGHT)
        for cy in range(ROWS):
            for cx in range(COLS):
                k = cy * COLS + cx
                bits = self.glyph(self.screen[k], resident)
                nib = self.colour[k] & 0x0F
                multicolour = bool(nib & 0x08)
                for r in range(8):
                    byte = bits[r]
                    base = (cy * 8 + r) * WIDTH + cx * 8
                    if multicolour:
                        for j in range(4):
                            v = (byte >> (6 - 2 * j)) & 3
                            idx = (self.bg0, self.bg1, self.bg2)[v] & 0x0F if v < 3 else nib & 0x07
                            px[base + j * 2] = idx
                            px[base + j * 2 + 1] = idx
                    else:
                        for j in range(8):
                            px[base + j] = nib if (byte >> (7 - j)) & 1 else self.bg0 & 0x0F
        return px

    def rgb(self, resident: bytes) -> bytes:
        out = bytearray(WIDTH * HEIGHT * 3)
        for i, idx in enumerate(self.indices(resident)):
            out[i * 3:i * 3 + 3] = bytes(PALETTE[idx])
        return bytes(out)


def write_png(path: Path, width: int, height: int, rgb: bytes, scale: int = 1) -> None:
    try:
        from PIL import Image
    except ImportError:
        _write_png_raw(path, width, height, rgb)
        return
    im = Image.frombytes("RGB", (width, height), bytes(rgb))
    if scale != 1:
        im = im.resize((width * scale, height * scale), Image.NEAREST)
    im.save(path)


def _write_png_raw(path: Path, width: int, height: int, rgb: bytes) -> None:
    import zlib
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgb[y * width * 3:(y + 1) * width * 3]

    def chunk(typ: bytes, payload: bytes) -> bytes:
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def disk_files(image: Path) -> dict[str, bytes]:
    """Every readable closed PRG on one image, by name."""
    disk = c64.read_image(image)
    out: dict[str, bytes] = {}
    for e in c64.directory(disk):
        if e.file_type != "PRG" or not e.closed:
            continue
        data, problem = c64.read_file_checked(disk, e)
        if not problem:
            out[e.name] = data
    return out


def find_charset(image: Path, files: dict[str, bytes] | None = None) -> bytes:
    """The CHARSET file lives beside the pictures; without it codes below $40 cannot be drawn."""
    files = files if files is not None else disk_files(image)
    for name, data in files.items():
        if name.startswith("CHARSET"):
            return charset_glyphs(data)
    raise FileNotFoundError(f"no CHARSET file on {image.name}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", type=Path, nargs="?", help="a picture PRG extracted from a disk")
    ap.add_argument("--charset", type=Path, help="the CHARSET PRG (required with a loose file)")
    ap.add_argument("--disk", type=Path, help="read the picture straight out of a .d64/.g64")
    ap.add_argument("--name", help="picture name on --disk, e.g. PIC70")
    ap.add_argument("--all", action="store_true", help="render every picture on --disk")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--outdir", type=Path, default=Path("renders/c64"))
    ap.add_argument("--scale", type=int, default=1)
    ap.add_argument("--glyph-shift", type=int, default=0,
                    help="glyph copy destination offset from $D200, in bytes; -1 for a loose Buck "
                         "Rogers PIC71/PIC72 file (auto-applied already when using --disk)")
    a = ap.parse_args(argv)

    if a.disk:
        files = disk_files(a.disk)
        resident = find_charset(a.disk, files)
        wanted = ([n for n, d in sorted(files.items()) if is_picture(d)]
                  if a.all else [a.name] if a.name else [])
        if not wanted:
            print("give --name or --all", file=sys.stderr)
            return 2
        a.outdir.mkdir(parents=True, exist_ok=True)
        for name in wanted:
            if name not in files:
                print(f"{name}: not on {a.disk.name}", file=sys.stderr)
                return 1
            shift = buck_glyph_shift(str(a.disk), name)
            pic = Picture(files[name], glyph_dest_shift=shift)
            out = a.out if (a.out and not a.all) else a.outdir / f"{name}.png"
            write_png(out, WIDTH, HEIGHT, pic.rgb(resident), a.scale)
            print(f"{name} -> {out}")
        return 0

    if not a.file or not a.charset:
        print("give --disk, or a picture file with --charset", file=sys.stderr)
        return 2
    pic = Picture(a.file.read_bytes(), glyph_dest_shift=a.glyph_shift)
    resident = charset_glyphs(a.charset.read_bytes())
    out = a.out or a.file.with_suffix(".png")
    write_png(out, WIDTH, HEIGHT, pic.rgb(resident), a.scale)
    print(f"{a.file.name} -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
