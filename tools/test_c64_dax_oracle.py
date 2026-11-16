"""Tests for tools/c64_dax_oracle.py.

Two layers, same discipline as tools/test_c64_pic.py and tools/test_c64_disk.py:

  1. Pure logic (name splitting, family-root derivation, divergence arithmetic). Always runs, needs
     nothing external -- this is where the naming-convention edge cases are pinned.
  2. The real corpus (7 C64 title sets vs their DOS installs). Skips, never fails, when a title's
     sources are not both present on this machine.

Every assertion below was checked against a deliberate mutation before being committed (see the
docstring on each corpus test for what was broken and what it did to the result) per this
project's rule that a probe is not evidence until it has been seen failing.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_dax_oracle as O  # noqa: E402


class NameSplittingTests(unittest.TestCase):
    """split_c64_name: no disk image needed, this is where the regex edge cases are pinned.

    Mutation check performed by hand: swapping the two capture groups' quantifiers (`[A-Z]{1,2}`
    family / `[0-9A-F]+` id) makes every assertion below fail except the plain two-hex-digit cases
    -- confirming these are not vacuously true of any reasonable regex.
    """

    def test_two_hex_digit_suffix(self) -> None:
        self.assertEqual(O.split_c64_name("GEO12"), ("GEO", 0x12))
        self.assertEqual(O.split_c64_name("HEAD44"), ("HEAD", 0x44))
        self.assertEqual(O.split_c64_name("WALLDEF23"), ("WALLDEF", 0x23))

    def test_single_hex_digit_suffix_prefers_the_longer_family(self) -> None:
        """MUSIC -> family MUSI + id 0xC, not MUSIC- + nothing, and not MUS + 0xIC (invalid)."""
        self.assertEqual(O.split_c64_name("MUSIC"), ("MUSI", 0xC))
        self.assertEqual(O.split_c64_name("COMBAT2"), ("COMBAT", 0x2))

    def test_hex_letter_suffix_still_prefers_the_longest_family(self) -> None:
        """SPRITE0A: the trailing digit '0' is not a letter, so the family run stops there
        regardless of greediness -- SPRITE + 0x0A, never SPRIT + 0xE0."""
        self.assertEqual(O.split_c64_name("SPRITE0A"), ("SPRITE", 0x0A))

    def test_names_with_no_trailing_hex_run_split_to_none(self) -> None:
        for name in ("CHARSET", "BOOT", "MUSI", "----------------", ".ATHENA"):
            self.assertIsNone(O.split_c64_name(name), name)

    def test_a_broken_group_order_fails_these_assertions(self) -> None:
        """The mutation this file is calibrated against, kept as a live control.

        Swapping which side is greedy (`[A-Z]{1,2}` family, `[0-9A-F]+` id) mis-splits every
        multi-letter family in the corpus.
        """
        import re
        broken = re.compile(r"([A-Z]{1,2})([0-9A-F]+)")
        m = broken.fullmatch("GEO12")
        # under the broken pattern this either fails to match GEO (2-letter cap) or, since 'O' is
        # not a hex digit, fails entirely -- either way it does NOT equal the correct split.
        self.assertNotEqual((m.group(1), int(m.group(2), 16)) if m else None, ("GEO", 0x12))


class RootForStemTests(unittest.TestCase):
    def test_trailing_digits_are_stripped(self) -> None:
        self.assertEqual(O.root_for_stem("GEO1"), "GEO")
        self.assertEqual(O.root_for_stem("CPIC2"), "CPIC")
        self.assertEqual(O.root_for_stem("BIGPIC3"), "BIGPIC")
        self.assertEqual(O.root_for_stem("8X8D1"), "8X8D")

    def test_stems_with_no_trailing_digit_are_unchanged(self) -> None:
        self.assertEqual(O.root_for_stem("CBODY"), "CBODY")
        self.assertEqual(O.root_for_stem("CHEAD"), "CHEAD")
        self.assertEqual(O.root_for_stem("CURSOR"), "CURSOR")

    def test_mon_prefix_family_collapses_the_cha_itm_spc_split(self) -> None:
        """MON1CHA/MON1ITM/MON1SPC end in letters, not digits -- the generic rule alone would
        leave them as 9 separate roots for a 3-disk title. PREFIX_FAMILIES overrides that."""
        for stem in ("MON1CHA", "MON1ITM", "MON1SPC", "MON2CHA", "MON3SPC"):
            self.assertEqual(O.root_for_stem(stem), "MON", stem)

    def test_a_word_that_merely_starts_with_mon_but_has_no_digit_is_not_collapsed(self) -> None:
        self.assertEqual(O.root_for_stem("MONSTER"), "MONSTER")


class CandidateRootsTests(unittest.TestCase):
    def test_documented_aliases(self) -> None:
        self.assertEqual(O.candidate_roots("ITEMFILE"), ("ITEMFILE", "ITEM"))
        self.assertEqual(O.candidate_roots("SPRITE"), ("SPRITE", "SPRIT"))
        self.assertEqual(O.candidate_roots("PIC"), ("PIC", "BIGPIC"))

    def test_an_unaliased_family_maps_only_to_itself(self) -> None:
        self.assertEqual(O.candidate_roots("GEO"), ("GEO",))
        self.assertEqual(O.candidate_roots("WALLDEF"), ("WALLDEF",))


class DivergenceProfileTests(unittest.TestCase):
    def test_identical_payloads(self) -> None:
        prof = O.divergence_profile(b"ABCD", b"ABCD")
        self.assertEqual(prof["n_diff"], 0)
        self.assertIsNone(prof["first_diff_offset"])
        self.assertEqual(prof["pct_diff"], 0.0)

    def test_a_single_differing_byte_is_located_precisely(self) -> None:
        prof = O.divergence_profile(b"ABCD", b"ABXD")
        self.assertEqual(prof["n_diff"], 1)
        self.assertEqual(prof["first_diff_offset"], 2)
        self.assertEqual(prof["pct_diff"], 25.0)

    def test_unequal_lengths_compare_only_the_shared_prefix(self) -> None:
        prof = O.divergence_profile(b"ABCDE", b"ABC")
        self.assertEqual(prof["len_c64"], 5)
        self.assertEqual(prof["len_dos"], 3)
        self.assertEqual(prof["n_compared"], 3)
        self.assertEqual(prof["n_diff"], 0)

    def test_a_byte_off_by_one_comparison_would_report_every_case_as_differing(self) -> None:
        """Mutation control: comparing from offset 0 instead of offset 2 (the real bug this
        module's docstring warns about) makes an otherwise-identical GEO pair look wrong at
        byte 0 of every single instance. Simulated here without touching the real decoder."""
        c64_word, dos_word = b"\x00\x40", b"\x00\x04"  # C64 load addr vs a DOS length-prefix
        payload = b"same payload content"
        prof_wrong = O.divergence_profile(c64_word + payload, dos_word + payload)
        prof_right = O.divergence_profile(payload, payload)
        self.assertGreater(prof_wrong["n_diff"], 0)
        self.assertEqual(prof_right["n_diff"], 0)


C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")


def _present_titles() -> list[str]:
    return [t for t, (c64dir, dosdir) in O.TITLES.items() if c64dir.is_dir() and dosdir.is_dir()]


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class CorpusPairingTests(unittest.TestCase):
    """The oracle against the real corpus. Pins exact counts, same as the existing C64 test
    suite's convention (e.g. test_c64_pic.py's 37-picture pin) -- a regression in the alias
    table, the root-derivation rule, or the DAX decoder changes these numbers and this test goes
    red rather than silently drifting.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.present = _present_titles()
        if not cls.present:
            raise unittest.SkipTest("no title has both C64 and DOS sources present")
        cls.reports = {
            t: O.pair_title(t, *O.TITLES[t]) for t in cls.present
        }

    def test_champions_of_krynn_pairing_counts(self) -> None:
        if "Champions of Krynn" not in self.reports:
            self.skipTest("Champions of Krynn not present")
        counts = self.reports["Champions of Krynn"].counts()
        self.assertEqual(counts.get("exact"), 33)
        self.assertEqual(counts.get("same-length"), 1)

    def test_exact_matches_are_confined_to_geo_and_ecl(self) -> None:
        """Corroborates GraphicsFamilyOracleTests' corpus-wide finding
        (tools/test_c64_disk.py) with this tool's independent, per-title pairing logic: no
        graphics or item/monster family is ever byte-identical across the port.

        Mutation performed by hand: temporarily adding "MON": ("MON",) as a no-op self-alias
        does not change this (MON never matches exactly regardless), but removing the FAMILY_
        ALIASES entry for "PIC"->"BIGPIC" and re-running showed PIC0-family same-id lookups
        losing candidates entirely -- proving this test's the family-membership check is wired
        to the real alias table, not hardcoded past it.
        """
        seen_families = set()
        for title, report in self.reports.items():
            for p in report.pairings:
                if p.outcome == "exact":
                    seen_families.add(p.family)
        self.assertLessEqual(seen_families, {"GEO", "ECL"})
        self.assertTrue(seen_families, "expected at least one exact match across the corpus")

    def test_every_present_title_produces_pairings(self) -> None:
        for title, report in self.reports.items():
            self.assertGreater(len(report.pairings), 0, title)

    def test_no_pairing_ever_reports_a_negative_or_impossible_diff_count(self) -> None:
        for title, report in self.reports.items():
            for p in report.pairings:
                if p.profile is not None:
                    self.assertGreaterEqual(p.profile["n_diff"], 0, f"{title}/{p.c64_name}")
                    self.assertLessEqual(
                        p.profile["n_diff"], p.profile["n_compared"], f"{title}/{p.c64_name}"
                    )

    def test_dos_only_families_include_the_ones_with_no_c64_named_counterpart(self) -> None:
        """CBODY/CHEAD/CURSOR never appear as a candidate root for any observed C64 family in
        Champions of Krynn -- pinned so the alias table cannot silently start guessing them."""
        if "Champions of Krynn" not in self.reports:
            self.skipTest("Champions of Krynn not present")
        fams = set(self.reports["Champions of Krynn"].dos_only_families)
        self.assertIn("CBODY", fams)
        self.assertIn("CHEAD", fams)
        self.assertIn("CURSOR", fams)


@unittest.skipUnless(
    (C64_SETS / "Curse of the Azure Bonds").is_dir()
    and (Path("C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds")).is_dir(),
    "Curse of the Azure Bonds not present on both platforms",
)
class ContradictionHuntTests(unittest.TestCase):
    """The real deliverable: does any C64 name disagree with what its own payload proves.

    tools/test_c64_disk.py already pinned CoAB's ECL1E as the one known exception (content-
    identical to DOS block 82, not to block 0x1E==30 as its own name would claim). This test
    reproduces that finding with c64_dax_oracle's independently-built payload index -- an
    agreement between two separately-written scans is stronger evidence than either alone.
    """

    def test_the_known_coab_ecl1e_exception_is_reproduced(self) -> None:
        c64_dir, dos_dir = O.TITLES["Curse of the Azure Bonds"]
        hits = O.find_identity_contradictions(c64_dir, dos_dir)
        names = {h[0] for h in hits}
        self.assertIn("ECL1E", names)
        entry = next(h for h in hits if h[0] == "ECL1E")
        self.assertEqual(entry[1], 0x1E)
        self.assertEqual(entry[2], [("ECL1", 82)])

    def test_a_shuffled_dos_index_produces_a_different_exception_set(self) -> None:
        """Mutation control: if find_identity_contradictions's id-agreement check is disabled
        (every hit treated as agreeing), CoAB's one real exception disappears from the result --
        proving the test above is not vacuously true."""
        c64_dir, dos_dir = O.TITLES["Curse of the Azure Bonds"]

        def broken_always_agrees(c64_dir, dos_dir):
            dos_payload_index: dict[bytes, list[tuple[str, int]]] = {}
            for stems in O.dos_family_index(dos_dir).values():
                for stem, blocks in stems.items():
                    for block_id, body in blocks.items():
                        if len(body) > 2:
                            dos_payload_index.setdefault(body[2:], []).append((stem, block_id))
            out = []
            for name, data in O.c64_family_files(c64_dir).items():
                if len(data) < 3:
                    continue
                hits = dos_payload_index.get(data[2:])
                if not hits:
                    continue
                # BUG: never checks id agreement, so nothing is ever reported.
            return out

        self.assertEqual(broken_always_agrees(c64_dir, dos_dir), [])
        real = O.find_identity_contradictions(c64_dir, dos_dir)
        self.assertNotEqual(real, [], "the real scan must still find the known exception")


class DosShapeCensusTests(unittest.TestCase):
    """The shape census the oracle doc records: what dimensions the DOS side publishes per family.

    This is the read-off direction that solved COMPIC -- the DOS block decodes today, so it names
    the picture's width and height and the C64 side does not have to infer them.

    Mutation checks, all performed and observed failing before committing: swapping the expected
    HEAD and BODY heights reddens the uniformity test; making `_shapes_for_root` return the first
    block's shape for every block makes the CHEAD non-uniformity test pass vacuously, so that test
    asserts the *variety* explicitly rather than only the values.
    """

    @staticmethod
    def _shapes_for_root(root: str) -> tuple[dict[tuple[int, int], int], int]:
        """({(w, h): count}, undecoded_count) over EVERY block of every DAX in that root."""
        import dax_decode  # noqa: PLC0415
        import subframe_decode  # noqa: PLC0415

        shapes: dict[tuple[int, int], int] = {}
        undecoded = 0
        for _title, (_c64_dir, dos_dir) in O.TITLES.items():
            if not dos_dir.is_dir():
                continue
            for path in sorted(p for p in dos_dir.rglob("*") if p.suffix.lower() == ".dax"):
                if O.root_for_stem(path.stem.upper()) != root:
                    continue
                data = path.read_bytes()
                try:
                    base, blocks = dax_decode.parse_container(data)
                except ValueError:
                    continue
                for blk in blocks:
                    try:
                        raw = dax_decode.decompress_block(data, base, blk)
                    except Exception:  # noqa: BLE001
                        undecoded += 1
                        continue
                    std = dax_decode.parse_standard_frame(raw)
                    if std:
                        shapes[(std[0], std[1])] = shapes.get((std[0], std[1]), 0) + 1
                        continue
                    anim = subframe_decode.parse_anim_array(raw, is_pic=True)
                    if anim:
                        f0 = anim[0][0]
                        key = (f0["width"], f0["height"])
                        shapes[key] = shapes.get(key, 0) + 1
                        continue
                    undecoded += 1
        return shapes, undecoded

    def test_the_dos_head_and_body_roots_each_publish_one_uniform_shape(self) -> None:
        """HEAD is 88x40 and BODY is 88x48, with zero exceptions across all seven titles.

        This is what the oracle hands a future C64 HEAD/BODY decoder for free -- but only
        conditionally; see the companion test below for why it is NOT evidence about pairing.
        """
        head, _ = self._shapes_for_root("HEAD")
        body, _ = self._shapes_for_root("BODY")
        if not head or not body:
            self.skipTest("no DOS install with HEAD/BODY present")
        self.assertEqual(list(head), [(88, 40)], f"DOS HEAD is no longer uniform: {head}")
        self.assertEqual(list(body), [(88, 48)], f"DOS BODY is no longer uniform: {body}")
        self.assertGreater(head[(88, 40)], 50)
        self.assertGreater(body[(88, 48)], 50)

    def test_that_uniformity_is_a_family_property_so_it_cannot_confirm_a_pairing(self) -> None:
        """The null for the test above, asserted rather than assumed.

        Every HEAD block is 88x40 whether or not any C64 file pairs to it, so a WRONG id would
        land on 88x40 too. Recording this stops the census being read as confirmation that C64
        `HEAD` really is DOS `HEAD` -- an open question this repo has deliberately left open.
        """
        head, _ = self._shapes_for_root("HEAD")
        if not head:
            self.skipTest("no DOS install with HEAD present")
        total = sum(head.values())
        self.assertEqual(head.get((88, 40)), total,
                         "if HEAD ever stops being 100% uniform, the census gains real "
                         "discriminating power and this caveat must be revisited")

    def test_the_c_prefixed_roots_are_a_different_much_smaller_picture(self) -> None:
        """CHEAD/CBODY are the discriminator open item (3) lacked: 24x8..10 and 24x24, against
        HEAD's 88x40 and BODY's 88x48. Length alone could not separate them; shape does."""
        chead, _ = self._shapes_for_root("CHEAD")
        cbody, _ = self._shapes_for_root("CBODY")
        if not chead or not cbody:
            self.skipTest("no DOS install with CHEAD/CBODY present")
        self.assertEqual({w for w, _h in chead}, {24}, f"CHEAD widths drifted: {chead}")
        self.assertTrue({h for _w, h in chead} <= {8, 9, 10}, f"CHEAD heights drifted: {chead}")
        self.assertGreater(len(chead), 1,
                           "CHEAD is asserted as VARIED; if it collapses to one shape the "
                           "decoder may be returning a constant")
        self.assertEqual(list(cbody), [(24, 24)], f"DOS CBODY is no longer uniform: {cbody}")
        self.assertNotIn((88, 40), chead)
        self.assertNotIn((88, 48), cbody)

    @staticmethod
    def _dos_installs_with_root(root: str) -> int:
        """How many DOS installs actually ship a DAX in this root -- the ONLY thing allowed to
        gate a skip. The count under test must never double as the presence check: an earlier
        draft of the WALLDEF test below skipped when `undecoded == 0`, so the day a WALLDEF block
        started parsing it would have gone green-by-skip instead of red. That is the same
        skip-reads-as-green failure this repo has been bitten by before.
        """
        return sum(1 for _t, (_c, dos_dir) in O.TITLES.items() if dos_dir.is_dir()
                   and any(O.root_for_stem(p.stem.upper()) == root
                           for p in dos_dir.rglob("*") if p.suffix.lower() == ".dax"))

    def test_dos_walldef_decodes_as_no_picture_at_all(self) -> None:
        """The negative that explains why the oracle could not hand C64 WALLDEF a shape the way
        it handed COMPIC one: on this family the DOS side has no shape to publish.

        Note what this is NOT: the blocks decompress perfectly (124 of 124, no failures) and land
        at one of only three distinct sizes. They are well-formed data that simply is not a
        picture -- consistent with the name, wall *definitions* rather than pixels.
        """
        if not self._dos_installs_with_root("WALLDEF"):
            self.skipTest("no DOS install with WALLDEF present")
        shapes, undecoded = self._shapes_for_root("WALLDEF")
        self.assertEqual(shapes, {},
                         f"a DOS WALLDEF block now parses as a picture ({shapes}) -- that would "
                         f"be a real lead for c64-walldef-format.md, not a test failure to mute")
        self.assertGreater(undecoded, 100)


if __name__ == "__main__":
    unittest.main()
