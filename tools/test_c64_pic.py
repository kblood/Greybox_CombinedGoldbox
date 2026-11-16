#!/usr/bin/env python3
"""Tests for the C64 fixed-size picture decoder.

The layout these lock down was established twice over -- from the 6502 blit in `GDRIVE02` and from
a differential read of the 38 payloads -- and then confirmed by rendering: Champions of Krynn
PIC70 is a vallenwood tree over a house, Death Knights PIC71 is the skeletal dragon and rider
under two moons, matching the same-id DOS BIGPIC1 frames. See
docs/engine/research/c64-disk-format.md section 7.4.

Every assertion here was checked against a deliberately broken layout before being committed (a
40-byte rotation of the body), per the project's rule that a probe is not evidence until it has
been seen failing. Under that mutation the register and screen-code assertions fail on all nine
Champions files.
"""

from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_pic as P  # noqa: E402

C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")

# Titles shipping the fixed-size picture. Pool of Radiance ships none at all.
PICTURE_TITLES = [
    "Buck Rogers - Countdown to Doomsday",
    "Champions of Krynn",
    "Curse of the Azure Bonds",
    "Death Knights of Krynn",
    "Gateway to the Savage Frontier",
    "Secret of the Silver Blades",
]

# Screen codes below $40 index the resident CHARSET rather than the picture's own glyphs. Only
# four ever appear across the whole corpus: $1C and $20 are the solid and blank cells an encoder
# gets for free, and $29/$2F are single stray occurrences.
RESIDENT_CODES_USED = {0x1C, 0x20, 0x29, 0x2F}

# Buck Rogers ids $71 and $72 need Picture(..., glyph_dest_shift=-1) -- their own GDRIVE02 starts
# the glyph copy one byte into the resident CHARSET's tail. See P.BUCK_GLYPH_SHIFT_IDS and
# docs/engine/research/c64-disk-format.md section 7.4. The naive Picture(data) (shift 0, what every
# other picture uses) still renders these two as noise -- see
# test_buck_rogers_outliers_need_the_glyph_dest_shift_to_decode, which checks both halves of that.


def _title_files(title: str) -> dict[str, bytes]:
    """Every readable PRG in a title's disk set, first side winning on duplicates."""
    out: dict[str, bytes] = {}
    for img in sorted((C64_SETS / title).glob("*.[Dd]64")):
        for name, data in P.disk_files(img).items():
            out.setdefault(name, data)
    return out


class LayoutTests(unittest.TestCase):
    """Pure arithmetic and routing -- no disk images needed."""

    def test_the_four_regions_tile_the_body_exactly(self) -> None:
        self.assertEqual(P.SCREEN_LEN, P.COLS * P.ROWS)
        self.assertEqual(P.SCREEN_LEN + P.SCREEN_LEN + P.GLYPH_LEN + 3, P.BODY_LEN)
        self.assertEqual(P.BODY_LEN, 2679)
        self.assertEqual(P.SIZES, (2681, 2682))

    def test_the_shipped_and_resident_glyphs_add_up_to_a_full_character_set(self) -> None:
        """192 in the picture plus 64 in CHARSET is 256 -- what $D018 = $34 demands."""
        self.assertEqual(P.GLYPH_COUNT + P.RESIDENT_GLYPHS, 256)
        self.assertEqual(P.GLYPH_LEN + P.CHARSET_BODY, 2048)

    def test_codes_below_40_come_from_the_charset_and_the_rest_from_the_file(self) -> None:
        prg = b"\x00\x40" + bytes(P.BODY_LEN)
        pic = P.Picture(prg)
        resident = bytes(range(256)) * 2
        self.assertEqual(pic.glyph(0x00, resident), resident[0:8])
        self.assertEqual(pic.glyph(0x3F, resident), resident[0x3F * 8:0x3F * 8 + 8])
        self.assertEqual(len(pic.glyph(0x40, resident)), 8)
        self.assertEqual(len(pic.glyph(0xFF, resident)), 8)

    def test_a_wrongly_sized_file_is_rejected_rather_than_decoded(self) -> None:
        for total in (2680, 2683, 2):
            with self.assertRaises(ValueError):
                P.Picture(b"\x00\x40" + bytes(total - 2))

    def test_glyph_dest_shift_is_scoped_to_buck_rogers_only(self) -> None:
        """Death Knights also ships a PIC71 (the skeletal dragon, correctly decoded at shift 0
        already) -- buck_glyph_shift must key off the source title, not just the picture name.
        """
        self.assertEqual(P.buck_glyph_shift("Death Knights of Krynn", "PIC71"), 0)
        self.assertEqual(P.buck_glyph_shift("Buck Rogers - Countdown to Doomsday", "PIC71"), -1)
        self.assertEqual(P.buck_glyph_shift("Buck Rogers - Countdown to Doomsday", "PIC72"), -1)
        self.assertEqual(P.buck_glyph_shift("Buck Rogers - Countdown to Doomsday", "PIC70"), 0)

    def test_glyph_table_shift_overwrites_the_resident_tail_and_leaves_the_table_tail_unwritten(
            self) -> None:
        """Ground truth from disassembling GDRIVE02's $C066 branch to completion (see the module
        docstring): a -1 glyph_dest_shift starts the picture's own glyph bytes one byte into the
        resident CHARSET's last byte (row 7 of glyph $3F), and stops one byte short of the normal
        end, leaving the table's very last byte (row 7 of glyph $FF) unwritten (default 0 here).
        """
        # No zero bytes anywhere, so a 0 surviving in the table is provably not resident/shipped
        # data -- it must be the unwritten default.
        resident = bytes((i % 255) + 1 for i in range(P.CHARSET_BODY))
        shipped = bytes((i % 255) + 1 for i in range(P.GLYPH_LEN))
        table = P.glyph_table(resident, shipped, glyph_dest_shift=-1)
        self.assertEqual(len(table), P.TABLE_LEN)
        self.assertEqual(table[:P.CHARSET_BODY - 1], resident[:-1], "resident's first 511 bytes")
        self.assertEqual(table[P.CHARSET_BODY - 1], shipped[0], "shipped byte 0 overwrote it")
        self.assertEqual(table[P.CHARSET_BODY:-1], shipped[1:], "the rest of shipped, unshifted")
        self.assertEqual(table[-1], 0, "the table's last byte was never written")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class CorpusTests(unittest.TestCase):
    """The layout against every fixed-size picture in the corpus."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.titles: dict[str, dict[str, bytes]] = {}
        for title in PICTURE_TITLES:
            if (C64_SETS / title).is_dir():
                cls.titles[title] = _title_files(title)
        if not cls.titles:
            raise unittest.SkipTest("no picture-bearing title sets present")

    def _pictures(self):
        for title, files in sorted(self.titles.items()):
            resident = P.charset_glyphs(files["CHARSET"])
            for name, data in sorted(files.items()):
                if P.is_picture(data):
                    yield title, name, data, resident

    def test_the_corpus_is_the_expected_size(self) -> None:
        names = [(t, n) for t, n, _, _ in self._pictures()]
        self.assertEqual(len(names), 37, "picture count changed")
        self.assertEqual(len({t for t, _ in names}), 6)

    def test_background_register_0_is_black_in_every_picture(self) -> None:
        """body[2676] is $D021. It is 0 in all of them, and a shifted layout breaks it at once."""
        for title, name, data, _ in self._pictures():
            self.assertEqual(P.Picture(data).bg0, 0, f"{title}/{name}")

    def test_screen_codes_below_40_are_only_the_four_resident_cells_ever_used(self) -> None:
        for title, name, data, _ in self._pictures():
            low = {c for c in set(P.Picture(data).screen) if c < P.RESIDENT_GLYPHS}
            self.assertLessEqual(low, RESIDENT_CODES_USED, f"{title}/{name}")

    def test_no_picture_needs_more_than_the_192_glyphs_it_ships(self) -> None:
        for title, name, data, _ in self._pictures():
            pic = P.Picture(data)
            used = {c for c in set(pic.screen) if c >= P.RESIDENT_GLYPHS}
            self.assertLessEqual(len(used), P.GLYPH_COUNT, f"{title}/{name}")
            self.assertLessEqual(max(used), 0xFF, f"{title}/{name}")

    def test_champions_pic79_uses_exactly_the_glyphs_its_highest_code_implies(self) -> None:
        """The sharpest single case: max code $CE, and exactly 143 glyph slots carry data.

        This equality is *not* general -- seven other files have blank referenced glyphs or
        leftover data past their highest code -- so it is asserted where it actually holds.
        """
        files = self.titles.get("Champions of Krynn")
        if not files:
            self.skipTest("Champions of Krynn absent")
        pic = P.Picture(files["PIC79"])
        highest = max(c for c in set(pic.screen) if c >= P.RESIDENT_GLYPHS)
        occupied = sum(1 for i in range(P.GLYPH_COUNT) if any(pic.glyphs[i * 8:i * 8 + 8]))
        self.assertEqual(highest, 0xCE)
        self.assertEqual(occupied, 143)
        self.assertEqual(highest - P.RESIDENT_GLYPHS + 1, occupied)

    def test_buck_rogers_pic71_has_an_out_of_nibble_range_background_2(self) -> None:
        """$D023 = $15. Harmless -- VIC uses the low nibble -- but it refutes 'all three are < 16'."""
        files = self.titles.get("Buck Rogers - Countdown to Doomsday")
        if not files:
            self.skipTest("Buck Rogers absent")
        self.assertEqual(P.Picture(files["PIC71"]).bg2, 0x15)

    def test_only_the_2682_byte_files_carry_a_trailing_byte(self) -> None:
        """The extra byte is after the register triple, not inserted before it.

        The blit copies exactly three bytes to $D021-$D023 (`LDX #$02 / LDA $7974,X / STA $D021,X`
        in all four Krynn-family drivers), so it is not a fourth colour register. Its role is
        unproven; the decoder ignores it.
        """
        for title, name, data, _ in self._pictures():
            pic = P.Picture(data)
            self.assertEqual(pic.trailing is None, len(data) == 2681, f"{title}/{name}")

    def test_every_picture_renders_to_a_full_frame_of_valid_palette_indices(self) -> None:
        for title, name, data, resident in self._pictures():
            px = P.Picture(data).indices(resident)
            self.assertEqual(len(px), P.WIDTH * P.HEIGHT, f"{title}/{name}")
            self.assertLess(max(px), 16, f"{title}/{name}")

    def test_buck_rogers_outliers_need_the_glyph_dest_shift_to_decode(self) -> None:
        """PIC71/PIC72 decode correctly with Picture(..., glyph_dest_shift=-1) -- disassembling
        GDRIVE02's $C066 branch to completion (docs/engine/research/c64-disk-format.md 7.4) showed
        it does exactly one thing beyond the ordinary blit: starts the glyph copy one byte early.
        `RenderGoldenTests` pins the exact correct bytes (inspected: PIC71 is a road through wooded
        terrain, PIC72 a pond in a green landscape); this proves the shift is load-bearing, not a
        no-op -- the naive shift=0 decode every other picture uses renders a visibly different
        (wrong) image for these two.
        """
        files = self.titles.get("Buck Rogers - Countdown to Doomsday")
        if not files:
            self.skipTest("Buck Rogers absent")
        resident = P.charset_glyphs(files["CHARSET"])
        for name in ("PIC71", "PIC72"):
            naive = P.Picture(files[name]).rgb(resident)
            shifted = P.Picture(files[name], glyph_dest_shift=-1).rgb(resident)
            self.assertNotEqual(naive, shifted, f"{name}: glyph_dest_shift changed nothing")


@unittest.skipUnless((C64_SETS / "Champions of Krynn").is_dir(), "Champions of Krynn absent")
class RenderGoldenTests(unittest.TestCase):
    """Exact renders. Any drift in the layout, the mode split or the palette changes these."""

    GOLDENS = {
        ("Champions of Krynn", "PIC70"):
            "05629bafa50482621f05ff4cfb7de003e7c7a01cda2d7bfe375a8f7b3fdc7f15",
        ("Death Knights of Krynn", "PIC71"):
            "ee9dfbca44c0231df3533290f9f8920bad3e444caba26a61c2f2f93a0f6bc03b",
        ("Gateway to the Savage Frontier", "PIC7C"):
            "db4619cb3f881aae67ee9cf220cdf317befa5aa9b822e99f8a331359411b6308",
        # PIC71/PIC72 need glyph_dest_shift=-1 (see P.buck_glyph_shift, section 7.4). Inspected:
        # PIC71 is a road cutting through wooded terrain, PIC72 a pond in a green landscape.
        ("Buck Rogers - Countdown to Doomsday", "PIC71"):
            "97cbd852e6c747fd0b72161e689088d723485fee60b10220a15a61aef2f5f932",
        ("Buck Rogers - Countdown to Doomsday", "PIC72"):
            "60edcc29997fc26a05336014a3aa7ad4aac0af64a49692bbc935c8409c6a3537",
    }

    def test_known_pictures_render_byte_for_byte_as_inspected(self) -> None:
        for (title, name), want in self.GOLDENS.items():
            if not (C64_SETS / title).is_dir():
                continue
            files = _title_files(title)
            shift = P.buck_glyph_shift(title, name)
            rgb = P.Picture(files[name], glyph_dest_shift=shift).rgb(P.charset_glyphs(files["CHARSET"]))
            self.assertEqual(len(rgb), P.WIDTH * P.HEIGHT * 3)
            self.assertEqual(hashlib.sha256(rgb).hexdigest(), want, f"{title}/{name} changed")

    def test_a_rotated_body_does_not_still_pass_the_structural_checks(self) -> None:
        """The mutation the corpus assertions were calibrated against, kept as a live control."""
        files = _title_files("Champions of Krynn")
        broke = 0
        for name, data in sorted(files.items()):
            if not P.is_picture(data):
                continue
            b = data[2:]
            mutant = P.Picture(data[:2] + b[40:] + b[:40])
            low = {c for c in set(mutant.screen) if c < P.RESIDENT_GLYPHS}
            if mutant.bg0 != 0 or not low <= RESIDENT_CODES_USED:
                broke += 1
        self.assertEqual(broke, 9, "the layout checks no longer detect a 40-byte rotation")


if __name__ == "__main__":
    unittest.main()
