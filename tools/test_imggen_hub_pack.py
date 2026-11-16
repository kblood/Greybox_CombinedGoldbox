"""Tests for tools/imggen_hub_pack.py (hub mode: frame 0 is the hub).  Synthetic cases carry controls that FAIL when the
rule is broken: a step is measured against frame 0, never against the previous frame."""
import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imggen_animation as A  # noqa: E402
import imggen_hub_pack as H  # noqa: E402

PAL = np.array([[i * 8 % 256, (i * 37) % 256, (i * 91) % 256] for i in range(256)], np.uint8)


def base(seed=1):
    r = np.random.default_rng(seed)
    return np.kron(r.integers(0, 12, (10, 10)).astype(np.uint8), np.ones((4, 4), np.uint8))


def fset(frames):
    return A.FrameSet('t', 'x', 'PIC', 'PIC:1', frames, PAL)


def fake_describer(images, prompt, model):
    return 'close both eyes'


def test_mask_is_against_frame_zero_not_previous():
    f0 = base()
    f1 = f0.copy(); f1[0:4, 0:4] = 200          # change A
    f2 = f1.copy(); f2[8:12, 8:12] = 201         # change B: vs frame 1 only B, vs frame 0 both A and B
    fs = fset([f0, f1, f2])
    m2 = H.hub_mask(fs, 2)
    assert m2[0:4, 0:4].all(), 'hub mask must include change A (differs from frame 0)'
    assert m2[8:12, 8:12].all()
    # control: the consecutive mask would NOT include change A
    consecutive = fs.frames[2] != fs.frames[1]
    assert not consecutive[0:4, 0:4].any()


def test_identical_to_frame_zero_is_no_change(tmp_path):
    f0 = base()
    f1 = f0.copy(); f1[0:4, 0:4] = 200
    fs = fset([f0, f1, f0.copy()])
    out, steps = H.build_hub_pack('t', outroot=str(tmp_path), fs=fs, rec={}, describer=fake_describer, describe=True,
                                  model='m', description='a portrait')
    st2 = steps[1]
    assert st2['reuse'] == 'r0' and st2['change'] == H.NO_CHANGE and st2.get('prompt') is None


def test_returning_frame_reuses_earlier_hub_step(tmp_path):
    f0 = base()
    f1 = f0.copy(); f1[0:4, 0:4] = 200
    f2 = f0.copy(); f2[8:12, 8:12] = 150
    fs = fset([f0, f1, f2, f1.copy()])          # frame 3 == frame 1
    out, steps = H.build_hub_pack('t', outroot=str(tmp_path), fs=fs, rec={}, describer=fake_describer, describe=True,
                                  model='m', description='a portrait')
    assert steps[2]['reuse'] == 'r1'
    assert steps[2].get('prompt') is None
    play = open(os.path.join(out, 'PLAYBACK.md'), encoding='utf-8').read()
    assert 'done/r1.png' in play and 'done/r2.png' in play


def test_prompt_uses_frame_zero_as_the_edited_image(tmp_path):
    f0 = base()
    f1 = f0.copy(); f1[0:4, 0:4] = 200
    fs = fset([f0, f1])
    out, steps = H.build_hub_pack('t', outroot=str(tmp_path), fs=fs, rec={}, describer=fake_describer, describe=True,
                                  model='m', description='a portrait')
    text = open(os.path.join(out, 'hub1_prompt.txt'), encoding='utf-8').read()
    assert 'Image 1 = the finished restyled picture of frame 0' in text
    assert 'done/r1.png' in text
    assert 'close both eyes' in text
    # control: the prompt must not describe itself against the previous frame
    assert 'previous' not in text.lower()


def test_empty_or_no_change_description_is_a_visible_placeholder(tmp_path):
    f0 = base()
    f1 = f0.copy(); f1[0:4, 0:4] = 200          # pixels DO change, so 'No change.' from the model is wrong
    fs = fset([f0, f1])
    out, steps = H.build_hub_pack('t', outroot=str(tmp_path), fs=fs, rec={}, describer=lambda i, p, m: 'No change.',
                                  describe=True, model='m', description='a portrait')
    assert steps[0]['change'].startswith('<<DESCRIBE THE CHANGE')


def test_manual_override_wins(tmp_path):
    f0 = base()
    f1 = f0.copy(); f1[0:4, 0:4] = 200
    fs = fset([f0, f1])
    os.makedirs(str(tmp_path / 't_hub'))
    json.dump({'h1': {'auto': 'x', 'manual': 'open mouth', 'model': 'm', 'region': None}},
              open(str(tmp_path / 't_hub' / 'descriptions.json'), 'w', encoding='utf-8'))
    out, steps = H.build_hub_pack('t', outroot=str(tmp_path), fs=fs, rec={}, describer=fake_describer, describe=True,
                                  model='m', description='a portrait')
    assert steps[0]['change'] == 'open mouth'
