"""Archive-backed tests for whole-block 8X8D source previews and Restyle lineage."""

from __future__ import annotations

import copy
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_asset_registry  # noqa: E402
import import_cok_dos_tile_block_previews_registry as importer  # noqa: E402

FIXTURES_AVAILABLE = (
    importer.INVENTORY_DEFAULT.is_file()
    and importer.PACKAGE_DEFAULT.is_dir()
    and all((importer.DOS_DEFAULT / f"{family}.DAX").is_file() for family in importer.ARCHIVES)
    and all(importer.SOURCE_DEFAULT.joinpath(f"dos_render_all/{family}/{family}_011.png").is_file()
            for family in ("8X8D1", "8X8D3"))
)


class DosTileBlockPackageContainmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dos_root = self.root / "dos"
        self.source_root = self.root / "source"
        self.package_root = self.root / "package"
        self.dos_root.mkdir()
        self.source_root.mkdir()
        (self.package_root / "images").mkdir(parents=True)
        archive = self.dos_root / "8X8D1.DAX"
        archive.write_bytes(b"synthetic archive")
        self.archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.rgb = bytes(channel for x in range(16) for channel in (x * 10, 20, 30))
        self.source_png = self.source_root / "dos_render_all/8X8D1/8X8D1_011.png"
        self.source_png.parent.mkdir(parents=True)
        image = Image.frombytes("RGB", (16, 1), self.rgb).resize((64, 4), Image.Resampling.NEAREST)
        image.save(self.source_png)
        self.png_bytes = self.source_png.read_bytes()
        self.source_hash = hashlib.sha256(self.png_bytes).hexdigest()
        self.package_source = self.package_root / "images" / f"{self.source_hash}.png"
        self.package_source.write_bytes(self.png_bytes)
        self.info = {"disk": 1, "sha256": self.archive_hash, "toc": [11], "blocks": [11]}

    def tearDown(self):
        self.temp.cleanup()

    def run_decode(self):
        block_ids = list(range(25))
        self.info["toc"] = block_ids
        self.info["blocks"] = block_ids
        rows = []
        for block_id in block_ids:
            source = self.source_root / f"dos_render_all/8X8D1/8X8D1_{block_id:03}.png"
            source.parent.mkdir(parents=True, exist_ok=True)
            if not source.exists():
                source.write_bytes(self.png_bytes)
            rows.append(SimpleNamespace(block_id=block_id))
        with mock.patch.dict(importer.ARCHIVES, {"8X8D1": self.info}, clear=True), \
             mock.patch.object(importer.dax_decode, "parse_container", return_value=(0, rows)), \
             mock.patch.object(importer.dax_decode, "decompress_block", return_value=b"strip"), \
             mock.patch.object(importer.dax_decode, "parse_tile_strip", return_value=(16, 1, 0)), \
             mock.patch.object(importer.dax_decode, "frame_to_rgb", return_value=self.rgb):
            return importer.decode_archives(self.dos_root, self.source_root, self.package_root)

    def inventory_fixture(self):
        alias = {"platform": "DOS", "family": "8X8D1", "sourceName": "8X8D1_011.png",
                 "frame": None, "tile": None, "asset": "8X8D1_011",
                 "sourceProvenance": "dos_render_all/8X8D1/8X8D1_011.png"}
        records = {importer.source_id("8X8D1", 11): {"decoded": {"sha256": self.source_hash}}}
        inventory = {"assets": []}
        for index in range(24):
            output = f"outputs/{index}.png"
            output_path = self.package_root / output
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"restyled-" + str(index).encode())
            output_hash = hashlib.sha256(output_path.read_bytes()).hexdigest()
            aliases = [copy.deepcopy(alias), copy.deepcopy(alias)] if index == 0 else [copy.deepcopy(alias)]
            inventory["assets"].append({"id": f"card-{index}", "sourceSha256": self.source_hash,
                "outputSha256": output_hash, "source": f"images/{self.source_hash}.png",
                "output": output, "aliases": aliases})
        return inventory, records

    def test_decode_archives_accepts_package_source_and_rejects_resolved_escape(self):
        self.assertIn(importer.source_id("8X8D1", 11), self.run_decode())
        outside = self.root / "outside.png"
        outside.write_bytes(self.png_bytes)
        original_resolve = Path.resolve
        def resolve_with_escape(path, *args, **kwargs):
            if path == self.package_source:
                return outside
            return original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_with_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.run_decode()
        finally:
            outside.unlink(missing_ok=True)

    def test_inventory_pairs_accept_relative_paths_and_reject_escape_before_hashing(self):
        inventory, records = self.inventory_fixture()
        _pairs, _sources, aliases = importer.inventory_pairs(
            inventory, records, self.source_root, self.package_root)
        self.assertEqual(aliases, 25)
        outside = self.root.parent / f"{self.root.name}-restyle.png"
        outside.write_bytes(b"restyled-0")
        try:
            for escaped in (f"../{outside.name}", outside.as_posix()):
                changed = copy.deepcopy(inventory)
                changed["assets"][0]["output"] = escaped
                with self.subTest(path=escaped), self.assertRaisesRegex(ValueError, "clean relative file path"):
                    importer.inventory_pairs(changed, records, self.source_root, self.package_root)
            changed = copy.deepcopy(inventory)
            changed["assets"][0]["outputSha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "package output hash differs"):
                importer.inventory_pairs(changed, records, self.source_root, self.package_root)
        finally:
            outside.unlink(missing_ok=True)

    def test_package_file_rejects_missing_directory_and_hash_mismatch_inputs(self):
        with self.assertRaises(FileNotFoundError):
            importer.package_file(self.package_root, "missing.png", "fixture")
        self.package_source.unlink()
        self.package_source.mkdir()
        with self.assertRaisesRegex(ValueError, "clean relative file path"):
            importer.package_file(self.package_root, "../outside.png", "fixture")

    def test_report_mode_does_not_write_the_registry(self):
        registry_path = self.root / "registry.json"
        original = b'{"registryVersion":1,"assets":[],"restyles":[],"animationGroups":[],"crossVersionLinks":[]}\n'
        registry_path.write_bytes(original)
        registry = {"registryVersion": 1, "assets": [], "restyles": [],
                    "animationGroups": [], "crossVersionLinks": []}
        with mock.patch.object(importer.sys, "argv", ["importer", "--registry", str(registry_path)]), \
             mock.patch.object(importer, "read_json", side_effect=[registry, {"assets": []}]), \
             mock.patch.object(importer, "decode_archives", return_value={}), \
             mock.patch.object(importer, "inventory_pairs", return_value=({}, {}, 0)), \
             mock.patch.object(importer, "merge_registry", return_value=(registry, 0)):
            self.assertEqual(importer.main(), 0)
        self.assertEqual(registry_path.read_bytes(), original)


@unittest.skipUnless(FIXTURES_AVAILABLE, "DOS tile-block archive/render/gallery fixtures are unavailable")
class DosTileBlockPreviewTests(unittest.TestCase):
    def build(self):
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        records = importer.decode_archives(importer.DOS_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        pairs, pair_sources, alias_count = importer.inventory_pairs(
            inventory, records, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        return inventory, records, pairs, pair_sources, alias_count

    def test_all_whole_block_renders_and_gallery_aliases_match(self):
        _inventory, records, pairs, pair_sources, alias_count = self.build()
        self.assertEqual(len(records), 25)
        self.assertEqual(alias_count, 25)
        self.assertEqual(len(pairs), 24)
        self.assertEqual({record["locator"]["kind"] for record in records.values()}, {"whole-image"})
        shared_ids = {
            importer.source_id("8X8D1", 23),
            importer.source_id("8X8D3", 23),
        }
        self.assertIn(shared_ids, [ids for ids in pair_sources.values()])
        self.assertTrue(all(record["decoded"]["width"] == 16 for record in records.values()))
        self.assertTrue(all(record["decoded"]["height"] > 0 for record in records.values()))
        empty = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty, records, pairs, pair_sources)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])
        self.assertEqual(added, 1)
        self.assertEqual(len(merged["assets"]), 25)
        self.assertEqual(len(merged["restyles"]), 24)

    def test_idempotence_and_inventory_hash_mutation_rejection(self):
        inventory, records, pairs, pair_sources, _aliases = self.build()
        empty = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty, records, pairs, pair_sources)
        again, added_again = importer.merge_registry(merged, records, pairs, pair_sources)
        self.assertEqual(merged, again)
        self.assertEqual(added, 1)
        self.assertEqual(added_again, 0)
        changed = copy.deepcopy(inventory)
        row = next(item for item in changed["assets"] if any(
            alias.get("family") == "8X8D1" and alias.get("sourceName") == "8X8D1_011.png"
            and alias.get("frame") is None and alias.get("tile") is None
            for alias in item.get("aliases", [])))
        row["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "inventory source hash does not match"):
            importer.inventory_pairs(changed, records, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_mutated_archive_pin_is_rejected(self):
        family = "8X8D1"
        old = importer.ARCHIVES[family]["sha256"]
        importer.ARCHIVES[family]["sha256"] = "0" * 64
        try:
            with self.assertRaisesRegex(ValueError, "archive hash differs"):
                importer.decode_archives(importer.DOS_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        finally:
            importer.ARCHIVES[family]["sha256"] = old


if __name__ == "__main__":
    unittest.main()
