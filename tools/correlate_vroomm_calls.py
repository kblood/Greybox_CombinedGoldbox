#!/usr/bin/env python3
"""Correlate exact VROOMM LCALL targets with clustered function starts."""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass
class TargetCorrelation:
    target_source: str
    target_offset: int
    route_kind: str
    call_count: int
    caller_profiles: list[str]
    caller_sites: list[dict[str, int | str]]
    cluster_hash: str
    match_kind: str
    confidence: str
    cluster_source_count: int
    function_size: int


def best_cluster_index(patterns: dict[str, object]) -> tuple[dict[tuple[str, int], dict[str, object]], dict[str, list[dict[str, object]]]]:
    exact: dict[tuple[str, int], dict[str, object]] = {}
    ranges: dict[str, list[dict[str, object]]] = defaultdict(list)
    kind_rank = {"exact": 0, "relocation-normalized": 1, "control-flow-shape": 2}
    confidence_rank = {"high": 0, "medium": 1, "low": 2}
    for candidate in patterns.get("function_cluster_index", []):
        source = str(candidate["source"])
        offset = int(candidate["offset"])
        ranges[source].append(candidate)
        key = (source, offset)
        previous = exact.get(key)
        rank = (kind_rank.get(str(candidate["match_kind"]), 9), confidence_rank.get(str(candidate["confidence"]), 9))
        previous_rank = (99, 99) if previous is None else (
            kind_rank.get(str(previous["match_kind"]), 9),
            confidence_rank.get(str(previous["confidence"]), 9),
        )
        if rank < previous_rank:
            exact[key] = candidate
    for rows in ranges.values():
        rows.sort(key=lambda row: int(row["offset"]))
    return exact, ranges


def target_for(game: dict[str, object], entry: dict[str, object]) -> tuple[str, int] | None:
    route = str(entry.get("route_kind") or "")
    if route in {"public_stub_owned", "direct_overlay_code"}:
        return str(game["overlay_path"]), int(entry["target_ovr_file_offset"])
    return None


def build_report(layouts: dict[str, object], patterns: dict[str, object]) -> dict[str, object]:
    exact, ranges = best_cluster_index(patterns)
    status_counts: Counter[str] = Counter()
    route_status_counts: dict[str, Counter[str]] = defaultdict(Counter)
    grouped: dict[tuple[str, int, str], dict[str, object]] = {}
    total_calls = 0
    for game in layouts.get("games", []):
        for descriptor in game.get("descriptors", []):
            for entry in descriptor.get("fixup_entries", []):
                if entry.get("context") != "lcall_segment":
                    continue
                total_calls += 1
                route = str(entry.get("route_kind") or "unclassified")
                target = target_for(game, entry)
                if target is None:
                    status = "non_function_route"
                    status_counts[status] += 1
                    route_status_counts[route][status] += 1
                    continue
                source, offset = target
                cluster = exact.get((source, offset))
                if cluster is not None:
                    status = "exact_cluster_start"
                    cluster_hash = str(cluster["normalized_sha256"])
                    key = (source, offset, cluster_hash)
                    group = grouped.setdefault(
                        key,
                        {
                            "target_source": source,
                            "target_offset": offset,
                            "route_kind": route,
                            "caller_profiles": set(),
                            "caller_sites": [],
                            "cluster": cluster,
                            "call_count": 0,
                        },
                    )
                    group["call_count"] = int(group["call_count"]) + 1
                    group["caller_profiles"].add(str(game["profile_id"]))
                    if len(group["caller_sites"]) < 16:
                        group["caller_sites"].append(
                            {
                                "profile_id": str(game["profile_id"]),
                                "source_descriptor": int(descriptor["index"]),
                                "source_ovr_offset": int(descriptor["ovr_file_offset"]) + int(entry["instruction_offset"]),
                            }
                        )
                else:
                    status = "interior_cluster_hit" if any(
                        int(candidate["offset"]) < offset < int(candidate["offset"]) + int(candidate["size"])
                        for candidate in ranges.get(source, [])
                    ) else "no_cluster_start"
                status_counts[status] += 1
                route_status_counts[route][status] += 1

    correlations: list[TargetCorrelation] = []
    for group in grouped.values():
        cluster = group["cluster"]
        correlations.append(
            TargetCorrelation(
                target_source=str(group["target_source"]),
                target_offset=int(group["target_offset"]),
                route_kind=str(group["route_kind"]),
                call_count=int(group["call_count"]),
                caller_profiles=sorted(group["caller_profiles"]),
                caller_sites=list(group["caller_sites"]),
                cluster_hash=str(cluster["normalized_sha256"]),
                match_kind=str(cluster["match_kind"]),
                confidence=str(cluster["confidence"]),
                cluster_source_count=int(cluster["source_count"]),
                function_size=int(cluster["size"]),
            )
        )
    correlations.sort(key=lambda row: (-row.call_count, row.target_source, row.target_offset))
    counted = sum(status_counts.values())
    return {
        "format_version": 1,
        "layouts": str(layouts.get("format_version", "")),
        "pattern_chunk_count": int(patterns.get("chunk_count", 0)),
        "total_lcall_routes": total_calls,
        "classified_routes": counted,
        "status_counts": dict(sorted(status_counts.items())),
        "route_status_counts": {route: dict(sorted(counts.items())) for route, counts in sorted(route_status_counts.items())},
        "exact_target_count": len(correlations),
        "exact_cluster_count": len({row.cluster_hash for row in correlations}),
        "correlations": [asdict(row) for row in correlations],
    }


def markdown(report: dict[str, object]) -> str:
    status = report["status_counts"]
    lines = [
        "# VROOMM Call-Target Correlation",
        "",
        "> Generated by `python tools/correlate_vroomm_calls.py`. A correlation requires an exact",
        "> target-to-function-start match; interior range hits are counted but rejected as identity evidence.",
        "",
        "## Gate",
        "",
        f"- LCALL routes considered: `{report['total_lcall_routes']}`; classified: `{report['classified_routes']}`.",
        f"- Exact clustered function starts: `{status.get('exact_cluster_start', 0)}` calls, "
        f"`{report['exact_target_count']}` unique targets, `{report['exact_cluster_count']}` clusters.",
        f"- Rejected interior hits: `{status.get('interior_cluster_hit', 0)}`; no clustered start: `{status.get('no_cluster_start', 0)}`.",
        f"- Descriptor-header/non-function routes: `{status.get('non_function_route', 0)}`.",
        "",
        "## Route Breakdown",
        "",
        "| Route | Exact starts | Interior rejected | No cluster start | Non-function |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for route, counts in report["route_status_counts"].items():
        lines.append(
            f"| `{route}` | {counts.get('exact_cluster_start', 0)} | {counts.get('interior_cluster_hit', 0)} | "
            f"{counts.get('no_cluster_start', 0)} | {counts.get('non_function_route', 0)} |"
        )
    lines.extend(
        [
            "",
            "## Exact Target Correlations",
            "",
            "| Calls | Route | Target | Match | Confidence | Cluster sources | Cluster |",
            "| ---: | --- | --- | --- | --- | ---: | --- |",
        ]
    )
    for row in report["correlations"][:250]:
        source = str(row["target_source"]).replace("\\", "/")
        lines.append(
            f"| {row['call_count']} | `{row['route_kind']}` | `{source}:0x{int(row['target_offset']):x}` | "
            f"{row['match_kind']} | {row['confidence']} | {row['cluster_source_count']} | `{str(row['cluster_hash'])[:16]}` |"
        )
    lines.extend(
        [
            "",
            "These rows identify shared function bodies, not semantic names. Name promotion still requires a",
            "game-specific anchor or runtime behavior that reaches the target.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layouts", type=Path, default=REPO_ROOT / "build" / "vroomm-layouts.json")
    parser.add_argument("--patterns", type=Path, default=REPO_ROOT / "build" / "goldbox-patterns.json")
    parser.add_argument("--json", dest="json_path", type=Path)
    parser.add_argument("--markdown", dest="markdown_path", type=Path)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    layouts = json.loads(args.layouts.read_text(encoding="utf-8"))
    patterns = json.loads(args.patterns.read_text(encoding="utf-8"))
    report = build_report(layouts, patterns)
    payload = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(payload, encoding="utf-8")
    if args.markdown_path:
        args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_path.write_text(markdown(report), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(payload, end="")
    else:
        print(
            f"vroomm call routes: {report['classified_routes']}/{report['total_lcall_routes']}; "
            f"exact clustered targets: {report['exact_target_count']}"
        )
    if args.strict and report["classified_routes"] != report["total_lcall_routes"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
