"""Focused tests for the source-only CoK player runtime coverage report."""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import cok_player_runtime_coverage as coverage  # noqa: E402


class PlayerRuntimeCoverageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = coverage.read_json(ROOT, coverage.CONTRACT_DEFAULT)
        cls.policy = coverage.read_json(ROOT, cls.contract["restyleAdmissionPolicy"]["path"])
        cls.report = coverage.build_report(ROOT, cls.contract)

    def component(self, appearance: str, variant: int, role: str):
        return next(row for row in self.report["components"]
                    if row["appearanceId"] == appearance
                    and row["variantIndex"] == variant and row["role"] == role)

    def test_body216_distinguishes_declaration_creator_binding_and_inventory_hold(self):
        row = self.component("cok-player-05-18-00-02", 1, "body")
        self.assertEqual(row["sourceIdentity"]["sourceAssetId"],
                         "cok/dos-ega/install/cbody.dax/block/216/frame/0")
        self.assertTrue(row["sourceIdentity"]["sourceAddressable"])
        self.assertTrue(row["sourceIdentity"]["registrySourceHashMatchesManifest"])
        self.assertTrue(row["manifestDeclaredPackageAdmission"]["declared"])
        self.assertEqual(row["packageIdentities"]["original"]["status"], "hash-match")
        self.assertEqual(row["packageIdentities"]["restyle"]["status"], "hash-match")
        self.assertEqual([binding["consumerId"] for binding in row["consumerBindings"]], ["creator-preview"])
        self.assertEqual(row["runtimeObservation"], "unverified")
        self.assertEqual(row["inventoryEvidence"]["assetId"], "asset-0914-5aed79625ff6")
        self.assertIs(row["inventoryEvidence"]["runtimeApproved"], False)
        self.assertEqual(row["inventoryEvidence"]["compositionReview"], "not-reviewed")
        self.assertEqual(row["inventoryEvidence"]["promptStatus"], "unknown")
        self.assertEqual(row["inventoryEvidence"]["promptReferenceCount"], 0)
        self.assertEqual(row["frameRestyleAdmission"], {
            "state": "held", "reason": "awaiting-prompt-and-composition-review",
        })
        self.assertEqual(row["issues"], [{
            "code": "consumer-scope-exceeds-inventory-approval-scope",
            "consumers": ["creator-preview"],
        }])

    def test_sheet_and_combat_bind_only_variant_zero(self):
        second = self.component("cok-player-05-18-00-02", 1, "body")
        first = self.component("cok-player-05-18-00-02", 0, "body")
        self.assertEqual([row["consumerId"] for row in second["consumerBindings"]], ["creator-preview"])
        self.assertEqual({row["consumerId"] for row in first["consumerBindings"]},
                         {"creator-preview", "character-sheet", "combat-party-icon"})
        self.assertEqual(first["frameRestyleAdmission"]["state"], "admitted")

    def test_inventory_lookup_requires_exact_source_and_output_pair(self):
        pair = {"sourceSha256": "a" * 64, "outputSha256": "b" * 64,
                "id": "asset-0001-0123456789ab", "runtimeApproved": False,
                "runtimeApprovalEvidence": [], "compositionReview": "not-reviewed", "promptReferences": []}
        inventory = {"assets": [pair]}
        evidence = coverage.inventory_pair_evidence(inventory, "a" * 64, "b" * 64)
        self.assertEqual(evidence["status"], "matched")
        self.assertIs(evidence["runtimeApproved"], False)
        self.assertEqual(coverage.inventory_pair_evidence(inventory, "a" * 64, "c" * 64)["status"], "unmatched")
        with self.assertRaisesRegex(ValueError, "duplicate generated-inventory pair"):
            coverage.inventory_pair_evidence({"assets": [pair, copy.deepcopy(pair)]}, "a" * 64, "b" * 64)

    def test_contract_file_hash_mutation_fails_closed(self):
        bad = copy.deepcopy(self.contract)
        bad["consumerSources"][2]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "consumer source differs"):
            coverage.verify_contract(ROOT, bad)
        bad_policy = copy.deepcopy(self.contract)
        bad_policy["restyleAdmissionPolicy"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "admission policy hash"):
            coverage.verify_contract(ROOT, bad_policy)

    def test_canonical_dependencies_are_pinned_without_presentation_bindings(self):
        dependencies = {
            "apps/web/src/ui/cok-player-canonical-bindings.mjs",
            "apps/web/src/ui/cokPlayerCanonicalBindings.json",
            "tools/cok-player-canonical-bindings.mjs",
            "apps/web/scripts/bundle-cok-player-appearance.mjs",
            "apps/web/test/cok-player-canonical-bindings.test.mjs",
        }
        rows = {row["path"]: row for row in self.contract["consumerSources"]}
        self.assertTrue(dependencies <= rows.keys())
        for path in sorted(dependencies):
            with self.subTest(path=path):
                self.assertEqual(rows[path]["variantIndexes"], [])
                bad = copy.deepcopy(self.contract)
                next(row for row in bad["consumerSources"] if row["path"] == path)["sha256"] = "0" * 64
                with self.assertRaisesRegex(ValueError, "consumer source differs"):
                    coverage.verify_contract(ROOT, bad)
        projection = coverage.read_json(ROOT, "apps/web/src/ui/cokPlayerCanonicalBindings.json")
        canonical = {(row["manifestId"], variant["index"], component["role"]): component["assetId"]
                     for row in projection["appearanceSets"] for variant in row["variants"]
                     for component in variant["components"]}
        reported = {(row["appearanceId"], row["variantIndex"], row["role"]): row["sourceIdentity"]["sourceAssetId"]
                    for row in self.report["components"]}
        self.assertEqual(reported, canonical)
        self.assertEqual(len(reported), 16)
        self.assertEqual(len(set(reported.values())), 12)

    def test_report_mutations_cannot_upgrade_evidence_or_hide_scope_conflict(self):
        bad_observed = copy.deepcopy(self.report)
        bad_observed["components"][0]["runtimeObservation"] = "observed"
        with self.assertRaisesRegex(ValueError, "cannot claim runtime observation"):
            coverage.validate_report(bad_observed, self.policy)

        bad_issue = copy.deepcopy(self.report)
        row = next(component for component in bad_issue["components"]
                   if component["appearanceId"] == "cok-player-05-18-00-02"
                   and component["variantIndex"] == 1 and component["role"] == "body")
        row["issues"] = []
        with self.assertRaisesRegex(ValueError, "needs a scope issue"):
            coverage.validate_report(bad_issue, self.policy)

        bad_approval = copy.deepcopy(self.report)
        row = next(component for component in bad_approval["components"]
                   if component["appearanceId"] == "cok-player-05-18-00-02"
                   and component["variantIndex"] == 1 and component["role"] == "body")
        row["inventoryEvidence"]["runtimeApproved"] = True
        row["issues"] = []
        with self.assertRaisesRegex(ValueError, "does not agree with its exact approval evidence"):
            coverage.validate_report(bad_approval, self.policy)

        bad_frame = copy.deepcopy(self.report)
        row = next(component for component in bad_frame["components"]
                   if component["appearanceId"] == "cok-player-05-18-00-02"
                   and component["variantIndex"] == 1 and component["role"] == "body")
        row["frameRestyleAdmission"]["state"] = "admitted"
        with self.assertRaisesRegex(ValueError, "differs from the pinned policy"):
            coverage.validate_report(bad_frame, self.policy)

    def test_shared_pixels_keep_per_appearance_package_paths(self):
        first_head = self.component("cok-player-05-18-00-02", 0, "head")
        second_head = self.component("cok-player-05-01-01-02", 0, "head")
        self.assertEqual(first_head["sourceIdentity"]["sourceSha256"], second_head["sourceIdentity"]["sourceSha256"])
        self.assertNotEqual(first_head["packageIdentities"]["restyle"]["packageId"],
                            second_head["packageIdentities"]["restyle"]["packageId"])
        self.assertEqual(self.report["counts"]["distinctPackageIdentities"], 24)

    def test_exact_runtime_package_roster_excludes_held_restyles(self):
        counts = self.report["counts"]
        audit = self.report["runtimePackageAudit"]
        self.assertEqual(counts["componentPackageSlotsMissing"], 24)
        self.assertEqual(counts["runtimePackagePlanPaths"], 20)
        self.assertEqual(counts["runtimePackageSourceFilesPresent"], 5)
        self.assertEqual(counts["runtimePackageSourceFilesMissing"], 15)
        self.assertEqual(counts["runtimePackageSourceFilesHashMismatch"], 0)
        self.assertEqual(counts["heldRestyleOutputPaths"], 4)
        self.assertEqual(counts["heldRestylePathsPresentInPublicSource"], 1)
        self.assertEqual(len(audit["plan"]), 20)
        self.assertEqual(len(audit["heldRestylePaths"]), 4)
        self.assertFalse(any("CBODY_216_restyle.png" in row["packageId"] for row in audit["plan"]))
        self.assertTrue(any("CBODY_216_restyle.png" in row["packageId"]
                            and row["sourceStatus"] == "present"
                            for row in audit["heldRestylePaths"]))

    def test_runtime_package_report_rejects_incomplete_or_miscounted_plan(self):
        bad = copy.deepcopy(self.report)
        bad["runtimePackageAudit"]["plan"].pop()
        with self.assertRaisesRegex(ValueError, "exact 20-path"):
            coverage.validate_report(bad, self.policy)
        bad = copy.deepcopy(self.report)
        bad["counts"]["runtimePackageSourceFilesMissing"] += 1
        with self.assertRaisesRegex(ValueError, "counts do not match"):
            coverage.validate_report(bad, self.policy)

    def test_current_report_obeys_independent_evidence_axes_and_counts(self):
        coverage.validate_report(self.report, self.policy)
        self.assertEqual(self.report["counts"]["appearanceSets"], 4)
        self.assertEqual(self.report["counts"]["acceptedTuples"], 6)
        self.assertEqual(self.report["counts"]["componentRows"], 16)
        self.assertEqual(self.report["counts"]["distinctPackageIdentities"], 24)
        self.assertEqual(self.report["counts"]["distinctSourceOutputPairs"], 10)
        self.assertEqual(self.report["counts"]["runtimeObservedComponents"], 0)
        self.assertEqual(self.report["counts"]["restyleAdmittedFrames"], 4)
        self.assertEqual(self.report["counts"]["restyleHeldFrames"], 4)
        self.assertEqual(self.report["counts"]["runtimePackagePlanPaths"], 20)
        self.assertTrue(all(row["manifestDeclaredPackageAdmission"]["declared"]
                            for row in self.report["components"]))
        self.assertTrue(all(row["runtimeObservation"] == "unverified" for row in self.report["components"]))


if __name__ == "__main__":
    unittest.main()
