import unittest

from tools.import_cok_dos_cpic_registry import (
    NATURAL_ROUTE_USE_PREFIX, identity_id, inventory_restyle, old_asset_index, registry_asset,
)


def source(asset_id, *, game="cok", platform="DOS-EGA", archive="CPIC1.DAX",
           kind="block-frame", block=14, frame=0):
    return {
        "id": asset_id,
        "game": game,
        "platform": platform,
        "archive": {"name": archive, "path": f"source/{archive}"},
        "locator": {"kind": kind, "blockId": block, "frameIndex": frame},
    }


class OldAssetIndexTests(unittest.TestCase):
    def test_only_cok_dos_dax_frame_zero_rows_are_migrated(self):
        dos_legacy = source("legacy/cpic1/14")
        dos_canonical = source(identity_id("CPIC1", 14))
        amiga = source("cok/amiga/disk2/cpic1.daa/block/14/frame/0", platform="Amiga", archive="CPIC1.DAA")
        other_game = source("other/cpic1/14", game="other")
        other_platform = source("cok/ega/cpic1/14", platform="CGA")
        other_archive = source("cok/dos/cpic1/14", archive="CPIC1.DAA")
        non_frame = source("cok/dos/cpic1/14/frame/1", frame=1)
        non_block_frame = source("cok/dos/cpic1/14/tile/0", kind="tile", frame=None)
        assets = [dos_legacy, dos_canonical, amiga, other_game, other_platform, other_archive, non_frame, non_block_frame]

        by_id, old_to_new = old_asset_index(assets)

        self.assertEqual(set(by_id), {asset["id"] for asset in assets})
        self.assertEqual(old_to_new, {
            dos_legacy["id"]: identity_id("CPIC1", 14),
            dos_canonical["id"]: identity_id("CPIC1", 14),
        })
        self.assertNotIn(amiga["id"], old_to_new)
        self.assertNotIn(other_game["id"], old_to_new)
        self.assertNotIn(other_platform["id"], old_to_new)
        self.assertNotIn(other_archive["id"], old_to_new)
        self.assertNotIn(non_frame["id"], old_to_new)
        self.assertNotIn(non_block_frame["id"], old_to_new)


class EvidenceMergeTests(unittest.TestCase):
    def test_cpic2_natural_route_remains_separate_on_rerun(self):
        for block in (1, 14, 2):
            with self.subTest(block=block):
                source_id = identity_id("CPIC2", block)
                record = {"id": source_id, "family": "CPIC2", "blockId": block, "sourceSha256": "a" * 64,
                          "pixelSha256": "c" * 64,
                          "archivePath": "Champions of Krynn/CPIC2.DAX", "archiveSha256": "b" * 64,
                          "width": 96, "height": 96, "nativeWidth": 24, "nativeHeight": 24}
                locations = ["ECL2.DAX#48 COMBAT@0x8498", "ECL2.DAX#49 COMBAT@0x9220"]
                usage = {(2, block): {"monsters": {1: "BAAZ"}, "locations": locations}}
                stale = {"kind": "source-code", "reference": "tools/gen1_ecl_encounter_scan.py",
                         "note": f"Decoded immediate LOAD_MONSTER candidate groups select picBlockId {block}; all require runtime seeding."}
                old = {"status": "partial", "use": f"Static ECL candidates select this picture with BAAZ (MON2CHA#1) "
                       f"at {'; '.join(locations)}. These candidates require runtime seeds and do not prove natural campaign reachability.",
                       "evidence": [stale]}
                route_evidence = {"kind": "research-doc", "reference": "fixture", "note": "Route only"}
                route = {"status": "partial", "use": NATURAL_ROUTE_USE_PREFIX + " Pinned roster",
                         "evidence": [route_evidence]}
                prior = {"id": source_id, "decoded": {"sha256": record["sourceSha256"]},
                         "description": {"evidence": [stale]},
                         "gameConsumers": [old, route] if block in (1, 14) else [old]}
                result = registry_asset(record, prior, usage, {}, {})
                self.assertEqual(registry_asset(record, result, usage, {}, {}), result)
                aggregate = result["gameConsumers"][0]
                self.assertIn("; ".join(locations), aggregate["use"])
                if block in (1, 14):
                    self.assertIn("other candidate sites remain unresolved", aggregate["use"])
                    self.assertEqual(result["gameConsumers"][1:], [route])
                    self.assertNotIn(stale, aggregate["evidence"])
                    self.assertNotIn(stale, result["description"]["evidence"])
                    self.assertNotIn(route_evidence, aggregate["evidence"])
                else:
                    self.assertEqual(result["gameConsumers"], [aggregate])
                    self.assertIn(stale, aggregate["evidence"])

    def test_registry_source_merge_deduplicates_prior_description_and_consumer_evidence(self):
        source_id = identity_id("CPIC1", 57)
        evidence = {"kind": "source-code", "reference": "fixture", "note": "retained once"}
        record = {"id": source_id, "family": "CPIC1", "blockId": 57, "sourceSha256": "a" * 64,
                  "pixelSha256": "c" * 64,
                  "archivePath": "Champions of Krynn/CPIC1.DAX", "archiveSha256": "b" * 64,
                  "width": 24, "height": 24, "nativeWidth": 24, "nativeHeight": 24}
        previous = {"id": source_id, "decoded": {"sha256": "a" * 64},
                    "description": {"text": "Previous mapped description", "status": "partial", "evidence": [evidence, evidence]},
                    "gameConsumers": [
                        {"status": "partial", "use": "Previous generic use", "evidence": [evidence, evidence]},
                        {"status": "verified", "use": "Specific retained route", "evidence": [evidence, evidence]},
                    ], "animationGroupId": None}

        usage = {(1, 57): {"monsters": {1: "BAAZ"}, "locations": ["ECL1.DAX#16 COMBAT@0x8612"]}}
        visual = {source_id: {"sourceSha256": "a" * 64, "visualDescription": "Red and blue pixel figure."}}
        merged = registry_asset(record, previous, usage, {}, visual)
        repeated = registry_asset(record, merged, usage, {}, visual)

        self.assertEqual(merged["description"]["evidence"].count(evidence), 1)
        self.assertEqual(merged["gameConsumers"][0]["evidence"].count(evidence), 1)
        self.assertTrue(any(row["kind"] == "visual-review" for row in merged["description"]["evidence"]))
        self.assertFalse(any(row["kind"] == "visual-review" for row in merged["gameConsumers"][0]["evidence"]))
        specific = next(consumer for consumer in merged["gameConsumers"] if consumer["use"] == "Specific retained route")
        self.assertEqual(specific["evidence"].count(evidence), 1)
        self.assertEqual(repeated, merged, "the DOS source import must be idempotent")

    def test_restyle_merge_deduplicates_evidence_across_prior_records(self):
        source_id = identity_id("CPIC1", 57)
        source_hash, output_hash = "a" * 64, "b" * 64
        evidence = {"kind": "source-code", "reference": "fixture", "note": "retained once"}
        item = {"id": "asset-0001-aaaaaaaaaaaa", "sourceSha256": source_hash, "outputSha256": output_hash,
                "aliases": [], "runtimeApproved": False, "compositionReview": "not-reviewed"}
        previous = {"id": "restyle/prior", "sourceAssetIds": [source_id],
                    "outputs": [{"sha256": output_hash}], "evidence": [evidence, evidence]}

        sources = {source_id: {"id": source_id, "decoded": {"sha256": source_hash}}}
        merged = inventory_restyle(item, [source_id], [previous], sources)
        repeated = inventory_restyle(item, [source_id], [merged], sources)

        self.assertEqual(merged["evidence"].count(evidence), 1)
        self.assertEqual(len(merged["evidence"]), len({str(sorted(row.items())) for row in merged["evidence"]}))
        self.assertEqual(repeated, merged, "the Restyle import must be idempotent")


class DecodedPixelHashTests(unittest.TestCase):
    def test_cpic_row_stores_native_rgb_pixel_hash_beside_png_hash(self):
        # Regression: the importer computed pixelSha256 for duplicate-pixel links but dropped it from the row.
        record = {"id": identity_id("CPIC2", 9), "family": "CPIC2", "blockId": 9,
                  "sourceSha256": "a" * 64, "pixelSha256": "d" * 64,
                  "archivePath": "Champions of Krynn/CPIC2.DAX", "archiveSha256": "b" * 64,
                  "width": 24, "height": 24, "nativeWidth": 24, "nativeHeight": 24}

        row = registry_asset(record, None, {}, {}, {})

        self.assertEqual(row["decoded"]["sha256"], "a" * 64)
        self.assertEqual(row["decoded"]["pixelSha256"], "d" * 64)


if __name__ == "__main__":
    unittest.main()
