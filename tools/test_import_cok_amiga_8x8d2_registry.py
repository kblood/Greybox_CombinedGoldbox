"""Archive-backed checks for the complete Amiga 8X8D2 source tile bank."""

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
import import_cok_amiga_8x8d2_registry as importer  # noqa: E402


FIXTURES_AVAILABLE = (
    importer.ARCHIVE_DEFAULT.is_file()
    and importer.INVENTORY_DEFAULT.is_file()
    and importer.PACKAGE_DEFAULT.is_dir()
    and (importer.SOURCE_ROOT_DEFAULT / "amiga_non_picture_source").is_dir()
)


@unittest.skipUnless(FIXTURES_AVAILABLE, "Amiga 8X8D2 archive/render/gallery fixtures are unavailable")
class Amiga8x8d2RegistryImportTests(unittest.TestCase):
    def build(self):
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        assets = importer.decode_archive(importer.ARCHIVE_DEFAULT, importer.SOURCE_ROOT_DEFAULT,
                                         importer.PACKAGE_DEFAULT)
        pairs, pair_sources, alias_rows = importer.inventory_pairs(
            inventory, assets, importer.SOURCE_ROOT_DEFAULT, importer.PACKAGE_DEFAULT)
        return registry, assets, pairs, pair_sources, alias_rows

    def test_all_910_archive_tiles_and_gallery_aliases_verify(self):
        registry, assets, pairs, pair_sources, alias_rows = self.build()
        self.assertEqual(len(assets), 910)
        self.assertEqual(alias_rows, 1250)
        self.assertEqual(len({asset_id for ids in pair_sources.values() for asset_id in ids}), 904)
        self.assertEqual(len(pairs), 897)
        self.assertEqual(sum(len(ids) > 1 for ids in pair_sources.values()), 5)
        merged, _new_cross_matches = importer.merge_registry(registry, assets, pairs, pair_sources)
        amiga_ids = set(assets)
        dos_ids = {asset["id"] for asset in merged["assets"]
                   if asset.get("platform") == "DOS-EGA" and asset.get("locator", {}).get("kind") == "tile"}
        exact_cross_links = [link for link in merged["crossVersionLinks"]
                             if link.get("relation") == "pixel-identical"
                             and link.get("fromAssetId") in amiga_ids and link.get("toAssetId") in dos_ids]
        self.assertEqual(len(exact_cross_links), 1293)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])

    def test_import_is_idempotent_and_pixel_duplicates_keep_their_locators(self):
        registry, assets, pairs, pair_sources, _alias_rows = self.build()
        merged, _ = importer.merge_registry(registry, assets, pairs, pair_sources)
        again, _ = importer.merge_registry(merged, assets, pairs, pair_sources)
        self.assertEqual(merged, again)
        links = [link for link in merged["crossVersionLinks"]
                 if link.get("relation") == "pixel-identical"
                 and link.get("evidence", [{}])[0].get("reference") == "tools/import_cok_amiga_8x8d2_registry.py"]
        self.assertEqual(len(links), 42)
        self.assertEqual(len({asset_id for asset_id in assets}), 910)
        self.assertTrue(all(asset_id in {asset["id"] for asset in merged["assets"]} for asset_id in assets))

    def test_alias_tile_mutation_is_rejected(self):
        registry, assets, _pairs, _pair_sources, _alias_rows = self.build()
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        changed = copy.deepcopy(inventory)
        pair = next(row for row in changed["assets"] if any(
            alias.get("platform") == "Amiga" and alias.get("sourceArchive", "").upper() == "8X8D2.DAA"
            for alias in row.get("aliases", [])))
        alias = next(alias for alias in pair["aliases"] if alias.get("platform") == "Amiga"
                     and alias.get("sourceArchive", "").upper() == "8X8D2.DAA")
        alias["tile"] = int(alias["tile"]) + 1
        with self.assertRaisesRegex(ValueError, "alias locator fields conflict"):
            importer.inventory_pairs(changed, assets, importer.SOURCE_ROOT_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_archive_sha_mutation_fails_closed(self):
        old = importer.ARCHIVE_SHA256
        importer.ARCHIVE_SHA256 = "0" * 64
        try:
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                importer.decode_archive(importer.ARCHIVE_DEFAULT, importer.SOURCE_ROOT_DEFAULT,
                                        importer.PACKAGE_DEFAULT)
        finally:
            importer.ARCHIVE_SHA256 = old


class Amiga8x8d2VisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "images"
        self.image_store.mkdir()
        self.asset_id = "cok/amiga/disk3/8x8d2.daa/block/10/tile/0"
        self.png = b"fixture-png-content"
        self.source_hash = hashlib.sha256(self.png).hexdigest()
        self.pixel_hash = "a" * 64
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        (self.image_store / f"{self.source_hash}.png").write_bytes(self.png)
        self.registry = {"assets": [{"id": self.asset_id, "platform": "Amiga",
            "archive": {"name": "8X8D2.DAA"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash},
            "description": {"text": "source text remains", "status": "unknown",
                "evidence": [{"kind": "decoded-pixels", "reference": "archive#10/tile/0", "note": "pinned"}]}}]}
        self.sources = {self.asset_id: {"pixelHash": self.pixel_hash}}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "An 8×8 pixel tile with brown pixels on a dark field.",
            "evidence": [{"kind": "visual-review",
                "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}

    def tearDown(self):
        self.temp.cleanup()

    def apply_dataset(self, registry=None, dataset=None):
        return importer.apply_visual_descriptions(self.registry if registry is None else registry,
            self.sources, self.dataset if dataset is None else dataset, self.image_store, self.dataset_path)

    def test_description_is_applied_idempotently_and_keeps_unknown_semantics(self):
        merged, summary = self.apply_dataset()
        asset = merged["assets"][0]
        self.assertEqual(summary, {"rows": 1, "uniquePixelHashes": 1})
        self.assertEqual(asset["description"]["text"], "source text remains")
        self.assertEqual(asset["description"]["status"], "unknown")
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        again, _ = self.apply_dataset(merged)
        self.assertEqual(again, merged)

    def test_dataset_must_cover_exact_roster_and_reject_wrong_archive(self):
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.apply_dataset(dataset={"version": 1, "assets": []})
        self.registry["assets"][0]["archive"]["name"] = "8X8D1.DAA"
        with self.assertRaisesRegex(ValueError, "does not target"):
            self.apply_dataset()

    def test_pixel_duplicates_must_reuse_identical_text(self):
        second_id = self.asset_id + "-other"
        self.sources[second_id] = {"pixelHash": self.pixel_hash}
        second = copy.deepcopy(self.dataset["assets"][0])
        second["assetId"] = second_id
        second["visualDescription"] = "Conflicting wording."
        self.registry["assets"].append({"id": second_id, "platform": "Amiga",
            "archive": {"name": "8X8D2.DAA"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash}, "description": {}})
        with self.assertRaisesRegex(ValueError, "duplicate has conflicting"):
            self.apply_dataset(dataset={"version": 1, "assets": self.dataset["assets"] + [second]})

    def test_exact_hash_addressed_preview_path_and_bytes_are_mandatory(self):
        changed = copy.deepcopy(self.dataset)
        changed["assets"][0]["evidence"][0]["reference"] = "images/other.png"
        with self.assertRaisesRegex(ValueError, "exact source PNG"):
            self.apply_dataset(dataset=changed)
        (self.image_store / f"{self.source_hash}.png").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            self.apply_dataset()

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


class Amiga8x8d2PackageReadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.archive = self.root / "8X8D2.DAA"
        self.archive.write_bytes(b"synthetic DAA")
        self.archive_hash = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.source_root = self.root / "source"
        self.package_root = self.root / "package"
        (self.package_root / "images").mkdir(parents=True)
        self.rgb = importer.daa_decode.EGA_PALETTE[0] * 64
        source = self.source_root / "amiga_non_picture_source/8X8D2_011/8X8D2_011_tile_00.png"
        source.parent.mkdir(parents=True)
        Image.new("RGB", (64, 64), importer.daa_decode.EGA_PALETTE[0]).save(source)
        self.source_png = source
        self.png_bytes = source.read_bytes()
        self.png_hash = hashlib.sha256(self.png_bytes).hexdigest()
        (self.package_root / "images" / f"{self.png_hash}.png").write_bytes(self.png_bytes)

    def tearDown(self):
        self.temp.cleanup()

    def decode(self):
        with mock.patch.object(importer, "ARCHIVE_SHA256", self.archive_hash), \
             mock.patch.object(importer, "EXPECTED_TOC", [11]), \
             mock.patch.object(importer, "TILES_PER_BLOCK", 1), \
             mock.patch.object(importer.daa_decode, "parse_container", return_value=("blocks", 0, [SimpleNamespace(block_id=11)])), \
             mock.patch.object(importer.daa_decode, "decompress_block", return_value=b"tile"), \
             mock.patch.object(importer.daa_decode, "parse_8x8d_header", return_value=(1, 4, 2, 16)), \
             mock.patch.object(importer.daa_decode, "decode_8x8d_tile", return_value=[[0] * 8 for _ in range(8)]):
            return importer.decode_archive(self.archive, self.source_root, self.package_root)

    def test_decode_archive_bounds_hash_named_package_image(self):
        self.assertEqual(len(self.decode()), 1)
        outside = self.root.parent / f"{self.root.name}-outside.png"
        outside.write_bytes(self.png_bytes)
        target = self.package_root / "images" / f"{self.png_hash}.png"
        original_resolve = Path.resolve
        def resolve_with_escape(path, *args, **kwargs):
            return outside if path.name == target.name and path.parent.name == "images" else original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_with_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.decode()
        finally:
            outside.unlink(missing_ok=True)
        escaped_images = self.root.parent / f"{self.root.name}-escaped-images"
        escaped_images.mkdir()
        redirected_image = escaped_images / target.name
        redirected_image.write_bytes(self.png_bytes)
        def resolve_images_escape(path, *args, **kwargs):
            return redirected_image if path.name == target.name and path.parent.name == "images" else original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_images_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.decode()
        finally:
            redirected_image.unlink(missing_ok=True)
            escaped_images.rmdir()

    def test_inventory_pairs_accept_relative_paths_and_reject_escapes(self):
        source = self.source_root / "amiga_non_picture_source/8X8D2_010/8X8D2_010_tile_00.png"
        source.parent.mkdir(parents=True)
        Image.new("RGB", (64, 64), (2, 3, 4)).save(source)
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        (self.package_root / "images" / f"{source_hash}.png").write_bytes(source.read_bytes())
        output = self.package_root / "out.png"
        output.write_bytes(b"restyle")
        alias = {"platform": "Amiga", "sourceArchive": "8X8D2.DAA", "sourceName": "8X8D2_010_tile_00.png",
                 "asset": 10, "tile": 0,
                 "sourceProvenance": "amiga_non_picture_source/8X8D2_010/8X8D2_010_tile_00.png"}
        pair = {"id": "fixture", "sourceSha256": source_hash,
                "outputSha256": hashlib.sha256(b"restyle").hexdigest(),
                "source": f"images/{source_hash}.png", "output": "out.png", "aliases": [alias]}
        records = {importer.source_id(10, 0): {"decoded": {"sha256": source_hash}}}
        inventory = {"assets": [pair]}
        _pairs, _sources, alias_count = importer.inventory_pairs(inventory, records, self.source_root, self.package_root)
        self.assertEqual(alias_count, 1)
        outside_source = self.root.parent / f"{self.root.name}-source.png"
        outside_output = self.root.parent / f"{self.root.name}-restyle.png"
        outside_source.write_bytes(source.read_bytes())
        outside_output.write_bytes(b"restyle")
        try:
            for side, path in (("source", f"../{outside_source.name}"), ("output", outside_output.as_posix())):
                changed = copy.deepcopy(inventory)
                changed["assets"][0][side] = path
                with self.subTest(side=side), self.assertRaisesRegex(ValueError, "clean relative file path"):
                    importer.inventory_pairs(changed, records, self.source_root, self.package_root)
        finally:
            outside_source.unlink(missing_ok=True)
            outside_output.unlink(missing_ok=True)
        missing = copy.deepcopy(inventory)
        missing["assets"][0]["output"] = "missing.png"
        with self.assertRaises(FileNotFoundError):
            importer.inventory_pairs(missing, records, self.source_root, self.package_root)
        directory = self.package_root / "directory"
        directory.mkdir()
        not_a_file = copy.deepcopy(inventory)
        not_a_file["assets"][0]["output"] = "directory"
        with self.assertRaises(FileNotFoundError):
            importer.inventory_pairs(not_a_file, records, self.source_root, self.package_root)
        mismatch = copy.deepcopy(inventory)
        mismatch["assets"][0]["outputSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "packaged output hash differs"):
            importer.inventory_pairs(mismatch, records, self.source_root, self.package_root)


if __name__ == "__main__":
    unittest.main()
