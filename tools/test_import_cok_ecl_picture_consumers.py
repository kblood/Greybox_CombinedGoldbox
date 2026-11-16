from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_cok_ecl_picture_consumers as importer


def minimal_registry(bindings: dict[str, dict]) -> dict:
    assets = []
    for asset_id, binding in bindings.items():
        witness = next(iter(next(iter(binding["evidenceByReceipt"].values()))))
        assets.append({
            "id": asset_id,
            "game": "cok",
            "platform": "DOS-EGA",
            "archive": {"name": witness["archive"], "sha256": witness["archiveSha256"] or "a" * 64},
            "locator": {"blockId": witness["blockId"], "frameIndex": witness["frameIndex"],
                        "entryIndex": witness["entryIndex"]},
            "decoded": {"pixelSha256": witness["pixelSha256"]},
            "gameConsumers": [{"status": "unknown", "use": "Other consumer sites remain unknown.", "evidence": []}],
        })
    return {"assets": assets}


class EclPictureConsumerImportTests(unittest.TestCase):
    def test_receipts_yield_only_the_exact_thirteen_source_ids(self) -> None:
        bindings = importer.collect_bindings()
        self.assertEqual(set(bindings), importer.EXPECTED_SOURCE_IDS)
        self.assertEqual(len(bindings), 13)
        self.assertTrue(all(binding["evidenceByReceipt"] for binding in bindings.values()))

    def test_bound_archive_hashes_and_toc_entries_match_local_sources(self) -> None:
        bindings = importer.collect_bindings()
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        assets = {asset["id"]: asset for asset in registry["assets"]}
        cache = {}
        for asset_id, binding in bindings.items():
            for witnesses in binding["evidenceByReceipt"].values():
                for witness in witnesses:
                    importer._verify_archive_locator(assets[asset_id], witness, cache)
        self.assertEqual(len(cache), 6, "the 13 IDs should resolve to the six exact CoK DAX archives")

    def test_wrong_receipt_toc_index_is_rejected_against_pinned_archive(self) -> None:
        asset_id = "cok/dos-ega/disk1/pic1.dax/block/15/frame/0"
        bindings = importer.collect_bindings()
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        asset = next(asset for asset in registry["assets"] if asset["id"] == asset_id)
        witness = copy.deepcopy(next(iter(next(iter(bindings[asset_id]["evidenceByReceipt"].values())))))
        self.assertEqual(witness["entryIndex"], 10)
        witness["entryIndex"] = 11
        with self.assertRaisesRegex(ValueError, "receipt TOC entry differs"):
            importer._verify_archive_locator(asset, witness, {})

    def test_static_and_conditional_evidence_stays_partial_and_preserves_old_records(self) -> None:
        bindings = importer.collect_bindings()
        registry = minimal_registry(bindings)
        before = copy.deepcopy(registry)
        merged, counts = importer.merge_consumers(registry, bindings)
        self.assertEqual(counts, {"boundSources": 13, "consumerRecordsAdded": 13, "consumerRecordsUpdated": 0})
        for asset in merged["assets"]:
            old = next(row for row in before["assets"] if row["id"] == asset["id"])
            self.assertEqual(asset["gameConsumers"][0], old["gameConsumers"][0])
            record = asset["gameConsumers"][-1]
            self.assertEqual(record["status"], "partial")
            self.assertTrue(record["use"].startswith(importer.OWNED_USE_PREFIX))
            note = " ".join(evidence["note"] for evidence in record["evidence"])
            self.assertIn("receipt SHA-256", note)
            self.assertIn("ECL archive SHA-256", note)
            self.assertIn("ECL block", note)
            self.assertIn("site(s)", note)
            self.assertIn("sha256", note)
            self.assertIn("does not establish", note)
        self.assertEqual(registry, before, "merge must not mutate source registry")

    def test_import_is_idempotent_and_updates_only_its_owned_records(self) -> None:
        bindings = importer.collect_bindings()
        registry = minimal_registry(bindings)
        once, _ = importer.merge_consumers(registry, bindings)
        twice, _ = importer.merge_consumers(once, bindings)
        self.assertEqual(twice, once)
        for asset in twice["assets"]:
            self.assertEqual(sum(row["use"].startswith(importer.OWNED_USE_PREFIX)
                                 for row in asset["gameConsumers"]), 1)

    def test_exact_source_locator_mismatch_is_rejected(self) -> None:
        bindings = importer.collect_bindings()
        registry = minimal_registry(bindings)
        registry["assets"][0]["archive"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "archive/block/frame/pixel pins disagree"):
            importer.merge_consumers(registry, bindings)

    def test_unresolved_dynamic_sites_are_excluded(self) -> None:
        spec = next(item for item in importer.RECEIPTS if item["schema"] == "cok-throtl-picture-joins-v1")
        receipt = {"sites": [
            {"offset": 42, "binding": {"status": "unresolved-dynamic", "sourceAssetId": None}},
            {"offset": 43, "binding": {"status": "conditional", "sourceAssetId": "cok/dos-ega/disk1/pic1.dax/block/57/frame/0"}},
        ], "sourceFrames": [
            {"sourceAssetId": "cok/dos-ega/disk1/pic1.dax/block/57/frame/0"},
        ]}
        rows = importer._site_bindings(receipt, spec, spec["path"])
        self.assertEqual([(row[1], row[2]) for row in rows], [
            ("cok/dos-ega/disk1/pic1.dax/block/57/frame/0", "conditional"),
        ])


if __name__ == "__main__":
    unittest.main()
