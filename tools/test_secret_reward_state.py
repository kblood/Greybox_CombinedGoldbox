"""Complete private action derivation and finite ordered ledger controls."""
from dataclasses import replace
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_reward_state import action, fixed_offer, operator
from tools.secret_roster import encode
from tools.secret_melee_oracle import dax_members
from tools.test_secret_reward_party import owned
from tools.test_secret_treasure_helpers import gift


@pytest.fixture
def main(gift):
    member = dax_members(gift.files["ITEM1.DAX"])[18]
    state = fixed_offer(owned(gift), member)
    state, result = action(state, 4)
    assert result == 1
    assert [struct.unpack_from("<I", h.body, 300)[0] for h in state.party.heroes] == [202750, 202750, 202750, 101250, 202750, 202750]
    return action(state, 5)[0]


def test_mutating_two_recipients_partial_cancel_yes_no_rejoin(main):
    state = main
    script = [(20, {}), (8, {}), (10, {"recipient": 1, "item": 11}), (9, {}),
              (7, {"recipient": 2}), (8, {}), (10, {"recipient": 2, "item": 10}),
              (9, {}), (6, {"recipient": 1}), (11, {}), (23, {}),
              (12, {"recipient": 1, "value": 3}), (23, {}), (13, {}),
              (22, {}), (21, {}), (14, {}), (15, {}), (14, {}), (16, {}), (18, {})]
    for kind, fields in script:
        before = state
        state, result = action(state, kind, **fields)
        assert result in (1, 2)
        if kind in (13, 15):
            assert state.party == before.party and state.items == before.items
            assert state.pools == before.pools and state.transfers == before.transfers
        assert len(state.state_bytes()) == 160 and len(state.item_bytes()) == 960
        assert len(state.ledger_bytes()) == 1056
    assert state.phase == 11 and state.selected == 1 and not state.pending
    assert state.pools == (0, 0, 0, 0, 0, 17, 0)
    assert state.gems == (3, 0, 0, 0, 0, 0)
    assert [len(h.stf) for h in state.party.heroes] == [67, 67, 0, 0, 0, 0]
    assert state.party.heroes[0].stf[1:22] == b"Mage Scroll 3 Spells "
    arrows = state.party.heroes[1].stf
    assert arrows[1:1 + arrows[0]] == b"30 Arrows +1 "
    assert state.items[11].recipient == 1 and state.items[10].recipient == 2
    assert state.items[11].ordinal == 1 and state.items[10].ordinal == 2
    assert [(t.kind, t.recipient, t.item, t.amount) for t in state.transfers] == [
        (1, 1, 11, 1), (1, 2, 10, 1), (2, 1, 65535, 3)]
    assert all(state.party.heroes[i] == main.party.heroes[i] for i in range(2, 6))


def test_harmless_navigation_has_no_action_quota_and_no_xp_reaward(main):
    state = main
    original = encode(state.party)
    for _ in range(50):
        state = action(state, 20)[0]
        state = action(state, 21)[0]
        state = action(state, 14)[0]
        state = action(state, 15)[0]
    assert encode(state.party) == original and not state.transfers and state.epochs == ((),)
    with pytest.raises(ValueError): action(state, 4)


def test_all_positive_one_gem_transfers_reach_finite_resource_bound(main):
    state = main
    for _ in range(20):
        state = action(state, 20)[0]
        state = action(state, 11)[0]
        state = action(state, 23)[0]
        state = action(state, 12, recipient=1, value=1)[0]
        if state.phase == 7:
            state = action(state, 22)[0]
            state = action(state, 21)[0]
    assert state.phase == 4 and state.pools[5] == 0 and len(state.transfers) == 20
    assert len(state.epochs) == 21 and state.gems[0] == 20
    state = action(state, 20)[0]  # Only items remain: direct ITEMS plus F.
    assert state.phase == 6
    for item in range(11, -1, -1):
        state = action(state, 10, recipient=1, item=item)[0]
    assert state.phase == 4 and len(state.transfers) == 32 and len(state.epochs) == 33
    assert not state.pending and len(state.party.heroes[0].stf) == 12 * 67
    assert action(state, 14)[0].phase == 10  # No empty TAKE or leave-confirm.


def test_ordered_last_occurrence_keeps_writer_order_and_exact_outputs(main):
    a = operator(operator(operator(main, 2), 3), 2)
    b = operator(operator(main, 3), 2)
    assert a == b and a.epochs[-1] == (3, 2)
    c = operator(operator(main, 2), 3)
    assert c.epochs[-1] == (2, 3)
    assert a.party == c.party and a.items == c.items
    assert len(a.ledger_bytes()) == len(c.ledger_bytes()) == 1056


@pytest.mark.parametrize("kind,fields", [(17, {}), (19, {}), (10, {"recipient": 1, "item": 11}),
    (7, {"recipient": 3}), (20, {"recipient": 1}), (14, {"value": 1}), (False, {})])
def test_foreign_phase_or_identity_preserves_exact_preimage(main, kind, fields):
    before = encode(main.party), main.state_bytes(), main.item_bytes(), main.ledger_bytes()
    with pytest.raises(ValueError): action(main, kind, **fields)
    assert (encode(main.party), main.state_bytes(), main.item_bytes(), main.ledger_bytes()) == before
