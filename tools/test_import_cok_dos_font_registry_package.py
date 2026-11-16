"""Synthetic-only package containment tests for the CoK DOS font importer."""

from __future__ import annotations

import sys
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_cok_dos_font_registry as importer  # noqa: E402


class FontPackagePathTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.package = self.root / "package"
        (self.package / "images").mkdir(parents=True)
        self.source = self.package / "images" / "source.png"
        self.source.write_bytes(b"synthetic source")
        self.output = self.package / "images" / "output.png"
        self.output.write_bytes(b"synthetic output")

    def tearDown(self):
        self.temp.cleanup()

    def verify_pair(self):
        pair = {"id": importer.CARD, "source": "images/source.png", "output": "images/output.png"}
        with mock.patch.object(importer, "verify_pair_metadata"), \
             mock.patch.object(importer, "SOURCE_SHA", hashlib.sha256(self.source.read_bytes()).hexdigest()), \
             mock.patch.object(importer, "OUTPUT_SHA", hashlib.sha256(self.output.read_bytes()).hexdigest()):
            return importer.verify_pair({"assets": [pair]}, self.package)

    def test_package_files_are_resolved_inside_root(self):
        self.assertEqual(importer.package_file(self.package, "images/source.png", "source"), self.source.resolve())
        self.assertEqual(importer.package_file(self.package, "images/output.png", "output"), self.output.resolve())

    def test_package_paths_reject_traversal_absolute_and_missing_files(self):
        outside = self.root / "outside.png"
        outside.write_bytes(b"synthetic")
        for path in ("../outside.png", outside.as_posix(), "images/../outside.png"):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "clean relative file path"):
                importer.package_file(self.package, path, "source")
        with self.assertRaises(FileNotFoundError):
            importer.package_file(self.package, "images/missing.png", "source")

    def test_resolved_package_image_leaf_and_images_directory_escapes_are_rejected(self):
        outside_dir = self.root / "outside-images"
        outside_dir.mkdir()
        escaped_source = outside_dir / self.source.name
        escaped_source.write_bytes(self.source.read_bytes())
        original_resolve = Path.resolve

        def resolve_leaf_escape(path, *args, **kwargs):
            if path == self.source:
                return escaped_source
            return original_resolve(path, *args, **kwargs)

        with mock.patch.object(Path, "resolve", resolve_leaf_escape):
            with self.assertRaisesRegex(ValueError, "escapes approved root"):
                self.verify_pair()

        # Model an images-directory symlink by resolving the manifest path under an
        # external directory while leaving its hash-named leaf unchanged.
        escaped_directory_leaf = outside_dir / self.output.name
        escaped_directory_leaf.write_bytes(self.output.read_bytes())

        def resolve_images_directory_escape(path, *args, **kwargs):
            if path == self.output:
                return escaped_directory_leaf
            return original_resolve(path, *args, **kwargs)

        with mock.patch.object(Path, "resolve", resolve_images_directory_escape):
            with self.assertRaisesRegex(ValueError, "escapes approved root"):
                self.verify_pair()


if __name__ == "__main__":
    unittest.main()
