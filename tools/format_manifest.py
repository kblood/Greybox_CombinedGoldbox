#!/usr/bin/env python3
"""format_manifest.py -- oracle side of the cc format-support test harness.

Emit a deterministic JSON manifest of a Gold Box container's members, where each
member is hashed by the SAME bytes the cc asm extractor writes out:

  * DAX  (DOS CoK/DoK)   : the DECOMPRESSED block bytes  (CCGBC X / CCGBC XA)
  * DAA  (Amiga CoK/DoK) : the DECOMPRESSED block bytes  (CCDAA extract)
  * HLIB (DQK .TLB/.GLB) : the raw pointer-span bytes     (CCHLIB X)

The cc harness (native/ccformats-test.ps1) runs the asm tool under DOSBox to
produce per-member files, hashes them, and diffs the hashes against this
manifest. Identical hashes == the asm container parse + RLE/pointer logic is
byte-identical to the verified Python decoder (the oracle). No rendering needed,
so the check is exact and deterministic.

Usage:
  python tools/format_manifest.py --kind dax  "Champions of Krynn/TITLE.DAX"
  python tools/format_manifest.py --kind daa  amiga_extracted/.../PIC1.DAA
  python tools/format_manifest.py --kind hlib "The Dark Queen of Krynn/DISK3/GEO.GLB"

Prints JSON: {"file","kind","count","members":[{"index","id","size","sha256"}...]}.
"""
import argparse, hashlib, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _manifest_blocks(data, data_base, blocks, mod):
    members = []
    for blk in blocks:
        try:
            raw = mod.decompress_block(data, data_base, blk)
            members.append({"index": blk.index, "id": blk.block_id,
                            "size": len(raw), "sha256": _sha(raw)})
        except Exception as e:  # record the failure so the diff flags it, not crashes
            members.append({"index": blk.index, "id": blk.block_id,
                            "size": -1, "sha256": f"DECOMPRESS_FAILED:{e}"})
    return members


def manifest_dax(path: Path):
    """DOS DAX: parse_container -> (data_base, blocks); decompressed-block manifest."""
    import dax_decode as M
    data = path.read_bytes()
    data_base, blocks = M.parse_container(data)
    return "blocks", data_base, _manifest_blocks(data, data_base, blocks, M)


def manifest_daa(path: Path):
    """Amiga DAA: parse_container -> (kind, data_base, blocks). 'blocks' = standard
    9-byte TOC (decompressed-block manifest); 'index' = 6-byte sub-frame container
    (the GAP cell handled by subframe_decode.py -- no standard manifest)."""
    import daa_decode as M
    data = path.read_bytes()
    kind, data_base, blocks = M.parse_container(data)
    if kind != "blocks":
        return kind, data_base, []  # sub-frame index: not a standard-decompress cell
    return kind, data_base, _manifest_blocks(data, data_base, blocks, M)


def _daa_frame_indices(raw, width, height, pix_off):
    """Planar 5-plane -> palette-index buffer (matches CCDAA planar_to_indices)."""
    NUM_PLANES = 5
    row_bytes = ((width + 15) // 16) * 2
    plane_size = row_bytes * height
    pix = raw[pix_off:]
    out = bytearray(width * height)
    o = 0
    for y in range(height):
        rbase = y * row_bytes
        for x in range(width):
            byte_i = rbase + (x >> 3)
            bit = 7 - (x & 7)
            idx = 0
            for p in range(NUM_PLANES):
                idx |= ((pix[p * plane_size + byte_i] >> bit) & 1) << p
            out[o] = idx
            o += 1
    return out


def manifest_daa_raw(path: Path):
    """Amiga DAA render-RAW: per standard-frame member, the EXACT bytes CCDAA's
    /D dump writes to CCDAA.RAW = imgw(2 LE) imgh(2 LE) indices(w*h) pal(768).
    Non-standard members (8X8D / sub-frame / complex) get sha 'NOT_STANDARD_FRAME'
    so the harness samples only the renderable indices."""
    import struct
    import daa_decode as M
    data = path.read_bytes()
    kind, data_base, blocks = M.parse_container(data)
    if kind != "blocks":
        return "index", []  # 6-byte sub-frame container: no standard render
    members = []
    for blk in blocks:
        try:
            raw = M.decompress_block(data, data_base, blk)
            fh = M.parse_frame_header(raw)
            if fh is None:
                members.append({"index": blk.index, "id": blk.block_id,
                                "size": -1, "sha256": "NOT_STANDARD_FRAME"})
                continue
            width, height, pal, pix_off = fh
            idx = _daa_frame_indices(raw, width, height, pix_off)
            palbytes = bytearray(768)
            for c, (r, g, b) in enumerate(pal):
                palbytes[c * 3] = r
                palbytes[c * 3 + 1] = g
                palbytes[c * 3 + 2] = b
            rawout = struct.pack("<HH", width, height) + bytes(idx) + bytes(palbytes)
            members.append({"index": blk.index, "id": blk.block_id,
                            "size": len(rawout), "sha256": _sha(rawout)})
        except Exception as e:
            members.append({"index": blk.index, "id": blk.block_id,
                            "size": -1, "sha256": f"DECODE_FAILED:{e}"})
    return "blocks", members


def manifest_hlib(path: Path):
    """HLIB: flat pointer-span members data[ptrs[i]:ptrs[i+1]] (matches CCHLIB X)."""
    import hlib_decode as H
    data = path.read_bytes()
    hdr = H.read_header(data)
    ptrs = hdr["ptrs"]
    members = []
    for i in range(len(ptrs) - 1):
        span = data[ptrs[i]:ptrs[i + 1]]
        members.append({"index": i, "id": i, "size": len(span), "sha256": _sha(span)})
    return hdr["tag"].decode("latin1", "replace"), members


def main():
    ap = argparse.ArgumentParser(description="Oracle manifest for cc format-support tests")
    ap.add_argument("--kind", required=True,
                    choices=["dax", "daa", "daa-raw", "hlib"])
    ap.add_argument("file", type=Path)
    ap.add_argument("--out", type=Path, default=None, help="write JSON here (default stdout)")
    args = ap.parse_args()

    if not args.file.exists():
        print(f"ERROR: no such file: {args.file}", file=sys.stderr)
        sys.exit(2)

    extra = {}
    if args.kind == "dax":
        kind, data_base, members = manifest_dax(args.file)
        extra["data_base"] = data_base
        extra["container_kind"] = kind
    elif args.kind == "daa":
        kind, data_base, members = manifest_daa(args.file)
        extra["data_base"] = data_base
        extra["container_kind"] = kind
    elif args.kind == "daa-raw":
        kind, members = manifest_daa_raw(args.file)
        extra["container_kind"] = kind
    else:
        tag, members = manifest_hlib(args.file)
        extra["tag"] = tag

    out = {"file": str(args.file), "kind": args.kind,
           "count": len(members), **extra, "members": members}
    text = json.dumps(out, indent=2)
    if args.out:
        args.out.write_text(text)
        print(f"wrote {args.out}  ({len(members)} members)")
    else:
        print(text)


if __name__ == "__main__":
    main()
