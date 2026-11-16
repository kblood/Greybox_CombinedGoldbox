"""Champions of Krynn `START.EXE` — the character-generation string tables.

`START.EXE` is CoK's character generator, and it carries the race / alignment / deity menu strings
as fixed-stride arrays of length-prefixed strings. Their ORDER is the game's own enum order, which
is what makes them worth pinning: saved-character byte 90 indexes the race table and byte 91
indexes the class table. EXEPACK compression interrupts the fixed stride on disk; the complete
tables must be read from the unpacked image.

Skips when the game data is absent, like every other retail-data test in this suite.
"""
import os
import unittest
from pathlib import Path

from exepack_unpack import unpack

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = os.path.join(REPO, "Champions of Krynn", "START.EXE")

RACES = ["Silvanesti Elf", "Qualinesti Elf", "Half-elf", "Mountain Dwarf", "Hill Dwarf", "Kender"]
ALIGNMENTS = [
    "Lawful Good", "Lawful Neutral", "Lawful Evil",
    "Neutral Good", "True Neutral", "Neutral Evil",
    "Chaotic Good", "Chaotic Neutral", "Chaotic Evil",
]
DEITIES = ["None", "Paladine", "Majere", "Kiri-Jolith", "Mishakal", "Sirrion", "Reorx", "Shinare"]

TABLES = [
    ("race", 0xC625, 16, RACES),
    ("alignment", 0xC69F, 17, ALIGNMENTS),
    ("deity", 0xC738, 12, DEITIES),
]


def _read(data, off, stride, count):
    out = []
    for k in range(count):
        s = off + stride * k
        n = data[s]
        out.append(data[s + 1:s + 1 + n].decode("latin-1"))
    return out


class CokStartExeStringTables(unittest.TestCase):
    def setUp(self):
        if not os.path.exists(START):
            self.skipTest("Champions of Krynn/START.EXE not present")
        with open(START, "rb") as fh:
            self.data = fh.read()

    def test_the_three_tables_decode_at_their_recorded_offsets(self):
        for label, off, stride, expect in TABLES:
            with self.subTest(label):
                self.assertEqual(_read(self.data, off, stride, len(expect)), expect)

    def test_each_stride_is_the_one_the_data_actually_uses(self):
        # The null: a table read at the wrong stride must NOT still decode. Without this, "the
        # strings are there" would pass for any stride large enough to skip past the padding.
        for label, off, stride, expect in TABLES:
            for delta in (-1, 1):
                with self.subTest(label=label, stride=stride + delta):
                    self.assertNotEqual(_read(self.data, off, stride + delta, len(expect)), expect)

    def test_packed_race_prefix_omits_human_but_unpacked_table_includes_it(self):
        # The six-entry packed prefix once led us to exclude Human from the enum. The
        # decompressed image proves that compression, rather than a menu boundary, broke stride.
        self.assertNotIn("Human", _read(self.data, 0xC625, 16, 6))
        self.assertIn(b"\x05Human", self.data[0xC67C:0xC6A0])
        image, _ = unpack(Path(START))
        self.assertEqual(_read(image, 0xCDA0, 16, 8), RACES + ["Human", "Monster"])

    def test_complete_unpacked_class_enum(self):
        image, _ = unpack(Path(START))
        expected = [
            "Cleric", "Druid", "Fighter", "Paladin", "Ranger", "Mage", "Thief", "Knight",
            "Cleric/Fighter", "Cleric/Fighter/Mage", "Cleric/Ranger", "Cleric/Mage",
            "Cleric/Thief", "Fighter/Mage", "Fighter/Thief", "Fighter/Mage/Thief", "Mage/Thief",
        ]
        self.assertEqual(_read(image, 0xCBBA, 27, 17), expected)
        for stride in (26, 28):
            self.assertNotEqual(_read(image, 0xCBBA, stride, 17), expected)

    def test_the_race_table_is_immediately_after_the_prompt_that_introduces_it(self):
        # Anchors the offset to content rather than to a bare number, so a different CoK build
        # would fail loudly here instead of silently decoding garbage.
        self.assertIn(b"OK buddy, who are you?", self.data[0xC600:0xC625])


if __name__ == "__main__":
    unittest.main()
