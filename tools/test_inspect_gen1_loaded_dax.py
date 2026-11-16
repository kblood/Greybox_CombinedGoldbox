from __future__ import annotations

import argparse
import unittest

from tools.inspect_gen1_loaded_dax import member_matches, parse_byte_expectation


class InspectGen1LoadedDaxTests(unittest.TestCase):
    def test_matches_body_when_loader_replaces_two_byte_prefix(self) -> None:
        raw = b"\x88\x13unique decompressed member body"
        ram = b"padding" + b"\x00\x00" + raw[2:] + b"tail"
        self.assertEqual(
            member_matches(ram, raw),
            [{"physical_base": 7, "matched_raw_offset": 2, "matched_length": len(raw) - 2}],
        )

    def test_reports_every_match_for_strict_uniqueness_check(self) -> None:
        raw = b"\x01\x02member"
        ram = b"\x00\x00member---\x00\x00member"
        self.assertEqual([match["physical_base"] for match in member_matches(ram, raw)], [0, 11])

    def test_rejects_prefix_that_consumes_member(self) -> None:
        with self.assertRaisesRegex(ValueError, "leave at least one"):
            member_matches(b"", b"ab", 2)

    def test_parses_hex_byte_expectation(self) -> None:
        self.assertEqual(parse_byte_expectation("0x20522:0:0x61"), (0x20522, 0, 97))

    def test_rejects_out_of_range_expected_byte(self) -> None:
        with self.assertRaisesRegex(argparse.ArgumentTypeError, "out of range"):
            parse_byte_expectation("1:0:256")


if __name__ == "__main__":
    unittest.main()
