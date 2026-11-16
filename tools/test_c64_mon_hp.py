"""Tests for the 2026-08-13 round's additions to `tools/c64_mon.py`
(`zp_indirect_store_census`, `print_string_routine_callers`, and -- C1.6, same day --
`source_pointer_writer_census`, `print_loop_entry_callers`, `check_library_4c_sites`) --
see docs/engine/research/c64-mon-format.md sections 14 and 14.7 for the full disassembly
writeups these pin the observable consequences of.

Named `test_c64_mon_hp.py` per this round's task brief, but the round did NOT resolve
the DoK hp @40-vs-@214 question (see the doc) -- there is no hp field to test. This file
instead pins the round's real, positive output: the indirect-indexed store census that
closes the rule-4 gap the prior rounds left open, the two real call sites into the
newly-found generic string-copy primitive, and (C1.6) the full $07/$08 writer census, the
print loop's multi-entry caller census, and the seven-per-title `STA ($4C),Y` site labels.

All tests read from the retail C64 disk images at `D:/Games/Emulator/C64/Goldbox/` (never
vendored) and skip -- never fail -- when that drive is absent, matching every other C64
test module in this project.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_kernel as kernel  # read-only reuse, not owned/edited by this investigation
import c64_mon as mon

C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")
COK_SIDE1 = C64_SETS / "Champions of Krynn" / "Champions of Krynn - Side 1.D64"
DOK_SIDE1 = C64_SETS / "Death Knights of Krynn" / "Death Knights of Krynn - Side 1.D64"

skip_no_c64 = unittest.skipUnless(
    COK_SIDE1.exists() and DOK_SIDE1.exists(),
    f"{C64_SETS} not present (external, never vendored)",
)


@skip_no_c64
class ZpIndirectStoreCensusTests(unittest.TestCase):
    """Pins `zp_indirect_store_census()` -- the indirect-indexed (`STA (zp),Y`) census
    `screen_memory_writes()` never ran, restricted to established-code files, all sides.

    Proof this test can fail (real, not staged, per standing rule 6): flipping the opcode
    filter from `("STA", c64d.IZY)` to `("STA", c64d.IZX)` in `zp_indirect_store_census`
    and re-running drops the CoK total from 174 to 104 (STA (zp,X) is a DIFFERENT 6502
    addressing mode) -- confirming the function is actually counting the instructions it
    claims to, not returning a hardcoded/memoized constant.

    CORRECTED 2026-08-13: the totals below were first pinned at CoK 148 / DoK 215, computed
    over `_CODE_FILES`, which deliberately EXCLUDES `LIBRARY` (correctly, for the inbound-
    call censuses it was written for -- see the note above `_OPERATION_CENSUS_FILES`). An
    OPERATION census must not inherit that exclusion, and the pair counts the doc printed
    (46/47) never reproduced from the shipped function at all. Both are fixed here, and
    `test_library_is_inside_the_operation_census` below makes the widening itself falsifiable
    rather than a silent constant bump.
    """

    def test_totals_both_titles(self):
        # Exact totals over _OPERATION_CENSUS_FILES (_CODE_FILES + LIBRARY), re-derived
        # independently from the raw disk images by a plain opcode-decode scan.
        cok = mon.zp_indirect_store_census("cok")
        dok = mon.zp_indirect_store_census("dok")
        self.assertEqual(sum(cok.values()), 174)
        self.assertEqual(sum(dok.values()), 242)
        # The distinct (file, zp) pair counts -- the column the doc originally printed as
        # 46/47, which reproduced from neither the narrow nor the wide file set.
        self.assertEqual(len(cok), 62)
        self.assertEqual(len(dok), 78)

    def test_library_is_inside_the_operation_census(self):
        """The resident kernel is established code and MUST be censused. Deleting
        `| {"LIBRARY"}` from `_OPERATION_CENSUS_FILES` turns every assertion here red.

        This is the probe for the actual defect: `LIBRARY` carries 26 (CoK) / 27 (DoK)
        `STA (zp),Y` sites, INCLUDING seven through `$4C` and one through `$4E` -- the exact
        pointer pair section 14.2's argument is about -- and the `$4E` one is the screen-text
        print loop documented in section 14.5. Excluding it was standing rule 4 failing at
        file scope.
        """
        for title, sta_4c, total in (("cok", 7, 26), ("dok", 7, 27)):
            self.assertIn("LIBRARY", mon._OPERATION_CENSUS_FILES[title])
            self.assertNotIn(
                "LIBRARY", mon._CODE_FILES[title],
                f"{title}: _CODE_FILES must KEEP excluding LIBRARY -- the inbound-call "
                f"censuses depend on that exclusion; only the operation census widens it",
            )
            census = mon.zp_indirect_store_census(title)
            lib = {zp: n for (name, zp), n in census.items() if name == "LIBRARY"}
            self.assertEqual(sum(lib.values()), total, f"{title}: LIBRARY STA (zp),Y total")
            self.assertEqual(lib.get(0x4C), sta_4c, f"{title}: LIBRARY STA ($4C),Y sites")
            self.assertEqual(lib.get(0x4E), 1, f"{title}: LIBRARY STA ($4E),Y site")

    def test_4c_4d_is_not_exclusive_to_the_row_pointer_helper(self):
        # DUNGEON writes through ($4C),Y multiple times in both titles -- the count
        # itself doesn't prove non-exclusivity (that needs the disassembly in the doc),
        # but it pins the raw fact the doc's section-14 argument rests on: there ARE
        # multiple sites, not just the one or two the row-pointer helper would produce
        # per invocation, and GEN (a file with no established row-pointer-helper caller
        # at all per row_pointer_helper_callers()) also has one.
        cok = mon.zp_indirect_store_census("cok")
        dok = mon.zp_indirect_store_census("dok")
        self.assertEqual(cok[("DUNGEON", 0x4C)], 8)
        self.assertEqual(dok[("DUNGEON", 0x4C)], 7)
        self.assertEqual(cok[("GEN", 0x4C)], 1)
        self.assertEqual(dok[("GEN", 0x4C)], 1)
        # GEN is not a row_pointer_helper_callers() site in either title -- its $4C
        # pointer must come from somewhere else, direct evidence $4C/$4D is general.
        self.assertNotIn("GEN", mon.row_pointer_helper_callers("cok"))
        self.assertNotIn("GEN", mon.row_pointer_helper_callers("dok"))

    def test_census_only_counts_established_code_files(self):
        # A file NOT on _CODE_FILES (e.g. a MON<hex> data file) must never appear as a
        # key's file component, even if its raw bytes happen to contain a $91-opcode byte
        # somewhere (data files are full of arbitrary bytes).
        cok = mon.zp_indirect_store_census("cok")
        dok = mon.zp_indirect_store_census("dok")
        cok_files = {name for name, _zp in cok}
        dok_files = {name for name, _zp in dok}
        self.assertTrue(cok_files.issubset(mon._OPERATION_CENSUS_FILES["cok"]))
        self.assertTrue(dok_files.issubset(mon._OPERATION_CENSUS_FILES["dok"]))
        self.assertNotIn("MON01", cok_files)
        self.assertNotIn("MON00", dok_files)


@skip_no_c64
class PrintStringRoutineCallerTests(unittest.TestCase):
    """Pins `print_string_routine_callers()` -- the real (opcode-exact JSR/JMP) caller
    census for the newly-found generic string-copy primitive (CoK DUNGEON $1802 / DoK
    DUNGEON $1601), and the disassembly-quoted facts around its two resolvable-vs-
    unresolvable call sites.

    Proof this class can fail (real, not staged): the first version of
    test_dok_compreps_two_call_sites_share_the_jsr_0ed7_predecessor below sliced
    `body[714:719]` (a 2-byte-too-early window) and failed for real --
    `AssertionError: b'\\x14\\x15 \\xd7\\x0e' != b' \\xd7\\x0e \\x01'` -- before the slice
    was corrected to the true `JSR $0ED7 ; JSR $1601` window (`body[716:722]`) quoted here.
    """

    def test_cok_single_caller_is_an_intra_dungeon_jmp_with_literal_7a00_source(self):
        callers = mon.print_string_routine_callers("cok")
        self.assertEqual(callers, {"DUNGEON": [4427]})
        body = kernel.all_bodies("cok")["DUNGEON"]
        # LDA #$00 ; LDX #$7A ; JMP $1802  (source pointer = literal $7A00)
        self.assertEqual(body[4423:4430], bytes([0xA9, 0x00, 0xA2, 0x7A, 0x4C, 0x02, 0x18]))

    def test_dok_has_three_callers_across_two_files(self):
        callers = mon.print_string_routine_callers("dok")
        self.assertEqual(
            {name: sorted(offs) for name, offs in callers.items()},
            {"DUNGEON": [3914], "COMPREP": [719, 3914]},
        )

    def test_dok_compreps_two_call_sites_share_the_jsr_0ed7_predecessor(self):
        # Both DoK COMPREP call sites are `JSR $0ED7 ; JSR $1601` back to back -- the
        # source pointer this round could NOT resolve statically (see the doc section 14
        # for exactly why: $0ED7's own RTS-time A/X depends on which internal branch of a
        # ~64-iteration loop was last taken).
        body = kernel.all_bodies("dok")["COMPREP"]
        expect = bytes([0x20, 0xD7, 0x0E]) + bytes([0x20, 0x01, 0x16])  # JSR $0ED7; JSR $1601
        self.assertEqual(body[716:722], expect)
        self.assertEqual(body[3911:3917], expect)

    def test_callers_are_restricted_to_established_code_files(self):
        # PIC64/SPRITE0C (cok) and ECL21/PIC18/PIC72 (dok) all contain a byte-match for
        # this target address (confirmed false positives, see the doc), but none of them
        # is on _CODE_FILES, so none may appear here.
        cok = mon.print_string_routine_callers("cok")
        dok = mon.print_string_routine_callers("dok")
        for name in ("PIC64", "SPRITE0C"):
            self.assertNotIn(name, cok)
        for name in ("ECL21", "PIC18", "PIC72"):
            self.assertNotIn(name, dok)


@skip_no_c64
class SourcePointerWriterCensusTests(unittest.TestCase):
    """Pins `source_pointer_writer_census()` (C1.6) -- the OPERATION census (STA/STX/STY
    zero-page, INC/DEC zero-page) for the print loop's own $07/$08 source pointer, across
    `_OPERATION_CENSUS_FILES`, both titles, all sides.

    Proof this test can fail (standing rule 6, both mutations run for real this round then
    reverted): narrowing `_ZP_STORE_OPCODES` from `{0x85, 0x86, 0x84}` to just `{0x85}`
    (dropping STX/STY) drops CoK's total from 72 to 64 and fails `test_totals_both_titles`
    (RED, confirmed). Emptying `_ZP_INCDEC_OPCODES` (dropping INC/DEC entirely) drops
    CoK's total from 72 to 59 and CoK's LIBRARY count from 22 to 18 -- LIBRARY loses its
    two INC/DEC pairs at the loop's own `INC $07`/`INC $08` tail plus the unrelated
    "skip to string end" utility at $3D43/$3CAE (section 14.7) -- and fails both
    `test_totals_both_titles` and `test_library_totals_include_the_loops_own_advance`
    (RED, confirmed).
    """

    def test_totals_both_titles(self):
        cok = mon.source_pointer_writer_census("cok")
        dok = mon.source_pointer_writer_census("dok")
        self.assertEqual(sum(len(v) for v in cok.values()), 72)
        self.assertEqual(sum(len(v) for v in dok.values()), 82)
        self.assertEqual(len(cok), 8)   # distinct files
        self.assertEqual(len(dok), 11)

    def test_per_file_breakdown(self):
        cok = mon.source_pointer_writer_census("cok")
        dok = mon.source_pointer_writer_census("dok")
        self.assertEqual(
            {name: len(hits) for name, hits in cok.items()},
            {"CAMP": 5, "COM.PREP": 4, "DUNGEON": 11, "GDRIVE00": 4, "GEN": 12,
             "INIT": 6, "LIBRARY": 22, "POST.COM": 8},
        )
        self.assertEqual(
            {name: len(hits) for name, hits in dok.items()},
            {"CAMP": 5, "CODE00": 9, "CODE03": 2, "COMPREP": 4, "DUNGEON": 7,
             "GDRIVE00": 4, "GDRIVE04": 2, "GEN": 11, "INIT": 7, "LIBRARY": 22,
             "POSTCOM": 9},
        )

    def test_library_totals_include_the_loops_own_advance(self):
        # LIBRARY's 22-hit total (both titles) includes the loop's own tail (INC $07 at
        # the offset _LOOP_SELF_ADVANCE_INC07 names, INC $08 four bytes later) -- this is
        # bookkeeping, not an external writer, and is checked explicitly so a reader does
        # not double-count it as a 23rd/24th distinct writer.
        for title in ("cok", "dok"):
            census = mon.source_pointer_writer_census(title)
            lib_offsets = {(off, mnem, zp) for off, mnem, zp in census["LIBRARY"]}
            lib_name, inc07_off = mon._LOOP_SELF_ADVANCE_INC07[title]
            self.assertEqual(lib_name, "LIBRARY")
            self.assertIn((inc07_off, "INC", 0x07), lib_offsets)
            self.assertIn((inc07_off + 4, "INC", 0x08), lib_offsets)

    def test_census_only_counts_established_code_files(self):
        cok = mon.source_pointer_writer_census("cok")
        dok = mon.source_pointer_writer_census("dok")
        self.assertTrue(set(cok).issubset(mon._OPERATION_CENSUS_FILES["cok"]))
        self.assertTrue(set(dok).issubset(mon._OPERATION_CENSUS_FILES["dok"]))
        self.assertNotIn("MON01", cok)
        self.assertNotIn("MON00", dok)

    def test_targets_only_07_and_08(self):
        # Every (offset, mnemonic, zp) triple's zp component must be 0x07 or 0x08 --
        # guards against a future edit widening _SOURCE_PTR_ZP silently.
        for title in ("cok", "dok"):
            census = mon.source_pointer_writer_census(title)
            for hits in census.values():
                for _off, _mnem, zp in hits:
                    self.assertIn(zp, (0x07, 0x08))


@skip_no_c64
class PrintLoopEntryCallerTests(unittest.TestCase):
    """Pins `print_loop_entry_callers()` (C1.6) -- the loop cluster's FOUR entry points
    and their real (opcode-exact JSR/JMP, established-code-only) callers.

    Proof this test can fail: restricting the opcode filter in
    `print_loop_entry_callers` from `(0x20, 0x4C)` to just `(0x20,)` (dropping the JMP
    case) empties CoK's `field_setter` and `row_post_entry` results (both are reached
    only via LIBRARY's own jump-table `JMP`, never a `JSR`) and fails
    `test_field_setter_and_row_post_entry_are_library_jump_table_only` (RED, confirmed
    this round, then reverted).
    """

    def test_loop_start_has_zero_callers_both_titles(self):
        # The exact address section 14.5 quotes -- reached only by fall-through from the
        # row-wrap comparison immediately before it, never by a direct JSR/JMP.
        for title in ("cok", "dok"):
            self.assertEqual(mon.print_loop_entry_callers(title, "loop_start"), {})

    def test_field_setter_and_row_post_entry_are_library_jump_table_only(self):
        # CoK: LIBRARY's own jump-table slot 6 (field_setter) and slot 5 (row_post_entry)
        # are the ONLY real references -- both JMP, both LIBRARY-internal.
        self.assertEqual(mon.print_loop_entry_callers("cok", "field_setter"), {"LIBRARY": [18]})
        self.assertEqual(mon.print_loop_entry_callers("cok", "row_post_entry"), {"LIBRARY": [15]})
        # DoK's jump table has only 3 slots and reaches neither -- zero real callers.
        self.assertEqual(mon.print_loop_entry_callers("dok", "field_setter"), {})
        self.assertEqual(mon.print_loop_entry_callers("dok", "row_post_entry"), {})

    def test_param_entry_is_the_clusters_real_front_door(self):
        # param_entry (LDY $08 -> bank-switch check -> falls into the row-wrap-then-print
        # sequence) is called from nearly every overlay in the corpus -- the enumerated
        # population behind section 14.5's "suspected general-purpose print" hedge.
        cok = mon.print_loop_entry_callers("cok", "param_entry")
        dok = mon.print_loop_entry_callers("dok", "param_entry")
        self.assertEqual(sum(len(v) for v in cok.values()), 22)
        self.assertEqual(sum(len(v) for v in dok.values()), 26)
        for name in ("CAMP", "DUNGEON", "GEN", "INIT", "LIBRARY"):
            self.assertIn(name, cok)
            self.assertIn(name, dok)

    def test_addresses_match_the_documented_disassembly(self):
        self.assertEqual(mon.PRINT_LOOP_ENTRIES["cok"],
                          {"field_setter": 0x2EA5, "param_entry": 0x2EAB,
                           "row_post_entry": 0x2ECF, "loop_start": 0x2ECC,
                           "global_ptr_entry": 0x41E3})
        self.assertEqual(mon.PRINT_LOOP_ENTRIES["dok"],
                          {"field_setter": 0x2E54, "param_entry": 0x2E5A,
                           "row_post_entry": 0x2E7E, "loop_start": 0x2E7B,
                           "global_ptr_entry": 0x4141})

    def test_global_ptr_entry_is_a_second_real_front_door(self):
        # $41E3 (cok) / $4141 (dok): STA $7FFE; STX $7FFF; ...; LDA $7FFE; STA $07;
        # LDA $7FFF; STA $08; JSR param_entry -- a second entry point independent of
        # param_entry's own 27-ish caller population, with its own 10 (cok) / 9 (dok)
        # established-code callers (see the doc for all of them individually resolved).
        cok = mon.print_loop_entry_callers("cok", "global_ptr_entry")
        dok = mon.print_loop_entry_callers("dok", "global_ptr_entry")
        self.assertEqual(sum(len(v) for v in cok.values()), 10)
        self.assertEqual(sum(len(v) for v in dok.values()), 9)
        for name in ("CAMP", "DUNGEON", "GEN"):
            self.assertIn(name, cok)
            self.assertIn(name, dok)


@skip_no_c64
class Library4cSiteTests(unittest.TestCase):
    """Pins `LIBRARY_STA_4C_SITES` / `check_library_4c_sites()` (C1.6) -- the seven-
    per-title `STA ($4C),Y` sites section 14.2's correction flagged as open and un-walked.

    Proof this test can fail: corrupting one address in `LIBRARY_STA_4C_SITES["cok"]`
    (e.g. `0x2E4F` -> `0x2E50`, one byte off the real opcode) makes
    `check_library_4c_sites` return `False` for that key and fails
    `test_all_sites_are_real_sta_4c_indirect_y` (RED, confirmed this round on a scratch
    copy, then discarded -- the shipped constants are unmodified).
    """

    def test_seven_sites_per_title(self):
        self.assertEqual(len(mon.LIBRARY_STA_4C_SITES["cok"]), 7)
        self.assertEqual(len(mon.LIBRARY_STA_4C_SITES["dok"]), 7)

    def test_all_sites_are_real_sta_4c_indirect_y(self):
        for title in ("cok", "dok"):
            verified = mon.check_library_4c_sites(title)
            self.assertEqual(len(verified), 7)
            for addr, ok in verified.items():
                self.assertTrue(ok, f"{title}: ${addr:04X} does not decode as STA ($4C),Y")

    def test_none_of_the_seven_sites_reads_through_07_08(self):
        # Cross-check against source_pointer_writer_census: none of the 14 addresses (as
        # LIBRARY body offsets) appear in that census -- these sites use five OTHER
        # source mechanisms (see the doc), never the $07/$08 pointer pair.
        for title in ("cok", "dok"):
            body = kernel.kernel_body(title)
            org = kernel.KERNEL_ORIGIN
            sw_offsets = {off for off, _mnem, _zp in mon.source_pointer_writer_census(title)["LIBRARY"]}
            for addr in mon.LIBRARY_STA_4C_SITES[title]:
                self.assertNotIn(addr - org, sw_offsets)

    def test_documented_addresses_match_task_brief(self):
        # The exact addresses named in the round-7 correction box / this round's brief.
        self.assertEqual(
            sorted(mon.LIBRARY_STA_4C_SITES["cok"]),
            [0x2E4F, 0x2F89, 0x2FC9, 0x30E2, 0x337B, 0x4177, 0x4182],
        )
        self.assertEqual(
            sorted(mon.LIBRARY_STA_4C_SITES["dok"]),
            [0x2DF8, 0x2F3D, 0x2F72, 0x309B, 0x3343, 0x40B8, 0x40C3],
        )


class MonPageImmediateSweepTests(unittest.TestCase):
    """Pins `mon_page_immediate_sweep()` -- section 14.7.3's corpus-wide "does anyone
    literally load `#$40` near a `$08` write" check.

    ADDED 2026-08-13. Section 14.7.4 calls this sweep "the strongest and most direct
    evidence this investigation has produced", but until now it existed only as prose: no
    function in `c64_mon.py`, no test anywhere. The single most load-bearing claim in the
    section was the one thing that could not be re-run from the owned files.
    """

    def test_the_documented_8_byte_window_is_empty_in_both_titles(self):
        # The exact check section 14.7.3 describes, and its exact result.
        for title in ("cok", "dok"):
            self.assertEqual(mon.mon_page_immediate_sweep(title, 8), {})

    def test_every_pinned_window_matches_including_the_non_empty_ones(self):
        # The robustness check the prose never ran. 8/16 are empty in both titles; 32 (DoK)
        # and 64 (CoK) each surface exactly one LIBRARY site. Pinning the NON-empty widths
        # matters as much as the empty ones: it stops a future change from quietly widening
        # the window into a false negative, and it keeps the excluded hits on the record
        # instead of tuning them away.
        for (title, window), expected in mon.MON_PAGE_SWEEP_EXPECTED.items():
            self.assertEqual(mon.mon_page_immediate_sweep(title, window), expected,
                             f"{title} window={window}")

    def test_the_two_wide_window_hits_are_not_genuine_sources(self):
        # Byte-level proof of the exclusion argued in the function's docstring, so the
        # exclusion is checked rather than merely asserted in prose. At each hit:
        #   * the LDX #$40 is immediately followed by LDY #$0D then a JSR, which consumes
        #     the X/Y pair as that subroutine's own parameters; and
        #   * the STA $07 / STX $08 is preceded by a JMP (opcode 0x4C), so it is the jump
        #     TARGET's body, not a fall-through continuation of the LDX site.
        for title, store, load in (("cok", 5444, 5406), ("dok", 5269, 5239)):
            body = kernel.all_bodies(title)["LIBRARY"]
            self.assertEqual(list(body[load:load + 6:2]), [0xA2, 0xA0, 0x20],
                             f"{title}: expected LDX #imm / LDY #imm / JSR")
            self.assertEqual(body[load + 1], mon.MON_PAGE_HIGH_BYTE)
            # STA $07 at store-2, STX $08 at store; the three bytes before them are a JMP.
            self.assertEqual(list(body[store - 2:store + 2]), [0x85, 0x07, 0x86, 0x08])
            self.assertEqual(body[store - 5], 0x4C, f"{title}: expected a JMP before the store")

    def test_the_sweep_can_only_ever_hit_high_byte_stores(self):
        # Guards the sweep's own scope: it must ignore $07 (the LOW byte, which cannot
        # select a page) and the INC/DEC self-advance sites. Counts the eligible population
        # so a future census change that silently shrank it is visible.
        for title, expected in (("cok", 29), ("dok", 33)):
            census = mon.source_pointer_writer_census(title)
            eligible = [(off, mnem, zp) for hits in census.values() for off, mnem, zp in hits
                        if zp == 0x08 and mnem in ("STA", "STX", "STY")]
            self.assertEqual(len(eligible), expected)
            total = sum(len(v) for v in census.values())
            self.assertEqual(total, 72 if title == "cok" else 82)


@skip_no_c64
class ResolveSourcePointerTests(unittest.TestCase):
    """Pins the 2026-08-13 round-#3 mechanical resolver (`resolve_source_pointer` and
    friends) -- the port of `c64_sprite`'s decode-aligned + bounded-backward-walk method
    (c64-sprite-format.md section 12.3) to the `$07`/`$08` question, which turns section
    14.7's 68-of-154 hand walk into a complete classification. See
    docs/engine/research/c64-mon-format.md section 14.8.

    Every assertion here was mutation-tested for real (standing rule 6); the mutations and
    their measured RED results are listed in section 14.8's tooling paragraph.
    """

    def test_every_census_site_gets_a_classification(self):
        # Rule 6: assert the loop actually ran. The resolver must return exactly as many
        # rows as the census has sites -- no silent drops, no silent duplicates.
        for title, expected in (("cok", 72), ("dok", 82)):
            sites = mon.resolve_source_pointer(title)
            self.assertEqual(len(sites), expected, title)
            census = mon.source_pointer_writer_census(title)
            self.assertEqual({(s.file, s.offset) for s in sites},
                             {(name, off) for name, hits in census.items()
                              for off, _m, _z in hits})
            for s in sites:
                self.assertIn(s.kind, mon.SOURCE_KINDS, f"{title} {s.file}+{s.offset}")

    def test_site_addresses_use_each_files_established_origin(self):
        # `file_origin` is not decoration: LIBRARY sits at $2DC8, the GDRIVE family at
        # $C000, DoK's CODEnn at $8000, ordinary overlays at $0800. A site's reported
        # ADDRESS is what every disassembly citation in the doc is quoted against.
        addr = {(t, s.file, s.offset): s.address
                for t in ("cok", "dok") for s in mon.resolve_source_pointer(t)}
        self.assertEqual(addr[("cok", "LIBRARY", 306)], 0x2EFA)     # org $2DC8
        self.assertEqual(addr[("dok", "LIBRARY", 225)], 0x2EA9)
        self.assertEqual(addr[("cok", "GDRIVE00", 924)], 0xC39C)    # org $C000
        self.assertEqual(addr[("dok", "GDRIVE04", 1428)], 0xC594)
        self.assertEqual(addr[("dok", "CODE00", 898)], 0x8382)      # org $8000
        self.assertEqual(addr[("dok", "CODE03", 3728)], 0x8E90)
        self.assertEqual(addr[("cok", "POST.COM", 7588)], 0x25A4)   # org $0800
        self.assertEqual(mon.file_origin("LIBRARY"), kernel.KERNEL_ORIGIN)
        self.assertEqual(mon.file_origin("DUNGEON"), 0x0800)

    def test_kind_histogram_both_titles(self):
        # The headline classification, pinned exactly so any drift is visible.
        self.assertEqual(
            _kinds("cok"),
            {"caller_register": 8, "computed": 5, "global": 4, "increment": 10,
             "literal": 12, "self_advance": 2, "table": 28, "unaligned": 2, "zeropage": 1})
        self.assertEqual(
            _kinds("dok"),
            {"caller_register": 8, "computed": 5, "global": 4, "increment": 10,
             "literal": 14, "self_advance": 2, "table": 34, "unaligned": 3,
             "unresolved": 1, "zeropage": 1})

    def test_resolved_versus_merely_classified_is_pinned_separately(self):
        """ADDED 2026-08-13. "All 154 classified" and "154 resolved" are different claims, and
        only the second is comparable to section 14.7's "68 of 154 = 44% hand-walked". The kind
        histogram above already contains this split, but nothing asserted it as a headline, so a
        reader (or a later summary) could compare 44% against "all 154" and over-read the gain.

        Resolved = the kind names an address or a concrete mechanism. The rest are honest
        non-answers: `caller_register` (the walk crossed a flow terminator), `computed`,
        `unaligned` (a byte alias, not an instruction at all) and `unresolved`. Pinning both
        halves means a future change that reclassified non-answers INTO the resolved bucket --
        the easy way to make this number look better -- has to move a pinned count to do it.
        """
        resolved_kinds = {"literal", "table", "global", "zeropage", "self_advance", "increment"}
        pooled = {}
        for title in ("cok", "dok"):
            for kind, n in _kinds(title).items():
                pooled[kind] = pooled.get(kind, 0) + n
        self.assertEqual(sum(pooled.values()), 154)
        resolved = sum(n for k, n in pooled.items() if k in resolved_kinds)
        unresolved = {k: n for k, n in pooled.items() if k not in resolved_kinds}
        self.assertEqual(resolved, 122)
        self.assertEqual(unresolved,
                         {"caller_register": 16, "computed": 10, "unaligned": 5, "unresolved": 1})
        self.assertEqual(sum(unresolved.values()), 32)
        # 44% -> 79%, not 44% -> 100%.
        self.assertAlmostEqual(resolved / 154, 0.792, places=3)

    def test_reproduces_all_44_handwalked_library_classifications(self):
        # The cross-check the task requires BEFORE any new classification is trusted:
        # section 14.7.3's 22-per-title hand walk, reproduced mechanically, site by site.
        for idx, title in ((0, "cok"), (1, "dok")):
            sites = {(s.file, s.offset): s.kind for s in mon.resolve_source_pointer(title)}
            checked = 0
            for row in mon.HANDWALKED_LIBRARY_SITES:
                off, expected = row[idx], row[2]
                self.assertEqual(sites[("LIBRARY", off)], expected,
                                 f"{title} LIBRARY+{off}")
                checked += 1
            self.assertEqual(checked, 22, title)

    def test_reproduces_the_handwalked_literal_pointer_addresses(self):
        for title in ("cok", "dok"):
            got = {(f, lo): addr for f, lo, _hi, addr in mon.resolved_pointer_addresses(title)}
            self.assertEqual(got, mon.HANDWALKED_LITERAL_POINTERS[title], title)
            self.assertTrue(got)

    def test_reproduces_the_handwalked_global_ptr_entry_caller_pointers(self):
        # Section 14.7.3 hand-resolved 19 `global_ptr_entry` callers; the same backward walk
        # reproduces every literal one of them, and additionally resolves CoK LIBRARY+5903,
        # which the doc left at "not traced further".
        for title, n_callers in (("cok", 10), ("dok", 9)):
            self.assertEqual(len(mon.entry_caller_sources(title)), n_callers, title)
            got = {(f, o): a for f, o, a in mon.entry_caller_pointers(title)}
            self.assertEqual(got, mon.HANDWALKED_ENTRY_CALLER_POINTERS[title], title)
            for addr in got.values():
                self.assertFalse(mon._MON_WINDOW[0] <= addr < mon._MON_WINDOW[1])

    def test_the_backward_walk_depth_is_not_a_binding_window_edge(self):
        # Standing rule 1: the depth IS an analysis-window edge, so report the counts
        # OUTSIDE both edges. 11/12/13 are identical in both titles, and the plateau starts
        # at depth 7 -- pinned so a future change that made the headline depth-sensitive
        # goes red instead of quietly reporting one edge's number.
        for title in ("cok", "dok"):
            sens = mon.source_pointer_depth_sensitivity(title, (11, 12, 13))
            self.assertEqual(sens[11], sens[12], title)
            self.assertEqual(sens[13], sens[12], title)
            wide = mon.source_pointer_depth_sensitivity(title, (6, 7, 20))
            self.assertEqual(wide[7], wide[20], f"{title}: plateau should start at depth 7")
            self.assertNotEqual(wide[6], wide[7], f"{title}: depth 6 must still differ")

    def test_no_resolved_source_reaches_the_mon_window_except_the_self_reference(self):
        # THE CLAIM. Three of the four refutation shapes are empty in both titles; the
        # fourth is DoK's single chased-global hit, and it is proven self-referential.
        cok = mon.mon_window_hits("cok")
        self.assertEqual(cok, {"literal_pointers": [], "page_immediate": [],
                               "chased_globals": [], "table_or_global": []})
        dok = mon.mon_window_hits("dok")
        self.assertEqual(dok["literal_pointers"], [])
        self.assertEqual(dok["page_immediate"], [])
        self.assertEqual(dok["table_or_global"], [])
        self.assertEqual(dok["chased_globals"],
                         [("LIBRARY", 5008, 5013, 0x4129, "self_reference")])

    def test_the_dok_4129_hit_is_librarys_own_trade_to_prompt(self):
        # ... and the self-reference is a real, readable string, not an inference.
        body = kernel.kernel_body("dok")
        off = 0x4129 - kernel.KERNEL_ORIGIN
        self.assertEqual(off, 4961)  # the doc's section 14.7.3 printed 865 -- wrong subtraction
        self.assertEqual(bytes(body[off:off + 11]), b"TRADE TO ?\x00")
        # CoK's LIBRARY has no such string at the same offset (no analog, as the doc says).
        self.assertNotEqual(bytes(kernel.kernel_body("cok")[off:off + 11]), b"TRADE TO ?\x00")

    def test_chased_globals_reproduce_the_cross_title_asymmetry(self):
        cok = {c["file"]: c for c in mon.chased_global_pointers("cok")}
        dok = {c["file"]: c for c in mon.chased_global_pointers("dok")}
        self.assertFalse(cok["LIBRARY"]["closed"])   # A/X come from global_ptr_entry's callers
        self.assertTrue(dok["LIBRARY"]["closed"])    # DoK hardcodes one $7FFE/$7FFF pair
        self.assertEqual(dok["LIBRARY"]["addresses"], [0x4129])
        self.assertEqual(dok["LIBRARY"]["self_reference"], [0x4129])

    def test_six_census_sites_are_byte_aliases_not_instructions(self):
        # A new correction to the census the whole section is built on: 6 of the 154 raw
        # opcode-byte hits are somebody else's operand byte. Mechanically re-derived, and
        # cross-checked against the hand-verified list.
        for title in ("cok", "dok"):
            expected = sorted((f, o) for o, f in mon.CENSUS_BYTE_ALIAS_SITES[title].items())
            self.assertEqual(mon.census_alias_sites(title), expected, title)
            self.assertEqual(len(expected), 3, title)
            for (name, off), info in mon.check_census_byte_aliases(title).items():
                self.assertIsNotNone(info["covered_by"], f"{title} {name}+{off}")
                self.assertGreater(info["covered_by"][2], info["sync"])

    def test_the_alias_hosts_are_the_expected_operand_bytes(self):
        # Byte-exact: each alias is the low half of an absolute operand naming $0886/$08C6.
        expect = {("cok", "CAMP", 125): (124, "STA $0886"),
                  ("cok", "DUNGEON", 337): (336, "JSR $08C6"),
                  ("cok", "DUNGEON", 399): (398, "JSR $08C6"),
                  ("dok", "POSTCOM", 224): (223, "JMP $0886"),
                  ("dok", "CODE00", 3121): (3120, "STA $08C6"),
                  ("dok", "GEN", 457): (456, "STY $08C6")}
        seen = 0
        for title in ("cok", "dok"):
            for (name, off), info in mon.check_census_byte_aliases(title).items():
                host_off, host_text, _chain = info["covered_by"]
                self.assertEqual((host_off, host_text), expect[(title, name, off)])
                seen += 1
        self.assertEqual(seen, 6)

    def test_widening_the_allowlist_to_every_file_changes_nothing(self):
        # Standing rule 2, discharged by measurement rather than argument:
        # `_OPERATION_CENSUS_FILES` was inherited from `_CODE_FILES`, so run the identical
        # census over EVERY file on every side and check the answer is unchanged.
        for title, extra_sites, extra_files in (("cok", 38, 20), ("dok", 41, 28)):
            d = mon.unrestricted_census_delta(title)
            self.assertEqual(d["extra_sites"], extra_sites, title)
            self.assertEqual(len(d["extra_files"]), extra_files, title)
            self.assertEqual(d["mon_window"], [], title)
            self.assertGreater(len(d["aligned"]), 0, title)   # the loop really ran
            # Every excluded file carrying a hit is a documented data family, never code.
            families = ("ECL", "GEO", "MON", "PIC", "SPELL", "SPRITE", "TITLEPG", "WALLDEF")
            self.assertTrue(all(n.startswith(families) for n in d["extra_files"]),
                            sorted(d["extra_files"]))

    def test_the_two_arguably_code_exclusions_are_empty_not_merely_excluded(self):
        # "Checked and found empty" and "not checked" are different facts (standing rule 5).
        for title in ("cok", "dok"):
            everything = mon._census_over(title, {title: {"COMBAT2", "SECSET02", "SECSET10",
                                                          "SECSET64"}})
            self.assertEqual(everything, {}, title)

    def test_print_loop_advance_exists_once_in_every_c64_gold_box_title(self):
        # Standing rule 5: all SEVEN titles, not just the two this investigation owns.
        sweep = mon.print_loop_advance_sweep()
        self.assertEqual(len(sweep), 7)
        for title, hits in sweep.items():
            libs = [h for h in hits if h[1] == "LIBRARY"]
            self.assertEqual(len(libs), 1, f"{title}: {hits}")
        self.assertEqual(sorted((t, h[2]) for t, v in sweep.items() for h in v
                                if h[1] == "LIBRARY"),
                         [("buck", 275), ("coab", 306), ("cok", 306), ("dok", 225),
                          ("gate", 306), ("por", 298), ("ssb", 3611)])
        # Pool of Radiance's boot file carries a second copy; nothing else does.
        self.assertEqual([(t, h[1]) for t, v in sweep.items() for h in v
                          if h[1] != "LIBRARY"], [("por", "POOLRB")])

    def test_the_unresolvable_high_byte_sources_are_enumerated_not_hidden(self):
        # The honest gap: 6 per title, same shape in both. The claim is "every STATICALLY
        # RESOLVABLE source", and this is exactly the set that is not.
        self.assertEqual(
            mon.unresolved_high_byte_sources("cok"),
            [("DUNGEON", 7222, "table", 0x7F8B), ("GEN", 1091, "global", 0x9F9E),
             ("GEN", 4616, "table", 0x9718), ("LIBRARY", 1665, "table", 0x9F8C),
             ("LIBRARY", 3262, "table", 0x9F00), ("LIBRARY", 5181, "global", 0x7FFF)])
        self.assertEqual(
            mon.unresolved_high_byte_sources("dok"),
            [("CODE03", 3730, "table", 0xEB2C), ("GEN", 1099, "global", 0x9F9E),
             ("GEN", 5166, "table", 0x89DE), ("LIBRARY", 1566, "table", 0x9F8C),
             ("LIBRARY", 3119, "table", 0x9F00), ("LIBRARY", 5013, "global", 0x7FFF)])

    def test_every_readable_high_byte_table_is_free_of_the_mon_page_byte(self):
        # The complement of the gap above: the sources that ARE readable, read. 10 CoK /
        # 13 DoK high-byte table/global cells lie inside their owning file's body; none of
        # the 256 bytes from each base is $40. (`mon_window_hits`'s `table_or_global` key
        # is the same check; this counts the population so an empty result cannot come
        # from an empty loop.)
        for title, expected in (("cok", 10), ("dok", 13)):
            bodies = kernel.all_bodies(title)
            readable = 0
            for s in mon.resolve_source_pointer(title):
                if s.zp != 0x08 or s.kind not in ("table", "global") or s.source is None:
                    continue
                off = s.source - mon.file_origin(s.file)
                if not (0 <= off < len(bodies[s.file])):
                    continue
                readable += 1
                self.assertNotIn(mon.MON_PAGE_HIGH_BYTE,
                                 bodies[s.file][off:off + 256],
                                 f"{title} {s.file}+{s.offset} table ${s.source:04X}")
            self.assertEqual(readable, expected, title)

    def test_the_setter_tables_cover_every_register_writing_opcode(self):
        # Standing rule 4 at opcode scope: the tables are derived from c64_disasm.OPCODES,
        # so check they really contain every documented opcode that can change A/X/Y.
        import c64_disasm as c64d
        expected = {
            "A": {"LDA", "PLA", "TXA", "TYA", "ADC", "SBC", "AND", "ORA", "EOR"},
            "X": {"LDX", "TAX", "TSX", "INX", "DEX"},
            "Y": {"LDY", "TAY", "INY", "DEY"},
        }
        for reg, mnems in expected.items():
            got = {c64d.OPCODES[op][0] for op in mon._REG_SETTERS[reg]}
            self.assertTrue(mnems <= got, f"{reg}: missing {mnems - got}")
        # ASL/LSR/ROL/ROR in ACCUMULATOR mode modify A; the memory forms must NOT be listed.
        acc = {op for op, (m, mode) in c64d.OPCODES.items()
               if m in ("ASL", "LSR", "ROL", "ROR") and mode == c64d.ACC}
        self.assertTrue(acc <= set(mon._REG_SETTERS["A"]))
        mem = {op for op, (m, mode) in c64d.OPCODES.items()
               if m in ("ASL", "LSR", "ROL", "ROR") and mode != c64d.ACC}
        self.assertFalse(mem & set(mon._REG_SETTERS["A"]))


def _kinds(title: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for s in mon.resolve_source_pointer(title):
        counts[s.kind] = counts.get(s.kind, 0) + 1
    return dict(sorted(counts.items()))


if __name__ == "__main__":
    unittest.main()
