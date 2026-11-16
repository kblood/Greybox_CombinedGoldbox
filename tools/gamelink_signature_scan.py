#!/usr/bin/env python3
"""Find a byte signature in live DOSBox-X GameLink RAM without a monolithic dump."""
from __future__ import annotations

import argparse
import json
import sys

from dosbox_gamelink import GameLink


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pattern", type=bytes.fromhex, help="hex bytes to locate")
    p.add_argument("--chunk", type=lambda s: int(s, 0), default=0x4000)
    p.add_argument("--timeout", type=float, default=2.0)
    args = p.parse_args()
    if not args.pattern or args.chunk < len(args.pattern):
        p.error("pattern must be non-empty and --chunk must cover it")

    with GameLink(args.timeout) as link:
        ram_size = int(link.status()["ram_size"])
        hits: list[int] = []
        carry = b""
        for start in range(0, ram_size, args.chunk):
            data = link.peek(start, min(args.chunk, ram_size - start))
            window = carry + data
            pos = 0
            while True:
                pos = window.find(args.pattern, pos)
                if pos < 0:
                    break
                absolute = start - len(carry) + pos
                if absolute >= 0:
                    hits.append(absolute)
                pos += 1
            carry = window[-(len(args.pattern) - 1):] if len(args.pattern) > 1 else b""
    print(json.dumps({"pattern": args.pattern.hex(), "ram_size": ram_size, "chunk": args.chunk,
                      "matches": [{"physical": h, "physical_hex": f"{h:05X}"} for h in hits]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
