import unittest

from tools.dax_decode import parse_vga_chunky_items


class VgaChunkyItemsTests(unittest.TestCase):
    def test_exact_multi_item_resource(self):
        height, width8, count, base, colors = 8, 1, 3, 16, 4
        metadata = colors * 3 + colors // 2 + 4
        raw = bytearray(10 + metadata + height * width8 * 8 * count)
        raw[0], raw[1], raw[6], raw[8], raw[9] = height, width8, count, base, colors - 1
        for i in range(colors * 3):
            raw[10 + i] = i % 64
        start = 10 + metadata
        for i in range(height * width8 * 8 * count):
            raw[start + i] = (base + i) & 0xFF
        decoded = parse_vga_chunky_items(bytes(raw))
        self.assertEqual((decoded["width"], decoded["height"], decoded["count"]), (8, 8, 3))
        self.assertEqual(len(decoded["frames"]), 3)
        self.assertEqual(decoded["frames"][1][0], (base + 64) & 0xFF)

    def test_rejects_slop_and_invalid_dac(self):
        raw = bytearray(10 + 12 + 2 + 4 + 64)
        raw[0], raw[1], raw[6], raw[8], raw[9] = 8, 1, 1, 16, 3
        self.assertIsNotNone(parse_vga_chunky_items(bytes(raw)))
        self.assertIsNone(parse_vga_chunky_items(bytes(raw) + b"\0"))
        raw[10] = 64
        self.assertIsNone(parse_vga_chunky_items(bytes(raw)))


if __name__ == "__main__":
    unittest.main()
