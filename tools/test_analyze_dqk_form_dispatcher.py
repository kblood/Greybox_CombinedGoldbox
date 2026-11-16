import unittest
from pathlib import Path

from tools.analyze_dqk_form_dispatcher import (
    DISPATCH_CODE_TABLE,
    DISPATCH_SEG,
    DISPATCH_TARGET_TABLE,
    RAM_SIZE,
    analyze_snapshot,
    normalize_key,
    physical,
)


class DqkFormDispatcherTests(unittest.TestCase):
    def test_table_match_and_low_byte_fallback(self) -> None:
        ram = bytearray(RAM_SIZE)
        table = physical(DISPATCH_SEG, DISPATCH_CODE_TABLE)
        targets = physical(DISPATCH_SEG, DISPATCH_TARGET_TABLE)
        ram[table : table + 2] = (0x5000).to_bytes(2, "little")
        ram[targets : targets + 2] = (0x021A).to_bytes(2, "little")
        target = physical(DISPATCH_SEG, 0x021A)
        ram[target : target + 3] = bytes.fromhex("B8 04 01")

        self.assertEqual(normalize_key(bytes(ram), 0x5000)["normalized_ax"], "0x0104")
        self.assertEqual(normalize_key(bytes(ram), 0x1C0D)["normalized_ax"], "0x000D")
        self.assertEqual(normalize_key(bytes(ram), 0x1C0D)["path"], "low-byte fallback")

    def test_retail_checkpoint_when_present(self) -> None:
        checkpoint = Path(
            "build/dqk-who-dispatch-r1-20260728/who-after-down-checkpoint/full.bin"
        )
        if not checkpoint.is_file():
            self.skipTest("ignored retail RAM checkpoint is not installed")

        report = analyze_snapshot(checkpoint)
        self.assertEqual(report["dispatcher"]["down"]["matched_index"], 54)
        self.assertEqual(report["dispatcher"]["down"]["normalized_ax"], "0x0104")
        self.assertEqual(report["dispatcher"]["bios_enter"]["matched_index"], None)
        self.assertEqual(report["who_selector"]["active_pointer"], "5794:033C")
        self.assertEqual(report["who_selector"]["active_next_pointer"], "5794:04DA")
        self.assertEqual(report["form"]["last_normalized_key"], "0x0108")
        self.assertEqual(report["form"]["flagged_input"], 0)


if __name__ == "__main__":
    unittest.main()
