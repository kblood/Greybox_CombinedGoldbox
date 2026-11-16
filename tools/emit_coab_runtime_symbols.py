"""Emit the stable, runtime-confirmed CoAB symbol import map.

This is the P1.3c "Emit stable candidate-symbol JSON/import maps only for surviving
game-specific evidence; retain rejected candidates and reasons in the generated report"
leaf (BUILD-QUEUE.md), applied to the CoAB-only slice of `build/goldbox-symbol-candidates.json`
(the static structural-correlation join built by `tools/emit_symbol_candidates.py`).

That file promotes a cluster the moment *some* title's own same-game evidence (oracle map,
dispatch/replay join) reaches it -- it never runs a DOS binary. This tool adds one more join
on top, orthogonal to that one: has a native CS:IP trace (`tools/trace_coab_symbol_bytematch.ps1`,
staged by `tools/stage_coab_runtime.py`) actually observed the *runtime* bytes at the candidate's
retail file offset and found them byte-identical to retail `GAME.OVR`? That evidence lives in a
separate raw-evidence file (default `build/coab-runtime-validated-symbols.json`), because a
runtime trace is expensive (one owned DOSBox-X session) and only ever covers a subset of the
statically-promoted candidates -- this tool's whole job is to keep the two artifacts distinct and
join them honestly rather than overwriting or copying evidence between them.

Three-way classification per named, promoted CoAB candidate (matched by exact
`retail_file_offset`, never by name alone -- the runtime evidence file's own role label can differ
from the CoAB-oracle semantic name at the same offset, e.g. the trace's `operand_parser` role
label vs. the oracle's `parse_command_sub` name for the same cluster/offset):

- **confirmed** -- the offset appears in the evidence file's `confirmed_roles` with
  `all_runs_exact_match: true`. Only these get a `symbols` map entry (the actual "stable
  candidate-symbol import map" this leaf asks for).
- **rejected** -- the offset appears in the evidence file's `rejected_roles` (a runtime trace was
  attempted and produced a genuine byte mismatch, not just "unreachable"). Retained with its
  reason, never silently dropped, never promoted.
- **unconfirmed** -- every other promoted, named candidate: either never attempted at runtime, or
  attempted and found unreachable without a save file. Retained as a list, not discarded, so the
  report stays honest about what remains open (see `docs/engine/HANDOFF.md` section 5,
  "UNLOCATED beats invention").

Promoted-but-unnamed (`sub_XXXXX` placeholder only) clusters are out of scope for the `symbols`
map (no semantic name to attach an import-map entry to) but are still counted in the summary for
transparency.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANDIDATES = REPO_ROOT / "build/goldbox-symbol-candidates.json"
DEFAULT_EVIDENCE = REPO_ROOT / "build/coab-runtime-validated-symbols.json"
DEFAULT_JSON = REPO_ROOT / "build/coab-runtime-symbols.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/coab-runtime-symbols.generated.md"

COAB_TITLE = "curse-of-the-azure-bonds"


def index_by_offset(rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """Index a raw-evidence role list by `retail_file_offset`. Strict: two rows claiming the
    same offset would be an internal evidence-file inconsistency, not a thing to silently pick
    one of."""
    index: dict[int, dict[str, Any]] = {}
    for row in rows:
        offset = int(row["retail_file_offset"])
        if offset in index:
            raise ValueError(f"duplicate retail_file_offset {offset:#x} in evidence rows")
        index[offset] = row
    return index


def named_promoted_clusters(candidates_report: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        cluster
        for cluster in candidates_report.get("clusters", [])
        if cluster.get("promotion_status") == "promoted" and cluster.get("has_recovered_semantic_name")
    ]


def unnamed_promoted_clusters(candidates_report: dict[str, Any]) -> list[dict[str, Any]]:
    """The sibling filter to `named_promoted_clusters`: promoted but no recovered semantic name
    (`sub_XXXXX` placeholder only). Round 3 (see
    docs/engine/research/coab-symbol-runtime-bytematch-round3.md) traces these 25 clusters the
    same way named ones are traced, but the result is a *structural* confirmation only -- it
    never produces a `symbols` (named import map) entry. See `classify_structural_confirmations`.
    """
    return [
        cluster
        for cluster in candidates_report.get("clusters", [])
        if cluster.get("promotion_status") == "promoted" and not cluster.get("has_recovered_semantic_name")
    ]


def classify_candidates(
    candidates_report: dict[str, Any], evidence: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """The one join this tool exists to make. Returns `(symbols, unconfirmed, rejected)`.

    Walks every promoted, named cluster's *CoAB* evidence rows (the only title with a runtime
    trace tool so far) one at a time -- a cluster with two semantic names at two different
    retail offsets (e.g. `getExtraFirstSkill`/`getFirstSkill`) can have one name confirmed and
    the other not; this never assumes both share one verdict.
    """
    confirmed_by_offset = index_by_offset(evidence.get("confirmed_roles", []))
    rejected_by_offset = index_by_offset(evidence.get("rejected_roles", []))

    symbols: dict[str, Any] = {}
    unconfirmed: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for cluster in named_promoted_clusters(candidates_report):
        for coab_row in cluster.get("evidence", {}).get("coab", []):
            name = coab_row.get("candidate_name")
            if not name:
                continue
            offset = int(coab_row["retail_file_offset"])

            if offset in rejected_by_offset:
                reject_row = rejected_by_offset[offset]
                rejected.append({
                    "candidate_name": name,
                    "retail_file_offset": offset,
                    "retail_file_offset_hex": f"0x{offset:X}",
                    "cluster_hash": cluster["cluster_hash"],
                    "reason": reject_row.get("reason", "runtime byte mismatch"),
                    "observed_hex": reject_row.get("observed_hex"),
                    "expected_hex": reject_row.get("expected_hex"),
                })
                continue

            if offset in confirmed_by_offset:
                evidence_row = confirmed_by_offset[offset]
                if not evidence_row.get("all_runs_exact_match", False):
                    # Present in confirmed_roles but not actually all-exact: treat as
                    # unconfirmed rather than inventing a pass. This should not happen in a
                    # well-formed evidence file (confirmed_roles is documented as
                    # all-exact-only), but this tool never trusts that by assumption.
                    unconfirmed.append({
                        "candidate_name": name,
                        "retail_file_offset": offset,
                        "retail_file_offset_hex": f"0x{offset:X}",
                        "cluster_hash": cluster["cluster_hash"],
                        "reason": "evidence row present but not all_runs_exact_match",
                    })
                    continue
                symbols[name] = {
                    "candidate_name": name,
                    "retail_file_offset": offset,
                    "retail_file_offset_hex": f"0x{offset:X}",
                    "descriptor": evidence_row["descriptor"],
                    "unit": evidence_row["unit"],
                    "relative_offset": evidence_row["relative_offset"],
                    "byte_count": evidence_row["byte_count"],
                    "runtime_segments_observed": evidence_row["runtime_segments_observed"],
                    "reproduced_run_count": evidence_row["reproduced_run_count"],
                    "runtime_status": "confirmed",
                    "cluster_hash": cluster["cluster_hash"],
                    "match_kind": cluster["match_kind"],
                    "confidence": cluster["confidence"],
                    "promoted_by": cluster["promoted_by"],
                    "multi_title_corroborated": cluster["multi_title_corroborated"],
                    "source_citation": coab_row.get("source_citation"),
                }
                continue

            unconfirmed.append({
                "candidate_name": name,
                "retail_file_offset": offset,
                "retail_file_offset_hex": f"0x{offset:X}",
                "cluster_hash": cluster["cluster_hash"],
                "reason": "no runtime trace attempt recorded in the evidence file yet",
            })

    return symbols, unconfirmed, rejected


def classify_structural_confirmations(
    candidates_report: dict[str, Any], evidence: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """The unnamed-cluster sibling of `classify_candidates`. These 25 promoted-but-unnamed
    (`sub_XXXXX` placeholder) clusters have no recovered semantic name -- this function never
    assigns one. It only confirms/rejects whether the STRUCTURAL correlation that promoted the
    cluster (tools/emit_symbol_candidates.py's static join) also holds at runtime: are the
    resident bytes at the cluster's `retail_file_offset` byte-identical to retail `GAME.OVR`? The
    placeholder identifier used throughout (each cluster's own `oracle_symbol`, e.g. `sub_30168`)
    is never treated as a semantic name and never promoted into the named `symbols` map that
    `classify_candidates` produces -- that map stays reserved for clusters with
    `has_recovered_semantic_name: true` (see `test_unnamed_placeholder_cluster_is_never_classified`
    in the test suite, which `classify_candidates` itself still satisfies unchanged). Reuses the
    identical offset-keyed join as `classify_candidates` (same `confirmed_roles`/`rejected_roles`
    evidence lists, same `index_by_offset` helper) -- only the cluster source list differs, and the
    output dict key is `placeholder` (an oracle_symbol string) instead of `candidate_name`.
    """
    confirmed_by_offset = index_by_offset(evidence.get("confirmed_roles", []))
    rejected_by_offset = index_by_offset(evidence.get("rejected_roles", []))

    confirmed: dict[str, Any] = {}
    unconfirmed: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for cluster in unnamed_promoted_clusters(candidates_report):
        for coab_row in cluster.get("evidence", {}).get("coab", []):
            offset = int(coab_row["retail_file_offset"])
            placeholder = coab_row.get("oracle_symbol") or f"offset_0x{offset:x}"

            if offset in rejected_by_offset:
                reject_row = rejected_by_offset[offset]
                rejected.append({
                    "placeholder": placeholder,
                    "retail_file_offset": offset,
                    "retail_file_offset_hex": f"0x{offset:X}",
                    "cluster_hash": cluster["cluster_hash"],
                    "reason": reject_row.get("reason", "runtime byte mismatch"),
                    "observed_hex": reject_row.get("observed_hex"),
                    "expected_hex": reject_row.get("expected_hex"),
                })
                continue

            if offset in confirmed_by_offset:
                evidence_row = confirmed_by_offset[offset]
                if not evidence_row.get("all_runs_exact_match", False):
                    unconfirmed.append({
                        "placeholder": placeholder,
                        "retail_file_offset": offset,
                        "retail_file_offset_hex": f"0x{offset:X}",
                        "cluster_hash": cluster["cluster_hash"],
                        "reason": "evidence row present but not all_runs_exact_match",
                    })
                    continue
                confirmed[placeholder] = {
                    "placeholder": placeholder,
                    "retail_file_offset": offset,
                    "retail_file_offset_hex": f"0x{offset:X}",
                    "descriptor": evidence_row["descriptor"],
                    "unit": evidence_row["unit"],
                    "relative_offset": evidence_row["relative_offset"],
                    "byte_count": evidence_row["byte_count"],
                    "runtime_segments_observed": evidence_row["runtime_segments_observed"],
                    "reproduced_run_count": evidence_row["reproduced_run_count"],
                    "runtime_status": "structurally_confirmed_no_semantic_name",
                    "cluster_hash": cluster["cluster_hash"],
                    "match_kind": cluster["match_kind"],
                    "confidence": cluster["confidence"],
                    "promoted_by": cluster["promoted_by"],
                    "source_citation": coab_row.get("source_citation"),
                }
                continue

            unconfirmed.append({
                "placeholder": placeholder,
                "retail_file_offset": offset,
                "retail_file_offset_hex": f"0x{offset:X}",
                "cluster_hash": cluster["cluster_hash"],
                "reason": "no runtime trace attempt recorded in the evidence file yet",
            })

    return confirmed, unconfirmed, rejected


CLAIM_BOUNDARY = (
    "A `symbols` entry means a native CoAB CS:IP trace (BPINT 21 42 seek-capture + post-read "
    "breakpoint + `D segment:offset` dump, see docs/engine/research/coab-symbol-runtime-bytematch.md "
    "and its round-2 sibling) reached that exact retail_file_offset at a resolved runtime segment "
    "during ordinary silent startup and found the resident bytes byte-identical to retail GAME.OVR, "
    "reproduced at least twice. It does NOT mean CS:IP was ever observed executing inside that "
    "function during real gameplay -- only that the loaded bytes are correct post-load, the same "
    "limitation already recorded for Gateway's descriptor-9 doc. `unconfirmed` candidates are "
    "statically promoted (some title's own oracle/dispatch evidence reaches them) but have no "
    "runtime trace attempt yet, or the attempt could not reach them without a save file -- they are "
    "not assumed correct. `rejected` candidates had a runtime trace attempt that produced a genuine "
    "byte mismatch; this is retained as negative evidence, never silently dropped. "
    "`unnamed_structural_confirmations` (round 3, see "
    "docs/engine/research/coab-symbol-runtime-bytematch-round3.md) is a DIFFERENT claim: these are "
    "the 25 promoted-but-UNNAMED (`sub_XXXXX` placeholder) clusters, byte-matched the same way, but "
    "the result only confirms/rejects the STATIC STRUCTURAL correlation that promoted the cluster -- "
    "it never assigns or implies a semantic name, and these entries never appear in `symbols`."
)


def build_report(candidates_report: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    symbols, unconfirmed, rejected = classify_candidates(candidates_report, evidence)
    structural_confirmed, structural_unconfirmed, structural_rejected = classify_structural_confirmations(
        candidates_report, evidence
    )
    named_clusters = named_promoted_clusters(candidates_report)
    all_promoted = [c for c in candidates_report.get("clusters", []) if c.get("promotion_status") == "promoted"]
    unnamed_promoted = [c for c in all_promoted if not c.get("has_recovered_semantic_name")]

    return {
        "schema_version": 1,
        "provenance": "p1.3c-coab-runtime-symbol-map",
        "profile_id": COAB_TITLE,
        "source_artifacts": {
            "symbol_candidates": "build/goldbox-symbol-candidates.json",
            "runtime_evidence": "build/coab-runtime-validated-symbols.json",
        },
        "symbols": dict(sorted(symbols.items())),
        "unconfirmed_candidates": sorted(
            unconfirmed, key=lambda row: (row["retail_file_offset"], row["candidate_name"])
        ),
        "rejected_candidates": sorted(
            rejected, key=lambda row: (row["retail_file_offset"], row["candidate_name"])
        ),
        "unnamed_structural_confirmations": dict(sorted(structural_confirmed.items())),
        "unnamed_structural_unconfirmed": sorted(
            structural_unconfirmed, key=lambda row: (row["retail_file_offset"], row["placeholder"])
        ),
        "unnamed_structural_rejected": sorted(
            structural_rejected, key=lambda row: (row["retail_file_offset"], row["placeholder"])
        ),
        "summary": {
            "promoted_clusters_total": len(all_promoted),
            "promoted_named_clusters": len(named_clusters),
            "promoted_unnamed_clusters": len(unnamed_promoted),
            "runtime_confirmed_symbols": len(symbols),
            "runtime_unconfirmed_candidates": len(unconfirmed),
            "runtime_rejected_candidates": len(rejected),
            "unnamed_structural_confirmed": len(structural_confirmed),
            "unnamed_structural_unconfirmed": len(structural_unconfirmed),
            "unnamed_structural_rejected": len(structural_rejected),
        },
        "claim_boundary": CLAIM_BOUNDARY,
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# CoAB Runtime-Confirmed Symbol Import Map",
        "",
        "> Generated by `python tools/emit_coab_runtime_symbols.py`. Do not edit by hand. Joins",
        "> `build/goldbox-symbol-candidates.json` (static structural promotion) against",
        "> `build/coab-runtime-validated-symbols.json` (native CS:IP byte-match evidence).",
        "",
        "## Gate",
        "",
        f"- Promoted clusters considered: `{summary['promoted_clusters_total']}` "
        f"(`{summary['promoted_named_clusters']}` named, `{summary['promoted_unnamed_clusters']}` "
        "address-placeholder only, out of scope for the symbol map).",
        f"- Runtime-confirmed symbols: `{summary['runtime_confirmed_symbols']}`.",
        f"- Still runtime-unconfirmed named candidates: `{summary['runtime_unconfirmed_candidates']}`.",
        f"- Runtime-rejected candidates (genuine byte mismatch): `{summary['runtime_rejected_candidates']}`.",
        "",
        "## Confirmed Symbols",
        "",
        "| Name | Retail offset | Descriptor (unit) | Relative offset | Runtime segment(s) | Reproductions |",
        "| --- | ---: | --- | ---: | --- | ---: |",
    ]
    for name, row in report["symbols"].items():
        segs = ", ".join(row["runtime_segments_observed"])
        lines.append(
            f"| `{name}` | `{row['retail_file_offset_hex']}` | {row['descriptor']} ({row['unit']}) | "
            f"`{row['relative_offset']}` | {segs} | {row['reproduced_run_count']} |"
        )
    lines += [
        "",
        "## Still Unconfirmed (promoted, named, no runtime evidence yet)",
        "",
        "| Name | Retail offset | Cluster | Reason |",
        "| --- | ---: | --- | --- |",
    ]
    if not report["unconfirmed_candidates"]:
        lines.append("| *(none)* | | | |")
    for row in report["unconfirmed_candidates"]:
        lines.append(
            f"| `{row['candidate_name']}` | `{row['retail_file_offset_hex']}` | "
            f"`{row['cluster_hash'][:16]}` | {row['reason']} |"
        )
    lines += [
        "",
        "## Rejected (runtime byte mismatch)",
        "",
        "| Name | Retail offset | Cluster | Reason |",
        "| --- | ---: | --- | --- |",
    ]
    if not report["rejected_candidates"]:
        lines.append("| *(none this round)* | | | |")
    for row in report["rejected_candidates"]:
        lines.append(
            f"| `{row['candidate_name']}` | `{row['retail_file_offset_hex']}` | "
            f"`{row['cluster_hash'][:16]}` | {row['reason']} |"
        )
    lines += [
        "",
        "## Unnamed Structural Cluster Confirmations (round 3)",
        "",
        "Promoted-but-unnamed (`sub_XXXXX` placeholder) clusters. Confirming these validates the",
        "STATIC STRUCTURAL correlation only -- no semantic name is assigned or implied, and none of",
        "these rows ever appear in the `symbols` map above.",
        "",
        f"- Structurally confirmed: `{summary['unnamed_structural_confirmed']}`.",
        f"- Still unconfirmed: `{summary['unnamed_structural_unconfirmed']}`.",
        f"- Rejected (genuine byte mismatch): `{summary['unnamed_structural_rejected']}`.",
        "",
        "| Placeholder | Retail offset | Descriptor (unit) | Relative offset | Runtime segment(s) | Reproductions |",
        "| --- | ---: | --- | ---: | --- | ---: |",
    ]
    if not report["unnamed_structural_confirmations"]:
        lines.append("| *(none)* | | | | | |")
    for placeholder, row in report["unnamed_structural_confirmations"].items():
        segs = ", ".join(row["runtime_segments_observed"])
        lines.append(
            f"| `{placeholder}` | `{row['retail_file_offset_hex']}` | {row['descriptor']} ({row['unit']}) | "
            f"`{row['relative_offset']}` | {segs} | {row['reproduced_run_count']} |"
        )
    lines += [
        "",
        "| Placeholder | Retail offset | Cluster | Reason |",
        "| --- | ---: | --- | --- |",
    ]
    if not report["unnamed_structural_unconfirmed"] and not report["unnamed_structural_rejected"]:
        lines.append("| *(none)* | | | |")
    for row in report["unnamed_structural_unconfirmed"]:
        lines.append(
            f"| `{row['placeholder']}` | `{row['retail_file_offset_hex']}` | "
            f"`{row['cluster_hash'][:16]}` | unconfirmed: {row['reason']} |"
        )
    for row in report["unnamed_structural_rejected"]:
        lines.append(
            f"| `{row['placeholder']}` | `{row['retail_file_offset_hex']}` | "
            f"`{row['cluster_hash'][:16]}` | rejected: {row['reason']} |"
        )
    lines += [
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ]
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--json", dest="json_path", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", dest="markdown_path", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    candidates_report = json.loads(args.candidates.read_text(encoding="utf-8"))
    evidence = json.loads(args.evidence.read_text(encoding="utf-8"))
    report = build_report(candidates_report, evidence)

    if args.strict:
        total = (
            report["summary"]["runtime_confirmed_symbols"]
            + report["summary"]["runtime_unconfirmed_candidates"]
            + report["summary"]["runtime_rejected_candidates"]
        )
        # A promoted cluster can carry more than one CoAB-named evidence row (e.g. two
        # semantic names at two different retail offsets), so the reconciled total is over
        # coab-evidence rows, not clusters -- recompute the same way build_report does rather
        # than trusting a cluster-count shortcut.
        expected_total = sum(
            1
            for cluster in named_promoted_clusters(candidates_report)
            for row in cluster.get("evidence", {}).get("coab", [])
            if row.get("candidate_name")
        )
        if total != expected_total:
            raise SystemExit(
                f"strict failure: confirmed+unconfirmed+rejected ({total}) != "
                f"named CoAB evidence rows ({expected_total})"
            )

        structural_total = (
            report["summary"]["unnamed_structural_confirmed"]
            + report["summary"]["unnamed_structural_unconfirmed"]
            + report["summary"]["unnamed_structural_rejected"]
        )
        expected_structural_total = sum(
            1
            for cluster in unnamed_promoted_clusters(candidates_report)
            for row in cluster.get("evidence", {}).get("coab", [])
        )
        if structural_total != expected_structural_total:
            raise SystemExit(
                f"strict failure: unnamed structural confirmed+unconfirmed+rejected "
                f"({structural_total}) != unnamed promoted CoAB evidence rows "
                f"({expected_structural_total})"
            )

    args.json_path.parent.mkdir(parents=True, exist_ok=True)
    args.json_path.write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    if args.markdown_path:
        args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_path.write_text(render_markdown(report), encoding="utf-8")

    summary = report["summary"]
    print(
        f"coab runtime symbols: {summary['runtime_confirmed_symbols']} confirmed, "
        f"{summary['runtime_unconfirmed_candidates']} unconfirmed, "
        f"{summary['runtime_rejected_candidates']} rejected "
        f"(of {summary['promoted_named_clusters']} named promoted clusters); "
        f"unnamed structural: {summary['unnamed_structural_confirmed']} confirmed, "
        f"{summary['unnamed_structural_unconfirmed']} unconfirmed, "
        f"{summary['unnamed_structural_rejected']} rejected "
        f"(of {summary['promoted_unnamed_clusters']} unnamed promoted clusters)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
