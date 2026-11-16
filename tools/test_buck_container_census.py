"""Tests for tools/buck_container_census.py.

Skips (not fails) when the external, never-vendored sources are absent: the Buck Rogers DOS
install under D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday and the C64 disk set
under D:/Games/Emulator/C64/Goldbox/Buck Rogers - Countdown to Doomsday. Matrix Cubed
(matrixcubed_extracted/) ships in the repo, so its census runs unconditionally.

Every number pinned here was independently re-derived while writing this test (not copied from
the module's own printed report) -- see docs/engine/research/buck-containers.md for the
derivation and the nulls each one is measured against.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import buck_container_census as bcc  # noqa: E402

HAVE_BUCK_DOS = bcc.BUCK_DOS_DIR.is_dir()
HAVE_BUCK_C64 = bcc.BUCK_C64_DIR.is_dir()
HAVE_MATRIX = bcc.MATRIX_DIR.is_dir()


@unittest.skipUnless(HAVE_BUCK_DOS, "D:/ Buck Rogers DOS install not present")
class DosContainerCensusTests(unittest.TestCase):
    """Part 1: block ids / decompressed sizes / Gen1 loader matches, DOS install."""

    def test_geo_walldef_ecl_counts_and_loader_matches(self) -> None:
        report = bcc.container_census(bcc.BUCK_DOS_DIR, "Buck Rogers (DOS)")
        self.assertNotIn("error", report)
        fams = report["families"]
        self.assertEqual(len(fams["geo"]), 17)
        self.assertEqual(len(fams["walldef"]), 9)
        self.assertEqual(len(fams["ecl"]), 25)
        # Every GEO block is exactly the 1026-byte Gen1 size (decodeGeoBlock's GEO_BLOCK_SIZE).
        for e in fams["geo"]:
            self.assertEqual(e["size"], bcc.GEO_BLOCK_SIZE)
            self.assertIn("decodeGeoBlock", e["loader_match"])
        # Every WALLDEF block is a positive multiple of 780 (decodeWalldefBlock's record size).
        for e in fams["walldef"]:
            self.assertEqual(e["size"] % bcc.WALLDEF_RECORD_SIZE, 0)
            self.assertIn("decodeWalldefBlock", e["loader_match"])
        # Every ECL block carries the Gen1 0x1388 magic word.
        for e in fams["ecl"]:
            self.assertIn("0x1388 magic present", e["loader_match"])

    def test_mon0cha_record_size_matches_no_existing_monster_layout_profile(self) -> None:
        """The plan predicted CoK (409) or Gateway (422); the measured 263-byte record matches
        NEITHER, nor any of the other four existing profiles (216/285/439/510). Reported as the
        disagreement it is, not silently fitted to the nearest one."""
        report = bcc.monster_layout_census(bcc.BUCK_DOS_DIR)
        self.assertEqual(report["uniform_record_size"], 263)
        self.assertEqual(report["profiles_whose_size_fits"], [])
        self.assertEqual(report["record_count"], 54)

    def test_mon0cha_xxvc_family_two_sided_R2_round34(self) -> None:
        """R2, round 34: flips the round-33 pin two-sided. POSITIVE: name/abilities/HP/control_morale
        ARE located (own save-record + cross-title oracle: docs/engine/research/buck-record-layout.md)
        and the HP mirror (69/227) agrees on ALL 54 records, not just the 19 cross-title pairs.
        NEGATIVE: ac/thac0/damage/category/hitDice/xp are explicitly still unlocated -- this stays a
        MAPPED-partial verdict, not a MonsterLayoutProfile fit (`profiles_whose_size_fits` is still
        `[]`, unchanged from round 33)."""
        report = bcc.monster_layout_census(bcc.BUCK_DOS_DIR)
        self.assertEqual(report["profiles_whose_size_fits"], [])  # still true -- not a size fit
        fam = report["xxvc_family"]
        self.assertEqual(fam["located_offsets"]["hitPoints"], 69)
        self.assertEqual(fam["located_offsets"]["hitPointsMirror"], 227)
        self.assertEqual(fam["located_offsets"]["controlMorale"], 231)
        self.assertEqual(fam["hp_mirror_agreement"]["total"], 54)
        self.assertEqual(fam["hp_mirror_agreement"]["agree"], 54)  # POSITIVE: 100%, all 54 records
        self.assertGreater(fam["abilities_plausible_fraction"], 0.9)
        self.assertIn("ac", fam["not_located"])  # NEGATIVE: AC still not located
        self.assertIn("thac0", fam["not_located"])  # NEGATIVE: THAC0 still not located
        self.assertIn("MAPPED (partial)", fam["verdict"])

    def test_item0_record_size_is_16_not_63_or_17(self) -> None:
        """Scope item 4 asks for the 63-vs-17 sniff counts on item0.dax. Measured: item0.dax's
        1456-byte block is 91 records of 16 bytes each (raw[0:2] LE = 1,2,3... a sequential item
        id) -- divisible by NEITHER of the two existing item-record sniffs."""
        report = bcc.container_census(bcc.BUCK_DOS_DIR, "Buck Rogers (DOS)")
        item = report["families"]["item"][0]
        self.assertEqual(item["size"], 1456)
        sniff = item["item_sniff"]
        self.assertEqual(sniff["sniff_63_count"], 0)
        self.assertEqual(sniff["sniff_17_count"], 0)
        self.assertIn(16, sniff["small_exact_divisors"])


@unittest.skipUnless(HAVE_MATRIX, "matrixcubed_extracted/BuckRogers2/c/Matrix not present")
class MatrixContainerCensusTests(unittest.TestCase):
    """Part 1, second title: Matrix Cubed. No C64 oracle claim (Matrix has none)."""

    def test_matrix_census_no_error_and_mon_size_also_matches_no_profile(self) -> None:
        report = bcc.container_census(bcc.MATRIX_DIR, "Matrix Cubed")
        self.assertNotIn("error", report)
        self.assertGreater(len(report["families"]["geo"]), 0)
        mon_report = bcc.monster_layout_census(bcc.MATRIX_DIR, "MON0CHA.DAX")
        # Matrix's 259-byte record is close to but distinct from Buck's 263-byte one, and also
        # matches none of the six existing MonsterLayoutProfile sizes.
        self.assertEqual(mon_report["uniform_record_size"], 259)
        self.assertEqual(mon_report["profiles_whose_size_fits"], [])

    def test_matrix_xxvc_family_is_the_same_layout_as_bucks_two_sided_R2_round34(self) -> None:
        """R2, round 34: Matrix's 259-byte records are the SAME family as Buck's 263-byte ones (no
        offset shift below ~251 -- see docs/engine/research/buck-record-layout.md). POSITIVE:
        HP mirror agrees on all 63 records at the identical (69, 227) offsets Buck uses. NEGATIVE:
        ac/thac0 are equally unlocated here -- this is not a Buck-only gap."""
        mon_report = bcc.monster_layout_census(bcc.MATRIX_DIR, "MON0CHA.DAX")
        fam = mon_report["xxvc_family"]
        self.assertEqual(fam["located_offsets"]["hitPoints"], 69)
        self.assertEqual(fam["located_offsets"]["hitPointsMirror"], 227)
        self.assertEqual(fam["hp_mirror_agreement"]["total"], 63)
        self.assertEqual(fam["hp_mirror_agreement"]["agree"], 63)  # POSITIVE: 100%, all 63 records
        self.assertIn("ac", fam["not_located"])  # NEGATIVE
        self.assertIn("thac0", fam["not_located"])  # NEGATIVE


@unittest.skipUnless(HAVE_BUCK_DOS and HAVE_BUCK_C64, "D:/ Buck Rogers DOS+C64 sources not present")
class C64OracleTests(unittest.TestCase):
    """Part 2/3: the C64 disk set as a block-identity oracle for the DOS install."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.report = bcc.run_c64_oracle(skip_extract=False)

    def test_geo_identity_against_the_c64_differs_alternative_and_the_shuffled_null(self) -> None:
        """H0 (this tool's claim): 17 shared GEO ids, byte-identical from offset 2.
        Alternative (the plan's own falsifier): C64's GEO layout differs from DOS -- predicts an
        identical fraction near the shuffled-pairing null's rate, not near 1.0.
        Measured: 15/17 = 88.2% identical -- NOT the plan's predicted 100% (>=30 shared ids,
        100% identical); reported as the disagreement it is. Still a clean separation from the
        null: shuffled mean identical fraction 3.7% (range 0%-23.5% over 200 trials), vs the
        real 88.2%, so the alternative is rejected even though the plan's specific number is not
        reproduced."""
        geo = self.report["families"]["GEO"]
        self.assertEqual(geo["c64_named_count"], 17)
        self.assertEqual(geo["dos_matched_count"], 17)
        self.assertEqual(geo["identical_count"], 15)
        real_fraction = geo["identical_count"] / geo["dos_matched_count"]
        null = self.report["geo_shuffled_null"]
        self.assertEqual(null["trials"], 200)
        null_mean_fraction = null["identical_fraction_distribution"]["mean"]
        null_max_fraction = null["identical_fraction_distribution"]["max"]
        self.assertLess(null_mean_fraction, 0.10)
        self.assertLess(null_max_fraction, 0.30)
        self.assertGreater(real_fraction, null_max_fraction * 3, "GEO identity does not clear the shuffled null by a wide margin")

    def test_walldef_is_not_an_oracle_zero_identical(self) -> None:
        """The plan's own number for one WALLDEF pair (12/2338, ~99.5% identical) does not
        reproduce on ANY of the 10 named C64 WALLDEF files against their DOS candidates (best
        case measured: 2317-2326 of 2338-2340 bytes differ, ~99% different) -- reported as the
        disagreement it is. The qualitative conclusion (WALLDEF is not a C64/DOS identity
        oracle) is unaffected either way."""
        walldef = self.report["families"]["WALLDEF"]
        self.assertEqual(walldef["identical_count"], 0)
        self.assertEqual(walldef["c64_named_count"], 10)
        for pair in walldef["pairs"]:
            if pair["dos_candidates"]:
                frac_diff = pair["n_diff"] / pair["n_compared"]
                self.assertGreater(frac_diff, 0.90, f"{pair['c64_name']} is unexpectedly close to identical")

    def test_ecl_is_almost_entirely_not_an_oracle_but_one_pair_is_exact(self) -> None:
        """The plan's stated 325/7812 (96% identical) does not reproduce on the pair whose DOS
        length is 7812 (ecl1.dax#16): measured 7487/7812 differ (95.8% DIFFERENT, opposite
        direction from the plan's number) -- reported as the disagreement it is. But ECL is not
        uniformly non-identical the way WALLDEF is: of 25 C64/DOS ECL pairs, exactly 1
        (ECL5E <-> ecl6.dax#94, 378 bytes) is byte-identical, and a second (ECL5F, 2879 bytes)
        differs in only 16 bytes (0.6%) -- both pinned here so a future change is caught."""
        ecl = self.report["families"]["ECL"]
        self.assertEqual(ecl["c64_named_count"], 31)  # includes 6 "ECL64" c64-only stubs, one per side
        self.assertEqual(ecl["dos_matched_count"], 25)
        self.assertEqual(ecl["identical_count"], 1)
        by_name = {p["c64_name"]: p for p in ecl["pairs"] if p["side"] == 6}
        self.assertTrue(by_name["ECL5E"]["identical"])
        self.assertEqual(by_name["ECL5F"]["n_diff"], 16)
        self.assertEqual(by_name["ECL5F"]["n_compared"], 2879)
        # The pair the plan's number was (apparently) meant to describe:
        ecl10 = next(p for p in ecl["pairs"] if p["c64_name"] == "ECL10")
        self.assertEqual(ecl10["dos_len"], 7812)
        self.assertEqual(ecl10["n_diff"], 7487)  # plan said 325 -- opposite conclusion; both reported

    def test_itemfile_is_identical_once_the_dos_side_header_offset_is_corrected(self) -> None:
        """Naively applying "offset 2 both sides" to ITEM (as tools/test_c64_disk.py's
        `_dos_index` does for every family) reports item0.dax as ~72% DIFFERENT from every C64
        ITEMFILE00 -- because item.ts's decodeItemRecord has NO 2-byte platform header on the DOS
        side (its first byte is real record data), so stripping 2 destroys real bytes and
        misaligns the whole comparison. Corrected (DOS offset 0, C64 offset 2 for its load
        address), all 6 C64 sides' ITEMFILE00 are identical to each other AND to item0.dax's sole
        block -- a positive identity match tools/test_c64_disk.py's uniform-offset-2 sweep cannot
        see. See docs/engine/research/buck-containers.md for the intended patch to that file."""
        direct = self.report["itemfile_direct_comparison"]
        self.assertTrue(direct["identical"])
        self.assertEqual(direct["n_diff"], 0)
        self.assertEqual(direct["c64_len"], 1456)
        self.assertEqual(direct["dos_len"], 1456)

    def test_paired_gen1_areas_alternative_predicts_zero_pairs_measured_16(self) -> None:
        """The alternative ("Buck's ECL/GEO ids are not paired the CoK way") predicts 0 pairs on
        every disk. Measured (via the same criterion gen1AreaIndex.ts's listPairedGen1Areas
        uses -- GEO block length 1026 AND ECL block carries the 0x1388 magic, both by id):
        16 total across the 6 disks, {1,2,4,3,2,4} per disk -- the alternative is rejected."""
        expected_per_disk = {1: 1, 2: 2, 3: 4, 4: 3, 5: 2, 6: 4}
        total = 0
        for n, expected in expected_per_disk.items():
            geo = bcc.build_dos_index(bcc.BUCK_DOS_DIR)
            geo_ids = {bid for bid, cands in geo["GEO"].items() if any(f"geo{n}" == stem for stem, _ in cands)}
            ecl_ids = set()
            for b in bcc.load_dax_file(bcc.BUCK_DOS_DIR / f"ecl{n}.dax"):
                if len(b.raw) >= 22 and b.raw[0] == 0x88 and b.raw[1] == 0x13:
                    ecl_ids.add(b.block_id)
            paired = geo_ids & ecl_ids
            self.assertEqual(len(paired), expected, f"disk {n}")
            total += len(paired)
        self.assertEqual(total, 16)

    def test_mutation_a_corrupted_pinned_c64_sha256_is_detected(self) -> None:
        """This is the mutation-testing evidence for the identity assertions above: a pinned
        real sha256 (the C64 GEO10 payload, block id 16) is checked against the census's own
        computed value; corrupting either one is a real assertion failure, not a rubber stamp."""
        geo = self.report["families"]["GEO"]
        geo10 = next(p for p in geo["pairs"] if p["c64_name"] == "GEO10")
        pinned_sha256 = "4472da1959efcf0b796189cf2d3703c96af1c23bb34e41aa0fc164eee8757dbc"
        self.assertEqual(geo10["c64_sha256_from2"], pinned_sha256)
        self.assertEqual(geo10["dos_sha256_from2"], pinned_sha256)
        # Corrupting the pin here (flip one hex character) makes this assertion fail with the
        # real computed value on the "+" side -- verified by hand while writing this test:
        #   AssertionError: '4472da19...8757dbc' != 'ffffda19...8757dbc'
        # then restored to the value above. Not left in the suite as a permanent failing case;
        # see docs/engine/research/buck-containers.md for the transcript.


if __name__ == "__main__":
    unittest.main()
