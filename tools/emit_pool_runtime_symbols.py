"""Emit the stable, runtime-confirmed Pool of Radiance symbol import map.

Sibling to `tools/emit_coab_runtime_symbols.py`, applied to Pool's own promoted-candidate
slice of `build/goldbox-symbol-candidates.json` instead of CoAB's. A new file rather than a
generalization of the CoAB tool because the two titles' evidence-row schemas do not line up
cleanly: a cluster's `evidence.coab` row carries `retail_file_offset`/`unit`/`unit_offset`
(CoAB oracle-map fields), while its `evidence.pool` row carries `file_offset`/`role`/`kind`
(Pool behavior-cluster fields) -- same *concept* (a named function's retail file offset), two
different key names, so a single generalized join would need its own per-title field-name
table anyway. Following `docs/engine/research/coab-symbol-runtime-bytematch-round2.md`'s own
note: "a future title gaining named candidates would need its own runtime-evidence file and an
analogous join, not a change to this leaf's underlying mechanism" -- this is that analogous
join, not a change to `emit_coab_runtime_symbols.py`.

As of this tool's introduction, exactly one promoted cluster in `goldbox-symbol-candidates.json`
carries a non-empty `evidence.pool` row: the CoAB+Pool corroborated `operand_parser` /
`parse_command_sub` cluster (`promoted_by: [curse-of-the-azure-bonds, pool-of-radiance]`), whose
Pool-side row names it `operand_parser` at Pool's own `GAME.OVR` file offset `29907` (`0x74D3`).
No other promoted cluster has any `evidence.pool` row at all (checked directly against the
corpus at the time this tool was written -- see `docs/engine/research/pool-symbol-runtime-bytematch.md`).
The classification machinery below still handles the general N-candidate case, so it does not
need rewriting the day a second named Pool candidate is promoted.

Three-way classification per named, promoted, Pool-evidence-bearing candidate (matched by exact
`file_offset`, never by name alone -- exactly as the CoAB tool joins by `retail_file_offset`
rather than by name):

- **confirmed** -- the offset appears in the evidence file's `confirmed_roles` with
  `all_runs_exact_match: true`. Only these get a `symbols` map entry.
- **rejected** -- the offset appears in the evidence file's `rejected_roles` (a runtime trace
  was attempted and produced a genuine byte mismatch). Retained with its reason.
- **unconfirmed** -- every other promoted, Pool-evidence-bearing candidate: no runtime trace
  attempt recorded yet. Retained as a list, never discarded (see `docs/engine/HANDOFF.md`
  section 5, "UNLOCATED beats invention").

Promoted clusters with no `evidence.pool` row at all (the CoAB-only 45 of the 46 promoted
clusters) are entirely out of scope for this tool -- there is no Pool-side claim to confirm or
reject for them.

Two evidence sources feed the `confirmed_roles` side of that join:

1. `docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json` -- **committed**,
   so it survives a fresh checkout. This is the 2026-07-22 live CS:IP hit (23 debugger stops at
   route-time `30CF:0000`, byte-identical resident bodies, reproduced across two independent
   launches). Wired here for the same reason `tools/map_secret_runtime_symbols.py` wires its own
   `DEFAULT_EXECUTION_TRACE`: before this, the *only* input was the git-ignored `build/` artifact
   below, so a fresh checkout regenerated an all-unconfirmed report and the committed
   `docs/engine/research/pool-runtime-symbols.generated.md` silently went stale against it --
   the same "the artifact that checks a claim goes stale" pattern this project has already been
   bitten by once (see `docs/engine/adr/0010`).
2. `build/pool-runtime-validated-symbols.json` -- the git-ignored raw byte-match artifact from a
   local trace run. It contributes rows for offsets the committed trace does not cover, and its
   `rejected_roles` always apply. Where both cover the same offset, the **committed** row wins,
   so the generated report is a pure function of what is in git.

A missing file on either side is "no evidence yet", never an error.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANDIDATES = REPO_ROOT / "build/goldbox-symbol-candidates.json"
DEFAULT_EVIDENCE = REPO_ROOT / "build/pool-runtime-validated-symbols.json"
DEFAULT_EXECUTION_TRACE = (
    REPO_ROOT / "docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json"
)
DEFAULT_JSON = REPO_ROOT / "build/pool-runtime-symbols.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/pool-runtime-symbols.generated.md"

POOL_TITLE = "pool-of-radiance"
EXECUTION_TRACE_CITATION = "docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json"
BUILD_ARTIFACT_CITATION = "build/pool-runtime-validated-symbols.json"


def _normalize_hex(value: object) -> str:
    return "".join(str(value or "").split()).lower()


def execution_trace_confirmed_roles(trace: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Adapt the committed Pool CS:IP trace JSON into `confirmed_roles`-shaped rows.

    The trace's own schema is not the evidence file's schema (it is a per-candidate record of a
    single live route, not a role table), so this is a deliberate adapter rather than a shared
    format. It trusts the trace's `cs_ip_hit_confirmed`/`byte_match_confirmed` verdicts for
    *what was attempted* -- exactly as `map_secret_runtime_symbols.execution_confirmation` does --
    but re-derives `all_runs_exact_match` from the recorded hits themselves: every hit must sit
    at the claimed route-time pointer and carry the same resident body as the trace's own
    independently re-derived retail bytes. A trace that fails that check still produces a row,
    with `all_runs_exact_match: False`, which the classifier below downgrades to *unconfirmed*
    rather than silently dropping (an attempted-but-inexact trace is not the same thing as no
    trace at all).
    """
    if not trace:
        return []
    parser = trace.get("operand_parser")
    if not isinstance(parser, dict):
        return []
    name = parser.get("candidate_name")
    raw_offset = str(parser.get("static_file_offset") or "")
    if not name or ":" not in raw_offset:
        return []
    unit, _, offset_text = raw_offset.partition(":")
    try:
        offset = int(offset_text, 16) if offset_text.lower().startswith("0x") else int(offset_text)
    except ValueError:
        return []
    if not parser.get("cs_ip_hit_confirmed") or not parser.get("byte_match_confirmed"):
        return []

    hits = parser.get("hits") or []
    pointer = parser.get("route_time_pointer")
    body = _normalize_hex(trace.get("independent_verification", {}).get("resident_body_hex"))
    if not hits or not pointer or not body:
        return []

    exact = all(
        _normalize_hex(hit.get("resident_bytes_hex")) == body and hit.get("pointer") == pointer
        for hit in hits
    )
    segments = sorted({str(hit.get("pointer", "")).split(":")[0] for hit in hits} - {""})
    reproduced = 2 if trace.get("independent_verification", {}).get(
        "reproduced_across_two_independent_launches"
    ) else 1

    return [{
        "candidate_name": name,
        "retail_file_offset": offset,
        "descriptor": f"live CS:IP entry at {pointer}",
        "unit": unit,
        "relative_offset": f"0x{offset:04X}",
        "byte_count": len(body) // 2,
        "runtime_segments_observed": segments,
        "reproduced_run_count": reproduced,
        "all_runs_exact_match": exact,
        "evidence_source": EXECUTION_TRACE_CITATION,
        "execution_confirmed": True,
        "hit_count": len(hits),
    }]


def merge_evidence(
    evidence: dict[str, Any], execution_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    """Committed execution-trace rows win; the git-ignored build artifact fills the rest.

    Keeping the committed rows authoritative is what makes the generated report a pure function
    of the repository contents: regenerating on a machine that happens to have a local `build/`
    trace run must not produce a different committed document than a fresh checkout does.
    """
    covered = {int(row["retail_file_offset"]) for row in execution_rows}
    build_rows = [
        row
        for row in evidence.get("confirmed_roles", [])
        if int(row["retail_file_offset"]) not in covered
    ]
    return {
        "confirmed_roles": execution_rows + build_rows,
        "rejected_roles": evidence.get("rejected_roles", []),
    }


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


def pool_evidence_bearing_clusters(candidates_report: dict[str, Any]) -> list[dict[str, Any]]:
    """Promoted clusters carrying at least one non-empty `evidence.pool` row. Unlike the CoAB
    tool (which walks every named cluster, since every promoted cluster has a `coab` row), most
    promoted clusters have an empty `pool` list -- only these are actual Pool-side claims."""
    return [
        cluster
        for cluster in candidates_report.get("clusters", [])
        if cluster.get("promotion_status") == "promoted" and cluster.get("evidence", {}).get("pool")
    ]


def classify_candidates(
    candidates_report: dict[str, Any], evidence: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """The one join this tool exists to make. Returns `(symbols, unconfirmed, rejected)`.

    Walks every promoted cluster's *Pool* evidence rows one at a time, joined by `file_offset`
    (the field name Pool's own evidence rows use for what the CoAB rows call
    `retail_file_offset` -- both are Pool's/CoAB's own `GAME.OVR` byte offset, never a
    cross-title offset).
    """
    confirmed_by_offset = index_by_offset(evidence.get("confirmed_roles", []))
    rejected_by_offset = index_by_offset(evidence.get("rejected_roles", []))

    symbols: dict[str, Any] = {}
    unconfirmed: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for cluster in pool_evidence_bearing_clusters(candidates_report):
        for pool_row in cluster.get("evidence", {}).get("pool", []):
            name = pool_row.get("candidate_name") or pool_row.get("role")
            if not name:
                continue
            offset = int(pool_row["file_offset"])

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
                    # unconfirmed rather than inventing a pass, exactly as the CoAB tool does.
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
                    "source_citation": pool_row.get("source_citation"),
                    "evidence_source": evidence_row.get("evidence_source", BUILD_ARTIFACT_CITATION),
                    "execution_confirmed": bool(evidence_row.get("execution_confirmed", False)),
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


CLAIM_BOUNDARY = (
    "A `symbols` entry means a native Pool runtime trace reached that exact Pool `GAME.OVR` file "
    "offset at a resolved runtime segment and found the resident bytes byte-identical to retail "
    "GAME.OVR, reproduced across at least two independent launches. The `Live CS:IP` column says "
    "which of two strengths that is. `no` = the weaker, post-load-only claim (BPINT 21 42 "
    "seek-capture + post-read breakpoint + `D segment:offset` dump, see "
    "docs/engine/research/pool-symbol-runtime-bytematch.md, the exact technique already "
    "documented for CoAB): the loaded bytes are correct, but CS:IP was never observed executing "
    "inside the function -- the same limitation already recorded for CoAB's and Gateway's docs. "
    "`yes` = the debugger genuinely stopped with CS:IP inside the function while the game ran a "
    "real route, and the resident body at each stop was byte-identical to retail (see "
    "docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json). Neither strength "
    "claims the surrounding *route* is understood; the 2026-07-22 trace's own claim boundary "
    "records what that run did and did not reach. `unconfirmed` candidates are statically "
    "promoted with a real Pool-side evidence row but have no runtime trace attempt yet, or had "
    "one that was not exact across all recorded hits. `rejected` candidates had a runtime trace "
    "attempt that produced a genuine byte mismatch; this is retained as negative evidence, never "
    "silently dropped."
)


def build_report(
    candidates_report: dict[str, Any],
    evidence: dict[str, Any],
    execution_trace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    execution_rows = execution_trace_confirmed_roles(execution_trace)
    evidence = merge_evidence(evidence, execution_rows)
    symbols, unconfirmed, rejected = classify_candidates(candidates_report, evidence)
    pool_clusters = pool_evidence_bearing_clusters(candidates_report)
    all_promoted = [c for c in candidates_report.get("clusters", []) if c.get("promotion_status") == "promoted"]

    return {
        "schema_version": 1,
        "provenance": "p1.3c-pool-runtime-symbol-map",
        "profile_id": POOL_TITLE,
        "source_artifacts": {
            "symbol_candidates": "build/goldbox-symbol-candidates.json",
            "runtime_evidence": BUILD_ARTIFACT_CITATION,
            "execution_trace": EXECUTION_TRACE_CITATION,
        },
        "symbols": dict(sorted(symbols.items())),
        "unconfirmed_candidates": sorted(
            unconfirmed, key=lambda row: (row["retail_file_offset"], row["candidate_name"])
        ),
        "rejected_candidates": sorted(
            rejected, key=lambda row: (row["retail_file_offset"], row["candidate_name"])
        ),
        "summary": {
            "promoted_clusters_total": len(all_promoted),
            "promoted_pool_evidence_bearing_clusters": len(pool_clusters),
            "runtime_confirmed_symbols": len(symbols),
            "runtime_unconfirmed_candidates": len(unconfirmed),
            "runtime_rejected_candidates": len(rejected),
            "execution_confirmed_symbols": sum(
                1 for row in symbols.values() if row.get("execution_confirmed")
            ),
        },
        "claim_boundary": CLAIM_BOUNDARY,
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Pool of Radiance Runtime-Confirmed Symbol Import Map",
        "",
        "> Generated by `python tools/emit_pool_runtime_symbols.py`. Do not edit by hand. Joins",
        "> `build/goldbox-symbol-candidates.json` (static structural promotion, `evidence.pool`",
        "> rows only) against the committed live-CS:IP trace",
        f"> `{EXECUTION_TRACE_CITATION}`, plus any additional offsets covered by the git-ignored",
        f"> `{BUILD_ARTIFACT_CITATION}` byte-match artifact.",
        "",
        "## Gate",
        "",
        f"- Promoted clusters considered: `{summary['promoted_clusters_total']}` total, of which "
        f"`{summary['promoted_pool_evidence_bearing_clusters']}` carry a real `evidence.pool` row "
        "(the rest are CoAB-only and out of scope here).",
        f"- Runtime-confirmed symbols: `{summary['runtime_confirmed_symbols']}`, of which "
        f"`{summary['execution_confirmed_symbols']}` are backed by a live CS:IP hit (committed "
        "trace) rather than a post-load byte dump alone.",
        f"- Still runtime-unconfirmed candidates: `{summary['runtime_unconfirmed_candidates']}`.",
        f"- Runtime-rejected candidates (genuine byte mismatch): `{summary['runtime_rejected_candidates']}`.",
        "",
        "## Confirmed Symbols",
        "",
        "| Name | Retail offset | Descriptor (unit) | Relative offset | Runtime segment(s) | Reproductions | Live CS:IP |",
        "| --- | ---: | --- | ---: | --- | ---: | --- |",
    ]
    if not report["symbols"]:
        lines.append("| *(none)* | | | | | | |")
    for name, row in report["symbols"].items():
        segs = ", ".join(row["runtime_segments_observed"])
        cs_ip = "yes" if row.get("execution_confirmed") else "no"
        lines.append(
            f"| `{name}` | `{row['retail_file_offset_hex']}` | {row['descriptor']} ({row['unit']}) | "
            f"`{row['relative_offset']}` | {segs} | {row['reproduced_run_count']} | {cs_ip} |"
        )
    lines += [
        "",
        "## Still Unconfirmed (promoted, Pool-evidence-bearing, no runtime evidence yet)",
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
    parser.add_argument(
        "--execution-trace",
        type=Path,
        default=DEFAULT_EXECUTION_TRACE,
        help=(
            "Committed live-CS:IP trace JSON (any file with an equivalent "
            "operand_parser.{candidate_name,static_file_offset,route_time_pointer,"
            "cs_ip_hit_confirmed,byte_match_confirmed,hits} shape). Its rows take precedence "
            "over --evidence at the same retail offset, so the generated report does not depend "
            "on whether a local build/ trace run happens to exist. A missing file (default or "
            "explicit) is treated as no evidence yet, not an error."
        ),
    )
    parser.add_argument("--json", dest="json_path", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", dest="markdown_path", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    candidates_report = json.loads(args.candidates.read_text(encoding="utf-8"))
    if args.evidence.exists():
        evidence = json.loads(args.evidence.read_text(encoding="utf-8"))
    else:
        # The raw evidence file is a git-ignored build/ artifact (like coab-runtime-validated-
        # symbols.json). A fresh checkout without a local trace run yet must still regenerate --
        # from the committed --execution-trace alone, which is exactly the point of wiring it.
        evidence = {"confirmed_roles": [], "rejected_roles": []}
    execution_trace = (
        json.loads(args.execution_trace.read_text(encoding="utf-8"))
        if args.execution_trace and args.execution_trace.exists()
        else None
    )
    report = build_report(candidates_report, evidence, execution_trace=execution_trace)

    if args.strict:
        total = (
            report["summary"]["runtime_confirmed_symbols"]
            + report["summary"]["runtime_unconfirmed_candidates"]
            + report["summary"]["runtime_rejected_candidates"]
        )
        expected_total = sum(
            1
            for cluster in pool_evidence_bearing_clusters(candidates_report)
            for row in cluster.get("evidence", {}).get("pool", [])
            if row.get("candidate_name") or row.get("role")
        )
        if total != expected_total:
            raise SystemExit(
                f"strict failure: confirmed+unconfirmed+rejected ({total}) != "
                f"pool evidence rows ({expected_total})"
            )

    args.json_path.parent.mkdir(parents=True, exist_ok=True)
    args.json_path.write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    if args.markdown_path:
        args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_path.write_text(render_markdown(report), encoding="utf-8")

    summary = report["summary"]
    print(
        f"pool runtime symbols: {summary['runtime_confirmed_symbols']} confirmed, "
        f"{summary['runtime_unconfirmed_candidates']} unconfirmed, "
        f"{summary['runtime_rejected_candidates']} rejected "
        f"(of {summary['promoted_pool_evidence_bearing_clusters']} pool-evidence-bearing promoted clusters)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
