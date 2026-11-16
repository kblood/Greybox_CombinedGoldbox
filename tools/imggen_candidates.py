#!/usr/bin/env python3
"""Deterministic inventory of CANDIDATE originals for the next AI-restyle batch.

  python tools/imggen_candidates.py scan            # writes renders/imggen/candidates/{candidates.json,candidates.md}
  python tools/imggen_candidates.py stage-site DIR   # (also: --stage-site DIR) copy proposal inputs + candidates.json
                                                     #   into DIR/restyle/proposal/ for a static deploy

Scans the git-ignored decoder renders under renders/ (nothing is decoded here), detects each
image's true native size (the renders are exact k x nearest-neighbour upscales), measures cheap
quality figures, folds the same picture on different platforms/folders into one dedupe GROUP with
ONE representative chosen by the best-art-platform rule, scores the groups, and proposes batch02.

Everything it reads and writes is git-ignored art; the script itself and the hand-written
descriptions (tools/imggen_batch02_descriptions.json) are the only committed pieces.
No images are generated and nothing is uploaded.
"""
import argparse, hashlib, json, os, re, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RENDERS = os.path.join(ROOT, 'renders')
OUT_DIR = os.path.join(RENDERS, 'imggen', 'candidates')
BATCH01_MANIFEST = os.path.join(RENDERS, 'imggen', 'webpack', 'batch01', 'manifest.json')
DESC_FILE = os.path.join(ROOT, 'tools', 'imggen_batch02_descriptions.json')
ANIM_JSON = os.path.join(RENDERS, 'imggen', 'animation', 'candidates_animation.json')   # tools/imggen_animation.py measure
SCENE_TEXT_DIR = os.path.join(RENDERS, 'imggen', 'scene_text')                         # tools/imggen_scene_text.py build

# ------------------------------------------------------------------ thresholds (documented in the md)
MIN_AREA = 64 * 64         # native pixels; smaller = icon/sprite/tile
MIN_SIDE = 48              # native pixels (shorter side)
FACE_MIN_W, FACE_MIN_H = 80, 40   # faces are legitimately short (88x40 heads)
BLANK_DOMINANT_MAX = 0.88  # most common colour covering more than this = near blank / delta frame
MIN_COLOURS = 4
MIN_EDGE_DENSITY = 0.02    # fraction of pixels with a different right/down neighbour (flat gradient = no content)
LOW_COLOURS_WARN = 8
DEDUPE_CORR = 0.75         # luminance/edge correlation at which two pictures are 'the same picture'
ASPECT_TOL = 0.04
SEAM_RATIO_WARN = 1.5      # see wrap_seam()

# best-art platform order per game (CLAUDE.md: Amiga best for CoK/DoK, DOS VGA best for DQK)
PLATFORM_ORDER = {
    'cok': ['amiga', 'dos', 'c64'],
    'dok': ['amiga', 'dos', 'c64'],
    'dqk': ['dos', 'amiga'],
    # Gateway: Amiga ships a real 32-colour table per picture; the DOS decode's indices 18..31 have NO proven
    # RGB (tools/gateway_pic_decode.py: "UNPROVEN"), so DOS faces render grey. Judged by eye 2026-10-14.
    'gateway': ['amiga', 'dos'],
}
DEFAULT_ORDER = ['amiga', 'dos', 'c64']
GAME_NAMES = {'cok': 'Champions of Krynn', 'dok': 'Death Knights of Krynn', 'dqk': 'The Dark Queen of Krynn',
              'pool': 'Pool of Radiance', 'gateway': 'Gateway to the Savage Frontier'}
# older Amiga render dirs superseded by tools/amiga_cokdok_render.py output (identical or stale copies); never the representative
LEGACY_DIRS = ('daa/BIGPIC1_', 'daa/bigpic2_', 'daa/ChampionsOfKrynn_', 'daa/DeathKnightsOfKrynn_', 'daa/dok_cpic1', 'daa/CPIC1_')
KIND_WEIGHT = {'scene': 5.0, 'title': 4.5, 'portrait': 4.0, 'face': 3.5, 'logo': 3.0, 'map': 2.5}

# ------------------------------------------------------------------ source table
# (render dir relative to renders/, game, platform, default kind, file regex, note)
SOURCES = [
    ('dax/CoK_BIGPIC1', 'cok', 'dos', 'scene', r'BIGPIC1_\d+\.png', ''),
    ('dax/DoK_BIGPIC1', 'dok', 'dos', 'scene', r'BIGPIC1_\d+\.png', ''),
    ('daa/BIGPIC1_ChampionsOfKrynn', 'cok', 'amiga', 'scene', r'BIGPIC1_\d+\.png', ''),
    ('daa/BIGPIC1_cok', 'cok', 'amiga', 'scene', r'BIGPIC1_\d+\.png', ''),
    ('daa/ChampionsOfKrynn_disk2_BIGPIC1', 'cok', 'amiga', 'scene', r'BIGPIC1_\d+\.png', ''),
    ('daa/ChampionsOfKrynn_disk2_BIGPIC1.DAA', 'cok', 'amiga', 'scene', r'BIGPIC1_\d+\.png', ''),
    ('daa/bigpic2_ChampionsOfKrynn', 'cok', 'amiga', 'scene', r'bigpic2_\d+\.png', ''),
    ('daa/DeathKnightsOfKrynn_disk1_BIGPIC1.DAA', 'dok', 'amiga', 'scene', r'BIGPIC1_\d+\.png', ''),
    # Amiga CoK/DoK full renders (tools/amiga_cokdok_render.py; renders/amiga_cokdok/README.md). Canonical Amiga sources
    # for both games; the older daa/* dirs above stay scanned only so batch01 'done' paths and identical copies fold in.
    ('daa/CoK_BIGPIC1', 'cok', 'amiga', 'scene', r'BIGPIC1_\d+\.png', 'Amiga cokdok render'),
    ('daa/CoK_BIGPIC2', 'cok', 'amiga', 'scene', r'BIGPIC2_\d+\.png', 'Amiga cokdok render'),
    ('daa/DoK_BIGPIC1', 'dok', 'amiga', 'scene', r'BIGPIC1_\d+\.png', 'Amiga cokdok render'),
    ('daa/DoK_BIGPIC2', 'dok', 'amiga', 'scene', r'BIGPIC2_\d+\.png', 'Amiga cokdok render'),
    ('daa/CoK_BODY1', 'cok', 'amiga', 'portrait', r'BODY1_\d+\.png', 'Amiga body picture'),
    ('daa/CoK_PIC1', 'cok', 'amiga', 'portrait', r'PIC1_\d+_f0\.png', 'Amiga PIC frame 0'),
    ('daa/CoK_PIC2', 'cok', 'amiga', 'portrait', r'PIC2_\d+_f0\.png', 'Amiga PIC frame 0'),
    ('daa/DoK_PIC1', 'dok', 'amiga', 'portrait', r'PIC1_\d+_f0\.png', 'Amiga PIC frame 0'),
    ('daa/DoK_PIC2', 'dok', 'amiga', 'portrait', r'PIC2_\d+_f0\.png', 'Amiga PIC frame 0'),
    ('amiga_cokdok/lbm', 'cok', 'amiga', 'title', r'CoK_(?:scrn1b|scrn2|text1|text2)\.png', 'Amiga IFF ILBM title screen/band'),
    ('amiga_cokdok/lbm', 'dok', 'amiga', 'title', r'DoK_(?:Title0|Title1|Title1A|Title1B)\.png', 'Amiga IFF ILBM title screen/band'),
    ('dax/CoK_TITLE', 'cok', 'dos', 'title', r'TITLE_\d+\.png', ''),
    ('dax/DoK_TITLE', 'dok', 'dos', 'title', r'TITLE_\d+\.png', ''),
    ('dax/cok_head2', 'cok', 'dos', 'face', r'HEAD\d_\d+\.png', ''),
    ('daa/cok_head1', 'cok', 'amiga', 'face', r'HEAD\d_\d+\.png', ''),
    ('dax/CoK_CHEAD', 'cok', 'dos', 'face', r'CHEAD_\d+\.png', 'combat head icons'),
    ('dax/dok_cpic1', 'dok', 'dos', 'portrait', r'CPIC1_\d+\.png', 'combat pictures'),
    ('daa/dok_cpic1', 'dok', 'amiga', 'portrait', r'CPIC1_\d+\.png', 'combat pictures'),
    ('daa/CPIC1_ChampionsOfKrynn', 'cok', 'amiga', 'portrait', r'CPIC1_\d+\.png', 'combat pictures'),
    ('daa/CPIC1_DeathKnights', 'dok', 'amiga', 'portrait', r'CPIC1_\d+\.png', 'combat pictures'),
    ('dax_complex/PIC1', 'dok', 'dos', 'portrait', r'PIC1_\d+_f0\.png', 'DoK PIC1.DAX frame 0'),
    ('dax_complex/PIC1_xor', 'cok', 'dos', 'portrait', r'PIC1_\d+_f0\.png', 'CoK PIC1.DAX frame 0 (xor-delta decode)'),
    ('hlib/BIGPIC', 'dqk', 'dos', 'scene', r'BIGPIC_set\d+_img001\.png', ''),
    ('glib/BIGPIC', 'dqk', 'amiga', 'scene', r'BIGPIC_set\d+_img001\.png', ''),
    ('hlib/PICA', 'dqk', 'dos', 'portrait', r'PICA_set\d+_img\d+\.png', 'one frame per set (see PREFERRED_FRAME)'),
    ('hlib/TITLE', 'dqk', 'dos', 'title', r'TITLE_set\d+_img\d+\.png', ''),
    ('glib/TITLE', 'dqk', 'amiga', 'title', r'TITLE_set\d+_img\d+\.png', ''),
    ('pool_amiga/pic', 'pool', 'amiga', 'portrait', r'pic_\d+_f0\.png', 'frame 0 only'),
    ('pool_amiga/final', 'pool', 'amiga', 'scene', r'final_\d+_f0\.png', 'ending scenes, frame 0 only'),
    ('gateway-amiga/PIC', 'gateway', 'amiga', 'portrait', r'amiga_pic_\d+\.png',
     'Amiga Pic.tlb, own 32-colour table per picture (tools/gateway_amiga_render.py)'),
    ('gateway-pic/PIC', 'gateway', 'dos', 'portrait', r'pic_\d+\.png', ''),
    ('gateway-pic/PIC2', 'gateway', 'dos', 'portrait', r'pic2_\d+\.png', ''),
    ('gateway-pic/PIC3', 'gateway', 'dos', 'portrait', r'pic3_\d+\.png', ''),
    ('gateway-pic/PIC4', 'gateway', 'dos', 'portrait', r'pic4_\d+\.png', ''),
    ('gateway-pic/PIC5', 'gateway', 'dos', 'portrait', r'pic5_\d+\.png', ''),
    ('gateway-pic/PIC6', 'gateway', 'dos', 'portrait', r'pic6_\d+\.png', ''),
    ('gateway-pic-all', 'gateway', 'dos', 'portrait', r'pic\d*_\d+\.png', 'flat copy of gateway-pic/*'),
]

# Render folders deliberately NOT scanned, with the reason (reported in the md).
UNSCANNED = {
    'dax/TITLE_check': 'composite/diagnostic images, not originals',
    'dax/cok_comspr, dax/dok_comspr, daa/*comspr, hlib/COMSPR, glib/Sprit, hlib/SPRIT, pool_amiga/{comspr,sprit,cbody,cpic,chead,icon}':
        'sprites/combat icons: native <= 48x48, below the size threshold',
    'dax_complex/PIC1_noxor': 'the wrong (non-xor) decode variant of CoK PIC1; PIC1_xor is used',
    'dax_complex/SPRIT1': 'sprites',
    'hlib/BACK, hlib/GEN, daa/BACK1*, dax/DoK_BACK1': 'background/texture strips, not pictures',
    '*8X8D*, hlib/DUNGCOM, hlib/WILDCOM, hlib/ALWAYS, hlib/FRAME, daa/BORDER, pool_amiga/{8x8d,bacpac,dungcom,randcom,wildcom}':
        'wall tiles / UI frames / dungeon cells',
    'daa/lbm': 'Amiga cracktro screen carrying crack-group credit text, not original art',
    'amiga_cokdok/lbm/*_rgba.png': 'IFF mask stencils, not pictures (the stencil does not equal the lettering: see imggen-webpack.md)',
    'daa/*_PIC1|PIC2 frames f1+': 'animation/XOR-delta frames of the Amiga PIC blocks; only frame 0 is the picture',
    'glib/PIC': 'Amiga DQK PIC decode uses a wrong palette (garish) and is mostly delta frames; DOS PICA is the art source',
    'pool_amiga/{head,body,paperdoll,head_alt,body_alt}': 'rendered with a placeholder palette (teal skin); not trustworthy as art',
    'c64*, renders/dqk-demo-pictures, renders/artmap, renders/explore': 'composites/probes/derived copies, no per-picture originals',
    'hlib/CPIC, glib/CPIC': 'native 48x48 combat icons (below size threshold)',
}

# Per-set preferred frame where the default (img001) is a junk strip sheet. Honest: curated from viewing.
PREFERRED_FRAME = {('hlib/PICA', 'set04'): 'img007', ('hlib/PICA', 'set13'): 'img003'}
# Curated exclusions by source path, reason. Everything else is excluded only by measured rules.
CURATED_EXCLUDE = {
    'hlib/TITLE/TITLE_set01_img001.png': 'plain red gradient background, no content',
    'glib/TITLE/TITLE_set01_img001.png': 'plain red gradient background, no content',
    'hlib/TITLE/TITLE_set05_img001.png': 'marble texture frame, no content',
    'glib/TITLE/TITLE_set05_img001.png': 'marble texture frame, no content',
    'hlib/TITLE/TITLE_set04_img002.png': 'copyright text strip',
}
# Visible decode defects a cheap metric cannot see (curated from viewing the render): path -> warning.
CURATED_WARN = {
    'dax/DoK_BIGPIC1/BIGPIC1_112.png': 'decode defect: right half of the overland map is sheared/smeared',
}
CREDIT_SETS = ('set09', 'set10')   # DQK credit pages (pure text)
MAP_HINTS = {  # source path substring -> kind override
    'BIGPIC1_121': 'map', 'DoK_BIGPIC1/BIGPIC1_112': 'map',
    'BIGPIC_set01': 'map', 'BIGPIC_set02': 'map', 'BIGPIC_set06': 'map',
}
LBM_BAND_HINTS = ('Title1A', 'Title1B', 'text1', 'text2')   # Amiga ILBM bands (lettering over a parent screen)
LOGO_HINTS = ('TITLE_set02', 'TITLE_set03', 'TITLE_set04', 'TITLE_set06', 'TITLE_set07')


# ------------------------------------------------------------------ image helpers
def load_rgb(path):
    return np.array(Image.open(path).convert('RGB'))


def detect_scale(a):
    """Largest (kx, ky) such that `a` is an exact nearest-neighbour upscale of a[::ky, ::kx]."""
    h, w = a.shape[:2]

    def best(axis, n):
        for k in range(12, 1, -1):
            if n % k:
                continue
            s = a[::k] if axis == 0 else a[:, ::k]
            if np.array_equal(np.repeat(s, k, axis=axis), a):
                return k
        return 1
    return best(1, w), best(0, h)


def native_of(a):
    kx, ky = detect_scale(a)
    return a[::ky, ::kx], (kx, ky)


def pixel_key(n):
    return hashlib.sha1(n.tobytes() + bytes(str(n.shape), 'ascii')).hexdigest()[:16]


def metrics(n):
    """Cheap measurable quality figures on the NATIVE array."""
    h, w = n.shape[:2]
    flat = (n[..., 0].astype(np.uint32) << 16) | (n[..., 1].astype(np.uint32) << 8) | n[..., 2]
    vals, counts = np.unique(flat, return_counts=True)
    dominant = counts.max() / flat.size
    dx = (flat[:, 1:] != flat[:, :-1])
    dy = (flat[1:, :] != flat[:-1, :])
    edge = (dx.sum() + dy.sum()) / (dx.size + dy.size)
    c = flat[1:-1, 1:-1]
    iso = ((flat[1:-1, :-2] != c) & (flat[1:-1, 2:] != c) & (flat[:-2, 1:-1] != c) & (flat[2:, 1:-1] != c)).mean()         if h > 2 and w > 2 else 0.0
    return dict(isolated_pixels=round(float(iso), 4), unique_colours=int(len(vals)), dominant_fraction=round(float(dominant), 4),
                nonblank_fraction=round(float(1 - dominant), 4), edge_density=round(float(edge), 4),
                seam=wrap_seam(n))


def wrap_seam(n):
    """Wrap / clip artefact figures (two independent tests, both measured).

    1. INTERIOR SEAM: a picture whose columns were rotated by the decoder has one interior column
       boundary where content from opposite sides of the true image meets; its mean colour
       difference over all rows is an outlier. `interior_ratio` = largest boundary difference /
       second largest (1.0-1.25 on every healthy image in the corpus, 1.6+ on a strip-sheet decode),
       `x` = where.
    2. EDGE CUT: on a banner (one background colour covers 25-95% of the picture) ink that touches
       BOTH outer columns in different colours means glyphs are sliced by the left and right edges,
       i.e. the banner was clipped or wrapped. `edge_both` = fraction of rows with non-background ink
       at x=0 and x=w-1; `edge_eq` = the subset where the two colours are equal (a bar that runs
       through legitimately, e.g. the SSI logo stripes, is equal on both sides).
    """
    f = n.astype(np.int16)
    d = np.abs(f[:, 1:, :] - f[:, :-1, :]).sum(axis=2).mean(axis=0)
    x = int(np.argmax(d))
    srt = np.sort(d)
    ratio = float(srt[-1] / (srt[-2] + 1e-6)) if len(srt) > 1 else 1.0
    flat = (n[..., 0].astype(np.uint32) << 16) | (n[..., 1].astype(np.uint32) << 8) | n[..., 2]
    v, c = np.unique(flat, return_counts=True)
    bg = v[c.argmax()]
    L = flat[:, 0] != bg
    R = flat[:, -1] != bg
    return dict(interior_ratio=round(ratio, 2), x=x, edge_both=round(float((L & R).mean()), 3),
                edge_eq=round(float((L & R & (flat[:, 0] == flat[:, -1])).mean()), 3),
                dominant=round(float(c.max() / flat.size), 3))


def seam_warn(m):
    """Return a list of human-readable wrap warnings for metrics `m` (which carries 'w')."""
    s = m['seam']
    out = []
    if s['interior_ratio'] >= SEAM_RATIO_WARN and 3 <= s['x'] <= m['w'] - 4:
        out.append(f'wrap-artefact? interior vertical seam at x={s["x"]} (boundary {s["interior_ratio"]}x the next strongest)')
    if m.get('banner') and 0.25 < s['dominant'] < 0.95 and s['edge_both'] >= 0.10 and s['edge_eq'] < 0.5 * s['edge_both']:
        out.append(f'wrap/clip artefact? ink cut at both outer edges ({s["edge_both"]:.0%} of rows, colours differ)')
    return out


def signature(n, width=48):
    """Palette-independent signature: luminance + edge maps on a fixed grid, mean-removed, unit norm."""
    h, w = n.shape[:2]
    g = (0.299 * n[..., 0] + 0.587 * n[..., 1] + 0.114 * n[..., 2]).astype(np.float32)
    hh = max(8, int(round(width * h / w)))
    im = Image.fromarray(g).resize((width, hh), Image.BILINEAR)
    lum = np.asarray(im, dtype=np.float32)
    gx = np.abs(np.diff(lum, axis=1))[:-1]
    gy = np.abs(np.diff(lum, axis=0))[:, :-1]
    edge = gx + gy

    def norm(v):
        v = v.ravel() - v.mean()
        return v / (np.linalg.norm(v) + 1e-6)
    return norm(lum), norm(edge)


def similarity(a, b):
    """Dedupe similarity: max of luminance correlation, and the mean of luminance+edge."""
    la, ea = a
    lb, eb = b
    if la.shape != lb.shape:
        return 0.0
    cl = float(la @ lb)
    ce = float(ea @ eb)
    return max(cl, 0.5 * (cl + ce) if cl > 0 else 0.0)


# ------------------------------------------------------------------ scanning
def stem_info(rel):
    """Return (stem, set_key) from a render path for naming and per-set rules."""
    base = os.path.splitext(os.path.basename(rel))[0]
    m = re.search(r'(set\d+)', base)
    return base, (m.group(1) if m else None)


def collect(renders=RENDERS):
    items = []
    for d, game, plat, kind, rx, note in SOURCES:
        full = os.path.join(renders, d)
        if not os.path.isdir(full):
            continue
        for fn in sorted(os.listdir(full)):
            if not re.fullmatch(rx, fn):
                continue
            rel = f'{d}/{fn}'
            items.append(dict(rel=rel, game=game, platform=plat, kind=kind, note=note, path=os.path.join(full, fn)))
    return items


def classify_kind(it):
    rel = it['rel']
    kind = it['kind']
    for h, k in MAP_HINTS.items():
        if h in rel:
            return 'map'
    if kind == 'title' and any(h in rel for h in LOGO_HINTS):
        return 'logo'
    if kind == 'title' and rel.startswith('amiga_cokdok/lbm/') and any(h in rel for h in LBM_BAND_HINTS):
        return 'logo'
    return kind


def exclusion_reason(it, m, native_wh, preferred_ok):
    """First applicable exclusion reason, or None. All rules but CURATED_* are measured."""
    rel = it['rel']
    w, h = native_wh
    if rel in CURATED_EXCLUDE and CURATED_EXCLUDE[rel]:
        return 'curated: ' + CURATED_EXCLUDE[rel]
    _, setkey = stem_info(rel)
    if it['kind'] in ('title', 'logo') and setkey in CREDIT_SETS:
        return 'curated: credits text page'
    if not preferred_ok:
        return 'not the preferred frame of its set (delta/strip frame)'
    face = it['kind'] == 'face'
    if face:
        if w < FACE_MIN_W or h < FACE_MIN_H:
            return f'too small: native {w}x{h} < face threshold {FACE_MIN_W}x{FACE_MIN_H}'
    else:
        if w * h < MIN_AREA or min(w, h) < MIN_SIDE:
            return f'too small: native {w}x{h} (< {MIN_AREA} px area or < {MIN_SIDE} px side)'
    if m['unique_colours'] < MIN_COLOURS:
        return f'near blank: only {m["unique_colours"]} unique colours'
    if m['dominant_fraction'] > BLANK_DOMINANT_MAX:
        return f'near blank/delta frame: one colour covers {m["dominant_fraction"]:.0%}'
    if m['edge_density'] < MIN_EDGE_DENSITY and it['kind'] != 'logo':
        return f'no content: edge density {m["edge_density"]:.3f} < {MIN_EDGE_DENSITY}'
    return None


def warnings_for(it, m, native_wh):
    w = []
    w.extend(seam_warn(dict(m, w=native_wh[0], banner=it['kind'] in ('title', 'logo'))))
    if it['rel'] in CURATED_WARN:
        w.append(CURATED_WARN[it['rel']])
    if m['unique_colours'] < LOW_COLOURS_WARN:
        w.append(f'low colour count ({m["unique_colours"]})')
    return w


def preferred_frame_ok(it):
    rel = it['rel']
    d = rel.rsplit('/', 1)[0]
    stem, setkey = stem_info(rel)
    if setkey and (d, setkey) in PREFERRED_FRAME:
        return stem.endswith(PREFERRED_FRAME[(d, setkey)])
    if d in ('hlib/PICA',):
        return stem.endswith('img001')
    if d in ('hlib/TITLE', 'glib/TITLE'):
        return True   # titles have multiple legit images per set
    return True


def make_id(it):
    stem, _ = stem_info(it['rel'])
    d = it['rel'].rsplit('/', 1)[0].replace('/', '_').replace('.', '_')
    return f"{it['game']}_{it['platform']}_{d}_{stem}".lower()


def platform_rank(game, plat):
    order = PLATFORM_ORDER.get(game, DEFAULT_ORDER)
    return order.index(plat) if plat in order else len(order)


# ------------------------------------------------------------------ Amiga <-> DOS twins (CoK / DoK)
TWINS_REL = os.path.join('amiga_cokdok', 'twins.json')
TWIN_FORCE_CONF = ('high', 'medium')   # 'low'/'none' twins are reported, never used to merge groups


def dos_key(rel):
    """(game, DOS archive stem, block id) of a DOS render path, or None. Mirrors how twins.json names DOS pictures."""
    r = rel.replace(chr(92), '/')
    m = re.match(r'dax/(CoK|DoK)_(BIGPIC1|TITLE)/(?:BIGPIC1|TITLE)_(\d+)\.png$', r)
    if m:
        return (m.group(1).lower(), m.group(2), int(m.group(3)))
    m = re.match(r'dax/cok_head2/(HEAD\d)_(\d+)\.png$', r)
    if m:
        return ('cok', m.group(1), int(m.group(2)))
    m = re.match(r'dax_complex/(PIC1_xor|PIC1)/PIC1_(\d+)_f0\.png$', r)
    if m:
        return ('cok' if m.group(1) == 'PIC1_xor' else 'dok', 'PIC1', int(m.group(2)))
    return None


def load_twins(renders=RENDERS):
    p = os.path.join(renders, TWINS_REL)
    if not os.path.exists(p):
        return {}
    return json.load(open(p, encoding='utf-8'))


def cokdok_twin_info(renders, rels):
    """For every Amiga CoK/DoK render in `rels`: its DOS twins (from renders/amiga_cokdok/twins.json) as dicts
    {file, block, rel|None (the DOS render we hold), confidence, purity, luminance_corr, forced}. `forced` = confidence
    high/medium AND we hold the DOS render, so the pair is merged into one dedupe group."""
    twins = load_twins(renders)
    lower = {r.lower(): r for r in rels}   # Windows is case-insensitive: twins say daa/CoK_HEAD1, the dir is daa/cok_head1
    have = {}
    for r in rels:
        k = dos_key(r)
        if k:
            have[k] = r
    out = {}
    for arel0, v in twins.items():
        arel = lower.get(arel0.lower())
        if arel is None:
            continue
        lst = []
        for t in v.get('dos_twins', []):
            k = (v['game'], os.path.splitext(t['file'])[0].upper(), int(t['block']))
            drel = have.get(k)
            lst.append(dict(file=t['file'], block=int(t['block']), rel=drel, confidence=v.get('confidence'),
                            purity=v.get('purity'), luminance_corr=v.get('luminance_corr'),
                            forced=bool(drel and v.get('confidence') in TWIN_FORCE_CONF)))
        if lst:
            out[arel] = lst
    return out


def twin_pairs(info):
    return [(a, t['rel']) for a, lst in info.items() for t in lst if t['forced']]


# ------------------------------------------------------------------ title sequences (intro screens in display order)
# Each step lists the member renders (Amiga first) that make up its dedupe group.  x/y = placement on the 320x200 screen
# (derived from the bytes by tools/imggen_layers.py and pinned in the tests against these constants).
SEQUENCES = {
    'dok_title': dict(game='dok', title='Death Knights of Krynn intro title sequence', steps=[
        dict(order=1, role='background', members=['amiga_cokdok/lbm/DoK_Title0.png', 'dax/DoK_TITLE/TITLE_001.png'], parent=None, x=0, y=0,
             note='Title0: "SSI presents" screen, opaque full frame, shown first (DOS TITLE_001).'),
        dict(order=2, role='background', members=['amiga_cokdok/lbm/DoK_Title1.png', 'dax/DoK_TITLE/TITLE_002.png'], parent=None, x=0, y=0,
             note='Title1: moon + riders background with NO text on purpose; the bands below are drawn over it (DOS TITLE_002).'),
        dict(order=3, role='overlay', members=['amiga_cokdok/lbm/DoK_Title1A.png', 'dax/DoK_TITLE/TITLE_003.png'], parent=2, x=0, y=88,
             note='Title1A: "A DRAGONLANCE Fantasy Role-Playing Epic Vol. II" band, transparent layer over step 2 at (0,88) (DOS TITLE_003).'),
        dict(order=4, role='overlay', members=['amiga_cokdok/lbm/DoK_Title1B.png', 'dax/DoK_TITLE/TITLE_004.png'], parent=2, x=0, y=88,
             note='Title1B: "DEATH KNIGHTS OF KRYNN" lettering, transparent layer over step 2 at (0,88); it REPLACES step 3 (DOS TITLE_004).'),
    ]),
    'cok_title': dict(game='cok', title='Champions of Krynn intro title sequence', steps=[
        dict(order=1, role='background', members=['amiga_cokdok/lbm/CoK_scrn1b.png', 'dax/CoK_TITLE/TITLE_001.png'], parent=None, x=0, y=0,
             note='scrn1b: SSI / Advanced Dungeons & Dragons presents screen, opaque full frame (DOS TITLE_001).'),
        dict(order=2, role='background', members=['amiga_cokdok/lbm/CoK_scrn2.png', 'dax/CoK_TITLE/TITLE_002.png'], parent=None, x=0, y=0,
             note='scrn2: night sky, moon, sword, crown and roses background (DOS TITLE_002); the bands below are drawn over it.'),
        dict(order=3, role='overlay', members=['amiga_cokdok/lbm/CoK_text1.png', 'dax/CoK_TITLE/TITLE_003.png'], parent=2, x=40, y=8,
             note='text1: "Champions of Krynn" lettering, transparent layer over step 2 at (40,8) (DOS TITLE_003).'),
        dict(order=4, role='overlay', members=['amiga_cokdok/lbm/CoK_text2.png', 'dax/CoK_TITLE/TITLE_004.png'], parent=2, x=0, y=8,
             note='text2: "A DRAGONLANCE Fantasy Role-Playing Epic Vol. I" band, transparent layer over step 2 at (0,8); it REPLACES step 3 (DOS TITLE_004).'),
    ]),
}


def attach_sequences(groups, recs_members):
    """Set g['sequence'] = {id, order, role, parent, x, y, note, title} on the group holding each step's member renders.
    `recs_members`: group_key -> set of member rels (all of them, incl. excluded-as-done groups). Returns problems (missing steps)."""
    by_rel = {}
    for g in groups:
        for rel in recs_members.get(g['group_key'], ()):
            by_rel[rel] = g
    problems = []
    for sid, seq in SEQUENCES.items():
        gs = {}
        for st in seq['steps']:
            g = next((by_rel[m] for m in st['members'] if m in by_rel), None)
            if g is None:
                problems.append(f'{sid} step {st["order"]}: none of {st["members"]} is in a dedupe group')
                continue
            gs[st['order']] = g
        for st in seq['steps']:
            g = gs.get(st['order'])
            if g is None:
                continue
            par = gs.get(st['parent']) if st['parent'] else None
            g['sequence'] = dict(id=sid, title=seq['title'], order=st['order'], role=st['role'], parent=par['id'] if par else None,
                                 x=st['x'], y=st['y'], note=st['note'], steps=len(seq['steps']))
    return problems


# ------------------------------------------------------------------ grouping
class DSU:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        self.p[self.find(a)] = self.find(b)


def aspect(it):
    return it['native'][0] / it['native'][1]


def forced_pairs(renders=RENDERS):
    """(rel_a, rel_b) twins asserted by tools/gateway_amiga_render.py (palette-invariant pixel-structure
    match, purity >= 0.97). Needed because the Amiga and DOS renders use different palettes, so the
    luminance signature alone does not always reach DEDUPE_CORR."""
    p = os.path.join(renders, 'gateway-amiga', 'twins.json')
    if not os.path.exists(p):
        return []
    out = []
    for rel, v in json.load(open(p, encoding='utf-8')).items():
        for t in v.get('dos_twins', []):
            out.append((rel, t['render']))
    return out


def group_items(recs, corr=DEDUPE_CORR, forced=None):
    """recs: dicts with 'native' (w,h), 'sig', 'pixkey', 'game'. Returns list of index lists.
    Same picture = same game AND (identical native pixels, OR same aspect + signature similarity >= corr), or a forced twin."""
    n = len(recs)
    dsu = DSU(n)
    by_key = {}
    for i, r in enumerate(recs):
        by_key.setdefault((r['game'], r['pixkey']), []).append(i)
    for idxs in by_key.values():
        for j in idxs[1:]:
            dsu.union(idxs[0], j)
    if forced:
        idx_of = {r['rel']: i for i, r in enumerate(recs)}
        for a, b in forced:
            if a in idx_of and b in idx_of:
                dsu.union(idx_of[a], idx_of[b])
    buckets = {}
    for i, r in enumerate(recs):
        buckets.setdefault(round(aspect(r) / ASPECT_TOL), []).append(i)
    for key, idxs in list(buckets.items()):   # neighbouring aspect buckets compare too
        pool = idxs + buckets.get(key + 1, [])
        for ai, i in enumerate(idxs):
            for j in pool:
                if j <= i:
                    continue
                if abs(aspect(recs[i]) / aspect(recs[j]) - 1) > ASPECT_TOL:
                    continue
                if recs[i]['game'] != recs[j]['game']:   # CoK/DoK share layouts (SSI screen, border): never one picture
                    continue
                if dsu.find(i) == dsu.find(j):
                    continue
                if similarity(recs[i]['sig'], recs[j]['sig']) >= corr:
                    dsu.union(i, j)
    groups = {}
    for i in range(n):
        groups.setdefault(dsu.find(i), []).append(i)
    return [sorted(v) for v in groups.values()]


def pick_representative(members, recs):
    """Best-art rule: clean beats flagged, then the game's platform order, then colours, then path."""
    def key(i):
        r = recs[i]
        return (1 if r['warnings'] else 0, platform_rank(r['game'], r['platform']), 1 if '-all' in r['rel'] else 0,
                1 if r['rel'].startswith(LEGACY_DIRS) else 0,
                r['metrics']['isolated_pixels'] // 0.05, -r['metrics']['unique_colours'], r['rel'])
    return min(members, key=key)


def score(r):
    parts = {}
    parts['kind'] = KIND_WEIGHT.get(r['kind'], 2.0)
    w, h = r['native']
    parts['size'] = round(min(2.0, np.log2(max(w * h, 1) / 4096.0) * 0.5), 2)
    parts['colours'] = round(min(r['metrics']['unique_colours'], 32) / 32.0, 2)
    parts['warnings'] = -1.5 * len(r['warnings'])
    total = round(sum(parts.values()), 2)
    reason = ' + '.join(f'{k} {v:+g}' for k, v in parts.items())
    return total, reason


# ------------------------------------------------------------------ decode consensus
OUTLIER_MAX_SIM, AGREE_MIN_SIM = 0.5, 0.7


def consensus_outliers(recs):
    """Indices of images that disagree with >= 2 independent decodes of the same game+block stem.

    The same block decoded by different tool revisions / platforms must look the same. If two or more
    other renders of one block agree with each other (>= AGREE_MIN_SIM) and this one resembles none of
    them (< OUTLIER_MAX_SIM), it is a stale or broken decode (measured, no manual list)."""
    by = {}
    for i, r in enumerate(recs):
        by.setdefault((r['game'], stem_info(r['rel'])[0].lower()), []).append(i)
    bad = {}
    for key, idxs in by.items():
        if len(idxs) < 3:
            continue
        for i in idxs:
            others = [j for j in idxs if j != i]
            sims = {j: similarity(recs[i]['sig'], recs[j]['sig']) for j in others}
            if max(sims.values()) >= OUTLIER_MAX_SIM:
                continue
            agree = any(similarity(recs[a]['sig'], recs[b]['sig']) >= AGREE_MIN_SIM
                        for a in others for b in others if a < b)
            if agree:
                bad[i] = max(sims.values())
    return bad


# ------------------------------------------------------------------ main scan
def batch01_srcs():
    if not os.path.exists(BATCH01_MANIFEST):
        return []
    mf = json.load(open(BATCH01_MANIFEST, encoding='utf-8'))
    out = []
    for it in mf.get('items', []):
        s = it['src']
        out.append(s[len('renders/'):] if s.startswith('renders/') else s)
    return out


def scan(renders=RENDERS, done=None, progress=False):
    done = set(batch01_srcs() if done is None else done)
    raw = collect(renders)
    recs, excluded = [], []
    for it in raw:
        a = load_rgb(it['path'])
        n, (kx, ky) = native_of(a)
        wh = (n.shape[1], n.shape[0])
        m = metrics(n)
        it['kind'] = classify_kind(it)
        why = exclusion_reason(it, m, wh, preferred_frame_ok(it))
        rec = dict(id=make_id(it), game=it['game'], platform=it['platform'], rel=it['rel'], kind=it['kind'],
                   note=it['note'], native=wh, render_size=(a.shape[1], a.shape[0]), scale=(kx, ky),
                   metrics=m, warnings=warnings_for(it, m, wh), pixkey=pixel_key(n))
        if why:
            rec['excluded'] = why
            excluded.append(rec)
            continue
        rec['sig'] = signature(n)
        recs.append(rec)
    outliers = consensus_outliers(recs)
    for i, sim in sorted(outliers.items(), reverse=True):
        r = recs.pop(i)
        r['excluded'] = (f'decode junk: disagrees with the other decodes of the same block '
                         f'(best similarity {sim:.2f} < {OUTLIER_MAX_SIM})')
        excluded.append(r)
    twin_info = cokdok_twin_info(renders, {it['rel'] for it in raw})
    forced = forced_pairs(renders) + twin_pairs(twin_info)
    groups = group_items(recs, forced=forced)
    out_groups = []
    members_of = {}
    for members in groups:
        rep = pick_representative(members, recs)
        r = recs[rep]
        alts = [recs[i] for i in members if i != rep]
        done_members = [recs[i] for i in members if recs[i]['rel'] in done]
        total, reason = score(r)
        g = dict(
            id=r['id'], game=r['game'], platform=r['platform'], source=f"renders/{r['rel']}",
            native_size=list(r['native']), render_size=list(r['render_size']), kind=r['kind'],
            group_key='g_' + hashlib.sha1(('|'.join(sorted(recs[i]['rel'] for i in members))).encode()).hexdigest()[:10],
            unique_colours=r['metrics']['unique_colours'], nonblank_fraction=r['metrics']['nonblank_fraction'],
            edge_density=r['metrics']['edge_density'], seam=r['metrics']['seam'],
            warnings=r['warnings'], score=total, score_reason=reason,
            alternates=[dict(id=a['id'], platform=a['platform'], game=a['game'], source=f"renders/{a['rel']}",
                             native_size=list(a['native']),
                             match='exact' if a['pixkey'] == r['pixkey'] else 'similar',
                             similarity=round(similarity(a['sig'], r['sig']), 3)) for a in alts],
        )
        if r['note']:
            g['note'] = r['note']
        id_of = {recs[i]['rel']: recs[i]['id'] for i in members}
        tw = []
        for i in members:
            for t in twin_info.get(recs[i]['rel'], []):
                did = id_of.get(t['rel'])
                tw.append(dict(t, amiga_id=recs[i]['id'], dos_id=did, rel=None if t['rel'] is None else f"renders/{t['rel']}",
                               stage_id=None if t['rel'] is None else (did or 'twin_' + re.sub(r'[^A-Za-z0-9]+', '_', t['rel']).strip('_').lower())))
        if tw:
            g['dos_twins'] = tw
        amig = [recs[i] for i in members if recs[i]['platform'] == 'amiga' and recs[i]['game'] in ('cok', 'dok')]
        if done_members:
            g['excluded'] = 'already done in batch01 (' + ', '.join(sorted(d['rel'] for d in done_members)) + ')'
            eq = [a for a in amig if a['rel'] not in done]
            g['done_in_batch01'] = dict(
                sources=sorted(f"renders/{d['rel']}" for d in done_members),
                amiga_equivalent=None if not amig else dict(
                    id=amig[0]['id'], source=f"renders/{amig[0]['rel']}", native_size=list(amig[0]['native']),
                    already_used=amig[0]['rel'] in done,
                    note=('the pilot already used this Amiga source' if amig[0]['rel'] in done else
                          'redo from this Amiga render if the Amiga colours are wanted (the pilot restyled the DOS 16-colour source)')))
        members_of[g['group_key']] = {recs[i]['rel'] for i in members}
        out_groups.append(g)
    scan.sequence_problems = attach_sequences(out_groups, members_of)
    out_groups.sort(key=lambda g: (-g['score'], g['id']))
    return out_groups, [dict((k, v) for k, v in e.items() if k not in ('sig', 'pixkey')) for e in excluded]


# ------------------------------------------------------------------ game text + animation annotations
KIND_RANK = {'narration': 3, 'dialogue-mixed': 2, 'prompt': 1}
CONF_RANK = {'high': 3, 'medium': 2, 'low': 1, 'none': 0}
CONTEXT_MAX_CHARS = 320
MAX_TEXT_RECORDS = 3
MAX_PREVIEW_FRAMES = 8
_ID_RX = re.compile(r'((?:BIGPIC|PIC)\d)_(\d+)', re.I)
# quoted speech: an opening ' at a word start up to a closing ' that is followed by space/punctuation/end (so WHAT'S survives)
_QUOTE_RX = re.compile(r"(?:(?<=\s)|^)'(?=\S).+?(?<=\S)'(?=[\s.,;:!?)]|$)")


def is_overlay_patch(g):
    """A DQK PICA frame img00N>1 is a patch drawn over img001, not a picture (imggen-animated-pictures.md section 5.5)."""
    if (g.get('animation') or {}).get('source_frame_role') == 'overlay-patch':
        return True
    rel = g.get('source', '').replace(chr(92), '/')
    return any(f'/{d}/' in rel and rel.endswith(f'_{st}_{fr}.png') for (d, st), fr in PREFERRED_FRAME.items())


def context_text(rec_kind, text, limit=CONTEXT_MAX_CHARS):
    """Text that may be quoted to the image model as GAME CONTEXT, or None.
    narration: kept (player-addressed questions dropped); dialogue-mixed: quoted speech removed, so a character's claim is not
    fed as scene fact; prompt (menu/question text): never. Truncated at a sentence, else word, boundary."""
    if rec_kind not in ('narration', 'dialogue-mixed'):
        return None, False
    t = re.sub(r'\s+', ' ', text.replace(' / ', ' ').replace('/', ' ')).strip()
    stripped = False
    if rec_kind == 'dialogue-mixed' or _QUOTE_RX.search(t):
        t2 = _QUOTE_RX.sub('', t)
        stripped = t2 != t
        t = re.sub(r'\s+', ' ', t2).strip()
    sents = re.findall(r'[^.!?]+[.!?]?', t)
    keep = [x.strip() for x in sents if x.strip() and not x.strip().endswith('?') and 'PRESS ' not in x.upper()]
    if len(keep) != len(sents):
        stripped = True
    t = ' '.join(keep)
    if t[-1:] in ',;:':
        t = t[:-1] + '.'                      # 'X SCREAMS, <speech>' -> 'X SCREAMS.'
    if len(t) > limit:
        cut = t[:limit]
        end = max(cut.rfind('. '), cut.rfind('! '))
        t = cut[:end + 1] if end >= limit // 2 else cut[:cut.rfind(' ')].rstrip(' ,;:') + '...'
    if len(re.sub(r'[^A-Za-z]', '', t)) < 12:
        return None, stripped
    return t, stripped


def game_text_for(g, scene_dir=SCENE_TEXT_DIR):
    """ECL narration shown with a CoK/DoK scene picture (tools/imggen_scene_text.py), or None. Amiga renders are looked up by
    block id across every PIC/BIGPIC family (the ids are shared with the DOS files); when more than one family holds text for
    the id the match is AMBIGUOUS, flagged, and never used in a prompt."""
    if g['game'] not in ('cok', 'dok'):
        return None
    m = _ID_RX.search(os.path.basename(g['source']))
    if not m or not os.path.exists(os.path.join(scene_dir, g['game'] + '.json')):
        return None
    try:
        import imggen_scene_text as ST
        by = ST.lookup_by_id(g['game'], int(m.group(2)), out_dir=__import__('pathlib').Path(scene_dir))
    except Exception:
        return None
    fams = {f: [r for r in recs if r['text']] for f, recs in by.items()}
    fams = {f: r for f, r in fams.items() if r}
    if not fams:
        return None
    ambiguous = len(fams) > 1
    recs = [dict(r, family=f) for f, rs in fams.items() for r in rs]
    recs.sort(key=lambda r: (-KIND_RANK[r['kind']], -CONF_RANK[r['confidence']], -len(r['text'])))
    out, seen = [], set()
    for r in recs:
        if r['text'] in seen:
            continue
        seen.add(r['text'])
        out.append(dict(text=r['text'], kind=r['kind'], confidence=r['confidence'], family=r['family'],
                        ecl=f"{r['ecl_file']}#{r['ecl_block']}", family_resolution=r['family_resolution']))
        if len(out) == MAX_TEXT_RECORDS:
            break
    gt = dict(block_id=int(m.group(2)), families=sorted(fams), ambiguous=ambiguous, records=out)
    gt['context'] = default_context(g, gt)
    return gt


def make_context(r, why):
    t, stripped = context_text(r['kind'], r['text'])
    return dict(text=t, kind=r['kind'], confidence=r['confidence'], speech_removed=stripped, ecl=r['ecl'], chosen=why) if t else None


def default_context(g, gt):
    """Automatic rule. BIGPIC scenes: best usable record. Portraits (an NPC face shown while that NPC talks): narration records
    only, because the surrounding dialogue says little about what the picture shows. Ambiguous family matches: never."""
    if gt['ambiguous']:
        return None
    for r in gt['records']:
        if g['kind'] != 'scene' and r['kind'] != 'narration':
            continue
        c = make_context(r, 'auto')
        if c:
            return c
    return None


def apply_context_override(g, d):
    """Hand-curated override from tools/imggen_batch02_descriptions.json (`game_context`): false = suppress, an int = use
    that record (dialogue-mixed speech is still stripped). Written after comparing each text with the picture."""
    gt = g.get('game_text')
    if not gt or 'game_context' not in d:
        return
    ov = d['game_context']
    if ov is False:
        gt['context'] = None
        gt['context_override'] = 'suppressed'
    elif isinstance(ov, int) and not isinstance(ov, bool) and 0 <= ov < len(gt['records']):
        gt['context'] = make_context(gt['records'][ov], 'curated')
        gt['context_override'] = f'record {ov}'


def animation_for(g, anim, renders=RENDERS):
    """Animation measurement of a candidate (tools/imggen_animation.py) plus cheap preview frames when the Amiga CoK/DoK frame
    PNGs exist (those renders are full composited frames; Pool f1+ are raw XOR deltas and DQK img00N>1 are patches, so no preview)."""
    a = anim.get(g['id'])
    if a is None:
        return None
    rec = dict(frames=a.get('frames'), changed_fraction=a.get('changed_fraction'), bbox=a.get('bbox'), kind=a.get('kind'),
               dos_twin=a.get('dos_twin'))
    for k in ('bbox_fraction', 'source_frame_role', 'note'):
        if a.get(k) is not None:
            rec[k] = a[k]
    n = a.get('frames') or 1
    rel = g['source']
    if g['game'] in ('cok', 'dok') and g['platform'] == 'amiga' and n > 1 and re.search(r'_f0\.png$', rel):
        fr = [rel[:-len('_f0.png')] + f'_f{k}.png' for k in range(min(n, MAX_PREVIEW_FRAMES))]
        if all(os.path.exists(os.path.join(os.path.dirname(renders), f)) for f in fr):
            rec['preview_frames'] = fr
    return rec


def annotate_game_text_and_animation(groups, anim_json=ANIM_JSON, scene_dir=SCENE_TEXT_DIR, renders=RENDERS):
    anim = json.load(open(anim_json, encoding='utf-8')) if os.path.exists(anim_json) else {}
    n_t = n_a = 0
    for g in groups:
        a = animation_for(g, anim, renders)
        if a:
            g['animation'] = a
            n_a += 1
    for g in groups:
        t = game_text_for(g, scene_dir)
        if t:
            g['game_text'] = t
            n_t += 1
    return n_t, n_a


# ------------------------------------------------------------------ batch02 proposal
QUOTA = {'cok': 11, 'dok': 11, 'dqk': 16, 'gateway': 6, 'pool': 6}
KIND_CAP = {'logo': 3, 'title': 4, 'map': 2}   # per game: keep the proposal picture-heavy
KIND_MIN = {'logo': 2}                           # per game, if it has any clean ones: reserve slots


def load_descriptions():
    if os.path.exists(DESC_FILE):
        return json.load(open(DESC_FILE, encoding='utf-8'))
    return {'families': {}, 'items': {}}


def propose(groups, quota=None, kind_cap=None, desc=None):
    quota = quota or QUOTA
    kind_cap = kind_cap or KIND_CAP
    desc = desc or {'items': {}}
    # A title-sequence member is eligible despite a wrap/clip warning: the sequence must be complete, and the warning on the
    # Amiga ILBM band text1 reproduces in the independent DOS decode (authentic clipped lettering, not a decode wrap).
    eligible = [g for g in groups if 'excluded' not in g and not is_overlay_patch(g)
                and (g.get('sequence') or not any(w.startswith(('wrap', 'decode')) for w in g['warnings']))]
    chosen = []
    missing = []
    if desc.get('items'):
        # Curated mode: the hand-written description file (made by looking at the images) names the
        # picks; an id that is no longer an eligible group is reported, never silently dropped.
        by_id = {g['id']: g for g in eligible}
        for cid, d in desc['items'].items():
            g = by_id.get(cid)
            if g is None:
                missing.append(cid)
                continue
            adj = d.get('score_adjust', 0.0)
            if adj:
                g['score'] = round(g['score'] + adj, 2)
                g['score_reason'] += f' + curated {adj:+g}'
            chosen.append(g)
    else:
        for game, q in quota.items():
            pool = [g for g in eligible if g['game'] == game]
            picked = []
            for kind, mn in KIND_MIN.items():      # reserved slots first
                picked += [g for g in pool if g['kind'] == kind][:mn]
            for g in pool:
                if len(picked) >= q:
                    break
                if g in picked:
                    continue
                if g['kind'] in kind_cap and sum(1 for p in picked if p['kind'] == g['kind']) >= kind_cap[g['kind']]:
                    continue
                picked.append(g)
            chosen += picked[:q]
    propose.missing = missing
    chosen.sort(key=lambda g: (-g['score'], g['id']))
    ids = {}
    for rank, g in enumerate(chosen, 1):
        ids[g['id']] = rank
    for g in groups:
        g['proposed_batch02'] = g['id'] in ids
        if g['proposed_batch02']:
            g['rank'] = ids[g['id']]
            d = desc['items'].get(g['id'])
            if d:
                g['description'] = d.get('description', '')
                g['role'] = d.get('role', '')
                g['family'] = d.get('family', f"{g['game']}-{g['kind']}")
                if d.get('person'):
                    g['person'] = d['person']
                if d.get('prompt_notes'):
                    g['prompt_notes'] = d['prompt_notes']
                apply_context_override(g, d)
            else:
                g['description'] = ''
                g['family'] = f"{g['game']}-{g['kind']}"
    return groups


# ------------------------------------------------------------------ output
def summarize(groups, excluded):
    rows = {}
    for g in groups:
        k = (g['game'], g['kind'])
        r = rows.setdefault(k, dict(groups=0, proposed=0, alternates=0, excluded_done=0))
        if 'excluded' in g:
            r['excluded_done'] += 1
            continue
        r['groups'] += 1
        r['alternates'] += len(g['alternates'])
        r['proposed'] += 1 if g.get('proposed_batch02') else 0
    return rows


def write_outputs(groups, excluded, out_dir=OUT_DIR, desc=None, missing=()):
    os.makedirs(out_dir, exist_ok=True)
    desc = desc or load_descriptions()
    rows = summarize(groups, excluded)
    exc_by_reason = {}
    for e in excluded:
        reason = re.sub(r'\d+', 'N', e['excluded'])
        exc_by_reason.setdefault(reason, []).append(e['rel'])
    payload = dict(
        generated_by='tools/imggen_candidates.py',
        thresholds=dict(outlier_max_sim=OUTLIER_MAX_SIM, agree_min_sim=AGREE_MIN_SIM, min_area=MIN_AREA, min_side=MIN_SIDE, face_min=[FACE_MIN_W, FACE_MIN_H],
                        blank_dominant_max=BLANK_DOMINANT_MAX, min_colours=MIN_COLOURS,
                        min_edge_density=MIN_EDGE_DENSITY, dedupe_corr=DEDUPE_CORR, seam_ratio_warn=SEAM_RATIO_WARN),
        platform_order=PLATFORM_ORDER, families=desc.get('families', {}),
        counts={f'{g}/{k}': v for (g, k), v in sorted(rows.items())},
        candidates=groups,
        excluded=[dict(source=f"renders/{e['rel']}", game=e['game'], platform=e['platform'], kind=e['kind'],
                       native_size=list(e['native']), reason=e['excluded']) for e in excluded],
        unscanned=UNSCANNED, described_but_not_eligible=list(missing),
    )
    cj = os.path.join(out_dir, 'candidates.json')
    with open(cj, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=1, sort_keys=False)
    try:  # overlay/layer classification (tools/imggen_layers.py scan); absent on synthetic trees
        # Two passes: layers scan reads candidates.json (which ids are proposed / sequence members), so write it first,
        # let the scan emit the RGBA layer PNGs + layers.json, then annotate the groups and rewrite candidates.json.
        import imggen_layers
        if os.path.abspath(out_dir) == os.path.abspath(OUT_DIR):
            imggen_layers.scan(emit=True, cand_json=cj, out_dir=out_dir)
        imggen_layers.annotate(groups, os.path.join(out_dir, 'layers.json'))
    except Exception as e:
        print('note: layer classification skipped:', e)
    with open(cj, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=1, sort_keys=False)
    with open(os.path.join(out_dir, 'candidates.md'), 'w', encoding='utf-8') as f:
        f.write(render_md(groups, excluded, rows, exc_by_reason))
    return payload


def render_md(groups, excluded, rows, exc_by_reason):
    L = ['# Restyle candidates (generated by tools/imggen_candidates.py)', '']
    live = [g for g in groups if 'excluded' not in g]
    L.append(f'{len(live)} dedupe groups from {sum(1 + len(g["alternates"]) for g in live)} usable images; '
             f'{sum(1 for g in groups if g.get("proposed_batch02"))} proposed for batch02; '
             f'{len(excluded)} images excluded by rule; '
             f'{sum(1 for g in groups if "excluded" in g)} groups already done in batch01.')
    L += ['', '## Groups per game / kind', '', '| game | kind | groups | alternates folded | proposed batch02 | done in batch01 |',
          '| --- | --- | ---: | ---: | ---: | ---: |']
    for (game, kind), r in sorted(rows.items()):
        L.append(f'| {game} | {kind} | {r["groups"]} | {r["alternates"]} | {r["proposed"]} | {r["excluded_done"]} |')
    L += ['', '## Proposed batch02 (ranked)', '', '| rank | id | game | kind | platform | native | score | alternates | warnings |',
          '| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |']
    for g in sorted((g for g in groups if g.get('proposed_batch02')), key=lambda g: g['rank']):
        alts = ', '.join(f"{a['platform']}:{os.path.basename(a['source'])}" for a in g['alternates']) or '-'
        L.append(f"| {g['rank']} | {g['id']} | {g['game']} | {g['kind']} | {g['platform']} | "
                 f"{g['native_size'][0]}x{g['native_size'][1]} | {g['score']} | {alts} | {'; '.join(g['warnings']) or '-'} |")
    L += ['', '## Excluded by rule', '']
    for reason, files in sorted(exc_by_reason.items(), key=lambda kv: -len(kv[1])):
        L.append(f'- **{reason}**: {len(files)} image(s), e.g. `{files[0]}`')
    L += ['', '## Folders not scanned', '']
    for k, v in UNSCANNED.items():
        L.append(f'- `{k}`: {v}')
    L += ['', '## Thresholds', '',
          f'native area >= {MIN_AREA} and shorter side >= {MIN_SIDE} (faces: >= {FACE_MIN_W}x{FACE_MIN_H}); '
          f'dominant colour <= {BLANK_DOMINANT_MAX:.0%}; >= {MIN_COLOURS} colours; edge density >= {MIN_EDGE_DENSITY}; '
          f'same picture = identical native pixels or same aspect and luminance/edge correlation >= {DEDUPE_CORR}.', '']
    return '\n'.join(L)


# ------------------------------------------------------------------ site staging
def stage_site(site_dir, out_dir=OUT_DIR, renders=ROOT):
    cj = os.path.join(out_dir, 'candidates.json')
    data = json.load(open(cj, encoding='utf-8'))
    dst = os.path.join(site_dir, 'restyle', 'proposal')
    os.makedirs(dst, exist_ok=True)
    copied = []
    needed = []
    shown = [g for g in data['candidates'] if g.get('proposed_batch02') or g.get('sequence')]   # sequence steps incl. those done in batch01
    for g in shown:
        needed.append((g['id'], g['source']))
        for a in g['alternates']:
            needed.append((a['id'], a['source']))
        for t in g.get('dos_twins') or []:            # the DOS twin of an Amiga CoK/DoK picture, shown beside it
            if t.get('stage_id') and t.get('rel'):
                needed.append((t['stage_id'], t['rel']))
    for cid, src in needed:
        s = os.path.join(renders, src)
        if os.path.exists(s):
            shutil.copyfile(s, os.path.join(dst, cid + '.png'))
            copied.append(cid)
    for g in shown:  # original animation frames (tiny looping preview in the viewer): frames/<id>_f<k>.png
        for k, rel in enumerate((g.get('animation') or {}).get('preview_frames') or []):
            s = os.path.join(renders, rel)
            if os.path.exists(s):
                os.makedirs(os.path.join(dst, 'frames'), exist_ok=True)
                shutil.copyfile(s, os.path.join(dst, 'frames', f"{g['id']}_f{k}.png"))
    for g in shown:  # RGBA layer + parent previews of overlay items (proposed or sequence members)
        files = (g.get('layer') or {}).get('files')
        for rel in (files or {}).values():
            s = os.path.join(out_dir, rel)
            if os.path.exists(s):
                os.makedirs(os.path.join(dst, 'layers'), exist_ok=True)
                shutil.copyfile(s, os.path.join(dst, rel))
    shutil.copyfile(cj, os.path.join(dst, 'candidates.json'))
    return copied


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', nargs='?', default='scan', choices=['scan', 'stage-site'])
    ap.add_argument('dir', nargs='?')
    ap.add_argument('--stage-site', metavar='DIR')
    ap.add_argument('--out', default=OUT_DIR)
    a = ap.parse_args(argv)
    if a.stage_site or a.cmd == 'stage-site':
        d = a.stage_site or a.dir
        if not d:
            ap.error('stage-site needs a directory')
        n = stage_site(d, a.out)
        print(f'staged {len(n)} images + candidates.json into {os.path.join(d, "restyle", "proposal")}')
        return 0
    groups, excluded = scan()
    desc = load_descriptions()
    n_text, n_anim = annotate_game_text_and_animation(groups)
    propose(groups, desc=desc)
    missing = getattr(propose, 'missing', [])
    write_outputs(groups, excluded, a.out, desc, missing)
    if missing:
        print('WARNING: described ids that are not eligible groups: ' + ', '.join(missing))
    live = [g for g in groups if 'excluded' not in g]
    print(f'{len(live)} groups, {sum(1 for g in groups if g.get("proposed_batch02"))} proposed, '
          f'{len(excluded)} excluded; game text on {n_text}, animation on {n_anim} groups')
    return 0


if __name__ == '__main__':
    sys.exit(main())
