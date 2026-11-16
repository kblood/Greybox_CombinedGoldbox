"""Portable synthetic controls for the bounded SPRIT1 native-entry parser."""

from __future__ import annotations

import struct
import sys
import unittest
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cok_amiga_sprit1_native_audit import parse_native_entry, sha256, strict_amiga_rle_exact


def _rle_literal(data: bytes) -> bytes:
    out = bytearray()
    for start in range(0, len(data), 128):
        chunk = data[start:start + 128]
        out.append(len(chunk) - 1)
        out.extend(chunk)
    return bytes(out)


def _rle_repeat(data: bytes) -> bytes:
    if len(set(data)) > 1:
        raise ValueError("synthetic repeat data must contain one byte value")
    out = bytearray()
    remaining = len(data)
    while remaining:
        count = min(128, remaining)
        out.extend((257 - count, data[0]))
        remaining -= count
    return bytes(out)


def _synthetic_entry() -> bytes:
    header = bytearray(86)
    struct.pack_into(">HH", header, 0, 88, 11)
    header[9] = 3
    lengths = [len(_rle_repeat(bytes([i]) * 5280)) for i in range(3)]
    struct.pack_into(">3H", header, 74, *lengths)
    header_comp = _rle_literal(bytes(header))
    entry = bytearray(struct.pack(">H", len(header_comp)) + header_comp)
    for index in range(3):
        entry.extend(_rle_repeat(bytes([index + 1]) * 5280))
        entry.extend(b"\0\0")
    return bytes(entry)


class NativeSpritEntryTests(unittest.TestCase):
    def test_checked_in_receipt_and_schema_cover_both_archives(self):
        research = Path(__file__).resolve().parents[1] / "docs/engine/research"
        receipt_path = research / "cok-amiga-sprit-native-audit-v1.json"
        schema_path = research / "cok-amiga-sprit-native-audit-v1.schema.json"
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(receipt["schema"], schema["properties"]["schema"]["const"])
        self.assertEqual(set(receipt), set(schema["required"]))
        self.assertEqual(receipt["inputs"]["auditScriptSha256"],
                         sha256(Path(__file__).with_name("cok_amiga_sprit1_native_audit.py").read_bytes()))
        self.assertEqual([archive["name"] for archive in receipt["archives"]], ["SPRIT1.DAA", "SPRIT2.DAA"])
        blocks = [block for archive in receipt["archives"] for block in archive["blocks"]]
        self.assertEqual(len(blocks), 34)
        self.assertEqual(sum(len(block["frames"]) for block in blocks), 102)
        self.assertTrue(all(block["entryBytes"] == block["entryConsumedBytes"] for block in blocks))
        self.assertEqual(receipt["interpretation"]["temporalAnimationSemantics"], "unknown")

    def test_exact_decoder_rejects_truncation_budget_overrun_and_underfill(self):
        self.assertEqual(strict_amiga_rle_exact(b"\x02abc", 3), b"abc")
        self.assertEqual(strict_amiga_rle_exact(b"\xfeZ", 3), b"ZZZ")
        for payload, expected in ((b"\x02ab", 3), (b"\xfeZ", 2), (b"\x00a", 2)):
            with self.subTest(payload=payload, expected=expected), self.assertRaises(ValueError):
                strict_amiga_rle_exact(payload, expected)

    def test_segmented_header_lengths_and_following_words_are_required(self):
        entry = _synthetic_entry()
        decoded = parse_native_entry(entry, expected_entry_sha=None,
                                     expected_frame_lengths=None, expected_frames=None)
        self.assertEqual(decoded["header"]["frameLengths"], [84, 84, 84])
        self.assertEqual(decoded["entryConsumedBytes"], len(entry))
        self.assertEqual([frame["decodedBytes"] for frame in decoded["frames"]], [5280] * 3)
        for invalid in (entry[:-1], entry[:-2] + b"\x00\x01"):
            with self.subTest(invalid_suffix=invalid[-2:]), self.assertRaises(ValueError):
                parse_native_entry(invalid, expected_entry_sha=None,
                                   expected_frame_lengths=None, expected_frames=None)

    def test_composition_is_separate_from_stored_frame_hashes(self):
        decoded = parse_native_entry(_synthetic_entry(), expected_entry_sha=None,
                                     expected_frame_lengths=None, expected_frames=None)
        self.assertNotEqual(decoded["frames"][1]["storedIndexSha256"],
                            decoded["composedFrames"][1]["indexSha256"])
        self.assertEqual(decoded["composedFrames"][0]["composition"], "stored-frame")
        self.assertEqual(decoded["composedFrames"][2]["composition"], "frame0-xor-selected-frame")


if __name__ == "__main__":
    unittest.main()
