"""Map the hunks of an AmigaDOS executable (HUNK_HEADER format), read-only.

Usage: python tools/amiga_hunk_map.py <path-to-executable>

Prints each hunk's index, type, memory flags, byte size and (for code/data) the first bytes.
It does not interpret relocations or symbols beyond counting them. Used for the Amiga combat
geometry research (docs/engine/research/cok-amiga-combat-geometry-2026-11-11.md).
"""
import struct
import sys
from pathlib import Path

HUNK_UNIT, HUNK_NAME, HUNK_CODE, HUNK_DATA, HUNK_BSS = 0x3E7, 0x3E8, 0x3E9, 0x3EA, 0x3EB
HUNK_RELOC32, HUNK_DEBUG, HUNK_SYMBOL, HUNK_END, HUNK_HEADER = 0x3EC, 0x3F1, 0x3F0, 0x3F2, 0x3F3
HUNK_OVERLAY, HUNK_BREAK = 0x3F5, 0x3F6
TYPE_NAMES = {HUNK_CODE: "CODE", HUNK_DATA: "DATA", HUNK_BSS: "BSS"}


def read_map(data: bytes):
    pos = 0

    def u32():
        nonlocal pos
        value = struct.unpack_from(">I", data, pos)[0]
        pos += 4
        return value

    if u32() != HUNK_HEADER:
        raise ValueError("not an AmigaDOS HUNK_HEADER executable")
    name_longs = u32()  # resident library names: each is a longword count plus data; 0 ends the list
    while name_longs:
        pos += name_longs * 4
        name_longs = u32()
    table_size = u32()
    first, last = u32(), u32()
    count = last - first + 1
    sizes = [u32() for _ in range(table_size)]
    hunks = []
    for index in range(table_size):
        raw = sizes[index]
        mem_flags = raw >> 29
        size = (raw & 0x1FFFFFFF) * 4
        hunks.append({"index": index, "mem": mem_flags, "bytes": size, "type": None,
                      "offset": None, "relocs": 0, "symbols": 0, "reloc_offsets": []})
    if count != table_size:
        raise ValueError(f"hunk table count mismatch: {count} vs {table_size}")

    current = 0
    while current < table_size:
        kind = u32()
        base = kind & 0x3FFFFFFF
        if base in (HUNK_CODE, HUNK_DATA, HUNK_BSS):
            hunk = hunks[current]
            hunk["type"] = TYPE_NAMES[base]
            body_bytes = u32() * 4
            if base != HUNK_BSS:  # BSS carries only its size; CODE/DATA carry the bytes
                hunk["offset"] = pos
                pos += body_bytes
            # The hunk index advances at HUNK_END, which closes every hunk (CODE, DATA, BSS).
        elif base == HUNK_RELOC32:
            while True:
                n = u32()
                if n == 0:
                    break
                hunk_ref = u32()
                for _ in range(n):
                    # Offset of a longword in hunk `current` that the loader adds a base address to,
                    # i.e. a pointer into hunk `hunk_ref`. Kept per hunk for pointer checks.
                    hunks[current]["reloc_offsets"].append((u32(), hunk_ref))
                hunks[current]["relocs"] += n
        elif base == HUNK_SYMBOL:
            while True:
                n = u32()
                if n == 0:
                    break
                pos += n * 4 + 4
                hunks[current]["symbols"] += 1
        elif base == HUNK_DEBUG:
            n = u32()
            pos += n * 4
        elif base == HUNK_END:
            current += 1
        elif base == HUNK_NAME:
            n = u32()
            pos += n * 4
        elif base == HUNK_UNIT:
            n = u32()
            pos += n * 4
        elif base == HUNK_BREAK:
            continue
        else:
            raise ValueError(f"unhandled hunk kind 0x{base:x} at byte {pos - 4}")
    return hunks, data


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    path = Path(argv[1])
    data = path.read_bytes()
    hunks, _ = read_map(data)
    print(f"{path.name}: {len(data)} bytes, {len(hunks)} hunks")
    for h in hunks:
        print(f"hunk {h['index']:>2}  {str(h['type']):<5}  mem={h['mem']}  bytes={h['bytes']:>7}"
              f"  relocs={h['relocs']:>5}  symbols={h['symbols']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
