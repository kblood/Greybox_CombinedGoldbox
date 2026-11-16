#!/usr/bin/env python3
"""Tests for the C64 SPRITE decoder.

Every assertion here was checked against a deliberate mutation before being trusted, per this
project's rule that a probe is not evidence until it has been seen failing:

- `test_a_five_byte_rotation_breaks_the_trailer_signature` mutates a real trailer-dialect file's
  body by a 5-byte rotation and shows framing() now raises -- proving the byte-10 signature check
  is load-bearing, not decorative. Confirmed by hand: without the `trailer[10] == 0x03` check the
  rotated body would still satisfy `(n - 16) % 64 == 0` and silently decode as a different,
  wrong 13-frame split.
- `test_hires_beats_multicolour_on_the_whole_corpus` is the format's central empirical claim (see
  the module docstring). `test_forcing_multicolour_globally_reverses_the_corpus_verdict` proves
  this claim is falsifiable by forcing every frame to multicolour and showing the aggregate flips.
- `test_known_pictures_render_byte_for_byte_as_inspected` pins exact renders; any drift in the
  block boundaries, the frame count, or the palette changes these hashes.
"""

from __future__ import annotations

import hashlib
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disasm as disasm  # noqa: E402
import c64_disk as c64  # noqa: E402
import c64_kernel as ck  # noqa: E402
import c64_sprite as S  # noqa: E402

C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")

# Every title known to ship SPRITE files, and the one known exception (Gateway ships none).
SPRITE_TITLES = [
    "Buck Rogers - Countdown to Doomsday",
    "Champions of Krynn",
    "Curse of the Azure Bonds",
    "Death Knights of Krynn",
    "Pool of Radiance",
    "Secret of the Silver Blades",
]

# One file, one title: Death Knights of Krynn SPRITE62 has an 850-byte (848-body) file whose
# would-be trailer bytes 10-12 are "3f 3f 3f" instead of the "03 xx yy" every other trailer-dialect
# file in the whole corpus carries, and its directory block count is 0 (every other SPRITE entry's
# block count is nonzero). It is recorded as an unrecognized anomaly rather than forced to parse --
# see docs/engine/research/c64-sprite-format.md.
KNOWN_ANOMALY = ("Death Knights of Krynn", "SPRITE62")


def _title_files(title: str) -> dict[str, bytes]:
    """Every readable SPRITE PRG in a title's disk set, first side winning on duplicates."""
    out: dict[str, bytes] = {}
    for img in sorted((C64_SETS / title).glob("*.[Dd]64")):
        for name, data in S.disk_files(img).items():
            if name.startswith("SPRITE"):
                out.setdefault(name, data)
    return out


class LayoutTests(unittest.TestCase):
    """Pure arithmetic and pixel decoding -- no disk images needed."""

    def test_bare_dialect_is_an_exact_multiple_of_the_block_size(self) -> None:
        body = bytes(64 * 5)
        fr = S.framing(body)
        self.assertEqual(fr, S.Framing("bare", 5, 0, b""))

    def test_trailer_dialect_needs_the_byte_10_signature(self) -> None:
        good = bytes(64 * 13) + bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x03, 0x0F, 0x3F, 0, 0, 0])
        fr = S.framing(good)
        self.assertEqual((fr.kind, fr.frame_count), ("trailer", 13))

        # Same length (13*64+16 = 848), but byte 10 is 0x00, not 0x03. It must not be silently
        # accepted as a (wrongly split) trailer: 848 - 13 = 835, which is not a multiple of 64
        # either, so this body has no valid dialect at all and framing() must raise.
        bad = bytes(64 * 13) + bytes(16)
        with self.assertRaises(ValueError):
            S.framing(bad)

    def test_header_dialect_is_thirteen_bytes_then_whole_blocks(self) -> None:
        body = bytes(13) + bytes(64 * 7)
        fr = S.framing(body)
        self.assertEqual(fr, S.Framing("header", 7, 13, bytes(13)))

    def test_an_unrecognized_length_raises_rather_than_guesses(self) -> None:
        for n in (0, 1, 63, 65, 100, 849):
            with self.assertRaises(ValueError):
                S.framing(bytes(n))

    def test_frames_reads_the_right_slice_for_each_dialect(self) -> None:
        # trailer: frame 0 is body[0:64], frame 12 is body[768:832]
        marker = bytes([0xAB]) + bytes(63)
        trailer_body = marker + bytes(64 * 11) + bytes([0xCD]) + bytes(63) + \
            bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x03, 0x0F, 0x3F, 0, 0, 0])
        prg = b"\x00\x40" + trailer_body
        fr = S.frames(prg)
        self.assertEqual(len(fr), 13)
        self.assertEqual(fr[0][0], 0xAB)
        self.assertEqual(fr[12][0], 0xCD)

        # header: frame 0 starts right after the 13-byte header
        header_body = bytes(13) + bytes([0xEF]) + bytes(63)
        prg2 = b"\x00\x40" + header_body
        fr2 = S.frames(prg2)
        self.assertEqual(len(fr2), 1)
        self.assertEqual(fr2[0][0], 0xEF)

    def test_hires_decodes_msb_first(self) -> None:
        # Deliberately asymmetric (not a palindrome): a bit-order mutation must change idx[0] and
        # idx[7] differently, or this test cannot tell MSB-first from LSB-first apart.
        block = bytes([0b10000000] + [0] * 2) + bytes(63 - 3)
        idx = S.hires_indices(block)
        self.assertEqual(idx[0], 1, "bit 7 (MSB) should map to pixel column 0")
        self.assertEqual(idx[7], 0, "bit 0 (LSB) should map to pixel column 7, not column 0")

    def test_multicolour_doubles_each_2_bit_symbol_in_x(self) -> None:
        block = bytes([0b11000000] + [0] * 2) + bytes(63 - 3)
        idx = S.multicolour_indices(block)
        self.assertEqual(idx[0], 3)
        self.assertEqual(idx[1], 3)
        self.assertEqual(idx[2], 0)

    def test_the_64th_byte_is_never_read_by_the_hires_decoder(self) -> None:
        a = bytes(63) + bytes([0x00])
        b = bytes(63) + bytes([0xFF])
        self.assertEqual(S.hires_indices(a), S.hires_indices(b))

    def test_find_param_block_refs_detects_a_genuine_injected_reference(self) -> None:
        """Mutation control for the corpus search below: prove the scanner CAN find a real
        reference before trusting that it found none in the real overlays."""
        body = bytes([0xEA] * 10) + bytes([0x8D, 0x87, 0xC0]) + bytes([0xEA] * 10)  # STA $C087
        self.assertEqual(S.find_param_block_refs(body), [10])

    def test_find_param_block_refs_is_empty_on_a_clean_body(self) -> None:
        self.assertEqual(S.find_param_block_refs(bytes([0xEA] * 40)), [])

    def test_find_selfmod_patch_target_refs_detects_a_genuine_injected_reference(self) -> None:
        """Mutation control, same shape as the param-block one above: prove the scanner CAN find
        a real reference to one of GDRIVE01's internal self-modifying operand pairs before
        trusting a corpus-wide sweep that finds none."""
        body = bytes([0xEA] * 10) + bytes([0x8D, 0x63, 0xC7]) + bytes([0xEA] * 10)  # STA $C763
        self.assertEqual(S.find_selfmod_patch_target_refs(body), [10])

    def test_find_selfmod_patch_target_refs_is_empty_on_a_clean_body(self) -> None:
        self.assertEqual(S.find_selfmod_patch_target_refs(bytes([0xEA] * 40)), [])

    def test_find_gdrive00_exclusive_tail_refs_detects_a_genuine_injected_reference(self) -> None:
        """Mutation control, same shape as the two scanners above: prove the discriminator CAN
        find a real reference to the GDRIVE00-only tail entries ($C04B-$C066) before trusting a
        corpus sweep that uses it to settle a residency question."""
        body = bytes([0xEA] * 10) + bytes([0x20, 0x4E, 0xC0]) + bytes([0xEA] * 10)  # JSR $C04E
        self.assertEqual(S.find_gdrive00_exclusive_tail_refs(body), [10])

    def test_find_gdrive00_exclusive_tail_refs_is_empty_on_a_clean_body(self) -> None:
        self.assertEqual(S.find_gdrive00_exclusive_tail_refs(bytes([0xEA] * 40)), [])

    def test_gdrive00_exclusive_tail_does_not_overlap_gdrive01_table_span(self) -> None:
        """The whole disambiguation depends on these two ranges being disjoint -- pin it as
        arithmetic so a future edit to either constant can't silently reintroduce the ambiguity
        the discriminator exists to resolve."""
        self.assertEqual(set(S.GDRIVE01_TABLE_SPAN) & set(S.GDRIVE00_EXCLUSIVE_TAIL), set())
        self.assertEqual((min(S.GDRIVE01_TABLE_SPAN), max(S.GDRIVE01_TABLE_SPAN)), (0xC000, 0xC048))
        self.assertEqual((min(S.GDRIVE00_EXCLUSIVE_TAIL), max(S.GDRIVE00_EXCLUSIVE_TAIL)),
                          (0xC04B, 0xC066))

    def test_illegal_opcode_fraction_is_zero_on_all_nop(self) -> None:
        self.assertEqual(S.illegal_opcode_fraction(bytes([0xEA] * 20)), 0.0)

    def test_illegal_opcode_fraction_counts_undefined_bytes(self) -> None:
        # 0x02 is an undefined NMOS opcode; 4 illegal bytes among 4 decoded "instructions"
        # (each undefined byte consumes exactly 1 byte) -> 4/4 = 1.0
        self.assertEqual(S.illegal_opcode_fraction(bytes([0x02, 0x02, 0x02, 0x02])), 1.0)

    def test_run_score_is_length_over_run_count(self) -> None:
        # a single unbroken run scores the row's full length
        self.assertAlmostEqual(S.run_score([[1, 1, 1, 1]]), 4.0)
        # fully alternating scores 1.0 (a run of length 1 for every symbol)
        self.assertAlmostEqual(S.run_score([[0, 1, 0, 1]]), 1.0)

    # -- 2026-08-12 (absent-names slice): decode-aligned generic-loader-call scanner ------------

    def test_decode_all_walks_instruction_boundaries_not_raw_bytes(self) -> None:
        # LDA #$03 (2 bytes) ; JSR $1234 (3 bytes) ; RTS (1 byte)
        body = bytes([0xA9, 0x03, 0x20, 0x34, 0x12, 0x60])
        instrs = S.decode_all(body, 0x0800)
        self.assertEqual([(addr, op) for addr, op, *_ in instrs],
                          [(0x0800, 0xA9), (0x0802, 0x20), (0x0805, 0x60)])

    def test_decode_all_marks_undefined_opcodes_illegal_without_raising(self) -> None:
        body = bytes([0x02, 0xEA])  # 0x02 is an undefined NMOS opcode; 0xEA is NOP
        instrs = S.decode_all(body, 0x0800)
        self.assertIsNone(instrs[0][2], "undefined opcode should decode with mode=None")
        self.assertEqual(instrs[0][3], 1)
        self.assertEqual(instrs[1][1], 0xEA)

    def test_resolve_x_follows_tax_back_to_the_immediate_that_fed_it(self) -> None:
        """The one indirect X-setting shape this corpus actually uses (COM.PREP's/COMPREP's own
        GDRIVE00 request: `LDA #$00; TAX; JSR`) -- TAX carries no operand of its own, so a naive
        one-hop lookup would silently report X as unresolved for a real X=0 case."""
        body = bytes([0xA9, 0x00, 0xAA, 0x20, 0x42, 0x41])
        instrs = S.decode_all(body, 0x0800)
        jsr_idx = 2  # the JSR is the 3rd decoded instruction (index 2)
        self.assertEqual(S._resolve_x(instrs, jsr_idx), ("TAX<-LDA#0", 0))

    def test_resolve_x_reports_none_when_nothing_sets_x_in_the_lookback_window(self) -> None:
        body = bytes([0xEA] * 20) + bytes([0x20, 0x42, 0x41])
        instrs = S.decode_all(body, 0x0800)
        self.assertEqual(S._resolve_x(instrs, len(instrs) - 1), (None, None))

    def test_scan_generic_loader_call_sites_finds_a_synthetic_gdrive_request(self) -> None:
        # LDX #$00 ; LDA #$01 ; JSR $4142 (cok's cache_check_preset)
        body = bytes([0xA2, 0x00, 0xA9, 0x01, 0x20, 0x42, 0x41])
        rows = S.scan_generic_loader_call_sites({"SYN": body}, "cok")
        self.assertEqual(len(rows), 1)
        name, addr, entry, xdesc, xval, adesc, aval = rows[0]
        self.assertEqual((name, entry, xval, adesc, aval),
                          ("SYN", "cache_check_preset", 0, "LDA #imm", 1))

    def test_scan_generic_loader_call_sites_excludes_a_pinned_false_positive(self) -> None:
        """Reproduces one of the real ASCII-text-alias false positives at its exact pinned
        offset, synthetically, and confirms the scanner drops it (see
        GENERIC_LOADER_DECODE_ALIGNED_FALSE_POSITIVES's own docstring for the real corpus
        finding this constant is built from)."""
        (name, addr), _text = next(iter(S.GENERIC_LOADER_DECODE_ALIGNED_FALSE_POSITIVES["cok"].items()))
        off = addr - 0x0800
        body = bytes([0xEA] * off) + bytes([0x20, 0x42, 0x41])
        rows = S.scan_generic_loader_call_sites({name: body}, "cok")
        self.assertEqual(rows, [], "a pinned false positive should never surface as a real hit")
        # sanity: the SAME body under a name/address NOT in the false-positive table DOES surface
        rows2 = S.scan_generic_loader_call_sites({"UNRELATED": body}, "cok")
        self.assertEqual(len(rows2), 1, "the exclusion should be keyed on (file, address), not "
                          "on the bytes alone")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class CorpusTests(unittest.TestCase):
    """The layout and mode heuristic against every SPRITE file in the corpus."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.titles: dict[str, dict[str, bytes]] = {}
        for title in SPRITE_TITLES:
            if (C64_SETS / title).is_dir():
                cls.titles[title] = _title_files(title)
        if not cls.titles:
            raise unittest.SkipTest("no SPRITE-bearing title sets present")

    def _files(self):
        for title, files in sorted(self.titles.items()):
            for name, data in sorted(files.items()):
                yield title, name, data

    def test_gateway_ships_no_sprite_files(self) -> None:
        d = C64_SETS / "Gateway to the Savage Frontier"
        if not d.is_dir():
            self.skipTest("Gateway to the Savage Frontier absent")
        found = _title_files("Gateway to the Savage Frontier")
        self.assertEqual(found, {}, "Gateway now ships SPRITE files -- update the docs")

    def test_every_sprite_file_classifies_except_the_one_known_anomaly(self) -> None:
        bad = []
        classified = 0
        for title, name, data in self._files():
            try:
                S.framing(S.body(data))
                classified += 1
            except ValueError:
                bad.append((title, name))
        self.assertEqual(sorted(bad), sorted([KNOWN_ANOMALY] if
                          KNOWN_ANOMALY[0] in self.titles and
                          KNOWN_ANOMALY[1] in self.titles.get(KNOWN_ANOMALY[0], {}) else []))
        self.assertGreater(classified, 100, "corpus coverage looks far too small")

    def test_pool_of_radiance_is_always_the_bare_dialect(self) -> None:
        files = self.titles.get("Pool of Radiance")
        if not files:
            self.skipTest("Pool of Radiance absent")
        for name, data in files.items():
            fr = S.framing(S.body(data))
            self.assertEqual(fr.kind, "bare", f"{name} is not bare")
            self.assertTrue(1 <= fr.frame_count <= 13, f"{name} frame count {fr.frame_count}")

    def test_secret_of_the_silver_blades_is_always_the_header_dialect(self) -> None:
        files = self.titles.get("Secret of the Silver Blades")
        if not files:
            self.skipTest("Secret of the Silver Blades absent")
        for name, data in files.items():
            fr = S.framing(S.body(data))
            self.assertEqual(fr.kind, "header", f"{name} is not header")
            self.assertIn(fr.frame_count, (7, 13), f"{name} frame count {fr.frame_count}")

    def test_trailer_dialect_titles_always_ship_thirteen_frames(self) -> None:
        for title in ("Champions of Krynn", "Death Knights of Krynn",
                      "Buck Rogers - Countdown to Doomsday", "Curse of the Azure Bonds"):
            files = self.titles.get(title)
            if not files:
                continue
            for name, data in files.items():
                if (title, name) == KNOWN_ANOMALY:
                    continue
                fr = S.framing(S.body(data))
                self.assertEqual(fr.kind, "trailer", f"{title}/{name} is not trailer")
                self.assertEqual(fr.frame_count, 13, f"{title}/{name} frame count")

    def test_trailer_byte_10_is_always_3_by_construction(self) -> None:
        """framing() only accepts a trailer body when byte 10 is 0x03 -- this test exists so a
        change loosening that check cannot silently start accepting different-shaped trailers."""
        for title, name, data in self._files():
            if (title, name) == KNOWN_ANOMALY:
                continue
            try:
                fr = S.framing(S.body(data))
            except ValueError:
                continue
            if fr.kind == "trailer":
                self.assertEqual(fr.meta[10], 0x03, f"{title}/{name}")

    def test_hires_beats_multicolour_on_the_whole_corpus(self) -> None:
        """The format's central empirical claim: see the module docstring for the disassembly
        context and per-title counts this pins (roughly 9:1 in favour of hires everywhere)."""
        hires_wins = multi_wins = 0
        for title, name, data in self._files():
            try:
                fr_frames = S.frames(data)
            except ValueError:
                continue
            for block in fr_frames:
                if not any(block):
                    continue
                hs, ms = S.hires_run_score(block), S.multicolour_run_score(block)
                if hs > ms:
                    hires_wins += 1
                elif ms > hs:
                    multi_wins += 1
        self.assertGreater(hires_wins, 0)
        self.assertGreater(hires_wins, multi_wins * 3,
                            f"hires={hires_wins} multi={multi_wins} -- corpus verdict changed")

    def test_sprtp_is_bare_dialect_sprite_family_data_not_code(self) -> None:
        """SPR.TP isn't named SPRITE*, so no scan above ever sees it, but its body is exactly
        64*7 = 448 bytes with no header or trailer -- ordinary bare-dialect SPRITE data, one of
        the 2026-08-11 doc's named remaining caller candidates, now confirmed rather than left as
        an aside. Read straight from the real disk images, both titles. Also pins the two caller
        scanners' own results against SPR.TP directly (2026-08-13 gap close): the doc's Sec 14.1
        claims both scanners were run against it and came back clean, but until now only
        `framing()` was pinned here -- WIDER_OVERLAYS never included SPR.TP because it isn't code,
        so `test_no_genuine_param_block_reference_in_the_wider_overlay_set` never touched it
        either. Confirmed by direct execution before adding this assertion (not assumed from the
        framing()==bare result alone, since bare-dialect pixel data could in principle still
        byte-alias a scanner hit the same way PIC-family files do elsewhere in this document)."""
        for title in ("Champions of Krynn", "Death Knights of Krynn"):
            img = C64_SETS / title / f"{title} - Side 1.D64"
            if not img.is_file():
                self.skipTest(f"{img} absent")
            disk = c64.read_image(img)
            entries = {e.name: e for e in c64.directory(disk)}
            self.assertIn("SPR.TP", entries, f"{title}: SPR.TP missing from directory")
            data, problem = c64.read_file_checked(disk, entries["SPR.TP"])
            self.assertIsNone(problem, f"{title}/SPR.TP: {problem}")
            fr = S.framing(S.body(data))
            self.assertEqual((fr.kind, fr.frame_count), ("bare", 7), f"{title}/SPR.TP")
            body = data[2:]
            self.assertEqual(S.find_param_block_refs(body), [], f"{title}/SPR.TP param_block")
            self.assertEqual(S.find_selfmod_patch_target_refs(body), [],
                              f"{title}/SPR.TP selfmod")

    def test_titlepg_scores_far_more_illegal_than_any_confirmed_code_overlay(self) -> None:
        """TITLEPG does not disassemble as coherent code starting at byte 0 (2026-08-11 doc note)
        -- pinned here as a real, falsifiable measurement rather than an eyeballed claim.
        Calibrated against four overlays this project independently confirmed are genuine code (by
        their own self-consistent JMP tables / call graphs, not by this metric): DUNGEON, COMBAT,
        LIBRARY, GDRIVE01. Verified non-vacuous by hand (not re-run here, see the doc's 2026-08-12
        section): slicing DUNGEON's own bytes to TITLEPG's length scores 11.4%, still code-like --
        so the metric tracks real content, not just file length."""
        KNOWN_CODE = ["DUNGEON", "COMBAT", "LIBRARY", "GDRIVE01"]
        for title in ("Champions of Krynn", "Death Knights of Krynn"):
            img = C64_SETS / title / f"{title} - Side 1.D64"
            if not img.is_file():
                self.skipTest(f"{img} absent")
            disk = c64.read_image(img)
            entries = {e.name: e for e in c64.directory(disk)}
            code_fracs = []
            for name in KNOWN_CODE:
                data, problem = c64.read_file_checked(disk, entries[name])
                self.assertIsNone(problem, f"{title}/{name}: {problem}")
                code_fracs.append(S.illegal_opcode_fraction(S.body(data)))
            titlepg, problem = c64.read_file_checked(disk, entries["TITLEPG"])
            self.assertIsNone(problem, f"{title}/TITLEPG: {problem}")
            titlepg_frac = S.illegal_opcode_fraction(S.body(titlepg))
            self.assertGreater(
                titlepg_frac, max(code_fracs) * 2,
                f"{title}: TITLEPG ({titlepg_frac:.3f}) no longer clearly non-code vs known "
                f"code overlays (max {max(code_fracs):.3f}) -- it may actually be code now")

    def test_swapping_the_two_scorers_reverses_the_corpus_verdict(self) -> None:
        """The mutation `test_hires_beats_multicolour_on_the_whole_corpus` was calibrated
        against, run for real: the two real scoring functions are used, just attributed to the
        opposite mode (hires's tally gets multicolour's score and vice versa). Same data, same
        per-frame scores, only the label is swapped -- and the corpus verdict flips hard (roughly
        9:1 the other way), proving the real test's `hires_wins > multi_wins * 3` assertion is not
        vacuously true."""
        swapped_hires_wins = swapped_multi_wins = 0
        for title, name, data in self._files():
            try:
                fr_frames = S.frames(data)
            except ValueError:
                continue
            for block in fr_frames:
                if not any(block):
                    continue
                real_hires_score = S.hires_run_score(block)
                real_multi_score = S.multicolour_run_score(block)
                # labels swapped: "hires" now gets multicolour's score and vice versa
                swapped_hires_score, swapped_multi_score = real_multi_score, real_hires_score
                if swapped_hires_score > swapped_multi_score:
                    swapped_hires_wins += 1
                elif swapped_multi_score > swapped_hires_score:
                    swapped_multi_wins += 1
        self.assertGreater(swapped_multi_wins, swapped_hires_wins * 3,
                            "expected the swapped labels to flip the corpus verdict")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class CallerSearchTests(unittest.TestCase):
    """2026-08-11: is GDRIVE01's sprite-compositor parameter-block caller (see
    docs/engine/research/c64-sprite-format.md section 4, and its 2026-08-11 addendum) in DUNGEON,
    COMBAT, COMBAT2 or CAMP? Read straight from the real disk images (side 1) and prove the
    negative result: zero genuine references to $C080-$C08F, with the one raw false-positive
    offset per title checked and pinned so it cannot silently start hiding a real hit."""

    OVERLAYS = ["DUNGEON", "COMBAT", "COMBAT2", "CAMP"]
    TITLES = ["Champions of Krynn", "Death Knights of Krynn"]

    # The one raw find_stores() hit in each title is proven NOT a real reference: it sits inside a
    # byte run that also contains the illegal opcode $C3 a few bytes earlier (see
    # test_the_dungeon_false_positive_sits_in_a_desynced_byte_run) -- the classic "wrong alignment
    # degrades into visible noise" signal this project's disassembler is deliberately built to
    # produce (see tools/c64_disasm.py's module docstring), not a real JSR/ASL to the pointer block.
    KNOWN_FALSE_POSITIVE = {
        ("Champions of Krynn", "DUNGEON"): [6244],
        ("Death Knights of Krynn", "DUNGEON"): [5731],
    }

    def _overlay_body(self, title: str, name: str) -> bytes:
        img = C64_SETS / title / f"{title} - Side 1.D64"
        if not img.is_file():
            self.skipTest(f"{img} absent")
        disk = c64.read_image(img)
        entries = {e.name: e for e in c64.directory(disk)}
        self.assertIn(name, entries, f"{title}/{name} missing from directory")
        data, problem = c64.read_file_checked(disk, entries[name])
        self.assertIsNone(problem, f"{title}/{name}: {problem}")
        return S.body(data)

    def test_no_genuine_param_block_reference_in_the_four_named_overlays(self) -> None:
        for title in self.TITLES:
            for name in self.OVERLAYS:
                body = self._overlay_body(title, name)
                hits = S.find_param_block_refs(body)
                allowed = self.KNOWN_FALSE_POSITIVE.get((title, name), [])
                self.assertEqual(
                    hits, allowed,
                    f"{title}/{name}: new $C080-$C08F reference at "
                    f"{sorted(set(hits) - set(allowed))} not previously seen -- disassemble "
                    "around it by hand, this may finally be the caller")

    def test_the_dungeon_false_positive_sits_in_a_desynced_byte_run(self) -> None:
        """Both titles' one raw hit is immediately preceded (within 12 bytes) by the illegal
        opcode $C3 -- a byte value with no defined NMOS 6502 instruction, so any linear decode
        reaching it has already lost real instruction alignment. A genuine call site would not be
        sitting downstream of undecodable noise."""
        for title, off in [("Champions of Krynn", 6244), ("Death Knights of Krynn", 5731)]:
            body = self._overlay_body(title, "DUNGEON")
            window = body[off - 12:off]
            self.assertIn(0xC3, window, f"{title}: expected desync marker $C3 near offset {off}")
            # the raw hit itself: an absolute-mode opcode byte at body[off] whose 2-byte operand
            # is $C08D (low 0x8D, high 0xC0) -- confirmed present, just not real code.
            self.assertEqual(body[off + 1:off + 3], bytes([0x8D, 0xC0]))

    # 2026-08-11 verification pass: the doc's own §8.3 closing sentence claims the wider
    # ten-overlay set ("GEN, INIT, LIBRARY, COM.PREP/COMPREP, POST.COM/POSTCOM" plus GDRIVE00)
    # was "searched two different ways", but the *pinned* absolute-reference scan
    # (find_param_block_refs, the only one of the two search styles that is an actual reusable
    # function, as opposed to a one-off session command) had in fact only ever been run -- and
    # tested -- against the four named overlays above. Running it for real against the other six
    # turned up two more raw hits nobody had pinned or disassembled: Death Knights of Krynn's
    # GEN (offset 6323) and LIBRARY (offset 427); Champions of Krynn's own LIBRARY hit (514) was
    # mentioned in the doc prose but was likewise never a pinned test. All three are proven false
    # positives here, by the same "disassemble around it" discipline as the DUNGEON case -- but
    # the GEN hit demonstrates a *different* mechanism: no illegal-opcode desync marker is needed
    # at all, because 6502 machine code is not self-delimiting -- a byte-level scan over otherwise
    # perfectly valid, correctly-aligned code can land on the tail byte of one real instruction's
    # operand and misread it plus the next instruction's opcode+operand as an unrelated absolute
    # reference. See docs/engine/research/c64-sprite-format.md §8.4.
    WIDER_OVERLAYS = {
        "Champions of Krynn": ["GEN", "INIT", "LIBRARY", "COM.PREP", "POST.COM", "GDRIVE00",
                                "ANIMATE00",
                                # 2026-08-11 doc's named remaining candidates (2026-08-12 pass):
                                "SOUNDFX", "MUSIC", "SECSET64", "TITLEPG"],
        "Death Knights of Krynn": ["GEN", "INIT", "LIBRARY", "COMPREP", "POSTCOM", "GDRIVE00",
                                   "ANIMATE00",
                                   "SOUNDFX", "MUSIC", "SECSET64", "TITLEPG",
                                   "CODE00", "CODE01", "CODE03"],  # Death Knights only
    }

    WIDER_KNOWN_FALSE_POSITIVE = {
        ("Champions of Krynn", "LIBRARY"): [514],
        ("Death Knights of Krynn", "GEN"): [6323],
        ("Death Knights of Krynn", "LIBRARY"): [427],
        # 2026-08-12: TITLEPG's one raw hit per title, both inside a byte run dense with
        # undefined-opcode values -- see test_the_titlepg_false_positive_sits_in_an_illegal_
        # opcode_dense_region and the doc's 2026-08-12 section. SOUNDFX, MUSIC, SECSET64 and (Death
        # Knights) CODE00/01/03 all come back clean ([]), so they need no entry here.
        ("Champions of Krynn", "TITLEPG"): [2589],
        ("Death Knights of Krynn", "TITLEPG"): [1716],
    }

    def test_no_genuine_param_block_reference_in_the_wider_overlay_set(self) -> None:
        """Runs the SAME absolute-reference scanner the four-named-overlay test above uses,
        against the six additional overlays the doc's prose (but not, until now, any test)
        claimed were also checked. Confirms the doc's coverage claim for real instead of by
        assertion, and pins the two previously-undocumented raw hits this pass found."""
        for title, names in self.WIDER_OVERLAYS.items():
            for name in names:
                body = self._overlay_body(title, name)
                hits = S.find_param_block_refs(body)
                allowed = self.WIDER_KNOWN_FALSE_POSITIVE.get((title, name), [])
                self.assertEqual(
                    hits, allowed,
                    f"{title}/{name}: new $C080-$C08F reference at "
                    f"{sorted(set(hits) - set(allowed))} not previously seen -- disassemble "
                    "around it by hand, this may finally be the caller")

    def test_the_gen_false_positive_is_a_clean_alignment_coincidence_not_a_desync(self) -> None:
        """Death Knights of Krynn GEN's raw hit at offset 6323 is a DIFFERENT false-positive
        mechanism than DUNGEON's: no illegal opcode nearby. body[6320:6326] disassembles, at the
        real $0800 origin, as the tail of a genuine `LDA $20E3,X` (opcode/operand at $20B1-$20B3)
        immediately followed by a genuine `STA $20C0` (opcode/operand at $20B4-$20B6) -- the
        scanner's hit is the LAST byte of the LDA's operand reinterpreted as a JSR opcode, with
        the STA's own opcode+low-operand-byte reinterpreted as JSR's target address ($C08D). Every
        byte in the window is real, correctly-decoded code; the scanner just doesn't respect
        instruction boundaries."""
        body = self._overlay_body("Death Knights of Krynn", "GEN")
        off = 6323
        self.assertEqual(body[off], 0x20, "expected the coincidental JSR opcode byte")
        self.assertEqual(body[off + 1:off + 3], bytes([0x8D, 0xC0]))
        # the real instruction this byte belongs to: LDA $20E3,X (BD E3 20), ending exactly here
        self.assertEqual(body[off - 2:off + 1], bytes([0xBD, 0xE3, 0x20]))
        # the real instruction the misread "operand" bytes belong to: STA $20C0 (8D C0 20)
        self.assertEqual(body[off + 1:off + 4], bytes([0x8D, 0xC0, 0x20]))

    # 2026-08-12: TITLEPG's raw hit (offset 2589 Champions of Krynn, 1716 Death Knights of Krynn)
    # sits inside a byte run whose surrounding 12 bytes contain several undefined-opcode byte
    # values -- the same "wrong alignment degrades into visible noise" signal as DUNGEON's false
    # positive (section 8.2), not the clean-alignment-coincidence kind GEN's was. This is also
    # consistent with the corpus-wide test_titlepg_scores_far_more_illegal_than_any_confirmed_
    # code_overlay finding that TITLEPG is not ordinary code starting at byte 0 at all.
    TITLEPG_DESYNC_WINDOW = {
        "Champions of Krynn": (2589, bytes.fromhex("8430823f1001c0e07038180c"),
                                [0x82, 0x3F, 0x0C]),
        "Death Knights of Krynn": (1716, bytes.fromhex("0301830012070d010080e038"),
                                    [0x03, 0x83, 0x12, 0x07, 0x80]),
    }

    def test_the_titlepg_false_positive_sits_in_an_illegal_opcode_dense_region(self) -> None:
        for title, (off, window, illegal_values) in self.TITLEPG_DESYNC_WINDOW.items():
            body = self._overlay_body(title, "TITLEPG")
            got_window = body[off - 12:off]
            self.assertEqual(got_window, window, f"{title}: TITLEPG window bytes changed")
            for v in illegal_values:
                self.assertIn(v, got_window, f"{title}: expected undefined opcode ${v:02X} "
                               f"near offset {off}")
                self.assertNotIn(v, disasm.OPCODES, f"${v:02X} is not actually undefined")
            # the raw hit itself: an absolute-mode opcode whose operand names $C080 (inside the
            # $C080-$C08F param block find_param_block_refs scans for)
            self.assertEqual(body[off] | 0, body[off])  # opcode byte present at off
            addr = body[off + 1] | (body[off + 2] << 8)
            self.assertIn(addr, S.GDRIVE01_PARAM_BLOCK, f"{title}: expected an in-range operand")

    def test_no_selfmod_patch_target_reference_in_any_named_overlay(self) -> None:
        """Corpus-wide sweep of hypothesis (1) from the task brief: does any overlay write
        GDRIVE01's own *patched* self-modifying operands directly, instead of the untouched
        $C080-$C08F block find_param_block_refs looks for? Runs across the SAME overlay corpus as
        the two tests above (the four named overlays plus the wider named-candidate set) -- every
        one comes back empty. GDRIVE00/GDRIVE01/GDRIVE04 themselves DO hit this scanner (GDRIVE01
        genuinely self-patches; GDRIVE00's own body has real code at the same absolute address as
        one of GDRIVE01's patch targets, and Death Knights' GDRIVE04 the same for another -- all
        three are mutually-exclusive occupants of the same $C000 driver slot, so this is
        address-space aliasing, not a caller reference -- see the doc's 2026-08-12 section), which
        is exactly why GDRIVE01 itself is deliberately not in this overlay-corpus sweep -- but
        GDRIVE00 already sits in WIDER_OVERLAYS (added in an earlier round for the plain $C08x
        scan) and does hit this one, for the address-space-aliasing reason above -- allowed for
        by name here rather than silently dropping GDRIVE00 from the loop."""
        # $C544 in both titles: a genuine, self-contained `JSR $C8FF` where $C8FF is a real
        # subroutine entry point INSIDE GDRIVE00's own body ($C000-$CAF5, i.e. $C000 + 2806 - 1)
        # -- see
        # test_gdrive00s_selfmod_hit_is_a_real_call_into_its_own_body for the disassembly proof.
        ALIASING_HITS = {"GDRIVE00": [1348]}
        for title in self.TITLES:
            for name in self.OVERLAYS + self.WIDER_OVERLAYS.get(title, []):
                body = self._overlay_body(title, name)
                hits = S.find_selfmod_patch_target_refs(body)
                allowed = ALIASING_HITS.get(name, [])
                self.assertEqual(
                    hits, allowed,
                    f"{title}/{name}: new self-modifying-patch-target reference at "
                    f"{sorted(set(hits) - set(allowed))} -- disassemble around it by hand, this "
                    "may finally be the caller")

    def test_gdrive00s_selfmod_hit_is_a_real_call_into_its_own_body(self) -> None:
        """GDRIVE00's hit above (body offset 1348, `JSR $C8FF`) is not a caller reference at all:
        $C8FF is simultaneously (a) the low byte of a self-modified operand inside GDRIVE01's own
        blit loop (see GDRIVE01_SELFMOD_PATCH_TARGETS) and (b) a genuine, unrelated subroutine
        entry point inside GDRIVE00's OWN body -- GDRIVE00 spans $C000-$CAF5 (2806-byte body,
        $C000 + 2806 - 1), well past $C8FF. GDRIVE00 and GDRIVE01 are mutually-exclusive occupants
        of the same $C000 slot
        (established memory map), so this is address-space aliasing between two files that never
        coexist in memory, not evidence either one calls the other."""
        for title in self.TITLES:
            body = self._overlay_body(title, "GDRIVE00")
            self.assertEqual(len(body), 2806, f"{title}: GDRIVE00 body length changed")
            off = 1348
            # the hit itself: JSR $C8FF (20 FF C8) at body offset 1348 = $C544
            self.assertEqual(body[off:off + 3], bytes([0x20, 0xFF, 0xC8]))
            # $C8FF - $C000 = 0x8FF = 2303, comfortably inside GDRIVE00's own 2806-byte body
            target_offset = 0xC8FF - 0xC000
            self.assertLess(target_offset, len(body))
            # and it's a real instruction there, not undecodable noise: LDA #$00 (A9 00)
            self.assertEqual(body[target_offset:target_offset + 2], bytes([0xA9, 0x00]))


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class LibraryLinkerCallerSearchTests(unittest.TestCase):
    """2026-08-12: does the GDRIVE01 sprite-composite caller live in the resident kernel --
    LIBRARY ($2DC8) or LINKER ($2D00), per docs/engine/research/c64-resident-kernel.md /
    c64-boot-chain.md? Both are checked here under the same two hypotheses §8/§9 already ruled
    out for every named overlay: a literal $C080-$C08F store, and a literal store to one of
    GDRIVE01's own self-modifying patch targets. Neither turns up a real hit (LINKER is checked
    for the first time; LIBRARY's one raw hit is the already-known false positive). This class
    also pins the two new findings the same round produced: LIBRARY's genuine (but unrelated,
    slot-1) call into the $C000 driver, and a disambiguation of a previously-ambiguous COMBAT-
    family lead using the newly discriminating GDRIVE00-exclusive tail range."""

    TITLES = ["Champions of Krynn", "Death Knights of Krynn"]

    def _library(self, title_key: str) -> bytes:
        try:
            return ck.kernel_body(title_key)
        except ck.SourceUnavailable as exc:
            self.skipTest(str(exc))

    def _linker(self, title_key: str) -> bytes:
        try:
            return ck.linker_body(title_key)
        except ck.SourceUnavailable as exc:
            self.skipTest(str(exc))

    def _overlay(self, title: str, name: str) -> bytes:
        img = C64_SETS / title / f"{title} - Side 1.D64"
        if not img.is_file():
            self.skipTest(f"{img} absent")
        disk = c64.read_image(img)
        entries = {e.name: e for e in c64.directory(disk)}
        self.assertIn(name, entries, f"{title}/{name} missing from directory")
        data, problem = c64.read_file_checked(disk, entries[name])
        self.assertIsNone(problem, f"{title}/{name}: {problem}")
        return S.body(data)

    # LIBRARY's one raw find_param_block_refs hit, already established (2026-08-11/12 rounds)
    # as the STA ($4C),Y / DEY / CPY #$FF misread -- see docs section 8.2/8.4.
    LIBRARY_KNOWN_FALSE_POSITIVE = {"cok": [514], "dok": [427]}

    def test_library_has_no_genuine_param_block_reference(self) -> None:
        for key in ("cok", "dok"):
            body = self._library(key)
            hits = S.find_param_block_refs(body)
            self.assertEqual(hits, self.LIBRARY_KNOWN_FALSE_POSITIVE[key],
                              f"LIBRARY/{key}: new $C080-$C08F reference -- disassemble it, this "
                              "may finally be the caller")

    def test_library_has_no_genuine_selfmod_patch_target_reference(self) -> None:
        for key in ("cok", "dok"):
            body = self._library(key)
            self.assertEqual(S.find_selfmod_patch_target_refs(body), [])

    def test_linker_has_no_genuine_param_block_reference(self) -> None:
        """LINKER was never checked under this hypothesis before this round -- it is not in
        either title's OVERLAYS/WIDER_OVERLAYS list above. 146 bytes (Champions of Krynn) / 75
        bytes (Death Knights of Krynn), far too small to hide much, but checked for real rather
        than assumed clean because it IS one of the two files this round's task specifically
        names."""
        for key in ("cok", "dok"):
            body = self._linker(key)
            self.assertEqual(S.find_param_block_refs(body), [])

    def test_linker_has_no_genuine_selfmod_patch_target_reference(self) -> None:
        for key in ("cok", "dok"):
            body = self._linker(key)
            self.assertEqual(S.find_selfmod_patch_target_refs(body), [])

    # LIBRARY's one genuine $C000-driver call: a tiny trampoline (JSR <local>; JSR $C003; JMP
    # <local>) reached only from DUNGEON. $C003 is GDRIVE01/00 table slot 1, NOT the
    # sprite-composite entry (slot 19/20, $C6BA) -- see docs section 10. Pinned by exact bytes so
    # this can't silently drift; the trampoline sits right after an unrelated RTS in both titles.
    LIBRARY_TRAMPOLINE = {
        # (library body offset of the JSR $C003 instruction itself, full 9-byte routine bytes,
        #  routine start offset, DUNGEON caller offset, DUNGEON caller's 3-byte JSR)
        "cok": (4728, bytes.fromhex("20b83c2003c04cbf3c"), 4725, 633, bytes.fromhex("203d40")),
        "dok": (4537, bytes.fromhex("20233c2003c04c2a3c"), 4534, 601, bytes.fromhex("207e3f")),
    }

    def test_library_c003_trampoline_is_real_and_called_only_from_dungeon(self) -> None:
        for key, (jsr_off, routine, start_off, dungeon_off, dungeon_bytes) in \
                self.LIBRARY_TRAMPOLINE.items():
            lib = self._library(key)
            self.assertEqual(lib[start_off:start_off + len(routine)], routine,
                              f"LIBRARY/{key}: trampoline bytes changed")
            # the JSR $C003 itself, at the expected offset inside that routine
            self.assertEqual(lib[jsr_off:jsr_off + 3], bytes([0x20, 0x03, 0xC0]))
            self.assertIn(jsr_off, disasm.find_stores(lib, 0, set(S.GDRIVE01_TABLE_SPAN)))
            # its only caller (cross-title) is DUNGEON, at the exact offset expected
            title = "Champions of Krynn" if key == "cok" else "Death Knights of Krynn"
            dungeon = self._overlay(title, "DUNGEON")
            self.assertEqual(dungeon[dungeon_off:dungeon_off + 3], dungeon_bytes,
                              f"DUNGEON/{key}: expected caller bytes changed")
            org = ck.KERNEL_ORIGIN
            bodies = {"DUNGEON": dungeon}
            callers = ck.find_callers(bodies, [org + start_off])
            self.assertEqual(callers[org + start_off], [("DUNGEON", dungeon_off)])

    # Death Knights of Krynn's PIC70 raises one raw hit at the analogous target -- confirmed a
    # false positive by disassembly: PIC70 is picture data (illegal-opcode-dense, the same
    # failure mode as the corpus's other PIC/TITLEPG false positives), body offset 915
    # disassembling as `AND $3F7E,X` purely by byte-alias coincidence, surrounded by many
    # undefined-opcode bytes. Named explicitly so this can't silently start hiding a real hit.
    EXTRA_KNOWN_FALSE_POSITIVE = {"cok": [], "dok": ["PIC70"]}

    def test_dungeon_only_caller_of_library_trampoline_across_whole_side1(self) -> None:
        """Widen the caller search to every side-1 file (not just DUNGEON) to confirm nothing
        else calls this trampoline."""
        for key, title in (("cok", "Champions of Krynn"), ("dok", "Death Knights of Krynn")):
            start_off = self.LIBRARY_TRAMPOLINE[key][2]
            org = ck.KERNEL_ORIGIN
            bodies = ck.read_bodies(ck.load_side1(key))
            callers = ck.find_callers(bodies, [org + start_off])
            names = sorted(name for name, _ in callers[org + start_off])
            expected = sorted(["DUNGEON"] + self.EXTRA_KNOWN_FALSE_POSITIVE[key])
            self.assertEqual(names, expected,
                              f"{title}: new caller(s) of the LIBRARY trampoline: "
                              f"{sorted(set(names) - set(expected))}")

    # 2026-08-12 disambiguation: COMBAT/COMBAT2/ECL64(Champions of Krynn)/CODE03(Death Knights of
    # Krynn) make a genuine JSR $C03C (ambiguous -- see docs section 10) but ALSO make genuine,
    # alignment-verified calls into the GDRIVE00-exclusive tail in nearby code, which only makes
    # sense with GDRIVE00 resident. Each entry: (file, body offset of the tail-range instruction,
    # its 3 raw bytes, the target address).
    TAIL_RANGE_HITS = {
        "Champions of Krynn": [
            ("COMBAT", 7011, bytes.fromhex("4c4ec0"), 0xC04E),
            ("COMBAT", 9142, bytes.fromhex("2066c0"), 0xC066),
            ("COMBAT2", 6255, bytes.fromhex("204ec0"), 0xC04E),
            ("ECL64", 2735, bytes.fromhex("4c4bc0"), 0xC04B),
            ("ECL64", 3824, bytes.fromhex("2063c0"), 0xC063),
        ],
        "Death Knights of Krynn": [
            ("COMBAT", 9004, bytes.fromhex("2066c0"), 0xC066),
            ("COMBAT2", 6366, bytes.fromhex("204ec0"), 0xC04E),
            ("CODE03", 2739, bytes.fromhex("4c4bc0"), 0xC04B),
            ("CODE03", 3822, bytes.fromhex("2063c0"), 0xC063),
        ],
    }

    def test_combat_family_makes_genuine_calls_into_the_gdrive00_exclusive_tail(self) -> None:
        """Proves the disambiguating evidence is real, aligned code -- not another instance of
        DUNGEON's known data-desync false-positive pattern (docs section 8.2) -- by checking the
        exact bytes at each pinned offset."""
        for title, hits in self.TAIL_RANGE_HITS.items():
            for name, off, raw, target in hits:
                body = self._overlay(title, name)
                self.assertEqual(body[off:off + 3], raw, f"{title}/{name}@{off}: bytes changed")
                addr = body[off + 1] | (body[off + 2] << 8)
                self.assertEqual(addr, target)
                self.assertIn(addr, S.GDRIVE00_EXCLUSIVE_TAIL)
                self.assertEqual(S.find_gdrive00_exclusive_tail_refs(body, 0x0800).count(off), 1)

    def test_combat_family_c03c_call_is_ambiguous_without_the_tail_range_evidence(self) -> None:
        """The $C03C call alone (table slot 20) cannot tell GDRIVE00 from GDRIVE01 apart -- both
        drivers have a valid entry there (to different targets, $C7A9 vs $C6BA). Pinned so the
        ambiguity itself stays documented, not just asserted in prose."""
        for title, name in (("Champions of Krynn", "COMBAT"), ("Death Knights of Krynn", "COMBAT")):
            body = self._overlay(title, name)
            hits = disasm.find_stores(body, 0, {0xC03C})
            self.assertGreater(len(hits), 0, f"{title}/{name}: expected at least one $C03C call")
            for off in hits:
                self.assertIn(0xC03C, S.GDRIVE01_TABLE_SPAN)  # slot 20: valid in EITHER driver

    def test_gdrive00_and_gdrive01_disagree_on_slot20s_target(self) -> None:
        """The premise the disambiguation rests on: table slot 20 ($C03C) is a real entry in
        BOTH drivers' own jump tables, but points at different routines -- $C7A9 (GDRIVE00, an
        unrelated routine) vs $C6BA (GDRIVE01, the sprite-composite entry)."""
        for title in self.TITLES:
            g0 = self._overlay(title, "GDRIVE00")
            g1 = self._overlay(title, "GDRIVE01")
            off = 0xC03C - 0xC000
            self.assertEqual(g0[off:off + 3], bytes([0x4C, 0xA9, 0xC7]), f"{title} GDRIVE00")
            self.assertEqual(g1[off:off + 3], bytes([0x4C, 0xBA, 0xC6]), f"{title} GDRIVE01")

    def test_gdrive05_does_not_open_with_a_jmp_dispatch_table(self) -> None:
        """Cheap structural look at GDRIVE05 (Death Knights of Krynn only), per the task's
        request not to let it consume the slice: unlike GDRIVE00/GDRIVE01, which both open with
        a run of JMP-absolute table slots, GDRIVE05's first bytes are ordinary sequential code
        (LDA #imm / STA abs / JSR abs / ...), not a table. Not characterized further here."""
        title = "Death Knights of Krynn"
        img = C64_SETS / title / f"{title} - Side 1.D64"
        if not img.is_file():
            self.skipTest(f"{img} absent")
        disk = c64.read_image(img)
        entries = {e.name: e for e in c64.directory(disk)}
        if "GDRIVE05" not in entries:
            self.skipTest("GDRIVE05 absent from this side-1 image")
        data, problem = c64.read_file_checked(disk, entries["GDRIVE05"])
        self.assertIsNone(problem)
        body = S.body(data)
        self.assertEqual(body[0:8], bytes.fromhex("a9078db47e201133"),
                          "GDRIVE05: opening bytes changed")
        # first opcode byte (0xA9, LDA #imm) is not $4C (JMP abs) -- no table slot 0 here
        self.assertNotEqual(body[0], 0x4C)


class GdriveLoaderTests(unittest.TestCase):
    """2026-08-12: the caller-hunt inversion -- who LOADS GDRIVE01/02/04/05, not who calls into
    one already resident. Answer: nobody requests a GDRIVE variant by embedding its literal
    filename; every request goes through LIBRARY's one generic per-family/area resource loader,
    with the trailing 2 digits of a "GDRIVE00"-shaped stem patched at runtime from an 8-bit area
    code. This class pins the loader's own bytes, the family-stem table it reads, every real
    GDRIVE-family call site found by a full-corpus sweep, and the GDRIVE03 tail-jump/wrapper
    reachability findings (docs section 11 has the full narrative)."""

    def _library(self, title_key: str) -> bytes:
        try:
            return ck.kernel_body(title_key)
        except ck.SourceUnavailable as exc:
            self.skipTest(str(exc))

    def _corpus(self, title_key: str) -> dict[str, bytes]:
        try:
            return ck.all_bodies(title_key)
        except ck.SourceUnavailable as exc:
            self.skipTest(str(exc))

    def test_hex_digit_matches_the_disassembled_routine_including_carry_chaining(self) -> None:
        """Exercises every nibble 0-15 against LIBRARY's own 8-byte routine (pinned separately
        below by exact bytes). This is deliberately NOT a paraphrase of the obvious "n+0x30,
        +6 past 9" idiom: the real 6502 routine chains the carry CMP leaves set into the
        following ADC #$06, so the true addend past 9 is 7, not 6 -- an earlier draft of
        `hex_digit` got this wrong (mapped 15 -> 'E' instead of 'F') and this test is what
        would catch it again."""
        expected = "0123456789ABCDEF"
        for n in range(16):
            self.assertEqual(S.hex_digit(n), expected[n], f"nibble {n}")
        # and the wrap: bit patterns above 4 bits are masked, not rejected
        self.assertEqual(S.hex_digit(0x1F), "F")

    def test_loader_filename_builds_the_real_requested_names(self) -> None:
        self.assertEqual(S.loader_filename("GDRIVE00", 0x00), "GDRIVE00")
        self.assertEqual(S.loader_filename("GDRIVE00", 0x03), "GDRIVE03")
        self.assertEqual(S.loader_filename("GDRIVE00", 0x0F), "GDRIVE0F")
        self.assertEqual(S.loader_filename("GDRIVE00", 0x1A), "GDRIVE1A")

    def test_generic_loader_entry_points_are_real_code_in_library(self) -> None:
        """Pins the three entry addresses' own bytes -- cache_check falls through into
        cache_check_preset 3 bytes later, which falls through into reload. Byte-identical
        SHAPE in both titles (only the absolute operands differ, which is why these are two
        separate literals rather than one shared constant)."""
        for key in ("cok", "dok"):
            lib = self._library(key)
            entries = S.GENERIC_LOADER_ENTRY[key]
            org = ck.KERNEL_ORIGIN
            # cache_check: LDA $7F13,X ...
            off = entries["cache_check"] - org
            self.assertEqual(lib[off:off + 3], bytes([0xBD, 0x13, 0x7F]),
                              f"{key}: cache_check opening bytes changed")
            # cache_check_preset is exactly 3 bytes past cache_check (skips the LDA)
            self.assertEqual(entries["cache_check_preset"], entries["cache_check"] + 3)
            # reload: STA $7F13,X ; STX $7E60 ; LDY <index_map>,X ; LDX FAMILY_TABLE_LOW,Y ...
            roff = entries["reload"] - org
            self.assertEqual(lib[roff:roff + 3], bytes([0x9D, 0x13, 0x7F]),
                              f"{key}: reload opening bytes changed")
            self.assertEqual(lib[roff + 3:roff + 6], bytes([0x8E, 0x60, 0x7E]))
            # LDY <index_map>,X immediately after
            self.assertEqual(lib[roff + 6], 0xBC)
            idx_map_addr = lib[roff + 7] | (lib[roff + 8] << 8)
            self.assertEqual(idx_map_addr, S.GENERIC_LOADER_INDEX_MAP_ADDR[key])
            # LDX FAMILY_TABLE_LOW,Y ; STX $4C ; LDX FAMILY_TABLE_HIGH,Y ; STX $4D
            self.assertEqual(lib[roff + 9:roff + 12],
                              bytes([0xBE, S.FAMILY_TABLE_LOW & 0xFF, S.FAMILY_TABLE_LOW >> 8]))
            self.assertEqual(lib[roff + 12:roff + 14], bytes([0x86, 0x4C]))
            self.assertEqual(lib[roff + 14:roff + 17],
                              bytes([0xBE, S.FAMILY_TABLE_HIGH & 0xFF, S.FAMILY_TABLE_HIGH >> 8]))
            self.assertEqual(lib[roff + 17:roff + 19], bytes([0x86, 0x4D]))

    def test_hex_digit_routine_bytes_are_pinned_in_library(self) -> None:
        for key in ("cok", "dok"):
            lib = self._library(key)
            off = S.HEX_DIGIT_ROUTINE_ADDR[key] - ck.KERNEL_ORIGIN
            self.assertEqual(lib[off:off + len(S.HEX_DIGIT_ROUTINE_BYTES)],
                              S.HEX_DIGIT_ROUTINE_BYTES,
                              f"{key}: nibble-to-hex routine bytes changed at "
                              f"${S.HEX_DIGIT_ROUTINE_ADDR[key]:04X}")

    def test_generic_loader_index_map_bytes_are_pinned_in_library(self) -> None:
        for key in ("cok", "dok"):
            lib = self._library(key)
            off = S.GENERIC_LOADER_INDEX_MAP_ADDR[key] - ck.KERNEL_ORIGIN
            self.assertEqual(lib[off:off + len(S.GENERIC_LOADER_INDEX_MAP)],
                              S.GENERIC_LOADER_INDEX_MAP,
                              f"{key}: X-to-Y family remap table changed")

    def test_family_stem_table_gdrive_is_index_zero_in_both_titles(self) -> None:
        expected_addr = {"cok": 0xA767, "dok": 0xA748}
        expected_prefix = {"cok": b"GDRIVE00SQRP", "dok": b"GDRIVE00\x00SQR"}
        for key in ("cok", "dok"):
            itemnames = self._corpus(key)["ITEMNAMES"]
            table = S.family_stem_table(itemnames)
            self.assertEqual(len(table), 21)
            addr0, snippet0 = table[S.GDRIVE_FAMILY_INDEX]
            self.assertEqual(addr0, expected_addr[key], f"{key}: GDRIVE stem address moved")
            self.assertEqual(snippet0, expected_prefix[key], f"{key}: GDRIVE stem text changed")

    # Every real, disassembly-confirmed GDRIVE-family (X=0) call site found by sweeping the
    # ENTIRE corpus (cok: 342 files, dok: 273 files -- ck.all_bodies()) for a literal JSR to a
    # GENERIC_LOADER_ENTRY address, then verifying local alignment. Each tuple pins the exact
    # bytes of the register setup immediately preceding (and including) the JSR, so any future
    # change to the requested area code, the entry point used, or the setup shape shows up here
    # rather than silently drifting. `window_start` is the body offset the pinned bytes begin at.
    REAL_GDRIVE_CALL_SITES = {
        "cok": [
            # file, window_start, exact bytes, human note
            ("COM.PREP", 216, "a900aa204241", "LDA #$00; TAX; JSR cache_check_preset -- GDRIVE00"),
            ("INIT", 2326, "a200a903204241",
             "LDX #$00; LDA #$03; JSR cache_check_preset -- GDRIVE03 (then JMP $C000, see "
             "GDRIVE03_TAIL_JUMP)"),
            ("DUNGEON", 8557, "48a200a903204241",
             "PHA; LDX #$00; LDA #$03; JSR cache_check_preset -- GDRIVE03, DUNGEON's own "
             "save/exec/restore wrapper at $2965 (see DUNGEON_GDRIVE03_WRAPPER_BYTES)"),
            ("DUNGEON", 8571, "68a200204241",
             "PLA; LDX #$00; JSR cache_check_preset -- restores the driver saved above; A is "
             "NOT immediate here (comes from the PLA), so no area code is pinned for this one"),
        ],
        "dok": [
            ("COMPREP", 222, "a900aa208340", "LDA #$00; TAX; JSR cache_check_preset -- GDRIVE00"),
            ("INIT", 2296, "a200a903208340",
             "LDX #$00; LDA #$03; JSR cache_check_preset -- GDRIVE03 (then JMP $C000)"),
            ("CAMP", 392, "a904a200208340", "LDA #$04; LDX #$00; JSR cache_check_preset -- GDRIVE04"),
            ("GEN", 1617, "a904a200208340", "LDA #$04; LDX #$00; JSR cache_check_preset -- GDRIVE04"),
            ("CODE01", 619, "a905a200208340", "LDA #$05; LDX #$00; JSR cache_check_preset -- GDRIVE05"),
            ("GEN", 4284, "a905a200208340", "LDA #$05; LDX #$00; JSR cache_check_preset -- GDRIVE05"),
            ("POSTCOM", 16, "a200a905208340",
             "LDX #$00; LDA #$05; JSR cache_check_preset -- GDRIVE05, near POSTCOM's own start"),
        ],
    }

    def test_real_gdrive_call_sites_are_pinned_and_target_the_loader(self) -> None:
        for key, sites in self.REAL_GDRIVE_CALL_SITES.items():
            bodies = self._corpus(key)
            entry_addrs = set(S.GENERIC_LOADER_ENTRY[key].values())
            for name, start, hexbytes, _note in sites:
                raw = bytes.fromhex(hexbytes)
                body = bodies[name]
                self.assertEqual(body[start:start + len(raw)], raw,
                                  f"{key}/{name}@{start}: bytes changed")
                # the JSR (last 3 bytes of every pinned window) targets a real loader entry
                jsr = raw[-3:]
                self.assertEqual(jsr[0], 0x20, f"{key}/{name}@{start}: window doesn't end in JSR")
                target = jsr[1] | (jsr[2] << 8)
                self.assertIn(target, entry_addrs,
                              f"{key}/{name}@{start}: JSR target ${target:04X} is not a known "
                              "loader entry")

    def test_gdrive03_tail_jump_bytes_are_pinned_in_init(self) -> None:
        """Both titles' INIT carries a tail-jump: request GDRIVE03, then JMP straight into the
        freshly-loaded $C000 driver slot without returning."""
        for key in ("cok", "dok"):
            init = self._corpus(key)["INIT"]
            tj = S.GDRIVE03_TAIL_JUMP[key]
            off = tj["addr"] - 0x0800
            self.assertEqual(init[off:off + len(tj["bytes"])], tj["bytes"],
                              f"{key}: GDRIVE03 tail-jump bytes changed")

    def test_gdrive03_tail_jump_reachability_differs_between_titles(self) -> None:
        """Champions of Krynn: POST.COM makes exactly one real, aligned call into the tail-jump,
        gated by a menu-choice comparison (choice 0 falls through to it; docs section 11 has the
        full gate disassembly). Death Knights of Krynn: the raw scan's one candidate (PIC5E) is a
        confirmed byte-alias false positive -- PIC5E is picture data, not code."""
        cok = self._corpus("cok")
        hits = ck.find_callers(cok, [S.GDRIVE03_TAIL_JUMP["cok"]["addr"]])
        self.assertEqual(hits[S.GDRIVE03_TAIL_JUMP["cok"]["addr"]], [("POST.COM", 2000)])

        dok = self._corpus("dok")
        hits2 = ck.find_callers(dok, [S.GDRIVE03_TAIL_JUMP["dok"]["addr"]])
        self.assertEqual(hits2[S.GDRIVE03_TAIL_JUMP["dok"]["addr"]], [("PIC5E", 588)],
                          "the known false-positive candidate changed or disappeared -- "
                          "re-verify by disassembly before trusting a new result here")
        # confirm the false-positive verdict is still justified: PIC5E still reads as picture
        # data (illegal-opcode-dense), not code, by the same threshold the rest of this corpus
        # uses (every confirmed code overlay scores well under 20%; see illegal_opcode_fraction's
        # own docstring for the exact comparison set).
        pic5e = dok["PIC5E"]
        self.assertGreater(S.illegal_opcode_fraction(pic5e), 0.20,
                            "PIC5E no longer looks like picture data -- the false-positive "
                            "verdict on its GDRIVE03-tail-jump 'hit' needs re-checking")

    def test_post_com_gate_for_the_reachable_gdrive03_call_is_pinned(self) -> None:
        """The exact menu-dispatch bytes in Champions of Krynn's POST.COM that make the
        GDRIVE03 tail-jump call reachable: input is polled, the resulting choice is stored via
        `STX $2C39`, and only choice 0 falls through (`BNE` skips the call for anything else)."""
        postcom = self._corpus("cok")["POST.COM"]
        # STX $2C39 ; BNE $0FD6 (skips the call unless the stored choice is 0) ; JSR $1116 ;
        # JMP $0FA4 (loop back to redraw the menu)
        self.assertEqual(postcom[1995:2006], bytes.fromhex("8e392cd0062016114ca40f"),
                          "POST.COM gate bytes changed")
        self.assertEqual(postcom[2000:2003], bytes([0x20, 0x16, 0x11]), "JSR $1116 bytes changed")

    def test_dungeon_gdrive03_wrapper_is_pinned_and_unreachable(self) -> None:
        """Champions of Krynn's DUNGEON carries its OWN, separate GDRIVE03 save/load-execute/
        restore wrapper at $2965 (docs section 11). Swept for a literal `JSR $2965` across the
        full 342-file corpus: zero hits -- an honest negative with a stated predicate, not an
        assumption. (Death Knights of Krynn has no counterpart: checked separately by the
        REAL_GDRIVE_CALL_SITES sweep above, which found no matching X=0/A=3 wrapper anywhere in
        its own DUNGEON.)"""
        cok = self._corpus("cok")
        dungeon = cok["DUNGEON"]
        addr = S.DUNGEON_GDRIVE03_WRAPPER_ADDR["cok"]
        off = addr - 0x0800
        self.assertEqual(dungeon[off:off + len(S.DUNGEON_GDRIVE03_WRAPPER_BYTES)],
                          S.DUNGEON_GDRIVE03_WRAPPER_BYTES, "DUNGEON $2965 wrapper bytes changed")
        hits = ck.find_callers(cok, [addr])
        self.assertEqual(hits[addr], [], "DUNGEON's $2965 GDRIVE03 wrapper now has a caller -- "
                          "this was an honest negative, re-verify by disassembly before trusting")

    def test_gdrive03_is_absent_from_every_disk_side_of_both_titles(self) -> None:
        """The file both titles' code asks for by name (via loader_filename) does not exist
        anywhere in the corpus -- re-swept this round, unchanged from the prior round's finding.
        """
        for key, title in (("cok", "Champions of Krynn"), ("dok", "Death Knights of Krynn")):
            try:
                paths = ck.all_side_paths(key)
            except ck.SourceUnavailable as exc:
                self.skipTest(str(exc))
            found = []
            for p in paths:
                disk = c64.read_image(p)
                for e in c64.directory(disk):
                    if e.name == "GDRIVE03":
                        found.append(p)
            self.assertEqual(found, [], f"{title}: GDRIVE03 now exists on disk at {found} -- "
                              "the reachable-but-missing-file finding no longer holds")

    def test_no_immediate_gdrive01_or_gdrive02_request_exists_in_either_corpus(self) -> None:
        """The honest negative this round leaves standing: sweeping every JSR/JMP-absolute to a
        GENERIC_LOADER_ENTRY address across the full corpus (`find_stores` matches JMP-absolute
        too, not only JSR -- both INIT's own GDRIVE03 tail-jump and, it turns out, an unrelated
        family-25 call in Death Knights' own CAMP use a tail JMP rather than a JSR) and checking
        each hit's small preceding byte window for BOTH an immediate `LDX #$00` (GDRIVE family
        select) AND an immediate `LDA #$01` or `LDA #$02` (area code) finds nothing. Requiring
        BOTH matters: an earlier, looser draft of this predicate (A=1/A=2 alone, no X check)
        flagged Death Knights' CAMP offset 2889 as a false "candidate" -- disassembly showed it
        is `LDA #$01; LDX #$19; JMP $4083`, i.e. family index 25 (not GDRIVE=0) requesting area
        1 of a WHOLLY DIFFERENT resource family, nothing to do with GDRIVE01. Tightening the
        predicate to require X=0 explicitly is what turned that false lead into a clean negative
        -- see `test_gdrive_family_25_call_in_camp_is_not_a_gdrive01_lead` for the pinned proof.
        This still does not prove GDRIVE01/GDRIVE02 are unreachable: a caller that loads the
        area code from a variable (the same pattern DUNGEON's own restore call uses) is
        invisible to this style of scan. Recorded as data (GDRIVE01_GDRIVE02_HONEST_NEGATIVE) so
        the swept file counts can't silently drift without this test catching it."""
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            expected_count = S.GDRIVE01_GDRIVE02_HONEST_NEGATIVE[f"{key}_files_swept"]
            self.assertEqual(len(bodies), expected_count,
                              f"{key}: corpus file count drifted from {expected_count} to "
                              f"{len(bodies)} -- the honest-negative sweep scope changed, "
                              "re-run the A=1/A=2 search before trusting the old verdict")
            entry_addrs = set(S.GENERIC_LOADER_ENTRY[key].values())
            found_1_or_2 = []
            for name, body in bodies.items():
                for off in disasm.find_stores(body, 0, entry_addrs):
                    window = body[max(0, off - 5):off]
                    has_x0 = bytes([0xA2, 0x00]) in window
                    has_area1_or_2 = (bytes([0xA9, 0x01]) in window
                                       or bytes([0xA9, 0x02]) in window)
                    if has_x0 and has_area1_or_2:
                        found_1_or_2.append((name, off))
            self.assertEqual(found_1_or_2, [],
                              f"{key}: found a candidate immediate GDRIVE01/02 request: "
                              f"{found_1_or_2} -- this would resolve the open caller question, "
                              "disassemble it before trusting")

    def test_gdrive_family_25_call_in_camp_is_not_a_gdrive01_lead(self) -> None:
        """Pins the exact false-lead bytes referenced in the test above, so the "X must be
        checked, not just A" lesson stays verifiable rather than just asserted in prose."""
        camp = self._corpus("dok")["CAMP"]
        # LDA #$01 ; LDX #$19 ; JMP $4083 -- family index 25 (0x19), not GDRIVE (0)
        self.assertEqual(camp[2885:2892], bytes.fromhex("a901a2194c8340"), "CAMP bytes changed")
        self.assertEqual(camp[2885], 0xA9)
        self.assertEqual(camp[2886], 0x01)   # the area code that made the loose predicate fire
        self.assertEqual(camp[2887], 0xA2)
        self.assertEqual(camp[2888], 0x19)   # X=25, NOT 0 -- this is what rules it out
        self.assertNotEqual(camp[2888], S.GDRIVE_FAMILY_INDEX)

    # -- 2026-08-12 (absent-names slice): what happens on GDRIVE03 failure, and a stronger,
    # decode-aligned re-derivation of "what selects the driver number" (docs section 12).

    def test_reload_tail_spine_bytes_are_pinned_in_library(self) -> None:
        """The control-flow spine reload falls into after building the filename: JSR the real
        KERNAL LOAD wrapper, BEQ on success, else JSR the retry/disk-swap handler and JMP back
        to retry the WHOLE reload -- GDRIVE03's actual failure path, not a probe-and-skip."""
        for key in ("cok", "dok"):
            lib = self._library(key)
            info = S.GENERIC_LOADER_RELOAD_TAIL[key]
            off = info["spine_addr"] - ck.KERNEL_ORIGIN
            want = S.GENERIC_LOADER_RELOAD_TAIL_BYTES[key]
            self.assertEqual(lib[off:off + len(want)], want,
                              f"{key}: reload-tail spine bytes changed")
            # decode the spine's own operands match the documented addresses
            self.assertEqual(want[0], 0x20)  # JSR
            self.assertEqual(want[1] | (want[2] << 8), info["load_wrapper"])
            self.assertEqual(want[3], 0xF0)  # BEQ
            self.assertEqual(want[5], 0x20)  # JSR
            self.assertEqual(want[6] | (want[7] << 8), info["retry_handler"])
            self.assertEqual(want[8], 0x4C)  # JMP
            self.assertEqual(want[9] | (want[10] << 8), info["addr"])

    def test_gdrive03_failure_path_reuses_linkers_own_final_failure_addresses(self) -> None:
        """The unifying claim this round set out to prove or refute: LIBRARY's own reload-tail
        (GDRIVE03's failure path, above) and LINKER's own dispatch loop (FINAL's failure path --
        c64-boot-chain.md section 2, c64-resident-kernel.md section 9.5) call the SAME two
        numeric addresses, not merely structurally similar ones, in BOTH titles. Two
        independently-discovered "named but shipped nowhere" resources share one mechanism."""
        for key in ("cok", "dok"):
            try:
                linker = ck.linker_body(key)
            except ck.SourceUnavailable as exc:
                self.skipTest(str(exc))
            info = S.GENERIC_LOADER_RELOAD_TAIL[key]
            hits = ck.find_callers({"LINKER": linker}, [info["load_wrapper"], info["retry_handler"]])
            self.assertEqual(len(hits[info["load_wrapper"]]), 1,
                              f"{key}: LINKER should JSR the load wrapper exactly once")
            self.assertEqual(len(hits[info["retry_handler"]]), 1,
                              f"{key}: LINKER should JSR the retry handler exactly once")

    def test_file_existence_probe_bytes_are_pinned_in_library(self) -> None:
        for key in ("cok", "dok"):
            lib = self._library(key)
            off = S.FILE_EXISTENCE_PROBE[key] - ck.KERNEL_ORIGIN
            want = S.FILE_EXISTENCE_PROBE_BYTES[key]
            self.assertEqual(lib[off:off + len(want)], want,
                              f"{key}: file-existence probe bytes changed")
            self.assertEqual(want[-1], 0x60, "probe should end RTS")
            self.assertEqual(want[-4:-1], bytes([0xAD, 0xF1, 0x03]), "probe should return "
                              "$03F1 (the parsed disk-status code) in A")

    def test_file_existence_probe_has_no_confirmed_caller_in_either_corpus(self) -> None:
        """`reload` (the routine that actually loads GDRIVE03) never calls this -- confirmed
        both by test_reload_tail_spine_bytes_are_pinned_in_library above (its spine jumps
        straight to the real LOAD wrapper) and here, by a corpus-wide sweep: in Champions of
        Krynn the probe's only reference anywhere is LIBRARY's own jump-table slot (a real,
        well-formed export, not an external caller); in Death Knights of Krynn -- whose own
        LIBRARY jump table is too short to expose it at all -- there is no reference anywhere."""
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            hits = ck.find_callers(bodies, [S.FILE_EXISTENCE_PROBE[key]])
            callers = hits[S.FILE_EXISTENCE_PROBE[key]]
            if key == "cok":
                self.assertEqual(callers, [("LIBRARY", 48)],
                                  "cok: file-existence probe reference set changed -- if this "
                                  "now includes a file other than LIBRARY, that is a real "
                                  "external caller and resolves an open question")
            else:
                self.assertEqual(callers, [], "dok: file-existence probe now has a caller")

    def test_file_existence_probe_is_library_jump_table_slot_16_in_cok_only(self) -> None:
        lib = self._library("cok")
        table = ck.library_jump_table(lib)
        slot = S.FILE_EXISTENCE_PROBE_JUMP_TABLE_SLOT["cok"]
        self.assertEqual(table[slot], (slot, ck.KERNEL_ORIGIN + slot * 3, S.FILE_EXISTENCE_PROBE["cok"]))
        # and confirm nothing calls the SLOT VECTOR address either (not just the routine's own
        # raw address) -- a caller going through the table, not a direct JSR, would show up here
        cok_bodies = self._corpus("cok")
        vector_addr = ck.KERNEL_ORIGIN + slot * 3
        hits = ck.find_callers(cok_bodies, [vector_addr])
        self.assertEqual(hits[vector_addr], [], "cok: something now calls the probe through "
                          "its jump-table slot vector -- a real caller, re-verify by disassembly")
        # DoK's own table is too short to hold an equivalent slot at all
        lib_dok = self._library("dok")
        self.assertLess(len(ck.library_jump_table(lib_dok)), slot + 1,
                         "dok: LIBRARY's jump table grew enough to expose a probe slot -- "
                         "re-check whether it now has one")

    def test_scan_generic_loader_call_sites_reproduces_the_documented_gdrive_totals(self) -> None:
        """Decode-aligned, corpus-wide re-derivation of REAL_GDRIVE_CALL_SITES above, using a
        strictly stronger method than the earlier byte-scan honest negative
        (GDRIVE01_GDRIVE02_HONEST_NEGATIVE): every JSR to the loader anywhere in the corpus is
        inspected at real instruction alignment, and BOTH X and A are resolved for every hit
        (immediate, TAX-copy, PLA, or unresolved) -- not just ones that already looked X=0 with
        an immediate A. This NARROWS docs section 11.7/11.8's explicitly-named open item
        ("computed/indirect area-code loads... not swept this round") to the JSR-absolute call
        sites this scan's predicate reaches -- it does not close it. Section 11.7's own named
        concrete next step was a census of writes to $7F13,X; this test does not do that (see
        docs section 12.5's "not swept this round" list)."""
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            rows = S.scan_generic_loader_call_sites(bodies, key)
            gdrive_rows = [r for r in rows if r[4] == 0]
            summary = S.GDRIVE_AREA_CODE_SOURCES_SUMMARY[key]
            self.assertEqual(len(gdrive_rows), summary["gdrive_call_sites"],
                              f"{key}: decode-aligned GDRIVE call-site count drifted")
            non_immediate = [r for r in gdrive_rows if r[6] is None]
            self.assertEqual(len(non_immediate), summary["non_immediate"],
                              f"{key}: non-immediate GDRIVE area-code count drifted")
            if summary["non_immediate"]:
                name, addr, entry, xdesc, xval, adesc, aval = non_immediate[0]
                self.assertEqual((name, adesc), ("DUNGEON", "PLA"),
                                  f"{key}: the one non-immediate GDRIVE request moved")

    def test_scan_generic_loader_call_sites_matches_real_gdrive_call_sites_exactly(self) -> None:
        """Cross-checks the NEW decode-aligned scanner against the OLD byte-pinned
        REAL_GDRIVE_CALL_SITES table above: two independently-derived methods (one scans from a
        raw byte match and hand-verifies alignment, the other decodes the whole file linearly
        from offset 0) must agree on the exact same (file, JSR-address) set."""
        for key, sites in self.REAL_GDRIVE_CALL_SITES.items():
            bodies = self._corpus(key)
            rows = S.scan_generic_loader_call_sites(bodies, key)
            got = {(name, addr) for name, addr, entry, xdesc, xval, adesc, aval in rows
                   if xval == 0}
            expected = set()
            for name, start, hexbytes, _note in sites:
                raw = bytes.fromhex(hexbytes)
                expected.add((name, 0x0800 + start + (len(raw) - 3)))
            self.assertEqual(got, expected, f"{key}: decode-aligned scan disagrees with the "
                              "byte-pinned REAL_GDRIVE_CALL_SITES table")

    def test_decode_aligned_false_positives_are_pinned_literal_ascii_text(self) -> None:
        """The three raw JSR-shaped byte hits a decode-aligned walk still reaches (out of 30
        total literal `20 xx xx` triples targeting a loader entry anywhere in the 342-file
        Champions of Krynn corpus) but that are NOT real calls: each sits inside an embedded
        ASCII UI-text string where " BA" happens to equal JSR $4142's own opcode+operand-low
        bytes (0x20 0x42 0x41) exactly. A previously-undocumented false-positive mechanism,
        distinct from the illegal-opcode-desync class (docs section 8.2/9.1): decode-CLEAN text
        that aliases a real, valid instruction. Death Knights of Krynn has none of this kind."""
        cok = self._corpus("cok")
        for (name, addr), expected in S.GENERIC_LOADER_DECODE_ALIGNED_FALSE_POSITIVES["cok"].items():
            body = cok[name]
            off = addr - 0x0800
            got = body[off:off + len(expected)]
            self.assertEqual(got, expected, f"{name}@{addr:#06x}: ASCII-text window changed")
            # the "JSR $4142" reading really is present at real instruction alignment
            self.assertEqual(got[:3], bytes([0x20, 0x42, 0x41]))
        self.assertEqual(S.GENERIC_LOADER_DECODE_ALIGNED_FALSE_POSITIVES["dok"], {},
                          "dok now has a decode-aligned ASCII-text false positive -- document it")


@unittest.skipUnless((C64_SETS / "Champions of Krynn").is_dir(), "Champions of Krynn absent")
class RenderGoldenTests(unittest.TestCase):
    """Exact renders. Any drift in block boundaries, frame count, or palette changes these."""

    GOLDENS = {
        ("Champions of Krynn", "SPRITE01"):
            ("trailer", 13,
             "fde6aaf52a4d41e111a62d9864793a89cabd747de8b51004766f7a50487a8aec"),
        ("Death Knights of Krynn", "SPRITE02"):
            ("trailer", 13,
             "457c2fda0672b72966385aef1592a2ba244ff6fc8f5ac4e201907337e57a09e7"),
        ("Pool of Radiance", "SPRITE02"):
            ("bare", 13,
             "0c76b029b64014234a8ff683e7c8d611b841285027bf1126cb683b95a58359e1"),
        ("Secret of the Silver Blades", "SPRITE42"):
            ("header", 7,
             "963e623a8d20d94968a0b14e0d5e9337f846ce01b9683ecb4f521b4a02084657"),
    }

    def test_known_pictures_render_byte_for_byte_as_inspected(self) -> None:
        for (title, name), (kind, count, want) in self.GOLDENS.items():
            if not (C64_SETS / title).is_dir():
                continue
            files = _title_files(title)
            self.assertIn(name, files, f"{title}/{name} missing from the disk set")
            prg = files[name]
            fr = S.framing(S.body(prg))
            self.assertEqual((fr.kind, fr.frame_count), (kind, count), f"{title}/{name}")
            w, h, px = S.filmstrip_rgb(prg, "hires")
            self.assertEqual(len(px), w * h * 3)
            self.assertEqual(hashlib.sha256(px).hexdigest(), want, f"{title}/{name} changed")

    def test_a_five_byte_rotation_breaks_the_trailer_signature(self) -> None:
        """The mutation the byte-10 signature check was calibrated against, kept as a live
        control: without it, a rotated trailer-dialect body would still satisfy the arithmetic
        length check and silently decode as a wrong 13-frame split instead of raising."""
        files = _title_files("Champions of Krynn")
        prg = files["SPRITE01"]
        body = S.body(prg)
        self.assertEqual(S.framing(body).kind, "trailer")
        rotated = body[5:] + body[:5]
        with self.assertRaises(ValueError):
            S.framing(rotated)


class CacheMirrorBitMaskTests(unittest.TestCase):
    """2026-08-13: pure bit arithmetic behind docs section 13.2's central claim ('a bit-7-tagged
    cached byte can never satisfy `cache_check_preset`'s masked comparison, so the tag is an
    unconditional forced cache-miss'). No disk images needed -- this is a deductive fact about
    the AND #$7F instruction, not an empirical corpus measurement, so it is proven exhaustively
    over all 256 byte values rather than sampled."""

    def test_masking_strips_bit7_so_a_tagged_byte_never_equals_its_own_masked_form(self) -> None:
        for v in range(256):
            masked = v & 0x7F
            if v & 0x80:
                self.assertNotEqual(masked, v, f"${v:02X}: tagged byte should never equal its "
                                     "own masked form (this is why cache_check_preset's "
                                     "CMP $7F13,X always mismatches a tagged slot)")
            else:
                self.assertEqual(masked, v, f"${v:02X}: an already-untagged byte should be "
                                  "unchanged by the mask")

    def test_the_mask_step_is_load_bearing_not_decorative(self) -> None:
        """Mutation control: without AND #$7F, cache_check_preset's CMP $7F13,X would compare the
        cached byte against ITSELF (LDA $7F13,X already happened for the non-preset entry, or the
        caller's own value would need to equal the tagged byte exactly for cache_check_preset) --
        either way a raw, unmasked comparison of a value against its own tagged copy is exactly
        the "always mismatch by construction" case this test rules out as a false reading: if the
        real routine compared unmasked-requested against unmasked-cached, a plain equal REQUEST
        (not tagged) could still hit even when the cache is tagged, which would defeat the whole
        invalidation mechanism. Confirms the two readings genuinely diverge, i.e. the assertion
        above is not vacuously true for every possible comparison shape."""
        requested = 0x03  # a real GDRIVE area code, always untagged (bit 7 clear)
        tagged_cache = 0x83  # the same value, restored from $4DC0 with its bit-7 tag still set
        # the REAL routine's own comparison: masked(requested) vs raw tagged_cache -- mismatch
        self.assertNotEqual(requested & 0x7F, tagged_cache)
        # the mutation: an unmasked comparison of requested vs tagged_cache would ALSO mismatch
        # here (0x03 != 0x83), so this specific pair doesn't discriminate -- but requested compared
        # against ITS OWN later-restored tagged copy (i.e. requested == tagged_cache & 0x7F) DOES
        # discriminate: an unmasked reading of "is this slot already loaded" would need to compare
        # requested against the raw tag byte and could never match while tagged, exactly the
        # invalidation property section 13.2 claims -- and masking is what lets the SAME slot
        # match again after `reload` overwrites it untagged:
        untagged_after_reload = 0x03
        self.assertEqual(requested & 0x7F, untagged_after_reload,
                          "after reload's own untagged overwrite, a repeat request must hit")


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class CacheMirrorWriteSideTests(unittest.TestCase):
    """2026-08-13: the $4DC0 resource-cache mirror's write side (docs section 13). Traces what
    else touches $4DC0 beyond the already-documented restore/save loop pair, what ORA #$80 is
    for, and whether any of it opens a path to GDRIVE01/GDRIVE02 (S12.4's standing open
    question). See the module-level constants this class exercises for the full evidence trail."""

    def _library(self, key: str) -> bytes:
        try:
            return ck.kernel_body(key)
        except ck.SourceUnavailable as exc:
            self.skipTest(str(exc))

    def _corpus(self, key: str) -> dict[str, bytes]:
        try:
            return ck.all_bodies(key)
        except ck.SourceUnavailable as exc:
            self.skipTest(str(exc))

    # -- cache_check_preset's masking logic (docs 13.2) -----------------------------------------

    def test_cache_check_preset_masking_bytes_are_pinned_in_library(self) -> None:
        for key in ("cok", "dok"):
            lib = self._library(key)
            addr = S.CACHE_CHECK_PRESET_MASKING_ADDR[key]
            off = addr - ck.KERNEL_ORIGIN
            want = S.CACHE_CHECK_PRESET_MASKING_BYTES
            self.assertEqual(lib[off:off + len(want)], want,
                              f"{key}: cache_check_preset masking bytes changed")
            # decode-check the two instructions the whole finding rests on
            self.assertEqual(want[4:6], bytes([0x29, 0x7F]), "expected AND #$7F")
            self.assertEqual(want[10:13], bytes([0xDD, 0x13, 0x7F]),
                              "expected CMP $7F13,X (masked requested vs RAW cached)")

    # -- $4BF2: the ECL-cache snapshot (docs 13.1b) ----------------------------------------------

    def test_ecl_snapshot_pattern_found_exactly_twice_per_title_only_in_dungeon(self) -> None:
        """Corpus-wide (not just DUNGEON) search for the 8-byte idiom `LDA $7F1B ; AND #$7F ;
        STA $4BF2` -- proves it is DUNGEON-only, not just that DUNGEON happens to contain it."""
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            lib = self._library(key)
            allb = dict(bodies)
            allb["__LIBRARY__"] = lib
            hits: list[tuple[str, int]] = []
            for name, body in allb.items():
                start = 0
                while True:
                    i = body.find(S.ECL_SNAPSHOT_PATTERN_BYTES, start)
                    if i == -1:
                        break
                    hits.append((name, i))
                    start = i + 1
            self.assertEqual(sorted(hits), sorted((name, off) for name, off, _addr, _standalone
                                                    in S.ECL_SNAPSHOT_SITES[key]),
                              f"{key}: ECL-snapshot idiom sites changed -- if this now includes a "
                              "file other than DUNGEON, that is a new writer to census")

    def test_general_sta_4bf2_scan_finds_more_than_the_masked_idiom(self) -> None:
        """CORRECTED 2026-08-13. The idiom scan above is a census of ONE WRITE SHAPE; the doc
        13.1b reported it as a census of the variable ("nowhere else"). Searching for the store
        itself -- `STA $4BF2` (8D F2 4B), any source -- returns cok 3 and dok 4 sites: the two
        masked DUNGEON writes per title, a shared boot zero-init in INIT, and a dok-only
        POSTCOM write of an UNMASKED $81. Pins the full set so a future idiom-shaped search
        cannot be mistaken for a census again."""
        expected = {
            "cok": [("DUNGEON", 4770), ("DUNGEON", 6400), ("INIT", 345)],
            "dok": [("DUNGEON", 4278), ("DUNGEON", 5854), ("INIT", 337), ("POSTCOM", 4041)],
        }
        for key in ("cok", "dok"):
            allb = dict(self._corpus(key))
            allb["__LIBRARY__"] = self._library(key)
            hits: list[tuple[str, int]] = []
            for name, body in allb.items():
                start = 0
                while True:
                    i = body.find(S.ECL_SNAPSHOT_STORE_BYTES, start)
                    if i == -1:
                        break
                    hits.append((name, i))
                    start = i + 1
            self.assertEqual(sorted(hits), sorted(expected[key]), f"{key}: STA $4BF2 census changed")
            # Every masked-idiom site must appear in the general census; the reverse does not hold,
            # which is the whole point of the correction.
            # +5: the STA is the 6th byte of `AD 1B 7F 29 7F | 8D F2 4B`.
            idiom = {(name, off + 5) for name, off, _a, _s in S.ECL_SNAPSHOT_SITES[key]}
            self.assertTrue(idiom.issubset(set(hits)),
                            f"{key}: masked idiom sites missing from the general store census")
            self.assertEqual(len(hits) - len(idiom), len(S.ECL_SNAPSHOT_OTHER_WRITE_SITES[key]))

    def test_dok_only_postcom_write_is_unmasked_and_absent_from_cok(self) -> None:
        """The specific divergence: an otherwise byte-identical boot sequence in which dok alone
        inserts `STA $4BF2` after `LDA #$81 ; STA $7F1B`, storing a bit-7-TAGGED value -- not the
        masked snapshot the doc's characterisation implied."""
        seed = bytes([0xA9, 0x81, 0x8D, 0x1B, 0x7F])  # LDA #$81 ; STA $7F1B
        tail = bytes([0xA9, 0x01, 0x8D, 0x78, 0x7E])  # LDA #$01 ; STA $7E78
        dok = self._corpus("dok")["POSTCOM"]
        cok = self._corpus("cok")["POST.COM"]
        d = dok.find(seed)
        c = cok.find(seed)
        self.assertNotEqual(d, -1)
        self.assertNotEqual(c, -1)
        # dok: seed, then the extra store, then the shared tail. cok: seed straight to the tail.
        self.assertEqual(dok[d + 5:d + 8], S.ECL_SNAPSHOT_STORE_BYTES)
        self.assertEqual(dok[d + 8:d + 13], tail)
        self.assertEqual(cok[c + 5:c + 10], tail)
        self.assertEqual(d + 5, 4041)  # the site pinned in ECL_SNAPSHOT_OTHER_WRITE_SITES

    def test_ecl_snapshot_sites_are_pinned_with_correct_addresses(self) -> None:
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            for name, off, addr, _standalone in S.ECL_SNAPSHOT_SITES[key]:
                body = bodies[name]
                self.assertEqual(off + 0x0800, addr, f"{key}/{name}: offset/address disagree")
                self.assertEqual(body[off:off + len(S.ECL_SNAPSHOT_PATTERN_BYTES)],
                                  S.ECL_SNAPSHOT_PATTERN_BYTES, f"{key}/{name}@{off}")

    def test_ecl_is_family_stem_table_index_8_in_both_titles(self) -> None:
        """$4DC8 = $4DC0+8 and $7F1B = $7F13+8 both name slot 8; this confirms slot 8 really is
        the ECL family (not a coincidental index), matching GENERIC_LOADER_INDEX_MAP[8] == 8
        (direct, no remap)."""
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            table = S.family_stem_table(bodies["ITEMNAMES"])
            _addr, snippet = table[8]
            self.assertTrue(snippet.startswith(b"ECL00"), f"{key}: stem index 8 is {snippet!r}")
            self.assertEqual(S.GENERIC_LOADER_INDEX_MAP[8], 8, f"{key}: X=8 no longer maps to Y=8")

    # -- CAMP's ECL re-tag: cok-only (docs 13.1a) -------------------------------------------------

    def test_camp_ecl_retag_sites_are_pinned_in_cok(self) -> None:
        bodies = self._corpus("cok")
        camp = bodies["CAMP"]
        name, off, addr = S.CAMP_ECL_RETAG_SITES_COK["read"]
        self.assertEqual(off + 0x0800, addr)
        self.assertEqual(camp[off:off + len(S.CAMP_ECL_RETAG_READ_BYTES)],
                          S.CAMP_ECL_RETAG_READ_BYTES, "cok CAMP read-side bytes changed")
        # the JMP target really is cache_check_preset's own entry
        jmp_target = S.CAMP_ECL_RETAG_READ_BYTES[-2] | (S.CAMP_ECL_RETAG_READ_BYTES[-1] << 8)
        self.assertEqual(jmp_target, S.GENERIC_LOADER_ENTRY["cok"]["cache_check_preset"])
        # and the X it loads is 8 (ECL), from the immediate operand two bytes before the JMP
        self.assertEqual(S.CAMP_ECL_RETAG_READ_BYTES[4], 8)

        name, off, addr = S.CAMP_ECL_RETAG_SITES_COK["write"]
        self.assertEqual(off + 0x0800, addr)
        self.assertEqual(camp[off:off + len(S.CAMP_ECL_RETAG_WRITE_BYTES)],
                          S.CAMP_ECL_RETAG_WRITE_BYTES, "cok CAMP write-side bytes changed")
        # writes into $4DC8 = $4DC0 + 8 (slot 8, ECL)
        dest = S.CAMP_ECL_RETAG_WRITE_BYTES[-2] | (S.CAMP_ECL_RETAG_WRITE_BYTES[-1] << 8)
        self.assertEqual(dest, 0x4DC0 + 8)

    def test_camp_ecl_retag_is_absent_from_dok_across_its_whole_corpus(self) -> None:
        """The cok-only claim, checked as a real corpus-wide absence rather than "we didn't look
        in dok's CAMP": every $0800-loaded overlay in dok (273 files) plus LIBRARY, searched for
        the decode-accurate opcode `LDA $4BF2` (AD F2 4B) -- zero hits anywhere."""
        bodies = self._corpus("dok")
        lib = self._library("dok")
        allb = dict(bodies)
        allb["__LIBRARY__"] = lib
        lda_4bf2 = bytes([0xAD, 0xF2, 0x4B])
        hits = [(name, i) for name, body in allb.items()
                for i in range(len(body) - 2) if body[i:i + 3] == lda_4bf2]
        self.assertEqual(hits, [], "dok now reads $4BF2 somewhere -- the cok-only finding "
                          "no longer holds, re-examine the new site")
        # mutation control: the same scan against cok DOES find the two known sites
        cok_bodies = self._corpus("cok")
        cok_hits = [(name, i) for name, body in cok_bodies.items()
                    for i in range(len(body) - 2) if body[i:i + 3] == lda_4bf2]
        self.assertEqual(sorted(cok_hits), sorted([("CAMP", 111), ("CAMP", 1269)]))

    # -- DUNGEON's $7F sentinel bulk-reset of GDRIVE's own slot (docs 13.2/13.3) -----------------

    def test_dungeon_sentinel_reset_bytes_are_pinned_in_both_titles(self) -> None:
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            dungeon = bodies["DUNGEON"]
            addr = S.DUNGEON_SENTINEL_RESET_ADDR[key]
            off = addr - 0x0800
            want = S.DUNGEON_SENTINEL_RESET_BYTES
            self.assertEqual(dungeon[off:off + len(want)], want,
                              f"{key}: DUNGEON sentinel-reset bytes changed")
            self.assertEqual(want[0:2], bytes([0xA9, 0x7F]), "expected LDA #$7F")
            # the fourth STA in the run is the unindexed one -- unambiguously slot 0 (GDRIVE)
            self.assertEqual(want[11:14], bytes([0x8D, 0x13, 0x7F]), "expected STA $7F13")

    def test_unindexed_sta_7f13_is_found_exactly_once_per_title_writing_0x7f_never_1_or_2(self) -> None:
        """The unindexed store form `STA $7F13` (opcode 8D 13 7F) unambiguously targets slot 0
        regardless of any runtime X, unlike the indexed `9D 13 7F` form the generic loader and the
        $4DC0 restore loop both use. A corpus-wide census (both titles, including LIBRARY) finds
        exactly one such site per title, both inside the DUNGEON sentinel-reset routine above, and
        the immediately-preceding LDA #imm (found by walking back to the nearest earlier LDA #imm
        in the pinned bytes) is always $7F -- never $01 or $02."""
        sta_7f13_unindexed = bytes([0x8D, 0x13, 0x7F])
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            lib = self._library(key)
            allb = dict(bodies)
            allb["__LIBRARY__"] = lib
            hits = [(name, i) for name, body in allb.items()
                    for i in range(len(body) - 2) if body[i:i + 3] == sta_7f13_unindexed]
            self.assertEqual(len(hits), 1, f"{key}: expected exactly one unindexed STA $7F13, "
                              f"found {hits}")
            (name, off) = hits[0]
            self.assertEqual(name, "DUNGEON")
            body = allb[name]
            addr = S.DUNGEON_SENTINEL_RESET_ADDR[key]
            self.assertEqual(off, addr - 0x0800 + 11, f"{key}: unindexed STA $7F13 moved within "
                              "the sentinel-reset routine")
            # trace it back through the pinned bytes to the LDA #$7F that feeds every STA in the run
            self.assertEqual(S.DUNGEON_SENTINEL_RESET_BYTES[0:2], bytes([0xA9, 0x7F]))

    def test_full_table_ff_reset_sites_are_pinned_and_cover_gdrive_slot(self) -> None:
        for key in ("cok", "dok"):
            bodies = self._corpus(key)
            for name, off, addr, xstart in S.FULL_TABLE_FF_RESET_SITES[key]:
                body = bodies[name]
                self.assertEqual(off + 0x0800, addr, f"{key}/{name}: offset/address disagree")
                self.assertEqual(body[off:off + 2], bytes([0xA2, xstart]),
                                  f"{key}/{name}: LDX #imm start value changed")
                tail = body[off + 2:off + 2 + len(S.FULL_TABLE_FF_RESET_TAIL_BYTES)]
                self.assertEqual(tail, S.FULL_TABLE_FF_RESET_TAIL_BYTES,
                                  f"{key}/{name}: FF-reset loop tail bytes changed")
                # CORRECTED 2026-08-13: this used to assert `xstart >= 0`, which is true by
                # construction for any Python int read from a hex literal and therefore tested
                # nothing at all -- least of all the "covers GDRIVE slot 0" claim in the heading.
                # Actually execute the pinned DEX;BPL loop and check which slots it writes.
                self.assertEqual(tail[5:8], bytes([0xCA, 0x10, 0xFA]),
                                  f"{key}/{name}: loop is no longer DEX;BPL -6")
                visited = []
                x = xstart
                while True:
                    visited.append(x)          # STA $7F13,X
                    x = (x - 1) & 0xFF         # DEX
                    if x & 0x80:               # BPL not taken once N is set
                        break
                self.assertEqual(visited, list(range(xstart, -1, -1)),
                                  f"{key}/{name}: loop does not cover every slot down to 0")
                self.assertEqual(visited[-1], 0, f"{key}/{name}: GDRIVE's slot 0 not written")

    # -- dok CODE00's candidate whole-mirror zero-fill (docs 13.1c) -------------------------------

    def test_code00_zerofill_candidate_bytes_are_pinned_in_dok(self) -> None:
        bodies = self._corpus("dok")
        code00 = bodies["CODE00"]
        addr = S.CODE00_ZEROFILL_CANDIDATE_ADDR["dok"]
        off = addr - 0x0800
        want = S.CODE00_ZEROFILL_CANDIDATE_BYTES
        self.assertEqual(code00[off:off + len(want)], want, "dok CODE00 zero-fill bytes changed")
        # NOT immediately preceded by an RTS -- there is a 10-byte non-instruction data gap
        # (07 12 1A 2F 4D 5B 5C 5F 69 73) between the zero-fill's own $78 (SEI) and the nearest
        # real RTS, 11 bytes earlier at $16E8 (the end of a short table-membership routine). Pins
        # the exact gap bytes and the real RTS position rather than asserting the imprecise
        # "byte immediately before is RTS" claim an earlier pass got wrong.
        gap = bytes.fromhex("07121a2f4d5b5c5f6973")
        self.assertEqual(code00[off - 10:off], gap, "the 10-byte pre-routine gap changed")
        self.assertEqual(code00[off - 11], 0x60, "expected a real RTS 11 bytes before the "
                          "zero-fill routine (end of the preceding table-membership routine)")

    def test_code00_zerofill_covers_all_32_mirror_slots_with_no_preserved_exception(self) -> None:
        """Derives the fill ranges and the four preserved-byte addresses straight from the pinned
        bytes (not re-typed by hand) and confirms none of the four preserved bytes falls inside
        the $4DC0-$4DDF span -- i.e. if this routine ever runs, ALL 32 mirror slots (including
        GDRIVE's) are zeroed with no exception, unlike the two adjacent regions."""
        b = S.CODE00_ZEROFILL_CANDIDATE_BYTES
        # the four LDA abs / PHA pairs at the very start (after the 1-byte SEI)
        preserved = []
        pc = 1
        for _ in range(4):
            self.assertEqual(b[pc], 0xAD, "expected LDA abs")
            preserved.append(b[pc + 1] | (b[pc + 2] << 8))
            self.assertEqual(b[pc + 3], 0x48, "expected PHA")
            pc += 4
        self.assertEqual(preserved, [0x4BFC, 0x4CF4, 0x4C33, 0x4C34])
        # the third loop's own base address, read from its STA abs,Y operand
        # (LDY #$1F ; STA base,Y ; ...) -- find the last "99 xx xx" (STA abs,Y) in the fill section
        third_loop_sta = b.rfind(bytes([0x99]))
        base = b[third_loop_sta + 1] | (b[third_loop_sta + 2] << 8)
        self.assertEqual(base, 0x4DC0)
        mirror_range = range(base, base + 32)  # dok's own slot count (LDX #$1F -> 32 slots)
        for addr in preserved:
            self.assertNotIn(addr, mirror_range, f"${addr:04X} is preserved AND inside the "
                              "mirror span -- the 'no exception carved out' claim is wrong")

    def test_code00_zerofill_has_no_confirmed_caller_this_round(self) -> None:
        """Decode-aligned self-referential JSR/JMP/branch scan of CODE00's own body, plus a scan
        of LIBRARY (the one resident callable from many different $0800 overlays) -- both come
        back empty. Mutation control: injecting a synthetic JSR to the exact target address into a
        COPY of CODE00's body proves the scanner can find a real hit before trusting the negative
        on the real body."""
        bodies = self._corpus("dok")
        code00 = bodies["CODE00"]
        lib = self._library("dok")
        target = S.CODE00_ZEROFILL_CANDIDATE_ADDR["dok"]

        def aligned_jsr_jmp_targets(body: bytes, org: int) -> set[int]:
            out = set()
            for addr, op, mode, _size, opnd in S.decode_all(body, org):
                if op in (0x20, 0x4C) and mode == disasm.ABS:
                    out.add(opnd[0] | (opnd[1] << 8))
            return out

        self.assertNotIn(target, aligned_jsr_jmp_targets(code00, 0x0800),
                          "dok CODE00 now calls its own zero-fill candidate -- real caller found")
        self.assertNotIn(target, aligned_jsr_jmp_targets(lib, ck.KERNEL_ORIGIN),
                          "dok LIBRARY now calls the zero-fill candidate -- real caller found")

        # mutation: inject a real JSR to `target` into a mutable copy and confirm it IS found
        mutated = bytearray(code00)
        lo, hi = target & 0xFF, (target >> 8) & 0xFF
        mutated[0:3] = bytes([0x20, lo, hi])  # JSR <target> at the very first bytes
        self.assertIn(target, aligned_jsr_jmp_targets(bytes(mutated), 0x0800),
                      "the scanner failed to find an injected real caller -- it cannot be "
                      "trusted to report a genuine absence")

    def test_cok_has_no_analogous_zerofill_under_the_same_predicate(self) -> None:
        """The dok-only claim, checked as a real corpus-wide absence in cok rather than "we didn't
        look": the exact `STA $4DC0,Y` opcode shape (99 C0 4D) that anchors dok's third fill loop
        is searched across cok's entire corpus (342 files) plus LIBRARY -- zero occurrences."""
        bodies = self._corpus("cok")
        lib = self._library("cok")
        allb = dict(bodies)
        allb["__LIBRARY__"] = lib
        sta_4dc0_y = bytes([0x99, 0xC0, 0x4D])
        hits = [(name, i) for name, body in allb.items()
                for i in range(len(body) - 2) if body[i:i + 3] == sta_4dc0_y]
        self.assertEqual(hits, [], "cok now has an STA $4DC0,Y site -- the dok-only claim no "
                          "longer holds")
        # mutation control: the SAME scan against dok DOES find the known site
        dok_bodies = self._corpus("dok")
        dok_hits = [(name, i) for name, body in dok_bodies.items()
                    for i in range(len(body) - 2) if body[i:i + 3] == sta_4dc0_y]
        self.assertEqual(dok_hits, [("CODE00", 3863)])


class TrailerFieldStatsTests(unittest.TestCase):
    """Pure arithmetic tests for the correlation-testing primitives added for section 14 of the
    doc (trailer field vs. decodable-body-property correlation) -- no disk images needed, so these
    always execute regardless of whether D:/Games/... is present."""

    def test_pearson_r_perfect_positive_and_negative(self) -> None:
        xs = [1.0, 2.0, 3.0, 4.0, 5.0]
        self.assertAlmostEqual(S.pearson_r(xs, [2.0, 4.0, 6.0, 8.0, 10.0]), 1.0)
        self.assertAlmostEqual(S.pearson_r(xs, [10.0, 8.0, 6.0, 4.0, 2.0]), -1.0)

    def test_pearson_r_zero_variance_series_returns_zero(self) -> None:
        # Neither a constant xs nor a constant ys has anything to correlate -- both directions
        # must return exactly 0.0, not raise or divide by zero.
        self.assertEqual(S.pearson_r([1, 1, 1, 1], [1, 2, 3, 4]), 0.0)
        self.assertEqual(S.pearson_r([1, 2, 3, 4], [5, 5, 5, 5]), 0.0)

    def test_pearson_r_rejects_mismatched_or_empty_series(self) -> None:
        with self.assertRaises(ValueError):
            S.pearson_r([1, 2, 3], [1, 2])
        with self.assertRaises(ValueError):
            S.pearson_r([], [])

    def test_permutation_correlation_p_detects_a_strong_real_relationship(self) -> None:
        """xs == ys == range(20): r is exactly 1.0, and among 2000 random reshuffles of a
        20-element all-distinct series, the identity ordering essentially never recurs by chance
        (1-in-20! per trial), so the permutation p should come back at or near the scan's own
        floor. Exact numbers reproduced directly against the real function, not asserted from
        memory -- fixed seed=1, trials=2000 makes this deterministic."""
        xs = list(range(20))
        r, p = S.permutation_correlation_p(xs, list(xs), trials=2000, seed=1)
        self.assertAlmostEqual(r, 1.0)
        self.assertLess(p, 0.01)

    def test_permutation_correlation_p_on_an_unrelated_pairing_is_not_significant(self) -> None:
        """A fixed (seed=12345) shuffle of range(20) paired against range(20) itself: real
        Pearson r is a modest -0.287 (neither series is constant, so this is a genuine, non-
        degenerate weak relationship), and the permutation null does not call it significant."""
        xs = list(range(20))
        ys = [16, 18, 3, 8, 19, 10, 7, 14, 12, 1, 5, 2, 15, 17, 4, 6, 11, 9, 0, 13]
        r, p = S.permutation_correlation_p(xs, ys, trials=2000, seed=2)
        self.assertAlmostEqual(r, -0.28721804511278193)
        self.assertGreater(p, 0.05)

    def test_permutation_correlation_p_degenerate_input_is_reported_not_guessed(self) -> None:
        r, p = S.permutation_correlation_p([7, 7, 7, 7], [1, 2, 3, 4], trials=500, seed=0)
        self.assertEqual((r, p), (0.0, 1.0))
        r2, p2 = S.permutation_correlation_p([1, 2, 3, 4], [9, 9, 9, 9], trials=500, seed=0)
        self.assertEqual((r2, p2), (0.0, 1.0))

    def test_fisher_combined_p_of_a_single_value_is_the_value_itself(self) -> None:
        # Closed-form identity for k=1 (df=2): the survival function reduces algebraically to
        # exp(ln(p)) == p. Checked at three different magnitudes, not just one.
        for p in (0.5, 0.1, 0.001):
            self.assertAlmostEqual(S.fisher_combined_p([p]), p, places=9)

    def test_fisher_combined_p_of_two_values_matches_the_closed_form(self) -> None:
        # Closed-form identity for k=2 (df=4): sf = (p1*p2) * (1 - ln(p1*p2)).
        p1, p2 = 0.1, 0.2
        expected = (p1 * p2) * (1.0 - math.log(p1 * p2))
        self.assertAlmostEqual(S.fisher_combined_p([p1, p2]), expected, places=12)

    def test_fisher_combined_p_rejects_out_of_range_inputs(self) -> None:
        with self.assertRaises(ValueError):
            S.fisher_combined_p([0.0, 0.5])       # literal 0.0 is undefined, not "certain"
        with self.assertRaises(ValueError):
            S.fisher_combined_p([1.5])
        with self.assertRaises(ValueError):
            S.fisher_combined_p([])


def _trailer_instances(title: str) -> list[tuple[str, bytes]]:
    """Every readable SPRITE PRG instance across a title's disk set, one entry per (side, name)
    pair -- NOT deduplicated by name, unlike `_title_files`. Matches this project's own established
    per-instance counting convention for the trailer-byte census (c64-sprite-format.md section 3.1:
    "counted per instance, not per unique name, because several sides carry duplicate copies")."""
    out: list[tuple[str, bytes]] = []
    for img in sorted((C64_SETS / title).glob("*.[Dd]64")):
        for name, data in S.disk_files(img).items():
            if name.startswith("SPRITE"):
                out.append((name, data))
    return out


def _trailer_census(title: str) -> list[dict]:
    """Per-instance trailer-dialect census for one title: every SPRITE instance whose framing()
    is 'trailer' (this silently and correctly excludes the one Death Knights of Krynn SPRITE62
    anomaly, since S.trailer_field_properties returns None for anything framing() rejects)."""
    out = []
    for name, prg in _trailer_instances(title):
        props = S.trailer_field_properties(prg)
        if props is not None:
            props = dict(props, name=name)
            out.append(props)
    return out


TRAILER_DIALECT_TITLES = [
    "Champions of Krynn",
    "Death Knights of Krynn",
    "Buck Rogers - Countdown to Doomsday",
    "Curse of the Azure Bonds",
]


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class TrailerFieldCorrelationTests(unittest.TestCase):
    """Section 14 of the doc: does any of the 16 trailer bytes correlate with a decodable property
    of the sprite body it is attached to? Every title present is checked (rule 6); a title's
    directory being absent is an explicit skip, not a silent pass. Every correlation reported here
    is permutation-tested per rule 3 -- see `S.permutation_correlation_p`'s own docstring for the
    stated null (reshuffle one series against the other, holding both real marginal populations
    fixed) -- and the exploratory multiple-comparisons context (51 valid tests, 8 nominal p<0.05
    hits vs ~2.55 expected by chance) is recorded in the doc, not just the two survivors pinned
    here.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.census: dict[str, list[dict]] = {}
        for title in TRAILER_DIALECT_TITLES:
            if (C64_SETS / title).is_dir():
                cls.census[title] = _trailer_census(title)
        if not cls.census:
            raise unittest.SkipTest("no trailer-dialect title sets present")

    def test_frame_count_and_body_length_are_degenerate_in_every_title_present(self) -> None:
        """Nothing to correlate against: every trailer-dialect instance in every title present
        carries exactly 13 frames and an 848-byte body. This is a structural fact (already known
        from test_trailer_dialect_titles_always_ship_thirteen_frames), reconfirmed here because
        the correlation tests below need it to justify skipping these two candidate properties
        rather than silently omitting them."""
        for title, rows in self.census.items():
            self.assertEqual({r["frame_count"] for r in rows}, {13}, title)
            self.assertEqual({r["body_length"] for r in rows}, {848}, title)

    def test_permutation_correlation_p_on_the_real_degenerate_properties_reports_1_0(self) -> None:
        """Direct proof (not inference) that asking the permutation test to correlate trailer byte
        3 against the real (degenerate) frame_count/body_length populations returns the honest
        "nothing to correlate" result, on real corpus data rather than a synthetic fixture."""
        for title, rows in self.census.items():
            xs = [r["trailer"][3] for r in rows]
            for prop in ("frame_count", "body_length"):
                ys = [r[prop] for r in rows]
                self.assertEqual(S.permutation_correlation_p(xs, ys, trials=200, seed=0),
                                  (0.0, 1.0), f"{title}/{prop}")

    def test_trailer_byte3_negatively_correlates_with_multicolour_frame_count(self) -> None:
        """The one field/property pair that survives this section's own multiple-comparisons
        scrutiny (see the doc): trailer byte 3 against the count of frames the existing
        hires-vs-multicolour heuristic scores as multicolour-preferred. Same negative sign in
        every title present; individually significant (permutation p < 0.05) in 3 of the 4 known
        trailer-dialect titles; Fisher-combined across whichever titles are present is far below
        any reasonable significance threshold. Exact trial counts/seeds fixed for reproducibility.
        """
        pvals = []
        for title, rows in self.census.items():
            xs = [r["trailer"][3] for r in rows]
            ys = [r["multicolour_frames"] for r in rows]
            r, p = S.permutation_correlation_p(xs, ys, trials=6000, seed=3)
            self.assertLess(r, 0.0, f"{title}: byte 3 vs multicolour-frame-count sign flipped")
            pvals.append(max(p, 1.0 / 6000))
        combined = S.fisher_combined_p(pvals)
        self.assertLess(combined, 1e-3,
                         f"Fisher-combined p across {sorted(self.census)} no longer small")

    def test_hypothesised_enable_mask_bytes_11_and_12_do_not_correlate_where_they_vary(self) -> None:
        """Section 3.1's own hypothesis -- bytes 11/12 as VIC-II sprite-enable/multicolour-enable
        masks -- predicts SOME relationship to how often a creature's frames read as multicolour.
        Tested directly, in the two titles where bytes 11/12 actually vary (Curse of the Azure
        Bonds for both; Buck Rogers only for byte 11, byte 12 is degenerate there and skipped):
        no significant correlation in any case tested. A real negative, not an omission."""
        cases = [("Curse of the Azure Bonds", 11), ("Curse of the Azure Bonds", 12),
                  ("Buck Rogers - Countdown to Doomsday", 11)]
        tested = 0
        for title, byte_idx in cases:
            rows = self.census.get(title)
            if not rows:
                continue
            xs = [r["trailer"][byte_idx] for r in rows]
            if len(set(xs)) <= 1:
                continue  # degenerate in this title -- nothing to test, not a hidden pass
            ys = [r["multicolour_frames"] for r in rows]
            r, p = S.permutation_correlation_p(xs, ys, trials=4000, seed=11)
            self.assertGreater(p, 0.05, f"{title} byte {byte_idx}: r={r} p={p}")
            tested += 1
        self.assertGreaterEqual(tested, 2, "too few non-degenerate cases actually ran")

    def test_curse_of_azure_bonds_byte3_finding_is_not_a_filename_ordering_artifact(self) -> None:
        """Confound check: in Curse of the Azure Bonds, does the SPRITE file's own numeric suffix
        (a proxy for disk/authoring order) explain byte 3's correlation with multicolour-frame-
        count, rather than byte 3 itself? If suffix correlated with both byte 3 and the frame
        count, the headline finding could be a shared-third-variable artifact. It does not:
        neither correlation is significant in this title."""
        rows = self.census.get("Curse of the Azure Bonds")
        if not rows:
            self.skipTest("Curse of the Azure Bonds absent")
        nums = []
        nrows = []
        for r in rows:
            try:
                nums.append(int(r["name"][6:], 16))
                nrows.append(r)
            except ValueError:
                continue
        self.assertGreater(len(nums), 20, "too few parseable SPRITE suffixes to test")
        b3 = [r["trailer"][3] for r in nrows]
        multi = [r["multicolour_frames"] for r in nrows]
        r1, p1 = S.permutation_correlation_p(nums, b3, trials=4000, seed=21)
        r2, p2 = S.permutation_correlation_p(nums, multi, trials=4000, seed=22)
        self.assertGreater(p1, 0.05, f"suffix vs byte3 r={r1} p={p1}")
        self.assertGreater(p2, 0.05, f"suffix vs multi r={r2} p={p2}")

    def test_byte3_survives_a_look_elsewhere_sweep_of_every_trailer_position(self) -> None:
        """The multiple-comparisons check at the level the headline is actually stated.

        ADDED 2026-08-13. Section 14.4 defends its Fisher-combined `p` by comparing it to a
        Bonferroni threshold for "the 51-test family this was drawn from" -- but the 51 tests
        were per-title correlations, and the number being defended is a statistic COMBINED
        across titles. That is the wrong family: the combined statistic was never one of the
        51, so its threshold cannot come from them. The right family is "the combined `p` I
        would have computed at every trailer position I could have looked at", which is what
        this test builds.

        Result (the doc's conclusion survives, on a correct argument rather than a
        coincidentally-similar one): of the 16 trailer positions, 4 are degenerate in every
        title and 12 admit a combined test. Byte 3's 6.6e-6 clears the 12-test Bonferroni
        threshold (0.05/12 = 4.2e-3) by a factor of ~630, and the runner-up position does NOT
        clear it -- so this is not a case of several positions crowding the threshold. Byte 3
        is also the ONLY position whose correlation carries the same sign in all four titles;
        that unanimity is weak evidence on its own (2/16 per position under the null, so ~1.5
        unanimous positions are expected among 12 by chance) and is asserted as a
        distinguishing property, not as independent significance.

        Deliberately re-derived here from `permutation_correlation_p`/`fisher_combined_p`
        rather than reading section 14.4's table back: a look-elsewhere check that trusted the
        selected position's own reported number would not be testing anything.
        """
        n_trailer = len(next(iter(self.census.values()))[0]["trailer"])
        self.assertEqual(n_trailer, 16)
        combined: dict[int, float] = {}
        unanimous: list[int] = []
        for pos in range(n_trailer):
            pvals, signs = [], []
            for _title, rows in sorted(self.census.items()):
                xs = [r["trailer"][pos] for r in rows]
                if len(set(xs)) <= 1:
                    continue  # degenerate in this title: nothing to correlate, not a pass
                ys = [r["multicolour_frames"] for r in rows]
                r, p = S.permutation_correlation_p(xs, ys, trials=6000, seed=3)
                pvals.append(max(p, 1.0 / 6000))
                signs.append(r)
            if not pvals:
                continue
            combined[pos] = S.fisher_combined_p(pvals)
            if len(signs) == len(self.census) and all(s < 0 for s in signs):
                unanimous.append(pos)

        self.assertEqual(len(combined), 12, "the testable-position count changed")
        threshold = 0.05 / len(combined)
        ranked = sorted(combined.items(), key=lambda kv: kv[1])
        self.assertEqual(ranked[0][0], 3, f"byte 3 is no longer the strongest: {ranked[:3]}")
        self.assertLess(ranked[0][1], threshold / 100,
                         f"byte 3 combined p={ranked[0][1]} no longer clears {threshold} by 100x")
        self.assertGreater(ranked[1][1], threshold,
                           f"a SECOND position now clears the threshold: {ranked[:3]}")
        self.assertEqual(unanimous, [3], f"sign unanimity is no longer unique to byte 3: {unanimous}")


ALL_SEVEN_TITLES = [
    "Buck Rogers - Countdown to Doomsday",
    "Champions of Krynn",
    "Curse of the Azure Bonds",
    "Death Knights of Krynn",
    "Gateway to the Savage Frontier",
    "Pool of Radiance",
    "Secret of the Silver Blades",
]


def _sides(title: str) -> list[Path]:
    """Every side of a title, NON-recursively (the `superseded\\` subfolders hold the damaged
    Curse of the Azure Bonds dumps that were replaced -- see CLAUDE.md)."""
    return sorted(p for p in (C64_SETS / title).iterdir()
                  if p.is_file() and p.suffix.lower() == ".d64")


def _body_anywhere(title: str, name: str) -> bytes | None:
    """First readable body for `name` on ANY side of `title`. `_named` pins a side number, which
    is right when the side is part of the claim; the adjudicated false-positive population spans
    sides (Gateway's `COM.PREP` lives on side 8, Pool's `POST.COM` is not on side 1), so a
    side-pinned lookup would silently drop members of it."""
    for img in _sides(title):
        disk = c64.read_image(img)
        for entry in c64.directory(disk):
            if entry.name == name:
                data, problem = c64.read_file_checked(disk, entry)
                if problem is None:
                    return S.body(data)
    return None


def _named(title: str, side: int, name: str) -> bytes:
    img = next(p for p in _sides(title) if f"Side {side}" in p.name)
    disk = c64.read_image(img)
    entry = next(e for e in c64.directory(disk) if e.name == name)
    data, problem = c64.read_file_checked(disk, entry)
    assert problem is None, f"{title}/{name}: {problem}"
    return S.body(data)


@unittest.skipUnless(C64_SETS.is_dir(), "C64 disk sets not present")
class SevenTitleCallerSweepTests(unittest.TestCase):
    """2026-08-13 (docs/engine/research/c64-sprite-format.md section 16): every previous hunt for
    GDRIVE01's sprite-composite parameter-block caller ran on Champions of Krynn + Death Knights
    of Krynn only, then reported its negative as if it were about the format. Standing rule 5 says
    sweep all seven titles. These tests pin that sweep and its adjudication.

    The claim under test was that a genuine reference exists in one of the five never-swept
    corpora, with Buck Rogers COMBAT @2464/@2536 the named first candidate. It is REFUTED: every
    surviving candidate is a false positive of one of the two mechanisms already documented in
    sections 8.2/8.4."""

    def test_gdrive01_body_is_byte_identical_in_all_seven_titles(self) -> None:
        """The premise that lets Champions of Krynn's `GDRIVE01_PARAM_BLOCK` and
        `GDRIVE01_SELFMOD_PATCH_TARGETS` be reused on the other six titles without re-derivation.
        Checked on EVERY side, not one per title, so a single divergent copy would surface."""
        checked = 0
        loadwords: dict[str, set[int]] = {}
        for title in ALL_SEVEN_TITLES:
            for img in _sides(title):
                disk = c64.read_image(img)
                for entry in c64.directory(disk):
                    if entry.name != "GDRIVE01":
                        continue
                    data, problem = c64.read_file_checked(disk, entry)
                    self.assertIsNone(problem, f"{title}/{img.name}: {problem}")
                    body = S.body(data)
                    self.assertEqual(hashlib.sha256(body).hexdigest(), S.GDRIVE01_BODY_SHA256,
                                     f"{title}/{img.name}: GDRIVE01 body is not the shared one")
                    self.assertEqual(len(body), 2560)
                    loadwords.setdefault(title, set()).add(
                        int.from_bytes(data[:2], "little"))
                    checked += 1
        # non-vacuity: the loop really ran, on every title, many times. 46 of the corpus's 49
        # sides carry a GDRIVE01 -- the three that do not are Champions of Krynn's "Savedisk",
        # Pool of Radiance's "Boot" and Pool of Radiance "Side 9", none of them a content side.
        # Pinned exactly so a silently-shrinking sweep cannot read as a pass.
        self.assertEqual(checked, 46, "the GDRIVE01 per-side census changed")
        self.assertEqual(len(loadwords), 7, "a title contributed no GDRIVE01 at all")
        # ... and the load word is genuinely NOT the residence: same bytes, three addresses.
        self.assertEqual({tuple(sorted(v)) for v in loadwords.values()},
                         {(0x4000,), (0x3000,), (0x1388,)})

    def test_origin_census_pins_gdrive01_to_c000_in_every_title(self) -> None:
        """Re-derives the residence per title from the body's own 25-entry JMP table instead of
        assuming $C080 transfers. $C000 is the UNIQUE best origin (25/25 targets inside the body);
        the runner-up scores strictly worse, so this is a pin, not a tie broken by sort order."""
        checked = 0
        for title in ALL_SEVEN_TITLES:
            body = _named(title, 1, "GDRIVE01")
            table = S.leading_jmp_table(body)
            self.assertEqual(len(table), 25, f"{title}: GDRIVE01 jump table is not 25 entries")
            scored = S.origin_census(body, targets=table)
            self.assertEqual(scored[0], (1.0, 0xC000), f"{title}: best origin is not $C000")
            self.assertLess(scored[1][0], 1.0, f"{title}: $C000 is not the UNIQUE best origin")
            checked += 1
        self.assertEqual(checked, 7)

    # ---------------------------------------------------------------------------------------
    # The adjudication metric itself. Standing rule 2: the REAL population is NOT a hand-picked
    # shortlist -- an earlier draft of this test used four cherry-picked references and reported a
    # floor of 0.83, which the full population immediately refuted. It is now every raw hit BOTH
    # scanners produce inside GDRIVE01's own body (42 of them), which is the whole set of literal
    # $C080-$C08F / patch-target operands the shared driver contains.
    KNOWN_FALSE_POSITIVES = [                # settled by hand in docs sections 8.2 / 8.4
        ("Champions of Krynn", "DUNGEON", 6244),
        ("Death Knights of Krynn", "DUNGEON", 5731),
        ("Champions of Krynn", "LIBRARY", 514),
        ("Death Knights of Krynn", "LIBRARY", 427),
        ("Death Knights of Krynn", "GEN", 6323),
    ]

    #: Every code-like raw hit this round adjudicated as NOT a reference (section 16.5's own
    #: table), as (title, file, body offset). This is the round's OWN false-positive population,
    #: not the five hand-settled cases carried over from sections 8.2/8.4.
    ROUND_FALSE_POSITIVES = [
        ("Champions of Krynn", "GDRIVE00", 1348), ("Death Knights of Krynn", "GDRIVE00", 1348),
        ("Curse of the Azure Bonds", "GDRIVE00", 1348),
        ("Secret of the Silver Blades", "GDRIVE00", 1348),
        ("Gateway to the Savage Frontier", "GDRIVE00", 1348),
        ("Buck Rogers - Countdown to Doomsday", "GDRIVE00", 1348),
        ("Champions of Krynn", "DUNGEON", 6244), ("Death Knights of Krynn", "DUNGEON", 5731),
        ("Secret of the Silver Blades", "DUNGEON", 6251),
        ("Champions of Krynn", "LIBRARY", 514), ("Death Knights of Krynn", "LIBRARY", 427),
        ("Secret of the Silver Blades", "LIBRARY", 3054),
        ("Buck Rogers - Countdown to Doomsday", "COMBAT", 2464),
        ("Buck Rogers - Countdown to Doomsday", "COMBAT", 2536),
        ("Curse of the Azure Bonds", "ECL64", 432),
        ("Secret of the Silver Blades", "ECL64", 447),
        ("Pool of Radiance", "POST.COM", 7156),
    ]

    def test_alignment_vote_does_not_separate_real_references_from_false_positives(self) -> None:
        """CORRECTED 2026-08-13. This test previously asserted a clean `(0.458, 0.667)` separating
        gap, and it was wrong for a reason this project has a standing rule about.

        The round correctly widened the REAL population from four cherry-picked references to all
        42 raw hits in GDRIVE01's own body -- and left the FALSE-POSITIVE population frozen at the
        five hand-settled cases inherited from sections 8.2/8.4, a set assembled for a different
        question (a two-title, by-eye adjudication). That is standing rule 2: inheriting a
        population from a function/section written for a different question is itself a filter.
        Fixing one side of a comparison and not the other manufactures the gap.

        Scored against the round's OWN complete adjudicated false-positive set -- the 17 code-like
        hits section 16.5 tabulates, every one disassembled and ruled not-a-reference -- the votes
        run 0.000 to 1.000. **Seven of them sit AT OR ABOVE the real population's 0.667 floor**
        (six `GDRIVE00` @0.958, Pool of Radiance `POST.COM` @1.000). There is no separating
        threshold, and this test now pins that rather than the reverse.

        The vote is still worth computing -- a 0.00 remains strong evidence of an operand-tail
        misread, which is how the `LIBRARY`/`ECL64` cases were settled -- but only as one stage of
        the three-stage gate, never as a threshold. Every adjudication in section 16 was made by
        reading the disassembly; none rested on the vote, so the REFUTED verdict is unaffected.
        """
        gd01 = _named("Champions of Krynn", 1, "GDRIVE01")
        offs = sorted(set(S.find_param_block_refs(gd01))
                      | set(S.find_selfmod_patch_target_refs(gd01)))
        self.assertEqual(len(offs), 42, "GDRIVE01's own raw-hit population changed")
        real = [S.alignment_vote(gd01, o)[0] for o in offs]
        self.assertAlmostEqual(min(real), 0.6667, places=3)
        # the three lowest real scores, pinned by offset so the floor claim stays checkable
        self.assertEqual(sorted(o for o, v in zip(offs, real) if v < 0.83), [702, 708, 1115])

        fake = []
        for title, name, off in self.ROUND_FALSE_POSITIVES:
            body = _body_anywhere(title, name)
            self.assertIsNotNone(body, f"{title}/{name} not found on any side")
            fake.append((S.alignment_vote(body, off)[0], title, name, off))
        self.assertEqual(len(fake), 17, "the adjudicated false-positive population changed")

        votes = [v for v, *_ in fake]
        self.assertAlmostEqual(max(votes), 1.0, places=3)
        self.assertAlmostEqual(min(votes), 0.0, places=3)
        # The refutation proper: false positives overlap, and overshoot, the real floor.
        overlapping = sorted(v for v in votes if v >= min(real))
        self.assertEqual(len(overlapping), 7, f"overlap changed: {sorted(fake, reverse=True)[:9]}")
        self.assertGreater(max(votes), min(real),
                           "a separating gap has appeared; re-derive before trusting it")
        # The six GDRIVE00 copies are one shared body, so they contribute one distinct value.
        self.assertEqual(sorted({round(v, 3) for v in overlapping}), [0.958, 1.0])

    def test_alignment_vote_alone_is_not_sufficient_it_scores_data_at_1_00(self) -> None:
        """The honest limitation, pinned so nobody later uses the vote as a standalone verdict.

        Two ways it fails high. (a) In non-code data a perfect 1.00 is routine -- 47 of the 106
        raw hits this sweep found in data-like files score exactly 1.00; Champions of Krynn's
        TITLEPG (43.9% illegal opcodes, ruled out as picture data in section 9.1) is one.
        (b) Even inside a CODE-like file it fires on an embedded ASCII string: Pool of Radiance's
        POST.COM scores 8.8% illegal, comfortably code, yet its hit sits in the literal text
        "GIVE HOW MUCH \\x00" and votes 1.00."""
        titlepg = _named("Champions of Krynn", 1, "TITLEPG")
        self.assertEqual(S.alignment_vote(titlepg, 2589), (1.0, 24, 0))
        self.assertGreater(S.illegal_opcode_fraction(titlepg), 0.40)

        post = _named("Pool of Radiance", 1, "POST.COM")
        self.assertEqual(S.alignment_vote(post, 7156), (1.0, 24, 0))
        self.assertLess(S.illegal_opcode_fraction(post), self.CODE_LIKE_CEILING)
        self.assertEqual(post[7143:7157], b"GIVE HOW MUCH ")   # the hit IS the trailing space

    # ---------------------------------------------------------------------------------------
    # The sweep itself. Adjudicated shortlist: every raw hit in a code-like file, all titles.
    CODE_LIKE_CEILING = 0.10     # docs section 9.1's confirmed-code ceiling (DoK DUNGEON, 9.0%)

    # (title, file, kind, offset) -> why it is not the caller. Every entry disassembled.
    ADJUDICATED = {
        # GDRIVE00's call into its OWN subroutine at $C8FF, which merely shares an address with
        # one of GDRIVE01's self-modified operands (docs section 9.4). Present in six titles --
        # Pool of Radiance ships a different, 3038-byte GDRIVE00 that does not have it.
        ("Buck Rogers - Countdown to Doomsday", "GDRIVE00", "selfmod", 1348): "aliasing",
        ("Champions of Krynn", "GDRIVE00", "selfmod", 1348): "aliasing",
        ("Curse of the Azure Bonds", "GDRIVE00", "selfmod", 1348): "aliasing",
        ("Death Knights of Krynn", "GDRIVE00", "selfmod", 1348): "aliasing",
        ("Gateway to the Savage Frontier", "GDRIVE00", "selfmod", 1348): "aliasing",
        ("Secret of the Silver Blades", "GDRIVE00", "selfmod", 1348): "aliasing",
        # The shared DUNGEON data table, $C3-desync case (docs section 8.2) -- now in a THIRD
        # title, at its own shifted offset.
        ("Champions of Krynn", "DUNGEON", "param", 6244): "desync",
        ("Death Knights of Krynn", "DUNGEON", "param", 5731): "desync",
        ("Secret of the Silver Blades", "DUNGEON", "param", 6251): "desync",
        # The LIBRARY `STA ($4C),Y; DEY; CPY #$FF` misread as JMP $C088 (docs section 8.2) --
        # also now in a third title.
        ("Champions of Krynn", "LIBRARY", "param", 514): "operand-tail",
        ("Death Knights of Krynn", "LIBRARY", "param", 427): "operand-tail",
        ("Secret of the Silver Blades", "LIBRARY", "param", 3054): "operand-tail",
        # NEW this round, the task's named first candidate: Buck Rogers COMBAT. Both hits are the
        # trailing $BE operand byte of a real `LDA $BE75` plus the opcode and low operand byte of
        # the real `STA $BDC0` right after it -- section 8.4's GEN mechanism exactly.
        ("Buck Rogers - Countdown to Doomsday", "COMBAT", "param", 2464): "operand-tail",
        ("Buck Rogers - Countdown to Doomsday", "COMBAT", "param", 2536): "operand-tail",
        # NEW this round: ECL64 is real 6502 code (2.3-2.8% illegal, the lowest of any hit-bearing
        # file) residing near $8000, not $C000. Its hit is the low operand byte of a real
        # `JSR $820E`/`JSR $821D`.
        ("Curse of the Azure Bonds", "ECL64", "param", 432): "operand-tail",
        ("Secret of the Silver Blades", "ECL64", "param", 447): "operand-tail",
        # NEW this round: Pool of Radiance POST.COM's hit is inside the ASCII string
        # "GIVE HOW MUCH \x00".
        ("Pool of Radiance", "POST.COM", "selfmod", 7156): "ascii-string",
    }

    def test_no_genuine_caller_reference_in_any_of_the_seven_title_corpora(self) -> None:
        """The headline sweep: both existing scanners over every readable PRG on all 49 sides of
        all seven titles, deduplicated by (name, body sha256). Every raw hit that lands in a
        code-like file must be one of the adjudicated false positives above."""
        found: dict[tuple, int] = {}
        scanned = seen_titles = 0
        for title in ALL_SEVEN_TITLES:
            seen: set[tuple[str, str]] = set()
            before = scanned
            for img in _sides(title):
                disk = c64.read_image(img)
                for entry in c64.directory(disk):
                    if entry.file_type != "PRG":
                        continue
                    try:
                        data, problem = c64.read_file_checked(disk, entry)
                    except Exception:      # noqa: BLE001 - a broken chain is not this test's job
                        continue
                    if problem:
                        continue
                    body = S.body(data)
                    key = (entry.name, hashlib.sha256(body).hexdigest())
                    if key in seen:
                        continue
                    seen.add(key)
                    scanned += 1
                    if entry.name == "GDRIVE01":
                        continue           # its own self-patching, not a caller (section 9.3)
                    if S.illegal_opcode_fraction(body) >= self.CODE_LIKE_CEILING:
                        continue           # data file: adjudicated as a family, see section 16.4
                    for kind, hits in (("param", S.find_param_block_refs(body)),
                                        ("selfmod", S.find_selfmod_patch_target_refs(body))):
                        for off in hits:
                            found[(title, entry.name, kind, off)] = \
                                found.get((title, entry.name, kind, off), 0) + 1
            self.assertGreater(scanned, before, f"{title}: scanned nothing at all")
            seen_titles += 1

        self.assertEqual(seen_titles, 7)
        self.assertEqual(scanned, 2662, "the scanned-file census changed")
        unexpected = sorted(set(found) - set(self.ADJUDICATED))
        self.assertEqual(unexpected, [],
                         "a code-like file now references GDRIVE01's parameter block or one of "
                         "its self-modified operands at a site nobody has disassembled -- this "
                         f"may finally be the caller: {unexpected}")
        missing = sorted(set(self.ADJUDICATED) - set(found))
        self.assertEqual(missing, [], f"an adjudicated hit vanished: {missing}")

    def test_alignment_vote_has_a_null_near_one_half_at_arbitrary_offsets(self) -> None:
        """Round 9. `alignment_vote` was calibrated by comparing real hits to false-positive
        hits, but its NULL was never measured: what does it score at an arbitrary offset?

        About half of all offsets already clear the real population's 0.667 floor, and in
        picture data most score a perfect 1.000. That is why no threshold separates the two
        populations -- a statistic with a ~0.5 null cannot produce a gap -- and it is why the
        vote must never be quoted without a disassembly beside it."""
        expect = {
            "GDRIVE01": (2512, 0.468, 0.306),
            "LIBRARY": (7387, 0.455, 0.283),
            "TITLEPG": (4442, 0.698, 0.590),
        }
        measured = {}
        for name in expect:
            body = _body_anywhere("Champions of Krynn", name)
            self.assertIsNotNone(body, f"{name} not found")
            votes = [S.alignment_vote(body, off)[0] for off in range(24, len(body) - 24)]
            self.assertGreater(len(votes), 0)
            measured[name] = (
                len(votes),
                sum(1 for v in votes if v >= 0.667) / len(votes),
                sum(1 for v in votes if v == 1.0) / len(votes),
            )
        for name, (n, frac, perfect) in expect.items():
            got_n, got_frac, got_perfect = measured[name]
            with self.subTest(body=name):
                self.assertEqual(got_n, n)
                self.assertAlmostEqual(got_frac, frac, places=2)
                self.assertAlmostEqual(got_perfect, perfect, places=2)
                # The load-bearing consequence: the null is nowhere near zero.
                self.assertGreater(got_frac, 0.40,
                                   "a >=0.667 vote would be informative after all -- "
                                   "re-derive section 16.3's no-separating-gap conclusion")

    def test_the_param_block_hit_count_is_not_elevated_above_neighbouring_address_windows(self) -> None:
        """Round 9. The sweep's raw-hit count against $C080-$C08F had no baseline. Scanning the
        four adjacent 16-byte windows with the identical scanner over the identical files, the
        parameter block draws FEWER hits than three of its four neighbours -- none of which is
        a parameter block anyone is hunting.

        This is a second, adjudication-free route to section 16's REFUTED verdict: the hit rate
        itself is unremarkable, so the hits need no special explanation."""
        windows = {
            "$C060-$C06F": set(range(0xC060, 0xC070)),
            "$C070-$C07F": set(range(0xC070, 0xC080)),
            "$C080-$C08F": set(range(0xC080, 0xC090)),
            "$C090-$C09F": set(range(0xC090, 0xC0A0)),
            "$C0A0-$C0AF": set(range(0xC0A0, 0xC0B0)),
        }
        counts = {k: 0 for k in windows}
        scanned = 0
        for title in ALL_SEVEN_TITLES:
            seen: set[tuple[str, str]] = set()
            for img in _sides(title):
                disk = c64.read_image(img)
                for entry in c64.directory(disk):
                    if entry.file_type != "PRG":
                        continue
                    try:
                        data, problem = c64.read_file_checked(disk, entry)
                    except Exception:      # noqa: BLE001
                        continue
                    if problem:
                        continue
                    body = S.body(data)
                    key = (entry.name, hashlib.sha256(body).hexdigest())
                    if key in seen:
                        continue
                    seen.add(key)
                    if entry.name == "GDRIVE01":
                        continue
                    if S.illegal_opcode_fraction(body) >= self.CODE_LIKE_CEILING:
                        continue
                    scanned += 1
                    for label, addrs in windows.items():
                        counts[label] += len(disasm.find_stores(body, 0x0800, addrs))

        self.assertEqual(scanned, 439, "the code-like file census changed")
        self.assertEqual(counts, {
            "$C060-$C06F": 40, "$C070-$C07F": 47, "$C080-$C08F": 10,
            "$C090-$C09F": 7, "$C0A0-$C0AF": 20,
        })
        block = counts["$C080-$C08F"]
        neighbours = [v for k, v in counts.items() if k != "$C080-$C08F"]
        self.assertLess(block, max(neighbours))
        self.assertEqual(sum(1 for v in neighbours if v > block), 3)

    #: The families §16.4 names when it rules the data-like hits out collectively.
    NAMED_DATA_FAMILIES = ("ECL", "PIC", "WALLDEF", "WALLSET", "SPRITE", "BODY", "GEO",
                           "COMPIC", "HEAD", "TITLEPG")

    def test_the_data_like_hit_population_splits_into_named_families_and_nine_others(self) -> None:
        """Round 9 correction. Section 16.4 rules out 'the 106 data-like hits' by naming ten
        resource families and quoting 17.3%-52.8% illegal opcodes. Both numbers are real but
        they describe only **97** of the 106.

        Nine hits are in files no listed family covers -- GDRIVE04 (5), GDRIVE03 (2),
        COM.PREP (1), GEN (1) -- and they score 10.21%-17.89%, i.e. sitting just over the 10%
        code-like ceiling, which is precisely where a 'this is data' dismissal is weakest.
        Each of those four files is adjudicated individually elsewhere in the doc, so the
        verdict never depended on the family sentence; what was wrong was a summary appearing
        to cover files it does not name.

        This test exists because NOTHING pinned the data-like side of the sweep -- the
        adjudication census `test_no_code_like_file_in_any_of_the_seven_titles_references...`
        `continue`s past every data-like file, so its range could drift silently."""
        named_hits: list[float] = []
        other_hits: list[tuple[str, str, float]] = []
        scanned = 0
        for title in ALL_SEVEN_TITLES:
            seen: set[tuple[str, str]] = set()
            for img in _sides(title):
                disk = c64.read_image(img)
                for entry in c64.directory(disk):
                    if entry.file_type != "PRG":
                        continue
                    try:
                        data, problem = c64.read_file_checked(disk, entry)
                    except Exception:      # noqa: BLE001
                        continue
                    if problem:
                        continue
                    body = S.body(data)
                    key = (entry.name, hashlib.sha256(body).hexdigest())
                    if key in seen:
                        continue
                    seen.add(key)
                    if entry.name == "GDRIVE01":
                        continue
                    frac = S.illegal_opcode_fraction(body)
                    if frac < self.CODE_LIKE_CEILING:
                        continue
                    scanned += 1
                    in_family = any(entry.name.startswith(f) for f in self.NAMED_DATA_FAMILIES)
                    for _, offs in (("param", S.find_param_block_refs(body)),
                                    ("selfmod", S.find_selfmod_patch_target_refs(body))):
                        for _off in offs:
                            if in_family:
                                named_hits.append(frac)
                            else:
                                other_hits.append((title, entry.name, frac))

        self.assertGreater(scanned, 0, "no data-like file was examined at all")
        self.assertEqual(len(named_hits) + len(other_hits), 106,
                         "the data-like raw-hit total changed")
        self.assertEqual(len(named_hits), 97)
        self.assertEqual(len(other_hits), 9)

        # The doc's quoted range belongs to the named families only.
        self.assertAlmostEqual(100 * min(named_hits), 17.32, places=1)
        self.assertAlmostEqual(100 * max(named_hits), 52.82, places=1)
        # The nine others sit just above the code-like ceiling, not deep in data territory.
        self.assertAlmostEqual(100 * min(f for _, _, f in other_hits), 10.21, places=1)
        self.assertAlmostEqual(100 * max(f for _, _, f in other_hits), 17.89, places=1)
        self.assertGreater(min(f for _, _, f in other_hits), self.CODE_LIKE_CEILING)
        # Exactly which files they are -- so a new unadjudicated one cannot hide in the count.
        counts: dict[str, int] = {}
        for _, name, _ in other_hits:
            counts[name] = counts.get(name, 0) + 1
        self.assertEqual(counts, {"GDRIVE04": 5, "GDRIVE03": 2, "COM.PREP": 1, "GEN": 1})

    def test_the_buck_rogers_combat_hits_are_operand_tail_coincidences(self) -> None:
        """The task's named first candidate, pinned byte-exactly. At both offsets the real
        instruction stream is `LDA $BE75` (AD 75 BE) then `STA $BDC0` (8D C0 BD); the scanner
        reads the LDA's trailing $BE as an `LDX abs,Y` opcode and the STA's `8D C0` as its
        operand, spelling $C08D. Nothing in the window is misdecoded -- it is all real code."""
        body = _named("Buck Rogers - Countdown to Doomsday", 1, "COMBAT")
        self.assertLess(S.illegal_opcode_fraction(body), self.CODE_LIKE_CEILING)
        for off in (2464, 2536):
            self.assertEqual(body[off - 2:off + 4], bytes([0xAD, 0x75, 0xBE, 0x8D, 0xC0, 0xBD]))
            self.assertEqual(body[off], 0xBE)                      # LDX abs,Y -- the false opcode
            self.assertEqual(body[off + 1] | (body[off + 2] << 8), 0xC08D)
            vote, _, _ = S.alignment_vote(body, off)
            self.assertAlmostEqual(vote, 0.125, places=3)          # deep in the false-positive band

    def test_the_secret_dungeon_hit_is_the_same_shared_table_as_champions_and_death_knights(self) -> None:
        """Secret of the Silver Blades' DUNGEON carries the same non-code table as Champions of
        Krynn and Death Knights, at its own shifted offset -- a third independent title.

        ROUND 9 CORRECTION. This docstring used to claim Secret reproduces Champions of Krynn's
        AND Death Knights' copy 'byte-for-byte ... except one byte'. Death Knights was never
        loaded by this test, and it does not: it has `1E` where the other two have `20`, so
        against Death Knights the window differs in TWO bytes, not one, and Death Knights does
        not contain the quoted `20 8D C0 7E` string at all. All three titles are now read and
        every pair's difference count is asserted.

        What survives is the actual evidence for the section 8.2 reading: the prefix
        `7E AE BF 7E BD` and the `8D C0 7E` tail are identical in all three, and the bytes that
        vary are exactly the ones a shared table with per-title data would vary in."""
        cok = _named("Champions of Krynn", 1, "DUNGEON")
        dok = _named("Death Knights of Krynn", 1, "DUNGEON")
        ssb = _named("Secret of the Silver Blades", 1, "DUNGEON")

        # The invariant prefix -- identical in all three titles. This is the shared-table claim.
        for body, off in ((cok, 6244), (dok, 5731), (ssb, 6251)):
            self.assertEqual(body[off - 6:off - 1], bytes([0x7E, 0xAE, 0xBF, 0x7E, 0xBD]))
            self.assertIn(0xC3, body[off - 12:off], "expected the $C3 desync marker")
            # The tail is shared by all three; the byte AT the hit is not (see below).
            self.assertEqual(body[off + 1:off + 4], bytes([0x8D, 0xC0, 0x7E]))

        # Champions of Krynn and Secret carry `20` at the hit; Death Knights carries `1E`.
        self.assertEqual((cok[6244], ssb[6251]), (0x20, 0x20))
        self.assertEqual(dok[5731], 0x1E, "Death Knights' copy is not the 20 8D C0 7E string")
        self.assertEqual(cok[6244:6248], bytes([0x20, 0x8D, 0xC0, 0x7E]))
        self.assertEqual(ssb[6251:6255], bytes([0x20, 0x8D, 0xC0, 0x7E]))

        # Per-pair difference counts over the full 12-byte window, so "one byte" can never
        # again be quoted against the wrong title.
        wins = {"cok": cok[6238:6250], "dok": dok[5725:5737], "ssb": ssb[6245:6257]}
        self.assertEqual(len(set(len(w) for w in wins.values())), 1)

        def ndiff(a: bytes, b: bytes) -> list[int]:
            return [i for i, (x, y) in enumerate(zip(a, b)) if x != y]

        self.assertEqual(ndiff(wins["cok"], wins["ssb"]), [5, 11])
        self.assertEqual(ndiff(wins["dok"], wins["ssb"]), [5, 6, 11])
        self.assertEqual(ndiff(wins["cok"], wins["dok"]), [5, 6, 11])
        # Over the span the doc quotes (prefix + hit + tail, excluding the trailing pair),
        # Champions/Secret differ in exactly the one byte the doc names -- and only there.
        self.assertEqual(ndiff(wins["cok"][:10], wins["ssb"][:10]), [5])
        self.assertEqual((cok[6243], ssb[6250]), (0xB5, 0xA0))
        self.assertEqual(ndiff(wins["dok"][:10], wins["ssb"][:10]), [5, 6])

    def test_gdrive03_and_gdrive04_hits_are_calls_into_their_own_c000_bodies(self) -> None:
        """The bonus lead: Curse of the Azure Bonds and Gateway to the Savage Frontier DO ship
        GDRIVE03. Curse's copy makes two well-aligned `JSR $C08A` -- the best-looking new
        candidate in the whole sweep -- but its own origin census puts it in the $C000 slot, where
        $C08A is its own internal pointer-setup subroutine. Same for Death Knights' GDRIVE04 and
        its `JMP $C088`. Address-space aliasing, section 9.4's mechanism, in two more files.

        (Both files score above the code-like ceiling -- 17.9% and 10.5% -- so neither reaches the
        sweep test above; they are adjudicated here so the exclusion is evidenced, not assumed.)"""
        g03 = _named("Curse of the Azure Bonds", 1, "GDRIVE03")
        self.assertEqual(S.leading_jmp_table(g03), [], "GDRIVE03 has no dispatch table")
        self.assertEqual(S.origin_census(g03)[0][1], 0xC000, "GDRIVE03 is not $C000-resident")
        self.assertEqual(S.find_param_block_refs(g03), [897, 902])
        self.assertEqual(g03[897:900], bytes([0x20, 0x8A, 0xC0]))     # JSR $C08A
        # $C08A in its OWN body: a coherent pointer-setup routine, not GDRIVE01's parameter block
        self.assertEqual(g03[0x8A:0x94],
                         bytes([0xBD, 0x61, 0xC1, 0x85, 0x07, 0xBD, 0x6B, 0xC1, 0x85, 0x08]))

        g04 = _named("Death Knights of Krynn", 1, "GDRIVE04")
        self.assertEqual(S.origin_census(g04)[0][1], 0xC000, "GDRIVE04 is not $C000-resident")
        self.assertIn(176, S.find_param_block_refs(g04))
        self.assertEqual(g04[176:179], bytes([0x4C, 0x88, 0xC0]))     # JMP $C088
        self.assertEqual(g04[0x88:0x8C], bytes([0xA2, 0xDF, 0xA0, 0xC0]))   # LDX #$DF; LDY #$C0

        # Gateway's GDRIVE03 is a DIFFERENT file under the same name: 1281-byte body, and its own
        # origin census does NOT put it in the $C000 slot. It produces no hits at all.
        gate = _named("Gateway to the Savage Frontier", 1, "GDRIVE03")
        self.assertEqual(len(gate), 1281)
        self.assertNotEqual(S.origin_census(gate)[0][1], 0xC000)
        self.assertEqual(S.find_param_block_refs(gate), [])
        self.assertEqual(S.find_selfmod_patch_target_refs(gate), [])

    def test_the_pointer_build_idiom_is_absent_from_every_code_like_file_in_all_seven_titles(self) -> None:
        """Standing rule 4: the third search idiom. Only two code-like files in the entire
        seven-title corpus carry an immediate `#$C0` near an immediate `#$80-$8F`, and in both the
        two immediates feed unrelated destinations (`STA $A85F` / an A+X argument pair to a JSR),
        not a zero-page pointer to $C08x."""
        code_like_with_idiom = []
        scanned = 0
        for title in ALL_SEVEN_TITLES:
            seen: set[tuple[str, str]] = set()
            for img in _sides(title):
                disk = c64.read_image(img)
                for entry in c64.directory(disk):
                    if entry.file_type != "PRG":
                        continue
                    try:
                        data, problem = c64.read_file_checked(disk, entry)
                    except Exception:      # noqa: BLE001
                        continue
                    if problem:
                        continue
                    body = S.body(data)
                    key = (entry.name, hashlib.sha256(body).hexdigest())
                    if key in seen:
                        continue
                    seen.add(key)
                    scanned += 1
                    sites = S.find_pointer_build_sites(body)
                    if sites and S.illegal_opcode_fraction(body) < self.CODE_LIKE_CEILING:
                        code_like_with_idiom.append((title, entry.name, tuple(sites)))
        self.assertEqual(scanned, 2662, "the scanned-file census changed")
        self.assertEqual(sorted(code_like_with_idiom), [
            ("Death Knights of Krynn", "COMBAT", (5692,)),
            ("Secret of the Silver Blades", "COMBAT", (6983,)),
        ])
        # Both: `LDA #$C0; STA $A85F` (a flag store) then `LDA #$83; LDX #$2E; JSR ...` -- the
        # A/X pair is this engine's message-index call, not a pointer high/low byte pair.
        dok = _named("Death Knights of Krynn", 1, "COMBAT")
        self.assertEqual(dok[5679:5684], bytes([0xA9, 0xC0, 0x8D, 0x5F, 0xA8]))   # LDA #$C0;STA $A85F
        self.assertEqual(dok[5692:5699],
                         bytes([0xA9, 0x83, 0xA2, 0x2E, 0x20, 0xEF, 0x25]))       # LDA #$83;LDX #$2E;JSR


if __name__ == "__main__":
    unittest.main()
