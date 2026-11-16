#!/usr/bin/env python3
"""Tests for the 6502 disassembler, and the C64 display mode it was written to establish.

The golden below is the reason the disassembler exists: Champions of Krynn's C64 graphics driver
states its own display mode in six instructions, which settles by code what could not be settled
by fitting layouts to file sizes. See docs/engine/research/c64-disk-format.md section 7.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disasm as D  # noqa: E402
import c64_disk as c64  # noqa: E402

C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")
COK = C64_SETS / "Champions of Krynn"


class OpcodeTableTests(unittest.TestCase):
    def test_every_entry_has_a_known_addressing_mode_and_size(self) -> None:
        for op, (mnem, mode) in D.OPCODES.items():
            self.assertIn(mode, D.SIZE, f"{mnem} (${op:02X}) has mode {mode!r}")
            self.assertRegex(mnem, r"^[A-Z]{3}$")

    def test_branches_are_relative_to_the_end_of_the_instruction(self) -> None:
        """The classic 6502 off-by-one: the displacement is from the NEXT instruction."""
        # BNE +4 at $C000 lands at $C006, not $C004.
        self.assertEqual(D.disassemble(bytes([0xD0, 0x04]), 0xC000, 0, 1)[0].split()[-1], "$C006")
        # And a negative displacement goes backwards: BNE -6 at $C010 -> $C00C.
        self.assertEqual(D.disassemble(bytes([0xD0, 0xFA]), 0xC010, 0, 1)[0].split()[-1], "$C00C")

    def test_hardware_addresses_are_named_and_operands_decoded(self) -> None:
        text = D.disassemble(bytes([0xA9, 0x34, 0x8D, 0x18, 0xD0, 0x60]), 0xC000, 0, 3)
        self.assertIn("LDA #$34", text[0])
        self.assertIn("STA VIC_MEMPTR", text[1])
        self.assertIn("RTS", text[2])

    def test_undocumented_opcodes_degrade_to_bytes_rather_than_inventing_instructions(self) -> None:
        # $02 (JAM) and $FF (ISC abs,X) are not in the documented set.
        for op in (0x02, 0xFF):
            self.assertNotIn(op, D.OPCODES)
            self.assertIn(".byte", D.disassemble(bytes([op, 0x00]), 0, 0, 1)[0])


@unittest.skipUnless(COK.is_dir(), "Champions of Krynn C64 set not present")
class GraphicsDriverGoldenTests(unittest.TestCase):
    """GDRIVE01 declares the C64 picture display mode. This pins it against the retail bytes."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.prg = None
        for img in sorted(COK.glob("*.[Dd]64")):
            disk = c64.read_image(img)
            for e in c64.directory(disk):
                if e.name == "GDRIVE01" and e.closed:
                    data, problem = c64.read_file_checked(disk, e)
                    if not problem:
                        cls.prg = data
        if cls.prg is None:
            raise unittest.SkipTest("GDRIVE01 not readable")

    def test_the_driver_is_a_C000_overlay_with_a_jump_table(self) -> None:
        """Its stored load address is the $4000 staging buffer, not where it runs.

        The real origin is recoverable from the code: a table of absolute JMPs whose targets all
        land inside a $C000-based image exactly the length of the file.
        """
        body = self.prg[2:]
        self.assertEqual(int.from_bytes(self.prg[:2], "little"), 0x4000)
        self.assertEqual(len(body), 0x0A00)
        targets = [body[i + 1] | (body[i + 2] << 8) for i in range(0, 0x4B, 3) if body[i] == 0x4C]
        self.assertGreaterEqual(len(targets), 24, "expected a jump table at the start")
        self.assertTrue(
            all(0xC000 <= t < 0xCA00 for t in targets),
            f"targets escape a $C000 origin: {[hex(t) for t in targets]}",
        )

    def test_the_display_mode_is_multicolour_character_mode_at_CC00_and_D000(self) -> None:
        """Six instructions at $C0A1 fix bank, memory pointers and mode.

        This is the load-bearing result. $D018 = $34 puts the screen at bank+$0C00 and the
        character set at bank+$1000, and clearing the low two CIA2 bits selects VIC bank 3, so the
        screen is $CC00 and the charset $D000. A charset addressed this way is 2 KB -- 256 glyphs
        -- which rules out every layout that inferred a 230- or 249-glyph set from the file size.
        """
        body = self.prg[2:]
        listing = "\n".join(D.disassemble(body, 0xC000, 0xC0A1 - 0xC000, 12))
        self.assertIn("LDA CIA2_PORTA", listing)
        self.assertIn("AND #$FC", listing)          # bank bits -> %00 -> VIC bank 3 ($C000)
        self.assertIn("STA CIA2_PORTA", listing)
        self.assertIn("LDA #$34", listing)
        self.assertIn("STA VIC_MEMPTR", listing)    # $D018
        self.assertIn("ORA VIC_CTRL2", listing)     # $D016 |= $10 -> multicolour
        self.assertIn("STA VIC_CTRL2", listing)

        d018 = 0x34
        screen = 0xC000 + ((d018 >> 4) & 0x0F) * 0x0400
        charset = 0xC000 + ((d018 >> 1) & 0x07) * 0x0800
        self.assertEqual(screen, 0xCC00)
        self.assertEqual(charset, 0xD000)
        self.assertEqual(2048, 256 * 8, "a $D018-addressed charset is 2 KB, i.e. 256 glyphs")

    def test_the_colour_registers_are_loaded_from_a_driver_parameter_block(self) -> None:
        """Border/bg0/bg1/bg2 come from $C057-$C05A, consecutive, in that order.

        This is what the three trailing bytes of a picture file feed, and why they are always
        `00 XX YY` with both values a colour index below 16.
        """
        body = self.prg[2:]
        listing = "\n".join(D.disassemble(body, 0xC000, 0xC0BE - 0xC000, 8))
        pairs = re.findall(r"LDA \$(C0[0-9A-F]{2})\n[0-9A-F]{4}  [0-9A-F ]+  STA (VIC_\w+)", listing)
        self.assertEqual(
            pairs,
            [("C057", "VIC_BORDER"), ("C058", "VIC_BG0"), ("C059", "VIC_BG1"), ("C05A", "VIC_BG2")],
            listing,
        )


if __name__ == "__main__":
    unittest.main()
