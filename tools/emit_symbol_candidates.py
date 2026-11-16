"""Emit one unified, machine-readable symbol-candidate report from the three P1.3c
same-game behavior/trace artifacts (`coab-oracle-map.json`, `pool-behavior-clusters.json`,
`secret-behavior-clusters.json`) joined against the cross-overlay VROOMM call-target
correlation (`vroomm-call-correlations.json`).

This tool invents no new mapping technique. It consumes four already-generated JSON
artifacts and answers exactly one question, per exact/relocation-normalized VROOMM-call
target-start cluster: does CoAB's, Pool's, or Secret's *own* behavior/trace evidence -- not
shape-only cross-title structural similarity -- reach the clustered function?

- If a title's own evidence reaches a cluster, this tool promotes a semantic symbol
  candidate attributed to that title, citing the exact source JSON record.
- If a cluster has only the cross-title structural byte-clustering that put it in
  `vroomm-call-correlations.json` in the first place (i.e. no title's own dispatcher,
  oracle map, or replayed-command evidence reaches it), it stays an unpromoted
  "structural sibling nomination" -- never given a semantic name.
- A CoAB-only cluster (CoAB's own oracle reaches it, Pool/Secret do not) keeps its
  CoAB-sourced name but is flagged `coab_only: true`; the name is never assumed to
  transfer to Pool/Secret/other Gen1 titles just because the underlying function body is
  shared (a target list of other titles calling into the same cluster is retained
  separately as `call_target_titles` -- that is call-target evidence, not a title's own
  behavior/trace reaching the function, and it must not be conflated with promotion).

See `docs/engine/HANDOFF.md` section 5 ("UNLOCATED beats invention") and the three source
reports this tool joins: `docs/engine/research/coab-oracle-retail-map.md`,
`docs/engine/research/pool-behavior-clusters.md`,
`docs/engine/research/secret-behavior-clusters.md`.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CALLS = REPO_ROOT / "build/vroomm-call-correlations.json"
DEFAULT_COAB = REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_POOL = REPO_ROOT / "build/pool-behavior-clusters.json"
DEFAULT_SECRET = REPO_ROOT / "build/secret-behavior-clusters.json"
DEFAULT_JSON = REPO_ROOT / "build/goldbox-symbol-candidates.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/goldbox-symbol-candidates.md"

# Same bar `map_secret_behavior_clusters.classify_clusters` and
# `map_pool_behavior_clusters`/`correlate_vroomm_calls` already use: a bare
# `control-flow-shape` hit is a structural coincidence, never identity evidence.
EXACT_MATCH_KINDS = {"exact", "relocation-normalized"}

# CoAB's decompiled listing (`coab_new.lst`) auto-names any function it could not recover a
# real symbol for as `sub_<hex offset>`. That is an address placeholder, not a recovered
# semantic name -- CoAB's own retail bytes still legitimately "reach" the cluster (the
# offset is mapped, sized, and Borland-prologue-verified), but promoting `sub_30168` as if
# it were equivalent to `willOverload` would be a small invention this tool must not make.
SUB_PLACEHOLDER_RE = re.compile(r"^sub_[0-9A-Fa-f]+$")

TITLE_PATH_HINTS: list[tuple[str, str]] = [
    ("champions of krynn", "champions-of-krynn"),
    ("death knights of krynn", "death-knights-of-krynn"),
    ("curse of the azure bonds", "curse-of-the-azure-bonds"),
    ("pools of darkness", "pools-of-darkness"),
    ("pool of radiance", "pool-of-radiance"),
    ("secret of the silver blades", "secret-of-the-silver-blades"),
    ("treasures of the savage frontier", "treasures-of-the-savage-frontier"),
]

POOL_TITLE = "pool-of-radiance"
SECRET_TITLE = "secret-of-the-silver-blades"
COAB_TITLE = "curse-of-the-azure-bonds"


def title_for_path(path: str) -> str:
    """Best-effort human title for a retail `GAME.OVR` path, for readability only -- never
    used as identity evidence. Order matters: check the longer/more specific "pools of
    darkness" before the substring-overlapping "pool of radiance"."""
    lowered = str(path).lower()
    for needle, title in TITLE_PATH_HINTS:
        if needle in lowered:
            return title
    return "unknown-title"


def demangle_coab_symbol(symbol: str) -> str:
    """Strip Borland C++ name-mangling decoration (`@name$q<params>` -> `name`). This is
    cosmetic only -- it does not change which retail offset or cluster the symbol maps to."""
    name = symbol
    if name.startswith("@"):
        name = name[1:]
    if "$" in name:
        name = name.split("$", 1)[0]
    return name


def is_placeholder_symbol(symbol: str) -> bool:
    return bool(SUB_PLACEHOLDER_RE.match(symbol))


def group_vroomm_targets(calls: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Group `correlate_vroomm_calls.py` rows by cluster hash. A cluster hash can have more
    than one (target_source, target_offset) member row -- the same normalized function body
    appearing as an exact resolved VROOMM call target in more than one title's binary."""
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in calls.get("correlations", []):
        grouped[str(row["cluster_hash"])].append(row)
    return grouped


def cluster_attributes(rows: list[dict[str, Any]], cluster_hash: str, strict: bool) -> dict[str, Any]:
    """A cluster hash's match_kind/confidence/source_count/function_size come from the
    underlying normalized-function-body cluster, so every target row sharing that hash must
    agree. `--strict` turns disagreement into a hard failure rather than a silently
    arbitrary pick, since that would signal a real corpus data-integrity regression."""
    kinds = {row["match_kind"] for row in rows}
    confidences = {row["confidence"] for row in rows}
    source_counts = {row["cluster_source_count"] for row in rows}
    sizes = {row["function_size"] for row in rows}
    if strict and (len(kinds) > 1 or len(confidences) > 1 or len(source_counts) > 1 or len(sizes) > 1):
        raise ValueError(f"cluster {cluster_hash} has inconsistent attributes across its target rows")
    return {
        "match_kind": sorted(kinds)[0],
        "confidence": sorted(confidences)[0],
        "cluster_source_count": sorted(source_counts)[0],
        "function_size": sorted(sizes)[0],
    }


def coab_evidence(cluster_hash: str, coab_functions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """CoAB's own same-game oracle evidence: a mapped listing function whose cluster_hash
    equals this cluster's. `coab-oracle-map.json#functions` already carries the cluster
    join (`map_coab_oracle.py`'s own `best_cluster_index`), so this only filters and shapes
    it -- it does not recompute cluster membership."""
    evidence: list[dict[str, Any]] = []
    for row in coab_functions:
        if row.get("cluster_hash") != cluster_hash:
            continue
        # Check the placeholder shape against the *demangled* base name, not the raw
        # mangled symbol: a Borland class-method mangling like `@sub_66BDB$qn6Player`
        # does not itself match `sub_<hex>`, but its demangled base name ("sub_66BDB")
        # is exactly as semantically empty as the free-function case ("sub_30168").
        demangled = demangle_coab_symbol(row["symbol"])
        placeholder = is_placeholder_symbol(demangled)
        recovered_name = row.get("canonical_candidate") or (None if placeholder else demangled)
        evidence.append({
            "title": COAB_TITLE,
            "oracle_symbol": row["symbol"],
            "canonical_candidate": row.get("canonical_candidate"),
            "candidate_name": recovered_name,
            "has_semantic_name": recovered_name is not None,
            "role": row.get("role"),
            "retail_file_offset": row["retail_file_offset"],
            "unit": row["unit"],
            "unit_offset": row["unit_offset"],
            "evidence_status": row["evidence_status"],
            "source_citation": (
                f"build/coab-oracle-map.json#functions[retail_file_offset=0x{row['retail_file_offset']:x}]"
            ),
        })
    evidence.sort(key=lambda item: item["retail_file_offset"])
    return evidence


def title_behavior_evidence(
    cluster_hash: str, title: str, report: dict[str, Any], report_filename: str
) -> list[dict[str, Any]]:
    """Pool's and Secret's behavior-cluster reports share one schema
    (`functions` + `replayed_commands`, each row carrying a `clusters` list of cluster
    matches); this walks either report generically. Only `exact`/`relocation-normalized`
    cluster matches count as the title's own evidence reaching the cluster -- a bare
    `control-flow-shape` entry (e.g. Pool's and Secret's shared `SAVE` shape match) is
    excluded here exactly as `map_secret_behavior_clusters.classify_clusters` already
    excludes it from its own promotion decision."""
    evidence: list[dict[str, Any]] = []
    for row in report.get("functions", []):
        for cluster in row.get("clusters", []):
            if cluster["cluster_hash"] != cluster_hash or cluster["match_kind"] not in EXACT_MATCH_KINDS:
                continue
            evidence.append({
                "title": title,
                "kind": "subsystem_function",
                "role": row["role"],
                "candidate_name": row["role"],
                "file_offset": row["file_offset"],
                "cluster_match_kind": cluster["match_kind"],
                "cluster_confidence": cluster["confidence"],
                "cluster_source_count": cluster["source_count"],
                "source_citation": f"{report_filename}#functions[role={row['role']}]",
            })
    for row in report.get("replayed_commands", []):
        for cluster in row.get("clusters", []):
            if cluster["cluster_hash"] != cluster_hash or cluster["match_kind"] not in EXACT_MATCH_KINDS:
                continue
            evidence.append({
                "title": title,
                "kind": "replayed_command_handler",
                "opcode": row["opcode"],
                "mnemonic": row["mnemonic"],
                "candidate_name": row["mnemonic"],
                "file_offset": row.get("handler_file_offset"),
                "cluster_match_kind": cluster["match_kind"],
                "cluster_confidence": cluster["confidence"],
                "cluster_source_count": cluster["source_count"],
                "source_citation": f"{report_filename}#replayed_commands[opcode=0x{row['opcode']:02x}]",
            })
    return evidence


def classify_cluster(
    coab_ev: list[dict[str, Any]], pool_ev: list[dict[str, Any]], secret_ev: list[dict[str, Any]]
) -> tuple[str, list[str]]:
    """The one rule this whole tool exists to enforce, one level up from
    `map_pool_behavior_clusters`/`map_secret_behavior_clusters`'s per-title version of it: a
    cluster is promoted only when at least one title's *own* evidence list is non-empty.
    Cross-title structural clustering alone (the reason the cluster exists in
    `vroomm-call-correlations.json` at all) is never sufficient by itself."""
    promoted_by = [
        title
        for title, ev in ((COAB_TITLE, coab_ev), (POOL_TITLE, pool_ev), (SECRET_TITLE, secret_ev))
        if ev
    ]
    status = "promoted" if promoted_by else "unpromoted-structural-sibling-nomination"
    return status, promoted_by


def semantic_names_for(
    coab_ev: list[dict[str, Any]], pool_ev: list[dict[str, Any]], secret_ev: list[dict[str, Any]]
) -> list[str]:
    names: set[str] = set()
    for row in coab_ev:
        if row["has_semantic_name"]:
            names.add(row["candidate_name"])
    for row in (*pool_ev, *secret_ev):
        names.add(row["candidate_name"])
    return sorted(names)


def build_cluster_record(
    cluster_hash: str,
    rows: list[dict[str, Any]],
    coab: dict[str, Any],
    pool: dict[str, Any],
    secret: dict[str, Any],
    strict: bool,
) -> dict[str, Any]:
    attrs = cluster_attributes(rows, cluster_hash, strict)
    coab_ev = coab_evidence(cluster_hash, coab.get("functions", []))
    pool_ev = title_behavior_evidence(cluster_hash, POOL_TITLE, pool, "build/pool-behavior-clusters.json")
    secret_ev = title_behavior_evidence(cluster_hash, SECRET_TITLE, secret, "build/secret-behavior-clusters.json")
    status, promoted_by = classify_cluster(coab_ev, pool_ev, secret_ev)

    targets = sorted(
        (
            {
                "title": title_for_path(row["target_source"]),
                "target_source": row["target_source"],
                "target_offset": row["target_offset"],
                "route_kind": row["route_kind"],
                "call_count": row["call_count"],
                "caller_profiles": sorted(row["caller_profiles"]),
            }
            for row in rows
        ),
        key=lambda item: (item["title"], item["target_offset"]),
    )
    call_target_titles = sorted({item["title"] for item in targets})
    semantic_names = semantic_names_for(coab_ev, pool_ev, secret_ev)

    return {
        "cluster_hash": cluster_hash,
        "match_kind": attrs["match_kind"],
        "confidence": attrs["confidence"],
        "cluster_source_count": attrs["cluster_source_count"],
        "function_size": attrs["function_size"],
        "targets": targets,
        "total_call_count": sum(item["call_count"] for item in targets),
        "call_target_titles": call_target_titles,
        "evidence": {"coab": coab_ev, "pool": pool_ev, "secret": secret_ev},
        "promotion_status": status,
        "promoted_by": promoted_by,
        "coab_only": promoted_by == [COAB_TITLE],
        "multi_title_corroborated": len(promoted_by) > 1,
        "semantic_names": semantic_names,
        "has_recovered_semantic_name": bool(semantic_names),
    }


def build_summary(clusters: list[dict[str, Any]]) -> dict[str, Any]:
    promoted = [row for row in clusters if row["promotion_status"] == "promoted"]
    unpromoted = [row for row in clusters if row["promotion_status"] != "promoted"]
    return {
        "total_clusters": len(clusters),
        "promoted_clusters": len(promoted),
        "unpromoted_structural_sibling_nominations": len(unpromoted),
        "promoted_by_title_counts": {
            COAB_TITLE: sum(COAB_TITLE in row["promoted_by"] for row in clusters),
            POOL_TITLE: sum(POOL_TITLE in row["promoted_by"] for row in clusters),
            SECRET_TITLE: sum(SECRET_TITLE in row["promoted_by"] for row in clusters),
        },
        "single_title_only_counts": {
            COAB_TITLE: sum(row["promoted_by"] == [COAB_TITLE] for row in clusters),
            POOL_TITLE: sum(row["promoted_by"] == [POOL_TITLE] for row in clusters),
            SECRET_TITLE: sum(row["promoted_by"] == [SECRET_TITLE] for row in clusters),
        },
        "coab_only_clusters": sum(row["coab_only"] for row in clusters),
        "multi_title_corroborated_clusters": sum(row["multi_title_corroborated"] for row in clusters),
        "promoted_with_recovered_semantic_name": sum(
            row["promotion_status"] == "promoted" and row["has_recovered_semantic_name"] for row in clusters
        ),
        "promoted_address_placeholder_only": sum(
            row["promotion_status"] == "promoted" and not row["has_recovered_semantic_name"] for row in clusters
        ),
    }


CLAIM_BOUNDARY = (
    "A semantic symbol candidate is emitted for a cluster only when CoAB's own oracle "
    "map, Pool's own dispatch/replay join, or Secret's own dispatch/replay join reaches "
    "that specific cluster hash with an exact or relocation-normalized match -- never from "
    "cross-title control-flow-shape similarity alone, and never by assuming a name found "
    "for one title also names the same shared function body in another. A `coab_only` "
    "cluster keeps its CoAB-sourced name but is not assumed to transfer to Pool, Secret, or "
    "any other Gen1 title, even when other titles appear in that cluster's own "
    "`call_target_titles` (they call the shared function body; they do not themselves "
    "supply naming evidence for it). Every promoted candidate still requires a native "
    "CS:IP trace before being called runtime-reached, per the claim boundaries already "
    "recorded in the three source reports this tool joins."
)


def build_report(
    calls: dict[str, Any],
    coab: dict[str, Any],
    pool: dict[str, Any],
    secret: dict[str, Any],
    strict: bool,
) -> dict[str, Any]:
    grouped = group_vroomm_targets(calls)
    clusters = [
        build_cluster_record(cluster_hash, grouped[cluster_hash], coab, pool, secret, strict)
        for cluster_hash in sorted(grouped)
    ]
    summary = build_summary(clusters)
    if strict:
        secret_reach = summary["promoted_by_title_counts"][SECRET_TITLE]
        if secret_reach != 0:
            # Not a hard bug, but a real change in reported evidence shape: the whole
            # secret-behavior-clusters.md report is built around "Secret has zero
            # cross-title exact/relocation-normalized clusters." If that number ever
            # becomes non-zero, this tool's headline claim must be re-audited by hand
            # before being trusted, not silently accepted.
            raise SystemExit(
                f"strict failure: Secret now reaches {secret_reach} cluster(s); "
                "re-audit docs/engine/research/secret-behavior-clusters.md before trusting this report"
            )
        total = summary["promoted_clusters"] + summary["unpromoted_structural_sibling_nominations"]
        if total != summary["total_clusters"]:
            raise SystemExit("strict failure: promoted + unpromoted does not equal total clusters")
        if summary["coab_only_clusters"] + summary["multi_title_corroborated_clusters"] != summary["promoted_clusters"] - (
            summary["single_title_only_counts"][POOL_TITLE] + summary["single_title_only_counts"][SECRET_TITLE]
        ):
            raise SystemExit("strict failure: promoted-cluster breakdown does not reconcile")
    return {
        "schema_version": 1,
        "provenance": "p1.3c-symbol-candidate-synthesis",
        "source_artifacts": {
            "vroomm_call_correlations": "build/vroomm-call-correlations.json",
            "coab_oracle_map": "build/coab-oracle-map.json",
            "pool_behavior_clusters": "build/pool-behavior-clusters.json",
            "secret_behavior_clusters": "build/secret-behavior-clusters.json",
        },
        "clusters": clusters,
        "summary": summary,
        "claim_boundary": CLAIM_BOUNDARY,
    }


def short_hash(value: str) -> str:
    return value[:16]


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Gold Box Cross-Corpus Symbol Candidates",
        "",
        "> Generated by `python tools/emit_symbol_candidates.py`. Do not edit by hand. This is",
        "> the P1.3c capstone: it invents no new mapping technique and only joins",
        "> `coab-oracle-map.json`, `pool-behavior-clusters.json`, `secret-behavior-clusters.json`,",
        "> and `vroomm-call-correlations.json`.",
        "",
        "## Gate",
        "",
        f"- Exact/relocation-normalized VROOMM-call target-start clusters considered: `{summary['total_clusters']}`.",
        f"- Promoted (some title's own behavior/trace evidence reaches the cluster): `{summary['promoted_clusters']}`.",
        f"  - CoAB-only: `{summary['coab_only_clusters']}`.",
        f"  - Multi-title corroborated: `{summary['multi_title_corroborated_clusters']}`.",
        f"  - Pool-only (no CoAB): `{summary['single_title_only_counts'][POOL_TITLE]}`.",
        f"  - Secret-only (no CoAB/Pool): `{summary['single_title_only_counts'][SECRET_TITLE]}`.",
        f"- Unpromoted structural sibling nominations (cross-title byte clustering only, no",
        f"  title's own evidence reaches the function): `{summary['unpromoted_structural_sibling_nominations']}`.",
        f"- Promoted clusters with a recovered semantic name (not just a CoAB `sub_XXXXX`",
        f"  address placeholder): `{summary['promoted_with_recovered_semantic_name']}`.",
        f"- Promoted clusters where CoAB's oracle supplies only an unnamed address",
        f"  placeholder: `{summary['promoted_address_placeholder_only']}`.",
        f"- Reached by title: CoAB `{summary['promoted_by_title_counts'][COAB_TITLE]}`, "
        f"Pool `{summary['promoted_by_title_counts'][POOL_TITLE]}`, "
        f"Secret `{summary['promoted_by_title_counts'][SECRET_TITLE]}` -- Secret's zero matches",
        "  `secret-behavior-clusters.md`'s own headline: zero cross-title exact/relocation-normalized",
        "  clusters for its dispatcher, operand parser, or any replayed command handler.",
        "",
        "## Clusters",
        "",
        "| Cluster | Match | Confidence | Sources | Size | Status | Promoted by | Semantic name(s) |",
        "| --- | --- | --- | ---: | ---: | --- | --- | --- |",
    ]
    for row in report["clusters"]:
        names = ", ".join(f"`{name}`" for name in row["semantic_names"]) or "--"
        promoted_by = ", ".join(row["promoted_by"]) or "--"
        lines.append(
            f"| `{short_hash(row['cluster_hash'])}` | {row['match_kind']} | {row['confidence']} | "
            f"{row['cluster_source_count']} | {row['function_size']} | {row['promotion_status']} | "
            f"{promoted_by} | {names} |"
        )
    lines += [
        "",
        "## CoAB-Only Candidates (not assumed to transfer)",
        "",
        "| Cluster | CoAB symbol | Semantic name | Retail offset | Other call-target titles |",
        "| --- | --- | --- | ---: | --- |",
    ]
    for row in report["clusters"]:
        if not row["coab_only"]:
            continue
        for ev in row["evidence"]["coab"]:
            others = ", ".join(t for t in row["call_target_titles"] if t != COAB_TITLE) or "--"
            name = ev["candidate_name"] or "*(address placeholder only)*"
            lines.append(
                f"| `{short_hash(row['cluster_hash'])}` | `{ev['oracle_symbol']}` | {name} | "
                f"`0x{ev['retail_file_offset']:x}` | {others} |"
            )
    lines += [
        "",
        "## Multi-Title Corroborated Candidates",
        "",
    ]
    corroborated = [row for row in report["clusters"] if row["multi_title_corroborated"]]
    if not corroborated:
        lines.append("None in the current corpus run.")
    for row in corroborated:
        lines.append(
            f"- Cluster `{short_hash(row['cluster_hash'])}` ({row['match_kind']}, {row['confidence']}, "
            f"{row['cluster_source_count']} sources): promoted by {', '.join(row['promoted_by'])}; "
            f"semantic name(s): {', '.join(row['semantic_names']) or 'none recovered'}."
        )
        for title, evidence in row["evidence"].items():
            for ev in evidence:
                lines.append(f"  - `{title}`: `{ev['candidate_name']}` ({ev['source_citation']})")
    lines += [
        "",
        "## Unpromoted Structural Sibling Nominations",
        "",
        "These clusters are exact/relocation-normalized cross-title function-body matches",
        "with real resolved VROOMM call-target evidence (see `targets`), but no title's own",
        "dispatcher, oracle map, or replayed-command evidence reaches them. No semantic name",
        "is assigned.",
        "",
        "| Cluster | Match | Confidence | Sources | Call-target titles | Total calls |",
        "| --- | --- | --- | ---: | --- | ---: |",
    ]
    for row in report["clusters"]:
        if row["promotion_status"] == "promoted":
            continue
        lines.append(
            f"| `{short_hash(row['cluster_hash'])}` | {row['match_kind']} | {row['confidence']} | "
            f"{row['cluster_source_count']} | {', '.join(row['call_target_titles'])} | {row['total_call_count']} |"
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
    parser.add_argument("--calls", type=Path, default=DEFAULT_CALLS)
    parser.add_argument("--coab", type=Path, default=DEFAULT_COAB)
    parser.add_argument("--pool", type=Path, default=DEFAULT_POOL)
    parser.add_argument("--secret", type=Path, default=DEFAULT_SECRET)
    parser.add_argument("--json", dest="json_path", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", dest="markdown_path", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    calls = json.loads(args.calls.read_text(encoding="utf-8"))
    coab = json.loads(args.coab.read_text(encoding="utf-8"))
    pool = json.loads(args.pool.read_text(encoding="utf-8"))
    secret = json.loads(args.secret.read_text(encoding="utf-8"))
    report = build_report(calls, coab, pool, secret, args.strict)
    args.json_path.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
    args.json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    args.markdown_path.write_text(render_markdown(report), encoding="utf-8")
    summary = report["summary"]
    print(
        f"symbol candidates: {summary['total_clusters']} clusters, "
        f"{summary['promoted_clusters']} promoted "
        f"(coab-only {summary['coab_only_clusters']}, "
        f"multi-title {summary['multi_title_corroborated_clusters']}, "
        f"pool-only {summary['single_title_only_counts'][POOL_TITLE]}, "
        f"secret-only {summary['single_title_only_counts'][SECRET_TITLE]}), "
        f"{summary['unpromoted_structural_sibling_nominations']} unpromoted"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
