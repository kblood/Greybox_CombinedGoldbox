"""Exact DOS CoK combat-bank joins, with fixture-free merge safety controls."""

from __future__ import annotations

import copy
import hashlib
import itertools
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import graphics_asset_registry  # noqa: E402
import import_cok_dos_com_registry as importer  # noqa: E402

FIXTURES_AVAILABLE = (
    importer.INVENTORY_DEFAULT.is_file() and importer.PACKAGE_DEFAULT.is_dir()
    and importer.SOURCE_DEFAULT.joinpath("dos_render_all").is_dir()
    and all((importer.DOS_DEFAULT / info["name"]).is_file() for info in importer.ARCHIVES.values())
)


NEW_FAMILIES = {"WILDCOM.DAX", "RANDCOM.DAX"}
SHARED_CARD = "asset-0273-1be02703b6d7"
AMIGA_ID = "cok/amiga/disk2/wildcom.daa/block/1/tile/22"
DOS_SHARED = {importer.source_id("WILDCOM", 1, tile) for tile in (22, 26, 27, 28)}
RESIDUAL_CARDS = {"asset-1287-800f03742f9b", "asset-1574-9f86c0bfe16e"}


class SyntheticMergeSafetyTests(unittest.TestCase):
    def fixture(self):
        asset = importer.asset_record("WILDCOM", 1, 22, Path("WILDCOM.DAX"),
            importer.ARCHIVES["WILDCOM"]["sha256"], 24, 24, "a" * 64, "b" * 64)
        amiga = copy.deepcopy(asset)
        amiga.update(id=AMIGA_ID, platform="Amiga", edition="Amiga disk 2")
        amiga["archive"] = {"name": "WILDCOM.DAA", "path": "disk2/WILDCOM.DAA", "sha256": "c" * 64}
        amiga["description"] = {"text": "Preserve verified metadata", "status": "partial", "evidence": []}
        pair = {"id": SHARED_CARD, "sourceSha256": "a" * 64, "outputSha256": "d" * 64,
                "source": f"images/{'a' * 64}.png", "output": f"images/{'d' * 64}.png"}
        prior = importer.restyle_record(pair, {AMIGA_ID})
        prior.update(reviewStatus="published", customMetadata={"keep": [1, 2]})
        prior["prompt"]["text"] = "Keep the existing prompt"
        registry = {"assets": [amiga], "restyles": [prior], "crossVersionLinks": [], "animationGroups": []}
        assets = {}
        for tile in (22, 26, 27, 28):
            row = copy.deepcopy(asset)
            row["id"] = importer.source_id("WILDCOM", 1, tile)
            row["locator"]["tileIndex"] = tile
            assets[row["id"]] = row
        return registry, assets, {SHARED_CARD: pair}, {SHARED_CARD: set(assets)}

    def test_shared_output_preserves_amiga_and_all_metadata_without_mutating_input(self):
        registry, assets, pairs, sources = self.fixture()
        before = copy.deepcopy(registry)
        merged, added = importer.merge_registry(registry, assets, pairs, sources)
        self.assertEqual(registry, before)
        self.assertEqual(next(row for row in merged["assets"] if row["id"] == AMIGA_ID), before["assets"][0])
        expected = copy.deepcopy(before["restyles"][0])
        expected.update(sourceAssetIds=sorted({AMIGA_ID} | DOS_SHARED), sourceRelation="shared-output")
        self.assertEqual(merged["restyles"], [expected])
        expected_edges = {frozenset(pair) for pair in itertools.combinations({AMIGA_ID} | DOS_SHARED, 2)}
        actual_edges = [frozenset((link["fromAssetId"], link["toAssetId"])) for link in merged["crossVersionLinks"]]
        self.assertEqual(set(actual_edges), expected_edges)
        self.assertEqual(len(actual_edges), len(expected_edges))
        self.assertEqual(added, len(expected_edges))
        repeated, added_again = importer.merge_registry(merged, assets, pairs, sources)
        self.assertEqual(repeated, merged)
        self.assertEqual(added_again, 0)
        self.assertEqual(importer.restyle_record(pairs[SHARED_CARD], DOS_SHARED)["sourceRelation"], "shared-output")

    def test_existing_locator_output_and_source_conflicts_fail_closed(self):
        for mutation, message in [("locator", "locator conflicts"), ("archive", "archive pin or locator conflicts"),
                                  ("png", "decoded source hash conflicts"), ("width", "decoded geometry conflicts"),
                                  ("height", "decoded geometry conflicts"),
                                  ("pixels", "decoded pixel hash conflicts"), ("output", "output hash conflicts"),
                                  ("source", "source image hash conflicts")]:
            with self.subTest(mutation=mutation):
                registry, assets, pairs, sources = self.fixture()
                if mutation in {"locator", "archive", "pixels", "png", "width", "height"}:
                    existing = copy.deepcopy(next(iter(assets.values())))
                    if mutation == "locator":
                        existing["locator"]["tileIndex"] = 999
                    elif mutation == "archive":
                        existing["archive"]["sha256"] = "0" * 64
                    elif mutation == "png":
                        existing["decoded"]["sha256"] = "0" * 64
                    elif mutation in {"width", "height"}:
                        existing["decoded"][mutation] = 999
                    else:
                        existing["decoded"]["pixelSha256"] = "0" * 64
                    registry["assets"].append(existing)
                elif mutation == "output":
                    registry["restyles"][0]["outputs"][0]["sha256"] = "0" * 64
                else:
                    registry["assets"][0]["decoded"]["sha256"] = "0" * 64
                before = copy.deepcopy(registry)
                with self.assertRaisesRegex(ValueError, message):
                    importer.merge_registry(registry, assets, pairs, sources)
                self.assertEqual(registry, before)

    def test_enriched_existing_dos_source_survives_reimport_and_conflicting_png_is_rejected(self):
        registry, assets, pairs, sources = self.fixture()
        asset_id = importer.source_id("WILDCOM", 1, 22)
        prior = copy.deepcopy(assets[asset_id])
        prior.update(galleryReferences=[{"id": "existing-gallery-card", "review": "retain"}],
                     customMetadata={"nested": ["keep", {"value": 7}]},
                     description={"text": "Existing researched description", "status": "partial", "evidence": []},
                     gameConsumers=[{"status": "partial", "use": "Existing consumer evidence"}],
                     animationGroupId="existing-group")
        prior["archive"]["provenanceNote"] = "Preserve archive evidence"
        prior["decoded"].update(path="old/source-path.png", reviewNote="Preserve decoded evidence")
        registry["assets"].append(prior)
        before, assets_before = copy.deepcopy(registry), copy.deepcopy(assets)
        merged, _added = importer.merge_registry(registry, assets, pairs, sources)
        expected = copy.deepcopy(prior)
        expected["decoded"]["path"] = assets[asset_id]["decoded"]["path"]
        self.assertEqual(next(row for row in merged["assets"] if row["id"] == asset_id), expected)
        self.assertEqual(registry, before)
        self.assertEqual(assets, assets_before)
        repeated, added_again = importer.merge_registry(merged, assets, pairs, sources)
        self.assertEqual(repeated, merged)
        self.assertEqual(added_again, 0)
        conflicting = copy.deepcopy(registry)
        next(row for row in conflicting["assets"] if row["id"] == asset_id)["decoded"]["sha256"] = "0" * 64
        conflict_before = copy.deepcopy(conflicting)
        with self.assertRaisesRegex(ValueError, "existing decoded source hash conflicts"):
            importer.merge_registry(conflicting, assets, pairs, sources)
        self.assertEqual(conflicting, conflict_before)
        self.assertEqual(assets, assets_before)

    def test_manifest_mutation_is_rejected_without_archive_fixtures(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text('{"assets": []}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "inventory SHA-256 differs"):
                importer.read_inventory(path)

    def test_atomic_write_validates_first_and_preserves_target_on_failure(self):
        registry, _assets, _pairs, _sources = self.fixture()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "registry.json"
            path.write_text("original bytes", encoding="utf-8")
            with patch.object(importer.graphics_asset_registry, "validate", return_value=(["synthetic failure"], [])):
                with self.assertRaisesRegex(ValueError, "Merged registry validation failed"):
                    importer.write_registry_atomic(path, registry)
            self.assertEqual(path.read_text(encoding="utf-8"), "original bytes")
            self.assertEqual(list(Path(directory).iterdir()), [path])
            with patch.object(importer.graphics_asset_registry, "validate", return_value=([], [])):
                with patch.object(importer.os, "replace", side_effect=OSError("synthetic replace failure")):
                    with self.assertRaisesRegex(OSError, "synthetic replace failure"):
                        importer.write_registry_atomic(path, registry)
                self.assertEqual(path.read_text(encoding="utf-8"), "original bytes")
                self.assertEqual(list(Path(directory).iterdir()), [path])
                importer.write_registry_atomic(path, registry)
                self.assertEqual(importer.read_json(path), registry)
                self.assertEqual(list(Path(directory).iterdir()), [path])


class SyntheticDecodePackageContainmentTests(unittest.TestCase):
    pixels = bytes([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0])

    def make_inputs(self, root):
        dos_root = root / "dos"
        source_root = root / "source"
        package_root = root / "package"
        (dos_root).mkdir()
        source_png = source_root / "dos_render_all" / "COMSPR" / "COMSPR_000.png"
        source_png.parent.mkdir(parents=True)
        archive = dos_root / "COMSPR.DAX"
        archive.write_bytes(b"synthetic dax")
        image = Image.frombytes("RGB", (2, 2), self.pixels).resize((8, 8), Image.Resampling.NEAREST)
        image.save(source_png, format="PNG")
        package_images = package_root / "images"
        package_images.mkdir(parents=True)
        png_hash = hashlib.sha256(source_png.read_bytes()).hexdigest()
        (package_images / f"{png_hash}.png").write_bytes(source_png.read_bytes())
        return dos_root, source_root, package_root, png_hash

    def decode(self, dos_root, source_root, package_root, png_hash, resolve_redirect=None):
        archive_info = {"name": "COMSPR.DAX", "sha256": hashlib.sha256(b"synthetic dax").hexdigest(),
                        "blocks": [0], "kind": "frames"}
        block = SimpleNamespace(block_id=0)
        original_resolve = Path.resolve
        def redirected_resolve(path, strict=False):
            if resolve_redirect and path == resolve_redirect[0]:
                return resolve_redirect[1]
            return original_resolve(path, strict=strict)
        with patch.object(importer, "ARCHIVES", {"COMSPR": archive_info}), \
                patch.object(importer.dax_decode, "parse_container", return_value=(0, [block])), \
                patch.object(importer.dax_decode, "decompress_block", return_value=b"synthetic frame"), \
                patch.object(importer.dax_decode, "parse_standard_frame", return_value=(2, 2, 0, 0)), \
                patch.object(importer.dax_decode, "frame_to_rgb", return_value=self.pixels), \
                patch.object(Path, "resolve", new=redirected_resolve):
            assets = importer.decode_archives(dos_root, source_root, package_root)
        self.assertEqual(assets[importer.source_id("COMSPR", 0)]["decoded"]["sha256"], png_hash)
        return assets

    def test_actual_decode_accepts_hash_named_image_inside_package(self):
        with tempfile.TemporaryDirectory() as directory:
            dos_root, source_root, package_root, png_hash = self.make_inputs(Path(directory))
            self.decode(dos_root, source_root, package_root, png_hash)

    def test_actual_decode_rejects_images_directory_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dos_root, source_root, package_root, png_hash = self.make_inputs(root)
            candidate = package_root / "images" / f"{png_hash}.png"
            outside = root / "outside-images" / f"{png_hash}.png"
            with self.assertRaisesRegex(ValueError, "path escapes approved root"):
                self.decode(dos_root, source_root, package_root, png_hash, (candidate, outside))

    def test_actual_decode_rejects_hash_named_leaf_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dos_root, source_root, package_root, png_hash = self.make_inputs(root)
            outside = root / "outside.png"
            packaged = package_root / "images" / f"{png_hash}.png"
            with self.assertRaisesRegex(ValueError, "path escapes approved root"):
                self.decode(dos_root, source_root, package_root, png_hash, (packaged, outside))


@unittest.skipUnless(FIXTURES_AVAILABLE, "DOS CoK COMSPR/DUNGCOM/WILDCOM/RANDCOM/SKY fixtures are unavailable")
class DosComRegistryImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        registry = importer.read_json(importer.REGISTRY_DEFAULT)
        inventory = importer.read_inventory(importer.INVENTORY_DEFAULT)
        assets = importer.decode_archives(importer.DOS_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        pairs, pair_sources, alias_rows = importer.inventory_pairs(
            inventory, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
        cls.verified = registry, assets, pairs, pair_sources, alias_rows

    def build(self):
        return copy.deepcopy(self.verified)

    def test_rosters_match_all_archive_frames_and_restyle_aliases(self):
        registry, assets, pairs, pair_sources, alias_rows = self.build()
        self.assertEqual(len(assets), 95)
        self.assertEqual(alias_rows, 94)
        self.assertEqual(len(pairs), 91)
        self.assertEqual(len({source_id for ids in pair_sources.values() for source_id in ids}), 94)
        self.assertEqual(sum(row["locator"]["kind"] == "tile" for row in assets.values()), 66)
        self.assertEqual(sum(row["archive"]["name"] == "COMSPR.DAX" for row in assets.values()), 26)
        self.assertEqual(sum(row["archive"]["name"] == "SKY.DAX" for row in assets.values()), 3)
        new_ids = {key for key, row in assets.items() if row["archive"]["name"] in NEW_FAMILIES}
        self.assertEqual(len(new_ids), 41)
        for family, count in [("WILDCOM", 35), ("RANDCOM", 6)]:
            self.assertEqual({key for key in new_ids if f"/{family.lower()}.dax/" in key},
                             {importer.source_id(family, 1, tile) for tile in range(count)})
        new_cards = {key for key, ids in pair_sources.items() if ids & new_ids}
        self.assertEqual(len(new_cards), 38)
        self.assertEqual(len(new_cards - {SHARED_CARD}), 37)
        self.assertEqual(pair_sources[SHARED_CARD], DOS_SHARED)
        self.assertFalse(RESIDUAL_CARDS & set(pairs))
        for key in new_ids:
            self.assertEqual(assets[key]["description"]["status"], "unknown")
            self.assertEqual([row["status"] for row in assets[key]["gameConsumers"]], ["unknown"])
            self.assertIsNone(assets[key]["animationGroupId"])
        merged, added = importer.merge_registry(registry, assets, pairs, pair_sources)
        original_edges = {frozenset((link["fromAssetId"], link["toAssetId"])) for link in registry["crossVersionLinks"]}
        # Independently derive the complete eligible pair set; do not pin a measured link total.
        expected = set()
        for left in assets.values():
            for right in merged["assets"]:
                a, b = left.get("decoded") or {}, right.get("decoded") or {}
                if left["id"] != right["id"] and a.get("pixelSha256") and (
                        a.get("width"), a.get("height"), a["pixelSha256"]) == (
                        b.get("width"), b.get("height"), b.get("pixelSha256")):
                    expected.add(frozenset((left["id"], right["id"])))
        additions = merged["crossVersionLinks"][len(registry["crossVersionLinks"]):]
        actual = [frozenset((link["fromAssetId"], link["toAssetId"])) for link in additions]
        self.assertEqual(set(actual), expected - original_edges)
        self.assertEqual(len(actual), len(set(actual)), "No duplicate or reversed new pixel edges")
        self.assertEqual(added, len(actual))
        repeated, added_again = importer.merge_registry(merged, assets, pairs, pair_sources)
        self.assertEqual(repeated, merged)
        self.assertEqual(added_again, 0)
        prior_shared = next(row for row in registry["restyles"] if row["id"] == f"restyle/cok-generated/{SHARED_CARD}")
        final_shared = next(row for row in merged["restyles"] if row["id"] == prior_shared["id"])
        self.assertEqual(set(final_shared["sourceAssetIds"]), {AMIGA_ID} | DOS_SHARED)
        for field in set(prior_shared) - {"sourceAssetIds", "sourceRelation"}:
            self.assertEqual(final_shared[field], prior_shared[field])
        self.assertEqual(final_shared["sourceRelation"], "shared-output")
        self.assertEqual([row for row in registry["assets"] if row["platform"] == "Amiga"],
                         [row for row in merged["assets"] if row["platform"] == "Amiga"])
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])

    def test_exact_alias_mutation_is_rejected(self):
        _registry, assets, _pairs, _pair_sources, _rows = self.build()
        inventory = importer.read_json(importer.INVENTORY_DEFAULT)
        changed = copy.deepcopy(inventory)
        pair = next(row for row in changed["assets"] if any(
            alias.get("platform") == "DOS" and alias.get("family") == "DOS DUNGCOM"
            for alias in row.get("aliases", [])))
        alias = next(alias for alias in pair["aliases"] if alias.get("platform") == "DOS"
                     and alias.get("family") == "DOS DUNGCOM")
        alias["tile"] = int(alias["tile"]) + 1
        with self.assertRaisesRegex(ValueError, "alias tile locator conflicts"):
            importer.inventory_pairs(changed, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_archive_hash_mutation_fails_closed(self):
        for family in ("SKY", "WILDCOM", "RANDCOM"):
            with self.subTest(family=family), patch.dict(importer.ARCHIVES[family], sha256="0" * 64):
                with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                    importer.decode_archives(importer.DOS_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_new_tile_count_geometry_and_ordered_toc_mutations_fail_closed(self):
        for family in ("WILDCOM", "RANDCOM"):
            for field, value in [("count", -1), ("blocks", [2])]:
                with self.subTest(family=family, field=field), patch.dict(importer.ARCHIVES[family], {field: value}):
                    with self.assertRaisesRegex(ValueError, "tile roster or geometry|ordered DAX TOC"):
                        importer.decode_archives(importer.DOS_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)
            original = importer.dax_decode.parse_ega_tile_array
            count = importer.ARCHIVES[family]["count"]
            def changed_geometry(raw):
                result = original(raw)
                if result and result[2] == count:
                    return (23, *result[1:])
                return result
            with self.subTest(family=family, field="geometry"), patch.object(importer.dax_decode, "parse_ega_tile_array", changed_geometry):
                with self.assertRaisesRegex(ValueError, "tile roster or geometry"):
                    importer.decode_archives(importer.DOS_DEFAULT, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)

    def test_new_alias_and_image_hash_mutations_fail_closed(self):
        _registry, assets, _pairs, _sources, _rows = self.build()
        for family in ("DOS WILDCOM", "DOS RANDCOM"):
            for field, value, message in [("asset", 2, "alias tile locator conflicts"),
                    ("tile", 999, "alias tile locator conflicts"), ("family", "DOS DUNGCOM", "family conflicts"),
                    ("sourceProvenance", "wrong/path.png", "source provenance"),
                    ("sourceSha256", "0" * 64, "source SHA-256 differs"),
                    ("outputSha256", "0" * 64, "packaged output image differs")]:
                with self.subTest(family=family, field=field):
                    inventory = importer.read_inventory(importer.INVENTORY_DEFAULT)
                    pair = next(row for row in inventory["assets"] if any(
                        alias.get("platform") == "DOS" and alias.get("family") == family for alias in row.get("aliases", [])))
                    alias = next(alias for alias in pair["aliases"] if alias.get("platform") == "DOS" and alias.get("family") == family)
                    if field.endswith("Sha256"):
                        pair[field] = value
                    else:
                        alias[field] = value
                    with self.assertRaisesRegex(ValueError, message):
                        importer.inventory_pairs(inventory, assets, importer.SOURCE_DEFAULT, importer.PACKAGE_DEFAULT)


class SyntheticVisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.package = self.root / "package"
        (self.package / "images").mkdir(parents=True)
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        self.asset_id = importer.source_id("COMSPR", 0)
        self.native_pixels = bytes([
            255, 0, 0, 0, 255, 0,
            0, 0, 255, 255, 255, 0,
        ])
        self.pixel_hash = hashlib.sha256(self.native_pixels).hexdigest()
        image = Image.frombytes("RGB", (2, 2), self.native_pixels)
        image = image.resize((8, 8), Image.Resampling.NEAREST)
        self.image_path = self.package / "images" / "source.png"
        image.save(self.image_path, format="PNG")
        self.source_hash = hashlib.sha256(self.image_path.read_bytes()).hexdigest()
        self.image_path.rename(self.package / "images" / f"{self.source_hash}.png")
        self.image_path = self.package / "images" / f"{self.source_hash}.png"
        self.asset = {
            "id": self.asset_id, "platform": "DOS-EGA", "archive": {"name": "COMSPR.DAX"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash, "width": 2, "height": 2},
            "description": {"text": "semantic meaning unknown", "status": "unknown", "evidence": []},
        }
        note = (f"Visible appearance only; manually reviewed exact source PNG SHA-256 {self.source_hash} "
                f"and decoded pixel SHA-256 {self.pixel_hash}; does not infer subject identity, game use, selector, or playback semantics.")
        self.dataset = {"version": 1, "assets": [{
            "assetId": self.asset_id, "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "Four colored square regions with red, green, blue, and yellow.",
            "evidence": [{"kind": "visual-review",
                "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": note}],
        }]}
        self.registry = {"assets": [copy.deepcopy(self.asset)]}
        self.sources = {self.asset_id: copy.deepcopy(self.asset)}

    def tearDown(self):
        self.temp.cleanup()

    def apply(self, registry=None, dataset=None):
        return importer.apply_visual_descriptions(
            self.registry if registry is None else registry,
            self.sources,
            self.dataset if dataset is None else dataset,
            self.package,
            self.dataset_path,
        )

    def test_exact_source_description_is_applied_idempotently(self):
        merged = copy.deepcopy(self.registry)
        merged, summary = self.apply(merged)
        description = merged["assets"][0]["description"]
        self.assertEqual(summary, {"rows": 1, "uniquePixelGroups": 1, "registryOverlapPixelGroups": 0})
        self.assertEqual(description["status"], "unknown")
        self.assertEqual(description["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        again = copy.deepcopy(merged)
        again, _summary = self.apply(again)
        self.assertEqual(again, merged)

    def test_incomplete_roster_and_changed_source_hash_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "roster mismatch"):
            self.apply(dataset={"version": 1, "assets": []})
        changed = copy.deepcopy(self.dataset)
        changed["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "source/file/pixel hash"):
            self.apply(dataset=changed)

    def test_exact_preview_bytes_and_native_pixels_are_required(self):
        self.image_path.write_bytes(b"changed bytes")
        with self.assertRaisesRegex(ValueError, "reviewed PNG SHA-256 differs"):
            self.apply()

    def test_existing_pixel_identical_source_requires_same_wording(self):
        other = copy.deepcopy(self.asset)
        other["id"] = "cok/amiga/disk1/comspr.daa/block/0/frame/0"
        other["platform"] = "Amiga"
        other["archive"] = {"name": "COMSPR.DAA", "path": "other/COMSPR.DAA", "sha256": "d" * 64}
        other["description"]["visualDescription"] = "A conflicting description."
        registry = {"assets": [copy.deepcopy(self.asset), other]}
        with self.assertRaisesRegex(ValueError, "conflicts with existing wording"):
            self.apply(registry)


if __name__ == "__main__":
    unittest.main()
