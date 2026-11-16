from __future__ import annotations

import sys
import hashlib
import json
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_ecl_setup_monster_census as census


def ecl_block(instructions: bytes) -> bytes:
    raw = bytearray(22 + len(instructions))
    raw[:2] = b"\x88\x13"
    raw[2:6] = b"\x01\x01\x14\x80"  # vm_run_1 points to raw offset 22 at addend 0x8000.
    raw[22:] = instructions
    return bytes(raw)


class CoKEclSetupCensusTests(unittest.TestCase):
    def test_collects_only_cfg_reachable_setup_sites_and_preserves_operands(self) -> None:
        raw = ecl_block(bytes([0x0C, 0, 9, 0, 0, 0, 9, 0x00]))
        sites, receipt = census.scan_setup_sites(raw, "ECL1.DAX", 0, 16)
        self.assertEqual(len(sites), 1)
        self.assertEqual(sites[0]["offset"], 22)
        self.assertEqual([operand["value"] for operand in sites[0]["operands"]], [9, 0, 9])
        self.assertEqual([operand["kind"] for operand in sites[0]["operands"]],
                         ["immediate", "immediate", "immediate"])
        self.assertEqual([(row["operandIndex"], row["blockSelector"]) for row in sites[0]["sourceRequests"]],
                         [(0, {"status": "literal-byte", "value": 9}),
                          (2, {"status": "literal-byte", "value": 9})])
        self.assertFalse(receipt["stateLimitReached"])
        self.assertEqual(receipt["decodeHoles"], 0)

    def test_preserves_dynamic_address_coded_operands(self) -> None:
        raw = ecl_block(bytes([0x0C, 1, 0x79, 0x7F, 0, 0, 1, 0, 0x2A, 0x00]))
        sites, _receipt = census.scan_setup_sites(raw, "ECL1.DAX", 0, 16)
        self.assertEqual(len(sites), 1)
        self.assertEqual(sites[0]["operands"][0], {"kind": "dynamic", "code": 1, "value": 0x7F79})
        self.assertEqual(sites[0]["sourceRequests"][0]["blockSelector"],
                         {"status": "unresolved-dynamic", "value": None})
        self.assertIsNone(sites[0]["sourceRequests"][0]["sourceAssetId"])

    def test_source_requests_keep_operand_roles_and_never_infer_a_bank_or_frame(self) -> None:
        operands = [
            {"kind": "immediate", "code": 0, "value": 9},
            {"kind": "immediate", "code": 0, "value": 1},
            {"kind": "immediate", "code": 0, "value": 18},
        ]
        rows = census.source_request_rows(operands)
        self.assertEqual([row["selectorRef"] for row in rows], [
            "#/retailGraphicsLink/conditionalSelectors/0",
            "#/retailGraphicsLink/conditionalSelectors/1",
        ])
        self.assertEqual([row["operandIndex"] for row in rows], [0, 2])
        self.assertEqual([row["blockSelector"] for row in rows], [
            {"status": "literal-byte", "value": 9},
            {"status": "literal-byte", "value": 18},
        ])
        for row in rows:
            self.assertEqual(row["branchStatus"], "not-evaluated")
            self.assertEqual(row["resolutionStatus"], "unresolved-bank-entry-and-display-frame")
            for field in ("bankValue", "archiveName", "archiveEntryOrdinal", "displayTableIndex", "sourceAssetId"):
                self.assertIsNone(row[field])
        changed_extent = [operands[0], {"kind": "immediate", "code": 0, "value": 3}, operands[2]]
        self.assertEqual(census.source_request_rows(changed_extent), rows,
                         "SETUP_MONSTER operand 1 is not a graphics block selector")

    def test_dynamic_selector_addresses_are_not_coerced_to_block_ids(self) -> None:
        operands = [
            {"kind": "dynamic", "code": 1, "value": 0x7F79},
            {"kind": "immediate", "code": 0, "value": 0},
            {"kind": "dynamic", "code": 1, "value": 0x4C0C},
        ]
        rows = census.source_request_rows(operands)
        self.assertEqual([row["blockSelector"] for row in rows], [
            {"status": "unresolved-dynamic", "value": None},
            {"status": "unresolved-dynamic", "value": None},
        ])
        self.assertEqual([operands[row["operandIndex"]]["value"] for row in rows], [0x7F79, 0x4C0C])

    def test_source_request_contract_and_unresolved_fields_fail_closed(self) -> None:
        operands = [
            {"kind": "immediate", "code": 0, "value": 9},
            {"kind": "immediate", "code": 0, "value": 0},
            {"kind": "immediate", "code": 0, "value": 18},
        ]
        rows = census.source_request_rows(operands)
        swapped = census.conditional_selector_rules()
        swapped[0]["sourceFamily"] = "PIC"
        with self.assertRaisesRegex(ValueError, "pinned source-request contract"):
            census.source_request_rows(operands, swapped)
        mutated = json.loads(json.dumps(rows))
        mutated[0]["bankValue"] = 2
        with self.assertRaisesRegex(ValueError, "unproved resolution"):
            census.validate_source_request_rows(mutated, operands)
        mutated = json.loads(json.dumps(rows))
        mutated[1]["operandIndex"] = 1
        with self.assertRaisesRegex(ValueError, "unproved resolution"):
            census.validate_source_request_rows(mutated, operands)
        with self.assertRaisesRegex(ValueError, "unsupported selector operand"):
            census.source_request_rows([{"kind": "unknown", "value": 9}, operands[1], operands[2]])

    def test_checked_in_source_request_receipt_counts_remain_explicitly_unresolved(self) -> None:
        if not census.OUTPUT.is_file():
            self.skipTest("checked-in census receipt is unavailable")
        report = json.loads(census.OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(report["sourceRequestSchema"], census.SOURCE_REQUEST_SCHEMA)
        self.assertEqual(report["summary"]["siteCount"], 205)
        self.assertEqual(report["summary"]["siteCountsByFile"], {"ECL1.DAX": 47, "ECL2.DAX": 82, "ECL3.DAX": 76})
        self.assertEqual(report["summary"]["sourceRequests"], {
            "rowCount": 410, "literalByteSelectorCount": 384, "unresolvedDynamicSelectorCount": 26,
            "resolvedBankCount": 0, "resolvedArchiveEntryCount": 0, "resolvedDisplayFrameCount": 0,
            "resolvedCanonicalAssetCount": 0,
        })
        self.assertTrue(all(len(site["sourceRequests"]) == 2 for site in report["sites"]))

    def test_unreachable_opcode_bytes_are_not_reported_as_sites(self) -> None:
        raw = ecl_block(bytes([0x00, 0x0C, 0, 9, 0, 0, 0, 9, 0x00]))
        sites, _receipt = census.scan_setup_sites(raw, "ECL1.DAX", 0, 16)
        self.assertEqual(sites, [])

    def test_summary_keeps_each_operand_position_separate(self) -> None:
        rows = [{"file": "ECL1.DAX", "operands": [
            {"kind": "immediate", "code": 0, "value": 9},
            {"kind": "immediate", "code": 0, "value": 0},
            {"kind": "immediate", "code": 0, "value": 9},
        ]}]
        summary = census.summarize(rows)
        self.assertEqual(summary["siteCountsByFile"], {"ECL1.DAX": 1})
        self.assertEqual([row["immediateValueCounts"] for row in summary["operands"]],
                         [{"9": 1}, {"0": 1}, {"9": 1}])

    def test_retail_dispatch_and_handler_pins_fail_closed(self) -> None:
        handler = bytearray([0x90] * census.HANDLER_LENGTH)
        handler[6:8] = b"\xb0\x03"
        raw = bytearray(max(census.HANDLER_OFFSET + census.HANDLER_LENGTH,
                             census.DISPATCH_OFFSET + len(census.DISPATCH_BYTES)))
        raw[census.DISPATCH_OFFSET:census.DISPATCH_OFFSET + len(census.DISPATCH_BYTES)] = census.DISPATCH_BYTES
        raw[census.HANDLER_OFFSET:census.HANDLER_OFFSET + len(handler)] = handler
        data = bytes(raw)
        evidence = census.retail_handler_evidence_for_bytes(
            data,
            expected_game_sha256=hashlib.sha256(data).hexdigest(),
            expected_handler_sha256=hashlib.sha256(handler).hexdigest(),
        )
        self.assertEqual(evidence["dispatcher"]["opcode"], 0x0C)
        self.assertEqual(evidence["handler"]["operandCount"], 3)

        changed = bytearray(data)
        changed[census.DISPATCH_OFFSET] ^= 0x01
        with self.assertRaisesRegex(ValueError, "dispatcher bytes"):
            census.retail_handler_evidence_for_bytes(
                bytes(changed), expected_game_sha256=hashlib.sha256(changed).hexdigest(),
                expected_handler_sha256=hashlib.sha256(handler).hexdigest(),
            )

    def test_retail_handler_requires_the_pinned_three_operand_prefetch(self) -> None:
        handler = bytearray([0x90] * census.HANDLER_LENGTH)
        handler[6:8] = b"\xb0\x02"
        raw = bytearray(max(census.HANDLER_OFFSET + census.HANDLER_LENGTH,
                             census.DISPATCH_OFFSET + len(census.DISPATCH_BYTES)))
        raw[census.DISPATCH_OFFSET:census.DISPATCH_OFFSET + len(census.DISPATCH_BYTES)] = census.DISPATCH_BYTES
        raw[census.HANDLER_OFFSET:census.HANDLER_OFFSET + len(handler)] = handler
        data = bytes(raw)
        with self.assertRaisesRegex(ValueError, "three operands"):
            census.retail_handler_evidence_for_bytes(
                data, expected_game_sha256=hashlib.sha256(data).hexdigest(),
                expected_handler_sha256=hashlib.sha256(handler).hexdigest(),
            )

    def test_source_span_pin_rejects_mutation_even_when_file_hash_is_recomputed(self) -> None:
        data = bytearray(b"prefix-evidence-suffix")
        expected = hashlib.sha256(b"evidence").hexdigest()
        self.assertEqual(census.verify_span_pins(bytes(data), {"span": (7, 8, expected)}, "fixture"), [
            {"name": "span", "offset": 7, "length": 8, "sha256": expected},
        ])
        data[8] ^= 1
        with self.assertRaisesRegex(ValueError, "fixture span span"):
            census.verify_span_pins(bytes(data), {"span": (7, 8, expected)}, "fixture")

    @unittest.skipUnless(census.GAME_OVR.is_file() and census.START_EXE.is_file(),
                         "local pinned CoK source binaries are not available")
    def test_pinned_retail_path_maps_operands_to_conditional_sprit_and_pic(self) -> None:
        evidence = census.retail_graphics_link_evidence()
        self.assertEqual(evidence["overlayMapping"]["gameOvrBase"], 0x8A41)
        self.assertEqual([row["stem"] for row in evidence["overlayMapping"]["strings"]], ["SPRIT", "PIC"])
        self.assertEqual(
            [(row["sourceFamily"], row["setupMonsterOperand"], row["mode"])
             for row in evidence["conditionalSelectors"]],
            [("SPRIT", 0, 1), ("PIC", 2, 0)],
        )
        self.assertEqual(evidence["displaySelection"]["validTableIndices"], [1, 2, 3])
        self.assertEqual(evidence["bankSuffixLifecycle"]["initializationOffsets"], [0x10627, 0x10A5F])
        self.assertEqual(evidence["bankSuffixLifecycle"]["areaRecordOffset"], 0x624)
        self.assertTrue(any("not resolved per ECL site" in note for note in evidence["limitations"]))
        self.assertTrue(any("not classified as temporal animation" in note for note in evidence["limitations"]))


if __name__ == "__main__":
    unittest.main()
