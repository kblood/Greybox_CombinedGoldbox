"""Clean-room party writes compared with complete unchanged gift helpers."""
from dataclasses import replace
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_melee_oracle import ACTOR_BASE
from tools.secret_roster import Hero, Roster, encode
from tools.secret_reward_party import award_fixed_gift, transfer_gems, recalculate_secret, take_item
from tools.secret_treasure_oracle import PLAYER_DATA
from tools.test_secret_treasure_helpers import gift, SEED, protected, assert_protected


def owned(machine):
    heroes = []
    for index in range(6):
        body = bytes(machine.uc.mem_read(ACTOR_BASE + index * 439, 439))
        items = machine.nodes(body[353:357], 67, 42)
        effects = machine.nodes(body[251:255], 9, 5)
        heroes.append(Hero(index + 1, body, b"".join(items), b"".join(effects)))
    return Roster(tuple(heroes), machine.retail.definitions)


@pytest.mark.parametrize("actor,requested,pool,encumbrance,balance", [
    (0, 3, 20, None, None), (1, 20, 17, None, None),
    (3, 0, 20, None, None), (0, 3, 2, 1999, None),
    (0, 2, 20, None, 65535), (5, 20, 20, 65535, None),
])
def test_gems_transfer_matches_full_original_and_preserves_stale_movement(
        gift, actor, requested, pool, encumbrance, balance):
    machine = gift
    address = ACTOR_BASE + actor * 439
    # Scalar-edge diagnostics keep the remaining genuine loaded party intact.
    if encumbrance is not None:
        machine.uc.mem_write(address + 411, struct.pack("<H", encumbrance))
    if balance is not None:
        machine.uc.mem_write(address + 269, struct.pack("<H", balance))
    machine.uc.mem_write(PLAYER_DATA + 0x87AC + 20, struct.pack("<I", pool))
    party = owned(machine)
    pools = tuple(struct.unpack("<7I", machine.uc.mem_read(PLAYER_DATA + 0x87AC, 28)))
    guard = protected(machine)
    expected = transfer_gems(party, pools, actor, requested)
    pointer = address % 16, address >> 4
    machine.call(0x344E4, (5, requested, 0, *pointer), data_base=PLAYER_DATA, seed=SEED)
    after = owned(machine)
    assert after == expected.party
    assert tuple(struct.unpack("<7I", machine.uc.mem_read(PLAYER_DATA + 0x87AC, 28))) == expected.pools
    assert machine.reg("SP") == 0xF00E
    assert after.heroes[actor].body[438] == party.heroes[actor].body[438]
    assert after.heroes[:actor] == party.heroes[:actor]
    assert after.heroes[actor + 1:] == party.heroes[actor + 1:]
    # Currency is the only permitted change to the protected pool tuple.
    current = protected(machine)
    assert current[0] == guard[0] and current[2:] == guard[2:]
    assert not machine.handles and not machine.unmapped


def test_fixed_xp_projection_matches_full_original_with_opaque_pointers(gift):
    machine = gift
    party = owned(machine)
    projected, result = award_fixed_gift(party)
    guard = protected(machine)
    machine.uc.mem_write(PLAYER_DATA + 0xA4BB, b"\0")
    machine.call(0x6A78, (0xA4BC, PLAYER_DATA >> 4), data_base=PLAYER_DATA, seed=SEED)
    share = struct.unpack("<I", machine.uc.mem_read(PLAYER_DATA + 0xA4BC, 4))[0]
    assert share == result.share == 2500
    machine.call(0x6DA3, (share, 0), data_base=PLAYER_DATA, seed=SEED)
    assert owned(machine) == projected
    assert len(encode(projected)) == len(encode(party))
    assert_protected(machine, guard)


@pytest.mark.parametrize("actor", range(6))
def test_full_r_scalar_projection_matches_original_and_preserves_archived_pointers(gift, actor):
    machine = gift
    party = owned(machine)
    hero = party.heroes[actor]
    expected = recalculate_secret(hero.body, hero.stf, hero.sfx, party.catalogue)
    address = ACTOR_BASE + actor * 439
    guard = protected(machine)
    machine.call(0x3A292, (address % 16, address >> 4), data_base=PLAYER_DATA, seed=SEED)
    after = bytearray(machine.uc.mem_read(address, 439))
    # Exact declared portable projection: only the thirteen rebuilt runtime
    # equipment far pointers retain the archived preimage in persisted P1.
    after[357:409] = hero.body[357:409]
    assert bytes(after) == expected.body
    assert struct.unpack("<H", machine.uc.mem_read(PLAYER_DATA + 0x64DA, 2))[0] == expected.ready_weight
    assert machine.uc.mem_read(PLAYER_DATA + 0x87D7, 1)[0] == expected.movement_global
    assert machine.reg("SP") == 0xF008
    assert_protected(machine, guard)


@pytest.mark.parametrize("case", ["copper", "effects", "wrap", "history", "race-zero", "race-seven"])
def test_source_r_overrides_discriminate_shared_kernel_and_effect_order(gift, case):
    machine = gift
    address = ACTOR_BASE
    body = bytearray(machine.uc.mem_read(address, 439))
    bank = 0
    if case == "copper":
        struct.pack_into("<H", body, 259, 800)
    elif case == "wrap":
        bank = 255
    elif case in ("history", "race-zero", "race-seven"):
        body[107] = {"history": 6, "race-zero": 0, "race-seven": 7}[case]
        body[275:278] = bytes(3)
        body[282], body[273], body[239] = 1, 9, 8
    machine.uc.mem_write(address, bytes(body))
    machine.uc.mem_write(0x3B000 + 0x6E4, struct.pack("<H", bank))
    if case == "effects":
        for kind in (39, 42, 74):
            machine.call(0x3701D, (0, 255, 0, kind, address % 16, address >> 4),
                         data_base=PLAYER_DATA, seed=SEED)
    hero = owned(machine).heroes[0]
    expected = recalculate_secret(hero.body, hero.stf, hero.sfx, machine.retail.definitions, bank)
    guard = protected(machine)
    machine.call(0x3A292, (address % 16, address >> 4), data_base=PLAYER_DATA, seed=SEED)
    actual = bytearray(machine.uc.mem_read(address, 439))
    actual[357:409] = hero.body[357:409]
    assert bytes(actual) == expected.body
    assert bytes(machine.uc.mem_read(PLAYER_DATA + 0x87D7, 1)) == bytes((expected.movement_global,))
    assert_protected(machine, guard)


def test_item_eligibility_and_two_real_appends_match_portable_projection(gift):
    machine = gift
    initial = owned(machine)
    party = initial
    pending = machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42)
    pointers = []
    pointer = bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4))
    for _ in range(2):
        off, seg = struct.unpack("<HH", pointer)
        pointers.append((off, seg))
        pointer = bytes(machine.uc.mem_read(seg * 16 + off + 42, 4))
    guard = protected(machine)
    for record, (off, seg) in zip(pending[:2], pointers):
        expected = take_item(party, 0, record)
        assert expected.accepted
        machine.call(0x8843, (0xa4c8, PLAYER_DATA >> 4, off, seg),
                     data_base=PLAYER_DATA, seed=SEED)
        assert bytes(machine.uc.mem_read(PLAYER_DATA + 0xa4c8, 1)) == b"\0"
        actual = owned(machine)
        # Project only the explicitly archived ephemeral pointer cells; full
        # scalar, cache, logical tail and SFX comparison remains exact.
        body = bytearray(actual.heroes[0].body)
        body[353:409] = initial.heroes[0].body[353:409]
        rows = stf_items_for_projection(actual.heroes[0].stf)
        hero = replace(actual.heroes[0], body=bytes(body), stf=rows)
        actual = replace(actual, heroes=(hero,) + actual.heroes[1:])
        assert actual == expected.party
        party = expected.party
        assert machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42) == pending
        assert_protected(machine, guard)


def stf_items_for_projection(stf):
    assert len(stf) % 67 == 0
    return b"".join(stf[i:i + 42] + bytes(4) + stf[i + 46:i + 67]
                    for i in range(0, len(stf), 67))


@pytest.mark.parametrize("actor,amount,pools", [
    (-1, 1, (0, 0, 0, 0, 0, 20, 0)),
    (6, 1, (0, 0, 0, 0, 0, 20, 0)),
    (0, 21, (0, 0, 0, 0, 0, 20, 0)),
    (0, -1, (0, 0, 0, 0, 0, 20, 0)),
    (0, True, (0, 0, 0, 0, 0, 20, 0)),
    (0, 1, (0, 0, 0, 0, 0, -1, 0)),
    (0, 1, (0, 0, 0, 0, 0, 20)),
])
def test_closed_scalar_domain_rejects_without_mutating_input(gift, actor, amount, pools):
    party = owned(gift)
    before = encode(party)
    with pytest.raises(ValueError):
        transfer_gems(party, pools, actor, amount)
    assert encode(party) == before
