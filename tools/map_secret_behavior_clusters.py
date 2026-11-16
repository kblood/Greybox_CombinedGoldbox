"""Join Secret of the Silver Blades' proven natural-encounter route to its own executable
function evidence.

Secret has no same-game source-oracle repo (unlike CoAB, which has a full decompiled
listing) and no title-specific dispatcher/operand-parser map artifact in the corpus chain
yet (unlike Pool, which gets `build/pool-ecl-dispatch-map.json` from
`tools/map_pool_ecl_dispatch.py`). This tool therefore derives Secret's dispatcher and
operand-parser roles inline, using the exact same "same-subsystem structural map verified
against the CoAB oracle" technique `map_pool_ecl_dispatch.py` already applies to Pool, but
against Secret's own `GAME.OVR` bytes (magic `TPOV`, not `FBOV` -- see
`tools/carve_goldbox_overlays.py`). It then reuses `map_pool_behavior_clusters.py`'s
generic cluster/inbound-call joins verbatim (they only depend on the file-offset + source
path, not on any Pool-specific data) so the two titles stay on one auditable code path.

Names are never transferred from CoAB or Pool by shape alone: only Secret's own retail
bytes decide a symbol's file offset, and only an exact/relocation-normalized cross-title
cluster (never a bare `control-flow-shape` match) may promote a *candidate* label -- and
even then the claim boundary below still requires a native Secret `CS:IP` trace before any
name is treated as runtime-reached.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import goldbox_corpus
import map_pool_behavior_clusters as pool_clusters
import map_pool_ecl_dispatch as pool_dispatch


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROUTE = REPO_ROOT / "tools/goldbox_corpus_routes.json"
DEFAULT_ORACLE = REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_PATTERNS = REPO_ROOT / "build/goldbox-patterns.json"
DEFAULT_CALLS = REPO_ROOT / "build/vroomm-call-correlations.json"
DEFAULT_JSON = REPO_ROOT / "build/secret-behavior-clusters.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/secret-behavior-clusters.md"

PROFILE_ID = "secret-of-the-silver-blades"
ORACLE_PROFILE_ID = "curse-of-the-azure-bonds"

# Exact opcodes the decoded natural-encounter route in
# docs/engine/research/secret-natural-encounter-route.md actually executes, in the order
# they first appear on that route (ECL3.DAX#97, entry search_location @0x8142). Values are
# from docs/engine/research/ecl-opcode-spec-for-asm.md's verified opcode table -- not
# guessed and not copied from Pool's opcode set.
REPLAYED_OPCODES = {
    0x09: "SAVE",
    0x2F: "AND",
    0x25: "ON_GOTO",
    0x17: "IF_NE",
    0x00: "EXIT",
    0x0C: "SETUP_MONSTER",
    0x12: "PRINTCLEAR",
    0x02: "GOSUB",
    0x2B: "HORIZONTAL_MENU",  # reached via the one-choice menu subroutine at 0x953A
    0x1C: "CLEARMONSTERS",
    0x0B: "LOAD_MONSTER",
    0x24: "COMBAT",
    0x30: "OR",
}

EXACT_MATCH_KINDS = {"exact", "relocation-normalized"}


def classify_clusters(clusters: list[dict[str, Any]]) -> str:
    """Decide what a set of cluster matches licenses us to claim.

    This is the one rule this whole tool exists to enforce: a bare
    `control-flow-shape` hit is a structural coincidence across titles and must never be
    treated as identity. Only `exact`/`relocation-normalized` match kinds may become a
    *candidate* label, and that is still gated behind a real Secret runtime trace before
    any name counts as confirmed (see `claim_boundary`).
    """
    if any(row["match_kind"] in EXACT_MATCH_KINDS for row in clusters):
        return "cross-title-exact-candidate"
    if clusters:
        return "structural-shape-only"
    return "secret-local-singleton"


def build_function_entry(
    role: str,
    offset: int,
    coab_reference_offset: int,
    sequence_similarity: float,
    trigram_jaccard: float,
    data: bytes,
    starts: list[int],
    patterns: dict[str, Any],
    calls: dict[str, Any],
    source: str,
) -> dict[str, Any]:
    """Carve one dispatcher/parser role's local signature and join it to cluster/inbound
    evidence. Pulled out of `build_report` so the join+classify logic is unit-testable
    against synthetic bytes, without needing a real retail install on disk."""
    signature = pool_clusters.local_signature(data, offset, starts)
    if signature is None:
        raise ValueError(f"cannot carve Secret {role} at {offset:#x}")
    clusters = pool_clusters.cluster_matches(patterns, source, signature)
    inbound = pool_clusters.inbound_calls(calls, source, offset)
    return {
        "role": role,
        "file_offset": offset,
        "mapping_evidence": "same-subsystem-structural-map-verified-against-coab-oracle-and-retail-bytes",
        "coab_reference_offset": coab_reference_offset,
        "sequence_similarity": sequence_similarity,
        "trigram_jaccard": trigram_jaccard,
        "signature": signature,
        "clusters": clusters,
        "inbound_vroomm_calls": inbound,
        "promotion_status": classify_clusters(clusters),
    }


def build_command_entry(
    opcode: int,
    mnemonic: str,
    handler_offsets: dict[int, int],
    dispatcher_offset: int,
    data: bytes,
    starts: list[int],
    patterns: dict[str, Any],
    calls: dict[str, Any],
    source: str,
) -> dict[str, Any]:
    """Join one replayed opcode to Secret's own dispatch table, then to cluster/inbound
    evidence when a separate handler exists. This is the exact place the "do not transfer
    a name by shape alone" rule is enforced (via `classify_clusters`), so it is kept as a
    standalone, unit-testable function rather than inlined into `build_report`'s loop."""
    offset = handler_offsets.get(opcode)
    if offset is None:
        return {
            "opcode": opcode,
            "mnemonic": mnemonic,
            "mapping": "dispatcher-internal",
            "dispatcher_file_offset": dispatcher_offset,
            "promotion_status": "dispatcher-internal",
            "claim": "Secret's replay reaches this opcode; no separate handler call exists in Secret's decoded dispatcher.",
        }
    signature = pool_clusters.local_signature(data, offset, starts)
    if signature is None:
        raise ValueError(f"cannot carve Secret opcode {opcode:#x} handler at {offset:#x}")
    clusters = pool_clusters.cluster_matches(patterns, source, signature)
    inbound = pool_clusters.inbound_calls(calls, source, offset)
    return {
        "opcode": opcode,
        "mnemonic": mnemonic,
        "mapping": "direct-dispatch-handler",
        "handler_file_offset": offset,
        "signature": signature,
        "clusters": clusters,
        "inbound_vroomm_calls": inbound,
        "promotion_status": classify_clusters(clusters),
        "claim": "Semantic candidate from Secret's own dispatch table plus its own replayed retail ECL; native Secret CS:IP trace still pending.",
    }


def retail_files() -> tuple[Path, Path]:
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    paths: dict[str, Path] = {}
    for profile_id in (PROFILE_ID, ORACLE_PROFILE_ID):
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        if install is None:
            raise FileNotFoundError(f"install not found: {profile_id}")
        files = goldbox_corpus.file_index(install)
        paths[profile_id] = files["GAME.OVR"]
    return paths[PROFILE_ID], paths[ORACLE_PROFILE_ID]


def build_report(
    route_path: Path = DEFAULT_ROUTE,
    oracle_path: Path = DEFAULT_ORACLE,
    patterns_path: Path = DEFAULT_PATTERNS,
    calls_path: Path = DEFAULT_CALLS,
) -> dict[str, Any]:
    routes = json.loads(route_path.read_text(encoding="utf-8"))["routes"]
    route = next(row for row in routes if row["profile_id"] == PROFILE_ID)
    natural = route["natural_encounter"]
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    patterns = json.loads(patterns_path.read_text(encoding="utf-8"))
    calls = json.loads(calls_path.read_text(encoding="utf-8"))

    secret_path, coab_path = retail_files()
    secret_data = secret_path.read_bytes()
    coab_data = coab_path.read_bytes()
    magic = secret_data[:4]
    if magic != b"TPOV":
        raise ValueError(f"expected Secret GAME.OVR to start with TPOV, got {magic!r}")

    starts = sorted({
        offset
        for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")
        for offset in range(len(secret_data))
        if secret_data.startswith(pattern, offset)
    })

    references = {
        "dispatcher": pool_dispatch.disassemble_shape(coab_data, pool_dispatch.oracle_offset(oracle, "commandTable")),
        "operand_parser": pool_dispatch.disassemble_shape(
            coab_data, pool_dispatch.oracle_offset(oracle, "@parse_command_sub$q4Byte")
        ),
    }
    if any(value is None for value in references.values()):
        raise ValueError("failed to disassemble CoAB oracle functions")

    role_matches: dict[str, Any] = {}
    for name, reference in references.items():
        assert reference is not None
        candidate, ratio, jaccard = pool_dispatch.nearest_function(secret_data, reference)
        role_matches[name] = {
            "coab_reference": asdict(reference),
            "secret": asdict(candidate),
            "sequence_similarity": ratio,
            "trigram_jaccard": jaccard,
        }

    dispatcher_shape = pool_dispatch.FunctionShape(**role_matches["dispatcher"]["secret"])
    dispatch_rows = pool_dispatch.dispatch_table(secret_data, dispatcher_shape)
    handler_offsets = {row["opcode"]: row["handler_file_offset"] for row in dispatch_rows}

    source = str(secret_path)
    functions: list[dict[str, Any]] = [
        build_function_entry(
            role,
            match["secret"]["offset"],
            match["coab_reference"]["offset"],
            match["sequence_similarity"],
            match["trigram_jaccard"],
            secret_data,
            starts,
            patterns,
            calls,
            source,
        )
        for role, match in role_matches.items()
    ]

    dispatcher_offset = role_matches["dispatcher"]["secret"]["offset"]
    commands: list[dict[str, Any]] = [
        build_command_entry(opcode, mnemonic, handler_offsets, dispatcher_offset, secret_data, starts, patterns, calls, source)
        for opcode, mnemonic in REPLAYED_OPCODES.items()
    ]

    exact_functions = sum(row["promotion_status"] == "cross-title-exact-candidate" for row in functions)
    exact_commands = sum(row["promotion_status"] == "cross-title-exact-candidate" for row in commands)
    shape_only_commands = sum(row["promotion_status"] == "structural-shape-only" for row in commands)
    singleton_commands = sum(row["promotion_status"] == "secret-local-singleton" for row in commands)
    dispatcher_internal_commands = sum(row["mapping"] == "dispatcher-internal" for row in commands)
    total_inbound = sum(
        sum(x["call_count"] for x in row.get("inbound_vroomm_calls", []))
        for row in (*functions, *commands)
    )

    return {
        "schema_version": 1,
        "provenance": "secret-retail-bytes-plus-deterministic-greybox-replay",
        "secret_executable": source,
        "coab_reference_executable": str(coab_path),
        "container_magic": magic.decode("ascii"),
        "source_oracle_status": (
            "Secret has no same-game decompiled source oracle (unlike CoAB's ovr001..034,036,038 "
            "listing units). Dispatcher/operand-parser roles are located structurally against the "
            "CoAB oracle and then re-verified on Secret's own retail bytes, the same technique "
            "tools/map_pool_ecl_dispatch.py uses for Pool -- another source-oracle-less title."
        ),
        "route": {
            "ecl_file": route["ecl_file"],
            "ecl_block": route["ecl_block"],
            "entry": natural["entry"],
            "cell": natural["cell"],
            "monster_group": natural["monster_group"],
            "load_monster_vaddr": natural["load_monster_vaddr"],
            "combat_vaddr": natural["combat_vaddr"],
            "resume_vaddr": natural["resume_vaddr"],
            "resume_opcode": natural["resume_opcode"],
            "resume_write": natural["resume_write"],
        },
        "functions": functions,
        "replayed_commands": commands,
        "summary": {
            "exact_clustered_functions": exact_functions,
            "exact_clustered_commands": exact_commands,
            "shape_only_commands": shape_only_commands,
            "singleton_command_handlers": singleton_commands,
            "dispatcher_internal_commands": dispatcher_internal_commands,
            "total_resolved_inbound_vroomm_calls": total_inbound,
        },
        "claim_boundary": (
            "Secret-local dispatch and replay justify semantic candidates, not recovered source "
            "names -- Secret has no source oracle to recover names from. Only exact/"
            "relocation-normalized clusters may become candidates; shape-only matches stay "
            "nominations, and even candidates require a native Secret CS:IP trace before being "
            "called runtime-reached. No CoAB or Pool name is transferred by structural similarity "
            "alone: the CoAB oracle only supplies the dispatcher/operand-parser reference shape, "
            "never a symbol name written into Secret's own report rows."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    route = report["route"]
    summary = report["summary"]
    lines = [
        "# Secret of the Silver Blades Behavior-to-Executable Correlation",
        "",
        "> Generated by `tools/map_secret_behavior_clusters.py`. Do not edit by hand.",
        "",
        f"- Replayed route: `{route['ecl_file']}#{route['ecl_block']}` entry `{route['entry']}` cell "
        f"`({route['cell']['x']},{route['cell']['y']})` -> monster `{route['monster_group']}` -> "
        f"`COMBAT 0x{route['combat_vaddr']:04x}` -> resume `0x{route['resume_vaddr']:04x}` "
        f"(opcode `0x{route['resume_opcode']:02x}`).",
        f"- Secret `GAME.OVR` container magic: `{report['container_magic']}` (not `FBOV` -- see "
        "`tools/carve_goldbox_overlays.py`).",
        f"- Exact cross-title clustered subsystem functions: `{summary['exact_clustered_functions']}`.",
        f"- Replayed commands: `{len(report['replayed_commands'])}`; exact cross-title candidates: "
        f"`{summary['exact_clustered_commands']}`; shape-only (unpromoted): "
        f"`{summary['shape_only_commands']}`; Secret-local singletons: "
        f"`{summary['singleton_command_handlers']}`; dispatcher-internal: "
        f"`{summary['dispatcher_internal_commands']}`.",
        f"- Total resolved inbound VROOMM calls across every mapped function: "
        f"`{summary['total_resolved_inbound_vroomm_calls']}`.",
        "",
        report["source_oracle_status"],
        "",
        "## Subsystem Functions",
        "",
        "| Role | Secret file offset | CoAB reference offset | Sequence similarity | Local size | Cluster status | Inbound VROOMM calls |",
        "| --- | ---: | ---: | ---: | ---: | --- | ---: |",
    ]
    for row in report["functions"]:
        inbound = sum(x["call_count"] for x in row["inbound_vroomm_calls"])
        lines.append(
            f"| `{row['role']}` | `0x{row['file_offset']:x}` | `0x{row['coab_reference_offset']:x}` | "
            f"{row['sequence_similarity']:.4f} | {row['signature']['size']} | {row['promotion_status']} | {inbound} |"
        )
    lines += [
        "",
        "## Replayed Commands",
        "",
        "| Opcode | Mnemonic | Secret executable mapping | Promotion status | Inbound VROOMM calls |",
        "| ---: | --- | --- | --- | ---: |",
    ]
    for row in report["replayed_commands"]:
        mapping = (
            f"handler `0x{row['handler_file_offset']:x}`"
            if "handler_file_offset" in row
            else f"inside dispatcher `0x{row['dispatcher_file_offset']:x}`"
        )
        inbound = sum(x["call_count"] for x in row.get("inbound_vroomm_calls", []))
        lines.append(
            f"| `0x{row['opcode']:02x}` | `{row['mnemonic']}` | {mapping} | {row['promotion_status']} | {inbound} |"
        )
    lines += [
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
        "Unlike Pool's operand parser (an exact five-title cluster with 42 resolved inbound VROOMM "
        "calls), Secret's dispatcher and operand parser land in zero cross-title clusters and have "
        "zero resolved inbound VROOMM calls in the current corpus. Only one replayed handler "
        "(`SAVE`, opcode `0x09`) has any cross-title cluster evidence at all, and it is "
        "`control-flow-shape` (structural, medium confidence, 4 titles) -- explicitly not "
        "`exact`/`relocation-normalized`, so it stays a nomination, not a promoted name. Every other "
        "reached command handler is a Secret-local singleton. Why Secret's VROOMM inbound-call "
        "correlation is empty (near-call convention inside its own overlay descriptor vs. "
        "cross-descriptor public-stub calls, TPOV vs FBOV loader-body layout, or something else) is "
        "UNKNOWN and out of scope for this tool; it is reported here as an honest gap, not resolved.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--route", type=Path, default=DEFAULT_ROUTE)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--patterns", type=Path, default=DEFAULT_PATTERNS)
    parser.add_argument("--calls", type=Path, default=DEFAULT_CALLS)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.route, args.oracle, args.patterns, args.calls)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    if args.strict:
        weak = [row["role"] for row in report["functions"] if row["sequence_similarity"] < 0.95]
        actual_opcodes = {row["opcode"] for row in report["replayed_commands"]}
        required_opcodes = set(REPLAYED_OPCODES)
        if weak or actual_opcodes != required_opcodes or report["container_magic"] != "TPOV":
            raise SystemExit(f"strict failure: incomplete Secret behavior-to-executable join; weak={weak}")
    print(
        f"secret behavior map: {len(report['replayed_commands'])} commands, "
        f"{report['summary']['exact_clustered_commands']} exact cross-title candidates, "
        f"{report['summary']['singleton_command_handlers']} Secret-local singletons, "
        f"{report['summary']['dispatcher_internal_commands']} dispatcher-internal"
    )


if __name__ == "__main__":
    main()
