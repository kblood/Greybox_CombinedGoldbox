import tempfile
import unittest
from pathlib import Path

from PIL import Image

from tools.match_gen1_frame_tiles import (
    TILE_BYTES,
    TILE_HEADER,
    VGA_TILE_BYTES,
    VGA_TRAILER_BYTES,
    build_report,
    decode_tiles,
    match_cell,
    normalize_screenshot,
    standard_frame_cells,
)


def tile_block(packed_tiles: list[bytes]) -> bytes:
    raw = bytearray(TILE_HEADER + len(packed_tiles) * TILE_BYTES)
    raw[0:4] = b"\x08\x00\x01\x00"
    raw[8] = len(packed_tiles)
    for index, packed in enumerate(packed_tiles):
        raw[TILE_HEADER + index * TILE_BYTES:TILE_HEADER + (index + 1) * TILE_BYTES] = packed
    return bytes(raw)


class MatchGen1FrameTilesTests(unittest.TestCase):
    def test_decodes_chunky_8x8_tiles(self):
        tiles = decode_tiles(tile_block([bytes([0x12]) * TILE_BYTES, bytes([0xAF]) * TILE_BYTES]))
        self.assertEqual(len(tiles), 2)
        self.assertEqual(tiles[0].indices[:4], (1, 2, 1, 2))
        self.assertEqual(tiles[1].indices[-4:], (10, 15, 10, 15))

    def test_decodes_gateway_vga_extended_8x8_tiles(self):
        raw = bytearray(TILE_HEADER + VGA_TILE_BYTES + VGA_TRAILER_BYTES[0])
        raw[0:4] = b"\x08\x00\x01\x00"
        raw[8] = 1
        pixel_start = TILE_HEADER + VGA_TRAILER_BYTES[0]
        raw[pixel_start] = 0b10101010
        raw[pixel_start + 4] = 0b10000000
        tile = decode_tiles(bytes(raw))[0]
        self.assertEqual(tile.indices[:8], (17, 0, 1, 0, 1, 0, 1, 0))

    def test_match_ignores_magenta_transparency_but_not_opaque_pixels(self):
        tiles = decode_tiles(tile_block([bytes([0xD2]) * TILE_BYTES, bytes([0x12]) * TILE_BYTES]))
        image = Image.new("RGB", (320, 200), (255, 255, 255))
        pixels = image.load()
        for y in range(8):
            for x in range(8):
                if x % 2:
                    pixels[x, y] = (0, 170, 0)  # EGA green, index 2
        transparent = match_cell(image, 0, 0, tiles)
        opaque = match_cell(image, 0, 0, tiles, None)
        self.assertEqual(transparent["tile"], 0)
        self.assertTrue(transparent["exact"])
        self.assertFalse(opaque["exact"])

    def test_palette_invariant_match_recovers_index_pattern_and_mapping(self):
        tiles = decode_tiles(tile_block([bytes([0x12]) * TILE_BYTES, bytes([0x11]) * TILE_BYTES]))
        image = Image.new("RGB", (320, 200), (9, 8, 7))
        pixels = image.load()
        for y in range(8):
            for x in range(8):
                pixels[x, y] = (17, 34, 51) if x % 2 == 0 else (68, 85, 102)
        fixed = match_cell(image, 0, 0, tiles)
        invariant = match_cell(image, 0, 0, tiles, palette_invariant=True)
        self.assertFalse(fixed["exact"])
        self.assertTrue(invariant["exact"])
        self.assertEqual(invariant["tile"], 0)
        self.assertEqual(invariant["palette_mapping"], {"1": [17, 34, 51], "2": [68, 85, 102]})

    def test_normalizes_integer_scaled_gamelink_frame(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "frame.png"
            image = Image.new("RGB", (640, 400), (0, 0, 170))
            image.save(path)
            normalized = normalize_screenshot(path)
            self.assertEqual(normalized.size, (320, 200))
            self.assertEqual(normalized.getpixel((319, 199)), (0, 0, 170))

    def test_standard_geometry_has_direct_inner_array_padding(self):
        cells = standard_frame_cells()
        self.assertEqual(cells["outerTop"], [(col, 0) for col in range(40)])
        self.assertEqual(cells["innerTop"][0], (2, 2))
        self.assertEqual(cells["innerTop"][-1], (14, 2))


if __name__ == "__main__":
    unittest.main()
