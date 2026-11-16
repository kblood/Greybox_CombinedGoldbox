"""
Amiga 24x24 *COM combat-backdrop strips (DUNGCOM / WILDCOM / RANDCOM) -- SOLVED 2026-08-22.

The DOS .DAX twin is the oracle: it ships the same sets as N * 288-byte chunky 4bpp items
after a 17-byte header. The Amiga art carries more colour than EGA can, so it refines the DOS
render rather than equalling it; the metric is 1 - H(DOS|Amiga)/H(DOS), which is 1.0 iff the
Amiga index map exactly determines the DOS one.

Every earlier attempt at this format reported a structural score with no null, or with a null
that beat the real data. So each test here pins the real number AND the null it has to clear.

Amiga sources live outside the repo and are never vendored; absent source => skip.
"""
import math
import os
import sys
from collections import Counter

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import daa_decode  # noqa: E402
import dax_decode  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CASES = [
    ("CoK DUNGCOM", "Champions of Krynn/DUNGCOM.DAX",
     "amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA", 25, 0.999),
    ("DoK DUNGCOM", "Death Knights of Krynn/DUNGCOM.DAX",
     "amiga_extracted/DeathKnightsOfKrynn/disk1/DUNGCOM.daa", 25, 0.999),
    ("CoK WILDCOM", "Champions of Krynn/WILDCOM.DAX",
     "amiga_extracted/ChampionsOfKrynn/disk1/WILDCOM.DAA", 35, 0.90),
    ("CoK RANDCOM", "Champions of Krynn/RANDCOM.DAX",
     "amiga_extracted/ChampionsOfKrynn/disk1/RANDCOM.DAA", 6, 0.85),
]


def _amiga_raw(rel):
    path = os.path.join(REPO, rel)
    if not os.path.exists(path):
        pytest.skip(f"absent (never-vendored Amiga source): {rel}")
    data = open(path, "rb").read()
    _kind, base, blocks = daa_decode.parse_container(data)
    return daa_decode.decompress_block(data, base, blocks[0])


def _dos_items(rel, count):
    path = os.path.join(REPO, rel)
    if not os.path.exists(path):
        pytest.skip(f"absent: {rel}")
    data = open(path, "rb").read()
    base, blocks = dax_decode.parse_container(data)
    raw = dax_decode.decompress_block(data, base, blocks[0])
    assert raw[8] == count, "DOS publishes the item count at the same header byte as Amiga"
    assert len(raw) == 17 + 288 * count
    out = []
    for k in range(count):
        it = raw[17 + 288 * k: 17 + 288 * (k + 1)]
        px = []
        for y in range(24):
            for xb in range(12):
                b = it[y * 12 + xb]
                px.append(b >> 4)
                px.append(b & 15)
        out.append(px)
    return out


def _refinement(dos_items, ami_items):
    """1 - H(DOS|Amiga)/H(DOS). 1.0 iff the Amiga index determines the DOS index."""
    hd, ha, hj = Counter(), Counter(), Counter()
    n = 0
    for d_it, a_it in zip(dos_items, ami_items):
        for d, a in zip(d_it, a_it):
            hd[d] += 1
            ha[a] += 1
            hj[(a, d)] += 1
            n += 1

    def H(counter):
        return -sum((c / n) * math.log(c / n) for c in counter.values())

    return 1 - (H(hj) - H(ha)) / H(hd)


def _ami_items(raw):
    parsed = daa_decode.parse_com_strip_header(raw)
    assert parsed is not None, "block must parse as a *COM strip"
    count, row_bytes, plane_size = parsed
    return count, [daa_decode.decode_com_item(raw, row_bytes, plane_size, t)
                   for t in range(count)]


@pytest.mark.parametrize("name,dax,daa,count,floor", CASES)
def test_com_strip_refines_the_dos_oracle(name, dax, daa, count, floor):
    raw = _amiga_raw(daa)
    n, items = _ami_items(raw)
    assert n == count
    flat = [[v for row in it for v in row] for it in items]
    assert all(len(f) == 576 for f in flat)

    dos = _dos_items(dax, count)
    real = _refinement(dos, flat)

    # NULL: same metric with the Amiga items rotated. A layout that merely produced
    # "image-shaped" output would score the same either way.
    worst_null = max(_refinement(dos, flat[s:] + flat[:s]) for s in (1, 2, 3))

    assert real >= floor, f"{name}: refinement {real:.4f} (null {worst_null:.4f})"
    assert real > worst_null + 0.25, f"{name}: real {real:.4f} vs null {worst_null:.4f}"


def test_trailer_is_exactly_two_bytes_in_every_shipped_com_block():
    """
    The whole solve turns on this: a *per-item* 360-byte stride leaves 122 bytes over for
    DUNGCOM/WILDCOM but 2 for RANDCOM. Under the strip rule every shipped block leaves the
    same 2 bytes -- one rule, one constant, N = 6/25/35/45 across two games.
    """
    blocks = [
        ("amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA", 25),
        ("amiga_extracted/ChampionsOfKrynn/disk1/WILDCOM.DAA", 35),
        ("amiga_extracted/ChampionsOfKrynn/disk1/RANDCOM.DAA", 6),
        ("amiga_extracted/DeathKnightsOfKrynn/disk1/WILDCOM.daa", 45),
    ]
    seen = 0
    per_item_residues = set()
    for rel, count in blocks:
        if not os.path.exists(os.path.join(REPO, rel)):
            continue
        raw = _amiga_raw(rel)
        assert raw[8] == count
        parsed = daa_decode.parse_com_strip_header(raw)
        assert parsed is not None, rel
        _c, row_bytes, plane_size = parsed
        body = len(raw) - daa_decode.FRAME_PIX_OFFSET
        assert body - 5 * plane_size == daa_decode.COM_TRAILER, rel
        # the discredited per-item rule, kept as the null
        per_item_residues.add(body - count * (24 * 3 * 5))
        seen += 1
    if seen == 0:
        pytest.skip("no never-vendored Amiga *COM sources present")
    assert seen >= 3
    # NULL: the rejected per-item reading is NOT constant across the same blocks.
    assert len(per_item_residues) > 1, per_item_residues


def test_parse_rejects_a_block_that_is_one_byte_short():
    """Positive control for the guard -- otherwise parse_com_strip_header is a rubber stamp."""
    count = 4
    row_bytes = ((count * 24 + 15) // 16) * 2
    good = bytearray(daa_decode.FRAME_PIX_OFFSET + 5 * row_bytes * 24 + 2)
    good[0:2] = (24).to_bytes(2, "big")
    good[2:4] = (3).to_bytes(2, "big")
    good[8] = count
    assert daa_decode.parse_com_strip_header(bytes(good)) == (count, row_bytes, row_bytes * 24)
    assert daa_decode.parse_com_strip_header(bytes(good[:-1])) is None


def test_dok_wildcom_is_the_dos_set_plus_seven_amiga_only_backdrops():
    """
    The one *COM block whose two platforms do NOT agree on the item count, and the reason it is
    absent from CASES above: DoK's DOS `WILDCOM.DAX` block 1 says 38, its Amiga twin says 45.

    Both framings are exact, so neither reading is a decode error -- `17 + 38 * 288 == 10961` is
    the whole decompressed DOS block, and the Amiga strip closes on the same 2-byte trailer as
    every other one. The releases ship different amounts of art.

    `docs/daa-format.md` §3a carried 45 in BOTH columns of this row until 2026-08-25, copied
    across from the Amiga side, which is exactly the error the table was built to prevent.
    """
    dax_rel = "Death Knights of Krynn/WILDCOM.DAX"
    daa_rel = "amiga_extracted/DeathKnightsOfKrynn/disk1/WILDCOM.daa"
    raw = _amiga_raw(daa_rel)
    n, items = _ami_items(raw)
    assert n == 45, "Amiga DoK WILDCOM declares 45 items"

    dos = _dos_items(dax_rel, 38)
    assert len(dos) == 38, "DOS DoK WILDCOM declares 38 -- the counts genuinely differ"

    flat = [[v for row in it for v in row] for it in items]

    # Which 38 the DOS release kept: score every alignment, take the best.
    scores = [(_refinement(dos, flat[k:k + 38]), k) for k in range(n - 38 + 1)]
    best, best_k = max(scores)
    runner_up = max(s for s, k in scores if k != best_k)
    assert best_k == 0, f"best alignment {best_k}, scores {[round(s, 3) for s, _ in scores]}"
    assert best >= 0.80, best
    # NULL: the seven wrong alignments are the null, and they behave like one. Without this the
    # claim "the extras are at the END" would rest on an unranked single number.
    assert runner_up <= 0.25, runner_up
    assert best > runner_up * 3, (best, runner_up)

    # The extras are art, not padding: none flat, none a duplicate of a shipped item, and they
    # carry MORE colour than the 38 that shipped rather than less.
    extras = flat[38:]
    shipped = [tuple(f) for f in flat[:38]]
    assert all(len(set(e)) > 1 for e in extras), "an extra is a flat fill"
    assert all(tuple(e) not in shipped for e in extras), "an extra duplicates a shipped item"
    mean_extra = sum(len(set(e)) for e in extras) / len(extras)
    mean_shipped = sum(len(set(f)) for f in flat[:38]) / 38
    assert mean_extra > mean_shipped, (mean_extra, mean_shipped)
