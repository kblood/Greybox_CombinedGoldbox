from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from tools.inventory_gateway_save import inventory


class InventoryGatewaySaveTests(unittest.TestCase):
    def test_finds_overlay_save_and_classifies_sidecars(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            install = Path(temp)
            save = install / "cloud_saves" / "SAVE"
            save.mkdir(parents=True)
            (save / "SAVGAMA.DAT").write_bytes(b"save")
            (save / "CHRDATA1.SAV").write_bytes(b"character")
            (install / "dosbox_gateway_single.conf").write_text("config")
            (install / "GAME.CFG").write_text("C:\\SAVE\\")

            report = inventory(install)

            self.assertTrue(report["save_bundle_present"])
            self.assertFalse(report["route_ready"])
            self.assertEqual(report["save_container_count"], 1)
            self.assertEqual(
                [row["kind"] for row in report["files"]],
                ["character_sidecar", "save_container"],
            )
            self.assertEqual(len(report["config_files"]), 2)

    def test_empty_roots_do_not_claim_a_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            install = Path(temp)
            (install / "SAVE").mkdir()
            report = inventory(install)
            self.assertFalse(report["save_bundle_present"])
            self.assertEqual(report["files"], [])

    def test_unrelated_file_is_not_a_save_container(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            install = Path(temp)
            save = install / "cloud_saves" / "SAVE"
            save.mkdir(parents=True)
            (save / "README.TXT").write_text("not a save")
            report = inventory(install)
            self.assertFalse(report["save_bundle_present"])
            self.assertEqual(report["files"][0]["kind"], "other_sidecar")


if __name__ == "__main__":
    unittest.main()
