"""Tests for full-canvas source render comparisons."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_source_render  # noqa: E402


class ExactSourceRenderTests(unittest.TestCase):
    def test_matches_full_nearest_neighbor_expansion(self):
        native = bytes((255, 0, 0, 0, 255, 0))
        image = Image.frombytes("RGB", (2, 1), native).resize((8, 4), Image.Resampling.NEAREST)
        self.assertTrue(graphics_source_render.exact_nearest_neighbor_render(image, native, 2, 1, 4))

    def test_rejects_changes_outside_the_downsample_sample_pixels(self):
        native = bytes((255, 0, 0, 0, 255, 0))
        image = Image.frombytes("RGB", (2, 1), native).resize((8, 4), Image.Resampling.NEAREST)
        image.putpixel((1, 0), (0, 0, 255))
        self.assertEqual(image.resize((2, 1), Image.Resampling.NEAREST).tobytes(), native)
        self.assertFalse(graphics_source_render.exact_nearest_neighbor_render(image, native, 2, 1, 4))

    def test_rejects_bad_dimensions_and_native_length(self):
        image = Image.new("RGB", (8, 4))
        self.assertFalse(graphics_source_render.exact_nearest_neighbor_render(image, bytes(5), 2, 1, 4))
        self.assertFalse(graphics_source_render.exact_nearest_neighbor_render(image, bytes(6), 2, 1, 2))


if __name__ == "__main__":
    unittest.main()
