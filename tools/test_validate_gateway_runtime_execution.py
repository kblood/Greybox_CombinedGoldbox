from __future__ import annotations

import unittest

from tools.validate_gateway_runtime_execution import (
    SECRET_ALIAS_OFFSETS,
    SECRET_ALIAS_SEGMENTS,
    validate_probe,
)


def make_probe(hits: list[dict]) -> dict:
    return {
        "schema_version": 1,
        "profile_id": "gateway-to-the-savage-frontier",
        "hits": hits,
    }


class ValidateGatewayRuntimeExecutionTests(unittest.TestCase):
    def test_rejects_non_gateway_probe(self) -> None:
        with self.assertRaises(ValueError):
            validate_probe({"profile_id": "secret-of-the-silver-blades", "hits": []})

    def test_clean_but_unconfirmed_when_no_hit_matches(self) -> None:
        probe = make_probe(
            [
                {"index": 0, "cs_ip": "1B37:0000", "ds": "0CEB", "resident_bytes_match_retail_parser": False},
                {"index": 1, "cs_ip": "1B37:0000", "ds": "0CEB", "resident_bytes_match_retail_parser": False},
            ]
        )
        report = validate_probe(probe)
        self.assertTrue(report["clean"])
        self.assertEqual(report["verdict"], "operand_parser_execution_not_confirmed")
        self.assertEqual(report["matching_hit_count"], 0)
        self.assertEqual(report["gateway_own_values"]["dgroup"], "UNLOCATED")

    def test_rejects_a_matching_hit_that_reuses_a_secret_segment(self) -> None:
        secret_segment = next(iter(SECRET_ALIAS_SEGMENTS))
        probe = make_probe(
            [
                {
                    "index": 0,
                    "cs_ip": f"{secret_segment}:0000",
                    "ds": "0CEB",
                    "resident_bytes_match_retail_parser": True,
                }
            ]
        )
        report = validate_probe(probe)
        self.assertFalse(report["clean"])
        self.assertTrue(any("Secret-only runtime alias" in r for r in report["rejections"]))

    def test_rejects_a_ds_alias_even_without_cs_collision(self) -> None:
        secret_segment = sorted(SECRET_ALIAS_SEGMENTS)[0]
        probe = make_probe(
            [
                {
                    "index": 0,
                    "cs_ip": "1B37:0000",
                    "ds": secret_segment,
                    "resident_bytes_match_retail_parser": True,
                }
            ]
        )
        report = validate_probe(probe)
        self.assertFalse(report["clean"])

    def test_accepts_a_matching_hit_on_gateways_own_confirmed_segment(self) -> None:
        probe = make_probe(
            [
                {
                    "index": 0,
                    "cs_ip": "1B37:0000",
                    "ds": "0CEB",
                    "resident_bytes_match_retail_parser": True,
                }
            ]
        )
        report = validate_probe(probe)
        self.assertTrue(report["clean"])
        self.assertEqual(report["verdict"], "operand_parser_execution_confirmed")

    def test_rejects_a_confirmed_dgroup_that_collides_with_secret(self) -> None:
        probe = make_probe([])
        secret_offset = next(iter(SECRET_ALIAS_OFFSETS))
        report = validate_probe(
            probe,
            confirmed_selector_offsets={"ecl_cursor_address": secret_offset},
        )
        self.assertFalse(report["clean"])


if __name__ == "__main__":
    unittest.main()
