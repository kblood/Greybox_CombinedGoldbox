"""Tests for tools/imggen_animation.py.

Synthetic cases pin every rule and each has a control that FAILS when the rule is broken.  The Live* class pins
measured facts about the real corpus and skips when the local game data / renders are absent.
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imggen_animation as A  # noqa: E402

PAL = np.array([[i * 8 % 256, (i * 37) % 256, (i * 91) % 256] for i in range(256)], np.uint8)


def textured(h=40, w=40, seed=1):
    r = np.random.default_rng(seed)
    small = r.integers(0, 12, (h // 4, w // 4)).astype(np.uint8)
    return np.kron(small, np.ones((4, 4), np.uint8))


def fset(frames, transparent=None):
    return A.FrameSet('t', 'x', 'PIC', 'PIC:1', frames, PAL, transparent=transparent)


def with_patch(base, y0, y1, x0, x1, val=200):
    f = base.copy()
    f[y0:y1, x0:x1] = val
    return f


# ------------------------------------------------------------------------------------------- analysis
def test_changed_fraction_and_bbox_exact():
    b = textured()
    fs = fset([b, with_patch(b, 4, 8, 10, 20)])
    a = A.analyse(fs)
    assert a['bbox'] == [10, 4, 20, 8]
    assert a['changed_fraction'] == pytest.approx(40 / 1600, abs=1e-4)
    assert a['kind'] == 'region-loop'
    assert a['components'] == 1


def test_control_identical_frames_are_static_duplicate_not_region():
    b = textured()
    a = A.analyse(fset([b, b.copy()]))
    assert a['kind'] == 'static-duplicate' and a['bbox'] is None and a['changed_fraction'] == 0
    # control: one flipped pixel is enough to leave that class
    c = b.copy()
    c[0, 0] ^= 1
    assert A.analyse(fset([b, c]))['kind'] != 'static-duplicate'


def test_single_frame_is_single():
    assert A.analyse(fset([textured()]))['kind'] == 'single'


@pytest.mark.parametrize('frac,bb,expect', [
    (0.05, 0.10, 'region-loop'), (0.10, 0.40, 'large-region'), (0.15, 0.90, 'scattered'), (0.60, 0.95, 'full-picture')])
def test_classify_bands(frac, bb, expect):
    assert A.classify(frac, bb, 3, 2) == expect


def test_scattered_vs_full_is_decided_by_changed_fraction_not_bbox():
    # two far-apart small changes: bbox spans the picture, few pixels change -> scattered, NOT full-picture
    b = textured()
    f = b.copy()
    f[0:2, 0:2] = 200
    f[38:40, 38:40] = 200
    a = A.analyse(fset([b, f]))
    assert a['bbox_fraction'] > 0.9 and a['kind'] == 'scattered'
    # control: a bbox-only classifier would call this full-picture
    assert A.classify(a['changed_fraction'], a['bbox_fraction'], 2, 1) != 'full-picture'


def test_transparent_holes_are_not_changes():
    b = textured()
    f = b.copy()
    f[5:9, 5:9] = 255
    assert A.analyse(fset([b, f], transparent=255))['changed_fraction'] == 0
    assert A.analyse(fset([b, f], transparent=None))['changed_fraction'] > 0      # control


# ------------------------------------------------------------------------------------------- overlays / keys
def test_overlay_composite_skips_transparent_and_honours_offset():
    base = np.full(64, 3, np.uint8)                     # 8x8
    patch = np.array([255, 9, 255, 9], np.uint8)        # 2x2 patch at (+3,+2) relative to the base origin
    fr = A._composite_overlays([(8, 8, base, 0, 0), (2, 2, patch, 3, 2)])
    assert len(fr) == 2 and (fr[0] == 3).all()
    assert fr[1][2, 3] == 3 and fr[1][2, 4] == 9 and fr[1][3, 3] == 3 and fr[1][3, 4] == 9
    # control: a patch with no transparent pixels overwrites all four
    fr2 = A._composite_overlays([(8, 8, base, 0, 0), (2, 2, np.full(4, 9, np.uint8), 3, 2)])
    assert (fr2[1][2:4, 3:5] == 9).all()


def test_overlay_clipped_at_base_edge():
    base = np.zeros(16, np.uint8)
    fr = A._composite_overlays([(4, 4, base, 0, 0), (4, 4, np.full(16, 7, np.uint8), 2, 2)])
    assert (fr[1][2:, 2:] == 7).all() and fr[1][:2].sum() == 0 and fr[1][:, :2].sum() == 0


@pytest.mark.parametrize('src,game,plat,key,frame', [
    ('renders/daa/CoK_PIC1/PIC1_005_f0.png', 'cok', 'amiga', 'PIC1:5', 0),
    ('renders/daa/DoK_PIC2/PIC2_093_f2.png', 'dok', 'amiga', 'PIC2:93', 2),
    ('renders/hlib/PICA/PICA_set04_img007.png', 'dqk', 'dos', 'PICA:set04', 6),
    ('renders/pool_amiga/pic/pic_11_f3.png', 'pool', 'amiga', 'PIC:11', 3),
    ('renders/gateway-amiga/PIC/amiga_pic_05.png', 'gateway', 'amiga', 'PIC:5', 0),
])
def test_candidate_key_parses(src, game, plat, key, frame):
    g = 'cok' if 'CoK' in src else 'dok' if 'DoK' in src else 'x'
    got = A.candidate_key(dict(source=src, game=g, platform='amiga'))
    assert got[:4] == (game, plat, key, frame)


def test_candidate_key_rejects_screens():
    assert A.candidate_key(dict(source='renders/amiga_cokdok/lbm/CoK_scrn2.png', game='cok', platform='amiga')) is None


def test_candidates_animation_tags_overlay_patch_and_gateway_twin():
    b = textured()
    dqk = A.FrameSet('dqk', 'dos', 'PICA', 'PICA:set04', [b, with_patch(b, 0, 8, 0, 8)], PAL)
    gwd = A.FrameSet('gateway', 'dos', 'PIC', 'PIC:29', [b, with_patch(b, 0, 8, 0, 8)], PAL)
    gwa = A.FrameSet('gateway', 'amiga', 'PIC', 'PIC:29', [b], PAL)
    cands = [dict(id='c1', source='renders/hlib/PICA/PICA_set04_img002.png', game='dqk', platform='dos'),
             dict(id='c2', source='renders/hlib/PICA/PICA_set04_img001.png', game='dqk', platform='dos'),
             dict(id='c3', source='renders/gateway-amiga/PIC/amiga_pic_29.png', game='gateway', platform='amiga'),
             dict(id='c4', source='renders/amiga_cokdok/lbm/CoK_scrn2.png', game='cok', platform='amiga')]
    out = A.candidates_animation(cands, [dqk, gwd, gwa])
    assert out['c1']['source_frame_role'] == 'overlay-patch'
    assert 'source_frame_role' not in out['c2'] and out['c2']['kind'] == 'region-loop'
    assert out['c3']['kind'] == 'single' and out['c3']['dos_twin']['frames'] == 2
    assert out['c4']['kind'] == 'unmeasured'


# ------------------------------------------------------------------------------------------- mask-delta prototype
def test_mask_delta_leaves_everything_outside_the_mask_untouched():
    cv2 = pytest.importorskip('cv2')
    b = textured(48, 48)
    fs = fset([b, with_patch(b, 20, 26, 20, 30)])
    r0 = A.sim_restyle(fs.rgb(0))
    for method in ('paste', 'aligned'):
        out = A.mask_delta_frames(fs, r0, method=method)
        s = A.SIM_SCALE
        # a region well away from the patch (and its feather) is bit-identical to the restyled base
        assert (out[1][:8 * s] == r0[:8 * s]).all()
        assert (out[1][:, :8 * s] == r0[:, :8 * s]).all()
        # control: inside the changed region the frame really differs from the base
        assert np.abs(out[1][20 * s:26 * s, 20 * s:30 * s].astype(int) - r0[20 * s:26 * s, 20 * s:30 * s]).mean() > 5


def test_mask_delta_with_no_change_returns_base():
    pytest.importorskip('cv2')
    b = textured(48, 48)
    fs = fset([b, b.copy()])
    r0 = A.sim_restyle(fs.rgb(0))
    assert (A.mask_delta_frames(fs, r0, method='aligned')[1] == r0).all()


def test_independent_restyle_flickers_where_mask_delta_cannot():
    pytest.importorskip('cv2')
    b = textured(48, 48)
    fs = fset([b, with_patch(b, 20, 26, 20, 30), with_patch(b, 22, 28, 10, 18)])
    m = A.evaluate(fs)['metrics']
    assert m['paste']['outside_flicker'] < 0.5 and m['aligned']['outside_flicker'] < 0.5
    assert m['independent']['outside_flicker'] > 3 * max(m['aligned']['outside_flicker'], 0.1)   # the modelled risk


def test_aligned_beats_paste_when_restyle_moves_geometry():
    pytest.importorskip('cv2')
    import cv2
    r = np.random.default_rng(5)
    n = cv2.GaussianBlur(r.random((64, 64)).astype(np.float32), (0, 0), 3)
    b = ((n - n.min()) / np.ptp(n) * 23).astype(np.uint8) * 9
    f1 = b.copy()
    f1[24:34, 20:40] = (b[24:34, 20:40] + 60) % 200                 # patch keeps the local structure, shifts tone
    ramp = np.linspace(0, 255, 256).astype(np.uint8)
    fs = A.FrameSet('t', 'x', 'PIC', 'PIC:1', [b, f1], np.stack([ramp, ramp[::-1] // 2 + 60, 255 - ramp // 2], 1))
    m = A.evaluate(fs)['metrics']
    assert m['aligned']['mae_in_changed_region'] < m['paste']['mae_in_changed_region']
    # control: with a geometry-preserving 'restyle' (no warp) paste is no longer worse
    old = A.SIM_WARP_PX
    try:
        A.SIM_WARP_PX = 0.0
        m0 = A.evaluate(fs)['metrics']
    finally:
        A.SIM_WARP_PX = old
    assert m0['paste']['mae_in_changed_region'] < m['paste']['mae_in_changed_region']


# ------------------------------------------------------------------------------------------- live corpus facts
def _live(names):
    sets, errors = A.load_all(names)
    if errors or not sets:
        pytest.skip(f"source data absent: {errors}")
    return {(s.game, s.platform, s.key): s for s in sets}


class TestLive:
    def test_cok_blink_is_a_small_local_loop_and_deltas_are_applied(self):
        by = _live(['cok-amiga'])
        fs = by[('cok', 'amiga', 'PIC1:23')]
        a = A.analyse(fs)
        assert fs.n == 6 and a['kind'] in ('large-region', 'region-loop')
        assert 0.005 < a['changed_fraction'] < 0.03 and a['bbox_fraction'] < 0.3
        # control: treating the stored deltas as frames (no XOR applied) would change most of the picture
        raw = [fs.frames[0]] + [fs.frames[0] ^ f for f in fs.frames[1:]]     # XOR again == the stored delta bytes
        assert (raw[1] != raw[0]).mean() > 0.5

    def test_dqk_overlays_composite_onto_base(self):
        by = _live(['dqk-dos'])
        fs = by[('dqk', 'dos', 'PICA:set06')]
        a = A.analyse(fs)
        assert fs.n == 3 and a['kind'] == 'region-loop' and a['bbox'][3] <= 40     # 88x36 patch at the top
        assert all(np.array_equal(f[40:], fs.frames[0][40:]) for f in fs.frames)   # lower body never changes

    def test_gateway_amiga_is_static_and_dos_has_one_animated_block(self):
        by = _live(['gateway'])
        amiga = [s for (g, p, k), s in by.items() if g == 'gateway' and p == 'amiga']
        dos = [s for (g, p, k), s in by.items() if g == 'gateway' and p == 'dos']
        assert len(amiga) == 73 and all(s.n == 1 for s in amiga)
        assert [s.key for s in dos if s.n > 1] == ['PIC:29']

    def test_pool_frames_are_xor_deltas_not_independent_pictures(self):
        by = _live(['pool-amiga'])
        fs = by[('pool', 'amiga', 'PIC:11')]

        def ed(a):
            return (a[:, 1:] != a[:, :-1]).mean() + (a[1:] != a[:-1]).mean()
        e0 = ed(fs.frames[0])
        applied = np.mean([abs(np.log(ed(f) / e0)) for f in fs.frames[1:]])
        stored = np.mean([abs(np.log(ed(fs.frames[0] ^ f) / e0)) for f in fs.frames[1:]])    # raw delta bytes
        assert applied < 0.3 < stored          # applied frames look like pictures, stored bytes do not
        assert (fs.frames[0] ^ fs.frames[1] == 0).mean() > 0.5

    def test_dqk_amiga_pic_sets_hold_one_image_each(self):
        by = _live(['dqk-amiga'])
        pics = [s for (g, p, k), s in by.items() if s.family in ('PICA', 'PICB', 'PICC')]
        assert pics and all(s.n == 1 for s in pics)
