from __future__ import annotations

import copy
import hashlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_cok_visual_description_dataset as importer  # noqa: E402


class GenericVisualDescriptionDatasetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "apps/web/dist-app-cok57/restyle/cok-generated/images"
        self.image_store.mkdir(parents=True)
        self.package_root = self.image_store.parent
        self.dataset_path = self.root / "dataset.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        pixels = bytes([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0])
        image = Image.frombytes("RGB", (2, 2), pixels).resize((8, 8), Image.Resampling.NEAREST)
        output = io.BytesIO()
        image.save(output, format="PNG")
        self.png = output.getvalue()
        self.source_hash = hashlib.sha256(self.png).hexdigest()
        self.pixel_hash = hashlib.sha256(pixels).hexdigest()
        (self.image_store / f"{self.source_hash}.png").write_bytes(self.png)
        self.asset_id = "cok/amiga/disk1/bigpic1.daa/block/1/frame/0"
        self.unresolved_id = "cok/amiga/disk1/lbm/chars.lbm/cell/1"
        self.registry = {"assets": [{"id": self.asset_id, "platform": "Amiga",
            "archive": {"name": "BIGPIC1.DAA"}, "locator": {"kind": "frame", "blockId": 1},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash, "width": 2, "height": 2},
            "description": {"text": "unknown", "status": "unknown", "evidence": []}},
            {"id": self.unresolved_id, "decoded": None, "description": {"text": "unknown", "status": "unknown", "evidence": []}}]}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "A small red, green, blue, and yellow pattern.",
            "evidence": [{"kind": "visual-review",
                "reference": f"{importer.EVIDENCE_PREFIX}{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}],
            "unresolvedAssets": [{"assetId": self.unresolved_id, "status": "unreviewed-missing-pixel-evidence",
                "reason": "No decoded per-cell image or pixel hash."}]}
        self.resolve_overrides = {}
        if self._testMethodName != "test_source_evidence_cannot_escape_approved_root":
            original_resolve = Path.resolve
            overrides = self.resolve_overrides

            def guarded_resolve(path, *args, **kwargs):
                normalized = str(path).replace("\\", "/").rstrip("/").casefold()
                if normalized == "c:/goldboximg" or normalized.startswith("c:/goldboximg/"):
                    raise AssertionError("temporary-only test attempted to resolve the fixed image corpus")
                if path in overrides:
                    return overrides[path]
                return original_resolve(path, *args, **kwargs)

            self._fixed_root_guard = mock.patch.object(Path, "resolve", guarded_resolve)
            self._fixed_root_guard.start()

    def tearDown(self):
        if hasattr(self, "_fixed_root_guard"):
            self._fixed_root_guard.stop()
        self.temp.cleanup()

    def apply_data(self, registry=None, dataset=None, package_root=None):
        return importer.apply_dataset(self.registry if registry is None else registry,
            self.dataset if dataset is None else dataset, self.dataset_path,
            self.package_root if package_root is None else package_root, self.root)

    def test_exact_source_description_and_unresolved_row_apply_idempotently(self):
        merged, counts = self.apply_data()
        self.assertEqual(counts, {"rows": 1, "uniquePixelGroups": 1, "unresolvedRows": 1, "verifiedPreviewFiles": 1})
        asset = next(row for row in merged["assets"] if row["id"] == self.asset_id)
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        repeated, _ = self.apply_data(merged)
        self.assertEqual(merged, repeated)

    def test_dataset_cannot_disagree_with_pixel_identical_registry_asset(self):
        registry = copy.deepcopy(self.registry)
        duplicate = copy.deepcopy(registry["assets"][0])
        duplicate["id"] = "cok/dos-ega/disk1/bigpic1.dax/block/1/frame/0"
        duplicate["platform"] = "DOS-EGA"
        duplicate["archive"] = {"name": "BIGPIC1.DAX", "path": "BIGPIC1.DAX", "sha256": "a" * 64}
        duplicate["description"]["visualDescription"] = "A conflicting description."
        registry["assets"].append(duplicate)
        with self.assertRaisesRegex(ValueError, "wording conflicts"):
            self.apply_data(registry)

    def test_preview_hash_mismatch_fails_closed(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "file/pixel hash"):
            self.apply_data(dataset=dataset)

    def test_unresolved_entry_with_decoded_image_is_rejected(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["unresolvedAssets"][0]["assetId"] = self.asset_id
        with self.assertRaisesRegex(ValueError, "resolved unresolved ID"):
            self.apply_data(dataset=dataset)

    def assert_resolved_package_escape_is_rejected(self, target_relative):
        evidence_image = self.root / importer.EVIDENCE_PREFIX / f"{self.source_hash}.png"
        target = self.root / target_relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(self.png)
        resolved_target = target.resolve(strict=True)
        self.assertEqual(hashlib.sha256(resolved_target.read_bytes()).hexdigest(), self.source_hash)
        self.resolve_overrides[evidence_image] = resolved_target
        with self.assertRaisesRegex(ValueError, "does not resolve inside the supplied image package"):
            self.apply_data()

    def test_matching_hash_package_image_leaf_escape_is_rejected(self):
        self.assert_resolved_package_escape_is_rejected(f"outside-leaf/{self.source_hash}.png")

    def test_matching_hash_images_directory_escape_is_rejected(self):
        self.assert_resolved_package_escape_is_rejected(f"outside/images/{self.source_hash}.png")

    def test_evidence_and_package_paths_must_match_inside_package_root(self):
        alternate_images = self.root / "images"
        alternate_images.mkdir()
        (alternate_images / f"{self.source_hash}.png").write_bytes(self.png)
        with self.assertRaisesRegex(ValueError, "does not resolve inside the supplied image package"):
            self.apply_data(package_root=self.root)

    def test_source_evidence_cannot_escape_approved_root(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["reference"] = "C:/GoldBoxImg/../outside.png"
        with self.assertRaisesRegex(ValueError, "escapes the approved"):
            self.apply_data(dataset=dataset)


if __name__ == "__main__":
    unittest.main()
