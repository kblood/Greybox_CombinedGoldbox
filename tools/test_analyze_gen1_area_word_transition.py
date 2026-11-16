from __future__ import annotations

import unittest

from tools.analyze_gen1_area_word_transition import area_word_offset, build_transition


class AnalyzeGen1AreaWordTransitionTests(unittest.TestCase):
    def test_resolves_wrapped_area_word_offset(self) -> None:
        self.assertEqual(area_word_offset(0x4CCD), 0x039A)

    def test_proves_es_area_word_and_rejects_direct_ds_alias(self) -> None:
        before = bytearray(0x30000)
        after = bytearray(before)
        resolved = 0x2000 << 4 | 0x039A
        direct = (0x1000 << 4) + 0x4CCD
        after[resolved : resolved + 2] = (4).to_bytes(2, "little")
        proof = build_transition(
            "DS=1000 ES=2000",
            bytes(before),
            bytes(after),
            0x4CCD,
            0,
            4,
        )
        self.assertEqual(proof["verdict"], "area_word_transition_proven")
        self.assertEqual(proof["transition"]["resolved_pointer"], "2000:039A")
        self.assertEqual(proof["rejected_direct_ds_alias"]["physical"], f"0x{direct:05X}")

    def test_rejects_non_area_logical_address(self) -> None:
        with self.assertRaises(ValueError):
            area_word_offset(0x5000)


if __name__ == "__main__":
    unittest.main()
