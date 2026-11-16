"""Focused source-only controls for the two CoK ECL1#33 PICTURE associations."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import import_cok_ecl1_33_picture_consumers as picture


PIC = "cok/dos-ega/disk1/pic1.dax/block/41/frame/0"
BIGPIC = "cok/dos-ega/disk1/bigpic1.dax/block/115/frame/0"


class Ecl33PictureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dos = picture.ROOT / picture.DOS_FOLDER
        missing = [name for name in ("ECL1.DAX", *picture.PICTURES) if not (cls.dos / name).is_file()]
        if missing:
            raise unittest.SkipTest("local DOS archive prerequisite missing: " + ", ".join(missing))
        cls.receipt = picture.build_receipt()
        cls.census_data = (picture.ROOT / picture.CENSUS_REF).read_bytes()
        cls.census_block = picture.read_census(cls.census_data)
        cls.ecl_data = (cls.dos / "ECL1.DAX").read_bytes()
        cls.ecl, _ = picture.read_ecl(cls.ecl_data)
        cls.registry = json.loads(picture.REGISTRY.read_bytes())
        for asset in cls.registry["assets"]:
            asset["gameConsumers"] = [row for row in asset["gameConsumers"]
                                      if not row["use"].startswith(picture.OWNED)]

    def test_two_exact_sites_and_non_graphic_sentinel(self):
        self.assertEqual(self.receipt["runtimeObservations"], 0)
        self.assertEqual([(row["offset"], row["vaddr"], row["pictureId"], row["sourceAssetId"])
                          for row in self.receipt["sites"]],
                         [(568, 0x8236, 255, None), (3840, 0x8EFE, 41, PIC), (4077, 0x8FEB, 115, BIGPIC)])
        sentinel, *graphics = self.receipt["sites"]
        self.assertEqual(sentinel["classification"], "non-graphic-sentinel")
        self.assertEqual(sentinel["operand"], {"kind": "immediate", "code": 0, "value": 255})
        self.assertTrue(all(row["entries"] == ["search_location"] for row in graphics))
        self.assertTrue(all(row["classification"] == "conditional-static-source-association" for row in graphics))
        self.assertEqual(self.receipt["searchLocation"]["vaddr"], 0x81DC)
        self.assertEqual(self.receipt["ecl"]["entryIndex"], 4)
        self.assertEqual(self.receipt["ecl"]["blockSha256"],
                         "28c1f857fa76f47e919dc3a1396f6920d305862067959db3335ebd7aa718c219")
        self.assertEqual(self.receipt["sourceMap"]["order"], ["BIGPIC1.DAX", "PIC1.DAX"])
        self.assertEqual([(row["sourceAssetId"], row["entryIndex"], row["geometry"], row["pixelSha256"])
                          for row in self.receipt["sourceFrames"]], [
            (BIGPIC, 3, [304, 120, 0, 0], "29ec6a4b1ffa4c77f12616ee11a3c34a8a2c9ce4cdf236e2ad4dc54b0faf12ff"),
            (PIC, 14, [88, 88, 0, 0], "0c8db08daa99cc0f64ad33271cec98a95d1edc37760d03a22c4d3242f138701f"),
        ])

    def test_mutated_opcode_and_operands_fail_beneath_archive_pin(self):
        for offset in (568 + 2, 3840, 3840 + 2, 4077 + 2):
            with self.subTest(offset=offset):
                raw = bytearray(self.ecl)
                raw[offset] ^= 1
                with self.assertRaisesRegex(ValueError, "PICTURE offset or operand roster differs"):
                    picture.scan_sites(bytes(raw), self.census_block)
        stale_witness = copy.deepcopy(self.census_block)
        stale_witness["pictureSites"][1]["entryWitnesses"][0]["branchEdgesSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "site or path witness differs"):
            picture.scan_sites(self.ecl, stale_witness)

    def test_archive_and_census_mutation_controls(self):
        with self.assertRaisesRegex(ValueError, "Archive SHA/size differs"):
            picture.read_ecl(self.ecl_data[:-1])
        with self.assertRaisesRegex(ValueError, "census SHA-256 differs"):
            picture.read_census(self.census_data + b" ")
        bigpic = (self.dos / "BIGPIC1.DAX").read_bytes()
        with self.assertRaisesRegex(ValueError, "archive SHA-256 differs"):
            picture.read_picture("PIC1.DAX", bigpic)
        pin = picture.PICTURES["BIGPIC1.DAX"]
        for changed, message in (
            ({**pin, "toc": (*pin["toc"][:-1], 41)}, "ordered TOC differs"),
            ({**pin, "block": (115, 2, *pin["block"][2:])}, "TOC entry differs"),
            ({**pin, "block": (*pin["block"][:-1], "0" * 64)}, "raw block SHA-256 differs"),
            ({**pin, "rgbSha256": "0" * 64}, "decoded RGB SHA-256 differs"),
        ):
            with self.subTest(message=message), patch.dict(picture.PICTURES, {"BIGPIC1.DAX": changed}):
                with self.assertRaisesRegex(ValueError, message):
                    picture.read_picture("BIGPIC1.DAX", bigpic)

    def test_missing_and_ambiguous_source_candidates_fail(self):
        frames = self.receipt["sourceFrames"]
        sites = self.receipt["sites"]
        for unwanted, message in ((41, "archive/entry is missing or ambiguous"), (255, "unexpected graphic candidate")):
            with self.subTest(block=unwanted):
                archives = copy.deepcopy(self.receipt["archives"])
                archives[0]["orderedTocBlockIds"].append(unwanted)
                with self.assertRaisesRegex(ValueError, message):
                    picture.bind_sites(sites, archives, frames)
        archives = copy.deepcopy(self.receipt["archives"])
        archives[1]["orderedTocBlockIds"][14] = 40
        with self.assertRaisesRegex(ValueError, "archive/entry is missing or ambiguous"):
            picture.bind_sites(sites, archives, frames)

    def test_host_loader_and_caller_drift_fail(self):
        texts = {path: (picture.ROOT / path).read_text(encoding="utf-8") for _, path, *_ in picture.HOST}
        self.assertEqual(picture.verify_host(texts), self.receipt["hostSource"]["fragments"])
        for original, changed, role in (
            ("pictures.set(block.blockId, block.image)", "pictures.set(block.blockId + 1, block.image)", "pictureMap"),
            ("pictureId === 15 && state?.cellDialoguePresentation",
             "pictureId === 41 && state?.cellDialoguePresentation", "stepEvent"),
            ("currentArea.areaId === 32", "currentArea.areaId === 33", "area32PreloadGate"),
        ):
            with self.subTest(role=role):
                source = texts[picture.EXPLORE]
                start = next(row[2] for row in picture.HOST if row[0] == role)
                offset = source.index(start)
                mutated = source[:offset] + source[offset:].replace(original, changed, 1)
                self.assertNotEqual(mutated, source)
                with self.assertRaisesRegex(ValueError, role + ": host source fragment SHA-256 differs"):
                    picture.verify_host({**texts, picture.EXPLORE: mutated})

    def test_changed_registry_source_mapping_fails(self):
        frame = next(row for row in self.receipt["sourceFrames"] if row["sourceAssetId"] == PIC)
        original = next(row for row in self.registry["assets"] if row["id"] == PIC)
        for section, key, value, message in (
            ("archive", "name", "PIC2.DAX", "registry archive pin differs"),
            ("archive", "sha256", "0" * 64, "registry archive pin differs"),
            ("locator", "entryIndex", 13, "registry frame or TOC locator differs"),
            ("locator", "frameIndex", 1, "registry frame or TOC locator differs"),
            ("decoded", "pixelSha256", "0" * 64, "registry image pin differs"),
            ("decoded", "sha256", "0" * 64, "registry image pin differs"),
        ):
            with self.subTest(field=key):
                changed = copy.deepcopy(original)
                changed[section][key] = value
                with self.assertRaisesRegex(ValueError, message):
                    picture.verify_registry_frame(changed, frame)

    def test_metadata_preservation_and_idempotence(self):
        merged, counts = picture.merge_consumers(self.registry, self.receipt)
        self.assertEqual(counts, {"added": 2, "updated": 0, "unchanged": 0})
        again, counts = picture.merge_consumers(merged, self.receipt)
        self.assertEqual(counts, {"added": 0, "updated": 0, "unchanged": 2})
        self.assertEqual(again, merged)
        ids = set()
        for asset in merged["assets"]:
            owned = [row for row in asset["gameConsumers"] if row["use"].startswith(picture.OWNED)]
            for row in owned:
                self.assertEqual(row["status"], "partial")
                self.assertIn(picture.CLAIM_LIMIT, row["use"])
                asset["gameConsumers"].remove(row)
                ids.add(asset["id"])
        self.assertEqual(ids, {PIC, BIGPIC})
        self.assertEqual(merged, self.registry)

    def test_opt_in_write_and_stale_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            registry = Path(folder) / "registry.json"
            receipt = Path(folder) / "receipt.json"
            original = picture.json_bytes(self.registry, b"\r\n")
            registry.write_bytes(original)
            with patch.multiple(picture, REGISTRY=registry, RECEIPT=receipt), patch("builtins.print"):
                with patch.object(sys, "argv", ["importer"]):
                    self.assertEqual(picture.main(), 0)
                self.assertEqual(registry.read_bytes(), original)
                self.assertFalse(receipt.exists())
                with patch.object(sys, "argv", ["importer", "--write"]):
                    self.assertEqual(picture.main(), 0)
                    self.assertEqual(receipt.read_bytes(), picture.json_bytes(self.receipt))
                    updated = registry.read_bytes()
                    timestamps = (registry.stat().st_mtime_ns, receipt.stat().st_mtime_ns)
                    self.assertEqual(picture.main(), 0)
                    self.assertEqual((registry.stat().st_mtime_ns, receipt.stat().st_mtime_ns), timestamps)
                    receipt.write_bytes(receipt.read_bytes() + b" ")
                    with self.assertRaisesRegex(ValueError, "receipt differs from pinned derivation"):
                        picture.main()
                    self.assertEqual(registry.read_bytes(), updated)
