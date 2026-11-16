#!/usr/bin/env python3
"""Map byte-proven Secret runtime symbol candidates without transferring names by shape alone."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LAYOUTS = REPO_ROOT / "build" / "vroomm-layouts.json"
DEFAULT_GAME = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Secret of the Silver Blades\GAME.OVR")
# Checked-in evidence from the 2026-07-21 live trace that finally reached this candidate's
# descriptor-26 +0x2B1C address under original-DOS execution (see docs/engine/BUILD-QUEUE.md's
# "Capture a Secret runtime CS:IP hit at descriptor 26 +0x2B1C" leaf). Read automatically by
# `pnpm corpus`'s existing `map_secret_runtime_symbols.py --strict ...` invocation (no new flag
# needed there) so the execution-confirmed status survives a full cold regeneration. Missing is
# treated as "no evidence yet" rather than an error, so a fresh checkout without this file (or a
# `build/`-only clean) still regenerates the pre-2026-07-21 candidate-only report instead of
# failing.
DEFAULT_EXECUTION_TRACE = (
    REPO_ROOT / "docs" / "engine" / "research" / "secret-count-teams-cs-ip-confirmed-20260721.json"
)

# Complete current-retail function body, ending in RETF. Its field behavior is
# independently readable from the embedded 16-bit operands below.
COUNT_TEAMS_BYTES = bytes.fromhex(
    "55 89 e5 83 ec 04 c6 06 cc 87 00 c6 06 cd 87 00 c4 06 3c 7d 8c c2 "
    "89 46 fc 89 56 fe 8b 46 fc 0b 46 fe 74 2c c4 7e fc 26 80 bd a7 01 00 "
    "74 0f c4 7e fc 26 8a 85 a8 01 98 8b f8 fe 85 cc 87 c4 7e fc 26 c4 "
    "85 9d 01 8c c2 89 46 fc 89 56 fe eb cc 89 ec 5d cb"
)


def all_offsets(data: bytes, needle: bytes) -> list[int]:
    offsets: list[int] = []
    cursor = 0
    while (offset := data.find(needle, cursor)) >= 0:
        offsets.append(offset)
        cursor = offset + 1
    return offsets


def containing_descriptor(game: dict[str, Any], offset: int) -> dict[str, Any]:
    matches = [
        descriptor
        for descriptor in game["descriptors"]
        if int(descriptor["ovr_file_offset"])
        <= offset
        < int(descriptor["ovr_file_offset"]) + int(descriptor["code_size"])
    ]
    if len(matches) != 1:
        raise ValueError(f"expected one descriptor containing {offset:#x}, found {len(matches)}")
    return matches[0]


def execution_confirmation(
    execution_trace: dict[str, Any] | None, descriptor_index: int
) -> dict[str, Any] | None:
    """Extract a genuine, byte-verified live CS:IP hit for this exact descriptor from a
    `tools/trace_secret_begin_selector.ps1 -ArmCountTeamsBpm` `selector-trace.json` (its
    `count_teams` sub-object). Returns None unless the trace itself already computed both
    `cs_ip_hit_confirmed` and `byte_match_confirmed` true for this descriptor -- this function
    never re-derives those booleans, it only refuses to trust a trace for the wrong descriptor
    or a trace that didn't reach that verdict.
    """
    if execution_trace is None:
        return None
    count_teams = execution_trace.get("count_teams")
    if not count_teams or int(count_teams.get("descriptor", -1)) != descriptor_index:
        return None
    if not count_teams.get("cs_ip_hit_confirmed") or not count_teams.get("byte_match_confirmed"):
        return None
    byte_matched_hits = [hit for hit in count_teams.get("hits", []) if hit.get("byte_match")]
    if not byte_matched_hits:
        return None
    return {
        "hit_count": len(count_teams.get("hits", [])),
        "byte_matched_hit_count": len(byte_matched_hits),
        "first_byte_matched_hit": byte_matched_hits[0],
    }


def build_report(
    data: bytes,
    layouts: dict[str, Any],
    source: str,
    execution_trace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    games = [game for game in layouts["games"] if game["profile_id"] == "secret-of-the-silver-blades"]
    if len(games) != 1:
        raise ValueError(f"expected one Secret layout, found {len(games)}")
    offsets = all_offsets(data, COUNT_TEAMS_BYTES)
    if len(offsets) != 1:
        raise ValueError(f"expected one exact count-teams body, found {len(offsets)}")
    offset = offsets[0]
    descriptor = containing_descriptor(games[0], offset)
    descriptor_base = int(descriptor["ovr_file_offset"])
    relative_offset = offset - descriptor_base
    stub_indices = [
        index for index, proc_offset in enumerate(descriptor.get("stub_proc_offsets", []))
        if int(proc_offset) == relative_offset
    ]
    if len(stub_indices) != 1:
        raise ValueError(f"expected one public stub for count-teams candidate, found {len(stub_indices)}")
    stub_index = stub_indices[0]
    stub_file_offset = int(descriptor["stub_array_file_offset"]) + stub_index * 5
    inbound_calls = []
    for caller in games[0]["descriptors"]:
        for fixup in caller.get("fixup_entries", []):
            if (
                fixup.get("route_kind") == "public_stub_owned"
                and int(fixup.get("target_descriptor_index", -1)) == int(descriptor["index"])
                and int(fixup.get("target_proc_offset", -1)) == relative_offset
            ):
                inbound_calls.append({
                    "caller_descriptor_index": int(caller["index"]),
                    "caller_instruction_offset": int(fixup["instruction_offset"]),
                    "caller_retail_file_offset": int(caller["ovr_file_offset"]) + int(fixup["instruction_offset"]),
                    "loader_target_file_offset": int(fixup["loader_target_file_offset"]),
                    "target_stub_index": int(fixup["target_stub_index"]),
                })
    confirmation = execution_confirmation(execution_trace, int(descriptor["index"]))
    semantic_status = (
        "execution_confirmed_secret_cs_ip_hit"
        if confirmation is not None
        else "candidate_pending_secret_cs_ip_hit"
    )
    evidence = [
        "exact Secret retail function body",
        "Secret active tactical RAM counts 6/5 and defeat control 0/5",
        "CoAB source-oracle count_teams behavior",
    ]
    if confirmation is not None:
        first_hit = confirmation["first_byte_matched_hit"]
        evidence.append(
            "live Secret CS:IP hit at "
            f"{first_hit.get('pointer')} (physical {first_hit.get('physical')}) with an exact "
            "84-byte resident match against the retail body, captured by "
            "tools/trace_secret_begin_selector.ps1 -ArmCountTeamsBpm during the ECL3#97 natural "
            "combat-team-counting moment"
        )
    symbol = {
        "candidate_name": "count_combat_teams",
        "semantic_status": semantic_status,
        "retail_file_offset": offset,
        "size": len(COUNT_TEAMS_BYTES),
        "sha256": hashlib.sha256(COUNT_TEAMS_BYTES).hexdigest(),
        "descriptor_index": int(descriptor["index"]),
        "descriptor_relative_offset": relative_offset,
        "public_stub": {
            "index": stub_index,
            "loader_file_offset": int(descriptor["loader_file_offset"]),
            "stub_file_offset": stub_file_offset,
        },
        "inbound_calls": inbound_calls,
        "proc_kind": "far",
        "fields": {
            "team_list_head_far_ptr": "DS:7D3C",
            "combatant_next_far_ptr": "+0x19D",
            "combatant_in_combat": "+0x1A7",
            "combatant_team": "+0x1A8",
            "friends_count": "DS:87CC",
            "foes_count": "DS:87CD",
        },
        "byte_semantics": (
            "clear DS:87CC/87CD; walk DS:7D3C via +0x19D; for +0x1A7 != 0, "
            "increment DS:87CC indexed by +0x1A8"
        ),
        "evidence": evidence,
    }
    if confirmation is not None:
        symbol["execution_evidence"] = confirmation
    claim_boundary = (
        "The function, fields, and a live Secret CS:IP hit are all now proven: a genuine debugger "
        "stop landed with CS:IP exactly at the armed descriptor-26 segment:0x2B1C address, and the "
        "resident 84 bytes at that stop byte-match the retail GAME.OVR+0x3AC6D body exactly. The "
        "semantic name is execution-confirmed, not merely placed."
        if confirmation is not None
        else (
            "The function and fields are byte-proven in Secret. The semantic name remains a candidate "
            "until a Secret runtime CS:IP trace reaches this exact descriptor-relative offset."
        )
    )
    return {
        "schema_version": 1,
        "profile_id": "secret-of-the-silver-blades",
        "source": source,
        "source_sha256": hashlib.sha256(data).hexdigest(),
        "symbols": [symbol],
        "strict_status": "pass",
        "claim_boundary": claim_boundary,
    }


def markdown(report: dict[str, Any]) -> str:
    symbol = report["symbols"][0]
    fields = symbol["fields"]
    return "\n".join([
        "# Secret Runtime Symbol Candidates",
        "",
        "> Generated by `tools/map_secret_runtime_symbols.py`; do not edit by hand.",
        "",
        "## Count Combat Teams Candidate",
        "",
        f"- Retail file offset: `0x{symbol['retail_file_offset']:X}`.",
        f"- VROOMM descriptor: `{symbol['descriptor_index']}`, relative `+0x{symbol['descriptor_relative_offset']:X}`.",
        f"- Exact body: `{symbol['size']}` bytes, SHA-256 `{symbol['sha256']}`.",
        f"- Public VROOMM stub: `{symbol['public_stub']['index']}` at loader file `0x{symbol['public_stub']['stub_file_offset']:X}`.",
        f"- Resolved inbound calls: `{len(symbol['inbound_calls'])}`.",
        f"- Status: `{symbol['semantic_status']}`.",
        *([
            f"- Live CS:IP hit: `{symbol['execution_evidence']['first_byte_matched_hit'].get('pointer')}`"
            f" (physical `{symbol['execution_evidence']['first_byte_matched_hit'].get('physical')}`),"
            f" `{symbol['execution_evidence']['byte_matched_hit_count']}`/"
            f"`{symbol['execution_evidence']['hit_count']}` stops byte-matched.",
        ] if "execution_evidence" in symbol else []),
        "",
        "| Role | Secret operand |",
        "| --- | --- |",
        *[f"| `{name}` | `{value}` |" for name, value in fields.items()],
        "",
        symbol["byte_semantics"] + ".",
        "",
        "## Resolved Inbound Calls",
        "",
        "| Caller descriptor | Relative instruction | Retail file offset |",
        "| ---: | ---: | ---: |",
        *[
            f"| {row['caller_descriptor_index']} | `+0x{row['caller_instruction_offset']:X}` | `0x{row['caller_retail_file_offset']:X}` |"
            for row in symbol["inbound_calls"]
        ],
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game", type=Path, default=DEFAULT_GAME)
    parser.add_argument("--layouts", type=Path, default=DEFAULT_LAYOUTS)
    parser.add_argument("--json", dest="json_path", type=Path)
    parser.add_argument("--markdown", dest="markdown_path", type=Path)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument(
        "--execution-trace",
        type=Path,
        default=DEFAULT_EXECUTION_TRACE,
        help=(
            "tools/trace_secret_begin_selector.ps1 -ArmCountTeamsBpm selector-trace.json (or any "
            "JSON with an equivalent count_teams.{descriptor,cs_ip_hit_confirmed,"
            "byte_match_confirmed,hits} shape); when it proves a genuine byte-matched live CS:IP "
            "hit at this exact descriptor, the candidate is marked execution-confirmed. A missing "
            "file (default or explicit) is treated as no evidence yet, not an error."
        ),
    )
    args = parser.parse_args()
    execution_trace = (
        json.loads(args.execution_trace.read_text(encoding="utf-8"))
        if args.execution_trace and args.execution_trace.exists()
        else None
    )
    report = build_report(
        args.game.read_bytes(),
        json.loads(args.layouts.read_text(encoding="utf-8")),
        str(args.game.resolve()),
        execution_trace=execution_trace,
    )
    payload = json.dumps(report, indent=2) + "\n"
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(payload, encoding="utf-8")
    if args.markdown_path:
        args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_path.write_text(markdown(report), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(payload, end="")
    else:
        symbol = report["symbols"][0]
        print(f"Secret symbol candidate: GAME.OVR+0x{symbol['retail_file_offset']:X}")
    return 1 if args.strict and report["strict_status"] != "pass" else 0


if __name__ == "__main__":
    raise SystemExit(main())
