#!/usr/bin/env python3
"""Tests for tools/c64_vicmode.py -- the VIC-II display-mode census (C1.8).

Two layers:

  * `Synthetic*` classes need no corpus at all. They pin the census's *recall* (rule 4: every
    opcode that can write the register is enumerated, checked against `c64_disasm.OPCODES`
    itself rather than against a hand-list), the symbolic bit tracer's semantics, and the
    alias-adjudication machinery.
  * `Corpus*` classes read the never-vendored `D:\\Games\\Emulator\\C64\\Goldbox` images and
    skip cleanly when absent. They pin the actual census numbers for all seven titles.

Every corpus test that iterates asserts its loop actually ran (STANDING PROJECT RULE 6: a probe
that never executes reads as PASS).

Run: PYTHONIOENCODING=utf-8 python -m pytest tools/test_c64_vicmode.py -q
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disasm as da  # noqa: E402
import c64_vicmode as vm  # noqa: E402

CORPUS_PRESENT = os.path.isdir(vm.GOLDBOX_ROOT)
skip_no_corpus = unittest.skipUnless(
    CORPUS_PRESENT, f"external C64 corpus not present at {vm.GOLDBOX_ROOT}")


# ==========================================================================================
# Synthetic: opcode-class completeness (rule 4)
# ==========================================================================================

class OpcodeClassTests(unittest.TestCase):
    """The census's recall is only as good as its opcode tables. These derive the expected
    tables FROM `c64_disasm.OPCODES` rather than restating them, so adding a mnemonic to the
    disassembler (or dropping one here) fails loudly instead of silently shrinking the search.
    """

    ABSMODES = (da.ABS, da.ABX, da.ABY)

    def test_every_documented_absolute_store_is_in_write_opcodes(self):
        expected = {op for op, (mnem, mode) in da.OPCODES.items()
                    if mode in self.ABSMODES and mnem in ("STA", "STX", "STY")}
        self.assertTrue(expected, "the disassembler defines no absolute stores at all")
        self.assertEqual(expected, {op for op, (m, _) in vm.WRITE_OPCODES.items()
                                    if m in ("STA", "STX", "STY")})

    def test_every_documented_absolute_rmw_is_in_write_opcodes(self):
        """INC/DEC/ASL/LSR/ROL/ROR in ABS/ABX all write the address they name. A store-only
        scan would miss them; the point of this test is that dropping them from the module is
        an immediate red, not a quietly narrower census."""
        expected = {op for op, (mnem, mode) in da.OPCODES.items()
                    if mode in self.ABSMODES
                    and mnem in ("INC", "DEC", "ASL", "LSR", "ROL", "ROR")}
        self.assertEqual(len(expected), 12, "expected 6 mnemonics x {abs, abx}")
        self.assertEqual(expected, set(vm.RMW_OPCODES))
        self.assertTrue(expected <= set(vm.WRITE_OPCODES))

    def test_illegal_write_opcodes_are_invisible_to_the_disassembler(self):
        """The undocumented store/RMW opcodes must NOT be in `c64_disasm.OPCODES` -- that is
        precisely why they need their own table. If one ever gets added to the disassembler
        this test says so, rather than the census double-counting it."""
        self.assertTrue(vm.ILLEGAL_WRITE_OPCODES)
        overlap = set(vm.ILLEGAL_WRITE_OPCODES) & set(da.OPCODES)
        self.assertEqual(overlap, set(), f"now-documented opcodes: {sorted(overlap)}")

    def test_read_opcodes_cover_the_read_modify_pair_idiom(self):
        """The corpus's real idiom is a read-modify pair. ORA/AND/EOR/LDA in absolute mode must
        all be in the READ table or the stored VALUE cannot be resolved at all."""
        for mnem in ("LDA", "LDX", "LDY", "ORA", "AND", "EOR", "ADC", "SBC", "CMP"):
            with self.subTest(mnem=mnem):
                want = {op for op, (m, mode) in da.OPCODES.items()
                        if m == mnem and mode in self.ABSMODES}
                self.assertTrue(want <= set(vm.READ_OPCODES), f"{mnem} missing from READ_OPCODES")

    def test_write_and_read_tables_are_disjoint(self):
        self.assertEqual(set(vm.WRITE_OPCODES) & set(vm.READ_OPCODES), set())

    def test_mode_bits_cover_all_three_glyph_interpretation_bits(self):
        flat = {name: mask for bits in vm.MODE_BITS.values() for name, mask in bits}
        self.assertEqual(flat, {"BMM": 0x20, "ECM": 0x40, "MCM": 0x10})


# ==========================================================================================
# Synthetic: candidate scanning
# ==========================================================================================

class CandidateScanTests(unittest.TestCase):

    def test_finds_store_read_and_illegal_classes(self):
        body = bytes.fromhex(
            "8D16D0"   # 0  STA $D016            -> write
            "AD16D0"   # 3  LDA $D016            -> read
            "EE11D0"   # 6  INC $D011            -> write (RMW)
            "0F16D0"   # 9  SLO $D016 (illegal)  -> illegal-write
            "8D20D0"   # 12 STA $D020            -> not a target
        )
        sites = vm.candidate_sites("T", "F", body)
        self.assertEqual([(s.offset, s.kind, s.mnemonic) for s in sites],
                         [(0, vm.WRITE, "STA"), (3, vm.READ, "LDA"),
                          (6, vm.WRITE, "INC"), (9, vm.ILLEGAL_WRITE, "SLO")])

    def test_scan_is_raw_and_reports_mid_operand_aliases(self):
        """Recall over precision, by design: an operand byte pair that happens to spell a
        target must be REPORTED (and then adjudicated), never silently dropped."""
        body = bytes.fromhex("AD" "8D16D0")   # LDA $8D16 ; then D0 ... -- offset 1 aliases
        sites = vm.candidate_sites("T", "F", body)
        self.assertEqual([s.offset for s in sites], [1])

    def test_indexed_base_sites_only_reports_bases_that_could_reach(self):
        body = bytes.fromhex(
            "9D00D0"   # 0  STA $D000,X  -- base below a target, could reach
            "9D16D0"   # 3  STA $D016,X  -- base IS a target: excluded (the literal census has it)
            "9D20D0"   # 6  STA $D020,X  -- base above $D018: unsigned index can never reach
            "8D00D0"   # 9  STA $D000    -- not indexed
        )
        sites = vm._indexed_sites_in_body("T", "F", body)
        self.assertEqual([s.offset for s in sites], [0])


# ==========================================================================================
# Synthetic: the symbolic bit tracer
# ==========================================================================================

class TraceBitTests(unittest.TestCase):

    def test_the_real_multicolour_set_idiom_resolves_to_set(self):
        body = vm.MCM_SET_IDIOM                     # ... A9 10 / 0D 16 D0 / 8D 16 D0
        store = len(body) - 3
        self.assertEqual(vm.trace_bit(body, store, vm.MCM_BIT)[0], vm.SET)

    def test_the_real_multicolour_clear_idiom_resolves_to_clear(self):
        body = vm.MCM_CLEAR_IDIOM                   # AD 16 D0 / 29 EF / 8D 16 D0
        self.assertEqual(vm.trace_bit(body, len(body) - 3, vm.MCM_BIT)[0], vm.CLEAR)

    def test_bitmap_set_and_clear_idioms(self):
        self.assertEqual(vm.trace_bit(vm.BMM_SET_IDIOM, 5, vm.BMM_BIT)[0], vm.SET)
        self.assertEqual(vm.trace_bit(vm.BMM_CLEAR_IDIOM, 5, vm.BMM_BIT)[0], vm.CLEAR)

    def test_ora_immediate_missing_the_bit_leaves_it_unknown(self):
        """`LDA $D011 / ORA #$10 / STA $D011` turns the SCREEN on (DEN, bit 4). It says nothing
        about bit 5, and the tracer must not pretend otherwise -- this exact instruction
        sequence is present in every title's INIT."""
        body = bytes.fromhex("AD11D0" "0910" "8D11D0")
        self.assertEqual(vm.trace_bit(body, 5, vm.BMM_BIT)[0], vm.UNKNOWN)

    def test_immediate_load_resolves_both_ways(self):
        self.assertEqual(vm.trace_bit(bytes.fromhex("A9118D11D0"), 2, vm.BMM_BIT)[0], vm.CLEAR)
        self.assertEqual(vm.trace_bit(bytes.fromhex("A9358D16D0"), 2, vm.MCM_BIT)[0], vm.SET)

    def test_a_load_from_memory_is_unknown_not_guessed(self):
        """`LDA $114C / STA $D016` restores a saved register value. Both INIT sites that do this
        must read UNKNOWN; inventing a verdict here is how a false refutation gets published."""
        body = bytes.fromhex("AD4C11" "8D16D0")
        self.assertEqual(vm.trace_bit(body, 3, vm.MCM_BIT)[0], vm.UNKNOWN)

    def test_a_load_from_memory_DESTROYS_earlier_knowledge(self):
        """Stronger form of the above: the tracer must not carry a stale verdict across an
        absolute load. `LDA #$10 / LDA $114C / STA $D016` is UNKNOWN, not SET."""
        body = bytes.fromhex("A910" "AD4C11" "8D16D0")
        self.assertEqual(vm.trace_bit(body, 5, vm.MCM_BIT)[0], vm.UNKNOWN)
        # ...while the same prefix without the intervening load does resolve.
        self.assertEqual(vm.trace_bit(bytes.fromhex("A910" "8D16D0"), 2, vm.MCM_BIT)[0], vm.SET)

    def test_a_jsr_resets_every_register_to_unknown(self):
        body = bytes.fromhex("A910" "20AE47" "8D16D0")
        self.assertEqual(vm.trace_bit(body, 5, vm.MCM_BIT)[0], vm.UNKNOWN)

    def test_transfers_carry_the_bit(self):
        self.assertEqual(vm.trace_bit(bytes.fromhex("A910" "AA" "8E16D0"), 3, vm.MCM_BIT)[0],
                         vm.SET)

    def test_rmw_effects_are_reported_unknown_not_assumed(self):
        for op in sorted(vm.RMW_OPCODES):
            with self.subTest(op=f"${op:02X}"):
                self.assertEqual(vm.rmw_bit_effect(op, vm.MCM_BIT), vm.UNKNOWN)


# ==========================================================================================
# Synthetic: alignment / alias adjudication
# ==========================================================================================

class AlignmentTests(unittest.TestCase):

    def test_decodes_onto_follows_instruction_sizes(self):
        body = bytes.fromhex("A910" "8D16D0" "60")
        self.assertTrue(vm.decodes_onto(body, 0, 2))
        self.assertFalse(vm.decodes_onto(body, 1, 2))

    def test_convergence_is_high_at_a_boundary_and_zero_one_byte_into_the_operand(self):
        code = bytes.fromhex("A900" "A901" "A902" "A903" "A904" "A905" "8D16D0")
        hits, tried = vm.convergence(code, 12, 12)                 # the STA itself
        self.assertEqual((hits, tried), (11, 12))
        self.assertGreaterEqual(hits / tried, vm.ALIGN_MIN_FRACTION)
        self.assertEqual(vm.convergence(code, 13, 12), (1, 12))    # mid-operand
        self.assertEqual(vm.convergence(code, 14, 12), (0, 12))
        for off in (13, 14):
            h, t = vm.convergence(code, off, 12)
            self.assertLess(h / t, vm.ALIGN_MIN_FRACTION)

    def test_window_sweep_reports_both_neighbours(self):
        code = bytes.fromhex("A900" * 8 + "8D16D0")
        sweep = vm.convergence_window_sweep(code, 16, 12)
        self.assertEqual(sorted(sweep), [11, 12, 13])

    def test_local_illegal_fraction_separates_code_from_undecodable_bytes(self):
        code = bytes.fromhex("A900" "A901" "8D16D0" "60" "EA" "EA")
        junk = bytes.fromhex("02030407" "8D16D0" "0212131A")
        self.assertLessEqual(vm.local_illegal_fraction(code, 4, 16),
                             vm.CODE_MAX_ILLEGAL_FRACTION)
        self.assertGreater(vm.local_illegal_fraction(junk, 4, 16),
                           vm.CODE_MAX_ILLEGAL_FRACTION)

    def test_immediate_is_only_reported_when_it_is_on_the_same_decode(self):
        """Regression for a real false positive: Gateway's `GATEWAY` file has `A9 C8` two bytes
        before an aliasing `8D 16 D0`, but the aligned decode consumes them as a branch operand
        plus an `INY`. A raw `body[off-2]` check would publish "$D016 := $C8"."""
        aligned = bytes.fromhex("A934" "8D16D0")
        site = vm.Site("T", "F", 2, 0x8D, "STA", da.ABS, 0xD016, vm.WRITE)
        self.assertEqual(vm.adjudicate(aligned, site).imm_value, 0x34)

        misaligned = bytes.fromhex("D0A9" "C8" "8D16D0")   # BNE ; INY ; STA $D016
        site2 = vm.Site("T", "F", 3, 0x8D, "STA", da.ABS, 0xD016, vm.WRITE)
        self.assertIsNone(vm.adjudicate(misaligned, site2).imm_value)


# ==========================================================================================
# Corpus: the headline census
# ==========================================================================================

#: Exact per-title candidate / write / credible-write counts, produced by
#:   python tools/c64_vicmode.py summary
#: at the module defaults (lookback=12, radius=64). Candidate and write counts are window-
#: independent; the credible count is the only one either window touches.
EXPECTED_COUNTS = {
    "Champions of Krynn":                  (30, 16, 15),
    "Death Knights of Krynn":              (26, 15, 15),
    "Curse of the Azure Bonds":            (24, 13, 12),
    "Secret of the Silver Blades":         (27, 15, 15),
    "Gateway to the Savage Frontier":      (27, 13, 12),
    "Pool of Radiance":                    (34, 18, 17),
    "Buck Rogers - Countdown to Doomsday": (20, 11, 11),
}

#: (write, read, illegal-write) candidate counts per title, from the same run. The
#: illegal-write column is 0 everywhere but Champions of Krynn, whose two hits (GEN@2191 SHA,
#: INIT@537 SRE) are both byte-aliases inside data -- pinned so that dropping an undocumented
#: opcode from the table changes a number rather than nothing.
EXPECTED_KINDS = {
    "Champions of Krynn":                  (16, 12, 2),
    "Death Knights of Krynn":              (15, 11, 0),
    "Curse of the Azure Bonds":            (13, 11, 0),
    "Secret of the Silver Blades":         (15, 12, 0),
    "Gateway to the Savage Frontier":      (13, 14, 0),
    "Pool of Radiance":                    (18, 16, 0),
    "Buck Rogers - Countdown to Doomsday": (11, 9, 0),
}


@skip_no_corpus
class CorpusCensusTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.census = {t: vm.adjudicated_census(t) for t in vm.TITLES}

    def test_all_seven_titles_were_read(self):
        self.assertEqual(len(self.census), 7)
        self.assertEqual(set(self.census), set(EXPECTED_COUNTS))

    def test_per_title_counts(self):
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                writes = [v for v in vs if v.site.kind == vm.WRITE]
                cred = vm.credible_writes(vs)
                self.assertEqual((len(vs), len(writes), len(cred)), EXPECTED_COUNTS[title])
                checked += 1
        self.assertEqual(checked, 7)

    def test_per_title_candidate_kind_breakdown(self):
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                kinds = tuple(sum(1 for v in vs if v.site.kind == k)
                              for k in (vm.WRITE, vm.READ, vm.ILLEGAL_WRITE))
                self.assertEqual(kinds, EXPECTED_KINDS[title])
                checked += 1
        self.assertEqual(checked, 7)

    def test_the_two_undocumented_opcode_hits_are_data_aliases_not_code(self):
        """Champions of Krynn's only two illegal-write candidates. Both fail alignment, so the
        undocumented-opcode table changes the CANDIDATE count but not the verdict -- recorded
        rather than left as an unexamined 'we also looked for those'."""
        vs = [v for v in self.census["Champions of Krynn"]
              if v.site.kind == vm.ILLEGAL_WRITE]
        self.assertEqual([(v.site.file, v.site.offset, v.site.mnemonic) for v in vs],
                         [("GEN", 2191, "SHA"), ("INIT", 537, "SRE")])
        for v in vs:
            self.assertFalse(v.credible)
            self.assertLess(v.conv_hits / v.conv_tried, vm.ALIGN_MIN_FRACTION)


# ==========================================================================================
# Corpus: THE CLAIM
# ==========================================================================================

@skip_no_corpus
class DisplayModeClaimTests(unittest.TestCase):
    """The claim this round was dispatched to settle, split into the parts the bytes support
    and the part they refute. See docs/engine/research/c64-wallset-format.md section 8."""

    @classmethod
    def setUpClass(cls):
        cls.census = {t: vm.adjudicated_census(t) for t in vm.TITLES}
        cls.bodies = {t: vm.all_bodies(t) for t in vm.TITLES}

    # --- ESTABLISHED -------------------------------------------------------------------

    def test_dungeon_never_names_a_vic_mode_register_in_any_title(self):
        """Not one hit -- not even a byte-alias -- for $D011/$D016/$D018 anywhere in DUNGEON,
        in all seven titles. Extends the wallset doc's CoK-only 3.4 finding corpus-wide."""
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                self.assertIn("DUNGEON", self.bodies[title], "no DUNGEON file to check")
                self.assertEqual([v for v in vs if v.site.file == "DUNGEON"], [])
                checked += 1
        self.assertEqual(checked, 7)

    def test_neither_graphics_driver_slot_occupant_clears_multicolour(self):
        """GDRIVE00 and GDRIVE02 -- the other two occupants of the $C000 driver slot -- make no
        reference at all; GDRIVE01's only $D016 write SETS bit 4."""
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                for name in ("GDRIVE00", "GDRIVE02"):
                    if name in self.bodies[title]:
                        self.assertEqual([v for v in vs if v.site.file == name], [],
                                         f"{name} unexpectedly references a VIC mode register")
                g01 = [v for v in vm.writes_to(vs, vm.VIC_CTRL2) if v.site.file == "GDRIVE01"]
                self.assertEqual(len(g01), 1)
                self.assertEqual(g01[0].bit("MCM"), vm.SET)
                self.assertEqual(g01[0].site.offset, 187)
                checked += 1
        self.assertEqual(checked, 7)

    def test_the_always_resident_kernel_writes_d016_once_and_sets_multicolour(self):
        """LIBRARY is never unloaded (docs/engine/research/c64-resident-kernel.md). It contains
        exactly one $D016 write in every title, and that write turns multicolour ON."""
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                lib = [v for v in vm.writes_to(vs, vm.VIC_CTRL2) if v.site.file == "LIBRARY"]
                self.assertEqual(len(lib), 1)
                self.assertEqual(lib[0].bit("MCM"), vm.SET)
                checked += 1
        self.assertEqual(checked, 7)

    def test_every_credible_d016_write_outside_init_sets_multicolour(self):
        """The load-bearing statement. Across all seven titles there is no file other than INIT
        that provably -- or even ambiguously -- leaves $D016 bit 4 clear."""
        checked = total = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                outside = [v for v in vm.writes_to(vs, vm.VIC_CTRL2) if v.site.file != "INIT"]
                self.assertTrue(outside, "no non-INIT $D016 writes found at all")
                for v in outside:
                    self.assertEqual(v.bit("MCM"), vm.SET,
                                     f"{title} {v.site.file}@{v.site.offset} is not a SET")
                total += len(outside)
                checked += 1
        self.assertEqual(checked, 7)
        # 3 + 3 + 3 + 3 + 3 + 4 + 2 = 21; see the per-title table in the doc's section 8.
        self.assertEqual(total, 21)

    def test_no_site_anywhere_in_the_corpus_enables_extended_colour_mode(self):
        """The third glyph-interpretation mode, censused rather than assumed off (rule 4)."""
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                self.assertEqual(vm.writes_leaving(vs, "ECM", vm.SET), [])
                self.assertEqual(vm.find_idiom(self.bodies[title], vm.ECM_SET_IDIOM), [])
                checked += 1
        self.assertEqual(checked, 7)

    # --- REFUTED -----------------------------------------------------------------------

    def test_init_does_clear_multicolour_in_every_title(self):
        """The universal as originally stated is FALSE. Every title's INIT contains at least one
        decode-aligned, locally-code-clean `LDA $D016 / AND #$EF / STA $D016`."""
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                clears = vm.writes_leaving(vs, "MCM", vm.CLEAR)
                self.assertTrue(clears, "expected at least one MCM clear")
                self.assertEqual({v.site.file for v in clears}, {"INIT"})
                checked += 1
        self.assertEqual(checked, 7)

    def test_init_does_enable_bitmap_mode_in_every_title(self):
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                sets = vm.writes_leaving(vs, "BMM", vm.SET)
                self.assertEqual(len(sets), 1)
                self.assertEqual(sets[0].site.file, "INIT")
                checked += 1
        self.assertEqual(checked, 7)

    def test_every_mode_disturbing_write_is_confined_to_init(self):
        """The scoped claim that survives: the refuting writes all live in INIT, and nowhere
        else in 2610 files across 49 disk sides."""
        checked = 0
        for title, vs in self.census.items():
            with self.subTest(title=title):
                bad = vm.writes_leaving(vs, "MCM", vm.CLEAR) + vm.writes_leaving(vs, "BMM", vm.SET)
                self.assertEqual({v.site.file for v in bad}, {"INIT"})
                checked += 1
        self.assertEqual(checked, 7)

    def test_init_is_an_0800_overlay_and_so_cannot_be_resident_with_dungeon(self):
        """Why INIT's clears do not reach the dungeon view: INIT is one of the mutually
        exclusive $0800 dispatch overlays, so its bytes are gone the moment DUNGEON is loaded.
        Measured the way the resident-kernel work measures residence -- own-JSR/JMP
        self-consistency, with LIBRARY's heavily-called span excluded as a confound."""
        checked = 0
        for title in vm.TITLES:
            with self.subTest(title=title):
                bodies = self.bodies[title]
                init, lib = bodies["INIT"], bodies["LIBRARY"]
                excl = (0x2DC8, 0x2DC8 + len(lib))
                scores = {org: vm.self_consistency_excluding(init, org, excl)
                          for org in (0x0800, 0x4000, 0xC000)}
                best = max(scores, key=lambda o: scores[o][0] / max(scores[o][1], 1))
                self.assertEqual(best, 0x0800)
                hits, total = scores[0x0800]
                self.assertGreater(hits / total, 0.30)
                for other in (0x4000, 0xC000):
                    self.assertLess(scores[other][0] / scores[other][1], 0.15)
                checked += 1
        self.assertEqual(checked, 7)

    def test_dungeon_calls_the_driver_slot_that_re_asserts_multicolour(self):
        """And why the mode is re-asserted whenever the dungeon view is set up: GDRIVE01's
        table slot 0 is `JMP $C0A1`, whose body is the multicolour-set idiom, and DUNGEON
        calls `JSR $C000` in every title."""
        checked = 0
        for title in vm.TITLES:
            with self.subTest(title=title):
                bodies = self.bodies[title]
                g, d = bodies["GDRIVE01"], bodies["DUNGEON"]
                self.assertEqual(g[0], 0x4C)
                self.assertEqual(g[1] | (g[2] << 8), 0xC0A1)
                self.assertEqual(g.find(vm.MCM_SET_IDIOM), 177)   # $C0B1, inside $C0A1's body
                calls = sum(1 for i in range(len(d) - 2)
                            if d[i] == 0x20 and (d[i + 1] | (d[i + 2] << 8)) == 0xC000)
                self.assertGreaterEqual(calls, 2)
                checked += 1
        self.assertEqual(checked, 7)


# ==========================================================================================
# Corpus: window-edge and threshold sensitivity (STANDING PROJECT RULE 1)
# ==========================================================================================

@skip_no_corpus
class WindowEdgeTests(unittest.TestCase):
    """The lookback window and the local radius are analysis windows, so their own edges must
    be reported, not assumed away. These tests fail if the verdict depends on the cut."""

    def test_credible_write_counts_are_identical_at_lookback_11_12_and_13(self):
        checked = 0
        for title in vm.TITLES:
            counts = {lb: len(vm.credible_writes(vm.adjudicated_census(title, lookback=lb)))
                      for lb in (11, 12, 13)}
            with self.subTest(title=title):
                self.assertEqual(len(set(counts.values())), 1, counts)
                checked += 1
        self.assertEqual(checked, 7)

    def test_the_headline_verdict_is_invariant_across_the_whole_window_grid(self):
        """MCM-clearing and BMM-setting writes live in INIT and nowhere else, at every
        (lookback, radius) combination tried -- 12 grid points per title, 84 in total."""
        grid = 0
        for title in vm.TITLES:
            for radius in (32, 64, 96, 128):
                for lookback in (11, 12, 13):
                    vs = vm.adjudicated_census(title, lookback=lookback, radius=radius)
                    with self.subTest(title=title, radius=radius, lookback=lookback):
                        bad = (vm.writes_leaving(vs, "MCM", vm.CLEAR)
                               + vm.writes_leaving(vs, "BMM", vm.SET))
                        self.assertTrue(bad)
                        self.assertEqual({v.site.file for v in bad}, {"INIT"})
                    grid += 1
        self.assertEqual(grid, 84)


# ==========================================================================================
# Corpus: the indexed-write blind spot
# ==========================================================================================

@skip_no_corpus
class IndexedBlindSpotTests(unittest.TestCase):
    """A literal-operand census cannot see `STA $D000,X` with X=$16. This measures that blind
    spot rather than assuming it away, and shows the graphics-path sites are bounded below the
    lowest target."""

    #: The only credible graphics-path indexed writes whose index is NOT loaded from an
    #: immediate, and so had to be read by hand. Pool of Radiance's DUNGEON computes
    #: `LDX $9701 / ... / STA $CFF8,X / TXA / ASL A / TAY / STA $D000,Y`: X is a sprite slot
    #: index, bounded to 0-7 by the `STA $CFF8,X` sprite-pointer write in the same straight-line
    #: run ($CFF8-$CFFF are the eight pointers for the screen at $CC00), so Y = 2X <= 14 and the
    #: highest address either store can touch is $D00F -- one byte below $D011.
    HAND_ADJUDICATED = {("Pool of Radiance", "DUNGEON", 8650),
                        ("Pool of Radiance", "DUNGEON", 8659)}

    def test_every_credible_indexed_write_in_a_graphics_path_file_is_bounded_below_d011(self):
        """For each credible indexed write in DUNGEON / GDRIVE00 / GDRIVE01 / LIBRARY, the
        nearest ALIGNED `LDX/LDY #imm` before it bounds the index, and base+bound < $D011."""
        graphics = ("DUNGEON", "GDRIVE00", "GDRIVE01", "LIBRARY")
        checked = 0
        unresolved = set()
        for title in vm.TITLES:
            bodies = vm.all_bodies(title)
            for site in vm.indexed_base_sites(title):
                if site.file not in graphics:
                    continue
                body = bodies[site.file]
                if not vm.adjudicate(body, site).credible:
                    continue
                bound = vm.index_bound(body, site.offset)
                key = (title, site.file, site.offset)
                if bound is None:
                    unresolved.add(key)
                    continue
                with self.subTest(title=title, file=site.file, off=site.offset):
                    self.assertLess(site.target + bound, vm.VIC_CTRL1)
                    checked += 1
        self.assertEqual(checked, 29, "the loop did not visit the expected site population")
        self.assertEqual(unresolved, self.HAND_ADJUDICATED)

    def test_the_hand_adjudicated_pool_sites_really_are_sprite_pointer_bounded(self):
        """Pins the reasoning in HAND_ADJUDICATED to the bytes: the $CFF8,X sprite-pointer write
        and the TXA/ASL/TAY doubling must both be present, aligned, before the store."""
        body = vm.all_bodies("Pool of Radiance")["DUNGEON"]
        checked = 0
        for _, _, off in sorted(self.HAND_ADJUDICATED):
            with self.subTest(off=off):
                window = body[off - 60:off]
                self.assertIn(bytes.fromhex("9DF8CF"), window)     # STA $CFF8,X
                self.assertIn(bytes.fromhex("8A0AA8"), window)     # TXA / ASL A / TAY
                checked += 1
        self.assertEqual(checked, 2)

    def test_indexed_bases_above_the_highest_target_are_excluded_as_unreachable(self):
        for title in vm.TITLES:
            with self.subTest(title=title):
                for s in vm.indexed_base_sites(title):
                    self.assertLessEqual(s.target, vm.VIC_MEMPTR)
                    self.assertGreaterEqual(s.target, vm.INDEXED_BASE_LO)


# ==========================================================================================
# Corpus: the independent byte-pattern instrument
# ==========================================================================================

@skip_no_corpus
class IdiomPatternTests(unittest.TestCase):

    def test_the_multicolour_set_idiom_is_byte_identical_in_gdrive01_and_library_everywhere(self):
        checked = 0
        for title in vm.TITLES:
            hits = dict(vm.find_idiom(vm.all_bodies(title), vm.MCM_SET_IDIOM))
            with self.subTest(title=title):
                self.assertEqual(hits.get("GDRIVE01"), 177)
                self.assertIn("LIBRARY", hits)
                checked += 1
        self.assertEqual(checked, 7)

    def test_the_multicolour_clear_idiom_occurs_exactly_once_per_title_and_only_in_init(self):
        checked = 0
        for title in vm.TITLES:
            hits = vm.find_idiom(vm.all_bodies(title), vm.MCM_CLEAR_IDIOM)
            with self.subTest(title=title):
                self.assertEqual([f for f, _ in hits], ["INIT"])
                checked += 1
        self.assertEqual(checked, 7)

    def test_the_pattern_search_undercounts_relative_to_the_opcode_census(self):
        """Three titles spell a SECOND multicolour clear as `LDA $D016 / STA <save> / AND #$EF /
        STA $D016`, which no fixed byte pattern finds. This is the concrete reason the opcode
        census exists (rule 4), pinned so nobody replaces it with a grep."""
        titles = ("Champions of Krynn", "Death Knights of Krynn", "Secret of the Silver Blades")
        checked = 0
        for title in titles:
            vs = vm.adjudicated_census(title)
            with self.subTest(title=title):
                self.assertEqual(len(vm.writes_leaving(vs, "MCM", vm.CLEAR)), 2)
                self.assertEqual(len(vm.find_idiom(vm.all_bodies(title), vm.MCM_CLEAR_IDIOM)), 1)
                checked += 1
        self.assertEqual(checked, 3)

    def test_bitmap_idioms_occur_once_each_per_title_in_init(self):
        checked = 0
        for title in vm.TITLES:
            bodies = vm.all_bodies(title)
            with self.subTest(title=title):
                self.assertEqual([f for f, _ in vm.find_idiom(bodies, vm.BMM_SET_IDIOM)], ["INIT"])
                self.assertEqual([f for f, _ in vm.find_idiom(bodies, vm.BMM_CLEAR_IDIOM)],
                                 ["INIT"])
                checked += 1
        self.assertEqual(checked, 7)

    def test_spelln64_sets_multicolour_where_it_exists_and_is_absent_elsewhere(self):
        """The task brief guessed SPELLN64@124/129 was a data alias. It is not: it is a
        decode-aligned `LDA $D016 / ORA #$10 / STA $D016`. Recorded as a correction. The two
        titles without it (Death Knights, Buck Rogers) have no SPELLN64 file at all -- absent,
        not empty."""
        with_file = without_file = 0
        for title in vm.TITLES:
            bodies = vm.all_bodies(title)
            if "SPELLN64" not in bodies:
                without_file += 1
                continue
            with self.subTest(title=title):
                self.assertEqual(bodies["SPELLN64"].find(vm.MCM_SET_ORA_IDIOM), 124)
                v = [x for x in vm.adjudicated_census(title)
                     if x.site.file == "SPELLN64" and x.site.kind == vm.WRITE]
                self.assertEqual(len(v), 1)
                self.assertTrue(v[0].credible)
                self.assertEqual(v[0].bit("MCM"), vm.SET)
            with_file += 1
        self.assertEqual((with_file, without_file), (5, 2))


if __name__ == "__main__":
    unittest.main()
