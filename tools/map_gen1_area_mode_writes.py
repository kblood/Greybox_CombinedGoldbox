"""Find statically reachable ECL writes to the Gen1 `Area1.inDungeon` host flag.

This is the opcode-level classifier the campaign route map (`build_gen1_campaign_route_map.py`)
flagged as unattempted: "classifying town vs. dungeon vs. wilderness needs ECL opcode-level RE
(e.g. which LOAD_FILES/tileset calls select WILDCOM.DAX/DUNGCOM.DAX per area), not attempted
in this pass."

The actual mechanism found in the CoAB source oracle is not a per-area LOAD_FILES/tileset call --
`ovr011.cs SetupGroundTiles()` (`sub_38030`) always loads *both* `DungCom` and `WildCom` 24x24
banks unconditionally at area setup, then picks which one is *drawn* based on a single runtime
flag, `gbl.area_ptr.inDungeon` (Area1 struct offset `0x1CC`, already decoded in
`packages/engine/src/loaders/area1.ts`). That flag is itself an ordinary ECL host-memory location:
`ovr008.cs vm_SetMemoryValue()` (`cmd_table01`, the retail handler for the ECL `SAVE` opcode,
0x09) special-cases host location `0x4BE6` (`vm_GetMemoryValueType` memType 0, Area1 range
`0x4B00..0x4EFF`; `(location - 0x4B00) == 0xE6`) by flipping `gbl.game_state` between
`GameState.DungeonMap` and `GameState.WildernessMap` when the SAVE's value differs from the
current flag, then always writes the value through `field_6A00_Set(0x6A00 + location*2, value)`
which resolves (mod 0x10000) to Area1 offset `0x1CC` = `inDungeon`. Address math verified by hand:
`0x6A00 + 0x4BE6*2 = 0x101CC`, `& 0xFFFF = 0x1CC`.

This does not, by itself, distinguish "town" from "wilderness/overland" -- CoAB only ships two
24x24 combat/floor tile banks (`DUNGCOM.DAX`, `WILDCOM.DAX`; `RANDCOM.DAX` is always layered on
top of whichever is active) and one binary flag between them. Gold Box "town" navigation (walking
city streets on the stepped first-person grid) is the *same* `DungeonMap`/`inDungeon!=1->1`
engine mode as a literal dungeon corridor -- it is a GEO area authored with town-style walls/doors
inside the shared `DUNGCOM` bank, not a third engine mode. The only binary-provable engine-mode
split is `inDungeon` (dungeon/town-style stepped grid) vs. `WildernessMap` (overland travel, which
also reads `gbl.area_ptr.current_city`/`CityInfo[]` per `SetupWildernessFloor()`).

This scanner reuses `gen1_ecl_encounter_scan`'s BFS decode-and-walk over each ECL block's header
entry points (the same one used to find COMBAT candidates) and records every statically reachable
SAVE (opcode 0x09) instruction whose location operand is the literal word `0x4BE6`, together with
the written value operand (when it is itself an immediate) and the branch path taken to reach it.
Every hit is `route_proven=false` until an in-engine or DOSBox replay confirms the branch is taken
with a concrete input; this only proves *static reachability of the opcode*, not that the game
state at that point implies "town".
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import goldbox_corpus
from report_guard import guard_narrowing_write
from gen1_ecl_encounter_scan import (
    DEFAULT_ADDRESS_ADDEND,
    PROFILE_ADDRESS_ADDENDS,
    ALL_COMPARE_OUTCOMES,
    ECL_HEADER_LEN,
    GEN1_WORD_SETS,
    decode_one,
    header_entries,
    offset_to_vaddr,
    successors,
    word_sets_for_profile,
)

REPO_ROOT = goldbox_corpus.REPO_ROOT
DEFAULT_JSON = REPO_ROOT / "build/gen1-area-mode-writes.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/gen1-area-mode-writes.md"

SAVE_OPCODE = 0x09
IN_DUNGEON_LOCATION = 0x4BE6
GEN1_PROFILE_IDS = (
    "pool-of-radiance",
    "curse-of-the-azure-bonds",
    "secret-of-the-silver-blades",
    "champions-of-krynn",
    # 2026-07-18: added death-knights-of-krynn. It was missing from this tuple entirely (a
    # silent scope bug, not a decode bug by itself) -- `--profile death-knights-of-krynn`
    # was filtered out before any block was ever scanned, so the previously reported "0
    # hits" for DoK proved nothing. See also the word_sets threading fix below: DoK uses
    # the GEN1_SHORT_WORD_SETS operand dialect (gen1_ecl_encounter_scan.PROFILE_WORD_SETS),
    # and decode_one() was being called with its long-form default, which would have
    # desynced DoK's decode stream even after adding it here.
    "death-knights-of-krynn",
    # 2026-08-05: added the four remaining Gen1 DAX titles. This is the SAME scope bug the
    # 2026-07-18 note above describes, simply never generalized past the one game that
    # prompted it: each of these was filtered out at the `profile_id not in GEN1_PROFILE_IDS`
    # guard in build_report(), so `--profile <id>` emitted `"games": []` -- an empty scan
    # list, not a scanned game with zero hits -- and printed "gen1 area-mode writes: 0".
    # That zero is a false negative and was actively dangerous: a campaign-matrix
    # `wilderness` leg may be closed as `structurally-absent` on the strength of a
    # whole-corpus scanner zero plus a missing WILDCOM.DAX (the precedent is Secret's), and
    # NWN ships no WILDCOM.DAX, so the bogus zero looked exactly like half of a proof.
    # Gateway is the control that makes the falseness provable rather than suspected: its
    # `wilderness` leg is already `proven` on real ECL6#21 overland content, so any scan
    # reporting zero area-mode writes for Gateway is wrong by construction.
    # Dialect threading is already generic here (build_report calls word_sets_for_profile()
    # and PROFILE_ADDRESS_ADDENDS per profile), so the second half of the 2026-07-18 fix
    # does not need repeating per title.
    # Deliberately still excluded: the two Buck Rogers titles (Gen1-adjacent but their
    # operand dialect is unverified against this BFS decoder, and an unverified dialect
    # desyncs the decode stream silently rather than erroring -- see the word_sets note
    # above), plus dark-queen-of-krynn (Gen2/HLIB) and FRUA (its own format).
    "gateway-to-the-savage-frontier",
    "treasures-of-the-savage-frontier",
    "pools-of-darkness",
    "neverwinter-nights-dos",
)


def scan_block_for_save(
    raw: bytes,
    address_addend: int,
    target_location: int,
    max_states: int = 50000,
    word_sets: dict[int, int] = GEN1_WORD_SETS,
) -> dict[str, Any]:
    # Keyed by (offset, entry, value_kind, value) -- the same SAVE instruction is reachable
    # through many compare-outcome/stack variants of the BFS state; only the first (shortest)
    # decision path found for each *distinct instruction* is kept, so the emitted report is one
    # row per statically-distinct SAVE site instead of an explosion of equivalent branch replays.
    hits_by_key: dict[tuple[int, str, str, int], dict[str, Any]] = {}
    states_seen: set[tuple[str, int, tuple[int, ...], tuple[int, ...]]] = set()
    queue: list[tuple[str, int, tuple[int, ...], tuple[int, ...], tuple[str, ...], tuple[int, ...]]] = []
    for entry_name, offset in header_entries(raw, address_addend):
        queue.append((entry_name, offset, (), (), (), ALL_COMPARE_OUTCOMES))

    states = 0
    head = 0
    while head < len(queue) and states < max_states:
        entry_name, offset, stack, path, decisions, compare_outcomes = queue[head]
        head += 1
        state_key = (entry_name, offset, stack[-8:], compare_outcomes)
        if state_key in states_seen:
            continue
        states_seen.add(state_key)
        states += 1
        ins = decode_one(raw, offset, word_sets=word_sets)
        if ins is None:
            continue
        next_path = (path + (offset,))[-96:]

        if ins.opcode == SAVE_OPCODE and len(ins.args) >= 2 and ins.args[1].word == target_location:
            value_arg = ins.args[0]
            value_kind = "immediate" if value_arg.code == 0 else "dynamic"
            hit_key = (offset, entry_name, value_kind, value_arg.word)
            if hit_key not in hits_by_key:
                hits_by_key[hit_key] = {
                    "entry": entry_name,
                    "offset": offset,
                    "vaddr": offset_to_vaddr(offset, address_addend),
                    "value_kind": value_kind,
                    "value_code": value_arg.code,
                    "value": value_arg.word,
                    "path_offsets": list(next_path),
                    "path_vaddrs": [offset_to_vaddr(item, address_addend) for item in next_path],
                    "branch_decisions": list(decisions[-32:]),
                }

        next_compare_outcomes = compare_outcomes
        if ins.opcode == 0x03 and len(ins.args) >= 2:
            left, right = ins.args[:2]
            if left.code == 0 and right.code == 0:
                next_compare_outcomes = ((left.word > right.word) - (left.word < right.word),)
            else:
                next_compare_outcomes = ALL_COMPARE_OUTCOMES
        elif ins.opcode in (0x14, 0x1D, 0x2F, 0x30, 0x3F):
            next_compare_outcomes = ALL_COMPARE_OUTCOMES

        for target, target_stack, decision, target_outcomes in successors(raw, ins, stack, address_addend, next_compare_outcomes):
            if ECL_HEADER_LEN <= target < len(raw) and len(target_stack) <= 24:
                next_decisions = decisions
                if decision in ("condition-true", "condition-false", "selector-fallthrough", "selector-target"):
                    next_decisions = (decisions + (f"0x{offset_to_vaddr(offset, address_addend):04x}:{decision}",))[-32:]
                queue.append((entry_name, target, target_stack, next_path, next_decisions, target_outcomes))

    hits = sorted(hits_by_key.values(), key=lambda h: (h["offset"], h["entry"]))
    return {
        "address_addend": address_addend,
        "header_entries": [{"name": name, "offset": offset, "vaddr": offset_to_vaddr(offset, address_addend)} for name, offset in header_entries(raw, address_addend)],
        "explored_states": states,
        "state_limit_reached": head < len(queue),
        "hits": hits,
    }


def build_report(profile_ids: set[str] | None = None) -> dict[str, Any]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    games: list[dict[str, Any]] = []
    for profile in goldbox_corpus.PROFILES:
        profile_id = profile["id"]
        if profile_ids and profile_id not in profile_ids:
            continue
        if profile_id not in GEN1_PROFILE_IDS:
            continue
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        files = goldbox_corpus.file_index(install)
        address_addend = PROFILE_ADDRESS_ADDENDS.get(profile_id, DEFAULT_ADDRESS_ADDEND)
        word_sets = word_sets_for_profile(profile_id)
        ecl_files: list[dict[str, Any]] = []
        # `ecl_files` only records archives that produced a hit, so on its own a zero row is
        # indistinguishable from a game that was never scanned at all. That ambiguity is exactly
        # what hid the GEN1_PROFILE_IDS false negative (fixed 5febedb): the CLI printed
        # "gen1 area-mode writes: 0" for profiles that had been filtered out before a single block
        # was read. So count the scan itself and publish it -- a zero backed by
        # `archives_scanned`/`blocks_scanned` is a measurement; a zero with 0/0 is a non-run.
        archives_scanned = 0
        blocks_scanned = 0
        for name, path in sorted(files.items()):
            if not name.startswith("ECL") or path.suffix.upper() != ".DAX":
                continue
            archives_scanned += 1
            blocks: list[dict[str, Any]] = []
            for block in goldbox_corpus.read_dax_blocks(path):
                blocks_scanned += 1
                scanned = scan_block_for_save(block["raw"], address_addend, IN_DUNGEON_LOCATION, word_sets=word_sets)
                if scanned["hits"]:
                    blocks.append({"block_id": block["block_id"], "raw_size": block["raw_size"], **scanned})
            if blocks:
                ecl_files.append({"file": name, "blocks": blocks})
        hit_count = sum(len(block["hits"]) for item in ecl_files for block in item["blocks"])
        games.append({
            "profile_id": profile_id,
            "title": profile["title"],
            "detected": install is not None,
            "hit_count": hit_count,
            "archives_scanned": archives_scanned,
            "blocks_scanned": blocks_scanned,
            "dialect": "short" if word_sets is not GEN1_WORD_SETS else "long",
            "ecl_files": ecl_files,
        })
    return {
        "schema_version": 1,
        "provenance": "decoded-retail-ecl-control-flow",
        "target_location": f"0x{IN_DUNGEON_LOCATION:04x}",
        "target_field": "Area1.inDungeon (offset 0x1cc); source: coab_extracted/engine/ovr008.cs vm_SetMemoryValue + Area1.cs field_6A00_Set",
        "limitations": [
            "Static branch exploration does not prove comparison/input seeds.",
            "A hit proves static reachability of the SAVE opcode from a header entry point, not that the branch is taken with the stated value at runtime.",
            "inDungeon distinguishes DungeonMap-style stepped-grid areas (dungeons AND towns, per the CoAB source) from WildernessMap overland travel; it does not by itself distinguish town from a literal dungeon -- both are inDungeon!=0.",
        ],
        "games": games,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Gen1 Area-Mode (`inDungeon`) ECL Write Candidates",
        "",
        "> Generated by `tools/map_gen1_area_mode_writes.py`. Do not edit by hand.",
        "",
        "Static BFS over each ECL block's decoded control-flow graph (same walker as",
        "`gen1_ecl_encounter_scan.py`) looking for a `SAVE` (opcode `0x09`) instruction whose",
        f"location operand is the literal word `{report['target_location']}` -- {report['target_field']}.",
        "",
        "A zero in this table means something only if the scan actually ran, so the scan is counted",
        "alongside the result. `archives`/`blocks scanned` of 0/0 is a NON-RUN, not a negative --",
        "read it as a bug report about this tool. A zero against non-zero coverage is a measurement.",
        "(The distinction is not hypothetical: a profile-allowlist bug once made four titles print",
        "`0` having never been read, and nothing in the output said so. Fixed 5febedb.)",
        "",
        "| Game | Dialect | Archives scanned | Blocks scanned | ECL files with a hit | Total hits |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    for game in report["games"]:
        lines.append(
            f"| {game['title']} | {game.get('dialect', '?')} | {game.get('archives_scanned', 0)} | "
            f"{game.get('blocks_scanned', 0)} | {len(game['ecl_files'])} | {game['hit_count']} |"
        )
    for game in report["games"]:
        if not game["hit_count"]:
            continue
        lines.extend(["", f"## {game['title']}", ""])
        for item in game["ecl_files"]:
            for block in item["blocks"]:
                for hit in block["hits"]:
                    value_text = str(hit["value"]) if hit["value_kind"] == "immediate" else f"dynamic(c{hit['value_code']}:{hit['value']})"
                    lines.append(
                        f"- `{item['file']}#{block['block_id']}` `{hit['entry']}` -> "
                        f"`SAVE {value_text} -> 0x{IN_DUNGEON_LOCATION:04x}` at vaddr `0x{hit['vaddr']:04x}`; "
                        f"branch decisions: `{'; '.join(hit['branch_decisions']) or 'none (unconditional)'}`."
                    )
    lines.extend(["", "## Verification Boundary", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", action="append", default=[])
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite the report even if this run covers fewer titles than it currently does",
    )
    args = parser.parse_args()
    report = build_report(set(args.profile) or None)
    markdown = render_markdown(report)
    # --profile narrows the scan; DEFAULT_MARKDOWN is a checked-in corpus-wide report. Writing one
    # over the other silently deletes the other titles' sections -- see tools/report_guard.py.
    guard_narrowing_write(args.markdown, markdown, force=args.force, label="the area-mode report")
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(markdown, encoding="utf-8")
    print(f"gen1 area-mode writes: {sum(game['hit_count'] for game in report['games'])}")


if __name__ == "__main__":
    main()
