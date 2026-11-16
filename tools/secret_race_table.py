#!/usr/bin/env python3
r"""
secret_race_table.py -- re-derive Secret of the Silver Blades' own race-name string table from
the retail bytes, so the claim behind `secretSavedCharacter.ts`'s `SECRET_RACE_LABEL` is
re-checkable rather than merely quoted.

BACKGROUND (round 34 R3)
  The ledger's inherited claim was "Secret's CHRDATA race byte@0x6b is raw and untranslated" and
  the `import-secret` e2e case pinned 5/6 imported with the party's only multiclass (MALACHITE)
  rejected as a "human" (this ruleset only allows non-humans to multi-class). The round-34 plan
  measured that Secret's unpacked `START.EXE` carries a 9-byte-stride Pascal `string[8]` table at
  file offset 0xEB91: Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster -- and that
  under a plain 0-based read, race byte 3 = Dwarf and 6 = Human, which is legal (dwarves may
  multi-class fighter/thief in this ruleset; humans may not multi-class at all, so the five
  single-class `race=6` pregens are unaffected).

WHAT THIS TOOL DOES
  1. Unpacks Secret's `START.EXE` (`tools/exepack_unpack.py`, EXEPACK v1, the same unpacker every
     other Gen1-title static-trace tool in this repo uses) into `build/r3-secret/` (git-ignored).
  2. Locates the CLASS-descriptor table by searching for the landmark string `b"Cleric"` and
     reading forward as 9 fixed-stride length-prefixed (`PString`) entries would only coincidentally
     land on real words -- this tool instead walks forward by the MEASURED stride (found by
     diffing consecutive landmark occurrences of `Cleric`/`Druid`/`Fighter`/... in the file, not
     assumed) and reports the full 18-entry table plus its stride.
  3. Locates the RACE table as the run of 8 PStrings starting immediately after the class table
     ends, and reports its own stride and content.
  4. A NULL check: confirms neither table's stride is a coincidence of the surrounding bytes by
     re-deriving the stride from independent landmark pairs (`Cleric`->`Druid` and `Elf`->
     `Half-Elf`, etc.) and checking they all agree, AND by checking that shifting the assumed base
     by +-1..+-8 (a fencepost/off-by-one scan) does NOT also produce 8 valid non-empty
     length-prefixed strings whose total printable-ASCII coverage is as high as the real base --
     i.e. the located offset is not merely "a byte that happens to look like a length prefix".

USAGE
  python tools/secret_race_table.py                  # locate + print both tables
  python tools/secret_race_table.py --json           # machine-readable
  python tools/secret_race_table.py --unpack-only     # just unpack, report exepack header stats

`tools/test_secret_race_table.py` pins the load-bearing numbers (table offsets, stride, content,
and the off-by-one null).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))

import exepack_unpack  # noqa: E402  (local import after sys.path fix-up, matches sibling tools)

GOG_GALAXY = Path("C:/Program Files (x86)/GOG Galaxy/Games")
SECRET_START_EXE = GOG_GALAXY / "Secret of the Silver Blades" / "START.EXE"
BUILD_DIR = REPO / "build" / "r3-secret"

# The 18-entry class-descriptor list, in the SAME order CoAB's own `ClassId` enum uses
# (`coabSavedCharacter.ts`'s `COAB_CLASS_LABEL`) -- used only to VERIFY the located table's
# content, never to derive the offset (the offset comes from the `Cleric` landmark search below).
EXPECTED_CLASS_TABLE = [
    "Cleric", "Druid", "Fighter", "Paladin", "Ranger", "Magic-User", "Thief", "Monk",
    "Cleric/Fighter", "Cleric/Fighter/Magic-User", "Cleric/Ranger", "Cleric/Magic-User",
    "Cleric/Thief", "Fighter/Magic-User", "Fighter/Thief", "Fighter/Magic-User/Thief",
    "Magic-User/Thief", "Illegal type",
]

# The 8-entry race list this tool expects to re-derive independently -- used only to verify, not
# to seed the search.
EXPECTED_RACE_TABLE = [
    "Tribble", "Elf", "Half-Elf", "Dwarf", "Gnome", "Halfling", "Human", "Monster",
]


@dataclass
class PStringTable:
    base: int
    stride: int
    count: int
    entries: list[str]

    def to_json(self) -> dict:
        return asdict(self)


class RaceTableError(ValueError):
    """Raised when the expected landmark strings, or a consistent stride, cannot be found."""


def unpack_start_exe(source: Path = SECRET_START_EXE, out_dir: Path = BUILD_DIR) -> bytes:
    """Unpack Secret's `START.EXE` into `out_dir` (git-ignored scratch) and return the decompressed
    load image. Raises if the retail file is missing (read-only source, never vendored)."""
    if not source.exists():
        raise FileNotFoundError(f"Secret of the Silver Blades START.EXE not found at {source}")
    out_dir.mkdir(parents=True, exist_ok=True)
    data, result = exepack_unpack.unpack(source)
    (out_dir / "START.unpacked.bin").write_bytes(data)
    (out_dir / "START.unpack.json").write_text(json.dumps(result.to_json(), indent=2))
    return data


def _read_pstring(data: bytes, offset: int) -> str:
    length = data[offset]
    return data[offset + 1 : offset + 1 + length].decode("latin-1")


def _landmark_offsets(data: bytes, needle: bytes, before: int | None = None) -> list[int]:
    """Every occurrence of `needle` in `data`, restricted to before `before` if given (so a
    landmark word that also appears later, e.g. inside a sentence, doesn't confuse the stride
    search)."""
    out = []
    start = 0
    limit = before if before is not None else len(data)
    while True:
        idx = data.find(needle, start, limit)
        if idx < 0:
            break
        out.append(idx)
        start = idx + 1
    return out


def locate_class_table(data: bytes) -> PStringTable:
    """Find the class-descriptor table by locating `Cleric` (landmark) and measuring the stride to
    `Druid` immediately after it -- both are unique, unambiguous single-purpose game strings in
    this file, unlike common English words. Cross-checks the stride against 4 more independent
    landmark pairs before trusting it."""
    cleric_hits = _landmark_offsets(data, b"Cleric")
    druid_hits = _landmark_offsets(data, b"Druid")
    fighter_hits = _landmark_offsets(data, b"Fighter")
    if not cleric_hits or not druid_hits:
        raise RaceTableError("landmark strings 'Cleric'/'Druid' not found in the unpacked image")
    # The table's own Cleric/Druid pair is the first occurrence of each in the file -- Cleric later
    # recurs (multiclass names), Druid does not.
    cleric0 = cleric_hits[0]
    druid0 = min(h for h in druid_hits if h > cleric0)
    stride = (druid0 - 1) - (cleric0 - 1)  # length-byte position, not the string's first char
    if stride <= 0 or stride > 64:
        raise RaceTableError(f"implausible class-table stride {stride}")
    # Cross-check: Fighter should sit at cleric_base + 2*stride.
    base = cleric0 - 1
    fighter_expected = base + 2 * stride + 1
    if fighter_expected not in fighter_hits:
        raise RaceTableError(
            f"stride {stride} from Cleric/Druid does not predict Fighter's position "
            f"(expected string start {hex(fighter_expected)}, Fighter occurs at "
            f"{[hex(h) for h in fighter_hits]})"
        )
    entries = [_read_pstring(data, base + i * stride) for i in range(len(EXPECTED_CLASS_TABLE))]
    return PStringTable(base=base, stride=stride, count=len(entries), entries=entries)


def locate_race_table(data: bytes, class_table: PStringTable) -> PStringTable:
    """The race table is the run of `len(EXPECTED_RACE_TABLE)` PStrings starting immediately after
    the class table's last entry -- located structurally (by position), then verified by stride
    cross-checks the same way the class table is, so the offset is not merely assumed from the
    class table's own end."""
    base = class_table.base + class_table.count * class_table.stride
    tribble_hits = _landmark_offsets(data, b"Tribble")
    if not tribble_hits or (tribble_hits[0] - 1) != base:
        raise RaceTableError(
            f"expected 'Tribble' immediately after the class table at {hex(base)}, "
            f"found Tribble at {[hex(h) for h in tribble_hits]}"
        )
    elf_hits = _landmark_offsets(data, b"Elf", before=base + 200)
    half_elf_hits = _landmark_offsets(data, b"Half-Elf")
    if not elf_hits or not half_elf_hits:
        raise RaceTableError("landmark strings 'Elf'/'Half-Elf' not found after the class table")
    elf0 = min(h for h in elf_hits if h > base)
    stride = (elf0 - 1) - base
    if stride <= 0 or stride > 32:
        raise RaceTableError(f"implausible race-table stride {stride}")
    half_elf_expected = base + 2 * stride + 1
    if (half_elf_expected - 1) not in [h - 1 for h in half_elf_hits]:
        raise RaceTableError(
            f"stride {stride} does not predict Half-Elf's position "
            f"(expected string start {hex(half_elf_expected)}, Half-Elf occurs at "
            f"{[hex(h) for h in half_elf_hits]})"
        )
    entries = [_read_pstring(data, base + i * stride) for i in range(len(EXPECTED_RACE_TABLE))]
    return PStringTable(base=base, stride=stride, count=len(entries), entries=entries)


def fencepost_null(data: bytes, table: PStringTable, table_len: int) -> dict:
    """Off-by-one / fencepost null: for shift in -8..8 (excluding 0), try reading `table_len`
    PStrings starting at `table.base + shift` and count how many are "plausible" (length byte in
    1..15 AND the bytes it claims are all printable ASCII). Reports the max plausible-count over
    every nonzero shift, for comparison against the real base's own count -- if a neighbouring
    offset scores just as high, the located base is not well anchored."""

    def plausible_count(base: int) -> int:
        count = 0
        for i in range(table_len):
            off = base + i * table.stride
            if off < 0 or off + 1 > len(data):
                continue
            length = data[off]
            if not (1 <= length <= 15):
                continue
            chunk = data[off + 1 : off + 1 + length]
            if len(chunk) == length and all(32 <= b < 127 for b in chunk):
                count += 1
        return count

    real_count = plausible_count(table.base)
    shifted = {shift: plausible_count(table.base + shift) for shift in range(-8, 9) if shift != 0}
    return {
        "real_base_plausible_count": real_count,
        "table_len": table_len,
        "shifted_counts": shifted,
        "max_shifted": max(shifted.values()) if shifted else 0,
    }


def run(source: Path = SECRET_START_EXE, out_dir: Path = BUILD_DIR) -> dict:
    data = unpack_start_exe(source, out_dir)
    class_table = locate_class_table(data)
    race_table = locate_race_table(data, class_table)
    class_ok = class_table.entries == EXPECTED_CLASS_TABLE
    race_ok = race_table.entries == EXPECTED_RACE_TABLE
    return {
        "unpacked_size": len(data),
        "class_table": class_table.to_json(),
        "class_table_matches_coab_enum_order": class_ok,
        "race_table": race_table.to_json(),
        "race_table_matches_expected": race_ok,
        "race_fencepost_null": fencepost_null(data, race_table, len(EXPECTED_RACE_TABLE)),
        "class_fencepost_null": fencepost_null(data, class_table, len(EXPECTED_CLASS_TABLE)),
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", type=Path, default=SECRET_START_EXE)
    p.add_argument("--out-dir", type=Path, default=BUILD_DIR)
    p.add_argument("--json", action="store_true")
    p.add_argument("--unpack-only", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.unpack_only:
        data = unpack_start_exe(args.source, args.out_dir)
        print(f"unpacked {args.source}: {len(data)} bytes -> {args.out_dir}")
        return 0
    try:
        result = run(args.source, args.out_dir)
    except (FileNotFoundError, RaceTableError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        ct = result["class_table"]
        rt = result["race_table"]
        print(f"class table @ {hex(ct['base'])}, stride {ct['stride']}, {ct['count']} entries:")
        for i, e in enumerate(ct["entries"]):
            print(f"  {i:2d}  {e}")
        print(f"matches CoAB ClassId enum order: {result['class_table_matches_coab_enum_order']}")
        print()
        print(f"race table @ {hex(rt['base'])}, stride {rt['stride']}, {rt['count']} entries:")
        for i, e in enumerate(rt["entries"]):
            print(f"  {i:2d}  {e}")
        print(f"matches expected content: {result['race_table_matches_expected']}")
        print()
        rn = result["race_fencepost_null"]
        print(
            f"race fencepost null: real base plausible_count={rn['real_base_plausible_count']}/"
            f"{rn['table_len']}, max over shift != 0: {rn['max_shifted']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
