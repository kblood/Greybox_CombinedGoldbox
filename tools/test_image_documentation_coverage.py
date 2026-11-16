"""Synthetic checks for coverage joins; no game assets are read."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from image_documentation_coverage import audit


class CoverageTests(unittest.TestCase):
    def test_deduplicates_references_and_does_not_read_png_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def put(path, value):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(value), encoding="utf-8")

            pack = root / "pack"
            image = pack / "cok-generated/images/a.png"
            image.parent.mkdir(parents=True)
            image.write_bytes(b"not an image")
            put(pack / "manifest.json", {"items": []})
            put(pack / "anim/index.json", {"items": [], "imageSha256": {}})
            row = {"source": "images/a.png", "output": "images/a.png", "sourceSha256": "a", "outputSha256": "a"}
            put(pack / "cok-generated/manifest.json", {"assets": [row, row]})
            asset = {"decoded": {"sha256": "a"}, "description": {"status": "unknown", "visualDescription": "a tile"}, "gameConsumers": [{"status": "unknown"}]}
            for game in ("cok", "dok"):
                put(root / "docs/engine/research" / f"{game}-graphics-identity-registry-v1.json", {"assets": [asset, {"decoded": None}], "restyles": []})
            original = Path.open

            def guarded(path, *args, **kwargs):
                if path.suffix == ".png":
                    raise AssertionError("Audit opened an image")
                return original(path, *args, **kwargs)

            with patch.object(Path, "open", guarded):
                result = audit(pack, root)
            self.assertEqual(result["png_files"], 1)
            self.assertEqual(result["coverage"]["manifest_reference"], 1)
            self.assertEqual(result["coverage"]["registry_visual_description"], 1)
            self.assertNotIn("registry_nonunknown_consumer", result["coverage"])
            self.assertEqual(result["unreferenced_by_audited_manifests"], [])


if __name__ == "__main__":
    unittest.main()
