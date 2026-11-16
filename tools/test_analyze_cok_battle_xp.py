"""Unit checks for the conservative CoK battle-XP snapshot reporter."""
from __future__ import annotations

import unittest

from tools.analyze_cok_battle_xp import base_xp, pooled_money_xp, u32_slots


class CokBattleXpTests(unittest.TestCase):
    def test_title_local_base_xp(self) -> None:
        self.assertEqual(base_xp({"flat_xp": 81, "per_hp_xp": 8, "rolled_hp": 9}), 153)

    def test_money_tail_uses_its_actual_divisors(self) -> None:
        self.assertEqual(pooled_money_xp([100, 20, 10, 1, 2, 250, 2200]), 7)

    def test_explicit_segment_window(self) -> None:
        ram = bytearray(0x30000)
        start = 0x1000 * 16 + 0x6B0C
        for index, value in enumerate([200, 0, 0, 16, 0, 0, 0]):
            ram[start + index * 4:start + index * 4 + 4] = value.to_bytes(4, "little")
        report = u32_slots(bytes(ram), 0x1000)
        self.assertEqual(report["slots_u32"], [200, 0, 0, 16, 0, 0, 0])
        self.assertEqual(report["converted_xp"], 18)


if __name__ == "__main__":
    unittest.main()
