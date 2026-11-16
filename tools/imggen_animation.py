#!/usr/bin/env python3
"""imggen_animation.py - which Gold Box pictures are animated, how much of them moves, and how to restyle them.

  python tools/imggen_animation.py measure     # -> renders/imggen/animation/summary.json, contact sheets,
                                               #    candidates_animation.json
  python tools/imggen_animation.py prototype   # -> renders/imggen/animation/proto/*.gif + strips + proto.json

Research doc: docs/engine/research/imggen-animated-pictures.md.  Tests: tools/test_imggen_animation.py.
Nothing here calls an image model.  The "restyle" in `prototype` is a SIMULATION (upscale + colour shift + smooth
geometric warp) and every output is labelled that way.

Measured facts this encodes (all derived by the loaders below from the original bytes, see the doc):
  * Frame k >= 1 of a CoK/DoK Amiga or DOS PIC block, and of a Gateway DOS PIC block, is stored as an XOR delta
    against frame 0; the loaders already return the *applied* frame, so `frame_k != frame_0` is the exact set of
    pixels the animation touches.
  * DQK (HLIB 'PICA/B/C', GLIB 'PIC') stores frame 0 as an opaque image and every further image of the set as a
    transparent-index-255 OVERLAY patch; the patch is composited onto frame 0 at its (x, y) offset.
  * Pool of Radiance Amiga `pic.dax` stores full frames (each with its own delay).
  * Gateway Amiga `Pic.tlb` holds exactly one image per set (73/73): the Amiga port of those portraits is static.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from dataclasses import dataclass, field

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

OUT = os.path.join(ROOT, 'renders', 'imggen', 'animation')
CAND_JSON = os.path.join(ROOT, 'renders', 'imggen', 'candidates', 'candidates.json')

WHD = ("D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked")
GOG = "C:/Program Files (x86)/GOG Galaxy/Games"
DQK_DOS = GOG + "/The Dark Queen of Krynn"
DQK_AMIGA = WHD + "/DarkQueenOfKrynn/data"
GATEWAY_DOS = GOG + "/Gateway to the Savage Frontier"
GATEWAY_AMIGA = WHD + "/GatewayToSavageFrontier/data/DiskB/Pic.tlb"
POOL_AMIGA = WHD + "/PoolOfRadiance/data"

# classification thresholds (fractions of the picture area / bbox area)
STATIC_MAX = 0.0           # nothing changed at all -> 'static-duplicate'
SMALL_REGION_MAX = 0.25    # bbox <= 25% of the picture: a local loop (eyes, mouth, a flame)
MEDIUM_REGION_MAX = 0.60   # bbox 25..60%: a large region (head, torso)
# above that the bbox spans most of the picture: 'scattered' if few pixels change, else 'full-picture'
SCATTERED_MAX_CHANGED = 0.25


# --------------------------------------------------------------------------------------------- data model
@dataclass
class FrameSet:
    game: str                    # cok dok dqk gateway pool
    platform: str                # amiga dos
    family: str                  # PIC PICA PICB PICC SPRIT FINAL BIGPIC HEAD BODY ...
    key: str                     # stable id, e.g. 'PIC1:5' or 'PICA:set03'
    frames: list                 # list of (h, w) uint8 palette-index arrays, all the same shape, deltas APPLIED
    palette: np.ndarray          # (256, 3) uint8
    transparent: int | None = None
    delays: list = field(default_factory=list)
    note: str = ''

    @property
    def n(self) -> int:
        return len(self.frames)

    @property
    def shape(self):
        return self.frames[0].shape

    def rgb(self, k: int = 0) -> np.ndarray:
        return self.palette[self.frames[k]]


def pal256(pal) -> np.ndarray:
    a = np.zeros((256, 3), np.uint8)
    p = np.asarray(list(pal), np.uint8).reshape(-1, 3)[:256]
    a[:len(p)] = p
    return a


# --------------------------------------------------------------------------------------------- analysis
def bbox_of(mask: np.ndarray):
    """(x0, y0, x1, y1) half-open bounding box of True pixels, or None."""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def component_count(mask: np.ndarray) -> int:
    """4-connected components of a boolean mask (small pure-numpy flood fill via scipy if present)."""
    try:
        from scipy import ndimage
        return int(ndimage.label(mask)[1])
    except Exception:           # pragma: no cover
        return -1


def classify(frac_union: float, bbox_frac: float, n_frames: int, n_changed_frames: int) -> str:
    if n_frames <= 1:
        return 'single'
    if n_changed_frames == 0 or frac_union <= STATIC_MAX:
        return 'static-duplicate'
    if bbox_frac <= SMALL_REGION_MAX:
        return 'region-loop'
    if bbox_frac <= MEDIUM_REGION_MAX:
        return 'large-region'
    if frac_union <= SCATTERED_MAX_CHANGED:
        return 'scattered'          # changes spread over most of the picture but touching < 25% of its pixels
    return 'full-picture'


def analyse(fs: FrameSet) -> dict:
    """Per-frame-set delta statistics.  Every frame is compared with frame 0 (the base)."""
    base = fs.frames[0]
    h, w = base.shape
    area = h * w
    per = []
    union = np.zeros(base.shape, bool)
    for k in range(1, fs.n):
        m = fs.frames[k] != base
        if fs.transparent is not None:       # a transparent hole in a frame is not a change
            m &= fs.frames[k] != fs.transparent
        union |= m
        per.append(dict(frame=k, changed_fraction=round(float(m.mean()), 5), bbox=bbox_of(m)))
    bb = bbox_of(union)
    bb_frac = 0.0 if bb is None else (bb[2] - bb[0]) * (bb[3] - bb[1]) / area
    n_changed = sum(1 for p in per if p['bbox'] is not None)
    frac = float(union.mean())
    return dict(
        game=fs.game, platform=fs.platform, family=fs.family, key=fs.key, size=[w, h], frames=fs.n,
        changed_fraction=round(frac, 5), bbox=bb, bbox_fraction=round(bb_frac, 5),
        components=component_count(union) if frac else 0,
        kind=classify(frac, bb_frac, fs.n, n_changed), per_frame=per,
        delays=list(fs.delays), note=fs.note)


# --------------------------------------------------------------------------------------------- loaders
def _load_mod(name):
    import importlib
    return importlib.import_module(name)


def load_amiga_cokdok(game: str):
    """CoK/DoK Amiga .DAA: PIC (XOR deltas applied by amiga_cokdok_render), SPRIT, BIGPIC/HEAD/BODY (single)."""
    R = _load_mod('amiga_cokdok_render')
    pics, _inv, _notes = R.load_game(game)
    groups: dict = {}
    for p in pics:
        if p.family == 'LBM':
            continue
        groups.setdefault((p.stem, p.block), []).append(p)
    out = []
    for (stem, block), ps in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        ps.sort(key=lambda p: p.frame)
        fam = ps[0].family
        fs = FrameSet(game, 'amiga', fam, f"{stem}:{block}", [p.idx for p in ps], pal256(ps[0].palette),
                      note='XOR deltas applied' if fam == 'PIC' or (fam == 'SPRIT' and game == 'cok') else '')
        out.append(fs)
    return out


def load_dos_cokdok(game: str):
    """CoK/DoK DOS .DAX picture arrays (PIC*/SPRIT*/HEAD*/BODY*/BIGPIC*/...), frames > 0 XOR-delta against 0 for PIC."""
    R = _load_mod('amiga_cokdok_render')
    DAX = _load_mod('dax_decode')
    SF = _load_mod('subframe_decode')
    out = []
    d = R.DOS_DIRS[game]
    for path in sorted(glob.glob(os.path.join(d, '*.DAX'))):
        stem = os.path.splitext(os.path.basename(path))[0].upper()
        if not re.match(r'^(BIGPIC|HEAD|BODY|PIC|SPRIT)\d*$', stem):
            continue
        fam = re.match(r'^[A-Z]+', stem).group(0)
        data = open(path, 'rb').read()
        base, blocks = DAX.parse_container(data)
        for b in blocks:
            raw = DAX.decompress_block(data, base, b)
            try:
                r = SF.parse_anim_array(raw, fam == 'PIC')
            except Exception:
                r = None
            if not r or not r[0]:
                continue
            frs = r[0]
            shapes = {(f['height'], f['width']) for f in frs}
            if len(shapes) != 1:
                continue                      # frames of differing size are not a same-canvas animation
            h, w = shapes.pop()
            idx = [R._nibbles(np.frombuffer(f['pixels'], np.uint8), h, w) for f in frs]
            out.append(FrameSet(game, 'dos', fam, f"{stem}:{b.block_id}", idx, pal256(DAX.EGA_PALETTE),
                                delays=[f['delay'] for f in frs],
                                note='XOR deltas applied' if fam == 'PIC' else ''))
    return out


def _composite_overlays(imgs, transparent=255):
    """imgs: list of (w, h, indices(h*w), x, y) with imgs[0] the opaque base.  Frame k = base with patch k painted
    over at its offset relative to the base (transparent index skipped).  Returns the frame list."""
    w0, h0, px0, x0, y0 = imgs[0]
    base = np.array(px0, np.uint8).reshape(h0, w0)
    frames = [base]
    for (w, h, px, x, y) in imgs[1:]:
        fr = base.copy()
        patch = np.array(px, np.uint8).reshape(h, w)
        ox, oy = x - x0, y - y0
        sx0, sy0 = max(ox, 0), max(oy, 0)
        sx1, sy1 = min(ox + w, w0), min(oy + h, h0)
        if sx1 > sx0 and sy1 > sy0:
            sub = patch[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox]
            keep = sub != transparent
            region = fr[sy0:sy1, sx0:sx1]
            region[keep] = sub[keep]
        frames.append(fr)
    return frames


def load_dqk_dos():
    H = _load_mod('hlib_decode')
    out = []
    for path in sorted(glob.glob(DQK_DOS + '/DISK*/PIC[ABC].TLB') + glob.glob(DQK_DOS + '/DISK*/BIGPIC.TLB')):
        fam = os.path.splitext(os.path.basename(path))[0].upper()
        sets: dict = {}
        for lab, w, h, px, pal, dm, x, y in H.walk(open(path, 'rb').read()):
            sets.setdefault(lab.split('_')[0], []).append((w, h, px, x, y, pal))
        for s, v in sets.items():
            frames = _composite_overlays([t[:5] for t in v])
            out.append(FrameSet('dqk', 'dos', fam, f"{fam}:{s}", frames, pal256(v[0][5]), transparent=None,
                                note=f"{len(v) - 1} overlay patch(es), sizes {[(t[0], t[1]) for t in v[1:]]}"))
    return out


def load_dqk_amiga():
    G = _load_mod('glib_decode')
    out = []
    for path in sorted(glob.glob(DQK_AMIGA + '/Disk*/PIC[ABC].TLB') + glob.glob(DQK_AMIGA + '/Disk*/BIGPIC.TLB')):
        fam = os.path.splitext(os.path.basename(path))[0].upper()
        sets: dict = {}
        for t in G.walk(open(path, 'rb').read()):
            lab, w, h, px, pal = t[0], t[1], t[2], t[3], t[4]
            sets.setdefault(lab.split('_')[0], []).append((w, h, px, 0, 0, pal))
        for s, v in sets.items():
            if len({(t[0], t[1]) for t in v[:1]}) != 1:
                continue
            frames = _composite_overlays([t[:5] for t in v])
            out.append(FrameSet('dqk', 'amiga', fam, f"{fam}:{s}", frames, pal256(v[0][5] or [(0, 0, 0)] * 256),
                                note=f"{len(v) - 1} overlay patch(es), no stored offset (assumed 0,0)"))
    return out


def load_gateway():
    GA = _load_mod('gateway_amiga_render')
    D = _load_mod('gateway_pic_decode')
    G = _load_mod('glib_decode')
    out = []
    for (fname, bid), frs in sorted(GA.load_dos_pics(GATEWAY_DOS).items()):
        stem = os.path.splitext(fname)[0]
        out.append(FrameSet('gateway', 'dos', stem, f"{stem}:{bid}", frs, pal256(D.build_palette()),
                            note='XOR deltas applied; palette = EGA16 + two extended registers (approximate)'))
    for n, (idx, pal) in sorted(GA.load_amiga_pics(GATEWAY_AMIGA).items()):
        out.append(FrameSet('gateway', 'amiga', 'PIC', f"PIC:{n}", [idx], pal256(pal or [(0, 0, 0)] * 256),
                            note='Pic.tlb: one image per set'))
    return out


POOL_XOR_NOTE = ('docs/pool-amiga-format.md s3 says pic/final frames are "full frames, no XOR delta". Measured against that: '
                 'raw frame k has 60-93% zero indices and an edge density far from frame 0, while frame0^frame_k matches '
                 "frame 0's edge density in 47 of 52 multi-frame PIC blocks (raw 2, overlay 3); see test_pool_xor_hypothesis.")


def load_pool_amiga():
    P = _load_mod('pool_amiga_decode')
    out = []
    pal = pal256(P.PALETTES['pic'])
    for stem in ('pic', 'final'):
        path = os.path.join(POOL_AMIGA, stem + '.dax')
        if not os.path.exists(path):
            continue
        data = open(path, 'rb').read()
        base, blocks = P.parse_container(data)
        for b in blocks:
            raw = P.decompress_block(data, base, b)
            fr = P.parse_animated(raw)
            if fr:
                shapes = {(f[2], f[1]) for f in fr}
                if len(shapes) != 1:
                    continue
                arr = [np.array(f[3], np.uint8).reshape(f[2], f[1]) for f in fr]
                arr = [arr[0]] + [arr[0] ^ a for a in arr[1:]]     # stored frames k>=1 are XOR deltas (see POOL_XOR_NOTE)
                out.append(FrameSet('pool', 'amiga', stem.upper(), f"{stem.upper()}:{b.block_id}", arr, pal,
                                    delays=[f[0] for f in fr], note='XOR deltas applied (measured, see doc)'))
                continue
            std = P.parse_standard(raw)
            if std:
                w, h, frs = std
                out.append(FrameSet('pool', 'amiga', stem.upper(), f"{stem.upper()}:{b.block_id}",
                                    [np.array(f, np.uint8).reshape(h, w) for f in frs], pal, note='full frames'))
    return out


LOADERS = {
    'cok-amiga': lambda: load_amiga_cokdok('cok'), 'dok-amiga': lambda: load_amiga_cokdok('dok'),
    'cok-dos': lambda: load_dos_cokdok('cok'), 'dok-dos': lambda: load_dos_cokdok('dok'),
    'dqk-dos': load_dqk_dos, 'dqk-amiga': load_dqk_amiga, 'gateway': load_gateway, 'pool-amiga': load_pool_amiga,
}


def load_all(only=None):
    sets, errors = [], {}
    for name, fn in LOADERS.items():
        if only and name not in only:
            continue
        try:
            sets += fn()
        except Exception as e:           # a missing source tree is reported, never silently dropped
            errors[name] = f"{type(e).__name__}: {e}"
    return sets, errors


# --------------------------------------------------------------------------------------------- contact sheets
def highlight(fs: FrameSet, k: int = 0, strength: float = 0.35) -> np.ndarray:
    """Frame-0 RGB, dimmed, with every pixel that ANY later frame changes painted red (union mask)."""
    base = fs.rgb(0).astype(np.float32)
    union = np.zeros(fs.shape, bool)
    for f in fs.frames[1:]:
        union |= f != fs.frames[0]
    out = base * strength
    out[union] = (255, 40, 40)
    return out.astype(np.uint8)


def sheet_for(fs: FrameSet, scale: int = 2, max_frames: int = 8):
    """One row: frame 0 | highlight | frames 1..n-1 (each shown as its OWN picture, a thin separator between)."""
    from PIL import Image
    tiles = [fs.rgb(0), highlight(fs)] + [fs.rgb(k) for k in range(1, min(fs.n, max_frames))]
    h, w = fs.shape
    sep = 4
    canvas = np.full((h, len(tiles) * (w + sep), 3), 40, np.uint8)
    for i, t in enumerate(tiles):
        canvas[:, i * (w + sep):i * (w + sep) + w] = t
    im = Image.fromarray(canvas)
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


def contact_sheet(sets, path, per_page=12, scale=2, title=None):
    from PIL import Image, ImageDraw
    rows = [(fs, sheet_for(fs, scale)) for fs in sets]
    if not rows:
        return None
    W = max(r[1].width for r in rows)
    pages = []
    for i in range(0, len(rows), per_page):
        chunk = rows[i:i + per_page]
        lab = 14
        H = sum(r[1].height + lab for r in chunk)
        page = Image.new('RGB', (W, H), (20, 20, 20))
        d = ImageDraw.Draw(page)
        y = 0
        for fs, im in chunk:
            a = analyse(fs)
            d.text((2, y + 1), f"{fs.game}/{fs.platform} {fs.key}  frames={fs.n}  changed={a['changed_fraction']:.1%}  "
                               f"bbox={a['bbox_fraction']:.0%}  kind={a['kind']}", fill=(255, 255, 160))
            page.paste(im, (0, y + lab))
            y += im.height + lab
        pages.append(page)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = []
    for n, p in enumerate(pages):
        fp = path.replace('.png', f"_{n + 1:02d}.png") if len(pages) > 1 else path
        p.save(fp)
        out.append(fp)
    return out


# --------------------------------------------------------------------------------------------- summary
def _stats(vals):
    if not vals:
        return None
    a = np.asarray(vals, float)
    return dict(min=round(float(a.min()), 4), median=round(float(np.median(a)), 4), max=round(float(a.max()), 4))


def summarise(sets, errors=None) -> dict:
    rows = [analyse(fs) for fs in sets]
    fams: dict = {}
    for r in rows:
        k = f"{r['game']}/{r['platform']}/{r['family']}"
        f = fams.setdefault(k, dict(pictures=0, multi_frame=0, frame_count_histogram={}, kinds={}, _cf=[], _bb=[]))
        f['pictures'] += 1
        h = f['frame_count_histogram']
        h[str(r['frames'])] = h.get(str(r['frames']), 0) + 1
        f['kinds'][r['kind']] = f['kinds'].get(r['kind'], 0) + 1
        if r['frames'] > 1:
            f['multi_frame'] += 1
            f['_cf'].append(r['changed_fraction'])
            f['_bb'].append(r['bbox_fraction'])
    for f in fams.values():
        f['changed_fraction'] = _stats(f.pop('_cf'))
        f['bbox_fraction'] = _stats(f.pop('_bb'))
        f['animated_share'] = round(f['multi_frame'] / f['pictures'], 3) if f['pictures'] else 0
    return dict(generated_by='tools/imggen_animation.py measure', thresholds=dict(
        small_region_max_bbox=SMALL_REGION_MAX, medium_region_max_bbox=MEDIUM_REGION_MAX,
        scattered_max_changed=SCATTERED_MAX_CHANGED),
        sources=dict(dqk_dos=DQK_DOS, dqk_amiga=DQK_AMIGA, gateway_dos=GATEWAY_DOS, gateway_amiga=GATEWAY_AMIGA,
                     pool_amiga=POOL_AMIGA), load_errors=errors or {}, families=fams, sets=rows)


# --------------------------------------------------------------------------------------------- candidates
_RX = [
    (re.compile(r'renders/daa/(?:cok|CoK|dok|DoK)_?\w*/(?P<stem>[A-Za-z]+\d*)_(?P<id>\d+)(?:_f(?P<f>\d+))?\.png$'), 'cokdok'),
    (re.compile(r'renders/(?P<lib>hlib|glib)/(?P<fam>[A-Z]+)/(?P=fam)_set(?P<set>\d+)_img(?P<img>\d+)\.png$'), 'dqk'),
    (re.compile(r'renders/pool_amiga/(?P<fam>pic|final)/(?P=fam)_(?P<id>\d+)_f(?P<f>\d+)\.png$'), 'pool'),
    (re.compile(r'renders/gateway-amiga/PIC/amiga_pic_(?P<id>\d+)\.png$'), 'gw-amiga'),
    (re.compile(r'renders/gateway-pic/(?P<fam>PIC\d?)/pic\d?_(?P<id>\d+)\.png$'), 'gw-dos'),
]


def candidate_key(c: dict):
    """candidate dict -> (game, platform, key, source_frame_index, family), or None when the source is not a
    block of a frame-bearing container (IFF screens, titles)."""
    src = c['source']
    for rx, kind in _RX:
        m = rx.match(src)
        if not m:
            continue
        g = m.groupdict()
        if kind == 'cokdok':
            return c['game'], c['platform'], f"{g['stem'].upper()}:{int(g['id'])}", int(g['f'] or 0), g['stem'].upper()
        if kind == 'dqk':
            fam = g['fam']
            plat = 'dos' if g['lib'] == 'hlib' else 'amiga'
            return 'dqk', plat, f"{fam}:set{int(g['set']):02d}", int(g['img']) - 1, fam
        if kind == 'pool':
            fam = g['fam'].upper()
            return 'pool', 'amiga', f"{fam}:{int(g['id'])}", int(g['f']), fam
        if kind == 'gw-amiga':
            return 'gateway', 'amiga', f"PIC:{int(g['id'])}", 0, 'PIC'
        if kind == 'gw-dos':
            stem = 'PIC' + (g['fam'][3:] if len(g['fam']) > 3 else '')
            return 'gateway', 'dos', f"{stem}:{int(g['id'])}", 0, stem
    return None


def candidates_animation(cands: list, sets) -> dict:
    by = {(s.game, s.platform, s.key): s for s in sets}
    dos_gw = {}
    for s in sets:
        if s.game == 'gateway' and s.platform == 'dos':
            dos_gw[int(s.key.split(':')[1])] = s
    out = {}
    for c in cands:
        ck = candidate_key(c)
        if ck is None:
            out[c['id']] = dict(frames=1, changed_fraction=0.0, bbox=None, kind='unmeasured',
                                note='IFF screen/title/logo: no frame container (colour-cycling CRNG chunks not measured)')
            continue
        game, plat, key, sf, fam = ck
        fs = by.get((game, plat, key))
        if fs is None:
            out[c['id']] = dict(frames=None, changed_fraction=None, bbox=None, kind='unmeasured',
                                note=f"{game}/{plat} {key} not produced by the loaders")
            continue
        a = analyse(fs)
        rec = dict(frames=a['frames'], changed_fraction=a['changed_fraction'], bbox=a['bbox'],
                   bbox_fraction=a['bbox_fraction'], kind=a['kind'], block=key, size=a['size'])
        if game == 'dqk' and fs.n > 1 and sf >= 1:
            rec['source_frame_role'] = 'overlay-patch'      # candidate source IS a patch of the set, not a portrait
        elif sf and fs.n > 1:
            rec['source_frame_role'] = 'delta-frame'
        if game == 'gateway' and plat == 'amiga':
            tw = dos_gw.get(int(key.split(':')[1]))
            if tw is not None and tw.n > 1:
                ta = analyse(tw)
                rec['dos_twin'] = dict(key=tw.key, frames=ta['frames'], changed_fraction=ta['changed_fraction'],
                                       kind=ta['kind'])
        out[c['id']] = rec
    return out


# --------------------------------------------------------------------------------------------- CLI: measure
def cmd_measure(args):
    sets, errors = load_all()
    summ = summarise(sets, errors)
    os.makedirs(OUT, exist_ok=True)
    cands = json.load(open(CAND_JSON, encoding='utf-8'))['candidates'] if os.path.exists(CAND_JSON) else []
    cmap = candidates_animation(cands, sets)
    sheets = {}
    groups: dict = {}
    for fs in sets:
        if fs.n > 1 and fs.family != 'SPRIT':
            groups.setdefault(f"{fs.game}_{fs.platform}_{fs.family}", []).append(fs)
    for name, lst in groups.items():
        lst.sort(key=lambda s: (analyse(s)['kind'], s.key))
        sheets[name] = contact_sheet(lst, os.path.join(OUT, 'sheets', name + '.png'), per_page=10)
    summ['contact_sheets'] = {k: [os.path.relpath(p, ROOT).replace(os.sep, '/') for p in v] for k, v in sheets.items()}
    summ['candidate_tally'] = {}
    for v in cmap.values():
        summ['candidate_tally'][v['kind']] = summ['candidate_tally'].get(v['kind'], 0) + 1
    json.dump(summ, open(os.path.join(OUT, 'summary.json'), 'w', encoding='utf-8'), indent=1)
    json.dump(cmap, open(os.path.join(OUT, 'candidates_animation.json'), 'w', encoding='utf-8'), indent=1)
    print(f"{len(sets)} picture sets; errors={errors}; candidates tagged={len(cmap)} tally={summ['candidate_tally']}")
    for k, f in sorted(summ['families'].items()):
        print(f"  {k:24s} pics={f['pictures']:4d} multi={f['multi_frame']:3d} kinds={f['kinds']}")
    return 0


# --------------------------------------------------------------------------------------------- prototype
# SIMULATED restyle.  There is no image model here.  `sim_restyle` = Lanczos upscale + bilateral smoothing + a smooth,
# position-only geometric warp (so the "restyle" does NOT line up pixel-for-pixel with a plain upscale, like a real
# generative restyle) + a hue/saturation/gamma shift.  Everything the prototype outputs is stamped SIMULATED.
SIM_SCALE = 4
SIM_WARP_PX = 2.4            # peak displacement of the warp at 4x (0.6 native pixel)
SIM_DRIFT_WARP_PX = 1.6      # extra per-frame warp amplitude when every frame is restyled independently
SIM_DRIFT_COLOUR = 6.0       # per-frame colour drift in 8-bit levels (independent-restyle model, ASSUMED)


def _colour_shift(rgb: np.ndarray, drift: float = 0.0, rng=None) -> np.ndarray:
    import cv2
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 0] = (hsv[..., 0] + 6) % 180
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.18, 0, 255)
    hsv[..., 2] = 255 * (hsv[..., 2] / 255) ** 0.92
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
    out *= np.array([1.04, 1.0, 0.94], np.float32)
    if drift and rng is not None:
        out += rng.normal(0, drift, 3).astype(np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)


def _warp_field(h: int, w: int, amp: float, phase: float = 0.0):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = amp * np.sin(2 * np.pi * yy / (0.9 * h) + 0.7 + phase)
    dy = amp * np.sin(2 * np.pi * xx / (1.1 * w) + 1.3 + phase)
    return xx, yy, dx, dy


def upscale(rgb: np.ndarray, scale: int = SIM_SCALE) -> np.ndarray:
    import cv2
    return cv2.resize(rgb, (rgb.shape[1] * scale, rgb.shape[0] * scale), interpolation=cv2.INTER_LANCZOS4)


def sim_restyle(rgb: np.ndarray, scale: int = SIM_SCALE, seed: int | None = None) -> np.ndarray:
    """SIMULATED restyle of a native RGB picture.  seed=None is the deterministic 'ideal' model (same warp for every
    frame); an int seed adds per-call warp phase and colour drift = a model that is not perfectly repeatable."""
    import cv2
    up = cv2.bilateralFilter(upscale(rgb, scale), 7, 40, 5)
    rng = np.random.default_rng(seed) if seed is not None else None
    amp = SIM_WARP_PX + (SIM_DRIFT_WARP_PX * rng.random() if rng is not None else 0.0)
    phase = float(rng.random() * 2 * np.pi) if rng is not None else 0.0
    xx, yy, dx, dy = _warp_field(*up.shape[:2], amp, phase)
    up = cv2.remap(up, xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return _colour_shift(up, SIM_DRIFT_COLOUR if rng is not None else 0.0, rng)


def change_mask(fs: FrameSet, k: int, grow: int = 1) -> np.ndarray:
    """Native-resolution boolean mask of the pixels frame k changes vs frame 0, grown by `grow` pixels."""
    m = fs.frames[k] != fs.frames[0]
    if fs.transparent is not None:
        m &= fs.frames[k] != fs.transparent
    if grow:
        import cv2
        m = cv2.dilate(m.astype(np.uint8), np.ones((2 * grow + 1, 2 * grow + 1), np.uint8)).astype(bool)
    return m


def _feather(mask_hi: np.ndarray, sigma: float) -> np.ndarray:
    import cv2
    return np.clip(cv2.GaussianBlur(mask_hi.astype(np.float32), (0, 0), sigma), 0, 1)[..., None]


def _flow_warp(src: np.ndarray, ref_a: np.ndarray, ref_b: np.ndarray) -> np.ndarray:
    """Warp `src` (in ref_a's geometry) into ref_b's geometry using dense Farneback flow ref_a -> ref_b."""
    import cv2
    ga = cv2.cvtColor(ref_a, cv2.COLOR_RGB2GRAY)
    gb = cv2.cvtColor(ref_b, cv2.COLOR_RGB2GRAY)
    flow = cv2.calcOpticalFlowFarneback(ga, gb, None, 0.5, 4, 25, 5, 7, 1.5, 0)
    h, w = ga.shape
    xx, yy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(src, xx - flow[..., 0], yy - flow[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def _match_colour(patch: np.ndarray, src_ref: np.ndarray, dst_ref: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """Reinhard mean/std transfer in Lab.  The transform is ESTIMATED from the unchanged pixels of the `ring`
    (src_ref = original frame 0 in the restyle's geometry, dst_ref = restyled frame 0) and APPLIED to the patch, so a
    patch that legitimately has other colours than its surroundings (a blue breath cloud on black) is not flattened."""
    import cv2
    if ring.sum() < 16:
        return patch
    lab = lambda a: cv2.cvtColor(a, cv2.COLOR_RGB2LAB).astype(np.float32)
    pl, sl, dl = lab(patch), lab(src_ref), lab(dst_ref)
    out = pl.copy()
    for c in range(3):
        ss, ds = sl[..., c][ring], dl[..., c][ring]
        gain = float(np.clip(ds.std() / (ss.std() + 1e-3), 0.5, 2.0))
        out[..., c] = (pl[..., c] - ss.mean()) * gain + ds.mean()
    return cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)


def mask_delta_frames(fs: FrameSet, restyled0: np.ndarray, scale: int = SIM_SCALE, method: str = 'aligned'):
    """Derive restyled frames 1..n-1 from ONE restyled base picture plus the original frame deltas.

    method 'paste'   : upscale original frame k, colour-shift it, paste the changed region (feathered).  Assumes the
                       restyle kept the original geometry.
    method 'aligned' : as paste, but (1) a dense flow from the plain upscale of original frame 0 to the restyled base
                       warps the patch into the restyle's geometry, (2) the patch colours are matched to the base on a
                       ring just outside the changed region.
    Returns list of restyled RGB frames (frame 0 is the restyled base unchanged)."""
    import cv2
    rgb0 = fs.rgb(0)
    ref = _colour_shift(upscale(rgb0, scale))          # what a geometry-preserving restyle of frame 0 would be
    out = [restyled0]
    for k in range(1, fs.n):
        m = change_mask(fs, k, grow=1)
        m_hi = cv2.resize(m.astype(np.uint8), (m.shape[1] * scale, m.shape[0] * scale), interpolation=cv2.INTER_NEAREST).astype(bool)
        content = _colour_shift(upscale(fs.rgb(k), scale))
        if method == 'aligned':
            content = _flow_warp(content, ref, restyled0)
            ref_w = _flow_warp(ref, ref, restyled0)
            wide = cv2.dilate(m_hi.astype(np.uint8), np.ones((2 * scale + 1,) * 2, np.uint8)).astype(bool)
            ring = wide & ~m_hi
            content = _match_colour(content, ref_w, restyled0, ring)
        alpha = _feather(m_hi, sigma=scale * 0.6)
        comp = restyled0.astype(np.float32) * (1 - alpha) + content.astype(np.float32) * alpha
        out.append(np.clip(comp, 0, 255).astype(np.uint8))
    return out


def _grad(rgb: np.ndarray) -> np.ndarray:
    import cv2
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    return np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))


def evaluate(fs: FrameSet, scale: int = SIM_SCALE, seed: int = 11) -> dict:
    """Run the three strategies on one frame set against the deterministic oracle; return metrics + frames."""
    import cv2
    rgbs = [fs.rgb(k) for k in range(fs.n)]
    oracle = [sim_restyle(r, scale) for r in rgbs]                    # ideal: every frame restyled by a repeatable model
    indep = [oracle[0]] + [sim_restyle(r, scale, seed=seed + k) for k, r in enumerate(rgbs) if k]
    res = dict(oracle=oracle, independent=indep)
    for method in ('paste', 'aligned'):
        res[method] = mask_delta_frames(fs, oracle[0], scale, method)
    metrics = {}
    union_hi = None
    for name in ('paste', 'aligned', 'independent'):
        mae, seam, flick = [], [], []
        for k in range(1, fs.n):
            m = change_mask(fs, k, grow=1)
            m_hi = cv2.resize(m.astype(np.uint8), (m.shape[1] * scale, m.shape[0] * scale), interpolation=cv2.INTER_NEAREST).astype(bool)
            diff = np.abs(res[name][k].astype(np.float32) - oracle[k].astype(np.float32)).mean(axis=2)
            if m_hi.any():
                mae.append(float(diff[m_hi].mean()))
                band = cv2.dilate(m_hi.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & \
                    ~cv2.erode(m_hi.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
                g_res, g_or = _grad(res[name][k])[band].mean(), _grad(oracle[k])[band].mean()
                seam.append(float(g_res / (g_or + 1e-6)))
            outside = ~cv2.dilate(m_hi.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
            flick.append(float(np.abs(res[name][k].astype(np.float32) - res[name][0].astype(np.float32)).mean(axis=2)[outside].mean()))
        metrics[name] = dict(mae_in_changed_region=round(float(np.mean(mae)), 2) if mae else None,
                             seam_gradient_ratio=round(float(np.mean(seam)), 3) if seam else None,
                             outside_flicker=round(float(np.mean(flick)), 2) if flick else None)
    return dict(metrics=metrics, frames=res)


def _label(rgb: np.ndarray, text: str) -> np.ndarray:
    from PIL import Image, ImageDraw
    im = Image.fromarray(rgb)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, im.width, 12], fill=(0, 0, 0))
    d.text((2, 0), text, fill=(255, 255, 120))
    return np.asarray(im)


def preview_assets(fs: FrameSet, ev: dict, outdir: str, name: str, scale: int = SIM_SCALE):
    """GIF (original | oracle | paste | aligned | independent, one row) and a PNG frame strip with a seam zoom."""
    from PIL import Image
    os.makedirs(outdir, exist_ok=True)
    cols = [('ORIGINAL', [np.kron(fs.rgb(k), np.ones((scale, scale, 1), np.uint8)) for k in range(fs.n)]),
            ('SIM restyle, ideal', ev['frames']['oracle']),
            ('SIM paste', ev['frames']['paste']),
            ('SIM aligned', ev['frames']['aligned']),
            ('SIM indep. x frame', ev['frames']['independent'])]
    n = fs.n
    gif = []
    for k in range(n):
        row = np.concatenate([_label(c[1][k], f"{c[0]} f{k}") for c in cols], axis=1)
        gif.append(Image.fromarray(row))
    order = list(range(n)) + list(range(n - 2, 0, -1))
    seq = [gif[i] for i in order]
    gif_path = os.path.join(outdir, name + '.gif')
    seq[0].save(gif_path, save_all=True, append_images=seq[1:], duration=220, loop=0)
    # strip: one row per method, columns = frames; plus a 3x zoom of the largest-change frame's bbox
    h, w = fs.shape
    union = np.zeros(fs.shape, bool)
    for k in range(1, n):
        union |= change_mask(fs, k, 1)
    bb = bbox_of(union) or [0, 0, w, h]
    pad = 4
    x0, y0, x1, y1 = max(bb[0] - pad, 0), max(bb[1] - pad, 0), min(bb[2] + pad, w), min(bb[3] + pad, h)
    rows = []
    for nm, frames in cols:
        tiles = [frames[k][y0 * scale:y1 * scale, x0 * scale:x1 * scale] for k in range(n)]
        row = np.concatenate([_label(t, f"{nm} f{k}") for k, t in enumerate(tiles)], axis=1)
        rows.append(row)
    W = max(r.shape[1] for r in rows)
    rows = [np.pad(r, ((0, 2), (0, W - r.shape[1]), (0, 0))) for r in rows]
    strip = np.concatenate(rows, axis=0)
    png_path = os.path.join(outdir, name + '_strip.png')
    Image.fromarray(strip).save(png_path)
    return gif_path, png_path


PROTO_PICKS = [   # (game, platform, key, why)
    ('cok', 'amiga', 'PIC1:23', 'blink: tiny local loop (1.2% of pixels)'),
    ('dqk', 'dos', 'PICA:set06', 'DQK overlay patch: eyes/visor, 8% of pixels'),
    ('cok', 'amiga', 'PIC2:10', 'dragon breath: 11.7% of pixels, large region'),
    ('cok', 'amiga', 'PIC2:14', 'head turn: 40% of pixels (expected failure case)'),
]


def cmd_prototype(args):
    sets, errors = load_all(['cok-amiga', 'dqk-dos'])
    by = {(s.game, s.platform, s.key): s for s in sets}
    outdir = os.path.join(OUT, 'proto')
    report = dict(label='SIMULATED restyle: upscale + bilateral + smooth warp + hue shift. No image model was used.',
                  assumptions=dict(scale=SIM_SCALE, warp_px_at_4x=SIM_WARP_PX, drift_warp_px=SIM_DRIFT_WARP_PX,
                                   drift_colour_levels=SIM_DRIFT_COLOUR), items=[])
    for game, plat, key, why in PROTO_PICKS:
        fs = by.get((game, plat, key))
        if fs is None:
            continue
        ev = evaluate(fs)
        name = f"{game}_{plat}_{key.replace(':', '_')}"
        gif, png = preview_assets(fs, ev, outdir, name)
        a = analyse(fs)
        report['items'].append(dict(game=game, platform=plat, key=key, why=why, frames=fs.n,
                                    changed_fraction=a['changed_fraction'], kind=a['kind'], metrics=ev['metrics'],
                                    gif=os.path.relpath(gif, ROOT).replace(os.sep, '/'),
                                    strip=os.path.relpath(png, ROOT).replace(os.sep, '/')))
        print(name, json.dumps(ev['metrics']))
    json.dump(report, open(os.path.join(outdir, 'proto.json'), 'w', encoding='utf-8'), indent=1)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('measure')
    sub.add_parser('prototype')
    a = ap.parse_args(argv)
    if a.cmd == 'measure':
        return cmd_measure(a)
    return cmd_prototype(a)


if __name__ == '__main__':
    sys.exit(main())
