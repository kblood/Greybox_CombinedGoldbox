#!/usr/bin/env python3
"""imggen_frame_chain.py - chain-mode restyle packs for animated Gold Box pictures (no image model is called).

  python tools/imggen_frame_chain.py pack  <candidate-id> [--describe] [--model qwen3.5:27b]
  python tools/imggen_frame_chain.py describe <candidate-id> [--model M]          # fill the description cache only
  python tools/imggen_frame_chain.py composite <candidate-id> --step K --model-out FILE --prev FILE  # after ChatGPT

The scheme (user idea, 2026-10-14): restyle frame 0 once; for every next frame k give ChatGPT the PREVIOUS RESTYLED
frame r(k-1) plus a short text describing what changes between ORIGINAL frame k-1 and ORIGINAL frame k, so each step is
a small edit of a picture the model already painted.  Output of step k is then clamped to the original change mask
(`composite_step`) so everything outside the real delta stays bit-identical to r(k-1).

Frames: `imggen_animation` loaders already return TRUE (delta-applied) frames; this module only ever compares TRUE
consecutive frames k-1 -> k, never the stored XOR deltas (a stored delta k says "k vs 0", not "k vs k-1").

Chain mode vs reference-to-frame-0 (drift) -- see docs/engine/research/imggen-animation-prior-art.md section 11.
Packs go to renders/imggen/animation/chain/<id>/ (git-ignored).  Descriptions come from a local Ollama vision model and
are cached in descriptions.json next to the pack with a `manual` override field that always wins.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import imggen_animation as A  # noqa: E402

CHAIN = os.path.join(ROOT, 'renders', 'imggen', 'animation', 'chain')
CAND_ANIM = os.path.join(ROOT, 'renders', 'imggen', 'animation', 'candidates_animation.json')
CAND_JSON = os.path.join(ROOT, 'renders', 'imggen', 'candidates', 'candidates.json')
CANVAS = (1536, 1024)
GREY = (128, 128, 128)
MAGENTA = (255, 0, 255)
DEFAULT_MODEL = 'qwen3.5:9b'
NO_CHANGE = 'No change.'
HOST = 'http://localhost:11434'

STYLE = ("Realistic painted / photographic fantasy illustration, Dragonlance setting, the world of Krynn. "
         "Cinematic lighting, rich natural textures, high detail.")
CONSTRAINT = ("Keep the exact composition, colours, perspective and placement of the attached image. "
              "Do not add any text, logo, border or frame. Do not crop or move anything. "
              "Output a 3:2 landscape image (1536x1024); the neutral grey padding, if any, should be filled "
              "by continuing the picture naturally or left as plain grey.")


# ------------------------------------------------------------------------------------------- true frames
def xor_deltas(frames):
    """TRUE frames -> stored form (frame 0, then f0 ^ fk).  Inverse of `apply_xor_deltas`."""
    return [frames[0]] + [frames[0] ^ f for f in frames[1:]]


def apply_xor_deltas(stored):
    """Stored form -> TRUE frames.  This is the step the loaders already do; kept here so the rule is testable."""
    return [stored[0]] + [stored[0] ^ d for d in stored[1:]]


def split_id(cid: str):
    """'cok_amiga_daa_cok_pic1_pic1_023_f0' -> ('cok', 'amiga')."""
    g, p = cid.split('_')[:2]
    return g, p


def loader_name(game: str, platform: str) -> str:
    if game == 'gateway':
        return 'gateway'
    if game == 'pool':
        return 'pool-amiga'
    return f'{game}-{platform}'


def load_candidate(cid: str, anim: dict | None = None):
    """candidate id -> (FrameSet, animation-record).  Raises KeyError/LookupError with a clear message."""
    anim = anim if anim is not None else json.load(open(CAND_ANIM, encoding='utf-8'))
    rec = anim.get(cid)
    if rec is None:
        raise KeyError(f'{cid} not in {CAND_ANIM}')
    if not rec.get('frames') or rec['frames'] < 2:
        raise LookupError(f'{cid} is not animated (frames={rec.get("frames")})')
    game, plat = split_id(cid)
    sets, err = A.load_all([loader_name(game, plat)])
    for fs in sets:
        if (fs.game, fs.platform, fs.key) == (game, plat, rec['block']):
            return fs, rec
    raise LookupError(f'{cid}: block {rec["block"]} not produced by the loader ({err})')


# ------------------------------------------------------------------------------------------- images
def fit_scale(w, h, canvas=CANVAS):
    s = max(1, min(canvas[0] // w, canvas[1] // h))
    return s, [(canvas[0] - w * s) // 2, (canvas[1] - h * s) // 2, w * s, h * s]


def on_canvas(rgb: np.ndarray, canvas=CANVAS, pad=GREY):
    """Native RGB -> nearest-upscaled picture centred on a grey canvas (same box for every frame => registered)."""
    h, w = rgb.shape[:2]
    s, box = fit_scale(w, h, canvas)
    big = Image.fromarray(np.ascontiguousarray(rgb)).resize((w * s, h * s), Image.NEAREST)
    can = Image.new('RGB', canvas, pad)
    can.paste(big, (box[0], box[1]))
    return can, s, box


def step_mask(fs, k: int) -> np.ndarray:
    """Native boolean mask: pixels where TRUE frame k differs from TRUE frame k-1 (consecutive, not vs frame 0)."""
    m = fs.frames[k] != fs.frames[k - 1]
    if fs.transparent is not None:
        m &= fs.frames[k] != fs.transparent
    return m


def diff_highlight(fs, k: int) -> np.ndarray:
    """Native RGB of frame k with the pixels that differ from frame k-1 tinted 50% magenta and a 1-px magenta outline
    around them.  A LOCATOR for the human/model only; never used in composites."""
    import cv2
    m = step_mask(fs, k)
    out = fs.rgb(k).astype(np.float32)
    out[m] = out[m] * 0.5 + np.array(MAGENTA, np.float32) * 0.5
    if m.any():
        grown = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        out[grown & ~m] = MAGENTA
    return np.clip(out, 0, 255).astype(np.uint8)


def region_words(m: np.ndarray) -> str:
    """Coarse, deterministic locator text for a mask: share of pixels and a 3x3 grid position of its boxes."""
    if not m.any():
        return 'no pixels change'
    from scipy import ndimage
    h, w = m.shape
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=2))
    names = [['top left', 'top centre', 'top right'], ['middle left', 'centre', 'middle right'],
             ['bottom left', 'bottom centre', 'bottom right']]
    parts = []
    for sl in ndimage.find_objects(lab):
        cy = (sl[0].start + sl[0].stop) / 2 / h
        cx = (sl[1].start + sl[1].stop) / 2 / w
        parts.append(names[min(int(cy * 3), 2)][min(int(cx * 3), 2)])
    parts = sorted(set(parts))
    return '%.1f%% of the pixels change, in the %s' % (100 * m.mean(), ' and '.join(parts))


def panels(fs, k: int, scale: int = 4, with_diff: bool = True) -> Image.Image:
    """Labelled side-by-side: frame k-1 | frame k [| diff highlight], nearest-neighbour upscaled."""
    tiles = [(f'A = frame {k - 1}', fs.rgb(k - 1)), (f'B = frame {k}', fs.rgb(k))]
    if with_diff:
        tiles.append(('MAGENTA = pixels that differ', diff_highlight(fs, k)))
    h, w = fs.shape
    gap, lab = 8, 16
    W = len(tiles) * (w * scale) + (len(tiles) - 1) * gap
    im = Image.new('RGB', (W, h * scale + lab), (30, 30, 30))
    d = ImageDraw.Draw(im)
    for i, (t, rgb) in enumerate(tiles):
        x = i * (w * scale + gap)
        d.text((x + 2, 2), t, fill=(255, 255, 120))
        im.paste(Image.fromarray(np.ascontiguousarray(rgb)).resize((w * scale, h * scale), Image.NEAREST), (x, lab))
    return im


def crop_panels(fs, k: int, pad: int = 8, target: int = 400) -> Image.Image:
    """Labelled zoom on the changed region only: crop of frame k-1 | crop of frame k (same box, no tint), so the
    model sees the small change large and is not drawn to a magenta overlay."""
    m = step_mask(fs, k)
    bb = A.bbox_of(m) or [0, 0, fs.shape[1], fs.shape[0]]
    h, w = fs.shape
    x0, y0, x1, y1 = max(bb[0] - pad, 0), max(bb[1] - pad, 0), min(bb[2] + pad, w), min(bb[3] + pad, h)
    sc = max(1, target // max(x1 - x0, y1 - y0))
    tiles = [(f'A = frame {k - 1} (zoom)', fs.rgb(k - 1)), (f'B = frame {k} (zoom)', fs.rgb(k))]
    gap, lab = 8, 16
    cw, ch = (x1 - x0) * sc, (y1 - y0) * sc
    im = Image.new('RGB', (2 * cw + gap, ch + lab), (30, 30, 30))
    d = ImageDraw.Draw(im)
    for i, (t, rgb) in enumerate(tiles):
        d.text((i * (cw + gap) + 2, 2), t, fill=(255, 255, 120))
        crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
        im.paste(Image.fromarray(crop).resize((cw, ch), Image.NEAREST), (i * (cw + gap), lab))
    return im


# ------------------------------------------------------------------------------------------- local vision model
DESCRIBE_MODES = ('two', 'composite', 'three')     # input modes measured in the bake-off; 'two' is the default
_Q = ("Describe ONLY what changes, as one short imperative instruction (max 20 words) telling an artist how to edit the "
      "BEFORE picture into the AFTER picture, e.g. 'turn the lantern flame from yellow to red; nothing else changes'. "
      "Name only things you can see. If the two pictures are identical, reply exactly: No change. "
      "Reply with the instruction only.")


def describe_prompt(region: str | None, mode: str = 'two') -> str:
    head = {'two': "Image 1 = BEFORE, Image 2 = AFTER (two pixel-art pictures, in this order). ",
            'composite': "One image: the LEFT half is the BEFORE picture, the RIGHT half is the AFTER picture. ",
            'three': ("Image 1 = BEFORE, Image 2 = AFTER, Image 3 = the AFTER picture with the pixels that differ marked "
                      "magenta (a locator only; never mention magenta). ")}[mode]
    hint = ("Hint from a pixel diff: " + region + ". ") if region else ''
    return head + hint + _Q


def describe_images(fs, k: int, mode: str = 'two'):
    """Model input for step k-1 -> k: a list of images (two/three) or one labelled composite."""
    s = 4
    up = lambda rgb: Image.fromarray(np.ascontiguousarray(rgb)).resize((rgb.shape[1] * s, rgb.shape[0] * s), Image.NEAREST)
    if mode == 'two':
        return [up(fs.rgb(k - 1)), up(fs.rgb(k))]
    if mode == 'three':
        return [up(fs.rgb(k - 1)), up(fs.rgb(k)), up(diff_highlight(fs, k))]
    return panels(fs, k, scale=s, with_diff=False)


def ollama_describe(image, prompt: str, model: str = DEFAULT_MODEL, host: str = HOST, timeout: int = 240,
                    num_predict: int = 120, raw: bool = False) -> str:
    """`image` is one PIL image or a LIST of them (sent in order as separate images)."""
    import io
    imgs = image if isinstance(image, (list, tuple)) else [image]
    enc = []
    for im in imgs:
        buf = io.BytesIO()
        im.save(buf, 'PNG')
        enc.append(base64.b64encode(buf.getvalue()).decode('ascii'))
    payload = {'model': model, 'prompt': prompt, 'images': enc,
               'stream': False, 'think': False, 'options': {'temperature': 0, 'num_predict': num_predict}}
    req = urllib.request.Request(host.rstrip('/') + '/api/generate', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            res = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'Ollama HTTP {e.code}: {e.read().decode(errors="replace")}') from e
    except urllib.error.URLError as e:
        raise RuntimeError(f'Ollama request failed at {host}: {e}') from e
    if res.get('error'):
        raise RuntimeError(f'Ollama error: {res["error"]}')
    return res.get('response', '').strip() if raw else clean_description(res.get('response', ''))


def clean_description(t: str) -> str:
    t = re.sub(r'<think>.*?</think>', '', t, flags=re.S).strip()
    t = t.splitlines()[0].strip() if t else ''
    return t.strip('`"\' ')


def describe_step(fs, k: int, cache: dict, model: str = DEFAULT_MODEL, mode: str = 'two', hint: bool = True,
                  describer=None):
    """Description of ORIGINAL k-1 -> k.  An empty diff never reaches the model: it is 'No change.' by construction.
    cache[str(k)] = {auto, manual, model, region}; `manual` (non-empty) wins and is never overwritten."""
    m = step_mask(fs, k)
    ent = cache.setdefault(str(k), {'auto': None, 'manual': '', 'model': None, 'region': None})
    ent['region'] = region_words(m)
    if not m.any():
        ent['auto'], ent['model'] = NO_CHANGE, None
        return ent
    if ent.get('auto') and ent.get('model') == model and not ent.get('stale'):
        return ent
    describer = describer or ollama_describe
    ent['auto'] = describer(describe_images(fs, k, mode), describe_prompt(ent['region'] if hint else None, mode), model)
    ent['mode'] = mode
    ent['model'] = model
    return ent


def final_description(ent: dict) -> str:
    return (ent.get('manual') or '').strip() or (ent.get('auto') or '').strip()


# ------------------------------------------------------------------------------------------- ChatGPT prompts
def chain_prompt(k: int, change: str, has_diff: bool = True) -> str:
    """Prompt for step k (attachments in this fixed order, the model reads 'first image' by attachment order)."""
    if change.strip() == NO_CHANGE or not change.strip():
        raise ValueError('step has no change; the pack reuses the previous frame instead of prompting')
    att = ["Image 1 = the finished restyled picture of frame %d (the one to edit)" % (k - 1),
           "Image 2 = the ORIGINAL low-resolution frame %d" % (k - 1),
           "Image 3 = the ORIGINAL low-resolution frame %d" % k]
    if has_diff:
        att.append("Image 4 = Image 3 with the pixels that differ from Image 2 marked in magenta")
    return ("[ATTACHMENTS]\n" + "\n".join(att) + "\n\n"
            "[TASK]\nEdit the first image so that: %s\n"
            "Everything else must stay identical to the first image: same painting style, brushwork, palette, lighting, "
            "background, face shape, hair, clothing, framing and pixel positions; same canvas (1536x1024), no re-centering, "
            "no zoom, no new objects, no text. Images 2-4 only show WHAT changes (small pixel art, low quality) - never copy "
            "their style or colours into the result. Output one picture only, not a sheet.\n\n"
            "[SAVE AS]\ndone/r%d.png\n" % (change.strip().rstrip('.'), k))


def frame0_prompt(description: str, animation_note: str) -> str:
    return ("[STYLE]\n" + STYLE + "\n\n[CONTENT]\nCharacter portrait. Original description: " + description + "\n\n"
            "[ANIMATION NOTE]\n" + animation_note + "\n\n[CONSTRAINTS]\n" + CONSTRAINT + "\n\n[SAVE AS]\ndone/r0.png\n")


# ------------------------------------------------------------------------------------------- frame dedup / composite
def duplicate_of(fs, k: int):
    """Index j < k of an earlier TRUE frame that is pixel-identical to frame k, else None.  A loop that returns to a
    frame it already showed must reuse r(j), not ask the model to repaint it (that is where chain drift would show)."""
    for j in range(k):
        if np.array_equal(fs.frames[j], fs.frames[k]):
            return j
    return None


def composite_step(prev_hi: np.ndarray, model_hi: np.ndarray, mask: np.ndarray, scale: int, grow: int = 2,
                   feather: float = 1.0, base_hi: np.ndarray | None = None, revert: np.ndarray | None = None):
    """Clamp ChatGPT's frame k to the original step delta.

    prev_hi  : restyled frame k-1, RGB at `scale` x native (registered with model_hi)
    model_hi : model output for step k, same geometry (already un-padded and resized)
    mask     : native boolean step mask (frame k vs k-1)
    grow     : native px the mask is dilated (the painted edit never lands pixel-exact)
    feather  : native px gaussian sigma of the blend edge
    revert   : optional native boolean mask of pixels where the original frame k equals the original frame 0; there
               `base_hi` (restyled frame 0) is used instead of the model output, which stops a returning loop from
               accumulating drift on pixels that go back to the base.
    Returns uint8 RGB.  Outside the grown mask the result equals prev_hi EXACTLY."""
    import cv2
    h, w = mask.shape
    m = cv2.dilate(mask.astype(np.uint8), np.ones((2 * grow + 1,) * 2, np.uint8)) if grow else mask.astype(np.uint8)
    hi = cv2.resize(m, (w * scale, h * scale), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    alpha = np.clip(cv2.GaussianBlur(hi, (0, 0), feather * scale), 0, 1) if feather else hi
    alpha = np.maximum(alpha, 0) * (hi > 0)       # feather inward only: never leak outside the grown mask
    content = model_hi.astype(np.float32)
    if revert is not None and base_hi is not None and revert.any():
        rv = cv2.resize(revert.astype(np.uint8), (w * scale, h * scale), interpolation=cv2.INTER_NEAREST).astype(bool)
        content[rv] = base_hi.astype(np.float32)[rv]
    a = alpha[..., None]
    out = prev_hi.astype(np.float32) * (1 - a) + content * a
    res = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    res[alpha == 0] = prev_hi[alpha == 0]
    return res


def delta_mask_iou(mask: np.ndarray, model_prev_diff: np.ndarray, thr: float = 24.0) -> float:
    """IoU between the original step mask and where the model output actually moved away from r(k-1), both native
    (model_prev_diff = per-native-pixel mean abs RGB difference).  <~0.5 => the model edited the wrong place."""
    got = model_prev_diff > thr
    u = (got | mask).sum()
    return float((got & mask).sum() / u) if u else 1.0


# ------------------------------------------------------------------------------------------- pack
DA_INSTR = """# Frame-kaede-pakke - {id}

Manuel arbejdsgang med ChatGPT i browseren (ingen API, intet billedmodelkald er lavet af vaerktoejet). Alt forbliver lokalt
og skal IKKE i git. Originalen har {n} frames; frame 0 restyles foerst, derefter redigeres hver frame ud fra den FORRIGE
restylede frame ("kaede-tilstand"), saa hvert trin er en lille aendring.

## Trin 0 - frame 0
1. Ny chat i ChatGPT. Traek `00_f0_input.png` ind, indsaet `00_prompt_f0.txt`, send.
2. Gem resultatet som `done/r0.png` (3:2, typisk 1536x1024). Gentag til det er godt - alle senere trin bygger paa det.

## Trin k = 1 .. {last}
For hvert trin (`stepKK_*`) - en NY chat per trin, billederne i PRÆCIS denne raekkefoelge (rækkefølgen er en del af prompten):
1. Billede 1: `done/r<k-1>.png` (det forrige restylede billede; for trin 1 er det `done/r0.png`)
2. Billede 2: `stepKK_img2_orig_prev.png` (originalen, frame k-1)
3. Billede 3: `stepKK_img3_orig_k.png` (originalen, frame k)
4. Billede 4 (valgfrit): `stepKK_img4_diff.png` (magenta = pixels der aendrer sig)
5. Indsaet `stepKK_prompt.txt`. Beskrivelsen af aendringen staar i `descriptions.json`; ret feltet `manual` hvis den
   lokale model tog fejl, og koer derefter `python tools/imggen_frame_chain.py pack {id}` igen.
6. Gem resultatet som `done/r<k>.png`.
Trin der er markeret "ingen aendring" / "genbrug" i `steps.json` har ingen prompt: brug det angivne tidligere billede.

## Naar du er faerdig
    python tools/imggen_frame_chain.py composite {id} --step K --prev done/r<k-1>.png --model-out done/r<k>.png

Det begraenser aendringen til originalens delta-maske, saa alt uden for masken er pixel-identisk med forrige frame.
Se `steps.json` for beskrivelser, maske-andele og genbrug. Billede 1 er det vigtigste - bliver resultatet et helt nyt
billede, saa genkoer trinnet (en frisk chat er bedre end at bede om rettelser).
"""


def load_cache(path):
    return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}


def candidate_description(cid: str) -> str:
    try:
        for c in json.load(open(CAND_JSON, encoding='utf-8'))['candidates']:
            if c['id'] == cid:
                return c.get('description') or '(no written description yet - describe the picture yourself)'
    except OSError:
        pass
    return '(no written description yet - describe the picture yourself)'


def build_pack(cid: str, outroot: str = CHAIN, describe: bool = False, model: str = DEFAULT_MODEL, describer=None,
               fs=None, rec=None, description: str | None = None):
    if fs is None:
        fs, rec = load_candidate(cid)
    out = os.path.join(outroot, cid)
    os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(out, 'done'), exist_ok=True)
    cache_path = os.path.join(out, 'descriptions.json')
    cache = load_cache(cache_path)
    f0, s, box = on_canvas(fs.rgb(0))
    f0.save(os.path.join(out, '00_f0_input.png'))
    note = ("This picture is the first frame (frame 0) of a short %d-frame loop. Draw it neutrally and keep every feature that will later "
            "change clearly drawn, simple and unobstructed, so that later edits can change only that part." % fs.n)
    open(os.path.join(out, '00_prompt_f0.txt'), 'w', encoding='utf-8', newline='\n').write(
        frame0_prompt(description or candidate_description(cid), note))
    steps = []
    for k in range(1, fs.n):
        tag = 'step%02d' % k
        m = step_mask(fs, k)
        st = dict(step=k, changed_fraction=round(float(m.mean()), 5), region=region_words(m), reuse=None, prompt=None)
        dup = duplicate_of(fs, k)
        if not m.any():
            st.update(change=NO_CHANGE, reuse=f'r{k - 1}', note='identical to previous frame: copy r%d' % (k - 1))
            steps.append(st)
            continue
        if dup is not None:
            st.update(change='returns to frame %d' % dup, reuse=f'r{dup}',
                      note='pixel-identical to original frame %d: reuse r%d, do not repaint' % (dup, dup))
            steps.append(st)
            continue
        on_canvas(fs.rgb(k - 1))[0].save(os.path.join(out, f'{tag}_img2_orig_prev.png'))
        on_canvas(fs.rgb(k))[0].save(os.path.join(out, f'{tag}_img3_orig_k.png'))
        on_canvas(diff_highlight(fs, k))[0].save(os.path.join(out, f'{tag}_img4_diff.png'))
        panels(fs, k).save(os.path.join(out, f'{tag}_panels.png'))
        if describe:
            describe_step(fs, k, cache, model, describer=describer)
        else:
            ent = cache.setdefault(str(k), {'auto': None, 'manual': '', 'model': None, 'region': None})
            ent['region'] = region_words(m)
        ch = final_description(cache[str(k)]) or '<<DESCRIBE THE CHANGE - run with --describe or fill "manual" in descriptions.json>>'
        src = 'manual' if (cache[str(k)].get('manual') or '').strip() else ('auto' if (cache[str(k)].get('auto') or '').strip() else 'none')
        st.update(change=ch, prompt=f'{tag}_prompt.txt', description_source=src)
        open(os.path.join(out, f'{tag}_prompt.txt'), 'w', encoding='utf-8', newline='\n').write(chain_prompt(k, ch))
        steps.append(st)
    json.dump(cache, open(cache_path, 'w', encoding='utf-8'), indent=1)
    json.dump(dict(id=cid, frames=fs.n, scale=s, canvas_box=box, native_size=list(fs.shape[::-1]), steps=steps,
                   model=model if describe else None), open(os.path.join(out, 'steps.json'), 'w', encoding='utf-8'), indent=1)
    open(os.path.join(out, 'INSTRUCTIONS.md'), 'w', encoding='utf-8', newline='\n').write(
        DA_INSTR.format(id=cid, n=fs.n, last=fs.n - 1))
    return out, steps


# ------------------------------------------------------------------------------------------- CLI
def cmd_composite(a):
    import cv2
    fs, _rec = load_candidate(a.id)
    k = a.step
    prev = np.asarray(Image.open(a.prev).convert('RGB'))
    mod = np.asarray(Image.open(a.model_out).convert('RGB'))
    s, box = fit_scale(fs.shape[1], fs.shape[0], (prev.shape[1], prev.shape[0]))
    crop = lambda im: np.ascontiguousarray(im[box[1]:box[1] + box[3], box[0]:box[0] + box[2]])
    prev_c, mod_c = crop(prev), crop(mod)
    if mod_c.shape != prev_c.shape:
        mod_c = cv2.resize(mod_c, prev_c.shape[1::-1], interpolation=cv2.INTER_LANCZOS4)
    m = step_mask(fs, k)
    out = composite_step(prev_c, mod_c, m, s)
    full = prev.copy()
    full[box[1]:box[1] + box[3], box[0]:box[0] + box[2]] = out
    dest = a.out or os.path.join(os.path.dirname(a.model_out), f'r{k}_composited.png')
    Image.fromarray(full).save(dest)
    nat = np.abs(mod_c.astype(np.float32) - prev_c.astype(np.float32)).mean(axis=2)
    nat = nat.reshape(fs.shape[0], s, fs.shape[1], s).mean(axis=(1, 3))
    iou = delta_mask_iou(m, nat)
    outside = ~cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    print(f'{dest}  model-vs-prev drift outside mask={nat[outside].mean():.2f} levels  IoU(model change, original delta)={iou:.2f}'
          + ('  -> REJECT? (IoU < 0.5: model edited the wrong place)' if iou < 0.5 else ''))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    for n in ('pack', 'describe'):
        p = sub.add_parser(n)
        p.add_argument('id')
        p.add_argument('--model', default=DEFAULT_MODEL)
        p.add_argument('--describe', action='store_true')
    c = sub.add_parser('composite')
    c.add_argument('id')
    c.add_argument('--step', type=int, required=True)
    c.add_argument('--prev', required=True)
    c.add_argument('--model-out', required=True)
    c.add_argument('--out')
    a = ap.parse_args(argv)
    if a.cmd == 'composite':
        return cmd_composite(a)
    out, steps = build_pack(a.id, describe=a.describe or a.cmd == 'describe', model=a.model)
    print(out)
    for st in steps:
        print(' ', st['step'], st['changed_fraction'], '|', st['change'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
