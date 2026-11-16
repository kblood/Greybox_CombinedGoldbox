"""Contract tests for importing solved C64 `PIC*` assets into native CCFP GBIM scenes."""
from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_native_scene as native_scene
import c64_pic


def synthetic_picture() -> tuple[c64_pic.Picture, bytes]:
    """A valid 304x120 picture with one visible multicolour glyph cell."""
    body = bytearray(c64_pic.BODY_LEN)
    body[0] = 0x40  # first cell selects the first shipped glyph
    body[c64_pic.COLOUR_OFF] = 0x0B  # multicolour, cell colour 3
    body[c64_pic.GLYPH_OFF] = 0x1B  # 00,01,10,11 across first scanline
    body[c64_pic.REG_OFF:c64_pic.REG_OFF + 3] = bytes((6, 7, 8))
    return c64_pic.Picture(bytes((0, 0)) + bytes(body)), bytes(512)


class C64NativeSceneTests(unittest.TestCase):
    def test_encodes_the_exact_bounded_gbim_v1_contract(self) -> None:
        picture, resident = synthetic_picture()
        encoded = native_scene.gbim_scene(picture, resident, 0x70)

        self.assertEqual(
            (b"GBIM", 1, 0x70, 1, 0, 304, 120),
            struct.unpack("<4sHHBBHH", encoded[:native_scene.GBIM_HEADER_SIZE]),
        )
        self.assertEqual(native_scene.GBIM_HEADER_SIZE + 304 * 120 + 768, len(encoded))
        pixels = encoded[native_scene.GBIM_HEADER_SIZE:native_scene.GBIM_HEADER_SIZE + 8]
        self.assertEqual(bytes((6, 6, 7, 7, 8, 8, 3, 3)), pixels)
        palette = encoded[-768:]
        self.assertEqual(bytes(c64_pic.PALETTE[6]), palette[18:21])
        self.assertEqual(bytes(c64_pic.PALETTE[15]), palette[45:48])
        self.assertEqual(bytes(3), palette[48:51])

    def test_rejects_a_block_id_outside_the_native_resource_field(self) -> None:
        picture, resident = synthetic_picture()
        with self.assertRaisesRegex(ValueError, "outside uint16"):
            native_scene.gbim_scene(picture, resident, 0x10000)


if __name__ == "__main__":
    unittest.main()
