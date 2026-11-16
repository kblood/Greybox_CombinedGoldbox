import unittest

from tools.match_gen1_combat_tiles import TILESET_HEADER, decode_tileset


class MatchGen1CombatTilesTests(unittest.TestCase):
    def test_decodes_exact_24x24_tileset_and_preserves_indices(self):
        tile_bytes = 24 * 3 * 4
        raw = bytearray(TILESET_HEADER + 2 * tile_bytes)
        raw[0:4] = b"\x18\x00\x03\x00"
        raw[8] = 2
        raw[TILESET_HEADER:TILESET_HEADER + tile_bytes] = bytes([0x12]) * tile_bytes
        raw[TILESET_HEADER + tile_bytes:] = bytes([0xAF]) * tile_bytes
        tiles = decode_tileset(bytes(raw), block_id=7, flat_start=9)
        self.assertEqual([(tile.flat_index, tile.block_id, tile.frame_index) for tile in tiles], [(9, 7, 0), (10, 7, 1)])
        self.assertEqual(tiles[0].rgb[0], (0, 0, 170))
        self.assertEqual(tiles[0].rgb[1], (0, 170, 0))

    def test_rejects_noncombat_geometry(self):
        raw = bytearray(TILESET_HEADER + 2 * 32)
        raw[0:4] = b"\x08\x00\x01\x00"
        raw[8] = 2
        self.assertEqual(decode_tileset(bytes(raw), block_id=1), [])


if __name__ == "__main__":
    unittest.main()
