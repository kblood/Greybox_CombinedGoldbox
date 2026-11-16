from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from emit_pool_runtime_symbols import (  # noqa: E402
    DEFAULT_EXECUTION_TRACE,
    build_report,
    classify_candidates,
    execution_trace_confirmed_roles,
    index_by_offset,
    merge_evidence,
    pool_evidence_bearing_clusters,
)


def pool_cluster(
    cluster_hash: str,
    pool_rows: list[dict[str, object]],
    *,
    coab_rows: list[dict[str, object]] | None = None,
    match_kind: str = "relocation-normalized",
    confidence: str = "high",
    promoted_by: list[str] | None = None,
    multi_title_corroborated: bool = True,
) -> dict[str, object]:
    return {
        "cluster_hash": cluster_hash,
        "promotion_status": "promoted",
        "has_recovered_semantic_name": True,
        "match_kind": match_kind,
        "confidence": confidence,
        "promoted_by": promoted_by or ["curse-of-the-azure-bonds", "pool-of-radiance"],
        "multi_title_corroborated": multi_title_corroborated,
        "evidence": {"coab": coab_rows or [], "pool": pool_rows, "secret": []},
    }


def coab_only_cluster(cluster_hash: str, offset: int, name: str) -> dict[str, object]:
    return {
        "cluster_hash": cluster_hash,
        "promotion_status": "promoted",
        "has_recovered_semantic_name": True,
        "match_kind": "exact",
        "confidence": "high",
        "promoted_by": ["curse-of-the-azure-bonds"],
        "multi_title_corroborated": False,
        "evidence": {"coab": [{"candidate_name": name, "retail_file_offset": offset}], "pool": [], "secret": []},
    }


def pool_row(name: str, offset: int, **overrides: object) -> dict[str, object]:
    row = {
        "candidate_name": name,
        "role": name,
        "file_offset": offset,
        "kind": "subsystem_function",
        "cluster_confidence": "high",
        "cluster_match_kind": "relocation-normalized",
        "cluster_source_count": 5,
        "source_citation": f"build/pool-behavior-clusters.json#functions[role={name}]",
        "title": "pool-of-radiance",
    }
    row.update(overrides)
    return row


def confirmed_row(name: str, offset: int, **overrides: object) -> dict[str, object]:
    row = {
        "candidate_name": name,
        "retail_file_offset": offset,
        "descriptor": 7,
        "unit": "ovr008",
        "relative_offset": "0x0000",
        "byte_count": 128,
        "runtime_segments_observed": ["3089"],
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


class PoolEvidenceBearingClustersTests(unittest.TestCase):
    def test_filters_to_promoted_with_nonempty_pool_evidence(self) -> None:
        report = {
            "clusters": [
                pool_cluster("h1", [pool_row("operand_parser", 0x74D3)]),
                coab_only_cluster("h2", 0x2bd06, "willOverload"),
                {"cluster_hash": "h3", "promotion_status": "unpromoted-structural-sibling-nomination",
                 "evidence": {"pool": [pool_row("ignored", 0x9000)]}},
            ]
        }
        result = pool_evidence_bearing_clusters(report)
        self.assertEqual([c["cluster_hash"] for c in result], ["h1"])


class ClassifyCandidatesTests(unittest.TestCase):
    """Covers the three classification shapes: confirmed / unconfirmed / rejected."""

    def test_confirmed_offset_produces_a_symbol_entry(self) -> None:
        report = {"clusters": [pool_cluster("h1", [pool_row("operand_parser", 0x74D3)])]}
        evidence = {"confirmed_roles": [confirmed_row("operand_parser", 0x74D3)], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertIn("operand_parser", symbols)
        self.assertEqual(symbols["operand_parser"]["runtime_status"], "confirmed")
        self.assertEqual(symbols["operand_parser"]["retail_file_offset"], 0x74D3)
        self.assertEqual(unconfirmed, [])
        self.assertEqual(rejected, [])

    def test_no_evidence_at_all_is_unconfirmed(self) -> None:
        report = {"clusters": [pool_cluster("h1", [pool_row("operand_parser", 0x74D3)])]}
        evidence = {"confirmed_roles": [], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(len(unconfirmed), 1)
        self.assertEqual(unconfirmed[0]["candidate_name"], "operand_parser")
        self.assertIn("no runtime trace attempt", unconfirmed[0]["reason"])
        self.assertEqual(rejected, [])

    def test_rejected_offset_is_excluded_from_symbols_and_recorded(self) -> None:
        report = {"clusters": [pool_cluster("h1", [pool_row("operand_parser", 0x74D3)])]}
        evidence = {
            "confirmed_roles": [],
            "rejected_roles": [{
                "candidate_name": "operand_parser", "retail_file_offset": 0x74D3,
                "reason": "observed bytes did not match retail GAME.OVR at the resolved segment",
                "observed_hex": "aabbcc", "expected_hex": "112233",
            }],
        }
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(unconfirmed, [])
        self.assertEqual(len(rejected), 1)
        self.assertEqual(rejected[0]["candidate_name"], "operand_parser")

    def test_rejected_takes_priority_over_a_stray_confirmed_row_at_same_offset(self) -> None:
        report = {"clusters": [pool_cluster("h1", [pool_row("operand_parser", 0x74D3)])]}
        evidence = {
            "confirmed_roles": [confirmed_row("operand_parser", 0x74D3)],
            "rejected_roles": [{"candidate_name": "operand_parser", "retail_file_offset": 0x74D3, "reason": "mismatch"}],
        }
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(len(rejected), 1)

    def test_confirmed_row_present_but_not_all_exact_is_treated_as_unconfirmed(self) -> None:
        report = {"clusters": [pool_cluster("h1", [pool_row("operand_parser", 0x74D3)])]}
        evidence = {
            "confirmed_roles": [confirmed_row("operand_parser", 0x74D3, all_runs_exact_match=False)],
            "rejected_roles": [],
        }
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(len(unconfirmed), 1)

    def test_join_is_by_offset_not_name(self) -> None:
        # A Pool evidence row's own `role`/`candidate_name` can in principle differ from the
        # trace evidence file's own role label at the same file_offset; join by offset only.
        report = {"clusters": [pool_cluster("h1", [pool_row("operand_parser", 0x74D3)])]}
        evidence = {"confirmed_roles": [confirmed_row("operand_parser_alt_label", 0x74D3)], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertIn("operand_parser", symbols)
        self.assertEqual(symbols["operand_parser"]["retail_file_offset"], 0x74D3)

    def test_coab_only_cluster_is_never_classified(self) -> None:
        report = {"clusters": [coab_only_cluster("h2", 0x2bd06, "willOverload")]}
        evidence = {"confirmed_roles": [], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(symbols, {})
        self.assertEqual(unconfirmed, [])
        self.assertEqual(rejected, [])

    def test_falls_back_to_role_when_candidate_name_missing(self) -> None:
        report = {"clusters": [pool_cluster("h1", [pool_row(None, 0x74D3, role="operand_parser")])]}
        evidence = {"confirmed_roles": [], "rejected_roles": []}
        symbols, unconfirmed, rejected = classify_candidates(report, evidence)
        self.assertEqual(unconfirmed[0]["candidate_name"], "operand_parser")


class BuildReportTests(unittest.TestCase):
    def test_report_is_deterministic(self) -> None:
        report_in = {"clusters": [pool_cluster("h1", [pool_row("operand_parser", 0x74D3)])]}
        evidence = {"confirmed_roles": [confirmed_row("operand_parser", 0x74D3)], "rejected_roles": []}
        out_1 = build_report(report_in, evidence)
        out_2 = build_report(report_in, evidence)
        self.assertEqual(out_1, out_2)

    def test_summary_counts_reconcile(self) -> None:
        report_in = {"clusters": [
            pool_cluster("h1", [pool_row("operand_parser", 0x74D3)]),
            coab_only_cluster("h2", 0x2bd06, "willOverload"),
        ]}
        evidence = {"confirmed_roles": [confirmed_row("operand_parser", 0x74D3)], "rejected_roles": []}
        report = build_report(report_in, evidence)
        summary = report["summary"]
        self.assertEqual(summary["promoted_clusters_total"], 2)
        self.assertEqual(summary["promoted_pool_evidence_bearing_clusters"], 1)
        self.assertEqual(summary["runtime_confirmed_symbols"], 1)
        self.assertEqual(summary["runtime_unconfirmed_candidates"], 0)
        self.assertEqual(summary["runtime_rejected_candidates"], 0)
        self.assertIn("operand_parser", report["symbols"])

    def test_matches_real_corpus_shape(self) -> None:
        # Mirrors the actual single evidence.pool row in build/goldbox-symbol-candidates.json
        # at the time this tool was written: the CoAB+Pool corroborated operand_parser cluster.
        report_in = {"clusters": [pool_cluster(
            "40a74145d02b470b2af3e51fd782f8d6f7ae53ea406a7a4e5a4207f50db0edc0",
            [pool_row("operand_parser", 29907)],
            coab_rows=[{"candidate_name": "parse_command_sub", "retail_file_offset": 33034}],
        )]}
        evidence = {"confirmed_roles": [confirmed_row("operand_parser", 29907)], "rejected_roles": []}
        report = build_report(report_in, evidence)
        self.assertEqual(report["summary"]["runtime_confirmed_symbols"], 1)
        self.assertEqual(report["symbols"]["operand_parser"]["retail_file_offset"], 29907)


POOL_OPERAND_PARSER_OFFSET = 29907  # GAME.OVR:0x74D3


def real_execution_trace() -> dict[str, object]:
    return json.loads(DEFAULT_EXECUTION_TRACE.read_text(encoding="utf-8"))


def real_cluster_report() -> dict[str, object]:
    """The single real `evidence.pool` cluster, restated locally so the fresh-checkout test does
    not depend on the git-ignored `build/goldbox-symbol-candidates.json` being present."""
    return {"clusters": [pool_cluster(
        "40a74145d02b470b2af3e51fd782f8d6f7ae53ea406a7a4e5a4207f50db0edc0",
        [pool_row("operand_parser", POOL_OPERAND_PARSER_OFFSET)],
        coab_rows=[{"candidate_name": "parse_command_sub", "retail_file_offset": 33034}],
    )]}


class ExecutionTraceTests(unittest.TestCase):
    """The committed 2026-07-22 Pool CS:IP trace is the fresh-checkout evidence source.

    Before it was wired, this tool read only `build/pool-runtime-validated-symbols.json`, which
    is git-ignored -- so a clean clone regenerated an all-unconfirmed report while the committed
    `docs/engine/research/pool-runtime-symbols.generated.md` still claimed a confirmed symbol.
    """

    def test_the_committed_trace_file_is_actually_present(self) -> None:
        self.assertTrue(DEFAULT_EXECUTION_TRACE.exists(), DEFAULT_EXECUTION_TRACE)

    def test_the_real_trace_adapts_to_one_confirmed_row_at_the_right_offset(self) -> None:
        rows = execution_trace_confirmed_roles(real_execution_trace())
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["retail_file_offset"], POOL_OPERAND_PARSER_OFFSET)
        self.assertEqual(row["unit"], "GAME.OVR")
        self.assertEqual(row["runtime_segments_observed"], ["30CF"])
        self.assertEqual(row["reproduced_run_count"], 2)
        self.assertEqual(row["hit_count"], 23)
        self.assertEqual(row["byte_count"], 24)
        self.assertTrue(row["all_runs_exact_match"])
        self.assertTrue(row["execution_confirmed"])

    def test_a_fresh_checkout_with_no_build_artifact_still_reports_confirmed(self) -> None:
        # This is the regression the wiring exists for.
        report = build_report(
            real_cluster_report(),
            {"confirmed_roles": [], "rejected_roles": []},
            execution_trace=real_execution_trace(),
        )
        self.assertEqual(report["summary"]["runtime_confirmed_symbols"], 1)
        self.assertEqual(report["summary"]["execution_confirmed_symbols"], 1)
        self.assertEqual(report["summary"]["runtime_unconfirmed_candidates"], 0)
        self.assertTrue(report["symbols"]["operand_parser"]["execution_confirmed"])

    def test_without_the_trace_a_fresh_checkout_would_report_unconfirmed(self) -> None:
        # The control: this is exactly the stale-report behaviour the wiring removes. If this
        # ever passes with confirmed=1, the test above has stopped proving anything.
        report = build_report(real_cluster_report(), {"confirmed_roles": [], "rejected_roles": []})
        self.assertEqual(report["summary"]["runtime_confirmed_symbols"], 0)
        self.assertEqual(report["summary"]["runtime_unconfirmed_candidates"], 1)

    def test_a_single_corrupted_hit_body_downgrades_the_row_to_unconfirmed(self) -> None:
        # Mutation control: `all_runs_exact_match` is re-derived from the hits, not copied from
        # the trace's own boolean, so a doctored hit cannot ride in on the verdict field.
        trace = copy.deepcopy(real_execution_trace())
        hit = trace["operand_parser"]["hits"][7]
        hit["resident_bytes_hex"] = "ff" + hit["resident_bytes_hex"][2:]
        rows = execution_trace_confirmed_roles(trace)
        self.assertFalse(rows[0]["all_runs_exact_match"])
        report = build_report(
            real_cluster_report(), {"confirmed_roles": [], "rejected_roles": []},
            execution_trace=trace,
        )
        self.assertEqual(report["summary"]["runtime_confirmed_symbols"], 0)
        self.assertEqual(report["summary"]["runtime_unconfirmed_candidates"], 1)

    def test_a_hit_at_a_different_pointer_downgrades_the_row_to_unconfirmed(self) -> None:
        trace = copy.deepcopy(real_execution_trace())
        trace["operand_parser"]["hits"][0]["pointer"] = "1234:0000"
        self.assertFalse(execution_trace_confirmed_roles(trace)[0]["all_runs_exact_match"])

    def test_a_trace_that_never_reached_its_verdict_yields_no_row(self) -> None:
        for field in ("cs_ip_hit_confirmed", "byte_match_confirmed"):
            trace = copy.deepcopy(real_execution_trace())
            trace["operand_parser"][field] = False
            self.assertEqual(execution_trace_confirmed_roles(trace), [], field)

    def test_missing_or_malformed_traces_are_no_evidence_not_errors(self) -> None:
        self.assertEqual(execution_trace_confirmed_roles(None), [])
        self.assertEqual(execution_trace_confirmed_roles({}), [])
        self.assertEqual(execution_trace_confirmed_roles({"operand_parser": {}}), [])
        trace = copy.deepcopy(real_execution_trace())
        trace["operand_parser"]["static_file_offset"] = "GAME.OVR:not-a-number"
        self.assertEqual(execution_trace_confirmed_roles(trace), [])
        trace = copy.deepcopy(real_execution_trace())
        trace["operand_parser"]["hits"] = []
        self.assertEqual(execution_trace_confirmed_roles(trace), [])


class MergeEvidenceTests(unittest.TestCase):
    def test_committed_rows_win_at_the_same_offset(self) -> None:
        execution_rows = execution_trace_confirmed_roles(real_execution_trace())
        evidence = {
            "confirmed_roles": [confirmed_row("operand_parser", POOL_OPERAND_PARSER_OFFSET)],
            "rejected_roles": [],
        }
        merged = merge_evidence(evidence, execution_rows)
        self.assertEqual(len(merged["confirmed_roles"]), 1)
        self.assertEqual(merged["confirmed_roles"][0]["unit"], "GAME.OVR")

    def test_the_generated_report_is_the_same_with_or_without_a_local_build_artifact(self) -> None:
        # The point of committed-wins: a machine that happens to have run a local trace must not
        # generate a different committed document than a clean clone does.
        clusters = real_cluster_report()
        trace = real_execution_trace()
        without = build_report(clusters, {"confirmed_roles": [], "rejected_roles": []}, execution_trace=trace)
        with_build = build_report(
            clusters,
            {"confirmed_roles": [confirmed_row("operand_parser", POOL_OPERAND_PARSER_OFFSET)],
             "rejected_roles": []},
            execution_trace=trace,
        )
        self.assertEqual(without, with_build)

    def test_build_rows_at_other_offsets_survive(self) -> None:
        execution_rows = execution_trace_confirmed_roles(real_execution_trace())
        evidence = {"confirmed_roles": [confirmed_row("other", 0x9999)], "rejected_roles": []}
        merged = merge_evidence(evidence, execution_rows)
        self.assertEqual(
            sorted(int(row["retail_file_offset"]) for row in merged["confirmed_roles"]),
            [POOL_OPERAND_PARSER_OFFSET, 0x9999],
        )

    def test_a_local_rejection_still_overrides_a_committed_confirmation(self) -> None:
        # A genuine local byte mismatch is negative evidence and must not be masked by the
        # committed trace; `classify_candidates` checks rejections first.
        report = build_report(
            real_cluster_report(),
            {"confirmed_roles": [],
             "rejected_roles": [{"candidate_name": "operand_parser",
                                 "retail_file_offset": POOL_OPERAND_PARSER_OFFSET,
                                 "reason": "mismatch"}]},
            execution_trace=real_execution_trace(),
        )
        self.assertEqual(report["summary"]["runtime_confirmed_symbols"], 0)
        self.assertEqual(report["summary"]["runtime_rejected_candidates"], 1)


if __name__ == "__main__":
    unittest.main()
