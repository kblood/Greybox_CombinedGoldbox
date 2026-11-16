"""Registry validator checks for DAX TOC entry disambiguation."""

from __future__ import annotations

import sys
import json
import copy
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from graphics_asset_registry import validate  # noqa: E402


class EntryIndexValidationTests(unittest.TestCase):
    def test_duplicate_block_frames_are_distinct_when_toc_entry_is_present(self):
        base = {
            "game": "cok", "edition": "DOS", "platform": "DOS-EGA",
            "archive": {"name": "SPRIT2.DAX", "path": "Champions of Krynn/SPRIT2.DAX", "sha256": "a" * 64},
            "locator": {"kind": "block-frame", "blockId": 14, "frameIndex": 0, "tileIndex": None, "cellIndex": None},
            "identityStatus": "source-pinned", "description": {"text": "", "status": "unknown", "evidence": []},
            "gameConsumers": [{"status": "unknown", "use": "unknown", "evidence": []}],
            "animationGroupId": None,
        }
        first = {**base, "id": "cok/dos-ega/dos-install/sprit2.dax/block/14/entry/5/frame/0",
                 "locator": {**base["locator"], "entryIndex": 5}}
        second = {**base, "id": "cok/dos-ega/dos-install/sprit2.dax/block/14/entry/12/frame/0",
                  "locator": {**base["locator"], "entryIndex": 12}}
        errors, _warnings = validate({"registryVersion": 1, "assets": [first, second],
                                      "animationGroups": [], "restyles": [], "crossVersionLinks": []})
        self.assertEqual(errors, [])

    def test_invalid_entry_index_is_rejected(self):
        asset = {
            "id": "cok/dos-ega/test/frame/0", "game": "cok", "edition": "DOS", "platform": "DOS-EGA",
            "archive": {"name": "X.DAX", "path": "X.DAX", "sha256": "a" * 64},
            "locator": {"kind": "block-frame", "blockId": 1, "entryIndex": -1,
                        "frameIndex": 0, "tileIndex": None, "cellIndex": None},
            "identityStatus": "source-pinned", "description": {"text": "", "status": "unknown", "evidence": []},
            "gameConsumers": [{"status": "unknown", "use": "unknown", "evidence": []}],
            "animationGroupId": None,
        }
        errors, _warnings = validate({"registryVersion": 1, "assets": [asset],
                                      "animationGroups": [], "restyles": [], "crossVersionLinks": []})
        self.assertTrue(any("locator.entryIndex" in error for error in errors))

    def test_font_glyph_locators_require_a_distinct_nonnegative_stored_index(self):
        base = {
            "game": "cok", "edition": "DOS install", "platform": "DOS-EGA",
            "archive": {"name": "8X8D1.DAX", "path": "Champions of Krynn/8X8D1.DAX", "sha256": "a" * 64},
            "locator": {"kind": "glyph", "blockId": 201, "entryIndex": 0, "frameIndex": None,
                        "tileIndex": None, "cellIndex": None, "glyphIndex": 176},
            "sourceContentSha256": "b" * 64, "sourcePixelSha256": "c" * 64,
            "identityStatus": "source-pinned", "description": {"text": "Stored glyph 176.", "status": "partial", "evidence": []},
            "gameConsumers": [{"status": "unknown", "use": "unknown", "evidence": []}],
            "animationGroupId": None,
        }
        good = {**base, "id": "cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/176"}
        errors, _warnings = validate({"registryVersion": 1, "assets": [good],
                                      "animationGroups": [], "restyles": [], "crossVersionLinks": []})
        self.assertEqual(errors, [])

        missing_index = copy.deepcopy(good)
        del missing_index["locator"]["glyphIndex"]
        errors, _warnings = validate({"registryVersion": 1, "assets": [missing_index],
                                      "animationGroups": [], "restyles": [], "crossVersionLinks": []})
        self.assertTrue(errors, "glyph locators without their stored index must fail schema validation")

        duplicate = copy.deepcopy(good)
        duplicate["id"] = "cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/175"
        errors, _warnings = validate({"registryVersion": 1, "assets": [good, duplicate],
                                      "animationGroups": [], "restyles": [], "crossVersionLinks": []})
        self.assertTrue(any("source locator is assigned two IDs" in error for error in errors))

    def test_invalid_transparent_palette_index_is_rejected(self):
        asset = {
            "id": "cok/dos-ega/test/frame/0", "game": "cok", "edition": "DOS", "platform": "DOS-EGA",
            "archive": {"name": "X.DAX", "path": "X.DAX", "sha256": "a" * 64},
            "locator": {"kind": "block-frame", "blockId": 1, "frameIndex": 0, "tileIndex": None, "cellIndex": None},
            "decoded": {"path": "x.png", "sha256": "b" * 64, "width": 8, "height": 8, "transparentIndex": 256},
            "identityStatus": "source-pinned", "description": {"text": "", "status": "unknown", "evidence": []},
            "gameConsumers": [{"status": "unknown", "use": "unknown", "evidence": []}],
            "animationGroupId": None,
        }
        errors, _warnings = validate({"registryVersion": 1, "assets": [asset],
                                      "animationGroups": [], "restyles": [], "crossVersionLinks": []})
        self.assertTrue(any("decoded.transparentIndex" in error for error in errors))


class VisualDescriptionValidationTests(unittest.TestCase):
    def base(self, description):
        return {"registryVersion": 1, "assets": [{
            "id": "cok/amiga/disk2/pic1.daa/block/57/frame/0", "game": "cok", "edition": "Amiga",
            "platform": "Amiga", "archive": {"name": "PIC1.DAA", "path": "PIC1.DAA", "sha256": "a" * 64},
            "locator": {"kind": "block-frame", "blockId": 57, "frameIndex": 0, "tileIndex": None, "cellIndex": None},
            "decoded": {"path": "images/x.png", "sha256": "b" * 64, "pixelSha256": "c" * 64, "width": 352, "height": 352},
            "identityStatus": "candidate", "description": description,
            "gameConsumers": [{"status": "unknown", "use": "unknown", "evidence": []}],
            "animationGroupId": None,
        }], "animationGroups": [], "restyles": [], "crossVersionLinks": []}

    def test_unknown_semantic_description_still_validates_visual_observation(self):
        asset = self.base({"text": "", "status": "unknown", "visualDescription": "Visible yellow and blue shapes.",
                           "evidence": [{"kind": "visual-review", "reference": "review.json#asset"}]})
        errors, warnings = validate(asset)
        self.assertEqual(errors, [])
        self.assertTrue(any("semantic description is unknown" in warning for warning in warnings))

    def test_unknown_semantic_description_rejects_empty_or_unreviewed_visual_text(self):
        empty = self.base({"text": "", "status": "unknown", "visualDescription": " ", "evidence": []})
        errors, _ = validate(empty)
        self.assertTrue(any("visualDescription must be a nonempty string" in error for error in errors))
        self.assertTrue(any("lacks visual-review evidence" in error for error in errors))

    def test_pixel_identical_sources_require_consistent_visual_wording(self):
        registry = self.base({"text": "", "status": "unknown", "visualDescription": "Blue and gold pixels.",
                              "evidence": [{"kind": "visual-review", "reference": "review.json#one"}]})
        second = dict(registry["assets"][0])
        second["id"] = "cok/dos-ega/disk1/pic1.dax/block/57/frame/0"
        second["platform"] = "DOS-EGA"
        second["edition"] = "DOS"
        second["archive"] = {"name": "PIC1.DAX", "path": "PIC1.DAX", "sha256": "d" * 64}
        second["description"] = {"text": "", "status": "unknown", "visualDescription": "A yellow and blue image.",
                                 "evidence": [{"kind": "visual-review", "reference": "review.json#two"}]}
        registry["assets"].append(second)
        errors, _warnings = validate(registry)
        self.assertTrue(any("visualDescription conflicts with pixel-identical source" in error for error in errors))

    def test_pixel_identical_sources_accept_shared_visual_wording(self):
        registry = self.base({"text": "", "status": "unknown", "visualDescription": "Blue and gold pixels.",
                              "evidence": [{"kind": "visual-review", "reference": "review.json#one"}]})
        second = dict(registry["assets"][0])
        second["id"] = "cok/dos-ega/disk1/pic1.dax/block/57/frame/0"
        second["platform"] = "DOS-EGA"
        second["edition"] = "DOS"
        second["archive"] = {"name": "PIC1.DAX", "path": "PIC1.DAX", "sha256": "d" * 64}
        second["description"] = dict(registry["assets"][0]["description"])
        second["description"]["evidence"] = [{"kind": "visual-review", "reference": "review.json#two"}]
        registry["assets"].append(second)
        errors, _warnings = validate(registry)
        self.assertFalse(any("visualDescription conflicts with pixel-identical" in error for error in errors))

    def test_visual_description_dataset_reference_is_checked_against_wording_and_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            relative = Path("docs/engine/research/cok-dos-pic123-visual-descriptions-v1.json")
            dataset_path = root / relative
            dataset_path.parent.mkdir(parents=True)
            registry = self.base({"text": "", "status": "unknown", "visualDescription": "Visible yellow and blue shapes.",
                                  "evidence": [{"kind": "visual-review", "reference": f"{relative.as_posix()}#cok/amiga/disk2/pic1.daa/block/57/frame/0"}]})
            asset = registry["assets"][0]
            dataset = {"version": 1, "assets": [{
                "assetId": asset["id"], "sourceSha256": asset["decoded"]["sha256"],
                "pixelSha256": asset["decoded"]["pixelSha256"],
                "visualDescription": asset["description"]["visualDescription"],
            }]}
            dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
            errors, _ = validate(registry, root)
            self.assertEqual(errors, [])

            dataset["assets"][0]["visualDescription"] = "Conflicting description."
            dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
            errors, _ = validate(registry, root)
            self.assertTrue(any("visual-description evidence wording differs" in error for error in errors))

            dataset["assets"][0]["visualDescription"] = asset["description"]["visualDescription"]
            dataset["assets"][0]["pixelSha256"] = "d" * 64
            dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
            errors, _ = validate(registry, root)
            self.assertTrue(any("pixelSha256 differs from registry decoded hash" in error for error in errors))

    def test_font_glyph_visual_description_checks_stored_and_decoded_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            relative = Path("docs/engine/research/cok-dos-font-glyph-visual-descriptions-v1.json")
            dataset_path = root / relative
            dataset_path.parent.mkdir(parents=True)
            asset_id = "cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/4"
            description = "Two pale diagonal strokes with a small central gap."
            asset = {
                "id": asset_id, "game": "cok", "edition": "DOS install", "platform": "DOS-EGA",
                "archive": {"name": "8X8D1.DAX", "path": "Champions of Krynn/8X8D1.DAX", "sha256": "a" * 64},
                "locator": {"kind": "glyph", "blockId": 201, "entryIndex": 0, "frameIndex": None,
                            "tileIndex": None, "cellIndex": None, "glyphIndex": 4},
                "sourceContentSha256": "b" * 64, "sourcePixelSha256": "c" * 64,
                "identityStatus": "source-pinned",
                "description": {"text": "Stored glyph 4.", "status": "partial", "visualDescription": description,
                                "evidence": [{"kind": "visual-review",
                                              "reference": f"{relative.as_posix()}#{asset_id}"}]},
                "gameConsumers": [{"status": "unknown", "use": "unknown", "evidence": []}],
                "animationGroupId": None,
            }
            dataset = {"version": 1, "assets": [{"assetId": asset_id, "sourceContentSha256": "b" * 64,
                "pixelSha256": "c" * 64, "visualDescription": description}]}
            registry = {"registryVersion": 1, "assets": [asset], "animationGroups": [],
                        "restyles": [], "crossVersionLinks": []}
            dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
            errors, _ = validate(registry, root)
            self.assertEqual(errors, [])

            dataset["assets"][0]["sourceContentSha256"] = "d" * 64
            dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
            errors, _ = validate(registry, root)
            self.assertTrue(any("sourceContentSha256 differs from registry glyph hash" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
