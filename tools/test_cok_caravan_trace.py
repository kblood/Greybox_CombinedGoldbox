"""Offline checks for the fail-closed CoK caravan trace worker."""

from __future__ import annotations

import unittest
import tempfile
from pathlib import Path

from PIL import Image

from tools.analyze_goldbox_menu_pixels import detect_cok_profile
from tools.cok_caravan_trace import atomic_png, parse_region, verify_menu


class CaravanTraceTests(unittest.TestCase):
    def test_region_parser_accepts_hex_and_rejects_empty_ranges(self) -> None:
        self.assertEqual(parse_region("0x48b50:0x1000"), (0x48B50, 0x1000))
        with self.assertRaisesRegex(Exception, "length positive"):
            parse_region("0x48b50:0")

    def test_menu_gate_requires_profile_label_and_selection(self) -> None:
        report = {
            "cok_combat_profile": "done_short",
            "selected_indices": [0],
            "runs": [{"text": "QUIT"}, {"text": "AUTO"}, {"text": "SPEED"}],
        }
        verify_menu(report, "done_short", ["auto", "speed"], 0)
        with self.assertRaisesRegex(RuntimeError, "expected menu"):
            verify_menu(report, "primary", [], None)
        with self.assertRaisesRegex(RuntimeError, "missing decoded"):
            verify_menu(report, None, ["EXIT"], None)
        with self.assertRaisesRegex(RuntimeError, "selected index"):
            verify_menu(report, None, [], 2)

    def test_atomic_png_is_a_readable_opaque_image(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "frame.png"
            # GameLink uses BGRA and commonly provides a zero alpha byte.
            atomic_png(path, 1, 1, bytes((0x11, 0x22, 0x33, 0x00)))
            self.assertEqual(Image.open(path).convert("RGBA").getpixel((0, 0)), (0x33, 0x22, 0x11, 0xFF))

    def test_post_combat_command_geometries_are_distinct(self) -> None:
        def runs(*spans: tuple[int, int]) -> list[dict[str, object]]:
            return [{"x": list(span)} for span in spans]

        self.assertEqual(detect_cok_profile(runs((0, 64), (82, 144), (162, 224), (242, 320), (338, 400))), "treasure")
        self.assertEqual(detect_cok_profile(runs((0, 48), (66, 96))), "yes_no")
        self.assertEqual(
            detect_cok_profile(runs((0, 48), (66, 128), (146, 304), (322, 432), (450, 512), (530, 608))),
            "destination",
        )
        self.assertIsNone(detect_cok_profile(runs((0, 64), (82, 144), (162, 224))))


if __name__ == "__main__":
    unittest.main()
