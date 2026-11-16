#!/usr/bin/env python3
"""Map Gateway ECL/runtime candidates from CoAB subsystem shapes and retail bytes."""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from gen1_map import overlay_index_for_offset, scan_descriptors
from map_pool_ecl_dispatch import FunctionShape, disassemble_shape, dispatch_table, oracle_offset


DEFAULT_GATEWAY = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier")
DEFAULT_COAB = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Curse of the Azure Bonds")
DEFAULT_ORACLE = Path(__file__).resolve().parent.parent / "build" / "coab-oracle-map.json"
EXPECTED_HASHES = {
    "gateway_loader": "0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00",
    "gateway_overlay": "c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd",
}
ROLES = {
    "dispatcher": ("commandTable", 0x43F3, 0.98),
    "operand_parser": ("@parse_command_sub$q4Byte", 0x9471, 0.98),
    "ecl_loader": ("load_ecl_dax", 0x9800, 0.98),
    "command_parser": ("parse_command", 0xB578, 0.98),
    "memory_type_candidate": ("sub_30723", 0x9C1E, 0.95),
    "memory_set_candidate": ("@cmd_table01$q4Wordt1", 0xA2CF, 0.92),
    "memory_get_candidate": ("sub_30F16", 0xA46D, 0.95),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def function_shapes(data: bytes) -> list[FunctionShape]:
    starts = sorted(
        {
            offset
            for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")
            for offset in range(len(data))
            if data.startswith(pattern, offset)
        }
    )
    return [shape for offset in starts if (shape := disassemble_shape(data, offset)) is not None]


def similarity(reference: FunctionShape, candidate: FunctionShape) -> tuple[float, float]:
    ratio = SequenceMatcher(None, reference.tokens, candidate.tokens, autojunk=False).ratio()
    ref_grams = set(zip(reference.tokens, reference.tokens[1:], reference.tokens[2:]))
    candidate_grams = set(zip(candidate.tokens, candidate.tokens[1:], candidate.tokens[2:]))
    jaccard = len(ref_grams & candidate_grams) / max(1, len(ref_grams | candidate_grams))
    return ratio, jaccard


def best_match(reference: FunctionShape, candidates: list[FunctionShape]) -> tuple[FunctionShape, float, float]:
    ranked = [(similarity(reference, candidate), candidate) for candidate in candidates]
    if not ranked:
        raise ValueError("no Gateway function candidates")
    (ratio, jaccard), candidate = max(ranked, key=lambda item: item[0])
    return candidate, ratio, jaccard


def build_report(
    gateway: Path = DEFAULT_GATEWAY,
    coab: Path = DEFAULT_COAB,
    oracle_path: Path = DEFAULT_ORACLE,
) -> dict[str, Any]:
    gateway_loader = (gateway / "GAME.EXE").read_bytes()
    gateway_overlay = (gateway / "GAME.OVR").read_bytes()
    coab_overlay = (coab / "GAME.OVR").read_bytes()
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    descriptors = scan_descriptors(gateway_loader, gateway_overlay)
    candidates = function_shapes(gateway_overlay)

    rows: dict[str, Any] = {}
    for role, (oracle_symbol, expected_offset, threshold) in ROLES.items():
        reference = disassemble_shape(coab_overlay, oracle_offset(oracle, oracle_symbol))
        if reference is None:
            raise ValueError(f"failed to disassemble CoAB oracle: {oracle_symbol}")
        candidate, ratio, jaccard = best_match(reference, candidates)
        descriptor, relative = overlay_index_for_offset(descriptors, candidate.offset)
        rows[role] = {
            "role": role,
            "oracle_symbol": oracle_symbol,
            "coab": asdict(reference),
            "gateway": asdict(candidate),
            "descriptor": descriptor,
            "descriptor_offset": relative,
            "sequence_similarity": ratio,
            "trigram_jaccard": jaccard,
            "expected_offset": expected_offset,
            "threshold": threshold,
            "offset_exact": candidate.offset == expected_offset,
            "threshold_passed": ratio >= threshold,
            "runtime_promoted": False,
        }

    dispatcher = FunctionShape(**rows["dispatcher"]["gateway"])
    dispatch = dispatch_table(gateway_overlay, dispatcher)
    strict_pass = (
        sha256(gateway_loader) == EXPECTED_HASHES["gateway_loader"]
        and sha256(gateway_overlay) == EXPECTED_HASHES["gateway_overlay"]
        and all(row["offset_exact"] and row["threshold_passed"] for row in rows.values())
    )
    symbols = [
        {
            "candidate_name": role,
            "semantic_status": "candidate_pending_gateway_runtime_hit",
            "descriptor_index": row["descriptor"],
            "descriptor_relative_offset": row["descriptor_offset"],
            "retail_file_offset": row["gateway"]["offset"],
            "size": row["gateway"]["size"],
            "evidence": [
                f"CoAB subsystem shape {row['oracle_symbol']}",
                f"sequence similarity {row['sequence_similarity']:.6f}",
                "Gateway retail descriptor ownership",
            ],
        }
        for role, row in rows.items()
    ]
    return {
        "schema_version": 1,
        "title": "Gateway title-local ECL runtime candidates",
        "profile_id": "gateway-to-the-savage-frontier",
        "strict_status": "pass" if strict_pass else "fail",
        "sources": {
            "gateway_loader": {"path": str(gateway / "GAME.EXE"), "sha256": sha256(gateway_loader)},
            "gateway_overlay": {"path": str(gateway / "GAME.OVR"), "sha256": sha256(gateway_overlay)},
            "coab_oracle": str(oracle_path),
        },
        "matches": rows,
        "symbols": symbols,
        "dispatch": dispatch,
        "dispatch_opcodes": [row["opcode"] for row in dispatch],
        "claim_boundary": (
            "These are title-local file/descriptor candidates established by structural identity. "
            "Runtime segment, DGROUP, Area1 base, ECL cursor, and semantic promotion require reached "
            "Gateway execution plus live-byte validation."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Gateway ECL runtime candidates",
        "",
        "> Generated by `tools/map_gateway_ecl_runtime_candidates.py`. Do not edit by hand.",
        "",
        "| Role | File offset | Descriptor | Similarity | Runtime promoted |",
        "| --- | ---: | ---: | ---: | --- |",
    ]
    for row in report["matches"].values():
        lines.append(
            f"| `{row['role']}` | `GAME.OVR+0x{row['gateway']['offset']:X}` | "
            f"`ovr{row['descriptor']:03d}+0x{row['descriptor_offset']:X}` | "
            f"`{row['sequence_similarity']:.4f}` | `{str(row['runtime_promoted']).lower()}` |"
        )
    lines.extend(
        [
            "",
            f"Dispatcher candidate covers {len(report['dispatch_opcodes'])} opcode comparisons: "
            + ", ".join(f"`0x{opcode:02X}`" for opcode in report["dispatch_opcodes"])
            + ".",
            "",
            "## Claim boundary",
            "",
            report["claim_boundary"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gateway", type=Path, default=DEFAULT_GATEWAY)
    parser.add_argument("--coab", type=Path, default=DEFAULT_COAB)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, required=True)
    parser.add_argument("--markdown", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.gateway, args.coab, args.oracle)
    if args.strict:
        failures = [
            role
            for role, row in report["matches"].items()
            if not row["offset_exact"] or not row["threshold_passed"]
        ]
        hash_failures = [
            key
            for key, expected in EXPECTED_HASHES.items()
            if report["sources"][key]["sha256"] != expected
        ]
        if failures or hash_failures:
            raise SystemExit(f"strict failure: matches={failures}, hashes={hash_failures}")
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    print("gateway ECL candidates: " + ", ".join(f"{key}=0x{row['gateway']['offset']:X}" for key, row in report["matches"].items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
