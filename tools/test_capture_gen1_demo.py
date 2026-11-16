import unittest
from pathlib import Path


class CaptureGen1DemoScriptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = (Path(__file__).with_name("capture_gen1_demo.ps1")).read_text(encoding="utf-8")

    def test_uses_only_gamelink_for_guest_input_and_capture(self):
        self.assertIn("dosbox_gamelink.py", self.text)
        self.assertIn("dump-memory", self.text)
        self.assertIn("screenshot", self.text)
        self.assertNotIn("SendKeys", self.text.replace("host SendKeys", ""))
        self.assertNotIn("SetForegroundWindow", self.text)
        self.assertNotIn("SendInput", self.text)

    def test_stops_only_the_owned_process_id(self):
        self.assertIn("Stop-Process -Id $ownedPid", self.text)
        self.assertNotIn("Stop-Process -Name", self.text)

    def test_carries_profile_specific_retail_launch_commands(self):
        self.assertIn("'gateway-to-the-savage-frontier' = 'GAME.EXE UseStart'", self.text)
        self.assertIn("'pools-of-darkness' = 'GAME.EXE 2 2 Helm'", self.text)
        self.assertIn("'treasures-of-the-savage-frontier' = 'GAME.EXE 2 2 Helm'", self.text)


if __name__ == "__main__":
    unittest.main()
