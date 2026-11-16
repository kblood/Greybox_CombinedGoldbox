from __future__ import annotations

import unittest

from tools.map_secret_runtime_symbols import COUNT_TEAMS_BYTES, build_report


class MapSecretRuntimeSymbolsTests(unittest.TestCase):
    def layouts(self) -> dict:
        return {
            "games": [{
                "profile_id": "secret-of-the-silver-blades",
                "descriptors": [
                    {
                        "index": 10,
                        "ovr_file_offset": 0x20,
                        "code_size": 0x80,
                        "fixup_entries": [{
                            "route_kind": "public_stub_owned",
                            "target_descriptor_index": 26,
                            "target_proc_offset": 0x40,
                            "instruction_offset": 0x10,
                            "loader_target_file_offset": 0x520,
                            "target_stub_index": 2,
                        }],
                    },
                    {
                        "index": 26,
                        "ovr_file_offset": 0x100,
                        "code_size": 0x200,
                        "loader_file_offset": 0x500,
                        "stub_array_file_offset": 0x516,
                        "stub_proc_offsets": [1, 2, 0x40],
                        "fixup_entries": [],
                    },
                ],
            }]
        }

    def test_maps_unique_exact_body_and_fields(self) -> None:
        data = b"\0" * 0x140 + COUNT_TEAMS_BYTES + b"\0" * 0x80
        report = build_report(data, self.layouts(), "GAME.OVR")
        symbol = report["symbols"][0]
        self.assertEqual(symbol["retail_file_offset"], 0x140)
        self.assertEqual(symbol["descriptor_relative_offset"], 0x40)
        self.assertEqual(symbol["fields"]["foes_count"], "DS:87CD")
        self.assertEqual(symbol["public_stub"]["index"], 2)
        self.assertEqual(symbol["inbound_calls"][0]["caller_retail_file_offset"], 0x30)
        self.assertIn("pending_secret_cs_ip_hit", symbol["semantic_status"])

    def test_rejects_duplicate_body(self) -> None:
        data = b"\0" * 0x120 + COUNT_TEAMS_BYTES + b"\0" * 8 + COUNT_TEAMS_BYTES
        with self.assertRaisesRegex(ValueError, "found 2"):
            build_report(data, self.layouts(), "GAME.OVR")

    def test_execution_trace_promotes_only_on_exact_descriptor_hit_and_bytematch(self) -> None:
        data = b"\0" * 0x140 + COUNT_TEAMS_BYTES + b"\0" * 0x80
        confirmed_trace = {
            "count_teams": {
                "descriptor": 26,
                "cs_ip_hit_confirmed": True,
                "byte_match_confirmed": True,
                "hits": [{"pointer": "362D:2B1C", "physical": "0x38DEC", "byte_match": True}],
            }
        }
        report = build_report(data, self.layouts(), "GAME.OVR", execution_trace=confirmed_trace)
        symbol = report["symbols"][0]
        self.assertEqual(symbol["semantic_status"], "execution_confirmed_secret_cs_ip_hit")
        self.assertEqual(symbol["execution_evidence"]["first_byte_matched_hit"]["pointer"], "362D:2B1C")
        self.assertIn("execution-confirmed", report["claim_boundary"])

    def test_execution_trace_wrong_descriptor_does_not_promote(self) -> None:
        data = b"\0" * 0x140 + COUNT_TEAMS_BYTES + b"\0" * 0x80
        wrong_descriptor_trace = {
            "count_teams": {
                "descriptor": 99,
                "cs_ip_hit_confirmed": True,
                "byte_match_confirmed": True,
                "hits": [{"pointer": "1234:5678", "physical": "0x12345", "byte_match": True}],
            }
        }
        report = build_report(data, self.layouts(), "GAME.OVR", execution_trace=wrong_descriptor_trace)
        symbol = report["symbols"][0]
        self.assertEqual(symbol["semantic_status"], "candidate_pending_secret_cs_ip_hit")
        self.assertNotIn("execution_evidence", symbol)

    def test_execution_trace_without_bytematch_does_not_promote(self) -> None:
        data = b"\0" * 0x140 + COUNT_TEAMS_BYTES + b"\0" * 0x80
        no_bytematch_trace = {
            "count_teams": {
                "descriptor": 26,
                "cs_ip_hit_confirmed": True,
                "byte_match_confirmed": False,
                "hits": [{"pointer": "362D:2B1C", "physical": "0x38DEC", "byte_match": False}],
            }
        }
        report = build_report(data, self.layouts(), "GAME.OVR", execution_trace=no_bytematch_trace)
        symbol = report["symbols"][0]
        self.assertEqual(symbol["semantic_status"], "candidate_pending_secret_cs_ip_hit")


if __name__ == "__main__":
    unittest.main()
