"""Original DQK record bases, class table dispatch, and training thresholds."""
from hashlib import sha256
import struct
import subprocess
import sys

import pytest

from tools.dqk_character_rules import (
    CODE_ANCHORS, DEFAULT_EXE, DGROUP_FILE, DqkCharacterRules, RECORD_FIELD_SPAN,
    ROOT, category_for_slot,
)


@pytest.fixture(scope="module")
def image():
    if not DEFAULT_EXE.is_file():
        pytest.skip("held original DQK executable absent")
    return DEFAULT_EXE.read_bytes()


@pytest.fixture(scope="module")
def rules(image):
    return DqkCharacterRules.from_executable(image)


def record(slot=2, level=11, xp=1000001, race=6, order=1, deity=0, robe=1):
    result = bytearray(RECORD_FIELD_SPAN)
    struct.pack_into("<I", result, 0x44, xp)
    struct.pack_into("<H", result, 0x58, race)
    result[0xA5 + slot] = level
    result[0x19A] = order
    struct.pack_into("<H", result, 0x19B, deity)
    result[0x19D] = robe
    return result


@pytest.mark.parametrize("slot,order,deity,robe,expected", [
    (0, 1, 4, 1, 0), (0, 1, 5, 1, 1), (0, 1, 0xFFFF, 1, 0),
    (1, 1, 0, 1, 3), (1, 2, 0, 1, 4), (1, 3, 0, 1, 5),
    (2, 1, 0, 1, 2), (3, 1, 0, 1, 10), (4, 1, 0, 1, 6),
    (5, 1, 0, 1, 7), (5, 1, 0, 2, 8), (6, 1, 0, 1, 9),
])
def test_category_dispatch(slot, order, deity, robe, expected):
    assert category_for_slot(record(slot, order=order, deity=deity, robe=robe), slot) == expected


def test_original_jump_table_proves_slot_order(image):
    assert struct.unpack_from("<7H", image, 0xBB33) == (
        0x1F61, 0x1F7B, 0x1FAB, 0x1FD9, 0x1FB2, 0x1FB9, 0x1FD2)


def test_creation_overlay_base_from_two_cs_tables_and_callback(image, monkeypatch):
    # The former first-prologue guess placed the base 0x370 bytes too late.
    # These CS-relative tables independently recover the paragraph base.
    assert image[0x3B295:0x3B29A] == bytes.fromhex("2e ff a7 da 0d")
    assert image[0x3B419:0x3B41E] == bytes.fromhex("2e ff a7 5e 0f")
    assert 0x3B29A - 0xDDA == 0x3B41E - 0xF5E == 0x3A4C0
    assert image[0x3D3B4:0x3D3B9] == bytes.fromhex("0e b8 0a 22 50")
    assert image[0x3A4C0 + 0x220A:0x3A4C0 + 0x220A + 9] == bytes.fromhex(
        "56 ff 36 59 c7 ff 36 57 c7")
    monkeypatch.syspath_prepend(str(ROOT / "tools"))
    import disasm_dqk
    import rtlink_map
    import carve_goldbox_overlays
    disassembler = disasm_dqk.DqkImage(DEFAULT_EXE)
    assert disassembler.overlay_code_start(5) == 0x3A4C0
    assert disassembler.resolve_ljmp(0x25A4, 0x220A, base_idx=5)[0] == 0x3C6CA
    mapped = rtlink_map.map_file(DEFAULT_EXE)
    assert mapped.overlays[5].code_start == 0x3A4C0
    assert rtlink_map.resolve_stub_target(mapped.overlays, 5, 0x25A4, 0x220A)[0] == 0x3C6CA
    chunks = carve_goldbox_overlays.carve_dqk_exe(DEFAULT_EXE)
    assert chunks[5].code_offset == 0x3A4C0
    # Validate all six exported targets, including subsegments, not just the
    # creator which is passed as a CS-relative callback rather than exported.
    expected = {0xF9F: 0x3DF4F, 0x139B: 0x3A4C1, 0x13FF: 0x3B1B1,
                0x1409: 0x3D455, 0x1431: 0x3F512, 0x146D: 0x3F173}
    actual = {stub.resident_offset: stub.target_file_offset
              for stub in mapped.stubs if stub.overlay_index == 5}
    assert actual == expected


@pytest.mark.parametrize("start,end,digest", [
    (0x852, 0xB96, "37b054950df1a9702fde4178cb3281c7a1675f866012a46f6523fc51b4cc2280"),
    (0x28C, 0x2B8, "28e122491c24d2fa8f4db95908c42037dba605f4f8e0984daa7a3e7dee314ef7"),
    (0x17DC, 0x180D, "2e961e016c1402a6c4a7ecb303c13d52068eb996a42c11c2d75b93446684cee1"),
])
def test_held_original_data_spans(image, start, end, digest):
    assert sha256(image[DGROUP_FILE + start:DGROUP_FILE + end]).hexdigest() == digest


@pytest.mark.parametrize("anchor", CODE_ANCHORS)
def test_wrong_helper_revision_rejected(image, anchor):
    mutant = bytearray(image)
    mutant[anchor[0]] ^= 1
    with pytest.raises(ValueError, match="unsupported DQK helper"):
        DqkCharacterRules.from_executable(mutant)


def test_table_values_are_read_from_supplied_executable(image):
    mutant = bytearray(image)
    struct.pack_into("<I", mutant, DGROUP_FILE + 0x852 + 2 * 0x4C + 12 * 4, 1234567)
    assert DqkCharacterRules.from_executable(mutant).threshold(record(), 2, 12) == 1234567


@pytest.mark.parametrize("slot,deity,robe,level,threshold", [
    (0, 4, 1, 12, 1000000), (0, 5, 1, 12, 1125000),
    (2, 0, 1, 12, 1000001), (3, 0, 1, 11, 1050001),
    (4, 0, 1, 12, 975001), (5, 0, 1, 12, 1000000),
    (5, 0, 2, 12, 900000), (6, 0, 1, 14, 880001),
    (2, 0, 1, 17, 2250001), (2, 0, 1, 18, 2500001),
    (2, 0, 1, 40, 8000001), (2, 0, 1, 41, 0x7FFFFFFF),
    (2, 0, 1, 255, 0x7FFFFFFF),
])
def test_thresholds(rules, slot, deity, robe, level, threshold):
    assert rules.threshold(record(slot, deity=deity, robe=robe), slot, level) == threshold


@pytest.mark.parametrize("xp,expected", [(1000000, ()), (1000001, (2,)), (1000002, (2,)),
                                        (0x80000000, ()), (0xFFFFFFFF, ())])
def test_fighter_readiness_boundary_and_signed_xp(rules, xp, expected):
    assert rules.ready_slots(record(xp=xp)) == expected


def test_racial_caps_and_rose_exception(rules):
    assert rules.ready_slots(record(level=9, race=2)) == ()  # half-elf fighter cap 9
    assert rules.ready_slots(record(level=8, race=2)) == (2,)
    assert rules.level_cap(record(slot=1, order=1), 1) == 18
    assert rules.level_cap(record(slot=1, order=3), 1) == 40
    assert rules.ready_slots(record(slot=1, level=18, xp=0x7FFFFFFF, order=1)) == ()
    assert rules.ready_slots(record(slot=1, level=18, xp=0x7FFFFFFF, order=3)) == (1,)
    assert rules.ready_slots(record(slot=1, level=40, xp=0x7FFFFFFF, order=3)) == ()


def test_multiclass_readiness_uses_member_xp_for_each_slot(rules):
    pc = record(slot=0, level=9, xp=500000)
    pc[0xA7] = 9  # fighter: next threshold is 500001, cleric is 500000
    before = bytes(pc)
    assert rules.ready_slots(pc) == (0,)
    assert bytes(pc) == before


def test_undefined_inputs_rejected(rules):
    with pytest.raises(ValueError, match="truncated"):
        DqkCharacterRules.from_executable(b"MZ")
    with pytest.raises(ValueError, match="full character record"):
        category_for_slot(b"", 2)
    with pytest.raises(ValueError, match="knight order"):
        category_for_slot(record(slot=1, order=0), 1)
    with pytest.raises(ValueError, match="slot"):
        category_for_slot(record(), 7)
    with pytest.raises(ValueError, match="race"):
        rules.level_cap(record(race=7), 2)
    for level in (0, 1, 256):
        with pytest.raises(ValueError, match="2..255"):
            rules.threshold(record(), 2, level)


def test_physical_qsv_records_use_the_correct_xp_base(rules):
    path = ROOT / "The Dark Queen of Krynn/SAVE/SAVGAMA.QSV"
    if not path.exists():
        pytest.skip("held DQK party absent")
    data = path.read_bytes()
    expected = [1000001, 500000, 333333, 500000, 500000, 500000]
    offsets = [0x40F, 0x60B, 0x821, 0xA50, 0xC5E, 0xE7C]
    for offset, xp in zip(offsets, expected):
        pc = data[offset:offset + RECORD_FIELD_SPAN]
        assert struct.unpack_from("<I", pc, 0x44)[0] == xp
        assert struct.unpack_from("<I", data, offset + 8 + 0x3C)[0] == xp
        assert struct.unpack_from("<I", data, offset + 8 + 0x44)[0] == 200
        assert rules.ready_slots(pc) == ()
        assert pc[0xCD] == 0


def test_cli_inspects_an_explicit_physical_record(image, tmp_path):
    path = tmp_path / "character.bin"
    pc = record()
    pc[0x68:0x70] = b"CHECKER\0"
    path.write_bytes(b"prefix" + pc)
    result = subprocess.run([sys.executable, str(ROOT / "tools/dqk_character_rules.py"),
                             "--record", str(path), "--offset", "6"],
                            capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    import json
    output = json.loads(result.stdout)
    assert output["name"] == "CHECKER"
    assert output["xp"] == 1000001
    assert output["ready"] is True
    assert output["physical_record_offset"] == 6


# ---- creation path (2026-10-07) ----------------------------------------
from tools.dqk_character_rules import CREATE_CLASSES, CREATION_XP, dice_stream  # noqa: E402


def hp_record(levels, con=14, current=0, maximum=0):
    result = bytearray(RECORD_FIELD_SPAN)
    result[0x81], result[0x89], result[0x198] = con, maximum, current
    for slot, level in levels.items():
        result[0xA5 + slot] = level
    return result


def run_hp(rules, levels, raws, con=14, current=0, maximum=0, divisor=1):
    """Raw values are injected at the same boundary the Unicorn probe used."""
    result = hp_record(levels, con, current, maximum)
    values = iter(raws * 4)
    sides = []

    def rng(s):
        sides.append(s)
        return next(values)
    rules.hp_helper(result, 0xFF, divisor, rng)
    return (result[0x89], result[0xC0], result[0x198]), sides


@pytest.mark.parametrize("levels,raws,kw,expected,sides", [
    # The eight cases executed by the original code in an offline Unicorn run
    # (verify_original_hp.py, see docs/engine/research/dqk-character-creation.md).
    ({2: 1}, (0, 9), {}, (10, 10, 10), [10, 10]),
    ({2: 9}, (0, 9), {}, (10, 10, 10), [10, 10]),
    ({2: 10}, (0, 9), {}, (3, 3, 3), []),
    ({2: 12}, (0, 9), {}, (3, 3, 3), []),
    ({2: 1}, (0, 9), {"con": 18}, (14, 10, 14), [10, 10]),
    ({2: 1}, (0, 9), {"current": 40, "maximum": 50}, (60, 10, 50), [10, 10]),
    ({4: 1}, (0, 7, 0, 2, 1, 1), {}, (9, 9, 9), [8, 8, 8, 8]),
    ({2: 1, 4: 1}, (0, 9, 0, 2, 1, 1), {"divisor": 2}, (7, 7, 7), [10, 10, 8, 8, 8, 8]),
])
def test_hp_helper_matches_original_execution(rules, levels, raws, kw, expected, sides):
    assert run_hp(rules, levels, raws, **kw) == (expected, sides)


def test_hp_helper_quirks_are_the_originals(rules):
    # CON 3 is -2 (byte 254); the original sums it as an unsigned byte.
    assert rules.con_bonus(3, 2) == 254
    assert rules.con_bonus(18, 2) == 4 and rules.con_bonus(18, 0) == 2
    assert rules.con_bonus(25, 4) == 7 and rules.con_bonus(25, 5) == 2
    # Fixed gain by category: clerics/white mage 1, fighter/paladin 3, rest 2.
    assert rules.creation["fixed_gain"] == (1, 1, 3, 2, 2, 2, 2, 1, 1, 2, 3)
    # Above the cutoff the helper ASSIGNS rather than adds: a thief at its
    # fixed-gain level (2) after a rolled fighter level (1d10) keeps only 2.
    pc = hp_record({2: 2, 6: 11})
    rules.hp_helper(pc, 0xFF, 1, lambda s: s - 1)
    assert pc[0xC0] == 2


def test_luna_original_record_fits_the_model(rules):
    """Retail LUNA (Human Fighter CON 15): level 12, rolled +0xc0 65, max 74.
    With nine rolled levels (1..9) and three fixed (10..12) the CON term is
    9*bonus(15)=9, so max - rolled must be 9 for ANY dice; ten rolled levels
    would give 10."""
    for data in (bytes([0]), bytes([255]), bytes(range(7, 200, 3))):
        pc = rules.create_record("LUNA", 6, (2,), dice_stream(data), con=15)
        assert list(pc[0xA5:0xAC]) == [0, 0, 12, 0, 0, 0, 0]
        assert pc[0x89] - pc[0xC0] == 9
        assert pc[0x89] == pc[0x198]
    assert 74 - 65 == 9                       # the retail bytes at 0x89 / 0xc0
    assert struct.unpack_from("<I", pc, 0x44)[0] == CREATION_XP


@pytest.mark.parametrize("cls,race,levels", [
    ("fighter", 6, {2: 12}), ("ranger", 6, {4: 12}), ("thief", 6, {6: 14}),
    ("mage", 6, {5: 12}), ("cleric", 6, {0: 12}), ("knight", 6, {1: 11}),
    ("fighter", 5, {2: 5}),            # kender cap 5
    ("fighter", 2, {2: 9}),            # half-elf cap 9
    ("fighter", 0, {2: 10}),           # silvanesti cap 10
])
def test_creation_levels_follow_xp_and_racial_caps(rules, cls, race, levels):
    pc = rules.create_record("TESTER", race, (CREATE_CLASSES[cls],), dice_stream(b"\x05"))
    expected = [0] * 7
    for slot, level in levels.items():
        expected[slot] = level
    assert list(pc[0xA5:0xAC]) == expected
    assert struct.unpack_from("<I", pc, 0x44)[0] == CREATION_XP
    assert struct.unpack_from("<H", pc, 0x5A)[0] == CREATE_CLASSES[cls]
    assert pc[0x198] == pc[0x89] > 0
    # Importer prerequisites (CCPARTY dqk_qsv_candidate) hold for a model record.
    assert 30 <= pc[0x87] <= 59 and 1 <= pc[0x89] <= 250
    assert pc[0xB5] == 1 and pc[0xB7] == 2


def test_creation_rejects_disallowed_race_class_and_bad_input(rules):
    with pytest.raises(ValueError, match="race cannot advance"):
        rules.create_record("TESTER", 5, (1,), dice_stream(b"\x00"))   # kender knight
    with pytest.raises(ValueError, match="name"):
        rules.create_record("", 6, (2,), dice_stream(b"\x00"))
    with pytest.raises(ValueError, match="creatable"):
        rules.create_record("TESTER", 6, (3,), dice_stream(b"\x00"))   # paladin
    with pytest.raises(ValueError, match="empty"):
        dice_stream(b"")


def test_dice_and_hp_tables_are_read_from_the_executable(image):
    base = DqkCharacterRules.from_executable(image)
    ref = base.create_record("TESTER", 6, (2,), dice_stream(bytes(range(1, 60, 4))))
    mutant = bytearray(image)
    mutant[DGROUP_FILE + 0x6418 + 2] = 4          # Fighter d10 -> d4
    changed = DqkCharacterRules.from_executable(mutant).create_record(
        "TESTER", 6, (2,), dice_stream(bytes(range(1, 60, 4))))
    assert changed[0x89] != ref[0x89]
    mutant = bytearray(image)
    mutant[DGROUP_FILE + 0x640A + 2] = 12          # Fighter rolls to level 11
    again = DqkCharacterRules.from_executable(mutant).create_record(
        "TESTER", 6, (2,), dice_stream(bytes(range(1, 60, 4))))
    assert again[0x89] != ref[0x89]


def test_cli_models_a_created_character(image, tmp_path):
    out = tmp_path / "model.qch"
    result = subprocess.run([sys.executable, str(ROOT / "tools/dqk_character_rules.py"),
                             "--create", "luna", "--class", "fighter", "--race", "6",
                             "--con", "15", "--dice", "0509", "--out", str(out)],
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    import json
    summary = json.loads(result.stdout)
    assert summary["levels"][2] == 12 and summary["xp"] == CREATION_XP
    assert out.read_bytes().hex() == summary["record_hex"]
    assert out.read_bytes()[0x68:0x6C] == b"LUNA"


def test_native_include_tables_equal_the_executable(rules):
    from tools.dqk_character_rules import asm_tables
    include = (ROOT / "native/src/dqkcreate.inc").read_text()
    for line in asm_tables(rules).splitlines():
        assert line in include, line[:60]


def test_native_levelling_shortcut_is_sound(rules):
    # dqkcreate.inc never looks past level 17: every row's level-17 threshold
    # already exceeds the creation XP, and the increment is positive.
    for row in rules.thresholds:
        assert row[17] > CREATION_XP
    assert all(v > 0 for v in rules.increments[:11])
    for slot in CREATE_CLASSES.values():
        pc = bytearray(RECORD_FIELD_SPAN)
        pc[0x19A], pc[0x19D] = 1, 1
        assert rules.threshold(bytes(pc), slot, 18) > CREATION_XP


def test_native_dice_mutation_is_visible_in_the_model(image):
    # Mirror of the PowerShell mutation control on the model side.
    rules = DqkCharacterRules.from_executable(image)
    ref = rules.create_record("LUNA", 6, (2,), dice_stream(bytes(range(40))), con=15)
    mutant = bytearray(image)
    mutant[DGROUP_FILE + 0x6411 + 2] = 3          # fighter first-level dice 1 -> 3
    other = DqkCharacterRules.from_executable(mutant).create_record(
        "LUNA", 6, (2,), dice_stream(bytes(range(40))), con=15)
    assert other != ref
