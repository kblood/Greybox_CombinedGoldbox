from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from emit_coab_runtime_symbols import (  # noqa: E402
    build_report,
    classify_candidates,
    classify_structural_confirmations,
    index_by_offset,
    named_promoted_clusters,
    unnamed_promoted_clusters,
)


def named_cluster(
    cluster_hash: str,
    coab_rows: list[dict[str, object]],
    *,
    match_kind: str = "exact",
    confidence: str = "high",
    promoted_by: list[str] | None = None,
    multi_title_corroborated: bool = False,
) -> dict[str, object]:
    return {
        "cluster_hash": cluster_hash,
        "promotion_status": "promoted",
        "has_recovered_semantic_name": True,
        "match_kind": match_kind,
        "confidence": confidence,
        "promoted_by": promoted_by or ["curse-of-the-azure-bonds"],
        "multi_title_corroborated": multi_title_corroborated,
        "evidence": {"coab": coab_rows},
    }


def unnamed_cluster(
    cluster_hash: str,
    coab_rows: list[dict[str, object]],
    *,
    match_kind: str = "relocation-normalized",
    confidence: str = "high",
    promoted_by: list[str] | None = None,
) -> dict[str, object]:
    return {
        "cluster_hash": cluster_hash,
        "promotion_status": "promoted",
        "has_recovered_semantic_name": False,
        "match_kind": match_kind,
        "confidence": confidence,
        "promoted_by": promoted_by or ["curse-of-the-azure-bonds"],
        "multi_title_corroborated": False,
        "evidence": {"coab": coab_rows},
    }


def unnamed_coab_row(oracle_symbol: str, offset: int, **overrides: object) -> dict[str, object]:
    """An unnamed cluster's CoAB evidence row: `candidate_name` is always None (per the real
    goldbox-symbol-candidates.json shape), and the identifier lives in `oracle_symbol` instead."""
    row = {
        "candidate_name": None,
        "oracle_symbol": oracle_symbol,
        "retail_file_offset": offset,
        "source_citation": f"build/coab-oracle-map.json#functions[retail_file_offset={offset:#x}]",
    }
    row.update(overrides)
    return row


def coab_row(name: str, offset: int, **overrides: object) -> dict[str, object]:
    row = {
        "candidate_name": name,
        "retail_file_offset": offset,
        "source_citation": f"build/coab-oracle-map.json#functions[retail_file_offset={offset:#x}]",
    }
    row.update(overrides)
    return row


def confirmed_row(name: str, offset: int, **overrides: object) -> dict[str, object]:
    row = {
        "candidate_name": name,
        "retail_file_offset": offset,
        "descriptor": 24,
        "unit": "ovr025",
        "relative_offset": "0x1234",
        "byte_count": 128,
        "runtime_segments_observed": ["2752"],
        "reproduced_run_count": 2,
        "all_runs_exact_match": True,
    }
    row.update(overrides)
    return row


class IndexByOffsetTests(unittest.TestCase):
    def test_indexes_by_offset(self) -> None:
        rows = [confirmed_row("a", 0x100), confirmed_row("b", 0x200)]
        index = index_by_offset(rows)
        self.assertEqual(set(index), {0x100, 0x200})
        self.assertEqual(index[0x100]["candidate_name"], "a")

    def test_duplicate_offset_raises(self) -> None:
        rows = [confirmed_row("a", 0x100), confirmed_row("b", 0x100)]
        with self.assertRaises(ValueError):
            index_by_offset(rows)

    def test_empty_list_is_empty_index(self) -> None:
        self.assertEqual(index_by_offset([]), {})


class NamedPromotedClustersTests(unittest.TestCase):
    def test_filters_to_promoted_and_named(self) -> None:
        report = {
            "clusters": [
                named_cluster("h1", [coab_row("foo", 0x100)]),
                {"cluster_hash": "h2", "promotion_status": "promoted", "has_recovered_semantic_name": False,
                 "evidence": {"coab": [coab_row("sub_200", 0x200)]}},
                {"cluster_hash": "h3", "promotion_status": "unpromoted-structural-sibling-nomination",
                 "has_recovered_semantic_name": False, "evidence": {"coab": []}},
            ]
        }
        result = named_promoted_clusters(report)
        self.assertEqual([c["cluster_hash"] for c in result], ["h1"])


class UnnamedPromotedClustersTests(unittest.TestCase):
    def test_filters_to_promoted_and_unnamed(self) -> None:
        report = {
            "clusters": [
                named_cluster("h1", [coab_row("foo", 0x100)]),
                unnamed_cluster("h2", [unnamed_coab_row("sub_200", 0x200)]),
                {"cluster_hash": "h3", "promotion_status": "unpromoted-structural-sibling-nomination",
                 "has_recovered_semantic_name": False, "evidence": {"coab": []}},
            ]
        }
        result = unnamed_promoted_clusters(report)
        self.assertEqual([c["cluster_hash"] for c in result], ["h2"])


class ClassifyStructuralConfirmationsTests(unittest.TestCase):
    """The unnamed-cluster sibling of ClassifyCandidatesTests. Covers the same three
    classification shapes, but the output never carries an invented semantic name -- only each
    cluster's own placeholder (`oracle_symbol`)."""

    def test_confirmed_offset_produces_a_structural_confirmation(self) -> None:
        report = {"clusters": [unnamed_cluster("h2", [unnamed_coab_row("sub_30168", 0x8240)])]}
        evidence = {"confirmed_roles": [confirmed_row("sub_30168", 0x8240)], "rejected_roles": []}
        confirmed, unconfirmed, rejected = classify_structural_confirmations(report, evidence)
        self.assertIn("sub_30168", confirmed)
        self.assertEqual(confirmed["sub_30168"]["runtime_status"], "structurally_confirmed_no_semantic_name")
        self.assertEqual(confirmed["sub_30168"]["retail_file_offset"], 0x8240)
        self.assertNotIn("candidate_name", confirmed["sub_30168"])  # never a semantic-name field
        self.assertEqual(unconfirmed, [])
        self.assertEqual(rejected, [])

    def test_placeholder_uses_oracle_symbol_not_candidate_name(self) -> None:
        # Real goldbox-symbol-candidates.json rows for unnamed clusters carry candidate_name=None
        # and the mangled oracle_symbol (e.g. "@sub_66BDB$qn6Player") as the only identifier.
        report = {"clusters": [unnamed_cluster("h2", [unnamed_coab_row("@sub_66BDB$qn6Player", 0x38280)])]}
        evidence = {"confirmed_roles": [confirmed_row("sub_66BDB", 0x38280)], "rejected_roles": []}
        confirmed, unconfirmed, rejected = classify_structural_confirmations(report, evidence)
        self.assertIn("@sub_66BDB$qn6Player", confirmed)
        self.assertEqual(unconfirmed, [])

    def test_no_evidence_at_all_is_unconfirmed(self) -> None:
        report = {"clusters": [unnamed_cluster("h2", [unnamed_coab_row("sub_3B70E", 0x115F5)])]}
        evidence = {"confirmed_roles": [], "rejected_roles": []}
        confirmed, unconfirmed, rejected = classify_structural_confirmations(report, evidence)
        self.assertEqual(confirmed, {})
        self.assertEqual(len(unconfirmed), 1)
        self.assertEqual(unconfirmed[0]["placeholder"], "sub_3B70E")
        self.assertIn("no runtime trace attempt", unconfirmed[0]["reason"])
        self.assertEqual(rejected, [])

    def test_rejected_offset_is_excluded_and_recorded(self) -> None:
        report = {"clusters": [unnamed_cluster("h2", [unnamed_coab_row("@sub_6B3D1$qn6Player", 0x3C031)])]}
        evidence = {
            "confirmed_roles": [],
            "rejected_roles": [{
                "candidate_name": "sub_6B3D1", "retail_file_offset": 0x3C031,
                "reason": "dump window exceeds descriptor code_size boundary",
                "observed_hex": "aabbcc", "expected_hex": "112233",
            }],
        }
        confirmed, unconfirmed, rejected = classify_structural_confirmations(report, evidence)
        self.assertEqual(confirmed, {})
        self.assertEqual(unconfirmed, [])
        self.assertEqual(len(rejected), 1)
        self.assertEqual(rejected[0]["placeholder"], "@sub_6B3D1$qn6Player")
        self.assertEqual(rejected[0]["reason"], "dump window exceeds descriptor code_size boundary")

    def test_named_clusters_never_appear_in_structural_classification(self) -> None:
        report = {"clusters": [named_cluster("h1", [coab_row("willOverload", 0x2bd06)])]}
        evidence = {"confirmed_roles": [confirmed_row("willOverload", 0x2bd06)], "rejected_roles": []}
        confirmed, unconfirmed, rejected = classify_structural_confirmations(report, evidence)
        self.assertEqual(confirmed, {})
        self.assertEqual(unconfirmed, [])
        self.assertEqual(rejected, [])

    def test_join_is_by_offset_across_named_and_unnamed_evidence(self) -> None:
        # A mixed report: named clusters must still classify via classify_candidates, unnamed via
        # classify_structural_confirmations, both reading the same evidence file without
        # interfering with each other.
        report = {"clusters": [
            named_cluster("h1", [coab_row("willOverload", 0x2bd06)]),
            unnamed_cluster("h2", [unnamed_coab_row("sub_30168", 0x8240)]),
        ]}
        evidence = {
            "confirmed_roles": [confirmed_row("willOverload", 0x2bd06), confirmed_row("sub_30168", 0x8240)],
            "rejected_roles": [],
        }
        symbols, _, _ = classify_candidates(report, evidence)
        confirmed, _, _ = classify_structural_confirmations(report, evidence)
        self.assertIn("willOverload", symbols)
        self.assertNotIn("sub_30168", symbols)
        self.assertIn("sub_30168", confirmed)
        self.assertNotIn("willOverload", confirmed)


class ClassifyCandidatesTests(unittest.TestCase):
    """Covers the three classification shapes the task specifies: confirmed / unconfirmed / rejected."""

    def test_confirmed_offset_produces_a_symbol_entry(self) -> None:
        report = {"clusters": [named_cluster("h1", [coab_row("willOverload", 0x2bd06)])]}
        evidence = {"confirmed_roles": [confirmed_row("willOverload", 0x2bd06)], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertIn("willOverload", symbols)
        self.assertEqual(symbols["willOverload"]["runtime_status"], "confirmed")
        self.assertEqual(symbols["willOverload"]["retail_file_offset"], 0x2bd06)
        self.assertEqual(unconfirmed, [])
        self.assertEqual(rejected, [])

    def test_no_evidence_at_all_is_unconfirmed(self) -> None:
        report = {"clusters": [named_cluster("h1", [coab_row("clear_actions", 0x39e89)])]}
        evidence = {"confirmed_roles": [], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(len(unconfirmed), 1)
        self.assertEqual(unconfirmed[0]["candidate_name"], "clear_actions")
        self.assertIn("no runtime trace attempt", unconfirmed[0]["reason"])
        self.assertEqual(rejected, [])

    def test_rejected_offset_is_excluded_from_symbols_and_recorded(self) -> None:
        report = {"clusters": [named_cluster("h1", [coab_row("odd_math", 0x366d2)])]}
        evidence = {
            "confirmed_roles": [],
            "rejected_roles": [{
                "candidate_name": "odd_math", "retail_file_offset": 0x366d2,
                "reason": "observed bytes did not match retail GAME.OVR at the resolved segment",
                "observed_hex": "aabbcc", "expected_hex": "112233",
            }],
        }
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(unconfirmed, [])
        self.assertEqual(len(rejected), 1)
        self.assertEqual(rejected[0]["candidate_name"], "odd_math")
        self.assertEqual(rejected[0]["reason"], "observed bytes did not match retail GAME.OVR at the resolved segment")

    def test_rejected_takes_priority_over_a_stray_confirmed_row_at_same_offset(self) -> None:
        # Defensive: an evidence file should never have the same offset in both lists, but if
        # it did, a genuine mismatch must never be silently overridden by a confirmed row.
        report = {"clusters": [named_cluster("h1", [coab_row("odd_math", 0x366d2)])]}
        evidence = {
            "confirmed_roles": [confirmed_row("odd_math", 0x366d2)],
            "rejected_roles": [{"candidate_name": "odd_math", "retail_file_offset": 0x366d2, "reason": "mismatch"}],
        }
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(len(rejected), 1)

    def test_confirmed_row_present_but_not_all_exact_is_treated_as_unconfirmed(self) -> None:
        report = {"clusters": [named_cluster("h1", [coab_row("stat_bonus", 0x38820)])]}
        evidence = {
            "confirmed_roles": [confirmed_row("stat_bonus", 0x38820, all_runs_exact_match=False)],
            "rejected_roles": [],
        }
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(len(unconfirmed), 1)
        self.assertEqual(unconfirmed[0]["candidate_name"], "stat_bonus")

    def test_cluster_with_two_names_can_split_confirmed_and_unconfirmed(self) -> None:
        # getExtraFirstSkill / getFirstSkill shape: one cluster, two coab evidence rows at two
        # different offsets. Confirming one must never be assumed to confirm the other.
        report = {"clusters": [named_cluster(
            "h1", [coab_row("getExtraFirstSkill", 0x3bf0a), coab_row("getFirstSkill", 0x3bf66)]
        )]}
        evidence = {"confirmed_roles": [confirmed_row("getExtraFirstSkill", 0x3bf0a)], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertIn("getExtraFirstSkill", symbols)
        self.assertNotIn("getFirstSkill", symbols)
        self.assertEqual(len(unconfirmed), 1)
        self.assertEqual(unconfirmed[0]["candidate_name"], "getFirstSkill")

    def test_join_is_by_offset_not_name(self) -> None:
        # The evidence file's own role label ("operand_parser") can differ from the CoAB
        # oracle's semantic name ("parse_command_sub") at the exact same retail offset.
        report = {"clusters": [named_cluster("h1", [coab_row("parse_command_sub", 0x810a)])]}
        evidence = {"confirmed_roles": [confirmed_row("operand_parser", 0x810a)], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertIn("parse_command_sub", symbols)
        self.assertEqual(symbols["parse_command_sub"]["retail_file_offset"], 0x810a)

    def test_unnamed_placeholder_cluster_is_never_classified(self) -> None:
        report = {"clusters": [
            {"cluster_hash": "h2", "promotion_status": "promoted", "has_recovered_semantic_name": False,
             "evidence": {"coab": [coab_row(None, 0x9000)]}},
        ]}
        evidence = {"confirmed_roles": [], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(unconfirmed, [])
        self.assertEqual(rejected, [])


class BuildReportTests(unittest.TestCase):
    def test_report_is_deterministic(self) -> None:
        report_in = {"clusters": [
            named_cluster("h1", [coab_row("willOverload", 0x2bd06)]),
            named_cluster("h2", [coab_row("odd_math", 0x366d2)]),
        ]}
        evidence = {"confirmed_roles": [confirmed_row("willOverload", 0x2bd06)], "rejected_roles": []}
        out_1 = build_report(report_in, evidence)
        out_2 = build_report(report_in, evidence)
        self.assertEqual(out_1, out_2)

    def test_summary_counts_reconcile(self) -> None:
        report_in = {"clusters": [
            named_cluster("h1", [coab_row("willOverload", 0x2bd06)]),
            named_cluster("h2", [coab_row("odd_math", 0x366d2)]),
            named_cluster("h3", [coab_row("clear_spell", 0x38bc5)]),
            unnamed_cluster("h4", [unnamed_coab_row("sub_9000", 0x9000)]),
        ]}
        evidence = {
            "confirmed_roles": [confirmed_row("willOverload", 0x2bd06)],
            "rejected_roles": [{"candidate_name": "odd_math", "retail_file_offset": 0x366d2, "reason": "mismatch"}],
        }
        report = build_report(report_in, evidence)
        summary = report["summary"]
        self.assertEqual(summary["promoted_clusters_total"], 4)
        self.assertEqual(summary["promoted_named_clusters"], 3)
        self.assertEqual(summary["promoted_unnamed_clusters"], 1)
        self.assertEqual(summary["runtime_confirmed_symbols"], 1)
        self.assertEqual(summary["runtime_unconfirmed_candidates"], 1)  # clear_spell
        self.assertEqual(summary["runtime_rejected_candidates"], 1)  # odd_math
        self.assertIn("willOverload", report["symbols"])
        self.assertEqual(report["rejected_candidates"][0]["candidate_name"], "odd_math")
        self.assertEqual(report["unconfirmed_candidates"][0]["candidate_name"], "clear_spell")
        # h4 (unnamed) has no runtime evidence at all -- counted as unnamed-structural-unconfirmed,
        # never mixed into the named symbols/unconfirmed/rejected buckets above.
        self.assertEqual(summary["unnamed_structural_confirmed"], 0)
        self.assertEqual(summary["unnamed_structural_unconfirmed"], 1)
        self.assertEqual(summary["unnamed_structural_rejected"], 0)
        self.assertEqual(report["unnamed_structural_unconfirmed"][0]["placeholder"], "sub_9000")
        self.assertEqual(report["unnamed_structural_confirmations"], {})

    def test_unnamed_structural_confirmation_appears_alongside_named_symbols(self) -> None:
        report_in = {"clusters": [
            named_cluster("h1", [coab_row("willOverload", 0x2bd06)]),
            unnamed_cluster("h2", [unnamed_coab_row("sub_30168", 0x8240)]),
        ]}
        evidence = {
            "confirmed_roles": [confirmed_row("willOverload", 0x2bd06), confirmed_row("sub_30168", 0x8240)],
            "rejected_roles": [],
        }
        report = build_report(report_in, evidence)
        self.assertIn("willOverload", report["symbols"])
        self.assertNotIn("sub_30168", report["symbols"])
        self.assertIn("sub_30168", report["unnamed_structural_confirmations"])
        self.assertEqual(report["summary"]["runtime_confirmed_symbols"], 1)
        self.assertEqual(report["summary"]["unnamed_structural_confirmed"], 1)

    def test_symbols_are_sorted_by_name(self) -> None:
        report_in = {"clusters": [
            named_cluster("h1", [coab_row("zz_last", 0x100)]),
            named_cluster("h2", [coab_row("aa_first", 0x200)]),
        ]}
        evidence = {
            "confirmed_roles": [confirmed_row("zz_last", 0x100), confirmed_row("aa_first", 0x200)],
            "rejected_roles": [],
        }
        report = build_report(report_in, evidence)
        self.assertEqual(list(report["symbols"].keys()), ["aa_first", "zz_last"])


if __name__ == "__main__":
    unittest.main()
