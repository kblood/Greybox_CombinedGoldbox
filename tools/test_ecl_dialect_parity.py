"""Guard: the Python ECL operand mirrors and the TypeScript engine must not drift apart.

This is the gate for a CLASS of defect, not an instance of one. `CLAUDE.md` states the class:
"Format specs port between the two tracks; TypeScript code does not." On 2026-09-10 that had
produced 52 opcode-level disagreements across three Python modules and five titles, and nothing in
the repo could go red for any of them, because no artifact read both sides.

The tests below fall into four groups, and the middle two matter most:

  (a) the TypeScript parser is CORRECT     -- it reproduces the values, resolving spreads/aliases;
  (b) the TypeScript parser CANNOT GO QUIET -- every way it might fail raises instead of returning
      an empty table, because an empty table would make (c) pass vacuously forever;
  (c) the live comparison is EMPTY         -- the actual guard;
  (d) the comparison CAN FAIL              -- mutate a Python table, watch the divergence appear.

Group (b) is here because of this repo's own record: a green probe that was never seen failing is
not evidence. A cross-language parser is the easiest place in this codebase to build a check that
passes because it read nothing.
"""
from __future__ import annotations

import unittest

import ecl_dialect_parity as m


# ---------------------------------------------------------------------------
# (a) The TypeScript parser reproduces the engine's own values.
# ---------------------------------------------------------------------------


class ParserFidelityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.base = m.parse_base_opcode_table()
        self.dialects = m.parse_ts_dialects()

    def test_base_table_is_dense_over_the_documented_range(self) -> None:
        """`opcodes.ts` documents `KRYNN_GEN1_OPCODES` as "dense over 0x00..0x41"."""
        self.assertEqual(sorted(self.base), list(range(0x00, 0x42)))
        self.assertEqual(self.base[0x00]["mnemonic"], "EXIT")
        self.assertEqual(self.base[0x2D]["mnemonic"], "CALL")
        # A count-driven opcode carries its count slot through the parse.
        self.assertEqual(self.base[0x15]["count_at"], 2)

    def test_every_exported_dialect_is_parsed(self) -> None:
        names = set(self.dialects)
        self.assertIn("ECL_GEN1", names)
        self.assertIn("ECL_GEN1_SHORT_DOK", names)
        self.assertIn("ECL_GEN2", names)
        # `ECL_GEN2_DQK_AREA5` is a plain alias (`= ECL_GEN2;`), not an object literal.
        self.assertEqual(
            self.dialects["ECL_GEN2_DQK_AREA5"].effective(self.base),
            self.dialects["ECL_GEN2"].effective(self.base),
        )

    def test_spreads_are_resolved_not_ignored(self) -> None:
        """`ECL_GEN1_SHORT_DOK` spreads `ECL_GEN1_SHORT`'s overrides and then adds three.

        Ignoring the spread would silently drop `0x0c`/`0x1d`/`0x22`/`0x23`/`0x2c`, which is the
        exact framing difference that separates the 1990 titles from the 1991+ ones.
        """
        shared = self.dialects["ECL_GEN1_SHORT"].effective(self.base)
        dok = self.dialects["ECL_GEN1_SHORT_DOK"].effective(self.base)
        self.assertEqual(shared[0x0C], (4, None))
        self.assertEqual(dok[0x0C], (4, None))  # inherited through the spread
        self.assertEqual(dok[0x1F], (1, None))  # DoK's own
        self.assertEqual(dok[0x29], (0, None))
        self.assertEqual(dok[0x27], (4, 3))
        self.assertEqual(shared[0x27], (8, None))  # and the shared literal keeps the base frame

    def test_header_geometry_is_carried_through_the_spread(self) -> None:
        self.assertEqual(
            (self.dialects["ECL_GEN1"].header_len, self.dialects["ECL_GEN1"].vbase), (22, 0x7FFE)
        )
        self.assertEqual(
            (self.dialects["ECL_GEN2"].header_len, self.dialects["ECL_GEN2"].vbase), (20, 0x8000)
        )
        self.assertEqual(self.dialects["ECL_GEN1_SHORT_DOK"].header_len, 22)
        self.assertEqual(self.dialects["ECL_POOL"].vbase, 0x98FE)

    def test_retracted_framings_quoted_in_docblocks_are_not_read_as_live(self) -> None:
        """`ECL_GEN1_SHORT_TREASURES`'s docblock quotes a `0x37` override that was FALSIFIED and
        retracted before shipping. A parser that did not strip comments would decode it as live.

        The retracted text and the live table happen to name the same value here, so this test
        pins the mechanism rather than the outcome: the comment text must be gone before parsing.
        """
        raw = m.DISASSEMBLE_TS.read_text(encoding="utf-8")
        stripped = m.strip_ts_comments(raw)
        self.assertIn("FALSIFIED", raw)
        self.assertNotIn("FALSIFIED", stripped)
        # Line count is preserved so any offset reported by a failure stays usable.
        self.assertEqual(raw.count("\n"), stripped.count("\n"))
        # And string literals survive: the mnemonics live inside quotes.
        self.assertIn("'TREASURE'", stripped)


# ---------------------------------------------------------------------------
# (b) The parser cannot fail quietly. MUTATION PROOFS.
# ---------------------------------------------------------------------------


class ParserCannotGoQuietTests(unittest.TestCase):
    """Each of these feeds the parser something it must REJECT.

    If any of them returned an empty or partial table instead of raising, the live comparison in
    (c) would pass while comparing nothing -- the vacuous-probe failure this repo keeps hitting.
    """

    def test_missing_base_table_raises(self) -> None:
        with self.assertRaises(m.TsParseError):
            m.parse_base_opcode_table("export const SOMETHING_ELSE = { 0x00: {} };")

    def test_truncated_base_table_raises_instead_of_returning_a_short_one(self) -> None:
        tiny = "export const KRYNN_GEN1_OPCODES: Record<number, OpcodeDef> = {\n"
        tiny += "  0x00: { wordSet: 0, mnemonic: 'EXIT' },\n}\n"
        with self.assertRaises(m.TsParseError) as ctx:
            m.parse_base_opcode_table(tiny)
        self.assertIn("dense", str(ctx.exception))

    def test_no_dialects_raises(self) -> None:
        with self.assertRaises(m.TsParseError):
            m.parse_ts_dialects("// nothing here at all\n")

    def test_spread_of_an_unknown_dialect_raises(self) -> None:
        text = (
            "export const ECL_MYSTERY: EclDialect = {\n"
            "  ...ECL_NOT_DECLARED_YET,\n"
            "  wordSetOverrides: { 0x1f: 1 },\n"
            "};\n"
        )
        with self.assertRaises(m.TsParseError):
            m.parse_ts_dialects(text)

    def test_unknown_opcode_def_field_raises_rather_than_being_dropped(self) -> None:
        """A new `OpcodeDef` field would change decoding. Silently ignoring it is the wrong default.

        This is the check that keeps the guard honest as `disassemble.ts` evolves: the parser is
        required to fail loudly on a shape it has not been taught, not to guess.
        """
        text = (
            "export const ECL_MYSTERY: EclDialect = {\n"
            "  headerLen: 22, vbase: 0x7ffe, hasMagic: true,\n"
            "  opcodeOverrides: { 0x27: { wordSet: 4, trailingBytes: 1, mnemonic: 'X' } },\n"
            "};\n"
        )
        with self.assertRaises(m.TsParseError) as ctx:
            m.parse_ts_dialects(text)
        self.assertIn("trailingBytes", str(ctx.exception))

    def test_a_dialect_with_no_geometry_and_no_spread_raises(self) -> None:
        text = "export const ECL_MYSTERY: EclDialect = {\n  wordSetOverrides: { 0x1f: 1 },\n};\n"
        with self.assertRaises(m.TsParseError):
            m.parse_ts_dialects(text)

    def test_unbalanced_braces_raise(self) -> None:
        with self.assertRaises(m.TsParseError):
            m.parse_ts_dialects(
                "export const ECL_MYSTERY: EclDialect = { headerLen: 22, vbase: 0, hasMagic: true\n"
            )

    def test_a_synthetic_dialect_parses_end_to_end(self) -> None:
        """The negative tests above prove rejection; this proves the parser accepts a real shape,
        so 'it raises on everything' cannot be how they all pass."""
        text = (
            "export const ECL_A: EclDialect = {\n"
            "  headerLen: 22, vbase: 0x7ffe, hasMagic: true,\n"
            "  wordSetOverrides: { 0x0c: 4, 0x2c: 1 },\n"
            "  opcodeOverrides: { 0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' } },\n"
            "};\n"
            "export const ECL_B: EclDialect = {\n"
            "  ...ECL_A,\n"
            "  wordSetOverrides: { ...ECL_A.wordSetOverrides, 0x1f: 1 },\n"
            "};\n"
        )
        parsed = m.parse_ts_dialects(text)
        self.assertEqual(parsed["ECL_B"].word_set_overrides, {0x0C: 4, 0x2C: 1, 0x1F: 1})
        # `ECL_B` declares no opcodeOverrides, so it inherits ECL_A's through the object spread.
        self.assertEqual(parsed["ECL_B"].opcode_overrides[0x31]["count_at"], 1)
        self.assertEqual(parsed["ECL_B"].header_len, 22)


# ---------------------------------------------------------------------------
# (c) The live guard.
# ---------------------------------------------------------------------------


class LiveParityTests(unittest.TestCase):
    def test_no_python_mirror_disagrees_with_the_engine_without_a_written_reason(self) -> None:
        unexplained = m.unexplained_divergences()
        self.assertEqual(
            [],
            [d.describe() for d in unexplained],
            "A Python ECL operand table disagrees with the TypeScript dialect it mirrors.\n"
            "Port the correction, or -- if the divergence is deliberate -- add it to\n"
            "ecl_dialect_parity.ALLOWED_DIVERGENCES with the reason in prose.",
        )

    def test_every_exemption_still_excuses_a_real_disagreement(self) -> None:
        """An allowlist entry whose two sides have converged is dead weight that reads as a live
        caveat. Delete it in the same change that made it true."""
        self.assertEqual([], m.stale_exemptions())

    def test_every_exemption_carries_a_substantive_reason(self) -> None:
        for ident, reason in m.ALLOWED_DIVERGENCES.items():
            with self.subTest(ident=ident):
                self.assertGreater(len(reason), 80, "reason too short to be a justification")

    def test_the_buck_dispatch_mirror_matches_the_engine_tables_it_names(self) -> None:
        self.assertEqual([], m.buck_mirror_disagreements())

    def test_every_scanner_profile_is_bound_to_a_dialect(self) -> None:
        """A profile missing from `PROFILE_TO_TS_DIALECT` would be silently uncompared."""
        import gen1_ecl_encounter_scan as scan

        declared = set(scan.PROFILE_WORD_SETS) | set(scan.PROFILE_EXTENDED_OPCODES)
        missing = declared - set(m.PROFILE_TO_TS_DIALECT)
        self.assertEqual(set(), missing)


# ---------------------------------------------------------------------------
# (d) The comparison can fail. MUTATION PROOFS.
# ---------------------------------------------------------------------------


class ComparisonCanFailTests(unittest.TestCase):
    def test_a_word_set_change_on_the_python_side_is_detected(self) -> None:
        import gen1_ecl_encounter_scan as scan

        profile = "death-knights-of-krynn"
        original = scan.PROFILE_WORD_SETS[profile]
        try:
            scan.PROFILE_WORD_SETS[profile] = {**original, 0x0C: 3}
            found = [
                d
                for d in m.all_divergences()
                if d.mirror == "gen1_ecl_encounter_scan" and d.key == profile and d.opcode == 0x0C
            ]
            self.assertEqual(1, len(found))
            self.assertEqual((3, None), found[0].python)
            self.assertEqual((4, None), found[0].ts)
        finally:
            scan.PROFILE_WORD_SETS[profile] = original
        self.assertEqual([], m.unexplained_divergences())

    def test_a_count_slot_change_on_the_python_side_is_detected(self) -> None:
        """`count_at` is not a cosmetic field: it drives a variable-length operand tail, so a
        mirror that copied `wordSet` and dropped `countAt` decodes a different instruction."""
        from dqk_ca03_stream_decode import Opcode

        import gen1_ecl_encounter_scan as scan

        profile = "death-knights-of-krynn"
        original = scan.PROFILE_EXTENDED_OPCODES[profile]
        try:
            scan.PROFILE_EXTENDED_OPCODES[profile] = {
                **original,
                0x31: Opcode(2, "SHORT_MENU"),  # same word set, count slot dropped
            }
            found = [
                d
                for d in m.all_divergences()
                if d.mirror == "gen1_ecl_encounter_scan" and d.key == profile and d.opcode == 0x31
            ]
            self.assertEqual(1, len(found))
            self.assertEqual((2, None), found[0].python)
            self.assertEqual((2, 1), found[0].ts)
        finally:
            scan.PROFILE_EXTENDED_OPCODES[profile] = original
        self.assertEqual([], m.unexplained_divergences())

    def test_a_geo_traversal_mirror_change_is_detected(self) -> None:
        """The second mirror is checked by the same machinery, so prove it is really engaged.

        `gen1_geo_traversal_scope` was already in sync when this guard was written -- which makes
        its zero-divergence result indistinguishable from "not compared at all" without this.
        """
        import gen1_geo_traversal_scope as geo

        original = dict(geo.DIALECT_DOK_OWN.wordset_overrides)
        try:
            geo.DIALECT_DOK_OWN.wordset_overrides[0x1F] = 2
            found = [
                d
                for d in m.all_divergences()
                if d.mirror == "gen1_geo_traversal_scope" and d.opcode == 0x1F
            ]
            self.assertEqual(1, len(found))
            self.assertEqual((2, None), found[0].python)
            self.assertEqual((1, None), found[0].ts)
        finally:
            geo.DIALECT_DOK_OWN.wordset_overrides.clear()
            geo.DIALECT_DOK_OWN.wordset_overrides.update(original)
        self.assertEqual([], m.unexplained_divergences())

    def test_a_dispatch_mirror_change_is_detected(self) -> None:
        import map_gen1_ecl_dispatch as dispatch

        original = dict(dispatch.CURRENT_DIALECTS["dok"]["word_set_overrides"])
        try:
            dispatch.CURRENT_DIALECTS["dok"]["word_set_overrides"][0x29] = 14
            found = [
                d
                for d in m.all_divergences()
                if d.mirror == "map_gen1_ecl_dispatch" and d.key == "dok" and d.opcode == 0x29
            ]
            self.assertEqual(1, len(found))
            self.assertEqual(14, found[0].python)
            self.assertEqual(0, found[0].ts)
        finally:
            dispatch.CURRENT_DIALECTS["dok"]["word_set_overrides"].clear()
            dispatch.CURRENT_DIALECTS["dok"]["word_set_overrides"].update(original)
        self.assertEqual([], m.unexplained_divergences())

    def test_an_allowlisted_divergence_is_suppressed_but_still_reported_as_a_divergence(
        self,
    ) -> None:
        """`all_divergences()` must keep seeing what `unexplained_divergences()` forgives.

        An allowlist that erased the underlying fact would make `stale_exemptions()` blind, and the
        exemption would then outlive its own justification with nothing able to notice.
        """
        import gen1_ecl_encounter_scan as scan

        profile = "death-knights-of-krynn"
        ident = ("gen1_ecl_encounter_scan", profile, 0x0C)
        original = scan.PROFILE_WORD_SETS[profile]
        try:
            scan.PROFILE_WORD_SETS[profile] = {**original, 0x0C: 3}
            m.ALLOWED_DIVERGENCES[ident] = "x" * 100
            self.assertEqual([], m.unexplained_divergences())
            self.assertIn(ident, {d.ident for d in m.all_divergences()})
            self.assertEqual([], m.stale_exemptions())
            # Remove the divergence and the exemption becomes stale, which must be reported.
            scan.PROFILE_WORD_SETS[profile] = original
            self.assertEqual([ident], m.stale_exemptions())
        finally:
            scan.PROFILE_WORD_SETS[profile] = original
            m.ALLOWED_DIVERGENCES.pop(ident, None)


if __name__ == "__main__":
    unittest.main()
