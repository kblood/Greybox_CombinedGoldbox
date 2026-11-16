"""Original effect-7 execution with explicit synthetic combat context."""
from pathlib import Path
import itertools
import struct

import pytest

pytest.importorskip('unicorn')
from unicorn.x86_const import UC_X86_REG_AX
from tools.cok_item_removal_oracle import Member, BODY_BASE, pointer, load
from tools.cok_effect7_oracle import ContextMachine, MAP_BASE, MAP_LENGTH, FOOTPRINTS
from tools.cok_equipment import strength_index, strength_damage


@pytest.fixture(scope='module')
def held():
    game = Path(__file__).resolve().parents[1]/'Champions of Krynn'
    names = ('START.EXE', 'GAME.OVR', 'ITEMS', 'SAVE/CHRDATA4.SAV',
             'SAVE/CHRDATA4.STF', 'SAVE/CHRDATA4.SFX')
    if any(not (game/name).exists() for name in names):
        pytest.skip('held CoK fourth party member unavailable')
    def records(ext, width):
        raw = (game/f'SAVE/CHRDATA4.{ext}').read_bytes()
        assert len(raw) % width == 0
        return tuple(raw[i:i+width] for i in range(0, len(raw), width))
    member = Member((game/'SAVE/CHRDATA4.SAV').read_bytes(), records('STF', 63), records('SFX', 9))
    assert any(r[46] == 67 and r[52] and r[61:63] == bytes((7, 128)) for r in member.items)
    assert any(r[0] == 7 and r[4] == 1 for r in member.effects)
    return load(game), member


def machine(held, **kwargs):
    retail, member = held
    return ContextMachine(retail, (member, Member(member.body)), **kwargs)


def clear_range(first, second):
    # Candidate formula, independently evaluated over the explicit footprints.
    points = lambda p: [(p[0]+dx, p[1]+dy) for dx, dy in FOOTPRINTS[p[2]]]
    return min(max(abs(x-u), abs(y-v))+min(abs(x-u), abs(y-v))//2
               for x, y in points(first) for u, v in points(second))


@pytest.mark.parametrize('size,index', itertools.product(range(1, 5), range(4)))
def test_original_footprint_table_and_accessor(held, size, index):
    m = machine(held)
    image = held[0][0]
    data = struct.unpack_from('<H', image, 0xA461)[0]*16
    expected = FOOTPRINTS[size][index] if index < len(FOOTPRINTS[size]) else (-1, -1)
    assert struct.unpack_from('<bb', image, data+0x1FE4+size*8+index*2) == expected
    m.uc.mem_write(0x71040, b'\xaa\xaa')
    m.execute(0x3F31F, pointer(0x71041)+pointer(0x71040)+struct.pack('<HH', index, size))
    assert bytes(m.uc.mem_read(0x71040, 2)) == bytes(v & 255 for v in expected)
    assert m.uc.reg_read(UC_X86_REG_AX) & 255 == int(expected[0] >= 0)


COORDINATES = [((10, 10), (10, 10)), ((10, 10), (11, 10)), ((10, 10), (12, 10)),
               ((10, 10), (10, 12)), ((10, 10), (13, 13)), ((10, 10), (7, 7)),
               ((0, 0), (48, 23)), ((48, 23), (0, 0))]


@pytest.mark.parametrize('sizes,coords', itertools.product(itertools.product(range(1, 5), repeat=2), COORDINATES))
def test_original_range_and_callback_with_footprints(held, sizes, coords):
    positions = tuple((*c, size) for c, size in zip(coords, sizes))
    m = machine(held, positions=positions)
    terrain = bytes(m.uc.mem_read(MAP_BASE, MAP_LENGTH))
    before_list = bytes(m.uc.mem_read(0x56A33, 216))
    distance = m.range()
    assert distance == clear_range(*positions)
    assert bytes(m.uc.mem_read(MAP_BASE, MAP_LENGTH)) == terrain
    assert m.map_writes == [(6, 1, 1), (6, 1, 0)]
    assert bytes(m.uc.mem_read(0x56A33, 216)) == before_list
    result = m.removal()
    assert result.rng == (0xDEADBEEF*0x08088405+1) & 0xFFFFFFFF
    die = (result.rng >> 16) % (6 if distance < 2 else 4)+1
    assert result.damage == die+(3 if distance < 2 else 1)
    assert result.map_bytes == terrain
    assert result.map_writes == ((6, 1, 1), (6, 1, 0))
    assert [raw[46] for _, raw in result.snapshot.items[0]] == [32, 37, 18]
    assert [raw[0] for _, raw in result.snapshot.effects[0]] == [92, 94]
    assert any(off == 0x43AE for off, size, value in result.data_writes)


@pytest.mark.parametrize('enabled,distance,bonus,strength,dexterity', itertools.product(
    (0, 1), (1, 2), (0, 1, 127, 255), ((3, 0), (18, 100), (25, 0)), (3, 18, 25)))
def test_original_damage_modifiers_and_wrapping(held, enabled, distance, bonus, strength, dexterity):
    retail, member = held
    body = bytearray(member.body)
    body[17], body[28], body[23], body[276] = *strength, dexterity, enabled
    items = []
    for raw in member.items:
        item = bytearray(raw)
        if item[46] == 67:
            item[50] = bonus
        items.append(bytes(item))
    m = ContextMachine(retail, (Member(bytes(body), tuple(items), member.effects), Member(member.body)),
                       positions=((10, 10, 1), (10+distance, 10, 1)))
    result = m.removal()
    assert result.rng == (0xDEADBEEF*0x08088405+1) & 0xFFFFFFFF
    die = (result.rng >> 16) % (6 if distance < 2 else 4)+1
    modifier = 2+(strength_damage(strength_index(*strength)) if enabled else 0) if distance < 2 else 1
    assert result.damage == (die+bonus+modifier) & 255


@pytest.mark.parametrize('delta,seed', itertools.product(((0, 0), (1, 0), (2, 0), (3, 0),
                                                         (10, 0), (1, 1), (2, 2), (3, 4)),
                                                        (0, 1, 0xDEADBEEF, 0xFFFFFFFF)))
def test_original_range_rng_seeds(held, delta, seed):
    positions = ((10, 10, 1), (10+delta[0], 10+delta[1], 1))
    m = machine(held, positions=positions)
    distance = m.range()
    result = m.removal(seed=seed)
    assert distance == clear_range(*positions)
    assert result.rng == (seed*0x08088405+1) & 0xFFFFFFFF
    die = (result.rng >> 16) % (6 if distance < 2 else 4)+1
    assert result.damage == die+(3 if distance < 2 else 1)

@pytest.mark.parametrize('address,raw', [(0x56A2E, bytes(4)), (0x56242, bytes(1)),
                                        (0x568D9, bytes(4)), (BODY_BASE+387, bytes(4)),
                                        (0x7100A, bytes(4)), (0x56243, bytes([50, 24, 0, 1]))])
def test_missing_or_inconsistent_context_rejected(held, address, raw):
    m = machine(held)
    m.uc.mem_write(address, raw)
    before = bytes(m.uc.mem_read(0, 0x100000))
    with pytest.raises(ValueError, match='no longer matches'):
        m.removal()
    assert bytes(m.uc.mem_read(0, 0x100000)) == before


def test_map_guard_catches_original_out_of_allocation_write(held):
    m = machine(held)
    # Deliberately bypass public context validation, testing the instruction-level
    # map guard itself. The map pointer names the adjacent research padding.
    m.uc.mem_write(0x56A2E, pointer(MAP_BASE+MAP_LENGTH))
    with pytest.raises(AssertionError, match='map access outside explicit allocation'):
        m.execute(0x38E2E, pointer(BODY_BASE+512)+pointer(BODY_BASE))


@pytest.mark.parametrize('position', [(-1, 0, 1), (50, 0, 1), (0, 25, 1), (0, 0, 0),
                                     (0, 0, 5), (49, 24, 2), (49, 24, 3), (49, 24, 4)])
def test_outside_map_footprint_rejected(held, position):
    with pytest.raises(ValueError, match='bounded research domain'):
        machine(held, positions=(position, (10, 10, 1)))

@pytest.mark.parametrize('positions', [((10, 10, 1), (10, 10, 1)), ((10, 10, 1), (12, 10, 1)),
                                      ((10, 10, 4), (12, 10, 4)), ((0, 0, 4), (48, 23, 4))])
def test_callback_global_effects_do_not_hide_body_or_list_differences(held, positions):
    retail, member = held
    effects = tuple(raw[:4]+b'\0'+raw[5:] if raw[0] == 7 else raw for raw in member.effects)
    control = ContextMachine(retail, (Member(member.body, member.items, effects), Member(member.body)),
                             positions=positions)
    control.uc.mem_write(0x56B30, b'\xa5')
    control.uc.mem_write(0x56B34, b'\xa5')
    control.uc.mem_write(0x56A32, b'\xa5')
    unapplied = control.removal(seed=0x12345678)
    applied_machine = machine(held, positions=positions)
    applied = applied_machine.removal(seed=0x12345678)
    assert applied.snapshot == unapplied.snapshot
    assert applied.context == unapplied.context
    assert unapplied.rng == 0x12345678 and unapplied.damage == 0xA5
    assert applied.rng != unapplied.rng and applied.damage != unapplied.damage
    assert unapplied.map_writes == ()
    # Final character/list equality must not hide the other callback globals.
    changed = {offset: after for offset, before, after in applied.data_changes}
    assert changed[0x6A32] == 2
    assert changed[0x6B34] == 1
    assert control.uc.mem_read(0x56A32, 1)[0] == 0xA5
    assert control.uc.mem_read(0x56B34, 1)[0] == 0xA5
    assert not any(offset in (0x6A32, 0x6B34) for offset, size, value in unapplied.data_writes)
    # The complete snapshots happen to match, but the applied callback still
    # executes direct writes to the combatant's +0x18C field. Record the
    # instruction IP so surrounding recalculation cannot hide that ownership.
    callback_stores = {applied_machine.location(address) for address in (0x10E78, 0x10ED9, 0x10F21)}
    first_store = applied_machine.location(0x10E78)
    final_stores = {applied_machine.location(address) for address in (0x10ED9, 0x10F21)}
    applied_callback_writes = [(ip, owner, offset, size, value)
                               for ip, owner, offset, size, value in applied.body_writes
                               if ip in callback_stores]
    unapplied_callback_writes = [(ip, owner, offset, size, value)
                                 for ip, owner, offset, size, value in unapplied.body_writes
                                 if ip in callback_stores]
    assert any(ip == first_store and owner == 0 and offset == 0x18C
               for ip, owner, offset, size, value in applied_callback_writes)
    assert any(ip in final_stores and owner == 0 and offset == 0x18C
               for ip, owner, offset, size, value in applied_callback_writes)
    assert not unapplied_callback_writes


def test_original_removal_dispatch_forwards_owner_handle_into_effect7(held):
    m = machine(held)
    result = m.removal(seed=0x12345678)
    assert len(result.callback_calls) == 1
    callback, caller, handle, member, context, target = result.callback_calls[0]
    assert callback == 0x10DF0
    assert caller == 0x34190  # return immediately after the indirect far call at 0x3418C
    assert 0x60000 <= handle < 0x6F000  # pointer-to-member handle lives on the original caller stack
    assert member == BODY_BASE  # original DESTROY_ITEMS dispatch passes its owner
    # The member's context pointer and target were wired by this synthetic
    # fixture, so this does not claim the retail item-removal route initializes
    # them. It makes that remaining provenance boundary explicit.
    assert context == 0x71000
    assert target == BODY_BASE+512
