from collections import Counter, defaultdict
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dok_graphics_pixel_visual_descriptions as transfer
import dok_graphics_visual_descriptions as glyph
from dok_graphics_source_census import EXTENSION_LIMIT, METADATA_LIMIT, REGISTRY_DELTA_LIMIT
from graphics_asset_registry import validate


class DokPixelTransferTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = {name: transfer.read_input(name) for name in (*glyph.PINS, glyph.SIDECAR, transfer.EXTENSION,
                                                                  *transfer.DATASET_PINS)}
        cls.registry = json.loads(cls.inputs[glyph.BASELINE])
        cls.sidecar = json.loads(cls.inputs[transfer.EXTENSION])
        cls.old_sidecar = json.loads(cls.inputs[glyph.SIDECAR])
        cls.census = json.loads(cls.inputs[glyph.CENSUS])
        cls.roster = json.loads(cls.inputs[glyph.ROSTER])
        cls.cok = json.loads(cls.inputs[glyph.COK_REGISTRY])
        cls.datasets = {name: transfer.unique_rows(json.loads(cls.inputs[name])["assets"], "assetId")
                        for name in transfer.DATASET_PINS}
        cls.glyph_registry = deepcopy(cls.registry)
        cls.old_ids = {row["assetId"] for row in cls.old_sidecar["assets"]}
        for asset in cls.glyph_registry["assets"]:
            if asset["id"] not in cls.old_ids:
                asset["description"].pop("visualDescription", None)
                asset["description"]["evidence"].clear()

    def derive(self, *, census=None, cok=None, datasets=None):
        return transfer.derive_extension(self.glyph_registry, self.old_sidecar, census or self.census,
                                         self.roster, cok or self.cok, datasets or self.datasets)

    def test_independent_membership_denominators_and_budgets(self):
        by_key = defaultdict(list)
        for row in self.cok["assets"]:
            if decoded := row.get("decoded"):
                by_key[decoded["width"], decoded["height"], decoded.get("pixelSha256")].append(row)
        observed = {}
        all_keys = {}
        for file in self.census["files"]:
            for entry in file["entries"]:
                for child in entry["children"]:
                    (asset_id,) = child["sourceIds"]
                    key = child["width"], child["height"], child["rgbSha256"]
                    all_keys[asset_id] = key
                    if key in by_key:
                        observed[asset_id] = key
        self.assertEqual((len(observed), len(set(observed.values())), len(self.old_ids & observed.keys())), (522, 336, 16))
        by_id = {asset["id"]: asset for asset in self.registry["assets"]}
        extension = {}
        donor_rows = []
        for row in self.sidecar["appearances"]:
            key = row["width"], row["height"], row["pixelSha256"]
            self.assertEqual(row["donorIds"], sorted(asset["id"] for asset in by_key[key]))
            self.assertTrue(any(asset["platform"] == "DOS-EGA" for asset in by_key[key]))
            donor_rows.extend(by_key[key])
            for target in row["targets"]:
                asset_id = target["assetId"]
                self.assertNotIn(asset_id, extension)
                extension[asset_id] = key
                asset = by_id[asset_id]
                self.assertEqual(asset["description"]["visualDescription"], row["visualDescription"])
                self.assertEqual(asset["archive"]["sha256"], target["archiveSha256"])
                self.assertEqual(asset["sourceContentSha256"], target["sourceContentSha256"])
        self.assertEqual(extension, {asset_id: key for asset_id, key in observed.items() if asset_id not in self.old_ids})
        self.assertEqual((len(extension), len(set(extension.values()))), (506, 335))
        self.assertEqual(Counter((row["platform"], row["archive"]["name"]) for row in donor_rows), transfer.DONOR_ARCHIVES)
        self.assertEqual(Counter(row["locator"]["kind"] for row in donor_rows), {"tile": 1179, "block-frame": 36})
        self.assertEqual(Counter(by_id[asset_id]["archive"]["name"] for asset_id in extension), transfer.TARGET_ARCHIVES)
        covered = {asset_id for asset_id, row in by_id.items() if row["description"].get("visualDescription")}
        remaining = all_keys.keys() - covered
        self.assertEqual(covered, self.old_ids | extension.keys())
        self.assertEqual((len(covered), len({all_keys[i] for i in covered})), (691, 497))
        self.assertEqual((len(remaining), len({all_keys[i] for i in remaining})), (1923, 1695))
        self.assertEqual((len(by_id), len(self.registry["animationGroups"])), (2614, 30))
        self.assertEqual(transfer.digest(transfer.serialize(self.glyph_registry)), transfer.GLYPH_REGISTRY_SHA256)
        self.assertEqual(transfer.digest(self.inputs[transfer.EXTENSION]), transfer.EXTENSION_SHA256)
        self.assertLessEqual(len(self.inputs[transfer.EXTENSION]), EXTENSION_LIMIT)
        self.assertLessEqual(len(self.inputs[glyph.BASELINE]) - len(transfer.serialize(self.glyph_registry)), REGISTRY_DELTA_LIMIT)
        self.assertLessEqual(sum(len(self.inputs[name]) for name in (glyph.ROSTER, glyph.CENSUS, glyph.BASELINE,
                                                                    glyph.SIDECAR, transfer.EXTENSION)), METADATA_LIMIT)

    def test_shuffled_inputs_reconstruct_both_final_artifacts(self):
        census = deepcopy(self.census)
        census["files"].reverse()
        for file in census["files"]:
            file["entries"].reverse()
            for entry in file["entries"]:
                entry["children"].reverse()
        cok = {**self.cok, "assets": self.cok["assets"][::-1]}
        datasets = {name: dict(reversed(list(rows.items()))) for name, rows in self.datasets.items()}
        annotated, sidecar, archives, pngs = self.derive(census=census, cok=cok, datasets=datasets)
        self.assertEqual(transfer.serialize(annotated), self.inputs[glyph.BASELINE])
        self.assertEqual(transfer.serialize(sidecar), self.inputs[transfer.EXTENSION])
        self.assertEqual((len(archives), len(pngs)), (16, 339))

    def test_census_mutations_cannot_create_new_equal_appearance(self):
        target = self.sidecar["appearances"][0]["targets"][0]["assetId"]
        for mutate in [
            lambda child: child.update(width=16, height=4),
            lambda child: child.update(rgbSha256=child["indexSha256"]),
            lambda child: child.update(indexSha256="0" * 64),
            lambda child: child.update(candidate=True),
            lambda child: child["sourceIds"].append(target),
        ]:
            census = deepcopy(self.census)
            child = next(child for file in census["files"] for entry in file["entries"] for child in entry["children"]
                         if child["sourceIds"] == [target])
            mutate(child)
            with self.assertRaises(ValueError):
                self.derive(census=census)

    def test_changed_donor_reviews_wording_provenance_and_rgb_are_rejected(self):
        appearance = next(row for row in self.sidecar["appearances"]
                          if any(i.startswith("cok/amiga/disk2/8x8d1.dax") for i in row["donorIds"]))
        candidate = next(i for i in appearance["donorIds"] if i.startswith("cok/amiga/disk2/8x8d1.dax"))
        donor = next(row for row in self.cok["assets"] if row["id"] == candidate)
        for mutate in [
            lambda row: row["decoded"].update(width=16, height=4),
            lambda row: row["decoded"].update(pixelSha256="0" * 64),
            lambda row: row["description"].update(evidence=[]),
            lambda row: row["description"].update(visualDescription="Conflicting words."),
            lambda row: row.update(edition="Retail Amiga"),
            lambda row: row["archive"].update(sha256="0" * 64),
        ]:
            altered = deepcopy(donor)
            mutate(altered)
            cok = {**self.cok, "assets": [altered if row is donor else row for row in self.cok["assets"]]}
            with self.assertRaises(ValueError):
                self.derive(cok=cok)

    def test_sidecar_and_evidence_dataset_byte_pins(self):
        for name in transfer.DATASET_PINS:
            with self.subTest(name=name), patch.object(transfer, "read_input", side_effect=lambda key, root: (
                    self.inputs[key] + (b" " if key == name else b""))):
                with self.assertRaisesRegex(ValueError, "donor evidence input SHA-256 mismatch"):
                    transfer.build_extension(self.glyph_registry, self.old_sidecar, self.inputs[glyph.CENSUS],
                                             self.inputs[glyph.ROSTER])
        with patch.object(glyph, "read_input", side_effect=lambda key, root: (
                self.inputs[key] + (b" " if key == transfer.EXTENSION else b""))):
            errors, _ = validate(self.registry)
        self.assertTrue(any("pixel-transfer sidecar differs" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
