from __future__ import annotations

import unittest

from tools.map_gateway_ecl_runtime_candidates import ROLES, build_report


class MapGatewayEclRuntimeCandidatesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = build_report()

    def test_maps_every_role_to_the_hash_locked_expected_offset(self) -> None:
        for role, (_, expected_offset, threshold) in ROLES.items():
            with self.subTest(role=role):
                row = self.report["matches"][role]
                self.assertEqual(row["gateway"]["offset"], expected_offset)
                self.assertGreaterEqual(row["sequence_similarity"], threshold)
                self.assertFalse(row["runtime_promoted"])

    def test_assigns_title_local_descriptor_ownership(self) -> None:
        self.assertEqual(self.report["matches"]["dispatcher"]["descriptor"], 3)
        for role in ROLES.keys() - {"dispatcher"}:
            with self.subTest(role=role):
                self.assertEqual(self.report["matches"][role]["descriptor"], 9)

    def test_dispatch_map_has_broad_but_nonsemantic_opcode_coverage(self) -> None:
        opcodes = self.report["dispatch_opcodes"]
        self.assertEqual(len(opcodes), 53)
        self.assertEqual(opcodes[0], 0)
        self.assertEqual(opcodes[-1], 65)


if __name__ == "__main__":
    unittest.main()
