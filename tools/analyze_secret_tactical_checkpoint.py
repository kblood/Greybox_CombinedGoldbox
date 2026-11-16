#!/usr/bin/env python3
"""Normalize Secret's ECL-to-tactical checkpoint without rerunning DOSBox-X."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_model_json(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```json") and stripped.endswith("```"):
        stripped = stripped[7:-3].strip()
    value = json.loads(stripped)
    if not isinstance(value, dict):
        raise ValueError("model report must contain a JSON object")
    return value


def flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(flatten_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(flatten_text(item) for item in value)
    return ""


def build_proof(trace: dict[str, Any], ram: bytes, screenshot: bytes, model: dict[str, Any]) -> dict[str, Any]:
    cursor = trace.get("cursor", {})
    rows = cursor.get("rows", [])
    reached = {int(row["ecl_pc"]) for row in rows if "ecl_pc" in row}
    ds = int(trace["parser"]["ds"], 16)
    pc_address = (ds << 4) + 0x67E1
    if pc_address + 2 > len(ram):
        raise ValueError("RAM checkpoint is too short for the ECL cursor")
    parked_pc = int.from_bytes(ram[pc_address : pc_address + 2], "little")

    frames = model.get("frames", [])
    frame = frames[0] if frames and isinstance(frames[0], dict) else {}
    visible = flatten_text(frame.get("visible_text", "")).upper()
    visual_tactical = (
        frame.get("state") == "combat"
        and not frame.get("looks_crashed", False)
        and all(command in visible for command in ("FIGHT", "VIEW", "AIM", "QUICK", "DONE"))
    )
    mechanical_handoff = 0x82B4 in reached and parked_pc == 0x82BC

    return {
        "schema_version": 1,
        "title": "Secret original-DOS tactical-entry proof",
        "execution": {
            "load_monster_cursor_reached": 0x82B4 in reached,
            "combat_opcode": "0x82BB (operandless; no operand-parser stop)",
            "parked_resume_cursor": f"0x{parked_pc:04X}",
            "mechanical_handoff_proven": mechanical_handoff,
        },
        "tactical_screen": {
            "sha256": sha256(screenshot),
            "byte_length": len(screenshot),
            "model_state": frame.get("state"),
            "model_selected_item": frame.get("selected_item"),
            "expected_commands_seen": visual_tactical,
            "advisory_model": True,
        },
        "verdict": "active_2d_tactical_mode" if mechanical_handoff and visual_tactical else "not_proven",
        "claim_boundary": (
            "The ECL cursor and screenshot/model report prove entry into active 2D tactical mode. "
            "They do not prove combat completion, execution of resume 0x82BC, the consumed bit, or EXIT."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace", type=Path, required=True)
    parser.add_argument("--ram", type=Path, required=True)
    parser.add_argument("--screenshot", type=Path, required=True)
    parser.add_argument("--model-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    proof = build_proof(
        json.loads(args.trace.read_text(encoding="utf-8-sig")),
        args.ram.read_bytes(),
        args.screenshot.read_bytes(),
        parse_model_json(args.model_report.read_text(encoding="utf-8-sig")),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(proof, indent=2))
    return 1 if args.strict and proof["verdict"] != "active_2d_tactical_mode" else 0


if __name__ == "__main__":
    raise SystemExit(main())
