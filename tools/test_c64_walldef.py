"""Tests for tools/c64_walldef.py.

Two layers, same discipline as test_c64_wallset.py / test_c64_disk.py:

  1. SYNTHETIC tests of the DOS-oracle decode and the byte-class analysis primitives --
     always run, need nothing external but the in-repo DOS `WALLDEF*.DAX` files.
  2. Real-corpus tests against the C64 Death Knights of Krynn / Champions of Krynn sides
     under D:/Games/Emulator/C64/Goldbox/. Skip when that source is absent.

Every test here backs a specific claim made in docs/engine/research/c64-walldef-format.md
(either a positive lead or a stated refutation) -- see that doc for the narrative.
"""
from __future__ import annotations

import unittest
from pathlib import Path

import c64_walldef as wd

REPO = Path(__file__).resolve().parents[1]
C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")

DOK_DOS = REPO / "Death Knights of Krynn"
DOK_DOS_FILES = ["WALLDEF1.DAX", "WALLDEF2.DAX", "WALLDEF3.DAX", "WALLDEF4.DAX", "WALLDEF5.DAX"]
DOK_C64 = C64_SETS / "Death Knights of Krynn"

COK_DOS = REPO / "Champions of Krynn"
COK_DOS_FILES = ["WALLDEF1.DAX", "WALLDEF2.DAX", "WALLDEF3.DAX"]
COK_C64 = C64_SETS / "Champions of Krynn"

# The seven real DoK C64 WALLDEF body lengths, quoted in the task brief and re-derived
# independently below from the real disk images (not hard-coded trust -- see
# DosOracleShapeTests and C64BodyLengthTests, which cross-check this literal against a live
# read).
DOK_C64_BODY_LENGTHS = {
    "01": 3301,
    "02": 3498,
    "03": 3058,
    "04": 2865,
    "05": 3826,
    "06": 3002,
    "07": 2959,
}


# ---------------------------------------------------------------------------------------
# Synthetic tests of the analysis primitives (no external corpus needed).
# ---------------------------------------------------------------------------------------


class BytevalueAnalysisPrimitiveTests(unittest.TestCase):
    """Direct unit tests of the pure functions, independent of any real WALLDEF bytes."""

    def test_void_range_stats_counts_correctly(self) -> None:
        data = bytes([0x00, 0x21, 0x3f, 0x40, 0xff, 0x30])
        hits, total, frac = wd.void_range_stats(data)
        # 0x21, 0x3f, 0x30 fall in [0x21, 0x3f] -> 3 hits out of 6 bytes.
        self.assertEqual(hits, 3)
        self.assertEqual(total, 6)
        self.assertAlmostEqual(frac, 0.5)

    def test_void_range_stats_empty_input(self) -> None:
        self.assertEqual(wd.void_range_stats(b""), (0, 0, 0.0))

    def test_byte_class_boundaries(self) -> None:
        self.assertEqual(wd.byte_class(0x00), "C")
        self.assertEqual(wd.byte_class(0x1f), "C")
        self.assertEqual(wd.byte_class(0x20), "X")
        self.assertEqual(wd.byte_class(0x3f), "X")
        self.assertEqual(wd.byte_class(0x40), "D")
        self.assertEqual(wd.byte_class(0xff), "D")

    def test_control_run_matches_a_clean_synthetic_stream(self) -> None:
        # control 0x01 -> run of 2 data bytes; control 0x00 -> run of 1.
        stream = bytes([0x01, 0x40, 0x41, 0x00, 0x42])
        matched, mismatched, first_bad = wd.control_run_test(stream)
        self.assertEqual((matched, mismatched, first_bad), (2, 0, None))

    def test_control_run_flags_a_short_run(self) -> None:
        # control byte 0x02 demands 3 data bytes but only 1 follows before EOF.
        stream = bytes([0x02, 0x40])
        matched, mismatched, first_bad = wd.control_run_test(stream)
        self.assertEqual(matched, 0)
        self.assertEqual(mismatched, 1)
        self.assertEqual(first_bad, 0)

    def test_gap_lengths_counts_runs_between_control_bytes(self) -> None:
        # C . . C . C  -> gaps of 2, 1, 0(leading before nothing) ... walk explicitly:
        stream = bytes([0x01, 0x40, 0x41, 0x02, 0x43, 0x03])
        # positions: 0x01(C) gap=0 emitted; then 0x40,0x41 (D,D) gap accumulates to 2;
        # 0x02(C) emits gap=2; then 0x43(D) gap=1; 0x03(C) emits gap=1.
        gaps = wd.gap_lengths(stream)
        self.assertEqual(gaps[0], 1)  # the very first control byte, gap=0
        self.assertEqual(gaps[2], 1)  # second control byte, preceded by 2 data bytes
        self.assertEqual(gaps[1], 1)  # third control byte, preceded by 1 data byte

    def test_parity_class_counts_on_a_deliberately_unbalanced_stream(self) -> None:
        # All class-C bytes at even offsets, all class-D bytes at odd offsets.
        stream = bytes([0x01, 0x40, 0x02, 0x41, 0x03, 0x42])
        counts = wd.parity_class_counts(stream)
        self.assertEqual(counts["even_C"], 3)
        self.assertEqual(counts["even_D"], 0)
        self.assertEqual(counts["odd_C"], 0)
        self.assertEqual(counts["odd_D"], 3)


# ---------------------------------------------------------------------------------------
# DOS oracle shape (always available -- the DOS release is checked into the repo).
# ---------------------------------------------------------------------------------------


class DosOracleShapeTests(unittest.TestCase):
    """Pins the exact DOS WALLDEF shape this whole slice's predictions are built on."""

    def test_dok_walldef_ids_are_exactly_one_through_seven(self) -> None:
        inv = wd.dos_walldef_inventory(DOK_DOS, DOK_DOS_FILES)
        self.assertEqual(set(inv.keys()), {1, 2, 3, 4, 5, 6, 7})

    def test_dok_every_id_decodes_to_exactly_three_records_of_780(self) -> None:
        inv = wd.dos_walldef_inventory(DOK_DOS, DOK_DOS_FILES)
        for block_id, blk in inv.items():
            with self.subTest(block_id=block_id):
                self.assertEqual(len(blk.raw), wd.DOS_RECORD_SIZE * 3)
                self.assertEqual(blk.n_records, 3)

    def test_dok_raw_size_is_constant_across_all_seven_ids(self) -> None:
        """The DOS shape does NOT vary per id for DoK -- every WALLDEF block is 2340 bytes.
        This is the fact the C64 length variance (S1 of the doc) is tested against."""
        inv = wd.dos_walldef_inventory(DOK_DOS, DOK_DOS_FILES)
        sizes = {len(blk.raw) for blk in inv.values()}
        self.assertEqual(sizes, {2340})

    def test_cok_has_more_than_seven_ids_and_variable_record_counts(self) -> None:
        """Contrast case: Champions of Krynn (22 C64 ids) does NOT have DoK's clean
        single-block-per-id shape -- some ids hold 1 record, others 2. Real, not assumed."""
        inv = wd.dos_walldef_inventory(COK_DOS, COK_DOS_FILES)
        self.assertGreater(len(inv), 7)
        record_counts = {blk.n_records for blk in inv.values()}
        self.assertIn(1, record_counts)
        self.assertIn(2, record_counts)

    def test_decode_dos_walldef_file_rejects_a_non_780_multiple(self) -> None:
        """Mutation check for the shape guard itself: corrupt a real file's declared raw_size
        via a monkeypatched decompress and confirm decode_dos_walldef_file raises. Patches
        `wd.decompress_block` (the name bound into c64_walldef's own namespace by its `from
        dax_decode import ...`), not `dax_decode.decompress_block` itself -- the latter would
        not affect the already-bound reference `decode_dos_walldef_file` actually calls."""
        real_decompress = wd.decompress_block

        def bad_decompress(data, data_base, blk):
            raw = real_decompress(data, data_base, blk)
            return raw[:-1]  # lop off one byte -> no longer a multiple of 780

        wd.decompress_block = bad_decompress
        try:
            with self.assertRaises(ValueError):
                wd.decode_dos_walldef_file(DOK_DOS / "WALLDEF1.DAX")
        finally:
            wd.decompress_block = real_decompress

    def test_dos_piece_sizes_sum_to_156(self) -> None:
        self.assertEqual(sum(wd.DOS_PIECE_SIZES), wd.DOS_COLUMNS)

    def test_dos_entry_kind_classification(self) -> None:
        self.assertEqual(wd.dos_entry_kind(0x00), "none")
        self.assertEqual(wd.dos_entry_kind(0x01), "border")
        self.assertEqual(wd.dos_entry_kind(0x2c), "border")
        self.assertEqual(wd.dos_entry_kind(0x2d), "tile")
        self.assertEqual(wd.dos_entry_kind(0xff), "tile")


# ---------------------------------------------------------------------------------------
# Real C64 corpus tests -- skip if D:\ is absent.
# ---------------------------------------------------------------------------------------


class C64BodyLengthTests(unittest.TestCase):
    def test_dok_seven_ids_present_with_known_lengths(self) -> None:
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        self.assertEqual(set(inv.keys()), set(DOK_C64_BODY_LENGTHS.keys()))
        for suffix, expected_len in DOK_C64_BODY_LENGTHS.items():
            with self.subTest(suffix=suffix):
                self.assertEqual(len(inv[suffix]), expected_len)

    def test_dok_c64_length_is_never_a_multiple_of_the_dos_record(self) -> None:
        """S1's core negative: none of the 7 real C64 bodies are a positive multiple of the
        DOS 780-byte record, of 156 (one row), or of 5 (the slot count) -- ruling out a
        literal DOS-shaped grid replay at the length level alone."""
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        for suffix, body in inv.items():
            with self.subTest(suffix=suffix):
                self.assertNotEqual(len(body) % wd.DOS_RECORD_SIZE, 0)
                self.assertNotEqual(len(body) % wd.DOS_COLUMNS, 0)

    def test_dok_c64_length_is_not_constant_unlike_dos(self) -> None:
        """DOS's 7 ids are all exactly 2340 bytes (see DosOracleShapeTests); the C64 side is
        not -- it varies per id, a real structural difference, not a coincidence of scale."""
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        lengths = {len(b) for b in inv.values()}
        self.assertGreater(len(lengths), 1)


class VoidRangeTests(unittest.TestCase):
    """The main new positive lead: byte values 0x21-0x3F are almost never used, in BOTH
    titles (rule: BOTH TITLES, ALWAYS)."""

    def test_void_range_near_empty_in_dok(self) -> None:
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        allb = wd.aggregate_bodies(inv)
        hits, total, frac = wd.void_range_stats(allb)
        self.assertGreater(total, 15000)  # sanity: real, sizeable corpus
        self.assertLess(frac, 0.02)  # < 2% of bytes fall in the 31-value void range

    def test_void_range_near_empty_in_cok(self) -> None:
        if not COK_C64.exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(COK_C64)
        allb = wd.aggregate_bodies(inv)
        hits, total, frac = wd.void_range_stats(allb)
        self.assertGreater(total, 15000)
        self.assertLess(frac, 0.02)

    def test_void_range_is_far_below_a_uniform_random_null(self) -> None:
        """The right null for a marginal-frequency claim: if bytes were drawn uniformly at
        random over 0..255, the void range (31 values) would get ~12.1% of all bytes
        (31/256). The real fraction is over 6x below that in both titles -- construct and
        report both numbers rather than asserting the raw fraction is 'low' in isolation."""
        if not (DOK_C64.exists() and COK_C64.exists()):
            self.skipTest("need both CoK and DoK C64 corpora")
        uniform_null = (wd.VOID_HI - wd.VOID_LO + 1) / 256.0
        for title_dir in (DOK_C64, COK_C64):
            with self.subTest(title=title_dir.name):
                inv = wd.c64_walldef_inventory(title_dir)
                allb = wd.aggregate_bodies(inv)
                _, _, frac = wd.void_range_stats(allb)
                self.assertLess(frac, uniform_null / 6)


class HighBandSpikeTests(unittest.TestCase):
    """0x40 and 0x42 are frequency outliers in the populated high band, in both titles; 0xF0
    is too, even in DoK where it is not the file's max byte (unlike CoK, refuting the
    'ceiling' reading of 0xF0 on its own -- see the doc S2.3)."""

    def test_0x40_and_0x42_far_exceed_the_high_band_median_dok(self) -> None:
        """Real numbers (2026-08-12): high-band (0x40..0xFF, 192 possible values) median
        count is 39; 0x40 scores 735 (18.8x median), 0x42 scores 431 (11.0x median). Neither
        is literally the single top value (0xF0 and 0x0b elsewhere outrank them in the full
        byte range), so this checks 'far above the typical high-band value', the honest and
        reproducible claim, not 'the single biggest' (too fragile -- see the CoK top-5
        attempt this replaced, which broke on real data)."""
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        self._assert_spike(DOK_C64)

    def test_0x40_and_0x42_far_exceed_the_high_band_median_cok(self) -> None:
        if not COK_C64.exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        self._assert_spike(COK_C64)

    def _assert_spike(self, title_dir: Path) -> None:
        import statistics

        inv = wd.c64_walldef_inventory(title_dir)
        allb = wd.aggregate_bodies(inv)
        hist = wd.byte_histogram(allb)
        high_band = {v: c for v, c in hist.items() if v >= wd.DATA_MIN}
        median = statistics.median(high_band.values())
        self.assertGreater(hist.get(0x40, 0), median * 5)
        self.assertGreater(hist.get(0x42, 0), median * 5)

    def test_0xf0_is_not_dok_max_byte_but_is_still_a_frequency_outlier(self) -> None:
        """Refutes the naive 'high value = ceiling' reading of 0xF0 in a single move: DoK
        legitimately uses bytes above 0xF0 (max is 0xFF, unlike the 50-glyph titles), yet
        0xF0 remains massively overrepresented -- so its frequency spike is not explained by
        it merely being 'the biggest allowed value'."""
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        allb = wd.aggregate_bodies(inv)
        self.assertEqual(max(allb), 0xFF)  # DoK reaches the true byte ceiling
        hist = wd.byte_histogram(allb)
        neighbourhood = [hist.get(v, 0) for v in range(0xE0, 0xFF) if v != 0xF0]
        mean_neighbour = sum(neighbourhood) / len(neighbourhood)
        self.assertGreater(hist[0xF0], mean_neighbour * 5)


class RefutedHypothesisTests(unittest.TestCase):
    """Each test here pins a NEGATIVE result: the hypothesis was tested against real bytes
    and failed. Kept as real regression tests, not prose, per the task's methodology rules."""

    def test_high_band_glyph_index_hypothesis_fails_cross_title(self) -> None:
        """'high-band byte = 0x40 + glyph_index' would bound distinct high-band values by the
        title's glyph count (50 for CoK). It does not: CoK uses far more than 50 distinct
        high-band values in single files, refuting the reading (it happens to fit DoK's 192
        only because 0x40..0xFF is exactly 192 values wide -- a coincidence of range size,
        not of content, per rule 'BOTH TITLES, ALWAYS')."""
        if not COK_C64.exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(COK_C64)
        glyph_count = 50
        violations = 0
        for suffix, body in inv.items():
            distinct_high = len({x for x in body if x >= wd.DATA_MIN})
            if distinct_high > glyph_count:
                violations += 1
        # Real measurement (2026-08-12): every one of CoK's 22 ids violates the bound.
        self.assertGreater(violations, len(inv) // 2)

    def test_control_run_hypothesis_mismatches_dominate_dok(self) -> None:
        """The simple 'control byte c<0x20 => run of c+1 data bytes' RLE reading fails badly
        on every real DoK body: mismatches outnumber matches in all 7 files."""
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        for suffix, body in inv.items():
            with self.subTest(suffix=suffix):
                matched, mismatched, _ = wd.control_run_test(body)
                self.assertGreater(mismatched, matched)

    def test_parity_interleave_hypothesis_fails_dok(self) -> None:
        """A two-stream (even offset = one class, odd offset = the other) reading fails:
        both parities carry a similar C/D mix in every real DoK body, not a clean split."""
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        for suffix, body in inv.items():
            with self.subTest(suffix=suffix):
                counts = wd.parity_class_counts(body)
                even_total = counts["even_C"] + counts["even_D"]
                odd_total = counts["odd_C"] + counts["odd_D"]
                even_d_frac = counts["even_D"] / even_total if even_total else 0
                odd_d_frac = counts["odd_D"] / odd_total if odd_total else 0
                # If parity cleanly separated the classes, one fraction would be near 0/1.
                # Real data: both land in the same broad middle band.
                self.assertGreater(even_d_frac, 0.5)
                self.assertGreater(odd_d_frac, 0.5)
                self.assertLess(abs(even_d_frac - odd_d_frac), 0.1)

    def test_gap_lengths_do_not_cluster_at_dos_piece_sizes(self) -> None:
        """Tests whether run-lengths between class-C bytes cluster at the DOS 10-piece sizes
        {2,4,4,12,16,16,56,22,22,2}. They do not: the two most common gap lengths across the
        whole DoK corpus are 0 and 1 (short runs), not any DOS piece size, and the DOS piece
        sizes collectively account for only a small minority of all observed gaps."""
        if not DOK_C64.exists():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(DOK_C64)
        agg: dict[int, int] = {}
        for body in inv.values():
            for length, count in wd.gap_lengths(body).items():
                agg[length] = agg.get(length, 0) + count
        total_gaps = sum(agg.values())
        piece_size_gaps = sum(agg.get(sz, 0) for sz in set(wd.DOS_PIECE_SIZES))
        self.assertLess(piece_size_gaps / total_gaps, 0.15)


class CorpusAppropriateNullTests(unittest.TestCase):
    """Lead-session (2026-08-12) re-scoring of this round's byte-value claims against each
    title's OWN histogram instead of a uniform-random null. Backs the correction boxes in
    docs/engine/research/c64-walldef-format.md S2.1 and S3.1b.

    These tests exist to be able to FAIL: the Gateway row is the falsifier. If the void were
    the universal type boundary the round originally claimed, Gateway would not sit at rank 33.
    """

    #: `{title dir: (void hits, void rank, widest all-zero run)}`, all re-derived from the real
    #: disks. Only the ids' first disk-side instance counts -- see `c64_walldef_inventory`.
    EXPECTED = {
        "Buck Rogers - Countdown to Doomsday": (22, 1, 4),
        "Champions of Krynn": (21, 6, 34),
        "Curse of the Azure Bonds": (16, 5, 34),
        "Death Knights of Krynn": (32, 1, 4),
        "Gateway to the Savage Frontier": (15, 33, 40),
        "Pool of Radiance": (0, 1, 48),
        "Secret of the Silver Blades": (17, 1, 12),
    }

    def _agg(self, title: str) -> bytes:
        path = C64_SETS / title
        if not path.exists():
            self.skipTest(f"{title} C64 corpus not present")
        return wd.aggregate_bodies(wd.c64_walldef_inventory(path))

    def test_void_rank_against_each_titles_own_histogram(self) -> None:
        for title, (hits, rank, _) in self.EXPECTED.items():
            with self.subTest(title=title):
                body = self._agg(title)
                got_hits, got_rank, windows = wd.sliding_window_rank(body)
                self.assertEqual(windows, 226)
                self.assertEqual(got_hits, hits)
                self.assertEqual(got_rank, rank)

    def test_the_void_is_not_universal_gateway_refutes_it(self) -> None:
        """The single claim the original two-title (CoK+DoK) check could not have caught."""
        body = self._agg("Gateway to the Savage Frontier")
        _, rank, windows = wd.sliding_window_rank(body)
        self.assertGreater(rank, 10, "Gateway's void window is supposed to be unremarkable")
        self.assertLess(rank, windows)

    def test_three_titles_have_a_wider_untouched_band_than_the_void_window(self) -> None:
        """A competing, more extreme candidate the original round did not mention."""
        void_width = wd.VOID_HI - wd.VOID_LO + 1
        for title in ("Champions of Krynn", "Curse of the Azure Bonds", "Pool of Radiance"):
            with self.subTest(title=title):
                run, start = wd.largest_all_zero_run(self._agg(title))
                self.assertGreater(run, void_width)
                self.assertGreaterEqual(start, 0xC8)

    def test_cok_and_dok_rows_reproduce_the_rounds_own_void_counts(self) -> None:
        """Cross-check that this de-duplicated re-derivation matches S2.1's stated 21/32."""
        self.assertEqual(wd.sliding_window_rank(self._agg("Champions of Krynn"))[0], 21)
        self.assertEqual(wd.sliding_window_rank(self._agg("Death Knights of Krynn"))[0], 32)


class Section2HighBandTests(unittest.TestCase):
    """The `section-2 high byte = 0x80 | glyph_index` variant (doc S3.1b) -- observation real,
    hypothesis refuted. Distinct from S3.1's whole-file `0x40 + glyph_index` refutation."""

    def _cok(self) -> dict[str, bytes]:
        if not COK_C64.exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        return wd.c64_walldef_inventory(COK_C64)

    def test_section_restriction_shrinks_the_alphabet_by_several_fold(self) -> None:
        """Why the variant is a different hypothesis and not covered by S3.1."""
        inv = self._cok()
        for sid, body in sorted(inv.items()):
            with self.subTest(id=sid):
                whole = len({b for b in body if b >= 0x40})
                self.assertLessEqual(len(wd.section2_high_band(body)) * 2, whole)

    def test_the_exact_177_pileup_is_real_and_still_unexplained(self) -> None:
        """15 of 22 CoK ids peak at exactly 177; 2 exceed it. Both facts are the finding."""
        inv = self._cok()
        maxima = {sid: (wd.section2_high_band(b) or [-1])[-1] for sid, b in inv.items()}
        self.assertEqual(len(maxima), 22)
        self.assertEqual(sum(1 for m in maxima.values() if m == 177), 15)
        self.assertEqual({s for s, m in maxima.items() if m > 177}, {"04", "17"})

    def test_177_sits_above_a_gap_so_it_is_not_an_index_ceiling(self) -> None:
        """A dense index range 0x80..0xB1 would populate the values just below its ceiling."""
        inv = self._cok()
        checked = 0
        for sid, body in sorted(inv.items()):
            band = wd.section2_high_band(body)
            if not band or band[-1] != 177:
                continue
            checked += 1
            with self.subTest(id=sid):
                # Measured gaps below 177 across the 15: min 7, max 32, median 18.
                self.assertGreaterEqual(177 - band[-2], 7, "177 should be isolated above a gap")
        self.assertEqual(checked, 15)

    def test_0xb1_is_not_a_sentinel_unlike_0xf0(self) -> None:
        """The frequency test that kills the reading: 0xB1 is ordinary, 0xF0 is not.

        Measured across the six titles with a split: 0xB1 spans 1.6x-4.8x, 0xF0 spans
        54.7x-193.8x. The bounds below are the real envelope, not round numbers -- an earlier
        draft asserted `0xF0 > 100` from CoK's 148.5x alone and failed on DoK (57.8x)."""
        for title in ("Champions of Krynn", "Death Knights of Krynn",
                      "Gateway to the Savage Frontier", "Curse of the Azure Bonds",
                      "Secret of the Silver Blades", "Buck Rogers - Countdown to Doomsday"):
            path = C64_SETS / title
            if not path.exists():
                self.skipTest(f"{title} C64 corpus not present")
            s2 = wd.aggregate_section2(wd.c64_walldef_inventory(path))
            with self.subTest(title=title):
                self.assertLess(wd.high_band_frequency_ratio(s2, 0xB1), 5.0)
                self.assertGreater(wd.high_band_frequency_ratio(s2, 0xF0), 50.0)
                self.assertGreater(
                    wd.high_band_frequency_ratio(s2, 0xF0),
                    10 * wd.high_band_frequency_ratio(s2, 0xB1),
                )

    def test_splitting_the_concatenation_is_the_trap_this_api_prevents(self) -> None:
        """`section_split(aggregate_bodies(inv))` swallows the corpus; the helper does not."""
        inv = self._cok()
        wrong = wd.section_split(wd.aggregate_bodies(inv))
        assert wrong is not None
        right = wd.aggregate_section2(inv)
        total = len(wd.aggregate_bodies(inv))
        # Real CoK figures: the naive split keeps 22918 of 23717 bytes (96.6%) as "section 2";
        # the per-file split keeps 8431 (35.6%).
        self.assertGreater(len(wrong[2]) / total, 0.9)
        self.assertLess(len(right) / total, 0.4)

    def test_pool_of_radiance_has_no_section_split_at_all(self) -> None:
        """The split is not universal -- callers must handle None."""
        path = C64_SETS / "Pool of Radiance"
        if not path.exists():
            self.skipTest("Pool of Radiance C64 corpus not present")
        inv = wd.c64_walldef_inventory(path)
        self.assertTrue(inv)
        for sid, body in sorted(inv.items()):
            with self.subTest(id=sid):
                self.assertIsNone(wd.section_split(body))
                self.assertEqual(wd.section2_high_band(body), [])


class NibbleCeilingIsolationTests(unittest.TestCase):
    """Replaces the vacuous S3 "nibble ceiling" check (a body whose max is 0xF0 cannot contain a
    byte above 0xF0) with the falsifiable question underneath it: how wide is the run of unused
    values immediately below 0xF0? See c64-walldef-structure.md S3's correction box."""

    #: `{title: (min gap, max gap, body count)}`, re-derived from the real disks.
    GAP_ENVELOPE = {
        "Champions of Krynn": (34, 84, 22),
        "Curse of the Azure Bonds": (34, 80, 18),
        "Gateway to the Savage Frontier": (40, 76, 14),
        "Secret of the Silver Blades": (0, 84, 15),
        "Death Knights of Krynn": (0, 34, 7),
        "Buck Rogers - Countdown to Doomsday": (0, 0, 7),
    }

    def _gaps(self, title: str) -> list[int]:
        path = C64_SETS / title
        if not path.exists():
            self.skipTest(f"{title} C64 corpus not present")
        inv = wd.c64_walldef_inventory(path)
        return [g for b in inv.values() if (g := wd.gap_below_sentinel(b)) is not None]

    def test_the_old_check_is_a_tautology(self) -> None:
        """Guards the correction itself: synthetic proof the original test cannot fail."""
        for body in (bytes([0x00, 0xF0]), bytes([0xEF, 0xF0, 0xF0]), bytes([0xF0])):
            self.assertEqual(max(body), 0xF0)
            self.assertEqual([b for b in body if 0xF1 <= b <= 0xFF], [])

    def test_gap_envelope_per_title(self) -> None:
        for title, (lo, hi, count) in self.GAP_ENVELOPE.items():
            with self.subTest(title=title):
                gaps = self._gaps(title)
                self.assertEqual(len(gaps), count)
                self.assertEqual((min(gaps), max(gaps)), (lo, hi))

    def test_buck_rogers_refutes_isolation_as_a_property_of_0xf0(self) -> None:
        """The genuine negative: 0xEF is populated in all seven bodies, so 0xF0 is flush."""
        self.assertEqual(self._gaps("Buck Rogers - Countdown to Doomsday"), [0] * 7)

    def test_isolation_tracks_glyph_count_with_one_named_exception(self) -> None:
        """`gap > 0` iff the area has 50 glyphs -- 82 of 83 non-Pool bodies, exception DoK 03."""
        import c64_wallset as ws_mod

        tally: dict[tuple[int, bool], int] = {}
        exceptions: list[tuple[str, str, int, int]] = []
        for title in self.GAP_ENVELOPE:
            path = C64_SETS / title
            if not path.exists():
                self.skipTest(f"{title} C64 corpus not present")
            inv = wd.c64_walldef_inventory(path)
            sets: dict[str, object] = {}
            for f in ws_mod.inventory(path)["WALLSET"]:
                sets.setdefault(f.suffix, f)
            for sid, body in sorted(inv.items()):
                if sid not in sets:
                    continue
                glyphs = len(sets[sid].body) // 8  # type: ignore[attr-defined]
                gap = wd.gap_below_sentinel(body)
                if gap is None:
                    continue
                tally[(glyphs, gap > 0)] = tally.get((glyphs, gap > 0), 0) + 1
                if (glyphs == 50) != (gap > 0):
                    exceptions.append((title, sid, glyphs, gap))

        self.assertEqual(tally.get((50, True)), 67)
        self.assertIsNone(tally.get((50, False)))
        self.assertEqual(tally.get((150, False)), 2)
        self.assertEqual(tally.get((192, False)), 13)
        self.assertEqual(
            exceptions, [("Death Knights of Krynn", "03", 192, 34)],
            "the single named outlier is what makes this falsifiable",
        )


# ---------------------------------------------------------------------------------------
# Round 6 (2026-08-13): the 0xF0-escape/operand hypothesis, the 177 pile-up explained by
# title class, and the pairwise longest-common-prefix matrix generalising S4's DoK lead.
# See docs/engine/research/c64-walldef-format.md S6/S7 for the narrative.
# ---------------------------------------------------------------------------------------

import random

NULL_SEED = 20260813

ALL_TITLES = [
    "Buck Rogers - Countdown to Doomsday",
    "Champions of Krynn",
    "Curse of the Azure Bonds",
    "Death Knights of Krynn",
    "Gateway to the Savage Frontier",
    "Secret of the Silver Blades",
]


class Round6EscapeHypothesisTests(unittest.TestCase):
    """S5's own named next move: is the byte after 0xF0 a count of bytes to the next escape?
    Real, well-nulled, but incomplete -- see docs S6.1 for the full numbers this pins."""

    def test_synthetic_exact_match_and_null_construction(self) -> None:
        # gap is "bytes strictly between one F0 and the next", which INCLUDES the operand
        # byte itself -- F0 03 <2 literal bytes> F0 -> gap=3 (op byte + 2 literal), matching
        # op1=3; F0 01 F0 -> gap=1 (just the op byte itself), matching op1=1. The trailing F0
        # is excluded (no next escape to measure a gap against).
        body = bytes([0xF0, 0x03, 0x11, 0x12, 0xF0, 0x01, 0xF0])
        pairs = wd.f0_operand_gap_pairs(body)
        self.assertEqual(pairs, [(0x03, 3), (0x01, 1)])
        matches, total = wd.f0_operand_exact_match_count(body)
        self.assertEqual((matches, total), (2, 2))

    def test_no_absurd_outlier_gaps_after_excluding_the_final_escape(self) -> None:
        """Mutation-check target: comparing the LAST escape's operand against 'distance to
        body end' (rather than excluding it) produces an outlier gap unrelated to the real
        inter-escape population. Directly asserts the exclusion by construction."""
        body = bytes([0xF0, 0x02]) + b"\x99" * 500  # one escape, then a long unrelated tail
        pairs = wd.f0_operand_gap_pairs(body)
        self.assertEqual(pairs, [])  # the lone escape is the LAST one -> excluded, not a 500-gap

    def test_op1_max_restriction_shrinks_the_population(self) -> None:
        body = bytes([0xF0, 0x02, 0x00, 0x00, 0xF0, 0x90, 0x00, 0xF0, 0x01, 0x00, 0xF0])
        unrestricted = wd.f0_operand_exact_match_count(body)
        restricted = wd.f0_operand_exact_match_count(body, op1_max=0x20)
        self.assertEqual(unrestricted[1], 3)  # 3 non-final escapes
        self.assertEqual(restricted[1], 2)  # only the two with op1 < 0x20 (0x02, 0x01)

    def test_walk_overrun_synthetic_exact_fit(self) -> None:
        """A body engineered so the escape+count walk consumes exactly to the last byte:
        F0 02 <2 bytes> ends the body -- must NOT be flagged as an overrun."""
        body = bytes([0xF0, 0x02, 0xAA, 0xBB])
        escapes, overruns = wd.f0_walk_overrun(body)
        self.assertEqual((escapes, overruns), (1, 0))

    def test_walk_overrun_synthetic_genuine_overrun(self) -> None:
        body = bytes([0xF0, 0x05, 0xAA, 0xBB])  # claims 5 more bytes, only 2 exist
        escapes, overruns = wd.f0_walk_overrun(body)
        self.assertEqual((escapes, overruns), (1, 1))

    def test_the_shuffle_null_moves_the_escapes_and_so_changes_the_gaps(self) -> None:
        """Why round 6's first pass over-scored this by ~5x-7x (doc S6.1 correction box).

        A whole-body shuffle relocates the `0xF0`s themselves. Real escapes are clustered, so
        their real mean gap is far SHORTER than a shuffle's -- and a long gap is much less
        likely to coincide with a small operand byte. The shuffle therefore scores a low match
        rate for a reason unrelated to the hypothesis. Pins the real vs shuffled mean gap in
        every title so the defect cannot silently return."""
        checked = 0
        for title in ALL_TITLES:
            path = C64_SETS / title
            if not path.exists():
                continue
            inv = wd.c64_walldef_inventory(path)
            rng = random.Random(NULL_SEED)
            real_gaps: list[int] = []
            null_gaps: list[int] = []
            for _sid, body in sorted(inv.items()):
                real_gaps += [g for _, g in wd.f0_operand_gap_pairs(body)]
                null_gaps += [g for _, g in wd.f0_operand_gap_pairs(wd.shuffle_bytes(body, rng))]
            if not real_gaps:
                continue  # Pool of Radiance: no 0xF0 at all
            checked += 1
            real_mean = sum(real_gaps) / len(real_gaps)
            null_mean = sum(null_gaps) / len(null_gaps)
            with self.subTest(title=title):
                # Real 6.2-14.6 vs shuffled 17.7-20.8, measured 2026-08-13.
                self.assertLess(real_mean, null_mean)
                self.assertGreater(null_mean, 17.0)
                self.assertLess(real_mean, 15.0)
        if checked < 6:
            self.skipTest("need all 6 non-Pool C64 corpora")

    def test_unrestricted_effect_survives_the_correct_null_but_only_at_2x_to_3x(self) -> None:
        """CORRECTED (2026-08-13). Against `f0_operand_permutation_null` -- which holds the
        real operand and gap populations fixed and permutes only their pairing -- the
        unrestricted effect is real but 2.1x-2.8x, not the 10x-16x a whole-body shuffle
        reports. Pins both the floor (the effect is real) and the ceiling (it is small)."""
        checked = 0
        for title in ALL_TITLES:
            path = C64_SETS / title
            if not path.exists():
                continue
            inv = wd.c64_walldef_inventory(path)
            pairs: list[tuple[int, int]] = []
            for _sid, body in sorted(inv.items()):
                pairs += wd.f0_operand_gap_pairs(body)
            if not pairs:
                continue
            checked += 1
            real_rate = sum(1 for op1, gap in pairs if op1 == gap) / len(pairs)
            nm, nn = wd.f0_operand_permutation_null(list(pairs), random.Random(NULL_SEED))
            null_rate = nm / nn
            with self.subTest(title=title):
                self.assertGreater(real_rate / null_rate, 2.0)
                self.assertLess(real_rate / null_rate, 3.0)
        if checked < 6:
            self.skipTest("need all 6 non-Pool C64 corpora")

    def test_the_restricted_subset_round6_called_strongest_is_at_chance(self) -> None:
        """The retraction. Restricted to `op1 < 0x20`, the match rate looks like it "rises"
        to 26.5%-35.9% -- but that is a denominator effect (the restriction removes non-matching
        pairs without removing a single match; the match COUNT is identical to unrestricted in
        every title). Under the permutation null the subset scores 1.11x-1.31x, i.e. chance.
        The doc originally cited this subset as its strongest evidence."""
        checked = 0
        for title in ALL_TITLES:
            path = C64_SETS / title
            if not path.exists():
                continue
            inv = wd.c64_walldef_inventory(path)
            pairs: list[tuple[int, int]] = []
            for _sid, body in sorted(inv.items()):
                pairs += wd.f0_operand_gap_pairs(body)
            if not pairs:
                continue
            checked += 1
            restricted = [(op1, gap) for op1, gap in pairs if op1 < 0x20]
            with self.subTest(title=title):
                # The restriction discards no matches at all -- every op1==gap pair already
                # had op1 < 0x20, so "the rate rises" is arithmetic, not evidence.
                self.assertEqual(
                    sum(1 for op1, gap in pairs if op1 == gap),
                    sum(1 for op1, gap in restricted if op1 == gap),
                )
                real_rate = sum(1 for op1, gap in restricted if op1 == gap) / len(restricted)
                nm, nn = wd.f0_operand_permutation_null(restricted, random.Random(NULL_SEED))
                self.assertLess(real_rate / (nm / nn), 1.5)
        if checked < 6:
            self.skipTest("need all 6 non-Pool C64 corpora")

    def test_five_ids_do_reach_a_majority_the_doc_claimed_none_did(self) -> None:
        """CORRECTED (2026-08-13). The doc asserted the restricted match rate "never reaches a
        majority in any single id checked ... exhaustively", citing an `n_ids_majority_match`
        statistic that exists nowhere in this module or this file. Five ids reach >=50%; three
        of them on n<=5, which is the honest reason the claim looked safe. Named, so the
        replacement claim is falsifiable rather than merely weaker."""
        majority: list[tuple[str, str, int, int]] = []
        checked = 0
        for title in ALL_TITLES:
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            for sid, body in sorted(wd.c64_walldef_inventory(path).items()):
                m, n = wd.f0_operand_exact_match_count(body, op1_max=0x20)
                if n and m / n >= 0.5:
                    majority.append((title, sid, m, n))
        if checked < 7:
            self.skipTest("need all 7 C64 corpora")
        self.assertEqual(
            majority,
            [
                ("Champions of Krynn", "17", 5, 7),
                ("Curse of the Azure Bonds", "08", 5, 5),
                ("Curse of the Azure Bonds", "0F", 10, 20),
                ("Gateway to the Savage Frontier", "08", 5, 5),
                ("Gateway to the Savage Frontier", "0F", 1, 1),
            ],
        )

    def test_walk_overrun_rate_exceeds_its_null_in_five_of_six_titles(self) -> None:
        """The refutation of the UNIFORM escape+count reading: a well-formed uniform scheme
        should overrun LESS than its own shuffle null, not more. Real data overruns MORE in
        5 of 6 titles (Buck Rogers is the one tie, reported honestly, not hidden)."""
        exceeds_null = 0
        checked = 0
        for title in ALL_TITLES:
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            inv = wd.c64_walldef_inventory(path)
            rng = random.Random(NULL_SEED)
            real_e = real_o = null_e = null_o = 0
            for sid, body in sorted(inv.items()):
                e, o = wd.f0_walk_overrun(body)
                real_e += e
                real_o += o
                shuf = wd.shuffle_bytes(body, rng)
                ne, no = wd.f0_walk_overrun(shuf)
                null_e += ne
                null_o += no
            real_rate = real_o / real_e if real_e else 0.0
            null_rate = null_o / null_e if null_e else 0.0
            if real_rate > null_rate * 1.2:
                exceeds_null += 1
        if checked < 6:
            self.skipTest("need all 6 non-Pool C64 corpora")
        self.assertEqual(exceeds_null, 5)


class Round6PileupExplanationTests(unittest.TestCase):
    """The exact-177 pile-up generalises to a title-class-specific pile-up value, and its
    mechanism differs by glyph count -- see docs S6.2."""

    #: `{title: (pileup_value, pileup_count, n_ids_with_split)}`, re-derived from the disks.
    EXPECTED_PILEUP = {
        "Champions of Krynn": (177, 15, 22),
        "Curse of the Azure Bonds": (177, 13, 18),
        "Gateway to the Savage Frontier": (177, 8, 14),
        "Secret of the Silver Blades": (177, 8, 15),
        "Death Knights of Krynn": (239, 3, 7),
        "Buck Rogers - Countdown to Doomsday": (239, 6, 7),
    }

    def _inv(self, title: str) -> dict[str, bytes]:
        path = C64_SETS / title
        if not path.exists():
            self.skipTest(f"{title} C64 corpus not present")
        return wd.c64_walldef_inventory(path)

    def test_synthetic_pileup_value_and_presence_counts(self) -> None:
        bodies = {
            "01": bytes([0x01, 0xF0, 0x81, 0xB1]),  # split at F0; band {0x81, 0xB1}
            "02": bytes([0x01, 0xF0, 0x81, 0xB1]),  # same -> both max at 0xB1
            "03": bytes([0x01, 0xF0, 0x81, 0x82]),  # no 0xB1 -> max 0x82
        }
        pileup = wd.title_pileup_value(bodies)
        self.assertEqual(pileup, (0xB1, 2, 3))
        presence = wd.value_presence_counts(bodies)
        self.assertEqual(presence[0xB1], 2)
        self.assertEqual(presence[0x81], 3)

    def test_pileup_value_generalises_across_all_six_titles(self) -> None:
        for title, expected in self.EXPECTED_PILEUP.items():
            with self.subTest(title=title):
                inv = self._inv(title)
                self.assertEqual(wd.title_pileup_value(inv), expected)

    def test_the_0xef_pileup_is_an_artifact_of_the_bands_own_ceiling(self) -> None:
        """CORRECTED (2026-08-13). `HIGH_BAND_HI` is 0xEF, so "0xEF is this id's own maximum"
        is true by construction for any body whose section 2 reaches the top of the window --
        the same tautology class as the round-5 check this doc already retracted once.

        Buck Rogers and Death Knights of Krynn are exactly that case: their section 2 really
        uses values up to 0xFF, so the reported 239 pile-up is where the analysis stops, not
        where the data stops. The four 177-titles are not -- their `0xB1` is a real ceiling
        inside a real range.

        Measured by EXTENT, not mere presence: an id counts as range-extended when section 2
        uses >=5 distinct values above the band. A lone stray value does not qualify (CoK's
        three such ids each carry exactly one `0xFF`, mid-body, not a terminator).

        The Secret rows carry their own corroboration: its only two range-extended ids, 03 and
        15, are exactly the two 150-glyph areas that are also its two pile-up exceptions -- an
        independent second signature for the same pair, derived here from byte values rather
        than from glyph counts."""
        expected_extended = {
            "Buck Rogers - Countdown to Doomsday": (7, 7),
            "Death Knights of Krynn": (5, 7),
            "Secret of the Silver Blades": (2, 15),
            "Champions of Krynn": (0, 22),
            "Curse of the Azure Bonds": (0, 18),
            "Gateway to the Savage Frontier": (0, 14),
        }
        for title, (value, _, _) in self.EXPECTED_PILEUP.items():
            inv = self._inv(title)
            extended = sorted(
                sid for sid, body in inv.items() if len(wd.section2_bytes_above_band(body)) >= 5
            )
            with self.subTest(title=title):
                self.assertEqual((len(extended), len(inv)), expected_extended[title])
                if value == wd.HIGH_BAND_HI:
                    # Clipped: the "pile-up" is the window edge. Both such titles are majority
                    # range-extended, so the maximum reported is not the data's own maximum.
                    self.assertGreaterEqual(len(extended), len(inv) - 2)
                else:
                    self.assertEqual(value, 0xB1)
                    self.assertLess(value, wd.HIGH_BAND_HI)
                if title == "Secret of the Silver Blades":
                    self.assertEqual(extended, ["03", "15"])

    def test_presence_implies_max_only_where_the_band_is_not_clipped(self) -> None:
        """CORRECTED (2026-08-13). Round 6 pooled all six titles into "53 of 56 cases" -- but
        the two 0xEF titles contribute only tautologies. Scored over the four titles where the
        pile-up value sits strictly below the window ceiling, the claim is real and survives:
        44 of 47. The two clipped titles are reported separately, not folded in."""
        real_presence = real_max = 0
        clipped_presence = clipped_max = 0
        for title, (value, _, _) in self.EXPECTED_PILEUP.items():
            inv = self._inv(title)
            for _sid, body in inv.items():
                band = wd.section2_high_band(body)
                if value not in band:
                    continue
                if value == wd.HIGH_BAND_HI:
                    clipped_presence += 1
                    clipped_max += band[-1] == value
                else:
                    real_presence += 1
                    real_max += band[-1] == value
        self.assertEqual((real_presence, real_max), (47, 44))
        # The clipped half is 9/9 -- and could not have been anything else.
        self.assertEqual(clipped_presence, clipped_max)

    def test_177_is_not_isolated_from_145_by_presence_count_alone(self) -> None:
        """The discriminator that shows 177 is structurally different from an ordinary
        popular value: 145 (0x91) has the IDENTICAL presence count (16/22) but sits right at
        the edge of the smooth low-band decay, while every value strictly between 145 and 177
        (0x92-0xB0) is far sparser -- present in at most 10 of 22 ids, none reaching 177's own
        16. `[0x92, 0xB0]` is not literally empty (a stronger, WRONG claim an earlier draft of
        this test made and that real data refuted -- e.g. 0x97 reaches 10/22), but it is a
        real, measured trough, not a smooth continuation of the core band's popularity."""
        inv = self._inv("Champions of Krynn")
        presence = wd.value_presence_counts(inv)
        self.assertEqual(presence[177], 16)
        self.assertEqual(presence[145], 16)  # same popularity, different shape (see doc)
        trough_max = max((presence[v] for v in range(0x92, 0xB1)), default=0)
        self.assertLess(trough_max, presence[177])
        self.assertEqual(trough_max, 10)  # real measurement: 0x97 (151), see the doc

    def test_secret_exceptions_are_its_150_glyph_areas_cok_exceptions_are_not(self) -> None:
        """Cross-checks each pile-up-exceeding id's own glyph count. Secret's 03/15 (150
        glyphs, already documented) fully explain its 2 exceptions; CoK's 04/17 (both
        ordinary 50-glyph areas) do NOT -- a genuinely smaller open residual."""
        import c64_wallset as ws_mod

        def glyph_count(title: str, sid: str) -> int:
            path = C64_SETS / title
            sets: dict[str, object] = {}
            for f in ws_mod.inventory(path)["WALLSET"]:
                sets.setdefault(f.suffix, f)
            return len(sets[sid].body) // 8  # type: ignore[attr-defined]

        if not (C64_SETS / "Secret of the Silver Blades").exists():
            self.skipTest("Secret of the Silver Blades C64 corpus not present")
        self.assertEqual(glyph_count("Secret of the Silver Blades", "03"), 150)
        self.assertEqual(glyph_count("Secret of the Silver Blades", "15"), 150)
        if not (C64_SETS / "Champions of Krynn").exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        self.assertEqual(glyph_count("Champions of Krynn", "04"), 50)
        self.assertEqual(glyph_count("Champions of Krynn", "17"), 50)


class Round6LcpMatrixTests(unittest.TestCase):
    """Generalises S4's DoK 01/05 37-byte shared prefix to all 7 titles -- 37 turns out NOT
    to be exceptional. See docs S6.3."""

    def test_longest_common_prefix_synthetic(self) -> None:
        self.assertEqual(wd.longest_common_prefix(b"abcdef", b"abcxyz"), 3)
        self.assertEqual(wd.longest_common_prefix(b"abc", b"abc"), 3)
        self.assertEqual(wd.longest_common_prefix(b"", b"abc"), 0)
        self.assertEqual(wd.longest_common_prefix(b"xyz", b"abc"), 0)

    def test_pairwise_lcp_and_max_synthetic(self) -> None:
        bodies = {"01": b"AAAABBBB", "02": b"AAAACCCC", "03": b"ZZZZZZZZ"}
        matrix = wd.pairwise_lcp(bodies)
        self.assertEqual(matrix, {("01", "02"): 4, ("01", "03"): 0, ("02", "03"): 0})
        best, pairs = wd.max_pairwise_lcp(bodies)
        self.assertEqual((best, pairs), (4, [("01", "02")]))

    def test_max_pairwise_lcp_empty_and_singleton(self) -> None:
        self.assertEqual(wd.max_pairwise_lcp({}), (0, []))
        self.assertEqual(wd.max_pairwise_lcp({"01": b"abc"}), (0, []))

    #: `{title: (max_lcp, [pairs])}`, re-derived from the real disks.
    EXPECTED_MAX_LCP = {
        "Champions of Krynn": (14, [("03", "0E")]),
        "Death Knights of Krynn": (37, [("01", "05")]),
        "Buck Rogers - Countdown to Doomsday": (67, [("04", "07"), ("04", "0D"), ("07", "0D")]),
        "Curse of the Azure Bonds": (155, [("02", "09")]),
        "Gateway to the Savage Frontier": (1232, [("03", "1F"), ("03", "1F."), ("1F", "1F.")]),
        "Pool of Radiance": (3, [("07", "16")]),
    }

    def test_max_lcp_per_title(self) -> None:
        for title, expected in self.EXPECTED_MAX_LCP.items():
            path = C64_SETS / title
            if not path.exists():
                self.skipTest(f"{title} C64 corpus not present")
            with self.subTest(title=title):
                inv = wd.c64_walldef_inventory(path)
                self.assertEqual(wd.max_pairwise_lcp(inv), expected)

    def test_37_is_not_exceptional_three_titles_exceed_it(self) -> None:
        """The direct answer to the task's framing: DoK's 37 is smaller than CoAB (155),
        Buck Rogers (67), and Gateway (1232, a full-body duplicate) -- not the corpus max."""
        exceeding = 0
        checked = 0
        for title, (max_lcp, _) in self.EXPECTED_MAX_LCP.items():
            if title == "Death Knights of Krynn":
                continue
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            if max_lcp > 37:
                exceeding += 1
        if checked < 5:
            self.skipTest("need at least 5 of the other 6 titles present")
        self.assertEqual(exceeding, 3)

    def test_gateway_trio_is_a_full_body_duplicate_not_merely_a_shared_prefix(self) -> None:
        path = C64_SETS / "Gateway to the Savage Frontier"
        if not path.exists():
            self.skipTest("Gateway to the Savage Frontier C64 corpus not present")
        files = wd.iter_c64_walldef_files(path)
        suffixes = {f.suffix for f in files}
        self.assertIn("1F.", suffixes, "the trailing-dot id must be a real directory entry")
        inv = wd.c64_walldef_inventory(path)
        self.assertEqual(inv["03"], inv["1F"])
        self.assertEqual(inv["1F"], inv["1F."])

    def test_pool_and_secret_maxima_do_not_clearly_clear_a_shuffle_null(self) -> None:
        """Honest negative: unlike the other 5 titles, Pool (3) and Secret (2) sit at or
        barely above what a histogram-preserving shuffle null achieves by chance -- not
        distinguishable evidence of a shared template, reported as such rather than stretched."""
        for title, max_lcp in (("Pool of Radiance", 3), ("Secret of the Silver Blades", 2)):
            path = C64_SETS / title
            if not path.exists():
                self.skipTest(f"{title} C64 corpus not present")
            with self.subTest(title=title):
                inv = wd.c64_walldef_inventory(path)
                rng = random.Random(NULL_SEED)
                shuffled = {sid: wd.shuffle_bytes(b, rng) for sid, b in inv.items()}
                null_max, _ = wd.max_pairwise_lcp(shuffled)
                real_max, _ = wd.max_pairwise_lcp(inv)
                self.assertEqual(real_max, max_lcp)
                self.assertLessEqual(real_max, null_max + 2)


# ---------------------------------------------------------------------------------------
# Lead session (2026-08-13): corpus-wide measurement of the "gap==4" 0xF0-escape record
# shape S6.1 called "ONE observed local run in one file, not a proven general record shape."
# See docs/engine/research/c64-walldef-format.md S6.1/S7's replacement text.
# ---------------------------------------------------------------------------------------

import collections as _collections


class Gap4RecordShapeTests(unittest.TestCase):
    """Corpus-wide measurement of the 0xF0-escape 4-byte candidate record shape (two
    CONSECUTIVE `0xF0`s exactly 4 bytes apart) and the correct null for the claim that its
    middle payload byte specifically -- not any of the record's three payload bytes -- clusters
    in `[0x09, 0x0F]`."""

    def test_gap4_records_synthetic_shape_and_exclusion(self) -> None:
        # F0 82 0C 82 | F0 82 0C 83 | F0 (trailing, no next escape -> excluded).
        body = bytes([0xF0, 0x82, 0x0C, 0x82, 0xF0, 0x82, 0x0C, 0x83, 0xF0])
        recs = wd.gap4_records(body)
        self.assertEqual(
            recs,
            [wd.Gap4Record(0, 0x82, 0x0C, 0x82), wd.Gap4Record(4, 0x82, 0x0C, 0x83)],
        )

    def test_gap4_records_rejects_a_non_matching_width(self) -> None:
        # Escapes 5 bytes apart (not 4) -- must NOT be picked up as a gap==4 record.
        body = bytes([0xF0, 0x01, 0x02, 0x03, 0x04, 0xF0])
        self.assertEqual(wd.gap4_records(body), [])

    def test_gap4_records_requires_true_adjacency_not_just_a_coincidental_offset(self) -> None:
        """An earlier draft of this scan checked `body[p+4] == sentinel` directly (no
        positions list), which over-counts if an intervening escape sits strictly between --
        impossible at width 4 with a >=1-byte payload, but this pins the walk uses the
        escape-position list so it stays correct if a future round reuses it at another
        width."""
        # Three escapes at 0, 2, 6: (0,2) is 2 apart (no match), (2,6) is 4 apart (matches).
        body = bytes([0xF0, 0x01, 0xF0, 0xAA, 0xBB, 0xCC, 0xF0])
        recs = wd.gap4_records(body)
        self.assertEqual(recs, [wd.Gap4Record(2, 0xAA, 0xBB, 0xCC)])

    def test_gap4_cluster_fraction_synthetic(self) -> None:
        counter = _collections.Counter({0x0B: 3, 0x82: 1})
        self.assertAlmostEqual(wd.gap4_cluster_fraction(counter, 4), 0.75)
        self.assertEqual(wd.gap4_cluster_fraction(_collections.Counter(), 0), 0.0)

    #: `{title: expected_record_count}`, re-derived from the real disks 2026-08-13. Buck Rogers
    #: is deliberately included even though it was stated as "0" elsewhere before this round's
    #: measurement -- real corpus-wide measurement is 238, not 0 (see the doc's corrected
    #: table); reported here as the measured fact, not the earlier claim.
    EXPECTED_COUNTS = {
        "Champions of Krynn": 215,
        "Death Knights of Krynn": 257,
        "Curse of the Azure Bonds": 192,
        "Secret of the Silver Blades": 157,
        "Gateway to the Savage Frontier": 102,
        "Buck Rogers - Countdown to Doomsday": 238,
        "Pool of Radiance": 0,
    }

    def _inv(self, title: str) -> dict[str, bytes]:
        path = C64_SETS / title
        if not path.exists():
            self.skipTest(f"{title} C64 corpus not present")
        return wd.c64_walldef_inventory(path)

    def test_record_counts_per_title(self) -> None:
        for title, expected in self.EXPECTED_COUNTS.items():
            with self.subTest(title=title):
                inv = self._inv(title)
                total, _ = wd.gap4_third_byte_distribution(inv)
                self.assertEqual(total, expected)

    def test_pool_of_radiance_has_zero_gap4_records(self) -> None:
        """Standing rule: check all seven titles. Pool has no `0xF0` at all
        (`section_split` already established this), so it has no gap==4 records either --
        the zero is a consequence of the same fact, not a new one."""
        inv = self._inv("Pool of Radiance")
        total, counter = wd.gap4_third_byte_distribution(inv)
        self.assertEqual(total, 0)
        self.assertEqual(counter, _collections.Counter())

    def test_byte2_clusters_far_above_the_slot_permutation_null(self) -> None:
        """The headline result: byte2 (the record's SECOND payload byte) clusters in
        [0x09, 0x0F] at ~87%-99% real vs ~28%-32% under the CORRECT null (position-preserving:
        holds the real gap==4 records fixed -- same positions, same three byte values each --
        and permutes only which of the three payload bytes lands in the middle slot) --
        roughly 3.1x in every one of the 6 titles that has any 0xF0 at all.

        A whole-body shuffle (`shuffle_bytes`) would be the WRONG null here, for the same
        reason the doc's S6.1 correction box already gives for the escape/gap claim: it
        relocates the escapes themselves, changing which bytes are even a record's payload in
        the first place, rather than only breaking the claimed slot-to-value association."""
        checked = 0
        for title in ALL_TITLES:
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            inv = wd.c64_walldef_inventory(path)
            recs: list[wd.Gap4Record] = []
            for body in inv.values():
                recs += wd.gap4_records(body)
            total, counter = wd.gap4_third_byte_distribution(inv)
            real_frac = wd.gap4_cluster_fraction(counter, total)
            nm, nn = wd.gap4_slot_permutation_null(recs, random.Random(NULL_SEED))
            null_rate = nm / nn
            with self.subTest(title=title):
                self.assertGreater(real_frac, 0.85)
                self.assertGreater(null_rate, 0.25)
                self.assertLess(null_rate, 0.35)
                self.assertGreater(real_frac / null_rate, 2.5)
        if checked < 6:
            self.skipTest("need all 6 non-Pool C64 corpora")

    def test_byte1_and_byte3_almost_never_land_in_the_cluster_band(self) -> None:
        """The other half of the "middle slot specifically" claim: byte1 (style) and byte3
        (variant) are essentially never in [0x09, 0x0F] -- 0 hits per title except a single
        named 3-record exception in Buck Rogers, reported by name rather than rounded away
        (standing rule: no exhaustive language without the exact enumerated count)."""
        checked = 0
        for title in ALL_TITLES:
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            inv = wd.c64_walldef_inventory(path)
            recs: list[wd.Gap4Record] = []
            for body in inv.values():
                recs += wd.gap4_records(body)
            b1_hits = sum(1 for r in recs if wd.GAP4_CLUSTER_LO <= r.byte1 <= wd.GAP4_CLUSTER_HI)
            b3_hits = sum(1 for r in recs if wd.GAP4_CLUSTER_LO <= r.byte3 <= wd.GAP4_CLUSTER_HI)
            with self.subTest(title=title):
                self.assertEqual(b1_hits, 0)
                if title == "Buck Rogers - Countdown to Doomsday":
                    self.assertEqual(b3_hits, 3)
                else:
                    self.assertEqual(b3_hits, 0)
        if checked < 6:
            self.skipTest("need all 6 non-Pool C64 corpora")

    def test_the_cluster_bands_high_edge_is_real_and_its_low_edge_is_not(self) -> None:
        """Band-edge audit for `[GAP4_CLUSTER_LO, GAP4_CLUSTER_HI]` (orchestrator, 2026-08-13).

        This doc has twice shipped a scan window's own edge as a fact about the data (`0xF0`
        round 5, `0xEF` round 6), so the edges of any NEW band must be probed, not assumed.

        HIGH edge is genuine: `GAP4_CLUSTER_HI + 1` has zero occurrences corpus-wide and the
        only value above it at all is a single `0xD0`. Unlike round 6's `0xEF`, the
        distribution really does stop here, so calling `0x0F` byte2's ceiling is legitimate.

        LOW edge is arbitrary: `0x08` and `0x06` are populated, so the per-title 87%-99%
        figures are "in-band", NOT "the whole distribution". The edge-independent fact --
        pinned here because it is the one that does not move if someone retunes the band --
        is that byte2 is NIBBLE-VALUED: 1160 of 1161 pooled records fall in [0x01, 0x0F].
        """
        # ALL_TITLES holds only the SIX non-Pool titles; Pool of Radiance is named explicitly
        # so this really is a 7-title sweep (standing rule 5) rather than a 6-title one that
        # merely says "all". Pool contributes 0 records -- it has no 0xF0 in any body -- so it
        # cannot change the pooled totals, but "checked and found empty" and "not checked" are
        # different facts. (An earlier draft of this test required `checked < 7` while
        # iterating a 6-element list, so it silently skipped every run: a probe that never
        # executes reads as PASS.)
        recs: list[wd.Gap4Record] = []
        checked = 0
        pool_recs = -1
        for title in [*ALL_TITLES, "Pool of Radiance"]:
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            n_before = len(recs)
            for body in wd.c64_walldef_inventory(path).values():
                recs += wd.gap4_records(body)
            if title == "Pool of Radiance":
                pool_recs = len(recs) - n_before
        if checked < 7:
            self.skipTest("need all 7 C64 corpora")
        self.assertEqual(pool_recs, 0, "Pool of Radiance contributes no gap==4 records")
        self.assertEqual(len(recs), 1161, "pooled gap==4 record population")
        hist = _collections.Counter(r.byte2 for r in recs)
        # HIGH edge: nothing immediately above the band, and exactly one value anywhere above.
        self.assertEqual(hist[wd.GAP4_CLUSTER_HI + 1], 0, "0x10 must be empty")
        above = {v: n for v, n in hist.items() if v > wd.GAP4_CLUSTER_HI}
        self.assertEqual(above, {0xD0: 1}, "exactly one record above the band, value 0xD0")
        # LOW edge: really does cut live data -- this is what makes the band arbitrary below.
        self.assertEqual(hist[wd.GAP4_CLUSTER_LO - 1], 24, "0x08 is populated")
        self.assertEqual(hist[0x06], 43, "0x06 is populated")
        below = sum(n for v, n in hist.items() if v < wd.GAP4_CLUSTER_LO)
        self.assertEqual(below, 73, "records the band's low edge excludes")
        # The edge-independent statement: byte2 is a nibble field.
        nibble = sum(n for v, n in hist.items() if 0x01 <= v <= 0x0F)
        self.assertEqual(nibble, 1160)
        self.assertEqual(len(recs) - nibble, 1, "exactly one non-nibble byte2 in the corpus")

    def test_byte1_enumerates_a_small_set_across_the_corpus(self) -> None:
        """Answers, without overclaiming a record-kind tag, whether byte1 (the "style" byte)
        draws from a small enumerated set: pooled across all 6 non-Pool titles it is exactly
        23 distinct values -- small relative to the 256-value byte space, but the count is the
        one actually iterated and cited, not asserted from a vague impression (standing rule:
        no small-set language without an enumerated population)."""
        if not all((C64_SETS / t).exists() for t in ALL_TITLES):
            self.skipTest("need all 6 non-Pool C64 corpora")
        union: set[int] = set()
        for title in ALL_TITLES:
            inv = wd.c64_walldef_inventory(C64_SETS / title)
            for body in inv.values():
                union.update(r.byte1 for r in wd.gap4_records(body))
        self.assertEqual(len(union), 23)

    def test_byte1_0x82_dominates_the_crosstab_but_is_not_exclusive(self) -> None:
        """Cross-tabulates byte1 against the cluster band on real Champions of Krynn data:
        0x82 alone accounts for the plurality of records (96/215) and its own records are
        themselves overwhelmingly, but not universally, in-cluster (92/96 = 95.8%) -- the
        measured mixed picture, neither "always" nor "never"."""
        inv = self._inv("Champions of Krynn")
        recs: list[wd.Gap4Record] = []
        for body in inv.values():
            recs += wd.gap4_records(body)
        crosstab = wd.gap4_byte1_vs_cluster_crosstab(recs)
        n_0x82, in_cluster_0x82 = crosstab[0x82]
        total = sum(n for n, _ in crosstab.values())
        self.assertEqual(total, 215)
        self.assertEqual((n_0x82, in_cluster_0x82), (96, 92))
        self.assertGreater(n_0x82 / total, 0.3)
        frac = in_cluster_0x82 / n_0x82
        self.assertGreater(frac, 0.8)
        self.assertLess(frac, 1.0)


# ---------------------------------------------------------------------------------------
# Task session (2026-08-13): CoK's two 177-pile-up exceptions (id 04 -> 187, id 17 -> 203)
# and Gateway's WALLDEF03/1F/1F. triple duplicate. See
# docs/engine/research/c64-walldef-format.md's new section for the narrative.
# ---------------------------------------------------------------------------------------

SEVEN_TITLES = [*ALL_TITLES, "Pool of Radiance"]


class Section2TrueMaxTests(unittest.TestCase):
    """Q1's mandatory band-edge audit: `section2_high_band`'s in-window max is not necessarily
    the id's real maximum. Re-derives the exact counts the task brief quotes, then goes past
    the window edge (the check itself, per rule 1)."""

    def test_synthetic_true_max_excludes_the_sentinel(self) -> None:
        # Section 2 is F0 81 F0 F0 82 F0 -- max(section2) would trivially be 0xF0 itself
        # (the sentinel, which recurs constantly by construction); the real data max is 0x82.
        body = bytes([0x01, 0xF0, 0x81, 0xF0, 0xF0, 0x82, 0xF0])
        self.assertEqual(wd.section2_true_max(body), 0x82)

    def test_synthetic_true_max_none_without_a_split(self) -> None:
        self.assertIsNone(wd.section2_true_max(bytes([0x01, 0x02, 0x03])))

    def test_synthetic_true_max_none_when_section2_is_pure_sentinel(self) -> None:
        self.assertIsNone(wd.section2_true_max(bytes([0x01, 0xF0, 0xF0, 0xF0])))

    def _cok(self) -> dict[str, bytes]:
        if not COK_C64.exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        return wd.c64_walldef_inventory(COK_C64)

    def test_id04_and_id17_byte_counts_match_the_task_briefs_quoted_figures(self) -> None:
        """Re-derives (does not trust) the brief's own numbers directly from real bytes."""
        inv = self._cok()
        self.assertEqual(wd.section2_bytevalue_count(inv["04"], 0xB1), 3)
        self.assertEqual(wd.section2_bytevalue_count(inv["04"], 0xBB), 1)
        self.assertEqual(wd.section2_bytevalue_count(inv["17"], 0xB1), 0)
        self.assertEqual(wd.section2_bytevalue_count(inv["17"], 0xB9), 1)
        self.assertEqual(wd.section2_bytevalue_count(inv["17"], 0xCB), 1)

    def test_id17s_in_window_max_is_its_real_max_zero_bytes_above_the_band(self) -> None:
        """The band-edge audit's clean case: id 17 has NOTHING above 0xEF, so 0xCB (203) is a
        real ceiling, not a window artifact."""
        inv = self._cok()
        self.assertEqual(wd.section2_bytes_above_band(inv["17"]), [])
        self.assertEqual(wd.section2_true_max(inv["17"]), 0xCB)
        self.assertEqual((wd.section2_high_band(inv["17"]) or [None])[-1], 0xCB)

    def test_id04s_in_window_max_is_NOT_its_real_max_the_audit_catches_it(self) -> None:
        """The band-edge audit's positive catch: id 04's in-window max (0xBB = 187, the figure
        quoted in the task brief and in the doc's own S6.2) is NOT the file's true maximum.
        Section 2 contains two 0xFF bytes strictly above the [0x80,0xEF] window -- the real
        ceiling is 0xFF (255), not 0xBB. Exactly the class of error rule 1 warns about: the
        window's own edge (0xEF) was being reported as a fact about id 04's data."""
        inv = self._cok()
        above = wd.section2_bytes_above_band(inv["04"])
        self.assertEqual(above, [0xFF])
        self.assertEqual(wd.section2_bytevalue_count(inv["04"], 0xFF), 2)
        self.assertEqual((wd.section2_high_band(inv["04"]) or [None])[-1], 0xBB)  # in-window
        self.assertEqual(wd.section2_true_max(inv["04"]), 0xFF)  # real
        self.assertNotEqual(
            wd.section2_true_max(inv["04"]), (wd.section2_high_band(inv["04"]) or [None])[-1]
        )

    def test_stray_ff_is_not_unique_to_the_pileup_exceptions(self) -> None:
        """The cross-reference this raises: does 'has a byte above the window' predict
        pile-up-exception status? No -- exactly 3 CoK ids have a stray section-2 0xFF (04,
        14, 16), but only 04 is a pile-up exception; 14 and 16 both conform normally (14
        piles up AT 0xB1 itself; 16 sits below it). A clean negative for this candidate
        explanation, pinned as a real test rather than left as prose."""
        inv = self._cok()
        with_stray = sorted(
            sid for sid, body in inv.items() if wd.section2_bytes_above_band(body)
        )
        self.assertEqual(with_stray, ["04", "14", "16"])
        in_window_max = {sid: (wd.section2_high_band(inv[sid]) or [None])[-1] for sid in with_stray}
        self.assertEqual(in_window_max, {"04": 0xBB, "14": 0xB1, "16": 0xA6})
        # 14 and 16 are NOT pile-up exceptions (0xB1 or below); only 04 is.
        self.assertLessEqual(in_window_max["14"], 0xB1)
        self.assertLessEqual(in_window_max["16"], 0xB1)
        self.assertGreater(in_window_max["04"], 0xB1)


class SingletonMaxSweepTests(unittest.TestCase):
    """Q1's other named sub-question: 'do other titles have ids whose high band ends in a
    once-only code?' Answer: yes, routinely -- a singleton max is the common case, not a
    signature unique to CoK's two exceptions, which undercuts using 'occurs once' alone as
    the explanation (see the doc)."""

    #: `{title: n_ids_with_a_singleton_section2_max}`, re-derived from the real disks.
    EXPECTED_SINGLETON_COUNTS = {
        "Buck Rogers - Countdown to Doomsday": 3,
        "Champions of Krynn": 10,
        "Curse of the Azure Bonds": 8,
        "Death Knights of Krynn": 2,
        "Gateway to the Savage Frontier": 8,
        "Pool of Radiance": 0,
        "Secret of the Silver Blades": 8,
    }

    def test_synthetic_singleton_max_detection(self) -> None:
        bodies = {
            # section2 = F0 81 82 82 -> band {0x81, 0x82}; max 0x82 occurs TWICE -> not singleton.
            "01": bytes([0x01, 0xF0, 0x81, 0x82, 0x82]),
            # section2 = F0 81 B1 -> max 0xB1 occurs ONCE -> singleton.
            "02": bytes([0x01, 0xF0, 0x81, 0xB1]),
        }
        self.assertEqual(wd.section2_singleton_max_ids(bodies), [("02", 0xB1)])

    def test_singleton_max_counts_per_title_all_seven(self) -> None:
        checked = 0
        for title, expected in self.EXPECTED_SINGLETON_COUNTS.items():
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            inv = wd.c64_walldef_inventory(path)
            with self.subTest(title=title):
                self.assertEqual(len(wd.section2_singleton_max_ids(inv)), expected)
        if checked < 7:
            self.skipTest("need all 7 C64 corpora")

    def test_cok_04_and_17_are_two_of_ten_singleton_ids_not_a_unique_pair(self) -> None:
        """The direct refutation of 'occurs once' as a standalone distinguishing signature:
        10 of CoK's 22 ids have a singleton max, including several (06, 09, 14) whose
        singleton max IS the title's own 0xB1 pile-up value -- an id piling up AT 177 with
        177 occurring only once is completely ordinary, not evidence of anything special."""
        if not COK_C64.exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        inv = wd.c64_walldef_inventory(COK_C64)
        singleton = dict(wd.section2_singleton_max_ids(inv))
        self.assertIn("04", singleton)
        self.assertIn("17", singleton)
        self.assertEqual(len(singleton), 10)
        # At least one CONFORMING id (max == 0xB1) is also a singleton -- 177 occurring once
        # is not itself unusual.
        self.assertTrue(any(v == 0xB1 for k, v in singleton.items() if k not in ("04", "17")))


class CrossSideDuplicateIdTests(unittest.TestCase):
    """The 'same id, copied wherever a later side needs it' phenomenon (distinct from
    `full_body_duplicate_groups`, which is different id NUMBERS sharing one body). Answers
    part of Q1 (id 17's own distinguishing feature) and grounds Q2's 'is duplication common
    outside Gateway' sweep."""

    def test_synthetic_cross_side_detection(self) -> None:
        files = [
            wd.C64WalldefFile("SideA.d64", "WALLDEF01", "01", b"\x01\x02", None),
            wd.C64WalldefFile("SideB.d64", "WALLDEF01", "01", b"\x01\x02", None),
            wd.C64WalldefFile("SideA.d64", "WALLDEF02", "02", b"\xaa", None),
        ]
        dup = wd.cross_side_duplicate_ids_from_files(files)
        self.assertEqual(dup, {"01": (["SideA.d64", "SideB.d64"], True)})

    def test_synthetic_cross_side_flags_a_byte_mismatch(self) -> None:
        """A same-named id present on 2 sides with DIFFERENT bytes is still reported (the
        second tuple element goes False) -- this corpus happens not to exercise that case for
        real (every real cross-side duplicate found is byte-identical), but the function must
        not silently assume identity."""
        files = [
            wd.C64WalldefFile("SideA.d64", "WALLDEF01", "01", b"\x01\x02", None),
            wd.C64WalldefFile("SideB.d64", "WALLDEF01", "01", b"\x03\x04", None),
        ]
        dup = wd.cross_side_duplicate_ids_from_files(files)
        self.assertEqual(dup, {"01": (["SideA.d64", "SideB.d64"], False)})

    def test_synthetic_cross_side_excludes_unread_files(self) -> None:
        files = [
            wd.C64WalldefFile("SideA.d64", "WALLDEF01", "01", b"", "read error"),
            wd.C64WalldefFile("SideB.d64", "WALLDEF01", "01", b"\x01", None),
        ]
        # Only one CLEAN read of id 01 -> not cross-side-duplicated (the errored copy is
        # excluded, not counted as a second side).
        self.assertEqual(wd.cross_side_duplicate_ids_from_files(files), {})

    def test_cok_id_17_is_the_ONLY_cross_side_duplicated_id(self) -> None:
        """Q1's own cross-reference: id 17 (one of the two pile-up exceptions) is the single
        CoK WALLDEF id whose body is copied byte-identically onto a second disk side (Side 2
        AND Side 5). All other 21 ids, including the OTHER exception (04), live on exactly
        one side. A real, measurable structural feature id 17 has and the other 21 lack --
        but it does not explain 04, so it only partially answers Q1."""
        if not COK_C64.exists():
            self.skipTest("Champions of Krynn C64 corpus not present")
        dup = wd.cross_side_duplicate_ids(COK_C64)
        self.assertEqual(
            dup,
            {
                "17": (
                    ["Champions of Krynn - Side 2.D64", "Champions of Krynn - Side 5.D64"],
                    True,
                )
            },
        )

    #: `{title: sorted list of cross-side-duplicated ids}`, re-derived from the real disks.
    EXPECTED_CROSS_SIDE = {
        "Buck Rogers - Countdown to Doomsday": ["04", "07"],
        "Champions of Krynn": ["17"],
        "Curse of the Azure Bonds": ["03", "08"],
        "Death Knights of Krynn": ["01", "02", "07"],
        "Gateway to the Savage Frontier": [
            "03", "04", "05", "07", "08", "09", "0C", "0F", "10", "1E", "1F", "24",
        ],
        "Pool of Radiance": ["01", "02", "03", "05", "09", "11", "14", "17"],
        "Secret of the Silver Blades": [],
    }

    def test_cross_side_duplication_is_common_not_gateway_specific(self) -> None:
        """Q2's own sweep, enumerated per rule 4: 6 of 7 titles have at least one WALLDEF id
        copied byte-identically onto a second disk side; only Secret of the Silver Blades has
        none. Every real cross-side duplicate found, in every title, is byte-identical (no
        title exercises the 'copied but diverged' case). This is the answer to 'is this
        common outside Gateway' -- yes, routinely, and it long predates the specific 1232-byte
        trio Q2 asks about."""
        checked = 0
        titles_with_dup = 0
        for title, expected_ids in self.EXPECTED_CROSS_SIDE.items():
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            dup = wd.cross_side_duplicate_ids(path)
            with self.subTest(title=title):
                self.assertEqual(sorted(dup), expected_ids)
                self.assertTrue(all(identical for _, identical in dup.values()))
            if dup:
                titles_with_dup += 1
        if checked < 7:
            self.skipTest("need all 7 C64 corpora")
        self.assertEqual(titles_with_dup, 6)


class FullBodyDuplicateGroupTests(unittest.TestCase):
    """The stronger, different phenomenon: DIFFERENT id numbers sharing one full byte-
    identical body. Generalises the doc's own `max_pairwise_lcp`-based Gateway finding, which
    only reports the single longest match and so missed Gateway's second (1221-byte) group."""

    def test_synthetic_grouping(self) -> None:
        bodies = {"01": b"AAAA", "02": b"BBBB", "03": b"AAAA", "04": b"CCCC", "05": b"BBBB"}
        self.assertEqual(wd.full_body_duplicate_groups(bodies), [["01", "03"], ["02", "05"]])

    def test_synthetic_no_groups(self) -> None:
        self.assertEqual(wd.full_body_duplicate_groups({"01": b"A", "02": b"B"}), [])

    def test_gateway_has_two_full_body_duplicate_groups_not_one(self) -> None:
        """The doc's S6.3 only names the 1232-byte `03`/`1F`/`1F.` trio (the pairwise-LCP
        MAXIMUM). A full sweep for ANY exact duplicate finds a second, shorter (1221-byte)
        group the LCP-max approach structurally cannot see: `02`/`1E`."""
        if not (C64_SETS / "Gateway to the Savage Frontier").exists():
            self.skipTest("Gateway to the Savage Frontier C64 corpus not present")
        inv = wd.c64_walldef_inventory(C64_SETS / "Gateway to the Savage Frontier")
        groups = wd.full_body_duplicate_groups(inv)
        self.assertEqual(groups, [["02", "1E"], ["03", "1F", "1F."]])
        self.assertEqual(len(inv["02"]), 1221)
        self.assertEqual(len(inv["03"]), 1232)

    def test_gateway_duplicates_are_full_wall_STYLE_clones_wallset_matches_too(self) -> None:
        """Both duplicate groups are byte-identical on WALLSET as well as WALLDEF -- a
        complete wall-style clone (glyphs + definitions), not merely a WALLDEF coincidence.
        Uses the new generic `c64_prg_inventory(dir, 'WALLSET')` rather than importing the
        sibling-owned `c64_wallset.py` module (see the module docstring's stated convention)."""
        if not (C64_SETS / "Gateway to the Savage Frontier").exists():
            self.skipTest("Gateway to the Savage Frontier C64 corpus not present")
        path = C64_SETS / "Gateway to the Savage Frontier"
        ws_inv = wd.c64_prg_inventory(path, "WALLSET")
        for group in ([("02", "1E"), ("03", "1F", "1F.")]):
            bodies = [ws_inv[s] for s in group]
            with self.subTest(group=group):
                self.assertTrue(all(b == bodies[0] for b in bodies))
                self.assertEqual(len(bodies[0]), 400)  # 50 glyphs, ordinary WALLSET size

    #: `{title: full_body_duplicate_groups}`, re-derived from the real disks 2026-08-13.
    EXPECTED_FULL_BODY_GROUPS = {
        "Buck Rogers - Countdown to Doomsday": [],
        "Champions of Krynn": [],
        "Curse of the Azure Bonds": [],
        "Death Knights of Krynn": [],
        "Gateway to the Savage Frontier": [["02", "1E"], ["03", "1F", "1F."]],
        "Pool of Radiance": [],
        "Secret of the Silver Blades": [],
    }

    def test_full_body_duplication_is_gateway_only_among_all_seven_titles(self) -> None:
        """Enumerated per rule 4: all 7 titles checked, real full-body cross-ID duplication
        (as opposed to the much more common same-id cross-side copy above) exists ONLY in
        Gateway, and there it is 2 groups / 5 of 14 ids, not 1 group / 3 ids as the doc's
        LCP-max framing alone would suggest."""
        checked = 0
        for title, expected in self.EXPECTED_FULL_BODY_GROUPS.items():
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            inv = wd.c64_walldef_inventory(path)
            with self.subTest(title=title):
                self.assertEqual(wd.full_body_duplicate_groups(inv), expected)
        if checked < 7:
            self.skipTest("need all 7 C64 corpora")


class GatewayGeoLayoutTests(unittest.TestCase):
    """Verifies the Gateway 8-side WALLDEF/GEO layout directly (the task's mandatory
    re-derivation step) and tests the sharper hypothesis it supports: `1F`/`1F.`/`24` are the
    only WALLDEF ids with no same-numbered GEO file ANYWHERE on the title, not merely absent
    from one side -- correcting the task brief's own 'Side 4 has no GEO file at all' claim,
    which is false as stated (Side 4 ships 4 GEO files; just none named GEO1F)."""

    def _gw(self) -> Path:
        path = C64_SETS / "Gateway to the Savage Frontier"
        if not path.exists():
            self.skipTest("Gateway to the Savage Frontier C64 corpus not present")
        return path

    def test_side4_does_ship_geo_files_the_briefs_premise_is_wrong(self) -> None:
        """Direct refutation of a specific claim in the task brief. Side 4 hosts
        WALLDEF1F/WALLDEF1F. and 4 real GEO files -- just none named GEO1F."""
        geo = wd.geo_ids_present(self._gw())
        side4 = next(disk for disk in geo if "Side 4" in disk)
        self.assertEqual(sorted(geo[side4]), ["08", "0B", "0C", "0D"])
        self.assertNotIn("1F", geo[side4])

    def test_geo03_and_walldef03_are_never_on_the_same_side(self) -> None:
        """The naive 'WALLDEF id N belongs to area GEO0N' reading, tested at the disk-
        co-location level: GEO03 (Side 2 only) and WALLDEF03 (Sides 1 and 3) never share a
        side. Confirms the task brief's own stated contradiction from real bytes."""
        gw = self._gw()
        geo = wd.geo_ids_present(gw)
        wd_sides = {
            f.suffix: f.disk for f in wd.iter_c64_walldef_files(gw) if f.problem is None
        }
        geo03_sides = {disk for disk, ids in geo.items() if "03" in ids}
        walldef03_sides = {f.disk for f in wd.iter_c64_walldef_files(gw) if f.suffix == "03"}
        self.assertEqual(geo03_sides, {"Gateway to the Savage Frontier - Side 2.D64"})
        self.assertEqual(
            walldef03_sides,
            {
                "Gateway to the Savage Frontier - Side 1.D64",
                "Gateway to the Savage Frontier - Side 3.D64",
            },
        )
        self.assertEqual(geo03_sides & walldef03_sides, set())

    def test_1f_and_1f_dot_and_24_are_the_only_ids_with_no_matching_geo_anywhere(self) -> None:
        """The sharper, title-wide (not side-local) discriminator: of Gateway's 14 WALLDEF
        ids, exactly 3 have no same-numbered GEO file on ANY of the 8 sides. 24 (also
        duplicated across 4 sides, per CrossSideDuplicateIdTests) shares this same signature,
        strengthening the 'area-less generic style id' reading beyond just 1F/1F."""
        gw = self._gw()
        no_match = wd.walldef_ids_without_matching_geo(gw)
        self.assertEqual(sorted(no_match), ["1F", "1F.", "24"])
        universe = wd.geo_id_universe(gw)
        inv = wd.c64_walldef_inventory(gw)
        matched = sorted(sid for sid in inv if sid in universe)
        self.assertEqual(len(matched), 11)
        self.assertEqual(len(no_match) + len(matched), len(inv))

    def test_geo_id_universe_is_a_pure_union_of_geo_ids_present(self) -> None:
        """Synthetic test of the set-algebra half of `geo_id_universe` without touching a real
        disk image, via monkeypatching `geo_ids_present` (restored in `finally`)."""
        original = wd.geo_ids_present
        wd.geo_ids_present = lambda _title_dir: {"SideA": {"01", "02"}, "SideB": {"02", "03"}}
        try:
            self.assertEqual(wd.geo_id_universe("unused"), {"01", "02", "03"})
        finally:
            wd.geo_ids_present = original

    def test_geo_universe_has_29_distinct_ids_across_8_sides(self) -> None:
        """Sanity pin for `geo_id_universe`'s own population size, so a future change to the
        GEO-reading logic cannot silently shrink the population the 'no match' claim above is
        scored against without a test noticing."""
        universe = wd.geo_id_universe(self._gw())
        self.assertEqual(len(universe), 29)


class DotSuffixSweepTests(unittest.TestCase):
    """Q2's 'copy vs revision' question. Sweeps ALL PRG names (not just WALLDEF/WALLSET) on
    all 7 titles for a trailing literal '.' -- exactly 2 exist in the whole corpus, only one
    of which is wall-family, and it is byte-identical to its non-dot counterpart."""

    #: `{title: sorted dot-suffixed PRG names}`, re-derived from the real disks.
    EXPECTED_DOT_NAMES = {
        "Buck Rogers - Countdown to Doomsday": ["SAVEBUCK."],
        "Champions of Krynn": [],
        "Curse of the Azure Bonds": [],
        "Death Knights of Krynn": [],
        "Gateway to the Savage Frontier": ["WALLDEF1F.", "WALLSET1F."],
        "Pool of Radiance": [],
        "Secret of the Silver Blades": [],
    }

    def test_dot_suffixed_names_across_all_seven_titles(self) -> None:
        checked = 0
        for title, expected in self.EXPECTED_DOT_NAMES.items():
            path = C64_SETS / title
            if not path.exists():
                continue
            checked += 1
            with self.subTest(title=title):
                self.assertEqual(sorted(wd.dot_suffixed_prg_names(path)), expected)
        if checked < 7:
            self.skipTest("need all 7 C64 corpora")

    def test_the_only_wall_family_dot_pair_is_a_copy_not_a_revision(self) -> None:
        """The one comparable case in the whole corpus: WALLDEF1F./WALLSET1F. are byte-
        identical to WALLDEF1F/WALLSET1F (already established by
        FullBodyDuplicateGroupTests), consistent with 'copy', not 'revision'. Honest caveat,
        stated as a test-level fact, not just prose: this is N=1 -- SAVEBUCK. (Buck Rogers) is
        an unrelated save-file placeholder with no non-dot counterpart to compare, so no
        SECOND wall-family dot-pair exists anywhere in this corpus to check whether a
        revision-vs-copy split ever actually occurs."""
        if not (C64_SETS / "Gateway to the Savage Frontier").exists():
            self.skipTest("Gateway to the Savage Frontier C64 corpus not present")
        gw = C64_SETS / "Gateway to the Savage Frontier"
        inv = wd.c64_walldef_inventory(gw)
        self.assertEqual(inv["1F"], inv["1F."])
        ws_inv = wd.c64_prg_inventory(gw, "WALLSET")
        self.assertEqual(ws_inv["1F"], ws_inv["1F."])
        # The only other dot-suffixed name in the whole 7-title corpus:
        buck = C64_SETS / "Buck Rogers - Countdown to Doomsday"
        if buck.exists():
            buck_dots = wd.dot_suffixed_prg_names(buck)
            self.assertEqual(buck_dots, {"SAVEBUCK."})
            self.assertNotIn("SAVEBUCK", buck_dots)  # no non-dot counterpart exists to compare


# ---------------------------------------------------------------------------------------
# Round 8 (2026-08-13): the ESCAPE TAXONOMY -- is gap==4 (width 4) the only structured
# escape class? See docs/engine/research/c64-walldef-format.md S9.
# ---------------------------------------------------------------------------------------


class EscapeTaxonomyPrimitiveTests(unittest.TestCase):
    """Synthetic unit tests of the width-general escape instrument. No corpus needed."""

    # F0 at 0, 2, 6, 7, 13 -> widths 2, 4, 1?? no: 2-0=2, 6-2=4, 7-6=1 is impossible
    # (adjacent escapes), so the fixture below uses 0, 2, 6, 12.
    FIXTURE = bytes(
        [0xF0, 0x0B,                          # width 2, payload [0b]
         0xF0, 0x82, 0x0C, 0x83,              # width 4, payload [82 0c 83]
         0xF0, 0x91, 0x09, 0x01, 0x0B, 0x85,  # width 6, payload [91 09 01 0b 85]
         0xF0]                                # final escape: no successor, excluded
    )

    def test_escape_positions_and_widths(self) -> None:
        self.assertEqual(wd.escape_positions(self.FIXTURE), [0, 2, 6, 12])
        self.assertEqual(wd.escape_widths(self.FIXTURE), [2, 4, 6])

    def test_escape_widths_excludes_the_final_escape(self) -> None:
        """Four escapes -> three widths, never four (the same exclusion
        `f0_operand_gap_pairs` makes; measuring the last escape against 'distance to body
        end' is what produced round 6's absurd 1000+ outliers)."""
        self.assertEqual(len(wd.escape_positions(self.FIXTURE)), 4)
        self.assertEqual(len(wd.escape_widths(self.FIXTURE)), 3)

    def test_escape_widths_is_gap_plus_one(self) -> None:
        """The two conventions in the doc, pinned against each other so they cannot drift:
        `escape_widths` reports escape-to-escape DISTANCE, `f0_operand_gap_pairs` reports the
        byte count strictly BETWEEN. width == gap + 1, always."""
        gaps = [g for _, g in wd.f0_operand_gap_pairs(self.FIXTURE)]
        self.assertEqual(wd.escape_widths(self.FIXTURE), [g + 1 for g in gaps])

    def test_escape_records_keeps_the_whole_payload(self) -> None:
        recs = wd.escape_records(self.FIXTURE, 6)
        self.assertEqual(recs, [wd.EscapeRecord(6, bytes([0x91, 0x09, 0x01, 0x0B, 0x85]))])
        self.assertEqual(recs[0].width, 6)
        self.assertEqual(wd.escape_records(self.FIXTURE, 4),
                         [wd.EscapeRecord(2, bytes([0x82, 0x0C, 0x83]))])
        self.assertEqual(wd.escape_records(self.FIXTURE, 5), [])

    def test_escape_records_rejects_a_degenerate_width(self) -> None:
        with self.assertRaises(ValueError):
            wd.escape_records(self.FIXTURE, 1)

    def test_escape_records_requires_true_adjacency(self) -> None:
        """`body[p + width] == sentinel` (offset arithmetic, no positions list) would report a
        spurious record here: escapes sit at 0, 2 and 6, so offset 0+6 IS a sentinel, but the
        escape at 2 lies strictly between -- 0 and 6 are not CONSECUTIVE."""
        body = bytes([0xF0, 0x01, 0xF0, 0xAA, 0xBB, 0xCC, 0xF0])
        self.assertEqual(wd.escape_records(body, 6), [])
        self.assertEqual(wd.escape_records(body, 4), [wd.EscapeRecord(2, bytes([0xAA, 0xBB, 0xCC]))])

    def test_payload_class_purity_synthetic(self) -> None:
        recs = [wd.EscapeRecord(0, bytes([0x82, 0x0B, 0x40])),
                wd.EscapeRecord(4, bytes([0x01, 0xFF, 0x00]))]
        total, inside, other = wd.payload_class_purity(recs)
        self.assertEqual((total, inside), (6, 4))
        self.assertEqual(other, _collections.Counter({0x40: 1, 0x00: 1}))

    def test_slot_permutation_null_expectation_is_exact_and_slot_independent(self) -> None:
        """The closed-form null: mean over records of (in-band bytes)/(payload length). It
        cannot depend on the slot -- that is precisely what makes it the right null for a
        claim ABOUT a slot."""
        recs = [wd.EscapeRecord(0, bytes([0x82, 0x0B, 0x83])),   # 1 of 3 in band
                wd.EscapeRecord(4, bytes([0x09, 0x0A, 0x83]))]   # 2 of 3 in band
        exp = wd.slot_permutation_null_expectation(recs, 0x01, 0x0F)
        self.assertAlmostEqual(exp, 0.5)  # (1/3 + 2/3) / 2

    def test_slot_permutation_null_sampler_tracks_its_own_closed_form(self) -> None:
        recs = [wd.EscapeRecord(i, bytes([0x82, 0x0B, 0x83])) for i in range(200)]
        exp = wd.slot_permutation_null_expectation(recs, 0x01, 0x0F)
        self.assertAlmostEqual(exp, 1 / 3)
        for slot in range(3):
            m, c = wd.slot_permutation_null(recs, slot, random.Random(NULL_SEED),
                                            lo=0x01, hi=0x0F)
            self.assertAlmostEqual(m / c, exp, delta=0.03)

    def test_the_nulls_ceiling_is_L_so_the_2x_bar_is_not_width_neutral(self) -> None:
        """A perfectly slot-locked field scores real = 1.0 and null = 1/L, i.e. ratio ~= L =
        width - 1. So ">= 2x over the null" is UNREACHABLE at width 2 (L == 1: the permutation
        is the identity and the ratio is identically 1.00) and only barely reachable at width
        3. This is an analysis-instrument edge, and it is asserted here rather than left as
        prose because it changes how a width-2 or width-3 result must be read."""
        for L in (1, 2, 3, 5):
            recs = [wd.EscapeRecord(i, bytes([0x0B] + [0x82] * (L - 1))) for i in range(100)]
            real = wd.slot_band_count(recs, 0, 0x01, 0x0F)[0] / len(recs)
            null = wd.slot_permutation_null_expectation(recs, 0x01, 0x0F)
            self.assertEqual(real, 1.0)
            self.assertAlmostEqual(null, 1 / L)
            self.assertAlmostEqual(real / null, L)
        # width 2 (L == 1): the sampled null is EXACTLY the real rate, not merely close.
        recs2 = [wd.EscapeRecord(i, bytes([0x0B])) for i in range(50)]
        m, c = wd.slot_permutation_null(recs2, 0, random.Random(NULL_SEED), lo=0x01, hi=0x0F)
        self.assertEqual(m / c, 1.0)

    def test_best_band_for_slot_synthetic(self) -> None:
        """Finds the single-value band that maximises real/null, and honours min_coverage."""
        recs = ([wd.EscapeRecord(i, bytes([0x02, 0x82, 0x83])) for i in range(90)] +
                [wd.EscapeRecord(i, bytes([0x07, 0x82, 0x83])) for i in range(10)])
        got = wd.best_band_for_slot(recs, 0, max_band_width=16, min_coverage=0.5)
        self.assertIsNotNone(got)
        lo, hi, real, null = got
        self.assertEqual((lo, hi), (0x02, 0x02))
        self.assertAlmostEqual(real, 0.90)
        self.assertAlmostEqual(null, 0.30)
        # No band covers >= 0.99 of slot 0, so a stricter coverage floor finds nothing.
        self.assertIsNone(wd.best_band_for_slot(recs, 0, max_band_width=1, min_coverage=0.99))

    def test_op1_width_modal_map_and_null_synthetic(self) -> None:
        # 0x91 is deliberately NOT unanimous (7x width 6, 3x width 11): a synthetic where
        # every op1 maps to exactly one width cannot tell "most common" from "least common",
        # and a mutation swapping the two would pass it silently.
        pairs = ([(0xB1, 4)] * 10 + [(0x91, 6)] * 7 + [(0x91, 11)] * 3 + [(0x02, 3)] * 10)
        modal = wd.op1_width_modal_map(pairs)
        self.assertEqual(modal, {0xB1: 4, 0x91: 6, 0x02: 3})
        self.assertAlmostEqual(wd.op1_width_modal_accuracy(pairs, modal, 3), 27 / 30)
        # The pairing-permutation null destroys the association and only that: with 3 equally
        # sized op1 classes it should land near 1/3.
        null = wd.op1_width_pairing_null(pairs, modal, 3, random.Random(NULL_SEED), trials=50)
        self.assertGreater(null, 0.20)
        self.assertLess(null, 0.47)
        self.assertGreater((27 / 30) / null, 2.0)


class EscapeTaxonomyCorpusTests(unittest.TestCase):
    """The round-8 claim, measured on real bytes across ALL SEVEN titles.

    CLAIM UNDER TEST: at least one escape class other than width 4 (round 7's "gap==4")
    carries a payload slot whose values cluster in a narrow band >= 2x over its own
    slot-permutation null in >= 4 of the 6 titles that contain any 0xF0.

    NULL (stated before any statistic): `slot_permutation_null` -- every real record held
    fixed (same escape positions, same payload byte values), only WHICH payload byte lands in
    the slot under test is permuted. Destroys the slot-to-value association and nothing else.

    FAMILY actually searched to find the bands below: widths {2..8} x their slots = 28 cells,
    x 3976 contiguous bands of width <= 16 = 111,328 (cell, band) combinations. Each band was
    selected by LEAVE-ONE-TITLE-OUT (chosen on the other five titles, scored on the held-out
    one), so no per-title figure asserted here was selected on its own bytes.

    ROUND 9 CORRECTIONS to this docstring, all of which were stale copies of numbers the doc
    itself had already fixed or that round 9 re-derived:
      * The Poisson-binomial tail is NOT "< 1e-110 for every headline cell" -- that was
        generalised from the twelve cells computed at the time. Running the other three
        refuted it: width 5 slot 1 = 2.04e-54, width 5 slot 2 = 3.16e-63, width 8 slot 2 =
        1.95e-56. The WEAKEST cell is 2.04e-54, which still clears Bonferroni against the
        111,328 family (4.49e-07) by forty-odd orders of magnitude, so the conclusion stands.
      * A true per-fold LOO runs the search once per held-out title, so its family is 6 x
        111,328 = 667,968 (alpha 7.49e-08); the weakest cell survives that too
        (2.04e-54 x 667,968 = 1.36e-48).
      * The published per-title table is FROZEN-BAND, not per-fold LOO -- see
        `test_the_published_table_is_frozen_band_not_per_fold_leave_one_out`.
      * Ratios from `slot_permutation_null` are seed-dependent to 15-28% of their mean; the
        seed-free closed-form range is 2.200x-6.276x. See
        `test_the_quoted_ratio_range_is_a_single_seed_artifact_at_both_ends`.
    """

    #: `{title: {width: n_non_final_escape_pairs}}` for widths 2..8, plus the title total.
    #: Re-derived from the real disks with `escape_width_histogram`.
    EXPECTED_WIDTHS = {
        "Buck Rogers - Countdown to Doomsday": ({2: 74, 3: 237, 4: 238, 5: 49, 6: 85, 7: 49, 8: 35}, 977),
        "Champions of Krynn": ({2: 71, 3: 280, 4: 215, 5: 101, 6: 110, 7: 52, 8: 75}, 1166),
        "Curse of the Azure Bonds": ({2: 67, 3: 241, 4: 192, 5: 74, 6: 92, 7: 43, 8: 52}, 1020),
        "Death Knights of Krynn": ({2: 87, 3: 261, 4: 257, 5: 67, 6: 84, 7: 42, 8: 49}, 1148),
        "Gateway to the Savage Frontier": ({2: 41, 3: 170, 4: 102, 5: 59, 6: 49, 7: 31, 8: 35}, 706),
        "Secret of the Silver Blades": ({2: 60, 3: 237, 4: 157, 5: 70, 6: 76, 7: 42, 8: 48}, 954),
        "Pool of Radiance": ({2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0}, 0),
    }

    #: `(width, slot, lo, hi)` for the 15 headline cells. Every band here was chosen by the
    #: leave-one-title-out search described in the class docstring.
    HEADLINE_CELLS = [
        (4, 1, 0x06, 0x0C), (4, 2, 0x83, 0x88),
        (5, 0, 0x02, 0x02), (5, 1, 0x0B, 0x0E), (5, 2, 0x06, 0x0A), (5, 3, 0x82, 0x88),
        (6, 0, 0x89, 0x91), (6, 2, 0x01, 0x01), (6, 4, 0x83, 0x85),
        (7, 0, 0x89, 0x90), (7, 2, 0x02, 0x02), (7, 5, 0x83, 0x87),
        (8, 0, 0x87, 0x8F), (8, 2, 0x01, 0x08), (8, 6, 0x83, 0x85),
    ]

    def _all_seven(self) -> dict[str, dict[str, bytes]]:
        missing = [t for t in SEVEN_TITLES if not (C64_SETS / t).exists()]
        if missing:
            self.skipTest(f"need all 7 C64 corpora, missing {missing}")
        return {t: wd.c64_walldef_inventory(C64_SETS / t) for t in SEVEN_TITLES}

    def _six(self) -> dict[str, dict[str, bytes]]:
        missing = [t for t in ALL_TITLES if not (C64_SETS / t).exists()]
        if missing:
            self.skipTest(f"need all 6 non-Pool C64 corpora, missing {missing}")
        return {t: wd.c64_walldef_inventory(C64_SETS / t) for t in ALL_TITLES}

    def test_escape_width_histogram_all_seven_titles(self) -> None:
        """Step 1 of the round: the gap histogram itself, per title, all 7 checked.

        Pool of Radiance is asserted EXPLICITLY at zero rather than being allowed to fall out
        of the loop: 'checked and found empty' and 'not checked' are different facts, and a
        loop that silently skips a title reads as PASS."""
        invs = self._all_seven()
        titles_checked = 0
        bodies_checked = 0
        pooled: _collections.Counter = _collections.Counter()
        for title in SEVEN_TITLES:
            titles_checked += 1
            bodies_checked += len(invs[title])
            hist = wd.escape_width_histogram(invs[title])
            pooled.update(hist)
            expected, total = self.EXPECTED_WIDTHS[title]
            with self.subTest(title=title):
                self.assertEqual({w: hist.get(w, 0) for w in range(2, 9)}, expected)
                self.assertEqual(sum(hist.values()), total)
        self.assertEqual(titles_checked, 7)
        self.assertEqual(bodies_checked, 101)
        self.assertEqual(sum(pooled.values()), 5971)
        # Width 3 is the MODE, not width 4 -- round 7's gap==4 is only the second commonest
        # escape class (1161 of 5971 = 19.4%), which is the whole reason this round exists.
        self.assertEqual(pooled.most_common(1)[0], (3, 1426))
        self.assertEqual(pooled[4], 1161)

    def test_pool_of_radiance_has_no_escapes_at_all(self) -> None:
        """The explicit zero, asserted on the raw bytes rather than inferred from an empty
        histogram: no Pool of Radiance WALLDEF body contains a single 0xF0."""
        path = C64_SETS / "Pool of Radiance"
        if not path.exists():
            self.skipTest("Pool of Radiance C64 corpus not present")
        inv = wd.c64_walldef_inventory(path)
        self.assertEqual(len(inv), 18)
        bodies = 0
        for body in inv.values():
            bodies += 1
            self.assertEqual(body.count(0xF0), 0)
        self.assertEqual(bodies, 18)
        self.assertEqual(wd.escape_width_histogram(inv), _collections.Counter())

    def test_escape_records_agrees_with_gap4_records_at_width_4(self) -> None:
        """`escape_records` is the width-general replacement for round 7's `gap4_records`;
        at width 4 the two must be identical on every real body, or round 7's numbers and
        round 8's are not comparable."""
        invs = self._all_seven()
        compared = 0
        for title in SEVEN_TITLES:
            for sid, body in invs[title].items():
                old = wd.gap4_records(body)
                new = wd.escape_records(body, 4)
                self.assertEqual(len(old), len(new), f"{title}/{sid}")
                for a, b in zip(old, new):
                    compared += 1
                    self.assertEqual((a.pos, a.byte1, a.byte2, a.byte3),
                                     (b.pos, b.payload[0], b.payload[1], b.payload[2]))
        self.assertEqual(compared, 1161)

    def test_width_2_ratio_is_pinned_at_1_by_construction(self) -> None:
        """The instrument's own edge, measured on real data: at width 2 the payload is one
        byte, so permuting it is the identity and the null EQUALS the real rate exactly. Any
        width-2 'result' from this null is uninterpretable -- reported so nobody quotes the
        98% nibble rate at width 2 as if it had cleared a null."""
        invs = self._six()
        checked = 0
        for title in ALL_TITLES:
            recs = wd.title_escape_records(invs[title], 2)
            self.assertGreater(len(recs), 30)
            checked += 1
            hits, total = wd.slot_band_count(recs, 0, 0x01, 0x0F)
            m, c = wd.slot_permutation_null(recs, 0, random.Random(NULL_SEED), lo=0x01, hi=0x0F)
            with self.subTest(title=title):
                self.assertEqual(m / c, hits / total)
        self.assertEqual(checked, 6)

    def test_width5_slot0_is_the_single_literal_byte_0x02(self) -> None:
        """THE CLAIM, in its cleanest form. Width-5 records' FIRST payload byte is literally
        0x02 in 381 of 420 pooled records, 85%-96% per title, at 3.29x-3.84x its own
        slot-permutation null in all 6 titles.

        Band-edge audit (rule 1, and the check this doc has failed three times): the band is a
        SINGLE value, and both immediate neighbours are EMPTY -- 0x01 occurs 0 times and 0x03
        occurs 0 times in this slot corpus-wide. So there is no window edge cutting live data
        here; the result does not depend on where a boundary was drawn."""
        invs = self._six()
        pooled: list[wd.EscapeRecord] = []
        checked = 0
        for title in ALL_TITLES:
            recs = wd.title_escape_records(invs[title], 5)
            pooled += recs
            checked += 1
            hits, total = wd.slot_band_count(recs, 0, 0x02, 0x02)
            m, c = wd.slot_permutation_null(recs, 0, random.Random(NULL_SEED), lo=0x02, hi=0x02)
            with self.subTest(title=title):
                self.assertGreater(hits / total, 0.85)
                self.assertGreater((hits / total) / (m / c), 3.2)
        self.assertEqual(checked, 6)
        self.assertEqual(len(pooled), 420)
        hist = _collections.Counter(r.payload[0] for r in pooled)
        self.assertEqual(hist[0x02], 381)
        self.assertEqual(hist[0x01], 0, "band's low neighbour must be empty")
        self.assertEqual(hist[0x03], 0, "band's high neighbour must be empty")

    def test_width7_slot2_is_the_single_literal_byte_0x02(self) -> None:
        """The second clean single-value field, in a different escape class: width-7 records'
        THIRD payload byte is 0x02 in 234 of 259 pooled records (83.7%-95.2% per title), at
        4.91x-6.00x its own null in all 6 titles. Both band neighbours are again empty
        (0x01: 0 records, 0x03: 0 records) -- an edge-independent claim."""
        invs = self._six()
        pooled: list[wd.EscapeRecord] = []
        checked = 0
        for title in ALL_TITLES:
            recs = wd.title_escape_records(invs[title], 7)
            pooled += recs
            checked += 1
            hits, total = wd.slot_band_count(recs, 2, 0x02, 0x02)
            m, c = wd.slot_permutation_null(recs, 2, random.Random(NULL_SEED), lo=0x02, hi=0x02)
            with self.subTest(title=title):
                self.assertGreater(hits / total, 0.83)
                self.assertGreater((hits / total) / (m / c), 4.5)
        self.assertEqual(checked, 6)
        self.assertEqual(len(pooled), 259)
        hist = _collections.Counter(r.payload[2] for r in pooled)
        self.assertEqual(hist[0x02], 234)
        self.assertEqual(hist[0x01], 0)
        self.assertEqual(hist[0x03], 0)

    def test_every_headline_cell_clears_2x_in_all_six_titles(self) -> None:
        """The claim's own bar was '>= 2x in >= 4 of the 6 titles'. All 15 headline cells
        clear it in 6 of 6, and 13 of the 15 belong to escape classes OTHER than width 4."""
        invs = self._six()
        cells_checked = 0
        non_width4 = 0
        for width, slot, lo, hi in self.HEADLINE_CELLS:
            cells_checked += 1
            if width != 4:
                non_width4 += 1
            n_clear = 0
            titles_scored = 0
            for title in ALL_TITLES:
                recs = wd.title_escape_records(invs[title], width)
                self.assertGreaterEqual(len(recs), 30, f"{title} w={width}")
                titles_scored += 1
                hits, total = wd.slot_band_count(recs, slot, lo, hi)
                m, c = wd.slot_permutation_null(recs, slot, random.Random(NULL_SEED),
                                                lo=lo, hi=hi)
                if (hits / total) / (m / c) >= 2.0:
                    n_clear += 1
            with self.subTest(width=width, slot=slot):
                self.assertEqual(titles_scored, 6)
                self.assertEqual(n_clear, 6)
        self.assertEqual(cells_checked, 15)
        self.assertEqual(non_width4, 13)

    def test_the_quoted_ratio_range_is_a_single_seed_artifact_at_both_ends(self) -> None:
        """Round 9 correction. The doc quoted '2.25x-7.13x'. Neither endpoint is a property
        of the data: both are where ONE null seed happened to land.

        `slot_permutation_null` SAMPLES the permutation null, so every quoted ratio carries
        RNG noise. `slot_permutation_null_expectation` is the same null in closed form. Over
        the 90 folds the closed-form range is 2.200x-6.276x -- the seed-free answer -- while
        the seed-20260813 sampled range is 2.123x-7.134x, i.e. the published upper bound is
        the sampled maximum, roughly 0.86x above the closed-form value for that cell.

        Both ranges are pinned so neither can be quoted as the other again."""
        invs = self._six()
        analytic = []
        sampled = []
        for width, slot, lo, hi in self.HEADLINE_CELLS:
            for title in ALL_TITLES:
                recs = wd.title_escape_records(invs[title], width)
                hits, total = wd.slot_band_count(recs, slot, lo, hi)
                real = hits / total
                analytic.append((real / wd.slot_permutation_null_expectation(recs, lo, hi),
                                 width, slot, title))
                m, c = wd.slot_permutation_null(recs, slot, random.Random(NULL_SEED),
                                                lo=lo, hi=hi)
                sampled.append((real / (m / c), width, slot, title))
        self.assertEqual(len(analytic), 90)
        self.assertEqual(len(sampled), 90)

        analytic.sort()
        sampled.sort()
        # Seed-free range, and WHICH fold sits at each end (they are different folds from
        # the sampled range's -- another reason the two must not be conflated).
        self.assertAlmostEqual(analytic[0][0], 2.200, places=2)
        self.assertEqual(analytic[0][1:], (5, 2, "Champions of Krynn"))
        self.assertAlmostEqual(analytic[-1][0], 6.276, places=2)
        self.assertEqual(analytic[-1][1:], (8, 0, "Buck Rogers - Countdown to Doomsday"))
        # Single-seed range as actually published.
        self.assertAlmostEqual(sampled[0][0], 2.123, places=2)
        self.assertEqual(sampled[0][1:], (5, 1, "Death Knights of Krynn"))
        self.assertAlmostEqual(sampled[-1][0], 7.134, places=2)
        self.assertEqual(sampled[-1][1:], (8, 0, "Champions of Krynn"))
        # The doc's old lower bound matched NEITHER derivation.
        self.assertLess(sampled[0][0], 2.25)
        self.assertLess(analytic[0][0], 2.25)
        # The load-bearing claim is unaffected by which null is used.
        self.assertGreaterEqual(analytic[0][0], 2.0)
        self.assertGreaterEqual(sampled[0][0], 2.0)

    def test_the_2x_claim_survives_every_null_seed_not_just_the_pinned_one(self) -> None:
        """The claim '>= 2x in 6 of 6' is asserted elsewhere at ONE seed, which is exactly the
        weakness the test above exposes. So stress the single weakest fold -- width 5 slot 2 /
        Champions of Krynn, the closed-form minimum -- across 40 seeds. If the headline claim
        were seed-luck, this is where it would break first."""
        invs = self._six()
        recs = wd.title_escape_records(invs["Champions of Krynn"], 5)
        hits, total = wd.slot_band_count(recs, 2, 0x06, 0x0A)
        real = hits / total
        ratios = [real / (lambda mc: mc[0] / mc[1])(
            wd.slot_permutation_null(recs, 2, random.Random(seed), lo=0x06, hi=0x0A))
            for seed in range(20260800, 20260840)]
        self.assertEqual(len(ratios), 40)
        self.assertEqual([r for r in ratios if r < 2.0], [],
                         "the weakest headline fold drops below 2x under some null seed")
        # Pin the spread too: it is ~14% of the mean, so the doc's 2-decimal ratios are not
        # stable digits and must not be re-quoted to that precision.
        self.assertAlmostEqual(min(ratios), 2.060, places=2)
        self.assertAlmostEqual(max(ratios), 2.345, places=2)

    def test_the_published_table_is_frozen_band_not_per_fold_leave_one_out(self) -> None:
        """Round 9 correction to 9.3's caption. The table says its ratios are scored on the
        held-out title with bands 'chosen leave-one-title-out', but the numbers are computed
        against ONE frozen band per cell (`HEADLINE_CELLS`). Re-running a true per-fold LOO --
        band re-chosen on the other five titles for every held-out title -- the band differs
        in 8 of 90 folds and moves three published values.

        The claim survives (every true-LOO fold is still >= 2x); the caption was the defect."""
        invs = self._six()
        recs_by = {(t, w): wd.title_escape_records(invs[t], w)
                   for t in ALL_TITLES for w in range(4, 9)}
        differing = []
        loo_ratios = {}
        for width, slot, flo, fhi in self.HEADLINE_CELLS:
            for held in ALL_TITLES:
                train = [r for t in ALL_TITLES if t != held for r in recs_by[(t, width)]]
                got = wd.best_band_for_slot(train, slot)
                self.assertIsNotNone(got, f"w{width} s{slot} holding out {held}")
                lo, hi = got[0], got[1]
                test = recs_by[(held, width)]
                hits, total = wd.slot_band_count(test, slot, lo, hi)
                m, c = wd.slot_permutation_null(test, slot, random.Random(NULL_SEED),
                                                lo=lo, hi=hi)
                ratio = (hits / total) / (m / c)
                loo_ratios[(width, slot, held)] = ratio
                if (lo, hi) != (flo, fhi):
                    differing.append((width, slot, held, (flo, fhi), (lo, hi)))
                self.assertGreaterEqual(
                    ratio, 2.0, f"true-LOO w{width} s{slot} / {held} fell below 2x")

        self.assertEqual(len(loo_ratios), 90)
        self.assertEqual(len(differing), 8, "the LOO/frozen band disagreement changed")
        self.assertEqual(
            sorted({(w, s) for w, s, _, _, _ in differing}),
            [(4, 1), (4, 2), (5, 1), (5, 3), (7, 0), (8, 2), (8, 6)],
            "which cells are band-unstable under LOO changed")
        # The three published values that a true LOO actually moves.
        self.assertAlmostEqual(loo_ratios[(5, 1, "Secret of the Silver Blades")], 2.46, places=2)
        self.assertAlmostEqual(loo_ratios[(8, 2, "Champions of Krynn")], 3.08, places=2)
        self.assertAlmostEqual(
            loo_ratios[(8, 2, "Buck Rogers - Countdown to Doomsday")], 2.50, places=2)

    def test_best_band_for_slot_rediscovers_the_width7_field_on_real_bytes(self) -> None:
        """The search instrument, run on real data, independently returns the single-value
        band the headline cell asserts -- so that band is not a hand-picked window."""
        invs = self._six()
        recs = [r for t in ALL_TITLES for r in wd.title_escape_records(invs[t], 7)]
        got = wd.best_band_for_slot(recs, 2)
        self.assertIsNotNone(got)
        self.assertEqual(got[:2], (0x02, 0x02))

    def test_max_ratio_bands_can_exclude_a_slots_own_modal_value(self) -> None:
        """An honest caveat about the search, asserted rather than left as prose: maximising
        real/null can push the chosen band OFF the slot's most common value. So a selected band
        is not a field's range.

        CORRECTED 2026-08-13, two ways. (a) The final assertion here was `assertLess(0x82, 0x83)`
        -- a comparison of two literals, which cannot go red under ANY mutation of the code under
        test. It is replaced by one that reads the band from `HEADLINE_CELLS` and checks the
        exclusion for real. (b) The caveat named ONE cell; sweeping all 15 finds **two**. Width-8
        slot 2's band [0x01,0x08] also excludes 0x82, that slot's commonest value at 81 of 294 --
        undisclosed until now, and the more interesting of the pair because the band is entirely
        in the low-nibble class while the mode is in the high class."""
        invs = self._six()
        bands = {(w, s): (lo, hi) for w, s, lo, hi in self.HEADLINE_CELLS}
        excluding = []
        checked = 0
        for (width, slot), (lo, hi) in sorted(bands.items()):
            recs = [r for t in ALL_TITLES for r in wd.title_escape_records(invs[t], width)]
            vals = [r.payload[slot] for r in recs if len(r.payload) > slot]
            self.assertTrue(vals, f"w{width} s{slot}: empty slot population")
            checked += 1
            mode, count = _collections.Counter(vals).most_common(1)[0]
            if not lo <= mode <= hi:
                excluding.append((width, slot, mode, count, len(vals)))
        self.assertEqual(checked, 15, "not every headline cell was examined")
        self.assertEqual(excluding, [(4, 2, 0x82, 468, 1161), (8, 2, 0x82, 81, 294)])

    #: Pooled counts immediately outside each headline band's two edges, as
    #: (width, slot) -> (count at lo-1, count at hi+1). ADDED 2026-08-13: standing rule 1 says an
    #: analysis window's own edge is not a fact about the data, and the round reported these for
    #: only the two single-value 0x02 cells. Ten of the 15 bands have LIVE data immediately
    #: outside an edge and none of it was disclosed -- notably w4 s1 (0x0D x143 just above) and
    #: w4 s2 (0x82 x468 just below, the one case the doc did mention).
    HEADLINE_BAND_EDGES = {
        (4, 1): (0, 143), (4, 2): (468, 4),
        (5, 0): (0, 0), (5, 1): (55, 43), (5, 2): (0, 91), (5, 3): (0, 0),
        (6, 0): (7, 0), (6, 2): (0, 0), (6, 4): (13, 6),
        (7, 0): (18, 7), (7, 2): (0, 0), (7, 5): (3, 4),
        (8, 0): (15, 0), (8, 2): (0, 0), (8, 6): (20, 4),
    }

    def test_every_headline_band_reports_both_of_its_own_edges(self) -> None:
        """Standing rule 1, discharged for all 15 headline cells rather than the 2 easy ones.

        A band's edge is a property of the search, not of the data, so the only honest way to
        present one is with the counts immediately outside it. Five of the 15 bands are genuinely
        closed (zero on both sides); the other ten are not, and a reader told only the in-band
        percentages would take a scan boundary for a field boundary. Pinning the numbers means a
        band that later moved would have to move these too."""
        invs = self._six()
        bands = {(w, s): (lo, hi) for w, s, lo, hi in self.HEADLINE_CELLS}
        measured = {}
        for (width, slot), (lo, hi) in sorted(bands.items()):
            recs = [r for t in ALL_TITLES for r in wd.title_escape_records(invs[t], width)]
            hist = _collections.Counter(r.payload[slot] for r in recs if len(r.payload) > slot)
            measured[(width, slot)] = (hist.get(lo - 1, 0), hist.get(hi + 1, 0))
        self.assertEqual(len(measured), 15)
        self.assertEqual(measured, self.HEADLINE_BAND_EDGES)
        closed = [k for k, v in measured.items() if v == (0, 0)]
        self.assertEqual(len(closed), 5,
                         "the count of genuinely closed bands changed; re-report the edges")

    def test_payload_alphabet_is_two_classes_up_to_width_24_and_breaks_above_it(self) -> None:
        """An edge-independent structural fact underpinning the whole round: an escape
        payload byte is either a low nibble [0x01,0x0F] or a high byte >= 0x80 -- >= 97.7% of
        payload bytes at EVERY width from 2 to 24, exactly 100% at 13 of those widths
        (round 9: this docstring said "eleven"; the widths are 5, 6, 8, 9-15, 18, 20, 24, and
        `test_payload_class_purity_is_pinned_per_width` now lists them rather than counting).

        The mandatory both-edges report: ABOVE width 24 the purity collapses to 71.96%
        (18612 of 25865 bytes over 250 spans), which is the evidence that those long spans are
        not records but stray 0xF0-to-0xF0 distances crossing section 1 -- where 0x40/0x42
        (the S2.2 spikes) live. The boundary is stated with the number on both sides of it, not
        quoted as a format property."""
        invs = self._six()
        widths_checked = 0
        for width in range(2, wd.ESCAPE_RECORD_MAX_WIDTH + 1):
            recs = [r for t in ALL_TITLES for r in wd.title_escape_records(invs[t], width)]
            if not recs:
                continue
            widths_checked += 1
            total, inside, _ = wd.payload_class_purity(recs)
            with self.subTest(width=width):
                self.assertGreaterEqual(inside / total, 0.977)
        self.assertEqual(widths_checked, 23)
        big: list[wd.EscapeRecord] = []
        for title in ALL_TITLES:
            for body in invs[title].values():
                pos = wd.escape_positions(body)
                for i in range(len(pos) - 1):
                    if pos[i + 1] - pos[i] > wd.ESCAPE_RECORD_MAX_WIDTH:
                        big.append(wd.EscapeRecord(pos[i], bytes(body[pos[i] + 1:pos[i + 1]])))
        self.assertEqual(len(big), 250)
        total, inside, _ = wd.payload_class_purity(big)
        self.assertEqual((total, inside), (25865, 18612))
        self.assertLess(inside / total, 0.75)

    #: `{width: (payload_bytes, in_the_two_classes)}` for every width 2..24 present in the
    #: six-title corpus. Re-derived round 9 with `payload_class_purity`.
    PURITY_BY_WIDTH = {
        2: (400, 399), 3: (2852, 2806), 4: (3483, 3482), 5: (1680, 1680),
        6: (2480, 2480), 7: (1554, 1551), 8: (2058, 2058), 9: (1488, 1488),
        10: (1350, 1350), 11: (1230, 1230), 12: (1309, 1309), 13: (984, 984),
        14: (962, 962), 15: (812, 812), 16: (705, 703), 17: (1504, 1486),
        18: (459, 459), 19: (1584, 1571), 20: (1463, 1463), 21: (1600, 1565),
        22: (735, 728), 23: (44, 43), 24: (529, 529),
    }

    def test_payload_class_purity_is_pinned_per_width(self) -> None:
        """Round 9 correction. The doc's `16,17,19,21,22,23` row quoted a 97.81% floor; the
        real floor is 97.73% at width 23, and 97.81% is width 21. The prose under that table
        already said '>=97.7%', so the document disagreed with itself.

        The reason a summary range was the wrong thing to publish is visible only per width:
        width 23 has **44** payload bytes in the entire six-title corpus, so its 97.73% is
        43/44 -- ONE byte. Pinning every width's raw counts makes the population behind each
        percentage impossible to lose again."""
        invs = self._six()
        measured = {}
        for width in range(2, wd.ESCAPE_RECORD_MAX_WIDTH + 1):
            recs = [r for t in ALL_TITLES for r in wd.title_escape_records(invs[t], width)]
            if not recs:
                continue
            total, inside, _ = wd.payload_class_purity(recs)
            measured[width] = (total, inside)
        self.assertEqual(measured, self.PURITY_BY_WIDTH)

        purities = {w: ins / tot for w, (tot, ins) in measured.items()}
        worst = min(purities, key=lambda w: purities[w])
        self.assertEqual(worst, 23)
        self.assertAlmostEqual(purities[23], 0.9773, places=4)
        self.assertAlmostEqual(purities[21], 0.9781, places=4)
        # The floor is one byte in a 44-byte population -- assert that, not just the ratio.
        self.assertEqual(measured[23], (44, 43))
        # The row the doc quotes, re-derived as a range.
        row = [purities[w] for w in (16, 17, 19, 21, 22, 23)]
        self.assertAlmostEqual(min(row), 0.9773, places=4)
        self.assertAlmostEqual(max(row), 0.9972, places=4)
        # The sibling test's docstring said "exactly 100% at eleven of those widths"; it is
        # 13 (5, 6, 8, 9-15, 18, 20, 24), which the doc's own table already implies.
        self.assertEqual(sorted(w for w, p in purities.items() if p == 1.0),
                         [5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 24])

    def test_op1_predicts_the_escape_width_held_out_across_titles(self) -> None:
        """The escape TAXONOMY itself: the byte right after 0xF0 predicts how long the escape
        record is. Trained on five titles and scored on the sixth (so the map is never fitted
        to the data it is graded on), a one-rule modal classifier gets 46.6%-57.4% of a held-out
        title's escape widths exactly right, against 14.7%-19.0% under the pairing-permutation
        null -- 3.01x-3.37x in all six titles."""
        invs = self._six()
        pairs = {t: [p for b in invs[t].values() for p in wd.escape_op1_width_pairs(b)]
                 for t in ALL_TITLES}
        self.assertEqual(sum(len(v) for v in pairs.values()), 5971)
        folds = 0
        for held in ALL_TITLES:
            train = [p for t in ALL_TITLES if t != held for p in pairs[t]]
            modal = wd.op1_width_modal_map(train)
            fallback = _collections.Counter(w for _, w in train).most_common(1)[0][0]
            real = wd.op1_width_modal_accuracy(pairs[held], modal, fallback)
            null = wd.op1_width_pairing_null(pairs[held], modal, fallback,
                                             random.Random(NULL_SEED))
            folds += 1
            with self.subTest(title=held):
                self.assertGreater(real, 0.45)
                self.assertLess(null, 0.20)
                self.assertGreater(real / null, 2.9)
        self.assertEqual(folds, 6)

    def test_op1_0xb1_always_introduces_a_width4_escape(self) -> None:
        """The sharpest single taxonomy rule found: op1 == 0xB1 -> width 4, in 145 of 145
        pooled escapes, in every one of the six titles, with no exception. 0xB1 is 177 --
        the value S6.2 left open as an unexplained 'pile-up' with no established role."""
        invs = self._six()
        pooled: _collections.Counter = _collections.Counter()
        checked = 0
        for title in ALL_TITLES:
            pairs = [p for b in invs[title].values() for p in wd.escape_op1_width_pairs(b)]
            table = wd.op1_width_crosstab(pairs).get(0xB1, _collections.Counter())
            checked += 1
            with self.subTest(title=title):
                self.assertGreater(sum(table.values()), 0, "every title must have some 0xB1")
                self.assertEqual(list(table), [4], f"{title}: {dict(table)}")
            pooled.update(table)
        self.assertEqual(checked, 6)
        self.assertEqual(dict(pooled), {4: 145})

    def test_0xb1_is_enriched_at_operand_positions_against_its_own_base_rate(self) -> None:
        """The null for 'is 0xB1 an escape operand rather than ordinary data': if 0xB1 fell
        uniformly across section 2, the fraction of 0xB1 bytes sitting immediately after an
        escape would equal the fraction of section-2 positions that ARE post-escape positions
        (escapes / len(section2)). Measured: 5.29x-9.84x that base rate in all six titles, and
        in CoK, CoAB and Gateway EVERY section-2 0xB1 is an escape operand (33/33, 25/25,
        13/13). Not universal -- DoK is 22 of 55 and Buck Rogers 33 of 52 -- reported as the
        split it is."""
        invs = self._six()
        exclusive = 0
        checked = 0
        for title in ALL_TITLES:
            s2_len = s2_escapes = n_b1 = n_b1_op = 0
            for body in invs[title].values():
                split = wd.section_split(body)
                if split is None:
                    continue
                s2_len += len(split[2])
                s2_escapes += split[2].count(0xF0)
                n_b1 += split[2].count(0xB1)
                for p in wd.escape_positions(body):
                    if p + 1 < len(body) and body[p + 1] == 0xB1:
                        n_b1_op += 1
            checked += 1
            base = s2_escapes / s2_len
            rate = n_b1_op / n_b1
            if rate == 1.0:
                exclusive += 1
            with self.subTest(title=title):
                self.assertGreater(n_b1, 10)
                self.assertGreater(rate / base, 5.0)
        self.assertEqual(checked, 6)
        self.assertEqual(exclusive, 3)

    def test_op1_0x91_introduces_a_width6_escape_in_92_percent(self) -> None:
        """The second-sharpest rule, and an honest contrast with 0xB1's perfect one: op1 ==
        0x91 -> width 6 in 211 of 230 pooled escapes (91.7%). The 19 exceptions are real and
        enumerated (width 7: 7, width 11: 8, width 24: 4), not rounded away."""
        invs = self._six()
        pooled: _collections.Counter = _collections.Counter()
        for title in ALL_TITLES:
            pairs = [p for b in invs[title].values() for p in wd.escape_op1_width_pairs(b)]
            pooled.update(wd.op1_width_crosstab(pairs).get(0x91, _collections.Counter()))
        self.assertEqual(sum(pooled.values()), 230)
        self.assertEqual(dict(sorted(pooled.items())), {6: 211, 7: 7, 11: 8, 24: 4})


if __name__ == "__main__":
    unittest.main()
