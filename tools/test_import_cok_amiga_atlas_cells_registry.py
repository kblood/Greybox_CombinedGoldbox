"""Independent pixel goldens, negative controls and source-only atlas registry checks."""

from __future__ import annotations

import copy
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import amiga_cokdok_render as reference  # noqa: E402
import graphics_asset_registry  # noqa: E402
import import_cok_amiga_atlas_cells_registry as importer  # noqa: E402

AVAILABLE = all((importer.AMIGA_DEFAULT / f"disk{disk}" / name).is_file()
                for disk in (1, 2, 3) for name in importer.ATLAS_PINS)


def synthetic_ilbm(compressed=False, header_changes=None, body_override=None):
    # Explicit plane-separated bytes: at x=0 only the fifth plane is set;
    # at x=1 only color plane zero is set; x=2 is opaque index-zero black.
    planar = bytearray(40000)
    planar[4 * 40] = 0x80
    planar[0] = 0x40
    body = bytes(planar)
    if compressed:
        # Literal packets plus a ByteRun1 no-op; independent of importer code.
        body = b"\x80" + b"".join(bytes((len(body[p:p + 128]) - 1,)) + body[p:p + 128]
                                  for p in range(0, len(body), 128))
    if body_override is not None:
        body = body_override
    header = bytearray(struct.pack(">HHhhBBBBHBBhh", 320, 200, 0, 0, 5, 0, int(compressed), 0, 0, 1, 1, 320, 200))
    for index, value in (header_changes or {}).items():
        header[index] = value
    chunks = []
    for name, data in ((b"BMHD", bytes(header)), (b"CMAP", bytes(96)), (b"BODY", body)):
        chunks.append(name + struct.pack(">I", len(data)) + data + (b"\0" if len(data) & 1 else b""))
    payload = b"ILBM" + b"".join(chunks)
    return b"FORM" + struct.pack(">I", len(payload)) + payload


class AtlasSyntheticTests(unittest.TestCase):
    def test_independent_fifth_plane_opaque_black_and_byterun(self):
        for compressed in (False, True):
            indices = importer.decode_five_planes(synthetic_ilbm(compressed))
            self.assertEqual(indices[:3], bytes((16, 1, 0)))
            raw, colors, mask = importer.extract_cell(indices, 1)
            self.assertEqual(raw[:3], bytes((16, 1, 0)))
            self.assertEqual(colors[:3], bytes((0, 1, 0)))
            self.assertEqual(mask[:3], bytes((0, 1, 1)))
            self.assertEqual(sum(mask), 575)
            self.assertNotEqual(mask, bytes(value != 0 for value in raw))
            self.assertNotEqual(mask, bytes(value != 0 for value in colors))

    def test_one_based_geometry_and_rejected_inputs(self):
        self.assertEqual([importer.cell_origin(n) for n in (1, 12, 13, 32, 67, 96)],
                         [(0, 0), (264, 0), (0, 24), (168, 48), (144, 120), (264, 168)])
        for cell in (0, -1, 97, True, 1.5):
            with self.assertRaises(ValueError):
                importer.cell_origin(cell)
        with self.assertRaisesRegex(ValueError, "complete five-bit"):
            importer.extract_cell(bytes(576), 1)
        for changes in ({1: 0}, {8: 4}, {9: 1}, {10: 2}):
            with self.assertRaisesRegex(ValueError, "five image planes"):
                importer.decode_five_planes(synthetic_ilbm(header_changes=changes))

    def test_fail_closed_malformed_body_and_unpinned_tail(self):
        data = synthetic_ilbm()
        for invalid in (data + bytes(1244), data[:-1]):
            with self.assertRaisesRegex(ValueError, "FORM extent"):
                importer.decode_five_planes(invalid)
        for body, reason in ((b"\x01\x00", "truncated"), (b"\x00\x00", "BODY extent"),
                             (b"\x81\x00" * 313, "overflow")):
            with self.assertRaisesRegex(ValueError, reason):
                importer.decode_five_planes(synthetic_ilbm(True, body_override=body))


@unittest.skipUnless(AVAILABLE, "six private Amiga atlas fixtures are unavailable")
class AtlasArchiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records, cls.receipt = importer.decode_sources(importer.AMIGA_DEFAULT)

    def test_all_eighteen_cells_against_independent_numpy_decoder_and_historical_pins(self):
        self.assertEqual(len(self.records), 18)
        for disk in (1, 2, 3):
            for filename, (archive_hash, index_hash) in importer.ATLAS_PINS.items():
                data = (importer.AMIGA_DEFAULT / f"disk{disk}" / filename).read_bytes()
                self.assertEqual(importer.sha256(data), archive_hash)
                decoded = reference.decode_ilbm(data)
                self.assertTrue(decoded["body_ok"])
                self.assertEqual((decoded["planes"], decoded["masking"]), (5, 0))
                expected_palette = bytes(channel for color in decoded["palette"][:16] for channel in color)
                self.assertEqual(importer.decode_cmap(data), expected_palette)
                self.assertEqual(importer.sha256(decoded["indices"].tobytes()), index_hash)
                actual = importer.decode_five_planes(data)
                self.assertEqual(actual, decoded["indices"].tobytes())
                # Explicit coordinates independently fixed by the source contract.
                for cell, (x, y) in {1: (0, 0), 32: (168, 48), 67: (144, 120)}.items():
                    expected = decoded["indices"][y:y + 24, x:x + 24]
                    raw, colors, mask = importer.extract_cell(actual, cell)
                    self.assertEqual(raw, expected.tobytes())
                    self.assertEqual(colors, np.bitwise_and(expected, 15).tobytes())
                    self.assertEqual(mask, (expected < 16).astype(np.uint8).tobytes())
                    rgba = importer.render_cell_rgba(colors, mask, expected_palette)
                    self.assertEqual(importer.sha256(rgba), importer.sha256(
                        b"".join(bytes((*decoded["palette"][int(color)], 255 if opacity else 0))
                                 for color, opacity in zip(colors, mask))))
                    if filename == "charT.LBM":
                        self.assertEqual((importer.sha256(raw), importer.sha256(mask), sum(mask)), importer.CHART_PINS[cell])
        # No generic tolerance for the charS malformed FORM tail.
        data = bytearray((importer.AMIGA_DEFAULT / "disk1/charS.LBM").read_bytes())
        self.assertEqual((len(data), struct.unpack_from(">I", data, 4)[0] + 8), (16504, 15260))
        data[-1] ^= 1
        with self.assertRaisesRegex(ValueError, "FORM extent"):
            importer.decode_five_planes(bytes(data))

    def test_hash_wrong_selector_wrong_mask_and_fifth_plane_negatives(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "disk1").mkdir()
            (root / "disk1/charS.LBM").write_bytes(b"wrong archive")
            with self.assertRaisesRegex(ValueError, "source LBM hash"):
                importer.decode_sources(root)
        original_extract = importer.extract_cell
        with patch.object(importer, "extract_cell", side_effect=lambda indices, cell: original_extract(indices, 32 if cell == 1 else cell)):
            with self.assertRaisesRegex(ValueError, "historical raw-index/mask/count"):
                importer.decode_sources(importer.AMIGA_DEFAULT)
        def wrong_mask(indices, cell):
            raw, colors, _mask = original_extract(indices, cell)
            return raw, colors, bytes(value != 0 for value in colors)
        with patch.object(importer, "extract_cell", side_effect=wrong_mask):
            with self.assertRaisesRegex(ValueError, "historical raw-index/mask/count"):
                importer.decode_sources(importer.AMIGA_DEFAULT)
        original_decode = importer.decode_five_planes
        with patch.object(importer, "decode_five_planes", side_effect=lambda data: bytes(value & 15 for value in original_decode(data))):
            with self.assertRaisesRegex(ValueError, "complete five-plane indices"):
                importer.decode_sources(importer.AMIGA_DEFAULT)

    @unittest.skipUnless(importer.REGISTRY_DEFAULT.is_file(), "source registry unavailable")
    def test_merge_preserves_whole_images_unrelated_records_and_exact_disk_locators(self):
        registry = json.loads(importer.REGISTRY_DEFAULT.read_text(encoding="utf-8"))
        before = copy.deepcopy(registry)
        dataset = json.loads(importer.VISUAL_DESCRIPTIONS_DEFAULT.read_text(encoding="utf-8"))
        records, visuals = importer.apply_visual_descriptions(self.records, self.receipt, dataset,
                                                              importer.VISUAL_DESCRIPTIONS_DEFAULT)
        self.assertEqual(visuals, {"rows": 18, "uniquePixelGroups": 6})
        merged, _added = importer.merge_registry(registry, records, self.receipt)
        self.assertEqual(registry, before)
        by_id = {asset["id"]: asset for asset in merged["assets"]}
        for old in registry["assets"]:
            if old["id"] in records:
                self.assertEqual(by_id[old["id"]]["decoded"], None)
                self.assertEqual(by_id[old["id"]]["description"]["visualDescription"],
                                 records[old["id"]]["description"]["visualDescription"])
                old_copy = copy.deepcopy(old)
                new_copy = copy.deepcopy(by_id[old["id"]])
                old_copy["description"] = new_copy["description"]
                self.assertEqual(old_copy, new_copy)
            else:
                self.assertEqual(by_id[old["id"]], old)
        for name in ("restyles", "animationGroups", "appearanceSets"):
            self.assertEqual(merged.get(name), registry.get(name))
        for record in records.values():
            self.assertEqual(record["locator"]["kind"], "atlas-cell")
            self.assertIsNone(record["decoded"])
            self.assertIsNone(record["animationGroupId"])
            self.assertNotIn("galleryReferences", record)
        cell_links = [link for link in merged["crossVersionLinks"] if link["fromAssetId"] in records or link["toAssetId"] in records]
        self.assertEqual(len(cell_links), 18)
        for link in cell_links:
            first, second = (records[link[key]] for key in ("fromAssetId", "toAssetId"))
            self.assertNotEqual(first["archive"]["path"], second["archive"]["path"])
            self.assertEqual(first["archive"]["sha256"], second["archive"]["sha256"])
            self.assertEqual(first["locator"], second["locator"])
        again, added_again = importer.merge_registry(merged, records, self.receipt)
        self.assertEqual(again, merged)
        self.assertEqual(added_again, 0)
        errors, _warnings = graphics_asset_registry.validate(merged)
        self.assertEqual(errors, [])
        conflict = copy.deepcopy(merged)
        next(asset for asset in conflict["assets"] if asset["id"] in records)["locator"]["cellIndex"] = 2
        with self.assertRaisesRegex(ValueError, "atlas-cell record conflicts"):
            importer.merge_registry(conflict, records, self.receipt)
        parent_conflict = copy.deepcopy(registry)
        next(asset for asset in parent_conflict["assets"] if asset["id"] == importer.source_id(1, "charS.LBM"))["archive"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "whole-image parent"):
            importer.merge_registry(parent_conflict, records, self.receipt)

    def test_visual_dataset_rejects_incomplete_or_changed_evidence(self):
        dataset = json.loads(importer.VISUAL_DESCRIPTIONS_DEFAULT.read_text(encoding="utf-8"))
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            importer.apply_visual_descriptions(self.records, self.receipt,
                {"version": 1, "assets": dataset["assets"][:-1]}, importer.VISUAL_DESCRIPTIONS_DEFAULT)
        for field in ("archiveSha256", "rawIndexSha256", "colorIndexSha256", "opaqueMaskSha256",
                      "paletteRgbSha256", "renderedRgbaSha256"):
            changed = copy.deepcopy(dataset)
            changed["assets"][0][field] = "0" * 64
            with self.assertRaisesRegex(ValueError, field):
                importer.apply_visual_descriptions(self.records, self.receipt, changed,
                    importer.VISUAL_DESCRIPTIONS_DEFAULT)
        changed = copy.deepcopy(dataset)
        changed["assets"][0]["evidence"][0]["reference"] += "-wrong"
        with self.assertRaisesRegex(ValueError, "cite exact archive cell"):
            importer.apply_visual_descriptions(self.records, self.receipt, changed,
                importer.VISUAL_DESCRIPTIONS_DEFAULT)

    def test_pixel_identical_disk_cells_must_reuse_the_same_wording(self):
        dataset = json.loads(importer.VISUAL_DESCRIPTIONS_DEFAULT.read_text(encoding="utf-8"))
        changed = copy.deepcopy(dataset)
        first = changed["assets"][0]
        duplicate = next(row for row in changed["assets"][1:]
                         if row["cellIndex"] == first["cellIndex"]
                         and row["archiveSha256"] == first["archiveSha256"])
        duplicate["visualDescription"] = "A different visible description."
        with self.assertRaisesRegex(ValueError, "conflicting visual wording"):
            importer.apply_visual_descriptions(self.records, self.receipt, changed,
                importer.VISUAL_DESCRIPTIONS_DEFAULT)

    @unittest.skipUnless(importer.REGISTRY_DEFAULT.is_file(), "source registry unavailable")
    def test_cli_default_does_not_write_registry_or_source_files(self):
        paths = [importer.AMIGA_DEFAULT / f"disk{disk}" / name for disk in (1, 2, 3) for name in importer.ATLAS_PINS]
        paths += [importer.AMIGA_DEFAULT / f"disk{disk}" for disk in (1, 2, 3)]
        paths += [importer.AMIGA_DEFAULT, importer.REGISTRY_DEFAULT, importer.VISUAL_DESCRIPTIONS_DEFAULT]
        def snapshot():
            return [(path.stat().st_size, path.stat().st_mtime_ns,
                     importer.sha256(path.read_bytes()) if path.is_file() else None) for path in paths]
        before = snapshot()
        result = subprocess.run([sys.executable, str(ROOT / "tools/import_cok_amiga_atlas_cells_registry.py")],
                                cwd=ROOT, capture_output=True, text=True, check=True)
        report = json.loads(result.stdout)
        self.assertEqual(report["verifiedAtlasCells"], 18)
        self.assertEqual(report["visualDescriptionRows"], 18)
        self.assertEqual(report["visualDescriptionUniqueGroups"], 6)
        self.assertFalse(report["write"])
        self.assertEqual(before, snapshot())


if __name__ == "__main__":
    unittest.main()
