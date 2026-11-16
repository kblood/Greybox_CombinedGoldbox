"""Synthetic path-boundary checks for the CoK Amiga BIGPIC registry importer."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_cok_amiga_bigpic_registry as importer  # noqa: E402


class AmigaBigpicPathContainmentTests(unittest.TestCase):
    def test_relative_files_are_contained_and_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "package"
            root.mkdir()
            (root / "image.png").write_bytes(b"contained")
            outside = Path(directory) / "outside.png"
            outside.write_bytes(b"outside")

            self.assertEqual(importer.contained_file(root, "image.png", "image"),
                             (root / "image.png").resolve())
            for path in ("../outside.png", outside.resolve(), Path("C:drive-relative.png")):
                with self.subTest(path=path), self.assertRaises(ValueError):
                    importer.contained_file(root, path, "image")

    def test_resolved_symlink_target_cannot_escape_package_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "package"
            root.mkdir()
            outside = Path(directory) / "outside.png"
            outside.write_bytes(b"outside")
            link = root / "image.png"
            real_resolve = Path.resolve

            def resolve_link(path: Path, *args, **kwargs):
                if path == link:
                    return outside
                return real_resolve(path, *args, **kwargs)

            with patch.object(Path, "resolve", resolve_link):
                with self.assertRaisesRegex(ValueError, "escapes"):
                    importer.contained_file(root, "image.png", "image")


if __name__ == "__main__":
    unittest.main()
