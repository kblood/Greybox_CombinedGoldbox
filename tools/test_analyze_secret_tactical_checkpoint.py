from __future__ import annotations

import unittest

from tools.analyze_secret_tactical_checkpoint import build_proof, parse_model_json


class AnalyzeSecretTacticalCheckpointTests(unittest.TestCase):
    def test_accepts_fenced_model_json(self) -> None:
        self.assertEqual(parse_model_json('```json\n{"frames": []}\n```'), {"frames": []})

    def test_proves_operandless_combat_handoff_and_visual_mode(self) -> None:
        trace = {
            "parser": {"ds": "1000"},
            "cursor": {"rows": [{"ecl_pc": 0x82B4}]},
        }
        ram = bytearray(0x20000)
        ram[0x10000 + 0x67E1 : 0x10000 + 0x67E3] = (0x82BC).to_bytes(2, "little")
        model = {
            "frames": [{
                "state": "combat",
                "looks_crashed": False,
                "visible_text": {"menu": ["FIGHT VIEW AIM QUICK DONE"]},
                "selected_item": "FIGHT",
            }]
        }
        proof = build_proof(trace, bytes(ram), b"png", model)
        self.assertEqual(proof["verdict"], "active_2d_tactical_mode")
        self.assertTrue(proof["execution"]["mechanical_handoff_proven"])

    def test_rejects_world_screen(self) -> None:
        trace = {"parser": {"ds": "1000"}, "cursor": {"rows": [{"ecl_pc": 0x82B4}]}}
        ram = bytearray(0x20000)
        ram[0x10000 + 0x67E1 : 0x10000 + 0x67E3] = (0x82BC).to_bytes(2, "little")
        proof = build_proof(trace, bytes(ram), b"png", {"frames": [{"state": "game_world"}]})
        self.assertEqual(proof["verdict"], "not_proven")


if __name__ == "__main__":
    unittest.main()
