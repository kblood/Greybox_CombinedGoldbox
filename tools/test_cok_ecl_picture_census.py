"""Standard-library, source-only census/framing/control-flow and no-write checks."""
import contextlib
import copy
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_ecl_picture_census as census

scanner = census.scanner


def block(body=b"\x00", entries=None):
    return b"\x88\x13" + b"".join(struct.pack("<HH", 0x0101, offset + 0x7FFE) for offset in (entries or [22] * 5)) + body


def target(offset):
    return b"\x01" + struct.pack("<H", offset + 0x7FFE)


def archive(blocks):
    table, payload, pins = bytearray(), bytearray(), []
    for block_id, raw in blocks:
        packed = b"".join(bytes([len(raw[pos:pos+128])-1]) + raw[pos:pos+128] for pos in range(0, len(raw), 128))
        table.extend(struct.pack("<BIHH", block_id, len(payload), len(raw), len(packed)))
        payload.extend(packed); pins.append((block_id, len(raw), scanner.sha(raw)))
    data = struct.pack("<H", len(table)) + table + payload
    return bytes(data), {"sha256": scanner.sha(data), "bytes": len(data), "blocks": pins}


class ArchiveFramingTests(unittest.TestCase):
    def repin(self, data, spec):
        return {**spec, "sha256": scanner.sha(data), "bytes": len(data)}

    def test_archive_sha_and_ordered_roster_fail_closed(self):
        data, spec = archive([(1, block()), (2, block())])
        with self.assertRaisesRegex(ValueError, "Archive SHA/size"):
            census.read_archive(data + b"x", spec)
        for changed in [{**spec, "blocks": list(reversed(spec["blocks"]))}, {**spec, "blocks": spec["blocks"][:1]}]:
            with self.assertRaisesRegex(ValueError, "table"):
                census.read_archive(data, changed)

    def test_malformed_tables_ranges_and_block_pins_are_rejected(self):
        original, spec = archive([(1, block()), (2, block())])
        cases = []
        cases.append((b"\x09", "Truncated DAX header"))
        cases.append((b"\x08\x00" + b"0" * 30, "Invalid/truncated DAX table"))
        cases.append((b"\x12\x00" + b"0" * 3, "Invalid/truncated DAX table"))
        changed = bytearray(original); changed[11] = 1; cases.append((bytes(changed), "IDs differ or duplicate"))
        changed = bytearray(original); struct.pack_into("<I", changed, 3, 999999); cases.append((bytes(changed), "block range"))
        changed = bytearray(original); struct.pack_into("<I", changed, 12, 0); cases.append((bytes(changed), "ranges overlap"))
        changed = bytearray(original); struct.pack_into("<H", changed, 7, 22); cases.append((bytes(changed), "declared size"))
        for data, reason in cases:
            with self.subTest(reason=reason), self.assertRaisesRegex(ValueError, reason):
                census.read_archive(data, self.repin(data, spec))
        bad_pin = copy.deepcopy(spec); bad_pin["blocks"][0] = (1, 23, "0" * 64)
        with self.assertRaisesRegex(ValueError, "block SHA"):
            census.read_archive(original, bad_pin)

    def test_strict_rle_rejects_truncation_overflow_and_short_payload(self):
        for data, size, reason in [(b"\x02ab", 3, "Truncated"), (b"\xff", 1, "Truncated"),
                                   (b"\xfeX", 1, "exceeds"), (b"\x00X", 2, "size differs")]:
            with self.subTest(data=data), self.assertRaisesRegex(ValueError, reason):
                census.strict_rle(data, size)

    def test_bad_header_is_not_silently_an_empty_complete_block(self):
        data, spec = archive([(1, b"\x00" * 23)])
        with self.assertRaisesRegex(ValueError, "header magic"):
            census.inspect_archive("ECL1.DAX", data, spec)

    def test_missing_sources_are_explicit_not_a_zero_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(FileNotFoundError, "prerequisites missing: .*ECL1.DAX.*ECL2.DAX.*ECL3.DAX"):
                census.build_census(Path(directory))


class ConservativeControlFlowTests(unittest.TestCase):
    def ids(self, raw):
        return {site["pictureId"] for site in scanner.scan_picture_sites(raw)["pictureSites"]}

    def test_noninitial_header_and_post_exit_subroutine(self):
        raw = bytearray(block(b"\x00" * 40, [22,30,22,22,22])); raw[30:34] = b"\x0e\x00\x72\x00"
        self.assertEqual(self.ids(bytes(raw)), {114})
        raw = bytearray(block(b"\x00" * 40)); raw[22:27] = b"\x02" + target(40) + b"\x00"; raw[40:44] = b"\x0e\x00\x72\x13"
        self.assertEqual(self.ids(bytes(raw)), {114})

    def test_if_and_on_goto_have_target_and_continuation_witnesses(self):
        self.assertEqual(self.ids(block(b"\x16\x0e\x00\x01\x0e\x00\x02\x00")), {1,2})
        raw = bytearray(block(b"\x00" * 40)); raw[22:35] = b"\x25\x01\x00\x40\x00\x01" + target(50) + b"\x0e\x00\x02\x00"
        raw[50:54] = b"\x0e\x00\x01\x00"
        self.assertEqual(self.ids(bytes(raw)), {1,2})

    def test_ordinary_numeric_nonlocal_goto_keeps_continuation_and_issue(self):
        raw = block(b"\x01\x01\x00\x40\x0e\x00\x72\x00")
        report = scanner.scan_picture_sites(raw)
        self.assertEqual({site["pictureId"] for site in report["pictureSites"]}, {114})
        self.assertTrue(any(issue["reason"] == "nonlocal-target" for issue in report["issues"]))
        self.assertTrue(any(step.get("edge") == "nonlocal-GOTO-fallthrough" for path in report["pictureSites"][0]["paths"] for step in path["steps"]))
        self.assertFalse(report["complete"])

    def test_embedded_opcode_is_data_and_dynamic_picture_is_not_an_immediate_id(self):
        self.assertFalse(self.ids(block(b"\x09\x80\x03\x0e\x00\x72\x01\x00\x40\x00")))
        report = scanner.scan_picture_sites(block(b"\x0e\x01\x72\x40\x00"))
        self.assertIsNone(report["pictureSites"][0]["pictureId"])
        self.assertTrue(any(issue["reason"] == "dynamic-picture-operand" for issue in report["issues"]))

    def test_unknown_overlap_invalid_entries_and_budget_stay_explicit(self):
        cases = [(block(b"\xff"), 50000, "unknown-or-truncated-instruction"),
            (block(b"\x0e\x01"), 50000, "unknown-or-truncated-instruction"),
            (block(b"\x0e\x00\x72\x00", [22,23,22,22,22]), 50000, "overlap-mid-instruction"),
            (block(b"\x00", [1,22,22,22,22]), 50000, "invalid-header-entry"),
            (block(b"\x00"), 1, "budget-exhausted")]
        for raw, budget, reason in cases:
            report = scanner.scan_picture_sites(raw, budget)
            with self.subTest(reason=reason):
                self.assertTrue(any(issue["reason"] == reason for issue in report["issues"]))
                self.assertFalse(report["complete"])

    def test_numeric_picture_ids_remain_distinct_across_archives_without_bank_joins(self):
        data, spec = archive([(16, block(b"\x0e\x00\x72\x00"))])
        findings = [census.inspect_archive(name, data, spec) for name in ["ECL1.DAX", "ECL2.DAX"]]
        sites = [row["staticFindings"][0]["pictureSites"][0] for row in findings]
        self.assertEqual([site["pictureId"] for site in sites], [114,114])
        self.assertNotEqual(sites[0]["key"], sites[1]["key"])
        self.assertNotIn('sourceAssetId', json.dumps(findings))
        self.assertNotIn('inlineStrings', json.dumps(findings))


class PinnedCensusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Missing retail prerequisites deliberately fail, rather than earning a pass/empty count.
        cls.census = census.build_census()

    def snapshots(self):
        return {str(path): scanner.sha(path.read_bytes()) for path in [
            *(census.ROOT / "Champions of Krynn" / name for name in census.ARCHIVES), scanner.REGISTRY,
            scanner.ROOT / scanner.RECEIPT]}

    def test_inventory_and_static_findings_are_separate_and_16_baseline_survives(self):
        result = self.census
        self.assertEqual(result["inventoryCoverage"], {"archives": 3, "blocks": 22, "allPinnedInventoryInspected": True})
        self.assertEqual([len(row["inventory"]) for row in result["archives"]], [7,8,7])
        first = result["archives"][0]["staticFindings"][0]
        self.assertEqual([(site["offset"],site["pictureId"]) for site in first["pictureSites"]],
            [(76,121),(1376,114),(1651,18),(1800,121),(3004,58),(3027,58),(3036,121)])
        self.assertEqual(first["instructionCount"],435)
        self.assertFalse(result["runtimeCoverage"]["complete"])
        self.assertFalse(result["runtimeCoverage"]["measured"])
        self.assertEqual(result["runtimeCoverage"]["sourceBankJoinsAdded"],0)
        self.assertEqual(result["staticSummary"]["pictureSites"],146)
        self.assertEqual(result["staticSummary"]["dynamicPictureSites"],1)

    def test_deterministic_and_source_registry_bytes_unchanged(self):
        before = self.snapshots()
        self.assertEqual(census.build_census(), self.census)
        self.assertEqual(self.snapshots(), before)
        if census.RECEIPT.is_file():
            self.assertEqual(json.loads(census.RECEIPT.read_text(encoding="utf-8")), self.census)

    def test_receipt_writer_is_idempotent_and_never_writes_registry_or_sources(self):
        before = self.snapshots()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "metadata.json"
            with patch.object(census, "RECEIPT", output), patch.object(census, "build_census", return_value=self.census), \
                    patch.object(sys, "argv", ["cok_ecl_picture_census.py", "--write-receipt"]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(census.main(),0); first = output.read_bytes()
                self.assertEqual(census.main(),0); self.assertEqual(output.read_bytes(),first)
            self.assertEqual(list(Path(directory).iterdir()), [output])
        self.assertEqual(self.snapshots(), before)


if __name__ == "__main__":
    unittest.main()
