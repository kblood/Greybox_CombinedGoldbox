#!/usr/bin/env python3
"""Generate a compact, untracked full-sequence input for native demo replay.

The generator consumes the dialect-aware retail report emitted by
map_gen1_demo_entry.py and writes GBDM v1 records.  GBEF remains a bounded
resume record; this file is deliberately a separate replay contract.

Records are {u8 kind, u8 reserved, u16 argument, u16 textLength, text[]},
where kind is PICTURE=1, CALL=2, COMBAT=3, PROGRAM=4, PRINT=5, SAVE=6,
GOSUB=7, EXIT=8, SETUP_MONSTER=9.  The optional text is ASCII source prose.
Generated output belongs in build/ and must not be committed.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPPER = ROOT / "tools" / "map_gen1_demo_entry.py"
KIND = {"PICTURE": 1, "CALL": 2, "COMBAT": 3, "PROGRAM": 4, "PRINT": 5,
        "SAVE": 6, "GOSUB": 7, "EXIT": 8, "SETUP_MONSTER": 9}


def event_for(text: str) -> tuple[int, int, bytes] | None:
    if text.startswith("PICTURE #"):
        return KIND["PICTURE"], int(text.split("#", 1)[1]), b""
    if text.startswith("CALL [1:0x"):
        return KIND["CALL"], int(text.split("0x", 1)[1][:-1], 16), b""
    if text == "COMBAT":
        return KIND["COMBAT"], 0, b""
    if text.startswith("PROGRAM #"):
        return KIND["PROGRAM"], int(text.split("#", 1)[1]), b""
    if text == "EXIT":
        return KIND["EXIT"], 0, b""
    if text.startswith("GOSUB [1:0x"):
        return KIND["GOSUB"], int(text.split("0x", 1)[1][:-1], 16), b""
    if text.startswith("SETUP_MONSTER "):
        # First argument is the picture/monster setup identity; retain the
        # original full instruction as sidecar text for later DOS decoding.
        first = int(re.search(r"#(\d+)", text).group(1))
        return KIND["SETUP_MONSTER"], first, text.encode("ascii")
    if text.startswith("PRINT"):
        match = re.search(r'"(.*)"', text)
        return KIND["PRINT"], 1 if text.startswith("PRINTCLEAR") else 0, (match.group(1) if match else "").encode("ascii")
    if text.startswith("SAVE #"):
        match = re.match(r"SAVE #(\d+), \[1:0x([0-9a-f]+)\]", text)
        if match:
            # Argument is the destination address; source immediate remains
            # decimal ASCII so the native reader never guesses its width.
            return KIND["SAVE"], int(match.group(2), 16), match.group(1).encode("ascii")
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True, choices=("champions-of-krynn", "death-knights-of-krynn"))
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    subprocess.run([sys.executable, str(MAPPER), "--profile", args.profile], cwd=ROOT, check=True)
    report_path = ROOT / "build" / f"{args.profile}-demo-entry.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    instructions = report["demo_chain"][0]["instructions"]
    events = [event for instruction in instructions if (event := event_for(instruction["text"]))]
    title = 1 if args.profile == "champions-of-krynn" else 2
    out = args.out or ROOT / "build" / ("COKDEMO.GBD" if title == 1 else "DOKDEMO.GBD")
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("wb") as fh:
        fh.write(struct.pack("<4sHHH", b"GBDM", 1, title, len(events)))
        for kind, argument, prose in events:
            fh.write(struct.pack("<BBHH", kind, 0, argument, len(prose)))
            fh.write(prose)
    print(f"{args.profile}: {len(events)} replay records -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
