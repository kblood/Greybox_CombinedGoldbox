#!/usr/bin/env python3
"""Focused integrity tests for the read-only CoK graphics source census."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_graphics_source_census as census
from import_cok_dos_font_glyph_registry import glyph_rgb

ROOT = Path(__file__).resolve().parents[1]


def dax(rows: list[tuple[int, int, int, int]], payload: bytes) -> bytes:
    table_bytes = len(rows) * 9
    out = bytearray(struct.pack("<H", table_bytes))
    for block, relative, raw, stored in rows:
        out.extend(struct.pack("<BIHH", block, relative, raw, stored))
    out.extend(payload)
    return bytes(out)


def source_asset(file: dict, *, entry_index=0, frame_index=0) -> dict:
    edition = census.edition(file["sourceSet"], file["path"])
    name = Path(file["path"]).name
    return {
        "id": "cok/amiga/disk1/8x8d0.daa/block/23/frame/0",
        "game": "cok", "platform": "Amiga", "edition": edition,
        "identityStatus": "source-pinned",
        "archive": {"name": name, "path": "C:/set/" + file["path"], "sha256": file["observedSha256"]},
        "locator": {"kind": "block-frame", "blockId": 23, "entryIndex": entry_index,
                    "frameIndex": frame_index, "tileIndex": None, "cellIndex": None},
        "decoded": {"pixelSha256": hashlib.sha256(b"rgb").hexdigest()},
    }


class CensusRosterTests(unittest.TestCase):
    def test_documented_roster_counts_and_disk_occurrences(self):
        expected = census.doc_roster((ROOT / "docs/dos-inventory.md").read_text(encoding="utf-8"),
                                     (ROOT / "docs/amiga-inventory.md").read_text(encoding="utf-8"))
        dos = [(name, value) for (source, name), value in expected.items() if source == "dos-install"]
        amiga = [(name, value) for (source, name), value in expected.items() if source == "amiga-private-extraction"]
        self.assertEqual((len(dos), sum(v[1] for _, v in dos)), (31, 538))
        self.assertEqual(sum(v[0] == "structural" for _, v in dos), 3)
        self.assertEqual(sum(v[0] == "graphics" for _, v in amiga), 43)
        self.assertEqual(sum(v[0] == "structural" for _, v in amiga), 2)
        self.assertIn(("amiga-private-extraction", "disk1/pointers.daa"), expected)

    def test_roster_removal_and_same_hash_disk_copies_are_distinct(self):
        source = "amiga-private-extraction"
        expected = {(source, "disk1/PIC1.DAA"): ("graphics", 8),
                    (source, "disk2/PIC1.DAA"): ("graphics", 8)}
        row = lambda path: [path, "a" * 64, 8]
        document = {"schema": "cok-graphics-source-roster-v1", "dos-install": [], source: [
            row("disk1/PIC1.DAA"), row("disk2/PIC1.DAA")]}
        ordered = census.check_roster(document, expected)
        self.assertEqual(len(ordered), 2)
        self.assertEqual(ordered[0]["sha256"], ordered[1]["sha256"])
        with self.assertRaisesRegex(ValueError, "missing documented occurrences"):
            census.check_roster({"schema": "cok-graphics-source-roster-v1", "dos-install": [], source: [row("disk1/PIC1.DAA")]}, expected)


class StoredEntryTests(unittest.TestCase):
    def test_duplicate_block_ids_keep_both_stored_ordinals(self):
        data = dax([(7, 0, 1, 2), (7, 2, 1, 2)], b"\x00A\x00B")
        table, spans = census.entry_spans(data, "dax", 2)
        self.assertEqual(table, "dax-9")
        self.assertEqual([span[0] for span in spans], [7, 7])
        self.assertEqual([span[1] for span in spans], [20, 22])
        self.assertEqual([span[2] for span in spans], [2, 2])

    def test_truncated_or_wrong_count_dax_tables_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "dax-truncated-header"):
            census.entry_spans(b"\x09\x00", "dax", 1)
        with self.assertRaisesRegex(ValueError, "dax-entry-count-mismatch"):
            census.entry_spans(dax([(3, 0, 1, 2)], b"\x00A"), "dax", 2)

    def test_span_overlap_and_short_rle_remain_visible_at_each_ordinal(self):
        blob = dax([(9, 0, 1, 2), (9, 1, 1, 2)], b"\x00A\x00B")
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "WALLDEF1.DAX"
            path.write_bytes(blob)
            spec = {"path": path.name, "sourceSet": "dos-install", "category": "structural",
                    "sha256": census.digest(blob), "bytes": len(blob), "expectedEntries": 2}
            result = census.scan_file(spec, Path(temp))
            self.assertEqual([row["entryIndex"] for row in result["entries"]], [0, 1])
            self.assertEqual([row["sameIdOccurrence"] for row in result["entries"]], [1, 2])
            self.assertTrue(all(row["issue"] == "overlapping-stored-spans" for row in result["entries"]))

            short = dax([(9, 0, 2, 2)], b"\x00A")
            path.write_bytes(short)
            input_hash = census.digest(short)
            spec.update(sha256=census.digest(short), bytes=len(short), expectedEntries=1)
            result = census.scan_file(spec, Path(temp))
            self.assertEqual(census.digest(path.read_bytes()), input_hash)
            self.assertEqual(result["entries"][0]["issue"], "DAX decompressed size differs")
            self.assertIsNone(result["drawableCount"])


class BindingTests(unittest.TestCase):
    def file_record(self) -> dict:
        rgb_hash = hashlib.sha256(b"rgb").hexdigest()
        return {"sourceSet": "amiga-private-extraction", "path": "disk1/8X8D0.DAA",
                "sha256": "a" * 64, "observedSha256": "a" * 64, "status": "scanned",
                "drawableCount": None,
                "format": "daa-6", "entries": [{"blockId": 23, "entryIndex": 0, "drawableCount": 1,
                    "payloadSha256": "b" * 64, "children": [{"kind": "block-frame", "index": 0,
                        "candidate": False, "rgbSha256": rgb_hash, "sourceIds": []}],
                    "derived": [], "locatorSourceIds": []}], "children": [], "derived": [],
                "locatorSourceIds": []}

    def test_exact_occurrence_archive_entry_and_child_bind_once(self):
        file = self.file_record()
        asset = source_asset(file)
        original_asset = copy.deepcopy(asset)
        unresolved, _ = census.bind([file], [asset])
        self.assertEqual(asset, original_asset)
        self.assertEqual(unresolved, [])
        self.assertEqual(file["entries"][0]["children"][0]["sourceIds"], [asset["id"]])
        self.assertEqual(file["entries"][0]["locatorSourceIds"], [asset["id"]])

    def test_unresolved_bindings_distinguish_render_identity_and_edition_provenance(self):
        render_file = self.file_record()
        render_file["entries"][0]["children"][0]["candidate"] = True
        render_asset = source_asset(render_file)
        render_unresolved, _ = census.bind([render_file], [render_asset])
        self.assertEqual(render_unresolved[0]["reason"], "candidate-render")

        identity_file = self.file_record()
        identity_asset = source_asset(identity_file)
        identity_asset["identityStatus"] = "candidate"
        identity_unresolved, _ = census.bind([identity_file], [identity_asset])
        self.assertEqual(identity_unresolved[0]["reason"], "candidate-source-identity")

        provenance_file = self.file_record()
        provenance_file["path"] = "disk2/8X8D1.DAX"
        provenance_entry = provenance_file["entries"][0]
        provenance_entry.update(blockId=11, entryIndex=3)
        provenance_entry["children"][0].update(kind="tile", index=0)
        provenance_asset = source_asset(provenance_file)
        provenance_asset["id"] = "cok/amiga/disk2/8x8d1.dax/block/11/tile/0"
        provenance_asset["locator"].update(kind="tile", blockId=11, entryIndex=None,
                                             frameIndex=None, tileIndex=0)
        provenance_unresolved, _ = census.bind([provenance_file], [provenance_asset])
        self.assertEqual(provenance_unresolved[0]["reason"], "unverified-edition-provenance")
        self.assertEqual(provenance_file["entries"][0]["children"][0]["sourceIds"], [])

    def test_wrong_hash_path_ordinal_or_child_never_binds(self):
        mutations = [
            (lambda a: a["archive"].update(sha256="c" * 64), "missing-source-or-archive-pin-mismatch"),
            (lambda a: a["archive"].update(path="C:/other/PIC1.DAA"), "wrong-registry-occurrence-path"),
            (lambda a: a["locator"].update(entryIndex=1), "entry-locator-mismatch"),
            (lambda a: a["locator"].update(frameIndex=1), "child-locator-mismatch"),
            (lambda a: a.update(edition="Amiga disk 2 candidate copy"), "no-edition-occurrence-binding"),
        ]
        for mutate, reason in mutations:
            with self.subTest(reason=reason):
                file = self.file_record()
                asset = source_asset(file)
                mutate(asset)
                unresolved, _ = census.bind([file], [asset])
                self.assertEqual(len(unresolved), 1)
                self.assertEqual(unresolved[0]["reason"], reason)
                self.assertEqual(file["entries"][0]["children"][0]["sourceIds"], [])

    def test_frame_tile_and_atlas_child_kinds_do_not_alias(self):
        self.assertFalse(census.locator_matches(
            {"kind": "tile", "frameIndex": None, "tileIndex": 0, "cellIndex": None},
            {"kind": "block-frame", "index": 0}))
        self.assertFalse(census.locator_matches(
            {"kind": "atlas-cell", "frameIndex": None, "tileIndex": None, "cellIndex": 0},
            {"kind": "whole-image", "index": None}))

    def test_glyph_locator_uses_its_own_index_and_keeps_other_locator_fields_empty(self):
        stored = bytes([0b10000001, 0b01000010, 0, 0, 0, 0, 0, 0])
        self.assertEqual(census.font_glyph_rgb(stored), glyph_rgb(stored))
        loc = {"kind": "glyph", "frameIndex": None, "tileIndex": None,
               "cellIndex": None, "glyphIndex": 176}
        self.assertTrue(census.locator_matches(loc, {"kind": "glyph", "index": 176}))
        self.assertFalse(census.locator_matches(loc, {"kind": "glyph", "index": 175}))
        self.assertFalse(census.locator_matches(
            {**loc, "frameIndex": 0}, {"kind": "glyph", "index": 176}))


if __name__ == "__main__":
    unittest.main()
