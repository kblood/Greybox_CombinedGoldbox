from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from graphics_asset_registry import validate  # noqa: E402
from import_cok_curated_restyle_gallery_refs import build_expected, reconcile, sha256  # noqa: E402


def asset(asset_id: str, image_hash: str) -> dict:
    block_id = int(asset_id.split("/block/")[1].split("/")[0])
    platform = "Amiga" if "/amiga/" in asset_id else "DOS-EGA"
    archive_name = "PIC1.DAA" if platform == "Amiga" else "PIC1.DAX"
    return {
        "id": asset_id,
        "game": "cok",
        "edition": "DOS",
        "platform": platform,
        "archive": {"name": archive_name, "path": archive_name, "sha256": "a" * 64},
        "locator": {"kind": "block-frame", "blockId": block_id, "frameIndex": 0, "tileIndex": None, "cellIndex": None},
        "decoded": {"path": f"images/{image_hash}.png", "sha256": image_hash, "width": 4, "height": 4},
        "identityStatus": "source-pinned",
        "description": {"text": "", "status": "unknown", "evidence": []},
        "gameConsumers": [{"status": "unknown", "use": "unknown", "evidence": []}],
        "animationGroupId": None,
    }


class CuratedGalleryReferenceImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "orig").mkdir()
        (self.root / "out").mkdir()
        self.source_unique = b"unique original"
        self.source_duplicate = b"duplicate original"
        self.source_unmatched = b"unmatched original"
        self.output_unique = b"unique output"
        self.output_duplicate = b"duplicate output"
        for stem, source, output in (
            ("unique", self.source_unique, self.output_unique),
            ("duplicate", self.source_duplicate, self.output_duplicate),
            ("unmatched", self.source_unmatched, b"unmatched output"),
        ):
            (self.root / "orig" / f"{stem}.png").write_bytes(source)
            (self.root / "out" / f"{stem}.png").write_bytes(output)
        self.manifest = {
            "items": [
                {"id": "scene_unique", "stem": "unique", "game": "cok", "description": "Visual prose", "prompt": "p1.txt", "input": "i1.png"},
                {"id": "scene_duplicate", "stem": "duplicate", "game": "cok", "description": "Repeated pixels"},
                {"id": "scene_unmatched", "stem": "unmatched", "game": "cok"},
                {"id": "other_game", "stem": "unique", "game": "dok"},
            ]
        }
        self.registry = {
            "registryVersion": 1,
            "assets": [
                asset("cok/dos/pic1/block/1/frame/0", sha256(self.source_unique)),
                asset("cok/dos/pic1/block/2/frame/0", sha256(self.source_duplicate)),
                asset("cok/amiga/pic1/block/2/frame/0", sha256(self.source_duplicate)),
            ],
            "animationGroups": [],
            "restyles": [],
            "crossVersionLinks": [],
        }
        self.manifest_hash = sha256(json.dumps(self.manifest, sort_keys=True).encode())

    def tearDown(self):
        self.temp.cleanup()

    def desired(self):
        return build_expected(
            self.registry,
            self.manifest,
            self.manifest_hash,
            self.root,
            "restyle/manifest.json",
        )

    def test_unique_ambiguous_and_unmatched_source_hashes(self):
        expected, counts = self.desired()
        self.assertEqual(counts, {"unique": 1, "ambiguous": 1, "unmatched": 1, "links": 3, "rows": 3})
        self.assertEqual(set(expected), {
            "cok/dos/pic1/block/1/frame/0",
            "cok/dos/pic1/block/2/frame/0",
            "cok/amiga/pic1/block/2/frame/0",
        })
        duplicate_refs = [ref for key in list(expected)[1:] for ref in expected[key]]
        self.assertEqual([ref["id"] for ref in duplicate_refs], ["scene_duplicate", "scene_duplicate"])
        updated, changes = reconcile(self.registry, expected)
        self.assertEqual(changes, {"added": 3, "unchanged": 0})
        self.assertEqual(updated["assets"][1]["galleryReferences"], updated["assets"][2]["galleryReferences"])
        imported = updated["assets"][0]["galleryReferences"][0]
        self.assertEqual(imported["sourceSha256"], self.registry["assets"][0]["decoded"]["sha256"])
        self.assertEqual(imported["outputSha256"], sha256(self.output_unique))
        self.assertEqual(imported["manifest"], "restyle/manifest.json")
        self.assertEqual(imported["promptFile"], "p1.txt")
        self.assertEqual(imported["inputFile"], "i1.png")
        self.assertEqual(imported["description"], "Visual prose")
        self.assertEqual(updated["assets"][0]["description"], self.registry["assets"][0]["description"])
        self.assertEqual(updated["assets"][0]["gameConsumers"], self.registry["assets"][0]["gameConsumers"])
        self.assertEqual(updated["restyles"], [])

    def test_second_import_is_idempotent(self):
        expected, _counts = self.desired()
        first, _changes = reconcile(self.registry, expected)
        second, counts = reconcile(first, expected)
        self.assertEqual(counts, {"added": 0, "unchanged": 3})
        self.assertEqual(second, first)

    def test_changed_output_pair_is_rejected_after_initial_import(self):
        expected, _counts = self.desired()
        imported, _changes = reconcile(self.registry, expected)
        (self.root / "out" / "unique.png").write_bytes(b"tampered output")
        changed_expected, _counts = self.desired()
        with self.assertRaisesRegex(ValueError, "hashes/metadata differ"):
            reconcile(imported, changed_expected)

    def test_changed_original_cannot_silently_drop_existing_link(self):
        expected, _counts = self.desired()
        imported, _changes = reconcile(self.registry, expected)
        (self.root / "orig" / "unique.png").write_bytes(b"tampered source")
        changed_expected, counts = self.desired()
        self.assertEqual(counts["unmatched"], 2)
        with self.assertRaisesRegex(ValueError, "stale curated gallery reference"):
            reconcile(imported, changed_expected)

    def test_validator_rejects_reference_source_hash_mismatch(self):
        expected, _counts = self.desired()
        updated, _changes = reconcile(self.registry, expected)
        updated["assets"][0]["galleryReferences"][0]["sourceSha256"] = "f" * 64
        errors, _warnings = validate(updated)
        self.assertTrue(any("sourceSha256 does not match" in error for error in errors))

    def test_validator_accepts_imported_references_without_promoting_semantics(self):
        expected, _counts = self.desired()
        updated, _changes = reconcile(self.registry, expected)
        errors, _warnings = validate(updated)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
