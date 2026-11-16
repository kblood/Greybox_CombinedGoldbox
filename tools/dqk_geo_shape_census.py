#!/usr/bin/env python3
"""Census tool for R4 (round 29): dump (areaId, member, h, w) for every DQK Gen2 GEO map.

Reads DISK3/GEO.GLB directly (HLIB "DATA"-style container: member[0] is the id table,
members[1..N] are the maps). Uses the CORRECTED (height, width) header order that
packages/engine/src/loaders/geo.ts adopted in commit dc12cd1 (2026-08-07):
    raw[0] = height (H)
    raw[1] = width  (W)
    bytes 2..7 = 6 reserved header bytes
    then 4 planes of W*H bytes each (plane0 NE-walls, plane1 SW-walls, plane2 backdrop,
    plane3 doors), row-major with stride W: cell(x, y) -> plane[y*W + x].

This is independent of dqk_ecl_combat_scan.py's HlibDataArchive reader (re-implemented
here in ~15 lines) so the census does not depend on any file this round must not touch.

Usage:
    python tools/dqk_geo_shape_census.py [path-to-GEO.GLB]
"""
from __future__ import annotations

import struct
import sys
from dataclasses import dataclass
from pathlib import Path

GEO_GLB_DEFAULT = Path(
    r"C:\Program Files (x86)\GOG Galaxy\Games\The Dark Queen of Krynn\DISK3\GEO.GLB"
)

GEN2_GEO_HEADER = 8


@dataclass(frozen=True)
class Gen2GeoShape:
    area_id: int
    member: int
    height: int
    width: int
    raw_len: int
    header6: bytes


def read_hlib_members(data: bytes) -> list[bytes]:
    if data[:4] != b"HLIB":
        raise ValueError("not an HLIB container")
    count = struct.unpack_from("<H", data, 8)[0] + 1
    ptrs = [struct.unpack_from("<I", data, 16 + i * 4)[0] for i in range(count)]
    return [data[ptrs[i] : ptrs[i + 1]] for i in range(len(ptrs) - 1)]


def parse_id_table(member0: bytes) -> dict[int, int]:
    """member -> area id (mirrors geo.ts parseGen2IdTable, which returns memberToId)."""
    if len(member0) < 2:
        return {}
    count = struct.unpack_from("<H", member0, 0)[0]
    out: dict[int, int] = {}
    for i in range(count):
        off = 2 + i * 4
        if off + 4 > len(member0):
            break
        area_id, member = struct.unpack_from("<HH", member0, off)
        out[member] = area_id
    return out


def sniff_gen2_geo_block(raw: bytes) -> tuple[int, int] | None:
    """Returns (h, w) if raw looks like a well-formed Gen2 GEO map member, else None."""
    if len(raw) < GEN2_GEO_HEADER:
        return None
    h, w = raw[0], raw[1]
    if w < 1 or h < 1:
        return None
    if len(raw) != GEN2_GEO_HEADER + 4 * w * h:
        return None
    return h, w


def census(geo_glb_path: Path) -> list[Gen2GeoShape]:
    data = geo_glb_path.read_bytes()
    members = read_hlib_members(data)
    member_to_id = parse_id_table(members[0]) if members else {}
    shapes: list[Gen2GeoShape] = []
    positional = 0
    for mi, m in enumerate(members):
        shape = sniff_gen2_geo_block(m)
        if shape is None:
            continue
        positional += 1
        h, w = shape
        area_id = member_to_id.get(mi, positional)
        shapes.append(Gen2GeoShape(area_id, mi, h, w, len(m), bytes(m[2:8])))
    return shapes


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else GEO_GLB_DEFAULT
    shapes = census(path)
    shapes.sort(key=lambda s: s.area_id)
    print(f"{'area':>5} {'member':>7} {'h':>4} {'w':>4} {'square':>7} {'raw_len':>8}  header6")
    non_square = []
    for s in shapes:
        sq = "yes" if s.height == s.width else "no"
        if s.height != s.width:
            non_square.append(s)
        print(
            f"{s.area_id:>5} {s.member:>7} {s.height:>4} {s.width:>4} {sq:>7} "
            f"{s.raw_len:>8}  {s.header6.hex()}"
        )
    print(f"\ntotal maps: {len(shapes)}")
    print(f"non-square: {len(non_square)} -> areas {[s.area_id for s in non_square]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
