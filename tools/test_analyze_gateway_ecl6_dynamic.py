import unittest
from pathlib import Path

from tools.analyze_gateway_ecl6_dynamic import (
    Pose,
    boat_abandon_outcome,
    companion_exit_gate_order,
    companion_exit_outcome,
    encounter_step,
    flee_outcome,
    sundabar_gate,
    sundabar_prompt,
    transition,
    verify_8x8d6,
    verify_ecl,
    verify_geo6,
    verify_ovr,
    wilderness_arrow_route,
    wilderness_tile_route,
)


class GatewayEcl6DynamicTests(unittest.TestCase):
    def test_six_submap_transition_seeds(self) -> None:
        cases = {
            Pose(21, 15, 7, 1): Pose(22, 0, 7, 1),
            Pose(22, 0, 7, 3): Pose(21, 15, 7, 3),
            Pose(22, 15, 7, 1): Pose(23, 0, 7, 1),
            Pose(22, 4, 15, 2): Pose(25, 0, 0, 2),
            Pose(23, 0, 7, 3): Pose(22, 15, 7, 3),
            Pose(23, 15, 7, 1): Pose(24, 0, 7, 1),
            Pose(23, 3, 15, 2): Pose(25, 15, 0, 2),
            Pose(23, 4, 15, 2): Pose(26, 0, 0, 2),
            Pose(24, 0, 7, 3): Pose(23, 15, 7, 3),
            Pose(24, 3, 15, 2): Pose(26, 15, 0, 2),
            Pose(25, 15, 7, 1): Pose(26, 0, 7, 1),
            Pose(25, 0, 0, 0): Pose(22, 4, 15, 0),
            Pose(25, 12, 0, 0): Pose(23, 0, 15, 0),
            Pose(26, 0, 7, 3): Pose(25, 15, 7, 3),
            Pose(26, 0, 0, 0): Pose(23, 4, 15, 0),
            Pose(26, 12, 0, 0): Pose(24, 0, 15, 0),
        }
        for before, after in cases.items():
            with self.subTest(before=before):
                self.assertEqual(transition(before), after)

    def test_transition_guard_rejections(self) -> None:
        self.assertIsNone(transition(Pose(21, 15, 7, 3)))
        self.assertIsNone(transition(Pose(22, 3, 15, 2)))
        self.assertIsNone(transition(Pose(25, 5, 1, 0)))
        self.assertIsNone(transition(Pose(99, 0, 0, 0)))

    def test_encounter_cooldown_then_roll_until_hit(self) -> None:
        state = {"counter": 0, "descriptor": 3, "suppress": 0, "threshold": 30}
        for expected in (1, 2, 3):
            result = encounter_step(**state, roll=None)
            self.assertFalse(result["rolled"])
            self.assertEqual(result["counter"], expected)
            state["counter"] = result["counter"]
        miss = encounter_step(**state, roll=30)
        self.assertTrue(miss["rolled"])
        self.assertFalse(miss["encounter"])
        self.assertEqual(miss["counter"], 3)
        hit = encounter_step(**state, roll=29)
        self.assertTrue(hit["encounter"])
        self.assertEqual(hit["counter"], 0)

    def test_encounter_suppress_and_descriptor_gate(self) -> None:
        suppressed = encounter_step(counter=2, descriptor=3, suppress=255, threshold=30, roll=None)
        self.assertEqual(suppressed, {"counter": 2, "suppress": 0, "rolled": False, "encounter": False})
        terrain = encounter_step(counter=3, descriptor=18, suppress=0, threshold=99, roll=None)
        self.assertFalse(terrain["rolled"])

    def test_flee_exact_threshold_and_outcome_counts(self) -> None:
        self.assertFalse(flee_outcome(34)["escaped"])
        self.assertTrue(flee_outcome(34)["combat"])
        self.assertTrue(flee_outcome(35)["escaped"])
        self.assertFalse(flee_outcome(35)["combat"])
        self.assertEqual(sum(not flee_outcome(roll)["escaped"] for roll in range(101)), 35)
        self.assertEqual(sum(flee_outcome(roll)["escaped"] for roll in range(101)), 66)
        with self.assertRaises(ValueError):
            flee_outcome(101)

    def test_sundabar_gate_and_host_answer(self) -> None:
        self.assertTrue(sundabar_gate(Pose(24, 0, 4, 3)))
        self.assertFalse(sundabar_gate(Pose(24, 0, 4, 1)))
        self.assertEqual(sundabar_prompt(0)["chain_block"], 19)
        self.assertFalse(sundabar_prompt(0)["if_eq"])
        self.assertTrue(sundabar_prompt(1)["if_eq"])
        self.assertIsNone(sundabar_prompt(1)["chain_block"])

    def test_boat_abandon_exact_word_and_choice_semantics(self) -> None:
        land = boat_abandon_outcome(0)
        self.assertFalse(land["prompt"])
        self.assertEqual(land["continuation"], "ecl-exit")
        self.assertEqual(land["ecl_clock_hours_before_branch"], 12)

        paused = boat_abandon_outcome(1)
        self.assertTrue(paused["prompt"])
        self.assertEqual(paused["travel_mode_after"], 1)
        self.assertEqual(paused["continuation"], "paused-for-host-choice")

        yes = boat_abandon_outcome(0x1234, 0)
        self.assertFalse(yes["if_eq"])
        self.assertTrue(yes["removed_boat"])
        self.assertEqual(yes["travel_mode_after"], 0)
        self.assertEqual(yes["continuation"], "ecl-exit")

        no = boat_abandon_outcome(0x1234, 1)
        self.assertTrue(no["if_eq"])
        self.assertFalse(no["removed_boat"])
        self.assertEqual(no["travel_mode_after"], 0x1234)
        self.assertEqual(no["continuation"], "common-no-transition")
        with self.assertRaises(ValueError):
            boat_abandon_outcome(1, 2)

    def test_companion_exit_order_and_shared_removal_semantics(self) -> None:
        self.assertEqual(companion_exit_gate_order(23), ("EREK",))
        self.assertEqual(companion_exit_gate_order(26), ("MUTHTUR", "RISHPAL"))
        self.assertEqual(companion_exit_gate_order(25), ())

        absent = companion_exit_outcome(present=False, active=False)
        self.assertFalse(absent["prompt"])
        self.assertFalse(absent["removed"])
        inactive = companion_exit_outcome(present=True, active=False)
        self.assertFalse(inactive["prompt"])
        self.assertTrue(inactive["removed"])
        active = companion_exit_outcome(present=True, active=True)
        self.assertTrue(active["prompt"])
        self.assertFalse(active["removed"])
        continued = companion_exit_outcome(present=True, active=True, choice_index=0)
        self.assertEqual(continued["choice"], "CONTINUE")
        self.assertTrue(continued["removed"])
        self.assertEqual(continued["continuation"], "next-guard")
        backed_out = companion_exit_outcome(present=True, active=True, choice_index=1)
        self.assertEqual(backed_out["choice"], "GO BACK")
        self.assertFalse(backed_out["removed"])
        self.assertEqual(backed_out["continuation"], "common-no-transition")

    def test_exact_wilderness_symbol_routing(self) -> None:
        self.assertEqual(wilderness_tile_route(0, 21), {
            "global_symbol": 0x2E, "symbol_set": 1, "block_id": 18, "local_tile": 0,
        })
        self.assertEqual(wilderness_tile_route(69, 21)["local_tile"], 69)
        self.assertEqual(wilderness_tile_route(70, 21), {
            "global_symbol": 0x74, "symbol_set": 2, "block_id": 50, "local_tile": 0,
        })
        self.assertEqual(wilderness_tile_route(139, 26)["local_tile"], 69)
        self.assertEqual(wilderness_tile_route(140, 26), {
            "global_symbol": 0xBA, "symbol_set": 3, "block_id": 61, "local_tile": 0,
        })
        self.assertEqual(wilderness_tile_route(209, 26)["local_tile"], 69)
        self.assertEqual(wilderness_arrow_route(3), {
            "global_symbol": 0x103, "symbol_set": 4, "archive_area": 1,
            "block_id": 202, "local_tile": 3,
        })

    def test_retail_artifacts_when_present(self) -> None:
        ecl_path = Path("build/gateway-ecldump6-20260729/ECL6_021.bin")
        geo_path = Path("build/runtime-gateway-campaign-cycle-20260729/GEO6.DAX")
        ovr_path = Path(
            r"C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier\GAME.OVR"
        )
        tiles_path = ovr_path.with_name("8X8D6.DAX")
        if not ecl_path.is_file():
            self.skipTest("ignored retail ECL6#21 dump is not installed")
        report = verify_ecl(ecl_path.read_bytes())
        self.assertEqual(report["encounters"]["thresholds_by_descriptor"][3], 30)
        handoff = report["encounters"]["wandering_handoff"]
        self.assertEqual(handoff["addresses"]["attack_flee_menu"], "0x944D")
        self.assertEqual(handoff["addresses"]["setup_monster"], "0x81D3")
        self.assertEqual(handoff["addresses"]["load_monster"], "0x81DB")
        self.assertEqual(handoff["addresses"]["combat"], "0x81E5")
        self.assertEqual(
            handoff["tables"]["giant_lizard_wyvern_monsters"],
            {"vaddr": "0x8DA0", "values": [21, 45]},
        )
        self.assertEqual(
            handoff["current_city_by_descriptor"],
            [0, 30, 8, 17, 15, 14, 14, 12, 4, 4, 1, 4, 2, 0, 4, 7, 31, 20],
        )
        self.assertEqual(
            [(row["family"], row["descriptors"], row["monster_ids"],
              row["encounter_picture_ids"], row["count_domain_inclusive"])
             for row in handoff["families"]],
            [
                ("anhkheg", [0, 1, 10, 15], [6], [82], [1, 3]),
                ("goblin-or-bugbear", [2], [8, 19], [255, 255], [2, 6]),
                ("giant-snake-or-ettin", [3, 17], [40, 57], [85, 86], [2, 6]),
                ("hill-giant", [4, 5, 6], [51], [88], [2, 3]),
                ("troll-or-basilisk", [7], [41, 33], [13, 255], [2, 6]),
                ("wild-boar-or-hobgoblin", [8, 9, 11, 12, 13, 14], [24, 9], [95, 96], [2, 6]),
                ("giant-lizard-or-wyvern", [16], [21, 45], [91, 92], [2, 6]),
            ],
        )
        self.assertEqual(handoff["attack_setup_distance_domain_inclusive"], [1, 2])
        self.assertEqual(handoff["failed_flee_setup_distance"], 0)
        self.assertEqual(handoff["flee"]["failure_outcomes"], 35)
        self.assertEqual(handoff["flee"]["success_outcomes"], 66)
        self.assertEqual(report["terrain_probe"]["sundabar_location_code"], 120)
        guards = report["travel_and_exit_guards"]
        self.assertEqual(guards["travel_mode_address"], "0x4CF5")
        self.assertEqual(guards["boat_abandon"]["prompt"], "ABANDON THE BOAT?")
        self.assertEqual(guards["boat_abandon"]["menu"], ["YES", "NO"])
        self.assertEqual(guards["boat_abandon"]["deep_water_allowed_mode"], 1)
        self.assertTrue(
            guards["boat_abandon"]["pre_prompt_clock"]["occurs_before_temporary_probe_and_prompt"]
        )
        companions = guards["companion_exit_guards"]
        self.assertEqual(companions["call_order"], ["EREK", "MUTHTUR", "RISHPAL", "SUNDABAR"])
        self.assertEqual(companions["by_selector"], {"23": ["EREK"], "26": ["MUTHTUR", "RISHPAL"]})
        self.assertEqual(companions["menu"], ["CONTINUE", "GO BACK"])
        self.assertEqual(
            [(gate["name"], gate["selector"], gate["picture"]) for gate in companions["gates"]],
            [("EREK", 23, 0x66), ("MUTHTUR", 26, 0x4D), ("RISHPAL", 26, 0x22)],
        )
        suppression = guards["no_transition_suppression"]
        self.assertEqual(suppression["writes"], {"0x7EC9": 0xFF, "0x7F80": 0xFF})
        self.assertIn("clears it", suppression["next_search_location"])
        if geo_path.is_file():
            geo = verify_geo6(geo_path)
            self.assertEqual([b["block_id"] for b in geo["blocks"]], list(range(21, 27)))
            self.assertTrue(all(b["plane0_max"] < 210 for b in geo["blocks"]))
        if ovr_path.is_file():
            ovr = verify_ovr(ovr_path)
            self.assertEqual(ovr["comparison"], "selected index == 1")
            self.assertIn("directly", ovr["load_pieces"]["wilderness_branch"])
            self.assertEqual(ovr["wilderness_renderer"]["terrain_symbol"], "0x2E + cell byte")
        if tiles_path.is_file():
            tiles = verify_8x8d6(tiles_path)
            self.assertEqual([b["block_id"] for b in tiles["blocks"]], [18, *range(50, 62)])
            self.assertTrue(all(b["tile_count"] == 70 for b in tiles["blocks"]))
            self.assertEqual(tiles["boot_arrow_bank"]["block_id"], 202)
            self.assertEqual(tiles["boot_arrow_bank"]["arrow_local_tiles"], [0, 1, 2, 3])
            self.assertTrue(tiles["missing_sibling_archives"]["WALLDEF6.DAX"])
            self.assertTrue(tiles["missing_sibling_archives"]["BIGPIC6.DAX"])


if __name__ == "__main__":
    unittest.main()
