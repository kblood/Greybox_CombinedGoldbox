import copy
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dok_graphics_source_census import (
    CENSUS, COMPLEX, DOS_ROOT, INVENTORY, METADATA_LIMIT, REGISTRY, ROOT, ROSTER, STRUCTURAL,
    check_roster, decode_entry, digest, generate, inventory_rows,
    scan_archive, serialize,
)
from dok_graphics_visual_descriptions import SIDECAR, build_outputs
from dok_graphics_pixel_visual_descriptions import EXTENSION, build_extension

ROSTER_DATA = json.loads(ROSTER.read_bytes())
INVENTORY_ROWS = inventory_rows((ROOT / INVENTORY).read_text(encoding="utf-8"))


def synthetic_duplicate_archive(path: Path):
    # Two entries with equal block IDs and byte-identical stored frames. Each has its own TOC ordinal.
    raw = struct.pack("<BIHHHHB8s", 1, 0, 1, 1, 0, 0, 0, bytes(8)) + b"\x01\x23\x45\x67"
    compressed = bytes([len(raw) - 1]) + raw
    header = struct.pack("<H", 18) + b"".join(
        struct.pack("<BIHH", 17, offset, len(raw), len(compressed)) for offset in (0, len(compressed)))
    data = header + compressed * 2
    path.write_bytes(data)
    return dict(path=path.name, sha256=digest(data), bytes=len(data), tocBlockIds=[17, 17])


class DokGraphicsSourceCensusTests(unittest.TestCase):
    def test_ledger_reproduces_exact_artifacts_from_all_pinned_files(self):
        if not DOS_ROOT.is_dir():
            self.skipTest("local DoK DOS source copy absent")
        docs = generate(ROSTER_DATA, INVENTORY_ROWS, DOS_ROOT.resolve())
        self.assertEqual(docs.keys(), {REGISTRY, CENSUS})
        self.assertEqual(serialize(docs[CENSUS]), CENSUS.read_bytes())
        glyph_registry, sidecar = build_outputs(docs[REGISTRY], CENSUS.read_bytes(), ROSTER.read_bytes())
        registry, transfer = build_extension(glyph_registry, sidecar, CENSUS.read_bytes(), ROSTER.read_bytes())
        sidecar_path = REGISTRY.with_name(SIDECAR)
        transfer_path = REGISTRY.with_name(EXTENSION)
        self.assertEqual(serialize(registry), REGISTRY.read_bytes())
        self.assertEqual(serialize(sidecar), sidecar_path.read_bytes())
        self.assertEqual(serialize(transfer), transfer_path.read_bytes())
        self.assertLessEqual(sum(path.stat().st_size for path in (ROSTER, REGISTRY, CENSUS, sidecar_path, transfer_path)),
                             METADATA_LIMIT)

    def test_roster_prior_asset_rows_and_prior_census_file_rows_remain_byte_identical(self):
        registry = json.loads(REGISTRY.read_bytes())
        prior = [asset for asset in registry["assets"] if COMPLEX.fullmatch(asset["archive"]["name"])]
        for asset in prior:
            asset["description"].pop("visualDescription", None)
            asset["description"]["evidence"].clear()
        files = [file for file in json.loads(CENSUS.read_bytes())["files"]
                 if COMPLEX.fullmatch(file["path"]) or STRUCTURAL.fullmatch(file["path"])]
        self.assertEqual(len(prior), 140)
        self.assertEqual(len(registry["animationGroups"]), 30)
        self.assertEqual(digest(ROSTER.read_bytes()), "3c2a2716d7f88ade66b132f4f3a2099424ef8441042e11f01e647221679c5491")
        self.assertEqual(digest(serialize(prior)), "3f64fedee98811c9f34fdb958517d2e63833ed5697de12485719b898fa8dd18f")
        self.assertEqual(digest(serialize(registry["animationGroups"])), "ec1a4ee76fae50885224eaf028728112231348ab8639e5e88a75b281e1437e92")
        self.assertEqual(digest(serialize(files)), "132e5b447cf18e1994301a1f09ed1974382385be532c6e8e92e86974bf6ecd15")

    def test_strict_source_layouts_reject_tolerated_gameplay_shapes(self):
        def framed(dim, count, stored_count):
            return struct.pack("<HHHHB8s", dim, dim // 8, 0, 0, stored_count, bytes(8)) + bytes(dim * dim // 2 * count)

        for name, ordinal, block, raw, problem in [
            ("TITLE.DAX", 3, 4, framed(8, 1, 1) + b"\x00", "standard frame"),
            ("8X8D2.DAX", 0, 3, framed(8, 255, 255), "tile array"),
            ("8X8D2.DAX", 0, 3, framed(8, 257, 255), "tile array"),
            ("8X8D2.DAX", 0, 3, framed(8, 256, 254), "tile array"),
            ("DUNGCOM.DAX", 0, 1, framed(24, 24, 25), "tile array"),
            ("DUNGCOM.DAX", 0, 1, framed(24, 25, 25) + b"\x00", "tile array"),
            ("8X8D1.DAX", 3, 204, framed(8, 2, 2), "tile array"),
            ("8X8D1.DAX", 0, 201, bytes(176 * 8), "raw font"),
            ("8X8D1.DAX", 0, 201, bytes(178 * 8), "raw font"),
            ("WALLDEF1.DAX", 0, 1, framed(8, 1, 1), "no approved"),
        ]:
            with self.subTest(name=name, ordinal=ordinal, length=len(raw)):
                assets, groups = [], []
                with self.assertRaisesRegex(ValueError, problem):
                    decode_entry(dict(path=name, sha256="0" * 64), ordinal, block, raw, assets, groups)
                self.assertEqual((assets, groups), ([], []))

    def test_inventory_and_roster_disagree_if_occurrence_or_entry_count_is_changed(self):
        data = copy.deepcopy(ROSTER_DATA)
        data["files"][0]["path"] = data["files"][1]["path"]
        with self.assertRaisesRegex(ValueError, "does not match documented occurrences"):
            check_roster(data, INVENTORY_ROWS)
        data = copy.deepcopy(ROSTER_DATA)
        data["files"][0]["tocBlockIds"].pop()
        with self.assertRaisesRegex(ValueError, "invalid archive/TOC pin"):
            check_roster(data, INVENTORY_ROWS)

    def test_same_block_and_pixels_never_collapse_distinct_toc_occurrences(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            pin = synthetic_duplicate_archive(root / "PIC1.DAX")
            assets, groups = [], []
            file = scan_archive(pin, root, assets, groups)
        self.assertEqual([entry["sameIdOccurrence"] for entry in file["entries"]], [1, 2])
        self.assertEqual([asset["locator"]["entryIndex"] for asset in assets], [0, 1])
        self.assertEqual(assets[0]["sourcePixelSha256"], assets[1]["sourcePixelSha256"])
        self.assertNotEqual(assets[0]["id"], assets[1]["id"])
        self.assertEqual(groups, [])

    def test_wrong_archive_sha_and_wrong_toc_each_abort_before_admission(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            pin = synthetic_duplicate_archive(root / "PIC1.DAX")
            assets, groups = [], []
            with self.assertRaisesRegex(ValueError, "source byte pin mismatch"):
                scan_archive({**pin, "sha256": "0" * 64}, root, assets, groups)
            with self.assertRaisesRegex(ValueError, "stored TOC pin mismatch"):
                scan_archive({**pin, "tocBlockIds": [17, 99]}, root, assets, groups)
            self.assertEqual(assets, [])
            self.assertEqual(groups, [])


if __name__ == "__main__":
    unittest.main()
