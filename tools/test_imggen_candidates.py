"""Tests for tools/imggen_candidates.py (candidate inventory for the next restyle batch).

Synthetic renders are built in a tmp dir, so the rules are tested without the git-ignored art.
Each rule has a control that FAILS when the rule is disabled/changed (so it cannot pass vacuously).
The last class checks the live candidates.json when the local renders exist (skips otherwise).
"""
import json
import os
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imggen_candidates as C  # noqa: E402

RNG = np.random.default_rng(7)


def painting(w, h, seed, levels=12):
    """A smooth 'picture': blurred noise quantised to `levels` grey steps, as an (h,w) index array."""
    r = np.random.default_rng(seed)
    small = r.random((max(2, h // 8), max(2, w // 8)))
    big = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), dtype=np.float32) / 255
    big = big + 0.15 * r.random((h, w))
    return np.clip((big - big.min()) / (np.ptp(big) + 1e-6) * (levels - 1), 0, levels - 1).astype(np.uint8)


def colourise(idx, ramp):
    return np.asarray(ramp, dtype=np.uint8)[idx]


RAMP_A = [(i * 20, i * 20, 255 - i * 10) for i in range(12)]          # blue-ish ramp
RAMP_B = [(40 + i * 17, 30 + i * 15, i * 8) for i in range(12)]       # brown-ish ramp (same ordering)


def save(root, rel, arr, k=1):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if k > 1:
        arr = np.kron(arr, np.ones((k, k, 1), dtype=np.uint8))
    Image.fromarray(arr).save(p)
    return p


# ------------------------------------------------------------------ primitives
def test_detect_scale_exact_and_control():
    base = colourise(painting(40, 30, 1), RAMP_A)
    for k in (1, 2, 3, 4, 6):
        a = np.kron(base, np.ones((k, k, 1), dtype=np.uint8))
        n, (kx, ky) = C.native_of(a)
        assert (kx, ky) == (k, k) and n.shape == base.shape and np.array_equal(n, base)
    broken = np.kron(base, np.ones((4, 4, 1), dtype=np.uint8))
    broken[5, 7] ^= 1   # one pixel breaks the exactness: must fall back to a smaller scale, not 4
    assert C.detect_scale(broken)[0] < 4


def test_metrics_blank_and_colours():
    flat = np.zeros((60, 60, 3), np.uint8)
    m = C.metrics(flat)
    assert m['unique_colours'] == 1 and m['dominant_fraction'] == 1.0
    art = colourise(painting(60, 60, 2), RAMP_A)
    m2 = C.metrics(art)
    assert m2['unique_colours'] > 6 and m2['dominant_fraction'] < 0.5 and m2['edge_density'] > 0.05


def _it(kind='scene', rel='dax/x/a.png'):
    return dict(rel=rel, kind=kind)


def test_exclusion_rules_each_fire_and_controls():
    art = colourise(painting(88, 88, 3), RAMP_A)
    m = C.metrics(art)
    assert C.exclusion_reason(_it(), m, (88, 88), True) is None                      # control: healthy passes
    assert 'too small' in C.exclusion_reason(_it(), m, (24, 24), True)               # sprite-sized
    assert C.exclusion_reason(_it(), m, (64, 64), True) is None                      # exactly at the area limit
    assert 'too small' in C.exclusion_reason(_it(), m, (100, 40), True)              # short side < 48
    assert 'too small' in C.exclusion_reason(_it('face'), m, (40, 40), True)         # face threshold
    assert C.exclusion_reason(_it('face'), m, (88, 40), True) is None                # 88x40 head is fine
    blank = C.metrics(np.zeros((88, 88, 3), np.uint8))
    assert 'near blank' in C.exclusion_reason(_it(), blank, (88, 88), True)
    mostly = np.zeros((88, 88, 3), np.uint8)
    mostly[:6, :6] = (255, 0, 0)
    mostly[10:14, 10:30] = (0, 255, 0)
    mostly[40:44, 5:9] = (0, 0, 255)
    mostly[60:64, 60:64] = (255, 255, 0)
    assert 'near blank' in C.exclusion_reason(_it(), C.metrics(mostly), (88, 88), True)   # delta-like
    assert 'preferred frame' in C.exclusion_reason(_it(), m, (88, 88), False)
    assert 'credits' in C.exclusion_reason(_it('title', 'hlib/TITLE/TITLE_set09_img001.png'), m, (88, 88), True)


# ------------------------------------------------------------------ wrap detection
def test_wrap_interior_seam_detected_and_control():
    pic = colourise(painting(304, 120, 4, levels=12), RAMP_A)
    clean = C.metrics(pic)
    assert not C.seam_warn(dict(clean, w=304))
    wrapped = np.roll(pic, 97, axis=1)             # decoder-style column rotation
    mw = C.metrics(wrapped)
    warns = C.seam_warn(dict(mw, w=304))
    assert warns and 'interior vertical seam' in warns[0]
    assert abs(mw['seam']['x'] - (97 - 1)) <= 1   # located where the rotation happened


def test_banner_clip_detected_and_control():
    w, h = 240, 88
    ok = np.zeros((h, w, 3), np.uint8)
    ok[30:60, 40:200] = (255, 200, 0)               # ink fully inside
    bad = ok.copy()
    bad[30:60, :10] = (255, 0, 255)                 # ink cut by the left edge...
    bad[30:60, -10:] = (0, 255, 255)                # ...and, in a different colour, by the right edge
    bar = ok.copy()
    bar[30:40, :] = (255, 0, 0)                     # a bar running edge to edge (same colour both sides)
    for arr, expect in ((ok, False), (bad, True), (bar, False)):
        m = dict(C.metrics(arr), w=w, banner=True)
        assert bool([x for x in C.seam_warn(m) if 'clip' in x]) is expect
    # banner-only: the same defect on a scene-shaped image must not be reported
    assert not [x for x in C.seam_warn(dict(C.metrics(bad), w=w, banner=False)) if 'clip' in x]


# ------------------------------------------------------------------ dedupe
def _rec(arr, game='cok', plat='amiga', rel='a'):
    n = arr
    return dict(native=(n.shape[1], n.shape[0]), sig=C.signature(n), pixkey=C.pixel_key(n), game=game,
                platform=plat, rel=rel, warnings=[], metrics=C.metrics(n))


def test_dedupe_cross_platform_same_picture_but_not_different_pictures():
    idx = painting(304, 120, 11)
    amiga = _rec(colourise(idx, RAMP_A), plat='amiga', rel='daa/a.png')
    dos_small = colourise(idx[::2, ::2], RAMP_B)       # half resolution, other palette
    dos = _rec(dos_small, plat='dos', rel='dax/a.png')
    other = _rec(colourise(painting(304, 120, 12), RAMP_A), plat='amiga', rel='daa/b.png')
    groups = C.group_items([amiga, dos, other])
    sets = sorted(sorted(g) for g in groups)
    assert sets == [[0, 1], [2]]
    # control: an impossible threshold must split the pair (the grouping depends on similarity)
    assert len(C.group_items([amiga, dos, other], corr=1.01)) == 3


def test_dedupe_exact_pixels_and_aspect_guard():
    a = colourise(painting(88, 88, 5), RAMP_A)
    r1, r2 = _rec(a, rel='x'), _rec(a.copy(), rel='y')
    assert len(C.group_items([r1, r2])) == 1
    wide = _rec(colourise(painting(176, 88, 5), RAMP_A), rel='z')   # different aspect: never the same
    assert len(C.group_items([r1, wide])) == 2


def test_representative_follows_best_art_platform_rule():
    idx = painting(88, 88, 6)
    mk = lambda game, plat, warn=False: dict(_rec(colourise(idx, RAMP_A), game, plat, rel=f'{plat}/p'),
                                             warnings=['w'] if warn else [])
    cok = [mk('cok', 'dos'), mk('cok', 'amiga')]
    assert cok[C.pick_representative([0, 1], cok)]['platform'] == 'amiga'       # Amiga best for CoK/DoK
    dqk = [mk('dqk', 'dos'), mk('dqk', 'amiga')]
    assert dqk[C.pick_representative([0, 1], dqk)]['platform'] == 'dos'          # DOS best for DQK
    flagged = [mk('cok', 'dos'), mk('cok', 'amiga', warn=True)]
    assert flagged[C.pick_representative([0, 1], flagged)]['platform'] == 'dos'  # clean beats best-platform


# ------------------------------------------------------------------ scan on a synthetic renders tree
@pytest.fixture()
def tree(tmp_path):
    r = str(tmp_path / 'renders')
    idxs = {n: painting(304, 120, 100 + n) for n in (112, 114, 115)}
    for n, idx in idxs.items():
        save(r, f'daa/BIGPIC1_ChampionsOfKrynn/BIGPIC1_{n}.png', colourise(idx, RAMP_A), 4)   # Amiga, 4x render
        save(r, f'dax/CoK_BIGPIC1/BIGPIC1_{n}.png', colourise(idx, RAMP_B), 2)               # DOS, 2x render
    # a stale/broken third decode of block 115 in another dir
    junk = RNG.integers(0, 255, (120, 304, 3), dtype=np.uint8)
    save(r, 'daa/BIGPIC1_cok/BIGPIC1_115.png', junk, 1)
    # tiny sprite-sized and blank pictures
    save(r, 'dax/dok_cpic1/CPIC1_000.png', colourise(painting(40, 24, 9), RAMP_A), 4)
    blank = np.zeros((120, 304, 3), np.uint8)
    blank[0, 0] = 255
    blank[-1, -1] = 128      # keeps the native scale at 1x so the blank rule (not 'too small') is what fires
    save(r, 'dax/DoK_BIGPIC1/BIGPIC1_113.png', blank, 1)
    return r


def test_scan_dedupes_excludes_and_honours_done(tree):
    groups, excluded = C.scan(renders=tree, done=['daa/BIGPIC1_ChampionsOfKrynn/BIGPIC1_112.png'])
    by_id = {g['id']: g for g in groups}
    assert len(groups) == 3                                           # 112, 114, 115 (cross-platform folded)
    for g in groups:
        assert g['platform'] == 'amiga' and len(g['alternates']) == 1  # best-art rep + the DOS alternate
        assert g['native_size'] == [304, 120]                          # true native, not the 4x/2x render size
    done = [g for g in groups if 'excluded' in g]
    assert len(done) == 1 and '112' in done[0]['source']
    reasons = {e['rel']: e['excluded'] for e in excluded}
    assert 'decode junk' in reasons['daa/BIGPIC1_cok/BIGPIC1_115.png']
    assert 'too small' in reasons['dax/dok_cpic1/CPIC1_000.png']
    assert 'near blank' in reasons['dax/DoK_BIGPIC1/BIGPIC1_113.png']
    # control: without the junk decode's two siblings it would NOT be an outlier (needs >=3 decodes)
    assert not C.consensus_outliers([])
    assert by_id


def test_scan_is_deterministic(tree):
    a = C.scan(renders=tree, done=[])
    b = C.scan(renders=tree, done=[])
    assert json.dumps(a[0], sort_keys=True, default=str) == json.dumps(b[0], sort_keys=True, default=str)


def test_propose_uses_curated_descriptions_and_reports_missing(tree):
    groups, _ = C.scan(renders=tree, done=[])
    gid = groups[0]['id']
    desc = {'items': {gid: dict(description='d', role='scene', family='cok-scenes', score_adjust=-1),
                      'no_such_id': dict(description='x')}}
    before = groups[0]['score']
    C.propose(groups, desc=desc)
    chosen = [g for g in groups if g.get('proposed_batch02')]
    assert [g['id'] for g in chosen] == [gid] and chosen[0]['description'] == 'd'
    assert chosen[0]['score'] == round(before - 1, 2) and chosen[0]['rank'] == 1
    assert C.propose.missing == ['no_such_id']


def test_stage_site_copies_proposal_inputs(tree, tmp_path):
    groups, excluded = C.scan(renders=tree, done=[])
    desc = {'items': {groups[0]['id']: dict(description='d', role='scene', family='f')}, 'families': {}}
    C.propose(groups, desc=desc)
    out = str(tmp_path / 'cand')
    C.write_outputs(groups, excluded, out_dir=out, desc=desc)
    site = str(tmp_path / 'site')
    # sources are repo-relative "renders/..." paths: stage against the tmp repo root
    root = os.path.dirname(tree)
    copied = C.stage_site(site, out_dir=out, renders=root)
    d = os.path.join(site, 'restyle', 'proposal')
    assert os.path.exists(os.path.join(d, 'candidates.json'))
    assert groups[0]['id'] in copied and os.path.exists(os.path.join(d, groups[0]['id'] + '.png'))


# ------------------------------------------------------------------ live corpus (skips without renders)
LIVE = os.path.join(C.OUT_DIR, 'candidates.json')


@pytest.mark.skipif(not os.path.exists(LIVE) or not os.path.isdir(os.path.join(C.RENDERS, 'daa')),
                    reason='local git-ignored renders / candidates.json not present')
class TestLive:
    def data(self):
        return json.load(open(LIVE, encoding='utf-8'))

    def test_proposal_size_and_balance(self):
        d = self.data()
        prop = [g for g in d['candidates'] if g.get('proposed_batch02')]
        assert 40 <= len(prop) <= 60
        games = {g['game'] for g in prop}
        assert {'cok', 'dok', 'dqk'} <= games
        assert sorted(g['rank'] for g in prop) == list(range(1, len(prop) + 1))

    def test_no_done_no_blocking_warnings_and_all_described(self):
        d = self.data()
        done = set(C.batch01_srcs())
        for g in d['candidates']:
            if not g.get('proposed_batch02'):
                continue
            assert 'excluded' not in g
            assert g['source'][len('renders/'):] not in done
            if not g.get('sequence'):     # a title-sequence step may carry a clip warning (documented exemption)
                assert not any(w.startswith(('wrap', 'decode')) for w in g['warnings'])
            assert g['description'] and g['family']
            assert min(g['native_size']) >= 48 or g['kind'] == 'face'

    def test_one_representative_per_group_and_best_platform(self):
        d = self.data()
        keys = [g['group_key'] for g in d['candidates']]
        assert len(keys) == len(set(keys))
        for g in d['candidates']:
            if g['game'] in ('cok', 'dok') and g['alternates'] and not g['warnings']:
                plats = {a['platform'] for a in g['alternates']}
                if g['platform'] == 'dos':
                    assert 'amiga' not in plats    # an Amiga CoK/DoK alternate must have won

    def test_alternates_never_listed_as_candidates(self):
        d = self.data()
        reps = {g['source'] for g in d['candidates']}
        for g in d['candidates']:
            for a in g['alternates']:
                assert a['source'] not in reps


# ------------------------------------------------------------------ Amiga <-> DOS twins, cross-game guard, sequences
def _twin_tree(tmp_path, conf='high', with_json=True):
    r = str(tmp_path / 'renders')
    save(r, 'daa/CoK_PIC1/PIC1_001_f0.png', colourise(painting(88, 88, 301), RAMP_A), 3)           # Amiga
    save(r, 'dax_complex/PIC1_xor/PIC1_001_f0.png', colourise(painting(88, 88, 302), RAMP_B), 2)   # DOS: a different-looking render
    if with_json:
        os.makedirs(os.path.join(r, 'amiga_cokdok'), exist_ok=True)
        json.dump({'daa/CoK_PIC1/PIC1_001_f0.png': dict(game='cok', confidence=conf, purity=0.9, luminance_corr=0.9,
                                                        dos_twins=[dict(file='PIC1.DAX', block=1)])},
                  open(os.path.join(r, 'amiga_cokdok', 'twins.json'), 'w'))
    return r


def test_twins_json_merges_pair_and_controls(tmp_path):
    groups, _ = C.scan(renders=_twin_tree(tmp_path), done=[])
    assert len(groups) == 1
    g = groups[0]
    assert g['platform'] == 'amiga' and [a['platform'] for a in g['alternates']] == ['dos']      # Amiga is the CoK representative
    t = g['dos_twins'][0]
    assert t['forced'] is True and t['confidence'] == 'high' and t['stage_id'] and t['rel'].endswith('PIC1_001_f0.png')
    # control 1: a low-confidence twin is reported but never merges
    g2, _ = C.scan(renders=_twin_tree(tmp_path / 'low', conf='low'), done=[])
    assert len(g2) == 2 and not any(x.get('dos_twins') and x['dos_twins'][0]['forced'] for x in g2)
    # control 2: without twins.json the two different-looking renders are two groups
    g3, _ = C.scan(renders=_twin_tree(tmp_path / 'nojson', with_json=False), done=[])
    assert len(g3) == 2


def test_twin_lookup_is_case_insensitive_on_the_amiga_path(tmp_path):
    r = _twin_tree(tmp_path)
    os.rename(os.path.join(r, 'daa', 'CoK_PIC1'), os.path.join(r, 'daa', 'cok_pic1'))   # Windows: twins.json says CoK_PIC1
    info = C.cokdok_twin_info(r, {'daa/cok_pic1/PIC1_001_f0.png', 'dax_complex/PIC1_xor/PIC1_001_f0.png'})
    assert list(info) == ['daa/cok_pic1/PIC1_001_f0.png'] and info['daa/cok_pic1/PIC1_001_f0.png'][0]['forced']


def test_same_picture_never_merges_across_games_but_does_within_one(tmp_path):
    r = str(tmp_path / 'renders')
    idx = painting(88, 88, 55)
    save(r, 'daa/CoK_PIC1/PIC1_002_f0.png', colourise(idx, RAMP_A), 3)
    save(r, 'daa/DoK_PIC1/PIC1_002_f0.png', colourise(idx, RAMP_A), 3)            # identical pixels, other game (SSI screens look alike)
    groups, _ = C.scan(renders=r, done=[])
    assert sorted(g['game'] for g in groups) == ['cok', 'dok']
    # control: the same two copies inside ONE game fold into a single group
    r2 = str(tmp_path / 'r2')
    save(r2, 'daa/CoK_PIC1/PIC1_002_f0.png', colourise(idx, RAMP_A), 3)
    save(r2, 'daa/CoK_PIC2/PIC2_002_f0.png', colourise(idx, RAMP_A), 3)
    g2, _ = C.scan(renders=r2, done=[])
    assert len(g2) == 1 and len(g2[0]['alternates']) == 1


def test_sequence_constants_orders_and_placements_are_pinned():
    dok = {st['order']: st for st in C.SEQUENCES['dok_title']['steps']}
    cok = {st['order']: st for st in C.SEQUENCES['cok_title']['steps']}
    assert sorted(dok) == sorted(cok) == [1, 2, 3, 4]
    assert [(dok[i]['role'], dok[i]['parent'], dok[i]['x'], dok[i]['y']) for i in (1, 2, 3, 4)] == [
        ('background', None, 0, 0), ('background', None, 0, 0), ('overlay', 2, 0, 88), ('overlay', 2, 0, 88)]
    assert [(cok[i]['role'], cok[i]['parent'], cok[i]['x'], cok[i]['y']) for i in (1, 2, 3, 4)] == [
        ('background', None, 0, 0), ('background', None, 0, 0), ('overlay', 2, 40, 8), ('overlay', 2, 0, 8)]
    assert dok[3]['members'][0].endswith('DoK_Title1A.png') and dok[4]['members'][0].endswith('DoK_Title1B.png')


def _fake_seq_groups():
    gs, mem = [], {}
    for sid, seq in C.SEQUENCES.items():
        for st in seq['steps']:
            g = dict(id=f"{seq['game']}_s{st['order']}", game=seq['game'], group_key=f"{sid}{st['order']}", alternates=[], warnings=[])
            gs.append(g)
            mem[g['group_key']] = {st['members'][0]}
    return gs, mem


def test_attach_sequences_sets_order_parent_placement_and_reports_missing():
    gs, mem = _fake_seq_groups()
    assert C.attach_sequences(gs, mem) == []
    s4 = next(g for g in gs if g['id'] == 'dok_s4')['sequence']
    assert (s4['id'], s4['order'], s4['role'], s4['parent'], s4['x'], s4['y'], s4['steps']) == ('dok_title', 4, 'overlay', 'dok_s2', 0, 88, 4)
    assert next(g for g in gs if g['id'] == 'cok_s1')['sequence']['parent'] is None
    # control: a step whose member render is not in any group is a reported problem, not a silent gap
    gs2, mem2 = _fake_seq_groups()
    del mem2['cok_title3']
    probs = C.attach_sequences(gs2, mem2)
    assert len(probs) == 1 and 'cok_title step 3' in probs[0]


def test_propose_exempts_sequence_members_from_clip_warning_but_not_others():
    base = dict(game='cok', kind='logo', platform='amiga', source='renders/x.png', native_size=[240, 88], alternates=[], score=1.0, score_reason='')
    a = dict(base, id='a', group_key='a', warnings=['wrap-artefact? seam'], sequence=dict(id='cok_title', order=3))
    b = dict(base, id='b', group_key='b', warnings=['wrap-artefact? seam'])
    desc = {'items': {'a': dict(description='d', role='logo', family='f'), 'b': dict(description='d', role='logo', family='f')}}
    C.propose([a, b], desc=desc)
    assert a['proposed_batch02'] is True and b['proposed_batch02'] is False and C.propose.missing == ['b']


def test_stage_site_stages_sequence_members_layers_and_twin_thumbs(tmp_path):
    root = tmp_path / 'repo'
    out = root / 'cand'
    os.makedirs(out / 'layers')
    for rel in ('renders/s1.png', 'renders/s2.png', 'renders/dos_twin.png'):
        os.makedirs(os.path.dirname(root / rel), exist_ok=True)
        Image.fromarray(np.zeros((4, 4, 3), np.uint8)).save(root / rel)
    for f in ('layers/l.png', 'layers/l_parent.png'):
        Image.fromarray(np.zeros((4, 4, 4), np.uint8)).save(out / f)
    done = dict(id='s1', source='renders/s1.png', alternates=[], excluded='already done in batch01 (x)',
                sequence=dict(id='q', order=1),
                dos_twins=[dict(rel='renders/dos_twin.png', stage_id='twin_dos', confidence='high')],
                layer=dict(files={'layer': 'layers/l.png', 'parent': 'layers/l_parent.png'}))
    other = dict(id='o', source='renders/s2.png', alternates=[])       # neither proposed nor in a sequence
    json.dump(dict(candidates=[done, other]), open(out / 'candidates.json', 'w'))
    site = str(tmp_path / 'site')
    copied = C.stage_site(site, out_dir=str(out), renders=str(root))
    d = os.path.join(site, 'restyle', 'proposal')
    assert set(copied) == {'s1', 'twin_dos'}                          # control: the unrelated candidate is NOT staged
    assert os.path.exists(os.path.join(d, 's1.png')) and os.path.exists(os.path.join(d, 'twin_dos.png'))
    assert os.path.exists(os.path.join(d, 'layers', 'l.png')) and os.path.exists(os.path.join(d, 'layers', 'l_parent.png'))
    assert not os.path.exists(os.path.join(d, 'o.png'))


@pytest.mark.skipif(not os.path.exists(LIVE) or not os.path.isdir(os.path.join(C.RENDERS, 'amiga_cokdok')),
                    reason='local git-ignored renders / candidates.json not present')
class TestLiveSequences:
    def cands(self):
        return json.load(open(LIVE, encoding='utf-8'))['candidates']

    def test_both_sequences_complete_and_ordered(self):
        by = {}
        for g in self.cands():
            if g.get('sequence'):
                by.setdefault(g['sequence']['id'], {})[g['sequence']['order']] = g
        assert sorted(by) == ['cok_title', 'dok_title']
        for sid, steps in by.items():
            assert sorted(steps) == [1, 2, 3, 4], sid
            assert steps[3]['sequence']['parent'] == steps[4]['sequence']['parent'] == steps[2]['id']
            assert all(g['platform'] == 'amiga' for g in steps.values())              # Amiga is the representative
        d = by['dok_title']
        assert (d[3]['sequence']['x'], d[3]['sequence']['y'], d[4]['sequence']['x'], d[4]['sequence']['y']) == (0, 88, 0, 88)
        assert d[3]['id'].endswith('dok_title1a') and 'batch01' in d[3]['excluded']            # the Dragonlance band: done, RGBA layer
        assert d[1]['id'].endswith('dok_title0') and 'batch01' in d[1]['excluded']

    def test_overlay_steps_have_real_rgba_layers(self):
        root = os.path.dirname(LIVE)
        n = 0
        for g in self.cands():
            sq = g.get('sequence')
            if not sq or sq['role'] != 'overlay':
                continue
            f = g['layer']['files']['layer']
            a = np.asarray(Image.open(os.path.join(root, f)).convert('RGBA'))
            frac = float((a[..., 3] > 0).mean())
            assert (a[..., 3] == 0).any() and (a[..., 3] == 255).any() and 0.05 < frac < 0.9, (g['id'], frac)   # a stencil, not a full rect
            n += 1
        assert n == 4

    def test_every_non_done_step_is_proposed_and_done_steps_are_tagged(self):
        for g in self.cands():
            if g.get('sequence'):
                done = 'batch01' in (g.get('excluded') or '')
                assert g['proposed_batch02'] is (not done), g['id']

    def test_cok_dok_representatives_are_amiga_and_twin_listed(self):
        prop = [g for g in self.cands() if g.get('proposed_batch02') and g['game'] in ('cok', 'dok')]
        assert prop and all(g['platform'] == 'amiga' for g in prop)
        assert sum(1 for g in prop if any(t.get('stage_id') for t in g.get('dos_twins') or [])) >= 10
