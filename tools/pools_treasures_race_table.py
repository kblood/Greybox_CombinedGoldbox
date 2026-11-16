#!/usr/bin/env python3
r"""
pools_treasures_race_table.py -- re-derive Pools of Darkness's and Treasures of the Savage
Frontier's OWN race-name string tables from each title's OWN retail `GAME.EXE`, so the claim
behind `poolsTreasuresSavedCharacter.ts`'s `POOLS_TREASURES_RACE_LABEL` is re-checkable from
bytes rather than quoted (round 35 R4).

BACKGROUND
  Round 31 shipped both titles' 510-byte `CHRDATA{n}.SAV` importer with the race byte @0xad
  DELIBERATELY UNTRANSLATED, and `importPoolsTreasuresParty.ts` merely TRIED Curse of the Azure
  Bonds' own `Race` enum (`COAB_RACE_TO_DL`) for disclosure. Under that guess Pools' raw values
  [1,5,5,5,5,5] and Treasures' [5,5,5,1,5,5,5,5] read as mountainDwarf/halfling, which forced
  BINKY (thief 13 > the mountainDwarf DQK cap of 8) and CHERROD (mountainDwarf magic-user, a
  disallowed race/class cell) out of their parties.

  Round 34 did the same job for Secret of the Silver Blades (`secret_race_table.py`) and found an
  EIGHT-entry table with a leading `Tribble`. These two titles have SEVEN entries and no Tribble,
  which is why each title's table must be derived from ITS OWN binary -- the enum is demonstrably
  not family-stable across the Gen1 line (four titles, three different numberings: CoAB's own
  `Race` enum, Secret's 8-entry table, and these two titles' 7-entry table).

WHAT THIS TOOL DOES (per title, independently -- no offset is copied from the other title)
  1. Unpacks the title's `GAME.EXE` (`tools/exepack_unpack.py`) into `build/r35-r4/` (git-ignored).
  2. Locates the 18-entry CLASS-descriptor table by the `Cleric` landmark, MEASURING the stride
     from the `Cleric`->`Druid` pair and cross-checking it predicts `Fighter` -- the same method
     `secret_race_table.py` uses, re-run here rather than assumed.
  3. Locates the RACE table structurally, as the run of PStrings beginning immediately after the
     class table's last entry (`class_base + 18 * class_stride`), measures its OWN stride from the
     `Elf`->`Half-Elf` pair, and cross-checks that stride predicts `Dwarf`.
  4. Runs TWO nulls:
     - the FENCEPOST null (shifts -8..+8): count plausible PStrings at each shifted base;
     - the BOUNDARY anchor: the slot one stride BEFORE the base and the slot one stride PAST the
       last entry. This is what actually fixes the table's extent, and it is the check the
       fencepost null cannot make when the stride is <= 8 (see `buck_string_tables.py`, where two
       Buck tables with stride 5 and 7 alias onto themselves and the fencepost null scores 6/7 and
       2/2 at shift +-stride -- i.e. the plan-supplied fencepost null is NOT a constant).
  5. Corroborates the 0-BASED indexing convention for this table BLOCK without leaving it: the
     CLASS byte @0xae indexes the immediately-preceding table in the same block, and its 0-based
     reading agrees with each record's own `classLevel[8]` window on 12 of 14 records against 0 of
     14 for the 1-based reading. Nothing in the block is 1-based.

  This tool does NOT locate the machine instruction that indexes the race table -- see
  `docs/engine/research/pools-treasures-race-table.md` for the probe that was run for it and the
  measured reason it is non-discriminating.

USAGE
  python tools/pools_treasures_race_table.py                 # both titles, human-readable
  python tools/pools_treasures_race_table.py --json
  python tools/pools_treasures_race_table.py --title pools

`tools/test_pools_treasures_race_table.py` pins every load-bearing number below.
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

GOG_GALAXY = Path("C:/Program Files (x86)/GOG Galaxy/Games")
BUILD_DIR = REPO / "build" / "r35-r4"

#: Per-title retail sources. `save_dir` is that title's own `SAVE\` folder (both titles have one,
#: unlike Secret) and `record_count` its pregen count -- used only by the class-byte corroboration.
TITLES: dict[str, dict] = {
    "pools": {
        "label": "Pools of Darkness",
        "exe": GOG_GALAXY / "Pools of Darkness" / "GAME.EXE",
        "save_dir": GOG_GALAXY / "Pools of Darkness" / "SAVE",
        "record_count": 6,
    },
    "treasures": {
        "label": "Treasures of the Savage Frontier",
        "exe": GOG_GALAXY / "Treasures of the Savage Frontier" / "GAME.EXE",
        "save_dir": GOG_GALAXY / "Treasures of the Savage Frontier" / "SAVE",
        "record_count": 8,
    },
}

# The 18-entry class-descriptor list, in the SAME order CoAB's own `ClassId` enum uses
# (`coabSavedCharacter.ts`'s `COAB_CLASS_LABEL`). Used only to VERIFY the located table's content,
# never to derive its offset (that comes from the `Cleric` landmark search).
EXPECTED_CLASS_TABLE = [
    "Cleric", "Druid", "Fighter", "Paladin", "Ranger", "Magic-User", "Thief", "Monk",
    "Cleric/Fighter", "Cleric/Fighter/Magic-User", "Cleric/Ranger", "Cleric/Magic-User",
    "Cleric/Thief", "Fighter/Magic-User", "Fighter/Thief", "Fighter/Magic-User/Thief",
    "Magic-User/Thief", "Illegal type",
]

# The 7-entry race list this tool re-derives independently for each title -- used only to verify,
# never to seed the search. Note it is EXACTLY the FRUA race enum `hackdocs_extracted/CCHFORM.TXT`
# documents at record offset 88 (0=Elf ... 6=Monster), with no `Tribble` slot; Secret's own table
# has 8 entries with `Tribble` at 0 and is therefore a DIFFERENT numbering.
EXPECTED_RACE_TABLE = ["Elf", "Half-Elf", "Dwarf", "Gnome", "Halfling", "Human", "Monster"]

#: `CHRDATA{n}.SAV` offsets this tool needs for the class-byte corroboration. Mirrors
#: `POOLS_TREASURES_SAVED_CHARACTER_LAYOUT` (round 31; independently oracled there).
RECORD_SIZE = 510
CLASS_BYTE_OFF = 0xAE
CLASS_LEVEL_OFF = 0x151
CLASS_LEVEL_SLOTS = 8

#: `classLevel[8]` slot order -- the first eight class-table entries, in the same order.
#: `coabExpectedClassLevelSlots`'s own mapping, transcribed for the corroboration below.
CLASS_CODE_TO_SLOTS: dict[int, tuple[int, ...]] = {
    0: (0,), 1: (1,), 2: (2,), 3: (3,), 4: (4,), 5: (5,), 6: (6,), 7: (7,),
    8: (0, 2), 9: (0, 2, 5), 10: (0, 4), 11: (0, 5), 12: (0, 6),
    13: (2, 5), 14: (2, 6), 15: (2, 5, 6), 16: (5, 6),
}


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


def unpack_game_exe(source: Path, out_dir: Path, stem: str) -> bytes:
    """Unpack a title's `GAME.EXE` into `out_dir` (git-ignored scratch) and return the decompressed
    load image. Raises if the retail file is missing (read-only source, never vendored)."""
    if not source.exists():
        raise FileNotFoundError(f"GAME.EXE not found at {source}")
    out_dir.mkdir(parents=True, exist_ok=True)
    data, result = exepack_unpack.unpack(source)
    (out_dir / f"{stem}.unpacked.bin").write_bytes(data)
    (out_dir / f"{stem}.unpack.json").write_text(json.dumps(result.to_json(), indent=2))
    return data


def _read_pstring(data: bytes, offset: int) -> str:
    length = data[offset]
    return data[offset + 1 : offset + 1 + length].decode("latin-1")


def _landmark_offsets(data: bytes, needle: bytes, before: int | None = None) -> list[int]:
    out: list[int] = []
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
    """Find the 18-entry class-descriptor table by the `Cleric` landmark, MEASURING the stride from
    the `Cleric`->`Druid` pair and cross-checking that stride predicts `Fighter` two entries on."""
    cleric_hits = _landmark_offsets(data, b"Cleric")
    druid_hits = _landmark_offsets(data, b"Druid")
    fighter_hits = _landmark_offsets(data, b"Fighter")
    if not cleric_hits or not druid_hits:
        raise RaceTableError("landmark strings 'Cleric'/'Druid' not found in the unpacked image")
    cleric0 = cleric_hits[0]
    later_druids = [h for h in druid_hits if h > cleric0]
    if not later_druids:
        raise RaceTableError("no 'Druid' occurs after the first 'Cleric'")
    stride = min(later_druids) - cleric0
    if stride <= 0 or stride > 64:
        raise RaceTableError(f"implausible class-table stride {stride}")
    base = cleric0 - 1
    fighter_expected = base + 2 * stride + 1
    if fighter_expected not in fighter_hits:
        raise RaceTableError(
            f"stride {stride} from Cleric/Druid does not predict Fighter's position "
            f"(expected string start {hex(fighter_expected)}, Fighter occurs at "
            f"{[hex(h) for h in fighter_hits[:6]]})"
        )
    entries = [_read_pstring(data, base + i * stride) for i in range(len(EXPECTED_CLASS_TABLE))]
    return PStringTable(base=base, stride=stride, count=len(entries), entries=entries)


def locate_race_table(data: bytes, class_table: PStringTable) -> PStringTable:
    """The race table is the run of `len(EXPECTED_RACE_TABLE)` PStrings starting immediately after
    the class table's last entry. Located structurally (by position), then its OWN stride is
    measured from `Elf`->`Half-Elf` and cross-checked against `Dwarf` -- so the stride is never
    inherited from the class table, and never assumed to be Secret's 9."""
    base = class_table.base + class_table.count * class_table.stride
    if base + 1 > len(data):
        raise RaceTableError("class table runs past the end of the image")
    elf_hits = _landmark_offsets(data, b"Elf", before=base + 200)
    if (base + 1) not in elf_hits:
        raise RaceTableError(
            f"expected 'Elf' immediately after the class table at {hex(base)}; "
            f"'Elf' occurs at {[hex(h) for h in elf_hits[:6]]}"
        )
    half_elf_hits = _landmark_offsets(data, b"Half-Elf")
    later = [h for h in half_elf_hits if h > base]
    if not later:
        raise RaceTableError("no 'Half-Elf' occurs after the class table")
    stride = (min(later) - 1) - base
    if stride <= 0 or stride > 32:
        raise RaceTableError(f"implausible race-table stride {stride}")
    dwarf_expected = base + 2 * stride + 1
    if dwarf_expected not in _landmark_offsets(data, b"Dwarf"):
        raise RaceTableError(f"race stride {stride} does not predict Dwarf at {hex(dwarf_expected)}")
    entries = [_read_pstring(data, base + i * stride) for i in range(len(EXPECTED_RACE_TABLE))]
    return PStringTable(base=base, stride=stride, count=len(entries), entries=entries)


def _plausible(data: bytes, offset: int) -> bool:
    """A "plausible short PString": a length byte in 1..15 whose payload is entirely printable
    ASCII and fully present. The same filter `secret_race_table.py`'s null uses."""
    if offset < 0 or offset + 1 > len(data):
        return False
    length = data[offset]
    if not (1 <= length <= 15):
        return False
    chunk = data[offset + 1 : offset + 1 + length]
    return len(chunk) == length and all(32 <= b < 127 for b in chunk)


def fencepost_null(data: bytes, table: PStringTable) -> dict:
    """Off-by-one / fencepost null: for every shift in -8..+8 (excluding 0), read `table.count`
    PStrings at `base + shift` and count the plausible ones. Reports the max over all shifts.

    KNOWN BLIND SPOT, measured rather than assumed: this window can only separate a table whose
    stride EXCEEDS 8, because a shift of exactly +-stride lands on the table's own neighbouring
    entry and scores nearly full marks. Both tables here have stride 9, so the window cannot
    alias; `buck_string_tables.py`'s stride-5 and stride-7 tables show what happens when it can.
    """

    def count(base: int) -> int:
        return sum(1 for i in range(table.count) if _plausible(data, base + i * table.stride))

    shifted = {s: count(table.base + s) for s in range(-8, 9) if s != 0}
    return {
        "real_base_plausible_count": count(table.base),
        "table_len": table.count,
        "stride": table.stride,
        "shifted_counts": shifted,
        "max_shifted": max(shifted.values()),
        "window_can_alias_stride": table.stride <= 8,
    }


def boundary_anchor(data: bytes, table: PStringTable) -> dict:
    """The check the fencepost null cannot make: is the slot ONE STRIDE BEFORE the base, and the
    slot ONE STRIDE PAST the last entry, a plausible PString? A table whose extent is real is
    bounded on at least one side by something that is not another entry of the same table."""
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


def class_byte_indexing_check(save_dir: Path, count: int, class_table: PStringTable) -> dict:
    """Corroborate the 0-BASED convention for this table BLOCK, using the class byte -- the one
    byte in the record that indexes a table in this block AND has an independent oracle (the
    record's own `classLevel[8]` window, round 31's load-bearing pair).

    Returns the agreement count under a 0-based read of the class table and under a 1-based read.
    Returns `available: False` when the title's saves are absent."""
    files = [save_dir / f"CHRDATA{i}.SAV" for i in range(1, count + 1)]
    if not all(f.exists() for f in files):
        return {"available": False}
    zero, one, rows = 0, 0, []
    for f in files:
        raw = f.read_bytes()
        if len(raw) != RECORD_SIZE:
            return {"available": False, "reason": f"{f.name} is {len(raw)} bytes, expected {RECORD_SIZE}"}
        code = raw[CLASS_BYTE_OFF]
        active = tuple(i for i in range(CLASS_LEVEL_SLOTS) if raw[CLASS_LEVEL_OFF + i] != 0)
        for shift in (0, 1):
            expected = CLASS_CODE_TO_SLOTS.get(code - shift)
            if expected is not None and tuple(sorted(expected)) == active:
                if shift == 0:
                    zero += 1
                else:
                    one += 1
        rows.append({
            "name": raw[1 : 1 + raw[0]].decode("latin-1").strip(),
            "class_byte": code,
            "zero_based_label": class_table.entries[code] if code < class_table.count else None,
            "one_based_label": class_table.entries[code - 1] if 1 <= code <= class_table.count else None,
            "active_slots": list(active),
        })
    return {
        "available": True,
        "records": len(files),
        "zero_based_agree": zero,
        "one_based_agree": one,
        "rows": rows,
    }


def run_title(key: str, out_dir: Path = BUILD_DIR) -> dict:
    spec = TITLES[key]
    data = unpack_game_exe(spec["exe"], out_dir, key)
    class_table = locate_class_table(data)
    race_table = locate_race_table(data, class_table)
    return {
        "title": spec["label"],
        "unpacked_size": len(data),
        "class_table": class_table.to_json(),
        "class_table_matches_coab_enum_order": class_table.entries == EXPECTED_CLASS_TABLE,
        "race_table": race_table.to_json(),
        "race_table_matches_expected": race_table.entries == EXPECTED_RACE_TABLE,
        "race_fencepost_null": fencepost_null(data, race_table),
        "class_fencepost_null": fencepost_null(data, class_table),
        "race_boundary_anchor": boundary_anchor(data, race_table),
        "class_byte_indexing": class_byte_indexing_check(
            spec["save_dir"], spec["record_count"], class_table
        ),
    }


def run(out_dir: Path = BUILD_DIR) -> dict:
    return {key: run_title(key, out_dir) for key in TITLES}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--title", choices=sorted(TITLES), default=None)
    p.add_argument("--out-dir", type=Path, default=BUILD_DIR)
    p.add_argument("--json", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    keys = [args.title] if args.title else sorted(TITLES)
    try:
        results = {k: run_title(k, args.out_dir) for k in keys}
    except (FileNotFoundError, RaceTableError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(results, indent=2))
        return 0
    for key, res in results.items():
        ct, rt = res["class_table"], res["race_table"]
        print(f"=== {res['title']} ({key}) -- unpacked GAME.EXE {res['unpacked_size']} bytes")
        print(
            f"  class table @ {hex(ct['base'])}, stride {ct['stride']}, {ct['count']} entries "
            f"(matches CoAB ClassId order: {res['class_table_matches_coab_enum_order']})"
        )
        print(
            f"  race table  @ {hex(rt['base'])}, stride {rt['stride']}, {rt['count']} entries: "
            f"{', '.join(rt['entries'])}"
        )
        rn = res["race_fencepost_null"]
        print(
            f"  race fencepost null: real {rn['real_base_plausible_count']}/{rn['table_len']}, "
            f"max over 16 shifts {rn['max_shifted']} (window can alias: {rn['window_can_alias_stride']})"
        )
        ba = res["race_boundary_anchor"]
        print(
            f"  race boundary: before {hex(ba['slot_before_offset'])} plausible="
            f"{ba['slot_before_plausible']} ({ba['slot_before_text']!r}); "
            f"after {hex(ba['slot_after_offset'])} plausible={ba['slot_after_plausible']} "
            f"({ba['slot_after_text']!r})"
        )
        ci = res["class_byte_indexing"]
        if ci.get("available"):
            print(
                f"  class-byte indexing over {ci['records']} real records: "
                f"0-based agrees {ci['zero_based_agree']}, 1-based agrees {ci['one_based_agree']}"
            )
        else:
            print("  class-byte indexing: saves absent, skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
