"""Portable CoK E6:43 model against complete original recalculation results."""
from pathlib import Path
import random
import struct

import pytest

pytest.importorskip('unicorn')
from unicorn.x86_const import UC_X86_REG_AX
from tools.cok_item_removal_oracle import Machine, Member, BODY_BASE, load, pointer, item_definitions
from tools.cok_equipment import (
    recalculate, dex_armor, dex_ranged, strength_index, strength_hit,
    strength_damage, weight_allowance,
)
from tools.cok_native_stats import recalculate as native_recalculate

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS game unavailable')
    return load(game)


def held_body(owner=0):
    return (ROOT/f'Champions of Krynn/SAVE/CHRDATA{owner+1}.SAV').read_bytes()


def record(kind, *, ready=1, bonus=0, saving=0, weight=7, quantity=1):
    raw = bytearray(63)
    raw[46], raw[50], raw[51], raw[52] = kind, bonus & 255, saving & 255, ready
    struct.pack_into('<H', raw, 55, weight)
    raw[57] = quantity
    return bytes(raw)


def compare(retail, body, items):
    machine = Machine(retail, (Member(body, tuple(items)),))
    before = machine.snapshot()
    globals_before = bytes(machine.uc.mem_read(0x50000, 0x10000))
    expected = recalculate(before.bodies[0], tuple(items), machine.item_table)
    assert native_recalculate(before.bodies[0], tuple(items), machine.item_table) == expected
    materialized = bytearray(expected.body)
    for slot, index in enumerate(expected.equipment.slots):
        materialized[327+4*slot:331+4*slot] = pointer(machine.item_addresses[0][index] if index is not None else 0)
    machine.execute(0x372C6, pointer(BODY_BASE))
    after = machine.snapshot()
    assert after.bodies[0] == materialized, [(i, a, b) for i, (a, b) in enumerate(zip(after.bodies[0], materialized)) if a != b]
    assert after.items == before.items
    assert after.effects == before.effects
    assert after.selected == before.selected and after.comparisons == before.comparisons
    expected_globals = bytearray(globals_before)
    struct.pack_into('<H', expected_globals, 0x483C, expected.equipment.equipped_weight)
    assert bytes(machine.uc.mem_read(0x50000, 0x10000)) == expected_globals


@pytest.mark.parametrize('owner', range(6))
@pytest.mark.parametrize('kinds', [[], [0], [1], [12, 30], [1, 1, 1], list(range(128)), [1]*1101])
@pytest.mark.parametrize('ready', [0, 1])
def test_whole_recalculation_on_held_bodies(retail, owner, kinds, ready):
    compare(retail, held_body(owner), tuple(record(k, ready=ready) for k in kinds))


@pytest.mark.parametrize('seed', range(100))
def test_whole_recalculation_signed_and_wrapping_fields(retail, seed):
    rng = random.Random(seed)
    body = bytearray(held_body(seed % 6))
    body[17] = rng.randrange(26)
    body[28] = rng.randrange(101 if body[17] == 18 else 256)
    for offset in (23, 89, 90, 213, 215, *range(249, 261), *range(269, 277)):
        body[offset] = rng.randrange(256)
    for offset in range(237, 249, 2):
        struct.pack_into('<H', body, offset, rng.randrange(65536))
    items = [record(rng.randrange(128), ready=rng.randrange(3), bonus=rng.randrange(256),
                    saving=rng.randrange(256), weight=rng.randrange(65536), quantity=rng.randrange(256))
             for _ in range(rng.randrange(20))]
    compare(retail, bytes(body), items)


@pytest.mark.parametrize('dexterity', range(256))
def test_dexterity_helpers(retail, dexterity):
    body = bytearray(held_body()); body[23] = dexterity
    assert native_recalculate(body, (), retail[2]) == recalculate(body, (), retail[2])
    machine = Machine(retail, (Member(bytes(body)),))
    before = machine.snapshot()
    for target, value in [(0x3781C, dex_armor(dexterity)), (0x3789E, dex_ranged(dexterity))]:
        machine.execute(target, pointer(BODY_BASE))
        assert machine.uc.reg_read(UC_X86_REG_AX) & 255 == value & 255
        assert machine.snapshot() == before


@pytest.mark.parametrize('strength', range(26))
@pytest.mark.parametrize('exceptional', [0, 1, 50, 51, 75, 76, 90, 91, 99, 100])
def test_strength_helpers(retail, strength, exceptional):
    body = bytearray(held_body()); body[17], body[28] = strength, exceptional
    assert native_recalculate(body, (), retail[2]) == recalculate(body, (), retail[2])
    machine = Machine(retail, (Member(bytes(body)),))
    index = strength_index(strength, exceptional)
    for target, value, mask in [(0x37920, index, 255), (0x37AE1, weight_allowance(index), 65535)]:
        before = machine.snapshot()
        machine.execute(target, pointer(BODY_BASE))
        assert machine.uc.reg_read(UC_X86_REG_AX) & mask == value & mask
        assert machine.snapshot() == before
    for enabled in (0, 1):
        machine.uc.mem_write(BODY_BASE+276, bytes([enabled]))
        before = machine.snapshot()
        for target, value in [(0x379B8, strength_hit(index)), (0x37A5B, strength_damage(index))]:
            machine.execute(target, pointer(BODY_BASE))
            assert machine.uc.reg_read(UC_X86_REG_AX) & 255 == (value & 255 if enabled else 0)
            assert machine.snapshot() == before


@pytest.mark.parametrize('strength,exceptional', [(18, 101), (18, 255), (26, 0), (255, 0)])
def test_uninitialized_original_strength_is_rejected_without_mutation(retail, strength, exceptional):
    body = bytearray(held_body()); body[17], body[28] = strength, exceptional
    original = bytes(body)
    outputs = []
    for poison in (0x33, 0x77):
        machine = Machine(retail, (Member(original),))
        machine.uc.mem_write(0x6EFF0, bytes([poison])*16)
        machine.execute(0x37920, pointer(BODY_BASE))
        outputs.append(machine.uc.reg_read(UC_X86_REG_AX) & 255)
    assert outputs == [0x33, 0x77]
    with pytest.raises(ValueError, match='uninitialized'):
        recalculate(body, (), bytes(2048))
    with pytest.raises(ValueError, match='rejected'):
        native_recalculate(body, (), retail[2])
    assert bytes(body) == original


def test_original_item_loader_contract_and_missing_table_control(retail):
    _, overlay, table = retail
    assert overlay[0x1089A:0x108AB].hex() == 'bf2a461e57b8020031d252509a1c15460a'
    assert overlay[0x108AB:0x108C3].hex() == 'bf2a461e57bf86581e57b8100850bf26611e579ab414460a'
    assert len(table) == 128*16 and table[18*16+14] == 4
    body = bytearray(held_body())
    body[17], body[28], body[90], body[276] = 18, 100, 2, 1
    member = Member(bytes(body), (record(18),))
    actual, old = Machine(retail, (member,)), Machine(retail, (member,))
    old.uc.mem_write(0x55886, bytes(len(table)))
    actual.execute(0x372C6, pointer(BODY_BASE))
    old.execute(0x372C6, pointer(BODY_BASE))
    real_body, zero_body = actual.snapshot().bodies[0], old.snapshot().bodies[0]
    assert real_body[396] == (body[89]+3)&255
    assert real_body[405] == 6
    assert zero_body[396] == body[89] and zero_body[405] == 0
    assert actual.snapshot() != old.snapshot()


@pytest.mark.parametrize('offset', [0, 18*16+2+14])
def test_item_definition_change_is_rejected(offset):
    raw = bytearray((ROOT/'Champions of Krynn/ITEMS').read_bytes())
    raw[offset] ^= 1
    with pytest.raises(ValueError, match='definitions changed'):
        item_definitions(raw)


@pytest.mark.parametrize('kind', [128, 129, 255])
def test_missing_item_definition_is_rejected_before_recalculation(retail, kind):
    body = bytearray(held_body())
    before = bytes(body)
    with pytest.raises(ValueError, match='no held CoK definition'):
        recalculate(body, (record(kind),), retail[2])
    with pytest.raises(ValueError, match='rejected'):
        native_recalculate(body, (record(kind),), retail[2])
    assert bytes(body) == before


@pytest.mark.parametrize('weight', [150, 151, 399, 400, 65535])
@pytest.mark.parametrize('bonus', [-128, -1, 0, 1, 127])
def test_armor_weight_and_magic_movement_boundaries(retail, weight, bonus):
    body = bytearray(held_body()); body[237:249] = bytes(12)
    compare(retail, bytes(body), (record(31, weight=weight, bonus=bonus),))


@pytest.mark.parametrize('weight', [0, 512, 513, 768, 769, 1024, 1025, 32767, 32768, 65535])
def test_encumbrance_signed_word_boundaries(retail, weight):
    body = bytearray(held_body()); body[17] = 10; body[237:249] = bytes(12)
    compare(retail, bytes(body), (record(0, ready=0, weight=weight),))


@pytest.mark.parametrize('base', [0, 25, 127, 128, 255])
@pytest.mark.parametrize('bonuses', [(1, 5), (0, 127), (-128, 127), (127, -1)])
@pytest.mark.parametrize('reverse', [False, True])
def test_armor_ring_shield_and_signed_bonus_order(retail, base, bonuses, reverse):
    body = bytearray(held_body()); body[275] = base
    armor, ring = bonuses
    records = [record(31, bonus=armor), record(59, bonus=ring), record(37, bonus=armor),
               record(58, bonus=127, saving=-128), record(59, bonus=127, saving=127)]
    compare(retail, bytes(body), records[::-1] if reverse else records)


@pytest.mark.parametrize('race', [0, 6, 7, 128, 255])
@pytest.mark.parametrize('threshold', [0, 1, 127, 128, 255])
@pytest.mark.parametrize('first_level', [0, 1, 128])
def test_race_level_fallback_and_signed_comparisons(retail, race, threshold, first_level):
    body = bytearray(held_body())
    body[90], body[215] = race, threshold
    body[249:260] = bytes(11)
    body[249], body[259] = first_level, 1
    compare(retail, bytes(body), ())


@pytest.mark.parametrize('kind', [0, 1, 5, 12, 18, 19, 22, 26, 27, 67, 127])
@pytest.mark.parametrize('race', [0, 1, 2, 5])
@pytest.mark.parametrize('bonus', [-128, -1, 0, 1, 127])
def test_weapon_racial_and_auxiliary_bonuses(retail, kind, race, bonus):
    body = bytearray(held_body())
    body[90], body[17], body[28], body[23], body[276] = race, 18, 100, 25, 1
    compare(retail, bytes(body), (record(kind, bonus=bonus), record(12, bonus=127), record(30, bonus=-128)))
