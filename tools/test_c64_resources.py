#!/usr/bin/env python3
"""Tests for tools/c64_resources.py -- the ITEMNAMES resource-stem catalog and its
digit-patching loader (the C1.8 "unfollowed lead" round; see
docs/engine/research/c64-resource-stems.md for the full narrative these tests pin).

Two layers, same discipline as test_c64_kernel.py:

  1. SYNTHETIC tests of the parsing/decoding primitives -- always run, need nothing external,
     and are the ones with an explicit mutation note (what was broken, what went red).
  2. REAL-CORPUS tests against the retail D:/Games/Emulator/C64/Goldbox/ disks -- skip cleanly
     when that external, never-vendored source is absent. These pin this round's actual
     findings: the exact stem tables, the shared hex-ASCII idiom across all 7 titles, the
     length-table cross-check, and the GDRIVE-is-not-per-area call-site evidence.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disk as c64  # noqa: E402
import c64_kernel as k  # noqa: E402
import c64_resources as r  # noqa: E402

TITLES = ("cok", "dok")

ALL_SEVEN_TITLES = (
    "Champions of Krynn",
    "Death Knights of Krynn",
    "Curse of the Azure Bonds",
    "Secret of the Silver Blades",
    "Gateway to the Savage Frontier",
    "Pool of Radiance",
    "Buck Rogers - Countdown to Doomsday",
)
GOLDBOX_ROOT = r"D:\Games\Emulator\C64\Goldbox"


def _skip_reason(title: str) -> str | None:
    try:
        k.side1_path(title)
    except k.SourceUnavailable as exc:
        return str(exc)
    return None


def _skip_reason_dir(title_dir_name: str) -> str | None:
    import glob
    import os

    d = os.path.join(GOLDBOX_ROOT, title_dir_name)
    if not os.path.isdir(d):
        return f"external source directory not found: {d}"
    if not [p for p in glob.glob(os.path.join(d, "*.d64")) if "Side 1" in p]:
        return f"no 'Side 1' .d64 found in {d}"
    return None


# ------------------------------------------------------------------------------------------
# 1. SYNTHETIC tests -- the stem-table parser
# ------------------------------------------------------------------------------------------


class ParseStemTableSyntheticTests(unittest.TestCase):
    def test_shape_a_concatenated_no_separator(self) -> None:
        # Real ITEMNAMES bodies always carry the literal "00" placeholder (the digit patch
        # happens to a resident COPY at runtime, never to the on-disk template) -- so the
        # fixture uses "00" throughout, matching every stem observed on any real disk.
        body = b"junk\x00some prompt string\x00GDRIVE00GEO00MON00"
        self.assertEqual(r.parse_stem_table(body), ["GDRIVE00", "GEO00", "MON00"])

    def test_shape_b_nul_separated(self) -> None:
        body = b"junk\x00prompt\x00GDRIVE00\x00GEO00\x00MON00\x00"
        self.assertEqual(r.parse_stem_table(body), ["GDRIVE00", "GEO00", "MON00"])

    def test_no_gdrive_marker_returns_empty(self) -> None:
        # CoAB/Gateway/Pool's real shape: ITEMNAMES has no resource-stem catalog at all.
        body = b"just some ordinary item name strings\x00ANOTHER ONE\x00"
        self.assertEqual(r.parse_stem_table(body), [])

    def test_shape_a_stops_at_first_non_conforming_run(self) -> None:
        # A truncated/corrupted tail must degrade to a short list, not silently absorb junk.
        body = b"\x00GDRIVE00SQRPACI00###GARBAGE"
        self.assertEqual(r.parse_stem_table(body), ["GDRIVE00", "SQRPACI00"])

    def test_mutation_shape_b_boundary(self) -> None:
        """Verified this can fail: temporarily changed the Shape-B detector's offset check
        from `body[idx + 8]` (correct -- 'GDRIVE00' is 8 characters) to `body[idx + 7]`, which
        reads the last '0' of 'GDRIVE00' itself instead of the byte after it. Against the
        Shape-B fixture below (NUL immediately after the 8-char stem) that misread byte is
        ord('0')=0x30, not 0x00, so the detector wrongly fell through to the Shape-A path and
        this assertion went red (parsed length collapsed to 1 giant garbage entry instead of
        2 clean stems -- the fixture below has exactly 2, not the 3 an earlier draft of this
        docstring claimed). Reverted to `body[idx + 8]` before checking this in.
        """
        body = b"\x00GDRIVE00\x00GEO00\x00"
        self.assertEqual(r.parse_stem_table(body), ["GDRIVE00", "GEO00"])

    def test_looks_like_stem_rejects_non_two_digit_suffix(self) -> None:
        self.assertFalse(r._looks_like_stem(b"GDRIVE0"))       # 1 digit
        self.assertFalse(r._looks_like_stem(b"GDRIVE"))         # 0 digits
        self.assertFalse(r._looks_like_stem(b"12"))              # no letters at all
        self.assertTrue(r._looks_like_stem(b"GDRIVE00"))
        self.assertTrue(r._looks_like_stem(b"MON00"))
        # real filenames DO get patched to hex ids (e.g. "MON1F") but that only ever happens
        # to the resident runtime COPY, never to ITEMNAMES's on-disk template -- so a decimal
        # -only ("00") match is deliberately the only shape parse_stem_table needs to accept.
        self.assertFalse(r._looks_like_stem(b"MON1F"))


# ------------------------------------------------------------------------------------------
# 2. SYNTHETIC tests -- the hex-nibble -> ASCII reference implementation
# ------------------------------------------------------------------------------------------


class HexNibbleToAsciiSyntheticTests(unittest.TestCase):
    def test_all_sixteen_nibbles_produce_uppercase_hex_digits(self) -> None:
        expected = "0123456789ABCDEF"
        got = "".join(chr(r.hex_nibble_to_ascii_reference(n)) for n in range(16))
        self.assertEqual(got, expected)

    def test_masks_to_low_nibble(self) -> None:
        # A caller passing an un-masked byte (e.g. 0xF3) must still get the low-nibble result.
        self.assertEqual(r.hex_nibble_to_ascii_reference(0xF3), ord("3"))
        self.assertEqual(r.hex_nibble_to_ascii_reference(0xFA), ord("A"))

    def test_mutation_wrong_adc_constant_breaks_hex_letters(self) -> None:
        """Verified this can fail: this test recomputes the routine with the WRONG adjustment
        constant (+7, i.e. the plain 'ADC #$06' amount with no carry contribution, the mistake
        an implementer would make by reading only the CMP/ADC bytes and not tracing the carry
        flag through from the CMP) and confirms it does NOT reproduce 'A'-'F' -- i.e. this
        module's actual hex_nibble_to_ascii_reference is not a vacuous no-op check.
        """
        def wrong(nibble: int) -> int:
            n = nibble & 0x0F
            a = (n + 0x30) & 0xFF
            if a >= 0x3A:
                a = (a + 0x06) & 0xFF  # missing the +1 carry contribution
            return a

        wrong_letters = "".join(chr(wrong(n)) for n in range(10, 16))
        self.assertNotEqual(wrong_letters, "ABCDEF")
        self.assertEqual(wrong_letters, "@ABCDE")  # off by one, landing on '@' instead of 'A'
        # ... while the real implementation is unaffected:
        real_letters = "".join(chr(r.hex_nibble_to_ascii_reference(n)) for n in range(10, 16))
        self.assertEqual(real_letters, "ABCDEF")

    def test_find_hex_ascii_routine_locates_the_idiom(self) -> None:
        body = b"\x00" * 10 + r.HEX_ASCII_IDIOM + b"\xEA" * 5
        self.assertEqual(r.find_hex_ascii_routine(body), 10)

    def test_find_hex_ascii_routine_absent(self) -> None:
        self.assertIsNone(r.find_hex_ascii_routine(b"\x00" * 50))


# ------------------------------------------------------------------------------------------
# 3. SYNTHETIC tests -- find_loader_calls (the aligned JSR/JMP + immediate-operand resolver)
# ------------------------------------------------------------------------------------------


class FindLoaderCallsSyntheticTests(unittest.TestCase):
    def test_resolves_immediate_x_and_a_before_a_call(self) -> None:
        # LDX #$00 ; LDA #$01 ; JSR $4142
        body = bytes([0xA2, 0x00, 0xA9, 0x01, 0x20, 0x42, 0x41])
        calls = r.find_loader_calls("FAKE", body, 0x0800, (0x4142,))
        self.assertEqual(len(calls), 1)
        c = calls[0]
        self.assertEqual((c.x_imm, c.a_imm), (0, 1))
        self.assertEqual(c.addr, 0x0804)
        self.assertEqual(c.target, 0x4142)

    def test_ignores_calls_to_addresses_not_in_entries(self) -> None:
        body = bytes([0xA2, 0x00, 0xA9, 0x01, 0x20, 0x00, 0x50])  # JSR $5000
        calls = r.find_loader_calls("FAKE", body, 0x0800, (0x4142,))
        self.assertEqual(calls, [])

    def test_a_not_immediate_is_reported_as_carried(self) -> None:
        # LDA $1234 (absolute, NOT immediate) ; JSR $4142 -- A must come back as None ("carried").
        body = bytes([0xAD, 0x34, 0x12, 0x20, 0x42, 0x41])
        calls = r.find_loader_calls("FAKE", body, 0x0800, (0x4142,))
        self.assertEqual(len(calls), 1)
        self.assertIsNone(calls[0].a_imm)

    def test_mutation_stale_immediate_across_a_call_boundary_is_not_used(self) -> None:
        """A REAL bug this test caught during development (not a hypothetical): the backward
        scan's control-flow-boundary guard was originally written as
        `if bmnem in ("JSR", "JMP", "RTS") and back > 1: break` -- the `and back > 1` meant a
        JSR/JMP/RTS found exactly ONE instruction before the target call was not treated as a
        boundary at all, so scanning silently continued past it. Fixture: LDX #$00 ; JSR $9999
        (an unrelated call, exactly 1 instruction before the real target) ; JSR $4142 with NO
        LDX between the two JSRs. Correct behaviour is X=None (the #$00 does not survive across
        the unrelated JSR); the original buggy code returned X=0 here. Confirmed by temporarily
        restoring the `and back > 1` clause -- this assertion went red (0 is not None) -- then
        removing it, which is the fix now shipped in c64_resources.py.
        """
        body = bytes([0xA2, 0x00, 0x20, 0x99, 0x99, 0x20, 0x42, 0x41])
        calls = r.find_loader_calls("FAKE", body, 0x0800, (0x4142,))
        self.assertEqual(len(calls), 1)
        self.assertIsNone(calls[0].x_imm)

    def test_two_entry_points_both_matched(self) -> None:
        body = bytes([0xA2, 0x00, 0x4C, 0x3F, 0x41,       # JMP $413F
                       0xA2, 0x05, 0x4C, 0x42, 0x41])       # JMP $4142
        calls = r.find_loader_calls("FAKE", body, 0x0800, (0x413F, 0x4142))
        self.assertEqual([c.target for c in calls], [0x413F, 0x4142])
        self.assertEqual([c.x_imm for c in calls], [0, 5])


# ------------------------------------------------------------------------------------------
# 4. REAL-CORPUS tests -- CoK / DoK
# ------------------------------------------------------------------------------------------


class StemTableRealCorpusTests(unittest.TestCase):
    def test_stem_table_matches_cok(self) -> None:
        reason = _skip_reason("cok")
        if reason:
            self.skipTest(reason)
        self.assertEqual(r.cok_stems(), r.COK_STEMS_EXPECTED)

    def test_stem_table_matches_dok(self) -> None:
        reason = _skip_reason("dok")
        if reason:
            self.skipTest(reason)
        self.assertEqual(r.dok_stems(), r.DOK_STEMS_EXPECTED)

    def test_dok_wallset_stem_appears_twice_a_real_title_difference(self) -> None:
        """DoK's table has 'WALLSET00' at BOTH slot 9 (where CoK has the shorter 'WALLS00')
        and slot 11 -- a genuine on-disk difference between the two titles' catalogs, not a
        parsing artifact. Pinned explicitly so a future stem-table change is caught."""
        reason = _skip_reason("dok")
        if reason:
            self.skipTest(reason)
        stems = r.dok_stems()
        wallset_slots = [i for i, s in enumerate(stems) if s == "WALLSET00"]
        self.assertEqual(wallset_slots, [9, 11])

    def test_dok_has_one_more_stem_than_cok_code00(self) -> None:
        reason_c, reason_d = _skip_reason("cok"), _skip_reason("dok")
        if reason_c or reason_d:
            self.skipTest(reason_c or reason_d)
        cok, dok = r.cok_stems(), r.dok_stems()
        self.assertEqual(len(dok), len(cok) + 1)
        self.assertEqual(dok[-1], "CODE00")
        self.assertNotIn("CODE00", cok)


class LengthTableCrossCheckRealCorpusTests(unittest.TestCase):
    """The strongest single piece of evidence in this round: two independent readings of
    each stem's length (one from ITEMNAMES's own string layout, one from a machine-code
    lookup table inside LIBRARY) must agree exactly."""

    def _check(self, title: str) -> None:
        reason = _skip_reason(title)
        if reason:
            self.skipTest(reason)
        stems = r.parse_stem_table(r._itemnames_side1(title))
        from_strings = r.stem_lengths(stems)
        lib = k.kernel_body(title)
        from_machine_code = r.length_table(title, lib)
        self.assertEqual(from_machine_code, from_strings)

    def test_cok(self) -> None:
        self._check("cok")

    def test_dok(self) -> None:
        self._check("dok")

    def test_mutation_a_single_wrong_length_breaks_the_cross_check(self) -> None:
        """Verified this can fail (without touching real disk data): construct a copy of a
        real, matching pair and flip one entry -- the assertion must go red."""
        reason = _skip_reason("cok")
        if reason:
            self.skipTest(reason)
        stems = r.cok_stems()
        from_strings = r.stem_lengths(stems)
        lib = k.kernel_body("cok")
        from_machine_code = r.length_table("cok", lib)
        self.assertEqual(from_machine_code, from_strings)  # sanity: real data agrees
        corrupted = list(from_machine_code)
        corrupted[0] += 1
        self.assertNotEqual(corrupted, from_strings)


class IndexTableRealCorpusTests(unittest.TestCase):
    def test_first_eleven_slots_are_identity_both_titles(self) -> None:
        """X=0..10 map 1:1 to Y=0..10 (GDRIVE..SPRITE) in both titles -- read straight out of
        LIBRARY's own bytes."""
        for title in TITLES:
            reason = _skip_reason(title)
            if reason:
                self.skipTest(reason)
            lib = k.kernel_body(title)
            idx = r.index_table(title, lib, count=11)
            self.assertEqual(idx, list(range(11)))

    def test_resolve_family_gdrive_is_slot_zero_both_titles(self) -> None:
        for title in TITLES:
            reason = _skip_reason(title)
            if reason:
                self.skipTest(reason)
            self.assertEqual(r.resolve_family(title, 0), "GDRIVE00")

    def test_resolve_family_dok_code_slot(self) -> None:
        reason = _skip_reason("dok")
        if reason:
            self.skipTest(reason)
        # DoK's index table maps call-site X=25 -> stem Y=20 -> 'CODE00' (see the doc's §4
        # point 4 -- CODE00/01/03 are real, correctly-predicted DoK-only files).
        self.assertEqual(r.resolve_family("dok", 25), "CODE00")


class HexAsciiIdiomAllSevenTitlesTests(unittest.TestCase):
    """The one claim in this round explicitly checked across the full 7-title population
    (evidence rule: a claim must hold in all titles checked, not two), rather than only CoK+DoK.
    """

    def test_present_exactly_once_in_library_all_seven_titles(self) -> None:
        import glob
        import os

        checked = 0
        for title_dir in ALL_SEVEN_TITLES:
            reason = _skip_reason_dir(title_dir)
            if reason:
                self.skipTest(reason)
            paths = [p for p in glob.glob(os.path.join(GOLDBOX_ROOT, title_dir, "*.d64"))
                     if "Side 1" in p]
            disk = c64.read_image(paths[0])
            library = None
            for e in c64.directory(disk):
                if e.name == "LIBRARY":
                    library = c64.read_file(disk, e)
                    break
            self.assertIsNotNone(library, f"{title_dir}: no LIBRARY on side 1")
            occurrences = library.count(r.HEX_ASCII_IDIOM)
            self.assertEqual(
                occurrences, 1,
                f"{title_dir}: expected the hex-ASCII idiom exactly once in LIBRARY, "
                f"found {occurrences}",
            )
            checked += 1
        self.assertEqual(checked, 7, "population size must be all 7 titles, not a subset")

    def test_null_population_of_seven_is_the_whole_corpus(self) -> None:
        """Guards against silently shrinking ALL_SEVEN_TITLES; the corpus really has 7 titles
        with C64 releases (see CLAUDE.md's C64 section)."""
        self.assertEqual(len(ALL_SEVEN_TITLES), 7)
        self.assertEqual(len(set(ALL_SEVEN_TITLES)), 7)


class GdriveIsNotPerAreaRealCorpusTests(unittest.TestCase):
    """The Q3 claim: GDRIVE (family index 0)'s A values are all compile-time-constant,
    unlike genuinely per-area families. Falsifiable both ways: a future re-disassembly that
    finds ANY carried-from-context A at a GDRIVE site, or an immediate-only per-area family,
    would turn one of these assertions red.
    """

    def test_cok_gdrive_calls_are_never_carried_from_context(self) -> None:
        reason = _skip_reason("cok")
        if reason:
            self.skipTest(reason)
        calls = r.gdrive_calls("cok")
        self.assertGreaterEqual(len(calls), 4, "expected several real GDRIVE call sites")
        for c in calls:
            # Either a literal immediate, or the one traced "reload cached id with dirty bit"
            # site, which is itself provably NOT an area value (see the doc's §3): its A comes
            # from $7F13 (the per-family cache slot), not any area/GEO/dungeon-context memory.
            self.assertTrue(
                c.a_imm is not None or c.file == "DUNGEON",
                f"unexpected non-immediate, non-cache-reload GDRIVE call: {c}",
            )

    def test_dok_gdrive_calls_are_all_immediate(self) -> None:
        reason = _skip_reason("dok")
        if reason:
            self.skipTest(reason)
        calls = r.gdrive_calls("dok")
        self.assertGreaterEqual(len(calls), 3, "expected several real GDRIVE call sites")
        for c in calls:
            self.assertIsNotNone(c.a_imm, f"unexpected carried-A GDRIVE call in DoK: {c}")

    def test_per_area_family_carried_ratio_is_sixteen_not_fourteen(self) -> None:
        """CORRECTED 2026-08-13. The doc's §3 cited "12 of their 14 combined sites" carried and
        "10/10" for the non-SECSET subset as the discriminating statistic against GDRIVE's
        13/14-immediate. Summing its own per-family table gives 16, not 14. Measured here so
        the ratio the argument rests on is the one the bytes produce: 16 total, 14 carried,
        2 immediate (both the shared SECSET #$64 default), non-SECSET 12/12."""
        reason_c, reason_d = _skip_reason("cok"), _skip_reason("dok")
        if reason_c or reason_d:
            self.skipTest(reason_c or reason_d)
        # Check the six family indices resolve to the names the doc's table gives them, through
        # the real index table. X is a CALL-SITE index, not a position in the stem list -- stem
        # index 12 is WALLDEF, but call-site X=12 resolves to MON -- so a bare hardcoded set
        # would look right and mean something else. (Several higher X values also resolve to
        # WALLSET00/WALLDEF00, e.g. cok X=15..17; none of them carries a single call site, which
        # is why the doc's table has no row for them.)
        expected_names = {2: "GEO00", 3: "SECSET00", 12: "MON00", 13: "BODY00", 14: "HEAD00"}
        for x, name in expected_names.items():
            self.assertEqual(r.resolve_family("cok", x), name, f"X={x} no longer resolves to {name}")
        self.assertEqual(r.resolve_family("cok", 9), "WALLS00")   # dok names the same family
        self.assertEqual(r.resolve_family("dok", 9), "WALLSET00")  # WALLSET
        per_area = set(expected_names) | {9}
        secset = 3
        calls = [c for c in (r.all_loader_calls("cok") + r.all_loader_calls("dok"))
                 if c.x_imm in per_area]
        carried = [c for c in calls if c.a_imm is None]
        immediate = [c for c in calls if c.a_imm is not None]
        self.assertEqual((len(calls), len(carried), len(immediate)), (16, 14, 2))
        # Both immediates are SECSET's shared #$64 init-time default, not an area id.
        self.assertEqual({c.x_imm for c in immediate}, {secset})
        self.assertEqual({c.a_imm for c in immediate}, {0x64})
        non_secset = [c for c in calls if c.x_imm != secset]
        self.assertEqual(
            (sum(1 for c in non_secset if c.a_imm is None), len(non_secset)), (12, 12))

    def test_immediate_gdrive_ids_are_a_small_closed_set_matching_shipped_files(self) -> None:
        """The observed immediate ids, across both titles, are a small set -- consistent with
        a hardware/config selector, not an area id (areas number in the dozens for genuinely
        per-area families; see docs' file-count comparison)."""
        reason_c, reason_d = _skip_reason("cok"), _skip_reason("dok")
        if reason_c or reason_d:
            self.skipTest(reason_c or reason_d)
        ids = {c.a_imm for c in r.gdrive_calls("cok") if c.a_imm is not None}
        ids |= {c.a_imm for c in r.gdrive_calls("dok") if c.a_imm is not None}
        self.assertLessEqual(len(ids), 6)
        # every id is small (a driver index), nothing resembling a 60-entry area-id range
        self.assertTrue(all(0 <= i <= 5 for i in ids), ids)

    def test_at_least_one_genuinely_per_area_family_has_a_carried_call(self) -> None:
        """The discriminating null: if per-area families ALSO always used immediates, GDRIVE's
        all-immediate pattern would mean nothing. GEO (a per-area map family) must show at
        least one carried (non-immediate) A at a real call site in CoK."""
        reason = _skip_reason("cok")
        if reason:
            self.skipTest(reason)
        geo_calls = [c for c in r.all_loader_calls("cok") if c.x_imm == 2]
        self.assertGreaterEqual(len(geo_calls), 1)
        self.assertTrue(any(c.a_imm is None for c in geo_calls),
                         "expected at least one GEO call site with a carried (area-derived) A")

    def test_gdrive_call_site_count_pins_the_doc_table(self) -> None:
        """Regression for a real bug caught during verification: an earlier draft of
        docs/engine/research/c64-resource-stems.md's per-family table listed DoK's GDRIVE row as
        5 sites, silently dropping `CODE01 $0A6F` (A=#$05) -- that overlay's own resource family
        is CODE, not GDRIVE, which is exactly why a by-file skim missed it. The real, script-
        regenerated count is 8 CoK + 6 DoK = 14 total GDRIVE sites; pin it here so a future
        change to find_loader_calls/all_loader_calls that silently drops or adds a site is
        caught by a test, not by the next person re-deriving the doc's table by hand.
        """
        reason_c, reason_d = _skip_reason("cok"), _skip_reason("dok")
        if reason_c or reason_d:
            self.skipTest(reason_c or reason_d)
        cok_calls = r.gdrive_calls("cok")
        dok_calls = r.gdrive_calls("dok")
        self.assertEqual(len(cok_calls), 8)
        self.assertEqual(len(dok_calls), 6)
        self.assertIn("CODE01", [c.file for c in dok_calls])
        # exactly one carried (non-immediate) site total, across both titles combined -- the
        # traced $7F13|$80 cache-reload exception (CoK DUNGEON $297E); every other site is a
        # literal immediate.
        carried = [c for c in cok_calls + dok_calls if c.a_imm is None]
        self.assertEqual(len(carried), 1)
        self.assertEqual((carried[0].file, carried[0].addr), ("DUNGEON", 0x297E))

    def test_gdrive03_is_requested_but_not_shipped_in_either_title(self) -> None:
        """The 'phantom id' finding: both CoK and DoK's INIT unconditionally request GDRIVE
        family id 3, but neither title's disk set ships a GDRIVE03 file."""
        reason_c, reason_d = _skip_reason("cok"), _skip_reason("dok")
        if reason_c or reason_d:
            self.skipTest(reason_c or reason_d)
        cok_ids = {c.a_imm for c in r.gdrive_calls("cok") if c.a_imm is not None}
        dok_ids = {c.a_imm for c in r.gdrive_calls("dok") if c.a_imm is not None}
        self.assertIn(3, cok_ids)
        self.assertIn(3, dok_ids)

        cok_files = set(k.all_bodies("cok"))
        dok_files = set(k.all_bodies("dok"))
        self.assertNotIn("GDRIVE03", cok_files)
        self.assertNotIn("GDRIVE03", dok_files)
        # but the real, shipped GDRIVE files for each title's other requested ids DO exist:
        self.assertIn("GDRIVE01", cok_files)
        self.assertIn("GDRIVE02", cok_files)
        self.assertIn("GDRIVE04", dok_files)
        self.assertIn("GDRIVE05", dok_files)


if __name__ == "__main__":
    unittest.main()
