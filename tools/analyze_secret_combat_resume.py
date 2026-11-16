#!/usr/bin/env python3
"""Validate Secret's encounter -> tactical combat -> ECL resume evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(flatten_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(flatten_text(item) for item in value)
    return ""


def parse_model_json(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```json") and stripped.endswith("```"):
        stripped = stripped[7:-3].strip()
    value = json.loads(stripped)
    if isinstance(value, list):
        # describe_screenshots.py's vision model sometimes emits a bare top-level frame array
        # instead of {"frames": [...]} (observed live 2026-07-17, r4 evidence run) -- both shapes
        # carry the same per-frame data, so normalize rather than reject a validly-parsed report.
        value = {"frames": value}
    if not isinstance(value, dict):
        raise ValueError("model report must contain a JSON object or a top-level frame array")
    return value


def build_proof(
    trace: dict[str, Any],
    tactical_ram: bytes,
    consumed_ram: bytes,
    injection: dict[str, Any],
    tactical_status: dict[str, Any],
    post_status: dict[str, Any],
    tactical_screenshot: bytes,
    post_screenshot: bytes,
    post_model: dict[str, Any],
) -> dict[str, Any]:
    ds = int(trace["parser"]["ds"], 16)
    es = int(trace["parser"]["es"], 16)
    base = ds << 4
    area_base = es << 4
    consumed_offset = (0x6A00 + (0x4CCD * 2)) & 0xFFFF
    consumed_address = area_base + consumed_offset
    required_end = max(base + 0x87CE, consumed_address + 2)
    if len(tactical_ram) < required_end or len(consumed_ram) < required_end:
        raise ValueError("RAM checkpoint is too short for Secret DGROUP evidence")

    cursor_address = base + 0x67E1
    friends_address = base + 0x87CC
    foes_address = base + 0x87CD
    before_consumed = int.from_bytes(tactical_ram[consumed_address : consumed_address + 2], "little")
    after_consumed = int.from_bytes(consumed_ram[consumed_address : consumed_address + 2], "little")
    tactical_pc = int.from_bytes(tactical_ram[cursor_address : cursor_address + 2], "little")
    resume_pc = int.from_bytes(consumed_ram[cursor_address : cursor_address + 2], "little")
    tactical_counts = [tactical_ram[friends_address], tactical_ram[foes_address]]
    resume_counts = [consumed_ram[friends_address], consumed_ram[foes_address]]

    team_injection = injection.get("team_count", {})
    combatant_injections = injection.get("combatants", [])
    expected_combatant_addresses = [0x6D640, 0x6F359, 0x6F519, 0x6F6D9, 0x6F899]
    injection_exact = (
        team_injection.get("address") == foes_address
        and team_injection.get("length") == 1
        and team_injection.get("before") == "05"
        and team_injection.get("after") == "00"
        and "compare-and-swap" in str(team_injection.get("mechanism", ""))
        and [item.get("address") for item in combatant_injections] == expected_combatant_addresses
        and all(
            item.get("length") == 1
            and item.get("before") == "01"
            and item.get("after") == "00"
            and "compare-and-swap" in str(item.get("mechanism", ""))
            for item in combatant_injections
        )
    )
    trace_cursor = trace.get("cursor", {})
    # 2026-07-17 (r4): the CODE segment that performs the Area1 setter write is not stable run to
    # run -- it was 4465 in the 2026-07-16 post-hoc RAM scans, but a 2026-07-17 live capture (via a
    # correctly-armed BPM on the setter's DATA target) proved a live write at segment 4616, a
    # further relocation the fixed-segment assumption never anticipated. "generalized_exact" accepts
    # any live-observed segment:offset instead of hard-requiring the literal 4465:0561 the original
    # two-stage design assumed; "legacy_exact" is kept for exact backward compatibility with that
    # original (now known non-general) literal-target contract, in case a future run ever does land
    # there again. A resume observed one instruction past EXIT (cursor 0x82C6, not just 0x82C5) is
    # also accepted -- both are documented shapes of "the resume completed" across every prior run.
    hit_mechanism = trace_cursor.get("hit_mechanism")
    generalized_mechanisms = {
        "bp_physical_match_post_write",
        "generalized_stop_post_write",
        "bp_physical_match_stepped",
    }
    common_exact = (
        trace_cursor.get("load_monster_reached") is True
        and trace_cursor.get("combat_reached") is True
        and trace_cursor.get("injected_combat_victory") is True
        and trace_cursor.get("resume_reached") is True
        and trace_cursor.get("consumed_before") == 0
        and trace_cursor.get("consumed_after") == 4
        and trace_cursor.get("post_or_pc") in (0x82C5, 0x82C6)
        and trace_cursor.get("resume_parser_breakpoint_reached") is True
        and trace_cursor.get("setter_breakpoint_reached") is True
        and trace_cursor.get("setter_write_alias_exact") is True
        and trace_cursor.get("setter_dx") == 4
    )
    legacy_exact = (
        trace_cursor.get("resume_parser_breakpoint") == "4465:0000"
        and trace_cursor.get("resume_parser_segment") == "4465"
        and trace_cursor.get("resume_parser_image_exact") is True
        and trace_cursor.get("setter_runtime_prologue_offset") == "0x0507"
        and trace_cursor.get("setter_runtime_write_offset") == "0x0561"
        and trace_cursor.get("setter_breakpoint") == "4465:0561"
        and trace_cursor.get("setter_file_offset") == "GAME.OVR:0x9F94"
    )
    generalized_exact = (
        hit_mechanism in generalized_mechanisms
        and bool(trace_cursor.get("resume_parser_segment_observed_live"))
        and bool(trace_cursor.get("resume_parser_offset_observed_live"))
        and bool(trace_cursor.get("setter_write_pointer"))
    )
    trace_exact = common_exact and (legacy_exact or generalized_exact)
    memory_exact = (
        before_consumed == 0
        and after_consumed == 4
        and tactical_pc == 0x82BC
        and resume_pc in (0x82C5, 0x82C6)
        and tactical_counts == [6, 5]
        and resume_counts == [6, 0]
    )

    tactical_sequence = int(tactical_status["frame"]["sequence"])
    post_sequence = int(post_status["frame"]["sequence"])
    model_frames = post_model.get("frames", [])
    model_frame = model_frames[0] if model_frames and isinstance(model_frames[0], dict) else {}
    visible = flatten_text(model_frame.get("visible_text", "")).upper()
    tactical_commands = ("FIGHT", "VIEW", "AIM", "QUICK", "DONE")
    visual_exit = (
        model_frame.get("state") != "combat"
        and not model_frame.get("looks_crashed", False)
        and not all(command in visible for command in tactical_commands)
        and tactical_sequence != post_sequence
        and tactical_screenshot != post_screenshot
    )

    proven = trace_exact and memory_exact and injection_exact and visual_exit
    return {
        "schema_version": 1,
        "title": "Secret original-DOS combat resume proof",
        "route": {
            "load_monster_reached": trace_cursor.get("load_monster_reached"),
            "active_tactical_cursor": f"0x{tactical_pc:04X}",
            "tactical_team_counts": tactical_counts,
        },
        "bounded_outcome_control": {
            "source_symbol": "GAME.OVR:0x3AC6D count_teams",
            "foe_count_address": f"0x{foes_address:05X}",
            "injection": injection,
            "exact_compare_and_swap": injection_exact,
            "natural_victory": False,
        },
        "resume": {
            "logical_consumed_address": "0x4CCD",
            "resolved_consumed_pointer": f"{es:04X}:{consumed_offset:04X}",
            "resolved_consumed_physical": f"0x{consumed_address:05X}",
            "consumed_transition": [before_consumed, after_consumed],
            "cursor_after_or": f"0x{resume_pc:04X}",
            "team_counts_after_outcome": resume_counts,
            "trace_fields_exact": trace_exact,
            "memory_exact": memory_exact,
            "resume_parser_breakpoint": trace_cursor.get("resume_parser_breakpoint"),
            "resume_parser_image_exact": trace_cursor.get("resume_parser_image_exact"),
            "setter_breakpoint": trace_cursor.get("setter_breakpoint"),
            "setter_file_offset": trace_cursor.get("setter_file_offset"),
            "setter_write_pointer": trace_cursor.get("setter_write_pointer"),
            "setter_write_alias_exact": trace_cursor.get("setter_write_alias_exact"),
            "hit_mechanism": hit_mechanism,
            "resume_parser_segment_observed_live": trace_cursor.get("resume_parser_segment_observed_live"),
            "resume_parser_offset_observed_live": trace_cursor.get("resume_parser_offset_observed_live"),
            "setter_write_instruction_pointer": trace_cursor.get("setter_write_instruction_pointer"),
            "legacy_fixed_target_match": legacy_exact,
            "generalized_live_match": generalized_exact,
        },
        "visual_exit": {
            "tactical_frame_sequence": tactical_sequence,
            "post_frame_sequence": post_sequence,
            "tactical_sha256": sha256(tactical_screenshot),
            "post_sha256": sha256(post_screenshot),
            "post_model_state": model_frame.get("state"),
            "proven": visual_exit,
            "advisory_model": True,
        },
        "verdict": "combat_resumed_and_consumed" if proven else "not_proven",
        "claim_boundary": (
            "This proves one injected original-DOS Secret combat outcome and ECL continuation. "
            "It does not claim a natural tactical victory or campaign-complete combat coverage."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trace", type=Path, required=True)
    parser.add_argument("--tactical-ram", type=Path, required=True)
    parser.add_argument("--consumed-ram", type=Path, required=True)
    parser.add_argument("--injection", type=Path, required=True)
    parser.add_argument("--tactical-status", type=Path, required=True)
    parser.add_argument("--post-status", type=Path, required=True)
    parser.add_argument("--tactical-screenshot", type=Path, required=True)
    parser.add_argument("--post-screenshot", type=Path, required=True)
    parser.add_argument("--post-model-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    proof = build_proof(
        json.loads(args.trace.read_text(encoding="utf-8-sig")),
        args.tactical_ram.read_bytes(),
        args.consumed_ram.read_bytes(),
        json.loads(args.injection.read_text(encoding="utf-8-sig")),
        json.loads(args.tactical_status.read_text(encoding="utf-8-sig")),
        json.loads(args.post_status.read_text(encoding="utf-8-sig")),
        args.tactical_screenshot.read_bytes(),
        args.post_screenshot.read_bytes(),
        parse_model_json(args.post_model_report.read_text(encoding="utf-8-sig")),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(proof, indent=2))
    return 1 if args.strict and proof["verdict"] != "combat_resumed_and_consumed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
