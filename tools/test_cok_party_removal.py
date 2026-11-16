"""Combined staged outputs against original execution and native kernels."""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from tools import cok_party_removal as party
from tools.cok_inventory import Inventory, encode, decode
from tools.cok_native_removal import destroy as native_destroy
from tools.cok_item_removal_oracle import Machine, Member, load, pointer
from tools.test_cok_item_removal_model import item, effect, materialize

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if any(not (game/name).exists() for name in ('START.EXE', 'GAME.OVR', 'ITEMS', 'SAVE/CHRDATA1.SAV')):
        pytest.skip('held CoK DOS game unavailable')
    return load(game)


def body():
    return (ROOT/'Champions of Krynn/SAVE/CHRDATA1.SAV').read_bytes()


def packets(bodies, items, effects, reverse=False):
    count = len(bodies)
    roster = struct.pack('<4s4HI', b'GBPR', 1, count, 410, 0, 0)
    roster += b''.join(bytes([i+1])+raw for i, raw in enumerate(bodies))
    inventory = encode(Inventory(i+1, True, bool(i % 2), b''.join(records))
                       for i, records in enumerate(items))
    timers = bytearray(2572)
    struct.pack_into('<HH', timers, 0, 1, sum(map(len, effects)))
    timers[4:4+count] = bytes(1+i % 2 for i in range(count))
    # Interleave owners globally while keeping each owner's original list order.
    owners = list(range(count))
    if reverse:
        owners.reverse()
    offset = 12
    for index in range(max(map(len, effects), default=0)):
        for owner in owners:
            if index < len(effects[owner]):
                timers[offset:offset+10] = bytes([owner+1])+effects[owner][index]
                offset += 10
    return roster, inventory, bytes(timers)


@pytest.mark.parametrize('count', range(7))
@pytest.mark.parametrize('selected', (False, True))
@pytest.mark.parametrize('reverse', (False, True))
def test_combined_original_and_native(retail, monkeypatch, count, selected, reverse):
    members = tuple(Member(body(),
                           (item(39, 9, ready=1, cursed=i % 2),
                            item(6, marker=121, ready=1), item(1), item(39)),
                           (effect(23), effect(23, 0), effect(14, 0)))
                    for i in range(count))
    machine = Machine(retail, members, selected=count-1 if count and selected else None)
    before = machine.snapshot()
    inputs = packets(before.bodies, [tuple(r for _, r in row) for row in before.items],
                     [tuple(r for _, r in row) for row in before.effects], reverse)
    result = party.stage(*inputs, retail[2], 39)
    monkeypatch.setattr(party, 'destroy', native_destroy)
    assert party.stage(*inputs, retail[2], 39) == result
    after = machine.destroy(39)
    assert after.selected == before.selected and after.comparisons == before.comparisons
    inventories = decode(result.inventory)
    output_effects = [[] for _ in members]
    live = struct.unpack_from('<H', result.timers, 2)[0]
    owner_order = list(range(1, count+1))
    if reverse:
        owner_order.reverse()
    assert list(result.timers[12:12+live*10:10]) == (
        [owner for owner in owner_order if (owner-1) % 2] + owner_order + owner_order)
    for off in range(12, 12+live*10, 10):
        output_effects[result.timers[off]-1].append(result.timers[off+1:off+10])
    for owner, inv in enumerate(inventories):
        records = tuple(inv.records[i:i+63] for i in range(0, len(inv.records), 63))
        addresses = tuple(addr for addr, _ in after.items[owner])
        assert materialize(tuple(enumerate(records)), addresses, 42) == after.items[owner]
        fx_addresses = tuple(addr for addr, _ in after.effects[owner])
        assert materialize(tuple(enumerate(output_effects[owner])), fx_addresses, 5) == after.effects[owner]
        raw = bytearray(result.roster[17+410*owner:426+410*owner])
        assert raw[227:231] == raw[323:327] == bytes(4)
        raw[227:231] = pointer(fx_addresses[0] if fx_addresses else 0)
        raw[323:327] = pointer(addresses[0] if addresses else 0)
        for slot, index in enumerate(result.slots[owner]):
            raw[327+4*slot:331+4*slot] = pointer(addresses[index] if index is not None else 0)
        assert bytes(raw) == after.bodies[owner]
    expected_frees = []
    for owner, kind, index in result.freed:
        addresses = machine.item_addresses if kind == 'item' else machine.effect_addresses
        address = addresses[owner-1][index]
        expected_frees.append((63 if kind == 'item' else 9, address & 15, address >> 4))
    assert machine.freed == expected_frees
    expected_types = bytearray(32)
    expected_owned = bytearray(258)
    expected_owned[0] = 1
    for owner in range(count):
        for _, raw in after.items[owner]:
            expected_types[raw[46] >> 3] |= 1 << (raw[46] & 7)
        for _, raw in after.effects[owner]:
            if raw[0]:
                expected_owned[2+32*owner+(raw[0] >> 3)] |= 1 << (raw[0] & 7)
    assert result.item_types == bytes(expected_types)
    assert result.owned_effects == bytes(expected_owned)
    assert result.timers[4:12] == inputs[2][4:12]
    assert result.timers[12+live*10:] == bytes(2560-live*10)


@pytest.mark.parametrize('failure_owner', range(6))
def test_late_owner_failure_has_no_candidate(retail, monkeypatch, failure_owner):
    items = [(item(39),) for _ in range(6)]
    effects = [() for _ in range(6)]
    items[failure_owner] = (item(39, ready=1, ident=35),)
    effects[failure_owner] = (effect(35),)
    inputs = tuple(bytearray(raw) for raw in packets([body()]*6, items, effects))
    saved = tuple(bytes(raw) for raw in inputs)
    for remove in (party.destroy, native_destroy):
        monkeypatch.setattr(party, 'destroy', remove)
        with pytest.raises(party.RemovalError):
            party.stage(*inputs, retail[2], 39)
        assert tuple(bytes(raw) for raw in inputs) == saved


@pytest.mark.parametrize('packet,offset,value', [
    (0, 4, 2), (0, 6, 7), (0, 8, 0), (0, 10, 1), (0, 12, 1),
    (0, 16, 0), (1, 16, 2), (1, 17, 2), (1, 20, 1),
    (2, 0, 0), (2, 3, 2), (2, 4, 3), (2, 5, 1), (2, 12, 0), (2, 12, 2),
])
def test_invalid_inputs_reject_before_owner_work(retail, monkeypatch, packet, offset, value):
    inputs = [bytearray(raw) for raw in packets([body()], [(item(39),)], [(effect(),)])]
    inputs[packet][offset] = value
    def forbidden(*args):
        pytest.fail('invalid request reached owner mutation')
    monkeypatch.setattr(party, 'destroy', forbidden)
    with pytest.raises(party.RemovalError):
        party.stage(*inputs, retail[2], 39)
