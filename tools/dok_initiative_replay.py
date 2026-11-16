"""Multi-round replay oracle for CCCOMBAT's DoK per-round initiative (see
docs/engine/research/dok-initiative-multiround-replay.md).

Round 1 is predicted from the seed alone (tools/dok_initiative.py).  For rounds >= 2 the RNG state
at the start of the roll has been advanced by every draw taken between the previous round's sort
and this round's roll: the attack resolutions (resolve_hit: one die(20), plus `dcount` damage dice
on a hit).  Those draws are MODELLED FROM THE TRACE'S OWN `attack` lines (hit flag), not measured
from RAM.  Unmodelled draws are reported by the caller as a failed prediction, never hidden.

Parameters `clear_surprise`, `party_first` and `dcount` exist so mutation controls can show that the
wrong rule scores worse; the defaults are CCCOMBAT's (cccombat.asm dok_init_round).
"""
import contextlib
import re
from tools import dok_initiative as di, dok_rng

ORDER_RE = re.compile(r'^(\d+) order (\S+) (\d+) - - - - - -\s*$')
ATTACK_RE = re.compile(r'^(\d+) attack (\S+) (\S+) (-?\d+) (-?\d+) (\d) (\S+) (\S+) (\S+)\s*$')


def lcg_bounded(state, bound, multiplier=None):
    """CCCOMBAT legacy rng_next/rng_die: state*1664525+1013904223, state mod bound; die(<=1) draws nothing."""
    state = (state*1664525 + 1013904223) & 0xFFFFFFFF
    return state, (state % bound if bound else 0)


@contextlib.contextmanager
def rng_kind(kind):
    saved = dok_rng.bounded
    if kind == 'legacy':
        dok_rng.bounded = lcg_bounded
    try:
        yield
    finally:
        dok_rng.bounded = saved


def parse_trace(text):
    """-> {round: {'order': [(id, delay)], 'attacks': [hit_flag,...]}} in round order."""
    rounds = {}
    for line in text.splitlines():
        m = ORDER_RE.match(line)
        if m:
            rounds.setdefault(int(m.group(1)), {'order': [], 'attacks': []})['order'].append((m.group(2), int(m.group(3))))
            continue
        m = ATTACK_RE.match(line)
        if m and int(m.group(1)) in rounds:
            rounds[int(m.group(1))]['attacks'].append(int(m.group(6)))
    return rounds


def combatants(cfg, monster_dex):
    """[(id, side, dex)] in CCCOMBAT array order: party first, then enemy groups."""
    out = [('p%d' % i, 0, d) for i, d in enumerate(cfg['party'])]
    n = 0
    for mid, copies in cfg['groups']:
        for _ in range(copies):
            out.append(('e%d' % n, 1, monster_dex[mid])); n += 1
    return out


def _step(state, n):
    for _ in range(n):
        state = (state*1664525 + 1013904223) & 0xFFFFFFFF if _step.kind == 'legacy' else dok_rng.step(state)
    return state


def predict(cfg, rounds, monster_dex, *, clear_surprise=True, party_first=True, dcount=1, draws=None):
    """Predict every round's [(id, delay)] order list.  `rounds` supplies, per round, which ids are
    active (the ids of its order lines) and the attack lines that consume RNG between rounds.
    Returns {round: (predicted, ties)}; the state is carried across rounds."""
    comb = {c[0]: c for c in combatants(cfg, monster_dex)}
    kind = cfg['rng']
    _step.kind = kind
    state = cfg['seed']
    surprise = cfg['surprise']
    result = {}
    with rng_kind(kind):
        for r in sorted(rounds):
            active = [comb[i] for i, _ in rounds[r]['order']]
            active.sort(key=lambda c: (c[1] if party_first else -c[1], int(c[0][1:])))
            delays = []
            for _id, side, dex in active:
                state, d = di.roll_delay(state, dex, 1, side, surprise)
                delays.append(d)
            if clear_surprise:
                surprise = 0
            coins = []
            orig = dok_rng.dice
            def counting(s, c, n, *a, **k):
                if n == 2:
                    coins.append(1)
                return orig(s, c, n, *a, **k)
            dok_rng.dice = counting
            try:
                state, order = di.build_order(state, delays)
            finally:
                dok_rng.dice = orig
            result[r] = ([(active[i][0], delays[i]) for i in order], len(coins))
            n = draws(rounds[r]) if draws else sum(1 + h*dcount for h in rounds[r]['attacks'])
            state = _step(state, n)
    return result
