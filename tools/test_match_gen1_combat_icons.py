import unittest

from PIL import Image

from tools.match_gen1_combat_icons import (
    FRAME_HEADER,
    ORIGIN,
    Icon,
    compare_at_palette_invariant,
    decode_icon,
)


class MatchGen1CombatIconsTests(unittest.TestCase):
    def test_decodes_standard_24_and_48_pixel_icons(self):
        for size in (24, 48):
            packed_bytes = size * size // 2
            raw = bytearray(FRAME_HEADER + packed_bytes)
            raw[0:4] = bytes((size, 0, size // 8, 0))
            raw[8] = 1
            raw[FRAME_HEADER:] = bytes([0x10]) * packed_bytes
            icon = decode_icon(bytes(raw), 42)
            self.assertIsNotNone(icon)
            self.assertEqual((icon.width, icon.height), (size, size))
            self.assertEqual(icon.indices[:4], (1, 0, 1, 0))

    def test_rejects_noncombat_picture_size(self):
        raw = bytearray(FRAME_HEADER + 32 * 32 // 2)
        raw[0:4] = b"\x20\x00\x04\x00"
        raw[8] = 1
        self.assertIsNone(decode_icon(bytes(raw), 1))

    def test_palette_invariant_comparison_recovers_mapping_and_flip(self):
        indices = tuple(1 if x < 16 else 2 for _y in range(24) for x in range(24))
        icon = Icon(
            block_id=9,
            width=24,
            height=24,
            indices=indices,
            rgb=tuple((0, 0, 170) if index == 1 else (0, 170, 0) for index in indices),
        )
        image = Image.new("RGB", (320, 200), (0, 0, 0))
        pixels = image.load()
        for y in range(24):
            for x in range(24):
                pixels[ORIGIN[0] + 24 + x, ORIGIN[1] + 48 + y] = (
                    (243, 65, 65) if x < 16 else (48, 211, 48)
                )

        mismatch, opaque, mapping = compare_at_palette_invariant(image, 1, 2, icon)
        self.assertEqual((mismatch, opaque), (0, 576))
        self.assertEqual(mapping, {1: (243, 65, 65), 2: (48, 211, 48)})

        mismatch, opaque, mapping = compare_at_palette_invariant(image, 1, 2, icon, flipped=True)
        self.assertEqual(mismatch, 192)
        self.assertEqual(opaque, 576)
        self.assertEqual(mapping[2], (243, 65, 65))


if __name__ == "__main__":
    unittest.main()
