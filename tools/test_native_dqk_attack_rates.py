"""Static contracts for native DQK attack-rate wiring.

The full cccombat-test.ps1 fixture runs under DOSBox. These checks keep its
source-byte controls, D0xx gate, kind order, and two-round expectations reviewable
without launching DOSBox or taking desktop focus.
"""
from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
ASM_SOURCE = (ROOT / "native/src/cccombat.asm").read_text(encoding="utf-8").lower()
ASM = "\n".join(
    re.sub(r"\s+", " ", line.split(";", 1)[0].strip())
    for line in ASM_SOURCE.splitlines()
)
FIXTURE = (ROOT / "native/cccombat-test.ps1").read_text(encoding="utf-8").lower()


def allowance(rate: int, round_number: int) -> int:
    """Retail DQK phase: first round even phase; odd remainder lands in round 2."""
    return (rate // 2) + int(rate % 2 == 1 and round_number % 2 == 0)


class NativeDqkAttackRateContract(unittest.TestCase):
    def test_decode_is_gated_to_trusted_dqk_hlib(self) -> None:
        decode = ASM[ASM.index(".dqk_decode:") : ASM.index(".dqk_decode_npc:")]
        self.assertIn("cmp byte [mon_glib], 0", decode)
        self.assertIn("cmp byte [fxbuf+17], 0d0h", decode)
        self.assertIn("movzx ax, byte [si+dqk_l_abil+59]", decode)
        self.assertIn("mov al, [si+dqk_l_abil+60]", decode)
        self.assertIn("mov ah, 80h", decode)
        self.assertIn("[di+c_halfatt]", decode)
        self.assertIn("[di+c_attacks]", decode)
        self.assertIn("[sec_dcount+bx]", decode)
        self.assertIn("[sec_dsides+bx]", decode)
        self.assertIn("[sec_dbonus+bx]", decode)

    def test_invalid_positive_secondary_profile_rejects_trusted_dqk(self) -> None:
        fill_start = ASM.index("fill_enemy_from_mon:")
        fill = ASM[fill_start : ASM.index("coab_store_runtime_attack2:", fill_start)]
        sniff = ASM[ASM.index("sniff_dqk_mon_direct:") : ASM.index("try_dqk_selected_npc:")]
        self.assertIn("cmp byte [monraw+dqk_l_abil+60], 0", sniff)
        self.assertIn(".secondary_fail:", sniff)
        self.assertIn("inc bx", sniff)
        self.assertIn("or bx, bx", fill)
        self.assertIn("cmp byte [mon_glib], 0", fill)
        self.assertIn("cmp byte [fxbuf+17], 0d0h", fill)
        self.assertIn("je .fail", fill)

    def test_ai_uses_kind_two_then_kind_one_and_preserves_zero(self) -> None:
        ai = ASM[ASM.index("ai_take_turn:") : ASM.index("attacks_available:")]
        dqk = ai[ai.index(".dqk_melee:") :]
        self.assertLess(dqk.index("movzx ax, byte [si+c_attacks]"), dqk.index("mov ax, [si+c_halfatt]"))
        self.assertEqual(dqk.count("call dqk_attacks_this_round"), 2)
        self.assertIn("mov byte [attack_secondary], 1", dqk)
        self.assertIn("mov byte [attack_secondary], 0", dqk)

        helper = ASM[ASM.index("dqk_attacks_this_round:") : ASM.index("secondary_attack_present_cur:")]
        self.assertIn("shr ax, 1", helper)
        self.assertIn("test byte [round], 1", helper)
        self.assertIn("inc ax", helper)
        self.assertNotIn("cmp ax, 1", helper)

    def test_retail_two_round_examples_and_odd_counterexample(self) -> None:
        cases = {
            (4, 2): [["S", "P", "P"], ["S", "P", "P"]],
            (3, 6): [["S", "S", "S", "P"], ["S", "S", "S", "P", "P"]],
            (1, 0): [[], ["P"]],
            (0, 2): [["S"], ["S"]],
            (0, 0): [[], []],
        }
        for (primary, secondary), expected in cases.items():
            with self.subTest(primary=primary, secondary=secondary):
                actual = []
                for round_number in (1, 2):
                    actual.append(["S"] * allowance(secondary, round_number))
                    actual[-1].extend(["P"] * allowance(primary, round_number))
                self.assertEqual(actual, expected)

    def test_dosbox_fixture_mutates_each_byte_and_pins_all_shapes(self) -> None:
        self.assertIn("$dqkrate12raw[0x78 + 59] = 1", FIXTURE)
        self.assertIn("$dqkrate40raw[0x78 + 60] = 0", FIXTURE)
        self.assertIn("$dqkrate00raw[0x78 + 59] = 0", FIXTURE)
        self.assertIn("$dqkrate00raw[0x78 + 60] = 0", FIXTURE)
        for name in ("dqkr42", "dqkr36", "dqkr10", "dqkr02", "dqkr40", "dqkr12", "dqkr00"):
            self.assertIn(f"assert-dqkrate kinds '{name}'".replace(" ", ""), FIXTURE.replace(" ", ""))
            self.assertIn(f"c:\\{name}.glb", FIXTURE)
        self.assertIn("odd-rate counterexample", FIXTURE)
        self.assertIn("1s','1s','1s','1p','2s','2s','2s','2p','2p", FIXTURE)


if __name__ == "__main__":
    unittest.main()
