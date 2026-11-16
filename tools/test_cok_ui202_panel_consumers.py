"""Focused mutation and idempotence checks for UI-202 panel evidence."""
from __future__ import annotations

import copy
import contextlib
import hashlib
import io
import json
import struct
import sys
import tempfile
import unittest
import zlib
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_ui202_panel_consumers as panels


ROOT = Path(__file__).resolve().parents[1]


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)


def fixture_png(tile: int) -> bytes:
    rgba = bytes((tile, 255 - tile, tile ^ 0x5A, 255))
    return (b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
            + png_chunk(b"IDAT", zlib.compress(b"\0" + rgba))
            + png_chunk(b"IEND", b""))


def inputs(testcase):
    registry = json.loads((ROOT / panels.REGISTRY_PATH).read_text(encoding="utf-8"))
    census = json.loads((ROOT / panels.CENSUS_PATH).read_text(encoding="utf-8"))
    base = json.loads((ROOT / panels.BASE_RECEIPT_PATH).read_text(encoding="utf-8"))
    temp = tempfile.TemporaryDirectory()
    testcase.addCleanup(temp.cleanup)
    decoded_root = Path(temp.name)
    target_ids = {f"cok/dos-ega/disk1/8x8d1.dax/block/202/tile/{tile}" for tile in panels.TILES}
    for asset in registry["assets"]:
        if asset["id"] not in target_ids:
            continue
        tile = asset["locator"]["tileIndex"]
        data = fixture_png(tile)
        sha256 = hashlib.sha256(data).hexdigest()
        asset["decoded"]["sha256"] = sha256
        relative = f"images/{sha256}.png"
        asset["decoded"]["path"] = relative
        target = decoded_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return registry, census, base, decoded_root


class PanelConsumersTests(unittest.TestCase):
    def test_receipt_pins_six_tiles_and_eleven_current_panel_routes(self):
        registry, census, base, decoded_root = inputs(self)
        receipt = panels.build_receipt(registry, census, base, decoded_root)

        self.assertEqual(len(receipt["panels"]), 11)
        self.assertEqual(len({row["id"] for row in receipt["panels"]}), 11)
        self.assertEqual([row["tileIndex"] for row in receipt["tiles"]], list(range(20, 26)))
        self.assertTrue(all(len(row["panelIds"]) == 11 for row in receipt["tiles"]))
        self.assertTrue(receipt["sharedRenderer"]["condition"].startswith("frameTiles is non-null"))
        self.assertIn("runtime observation", receipt["limits"][0])
        routes = {route["id"] for panel in receipt["panels"] for route in panel["routes"]}
        self.assertTrue({"companion-automap-tab", "companion-hud-tab", "companion-reference-tab",
                         "companion-journal-tab", "companion-character-tab", "combat-view"} <= routes)
        for row in receipt["tiles"]:
            self.assertEqual(row["locator"]["tileIndex"], row["tileIndex"])
            self.assertEqual(row["decodedPngPath"], f"images/{row['decodedPngSha256']}.png")
            self.assertEqual(row["decodedPngRepoPath"],
                             f"apps/web/dist-app-cok57/restyle/cok-generated/{row['decodedPngPath']}")

    def test_enrichment_changes_only_six_existing_consumer_lists_and_is_idempotent(self):
        registry, census, base, decoded_root = inputs(self)
        receipt = panels.build_receipt(registry, census, base, decoded_root)
        baseline = copy.deepcopy(registry)
        for asset in baseline["assets"]:
            asset["gameConsumers"] = [row for row in asset["gameConsumers"] if not any(
                evidence.get("reference") == panels.RECEIPT_PATH for evidence in row.get("evidence", []))]
        updated = panels.enrich_registry(baseline, receipt)
        original_ids = {row["id"] for row in registry["assets"]}

        self.assertEqual({row["id"] for row in updated["assets"]}, original_ids)
        changed = [row["id"] for row, other in zip(baseline["assets"], updated["assets"])
                   if row != other]
        expected = {row["assetId"] for row in receipt["tiles"]}
        self.assertEqual(set(changed), expected)
        for before, after in zip(baseline["assets"], updated["assets"]):
            if before["id"] in expected:
                self.assertEqual({key: value for key, value in before.items() if key != "gameConsumers"},
                                 {key: value for key, value in after.items() if key != "gameConsumers"})
                additions = [row for row in after["gameConsumers"] if row not in before["gameConsumers"]]
                self.assertEqual(additions, [panels.panel_consumer(receipt, next(
                    row["tileIndex"] for row in receipt["tiles"] if row["assetId"] == before["id"]))])
                self.assertEqual([row for row in after["gameConsumers"] if row in before["gameConsumers"]],
                                 before["gameConsumers"])
            else:
                self.assertEqual(before, after)
        self.assertEqual(panels.enrich_registry(updated, receipt), updated)

    def test_conflicting_existing_receipt_reference_fails_closed(self):
        registry, census, base, decoded_root = inputs(self)
        receipt = panels.build_receipt(registry, census, base, decoded_root)
        updated = panels.enrich_registry(registry, receipt)
        target = next(row for row in updated["assets"] if row["id"] == receipt["tiles"][0]["assetId"])
        existing = next(row for row in target["gameConsumers"] if any(
            evidence.get("reference") == panels.RECEIPT_PATH for evidence in row["evidence"]))
        existing["status"] = "verified"

        with self.assertRaisesRegex(ValueError, "conflicting panel consumer"):
            panels.enrich_registry(updated, receipt)

    def test_panel_source_pin_mutation_is_rejected(self):
        registry, census, base, decoded_root = inputs(self)
        pins = copy.deepcopy(panels.SOURCE_PINS)
        pins[next(iter(pins))] = "0" * 64
        previous = panels.SOURCE_PINS
        panels.SOURCE_PINS = pins
        try:
            with self.assertRaisesRegex(ValueError, "reviewed panel source changed"):
                panels.build_receipt(registry, census, base, decoded_root)
        finally:
            panels.SOURCE_PINS = previous

    def test_companion_forwarding_source_pin_mutation_is_rejected(self):
        registry, census, base, decoded_root = inputs(self)
        pins = copy.deepcopy(panels.SOURCE_PINS)
        pins["apps/web/src/ui/companionPanel.ts"] = "0" * 64
        previous = panels.SOURCE_PINS
        panels.SOURCE_PINS = pins
        try:
            with self.assertRaisesRegex(ValueError, "reviewed panel source changed"):
                panels.build_receipt(registry, census, base, decoded_root)
        finally:
            panels.SOURCE_PINS = previous

    def test_changed_registry_locator_is_rejected(self):
        registry, census, base, decoded_root = inputs(self)
        target = next(row for row in registry["assets"]
                      if row["id"] == "cok/dos-ega/disk1/8x8d1.dax/block/202/tile/20")
        target["locator"]["tileIndex"] = 21
        with self.assertRaisesRegex(ValueError, "lacks its exact source join"):
            panels.build_receipt(registry, census, base, decoded_root)

    def test_duplicate_registry_asset_id_is_rejected(self):
        registry, census, base, decoded_root = inputs(self)
        target = next(row for row in registry["assets"]
                      if row["id"] == "cok/dos-ega/disk1/8x8d1.dax/block/202/tile/20")
        registry["assets"].append(copy.deepcopy(target))
        with self.assertRaisesRegex(ValueError, "registry assets are missing or duplicated"):
            panels.build_receipt(registry, census, base, decoded_root)

    def test_duplicate_or_candidate_census_child_is_rejected(self):
        registry, census, base, decoded_root = inputs(self)
        entry = panels.ui202.census_entry(census)
        child = next(row for row in entry["children"] if row.get("kind") == "tile" and row.get("index") == 20)
        entry["children"].append(copy.deepcopy(child))
        with self.assertRaisesRegex(ValueError, "missing or ambiguous"):
            panels.build_receipt(registry, census, base, decoded_root)
        entry["children"].pop()
        child["candidate"] = True
        with self.assertRaisesRegex(ValueError, "lacks its exact source join"):
            panels.build_receipt(registry, census, base, decoded_root)

    def test_changed_decoded_png_pin_is_rejected(self):
        registry, census, base, decoded_root = inputs(self)
        target = next(row for row in registry["assets"]
                      if row["id"] == "cok/dos-ega/disk1/8x8d1.dax/block/202/tile/20")
        target["decoded"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "decoded PNG identity differs"):
            panels.build_receipt(registry, census, base, decoded_root)

    def test_changed_decoded_png_bytes_are_rejected(self):
        registry, census, base, decoded_root = inputs(self)
        first = next(row for row in registry["assets"]
                     if row["id"] == "cok/dos-ega/disk1/8x8d1.dax/block/202/tile/20")
        first_path = decoded_root / first["decoded"]["path"]
        first_path.write_bytes(b"tampered PNG bytes")
        with self.assertRaisesRegex(ValueError, "decoded PNG bytes differ"):
            panels.build_receipt(registry, census, base, decoded_root)

    def test_missing_external_decoded_image_fails_closed(self):
        registry, census, base, decoded_root = inputs(self)
        first = next(row for row in registry["assets"]
                     if row["id"] == "cok/dos-ega/disk1/8x8d1.dax/block/202/tile/20")
        (decoded_root / first["decoded"]["path"]).unlink()
        with self.assertRaisesRegex(ValueError, "decoded PNG input is missing"):
            panels.build_receipt(registry, census, base, decoded_root)

    def test_repository_path_is_rejected_as_decoded_image_directory(self):
        registry, census, base, _ = inputs(self)
        with self.assertRaisesRegex(ValueError, "must be outside the repository"):
            panels.build_receipt(registry, census, base, ROOT)

    def test_default_cli_action_compares_without_writing(self):
        with tempfile.TemporaryDirectory() as repo_temp, tempfile.TemporaryDirectory() as images_temp:
            root = Path(repo_temp)
            receipt = {"schema": "cok-ui202-panel-consumers-v1", "panels": [], "tiles": []}
            registry = {"assets": []}
            census = {"assets": []}
            values = {
                panels.REGISTRY_PATH: registry,
                panels.CENSUS_PATH: census,
                panels.BASE_RECEIPT_PATH: {"schema": "fixture"},
            }
            targets = {
                panels.REGISTRY_PATH: root / panels.REGISTRY_PATH,
                panels.RECEIPT_PATH: root / panels.RECEIPT_PATH,
            }
            for path, value in targets.items():
                value.parent.mkdir(parents=True, exist_ok=True)
                value.write_bytes((json.dumps(registry if path == panels.REGISTRY_PATH else receipt,
                                              ensure_ascii=True, indent=2) + "\n").encode())
            before = {path: file.read_bytes() for path, file in targets.items()}
            original_argv = sys.argv
            sys.argv = ["cok_ui202_panel_consumers.py", "--decoded-images-dir", images_temp]
            try:
                with patch.object(panels, "ROOT", root), \
                     patch.object(panels, "read_json", side_effect=lambda path: values[path]), \
                     patch.object(panels, "build_receipt", return_value=receipt), \
                     patch.object(panels, "enrich_registry", side_effect=lambda source, _: source), \
                     patch.object(panels.graphics_asset_registry, "validate", return_value=([], [])), \
                     contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(panels.main(), 0)
            finally:
                sys.argv = original_argv
            self.assertEqual({path: file.read_bytes() for path, file in targets.items()}, before)


if __name__ == "__main__":
    unittest.main()
