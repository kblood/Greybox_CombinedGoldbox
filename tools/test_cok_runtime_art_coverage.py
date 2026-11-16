"""Discriminating controls for the source-only runtime art coverage ledger."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cok_runtime_art_coverage as coverage


class RuntimeArtCoverageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = coverage.build_report()

    def test_report_is_current_and_within_budget(self):
        expected = coverage.report_bytes(self.report)
        self.assertEqual((coverage.ROOT / coverage.REPORT).read_bytes(), expected)
        self.assertEqual(coverage.report_bytes(coverage.build_report()), expected)
        self.assertEqual(json.loads(expected), self.report)
        budget = sum((coverage.ROOT / path).stat().st_size for path in (
            coverage.COMBAT, coverage.CONTRACT, coverage.REPORT,
        ))
        self.assertLessEqual(budget, 1024 * 1024)
        self.assertNotRegex(expected.decode(), r"[A-Za-z]:[/\\]")
        self.assertEqual(self.report["runtimeObservation"], "unverified")
        self.assertEqual(self.report["productionPackage"], "unverified")

    def test_combat_uses_active_bank_and_keeps_unresolved_candidates(self):
        rows = [r for r in self.report["requests"] if r["kind"] == "combat-entry"]
        self.assertEqual(len(rows), 221)
        self.assertEqual(len({(r["archive"], r["blockId"], r["offset"]) for r in rows}), 192)
        self.assertEqual(sum(not r["localRoster"] for r in rows), 38)
        self.assertTrue(all(r["status"] == "unresolved-no-local-roster" and not r["bindings"]
                            for r in rows if not r["localRoster"]))
        self.assertTrue(any(r["dynamicPictureOperandCount"] for r in rows))
        same_number = {(r["bank"], b["pictureId"]): b for r in rows for b in r["bindings"] if b["pictureId"] == 1}
        self.assertIsNone(same_number[("CPIC1", 1)]["mappingId"])
        self.assertEqual(same_number[("CPIC2", 1)]["mappingId"], "combat/CPIC2/1")
        self.assertNotEqual(same_number[("CPIC1", 1)]["sourceId"], same_number[("CPIC2", 1)]["sourceId"])
        self.assertEqual(self.report["summary"]["combatScan"]["byBank"]["CPIC1"]["unmappedPictureIds"],
                         [1, 4, 6, 13, 21, 25, 30, 31, 38, 41])
        self.assertTrue(self.report["summary"]["combatScan"]["selectedPathOnly"])
        self.assertFalse(self.report["summary"]["combatScan"]["complete"])

    def test_picture_operand_is_third_and_uses_its_low_byte(self):
        dynamic = {"kind": "dynamic", "value": 17}
        immediate = {"kind": "immediate", "value": 0x109}
        raw, unknown = coverage.picture_operands([[dynamic, dynamic, immediate], [immediate, immediate, dynamic]])
        self.assertEqual((raw, unknown), ([0x109], 1))
        self.assertEqual(coverage.effective_picture_ids([9, 0x109]), [(9, [9, 0x109])])

    def test_selected_roster_can_hide_a_dynamic_alternate(self):
        header = bytearray(22)
        header[:6] = bytes.fromhex("88 13 01 01 14 80")
        # Two paths converge on COMBAT. The IF_EQ branch supplies a dynamic third operand.
        body = bytes.fromhex(
            "16 01 01 24 80 0b 00 07 00 02 00 09 01 01 2c 80 0b 00 07 00 02 01 34 12 24 00"
        )
        result = coverage.scan_block(bytes(header) + body)
        candidate, = result["candidates"]
        self.assertEqual(candidate["rostered_path_variants"], 2)
        self.assertEqual(candidate["alternate_path_count"], 1)
        self.assertEqual(coverage.picture_operands(candidate["roster"]), ([9], 0))

    def test_picture_binding_uses_site_not_numeric_operand(self):
        rows = [r for r in self.report["requests"] if r["kind"] == "ecl-picture"]
        self.assertEqual(len(rows), 146)
        self.assertEqual(sum(bool(r["sourceIds"]) for r in rows), 26)
        dynamic = next(r for r in rows if r["pictureId"] is None)
        self.assertEqual(dynamic["sourceIds"], [])
        self.assertEqual(dynamic["conditionalMappingIds"], [])
        same_id = {r["offset"]: r for r in rows if r["blockId"] == 16 and r["pictureId"] == 121}
        self.assertEqual(same_id[76]["sourceIds"], [])
        self.assertEqual(same_id[76]["conditionalMappingIds"], [])
        self.assertEqual(same_id[1800]["conditionalMappingIds"], ["travel/121"])
        cottage = next(r for r in rows if r["blockId"] == 36)
        self.assertEqual(cottage["conditionalMappingIds"], ["cottage/112"])

    def test_same_pixels_stay_distinct_and_record_join_needs_output(self):
        sha = "a" * 64
        locator = {"kind": "block-frame", "blockId": 1, "frameIndex": 0, "tileIndex": None}
        assets = [{"id": f"source/{i}", "platform": "DOS-EGA",
                   "archive": {"name": f"CPIC{i}.DAX", "sha256": sha}, "locator": locator,
                   "decoded": {"sha256": sha, "pixelSha256": sha}, "identityStatus": "source-pinned"}
                  for i in (1, 2)]
        registry = {"assets": assets, "animationGroups": [], "restyles": [
            {"id": "restyle/exact", "sourceAssetIds": ["source/1"], "outputs": [{"sha256": "b" * 64}]},
            {"id": "restyle/wrong-source", "sourceAssetIds": ["source/2"], "outputs": [{"sha256": "b" * 64}]},
            {"id": "restyle/wrong-output", "sourceAssetIds": ["source/1"], "outputs": [{"sha256": "c" * 64}]},
        ]}
        ledger = coverage.Ledger(registry, {"manifest": b""}, {"consumer": {}})
        source = ledger.source_id("DOS-EGA", "CPIC1.DAX", sha, 1)
        self.assertEqual(source, "source/1")
        self.assertEqual(ledger.source_id("DOS-EGA", "CPIC2.DAX", sha, 1), "source/2")
        self.assertIsNone(ledger.source_id("DOS-EGA", "CPIC1.DAX", "c" * 64, 1))
        self.assertIsNone(ledger.source_id("DOS-EGA", "CPIC1.DAX", sha, 1, frame=1))
        self.assertIsNone(ledger.source_id("DOS-EGA", "CPIC1.DAX", sha, 1, frame=None, tile=0))
        ledger.add_mapping("key", "consumer", "manifest", source, source, "restyle.png", "b" * 64)
        self.assertEqual(ledger.mappings["key"]["exactRestyleRecordIds"], ["restyle/exact"])

    def test_player_hold_and_title_composition_stay_separate_from_animation(self):
        frames = self.report["frames"]
        self.assertEqual(sum(f["admission"] == "held" for f in frames.values()), 4)
        self.assertEqual(sum(f["admission"] == "admitted" for f in frames.values()), 4)
        for f in frames.values():
            if f["admission"] == "held":
                self.assertEqual(f["consumerIds"], ["creator"])
                for c in f["components"]:
                    m = self.report["mappings"][c["mappingId"]]
                    self.assertEqual(m["admission"], "held")
                    self.assertEqual(m["compositionStatus"], "awaiting-review")
        self.assertEqual([len(frames[f"title/{i}"]["components"]) for i in range(3)], [1, 2, 2])
        self.assertEqual({g["semantics"] for g in self.report["sourceFrameGroups"].values()}, {"unknown"})
        candidate = self.report["mappings"]["portrait/amiga/18"]
        self.assertIsNone(candidate["generationSourceId"])
        self.assertEqual(candidate["unresolvedGenerationLocator"]["candidateIds"],
                         ["cok/amiga/disk2/pic1.daa/block/18/frame/0"])

    def test_source_or_policy_drift_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in ("consumer.ts", "policy.json"):
                with self.subTest(path=path):
                    (root / path).write_bytes(b"reviewed")
                    contract = {"schema": "cok-runtime-art-consumers-v1", "consumers": {"c": {"sources": [path]}},
                                "inputs": {path: coverage.sha(b"reviewed")}}
                    self.assertEqual(coverage.checked_inputs(root, contract)[path], b"reviewed")
                    (root / path).write_bytes(b"changed")
                    with self.assertRaisesRegex(ValueError, f"reviewed input changed: {path}"):
                        coverage.checked_inputs(root, contract)

    def test_player_canonical_dependency_closure_is_reviewed_and_enforced(self):
        contract = coverage.read_json(coverage.ROOT / coverage.CONTRACT)
        dependencies = {
            "apps/web/src/ui/cok-player-canonical-bindings.mjs",
            "apps/web/src/ui/cokPlayerCanonicalBindings.json",
            "tools/cok-player-canonical-bindings.mjs",
            "apps/web/scripts/bundle-cok-player-appearance.mjs",
            "apps/web/test/cok-player-canonical-bindings.test.mjs",
        }
        self.assertTrue(dependencies <= contract["inputs"].keys())
        self.assertTrue(dependencies <= set(contract["consumers"]["player-loader"]["sources"]))
        for path in sorted(dependencies):
            with self.subTest(path=path):
                bad = json.loads(json.dumps(contract))
                bad["inputs"][path] = "0" * 64
                with self.assertRaisesRegex(ValueError, "reviewed input changed: " + path):
                    coverage.checked_inputs(coverage.ROOT, bad)

    def test_local_bytes_audit_distinguishes_invalid_and_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "match").write_bytes(b"source")
            (root / "mismatch").write_bytes(b"other")
            outputs = {path: {"sha256": coverage.sha(b"source")} for path in ("match", "mismatch", "missing")}
            results = coverage.audit_output_files({"outputs": outputs}, root)
            self.assertEqual({key: row["status"] for key, row in results.items()},
                             {"match": "hash-match", "mismatch": "hash-mismatch", "missing": "missing"})

    def test_demo_keeps_repeated_combatant_slots_outside_scan_denominator(self):
        demo = self.report["demoCombat"]
        self.assertEqual((demo["archive"], demo["blockId"], demo["bank"]), ("ECL2.DAX", 57, "CPIC2"))
        self.assertEqual(len(demo["bindings"]), 15)
        self.assertEqual(sum(row["pictureId"] == 10 for row in demo["bindings"]), 2)
        self.assertTrue(all(row["sourceId"] and row["mappingId"] in self.report["mappings"] for row in demo["bindings"]))

    def test_cli_default_and_check_do_not_write(self):
        with patch.object(coverage, "write_atomic") as write, redirect_stdout(io.StringIO()) as output:
            for flags in ([], ["--check"]):
                with patch.object(coverage.sys, "argv", ["coverage", *flags]):
                    self.assertEqual(coverage.main(), 0)
            write.assert_not_called()
            self.assertIn('"selectedPathOnly": true', output.getvalue())

    def test_failed_build_and_replace_preserve_existing_report(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / coverage.REPORT
            path.parent.mkdir(parents=True)
            path.write_bytes(b"old report")
            with (patch.object(coverage, "ROOT", Path(directory)),
                  patch.object(coverage.sys, "argv", ["coverage", "--write"]),
                  patch.object(coverage, "build_report", side_effect=ValueError("drift")),
                  redirect_stderr(io.StringIO())):
                self.assertEqual(coverage.main(), 1)
            self.assertEqual(path.read_bytes(), b"old report")
            with patch.object(Path, "replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    coverage.write_atomic(path, b"new report")
            self.assertEqual(path.read_bytes(), b"old report")
            self.assertEqual(list(path.parent.iterdir()), [path])

    @unittest.skipUnless(all((coverage.ROOT / "Champions of Krynn" / name).is_file()
                             for name in coverage.ARCHIVES), "local pinned ECL game archives unavailable")
    def test_combat_receipt_rederives_with_cok_dialect(self):
        result = coverage.combat_receipt(coverage.ROOT / "Champions of Krynn")
        self.assertEqual(coverage.stable_json(result), (coverage.ROOT / coverage.COMBAT).read_bytes())
        blocks = [b for a in result["archives"] for b in a["blocks"]]
        self.assertEqual(len(blocks), 22)
        self.assertEqual(sum(b["truncatedOffsets"] for b in blocks), 0)
        self.assertTrue(any(s["alternatePaths"] for b in blocks for s in b["sites"]))


class RuntimeArtCoverageV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.v1 = coverage.build_report()
        cls.v2 = coverage.build_report_v2()
        cls.receipt = coverage.read_json(coverage.ROOT / coverage.COMBAT_V2)

    def test_versioned_report_is_deterministic_and_combined_metadata_fits(self):
        data = coverage.report_bytes(self.v2)
        self.assertEqual((coverage.ROOT / coverage.REPORT_V2).read_bytes(), data)
        self.assertEqual(coverage.report_bytes(coverage.build_report_v2()), data)
        self.assertEqual(coverage.report_bytes(self.v1), (coverage.ROOT / coverage.REPORT).read_bytes())
        total = sum((coverage.ROOT / path).stat().st_size for path in (
            coverage.COMBAT_V2, coverage.CONTRACT_V2, coverage.REPORT_V2, coverage.SCHEMA_V2,
        ))
        coverage.require_metadata_budget(total)
        with self.assertRaisesRegex(ValueError, "1,048,577 bytes"):
            coverage.require_metadata_budget(coverage.METADATA_LIMIT + 1)

    def test_variant_union_and_bank_qualification_match_receipt(self):
        combat = self.v2["summary"]["combatScan"]
        self.assertFalse(combat["campaignComplete"])
        self.assertFalse(combat["hasExplorationFrontiers"])
        self.assertEqual((combat["physicalSites"], combat["entrySiteAssociations"],
                          combat["distinctRosterVariants"], combat["entryVariantAssociations"]),
                         (192, 221, 267, 323))
        self.assertEqual((combat["withDeclaredMapping"], combat["distinctImmediatePictureIds"]), (51, 61))
        self.assertEqual(self.v2["deltaFromV1"]["byBank"]["CPIC2"]["addedPictureIds"], [23])
        self.assertEqual(len(self.v2["deltaFromV1"]["newDynamicEntrySites"]), 4)
        self.assertEqual(len(self.v2["deltaFromV1"]["newEmptyRosterEntrySites"]), 7)
        for archive in self.receipt["archives"]:
            bank = "CPIC" + archive["archive"][3]
            expected = {str(value & 255) for block in archive["blocks"] for site in block["sites"]
                        for variant in site["variants"] for _, _, (code, value) in variant["roster"] if code == 0}
            self.assertEqual(set(self.v2["combatBindings"][bank]["pictures"]), expected)
        one, two = [self.v2["combatBindings"][bank]["pictures"]["1"] for bank in ("CPIC1", "CPIC2")]
        self.assertNotEqual(one["sourceId"], two["sourceId"])
        self.assertIsNone(one["mappingId"])
        self.assertEqual(two["mappingId"], "combat/CPIC2/1")

    def test_picture_witnesses_and_existing_admission_stay_separate(self):
        self.assertEqual(len(self.v2["requests"]), 146)
        dynamic, = [row for row in self.v2["requests"] if row["pictureId"] is None]
        self.assertEqual(dynamic["operand"], {"kind": "dynamic", "code": 1, "value": 32633})
        self.assertEqual({w["entry"] for w in dynamic["entryWitnesses"]}, set(dynamic["entries"]))
        self.assertEqual(dynamic["sourceIds"], [])
        self.assertEqual(dynamic["conditionalMappingIds"], [])
        for field in ("mappings", "frames", "demoCombat", "outputs", "runtimeObservation", "productionPackage"):
            self.assertEqual(self.v2[field], self.v1[field])

    def test_town_original_source_uses_are_exact_and_do_not_create_restyle_admissions(self):
        uses = {row["id"]: row for row in self.v2["originalSourceUses"]}
        self.assertEqual(set(uses), {"town/frame", "town/font"})
        frame = uses["town/frame"]
        font = uses["town/font"]
        self.assertEqual(frame["sourceIds"], [
            f"cok/dos-ega/disk1/8x8d1.dax/block/202/tile/{index}" for index in range(20, 26)])
        self.assertEqual(font["sourceIds"], [
            f"cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/{index}" for index in range(64)])
        self.assertIn("fixed outer-border", frame["selectionScope"])
        self.assertIn("actual selection depends on displayed text", font["selectionScope"])
        for source_id in frame["sourceIds"] + font["sourceIds"]:
            source = self.v2["sourceAssets"][source_id]
            self.assertEqual(source["platform"], "DOS-EGA")
            self.assertEqual(source["archiveSha256"], "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915")
            self.assertEqual(source["locator"]["blockId"], 202 if source_id in frame["sourceIds"] else 201)
        self.assertEqual(self.v2["mappings"], self.v1["mappings"])
        self.assertEqual(self.v2["frames"], self.v1["frames"])
        self.assertEqual(self.v2["outputs"], self.v1["outputs"])

    def test_read_only_v2_cli(self):
        with patch.object(coverage, "write_atomic") as write, redirect_stdout(io.StringIO()) as output:
            for args in (["--v2"], ["--v2", "--check"]):
                with patch.object(coverage.sys, "argv", ["coverage", *args]):
                    self.assertEqual(coverage.main(), 0)
            write.assert_not_called()
            self.assertIn('"campaignComplete": false', output.getvalue())

    @unittest.skipUnless(all((coverage.ROOT / "Champions of Krynn" / name).is_file()
                             for name in coverage.ARCHIVES), "local pinned ECL game archives unavailable")
    def test_v2_combat_receipt_reproduces_from_exact_archives(self):
        result = coverage.combat_receipt_v2(coverage.ROOT / "Champions of Krynn")
        self.assertEqual(result, self.receipt)
        self.assertEqual(coverage.report_bytes(result), (coverage.ROOT / coverage.COMBAT_V2).read_bytes())
        self.assertEqual(sum(len(a["blocks"]) for a in result["archives"]), 22)


if __name__ == "__main__":
    unittest.main()
