"""Source-only checks for the bounded CoK opening-wall consumer import."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import import_cok_opening_wall_consumers as opening


DOS_ROOT = opening.ROOT / opening.DOS_FOLDER


def owned(consumer):
    return consumer.get("use", "").startswith(opening.OWNED_USE_PREFIX)


def by_id(registry):
    return {asset["id"]: asset for asset in registry["assets"]}


class OpeningWallSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        missing = [name for name in opening.ARCHIVES if not (DOS_ROOT / name).is_file()]
        if missing:
            raise unittest.SkipTest("optional DOS source archives missing: " + ", ".join(missing))
        cls.receipt = opening.build_receipt(DOS_ROOT)
        cls.banks = {bank["blockId"]: bank for bank in cls.receipt["banks"]}

    def tile(self, bank, index):
        return self.banks[bank]["tiles"][index]

    def test_exact_denominator_and_loaded_but_unreferenced(self):
        self.assertEqual(self.receipt["denominator"], {
            "scope": "All 156 columns of each WALLDEF slice selected by any nonzero GEO1#34 wall nibble.",
            "loadedOpeningTiles": 210,
            "referencedOpeningTiles": 159,
            "unreferencedOpeningTiles": 51,
            "excludedReferencedBootTiles": 15,
        })
        self.assertEqual(self.receipt["runtimeObservations"], 0)
        self.assertIn("Visibility and runtime use are unobserved", self.receipt["claimLimit"])
        self.assertEqual({key: (row["distinctReferencedTiles"], row["tableMatchCount"])
                          for key, row in self.banks.items()},
                         {31: (62, 505), 32: (28, 299), 23: (69, 741), 203: (15, 389)})
        self.assertEqual({key: {row["tileIndex"] for row in self.banks[key]["tiles"] if not row["matches"]}
                          for key in (31, 32, 23)}, {
            31: {30, 33, 41, 50, 65, 66, 67, 68},
            32: {0, 1, 2, 3, 4, 5, 7, 8, 10, 21, 22, 25, 26, 27, 28, 29, 39, 40,
                 44, 45, 46, 47, 48, 49, 50, 51, 52, 55, 56, 57, 58, 59, 60, 61, 62,
                 63, 64, 65, 66, 67, 68, 69},
            23: {13},
        })
        self.assertEqual([bank for bank, row in self.banks.items() if row["bootBankExcluded"]], [203])
        self.assertEqual({row["tileIndex"] for row in self.banks[203]["tiles"] if row["matches"]},
                         {0, 2, 5, 6, 7, 8, 9, 10, 13, 14, 15, 24, 26, 28, 40})

    def test_control_and_map_witnesses(self):
        control = self.receipt["eclControl"]
        self.assertEqual(control["entry"],
                         {"name": "initial_entry", "segment": 0x0101, "vaddr": 0x8014, "offset": 22})
        self.assertEqual([(site["vaddr"], site["mnemonic"]) for site in control["sites"]], [
            (0x8014, "COMPARE"), (0x801A, "IF_EQ"), (0x801B, "EXIT"), (0x801C, "SAVE"),
            (0x8022, "SAVE"), (0x8028, "LOAD_FILES"), (0x802F, "LOAD_PIECES"),
        ])
        self.assertEqual(control["geoBlockId"], 34)
        self.assertEqual(control["wallDefCalls"], [{"symbolSet": 1, "blockId": 3}, {"symbolSet": 3, "blockId": 23}])
        self.assertEqual(control["skippedOperand"], {"symbolSet": 2, "blockId": 4})
        self.assertEqual(self.receipt["unusedSlots"], [9, 10])
        self.assertEqual({row["wallSlot"]: row["edgeCount"] for row in self.receipt["mapSlots"]}, {
            1: 8, 2: 101, 3: 87, 4: 38, 5: 83, 6: 101, 7: 24, 8: 1, 11: 57, 12: 64, 13: 4, 14: 1, 15: 1,
        })
        self.assertEqual(self.receipt["openEdges"], 454)
        self.assertEqual(self.receipt["mapWitnesses"], [
            {"x": 12, "y": 12, "direction": "east", "geoOffset": 206, "wallByte": 7,
             "wallSlot": 7, "doorOffset": 974, "doorFlag": 2},
            {"x": 13, "y": 12, "direction": "west", "geoOffset": 463, "wallByte": 191,
             "wallSlot": 15, "doorOffset": 975, "doorFlag": 1},
        ])

    def test_exact_column_witnesses(self):
        witnesses = (
            (32, 6, 5, 15, 122, 122, (3, 0, 4, 624, 31, 0)),
            (31, 29, 6, 13, 75, 75, (3, 1, 0, 780, 32, 0)),
            (31, 62, 7, 50, 108, 108, (3, 1, 1, 936, 32, 0)),
            (23, 0, 11, 3, 46, 186, (23, 0, 0, 0, 23, 140)),
        )
        for bank, index, slot, column, raw, relocated, selector in witnesses:
            with self.subTest(bank=bank, index=index):
                row = next(row for row in self.receipt["selectors"] if row["wallSlot"] == slot)
                self.assertEqual(tuple(row[key] for key in ("wallDefBlockId", "recordIndex", "sliceIndex",
                                                           "blockOffset", "loadedBank", "relocation")), selector)
                self.assertIn([slot, column, raw, relocated], self.tile(bank, index)["matches"])

    def test_mutated_control_fails_even_beneath_archive_pin(self):
        original = opening.read_archive(DOS_ROOT, "ECL1.DAX")[0][34]
        for offset in (20, 24, 28, 29, 32, 38, 44, 53):
            with self.subTest(offset=offset):
                raw = bytearray(original)
                raw[offset] ^= 1
                with self.assertRaisesRegex(ValueError, "initial.entry.*pin differs"):
                    opening.decode_init(bytes(raw))

    def test_mutated_map_introducing_unused_slot_fails(self):
        raw = bytearray(opening.read_archive(DOS_ROOT, "GEO1.DAX")[0][34])
        raw[206] = (raw[206] & 0xF0) | 9
        with self.assertRaisesRegex(ValueError, "wall slot roster differs"):
            opening.decode_map(bytes(raw))

    def test_archive_hash_and_substituted_archive_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "8X8D1.DAX"
            original = (DOS_ROOT / path.name).read_bytes()
            path.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
            with self.assertRaisesRegex(ValueError, "archive SHA-256 differs"):
                opening.read_archive(path.parent, path.name)
            # WALLDEF1 is also a valid DOS DAX, but can't stand in for an 8X8D bank.
            path.write_bytes((DOS_ROOT / "WALLDEF1.DAX").read_bytes())
            with self.assertRaisesRegex(ValueError, "archive SHA-256 differs"):
                opening.read_archive(path.parent, path.name)

    def test_stale_toc_block_and_pixel_pins_fail(self):
        name = "8X8D1.DAX"
        archive_sha, toc, entries = opening.ARCHIVES[name]
        cases = (
            ((archive_sha, toc[:-1] + (31,), entries), "ordered, unique TOC"),
            ((archive_sha, toc, {**entries, 31: entries[32]}), "TOC entry differs"),
            ((archive_sha, toc, {**entries, 31: (*entries[31][:-1], "0" * 64)}), "decompressed size or SHA-256"),
        )
        for pin, message in cases:
            with self.subTest(message=message), patch.dict(opening.ARCHIVES, {name: pin}):
                with self.assertRaisesRegex(ValueError, message):
                    opening.read_archive(DOS_ROOT, name)
        banks, _ = opening.read_archive(DOS_ROOT, name)
        with self.assertRaisesRegex(ValueError, "ordered tile index or RGB SHA-256"):
            opening.decode_bank(banks[32], 31)

    def test_host_source_pins_portable_and_fail_closed(self):
        host = self.receipt["hostSource"]
        self.assertEqual(set(host["files"]), {
            f"packages/engine/src/{path}" for path in (
                "ecl/disassemble.ts", "ecl/opcodes.ts", "ecl/vm.ts", "loaders/geo.ts",
                "loaders/walldef.ts", "world/dungeon.ts", "world/dungeonWalls.ts", "world/wallpieces.ts",
            )
        })
        self.assertEqual(host["files"]["packages/engine/src/ecl/vm.ts"],
                         "d95ee6d3c1b2f7c96a5d3effcec80984957cbcf7ee6b463a3cd3824c46193562")
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for path in host["files"]:
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((opening.ROOT / path).read_bytes().replace(b"\r\n", b"\n"))
            self.assertEqual(opening.verify_host_sources(root), host["files"])
            target = root / "packages/engine/src/ecl/vm.ts"
            original = target.read_bytes()
            target.write_bytes(original.replace(b"\n", b"\r\n"))
            self.assertEqual(opening.verify_host_sources(root), host["files"])
            mutated = original.replace(b"const AREA_FIELD_1CE = 0x4be7", b"const AREA_FIELD_1CE = 0x4be6")
            self.assertNotEqual(mutated, original)
            target.write_bytes(mutated)
            with patch.object(opening, "ROOT", root), patch.object(sys, "argv", ["importer", "--write"]):
                with self.assertRaisesRegex(ValueError, "ecl/vm.ts: host source SHA-256 differs"):
                    opening.main()
            target.write_bytes((root / "packages/engine/src/ecl/opcodes.ts").read_bytes())
            with self.assertRaisesRegex(ValueError, "ecl/vm.ts: host source SHA-256 differs"):
                opening.verify_host_sources(root)


class OpeningWallRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not opening.REGISTRY.is_file():
            raise unittest.SkipTest("CoK graphics identity registry missing")
        missing = [name for name in opening.ARCHIVES if not (DOS_ROOT / name).is_file()]
        if missing:
            raise unittest.SkipTest("optional DOS source archives missing: " + ", ".join(missing))
        cls.receipt = opening.build_receipt(DOS_ROOT)
        cls.registry = json.loads(opening.REGISTRY.read_bytes())
        # Both the pre-import and idempotent post-import worktree are valid test inputs.
        for asset in cls.registry["assets"]:
            asset["gameConsumers"] = [
                consumer for consumer in asset["gameConsumers"] if not owned(consumer)
            ]

    def test_stale_registry_pins_fail(self):
        cases = (
            ("archive", "sha256", "0" * 64, "archive pin differs"),
            ("archive", "path", "somewhere/8X8D1.DAX", "archive pin differs"),
            ("locator", "entryIndex", 6, "tile or TOC locator differs"),
            ("locator", "tileIndex", 1, "tile or TOC locator differs"),
            ("locator", "blockId", 32, "tile or TOC locator differs"),
            ("decoded", "pixelSha256", "0" * 64, "native RGB pin differs"),
        )
        row = next(bank["tiles"][0] for bank in self.receipt["banks"] if bank["blockId"] == 31)
        original = by_id(self.registry)[row["sourceAssetId"]]
        for group, field, value, message in cases:
            with self.subTest(field=field):
                asset = copy.deepcopy(original)
                asset[group][field] = value
                with self.assertRaisesRegex(ValueError, message):
                    opening.verify_tile(asset, row, 31)

    def test_import_adds_only_owned_evidence_and_is_idempotent(self):
        merged, counts = opening.merge_consumers(self.registry, self.receipt)
        self.assertEqual(counts, {"added": 159, "updated": 0, "unchanged": 0})
        again, counts = opening.merge_consumers(merged, self.receipt)
        self.assertEqual(counts, {"added": 0, "updated": 0, "unchanged": 159})
        self.assertEqual(again, merged)
        receipt_sha = opening.sha256(opening.receipt_bytes(self.receipt))
        added = set()
        for asset in merged["assets"]:
            consumers = [consumer for consumer in asset["gameConsumers"] if owned(consumer)]
            if consumers:
                self.assertEqual(len(consumers), 1)
                consumer = consumers[0]
                self.assertEqual(consumer["status"], "partial")
                self.assertIn("Visibility and runtime use are unobserved", consumer["use"])
                self.assertIn(receipt_sha, consumer["evidence"][0]["note"])
                added.add(asset["id"])
                asset["gameConsumers"].remove(consumer)
        # Every field of every prior asset and top-level collection.
        self.assertEqual(merged, self.registry)
        self.assertEqual(added, {
            row["sourceAssetId"] for bank in self.receipt["banks"] for row in bank["tiles"]
            if not bank["bootBankExcluded"] and row["matches"]
        })

    def test_import_repairs_duplicate_owned_records_preserving_other_evidence(self):
        registry, _ = opening.merge_consumers(self.registry, self.receipt)
        target = by_id(registry)[opening.source_id(31, 29)]
        original = copy.deepcopy(target["gameConsumers"])
        duplicate = copy.deepcopy(original[-1])
        duplicate["status"] = "verified"
        other = {"use": "Evidence by another producer"}
        target["gameConsumers"].extend([duplicate, other])
        target["gameConsumers"][-3]["evidence"] = []
        repaired, counts = opening.merge_consumers(registry, self.receipt)
        self.assertEqual(counts, {"added": 0, "updated": 1, "unchanged": 158})
        self.assertEqual(by_id(repaired)[target["id"]]["gameConsumers"], original + [other])

    def test_existing_owned_records_outside_scope_fail_closed(self):
        for bank, index in ((31, 30), (23, 13), (203, 0)):
            with self.subTest(bank=bank, index=index):
                registry = copy.deepcopy(self.registry)
                asset = by_id(registry)[opening.source_id(bank, index)]
                asset["gameConsumers"].append({"use": opening.OWNED_USE_PREFIX + " stale evidence"})
                with self.assertRaisesRegex(ValueError, "outside the reviewed roster"):
                    opening.merge_consumers(registry, self.receipt)

    def test_read_only_and_atomic_write_are_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            registry_path, receipt_path = Path(folder) / "registry.json", Path(folder) / "receipt.json"
            original = opening.registry_bytes(self.registry, b"\r\n")
            registry_path.write_bytes(original)
            with patch.multiple(opening, REGISTRY=registry_path, RECEIPT=receipt_path), patch("builtins.print"):
                with patch.object(sys, "argv", ["importer"]):
                    self.assertEqual(opening.main(), 0)
                    self.assertEqual(registry_path.read_bytes(), original)
                    self.assertFalse(receipt_path.exists())
                    # The reviewed predecessor is eligible for an explicit write migration.
                    prior = {key: value for key, value in self.receipt.items() if key != "hostSource"}
                    prior["methodReferences"] = prior["methodReferences"] + [
                        "packages/engine/src/loaders/geo.ts",
                        "packages/engine/src/world/dungeonWalls.ts",
                        "packages/engine/src/world/wallpieces.ts",
                    ]
                    prior_data = opening.receipt_bytes(prior)
                    self.assertEqual(opening.sha256(prior_data), opening.PREVIOUS_RECEIPT_SHA)
                    receipt_path.write_bytes(prior_data)
                    with self.assertRaisesRegex(ValueError, "existing receipt differs"):
                        opening.main()
                    self.assertEqual(registry_path.read_bytes(), original)
                with patch.object(sys, "argv", ["importer", "--write"]):
                    self.assertEqual(opening.main(), 0)
                    derived = receipt_path.read_bytes()
                    self.assertLessEqual(len(derived), 160 * 1024)
                    self.assertEqual(json.loads(derived)["denominator"], self.receipt["denominator"])
                    self.assertEqual(derived, opening.receipt_bytes(self.receipt))
                    self.assertIn(b"\r\n", registry_path.read_bytes())
                    written = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in Path(folder).iterdir()}
                    self.assertEqual(set(written), {registry_path, receipt_path})
                    self.assertEqual(opening.main(), 0)
                    self.assertEqual({path: (path.read_bytes(), path.stat().st_mtime_ns)
                                      for path in Path(folder).iterdir()}, written)
                    receipt_path.write_bytes(derived.replace(b"unobserved", b"observed"))
                    with self.assertRaisesRegex(ValueError, "existing receipt differs"):
                        opening.main()
                    self.assertEqual(registry_path.read_bytes(), written[registry_path][0])
