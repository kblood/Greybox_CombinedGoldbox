#!/usr/bin/env python3
"""
pool_amiga_golden.py -- hashes-only golden fixture generator for the Pool of Radiance
Amiga `.dax` decoder, used to pin the TypeScript port (`packages/engine/src/loaders/
poolAmiga.ts`) against the Python oracle (`tools/pool_amiga_decode.py`) byte-for-byte
WITHOUT vendoring any pixel data into the repo.

Emits one JSON object:

  {
    "sourceDir": "<the D:/ WHDLoad path, for reproducibility -- not read by any test>",
    "files": {
      "<filename>.dax": {
        "blocks": [
          {
            "index": 0, "blockId": <int>, "dataOffset": <int>,
            "compSize": <int>, "rawSize": <int>,
            "rawSha256": "<sha256 of the decompressed bytes>",
            "kind": "standard" | "animated" | "data",
            "width": <int|null>, "height": <int|null>,
            "frameCount": <int>,
            "frameSha256": ["<sha256 of each decoded frame's index array>", ...]
          },
          ...
        ]
      },
      ...
    },
    "totals": { "files": 23, "blocks": 843, "frames": <N> }
  }

`frameSha256`/`frameCount` are empty/0 for 'data' blocks (ecl/geo/item/moncha/monitm/
monspc/walldef -- no frame header). Each hash is computed over raw bytes (`bytes(...)`
for the decompressed block, `bytes(idx)` for a frame's index array) with `hashlib.
sha256`, matching the byte layout the TS port must reproduce (`Uint8Array` contents,
same row-major top-left-origin order `planar_to_indices` already uses).

Usage:
  python tools/pool_amiga_golden.py [--data-dir DIR] [--out FILE]

Defaults: --data-dir is the WHDLoad Pool of Radiance data folder (see
docs/pool-amiga-format.md); --out is
packages/engine/test/fixtures/pool-amiga-golden.json.
"""
from __future__ import annotations
import argparse, hashlib, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pool_amiga_decode as P

DEFAULT_DATA_DIR = Path(
    "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/"
    "unpacked/PoolOfRadiance/data"
)
DEFAULT_OUT = Path(__file__).parent.parent / "packages/engine/test/fixtures/pool-amiga-golden.json"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_file_record(path: Path) -> dict:
    data = path.read_bytes()
    base, blocks = P.parse_container(data)
    out_blocks = []
    for blk in blocks:
        raw = P.decompress_block(data, base, blk)
        rec = {
            "index": blk.index,
            "blockId": blk.block_id,
            "dataOffset": blk.data_offset,
            "compSize": blk.comp_size,
            "rawSize": blk.raw_size,
            "rawSha256": sha256_hex(raw),
            "kind": "data",
            "width": None,
            "height": None,
            "frameCount": 0,
            "frameSha256": [],
        }
        std = P.parse_standard(raw)
        if std:
            w, h, frames = std
            rec["kind"] = "standard"
            rec["width"] = w
            rec["height"] = h
            rec["frameCount"] = len(frames)
            rec["frameSha256"] = [sha256_hex(bytes(f)) for f in frames]
        else:
            anim = P.parse_animated(raw)
            if anim:
                rec["kind"] = "animated"
                # Animated frames can vary in size (sprit); record per-frame w/h alongside
                # the hash rather than a single archive-wide width/height.
                rec["frameCount"] = len(anim)
                rec["frameSha256"] = [sha256_hex(bytes(idx)) for (_delay, _w, _h, idx) in anim]
                rec["animFrames"] = [
                    {"delay": delay, "width": w, "height": h} for (delay, w, h, idx) in anim
                ]
        out_blocks.append(rec)
    return {"blocks": out_blocks}


def build_golden(data_dir: Path) -> dict:
    files = {}
    total_blocks = 0
    total_frames = 0
    for path in sorted(data_dir.glob("*.dax")):
        rec = build_file_record(path)
        files[path.name] = rec
        total_blocks += len(rec["blocks"])
        total_frames += sum(b["frameCount"] for b in rec["blocks"])
    return {
        "sourceDir": str(data_dir),
        "files": files,
        "totals": {"files": len(files), "blocks": total_blocks, "frames": total_frames},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    if not args.data_dir.exists():
        print(f"error: data dir not found: {args.data_dir}", file=sys.stderr)
        sys.exit(1)

    golden = build_golden(args.data_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    t = golden["totals"]
    print(f"wrote {args.out}: {t['files']} files, {t['blocks']} blocks, {t['frames']} frames")


if __name__ == "__main__":
    main()
