#!/usr/bin/env python3
"""Quick inspection helper for SSI DAX resource files (Champions/DKK).

The header is a SINGLE little-endian ``uint16`` at offset 0 holding the TOC size in bytes,
which is always nine times the entry count; the 9-byte TOC entries follow it, and the data
section starts at ``2 + toc_bytes``::

    0        2      uint16  toc_bytes = entries * 9
    2    2+toc      TOC     entries x { u8 block_id, u32 data_offset, u16 raw_size, u16 comp_size }
    2+toc  ...      data    concatenated signed-byte-RLE blocks, offsets relative to this base

Full spec and its verification against ``DaxDump.exe``: ``docs/dax-format.md`` section 1.

Until 2026-08-25 this script read a two-word header, ``entry_count`` then ``table_offset``,
and printed an "inferred data base offset" computed from them. Both words were wrong. Word 0
is nine times the entry count, and there is no second header word at all -- those two bytes are
entry 0's ``block_id`` and the low byte of its ``data_offset``. The consequence was not a
cosmetic mislabel: for ``8X8D1.DAX`` it reported 72 entries (there are 8) and a data base of
489 (it is 74), and that reading was copied into three documents. ``--verify`` below is the
check that would have caught it -- the entry chain has to close on the file length exactly.
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

TOC_ENTRY_SIZE = 9


def parse_toc(data: bytes) -> tuple[int, list[dict[str, int]]]:
    """Return (data_base, entries). Raises ValueError if the bytes are not a DAX TOC."""
    if len(data) < 2:
        raise ValueError("too small to hold a header word")
    toc_bytes = struct.unpack_from("<H", data, 0)[0]
    if toc_bytes == 0 or toc_bytes % TOC_ENTRY_SIZE:
        raise ValueError(f"word0={toc_bytes} is not a positive multiple of {TOC_ENTRY_SIZE}")
    data_base = 2 + toc_bytes
    if data_base > len(data):
        raise ValueError(f"TOC of {toc_bytes} bytes overruns a {len(data)}-byte file")
    entries = []
    for i in range(toc_bytes // TOC_ENTRY_SIZE):
        off = 2 + i * TOC_ENTRY_SIZE
        block_id = data[off]
        data_offset, raw_size, comp_size = struct.unpack_from("<IHH", data, off + 1)
        entries.append(
            {
                "index": i,
                "block_id": block_id,
                "data_offset": data_offset,
                "raw_size": raw_size,
                "comp_size": comp_size,
            }
        )
    return data_base, entries


def verify(data: bytes, data_base: int, entries: list[dict[str, int]]) -> list[str]:
    """Structural checks that must hold for a real DAX file. Empty list == clean."""
    problems: list[str] = []
    cursor = 0
    for e in entries:
        if e["data_offset"] != cursor:
            problems.append(
                f"entry {e['index']} (block {e['block_id']}): data_offset {e['data_offset']}"
                f" breaks the chain, expected {cursor}"
            )
        cursor = e["data_offset"] + e["comp_size"]
        end = data_base + e["data_offset"] + e["comp_size"]
        if end > len(data):
            problems.append(
                f"entry {e['index']} (block {e['block_id']}): runs to {end}, past EOF {len(data)}"
            )
    if entries and data_base + cursor != len(data):
        problems.append(
            f"the entry chain ends at {data_base + cursor}, not at EOF {len(data)}"
        )
    return problems


def inspect(path: Path, *, show_entries: bool, do_verify: bool) -> bool:
    data = path.read_bytes()
    print(f"File: {path} ({len(data)} bytes)")
    try:
        data_base, entries = parse_toc(data)
    except ValueError as exc:
        print(f"  not a DAX container: {exc}")
        print()
        return False

    ids = [e["block_id"] for e in entries]
    print(f"  entries={len(entries)}  toc_bytes={2 + len(entries) * TOC_ENTRY_SIZE - 2}"
          f"  data_base={data_base}")
    print(f"  block ids: {ids if len(ids) <= 24 else str(ids[:24])[:-1] + ', ...]'}")
    print(f"  raw total={sum(e['raw_size'] for e in entries)}"
          f"  compressed total={sum(e['comp_size'] for e in entries)}")
    if show_entries:
        for e in entries:
            print(
                f"    [{e['index']:3}] id={e['block_id']:3} off={e['data_offset']:7}"
                f" raw={e['raw_size']:6} comp={e['comp_size']:6}"
            )
    ok = True
    if do_verify:
        problems = verify(data, data_base, entries)
        if problems:
            ok = False
            for p in problems:
                print(f"  FAIL {p}")
        else:
            print("  verify: entry chain closes exactly on EOF")
    print()
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect DAX headers")
    parser.add_argument("paths", nargs="+", type=Path, help="DAX files to inspect")
    parser.add_argument("--entries", action="store_true", help="list every TOC entry")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="check that offsets chain and the last block ends exactly at EOF",
    )
    args = parser.parse_args()
    ok = True
    for path in args.paths:
        if not inspect(path, show_entries=args.entries, do_verify=args.verify):
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
