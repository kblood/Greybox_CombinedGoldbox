"""Original DESTROY_ITEMS traversal, complete records and active effect removal."""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from tools.cok_item_removal_oracle import (
    Machine, Member, BODY_BASE, load, pointer, validate, address,
)
from tools.cok_equipment import reconstruct, recalculate

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS game unavailable')
    return load(game)


def body(owner):
    return (ROOT/f'Champions of Krynn/SAVE/CHRDATA{owner+1}.SAV').read_bytes()


def item(kind, *, ready=0, cursed=0, effect_kind=0, effect_id=0, weight=7, quantity=3):
    raw = bytearray(63)
    raw[:5] = b'\x04ITEM'
    raw[46] = kind
    raw[47] = 101
    raw[52] = ready
    raw[54] = cursed
    struct.pack_into('<H', raw, 55, weight)
    raw[57] = quantity
    raw[61:63] = bytes([effect_id, effect_kind])
    return bytes(raw)


def effect(kind, *, applied=0, flags=0, duration=17):
    return struct.pack('<BHBBI', kind, duration, flags, applied, 0)


def host_remove_and_recalculate(machine, target):
    """Independent filter and portable stat model, without original gameplay calls.

    These fixtures have no item-effect callback or cursed side effect.
    """
    initial = machine.snapshot()
    for owner, nodes in enumerate(initial.items):
        survivors = [(addr, raw) for addr, raw in nodes if raw[46] != target]
        machine.uc.mem_write(BODY_BASE+512*owner+323, pointer(survivors[0][0] if survivors else 0))
        for i, (addr, original) in enumerate(survivors):
            raw = bytearray(original)
            raw[42:46] = pointer(survivors[i+1][0] if i+1<len(survivors) else 0)
            machine.uc.mem_write(addr, bytes(raw))
        body = bytes(machine.uc.mem_read(BODY_BASE+512*owner, 409))
        result = recalculate(body, tuple(raw for _, raw in survivors), machine.item_table)
        body = bytearray(result.body)
        for slot, index in enumerate(result.equipment.slots):
            body[327+4*slot:331+4*slot] = pointer(survivors[index][0] if index is not None else 0)
        machine.uc.mem_write(BODY_BASE+512*owner, bytes(body))
    return machine.snapshot()


@pytest.mark.parametrize('inventories,target', [
    ([], 39), ([[]], 39), ([[39]], 39), ([[1]], 39), ([[0]], 0), ([[255]], 255),
    ([[39, 39]], 39), ([[1, 39, 1]], 39), ([[39, 1, 39]], 39),
    ([[1], [39]], 39), ([[39], [1]], 39),
    ([[], [39], [], [1, 39], [], [39]], 39), ([[1]*1100+[39]], 39),
])
@pytest.mark.parametrize('selected', ['none', 'first', 'last'])
@pytest.mark.parametrize('ready', [0, 1])
@pytest.mark.parametrize('variable', [False, True])
def test_original_removal_filters_all_owners_then_recalculates(retail, inventories, target, selected, ready, variable):
    members = tuple(Member(body(i), tuple(item(t, ready=ready) for t in types))
                    for i, types in enumerate(inventories))
    selection = None if selected == 'none' or not members else (0 if selected == 'first' else len(members)-1)
    actual = Machine(retail, members, selected=selection)
    control = Machine(retail, members, selected=selection)
    before = actual.snapshot()
    expected = host_remove_and_recalculate(control, target)
    after = actual.destroy(target, variable=variable)
    assert after.bodies == expected.bodies
    assert after.items == expected.items
    assert after.effects == before.effects == expected.effects
    assert after.selected == before.selected
    assert after.comparisons == before.comparisons
    assert after.operand_pc == (0x8004 if variable else 0x8003)
    removed = [addr for nodes in before.items for addr, raw in nodes if raw[46] == target]
    assert actual.freed == [(63, addr & 15, addr >> 4) for addr in removed]
    assert actual.unequipped == (removed if ready else [])
    assert actual.recalculated == [BODY_BASE+512*i for i in range(len(members))]


@pytest.mark.parametrize('offset', [0x3F0F, 0x372C6, 0x144D2])
def test_original_removal_code_change_rejected(retail, offset):
    image, overlay, _ = retail
    changed = bytearray(overlay)
    changed[offset] ^= 1
    with pytest.raises(ValueError, match='overlay changed'):
        validate(image, changed)


@pytest.mark.parametrize('applied', [0, 1])
@pytest.mark.parametrize('kind', [1, 2, 0x27, 0x2A])
def test_item_callback_removes_only_first_matching_owned_effect(retail, applied, kind):
    effects = (effect(3), effect(kind, applied=applied), effect(kind), effect(4))
    member = Member(body(0), (item(39, ready=1, effect_kind=128, effect_id=kind),), effects)
    machine = Machine(retail, (member,))
    before = machine.snapshot()
    after = machine.destroy(39)
    assert not after.items[0]
    assert [raw[0] for _, raw in after.effects[0]] == [3, kind, 4]
    assert [addr for addr, _ in after.effects[0]] == [addr for i, (addr, _) in enumerate(before.effects[0]) if i != 1]
    for (_, old), (_, new) in zip([row for i, row in enumerate(before.effects[0]) if i != 1], after.effects[0]):
        assert old[:5] == new[:5]
    assert [size for size, _, _ in machine.freed] == [9, 63]
    assert after.selected == before.selected
    if applied and kind == 0x27:
        assert struct.unpack_from('<H', after.bodies[0], 96)[0] == (struct.unpack_from('<H', before.bodies[0], 96)[0]+1)&0xFFFF
    else:
        assert after.bodies[0][96:98] == before.bodies[0][96:98]


@pytest.mark.parametrize('owner', range(6))
@pytest.mark.parametrize('kinds', [[], [1], [12, 30], [1, 1, 1], list(range(128)), [1]*257])
@pytest.mark.parametrize('quantity,weight', [(0, 7), (1, 65535), (255, 32769)])
def test_equipment_reconstruction_matches_original_fields(retail, owner, kinds, quantity, weight):
    records = tuple(item(k, ready=1, quantity=quantity, weight=weight) for k in kinds)
    machine = Machine(retail, (Member(body(owner), records),))
    before = machine.snapshot()
    item_table = machine.item_table
    expected = reconstruct(before.bodies[0], records, item_table)
    machine.execute(0x372C6, pointer(BODY_BASE))
    after = machine.snapshot().bodies[0]
    assert after[322] == expected.count
    assert after[379] == expected.hands
    assert struct.unpack_from('<H', after, 381)[0] == expected.weight
    assert struct.unpack('<H', machine.uc.mem_read(0x5483C, 2))[0] == expected.equipped_weight
    slot_addresses = tuple(address(after[327+4*i:331+4*i]) for i in range(13))
    assert slot_addresses == tuple(machine.item_addresses[0][i] if i is not None else 0 for i in expected.slots)


@pytest.mark.parametrize('count', [0, 1, 2, 3])
@pytest.mark.parametrize('cursed', [0, 1])
@pytest.mark.parametrize('selected', [None, 0, 1])
def test_duplicate_items_remove_owner_effects_once_per_uncursed_item(retail, count, cursed, selected):
    effects = (effect(0x27, applied=1), effect(0x27, applied=1), effect(0x2A))
    records = tuple(item(39, ready=1, cursed=cursed, effect_kind=128, effect_id=0x27) for _ in range(count))
    machine = Machine(retail, (Member(body(0), records, effects), Member(body(1), (), effects)), selected=selected)
    before = machine.snapshot()
    after = machine.destroy(39)
    removed = 0 if cursed else min(count, 2)
    assert [raw[0] for _, raw in after.effects[0]] == [0x27]*(2-removed)+[0x2A]
    assert after.effects[1] == before.effects[1]
    assert not after.items[0]
    assert sum(size == 9 for size, _, _ in machine.freed) == removed
    assert sum(size == 63 for size, _, _ in machine.freed) == count
    assert after.selected == before.selected
    assert after.comparisons == before.comparisons
    old_age = struct.unpack_from('<H', before.bodies[0], 96)[0]
    assert struct.unpack_from('<H', after.bodies[0], 96)[0] == (old_age+removed)&0xFFFF
    assert after.bodies[1][96:98] == before.bodies[1][96:98]
