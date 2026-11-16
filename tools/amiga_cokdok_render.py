#!/usr/bin/env python3
"""amiga_cokdok_render.py - render EVERY restyle-worthy Amiga Champions-of-Krynn / Death-Knights-of-Krynn
picture (32-colour, per-picture palettes) and pair each one with its DOS EGA-16 twin by pixel structure.

  python tools/amiga_cokdok_render.py inventory        # families, files, frame counts, sizes (no output)
  python tools/amiga_cokdok_render.py render           # PNGs -> renders/daa/<Game>_<FILE>/ + renders/amiga_cokdok/lbm/
  python tools/amiga_cokdok_render.py pair             # renders/amiga_cokdok/twins.json (+ compare/ contact sheets)
  python tools/amiga_cokdok_render.py all              # render + pair + manifest.json + README.md

Everything is decoded with the repo's verified decoders (tools/daa_decode.py for the 9-byte-TOC standard
frames, tools/subframe_decode.py for the 6-byte-index SPRIT*/PIC* sub-frames, DOS side via
tools/dax_decode.py) plus the one thing the repo lacked as a library: an IFF ILBM decoder that keeps the
palette indices (daa_decode.read_lbm returns RGB only and ignores the mask plane).

Source data is read-only and never vendored.  The WHDLoad unpacked packs are preferred (clean originals; the
repo's own amiga_extracted/ CoK disk 1 carries a cracked scrn1b.lbm), amiga_extracted/ is the fallback.

PALETTES (the honest part)
  * BIGPIC*/HEAD*/BODY*/CPIC*/BACK*  each 9-byte-TOC block carries its OWN 32 x 0x0RGB palette in its header.
  * PIC*/SPRIT*                       each 6-byte-index sub-block carries its own 32-entry palette (shared by
                                      that sub-block's frames).
  * .LBM                              the CMAP chunk.  Amiga 4-bit palettes are stored either replicated
                                      (0xAA) or as high-nibble only (0xA0); the latter is rescaled to 0xAA so
                                      white is 255 and not 240.  CRNG colour-cycling ranges are recorded in the
                                      manifest but a still PNG shows the base palette.
  Nothing here borrows a fallback palette, which is what made the DQK-Amiga glib/PIC render garish.

Scale: every PNG is an exact 4x nearest-neighbour upscale of the native picture (same convention as
renders/daa and renders/dax, so tools/imggen_candidates.py's detect_scale recovers the native size).
"""
from __future__ import annotations
import argparse
import json, glob, json, os, re, struct, sys
from dataclasses import dataclass, field
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import daa_decode as DAA          # noqa: E402
import subframe_decode as SF      # noqa: E402
import dax_decode as DAX          # noqa: E402

WHD = ("D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked")
SOURCE_DIRS = {
    'cok': [WHD + '/ChampionsOfKrynn/data', os.path.join(ROOT, 'amiga_extracted', 'ChampionsOfKrynn')],
    'dok': [WHD + '/DeathKnightsOfKrynn/data', os.path.join(ROOT, 'amiga_extracted', 'DeathKnightsOfKrynn')],
}
DOS_DIRS = {
    'cok': os.path.join(ROOT, 'Champions of Krynn'),
    'dok': os.path.join(ROOT, 'Death Knights of Krynn'),
}
GAME_TAG = {'cok': 'CoK', 'dok': 'DoK'}
SCALE = 4
MIN_W, MIN_H = 64, 40              # "restyle source" threshold on the NATIVE size
OUT_DAA = os.path.join(ROOT, 'renders', 'daa')
OUT_X = os.path.join(ROOT, 'renders', 'amiga_cokdok')

# DAA stems that are tiles / UI / palettes / sprites sheets, never restyle sources (listed in the inventory only).
NON_PICTURE = re.compile(r'^(8x8d\d*|border|dungcom|randcom|wildcom|sky|pointers|comspr|globals)$', re.I)


# ----------------------------------------------------------------------------------------- data model
@dataclass
class Pic:
    game: str                   # 'cok' | 'dok'
    file: str                   # source file name as found on disk
    stem: str                   # upper-case stem, e.g. 'BIGPIC1'
    family: str                 # BIGPIC | HEAD | BODY | PIC | SPRIT | BACK | CPIC | LBM
    block: int | None           # DAX/DAA block id (None for LBM)
    frame: int                  # frame number inside the block (0 for single-frame)
    nframes: int
    idx: np.ndarray             # (h, w) uint8 palette indices
    palette: list               # [(r,g,b)] 8-bit
    pal_src: str                # 'frame-header' | 'subblock-header' | 'CMAP'
    kind: str                   # scene | face | body | portrait | sprite | texture | title | screen | icon
    disk: str = ''
    extra: dict = field(default_factory=dict)

    @property
    def w(self): return self.idx.shape[1]
    @property
    def h(self): return self.idx.shape[0]

    def rgb(self) -> np.ndarray:
        pal = np.array(self.palette + [(0, 0, 0)] * (256 - len(self.palette)), dtype=np.uint8)
        return pal[self.idx]

    @property
    def name(self) -> str:
        if self.family == 'LBM':
            return f"{GAME_TAG[self.game]}_{os.path.splitext(self.file)[0]}"
        base = f"{self.stem}_{self.block:03d}"
        return base + (f"_f{self.frame}" if self.family in ('PIC', 'SPRIT') else '')

    @property
    def out_rel(self) -> str:
        """path relative to renders/ of the 4x PNG."""
        if self.family == 'LBM':
            return f"amiga_cokdok/lbm/{self.name}.png"
        return f"daa/{GAME_TAG[self.game]}_{self.stem}/{self.name}.png"


# ----------------------------------------------------------------------------------------- source lookup
def find_dir(game: str) -> str | None:
    for d in SOURCE_DIRS[game]:
        if os.path.isdir(d):
            return d
    return None


ALIASES: dict[str, list[str]] = {}


def source_files(game: str):
    """[(path, label)] for every .daa/.lbm of a game from the FIRST source root that exists (never mixes the
    clean WHDLoad copy with the cracked repo copy), de-duplicated by (lower-case name, content): the same
    file ships on several disks of the amiga_extracted/ layout."""
    for root in SOURCE_DIRS[game]:
        if not os.path.isdir(root):
            continue
        seen, out = {}, []
        paths = [p for p in glob.glob(os.path.join(root, '**', '*'), recursive=True) if os.path.isfile(p)]
        for p in sorted(paths, key=lambda q: (os.path.basename(q).lower(), q)):
            low = os.path.basename(p).lower()
            if not low.endswith(('.daa', '.lbm')):
                continue
            data = open(p, 'rb').read()
            rel = os.path.relpath(p, root).replace(os.sep, '/')
            # identical bytes under another name (HEAD1/HEAD2, BODY1/BODY2, charS on 3 disks) -> one render
            if data in seen:
                ALIASES.setdefault(seen[data], []).append(rel)
                continue
            seen[data] = rel
            out.append((p, rel))
        return out
    return []


# ----------------------------------------------------------------------------------------- planar decode
def planar_to_indices(buf: bytes, off: int, w: int, h: int, nplanes: int = 5) -> np.ndarray:
    """Contiguous (non-interleaved) bitplanes, word-aligned rows, MSB = leftmost -> (h, w) uint8."""
    row_bytes = ((w + 15) // 16) * 2
    need = row_bytes * h * nplanes
    if len(buf) - off < need:
        raise ValueError(f"short pixel data: have {len(buf) - off}, need {need}")
    arr = np.frombuffer(buf, np.uint8, count=need, offset=off).reshape(nplanes, h, row_bytes)
    bits = np.unpackbits(arr, axis=2)[:, :, :w]
    idx = np.zeros((h, w), np.uint8)
    for p in range(nplanes):
        idx |= (bits[p] << p).astype(np.uint8)
    return idx


def classify_block_family(stem: str) -> tuple[str, str]:
    s = stem.upper()
    for fam, kind in (('BIGPIC', 'scene'), ('HEAD', 'face'), ('BODY', 'body'), ('CPIC', 'icon'),
                      ('BACK', 'texture'), ('SPRIT', 'sprite'), ('PIC', 'portrait'), ('COMSPR', 'icon')):
        if re.match(rf'^{fam}\d*$', s):
            return fam, kind
    return 'OTHER', 'other'


def rle_flat(comp: bytes) -> bytes:
    """The Amiga sprite RLE (game hunk 88) run over the WHOLE stream: c<=0x7f literal c+1 bytes, 0x80 no-op,
    else repeat the next byte (256-c)+1 times."""
    out = bytearray()
    i, n = 0, len(comp)
    while i < n:
        c = comp[i]; i += 1
        if c <= 0x7f:
            out += comp[i:i + c + 1]; i += c + 1
        elif c == 0x80:
            continue
        else:
            if i >= n:
                break
            out += comp[i:i + 1] * ((0x100 - c) + 1); i += 1
    return bytes(out)


def decode_subblock(comp: bytes, xor_deltas: bool = False) -> dict:
    """Decode one 6-byte-index sub-block (PIC*/SPRIT*) -> dict(width,height,palette,frames,start,pad_zero).

    CORRECTED ALIGNMENT (found 2026-10-14; tools/subframe_decode.decode_amiga_subframe is off by this):
    the decompressed stream is  header (87 bytes CoK / 95 bytes DoK)  +  nframes x (frame_size + 1)  and the
    bitmap of frame k starts at  len(stream) - (nframes - k) * (frame_size + 1).  The header's pix_off byte
    (75 + 2*nframes) is NOT the bitmap offset: using it shifts every picture left by one 16-bit word
    (wrapping the first word of each row to the end, leaving an empty byte column) -- visible as a black
    stripe plus a wrapped sliver on the right of every 88x88 PIC/SPRIT render.  The bar the offset is judged
    against is two-fold and stated in the tests: (1) the right-hand pad byte of every plane row (word
    alignment of an 88 px row) is zero for every frame, and (2) luminance correlation with the DOS twin of
    the same block id is ~0.9+ against ~0.1-0.3 with the pix_off offset.

    xor_deltas: PIC frames k>=1 are XOR deltas against frame 0 (as the DOS PIC arrays are). The CoK SPRIT
    XOR view is an experimental rendering hypothesis: it makes some offline frames look more coherent,
    but the pinned CoK hunk42 load/select/masked-draw path does not establish native XOR reconstruction.
    Keep this view candidate-only until exact stored-segment accounting or an independent native pixel
    capture verifies it. DoK SPRIT frames remain independent zoom-frame data in this renderer."""
    f = rle_flat(comp)
    h = struct.unpack_from('>H', f, 1)[0]
    w8 = struct.unpack_from('>H', f, 3)[0]
    nf = f[10]
    w = w8 * 8
    rb = ((w + 15) // 16) * 2
    ps = rb * h
    fs = ps * 5
    start = len(f) - nf * (fs + 1)
    if nf < 1 or start < 75 + 2 * nf:
        raise ValueError(f"stream length {len(f)} inconsistent with {nf} frame(s) of {w}x{h}")
    pal = DAA.read_palette(f, 11)
    frames, pad = [], []
    for k in range(nf):
        o = start + k * (fs + 1)
        idx = planar_to_indices(f, o, w, h)
        pl = np.frombuffer(f, np.uint8, count=fs, offset=o).reshape(5, h, rb)
        pad.append(bool(rb * 8 == w or not pl[:, :, rb - 1].any()))
        frames.append(idx)
    if xor_deltas:
        frames = [frames[0]] + [frames[0] ^ fr for fr in frames[1:]]
    return dict(width=w, height=h, palette=pal, frames=frames, start=start, pad_zero=pad, nframes=nf)


def decode_daa(game: str, path: str, disk: str, include_small=False):
    """All pictures of one .DAA.  Returns (pics, notes)."""
    data = open(path, 'rb').read()
    stem = os.path.splitext(os.path.basename(path))[0].upper()
    fam, kind = classify_block_family(stem)
    pics, notes = [], []
    kind_c, base, items = DAA.parse_container(data)
    if kind_c == 'blocks':
        for blk in items:
            raw = DAA.decompress_block(data, base, blk)
            fr = DAA.parse_frame_header(raw)
            if not fr:
                notes.append(f"block {blk.block_id}: not a standard 5-plane frame (hdr {raw[:6].hex()})")
                continue
            w, h, pal, pix = fr
            idx = planar_to_indices(raw, pix, w, h)
            pics.append(Pic(game, os.path.basename(path), stem, fam, blk.block_id, 0, 1, idx, pal,
                            'frame-header', kind, disk))
    else:   # 6-byte sub-frame index
        _, ents = SF.amiga_index_entries(data)
        for bid, comp in ents:
            try:
                d = decode_subblock(comp, xor_deltas=(fam == 'PIC' or (fam == 'SPRIT' and game == 'cok')))
            except Exception as e:             # pragma: no cover - reported, not hidden
                notes.append(f"sub-block {bid}: decode failed ({e})")
                continue
            n = len(d['frames'])
            for fi, idx in enumerate(d['frames']):
                pics.append(Pic(game, os.path.basename(path), stem, fam, bid, fi, n, idx, d['palette'],
                                'subblock-header', kind, disk,
                                extra={'start': d['start'], 'pad_zero': d['pad_zero'][fi],
                                       'xor_delta': bool((fam == 'PIC' or (fam == 'SPRIT' and game == 'cok')) and fi > 0)}))
            bad = [k for k, ok in enumerate(d['pad_zero']) if not ok]
            if bad:
                notes.append(f"sub-block {bid}: pad-column check failed on frame(s) {bad}")
    return pics, notes


# ----------------------------------------------------------------------------------------- IFF ILBM
def _chunks(d: bytes):
    if d[:4] != b'FORM' or d[8:12] != b'ILBM':
        raise ValueError('not an IFF ILBM')
    off = 12
    while off + 8 <= len(d):
        cid = d[off:off + 4]
        csz = struct.unpack_from('>I', d, off + 4)[0]
        if csz > len(d) - off - 8:
            # trailing garbage after BODY (present in several shipped files): stop, do not trust the size
            yield cid, d[off + 8:], True
            return
        yield cid, d[off + 8: off + 8 + csz], False
        off += 8 + csz + (csz & 1)


def byterun1(src: bytes, n_out: int) -> bytes:
    out = bytearray()
    i = 0
    while i < len(src) and len(out) < n_out:
        c = src[i]; i += 1
        if c < 128:
            out += src[i:i + c + 1]; i += c + 1
        elif c > 128:
            out += src[i:i + 1] * (257 - c); i += 1
    return bytes(out[:n_out])


def decode_ilbm(data: bytes) -> dict:
    """-> dict(width, height, indices (h,w) uint8, palette, masking, transparent, mask (h,w) bool|None,
    camg, crng [(rate,flags,low,high)], chunk_ids, body_ok)."""
    bmhd = cmap = body = camg = None
    crng, ids = [], []
    for cid, payload, junk in _chunks(data):
        ids.append(cid.decode('latin1'))
        if cid == b'BMHD': bmhd = payload
        elif cid == b'CMAP': cmap = payload
        elif cid == b'BODY': body = payload
        elif cid == b'CAMG' and len(payload) >= 4: camg = struct.unpack_from('>I', payload, 0)[0]
        elif cid == b'CRNG' and len(payload) >= 8:
            _, rate, flags, low, high = struct.unpack_from('>HHHBB', payload, 0)
            crng.append(dict(rate=rate, active=bool(flags & 1), reverse=bool(flags & 2), low=low, high=high))
    w, h, _x, _y, npl, masking, comp, _pad, transp = struct.unpack_from('>HHhhBBBBH', bmhd, 0)
    if camg is not None and camg & (0x800 | 0x80):
        raise ValueError(f"HAM/EHB ILBM (CAMG {camg:#x}) not supported")
    row_bytes = ((w + 15) // 16) * 2
    nrows_planes = npl + (1 if masking == 1 else 0)
    need = row_bytes * nrows_planes * h
    raw = byterun1(body, need) if comp == 1 else body[:need]
    body_ok = len(raw) == need
    if not body_ok:
        raw = raw + bytes(need - len(raw))
    arr = np.frombuffer(raw, np.uint8).reshape(h, nrows_planes, row_bytes)
    bits = np.unpackbits(arr, axis=2)[:, :, :w]            # (h, planes, w)
    idx = np.zeros((h, w), np.uint8)
    for p in range(npl):
        idx |= (bits[:, p, :] << p).astype(np.uint8)
    mask = bits[:, npl, :].astype(bool) if masking == 1 else None
    if masking == 2 and transp < (1 << npl):
        mask = idx != transp
    pal = [tuple(cmap[i * 3:i * 3 + 3]) for i in range(len(cmap) // 3)]
    if pal and all(c % 16 == 0 for t in pal for c in t):          # 4-bit values stored in the high nibble
        pal = [tuple(c | (c >> 4) for c in t) for t in pal]
    return dict(width=w, height=h, indices=idx, palette=pal, masking=masking, transparent=transp,
                mask=mask, camg=camg, crng=crng, chunk_ids=ids, body_ok=body_ok, planes=npl, comp=comp)


def decode_lbm(game: str, path: str, disk: str):
    data = open(path, 'rb').read()
    d = decode_ilbm(data)
    fn = os.path.basename(path)
    stem = os.path.splitext(fn)[0].upper()
    kind = 'title' if stem.startswith('TITLE') or stem in ('SCRN1B', 'SCRN2') else 'screen'
    p = Pic(game, fn, stem, 'LBM', None, 0, 1, d['indices'], d['palette'], 'CMAP', kind, disk,
            extra={k: d[k] for k in ('masking', 'transparent', 'camg', 'crng', 'chunk_ids', 'body_ok', 'planes')})
    p.extra['has_mask'] = d['mask'] is not None
    p._mask = d['mask'] if d['mask'] is not None else None      # type: ignore[attr-defined]
    return [p], ([] if d['body_ok'] else ['BODY decoded short: rows zero-filled'])


# ----------------------------------------------------------------------------------------- inventory
def load_game(game: str, include_small=False):
    """-> (pics, inventory rows, notes)"""
    pics, inv, notes = [], [], []
    for path, rel in source_files(game):
        fn = os.path.basename(path)
        stem = os.path.splitext(fn)[0]
        if fn.lower().endswith('.lbm'):
            try:
                ps, nt = decode_lbm(game, path, rel)
            except Exception as e:
                inv.append(dict(game=game, file=rel, family='LBM', status=f'decode failed: {e}'))
                continue
            pics += ps; notes += [f"{rel}: {n}" for n in nt]
            inv.append(dict(game=game, file=rel, family='LBM', count=1, sizes=[f"{ps[0].w}x{ps[0].h}"],
                            palette='CMAP', status='ok'))
            continue
        if NON_PICTURE.match(stem):
            inv.append(dict(game=game, file=rel, family='non-picture', status='skipped (tiles/UI/palette/sprite sheet)'))
            continue
        try:
            ps, nt = decode_daa(game, path, rel)
        except Exception as e:
            inv.append(dict(game=game, file=rel, family='?', status=f'not a DAA container: {e}'))
            continue
        notes += [f"{rel}: {n}" for n in nt]
        sizes = sorted({f"{p.w}x{p.h}" for p in ps})
        inv.append(dict(game=game, file=rel, family=ps[0].family if ps else '?',
                        blocks=len({p.block for p in ps}), frames=len(ps), sizes=sizes,
                        palette=ps[0].pal_src if ps else '', status='ok'))
        pics += ps
    return pics, inv, notes


def restyle_candidate(p: Pic) -> bool:
    if p.family in ('CPIC', 'COMSPR', 'SPRIT', 'BACK'):          # icons / combat sprites / wall textures
        return False
    if p.family == 'LBM' and re.match(r'^(chars?|chart|gothic)$', os.path.splitext(p.file)[0], re.I):
        return False                                             # sprite sheets / font
    return p.w >= MIN_W and p.h >= MIN_H


# ----------------------------------------------------------------------------------------- output
def save_png(path: str, rgb: np.ndarray, scale: int = SCALE):
    from PIL import Image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray(rgb)
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(path)


def render_all(games=('cok', 'dok'), root=os.path.join(ROOT, 'renders')) -> list[dict]:
    manifest = []
    for g in games:
        pics, inv, notes = load_game(g)
        for p in pics:
            if not restyle_candidate(p):
                continue
            rel = p.out_rel
            rgb = p.rgb()
            save_png(os.path.join(root, rel), rgb)
            manifest.append(dict(path=f"renders/{rel}", game=g, file=p.file, family=p.family, stem=p.stem,
                                 block=p.block, frame=p.frame, nframes=p.nframes, native=[p.w, p.h],
                                 kind=p.kind, palette_source=p.pal_src,
                                 colours_used=int(len(np.unique(p.idx))), source_rel=p.disk,
                                 extra={k: v for k, v in p.extra.items() if k in ('masking', 'transparent', 'crng')}))
            m = getattr(p, '_mask', None)
            if m is not None and p.family == 'LBM':
                # keep the stencil next to the screen so layered bands can be recombined later
                rgba = np.dstack([rgb, (m * 255).astype(np.uint8)])
                from PIL import Image
                im = Image.fromarray(rgba).resize((p.w * SCALE, p.h * SCALE), Image.NEAREST)
                im.save(os.path.join(root, rel.replace('.png', '_rgba.png')))
                manifest[-1]['rgba'] = f"renders/{rel.replace('.png', '_rgba.png')}"
    return manifest


# ----------------------------------------------------------------------------------------- DOS twins
DOS_PREFIXES = ('BIGPIC', 'HEAD', 'BODY', 'CHEAD', 'CBODY', 'TITLE', 'PIC', 'SPRIT', 'BACK', 'CPIC')
DOS_DIRS_REL = {'cok': 'Champions of Krynn', 'dok': 'Death Knights of Krynn'}


def _nibbles(px: np.ndarray, h: int, w: int) -> np.ndarray:
    px = px.reshape(h, w // 2)
    return np.stack([px >> 4, px & 15], axis=2).reshape(h, w)


def dos_pool(game: str) -> list[dict]:
    """Every decodable DOS picture of a game as {file, block, idx(h,w) EGA index}. Standard single frames
    (17-byte header, 4bpp) and frame 0 of PIC/SPRIT-style anim arrays; palette is the fixed EGA-16."""
    out = []
    d = DOS_DIRS[game]
    for path in sorted(glob.glob(os.path.join(d, '*.DAX'))):
        stem = os.path.splitext(os.path.basename(path))[0].upper()
        if not re.match(r'^(' + '|'.join(DOS_PREFIXES) + r')\d*$', stem):
            continue
        data = open(path, 'rb').read()
        base, blocks = DAX.parse_container(data)
        for b in blocks:
            raw = DAX.decompress_block(data, base, b)
            std = DAX.parse_standard_frame(raw)
            if std:
                w, h, _, _ = std
                px = np.frombuffer(raw, np.uint8, count=w * h // 2, offset=17)
                out.append(dict(file=os.path.basename(path), stem=stem, block=b.block_id, idx=_nibbles(px, h, w)))
                continue
            try:
                r = SF.parse_anim_array(raw, True)
            except Exception:
                r = None
            if r and r[0]:
                fr = r[0][0]
                px = np.frombuffer(fr['pixels'], np.uint8)
                out.append(dict(file=os.path.basename(path), stem=stem, block=b.block_id,
                                idx=_nibbles(px, fr['height'], fr['width'])))
    return out


def lum_of(pal, idx):
    return np.array(pal, float)[idx] @ np.array([0.3, 0.59, 0.11])


def pearson(a, b) -> float:
    a = a - a.mean(); b = b - b.mean()
    d = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d > 1e-9 else 0.0


def purity(a_idx: np.ndarray, d_idx: np.ndarray) -> float:
    """Fraction of pixels whose DOS index is the modal DOS index of their Amiga index: 1.0 iff the Amiga index
    map determines the DOS one (palette-invariant; the Amiga may split a DOS colour, never merge it)."""
    tab = np.zeros((int(a_idx.max()) + 1, 16), np.int64)
    np.add.at(tab, (a_idx.ravel(), np.minimum(d_idx.ravel(), 15)), 1)
    return float(tab.max(axis=1).sum() / a_idx.size)


def _grid(img: np.ndarray, n=32) -> np.ndarray:
    h, w = img.shape
    ys = np.linspace(0, h, n + 1).astype(int); xs = np.linspace(0, w, n + 1).astype(int)
    return np.array([[img[ys[i]:max(ys[i + 1], ys[i] + 1), xs[j]:max(xs[j + 1], xs[j] + 1)].mean()
                      for j in range(n)] for i in range(n)])


def confidence(pur, margin, corr_):
    if pur >= 0.90 and margin >= 0.10:
        return 'high'
    if (pur >= 0.75 or corr_ >= 0.85) and margin >= 0.10:
        return 'medium'
    if corr_ >= 0.6:
        return 'low'
    return 'none'


def pair_game(game: str, pics: list[Pic], pool=None) -> dict:
    pool = pool if pool is not None else dos_pool(game)
    # identical DOS pictures shipped in several files (PIC1/PIC2/PIC3 ...) are ONE candidate with several homes
    uniq: dict = {}
    for c in pool:
        k = (c['idx'].shape, c['idx'].tobytes())
        uniq.setdefault(k, dict(c, homes=[]))['homes'].append((c['file'], c['block'], c['stem']))
    pool = list(uniq.values())
    by_size: dict = {}
    for c in pool:
        by_size.setdefault(c['idx'].shape, []).append(c)
    res = {}
    for p in pics:
        if not restyle_candidate(p) or p.family in ('SPRIT', 'BACK') or p.frame != 0:
            continue
        if p.family == 'LBM' and re.match(r'^(chars?|chart|gothic)$', os.path.splitext(p.file)[0], re.I):
            continue                      # sprite sheets / font: no DOS picture twin by design
        band = p.family == 'LBM' and p.h < 150
        cands = [] if band else by_size.get((p.h, p.w), [])
        mode = 'same-size'
        if not cands:
            cands = [c for c in pool if c['idx'].shape[1] == p.w and abs(c['idx'].shape[0] - p.h) <= 9]
            mode = 'aspect-grid'
        if not cands:
            cands = [c for c in pool if abs(c['idx'].shape[1] / c['idx'].shape[0] - p.w / p.h) < 0.05 * p.w / p.h]
            mode = 'aspect-grid'
        if not cands:
            res[p.out_rel] = dict(amiga=f"renders/{p.out_rel}", game=game, dos=None, confidence='none',
                                  how='no DOS picture of this size/aspect')
            continue
        al = lum_of(p.palette, p.idx)
        rows = []
        for c in cands:
            if mode == 'same-size':
                rows.append((purity(p.idx, c['idx']), pearson(al, lum_of(DAX.EGA_PALETTE, c['idx'])), c))
            else:
                rows.append((0.0, pearson(_grid(al), _grid(lum_of(DAX.EGA_PALETTE, c['idx']))), c))
        key = (lambda r: r[0] + 0.25 * r[1]) if mode == 'same-size' else (lambda r: r[1])
        scale = 1.25 if mode == 'same-size' else 1.0
        rows.sort(key=key, reverse=True)
        best = rows[0]
        run = rows[1] if len(rows) > 1 else None
        margin = (key(best) - key(run)) / scale if run else 1.0
        if mode == 'same-size':
            conf = confidence(best[0], margin, best[1])
        else:
            conf = 'medium' if best[1] >= 0.85 and margin >= 0.05 else 'low' if best[1] >= 0.6 else 'none'
        null = [(r[0] if mode == 'same-size' else r[1]) for r in rows[1:]]
        c = best[2]
        res[p.out_rel] = dict(
            amiga=f"renders/{p.out_rel}", amiga_file=p.file, amiga_block=p.block, game=game,
            dos=(f"{DOS_DIRS_REL[game]}/{c['homes'][0][0]}" if conf != 'none' else None),
            dos_block=c['homes'][0][1] if conf != 'none' else None,
            best_candidate=dict(file=c['homes'][0][0], block=c['homes'][0][1]),
            purity=round(best[0], 4), luminance_corr=round(best[1], 4),
            runner_up_score=round(key(run), 4) if run else None,
            null_median=round(float(np.median(null)), 4) if null else None, null_candidates=len(null),
            dos_twins=[dict(file=f, block=b) for f, b, _ in c['homes']],
            same_block_id=bool(any(b == p.block for _, b, _ in c['homes'])) if p.block is not None else None,
            confidence=conf,
            how=("palette-invariant purity (Amiga idx -> DOS EGA idx) + luminance Pearson over all same-size DOS pictures"
                 if mode == 'same-size' else "32x32 luminance-grid Pearson over DOS pictures of equal width (+-9 rows) or equal aspect (sizes differ)"))
    return res


def cmd_pair(args):
    allres, stats = {}, {}
    for g in ('cok', 'dok'):
        pics, _, _ = load_game(g)
        r = pair_game(g, pics)
        allres.update(r)
        by = {k: sum(1 for v in r.values() if v['confidence'] == k) for k in ('high', 'medium', 'low', 'none')}
        by_fam = {}
        for k, v in r.items():
            fam = 'LBM' if '/lbm/' in v['amiga'] else v['amiga'].split('/')[2].split('_')[-1].rstrip('0123456789')
            by_fam.setdefault(fam, {}).setdefault(v['confidence'], 0)
            by_fam[fam][v['confidence']] += 1
        idm = [v for v in r.values() if v.get('same_block_id') is not None and v['confidence'] in ('high', 'medium')]
        stats[g] = dict(amiga_images=len(r), by_confidence=by, by_family=by_fam,
                        same_block_id_among_confident=f"{sum(1 for v in idm if v['same_block_id'])}/{len(idm)}")
        print(g, json.dumps(stats[g]))
    os.makedirs(OUT_X, exist_ok=True)
    json.dump(allres, open(os.path.join(OUT_X, 'twins.json'), 'w'), indent=1)
    json.dump(stats, open(os.path.join(OUT_X, 'twins_stats.json'), 'w'), indent=1)
    print('wrote twins.json', len(allres))


# ----------------------------------------------------------------------------------------- CLI
def cmd_inventory(args):
    for g in ('cok', 'dok'):
        pics, inv, notes = load_game(g)
        print(f"== {GAME_TAG[g]}  source: {find_dir(g)}")
        for r in inv:
            print("  ", {k: v for k, v in r.items() if k != 'game'})
        for n in notes:
            print("   note:", n)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['inventory', 'render', 'pair', 'all'])
    args = ap.parse_args(argv)
    if args.cmd == 'inventory':
        cmd_inventory(args)
    elif args.cmd in ('render', 'all'):
        man = render_all()
        os.makedirs(OUT_X, exist_ok=True)
        json.dump(man, open(os.path.join(OUT_X, 'manifest.json'), 'w'), indent=1)
        print(f"rendered {len(man)} PNGs")
        if args.cmd == 'all':
            cmd_pair(args)
    elif args.cmd == 'pair':
        cmd_pair(args)


if __name__ == '__main__':
    main()
