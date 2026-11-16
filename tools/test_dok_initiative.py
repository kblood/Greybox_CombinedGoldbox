"""DoK initiative / turn-order rule, checked against the unchanged original GAME.OVR routines
(Unicorn) with nulls (alternative rules) and mutation controls (patched original / wrong model)."""
import itertools
import random
import struct

import pytest

pytest.importorskip('unicorn')
pytest.importorskip('capstone')
from tools import dok_initiative as di
from tools.borland_overlay import read_descriptor

SEEDS = (1, 7, 0x1234, 0xDEADBEEF, 0xFFFFFFFF, 0x80000000)
DEX_SAMPLE = (0, 1, 2, 3, 4, 5, 6, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 127, 128, 255)
TOLD = {}


@pytest.fixture(scope='module')
def retail():
    root = di.Path(__file__).resolve().parents[1]/'Death Knights of Krynn'
    if any(not (root/n).exists() for n in ('START.EXE', 'GAME.OVR')):
        pytest.skip('held DoK unavailable')
    return di.load_retail()


@pytest.fixture()
def oracle(retail):
    return di.Oracle(retail)


def delay_cases():
    return [(seed, dex, ic, team, mask)
            for seed in SEEDS for dex in DEX_SAMPLE for ic in (0, 1) for team in (0, 1) for mask in (0, 1, 2, 3)]


def order_cases():
    rng = random.Random(20261007)
    cases = []
    for _ in range(300):
        n = rng.randint(1, 9)
        pool = rng.choice(((0, 1, 2, 3), tuple(range(0, 12)), (5, 5, 5, 7), (0, 0, 20)))
        cases.append((rng.getrandbits(32), [rng.choice(pool) for _ in range(n)]))
    return cases


def run_delays(oracle, model=di.roll_delay, **kw):
    bad = []
    for seed, dex, ic, team, mask in delay_cases():
        got = oracle.calc_initiative(seed, dex, ic, team, mask)
        want = model(seed, dex, ic, team, mask, **kw)
        if got != want:
            bad.append(((seed, dex, ic, team, mask), got, want))
    return bad


def run_orders(oracle, model=di.build_order, **kw):
    bad = []
    for seed, delays in order_cases():
        got = oracle.order(seed, delays)
        want = model(seed, delays, **kw)
        if got != want:
            bad.append(((seed, delays), got, want))
    return bad


# ---------------------------------------------------------------- static structure of the loop
def test_round_loop_calls_calc_initiative_then_builder_every_round(retail):
    image, overlay = retail
    # lcall 0x89:0x25 inside the combat round loop resolves to CalculateInitiative (file 0x1ED0F)
    assert overlay[0x8C91:0x8C96] == bytes.fromhex('9a25008900')
    d = read_descriptor(image, overlay, 0x89)
    assert d.resolve(0x25) == di.CALC_INITIATIVE
    # near `push cs; call 0x910A` (order builder) later in the same iteration
    assert overlay[0x8CBD] == 0x0E and overlay[0x8CBE] == 0xE8
    assert 0x8CBE+3+struct.unpack_from('<h', overlay, 0x8CBF)[0] == di.BUILD_ORDER
    # the acting routine 0x9275 is called from the same iteration, after the builder
    assert 0x8CE8+3+struct.unpack_from('<h', overlay, 0x8CE9)[0] == di.ACT_ON_TURN
    # the iteration's back edge is `jmp 0x8C68` (the `while not end_combat` test)
    assert overlay[0x8D4E] == 0xE9 and 0x8D4E+3+struct.unpack_from('<h', overlay, 0x8D4F)[0] == di.ROUND_LOOP
    # the surprise byte is cleared (area2[DS:0846] = 0) after the roll loop, before the builder
    assert overlay[0x8CAB:0x8CBD] == bytes.fromhex('a14608' '05007c' 'c43e318c' '03f8' '26c685008400')


def test_calc_initiative_and_builder_each_have_a_single_call_site(retail):
    image, overlay = retail
    assert [i for i in range(len(overlay)-4) if overlay[i:i+5] == bytes.fromhex('9a25008900')] == [0x8C91]
    near = []
    for i in range(0x8B09, 0x8B09+0x15D6):          # the overlay that holds the builder
        if overlay[i] == 0xE8 and overlay[i-1] == 0x0E and                 i+3+struct.unpack_from('<h', overlay, i+1)[0] == di.BUILD_ORDER:
            near.append(i)
    assert near == [0x8CBE]


def test_exactly_one_d6_draw_in_calculate_initiative(retail):
    _, overlay = retail
    body = overlay[di.CALC_INITIATIVE:di.CALC_INITIATIVE+0x14C]
    assert body.count(bytes.fromhex('9a4d00c500')) == 1           # one call of the dice routine
    i = body.index(bytes.fromhex('9a4d00c500'))
    assert body[i-6:i] == bytes.fromhex('b001 50 b006 50'.replace(' ', ''))   # push 1 (count), push 6 (sides)


def test_dice_argument_order_is_count_then_sides(oracle):
    """lcall 0xC5:4D pushes (count, sides); the original dice loop takes count at bp+8."""
    for seed in SEEDS:
        oracle.m.set_state(seed)
        oracle.m.overlay_call(0x30EAC, struct.pack('<HH', 6, 1))      # sides at bp+6, count at bp+8
        s6 = oracle.m.state(), oracle.uc.reg_read(oracle._ax()) & 255
        assert s6 == di.dok_rng.dice(seed, 1, 6)


# ---------------------------------------------------------------- oracle parity
def test_dex_reaction_adj_matches_original_for_every_dex_byte(oracle):
    assert [d for d in range(256) if oracle.dex_adj(d) != di.dex_reaction_adj(d)] == []


def test_initial_delay_matches_original(oracle):
    bad = run_delays(oracle)
    assert bad == [], bad[:3]
    assert len(delay_cases()) == 6*24*2*2*4 == 2304


def test_one_rng_step_in_combat_none_out_of_combat(oracle):
    for seed in SEEDS:
        assert oracle.calc_initiative(seed, 10, 0, 0, 0) == (seed, 0)
        state, _ = oracle.calc_initiative(seed, 10, 1, 0, 0)
        assert state == (seed*di.dok_rng.MULTIPLIER+1) & 0xFFFFFFFF


def test_surprise_only_for_matching_team_bit(oracle):
    # team 0 has mask bit 1, team 1 bit 2; surprise subtracts 6 and clamps (most results become 0)
    outs = {(team, mask): [oracle.calc_initiative(s, 25, 1, team, mask)[1] for s in SEEDS]
            for team in (0, 1) for mask in (0, 1, 2, 3)}
    assert outs[(0, 0)] == outs[(0, 2)] and outs[(1, 0)] == outs[(1, 1)]      # other side's bit: no effect
    assert outs[(0, 1)] == outs[(0, 3)] and outs[(1, 2)] == outs[(1, 3)]
    assert outs[(0, 1)] != outs[(0, 0)]
    assert all(0 <= v <= 20 for vals in outs.values() for v in vals)


def test_order_builder_matches_original(oracle):
    bad = run_orders(oracle)
    assert bad == [], bad[:3]
    assert len(order_cases()) == 300


def test_order_is_descending_and_ties_cost_one_draw_each(oracle):
    seed = 99
    state, order = oracle.order(seed, [4, 9, 4, 2])
    delays = [4, 9, 4, 2]
    assert [delays[i] for i in order] == sorted(delays, reverse=True)
    assert state != seed          # the 4-vs-4 tie consumed a coin flip
    state2, order2 = oracle.order(seed, [1, 2, 3, 4])      # strictly increasing: no ties, no draws
    assert order2 == [3, 2, 1, 0] and state2 == seed


# ---------------------------------------------------------------- nulls: alternative rules predict differently
ALTERNATIVE_DELAYS = {
    'd10 instead of d6 (journal segments)': dict(die=10),
    'd4': dict(die=4),
    'no dex modifier': dict(use_dex=False),
    'no surprise penalty': dict(apply_surprise=False),
    'surprise penalty 3': dict(surprise_penalty=3),
    'floor 0 instead of 1': dict(floor=0),
}


@pytest.mark.parametrize('name', sorted(ALTERNATIVE_DELAYS))
def test_alternative_delay_rule_is_discriminated(oracle, name):
    bad = run_delays(oracle, **ALTERNATIVE_DELAYS[name])
    TOLD[name] = len(bad)
    assert len(bad) >= 20, (name, len(bad))


ALTERNATIVE_ORDERS = {
    'ascending order': dict(descending=False),
    'stable ties (no coin flip)': dict(coin_ties=False),
}


@pytest.mark.parametrize('name', sorted(ALTERNATIVE_ORDERS))
def test_alternative_order_rule_is_discriminated(oracle, name):
    bad = run_orders(oracle, **ALTERNATIVE_ORDERS[name])
    TOLD[name] = len(bad)
    assert len(bad) > 50, (name, len(bad))


def test_stored_initiative_alternative_is_discriminated(oracle):
    """A 'stored per-combatant value, never re-rolled' rule (the old CoK-doc reading) predicts the
    same delay for every seed; the original's delay changes with the RNG state."""
    for dex in (10, 18):
        seen = {oracle.calc_initiative(s, dex, 1, 0, 0)[1] for s in range(1, 200)}
        assert len(seen) >= 4


# ---------------------------------------------------------------- mutation controls (original patched)
def test_mutation_die_bound_in_original_is_detected(oracle):
    oracle.patch(0x1EDC9, b'\x08')            # push 6 -> push 8 (the sides argument)
    assert len(run_delays(oracle)) > 100


def test_mutation_surprise_subtraction_in_original_is_detected(oracle):
    oracle.patch(0x1EE18, b'\x00')            # sub byte [delay],6 -> sub ...,0
    assert len(run_delays(oracle)) > 50


def test_mutation_floor_in_original_is_detected(oracle):
    oracle.patch(0x1EDE4, b'\x00')            # cmp delay,1 -> cmp delay,0
    assert len(run_delays(oracle)) >= 20


def test_mutation_dex_table_in_original_is_detected(oracle):
    oracle.patch(0x33669, b'\x07')            # dex 3-5: dex-6 -> dex-7
    assert [d for d in range(256) if oracle.dex_adj(d) != di.dex_reaction_adj(d)] == [3, 4, 5]


def test_mutation_sort_direction_in_original_is_detected(oracle):
    oracle.patch(0x9198, b'\x7c')             # jg -> jl : ascending
    assert len(run_orders(oracle)) > 100


def test_mutation_tie_coin_in_original_is_detected(oracle):
    oracle.patch(0x91AE, b'\x02')             # cmp al,1 -> cmp al,2 on the Random(2) flip
    assert len(run_orders(oracle)) > 20


def test_unmutated_original_still_agrees_after_mutation_tests(oracle):
    assert run_orders(oracle) == [] and run_delays(oracle)[:1] == []


# ---------------------------------------------------------------- mutation controls (model wrong)
def test_model_mutations_are_detected(oracle):
    def wrong_dex(d):
        return 0 if d in (19, 20) else di.dex_reaction_adj(d)
    assert [d for d in range(256) if oracle.dex_adj(d) != wrong_dex(d)] == [19, 20]
    # a model whose tie coin is inverted (flip==2 inserts) disagrees with the original
    def inverted(state, delays):
        slots = []
        for index, delay in enumerate(delays):
            pos = 0
            while pos < len(slots):
                other = delays[slots[pos]]
                if delay > other:
                    break
                if delay == other:
                    state, flip = di.dok_rng.dice(state, 1, 2)
                    if flip == 2:
                        break
                pos += 1
            slots.insert(pos, index)
        return state, slots
    assert len(run_orders(oracle, model=inverted)) > 20
