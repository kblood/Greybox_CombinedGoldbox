"""Secret's own instructions are the oracle, not a neighboring title's layout."""
from pathlib import Path
import struct

import pytest
pytest.importorskip('unicorn')

from tools.secret_melee_oracle import DEFAULT_ROOT, HASHES, Machine, load, validate_source
from tools.secret_melee_stats import (
    SecretSource, attacks_for_parity, canonical_record, damage_draws,
    normal_melee_stats, raw_aux_records,
)

AMIGA = Path('D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data')


@pytest.fixture(scope='module')
def retail():
    if not all((DEFAULT_ROOT / name).is_file() for name in HASHES):
        pytest.skip('never-vendored Secret DOS source absent')
    return load()


@pytest.fixture(scope='module')
def helpers(retail):
    return Machine(retail)


@pytest.mark.parametrize('rate', range(256))
@pytest.mark.parametrize('parity', (0, 1))
def test_every_rate_and_round_parity_matches_original_helper(helpers, rate, parity):
    assert helpers.cadence(rate, parity) == attacks_for_parity(rate, parity)


def test_original_driver_initializes_zero_before_allocating_and_increments_after_turns(retail):
    from capstone import Cs, CS_ARCH_X86, CS_MODE_16
    from capstone.x86 import X86_OP_MEM, X86_OP_IMM
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    decoder.detail = True

    def window(start, stop):
        return {instruction.address: instruction for instruction in
                decoder.disasm(retail.overlay[start:stop], start)}

    def far_target(site):
        owner = next(d for d in retail.descriptors if
                     d['ovr_file_offset'] <= site < d['ovr_file_offset'] + d['code_size'])
        fixup = next(f for f in owner['fixup_entries'] if
                     f['code_offset'] == site - owner['ovr_file_offset'] + 3)
        assert fixup['context'] == 'lcall_segment'
        target = next(d for d in retail.descriptors if d['index'] == fixup['target_descriptor_index'])
        return target['ovr_file_offset'] + fixup['target_proc_offset']

    driver = window(0xb508, 0xb5f4)
    assert driver[0xb520].mnemonic == driver[0xb56f].mnemonic == 'lcall'
    assert far_target(0xb520) == 0x10029
    assert far_target(0xb56f) == 0x14eea
    assert driver[0xb5b5].mnemonic == 'call'  # actor turns, after rate allocation
    assert driver[0xb5ec].mnemonic == 'call'
    assert driver[0xb5ec].operands[0].imm == 0xc34c
    assert driver[0xb5ef].mnemonic == 'jmp' and driver[0xb5ef].operands[0].imm == 0xb547
    initialize = window(0x10029, 0x101ee)[0x10095]
    assert initialize.mnemonic == 'mov'
    assert initialize.operands[0].type == X86_OP_MEM and initialize.operands[0].size == 1
    assert (initialize.operands[0].mem.disp & 0xffff) == 0x8dc7
    assert initialize.operands[0].mem.base == initialize.operands[0].mem.index == 0
    assert initialize.operands[1].type == X86_OP_IMM and initialize.operands[1].imm == 0
    increment = window(0xc34c, 0xc380)[0xc35d]
    assert increment.mnemonic == 'inc' and increment.operands[0].type == X86_OP_MEM
    assert increment.operands[0].size == 1 and (increment.operands[0].mem.disp & 0xffff) == 0x8dc7
    assert increment.operands[0].mem.base == increment.operands[0].mem.index == 0


@pytest.mark.parametrize('count', (0, 1, 2, 3, 16, 255))
@pytest.mark.parametrize('sides', (0, 1, 4, 8, 20, 255))
@pytest.mark.parametrize('seed', (0, 1, 0x12345678, 0xffffffff))
def test_actual_pascal_dice_and_state_transition(helpers, seed, count, sides):
    assert helpers.dice(seed, count, sides) == damage_draws(seed, count, sides)


@pytest.mark.parametrize('kind', (1, 2))
@pytest.mark.parametrize('bonus', (0, 1, 127, -128, -1))
def test_actual_damage_prefix_indexes_the_active_kind_and_wraps_bytes(helpers, kind, bonus):
    first, second = (3, 4, bonus), (1, 8, bonus)
    count, sides, add = first if kind == 1 else second
    assert helpers.damage_prefix(0x12345678, kind, first, second) == damage_draws(0x12345678, count, sides, add)


def owned_lists(retail, identifier):
    items = raw_aux_records(retail.inventories.get(identifier, b''), 63, SecretSource.DOS)
    effects = raw_aux_records(retail.effects.get(identifier, b''), 9, SecretSource.DOS)
    return items, effects


def compare_original(retail, raw, items, effects, *, poison=False):
    actual = Machine(retail, poison=poison).recalculate(raw, items, effects)
    model = normal_melee_stats(raw, items, retail.definitions, SecretSource.DOS)
    assert (model.thac0, model.armor_class, model.current_hp, model.maximum_hp) == (
        60 - actual[426], 60 - actual[427], actual[437], actual[112])
    assert (model.primary.count, model.secondary.count, model.primary.sides, model.secondary.sides,
            model.primary.bonus & 255, model.secondary.bonus & 255) == tuple(actual[431:437])
    for slot, expected_index in enumerate(model.equipment):
        offset, segment = struct.unpack_from('<HH', actual, 357 + 4 * slot)
        address = segment * 16 + offset
        assert address == (0 if expected_index is None else 0x41000 + 67 * expected_index)
    return actual, model


def test_all_seventy_original_recalculations_and_poison_controls(retail):
    assert len(retail.monsters) == 70
    for identifier, raw in retail.monsters.items():
        items, effects = owned_lists(retail, identifier)
        baseline, _ = compare_original(retail, raw, items, effects)
        poisoned, _ = compare_original(retail, raw, items, effects, poison=True)
        assert poisoned == baseline


def test_fire_knife_uses_effective_armor_and_secondary_damage(retail):
    raw = retail.monsters[72]
    items, effects = owned_lists(retail, 72)
    _, model = compare_original(retail, raw, items, effects)
    assert (model.current_hp, model.maximum_hp, model.thac0, model.armor_class) == (52, 52, 14, 6)
    assert (model.primary.rate, model.primary.count, model.primary.sides, model.primary.bonus) == (0, 0, 0, 0)
    assert (model.secondary.rate, model.secondary.count, model.secondary.sides, model.secondary.bonus) == (2, 1, 8, 0)
    assert model.equipment[0] is None and model.equipment[2] == 0
    _, deprived = compare_original(retail, raw, (), effects)
    assert deprived.armor_class == 10 and deprived.secondary == model.secondary


@pytest.mark.parametrize('race', range(8))
@pytest.mark.parametrize('kind', (1, 8, 18, 19, 22, 26, 31, 67))
def test_equipment_kind_and_race_controls_use_secret_own_bonus_rule(retail, race, kind):
    raw = bytearray(retail.monsters[72]); raw[107] = race
    item = bytearray(retail.inventories[72]); item[46] = kind
    compare_original(retail, bytes(raw), (bytes(item),), ())


@pytest.mark.parametrize('offset,value', [(106, 47), (112, 55), (437, 48), (294, 6), (292, 2), (296, 255)])
def test_independent_source_field_mutations_reach_original_and_model(retail, offset, value):
    raw = bytearray(retail.monsters[72]); raw[offset] = value
    items, effects = owned_lists(retail, 72)
    _, model = compare_original(retail, bytes(raw), items, effects)
    baseline = normal_melee_stats(retail.monsters[72], items, retail.definitions, SecretSource.DOS)
    assert model != baseline


def glib_raw_members(path):
    from tools.glib_decode import load_container, read_header
    data = load_container(path.read_bytes()); header = read_header(data); pointers = header['ptrs']
    table = data[pointers[0]:pointers[1]]; count = int.from_bytes(table[:2], 'big')
    assert len(table) == 2 + 4 * count
    result = {}
    for index in range(count):
        identifier, member = struct.unpack_from('>HH', table, 2 + 4 * index)
        result[identifier] = data[pointers[member]:pointers[member + 1]]
    return result


def test_amiga_auxiliary_payloads_match_every_owned_dos_record(retail):
    if not (AMIGA / 'DISK1/ITEMS.DAT').is_file():
        pytest.skip('never-vendored Secret Amiga source absent')
    assert (AMIGA / 'DISK1/ITEMS.DAT').read_bytes() == retail.definitions
    for name, width, expected in (('MONITM.GLB', 63, retail.inventories), ('MONSPC.GLB', 9, retail.effects)):
        actual = glib_raw_members(AMIGA / 'DISK2' / name)
        assert set(actual) == set(expected)
        assert len(actual) == (29 if width == 63 else 50)
        for identifier, payload in actual.items():
            assert b''.join(raw_aux_records(payload, width, SecretSource.AMIGA)) == expected[identifier]


def test_all_seventy_amiga_monsters_keep_the_same_normal_coefficients(retail):
    from tools.moncha_rle import moncha_rle
    path = AMIGA / 'DISK2/MONCHA.GLB'
    if not path.is_file():
        pytest.skip('never-vendored Secret Amiga source absent')
    members = glib_raw_members(path)
    assert set(members) == set(retail.monsters) and len(members) == 70
    for identifier, encoded in members.items():
        raw = moncha_rle(encoded)
        assert raw == retail.monsters[identifier] + b'\0'
        items, _ = owned_lists(retail, identifier)
        assert normal_melee_stats(raw, items, retail.definitions, SecretSource.AMIGA) == normal_melee_stats(
            retail.monsters[identifier], items, retail.definitions, SecretSource.DOS)


@pytest.mark.parametrize('name', tuple(HASHES))
def test_source_identity_guards_reject_changed_retail_instructions_or_data(retail, name):
    data = (DEFAULT_ROOT / name).read_bytes()
    validate_source(name, data)
    changed = data[:-1] + bytes([data[-1] ^ 1])
    with pytest.raises(ValueError, match='source changed'):
        validate_source(name, changed)


@pytest.mark.parametrize('payload,width', [(b'X', 9), (bytes(9) + b'X', 9), (bytes(127), 63), (bytes(65), 63)])
def test_malformed_amiga_padding_or_stride_is_rejected(payload, width):
    with pytest.raises(ValueError):
        raw_aux_records(payload, width, SecretSource.AMIGA)


def test_explicit_source_and_record_padding_are_required(retail):
    raw = retail.monsters[72]
    assert canonical_record(raw + b'\0', SecretSource.AMIGA) == raw
    with pytest.raises(ValueError):
        canonical_record(raw, SecretSource.AMIGA)
    with pytest.raises(ValueError):
        canonical_record(raw + b'X', SecretSource.AMIGA)
    with pytest.raises(ValueError):
        canonical_record(raw, 'secret-dos')
