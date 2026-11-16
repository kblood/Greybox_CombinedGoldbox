"""Archive-backed CoK Amiga CPIC identity and Restyle-link checks."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_asset_registry  # noqa: E402
import import_cok_amiga_cpic_registry as importer  # noqa: E402


FIXTURES_AVAILABLE = (
    all((importer.AMIGA_DEFAULT / spec["relative"]).is_file() for spec in importer.ARCHIVES.values())
    and importer.INVENTORY_DEFAULT.is_file()
    and importer.PACKAGE_DEFAULT.is_dir()
    and importer.RENDER_MANIFEST_DEFAULT.is_file()
)


@unittest.skipUnless(FIXTURES_AVAILABLE, "Amiga CPIC source archives and rendered inventory are unavailable")
class AmigaCpicRegistryImportTests(unittest.TestCase):
    def build(self):
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        renders = importer.render_rows(importer.RENDER_MANIFEST_DEFAULT)
        assets, pairs, pair_sources = importer._build_assets_and_pairs(
            importer.AMIGA_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT, inventory, renders)
        return registry, assets, pairs, pair_sources

    def test_full_archive_denominators_match_every_render_and_gallery_alias(self):
        registry, assets, pairs, pair_sources = self.build()
        self.assertEqual(len(assets), 126)
        self.assertEqual(len(pairs), 87)
        self.assertEqual(sum(len(ids) for ids in pair_sources.values()), 126)
        self.assertEqual(sum(len(ids) > 1 for ids in pair_sources.values()), 38)
        self.assertTrue(all(asset_id.startswith("cok/amiga/disk") for asset_id in assets))
        merged = importer.merge_registry(registry, assets, pairs, pair_sources)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])

    def test_pixel_identical_blocks_keep_distinct_ids_and_merge_is_idempotent(self):
        registry, assets, pairs, pair_sources = self.build()
        merged = importer.merge_registry(registry, assets, pairs, pair_sources)
        again = importer.merge_registry(merged, assets, pairs, pair_sources)
        self.assertEqual(merged, again)
        added = [link for link in merged["crossVersionLinks"]
                 if link.get("relation") == "pixel-identical"
                 and link.get("evidence", [{}])[0].get("reference") == "tools/import_cok_amiga_cpic_registry.py"]
        self.assertEqual(len(added), 42)
        linked_sources = {source for pair_id in pairs for source in pair_sources[pair_id]}
        self.assertEqual(len(linked_sources), 126)

    def test_alias_frame_mutation_is_rejected(self):
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        mutated = copy.deepcopy(inventory)
        pair = next(row for row in mutated["assets"] if any(
            alias.get("platform") == "Amiga" and str(alias.get("family", "")).upper() == "CPIC"
            for alias in row.get("aliases", [])))
        alias = next(alias for alias in pair["aliases"] if alias.get("platform") == "Amiga"
                     and str(alias.get("family", "")).upper() == "CPIC")
        alias["frame"] = 1
        with self.assertRaisesRegex(ValueError, "standard frame must use frame/0"):
            importer.inventory_pairs(mutated)

    def test_archive_hash_pin_mutation_fails_closed(self):
        registry, _assets, _pairs, _pair_sources = self.build()
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        renders = importer.render_rows(importer.RENDER_MANIFEST_DEFAULT)
        prior = importer.ARCHIVES["CPIC1.DAA"]["sha256"]
        importer.ARCHIVES["CPIC1.DAA"]["sha256"] = "0" * 64
        try:
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                importer._build_assets_and_pairs(importer.AMIGA_DEFAULT, importer.SOURCE_DEFAULT,
                                                 importer.PACKAGE_DEFAULT, inventory, renders)
        finally:
            importer.ARCHIVES["CPIC1.DAA"]["sha256"] = prior


class AmigaCpicVisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "images"
        self.image_store.mkdir()
        self.asset_id = "cok/amiga/disk2/cpic1.daa/block/1/frame/0"
        self.png_path = self.image_store / "source.png"
        Image.new("RGB", (2, 2), (12, 34, 56)).save(self.png_path)
        self.source_hash = hashlib.sha256(self.png_path.read_bytes()).hexdigest()
        self.pixel_hash = "a" * 64
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        self.registry = {"assets": [{"id": self.asset_id, "platform": "Amiga",
            "archive": {"name": "CPIC1.DAA"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash},
            "description": {"text": "source text remains", "status": "unknown", "evidence": [
                {"kind": "decoded-pixels", "reference": "archive#1", "note": "pinned"}]}}]}
        self.sources = {self.asset_id: {"pixelHash": self.pixel_hash}}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "Small orange and blue shape with a dark outline.",
            "evidence": [{"kind": "visual-review", "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}
        # Use the exact hash-addressed source-preview convention used by the importer.
        self.png_path.rename(self.image_store / f"{self.source_hash}.png")

    def tearDown(self):
        self.temp.cleanup()

    def apply_dataset(self, dataset=None):
        return importer.apply_visual_descriptions(self.registry, self.sources,
            self.dataset if dataset is None else dataset, self.image_store, self.dataset_path)

    def test_exact_source_description_is_applied_and_preserves_other_metadata(self):
        merged, summary = self.apply_dataset()
        asset = merged["assets"][0]
        self.assertEqual(summary, {"rows": 1, "uniquePixelHashes": 1})
        self.assertEqual(asset["description"]["text"], "source text remains")
        self.assertEqual(asset["description"]["status"], "unknown")
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        self.assertEqual(len(asset["description"]["evidence"]), 2)
        again, _ = importer.apply_visual_descriptions(merged, self.sources, self.dataset, self.image_store, self.dataset_path)
        self.assertEqual(merged, again)

    def test_incomplete_coverage_is_rejected(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"] = []
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.apply_dataset(dataset)

    def test_source_and_pixel_hash_mismatch_are_rejected(self):
        for field in ("sourceSha256", "pixelSha256"):
            dataset = copy.deepcopy(self.dataset)
            dataset["assets"][0][field] = "0" * 64
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "hash or text mismatch"):
                self.apply_dataset(dataset)

    def test_visual_review_claims_must_be_limited_and_exact_png_must_match(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["note"] = "This is a named monster."
        with self.assertRaisesRegex(ValueError, "limit claims"):
            self.apply_dataset(dataset)
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["reference"] = f"unrelated/{self.source_hash}.png"
        with self.assertRaisesRegex(ValueError, "limit claims"):
            self.apply_dataset(dataset)
        (self.image_store / f"{self.source_hash}.png").write_bytes(b"not the source")
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            self.apply_dataset()

    def test_exact_pixel_duplicates_cannot_have_conflicting_descriptions(self):
        second_id = "cok/amiga/disk3/cpic2.daa/block/1/frame/0"
        self.sources[second_id] = {"pixelHash": self.pixel_hash}
        second_asset = copy.deepcopy(self.registry["assets"][0])
        second_asset["id"] = second_id
        second_asset["archive"]["name"] = "CPIC2.DAA"
        self.registry["assets"].append(second_asset)
        dataset = copy.deepcopy(self.dataset)
        second_row = copy.deepcopy(dataset["assets"][0])
        second_row["assetId"] = second_id
        second_row["visualDescription"] = "A different visual description."
        dataset["assets"].append(second_row)
        with self.assertRaisesRegex(ValueError, "duplicate has conflicting"):
            self.apply_dataset(dataset)

    def test_exact_pixel_duplicates_cannot_have_conflicting_descriptions(self):
        second_id = "cok/amiga/disk3/cpic2.daa/block/1/frame/0"
        self.sources[second_id] = {"pixelHash": self.pixel_hash}
        second_asset = copy.deepcopy(self.registry["assets"][0])
        second_asset["id"] = second_id
        second_asset["archive"]["name"] = "CPIC2.DAA"
        self.registry["assets"].append(second_asset)
        dataset = copy.deepcopy(self.dataset)
        second_row = copy.deepcopy(dataset["assets"][0])
        second_row["assetId"] = second_id
        second_row["visualDescription"] = "A different visual description."
        dataset["assets"].append(second_row)
        with self.assertRaisesRegex(ValueError, "duplicate has conflicting"):
            self.apply_dataset(dataset)


class AmigaCpicPathContainmentTests(unittest.TestCase):
    def test_manifest_paths_must_resolve_inside_the_source_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "source"
            root.mkdir()
            inside = root / "render.png"
            inside.write_bytes(b"contained")
            outside = Path(directory) / "outside.png"
            outside.write_bytes(b"outside")

            self.assertEqual(importer.contained_file(root, "render.png", "render"), inside.resolve())
            self.assertEqual(importer.contained_file(root, inside.resolve(), "render", allow_absolute=True),
                             inside.resolve())
            with self.assertRaisesRegex(ValueError, "parent traversal"):
                importer.contained_file(root, "../outside.png", "render", allow_absolute=True)
            with self.assertRaisesRegex(ValueError, "escapes"):
                importer.contained_file(root, outside.resolve(), "render", allow_absolute=True)

    def test_resolved_symlink_targets_cannot_escape_source_or_package_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "source"
            root.mkdir()
            outside = Path(directory) / "outside.png"
            outside.write_bytes(b"outside")
            package = Path(directory) / "package"
            package.mkdir()
            file_link = root / "render.png"
            directory_link = package / "images"
            real_resolve = Path.resolve

            def resolve_link(path: Path, *args, **kwargs):
                if path == file_link:
                    return outside
                if path == directory_link:
                    return outside.parent
                return real_resolve(path, *args, **kwargs)

            with patch.object(Path, "resolve", resolve_link):
                with self.assertRaisesRegex(ValueError, "escapes"):
                    importer.contained_file(root, "render.png", "render")
                with self.assertRaisesRegex(ValueError, "escapes"):
                    importer.contained_directory(package, "images", "image store")


if __name__ == "__main__":
    unittest.main()
