#!/usr/bin/env python3
"""frua_geo_preview_model.py - T11-2: pure-Python model of native/src/ccgeo.asm
open_frua_geo (FRUA GEOnnn.DAT -> CCGEO `geobuf`).

geobuf layout produced by the asm: [W, H, 0,0, 0,0, 0,0] then four planes of
W*H bytes (plane order p0,p1,p2,p3 contiguous from geobuf+8):
  p0 = (N&F)<<4 | (E&F)     p1 = (S&F)<<4 | (W&F)
  p2 = cell byte 5 (backdrop+zone)
  p3 = door classes of the N/E/S/W high nibbles, 2 bits each (N low .. W high)
Cells are the 6-byte records at 322 + 6*i, i linear in 0..W*H-1 (row-major is
the renderer's convention and is NOT established by this model).  This is NOT a
Gen1 1026-byte grid: the geobuf is 8 + 4*W*H, shared with the Gen2 HLIB layout.

Preview: wall slot = low nibble of each side byte (0 = open edge).
Usage: frua_geo_preview_model.py [install] [outdir]   (PNG to renders/frua-preview)
"""
from __future__ import annotations
import struct
import sys
import zlib
from pathlib import Path

MIN, MAX, GRID_OFF, GRID_MAX = 6200, 13000, 322, 576
MARKS = ((0, b"FORM"), (8, b"AMOD"), (314, b"MAP"), (3778, b"ENCR"), (5786, b"STRG"))
DEFAULT_INSTALL = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures")


class GeoReject(ValueError):
    pass


def door_flag(b: int) -> int:
    """frua_door_flag: 0 plain (open/blocked E0), 2 special (10 secret, F0 false door), else 1."""
    hi = b & 0xF0
    if hi == 0 or hi == 0xE0:
        return 0
    if hi in (0x10, 0xF0):
        return 2
    return 1


def normalize(data: bytes) -> bytes:
    """Return geobuf bytes exactly as open_frua_geo builds them, or raise GeoReject."""
    n = len(data)
    if n < MIN or n > MAX:
        raise GeoReject(f"size {n} outside {MIN}..{MAX}")
    for off, tag in MARKS:
        if data[off:off + len(tag)] != tag:
            raise GeoReject(f"marker {tag!r} missing at {off}")
    w, h = data[27], data[26]
    if w == 0 or h == 0:
        raise GeoReject("zero width/height")
    plane = w * h
    if plane > GRID_MAX:
        raise GeoReject(f"w*h {plane} > {GRID_MAX}")
    p0, p1, p2, p3 = (bytearray(plane) for _ in range(4))
    for i in range(plane):
        c = data[GRID_OFF + 6 * i: GRID_OFF + 6 * i + 6]
        p0[i] = ((c[0] & 15) << 4) | (c[1] & 15)
        p1[i] = ((c[2] & 15) << 4) | (c[3] & 15)
        p2[i] = c[5]
        p3[i] = (door_flag(c[0]) | door_flag(c[1]) << 2 | door_flag(c[2]) << 4 | door_flag(c[3]) << 6) & 0xFF
    return bytes([w, h, 0, 0, 0, 0, 0, 0]) + bytes(p0 + p1 + p2 + p3)


def edges(geobuf: bytes):
    """Yield (x, y, N, E, S, W) wall-slot nibbles from a geobuf (row-major assumed)."""
    w, h = geobuf[0], geobuf[1]
    pl = w * h
    p0, p1 = geobuf[8:8 + pl], geobuf[8 + pl:8 + 2 * pl]
    for i in range(pl):
        yield i % w, i // w, p0[i] >> 4, p0[i] & 15, p1[i] >> 4, p1[i] & 15


def stats(geobuf: bytes) -> dict:
    cells = walled_cells = open_cells = wall_edges = 0
    for _x, _y, *e in edges(geobuf):
        cells += 1
        k = sum(1 for v in e if v)
        wall_edges += k
        if k:
            walled_cells += 1
        else:
            open_cells += 1
    return {"w": geobuf[0], "h": geobuf[1], "cells": cells, "cells_walled": walled_cells,
            "cells_open": open_cells, "wall_edges": wall_edges}


def ascii_preview(geobuf: bytes) -> str:
    """3x2 chars per cell: '+--' top if N wall, '|' left if W wall (E/S shared edges drawn at border)."""
    w, h = geobuf[0], geobuf[1]
    g = {(x, y): (n, e, s, wv) for x, y, n, e, s, wv in edges(geobuf)}
    out = []
    for y in range(h):
        out.append("".join("+" + ("--" if g[(x, y)][0] else "  ") for x in range(w)) + "+")
        out.append("".join(("|" if g[(x, y)][3] else " ") + "  " for x in range(w))
                   + ("|" if g[(w - 1, y)][1] else " "))
    out.append("".join("+" + ("--" if g[(x, h - 1)][2] else "  ") for x in range(w)) + "+")
    return "\n".join(out)


def _png(path: Path, w: int, h: int, rows: list) -> None:
    raw = b"".join(b"\0" + bytes(r) for r in rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def render_png(geobuf: bytes, path: Path, s: int = 12) -> None:
    """Grayscale: cell interior 200 (open) / 120 (has wall), edges drawn black when wall slot != 0."""
    w, h = geobuf[0], geobuf[1]
    W, H = w * s, h * s
    img = [[255] * W for _ in range(H)]
    for x, y, n, e, so, wv in edges(geobuf):
        x0, y0 = x * s, y * s
        shade = 120 if (n or e or so or wv) else 200
        for yy in range(y0 + 1, y0 + s - 1):
            for xx in range(x0 + 1, x0 + s - 1):
                img[yy][xx] = shade
        for k in range(s):
            if n: img[y0][x0 + k] = 0
            if so: img[y0 + s - 1][x0 + k] = 0
            if wv: img[y0 + k][x0] = 0
            if e: img[y0 + k][x0 + s - 1] = 0
    _png(path, W, H, img)


def find_geos(install: Path):
    return sorted(Path(install).glob("*.DSN/GEO[0-9][0-9][0-9].DAT"))


def main(argv) -> int:
    install = Path(argv[1]) if len(argv) > 1 else DEFAULT_INSTALL
    out = Path(argv[2]) if len(argv) > 2 else Path(__file__).resolve().parent.parent / "renders" / "frua-preview"
    files = find_geos(install)
    ok = 0
    sizes, tw, to = {}, 0, 0
    for p in files:
        try:
            gb = normalize(p.read_bytes())
        except GeoReject as e:
            print(f"{p.parent.name}/{p.name}: REJECT {e}")
            continue
        ok += 1
        st = stats(gb)
        sizes[(st["w"], st["h"])] = sizes.get((st["w"], st["h"]), 0) + 1
        tw += st["cells_walled"]; to += st["cells_open"]
        render_png(gb, out / f"{p.parent.stem}_{p.stem}.png")
        print(f"{p.parent.name}/{p.name}: {st}")
    print(f"modelled {ok}/{len(files)} grids={sorted(sizes.items())} cells_walled={tw} cells_open={to}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
