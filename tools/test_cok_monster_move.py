"""CoK monster movement mapping (Task 113): +0xD5 -> combatant +0x198 -> CalcMoves.

Pure-Python checks against the retail GAME.OVR bytes and MON archives (skipped when
absent) plus the native source, so the doc's mapping cannot drift from either.
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cok_monster_move as m

OVR = os.path.join(m.COK, "GAME.OVR")
ASM = os.path.join(m.REPO, "native", "src", "cccombat.asm")
HDR = 0  # tools/disasm_cok.py addresses are plain file offsets


def _ovr():
    if not os.path.exists(OVR):
        raise unittest.SkipTest("Champions of Krynn/GAME.OVR not present")
    return open(OVR, "rb").read()


class MappingTests(unittest.TestCase):
    def test_clamp_matches_calcmoves(self):
        self.assertEqual([m.squares(v) for v in (0, 1, 6, 30, 96, 97, 255)], [1, 1, 6, 30, 96, 1, 1])
        self.assertEqual(m.half_squares(6), 12)
        self.assertEqual(m.half_squares(12), 24)

    def test_budgets_differ_for_6_and_12(self):
        # The e11 detour used by native/cccombat-test.ps1: steps cost 2,2,3,3 then 3.
        steps = [2, 2, 3, 3, 3]
        self.assertEqual(m.affordable_prefix(steps, 6), 4)    # 2+2+3+3 = 10 <= 12 < 13
        self.assertGreater(m.affordable_prefix(steps, 12), 4)
        self.assertEqual(m.affordable_prefix(steps, 4), 3)    # the old fixed fallback: 7 <= 8 < 10

    def test_step_cost_ratio_is_three_to_two(self):
        self.assertEqual((m.ORTHOGONAL_HALF, m.DIAGONAL_HALF), (2, 3))


class RetailEvidenceTests(unittest.TestCase):
    def test_record_byte_is_copied_to_combatant_198_at_3755d(self):
        d = _ovr()
        # mov al,es:[di+0xd5] ; les di,[bp+6] ; mov es:[di+0x198],al
        self.assertEqual(d[0x37555:0x37555 + 5], bytes.fromhex("268a85d500"))
        self.assertEqual(d[0x3755A:0x3755A + 3], bytes.fromhex("c47e06"))
        self.assertEqual(d[0x3755D:0x3755D + 5], bytes.fromhex("2688859801"))

    def test_armour_weight_path_also_sources_d5_at_3681b(self):
        d = _ovr()
        self.assertEqual(d[0x36813:0x36813 + 5], bytes.fromhex("268a85d500"))
        self.assertEqual(d[0x3681B:0x3681B + 5], bytes.fromhex("2688859801"))

    def test_calcmoves_reads_198_clamps_1_96_and_doubles(self):
        d = _ovr()
        self.assertEqual(d[0x14EC0:0x14EC0 + 5], bytes.fromhex("268a859801"))
        # cmp [bp-2],1 ; jb ; cmp [bp-2],0x60 ; jbe ; mov [bp-2],1
        self.assertEqual(d[0x14EE9:0x14EE9 + 16], bytes.fromhex("807efe017206807efe607604c646fe01"))
        self.assertEqual(d[0x14EFE:0x14EFE + 2], bytes.fromhex("d1e0"))   # shl ax,1

    def test_census_values_are_the_documented_alphabet(self):
        c = m.census()
        if not c:
            self.skipTest("CoK MON*CHA.DAX not present")
        self.assertEqual(sum(c.values()), 88)
        self.assertEqual(sorted(c), [6, 9, 12, 15, 24, 30])
        self.assertTrue(all(1 <= v <= 96 for v in c))

    def test_wrong_offset_does_not_give_the_alphabet(self):
        # Null: the neighbouring byte must NOT reproduce the alphabet, or the offset
        # pin above would hold for any nearby byte.
        import collections
        wrong = collections.Counter()
        for n in (1, 2, 3):
            p = os.path.join(m.COK, f"MON{n}CHA.DAX")
            if not os.path.exists(p):
                self.skipTest("CoK MON*CHA.DAX not present")
            for _b, raw in m.mon_records(p):
                wrong[raw[m.MOVE_OFFSET - 1]] += 1
        self.assertNotEqual(sorted(wrong), [6, 9, 12, 15, 24, 30])


class NativeSourceTests(unittest.TestCase):
    def assert_move_contract(self, src):
        cok = src.split("\n.cok:\n", 1)[1].split("\n.dok:\n", 1)[0]
        code = " ".join(line.split(";", 1)[0].strip() for line in cok.splitlines())
        self.assertRegex(code, r"mov\s+al,\s*\[monraw\+213\]\s+call\s+clamp_move_al\s+mov\s+\[di\+C_MOVE\],\s*ax")
        helper = src.split("\nclamp_move_al:\n", 1)[1].split("\nDEFAULT_MOVE_CELLS", 1)[0]
        helper = " ".join(line.split(";", 1)[0].strip() for line in helper.splitlines())
        self.assertRegex(helper, r"xor\s+ah,\s*ah\s+dec\s+ax\s+cmp\s+ax,\s*95\s+jbe\s+\.ok\s+xor\s+ax,\s*ax\s+\.ok:\s+inc\s+ax\s+ret")

    def test_cok_branch_reads_d5_with_the_calcmoves_clamp(self):
        src = open(ASM, encoding="utf-8").read()
        self.assert_move_contract(src)

    def test_move_contract_rejects_offset_bound_and_zero_mutations(self):
        src = open(ASM, encoding="utf-8").read()
        self.assert_move_contract(src)
        prefix, helper = src.split("\nclamp_move_al:\n", 1)
        for mutated in (
            src.replace("[monraw+213]", "[monraw+212]", 1),
            prefix + "\nclamp_move_al:\n" + helper.replace("cmp     ax, 95", "cmp     ax, 94", 1),
            prefix + "\nclamp_move_al:\n" + helper.replace("xor     ax, ax", "mov     ax, 1", 1),
        ):
            self.assertNotEqual(mutated, src)
            with self.assertRaises(AssertionError):
                self.assert_move_contract(mutated)

    def test_other_titles_keep_the_fixed_default(self):
        src = open(ASM, encoding="utf-8").read()
        dok = src.split("\n.dok:\n", 1)[1].split("\n.pool:\n", 1)[0]
        self.assertNotIn("C_MOVE", dok)


if __name__ == "__main__":
    unittest.main()
