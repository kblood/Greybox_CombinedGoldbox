"""Mutation controls for visual-only CoK DOS font glyph descriptions."""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_cok_dos_font_visual_descriptions as subject  # noqa: E402


def fixture():
    assets = []
    rows = []
    for index in range(subject.GLYPH_COUNT):
        asset_id = f"{subject.GLYPH_ID_PREFIX}{index}"
        content_hash = f"{index + 1:064x}"
        pixel_hash = f"{index + 1000:064x}"
        if index == 1:
            pixel_hash = f"{1000:064x}"  # a duplicate of glyph 0
        assets.append({"id": asset_id, "locator": {"kind": "glyph", "blockId": 201,
            "entryIndex": 0, "glyphIndex": index}, "sourceContentSha256": content_hash,
            "sourcePixelSha256": pixel_hash, "description": {"text": f"Stored glyph {index}.",
            "status": "partial", "evidence": []}})
        rows.append({"assetId": asset_id, "glyphIndex": index, "sourceContentSha256": content_hash,
            "pixelSha256": pixel_hash, "visualDescription": "An identical visible pattern." if index < 2
                else f"Visible pattern {index}."})
    registry = {"registryVersion": 1, "assets": assets, "animationGroups": [], "restyles": [],
        "crossVersionLinks": []}
    dataset = {"version": 1, "schema": "cok-dos-font-glyph-visual-descriptions-v1",
        "sourceArchiveSha256": subject.glyphs.ARCHIVE_SHA,
        "sourceBlockSha256": subject.glyphs.RAW_SHA,
        "sourceAtlasSha256": "e" * 64, "assets": rows}
    return registry, dataset


class FontVisualDescriptionTests(unittest.TestCase):
    def test_all_exact_rows_apply_idempotently_and_keep_claim_scope_visual_only(self):
        registry, dataset = fixture()
        merged, counts = subject.apply_dataset(registry, dataset,
            Path("docs/engine/research/cok-dos-font-glyph-visual-descriptions-v1.json"))
        self.assertEqual(counts, {"rows": 177, "uniquePixelGroups": 176})
        first = merged["assets"][0]
        self.assertEqual(first["description"]["visualDescription"], "An identical visible pattern.")
        note = first["description"]["evidence"][-1]["note"]
        self.assertIn("not inferred", note)
        repeated, _ = subject.apply_dataset(merged, dataset,
            Path("docs/engine/research/cok-dos-font-glyph-visual-descriptions-v1.json"))
        self.assertEqual(merged, repeated)

    def test_incomplete_or_duplicate_indices_are_rejected(self):
        registry, dataset = fixture()
        missing = copy.deepcopy(dataset)
        missing["assets"].pop()
        with self.assertRaisesRegex(ValueError, "exactly 177"):
            subject.validate_rows(registry, missing)
        duplicate = copy.deepcopy(dataset)
        duplicate["assets"][-1]["glyphIndex"] = 0
        with self.assertRaisesRegex(ValueError, "duplicate glyph index"):
            subject.validate_rows(registry, duplicate)

    def test_wrong_source_hash_or_pixel_duplicate_wording_is_rejected(self):
        registry, dataset = fixture()
        wrong_hash = copy.deepcopy(dataset)
        wrong_hash["assets"][0]["sourceContentSha256"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "source-content hash differs"):
            subject.validate_rows(registry, wrong_hash)
        conflicting = copy.deepcopy(dataset)
        conflicting["assets"][1]["visualDescription"] = "A different pattern."
        with self.assertRaisesRegex(ValueError, "pixel-identical glyphs"):
            subject.validate_rows(registry, conflicting)


if __name__ == "__main__":
    unittest.main()
