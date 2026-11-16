"""Tests for `tools/map_matrix_ecl_dispatch.py` (R2, round 31).

Pins the numbers this pass actually measured on Matrix Cubed's own real `GAME.OVR` bytes
(`matrixcubed_extracted/BuckRogers2/c/Matrix/GAME.OVR`, `FBOV` magic) against Countdown to
Doomsday's own retail bytes (via `tools/map_buck_ecl_dispatch.py`'s `build_report()`, called fresh
so this always compares against R1's current numbers) and CoAB's oracle
(`build/coab-oracle-map.json`).

Skips (does not fail) when `matrixcubed_extracted/` or the CoAB GOG install is absent -- external,
never-vendored source material, same convention as `tools/test_matrix_cubed_inventory.py` and
`tools/test_map_buck_ecl_dispatch.py`.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import map_matrix_ecl_dispatch as subject  # noqa: E402
import map_buck_ecl_dispatch  # noqa: E402
from map_pool_ecl_dispatch import disassemble_shape, oracle_offset  # noqa: E402
import goldbox_corpus  # noqa: E402
import json  # noqa: E402

REPO_ROOT = TOOLS.parent
MATRIX_GAME_OVR = subject.matrix_game_ovr_path()
COAB_INSTALL = Path("C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds")
BUCK_INSTALL = Path("D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday")
HAVE_MATRIX_BYTES = MATRIX_GAME_OVR.exists() and (COAB_INSTALL / "GAME.OVR").exists()
HAVE_BUCK_BYTES = (BUCK_INSTALL / "GAME.OVR").exists()


class ReadMatrixBytesTests(unittest.TestCase):
    """The magic-refusal null: this tool is calibrated for FBOV only. Synthetic bytes, always
    runs (no external source needed)."""

    def test_accepts_fbov(self) -> None:
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".OVR", delete=False) as f:
            f.write(b"FBOV" + b"\x00" * 60)
            path = Path(f.name)
        try:
            data = subject.read_matrix_bytes(path)
            self.assertEqual(data[:4], b"FBOV")
        finally:
            path.unlink()

    def test_refuses_tpov(self) -> None:
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".OVR", delete=False) as f:
            f.write(b"TPOV" + b"\x00" * 60)
            path = Path(f.name)
        try:
            with self.assertRaises(ValueError) as ctx:
                subject.read_matrix_bytes(path)
            self.assertIn("FBOV", str(ctx.exception))
            self.assertIn("TPOV", str(ctx.exception))
        finally:
            path.unlink()

    def test_refuses_garbage(self) -> None:
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".OVR", delete=False) as f:
            f.write(b"\x00\x01\x02\x03" + b"\x00" * 60)
            path = Path(f.name)
        try:
            with self.assertRaises(ValueError):
                subject.read_matrix_bytes(path)
        finally:
            path.unlink()

    @unittest.skipUnless(HAVE_BUCK_BYTES, "needs the real Buck GAME.OVR (external, never-vendored)")
    def test_refuses_countdowns_own_real_tpov_file(self) -> None:
        # The exact mutation the brief names: feed the tool Countdown's own real GAME.OVR. It
        # must refuse, not silently map a TPOV binary as if it were FBOV.
        with self.assertRaises(ValueError) as ctx:
            subject.read_matrix_bytes(BUCK_INSTALL / "GAME.OVR")
        self.assertIn("FBOV", str(ctx.exception))


@unittest.skipUnless(
    HAVE_MATRIX_BYTES, "needs matrixcubed_extracted/ and the CoAB GOG install (external, never-vendored)"
)
class RealBytesIntegrationTests(unittest.TestCase):
    """Pins the numbers this round actually measured against Matrix Cubed's real GAME.OVR."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.report = subject.build_report()

    def test_matrix_magic_is_fbov(self) -> None:
        self.assertEqual(self.report["matrix_magic"], "FBOV")

    def test_dispatcher_and_parser_offsets(self) -> None:
        self.assertEqual(self.report["matches"]["dispatcher"]["matrix"]["offset"], 0x38E8)
        self.assertEqual(self.report["matches"]["operand_parser"]["matrix"]["offset"], 0x1CF69)

    def test_similarity_is_decisively_above_the_floor(self) -> None:
        # Predicted (round 31 plan): >= 0.80 on both, "estimate -- Buck's are 0.887/0.855 and
        # Matrix is a later build of the same engine". Measured: 0.8885 / 0.8750 -- the prediction
        # held, and both land slightly ABOVE Buck's own numbers against the same CoAB oracle.
        for name in ("dispatcher", "operand_parser"):
            self.assertGreaterEqual(self.report["matches"][name]["sequence_similarity"], 0.8)
        self.assertAlmostEqual(self.report["matches"]["dispatcher"]["sequence_similarity"], 0.8885, places=3)
        self.assertAlmostEqual(self.report["matches"]["operand_parser"]["sequence_similarity"], 0.8750, places=3)

    def test_mutation_dispatcher_offset_shifted_falls_below_the_floor(self) -> None:
        # Null (iv), the real form of it: `nearest_function` ranks EVERY Borland-prologue-shaped
        # function start in the whole 212,529-byte file (564 candidates) and picks the best. A
        # naive same-instruction-stream byte shift (+1, +2, ...) does NOT falsify anything here --
        # measured separately, it stays at 0.87-0.89 for shifts up to +32 bytes, because this
        # dispatcher's body is a long run of near-identical `cmp al,imm / call` pairs and a
        # misaligned re-sync inside that same repetitive shape still looks similar token-for-token.
        # The discriminating mutation is "land on a DIFFERENT candidate function entirely" -- which
        # is what a genuinely wrong dispatcher offset would actually produce. The located offset's
        # nearest rival among 604 real prologue-start candidates in the file (564 of which
        # disassemble into a valid FunctionShape) scores decisively lower (0.2583 -- Buck's own
        # docblock reports 0.26/0.49 for its own dispatcher/parser runner-ups; Matrix's number
        # lands in the same range independently).
        oracle = json.loads((goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json").read_text(encoding="utf-8"))
        coab_path = subject.coab_game_ovr_path()
        coab = coab_path.read_bytes()
        reference = disassemble_shape(coab, oracle_offset(oracle, "commandTable"))
        matrix = subject.read_matrix_bytes(MATRIX_GAME_OVR)
        from difflib import SequenceMatcher

        starts = sorted(
            {
                offset
                for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")
                for offset in range(len(matrix))
                if matrix.startswith(pattern, offset)
            }
        )
        ranked: list[tuple[float, int]] = []
        for start in starts:
            candidate = disassemble_shape(matrix, start)
            if candidate is None:
                continue
            ratio = SequenceMatcher(None, reference.tokens, candidate.tokens, autojunk=False).ratio()
            ranked.append((ratio, candidate.offset))
        ranked.sort(key=lambda item: item[0], reverse=True)
        self.assertEqual(len(starts), 604)
        self.assertEqual(len(ranked), 564)  # some prologue starts don't yield a valid FunctionShape
        best_ratio, best_offset = ranked[0]
        runner_up_ratio, runner_up_offset = ranked[1]
        self.assertEqual(best_offset, self.report["matches"]["dispatcher"]["matrix"]["offset"])
        self.assertAlmostEqual(best_ratio, self.report["matches"]["dispatcher"]["sequence_similarity"])
        self.assertLess(runner_up_ratio, 0.5)
        self.assertNotEqual(runner_up_offset, best_offset)

    def test_opcode_range_and_handler_count(self) -> None:
        # Identical to Buck's own numbers (0x00..0x4c, 75 handlers, 12 fallthrough-resolved,
        # missing 0x1f/0x3b) -- not assumed, independently re-derived from Matrix's own bytes by
        # the same two-pass method.
        self.assertEqual(self.report["matrix_opcode_min"], 0x00)
        self.assertEqual(self.report["matrix_opcode_max"], 0x4C)
        self.assertEqual(self.report["matrix_handler_count"], 75)
        self.assertEqual(self.report["matrix_fallthrough_resolved_count"], 12)
        self.assertEqual(self.report["missing_within_range"], [0x1F, 0x3B])

    def test_missing_opcode_signature_matches_coab_exactly_within_0x40(self) -> None:
        coab_missing = self.report["coab_missing_within_range"]
        shared = self.report["shared_missing_signature_within_0x40"]
        self.assertEqual(coab_missing, [0x1F])
        self.assertEqual(set(shared), set(coab_missing))

    def test_operand_parser_call_target(self) -> None:
        target_info = self.report["operand_parser_call_target"]
        self.assertEqual(target_info["target"], "0x6b, 0x2a")
        self.assertEqual(target_info["handlers_using_it_first"], 50)
        self.assertEqual(target_info["handlers_total"], 75)

    def test_word_sets_are_field_for_field_identical_to_buck(self) -> None:
        # The measured word-set dict itself, pinned exactly -- this is the evidence underneath
        # "ECL_GEN1_MATRIX equals ECL_GEN1_BUCK field-for-field" in matrixEclDialect.test.ts.
        expected = {
            "0": None, "1": 1, "2": 1, "3": 2, "4": 3, "5": 3, "6": 3, "7": 3, "8": 2, "9": 2,
            "10": 1, "11": 3, "12": 4, "13": None, "14": 1, "15": 2, "16": 2, "17": 1, "18": 1,
            "19": None, "20": 4, "21": 3, "22": None, "23": None, "24": None, "25": None,
            "26": None, "27": None, "28": None, "29": 2, "30": 6, "32": 1, "33": 3, "34": 3,
            "35": 3, "36": None, "37": 2, "38": 2, "39": 2, "40": 3, "41": None, "42": 3, "43": 2,
            "44": None, "45": 1, "46": 5, "47": 3, "48": 3, "49": 2, "50": 1, "51": None, "52": 2,
            "53": 3, "54": 2, "55": 3, "56": 1, "57": 1, "58": None, "60": None, "61": None,
            "62": None, "63": 2, "64": 2, "65": 2, "66": None, "67": 1, "68": None, "69": 2,
            "70": 2, "71": None, "72": 1, "73": 6, "74": None, "75": 1, "76": 2,
        }
        self.assertEqual(self.report["word_sets"], expected)

    def test_sibling_comparison_counts(self) -> None:
        # Predicted (round 31 plan): "agree with Countdown on >= 70 of 75 dispatched opcodes"
        # (estimate). Measured: 75/75 opcodes agree in the broad sense (same value or both
        # unmeasured) -- 53 with a concrete shared measured value, 22 where both sides
        # independently stayed unmeasured (same handlers-never-reach-the-parser signature), 0
        # disagreements, 0 one-sided. This EXCEEDS the plan's >=70 estimate.
        sibling = self.report["sibling_comparison_vs_buck"]
        self.assertEqual(sibling["shared_opcode_count"], 75)
        self.assertEqual(len(sibling["agree"]), 53)
        self.assertEqual(len(sibling["disagree"]), 0)
        self.assertEqual(len(sibling["both_unmeasured"]), 22)
        self.assertEqual(len(sibling["one_sided_unmeasured"]), 0)
        self.assertEqual(sibling["matrix_opcodes_not_in_buck_table"], [])
        self.assertEqual(sibling["buck_opcodes_not_in_matrix_table"], [])

    def test_mutation_one_pinned_word_set_off_by_one_would_show_as_a_disagreement(self) -> None:
        # Null (iii)'s Python-side counterpart: fabricate a Buck report whose 0x4c word set is
        # off by one and confirm compare_to_buck actually reports it as a disagreement rather than
        # silently absorbing it -- proves the comparison function can fail, not just pass.
        matrix = subject.read_matrix_bytes(MATRIX_GAME_OVR)
        real_buck_report = self.report["sibling_comparison_vs_buck"]
        self.assertEqual(len(real_buck_report["disagree"]), 0)
        import copy

        import map_buck_ecl_dispatch

        buck_report = map_buck_ecl_dispatch.build_report()
        mutated = copy.deepcopy(buck_report)
        mutated["word_sets"]["76"] = mutated["word_sets"]["76"] + 1  # 0x4c: 2 -> 3
        mutated_comparison = subject.compare_to_buck(
            matrix, self.report["matrix_dispatch"], {int(k): v for k, v in self.report["word_sets"].items()}, mutated
        )
        disagreeing_opcodes = {row["opcode"] for row in mutated_comparison["disagree"]}
        self.assertIn(0x4C, disagreeing_opcodes)

    def test_the_eleven_extension_opcodes_prefetch_table(self) -> None:
        # The eleven 0x41..0x4c opcodes Countdown ships with `uncertain: true`
        # (packages/engine/src/ecl/disassemble.ts's ECL_GEN1_BUCK.opcodeOverrides). Predicted
        # (round 31 plan): "agree 11/11 (estimate -- two-sided; a single disagreement is the more
        # interesting result)". Measured: 11/11 agree, including the three no_far_call opcodes
        # (0x44/0x47/0x4a) landing on the SAME both-None verdict in both binaries -- independently
        # derived, not inherited.
        table = {row["opcode"]: row for row in self.report["sibling_comparison_vs_buck"]["extension_opcode_table"]}
        expected_word_sets = {
            0x41: 2, 0x43: 1, 0x44: None, 0x45: 2, 0x46: 2, 0x47: None,
            0x48: 1, 0x49: 6, 0x4A: None, 0x4B: 1, 0x4C: 2,
        }
        self.assertEqual(set(table), set(expected_word_sets))
        for opcode, expected_word_set in expected_word_sets.items():
            row = table[opcode]
            self.assertEqual(row["matrix_word_set"], expected_word_set, f"opcode 0x{opcode:02x}")
            self.assertEqual(row["buck_word_set"], expected_word_set, f"opcode 0x{opcode:02x}")
            self.assertIsNotNone(row["matrix_handler_file_offset"])
            self.assertIsNotNone(row["buck_handler_file_offset"])
            self.assertGreaterEqual(row["handler_sequence_similarity"], 0.8, f"opcode 0x{opcode:02x}")
            self.assertTrue(row["verdict"].startswith("agree"), f"opcode 0x{opcode:02x}: {row['verdict']}")

    def test_vacuous_opcode_walk_independently_replicates_buck(self) -> None:
        # Deliverable 4 (round 32 R5): the SAME `walk_vacuous_opcodes` generalisation Buck's own
        # build_report runs, applied here to Matrix Cubed's own DIFFERENT binary (own structural
        # match, own PC global 0x4432 vs Buck's 0x3be2, own operand-parser pair 0x6b,0x2a vs
        # Buck's 0xb8,0x2a). The two independent runs agree opcode-for-opcode on which of the 17
        # touch the PC global -- corroborating evidence, not a copy (this module never imports
        # Buck's OWN vacuous_opcode_walk result, only the shared, generic walker function).
        self.assertTrue(self.report["resident_image_used"])
        self.assertEqual(self.report["resident_image_dest_len_bytes"], 75344)
        walk = self.report["vacuous_opcode_walk"]
        self.assertEqual(len(walk), 17)
        touches_pc = {op for op, info in walk.items() if info["verdict"].startswith("N ")}
        self.assertEqual(touches_pc, {"0x16", "0x17", "0x18", "0x19", "0x1a", "0x1b"})
        verdict_zero = {op for op, info in walk.items() if info["verdict"] == "0"}
        self.assertEqual(len(verdict_zero), 11)
        for op in ("0x29", "0x2c", "0x42"):
            self.assertIn(op, verdict_zero)

        buck_walk = map_buck_ecl_dispatch.build_report()["vacuous_opcode_walk"]
        buck_verdict_kind = {op: info["verdict"].split(" ", 1)[0] for op, info in buck_walk.items()}
        matrix_verdict_kind = {op: info["verdict"].split(" ", 1)[0] for op, info in walk.items()}
        self.assertEqual(buck_verdict_kind, matrix_verdict_kind)


if __name__ == "__main__":
    unittest.main()
