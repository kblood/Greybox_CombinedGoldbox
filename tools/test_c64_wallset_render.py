"""Tests for tools/c64_wallset_render.py.

Same two-layer discipline as test_c64_wallset.py:

  1. SYNTHETIC tests of the pixel-grouping/render/index-check primitives -- always run.
  2. Real-corpus tests (rendering, DOS cross-check, the corpus-wide mode verdict) against the
     seven C64 Gold Box titles under D:/Games/Emulator/C64/Goldbox/ and this repo's DOS GOG
     installs. Skip when their sources are absent.

Task mandate this file backs up: DECODE and LOOK, not hunt the consumer (see the research
doc's section 7 and this module's own docstring for the full writeup). The corpus-wide
`corpus_mode_verdict` result (310/320 real WALLSET files favour the multicolor reading, a
random-byte control gives an even split) is the rerunnable, falsifiable half of that verdict;
`RandomControlTests` pins the control that makes the real result trustworthy.
"""
from __future__ import annotations

import random
import struct
import unittest
from pathlib import Path

import c64_wallset as wallset
import c64_wallset_render as render

C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")
REPO = Path(__file__).resolve().parents[1]
COK_C64 = C64_SETS / "Champions of Krynn"
COK_DOS = REPO / "Champions of Krynn"
DOK_C64 = C64_SETS / "Death Knights of Krynn"
DOK_DOS = REPO / "Death Knights of Krynn"


def _png_size(data: bytes) -> tuple[int, int]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", data[16:24])


def _corpus_present() -> bool:
    return C64_SETS.is_dir()


# --------------------------------------------------------------------------------------------
# Synthetic: bit-grouping primitives
# --------------------------------------------------------------------------------------------


class ExpandMulticolorTests(unittest.TestCase):
    def test_all_zero_glyph_is_all_zero_grid(self) -> None:
        grid = render.expand_multicolor(bytes(8))
        self.assertEqual(grid, [[0] * 8 for _ in range(8)])

    def test_all_one_bits_glyph_is_all_value_three(self) -> None:
        grid = render.expand_multicolor(bytes([0xFF]) * 8)
        self.assertEqual(grid, [[3] * 8 for _ in range(8)])

    def test_known_byte_decodes_to_known_pair_values(self) -> None:
        # 0b01_10_11_00 = pairs [1, 2, 3, 0], each doubled horizontally.
        grid = render.expand_multicolor(bytes([0b01_10_11_00] + [0] * 7))
        self.assertEqual(grid[0], [1, 1, 2, 2, 3, 3, 0, 0])

    def test_rejects_wrong_length(self) -> None:
        with self.assertRaises(ValueError):
            render.expand_multicolor(bytes(7))
        with self.assertRaises(ValueError):
            render.expand_multicolor(bytes(9))

    def test_uses_the_same_8_bytes_as_hires_only_the_grouping_differs(self) -> None:
        """Mutation-relevant control: hires and multicolor must decode the SAME source bytes,
        not independently-sliced views -- this is the whole premise of the task ("only the
        bit grouping differs"). A glyph whose hires reading is a checkerboard is expected to
        show DIFFERENT structure under multicolor, from the identical 8 input bytes."""
        glyph = bytes([0b10101010] * 8)  # checkerboard in hires
        hires = wallset.glyph_bits(glyph)
        mc = render.expand_multicolor(glyph)
        self.assertEqual(hires[0], [1, 0, 1, 0, 1, 0, 1, 0])
        # Same byte read as 2-bit pairs (10, 10, 10, 10) doubled -> solid value-2 row, not a
        # checkerboard -- a different, decisive readout from the identical bits.
        self.assertEqual(mc[0], [2, 2, 2, 2, 2, 2, 2, 2])


# --------------------------------------------------------------------------------------------
# Synthetic: sheet rendering
# --------------------------------------------------------------------------------------------


class RenderSheetTests(unittest.TestCase):
    def test_rejects_unknown_mode(self) -> None:
        with self.assertRaises(ValueError):
            render.render_sheet(bytes(8), "planar")

    def test_hires_sheet_shape_matches_glyph_count_and_cols(self) -> None:
        body = bytes(range(8)) * 20  # 20 glyphs
        sheet = render.render_sheet(body, "hires", cols=5, scale=2)
        self.assertEqual(sheet.glyph_count, 20)
        self.assertEqual(sheet.width, 5 * 8 * 2)
        self.assertEqual(sheet.height, 4 * 8 * 2)  # 20 glyphs / 5 cols = 4 rows
        self.assertEqual(len(sheet.rgb), sheet.width * sheet.height * 3)

    def test_multicolor_sheet_same_shape_rule_as_hires(self) -> None:
        body = bytes(range(8)) * 20
        sheet = render.render_sheet(body, "multicolor", cols=5, scale=2)
        self.assertEqual(sheet.glyph_count, 20)
        self.assertEqual(sheet.width, 5 * 8 * 2)
        self.assertEqual(sheet.height, 4 * 8 * 2)

    def test_write_png_round_trips_dimensions_without_pillow_path(self) -> None:
        """Exercises the raw PNG writer directly (not asserting on PIL's presence/absence)."""
        body = bytes([0xFF, 0x00] * 4)  # 1 glyph
        sheet = render.render_sheet(body, "hires", cols=1, scale=1)
        out = Path(REPO / "renders" / "c64_wallset" / "_test_tmp.png")
        render.write_png(out, sheet.width, sheet.height, sheet.rgb)
        try:
            data = out.read_bytes()
            self.assertEqual(_png_size(data), (sheet.width, sheet.height))
        finally:
            out.unlink(missing_ok=True)


# --------------------------------------------------------------------------------------------
# Synthetic: DOS tile-strip reshape
# --------------------------------------------------------------------------------------------


class ReshapeStripToGridTests(unittest.TestCase):
    def test_reshapes_a_16px_wide_strip_into_8x8_tiles(self) -> None:
        # 16 wide, 16 tall (2 bands of 8 rows) -> 4 tiles total (2 bands x 2 tiles/band).
        width, height = 16, 16
        rgb = bytes(width * height * 3)  # all-black is fine, only shape is under test
        grid = render.reshape_strip_to_grid(width, height, rgb, cols=2, scale=1)
        self.assertEqual(grid.glyph_count, 4)
        self.assertEqual(grid.width, 2 * 8)
        self.assertEqual(grid.height, 2 * 8)  # 4 tiles / 2 cols = 2 rows

    def test_drops_a_trailing_partial_band_rather_than_padding(self) -> None:
        # height=12 -> only 1 full 8-row band (12 // 8 == 1), the trailing 4 rows are dropped.
        width, height = 16, 12
        rgb = bytes(width * height * 3)
        grid = render.reshape_strip_to_grid(width, height, rgb, cols=4, scale=1)
        self.assertEqual(grid.glyph_count, 2)  # 1 band x 2 tiles/band

    def test_empty_strip_returns_zero_glyph_sheet(self) -> None:
        grid = render.reshape_strip_to_grid(16, 0, b"", cols=4, scale=1)
        self.assertEqual(grid.glyph_count, 0)
        self.assertEqual((grid.width, grid.height), (0, 0))

    def test_picks_out_the_correct_pixel_for_each_tile_quadrant(self) -> None:
        """A real, non-uniform strip: verify the LEFT tile of band 0 and the RIGHT tile of
        band 0 land in the correct output cell, not swapped or transposed."""
        width, height = 16, 8
        rgb = bytearray(width * height * 3)
        # Paint the left 8x8 tile red, the right 8x8 tile blue.
        for y in range(8):
            for x in range(8):
                o = (y * width + x) * 3
                rgb[o:o + 3] = (255, 0, 0)
            for x in range(8, 16):
                o = (y * width + x) * 3
                rgb[o:o + 3] = (0, 0, 255)
        grid = render.reshape_strip_to_grid(width, height, bytes(rgb), cols=2, scale=1)
        self.assertEqual(grid.glyph_count, 2)
        # Output cell (0,0) = left tile = red; cell (1,0) = right tile = blue.
        top_left = grid.rgb[0:3]
        top_right = grid.rgb[(8) * 3:(8) * 3 + 3]
        self.assertEqual(tuple(top_left), (255, 0, 0))
        self.assertEqual(tuple(top_right), (0, 0, 255))


# --------------------------------------------------------------------------------------------
# Synthetic: WALLDEF index-validity check
# --------------------------------------------------------------------------------------------


class WalldefIndexValidityTests(unittest.TestCase):
    def test_all_bytes_in_range(self) -> None:
        v = render.walldef_index_validity(bytes([0, 1, 2, 3]), glyph_count=50)
        self.assertEqual(v.in_range, 4)
        self.assertEqual(v.out_of_range, 0)
        self.assertEqual(v.in_range_fraction, 1.0)

    def test_all_bytes_out_of_range(self) -> None:
        v = render.walldef_index_validity(bytes([200, 201, 255]), glyph_count=50)
        self.assertEqual(v.in_range, 0)
        self.assertEqual(v.out_of_range, 3)
        self.assertEqual(v.in_range_fraction, 0.0)

    def test_empty_body_reports_zero_length_not_a_crash(self) -> None:
        v = render.walldef_index_validity(b"", glyph_count=50)
        self.assertEqual(v.body_len, 0)
        self.assertEqual(v.in_range_fraction, 0.0)

    def test_min_max_are_the_bodys_own_byte_range(self) -> None:
        v = render.walldef_index_validity(bytes([10, 5, 240]), glyph_count=50)
        self.assertEqual((v.min_byte, v.max_byte), (5, 240))


# --------------------------------------------------------------------------------------------
# Synthetic + seeded-random: the vertical-continuity mode discriminator
# --------------------------------------------------------------------------------------------


class VerticalContinuityTests(unittest.TestCase):
    def test_identical_rows_give_perfect_continuity_either_mode(self) -> None:
        glyph = bytes([0b11001100] * 8)  # every row byte-identical
        body = glyph
        self.assertEqual(render.vertical_row_continuity(body, "hires"), 1.0)
        self.assertEqual(render.vertical_row_continuity(body, "multicolor"), 1.0)

    def test_alternating_rows_of_complementary_bits_give_zero_hires_continuity(self) -> None:
        rows = [0b10101010 if i % 2 == 0 else 0b01010101 for i in range(8)]
        body = bytes(rows)
        self.assertEqual(render.vertical_row_continuity(body, "hires"), 0.0)

    def test_rejects_unknown_mode(self) -> None:
        with self.assertRaises(ValueError):
            render.vertical_row_continuity(bytes(8), "cga")

    def test_excess_subtracts_the_modes_own_chance_baseline(self) -> None:
        glyph = bytes([0b11001100] * 8)  # perfect continuity, both modes
        self.assertAlmostEqual(
            render.vertical_continuity_excess(glyph, "hires"),
            1.0 - render.HIRES_CHANCE_BASELINE,
        )
        self.assertAlmostEqual(
            render.vertical_continuity_excess(glyph, "multicolor"),
            1.0 - render.MULTICOLOR_CHANCE_BASELINE,
        )


class RandomControlTests(unittest.TestCase):
    """Was written to rule out "the metric always prefers multicolor" as an explanation for the
    real corpus's lopsided 310/320 result. **It does not rule that out, and the class docstring
    used to claim it did (corrected 2026-08-12).** It tests only UNIFORM random bytes, i.e.
    p(bit=1)=0.5, which is the one density at which the metric happens to be balanced. At other
    densities it is badly skewed -- ~97.5% multicolor at p=0.25, 100% at p=0.15. See
    `StructureNullControlTests` below for the nulls that actually settle the question, and
    `render.vertical_continuity_excess`'s docstring for why the metric is non-discriminating.
    Retained because the p=0.5 fact is true and worth pinning; just do not read it as a control.
    """

    def test_random_bytes_do_not_systematically_favour_either_mode(self) -> None:
        rng = random.Random(20260812)
        mc_wins = hi_wins = 0
        for _ in range(200):
            body = bytes(rng.randrange(256) for _ in range(400))  # one WALLSET-shaped body
            h = render.vertical_continuity_excess(body, "hires")
            m = render.vertical_continuity_excess(body, "multicolor")
            if m > h:
                mc_wins += 1
            else:
                hi_wins += 1
        # An even split is the point of this control -- assert it stays roughly balanced
        # (not the ~97%-multicolor skew the real corpus shows).
        fraction = mc_wins / (mc_wins + hi_wins)
        self.assertGreater(fraction, 0.35)
        self.assertLess(fraction, 0.65)


# --------------------------------------------------------------------------------------------
# Real-corpus tests
# --------------------------------------------------------------------------------------------


@unittest.skipUnless(_corpus_present(), "C64 corpus not present")
class RealCorpusRenderTests(unittest.TestCase):
    def test_render_sheet_on_a_real_wallset_body_hires_and_multicolor(self) -> None:
        files = wallset.iter_wall_files(COK_C64, "WALLSET")
        real = next(f for f in files if f.suffix == "01" and not f.problem)
        for mode in ("hires", "multicolor"):
            sheet = render.render_sheet(real.body, mode)
            self.assertEqual(sheet.glyph_count, 50)
            self.assertGreater(sheet.width, 0)
            self.assertGreater(sheet.height, 0)


@unittest.skipUnless(_corpus_present() and COK_DOS.is_dir(), "CoK C64 corpus or DOS install not present")
class DosCrossCheckTests(unittest.TestCase):
    def test_id_crosscheck_finds_a_real_overlap_for_champions_of_krynn(self) -> None:
        wd = render.dos_walldef_ids(COK_DOS)
        low = render.dos_8x8d_low_ids(COK_DOS)
        overlap = wd & low
        # Established this pass (module docstring): 6/14 for CoK.
        self.assertEqual(len(wd), 14)
        self.assertGreaterEqual(len(overlap), 6)
        self.assertIn(23, overlap)  # id 0x17, the id this pass rendered

    def test_id_crosscheck_is_a_clean_1to1_match_for_death_knights(self) -> None:
        """Death Knights' WALLDEF ids and its 8X8D-family low ids are EXACTLY the same set
        {1..7} -- the strongest single piece of evidence this pass found that 8X8D block_id
        really is keyed the same way as the C64 hex id."""
        if not (DOK_C64.is_dir() and DOK_DOS.is_dir()):
            self.skipTest("Death Knights C64 corpus or DOS install not present")
        wd = render.dos_walldef_ids(DOK_DOS)
        low = render.dos_8x8d_low_ids(DOK_DOS)
        self.assertEqual(wd, {1, 2, 3, 4, 5, 6, 7})
        self.assertEqual(wd, low)

    def test_dos_8x8d_tile_strip_decodes_a_real_block(self) -> None:
        strip = render.dos_8x8d_tile_strip(COK_DOS, 23)
        self.assertIsNotNone(strip)
        assert strip is not None
        self.assertEqual(strip.width, 16)
        self.assertGreater(strip.height, 0)
        self.assertEqual(len(strip.rgb), strip.width * strip.height * 3)

    def test_dos_8x8d_tile_strip_returns_none_for_an_id_with_no_block(self) -> None:
        self.assertIsNone(render.dos_8x8d_tile_strip(COK_DOS, 250))

    def test_reshape_strip_to_grid_on_a_real_decoded_block(self) -> None:
        strip = render.dos_8x8d_tile_strip(COK_DOS, 23)
        assert strip is not None
        grid = render.reshape_strip_to_grid(strip.width, strip.height, strip.rgb)
        self.assertEqual(grid.glyph_count, strip.height // 8 * 2)


@unittest.skipUnless(_corpus_present(), "C64 corpus not present")
class CorpusModeVerdictTests(unittest.TestCase):
    """Pins the descriptive statistic: on the real 320-file WALLSET population the
    vertical-continuity excess favours the multicolor reading in the overwhelming majority of
    files. Deliberately tolerant of single-file drift from a future re-extraction.

    **This is a DESCRIPTIVE statistic, not evidence for the multicolor reading (corrected
    2026-08-12).** It was originally presented as the corpus-scale proof of the mode question.
    `StructureNullControlTests` shows the same statistic reaches 100% on data whose within-glyph
    vertical structure has been destroyed, i.e. it is measuring the byte histogram and the two
    decodings' pixel geometry rather than anything about which mode is correct. Keep the test;
    do not resurrect the claim.
    """

    def test_multicolor_wins_the_overwhelming_majority_of_real_wallset_files(self) -> None:
        verdict = render.corpus_mode_verdict(C64_SETS)
        self.assertGreaterEqual(verdict.total_files, 300)  # 320 at time of writing
        self.assertGreater(verdict.multicolor_fraction, 0.85)


class StructureNullControlTests(unittest.TestCase):
    """The controls that settle whether `vertical_continuity_excess` discriminates between the
    two modes. It does not.

    A metric genuinely measuring within-glyph vertical structure must score LOWER once that
    structure is destroyed. `row_shuffle` permutes the 8 rows inside each glyph -- keeping every
    byte, destroying exactly the adjacency the metric reads -- and multicolor then wins at least
    as often as on the real corpus. That is the whole argument, and it is why this project does
    not claim the mode question is settled quantitatively.

    Added 2026-08-12 by the lead session, after checking the round's own headline. Written so
    that anyone re-promoting the 96.9% figure to "evidence" has to make this test fail first.
    """

    def test_destroying_vertical_structure_does_not_reduce_the_multicolor_win_rate(self) -> None:
        if not C64_SETS.is_dir():
            self.skipTest(f"C64 corpus not present at {C64_SETS}")
        nulls = render.structure_null_controls(C64_SETS)
        real_w, real_t = nulls["real"]
        shuf_w, shuf_t = nulls["row_shuffle"]
        self.assertEqual(real_t, shuf_t, "null controls must cover the same file population")
        self.assertGreaterEqual(real_t, 300)
        # The load-bearing assertion: destroying within-glyph vertical structure does NOT
        # lower the multicolor win rate. If a future change makes the metric discriminating,
        # this test SHOULD fail -- and the docs it guards should then be revisited.
        self.assertGreaterEqual(
            shuf_w / shuf_t,
            real_w / real_t,
            "row-shuffled data now scores lower than real data -- the metric may have become "
            "discriminating; re-check the mode conclusion before editing this assertion",
        )

    def test_glyph_order_is_irrelevant_to_the_metric(self) -> None:
        if not C64_SETS.is_dir():
            self.skipTest(f"C64 corpus not present at {C64_SETS}")
        nulls = render.structure_null_controls(C64_SETS)
        # The metric is defined per-glyph, so permuting glyph ORDER must change nothing at all.
        # This is the positive control that the null machinery itself is wired up correctly.
        self.assertEqual(nulls["real"], nulls["glyph_order"])


if __name__ == "__main__":
    unittest.main()
