import tempfile
import unittest
from pathlib import Path

from PIL import Image

from cok_batch02_prompt_lineage import exact_prompt, read, sha, verify_crop


class Batch02PromptLineageTests(unittest.TestCase):
    def test_crop_matches_integer_scaled_source_and_preserves_alpha(self):
        native = Image.new("RGBA", (2, 2))
        native.putdata(((255, 0, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255), (255, 0, 255, 127)))
        nearest = Image.Resampling.NEAREST
        source = native.resize((4, 4), nearest)
        crop = native.resize((6, 6), nearest)
        prepared = Image.new("RGBA", (8, 8))
        prepared.paste(crop, (1, 1))
        self.assertEqual(verify_crop(source, prepared, (2, 2), (8, 8), (1, 1, 6, 6), 2, 3),
                         sha(crop.tobytes()))
        with self.assertRaisesRegex(ValueError, "Invalid crop"):
            verify_crop(source, prepared, (2, 2), (8, 8), (3, 1, 6, 6), 2, 3)
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_crop(source, prepared, (2, 2), (8, 8), (0, 1, 6, 6), 2, 3)
        prepared.paste(native.resize((6, 6), Image.Resampling.BILINEAR), (1, 1))
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_crop(source, prepared, (2, 2), (8, 8), (1, 1, 6, 6), 2, 3)
        source.putpixel((0, 0), (0, 0, 0, 255))
        with self.assertRaisesRegex(ValueError, "integer enlargement"):
            verify_crop(source, prepared, (2, 2), (8, 8), (1, 1, 6, 6), 2, 3)

    def test_prompt_binds_one_exact_saved_output_and_keeps_newlines(self):
        data = b"[TASK]\r\nDraw.\r\n\r\n[SAVE AS]\r\ndone/r0.png\r\n"
        self.assertEqual(exact_prompt(data, "done/r0.png").encode(), data)
        with self.assertRaisesRegex(ValueError, "Incorrect SAVE AS"):
            exact_prompt(data, "done/r1.png")
        with self.assertRaisesRegex(ValueError, "Incorrect SAVE AS"):
            exact_prompt(data + b"[SAVE AS]\ndone/r0.png\n", "done/r0.png")

    def test_external_reads_reject_traversal_and_drive_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "present.png").write_bytes(b"fixture")
            self.assertEqual(read(root, "present.png"), b"fixture")
            for path in ("../present.png", "./present.png", "/present.png", "C:/present.png",
                         "nested//present.png", r"nested\present.png"):
                with self.subTest(path=path), self.assertRaisesRegex(ValueError, "Unsafe path"):
                    read(root, path)
