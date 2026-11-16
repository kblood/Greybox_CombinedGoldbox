import unittest

import map_savage_frontier_targets as target_map


class SavageFrontierTargetTests(unittest.TestCase):
    def test_select_route_separates_interactive_and_direct_smoke(self) -> None:
        rows = [
            {"ecl_file": "ECL5.DAX", "ecl_block": 19, "combat_vaddr": 0x8C34,
             "tactical_choice": {"choice_text": "FIGHT"},
             "roster": [[{"kind": "immediate"}]], "requires_runtime_seed": True,
             "branch_decisions": ["branch"], "path_offsets": [1]},
            {"ecl_file": "ECL2.DAX", "ecl_block": 82, "combat_vaddr": 0x82F3,
             "tactical_choice": None,
             "roster": [[{"kind": "immediate"}]], "requires_runtime_seed": False,
             "branch_decisions": [], "path_offsets": [1, 2]},
        ]
        self.assertEqual(target_map.select_route(rows, interactive=True)["combat_vaddr"], 0x8C34)
        self.assertEqual(target_map.select_route(rows, interactive=False)["combat_vaddr"], 0x82F3)

    def test_generated_report_passes_and_keeps_treasures_deferred(self) -> None:
        layouts = target_map.json.loads(target_map.DEFAULT_LAYOUTS.read_text(encoding="utf-8"))
        encounters = target_map.json.loads(target_map.DEFAULT_ENCOUNTERS.read_text(encoding="utf-8"))
        report = target_map.build_report(layouts, encounters)
        self.assertEqual(report["strict_status"], "pass")
        gateway, treasures = report["games"]
        self.assertEqual(gateway["selected_route"]["ecl_file"], "ECL5.DAX")
        self.assertEqual(gateway["selected_route"]["ecl_block"], 19)
        self.assertEqual(gateway["selected_route"]["combat_vaddr"], 0x8C34)
        self.assertEqual(gateway["selected_route"]["tactical_choice"]["choices"], ["FIGHT", "LEAVE"])
        self.assertEqual(gateway["selected_route"]["tactical_choice"]["choice_index"], 0)
        self.assertEqual(gateway["selected_route"]["tactical_choice"]["target_vaddr"], 0x8C25)
        self.assertEqual(gateway["direct_smoke_route"]["ecl_block"], 82)
        self.assertEqual(gateway["direct_smoke_route"]["combat_vaddr"], 0x82F3)
        self.assertEqual(gateway["record_size"], 422)
        self.assertEqual(gateway["monster_archives"]["record_count"], 72)
        self.assertGreater(len(gateway["stride_candidates"]), 0)
        self.assertEqual(gateway["combat_field_transfers"]["strict_status"], "pass")
        self.assertEqual(gateway["combat_xp_formula"]["strict_status"], "pass")
        self.assertEqual(
            gateway["combat_xp_formula"]["monster_award"],
            "u16(+0x13C) + u8(+0x12C) * u8(+0x13E)",
        )
        gateway_fields = {row["semantic"]: row for row in gateway["combat_field_transfers"]["fields"]}
        self.assertEqual(gateway_fields["thac0_inverted"]["source_offsets"], [0x73])
        self.assertEqual(gateway_fields["attack_damage_bonus"]["source_offsets"], [0x122, 0x123])
        self.assertEqual(gateway_fields["saving_throws"]["source_offsets"], list(range(0xDF, 0xE4)))
        self.assertEqual(gateway_fields["control_morale"]["source_offsets"], [0xF7])
        self.assertEqual(gateway_fields["experience_points"]["source_offsets"], list(range(0x127, 0x12B)))
        self.assertEqual(gateway["monster_side_archives"]["strict_status"], "pass")
        self.assertEqual(
            {row["record_size"] for row in gateway["monster_side_archives"]["archives"] if row["kind"] == "ITM"},
            {63},
        )
        self.assertTrue(treasures["selected_route"]["requires_runtime_seed"])
        self.assertEqual(treasures["record_size"], 510)
        self.assertEqual(treasures["monster_archives"]["record_count"], 102)
        self.assertGreater(len(treasures["stride_candidates"]), 0)
        self.assertEqual(treasures["combat_field_transfers"]["strict_status"], "pass")
        self.assertEqual(treasures["combat_xp_formula"]["strict_status"], "pass")
        self.assertEqual(treasures["combat_xp_formula"]["monster_award"], "u16(+0x198)")
        treasures_fields = {row["semantic"]: row for row in treasures["combat_field_transfers"]["fields"]}
        self.assertEqual(treasures_fields["current_hp"]["source_offsets"], [0x137])
        self.assertEqual(treasures_fields["attack_die_size"]["source_offsets"], [0x16C, 0x16D])
        self.assertEqual(treasures_fields["source_footprint"]["source_offsets"], [0x131])
        self.assertEqual(treasures_fields["hit_dice"]["source_offsets"], [0x138])
        self.assertEqual(treasures_fields["experience_points"]["source_offsets"], list(range(0x172, 0x176)))
        self.assertEqual(treasures_fields["race_monster_discriminator"]["source_offsets"], [0xAD])
        self.assertEqual(treasures["monster_side_archives"]["strict_status"], "pass")
        self.assertEqual(
            {row["record_size"] for row in treasures["monster_side_archives"]["archives"] if row["kind"] == "ITM"},
            {17},
        )
        compact = treasures["compact_item_expansion"]
        self.assertEqual(compact["strict_status"], "pass")
        self.assertEqual(compact["runtime_tail_start"], 0x2E)
        self.assertEqual(compact["runtime_tail_end"], 0x3E)
        compact_fields = {row["semantic"]: row for row in compact["fields"]}
        self.assertEqual(compact_fields["magic_plus"]["compact_offsets"], [4])
        self.assertEqual(compact_fields["magic_plus"]["runtime_offsets"], [0x32])
        self.assertEqual(compact_fields["value"]["compact_offsets"], [12, 13])
        self.assertTrue(all(row["consumer_anchors"] for row in compact["fields"]))
        self.assertIn("not semantic field consumers", report["claim_boundary"])
        self.assertIn("explicit player choice", report["claim_boundary"])


if __name__ == "__main__":
    unittest.main()
