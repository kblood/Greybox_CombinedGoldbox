#!/usr/bin/env python3
"""
exp_8x8d_planeorder.py — EXPERIMENT: solve the Amiga .DAA 8X8D within-tile plane order
by matching against the DOS .DAX 8X8D tiles (which decode correctly).

Hypothesis: Amiga 8X8D and DOS 8X8D hold the SAME 16-color dungeon tiles. DOS stores
them chunky (4bpp, 2px/byte); Amiga stores them as 4 contiguous bitplanes (8 bytes each)
per 8x8 tile. If the art is the same, there is a single plane->bit permutation P (and a
fixed index bijection, in case the Amiga 16-color order differs from EGA) such that for
every tile and pixel, amiga_index_P == bijection(dos_index). We brute-force all 24
permutations and check for a globally-consistent index bijection.

Run: python tools/exp_8x8d_planeorder.py
"""
from __future__ import annotations
import struct, itertools, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dax_decode as dx
import daa_decode as da

DOS = Path("Champions of Krynn/8X8D1.DAX")
AMIGA = Path("amiga_extracted/ChampionsOfKrynn/disk2/8X8D1.DAA")


def dos_tiles(raw: bytes):
    """DOS 8X8D block -> list of 8x8 index grids. Header 8 bytes; 16px-wide chunky
    strip (2 tiles per 8-row band, left=px0..7, right=px8..15; 4 bytes/tile-row)."""
    h0, w1 = struct.unpack_from("<HH", raw, 0)
    if h0 != 8 or w1 != 1:
        return None
    pix = raw[8:]
    row_bytes = 8  # 16 px * 4bpp / 8
    nrows = len(pix) // row_bytes
    bands = nrows // 8
    tiles = []
    for band in range(bands):
        for side in range(2):  # left, right tile
            grid = []
            for r in range(8):
                base = (band * 8 + r) * row_bytes + side * 4
                row = []
                for bx in range(4):
                    byte = pix[base + bx]
                    row.append(byte >> 4)
                    row.append(byte & 0x0F)
                grid.append(row)
            tiles.append(grid)
    return tiles


def amiga_tiles(raw: bytes, perm):
    """Amiga 8X8D block -> list of 8x8 index grids under plane->bit permutation `perm`.
    Header 8 bytes, 1 count byte, then count * 32 bytes (4 planes x 8 rows x 1 byte)."""
    h0, w1 = struct.unpack_from(">HH", raw, 0)
    if h0 != 8 or w1 != 1:
        return None
    count = raw[8]
    body = raw[9:]
    if len(body) < count * 32:
        return None
    tiles = []
    for k in range(count):
        t = body[k * 32:(k + 1) * 32]
        planes = [t[p * 8:p * 8 + 8] for p in range(4)]  # plane p = 8 bytes (1/row)
        grid = []
        for r in range(8):
            row = []
            for x in range(8):
                idx = 0
                for p in range(4):
                    bit = (planes[p][r] >> (7 - x)) & 1
                    idx |= bit << perm[p]  # perm[p] = output bit for source plane p
                row.append(idx)
            grid.append(row)
        tiles.append(grid)
    return tiles


def load_blocks(path, which):
    data = path.read_bytes()
    if which == "dos":
        base, blocks = dx.parse_container(data)
        out = {}
        for blk in blocks:
            raw = dx.decompress_block(data, base, blk)
            out[blk.block_id] = raw
        return out
    else:
        kind, base, blocks = da.parse_container(data)
        if kind != "blocks":
            print(f"  Amiga {path.name}: kind={kind} (not block TOC!)")
            return {}
        out = {}
        for blk in blocks:
            raw = da.decompress_block(data, base, blk)
            out[blk.block_id] = raw
        return out


def main():
    dos = load_blocks(DOS, "dos")
    amiga = load_blocks(AMIGA, "amiga")
    print(f"DOS blocks:   {sorted(dos)}")
    print(f"Amiga blocks: {sorted(amiga)}")
    shared = sorted(set(dos) & set(amiga))
    print(f"shared block ids: {shared}\n")

    for bid in shared:
        dtiles = dos_tiles(dos[bid])
        if dtiles is None:
            print(f"block {bid}: DOS not a tile strip (hdr {struct.unpack_from('<HH', dos[bid], 0)})")
            continue
        a_count = amiga[bid][8] if len(amiga[bid]) > 8 else -1
        a_hdr = struct.unpack_from(">HH", amiga[bid], 0)
        print(f"block {bid}: DOS tiles={len(dtiles)}  Amiga hdr={a_hdr} count={a_count} "
              f"raw={len(amiga[bid])} (expect 9+{a_count}*32={9 + a_count*32})")

    # Brute-force the plane->bit permutation across ALL shared blocks/tiles at once.
    print("\nBrute-forcing plane->bit permutations (global index bijection test):")
    best = None
    for perm in itertools.permutations(range(4)):
        mapping = {}      # dos_index -> amiga_index
        inverse = {}      # amiga_index -> dos_index (must stay 1:1)
        ok = True
        compared = 0
        for bid in shared:
            dtiles = dos_tiles(dos[bid])
            atiles = amiga_tiles(amiga[bid], perm)
            if dtiles is None or atiles is None:
                continue
            n = min(len(dtiles), len(atiles))
            for k in range(n):
                for r in range(8):
                    for x in range(8):
                        d = dtiles[k][r][x]
                        a = atiles[k][r][x]
                        compared += 1
                        if d in mapping:
                            if mapping[d] != a:
                                ok = False
                                break
                        elif a in inverse:
                            ok = False
                            break
                        else:
                            mapping[d] = a
                            inverse[a] = d
                    if not ok:
                        break
                if not ok:
                    break
            if not ok:
                break
        tag = "CONSISTENT" if ok else "conflict"
        if ok:
            print(f"  perm plane->bit {perm}: {tag}, {len(mapping)} index pairs, compared {compared}")
            print(f"      dos->amiga index map: {dict(sorted(mapping.items()))}")
            best = (perm, dict(sorted(mapping.items())))
    if not best:
        print("  no globally-consistent permutation found (art differs OR layout assumption wrong)")
    else:
        perm, mp = best
        identity = all(k == v for k, v in mp.items())
        print(f"\nSOLVED plane order = {perm}; index map is "
              f"{'IDENTITY (Amiga uses EGA index order)' if identity else 'a remap (Amiga palette reordered)'}")


if __name__ == "__main__":
    main()
