import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dok_graphics_visual_descriptions as visual
from graphics_asset_registry import validate
from dok_graphics_pixel_visual_descriptions import GLYPH_REGISTRY_SHA256


class DokExactVisualDescriptionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = {name: visual.read_input(name) for name in (*visual.PINS, visual.SIDECAR)}
        cls.registry = json.loads(cls.inputs[visual.BASELINE])
        cls.baseline = copy.deepcopy(cls.registry)
        for asset in cls.baseline["assets"]:
            asset["description"].pop("visualDescription", None)
            asset["description"]["evidence"].clear()
        cls.sidecar = json.loads(cls.inputs[visual.SIDECAR])
        old_ids = {row["assetId"] for row in cls.sidecar["assets"]}
        cls.annotated_index = next(i for i, asset in enumerate(cls.registry["assets"])
                                   if asset["locator"]["kind"] == "tile" and asset["id"] in old_ids)
        cls.unannotated_index = next(i for i, asset in enumerate(cls.registry["assets"])
                                     if not asset["description"]["evidence"])

    def derive(self, census=None, donor_registry=None, donor_dataset=None):
        return visual.derive(self.baseline, census or json.loads(self.inputs[visual.CENSUS]),
                             json.loads(self.inputs[visual.ROSTER]),
                             donor_registry or json.loads(self.inputs[visual.COK_REGISTRY]),
                             donor_dataset or json.loads(self.inputs[visual.DONOR]))

    def test_exact_slice_and_budget(self):
        errors, _ = validate(self.registry)
        self.assertEqual(errors, [])
        rows = self.sidecar["assets"]
        self.assertEqual(len(rows), 185)
        self.assertEqual(len({(row["width"], row["height"], row["pixelSha256"]) for row in rows}), 162)
        glyphs = [row for row in rows if row["kind"] == "glyph"]
        tiles = [row for row in rows if row["kind"] == "tile"]
        self.assertEqual((len(glyphs), len(tiles)), (177, 8))
        self.assertEqual({row["pixelSha256"] for row in tiles}, {visual.BLACK_RGB})
        self.assertEqual(sum(not asset["description"]["evidence"] for asset in self.registry["assets"]), 1923)
        baseline_bytes = visual.serialize(self.baseline)
        self.assertEqual(visual.digest(baseline_bytes), visual.PINS[visual.BASELINE])
        self.assertEqual(visual.digest(self.inputs[visual.SIDECAR]), visual.SIDECAR_SHA256)
        self.assertLessEqual(len(self.inputs[visual.SIDECAR]) + len(self.inputs[visual.BASELINE]) - len(baseline_bytes),
                             visual.GROWTH_LIMIT)
        self.assertLessEqual(sum(len(self.inputs[name]) for name in (visual.SIDECAR, visual.BASELINE,
                                                                     visual.ROSTER, visual.CENSUS)), 5 * 1024**2)

    def test_all_input_pins_reject_even_byte_only_drift(self):
        for name, raw in self.inputs.items():
            if name == visual.SIDECAR:
                continue
            if name == visual.BASELINE:
                raw = visual.serialize(self.baseline)
            with self.subTest(name=name):
                visual.pinned_document(name, raw)
                with self.assertRaisesRegex(ValueError, "input SHA-256 mismatch"):
                    visual.pinned_document(name, raw + b" ")

    def test_exact_binding_rejects_changed_census_dimension_content_archive_or_id(self):
        for mutate in [
            lambda file, child: child.update(width=16),
            lambda file, child: child.update(indexSha256="0" * 64),
            lambda file, child: file.update(sha256="0" * 64),
            lambda file, child: child["sourceIds"].append(child["sourceIds"][0]),
        ]:
            census = json.loads(self.inputs[visual.CENSUS])
            file = census["files"][0]
            child = file["entries"][0]["children"][0]
            mutate(file, child)
            with self.assertRaises(ValueError):
                self.derive(census=census)

    def test_donor_wording_and_review_evidence_are_required_for_all_pixel_duplicates(self):
        registry = json.loads(self.inputs[visual.COK_REGISTRY])
        donor = json.loads(self.inputs[visual.DONOR])
        blank = [row for row in donor["assets"] if row["pixelSha256"] == visual.BLACK_RGB]
        self.assertGreater(len(blank), 1)
        donor_asset = next(row for row in registry["assets"] if row["id"] == blank[-1]["assetId"])
        blank[-1]["visualDescription"] += " Altered."
        with self.assertRaisesRegex(ValueError, "conflicting wording"):
            self.derive(donor_registry=registry, donor_dataset=donor)
        for patch_fields in [{"evidence": []}, {"visualDescription": "A blank field."}]:
            original = donor_asset["description"]
            donor_asset["description"] = {**original, **patch_fields}
            with self.assertRaisesRegex(ValueError, "donor wording, archive, or visual-review evidence differs"):
                self.derive(donor_registry=registry)
            donor_asset["description"] = original

    def test_sidecar_rejects_missing_duplicate_extra_unapproved_donor_and_claim_rows(self):
        for mutate in [
            lambda sidecar: sidecar["assets"].pop(),
            lambda sidecar: sidecar["assets"].append(sidecar["assets"][0]),
            lambda sidecar: sidecar["assets"].append(dict(sidecar["assets"][0], assetId="dok/other")),
            lambda sidecar: sidecar["assets"][0].update(width=16),
            lambda sidecar: sidecar.update(reviewScope="Confirmed DoK usage."),
            lambda sidecar: sidecar["assets"][0]["donors"][0].update(assetId="cok/unapproved-same-pixels"),
        ]:
            sidecar = copy.deepcopy(self.sidecar)
            mutate(sidecar)
            with patch.object(visual, "read_input", side_effect=lambda name, root: (
                visual.serialize(sidecar) if name == visual.SIDECAR else self.inputs[name]
            )):
                errors, _ = validate(self.registry)
            self.assertTrue(any("sidecar differs" in error for error in errors), errors[:3])

    def test_registry_rejects_annotation_outside_slice_and_claim_or_lineage_changes(self):
        for mutate in [
            lambda data, asset: data["assets"][self.unannotated_index]["description"].update(asset["description"]),
            lambda data, asset: asset["description"].pop("visualDescription"),
            lambda data, asset: asset["description"]["evidence"].clear(),
            lambda data, asset: asset["description"].update(text="Inferred use", status="partial"),
            lambda data, asset: asset["description"]["evidence"][0].update(note="New visual inspection."),
            lambda data, asset: asset.update(decoded={}),
            lambda data, asset: asset.update(gameConsumers=[{}]),
            lambda data, asset: asset.update(animationGroupId=data["animationGroups"][0]["id"]),
            lambda data, asset: data["animationGroups"][0]["evidence"][0].update(note="Confirmed playback."),
            lambda data, asset: data["restyles"].append({}),
            lambda data, asset: data["crossVersionLinks"].append({}),
        ]:
            registry = copy.deepcopy(self.registry)
            mutate(registry, registry["assets"][self.annotated_index])
            errors, _ = validate(registry)
            self.assertTrue(any("DoK exact visual-description admission failed" in error for error in errors), errors[:3])

    def test_shuffled_review_and_census_rows_have_identical_derived_bytes(self):
        census = json.loads(self.inputs[visual.CENSUS])
        donors = json.loads(self.inputs[visual.DONOR])
        cok = json.loads(self.inputs[visual.COK_REGISTRY])
        for document, field in ((donors, "assets"), (cok, "assets"), (census, "files")):
            document[field].reverse()
        for file in census["files"]:
            file["entries"].reverse()
            for entry in file["entries"]:
                entry["children"].reverse()
        annotated, sidecar = self.derive(census=census, donor_registry=cok, donor_dataset=donors)
        self.assertEqual(visual.digest(visual.serialize(annotated)), GLYPH_REGISTRY_SHA256)
        self.assertEqual(visual.serialize(sidecar), self.inputs[visual.SIDECAR])


if __name__ == "__main__":
    unittest.main()
