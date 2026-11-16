from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from emit_symbol_candidates import (  # noqa: E402
    build_cluster_record,
    build_report,
    build_summary,
    classify_cluster,
    cluster_attributes,
    coab_evidence,
    demangle_coab_symbol,
    is_placeholder_symbol,
    title_behavior_evidence,
    title_for_path,
)


def call_row(cluster_hash: str, target_source: str, target_offset: int, **overrides: object) -> dict[str, object]:
    row = {
        "cluster_hash": cluster_hash,
        "target_source": target_source,
        "target_offset": target_offset,
        "route_kind": "public_stub_owned",
        "call_count": 3,
        "caller_profiles": ["pools-of-darkness"],
        "match_kind": "relocation-normalized",
        "confidence": "high",
        "cluster_source_count": 3,
        "function_size": 64,
    }
    row.update(overrides)
    return row


class DemangleTests(unittest.TestCase):
    def test_strips_at_and_borland_param_suffix(self) -> None:
        self.assertEqual(demangle_coab_symbol("@parse_command_sub$q4Byte"), "parse_command_sub")

    def test_leaves_plain_c_names_alone(self) -> None:
        self.assertEqual(demangle_coab_symbol("willOverload"), "willOverload")
        self.assertEqual(demangle_coab_symbol("battle_begins"), "battle_begins")

    def test_placeholder_detection(self) -> None:
        self.assertTrue(is_placeholder_symbol("sub_30168"))
        self.assertTrue(is_placeholder_symbol("sub_ABCDE"))
        self.assertFalse(is_placeholder_symbol("willOverload"))
        self.assertFalse(is_placeholder_symbol("@parse_command_sub$q4Byte"))


class TitleForPathTests(unittest.TestCase):
    def test_recognizes_known_titles(self) -> None:
        self.assertEqual(title_for_path(r"C:\Modding\GoldBox\Champions of Krynn\GAME.OVR"), "champions-of-krynn")
        self.assertEqual(
            title_for_path(r"C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\GAME.OVR"),
            "pools-of-darkness",
        )
        self.assertEqual(
            title_for_path(r"C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD\GAME.OVR"),
            "pool-of-radiance",
        )

    def test_pools_of_darkness_not_misclassified_as_pool_of_radiance(self) -> None:
        # "pools of darkness" contains "pool of" as a substring only if hint order is wrong;
        # guard the ordering that keeps these two titles distinct.
        self.assertNotEqual(
            title_for_path(r"C:\Games\Pools of Darkness\GAME.OVR"),
            title_for_path(r"C:\Games\Pool of Radiance\GAME.OVR"),
        )

    def test_unknown_path_is_explicit_not_guessed(self) -> None:
        self.assertEqual(title_for_path(r"C:\Games\Some Other Title\GAME.OVR"), "unknown-title")


class ClusterAttributesTests(unittest.TestCase):
    def test_consistent_rows_pass_through(self) -> None:
        rows = [call_row("h1", "src-a", 0x10), call_row("h1", "src-b", 0x20)]
        attrs = cluster_attributes(rows, "h1", strict=True)
        self.assertEqual(attrs["match_kind"], "relocation-normalized")
        self.assertEqual(attrs["function_size"], 64)

    def test_inconsistent_rows_raise_in_strict_mode(self) -> None:
        rows = [call_row("h1", "src-a", 0x10, confidence="high"), call_row("h1", "src-b", 0x20, confidence="low")]
        with self.assertRaises(ValueError):
            cluster_attributes(rows, "h1", strict=True)

    def test_inconsistent_rows_tolerated_without_strict(self) -> None:
        rows = [call_row("h1", "src-a", 0x10, confidence="high"), call_row("h1", "src-b", 0x20, confidence="low")]
        attrs = cluster_attributes(rows, "h1", strict=False)
        self.assertEqual(attrs["confidence"], "high")  # sorted() picks deterministically


class ClassifyClusterTests(unittest.TestCase):
    """The central rule this whole tool exists to enforce, one level above the per-title
    classify_clusters() functions in map_pool_behavior_clusters.py / map_secret_behavior_clusters.py."""

    def test_no_title_evidence_is_unpromoted(self) -> None:
        status, promoted_by = classify_cluster([], [], [])
        self.assertEqual(status, "unpromoted-structural-sibling-nomination")
        self.assertEqual(promoted_by, [])

    def test_one_titles_own_trace_promotes(self) -> None:
        pool_ev = [{"candidate_name": "operand_parser"}]
        status, promoted_by = classify_cluster([], pool_ev, [])
        self.assertEqual(status, "promoted")
        self.assertEqual(promoted_by, ["pool-of-radiance"])

    def test_coab_only_is_promoted_and_flagged_not_multi_title(self) -> None:
        coab_ev = [{"candidate_name": "willOverload"}]
        status, promoted_by = classify_cluster(coab_ev, [], [])
        self.assertEqual(status, "promoted")
        self.assertEqual(promoted_by, ["curse-of-the-azure-bonds"])

    def test_two_titles_reaching_is_multi_title(self) -> None:
        coab_ev = [{"candidate_name": "parse_command_sub"}]
        pool_ev = [{"candidate_name": "operand_parser"}]
        status, promoted_by = classify_cluster(coab_ev, pool_ev, [])
        self.assertEqual(status, "promoted")
        self.assertEqual(promoted_by, ["curse-of-the-azure-bonds", "pool-of-radiance"])


class CoabEvidenceTests(unittest.TestCase):
    def test_named_symbol_is_a_semantic_candidate(self) -> None:
        functions = [{
            "cluster_hash": "h1", "symbol": "willOverload", "canonical_candidate": None, "role": None,
            "retail_file_offset": 0x100, "unit": 5, "unit_offset": 0x10, "evidence_status": "same_game_oracle_retail_cluster",
        }]
        evidence = coab_evidence("h1", functions)
        self.assertEqual(len(evidence), 1)
        self.assertTrue(evidence[0]["has_semantic_name"])
        self.assertEqual(evidence[0]["candidate_name"], "willOverload")

    def test_sub_placeholder_symbol_reaches_but_has_no_semantic_name(self) -> None:
        functions = [{
            "cluster_hash": "h1", "symbol": "sub_30168", "canonical_candidate": None, "role": None,
            "retail_file_offset": 0x100, "unit": 5, "unit_offset": 0x10, "evidence_status": "same_game_oracle_retail_cluster",
        }]
        evidence = coab_evidence("h1", functions)
        self.assertEqual(len(evidence), 1)
        self.assertFalse(evidence[0]["has_semantic_name"])
        self.assertIsNone(evidence[0]["candidate_name"])

    def test_mangled_class_method_wrapping_a_placeholder_base_name_has_no_semantic_name(self) -> None:
        # Regression: `@sub_66BDB$qn6Player` does not match the raw sub_<hex> placeholder
        # shape (it is wrapped in Borland class-method mangling), but its demangled base
        # name ("sub_66BDB") is exactly as semantically empty as a free-function `sub_XXXXX`.
        functions = [{
            "cluster_hash": "h1", "symbol": "@sub_66BDB$qn6Player", "canonical_candidate": None, "role": None,
            "retail_file_offset": 0x66bdb, "unit": 6, "unit_offset": 0x10, "evidence_status": "same_game_oracle_retail_cluster",
        }]
        evidence = coab_evidence("h1", functions)
        self.assertEqual(len(evidence), 1)
        self.assertFalse(evidence[0]["has_semantic_name"])
        self.assertIsNone(evidence[0]["candidate_name"])

    def test_non_matching_cluster_hash_is_excluded(self) -> None:
        functions = [{
            "cluster_hash": "other", "symbol": "willOverload", "canonical_candidate": None, "role": None,
            "retail_file_offset": 0x100, "unit": 5, "unit_offset": 0x10, "evidence_status": "same_game_oracle_retail_cluster",
        }]
        self.assertEqual(coab_evidence("h1", functions), [])


class TitleBehaviorEvidenceTests(unittest.TestCase):
    def test_exact_cluster_match_is_reported(self) -> None:
        report = {
            "functions": [{
                "role": "operand_parser", "file_offset": 0x74d3,
                "clusters": [{"cluster_hash": "h1", "match_kind": "relocation-normalized", "confidence": "high", "source_count": 5}],
            }],
            "replayed_commands": [],
        }
        evidence = title_behavior_evidence("h1", "pool-of-radiance", report, "build/pool-behavior-clusters.json")
        self.assertEqual(len(evidence), 1)
        self.assertEqual(evidence[0]["candidate_name"], "operand_parser")

    def test_control_flow_shape_only_is_excluded(self) -> None:
        report = {
            "functions": [],
            "replayed_commands": [{
                "opcode": 0x09, "mnemonic": "SAVE", "handler_file_offset": 0xfd8,
                "clusters": [{"cluster_hash": "h1", "match_kind": "control-flow-shape", "confidence": "medium", "source_count": 4}],
            }],
        }
        evidence = title_behavior_evidence("h1", "pool-of-radiance", report, "build/pool-behavior-clusters.json")
        self.assertEqual(evidence, [])

    def test_zero_clusters_means_zero_evidence_secret_shape(self) -> None:
        # Mirrors Secret's real report shape: dispatcher/operand_parser have empty `clusters`.
        report = {
            "functions": [
                {"role": "dispatcher", "file_offset": 0x458b, "clusters": []},
                {"role": "operand_parser", "file_offset": 0x9073, "clusters": []},
            ],
            "replayed_commands": [
                {"opcode": 0x24, "mnemonic": "COMBAT", "handler_file_offset": 0x266b, "clusters": []},
            ],
        }
        evidence = title_behavior_evidence("h1", "secret-of-the-silver-blades", report, "build/secret-behavior-clusters.json")
        self.assertEqual(evidence, [])


class BuildClusterRecordTests(unittest.TestCase):
    """End-to-end fixture-driven coverage of the three decision shapes the task specifies."""

    def test_cluster_reached_by_one_titles_real_trace_is_promoted(self) -> None:
        rows = [call_row("h-pool", "C:/Games/Pool of Radiance/GAME.OVR", 0x74d3)]
        coab = {"functions": []}
        pool = {
            "functions": [{
                "role": "operand_parser", "file_offset": 0x74d3,
                "clusters": [{"cluster_hash": "h-pool", "match_kind": "relocation-normalized", "confidence": "high", "source_count": 5}],
            }],
            "replayed_commands": [],
        }
        secret = {"functions": [], "replayed_commands": []}
        record = build_cluster_record("h-pool", rows, coab, pool, secret, strict=True)
        self.assertEqual(record["promotion_status"], "promoted")
        self.assertEqual(record["promoted_by"], ["pool-of-radiance"])
        self.assertFalse(record["coab_only"])
        self.assertEqual(record["semantic_names"], ["operand_parser"])

    def test_cluster_with_only_structural_similarity_is_an_unpromoted_nomination(self) -> None:
        # The cluster exists in vroomm-call-correlations.json (real call-target evidence,
        # e.g. from a title with no behavior-cluster report of its own, like Pools of
        # Darkness), but none of CoAB/Pool/Secret's own behavior artifacts name it.
        rows = [call_row("h-structural", "C:/Games/Pools of Darkness/GAME.OVR", 0x2000, call_count=92)]
        coab = {"functions": []}
        pool = {"functions": [], "replayed_commands": []}
        secret = {"functions": [], "replayed_commands": []}
        record = build_cluster_record("h-structural", rows, coab, pool, secret, strict=True)
        self.assertEqual(record["promotion_status"], "unpromoted-structural-sibling-nomination")
        self.assertEqual(record["promoted_by"], [])
        self.assertEqual(record["semantic_names"], [])
        self.assertEqual(record["total_call_count"], 92)
        self.assertIn("pools-of-darkness", record["call_target_titles"])

    def test_coab_only_cluster_is_flagged_and_not_assumed_transferable(self) -> None:
        rows = [
            call_row("h-coab", "C:/Modding/GoldBox/Champions of Krynn/GAME.OVR", 0x1000),
            call_row("h-coab", "C:/Games/Pools of Darkness/GAME.OVR", 0x2000, call_count=10),
        ]
        coab = {
            "functions": [{
                "cluster_hash": "h-coab", "symbol": "willOverload", "canonical_candidate": None, "role": None,
                "retail_file_offset": 0x2bd06, "unit": 21, "unit_offset": 0x100,
                "evidence_status": "same_game_oracle_retail_cluster",
            }]
        }
        pool = {"functions": [], "replayed_commands": []}
        secret = {"functions": [], "replayed_commands": []}
        record = build_cluster_record("h-coab", rows, coab, pool, secret, strict=True)
        self.assertEqual(record["promotion_status"], "promoted")
        self.assertTrue(record["coab_only"])
        self.assertFalse(record["multi_title_corroborated"])
        self.assertEqual(record["semantic_names"], ["willOverload"])
        # Pools of Darkness calls into the same shared function body (a real call-target),
        # but that must not itself count as Pool/Secret/PoD's own naming evidence.
        self.assertIn("pools-of-darkness", record["call_target_titles"])
        self.assertEqual(record["evidence"]["pool"], [])
        self.assertEqual(record["evidence"]["secret"], [])


class BuildSummaryAndReportTests(unittest.TestCase):
    def test_summary_counts_reconcile(self) -> None:
        clusters = [
            {"promotion_status": "promoted", "promoted_by": ["curse-of-the-azure-bonds"], "coab_only": True, "multi_title_corroborated": False, "has_recovered_semantic_name": True},
            {"promotion_status": "promoted", "promoted_by": ["curse-of-the-azure-bonds", "pool-of-radiance"], "coab_only": False, "multi_title_corroborated": True, "has_recovered_semantic_name": True},
            {"promotion_status": "unpromoted-structural-sibling-nomination", "promoted_by": [], "coab_only": False, "multi_title_corroborated": False, "has_recovered_semantic_name": False},
        ]
        summary = build_summary(clusters)
        self.assertEqual(summary["total_clusters"], 3)
        self.assertEqual(summary["promoted_clusters"], 2)
        self.assertEqual(summary["unpromoted_structural_sibling_nominations"], 1)
        self.assertEqual(summary["coab_only_clusters"], 1)
        self.assertEqual(summary["multi_title_corroborated_clusters"], 1)
        self.assertEqual(summary["promoted_by_title_counts"]["curse-of-the-azure-bonds"], 2)
        self.assertEqual(summary["promoted_by_title_counts"]["pool-of-radiance"], 1)
        self.assertEqual(summary["promoted_by_title_counts"]["secret-of-the-silver-blades"], 0)

    def test_build_report_is_deterministic_and_strict_clean(self) -> None:
        calls = {"correlations": [
            call_row("h-a", "C:/Games/Pool of Radiance/GAME.OVR", 0x74d3),
            call_row("h-b", "C:/Games/Pools of Darkness/GAME.OVR", 0x2000, call_count=5),
        ]}
        coab = {"functions": [{
            "cluster_hash": "h-a", "symbol": "@parse_command_sub$q4Byte", "canonical_candidate": None, "role": None,
            "retail_file_offset": 0x810a, "unit": 18, "unit_offset": 0x10,
            "evidence_status": "same_game_oracle_retail_cluster",
        }]}
        pool = {
            "functions": [{
                "role": "operand_parser", "file_offset": 0x74d3,
                "clusters": [{"cluster_hash": "h-a", "match_kind": "relocation-normalized", "confidence": "high", "source_count": 5}],
            }],
            "replayed_commands": [],
        }
        secret = {"functions": [], "replayed_commands": []}
        report_1 = build_report(calls, coab, pool, secret, strict=True)
        report_2 = build_report(calls, coab, pool, secret, strict=True)
        self.assertEqual(report_1, report_2)
        self.assertEqual(report_1["summary"]["total_clusters"], 2)
        self.assertEqual(report_1["summary"]["multi_title_corroborated_clusters"], 1)
        self.assertEqual(report_1["summary"]["unpromoted_structural_sibling_nominations"], 1)

    def test_strict_mode_rejects_a_nonzero_secret_reach_without_recomputing_it(self) -> None:
        # Guards against silently accepting a future corpus change that would invalidate
        # secret-behavior-clusters.md's own headline claim -- see the comment in
        # emit_symbol_candidates.build_report.
        calls = {"correlations": [call_row("h-s", "C:/Games/Secret of the Silver Blades/GAME.OVR", 0xe55)]}
        coab = {"functions": []}
        pool = {"functions": [], "replayed_commands": []}
        secret = {
            "functions": [],
            "replayed_commands": [{
                "opcode": 0x09, "mnemonic": "SAVE", "handler_file_offset": 0xe55,
                "clusters": [{"cluster_hash": "h-s", "match_kind": "exact", "confidence": "low", "source_count": 2}],
            }],
        }
        with self.assertRaises(SystemExit):
            build_report(calls, coab, pool, secret, strict=True)


if __name__ == "__main__":
    unittest.main()
