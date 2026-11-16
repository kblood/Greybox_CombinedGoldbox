r"""
Pins `secret_race_table.py`'s re-derivation of Secret of the Silver Blades' race-name string
table -- the byte-level claim `secretSavedCharacter.ts`'s `SECRET_RACE_LABEL` cites (round 34 R3).

Reads Secret's retail `START.EXE` from the external, never-vendored GOG Galaxy install
(`C:\Program Files (x86)\GOG Galaxy\Games\Secret of the Silver Blades\START.EXE`) --
every test SKIPS rather than fails when that install is absent on the running machine.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import secret_race_table as R  # noqa: E402


def _result() -> dict:
    if not R.SECRET_START_EXE.exists():
        pytest.skip("Secret of the Silver Blades GOG install absent on this machine")
    return R.run()


def test_class_table_located_at_expected_offset_with_expected_stride():
    res = _result()
    ct = res["class_table"]
    assert ct["base"] == 0xE9AB
    assert ct["stride"] == 27
    assert ct["count"] == 18


def test_class_table_content_matches_coab_class_id_enum_order():
    # This is the round's central corroborating fact for Bar A: Secret's OWN compiled string
    # table reproduces CoAB's independently-verified `ClassId` enum, in the SAME 0-based order,
    # inside Secret's OWN binary -- not merely a plausible-sounding fit.
    res = _result()
    assert res["class_table"]["entries"] == R.EXPECTED_CLASS_TABLE
    assert res["class_table_matches_coab_enum_order"] is True


def test_race_table_located_immediately_after_class_table():
    res = _result()
    ct, rt = res["class_table"], res["race_table"]
    assert rt["base"] == ct["base"] + ct["count"] * ct["stride"]
    assert rt["base"] == 0xEB91
    assert rt["stride"] == 9
    assert rt["count"] == 8


def test_race_table_content_is_tribble_elf_half_elf_dwarf_gnome_halfling_human_monster():
    res = _result()
    assert res["race_table"]["entries"] == [
        "Tribble", "Elf", "Half-Elf", "Dwarf", "Gnome", "Halfling", "Human", "Monster",
    ]
    assert res["race_table_matches_expected"] is True


def test_race_table_base_is_uniquely_anchored_against_the_fencepost_null():
    # The null: try every neighbouring byte offset (+-1..+-8) as if IT were the table base, and
    # count how many of the 8 resulting "entries" still look like plausible short PStrings
    # (length byte 1..15, all-printable-ASCII payload of that exact length). If a shifted offset
    # scored anywhere near the real base, the base would not be well anchored by structure alone.
    # MEASURED: the real base scores 8/8 plausible entries; every one of the 16 shifted offsets
    # scores 0/8 -- not a near-miss, a clean separation.
    res = _result()
    null = res["race_fencepost_null"]
    assert null["real_base_plausible_count"] == 8
    assert null["max_shifted"] == 0
    assert len(null["shifted_counts"]) == 16  # -8..-1, 1..8


def test_class_table_base_is_uniquely_anchored_against_the_fencepost_null():
    # Only 13/18 (not 18/18): 5 of the multiclass names ("Cleric/Fighter/Magic-User" etc.) exceed
    # the plausibility filter's 15-char cap, which this null intentionally does not special-case
    # (it is calibrated for the race table's own 8-char-max strings). What matters is the
    # separation from the shifted null, not hitting the table's own entry count.
    res = _result()
    null = res["class_fencepost_null"]
    assert null["real_base_plausible_count"] == 13
    assert null["max_shifted"] == 0


def test_zero_based_index_of_observed_pregen_bytes_yields_dwarf_and_human():
    # The two race-byte values actually observed in the six real CHRDATA{1..6}.SAV pregens
    # (`docs/engine/research/secret-chrdata-fields.md`): 3 (MALACHITE, the party's one multiclass)
    # and 6 (the other five). This is the P8 prediction, pinned against the re-derived table so a
    # future change to the table-location logic cannot silently change the claimed names.
    res = _result()
    entries = res["race_table"]["entries"]
    assert entries[3] == "Dwarf"
    assert entries[6] == "Human"


def test_frua_hackdoc_enum_is_a_strict_subrange_of_secrets_own_table_in_the_same_order():
    # docs/engine/research/secret-chrdata-fields.md transcribes hackdocs_extracted/CCHFORM.TXT's
    # own FRUA race enum: 0=Elf,1=Half-Elf,2=Dwarf,3=Gnome,4=Halfling,5=Human,6=Monster. This test
    # pins that Secret's own table (this round's finding) is EXACTLY that 7-entry list, in the
    # same order, with one extra slot (`Tribble`) prepended -- the fact this round's rejection of
    # the "FRUA numbering reused directly" alternative rests on.
    res = _result()
    entries = res["race_table"]["entries"]
    frua_order = ["Elf", "Half-Elf", "Dwarf", "Gnome", "Halfling", "Human", "Monster"]
    assert entries[1:] == frua_order
    assert entries[0] == "Tribble"
