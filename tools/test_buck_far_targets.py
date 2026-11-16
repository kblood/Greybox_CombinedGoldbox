from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import buck_far_targets as subject  # noqa: E402

REPO_ROOT = TOOLS.parent
BUCK_INSTALL = Path("D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday")
COAB_INSTALL = Path("C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds")
HAVE_RETAIL_BYTES = (BUCK_INSTALL / "GAME.OVR").exists() and (COAB_INSTALL / "GAME.OVR").exists()


class FitFormulaTests(unittest.TestCase):
    def test_finds_the_generating_constant(self) -> None:
        # seg*5 + off + 100 == the oracle offset, for three pairs; one decoy oracle offset that no
        # pair's own generating formula reaches.
        pairs = [(1, 10), (2, 20), (3, 30)]
        oracle_offsets = {115, 130, 145, 999}
        best_d, hits, per_pair = subject.fit_formula(pairs, oracle_offsets, multiplier=5)
        self.assertEqual(best_d, 100)
        self.assertEqual(hits, 3)
        self.assertTrue(all(per_pair.values()))

    def test_no_pairs_yields_no_fit(self) -> None:
        best_d, hits, per_pair = subject.fit_formula([], {1, 2, 3}, multiplier=1)
        self.assertIsNone(best_d)
        self.assertEqual(hits, 0)
        self.assertEqual(per_pair, {})

    def test_a_formula_with_no_real_relationship_does_not_silently_fit_everything(self) -> None:
        # Pairs whose (seg, off) has no arithmetic relationship to the (sparse) oracle set: the
        # best constant should explain only the handful of coincidental hits, never all of them.
        pairs = [(0x100 + i, 0x37) for i in range(40)]
        oracle_offsets = {17, 4004, 90001, 123456}
        best_d, hits, _ = subject.fit_formula(pairs, oracle_offsets, multiplier=1)
        self.assertIsNotNone(best_d)
        self.assertLess(hits, len(pairs))


class CalibrationFitTableTests(unittest.TestCase):
    def test_reports_one_row_per_multiplier_and_finds_the_true_one(self) -> None:
        # seg*4 + off + 100 == the oracle offset, for three pairs (multiplier=4 is one of the
        # battery MULTIPLIERS actually tries).
        pairs = [(1, 10), (2, 20), (3, 30)]
        oracle_offsets = {114, 128, 142}
        table = subject.calibration_fit_table(pairs, oracle_offsets)
        self.assertEqual([row["multiplier"] for row in table], subject.MULTIPLIERS)
        row4 = next(row for row in table if row["multiplier"] == 4)
        self.assertEqual(row4["hits"], 3)
        self.assertEqual(row4["best_additive_constant"], 100)


class HoldoutNullCheckTests(unittest.TestCase):
    def test_too_few_pairs_reports_status_instead_of_a_fabricated_split(self) -> None:
        pairs = [(i, i) for i in range(5)]
        result = subject.holdout_null_check(pairs, {1, 2, 3})
        self.assertEqual(result["status"], "too_few_pairs_to_hold_out")

    def test_a_true_generating_relationship_generalizes_to_the_holdout_set(self) -> None:
        # Positive control: seg == off == i, file_offset = seg + off + 1000, for i in 0..11 (12
        # pairs, so the >10 holdout split applies). The additive constant fit on the first two
        # pairs must correctly predict all ten held-out pairs -- this proves holdout_null_check
        # actually re-uses the TRAIN-fitted constant against the holdout set rather than re-fitting
        # on it (which would trivially "pass" any relationship, real or not).
        pairs = [(i, i) for i in range(12)]
        oracle_offsets = {i + i + 1000 for i in range(12)}
        result = subject.holdout_null_check(pairs, oracle_offsets)
        self.assertEqual(result["train_size"], 2)
        self.assertEqual(result["holdout_size"], 10)
        row1 = next(row for row in result["results"] if row["multiplier"] == 1)
        self.assertEqual(row1["additive_constant"], 1000)
        self.assertEqual(row1["holdout_hits"], 10)

    def test_a_fit_with_no_real_relationship_does_not_generalize(self) -> None:
        # Negative control, structurally mirroring the real Buck/CoAB result: pairs unrelated to
        # the (sparse) oracle set. Whatever constant best-fits the train slice should predict close
        # to zero of the holdout slice, not merely "less than all of it".
        pairs = [(0x100 + i, 0x40 + i) for i in range(30)]
        oracle_offsets = {17, 4004, 90001, 123456, 5000, 6000, 7000}
        result = subject.holdout_null_check(pairs, oracle_offsets)
        for row in result["results"]:
            self.assertLessEqual(row["holdout_hits"], 1)


class ResolveBuckTargetsTests(unittest.TestCase):
    def test_below_threshold_reports_every_target_unresolved_never_a_guessed_address(self) -> None:
        fit_table = [
            {"multiplier": 1, "best_additive_constant": 5, "hits": 3, "total_pairs": 50},
            {"multiplier": 2, "best_additive_constant": 9, "hits": 4, "total_pairs": 50},
        ]
        buck = b"\x00" * 0x20000
        results = subject.resolve_buck_targets(buck, fit_table)
        self.assertEqual(len(results), len(subject.BUCK_TARGETS))
        for row in results:
            self.assertEqual(row["status"], "unresolved")
            self.assertNotIn("file_offset", row)
            self.assertIn("hits=4/50", row["reason"])

    def test_at_or_above_threshold_resolves_and_computes_the_real_file_offset(self) -> None:
        fit_table = [
            {"multiplier": 1, "best_additive_constant": 5, "hits": 3, "total_pairs": 50},
            {"multiplier": 2, "best_additive_constant": 9, "hits": 10, "total_pairs": 50},
        ]
        buck = bytes(range(256)) * 4096  # long enough to slice any plausible test offset
        results = subject.resolve_buck_targets(buck, fit_table)
        for (opcode, op_str, seg, off), row in zip(subject.BUCK_TARGETS, results):
            self.assertEqual(row["status"], "resolved")
            self.assertEqual(row["resolution_method"], "linear_fit")
            expected = seg * 2 + off + 9
            self.assertEqual(row["file_offset"], f"0x{expected:x}")
            self.assertEqual(row["first_bytes_hex"], buck[expected : expected + 16].hex())

    def test_stub_geometry_wins_over_an_uncalibrated_linear_fit_for_the_targets_it_resolves(self) -> None:
        # Round 31 R1: when a calibration-verified stub_resolution is supplied, it takes priority
        # over the (here, below-threshold) linear fit for whichever targets it actually resolves --
        # and every target it does NOT resolve still falls through to the (failing) linear-fit
        # reporting path unchanged, never a guessed address.
        fit_table = [{"multiplier": 1, "best_additive_constant": 5, "hits": 2, "total_pairs": 50}]
        buck = bytes(range(256)) * 4096
        stub_resolution = {
            "calibration_ok": True,
            "resolved_targets": {
                "0xb8, 0x7f": {
                    "route_kind": "public_stub_owned",
                    "descriptor_index": 15,
                    "stub_index": 19,
                    "proc_offset": 5853,
                    "file_offset": "0x100",
                },
                "0xbe4, 0x62a": {"route_kind": "unresolved_relocated_segment"},
            },
        }
        results = subject.resolve_buck_targets(buck, fit_table, stub_resolution)
        by_target = {row["target"]: row for row in results}
        resolved = by_target["0xb8, 0x7f"]
        self.assertEqual(resolved["status"], "resolved")
        self.assertEqual(resolved["resolution_method"], "stub_geometry")
        self.assertEqual(resolved["file_offset"], "0x100")
        self.assertEqual(resolved["first_bytes_hex"], buck[0x100:0x110].hex())
        still_unresolved = by_target["0xbe4, 0x62a"]
        self.assertEqual(still_unresolved["status"], "unresolved")
        self.assertEqual(still_unresolved["resolution_method"], "unresolved")
        self.assertNotIn("file_offset", still_unresolved)

    def test_a_stub_resolution_whose_calibration_did_not_hold_is_ignored(self) -> None:
        # Named mutation companion: if calibration_ok is False (the stub-geometry parser call did
        # NOT land where map_buck_ecl_dispatch.py independently found it), the stub resolution must
        # be ignored entirely, even though resolved_targets still (incorrectly) claims a hit -- a
        # broken calibration must never leak a resolved address into the report.
        fit_table = [{"multiplier": 1, "best_additive_constant": 5, "hits": 2, "total_pairs": 50}]
        buck = bytes(range(256)) * 4096
        stub_resolution = {
            "calibration_ok": False,
            "resolved_targets": {
                "0xb8, 0x7f": {"route_kind": "public_stub_owned", "file_offset": "0x100"},
            },
        }
        results = subject.resolve_buck_targets(buck, fit_table, stub_resolution)
        row = next(r for r in results if r["target"] == "0xb8, 0x7f")
        self.assertEqual(row["status"], "unresolved")
        self.assertNotIn("file_offset", row)


@unittest.skipUnless(HAVE_RETAIL_BYTES, "Buck and CoAB GAME.OVR not present on this machine")
class RealBytesIntegrationTests(unittest.TestCase):
    """Pins the round-30 R4 result on the real retail bytes: CoAB calibration is a landable
    negative (best fit well under the 10-call bar, and the winning constant does not generalize to
    a held-out slice of CoAB's own calls either), so every one of Buck's seven blocking far-call
    targets stays genuinely unresolved -- no guessed address is ever reported as a target's location.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.report = subject.build_report()

    def test_calibration_does_not_clear_the_threshold(self) -> None:
        winner = max(self.report["fit_table"], key=lambda row: row["hits"])
        self.assertLess(winner["hits"], subject.FIT_THRESHOLD)
        self.assertEqual(self.report["calibration_status"], "landable_negative")

    def test_the_winning_constant_does_not_generalize_to_held_out_coab_calls(self) -> None:
        holdout = self.report["holdout_null_check"]
        self.assertGreater(holdout["holdout_size"], 0)
        # Every multiplier's train-fitted constant lands on at most 1 of the 10 held-out pairs --
        # if this ever climbs, the calibration may be starting to generalize and R4's negative
        # should be revisited before being trusted again.
        for row in holdout["results"]:
            self.assertLessEqual(row["holdout_hits"], 1)

    def test_three_of_seven_distinct_targets_resolve_via_stub_geometry_four_stay_unresolved(self) -> None:
        # Round 31 R1 retraction: round 30's "all seven unresolved" was correct about the LINEAR
        # fit (still true above) but wrong as a claim about the seven targets themselves -- three
        # are `public_stub_owned` under vroomm_layout.py's own descriptor/stub geometry, an
        # entirely different, non-linear resolution method. The other four sit on segments that
        # geometry ALSO classifies `unresolved_relocated_segment` (genuinely resident code) and
        # stay honestly unresolved -- no address guessed for any of them.
        distinct_pairs = {(row["segment"], row["offset"]) for row in self.report["buck_targets"]}
        self.assertEqual(len(distinct_pairs), 7)
        by_target = {row["target"]: row for row in self.report["buck_targets"]}
        resolved = {
            "0xb8, 0x7f": "0x1e0f2",
            "0xb8, 0xb6": "0x1e98e",
            "0x10f, 0x4d": "0x2d9cd",
        }
        unresolved = ["0xbe4, 0x62a", "0x653, 0x1359", "0xbe4, 0x1b2b", "0x653, 0xe58"]
        for target, file_offset in resolved.items():
            row = by_target[target]
            self.assertEqual(row["status"], "resolved")
            self.assertEqual(row["resolution_method"], "stub_geometry")
            self.assertEqual(row["file_offset"], file_offset)
        for target in unresolved:
            row = by_target[target]
            self.assertEqual(row["status"], "unresolved")
            self.assertNotIn("file_offset", row)

    def test_coab_stub_geometry_calibration_numbers(self) -> None:
        # Pins every number in the round-31 finding's calibration paragraph, measured directly.
        calibration = self.report["coab_stub_geometry_calibration"]
        self.assertEqual(calibration["distinct_public_stub_owned_targets"], 240)
        self.assertEqual(calibration["on_oracle_count"], 229)
        self.assertTrue(calibration["parse_command_sub_matches"])
        self.assertEqual(calibration["parse_command_sub_actual_file_offset"], "0x810a")
        self.assertEqual(calibration["shifted_null"], {"1": 1, "-1": 0, "16": 0, "-16": 0})

    def test_buck_stub_geometry_calibration_point(self) -> None:
        resolution = self.report["buck_stub_geometry_resolution"]
        self.assertTrue(resolution["calibration_ok"])
        self.assertEqual(resolution["parser_actual_file_offset"], "0x1ca15")

    def test_mutation_selector_base_off_by_one_breaks_the_1ca15_landing(self) -> None:
        # Named mutation (ii) from the round's brief: shifting the inferred selector base by +1
        # must break the 0x1ca15 landing and flip calibration_ok to False -- if this stayed True
        # the "calibration" would not actually be pinned to the real geometry.
        import unittest.mock as mock

        import vroomm_layout

        buck_path, _coab_path = subject.retail_files()
        buck_root = buck_path.parent
        original = vroomm_layout.infer_stub_selector_base

        def shifted(layouts):
            base, score, runner_up = original(layouts)
            return (None if base is None else (base + 1) & 0xFFFF), score, runner_up

        with mock.patch.object(vroomm_layout, "infer_stub_selector_base", side_effect=shifted):
            mutated = subject.buck_stub_geometry_resolution(buck_root)
        self.assertFalse(mutated["calibration_ok"])
        self.assertNotEqual(mutated["parser_actual_file_offset"], "0x1ca15")


if __name__ == "__main__":
    unittest.main()
