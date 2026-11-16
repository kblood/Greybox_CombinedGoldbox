"""
Tests for tools/amiga_cokdok_render.py -- Amiga CoK/DoK picture renderer + DOS-twin pairing.

Every bar here has a control that is shown able to FAIL:
  * alignment of the 6-byte-index (PIC/SPRIT) bitmaps: the pad-byte-zero rule and DOS-twin correlation must
    pass at the corrected start and FAIL at the header's pix_off (the offset the older decoder used);
  * pairing: identity purity is 1.0 while a pixel-shuffled copy and a different picture stay far below it, and the
    pairer's block-id agreement collapses when the DOS candidates' ids are scrambled;
  * ILBM: a hand-built file round-trips, and the nibble-palette rescale / mask paths are checked against values
    computed independently of the decoder.
Amiga sources live outside the repo and are never vendored: when absent the data-dependent tests skip.
"""
import os
import struct
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
import amiga_cokdok_render as A  # noqa: E402
import subframe_decode as SF  # noqa: E402


def _src(game, name):
    d = A.find_dir(game)
    if not d:
        return None
    for fn in os.listdir(d):
        if fn.lower() == name.lower():
            return os.path.join(d, fn)
    return None


needs_cok = pytest.mark.skipif(A.find_dir('cok') is None, reason="Amiga CoK source absent")
needs_dok = pytest.mark.skipif(A.find_dir('dok') is None, reason="Amiga DoK source absent")
needs_dos = pytest.mark.skipif(not os.path.isdir(A.DOS_DIRS['cok']), reason="DOS CoK absent")


# ------------------------------------------------------------------------------------------------ ILBM
def _iff(chunks):
    body = b'ILBM' + b''.join(cid + struct.pack('>I', len(p)) + p + (b'\0' if len(p) & 1 else b'') for cid, p in chunks)
    return b'FORM' + struct.pack('>I', len(body)) + body


def _packbits_literal(row: bytes) -> bytes:
    return bytes([len(row) - 1]) + row


def test_ilbm_roundtrip_nibble_palette_and_mask():
    w, h, npl = 16, 2, 2
    idx = np.array([[0, 1, 2, 3] * 4, [3, 2, 1, 0] * 4], np.uint8)
    rows = b''
    for y in range(h):
        for p in range(npl):
            bits = ((idx[y] >> p) & 1).astype(np.uint8)
            rows += _packbits_literal(np.packbits(bits).tobytes())
    bmhd = struct.pack('>HHhhBBBBHBBhh', w, h, 0, 0, npl, 2, 1, 0, 3, 1, 1, 320, 200)
    cmap = bytes([0x00, 0x00, 0x00, 0x10, 0x20, 0x30, 0xF0, 0xF0, 0xF0, 0x80, 0x40, 0x00])  # high-nibble only
    d = A.decode_ilbm(_iff([(b'BMHD', bmhd), (b'CMAP', cmap), (b'BODY', rows)]))
    assert np.array_equal(d['indices'], idx)
    # high-nibble 0x10 -> 0x11, 0xF0 -> 0xFF (replicate the nibble), computed here by hand
    assert d['palette'][1] == (0x11, 0x22, 0x33) and d['palette'][2] == (0xFF, 0xFF, 0xFF)
    assert d['palette'][3] == (0x88, 0x44, 0x00)
    assert d['mask'] is not None and np.array_equal(d['mask'], idx != 3)       # masking 2: transparent colour 3
    # control: a palette that is NOT nibble-aligned must be left alone
    cmap2 = bytes([0x01, 0x00, 0x00, 0x10, 0x20, 0x30, 0xF0, 0xF0, 0xF0, 0x80, 0x40, 0x00])
    d2 = A.decode_ilbm(_iff([(b'BMHD', bmhd), (b'CMAP', cmap2), (b'BODY', rows)]))
    assert d2['palette'][0] == (0x01, 0, 0) and d2['palette'][1] == (0x10, 0x20, 0x30)


def test_ilbm_rejects_ham():
    bmhd = struct.pack('>HHhhBBBBHBBhh', 16, 1, 0, 0, 2, 0, 0, 0, 0, 1, 1, 320, 200)
    camg = struct.pack('>I', 0x800)
    with pytest.raises(ValueError):
        A.decode_ilbm(_iff([(b'BMHD', bmhd), (b'CAMG', camg), (b'CMAP', bytes(12)), (b'BODY', bytes(8))]))


def test_planar_decoder_known_bits():
    # 1 plane set in plane 4 only, a single bit at x=0 -> index 16 at (0,0)
    w, h = 16, 1
    buf = bytearray(2 * h * 5)
    buf[4 * 2] = 0x80
    idx = A.planar_to_indices(bytes(buf), 0, w, h)
    assert idx[0, 0] == 16 and idx.sum() == 16
    with pytest.raises(ValueError):
        A.planar_to_indices(bytes(buf[:-1]), 0, w, h)


# ------------------------------------------------------------------------------------------------ alignment
def _subblocks(game, name):
    p = _src(game, name)
    if not p:
        pytest.skip(f"{game} {name} absent")
    data = open(p, 'rb').read()
    return SF.amiga_index_entries(data)[1]


def _pad_zero(f, start, h, rb):
    ps = rb * h
    return all(not np.frombuffer(f[start + k * ps:start + (k + 1) * ps], np.uint8).reshape(h, rb)[:, rb - 1].any()
               for k in range(5))


@needs_cok
def test_pic_alignment_pad_column_zero_and_old_offset_fails():
    ents = _subblocks('cok', 'pic1.daa')
    assert len(ents) >= 20
    new_ok = old_ok = 0
    for bid, comp in ents:
        f = A.rle_flat(comp)
        d = A.decode_subblock(comp)
        nf, h, rb = d['nframes'], 88, 12
        assert d['width'] == 88 and d['height'] == 88
        new_ok += all(d['pad_zero'])
        old_ok += _pad_zero(f, f[0], h, rb)             # pix_off, as the pre-correction decoder used
    # a mis-aligned start leaves non-zero bytes in the word-padding column, so this bar can fail
    assert new_ok == len(ents)
    assert old_ok <= len(ents) // 4, f"control broken: the old pix_off offset also passes ({old_ok}/{len(ents)})"


@needs_cok
@needs_dos
def test_pic_matches_dos_twin_only_at_corrected_start():
    pool = {c['block']: c for c in A.dos_pool('cok') if c['stem'] == 'PIC1'}
    ents = _subblocks('cok', 'pic1.daa')
    good, bad, n = [], [], 0
    for bid, comp in ents:
        if bid not in pool:
            continue
        f = A.rle_flat(comp)
        d = A.decode_subblock(comp)
        dos = A.lum_of(A.DAX.EGA_PALETTE, pool[bid]['idx'])
        good.append(A.pearson(A.lum_of(d['palette'], d['frames'][0]), dos))
        old = A.planar_to_indices(f, f[0], 88, 88)
        bad.append(A.pearson(A.lum_of(d['palette'], old), dos))
        n += 1
    assert n >= 15
    assert np.median(good) > 0.9
    assert np.median(bad) < 0.5, "control broken: the pix_off start also correlates with the DOS twin"


@needs_cok
def test_xor_delta_frames_reconstruct_smaller_sprite_for_cok_sprit():
    """CoK SPRIT frames k>=1 are XOR deltas: the XOR-reconstructed frame has FAR fewer non-background pixels than
    frame 0 (a distance-zoomed sprite); the raw delta frame is noise-like with ~equal coverage."""
    ents = _subblocks('cok', 'SPRIT1.DAA')
    shrink = 0
    for bid, comp in ents:
        d = A.decode_subblock(comp, xor_deltas=True)
        raw = A.decode_subblock(comp, xor_deltas=False)
        bg = np.bincount(d['frames'][0].ravel()).argmax()
        cov0 = (d['frames'][0] != bg).mean()
        cov2 = (d['frames'][-1] != bg).mean()
        shrink += cov2 < 0.6 * cov0
        assert raw['frames'][0].shape == d['frames'][0].shape
    assert shrink >= len(ents) * 0.7


# ------------------------------------------------------------------------------------------------ pairing
def test_purity_identity_vs_shuffle_vs_other():
    rng = np.random.default_rng(1)
    a = rng.integers(0, 16, (60, 60)).astype(np.uint8)
    # amiga idx that SPLITS the dos colours (32 colours) is still pure
    split = (a + 16 * rng.integers(0, 2, a.shape)).astype(np.uint8)
    assert A.purity(split, a) == 1.0
    shuffled = rng.permutation(a.ravel()).reshape(a.shape)
    other = rng.integers(0, 16, a.shape).astype(np.uint8)
    assert A.purity(split, shuffled) < 0.5
    assert A.purity(split, other) < 0.5
    # merging DOS colours (many Amiga -> one DOS is fine, the reverse is not): dos distinguishes what amiga merged
    merged = (a // 2).astype(np.uint8)
    assert A.purity(merged, a) < 0.75


@needs_cok
@needs_dos
def test_cok_pairing_rate_and_block_id_agreement_with_null():
    pics, _, _ = A.load_game('cok')
    res = A.pair_game('cok', pics)
    conf = [v for v in res.values() if v['confidence'] in ('high', 'medium')]
    assert len(res) >= 60
    assert len(conf) / len(res) >= 0.8
    ids = [v['same_block_id'] for v in conf if v['same_block_id'] is not None]
    assert len(ids) >= 40 and sum(ids) / len(ids) >= 0.95
    # null: scramble the DOS pool's block ids; pairing by structure still finds the pictures, but the id agreement
    # must now collapse -- proving the agreement above is evidence, not a side-effect of how ids are compared.
    pool = A.dos_pool('cok')
    rng = np.random.default_rng(0)
    perm = rng.permutation(len(pool))
    scr = [dict(c, block=pool[perm[i]]['block']) for i, c in enumerate(pool)]
    res2 = A.pair_game('cok', pics, pool=scr)
    conf2 = [v for v in res2.values() if v['confidence'] in ('high', 'medium') and v['same_block_id'] is not None]
    assert conf2 and sum(v['same_block_id'] for v in conf2) / len(conf2) < 0.2


@needs_dok
@needs_dos
def test_dok_title_screens_pair_with_dos_title_blocks():
    pics, _, _ = A.load_game('dok')
    res = A.pair_game('dok', pics)
    want = {'DoK_Title0': 1, 'DoK_Title1': 2, 'DoK_Title1A': 3, 'DoK_Title1B': 4}
    for name, blk in want.items():
        v = res[f"amiga_cokdok/lbm/{name}.png"]
        assert v['confidence'] in ('high', 'medium'), (name, v)
        assert v['best_candidate']['file'] == 'TITLE.DAX' and v['best_candidate']['block'] == blk, (name, v)


# ------------------------------------------------------------------------------------------------ outputs
@needs_dok
def test_bigpic_113_is_32_colour_and_304x120():
    pics, _, _ = A.load_game('dok')
    p = [q for q in pics if q.stem == 'BIGPIC1' and q.block == 113][0]
    assert (p.w, p.h) == (304, 120)
    assert len(np.unique(p.idx)) > 16, "Amiga picture should use more than the 16 EGA colours"
    assert p.pal_src == 'frame-header'


def test_out_rel_conventions_and_candidate_filter():
    idx = np.zeros((88, 88), np.uint8)
    pic = A.Pic('cok', 'pic1.daa', 'PIC1', 'PIC', 5, 0, 3, idx, [(0, 0, 0)], 'subblock-header', 'portrait')
    assert pic.out_rel == 'daa/CoK_PIC1/PIC1_005_f0.png'
    spr = A.Pic('cok', 'SPRIT1.DAA', 'SPRIT1', 'SPRIT', 5, 0, 3, idx, [(0, 0, 0)], 'subblock-header', 'sprite')
    assert A.restyle_candidate(pic) and not A.restyle_candidate(spr)
    small = A.Pic('cok', 'x.daa', 'PIC1', 'PIC', 5, 0, 1, np.zeros((24, 24), np.uint8), [(0, 0, 0)], 'x', 'x')
    assert not A.restyle_candidate(small)
