from __future__ import annotations

import unittest

from tools.analyze_secret_combat_resume import build_proof, parse_model_json


class AnalyzeSecretCombatResumeTests(unittest.TestCase):
    def test_accepts_fenced_model_json(self) -> None:
        self.assertEqual(parse_model_json('```json\n{"frames": []}\n```'), {"frames": []})

    def test_accepts_bare_frame_array(self) -> None:
        # describe_screenshots.py's vision model sometimes returns a top-level JSON array instead
        # of {"frames": [...]} (observed live 2026-07-17 in the r4 evidence run's post-resume
        # classification) -- both must normalize to the same {"frames": [...]} shape.
        self.assertEqual(
            parse_model_json('```json\n[{"state": "game_world"}]\n```'),
            {"frames": [{"state": "game_world"}]},
        )

    def evidence(self) -> tuple[dict, bytes, bytes, dict, dict, dict, bytes, bytes, dict]:
        ds = 0x1000
        es = 0x0800
        base = ds << 4
        area_base = es << 4
        consumed_offset = (0x6A00 + (0x4CCD * 2)) & 0xFFFF
        tactical = bytearray(0x20000)
        consumed = bytearray(0x20000)
        tactical[base + 0x67E1 : base + 0x67E3] = (0x82BC).to_bytes(2, "little")
        consumed[base + 0x67E1 : base + 0x67E3] = (0x82C5).to_bytes(2, "little")
        tactical[base + 0x87CC : base + 0x87CE] = bytes((6, 5))
        consumed[base + 0x87CC : base + 0x87CE] = bytes((6, 0))
        consumed[area_base + consumed_offset : area_base + consumed_offset + 2] = (4).to_bytes(2, "little")
        trace = {
            "parser": {"ds": "1000", "es": "0800"},
            "cursor": {
                "load_monster_reached": True,
                "combat_reached": True,
                "injected_combat_victory": True,
                "resume_reached": True,
                "consumed_before": 0,
                "consumed_after": 4,
                "post_or_pc": 0x82C5,
                "resume_parser_breakpoint": "4465:0000",
                "resume_parser_breakpoint_reached": True,
                "resume_parser_segment": "4465",
                "resume_parser_image_exact": True,
                "setter_runtime_prologue_offset": "0x0507",
                "setter_runtime_write_offset": "0x0561",
                "setter_breakpoint": "4465:0561",
                "setter_file_offset": "GAME.OVR:0x9F94",
                "setter_breakpoint_reached": True,
                "setter_write_pointer": "2000:039A",
                "setter_write_alias_exact": True,
                "setter_dx": 4,
            },
        }
        mutation = lambda address, before, after: {
            "address": address,
            "length": 1,
            "before": before,
            "after": after,
            "mechanism": "GameLink v4 shared RAM compare-and-swap",
        }
        injection = {
            "schema_version": 1,
            "team_count": mutation(base + 0x87CD, "05", "00"),
            "combatants": [
                mutation(address, "01", "00")
                for address in (0x6D640, 0x6F359, 0x6F519, 0x6F6D9, 0x6F899)
            ],
        }
        return (
            trace,
            bytes(tactical),
            bytes(consumed),
            injection,
            {"frame": {"sequence": 10}},
            {"frame": {"sequence": 20}},
            b"tactical png",
            b"world png",
            {"frames": [{"state": "game_world", "looks_crashed": False, "visible_text": "AREA"}]},
        )

    def test_accepts_independent_memory_injection_and_visual_gates(self) -> None:
        proof = build_proof(*self.evidence())
        self.assertEqual(proof["verdict"], "combat_resumed_and_consumed")
        self.assertEqual(proof["resume"]["consumed_transition"], [0, 4])
        self.assertEqual(proof["resume"]["resolved_consumed_pointer"], "0800:039A")
        self.assertFalse(proof["bounded_outcome_control"]["natural_victory"])

    def test_rejects_parked_tactical_cursor_as_resume(self) -> None:
        evidence = list(self.evidence())
        consumed = bytearray(evidence[2])
        consumed[0x10000 + 0x67E1 : 0x10000 + 0x67E3] = (0x82BC).to_bytes(2, "little")
        evidence[2] = bytes(consumed)
        proof = build_proof(*evidence)
        self.assertEqual(proof["verdict"], "not_proven")

    def test_rejects_combat_post_frame(self) -> None:
        evidence = list(self.evidence())
        evidence[8] = {"frames": [{"state": "combat", "visible_text": "FIGHT VIEW AIM QUICK DONE"}]}
        proof = build_proof(*evidence)
        self.assertEqual(proof["verdict"], "not_proven")

    def test_rejects_ram_transition_without_setter_execution_gate(self) -> None:
        evidence = list(self.evidence())
        trace = evidence[0]
        trace["cursor"]["setter_breakpoint_reached"] = False
        trace["cursor"]["setter_write_alias_exact"] = False
        proof = build_proof(*evidence)
        self.assertEqual(proof["verdict"], "not_proven")

    def test_rejects_setter_without_resume_parser_relocation_gate(self) -> None:
        evidence = list(self.evidence())
        trace = evidence[0]
        trace["cursor"]["resume_parser_breakpoint_reached"] = False
        trace["cursor"]["resume_parser_image_exact"] = False
        proof = build_proof(*evidence)
        self.assertEqual(proof["verdict"], "not_proven")

    def test_accepts_generalized_live_hit_at_a_relocated_segment(self) -> None:
        # 2026-07-17 (r4): the setter's CODE segment is not stable run to run -- a live BPM-armed
        # capture proved a write at segment 4616, not the 4465 the original two-stage design assumed
        # (map_secret_runtime_setter.py's post-hoc RAM scan target). The analyzer must accept this
        # shape (no literal 4465:0561 match) as long as the DATA-defined resume contract -- word
        # 0->4, cursor 0x82C5/0x82C6, DX=4, and a live-observed CS:IP -- is independently satisfied.
        evidence = list(self.evidence())
        trace = evidence[0]
        trace["cursor"]["resume_parser_breakpoint"] = None
        trace["cursor"]["resume_parser_segment"] = None
        trace["cursor"]["resume_parser_image_exact"] = False
        trace["cursor"]["setter_runtime_prologue_offset"] = None
        trace["cursor"]["setter_runtime_write_offset"] = None
        trace["cursor"]["setter_breakpoint"] = None
        trace["cursor"]["setter_file_offset"] = None
        trace["cursor"]["hit_mechanism"] = "generalized_stop_post_write"
        trace["cursor"]["resume_parser_segment_observed_live"] = "4616"
        trace["cursor"]["resume_parser_offset_observed_live"] = "0F26"
        trace["cursor"]["setter_write_pointer"] = "4616:0F26"
        proof = build_proof(*evidence)
        self.assertEqual(proof["verdict"], "combat_resumed_and_consumed")
        self.assertTrue(proof["resume"]["generalized_live_match"])
        self.assertFalse(proof["resume"]["legacy_fixed_target_match"])
        self.assertEqual(proof["resume"]["hit_mechanism"], "generalized_stop_post_write")

    def test_rejects_generalized_hit_without_a_live_observed_pointer(self) -> None:
        evidence = list(self.evidence())
        trace = evidence[0]
        trace["cursor"]["resume_parser_breakpoint"] = None
        trace["cursor"]["resume_parser_segment"] = None
        trace["cursor"]["resume_parser_image_exact"] = False
        trace["cursor"]["setter_runtime_prologue_offset"] = None
        trace["cursor"]["setter_runtime_write_offset"] = None
        trace["cursor"]["setter_breakpoint"] = None
        trace["cursor"]["setter_file_offset"] = None
        trace["cursor"]["hit_mechanism"] = "generalized_stop_post_write"
        # No resume_parser_segment_observed_live/offset/setter_write_pointer supplied -- a bare
        # mechanism label without a live-observed pointer must not be enough on its own.
        proof = build_proof(*evidence)
        self.assertEqual(proof["verdict"], "not_proven")

    def test_accepts_resume_cursor_one_instruction_past_exit(self) -> None:
        # r1/r2/the 2026-07-15 natural run all post-hoc observed cursor 0x82C6 (one instruction past
        # the EXIT target 0x82C5) as an equally valid completed-resume shape when the checkpoint was
        # captured a moment after EXIT itself executed. Confirm the analyzer accepts it too.
        evidence = list(self.evidence())
        trace = evidence[0]
        trace["cursor"]["post_or_pc"] = 0x82C6
        consumed = bytearray(evidence[2])
        base = 0x1000 << 4
        consumed[base + 0x67E1 : base + 0x67E3] = (0x82C6).to_bytes(2, "little")
        evidence[2] = bytes(consumed)
        proof = build_proof(*evidence)
        self.assertEqual(proof["verdict"], "combat_resumed_and_consumed")


if __name__ == "__main__":
    unittest.main()
