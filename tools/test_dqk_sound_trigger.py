"""Pins for tools/dqk_sound_trigger.py (skips cleanly when DQK data is absent)."""
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dqk_sound_trigger as T  # noqa: E402

D = T.find_dqk_dir()


@unittest.skipUnless(D, "DQK.EXE / DISK1/SOUNDS.GLB not available")
class RealBytes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.exe = (D / "DQK.EXE").read_bytes()
        cls.glb = (D / "DISK1" / "SOUNDS.GLB").read_bytes()

    def test_all_pins_hold(self):
        self.assertEqual(T.check_pins(self.exe, self.glb), [])

    def test_id_0x0b_is_member_8_at_7418(self):
        t = T.build_table(self.exe, self.glb)
        self.assertEqual((t[0xB]["member"], t[0xB]["rate"], t[0xB]["name"]), (8, 7418, "walk"))
        # creature rewrites 0xE / 0xF
        self.assertEqual((t[0xE]["member"], t[0xE]["rate"]), (11, 7418))
        self.assertEqual((t[0xF]["member"], t[0xF]["rate"]), (12, 7418))

    def test_rate_buckets(self):
        t = T.build_table(self.exe, self.glb)
        self.assertEqual({i for i, r in t.items() if r["rate"] == 11127}, {6, 9})   # die, lightning
        self.assertEqual({i for i, r in t.items() if r["rate"] == 5564}, {0xC})     # fireball

    def test_unrelated_member_control(self):
        # An unrelated id must NOT share walk's member or its payload bytes.
        t = T.build_table(self.exe, self.glb)
        self.assertNotEqual(t[0xB]["member"], t[0x9]["member"])
        self.assertNotEqual(t[0xB]["rate"], t[0x9]["rate"])
        self.assertNotEqual(t[0xB]["payload_len"], t[0x9]["payload_len"])

    def test_non_dig4_ids_have_no_member(self):
        for sid in (0, 1, 2, 0x10, 0x20, 0x27, 0x28, 0x29, 0xFF):
            self.assertIsNone(T.id_to_member(sid))
        self.assertIn("XMI", T.classify(0x20))
        self.assertIn("XMI", T.classify(0x27))

    def test_wrong_rate_mutation_is_red(self):
        # Member 8 (id 0x0B) header rate 7418 -> 11127 must violate a pin.
        a = struct.unpack("<I", self.glb[16 + 32:16 + 36])[0]
        mut = bytearray(self.glb)
        mut[a:a + 2] = struct.pack(">H", 11127)
        bad = T.check_pins(self.exe, bytes(mut))
        self.assertTrue(any("member 8 rate 11127" in b for b in bad), bad)

    def test_wrong_id_offset_mutation_is_red(self):
        mut = bytearray(self.exe)
        i = mut.index(bytes.fromhex("83ef03"), 0x1242C)
        mut[i + 2] = 0x04                      # id-4 instead of id-3
        self.assertTrue(T.check_pins(self.exe[:0] + bytes(mut), self.glb))

    def test_wrong_caller_id_mutation_is_red(self):
        mut = bytearray(self.exe)
        mut[0x54923 - 4 + 1] = 0x0A            # lightning breath 9 -> 0xA
        bad = T.check_pins(bytes(mut), self.glb)
        self.assertTrue(any("0x54923" in b for b in bad), bad)

    def test_exploration_step_is_0x43b26_not_combat_move(self):
        self.assertEqual(T.scan_playsound_callers(self.exe)[0x43B2A], 0x0B)
        self.assertEqual(T.CALLER_CONTEXT[0x43B2A][1], 0x43B26)
        self.assertIn("COMBAT", T.CALLER_CONTEXT[0x2560A][2])

    def test_exploration_context_mutation_is_red(self):
        mut = bytearray(self.exe)
        mut[0x441ED] = 0x02                    # passability test == 2 instead of 1
        self.assertTrue(any("exploration-step" in b for b in T.check_pins(bytes(mut), self.glb)))
        mut = bytearray(self.exe)
        mut[0x25528] = 0x06                    # combat move subtracts from +6 not +7
        self.assertTrue(any("combat-move" in b for b in T.check_pins(bytes(mut), self.glb)))


if __name__ == "__main__":
    unittest.main()
