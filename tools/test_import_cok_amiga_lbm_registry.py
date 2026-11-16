"""Archive-backed checks for CoK Amiga LBM identities and Restyle links."""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_asset_registry  # noqa: E402
import import_cok_amiga_lbm_registry as importer  # noqa: E402

FIXTURES_AVAILABLE = (
    importer.INVENTORY_DEFAULT.is_file()
    and importer.PACKAGE_DEFAULT.is_dir()
    and all((importer.AMIGA_DEFAULT / f"disk{disk}" / name).is_file()
            for disk, name in ((1, "gothic.lbm"), (1, "scrn2.lbm"), (1, "text1.lbm"), (1, "text2.lbm"),
                               (1, "charS.LBM"), (2, "charS.LBM"), (3, "charS.LBM"),
                               (1, "charT.LBM"), (2, "charT.LBM"), (3, "charT.LBM")))
)


@unittest.skipUnless(FIXTURES_AVAILABLE, "Amiga LBM/archive/render/gallery fixtures are unavailable")
class AmigaLbmRegistryTests(unittest.TestCase):
    def build(self):
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        visuals = importer.read_json(importer.VISUALS_DEFAULT)
        records = importer.decode_sources(importer.AMIGA_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        importer.apply_visuals(records, visuals)
        pairs, pair_sources, alias_count = importer.inventory_pairs(
            inventory, records, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        return inventory, records, pairs, pair_sources, alias_count

    def test_ten_archive_locators_six_exact_aliases_and_appearance_notes(self):
        _inventory, records, pairs, pair_sources, alias_count = self.build()
        self.assertEqual(len(records), 10)
        self.assertEqual(alias_count, 6)
        self.assertEqual(len(pairs), 6)
        self.assertTrue(all(record["description"]["visualDescription"] for record in records.values()))
        self.assertTrue(all(record["locator"]["kind"] == "whole-image" for record in records.values()))
        self.assertFalse(any("scrn1b" in asset_id for asset_id in records))
        empty = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty, records, pairs, pair_sources)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])
        self.assertEqual(added, 6)
        self.assertEqual(len(merged["assets"]), 10)
        self.assertEqual(len(merged["restyles"]), 6)

    def test_identical_character_atlases_keep_disk_locators(self):
        _inventory, records, _pairs, _sources, _aliases = self.build()
        for stem in ("chars.lbm", "chart.lbm"):
            ids = [f"cok/amiga/disk{disk}/lbm/{stem}/whole" for disk in (1, 2, 3)]
            self.assertTrue(all(asset_id in records for asset_id in ids))
            self.assertEqual(len({records[asset_id]["archive"]["path"] for asset_id in ids}), 3)
            self.assertEqual(len({records[asset_id]["decoded"]["pixelSha256"] for asset_id in ids}), 1)

    def test_idempotence_and_hash_mutation_rejection(self):
        inventory, records, pairs, pair_sources, _aliases = self.build()
        empty = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty, records, pairs, pair_sources)
        again, added_again = importer.merge_registry(merged, records, pairs, pair_sources)
        self.assertEqual(merged, again)
        self.assertEqual(added, 6)
        self.assertEqual(added_again, 0)
        changed = copy.deepcopy(inventory)
        row = next(item for item in changed["assets"] if any(
            alias.get("sourceName") == "CoK_gothic.png" for alias in item.get("aliases", [])))
        row["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "LBM inventory hash does not match"):
            importer.inventory_pairs(changed, records, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        visuals = importer.read_json(importer.VISUALS_DEFAULT)
        visuals["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "LBM visual source/pixel hashes differ"):
            importer.apply_visuals(records, visuals)


if __name__ == "__main__":
    unittest.main()
