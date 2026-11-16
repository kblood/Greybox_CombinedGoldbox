"""Offline checks for the conservative CoK runtime-player candidate analyzer."""
from __future__ import annotations

import unittest

from tools.analyze_cok_runtime_players import RECORD_SIZE, anchor_bytes, candidate_transitions, find_candidates


class CokRuntimePlayerAnalyzerTests(unittest.TestCase):
    def record(self) -> bytes:
        raw = bytearray(RECORD_SIZE)
        raw[0:7] = b"\x06GOBLIN"
        raw[16:28] = bytes(range(12))
        raw[89:91] = b"\x30\x07"
        raw[207:215] = bytes(range(8, 16))
        raw[231] = 0x80
        raw[269:272] = b"\x01\x02\x06"
        raw[275] = 0x36
        return bytes(raw)

    def test_candidate_needs_multiple_stable_fields_and_reports_title_local_xp(self) -> None:
        record = self.record()
        ram = bytearray(4096)
        start = 100
        ram[start:start + RECORD_SIZE] = record
        ram[start + 0x11B] = 9
        ram[start + 0x130:start + 0x132] = (0x1234).to_bytes(2, "little")
        ram[start + 0x132] = 8
        ram[start + 0x12C] = 7
        ram[start + 0x13C] = 22
        ram[start + 0x13E] = 3
        candidates = find_candidates(bytes(ram), record, len(anchor_bytes(record)))
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["offset"], "0x64")
        self.assertEqual(candidates[0]["coab_relative_candidate_bytes"], {"rolled_hp": 7, "flat_xp": 22, "per_hp_xp": 3})
        self.assertEqual(candidates[0]["cok_runtime_observation"], {
            "max_hp": 0, "control_morale": 128, "rolled_hp": 9, "flat_xp": 0x1234,
            "per_hp_xp": 8, "status": 0, "enemy_team": 0, "current_hp": 0, "movement_rate": 0,
        })

    def test_name_length_alone_is_not_a_candidate(self) -> None:
        record = self.record()
        ram = bytearray(4096)
        ram[100] = record[0]
        self.assertEqual(find_candidates(bytes(ram), record, 40), [])

    def test_transition_reports_only_title_local_fields_that_changed(self) -> None:
        snapshots = [
            {"label": "before", "candidates": [{"static_name": "BAAZ", "offset": "0x10", "cok_runtime_observation": {"max_hp": 9, "control_morale": 128, "rolled_hp": 9, "flat_xp": 81, "per_hp_xp": 8, "status": 0, "enemy_team": 1, "current_hp": 9, "movement_rate": 15}}]},
            {"label": "after", "candidates": [{"static_name": "BAAZ", "offset": "0x10", "cok_runtime_observation": {"max_hp": 9, "control_morale": 128, "rolled_hp": 9, "flat_xp": 81, "per_hp_xp": 8, "status": 0, "enemy_team": 1, "current_hp": 6, "movement_rate": 15}}]},
        ]
        change = candidate_transitions(snapshots)
        self.assertEqual(change[0]["changed_cok_fields"], ["current_hp"])
        self.assertEqual(change[0]["observations"][1]["cok_runtime_observation"]["current_hp"], 6)


if __name__ == "__main__":
    unittest.main()
