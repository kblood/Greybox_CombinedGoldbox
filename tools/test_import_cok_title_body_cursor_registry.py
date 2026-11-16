"""Archive-backed checks for CoK title, cursor, body and Restyle identity links."""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_asset_registry  # noqa: E402
import import_cok_title_body_cursor_registry as importer  # noqa: E402

FIXTURES_AVAILABLE = (
    importer.INVENTORY_DEFAULT.is_file()
    and importer.PACKAGE_DEFAULT.is_dir()
    and all((importer.AMIGA_DEFAULT / info["relative"]).is_file()
            if info["kind"] == "daa" else (importer.DOS_DEFAULT / info["relative"]).is_file()
            for info in importer.ARCHIVES.values())
    and importer.SOURCE_DEFAULT.joinpath("dos_render_all/TITLE/TITLE_001.png").is_file()
    and importer.SOURCE_DEFAULT.joinpath("amiga_render_all/daa/CoK_BODY1/BODY1_068.png").is_file()
)


@unittest.skipUnless(FIXTURES_AVAILABLE, "title/body/cursor archive/render/gallery fixtures are unavailable")
class TitleBodyCursorRegistryTests(unittest.TestCase):
    def build(self):
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        visuals = importer.read_json(importer.VISUALS_DEFAULT)
        assets = importer.decode_archives(importer.DOS_DEFAULT, importer.AMIGA_DEFAULT,
                                          importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        importer.apply_visual_descriptions(assets, visuals, importer.PACKAGE_DEFAULT)
        pairs, pair_sources, alias_rows = importer.inventory_pairs(
            inventory, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        return inventory, assets, pairs, pair_sources, alias_rows

    def test_archive_frames_and_all_exact_gallery_aliases(self):
        _inventory, assets, pairs, pair_sources, alias_rows = self.build()
        self.assertEqual(len(assets), 9)
        self.assertEqual(alias_rows, 8)
        self.assertEqual(len(pairs), 7)
        self.assertEqual({len(ids) for ids in pair_sources.values()}, {1, 2})
        self.assertTrue(all("visualDescription" in asset["description"] for asset in assets.values()))
        for asset in assets.values():
            self.assertGreater(asset["decoded"]["width"], 0)
            self.assertGreater(asset["decoded"]["height"], 0)
        empty = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty, assets, pairs, pair_sources)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])
        self.assertEqual(added, 2)
        self.assertEqual(len(merged["assets"]), 9)
        self.assertEqual(len(merged["restyles"]), 7)

    def test_duplicate_body_archives_keep_distinct_ids_and_share_card(self):
        _inventory, assets, pairs, pair_sources, _rows = self.build()
        dos2 = "cok/dos-ega/disk1/body2.dax/block/68/frame/0"
        dos3 = "cok/dos-ega/disk1/body3.dax/block/68/frame/0"
        amiga2 = "cok/amiga/disk2/body1.daa/block/68/frame/0"
        amiga3 = "cok/amiga/disk3/body2.daa/block/68/frame/0"
        for asset_id in (dos2, dos3, amiga2, amiga3):
            self.assertIn(asset_id, assets)
        self.assertNotEqual(assets[dos2]["archive"]["path"], assets[dos3]["archive"]["path"])
        self.assertNotEqual(assets[amiga2]["archive"]["path"], assets[amiga3]["archive"]["path"])
        dos_card = next(ids for ids in pair_sources.values() if ids == {dos2, dos3})
        self.assertEqual(dos_card, {dos2, dos3})

    def test_idempotence_and_mutation_rejection(self):
        inventory, assets, pairs, pair_sources, _rows = self.build()
        empty = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty, assets, pairs, pair_sources)
        again, added_again = importer.merge_registry(merged, assets, pairs, pair_sources)
        self.assertEqual(merged, again)
        self.assertEqual(added, 2)
        self.assertEqual(added_again, 0)
        changed = copy.deepcopy(inventory)
        pair = next(row for row in changed["assets"] if any(
            alias.get("family") == "TITLE" for alias in row.get("aliases", [])))
        alias = next(alias for alias in pair["aliases"] if alias.get("family") == "TITLE")
        alias["asset"] = "TITLE_004"
        with self.assertRaisesRegex(ValueError, "DOS locator fields conflict"):
            importer.inventory_pairs(changed, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        visuals = importer.read_json(importer.VISUALS_DEFAULT)
        visuals["assets"][0]["pixelSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "visual source/pixel hash mismatch"):
            importer.apply_visual_descriptions(assets, visuals, importer.PACKAGE_DEFAULT)


if __name__ == "__main__":
    unittest.main()
