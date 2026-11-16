"""Archive-backed checks for CoK Amiga/DOS HEAD frames and Restyle links."""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_asset_registry  # noqa: E402
import import_cok_heads_registry as importer  # noqa: E402

def archive_fixture_exists(key, info):
    if key == "amiga_head2":
        return (importer.AMIGA_HEAD2_DEFAULT / info["relative"]).is_file()
    root = importer.AMIGA_DEFAULT if info["kind"] == "daa" else importer.DOS_DEFAULT
    return (root / info["relative"]).is_file()


FIXTURES_AVAILABLE = (
    importer.INVENTORY_DEFAULT.is_file()
    and importer.PACKAGE_DEFAULT.is_dir()
    and all(archive_fixture_exists(key, info) for key, info in importer.ARCHIVES.items())
    and all((importer.SOURCE_DEFAULT / path).is_file() for path in (
        "amiga_render_all/daa/CoK_HEAD1/HEAD1_068.png",
        "amiga_render_all/daa/CoK_HEAD1/HEAD1_069.png",
        "dos_render_all/HEAD2/HEAD2_068.png",
        "dos_render_all/HEAD2/HEAD2_069.png",
        "dos_render_all/HEAD3/HEAD3_068.png",
        "dos_render_all/HEAD3/HEAD3_069.png",
    ))
)


@unittest.skipUnless(FIXTURES_AVAILABLE, "HEAD archive/render/gallery fixtures are unavailable")
class HeadRegistryImportTests(unittest.TestCase):
    def build(self):
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        visuals = importer.read_json(importer.VISUALS_DEFAULT)
        assets = importer.decode_archives(importer.AMIGA_DEFAULT, importer.DOS_DEFAULT,
                                          importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT,
                                          importer.AMIGA_HEAD2_DEFAULT)
        importer.apply_visual_descriptions(assets, visuals, importer.PACKAGE_DEFAULT)
        pairs, pair_sources, alias_rows = importer.inventory_pairs(
            inventory, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        return registry, inventory, assets, pairs, pair_sources, alias_rows

    def test_archive_frames_visuals_and_all_exact_gallery_aliases(self):
        registry, _inventory, assets, pairs, pair_sources, alias_rows = self.build()
        self.assertEqual(len(assets), 8)
        self.assertEqual(alias_rows, 6)
        self.assertEqual(len(pairs), 6)
        self.assertEqual({len(ids) for ids in pair_sources.values()}, {1, 2})
        self.assertTrue(any("cok/amiga/disk3/head2.daa/block/69/frame/0" in ids
                            for ids in pair_sources.values()))
        self.assertTrue(all(asset["decoded"]["width"] == 88 and asset["decoded"]["height"] == 40
                            for asset in assets.values()))
        self.assertTrue(all("visualDescription" in asset["description"] for asset in assets.values()))
        empty_registry = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty_registry, assets, pairs, pair_sources)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])
        links = [link for link in merged["crossVersionLinks"]
                 if link.get("relation") == "pixel-identical"
                 and link.get("fromAssetId", "").startswith("cok/dos-ega/disk1/head")]
        self.assertEqual(len(links), 2)
        amiga_links = [link for link in merged["crossVersionLinks"]
                       if link.get("fromAssetId", "").startswith("cok/amiga/disk2/head1.daa/")]
        self.assertEqual(len(amiga_links), 2)
        self.assertIn("cok/amiga/disk3/head2.daa/block/68/frame/0", {link["toAssetId"] for link in amiga_links})
        self.assertIn(added, (0, 4))
        self.assertEqual(len(merged["assets"]), 8)
        self.assertEqual(len(merged["restyles"]), 6)

    def test_idempotence_preserves_distinct_dos_archive_ids(self):
        _registry, _inventory, assets, pairs, pair_sources, _rows = self.build()
        empty_registry = {"registryVersion": 1, "assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty_registry, assets, pairs, pair_sources)
        again, added_again = importer.merge_registry(merged, assets, pairs, pair_sources)
        self.assertEqual(merged, again)
        self.assertEqual(added, 4)
        self.assertEqual(added_again, 0)
        for family in ("head2", "head3"):
            asset_id = f"cok/dos-ega/disk1/{family}.dax/block/68/frame/0"
            self.assertIn(asset_id, {row["id"] for row in merged["assets"]})
        self.assertNotEqual(
            "cok/dos-ega/disk1/head2.dax/block/68/frame/0",
            "cok/dos-ega/disk1/head3.dax/block/68/frame/0",
        )
        self.assertIn("cok/amiga/disk3/head2.daa/block/69/frame/0", {row["id"] for row in merged["assets"]})

    def test_alias_mutation_is_rejected(self):
        _registry, inventory, assets, _pairs, _pair_sources, _rows = self.build()
        changed = copy.deepcopy(inventory)
        pair = next(row for row in changed["assets"] if any(
            alias.get("family") == "HEAD2" for alias in row.get("aliases", [])))
        alias = next(alias for alias in pair["aliases"] if alias.get("family") == "HEAD2")
        alias["asset"] = "HEAD2_069"
        with self.assertRaisesRegex(ValueError, "DOS HEAD locator fields conflict"):
            importer.inventory_pairs(changed, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_visual_observation_hash_mutation_is_rejected(self):
        _registry, _inventory, assets, _pairs, _pair_sources, _rows = self.build()
        visuals = importer.read_json(importer.VISUALS_DEFAULT)
        visuals["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "visual observation source/pixel hash mismatch"):
            importer.apply_visual_descriptions(assets, visuals, importer.PACKAGE_DEFAULT)


if __name__ == "__main__":
    unittest.main()
