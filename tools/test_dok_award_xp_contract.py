"""Retail anchors for DoK ECL opcode 0x41's compact-record write contract.

CCPARTY carries the recovered next-level values in its compact GBD1 tail so
CCECL can reproduce the original handler's u32 +0x62 XP update and +0xc6
readiness result without embedding the full START.EXE threshold matrix.
"""
import sys
from hashlib import sha256
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import vroomm_layout
from tools.exepack_unpack import unpack


OVR = ROOT / "Death Knights of Krynn" / "GAME.OVR"
START = ROOT / "Death Knights of Krynn" / "START.EXE"
SAVE = ROOT / "Death Knights of Krynn" / "SAVE"
HANDLER = 0x2E0E
POST_AWARD_CALL = bytes.fromhex("9a 1a 01 cf 00")
POST_AWARD_CALLEE = 0x35A5E
DOK_DGROUP_PARAGRAPH = 0x0BCE
DOK_DGROUP_IMAGE_OFFSET = DOK_DGROUP_PARAGRAPH * 16
DOK_XP_THRESHOLDS_OFF = 0x7638
DOK_XP_THRESHOLD_STRIDE = 0xCC
DOK_LEVEL_LIMITS_OFF = 0x82D4


@pytest.fixture(scope="module")
def ovr() -> bytes:
    if not OVR.exists():
        pytest.skip(f"retail data absent: {OVR}")
    return OVR.read_bytes()


@pytest.fixture(scope="module")
def start_image() -> bytes:
    if not START.exists():
        pytest.skip(f"retail data absent: {START}")
    return unpack(START)[0]


def category_for_slot(record: bytes, slot: int) -> int:
    """Exact `GAME.OVR:0x359c3` mapping for valid positive class slots."""
    if slot == 0:
        return 1 if record[0x23] > 4 else 0
    if slot == 7:
        return {1: 3, 2: 4, 3: 5}[record[0x22]]
    if slot == 2:
        return 2
    if slot == 4:
        return 6
    if slot == 5:
        return 7 if record[0x24] == 1 else 8
    if slot == 6:
        return 9
    if slot == 3:
        return 10
    raise AssertionError(f"unexpected positive DoK class slot {slot}")


def is_level_ready(record: bytes, image: bytes) -> bool:
    xp = int.from_bytes(record[0x62:0x66], "little")
    record_type = record[0x20]
    for slot, level in enumerate(record[0x45:0x4D]):
        if not 0 < level < 18:
            continue
        category = category_for_slot(record, slot)
        threshold_off = (
            DOK_DGROUP_IMAGE_OFFSET
            + DOK_XP_THRESHOLDS_OFF
            + category * DOK_XP_THRESHOLD_STRIDE
            + (level + 1) * 4
        )
        threshold = int.from_bytes(image[threshold_off:threshold_off + 4], "little")
        limit = image[DOK_DGROUP_IMAGE_OFFSET + DOK_LEVEL_LIMITS_OFF + record_type * 8 + slot]
        if threshold and xp >= threshold and limit > level:
            return True
    return False


def test_award_handler_has_the_grounded_two_operand_prologue(ovr: bytes):
    assert ovr[HANDLER:HANDLER + 23] == bytes.fromhex(
        "55 89 e5 81 ec 0c 01 b0 02 50 9a 2a 00 41 00 "
        "b0 02 50 9a 25 00 41 00"
    )


def test_award_handler_divides_positive_class_slots_and_updates_u32(ovr: bytes):
    body = ovr[HANDLER:HANDLER + 0x1AB]
    assert bytes.fromhex("26 80 7d 45 00 7e 03 fe 46 f7") in body  # +45..+4c > 0
    assert bytes.fromhex("f7 f1") in body  # div cx
    assert bytes.fromhex("26 01 45 62 26 11 55 64") in body  # add/adc +62/+64
    assert bytes.fromhex("26 8b 85 b9 00 26 8b 95 bb 00") in body  # next pointer


def test_award_handler_keeps_its_required_post_award_recalculation(ovr: bytes):
    body = ovr[HANDLER:HANDLER + 0x1AB]
    assert POST_AWARD_CALL + bytes.fromhex("c4 7e f9 26 88 85 c6 00") in body


def test_post_award_call_resolves_through_its_owned_vroomm_public_stub():
    if not OVR.exists():
        pytest.skip(f"retail data absent: {OVR}")
    layout = vroomm_layout.map_game(OVR.parent)
    source = next(
        entry
        for descriptor in layout.descriptors
        for entry in descriptor.fixup_entries
        if descriptor.index == 2 and entry.instruction_offset == 0x26BA
    )
    assert layout.stub_selector_base == 0x29
    assert source.call_target_offset == 0x11A
    assert source.route_kind == "public_stub_owned"
    assert source.target_descriptor_index == 24
    assert source.target_stub_index == 50
    assert source.target_proc_offset == 0x38C7
    assert source.target_ovr_file_offset == POST_AWARD_CALLEE


def test_post_award_callee_has_the_xp_and_level_readiness_predicate(ovr: bytes):
    body = ovr[POST_AWARD_CALLEE:POST_AWARD_CALLEE + 0xF6]
    assert body.startswith(bytes.fromhex("55 89 e5 83 ec 0a c6 46 fd 00 c6 46 fc 00"))
    assert bytes.fromhex("26 80 7d 45 00 7f") in body  # class level is positive
    assert bytes.fromhex("26 80 7d 45 12 7c") in body  # class level is below 18
    assert bytes.fromhex("ba cc 00 f7 e2") in body  # 204-byte threshold-table stride
    assert bytes.fromhex("8b 85 38 76 8b 95 3a 76") in body  # DS:7638 u32 XP threshold
    assert bytes.fromhex("8a 85 d4 82 3a 46 fb b0 00 77 01 40") in body  # DS:82d4 level limit
    assert bytes.fromhex("26 8b 45 62 26 8b 55 64") in body  # PC u32 XP
    assert bytes.fromhex("3b 56 f9 7f 07 7c 19 3b 46 f7 72 14") in body
    assert body.endswith(bytes.fromhex("8a 46 fd 88 46 ff 8a 46 ff 89 ec 5d ca 04 00"))


def test_post_award_category_helper_is_pinned(ovr: bytes):
    helper = ovr[0x359C3:0x35A5D]
    assert sha256(helper).hexdigest() == "b054bc9d2666271cf19de18a22b94fa9af9186ca0db91aa0ee11b0f0d3124b83"


def test_start_image_owns_the_post_award_tables(start_image: bytes):
    assert start_image[0xA070:0xA077] == bytes.fromhex("ba ce 0b 8e da 8c 06")
    thresholds = start_image[
        DOK_DGROUP_IMAGE_OFFSET + DOK_XP_THRESHOLDS_OFF:
        DOK_DGROUP_IMAGE_OFFSET + DOK_XP_THRESHOLDS_OFF + 11 * DOK_XP_THRESHOLD_STRIDE
    ]
    limits = start_image[
        DOK_DGROUP_IMAGE_OFFSET + DOK_LEVEL_LIMITS_OFF:
        DOK_DGROUP_IMAGE_OFFSET + DOK_LEVEL_LIMITS_OFF + 7 * 8
    ]
    assert sha256(thresholds).hexdigest() == "a7732624410c671bb34ca1120019f2157b0f038963741433e1dcf0961eef40bc"
    assert sha256(limits).hexdigest() == "ef5501454020043957fdbd90b71fd618fac9e7cc3abe5e532e5b15cde7f1e193"
    assert limits == bytes.fromhex(
        "0e 00 0a 0c 0e 0e 00 00 0e 00 0e 00 0e 0e 12 00 "
        "0e 00 09 00 0b 0a 12 0a 0a 00 0e 08 00 00 08 00 "
        "0a 00 0e 00 08 00 0a 00 0c 00 05 00 05 00 12 00 "
        "0e 00 0e 0e 0e 0e 12 0e"
    )


def test_held_pregens_match_the_recovered_level_readiness_predicate(start_image: bytes):
    records = sorted(SAVE.glob("CHRDATA*.GAM"))
    if len(records) != 6:
        pytest.skip(f"expected six held DoK .GAM records, got {len(records)}")
    assert [is_level_ready(record.read_bytes(), start_image) for record in records] == [False] * 6
    assert [record.read_bytes()[0xC6] for record in records] == [0] * 6


def test_c6_readiness_result_is_consumed_by_character_status_dispatch(ovr: bytes):
    # This branch ranks +c6 between the +c8 and +c9 character state branches.
    assert ovr[0x33CD2:0x33D16] == bytes.fromhex(
        "55 89 e5 83 ec 04 c4 7e 0c 26 80 bd c8 00 00 75 06 "
        "c6 46 ff 0c eb 2d c4 7e 0c 26 80 bd c9 00 01 75 0d "
        "80 3e 4e 8c 05 75 06 c6 46 ff 0e eb 15 c4 7e 0c "
        "26 80 bd c6 00 00 74 06 c6 46 ff 0d eb 04 c6 46 ff 0b"
    )


def test_saved_pc_records_have_a_nonzero_u32_at_the_award_offset():
    records = sorted(SAVE.glob("CHRDATA*.GAM"))
    if len(records) != 6:
        pytest.skip(f"expected six held DoK .GAM records, got {len(records)}")
    values = [int.from_bytes(record.read_bytes()[0x62:0x66], "little") for record in records]
    assert all(record.stat().st_size == 216 for record in records)
    assert values == [210003, 210003, 105002, 70001, 105002, 70001]
