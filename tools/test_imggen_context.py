"""Tests for the game-text context and animation annotations of the restyle candidates / webpack packages.

Synthetic trees (a tmp scene_text JSON, tmp frame PNGs) test the rules; each rule has a control that fails when the
rule is changed. TestLive checks the real candidates.json when the git-ignored renders exist (skips otherwise).
"""
import json
import os
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imggen_candidates as C  # noqa: E402
import imggen_webpack as W  # noqa: E402

LIVE = os.path.join(C.OUT_DIR, 'candidates.json')


# ------------------------------------------------------------------ context_text
def test_context_text_narration_kept_and_prompt_never():
    t, stripped = C.context_text('narration', 'THE MAIN TOWER PITCHES FORWARD. EVERYTHING SEEMS TO BE FALLING.')
    assert t == 'THE MAIN TOWER PITCHES FORWARD. EVERYTHING SEEMS TO BE FALLING.' and not stripped
    assert C.context_text('prompt', 'THE GUARDS ARE ASLEEP IN THE HALL AND THE DOOR IS OPEN.')[0] is None      # menu text is never scene description
    assert C.context_text('narration', 'OK.')[0] is None                                  # too short to carry meaning


def test_context_text_removes_quoted_speech_and_keeps_apostrophes():
    t, stripped = C.context_text('dialogue-mixed', "A CLERIC SPOTS YOU AND SCREAMS, 'THERE! THAT'S THE REASON THE GODS DENIED OUR CONVERSION! ATTACK THEM!'")
    assert t == 'A CLERIC SPOTS YOU AND SCREAMS.' and stripped
    assert 'ATTACK' not in t and "THAT'S" not in t
    # the apostrophe inside a word is not a quote: this narration survives whole
    t2, s2 = C.context_text('narration', "ALL OF THE DRACONIANS ARE SLAIN SAVE ONE, WHO RIPS A BOOK FROM A DEAD MAN'S HANDS.")
    assert "MAN'S HANDS" in t2 and not s2
    # control: dialogue that is ONLY speech leaves nothing to use
    assert C.context_text('dialogue-mixed', "'WELCOME. WILL YOU TRAIN?'")[0] is None


def test_context_text_drops_player_questions_slashes_and_truncates():
    t, _ = C.context_text('narration', 'A WOMAN APPROACHES FROM THE SHADOWS. / WILL YOU ALLOW LENORE TO REMAIN WITH THE PARTY? / SHE WAITS.')
    assert '?' not in t and '/' not in t and 'SHE WAITS.' in t
    long = ' '.join('SENTENCE NUMBER %d IS HERE.' % i for i in range(60))
    lt, _ = C.context_text('narration', long)
    assert len(lt) <= C.CONTEXT_MAX_CHARS and lt.endswith('.')
    assert C.context_text('narration', long, limit=10**6)[0] != lt                      # control: the limit is what shortens it


# ------------------------------------------------------------------ game_text_for
def _scene_tree(tmp_path, families):
    d = tmp_path / 'scene_text'
    d.mkdir()
    rec = lambda txt, kind, conf: dict(text=txt, kind=kind, confidence=conf, ecl_file='ECL1.DAX', ecl_block=5, ecl_offset=1,
                                       family_resolution='unique')
    pics = {fam: {str(bid): [rec(*r) for r in recs] for bid, recs in ids.items()} for fam, ids in families.items()}
    json.dump(dict(game='cok', pictures=pics), open(d / 'cok.json', 'w'))
    return str(d)


def _g(src, kind='scene', game='cok'):
    return dict(id='x', game=game, platform='amiga', source=src, kind=kind)


def test_game_text_by_block_id_ranks_narration_first(tmp_path):
    sd = _scene_tree(tmp_path, {'BIGPIC2': {116: [("'HELLO THERE FRIEND,' HE SAYS.", 'dialogue-mixed', 'high'),
                                                  ('YOU BREAK INTO A ROOM FILLED WITH DRACONIANS.', 'narration', 'medium')]}})
    gt = C.game_text_for(_g('renders/daa/CoK_BIGPIC1/BIGPIC1_116.png'), sd)
    assert gt['block_id'] == 116 and gt['families'] == ['BIGPIC2'] and not gt['ambiguous']
    assert [r['kind'] for r in gt['records']] == ['narration', 'dialogue-mixed']          # narration beats a higher-confidence dialogue
    assert gt['context']['text'] == 'YOU BREAK INTO A ROOM FILLED WITH DRACONIANS.' and gt['context']['kind'] == 'narration'
    assert gt['records'][0]['ecl'] == 'ECL1.DAX#5'


def test_ambiguous_family_is_flagged_and_never_a_context(tmp_path):
    txt = ('A LONG NARRATION ABOUT A DRAGON.', 'narration', 'high')
    sd = _scene_tree(tmp_path, {'PIC1': {23: [txt]}, 'PIC2': {23: [txt]}})
    gt = C.game_text_for(_g('renders/daa/CoK_PIC1/PIC1_023_f0.png', 'portrait'), sd)
    assert gt['ambiguous'] and gt['families'] == ['PIC1', 'PIC2'] and gt['context'] is None
    sd2 = _scene_tree(tmp_path / 'b' if (tmp_path / 'b').mkdir() is None else tmp_path, {'PIC1': {23: [txt]}})   # control: one family -> usable
    assert C.game_text_for(_g('renders/daa/CoK_PIC1/PIC1_023_f0.png', 'portrait'), sd2)['context']['text'].startswith('A LONG NARRATION')


def test_portrait_context_needs_narration_scene_accepts_stripped_dialogue(tmp_path):
    dlg = ("A GNOME PULLS YOU TO AN EXHIBIT. 'WELCOME TO THE HALL OF INNOVATION.'", 'dialogue-mixed', 'medium')
    sd = _scene_tree(tmp_path, {'BIGPIC1': {5: [dlg]}, 'PIC2': {9: [dlg]}})
    assert C.game_text_for(_g('renders/daa/CoK_BIGPIC1/BIGPIC1_005.png', 'scene'), sd)['context']['text'] == 'A GNOME PULLS YOU TO AN EXHIBIT.'
    assert C.game_text_for(_g('renders/daa/CoK_PIC2/PIC2_009_f0.png', 'portrait'), sd)['context'] is None   # an NPC speaking: not scene fact


def test_game_text_skips_other_games_titles_and_missing_json(tmp_path):
    sd = _scene_tree(tmp_path, {'BIGPIC1': {116: [('SOME NARRATION TEXT HERE.', 'narration', 'high')]}})
    assert C.game_text_for(_g('renders/hlib/BIGPIC/BIGPIC_set03_img001.png', game='dqk'), sd) is None
    assert C.game_text_for(_g('renders/amiga_cokdok/lbm/CoK_scrn1b.png'), sd) is None
    assert C.game_text_for(_g('renders/daa/CoK_BIGPIC1/BIGPIC1_999.png'), sd) is None          # id with no text
    assert C.game_text_for(_g('renders/daa/CoK_BIGPIC1/BIGPIC1_116.png'), str(tmp_path / 'nowhere')) is None


def test_curated_override_suppress_and_pick_record(tmp_path):
    sd = _scene_tree(tmp_path, {'BIGPIC2': {116: [('FIRST NARRATION TEXT HERE.', 'narration', 'high'),
                                                  ('SECOND NARRATION TEXT HERE.', 'narration', 'medium')]}})
    g = _g('renders/daa/CoK_BIGPIC1/BIGPIC1_116.png')
    g['game_text'] = C.game_text_for(g, sd)
    assert g['game_text']['context']['text'] == 'FIRST NARRATION TEXT HERE.'
    C.apply_context_override(g, {'game_context': 1})
    assert g['game_text']['context']['text'] == 'SECOND NARRATION TEXT HERE.' and g['game_text']['context']['chosen'] == 'curated'
    C.apply_context_override(g, {'game_context': False})
    assert g['game_text']['context'] is None and g['game_text']['context_override'] == 'suppressed'
    g2 = _g('renders/daa/CoK_BIGPIC1/BIGPIC1_116.png')
    g2['game_text'] = C.game_text_for(g2, sd)
    C.apply_context_override(g2, {'description': 'no override key'})                         # control: nothing changes without the key
    assert g2['game_text']['context']['text'] == 'FIRST NARRATION TEXT HERE.'


# ------------------------------------------------------------------ animation + overlay patches
def test_is_overlay_patch_by_role_and_by_preferred_frame():
    assert C.is_overlay_patch(dict(source='renders/hlib/PICA/PICA_set04_img007.png'))
    assert C.is_overlay_patch(dict(source='renders/hlib/PICA/PICA_set13_img003.png'))
    assert C.is_overlay_patch(dict(source='renders/x/y.png', animation=dict(source_frame_role='overlay-patch')))
    assert not C.is_overlay_patch(dict(source='renders/hlib/PICA/PICA_set03_img001.png'))       # controls
    assert not C.is_overlay_patch(dict(source='renders/hlib/PICA/PICA_set04_img001.png'))


def _grp(i, score, **kw):
    g = dict(id=i, game='dqk', platform='dos', source='renders/hlib/PICA/%s.png' % i, kind='portrait', score=score, score_reason='',
             warnings=[], alternates=[], native_size=[88, 88])
    g.update(kw)
    return g


def test_propose_never_picks_overlay_patch_and_takes_the_next_item():
    groups = [_grp('a', 9.0, source='renders/hlib/PICA/PICA_set04_img007.png'), _grp('b', 5.0), _grp('c', 4.0)]
    out = C.propose(groups, quota={'dqk': 2})
    assert [g['id'] for g in out if g.get('proposed_batch02')] == ['b', 'c']                    # the higher-scoring patch is skipped
    groups2 = [_grp('a', 9.0), _grp('b', 5.0), _grp('c', 4.0)]                                   # control: same score, not a patch
    assert [g['id'] for g in C.propose(groups2, quota={'dqk': 2}) if g.get('proposed_batch02')] == ['a', 'b']
    g3 = [_grp('a', 9.0, animation=dict(source_frame_role='overlay-patch')), _grp('b', 5.0)]
    assert [g['id'] for g in C.propose(g3, quota={'dqk': 1}) if g.get('proposed_batch02')] == ['b']


def _anim(**kw):
    a = dict(frames=4, changed_fraction=0.02, bbox=[1, 2, 3, 4], bbox_fraction=0.1, kind='region-loop')
    a.update(kw)
    return a


def test_animation_for_fields_and_preview_frames(tmp_path):
    root = tmp_path / 'repo'
    d = root / 'renders' / 'daa' / 'CoK_PIC1'
    d.mkdir(parents=True)
    for k in range(4):
        Image.new('RGB', (8, 8), (k * 40, 0, 0)).save(d / ('PIC1_023_f%d.png' % k))
    g = dict(id='c1', game='cok', platform='amiga', source='renders/daa/CoK_PIC1/PIC1_023_f0.png')
    a = C.animation_for(g, {'c1': _anim(dos_twin=dict(key='PIC:1'))}, str(root / 'renders'))
    assert (a['frames'], a['changed_fraction'], a['bbox'], a['kind'], a['dos_twin']) == (4, 0.02, [1, 2, 3, 4], 'region-loop', dict(key='PIC:1'))
    assert a['preview_frames'] == ['renders/daa/CoK_PIC1/PIC1_023_f%d.png' % k for k in range(4)]
    os.remove(d / 'PIC1_023_f3.png')                                                              # control: a missing frame -> badge only
    assert 'preview_frames' not in C.animation_for(g, {'c1': _anim()}, str(root / 'renders'))
    pool = dict(id='p', game='pool', platform='amiga', source='renders/pool_amiga/pic/pic_0_f0.png')
    assert 'preview_frames' not in C.animation_for(pool, {'p': _anim()}, str(root / 'renders'))   # Pool f1+ are raw XOR deltas
    assert C.animation_for(g, {}, str(root / 'renders')) is None


def test_stage_site_copies_animation_frames(tmp_path):
    root = tmp_path / 'repo'
    (root / 'renders' / 'daa').mkdir(parents=True)
    rels = []
    for k in range(2):
        rel = 'renders/daa/f%d.png' % k
        Image.new('RGB', (8, 8)).save(root / rel)
        rels.append(rel)
    out = tmp_path / 'cand'
    out.mkdir()
    g = dict(id='z', source=rels[0], proposed_batch02=True, alternates=[], animation=dict(preview_frames=rels))
    json.dump(dict(candidates=[g]), open(out / 'candidates.json', 'w'))
    site = tmp_path / 'site'
    C.stage_site(str(site), str(out), str(root))
    assert sorted(os.listdir(site / 'restyle' / 'proposal' / 'frames')) == ['z_f0.png', 'z_f1.png']


# ------------------------------------------------------------------ webpack: GAME CONTEXT + animation
def _item(**kw):
    e = dict(id='i', kind='scene', stem='001_i', description='A dragon over a castle.')
    e.update(kw)
    return e


def test_prompt_carries_game_context_with_authority_rule():
    e = _item(game_context=dict(text='THE TOWER PITCHES FORWARD.', kind='narration', speech_removed=False))
    p = W.build_prompt(e)
    assert '[GAME CONTEXT]' in p and 'THE TOWER PITCHES FORWARD.' in p
    assert 'authority' in p and 'Do NOT draw any of this text' in p
    assert p.index('[CONTENT]') < p.index('[GAME CONTEXT]') < p.index('[CONSTRAINTS]')
    assert '[GAME CONTEXT]' not in W.build_prompt(_item())                                      # control: no text -> no block
    assert '[GAME CONTEXT]' not in W.build_prompt(_item(game_context=dict(text='', kind='narration')))


def test_prompt_labels_removed_speech_and_neutralises_quotes():
    e = _item(game_context=dict(text='HE SAYS "HI".', kind='dialogue-mixed', speech_removed=True))
    p = W.build_prompt(e)
    assert 'quoted character speech omitted' in p
    assert 'reads: "HE SAYS \'HI\'."' in p                                                          # no raw double quote inside the quote
    assert 'omitted' not in W.build_prompt(_item(game_context=dict(text='PLAIN.', kind='narration', speech_removed=False)))


def test_animation_block_small_loop_vs_static_first():
    small = W.animation_block(_anim(preview_frames=['f0', 'f1', 'f2', 'f3']))
    assert small['plan'] == 'small-loop' and small['restyle'] == 'frame 0 only'
    assert [x['index'] for x in small['extra_frames']] == [1, 2, 3] and small['extra_frames'][0]['original'] == 'f1'
    assert all(x['status'] == 'not generated' for x in small['extra_frames'])
    lr = W.animation_block(_anim(kind='large-region', changed_fraction=0.012, bbox_fraction=0.4))
    assert lr['plan'] == 'small-loop'
    assert W.animation_block(_anim(kind='large-region', changed_fraction=0.2, bbox_fraction=0.4))['plan'] == 'static-first'   # too much changes
    assert W.animation_block(_anim(kind='large-region', changed_fraction=0.05, bbox_fraction=0.7))['plan'] == 'static-first'  # bbox too wide
    st = W.animation_block(_anim(kind='scattered', changed_fraction=0.03))
    assert st['plan'] == 'static-first' and st['extra_frames'] == [] and 'static' in st['note']
    assert W.animation_block(_anim(frames=1)) is None and W.animation_block(None) is None


def _prop_tree(tmp_path, monkeypatch):
    root = tmp_path / 'repo'
    cdir = root / 'renders' / 'imggen' / 'candidates'
    cdir.mkdir(parents=True)
    monkeypatch.setattr(W, 'ROOT', str(root))
    monkeypatch.setattr(W, 'WEB', str(root / 'renders' / 'imggen' / 'webpack'))
    rng = np.random.default_rng(3)
    cands = []
    for i, (kind, has_ctx, anim) in enumerate([('scene', True, None), ('portrait', False, _anim(frames=3))]):
        rel = 'renders/p%d.png' % i
        Image.fromarray(rng.integers(0, 255, (40, 88, 3), dtype=np.uint8)).save(root / rel)
        c = dict(id='c%d' % i, kind=kind, source=rel, native_size=[88, 40], description='picture %d' % i, prompt_notes='note',
                 proposed_batch02=True, rank=i + 1)
        if has_ctx:
            c['game_text'] = dict(block_id=7, ambiguous=False, records=[dict(text='X', kind='narration')],
                                  context=dict(text='THE DRAGON ARRIVES.', kind='narration', speech_removed=False))
        if anim:
            c['animation'] = anim
        cands.append(c)
    json.dump(dict(candidates=cands), open(cdir / 'candidates.json', 'w'))
    return root


def test_proposal_manifest_and_package_end_to_end(tmp_path, monkeypatch):
    _prop_tree(tmp_path, monkeypatch)
    out = str(tmp_path / 'm.json')
    items = W.main(['proposal-manifest', '--all-proposed', '--out', out]) or json.load(open(out))
    items = json.load(open(out))
    assert [e['id'] for e in items] == ['c0', 'c1'] and items[0]['kind'] == 'scene' and items[1]['kind'] == 'face'
    assert items[0]['game_context']['text'] == 'THE DRAGON ARRIVES.' and 'game_context' not in items[1]
    assert items[1]['animation']['plan'] == 'small-loop' and 'animation' not in items[0]
    assert items[0]['description'] == 'picture 0 note'
    W.main(['make', '--manifest', out, '--batch', 'pp'])
    bdir = os.path.join(W.WEB, 'pp')
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    assert 'GAME CONTEXT' in open(os.path.join(bdir, man['items'][0]['prompt']), encoding='utf-8').read()
    assert 'GAME CONTEXT' not in open(os.path.join(bdir, man['items'][1]['prompt']), encoding='utf-8').read()
    assert man['items'][1]['animation']['restyle'] == 'frame 0 only'                              # carried into manifest.json
    ins = open(os.path.join(bdir, 'INSTRUCTIONS.md'), encoding='utf-8').read()
    assert 'Animerede originaler' in ins and 'Spillets tekst' in ins
    assert 'Animerede' not in open(os.path.join(bdir, 'INSTRUCTIONS.md'), encoding='utf-8').read().split('## Spillets tekst')[0]


def test_proposal_manifest_unknown_id_fails(tmp_path, monkeypatch):
    _prop_tree(tmp_path, monkeypatch)
    with pytest.raises(SystemExit):
        W.main(['proposal-manifest', 'nope', '--out', str(tmp_path / 'x.json')])


# ------------------------------------------------------------------ live data
@pytest.mark.skipif(not os.path.exists(LIVE), reason='local renders / candidates.json not present')
class TestLive:
    def cands(self):
        return json.load(open(LIVE, encoding='utf-8'))['candidates']

    def test_every_candidate_has_an_animation_record_and_nine_proposed_are_animated(self):
        cs = self.cands()
        assert all('animation' in c for c in cs)
        anim = [c for c in cs if c.get('proposed_batch02') and (c['animation'].get('frames') or 1) > 1]
        assert len(anim) == 9
        for c in anim:
            a = c['animation']
            assert a['changed_fraction'] is not None and a['kind'] and 'bbox' in a

    def test_no_overlay_patch_is_proposed(self):
        cs = self.cands()
        assert not [c['id'] for c in cs if c.get('proposed_batch02') and C.is_overlay_patch(c)]
        assert not any(c['id'] in ('dqk_dos_hlib_pica_pica_set04_img007', 'dqk_dos_hlib_pica_pica_set13_img003')
                       for c in cs if c.get('proposed_batch02'))
        assert sum(1 for c in cs if c.get('proposed_batch02')) == 60                              # the count did not shrink

    def test_game_text_only_on_cok_dok_and_never_quotes_speech_into_context(self):
        for c in self.cands():
            gt = c.get('game_text')
            if not gt:
                continue
            assert c['game'] in ('cok', 'dok')
            ctx = gt.get('context')
            if ctx:
                assert not gt['ambiguous'] and ctx['kind'] in ('narration', 'dialogue-mixed')
                assert "'" not in ctx['text'].replace("'S ", '').replace("N'T", '') or not ctx['speech_removed']
                assert '?' not in ctx['text']

    def test_proposed_context_count_and_curated_overrides(self):
        cs = {c['id']: c for c in self.cands()}
        prop = [c for c in cs.values() if c.get('proposed_batch02')]
        assert sum(1 for c in prop if (c.get('game_text') or {}).get('context')) >= 15
        assert cs['dok_amiga_daa_dok_pic2_pic2_093_f0']['game_text']['context'] is None                  # curated: potion merchant
        assert 'DRACONIANS AND HUMANS' in cs['cok_amiga_daa_cok_bigpic1_bigpic1_116']['game_text']['context']['text']
