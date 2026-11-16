"""Synthetic and current-source acceptance tests for CoK alias bindings."""

from __future__ import annotations

import copy
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import cok_graphics_alias_bindings as bindings  # noqa: E402


def source_asset(asset_id: str, platform: str, archive: str, block: int | None,
                frame: int | None, tile: int | None, decoded: str) -> dict:
    return {"id": asset_id, "game": "cok", "platform": platform,
            "archive": {"name": archive},
            "locator": {"kind": "tile" if tile is not None else "block-frame",
                        "blockId": block, "frameIndex": frame, "tileIndex": tile},
            "decoded": {"sha256": decoded}}


class AliasBindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (cls.registry, cls.inventory, cls.curated, cls.runtime_comparison,
         cls.current_registry_sha256) = bindings.load_review_inputs(ROOT)
        cls.sidecar = bindings.read_json(ROOT / bindings.OUTPUT_PATH)

    def test_committed_alias_sidecar_accounts_for_all_pinned_rows(self):
        bindings.validate_sidecar(self.sidecar)
        self.assertEqual(self.sidecar["inputs"]["registry"]["sha256"], self.current_registry_sha256)
        self.assertEqual(self.sidecar["inputs"]["generatedInventory"]["sha256"], bindings.INVENTORY_SHA256)
        self.assertEqual(self.sidecar["inputs"]["curatedManifest"]["sha256"], bindings.CURATED_SHA256)
        counts = self.sidecar["counts"]
        self.assertEqual(counts["generatedAliasRows"], 6151)
        self.assertEqual(counts["generatedAliasRowsBound"], 5801)
        self.assertEqual(counts["generatedAliasRowsUnresolved"], 350)
        self.assertEqual(counts["generatedAliasRowsBound"] + counts["generatedAliasRowsUnresolved"], 6151)
        self.assertTrue(counts["generatedAliasRowsAccountedExactlyOnce"])
        self.assertEqual(len({row["rowId"] for row in self.sidecar["generatedAliasRows"]}), 6151)
        self.assertEqual(counts["externalComparisonAliasRows"], 1)
        self.assertEqual(counts["curatedCoKCards"], 27)
        self.assertEqual(counts["curatedSourceLinks"], 39)
        self.assertEqual(counts["curatedCardsExact"], 27)
        self.assertEqual(counts["curatedCardsUnresolved"], 0)
        expected_face_sources = {
            "face_cok_amiga_068": ["cok/amiga/disk2/head1.daa/block/68/frame/0",
                                   "cok/amiga/disk3/head2.daa/block/68/frame/0"],
            "face_cok_amiga_069": ["cok/amiga/disk2/head1.daa/block/69/frame/0",
                                   "cok/amiga/disk3/head2.daa/block/69/frame/0"],
            "face_cok_dos_068": ["cok/dos-ega/disk1/head2.dax/block/68/frame/0",
                                 "cok/dos-ega/disk1/head3.dax/block/68/frame/0"],
            "face_cok_dos_069": ["cok/dos-ega/disk1/head2.dax/block/69/frame/0",
                                 "cok/dos-ega/disk1/head3.dax/block/69/frame/0"],
        }
        cards = {row["cardId"]: row for row in self.sidecar["curatedCards"]}
        for card_id, source_ids in expected_face_sources.items():
            with self.subTest(card=card_id):
                self.assertEqual([row["sourceAssetId"] for row in cards[card_id]["sourceLinks"]], source_ids)
                self.assertEqual(cards[card_id]["status"], "exact")
        self.assertEqual(counts["inventoryPngFilesExpected"], 4840)
        # These are the recorded image-verification results in the committed sidecar.
        # Fresh verification requires external Restyle image directories and is tested by
        # the image-backed integration command, not by the portable source-only suite.
        self.assertEqual(counts["inventoryPngFilesVerified"], counts["inventoryPngFilesExpected"])
        self.assertEqual(counts["inventoryPngFilesMissing"], 0)
        self.assertEqual(counts["inventoryPngFilesHashMismatch"], 0)

    def test_description_and_consumer_metadata_additions_do_not_change_alias_relations(self):
        registry = copy.deepcopy(self.registry)
        asset = registry["assets"][0]
        asset["description"] = {"text": "reviewed visual note", "status": "partial", "evidence": []}
        asset["gameConsumers"] = [{"status": "partial", "evidence": []}]
        row = next(row for row in self.sidecar["generatedAliasRows"] if row["status"] == "bound")
        before, before_error = bindings.alias_locator_candidates(
            row["alias"], row["sourceSha256"], self.registry)
        after, after_error = bindings.alias_locator_candidates(
            row["alias"], row["sourceSha256"], registry)
        self.assertEqual((before_error, [item["id"] for item in before]),
                         (after_error, [item["id"] for item in after]))

    def test_registry_review_reports_source_output_locator_reference_and_candidate_deltas(self):
        cases = []
        for field, value in (("locator", {"kind": "block-frame", "blockId": 999}),
                             ("archive", {"name": "OTHER.DAX", "path": "OTHER.DAX", "sha256": "f" * 64}),
                             ("decodedSourceSha256", "f" * 64),
                             ("exactOutputSha256", "f" * 64),
                             ("matchingCardReferences", [])):
            mutated = copy.deepcopy(self.sidecar)
            binding = mutated["generatedAliasRows"][0]["bindings"][0]
            binding[field] = value
            cases.append((field, mutated))
        unresolved = next(row for row in self.sidecar["generatedAliasRows"]
                          if row["status"] == "unresolved" and row["candidateCount"] > 1)
        mutated_candidates = copy.deepcopy(self.sidecar)
        row = next(row for row in mutated_candidates["generatedAliasRows"] if row["rowId"] == unresolved["rowId"])
        row["sourceAssetCandidates"].append(copy.deepcopy(row["sourceAssetCandidates"][0]))
        row["candidateCount"] += 1
        row["sourceAssetIds"].append(row["sourceAssetIds"][0])
        cases.append(("candidate-multiplicity", mutated_candidates))
        for name, mutated in cases:
            with self.subTest(change=name):
                try:
                    report = bindings.build_registry_review_report(self.sidecar, mutated, "a" * 64,
                                                                   self.current_registry_sha256)
                except ValueError:
                    continue
                self.assertNotEqual(report["status"], "exactly-compatible")
                self.assertGreater(report["counts"]["semanticDifferences"], 0)

    def test_registry_review_rejects_reordered_aliases_and_curated_multisource_borrowing(self):
        reordered = copy.deepcopy(self.sidecar)
        reordered["generatedAliasRows"][0], reordered["generatedAliasRows"][1] = (
            reordered["generatedAliasRows"][1], reordered["generatedAliasRows"][0])
        report = bindings.build_registry_review_report(self.sidecar, reordered, "a" * 64,
                                                       self.current_registry_sha256)
        self.assertNotEqual(report["status"], "exactly-compatible")
        self.assertTrue(any(row["id"] == "<order-or-membership>" for row in report["differences"]))

        borrowed = copy.deepcopy(self.sidecar)
        card = next(card for card in borrowed["curatedCards"] if card["sourceIdCount"] > 1)
        card["sourceLinks"][0]["outputSha256"] = "f" * 64
        report = bindings.build_registry_review_report(self.sidecar, borrowed, "a" * 64,
                                                       self.current_registry_sha256)
        self.assertNotEqual(report["status"], "exactly-compatible")
        self.assertTrue(any(row["collection"] == "curatedCards" and row["id"] == card["cardId"]
                            for row in report["differences"]))

    def test_six_source_pic1_23_card_keeps_each_archive_qualified_locator(self):
        self.assertEqual(self.sidecar["counts"]["pic1_23SourceLinksPreserved"], 6)
        self.assertEqual(self.sidecar["counts"]["pic1_23DistinctSourceIds"], 6)
        card = next(row for row in self.sidecar["curatedCards"]
                    if row["sourceIdCount"] == 6 and any("/pic1.daa/block/23/" in link["sourceAssetId"]
                                                          for link in row["sourceLinks"]))
        ids = [link["sourceAssetId"] for link in card["sourceLinks"]]
        self.assertEqual(len(ids), 6)
        self.assertEqual(len(set(ids)), 6)

    def test_scrn1b_exact_mismatch_remains_unresolved_instead_of_becoming_scrn2(self):
        row = next(row for row in self.sidecar["generatedAliasRows"]
                   if row["alias"].get("sourceArchive", "").casefold() == "scrn1b.lbm")
        self.assertEqual(row["status"], "unresolved")
        self.assertEqual(row["reason"], "amiga-lbm-scrn1b-exact-source-hash-mismatch")
        self.assertEqual(row["sourceAssetIds"], [])

    def test_external_comparison_has_exact_source_output_card_binding(self):
        row = self.sidecar["externalComparisonAliases"][0]
        self.assertEqual(row["status"], "bound")
        self.assertEqual(len(row["bindings"]), 1)
        binding = row["bindings"][0]
        self.assertEqual(binding["sourceAssetId"], "cok/dos-ega/disk1/bigpic1.dax/block/121/frame/0")
        self.assertEqual(binding["archive"]["sha256"], "34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec")
        self.assertEqual(binding["restyleIdsForExactOutput"], ["restyle/cok-dos-bigpic1-121"])
        self.assertEqual(binding["matchingCardReferences"][0]["system"], "cok-runtime-comparison-v1")
        self.assertEqual(binding["locator"]["frameIndex"], 0)
        self.assertEqual(binding["locatorEvidence"]["manifestSha256"], bindings.RUNTIME_COMPARISON_SHA256)
        self.assertTrue(all(part["status"] == "hash-match" for part in row["exactImageFiles"].values()))

    def test_structured_family_and_hash_bind_exactly_and_ignore_provenance_text(self):
        source_hash = "a" * 64
        registry = {"assets": [
            source_asset("cok/dos-ega/disk1/cpic1.dax/block/136/frame/0", "DOS-EGA", "CPIC1.DAX", 136, 0, None, source_hash),
            source_asset("cok/dos-ega/disk2/cpic2.dax/block/136/frame/0", "DOS-EGA", "CPIC2.DAX", 136, 0, None, source_hash),
        ]}
        alias = {"platform": "DOS", "family": "CPIC1", "asset": 136, "frame": 0, "tile": None,
                 "sourceProvenance": "deliberately-misleading/CPIC2/CPIC2_136.png"}
        candidates, error = bindings.alias_locator_candidates(alias, source_hash, registry)
        self.assertIsNone(error)
        self.assertEqual([row["id"] for row in candidates], ["cok/dos-ega/disk1/cpic1.dax/block/136/frame/0"])

    def test_duplicate_archive_qualified_candidates_stay_unresolved_and_keep_both_ids(self):
        source_hash = "b" * 64
        registry = {"assets": [
            source_asset("cok/dos-e1/pic1.dax/block/23/frame/0/entry/4", "DOS-EGA", "PIC1.DAX", 23, 0, None, source_hash),
            source_asset("cok/dos-e1/pic1.dax/block/23/frame/0/entry/7", "DOS-EGA", "PIC1.DAX", 23, 0, None, source_hash),
        ]}
        alias = {"platform": "DOS", "family": "PIC1", "asset": 23, "frame": 0, "entry": 99,
                 "tile": None, "sourceProvenance": "dos/PIC1/PIC1_023_f0.png"}
        indexes = bindings.build_registry_indexes(registry)
        candidates, error = bindings.alias_locator_candidates(alias, source_hash, registry, indexes)
        self.assertIsNone(error)
        self.assertEqual([row["id"] for row in candidates], sorted(row["id"] for row in registry["assets"]))
        result = bindings.resolve_alias(alias, source_hash, "d" * 64, registry,
                                        {source_hash: "hash-match", "d" * 64: "hash-match"},
                                        "cok-restyle-inventory-v1", "asset-0001-0123456789ab", indexes)
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["reason"], "multiple-archive-qualified-source-locators-match")
        self.assertEqual(result["candidateCount"], 2)
        self.assertEqual(result["sourceAssetIds"], sorted(row["id"] for row in registry["assets"]))
        self.assertEqual(result["bindings"], [])

    def test_missing_frame_index_binds_only_through_unique_exact_hash_inside_dos_block(self):
        source_hash, output_hash = "9" * 64, "8" * 64
        asset = source_asset("cok/dos-e1/pic1.dax/block/23/frame/3", "DOS-EGA",
                             "PIC1.DAX", 23, 3, None, source_hash)
        asset["archive"]["sha256"] = "a" * 64
        restyle = {"id": "restyle/card-x", "sourceAssetIds": [asset["id"]],
                   "outputs": [{"sha256": output_hash}],
                   "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "card-x",
                                           "reference": "manifest#card-x"}]}
        registry = {"assets": [asset], "restyles": [restyle]}
        alias = {"platform": "DOS", "family": "PIC1", "asset": 23, "frame": None, "tile": None}
        result = bindings.resolve_alias(alias, source_hash, output_hash, registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "card-x")
        self.assertEqual(result["status"], "bound")
        self.assertEqual(result["sourceAssetIds"], [asset["id"]])
        self.assertEqual(result["bindings"][0]["locator"]["frameIndex"], 3)
        self.assertIn("exact decoded source SHA-256 uniquely identifies its frame index",
                      result["bindings"][0]["evidence"][0])

        # A caller's explicit but wrong frame stays a contradiction, not a hash fallback.
        wrong_frame = {**alias, "frame": 4}
        candidates, reason = bindings.alias_locator_candidates(wrong_frame, source_hash, registry)
        self.assertEqual(candidates, [])
        self.assertEqual(reason, "exact-source-hash-found-but-structured-locator-differs")

        # Amiga source rows do not use this DOS-specific omitted-frame fallback.
        amiga = source_asset("cok/amiga/disk1/pic1.daa/block/23/frame/3", "Amiga",
                             "PIC1.DAA", 23, 3, None, source_hash)
        amiga_alias = {**alias, "platform": "Amiga"}
        candidates, reason = bindings.alias_locator_candidates(amiga_alias, source_hash,
                                                                 {"assets": [amiga]})
        self.assertEqual(candidates, [])
        self.assertEqual(reason, "structured-frame-index-unavailable")

    def test_missing_frame_index_preserves_duplicate_frame_and_archive_candidates(self):
        source_hash, output_hash = "b" * 64, "c" * 64
        first = source_asset("cok/dos-e1/pic1.dax/block/23/frame/0", "DOS-EGA",
                             "PIC1.DAX", 23, 0, None, source_hash)
        second = source_asset("cok/dos-e1/pic1.dax/block/23/frame/3", "DOS-EGA",
                              "PIC1.DAX", 23, 3, None, source_hash)
        restyle = {"id": "restyle/one-frame", "sourceAssetIds": [first["id"]],
                   "outputs": [{"sha256": output_hash}],
                   "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "card-x",
                                           "reference": "manifest#card-x"}]}
        registry = {"assets": [first, second], "restyles": [restyle]}
        alias = {"platform": "DOS", "family": "PIC1", "asset": 23, "frame": None, "tile": None}
        result = bindings.resolve_alias(alias, source_hash, output_hash, registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "card-x")
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["reason"], "multiple-archive-qualified-source-locators-match")
        self.assertEqual(result["sourceAssetIds"], sorted([first["id"], second["id"]]))
        self.assertEqual(result["bindings"], [])

    def test_missing_block_index_binds_unique_dos_archive_hash_and_keeps_ambiguity(self):
        source_hash, output_hash = "d" * 64, "e" * 64
        asset = source_asset("cok/dos-e1/pic1.dax/block/42/frame/2", "DOS-EGA",
                             "PIC1.DAX", 42, 2, None, source_hash)
        asset["archive"]["sha256"] = "f" * 64
        restyle = {"id": "restyle/card-y", "sourceAssetIds": [asset["id"]],
                   "outputs": [{"sha256": output_hash}],
                   "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "card-y",
                                           "reference": "manifest#card-y"}]}
        registry = {"assets": [asset], "restyles": [restyle]}
        alias = {"platform": "DOS", "family": "PIC1", "asset": None,
                 "frame": None, "tile": None}
        result = bindings.resolve_alias(alias, source_hash, output_hash, registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "card-y")
        self.assertEqual(result["status"], "bound")
        self.assertEqual(result["sourceAssetIds"], [asset["id"]])
        self.assertEqual(result["bindings"][0]["locator"]["blockId"], 42)
        self.assertEqual(result["bindings"][0]["locator"]["frameIndex"], 2)
        self.assertIn("uniquely identifies its block/frame locator", result["bindings"][0]["evidence"][0])

        duplicate = copy.deepcopy(asset)
        duplicate["id"] = "cok/dos-e1/pic1.dax/block/43/frame/2"
        duplicate["locator"]["blockId"] = 43
        ambiguous = {"assets": [asset, duplicate], "restyles": [restyle]}
        result = bindings.resolve_alias(alias, source_hash, output_hash, ambiguous,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "card-y")
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["reason"], "multiple-archive-qualified-source-locators-match")
        self.assertEqual(result["sourceAssetIds"], sorted([asset["id"], duplicate["id"]]))
        self.assertEqual(result["bindings"], [])

        amiga = source_asset("cok/amiga/disk1/comspr.daa/block/42/frame/2", "Amiga",
                             "COMSPR.DAA", 42, 2, None, source_hash)
        amiga_alias = {**alias, "platform": "Amiga", "family": "Amiga COMSPR"}
        candidates, reason = bindings.alias_locator_candidates(amiga_alias, source_hash,
                                                                 {"assets": [amiga]})
        self.assertEqual(candidates, [amiga])
        self.assertIsNone(reason)

    def test_missing_block_amiga_comspr_requires_unique_hash_and_exact_card_pair(self):
        source_hash, output_hash = "5" * 64, "6" * 64
        first = source_asset("cok/amiga/disk1/comspr.daa/block/42/frame/0", "Amiga",
                             "COMSPR.DAA", 42, 0, None, source_hash)
        first["archive"]["sha256"] = "a" * 64
        restyle = {"id": "restyle/comspr-42", "sourceAssetIds": [first["id"]],
                   "outputs": [{"sha256": output_hash}],
                   "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "comspr-card",
                                           "reference": "manifest#comspr-card"}]}
        registry = {"assets": [first], "restyles": [restyle]}
        alias = {"platform": "Amiga", "family": "Amiga COMSPR", "asset": None,
                 "frame": None, "tile": None}
        result = bindings.resolve_alias(alias, source_hash, output_hash, registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "comspr-card")
        self.assertEqual(result["status"], "bound")
        self.assertEqual(result["sourceAssetIds"], [first["id"]])
        evidence = " ".join(result["bindings"][0]["evidence"])
        self.assertIn("local candidate/fixture COMSPR.DAA", evidence)
        self.assertIn("independent retail/WHDLoad provenance is not established", evidence)

        second = source_asset("cok/amiga/disk1/comspr.daa/block/153/frame/0", "Amiga",
                              "COMSPR.DAA", 153, 0, None, source_hash)
        second["archive"]["sha256"] = "a" * 64
        ambiguous_registry = {"assets": [first, second], "restyles": [restyle]}
        result = bindings.resolve_alias(alias, source_hash, output_hash, ambiguous_registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "comspr-card")
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["reason"], "multiple-archive-qualified-source-locators-match")
        self.assertEqual(set(result["sourceAssetIds"]), {first["id"], second["id"]})
        self.assertEqual(result["bindings"], [])

        wrong_family = {**alias, "family": "Amiga CPIC1"}
        candidates, reason = bindings.alias_locator_candidates(wrong_family, source_hash, registry)
        self.assertEqual(candidates, [])
        self.assertEqual(reason, "structured-archive-family-unavailable")

    def test_exact_card_reference_cannot_choose_between_duplicate_source_locators(self):
        source_hash, output_hash = "8" * 64, "7" * 64
        first = source_asset("cok/dos-e1/pic1.dax/block/23/frame/0", "DOS-EGA", "PIC1.DAX",
                             23, 0, None, source_hash)
        second = copy.deepcopy(first)
        second["id"] = "cok/dos-e1/pic1.dax/block/23/frame/0/duplicate"
        restyle = {"id": "restyle/one-duplicate", "sourceAssetIds": [first["id"]],
                   "outputs": [{"sha256": output_hash}],
                   "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "card-x",
                                           "reference": "manifest#card-x"}]}
        registry = {"assets": [first, second], "restyles": [restyle]}
        alias = {"platform": "DOS", "family": "PIC1", "asset": 23, "frame": 0, "tile": None}
        result = bindings.resolve_alias(alias, source_hash, output_hash, registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "card-x")
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["reason"], "multiple-archive-qualified-source-locators-match")
        self.assertEqual(result["sourceAssetIds"], sorted([first["id"], second["id"]]))
        self.assertEqual(result["bindings"], [])

    def test_entry_index_is_never_inferred_from_ledger_entry(self):
        source_hash, output_hash = "e" * 64, "f" * 64
        registry = {"assets": [source_asset("cok/dos-e1/pic1.dax/block/23/entry/4/frame/0", "DOS-EGA",
                                                "PIC1.DAX", 23, 0, None, source_hash)]}
        registry["assets"][0]["locator"]["entryIndex"] = 4
        alias = {"platform": "DOS", "family": "PIC1", "asset": 23, "frame": 0,
                 "entry": 4, "tile": None}
        result = bindings.resolve_alias(alias, source_hash, output_hash, registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "asset-0001-0123456789ab")
        candidates, candidate_reason = bindings.alias_locator_candidates(alias, source_hash, registry)
        self.assertEqual(candidate_reason, "canonical-entry-index-not-supported-by-alias")
        self.assertEqual([candidate["id"] for candidate in candidates], [registry["assets"][0]["id"]])
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["reason"], "no-exact-registry-restyle-output-and-card-reference")
        self.assertEqual(result["sourceAssetIds"], [registry["assets"][0]["id"]])
        self.assertEqual(result["bindings"], [])

    def test_null_entry_index_is_not_a_required_archive_ordinal(self):
        source_hash = "a" * 64
        asset = source_asset("cok/dos-e1/8x8d1.dax/block/11/tile/29", "DOS-EGA",
                             "8X8D1.DAX", 11, None, 29, source_hash)
        asset["locator"]["entryIndex"] = None
        registry = {"assets": [asset]}
        alias = {"platform": "DOS", "family": "8X8D1", "asset": 11,
                 "frame": None, "tile": 29, "entry": 430}

        candidates, reason = bindings.alias_locator_candidates(alias, source_hash, registry)
        self.assertIsNone(reason)
        self.assertEqual([row["id"] for row in candidates], [asset["id"]])

        # A concrete archive ordinal still requires its own structured alias field;
        # the unrelated ledger `entry` value must not satisfy the requirement.
        for ordinal in (0, 4):
            qualified = copy.deepcopy(asset)
            qualified["locator"]["entryIndex"] = ordinal
            qualified_registry = {"assets": [qualified]}
            candidates, reason = bindings.alias_locator_candidates(alias, source_hash, qualified_registry)
            self.assertEqual(candidates, [qualified])
            self.assertEqual(reason, "canonical-entry-index-not-supported-by-alias")

            explicit_alias = {**alias, "entryIndex": ordinal}
            candidates, reason = bindings.alias_locator_candidates(explicit_alias, source_hash, qualified_registry)
            self.assertIsNone(reason)
            self.assertEqual([row["id"] for row in candidates], [qualified["id"]])

    def test_exact_output_without_exact_registry_card_reference_is_not_a_binding(self):
        source_hash, output_hash = "1" * 64, "2" * 64
        asset = source_asset("cok/dos-e1/cpic1.dax/block/136/frame/0", "DOS-EGA", "CPIC1.DAX",
                             136, 0, None, source_hash)
        restyle = {"id": "restyle/wrong-card", "sourceAssetIds": [asset["id"]],
                   "outputs": [{"sha256": output_hash}],
                   "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "other-card",
                                           "reference": "restyle/cok-generated/manifest.json#other-card"}]}
        registry = {"assets": [asset], "restyles": [restyle]}
        alias = {"platform": "DOS", "family": "CPIC1", "asset": 136, "frame": 0, "tile": None}
        result = bindings.resolve_alias(alias, source_hash, output_hash, registry,
                                        {source_hash: "hash-match", output_hash: "hash-match"},
                                        "cok-restyle-inventory-v1", "asset-0001-0123456789ab")
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["reason"], "no-exact-registry-restyle-output-and-card-reference")
        self.assertEqual(result["sourceAssetCandidates"][0]["restyleIdsForExactOutput"], ["restyle/wrong-card"])
        self.assertEqual(result["sourceAssetCandidates"][0]["matchingCardReferences"], [])
        self.assertEqual(result["bindings"], [])

    def test_unknown_family_and_null_decoded_assets_do_not_bind_from_hash_alone(self):
        source_hash = "c" * 64
        registry = {"assets": [source_asset("cok/dos-e1/pic1.dax/block/23/frame/0", "DOS-EGA",
                                                "PIC1.DAX", 23, 0, None, source_hash)]}
        alias = {"platform": "DOS", "family": "unknown family", "asset": None,
                 "frame": 0, "tile": None}
        candidates, reason = bindings.alias_locator_candidates(alias, source_hash, registry)
        self.assertEqual(candidates, [])
        self.assertEqual(reason, "structured-archive-family-unavailable")

        null_registry = {"assets": [source_asset("cok/dos-e1/pic1.dax/block/23/frame/0", "DOS-EGA",
                                                  "PIC1.DAX", 23, 0, None, "")]}
        result = bindings.resolve_alias({"platform": "DOS", "family": "PIC1", "asset": 23,
                                         "frame": 0, "tile": None}, source_hash, "d" * 64,
                                        null_registry, {source_hash: "hash-match", "d" * 64: "hash-match"},
                                        "cok-restyle-inventory-v1", "asset-0001-0123456789ab")
        self.assertEqual(result["status"], "unresolved")
        self.assertEqual(result["sourceAssetIds"], [])

    def test_wrong_input_hash_pin_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "input.json"
            path.write_bytes(b"pinned input")
            with self.assertRaisesRegex(ValueError, "hash changed"):
                bindings._pin_file(Path(temp), "input.json", hashlib.sha256(b"wrong").hexdigest(), "fixture")

    def test_missing_local_inventory_pngs_remain_unavailable_during_compatibility_review(self):
        with tempfile.TemporaryDirectory() as temp:
            inventory = {"assets": [{"sourceSha256": "a" * 64, "outputSha256": "b" * 64}],
                         "counts": {"uniquePngBytes": 12}}
            statuses, summary = bindings._verify_inventory_images(inventory, Path(temp))
            self.assertEqual(statuses, {"a" * 64: "missing", "b" * 64: "missing"})
            self.assertEqual(summary["missingFiles"], 2)
            self.assertEqual(summary["verifiedUniquePngFiles"], 0)
            self.assertEqual(summary["hashMismatches"], 0)

    def test_alias_fingerprint_uses_occurrence_only_for_indistinguishable_rows(self):
        alias = {"ledger": "dos.json", "ledgerKind": "dos", "entry": 2, "platform": "DOS",
                 "family": "PIC1", "asset": 23, "frame": 0, "tile": None}
        rows = [{"rowId": f"generated/test/alias/{index}", "inventoryAssetId": "asset-test",
                 "sourceSha256": "a" * 64, "outputSha256": "b" * 64, "alias": copy.deepcopy(alias)}
                for index in range(2)]
        bindings.assign_alias_fingerprints(rows)
        self.assertEqual(rows[0]["aliasKey"], rows[1]["aliasKey"])
        self.assertEqual([row["aliasOccurrenceIndex"] for row in rows], [0, 1])
        self.assertNotEqual(rows[0]["aliasHash"], rows[1]["aliasHash"])
        single = {"rowId": "single", "inventoryAssetId": "asset-test", "sourceSha256": "a" * 64,
                  "outputSha256": "b" * 64, "alias": copy.deepcopy(alias)}
        bindings.assign_alias_fingerprints([single])
        self.assertIsNone(single["aliasOccurrenceIndex"])
        self.assertEqual(single["aliasKey"], single["aliasHash"])

    def test_entry_and_cell_indexes_are_part_of_alias_identity(self):
        base = {"ledger": "dos.json", "ledgerKind": "dos", "entry": 2, "platform": "DOS",
                "family": "PIC1", "asset": 23, "frame": 0, "tile": None}
        rows = []
        for field, value in (("entryIndex", 4), ("entryIndex", 7), ("cell", 4), ("cell", 7)):
            alias = copy.deepcopy(base)
            alias[field] = value
            rows.append({"rowId": str(len(rows)), "inventoryAssetId": "asset-test",
                         "sourceSha256": "a" * 64, "outputSha256": "b" * 64, "alias": alias})
        bindings.assign_alias_fingerprints(rows)
        self.assertEqual(len({row["aliasKey"] for row in rows}), 4)
        self.assertEqual(len({row["aliasHash"] for row in rows}), 4)

    def test_atomic_write_preserves_previous_output_when_replace_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "report.json"
            target.write_text("previous report\n", encoding="utf-8")
            with patch.object(bindings.os, "replace", side_effect=OSError("injected replace failure")):
                with self.assertRaisesRegex(OSError, "injected replace failure"):
                    bindings.atomic_write_json(target, {"new": True})
            self.assertEqual(target.read_text(encoding="utf-8"), "previous report\n")
            self.assertEqual(list(Path(temp).iterdir()), [target])

    def test_row_deletion_and_candidate_collapse_are_rejected(self):
        bad_missing = copy.deepcopy(self.sidecar)
        bad_missing["generatedAliasRows"].pop()
        with self.assertRaisesRegex(ValueError, "all 6,151"):
            bindings.validate_sidecar(bad_missing)
        bad_collapsed = copy.deepcopy(self.sidecar)
        unresolved = next(row for row in bad_collapsed["generatedAliasRows"]
                          if row["status"] == "unresolved" and row["candidateCount"] > 1)
        unresolved["sourceAssetIds"] = [unresolved["sourceAssetIds"][0]]
        with self.assertRaisesRegex(ValueError, "unresolved alias must preserve all canonical source candidates"):
            bindings.validate_sidecar(bad_collapsed)


if __name__ == "__main__":
    unittest.main()
