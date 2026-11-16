#!/usr/bin/env python3
"""gateway_amiga_render.py - render the Amiga Gateway/Treasures-of-the-Savage-Frontier portrait
library (DiskB/Pic.tlb, 5-plane GLIB, 88x88) with each set's OWN colour table, and pair every
picture with its DOS twin(s) by pixel structure.

  python tools/gateway_amiga_render.py                       # Gateway, default WHDLoad + GOG paths
  python tools/gateway_amiga_render.py --amiga-pic <Pic.tlb> --dos-dir <dir with PIC*.DAX> --out renders/x

Findings this encodes (see the report of 2026-10-14):
  * Pic.tlb is a GLIB master whose set N holds ONE 88x88 5-plane image (img001) preceded by that
    set's 32-colour table. Nothing needs a fallback palette: every set ships its own, which is why
    these renders are correct where the DQK glib/PIC render (a 4-plane set borrowing the EGA
    stand-in) was garish.
  * Set N is block id N of the DOS PIC*.DAX family (ids are shared across PIC..PIC6; the id sits
    in whichever file holds it).
  * The pictures are the same on both platforms but the 5-bit INDEX NUMBERING differs, so the twin
    test is palette-invariant: "purity" = fraction of pixels explained when every DOS index maps to
    exactly one Amiga index. 1.0 = identical structure; unrelated pictures score ~0.2-0.55.

Nothing is copied into the repo except PNGs under renders/ (git-ignored) and a twins.json.
"""
from __future__ import annotations
import argparse, glob, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import glib_decode as G            # noqa: E402
import gateway_pic_decode as D     # noqa: E402

DEFAULT_AMIGA = ("D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/"
                 "GatewayToSavageFrontier/data/DiskB/Pic.tlb")
DEFAULT_DOS = "C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier"
DEFAULT_OUT = os.path.join(ROOT, 'renders', 'gateway-amiga')
SCALE = 4                      # same k x nearest-neighbour convention as renders/gateway-pic (88 -> 352)
TWIN_MIN_PURITY = 0.97         # frames of one DOS twin may differ by a few palette-boundary pixels
SIZE = (88, 88)


def load_amiga_pics(path):
    """{set_no: (indices (88,88) uint8, palette list of (r,g,b))} for every 88x88 image of a Pic.tlb."""
    out = {}
    for label, w, h, px, pal, dm in G.walk(open(path, 'rb').read()):
        if (w, h) != SIZE or not label.startswith('set'):
            continue
        n = int(label[3:label.index('_')])
        if n in out:           # first image of a set only (img001)
            continue
        out[n] = (np.array(px, dtype=np.uint8).reshape(h, w), list(pal) if pal else None)
    return out


def dos_rel(fname, block_id):
    """renders/gateway-pic relative path of a DOS PIC block, e.g. ('PIC2.DAX', 5) -> gateway-pic/PIC2/pic2_005.png."""
    stem = os.path.splitext(os.path.basename(fname))[0]
    return f"gateway-pic/{stem}/{stem.lower()}_{block_id:03d}.png"


def load_dos_pics(dos_dir):
    """{(file, block_id): [frame index arrays]} for every 88x88 PIC*.DAX block (all frames kept)."""
    out = {}
    for f in sorted(glob.glob(os.path.join(dos_dir, 'PIC*.DAX'))):
        data = open(f, 'rb').read()
        base, blocks = D.parse_container(data)
        for b in blocks:
            d = D.decode_block(D.decompress_block(data, base, b))
            if d and (d['width'], d['height']) == SIZE:
                out[(os.path.basename(f), b.block_id)] = [np.array(fr, dtype=np.uint8).reshape(SIZE[1], SIZE[0])
                                                          for fr in d['frames']]
    return out


def purity(a, b):
    """Palette-invariant structural agreement of two index images: map each value of b to its most
    common value in a; return the fraction of pixels that mapping reproduces (1.0 = same picture)."""
    total = 0
    for v in np.unique(b):
        total += np.bincount(a[b == v], minlength=256).max()
    return total / a.size


def best_purity(amiga_idx, dos_frames):
    return max(purity(amiga_idx, f) for f in dos_frames)


def match_twins(amiga, dos, min_purity=TWIN_MIN_PURITY):
    """{set_no: dict(twins=[(file, id, purity)...], best=(file,id,purity), runner_up=purity)}.
    A twin must reach min_purity; the runner-up is the best non-twin purity (the null: how well an
    UNRELATED picture scores), recorded so the margin is visible."""
    res = {}
    for n, (idx, _pal) in amiga.items():
        scored = sorted(((best_purity(idx, fr), k) for k, fr in dos.items()), reverse=True)
        twins = [(k[0], k[1], round(float(p), 4)) for p, k in scored if p >= min_purity]
        rest = [p for p, k in scored if p < min_purity]
        res[n] = dict(twins=twins, best=(scored[0][1][0], scored[0][1][1], round(float(scored[0][0]), 4)) if scored else None,
                      runner_up=round(float(rest[0]), 4) if rest else None)
    return res


def render_png(idx, pal, path, scale=SCALE):
    rgb = G.indices_to_rgb(idx.reshape(-1).tolist(), idx.shape[1], idx.shape[0], pal)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    G.write_png(__import__('pathlib').Path(path), idx.shape[1], idx.shape[0], rgb, scale=scale)


def run(amiga_path=DEFAULT_AMIGA, dos_dir=DEFAULT_DOS, out=DEFAULT_OUT, scale=SCALE):
    amiga = load_amiga_pics(amiga_path)
    dos = load_dos_pics(dos_dir) if dos_dir and os.path.isdir(dos_dir) else {}
    twins = match_twins(amiga, dos) if dos else {n: dict(twins=[], best=None, runner_up=None) for n in amiga}
    manifest = {}
    for n, (idx, pal) in sorted(amiga.items()):
        rel = f"{os.path.basename(os.path.normpath(out))}/PIC/amiga_pic_{n:02d}.png"
        render_png(idx, pal, os.path.join(out, 'PIC', f'amiga_pic_{n:02d}.png'), scale)
        t = twins[n]
        manifest[rel] = dict(set=n, palette_entries=len(pal) if pal else 0,
                             dos_twins=[dict(file=f, block=b, purity=p, render=dos_rel(f, b)) for f, b, p in t['twins']],
                             best_dos=t['best'], runner_up_purity=t['runner_up'])
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'twins.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=1)
    return manifest


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument('--amiga-pic', default=DEFAULT_AMIGA)
    ap.add_argument('--dos-dir', default=DEFAULT_DOS)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--scale', type=int, default=SCALE)
    a = ap.parse_args(argv)
    m = run(a.amiga_pic, a.dos_dir, a.out, a.scale)
    paired = sum(1 for v in m.values() if v['dos_twins'])
    print(f"{len(m)} Amiga pictures rendered to {a.out}; {paired} paired with a DOS twin, {len(m) - paired} unpaired")
    for rel, v in m.items():
        if not v['dos_twins']:
            print(f"  unpaired {rel}: best DOS {v['best_dos']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
