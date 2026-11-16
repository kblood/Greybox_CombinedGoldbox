import unittest

import map_gen1_cross_area_flag_reads as subject
from gen1_ecl_encounter_scan import DEFAULT_ADDRESS_ADDEND, ECL_HEADER_LEN


def make_block(body: bytes, address_addend: int = DEFAULT_ADDRESS_ADDEND) -> bytes:
    """A minimal real-shaped ECL block: 0x1388 magic + a single `search_location` far
    pointer landing right after the 22-byte header, then the caller's body bytes."""
    raw = bytearray(ECL_HEADER_LEN)
    raw[0:2] = b"\x88\x13"
    body_offset = ECL_HEADER_LEN
    vaddr = (body_offset - 2 - address_addend) & 0xFFFF
    raw[6:8] = b"\x01\x01"
    raw[8:10] = vaddr.to_bytes(2, "little")
    return bytes(raw) + body


class CrossAreaFlagReadsTests(unittest.TestCase):
    def test_finds_a_save_write_to_the_target_word(self):
        # SAVE #0xff, [0x4a00]; EXIT
        body = bytes([0x09, 0x00, 0xFF, 0x01, 0x00, 0x4A, 0x00])
        raw = make_block(body)
        hits = subject.scan_block_for_targets(raw, DEFAULT_ADDRESS_ADDEND, {0x4A00})
        self.assertEqual(len(hits[0x4A00]), 1)
        hit = hits[0x4A00][0]
        self.assertEqual(hit["mnemonic"], "SAVE")
        self.assertEqual(hit["kind"], "write")
        self.assertEqual(hit["arg_index"], 1)
        self.assertEqual(hit["vaddr"], 0x8014)

    def test_finds_a_compare_read_of_the_target_word(self):
        # COMPARE [0x4a00], #0xff; EXIT
        body = bytes([0x03, 0x01, 0x00, 0x4A, 0x00, 0xFF, 0x00])
        raw = make_block(body)
        hits = subject.scan_block_for_targets(raw, DEFAULT_ADDRESS_ADDEND, {0x4A00})
        self.assertEqual(len(hits[0x4A00]), 1)
        hit = hits[0x4A00][0]
        self.assertEqual(hit["mnemonic"], "COMPARE")
        self.assertEqual(hit["kind"], "read")
        self.assertEqual(hit["arg_index"], 0)

    def test_ignores_unrelated_addresses(self):
        # SAVE #1, [0x4bee] -- a different word than the one we're scanning for.
        body = bytes([0x09, 0x00, 0x01, 0x01, 0xEE, 0x4B, 0x00])
        raw = make_block(body)
        hits = subject.scan_block_for_targets(raw, DEFAULT_ADDRESS_ADDEND, {0x4A00})
        self.assertEqual(hits[0x4A00], [])

    def test_flag_registry_covers_investigated_profiles(self):
        self.assertIn("secret-of-the-silver-blades", subject.FLAG_REGISTRY)
        self.assertIn("pool-of-radiance", subject.FLAG_REGISTRY)
        self.assertIn("curse-of-the-azure-bonds", subject.FLAG_REGISTRY)
        for flags in subject.FLAG_REGISTRY.values():
            self.assertGreater(len(flags), 0)
            for flag in flags:
                self.assertIn("location", flag)
                self.assertIn("label", flag)

    def test_cok_landmark_cadence_gate_words_are_in_the_full_corpus_registry(self):
        locations = {flag["location"] for flag in subject.FLAG_REGISTRY["champions-of-krynn"]}
        self.assertTrue({0x4C26, 0x4C28, 0x4C5C, 0x4C7D}.issubset(locations))

    def test_coab_proven_route_flags_are_in_the_full_corpus_registry(self):
        locations = {flag["location"] for flag in subject.FLAG_REGISTRY["curse-of-the-azure-bonds"]}
        self.assertTrue({0x4CF4, 0x4CFF, 0x4CBE, 0x4CBF}.issubset(locations))

    def test_coab_current_city_selector_is_in_the_full_corpus_registry(self):
        locations = {flag["location"] for flag in subject.FLAG_REGISTRY["curse-of-the-azure-bonds"]}
        self.assertIn(0x4CA1, locations)


if __name__ == "__main__":
    unittest.main()
