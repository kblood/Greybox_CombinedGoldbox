from __future__ import annotations

import unittest

import map_gateway_newgame_route as subject
from gen1_ecl_encounter_scan import DEFAULT_ADDRESS_ADDEND, ECL_HEADER_LEN


def make_block(body: bytes, address_addend: int = DEFAULT_ADDRESS_ADDEND) -> bytes:
    """A minimal real-shaped ECL block: 0x1388 magic + a single `vm_run_1` far pointer
    landing right after the 22-byte header, then the caller's body bytes."""
    raw = bytearray(ECL_HEADER_LEN)
    raw[0:2] = b"\x88\x13"
    body_offset = ECL_HEADER_LEN
    vaddr = (body_offset - 2 - address_addend) & 0xFFFF
    raw[2:4] = b"\x01\x01"
    raw[4:6] = vaddr.to_bytes(2, "little")
    return bytes(raw) + body


class ScanBlockForNewEclTests(unittest.TestCase):
    def test_records_immediate_game_area_write_before_newecl(self) -> None:
        # SAVE #6 -> [0x7F12]; NEWECL 21
        body = bytes([0x09, 0x00, 0x06, 0x01, 0x12, 0x7F, 0x20, 0x00, 0x15])
        raw = make_block(body)
        scanned = subject.scan_block_for_newecl(raw, DEFAULT_ADDRESS_ADDEND)
        self.assertEqual(len(scanned["hits"]), 1)
        hit = scanned["hits"][0]
        self.assertEqual(hit["target_block_kind"], "immediate")
        self.assertEqual(hit["target_block"], 21)
        self.assertEqual(hit["game_area_kind"], "immediate")
        self.assertEqual(hit["game_area"], 6)

    def test_newecl_with_no_preceding_area_write_is_unset(self) -> None:
        # NEWECL 20, no SAVE -> [0x7F12] anywhere on the path.
        body = bytes([0x20, 0x00, 0x14])
        raw = make_block(body)
        scanned = subject.scan_block_for_newecl(raw, DEFAULT_ADDRESS_ADDEND)
        self.assertEqual(len(scanned["hits"]), 1)
        hit = scanned["hits"][0]
        self.assertEqual(hit["target_block"], 20)
        self.assertEqual(hit["game_area_kind"], "unset")
        self.assertIsNone(hit["game_area"])

    def test_dynamic_area_write_is_reported_as_dynamic_not_resolved(self) -> None:
        # SAVE [0x4A00] -> [0x7F12]; NEWECL 21 -- the written value is read from host memory,
        # not an immediate, so the destination archive cannot be statically resolved.
        body = bytes([0x09, 0x01, 0x00, 0x4A, 0x01, 0x12, 0x7F, 0x20, 0x00, 0x15])
        raw = make_block(body)
        scanned = subject.scan_block_for_newecl(raw, DEFAULT_ADDRESS_ADDEND)
        self.assertEqual(len(scanned["hits"]), 1)
        hit = scanned["hits"][0]
        self.assertEqual(hit["game_area_kind"], "dynamic")
        self.assertIsNone(hit["game_area"])
        self.assertEqual(hit["game_area_operand_code"], 1)
        self.assertEqual(hit["game_area_operand_word"], 0x4A00)

    def test_ignores_save_writes_to_unrelated_locations(self) -> None:
        # SAVE #6 -> [0x4BE6] (inDungeon, not game_area); NEWECL 20
        body = bytes([0x09, 0x00, 0x06, 0x01, 0xE6, 0x4B, 0x20, 0x00, 0x14])
        raw = make_block(body)
        scanned = subject.scan_block_for_newecl(raw, DEFAULT_ADDRESS_ADDEND)
        self.assertEqual(len(scanned["hits"]), 1)
        self.assertEqual(scanned["hits"][0]["game_area_kind"], "unset")


class AreaNumberFromFileTests(unittest.TestCase):
    def test_parses_numbered_ecl_files(self) -> None:
        self.assertEqual(subject.area_number_from_file("ECL2.DAX"), 2)
        self.assertEqual(subject.area_number_from_file("ECL21.DAX"), 21)

    def test_returns_none_for_non_numbered_or_non_ecl_files(self) -> None:
        self.assertIsNone(subject.area_number_from_file("ECL.DAX"))
        self.assertIsNone(subject.area_number_from_file("WALLDEF2.DAX"))
        self.assertIsNone(subject.area_number_from_file("ECL2.GEO"))


class BfsRouteTests(unittest.TestCase):
    def test_finds_shortest_multi_hop_route(self) -> None:
        graph = {
            "nodes": {"ECL2.DAX#1": {}, "ECL6.DAX#21": {}, "ECL5.DAX#19": {}, "ECL3.DAX#4": {}},
            "edges": [
                {"from": "ECL2.DAX#1", "to_file": "ECL6.DAX", "to_block": 21, "resolved": True},
                {"from": "ECL6.DAX#21", "to_file": "ECL3.DAX", "to_block": 4, "resolved": True},
                {"from": "ECL6.DAX#21", "to_file": "ECL5.DAX", "to_block": 19, "resolved": True},
            ],
        }
        route = subject.bfs_route(graph, "ECL2.DAX#1", "ECL5.DAX", 19)
        self.assertIsNotNone(route)
        self.assertEqual(len(route), 2)
        self.assertEqual(route[-1]["to_file"], "ECL5.DAX")
        self.assertEqual(route[-1]["to_block"], 19)

    def test_unresolved_edges_are_not_traversed(self) -> None:
        graph = {
            "nodes": {"ECL2.DAX#1": {}, "ECL5.DAX#19": {}},
            "edges": [{"from": "ECL2.DAX#1", "to_file": "ECL5.DAX", "to_block": 19, "resolved": False}],
        }
        self.assertIsNone(subject.bfs_route(graph, "ECL2.DAX#1", "ECL5.DAX", 19))

    def test_missing_target_yields_no_route(self) -> None:
        graph = {"nodes": {"ECL2.DAX#1": {}}, "edges": []}
        self.assertIsNone(subject.bfs_route(graph, "ECL2.DAX#1", "ECL5.DAX", 19))


class BuildReportIntegrationTests(unittest.TestCase):
    """Runs against the real, local retail Gateway/CoAB installs -- same pattern as
    test_map_gateway_ecl_runtime_candidates.py's setUpClass. Skips cleanly if either
    install is not present on this machine."""

    @classmethod
    def setUpClass(cls) -> None:
        if not (subject.DEFAULT_GATEWAY / "GAME.OVR").exists() or not (subject.DEFAULT_COAB / "GAME.OVR").exists():
            raise unittest.SkipTest("Gateway/CoAB retail installs not present on this machine")
        if not subject.DEFAULT_ORACLE.exists():
            raise unittest.SkipTest("build/coab-oracle-map.json not present")
        cls.report = subject.build_report()

    def test_hash_locked_sources(self) -> None:
        for key, expected in subject.EXPECTED_HASHES.items():
            with self.subTest(key=key):
                self.assertEqual(self.report["sources"][key]["sha256"], expected)

    def test_boot_dispatch_constants_match_the_coab_oracle(self) -> None:
        dispatch = self.report["boot_dispatch"]
        self.assertTrue(dispatch["resolved"])
        self.assertFalse(dispatch["gateway_ambiguous_matches"])
        self.assertEqual(dispatch["coab_demo_ecl_block_id"], 0x52)
        self.assertEqual(dispatch["coab_newgame_ecl_block_id"], 1)
        self.assertEqual(dispatch["gateway_demo_ecl_block_id"], 0x52)
        self.assertEqual(dispatch["gateway_newgame_ecl_block_id"], 1)
        self.assertGreaterEqual(dispatch["structural_match_ratio"], 0.85)

    def test_start_and_target_nodes(self) -> None:
        self.assertTrue(self.report["detected"])
        self.assertEqual(self.report["start_node"], "ECL2.DAX#1")
        self.assertEqual(self.report["target_node"], "ECL5.DAX#19")

    def test_route_reaches_ecl5_block_19_in_two_hops(self) -> None:
        self.assertTrue(self.report["route_found"])
        route = self.report["route"]
        self.assertEqual(len(route), 2)

        hop1, hop2 = route
        self.assertEqual(hop1["to_file"], "ECL6.DAX")
        self.assertEqual(hop1["to_block"], 21)
        self.assertEqual(hop1["game_area_kind"], "immediate")
        self.assertEqual(hop1["game_area"], 6)
        self.assertEqual(hop1["vaddr"], 0x852D)

        self.assertEqual(hop2["to_file"], "ECL5.DAX")
        self.assertEqual(hop2["to_block"], 19)
        self.assertEqual(hop2["game_area_kind"], "immediate")
        self.assertEqual(hop2["game_area"], 5)
        self.assertEqual(hop2["vaddr"], 0x8824)

    def test_route_hops_carry_nonempty_branch_provenance(self) -> None:
        for hop in self.report["route"]:
            with self.subTest(vaddr=hop["vaddr"]):
                self.assertGreater(len(hop["path_vaddrs"]), 0)
                self.assertIn(hop["entry"], ("vm_run_1", "search_location", "pre_camp_check", "camp_interrupted", "initial_entry"))


if __name__ == "__main__":
    unittest.main()
