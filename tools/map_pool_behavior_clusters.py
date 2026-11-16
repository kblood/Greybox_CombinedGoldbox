"""Join Pool's replayed natural encounter to its own executable function evidence."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import match_goldbox_patterns


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROUTE = REPO_ROOT / "tools/goldbox_corpus_routes.json"
DEFAULT_DISPATCH = REPO_ROOT / "build/pool-ecl-dispatch-map.json"
DEFAULT_PATTERNS = REPO_ROOT / "build/goldbox-patterns.json"
DEFAULT_CALLS = REPO_ROOT / "build/vroomm-call-correlations.json"
DEFAULT_JSON = REPO_ROOT / "build/pool-behavior-clusters.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/pool-behavior-clusters.md"

REPLAYED_OPCODES = {
    0x09: "SAVE",
    0x0B: "LOAD_MONSTER",
    0x1C: "CLEAR_MONSTERS",
    0x24: "COMBAT",
    0x25: "ON_GOTO",
    0x2B: "HORIZONTAL_MENU",
}


def norm_path(value: str | Path) -> str:
    return str(Path(value)).replace("\\", "/").lower()


def local_signature(data: bytes, offset: int, starts: list[int]) -> dict[str, Any] | None:
    index = starts.index(offset)
    boundary = starts[index + 1] if index + 1 < len(starts) else len(data)
    limit = min(boundary - offset, 4096)
    candidate = match_goldbox_patterns.function_signature(data[offset:offset + limit], offset, max_size=limit)
    if candidate is None:
        return None
    return {
        "offset": candidate.offset,
        "size": candidate.size,
        "instruction_count": candidate.instruction_count,
        "calls": candidate.calls,
        "normalized_sha256": candidate.normalized_sha256,
        "shape_sha256": candidate.shape_sha256,
    }


def cluster_matches(patterns: dict[str, Any], source: str, signature: dict[str, Any]) -> list[dict[str, Any]]:
    source_key = norm_path(source)
    offset = signature["offset"]
    matches: list[dict[str, Any]] = []
    for row in patterns["function_cluster_index"]:
        if norm_path(row["source"]) == source_key and row["offset"] == offset:
            matches.append({
                "match_kind": row["match_kind"],
                "confidence": row["confidence"],
                "source_count": row["source_count"],
                "cluster_hash": row["normalized_sha256"],
            })
    for cluster in patterns["function_clusters"]:
        if cluster["match_kind"] != "control-flow-shape":
            continue
        if any(norm_path(row["source"]) == source_key and row["offset"] == offset for row in cluster["candidates"]):
            matches.append({
                "match_kind": cluster["match_kind"],
                "confidence": cluster["confidence"],
                "source_count": cluster["source_count"],
                "cluster_hash": cluster["shape_sha256"],
            })
    return matches


def inbound_calls(calls: dict[str, Any], source: str, offset: int) -> list[dict[str, Any]]:
    source_key = norm_path(source)
    return [
        {
            "call_count": row["call_count"],
            "caller_profiles": row["caller_profiles"],
            "route_kind": row["route_kind"],
            "confidence": row["confidence"],
        }
        for row in calls["correlations"]
        if norm_path(row["target_source"]) == source_key and row["target_offset"] == offset
    ]


def build_report(
    route_path: Path = DEFAULT_ROUTE,
    dispatch_path: Path = DEFAULT_DISPATCH,
    patterns_path: Path = DEFAULT_PATTERNS,
    calls_path: Path = DEFAULT_CALLS,
) -> dict[str, Any]:
    routes = json.loads(route_path.read_text(encoding="utf-8"))["routes"]
    route = next(row for row in routes if row["profile_id"] == "pool-of-radiance")
    natural = route["natural_encounter"]
    dispatch = json.loads(dispatch_path.read_text(encoding="utf-8"))
    patterns = json.loads(patterns_path.read_text(encoding="utf-8"))
    calls = json.loads(calls_path.read_text(encoding="utf-8"))
    source = dispatch["pool_path"]
    data = Path(source).read_bytes()
    starts = sorted({
        offset
        for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")
        for offset in range(len(data))
        if data.startswith(pattern, offset)
    })
    handler_offsets = {row["opcode"]: row["handler_file_offset"] for row in dispatch["pool_dispatch"]}

    functions: list[dict[str, Any]] = []
    fixed = {
        "dispatcher": dispatch["matches"]["dispatcher"]["pool"]["offset"],
        "operand_parser": dispatch["matches"]["operand_parser"]["pool"]["offset"],
    }
    for role, offset in fixed.items():
        signature = local_signature(data, offset, starts)
        if signature is None:
            raise ValueError(f"cannot carve Pool {role} at {offset:#x}")
        functions.append({
            "role": role,
            "file_offset": offset,
            "mapping_evidence": "same-subsystem-structural-map",
            "signature": signature,
            "clusters": cluster_matches(patterns, source, signature),
            "inbound_vroomm_calls": inbound_calls(calls, source, offset),
        })

    commands: list[dict[str, Any]] = []
    for opcode, mnemonic in REPLAYED_OPCODES.items():
        offset = handler_offsets.get(opcode)
        if offset is None:
            commands.append({
                "opcode": opcode,
                "mnemonic": mnemonic,
                "mapping": "dispatcher-internal",
                "dispatcher_file_offset": fixed["dispatcher"],
                "confidence": "medium",
                "claim": "Pool's replay reaches this opcode; no separate handler call exists in Pool's decoded dispatcher.",
            })
            continue
        signature = local_signature(data, offset, starts)
        if signature is None:
            raise ValueError(f"cannot carve Pool opcode {opcode:#x} handler at {offset:#x}")
        clusters = cluster_matches(patterns, source, signature)
        commands.append({
            "opcode": opcode,
            "mnemonic": mnemonic,
            "mapping": "direct-dispatch-handler",
            "handler_file_offset": offset,
            "confidence": "medium",
            "signature": signature,
            "clusters": clusters,
            "inbound_vroomm_calls": inbound_calls(calls, source, offset),
            "claim": "Semantic candidate from Pool's own dispatch table plus replayed Pool retail ECL; native CS:IP trace still pending.",
        })

    return {
        "schema_version": 1,
        "provenance": "pool-retail-bytes-plus-deterministic-greybox-replay",
        "pool_executable": source,
        "route": {
            "ecl_file": route["ecl_file"],
            "ecl_block": route["ecl_block"],
            "cell": natural["cell"],
            "monster_group": natural["monster_group"],
            "combat_vaddr": natural["combat_vaddr"],
            "resume_vaddr": natural["resume_vaddr"],
            "resume_write": natural["resume_write"],
        },
        "functions": functions,
        "replayed_commands": commands,
        "summary": {
            "exact_clustered_functions": sum(
                any(cluster["match_kind"] != "control-flow-shape" for cluster in row["clusters"])
                for row in functions
            ),
            "clustered_command_handlers": sum(bool(row.get("clusters")) for row in commands),
            "singleton_command_handlers": sum(row.get("mapping") == "direct-dispatch-handler" and not row["clusters"] for row in commands),
            "dispatcher_internal_commands": sum(row["mapping"] == "dispatcher-internal" for row in commands),
        },
        "claim_boundary": (
            "Pool-local dispatch and replay justify semantic candidates, not recovered source names. "
            "Only exact/normalized clusters may transfer identity; shape-only matches remain nominations. "
            "A native DOS CS:IP trace is required before calling the command handlers runtime-reached."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    route = report["route"]
    lines = [
        "# Pool Behavior-to-Executable Correlation",
        "",
        "> Generated by `tools/map_pool_behavior_clusters.py`. Do not edit by hand.",
        "",
        f"- Replayed route: `{route['ecl_file']}#{route['ecl_block']}` cell `({route['cell']['x']},{route['cell']['y']})` -> monster `{route['monster_group']}` -> `COMBAT 0x{route['combat_vaddr']:04x}` -> resume `0x{route['resume_vaddr']:04x}`.",
        f"- Exact clustered subsystem functions: `{report['summary']['exact_clustered_functions']}`.",
        f"- Clustered command handlers: `{report['summary']['clustered_command_handlers']}`; local singleton handlers: `{report['summary']['singleton_command_handlers']}`; dispatcher-internal commands: `{report['summary']['dispatcher_internal_commands']}`.",
        "",
        "## Subsystem Functions",
        "",
        "| Role | Pool file offset | Local size | Cluster evidence | Inbound VROOMM calls |",
        "| --- | ---: | ---: | --- | ---: |",
    ]
    for row in report["functions"]:
        clusters = ", ".join(f"{x['match_kind']}:{x['confidence']}:{x['source_count']} titles" for x in row["clusters"]) or "none"
        inbound = sum(x["call_count"] for x in row["inbound_vroomm_calls"])
        lines.append(f"| `{row['role']}` | `0x{row['file_offset']:x}` | {row['signature']['size']} | {clusters} | {inbound} |")
    lines += [
        "",
        "## Replayed Commands",
        "",
        "| Opcode | Candidate role | Pool executable mapping | Cluster status |",
        "| ---: | --- | --- | --- |",
    ]
    for row in report["replayed_commands"]:
        mapping = f"handler `0x{row['handler_file_offset']:x}`" if "handler_file_offset" in row else f"inside dispatcher `0x{row['dispatcher_file_offset']:x}`"
        clusters = ", ".join(f"{x['match_kind']}:{x['confidence']}" for x in row.get("clusters", [])) or "local only"
        lines.append(f"| `0x{row['opcode']:02x}` | `{row['mnemonic']}` | {mapping} | {clusters} |")
    lines += [
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
        "The operand parser at `0x74d3` is the strongest executable join: it is an exact high-confidence",
        "relocation-normalized cluster across five titles and has 42 resolved Pool VROOMM inbound calls.",
        "The dispatcher exceeds the general carver's historical 512-byte window; this report carves it",
        "to its next prologue boundary. Most replayed command handlers are intentionally retained as",
        "Pool-local singleton candidates until native traces or stronger same-title xrefs exist.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--route", type=Path, default=DEFAULT_ROUTE)
    parser.add_argument("--dispatch", type=Path, default=DEFAULT_DISPATCH)
    parser.add_argument("--patterns", type=Path, default=DEFAULT_PATTERNS)
    parser.add_argument("--calls", type=Path, default=DEFAULT_CALLS)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.route, args.dispatch, args.patterns, args.calls)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    if args.strict:
        parser_row = next(row for row in report["functions"] if row["role"] == "operand_parser")
        required = {0x09, 0x0B, 0x1C, 0x24, 0x25, 0x2B}
        actual = {row["opcode"] for row in report["replayed_commands"]}
        if not parser_row["clusters"] or not parser_row["inbound_vroomm_calls"] or actual != required:
            raise SystemExit("strict failure: incomplete Pool behavior-to-executable join")
    print(
        f"pool behavior map: {len(report['replayed_commands'])} commands, "
        f"{report['summary']['clustered_command_handlers']} clustered handlers, "
        f"{report['summary']['singleton_command_handlers']} singleton handlers"
    )


if __name__ == "__main__":
    main()
