"""Focused source-only controls for the CoK ECL2#49 CPIC join."""

import copy
import io
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import import_cok_ecl2_49_cpic_consumers as join


class Ecl249CpicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dos = join.ROOT / join.DOS_FOLDER
        cls.preview = join.ROOT / join.PREVIEW_REF
        required = [cls.dos / name for name in join.ARCHIVES] + [
            cls.preview / "images" / f"{png}.png" for _pixel, png in join.FRAMES.values()
        ]
        if missing := [str(path) for path in required if not path.is_file()]:
            raise unittest.SkipTest("local DOS archive or source preview missing: " + ", ".join(missing))
        cls.receipt = join.build_receipt()
        cls.blocks = {name: join.read_archive(name, (cls.dos / name).read_bytes())[0] for name in join.ARCHIVES}
        cls.registry = json.loads(join.REGISTRY.read_bytes())
        for asset in cls.registry["assets"]:
            asset["gameConsumers"] = [row for row in asset["gameConsumers"]
                                      if not row["use"].startswith(join.NATURAL_ROUTE_USE_PREFIX)]

    def test_exact_route_and_source_roster(self):
        receipt = self.receipt
        self.assertEqual(receipt["runtimeObservations"], 0)
        self.assertEqual(receipt["geo"], {
            "spawn": [6, 9, "north"], "target": [6, 10, "south"], "descriptorByteOffset": 680,
            "descriptor": 0x9C, "selectorMask": 63, "selector": 28, "actions": ["right", "right", "forward"],
            "directedEdge": {"direction": "south", "wall": 0, "door": 0},
        })
        self.assertEqual(receipt["ecl"]["candidate"]["combat_offset"], 4642)
        self.assertEqual(receipt["ecl"]["candidate"]["combat_vaddr"], 0x9220)
        self.assertEqual(receipt["ecl"]["candidate"]["entry"], "search_location")
        self.assertTrue(receipt["ecl"]["candidate"]["requires_runtime_seed"])
        self.assertEqual(receipt["ecl"]["scan"]["truncated_offsets"], 0)
        self.assertFalse(receipt["ecl"]["scan"]["state_limit_reached"])
        self.assertEqual(receipt["ecl"]["consumedBit"]["writeVaddr"], 0x916F)
        self.assertEqual([(g["monsterId"], g["recordName"], g["count"], g["pictureId"])
                          for g in receipt["roster"]], [(1, "BAAZ", 5, 1), (14, "KAPAK", 4, 14)])
        self.assertEqual([b["entryIndex"] for b in receipt["archives"]["MON2CHA.DAX"]["blocks"]], [0, 6])
        self.assertEqual([b["entryIndex"] for b in receipt["archives"]["CPIC2.DAX"]["blocks"]], [1, 19])
        self.assertEqual(receipt["tacticalSourceBinding"]["byCombatantSlot"],
                         {f"e{index}": 1 if index < 5 else 14 for index in range(9)})
        self.assertTrue(all(g["nativeGeometry"] == [24, 24, 0, 0] and g["preview"]["nearestScale"] == 4
                            for g in receipt["roster"]))

    def test_mutated_guard_dispatch_roster_and_geo_are_rejected(self):
        raw = self.blocks["ECL2.DAX"][49]
        for address, byte, message in (
            (0x916A, 0, "instruction/operand pin differs"), (0x916F, 2, "instruction/operand pin differs"),
            (0x9219, 6, "instruction/operand pin differs"), (0x9220, 0, "instruction/operand pin differs"),
            (0x8229, 7 + 28 * 3, "selector-28 dispatch pin differs"),
        ):
            with self.subTest(address=address):
                changed = bytearray(raw)
                changed[address - 0x7FFE + byte] ^= 1
                with self.assertRaisesRegex(ValueError, message):
                    join.ecl_route(bytes(changed))
        geo = bytearray(self.blocks["GEO2.DAX"][49])
        geo[680] = 0x9D
        with self.assertRaisesRegex(ValueError, "selector-28 cell differs"):
            join.geo_route(bytes(geo))

    def test_archive_and_preview_fail_closed(self):
        source = (self.dos / "CPIC2.DAX").read_bytes()
        with self.assertRaisesRegex(ValueError, "archive SHA-256 differs"):
            join.read_archive("CPIC2.DAX", (self.dos / "MON2CHA.DAX").read_bytes())
        archive_sha, toc, entries = join.ARCHIVES["CPIC2.DAX"]
        for stale, message in (
            ((archive_sha, (*toc[:-1], 1), entries), "ordered TOC differs"),
            ((archive_sha, toc, (entries[1], (14, 1, *entries[1][2:]))), "TOC entry differs"),
            ((archive_sha, toc, ((*entries[0][:-1], "0" * 64), entries[1])), "raw block SHA-256 differs"),
        ):
            with self.subTest(message=message), patch.dict(join.ARCHIVES, {"CPIC2.DAX": stale}):
                with self.assertRaisesRegex(ValueError, message):
                    join.read_archive("CPIC2.DAX", source)
        with self.assertRaisesRegex(ValueError, "native RGB SHA-256 differs"):
            join.cpic_frame(self.blocks["CPIC2.DAX"][14], 1, self.preview)
        first, second = self.receipt["roster"]
        preview = (self.preview / second["preview"]["path"]).read_bytes()
        with self.assertRaisesRegex(ValueError, "preview SHA-256 differs"):
            join.verify_preview(preview, bytes(24 * 24 * 3), first["preview"]["sha256"])
        with self.assertRaisesRegex(ValueError, "pixels differ"):
            join.verify_preview(preview, bytes(24 * 24 * 3), second["preview"]["sha256"])
        buffer = io.BytesIO()
        Image.new("RGB", (24, 24)).save(buffer, format="PNG")
        with self.assertRaisesRegex(ValueError, "96x96 PNG"):
            join.verify_preview(buffer.getvalue(), bytes(24 * 24 * 3), join.sha256(buffer.getvalue()))

    def test_host_and_golden_drift_is_rejected(self):
        texts = {path: (join.ROOT / path).read_text(encoding="utf-8") for _, path, *_ in join.HOST}
        for role, before, after in (("activeDisk", "currentArea?.disk", "currentArea?.areaId"),
                                    ("engineGolden", "picBlockId: 14", "picBlockId: 15"),
                                    ("browserTest", "icons.length !== 9", "icons.length !== 8")):
            with self.subTest(role=role):
                path, start = next((row[1], row[2]) for row in join.HOST if row[0] == role)
                source = texts[path]
                begin = source.index(start)
                changed = source[:begin] + source[begin:].replace(before, after, 1)
                self.assertNotEqual(changed, source)
                with self.assertRaisesRegex(ValueError, role + ": host source SHA-256 differs"):
                    join.verify_host({**texts, path: changed})

    def test_registry_patch_and_idempotence(self):
        merged, counts = join.merge_consumers(self.registry, self.receipt)
        self.assertEqual(counts, {"added": 2, "updated": 0, "unchanged": 0})
        again, counts = join.merge_consumers(merged, self.receipt)
        self.assertEqual(counts, {"added": 0, "updated": 0, "unchanged": 2})
        self.assertEqual(again, merged)
        expected = copy.deepcopy(self.registry)
        changed_ids = set()
        for prior, asset in zip(expected["assets"], merged["assets"], strict=True):
            owned = [row for row in asset["gameConsumers"] if row["use"].startswith(join.NATURAL_ROUTE_USE_PREFIX)]
            if not owned:
                continue
            changed_ids.add(asset["id"])
            self.assertEqual(len(owned), 1)
            self.assertEqual(owned[0]["status"], "partial")
            self.assertIn(join.CLAIM_LIMIT, owned[0]["use"])
            asset["gameConsumers"].remove(owned[0])
            self.assertEqual(re.findall(join.SITE_PATTERN, prior["gameConsumers"][0]["use"]),
                             re.findall(join.SITE_PATTERN, asset["gameConsumers"][0]["use"]))
            join.correct_ecl2_49_seed_claim(prior)
        self.assertEqual(changed_ids, join.NATURAL_CPIC_IDS)
        self.assertEqual(merged, expected)

    def test_wrong_registry_bank_preview_and_locator_fail(self):
        group = self.receipt["roster"][0]
        original = next(asset for asset in self.registry["assets"] if asset["id"] == group["sourceAssetId"])
        for key, field, value in (("archive", "sha256", "0" * 64), ("locator", "entryIndex", 19),
                                  ("decoded", "sha256", self.receipt["roster"][1]["preview"]["sha256"])):
            with self.subTest(field=field):
                asset = copy.deepcopy(original)
                asset[key][field] = value
                with self.assertRaisesRegex(ValueError, "canonical CPIC"):
                    join.verify_registry_asset(asset, group)

    def test_read_only_default_and_stale_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry, receipt = Path(tmp) / "registry.json", Path(tmp) / "receipt.json"
            original = join.json_bytes(self.registry, b"\r\n")
            registry.write_bytes(original)
            with patch.multiple(join, REGISTRY=registry, RECEIPT=receipt), patch("builtins.print"):
                with patch.object(sys, "argv", ["importer"]):
                    self.assertEqual(join.main(), 0)
                self.assertFalse(receipt.exists())
                self.assertEqual(registry.read_bytes(), original)
                with patch.object(sys, "argv", ["importer", "--write"]):
                    self.assertEqual(join.main(), 0)
                    self.assertEqual(receipt.read_bytes(), join.json_bytes(self.receipt))
                    written = registry.read_bytes()
                    timestamp = registry.stat().st_mtime_ns
                    self.assertEqual(join.main(), 0)
                    self.assertEqual(registry.stat().st_mtime_ns, timestamp)
                    receipt.write_bytes(receipt.read_bytes() + b" ")
                    with self.assertRaisesRegex(ValueError, "receipt differs from pinned derivation"):
                        join.main()
                    self.assertEqual(registry.read_bytes(), written)
