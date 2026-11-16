"""Focused roster, exact-pixel, ledger mapping and registry merge checks."""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "tools"))
from import_cok_dos_tiles_001_registry import (  # noqa: E402
    ARCHIVE_DEFAULT,
    LEDGER_DEFAULT,
    OUTPUT_ROOT_DEFAULT,
    SOURCE_ROOT_DEFAULT,
    decode_and_verify,
    merge_registry,
    source_id,
)


AVAILABLE = all(path.exists() for path in (ARCHIVE_DEFAULT, LEDGER_DEFAULT, SOURCE_ROOT_DEFAULT, OUTPUT_ROOT_DEFAULT))


@unittest.skipUnless(AVAILABLE, "local CoK TILES archive and checked Restyle ledger are unavailable")
class DosTiles001RegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records, cls.evidence = decode_and_verify(ARCHIVE_DEFAULT, SOURCE_ROOT_DEFAULT,
                                                       OUTPUT_ROOT_DEFAULT, LEDGER_DEFAULT)
        cls.ledger = json.loads(LEDGER_DEFAULT.read_text(encoding="utf-8"))

    def test_exact_archive_roster_and_48_source_output_mappings(self):
        self.assertEqual(len(self.records), 48)
        self.assertEqual(self.evidence["sourceCount"], 48)
        self.assertEqual(sum("block/1/tile/" in key for key in self.records), 26)
        self.assertEqual(sum("block/2/tile/" in key for key in self.records), 22)
        self.assertEqual(len({row["_restyle"]["outputs"][0]["sha256"] for row in self.records.values()}), 48)
        self.assertEqual(self.records[source_id(1, 0)]["decoded"]["width"], 24)
        self.assertEqual(self.records[source_id(2, 21)]["_restyle"]["reviewStatus"], "generated")

    def test_records_keep_unknown_prompt_description_and_consumer(self):
        for row in self.records.values():
            restyle = row["_restyle"]
            self.assertEqual(restyle["prompt"]["status"], "unknown")
            self.assertIsNone(restyle["prompt"]["inputPath"])
            self.assertIsNone(restyle["prompt"]["inputSha256"])
            self.assertEqual(restyle["reviewStatus"], "generated")
            self.assertEqual(row["description"]["status"], "unknown")
            self.assertNotIn("visualDescription", row["description"])
            self.assertEqual(row["gameConsumers"][0]["status"], "unknown")
            self.assertIsNone(row["animationGroupId"])

    def test_merge_preserves_existing_rows_and_is_idempotent(self):
        registry = {"registryVersion": 1, "assets": [{"id": "keep", "opaque": 7}],
                    "animationGroups": [], "restyles": [], "crossVersionLinks": [],
                    "appearanceSets": [{"id": "keep-appearance"}]}
        merged = merge_registry(registry, self.records)
        twice = merge_registry(merged, self.records)
        self.assertEqual(len(merged["assets"]), 49)
        self.assertEqual(len(merged["restyles"]), 48)
        self.assertEqual(merged, twice)
        self.assertEqual(merged["assets"][0], {"id": "keep", "opaque": 7})
        self.assertEqual(merged["appearanceSets"], [{"id": "keep-appearance"}])

    def test_merge_rejects_existing_source_or_output_hash_conflict(self):
        registry = {"registryVersion": 1, "assets": [], "animationGroups": [], "restyles": [],
                    "crossVersionLinks": [], "appearanceSets": []}
        asset = copy.deepcopy(self.records[source_id(1, 0)])
        restyle = asset.pop("_restyle")
        asset["archive"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "existing source identity conflicts"):
            merge_registry({**registry, "assets": [asset]}, self.records)
        restyle["outputs"][0]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "existing output hash conflicts"):
            merge_registry({**registry, "restyles": [restyle]}, self.records)

    def test_ledger_locator_mutation_is_rejected(self):
        # A temporary edited copy proves that a reordered or relabelled ledger cannot silently relink tiles.
        rows = self.ledger["outputs"]
        self.assertEqual(rows[0]["source_block"], 1)
        self.assertEqual(rows[0]["source_tile_index"], 0)
        # The checked-ledger hash pin rejects any changed bytes before using row fields.
        with tempfile.TemporaryDirectory() as directory:
            changed = copy.deepcopy(self.ledger)
            changed["outputs"][0]["source_tile_index"] = 1
            path = Path(directory) / "ledger.json"
            path.write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                decode_and_verify(ARCHIVE_DEFAULT, SOURCE_ROOT_DEFAULT, OUTPUT_ROOT_DEFAULT, path)


if __name__ == "__main__":
    unittest.main()
