#!/usr/bin/env python3
"""imggen_hub_pack.py - HUB-mode restyle packs for animated Gold Box pictures (no image model is called).

  python tools/imggen_hub_pack.py <candidate-id> [--describe] [--model qwen3.5:9b]
  python tools/imggen_hub_pack.py composite <candidate-id> --step K --model-out FILE --prev FILE   # after ChatGPT

The approved method (CoK PIC1:23, 2026-10-14): frame 0 is the HUB. Every other distinct frame k is made as ONE edit of
the restyled frame 0 - never of an earlier state - so drift cannot accumulate across the loop. Playback is
frame 0 -> r(k) -> frame 0 -> ...; a frame pixel-identical to an earlier one reuses that r(j).

Reuses the describer, mask and clamp helpers of imggen_frame_chain (same descriptions.json cache format, same
`manual` override that always wins). Packs go to renders/imggen/animation/chain/<id>_hub/ (git-ignored).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import imggen_frame_chain as C  # noqa: E402

MAGENTA = C.MAGENTA
NO_CHANGE = C.NO_CHANGE


def hub_mask(fs, k: int) -> np.ndarray:
    """Native boolean mask: pixels where TRUE frame k differs from TRUE frame 0 (the hub)."""
    m = fs.frames[k] != fs.frames[0]
    if fs.transparent is not None:
        m &= fs.frames[k] != fs.transparent
    return m


def hub_diff_highlight(fs, k: int) -> np.ndarray:
    """Frame k with the pixels that differ from frame 0 tinted magenta (a locator only, never composited)."""
    import cv2
    m = hub_mask(fs, k)
    out = fs.rgb(k).astype(np.float32)
    out[m] = out[m] * 0.5 + np.array(MAGENTA, np.float32) * 0.5
    if m.any():
        grown = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        out[grown & ~m] = MAGENTA
    return np.clip(out, 0, 255).astype(np.uint8)


def hub_images(fs, k: int):
    """Describer input for hub step k: ORIGINAL frame 0 then ORIGINAL frame k, each 4x nearest."""
    s = 4
    up = lambda rgb: Image.fromarray(np.ascontiguousarray(rgb)).resize((rgb.shape[1] * s, rgb.shape[0] * s), Image.NEAREST)
    return [up(fs.rgb(0)), up(fs.rgb(k))]


def hub_prompt(k: int, change: str) -> str:
    """Prompt for hub step k: edit the restyled frame 0 (Image 1) so that the change appears; save as r(k)."""
    return ("[ATTACHMENTS]\n"
            "Image 1 = the finished restyled picture of frame 0 (the hub, the one to edit; this is the resting state)\n"
            "Image 2 = the ORIGINAL low-resolution frame 0 (resting state)\n"
            "Image 3 = the ORIGINAL low-resolution target frame %d\n"
            "Image 4 = Image 3 with the pixels that differ from Image 2 marked in magenta\n\n"
            "[TASK]\nEdit the first image so that: %s\n"
            "Everything else must stay identical to the first image: same painting style, brushwork, palette, lighting, "
            "background, face shape, hair, clothing, framing and pixel positions; same canvas (1536x1024), no re-centering, "
            "no zoom, no new objects, no text. Images 2-4 only show WHAT changes (small pixel art, low quality) - never copy "
            "their style or colours into the result. Output one picture only, not a sheet.\n\n"
            "[SAVE AS]\ndone/r%d.png\n" % (k, change.strip().rstrip('.'), k))


def build_hub_pack(cid: str, outroot: str = C.CHAIN, describe: bool = False, model: str = C.DEFAULT_MODEL,
                   describer=None, fs=None, rec=None, description: str | None = None):
    """Write the hub pack for animated picture cid.  Returns (out_dir, steps)."""
    if fs is None:
        fs, rec = C.load_candidate(cid)
    out = os.path.join(outroot, cid + '_hub')
    os.makedirs(os.path.join(out, 'done'), exist_ok=True)
    cache_path = os.path.join(out, 'descriptions.json')
    cache = C.load_cache(cache_path)
    f0, s, box = C.on_canvas(fs.rgb(0))
    f0.save(os.path.join(out, '00_f0_input.png'))
    note = ("This picture is the first frame (frame 0) of a short %d-frame loop. Draw it neutrally and keep every feature "
            "that will later change clearly drawn, simple and unobstructed, so that later edits can change only that part."
            % fs.n)
    open(os.path.join(out, '00_prompt_f0.txt'), 'w', encoding='utf-8', newline='\n').write(
        C.frame0_prompt(description or C.candidate_description(cid), note))
    steps = []
    for k in range(1, fs.n):
        tag = 'hub%d' % k
        m = hub_mask(fs, k)
        st = dict(step=k, changed_fraction=round(float(m.mean()), 5), region=C.region_words(m), reuse=None, prompt=None)
        if not m.any():
            st.update(change=NO_CHANGE, reuse='r0', note='identical to frame 0: show the hub itself')
            steps.append(st)
            continue
        dup = C.duplicate_of(fs, k)
        if dup is not None:
            st.update(change='returns to frame %d' % dup, reuse='r%d' % dup,
                      note='pixel-identical to original frame %d: reuse r%d, do not repaint' % (dup, dup))
            steps.append(st)
            continue
        C.on_canvas(fs.rgb(0))[0].save(os.path.join(out, f'{tag}_img2_orig_f0.png'))
        C.on_canvas(fs.rgb(k))[0].save(os.path.join(out, f'{tag}_img3_orig_target.png'))
        C.on_canvas(hub_diff_highlight(fs, k))[0].save(os.path.join(out, f'{tag}_img4_diff.png'))
        ent = cache.setdefault(f'h{k}', {'auto': None, 'manual': '', 'model': None, 'region': None})
        ent['region'] = st['region']
        if describe and not (ent.get('auto') and ent.get('model') == model and not ent.get('stale')):
            ent['auto'] = (describer or C.ollama_describe)(hub_images(fs, k), C.describe_prompt(st['region'], 'two'), model)
            ent['model'] = model
        ch = C.final_description(ent)
        if not ch or ch == NO_CHANGE:
            # the pixels differ, so 'No change.' is wrong: keep a visible placeholder instead of guessing
            ch = '<<DESCRIBE THE CHANGE - the model gave no usable text; fill "manual" in descriptions.json>>'
        src = 'manual' if (ent.get('manual') or '').strip() else ('auto' if (ent.get('auto') or '').strip() else 'none')
        st.update(change=ch, prompt=f'{tag}_prompt.txt', description_source=src)
        open(os.path.join(out, f'{tag}_prompt.txt'), 'w', encoding='utf-8', newline='\n').write(hub_prompt(k, ch))
        steps.append(st)
    json.dump(cache, open(cache_path, 'w', encoding='utf-8'), indent=1)
    json.dump(dict(id=cid, mode='hub', frames=fs.n, scale=s, canvas_box=box, native_size=list(fs.shape[::-1]),
                   steps=steps, model=model if describe else None),
              open(os.path.join(out, 'steps.json'), 'w', encoding='utf-8'), indent=1)
    lines = ['1. done/r0.png (restyled frame 0, the hub)']
    for st in steps:
        what = st['change'] if st.get('prompt') else st.get('note', '')
        lines.append('%d. done/r%d.png  (%s)' % (len(lines) + 1, st['step'], what) if st.get('prompt')
                     else '%d. done/%s.png  (%s)' % (len(lines) + 1, st['reuse'], what))
        lines.append('%d. done/r0.png (hub)' % (len(lines) + 1))
    open(os.path.join(out, 'PLAYBACK.md'), 'w', encoding='utf-8', newline='\n').write(
        '# %s - hub pack (frame 0 is the hub)\n\nAfspilning: frame 0 -> aendring -> frame 0 -> ...\n\n%s\n\n'
        'Hver aendring laves ud fra det RESTYLEDE frame 0 (Image 1), aldrig fra det forrige billede.\n'
        % (cid, '\n'.join(lines)))
    return out, steps


def cmd_composite(a):
    """Clamp ChatGPT's hub frame k to the change vs frame 0; outside the grown mask the result equals r0 exactly."""
    import cv2
    fs, _rec = C.load_candidate(a.id)
    k = a.step
    prev = np.asarray(Image.open(a.prev).convert('RGB'))
    mod = np.asarray(Image.open(a.model_out).convert('RGB'))
    s, box = C.fit_scale(fs.shape[1], fs.shape[0], (prev.shape[1], prev.shape[0]))
    crop = lambda im: np.ascontiguousarray(im[box[1]:box[1] + box[3], box[0]:box[0] + box[2]])
    prev_c, mod_c = crop(prev), crop(mod)
    if mod_c.shape != prev_c.shape:
        mod_c = cv2.resize(mod_c, prev_c.shape[1::-1], interpolation=cv2.INTER_LANCZOS4)
    m = hub_mask(fs, k)
    out = C.composite_step(prev_c, mod_c, m, s)
    full = prev.copy()
    full[box[1]:box[1] + box[3], box[0]:box[0] + box[2]] = out
    dest = a.out or os.path.join(os.path.dirname(a.model_out), f'r{k}_composited.png')
    Image.fromarray(full).save(dest)
    print(dest)
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == 'composite':
        ap = argparse.ArgumentParser(prog='imggen_hub_pack.py composite')
        ap.add_argument('composite')
        ap.add_argument('id')
        ap.add_argument('--step', type=int, required=True)
        ap.add_argument('--prev', required=True)
        ap.add_argument('--model-out', required=True)
        ap.add_argument('--out')
        return cmd_composite(ap.parse_args(argv))
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('id')
    ap.add_argument('--model', default=C.DEFAULT_MODEL)
    ap.add_argument('--describe', action='store_true')
    a = ap.parse_args(argv)
    out, steps = build_hub_pack(a.id, describe=a.describe, model=a.model)
    print(out)
    for st in steps:
        print(' ', st['step'], st['changed_fraction'], '|', st['change'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
