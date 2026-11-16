from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from tools.stage_pool_runtime import GAME_SUBDIR, REQUIRED_ROUTE_FILES, build_stage


class StagePoolRuntimeTests(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "source"
        game_dir = source / GAME_SUBDIR
        game_dir.mkdir(parents=True)
        for name in REQUIRED_ROUTE_FILES | {"ECL2.DAX", "GEO2.DAX", "ITEMS", "SAVGAMA.DAT", "CHRDATA1.SAV"}:
            (game_dir / name).write_bytes(f"bytes:{name}".encode())
        (source / "Manual.pdf").write_bytes(b"excluded, one level up")
        (game_dir / "unins000.exe").write_bytes(b"excluded")
        return source

    def test_builds_minimal_stage_without_claiming_route_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            manifest = build_stage(source, root / "stage")
            self.assertFalse(manifest["route_ready"])
            self.assertEqual(manifest["status"], "base_stage_no_save")
            self.assertEqual(manifest["launch"]["dos_working_dir"], GAME_SUBDIR)
            self.assertFalse((root / "stage" / GAME_SUBDIR / "unins000.exe").exists())
            self.assertFalse((root / "stage" / "Manual.pdf").exists())
            self.assertTrue((root / "stage" / GAME_SUBDIR / "ITEMS").exists())

    def test_preserves_pool_subdirectory_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            manifest = build_stage(source, root / "stage")
            self.assertTrue((root / "stage" / GAME_SUBDIR / "START.EXE").exists())
            self.assertTrue((root / "stage" / GAME_SUBDIR / "GAME.OVR").exists())
            paths = {row["path"] for row in manifest["files"]}
            self.assertIn(f"{GAME_SUBDIR}/START.EXE", paths)
            self.assertIn(f"{GAME_SUBDIR}/GAME.OVR", paths)

    def test_detects_retail_shipped_save_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            manifest = build_stage(source, root / "stage")
            self.assertTrue(manifest["save_bundle_present"])

    def test_verifies_expected_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            game_hash = hashlib.sha256((source / GAME_SUBDIR / "START.EXE").read_bytes()).hexdigest()
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
            (source / GAME_SUBDIR / "POOL.CFG").unlink()
            with self.assertRaisesRegex(ValueError, "missing"):
                build_stage(source, root / "stage")

    def test_rejects_missing_game_subdirectory(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source"
            source.mkdir()
            with self.assertRaisesRegex(ValueError, "subdirectory"):
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
