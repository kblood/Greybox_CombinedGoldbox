"""Pure parsing checks for the CoK DEBUGBOX/GameLink paced-edge worker."""
from __future__ import annotations

import unittest

from tools.cok_debugger_paced_input import key_code, registers, stopped


class DebuggerPacedInputTests(unittest.TestCase):
    def test_running_marker_is_not_stopped(self) -> None:
        self.assertFalse(stopped("DS=13EA\n(Running)\n"))

    def test_stopped_register_snapshot(self) -> None:
        console = "EAX=0000 DS=13EA SS=1CB5\nCS=1186 EIP=0000031D ESP=00003ECE\n"
        self.assertTrue(stopped(console))
        self.assertEqual(registers(console), {"ds": "13EA", "ss": "1CB5", "cs": "1186", "eip": "0000031D", "esp": "00003ECE"})

    def test_resolves_game_link_key_to_scan_code(self) -> None:
        self.assertEqual(key_code("ENTER"), 0x1C)

    def test_rejects_unknown_game_link_key(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported GameLink key"):
            key_code("not-a-key")


if __name__ == "__main__":
    unittest.main()
