from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import vroomm_layout


class CompleteLoadImageStubTests(unittest.TestCase):
    def test_cok_stub_words_come_from_runtime_image(self) -> None:
        game = vroomm_layout.map_game(ROOT / "Champions of Krynn")
        self.assertEqual(game.descriptor_count, 35)
        self.assertEqual(game.strict_status, "verified")
        descriptor = game.descriptors[0]
        self.assertEqual(descriptor.runtime_descriptor_image_offset, 0x380)
        self.assertEqual(descriptor.runtime_stub_array_image_offset, 0x3A0)
        self.assertEqual(descriptor.stub_proc_offsets, [0xB2, 0x42])
        self.assertEqual(game.packed_runtime_stub_differences, 14)
        self.assertTrue(game.owned_stub_targets_in_code)
        self.assertTrue(all(row.runtime_stub_array_image_offset is not None for row in game.descriptors))
        self.assertEqual(game.lcall_route_counts.get("public_stub_layout_unresolved", 0), 0)


if __name__ == "__main__":
    unittest.main()
