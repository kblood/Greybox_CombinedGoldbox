#!/usr/bin/env python3
"""Classify native Gen1 attract-demo structure from each located ECL entry.

The stable walking signature is behavioral rather than a single title-specific
machine-code address:

* load a real GEO/WALLDEF scene (LOAD_FILES + LOAD_PIECES),
* seed or mutate the live X/Y/facing cells,
* repeatedly redraw the first-person viewport and/or call the native
  move-position-forward routine,
* optionally stage monsters and reach COMBAT.

CoK, DoK, Secret, and Gateway compile their redraw helpers at slightly different
addresses, but their ECL scripts expose the same shape.  This tool consumes the
already-located demo blocks through ``map_gen1_demo_entry`` and emits a compact,
reproducible cross-title report.  It does not launch DOSBox-X; native framebuffer
capture remains the dynamic verification layer.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import goldbox_corpus
from map_gen1_demo_entry import build_report


REPO_ROOT = goldbox_corpus.REPO_ROOT
DEFAULT_JSON = REPO_ROOT / "build" / "gen1-demo-sequence-patterns.json"
DEFAULT_PROFILES = (
    "champions-of-krynn",
    "curse-of-the-azure-bonds",
    "death-knights-of-krynn",
    "gateway-to-the-savage-frontier",
    "pool-of-radiance",
    "pools-of-darkness",
    "secret-of-the-silver-blades",
    "treasures-of-the-savage-frontier",
)

POSITION_CELLS = (0xC04B, 0xC04C, 0xC04D)
CALL_RE = re.compile(r"^CALL \[1:0x([0-9a-f]+)\]$", re.IGNORECASE)

# These are encoded ECL operand words, not portable EXE file offsets.  The
# redraw entry moved between engine builds; the move/animation calls stayed
# stable in the scripts checked here.  The two redraw variants are grounded by
# CoK/DoK native walking captures and the matching Secret/Gateway script shape.
CALL_ROLE_BY_WORD = {
    0x2DCB: "redrawDungeonView",
    0x2E10: "redrawDungeonView",
    0xC01E: "movePositionForward",
    0x6803: "advanceAnimatedPicture",
}


def instructions(report: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        instruction
        for block in report.get("demo_chain", [])
        for instruction in block.get("instructions", [])
    ]


def count_position_operations(rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    counts = Counter({"save": 0, "arithmetic": 0, "compare": 0})
    cells = tuple(f"[1:0x{address:04x}]" for address in POSITION_CELLS)
    for row in rows:
        text = row.get("text", "")
        if not any(cell in text for cell in cells):
            continue
        mnemonic = text.split(" ", 1)[0]
        if mnemonic == "SAVE":
            counts["save"] += 1
        elif mnemonic in {"ADD", "SUBTRACT"}:
            counts["arithmetic"] += 1
        elif mnemonic == "COMPARE":
            counts["compare"] += 1
    return dict(counts)


def call_roles(rows: Iterable[dict[str, Any]]) -> tuple[dict[str, int], dict[str, int]]:
    raw_counts: Counter[str] = Counter()
    role_counts: Counter[str] = Counter()
    for row in rows:
        match = CALL_RE.match(row.get("text", ""))
        if not match:
            continue
        word = int(match.group(1), 16)
        raw_counts[f"0x{word:04x}"] += 1
        role = CALL_ROLE_BY_WORD.get(word)
        if role:
            role_counts[role] += 1
    return dict(sorted(raw_counts.items())), dict(sorted(role_counts.items()))


def analyze_report(report: dict[str, Any]) -> dict[str, Any]:
    profile = report.get("profile_id", "unknown")
    if not report.get("boot_dispatch", {}).get("resolved") or not report.get("demo_block_known"):
        return {
            "profile_id": profile,
            "demo_located": False,
            "classification": "no-located-demo",
            "claim_boundary": "No statically located demo entry; no sequence inference made.",
        }

    rows = instructions(report)
    opcodes = Counter(row.get("opcode") for row in rows)
    position = count_position_operations(rows)
    raw_calls, roles = call_roles(rows)
    load_files = opcodes[0x21]
    load_pieces = opcodes[0x37]
    combat = opcodes[0x24]
    setup_monster = opcodes[0x0C]
    add_npc = opcodes[0x36]
    has_scene_load = load_files > 0 and load_pieces > 0
    redraws = roles.get("redrawDungeonView", 0)
    move_forward = roles.get("movePositionForward", 0)
    position_changes = position.get("arithmetic", 0) > 0 or position.get("save", 0) > 3
    scripted_walk = has_scene_load and redraws > 0 and (move_forward > 0 or position_changes)

    if scripted_walk and combat:
        classification = "scripted-first-person-walk-plus-combat"
    elif scripted_walk:
        classification = "scripted-first-person-walk"
    elif combat:
        classification = "combat-without-walk-signature"
    else:
        classification = "narrative-or-unresolved-host-sequence"

    evidence: list[str] = []
    if has_scene_load:
        evidence.append(f"real scene load: LOAD_FILES x{load_files}, LOAD_PIECES x{load_pieces}")
    if position.get("save") or position.get("arithmetic"):
        evidence.append(
            "position/facing cells: "
            f"SAVE x{position.get('save', 0)}, ADD/SUBTRACT x{position.get('arithmetic', 0)}"
        )
    if redraws or move_forward:
        evidence.append(f"viewport host calls: redraw x{redraws}, move-forward x{move_forward}")
    if combat:
        evidence.append(f"COMBAT x{combat} (SETUP_MONSTER x{setup_monster}, ADD_NPC x{add_npc})")

    return {
        "profile_id": profile,
        "demo_located": True,
        "demo_file": report.get("demo_file"),
        "demo_block_id": report.get("demo_block_id"),
        "structural_match_ratio": report.get("boot_dispatch", {}).get("structural_match_ratio"),
        "classification": classification,
        "scripted_first_person_walk_signature": scripted_walk,
        "scene_loads": {"load_files": load_files, "load_pieces": load_pieces},
        "position_operations": position,
        "call_targets": raw_calls,
        "call_roles": roles,
        "encounter": {
            "add_npc": add_npc,
            "setup_monster": setup_monster,
            "combat": combat,
        },
        "evidence": evidence,
        "claim_boundary": (
            "Static ECL signature only. Native framebuffer capture is required to prove the exact "
            "visual pacing and every host-side handoff."
        ),
    }


def build_sequence_report(profiles: Iterable[str]) -> dict[str, Any]:
    games = []
    for profile in profiles:
        try:
            games.append(analyze_report(build_report(profile)))
        except (FileNotFoundError, ValueError) as error:
            games.append({
                "profile_id": profile,
                "demo_located": False,
                "classification": "analysis-error",
                "error": str(error),
            })
    return {
        "schema_version": 1,
        "signature": (
            "LOAD_FILES + LOAD_PIECES; live X/Y/facing writes or arithmetic; repeated "
            "redrawDungeonView/movePositionForward host calls; optional encounter setup + COMBAT"
        ),
        "games": games,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", action="append", dest="profiles", help="profile id; repeatable")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    args = parser.parse_args()

    report = build_sequence_report(args.profiles or DEFAULT_PROFILES)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for game in report["games"]:
        print(
            f"{game['profile_id']}: {game['classification']} "
            f"demo={game.get('demo_file')}#{game.get('demo_block_id')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
