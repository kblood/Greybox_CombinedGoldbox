"""Original DB:8E ability writes versus the portable removal prerequisites."""
from pathlib import Path
import itertools
import struct

import pytest

pytest.importorskip('unicorn')
from tools.cok_item_removal_oracle import Machine, Member, BODY_BASE, load, pointer
from tools.cok_item_abilities import strength, charisma
from tools.cok_equipment import recalculate
from tools.cok_native_abilities import update as native_update

ROOT = Path(__file__).resolve().parents[1]
FLAGS = [0, 1, 2, 100, 101, 102, 127, 128, 129, 228, 229, 230, 255]
ITEM_SEQUENCES = [[], [(3, 0)]]+[[ (5, i) ] for i in range(7)]+[
    [(5, 6), (3, 0)], [(3, 0), (5, 6)], [(8, 0)], [(13, 0)],
    [(13, 0), (5, 6)], [(5, 6), (13, 0)], [(8, 1)], [(5, 255)]]


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists() or not (game/'ITEMS').exists():
        pytest.skip('held CoK DOS game unavailable')
    return load(game)


def held_body():
    return bytearray((ROOT/'Champions of Krynn/SAVE/CHRDATA1.SAV').read_bytes())


def item(kind, ident=0, ready=1):
    raw = bytearray(63)
    raw[46], raw[52], raw[61], raw[62] = 59, ready, ident, 128+kind
    return bytes(raw)


def effect(kind, flags, applied=1):
    return struct.pack('<BHBBI', kind, 17, flags, applied, 0)


def compare(retail, body, items, effects, ability):
    machine = Machine(retail, (Member(bytes(body), tuple(items), tuple(effects)),))
    before = machine.snapshot()
    globals_before = bytes(machine.uc.mem_read(0x50000, 65536))
    model = strength if ability == 0 else charisma
    expected = model(before.bodies[0], tuple(items), tuple(effects))
    assert native_update(before.bodies[0], tuple(items), tuple(effects), ability) == expected
    machine.execute(0x356EE, struct.pack('<H', ability)+pointer(BODY_BASE))
    after = machine.snapshot()
    assert after.bodies[0] == expected, [(i, a, b) for i, (a, b) in enumerate(zip(after.bodies[0], expected)) if a != b]
    assert after.items == before.items and after.effects == before.effects
    assert after.selected == before.selected and after.comparisons == before.comparisons
    assert bytes(machine.uc.mem_read(0x50000, 65536)) == globals_before


@pytest.mark.parametrize('sequence', ITEM_SEQUENCES)
def test_strength_items_and_retained_candidate(retail, sequence):
    for base, exceptional in itertools.product((3, 10, 17, 18, 19, 25), (0, 50, 100)):
        body = held_body()
        body[16], body[17], body[29], body[28] = base, 18, exceptional, 100
        compare(retail, body, [item(k, i) for k, i in sequence], (), 0)


@pytest.mark.parametrize('kind', [0x26, 0x71, 0x0C])
@pytest.mark.parametrize('flags', FLAGS)
def test_strength_effect_decode_first_match_and_applied_independence(retail, kind, flags):
    for base, active_levels, applied in itertools.product((3, 18, 25), (False, True), (0, 1)):
        body = held_body(); body[16], body[17], body[29], body[28] = base, 18, 0, 250
        for i in (251, 259, 256, 264, 253, 261): body[i] = 0
        body[251] = int(active_levels)
        effects = [effect(1, 0), effect(kind, flags, applied), effect(kind, flags ^ 127), effect(2, 0)]
        compare(retail, body, (), effects, 0)


@pytest.mark.parametrize('order', list(itertools.permutations([0x26, 0x71, 0x0C])))
@pytest.mark.parametrize('forced', [False, True])
def test_strength_effect_kind_order_and_forced_override(retail, order, forced):
    body = held_body(); body[16], body[17], body[29], body[28] = 10, 18, 0, 0
    flags = {0x26: 3, 0x71: 125, 0x0C: 101}
    items = [item(5, 6), item(3)] + ([item(13)] if forced else [])
    compare(retail, body, items, [effect(kind, flags[kind]) for kind in order], 0)


@pytest.mark.parametrize('flags', FLAGS)
@pytest.mark.parametrize('sequence', [[], [(6, 0)], [(6, 0), (6, 0)], [(8, 5)],
    [(8, 5), (8, 5)], [(8, 5), (6, 0)], [(8, 0)], [(13, 0)]])
def test_charisma_item_and_effect_byte_wrapping(retail, flags, sequence):
    for base, applied in itertools.product((0, 17, 18, 255), (0, 1)):
        body = held_body(); body[26], body[27] = base, 99
        compare(retail, body, [item(k, i) for k, i in sequence],
                [effect(0x0E, flags, applied), effect(0x0E, flags ^ 255)], 5)


@pytest.mark.parametrize('ability', [0, 5])
def test_unready_items_are_ignored(retail, ability):
    compare(retail, held_body(), [item(3, ready=0), item(6, ready=0), item(8, 5, ready=0)], (), ability)


@pytest.mark.parametrize('body,items,effects', [(bytes(408), (), ()), (bytes(409), (bytes(62),), ()),
                                              (bytes(409), (), (bytes(8),))])
@pytest.mark.parametrize('model', [strength, charisma])
def test_partial_records_rejected(body, items, effects, model):
    with pytest.raises(ValueError, match='complete CoK'):
        model(body, items, effects)


@pytest.mark.parametrize('kind', [0x0C, 0x0E, 0x26])
@pytest.mark.parametrize('item_kind', [0, 2])
@pytest.mark.parametrize('applied', [0, 1])
@pytest.mark.parametrize('cursed', [0, 1])
def test_destroy_item_composes_effect_removal_abilities_and_equipment(retail, kind, item_kind, applied, cursed):
    removed = bytearray(item(item_kind, kind))
    removed[46], removed[54] = 39, cursed
    kept = item(5, 6)
    effects = (effect(1, 0), effect(kind, 101, applied), effect(kind, 125))
    machine = Machine(retail, (Member(bytes(held_body()), (bytes(removed), kept), effects),))
    before = machine.snapshot()
    surviving_effects = list(before.effects[0])
    if not cursed:
        del surviving_effects[1]
    expected_effects = []
    for i, (addr, raw) in enumerate(surviving_effects):
        raw = bytearray(raw)
        raw[5:9] = pointer(surviving_effects[i+1][0] if i+1<len(surviving_effects) else 0)
        expected_effects.append((addr, bytes(raw)))
    remaining_items = before.items[0][1:]
    expected_body = bytearray(before.bodies[0])
    expected_body[323:327] = pointer(remaining_items[0][0])
    if not cursed:
        model = charisma if kind == 0x0E else strength
        expected_body = model(expected_body, tuple(raw for _, raw in remaining_items),
                              tuple(raw for _, raw in expected_effects))
    result = recalculate(expected_body, tuple(raw for _, raw in remaining_items), machine.item_table)
    expected_body = bytearray(result.body)
    for slot, index in enumerate(result.equipment.slots):
        expected_body[327+4*slot:331+4*slot] = pointer(remaining_items[index][0] if index is not None else 0)
    after = machine.destroy(39)
    assert after.bodies[0] == expected_body
    assert after.items[0] == remaining_items
    assert after.effects[0] == tuple(expected_effects)
    assert after.selected == before.selected and after.comparisons == before.comparisons
    assert [size for size, _, _ in machine.freed] == ([63] if cursed else [9, 63])
