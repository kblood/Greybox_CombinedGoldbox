r"""
Pins `pools_treasures_race_table.py`'s re-derivation of Pools of Darkness's and Treasures of the
Savage Frontier's OWN race-name string tables -- the byte-level claim
`poolsTreasuresSavedCharacter.ts`'s `POOLS_TREASURES_RACE_LABEL` cites (round 35 R4).

Reads each title's retail `GAME.EXE` and its own `SAVE\CHRDATA{n}.SAV` pregens from the external,
never-vendored GOG Galaxy installs; every test SKIPS rather than fails when an install is absent
on the running machine.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pools_treasures_race_table as R  # noqa: E402

TITLE_KEYS = sorted(R.TITLES)

#: Each title's own measured table offsets. Written here as literals so a change to the LOCATION
#: LOGIC (landmark search, stride measurement) cannot silently move the tables the engine's
#: label constant transcribes.
EXPECTED = {
    "pools": {"class_base": 0xACC7, "race_base": 0xAEAD, "records": 6, "zero_based_agree": 5},
    "treasures": {"class_base": 0xD26E, "race_base": 0xD454, "records": 8, "zero_based_agree": 7},
}


def _result(key: str) -> dict:
    if not R.TITLES[key]["exe"].exists():
        pytest.skip(f"{R.TITLES[key]['label']} GOG install absent on this machine")
    return R.run_title(key)


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_class_table_located_with_measured_stride_27_and_18_entries(key: str) -> None:
    ct = _result(key)["class_table"]
    assert ct["base"] == EXPECTED[key]["class_base"]
    assert ct["stride"] == 27
    assert ct["count"] == 18


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_class_table_content_matches_coab_class_id_enum_order(key: str) -> None:
    # The corroborating fact the 0-based reading rests on: each title's OWN compiled string table
    # reproduces CoAB's independently-verified `ClassId` enum in the SAME 0-based order, inside
    # that title's OWN binary.
    res = _result(key)
    assert res["class_table"]["entries"] == R.EXPECTED_CLASS_TABLE
    assert res["class_table_matches_coab_enum_order"] is True


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_race_table_located_immediately_after_class_table_with_7_entries(key: str) -> None:
    res = _result(key)
    ct, rt = res["class_table"], res["race_table"]
    assert rt["base"] == ct["base"] + ct["count"] * ct["stride"]
    assert rt["base"] == EXPECTED[key]["race_base"]
    assert rt["stride"] == 9
    assert rt["count"] == 7


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_race_table_content_is_elf_half_elf_dwarf_gnome_halfling_human_monster(key: str) -> None:
    res = _result(key)
    assert res["race_table"]["entries"] == [
        "Elf", "Half-Elf", "Dwarf", "Gnome", "Halfling", "Human", "Monster",
    ]
    assert res["race_table_matches_expected"] is True


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_race_table_base_is_uniquely_anchored_against_the_fencepost_null(key: str) -> None:
    # MEASURED: the real base scores 7/7 plausible short PStrings; every one of the 16 shifted
    # offsets (-8..-1, +1..+8) scores 0/7. Clean separation, as for Secret's stride-9 table.
    null = _result(key)["race_fencepost_null"]
    assert null["real_base_plausible_count"] == 7
    assert null["max_shifted"] == 0
    assert len(null["shifted_counts"]) == 16


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_fencepost_null_window_cannot_alias_a_stride_9_table(key: str) -> None:
    # The reason the null above is worth anything HERE: a +-8 window cannot reach +-stride when
    # the stride is 9, so it is structurally incapable of scoring the table's own neighbouring
    # entry. `tools/test_buck_string_tables.py` pins the opposite case -- two Buck tables whose
    # stride is 5 and 7, where the same null scores 6/7 and 2/2 and decides nothing.
    null = _result(key)["race_fencepost_null"]
    assert null["stride"] == 9
    assert null["window_can_alias_stride"] is False


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_race_table_extent_is_bounded_below_by_a_non_pstring(key: str) -> None:
    # The check the fencepost null cannot make: one stride BEFORE the base is not a plausible
    # PString in either title, so the table does not silently start an entry earlier (which is
    # exactly how Secret's table turned out to have a leading `Tribble` these two do not).
    ba = _result(key)["race_boundary_anchor"]
    assert ba["slot_before_plausible"] is False


def test_pools_race_table_is_followed_by_the_alignment_table() -> None:
    # Pools' next table starts exactly one stride past the 7th entry ("Lawful Good"), which fixes
    # the count at 7 from above as well as below. Treasures pads one byte instead, so this is
    # asserted per title rather than as a shared rule.
    ba = _result("pools")["race_boundary_anchor"]
    assert ba["slot_after_offset"] == 0xAEEC
    assert ba["slot_after_text"] == "Lawful Good"


def test_treasures_race_table_is_followed_by_a_pad_byte_not_an_eighth_entry() -> None:
    ba = _result("treasures")["race_boundary_anchor"]
    assert ba["slot_after_offset"] == 0xD493
    assert ba["slot_after_plausible"] is False


@pytest.mark.parametrize("key", TITLE_KEYS)
def test_class_byte_indexing_is_zero_based_against_the_records_own_level_array(key: str) -> None:
    # The corroboration for the 0-based CONVENTION, measured inside the same table block and
    # against an oracle that is not the race byte: the class byte @0xae indexes the class table
    # this tool located, and its 0-based reading agrees with the record's own `classLevel[8]`
    # window on 5/6 (Pools) + 7/8 (Treasures) = 12 of 14 records -- the two misses are ABAGAIL and
    # OUGO, round 31's known outliers, whose class byte and level array disagree with each other.
    # The 1-based reading agrees with 0 of 14. Nothing in this table block is 1-based.
    ci = _result(key)["class_byte_indexing"]
    if not ci.get("available"):
        pytest.skip(f"{key} pregens absent")
    assert ci["records"] == EXPECTED[key]["records"]
    assert ci["zero_based_agree"] == EXPECTED[key]["zero_based_agree"]
    assert ci["one_based_agree"] == 0


def test_class_byte_indexing_totals_12_of_14_zero_based_and_0_of_14_one_based() -> None:
    totals = {"zero": 0, "one": 0, "records": 0}
    for key in TITLE_KEYS:
        ci = _result(key)["class_byte_indexing"]
        if not ci.get("available"):
            pytest.skip(f"{key} pregens absent")
        totals["zero"] += ci["zero_based_agree"]
        totals["one"] += ci["one_based_agree"]
        totals["records"] += ci["records"]
    assert totals == {"zero": 12, "one": 0, "records": 14}


def test_the_two_titles_tables_are_derived_independently_not_copied() -> None:
    # Bar: "both derivations independent (not copied from one to the other)". The two offsets are
    # different numbers found by the same search in two different images; this test fails if a
    # future edit ever makes one title's offset a constant derived from the other's.
    pools, treasures = _result("pools"), _result("treasures")
    assert pools["race_table"]["base"] != treasures["race_table"]["base"]
    assert pools["class_table"]["base"] != treasures["class_table"]["base"]
    assert pools["race_table"]["entries"] == treasures["race_table"]["entries"]


def test_this_table_is_not_secrets_table_the_enum_is_not_family_stable() -> None:
    # Secret of the Silver Blades' own table (round 34, `secret_race_table.py`) has EIGHT entries
    # with a leading `Tribble`; these two have SEVEN starting at `Elf`. Reusing Secret's numbering
    # here would read byte 5 as `Halfling` instead of `Human`, which is the whole finding.
    import secret_race_table as S  # noqa: PLC0415

    assert S.EXPECTED_RACE_TABLE[0] == "Tribble"
    assert len(S.EXPECTED_RACE_TABLE) == 8
    assert R.EXPECTED_RACE_TABLE == S.EXPECTED_RACE_TABLE[1:]
    assert len(R.EXPECTED_RACE_TABLE) == 7
    assert R.EXPECTED_RACE_TABLE[5] == "Human"
    assert S.EXPECTED_RACE_TABLE[5] == "Halfling"


def test_the_table_is_exactly_the_frua_hackdoc_race_enum_in_the_same_order() -> None:
    # `hackdocs_extracted/CCHFORM.TXT` documents FRUA's own `.CCH` race enum at record offset 88:
    # 0=Elf, 1=Half-Elf, 2=Dwarf, 3=Gnome, 4=Halfling, 5=Human, 6=Monster. Both titles' own
    # compiled tables ARE that list, in that order, with no extra slot -- an independent
    # corroboration of the 0-based reading that does not come from either title's own binary.
    # (`hackdocs_extracted/LEVLIM.TXT` names "race 5 (Human)" in the same enum a second time.)
    doc = Path(__file__).resolve().parent.parent / "hackdocs_extracted" / "CCHFORM.TXT"
    if not doc.exists():
        pytest.skip("hackdocs_extracted/ not present (re-extract from hackdocs.zip)")
    text = doc.read_text(encoding="latin-1")
    idx = text.find("Race")
    assert idx > 0
    window = text[idx : idx + 300]
    for value, name in enumerate(R.EXPECTED_RACE_TABLE):
        assert f"{value} = {name}" in window, f"{value} = {name} not documented in CCHFORM.TXT"
