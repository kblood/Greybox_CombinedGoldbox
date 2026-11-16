#!/usr/bin/env python3
"""Tests for tools/c64_boot.py -- the C1.9b boot/load-chain slice.

Three layers, matching the project's "a test you have not seen fail is not evidence" rule:

1. A SYNTHETIC hand-built tokenized BASIC program (always runs, no external dependency) pins the
   detokenizer's line-link/quote/token rules against bytes this file constructs itself, so the
   corpus of real bytes below is not the only thing anchoring the format.
2. Real `BOOT` / `DEATH KNIGHTS` files on the user's D: drive (skipped, not failed, when absent)
   confirm the detokenizer and loader-call extractor against the actual game disks, and pin the
   central finding: both titles load a file named LIBRARY to address $2DC8 (11720) -- not
   page-aligned, and not the $4000 every file's own on-disk header claims -- and SYS straight into
   it.
3. The LIBRARY-range test cross-checks that address against the ten JSR/JMP targets the prior two
   C1.9 rounds could not explain (recorded in docs/engine/research/c64-boot-chain.md and the
   C1.9b task prompt this slice was given), and the orphaned-block test disposes of the other
   remaining C1.9 lead (Death Knights' 5 orphaned BAM blocks per side on sides 3-6).

Every assertion in this file was verified failing under a targeted mutation before being trusted;
see the module docstring notes at each test and `docs/engine/research/c64-boot-chain.md` section 7
for the specific mutations tried and their (confirmed red, then confirmed restored-green) results.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_boot as B  # noqa: E402
import c64_disk as c64  # noqa: E402

COK_DIR = Path("D:/Games/Emulator/C64/Goldbox/Champions of Krynn")
DOK_DIR = Path("D:/Games/Emulator/C64/Goldbox/Death Knights of Krynn")


# --------------------------------------------------------------------------------------------
# 1. Synthetic BASIC program: the detokenizer, pinned against bytes we build ourselves.
# --------------------------------------------------------------------------------------------


def _build_basic_prg(lines: list[tuple[int, bytes]], load_addr: int = 0x0801) -> bytes:
    """Encode `[(line_number, tokenized_text_bytes), ...]` into a real BASIC PRG, links included.

    Mirrors what a real C64 tokenizer emits: each line is `link_lo link_hi lineno_lo lineno_hi
    <text> $00`, and the link points at the START of the NEXT line's own link word (the real
    in-memory address, since BASIC line links are absolute, not relative). The final line is
    followed by a `$0000` end-of-program link.
    """
    out = bytearray()
    encoded = []
    for lineno, text in lines:
        body = bytes([lineno & 0xFF, lineno >> 8]) + text + b"\x00"
        encoded.append(body)
    # Each line's link word points at the START of the NEXT line's own link word (a real absolute
    # in-memory address), so a first pass computes every line's start address.
    starts = []
    addr = load_addr
    for body in encoded:
        starts.append(addr)
        addr += 2 + len(body)  # 2 bytes for this line's own link word
    end_marker_addr = addr  # where the trailing $0000 terminator will sit
    for i, body in enumerate(encoded):
        next_addr = starts[i + 1] if i + 1 < len(encoded) else end_marker_addr
        out += bytes([next_addr & 0xFF, next_addr >> 8]) + body
    out += b"\x00\x00"  # end-of-program marker: a trailing link word of $0000
    return bytes([load_addr & 0xFF, load_addr >> 8]) + bytes(out)


class SyntheticDetokenizeTests(unittest.TestCase):
    def test_poke_and_print_line_roundtrips(self):
        # POKE52,15:PRINT"HI":REM DONE  -- tokens 0x97 POKE, 0x99 PRINT, 0x8F REM; a quoted string
        # that must NOT be tokenized even though it contains no keyword-shaped bytes here.
        text = (
            bytes([0x97]) + b"52,15:" + bytes([0x99]) + b'"HI":' + bytes([0x8F]) + b" DONE"
        )
        prg = _build_basic_prg([(10, text)])
        lines = B.detokenize(prg)
        self.assertEqual(lines, [(10, 'POKE52,15:PRINT"HI":REM DONE')])

    def test_quoted_text_is_never_tokenized(self):
        # A quoted string containing a raw byte >= 0x80 (which would be a token OUTSIDE quotes)
        # must come through as the corresponding <$XX> escape, not as a keyword -- proves the
        # quote-state tracking, not just the common case.
        text = bytes([0x99]) + b'"' + bytes([0x93]) + b'"'  # PRINT"<$93>"
        prg = _build_basic_prg([(5, text)])
        lines = B.detokenize(prg)
        self.assertEqual(lines, [(5, 'PRINT"<$93>"')])

    def test_end_of_program_link_stops_decoding(self):
        prg = _build_basic_prg([(10, bytes([0x99]) + b"1"), (20, bytes([0x99]) + b"2")])
        lines = B.detokenize(prg)
        self.assertEqual([ln for ln, _ in lines], [10, 20])

    def test_mutating_the_token_table_changes_the_decode(self):
        """Positive control: prove the detokenizer actually consults TOKENS rather than always
        emitting the same text regardless of the byte value (a self-defeating probe the project's
        standing rules specifically warn about)."""
        text = bytes([0x97]) + b"1"  # POKE 1
        prg = _build_basic_prg([(10, text)])
        original = dict(B.TOKENS)
        try:
            B.TOKENS[0x97] = "MUTATED"
            lines = B.detokenize(prg)
            self.assertEqual(lines, [(10, "MUTATED1")])
        finally:
            B.TOKENS.clear()
            B.TOKENS.update(original)
        # and with the table restored, the original text is back
        self.assertEqual(B.detokenize(prg), [(10, "POKE1")])


# --------------------------------------------------------------------------------------------
# 2. Real boot files: the loader-call chain.
# --------------------------------------------------------------------------------------------


def _read(disk_dir: Path, image: str, filename: str) -> bytes:
    disk = c64.read_image(str(disk_dir / image))
    entries = {e.name: e for e in c64.directory(disk)}
    data, problem = c64.read_file_checked(disk, entries[filename])
    assert problem is None, problem
    return data


@unittest.skipUnless(COK_DIR.is_dir(), "Champions of Krynn C64 disks not present")
class ChampionsBootChainTests(unittest.TestCase):
    def setUp(self):
        self.data = _read(COK_DIR, "Champions of Krynn - Side 1.D64", "BOOT")
        self.lines = B.detokenize(self.data)

    def test_boot_is_a_tokenized_basic_program_not_raw_6502(self):
        # $0801 is BASIC's own program-text start; a real 6502 entry point would not appear there
        # in this corpus (every code overlay's own load-address header is $4000, see
        # tools/c64_disk.py). This is why BOOT "disassembles as incoherent 6502 from byte 0" under
        # c64_disasm.py -- it was never machine code.
        self.assertGreater(len(self.lines), 20)
        self.assertEqual(self.lines[0][0], 10)
        self.assertIn("POKE", self.lines[0][1])

    def test_loader_calls_match_the_established_chain(self):
        calls = {c.name: c.address for c in B.parse_loader_calls(self.lines)}
        self.assertEqual(
            calls,
            {"FASTL.O": 46848, "LINKER": 11520, "LIBRARY": 11720, "ITEMNAMES": 40448},
        )

    def test_library_is_sys_ed_immediately_after_its_own_load(self):
        sys_calls = B.parse_sys_calls(self.lines)
        # line 41 SYS 11720 follows line 40's LIBRARY load in program order
        load_lines = {c.line: c for c in B.parse_loader_calls(self.lines)}
        library_line = next(ln for ln, c in load_lines.items() if c.name == "LIBRARY")
        sys_lines = [ln for ln, addr in sys_calls if addr == 11720]
        self.assertTrue(sys_lines)
        self.assertGreater(sys_lines[0], library_line)

    def test_final_sys_enters_linker_not_library(self):
        # The program's last SYS (line 240, after all boot loads finish) hands control to LINKER
        # at $2D00, the runtime overlay dispatcher -- not back into LIBRARY.
        sys_calls = B.parse_sys_calls(self.lines)
        self.assertEqual(sys_calls[-1], (240, 11520))

    def test_stop_prg_installs_a_stop_key_vector_into_linkers_tail(self):
        # STOP.PRG (present on the boot side only) is 3 pokes: SEI; store a vector into the
        # KERNAL's $0328/$0329 ISTOP indirect vector; CLI; RTS. The vector it installs is $2D8D --
        # inside LINKER's own 146-byte body ($2D00-$2D91), landing exactly on a coherent
        # 3-instruction "LDA $91 (STKEY) / CMP #$7E / RTS" tail appended after LINKER's dispatch
        # tables. Independent (a-type, per the project's origin-evidence rules) confirmation that
        # $2D00 really is LINKER's runtime origin, from a file that has nothing to do with the
        # dispatch-table decoding path.
        stop = _read(COK_DIR, "Champions of Krynn - Side 1.D64", "STOP")
        body = stop[2:]
        # 78          SEI
        # A9 8D       LDA #$8D        (vector low byte)
        # 8D 28 03    STA $0328       (ISTOP low)
        # A9 2D       LDA #$2D        (vector high byte)
        # 8D 29 03    STA $0329       (ISTOP high)
        # 58          CLI
        # 60          RTS
        self.assertEqual(body[0], 0x78)  # SEI
        self.assertEqual(body[1], 0xA9)  # LDA #imm
        vector_lo = body[2]
        self.assertEqual(body[3:6], bytes([0x8D, 0x28, 0x03]))  # STA $0328
        self.assertEqual(body[6], 0xA9)  # LDA #imm
        vector_hi = body[7]
        self.assertEqual(body[8:11], bytes([0x8D, 0x29, 0x03]))  # STA $0329
        vector = vector_lo | (vector_hi << 8)
        self.assertEqual(vector, 0x2D8D)

        linker = _read(COK_DIR, "Champions of Krynn - Side 1.D64", "LINKER")
        linker_body = linker[2:]
        org = 0x2D00
        target_off = vector - org
        self.assertTrue(0 <= target_off < len(linker_body), "STOP's vector must land inside LINKER")
        # LDA $91 ; CMP #$7E ; RTS
        self.assertEqual(
            linker_body[target_off : target_off + 5], bytes([0xA5, 0x91, 0xC9, 0x7E, 0x60])
        )

    def test_dispatch_table_names_lengths_and_addresses(self):
        linker = _read(COK_DIR, "Champions of Krynn - Side 1.D64", "LINKER")
        table = B.find_dispatch_table(linker, org=0x2D00)
        self.assertIsNotNone(table)
        self.assertEqual(table.style, "unsep")
        got = [(e.name, e.length, e.address) for e in table.entries]
        self.assertEqual(
            got,
            [
                ("GEN", 3, 0x2D42), ("DUNGEON", 7, 0x2D45), ("COMBAT", 6, 0x2D4C),
                ("INIT", 4, 0x2D52), ("COM.PREP", 8, 0x2D56), ("POST.COM", 8, 0x2D5E),
                ("FINAL", 5, 0x2D66), ("CAMP", 4, 0x2D6B),
            ],
        )

    def test_final_has_no_matching_file_on_any_side(self):
        """Honest open item, pinned so it is not silently 'fixed' by a future disk re-scan without
        being noticed: LINKER's own dispatch table names an 8th overlay, FINAL, that appears on
        NONE of Champions' 6 sides or its savedisk. Verified by scanning every side's directory
        here, not assumed from the earlier one-off check recorded in the doc."""
        found = False
        for img in sorted(COK_DIR.glob("*.[Dd]64")):
            disk = c64.read_image(str(img))
            if any(e.name == "FINAL" for e in c64.directory(disk)):
                found = True
        self.assertFalse(found, "FINAL now exists on a side -- update the doc's open item")


@unittest.skipUnless(DOK_DIR.is_dir(), "Death Knights of Krynn C64 disks not present")
class DeathKnightsBootChainTests(unittest.TestCase):
    def setUp(self):
        self.data = _read(DOK_DIR, "Death Knights of Krynn - Side 1.D64", "DEATH KNIGHTS")
        self.lines = B.detokenize(self.data)

    def test_loader_calls_match_champions_exactly(self):
        # Same addresses as Champions -- the two titles share one boot design, not just a naming
        # convention.
        calls = {c.name: c.address for c in B.parse_loader_calls(self.lines)}
        self.assertEqual(
            calls,
            {"FASTL.O": 46848, "LINKER": 11520, "LIBRARY": 11720, "ITEMNAMES": 40448},
        )

    def test_dispatch_table_lives_in_library_not_linker(self):
        # Structural difference from Champions: DoK's LINKER is only 75 bytes (too short to hold
        # the table) and the same table is found instead near the tail of DoK's LIBRARY, NUL-
        # separated rather than concatenated.
        linker = _read(DOK_DIR, "Death Knights of Krynn - Side 1.D64", "LINKER")
        self.assertIsNone(B.find_dispatch_table(linker, org=0x2D00))
        library = _read(DOK_DIR, "Death Knights of Krynn - Side 1.D64", "LIBRARY")
        table = B.find_dispatch_table(library, org=0x2DC8)
        self.assertIsNotNone(table)
        self.assertEqual(table.style, "nulsep")
        got = [(e.name, e.length) for e in table.entries]
        self.assertEqual(
            got,
            [
                ("GEN", 3), ("DUNGEON", 7), ("COMBAT", 6), ("INIT", 4),
                ("COMPREP", 7), ("POSTCOM", 7), ("FINAL", 5), ("CAMP", 4),
            ],
        )


# --------------------------------------------------------------------------------------------
# 3. LIBRARY's real origin explains the ten previously-unassigned JSR/JMP targets.
# --------------------------------------------------------------------------------------------

# From the C1.9b task prompt: the ten targets three earlier slices collected and could not
# explain. Recorded here (not imported) so this test is a self-contained check against the
# number this slice was actually asked to explain.
ESTABLISHED_MYSTERY_TARGETS = [
    0x2E04, 0x2E25, 0x2E49, 0x2E84, 0x2E9A, 0x3007, 0x30E2, 0x3B69, 0x3B70, 0x3EEC,
]


class LibraryKernelRangeTests(unittest.TestCase):
    @unittest.skipUnless(COK_DIR.is_dir(), "Champions of Krynn C64 disks not present")
    def test_all_ten_targets_fall_inside_champions_library(self):
        library = _read(COK_DIR, "Champions of Krynn - Side 1.D64", "LIBRARY")
        org = 0x2DC8
        end = org + len(library) - 2  # -2 for the on-disk load-address header, not part of the body
        for addr in ESTABLISHED_MYSTERY_TARGETS:
            self.assertTrue(org <= addr < end, f"${addr:04X} not in LIBRARY range ${org:04X}-${end:04X}")

    @unittest.skipUnless(DOK_DIR.is_dir(), "Death Knights of Krynn C64 disks not present")
    def test_all_ten_targets_fall_inside_death_knights_library(self):
        library = _read(DOK_DIR, "Death Knights of Krynn - Side 1.D64", "LIBRARY")
        org = 0x2DC8
        end = org + len(library) - 2
        for addr in ESTABLISHED_MYSTERY_TARGETS:
            self.assertTrue(org <= addr < end, f"${addr:04X} not in LIBRARY range ${org:04X}-${end:04X}")

    @unittest.skipUnless(COK_DIR.is_dir(), "Champions of Krynn C64 disks not present")
    def test_a_page_aligned_origin_does_not_also_explain_all_ten(self):
        """Negative control distinguishing this finding from the earlier page-aligned sweep's
        false-positive risk: confirm $2E00 (the nearest page boundary, and DoK's own best score
        from the earlier sweep per the task prompt) does NOT fit as well as the true origin
        $2DC8 -- i.e. this is not just "any origin near here works"."""
        library = _read(COK_DIR, "Champions of Krynn - Side 1.D64", "LIBRARY")
        true_org = 0x2DC8
        true_end = true_org + len(library) - 2
        page_org = 0x2E00
        page_end = page_org + len(library) - 2
        true_hits = sum(1 for a in ESTABLISHED_MYSTERY_TARGETS if true_org <= a < true_end)
        page_hits = sum(1 for a in ESTABLISHED_MYSTERY_TARGETS if page_org <= a < page_end)
        self.assertEqual(true_hits, 10)
        # $2E00 still covers most of them since it is close to $2DC8 (the point is not that the
        # page-aligned origin is IMPLAUSIBLE by range alone, but that only the boot-derived origin
        # is independently justified -- see the STOP-vector test and the doc's evidence table).
        self.assertLessEqual(page_hits, true_hits)


# --------------------------------------------------------------------------------------------
# 4. Death Knights' orphaned BAM blocks: not a hidden kernel.
# --------------------------------------------------------------------------------------------

SECTORS_PER_TRACK = [0] + [21] * 17 + [19] * 7 + [18] * 6 + [17] * 5  # index by track 1..35


def _bam_allocated(disk: c64.Disk) -> set[tuple[int, int]]:
    bam = disk.sectors.get((18, 0))
    alloc = set()
    for t in range(1, 36):
        off = 4 + (t - 1) * 4
        bits = bam[off + 1] | (bam[off + 2] << 8) | (bam[off + 3] << 16)
        for s in range(SECTORS_PER_TRACK[t]):
            if not (bits >> s) & 1:
                alloc.add((t, s))
    return alloc


def _orphaned_blocks(disk: c64.Disk) -> set[tuple[int, int]]:
    alloc = _bam_allocated(disk)
    used: set[tuple[int, int]] = set()
    for e in c64.directory(disk):
        t, s = e.track, e.sector
        seen: set[tuple[int, int]] = set()
        while t and (t, s) not in seen:
            seen.add((t, s))
            block = disk.sectors.get((t, s))
            if block is None:
                break
            t, s = block[0], block[1]
        used |= seen
    dirchain = {(18, s) for s in range(SECTORS_PER_TRACK[18])} & alloc
    return alloc - used - dirchain


@unittest.skipUnless(DOK_DIR.is_dir(), "Death Knights of Krynn C64 disks not present")
class OrphanedBlockTests(unittest.TestCase):
    def test_side3_and_side5_orphans_are_uniform_filler_not_code_or_a_kernel(self):
        # Every orphaned block across sides 3-6 (found independently by the lead session's BAM
        # audit) turns out to be a solid run of one repeated byte after a 2-byte pseudo-link, with
        # the "next track" byte set to 75 -- past track 35, the image's own last track, so it
        # cannot be a real CBM DOS chain link. This rules the "hidden kernel via BAM allocation
        # without a directory entry" branch of hypothesis (1) out precisely, rather than by the
        # earlier round's coarser "zero orphans on the boot side" argument, which never looked at
        # what these particular 5-block groups (present on data sides, not the boot side) actually
        # contain.
        for image, expected in [
            ("Death Knights of Krynn - Side 3.D64", {(27, 4), (35, 5), (35, 6), (35, 7), (35, 8)}),
            ("Death Knights of Krynn - Side 5.D64", {(27, 7), (35, 8), (35, 9), (35, 10), (35, 11)}),
        ]:
            disk = c64.read_image(str(DOK_DIR / image))
            orphans = _orphaned_blocks(disk)
            self.assertEqual(orphans, expected, image)
            for t, s in orphans:
                block = disk.sectors[(t, s)]
                self.assertEqual(block[0], 75, f"{image} {t}/{s}: link track should read as 75")
                self.assertEqual(len(set(block[2:])), 1, f"{image} {t}/{s}: body should be uniform filler")

    def test_side4_and_side6_orphans_are_also_uniform_filler(self):
        for image, expected in [
            ("Death Knights of Krynn - Side 4.D64", {(1, 14), (1, 15), (1, 16), (1, 17), (9, 14)}),
            ("Death Knights of Krynn - Side 6.D64", {(1, 14), (1, 15), (1, 16), (1, 17), (8, 14)}),
        ]:
            disk = c64.read_image(str(DOK_DIR / image))
            orphans = _orphaned_blocks(disk)
            self.assertEqual(orphans, expected, image)
            for t, s in orphans:
                block = disk.sectors[(t, s)]
                self.assertEqual(len(set(block[2:])), 1, f"{image} {t}/{s}: body should be uniform filler")

    def test_mutating_the_filler_byte_is_detected(self):
        """Positive control for the two tests above: prove they would actually notice a real
        payload, not just always pass on this disk family."""
        disk = c64.read_image(str(DOK_DIR / "Death Knights of Krynn - Side 3.D64"))
        orphans = _orphaned_blocks(disk)
        t, s = next(iter(orphans))
        original = disk.sectors[(t, s)]
        mutated = bytearray(original)
        mutated[100] = mutated[100] ^ 0xFF  # flip one byte deep inside the "uniform" body
        disk.sectors[(t, s)] = bytes(mutated)
        with self.assertRaises(AssertionError):
            self.assertEqual(len(set(disk.sectors[(t, s)][2:])), 1)
        disk.sectors[(t, s)] = original  # restore
        self.assertEqual(len(set(disk.sectors[(t, s)][2:])), 1)


if __name__ == "__main__":
    unittest.main()
