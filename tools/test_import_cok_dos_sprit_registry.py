"""Source and mutation checks for DOS CoK SPRIT identity import."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from import_cok_dos_sprit_registry import (  # noqa: E402
    ARCHIVES,
    INVENTORY_DEFAULT,
    PACKAGE_DEFAULT,
    REGISTRY_DEFAULT,
    SOURCE_DEFAULT,
    apply_visual_descriptions,
    canonical_asset_id,
    decode_archives,
    match_inventory,
    merge_registry,
)


class DosSpritIdentityTests(unittest.TestCase):
    def test_duplicate_block_ids_have_distinct_entry_qualified_ids(self):
        duplicate_ids = {14}
        first = canonical_asset_id("SPRIT2", 14, 5, 0, duplicate_ids)
        second = canonical_asset_id("SPRIT2", 14, 12, 0, duplicate_ids)
        self.assertNotEqual(first, second)
        self.assertIn("/block/14/entry/5/frame/0", first)
        self.assertIn("/block/14/entry/12/frame/0", second)

    def test_unique_block_ids_keep_existing_canonical_spelling(self):
        self.assertEqual(
            canonical_asset_id("SPRIT1", 1, None, 2, set()),
            "cok/dos-ega/dos-install/sprit1.dax/block/1/frame/2",
        )

    @unittest.skipUnless(
        all((ROOT / "Champions of Krynn" / f"{family}.DAX").is_file() for family in ARCHIVES)
        and (SOURCE_DEFAULT / "dos_complex_render").is_dir()
        and (PACKAGE_DEFAULT / "manifest.json").is_file(),
        "CoK DOS archive and Restyle source fixtures are unavailable",
    )
    def test_all_archive_frames_and_gallery_aliases_match_exactly(self):
        records, _receipt = decode_archives(ROOT / "Champions of Krynn")
        inventory = json.loads(INVENTORY_DEFAULT.read_text(encoding="utf-8"))
        registry = json.loads(REGISTRY_DEFAULT.read_text(encoding="utf-8"))
        by_id, by_locator, pair_hashes = match_inventory(
            inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), records
        )
        self.assertEqual(len(records), 108)
        self.assertEqual(sum(len(pair_ids) for pair_ids in by_locator.values()), 108)
        self.assertEqual(len(pair_hashes), 99)
        self.assertIn(("SPRIT2", 14, 1, 0), by_locator)
        self.assertIn(("SPRIT2", 14, 2, 0), by_locator)
        self.assertIn(("SPRIT3", 35, 1, 0), by_locator)
        self.assertIn(("SPRIT3", 35, 2, 0), by_locator)

        merged = merge_registry(copy.deepcopy(registry), inventory, records, by_id, by_locator)
        rerun = merge_registry(copy.deepcopy(merged), inventory, records, by_id, by_locator)
        self.assertEqual(merged, rerun)
        self.assertEqual(len(merged["assets"]), len(registry["assets"]))
        self.assertEqual(len(merged["restyles"]), len(registry["restyles"]))
        self.assertEqual(len(merged["animationGroups"]), len(registry["animationGroups"]))
        self.assertEqual(len(merged["crossVersionLinks"]), len(registry["crossVersionLinks"]))
        self.assertEqual(len({asset["id"] for asset in merged["assets"]}), len(registry["assets"]))
        self.assertEqual(len({record["id"] for record in merged["restyles"]}), len(registry["restyles"]))
        merged_by_id = {asset["id"]: asset for asset in merged["assets"]}
        self.assertTrue(all(merged_by_id[source_id]["decoded"]["transparentIndex"] == 13 for source_id in records))

    @unittest.skipUnless(
        (SOURCE_DEFAULT / "dos_complex_render").is_dir()
        and (PACKAGE_DEFAULT / "manifest.json").is_file(),
        "CoK DOS Restyle source fixtures are unavailable",
    )
    def test_mutated_source_pin_is_rejected(self):
        records, _receipt = decode_archives(ROOT / "Champions of Krynn")
        inventory = json.loads(INVENTORY_DEFAULT.read_text(encoding="utf-8"))
        pair = next(item for item in inventory["assets"] if any(
            alias.get("platform") == "DOS" and alias.get("family") == "SPRIT1"
            for alias in item.get("aliases", [])
        ))
        pair["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "source PNG hash differs from inventory"):
            match_inventory(inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), records)


class DosSpritVisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "images"
        self.image_store.mkdir()
        self.asset_id = "cok/dos-ega/dos-install/sprit1.dax/block/1/frame/0"
        image = self.image_store / "source.png"
        Image.new("RGBA", (2, 2), (98, 31, 201, 255)).save(image)
        self.source_hash = hashlib.sha256(image.read_bytes()).hexdigest()
        self.pixel_hash = "d" * 64
        image.rename(self.image_store / f"{self.source_hash}.png")
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        self.records = {self.asset_id: {"sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash}}
        self.registry = {"assets": [{"id": self.asset_id, "platform": "DOS-EGA",
            "archive": {"name": "SPRIT1.DAX"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash,
                        "transparentIndex": 13},
            "description": {"text": "archive frame", "status": "unknown", "evidence": [
                {"kind": "decoded-pixels", "reference": "archive#1", "note": "decoded"}]}}]}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "Orange and blue compact sprite on transparent ground.",
            "evidence": [{"kind": "visual-review",
                "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}

    def tearDown(self):
        self.temp.cleanup()

    def apply_dataset(self, dataset=None):
        return apply_visual_descriptions(self.registry, self.records,
            self.dataset if dataset is None else dataset, self.image_store, self.dataset_path)

    def test_exact_appearance_description_is_applied_and_idempotent(self):
        merged, counts = self.apply_dataset()
        asset = merged["assets"][0]
        self.assertEqual(counts, {"rows": 1, "uniquePixelHashes": 1})
        self.assertEqual(asset["description"]["text"], "archive frame")
        self.assertEqual(asset["description"]["status"], "unknown")
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        rerun, _ = apply_visual_descriptions(merged, self.records, self.dataset, self.image_store, self.dataset_path)
        self.assertEqual(merged, rerun)

    def test_exact_source_file_and_coverage_are_required(self):
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.apply_dataset({"version": 1, "assets": []})
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash or text mismatch"):
            self.apply_dataset(dataset)
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["reference"] = f"elsewhere/{self.source_hash}.png"
        with self.assertRaisesRegex(ValueError, "limit claims"):
            self.apply_dataset(dataset)
        preview = self.image_store / f"{self.source_hash}.png"
        original = preview.read_bytes()
        preview.write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            self.apply_dataset()
        preview.write_bytes(original)


if __name__ == "__main__":
    unittest.main()
