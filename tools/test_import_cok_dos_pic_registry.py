"""Source and mutation checks for DOS CoK PIC identity import."""

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
from import_cok_dos_pic_registry import (  # noqa: E402
    ARCHIVES,
    INVENTORY_DEFAULT,
    PACKAGE_DEFAULT,
    REGISTRY_DEFAULT,
    SOURCE_DEFAULT,
    apply_visual_descriptions,
    canonical_asset_id,
    decode_archives,
    make_asset,
    match_inventory,
    merge_registry,
    reconcile_superseded_visual_evidence,
)


FIXTURES_AVAILABLE = (
    all((ROOT / "Champions of Krynn" / f"{family}.DAX").is_file() for family in ARCHIVES)
    and (SOURCE_DEFAULT / "dos_complex_render").is_dir()
    and (PACKAGE_DEFAULT / "manifest.json").is_file()
)


class DosPicIdentityTests(unittest.TestCase):
    def test_source_rebuild_preserves_exact_gallery_links_and_prior_metadata(self):
        source = {
            "id": "cok/dos-ega/disk1/pic1.dax/block/15/frame/0",
            "family": "PIC1", "entryIndex": None, "blockId": 15, "frameIndex": 0,
            "archivePath": "Champions of Krynn/PIC1.DAX", "archiveSha256": "a" * 64,
            "sourceSha256": "b" * 64, "pixelSha256": "c" * 64, "width": 40, "height": 60,
        }
        gallery_refs = [{"system": "cok-curated-restyle-v1", "id": "face_cok_dos_pic1_015_f0",
            "manifest": "restyle/manifest.json", "manifestSha256": "d" * 64,
            "sourceSha256": "b" * 64, "outputSha256": "e" * 64,
            "label": "DOS face", "description": "reviewed label", "promptFile": "15_prompt.txt",
            "inputFile": "15_input.png"}]
        prior = {
            "archive": {"sha256": "a" * 64},
            "locator": {"kind": "block-frame", "blockId": 15, "entryIndex": None,
                "frameIndex": 0, "tileIndex": None, "cellIndex": None},
            "decoded": {"sha256": "b" * 64, "pixelSha256": "c" * 64},
            "description": {"text": "reviewed semantic note", "status": "partial",
                "visualDescription": "A face in profile.", "evidence": [
                    {"kind": "visual-review", "reference": "visual.json#face", "note": "reviewed"},
                    {"kind": "decoded-pixels", "reference": "old", "note": "stale decode wording"}]},
            "gameConsumers": [{"status": "partial", "use": "dialogue portrait", "evidence": []}],
            "identityStatus": "source-pinned",
            "galleryReferences": gallery_refs,
        }
        rebuilt = make_asset(source, None, prior)
        self.assertEqual(rebuilt["galleryReferences"], gallery_refs)
        self.assertEqual(rebuilt["description"]["text"], "reviewed semantic note")
        self.assertEqual(rebuilt["description"]["visualDescription"], "A face in profile.")
        self.assertEqual(rebuilt["description"]["status"], "partial")
        self.assertEqual([row["kind"] for row in rebuilt["description"]["evidence"]],
                         ["visual-review", "decoded-pixels"])
        self.assertEqual(rebuilt["gameConsumers"], prior["gameConsumers"])
        self.assertEqual(rebuilt["identityStatus"], prior["identityStatus"])

    def test_duplicate_pic1_block_id_requires_toc_entry_qualification(self):
        duplicate_ids = {34}
        first = canonical_asset_id("PIC1", 34, 3, 0, duplicate_ids)
        second = canonical_asset_id("PIC1", 34, 12, 0, duplicate_ids)
        self.assertNotEqual(first, second)
        self.assertTrue(first.endswith("/block/34/entry/3/frame/0"))
        self.assertTrue(second.endswith("/block/34/entry/12/frame/0"))
        with self.assertRaisesRegex(ValueError, "needs entry index"):
            canonical_asset_id("PIC1", 34, None, 0, duplicate_ids)

    def test_unique_pic_source_keeps_existing_id_spelling(self):
        self.assertEqual(
            canonical_asset_id("PIC1", 57, None, 0, set()),
            "cok/dos-ega/disk1/pic1.dax/block/57/frame/0",
        )

    @unittest.skipUnless(FIXTURES_AVAILABLE, "CoK DOS PIC archives or Restyle fixtures are unavailable")
    def test_all_archive_frames_gallery_links_and_merge_are_exact_and_idempotent(self):
        records, archive_receipts = decode_archives(ROOT / "Champions of Krynn")
        inventory = json.loads(INVENTORY_DEFAULT.read_text(encoding="utf-8"))
        registry = json.loads(REGISTRY_DEFAULT.read_text(encoding="utf-8"))
        by_id, pair_ids = match_inventory(inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), records)

        self.assertEqual(len(records), 125)
        self.assertEqual(sum(len(pair_set) for pair_set in pair_ids.values()), 125)
        self.assertEqual({family: receipt["frameCount"] for family, receipt in archive_receipts.items()},
                         {"PIC1": 31, "PIC2": 50, "PIC3": 44})
        self.assertEqual({family: receipt["entryCount"] for family, receipt in archive_receipts.items()},
                         {"PIC1": 18, "PIC2": 26, "PIC3": 24})
        self.assertEqual(records["cok/dos-ega/disk1/pic1.dax/block/34/entry/3/frame/0"]["entryOccurrence"], 1)
        self.assertEqual(records["cok/dos-ega/disk1/pic1.dax/block/34/entry/12/frame/0"]["entryOccurrence"], 2)

        merged = merge_registry(copy.deepcopy(registry), records, by_id, pair_ids)
        rerun = merge_registry(copy.deepcopy(merged), records, by_id, pair_ids)
        self.assertEqual(merged, rerun)
        self.assertEqual(len(merged["assets"]), len(registry["assets"]))
        self.assertEqual(len(merged["animationGroups"]), len(registry["animationGroups"]))
        self.assertEqual(len(merged["restyles"]), len(registry["restyles"]))
        self.assertEqual(len(merged["crossVersionLinks"]), len(registry["crossVersionLinks"]))
        merged_by_id = {asset["id"]: asset for asset in merged["assets"]}
        self.assertEqual(merged_by_id["cok/dos-ega/disk1/pic1.dax/block/57/frame/0"]["description"]["status"], "partial")
        self.assertIn("Throtl", merged_by_id["cok/dos-ega/disk1/pic1.dax/block/57/frame/0"]["gameConsumers"][0]["use"])
        ordinary_evidence = merged_by_id["cok/dos-ega/disk2/pic2.dax/block/6/frame/0"]["description"]["evidence"]
        ordinary_ref = next(item["reference"] for item in ordinary_evidence if item.get("kind") == "decoded-pixels")
        self.assertEqual(ordinary_ref, "Champions of Krynn/PIC2.DAX#6/frame/0")
        duplicate_refs = [next(item["reference"] for item in merged_by_id[source_id]["description"]["evidence"]
                               if item.get("kind") == "decoded-pixels")
                          for source_id in ("cok/dos-ega/disk1/pic1.dax/block/34/entry/3/frame/0",
                                            "cok/dos-ega/disk1/pic1.dax/block/34/entry/12/frame/0")]
        self.assertEqual(duplicate_refs, ["Champions of Krynn/PIC1.DAX#34/entry/3/frame/0",
                                          "Champions of Krynn/PIC1.DAX#34/entry/12/frame/0"])
        self.assertTrue(all(merged_by_id[source_id]["description"]["status"] == "unknown"
                            for source_id in records if source_id != "cok/dos-ega/disk1/pic1.dax/block/57/frame/0"))

    @unittest.skipUnless(FIXTURES_AVAILABLE, "CoK DOS PIC Restyle source fixtures are unavailable")
    def test_mutated_inventory_source_hash_is_rejected(self):
        records, _ = decode_archives(ROOT / "Champions of Krynn")
        inventory = json.loads(INVENTORY_DEFAULT.read_text(encoding="utf-8"))
        pair = next(item for item in inventory["assets"] if any(
            alias.get("platform") == "DOS" and alias.get("family") == "PIC1"
            for alias in item.get("aliases", [])
        ))
        pair["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "source PNG hash differs from inventory"):
            match_inventory(inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), records)

    @unittest.skipUnless(FIXTURES_AVAILABLE, "CoK DOS PIC Restyle source fixtures are unavailable")
    def test_missing_frame_alias_is_rejected(self):
        records, _ = decode_archives(ROOT / "Champions of Krynn")
        inventory = json.loads(INVENTORY_DEFAULT.read_text(encoding="utf-8"))
        removed = False
        for pair in inventory["assets"]:
            for index, alias in enumerate(pair.get("aliases", [])):
                if alias.get("platform") == "DOS" and alias.get("family") == "PIC3":
                    del pair["aliases"][index]
                    removed = True
                    break
            if removed:
                break
        self.assertTrue(removed)
        with self.assertRaisesRegex(ValueError, "do not cover exact decoded frame set"):
            match_inventory(inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), records)


class DosPicVisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "images"
        self.image_store.mkdir()
        self.asset_id = "cok/dos-ega/disk2/pic2.dax/block/1/frame/0"
        image_path = self.image_store / "source.png"
        Image.new("RGB", (2, 2), (76, 18, 220)).save(image_path)
        self.source_hash = hashlib.sha256(image_path.read_bytes()).hexdigest()
        self.pixel_hash = "b" * 64
        image_path.rename(self.image_store / f"{self.source_hash}.png")
        self.records = {self.asset_id: {"family": "PIC2", "sourceSha256": self.source_hash,
                                        "pixelSha256": self.pixel_hash}}
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        self.registry = {"assets": [{"id": self.asset_id, "platform": "DOS-EGA",
            "archive": {"name": "PIC2.DAX"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash},
            "description": {"text": "archive block", "status": "unknown", "evidence": [
                {"kind": "decoded-pixels", "reference": "archive#1", "note": "pinned"}]}}]}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "Blue and purple compact shape on black.",
            "evidence": [{"kind": "visual-review", "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}

    def tearDown(self):
        self.temp.cleanup()

    def apply_dataset(self, dataset=None):
        return apply_visual_descriptions(self.registry, self.records,
            self.dataset if dataset is None else dataset, self.image_store, self.dataset_path)

    def test_exact_description_is_applied_without_changing_other_metadata(self):
        merged, summary = self.apply_dataset()
        asset = merged["assets"][0]
        self.assertEqual(summary, {"rows": 1, "uniquePixelHashes": 1})
        self.assertEqual(asset["description"]["text"], "archive block")
        self.assertEqual(asset["description"]["status"], "unknown")
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        self.assertEqual(len(asset["description"]["evidence"]), 2)
        again, _ = apply_visual_descriptions(merged, self.records, self.dataset, self.image_store, self.dataset_path)
        self.assertEqual(merged, again)

    def test_canonical_import_removes_superseded_pic_sidecar_evidence(self):
        registry = copy.deepcopy(self.registry)
        evidence = registry["assets"][0]["description"]["evidence"]
        evidence.append({"kind": "visual-review",
                         "reference": f"docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json#{self.asset_id}",
                         "note": "Alternate wording for a pixel-identical row."})
        alternate_datasets = {"docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json": {
            "version": 1, "assets": [{"assetId": self.asset_id, "sourceSha256": self.source_hash,
                                       "pixelSha256": self.pixel_hash,
                                       "visualDescription": "Alternate wording for a pixel-identical row."}]}}
        merged, _ = apply_visual_descriptions(registry, self.records, self.dataset,
                                              self.image_store, self.dataset_path, alternate_datasets)
        result = merged["assets"][0]["description"]["evidence"]
        self.assertFalse(any(item.get("kind") == "visual-review"
                             and str(item.get("reference", "")).startswith(
                                 "docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json#")
                             for item in result))
        self.assertTrue(any(item.get("kind") == "decoded-pixels" for item in result))
        self.assertTrue(any(item.get("reference") == f"{self.dataset_path.as_posix()}#{self.asset_id}"
                            for item in result))

    def test_matching_alternate_wording_remains_valid_evidence(self):
        registry = copy.deepcopy(self.registry)
        alternate_ref = f"docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json#{self.asset_id}"
        registry["assets"][0]["description"]["evidence"].append(
            {"kind": "visual-review", "reference": alternate_ref, "note": "Same canonical wording."})
        alternate_datasets = {"docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json": {
            "version": 1, "assets": [{"assetId": self.asset_id, "sourceSha256": self.source_hash,
                                       "pixelSha256": self.pixel_hash,
                                       "visualDescription": self.dataset["assets"][0]["visualDescription"]}]}}
        merged, _ = apply_visual_descriptions(registry, self.records, self.dataset,
                                              self.image_store, self.dataset_path, alternate_datasets)
        self.assertTrue(any(item.get("reference") == alternate_ref
                            for item in merged["assets"][0]["description"]["evidence"]))

    def test_reconcile_removes_only_hash_matched_conflicting_alternate_refs(self):
        registry = copy.deepcopy(self.registry)
        evidence = registry["assets"][0]["description"]["evidence"]
        stale_ref = f"docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json#{self.asset_id}"
        evidence.extend([
            {"kind": "visual-review", "reference": stale_ref, "note": "Conflicting wording."},
            {"kind": "research-doc", "reference": stale_ref, "note": "Independent non-visual evidence."},
        ])
        canonical = copy.deepcopy(self.dataset)
        alternate = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "Conflicting wording."}]}
        reconciled, removed = reconcile_superseded_visual_evidence(
            registry, canonical, Path("docs/engine/research/cok-dos-pic123-visual-descriptions-v1.json"),
            {"docs/engine/research/cok-dos-pic23-visual-descriptions-v1.json": alternate})
        self.assertEqual(removed, [stale_ref])
        remaining = reconciled["assets"][0]["description"]["evidence"]
        self.assertEqual(sum(item.get("reference") == stale_ref for item in remaining), 1)
        self.assertEqual(sum(item.get("kind") == "decoded-pixels" for item in remaining), 1)

    def test_exact_frame_coverage_is_required(self):
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.apply_dataset({"version": 1, "assets": []})

    def test_hash_mismatch_is_rejected(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["pixelSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash or text mismatch"):
            self.apply_dataset(dataset)
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash or text mismatch"):
            self.apply_dataset(dataset)

    def test_exact_evidence_and_preview_hash_are_required(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["reference"] = f"elsewhere/{self.source_hash}.png"
        with self.assertRaisesRegex(ValueError, "limit claims"):
            self.apply_dataset(dataset)
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["note"] = "A named creature appears here."
        with self.assertRaisesRegex(ValueError, "limit claims"):
            self.apply_dataset(dataset)
        preview = self.image_store / f"{self.source_hash}.png"
        original = preview.read_bytes()
        preview.unlink()
        with self.assertRaisesRegex(ValueError, "missing or its SHA-256 differs"):
            self.apply_dataset()
        preview.write_bytes(b"corrupt preview")
        with self.assertRaisesRegex(ValueError, "missing or its SHA-256 differs"):
            self.apply_dataset()
        preview.write_bytes(original)

    def test_duplicate_pixels_cannot_have_conflicting_descriptions(self):
        second_id = self.asset_id.replace("pic2.dax/block/1", "pic3.dax/block/3")
        self.records[second_id] = {"family": "PIC3", "sourceSha256": self.source_hash,
                                   "pixelSha256": self.pixel_hash}
        second_asset = copy.deepcopy(self.registry["assets"][0])
        second_asset["id"] = second_id
        second_asset["archive"]["name"] = "PIC3.DAX"
        self.registry["assets"].append(second_asset)
        dataset = copy.deepcopy(self.dataset)
        row = copy.deepcopy(dataset["assets"][0])
        row["assetId"] = second_id
        row["visualDescription"] = "A different visible image."
        dataset["assets"].append(row)
        with self.assertRaisesRegex(ValueError, "duplicate has conflicting"):
            self.apply_dataset(dataset)


if __name__ == "__main__":
    unittest.main()
