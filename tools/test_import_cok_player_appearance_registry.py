"""Tests for evidence-backed DOS player appearance-set relationships."""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_cok_player_appearance_registry as importer  # noqa: E402
from graphics_asset_registry import validate  # noqa: E402


class PlayerAppearanceRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = importer.load_json(importer.MANIFEST_DEFAULT)
        cls.registry = importer.load_json(importer.REGISTRY_DEFAULT)
        cls.sets = importer.derive_appearance_sets(cls.manifest, cls.registry, importer.MANIFEST_DEFAULT)

    def test_four_sets_cover_only_the_six_pinned_tuples_and_existing_components(self):
        self.assertEqual(len(self.sets), 4)
        self.assertEqual(sum(len(row["acceptedTuples"]) for row in self.sets), 6)
        self.assertEqual({selector["role"] for row in self.sets for selector in row["acceptedTuples"]},
                         {"primary", "storage-slot-alias"})
        self.assertTrue(all([variant["index"] for variant in row["variants"]] == [0, 1] for row in self.sets))
        by_manifest_id = {row["manifestId"]: row for row in self.sets}
        tuple_24 = by_manifest_id["cok-player-05-18-00-02"]
        self.assertEqual([next(component["assetId"] for component in variant["components"] if component["role"] == "body")
                          for variant in tuple_24["variants"]],
                         ["cok/dos-ega/install/cbody.dax/block/88/frame/0",
                          "cok/dos-ega/install/cbody.dax/block/216/frame/0"])
        self.assertEqual([next(component["assetId"] for component in variant["components"] if component["role"] == "head")
                          for variant in tuple_24["variants"]],
                         ["cok/dos-ega/install/chead.dax/block/69/frame/0",
                          "cok/dos-ega/install/chead.dax/block/197/frame/0"])
        merged = importer.merge_registry(self.registry, self.sets)
        errors, _warnings = validate(merged)
        self.assertEqual(errors, [])
        self.assertEqual(merged, self.registry)
        self.assertEqual(merged["assets"], self.registry["assets"])
        self.assertEqual(merged["restyles"], self.registry["restyles"])

    def test_unlisted_tuple_and_wrong_archive_pin_fail_closed(self):
        mutated = copy.deepcopy(self.manifest)
        mutated["appearances"][0]["sourceTuples"][0]["cBodySlot"] = 9
        with self.assertRaisesRegex(ValueError, "six explicitly approved"):
            importer.derive_appearance_sets(mutated, self.registry, importer.MANIFEST_DEFAULT)
        mutated = copy.deepcopy(self.manifest)
        mutated["sourceContainers"]["CHEAD.DAX"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "archive pin does not match"):
            importer.derive_appearance_sets(mutated, self.registry, importer.MANIFEST_DEFAULT)

    def test_unrelated_restyle_and_wrong_component_role_are_rejected_by_registry_validator(self):
        merged = importer.merge_registry(self.registry, self.sets)
        bad_restyle = copy.deepcopy(merged)
        bad_restyle["appearanceSets"][0]["variants"][0]["components"][0]["restyleIds"] = ["restyle/not-linked"]
        errors, _ = validate(bad_restyle)
        self.assertTrue(any("is not linked to component" in error for error in errors))
        bad_role = copy.deepcopy(merged)
        bad_role["appearanceSets"][0]["variants"][0]["components"][0]["role"] = "body"
        errors, _ = validate(bad_role)
        self.assertTrue(any("one head and one body component" in error for error in errors))

    def test_slot_alias_and_variant_mutations_are_rejected(self):
        merged = importer.merge_registry(self.registry, self.sets)
        bad_alias = copy.deepcopy(merged)
        selectors = bad_alias["appearanceSets"][0]["acceptedTuples"]
        selectors[1]["cBodySlot"] = selectors[0]["cBodySlot"]
        errors, _ = validate(bad_alias)
        self.assertTrue(any("storage-slot alias" in error for error in errors))
        bad_variant = copy.deepcopy(merged)
        bad_variant["appearanceSets"][0]["variants"][1]["index"] = 2
        errors, _ = validate(bad_variant)
        self.assertTrue(any("variants must contain exactly index 0 and 1" in error for error in errors))
        swapped_body = copy.deepcopy(merged)
        variant = swapped_body["appearanceSets"][0]["variants"][1]
        body = next(component for component in variant["components"] if component["role"] == "body")
        body["assetId"] = next(component["assetId"] for component in swapped_body["appearanceSets"][0]["variants"][0]["components"]
                                if component["role"] == "body")
        errors, _ = validate(swapped_body)
        self.assertTrue(any("is not linked to component" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
