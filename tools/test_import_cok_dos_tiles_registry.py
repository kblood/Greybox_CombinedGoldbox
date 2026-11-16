"""Source, hash, gallery-lineage and mutation checks for DOS CoK tile identity import."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_cok_dos_tiles_registry as importer  # noqa: E402
from import_cok_dos_tiles_registry import (  # noqa: E402
    ARCHIVES,
    COVERAGE_DEFAULT,
    DOS_DEFAULT,
    INVENTORY_DEFAULT,
    PACKAGE_DEFAULT,
    REGISTRY_DEFAULT,
    SOURCE_DEFAULT,
    VISUAL_DESCRIPTIONS_DEFAULT,
    VISUAL_DESCRIPTIONS_D23_DEFAULT,
    apply_visual_descriptions,
    decode_archives,
    make_restyle,
    match_inventory,
    merge_registry,
    source_id,
)


AVAILABLE = (
    COVERAGE_DEFAULT.is_file()
    and all((ROOT / DOS_DEFAULT / f"{family}.DAX").is_file() for family in ARCHIVES)
    and (INVENTORY_DEFAULT).is_file()
    and (PACKAGE_DEFAULT / "manifest.json").is_file()
    and SOURCE_DEFAULT.is_dir()
)


def expected_registry_overlap(registry, dataset_path):
    """Count exact dimension+pixel identities with a reviewed non-target source."""
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    target_ids = {row["assetId"] for row in dataset["assets"]}
    target_assets = {asset["id"]: asset for asset in registry["assets"] if asset["id"] in target_ids}
    target_keys = set()
    for asset in target_assets.values():
        decoded = asset.get("decoded") or {}
        if decoded.get("pixelSha256"):
            target_keys.add((decoded.get("width"), decoded.get("height"), decoded["pixelSha256"]))
    reviewed_other_keys = set()
    for asset in registry["assets"]:
        if asset["id"] in target_ids or not asset.get("description", {}).get("visualDescription"):
            continue
        decoded = asset.get("decoded") or {}
        if decoded.get("pixelSha256"):
            reviewed_other_keys.add((decoded.get("width"), decoded.get("height"), decoded["pixelSha256"]))
    return len(target_keys & reviewed_other_keys)


@unittest.skipUnless(AVAILABLE, "CoK tile archives and Restyle source fixtures are unavailable")
class DosTileIdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records, cls.decode_info = decode_archives(
            (ROOT / DOS_DEFAULT).resolve(), COVERAGE_DEFAULT.resolve(), SOURCE_DEFAULT.resolve()
        )
        cls.inventory = json.loads(INVENTORY_DEFAULT.read_text(encoding="utf-8"))
        cls.registry = json.loads(REGISTRY_DEFAULT.read_text(encoding="utf-8"))

    def test_archive_roster_and_all_coverage_tiles_are_exact(self):
        self.assertEqual(len(self.records), 1693)
        self.assertEqual(
            {family: details["tileCount"] for family, details in self.decode_info["archives"].items()},
            {"8X8D1": 433, "8X8D2": 630, "8X8D3": 630},
        )
        self.assertEqual(
            self.decode_info["coveragePixelHashFieldSemantics"],
            {"native-8x8-rgb": 1678, "upscaled-32x32-rgb": 15},
        )
        self.assertIn("/disk1/8x8d1.dax/block/11/tile/0", source_id("8X8D1", 11, 0))
        self.assertIn("/disk3/8x8d3.dax/block/172/tile/69", source_id("8X8D3", 172, 69))

    def test_exact_inventory_joins_preserve_distinct_tile_ids(self):
        _pairs, by_locator = match_inventory(
            self.inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), self.records,
            self.decode_info["coverageRows"],
        )
        self.assertEqual(len(by_locator), 1599)
        self.assertEqual(len(set(by_locator.values())), 1346)
        self.assertEqual(len(self.records) - len(by_locator), 94)
        unlinked = [record for record in self.records.values()
                    if (record["family"], record["blockId"], record["tileIndex"]) not in by_locator]
        self.assertEqual(len(unlinked), 94)
        self.assertTrue(all(len(record["restyleOutputSha256"]) == 64 for record in unlinked))
        self.assertEqual(sum(record["restyleSourcePath"] is not None for record in unlinked), 4)

        same_pixel = {}
        for (family, block_id, tile_index), pair_id in by_locator.items():
            record = self.records[source_id(family, block_id, tile_index)]
            same_pixel.setdefault(record["pixelSha256"], []).append((record["id"], pair_id))
        duplicated = next(group for group in same_pixel.values() if len(group) > 1)
        self.assertGreaterEqual(len({asset_id for asset_id, _ in duplicated}), 2)

    def test_alias_hash_mutation_is_rejected(self):
        mutated = copy.deepcopy(self.inventory)
        pair = next(item for item in mutated["assets"] if any(
            alias.get("ledgerKind") == "dos-tile-alias" for alias in item.get("aliases", [])
        ))
        pair["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "source hash differs from generated inventory"):
            match_inventory(
                mutated, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), self.records,
                self.decode_info["coverageRows"],
            )

    def test_inventory_boolean_alone_never_admits_a_new_restyle(self):
        item = next(item for item in self.inventory["assets"] if any(
            alias.get("ledgerKind") == "dos-tile-alias" for alias in item.get("aliases", [])
        ))
        item = copy.deepcopy(item)
        item["runtimeApproved"] = True
        item["runtimeApprovalEvidence"] = []
        result = make_restyle(item, [source_id("8X8D1", 11, 0)])
        self.assertEqual(result["reviewStatus"], "generated")

    def test_registry_merge_is_idempotent_and_keeps_gallery_sources(self):
        pairs, by_locator = match_inventory(
            self.inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), self.records,
            self.decode_info["coverageRows"],
        )
        merged = merge_registry(copy.deepcopy(self.registry), pairs, self.records, by_locator)
        rerun = merge_registry(copy.deepcopy(merged), pairs, self.records, by_locator)
        self.assertEqual(merged, rerun)
        self.assertEqual(len(merged["assets"]), len(self.registry["assets"]))
        self.assertEqual(len(merged["restyles"]), len(self.registry["restyles"]))
        self.assertEqual(len(merged["animationGroups"]), len(self.registry["animationGroups"]))
        self.assertEqual(len(merged["crossVersionLinks"]), len(self.registry["crossVersionLinks"]))
        assets = {asset["id"]: asset for asset in merged["assets"]}
        self.assertEqual(assets[source_id("8X8D1", 11, 0)]["locator"]["kind"], "tile")
        self.assertIsNone(assets[source_id("8X8D1", 11, 0)]["animationGroupId"])
        self.assertEqual(assets[source_id("8X8D1", 11, 0)]["decoded"]["width"], 8)
        self.assertTrue(any(
            restyle.get("sourceAssetIds") and source_id("8X8D1", 11, 0) in restyle["sourceAssetIds"]
            for restyle in merged["restyles"]
        ))

    def test_visual_descriptions_cover_all_tiles_and_whole_images_with_exact_evidence(self):
        pairs, by_locator = match_inventory(
            self.inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), self.records,
            self.decode_info["coverageRows"],
        )
        merged = merge_registry(copy.deepcopy(self.registry), pairs, self.records, by_locator)
        expected_overlap = expected_registry_overlap(merged, VISUAL_DESCRIPTIONS_DEFAULT)
        result = apply_visual_descriptions(merged, VISUAL_DESCRIPTIONS_DEFAULT, PACKAGE_DEFAULT)
        self.assertEqual({key: value for key, value in result.items()
                          if key != "registryOverlapPixelIdentities"},
                         {"assets": 441, "tileAssets": 433, "wholeAssets": 8,
                          "uniquePixelDescriptions": 403})
        self.assertEqual(result["registryOverlapPixelIdentities"], expected_overlap)
        targets = [asset for asset in merged["assets"]
                   if asset.get("platform") == "DOS-EGA"
                   and asset.get("archive", {}).get("name") == "8X8D1.DAX"
                   and asset.get("locator", {}).get("kind") in {"tile", "whole-image"}]
        self.assertEqual(len(targets), 441)
        self.assertTrue(all(asset["description"].get("visualDescription") for asset in targets))
        self.assertEqual(sum(asset["locator"]["kind"] == "whole-image" for asset in targets), 8)
        target_pixel_keys = {
            (asset["decoded"]["width"], asset["decoded"]["height"], asset["decoded"]["pixelSha256"])
            for asset in targets
        }
        wording_by_key = {}
        for asset in merged["assets"]:
            decoded = asset.get("decoded") or {}
            wording = asset.get("description", {}).get("visualDescription")
            key = (decoded.get("width"), decoded.get("height"), decoded.get("pixelSha256"))
            if key in target_pixel_keys and wording:
                wording_by_key.setdefault(key, set()).add(wording)
        self.assertTrue(all(len(wording_by_key.get(key, set())) == 1 for key in target_pixel_keys))
        after_first_application = copy.deepcopy(merged)
        repeated_result = apply_visual_descriptions(merged, VISUAL_DESCRIPTIONS_DEFAULT, PACKAGE_DEFAULT)
        self.assertEqual(repeated_result, result)
        self.assertEqual(merged, after_first_application)

    def test_visual_description_source_hash_mutation_is_rejected(self):
        import tempfile

        dataset = json.loads(VISUAL_DESCRIPTIONS_DEFAULT.read_text(encoding="utf-8"))
        dataset["assets"][0]["sourceSha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "visual-descriptions.json"
            path.write_text(json.dumps(dataset), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "source/pixel hashes differ"):
                apply_visual_descriptions(copy.deepcopy(self.registry), path, PACKAGE_DEFAULT)

    def test_visual_description_must_match_existing_cross_version_pixel_wording(self):
        import tempfile

        dataset = json.loads(VISUAL_DESCRIPTIONS_DEFAULT.read_text(encoding="utf-8"))
        dataset["assets"][0]["visualDescription"] = "Deliberately conflicting wording for this exact pixel pattern."
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "visual-descriptions.json"
            path.write_text(json.dumps(dataset), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "differs from the existing wording"):
                apply_visual_descriptions(copy.deepcopy(self.registry), path, PACKAGE_DEFAULT)

    def test_visual_description_registry_scan_ignores_unrelated_null_decoded_assets(self):
        registry = copy.deepcopy(self.registry)
        registry["assets"].append({
            "id": "cok/amiga/atlas/test/null-decoded-cell",
            "platform": "Amiga",
            "archive": {"name": "atlas-cells"},
            "decoded": None,
            "description": {"visualDescription": "Not an image source record."},
        })
        result = apply_visual_descriptions(registry, VISUAL_DESCRIPTIONS_DEFAULT, PACKAGE_DEFAULT)
        self.assertEqual(result["assets"], 441)

    def test_d23_visual_descriptions_cover_both_complete_archive_rosters_and_are_idempotent(self):
        pairs, by_locator = match_inventory(
            self.inventory, SOURCE_DEFAULT.resolve(), PACKAGE_DEFAULT.resolve(), self.records,
            self.decode_info["coverageRows"],
        )
        merged = merge_registry(copy.deepcopy(self.registry), pairs, self.records, by_locator)
        expected_overlap = expected_registry_overlap(merged, VISUAL_DESCRIPTIONS_D23_DEFAULT)
        apply_visual_descriptions(merged, VISUAL_DESCRIPTIONS_DEFAULT, PACKAGE_DEFAULT)
        result = apply_visual_descriptions(merged, VISUAL_DESCRIPTIONS_D23_DEFAULT, PACKAGE_DEFAULT)
        self.assertEqual({key: value for key, value in result.items()
                          if key != "registryOverlapPixelIdentities"},
                         {"assets": 1278, "tileAssets": 1260, "wholeAssets": 18,
                          "uniquePixelDescriptions": 1201})
        self.assertEqual(result["registryOverlapPixelIdentities"], expected_overlap)
        targets = [asset for asset in merged["assets"]
                   if asset.get("platform") == "DOS-EGA"
                   and asset.get("archive", {}).get("name", "").upper() in {"8X8D2.DAX", "8X8D3.DAX"}
                   and asset.get("locator", {}).get("kind") in {"tile", "whole-image"}]
        self.assertEqual(len(targets), 1278)
        self.assertEqual(sum(asset["archive"]["name"].upper() == "8X8D2.DAX" for asset in targets), 639)
        self.assertEqual(sum(asset["archive"]["name"].upper() == "8X8D3.DAX" for asset in targets), 639)
        self.assertEqual(sum(asset["locator"]["kind"] == "whole-image" for asset in targets), 18)
        dataset = json.loads(VISUAL_DESCRIPTIONS_D23_DEFAULT.read_text(encoding="utf-8"))
        self.assertEqual(sum(row["evidence"][0]["reference"].startswith("C:/")
                             for row in dataset["assets"]), 91)
        target_pixel_keys = {
            (asset["decoded"]["width"], asset["decoded"]["height"], asset["decoded"]["pixelSha256"])
            for asset in targets
        }
        wording_by_key = {}
        for asset in merged["assets"]:
            decoded = asset.get("decoded") or {}
            wording = asset.get("description", {}).get("visualDescription")
            key = (decoded.get("width"), decoded.get("height"), decoded.get("pixelSha256"))
            if key in target_pixel_keys and wording:
                wording_by_key.setdefault(key, set()).add(wording)
        self.assertTrue(all(len(wording_by_key.get(key, set())) == 1 for key in target_pixel_keys))
        after_first_application = copy.deepcopy(merged)
        repeated_result = apply_visual_descriptions(merged, VISUAL_DESCRIPTIONS_D23_DEFAULT, PACKAGE_DEFAULT)
        self.assertEqual(repeated_result, result)
        self.assertEqual(merged, after_first_application)

    def test_d23_visual_description_rejects_missing_roster_and_changed_evidence_path(self):
        import tempfile

        dataset = json.loads(VISUAL_DESCRIPTIONS_D23_DEFAULT.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "visual-descriptions.json"
            missing_row = copy.deepcopy(dataset)
            missing_row["assets"].pop()
            path.write_text(json.dumps(missing_row), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "ID set differs from the 1278 registry targets"):
                apply_visual_descriptions(copy.deepcopy(self.registry), path, PACKAGE_DEFAULT)

            bad_path = copy.deepcopy(dataset)
            bad_path["assets"][0]["evidence"][0]["reference"] = (
                "apps/web/dist-app-cok57/restyle/cok-generated/images/" + "0" * 64 + ".png"
            )
            path.write_text(json.dumps(bad_path), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "evidence reference differs from source hash"):
                apply_visual_descriptions(copy.deepcopy(self.registry), path, PACKAGE_DEFAULT)

    def test_d23_visual_description_rejects_conflicting_cross_version_wording(self):
        import tempfile

        dataset = json.loads(VISUAL_DESCRIPTIONS_D23_DEFAULT.read_text(encoding="utf-8"))
        row = None
        for item in dataset["assets"]:
            for asset in self.registry["assets"]:
                decoded = asset.get("decoded") or {}
                if (asset.get("description", {}).get("visualDescription")
                        and decoded.get("pixelSha256") == item["pixelSha256"]
                        and decoded.get("width") == 8 and decoded.get("height") == 8):
                    row = item
                    break
            if row is not None:
                break
        self.assertIsNotNone(row)
        row["visualDescription"] = "A deliberate cross-version description mismatch."
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "visual-descriptions.json"
            path.write_text(json.dumps(dataset), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "differs from the existing wording"):
                apply_visual_descriptions(copy.deepcopy(self.registry), path, PACKAGE_DEFAULT)



class DosTileVisualPackageContainmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.package_root = self.root / "package"
        self.images = self.package_root / "images"
        self.images.mkdir(parents=True)
        self.dataset_path = self.root / "visual.json"
        self.asset_id = "cok/dos-ega/disk1/8x8d1.dax/block/11/tile/0"
        self.image = Image.new("RGB", (1, 1), (49, 91, 127))
        self.image_path = self.images / "source.png"
        self.image.save(self.image_path)
        self.image_bytes = self.image_path.read_bytes()
        self.source_hash = hashlib.sha256(self.image_bytes).hexdigest()
        self.pixel_hash = hashlib.sha256(self.image.tobytes()).hexdigest()
        self.image_path.rename(self.images / f"{self.source_hash}.png")
        self.dataset = {"version": 1, "archiveFamilies": ["8X8D1.DAX"],
            "evidenceImagePathPattern": importer.VISUAL_PREVIEW_PREFIX + "{sourceSha256}.png",
            "assets": [{"assetId": self.asset_id, "sourceSha256": self.source_hash,
                "pixelSha256": self.pixel_hash,
                "visualDescription": "A single warm gray square.",
                "evidence": [{"kind": "visual-review",
                    "reference": importer.VISUAL_PREVIEW_PREFIX + self.source_hash + ".png",
                    "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}
        self.dataset_path.write_text(json.dumps(self.dataset), encoding="utf-8")
        self.registry = {"assets": [{"id": self.asset_id, "platform": "DOS-EGA",
            "archive": {"name": "8X8D1.DAX"},
            "locator": {"kind": "tile"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash,
                        "width": 1, "height": 1},
            "description": {"evidence": []}}]}

    def tearDown(self):
        self.temp.cleanup()

    def apply_dataset(self, registry=None):
        with mock.patch.dict(importer.VISUAL_DESCRIPTION_ROSTERS,
                             {"8X8D1.DAX": {"assets": 1, "tile": 1, "whole-image": 0}}, clear=True):
            return apply_visual_descriptions(registry or copy.deepcopy(self.registry),
                                             self.dataset_path, self.package_root)

    def test_valid_package_image_keeps_the_historical_reference_and_description(self):
        registry = copy.deepcopy(self.registry)
        result = self.apply_dataset(registry)
        self.assertEqual(result["assets"], 1)
        asset = registry["assets"][0]
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        self.assertEqual(asset["description"]["evidence"][-1]["reference"],
                         self.dataset["assets"][0]["evidence"][0]["reference"])
        # The dataset and native image stay untouched; only the returned registry is updated.
        self.assertTrue((self.images / f"{self.source_hash}.png").is_file())
        self.assertEqual(self.dataset["assets"][0]["evidence"][0]["reference"],
                         importer.VISUAL_PREVIEW_PREFIX + self.source_hash + ".png")

    def test_escaped_images_directory_is_rejected_before_outside_read(self):
        outside_dir = self.root.parent / f"{self.root.name}-outside-images"
        outside_dir.mkdir()
        outside_image = outside_dir / f"{self.source_hash}.png"
        outside_image.write_bytes(self.image_bytes)
        target_dir = self.images
        original_resolve = Path.resolve
        def resolve_escape(path, *args, **kwargs):
            return outside_dir if path == target_dir else original_resolve(path, *args, **kwargs)
        original_read_bytes = Path.read_bytes
        def reject_outside_read(path):
            if path == outside_image:
                raise AssertionError("outside image bytes were read")
            return original_read_bytes(path)
        try:
            with mock.patch.object(Path, "resolve", resolve_escape), \
                 mock.patch.object(Path, "read_bytes", reject_outside_read):
                with self.assertRaisesRegex(ValueError, "images directory escapes"):
                    self.apply_dataset()
        finally:
            outside_image.unlink(missing_ok=True)
            outside_dir.rmdir()

    def test_escaped_hash_named_image_is_rejected_even_when_outside_hash_matches(self):
        outside_image = self.root.parent / f"{self.root.name}-outside.png"
        outside_image.write_bytes(self.image_bytes)
        target_name = f"{self.source_hash}.png"
        original_resolve = Path.resolve
        def resolve_escape(path, *args, **kwargs):
            if path.name == target_name and path.parent == self.images:
                return outside_image
            return original_resolve(path, *args, **kwargs)
        original_read_bytes = Path.read_bytes
        def reject_outside_read(path):
            if path == outside_image:
                raise AssertionError("outside image bytes were read")
            return original_read_bytes(path)
        try:
            with mock.patch.object(Path, "resolve", resolve_escape), \
                 mock.patch.object(Path, "read_bytes", reject_outside_read):
                with self.assertRaisesRegex(ValueError, "image escapes"):
                    self.apply_dataset()
        finally:
            outside_image.unlink(missing_ok=True)

    def test_contained_hash_mismatch_is_still_rejected(self):
        image_path = self.images / f"{self.source_hash}.png"
        image_path.write_bytes(b"different image")
        with self.assertRaisesRegex(ValueError, "PNG SHA-256 differs"):
            self.apply_dataset()


if __name__ == "__main__":
    unittest.main()
