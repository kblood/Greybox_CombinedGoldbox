"""Tests for tools/gateway_amiga_render.py (Amiga Gateway portraits + DOS twin matching) and the
forced-twin hook it feeds in tools/imggen_candidates.py. Synthetic controls always run; the live
checks skip when the never-vendored Amiga/GOG sources are absent."""
import json
import os
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gateway_amiga_render as R  # noqa: E402
import imggen_candidates as C  # noqa: E402

RNG = np.random.default_rng(11)


def picture(seed, k=20):
    r = np.random.default_rng(seed)
    small = r.integers(0, k, (11, 11))
    return np.kron(small, np.ones((8, 8), dtype=int)).astype(np.uint8)     # 88x88 blocky "picture"


def test_purity_identical_and_relabelled_are_one():
    a = picture(1)
    perm = RNG.permutation(32).astype(np.uint8)
    assert R.purity(a, a) == 1.0
    assert R.purity(a, perm[a]) == 1.0          # different index numbering, same structure (DOS vs Amiga case)


def test_purity_control_unrelated_and_merged_fail():
    a, b = picture(1), picture(2)
    assert R.purity(a, b) < 0.5                  # unrelated picture scores low: the rule can fail
    merged = (a // 2).astype(np.uint8)           # two Amiga classes folded into one DOS class
    assert R.purity(a, merged) < 0.9


def test_match_twins_finds_relabelled_twin_and_rejects_decoy():
    a = picture(3)
    perm = RNG.permutation(32).astype(np.uint8)
    dos = {('PIC2.DAX', 5): [perm[a]], ('PIC3.DAX', 9): [picture(4)]}
    m = R.match_twins({7: (a, None)}, dos)
    assert [(f, b) for f, b, p in m[7]['twins']] == [('PIC2.DAX', 5)]
    assert m[7]['runner_up'] < 0.6               # the null: how well the decoy scores
    # control: an impossible threshold must find nothing, so the twin above is not a vacuous pass
    assert R.match_twins({7: (a, None)}, dos, min_purity=1.01)[7]['twins'] == []


def test_match_twins_uses_any_frame():
    a = picture(5)
    dos = {('PIC.DAX', 29): [picture(6), a]}      # animated block: the matching frame is not frame 0
    assert R.match_twins({1: (a, None)}, dos)[1]['twins'][0][:2] == ('PIC.DAX', 29)


def test_dos_rel_naming_matches_renders_layout():
    assert R.dos_rel('PIC2.DAX', 5) == 'gateway-pic/PIC2/pic2_005.png'
    assert R.dos_rel('PIC.DAX', 119) == 'gateway-pic/PIC/pic_119.png'


def test_render_png_scale_and_palette(tmp_path):
    idx = np.zeros((88, 88), dtype=np.uint8)
    idx[0, 0] = 3
    pal = [(0, 0, 0)] * 3 + [(200, 100, 50)] + [(0, 0, 0)] * 28
    p = tmp_path / 'x.png'
    R.render_png(idx, pal, str(p))
    im = Image.open(p).convert('RGB')
    assert im.size == (352, 352)
    assert im.getpixel((0, 0)) == (200, 100, 50) and im.getpixel((3, 3)) == (200, 100, 50)
    assert im.getpixel((4, 0)) == (0, 0, 0)


def _rec(rel, seed, game='gateway'):
    n = np.random.default_rng(seed).integers(0, 255, (88, 88, 3), dtype=np.uint8)
    return dict(rel=rel, game=game, native=(88, 88), sig=C.signature(n), pixkey=C.pixel_key(n))


def test_forced_pairs_group_dissimilar_renders_and_control():
    recs = [_rec('gateway-amiga/PIC/amiga_pic_05.png', 1), _rec('gateway-pic/PIC2/pic2_005.png', 2)]
    assert len(C.group_items(recs)) == 2                                   # unrelated palettes: not grouped alone
    forced = [('gateway-amiga/PIC/amiga_pic_05.png', 'gateway-pic/PIC2/pic2_005.png')]
    assert len(C.group_items(recs, forced=forced)) == 1
    assert len(C.group_items(recs, forced=[('nope', 'also-nope')])) == 2   # unknown rels never merge anything


def test_gateway_prefers_amiga():
    assert C.platform_rank('gateway', 'amiga') < C.platform_rank('gateway', 'dos')


AMIGA = R.DEFAULT_AMIGA
live = pytest.mark.skipif(not (os.path.exists(AMIGA) and os.path.isdir(R.DEFAULT_DOS)),
                          reason='Amiga WHDLoad / GOG Gateway sources not present')


@live
def test_live_gateway_pairing():
    amiga = R.load_amiga_pics(AMIGA)
    assert len(amiga) == 73
    assert all(pal and len(pal) >= 32 for _, pal in amiga.values())        # every set ships its own colour table
    dos = R.load_dos_pics(R.DEFAULT_DOS)
    m = R.match_twins(amiga, dos)
    paired = [n for n, v in m.items() if v['twins']]
    assert len(paired) == 72 and [n for n in m if not m[n]['twins']] == [26]
    # the structural match is unambiguous: every non-twin scores well below the threshold
    assert max(v['runner_up'] for v in m.values() if v['runner_up'] is not None) < 0.9
    # set N carries DOS block id N (or, where a block is absent, a nearby id); spot-check the six used in batch02
    for n, blk in {39: 56, 40: 57, 19: 19, 55: 81, 68: 104, 70: 116}.items():
        assert blk in [b for _, b, _ in m[n]['twins']]


@live
def test_live_palette_differs_from_dos_extended_range():
    """The reason Amiga is the better source: DOS indices 18..31 have no proven RGB (grey faces); Amiga's table does."""
    amiga = R.load_amiga_pics(AMIGA)
    idx, pal = amiga[55]
    used = set(np.unique(idx).tolist())
    assert max(used) >= 18
    skin = [pal[i] for i in used if i >= 18]
    assert any(r > 200 and r > g > b for r, g, b in skin)             # skin-tone pinks live at 28..31
