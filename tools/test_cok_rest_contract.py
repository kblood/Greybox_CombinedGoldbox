"""Retail-byte guards for the next native CoK rest implementation."""
from pathlib import Path
import hashlib
import re

import pytest

from tools.analyze_cok_rest import analyze, read_affect_records
from tools.exepack_unpack import unpack


@pytest.fixture(scope="module")
def retail():
    game = Path(__file__).resolve().parents[1] / "Champions of Krynn"
    if not (game / "START.EXE").exists() or not (game / "GAME.OVR").exists():
        pytest.skip("held CoK DOS retail files are unavailable")
    start, _ = unpack(game / "START.EXE")
    return (game / "GAME.OVR").read_bytes(), start


def test_retail_rest_clock_and_encounter_contract(retail):
    result = analyze(*retail)
    assert result["clock_slot"] == 1
    assert result["clock_units_per_iteration"] == 5
    assert result["clock_radices"] == [10, 10, 6, 24, 30, 12, 256]
    assert result["heal_every_iterations"] == 288
    assert result["heal_counter_resets_on_camp_entry"] is True
    assert result["heal_every_iterations"] * 5 == 24 * 60
    assert result["dgroup_image_offset"] == 0xBC60
    assert result["clock_radices_image_offset"] == 0xF4D4
    assert result["encounter_period_ecl"] == 0x7ED2
    assert result["encounter_chance_ecl"] == 0x7ED3
    assert result["db_stub_count"] == 25
    assert result["db_overlay_base"] == 0x33FAB
    assert result["healing_target"] == 0x36195
    assert result["healing_eligible_statuses"] == [0, 1, 4, 5]


@pytest.mark.parametrize("offset", [0x1D2B3, 0x2B7DC, 0x2B7E4, 0x2B258, 0x2B82C, 0x98C0, 0x36246])
def test_changed_call_or_state_instruction_is_rejected(retail, offset):
    ovr, start = retail
    changed = bytearray(ovr)
    changed[offset] ^= 1
    with pytest.raises(ValueError):
        analyze(changed, start)


def test_timed_affect_expiry_and_save_contract(retail):
    result = analyze(*retail)["timed_affects"]
    assert result["timer_target"] == 0x2A9CF
    assert result["expiry_target"] == 0x34194
    assert result["character_list_offset"] == 227
    assert result["duration_offset"] == 1
    assert result["applied_offset"] == 4
    assert result["next_pointer_offset"] == 5
    assert result["zero_duration_expires"] is False
    assert result["expiry_comparison"] == "elapsed >= remaining"
    assert result["elapsed_chunk_max"] == 10
    assert result["node_bytes"] == result["save_node_bytes"] == 9
    assert result["loader_rebuilds_links"] is True
    assert result["camp_timer_flags_initially_all_set"] is True
    assert result["post_removal_callback_ids"] == [12, 14, 38]
    assert result["callback_table_ds"] == 0x6B94
    assert result["callback_overlay_bases"] == {0x65: 0x10BE8, 0xBA: 0x2DC0B}
    assert len(result["callbacks"]) == 120
    assert result["callbacks"][0x27]["target"] == 0x11B60
    assert result["callbacks"][0x2A]["target"] == 0x12034
    assert result["callbacks"][4]["segment"] == 0xBA
    assert result["haste_age"] == {"character_word_offset": 96, "node_flag_offset": 3,
                                   "once_bit": 0x10, "increment": 1, "message": "ages"}


@pytest.mark.parametrize("offset", [
    0x2AE44, 0x2AB4D, 0x2AB6F, 0x2AB79, 0x2ABC1, 0x341FA,
    0x34210, 0x3418E, 0x342A3, 0x1E859, 0x1E86C, 0x144DC, 0x146AC,
    0x11B6E, 0x11BB3,
    0x2B6F1, 0x1EBE3, 0x1EC7D, 0x342AE, 0x11BBD, 0x1203D,
    0x2AA2F, 0x2AA3D, 0x2AA50,
])
def test_changed_timer_expiry_or_serialization_is_rejected(retail, offset):
    ovr, start = retail
    changed = bytearray(ovr)
    changed[offset] ^= 1
    with pytest.raises(ValueError):
        analyze(changed, start)


def test_held_sfx_corpus_has_no_timed_boundary_example(retail):
    saves = Path(__file__).resolve().parents[1] / "Champions of Krynn" / "SAVE"
    records = [r for p in saves.glob("*.SFX") for r in read_affect_records(p.read_bytes())]
    assert len(records) == 8
    assert all(r["duration"] == 0 for r in records)
    assert any(r["applied"] == 1 for r in records)


def test_sfx_duration_is_a_word_and_saved_pointers_are_opaque():
    records = read_affect_records(bytes.fromhex("27 34 12 ff 01 ef be ad de"))
    assert records == [{"id": 0x27, "duration": 0x1234, "byte3": 255,
                        "applied": 1, "saved_next_pointer": "efbeadde"}]
    with pytest.raises(ValueError):
        read_affect_records(bytes(10))


def test_cok_spell_query_and_memorization_fields(retail):
    result = analyze(*retail)["memorization"]
    assert result == {"spell_query_target": 0x3AF7, "queue_offset": 30, "queue_slots": 58,
                      "slot_base": 0, "owner_base": 0, "missing_slot": 255,
                      "query_compares_raw_byte": True, "pending_bit": 128,
                      "preparation_hours_offset": 88, "hour_ticks": 12,
                      "ticks_per_level": 3, "spell_table_ds": 0x31B4, "spell_table_stride": 16,
                      "queued_preparation_hours": [4, 6], "long_preparation_above_level": 2}


@pytest.mark.parametrize("offset", [0x4404,0x4409,0x3B5E,0x3B6C,0x3B7B,0x3BC6,
                                   0x3BCF,0x3BDD,0x2B7E8,0x2B7F1,0x2B31E,
                                   0x2B33B,0x2B376,0x2B549,0x2B5C2,0x2B5F8,0x2B584,
                                   0x1A7B6,0x1A7BA,0x1A7D0,0x1B59B])
def test_changed_spell_query_or_rest_instruction_is_rejected(retail, offset):
    ovr, start = retail
    changed = bytearray(ovr)
    changed[offset] ^= 1
    with pytest.raises(ValueError):
        analyze(changed, start)


def test_learning_schedule_and_native_table_agree_with_retail(retail):
    result = analyze(*retail)['learning_schedule']
    assert result['rest_target'] == 0x2B69C
    assert result['selector_target'] == 0x2A257
    assert (result['grimoire_id_min'], result['grimoire_id_max']) == (1, 107)
    assert result['known_spell_base'] == 98
    assert result['scroll_item_ids'] == [39, 40]
    assert result['scroll_pending_offsets'] == [60, 61, 62]
    assert result['scribing_item_removal_target'] == 0x37C3D
    assert result['overlay_descriptors'] == 34
    assert result['overlay_procedures'] == 504
    assert result['new_rest_resets_preparation_phase_and_counts'] is True
    assert result['lookahead_skips_zero_levels'] is True
    levels = bytes(result['levels'])
    assert hashlib.sha256(levels).hexdigest() == 'aa4d64fdb5b95c80796fc2fe43518f2b0dd2874c398db1a0f717dce85515fa71'
    source = (Path(__file__).resolve().parents[1]/'native/src/gbboot.asm').read_text()
    encoded = re.search(r'^learn_levels db ([\d,]+)$', source, re.M)
    assert encoded is not None
    assert bytes(map(int, encoded[1].split(','))) == levels


@pytest.mark.parametrize('offset', [0x1C343, 0x1D423, 0x1C34D, 0x1D432, 0x1B5FA,
                                   0x2B6A9, 0x2B6CE, 0x1A7D7, 0x1A7E3, 0x1A7EF,
                                   0x2E835, 0x2E849, 0x2E880, 0x33348, 0x33352,
                                   0x2B43A, 0x2B327, 0x2B365, 0x333D7, 0x37D23])
def test_changed_learning_boundary_or_scroll_predicate_is_rejected(retail, offset):
    ovr, start = retail
    changed = bytearray(ovr); changed[offset] ^= 1
    with pytest.raises(ValueError):
        analyze(changed, start)
