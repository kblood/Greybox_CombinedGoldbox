"""Tests for `c64_walldef_struct.py` -- the independent, DOS-format-blind structural attack on
C64 `WALLDEF`.

Two kinds of tests here, deliberately kept apart:

* **Synthetic/statistical-machinery tests** (`MatchFractionTests`, `NullConstructionTests`,
  `SyntheticStructureDetectionTests`) need no corpus at all -- they prove the STATISTICS
  themselves behave correctly (detect known-planted structure, do NOT false-positive on known
  pure-random data) using hand-built byte strings and a seeded PRNG. These never skip.
* **Real-corpus tests** (everything else) read the actual seven-title C64 disk set from
  `D:\\Games\\Emulator\\C64\\Goldbox` (the project's standing, never-vendored source location)
  and `skipTest` if that path is absent, per the project's standing convention for tests that
  need external, un-vendored source material.

Run: `python -m pytest tools/test_c64_walldef_struct.py -q`
"""
from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_walldef_struct as w  # noqa: E402

C64_ROOT = Path(r"D:\Games\Emulator\C64\Goldbox")

#: The per-title id counts this project's standing docs already established for the
#: WALLDEF/WALLSET pairing (`c64_wallset.py`'s own module docstring: "101 paired ids ... across
#: the seven titles (22 CoK, 18 CoAB, 15 Secret, 7 DoK, 14 Gateway, 18 Pool, 7 Buck Rogers)").
#: Reproduced here as a corpus-sanity check for THIS module's own `collect()`, independent of
#: whatever `c64_wallset.py` itself asserts.
EXPECTED_TITLE_COUNTS = {
    "Champions of Krynn": 22,
    "Curse of the Azure Bonds": 18,
    "Secret of the Silver Blades": 15,
    "Death Knights of Krynn": 7,
    "Gateway to the Savage Frontier": 14,
    "Pool of Radiance": 18,
    "Buck Rogers - Countdown to Doomsday": 7,
}


def _skip_if_no_corpus(test: unittest.TestCase) -> None:
    if not C64_ROOT.is_dir():
        test.skipTest(f"C64 source root not present: {C64_ROOT}")


# --------------------------------------------------------------------------------------------
# Synthetic tests: no corpus needed. These prove the MACHINERY works before trusting it on real
# data -- the same discipline `c64_wallset_render.RandomControlTests` uses.
# --------------------------------------------------------------------------------------------


class MatchFractionTests(unittest.TestCase):
    def test_match_fraction_on_hand_built_alternation(self) -> None:
        # A B A B A B ... -- perfect period-2 alternation: every same-parity pair matches,
        # every opposite-parity pair never matches.
        body = bytes([0x11, 0x22] * 50)
        self.assertEqual(w.match_fraction(body, 1), 0.0)
        self.assertEqual(w.match_fraction(body, 2), 1.0)
        self.assertEqual(w.match_fraction(body, 3), 0.0)
        self.assertEqual(w.match_fraction(body, 4), 1.0)

    def test_match_fraction_constant_body_is_always_one(self) -> None:
        body = bytes([0x42] * 30)
        for lag in (1, 2, 3, 7):
            self.assertEqual(w.match_fraction(body, lag), 1.0)

    def test_match_fraction_lag_zero_length_body_is_zero(self) -> None:
        self.assertEqual(w.match_fraction(b"", 1), 0.0)
        self.assertEqual(w.match_fraction(b"\x01\x02", 5), 0.0)

    def test_index_of_coincidence_matches_hand_count(self) -> None:
        # 3x 'A', 1x 'B': pairs matching = C(3,2) = 3, total pairs = C(4,2) = 6 -> 0.5
        body = bytes([1, 1, 1, 2])
        self.assertAlmostEqual(w.index_of_coincidence(body), 3 / 6)

    def test_index_of_coincidence_all_distinct_is_zero(self) -> None:
        body = bytes(range(20))
        self.assertEqual(w.index_of_coincidence(body), 0.0)


class NullConstructionTests(unittest.TestCase):
    """The two nulls must each preserve exactly what they claim to preserve and destroy exactly
    what they claim to destroy -- verified directly here, not just trusted from the docstring.
    """

    def test_record_order_shuffle_preserves_the_multiset(self) -> None:
        rng = random.Random(1)
        body = bytes(range(0, 250, 3))  # arbitrary, len not a multiple of 2
        shuffled = w.shuffle_record_order(body, 2, rng)
        self.assertEqual(sorted(shuffled), sorted(body))
        self.assertEqual(len(shuffled), len(body))

    def test_record_order_shuffle_preserves_intra_record_pairing(self) -> None:
        # Records are (i, 200+i) for i in 0..9 -- a record is identifiable by its second byte
        # being exactly 200 more than its first. Shuffling record ORDER must never break a
        # record's own two bytes apart from each other.
        rng = random.Random(2)
        body = bytes(x for i in range(10) for x in (i, 200 + i))
        shuffled = w.shuffle_record_order(body, 2, rng)
        pairs = [(shuffled[i], shuffled[i + 1]) for i in range(0, len(shuffled), 2)]
        for a, b in pairs:
            self.assertEqual(b, a + 200)
        # And the order actually changed (not a no-op shuffle) -- deterministic for this seed.
        self.assertNotEqual(shuffled, body)

    def test_within_column_shuffle_preserves_each_columns_multiset_but_not_pairing(self) -> None:
        rng = random.Random(3)
        body = bytes(x for i in range(10) for x in (i, 200 + i))
        shuffled = w.shuffle_within_column(body, 2, rng)
        col0 = shuffled[0::2]
        col1 = shuffled[1::2]
        self.assertEqual(sorted(col0), list(range(10)))
        self.assertEqual(sorted(col1), [200 + i for i in range(10)])
        # The record-level pairing (col1[i] == col0[i] + 200) must be broken by this null for at
        # least one row, for this seed -- otherwise the shuffle is a no-op and proves nothing.
        self.assertTrue(any(col1[i] != col0[i] + 200 for i in range(10)))


class SyntheticStructureDetectionTests(unittest.TestCase):
    """Prove `stride_gap` finds structure that is really there, and does NOT invent structure
    in pure noise -- the exact "does my statistic have the right null" discipline the task
    brief requires, demonstrated on data whose ground truth is known by construction.
    """

    def test_planted_stride_two_structure_is_detected_with_a_wide_margin(self) -> None:
        # Build 30 fake "WALLDEF" bodies, each a run of (fieldA, fieldB) 2-byte records where
        # fieldA is drawn from a SMALL alphabet (8 values) with a strong tendency to repeat
        # from one record to the next (simulating "this wall glyph continues along the row"),
        # and fieldB is drawn independently from a large alphabet (should almost never equal
        # fieldA). This is the exact shape claimed for the real corpus in finding 1.
        rng = random.Random(5)
        bodies = []
        for _ in range(30):
            recs = []
            a = rng.randrange(8)
            for _ in range(200):
                if rng.random() < 0.6:  # "continues" 60% of the time
                    a = rng.randrange(8)
                b = rng.randrange(100, 256)
                recs.append((a, b))
            bodies.append(bytes(x for pair in recs for x in pair))

        gap2 = w.stride_gap(bodies, 2, seed=w.NULL_SEED)
        gap1 = w.stride_gap(bodies, 1, seed=w.NULL_SEED)
        # lag2 (same-field, consecutive records): real must clear both nulls by a wide margin.
        self.assertGreater(gap2.real_mean, 3 * gap2.record_order_null_mean)
        self.assertGreater(gap2.real_mean, 3 * gap2.within_column_null_mean)
        # lag1 (fieldA vs fieldB, same record): near zero by construction (100 vs 0-7 never
        # collide), and NOT recovered by either null (both nulls preserve marginals only).
        self.assertLess(gap1.real_mean, 0.02)

    def test_pure_random_body_shows_no_real_vs_null_gap(self) -> None:
        # The negative control: bytes with NO planted structure at all. Real and both nulls
        # must land close together -- if this test needed a huge tolerance to pass, that would
        # itself be evidence the statistic is noisy/unreliable, not just that noise exists.
        rng = random.Random(6)
        bodies = [bytes(rng.randrange(256) for _ in range(1200)) for _ in range(20)]
        for lag in (1, 2, 4):
            gap = w.stride_gap(bodies, lag, seed=w.NULL_SEED)
            self.assertAlmostEqual(gap.real_mean, gap.record_order_null_mean, delta=0.01)
            self.assertAlmostEqual(gap.real_mean, gap.within_column_null_mean, delta=0.01)


# --------------------------------------------------------------------------------------------
# Real-corpus tests (skip if D:\ is absent)
# --------------------------------------------------------------------------------------------


class CorpusLoadTests(unittest.TestCase):
    def test_collect_reproduces_the_projects_own_established_per_title_id_counts(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        by_title: dict[str, int] = {}
        for r in records:
            by_title[r.title] = by_title.get(r.title, 0) + 1
        self.assertEqual(by_title, EXPECTED_TITLE_COUNTS)
        self.assertEqual(len(records), 101)


class NibbleCeilingTests(unittest.TestCase):
    """Finding 3: the 0xF0 ceiling is exceptionless in every checked (max==0xF0) body."""

    def test_no_violations_in_any_240_max_body(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        summary = w.nibble_ceiling_report(records)
        # 63/63 checked, 0 violations -- see the research doc for the exact per-title census.
        self.assertGreaterEqual(summary.checked, 60)
        self.assertEqual(summary.violations, 0)

    def test_reproduces_the_63_file_census(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        summary = w.nibble_ceiling_report(records)
        self.assertEqual(summary.checked, 63)


class TerminatorByteTests(unittest.TestCase):
    """Finding 4: last byte is always exactly 0x00 or 0xFF, split cleanly by title."""

    def test_terminator_alphabet_is_exactly_two_values(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        summary = w.terminal_byte_report(records)
        self.assertEqual(set(summary.by_value.keys()), {0x00, 0xFF})

    def test_pool_of_radiance_is_the_only_ff_terminated_title(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        summary = w.terminal_byte_report(records)
        ff_titles = {t for t, _ in summary.by_value[0xFF]}
        zero_titles = {t for t, _ in summary.by_value[0x00]}
        self.assertEqual(ff_titles, {w.FF_TERMINATED_TITLE})
        self.assertEqual(zero_titles, set(w.TITLES) - {w.FF_TERMINATED_TITLE})
        self.assertEqual(len(summary.by_value[0xFF]), 18)
        self.assertEqual(len(summary.by_value[0x00]), 83)


class PeriodTwoAlternationTests(unittest.TestCase):
    """Finding 1: the period-2 signal, per title, surviving both nulls. Every one of the seven
    titles is checked individually (not just pooled) -- rule 2 of the task brief.
    """

    def test_lag_two_clears_both_nulls_in_every_title(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        by_title: dict[str, list[bytes]] = {}
        for r in records:
            by_title.setdefault(r.title, []).append(r.body)
        self.assertEqual(len(by_title), 7)  # all seven titles present, not a subset
        for title, bodies in by_title.items():
            gap = w.stride_gap(bodies, 2)
            self.assertGreater(gap.real_mean, 2 * gap.record_order_null_mean, msg=title)
            self.assertGreater(gap.real_mean, 2 * gap.within_column_null_mean, msg=title)

    def test_lag_one_is_suppressed_in_six_of_seven_titles_pool_is_the_documented_exception(self) -> None:
        # Pool of Radiance's WALLDEF genuinely contains short runs of repeated adjacent bytes
        # (verified directly -- see the doc's dedicated section); the other six titles suppress
        # adjacent repeats far below chance. Both halves of this split are asserted explicitly,
        # not smoothed into a single pooled check, per rule 4 (state exactly what was found).
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        by_title: dict[str, list[bytes]] = {}
        for r in records:
            by_title.setdefault(r.title, []).append(r.body)
        for title, bodies in by_title.items():
            gap = w.stride_gap(bodies, 1)
            if title == w.FF_TERMINATED_TITLE:
                self.assertGreater(gap.real_mean, gap.record_order_null_mean, msg=title)
            else:
                self.assertLess(gap.real_mean, 0.3 * gap.record_order_null_mean, msg=title)

    def test_even_lag_exceeds_the_preceding_odd_lag_for_every_pair_from_one_to_sixteen(self) -> None:
        # The exact "8/8 exceptionless (odd, next-even) pairs" claim from the module docstring,
        # pooled corpus-wide (this specific comparison is not claimed per-title).
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        bodies = [r.body for r in records]
        sweep = w.lag_sweep(bodies, max_lag=16)
        pairs_checked = 0
        for odd_lag in range(1, 16, 2):
            even_lag = odd_lag + 1
            self.assertGreater(sweep[even_lag].real_mean, sweep[odd_lag].real_mean,
                                msg=f"lag {even_lag} vs lag {odd_lag}")
            pairs_checked += 1
        self.assertEqual(pairs_checked, 8)


class HonestNegativeTests(unittest.TestCase):
    """Finding 5: the two negatives that keep the positive findings from being overclaimed."""

    def test_sentinel_positions_are_not_parity_locked(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        even_total = odd_total = 0
        for r in records:
            if not r.body or max(r.body) != w.CEILING_SENTINEL:
                continue
            e, o = w.sentinel_parity_report(r.body)
            even_total += e
            odd_total += o
        total = even_total + odd_total
        self.assertGreater(total, 3000)  # sanity: real data, not an empty/near-empty set
        fraction_even = even_total / total
        # A real parity-locked sentinel would land near 0.0 or 1.0; this must NOT.
        self.assertGreater(fraction_even, 0.4)
        self.assertLess(fraction_even, 0.6)

    def test_no_single_column_reads_as_a_flat_glyph_index_at_stride_two_or_four(self) -> None:
        _skip_if_no_corpus(self)
        records = w.collect(C64_ROOT)
        for stride in (2, 4):
            report = w.column_in_range_report(records, stride)
            for title, means in report.items():
                if not means:
                    continue
                spread = max(means) - min(means)
                # No column stands out as "the" index field: all columns land within a narrow
                # band of each other, all near the chance floor for that title's glyph_count.
                self.assertLess(spread, 0.06, msg=f"{title} stride={stride} means={means}")


if __name__ == "__main__":
    unittest.main()
