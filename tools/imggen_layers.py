#!/usr/bin/env python3
"""Layer / overlay classification of Gold Box art for the AI restyle pipeline (no network, no image model).

Some pictures are NOT standalone: the original engines draw them on top of another picture (DAX title
"bands", DQK title overlays, animation frames ...). Restyling such a layer together with a flat background loses its
transparency and its placement.  This module finds, from the game bytes and the engine code, for every candidate:

  role        full_frame | overlay_opaque_rect | overlay_transparent | opaque_picture | opaque_inset |
              sprite_transparent | unknown
  parent      the picture it is drawn over (id + source), x/y in the 320x200 screen, transparency rule,
  confidence  high / medium / low, with the evidence list and a `measured` flag (False = inferred from the
              format family / engine docs only, nothing about THIS image was measured).

CLI:
  python tools/imggen_layers.py scan   # writes renders/imggen/candidates/layers.json, layers.md, layers/*.png
  python tools/imggen_layers.py verify # DoK/CoK title composition vs. captured web-intro frames

How the original draws the DAX title bands (verified, see docs/engine/research/imggen-webpack.md):
header x/y are 0, so placement is NOT stored.  The 240x88 / 320x88 / 320x80 "bands" are OPAQUE rectangles that contain a
copy of the background art plus new lettering; the position is recovered by maximising matching palette indexes
against the full-frame block (FFT cross-correlation below).  Because the band carries its own copy of the
background, `band != parent_crop` is an exact matte of the lettering (EGA has no alpha: the engine just copies the rect).
DQK (HLIB/GLIB) overlays are different: they store x/y in the image header and use draw method 23 / 0xE3, where
index 255 is transparent.
"""
import argparse, glob, json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
CAND_DIR = os.path.join(ROOT, 'renders', 'imggen', 'candidates')
CAND_JSON = os.path.join(CAND_DIR, 'candidates.json')
LAYER_DIR = os.path.join(CAND_DIR, 'layers')
SCREEN = (320, 200)
FAR_R = 4  # runner-up must be > 4 px from the peak (shifted copies of smooth art match almost as well)

GAMEDIR = {'cok': 'Champions of Krynn', 'dok': 'Death Knights of Krynn'}
DQK_DIR = os.path.join(ROOT, 'The Dark Queen of Krynn')
AMIGA_DQK = r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\DarkQueenOfKrynn\data'

EGA = [(0, 0, 0), (0, 0, 170), (0, 170, 0), (0, 170, 170), (170, 0, 0), (170, 0, 170), (170, 85, 0), (170, 170, 170),
       (85, 85, 85), (85, 85, 255), (85, 255, 85), (85, 255, 255), (255, 85, 85), (255, 85, 255), (255, 255, 85), (255, 255, 255)]

OVERLAY_ROLES = ('overlay_opaque_rect', 'overlay_transparent')
ALL_ROLES = ('full_frame', 'overlay_opaque_rect', 'overlay_transparent', 'sprite_transparent', 'opaque_picture',
             'opaque_inset', 'unknown')


# ------------------------------------------------------------------ pixel primitives
def match_map(base, band, key=None):
    """Number of equal palette indexes for every placement (y,x) of `band` inside `base` (FFT cross-correlation).
    Pixels of `band` equal to `key` do not participate (transparent)."""
    H, W = base.shape
    h, w = band.shape
    if h > H or w > W:
        raise ValueError('band larger than base')
    out = np.zeros((H - h + 1, W - w + 1))
    shape = (H + h, W + w)
    for c in np.unique(band):
        if key is not None and int(c) == key:
            continue
        am = (base == c).astype(np.float64)
        bm = (band == c)[::-1, ::-1].astype(np.float64)
        r = np.fft.irfft2(np.fft.rfft2(am, shape) * np.fft.rfft2(bm, shape), shape)
        out += r[h - 1:H, w - 1:W]
    return np.rint(out).astype(np.int64)


def placement_stats(mm, compared):
    """Peak statistics of a match map: best, runner-up (>4px away), median (null) and the confidence label."""
    by, bx = np.unravel_index(int(np.argmax(mm)), mm.shape)
    best = int(mm[by, bx])
    far = np.ones_like(mm, bool)
    far[max(0, by - FAR_R):by + FAR_R + 1, max(0, bx - FAR_R):bx + FAR_R + 1] = False
    second = int(mm[far].max()) if far.any() else 0
    med = float(np.median(mm))
    frac = best / compared if compared else 0.0
    ratio = best / second if second else float('inf')
    if frac >= 0.5 and ratio >= 1.5:
        conf = 'high'
    elif frac >= 0.3 and ratio >= 1.2:
        conf = 'medium'
    else:
        conf = 'low'
    return dict(x=int(bx), y=int(by), matches=best, compared=int(compared), fraction=round(frac, 4),
                runner_up=second, peak_ratio=round(float(ratio), 3) if np.isfinite(ratio) else None,
                null_median=round(med / compared, 4) if compared else None, confidence=conf)


def _shift(a, dy, dx, fill=False):
    out = np.full_like(a, fill)
    H, W = a.shape
    ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
    xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
    out[ys, xs] = a[yd, xd]
    return out


def dilate(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= _shift(m, dy, dx, False)
    return out


def erode(m, r=1):
    return ~dilate(~m, r)


def diff_matte(band, parent_crop, close=1):
    """Foreground matte of an opaque band: pixels that differ from the background copy underneath, then a small
    morphological closing so lettering pixels that happen to equal the background index do not leave holes."""
    m = band != parent_crop
    return erode(dilate(m, close), close) if close else m


def ega_rgb(idx):
    return np.asarray(EGA, np.uint8)[idx]


def checkerboard(w, h, cell=8):
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.where(((yy // cell) + (xx // cell)) % 2 == 0, 200, 150).astype(np.uint8)
    return np.dstack([v, v, v])


def composite(parent_rgb, layer_rgba, x, y):
    """Alpha-composite an RGBA layer onto an RGB parent at (x,y) (parent pixels; clipped)."""
    out = np.asarray(parent_rgb, np.float32).copy()
    L = np.asarray(layer_rgba, np.float32)
    h, w = L.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(out.shape[1], x + w), min(out.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        return out.astype(np.uint8)
    sub = L[y0 - y:y1 - y, x0 - x:x1 - x]
    a = sub[..., 3:4] / 255.0
    out[y0:y1, x0:x1] = sub[..., :3] * a + out[y0:y1, x0:x1] * (1 - a)
    return np.rint(out).astype(np.uint8)


# ------------------------------------------------------------------ key colour / matte helpers (shared with imggen_webpack)
KEY_CANDIDATES = [(0, 255, 0), (255, 0, 255), (0, 255, 255), (255, 128, 0), (0, 128, 255), (255, 0, 0), (255, 255, 0), (0, 0, 255)]


def choose_key(rgb, alpha):
    """Pick the key colour that is farthest (max-min RGB distance) from every foreground colour of the layer, so the
    lettering never contains the key.  Returns (key, min_distance)."""
    fg = np.asarray(rgb, np.int32)[np.asarray(alpha) > 0]
    if fg.size == 0:
        return KEY_CANDIDATES[0], 441.0
    cols = np.unique(fg.reshape(-1, 3), axis=0)
    best = None
    for k in KEY_CANDIDATES:
        d = float(np.sqrt(((cols - np.asarray(k)) ** 2).sum(1)).min())
        if best is None or d > best[1] + 1e-9:
            best = (k, d)
    return best


def layer_on_key(layer_rgba, key):
    a = np.asarray(layer_rgba, np.uint8)
    out = np.empty(a.shape[:2] + (3,), np.uint8)
    out[:] = key
    m = a[..., 3] > 0
    out[m] = a[..., :3][m]
    return out


def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / max(hi - lo, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def key_alpha(rgb, key, lo=40.0, hi=110.0):
    """Alpha from distance to the key colour (0 at the key, 1 far away) and un-premixed (despilled) colour."""
    f = np.asarray(rgb, np.float32)
    d = np.sqrt(((f - np.asarray(key, np.float32)) ** 2).sum(-1))
    a = smoothstep(lo, hi, d)
    safe = np.maximum(a, 1e-3)[..., None]
    col = (f - (1 - a)[..., None] * np.asarray(key, np.float32)) / safe
    return a, np.clip(col, 0, 255)


def blur(a, r):
    if r <= 0:
        return a
    k = np.ones(2 * r + 1, np.float32) / (2 * r + 1)
    for ax in (0, 1):
        a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode='edge'), k, mode='valid'), ax, a)
    return a


def extract_layer(res_rgb, key, matte_native=None, k=1, gate_dilate=2, min_key_cover=0.25):
    """Turn a model rendering that was asked to keep `key` as flat background into an RGBA layer.

    alpha = key distance (soft).  If the original matte is known it is used as a GATE (dilated by `gate_dilate`
    native px, feathered) so stray model artefacts away from the lettering are dropped.  When the model did not keep
    the key (less than `min_key_cover` of the area OUTSIDE the gate is key-coloured) the keyed alpha is untrusted and
    the dilated original matte alone is used.  Returns (rgba uint8, mode, key_cover)."""
    res = np.asarray(res_rgb, np.uint8)
    a, col = key_alpha(res, key)
    mode = 'key'
    cover = None
    if matte_native is not None:
        m = np.kron(np.asarray(matte_native, bool).astype(np.uint8), np.ones((k, k), np.uint8)).astype(bool)
        gate_hard = dilate(m, gate_dilate * k)
        outside = ~gate_hard
        cover = float((a[outside] < 0.2).mean()) if outside.any() else 1.0
        gate = np.clip(blur(gate_hard.astype(np.float32), max(1, k)), 0, 1)
        if cover < min_key_cover:
            mode = 'matte_fallback'
            a = gate
            col = res.astype(np.float32)
        else:
            a = a * gate
    out = np.dstack([np.rint(col).astype(np.uint8), np.rint(a * 255).astype(np.uint8)])
    return out, mode, cover


def compose_restyled(parent_rgb, layer_rgba, x, y, parent_native_w=320):
    """Place a restyled layer (k_layer x native) on a restyled parent (k_parent x native) at native x,y."""
    parent = Image.fromarray(np.asarray(parent_rgb, np.uint8)).convert('RGB')
    kp = parent.width / parent_native_w
    lay = Image.fromarray(np.asarray(layer_rgba, np.uint8))
    return composite(np.asarray(parent), np.asarray(lay), int(round(x * kp)), int(round(y * kp)))


# ------------------------------------------------------------------ DAX titles (CoK / DoK)
_dax_cache = {}


def load_dax_title(game):
    if game in _dax_cache:
        return _dax_cache[game]
    import dax_decode as D
    p = os.path.join(ROOT, GAMEDIR[game], 'TITLE.DAX')
    if not os.path.exists(p):
        _dax_cache[game] = None
        return None
    data = open(p, 'rb').read()
    base, blocks = D.parse_container(data)
    out = {}
    for b in blocks:
        raw = D.decompress_block(data, base, b)
        fr = D.parse_standard_frame(raw)
        if not fr:
            continue
        w, h, xo, yo = fr
        px = np.frombuffer(raw[17:17 + w * h // 2], np.uint8)
        idx = np.empty(w * h, np.uint8)
        idx[0::2] = px >> 4
        idx[1::2] = px & 15
        out[b.block_id] = dict(idx=idx.reshape(h, w), hdr_xy=(xo, yo), w=w, h=h)
    _dax_cache[game] = out
    return out


def is_full(w, h):
    return w >= SCREEN[0] and h >= SCREEN[1]


def analyse_dax_band(blocks, n):
    """Parent / placement / matte of band block `n` against every full-frame block of the archive."""
    band = blocks[n]['idx']
    best = None
    per_parent = {}
    for pid, p in blocks.items():
        if pid == n or not is_full(p['w'], p['h']):
            continue
        st = placement_stats(match_map(p['idx'], band), band.size)
        per_parent[pid] = st
        if best is None or st['matches'] > per_parent[best]['matches']:
            best = pid
    st = per_parent[best]
    # roll check: would a horizontally rolled copy of the band fit better?  (the engine-side deroll heuristic could
    # fire on bands; if a roll fit better than dx=0 the placement would be suspect)
    rolls = {}
    for dx in range(-3, 4):
        m = match_map(blocks[best]['idx'], np.roll(band, dx, axis=1))
        rolls[dx] = int(m.max())
    st = dict(st, parent_block=best, other_parents={k: v['fraction'] for k, v in per_parent.items() if k != best},
              roll_scores=rolls, best_roll=max(rolls, key=rolls.get))
    return st


def classify_dax_title(game, n):
    blocks = load_dax_title(game)
    if not blocks or n not in blocks:
        return None
    b = blocks[n]
    rec = dict(family='dax-title', archive=f'{GAMEDIR[game]}/TITLE.DAX', block=n, measured=True,
               header_xy=list(b['hdr_xy']), size=[b['w'], b['h']])
    ev = [f"header x/y = {b['hdr_xy']} (placement is not stored)"]
    if is_full(b['w'], b['h']):
        rec.update(role='full_frame', parent=None, x=0, y=0, transparent_rule='opaque', confidence='high')
        kids = [m for m in blocks if m != n and not is_full(blocks[m]['w'], blocks[m]['h'])
                and analyse_dax_band(blocks, m)['parent_block'] == n]
        if kids:
            ev.append(f'is the background of band block(s) {kids} (they match it at their derived x,y)')
            rec['children_blocks'] = kids
        rec['evidence'] = ev
        return rec
    st = analyse_dax_band(blocks, n)
    parent = blocks[st['parent_block']]['idx']
    h, w = b['idx'].shape
    matte = diff_matte(b['idx'], parent[st['y']:st['y'] + h, st['x']:st['x'] + w])
    covers = []
    for m, mb in blocks.items():
        if m < n and not is_full(mb['w'], mb['h']):
            o = analyse_dax_band(blocks, m)
            if o['parent_block'] == st['parent_block'] and o['x'] >= st['x'] and o['y'] >= st['y'] \
                    and o['x'] + mb['w'] <= st['x'] + w and o['y'] + mb['h'] <= st['y'] + h:
                covers.append(m)
    ev += [f"{st['matches']}/{st['compared']} indexes equal the parent block {st['parent_block']} at ({st['x']},{st['y']}) "
           f"= {st['fraction']:.1%}; runner-up (>4px away) {st['runner_up']}, peak ratio {st['peak_ratio']}, "
           f"median placement {st['null_median']:.1%}",
           'band = opaque rectangle (copy of the background + new lettering): EGA has no alpha, the engine copies the rect',
           f'differing pixels (lettering matte) = {matte.mean():.1%} of the rectangle',
           f"roll check dx -3..3: best dx={st['best_roll']} (0 = unrolled copy fits best)"]
    if covers:
        ev.append(f'its rectangle fully covers earlier band block(s) {covers}: it REPLACES them on screen')
    rec.update(role='overlay_opaque_rect', parent_block=st['parent_block'], parent_source=f"renders/dax/{'CoK' if game == 'cok' else 'DoK'}_TITLE/TITLE_{st['parent_block']:03d}.png",
               x=st['x'], y=st['y'], transparent_rule='opaque rect; matte = pixels differing from the parent copy',
               matte_fraction=round(float(matte.mean()), 4), placement=st, replaces_blocks=covers,
               confidence=st['confidence'], evidence=ev)
    if st['best_roll'] != 0:
        rec['confidence'] = 'low'
        ev.append('WARNING: a rolled copy of the band fits the parent better than the stored one')
    return rec


# ------------------------------------------------------------------ DQK HLIB / GLIB
_lib_cache = {}


def _find(dirs, stem):
    for d in dirs:
        for sub in ('DISK1', 'DISK2', 'DISK3', 'Disk1', 'Disk2', 'Disk3'):
            for hit in glob.glob(os.path.join(d, sub, stem + '.*')):
                if hit.upper().endswith(('.TLB', '.GLB')):
                    return hit
    return None


def load_lib(kind, stem):
    key = (kind, stem)
    if key in _lib_cache:
        return _lib_cache[key]
    out = None
    try:
        if kind == 'hlib':
            import hlib_decode as H
            f = _find([DQK_DIR], stem)
            if f:
                out = {}
                for label, w, h, px, pal, dm, x, y in H.walk(open(f, 'rb').read()):
                    out[label] = dict(w=w, h=h, px=np.frombuffer(bytes(px), np.uint8).reshape(h, w), dm=dm, x=x, y=y)
        else:
            import glib_decode as G
            f = _find([AMIGA_DQK], stem)
            if f:
                out = {}
                for label, w, h, px, pal, dm in G.walk(open(f, 'rb').read(), []):
                    out[label] = dict(w=w, h=h, px=np.frombuffer(bytes(px), np.uint8).reshape(h, w), dm=dm, x=None, y=None)
    except Exception as e:  # a decode failure must degrade to "unmeasured", not crash the scan
        out = {'__error__': str(e)}
    _lib_cache[key] = out
    return out


def _lib_parent(lib, label):
    """Nearest preceding full-frame image in container order (the same rule apps/web/src/ui/intro.ts uses)."""
    parent = None
    for lb, im in lib.items():
        if lb == label:
            return parent
        if is_full(im['w'], im['h']):
            parent = lb
    return parent


def classify_lib(kind, stem, label):
    lib = load_lib(kind, stem)
    if not lib or '__error__' in lib or label not in lib:
        return None
    im = lib[label]
    tfrac = float((im['px'] == 255).mean())
    transparent_method = (im['dm'] in (21, 23)) if kind == 'hlib' else (im['dm'] & 0xff) == 0xe3
    rec = dict(family=f'{kind}-{stem}', measured=True, size=[im['w'], im['h']], method=im['dm'],
               transparent_fraction=round(tfrac, 4))
    ev = [f"draw method {im['dm']:#x}: " + ('index 255 = transparent (keep destination)' if transparent_method else 'opaque'),
          f'{tfrac:.1%} of the pixels are index 255']
    if stem == 'TITLE':
        parent = _lib_parent(lib, label)
        if is_full(im['w'], im['h']):
            rec.update(role='full_frame', parent=None, x=0, y=0, transparent_rule='opaque', confidence='high')
            ev.append('full 320x200 background of its set group')
        else:
            x, y = im['x'], im['y']
            src = None
            conf = 'high'
            if kind == 'glib':
                dos = (load_lib('hlib', stem) or {}).get(label)
                if dos and '__error__' not in dos and (dos['w'], dos['h']) == (im['w'], im['h']):
                    x, y = dos['x'], dos['y']
                    ev.append(f'GLIB headers carry no placement; same set/size as the DOS image {label} -> DOS stored x,y reused')
                    conf = 'medium'
                else:
                    x = y = None
                    conf = 'low'
                    ev.append('GLIB headers carry no placement and the DOS twin differs in size or is unavailable: x,y unknown')
            else:
                ev.append(f'x,y = -(horizontal,vertical offset) stored in the image header: ({x},{y})')
            fits = x is not None and x >= 0 and y >= 0 and x + im['w'] <= SCREEN[0] and y + im['h'] <= SCREEN[1]
            if x is not None:
                ev.append('rectangle fits the 320x200 screen' if fits else 'WARNING: rectangle leaves the screen')
                if not fits:
                    conf = 'low'
            if not transparent_method:
                conf = 'low'
                ev.append('WARNING: overlay without a transparent draw method')
            rec.update(role='overlay_transparent', parent_label=parent, x=x, y=y,
                       transparent_rule='index 255 transparent (draw method 23 / 0xE3)', confidence=conf)
    else:
        rec.update(parent=None, x=None, y=None)
        if transparent_method:
            rec.update(role='sprite_transparent', transparent_rule='index 255 transparent', confidence='high')
            ev.append('transparent-method image (drawn over whatever is on screen); not part of a title composition')
        else:
            big = (im['w'], im['h']) == (304, 120)
            rec.update(role='opaque_picture' if big else 'opaque_inset', transparent_rule='opaque', confidence='high')
    rec['evidence'] = ev
    return rec


# ------------------------------------------------------------------ Amiga IFF ILBM title screens / bands (CoK, DoK)
# stem -> (parent stem or None).  The full screens are single opaque IFF screens; the text bands are separate ILBMs that
# the original draws over screen 2 / Title1.  Verified from the pixels: every band is an opaque rectangle holding a copy of
# its parent (64-72% of the pixels equal at the derived x,y), exactly like the DOS TITLE.DAX bands, and the placements
# equal the DOS ones.  The IFF mask stencil (_rgba.png) is NOT the lettering (IoU with the real matte 0.18-0.41), so the
# matte is the same diff-matte the DOS bands use, computed on the Amiga pixels.
LBM_DIR = 'renders/amiga_cokdok/lbm'
LBM_TITLES = {
    'CoK_scrn1b': None, 'CoK_scrn2': None, 'CoK_text1': 'CoK_scrn2', 'CoK_text2': 'CoK_scrn2',
    'DoK_Title0': None, 'DoK_Title1': None, 'DoK_Title1A': 'DoK_Title1', 'DoK_Title1B': 'DoK_Title1',
}
RE_LBM = re.compile(r'renders/amiga_cokdok/lbm/((CoK|DoK)_(\w+?))\.png$')


def lbm_id(stem):
    """Candidate id of an Amiga LBM render (same rule as imggen_candidates.make_id)."""
    g = stem[:3].lower()
    return f'{g}_amiga_amiga_cokdok_lbm_{stem.lower()}'


def _native_rgb(path):
    a = np.asarray(Image.open(path).convert('RGB'))
    import imggen_candidates as C
    return C.native_of(a)[0]


def _factorise(*arrs):
    both = np.concatenate([a.reshape(-1, 3) for a in arrs])
    _, inv = np.unique(both, axis=0, return_inverse=True)
    inv = inv.ravel()
    out, o = [], 0
    for a in arrs:
        n = a.shape[0] * a.shape[1]
        out.append(inv[o:o + n].reshape(a.shape[:2]))
        o += n
    return out


def lbm_band_matte(band_rgb, parent_rgb, x, y):
    """diff matte of an Amiga band against its parent crop at (x,y), on exact RGB equality."""
    h, w = band_rgb.shape[:2]
    bi, pi = _factorise(band_rgb, parent_rgb[y:y + h, x:x + w])
    return diff_matte(bi, pi)


def classify_lbm(source, root=ROOT):
    m = RE_LBM.search(source.replace(chr(92), '/'))
    if not m or m.group(1) not in LBM_TITLES:
        return None
    stem, game = m.group(1), m.group(2).lower()
    path = os.path.join(root, source)
    if not os.path.exists(path):
        return None
    pstem = LBM_TITLES[stem]
    img = _native_rgb(path)
    h, w = img.shape[:2]
    rec = dict(family='lbm-title', measured=True, size=[w, h], source_stem=stem)
    if pstem is None:
        kids = [k for k, v in LBM_TITLES.items() if v == stem]
        rec.update(role='full_frame', parent=None, x=0, y=0, transparent_rule='opaque (single IFF screen)', confidence='high')
        ev = ['single opaque 320x200 IFF screen']
        if kids:
            rec['children'] = [lbm_id(k) for k in kids]
            ev.append(f'is the background of the band(s) {kids}: they match it at their derived x,y')
        rec['evidence'] = ev
        return rec
    ppath = os.path.join(root, LBM_DIR, pstem + '.png')
    par = _native_rgb(ppath)
    bi, pi = _factorise(img, par)
    st = placement_stats(match_map(pi, bi), bi.size)
    matte = lbm_band_matte(img, par, st['x'], st['y'])
    ev = [f"{st['matches']}/{st['compared']} pixels equal the parent {pstem} at ({st['x']},{st['y']}) = {st['fraction']:.1%}; "
          f"runner-up (>4px away) {st['runner_up']}, peak ratio {st['peak_ratio']}, median placement {st['null_median']:.1%}",
          'band = opaque rectangle (copy of the parent + new lettering), like the DOS TITLE.DAX bands',
          f'differing pixels (lettering matte) = {matte.mean():.1%} of the rectangle']
    rgba_p = os.path.join(root, LBM_DIR, stem + '_rgba.png')
    if os.path.exists(rgba_p):
        a = np.asarray(Image.open(rgba_p).convert('RGBA'))
        import imggen_candidates as C
        kx, ky = C.detect_scale(a[..., :3])
        sten = a[::ky, ::kx, 3] > 0
        if sten.shape == matte.shape:
            iou = float((sten & matte).sum() / max(1, (sten | matte).sum()))
            miss = float((matte & ~sten).sum() / max(1, matte.sum()))
            ev.append(f'IFF mask stencil NOT used: IoU with the diff matte {iou:.2f}, it misses {miss:.0%} of the lettering '
                      f'and keeps {float((sten & ~matte).sum() / max(1, sten.sum())):.0%} backdrop; diff matte used instead')
    rec.update(role='overlay_transparent', parent=lbm_id(pstem), parent_source=f'{LBM_DIR}/{pstem}.png', x=st['x'], y=st['y'],
               transparent_rule='band is an opaque rect; alpha = pixels differing from the parent crop (closing 1); IFF stencil not used',
               matte_fraction=round(float(matte.mean()), 4), placement=st, confidence=st['confidence'], evidence=ev)
    return rec


# ------------------------------------------------------------------ source-path dispatch
RE_DAX_TITLE = re.compile(r'renders/dax/(CoK|DoK)_TITLE/TITLE_(\d+)\.png$')
RE_LIB = re.compile(r'renders/(hlib|glib)/([^/]+)/([^/]+?)_(set\d+_img\d+)\.png$')


def classify_source(source, rec_id, game=None, native_size=None, kind=None):
    src = source.replace('\\', '/')
    r = classify_lbm(src)
    if r:
        return r
    m = RE_DAX_TITLE.search(src)
    if m:
        g = 'cok' if m.group(1) == 'CoK' else 'dok'
        r = classify_dax_title(g, int(m.group(2)))
        if r:
            if r.get('parent_block'):
                r['parent'] = f"{g}_dos_dax_{g}_title_title_{r['parent_block']:03d}"
            return r
    m = RE_LIB.search(src)
    if m:
        kind_, stem, _, label = m.groups()
        r = classify_lib(kind_, stem, label)
        if r:
            if r.get('parent_label'):
                r['parent'] = f"dqk_{'dos_hlib' if kind_ == 'hlib' else 'amiga_glib'}_{stem.lower()}_{stem.lower()}_{r['parent_label']}"
                r['parent_source'] = f"renders/{kind_}/{stem}/{stem}_{r['parent_label']}.png"
            return r
    # ---- family rules (nothing measured on this image)
    w, h = native_size or (None, None)
    rec = dict(measured=False, parent=None, x=None, y=None, size=list(native_size) if native_size else None)
    ev = []
    if '/dax_complex/' in src:
        rec.update(family='dax-complex-frame0', role='opaque_inset', transparent_rule='opaque',
                   confidence='medium', measured=False)
        ev += ['frame 0 of a multi-frame PIC block: the animated-picture format stores frame 0 verbatim with no key colour',
               '(later frames are XOR deltas of the same size; not in the inventory)',
               'drawn into the fixed portrait slot of the UI; slot position not derived here']
    elif (w, h) == (304, 120) or '/BIGPIC' in src or '/bigpic' in src:
        rec.update(family='bigpic-viewport', role='opaque_picture', transparent_rule='opaque',
                   confidence='medium', measured=False)
        ev += ['304x120 = the engine "big picture" viewport size (DRAW18.TXT); a single opaque picture, no parent layer',
               'the surrounding UI frame is separate art; placement inside it not derived here']
    elif (w, h) in ((88, 88), (88, 40)) or re.search(r'/(cok_)?head\d*/|/PIC|/pic', src):
        rec.update(family='portrait-inset', role='opaque_inset', transparent_rule='opaque (assumed)',
                   confidence='low', measured=False)
        ev += ['portrait/head sized inset; transparency of this family was not measured from the source bytes']
    else:
        rec.update(family='unknown', role='unknown', transparent_rule='unknown', confidence='low', measured=False)
        ev += ['no rule for this source path']
    rec['evidence'] = ev
    return rec


# ------------------------------------------------------------------ emit layer RGBA files
def native_from_render(path, native_size):
    im = np.asarray(Image.open(path).convert('RGB'))
    nw, nh = native_size
    kx, ky = im.shape[1] // nw, im.shape[0] // nh
    return im[ky // 2::ky, kx // 2::kx][:nh, :nw]


def build_layer(rec, source, native_size):
    """RGBA native layer (alpha = matte) + native parent RGB for an overlay record, or None when not derivable here."""
    if rec.get('role') not in OVERLAY_ROLES or rec.get('x') is None:
        return None
    src = os.path.join(ROOT, source)
    psrc = os.path.join(ROOT, rec.get('parent_source') or '')
    if not (os.path.exists(src) and os.path.exists(psrc)):
        return None
    if rec.get('family') == 'lbm-title':
        band = _native_rgb(src)
        par = _native_rgb(psrc)
        matte = lbm_band_matte(band, par, rec['x'], rec['y'])
        return dict(rgba=np.dstack([band, matte.astype(np.uint8) * 255]), parent_rgb=par, matte=matte,
                    x=rec['x'], y=rec['y'], role=rec['role'], parent_source=rec.get('parent_source'))
    if rec['role'] == 'overlay_opaque_rect':
        game = 'cok' if '/CoK_' in source.replace(chr(92), '/') else 'dok'
        blocks = load_dax_title(game)
        band = blocks[rec['block']]['idx']
        par = blocks[rec['parent_block']]['idx']
        matte = diff_matte(band, par[rec['y']:rec['y'] + band.shape[0], rec['x']:rec['x'] + band.shape[1]])
        parent_rgb, layer_rgb = ega_rgb(par), ega_rgb(band)
    else:
        m = RE_LIB.search(source.replace(chr(92), '/'))
        im = load_lib(m.group(1), m.group(2))[m.group(4)]
        matte = im['px'] != 255
        layer_rgb = native_from_render(src, native_size)
        parent_rgb = native_from_render(psrc, SCREEN)
    return dict(rgba=np.dstack([layer_rgb, matte.astype(np.uint8) * 255]), parent_rgb=parent_rgb, matte=matte,
                x=rec['x'], y=rec['y'], role=rec['role'], parent_source=rec.get('parent_source'))


def emit_layer_files(rec, rid, native_size, source, out_dir=LAYER_DIR):
    """Write <id>.png (native RGBA layer) and <id>_parent.png (native parent RGB) for overlays with a derivable matte."""
    b = build_layer(rec, source, native_size)
    if not b:
        return None
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray(b['rgba']).save(os.path.join(out_dir, rid + '.png'))
    Image.fromarray(b['parent_rgb']).save(os.path.join(out_dir, rid + '_parent.png'))
    return dict(layer=f'layers/{rid}.png', parent=f'layers/{rid}_parent.png')


# ------------------------------------------------------------------ scan
def pilot_records():
    import imggen_webpack as W
    out = []
    for e in W.pilot_manifest():
        p = os.path.join(ROOT, e['src'])
        ns = None
        if os.path.exists(p):
            iw, ih = Image.open(p).size
            ns = (iw // e['native_div'], ih // e['native_div'])
        out.append(dict(id=e['id'], source=e['src'], native_size=ns, kind=e['kind'], game=guess_game(e['src'], e['id'])))
    return out


def guess_game(src, rid=''):
    s = (src + rid).lower()
    for g, keys in (('cok', ('cok', 'champions')), ('dok', ('dok', 'death')), ('dqk', ('dqk', 'hlib', 'glib'))):
        if any(k in s for k in keys):
            return g
    return 'unknown'


def summarize(items):
    def tab(sel):
        t = {}
        for it in sel:
            t.setdefault(it['game'], {}).setdefault(it['role'], 0)
            t[it['game']][it['role']] += 1
        return t
    out = {}
    for name in ('inventory', 'proposal', 'pilot'):
        sel = [i for i in items if i['set'] == name or (name == 'inventory' and i['set'] in ('inventory', 'proposal'))
               or (name == 'proposal' and i['set'] == 'proposal')]
        if name == 'inventory':
            sel = [i for i in items if i['set'] != 'pilot']
        elif name == 'proposal':
            sel = [i for i in items if i.get('in_proposal')]
        else:
            sel = [i for i in items if i['set'] == 'pilot']
        t = tab(sel)
        out[name] = dict(total=len(sel), per_game=t,
                         overlays=sum(1 for i in sel if i['role'] in OVERLAY_ROLES),
                         overlays_per_game={g: sum(v for r, v in rs.items() if r in OVERLAY_ROLES) for g, rs in t.items()})
    return out


def scan(emit=True, cand_json=CAND_JSON, out_dir=CAND_DIR):
    data = json.load(open(cand_json, encoding='utf-8'))
    items = []
    for c in data['candidates']:
        r = classify_source(c['source'], c['id'], c['game'], tuple(c['native_size']), c['kind'])
        it = dict(id=c['id'], set='proposal' if c.get('proposed_batch02') else 'inventory', in_proposal=bool(c.get('proposed_batch02')),
                  rank=c.get('rank'), game=c['game'], platform=c['platform'], kind=c['kind'], source=c['source'],
                  native_size=c['native_size'])
        it.update(r)
        it.setdefault('parent', None)
        if emit:
            files = emit_layer_files(r, c['id'], tuple(c['native_size']), c['source'], os.path.join(out_dir, 'layers'))
            if files:
                it['files'] = files
        items.append(it)
    for p in pilot_records():
        r = classify_source(p['source'], p['id'], p['game'], p['native_size'], p['kind'])
        it = dict(id=p['id'], set='pilot', in_proposal=False, rank=None, game=p['game'], platform='dos', kind=p['kind'],
                  source=p['source'], native_size=list(p['native_size']) if p['native_size'] else None)
        it.update(r)
        it.setdefault('parent', None)
        items.append(it)
    payload = dict(generated_by='tools/imggen_layers.py', roles=list(ALL_ROLES), summary=summarize(items), items=items)
    os.makedirs(out_dir, exist_ok=True)
    json.dump(payload, open(os.path.join(out_dir, 'layers.json'), 'w', encoding='utf-8'), indent=1, default=int)
    open(os.path.join(out_dir, 'layers.md'), 'w', encoding='utf-8').write(render_md(payload))
    return payload


def annotate(candidates, layers_path=os.path.join(CAND_DIR, 'layers.json')):
    """Add a compact `layer` field to candidate dicts (used by imggen_candidates.write_outputs)."""
    if not os.path.exists(layers_path):
        return 0
    by = {i['id']: i for i in json.load(open(layers_path, encoding='utf-8'))['items'] if i['set'] != 'pilot'}
    n = 0
    for c in candidates:
        i = by.get(c['id'])
        if i:
            c['layer'] = {k: i.get(k) for k in ('role', 'parent', 'parent_source', 'x', 'y', 'transparent_rule', 'confidence', 'measured', 'files') if i.get(k) is not None}
            n += 1
    return n


def render_md(p):
    L = ['# Layer classification (generated by tools/imggen_layers.py)', '']
    for name, s in p['summary'].items():
        L.append(f"## {name}: {s['total']} items, {s['overlays']} overlay-type")
        L += ['', '| game | ' + ' | '.join(ALL_ROLES) + ' |', '| --- |' + ' ---: |' * len(ALL_ROLES)]
        for g, rs in sorted(s['per_game'].items()):
            L.append(f'| {g} | ' + ' | '.join(str(rs.get(r, 0)) for r in ALL_ROLES) + ' |')
        L.append('')
    L += ['## Overlay items', '', '| id | set | role | parent | x,y | rule | confidence | measured |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for i in p['items']:
        if i['role'] in OVERLAY_ROLES:
            L.append(f"| {i['id']} | {i['set']}{' #%s' % i['rank'] if i.get('rank') else ''} | {i['role']} | {i.get('parent')} | "
                     f"{i.get('x')},{i.get('y')} | {i.get('transparent_rule')} | {i['confidence']} | {i['measured']} |")
    L += ['', '## Unmeasured families (role inferred from format docs only)', '']
    fam = {}
    for i in p['items']:
        if not i['measured']:
            fam.setdefault((i.get('family'), i['role'], i['confidence']), []).append(i['id'])
    for (f, r, c), ids in sorted(fam.items(), key=lambda kv: str(kv[0])):
        L.append(f'- `{f}` -> {r} ({c}): {len(ids)} item(s)')
    return '\n'.join(L) + '\n'


# ------------------------------------------------------------------ composition verification (DoK / CoK titles)
def compose_dax_sequence(game, bands_xy):
    """Frames the intro shows: block 1 alone, then block 2 with each band blitted (accumulating)."""
    b = load_dax_title(game)
    frames = [ega_rgb(b[1]['idx'])]
    cur = ega_rgb(b[2]['idx']).copy()
    for n, (x, y) in bands_xy:
        im = ega_rgb(b[n]['idx'])
        cur[y:y + im.shape[0], x:x + im.shape[1]] = im
        frames.append(cur.copy())
    return frames


def derived_sequence(game):
    b = load_dax_title(game)
    seq = []
    for n in sorted(b):
        if not is_full(b[n]['w'], b[n]['h']):
            st = analyse_dax_band(b, n)
            seq.append((n, (st['x'], st['y'])))
    return seq


def read_capture(route, i, base=os.path.join(ROOT, 'renders', 'imggen', 'layers')):
    p = os.path.join(base, f'web_intro_{route}', f'frame{i}.rgba')
    if not os.path.exists(p):
        return None
    return np.fromfile(p, np.uint8).reshape(200, 320, 4)[..., :3]


def explain_frame(game, frame_i, cap, seq):
    """For a captured frame that disagrees with our composition: search which (band y shift, horizontal roll) of the
    LAST band reproduces the capture exactly, to name the difference instead of just reporting a number."""
    b = load_dax_title(game)
    n, (x, y) = seq[frame_i - 1]
    prev = compose_dax_sequence(game, seq[:frame_i - 1])[-1]
    best = None
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            im = ega_rgb(np.roll(b[n]['idx'], dx, axis=1))
            cur = prev.copy()
            yy = y + dy
            if yy < 0 or yy + im.shape[0] > 200:
                continue
            cur[yy:yy + im.shape[0], x:x + im.shape[1]] = im
            ag = float((cur == cap).all(-1).mean())
            if best is None or ag > best[0]:
                best = (ag, dy, dx)
    return dict(block=n, best_agreement=round(best[0], 5), y_shift=best[1], roll_dx=best[2])


def verify(route_of={'cok': '1', 'dok': 'dok'}):
    rep = {}
    for g in ('cok', 'dok'):
        seq = derived_sequence(g)
        frames = compose_dax_sequence(g, seq)
        r = dict(derived_bands={str(n): list(xy) for n, xy in seq}, frames=[])
        for i, f in enumerate(frames):
            cap = read_capture(route_of[g], i)
            fr = dict(frame=i, agreement=None if cap is None else round(float((cap == f).all(-1).mean()), 5))
            if cap is not None and i > 0 and fr['agreement'] < 1.0:
                fr['capture_reproduced_by'] = explain_frame(g, i, cap, seq)
            r['frames'].append(fr)
        rep[g] = r
    return rep


# ------------------------------------------------------------------ CLI
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', nargs='?', default='scan', choices=['scan', 'verify'])
    ap.add_argument('--no-emit', action='store_true')
    a = ap.parse_args(argv)
    if a.cmd == 'verify':
        rep = verify()
        json.dump(rep, open(os.path.join(CAND_DIR, 'composition_report.json'), 'w'), indent=1)
        print(json.dumps(rep, indent=1))
        return rep
    p = scan(emit=not a.no_emit)
    print(json.dumps(p['summary'], indent=1))
    return p


if __name__ == '__main__':
    main()
