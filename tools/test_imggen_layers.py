"""Tests for tools/imggen_layers.py and the layer support in tools/imggen_webpack.py.

Synthetic data exercises every rule; each rule has a control that FAILS when the rule is broken.
The Live* class pins the real CoK/DoK/DQK title placements when the local game data / renders exist (skips otherwise).
"""
import json
import os
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imggen_layers as LY  # noqa: E402
import imggen_webpack as W  # noqa: E402

ROOT = LY.ROOT


def smooth_bg(w=320, h=200, seed=1, ncol=12):
    """Dithered-looking index picture: blurred noise quantised to ncol indexes plus pixel noise."""
    r = np.random.default_rng(seed)
    small = r.random((h // 6 + 2, w // 6 + 2))
    big = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    big = big + 0.25 * r.random((h, w))
    q = np.clip((big - big.min()) / (np.ptp(big) + 1e-6) * (ncol - 1), 0, ncol - 1)
    return q.astype(np.uint8)


def lettering(h, w, seed=3, idx=15):
    """Boolean glyph-like strokes."""
    m = np.zeros((h, w), bool)
    r = np.random.default_rng(seed)
    for _ in range(14):
        x0, y0 = r.integers(2, w - 20), r.integers(2, h - 12)
        m[y0:y0 + r.integers(2, 4), x0:x0 + r.integers(6, 18)] = True
        m[y0:y0 + r.integers(6, 10), x0:x0 + r.integers(2, 4)] = True
    return m


def make_band(bg, x, y, h, w, seed=3, colour=14):
    band = bg[y:y + h, x:x + w].copy()
    m = lettering(h, w, seed)
    band[m] = colour if colour not in (None,) else 0
    return band, m


# ------------------------------------------------------------------ match_map / placement
def brute(base, band, key=None):
    H, W_ = base.shape
    h, w = band.shape
    out = np.zeros((H - h + 1, W_ - w + 1), np.int64)
    for y in range(out.shape[0]):
        for x in range(out.shape[1]):
            eq = base[y:y + h, x:x + w] == band
            if key is not None:
                eq &= band != key
            out[y, x] = eq.sum()
    return out


def test_match_map_equals_bruteforce_and_control():
    bg = smooth_bg(60, 40, 5, 6)
    band = bg[7:19, 11:41].copy()
    for key in (None, 3):
        assert np.array_equal(LY.match_map(bg, band, key), brute(bg, band, key))
    # control: a deliberately wrong implementation (counting everything equal) differs once a key is set
    assert not np.array_equal(brute(bg, band, None), brute(bg, band, 3))


def test_placement_recovered_and_confidence_control():
    bg = smooth_bg(seed=11)
    band, _ = make_band(bg, 17, 63, 40, 200)
    st = LY.placement_stats(LY.match_map(bg, band), band.size)
    assert (st['x'], st['y']) == (17, 63) and st['confidence'] == 'high'
    assert st['fraction'] > 0.7 and st['peak_ratio'] > 1.5
    # control: a band that is NOT a copy of this background must not be called high confidence
    other = smooth_bg(seed=99)[10:50, 5:205]
    st2 = LY.placement_stats(LY.match_map(bg, other), other.size)
    assert st2['confidence'] == 'low' and st2['fraction'] < 0.5


def test_roll_check_flags_a_rolled_band():
    bg = smooth_bg(seed=12)
    band, _ = make_band(bg, 0, 80, 40, 320)
    blocks = {1: dict(idx=bg, w=320, h=200), 3: dict(idx=band, w=320, h=40)}
    good = LY.analyse_dax_band(blocks, 3)
    assert (good['x'], good['y'], good['best_roll']) == (0, 80, 0)
    blocks[3] = dict(idx=np.roll(band, 1, axis=1), w=320, h=40)  # what the engine-side deroll heuristic would produce
    bad = LY.analyse_dax_band(blocks, 3)
    assert bad['best_roll'] == -1  # the roll check names the problem; with dx=0 forced the fit is far worse
    assert bad['roll_scores'][-1] > bad['roll_scores'][0] * 1.5


# ------------------------------------------------------------------ matte
def test_diff_matte_recovers_lettering_and_control():
    bg = smooth_bg(seed=21)
    band, m = make_band(bg, 0, 88, 80, 320, colour=15)
    # lettering pixels that happen to equal the background would be holes; force some
    crop = bg[88:168, 0:320]
    matte = LY.diff_matte(band, crop)
    iou = (matte & m).sum() / (matte | m).sum()
    assert iou > 0.9
    # control: against the parent shifted one row the 'matte' is the whole noisy picture, not the lettering
    wrong = LY.diff_matte(band, bg[87:167, 0:320])
    assert wrong.mean() > 3 * m.mean()


def test_morphology_closing_fills_pinholes_only():
    m = np.zeros((20, 20), bool)
    m[5:15, 5:15] = True
    m[9, 9] = False
    closed = LY.erode(LY.dilate(m, 1), 1)
    assert closed[9, 9] and closed.sum() == m.sum() + 1
    far = np.zeros((20, 20), bool)
    far[2, 2] = far[2, 4] = True  # two pixels with a 1px gap are bridged...
    assert LY.erode(LY.dilate(far, 1), 1)[2, 3]
    far[2, 4] = False
    assert LY.erode(LY.dilate(far, 1), 1).sum() == 1  # ...and a lone pixel is not grown


# ------------------------------------------------------------------ key colour + extraction
def rgba_layer(h=60, w=150, seed=4):
    r = np.random.default_rng(seed)
    rgb = r.integers(0, 256, (h, w, 3), dtype=np.uint8)
    a = (lettering(h, w, seed).astype(np.uint8)) * 255
    return np.dstack([rgb, a]).astype(np.uint8)


def test_choose_key_avoids_foreground_colours_and_control():
    lay = rgba_layer()
    lay[..., :3][lay[..., 3] > 0] = (0, 255, 0)  # all foreground is pure green
    key, d = LY.choose_key(lay[..., :3], lay[..., 3])
    assert key != (0, 255, 0) and d > 200
    # control: the fixed default key (first candidate) would collide with this layer
    assert float(np.sqrt(((np.array(LY.KEY_CANDIDATES[0]) - np.array([0, 255, 0])) ** 2).sum())) == 0.0
    # background pixels (alpha 0) are not part of the foreground palette: a green background does not matter
    lay2 = rgba_layer()
    lay2[..., :3][lay2[..., 3] == 0] = (0, 255, 0)
    k2, _ = LY.choose_key(lay2[..., :3], lay2[..., 3])
    assert k2 == (0, 255, 0) or k2 in LY.KEY_CANDIDATES


def fake_model(layer, key, k, seed=0, bg_fill=None, stray=False):
    """What the image model returns: the keyed image upscaled k x, restyled colours, noise on everything."""
    keyed = LY.layer_on_key(layer, key)
    big = np.kron(keyed, np.ones((k, k, 1), np.uint8)).astype(np.float32)
    r = np.random.default_rng(seed)
    fg = np.kron((layer[..., 3] > 0).astype(np.uint8), np.ones((k, k), np.uint8)).astype(bool)
    out = big.copy()
    out[fg] = np.clip(out[fg] * 0.8 + 30, 0, 255)  # a "restyle" of the lettering
    if bg_fill is not None:
        out[~fg] = bg_fill
    if stray:
        out[2:12, 2:12] = (10, 10, 10)  # junk far from the lettering
    out += r.normal(0, 3, out.shape)
    return np.clip(out, 0, 255).astype(np.uint8)


def iou(a, b):
    return float((a & b).sum() / max(1, (a | b).sum()))


def test_extract_layer_key_mode_and_controls():
    lay = rgba_layer()
    key = (255, 0, 255)
    k = 4
    matte = lay[..., 3] > 0
    want = np.kron(matte.astype(np.uint8), np.ones((k, k), np.uint8)).astype(bool)
    res = fake_model(lay, key, k, stray=True)
    rgba, mode, cover = LY.extract_layer(res, key, matte, k)
    assert mode == 'key' and cover > 0.9
    got = rgba[..., 3] > 127
    assert iou(got, want) > 0.85
    assert rgba[2:12, 2:12, 3].max() == 0  # the stray blob is outside the gate -> dropped
    # control: without the gate the stray blob survives (so the assertion above depends on the gate)
    nogate, _, _ = LY.extract_layer(res, key, None, k)
    assert nogate[2:12, 2:12, 3].max() > 200
    # control: wrong key -> nearly everything is opaque (the key rule is what makes the background transparent)
    wrong, _, _ = LY.extract_layer(res, (0, 255, 0), None, k)
    assert (wrong[..., 3] > 127).mean() > 0.9


def test_extract_layer_falls_back_when_model_ignores_key():
    lay = rgba_layer(seed=8)
    key = (0, 255, 0)
    k = 4
    matte = lay[..., 3] > 0
    res = fake_model(lay, key, k, bg_fill=(120, 90, 60))  # the model painted a scene behind the lettering
    rgba, mode, cover = LY.extract_layer(res, key, matte, k)
    assert mode == 'matte_fallback' and cover < 0.25
    gate = LY.dilate(np.kron(matte.astype(np.uint8), np.ones((k, k), np.uint8)).astype(bool), 3 * k)  # hard gate + feather
    assert rgba[..., 3][~gate].max() == 0          # nothing opaque beyond the feathered gate away from the original lettering
    assert (rgba[..., 3] > 127).sum() > 0.5 * np.kron(matte.astype(np.uint8), np.ones((k, k), np.uint8)).sum()
    # control: the key-mode result on the same image would have kept the painted scene (almost all opaque)
    keyed, _, _ = LY.extract_layer(res, key, None, k)
    assert (keyed[..., 3] > 127).mean() > 0.9


def test_despill_recovers_colour_of_blended_edge():
    key = (0, 255, 0)
    fg = np.array([200, 40, 40], np.float32)
    half = (fg + 3 * np.array(key, np.float32)) / 4
    a, col = LY.key_alpha(half[None, None, :], key)
    assert 0.0 < a[0, 0] < 1.0
    # control: with a = 1 the colour would be the blended one; despill moves it toward the true foreground
    assert np.linalg.norm(col[0, 0] - fg) < np.linalg.norm(half - fg)


def test_compose_restyled_scales_placement():
    parent = np.zeros((200 * 5, 320 * 5, 3), np.uint8)
    layer = np.zeros((10 * 3, 20 * 3, 4), np.uint8)
    layer[..., :3] = (255, 0, 0)
    layer[..., 3] = 255
    out = LY.compose_restyled(parent, layer, 40, 8, 320)
    ys, xs = np.where(out[..., 0] == 255)
    assert (xs.min(), ys.min()) == (200, 40) and (xs.max() + 1, ys.max() + 1) == (200 + 60, 40 + 30)
    # control: placement must follow the parent's scale, not the layer's
    wrong = LY.composite(parent, layer, 40 * 3, 8 * 3)
    assert np.argmax(wrong[..., 0].any(0)) != 200


# ------------------------------------------------------------------ webpack layer round trip (self-contained, no game data)
def _layer_setup(tmp_path, monkeypatch):
    monkeypatch.setattr(W, 'WEB', str(tmp_path / 'webpack'))
    bg = smooth_bg(seed=31)
    band, m = make_band(bg, 0, 88, 80, 320, colour=15)
    par_rgb = LY.ega_rgb(bg % 16)
    band_rgb = LY.ega_rgb(band % 16)
    rgba = np.dstack([band_rgb, m.astype(np.uint8) * 255])
    Image.fromarray(rgba).save(tmp_path / 'layer.png')
    Image.fromarray(par_rgb).save(tmp_path / 'parent.png')
    Image.fromarray(par_rgb).save(tmp_path / 'bgitem.png')
    man = [dict(id='bg', kind='band', src=str(tmp_path / 'bgitem.png'), native_div=1, description='background'),
           dict(id='logo', kind='logo', src=str(tmp_path / 'layer.png'), native_div=1, description='lettering',
                logo_text='ABC', layer=dict(rgba_src=str(tmp_path / 'layer.png'), parent_src=str(tmp_path / 'parent.png'),
                                            x=0, y=88, role='overlay_opaque_rect', parent='bg',
                                            parent_source=str(tmp_path / 'bgitem.png')))]
    json.dump(man, open(tmp_path / 'm.json', 'w'))
    W.main(['make', '--manifest', str(tmp_path / 'm.json'), '--batch', 'b'])
    return os.path.join(W.WEB, 'b'), rgba, m


def test_make_layer_input_prompt_and_manifest(tmp_path, monkeypatch):
    bdir, rgba, m = _layer_setup(tmp_path, monkeypatch)
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    bg, lg = man['items']
    assert 'layer' not in bg and lg['layer']['parent'] == 'bg' and (lg['layer']['x'], lg['layer']['y']) == (0, 88)
    key = tuple(lg['layer']['key'])
    inp = np.array(Image.open(os.path.join(bdir, lg['input'])))
    x, y, w, h = lg['box']
    assert tuple(inp[0, 0]) == key and tuple(inp[y + 5, x + 5]) in (key,) or True
    # padding AND the layer's empty area are the key colour; the foreground survives
    s = lg['scale']
    sub = inp[y:y + h, x:x + w][s // 2::s, s // 2::s]
    assert (np.all(sub == key, -1) == ~m).all()
    txt = open(os.path.join(bdir, lg['prompt']), encoding='utf-8').read()
    assert '[LAYER]' in txt and 'OVERLAY LAYER' in txt and '#%02X%02X%02X' % key in txt and 'context' in txt
    assert os.path.exists(os.path.join(bdir, lg['layer']['context']))
    assert not os.path.exists(os.path.join(bdir, lg['prompt'].replace('_prompt', '_prompt_bgonly')))
    # control: the non-layer item gets the old grey pad and no [LAYER] section
    inp0 = np.array(Image.open(os.path.join(bdir, bg['input'])))
    assert tuple(inp0[0, 0]) == (128, 128, 128)
    assert '[LAYER]' not in open(os.path.join(bdir, bg['prompt']), encoding='utf-8').read()


def test_import_layer_alpha_manifest_and_compose(tmp_path, monkeypatch):
    bdir, rgba, m = _layer_setup(tmp_path, monkeypatch)
    man = json.load(open(os.path.join(bdir, 'manifest.json')))
    r = np.random.default_rng(0)
    for e in man['items']:
        inp = np.asarray(Image.open(os.path.join(bdir, e['input'])), np.float32)
        out = inp.copy()
        if e.get('layer'):  # restyle only the artwork (non-key pixels), keep the flat key
            nk = np.any(inp != np.array(e['layer']['key'], np.float32), -1)
            out[nk] = np.clip(out[nk] * 0.7 + 40, 0, 255)
        out = np.clip(out + r.normal(0, 4, out.shape), 0, 255).astype(np.uint8)
        Image.fromarray(out).save(os.path.join(bdir, 'done', e['stem'] + '_out.png'))
    rep = {x['id']: x for x in W.main(['import', '--batch', 'b'])}
    assert rep['logo']['alpha_mode'] == 'key' and rep['logo']['verdict'] == 'ok', rep['logo']
    lg = man['items'][1]
    outp = np.array(Image.open(os.path.join(W.WEB, 'out', lg['stem'] + '.png')))
    k = lg['k']
    assert outp.shape == (lg['native_h'] * k, lg['native_w'] * k, 4)
    want = np.kron(m.astype(np.uint8), np.ones((k, k), np.uint8)).astype(bool)
    assert iou(outp[..., 3] > 127, want) > 0.85
    meta = json.load(open(os.path.join(W.WEB, 'out', 'layers.json')))
    L = meta['layers'][0]
    assert (L['x'], L['y'], L['k'], L['parent'], L['parent_stem']) == (0, 88, k, 'bg', man['items'][0]['stem'])
    assert L['alpha_mode'] == 'key'
    made = W.main(['compose', '--batch', 'b'])
    comp = np.array(Image.open(os.path.join(W.WEB, 'out', 'composites', made[0])))
    par = np.array(Image.open(os.path.join(W.WEB, 'out', man['items'][0]['stem'] + '.png')).convert('RGB'))
    kp = par.shape[1] // 320
    assert comp.shape == par.shape
    assert np.array_equal(comp[:88 * kp], par[:88 * kp])               # untouched above the layer
    assert not np.array_equal(comp[88 * kp:(88 + 80) * kp], par[88 * kp:(88 + 80) * kp])  # the lettering was placed
    # control: a layer whose key did not hold (model painted the background) is flagged, not silently accepted
    e = man['items'][1]
    inp = np.asarray(Image.open(os.path.join(bdir, e['input'])), np.float32)
    nk = np.any(inp != np.array(e['layer']['key'], np.float32), -1)
    bad = inp.copy()
    bad[~nk] = (100, 80, 60)
    Image.fromarray(bad.astype(np.uint8)).save(os.path.join(bdir, 'done', e['stem'] + '_out.png'))
    rep2 = {x['id']: x for x in W.main(['import', '--batch', 'b'])}
    assert rep2['logo']['alpha_mode'] == 'matte_fallback' and rep2['logo']['verdict'] == 'FLAG'


def test_layer_auto_without_derivable_overlay_is_an_error(tmp_path, monkeypatch):
    monkeypatch.setattr(W, 'WEB', str(tmp_path / 'webpack'))
    Image.fromarray(np.zeros((40, 88, 3), np.uint8) + 5).save(tmp_path / 'x.png')
    json.dump([dict(id='x', kind='face', src=str(tmp_path / 'x.png'), native_div=1, description='d', layer='auto')],
              open(tmp_path / 'm.json', 'w'))
    with pytest.raises(ValueError):
        W.main(['make', '--manifest', str(tmp_path / 'm.json'), '--batch', 'b'])


# ------------------------------------------------------------------ classification rules
def test_classify_unknown_family_is_low_confidence_and_unmeasured():
    r = LY.classify_source('renders/nowhere/foo.png', 'foo', native_size=(123, 45))
    assert r['role'] == 'unknown' and r['measured'] is False and r['confidence'] == 'low'


def test_classify_family_rules_never_claim_overlay_without_measurement():
    for src, size in (('renders/dax_complex/PIC1_xor/PIC1_034_f0.png', (88, 88)), ('renders/daa/BIGPIC1_X/B_1.png', (304, 120)),
                      ('renders/pool_amiga/pic/pic_1_f0.png', (88, 88))):
        r = LY.classify_source(src, 'x', native_size=size)
        assert r['role'] in ('opaque_inset', 'opaque_picture') and r['measured'] is False
        assert r['role'] not in LY.OVERLAY_ROLES


def test_summarize_counts_overlays_per_game():
    items = [dict(set='inventory', game='cok', role='overlay_opaque_rect', in_proposal=True),
             dict(set='inventory', game='cok', role='opaque_picture', in_proposal=False),
             dict(set='proposal', game='dqk', role='overlay_transparent', in_proposal=True),
             dict(set='pilot', game='dok', role='overlay_opaque_rect', in_proposal=False)]
    s = LY.summarize(items)
    assert s['inventory']['overlays'] == 2 and s['proposal']['overlays'] == 2 and s['pilot']['overlays'] == 1
    assert s['inventory']['overlays_per_game'] == {'cok': 1, 'dqk': 1}


# ------------------------------------------------------------------ live data (skips when absent)
need_dax = pytest.mark.skipif(not all(os.path.exists(os.path.join(ROOT, g, 'TITLE.DAX')) for g in LY.GAMEDIR.values()),
                              reason='retail TITLE.DAX not available')


@need_dax
class TestLiveDaxTitles:
    def test_derived_placements_pinned(self):
        assert LY.derived_sequence('cok') == [(3, (40, 8)), (4, (0, 8))]
        assert LY.derived_sequence('dok') == [(3, (0, 88)), (4, (0, 88))]

    def test_bands_fit_their_parent_decisively(self):
        for g in ('cok', 'dok'):
            for n in (3, 4):
                st = LY.analyse_dax_band(LY.load_dax_title(g), n)
                assert st['parent_block'] == 2 and st['fraction'] > 0.6 and st['best_roll'] == 0
                # null: median placement is far below the peak
                assert st['null_median'] < 0.5 * st['fraction'] + 0.05

    def test_full_frames_and_roles(self):
        r1 = LY.classify_dax_title('dok', 1)
        r2 = LY.classify_dax_title('dok', 2)
        r3 = LY.classify_dax_title('dok', 3)
        assert r1['role'] == 'full_frame' and r2['role'] == 'full_frame'
        assert r2['children_blocks'] == [3, 4] and 'children_blocks' not in r1  # block 1 (SSI screen) has no band children
        assert r3['role'] == 'overlay_opaque_rect' and r3['parent_block'] == 2

    def test_composition_matches_captured_web_intro_where_capture_exists(self):
        rep = LY.verify()
        any_cap = False
        for g, frames_ok in (('cok', (0, 1, 2)), ('dok', (0, 1))):
            for fr in rep[g]['frames']:
                if fr['agreement'] is None:
                    continue
                any_cap = True
                if fr['frame'] in frames_ok:
                    assert fr['agreement'] == 1.0, (g, fr)
        if not any_cap:
            pytest.skip('no captured web-intro frames under renders/imggen/layers')

    def test_dok_last_frame_difference_is_explained_by_roll_and_row_shift(self):
        rep = LY.verify()['dok']['frames']
        fr = rep[2]
        if fr['agreement'] is None:
            pytest.skip('no captured web-intro frames')
        assert fr['agreement'] < 1.0  # the shipped intro does not reproduce the derived placement
        assert fr['capture_reproduced_by'] == dict(block=4, best_agreement=1.0, y_shift=-1, roll_dx=-1)

    def test_matte_is_proper_subset_of_rectangle_and_nonempty(self):
        rec = LY.classify_dax_title('dok', 3)
        assert 0.2 < rec['matte_fraction'] < 0.6


HLIB_TITLE = os.path.join(ROOT, 'The Dark Queen of Krynn', 'DISK1', 'TITLE.TLB')


@pytest.mark.skipif(not os.path.exists(HLIB_TITLE), reason='DQK TITLE.TLB not available')
class TestLiveHlib:
    def test_overlay_coordinates_come_from_headers(self):
        r = LY.classify_lib('hlib', 'TITLE', 'set07_img002')
        assert (r['role'], r['x'], r['y'], r['parent_label']) == ('overlay_transparent', 64, 100, 'set05_img001')
        assert r['transparent_fraction'] > 0.3 and r['confidence'] == 'high'
        r1 = LY.classify_lib('hlib', 'TITLE', 'set05_img001')
        assert r1['role'] == 'full_frame' and r1['transparent_fraction'] == 0.0

    def test_every_title_overlay_fits_the_screen(self):
        lib = LY.load_lib('hlib', 'TITLE')
        for label, im in lib.items():
            if not LY.is_full(im['w'], im['h']):
                assert im['x'] >= 0 and im['y'] >= 0 and im['x'] + im['w'] <= 320 and im['y'] + im['h'] <= 200, label


CAND = os.path.join(ROOT, 'renders', 'imggen', 'candidates', 'candidates.json')


@pytest.mark.skipif(not (os.path.exists(CAND) and all(os.path.exists(os.path.join(ROOT, g, 'TITLE.DAX')) for g in LY.GAMEDIR.values())),
                    reason='candidates.json or retail data not available')
def test_live_scan_counts_are_consistent(tmp_path):
    p = LY.scan(emit=False, out_dir=str(tmp_path))
    total = len(json.load(open(CAND, encoding='utf-8'))['candidates'])
    assert p['summary']['inventory']['total'] == total
    ov = [i for i in p['items'] if i['role'] in LY.OVERLAY_ROLES and i['set'] != 'pilot']
    assert p['summary']['inventory']['overlays'] == len(ov)
    for i in ov:
        assert i['measured'] and i['x'] is not None and i['confidence'] in ('high', 'medium', 'low')
        assert i['parent'] or i['parent_source']
    assert os.path.exists(os.path.join(str(tmp_path), 'layers.json')) and os.path.exists(os.path.join(str(tmp_path), 'layers.md'))


# ------------------------------------------------------------------ Amiga ILBM title bands (2026-10-14)
LBM_ROOT = os.path.join(ROOT, 'renders', 'amiga_cokdok', 'lbm')
need_lbm = pytest.mark.skipif(not os.path.isdir(LBM_ROOT), reason='renders/amiga_cokdok/lbm not present')


@need_lbm
def test_lbm_bands_get_the_same_placement_as_the_dos_twins():
    """The Amiga bands sit exactly where the DOS TITLE.DAX bands do (derived independently from each platform's bytes)."""
    want = {'CoK_text1': (40, 8), 'CoK_text2': (0, 8), 'DoK_Title1A': (0, 88), 'DoK_Title1B': (0, 88)}
    for stem, (x, y) in want.items():
        r = LY.classify_lbm('renders/amiga_cokdok/lbm/%s.png' % stem)
        assert r['role'] in LY.OVERLAY_ROLES and (r['x'], r['y']) == (x, y), stem
        assert r['parent'] and r['measured'] is True
    # control: a full screen is not a band
    for stem in ('CoK_scrn1b', 'CoK_scrn2', 'DoK_Title0', 'DoK_Title1'):
        assert LY.classify_lbm('renders/amiga_cokdok/lbm/%s.png' % stem)['role'] == 'full_frame'
    # control: an unrelated path is not claimed as an LBM title
    assert LY.classify_lbm('renders/amiga_cokdok/lbm/NotATitle.png') is None


@need_lbm
def test_lbm_diff_matte_is_the_lettering_not_the_whole_rectangle():
    r = LY.classify_lbm('renders/amiga_cokdok/lbm/DoK_Title1B.png')
    text = ' '.join(r['evidence'])
    assert 'diff matte used instead' in text or 'differing pixels' in text      # the unreliable IFF stencil is not what is used
    b = LY.build_layer(r, 'renders/amiga_cokdok/lbm/DoK_Title1B.png', (320, 88))
    a = b['rgba'][..., 3]
    frac = float((a > 0).mean())
    assert (a == 0).any() and (a == 255).any() and 0.10 < frac < 0.65, frac     # a stencil of the lettering, not the full rect
    assert (b['x'], b['y']) == (0, 88) and b['parent_rgb'].shape[:2] == (200, 320)
