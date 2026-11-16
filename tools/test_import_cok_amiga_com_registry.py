"""Archive-backed checks for Amiga CoK COM strips and supporting image banks."""

from __future__ import annotations

import copy
import hashlib
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_asset_registry  # noqa: E402
import import_cok_amiga_com_registry as importer  # noqa: E402


FIXTURES_AVAILABLE = (
    importer.INVENTORY_DEFAULT.is_file()
    and importer.PACKAGE_DEFAULT.is_dir()
    and importer.SOURCE_ROOT_DEFAULT.joinpath("amiga_non_picture_source").is_dir()
    and all((importer.AMIGA_DEFAULT / info["relative"]).is_file() for info in importer.ARCHIVES.values())
)


@unittest.skipUnless(FIXTURES_AVAILABLE, "Amiga COM/archive/render/gallery fixtures are unavailable")
class AmigaComRegistryImportTests(unittest.TestCase):
    def build(self):
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        assets = importer.decode_archives(importer.AMIGA_DEFAULT, importer.SOURCE_ROOT_DEFAULT,
                                          importer.PACKAGE_DEFAULT)
        pairs, pair_sources, alias_rows = importer.inventory_pairs(
            inventory, assets, importer.SOURCE_ROOT_DEFAULT, importer.PACKAGE_DEFAULT)
        return registry, assets, pairs, pair_sources, alias_rows

    def test_complete_archive_rosters_and_exact_restyle_aliases(self):
        registry, assets, pairs, pair_sources, alias_rows = self.build()
        self.assertEqual(len(assets), 127)
        self.assertEqual(alias_rows, 134)
        self.assertEqual(len({asset_id for ids in pair_sources.values() for asset_id in ids}), 127)
        self.assertEqual(len(pairs), 102)
        self.assertEqual(sum(len(ids) > 1 for ids in pair_sources.values()), 25)
        merged, _added = importer.merge_registry(registry, assets, pairs, pair_sources)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])

    def test_idempotence_and_disk_qualified_dungcom_duplicates(self):
        registry, assets, pairs, pair_sources, _alias_rows = self.build()
        empty_registry = {"assets": [], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merged, added = importer.merge_registry(empty_registry, assets, pairs, pair_sources)
        again, added_again = importer.merge_registry(merged, assets, pairs, pair_sources)
        self.assertEqual(merged, again)
        self.assertEqual(added, 40)
        self.assertEqual(added_again, 0)
        current, added_current = importer.merge_registry(registry, assets, pairs, pair_sources)
        self.assertEqual(current, registry)
        self.assertEqual(added_current, 0)
        disk1 = "cok/amiga/disk1/dungcom.daa/block/1/tile/0"
        disk2 = "cok/amiga/disk2/dungcom.daa/block/1/tile/0"
        self.assertIn(disk1, assets)
        self.assertIn(disk2, assets)
        self.assertNotEqual(assets[disk1]["archive"]["path"], assets[disk2]["archive"]["path"])
        links = [link for link in merged["crossVersionLinks"]
                 if link.get("relation") == "pixel-identical"
                 and {link.get("fromAssetId"), link.get("toAssetId")} == {disk1, disk2}]
        self.assertEqual(len(links), 1)

    def test_alias_mutations_fail_closed(self):
        _registry, assets, _pairs, _pair_sources, _rows = self.build()
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        changed = copy.deepcopy(inventory)
        pair = next(row for row in changed["assets"] if any(
            alias.get("platform") == "Amiga" and alias.get("family") == "Amiga DUNGCOM"
            for alias in row.get("aliases", [])))
        alias = next(alias for alias in pair["aliases"] if alias.get("platform") == "Amiga"
                     and alias.get("family") == "Amiga DUNGCOM")
        alias["tile"] = int(alias["tile"]) + 1
        with self.assertRaisesRegex(ValueError, "alias locator fields conflict"):
            importer.inventory_pairs(changed, assets, importer.SOURCE_ROOT_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_archive_sha_mutation_fails_closed(self):
        key = "RANDCOM.DAA"
        old = importer.ARCHIVES[key]["sha256"]
        importer.ARCHIVES[key]["sha256"] = "0" * 64
        try:
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                importer.decode_archives(importer.AMIGA_DEFAULT, importer.SOURCE_ROOT_DEFAULT,
                                         importer.PACKAGE_DEFAULT)
        finally:
            importer.ARCHIVES[key]["sha256"] = old


class AmigaComVisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "images"
        self.image_store.mkdir()
        self.asset_id = "cok/amiga/disk1/comspr.daa/block/0/frame/0"
        self.png = b"fixture-png-bytes"
        self.source_hash = hashlib.sha256(self.png).hexdigest()
        self.pixel_hash = "a" * 64
        (self.image_store / f"{self.source_hash}.png").write_bytes(self.png)
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        self.registry = {"assets": [{"id": self.asset_id, "platform": "Amiga",
            "archive": {"name": "comspr.daa"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash},
            "description": {"text": "source description", "status": "unknown",
                "evidence": [{"kind": "decoded-pixels", "reference": "archive#0", "note": "pinned"}]}}]}
        self.sources = {self.asset_id: {"pixelSha256": self.pixel_hash}}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "A small orange shape on a dark gray field.",
            "evidence": [{"kind": "visual-review",
                "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}

    def tearDown(self):
        self.temp.cleanup()

    def test_package_paths_cannot_escape_the_declared_root(self):
        outside = self.root.parent / f"{self.root.name}-outside.png"
        outside.write_bytes(self.png)
        try:
            for unsafe in (f"../{outside.name}", outside.as_posix()):
                with self.subTest(path=unsafe), self.assertRaisesRegex(ValueError, "escapes approved root"):
                    importer.safe_file(self.root, unsafe, "fixture package input")
        finally:
            outside.unlink(missing_ok=True)

    def test_visual_description_image_store_symlink_escape_is_rejected(self):
        # Model a resolved symlink target deterministically; creating OS symlinks is not
        # supported in every Windows test environment.
        outside = self.root.parent / f"{self.root.name}-outside"
        outside.mkdir()
        outside_image = outside / f"{self.source_hash}.png"
        outside_image.write_bytes(self.png)
        original_resolve = Path.resolve
        def resolve_with_escape(path, *args, **kwargs):
            if path == self.image_store / f"{self.source_hash}.png":
                return outside_image
            return original_resolve(path, *args, **kwargs)
        try:
            with mock.patch.object(Path, "resolve", resolve_with_escape):
                with self.assertRaisesRegex(ValueError, "escapes approved root"):
                    self.apply_dataset()
        finally:
            outside_image.unlink(missing_ok=True)
            outside.rmdir()

    def apply_dataset(self, registry=None, dataset=None):
        return importer.apply_visual_descriptions(self.registry if registry is None else registry, self.sources,
            self.dataset if dataset is None else dataset, self.image_store, self.dataset_path)

    def test_exact_description_is_added_idempotently_and_metadata_is_preserved(self):
        merged, summary = self.apply_dataset()
        asset = merged["assets"][0]
        self.assertEqual(summary, {"rows": 1, "uniquePixelHashes": 1})
        self.assertEqual(asset["description"]["text"], "source description")
        self.assertEqual(asset["description"]["status"], "unknown")
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        again, _ = self.apply_dataset(merged)
        self.assertEqual(again, merged)

    def test_coverage_must_be_complete(self):
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.apply_dataset(dataset={"version": 1, "assets": []})

    def test_exact_pixel_duplicates_must_share_wording(self):
        other_id = "cok/amiga/disk1/dungcom.daa/block/1/tile/0"
        self.sources[other_id] = {"pixelSha256": self.pixel_hash}
        self.registry["assets"].append({"id": other_id, "platform": "Amiga",
            "archive": {"name": "DUNGCOM.DAA"}, "decoded": {"sha256": self.source_hash,
            "pixelSha256": self.pixel_hash}, "description": {}})
        row = copy.deepcopy(self.dataset["assets"][0])
        row["assetId"] = other_id
        row["visualDescription"] = "A conflicting different shape."
        with self.assertRaisesRegex(ValueError, "duplicate has conflicting"):
            self.apply_dataset(dataset={"version": 1, "assets": [self.dataset["assets"][0], row]})

    def test_archive_scope_exact_path_and_image_hash_are_checked(self):
        self.registry["assets"][0]["archive"]["name"] = "SKY.DAA"
        with self.assertRaisesRegex(ValueError, "does not target"):
            self.apply_dataset()
        self.registry["assets"][0]["archive"]["name"] = "COMSPR.DAA"
        bad_path = copy.deepcopy(self.dataset)
        bad_path["assets"][0]["evidence"][0]["reference"] = "images/wrong.png"
        with self.assertRaisesRegex(ValueError, "exact source PNG"):
            self.apply_dataset(dataset=bad_path)
        self.dataset["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash or text mismatch"):
            self.apply_dataset()


if __name__ == "__main__":
    unittest.main()
