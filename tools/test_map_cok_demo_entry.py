import unittest

import map_cok_demo_entry as subject
from gen1_ecl_encounter_scan import DEFAULT_ADDRESS_ADDEND, GEN1_SHORT_WORD_SETS


class DemoEntryLinearizeTests(unittest.TestCase):
    def test_short_parlay_lands_on_following_combat(self):
        # Minimal code window at the normal 22-byte Gen1 header boundary:
        # short PARLAY #5 ; COMBAT ; EXIT.  The long dialect would consume the
        # COMBAT/EXIT bytes as extra PARLAY operands and lose both instructions.
        raw = bytes(22) + bytes((0x2C, 0x00, 0x05, 0x24, 0x00))

        instructions = subject.linearize_entry(
            raw,
            "initial_entry",
            22,
            DEFAULT_ADDRESS_ADDEND,
            word_sets=GEN1_SHORT_WORD_SETS,
        )

        self.assertEqual([item["opcode"] for item in instructions], [0x2C, 0x24, 0x00])
        self.assertEqual(instructions[0]["text"], "PARLAY #5")
        self.assertEqual(instructions[1]["text"], "COMBAT")


if __name__ == "__main__":
    unittest.main()
