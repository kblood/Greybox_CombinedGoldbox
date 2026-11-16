"""Synthetic package-path containment tests for the CoK DOS BIGPIC registry importer."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_cok_dos_bigpic_registry as importer  # noqa: E402


class DosBigpicPackagePathTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dos_root = self.root / "dos"
        self.source_root = self.root / "source"
        self.package_root = self.root / "package"
        self.dos_root.mkdir()
        self.source_root.mkdir()
        (self.package_root / "images").mkdir(parents=True)
        archive = self.dos_root / "BIGPIC1.DAX"
        archive.write_bytes(b"synthetic BIGPIC archive")
        self.archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.rgb = bytes((31, 47, 59))
        self.source_png = self.source_root / "BIGPIC1/BIGPIC1_112.png"
        self.source_png.parent.mkdir(parents=True)
        Image.new("RGB", (4, 4), tuple(self.rgb)).save(self.source_png)
        self.source_bytes = self.source_png.read_bytes()
        self.source_hash = hashlib.sha256(self.source_bytes).hexdigest()
        (self.source_root / "BIGPIC1/BIGPIC1_121.png").write_bytes(self.source_bytes)
        (self.package_root / "images" / f"{self.source_hash}.png").write_bytes(self.source_bytes)
        self.output_bytes = b"synthetic-restyle"
        (self.package_root / "restyled.png").write_bytes(self.output_bytes)
        self.inventory = {"assets": [{
            "id": "bigpic-112",
            "sourceSha256": self.source_hash,
            "outputSha256": hashlib.sha256(self.output_bytes).hexdigest(),
            "source": f"images/{self.source_hash}.png",
            "output": "restyled.png",
            "aliases": [{"platform": "DOS", "family": "BIGPIC1", "asset": "BIGPIC1_112", "frame": 0}],
        }]}
        self.receipt = {"synthetic": True}

    def tearDown(self):
        self.temp.cleanup()

    def decode(self, inventory=None):
        block_rows = [SimpleNamespace(block_id=112), SimpleNamespace(block_id=121)]
        with mock.patch.dict(importer.BLOCKS, {"BIGPIC1": [112, 121]}, clear=True), \
             mock.patch.dict(importer.ARCHIVE_PINS, {"BIGPIC1": self.archive_hash}, clear=True), \
             mock.patch.object(importer.dax_decode, "parse_container", return_value=(0, block_rows)), \
             mock.patch.object(importer.dax_decode, "decompress_block", return_value=b"frame"), \
             mock.patch.object(importer.dax_decode, "parse_standard_frame", return_value=(1, 1, 0, 0)), \
             mock.patch.object(importer.dax_decode, "frame_to_rgb", return_value=self.rgb):
            return importer.decoded_records(self.dos_root, self.source_root, self.package_root,
                                            self.inventory if inventory is None else inventory, self.receipt)

    def test_decoded_records_accepts_contained_source_and_output_files(self):
        assets, pairs = self.decode()
        self.assertEqual(len(assets), 2)
        self.assertEqual(list(pairs), [importer.source_id("BIGPIC1", 112)])

    def test_decoded_records_rejects_hash_valid_traversal_and_absolute_paths(self):
        outside_source = self.root.parent / f"{self.root.name}-source.png"
        outside_output = self.root.parent / f"{self.root.name}-output.png"
        outside_source.write_bytes(self.source_bytes)
        outside_output.write_bytes(self.output_bytes)
        try:
            for field, path in (("source", f"../{outside_source.name}"),
                                ("output", outside_output.as_posix())):
                inventory = copy.deepcopy(self.inventory)
                inventory["assets"][0][field] = path
                with self.subTest(field=field), self.assertRaisesRegex(ValueError, "clean relative file path"):
                    self.decode(inventory)
        finally:
            outside_source.unlink(missing_ok=True)
            outside_output.unlink(missing_ok=True)

    def test_decoded_records_rejects_resolved_package_and_images_symlink_escapes(self):
        outside = self.root.parent / f"{self.root.name}-outside.png"
        outside.write_bytes(self.source_bytes)
        package_image = self.package_root / "images" / f"{self.source_hash}.png"
        original_resolve = Path.resolve
        def resolve_leaf_escape(path, *args, **kwargs):
            return outside if path.name == package_image.name and path.parent.name == "images" else original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_leaf_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.decode()
        finally:
            outside.unlink(missing_ok=True)

        escaped_images = self.root.parent / f"{self.root.name}-escaped-images"
        escaped_images.mkdir()
        redirected = escaped_images / package_image.name
        redirected.write_bytes(self.source_bytes)
        def resolve_directory_escape(path, *args, **kwargs):
            return redirected if path.name == package_image.name and path.parent.name == "images" else original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_directory_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.decode()
        finally:
            redirected.unlink(missing_ok=True)
            escaped_images.rmdir()

    def test_decoded_records_rejects_missing_directory_and_contained_hash_mismatch(self):
        for output, message in (("missing.png", FileNotFoundError),):
            inventory = copy.deepcopy(self.inventory)
            inventory["assets"][0]["output"] = output
            with self.subTest(output=output), self.assertRaises(message):
                self.decode(inventory)
        directory = self.package_root / "directory"
        directory.mkdir()
        inventory = copy.deepcopy(self.inventory)
        inventory["assets"][0]["output"] = "directory"
        with self.assertRaises(FileNotFoundError):
            self.decode(inventory)
        inventory = copy.deepcopy(self.inventory)
        inventory["assets"][0]["outputSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "packaged output file hash differs"):
            self.decode(inventory)

    def test_report_mode_does_not_write_registry(self):
        registry_path = self.root / "registry.json"
        original = b'{"assets":[],"restyles":[],"animationGroups":[],"crossVersionLinks":[]}\n'
        registry_path.write_bytes(original)
        registry = {"assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        with mock.patch.object(importer.sys, "argv", ["importer", "--registry", str(registry_path)]), \
             mock.patch.object(importer, "read_json", side_effect=[registry, self.inventory]), \
             mock.patch.object(importer.picture_consumers, "build_receipt", return_value=self.receipt), \
             mock.patch.object(importer, "decoded_records", return_value=({}, {})), \
             mock.patch.object(importer, "merge", return_value=registry), \
             mock.patch.object(importer.graphics_asset_registry, "validate", return_value=([], [])), \
             mock.patch.object(importer.picture_consumers, "atomic_json") as writer:
            self.assertEqual(importer.main(), 0)
        writer.assert_not_called()
        self.assertEqual(registry_path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
