import unittest

import analyze_gen1_demo_sequences as subject


def report(texts):
    return {
        "profile_id": "synthetic",
        "boot_dispatch": {"resolved": True, "structural_match_ratio": 1.0},
        "demo_block_known": True,
        "demo_file": "ECL1.DAX",
        "demo_block_id": 2,
        "demo_chain": [{
            "instructions": [
                {"opcode": opcode, "text": text}
                for opcode, text in texts
            ],
        }],
    }


class DemoSequenceAnalysisTests(unittest.TestCase):
    def test_behavioral_walk_and_combat_signature(self):
        result = subject.analyze_report(report([
            (0x21, "LOAD_FILES #32, #127, #255"),
            (0x37, "LOAD_PIECES #2, #127, #127"),
            (0x09, "SAVE #5, [1:0xc04b]"),
            (0x09, "SAVE #15, [1:0xc04c]"),
            (0x09, "SAVE #0, [1:0xc04d]"),
            (0x09, "SAVE #14, [1:0xc04b]"),
            (0x2D, "CALL [1:0x2dcb]"),
            (0x2D, "CALL [1:0xc01e]"),
            (0x24, "COMBAT"),
        ]))

        self.assertTrue(result["scripted_first_person_walk_signature"])
        self.assertEqual(result["classification"], "scripted-first-person-walk-plus-combat")
        self.assertEqual(result["call_roles"]["movePositionForward"], 1)

    def test_pictures_and_combat_do_not_imply_walking(self):
        result = subject.analyze_report(report([
            (0x0E, "PICTURE #80"),
            (0x24, "COMBAT"),
        ]))

        self.assertFalse(result["scripted_first_person_walk_signature"])
        self.assertEqual(result["classification"], "combat-without-walk-signature")


if __name__ == "__main__":
    unittest.main()
