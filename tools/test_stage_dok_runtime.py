from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from tools.stage_dok_runtime import REQUIRED_ROUTE_FILES, SAVE_DIR_NAMES, build_stage


class StageDokRuntimeTests(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "source"
        source.mkdir(parents=True)
        for name in REQUIRED_ROUTE_FILES | {"ECL2.DAX", "GEO2.DAX", "MON1CHA.DAX", "ITEMS"}:
            (source / name).write_bytes(f"bytes:{name}".encode())
        save = source / "SAVE"
        save.mkdir()
        (save / "SAVGAMA.PTY").write_bytes(b"party-state")
        (save / "CHRDATA1.GAM").write_bytes(b"char-state")
        save_ch = source / "SAVE_CH"
        save_ch.mkdir()
        (save_ch / "read.txt").write_bytes(b"notes")
        (source / "unins000.exe").write_bytes(b"excluded")
        (source / "Manual.pdf").write_bytes(b"excluded, not a runtime suffix")
        return source

    def test_builds_minimal_stage_without_claiming_route_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            manifest = build_stage(source, root / "stage")
            self.assertFalse(manifest["route_ready"])
            self.assertEqual(manifest["status"], "save_stage_pending_route_validation")
            self.assertFalse((root / "stage" / "unins000.exe").exists())
            self.assertFalse((root / "stage" / "Manual.pdf").exists())
            self.assertTrue((root / "stage" / "ITEMS").exists())

    def test_stages_both_save_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            manifest = build_stage(source, root / "stage")
            for name in SAVE_DIR_NAMES:
                self.assertTrue((root / "stage" / name).is_dir())
            self.assertTrue((root / "stage" / "SAVE" / "SAVGAMA.PTY").exists())
            self.assertTrue((root / "stage" / "SAVE_CH" / "read.txt").exists())
            self.assertTrue(manifest["save_bundle_present"])
            paths = {row["path"] for row in manifest["files"]}
            self.assertIn("SAVE/SAVGAMA.PTY", paths)
            self.assertIn("SAVE_CH/read.txt", paths)

    def test_verifies_expected_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            game_hash = hashlib.sha256((source / "START.EXE").read_bytes()).hexdigest()
            manifest = build_stage(source, root / "stage", {"START.EXE": game_hash})
            self.assertEqual(manifest["file_count"], len(manifest["files"]))

    def test_rejects_hash_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                build_stage(source, root / "stage", {"START.EXE": "0" * 64})

    def test_rejects_missing_required_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            (source / "DKK.CFG").unlink()
            with self.assertRaisesRegex(ValueError, "missing"):
                build_stage(source, root / "stage")

    def test_rejects_missing_source_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "does-not-exist"
            with self.assertRaisesRegex(ValueError, "does not exist"):
                build_stage(source, root / "stage")

    def test_rejects_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            output = root / "stage"
            output.mkdir()
            with self.assertRaises(ValueError):
                build_stage(source, output)


if __name__ == "__main__":
    unittest.main()
