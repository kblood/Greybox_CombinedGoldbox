"""Synthetic root-selection tests; all callable file access stays in temporary roots."""
from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

# Import source only; neither module's guarded CLI is invoked during collection.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_player_runtime_coverage as coverage
import import_cok_player_appearance_registry as importer


class RootSelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.roots = [self.base / name for name in ("selected", "module", "cwd")]
        for root in self.roots:
            root.mkdir()
        self.previous = Path.cwd()
        os.chdir(self.roots[2])
        self.addCleanup(os.chdir, self.previous)
        # Guard actual Path.open, including reads hidden behind read_text/read_bytes.
        original = Path.open
        base = self.base

        def guarded(path, *args, **kwargs):
            if not path.resolve().is_relative_to(base):
                raise AssertionError(f"file access outside synthetic roots: {path}")
            return original(path, *args, **kwargs)

        self.guard = patch.object(Path, "open", guarded)
        self.guard.start()
        self.addCleanup(self.guard.stop)

    def fixture(self, root, marker="selected"):
        manifest = {"appearances": []}
        policy = {"schema": "cok-player-restyle-admission-v1", "frames": []}
        contract = {"sourceManifest": {"path": "manifest.json"},
                    "restyleAdmissionPolicy": {"path": "policy.json"}, "marker": marker}
        for name, value in (("manifest.json", manifest), ("policy.json", policy),
                            ("alternate.json", contract)):
            (root / name).write_text(json.dumps(value), encoding="utf-8")
        default = root / coverage.CONTRACT_DEFAULT
        default.parent.mkdir(parents=True)
        default.write_text(json.dumps(contract), encoding="utf-8")
        return contract, policy

    def validation_prefix(self, root, contract=None):
        # Stop only the unrelated in-memory frame validator, after real selected reads.
        with patch.object(coverage, "validate_restyle_admission_policy", return_value={}):
            with self.assertRaisesRegex(ValueError, "components must be"):
                coverage.validate_report({"schema": "cok-player-runtime-coverage-v1",
                    "inputs": {"restyleAdmissionPolicySha256": coverage.digest_file(root, "policy.json")}},
                    {}, root=root, contract=contract)

    def test_explicit_root_ignores_module_root_and_cwd(self):
        selected, other, _ = self.roots
        contract, _ = self.fixture(selected)
        with patch.object(coverage, "ROOT", other):
            default = selected / coverage.CONTRACT_DEFAULT
            original = default.read_bytes()
            default.write_text("broken default", encoding="utf-8")
            self.validation_prefix(selected, contract)
            default.write_bytes(original)
            self.validation_prefix(selected)

    def test_missing_and_corrupt_selected_manifest_do_not_fallback(self):
        selected, other, _ = self.roots
        contract, _ = self.fixture(selected)
        self.fixture(other, "decoy")
        with patch.object(coverage, "ROOT", other):
            (selected / "manifest.json").unlink()
            with self.assertRaises(FileNotFoundError):
                coverage.validate_report({"schema": "cok-player-runtime-coverage-v1"}, {},
                                         root=selected, contract=contract)
            (selected / "manifest.json").write_text("broken", encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError):
                coverage.validate_report({"schema": "cok-player-runtime-coverage-v1"}, {},
                                         root=selected, contract=contract)

    def test_main_passes_selected_nondefault_contract_and_policy(self):
        selected, other, _ = self.roots
        contract, policy = self.fixture(selected)
        (selected / coverage.CONTRACT_DEFAULT).write_text("broken default", encoding="utf-8")
        report = {"counts": {"componentRows": 0, "staticConsumerBindings": 0,
                             "componentsWithIssues": 0}}
        argv = ["coverage", "--root", str(selected), "--contract", "alternate.json"]
        with patch.object(coverage, "ROOT", other), patch.object(sys, "argv", argv), \
                patch.object(coverage, "build_report", return_value=report) as build, \
                patch.object(coverage, "validate_report") as validate, \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(coverage.main(), 0)
        build.assert_called_once_with(selected, contract)
        validate.assert_called_once_with(report, policy, root=selected, contract=contract)

    def appearance_fixture(self):
        manifest = {"sourceContainers": {"CHEAD.DAX": "a", "CBODY.DAX": "b"},
                    "appearances": []}
        registry = {"assets": [], "restyles": []}
        reviewed = [
            ("05-18-00-02", [(5, 24, 0, 2), (5, 24, 2, 2)], [69, 197], [88, 216]),
            ("05-01-01-02", [(5, 1, 1, 2)], [69, 197], [65, 193]),
            ("05-17-04-02", [(5, 23, 4, 2), (5, 23, 5, 2)], [69, 197], [87, 215]),
            ("03-0b-03-01", [(3, 11, 3, 1)], [3, 131], [11, 139]),
        ]
        for suffix, rows, heads, bodies in reviewed:
            components = []
            for family in ("CHEAD", "CBODY"):
                parts = []
                for variant in range(2):
                    block = (heads if family == "CHEAD" else bodies)[variant]
                    asset = importer.source_id(family, block)
                    if not any(row["id"] == asset for row in registry["assets"]):
                        registry["assets"].append({"id": asset, "platform": "DOS-EGA",
                            "archive": {"name": family + ".DAX", "sha256": "a" if family == "CHEAD" else "b"},
                            "decoded": {"sha256": "c"}})
                        registry["restyles"].append({"id": asset + "/restyle", "sourceAssetIds": [asset],
                                                     "outputs": [{"sha256": "d"}]})
                    parts.append({"blockId": block, "sourceSha256": "c", "restyleSha256": "d"})
                components.append(parts)
            head = dict(components[0][0], blockIds=heads)
            manifest["appearances"].append({"appearanceId": f"cok-player-{suffix}", "head": head,
                "bodyFrames": components[1], "sourceTuples": [dict(zip(
                    ("cHeadRequest", "cBodyBlock", "cBodySlot", "suffixCode"), row)) for row in rows]})
        return manifest, registry

    def test_coverage_forwards_manifest_hash_root(self):
        root = self.roots[0]
        contract = {"sourceManifest": {"path": "manifest.json"}}
        with patch.object(coverage, "derive_appearance_sets", side_effect=RuntimeError("stop")) as derive:
            with self.assertRaisesRegex(RuntimeError, "stop"):
                coverage.build_report_from_data(root, contract, {}, {}, {}, {}, {})
        derive.assert_called_once_with({}, {}, Path("manifest.json"), source_root=root)

    def test_missing_and_corrupt_selected_policy(self):
        root, decoy, _ = self.roots
        self.fixture(root)
        self.fixture(decoy, "decoy")
        (root / coverage.CONTRACT_DEFAULT).write_text("broken default", encoding="utf-8")
        argv = ["coverage", "--root", str(root), "--contract", "alternate.json"]
        with patch.object(coverage, "ROOT", decoy), patch.object(sys, "argv", argv), \
                patch.object(coverage, "build_report", return_value={}), \
                patch.object(coverage, "validate_report") as validate:
            for payload in (None, "broken"):
                path = root / "policy.json"
                if payload is None:
                    path.unlink()
                else:
                    path.write_text(payload, encoding="utf-8")
                with self.assertRaises(FileNotFoundError if payload is None else json.JSONDecodeError):
                    coverage.main()
            validate.assert_not_called()

    def test_importer_selected_hash_and_default_cwd_semantics(self):
        selected, _, cwd = self.roots
        manifest, registry = self.appearance_fixture()
        relative = Path("manifest.json")
        (selected / relative).write_bytes(b"selected synthetic manifest")
        (cwd / relative).write_bytes(b"cwd synthetic manifest")
        for root in (selected, None):
            rows = importer.derive_appearance_sets(manifest, registry, relative, source_root=root)
            expected = hashlib.sha256(((selected if root else cwd) / relative).read_bytes()).hexdigest()
            self.assertEqual(rows[0]["sourceManifest"], {"path": "manifest.json", "sha256": expected})
        (selected / relative).unlink()
        with self.assertRaises(FileNotFoundError):
            importer.derive_appearance_sets(manifest, registry, relative, source_root=selected)

    def test_exact_reviewed_source_ids_and_storage_aliases(self):
        manifest, registry = self.appearance_fixture()
        root = self.roots[0]
        (root / "manifest.json").write_bytes(b"synthetic")
        rows = importer.derive_appearance_sets(manifest, registry, Path("manifest.json"), source_root=root)
        expected = [("05-18-00-02", [69, 197], [88, 216], [0, 2]),
                    ("05-01-01-02", [69, 197], [65, 193], [1]),
                    ("05-17-04-02", [69, 197], [87, 215], [4, 5]),
                    ("03-0b-03-01", [3, 131], [11, 139], [3])]
        for row, (suffix, heads, bodies, slots) in zip(rows, expected, strict=True):
            self.assertEqual(row["id"], "cok/dos-ega/appearance/" + suffix)
            self.assertEqual(row["manifestId"], "cok-player-" + suffix)
            head, body, _slot, code = [int(part, 16) for part in suffix.split("-")]
            self.assertEqual(row["acceptedTuples"], [dict(cHeadRequest=head, cBodyBlock=body,
                cBodySlot=slot, suffixCode=code, role="primary" if index == 0 else "storage-slot-alias",
                **({"aliasOf": 0} if index else {})) for index, slot in enumerate(slots)])
            for index, variant in enumerate(row["variants"]):
                self.assertEqual([c["assetId"] for c in variant["components"]], [
                    f"cok/dos-ega/install/chead.dax/block/{heads[index]}/frame/0",
                    f"cok/dos-ega/install/cbody.dax/block/{bodies[index]}/frame/0"])
            for index, selector in enumerate(row["acceptedTuples"]):
                self.assertEqual(selector["cBodySlot"], slots[index])
                self.assertEqual(selector["role"], "primary" if index == 0 else "storage-slot-alias")
                self.assertEqual(selector.get("aliasOf"), 0 if index else None)

    def test_mapping_mutations_reject_before_any_manifest_hash(self):
        manifest, registry = self.appearance_fixture()
        mutations = []
        for label in ("id", "duplicate-id", "exchange", "alias-order", "alias-role", "alias-target",
                      "missing-alias", "extra-alias", "unknown-slot", "head-request", "body-request",
                      "unsupported-suffix", "suffix-offset", "variant-offset", "swap-heads",
                      "swap-bodies", "second-body", "bool", "coherent"):
            bad, assets = copy.deepcopy(manifest), copy.deepcopy(registry)
            first, second, _, last = bad["appearances"]
            if label == "id":
                last["appearanceId"] = "cok-player-arbitrary"
            elif label == "duplicate-id":
                last["appearanceId"] = first["appearanceId"]
            elif label == "exchange":
                first["sourceTuples"], second["sourceTuples"] = second["sourceTuples"], first["sourceTuples"]
            elif label == "alias-order":
                first["sourceTuples"].reverse()
            elif label in ("alias-role", "alias-target"):
                first["sourceTuples"][1]["role" if label == "alias-role" else "aliasOf"] = (
                    "primary" if label == "alias-role" else 1)
            elif label == "missing-alias":
                first["sourceTuples"].pop()
            elif label == "extra-alias":
                first["sourceTuples"].append(copy.deepcopy(first["sourceTuples"][1]))
            elif label == "unknown-slot":
                first["sourceTuples"][1]["cBodySlot"] = 3
            elif label in ("head-request", "body-request", "unsupported-suffix"):
                key = {"head-request": "cHeadRequest", "body-request": "cBodyBlock",
                       "unsupported-suffix": "suffixCode"}[label]
                first["sourceTuples"][0][key] = {"head-request": 6, "body-request": 25,
                                                  "unsupported-suffix": 3}[label]
            elif label == "suffix-offset":
                first["head"]["blockIds"] = [5, 133]
            elif label == "variant-offset":
                first["bodyFrames"][1]["blockId"] = 152
            elif label == "swap-heads":
                first["head"]["blockIds"].reverse()
            elif label == "swap-bodies":
                first["bodyFrames"].reverse()
            elif label == "second-body":
                first["bodyFrames"][1]["blockId"] = 217
            elif label == "bool":
                second["sourceTuples"][0]["cBodyBlock"] = True
            else:
                for component, old, new in zip(first["bodyFrames"], (88, 216), (89, 217)):
                    old_id = f"cok/dos-ega/install/cbody.dax/block/{old}/frame/0"
                    new_id = f"cok/dos-ega/install/cbody.dax/block/{new}/frame/0"
                    component.update(blockId=new, sourceSha256="changed", restyleSha256="output")
                    asset = next(a for a in assets["assets"] if a["id"] == old_id)
                    asset.update(id=new_id, decoded={"sha256": "changed"})
                    restyle = next(r for r in assets["restyles"] if old_id in r["sourceAssetIds"])
                    restyle.update(id=new_id + "/restyle", sourceAssetIds=[new_id], outputs=[{"sha256": "output"}])
            mutations.append((label, bad, assets))
        for label, bad, assets in mutations:
            with self.subTest(label=label), patch.object(importer, "sha256_file") as digest:
                with self.assertRaisesRegex(ValueError, "six explicitly approved"):
                    importer.derive_appearance_sets(bad, assets, Path("absent.json"), source_root=self.roots[0])
                digest.assert_not_called()


if __name__ == "__main__":
    unittest.main()
