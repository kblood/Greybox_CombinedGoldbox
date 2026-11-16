#!/usr/bin/env python3
"""Tests for the (partially cracked) C64 COMPIC/CHARPIC/variable-PIC investigation.

This module does not decode pixels -- see its docstring and
docs/engine/research/c64-compic-format.md for exactly what is established and what is not. These
tests pin the two things that ARE established from bytes:

1. Every COMPIC file in the corpus fits the proportional 162*n(+1) formula exactly.
2. MON body byte 153 predicts a monster's own COMPIC size class, at >=98% across five titles
   (Champions of Krynn, Death Knights of Krynn, Curse of the Azure Bonds, Secret of the Silver
   Blades, Gateway to the Savage Frontier), and NOT well for Pool of Radiance -- both the "it
   works" and the "it doesn't, here" are asserted, so neither can quietly change unnoticed.

Every corpus-dependent assertion here was checked against a deliberate break before being
trusted, per the project's rule that a probe is not evidence until it has been seen to fail. The
mutations used (and confirmed red) are recorded next to each test below.
"""

from __future__ import annotations

import collections
import random
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_compic as C  # noqa: E402
import c64_sprite as S  # noqa: E402
import dax_decode  # noqa: E402

C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")
_GOG = Path("C:/Program Files (x86)/GOG Galaxy/Games")
_REPO = Path(__file__).resolve().parents[1]

#: DOS installs whose `CPIC*.DAX` blocks decode with `dax_decode.parse_standard_frame`, keyed by
#: the C64 title name. These are the oracle for COMPIC frame shape: a C64 COMPIC's filename hex
#: suffix IS the DOS block id, so the DOS side names this monster's real width and height.
#:
#: Gateway to the Savage Frontier is deliberately absent. Its DOS `CPIC*.DAX` blocks carry a
#: frame header of `18 00 03 00 ...` and `parse_standard_frame` returns None for all of them
#: (item_count 3, not the single-item layout it handles), so Gateway contributes ZERO oracle
#: blocks rather than wrong ones. Buck Rogers has no DOS `CPIC` archive at all. Decoding the
#: Gateway variant is an open item, not a claim this module makes.
DOS_ORACLE_INSTALLS = {
    "Champions of Krynn": _REPO / "Champions of Krynn",
    "Death Knights of Krynn": _REPO / "Death Knights of Krynn",
    "Curse of the Azure Bonds": _GOG / "Curse of the Azure Bonds",
    "Pool of Radiance": _GOG / "Pool of Radiance",
    "Secret of the Silver Blades": _GOG / "Secret of the Silver Blades",
}


def _dos_cpic_frames(dos_dir: Path) -> dict[int, tuple[int, int, list[list[int]]]]:
    """{block_id: (width, height, ink_mask)} for every decodable CPIC block in a DOS install.

    The mask is 1 where the EGA pixel is a non-zero palette index. Comparing ink masks rather
    than colours is deliberate: the C64 and DOS releases use different palettes and different
    colour depths, so only the silhouette is comparable across the port.
    """
    out: dict[int, tuple[int, int, list[list[int]]]] = {}
    for path in sorted(p for p in dos_dir.rglob("*")
                       if p.suffix.lower() == ".dax" and p.stem.upper().startswith("CPIC")):
        data = path.read_bytes()
        try:
            base, blocks = dax_decode.parse_container(data)
        except ValueError:
            continue
        for blk in blocks:
            if blk.block_id in out:
                continue
            try:
                raw = dax_decode.decompress_block(data, base, blk)
            except Exception:  # noqa: BLE001 - a truncated block is simply not oracle material
                continue
            frame = dax_decode.parse_standard_frame(raw)
            if not frame:
                continue
            width, height, _x, _y = frame
            px = raw[17:]
            mask = []
            for y in range(height):
                row = []
                for x in range(width):
                    i = y * width + x
                    byte = px[i // 2] if i // 2 < len(px) else 0
                    row.append(1 if ((byte >> 4) if i % 2 == 0 else (byte & 0x0F)) else 0)
                mask.append(row)
            out[blk.block_id] = (width, height, mask)
    return out


def _ink(grid: list[list[int]]) -> list[list[int]]:
    """A decoded C64 grid reduced to 1 where the pixel is not the background index.

    The DOS side is compared as a silhouette, so the C64 side must be reduced the same way.
    Comparing raw palette indices against a 0/1 mask scores a match only where the C64 index
    happens to equal 1, which is an artifact of the comparison rather than a measurement.
    """
    return [[1 if v else 0 for v in row] for row in grid]


def _ink_agreement(a: list[list[int]], b: list[list[int]]) -> float | None:
    """Agreement over positions where at least one side has ink, or None if neither ever does.

    Restricting to ink matters: two mostly-empty 24x24 tiles agree on their shared emptiness no
    matter how they are arranged, which inflates every candidate layout toward the same score
    and hides the differences the comparison exists to measure.
    """
    hits = total = 0
    for ra, rb in zip(a, b):
        for x, y in zip(ra, rb):
            if x or y:
                total += 1
                hits += x == y
    return hits / total if total else None

ALL_TITLES = [
    "Champions of Krynn",
    "Death Knights of Krynn",
    "Curse of the Azure Bonds",
    "Secret of the Silver Blades",
    "Pool of Radiance",
    "Gateway to the Savage Frontier",
    "Buck Rogers - Countdown to Doomsday",
]


class PureLogicTests(unittest.TestCase):
    """No disk images needed -- arithmetic and small synthetic records only."""

    def test_family_of_strips_a_trailing_hex_id_but_not_a_bare_family_name(self) -> None:
        self.assertEqual(C.family_of("COMPIC0B"), "COMPIC")
        self.assertEqual(C.family_of("COMPIC00"), "COMPIC")
        self.assertEqual(C.family_of("CHARPIC00"), "CHARPIC")
        self.assertEqual(C.family_of("CHARSET"), "CHARSET")
        self.assertEqual(C.family_of("MON3E"), "MON")

    def test_compic_size_class_accepts_every_documented_size(self) -> None:
        # body 162/163 -> 1x, 324/325 -> 2x, 648/649 -> 4x (file length = body + 2)
        for total, want in [(164, 1), (165, 1), (326, 2), (327, 2), (650, 4), (651, 4)]:
            self.assertEqual(C.compic_size_class(total), want, total)

    def test_compic_size_class_rejects_a_length_that_fits_no_class(self) -> None:
        for bad_total in (166, 328, 652, 1000, 2681):
            self.assertIsNone(C.compic_size_class(bad_total), bad_total)

    def test_the_size_classes_are_an_exact_doubling_of_the_1x_unit(self) -> None:
        self.assertEqual(C.COMPIC_UNIT * 2, 324)
        self.assertEqual(C.COMPIC_UNIT * 4, 648)

    def test_mon_predicted_class_maps_the_four_observed_codes(self) -> None:
        body = bytearray(C.MON_BODY_LEN)
        for code, want in [(1, 1), (2, 2), (3, 2), (4, 4)]:
            body[C.MON_SIZE_BYTE_OFFSET] = code
            self.assertEqual(C.mon_predicted_compic_class(bytes(body)), want, code)
        # the high bit is masked off -- 0x81 must predict the same as 0x01
        body[C.MON_SIZE_BYTE_OFFSET] = 0x81
        self.assertEqual(C.mon_predicted_compic_class(bytes(body)), 1)

    def test_mon_predicted_class_is_none_for_an_unobserved_code_or_a_short_body(self) -> None:
        body = bytearray(C.MON_BODY_LEN)
        body[C.MON_SIZE_BYTE_OFFSET] = 0x05  # never observed
        self.assertIsNone(C.mon_predicted_compic_class(bytes(body)))
        self.assertIsNone(C.mon_predicted_compic_class(bytes(10)))  # too short to hold byte 153

    def test_compic_mon_pairs_ignores_mon_bodies_of_the_wrong_length(self) -> None:
        """A Buck-Rogers-shaped 204-byte MON record must not be compared at all."""
        files = {
            "COMPIC01": b"\x00\x40" + bytes(162),      # total len 164 -> class 1
            "MON01": b"\x00\x40" + bytes(202),         # body 202, NOT 480 -- must be excluded
        }
        self.assertEqual(C.compic_mon_pairs(files), {})

    def test_compic_mon_pairs_matches_by_id_not_by_dict_order(self) -> None:
        mon_body = bytearray(C.MON_BODY_LEN)
        mon_body[C.MON_SIZE_BYTE_OFFSET] = 1
        files = {
            "COMPIC0B": b"\x00\x40" + bytes(162),          # id 0B, class 1
            "MON0B": b"\x00\x40" + bytes(mon_body),        # id 0B
            "COMPIC04": b"\x00\x40" + bytes(324),          # id 04, no matching MON -- excluded
        }
        pairs = C.compic_mon_pairs(files)
        self.assertEqual(set(pairs), {"0B"})
        compic_len, body = pairs["0B"]
        self.assertEqual(compic_len, 164)
        self.assertEqual(body, bytes(mon_body))

    def test_predictor_accuracy_on_a_synthetic_corpus(self) -> None:
        def mon(code: int) -> bytes:
            b = bytearray(C.MON_BODY_LEN)
            b[C.MON_SIZE_BYTE_OFFSET] = code
            return b"\x00\x40" + bytes(b)

        files = {
            "COMPIC01": b"\x00\x40" + bytes(162),  # class 1, predicted 1 (code 1) -> match
            "MON01": mon(1),
            "COMPIC02": b"\x00\x40" + bytes(324),  # class 2, predicted 4 (code 4) -> mismatch
            "MON02": mon(4),
        }
        matched, total, mismatched = C.predictor_accuracy(files)
        self.assertEqual((matched, total, mismatched), (1, 2, ["02"]))

    def test_mutation_a_wrong_code_map_breaks_the_synthetic_predictor_check(self) -> None:
        """The mutation this suite is calibrated against: swap code 1 to predict class 2.

        Confirms the accuracy check can actually go red -- run once by hand, recorded here as a
        permanent regression guard rather than left as a one-off manual check.
        """
        broken_map = dict(C._MON_CODE_TO_CLASS)
        broken_map[1] = 2
        original = C._MON_CODE_TO_CLASS
        try:
            C._MON_CODE_TO_CLASS = broken_map
            body = bytearray(C.MON_BODY_LEN)
            body[C.MON_SIZE_BYTE_OFFSET] = 1
            self.assertEqual(C.mon_predicted_compic_class(bytes(body)), 2)
            self.assertNotEqual(C.mon_predicted_compic_class(bytes(body)), 1)
        finally:
            C._MON_CODE_TO_CLASS = original

    def test_the_four_frame_shapes_are_one_rule_columns_right_to_left(self) -> None:
        """Every shape is "fill columns right to left, top to bottom within a column"."""
        self.assertEqual(C.frame_shape(1), (1, 1, (0,)))
        self.assertEqual(C.frame_shape(2, tall=True), (1, 2, (0, 1)))   # one column, 0 above 1
        self.assertEqual(C.frame_shape(2, tall=False), (2, 1, (1, 0)))  # unit 0 is the RIGHT one
        # 2x2 raster slots TL,TR,BL,BR: right column is (0,1), left column is (2,3).
        self.assertEqual(C.frame_shape(4), (2, 2, (2, 0, 3, 1)))
        with self.assertRaises(ValueError):
            C.frame_shape(3)

    def test_the_two_shape_accessors_cannot_drift_apart(self) -> None:
        """`frame_shape` and `mon_frame_shape` must resolve to the same single table.

        They were two independent dicts once, which meant a corrected layout could be applied to
        one and not the other -- and the corpus test that reads `frame_shape` would keep passing
        against a stale copy of the answer.
        """
        for (units, tall), code in C._UNITS_TO_MON_CODE.items():
            body = bytearray(C.MON_BODY_LEN)
            body[C.MON_SIZE_BYTE_OFFSET] = code
            self.assertIs(C.frame_shape(units, tall), C.mon_frame_shape(bytes(body)))
        for _cols, _rows, order in C._SHAPE_BY_MON_CODE.values():
            self.assertEqual(sorted(order), list(range(len(order))),
                             "every unit must be placed exactly once")

    def test_mon_frame_shape_splits_the_two_unit_codes_into_tall_and_wide(self) -> None:
        for code, want in [(1, (1, 1, (0,))), (2, (1, 2, (0, 1))),
                           (3, (2, 1, (1, 0))), (4, (2, 2, (2, 0, 3, 1)))]:
            body = bytearray(C.MON_BODY_LEN)
            body[C.MON_SIZE_BYTE_OFFSET] = code
            self.assertEqual(C.mon_frame_shape(bytes(body)), want, code)
        body = bytearray(C.MON_BODY_LEN)
        body[C.MON_SIZE_BYTE_OFFSET] = 9
        self.assertIsNone(C.mon_frame_shape(bytes(body)))
        self.assertIsNone(C.mon_frame_shape(b"\x00" * 8))

    def test_compose_places_each_unit_in_the_slot_the_shape_names(self) -> None:
        """Composition is checked with synthetic units, so a wrong slot cannot hide behind art.

        Each unit is filled so its decoded pixels are a constant equal to the unit index + 1,
        which makes the composed picture a direct readout of which unit landed in which slot.
        """
        units = []
        for i in range(4):
            colour = bytes([((i + 1) << 4) | (i + 1)]) * C.CELLS_PER_FRAME
            glyphs = b"\x55" * C.FRAME_GLYPH_BYTES          # every pair = 01 -> the high nibble
            units.append(glyphs + glyphs + colour + colour)
        body = b"".join(units)
        grid = C.compose_compic(body, C.frame_shape(4))
        self.assertEqual(len(grid), 48)
        self.assertEqual(len(grid[0]), 48)
        self.assertEqual(grid[0][0], 3, "top-left slot must hold unit 2")
        self.assertEqual(grid[0][24], 1, "top-right slot must hold unit 0")
        self.assertEqual(grid[24][0], 4, "bottom-left slot must hold unit 3")
        self.assertEqual(grid[24][24], 2, "bottom-right slot must hold unit 1")
        wide = C.compose_compic(body[:2 * C.COMPIC_UNIT], C.frame_shape(2, tall=False))
        self.assertEqual((wide[0][0], wide[0][24]), (2, 1), "wide: unit 1 left, unit 0 right")
        tall = C.compose_compic(body[:2 * C.COMPIC_UNIT], C.frame_shape(2, tall=True))
        self.assertEqual((tall[0][0], tall[24][0]), (1, 2), "tall: unit 0 above unit 1")

    def test_compose_rejects_a_bad_pose_or_a_body_with_too_few_units(self) -> None:
        body = b"\x00" * (2 * C.COMPIC_UNIT)
        with self.assertRaises(ValueError):
            C.compose_compic(body, C.frame_shape(4))
        with self.assertRaises(ValueError):
            C.compose_compic(body, C.frame_shape(2, tall=True), pose=2)


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class CorpusTests(unittest.TestCase):
    """Real corpus: every title's disk set, loaded once."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.titles: dict[str, dict[str, bytes]] = {}
        for title in ALL_TITLES:
            d = C64_SETS / title
            if d.is_dir():
                cls.titles[title] = C.title_files(d)
        if not cls.titles:
            raise unittest.SkipTest("no title sets present")

    #: C1.4b scope check (2026-08-14). Art-family file counts across all seven titles,
    #: counted the same way `title_files` counts (first side wins per name). `PIC` is split
    #: because only the fixed-size 2681/2682-byte layout is decoded -- the variable-size PIC
    #: files belong to this module's own undecoded COMPIC/CHARPIC/variable-PIC family.
    ART_CENSUS = {
        "BODY": 66, "CHARPIC": 7, "CHARSET": 7, "COMPIC": 379, "HEAD": 102,
        "PIC_FIXED": 37, "PIC_VAR": 368, "SPRITE": 192, "TITLEPG": 7,
        "WALLDEF": 100, "WALLSET": 100,
    }
    #: The families a `?graphics=c64` mode could render today. COMPIC joined on 2026-08-14 when
    #: its pixel layout, frame shape and multi-unit composition were solved. CHARPIC and the
    #: variable-size `PIC*` family are still unlocated and deliberately stay out.
    RENDERABLE_FAMILIES = ("PIC_FIXED", "CHARSET", "COMPIC")

    def test_the_renderable_share_of_the_c64_art_corpus_is_now_thirty_one_percent(self) -> None:
        """The C1.4b scope check, as a number rather than an impression.

        BUILD-QUEUE's C1.4b entry assumed "full-screen art will switch" and that only walls,
        sprites and portraits were missing. That premise is WRONG: only 37 of the 405 `PIC*`
        files are the solved fixed-size layout. The other 368 are variable-size and belong to
        the still-undecoded family this module documents.

        This test used to assert the figure was 44 of 1365 files (3.2%) and to FAIL if coverage
        rose above 5%, precisely so that solving something could not leave the C1.4b ship/wait
        decision resting on a stale number. COMPIC was solved on 2026-08-14, so that trigger has
        now fired and the figure is restated here: **423 of 1365, 31.0%**.

        The remaining gap is the honest reason C1.4b still is not shipped: CHARPIC (7) plus the
        variable `PIC*` family (368) is 375 files, and it is those -- not COMPIC -- that stand
        between 31% and the ~58.5% the original census projected."""
        census: dict[str, int] = {}
        for files in self.titles.values():
            for name, data in files.items():
                fam = C.family_of(name)
                if fam not in ("PIC", "CHARSET", "COMPIC", "CHARPIC", "SPRITE", "SPR",
                               "WALLSET", "WALLDEF", "HEAD", "BODY", "TITLEPG"):
                    continue
                if fam == "PIC":
                    fam = "PIC_FIXED" if len(data) in (2681, 2682) else "PIC_VAR"
                census[fam] = census.get(fam, 0) + 1

        self.assertEqual(len(self.titles), 7, "the scope check needs all seven titles")
        self.assertEqual(census, self.ART_CENSUS, "the C64 art-family census changed")

        total = sum(census.values())
        renderable = sum(census[f] for f in self.RENDERABLE_FAMILIES)
        self.assertEqual(total, 1365)
        self.assertEqual(renderable, 423)
        self.assertAlmostEqual(renderable / total, 0.310, places=2)
        # The same guard as before, re-armed at the new level: solving CHARPIC or the variable
        # PIC family would push this past 40% and should force the C1.4b decision to be retaken
        # rather than inherited.
        self.assertLess(renderable / total, 0.40,
                        "renderable coverage rose above 40% -- re-run the C1.4b ship/wait "
                        "decision, it was last taken on a 31.0% figure")
        # COMPIC is the whole of the improvement, and it must actually be decodable to count.
        self.assertEqual(census["COMPIC"], 379)
        sample = next(d for files in self.titles.values() for n, d in files.items()
                      if C.family_of(n) == "COMPIC")
        self.assertTrue(C.decode_compic(sample[2:]), "COMPIC must decode to count as renderable")

        # The premise BUILD-QUEUE's C1.4b entry got wrong, asserted directly.
        self.assertLess(census["PIC_FIXED"], census["PIC_VAR"] // 5,
                        "most PIC files are still undecoded; 'full-screen art will switch' "
                        "would only become true if this stops holding")

        # The original "one big target" was COMPIC + CHARPIC + variable PIC = 754 files. COMPIC
        # (379) is done; what is left of that target is the real remaining work.
        compic_family = census["COMPIC"] + census["CHARPIC"] + census["PIC_VAR"]
        self.assertEqual(compic_family, 754)
        self.assertGreater(compic_family / total, 0.55)
        still_unsolved = census["CHARPIC"] + census["PIC_VAR"]
        self.assertEqual(still_unsolved, 375)

    #: Single-class (162/163-byte) COMPIC bodies, pooled over all seven titles.
    def _single_class_bodies(self) -> list[bytes]:
        out = []
        for files in self.titles.values():
            for name, data in sorted(files.items()):
                if C.family_of(name) != "COMPIC":
                    continue
                body = data[2:]
                if len(body) in (162, 163):
                    out.append(body[:162])
        return out

    def test_the_compic_body_has_a_period_of_72_not_81(self) -> None:
        """Section 5.1. The natural first guess -- a 162-byte body is two 81-byte maps, the way
        the solved fixed-size PIC is 570 screen + 570 colour -- is REFUTED: lag 81 scores BELOW
        its own null. Lag 72 is the real period.

        NULL: the CLOSED-FORM permutation null. For a body of length L with byte counts c_v, the
        probability that two distinct positions hold equal values is sum c_v(c_v-1) / L(L-1).
        This destroys position structure while preserving the byte histogram exactly, and unlike
        a sampled shuffle it depends on neither a seed nor the order bodies are visited -- the
        standing round-9 rule that a sampled null must not be quoted to more digits than its
        spread supports. It also yields ONE null value shared by every lag, so comparing lags is
        exactly fair rather than approximately fair."""
        bodies = self._single_class_bodies()
        self.assertEqual(len(bodies), 229, "the single-class COMPIC population changed")

        def stats(lag: int) -> tuple[float, float]:
            hit = tot = 0
            null_num = null_den = 0.0
            for body in bodies:
                length = len(body)
                counts = collections.Counter(body)
                p = sum(v * (v - 1) for v in counts.values()) / (length * (length - 1))
                span = length - lag
                hit += sum(1 for i in range(span) if body[i] == body[i + lag])
                tot += span
                null_num += p * span
                null_den += span
            return hit / tot, null_num / null_den

        ratio = {}
        for lag in (1, 2, 3, 71, 72, 73, 81):
            real, null = stats(lag)
            ratio[lag] = real / null

        self.assertAlmostEqual(ratio[72], 3.37, places=1)
        self.assertGreater(ratio[72], max(r for lag, r in ratio.items() if lag != 72),
                           "lag 72 is no longer the strongest period")
        # The refuted equal-halves reading, asserted as a refutation rather than prose.
        self.assertLess(ratio[81], 1.0,
                        "lag 81 rose above its null -- the 81+81 screen/colour reading would "
                        "need re-examining")
        self.assertAlmostEqual(ratio[81], 0.71, places=1)

    def test_the_periodicity_stops_at_144_giving_a_72_72_18_partition(self) -> None:
        """Section 5.2. `body[i] == body[i+72]` is substantial for i < 72 and collapses after,
        so the relation is exactly body[0:72] <-> body[72:144] and the last 18 bytes are outside
        it. This is what makes the partition 72 | 72 | 18 rather than 'period 72, repeated'."""
        bodies = self._single_class_bodies()
        rates = []
        for i in range(90):
            hit = sum(1 for b in bodies if b[i] == b[i + 72])
            rates.append(hit / len(bodies))

        inside = rates[:72]
        outside = rates[72:90]
        self.assertGreater(min(inside), 0.10, "a position inside the periodic region went quiet")
        self.assertLess(max(outside), 0.06, "the region past 144 started participating")
        self.assertGreater(sum(inside) / 72, 10 * (sum(outside) / 18))

    def test_the_two_72_byte_blocks_are_planes_of_the_same_picture(self) -> None:
        """Section 5.3. Within one file the two blocks match at 0.415; across randomly paired
        DIFFERENT files the same statistic is 0.156. So the correlation is a property of the
        individual picture, not of the family's byte statistics -- two planes/regions of one
        image. They are never identical, so it is not duplication.

        The 18-byte tail is at chance against block 0, which is the control that keeps 'the
        blocks are related' from being a statement about COMPIC bytes in general."""
        bodies = self._single_class_bodies()

        def rate(x: bytes, y: bytes) -> float:
            return sum(1 for a, b in zip(x, y) if a == b) / len(x)

        within = [rate(b[0:72], b[72:144]) for b in bodies]
        # EXHAUSTIVE cross-file null: every ordered pair of distinct bodies. Sampling this
        # would reintroduce a seed and a body-visit-order dependence -- the same defect the
        # period test above had to correct.
        blocks0 = [b[0:72] for b in bodies]
        blocks1 = [b[72:144] for b in bodies]
        cross_total = 0
        cross_n = 0
        for i, b0 in enumerate(blocks0):
            for j, b1 in enumerate(blocks1):
                if i == j:
                    continue
                cross_total += sum(1 for a, c in zip(b0, b1) if a == c)
                cross_n += 72

        mean_within = sum(within) / len(within)
        mean_cross = cross_total / cross_n
        self.assertAlmostEqual(mean_within, 0.415, places=2)
        self.assertAlmostEqual(mean_cross, 0.156, places=2)
        self.assertGreater(mean_within / mean_cross, 2.5)
        self.assertEqual([b for b in bodies if b[0:72] == b[72:144]], [],
                         "a body's two blocks became identical -- that would make this "
                         "duplication, not two planes")
        # Control: the tail is unrelated to block 0.
        tail = sum(rate(b[0:18], b[144:162]) for b in bodies) / len(bodies)
        self.assertLess(tail, 0.05)

    #: Deliberately over-inclusive counted-loop scan (section 5.6). Raw opcode/operand byte
    #: pairs, no instruction-boundary decoding -- so it over-reports by construction, which is
    #: what makes a zero result a strong negative rather than a weak one.
    _CMP_IMM = {0xC9, 0xE0, 0xC0}          # CMP/CPX/CPY immediate
    _LD_IMM = {0xA2, 0xA0}                 # LDX/LDY immediate
    _DEC = {0x88, 0xCA}                    # DEY/DEX
    _BRANCH = {0xD0, 0xF0, 0x10, 0x30}     # BNE/BEQ/BPL/BMI

    @classmethod
    def _counted_loops(cls, body: bytes, wanted: tuple[int, ...]) -> list[tuple[int, int]]:
        """(offset, loop_length) for `CPy #$N; Bxx` and `LDy #$N .. DEy; Bxx` forms."""
        out = []
        for i in range(len(body) - 3):
            if body[i] in cls._CMP_IMM and body[i + 1] in wanted and body[i + 2] in cls._BRANCH:
                out.append((i, body[i + 1]))
            if body[i] in cls._LD_IMM and body[i + 1] in wanted:
                for j in range(i + 2, min(i + 26, len(body) - 1)):
                    if body[j] in cls._DEC and body[j + 1] in cls._BRANCH:
                        out.append((i, body[i + 1]))
                        break
        return out

    def test_the_72_18_162_loop_search_cannot_discriminate_and_is_retired(self) -> None:
        """Section 5.6, as CORRECTED. The 72|72|18 partition suggested hunting the COMPIC blit
        by its loop bounds. That search returns nothing, but this test pins why the nothing is
        NOT evidence -- so no later round re-runs it believing a zero means something.

        Three separate reasons, each measured here:

        1. **Zero at 162 is what any value up there scores.** Across the whole neighbourhood
           150..174, counted loops total 16 and SIXTEEN OF TWENTY-FOUR values are themselves
           exactly zero. Loop bounds are 66% below 32. A 162-byte format would show this zero
           whether or not its blit exists.
        2. **"No file carries both a 72-loop and an 18-loop" is arithmetic, not a finding.**
           Exactly ONE file in all seven titles carries a 72-loop, so the expected co-occurrence
           under independence is 1*17/446 = 0.038 files. Separately, 43.5% of all value pairs
           co-occur in zero files, making zero the modal outcome.
        3. **Every surviving hit resolves to a ubiquitous CBM/VIC system constant**, not a format
           constant -- see the PIC64 test below and the GDRIVE01 $1248 false positive.

        The measurement of the partition itself (section 5.1-5.3) is untouched; only this method
        of chasing it is retired."""
        wanted = tuple(range(150, 175)) + (72, 18)
        holders: dict[int, set[tuple[str, str]]] = {}
        scanned = 0
        for title, files in sorted(self.titles.items()):
            for name, data in sorted(files.items()):
                body = data[2:]
                if S.illegal_opcode_fraction(body) >= 0.10:
                    continue
                scanned += 1
                for _off, val in self._counted_loops(body, wanted):
                    holders.setdefault(val, set()).add((title, name))

        self.assertGreater(scanned, 400, "the code-like population collapsed")

        # (1) 162 is unremarkable in its own neighbourhood.
        window = {v: len(holders.get(v, ())) for v in range(150, 175)}
        self.assertEqual(window[162], 0)
        self.assertGreaterEqual(sum(1 for v, c in window.items() if c == 0), 15,
                                "most of 150..174 should also be zero -- if that stopped being "
                                "true, the 162 zero would start carrying information")

        # (2) the co-occurrence claim is vacuous: only one file anywhere has a 72-loop.
        n72, n18 = len(holders.get(72, ())), len(holders.get(18, ()))
        self.assertEqual(n72, 1, "expected exactly one 72-loop holder (Pool of Radiance POOLRA)")
        self.assertEqual(sorted(n for _t, n in holders[72]), ["POOLRA"])
        self.assertLess(n72 * n18 / scanned, 0.1,
                        "expected co-occurrence must stay far below 1 for the zero to be vacuous")

    def test_pic64_shares_one_byte_identical_cbm_directory_scan_in_all_seven_titles(self) -> None:
        """The one real fact the section 5.6 search turned up -- and the reason its 18-loop
        population is a false positive.

        PIC64 is 736 bytes in every title and carries the corpus's most-shared counted loop:
        `CPY #$12` at body offset 130, present in ALL SEVEN. It looked like a COMPIC tail loop
        (18 = the tail length). It is not. The surrounding code is a CBM 1541 DIRECTORY SCAN:

            LDA ($3B),Y / CMP #$82   ; directory entry type: closed PRG
            LDA $03FD,Y / CMP ($3B),Y ; compare the wanted 16-char filename
            CPY #$12                  ; <- the "18": end of the name field (offsets 3..18)
            CPX #$08                  ; 8 directory entries per sector
            ADC #$20                  ; 32 bytes per directory entry

        $82/$20/$08 are CBM filesystem constants, so the 18 is a filename length, not a COMPIC
        block length. Pinned as the named counter-example to reading loop constants as format
        constants -- the same failure as GDRIVE01's $1248."""
        seen = 0
        for title, files in sorted(self.titles.items()):
            pic64 = files.get("PIC64")
            self.assertIsNotNone(pic64, f"{title} has no PIC64")
            body = pic64[2:]
            with self.subTest(title=title):
                self.assertEqual(len(body), 736)
                self.assertEqual(body[130:132], bytes([0xC0, 0x12]))       # CPY #$12
                self.assertEqual(body[132], 0xF0)                          # BEQ -> a real loop
                self.assertEqual(body[125:127], bytes([0xD1, 0x3B]))       # CMP ($3B),Y
                self.assertEqual(body[122:125], bytes([0xB9, 0xFD, 0x03]))  # LDA $03FD,Y
                self.assertEqual(body[116:118], bytes([0xC9, 0x82]))       # CMP #$82 dir type
                self.assertEqual(body[137:139], bytes([0xE0, 0x08]))       # CPX #$08 entries
                self.assertEqual(body[143:145], bytes([0x69, 0x20]))       # ADC #$20 entry size
                seen += 1
        self.assertEqual(seen, 7)

    def test_the_162_byte_unit_decodes_as_two_3x3_multicolour_frames(self) -> None:
        """Section 6. The solved layout: 72 glyph bytes + 72 glyph bytes + 9 colour + 9 colour,
        i.e. TWO animation frames of one 3x3-cell multicolour sprite, 24x24 px each.

        Confirmed by rendering -- recognisable Gold Box combat sprites (a coiled serpent, a
        striding lizard, a soldier drawing a bow), each in two poses. This test pins the
        arithmetic and the invariants that rendering cannot check on every file."""
        seen = 0
        for title, files in sorted(self.titles.items()):
            for name, data in sorted(files.items()):
                if C.family_of(name) not in ("COMPIC", "CHARPIC"):
                    continue
                n = C.compic_size_class(len(data))
                if n is None:
                    continue
                body = data[2:]
                units = C.compic_units(body)
                self.assertEqual(len(units), n, f"{title}/{name}: {n} units expected")
                for unit in units:
                    frames = C.unit_frames(unit)
                    self.assertEqual(len(frames), 2)
                    for glyphs, colour in frames:
                        self.assertEqual(len(glyphs), 72)
                        self.assertEqual(len(colour), 9)
                    a, b = frames
                    self.assertEqual(a[0] + b[0] + a[1] + b[1], unit,
                                     "the four regions must exactly partition the unit")
                grid = C.decode_frame(*C.unit_frames(units[0])[0])
                self.assertEqual(len(grid), 24)
                self.assertEqual({len(r) for r in grid}, {24})
                self.assertTrue(all(0 <= v <= 15 for r in grid for v in r),
                                "decoded values must be C64 palette indices")
                seen += 1
        self.assertGreater(seen, 300, "COMPIC population collapsed")

    def test_frame_length_72_beats_its_null_in_every_size_class(self) -> None:
        """The measurement that picked 72 as the frame length, and rejected every reading that
        makes a larger file one larger picture.

        Closed-form permutation null per body: P(two distinct positions equal) =
        sum c_v(c_v-1) / L(L-1) -- one value shared by every lag, so lag comparison is exactly
        fair. Lag 72 dominates at n=1, 2 AND 4, while lag 72n (144 at n=2, 288 at n=4) sits at
        or BELOW its own null. A single large frame would have shown the opposite."""
        import collections

        by_n: dict[int, list[bytes]] = {}
        for title, files in sorted(self.titles.items()):
            for name, data in sorted(files.items()):
                if C.family_of(name) not in ("COMPIC", "CHARPIC"):
                    continue
                n = C.compic_size_class(len(data))
                if n is not None:
                    by_n.setdefault(n, []).append(data[2:2 + 162 * n])

        def ratio(bodies: list[bytes], lag: int, length: int) -> float:
            real = null = 0.0
            for b in bodies:
                real += sum(1 for i in range(length - lag) if b[i] == b[i + lag]) / (length - lag)
                c = collections.Counter(b)
                null += sum(v * (v - 1) for v in c.values()) / (length * (length - 1))
            return (real / len(bodies)) / (null / len(bodies))

        for n, expect_min in ((1, 3.0), (2, 2.3), (4, 4.5)):
            bodies = by_n[n]
            length = 162 * n
            r72 = ratio(bodies, 72, length)
            with self.subTest(size_class=n):
                self.assertGreater(r72, expect_min,
                                   f"n={n}: lag 72 scored {r72:.2f}x, expected > {expect_min}")
                if n > 1:
                    rn = ratio(bodies, 72 * n, length)
                    self.assertLess(rn, 1.0,
                                    f"n={n}: lag {72*n} scored {rn:.2f}x -- at/above null would "
                                    "mean the file IS one larger frame after all")
                    self.assertGreater(r72, rn * 2,
                                       f"n={n}: lag 72 must clearly beat lag {72*n}")

    def test_every_compic_file_fits_the_proportional_formula(self) -> None:
        """Zero exceptions across the whole corpus -- the headline finding of this slice.

        Mutation checked: narrowing COMPIC_CLASSES to (1, 2) (dropping the 4x class) makes this
        fail on every title that ships a 650/651-byte COMPIC (Champions, Death Knights, Curse of
        the Azure Bonds, Gateway) -- confirmed by temporarily patching COMPIC_CLASSES to (1, 2)
        below and observing bad_total > 0 for those titles before restoring it.
        """
        total_checked = 0
        for title, files in sorted(self.titles.items()):
            bad = []
            for name, data in files.items():
                if C.family_of(name) != "COMPIC":
                    continue
                total_checked += 1
                if C.compic_size_class(len(data)) is None:
                    bad.append((name, len(data)))
            self.assertEqual(bad, [], f"{title}: COMPIC files that don't fit the formula")
        self.assertGreater(total_checked, 300, "expected the full multi-title COMPIC corpus")

    def test_narrowing_the_size_classes_does_break_the_check(self) -> None:
        """Live mutation control for the test above: drop the 4x class and confirm real
        COMPIC files (650/651 bytes) then fail to classify, in at least one title.
        """
        original = C.COMPIC_CLASSES
        try:
            C.COMPIC_CLASSES = (1, 2)
            broke_somewhere = False
            for files in self.titles.values():
                for name, data in files.items():
                    if C.family_of(name) == "COMPIC" and len(data) in (650, 651):
                        if C.compic_size_class(len(data)) is None:
                            broke_somewhere = True
            self.assertTrue(broke_somewhere, "narrowing the classes should have broken something")
        finally:
            C.COMPIC_CLASSES = original

    def test_charpic_is_always_a_single_id_00_file(self) -> None:
        for title, files in sorted(self.titles.items()):
            charpics = sorted(n for n in files if C.family_of(n) == "CHARPIC")
            self.assertEqual(charpics, ["CHARPIC00"], title)

    def test_charpic_size_is_constant_except_buck_rogers(self) -> None:
        for title, files in sorted(self.titles.items()):
            if "CHARPIC00" not in files:
                continue
            size = len(files["CHARPIC00"])
            want = (C.CHARPIC_BUCK_ROGERS_SIZE if title == C.BUCK_ROGERS_MON_IS_A_DIFFERENT_LAYOUT
                    else C.CHARPIC_FIXED_SIZE)
            self.assertEqual(size, want, title)

    def test_mon_byte_153_predicts_compic_class_for_the_five_relevant_titles(self) -> None:
        """>=98% match, for the five titles the module claims this for -- not 100%, on purpose:
        DoK/CoAB/Gateway each carry exactly one unexplained mismatch (ids 43/27/07), which is
        recorded rather than hidden by loosening the corpus.
        """
        for title in C.MON_PREDICTOR_TITLES:
            files = self.titles.get(title)
            if not files:
                continue
            matched, total, mismatched = C.predictor_accuracy(files)
            self.assertGreater(total, 30, f"{title}: too few pairs to mean anything")
            pct = matched / total
            self.assertGreaterEqual(pct, 0.98, f"{title}: predictor accuracy dropped to {pct:.1%}")
            self.assertLessEqual(len(mismatched), 1, f"{title}: more than one mismatch now")

    def test_mutation_flipping_the_size_byte_lowers_measured_accuracy(self) -> None:
        """Live control: corrupt every monster's byte 153 in one title and confirm the predictor
        collapses. Directly demonstrates the accuracy check is sensitive to the very byte it
        claims is load-bearing.
        """
        files = self.titles.get("Champions of Krynn")
        if not files:
            self.skipTest("Champions of Krynn absent")
        good_matched, good_total, _ = C.predictor_accuracy(files)
        self.assertEqual(good_matched, good_total, "sanity: CoK should be 100% before mutating")

        mutated = dict(files)
        for name, data in files.items():
            if C.family_of(name) == "MON" and len(data) == 2 + C.MON_BODY_LEN:
                b = bytearray(data)
                off = 2 + C.MON_SIZE_BYTE_OFFSET
                b[off] ^= 0xFF  # scramble the size code
                mutated[name] = bytes(b)
        bad_matched, bad_total, _ = C.predictor_accuracy(mutated)
        self.assertEqual(bad_total, good_total)
        self.assertLess(bad_matched, good_matched,
                         "scrambling byte 153 should have broken the predictor")

    def test_pool_of_radiance_is_the_documented_exception_not_a_silent_pass(self) -> None:
        """The predictor is explicitly NOT claimed for Pool of Radiance. Pin that it stays a real
        measured failure (<95%) rather than quietly starting to work (which would mean something
        upstream changed) or dropping so low it suggests a bug in the harness itself (>=50%, since
        pure chance among 3-4 codes would land far above zero anyway).
        """
        files = self.titles.get("Pool of Radiance")
        if not files:
            self.skipTest("Pool of Radiance absent")
        matched, total, mismatched = C.predictor_accuracy(files)
        self.assertGreater(total, 30)
        pct = matched / total
        self.assertLess(pct, 0.95, "Pool of Radiance now matches -- update the module docstring")
        self.assertGreater(pct, 0.50, "accuracy dropped near zero -- check the harness, not PoR")

    def test_gdrive00_jump_table_is_35_clean_jmp_entries(self) -> None:
        """GDRIVE00's real residence is $C000 (upgrading the scout handoff's weak $4000 guess):
        its own vector table is exactly 35 sequential 3-byte JMP ($4C) entries with no gaps.

        Mutation checked: flipping entry 10's opcode byte away from $4C makes this fail (see
        below).
        """
        for title in ("Champions of Krynn", "Death Knights of Krynn"):
            files = self.titles.get(title)
            if not files or "GDRIVE00" not in files:
                self.skipTest(f"{title}: GDRIVE00 absent")
            body = files["GDRIVE00"][2:]
            for i in range(C.GDRIVE00_TABLE_ENTRY_COUNT):
                off = i * 3
                self.assertEqual(body[off], C.JMP_ABS_OPCODE, f"{title} entry {i} at file offset {off}")

    def test_mutation_a_corrupted_gdrive00_entry_breaks_the_table_check(self) -> None:
        files = self.titles.get("Champions of Krynn")
        if not files or "GDRIVE00" not in files:
            self.skipTest("Champions of Krynn GDRIVE00 absent")
        body = bytearray(files["GDRIVE00"][2:])
        body[10 * 3] = 0x00  # corrupt entry 10's opcode byte away from JMP ($4C)
        with self.assertRaises(AssertionError):
            for i in range(C.GDRIVE00_TABLE_ENTRY_COUNT):
                off = i * 3
                self.assertEqual(bytes(body)[off], C.JMP_ABS_OPCODE)

    def test_com_prep_c063_call_lands_inside_gdrive00_table_but_past_gdrive01_table(self) -> None:
        """The specific cross-file fact this round's disassembly established: COM.PREP calls
        $C063. That address is 3-byte-aligned INSIDE GDRIVE00's own 35-entry dispatch table
        (entry 33, target $C26E) but falls 24 bytes PAST the end of GDRIVE01's own dispatch
        table (only 25 entries, i.e. 75 bytes, $C000-$C04A) -- i.e. GDRIVE00, not GDRIVE01, is
        the overlay resident at $C000 for this call site. Table lengths are re-derived from the
        bytes via `gdrive_table_entries`, not assumed.

        An earlier draft of this test tried "is $C063 a decodable instruction under GDRIVE01" and
        that mutation-check legitimately caught the draft's own flaw: BRK ($00) is a valid 1-byte
        opcode, so a naive linear walk "decodes" through almost any byte run, including plain
        data -- not usable as evidence either way. This version instead checks table ALIGNMENT
        and LENGTH, both of which are real structural properties, not decode artifacts.
        """
        files = self.titles.get("Champions of Krynn")
        if not files:
            self.skipTest("Champions of Krynn absent")
        for name in ("COM.PREP", "GDRIVE00", "GDRIVE01"):
            if name not in files:
                self.skipTest(f"Champions of Krynn: {name} absent")
        comprep = files["COM.PREP"][2:]
        gdrive00 = files["GDRIVE00"][2:]
        gdrive01 = files["GDRIVE01"][2:]

        calls = C.absolute_call_targets(comprep, 0x0800, 0xC000, 0xCB00)
        call_targets = {target for _addr, _mnem, target in calls}
        self.assertIn(0xC063, call_targets, "COM.PREP no longer calls $C063 -- re-derive the doc")

        g0_entries = C.gdrive_table_entries(gdrive00, 40)
        g1_entries = C.gdrive_table_entries(gdrive01, 40)
        rel = 0xC063 - 0xC000
        self.assertEqual(rel % 3, 0, "sanity: $C063 should be 3-byte aligned to a table slot")
        index = rel // 3

        self.assertLess(index, len(g0_entries), "GDRIVE00's table should reach entry 33")
        self.assertEqual(g0_entries[index], 0xC26E, "GDRIVE00 entry 33 should target $C26E")

        self.assertGreaterEqual(index, len(g1_entries), "GDRIVE01's table should NOT reach entry 33")

    def test_mutation_extending_gdrive01s_apparent_table_breaks_the_past_end_check(self) -> None:
        """Live control for the test above: if GDRIVE01's own table were (falsely) reported as
        40 entries long, entry 33 would appear valid and the check above would wrongly pass --
        confirm the length-derivation is what does the work, by directly overriding it.
        """
        files = self.titles.get("Champions of Krynn")
        if not files or "GDRIVE01" not in files:
            self.skipTest("Champions of Krynn GDRIVE01 absent")
        gdrive01 = files["GDRIVE01"][2:]
        real_entries = C.gdrive_table_entries(gdrive01, 40)
        self.assertLess(33, 40)  # sanity on the index used below
        fabricated_entries = real_entries + [0] * (40 - len(real_entries))  # pretend it's 40 long
        self.assertGreaterEqual(33, len(real_entries), "the real (correct) length excludes index 33")
        self.assertLess(33, len(fabricated_entries), "the fabricated length wrongly includes it")

    def test_gdrive02_has_exactly_two_entry_points_not_a_parameterised_compic_blit(self) -> None:
        """GDRIVE02's full body was disassembled this round: exactly two leading JMPs ($C000 ->
        the known BIGPIC blit, $C003 -> a previously-undocumented animation/counter-tick routine),
        then real code (no third table slot). The generic byte-copy primitive at $C006 (used
        internally by the BIGPIC path with a hardcoded 1536-byte count) has ZERO external callers
        among the eight $0800-resident overlays -- ruling out "COMPIC reuses it with a smaller
        count" as the blit mechanism.
        """
        files = self.titles.get("Champions of Krynn")
        if not files or "GDRIVE02" not in files:
            self.skipTest("Champions of Krynn GDRIVE02 absent")
        gdrive02 = files["GDRIVE02"][2:]
        self.assertEqual(gdrive02[0], C.JMP_ABS_OPCODE)
        self.assertEqual(gdrive02[3], C.JMP_ABS_OPCODE)
        self.assertNotEqual(gdrive02[6], C.JMP_ABS_OPCODE, "expected real code, not a 3rd JMP slot")

        overlay_names = ["DUNGEON", "COMBAT", "CAMP", "COM.PREP", "POST.COM", "GEN", "LIBRARY", "INIT"]
        for name in overlay_names:
            if name not in files:
                continue
            body = files[name][2:]
            calls = C.absolute_call_targets(body, 0x0800, 0xC006, 0xC009)
            self.assertEqual(calls, [], f"{name}: unexpected external caller of GDRIVE02's $C006")

    def test_mutation_an_injected_c006_call_is_detected_by_the_scanner(self) -> None:
        """Live control for the test above: the empty-caller result is not because the scanner
        can't find hits -- inject a real JSR $C006 into a copy of DUNGEON and confirm it's found.
        """
        files = self.titles.get("Champions of Krynn")
        if not files or "DUNGEON" not in files:
            self.skipTest("Champions of Krynn DUNGEON absent")
        body = bytearray(files["DUNGEON"][2:])
        body[0:3] = bytes([0x20, 0x06, 0xC0])  # JSR $C006
        calls = C.absolute_call_targets(bytes(body), 0x0800, 0xC006, 0xC009)
        self.assertEqual(calls, [(0x0800, "JSR", 0xC006)])

    def test_literal_compic_string_is_absent_from_every_code_overlay_but_present_in_itemnames(
        self,
    ) -> None:
        """No overlay hardcodes the "COMPIC" filename -- it is built at runtime from a resource
        family-name catalog (ITEMNAMES holds one such catalog: "...CHARPIC00COMPIC00ITEMFILE00").
        ITEMNAMES is the positive control proving the search itself works.
        """
        files = self.titles.get("Champions of Krynn")
        if not files:
            self.skipTest("Champions of Krynn absent")
        code_overlays = [
            "COM.PREP", "COMBAT", "GDRIVE00", "GDRIVE01", "GDRIVE02",
            "DUNGEON", "CAMP", "GEN", "LIBRARY", "POST.COM", "INIT", "LINKER",
        ]
        for name in code_overlays:
            if name not in files:
                continue
            self.assertNotIn(b"COMPIC", files[name], name)
        if "ITEMNAMES" not in files:
            self.skipTest("Champions of Krynn ITEMNAMES absent")
        self.assertIn(b"COMPIC", files["ITEMNAMES"])

    def test_mutation_removing_compic_from_itemnames_breaks_the_positive_control(self) -> None:
        files = self.titles.get("Champions of Krynn")
        if not files or "ITEMNAMES" not in files:
            self.skipTest("Champions of Krynn ITEMNAMES absent")
        scrubbed = files["ITEMNAMES"].replace(b"COMPIC", b"XXXXXX")
        self.assertNotIn(b"COMPIC", scrubbed)

    # -----------------------------------------------------------------------------------------
    # Frame shape and unit composition, settled 2026-08-14 against the DOS release as an oracle.
    # -----------------------------------------------------------------------------------------

    def _oracle_pairs(self) -> list[tuple[str, str, bytes, bytes, int, int, list[list[int]]]]:
        """(title, c64_name, compic_body, mon_body, dos_w, dos_h, dos_mask) for every n>1 COMPIC
        that has a decodable DOS CPIC block of the same id."""
        pairs = []
        for title, dos_dir in DOS_ORACLE_INSTALLS.items():
            files = self.titles.get(title)
            if not files or not dos_dir.is_dir():
                continue
            dos = _dos_cpic_frames(dos_dir)
            if not dos:
                continue
            for name, data in sorted(files.items()):
                if C.family_of(name) != "COMPIC":
                    continue
                units = C.compic_size_class(len(data))
                if units not in (2, 4):
                    continue
                hex_id = name[len("COMPIC"):]
                block = dos.get(int(hex_id, 16))
                mon = files.get("MON" + hex_id)
                if block is None or mon is None or len(mon) < 2 + C.MON_BODY_LEN:
                    continue
                width, height, mask = block
                pairs.append((title, name, data[2:2 + C.COMPIC_UNIT * units], mon[2:],
                              width, height, mask))
        return pairs

    def test_mon_byte_153_selects_the_frame_shape_not_merely_the_size_class(self) -> None:
        """The DOS release names each monster picture's real width and height, and byte 153
        predicts it with zero exceptions across every matched block.

        This is the finding that makes codes 2 and 3 make sense: both mean "2 units", and the
        pair is exactly the tall/wide split. Byte 153 is a SHAPE code.
        """
        # Scoped to the titles where byte 153 is already documented to hold. Pool of Radiance is
        # excluded by MON_PREDICTOR_TITLES and really does break here: its COMPIC09 and COMPIC16
        # are two-unit files whose MON record carries code 1. That is the SAME known predictor
        # failure, not a new one, and it is asserted as a known exception below rather than
        # quietly filtered.
        pairs = [p for p in self._oracle_pairs() if p[0] in C.MON_PREDICTOR_TITLES]
        if len(pairs) < 50:
            self.skipTest(f"only {len(pairs)} C64/DOS COMPIC pairs available")
        seen: collections.Counter = collections.Counter()
        exceptions = []
        for title, name, _body, mon, width, height, _mask in pairs:
            code = mon[C.MON_SIZE_BYTE_OFFSET] & 0x7F
            # The expectation is READ FROM THE MODULE, not restated here, so that a wrong shape
            # table makes this test red instead of passing against a private copy of the answer.
            shape = C.mon_frame_shape(mon)
            want = (shape[0] * 24, shape[1] * 24) if shape else None
            if want is None:
                exceptions.append((title, name, code, "unknown code"))
                continue
            # One Curse of the Azure Bonds block is 40x24 rather than 48x24: a narrower drawing
            # in the same wide shape class, not a different composition. Width is allowed to be
            # under-full; the ROW COUNT is what the shape code fixes.
            if height != want[1] or width > want[0]:
                exceptions.append((title, name, code, f"{width}x{height} != {want}"))
            seen[(code, width, height)] += 1
        self.assertEqual(exceptions, [], f"shape-code exceptions: {exceptions}")
        for code in (2, 3, 4):
            got = sum(c for (k, _w, _h), c in seen.items() if k == code)
            self.assertGreater(got, 0, f"no blocks measured for shape code {code}")

    def test_pool_of_radiance_is_still_the_documented_exception_to_byte_153(self) -> None:
        """The excluded title stays excluded for a measured reason, not by assumption.

        Two Pool of Radiance monsters ship a two-unit COMPIC while their MON record says code 1
        (one unit). If that ever stops being true the exclusion should be revisited, so it is
        pinned here rather than left as a remark in a docstring.
        """
        bad = [(name, mon[C.MON_SIZE_BYTE_OFFSET] & 0x7F)
               for title, name, body, mon, _w, _h, _m in self._oracle_pairs()
               if title == "Pool of Radiance"
               and C._MON_CODE_TO_CLASS.get(mon[C.MON_SIZE_BYTE_OFFSET] & 0x7F)
               != len(body) // C.COMPIC_UNIT]
        self.assertNotIn("Pool of Radiance", C.MON_PREDICTOR_TITLES)
        if not self.titles.get("Pool of Radiance"):
            self.skipTest("Pool of Radiance absent")
        self.assertEqual(sorted(bad), [("COMPIC09", 1), ("COMPIC16", 1)])

    def test_mutating_the_shape_table_breaks_the_dos_shape_agreement(self) -> None:
        """The probe above must be able to fail: swap the tall and wide shapes and it does."""
        pairs = self._oracle_pairs()
        if len(pairs) < 60:
            self.skipTest("oracle pairs unavailable")
        swapped = dict(C._SHAPE_BY_MON_CODE)
        swapped[2], swapped[3] = C._SHAPE_BY_MON_CODE[3], C._SHAPE_BY_MON_CODE[2]
        original = C._SHAPE_BY_MON_CODE
        try:
            C._SHAPE_BY_MON_CODE = swapped
            bad = 0
            for _title, _name, _body, mon, width, height, _mask in pairs:
                shape = C.mon_frame_shape(mon)
                if shape and (height != shape[1] * 24 or width > shape[0] * 24):
                    bad += 1
        finally:
            C._SHAPE_BY_MON_CODE = original
        self.assertGreater(bad, 50, "a swapped shape table must produce many mismatches")

    def test_the_unit_order_beats_its_reversal_against_the_dos_oracle(self) -> None:
        """Units fill the frame column by column, RIGHT TO LEFT, top-to-bottom within a column.

        Scored as ink agreement between the composed C64 picture and the DOS picture of the same
        monster, with the reversed order as the comparison. Both two-unit shapes are decided by a
        wide margin; the reversal loses in both.
        """
        pairs = [p for p in self._oracle_pairs() if len(p[2]) // C.COMPIC_UNIT == 2]
        if len(pairs) < 60:
            self.skipTest(f"only {len(pairs)} two-unit oracle pairs available")
        wins: collections.Counter = collections.Counter()
        for _title, _name, body, mon, width, height, mask in pairs:
            shape = C.mon_frame_shape(mon)
            self.assertIsNotNone(shape)
            cols, rows, order = shape
            if (cols * 24, rows * 24) != (48, 24) and (cols * 24, rows * 24) != (24, 48):
                continue
            if len(mask) != rows * 24 or len(mask[0]) != cols * 24:
                continue  # the one 40x24 block: not directly comparable pixel-for-pixel
            reversed_shape = (cols, rows, tuple(reversed(order)))
            best_real = max(_ink_agreement(_ink(C.compose_compic(body, shape, pose)), mask)
                            for pose in (0, 1))
            best_rev = max(_ink_agreement(_ink(C.compose_compic(body, reversed_shape, pose)), mask)
                           for pose in (0, 1))
            key = "tall" if rows == 2 else "wide"
            wins[(key, best_real > best_rev)] += 1
        for key in ("wide", "tall"):
            right, wrong = wins[(key, True)], wins[(key, False)]
            self.assertGreater(right + wrong, 20, f"too few {key} pairs measured")
            self.assertGreater(right, 4 * wrong,
                               f"{key}: documented order won {right}, reversal won {wrong}")

    def test_the_48x48_bottom_row_order_is_unanimous_against_the_dos_oracle(self) -> None:
        """For the four-unit shape the bottom row (left=unit 3, right=unit 1) is unanimous.

        Reported separately from the top row on purpose. The top row (left=unit 2, right=unit 0)
        follows the same right-to-left rule and every informative case agrees with it, but it is
        NOT unanimous -- see the module docstring in c64_compic.py. Pinning only the part that
        is unanimous keeps this test honest about which half of the claim is strong.
        """
        pairs = [p for p in self._oracle_pairs() if len(p[2]) // C.COMPIC_UNIT == 4]
        if len(pairs) < 15:
            self.skipTest(f"only {len(pairs)} four-unit oracle pairs available")
        distinct: dict[bytes, tuple] = {}
        for p in pairs:
            distinct.setdefault(p[2], p)  # the same art ships in several titles; count it once
        self.assertGreaterEqual(len(distinct), 15, "too few distinct 48x48 pictures")
        # Read the bottom-row slots from the module's own table (raster slots 2 and 3) so that a
        # wrong constant fails here rather than being restated as a literal.
        _cols, _rows, order = C.frame_shape(4)
        bl_unit, br_unit = order[2], order[3]
        right = wrong = 0
        for _title, _name, body, _mon, width, height, mask in distinct.values():
            if (width, height) != (48, 48):
                continue
            tiles = [_ink(C.decode_frame(*C.unit_frames(u)[0]))
                     for u in C.compic_units(body)]
            quad = {(cx, cy): [r[cx * 24:(cx + 1) * 24] for r in mask[cy * 24:(cy + 1) * 24]]
                    for cx in (0, 1) for cy in (0, 1)}
            rule = (_ink_agreement(tiles[bl_unit], quad[(0, 1)])
                    + _ink_agreement(tiles[br_unit], quad[(1, 1)]))
            swap = (_ink_agreement(tiles[br_unit], quad[(0, 1)])
                    + _ink_agreement(tiles[bl_unit], quad[(1, 1)]))
            right += rule > swap
            wrong += rule <= swap
        self.assertGreater(right, 14, f"bottom-row rule won only {right} of {right + wrong}")
        self.assertEqual(wrong, 0, "the bottom-row order is documented as unanimous")

    def test_the_variable_size_pic_family_is_88x88_in_the_dos_release(self) -> None:
        """The variable `PIC*` family has no pixel decoder, but its SHAPE is known (§1.4a).

        Its DOS counterpart blocks are animation arrays, not single frames, so
        `parse_standard_frame` returns None for all of them -- a first pass using it reported
        zero pairs, which was the wrong parser rather than missing data. Read with
        `parse_anim_array(is_pic=True)` they pair, and every paired block is 88x88.

        This bounds the unsolved problem: whatever the C64 encoding is, it must produce an
        88x88 multicolour picture (11x11 character cells). Pinned so the constant cannot drift
        and so the pairing is re-checked whenever the DOS parsers change.
        """
        import subframe_decode  # noqa: PLC0415 - only this test needs the anim-array parser

        paired = unpaired = 0
        sizes: collections.Counter = collections.Counter()
        for title, dos_dir in DOS_ORACLE_INSTALLS.items():
            files = self.titles.get(title)
            if not files or not dos_dir.is_dir():
                continue
            dos: dict[int, list[tuple[int, int]]] = {}
            for path in sorted(p for p in dos_dir.rglob("*")
                               if p.suffix.lower() == ".dax"
                               and p.stem.upper().startswith("PIC")):
                data = path.read_bytes()
                try:
                    base, blocks = dax_decode.parse_container(data)
                except ValueError:
                    continue
                for blk in blocks:
                    if blk.block_id in dos:
                        continue
                    try:
                        raw = dax_decode.decompress_block(data, base, blk)
                    except Exception:  # noqa: BLE001
                        continue
                    parsed = subframe_decode.parse_anim_array(raw, is_pic=True)
                    if parsed:
                        dos[blk.block_id] = [(f["width"], f["height"]) for f in parsed[0]]
            if not dos:
                continue
            for name, data in sorted(files.items()):
                if C.family_of(name) != "PIC" or len(data) in (2681, 2682):
                    continue
                hit = dos.get(int(name[len("PIC"):], 16))
                if hit is None:
                    unpaired += 1
                    continue
                paired += 1
                for dims in hit:
                    sizes[dims] += 1
        # Skip only when the SOURCES are absent. If the sources are present, a collapsed pairing
        # must FAIL -- otherwise a broken parser degrades this to a skip, and a skip reads as
        # green exactly like the never-run suites this project has been bitten by before.
        sources_present = sum(1 for t, d in DOS_ORACLE_INSTALLS.items()
                              if d.is_dir() and self.titles.get(t))
        if sources_present == 0:
            self.skipTest("no paired C64 set + DOS install present")
        self.assertGreater(paired, 200,
                           f"{sources_present} source pairs present but only {paired} files "
                           f"paired -- the DOS PIC parser or the id pairing has broken")
        self.assertEqual(list(sizes), [(88, 88)],
                         f"DOS variable-PIC frames are not all 88x88: {dict(sizes)}")
        self.assertGreater(paired, 4 * unpaired,
                           f"{unpaired} unpaired against {paired} paired -- pairing degraded")

    def test_the_variable_pic_size_formula_hypotheses_are_refuted_with_a_null(self) -> None:
        """Both §1.4a negatives, kept as tests so neither gets re-attempted from scratch.

        `242 + 8*G` fits at chance: body length mod 8 is near-uniform, so no header offset in
        230..260 is distinguishable from any other. Asserting the NULL rather than only the
        hypothesis is the point -- "only 43 of 368 fit" means nothing without it.
        """
        lengths = [len(d) - 2 for files in self.titles.values() for n, d in files.items()
                   if C.family_of(n) == "PIC" and len(d) not in (2681, 2682)]
        if len(lengths) < 300:
            self.skipTest(f"only {len(lengths)} variable PIC files")
        fits = {off: sum(1 for L in lengths if L >= off and (L - off) % 8 == 0)
                for off in range(230, 261)}
        best = max(fits.values())
        self.assertLessEqual(fits[242], best * 0.8,
                             "242 is now the best offset -- the refutation needs revisiting")
        residues = collections.Counter(L % 8 for L in lengths)
        self.assertEqual(len(residues), 8, "every mod-8 residue should be populated")
        self.assertLess(max(residues.values()), 2 * min(residues.values()),
                        f"mod-8 residues are no longer near-uniform: {dict(residues)}")

        # Negative 3: not 9 bytes per cell either -- 8 glyph + 1 colour, the convention COMPIC
        # was just proven to use, and therefore the strongest remaining prior. It fits BELOW
        # chance, which is the whole point of stating the expectation next to the count.
        nines = sum(1 for L in lengths if L % 9 == 0)
        self.assertLess(nines, len(lengths) / 9,
                        f"{nines} of {len(lengths)} bodies divide by 9, at/above the "
                        f"{len(lengths) / 9:.1f} expected by chance -- re-open the hypothesis")

    def test_the_ssi_rle_has_no_purchase_on_variable_pic_and_the_null_proves_it(self) -> None:
        """Negative 2 of §1.4a, with the misalignment null that makes it mean something.

        Compression predicts decoded sizes converging on a constant. Asserting only "they do not
        converge" would be weak; what makes it evidence is that decoding the SAME bodies after
        dropping the first byte -- an alignment that cannot possibly be correct -- is just as
        concentrated. A decoder that reads real structure must beat its own misalignment.
        """
        bodies = [d[2:] for files in self.titles.values() for n, d in files.items()
                  if C.family_of(n) == "PIC" and len(d) not in (2681, 2682)]
        if len(bodies) < 300:
            self.skipTest(f"only {len(bodies)} variable PIC files")
        real = collections.Counter(len(dax_decode.rle_decode(b)) for b in bodies)
        null = collections.Counter(len(dax_decode.rle_decode(b[1:])) for b in bodies)
        for target in (968, 1089, 1210, 1936, 2178, 2420):
            self.assertLessEqual(real[target], 3,
                                 f"{real[target]} bodies now decode to {target} -- the RLE "
                                 f"refutation needs revisiting")
        # "Concentration" = how few distinct sizes the decode produces. Real must not be
        # meaningfully more concentrated than the deliberately misaligned control.
        self.assertGreater(len(real) * 1.2, len(null),
                           f"real decode ({len(real)} distinct sizes) is now far more "
                           f"concentrated than the misaligned null ({len(null)}) -- that would "
                           f"mean the RLE does read real structure after all")

    def _variable_pic_frame_pairs(self) -> list[tuple[str, str, int, int]]:
        """(title, c64_name, c64_body_length, dos_frame_count) for every variable-size C64 `PIC`
        file whose same-id DOS block decodes as an 88x88 animation array.

        The 304x120 class is excluded: those are the full-screen `BIGPIC` siblings whose C64 form
        is the already-solved fixed-size picture (C1.2), and they carry a near-constant length
        that would swamp the comparison.
        """
        import subframe_decode  # noqa: PLC0415 - only these tests need the anim-array parser

        rows: list[tuple[str, str, int, int]] = []
        for title, dos_dir in DOS_ORACLE_INSTALLS.items():
            files = self.titles.get(title)
            if not files or not dos_dir.is_dir():
                continue
            dos: dict[int, tuple[int, int, int]] = {}
            for path in sorted(p for p in dos_dir.rglob("*")
                               if p.suffix.lower() == ".dax"
                               and p.stem.upper().startswith("PIC")):
                data = path.read_bytes()
                try:
                    base, blocks = dax_decode.parse_container(data)
                except ValueError:
                    continue
                for blk in blocks:
                    if blk.block_id in dos:
                        continue
                    try:
                        raw = dax_decode.decompress_block(data, base, blk)
                    except Exception:  # noqa: BLE001
                        continue
                    parsed = subframe_decode.parse_anim_array(raw, is_pic=True)
                    if parsed:
                        frames = parsed[0]
                        dos[blk.block_id] = (frames[0]["width"], frames[0]["height"], len(frames))
            for name, data in sorted(files.items()):
                if C.family_of(name) != "PIC" or len(data) in (2681, 2682):
                    continue
                hit = dos.get(int(name[len("PIC"):], 16))
                if hit is None or hit[:2] != (88, 88):
                    continue
                rows.append((title, name, len(data) - 2, hit[2]))
        return rows

    @staticmethod
    def _gap_vs_null(low: list[int], high: list[int], iters: int = 4000) -> tuple[float, float]:
        """(real mean gap, largest gap over `iters` label permutations).

        The null holds the lengths fixed and only reshuffles which group each belongs to, so it
        destroys exactly the claimed association and nothing else.
        """
        rng = random.Random(20260814)
        real = sum(high) / len(high) - sum(low) / len(low)
        pool = list(low) + list(high)
        worst = 0.0
        for _ in range(iters):
            rng.shuffle(pool)
            gap = (sum(pool[len(low):]) / len(high)) - (sum(pool[:len(low)]) / len(low))
            worst = max(worst, gap)
        return real, worst

    def test_an_animated_dos_sibling_predicts_a_larger_c64_variable_pic_file(self) -> None:
        """§1.4b: the first POSITIVE predictor this family has ever had.

        Whether the DOS block animates at all is visible from the oracle, and C64 files whose
        sibling animates are ~490 bytes larger. The null permutes the animated/still labels, so
        it destroys the association while holding every length fixed.

        This is a distributional shift, not a constant addend -- the ranges overlap almost
        completely -- which is why the assertion is on group means against a permutation null
        rather than on any per-file arithmetic.
        """
        rows = self._variable_pic_frame_pairs()
        if len(rows) < 200:
            self.skipTest(f"only {len(rows)} paired variable-PIC files")
        still = [L for _t, _n, L, nf in rows if nf == 1]
        anim = [L for _t, _n, L, nf in rows if nf >= 2]
        self.assertGreater(min(len(still), len(anim)), 50, "one group is too small to compare")
        gap, worst_null = self._gap_vs_null(still, anim)
        self.assertGreater(gap, worst_null,
                           f"animated-sibling gap {gap:.1f} no longer beats the largest of "
                           f"4000 label permutations ({worst_null:.1f})")
        self.assertGreater(gap, 300, f"gap collapsed to {gap:.1f} bytes")

    def test_the_c64_pic_length_does_not_grow_past_the_second_dos_pose(self) -> None:
        """§1.4b's negative, and the one that fixes the finding's meaning.

        The obvious reading of the gap above is "the C64 file stores the DOS frames", which
        predicts length rising with the frame count. It does not: going from 1 to 2 poses costs
        real bytes, going from 2 to 3-or-more costs nothing distinguishable from the null. That
        matches the SOLVED COMPIC family, which stores exactly two poses (frame A / frame B,
        the DOS `N` / `N|0x80` pair) regardless of how many the DOS side has.

        Asserting the saturation is what stops a future round reading the positive result as
        per-frame storage and going looking for eight frames that are not there.
        """
        rows = self._variable_pic_frame_pairs()
        if len(rows) < 200:
            self.skipTest(f"only {len(rows)} paired variable-PIC files")
        still = [L for _t, _n, L, nf in rows if nf == 1]
        two = [L for _t, _n, L, nf in rows if nf == 2]
        more = [L for _t, _n, L, nf in rows if nf >= 3]
        if min(len(still), len(two), len(more)) < 10:
            self.skipTest("frame-count groups too small")
        step_one, worst_one = self._gap_vs_null(still, two)
        self.assertGreater(step_one, worst_one,
                           f"the 1->2 pose step ({step_one:.1f}) no longer beats its null "
                           f"({worst_one:.1f})")
        step_two, worst_two = self._gap_vs_null(two, more)
        self.assertLess(step_two, worst_two,
                        f"the 2->3+ step is now {step_two:.1f}, above its null {worst_two:.1f} "
                        f"-- length DOES track the frame count, so the two-pose reading is wrong")

    def test_the_animated_pic_gap_is_not_explained_by_more_elaborate_art(self) -> None:
        """The rival explanation, tested rather than dismissed.

        Animated monsters could simply be busier pictures, which would enlarge the C64 file under
        any size-following encoding with no extra section involved. Both complexity proxies are
        read off the same DOS pixels the frame count came from, and neither predicts C64 length.
        """
        import subframe_decode  # noqa: PLC0415

        rows: list[tuple[int, int, float]] = []
        for title, dos_dir in DOS_ORACLE_INSTALLS.items():
            files = self.titles.get(title)
            if not files or not dos_dir.is_dir():
                continue
            dos: dict[int, tuple[int, float]] = {}
            for path in sorted(p for p in dos_dir.rglob("*")
                               if p.suffix.lower() == ".dax"
                               and p.stem.upper().startswith("PIC")):
                data = path.read_bytes()
                try:
                    base, blocks = dax_decode.parse_container(data)
                except ValueError:
                    continue
                for blk in blocks:
                    if blk.block_id in dos:
                        continue
                    try:
                        raw = dax_decode.decompress_block(data, base, blk)
                    except Exception:  # noqa: BLE001
                        continue
                    parsed = subframe_decode.parse_anim_array(raw, is_pic=True)
                    if not parsed or (parsed[0][0]["width"], parsed[0][0]["height"]) != (88, 88):
                        continue
                    px = parsed[0][0]["pixels"]
                    ink = sum(bool(b >> 4) + bool(b & 15) for b in px) / max(1, 2 * len(px))
                    dos[blk.block_id] = (len(parsed[0]), ink)
            for name, data in sorted(files.items()):
                if C.family_of(name) != "PIC" or len(data) in (2681, 2682):
                    continue
                hit = dos.get(int(name[len("PIC"):], 16))
                if hit is not None:
                    rows.append((len(data) - 2, hit[0], hit[1]))
        if len(rows) < 200:
            self.skipTest(f"only {len(rows)} paired variable-PIC files")

        inks = sorted(r[2] for r in rows)
        edges = [inks[len(inks) * k // 4] for k in range(1, 4)]
        bins = [sum(1 for e in edges if r[2] >= e) for r in rows]
        agreeing = 0
        comparable = 0
        for b in range(4):
            still = [L for (L, nf, _), bb in zip(rows, bins) if bb == b and nf == 1]
            anim = [L for (L, nf, _), bb in zip(rows, bins) if bb == b and nf >= 2]
            if len(still) < 5 or len(anim) < 5:
                continue
            comparable += 1
            agreeing += (sum(anim) / len(anim) - sum(still) / len(still)) > 200
        self.assertGreaterEqual(comparable, 3, "too few ink bins had both groups")
        self.assertEqual(agreeing, comparable,
                         f"the gap survived in only {agreeing} of {comparable} ink-matched bins "
                         f"-- it may be art complexity rather than an animation-carried section")

    # -----------------------------------------------------------------------------------------
    # §1.4c: the variable-PIC header. C64-side only -- no oracle, so it covers every title.
    # -----------------------------------------------------------------------------------------

    #: Bodies that carry the family name but are not pictures, each identified rather than
    #: waved off as noise. PIC64 is the shared 1541 directory-scan loader (6502 code); the Buck
    #: Rogers block opens with PETSCII runs and reads as a text screen. PIC3A/PIC4F/PIC41 are
    #: genuinely unexplained and are listed so the count stays honest.
    NON_PICTURE_PIC = {
        "PIC64",                                            # 6502 code, all seven titles
        "PIC6D", "PIC7A", "PIC7B", "PIC7C", "PIC7D", "PIC7E",  # Buck Rogers text screens
        "PIC3A", "PIC4F", "PIC41",                          # unexplained
    }

    def _variable_pic_bodies(self) -> list[tuple[str, str, bytes]]:
        """(title, name, body) for every variable-size C64 `PIC`, all seven titles.

        No DOS install is consulted: the header is a property of the C64 file alone, which is why
        this covers 368 files where the oracle-based tests above reach only the 288 that pair.
        """
        out = []
        for title, files in self.titles.items():
            for name, data in sorted(files.items()):
                if C.family_of(name) != "PIC" or len(data) in (2681, 2682):
                    continue
                out.append((title, name, data[2:]))
        return out

    @staticmethod
    def _pic_sequence(body: bytes) -> bytes | None:
        """The NUL-terminated frame-id sequence, or None if this body does not conform."""
        run = 0
        while run < len(body) and body[run] != 0:
            run += 1
        if not (1 <= run <= 8) or len(body) < 33:
            return None
        if any(b != 0 for b in body[run:32]) or body[32] == 0:
            return None
        return body[:run]

    def test_the_variable_pic_header_is_32_bytes_holding_an_animation_sequence(self) -> None:
        """Picture data starts at offset 32 exactly, after a NUL-terminated, zero-padded sequence.

        The assertion is on the count of conforming files AND on the identity of every exception,
        so a future change cannot quietly grow the exception list: `NON_PICTURE_PIC` names each
        one, and an unlisted failure fails the test.
        """
        bodies = self._variable_pic_bodies()
        if len(bodies) < 300:
            self.skipTest(f"only {len(bodies)} variable-PIC files present")
        bad = [name for _t, name, body in bodies if self._pic_sequence(body) is None]
        self.assertTrue(set(bad) <= self.NON_PICTURE_PIC,
                        f"new non-conforming variable-PIC bodies: {sorted(set(bad) - self.NON_PICTURE_PIC)}")
        conforming = len(bodies) - len(bad)
        self.assertGreater(conforming, 340,
                           f"only {conforming} of {len(bodies)} bodies carry the 32-byte header")

    def test_the_variable_pic_frame_ids_are_a_sequence_not_a_table(self) -> None:
        """Two facts that together rule out reading the header as a frame TABLE.

        The alphabet is exactly 0x41..0x49 ('A'..'I'), and some sequences repeat an id -- `ABCB`
        is a ping-pong loop, so a repeated entry cannot be a table slot. If this ever became a
        table, the repeats would vanish, which is what the second assertion watches.
        """
        bodies = self._variable_pic_bodies()
        if len(bodies) < 300:
            self.skipTest(f"only {len(bodies)} variable-PIC files present")
        seqs = [s for _t, _n, b in bodies if (s := self._pic_sequence(b)) is not None]
        alphabet = {v for s in seqs for v in s}
        self.assertTrue(alphabet <= set(range(0x41, 0x4A)),
                        f"frame ids outside 'A'..'I': {sorted(alphabet - set(range(0x41, 0x4A)))}")
        self.assertIn(0x41, alphabet)
        repeats = [s for s in seqs if len(set(s)) != len(s)]
        self.assertGreater(len(repeats), 20,
                           "no sequence repeats an id any more -- if the header became a frame "
                           "table this test's premise is gone and §1.4c needs revisiting")
        self.assertLessEqual(max(len(set(s)) for s in seqs), 6)

    def test_the_c64_frame_count_beats_the_dos_frame_count_as_a_length_predictor(self) -> None:
        """§1.4c's correction to §1.4b, and the reason the correction was possible.

        §1.4b had to borrow the frame count from the DOS oracle. The header supplies it directly,
        and it predicts length better. Asserting the ORDER of the two correlations is the point:
        it is what says the header's K is the real quantity and the DOS count was a proxy for it.
        """
        rows = self._variable_pic_frame_pairs()
        if len(rows) < 200:
            self.skipTest(f"only {len(rows)} paired variable-PIC files")
        bodies = {(t, n): b for t, n, b in self._variable_pic_bodies()}
        lens: list[int] = []
        ks: list[int] = []
        nfs: list[int] = []
        for title, name, length, nf in rows:
            body = bodies.get((title, name))
            if body is None:
                continue
            seq = self._pic_sequence(body)
            if seq is None:
                continue
            lens.append(length)
            ks.append(len(set(seq)))
            nfs.append(nf)
        # The skip may only be gated on the SOURCES (`rows`, which needs a DOS install), never on
        # `lens`, which counts conforming bodies and is downstream of the header parse under test.
        # Gating on `lens` let a mutation that shifts every body by one byte degrade this to a
        # skip -- and a skip reads as green.
        self.assertGreater(len(lens), 100,
                           f"{len(rows)} paired files but only {len(lens)} conforming bodies -- "
                           f"the 32-byte header parse has broken")

        def pearson(xs: list[int], ys: list[int]) -> float:
            n = len(xs)
            mx, my = sum(xs) / n, sum(ys) / n
            num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
            dx = sum((x - mx) ** 2 for x in xs) ** 0.5
            dy = sum((y - my) ** 2 for y in ys) ** 0.5
            return num / (dx * dy) if dx and dy else 0.0

        r_k = pearson(ks, lens)
        r_nf = pearson(nfs, lens)
        rng = random.Random(20260814)
        worst = 0.0
        for _ in range(2000):
            shuffled = lens[:]
            rng.shuffle(shuffled)
            worst = max(worst, pearson(ks, shuffled))
        self.assertGreater(r_k, worst,
                           f"r(len, K)={r_k:.3f} no longer beats the largest of 2000 "
                           f"permutations ({worst:.3f})")
        self.assertGreater(r_k, r_nf,
                           f"the C64 header's own frame count ({r_k:.3f}) no longer beats the "
                           f"DOS frame count ({r_nf:.3f}) -- §1.4c's central claim")

    #: The fixed part of the sub-header at offsets 32..55, as `offset -> value`. The four
    #: geometry fields are split out below because they are the ones that carry meaning.
    SUBHEADER_CONSTANTS = {36: 0x01, 41: 0x01, 42: 0x01, 43: 0x01, 52: 0xF0, 55: 0xD8}

    @staticmethod
    def _subheader_geometry(body: bytes) -> tuple[int, int, int, int] | None:
        """`(cells_wide, cells_tall, bitmap_bytes, cell_count)` from offsets 45..50."""
        if len(body) < 56:
            return None
        return (body[45], body[46],
                body[47] | (body[48] << 8),
                body[49] | (body[50] << 8))

    def test_the_variable_pic_subheader_declares_its_own_geometry(self) -> None:
        """§1.4d: the C64 file states 88x88 itself, so the shape no longer needs the DOS oracle.

        Four mutually consistent fields -- 11, 11, 11*11*8 and 11*11 -- plus six invariant bytes
        and a pointer whose high byte is always $D8 (colour RAM). The assertion is that EVERY
        conforming body agrees, which is what lets §1.4a's oracle-bound 88x88 claim be restated
        for the 32 unpaired files and for Buck Rogers, which has no DOS `CPIC` archive at all.
        """
        bodies = self._variable_pic_bodies()
        if len(bodies) < 300:
            self.skipTest(f"only {len(bodies)} variable-PIC files present")
        conforming = [(n, b) for _t, n, b in bodies if self._pic_sequence(b) is not None]
        # Gated on the file count, never on how many bodies survive the geometry read -- that
        # quantity is the one under test, and a skip reads as green.
        self.assertGreater(len(conforming), 340,
                           f"only {len(conforming)} bodies carry the 32-byte header")
        bad_geom = [n for n, b in conforming
                    if self._subheader_geometry(b) != (11, 11, 968, 121)]
        self.assertEqual(bad_geom, [],
                         f"{len(bad_geom)} bodies disagree with 11x11 / 968 / 121: {bad_geom[:8]}")
        for off, want in sorted(self.SUBHEADER_CONSTANTS.items()):
            bad = [n for n, b in conforming if b[off] != want]
            self.assertEqual(bad, [], f"offset {off} is no longer always {want:#04x}: {bad[:8]}")

    def test_the_solved_fixed_size_pic_has_no_such_subheader(self) -> None:
        """The control that makes those offsets mean something.

        Constants at chosen offsets prove nothing until a comparable file WITHOUT the format is
        checked at the same offsets. The 37 solved fixed-size `PIC` bodies are that file: at
        45..50 they carry scattered values and no body declares the geometry.
        """
        fixed = [(n, d[2:]) for _t, files in self.titles.items()
                 for n, d in sorted(files.items())
                 if C.family_of(n) == "PIC" and len(d) in (2681, 2682)]
        if len(fixed) < 20:
            self.skipTest(f"only {len(fixed)} fixed-size PIC files present")
        declaring = [n for n, b in fixed if self._subheader_geometry(b) == (11, 11, 968, 121)]
        self.assertEqual(declaring, [],
                         f"the fixed-size control now declares the variable format's geometry "
                         f"({declaring[:8]}) -- the offsets are not specific after all")
        widths = collections.Counter(b[45] for _n, b in fixed)
        self.assertGreater(len(widths), 3,
                           f"offset 45 is nearly constant in the control too ({widths}) -- it may "
                           f"be an artifact of the corpus rather than of the format")

    def test_the_variable_pic_payload_is_not_the_ssi_rle_in_either_polarity(self) -> None:
        """The honest negative, now sharp: the expected output size is declared, not guessed.

        The sub-header says the picture is 968 bitmap bytes + 121 screen codes + 121 colour
        bytes = 1210. Decoding the payload with the corpus's own RLE -- both polarities, four
        plausible start offsets -- lands within +-20 of that for a handful of the 211 single-frame
        files, i.e. at chance. This test PINS the gap: solving the codec is expected to fail it.
        """
        bodies = self._variable_pic_bodies()
        if len(bodies) < 300:
            self.skipTest(f"only {len(bodies)} variable-PIC files present")
        stills = [b for _t, _n, b in bodies
                  if (s := self._pic_sequence(b)) is not None and len(set(s)) == 1
                  and self._subheader_geometry(b) == (11, 11, 968, 121)]
        self.assertGreater(len(stills), 150, f"only {len(stills)} single-frame conforming bodies")

        def rle(buf: bytes, inverted: bool) -> int:
            """Length produced before running out of input; 0 if the stream is malformed."""
            out, i = 0, 0
            while i < len(buf) and out < 4096:
                c = buf[i]
                i += 1
                literal = (c >= 0x80) if inverted else (c < 0x80)
                if literal:
                    n = (c & 0x7F) + 1
                    out += n
                    i += n
                else:
                    if i >= len(buf):
                        return 0
                    out += 256 - c if not inverted else (c & 0x7F) + 2
                    i += 1
            return out

        target = 968 + 121 + 121
        best = 0
        for start in (52, 56, 57, 58):
            for inverted in (False, True):
                hits = sum(1 for b in stills if abs(rle(b[start:], inverted) - target) <= 20)
                best = max(best, hits)
        self.assertLess(best, len(stills) // 8,
                        f"{best} of {len(stills)} single-frame payloads now RLE-decode to "
                        f"{target}+-20 -- if this is real the codec is solved and §1.4d's "
                        f"negative must be rewritten, not relaxed")

    # -- §1.4e: the colour section ------------------------------------------------------------

    #: Run marker. A byte >= this emits the FOLLOWING byte `256 - c` times, so runs are 2..16
    #: and `0xFF` doubles as the escape that lets a literal >= 0xF0 be stored at all.
    PIC_RUN_MARKER = 0xF0

    @classmethod
    def _pic_rle(cls, buf: bytes, want: int) -> tuple[bytes, int] | None:
        """Decode exactly `want` bytes; returns `(output, bytes consumed)` or None."""
        out = bytearray()
        i = 0
        while i < len(buf) and len(out) < want:
            c = buf[i]
            i += 1
            if c >= cls.PIC_RUN_MARKER:
                if i >= len(buf):
                    return None
                out.extend(bytes([buf[i]]) * (256 - c))
                i += 1
            else:
                out.append(c)
        return (bytes(out), i) if len(out) == want else None

    @classmethod
    def _trailing_section(cls, payload: bytes, lo: int, hi: int) -> tuple[int, bytes] | None:
        """Latest decode of 121 bytes, all in [lo, hi), that consumes to the end of `payload`.

        Bounded to the last 200 bytes: observed compressed colour sections run 29..114 bytes, so
        this cannot exclude a real one, and it keeps the search from being quadratic.
        """
        for start in range(len(payload) - 1, max(-1, len(payload) - 200), -1):
            r = cls._pic_rle(payload[start:], 121)
            if r and start + r[1] == len(payload) and all(lo <= x < hi for x in r[0]):
                return start, r[0]
        return None

    def _still_payloads(self) -> list[bytes]:
        """Payloads (offset 56 on) of the single-frame conforming variable-`PIC` bodies."""
        out = []
        for _t, _n, body in self._variable_pic_bodies():
            seq = self._pic_sequence(body)
            if seq is None or len(set(seq)) != 1:
                continue
            if self._subheader_geometry(body) != (11, 11, 968, 121):
                continue
            out.append(body[56:])
        return out

    def test_the_variable_pic_file_ends_in_a_c64_colour_ram_section(self) -> None:
        """§1.4e: the file ENDS in colour RAM, and the codec is literal-with-run-marker.

        That codec is why every SSI-RLE attempt failed: SSI stores a count first, this stores a
        value first. Note carefully what is and is not claimed -- the decode is anchored at
        end-of-file and constrained to 0..15, and the equivalent search at the START of the
        payload finds nothing, so 'last' is real. The section LENGTH is not established here;
        see the companion test.
        """
        payloads = self._still_payloads()
        # Gated on the file count only -- never on how many decode, which is the quantity here.
        self.assertGreater(len(payloads), 150,
                           f"only {len(payloads)} single-frame conforming payloads")
        hits = [p for p in payloads if self._trailing_section(p, 0, 16)]
        self.assertGreater(len(hits), 90,
                           f"only {len(hits)}/{len(payloads)} payloads end in a decodable "
                           f"colour-RAM section")
        # 'Last' is load-bearing: the same decode anchored at the payload's head must fail, or
        # the result would say nothing about where the section sits.
        leading = 0
        for p in payloads:
            r = self._pic_rle(p, 121)
            if r and all(x < 16 for x in r[0]):
                leading += 1
        self.assertEqual(leading, 0,
                         f"{leading} payloads also OPEN with 121 colour-RAM bytes -- the section "
                         f"is then not identifiable as the trailing one")

    @classmethod
    def _pic_decode_stream(cls, buf: bytes) -> bytes | None:
        """Decode the entire buffer. No search, no free parameters. None if a run is truncated."""
        out = bytearray()
        i = 0
        while i < len(buf):
            c = buf[i]
            i += 1
            if c >= cls.PIC_RUN_MARKER:
                if i >= len(buf):
                    return None
                out.extend(bytes([buf[i]]) * (256 - c))
                i += 1
            else:
                out.append(c)
        return bytes(out)

    def test_the_colour_block_is_found_without_any_search_at_all(self) -> None:
        """The strong form of §1.4e: decode the whole payload start to finish and look at the end.

        No search, no free offset, no threshold sweep -- and it beats the anchored search (155 vs
        109 files). Two confounds are asserted dead alongside it, the second being the one that
        would have made this trivial: if the last 121 RAW bytes were already < 16, the codec would
        be earning nothing. Not one file is like that.
        """
        payloads = self._still_payloads()
        self.assertGreater(len(payloads), 150,
                           f"only {len(payloads)} single-frame conforming payloads")
        decoded = [(p, o) for p in payloads
                   if (o := self._pic_decode_stream(p)) is not None and len(o) >= 121]
        self.assertEqual(len(decoded), len(payloads),
                         f"{len(payloads) - len(decoded)} payloads no longer parse as a complete "
                         f"stream -- the codec has stopped covering the corpus")
        hits = sum(1 for _p, o in decoded if all(x < 16 for x in o[-121:]))
        self.assertGreater(hits, 140,
                           f"only {hits}/{len(decoded)} whole-payload decodes end in colour RAM")
        # Confound 1: the value band, as in the anchored test.
        for lo in (16, 32, 64, 128):
            other = sum(1 for _p, o in decoded
                        if all(lo <= x < lo + 16 for x in o[-121:]))
            self.assertEqual(other, 0, f"band {lo}..{lo+15} also matches {other} files")
        # Confound 2: the codec must be doing the work, not the raw bytes.
        raw = sum(1 for p, _o in decoded if all(x < 16 for x in p[-121:]))
        self.assertEqual(raw, 0,
                         f"{raw} payloads already END in 121 bytes < 16 before decoding -- the "
                         f"result would then be 'the file ends in small bytes', not a codec")
        # The value band above is BLIND to the run arithmetic -- changing the count changes how
        # many times a byte repeats, not which byte, so `all(x < 16)` survives a wrong count (it
        # scores 181/211 under `(c & 0x0F) + 1`, i.e. higher). The expansion ratio is what
        # separates them: real 1.08..1.70, that mutant 1.87..3.80, no overlap.
        ratios = [len(o) / len(p) for p, o in decoded]
        self.assertLess(max(ratios), 1.8,
                        f"peak expansion {max(ratios):.2f} -- the run count is no longer 256-c")
        self.assertGreater(min(ratios), 1.0,
                           f"a payload now shrinks ({min(ratios):.2f}); every file must expand")

    def test_no_screen_code_section_precedes_the_colour_block(self) -> None:
        """A [glyphs][screen][colour] layout is refuted by the bytes sitting where screen would be.

        Screen codes index a per-picture charset, so they would occupy a small contiguous range.
        The 121 decoded bytes before the colour block instead look exactly like a control window
        taken from the middle of the picture data. The control is the point: without it, "these
        bytes span 0..255" would be an observation about bitmaps, not a refutation.
        """
        payloads = self._still_payloads()
        self.assertGreater(len(payloads), 150,
                           f"only {len(payloads)} single-frame conforming payloads")
        pre, ctrl = [], []
        for p in payloads:
            o = self._pic_decode_stream(p)
            if o is None or len(o) < 421 or not all(x < 16 for x in o[-121:]):
                continue
            pre.append(o[-242:-121])
            ctrl.append(o[300:421])
        self.assertGreater(len(pre), 100, f"only {len(pre)} usable windows")
        # Neither window is ever confined to a screen-code-like range.
        self.assertEqual(sum(1 for w in pre if max(w) < 128), 0,
                         "the pre-colour window now looks like screen codes -- if that is real "
                         "the layout is [glyphs][screen][colour] and §1.4e must be revised")
        self.assertEqual(sum(1 for w in ctrl if max(w) < 128), 0)
        # And it is not merely 'not screen codes' -- it is indistinguishable from the control.
        med = lambda xs: sorted(xs)[len(xs) // 2]  # noqa: E731
        self.assertLess(abs(med([len(set(w)) for w in pre]) - med([len(set(w)) for w in ctrl])),
                        15, "the pre-colour window has become distinguishable from the control")

    @staticmethod
    def _adjusted_rand(a: list[int], b: list[int]) -> float:
        """ARI from the contingency table -- O(n), and matched against an O(n^2) pair-count
        implementation to 1.7e-17 over 400 random partitions before being used here."""
        def c2(m: int) -> int:
            return m * (m - 1) // 2
        n = len(a)
        tab = collections.Counter(zip(a, b))
        ra, rb = collections.Counter(a), collections.Counter(b)
        s_ij = sum(c2(v) for v in tab.values())
        s_a = sum(c2(v) for v in ra.values())
        s_b = sum(c2(v) for v in rb.values())
        exp = s_a * s_b / c2(n) if c2(n) else 0.0
        den = 0.5 * (s_a + s_b) - exp
        return (s_ij - exp) / den if den else 0.0

    def _colour_vs_dos_cells(self) -> list[tuple[list[int], list[int]]]:
        """(DOS per-cell dominant EGA colour, decoded C64 colour section) for paired 88x88 stills.

        Same id-matching route as `_variable_pic_frame_pairs` -- the C64 filename's hex suffix is
        the DOS block id -- but it keeps the decoded pixels rather than just the frame count.
        """
        import subframe_decode  # noqa: PLC0415 - only these tests need the anim-array parser

        rows: list[tuple[list[int], list[int]]] = []
        for title, dos_dir in DOS_ORACLE_INSTALLS.items():
            files = self.titles.get(title)
            if not files or not dos_dir.is_dir():
                continue
            dos: dict[int, dict] = {}
            for path in sorted(p for p in dos_dir.rglob("*")
                               if p.suffix.lower() == ".dax"
                               and p.stem.upper().startswith("PIC")):
                data = path.read_bytes()
                try:
                    base, blocks = dax_decode.parse_container(data)
                except ValueError:
                    continue
                for blk in blocks:
                    if blk.block_id in dos:
                        continue
                    try:
                        raw = dax_decode.decompress_block(data, base, blk)
                    except Exception:  # noqa: BLE001
                        continue
                    parsed = subframe_decode.parse_anim_array(raw, is_pic=True)
                    if parsed:
                        # Frame 0 is the base picture; later frames are XOR deltas against it.
                        f = parsed[0][0]
                        if (f["width"], f["height"]) == (88, 88):
                            dos[blk.block_id] = f
            for name, data in sorted(files.items()):
                if C.family_of(name) != "PIC" or len(data) in (2681, 2682):
                    continue
                frame = dos.get(int(name[len("PIC"):], 16))
                if frame is None:
                    continue
                body = data[2:]
                seq = self._pic_sequence(body)
                if seq is None or len(set(seq)) != 1:
                    continue
                if self._subheader_geometry(body) != (11, 11, 968, 121):
                    continue
                out = self._pic_decode_stream(body[56:])
                if out is None or len(out) < 121 or not all(x < 16 for x in out[-121:]):
                    continue
                px, stride = frame["pixels"], frame["width_div8"] * 4
                cells: list[int] = []
                for cy in range(11):
                    for cx in range(11):
                        cnt: collections.Counter = collections.Counter()
                        for y in range(cy * 8, cy * 8 + 8):
                            row = y * stride
                            for x in range(cx * 8, cx * 8 + 8):
                                b = px[row + (x >> 1)]
                                cnt[(b >> 4) if (x & 1) == 0 else (b & 0x0F)] += 1
                        cells.append(cnt.most_common(1)[0][0])
                rows.append((cells, list(out[-121:])))
        return rows

    def test_the_colour_section_is_not_yet_tied_to_the_dos_picture(self) -> None:
        """The honest bound on §1.4e: colour-RAM VALUES are not the same claim as THIS picture.

        The DOS sibling is the same artwork at 88x88, so its per-cell dominant colour is a second
        partition of the same 121 cells; palettes differ but "which cells match each other" is
        palette-independent. Per-file empirical p-values against mismatched partners come out
        UNIFORM -- so the decoded section is not demonstrably this picture's colour map.

        Recorded as a test, not a footnote, because it is the difference between "a section
        decodes" and "the picture decodes". If a future decode or alignment makes the link real,
        this fails and the claim gets upgraded. Deliberately loose thresholds: it should fire on
        a genuine effect, not on noise.
        """
        # The skip may only be gated on SOURCE availability. Gating it on the row count would put
        # it downstream of `_pic_decode_stream`, so a broken decode would skip -- and read green.
        if not any(d.is_dir() for d in DOS_ORACLE_INSTALLS.values()) or not self.titles:
            self.skipTest("needs both a DOS install and the C64 disk images")
        rows = self._colour_vs_dos_cells()
        self.assertGreater(len(rows), 85,
                           f"only {len(rows)} paired 88x88 stills built from present sources -- "
                           f"the pairing or the colour decode has regressed")
        rng = random.Random(20260815)
        n = len(rows)
        pvals = []
        for k, (dos, col) in enumerate(rows):
            real = self._adjusted_rand(dos, col)
            others = rng.sample([x for x in range(n) if x != k], 16)
            beat = sum(1 for j in others if self._adjusted_rand(dos, rows[j][1]) >= real)
            pvals.append((beat + 1) / 17)
        below = sum(1 for p in pvals if p < 0.5)
        median = sorted(pvals)[n // 2]
        self.assertLess(abs(median - 0.5), 0.20,
                        f"median p {median:.3f} has moved off the null -- the C64 colour section "
                        f"may now be tied to the DOS picture; §1.4e.2's negative needs revisiting")
        self.assertLess(abs(below - n / 2), 3.5 * (n ** 0.5) / 2,
                        f"{below}/{n} files beat their controls -- no longer consistent with the "
                        f"uniform null, so the spatial link may be real")

    @staticmethod
    def _lag_equality(values: list[int], lag: int) -> float:
        """`P(v[i] == v[i+lag])`. The building block for every row-structure measurement below."""
        total = len(values) - lag
        if total <= 0:
            return 0.0
        return sum(1 for i in range(total) if values[i] == values[i + lag]) / total

    @classmethod
    def _lag_excess(cls, values: list[int], lag: int, near: tuple[int, ...] = (2, 3)) -> float:
        """Lag equality at `lag` minus its own neighbourhood.

        Runs make the raw curve decay smoothly with lag, so a raw value says nothing about rows.
        Subtracting the neighbours removes that decay by construction, which is what makes this
        statistic safe to use against data the codec has already made run-heavy.
        """
        base = [cls._lag_equality(values, lag - d) for d in near]
        base += [cls._lag_equality(values, lag + d) for d in near]
        return cls._lag_equality(values, lag) - sum(base) / len(base)

    @staticmethod
    def _run_shuffle(values: list[int], rng: random.Random) -> list[int]:
        """Permute the maximal equal-value RUNS, preserving histogram and run lengths exactly.

        The plain shuffle used elsewhere in this file destroys runs, so it only ever asks "is
        this RLE-compressible?" -- which any output of this codec is. Permuting runs holds the
        one-dimensional structure fixed and destroys only the two-dimensional arrangement, so
        what beats it is layout and nothing else.
        """
        runs: list[list[int]] = [[values[0]]]
        for x in values[1:]:
            if x == runs[-1][0]:
                runs[-1].append(x)
            else:
                runs.append([x])
        rng.shuffle(runs)
        return [x for run in runs for x in run]

    def _decoded_colour_blocks(self, length: int = 121) -> list[list[int]]:
        """The trailing `length` decoded bytes of every still whose tail reads as colour RAM."""
        out = []
        for payload in self._still_payloads():
            decoded = self._pic_decode_stream(payload)
            if decoded is None or len(decoded) < length:
                continue
            if all(x < 16 for x in decoded[-length:]):
                out.append(list(decoded[-length:]))
        return out

    def test_the_colour_block_is_a_two_dimensional_picture_map(self) -> None:
        """§1.4f: the tail is not merely colour-RAM VALUES -- it is laid out as a picture.

        §1.4e established the value band; this establishes the arrangement, and it does so from
        the C64 side alone, so it is not exposed to the redrawn-art problem that flattened the
        cross-platform test in §1.4e.2. A colour map's rows repeat: cells one row apart agree far
        more often than the surrounding lags.

        The null is the load-bearing part. A plain shuffle would have passed this for free, since
        the codec's own output is run-heavy; the run-preserving shuffle keeps the histogram AND
        every run length and destroys only the 2-D layout.
        """
        blocks = self._decoded_colour_blocks()
        # Gated on the file count, never on how many show the effect -- that is the quantity here.
        self.assertGreater(len(blocks), 120,
                           f"only {len(blocks)} decoded colour blocks -- the decode has regressed")
        rng = random.Random(20260815)
        hits, reals = 0, []
        for block in blocks:
            real = self._lag_excess(block, self.COLOUR_BLOCK_STRIDE)
            nulls = [self._lag_excess(self._run_shuffle(block, rng), self.COLOUR_BLOCK_STRIDE)
                     for _ in range(60)]
            reals.append(real)
            if (sum(1 for x in nulls if x >= real) + 1) / (len(nulls) + 1) <= 0.05:
                hits += 1
        median = sorted(reals)[len(reals) // 2]
        self.assertGreater(median, 0.05,
                           f"median row-lag excess {median:+.4f} -- the tail no longer shows the "
                           f"row structure a colour map must have")
        self.assertGreater(hits, len(blocks) // 2,
                           f"only {hits}/{len(blocks)} blocks beat the run-preserving null "
                           f"(chance is {0.05 * len(blocks):.0f})")

    #: Row stride of the decoded colour block, MEASURED -- and it disagrees with the width the
    #: sub-header declares at offset 45. See `test_the_colour_block_row_stride_...` below.
    COLOUR_BLOCK_STRIDE = 12

    def test_the_colour_block_row_stride_is_twelve_not_the_declared_eleven(self) -> None:
        """The measured stride contradicts the file's own width field, and the DOS side calibrates
        the instrument that says so.

        A bump at lag 12 means nothing until the same statistic is shown to return 11 for a map
        that IS 11 wide. The DOS sibling supplies one: identical artwork at 88x88, split into
        11x11 cells by dominant EGA colour. Identical code, identical row count, identical
        statistic -- only the source differs. DOS peaks at 11, the C64 tail peaks at 12.
        """
        # Skip only on source availability. Gating on the paired-row count would put the skip
        # downstream of the decode under test, and a skip reads exactly like a pass.
        if not any(d.is_dir() for d in DOS_ORACLE_INSTALLS.values()) or not self.titles:
            self.skipTest("needs both a DOS install and the C64 disk images")
        rows = self._colour_vs_dos_cells()
        self.assertGreater(len(rows), 85,
                           f"only {len(rows)} paired stills built from present sources")

        def peak(maps: list[list[int]]) -> tuple[int, dict[int, float]]:
            exc = {d: sum(self._lag_excess(m, d) for m in maps) / len(maps) for d in range(9, 16)}
            return max(exc, key=lambda d: exc[d]), exc

        dos_peak, dos_exc = peak([r[0] for r in rows])
        c64_peak, c64_exc = peak([r[1] for r in rows])
        self.assertEqual(dos_peak, 11,
                         f"the instrument no longer recovers the known width 11 from the DOS "
                         f"maps ({dos_exc}) -- it cannot be used to read the C64 stride")
        self.assertEqual(c64_peak, self.COLOUR_BLOCK_STRIDE,
                         f"the C64 colour block's row stride is no longer "
                         f"{self.COLOUR_BLOCK_STRIDE} ({c64_exc}) -- §1.4f needs revisiting")
        self.assertGreater(c64_exc[self.COLOUR_BLOCK_STRIDE], 2 * c64_exc[11],
                           f"11 and 12 are no longer separated ({c64_exc}); the disagreement with "
                           f"the sub-header's width field may be a measurement artifact")

    def test_no_twelfth_column_of_padding_or_duplication_explains_the_stride(self) -> None:
        """Both easy reconciliations of stride 12 with declared width 11 are refuted.

        If an 11-cell row carried one extra byte, that byte would be either constant (padding, a
        border, a row counter) or a copy of a neighbour (the usual overscan artifact). Read as 11
        rows of 12 at every phase, no column is more predictable than the others beyond what a
        shuffle produces, and no adjacent pair of columns agrees beyond ordinary picture
        neighbours. So the twelfth column carries picture-like data, and the discrepancy stands
        UNEXPLAINED rather than explained away.
        """
        blocks = self._decoded_colour_blocks(132)
        self.assertGreater(len(blocks), 100,
                           f"only {len(blocks)} blocks reach 132 trailing colour-RAM bytes")
        rng = random.Random(20260815)

        def column_spread(bs: list[list[int]], phase: int) -> float:
            means = []
            for c in range(12):
                agree = []
                for v in bs:
                    w = v[phase:] + v[:phase]
                    col = [w[r * 12 + c] for r in range(11)]
                    agree.append(collections.Counter(col).most_common(1)[0][1] / 11)
                means.append(sum(agree) / len(agree))
            return max(means) - min(means)

        real = max(column_spread(blocks, p) for p in range(12))
        # One null draw would understate the statistic, which is itself a maximum over 12 phases.
        # Twenty draws of the same maximum is the like-for-like comparison.
        nulls = []
        for _ in range(20):
            shuffled = [self._run_shuffle(v, rng) for v in blocks]
            nulls.append(max(column_spread(shuffled, p) for p in range(12)))
        beat = sum(1 for x in nulls if x >= real)
        self.assertGreater(beat, 0,
                           f"a column now stands out (spread {real:.3f} vs null max "
                           f"{max(nulls):.3f}) -- the stride may be an 11-wide row plus a "
                           f"constant, which §1.4f rules out")

        best_pair = 0.0
        for phase in range(12):
            for c in range(11):
                total = same = 0
                for v in blocks:
                    w = v[phase:] + v[:phase]
                    for r in range(11):
                        total += 1
                        same += w[r * 12 + c] == w[r * 12 + c + 1]
                best_pair = max(best_pair, same / total)
        self.assertLess(best_pair, 0.75,
                        f"columns now agree at {best_pair:.3f} -- a duplicated column would "
                        f"explain the stride, and §1.4f says none does")

    def test_the_tail_is_not_a_multicolour_bitmaps_screen_section(self) -> None:
        """`968 + 121 + 121` is the C64 multicolour BITMAP layout -- and the layout is still wrong.

        This re-runs the refutation §1.4e.1 made with the wrong prediction. That version expected
        screen bytes to occupy "a small contiguous range", which is the CHARACTER-mode reading
        (codes indexing a charset). In bitmap mode a screen byte is two colour NYBBLES and spans
        0..255 freely, so the old prediction could not have tested this layout at all.

        The bitmap-mode prediction: those nybbles come from the picture's own small colour set, so
        the window has few distinct nybble values and they overlap the colour block's values.
        Against a control window from the middle of the picture data it does neither.
        """
        payloads = self._still_payloads()
        self.assertGreater(len(payloads), 150,
                           f"only {len(payloads)} single-frame conforming payloads")
        wins = usable = 0
        distinct = {"screen": [], "control": []}
        for payload in payloads:
            decoded = self._pic_decode_stream(payload)
            if decoded is None or len(decoded) < 500:
                continue
            if not all(x < 16 for x in decoded[-121:]):
                continue
            colours = set(decoded[-121:])
            mid = len(decoded) // 2
            windows = {"screen": decoded[-242:-121], "control": decoded[mid:mid + 121]}
            counts = {}
            for key, window in windows.items():
                nybbles = {x >> 4 for x in window} | {x & 0x0F for x in window}
                counts[key] = len(nybbles)
                distinct[key].append((len(nybbles), len(nybbles & colours) / len(nybbles)))
            usable += 1
            wins += counts["screen"] < counts["control"]
        self.assertGreater(usable, 120, f"only {usable} payloads usable")
        self.assertLess(wins, 0.65 * usable,
                        f"the screen window now has fewer distinct nybbles than its control in "
                        f"{wins}/{usable} files -- the bitmap layout may hold after all")
        for key in ("screen", "control"):
            med = sorted(d for d, _f in distinct[key])[usable // 2]
            self.assertGreater(med, 12,
                               f"the {key} window now uses only {med} distinct nybbles, which is "
                               f"the small colour set a real screen section would have")

    @staticmethod
    def _repack_dos_to_c64_cell_order(frame: dict) -> bytes:
        """An 88x88 DOS frame laid out the way a C64 bitmap is: cell-major, 8 bytes per cell.

        The pixel VALUES are meaningless after this (EGA indices masked to two bits are not C64
        colour pairs) -- the point is that the spatial ARRANGEMENT is a known-correct C64 bitmap,
        which is what makes it a calibration for statistics about arrangement.
        """
        px, stride = frame["pixels"], frame["width_div8"] * 4

        def at(x: int, y: int) -> int:
            b = px[y * stride + (x >> 1)]
            return (b >> 4) if (x & 1) == 0 else (b & 0x0F)

        out = bytearray()
        for cy in range(11):
            for cx in range(11):
                for row in range(8):
                    v = 0
                    for p in range(4):
                        v = (v << 2) | (at(cx * 8 + p * 2, cy * 8 + row) & 3)
                    out.append(v)
        return bytes(out)

    def _paired_pic_complexity(self) -> list[dict]:
        """Per paired conforming variable-`PIC`: C64 sizes plus DOS complexity measures.

        Cached on the class -- four tests need it and each rebuild re-parses every DOS `PIC*.DAX`.
        """
        cached = getattr(type(self), "_complexity_cache", None)
        if cached is not None:
            return cached
        import subframe_decode  # noqa: PLC0415 - only these tests need the anim-array parser

        rows: list[dict] = []
        for title, dos_dir in DOS_ORACLE_INSTALLS.items():
            files = self.titles.get(title)
            if not files or not dos_dir.is_dir():
                continue
            dos: dict[int, list[dict]] = {}
            for path in sorted(p for p in dos_dir.rglob("*")
                               if p.suffix.lower() == ".dax"
                               and p.stem.upper().startswith("PIC")):
                data = path.read_bytes()
                try:
                    base, blocks = dax_decode.parse_container(data)
                except ValueError:
                    continue
                for blk in blocks:
                    if blk.block_id in dos:
                        continue
                    try:
                        raw = dax_decode.decompress_block(data, base, blk)
                    except Exception:  # noqa: BLE001
                        continue
                    parsed = subframe_decode.parse_anim_array(raw, is_pic=True)
                    if not parsed or not parsed[0]:
                        continue
                    f = parsed[0][0]
                    if (f["width"], f["height"]) == (88, 88):
                        dos[blk.block_id] = parsed[0]
            for name, data in sorted(files.items()):
                if C.family_of(name) != "PIC" or len(data) in (2681, 2682):
                    continue
                frames = dos.get(int(name[len("PIC"):], 16))
                if frames is None:
                    continue
                body = data[2:]
                seq = self._pic_sequence(body)
                if seq is None or self._subheader_geometry(body) != (11, 11, 968, 121):
                    continue
                bitmap = self._repack_dos_to_c64_cell_order(frames[0])
                decoded = self._pic_decode_stream(body[56:])
                head = None
                if decoded is not None and len(decoded) > 400 \
                        and all(x < 16 for x in decoded[-121:]):
                    k = 0
                    while k < len(decoded) and decoded[len(decoded) - 1 - k] < 16:
                        k += 1
                    head = decoded[:len(decoded) - k]
                rows.append({
                    "name": name, "payload": len(body) - 56, "K": len(set(seq)),
                    "head": head, "bitmap": bitmap,
                    "glyphs": len({bitmap[i:i + 8] for i in range(0, len(bitmap), 8)}),
                    "zratio": len(zlib.compress(bitmap, 9)) / len(bitmap),
                })
        type(self)._complexity_cache = rows
        return rows

    @staticmethod
    def _pearson(xs: list[float], ys: list[float]) -> float:
        n = len(xs)
        mx, my = sum(xs) / n, sum(ys) / n
        num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        dx = sum((x - mx) ** 2 for x in xs) ** 0.5
        dy = sum((y - my) ** 2 for y in ys) ** 0.5
        return num / (dx * dy) if dx and dy else 0.0

    def test_the_c64_payload_length_tracks_the_dos_pictures_complexity(self) -> None:
        """§1.4g: the first cross-platform CONTENT link this family has produced.

        §1.4e.2's null said the colour section is not tied to this picture. That is still true, and
        it is a different quantity: how many BYTES the C64 spends is tied to how complex the DOS
        picture is. Two proxies, both palette-independent -- distinct 8-byte cell patterns in the
        DOS picture repacked to C64 cell order, and the zlib ratio of that repacking.

        Null: the largest |r| over 2000 permutations of the pairing, which is the right baseline
        for "does this beat chance" and needs no distributional assumption.
        """
        if not any(d.is_dir() for d in DOS_ORACLE_INSTALLS.values()) or not self.titles:
            self.skipTest("needs both a DOS install and the C64 disk images")
        # Restricted to the single-frame files. Animation is a ~580-byte length driver in its own
        # right (§1.4b), so leaving it in the population mixes two effects and dilutes this one
        # to r=+0.23 -- which is a confound, not a weaker result.
        rows = [r for r in self._paired_pic_complexity() if r["K"] == 1]
        self.assertGreater(len(rows), 85, f"only {len(rows)} paired single-frame files")
        lengths = [float(r["payload"]) for r in rows]
        rng = random.Random(20260815)
        for key in ("glyphs", "zratio"):
            values = [float(r[key]) for r in rows]
            real = self._pearson(lengths, values)
            worst = 0.0
            for _ in range(400):
                shuffled = lengths[:]
                rng.shuffle(shuffled)
                worst = max(worst, abs(self._pearson(shuffled, values)))
            self.assertGreater(real, 2 * worst,
                               f"r(payload, {key}) = {real:+.3f} no longer clears twice the "
                               f"permutation maximum ({worst:.3f})")

    def test_the_animation_gap_survives_a_complexity_proxy_that_works(self) -> None:
        """Re-checks §1.4b's central finding, whose defence rested on a proxy that could not work.

        §1.4b established that a C64 `PIC` whose sibling animates is ~490 bytes larger, and ruled
        out "animated monsters are just busier art" using two DOS complexity proxies that predicted
        C64 length at r=0.008 and r=0.087. A control variable that cannot predict the outcome
        cannot adjust for it, so that rival explanation had not in fact been tested.

        Re-run with a proxy that predicts length at r=+0.73 the gap is untouched -- present in
        every quartile, and the within-bin mean matches the unstratified value. The finding
        stands; only its stated defence was invalid.
        """
        if not any(d.is_dir() for d in DOS_ORACLE_INSTALLS.values()) or not self.titles:
            self.skipTest("needs both a DOS install and the C64 disk images")
        rows = self._paired_pic_complexity()
        self.assertGreater(len(rows), 200, f"only {len(rows)} paired conforming files")

        def gap(sub: list[dict], key: str = "K") -> float | None:
            still = [r["payload"] for r in sub if r[key] == 1]
            anim = [r["payload"] for r in sub if r[key] >= 2]
            if len(still) < 4 or len(anim) < 4:
                return None
            return sum(anim) / len(anim) - sum(still) / len(still)

        overall = gap(rows)
        self.assertIsNotNone(overall)
        self.assertGreater(overall, 300, f"the unstratified gap has collapsed to {overall:+.1f}")
        values = sorted(r["glyphs"] for r in rows)
        cuts = [values[len(values) // 4], values[len(values) // 2], values[3 * len(values) // 4]]
        bins: list[list[dict]] = [[] for _ in range(4)]
        for r in rows:
            bins[sum(1 for c in cuts if r["glyphs"] > c)].append(r)
        within = [g for g in (gap(b) for b in bins) if g is not None]
        self.assertEqual(len(within), 4, "a complexity quartile no longer has both populations")
        self.assertGreater(min(within), 300,
                           f"the gap vanishes in at least one complexity quartile ({within}) -- "
                           f"the busier-art explanation would then be live again")
        mean_within = sum(within) / len(within)
        # Its own null: permute the animation labels and re-run the identical stratification.
        rng = random.Random(20260815)
        worst = 0.0
        labels = [r["K"] for r in rows]
        for _ in range(300):
            rng.shuffle(labels)
            for r, k in zip(rows, labels):
                r["_shuffled_K"] = k
            drawn = [g for g in (gap(b, "_shuffled_K") for b in bins) if g is not None]
            if drawn:
                worst = max(worst, sum(drawn) / len(drawn))
        self.assertGreater(mean_within, 2 * worst,
                           f"within-bin mean gap {mean_within:+.1f} no longer clears twice the "
                           f"largest of 300 label permutations ({worst:+.1f})")

    def test_the_decoded_head_is_not_a_cell_major_bitmap(self) -> None:
        """§1.4g: a calibrated negative on the unread head.

        A C64 bitmap is cell-major, 8 bytes per cell, so it repeats at lag 8 and at 8*width. The
        DOS picture repacked into exactly that order shows those bumps, which is what makes the
        C64 head's flatness there a measurement rather than an absence of effort. Whatever the
        head is, it is not this picture's bitmap in cell order -- so no layout search that assumes
        it is can succeed.
        """
        if not any(d.is_dir() for d in DOS_ORACLE_INSTALLS.values()) or not self.titles:
            self.skipTest("needs both a DOS install and the C64 disk images")
        rows = [r for r in self._paired_pic_complexity() if r["head"] is not None]
        self.assertGreater(len(rows), 85, f"only {len(rows)} paired files decode a head")
        for key, label, floor in (("bitmap", "DOS repacked (known bitmap)", 0.004),
                                  ("head", "C64 decoded head", None)):
            seqs = [r[key] for r in rows]
            excess = {d: sum(self._lag_excess(list(s), d) for s in seqs) / len(seqs)
                      for d in (8, 88)}
            if floor is not None:
                for d, value in excess.items():
                    self.assertGreater(value, floor,
                                       f"{label} no longer shows its cell structure at lag {d} "
                                       f"({value:+.4f}) -- the calibration is broken, so the C64 "
                                       f"result below means nothing")
            else:
                for d, value in excess.items():
                    self.assertLess(abs(value), 0.004,
                                    f"the C64 head now shows cell structure at lag {d} "
                                    f"({value:+.4f}) -- §1.4g's negative must be withdrawn")

    def test_the_decoded_head_is_not_an_already_compressed_buffer(self) -> None:
        """The other reading of that flatness, and it is refuted.

        "The head decodes wrong / is a second compressed layer" would make it incompressible.
        It is not: it compresses markedly better than the raw payload it came from, so the outer
        decode does real work on it and the head is a structured representation rather than an
        opaque one. Reference points are asserted alongside so the number is interpretable.
        """
        if not any(d.is_dir() for d in DOS_ORACLE_INSTALLS.values()) or not self.titles:
            self.skipTest("needs both a DOS install and the C64 disk images")
        rows = [r for r in self._paired_pic_complexity() if r["head"] is not None]
        self.assertGreater(len(rows), 85, f"only {len(rows)} paired files decode a head")
        heads = sorted(len(zlib.compress(bytes(r["head"]), 9)) / len(r["head"]) for r in rows)
        raws = sorted(r["zratio"] for r in rows)
        head_median = heads[len(heads) // 2]
        self.assertLess(head_median, 0.85,
                        f"the decoded head no longer compresses (ratio {head_median:.3f}); it "
                        f"would then be an already-encoded layer, not a structured one")
        self.assertGreater(head_median, raws[len(raws) // 2],
                           f"the head now compresses as well as a raw DOS bitmap "
                           f"({head_median:.3f}) -- it may be the picture after all")

    def test_the_colour_section_length_is_not_resolved_by_the_decode(self) -> None:
        """The limit of §1.4e, asserted rather than left for a reader to discover.

        A mutation changing the section length 121 -> 120 survived, so the length was measured:
        the decode succeeds for essentially any target in 100..140 and only dies past ~150. The
        reason is mechanical -- every byte in the region is either < 16 or a run marker, so the
        region is homogeneous and the search cannot find its start, only its extent. The 121
        therefore comes from the sub-header and is CONSISTENT with the tail, not proven by it.
        If a future change makes 121 uniquely fit, this test fails and the claim can be upgraded.
        """
        payloads = self._still_payloads()
        self.assertGreater(len(payloads), 150,
                           f"only {len(payloads)} single-frame conforming payloads")

        def hits(n: int) -> int:
            c = 0
            for p in payloads:
                for start in range(len(p) - 1, max(-1, len(p) - 200), -1):
                    r = self._pic_rle(p[start:], n)
                    if r and start + r[1] == len(p) and all(x < 16 for x in r[0]):
                        c += 1
                        break
            return c

        at121 = hits(121)
        self.assertGreater(hits(100), at121 // 2,
                           "a 100-byte target no longer fits -- 121 may now be resolvable, in "
                           "which case §1.4e's stated limitation is out of date")
        # The extent IS bounded, and that bound is the falsifiable part.
        self.assertEqual(hits(200), 0, "the trailing low-valued region is not bounded after all")
        self.assertLess(hits(160), at121 // 4)

    def test_the_colour_reading_survives_a_shifted_value_band(self) -> None:
        """The null that decides §1.4e, and it is not the shuffle null.

        Shuffling the payload only asks "is this RLE-compressible?". The claim is narrower -- the
        output is colour RAM, so it must land in 0..15 specifically. Re-running the identical
        search over other 16-wide bands holds codec, files and search pressure fixed and varies
        only the thing being claimed.
        """
        payloads = self._still_payloads()
        self.assertGreater(len(payloads), 150,
                           f"only {len(payloads)} single-frame conforming payloads")
        real = sum(1 for p in payloads if self._trailing_section(p, 0, 16))
        for lo in (16, 32, 64, 128):
            other = sum(1 for p in payloads if self._trailing_section(p, lo, lo + 16))
            self.assertEqual(other, 0,
                             f"band {lo}..{lo+15} also matches in {other} files -- the result is "
                             f"search pressure, not colour RAM")
        # The boundary is at 16 exactly: narrower finds nothing, wider adds nothing.
        self.assertEqual(sum(1 for p in payloads if self._trailing_section(p, 0, 8)), 0)
        self.assertEqual(sum(1 for p in payloads if self._trailing_section(p, 0, 64)), real)

    def test_the_deduplicated_glyph_layout_is_refuted(self) -> None:
        """The layout the colour find suggested, killed by its own prediction.

        If the bytes ahead of the two 121-byte sections were distinct glyph bitmaps at 8 bytes
        each, then `len(glyphs)/8` and `max(screen code)+1` would have to be the same integer --
        one measured as a length, one as a decoded value, neither able to force the other. They
        never agree, and most glyph regions are not even a multiple of 8.
        """
        payloads = self._still_payloads()
        self.assertGreater(len(payloads), 150,
                           f"only {len(payloads)} single-frame conforming payloads")
        agree = disagree = 0
        for p in payloads:
            col = self._trailing_section(p, 0, 16)
            if col is None:
                continue
            cs = col[0]
            for ss in range(cs - 1, max(-1, cs - 200), -1):
                r = self._pic_rle(p[ss:], 121)
                if not (r and ss + r[1] == cs):
                    continue
                if ss % 8 == 0 and ss // 8 == max(r[0]) + 1:
                    agree += 1
                else:
                    disagree += 1
                break
        self.assertGreater(disagree, 5, "the split stopped finding candidates at all")
        self.assertEqual(agree, 0,
                         f"{agree} files now satisfy len(glyphs)/8 == max(screen)+1 -- if that is "
                         f"real the layout is solved and §1.4e's refutation must be withdrawn")

    def test_buck_rogers_mon_records_are_not_480_bytes_so_yield_no_pairs(self) -> None:
        files = self.titles.get(C.BUCK_ROGERS_MON_IS_A_DIFFERENT_LAYOUT)
        if not files:
            self.skipTest("Buck Rogers absent")
        mon_sizes = {len(d) for n, d in files.items() if C.family_of(n) == "MON"}
        self.assertNotIn(2 + C.MON_BODY_LEN, mon_sizes | {0})
        matched, total, _ = C.predictor_accuracy(files)
        self.assertEqual(total, 0, "Buck Rogers should contribute zero comparable pairs")


if __name__ == "__main__":
    unittest.main()
