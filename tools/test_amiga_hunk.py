"""Synthetic, in-memory controls for the strict byte-only HUNK metadata reader."""
from dataclasses import FrozenInstanceError
import hashlib
import struct
import unittest

from amiga_hunk import HunkError, parse_verified_hunk


def words(*values):
    return struct.pack(">" + "I" * len(values), *values)


def header(*allocations):
    return words(1011, 0, len(allocations), 0, len(allocations) - 1, *allocations)


def parse(data, **overrides):
    pins = dict(expected_size=len(data), expected_sha256=hashlib.sha256(data).hexdigest())
    pins.update(overrides)
    return parse_verified_hunk(data, **pins)


class HunkTests(unittest.TestCase):
    def rejects(self, data, message=None):
        with self.assertRaisesRegex(HunkError, message or ".+"):
            parse(data)

    def fixture(self):
        # Independent numeric tags and byte layout; 2 is a legal non-longword offset.
        return (header(4, 2, 4) + words(1001, 3, 0x11223344, 0x55667788, 0x99AABBCC)
                + words(1004, 1, 1, 2, 1, 2, 8, 0, 1010)
                + words(1000, 1, 0x6E616D65, 1002, 2, 0x10203040, 0x50607080)
                + words(1004, 1, 0, 0, 0, 1010, 1003, 4, 1010))

    def test_layout_relocations_and_exact_pins(self):
        data = self.fixture()
        result = parse(data)
        self.assertEqual(result.schema, "amiga-hunk-metadata-v1")
        self.assertEqual((result.input_length, result.input_sha256),
                         (152, hashlib.sha256(data).hexdigest()))
        self.assertEqual([(h.index, h.type, h.allocation_length, h.payload_offset, h.payload_length)
                          for h in result.hunks],
                         [(0, 1001, 16, 40, 12), (1, 1002, 8, 108, 8), (2, 1003, 16, None, 0)])
        self.assertEqual([h.payload_sha256 for h in result.hunks], [
            hashlib.sha256(words(0x11223344, 0x55667788, 0x99AABBCC)).hexdigest(),
            hashlib.sha256(words(0x10203040, 0x50607080)).hexdigest(), hashlib.sha256(b"").hexdigest()])
        self.assertEqual([(r.source_hunk, r.source_offset, r.target_hunk, r.raw_addend)
                          for r in result.relocations],
                         [(0, 2, 1, 0x33445566), (0, 8, 2, 0x99AABBCC), (1, 0, 0, 0x10203040)])
        self.assertEqual([(r.hunk_index, r.type, r.file_offset, r.end_offset)
                          for r in result.skipped_records], [(1, 1000, 88, 100)])

    def test_name_symbol_debug_framing_and_bss_no_payload(self):
        data = (header(2, 1) + words(1000, 1, 0x41424344, 1003, 2,
                1008, 1, 0x53594D00, 99, 0, 1009, 2, 0xDEADBEEF, 0x12345678,
                1010, 1002, 1, 0xFACE0001, 1010))
        result = parse(data)
        self.assertEqual(result.hunks[0].payload_offset, None)
        self.assertEqual(result.hunks[1].payload_offset, 96)
        self.assertEqual([(r.type, r.file_offset, r.end_offset) for r in result.skipped_records],
                         [(1000, 28, 40), (1008, 48, 68), (1009, 68, 84)])
        self.assertEqual(result.hunks[1].payload_sha256, hashlib.sha256(words(0xFACE0001)).hexdigest())

    def test_every_truncated_prefix_rejects_with_fresh_pins(self):
        data = self.fixture()
        for length in range(len(data)):
            with self.subTest(length=length):
                self.rejects(data[:length])

    def test_complete_misplaced_metadata_rejects_with_fresh_pins(self):
        payload = words(1001, 1, 0)
        name, symbol, debug = words(1000, 1, 0x4E414D45), words(1008, 0), words(1009, 0)
        for body in (payload + name, symbol + payload, debug + payload):
            with self.subTest(body=body):
                self.rejects(header(1) + body + words(1010), "invalid payload state")
        # After END the next hunk has no payload yet; the prior one cannot lend state.
        for metadata in (symbol, debug):
            self.rejects(header(1, 1) + payload + words(1010) + metadata
                         + payload + words(1010), "invalid payload state")

    def test_header_and_resource_limits(self):
        for data in (words(1001), words(1011, 1), words(1011, 0, 0, 0, 0),
                     words(1011, 0, 4097, 0, 4096), words(1011, 0, 1, 1, 1),
                     words(1011, 0, 1, 0, 1), header(0x01000001),
                     header(0x00800001, 0x00800001)):
            with self.subTest(data=data):
                self.rejects(data)
        self.rejects(b"x" * (8 * 1024 * 1024 + 1), "ceiling")

    def test_malformed_record_lengths_and_structure(self):
        for body in (words(1001, 2, 0), words(1001, 0xFFFFFFFF),
                     words(1001, 1, 0, 1001, 1, 0, 1010),
                     words(1001, 1, 0), words(1010), words(1000, 100),
                     words(1008, 1, 0), words(1009, 100),
                     words(1004, 0, 1001, 1, 0, 1010)):
            with self.subTest(body=body):
                self.rejects(header(1) + body)
        self.rejects(header(1) + words(1001, 1, 0, 1010, 0), "trailing")
        self.rejects(header(1) + words(1001, 1, 0, 1010) + b"x", "trailing")

    def test_bad_relocation_targets_offsets_and_overlaps(self):
        for groups in ((1, 1, 0, 0), (1, 0, 1, 0), (1, 0, 6, 0),
                       (2, 0, 0, 0, 0), (2, 0, 0, 2, 0), (65537,), (1, 0),
                       (1, 0, 0)):
            with self.subTest(groups=groups):
                self.rejects(header(2) + words(1001, 2, 0, 0, 1004, *groups, 1010))
        # Duplicates/overlap across separate RELOC32 records also reject.
        self.rejects(header(2) + words(1001, 2, 0, 0, 1004, 1, 0, 0, 0,
                                     1004, 1, 0, 2, 0, 1010), "overlapping")

    def test_unstored_addends_are_explicitly_unsupported(self):
        self.rejects(header(4) + words(1003, 4, 1004, 1, 0, 0, 0, 1010), "unsupported")
        self.rejects(header(4) + words(1001, 1, 0, 1004, 1, 0, 4, 0, 1010), "unsupported")

    def test_ordinary_memory_flags_are_separate_from_type(self):
        for allocation_flags in (0, 0x40000000, 0x80000000):
            for identifier_flags in (0, 0x40000000, 0x80000000):
                result = parse(header(allocation_flags | 1)
                               + words(identifier_flags | 1001, 1, 0, 1010))
                hunk = result.hunks[0]
                self.assertEqual((hunk.type, hunk.allocation_flags, hunk.identifier_flags),
                                 (1001, allocation_flags, identifier_flags))

    def test_unsupported_tags_and_flags_report_exact_offset_and_tag(self):
        # UNIT/LIB/INDEX, overlays, other relocation widths/short/relative, advisory.
        for tag in (999, 1005, 1006, 1007, 1013, 1014, 1015, 1016, 1017,
                    1018, 1019, 1020, 1021, 1022, 0x200003E9, 0xC00003E9,
                    0x400003F2):
            with self.subTest(tag=tag):
                self.rejects(header(1) + words(tag), f"offset 24 tag {tag} ")
        self.rejects(header(0xC0000001), "offset 20 tag 3221225473 ")
        self.rejects(words(0x400003F3), "offset 0 tag 1073742835 ")

    def test_pins_precede_header_interpretation(self):
        malformed = b"not a hunk"
        with self.assertRaisesRegex(HunkError, "size pin"):
            parse(malformed, expected_size=999, expected_sha256="wrong")
        with self.assertRaisesRegex(HunkError, "SHA-256 pin"):
            parse(malformed, expected_sha256="0" * 64)
        with self.assertRaises(TypeError):
            parse_verified_hunk(bytearray(b"x"), expected_size=1, expected_sha256="wrong")

    def test_immutable_metadata_and_unchanged_input(self):
        data = self.fixture()
        before = bytes(data)
        result = parse(data)
        with self.assertRaises(FrozenInstanceError):
            result.hunks[0].payload_length = 99
        with self.assertRaises(FrozenInstanceError):
            result.relocations[0].raw_addend = 99
        with self.assertRaises(TypeError):
            result.hunks[0] = result.hunks[1]
        self.assertEqual(data, before)


if __name__ == "__main__":
    unittest.main()
