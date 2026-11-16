import unittest

from tools.relink_cok_generated_inventory_refs import reconcile


SOURCE = "a" * 64
OUTPUT = "b" * 64
SNAPSHOT = "c" * 64


def registry_with_reference(old_id="asset-1-old"):
    return {"restyles": [{
        "id": "restyle/one",
        "externalReferences": [{
            "system": "cok-restyle-inventory-v1",
            "id": old_id,
            "reference": f"restyle/cok-generated/manifest.json#{old_id}",
        }],
        "evidence": [{
            "kind": "existing-manifest",
            "reference": "restyle/cok-generated/manifest.json#old",
            "note": f"Exact inventory pair SHA-256 {SOURCE} → {OUTPUT}; source pixels verified.",
        }],
    }]}


def inventory(asset_id="asset-2-new", source=SOURCE, output=OUTPUT):
    return {"assets": [{"id": asset_id, "sourceSha256": source, "outputSha256": output}]}


class RelinkTests(unittest.TestCase):
    def test_relinks_exact_pair_and_keeps_historical_id_in_evidence(self):
        data, counts = reconcile(registry_with_reference(), inventory(), SNAPSHOT)
        row = data["restyles"][0]
        self.assertEqual(row["externalReferences"][0]["id"], "asset-2-new")
        self.assertTrue(row["externalReferences"][0]["reference"].endswith("#asset-2-new"))
        self.assertIn("asset-1-old", row["evidence"][-1]["note"])
        self.assertIn(SNAPSHOT, row["evidence"][-1]["note"])
        self.assertEqual(counts, {"hashPinned": 1, "unchanged": 0, "relinked": 1, "missing": 0, "ambiguous": 0})

    def test_leaves_unmatched_pair_unchanged(self):
        data, counts = reconcile(registry_with_reference(), inventory(output="d" * 64), SNAPSHOT)
        self.assertEqual(data["restyles"][0]["externalReferences"][0]["id"], "asset-1-old")
        self.assertEqual(counts["missing"], 1)
        self.assertEqual(counts["relinked"], 0)

    def test_leaves_ambiguous_pair_unchanged(self):
        other = inventory("asset-3-also")
        data, counts = reconcile(registry_with_reference(), {
            "assets": [*inventory()["assets"], *other["assets"]]
        }, SNAPSHOT)
        self.assertEqual(data["restyles"][0]["externalReferences"][0]["id"], "asset-1-old")
        self.assertEqual(counts["ambiguous"], 1)

    def test_relink_is_idempotent(self):
        data, _ = reconcile(registry_with_reference(), inventory(), SNAPSHOT)
        again, counts = reconcile(data, inventory(), SNAPSHOT)
        self.assertEqual(again, data)
        self.assertEqual(counts["relinked"], 0)
        self.assertEqual(counts["unchanged"], 1)

    def test_uses_canonical_decoded_source_hash_and_gallery_output_hash(self):
        data = registry_with_reference()
        row = data["restyles"][0]
        row["evidence"] = []
        row["sourceAssetIds"] = ["cok/dos/bigpic1/block/1"]
        row["outputs"] = [{"path": "images/out.png", "sha256": OUTPUT, "role": "gallery-copy"}]
        data["assets"] = [{"id": row["sourceAssetIds"][0], "decoded": {"sha256": SOURCE}}]
        updated, counts = reconcile(data, inventory(), SNAPSHOT)
        self.assertEqual(updated["restyles"][0]["externalReferences"][0]["id"], "asset-2-new")
        self.assertEqual(counts["relinked"], 1)

    def test_does_not_match_a_different_decoded_source_hash(self):
        data = registry_with_reference()
        row = data["restyles"][0]
        row["evidence"] = []
        row["sourceAssetIds"] = ["cok/dos/bigpic1/block/1"]
        row["outputs"] = [{"path": "images/out.png", "sha256": OUTPUT, "role": "gallery-copy"}]
        data["assets"] = [{"id": row["sourceAssetIds"][0], "decoded": {"sha256": "d" * 64}}]
        updated, counts = reconcile(data, inventory(), SNAPSHOT)
        self.assertEqual(updated["restyles"][0]["externalReferences"][0]["id"], "asset-1-old")
        self.assertEqual(counts["missing"], 1)


if __name__ == "__main__":
    unittest.main()
