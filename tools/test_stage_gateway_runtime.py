from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from tools.stage_gateway_runtime import REQUIRED_ROUTE_FILES, build_stage


class StageGatewayRuntimeTests(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "source"
        source.mkdir()
        for name in REQUIRED_ROUTE_FILES | {"START1.EXE", "MON5CHA.DAX", "ITEMS.1", "unins000.exe"}:
            (source / name).write_bytes(f"bytes:{name}".encode())
        (source / "Rulebook.pdf").write_bytes(b"excluded")
        (source / "SAVE").mkdir()
        return source

    def test_builds_minimal_stage_without_claiming_route_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            manifest = build_stage(source, root / "stage")
            self.assertFalse(manifest["route_ready"])
            self.assertEqual(manifest["status"], "base_stage_no_save")
            self.assertFalse((root / "stage" / "Rulebook.pdf").exists())
            self.assertFalse((root / "stage" / "unins000.exe").exists())
            self.assertTrue((root / "stage" / "ITEMS.1").exists())

    def test_copies_save_sidecars_and_verifies_expected_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            save = source / "SAVE" / "SAVGAMA.DAT"
            save.write_bytes(b"save")
            game_hash = hashlib.sha256((source / "GAME.EXE").read_bytes()).hexdigest()
            manifest = build_stage(source, root / "stage", {"GAME.EXE": game_hash})
            self.assertTrue(manifest["save_bundle_present"])
            self.assertFalse(manifest["route_ready"])
            self.assertEqual(manifest["status"], "save_stage_pending_route_validation")
            self.assertEqual(manifest["save_files"][0]["path"], "SAVE/SAVGAMA.DAT")

    def test_copies_an_explicit_external_save_bundle_without_promoting_route(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            external = root / "external-save"
            external.mkdir()
            (external / "SAVGAMA.DAT").write_bytes(b"external save")

            manifest = build_stage(source, root / "stage", save_source=external)

            self.assertEqual(manifest["save_source"], str(external.resolve()))
            self.assertTrue(manifest["save_bundle_present"])
            self.assertFalse(manifest["route_ready"])
            self.assertEqual((root / "stage" / "SAVE" / "SAVGAMA.DAT").read_bytes(), b"external save")

    def test_rejects_missing_explicit_save_source(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.make_source(root)
            with self.assertRaisesRegex(ValueError, "save source"):
                build_stage(source, root / "stage", save_source=root / "missing")

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
