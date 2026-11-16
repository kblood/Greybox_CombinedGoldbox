"""Whole-record differential checks for composed, stable-node item removal."""
import itertools
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from tools.cok_item_removal import destroy, RemovalError
from tools.cok_native_removal import destroy as native_destroy
from tools.cok_item_removal_oracle import Machine, Member, load, pointer

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if any(not (game/name).exists() for name in ('START.EXE', 'GAME.OVR', 'ITEMS', 'SAVE/CHRDATA1.SAV')):
        pytest.skip('held CoK DOS game unavailable')
    return load(game)


def body():
    return (ROOT/'Champions of Krynn/SAVE/CHRDATA1.SAV').read_bytes()


def item(type_, kind=0, *, ready=0, cursed=0, marker=0, ident=23):
    record = bytearray(63)
    record[0:5] = b'PROBE'
    record[46], record[49], record[52], record[54] = type_, marker, ready, cursed
    record[55:59] = struct.pack('<HH', 17, 2)
    record[61], record[62] = ident, 128+kind
    return bytes(record)


def effect(kind=23, applied=1, flags=0):
    return struct.pack('<BHBBI', kind, 17, flags, applied, 0)


def materialize(result, addresses, link):
    records = []
    for n, (index, raw) in enumerate(result):
        record = bytearray(raw)
        record[link:link+4] = pointer(addresses[result[n+1][0]] if n+1 < len(result) else 0)
        records.append((addresses[index], bytes(record)))
    return tuple(records)


def compare(retail, records, effects, target=39):
    # Second owner has the same types but no effects, and is initially selected.
    # This checks owner-local callback search and restoration of selection.
    machine = Machine(retail, (Member(body(), records, effects),
                               Member(body(), (item(target), item(1)), ())), selected=1)
    before = machine.snapshot()
    expected = []
    frees = []
    for owner in range(2):
        inputs = (before.bodies[owner], tuple(r for _, r in before.items[owner]),
                  tuple(r for _, r in before.effects[owner]))
        result = destroy(*inputs, retail[2], target)
        assert native_destroy(*inputs, retail[2], target) == result
        assert inputs == (before.bodies[owner], tuple(r for _, r in before.items[owner]),
                          tuple(r for _, r in before.effects[owner]))
        items = materialize(result.items, machine.item_addresses[owner], 42)
        effects_out = materialize(result.effects, machine.effect_addresses[owner], 5)
        expected_body = bytearray(result.body)
        expected_body[323:327] = pointer(items[0][0] if items else 0)
        expected_body[227:231] = pointer(effects_out[0][0] if effects_out else 0)
        for slot, index in enumerate(result.slots):
            expected_body[327+4*slot:331+4*slot] = pointer(machine.item_addresses[owner][index] if index is not None else 0)
        expected.append((bytes(expected_body), items, effects_out))
        for kind, index in result.freed:
            address = (machine.item_addresses if kind == 'item' else machine.effect_addresses)[owner][index]
            frees.append((63 if kind == 'item' else 9, address & 15, address >> 4))
    after = machine.destroy(target)
    assert list(zip(after.bodies, after.items, after.effects)) == expected
    assert after.selected == before.selected and after.comparisons == before.comparisons
    assert machine.freed == frees


@pytest.mark.parametrize('order', list(itertools.permutations(range(4))))
@pytest.mark.parametrize('kind,applied,cursed', list(itertools.product((0, 2, 9), (0, 1), (0, 1))))
def test_nested_removal_order_and_duplicate_effects(retail, order, kind, applied, cursed):
    records = (item(39, kind, ready=1, cursed=cursed), item(6, marker=121, ready=1),
               item(39), item(1))
    compare(retail, tuple(records[i] for i in order),
            (effect(1, 0), effect(applied=applied), effect(), effect(2, 0)))


@pytest.mark.parametrize('order', list(itertools.permutations(range(4))))
def test_missing_effect_does_not_delete_conjured_weapon(retail, order):
    records = (item(39, 9, ready=1), item(6, marker=121, ready=1), item(39), item(1))
    compare(retail, tuple(records[i] for i in order), ())


@pytest.mark.parametrize('order', list(itertools.permutations(range(5))))
@pytest.mark.parametrize('first_applied', (0, 1))
def test_repeated_callbacks_search_live_items_and_first_effect(retail, order, first_applied):
    records = (item(39, 9, ready=1), item(39, 2, ready=1),
               item(6, marker=121, ready=1), item(6, marker=121), item(1))
    compare(retail, tuple(records[i] for i in order), (effect(applied=first_applied), effect()))


@pytest.mark.parametrize('kind,applied,duplicate,position',
                         list(itertools.product((0, 9), (0, 1), (0, 1), (0, 1, 2))))
def test_self_deletion_reaches_missing_item_error_without_double_free(retail, kind, applied, duplicate, position):
    records = [item(1), item(6)]
    records.insert(position, item(6, kind, ready=1, marker=121))
    effects = (effect(applied=applied),)*(1+duplicate)
    if not applied:
        compare(retail, tuple(records), effects, 6)
        return
    with pytest.raises(RemovalError, match='missing-item'):
        destroy(body(), tuple(records), effects, retail[2], 6)
    with pytest.raises(RemovalError, match='native staged removal rejected'):
        native_destroy(body(), tuple(records), effects, retail[2], 6)
    machine = Machine(retail, (Member(body(), tuple(records), effects),))
    with pytest.raises(AssertionError, match='interrupt 16'):
        machine.destroy(6)
    assert machine.location(0x37CDD) in machine.trace
    assert machine.location(0x37C4B) not in machine.trace
    address = machine.item_addresses[0][position]
    assert machine.freed.count((63, address & 15, address >> 4)) == 1


@pytest.mark.parametrize('kind,item_kind,applied,cursed',
                         list(itertools.product((0x0C, 0x0E, 0x26), (0, 2), (0, 1), (0, 1))))
def test_ability_effects_compose_with_equipment(retail, kind, item_kind, applied, cursed):
    compare(retail, (item(39, item_kind, ready=1, cursed=cursed, ident=kind), item(59, 5, ready=1, ident=6)),
            (effect(1, 0), effect(kind, applied, 101), effect(kind, 1, 125)))


@pytest.mark.parametrize('kind', range(16))
def test_unready_dispatch_with_no_effects(retail, kind):
    compare(retail, (item(39, kind, ready=1), item(59, 3, ready=1)), ())


def test_unmodeled_applied_effect_rejected_before_output(retail):
    records = (item(39, ready=1, ident=35),)
    with pytest.raises(RemovalError, match='unmodeled applied effect 23'):
        destroy(body(), records, (effect(35),), retail[2], 39)
    with pytest.raises(RemovalError, match='native staged removal rejected'):
        native_destroy(body(), records, (effect(35),), retail[2], 39)
