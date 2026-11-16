"""Complete caller boundaries for the already-proved fixed-gift helpers.

These private model controls execute no new original UI route and grant no
file authority. They distinguish mandatory source calls from optional epochs.
"""
from dataclasses import replace

import pytest
pytest.importorskip("unicorn")

from tools.secret_melee_oracle import dax_members
from tools.secret_reward_party import award_fixed_gift, recalculate_secret
from tools.secret_reward_state import action, fixed_offer
from tools.test_secret_reward_party import owned
from tools.test_secret_reward_state_native import image as native_state_image
from tools.test_secret_reward_state_native import initial as native_initial
from tools.test_secret_treasure_helpers import gift


def offer(gift, *, low_strength=False):
    party = owned(gift)
    if low_strength:
        # Private scalar discriminator, not a native character-creation claim.
        body = bytearray(party.heroes[0].body)
        body[17], body[28] = 7, 0
        heroes = (replace(party.heroes[0], body=bytes(body)),) + party.heroes[1:]
        party = replace(party, heroes=heroes)
    return fixed_offer(party, dax_members(gift.files["ITEM1.DAX"])[18])


@pytest.mark.parametrize("bank", [0, 17, 65535])
def test_award_runs_complete_ordered_r_before_optional_epoch_zero(gift, bank):
    before = offer(gift)
    awarded, xp = award_fixed_gift(before.party)
    expected = [recalculate_secret(h.body, h.stf, h.sfx, awarded.catalogue, bank)
                for h in awarded.heroes]
    after, result = action(before, 4, bank1_6e4=bank)
    assert result == 1 and after.phase == 3 and after.selected == 1
    assert after.party == replace(awarded, heroes=tuple(
        replace(hero, body=projection.body)
        for hero, projection in zip(awarded.heroes, expected)))
    assert after.awards == xp.awards
    assert (after.ready_weight, after.movement_global) == (
        expected[-1].ready_weight, expected[-1].movement_global)
    assert after.epochs == ((),) and not after.transfers
    assert after.items == before.items and after.pools == before.pools


def test_every_nonfinal_take_formats_new_epoch_but_final_take_does_not(gift):
    state = action(action(offer(gift), 4)[0], 5)[0]
    state = action(action(state, 20)[0], 8)[0]
    for item in range(11, -1, -1):
        before = state
        state, result = action(state, 10, recipient=1, item=item)
        assert result == 1 and len(state.transfers) == len(before.transfers) + 1
        assert state.epochs[:-1] == before.epochs
        assert state.epochs[-1] == ((1,) if item else ())
        assert state.phase == (6 if item else 4)
        assert state.items[item].record[:42] == before.items[item].record[:42]
        assert state.party.heroes[0].stf[-67:-25] == before.items[item].record[:42]


def test_refusal_retains_source_r_then_f_without_transfer_or_epoch(gift):
    state = action(action(offer(gift, low_strength=True), 4)[0], 5)[0]
    state = action(action(state, 20)[0], 8)[0]
    for item in range(11, 0, -1):
        state, result = action(state, 10, recipient=1, item=item)
        assert result == 1
    # A stale scalar before R must be repaired even though Take is refused.
    body = bytearray(state.party.heroes[0].body)
    body[438] = 0xA5
    hero = replace(state.party.heroes[0], body=bytes(body))
    state = replace(state, party=replace(state.party, heroes=(hero,) + state.party.heroes[1:]))
    expected = recalculate_secret(hero.body, hero.stf, hero.sfx, state.party.catalogue, 17)
    after, result = action(state, 10, recipient=1, item=0, bank1_6e4=17)
    assert result == 3 and after.phase == 6
    assert after.party.heroes[0] == replace(hero, body=expected.body)
    assert after.party.heroes[1:] == state.party.heroes[1:]
    assert after.transfers == state.transfers and len(after.epochs) == len(state.epochs)
    assert after.epochs[:-1] == state.epochs[:-1] and after.epochs[-1] == (2, 1)
    assert after.items == state.items and after.pools == state.pools
    assert after.awards == state.awards and after.gems == state.gems
    assert after.ready_weight == expected.ready_weight
    assert after.movement_global == expected.movement_global


def test_native_money_only_no_finishes_without_abandoning_items(native_state_image, gift):
    machine = native_initial(native_state_image, gift)
    for kind in (4, 5, 20, 8):
        machine.apply(kind)
    for item in range(11, -1, -1):
        assert machine.apply(10, recipient=1, item=item) == 1
    before = machine.state
    assert before.phase == 4 and not before.pending and before.pools[5] == 20
    machine.apply(14)
    assert machine.state.phase == 9
    machine.apply(16)
    after = machine.state
    assert after.phase == 10 and after.flags == 7
    assert after.items == before.items and all(row.status == 1 for row in after.items)
    assert after.party == before.party and after.pools == before.pools
    assert after.transfers == before.transfers and after.epochs == before.epochs
    assert not any(row.status == 2 for row in after.items)
