"""Archive-backed validation of Amiga CoK 8X8D0 and disk-2 8X8D1 identities."""

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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_cok_amiga_8x8d0_registry as importer  # noqa: E402

FIXTURES_AVAILABLE = (
    importer.INVENTORY_DEFAULT.is_file() and importer.PACKAGE_DEFAULT.is_dir()
    and importer.SOURCE_DEFAULT.joinpath("amiga_non_picture_source").is_dir()
    and all((importer.AMIGA_DEFAULT / info["relative"]).is_file() for info in importer.ARCHIVES.values())
)


@unittest.skipUnless(FIXTURES_AVAILABLE, "Amiga 8X8D0/D1 archive/render/gallery fixtures are unavailable")
class Amiga8x8d0RegistryImportTests(unittest.TestCase):
    def build(self):
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        assets, blank_blocks = importer.decode_archives(importer.AMIGA_DEFAULT, importer.SOURCE_DEFAULT,
                                                        importer.PACKAGE_DEFAULT)
        pairs, pair_sources, alias_rows = importer.inventory_pairs(
            inventory, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        return registry, assets, blank_blocks, pairs, pair_sources, alias_rows

    def test_complete_disk_archive_tile_rosters_and_exact_aliases(self):
        _registry, assets, blank_blocks, pairs, pair_sources, alias_rows = self.build()
        self.assertEqual(len(assets), 1566)
        self.assertEqual(blank_blocks, 2)
        self.assertEqual(alias_rows, 1566)
        self.assertEqual(len({asset_id for ids in pair_sources.values() for asset_id in ids}), 1566)
        self.assertEqual(len(pairs), 749)
        self.assertEqual(set(assets), {asset_id for ids in pair_sources.values() for asset_id in ids})

    def test_duplicate_disk_archives_keep_distinct_ids_and_pixel_links(self):
        _registry, assets, _blank, pairs, pair_sources, _aliases = self.build()
        disk1 = "cok/amiga/disk1/8x8d0.daa/block/202/tile/0"
        disk2 = "cok/amiga/disk2/8x8d1.daa/block/202/tile/0"
        pair_id = next(pair_id for pair_id, ids in pair_sources.items() if {disk1, disk2}.issubset(ids))
        small_assets = {asset_id: assets[asset_id] for asset_id in (disk1, disk2)}
        small_pairs = {pair_id: pairs[pair_id]}
        small_sources = {pair_id: {disk1, disk2}}
        empty_registry = {"assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty_registry, small_assets, small_pairs, small_sources)
        self.assertEqual(added, 1)
        # Re-run the same small import against its committed result.
        repeated, added_again = importer.merge_registry(merged, small_assets, small_pairs, small_sources)
        self.assertEqual(repeated, merged)
        self.assertEqual(added_again, 0)
        imported_links = [link for link in merged["crossVersionLinks"]
                          if link.get("evidence", [{}])[0].get("reference") == "tools/import_cok_amiga_8x8d0_registry.py"]
        self.assertEqual(len(imported_links), 1)
        self.assertIn(disk1, assets)
        self.assertIn(disk2, assets)
        self.assertEqual(small_assets[disk1]["decoded"]["pixelSha256"], small_assets[disk2]["decoded"]["pixelSha256"])

    def test_alias_tile_mutation_fails_closed(self):
        _registry, assets, _blank, _pairs, _pair_sources, _rows = self.build()
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        changed = copy.deepcopy(inventory)
        pair = next(row for row in changed["assets"] if any(
            alias.get("platform") == "Amiga" and alias.get("family") == "Amiga 8X8D0"
            for alias in row.get("aliases", [])))
        alias = next(alias for alias in pair["aliases"] if alias.get("platform") == "Amiga"
                     and alias.get("family") == "Amiga 8X8D0")
        alias["tile"] = int(alias["tile"]) + 1
        with self.assertRaisesRegex(ValueError, "alias locator fields conflict"):
            importer.inventory_pairs(changed, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_archive_hash_mutation_fails_closed(self):
        old = importer.ARCHIVE_SHA256
        importer.ARCHIVE_SHA256 = "0" * 64
        try:
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                importer.decode_archives(importer.AMIGA_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        finally:
            importer.ARCHIVE_SHA256 = old


class Amiga8x8d0VisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "images"
        self.image_store.mkdir()
        self.asset_id = "cok/amiga/disk1/8x8d0.daa/block/7/tile/0"
        self.png = b"fixture-png-content"
        self.source_hash = hashlib.sha256(self.png).hexdigest()
        self.pixel_hash = "a" * 64
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        (self.image_store / f"{self.source_hash}.png").write_bytes(self.png)
        self.registry = {"assets": [{"id": self.asset_id, "platform": "Amiga",
            "archive": {"name": "8X8D0.DAA"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash},
            "description": {"text": "source text remains", "status": "unknown",
                "evidence": [{"kind": "decoded-pixels", "reference": "archive#7/tile/0", "note": "pinned"}]}}]}
        self.sources = {self.asset_id: {"pixelHash": self.pixel_hash}}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "An 8×8 tile with orange pixels on a dark field.",
            "evidence": [{"kind": "visual-review",
                "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}

    def tearDown(self):
        self.temp.cleanup()

    def apply_dataset(self, registry=None, dataset=None):
        return importer.apply_visual_descriptions(self.registry if registry is None else registry,
            self.sources, self.dataset if dataset is None else dataset, self.image_store, self.dataset_path)

    def test_exact_description_applies_idempotently_and_preserves_metadata(self):
        merged, summary = self.apply_dataset()
        asset = merged["assets"][0]
        self.assertEqual(summary, {"rows": 1, "uniquePixelHashes": 1})
        self.assertEqual(asset["description"]["text"], "source text remains")
        self.assertEqual(asset["description"]["status"], "unknown")
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        repeated, _ = self.apply_dataset(merged)
        self.assertEqual(merged, repeated)

    def test_incomplete_coverage_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.apply_dataset(dataset={"version": 1, "assets": []})

    def test_pixel_duplicate_wording_must_match(self):
        second_id = self.asset_id + "-duplicate"
        self.sources[second_id] = {"pixelHash": self.pixel_hash}
        second = copy.deepcopy(self.dataset["assets"][0])
        second["assetId"] = second_id
        second["visualDescription"] = "A conflicting description."
        dataset = {"version": 1, "assets": self.dataset["assets"] + [second]}
        self.registry["assets"].append({"id": second_id, "platform": "Amiga",
            "archive": {"name": "8X8D0.DAA"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash}, "description": {}})
        with self.assertRaisesRegex(ValueError, "duplicate has conflicting"):
            self.apply_dataset(dataset=dataset)

    def test_wrong_archive_and_inexact_preview_are_rejected(self):
        self.registry["assets"][0]["archive"]["name"] = "8X8D1.DAA"
        with self.assertRaisesRegex(ValueError, "does not target"):
            self.apply_dataset()
        self.registry["assets"][0]["archive"]["name"] = "8X8D0.DAA"
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["reference"] = "images/other.png"
        with self.assertRaisesRegex(ValueError, "exact source PNG"):
            self.apply_dataset(dataset=dataset)

    def test_visual_description_rejects_resolved_package_escape(self):
        outside = self.root.parent / f"{self.root.name}-outside.png"
        outside.write_bytes(self.png)
        target_name = f"{self.source_hash}.png"
        original_resolve = Path.resolve
        def resolve_with_escape(path, *args, **kwargs):
            return outside if path.name == target_name and path.parent.name == "images" else original_resolve(path, *args, **kwargs)
        with mock.patch.object(Path, "resolve", resolve_with_escape):
            with self.assertRaisesRegex(ValueError, "escapes approved root"):
                self.apply_dataset()
        outside.unlink(missing_ok=True)


class Amiga8x8d0PackageReadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.archive_root = self.root / "amiga"
        self.source_root = self.root / "source"
        self.package_root = self.root / "package"
        archive = self.archive_root / "disk1/8X8D0.DAA"
        archive.parent.mkdir(parents=True)
        archive.write_bytes(b"synthetic DAA")
        self.archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
        (self.package_root / "images").mkdir(parents=True)
        self.png_path = self.source_root / "amiga_non_picture_source/8X8D0_011/8X8D0_011_tile_00.png"
        self.png_path.parent.mkdir(parents=True)
        Image.new("RGB", (64, 64), importer.daa_decode.EGA_PALETTE[0]).save(self.png_path)
        self.png_bytes = self.png_path.read_bytes()
        self.png_hash = hashlib.sha256(self.png_bytes).hexdigest()
        (self.package_root / "images" / f"{self.png_hash}.png").write_bytes(self.png_bytes)

    def tearDown(self):
        self.temp.cleanup()

    def decode(self):
        spec = {"relative": "disk1/8X8D0.DAA", "disk": 1, "toc": [11], "tiles": {11: 1}}
        with mock.patch.dict(importer.ARCHIVES, {"8X8D0": spec}, clear=True), \
             mock.patch.object(importer, "ARCHIVE_SHA256", self.archive_hash), \
             mock.patch.object(importer.daa_decode, "parse_container", return_value=("blocks", 0, [SimpleNamespace(block_id=11)])), \
             mock.patch.object(importer.daa_decode, "decompress_block", return_value=b"tile"), \
             mock.patch.object(importer.daa_decode, "parse_8x8d_header", return_value=(1, 4, 2, 16)), \
             mock.patch.object(importer.daa_decode, "decode_8x8d_tile", return_value=[[0] * 8 for _ in range(8)]):
            return importer.decode_archives(self.archive_root, self.source_root, self.package_root)

    def test_decode_archives_bounds_hash_named_package_image(self):
        assets, _blank = self.decode()
        self.assertEqual(len(assets), 1)
        outside = self.root.parent / f"{self.root.name}-outside.png"
        outside.write_bytes(self.png_bytes)
        package_image = self.package_root / "images" / f"{self.png_hash}.png"
        original_resolve = Path.resolve
        def resolve_with_escape(path, *args, **kwargs):
            return outside if path.name == package_image.name and path.parent.name == "images" else original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_with_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.decode()
        finally:
            outside.unlink(missing_ok=True)
        escaped_images = self.root.parent / f"{self.root.name}-escaped-images"
        escaped_images.mkdir()
        redirected_image = escaped_images / package_image.name
        redirected_image.write_bytes(self.png_bytes)
        def resolve_images_escape(path, *args, **kwargs):
            return redirected_image if path.name == package_image.name and path.parent.name == "images" else original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_images_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.decode()
        finally:
            redirected_image.unlink(missing_ok=True)
            escaped_images.rmdir()

    def test_inventory_pairs_bounds_both_package_paths(self):
        source = self.source_root / "amiga_non_picture_source/8X8D0_007/8X8D0_007_tile_00.png"
        source.parent.mkdir(parents=True)
        Image.new("RGB", (64, 64), (1, 2, 3)).save(source)
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        package_image = self.package_root / "images" / f"{source_hash}.png"
        package_image.write_bytes(source.read_bytes())
        output = self.package_root / "restyled.png"
        output.write_bytes(b"restyled")
        alias = {"platform": "Amiga", "family": "Amiga 8X8D0", "sourceName": "8X8D0_007_tile_00.png",
                 "asset": 7, "tile": 0, "sourceProvenance": "amiga_non_picture_source/8X8D0_007/8X8D0_007_tile_00.png"}
        pair = {"id": "fixture", "sourceSha256": source_hash, "outputSha256": hashlib.sha256(b"restyled").hexdigest(),
                "source": f"images/{source_hash}.png", "output": "restyled.png", "aliases": [alias] * 1566}
        assets = {importer.source_id("8X8D0", 7, 0): {"decoded": {"sha256": source_hash}}}
        inventory = {"assets": [pair]}
        _pairs, _sources, alias_count = importer.inventory_pairs(inventory, assets, self.source_root, self.package_root)
        self.assertEqual(alias_count, 1566)
        outside_source = self.root.parent / f"{self.root.name}-outside-source.png"
        outside_output = self.root.parent / f"{self.root.name}-outside-output.png"
        outside_source.write_bytes(source.read_bytes())
        outside_output.write_bytes(b"restyled")
        try:
            for side, path in (("source", f"../{outside_source.name}"),
                               ("output", outside_output.as_posix())):
                unsafe = copy.deepcopy(inventory)
                unsafe["assets"][0][side] = path
                with self.subTest(side=side), self.assertRaisesRegex(ValueError, "clean relative file path"):
                    importer.inventory_pairs(unsafe, assets, self.source_root, self.package_root)
        finally:
            outside_source.unlink(missing_ok=True)
            outside_output.unlink(missing_ok=True)
        missing = copy.deepcopy(inventory)
        missing["assets"][0]["output"] = "missing.png"
        with self.assertRaises(FileNotFoundError):
            importer.inventory_pairs(missing, assets, self.source_root, self.package_root)
        directory = self.package_root / "directory"
        directory.mkdir()
        not_a_file = copy.deepcopy(inventory)
        not_a_file["assets"][0]["output"] = "directory"
        with self.assertRaises(FileNotFoundError):
            importer.inventory_pairs(not_a_file, assets, self.source_root, self.package_root)
        mismatch = copy.deepcopy(inventory)
        mismatch["assets"][0]["outputSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "packaged output hash differs"):
            importer.inventory_pairs(mismatch, assets, self.source_root, self.package_root)



if __name__ == "__main__":
    unittest.main()
