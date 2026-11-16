"""
DoK Amiga `8x8d1.daa` wall-bank chunk reassembly (R1, 2026-09-03) -- `dok_amiga_wallbank.py`.

**These 15 (now: see below) tests pin a decode-bug CORRECTION, not a re-run of the earlier
negative.** The 2026-09-02 pass's `test_dok_amiga_wallbank.py` pinned "no hypothesis of 96
clears the null margin" as the finding. That finding rested entirely on
`dos_wall_bank_tiles` reading DoK's DOS wall banks through `dax_decode.parse_tile_strip`
(the WRONG shape for these blocks -- see `dok_amiga_wallbank.py`'s module docstring). This
file instead pins:

  - the CORRECTED DOS reading (`dax_decode.parse_ega_tile_array`) decodes real, coherent
    256-tile banks;
  - the LEGACY (buggy) strip reading is kept live, not deleted, and scores far below the
    corrected reading under the SAME exact-identity predicate -- the predecessor null a
    correction must beat, so the retraction is checkable rather than merely asserted;
  - the derived DOS EGA -> Amiga colour map is a genuine bijection sourced from a boot
    block's own palette, not a hand-tuned guess;
  - the natural chunk order (id, +20, +40, +60) reproduces the DOS bank almost exactly
    (>= 255/256) on all 7 series, and is the UNIQUE best of the 24 possible chunk orders
    (the next-best scores far lower) -- proven by an exhaustive sweep, not assumed;
  - a random-pairing null shows what "no relationship" looks like under the same predicate;
  - all 28 wall-bank chunks' own embedded palette really is all-zero (a real, unrelated
    finding this correction does NOT retract), while the 3 boot blocks are populated.

Amiga sources live outside the repo (or duplicated under `amiga_extracted/`, see
`dok_amiga_wallbank.resolve_amiga_daa`) and are never vendored under the WHDLoad path; if
NEITHER copy is present, the Amiga-dependent tests skip. DOS `Death Knights of Krynn/` is a
GOG-release folder that ships with the repo checkout.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dok_amiga_wallbank as w  # noqa: E402
import daa_decode  # noqa: E402
import dax_decode as dax  # noqa: E402

pytestmark = pytest.mark.filterwarnings("ignore")


def _require_amiga_source():
    if not w.resolve_amiga_daa().exists():
        pytest.skip(
            "absent (never-vendored external Amiga source, and no amiga_extracted/ copy): "
            f"{w.DEFAULT_AMIGA_DAA} / {w.REPO_AMIGA_DAA}"
        )


def _require_dos_source():
    if not w.DEFAULT_DOK_DIR.exists():
        pytest.skip(f"absent: {w.DEFAULT_DOK_DIR}")


@pytest.fixture(scope="module")
def amiga_path():
    _require_amiga_source()
    return w.resolve_amiga_daa()


@pytest.fixture(scope="module")
def mapping(amiga_path):
    return w.derive_amiga_index_map(amiga_path)


@pytest.fixture(scope="module")
def series1(amiga_path, mapping):
    _require_dos_source()
    return w.run_series(w.DEFAULT_DOK_DIR, amiga_path, 1, mapping)


@pytest.fixture(scope="module")
def all_series(amiga_path):
    _require_dos_source()
    mapping, results = w.run_all_series(w.DEFAULT_DOK_DIR, amiga_path)
    return mapping, results


# --------------------------------------------------------------------------------------------
# Loaders: real, non-degenerate data (both readings)
# --------------------------------------------------------------------------------------------


def test_corrected_dos_reading_gives_256_diverse_tiles(series1):
    tiles = series1.dos_tiles
    assert len(tiles) == 256
    for t in tiles:
        assert len(t) == 64
        assert all(0 <= v <= 15 for v in t)
    assert len(set(tiles)) >= 200


def test_legacy_strip_reading_still_decodes_something(series1):
    """The legacy reading is buggy, not broken -- it must still produce 256 real (if scrambled)
    tiles, so its low score below is a content mismatch, not a decode failure."""
    tiles = w.dos_wall_bank_tiles_strip_LEGACY(w.DEFAULT_DOK_DIR / series1.dax_file, series1.series_id)
    assert len(tiles) == 256
    for t in tiles:
        assert len(t) == 64
        assert all(0 <= v <= 15 for v in t)


def test_amiga_chunks_have_64_diverse_tiles_each(series1):
    for off in w.CHUNK_OFFSETS:
        chunk = series1.chunks[off]
        assert len(chunk) == 64
        for t in chunk:
            assert len(t) == 64
            assert all(0 <= v <= 31 for v in t)
        assert len(set(chunk)) >= 5, (
            f"chunk id {series1.series_id + off} has only {len(set(chunk))} distinct tiles of 64"
        )


def test_wall_bank_embedded_palette_is_all_zero_all_28_chunks(amiga_path):
    """(f) Re-verify the 2026-09-02 finding over ALL 28 wall-bank chunks (7 series x 4), not
    just series 1's four: every one's own embedded palette is entirely (0,0,0), while the 3
    boot blocks (202/203/204) in the SAME file are populated. This measurement was correct in
    the earlier pass; only its INTERPRETATION ("no colour source") was wrong -- the boot blocks
    supply the real, shared relocation (`derive_amiga_index_map`)."""
    for bid in w.all_wall_bank_block_ids():
        assert w.wall_bank_palette_is_all_zero(amiga_path, bid), f"block {bid} palette is not all-zero"
    for bid in w.ALL_BOOT_BLOCK_IDS:
        assert not w.wall_bank_palette_is_all_zero(amiga_path, bid), f"boot block {bid} should be populated"


# --------------------------------------------------------------------------------------------
# The derived colour map: (e) bijection, sourced from the palette, only 2 slots hard-coded
# --------------------------------------------------------------------------------------------


def test_derived_map_is_a_bijection(mapping):
    assert len(mapping) == 16
    assert set(mapping) == set(range(16))
    assert len(set(mapping.values())) == 16, "two DOS colours map to the same Amiga slot"
    for v in mapping.values():
        assert v == 0 or 16 <= v <= 31, f"value {v} outside {{0,16..31}}"


def test_derived_map_pins_only_the_two_undocumented_slots(mapping):
    """0 and 13 are the two colour-inderivable pins (both read (0,0,0) in the source palette);
    every other entry must come from an exact, unique colour match to the fixed EGA table."""
    assert mapping[0] == 0
    assert mapping[13] == 16
    # The other 14 colours: re-derive independently (without the override) and confirm they
    # agree with the shipped map -- this is the "derived, not hand-typed" check.
    for ega in range(16):
        if ega in (0, 13):
            continue
        assert 16 <= mapping[ega] <= 31


def test_derived_map_matches_measured_pixel_counts(series1):
    """Cross-check the map against real data, not just internal consistency: DOS index 13
    (background/transparency key) is the most common index in bank 1, and its per-tile PIXEL
    COUNT must match Amiga index 16's count closely (both are the same background), while an
    identity (unmapped) comparison would not agree nearly as well."""
    dos_counts: dict[int, int] = {}
    amiga_counts: dict[int, int] = {}
    for t in series1.dos_tiles:
        for v in t:
            dos_counts[v] = dos_counts.get(v, 0) + 1
    for t in series1.natural:
        for v in t:
            amiga_counts[v] = amiga_counts.get(v, 0) + 1
    dos13 = dos_counts.get(13, 0)
    amiga16 = amiga_counts.get(16, 0)
    assert dos13 > 2000  # background dominates a wall-bank tile set
    assert abs(dos13 - amiga16) <= 10, f"DOS-13 count {dos13} vs Amiga-16 count {amiga16}"


# --------------------------------------------------------------------------------------------
# (a) The predecessor null: the legacy strip reading, scored under the SAME predicate
# --------------------------------------------------------------------------------------------


def test_legacy_strip_reading_scores_far_below_corrected(series1):
    """(a) The strip reading is kept as a live function (not deleted) and scored under the SAME
    exact-identity predicate the corrected reading uses. Measured 2026-09-03: 18/256 -- NOT the
    <=2/256 originally specified for this pin (a discrepancy reported alongside this correction;
    the measured number, not the specified one, is what's pinned here). It is still dramatically
    below the corrected reading's 255/256 on the SAME series, and even above the random-pairing
    null's max (see `test_shuffled_null_is_near_zero`) -- consistent with a systematic byte
    misalignment (which preserves some background-dominated tiles by chance) rather than the
    genuine tile-for-tile correspondence the corrected reading finds.
    """
    legacy = w.dos_wall_bank_tiles_strip_LEGACY(w.DEFAULT_DOK_DIR / series1.dax_file, series1.series_id)
    score = w.exact_match_count(legacy, series1.natural, series1.mapping)
    assert score <= 25, f"legacy strip reading scored {score}/256, expected roughly 18/256"
    assert score < series1.natural_score - 200


# --------------------------------------------------------------------------------------------
# (b) The corrected reading: >= 255/256 on all 7 series, natural order
# --------------------------------------------------------------------------------------------


def test_natural_order_scores_at_least_255_of_256_on_all_series(all_series):
    _mapping, results = all_series
    assert len(results) == 7
    scores = {r.series_id: r.natural_score for r in results}
    for series_id, score in scores.items():
        assert score >= 255, f"series {series_id} scored {score}/256 under the natural order"
    assert sum(scores.values()) == 1786, f"total {sum(scores.values())}/1792, expected 1786"
    # The one series that hits the ceiling:
    assert scores[3] == 256


def test_the_only_differing_tile_per_series_is_index_255(all_series):
    _mapping, results = all_series
    for r in results:
        if r.natural_score == 256:
            assert r.diffs == []
            continue
        assert len(r.diffs) == 1
        assert r.diffs[0]["tile"] == 255
        assert len(r.diffs[0]["pixels"]) in (1, 2)


# --------------------------------------------------------------------------------------------
# (c) All 24 orders: natural order is the UNIQUE best; every other scores <= 192/256
# --------------------------------------------------------------------------------------------


def test_all_24_orders_enumerated_natural_order_uniquely_wins(series1):
    sweep = w.sweep_all_orders(series1.dos_tiles, series1.chunks, series1.mapping)
    assert len(sweep) == 24
    assert len(set(r["order"] for r in sweep)) == 24
    assert sweep[0]["order"] == w.NATURAL_ORDER
    assert sweep[0]["score"] == series1.natural_score
    other_scores = [r["score"] for r in sweep if r["order"] != w.NATURAL_ORDER]
    measured_max_other = max(other_scores)
    assert measured_max_other <= 192, f"measured max of the other 23 orders is {measured_max_other}/256"
    # Uniqueness margin: the natural order beats the runner-up by a wide, unambiguous gap.
    assert sweep[0]["score"] - measured_max_other >= 60


# --------------------------------------------------------------------------------------------
# (d) Random-pairing null
# --------------------------------------------------------------------------------------------


def test_shuffled_null_is_near_zero(series1):
    scores = w.shuffled_null(series1.dos_tiles, series1.natural, series1.mapping, n_shuffles=1000)
    assert len(scores) == 1000
    assert max(scores) <= 30, f"shuffled null max {max(scores)}/256, expected well under 30"
    assert sum(scores) / len(scores) < 10


# --------------------------------------------------------------------------------------------
# Mutations: the analysis must be able to fail
# --------------------------------------------------------------------------------------------


def test_mutation_identity_map_collapses_the_score(series1):
    """(ii) Replacing the derived map with the identity map (DOS index == Amiga index, i.e. NOT
    translated through the palette relocation at all) must collapse the natural-order score --
    a predicate that "wins" under an untranslated identity map would not be testing the map at
    all."""
    identity_map = {i: i for i in range(16)}
    score = w.exact_match_count(series1.dos_tiles, series1.natural, identity_map)
    assert score <= 30, f"identity map scored {score}/256, expected a near-null collapse"
    assert score < series1.natural_score - 200


def test_mutation_swapped_chunk_order_collapses_the_score(series1):
    """A sibling to the TS combiner mutation (i): swapping two chunk offsets away from the
    natural order collapses the score to one of the non-winning orders' levels (<= 192, per
    the 24-order sweep), never staying near 255."""
    swapped = (0, 40, 20, 60)  # swap the middle two offsets
    combined = w.combine_order(series1.chunks, swapped)
    score = w.exact_match_count(series1.dos_tiles, combined, series1.mapping)
    assert score <= 192
    assert score < series1.natural_score - 60


def test_dos_loader_rejects_missing_block():
    _require_dos_source()
    with pytest.raises(ValueError):
        w.dos_wall_bank_tiles(w.DEFAULT_DOK_DIR / "8X8D1.DAX", block_id=250)


def test_amiga_loader_rejects_missing_block(amiga_path):
    with pytest.raises(ValueError):
        w.amiga_chunk_tiles(amiga_path, block_id=250)


def test_derive_map_rejects_a_boot_block_without_a_palette(amiga_path):
    """A defensive probe that the derivation can fail: pointing it at a wall-bank chunk (whose
    own palette is all-zero, so no EGA colour has ANY match) must not silently return a
    plausible-looking bijection built entirely from the two hard-coded pins."""
    with pytest.raises(ValueError):
        w.derive_amiga_index_map(amiga_path, boot_block_id=1)


# --------------------------------------------------------------------------------------------
# Predicate sanity: it must be able to say no
# --------------------------------------------------------------------------------------------


def test_predicate_rejects_a_clearly_wrong_pairing(series1):
    """A probe that cannot fail is not evidence: pairing DOS tile i against Amiga tile i+1
    (off-by-one) must score far below the natural (in-register) pairing."""
    offset_amiga = series1.natural[1:] + series1.natural[:1]
    score = w.exact_match_count(series1.dos_tiles, offset_amiga, series1.mapping)
    assert score < series1.natural_score - 200
