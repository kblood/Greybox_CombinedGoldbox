r"""
Pins `buck_string_tables.py`'s re-derivation of the four label tables Buck Rogers: Countdown to
Doomsday's own `START.EXE` carries -- the byte-level claim `buckSavedCharacter.ts`'s
`BUCK_CAREER_LABEL` / `BUCK_RACE_LABEL` / `BUCK_ABILITY_ABBREV` / `BUCK_SEX_LABEL` cite, and the
evidence that falsifies `buckrogers/index.ts`'s former "the 5 careers above are the only ones the
real game has" (round 35 R4).

Reads the external, never-vendored DOS release at
`D:\Games\Emulator\DOS\GoldBox\BuckRogers1-CountdownToDoomsday\` (there is no GOG release of
either Buck Rogers title); every test SKIPS rather than fails when it is absent.

TWO OF THE FOUR TABLES FALSIFY THE PLAN-SUPPLIED FENCEPOST NULL, and that is pinned here as a
result rather than worked around: a +-1..+-8 shift window can only separate a table whose stride
EXCEEDS 8, because a shift of exactly +-stride lands on the table's own neighbouring entry.
`abbrev` (stride 5) scores 6 of 7 at shifts +-5 and `sex` (stride 7) scores 2 of 2 at shift +7.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import buck_string_tables as B  # noqa: E402


def _result() -> dict:
    if not B.BUCK_START_EXE.exists():
        pytest.skip("Buck Rogers DOS release absent on this machine")
    return B.run()


def test_all_four_tables_are_located_at_their_measured_bases_and_strides() -> None:
    t = _result()["tables"]
    assert (t["career"]["base"], t["career"]["stride"], t["career"]["count"]) == (0xECDC, 12, 7)
    assert (t["race"]["base"], t["race"]["stride"], t["race"]["count"]) == (0xED32, 14, 8)
    assert (t["abbrev"]["base"], t["abbrev"]["stride"], t["abbrev"]["count"]) == (0xE77C, 5, 7)
    assert (t["sex"]["base"], t["sex"]["stride"], t["sex"]["count"]) == (0xEDA2, 7, 2)


def test_career_table_has_seven_entries_including_scout() -> None:
    # THE FINDING that falsifies `buckrogers/index.ts`'s former absolute: the game's own table
    # carries `Scout` (a sixth non-monster career the overlay does not model) and the sentinel
    # `Monster`, not just the five careers the overlay names.
    t = _result()["tables"]["career"]
    assert t["entries"] == [
        "Rocket Jock", "Medic", "Warrior", "Engineer", "Rogue", "Scout", "Monster",
    ]
    assert "Scout" in t["entries"]
    assert len([e for e in t["entries"] if e != "Monster"]) == 6


def test_race_table_has_eight_entries_starting_at_terran() -> None:
    assert _result()["tables"]["race"]["entries"] == [
        "Terran", "Martian", "Venusian", "Mercurian", "Tinker", "Desert Runner",
        "lunarian", "lowlander",
    ]


def test_ability_abbreviation_table_is_the_seven_value_septet() -> None:
    # The table is transcribed; the RECORD's ability-field ORDER is NOT claimed from it (round 34
    # left Buck's ability order unmeasured, and this round does not measure it either).
    assert _result()["tables"]["abbrev"]["entries"] == [
        "STR", "DEX", "CON", "INT", "WIS", "CHA", "TCH",
    ]


def test_sex_table_is_exactly_two_entries() -> None:
    assert _result()["tables"]["sex"]["entries"] == ["Male", "Female"]


def test_career_and_race_bases_are_uniquely_anchored_by_the_fencepost_null() -> None:
    # These two have stride 12 and 14 -- both > 8 -- so the +-8 window cannot alias, and it comes
    # back clean: 7/7 and 8/8 at the real base, 0 at every one of the 16 shifted offsets.
    fn = _result()["fencepost_null"]
    assert fn["career"]["real_base_plausible_count"] == 7
    assert fn["career"]["max_shifted"] == 0
    assert fn["career"]["discriminating"] is True
    assert fn["race"]["real_base_plausible_count"] == 8
    assert fn["race"]["max_shifted"] == 0
    assert fn["race"]["discriminating"] is True


def test_the_fencepost_null_is_NON_DISCRIMINATING_for_the_stride_5_abbrev_table() -> None:
    # MEASURED FALSIFICATION of the plan's "abbrev 7/7 vs 0/7 at 16 shifts" prediction: shifts of
    # -5 and +5 are the table's own neighbouring entries, and they score 6 of 7. The null does not
    # anchor this base; the boundary check below is what does.
    fn = _result()["fencepost_null"]["abbrev"]
    assert fn["real_base_plausible_count"] == 7
    assert fn["stride"] == 5
    assert fn["window_can_alias_stride"] is True
    assert fn["max_shifted"] == 6
    assert fn["discriminating"] is False
    # Named explicitly: it is the +-stride shifts that alias, not some arbitrary neighbour.
    assert fn["shifted_counts"][-5] == 6
    assert fn["shifted_counts"][5] == 6


def test_the_fencepost_null_is_NON_DISCRIMINATING_for_the_stride_7_sex_table() -> None:
    fn = _result()["fencepost_null"]["sex"]
    assert fn["real_base_plausible_count"] == 2
    assert fn["stride"] == 7
    assert fn["window_can_alias_stride"] is True
    assert fn["max_shifted"] == 2
    assert fn["discriminating"] is False


def test_the_boundary_anchor_is_what_fixes_the_two_aliased_tables() -> None:
    # For both tables the fencepost null cannot separate, the slot one stride BEFORE the base and
    # the slot one stride PAST the last entry are checked instead. `abbrev` is bounded on both
    # sides by non-PStrings; `sex` is bounded below (`0xED9B` is mid-`lowlander`) and abuts the
    # next table above, which is why the two-entry count is asserted from the below side only.
    ba = _result()["boundary_anchor"]
    assert ba["abbrev"]["slot_before_plausible"] is False
    assert ba["abbrev"]["slot_after_plausible"] is False
    assert ba["sex"]["slot_before_plausible"] is False
    assert ba["sex"]["slot_after_text"] == "No status"


def test_race_table_abuts_the_career_table_below_and_the_sex_table_above() -> None:
    ba = _result()["boundary_anchor"]["race"]
    assert ba["slot_before_text"] == "Monster"   # the career table's own last entry
    assert ba["slot_after_text"] == "Male"       # the sex table's own first entry


def test_no_record_column_can_be_assigned_the_null_is_non_discriminating() -> None:
    # THE BUCK DELIVERABLE, stated as the negative it is: all 8 of the
    # (column 39/40) x (career/race table) x (0-based/1-based) combinations yield a party in which
    # every one of the six pregens lands on a named entry. "The party comes out fully named" is
    # therefore evidence for none of them, and no column is assigned this round.
    crn = _result()["column_reading_null"]
    if crn.get("available") is False:
        pytest.skip("Buck pregens absent")
    assert crn["total_combinations"] == 8
    assert crn["all_named_combinations"] == 8
    assert all(c["all_named"] for c in crn["per_combination"])


def test_sixteen_of_259_columns_would_pass_the_same_career_plausibility_filter() -> None:
    # The second half of the same null, measured over the whole record rather than the two
    # eyeballed candidates: 16 of the 259 columns hold six values that are all valid 0-based
    # career indices and are not constant. Picking 39 and 40 out of 16 is a choice, not a
    # measurement.
    crn = _result()["column_reading_null"]
    if crn.get("available") is False:
        pytest.skip("Buck pregens absent")
    assert len(crn["career_plausible_columns_0based"]) == 16
    assert 39 in crn["career_plausible_columns_0based"]
    assert 40 in crn["career_plausible_columns_0based"]
    assert len(crn["career_plausible_columns_1based"]) == 5


def test_column_38_is_the_only_strictly_alternating_binary_column_but_is_NOT_assigned() -> None:
    # Reported, deliberately NOT shipped as a field: offset 38 is the ONLY column of the 259 whose
    # six values are exactly [0,1,0,1,0,1], and 0=Male/1=Female would agree with the six pregens'
    # own names (FLAVIUS/PIERRE/ROARKE vs CELESTE/NICOLE STEELE/JANELLE). Three other columns are
    # strictly binary, and "the names sound male/female" is a subjective oracle, so this round
    # records the observation and assigns nothing. A future round needs a creation-screen or
    # character-sheet read to settle it.
    crn = _result()["column_reading_null"]
    if crn.get("available") is False:
        pytest.skip("Buck pregens absent")
    assert crn["column_38_values"] == [0, 1, 0, 1, 0, 1]
    assert crn["binary_columns"] == [38, 65, 148, 153]
    assert crn["names"] == ["FLAVIUS", "CELESTE", "PIERRE", "NICOLE STEELE", "ROARKE", "JANELLE"]


def test_the_engine_label_constants_transcribe_these_exact_tables() -> None:
    # Wiring check: the four exported constants in `buckSavedCharacter.ts` must be exactly what
    # this tool reads out of the retail bytes, in the same order. Parsed textually so this stays a
    # pure-Python test (the vitest side pins the same equality from the TypeScript direction).
    #
    # Three of the four ship as numeric-keyed `Record<number, string>` because the byte that
    # indexes them is a real record field in SOME record (career/race/sex are enumerations); the
    # ability abbreviations ship as a plain ordered array because this round did NOT locate the
    # record's ability ORDER, so a numeric key would assert an indexing claim we have not measured.
    # The two forms are parsed separately here rather than papered over.
    res = _result()
    src = (
        Path(__file__).resolve().parent.parent
        / "packages" / "engine" / "src" / "loaders" / "buckSavedCharacter.ts"
    ).read_text(encoding="utf-8")

    def block_for(const: str) -> str:
        start = src.index(f"export const {const}")
        end = src.index(";", src.index("=", start))
        return src[start:end]

    for const, key in (
        ("BUCK_CAREER_LABEL", "career"),
        ("BUCK_RACE_LABEL", "race"),
        ("BUCK_SEX_LABEL", "sex"),
    ):
        block = block_for(const)
        for i, entry in enumerate(res["tables"][key]["entries"]):
            assert f"{i}: '{entry}'" in block, f"{const} is missing {i}: {entry!r}"

    abbrev_block = block_for("BUCK_ABILITY_ABBREV")
    assert "Readonly<Record<number, string>>" not in abbrev_block, (
        "BUCK_ABILITY_ABBREV must stay an ordered array: a numeric-keyed Record would read as a "
        "claim about the record's ability field order, which round 35 R4 did not measure."
    )
    rhs = abbrev_block[abbrev_block.index("=") + 1 :]
    listed = rhs[rhs.index("[") + 1 : rhs.rindex("]")].split(",")
    assert [x.strip().strip("'") for x in listed] == res["tables"]["abbrev"]["entries"]
