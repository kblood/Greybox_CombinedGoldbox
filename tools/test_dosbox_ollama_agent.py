from __future__ import annotations

import unittest

from tools import dosbox_ollama_agent


class DosboxOllamaAgentTests(unittest.TestCase):
    def test_extracts_fenced_json_and_normalizes_allowed_action(self) -> None:
        response = '```json\n{"observation":{"state":"main_menu"},"action":"KP_ENTER","done":false}\n```'
        parsed = dosbox_ollama_agent.extract_json(response)
        decision = dosbox_ollama_agent.normalize_decision(parsed, {"kp_enter", "stop"})
        self.assertEqual(decision["action"], "kp_enter")
        self.assertFalse(decision["done"])

    def test_rejects_disallowed_model_action(self) -> None:
        with self.assertRaisesRegex(ValueError, "disallowed action"):
            dosbox_ollama_agent.normalize_decision({"action": "delete"}, {"stop"})

    def test_stop_action_is_always_terminal(self) -> None:
        decision = dosbox_ollama_agent.normalize_decision({"action": "stop", "done": False}, {"stop"})
        self.assertTrue(decision["done"])

    def test_non_stop_action_overrides_contradictory_done_flag(self) -> None:
        decision = dosbox_ollama_agent.normalize_decision(
            {"action": "enter", "done": True}, {"enter", "stop"}
        )
        self.assertFalse(decision["done"])

    def test_prompt_carries_goal_allowlist_and_mechanical_feedback(self) -> None:
        prompt = dosbox_ollama_agent.build_prompt(
            "Reach LOAD SAVED GAME",
            ("down", "kp_enter", "stop"),
            2,
            {"action": "down", "frame_sequence_changed": True},
        )
        self.assertIn("Reach LOAD SAVED GAME", prompt)
        self.assertIn("down, kp_enter, stop", prompt)
        self.assertIn('"frame_sequence_changed":true', prompt)
        self.assertIn("reason under 20 words", prompt)

    def test_prompt_rejects_repeating_action_after_identical_framebuffer(self) -> None:
        prompt = dosbox_ollama_agent.build_prompt(
            "Leave party assembly",
            ("right", "kp_enter", "stop"),
            9,
            {"action": "kp_enter", "framebuffer_changed": False},
        )
        self.assertIn("byte-identical after kp_enter", prompt)
        self.assertIn("choose a different action", prompt)

    def test_sequence_goal_keeps_checkpoints_ordered_in_one_process(self) -> None:
        goal = dosbox_ollama_agent.sequence_goal(
            "Complete the Gateway route",
            ("Encounter visible", "FIGHT/LEAVE choice visible", "Active 2D combat visible"),
            1,
        )
        self.assertIn("Current checkpoint 2/3", goal)
        self.assertIn("FIGHT/LEAVE choice visible", goal)
        self.assertIn("same DOSBox process", goal)

    def test_host_guard_stops_before_visible_goldbox_destination_menu(self) -> None:
        reason = dosbox_ollama_agent.ambiguous_goldbox_menu({
            "visible_text": "WHERE DO YOU WISH TO GO? HALL COMMANDANT ARMOURY NEXT LEAVE",
        })
        self.assertEqual(reason, "visible destination menu")

    def test_host_guard_does_not_confuse_a_continuation_prompt_for_a_menu(self) -> None:
        reason = dosbox_ollama_agent.ambiguous_goldbox_menu({
            "visible_text": "SIR STRONGSWORD GIVES HIS TITHE. PRESS ENTER TO CONTINUE",
        })
        self.assertIsNone(reason)


if __name__ == "__main__":
    unittest.main()
