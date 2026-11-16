"""Strict cold-owner reachability around the broader private arithmetic core."""
from dataclasses import replace
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_reward_state import fixed_offer, action, operator
from tools.secret_reward_replay import replay, admit_images
from tools.secret_melee_oracle import dax_members
from tools.test_secret_reward_party import owned
from tools.test_secret_treasure_helpers import gift


@pytest.fixture
def initial(gift):
    return fixed_offer(owned(gift), dax_members(gift.files["ITEM1.DAX"])[18])


def main(initial):
    return action(action(initial, 4)[0], 5)[0]


def enter_items(state):
    state = action(state, 20)[0]
    return action(state, 8)[0] if state.phase == 5 else state


def finish_no(state):
    if state.phase == 6: state = action(state, 9)[0]
    if state.phase == 7: state = action(state, 22)[0]
    if state.phase == 5: state = action(state, 21)[0]
    state = action(state, 14)[0]
    return action(state, 16)[0] if state.phase == 9 else state


def test_arithmetic_r_is_not_owner_admission_without_exact_refusal(initial):
    baseline = main(initial)
    private = operator(operator(baseline, 2), 3)
    with pytest.raises(ValueError, match="final F"):
        admit_images(initial, private)
    with pytest.raises(ValueError, match="refusal witness"):
        admit_images(initial, operator(operator(baseline, 2), 1))


def test_weak_actor_refusal_then_no_uses_pending_at_epoch_before_abandon(initial):
    hero = initial.party.heroes[0]
    body = bytearray(hero.body);body[16] = body[17] = 7;body[28] = 0
    initial = replace(initial, party=replace(initial.party, heroes=(replace(hero, body=bytes(body)),) + initial.party.heroes[1:]))
    state = enter_items(main(initial))
    for item in range(11, 0, -1):
        state, result = action(state, 10, recipient=1, item=item)
        assert result == 1
    state, result = action(state, 10, recipient=1, item=0)
    assert result == 3 and state.epochs[-1] == (2, 1)
    terminal = finish_no(state)
    assert not terminal.pending and terminal.items[0].status == 2
    derived = admit_images(initial, terminal)
    assert derived == terminal


def test_item_boundaries_cannot_drop_required_f_or_inject_f_after_final(initial):
    state = enter_items(main(initial))
    state = action(state, 10, recipient=1, item=11)[0]
    tampered = bytearray(state.ledger_bytes())
    tampered[528 + 16:528 + 32] = b"\1\0" + bytes(14)
    with pytest.raises(ValueError, match="mandatory post-transfer F"):
        replay(initial, bytes(tampered), state.phase, state.selected, state.flags)
    for item in range(10, -1, -1): state = action(state, 10, recipient=1, item=item)[0]
    assert state.epochs[-1] == ()
    tampered = bytearray(state.ledger_bytes())
    tampered[528 + 16 * 12:528 + 16 * 13] = bytes((12, 1, 1)) + bytes(13)
    with pytest.raises(ValueError, match="without pending"):
        replay(initial, bytes(tampered), state.phase, state.selected, state.flags)


def test_money_epoch_can_be_empty_or_followed_by_real_items_visit(initial):
    state = action(main(initial), 20)[0]
    state = action(state, 11)[0]
    state = action(state, 23)[0]
    state = action(state, 12, recipient=1, value=3)[0]
    assert state.epochs[-1] == ()
    assert admit_images(initial, state) == state
    state = action(state, 22)[0]
    state = action(state, 8)[0]
    assert state.epochs[-1] == (1,)
    assert admit_images(initial, state) == state


def test_money_only_no_and_full_exhaustion_have_distinct_terminal_flags(initial):
    state = enter_items(main(initial))
    for item in range(11, -1, -1): state = action(state, 10, recipient=1, item=item)[0]
    terminal = finish_no(state)
    assert terminal.flags == 7 and all(item.status == 1 for item in terminal.items)
    assert admit_images(initial, terminal) == terminal
    state = action(state, 20)[0]
    assert state.phase == 7
    state = action(state, 23)[0]
    state = action(state, 12, recipient=1, value=20)[0]
    exhausted = action(state, 14)[0]
    assert exhausted.flags == 3 and exhausted.phase == 10
    assert admit_images(initial, exhausted) == exhausted
    with pytest.raises(ValueError, match="complete exhaustion"):
        admit_images(initial, replace(exhausted, flags=7))


@pytest.mark.parametrize("phase,selected,flags", [(3, 2, 3), (6, 1, 3), (10, 1, 3), (4, 1, 7)])
def test_unreachable_current_phase_or_terminal_claim_is_rejected(initial, phase, selected, flags):
    state = replace(main(initial), phase=phase, selected=selected, flags=flags)
    with pytest.raises(ValueError): admit_images(initial, state)


def test_full_image_comparison_rejects_field_cache_and_ledger_tampering(initial):
    state = enter_items(main(initial))
    assert admit_images(initial, state) == state
    hero = state.party.heroes[0]
    body = bytearray(hero.body);body[438] ^= 1
    forged = replace(state, party=replace(state.party, heroes=(replace(hero, body=bytes(body)),) + state.party.heroes[1:]))
    with pytest.raises(ValueError, match="images differ"):
        admit_images(initial, forged)
    row = state.items[0];cache = bytearray(row.record);cache[40] ^= 1
    forged = replace(state, items=(replace(row, record=bytes(cache)),) + state.items[1:])
    with pytest.raises(ValueError, match="images differ"):
        admit_images(initial, forged)
