#!/usr/bin/env python3
"""Tests for tools/c64_kernel.py.

Two layers, same discipline as test_c64_disk.py / test_c64_wallset.py:

  1. SYNTHETIC tests of the search primitives (call_census, sweep_origin,
     self_consistency) -- always run, need nothing external, and are the ones that can be
     mutation-checked cheaply (see comments on each: what was broken, what went red, what
     was restored).
  2. REAL-CORPUS tests against Champions of Krynn / Death Knights of Krynn under
     D:/Games/Emulator/C64/Goldbox/ -- skip when that external, never-vendored source is
     absent. These pin this round's actual finding: LINKER's true runtime origin is $2D00
     and LIBRARY's kernel portion's true runtime origin is $2DC8, in BOTH titles, despite
     both files' on-disk PRG headers claiming the generic $4000 staging address.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_kernel as k  # noqa: E402

TITLES = ("cok", "dok")


def _skip_reason(title: str) -> str | None:
    try:
        k.side1_path(title)
    except k.SourceUnavailable as exc:
        return str(exc)
    return None


class CallCensusSyntheticTests(unittest.TestCase):
    def test_tallies_distinct_calling_files_not_call_count(self) -> None:
        # FILE_A calls $3000 twice; that must count as ONE file, not two hits.
        file_a = bytes([0x20, 0x00, 0x30, 0xEA, 0x20, 0x00, 0x30])
        file_b = bytes([0x20, 0x00, 0x30])
        file_c = bytes([0x20, 0x00, 0x30])
        bodies = {"FILE_A": file_a, "FILE_B": file_b, "FILE_C": file_c}
        census = k.call_census(bodies, lo=0x2000, hi=0x4000, fanin_min=1)
        self.assertEqual(census[0x3000], ["FILE_A", "FILE_B", "FILE_C"])

    def test_fanin_threshold_excludes_rarely_called_addresses(self) -> None:
        bodies = {"ONLY_CALLER": bytes([0x20, 0x00, 0x30])}
        self.assertNotIn(0x3000, k.call_census(bodies, fanin_min=2))
        self.assertIn(0x3000, k.call_census(bodies, fanin_min=1))

    def test_restricts_to_the_requested_address_band(self) -> None:
        # A JSR to $5000 must not appear when the band is [0x2000, 0x4000).
        bodies = {"F": bytes([0x20, 0x00, 0x50, 0x20, 0x00, 0x50])}
        census = k.call_census(bodies, lo=0x2000, hi=0x4000, fanin_min=1)
        self.assertEqual(census, {})

    def test_mutation_check_lo_hi_boundary(self) -> None:
        """Confirms the [lo, hi) band is exclusive at hi, inclusive at lo.

        Verified this can fail: temporarily changed the call site below from
        `hi=0x3001` to `hi=0x3000` (making the band exclude the target) -- the assertion
        that 0x3000 IS present went red as expected. Reverted to `hi=0x3001` before
        checking this file in.
        """
        bodies = {"F": bytes([0x20, 0x00, 0x30])}
        census = k.call_census(bodies, lo=0x3000, hi=0x3001, fanin_min=1)
        self.assertIn(0x3000, census)
        census2 = k.call_census(bodies, lo=0x3001, hi=0x3002, fanin_min=1)
        self.assertNotIn(0x3000, census2)


class SweepOriginSyntheticTests(unittest.TestCase):
    """A hand-built body with one real routine, planted at a deliberately NON-page-aligned
    offset, and padding that must not out-score it."""

    def _build(self) -> bytes:
        # 0x00-0x0C: junk (not a routine boundary: nothing here ends in an ender byte
        #            right before offset 0x0D, so it cannot masquerade as an entry).
        junk = bytes([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D])
        # offset 13: RTS (ender) -- offset 14 becomes a legitimate routine boundary.
        # offset 14: real routine entry -- LDA #$05 (A9 05), RTS (60)
        routine = bytes([0x60, 0xA9, 0x05, 0x60])
        # more padding after
        tail = bytes([0x11, 0x22, 0x33, 0x44, 0x55])
        return junk + routine + tail

    def test_finds_the_non_page_aligned_origin(self) -> None:
        body = self._build()
        self.assertEqual(body[13], 0x60, "fixture drifted: RTS expected at offset 13")
        entry_offset = 14
        # Pretend that entry point corresponds to runtime address $2E11 -- NOT a multiple
        # of $100, exercising exactly the generalisation this round required.
        target_addr = 0x2E11
        expected_org = target_addr - entry_offset
        self.assertNotEqual(expected_org % 0x100, 0, "test target must be off page boundary")
        result = k.sweep_origin(body, [target_addr], min_inside=1)
        self.assertIsNotNone(result)
        entryish, inside, org = result
        self.assertEqual(org, expected_org)
        self.assertEqual(inside, 1)
        self.assertEqual(entryish, 1)

    def test_mutation_check_ender_requirement(self) -> None:
        """Confirms sweep_origin only proposes origins backed by a real ender byte.

        Verified this can fail: temporarily changed the prefilter in sweep_origin from
        `body[i] in ENDERS` to `True` (propose every offset as a candidate origin) --
        the entryish score below spuriously matched at many more origins and the returned
        org for this all-zero body (which has no real routine anywhere) stopped being None.
        Reverted before checking this file in.
        """
        # An all-zero body has ZERO ender bytes (0x00 is BRK, not in ENDERS) so no origin
        # should ever be proposed for any target.
        body = bytes(64)
        result = k.sweep_origin(body, [0x2E00, 0x2E10], min_inside=1)
        self.assertIsNone(result)

    def test_returns_none_below_min_inside(self) -> None:
        body = self._build()
        result = k.sweep_origin(body, [0x2E11, 0x9999, 0x8888], min_inside=2)
        self.assertIsNone(result)  # only one of the three targets can ever land inside


class SelfConsistencyTests(unittest.TestCase):
    def test_counts_only_operands_landing_inside_the_claimed_range(self) -> None:
        # JMP $C005 (inside a 16-byte body at org $C000) then JMP $D000 (outside).
        body = bytes([0x4C, 0x05, 0xC0]) + bytes(10) + bytes([0x4C, 0x00, 0xD0])
        hits, total = k.self_consistency(body, 0xC000)
        self.assertEqual((hits, total), (1, 2))

    def test_mutation_check_wrong_origin_drops_the_hit_count(self) -> None:
        """A real resident file's self-jumps land inside its OWN range; an origin 0x1000
        away should not coincidentally still contain them. Directly exercises the
        page-aligned-sweep failure mode this round diagnosed: scoring a plausible-looking
        but wrong origin as if it were correct.

        Verified this can fail: temporarily hard-coded self_consistency's return to always
        report the *total* count as both hits and total (i.e. pretend every operand always
        lands in range) -- this test's assertion that the wrong-origin hit count is lower
        than the correct-origin count went red as expected. Reverted before checking in.
        """
        body = bytes([0x4C, 0x05, 0xC0]) + bytes(10) + bytes([0x4C, 0x00, 0xD0])
        correct_hits, _ = k.self_consistency(body, 0xC000)
        # $E000 is far from either embedded operand ($C005, $D000): a genuinely wrong
        # origin should explain none of this body's own jumps.
        wrong_hits, _ = k.self_consistency(body, 0xE000)
        self.assertEqual(wrong_hits, 0)
        self.assertLess(wrong_hits, correct_hits)


class LibraryJumpTableSyntheticTests(unittest.TestCase):
    def test_stops_at_the_first_non_jmp_byte(self) -> None:
        # Two JMP slots, then an unrelated instruction (LDA #$05) that must NOT be
        # misread as a third slot.
        body = bytes([0x4C, 0x00, 0x30, 0x4C, 0x05, 0x30, 0xA9, 0x05])
        slots = k.library_jump_table(body, org=0x2DC8)
        self.assertEqual(len(slots), 2)
        self.assertEqual(slots[0], (0, 0x2DC8, 0x3000))
        self.assertEqual(slots[1], (1, 0x2DCB, 0x3005))

    def test_mutation_check_scan_halts_on_wrong_opcode(self) -> None:
        """Confirms the scan really does stop at a non-$4C opcode rather than skipping over
        it. Verified this can fail: temporarily changed the loop condition from
        `body[i] == 0x4C` to `True` (never stop) -- the assertion that only 1 slot is found
        went red (it kept "finding" slots inside the trailing LDA/RTS bytes, decoding garbage
        operands). Reverted before checking in.
        """
        body = bytes([0x4C, 0x00, 0x30]) + bytes([0xEA, 0xEA, 0xEA])  # JMP $3000; NOP;NOP;NOP
        slots = k.library_jump_table(body, org=0x2DC8)
        self.assertEqual(len(slots), 1)

    def test_empty_when_body_does_not_open_with_jmp(self) -> None:
        body = bytes([0xA9, 0x00, 0x60])  # LDA #$00 ; RTS
        self.assertEqual(k.library_jump_table(body, org=0x2DC8), [])


class StopPrgDiffSyntheticTests(unittest.TestCase):
    def test_finds_only_the_address_operand_bytes(self) -> None:
        # Same 13-byte SEI/LDA/STA/LDA/STA/CLI/RTS template, target address differs.
        stop = bytes([0x78, 0xA9, 0x8D, 0x8D, 0x28, 0x03,
                       0xA9, 0x2D, 0x8D, 0x29, 0x03, 0x58, 0x60])
        library = bytes(0x100) + bytes([0x78, 0xA9, 0xCE, 0x8D, 0x28, 0x03,
                                          0xA9, 0x4A, 0x8D, 0x29, 0x03, 0x58, 0x60])
        target = 0x2DC8 + 0x100
        diffs = k.stop_prg_diff(stop, library, target, org=0x2DC8)
        self.assertEqual([off for off, _, _ in diffs], [2, 7])

    def test_mutation_check_detects_a_real_divergence(self) -> None:
        """Confirms the comparison is a genuine byte diff, not a length-only check.
        Verified this can fail: temporarily changed the comparator from `a != b` to `False`
        (report no diffs ever) -- the assertion below (diffs must be non-empty for two bodies
        that actually differ) went red as expected. Reverted before checking in.
        """
        stop = bytes([0x78, 0x60])
        library = bytes(0x10) + bytes([0x78, 0xEA])  # RTS replaced by NOP: a real divergence
        diffs = k.stop_prg_diff(stop, library, 0x2DC8 + 0x10, org=0x2DC8)
        self.assertTrue(diffs)
        self.assertEqual(diffs[0][0], 1)


class FindAbsWritesSyntheticTests(unittest.TestCase):
    def test_finds_sta_stx_sty_naming_the_target(self) -> None:
        # STA $7F11 ; STX $7F11 ; STY $7F11 ; and one unrelated store that must NOT match.
        body = bytes([0x8D, 0x11, 0x7F, 0x8E, 0x11, 0x7F, 0x8C, 0x11, 0x7F, 0x8D, 0x00, 0x30])
        hits = k.find_abs_writes({"F": body}, 0x7F11)
        self.assertEqual(hits["F"], [(0, "STA"), (3, "STX"), (6, "STY")])

    def test_files_with_no_write_are_absent_from_the_result(self) -> None:
        hits = k.find_abs_writes({"F": bytes([0xEA, 0xEA, 0xEA])}, 0x7F11)
        self.assertEqual(hits, {})

    def test_mutation_check_wrong_opcode_set_would_over_or_under_match(self) -> None:
        """Verified this can fail: temporarily added 0xAD (LDA abs, a READ not a write) to
        _STORE_OP -- a body containing only `LDA $7F11` then spuriously appeared as a "write"
        site. Reverted before checking in."""
        body = bytes([0xAD, 0x11, 0x7F])  # LDA $7F11 -- a read, not a write
        hits = k.find_abs_writes({"F": body}, 0x7F11)
        self.assertEqual(hits, {})


class ImmediateBeforeSyntheticTests(unittest.TestCase):
    def test_resolves_a_literal_load_immediately_before(self) -> None:
        body = bytes([0xA9, 0x05, 0x8D, 0x11, 0x7F])  # LDA #$05 ; STA $7F11
        self.assertEqual(k.immediate_before(body, 2), ("LDA", 0x05))

    def test_returns_none_when_preceding_bytes_are_not_an_immediate_load(self) -> None:
        body = bytes([0x01, 0x32, 0x8D, 0x11, 0x7F])  # ORA ($32,X) ; STA $7F11
        self.assertIsNone(k.immediate_before(body, 2))

    def test_returns_none_near_the_start_of_the_body(self) -> None:
        body = bytes([0x8D, 0x11, 0x7F])
        self.assertIsNone(k.immediate_before(body, 0))

    def test_mutation_check_distinguishes_ldx_from_lda(self) -> None:
        """Verified this can fail: temporarily hardcoded the returned mnemonic to always be
        "LDA" -- the LDX-specific assertion below went red. Reverted before checking in."""
        body = bytes([0xA2, 0x01, 0x8E, 0x11, 0x7F])  # LDX #$01 ; STX $7F11
        self.assertEqual(k.immediate_before(body, 2), ("LDX", 0x01))


class SelfConsistencyExcludingSyntheticTests(unittest.TestCase):
    def test_ignores_operands_inside_the_excluded_window(self) -> None:
        # A body claiming [$C000, $C203): JMP $C050 (inside the claimed range, but ALSO inside
        # the excluded window $C000-$C100 -- must be dropped from both hits and total) ;
        # JMP $C200 (inside the claimed range, outside the excluded window -- must count).
        body = bytes([0x4C, 0x50, 0xC0]) + bytes(0x200 - 3) + bytes([0x4C, 0x00, 0xC2])
        hits, total = k.self_consistency_excluding(body, 0xC000, (0xC000, 0xC100))
        self.assertEqual((hits, total), (1, 1))

    def test_mutation_check_exclusion_window_is_half_open(self) -> None:
        """Confirms [lo, hi) semantics. Verified this can fail: temporarily changed `addr < hi`
        to `addr <= hi` -- the boundary-inclusive assertion below went red (the target at
        exactly `hi` stopped being counted). Reverted before checking in."""
        # JMP $C100 -- exactly at the exclusion window's hi (so NOT excluded) -- placed so the
        # body's own claimed range [$C000, $C000+len) still contains $C100.
        body = bytes(0x100) + bytes([0x4C, 0x00, 0xC1])
        hits, total = k.self_consistency_excluding(body, 0xC000, (0xC000, 0xC100))
        self.assertEqual((hits, total), (1, 1))  # $C100 is NOT excluded (hi is exclusive)


class DispatchPaddingSlotNamesSyntheticTests(unittest.TestCase):
    def _build_cok_linker(self) -> bytes:
        # Minimal fixture: LINKER_ORIGIN-relative code stub (unused by the decoder) + the
        # concatenated 45-byte name blob + 3 parallel 10-byte tables (length, lo, hi).
        names = b"GENDUNGEONCOMBATINITCOM.PREPPOST.COMFINALCAMP"
        lens = bytes([3, 7, 6, 4, 8, 8, 8, 7, 5, 4])  # slots 6/7 alias slot 8's address
        # slot addresses, relative to LINKER_ORIGIN, matching the real corpus's own layout
        offsets = [0, 3, 10, 16, 20, 28, 36, 36, 36, 41]
        lo = bytes((k.LINKER_ORIGIN + o) & 0xFF for o in offsets)
        hi = bytes(((k.LINKER_ORIGIN + o) >> 8) & 0xFF for o in offsets)
        return names + lens + lo + hi

    def test_decodes_all_ten_slots_including_padding(self) -> None:
        body = self._build_cok_linker()
        orig = k.linker_body
        k.linker_body = lambda title: body  # type: ignore[assignment]
        try:
            slots = k.dispatch_padding_slot_names("cok")
        finally:
            k.linker_body = orig  # type: ignore[assignment]
        self.assertEqual(len(slots), 10)
        by_index = {i: name for i, _len, _addr, name in slots}
        self.assertEqual(by_index[8], b"FINAL")
        self.assertEqual(by_index[6], b"FINALCAM")  # padding: same address, wrong (longer) length
        self.assertEqual(by_index[7], b"FINALCA")
        self.assertEqual(by_index[9], b"CAMP")

    def test_mutation_check_slot_count_matters(self) -> None:
        """Verified this can fail: temporarily changed _DISPATCH_SLOT_COUNT from 10 to 8 --
        the padding-slot assertions above (which need slots 6/7) started raising IndexError /
        returning a 8-slot list with no index 6 or 7. Reverted before checking in."""
        body = self._build_cok_linker()
        orig = k.linker_body
        k.linker_body = lambda title: body  # type: ignore[assignment]
        try:
            slots = k.dispatch_padding_slot_names("cok")
        finally:
            k.linker_body = orig  # type: ignore[assignment]
        self.assertEqual(len(slots), 10)


class RealCorpusTests(unittest.TestCase):
    """Pins the actual finding against retail bytes. Skips per-title when the external,
    never-vendored D:\\...\\Goldbox corpus is absent."""

    def test_linker_true_origin_is_2D00_in_both_titles(self) -> None:
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                body = k.linker_body(title)
                # Every JMP-abs opcode in the whole body, filtered to operands landing
                # inside LINKER's own claimed range. CoK's LINKER also embeds an ASCII
                # filename table later in the file, which happens to contain byte pairs
                # that decode as JMP-abs opcodes too (a real false positive this round hit
                # and ruled out -- see the research doc) -- but their operand VALUES are
                # unrelated addresses ($4143, $5652) that do not land inside LINKER's ~150
                # byte range, so the containment filter alone separates signal from alias
                # without needing to guess where the code region ends.
                jmp_targets = [body[i + 1] | (body[i + 2] << 8)
                               for i in range(len(body) - 2) if body[i] == 0x4C]
                inside = [t for t in jmp_targets
                          if k.LINKER_ORIGIN <= t < k.LINKER_ORIGIN + len(body)]
                self.assertGreaterEqual(len(inside), 2,
                                         f"{title}: expected >=2 self-jumps, got {inside} "
                                         f"out of all JMP targets {[hex(t) for t in jmp_targets]}")
                # And this is NOT the file's own PRG header address -- the whole point.
                self.assertNotEqual(k.LINKER_ORIGIN, 0x4000)

    def test_library_sweep_ranks_the_kernel_origin_first(self) -> None:
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                bodies = k.read_bodies(k.load_side1(title))
                census = k.call_census(bodies)
                targets = sorted(census.keys())
                hosts = k.best_hosts(bodies, targets, top=5)
                self.assertTrue(hosts, "sweep produced no candidates")
                top_entryish, top_inside, top_org, top_name, _ = hosts[0]
                self.assertEqual(top_name, "LIBRARY")
                self.assertEqual(top_org, k.KERNEL_ORIGIN)
                # The margin over the runner-up is the actual evidence, not just rank 1.
                if len(hosts) > 1:
                    self.assertGreater(top_entryish, hosts[1][0])

    def test_name_scrub_entry_point_matches_between_titles(self) -> None:
        """The routine that motivated this whole hunt: MON's name-scrub pointer setup,
        called at $2E9A in CoK and $2E49 in DoK. Same code, same structure, offset by
        exactly the two files' internal layout delta (0x51 bytes)."""
        addrs = {"cok": 0x2E9A, "dok": 0x2E49}
        decoded = {}
        for title, addr in addrs.items():
            reason = _skip_reason(title)
            if reason:
                self.skipTest(reason)
            body = k.kernel_body(title)
            off = addr - k.KERNEL_ORIGIN
            self.assertIn(body[off - 1], k.ENDERS, f"{title}: ${addr:04X} not entry-aligned")
            decoded[title] = body[off:off + 8]
        # Both entries open with the identical opcode sequence:
        # LDA $03CD ; JSR <pointer-setup> -- byte-for-byte except the JSR operand itself.
        self.assertEqual(decoded["cok"][:3], bytes([0xAD, 0xCD, 0x03]))
        self.assertEqual(decoded["dok"][:3], bytes([0xAD, 0xCD, 0x03]))
        self.assertEqual(decoded["cok"][3], 0x20)  # JSR opcode
        self.assertEqual(decoded["dok"][3], 0x20)
        self.assertEqual(decoded["cok"][6:8], bytes([0x85, 0x4E]))  # STA $4E
        self.assertEqual(decoded["dok"][6:8], bytes([0x85, 0x4E]))
        self.assertEqual(addrs["cok"] - addrs["dok"], 0x51)


class LibraryInteriorTests(unittest.TestCase):
    """C1.9c: pins this round's findings about LIBRARY's interior. Skips per-title when the
    external, never-vendored D:\\...\\Goldbox corpus is absent."""

    def test_all_bodies_covers_every_side_not_just_side1(self) -> None:
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                side1 = k.read_bodies(k.load_side1(title))
                every_side = k.all_bodies(title)
                self.assertGreater(len(every_side), len(side1))
                # A concrete file known to live only on a later side (not side 1), computed
                # per-title rather than hard-coded -- CoK and DoK do not agree on which named
                # files ship on side 1 -- confirms the union is real, not just a re-read of
                # side 1 with a bigger count from some unrelated cause.
                only_later = set(every_side) - set(side1)
                self.assertTrue(only_later, f"{title}: no file found on a later side only")

    def test_library_jump_table_slot_counts(self) -> None:
        """CoK's LIBRARY opens with a 32-slot JMP table (96 bytes); DoK's is only 3 slots (9
        bytes) -- pinned here so a future re-extraction that silently changes either title's
        LIBRARY build is noticed."""
        expected = {"cok": 32, "dok": 3}
        for title, want in expected.items():
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                slots = k.library_jump_table(k.kernel_body(title))
                self.assertEqual(len(slots), want)

    def test_jump_table_slot0_is_the_basic_boot_sys_target(self) -> None:
        """Slot 0's own ADDRESS is always KERNEL_ORIGIN (it's the first 3 bytes of the file);
        this pins that its role is the BASIC boot stub's literal `SYS 11720` (=$2DC8) target
        from docs/engine/research/c64-boot-chain.md line 41 -- i.e. LIBRARY's boot-time
        "kernel init" IS this one jump, not a separate hidden routine before it."""
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                slots = k.library_jump_table(k.kernel_body(title))
                self.assertEqual(slots[0][1], k.KERNEL_ORIGIN)

    def test_overlay_trampoline_slot_targets_0803_in_both_titles(self) -> None:
        """The task brief's specific question: is the $2E10->JMP $0803 slot really the
        overlay-call trampoline? Confirmed here structurally in BOTH titles (CoK slot 24,
        DoK slot 1) -- $0803 is the established `JMP $0803`-inside-overlay entry point
        LINKER's own dispatch loop (`JSR $0800` then falls into $0803 on the next iteration)
        already uses, so this is a stable jump into "whatever is currently loaded in the
        $0800 overlay slot", not a bug or coincidence."""
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                slots = k.library_jump_table(k.kernel_body(title))
                targets = [t for _, _, t in slots]
                self.assertIn(0x0803, targets)

    def test_stop_prg_is_library_own_boot_init_duplicated(self) -> None:
        """STOP.PRG (CoK boot side only) is byte-identical to LIBRARY's own slot-0 target
        routine EXCEPT for the 2-byte STOP-key-vector address operand: STOP.PRG points at
        $2D8D (inside LINKER's tail), LIBRARY's own copy points at $4ACE (inside its own
        tail, right after slot 0's landing point). Both target routines are themselves the
        identical 3-instruction STKEY check (LDA $91; CMP #$7E; RTS). This is the strongest
        available answer to "who loads STOP.PRG": nothing found in this corpus loads it, and
        LIBRARY's own boot-time init already performs the identical job unconditionally, so
        STOP.PRG is a redundant duplicate of functionality LIBRARY re-implements inline."""
        reason = _skip_reason("cok")
        if reason:
            self.skipTest(reason)
        img = k.load_side1("cok")
        stop = k.get_file(img, "STOP")
        self.assertEqual(len(stop), 13)
        lib = k.kernel_body("cok")
        slot0_target = k.library_jump_table(lib)[0][2]
        diffs = k.stop_prg_diff(stop, lib, slot0_target)
        self.assertEqual([off for off, _, _ in diffs], [2, 7],
                          f"expected exactly the 2 address-operand bytes to differ, got {diffs}")
        # And the vector's OWN target (the last 2 bytes of the template) really does land on
        # a coherent, independently-decodable STKEY-check routine inside LIBRARY's own tail.
        vector_target = diffs[1][2] << 8 | (lib[slot0_target - k.KERNEL_ORIGIN + 2])
        off = vector_target - k.KERNEL_ORIGIN
        self.assertEqual(lib[off:off + 3], bytes([0xA5, 0x91, 0xC9]))  # LDA $91; CMP #...

    def test_secset64_self_consistency_is_far_weaker_than_library(self) -> None:
        """SECSET64 (present on every side of both titles, named like a resource file rather
        than a program) shows a handful of JSR-opcode-shaped byte triples whose operands
        coincidentally/plausibly land in LIBRARY's address range -- but its OWN internal
        JSR/JMP self-consistency (how many of ITS OWN abs JSR/JMP operands land inside its
        own body, at the best candidate origins) is far too weak to support "this is resident
        code that calls into LIBRARY". No reader for SECSET64 was found anywhere in LIBRARY's
        now-readable interior or in any corpus file's embedded name strings (checked via a
        full ASCII-name sweep, kept in the research doc, not re-run here since a byte search
        is not this module's concern) -- pinned here as the quantitative half of that
        negative result, at LIBRARY's own real origin plus the file's own nominal $4000
        header, so a future round that finds a real reader will see this test's assumption
        (echo of the current 2026-08-12 measurement) go stale and get flagged for review."""
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                bodies = k.all_bodies(title)
                if "SECSET64" not in bodies:
                    self.skipTest(f"{title}: no SECSET64")
                secset = bodies["SECSET64"]
                lib_hits, lib_total = k.self_consistency(k.kernel_body(title), k.KERNEL_ORIGIN)
                lib_ratio = lib_hits / lib_total
                for org in (0x4000, k.KERNEL_ORIGIN):
                    hits, total = k.self_consistency(secset, org)
                    ratio = hits / total if total else 0.0
                    self.assertLess(ratio, lib_ratio / 2,
                                     f"{title}: SECSET64 self-consistency at ${org:04X} "
                                     f"({hits}/{total}={ratio:.2%}) is not clearly weaker than "
                                     f"LIBRARY's own ({lib_hits}/{lib_total}={lib_ratio:.2%})")

    def test_dok_code_overlays_first_pass_self_consistency_at_0800(self) -> None:
        """First-pass identification of DoK's CODE00/CODE01/CODE03 (previously
        uninvestigated): CODE01 and CODE03 show real, if modest, self-consistency at the
        established $0800 overlay-slot origin (their own internal JSR/JMP operands land
        inside their own body noticeably more often than chance), consistent with them being
        further $0800-slot overlay content. CODE00 does NOT -- its self-consistency at $0800
        is close to zero, so (unlike CODE01/CODE03) it most likely runs somewhere else; this
        round did not determine where. All three show heavy LIBRARY call fan-in in the
        cross-side census (see docs), matching ordinary overlay behaviour regardless of where
        they actually execute from."""
        reason = _skip_reason("dok")
        if reason:
            self.skipTest(reason)
        bodies = k.all_bodies("dok")
        gen_hits, gen_total = k.self_consistency(bodies["GEN"], 0x0800)
        gen_ratio = gen_hits / gen_total  # an established, definitely-resident-at-$0800 file
        for name in ("CODE01", "CODE03"):
            hits, total = k.self_consistency(bodies[name], 0x0800)
            ratio = hits / total
            self.assertGreater(ratio, 0.0, f"{name}: expected some self-consistency at $0800")
            self.assertLess(ratio, gen_ratio, f"{name}: unexpectedly as strong as GEN itself")
        code00_hits, code00_total = k.self_consistency(bodies["CODE00"], 0x0800)
        self.assertLess(code00_hits / code00_total, 0.01,
                         "CODE00: expected near-zero self-consistency at $0800 (i.e. it "
                         "probably does NOT run there) -- if this now passes with a higher "
                         "ratio, CODE00's residency question may be resolved and this test's "
                         "framing should be revisited")


class LooseEndsTests(unittest.TestCase):
    """C1.9d: pins this round's closure of the four named loose ends. Skips per-title when
    the external, never-vendored D:\\...\\Goldbox corpus is absent."""

    def test_final_is_dispatch_index_8_not_6_and_padding_slots_are_garbled(self) -> None:
        """Both docs (this one and c64-boot-chain.md) previously stated FINAL sits at
        dispatch-table index 6. The table itself (already correctly listed in
        c64-boot-chain.md's own worked table) says index 8; index 6 and 7 are PADDING slots
        that alias FINAL's own address with the wrong length, decoding to garbage
        ("FINALCAM"/"FINALCA" in CoK) rather than any real file or overlay name -- this test
        pins the corrected index and the padding content in both titles."""
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                slots = k.dispatch_padding_slot_names(title)
                self.assertEqual(len(slots), 10)
                by_index = {i: (length, name) for i, length, _addr, name in slots}
                self.assertEqual(by_index[8][0], 5)
                self.assertEqual(by_index[8][1], b"FINAL")
                # Padding slots share FINAL's ADDRESS (that's what makes them padding) but
                # neither decodes to "FINAL" or to any real overlay name.
                self.assertEqual(slots[6][2], slots[8][2])  # same address as the real slot
                self.assertEqual(slots[7][2], slots[8][2])
                self.assertNotEqual(by_index[6][1], b"FINAL")
                self.assertNotEqual(by_index[7][1], b"FINAL")
                real_names = {by_index[i][1] for i in (0, 1, 2, 3, 4, 5, 9)}
                self.assertNotIn(by_index[6][1], real_names)
                self.assertNotIn(by_index[7][1], real_names)

    def test_7f11_write_sites_never_resolve_to_a_padding_or_final_index_literally(self) -> None:
        """A corpus-wide (all sides, both titles) census of every STA/STX/STY $7F11 -- the
        global LINKER polls to pick the next dispatch-table index -- finds every LITERAL
        (immediate-load-then-store) write site assigns one of the real overlay indices
        (0-5, 9; index 8/FINAL and the two padding slots 6/7 are never observed as a literal
        write anywhere in either title's corpus). A handful of sites resolve to a COMPUTED
        value (loop/table-driven, not a plain immediate) and are correctly left unclassified
        here rather than force-resolved -- see the research doc's honest accounting of those.
        """
        ALLOWED_LITERAL = {0, 1, 2, 3, 4, 5, 9}  # real table indices; 6,7 padding, 8 FINAL
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                bodies = k.all_bodies(title)
                sites = k.find_abs_writes(bodies, 0x7F11)
                self.assertGreaterEqual(sum(len(v) for v in sites.values()), 8,
                                         f"{title}: suspiciously few $7F11 write sites found")
                literal_values = []
                for name, hits in sites.items():
                    for off, _mnem in hits:
                        imm = k.immediate_before(bodies[name], off)
                        if imm is not None:
                            literal_values.append(imm[1])
                self.assertTrue(literal_values, f"{title}: no literal write resolved at all")
                for v in literal_values:
                    self.assertNotEqual(v, 6, f"{title}: a literal write set $7F11 to padding index 6")
                    self.assertNotEqual(v, 7, f"{title}: a literal write set $7F11 to padding index 7")
                    self.assertNotEqual(v, 8, f"{title}: a literal write set $7F11 to FINAL (index 8)")
                    self.assertIn(v, ALLOWED_LITERAL,
                                  f"{title}: literal $7F11 write value {v} outside the known "
                                  f"real-index set {ALLOWED_LITERAL}")

    def test_fastl_o_contains_no_secset_reference_or_per_file_table(self) -> None:
        """SECSET02/SECSET10/SECSET64 refined-negative (C1.9c section 9.6) suggested FASTL.O
        -- the drive-side fastloader -- as a plausible next place to look for a reader, since
        it's the one piece of this corpus that talks raw sectors. Disassembling the whole
        429-byte body (both titles, byte-identical) finds no ASCII "SECSET" anywhere and no
        embedded filename/address table of any kind -- it's a generic serial-bus bit-banger
        with all its parameters as immediate operands, confirming the existing doc's read that
        "the title- and file-specific target addresses must be supplied by whatever calls into
        this uploader" rather than by FASTL.O itself. A clean, specific negative, not a vague
        restatement of the existing one."""
        for title in TITLES:
            reason = _skip_reason(title)
            with self.subTest(title=title):
                if reason:
                    self.skipTest(reason)
                bodies = k.all_bodies(title)
                fastl = bodies.get("FASTL.O")
                if fastl is None:
                    self.skipTest(f"{title}: no FASTL.O")
                self.assertNotIn(b"SECSET", fastl)
                # No absolute STA/STX/STY naming any of the three SECSET files' own claimed
                # $4000 header address either (the one address a per-file table entry would
                # plausibly reference regardless of which SECSET file it points at).
                self.assertEqual(k.find_abs_writes({"FASTL.O": fastl}, 0x4000), {})

    def test_code03_residence_is_dollar8000_far_more_than_0800_or_c000(self) -> None:
        """DoK CODE03 (already known to make 5 genuine JSR calls into GDRIVE00's
        discriminating $C04B-$C066 tail -- confirmed separately, not re-tested here) shows a
        self-consistency signal at $8000 (49.6% raw / 65.2% with LIBRARY's own span excluded)
        that clearly beats both the naive $0800 overlay-slot guess (8.0%/10.5%) and the $C000
        graphics-driver slot (5.6%/7.3%) -- and, with LIBRARY's confounding span excluded,
        approaches the ~37-83% range established for genuinely resident code elsewhere in this
        corpus. A separate cross-file JSR-target sweep (fan-in >= 2, LIBRARY-range targets
        excluded) independently picks $8000 as the UNIQUE best-scoring origin (entryish=16 vs
        the runner-up's 12) -- two different techniques converging on the same address. This
        promotes CODE03 from "first-pass, unresolved" to "real residence found: $8000"."""
        reason = _skip_reason("dok")
        if reason:
            self.skipTest(reason)
        bodies = k.all_bodies("dok")
        body = bodies["CODE03"]
        lib = bodies["LIBRARY"]
        lib_range = (k.KERNEL_ORIGIN, k.KERNEL_ORIGIN + len(lib))
        h8000, t8000 = k.self_consistency_excluding(body, 0x8000, lib_range)
        h0800, t0800 = k.self_consistency_excluding(body, 0x0800, lib_range)
        hC000, tC000 = k.self_consistency_excluding(body, 0xC000, lib_range)
        r8000, r0800, rC000 = h8000 / t8000, h0800 / t0800, hC000 / tC000
        self.assertGreater(r8000, 0.4, "CODE03's own $8000 signal weakened unexpectedly")
        self.assertGreater(r8000, 2 * r0800, "CODE03 no longer clearly favours $8000 over $0800")
        self.assertGreater(r8000, 2 * rC000, "CODE03 no longer clearly favours $8000 over $C000")
        # Cross-file corroboration: a corpus-wide JSR census (fan-in >= 2, excluding
        # CODE00/01/03 as callers and LIBRARY's own range as targets) independently sweeps to
        # $8000 as CODE03's best-explained origin.
        callers: dict[int, set[str]] = {}
        for name, b in bodies.items():
            if name in ("CODE00", "CODE01", "CODE03"):
                continue
            for i in range(len(b) - 2):
                if b[i] == 0x20:
                    addr = b[i + 1] | (b[i + 2] << 8)
                    if lib_range[0] <= addr < lib_range[1]:
                        continue
                    callers.setdefault(addr, set()).add(name)
        targets = sorted(a for a, s in callers.items() if len(s) >= 2)
        result = k.sweep_origin(body, targets, min_inside=2)
        self.assertIsNotNone(result)
        self.assertEqual(result[2], 0x8000, f"cross-file sweep no longer converges on $8000: {result}")

    def test_code00_residence_stays_genuinely_unresolved_unlike_code03(self) -> None:
        """CODE00 does NOT show the same clean $8000 signal CODE03 does -- its own best
        self-referential origin (found by a coarse full-range self-consistency sweep) sits
        near LIBRARY's own upper boundary ($4AE0-$4B50), which is itself ambiguous (a
        candidate window that close to LIBRARY's real span is hard to separate from simple
        boundary overlap). This test pins that CODE00's OWN $8000 signal is real (better than
        its $0800/$C000 alternatives, consistent with a self-modifying-code hint at its very
        first instruction, STA $8011 -- self-referential 15 bytes into its own body if
        org=$8000) but clearly weaker than CODE03's, so the two should not be reported with
        the same confidence."""
        reason = _skip_reason("dok")
        if reason:
            self.skipTest(reason)
        bodies = k.all_bodies("dok")
        lib = bodies["LIBRARY"]
        lib_range = (k.KERNEL_ORIGIN, k.KERNEL_ORIGIN + len(lib))
        code00 = bodies["CODE00"]
        code03 = bodies["CODE03"]
        h00, t00 = k.self_consistency_excluding(code00, 0x8000, lib_range)
        h00_0800, t00_0800 = k.self_consistency_excluding(code00, 0x0800, lib_range)
        h03, t03 = k.self_consistency_excluding(code03, 0x8000, lib_range)
        r00, r00_0800, r03 = h00 / t00, h00_0800 / t00_0800, h03 / t03
        self.assertGreater(r00, r00_0800, "CODE00's $8000 signal should still beat its own $0800")
        self.assertLess(r00, r03 / 1.5,
                         "CODE00's $8000 signal is no longer clearly weaker than CODE03's -- "
                         "residence-confidence framing in the doc may need revisiting")


if __name__ == "__main__":
    unittest.main()
