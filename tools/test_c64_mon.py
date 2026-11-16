"""Tests for tools/c64_mon.py (C1.6 MON consumer).

All tests read from the retail C64 disk images at `D:/Games/Emulator/C64/Goldbox/` (never
vendored) and skip -- never fail -- when that drive is absent. They pin two kinds of claim:

  1. Facts about the FILES themselves (payload length, name decode) -- always checkable
     against the real disks, no code-tracing needed to verify.
  2. Facts about the DOS-side record-size delta, cross-checked against the repo's own
     `MON1CHA.DAX` via `dax_decode.py`.

This module does NOT re-derive the 6502 disassembly citations in
`docs/engine/research/c64-mon-format.md` (that would require re-disassembling from the
scout's overlay extraction, which is not part of this repo) -- it pins the *observable
consequences* of those findings (name at offset 0, no length-prefix byte; record length
480) against ground truth on the real disks.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disasm as da  # read-only reuse (opcode table), not owned/edited here
import c64_disk as c64
import c64_kernel as kernel  # read-only reuse of LIBRARY body/origin helpers (C1.9); not
                              # owned or edited by this investigation
import c64_mon as mon
import dax_decode

REPO = Path(__file__).resolve().parents[1]
C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")
COK_SIDE1 = C64_SETS / "Champions of Krynn" / "Champions of Krynn - Side 1.D64"
DOK_SIDE1 = C64_SETS / "Death Knights of Krynn" / "Death Knights of Krynn - Side 1.D64"

COK_DAX = [
    REPO / "Champions of Krynn" / "MON1CHA.DAX",
    REPO / "Champions of Krynn" / "MON2CHA.DAX",
    REPO / "Champions of Krynn" / "MON3CHA.DAX",
]
DOK_DAX = [REPO / "Death Knights of Krynn" / "MON1CHA.DAX"]

# hex-suffix -> expected name, cross-checked against MON1CHA.DAX below. Full Side-1 roster
# (14 CoK / 22 DoK) -- not a cherry-picked subset.
COK_MON_NAMES = {
    "MON01": "BAAZ", "MON04": "BOZAK", "MON09": "GOBLIN", "MON0B": "HILL GIANT",
    "MON0E": "KAPAK", "MON10": "MINOTAUR", "MON13": "OGRE", "MON15": "RED DRAGON",
    "MON19": "SIVAK", "MON1B": "GIANT SNAKE", "MON1D": "GIANT SPIDER",
    "MON3C": "SIR RINGWALD", "MON3D": "LYN SWIFTFOOT", "MON3E": "VARIANNA",
}
DOK_MON_NAMES = {
    "MON00": "NIGHTMARE", "MON01": "SKEL WARRIOR", "MON02": "BLUE DRAGON",
    "MON03": "BLACK DRAGON", "MON09": "UNDEAD BEAST", "MON0B": "ZOMBIE MINOTAUR",
    "MON0C": "ZOMBIE MASTODON", "MON11": "WIGHT", "MON16": "GHOUL", "MON17": "GHAST",
    "MON1B": "WHISPER SPIDER", "MON1C": "HELLHOUND", "MON22": "FIRE LIZARD",
    "MON23": "RHINO BEETLE", "MON24": "WYNDLASS", "MON26": "HATORI",
    "MON30": "SIR DRYDEN", "MON32": "FLAVIUS", "MON40": "SOLAMNIC KNIGHT",
    "MON45": "ROGUE MAGE HIGH", "MON46": "PATRIARCH", "MON48": "EVIL WARRIOR",
}

skip_no_c64 = unittest.skipUnless(COK_SIDE1.exists() and DOK_SIDE1.exists(),
                                   f"{C64_SETS} not present (external, never vendored)")
skip_no_dax = unittest.skipUnless(
    all(p.exists() for p in COK_DAX) and all(p.exists() for p in DOK_DAX), "repo DAX files missing"
)


class SyntheticRecordTests(unittest.TestCase):
    """No external disk needed: pins parse_mon_record's own logic against a built buffer."""

    def _payload(self, name: bytes) -> bytes:
        body = bytearray(mon.MON_PAYLOAD_LENGTH)
        body[: len(name)] = name
        return b"\x00\x40" + bytes(body)  # 2-byte load address ($4000) + 480-byte payload

    def test_name_decoded_from_offset_zero_no_length_prefix(self):
        rec = mon.parse_mon_record(self._payload(b"BAAZ\x00"))
        self.assertEqual(rec.name, "BAAZ")

    def test_name_stops_at_first_high_byte_not_just_nul(self):
        # The scrub loop's own criterion is "byte >= $40 is not text" -- a raw $80 mid-name
        # (as CBM DOS pad bytes like $A0 would produce) must NOT be swallowed into the name.
        buf = bytearray(mon.MON_PAYLOAD_LENGTH)
        buf[0:2] = b"OG"
        buf[2] = 0x80
        rec = mon.parse_mon_record(b"\x00\x40" + bytes(buf))
        self.assertEqual(rec.name, "OG")

    def test_wrong_payload_length_raises(self):
        with self.assertRaises(ValueError):
            mon.parse_mon_record(b"\x00\x40" + b"\x00" * 100)

    def test_mutation_wrong_name_offset_breaks_the_test(self):
        """Standing-rule #6: prove test_name_decoded_from_offset_zero_no_length_prefix CAN fail.

        Mutates parse_mon_record's own NAME_OFFSET usage by decoding at offset+1 (simulating
        the DOS length-prefix convention this module explicitly says is ABSENT on C64) and
        confirms the decoded name is wrong, then restores nothing (no shared state touched --
        this test re-implements the mutated decode locally rather than patching the module).
        """
        payload = self._payload(b"BAAZ\x00")[2:]
        correct = mon._petscii_name(payload)
        # Simulate the DOS-style off-by-one (name starts at offset 1, after a length byte)
        mutated = mon._petscii_name(payload[1:] + b"\x00")
        self.assertEqual(correct, "BAAZ")
        self.assertNotEqual(mutated, "BAAZ")
        self.assertEqual(mutated, "AAZ")


@skip_no_c64
class RealDiskTests(unittest.TestCase):
    def test_mon_payload_length_is_480_for_every_cok_side1_mon_file(self):
        disk = c64.read_image(COK_SIDE1)
        entries = {e.name: e for e in c64.directory(disk)}
        mon_entries = [e for e in entries.values() if e.name.startswith("MON")]
        self.assertEqual(len(mon_entries), 14, "expected all 14 CoK Side-1 MON files")
        for e in mon_entries:
            data, problem = c64.read_file_checked(disk, e)
            self.assertIsNone(problem, f"{e.name}: {problem}")
            rec = mon.parse_mon_record(data)
            self.assertEqual(len(rec.raw), mon.MON_PAYLOAD_LENGTH, e.name)

    def test_mon_payload_length_is_480_for_every_dok_side1_mon_file(self):
        disk = c64.read_image(DOK_SIDE1)
        entries = {e.name: e for e in c64.directory(disk)}
        mon_entries = [e for e in entries.values() if e.name.startswith("MON")]
        self.assertEqual(len(mon_entries), 22, "expected all 22 DoK Side-1 MON files")
        for e in mon_entries:
            data, problem = c64.read_file_checked(disk, e)
            self.assertIsNone(problem, f"{e.name}: {problem}")
            rec = mon.parse_mon_record(data)
            self.assertEqual(len(rec.raw), mon.MON_PAYLOAD_LENGTH, e.name)

    def test_cok_names_match_full_roster(self):
        for entry_name, expected in COK_MON_NAMES.items():
            rec = mon.read_mon_from_image(COK_SIDE1, entry_name)
            self.assertEqual(rec.name, expected, entry_name)

    def test_dok_names_match_full_roster(self):
        for entry_name, expected in DOK_MON_NAMES.items():
            rec = mon.read_mon_from_image(DOK_SIDE1, entry_name)
            self.assertEqual(rec.name, expected, entry_name)


@skip_no_c64
@skip_no_dax
class RecordSizeDeltaTests(unittest.TestCase):
    """Task C1.6d: does the C64 record length match the DOS record length? (No -- report the
    delta.) Cross-checked block-by-block via the DAX block's own decompressed name, not just
    matching hex ids, so a block-id table drift can't silently mismatch monsters."""

    def _dos_blocks_by_name(self, dax_paths: list[Path]) -> dict[str, int]:
        out: dict[str, int] = {}
        for dax_path in dax_paths:
            data = dax_path.read_bytes()
            base, blocks = dax_decode.parse_container(data)
            for b in blocks:
                raw = dax_decode.decompress_block(data, base, b)
                name_len = raw[0]
                name = raw[1 : 1 + name_len].decode("ascii", errors="replace")
                out.setdefault(name, len(raw))
        return out

    def test_cok_delta_is_71_bytes_for_every_matched_monster(self):
        dos_by_name = self._dos_blocks_by_name(COK_DAX)
        checked = 0
        for entry_name, expected_name in COK_MON_NAMES.items():
            rec = mon.read_mon_from_image(COK_SIDE1, entry_name)
            self.assertEqual(rec.name, expected_name)
            dos_len = dos_by_name[expected_name]
            self.assertEqual(dos_len, 409, expected_name)
            self.assertEqual(len(rec.raw) - dos_len, 71, expected_name)
            checked += 1
        self.assertEqual(checked, len(COK_MON_NAMES))

    def test_dok_delta_is_264_bytes_for_every_matched_monster(self):
        dos_by_name = self._dos_blocks_by_name(DOK_DAX)
        checked = 0
        for entry_name, expected_name in DOK_MON_NAMES.items():
            rec = mon.read_mon_from_image(DOK_SIDE1, entry_name)
            self.assertEqual(rec.name, expected_name)
            dos_len = dos_by_name[expected_name]
            self.assertEqual(dos_len, 216, expected_name)
            self.assertEqual(len(rec.raw) - dos_len, 264, expected_name)
            checked += 1
        self.assertEqual(checked, len(DOK_MON_NAMES))


@skip_no_c64
class ScreenMemoryNotMonBufferTests(unittest.TestCase):
    """2026-08-12, unblocked by the C1.9 kernel-origin breakthrough (LIBRARY resident at
    $2DC8 in both titles -- docs/engine/research/c64-resident-kernel.md /
    c64-boot-chain.md): $2E9A (CoK) / $2E49 (DoK), previously unreachable, are now
    readable. Tracing them proves the name-scrub loop quoted in c64-mon-format.md section
    4 does NOT read the raw $4000 MON buffer -- it resolves to VIC-II screen memory
    ($CC00 + row*40) with a Color RAM sibling ($D800 + row*40). See section 11 of that
    doc for the full argument. This class pins the exact bytes and caller sets that
    argument depends on, reusing tools/c64_kernel.py's read-only LIBRARY-body helper
    (not editing that module -- out of this investigation's file-ownership slice).

    Proof this class can fail (real, not staged): the first version of
    test_vic_bank_setup_selects_bank_3_and_screen_offset_c00_cok below indexed the wrong
    byte for the AND #$FC operand (`expected[11]`, the opcode, instead of `expected[12]`,
    the operand) and failed for real on the first `pytest` run --
    `AssertionError: 41 != 252` (0x29 the opcode vs. the intended 0xFC) -- before the
    off-by-one was found and fixed against the disassembly quoted in the comments below.
    """

    def test_2e9a_wrapper_reads_loop_index_and_delegates_to_2e84_cok(self):
        body = kernel.kernel_body("cok")
        off = 0x2E9A - kernel.KERNEL_ORIGIN
        # LDA $03CD; JSR $2E84; STA $4E; STX $4F; RTS
        self.assertEqual(
            body[off : off + 10],
            bytes([0xAD, 0xCD, 0x03, 0x20, 0x84, 0x2E, 0x85, 0x4E, 0x86, 0x4F]),
        )

    def test_2e49_wrapper_reads_loop_index_and_delegates_to_2e2d_dok(self):
        body = kernel.kernel_body("dok")
        off = 0x2E49 - kernel.KERNEL_ORIGIN
        # LDA $03CD; JSR $2E2D; STA $4E; STX $4F; RTS
        self.assertEqual(
            body[off : off + 10],
            bytes([0xAD, 0xCD, 0x03, 0x20, 0x2D, 0x2E, 0x85, 0x4E, 0x86, 0x4F]),
        )

    def test_2e84_multiplies_by_index_and_adds_the_d800_base_cok(self):
        body = kernel.kernel_body("cok")
        off = 0x2E84 - kernel.KERNEL_ORIGIN
        # LDX #$28 (40, the multiplier -- the C64 screen width, NOT a record size);
        # JSR $3007 (generic 8x8->16 multiply); STA $A3; TXA; ADC #$D8; STA $A4;
        # TXA; ADC $0288; STA $4D; TAX; LDA $4C; RTS
        expected = bytes([
            0xA2, 0x28, 0x20, 0x07, 0x30, 0x85, 0xA3, 0x8A, 0x69, 0xD8, 0x85, 0xA4,
            0x8A, 0x6D, 0x88, 0x02, 0x85, 0x4D, 0xAA, 0xA5, 0x4C, 0x60,
        ])
        self.assertEqual(body[off : off + len(expected)], expected)

    def test_2e2d_multiplies_by_index_and_adds_the_d800_base_dok(self):
        body = kernel.kernel_body("dok")
        off = 0x2E2D - kernel.KERNEL_ORIGIN
        # LDX #$28; CMP #$18; BCC +2; LDA #$18 (DoK-only clamp, absent in CoK);
        # JSR $2FB0; STA $A3; TXA; ADC #$D8; STA $A4; TXA; ADC $0288; STA $4D;
        # TAX; LDA $4C; RTS
        expected = bytes([
            0xA2, 0x28, 0xC9, 0x18, 0x90, 0x02, 0xA9, 0x18, 0x20, 0xB0, 0x2F, 0x85,
            0xA3, 0x8A, 0x69, 0xD8, 0x85, 0xA4, 0x8A, 0x6D, 0x88, 0x02, 0x85, 0x4D,
            0xAA, 0xA5, 0x4C, 0x60,
        ])
        self.assertEqual(body[off : off + len(expected)], expected)

    def test_vic_bank_setup_selects_bank_3_and_screen_offset_c00_cok(self):
        """CIA2 $DD00 bits 1:0 cleared -> VIC bank 3 ($C000-$FFFF); $D018=$34 -> bits 7:4
        = 3 -> screen offset 3*$400=$0C00 within that bank -> screen base $CC00. The
        routine's own next instruction caches that computed byte into $0288 as literal
        immediate $CC -- this test pins that the two halves (register-semantics-derived
        base, and the code's own cached constant) agree, without executing anything."""
        body = kernel.kernel_body("cok")
        off = 0x3B2C - kernel.KERNEL_ORIGIN
        expected = bytes([
            0xA9, 0x03, 0x0D, 0x02, 0xDD, 0x8D, 0x02, 0xDD,  # ORA/STA $DD02
            0xAD, 0x00, 0xDD, 0x29, 0xFC, 0x8D, 0x00, 0xDD,  # bank select -> 3
            0xA9, 0x34, 0x8D, 0x18, 0xD0,                    # $D018 = $34 -> offset $0C00
            0xA9, 0x10, 0x0D, 0x16, 0xD0, 0x8D, 0x16, 0xD0,  # VIC_CTRL2 |= $10
            0xA9, 0xCC, 0x8D, 0x88, 0x02,                    # $0288 = $CC
            0x60,
        ])
        self.assertEqual(body[off : off + len(expected)], expected)
        bank_and_mask = expected[12]  # AND #$FC clears both bank-select bits -> bank 3
        self.assertEqual(bank_and_mask, 0xFC)
        d018_value = expected[17]
        screen_offset = ((d018_value >> 4) & 0x0F) * 0x400
        self.assertEqual(screen_offset, 0x0C00)
        vic_bank_base = 0xC000  # bits 1:0 == 00 selects bank 3, $C000-$FFFF
        computed_screen_base = vic_bank_base + screen_offset
        cached_constant = expected[30]  # the LDA #$CC immediately before STA $0288
        self.assertEqual(computed_screen_base, 0xCC00)
        self.assertEqual(cached_constant, 0xCC)
        self.assertEqual(computed_screen_base & 0xFF00, cached_constant << 8)

    def test_vic_bank_setup_is_byte_identical_in_dok_at_its_own_offset(self):
        cok_body = kernel.kernel_body("cok")
        cok_off = 0x3B2C - kernel.KERNEL_ORIGIN
        dok_body = kernel.kernel_body("dok")
        dok_off = 0x3A98 - kernel.KERNEL_ORIGIN
        self.assertEqual(cok_body[cok_off : cok_off + 35], dok_body[dok_off : dok_off + 35])

    def test_2e9a_2e49_callers_are_dungeon_compep_init_only_both_titles(self):
        """The scrub loop is reused by three unrelated overlays with a fixed 24-row count
        each -- not tied to a variable combatant count, and not COM.PREP-only as the
        pre-2026-08-12 version of this investigation assumed (it could not see LIBRARY's
        interior yet, so it only had COM.PREP's own call site in evidence)."""
        cok_bodies = kernel.read_bodies(kernel.load_side1("cok"))
        cok_callers = kernel.find_callers(cok_bodies, [0x2E9A])[0x2E9A]
        self.assertEqual(
            {name for name, _ in cok_callers}, {"DUNGEON", "COM.PREP", "INIT"}
        )

        dok_bodies = kernel.read_bodies(kernel.load_side1("dok"))
        dok_callers = kernel.find_callers(dok_bodies, [0x2E49])[0x2E49]
        self.assertEqual(
            {name for name, _ in dok_callers}, {"DUNGEON", "COMPREP", "INIT"}
        )

    def test_vic_bank_setup_called_from_init_at_the_same_body_offset_both_titles(self):
        cok_bodies = kernel.read_bodies(kernel.load_side1("cok"))
        cok_hits = dict(kernel.find_callers(cok_bodies, [0x3B2C])[0x3B2C])
        self.assertIn("INIT", cok_hits)
        self.assertEqual(cok_hits["INIT"], 143)

        dok_bodies = kernel.read_bodies(kernel.load_side1("dok"))
        dok_hits = dict(kernel.find_callers(dok_bodies, [0x3A98])[0x3A98])
        self.assertIn("INIT", dok_hits)
        self.assertEqual(dok_hits["INIT"], 143)


@skip_no_c64
class MonPopulateWindowTests(unittest.TestCase):
    """2026-08-12 'mon-populate' round: re-derives a prior round's naive linear byte
    scan for "$4000-$41E0 references inside LIBRARY" with real control-flow-following
    disassembly. See docs/engine/research/c64-mon-format.md section 12 and this
    module's own updated docstring for the full argument.

    Proof this class can fail (real, not staged): the first version of
    test_cok_survivors_are_two_specific_intra_library_subroutines below asserted the
    JSR targets were {0x4058, 0x4088} (a typo for 0x4078) and failed for real --
    `AssertionError: Items in the second set but not the first: {4088}` -- before being
    corrected against the actual disassembly quoted in c64_mon.py's docstring.
    """

    def test_library_body_fully_contains_the_scanned_window_both_titles(self):
        # The root-cause finding: the window a prior round scanned ($4000-$41E0, width
        # 480 = MON_PAYLOAD_LENGTH) sits entirely inside LIBRARY's own proven-resident
        # body for BOTH titles, so any hit there is ambiguous with an intra-LIBRARY
        # self-reference by address alone.
        self.assertTrue(mon.library_contains_mon_window("cok"))
        self.assertTrue(mon.library_contains_mon_window("dok"))
        cok_lo, cok_hi = mon.library_span("cok")
        dok_lo, dok_hi = mon.library_span("dok")
        self.assertLessEqual(cok_lo, mon._MON_WINDOW[0])
        self.assertLessEqual(mon._MON_WINDOW[1], cok_hi)
        self.assertLessEqual(dok_lo, mon._MON_WINDOW[0])
        self.assertLessEqual(mon._MON_WINDOW[1], dok_hi)
        # the window's own width explains why it was chosen in the first place
        self.assertEqual(mon._MON_WINDOW[1] - mon._MON_WINDOW[0], mon.MON_PAYLOAD_LENGTH)

    def test_code00_offset_122_is_a_bit_instruction_not_a_jsr_byte_alias(self):
        """Settles the task's lead (b): the DoK CODE00 hit at body offset 122 (found by
        c64_kernel.find_callers, which is opcode-decode-based but not full-file
        alignment-checked) is confirmed a byte-alias false positive. It is not even a
        JSR (a "caller") under any reading: body[122] = 0x2C = BIT (absolute), and the
        3-byte window 2C 2D 2E only matches the target address 0x2E2D because 0x2D/0x2E
        are themselves two more entries of a plain ascending data table, not an
        instruction stream."""
        bodies = kernel.read_bodies(kernel.load_side1("dok"))
        body = bodies["CODE00"]
        self.assertEqual(body[122:125], bytes([0x2C, 0x2D, 0x2E]))
        self.assertEqual(da.OPCODES[0x2C], ("BIT", "abs"))
        # surrounding bytes (110-133) are a monotonically non-decreasing data ramp --
        # the opposite of what a real instruction stream looks like at this density
        ramp = body[110:134]
        self.assertTrue(all(b <= 0x40 for b in ramp), "not small table-like values")
        self.assertTrue(
            sum(1 for a, b in zip(ramp, ramp[1:]) if b < a) <= 1,
            "expected an almost-monotonic ascending ramp, not code",
        )
        # confirm this offset is exactly the one find_callers reports for $2E2D
        hits = kernel.find_callers(bodies, [0x2E2D])[0x2E2D]
        self.assertIn(("CODE00", 122), hits)
        # and the REAL caller population (per the doc) excludes it: 8 LIBRARY-internal
        # sites + GDRIVE02 only
        real_names = {name for name, _ in hits if name != "CODE00"}
        self.assertEqual(real_names, {"LIBRARY", "GDRIVE02"})
        lib_sites = sorted(off for name, off in hits if name == "LIBRARY")
        self.assertEqual(lib_sites, [23, 40, 83, 132, 368, 419, 613, 3252])


@skip_no_c64
class MonVerifyRoundTests(unittest.TestCase):
    """2026-08-12 'mon-verify' round: finishes the trace the prior round left half-done
    (widen library_window_hits()'s seed set to a real, code-file-restricted, all-sides
    inbound-call census instead of just LIBRARY's own jump table) and makes a bounded but
    much wider attempt at the round's actual TARGET question (what writes text into the
    $CC00 screen rows). See docs/engine/research/c64-mon-format.md section 13.

    Proof this class can fail (real, not staged): the first version of
    test_dungeon_cursor_write_is_structurally_identical_both_titles below used the DoK
    cursor-write address $1039 (the JSR instruction inside the sequence) instead of the
    correct $1037 (the LDA $FC that actually starts it, matching how the CoK address
    $1235 is used) and failed for real on the first `pytest` run --
    `AssertionError: b' L.\xa4\xfb\xad\r\xa8\x91N' != b'\xa5\xfc L.\xa4\xfb\xad\r\xa8'`
    (a 2-byte slice offset, visibly missing the leading `A5 FC` and gaining a trailing
    `91 4E` instead) -- before the off-by-two was found and fixed against the real
    disassembly quoted in the comments below and `_DUNGEON_CURSOR_WRITE` in c64_mon.py
    was corrected from `0x1039` to `0x1037` to match.
    """

    def test_widened_trace_coverage_is_comparable_between_titles(self):
        # Before the widened seed set: 13.2% (CoK) / 0.8% (DoK) -- DoK's old figure was a
        # coverage artifact of a 3-slot jump table, not a real trace. After: both titles
        # clear 38%, closing the asymmetry that made the old DoK "0 survivors" meaningless.
        cok_visited, cok_total = mon.library_trace_coverage("cok")
        dok_visited, dok_total = mon.library_trace_coverage("dok")
        cok_pct = 100 * cok_visited / cok_total
        dok_pct = 100 * dok_visited / dok_total
        self.assertGreaterEqual(cok_pct, 38.0)
        self.assertGreaterEqual(dok_pct, 38.0)
        self.assertEqual((cok_visited, cok_total), (2836, 7435))
        self.assertEqual((dok_visited, dok_total), (2878, 7467))

    def test_widened_window_hits_are_22_cok_11_dok_all_ordinary_library_internals(self):
        cok_hits = mon.library_window_hits("cok")
        dok_hits = mon.library_window_hits("dok")
        self.assertEqual(len(cok_hits), 22)
        self.assertEqual(len(dok_hits), 11)
        cok_targets = {addr for _, addr, _, _ in cok_hits}
        dok_targets = {addr for _, addr, _, _ in dok_hits}
        self.assertEqual(
            cok_targets,
            {0x4003, 0x4046, 0x4058, 0x4078, 0x407E, 0x4098, 0x40C7, 0x40DB, 0x40F4, 0x410D, 0x4126},
        )
        self.assertEqual(
            dok_targets,
            {0x4002, 0x4017, 0x4031, 0x404B, 0x4066, 0x4134, 0x41C4},
        )
        # every target is still inside LIBRARY's own body -- the root-cause finding from
        # the prior round (section 12.1) still holds under the wider seed set
        cok_lo, cok_hi = mon.library_span("cok")
        dok_lo, dok_hi = mon.library_span("dok")
        self.assertTrue(all(cok_lo <= t < cok_hi for t in cok_targets))
        self.assertTrue(all(dok_lo <= t < dok_hi for t in dok_targets))

    def test_unrestricted_census_finds_a_dok_false_positive_the_restricted_one_excludes(self):
        """The negative-control check for library_entry_census()'s own allowlist: seeding
        from EVERY file (no code/data distinction), like the naive full census in
        c64_kernel, includes a JSR-shaped byte pair inside SPELLE66 (a spell-message DATA
        file, not code) that targets $4A56 inside DoK's LIBRARY -- landing squarely on the
        ASCII string "COMBAT2" embedded in LIBRARY's own dispatch-table name list. This
        proves _CODE_FILES' restriction to established-code files is load-bearing, not
        cosmetic: without it, the trace would report a 12th DoK window hit that is not
        real.
        """
        bodies = kernel.all_bodies("dok")
        lib = bodies["LIBRARY"]
        lo, hi = kernel.KERNEL_ORIGIN, kernel.KERNEL_ORIGIN + len(lib)
        # unrestricted: scan every file, not just _CODE_FILES
        unrestricted_seeds = set(mon.library_trace_seeds("dok"))
        for name, body in bodies.items():
            if name == "LIBRARY":
                continue
            for i in range(len(body) - 2):
                if body[i] == 0x20:
                    addr = body[i + 1] | (body[i + 2] << 8)
                    if lo <= addr < hi:
                        unrestricted_seeds.add(addr)
        # SPELLE66 offset 2461 is the seed that produces the false positive
        self.assertIn(0x4A56, unrestricted_seeds)
        spelle66 = bodies["SPELLE66"]
        self.assertEqual(spelle66[2461:2464], bytes([0x20, 0x56, 0x4A]))  # JSR $4A56
        _, unrestricted_hits = mon._trace_control_flow(lib, kernel.KERNEL_ORIGIN, unrestricted_seeds)
        window_lo, window_hi = mon._MON_WINDOW
        unrestricted_window_targets = {a for _, a, _, _ in unrestricted_hits if window_lo <= a < window_hi}
        self.assertIn(0x4142, unrestricted_window_targets)  # the false-positive EOR $4142
        # the ASCII payload the false hit lands on
        off = 0x4A54 - kernel.KERNEL_ORIGIN
        self.assertEqual(lib[off:off + 7], b"COMBAT2")
        # and the RESTRICTED (real) census does not produce it
        restricted_targets = {addr for _, addr, _, _ in mon.library_window_hits("dok")}
        self.assertNotIn(0x4142, restricted_targets)

    def test_row_pointer_helper_callers_all_sides_cok_unchanged_dok_gains_a_false_positive(self):
        cok = mon.row_pointer_helper_callers("cok")
        dok = mon.row_pointer_helper_callers("dok")
        self.assertEqual(set(cok), {"LIBRARY", "GDRIVE02"})
        self.assertEqual(cok["LIBRARY"], [110, 127, 170, 213, 444, 506, 684, 3400])
        self.assertEqual(cok["GDRIVE02"], [361])
        # DoK gains a genuinely new candidate (PIC07) that side-1-only missed
        self.assertEqual(set(dok), {"LIBRARY", "GDRIVE02", "CODE00", "PIC07"})
        self.assertEqual(dok["LIBRARY"], [23, 40, 83, 132, 368, 419, 613, 3252])
        self.assertEqual(dok["PIC07"], [1624])
        # settle it: PIC07 offset 1624 is ORA (absolute), not JSR -- a second confirmed
        # byte-alias false positive, same shape as the already-settled CODE00 one
        bodies = kernel.all_bodies("dok")
        pic07 = bodies["PIC07"]
        self.assertEqual(pic07[1624:1627], bytes([0x0D, 0x2D, 0x2E]))
        self.assertEqual(da.OPCODES[0x0D], ("ORA", "abs"))
        # so the REAL population is identical in shape for both titles: 8 LIBRARY sites + GDRIVE02
        real_dok = {name for name in dok if name not in ("CODE00", "PIC07")}
        self.assertEqual(real_dok, {"LIBRARY", "GDRIVE02"})

    def test_dungeon_cursor_write_is_structurally_identical_both_titles(self):
        """Closes the cross-title gap the prior pass left open: it only had the CoK
        instance of the cursor-blink write. DoK's DUNGEON has the structurally identical
        sequence (row from $FC, delegate to the row-pointer helper's second half, column
        from $FB, one glyph byte to screen memory, color 1 to the paired Color RAM cell)
        at its own address."""
        cok_body = kernel.get_file(kernel.load_side1("cok"), "DUNGEON")
        cok_off = 0x1235 - mon._DUNGEON_ORIGIN
        # LDA $FC; JSR $2E9D; LDY $FB; LDA $2CBF; STA ($4E),Y
        self.assertEqual(
            cok_body[cok_off:cok_off + 10],
            bytes([0xA5, 0xFC, 0x20, 0x9D, 0x2E, 0xA4, 0xFB, 0xAD, 0xBF, 0x2C]),
        )
        dok_body = kernel.get_file(kernel.load_side1("dok"), "DUNGEON")
        dok_off = 0x1037 - mon._DUNGEON_ORIGIN
        # LDA $FC; JSR $2E4C; LDY $FB; LDA $A80D; STA ($4E),Y
        self.assertEqual(
            dok_body[dok_off:dok_off + 10],
            bytes([0xA5, 0xFC, 0x20, 0x4C, 0x2E, 0xA4, 0xFB, 0xAD, 0x0D, 0xA8]),
        )
        # both write to ($4E),Y then color 1 to ($A3),Y
        self.assertEqual(cok_body[cok_off + 10:cok_off + 15], bytes([0x91, 0x4E, 0xA9, 0x01, 0x91]))
        self.assertEqual(dok_body[dok_off + 10:dok_off + 15], bytes([0x91, 0x4E, 0xA9, 0x01, 0x91]))

    def test_dungeon_cursor_write_reachability_settled_as_low_coverage_not_unreachable(self):
        """Settles the prior pass's dangling lead 'could not prove a control-flow path to
        it' with a concrete diagnosis: NOT reached by a static trace in either title, but
        the trace's own coverage from DUNGEON's one proven-real entry point is too low
        (~6%) for that to mean anything -- consistent with DUNGEON using an
        indirect/computed dispatch mechanism this project's BFS cannot follow, not with
        the write being provably dead code."""
        cok = mon.dungeon_cursor_write_reachability("cok")
        dok = mon.dungeon_cursor_write_reachability("dok")
        self.assertFalse(cok["reached"])
        self.assertFalse(dok["reached"])
        self.assertLess(cok["coverage_pct"], 10.0)
        self.assertLess(dok["coverage_pct"], 10.0)
        self.assertEqual(cok, {"visited": 575, "total": 9452, "coverage_pct": 6.1,
                                "target_offset": 2613, "reached": False})
        self.assertEqual(dok, {"visited": 543, "total": 8248, "coverage_pct": 6.6,
                                "target_offset": 2103, "reached": False})

    def test_screen_memory_writes_widened_search_finds_no_text_populator(self):
        """The round's bounded-but-wider TARGET search: every established-code file (not
        just COM.PREP/DUNGEON/INIT), all sides, both titles. Still no consumer that reads
        an indexed source buffer and writes it as text into $CC00-$CFFF -- the only
        multi-site cluster (INIT) uses literal immediate constants only, confirmed
        byte-identical in shape between titles."""
        cok = mon.screen_memory_writes("cok")
        dok = mon.screen_memory_writes("dok")
        # INIT clusters exist in both titles, at the sizes measured this round
        self.assertIn("INIT", cok)
        self.assertIn("INIT", dok)
        self.assertEqual(len(cok["INIT"]), 20)
        self.assertEqual(len(dok["INIT"]), 20)
        # INIT's second cluster (the full-screen space-fill) is the same shape both titles:
        # one STA per screen quadrant base ($CC00/$CD00/$CE00/$CF00), aby-indexed
        cok_second_cluster = [h for h in cok["INIT"] if h[2] in (0xCC00, 0xCD00, 0xCE00, 0xCF00)]
        dok_second_cluster = [h for h in dok["INIT"] if h[2] in (0xCC00, 0xCD00, 0xCE00, 0xCF00)]
        self.assertEqual({a for _, _, a in cok_second_cluster}, {0xCC00, 0xCD00, 0xCE00, 0xCF00})
        self.assertEqual({a for _, _, a in dok_second_cluster}, {0xCC00, 0xCD00, 0xCE00, 0xCF00})
        self.assertTrue(all(m == "STA" for _, m, _ in cok_second_cluster))
        self.assertTrue(all(m == "STA" for _, m, _ in dok_second_cluster))
        # Spot-check (direct byte pin, not a fragile backward byte-walk): the space-fill
        # cluster's first write in both titles is preceded immediately by a literal
        # `LDA #$20` (space), not any kind of indexed or indirect load -- a constant fill,
        # not a copy from a source buffer.
        cok_body = kernel.all_bodies("cok")["INIT"]
        dok_body = kernel.all_bodies("dok")["INIT"]
        self.assertEqual(cok_body[2338:2341], bytes([0xA9, 0x20, 0x99]))  # LDA #$20; STA...
        self.assertEqual(dok_body[2308:2311], bytes([0xA9, 0x20, 0x99]))
        # the border-draw cluster's first write is likewise preceded by a literal LDA #imm
        self.assertEqual(cok_body[2045:2048], bytes([0xA9, 0x00, 0x99]))  # LDA #$00; STA $CC00,Y
        self.assertEqual(dok_body[2010:2013], bytes([0xA9, 0x00, 0x99]))


if __name__ == "__main__":
    unittest.main()
