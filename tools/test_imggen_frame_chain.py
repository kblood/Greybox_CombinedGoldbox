"""Tests for tools/imggen_frame_chain.py.  Synthetic cases carry controls that FAIL when the rule is broken; the Live
class pins measured facts about the real corpus and skips when the local game data / renders are absent."""
import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imggen_animation as A  # noqa: E402
import imggen_frame_chain as C  # noqa: E402

PAL = np.array([[i * 8 % 256, (i * 37) % 256, (i * 91) % 256] for i in range(256)], np.uint8)


def textured(h=40, w=40, seed=1):
    r = np.random.default_rng(seed)
    return np.kron(r.integers(0, 12, (h // 4, w // 4)).astype(np.uint8), np.ones((4, 4), np.uint8))


def patched(base, y0, y1, x0, x1, val=200):
    f = base.copy()
    f[y0:y1, x0:x1] = val
    return f


def fset(frames):
    return A.FrameSet('t', 'x', 'PIC', 'PIC:1', frames, PAL)


class Boom(Exception):
    pass


def no_model(*a, **k):
    raise Boom('the vision model must not be called')


# --------------------------------------------------------------------------- true frames
def test_xor_roundtrip_reconstructs_known_frames():
    b = textured()
    frames = [b, patched(b, 4, 8, 10, 20), patched(b, 20, 30, 5, 9, 150)]
    stored = C.xor_deltas(frames)
    assert not np.array_equal(stored[1], frames[1])            # control: the stored delta is NOT a picture
    rec = C.apply_xor_deltas(stored)
    for a, e in zip(rec, frames):
        assert np.array_equal(a, e)


def test_step_mask_is_consecutive_not_versus_frame0():
    b = textured()
    f1 = patched(b, 4, 8, 10, 20)
    fs = fset([b, f1, b.copy()])                               # eyes close, then reopen == frame 0 again
    assert C.step_mask(fs, 1).sum() == 40
    assert C.step_mask(fs, 2).sum() == 40                       # k=2 vs k-1 changes the patch back
    assert (fs.frames[2] != fs.frames[0]).sum() == 0            # control: a vs-frame-0 mask would be EMPTY here
    assert C.step_mask(fs, 2).sum() != (fs.frames[2] != fs.frames[0]).sum()


def test_duplicate_of_finds_returning_loop_and_ignores_distinct():
    b = textured()
    f1 = patched(b, 4, 8, 10, 20)
    fs = fset([b, f1, b.copy(), patched(b, 4, 8, 10, 20, 77)])
    assert C.duplicate_of(fs, 2) == 0
    assert C.duplicate_of(fs, 1) is None
    assert C.duplicate_of(fs, 3) is None                        # control: same region, different value


def test_diff_highlight_marks_exactly_the_changed_pixels():
    b = textured()
    fs = fset([b, patched(b, 4, 8, 10, 20)])
    hl = C.diff_highlight(fs, 1)
    plain = fs.rgb(1)
    m = C.step_mask(fs, 1)
    assert (hl != plain).any(axis=2)[m].all()                   # every changed pixel tinted
    far = np.zeros_like(m)
    far[25:, 25:] = True
    assert (hl == plain).all(axis=2)[far].all()                 # nothing far from the change is touched


def test_region_words_empty_and_located():
    m = np.zeros((88, 88), bool)
    assert C.region_words(m) == 'no pixels change'
    m[2:6, 40:50] = True
    assert 'top centre' in C.region_words(m)
    assert 'bottom' not in C.region_words(m)


# --------------------------------------------------------------------------- descriptions
def test_empty_diff_says_no_change_and_never_calls_model():
    b = textured()
    fs = fset([b, b.copy()])
    cache = {}
    ent = C.describe_step(fs, 1, cache, 'm', describer=no_model)       # Boom would propagate if the model were called
    assert ent['auto'] == C.NO_CHANGE and C.final_description(ent) == C.NO_CHANGE


def test_nonempty_diff_does_call_model_control():
    b = textured()
    fs = fset([b, patched(b, 4, 8, 10, 20)])
    with pytest.raises(Boom):
        C.describe_step(fs, 1, {}, 'm', describer=no_model)


def test_description_cache_and_manual_override():
    b = textured()
    fs = fset([b, patched(b, 4, 8, 10, 20)])
    calls = []

    def mock(img, prompt, model):
        calls.append((img, prompt, model))
        return 'close both eyes'

    cache = {}
    C.describe_step(fs, 1, cache, 'm1', describer=mock)
    C.describe_step(fs, 1, cache, 'm1', describer=mock)
    assert len(calls) == 1                                       # cached
    assert '%' in calls[0][1] and 'Image 1 = BEFORE, Image 2 = AFTER' in calls[0][1]   # hint + order labels reached the prompt
    assert isinstance(calls[0][0], list) and len(calls[0][0]) == 2                    # two separate images, before then after
    native = lambda im: np.asarray(im)[2::4, 2::4]
    assert np.array_equal(native(calls[0][0][1]), fs.rgb(1))                           # 2nd image = AFTER
    assert np.array_equal(native(calls[0][0][0]), fs.rgb(0))                           # 1st image = BEFORE
    assert not np.array_equal(fs.rgb(0), fs.rgb(1))                                    # control: they differ
    cache['1']['manual'] = 'lower the left eyelid only'
    assert C.final_description(cache['1']) == 'lower the left eyelid only'
    C.describe_step(fs, 1, cache, 'm2', describer=mock)          # another model re-describes...
    assert len(calls) == 2
    assert cache['1']['manual'] == 'lower the left eyelid only'  # ...but never touches the manual field
    assert C.final_description(cache['1']) == 'lower the left eyelid only'


def test_clean_description_one_line_no_think():
    assert C.clean_description('<think>hmm</think>\n"Close both eyes."\nExtra line') == 'Close both eyes.'
    assert C.clean_description('') == ''


# --------------------------------------------------------------------------- prompts
def test_chain_prompt_order_and_content():
    p = C.chain_prompt(3, 'close both eyes; nothing else changes')
    i1, i2, i3, i4 = (p.index(f'Image {n} =') for n in (1, 2, 3, 4))
    assert i1 < i2 < i3 < i4
    assert 'frame 2 (the one to edit)' in p and 'ORIGINAL low-resolution frame 3' in p
    assert 'Edit the first image so that: close both eyes; nothing else changes' in p
    assert 'Everything else must stay identical' in p and 'done/r3.png' in p
    assert 'Image 4' not in C.chain_prompt(3, 'x', has_diff=False)       # control


def test_chain_prompt_refuses_no_change():
    with pytest.raises(ValueError):
        C.chain_prompt(2, C.NO_CHANGE)
    with pytest.raises(ValueError):
        C.chain_prompt(2, '   ')


# --------------------------------------------------------------------------- composite
def test_composite_outside_mask_is_bit_identical_and_inside_is_model():
    h = w = 20
    s = 4
    rng = np.random.default_rng(3)
    prev = rng.integers(0, 255, (h * s, w * s, 3), dtype=np.uint8)
    model = rng.integers(0, 255, (h * s, w * s, 3), dtype=np.uint8)          # a model that redraws EVERYTHING
    m = np.zeros((h, w), bool)
    m[8:12, 8:12] = True
    out = C.composite_step(prev, model, m, s, grow=1, feather=0)
    grown = np.zeros((h, w), bool)
    grown[7:13, 7:13] = True
    ghi = np.kron(grown, np.ones((s, s), bool))
    assert np.array_equal(out[~ghi], prev[~ghi])                             # the guarantee
    core = np.kron(m, np.ones((s, s), bool))
    assert np.array_equal(out[core], model[core])                            # the edit lands
    assert not np.array_equal(out, model)                                    # control: not just the model output


def test_composite_feather_never_leaks_outside_grown_mask():
    h = w = 20
    s = 4
    prev = np.zeros((h * s, w * s, 3), np.uint8)
    model = np.full_like(prev, 255)
    m = np.zeros((h, w), bool)
    m[9:11, 9:11] = True
    out = C.composite_step(prev, model, m, s, grow=2, feather=1.0)
    grown = np.zeros((h, w), bool)
    grown[7:13, 7:13] = True
    assert (out[~np.kron(grown, np.ones((s, s), bool))] == 0).all()
    assert out.max() > 0


def test_composite_revert_uses_base_not_model():
    h = w = 16
    s = 2
    prev = np.zeros((h * s, w * s, 3), np.uint8)
    model = np.full_like(prev, 200)
    base = np.full_like(prev, 50)
    m = np.zeros((h, w), bool)
    m[4:8, 4:8] = True
    rv = np.zeros((h, w), bool)
    rv[4:8, 4:6] = True
    out = C.composite_step(prev, model, m, s, grow=0, feather=0, base_hi=base, revert=rv)
    assert (out[8:16, 8:12] == 50).all()            # reverting pixels come from restyled frame 0
    assert (out[8:16, 12:16] == 200).all()          # the rest of the step is the model's
    out2 = C.composite_step(prev, model, m, s, grow=0, feather=0)
    assert (out2[8:16, 8:12] == 200).all()          # control: without `revert` the model wins


def test_delta_mask_iou_detects_wrong_region():
    m = np.zeros((20, 20), bool)
    m[2:6, 2:6] = True
    good = np.zeros((20, 20))
    good[2:6, 2:6] = 90
    bad = np.zeros((20, 20))
    bad[12:16, 12:16] = 90
    assert C.delta_mask_iou(m, good) > 0.9
    assert C.delta_mask_iou(m, bad) < 0.1


# --------------------------------------------------------------------------- pack
def make_pack(tmp_path, frames, describer=None, describe=True, desc='a test portrait'):
    fs = fset(frames)
    return C.build_pack('t_x_test', outroot=str(tmp_path), describe=describe, describer=describer, fs=fs, rec={},
                        description=desc)


def test_pack_files_numbering_and_skips(tmp_path):
    b = textured()
    f1 = patched(b, 4, 8, 10, 20)
    frames = [b, f1, f1.copy(), b.copy(), patched(b, 20, 30, 5, 9)]    # k2 identical to k1, k3 returns to 0, k4 new
    out, steps = make_pack(tmp_path, frames, describer=lambda im, p, m: 'close both eyes')
    names = set(os.listdir(out))
    assert {'00_f0_input.png', '00_prompt_f0.txt', 'INSTRUCTIONS.md', 'steps.json', 'descriptions.json'} <= names
    for tag in ('step01', 'step04'):
        for suf in ('_img2_orig_prev.png', '_img3_orig_k.png', '_img4_diff.png', '_prompt.txt'):
            assert tag + suf in names
    assert not any(n.startswith('step02') or n.startswith('step03') for n in names)    # no prompt for no-change / return
    st = {s['step']: s for s in steps}
    assert st[2]['change'] == C.NO_CHANGE and st[2]['reuse'] == 'r1'
    assert st[3]['reuse'] == 'r0' and st[3]['prompt'] is None
    assert st[1]['prompt'] == 'step01_prompt.txt'
    from PIL import Image
    assert Image.open(os.path.join(out, '00_f0_input.png')).size == C.CANVAS
    assert Image.open(os.path.join(out, 'step01_img3_orig_k.png')).size == C.CANVAS


def test_pack_images_are_registered_pixel_for_pixel(tmp_path):
    b = textured()
    out, _ = make_pack(tmp_path, [b, patched(b, 4, 8, 10, 20)], describer=lambda *a: 'x')
    from PIL import Image
    a = np.asarray(Image.open(os.path.join(out, '00_f0_input.png')))
    k = np.asarray(Image.open(os.path.join(out, 'step01_img3_orig_k.png')))
    diff = (a != k).any(axis=2)
    ys, xs = np.nonzero(diff)
    s, box = C.fit_scale(40, 40)
    assert xs.min() == box[0] + 10 * s and xs.max() == box[0] + 20 * s - 1
    assert ys.min() == box[1] + 4 * s and ys.max() == box[1] + 8 * s - 1       # exactly the native patch, upscaled


def test_pack_manual_override_reaches_prompt_and_survives_rebuild(tmp_path):
    b = textured()
    frames = [b, patched(b, 4, 8, 10, 20)]
    out, _ = make_pack(tmp_path, frames, describer=lambda *a: 'auto text')
    assert 'auto text' in open(os.path.join(out, 'step01_prompt.txt')).read()
    cp = os.path.join(out, 'descriptions.json')
    c = json.load(open(cp))
    c['1']['manual'] = 'raise the left eyebrow'
    json.dump(c, open(cp, 'w'))
    out, _ = make_pack(tmp_path, frames, describer=no_model, describe=False)        # rebuild without any model
    t = open(os.path.join(out, 'step01_prompt.txt')).read()
    assert 'raise the left eyebrow' in t and 'auto text' not in t


def test_pack_without_describe_marks_placeholder_not_invented_text(tmp_path):
    b = textured()
    out, steps = make_pack(tmp_path, [b, patched(b, 4, 8, 10, 20)], describer=no_model, describe=False)
    assert 'DESCRIBE THE CHANGE' in steps[0]['change']
    assert 'DESCRIBE THE CHANGE' in open(os.path.join(out, 'step01_prompt.txt')).read()


def test_instructions_are_danish(tmp_path):
    b = textured()
    out, _ = make_pack(tmp_path, [b, patched(b, 4, 8, 10, 20)], describer=lambda *a: 'x')
    t = open(os.path.join(out, 'INSTRUCTIONS.md'), encoding='utf-8').read()
    assert 'Manuel arbejdsgang' in t and 'done/r0.png' in t and 'chain' not in t.split('\n')[0]


# --------------------------------------------------------------------------- live corpus
class TestLive:
    @pytest.fixture(scope='class')
    def blink(self):
        if not os.path.exists(C.CAND_ANIM):
            pytest.skip('renders/imggen/animation/candidates_animation.json missing')
        try:
            return C.load_candidate('cok_amiga_daa_cok_pic1_pic1_023_f0')
        except Exception as e:             # source tree absent
            pytest.skip(str(e))

    def test_blink_consecutive_step_fractions_pinned(self, blink):
        fs, rec = blink
        fr = [round(float(C.step_mask(fs, k).mean()), 4) for k in range(1, fs.n)]
        assert fr == [0.0116, 0.0114, 0.005, 0.0116, 0.0116]

    def test_blink_true_frames_differ_from_stored_deltas(self, blink):
        fs, _ = blink
        stored = C.xor_deltas(fs.frames)
        assert np.array_equal(C.apply_xor_deltas(stored)[3], fs.frames[3])       # reconstruction == loader's frame
        assert not np.array_equal(stored[3], fs.frames[3])                       # control: delta is not the frame
        assert stored[3].mean() < 2                                              # deltas are near-zero, frames are not
        assert fs.frames[3].mean() > 4
