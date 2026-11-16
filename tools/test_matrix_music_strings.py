"""Tests for `tools/matrix_music_strings.py` (round 34 R4).

Two groups:

1. Synthetic, always-run tests build small in-memory byte blobs to check each regex/predicate in
   isolation, including the two cases the plan's own risk section calls out: a bare "MUSIC"
   credits label must NOT count as a file-open (Matrix's real `GAME.OVR` has exactly one, "MUSIC:
   Ralph Thomas & The Fat Man"), and the Pascal `MUSIC`+`.dax` construction must be recognized
   even though it is two adjacent length-prefixed strings, not one C string.

2. Real-bytes integration tests (skipped, not failed, when the external sources are absent) that
   run the full census against Matrix's own `matrixcubed_extracted/` install and Countdown's
   external `D:\\` install, and pin round 34 R4's Bar A verdict two-sided: Matrix's loader has
   >=3 `.ADV` names, `BUCK[A-C]`, and 0 `MUSIC.DAX` opens; Countdown's has a `MUSIC.DAX` open and
   0 `.ADV`/`.XMI` names -- reproduced from bytes, not carried from the plan.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import matrix_music_strings as subject  # noqa: E402


class RegexUnitTests(unittest.TestCase):
    def test_bare_music_is_not_a_file_open(self) -> None:
        # Matrix's real GAME.OVR context at file offset 0x2cb: a credits-screen label, not a
        # file-open construction.
        data = b"emello\x0cSusan Manley\x06MUSIC:\x1aRalph Thomas & The Fat Man\nP"
        self.assertEqual(len(subject.MUSIC_DAX_OPEN_RE.findall(data)), 0)
        self.assertEqual(len(subject.BARE_MUSIC_RE.findall(data)), 1)

    def test_countdown_style_musical_score_credit_is_also_not_a_file_open(self) -> None:
        data = b"NCOUNTER CODE:      MUSICAL SCORE:\x1bDAVID SHELLEY      T"
        self.assertEqual(len(subject.MUSIC_DAX_OPEN_RE.findall(data)), 0)
        self.assertEqual(len(subject.BARE_MUSIC_RE.findall(data)), 1)

    def test_pascal_music_dax_construction_is_recognized(self) -> None:
        # Verified real bytes from Countdown's own unpacked START.EXE at file offset 0x7e3b.
        data = b"\x05MUSIC\x04.dax\x17unable to load com fileU"
        self.assertEqual(len(subject.MUSIC_DAX_OPEN_RE.findall(data)), 1)

    def test_adv_filename_extraction_is_case_insensitive_and_deduped(self) -> None:
        data = b"\tadlib.adv\x00mt32mpu.adv\x00PCSPKR.ADV\x00\x08adlib.adv\x00"
        adv = sorted({m.group(0).decode("ascii").lower() for m in subject.ADV_RE.finditer(data)})
        self.assertEqual(adv, ["adlib.adv", "mt32mpu.adv", "pcspkr.adv"])

    def test_bare_xmi_extension_alone_does_not_match_the_fused_name_pattern(self) -> None:
        # Verified real bytes from Matrix's own unpacked START.EXE at file offset 0x8d34: the
        # loader builds the XMI filename the same Pascal-string way MUSIC+.dax is built (a
        # separate length-prefixed base-name string, not a fused "NAME.xmi" token) -- XMI_RE
        # intentionally requires a fused token, so this specific real byte sequence does NOT
        # match it; BUCK_ABC_RE/FATV_RE catch the base names elsewhere in the same file instead.
        data = b"\xca\x04\x00\x04.xmi\x06fatv9.U"
        self.assertEqual(len(list(subject.XMI_RE.finditer(data))), 0)

    def test_buck_abc_and_fatv_hit_counts(self) -> None:
        data = b"\x05buckc\x00\x00\x00\x05bucka\x00\x00\x00\x05bucka\x00\x00\x00\x05buckb\x00fatv9.U"
        self.assertEqual(subject.BUCK_ABC_RE.findall(data).__len__(), 4)
        self.assertEqual(len(subject.FATV_RE.findall(data)), 1)


class TitleCensusUnitTests(unittest.TestCase):
    """FileCensus/TitleCensus aggregation and the Bar A verdict function, on synthetic data."""

    def test_bar_a_verdict_matches_matrix_and_countdown_shapes(self) -> None:
        matrix_start = subject.FileCensus(
            path="matrix/START.EXE",
            size=100,
            adv_names=["adlib.adv", "sbfm.adv", "tandy.adv"],
            xmi_names=[],
            buck_abc_hits=5,
            fatv_hits=1,
            music_dax_opens=0,
            bare_music_hits=0,
        )
        matrix_ovr = subject.FileCensus(
            path="matrix/GAME.OVR", size=50, adv_names=[], xmi_names=[], buck_abc_hits=0,
            fatv_hits=0, music_dax_opens=0, bare_music_hits=1,
        )
        countdown_start = subject.FileCensus(
            path="countdown/START.EXE", size=100, adv_names=[], xmi_names=[], buck_abc_hits=0,
            fatv_hits=0, music_dax_opens=2, bare_music_hits=2,
        )
        countdown_ovr = subject.FileCensus(
            path="countdown/GAME.OVR", size=50, adv_names=[], xmi_names=[], buck_abc_hits=0,
            fatv_hits=0, music_dax_opens=0, bare_music_hits=1,
        )
        matrix = subject.TitleCensus(title="matrix", start_exe=matrix_start, game_ovr=matrix_ovr)
        countdown = subject.TitleCensus(title="countdown", start_exe=countdown_start, game_ovr=countdown_ovr)
        verdict = subject.bar_a_verdict(matrix, countdown)
        self.assertTrue(verdict["matrix_ok"])
        self.assertTrue(verdict["countdown_ok"])
        self.assertTrue(verdict["pass"])

    def test_bar_a_fails_if_matrix_also_opens_music_dax(self) -> None:
        """Mutation-sensitivity: the verdict function can fail, it isn't vacuously true."""
        matrix_start = subject.FileCensus(
            path="matrix/START.EXE", size=100, adv_names=["adlib.adv", "sbfm.adv", "tandy.adv"],
            xmi_names=[], buck_abc_hits=5, fatv_hits=1, music_dax_opens=1, bare_music_hits=0,
        )
        matrix_ovr = subject.FileCensus(
            path="matrix/GAME.OVR", size=50, adv_names=[], xmi_names=[], buck_abc_hits=0,
            fatv_hits=0, music_dax_opens=0, bare_music_hits=1,
        )
        countdown_start = subject.FileCensus(
            path="countdown/START.EXE", size=100, adv_names=[], xmi_names=[], buck_abc_hits=0,
            fatv_hits=0, music_dax_opens=2, bare_music_hits=2,
        )
        countdown_ovr = subject.FileCensus(
            path="countdown/GAME.OVR", size=50, adv_names=[], xmi_names=[], buck_abc_hits=0,
            fatv_hits=0, music_dax_opens=0, bare_music_hits=1,
        )
        matrix = subject.TitleCensus(title="matrix", start_exe=matrix_start, game_ovr=matrix_ovr)
        countdown = subject.TitleCensus(title="countdown", start_exe=countdown_start, game_ovr=countdown_ovr)
        verdict = subject.bar_a_verdict(matrix, countdown)
        self.assertFalse(verdict["matrix_ok"])
        self.assertFalse(verdict["pass"])


MATRIX_START = Path("matrixcubed_extracted/BuckRogers2/c/Matrix/START.EXE")
MATRIX_OVR = Path("matrixcubed_extracted/BuckRogers2/c/Matrix/GAME.OVR")
COUNTDOWN_START = Path("D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/start.exe")
COUNTDOWN_OVR = Path("D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/game.ovr")

HAVE_MATRIX = MATRIX_START.exists() and MATRIX_OVR.exists()
HAVE_COUNTDOWN = COUNTDOWN_START.exists() and COUNTDOWN_OVR.exists()


@unittest.skipUnless(HAVE_MATRIX, "matrixcubed_extracted/ missing (git-ignored, never vendored)")
class MatrixRealBytesTests(unittest.TestCase):
    def test_matrix_loader_names_five_adv_drivers_bucka_bc_and_fatv9_zero_music_dax_opens(self) -> None:
        census = subject.census_title("matrix", MATRIX_START, MATRIX_OVR)
        self.assertGreaterEqual(len(census.adv_names), 3)
        self.assertEqual(
            census.adv_names,
            ["adlib.adv", "mt32mpu.adv", "pcspkr.adv", "sbfm.adv", "tandy.adv"],
        )
        self.assertGreater(census.buck_abc_hits, 0)
        self.assertGreater(census.fatv_hits, 0)
        self.assertEqual(census.music_dax_opens, 0)
        # The plan's own risk: Matrix's GAME.OVR carries exactly one bare "MUSIC" -- verify it is
        # there (so the search isn't vacuous) AND that it did not get counted as a file-open.
        self.assertEqual(census.game_ovr.bare_music_hits, 1)
        self.assertEqual(census.game_ovr.music_dax_opens, 0)


@unittest.skipUnless(HAVE_COUNTDOWN, "D:/ external Countdown install missing (never vendored)")
class CountdownRealBytesTests(unittest.TestCase):
    def test_countdown_loader_opens_music_dax_and_names_no_adv_or_xmi(self) -> None:
        census = subject.census_title("countdown", COUNTDOWN_START, COUNTDOWN_OVR)
        self.assertGreater(census.music_dax_opens, 0)
        self.assertEqual(census.adv_names, [])
        self.assertEqual(census.xmi_names, [])
        # Pin the exact reproduced count: two `MUSIC`+`.dax` constructions in START.EXE.
        self.assertEqual(census.start_exe.music_dax_opens, 2)


@unittest.skipUnless(HAVE_MATRIX and HAVE_COUNTDOWN, "both external sources required for the two-sided Bar A check")
class BarATwoSidedTests(unittest.TestCase):
    def test_bar_a_passes_two_sided_on_real_bytes(self) -> None:
        matrix = subject.census_title("matrix", MATRIX_START, MATRIX_OVR)
        countdown = subject.census_title("countdown", COUNTDOWN_START, COUNTDOWN_OVR)
        verdict = subject.bar_a_verdict(matrix, countdown)
        self.assertTrue(verdict["matrix_ok"], verdict)
        self.assertTrue(verdict["countdown_ok"], verdict)
        self.assertTrue(verdict["pass"], verdict)


if __name__ == "__main__":
    unittest.main()
