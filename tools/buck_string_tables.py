#!/usr/bin/env python3
r"""
buck_string_tables.py -- re-derive the four label string tables Buck Rogers: Countdown to
Doomsday's OWN `START.EXE` carries (careers, races, ability abbreviations, sex), so
`BUCK_CAREER_LABEL` / `BUCK_RACE_LABEL` / `BUCK_ABILITY_ABBREV` / `BUCK_SEX_LABEL` in
`packages/engine/src/loaders/buckSavedCharacter.ts` are re-checkable from the retail bytes
(round 35 R4).

WHY THIS EXISTS
  `packages/engine/src/ruleset/buckrogers/index.ts` shipped with two sentences that the retail
  binary falsifies: "no Buck Rogers binary or decoded data file exists in this repo" (the DOS
  release is held at `D:\Games\Emulator\DOS\GoldBox\BuckRogers1-CountdownToDoomsday\`, never
  vendored) and "the 5 careers above are the only ones the real game has". The game's own table
  has SEVEN entries -- the five modelled plus `Scout` and the sentinel `Monster`.

  This tool does NOT assign any save-record column to any of these tables. The six pregens'
  candidate columns are non-discriminating between a 0-based and a 1-based read (both yield a
  fully-named party for BOTH offsets 39 and 40 against BOTH the career and the race table -- eight
  of eight combinations), which is measured here as `column_reading_null` and reported as a
  negative, not smoothed into an assignment.

TABLES (each located by landmark + measured stride, then null-checked; no base is written down
from an eyeballed hex dump -- a previous round's eyeballed Buck race base was 2 bytes low)
  career  7 entries, stride 12   Rocket Jock, Medic, Warrior, Engineer, Rogue, Scout, Monster
  race    8 entries, stride 14   Terran, Martian, Venusian, Mercurian, Tinker, Desert Runner,
                                 lunarian, lowlander
  abbrev  7 entries, stride  5   STR, DEX, CON, INT, WIS, CHA, TCH
  sex     2 entries, stride  7   Male, Female

THE FENCEPOST NULL IS NOT A CONSTANT -- MEASURED HERE
  The +-1..+-8 fencepost null that cleanly anchored Secret's and Pools/Treasures' stride-9 race
  tables (0 plausible at every shift) FAILS on two of these four: `abbrev` has stride 5, so shifts
  of -5 and +5 land on the table's own neighbouring entries and score 6 of 7; `sex` has stride 7,
  so shift +7 scores 2 of 2. The window can only separate a table whose stride EXCEEDS 8. The
  BOUNDARY anchor (is the slot one stride before the base, or one stride past the last entry, a
  plausible PString?) is what actually fixes those two tables' extent, and it is reported beside
  the fencepost figure for all four.

USAGE
  python tools/buck_string_tables.py
  python tools/buck_string_tables.py --json

`tools/test_buck_string_tables.py` pins every number below, including the two null failures.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))

import exepack_unpack  # noqa: E402  (local import after sys.path fix-up, matches sibling tools)

#: The DOS release of Countdown to Doomsday -- external, read-only, never vendored (there is no
#: GOG release of either Buck Rogers title; see CLAUDE.md's source-location list).
BUCK_DIR = Path(r"D:\Games\Emulator\DOS\GoldBox\BuckRogers1-CountdownToDoomsday")
BUCK_START_EXE = BUCK_DIR / "start.exe"
BUILD_DIR = REPO / "build" / "r35-r4"

#: 259-byte `chrdata{n}.sav` pregens, decoded by `buckSavedCharacter.ts` (round 33).
BUCK_RECORD_SIZE = 259
BUCK_PREGEN_COUNT = 6

#: Landmark + expected content for each table. The landmark is the FIRST entry's text; the second
#: entry's text supplies the measured stride; the third cross-checks it. Expected content verifies,
#: it never seeds the search.
TABLE_SPECS: dict[str, dict] = {
    "career": {
        "entries": ["Rocket Jock", "Medic", "Warrior", "Engineer", "Rogue", "Scout", "Monster"],
    },
    "race": {
        "entries": ["Terran", "Martian", "Venusian", "Mercurian", "Tinker", "Desert Runner",
                    "lunarian", "lowlander"],
    },
    "abbrev": {
        "entries": ["STR", "DEX", "CON", "INT", "WIS", "CHA", "TCH"],
    },
    "sex": {
        "entries": ["Male", "Female"],
    },
}

#: The two record columns whose value ranges make them career/race candidates. Deliberately NOT
#: assigned -- see `column_reading_null`.
CANDIDATE_COLUMNS = (39, 40)


@dataclass
class PStringTable:
    name: str
    base: int
    stride: int
    count: int
    entries: list[str]

    def to_json(self) -> dict:
        return asdict(self)


class BuckTableError(ValueError):
    """Raised when a landmark string, or a consistent stride, cannot be found."""


def unpack_start_exe(source: Path = BUCK_START_EXE, out_dir: Path = BUILD_DIR) -> bytes:
    if not source.exists():
        raise FileNotFoundError(f"Buck Rogers START.EXE not found at {source}")
    out_dir.mkdir(parents=True, exist_ok=True)
    data, result = exepack_unpack.unpack(source)
    (out_dir / "buck.unpacked.bin").write_bytes(data)
    (out_dir / "buck.unpack.json").write_text(json.dumps(result.to_json(), indent=2))
    return data


def _read_pstring(data: bytes, offset: int) -> str:
    length = data[offset]
    return data[offset + 1 : offset + 1 + length].decode("latin-1")


def _find_pstring(data: bytes, text: str, after: int = 0) -> int:
    """Offset of the LENGTH BYTE of the first `PString` holding exactly `text` at or after
    `after` -- i.e. a `len(text)` byte immediately followed by those bytes."""
    needle = bytes([len(text)]) + text.encode("latin-1")
    idx = data.find(needle, after)
    if idx < 0:
        raise BuckTableError(f"PString {text!r} not found in the unpacked image")
    return idx


def locate_table(data: bytes, name: str) -> PStringTable:
    """Locate one table: base from its first entry's PString, stride MEASURED from the second
    entry's PString, cross-checked against the third (where one exists), then every entry read at
    that stride and compared with the expected content."""
    expected = TABLE_SPECS[name]["entries"]
    base = _find_pstring(data, expected[0])
    second = _find_pstring(data, expected[1], after=base + 1)
    stride = second - base
    if stride <= 0 or stride > 64:
        raise BuckTableError(f"{name}: implausible stride {stride}")
    if len(expected) >= 3:
        third = base + 2 * stride
        if _read_pstring(data, third) != expected[2]:
            raise BuckTableError(
                f"{name}: stride {stride} does not predict {expected[2]!r} at {hex(third)} "
                f"(found {_read_pstring(data, third)!r})"
            )
    entries = [_read_pstring(data, base + i * stride) for i in range(len(expected))]
    return PStringTable(name=name, base=base, stride=stride, count=len(entries), entries=entries)


def _plausible(data: bytes, offset: int) -> bool:
    """Same filter `secret_race_table.py` / `pools_treasures_race_table.py` use: length byte 1..15,
    payload fully present and printable ASCII."""
    if offset < 0 or offset + 1 > len(data):
        return False
    length = data[offset]
    if not (1 <= length <= 15):
        return False
    chunk = data[offset + 1 : offset + 1 + length]
    return len(chunk) == length and all(32 <= b < 127 for b in chunk)


def fencepost_null(data: bytes, table: PStringTable) -> dict:
    def count(base: int) -> int:
        return sum(1 for i in range(table.count) if _plausible(data, base + i * table.stride))

    shifted = {s: count(table.base + s) for s in range(-8, 9) if s != 0}
    return {
        "real_base_plausible_count": count(table.base),
        "table_len": table.count,
        "stride": table.stride,
        "shifted_counts": shifted,
        "max_shifted": max(shifted.values()),
        # True when a shift of +-stride falls inside the +-8 window -- the case in which this null
        # is structurally incapable of separating the base from its own neighbouring entry.
        "window_can_alias_stride": table.stride <= 8,
        "discriminating": max(shifted.values()) == 0,
    }


def boundary_anchor(data: bytes, table: PStringTable) -> dict:
    before = table.base - table.stride
    after = table.base + table.count * table.stride
    return {
        "slot_before_offset": before,
        "slot_before_plausible": _plausible(data, before),
        "slot_before_text": _read_pstring(data, before) if _plausible(data, before) else None,
        "slot_after_offset": after,
        "slot_after_plausible": _plausible(data, after),
        "slot_after_text": _read_pstring(data, after) if _plausible(data, after) else None,
    }


def read_pregens(directory: Path = BUCK_DIR) -> list[bytes] | None:
    files = [directory / f"chrdata{i}.sav" for i in range(1, BUCK_PREGEN_COUNT + 1)]
    if not all(f.exists() for f in files):
        return None
    recs = [f.read_bytes() for f in files]
    if any(len(r) != BUCK_RECORD_SIZE for r in recs):
        return None
    return recs


def column_reading_null(recs: list[bytes], tables: dict[str, PStringTable]) -> dict:
    """THE NULL FOR ANY COLUMN ASSIGNMENT, measured rather than assumed.

    (a) For each candidate column x {career, race} table x {0-based, 1-based}: does every one of
        the six pregens land on a named entry? If several combinations do, "the party comes out
        fully named" is not evidence for any of them.
    (b) How many of the record's 259 columns would pass the same plausibility filter at all?
    """
    out: dict = {"per_combination": [], "records": len(recs)}
    for col in CANDIDATE_COLUMNS:
        for tname in ("career", "race"):
            t = tables[tname]
            for basing, shift in (("0-based", 0), ("1-based", 1)):
                idxs = [r[col] - shift for r in recs]
                named = all(0 <= i < t.count for i in idxs)
                out["per_combination"].append({
                    "column": col,
                    "table": tname,
                    "basing": basing,
                    "all_named": named,
                    "labels": [t.entries[i] if 0 <= i < t.count else None for i in idxs],
                })
    out["all_named_combinations"] = sum(1 for c in out["per_combination"] if c["all_named"])
    out["total_combinations"] = len(out["per_combination"])

    def col_values(o: int) -> list[int]:
        return [r[o] for r in recs]

    out["career_plausible_columns_0based"] = [
        o for o in range(BUCK_RECORD_SIZE)
        if all(0 <= v < tables["career"].count for v in col_values(o)) and len(set(col_values(o))) > 1
    ]
    out["career_plausible_columns_1based"] = [
        o for o in range(BUCK_RECORD_SIZE)
        if all(1 <= v <= tables["career"].count for v in col_values(o)) and len(set(col_values(o))) > 1
    ]
    out["binary_columns"] = [o for o in range(BUCK_RECORD_SIZE) if set(col_values(o)) == {0, 1}]
    out["names"] = [r[1 : 1 + r[0]].decode("latin-1").strip() for r in recs]
    out["candidate_column_values"] = {str(c): col_values(c) for c in CANDIDATE_COLUMNS}
    out["column_38_values"] = col_values(38)
    return out


def run(source: Path = BUCK_START_EXE, out_dir: Path = BUILD_DIR) -> dict:
    data = unpack_start_exe(source, out_dir)
    tables = {name: locate_table(data, name) for name in TABLE_SPECS}
    res: dict = {
        "unpacked_size": len(data),
        "tables": {n: t.to_json() for n, t in tables.items()},
        "matches_expected": {
            n: tables[n].entries == TABLE_SPECS[n]["entries"] for n in TABLE_SPECS
        },
        "fencepost_null": {n: fencepost_null(data, tables[n]) for n in TABLE_SPECS},
        "boundary_anchor": {n: boundary_anchor(data, tables[n]) for n in TABLE_SPECS},
    }
    recs = read_pregens()
    res["column_reading_null"] = column_reading_null(recs, tables) if recs else {"available": False}
    return res


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--source", type=Path, default=BUCK_START_EXE)
    p.add_argument("--out-dir", type=Path, default=BUILD_DIR)
    p.add_argument("--json", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    try:
        res = run(args.source, args.out_dir)
    except (FileNotFoundError, BuckTableError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(res, indent=2))
        return 0
    print(f"Buck Rogers START.EXE unpacked: {res['unpacked_size']} bytes")
    for name in TABLE_SPECS:
        t = res["tables"][name]
        fn = res["fencepost_null"][name]
        ba = res["boundary_anchor"][name]
        print(f"  {name:7} @ {hex(t['base'])} stride {t['stride']:2} x{t['count']}: "
              f"{', '.join(t['entries'])}")
        print(f"          fencepost null: real {fn['real_base_plausible_count']}/{fn['table_len']}, "
              f"max shifted {fn['max_shifted']} -> discriminating={fn['discriminating']} "
              f"(window can alias stride: {fn['window_can_alias_stride']})")
        print(f"          boundary: before {hex(ba['slot_before_offset'])}="
              f"{ba['slot_before_text']!r}, after {hex(ba['slot_after_offset'])}="
              f"{ba['slot_after_text']!r}")
    crn = res["column_reading_null"]
    if crn.get("available") is False:
        print("  column-reading null: pregens absent, skipped")
        return 0
    print(f"  column-reading null over {crn['records']} pregens {crn['names']}:")
    print(f"    {crn['all_named_combinations']}/{crn['total_combinations']} "
          f"(column x table x basing) combinations yield a fully-named party -- "
          f"NON-DISCRIMINATING, so no column is assigned")
    for c in crn["per_combination"]:
        print(f"      off{c['column']} {c['table']:6} {c['basing']}: all_named={c['all_named']} "
              f"{c['labels']}")
    print(f"    columns whose 6 values are all valid 0-based career indices and vary: "
          f"{len(crn['career_plausible_columns_0based'])}/{BUCK_RECORD_SIZE} "
          f"{crn['career_plausible_columns_0based']}")
    print(f"    columns whose 6 values are all valid 1-based career indices and vary: "
          f"{len(crn['career_plausible_columns_1based'])}/{BUCK_RECORD_SIZE}")
    print(f"    strictly-binary columns: {crn['binary_columns']} (col 38 = {crn['column_38_values']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
