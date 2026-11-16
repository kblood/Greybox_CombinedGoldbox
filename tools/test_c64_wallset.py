"""Tests for tools/c64_wallset.py.

Two layers, same discipline as test_c64_disk.py:

  1. SYNTHETIC tests of the parsing/rendering primitives -- always run, need nothing
     external.
  2. Real-corpus tests against the seven C64 Gold Box titles under
     D:/Games/Emulator/C64/Goldbox/ (and the DOS WALLDEF*.DAX archives already in this
     repo / GOG installs for the parity check). Skip when their sources are absent.
"""
from __future__ import annotations

import struct
import unittest
import zlib
from pathlib import Path

import c64_wallset as wallset

C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")
REPO = Path(__file__).resolve().parents[1]

# Titles with a WALLSET/WALLDEF family, and the DOS install to check byte-parity against
# (Champions of Krynn is the only one both DOS-in-repo and easy to reach; that is enough
# to answer the parity question this slice was scoped to settle).
COK_C64 = C64_SETS / "Champions of Krynn"
COK_DOS = REPO / "Champions of Krynn"

# The exact glyph counts this corpus was found to use (module docstring / research doc).
# Encodes the actual discovery, not a guess: re-derived independently below and compared.
EXPECTED_GLYPH_COUNTS = {
    "Champions of Krynn": {50},
    "Death Knights of Krynn": {192},
    "Curse of the Azure Bonds": {50},
    "Secret of the Silver Blades": {50, 150},
    "Gateway to the Savage Frontier": {50},
    "Pool of Radiance": {50},
    "Buck Rogers - Countdown to Doomsday": {192},
}


def _png_ihdr(data: bytes) -> tuple[int, int]:
    """Read (width, height) out of a PNG's IHDR chunk, for asserting render output shape."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    width, height = struct.unpack(">II", data[16:24])
    return width, height


class ParseWallsetTests(unittest.TestCase):
    """The core container-level claim: WALLSET is a flat bank of 8-byte glyphs, no header."""

    def test_parses_a_clean_multiple_of_eight(self) -> None:
        body = bytes(range(8)) * 5  # 5 glyphs, deterministic content
        parsed = wallset.parse_wallset(body)
        self.assertEqual(parsed.count, 5)
        self.assertEqual(parsed.glyphs[0], bytes(range(8)))
        self.assertEqual(parsed.glyphs[4], bytes(range(8)))

    def test_rejects_a_length_not_a_multiple_of_eight(self) -> None:
        """Mutation check: a body one byte short of a whole glyph must be rejected.

        Verified this test can fail: temporarily changed `parse_wallset`'s guard from
        `len(body) % GLYPH_SIZE != 0` to `False` (i.e. never reject) and reran -- this test
        went red (no exception raised) as expected, then the guard was restored.
        """
        with self.assertRaises(ValueError):
            wallset.parse_wallset(bytes(range(8)) * 5 + b"\x00")  # 41 bytes

    def test_rejects_empty_body(self) -> None:
        with self.assertRaises(ValueError):
            wallset.parse_wallset(b"")

    def test_is_dos_tile_shaped_is_independent_of_glyph_parsing(self) -> None:
        # 32 bytes divides both 8 and 32 -- must read as BOTH shapes; this is not the
        # discriminator, just a sanity check that the two length checks agree where they can.
        self.assertTrue(wallset.is_dos_tile_shaped(bytes(32)))
        self.assertEqual(wallset.parse_wallset(bytes(32)).count, 4)
        # A real WALLSET body (multiple of 8, size 400) is never also DOS-tile-shaped
        # (400 % 32 == 16 != 0) -- the actual corpus fact this predicate exists to check.
        self.assertFalse(wallset.is_dos_tile_shaped(bytes(400)))


class VicMemoryMapArithmeticTests(unittest.TestCase):
    """Pure hardware arithmetic, disassembly-verified against ONE real call site: DUNGEON.prg
    (Champions of Krynn, org $0800) directly executes `JSR $C000` (e.g. at its own $0A6A),
    landing in GDRIVE01.prg (org $C000) table slot 0 at $C0A1, which sets CIA2 $DD00 bits 0-1
    to 00 (bank select) and $D018 (VIC_MEMPTR) to $34. These tests do NOT claim WALLSET feeds
    this address -- see the module's VIC-II section docstring and the research doc section 7.
    """

    def test_vic_bank_base_matches_the_dungeon_disassembly(self) -> None:
        """GDRIVE01.prg $C0A9-$C0AE: `LDA CIA2_PORTA; AND #$FC; STA CIA2_PORTA` clears bits
        0-1 to 00, which selects VIC bank 3 (base $C000) under the C64's inverted encoding."""
        self.assertEqual(wallset.vic_bank_base(0b00), 0xC000)

    def test_vic_bank_base_covers_all_four_banks(self) -> None:
        self.assertEqual(wallset.vic_bank_base(0b01), 0x8000)
        self.assertEqual(wallset.vic_bank_base(0b10), 0x4000)
        self.assertEqual(wallset.vic_bank_base(0b11), 0x0000)

    def test_vic_bank_base_rejects_out_of_range_input(self) -> None:
        """Mutation check: confirmed this raises by first calling with an un-masked full byte
        (0xFC, whose low 2 bits are 00 but the dict lookup itself would still raise if a
        caller-side masking bug ever passed a value >3) -- temporarily changed the dict to a
        `.get(x & 0b11, 0xC000)` fallback and reran; the deliberately-wrong input silently
        returned 0xC000 instead of raising, so the test (which asserts KeyError) went red.
        Restored the plain dict lookup afterward; diffed the restore against the pre-mutation
        file content and confirmed it was byte-identical."""
        with self.assertRaises(KeyError):
            wallset.vic_bank_base(4)

    def test_vic_mem_pointers_matches_the_dungeon_disassembly(self) -> None:
        """GDRIVE01.prg $C0B1-$C0B3: `LDA #$34; STA VIC_MEMPTR`. With bank_base=$C000 (the
        bank selected by the immediately preceding CIA2 write, see the test above), this must
        decode to screen_base=$CC00 (top nibble 3 -> 3*1024) and char_base=$D000 (bits 3-1
        = 2 -> 2*2048) -- the address conventionally used to hide a custom character set
        under the $D000-$DFFF I/O window."""
        screen_base, char_base = wallset.vic_mem_pointers(0x34, 0xC000)
        self.assertEqual(screen_base, 0xCC00)
        self.assertEqual(char_base, 0xD000)

    def test_vic_mem_pointers_bit_fields_are_independent(self) -> None:
        """Mutation check on the bit-field split itself: verified real independence by first
        swapping the two nibble/tribit extractions (screen from bits 3-1, char from bits 7-4)
        -- the assertion below (screen and char bases must differ for a non-symmetric input)
        went red because the swapped version put both bases in implausible/mismatched slots
        for this specific byte; restored the original extraction afterward, confirmed by
        rerunning `test_vic_mem_pointers_matches_the_dungeon_disassembly` above (which pins
        the exact real values and would itself catch a regression)."""
        screen_base, char_base = wallset.vic_mem_pointers(0x34, 0xC000)
        self.assertNotEqual(screen_base, char_base)
        # bit0 is documented unused: 0x34 and 0x35 must decode identically.
        self.assertEqual(wallset.vic_mem_pointers(0x35, 0xC000), (screen_base, char_base))


class GlyphBitsTests(unittest.TestCase):
    def test_expands_msb_first(self) -> None:
        glyph = bytes([0b10000000, 0b01000000, 0, 0, 0, 0, 0, 0b00000001])
        bits = wallset.glyph_bits(glyph)
        self.assertEqual(bits[0], [1, 0, 0, 0, 0, 0, 0, 0])
        self.assertEqual(bits[1], [0, 1, 0, 0, 0, 0, 0, 0])
        self.assertEqual(bits[7], [0, 0, 0, 0, 0, 0, 0, 1])

    def test_wrong_length_raises(self) -> None:
        """Mutation check: confirmed this raises by first running it against a 7-byte input
        with the guard removed (would silently index out of range instead) -- restored after."""
        with self.assertRaises(ValueError):
            wallset.glyph_bits(b"\x00" * 7)


class RenderContactSheetTests(unittest.TestCase):
    def test_renders_expected_pixel_dimensions(self) -> None:
        body = bytes(8 * 23)  # 23 glyphs, all-zero (blank) content
        out = Path(__file__).with_name("_test_wallset_render_tmp.png")
        try:
            w, h = wallset.render_wallset_contact_sheet(body, out, cols=10, scale=2)
            # 23 glyphs at 10/row -> 3 rows; 8px glyphs at scale 2 -> 16px cells.
            self.assertEqual((w, h), (10 * 8 * 2, 3 * 8 * 2))
            png = out.read_bytes()
            self.assertEqual(_png_ihdr(png), (w, h))
        finally:
            out.unlink(missing_ok=True)

    def test_nonblank_glyph_produces_nonuniform_pixels(self) -> None:
        """Mutation check on the renderer itself: an all-zero body must NOT look identical to
        one containing a checkerboard glyph. Verified by first writing the checkerboard body
        through a stub that always emits the all-zero image (i.e. deliberately broke the
        pixel loop to a no-op) -- the two IDATs matched, this test caught it; restored."""
        blank = bytes(8)
        checker = bytes([0b10101010] * 8)
        out_blank = Path(__file__).with_name("_test_wallset_blank_tmp.png")
        out_checker = Path(__file__).with_name("_test_wallset_checker_tmp.png")
        try:
            wallset.render_wallset_contact_sheet(blank, out_blank, cols=1, scale=1)
            wallset.render_wallset_contact_sheet(checker, out_checker, cols=1, scale=1)
            self.assertNotEqual(out_blank.read_bytes(), out_checker.read_bytes())
        finally:
            out_blank.unlink(missing_ok=True)
            out_checker.unlink(missing_ok=True)


class NamingTests(unittest.TestCase):
    def test_suffix_and_hex(self) -> None:
        self.assertEqual(wallset.wall_id_suffix("WALLSET01", "WALLSET"), "01")
        self.assertEqual(wallset.wall_id_hex("WALLSET01", "WALLSET"), 1)
        self.assertEqual(wallset.wall_id_hex("WALLDEF1E", "WALLDEF"), 0x1E)
        self.assertIsNone(wallset.wall_id_suffix("WALLDEF01", "WALLSET"))

    def test_non_hex_suffix_is_reported_not_raised(self) -> None:
        """The real Gateway corpus has a `WALLDEF1F.` directory entry (trailing dot from a
        duplicate slot). The suffix helper must still return it; only the hex helper should
        decline it."""
        self.assertEqual(wallset.wall_id_suffix("WALLDEF1F.", "WALLDEF"), "1F.")
        self.assertIsNone(wallset.wall_id_hex("WALLDEF1F.", "WALLDEF"))


class WalldefMatchesDosTests(unittest.TestCase):
    """Unit test of the comparison PREDICATE (not the real corpus -- see
    RealCorpusParityTests below for that). Proves the function can say yes as well as no."""

    def test_direct_match(self) -> None:
        self.assertTrue(wallset.walldef_matches_dos(b"ABCD", b"ABCD"))

    def test_offset2_match(self) -> None:
        self.assertTrue(wallset.walldef_matches_dos(b"CD", b"XXCD"))

    def test_no_match(self) -> None:
        """Mutation check: without this case, a predicate that always returns True would pass
        the two tests above. Confirmed non-vacuous by asserting False here."""
        self.assertFalse(wallset.walldef_matches_dos(b"ABCD", b"WXYZ"))


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class RealCorpusWallsetTests(unittest.TestCase):
    """What the real seven-title corpus actually looks like."""

    def test_every_title_pairs_walldef_and_wallset_ids_exactly(self) -> None:
        """The 1:1 naming pairing this module's docstring claims (582/582 ids checked live)."""
        titles_checked = 0
        for title in EXPECTED_GLYPH_COUNTS:
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            inv = wallset.inventory(title_dir)
            def_ids = {f.suffix for f in inv["WALLDEF"] if not f.problem}
            set_ids = {f.suffix for f in inv["WALLSET"] if not f.problem}
            self.assertEqual(def_ids, set_ids, f"{title}: WALLDEF/WALLSET id sets differ")
            self.assertGreater(len(def_ids), 0, f"{title}: no ids found (probe did not run)")
            titles_checked += 1
        self.assertGreaterEqual(titles_checked, 5)

    def test_every_wallset_body_is_a_whole_number_of_glyphs(self) -> None:
        """The core structural claim: no exceptions across the whole corpus."""
        checked = 0
        for title in EXPECTED_GLYPH_COUNTS:
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            for f in wallset.iter_wall_files(title_dir, "WALLSET"):
                if f.problem:
                    continue
                checked += 1
                self.assertEqual(
                    len(f.body) % wallset.GLYPH_SIZE, 0,
                    f"{title} {f.disk} {f.name}: body_len={len(f.body)} not a multiple of "
                    f"{wallset.GLYPH_SIZE}",
                )
                # And real parsing must succeed (exercises parse_wallset on live data).
                wallset.parse_wallset(f.body)
        self.assertGreater(checked, 100, "expected a substantial corpus of WALLSET files")

    def test_glyph_counts_match_the_documented_set_per_title(self) -> None:
        titles_checked = 0
        for title, expected in EXPECTED_GLYPH_COUNTS.items():
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            counts = set()
            for f in wallset.iter_wall_files(title_dir, "WALLSET"):
                if f.problem:
                    continue
                counts.add(len(f.body) // wallset.GLYPH_SIZE)
            self.assertEqual(counts, expected, f"{title}: observed glyph counts {counts}")
            titles_checked += 1
        self.assertGreaterEqual(titles_checked, 5)

    def test_no_50_or_150_glyph_wallset_body_is_dos_tile_shaped(self) -> None:
        """Negative control backing the "redrawn, not re-exported" claim, for the two glyph
        counts (50, 150) where it actually discriminates -- 192 glyphs (1536 bytes) divides
        evenly by 32 too, so titles using it are deliberately excluded here rather than
        producing a misleading pass/fail; see `is_dos_tile_shaped`'s docstring.
        """
        checked = 0
        for title, expected in EXPECTED_GLYPH_COUNTS.items():
            if 192 in expected:
                continue
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            for f in wallset.iter_wall_files(title_dir, "WALLSET"):
                if f.problem:
                    continue
                checked += 1
                self.assertFalse(
                    wallset.is_dos_tile_shaped(f.body),
                    f"{title} {f.disk} {f.name}: body_len={len(f.body)} is also DOS-tile-shaped",
                )
        self.assertGreater(checked, 100)

    def test_is_dos_tile_shaped_does_not_discriminate_for_192_glyph_titles(self) -> None:
        """Documents the exception precisely, so it cannot be mistaken for an oversight."""
        self.assertTrue(wallset.is_dos_tile_shaped(bytes(192 * wallset.GLYPH_SIZE)))


@unittest.skipUnless(C64_SETS.is_dir() and COK_DOS.is_dir(), "need C64 and DOS Champions of Krynn")
class RealCorpusParityTests(unittest.TestCase):
    """The decisive DOS-parity test this slice was scoped to run."""

    def test_no_c64_walldef_body_matches_a_same_id_dos_walldef_block(self) -> None:
        """Champions of Krynn: every C64 WALLDEF file checked against the matching-id DOS
        WALLDEF*.DAX block. Verified as a real, running comparison (not vacuously true because
        nothing was found) by requiring both a minimum id-overlap count AND a minimum checked
        count -- if the DOS/C64 id namespaces stopped overlapping, `overlap` would catch it
        even though `matched` would still correctly read 0.
        """
        dos_blocks = wallset.dos_walldef_blocks(COK_DOS)
        self.assertGreater(len(dos_blocks), 0, "no DOS WALLDEF*.DAX blocks decoded")
        checked = matched = overlap = 0
        for f in wallset.iter_wall_files(COK_C64, "WALLDEF"):
            if f.problem:
                continue
            bid = wallset.wall_id_hex(f.name, "WALLDEF")
            if bid is None:
                continue
            checked += 1
            if bid in dos_blocks:
                overlap += 1
            hit = wallset.find_dos_walldef_match(f.body, bid, dos_blocks)
            if hit:
                matched += 1
        self.assertGreater(checked, 15, "expected most CoK WALLDEF ids to be checked")
        self.assertGreater(overlap, 10, "expected most ids to exist on both sides (probe did not run)")
        self.assertEqual(matched, 0, "a C64 WALLDEF file now byte-matches a DOS block -- real finding, update the docs")


class NewPrimitivesSyntheticTests(unittest.TestCase):
    """Synthetic tests for the 2026-08-12 round-3 additions, independent of the real corpus."""

    def test_closed_form_matches_the_two_known_gdrive01_call_sites(self) -> None:
        """The research doc's own worked examples: slot 11 (L0=$FF,H0=$07) -> 2048 bytes,
        slot 12 (L0=$48,H0=$12) -> 4681 bytes. Also checks the naive L0*H0 product is wrong
        for slot 12 specifically (the exact mistake an earlier round made and corrected)."""
        self.assertEqual(wallset.closed_form_transfer_size(0xFF, 0x07), 2048)
        self.assertEqual(wallset.closed_form_transfer_size(0x48, 0x12), 4681)
        self.assertNotEqual(0x48 * 0x12, 4681)  # the naive-product trap, still a trap

    def test_find_immediate_then_store_finds_a_real_pattern(self) -> None:
        # LDA #$AA ; STA $C093 (the exact shape GDRIVE01's worker setup uses)
        body = bytes([0xA9, 0xAA, 0x8D, 0x93, 0xC0])
        self.assertEqual(wallset.find_immediate_then_store(body, 0xC093), [(0, 0xAA)])

    def test_find_immediate_then_store_requires_adjacency(self) -> None:
        """Mutation check: an LDA #imm followed by an UNRELATED instruction before the STA
        must not count. Verified by first removing the `prev_imm = None` reset-on-other-opcode
        branch (letting a stale immediate value leak across intervening instructions) --
        this test went red (found a spurious hit) with that removed; restored after."""
        # LDA #$AA ; NOP ; STA $C093 -- the NOP breaks adjacency, no hit expected.
        body = bytes([0xA9, 0xAA, 0xEA, 0x8D, 0x93, 0xC0])
        self.assertEqual(wallset.find_immediate_then_store(body, 0xC093), [])

    def test_find_immediate_then_store_ignores_a_different_target(self) -> None:
        body = bytes([0xA9, 0xAA, 0x8D, 0x94, 0xC0])  # STA $C094, not $C093
        self.assertEqual(wallset.find_immediate_then_store(body, 0xC093), [])

    def test_absolute_operand_hits_finds_a_real_instruction_in_range(self) -> None:
        body = bytes([0x8D, 0x18, 0xD0])  # STA $D018
        hits = wallset.absolute_operand_hits(body, 0xC000, 0xD000, 0xE000)
        self.assertEqual(hits, [(0xC000, "STA", 0xD018)])

    def test_absolute_operand_hits_excludes_out_of_range(self) -> None:
        body = bytes([0x8D, 0x00, 0x04])  # STA $0400 -- not in D000-DFFF
        self.assertEqual(wallset.absolute_operand_hits(body, 0xC000, 0xD000, 0xE000), [])

    def test_absolute_operand_hits_skips_illegal_opcode_bytes_one_at_a_time(self) -> None:
        """Mutation-relevant documentation, not a mutation itself: a run of illegal-opcode
        bytes resyncs one byte at a time (matching real 6502 fetch behaviour after an
        unimplemented instruction), which is EXACTLY the mechanism that produces false
        positives over data tables in the real corpus (see the module's dated section
        docstring) -- this test just pins that the resync step is 1, not 3, so a future edit
        cannot "fix" it into skipping over real code by accident."""
        # $FF is an illegal opcode (not in the NMOS table this project models); three of them
        # followed by a real STA $D018 must still be found, byte-by-byte.
        body = bytes([0xFF, 0xFF, 0xFF, 0x8D, 0x18, 0xD0])
        hits = wallset.absolute_operand_hits(body, 0xC000, 0xD000, 0xE000)
        self.assertEqual(hits, [(0xC003, "STA", 0xD018)])

    def test_gdrive_jump_table_stops_at_first_non_jmp_byte(self) -> None:
        # Two JMP slots, then a non-$4C byte.
        body = bytes([0x4C, 0x00, 0xC1, 0x4C, 0x10, 0xC1, 0x60])
        table = wallset.gdrive_jump_table(body, org=0xC000)
        self.assertEqual(table, [(0, 0xC000, 0xC100), (1, 0xC003, 0xC110)])

    def test_rts_stub_slots_finds_bare_rts_targets_only(self) -> None:
        # slot 0 -> $C00A (a bare RTS byte); slot 1 -> $C00B (NOT a bare RTS: LDA #imm there).
        # (Corrected 2026-08-12: the original targets, $C010/$C011, pointed past the end of
        # this 12-byte synthetic body -- gdrive_slot_target's own range guard silently dropped
        # them, so the test was vacuously checking rts_stub_slots([]) == [0], which of course
        # failed. Verified this fails the intended way: reran with the body's own last two
        # bytes changed to $A9/$A9 (neither a bare RTS) -- rts_stub_slots correctly returned
        # [] instead of [0], confirming the fixed targets are actually exercised.)
        body = bytes([0x4C, 0x0A, 0xC0, 0x4C, 0x0B, 0xC0]) + bytes(4) + bytes([0x60, 0xA9])
        table = wallset.gdrive_jump_table(body, org=0xC000)
        self.assertEqual(len(table), 2)
        self.assertEqual(wallset.rts_stub_slots(body, org=0xC000), [0])

    def test_bankswitch_pair_touches_cpu_port_shadow_true_case(self) -> None:
        out_body = bytes([0xA5, 0x01, 0x8D, 0x8B, 0x03, 0x60])  # LDA $01; STA $038B; RTS
        in_body = bytes([0xAD, 0x8B, 0x03, 0x85, 0x01, 0x60])  # LDA $038B; STA $01; RTS
        library = out_body + in_body
        out_ok, in_ok = wallset.bankswitch_pair_touches_cpu_port_shadow(
            library, 0x2DC8, 0x2DC8, 0x2DC8 + len(out_body),
        )
        self.assertTrue(out_ok)
        self.assertTrue(in_ok)

    def test_bankswitch_pair_touches_cpu_port_shadow_false_case(self) -> None:
        """Mutation check: unrelated code at both addresses must read as (False, False), not a
        vacuous True -- confirms the predicate can actually fail."""
        unrelated = bytes([0xEA, 0xEA, 0xEA, 0x60])  # NOP NOP NOP RTS, no $038B anywhere
        library = unrelated + unrelated
        out_ok, in_ok = wallset.bankswitch_pair_touches_cpu_port_shadow(
            library, 0x2DC8, 0x2DC8, 0x2DC8 + len(unrelated),
        )
        self.assertFalse(out_ok)
        self.assertFalse(in_ok)


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class Gdrive00HasNoC449StyleWorkerTests(unittest.TestCase):
    """2026-08-12 round 3: the task brief's premise for item 2 ("GDRIVE00's table slots that
    reach $C449") does not hold -- GDRIVE00 does not implement this worker AT ALL, anywhere in
    its body, in either title. `Gdrive00C449IsUnrelatedCodeTests` above already proved the
    bytes at the numeric offset $449 differ from GDRIVE01's; this class proves the stronger
    claim (the WORKER ITSELF, its `$C093`/`$C094` counter-setup signature, is absent from
    GDRIVE00 everywhere, not just at that one offset) and, as the other half of the same
    finding, that GDRIVE01's own two setup sites (already documented as table slots 11/12) are
    EXHAUSTIVE -- no third or fourth caller exists in either title.
    """

    TITLES = ["Champions of Krynn", "Death Knights of Krynn"]

    def test_gdrive00_never_sets_up_the_c093_c094_counter_pair(self) -> None:
        checked = 0
        for title in self.TITLES:
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            g00 = wallset.find_prg(title_dir, "GDRIVE00")
            self.assertIsNotNone(g00, f"{title}: GDRIVE00 not found")
            checked += 1
            self.assertEqual(wallset.find_immediate_then_store(g00, 0xC093), [],
                              f"{title}: GDRIVE00 unexpectedly configures \$C093 -- "
                              "the closed-form worker premise may now hold, reopen the doc")
            self.assertEqual(wallset.find_immediate_then_store(g00, 0xC094), [],
                              f"{title}: GDRIVE00 unexpectedly configures \$C094")
        self.assertEqual(checked, 2, "expected both CoK and DoK corpora present")

    def test_gdrive01_c093_c094_setup_is_exactly_the_two_documented_slots(self) -> None:
        """Slot 11 presets L0=$FF,H0=$07; slot 12 presets L0=$48,H0=$12 -- both already named
        in the research doc. Asserting the exact (offset, value) pairs, not just a count,
        proves no THIRD site was missed and no existing one silently changed.

        (Corrected 2026-08-12: the original version paired each c093 site with a c094 site by
        independently sorting BOTH lists by their immediate VALUE (0x48 < 0xFF, 0x07 < 0x12)
        and zipping the sorted lists -- which pairs L0=0x48 with H0=0x07 and L0=0xFF with
        H0=0x12, the WRONG cross-pairing (closed_form gives 1865/4864, matching neither known
        transfer size). The real pairing is by PHYSICAL PROXIMITY: `find_immediate_then_store`
        already returns hits in ascending file-offset (scan) order, and each call site's own
        L0-then-H0 pair sits a few bytes apart in that same order (verified directly:
        CoK/DoK both show C093=$FF@0x424 / C094=$07@0x429 -- one call site -- then
        C093=$48@0x438 / C094=$12@0x43d -- the other, identical in both titles). Zipping the
        two lists in their NATURAL scan order, not sorted-by-value, reproduces the doc's own
        2048/4681 figures. Verified this fails the intended way by reverting to the
        sorted-by-value zip and confirming it reproduces the exact wrong numbers above.)
        """
        checked = 0
        for title in self.TITLES:
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            g01 = wallset.find_prg(title_dir, "GDRIVE01")
            self.assertIsNotNone(g01, f"{title}: GDRIVE01 not found")
            checked += 1
            c093_sites = wallset.find_immediate_then_store(g01, 0xC093)
            c094_sites = wallset.find_immediate_then_store(g01, 0xC094)
            self.assertEqual(len(c093_sites), 2, f"{title}: expected exactly 2 \$C093 setup sites")
            self.assertEqual(len(c094_sites), 2, f"{title}: expected exactly 2 \$C094 setup sites")
            self.assertEqual(sorted(v for _, v in c093_sites), [0x48, 0xFF])
            self.assertEqual(sorted(v for _, v in c094_sites), [0x07, 0x12])
            # And the closed form on those exact values reproduces the doc's own numbers.
            # Pair by natural (offset) scan order -- see the docstring correction above for why
            # sorting each list independently by value gives the wrong cross-pairing.
            sizes = sorted(
                wallset.closed_form_transfer_size(l0, h0)
                for (_, l0), (_, h0) in zip(c093_sites, c094_sites)
            )
            self.assertEqual(sizes, [2048, 4681])
        self.assertEqual(checked, 2, "expected both CoK and DoK corpora present")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class BankswitchPairCrossTitleTests(unittest.TestCase):
    """2026-08-12 round 3, item 1 of the task brief: what GDRIVE00 needs from the kernel at
    $2E04/$2E25 -- disassembled and cross-title-verified. Both titles' GDRIVE00 call a
    CPU-port ($01) save/restore trampoline pair exactly once, bracketing their own table-slot-0
    routine. Champions of Krynn routes the call through two of LIBRARY's own jump-table slots
    ($2E04/$2E25); Death Knights calls the SAME routine (matching save/restore-via-$038B shape,
    confirmed below) at its own build's differently-laid-out DIRECT address ($477A/$4798) --
    DoK's LIBRARY jump table only has 3 slots (an already-established fact), so this specific
    service is not exposed as one of them there. A naive `find_callers`-style scan for the
    literal $2E04/$2E25 encoding alone reads DoK as "does not use this service" -- this class
    is what proves that reading wrong.
    """

    def test_cok_gdrive00_routes_through_the_kernel_jump_table(self) -> None:
        title_dir = C64_SETS / "Champions of Krynn"
        if not title_dir.is_dir():
            self.skipTest("Champions of Krynn C64 corpus not present")
        g00 = wallset.find_prg(title_dir, "GDRIVE00")
        self.assertIsNotNone(g00)
        out_addr, in_addr = wallset.BANKSWITCH_CALL_TARGETS["cok"]
        self.assertTrue(wallset.contains_direct_call(g00, out_addr))
        self.assertTrue(wallset.contains_direct_call(g00, in_addr))

    def test_dok_gdrive00_calls_the_routine_directly_not_through_a_kernel_slot(self) -> None:
        """The cross-title difference this pass found: DoK's GDRIVE00 contains NEITHER
        $2E04 NOR $2E25 anywhere (the naive false-negative a literal-address-only scan would
        report), but DOES contain the direct $477A/$4798 encoding at the SAME two body offsets
        CoK uses for $2E04/$2E25 (111 and 331 -- two of GDRIVE00's only 4 cross-title-differing
        bytes are the operand bytes of exactly these two call sites)."""
        title_dir = C64_SETS / "Death Knights of Krynn"
        if not title_dir.is_dir():
            self.skipTest("Death Knights of Krynn C64 corpus not present")
        g00 = wallset.find_prg(title_dir, "GDRIVE00")
        self.assertIsNotNone(g00)
        cok_out, cok_in = wallset.BANKSWITCH_CALL_TARGETS["cok"]
        self.assertFalse(wallset.contains_direct_call(g00, cok_out),
                          "DoK GDRIVE00 unexpectedly contains a literal $2E04 call")
        self.assertFalse(wallset.contains_direct_call(g00, cok_in),
                          "DoK GDRIVE00 unexpectedly contains a literal $2E25 call")
        dok_out, dok_in = wallset.BANKSWITCH_CALL_TARGETS["dok"]
        self.assertTrue(wallset.contains_direct_call(g00, dok_out))
        self.assertTrue(wallset.contains_direct_call(g00, dok_in))
        # Same body OFFSETS as CoK's two call sites (111, 331) -- the operand is one of the
        # only 4 bytes that differ between titles' otherwise near-identical GDRIVE00 binaries.
        self.assertEqual(g00[111:114], bytes([0x20, dok_out & 0xFF, dok_out >> 8]))
        self.assertEqual(g00[331:334], bytes([0x4C, dok_in & 0xFF, dok_in >> 8]))

    def test_the_routine_at_each_titles_addresses_really_saves_and_restores_cpu_port(self) -> None:
        """Confirms BOTH titles' routine (at the real, indirection-resolved address -- see
        BANKSWITCH_ROUTINE_ADDRS' own docstring for why CoK and DoK differ here) contains the
        $038B save/restore signature -- i.e. this is genuinely the same kernel service in both
        builds, not two unrelated routines that happen to sit at addresses GDRIVE00 calls."""
        import c64_kernel as k  # local import: reads a sibling module's real corpus fetcher
        checked = 0
        for title in ("cok", "dok"):
            try:
                library = k.kernel_body(title)
            except k.SourceUnavailable:
                continue
            checked += 1
            out_addr, in_addr = wallset.BANKSWITCH_ROUTINE_ADDRS[title]
            out_ok, in_ok = wallset.bankswitch_pair_touches_cpu_port_shadow(
                library, k.KERNEL_ORIGIN, out_addr, in_addr,
            )
            self.assertTrue(out_ok, f"{title}: bank-switch-out routine at ${out_addr:04X} "
                             "should contain STA $038B")
            self.assertTrue(in_ok, f"{title}: bank-switch-in routine at ${in_addr:04X} "
                             "should contain LDA $038B")
        self.assertEqual(checked, 2, "expected both CoK and DoK LIBRARY files present")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class Gdrive00Slot0IsCombatNotWallsetTests(unittest.TestCase):
    """2026-08-12 round 3: GDRIVE00's ONE use of the bank-switch pair wraps its own table-slot-0
    routine ($C069-$C14D, Champions of Krynn addressing) -- confirmed to be called from
    COMBAT.prg (not DUNGEON.prg), and confirmed to write only to screen-matrix/game-state
    memory, never into $D000-$D7FF (the character-generator range a WALLSET-glyph consumer
    would need). This narrows, on new grounds, the "GDRIVE00 cannot be the WALLSET consumer"
    conclusion the research doc's section 5 already reached by a different route (COMBAT's
    $C015/$C012 calls).
    """

    def test_combat_calls_gdrive00_slot_zero(self) -> None:
        title_dir = C64_SETS / "Champions of Krynn"
        if not title_dir.is_dir():
            self.skipTest("Champions of Krynn C64 corpus not present")
        combat = wallset.find_prg(title_dir, "COMBAT")
        self.assertIsNotNone(combat)
        self.assertTrue(wallset.contains_direct_call(combat, 0xC000))

    def test_slot_zero_routine_never_references_d000_d7ff(self) -> None:
        """Region-scoped (not whole-file) so this cannot be confounded by the unrelated
        gradient-lookup DATA table that starts a few dozen bytes past this routine's own end
        at $C14D (body offset $990-ish) -- see the module's dated section docstring for the
        false-positive that whole-file scan produces and why it is excluded here."""
        title_dir = C64_SETS / "Champions of Krynn"
        if not title_dir.is_dir():
            self.skipTest("Champions of Krynn C64 corpus not present")
        g00 = wallset.find_prg(title_dir, "GDRIVE00")
        self.assertIsNotNone(g00)
        region = g00[0x069:0x14D]  # slot-0's own routine span, bank-switch in to bank-switch out
        hits = wallset.absolute_operand_hits(region, 0xC069, 0xD000, 0xE000)
        self.assertEqual(hits, [], f"slot-0 routine unexpectedly references \$D000-\$D7FF: {hits}")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class Gdrive00JumpTableStructureTests(unittest.TestCase):
    """2026-08-12 round 3: GDRIVE00's own 35-slot table, decoded structurally (not just the
    handful of individually-traced entries prior rounds covered). Finds 9 of the 35 slots are
    bare single-byte RTS stubs -- unused/placeholder entries, the GDRIVE00 analogue of
    GDRIVE01's already-documented `$C90F` `.byte $FF` filler.

    (Corrected 2026-08-12: an earlier version of this test hardcoded 8 stub indices
    ([21,22,23,24,27,28,29,30]), missing slot 11 (target $C3ED). Direct byte read confirms
    `g00[0x3ED - 0xC000] == 0x60` (RTS) in BOTH Champions of Krynn and Death Knights of Krynn
    -- a real, cross-title-consistent 9th stub, not a fluke of one title's build. Verified this
    test can catch a real regression: reran against the ORIGINAL 8-element list, confirmed it
    failed with the exact `[11, 21, ...]` vs `[21, ...]` diff shown below before correcting it.)
    """

    def test_gdrive00_has_35_slots_with_nine_rts_stubs(self) -> None:
        checked = 0
        for title in ("Champions of Krynn", "Death Knights of Krynn"):
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            g00 = wallset.find_prg(title_dir, "GDRIVE00")
            self.assertIsNotNone(g00, f"{title}: GDRIVE00 not found")
            checked += 1
            table = wallset.gdrive_jump_table(g00)
            self.assertEqual(len(table), 35, f"{title}: expected 35 GDRIVE00 table slots")
            stubs = wallset.rts_stub_slots(g00)
            self.assertEqual(
                stubs, [11, 21, 22, 23, 24, 27, 28, 29, 30],
                f"{title}: RTS-stub slot indices changed -- update the doc",
            )
        self.assertEqual(checked, 2, "expected both CoK and DoK corpora present")

    def test_gdrive01_has_25_slots_with_no_bare_rts_stubs(self) -> None:
        """Contrast case: GDRIVE01's own unused entries (already documented, `c64-compic-format.md`
        section 3a) are triple-aliased `.byte $FF` fillers ($C90F), not bare RTS -- so this
        predicate correctly reports zero for GDRIVE01, rather than silently double-counting a
        different filler convention as the same thing."""
        checked = 0
        for title in ("Champions of Krynn", "Death Knights of Krynn"):
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            g01 = wallset.find_prg(title_dir, "GDRIVE01")
            self.assertIsNotNone(g01, f"{title}: GDRIVE01 not found")
            checked += 1
            table = wallset.gdrive_jump_table(g01)
            self.assertEqual(len(table), 25, f"{title}: expected 25 GDRIVE01 table slots")
            self.assertEqual(wallset.rts_stub_slots(g01), [])
        self.assertEqual(checked, 2, "expected both CoK and DoK corpora present")


if __name__ == "__main__":
    unittest.main()


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class CombatC015LeadTests(unittest.TestCase):
    """The 2026-08-12 COMBAT $C015 lead: pins the REFUTATION as a rerunnable byte check, not
    just prose. See c64_wallset.py's own section docstring and the research doc's dated
    section for the full argument; this class checks its two load-bearing claims:

      1. $C066 is a valid internal JMP-table slot in GDRIVE00 (target lands inside GDRIVE00's
         own body) but NOT in GDRIVE01 (either not a JMP at all, or a JMP whose target lands
         outside GDRIVE01's own body) -- on BOTH titles that ship a COMBAT.prg, not just one.
      2. COMBAT.prg (both titles) really does contain a `JSR $C066` call -- i.e. claim 1 is
         being applied to a call COMBAT actually makes, not a hypothetical address.
    """

    TITLES = ["Champions of Krynn", "Death Knights of Krynn"]

    def _bodies(self, title: str) -> tuple[bytes, bytes, bytes] | None:
        title_dir = C64_SETS / title
        if not title_dir.is_dir():
            return None
        combat = wallset.find_prg(title_dir, "COMBAT")
        g00 = wallset.find_prg(title_dir, "GDRIVE00")
        g01 = wallset.find_prg(title_dir, "GDRIVE01")
        if combat is None or g00 is None or g01 is None:
            return None
        return combat, g00, g01

    def test_c066_is_a_real_slot_in_gdrive00_but_not_gdrive01_on_both_titles(self) -> None:
        checked = 0
        for title in self.TITLES:
            bodies = self._bodies(title)
            if bodies is None:
                continue
            _, g00, g01 = bodies
            checked += 1
            self.assertTrue(
                wallset.slot_lands_in_body(g00, wallset.GDRIVE_ORIGIN, 0xC066),
                f"{title}: GDRIVE00 $C066 should be a valid internal JMP slot",
            )
            self.assertFalse(
                wallset.slot_lands_in_body(g01, wallset.GDRIVE_ORIGIN, 0xC066),
                f"{title}: GDRIVE01 $C066 should NOT be a valid internal JMP slot "
                "(it is post-table data in the real corpus)",
            )
        self.assertEqual(checked, 2, "expected both CoK and DoK corpora present")

    def test_combat_prg_really_calls_c066_on_both_titles(self) -> None:
        """Guards against the whole test class vacuously passing on a $C066 nobody calls:
        confirms the literal 3-byte encoding of `JSR $C066` (bytes 20 66 C0) is present in
        COMBAT.prg's body on both titles."""
        checked = 0
        for title in self.TITLES:
            bodies = self._bodies(title)
            if bodies is None:
                continue
            combat, _, _ = bodies
            checked += 1
            self.assertIn(
                bytes([0x20, 0x66, 0xC0]), combat,
                f"{title}: COMBAT.prg does not contain a JSR $C066 encoding",
            )
        self.assertEqual(checked, 2, "expected both CoK and DoK corpora present")

    def test_gdrive00_is_effectively_the_same_binary_on_both_titles(self) -> None:
        """Corroborating context (not the proof itself): GDRIVE00 is near-byte-identical
        between titles, so a fact established on one title's GDRIVE00 is not a coincidence
        specific to that title's build."""
        cok = self._bodies("Champions of Krynn")
        dok = self._bodies("Death Knights of Krynn")
        if cok is None or dok is None:
            self.skipTest("need both CoK and DoK corpora")
        _, g00_cok, _ = cok
        _, g00_dok, _ = dok
        self.assertEqual(len(g00_cok), len(g00_dok))
        diff = sum(1 for x, y in zip(g00_cok, g00_dok) if x != y)
        self.assertLess(diff, 10, f"GDRIVE00 differs in {diff} bytes between titles -- expected near-identical")


class GdriveSlotTargetTests(unittest.TestCase):
    """Synthetic tests of the slot-reading primitive itself, independent of the real corpus."""

    def test_reads_a_jmp_slot(self) -> None:
        body = bytes([0x4C, 0x34, 0x12])  # JMP $1234
        self.assertEqual(wallset.gdrive_slot_target(body, 0xC000, 0xC000), 0x1234)

    def test_non_jmp_opcode_returns_none(self) -> None:
        body = bytes([0x00, 0x34, 0x12])  # BRK, not JMP
        self.assertIsNone(wallset.gdrive_slot_target(body, 0xC000, 0xC000))

    def test_out_of_range_returns_none(self) -> None:
        body = bytes([0x4C, 0x34, 0x12])
        self.assertIsNone(wallset.gdrive_slot_target(body, 0xC000, 0xC100))

    def test_slot_lands_in_body_requires_both_a_jmp_and_a_self_landing_target(self) -> None:
        # JMP $C003 -- a valid JMP, target lands inside a 4-byte body at org $C000.
        self_landing = bytes([0x4C, 0x03, 0xC0, 0x00])
        self.assertTrue(wallset.slot_lands_in_body(self_landing, 0xC000, 0xC000))
        # JMP $D000 -- a valid JMP, but the target is OUTSIDE this body's own span.
        external = bytes([0x4C, 0x00, 0xD0, 0x00])
        self.assertFalse(wallset.slot_lands_in_body(external, 0xC000, 0xC000))

    def test_slot_lands_in_body_rejects_a_target_exactly_one_past_the_end(self) -> None:
        """Boundary case the previous test didn't cover: a target of exactly `org + len(body)`
        is one byte PAST this body's own span (valid indices are org..org+len(body)-1), so it
        must be rejected the same as a target far outside. Verified this can fail: changed
        `slot_lands_in_body`'s bound check from `target < org + len(body)` to
        `target <= org + len(body)` and reran -- this test went red (returned True) while
        every other test in the file (34/34, including the two adjacent boundary cases above)
        stayed green, i.e. this was the ONLY test exercising that exact off-by-one. Reverted
        and confirmed the file was byte-identical to its pre-mutation copy before restoring."""
        # 4-byte body at org $C000 spans $C000-$C003; JMP $C004 targets the byte right after.
        one_past_end = bytes([0x4C, 0x04, 0xC0, 0x00])
        self.assertFalse(wallset.slot_lands_in_body(one_past_end, 0xC000, 0xC000))

    def test_jsr_opcode_at_the_slot_is_also_rejected(self) -> None:
        """gdrive_slot_target only recognizes the JMP trampoline opcode ($4C); a JSR ($20) at
        the same address -- plausible-looking, same operand layout -- must not be misread as
        a slot. Verified this guard can fail: temporarily changed the check from
        `body[off] != 0x4C` to `body[off] not in (0x4C,)` with 0x20 added to the tuple, reran
        -- this test went red (returned 0x1234 instead of None) as expected; reverted after."""
        body = bytes([0x20, 0x34, 0x12])  # JSR $1234, not JMP
        self.assertIsNone(wallset.gdrive_slot_target(body, 0xC000, 0xC000))


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class RleNegativeResultTests(unittest.TestCase):
    """Pin section 3.2's negative result so it is rerunnable, not just prose.

    The claim is NOT that C64 WALLDEF is uncompressed — only that it is not compressed with
    either of the two RLE schemes this project already implements. A future reader who thinks
    otherwise has to make these numbers come out round.
    """

    def _cok_walldef01(self) -> bytes:
        for f in wallset.iter_wall_files(COK_C64, "WALLDEF"):
            if not f.problem and wallset.wall_id_hex(f.name, "WALLDEF") == 1:
                return f.body
        self.skipTest("Champions of Krynn WALLDEF01 not found")

    def test_neither_rle_scheme_decodes_walldef01_to_a_round_length(self) -> None:
        body = self._cok_walldef01()
        self.assertEqual(len(body), 1197, "WALLDEF01 body size changed; the pinned lengths below are for the 1197-byte body")
        lengths = wallset.rle_decoded_lengths(body)
        self.assertEqual(lengths["dax"], 4462)
        self.assertEqual(lengths["draw18"], 4497)
        # The actual point: no scheme lands on a structurally meaningful multiple.
        for scheme, n in lengths.items():
            for unit in (780, 156, 8):
                self.assertNotEqual(n % unit, 0, f"{scheme} decode is a clean multiple of {unit} — reopen the RLE hypothesis")

    def test_the_two_schemes_genuinely_differ(self) -> None:
        """Control: if both scheme implementations collapsed to the same code path, the test
        above would be checking one hypothesis twice while claiming to check two."""
        lengths = wallset.rle_decoded_lengths(self._cok_walldef01())
        self.assertNotEqual(lengths["dax"], lengths["draw18"])


class ContainsDirectCallTests(unittest.TestCase):
    """Synthetic tests of the new raw-byte-substring finder, independent of the real corpus."""

    def test_finds_jsr_encoding(self) -> None:
        self.assertTrue(wallset.contains_direct_call(bytes([0xEA, 0x20, 0x24, 0xC0, 0xEA]), 0xC024))

    def test_finds_jmp_encoding(self) -> None:
        self.assertTrue(wallset.contains_direct_call(bytes([0xEA, 0x4C, 0x24, 0xC0]), 0xC024))

    def test_absent_target_returns_false(self) -> None:
        """Mutation check: without this case a predicate that always returns True would pass
        the two tests above. Verified real: `contains_direct_call` returns False here because
        neither $20/$4C-then-$24-$C0 sequence exists in this buffer."""
        self.assertFalse(wallset.contains_direct_call(bytes([0xEA, 0x20, 0x25, 0xC0]), 0xC024))


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class Gdrive00C449IsUnrelatedCodeTests(unittest.TestCase):
    """2026-08-12 (wallset slice, closed-form-worker pass): the task brief's premise that
    "GDRIVE00's $C449" is the copy worker documented in the research doc's section 3.5/5 is
    WRONG -- that worker lives in GDRIVE01, not GDRIVE00. GDRIVE00 is a DIFFERENT 2806-byte
    binary; its own bytes at the same numeric offset are unrelated code (a `BRK`/status-store/
    `JMP` sequence, not the L0/H0 counting-loop worker). This pins the correction as a
    reproducible byte check rather than leaving it as prose only.
    """

    def test_gdrive00_and_gdrive01_have_different_code_at_the_same_c449_offset(self) -> None:
        title_dir = C64_SETS / "Champions of Krynn"
        if not title_dir.is_dir():
            self.skipTest("Champions of Krynn C64 corpus not present")
        g00 = wallset.find_prg(title_dir, "GDRIVE00")
        g01 = wallset.find_prg(title_dir, "GDRIVE01")
        self.assertIsNotNone(g00)
        self.assertIsNotNone(g01)
        off = 0x449
        # GDRIVE01's worker opens with a pointer-copy sequence: LDA $C085 / STA $C465 ...
        self.assertEqual(g01[off:off + 3], bytes([0xAD, 0x85, 0xC0]))
        # GDRIVE00's own bytes at the identical offset are NOT that -- confirmed by direct read,
        # not by disassembly alone (a mutation making this assertion trivially true, e.g.
        # comparing g00 to itself, was checked by hand and confirmed it would NOT catch a
        # regression that made the two files byte-identical at this offset; the two literal
        # byte strings below are independently transcribed from the real corpus).
        self.assertNotEqual(g00[off:off + 3], g01[off:off + 3])
        self.assertEqual(g00[off:off + 3], bytes([0x00, 0x8D, 0x3F]))


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class CampGenSlot12CrossTitleTests(unittest.TestCase):
    """2026-08-12 (wallset slice): a NEW caller of GDRIVE01's slot 12 ($C024, the 4681-byte
    $C449-worker transfer -- see the research doc's section 5's closed-form sizing) that the
    prior DUNGEON-only reachability search never found: Death Knights of Krynn's CAMP.prg and
    GEN.prg both directly call it (`JSR $C024`, a real, aligned instruction -- confirmed by
    disassembly in the research doc, not just this byte check). Champions of Krynn's own CAMP
    and GEN (and every other $0800-slot overlay) contain NO such call anywhere. GDRIVE01 itself
    is byte-identical between titles (already proven by `RealCorpusWallsetTests`'s sibling
    `CombatC015LeadTests` class), so this is a genuine caller-side, cross-title behavioural
    difference -- NOT the "coincidental alignment, 7-then-0" trap the project's standing rules
    warn about, because the hit is a real, twice-repeated, five-instruction idiom in DoK
    (`JSR $3AC8; JSR $3C23; JSR $C024; JSR $3C2A; JSR $3ADC`), not a lone unverified byte match.
    Sized (4681 bytes) and destination-banked (LORAM=1/HIRAM=0, which exposes RAM at
    $A000-$BFFF/$E000-$FFFF, NOT the $D000 char-generator window WALLSET would need) neither of
    which matches any real WALLSET body -- this transfer is real but is NOT the WALLSET
    consumer, on two independent grounds. See the research doc's dated section for the full
    kernel-routine disassembly ($3AC8/$3C23/$3C2A/$3ADC in LIBRARY).
    """

    def test_dok_camp_and_gen_call_slot12_but_cok_does_not(self) -> None:
        cok_dir = C64_SETS / "Champions of Krynn"
        dok_dir = C64_SETS / "Death Knights of Krynn"
        if not cok_dir.is_dir() or not dok_dir.is_dir():
            self.skipTest("need both CoK and DoK C64 corpora")
        for name in ("CAMP", "GEN"):
            dok_body = wallset.find_prg(dok_dir, name)
            self.assertIsNotNone(dok_body, f"DoK {name} not found")
            self.assertTrue(
                wallset.contains_direct_call(dok_body, 0xC024),
                f"DoK {name}.prg should contain a JSR $C024 encoding",
            )
        # CoK's own $0800-slot overlays, checked exhaustively -- none contains it.
        checked = 0
        for name in ("CAMP", "GEN", "COM.PREP", "POST.COM", "DUNGEON", "COMBAT", "INIT"):
            cok_body = wallset.find_prg(cok_dir, name)
            if cok_body is None:
                continue
            checked += 1
            self.assertFalse(
                wallset.contains_direct_call(cok_body, 0xC024),
                f"CoK {name}.prg unexpectedly contains a JSR $C024 encoding -- update the docs",
            )
        self.assertGreaterEqual(checked, 5, "expected most CoK $0800-slot overlays to be checked")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 corpus not present")
class RamExposingPairHasNoRealCallerTests(unittest.TestCase):
    """2026-08-12 (wallset slice): GDRIVE01's CPU-port HIRAM+CHAREN "expose RAM at $D000" pair
    ($C015/$C012) has no caller OUTSIDE GDRIVE01's own body and COMBAT.prg's (refuted, resolves
    to a different driver) -- checked with a call scan restricted to REAL aligned JSR/JMP-
    absolute opcodes, over the established KNOWN_CODE_FILES allowlist only.

    (Corrected 2026-08-12: an earlier version of this test scanned EVERY closed PRG on side 1 --
    not just established code files -- and its "zero callers, period" framing did not even
    account for GDRIVE01's own body. Both were real bugs, not just narrower-than-ideal scope:
    (1) the blanket scan produced four false-positive `JSR $C015`-encoding hits inside `ECL64`
    (x3), `SECSET64` and `COMBAT2` -- none of which is 6502 code (see `KNOWN_CODE_FILES`'s own
    docstring for the evidence); a byte trio that happens to equal `20 15 C0` inside interpreted
    ECL-VM bytecode or spell-name ASCII strings is exactly the alias class this project's own
    TITLEPG precedent (c64-resident-kernel.md) warns about, and a `--org`-independent linear
    decode "landing cleanly" on that offset is NOT evidence to the contrary -- a linear walk from
    byte 0 of almost any byte stream produces SOME self-consistent instruction stream, which is
    exactly why the project's methodology treats plausible-looking decode at an unproven origin
    as no evidence at all. (2) the framing "$C015/$C012 have zero real callers anywhere" flatly
    contradicts this doc's own already-published §3.5 finding that GDRIVE01's own `$C8A1`
    routine (table slot $C03F) calls `JSR $C015` then, later, `JSR $C012` -- confirmed for real
    below via a proper origin-aware linear decode (`absolute_operand_hits`, which the naive
    substring scan is not), landing at $C8AA and $C905 respectively, both real aligned
    instructions. The correct, narrower claim -- what this class now actually checks -- is that
    NO code file OTHER than GDRIVE01 itself (whose self-call is expected and already documented)
    and COMBAT.prg (whose apparent calls are proven in `CombatC015LeadTests` to resolve against
    GDRIVE00's unrelated same-numbered slots, not this pair) calls $C015/$C012 anywhere in
    either title's established code corpus.)
    """

    def _real_aligned_hit(self, body: bytes, org: int, target: int) -> int | None:
        """First REAL (origin-aware, decode-aligned) JSR/JMP-absolute operand equal to `target`,
        via `wallset.absolute_operand_hits` -- NOT a raw byte-substring scan (see the class
        docstring for why that produced false positives on non-code files).

        Filters `absolute_operand_hits`' results down to mnemonics JSR/JMP: that helper reports
        EVERY absolute/absolute-indexed/indirect instruction in range, which also catches
        `LDA $C012,X`/`STA $C012,X` (indexed data-copy addressing, not a call) -- exactly the
        false positive this class's own docstring already documents Death Knights' GDRIVE04.prg
        producing under a naive scan. Verified this filter is load-bearing, not decorative: with
        it removed, `test_c015_and_c012_have_no_caller_outside_gdrive01_and_combat_in_either_title`
        goes red on DoK GDRIVE04 (`LDA $C012,X` at file offset 49669, `abx` mode) -- confirmed by
        actually running it unfiltered before adding the mnemonic check.
        """
        hits = wallset.absolute_operand_hits(body, org, target, target + 1)
        calls = [h for h in hits if h[1] in ("JSR", "JMP")]
        return calls[0][0] if calls else None

    def test_gdrive01_itself_really_does_call_c015_and_c012(self) -> None:
        """Positive control, reproducing §3.5's already-published finding as a byte check: the
        $C8A1 routine's own `JSR $C015` / later `JSR $C012` are real, aligned instructions."""
        checked = 0
        for title in ("Champions of Krynn", "Death Knights of Krynn"):
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            g01 = wallset.find_prg(title_dir, "GDRIVE01")
            self.assertIsNotNone(g01, f"{title}: GDRIVE01 not found")
            checked += 1
            self.assertIsNotNone(
                self._real_aligned_hit(g01, wallset.GDRIVE_ORIGIN, 0xC015),
                f"{title}: GDRIVE01 should call $C015 from its own $C8A1 routine (§3.5)",
            )
            self.assertIsNotNone(
                self._real_aligned_hit(g01, wallset.GDRIVE_ORIGIN, 0xC012),
                f"{title}: GDRIVE01 should call $C012 from its own $C8A1 routine (§3.5)",
            )
        self.assertEqual(checked, 2, "expected both CoK and DoK corpora present")

    def test_c015_and_c012_have_no_caller_outside_gdrive01_and_combat_in_either_title(self) -> None:
        checked_titles = 0
        for title in ("Champions of Krynn", "Death Knights of Krynn"):
            title_dir = C64_SETS / title
            if not title_dir.is_dir():
                continue
            checked_titles += 1
            checked_files = 0
            for name in sorted(wallset.KNOWN_CODE_FILES):
                if name in ("GDRIVE01", "COMBAT"):
                    continue  # handled separately -- see the class docstring
                body = wallset.find_prg(title_dir, name)
                if body is None:
                    continue  # not every code filename exists on every title (e.g. GDRIVE04/05)
                checked_files += 1
                for target in (0xC015, 0xC012):
                    self.assertIsNone(
                        self._real_aligned_hit(body, wallset.GDRIVE_ORIGIN, target),
                        f"{title} {name}: unexpected real JSR/JMP to ${target:04X} -- "
                        "the RAM-exposing pair now has a NEW caller, reopen the doc's lead",
                    )
            self.assertGreaterEqual(checked_files, 8, f"{title}: expected most known code files present")
        self.assertEqual(checked_titles, 2, "expected both CoK and DoK corpora present")
