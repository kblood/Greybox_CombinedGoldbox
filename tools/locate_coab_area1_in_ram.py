#!/usr/bin/env python3
"""Locate a saved CoAB/early-Krynn Area1 record in bounded DOS RAM dumps.

The original save wrapper holds a leading game-area byte followed by one exact
0x800-byte Area1 record.  This read-only helper finds that complete record in
a GameLink RAM dump and reports physical offsets for selected persistent ECL
words.  It does not attach semantics to any other RAM region and never writes
the dump, save, emulator, or game files.  Optional follow-up dumps are read at
the one exact baseline match so a native input experiment can report Area1
changes even though the changed record no longer byte-matches the save.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


AREA1_BYTES = 0x800
SAVGAMA_AREA1_OFFSET = 1
ECL_START = 0x4B00
ECL_END = 0x4EFF


def parse_int(value: str) -> int:
    return int(value, 0)


def area_offset_for_ecl(address: int) -> int:
    if not ECL_START <= address <= ECL_END:
        raise ValueError(f"ECL address {address:#x} is outside {ECL_START:#x}..{ECL_END:#x}")
    return (0x6A00 + address * 2) & 0xFFFF


def find_all(blob: bytes, needle: bytes) -> list[int]:
    found: list[int] = []
    start = 0
    while True:
        hit = blob.find(needle, start)
        if hit < 0:
            return found
        found.append(hit)
        start = hit + 1


def changed_runs(before: bytes, after: bytes) -> list[dict[str, object]]:
    """Return compact byte runs, deliberately without assigning field semantics."""
    runs: list[dict[str, object]] = []
    index = 0
    while index < len(before):
        if before[index] == after[index]:
            index += 1
            continue
        start = index
        while index < len(before) and before[index] != after[index]:
            index += 1
        runs.append({
            "area1_offset": f"0x{start:03x}",
            "length": index - start,
            "before_hex": before[start:index].hex(),
            "after_hex": after[start:index].hex(),
        })
    return runs


def word_report(blob: bytes, base: int, addresses: list[int]) -> dict[str, object]:
    words: dict[str, object] = {}
    for address in addresses:
        try:
            offset = area_offset_for_ecl(address)
        except ValueError as error:
            raise SystemExit(str(error)) from error
        words[f"0x{address:04x}"] = {
            "area1_offset": f"0x{offset:03x}",
            "physical_offset": f"0x{base + offset:x}",
            "value": int.from_bytes(blob[base + offset:base + offset + 2], "little"),
        }
    return words


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, help="CoAB/CoK SAVGAM?.DAT wrapper used for exact baseline matching")
    parser.add_argument("--area1-address", type=parse_int,
                        help="externally established physical Area1 address; skips exact save matching")
    parser.add_argument("--ram", type=Path, required=True, help="bounded GameLink RAM dump")
    parser.add_argument("--follow-ram", type=Path, action="append", default=[],
                        help="later GameLink RAM dump from the same DOSBox process; repeatable")
    parser.add_argument("--word", type=parse_int, action="append", default=[], help="ECL word address to report; repeatable")
    parser.add_argument("--output", type=Path, required=True, help="new JSON result path")
    args = parser.parse_args()

    if args.output.exists():
        raise SystemExit(f"refusing to overwrite output: {args.output}")
    if (args.save is None) == (args.area1_address is None):
        raise SystemExit("provide exactly one of --save or --area1-address")
    ram = args.ram.read_bytes()
    save_meta: dict[str, object] | None = None
    if args.save is not None:
        save = args.save.read_bytes()
        if len(save) < SAVGAMA_AREA1_OFFSET + AREA1_BYTES:
            raise SystemExit(f"save has {len(save)} bytes; need a wrapper containing Area1")
        area1 = save[SAVGAMA_AREA1_OFFSET:SAVGAMA_AREA1_OFFSET + AREA1_BYTES]
        matches = find_all(ram, area1)
        save_meta = {"path": str(args.save), "bytes": len(save)}
    else:
        assert args.area1_address is not None
        if args.area1_address < 0 or len(ram) < args.area1_address + AREA1_BYTES:
            raise SystemExit(
                f"--area1-address 0x{args.area1_address:x} is outside RAM dump of {len(ram)} bytes"
            )
        matches = [args.area1_address]
    result: dict[str, object] = {
        "schema_version": 1,
        "kind": "coab_area1_ram_locator",
        "ram": {"path": str(args.ram), "bytes": len(ram)},
        "area1_matches": [f"0x{offset:x}" for offset in matches],
        "claim_boundary": (
            "Exact Area1 byte-match only; physical address lifetime and unrelated RAM semantics are not inferred."
            if save_meta is not None else
            "Area1 physical address was supplied by the caller, not exact-matched in this dump; "
            "the report only compares bytes at that address within the supplied dumps."
        ),
    }
    if save_meta is not None:
        result["save"] = save_meta
    else:
        result["area1_address_source"] = "caller-supplied"
    if len(matches) == 1:
        base = matches[0]
        result["words"] = word_report(ram, base, args.word)
        baseline = ram[base:base + AREA1_BYTES]
        follows: list[dict[str, object]] = []
        for follow_path in args.follow_ram:
            follow = follow_path.read_bytes()
            if len(follow) < base + AREA1_BYTES:
                raise SystemExit(
                    f"follow-up RAM {follow_path} has {len(follow)} bytes; "
                    f"needs at least {base + AREA1_BYTES} for baseline Area1 address 0x{base:x}"
                )
            followed = follow[base:base + AREA1_BYTES]
            follows.append({
                "path": str(follow_path),
                "bytes": len(follow),
                "same_area1_bytes": followed == baseline,
                "changed_runs": changed_runs(baseline, followed),
                "words": word_report(follow, base, args.word),
            })
        if follows:
            result["follow_ups"] = follows
            result["follow_up_claim_boundary"] = (
                "Each follow-up is read at the physical address proven by the baseline exact match. "
                "It establishes only changes at that address within one DOSBox process; it does not "
                "prove that the address survives a reload or identify unrelated RAM fields."
            )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if len(matches) == 1 else 2


if __name__ == "__main__":
    raise SystemExit(main())
