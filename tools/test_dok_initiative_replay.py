"""Multi-round DoK initiative replay vs CCCOMBAT's own traces (no DOSBox; reads the artifacts a past
cccombat-dokinit-test.ps1 run left in native/build/cccombat-dokinit-test, skips cleanly when absent).
See docs/engine/research/dok-initiative-multiround-replay.md for denominators and the honest limits."""
import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import dok_initiative_replay as R  # noqa: E402

RUN = Path(__file__).resolve().parents[1] / 'native' / 'build' / 'cccombat-dokinit-test'
MONSTER_DEX = {1: 0, 2: 9, 3: 17, 4: 22}     # cccombat-dokinit-test.ps1 MONDEX
CFGS = RUN / 'cfgs.json'

pytestmark = pytest.mark.skipif(not CFGS.exists() or not (RUN / 'C00.TRC').exists(),
                                reason='no cccombat-dokinit-test trace artifacts (needs a prior DOSBox run)')


def load():
    out = []
    for c in json.loads(CFGS.read_text()):
        t = RUN / (c['id'] + '.TRC')
        if t.exists():
            out.append((c, R.parse_trace(t.read_text())))
    return out


def score(**kw):
    """-> dict of counters over all configs."""
    s = dict(configs=0, rounds=0, ok=0, r2=0, ok2=0, bad_cfgs=0, tie_rounds2=0, shrink_rounds=0)
    for c, rd in load():
        pred = R.predict(c, rd, MONSTER_DEX, **kw)
        bad = 0
        prev = None
        for r in sorted(rd):
            good = pred[r][0] == rd[r]['order']
            s['rounds'] += 1; s['ok'] += good
            if r >= 2:
                s['r2'] += 1; s['ok2'] += good
                s['tie_rounds2'] += pred[r][1] > 0
                s['shrink_rounds'] += len(rd[r]['order']) < prev
            bad += not good
            prev = len(rd[r]['order'])
        s['configs'] += 1; s['bad_cfgs'] += bad > 0
    return s


def test_denominators_pinned():
    s = score()
    assert s['configs'] == 28
    assert s['rounds'] == 337 and s['r2'] == 309
    # the multi-round claim is only worth anything if rounds >= 2 contain ties and shrinking rosters
    assert s['tie_rounds2'] >= 200 and s['shrink_rounds'] >= 20


def test_every_round_matches_replay():
    s = score()
    assert s['ok'] == s['rounds'] == 337, s
    assert s['ok2'] == s['r2'] == 309, s
    assert s['bad_cfgs'] == 0


def test_round_one_alone_does_not_cover_it():
    """Control: the round-1 model fed NO between-round draws (dcount=0 and no hits counted) fails rounds >= 2."""
    s = score(dcount=0)
    assert s['bad_cfgs'] == 28 and s['ok2'] <= 5, s


def test_mutant_wrong_damage_dice_is_red():
    for dc in (0, 2):
        s = score(dcount=dc)
        assert s['ok2'] <= 5 and s['bad_cfgs'] == 28, (dc, s)


def test_mutant_skip_surprise_clear_is_red():
    good, bad = score(), score(clear_surprise=False)
    assert good['bad_cfgs'] == 0
    assert bad['bad_cfgs'] >= 10, bad
    # only configs with a nonzero surprise byte can distinguish; rounds 1 stay right
    surprised = sum(1 for c, _ in load() if c['surprise'])
    assert surprised == 17 and bad['bad_cfgs'] <= surprised
    assert bad['ok2'] < good['ok2'] - 100, (good, bad)


def test_mutant_enemies_before_party_is_red():
    bad = score(party_first=False)
    assert bad['bad_cfgs'] == 28 and bad['ok'] <= 30, bad


def test_traces_have_no_unmodelled_line_kinds():
    kinds = set()
    for c, _ in load():
        kinds |= set(re.findall(r'(?m)^\d+ (\w+)', (RUN / (c['id'] + '.TRC')).read_text()))
    assert kinds <= {'init', 'order', 'move', 'attack', 'slain', 'end'}, kinds
