"""Build the campaign-route target map for the three already-Persistent Gen1 games.

Pure static analysis over the existing generated corpus (`goldbox_corpus`,
`gen1_ecl_encounter_scan`). For Pool of Radiance, Curse of the Azure Bonds, and Secret of
the Silver Blades, this enumerates:

  - the already-proven route (`docs/engine/research/persistent-natural-routes.md` and the
    per-game `*-natural-encounter-route.md`) as the **early anchor**;
  - at least one candidate **middle**-area natural encounter in a different ECL/GEO major
    area (major area = the numeric suffix of `ECLn.DAX`/`GEOn.DAX`), reusing exactly the
    scanner's compare-state-aware CFG walk (`gen1_ecl_encounter_scan.scan_block`) that
    rejected the impossible CoAB `ECL2#1` candidate (see
    `docs/engine/research/coab-natural-encounter-route.md` "Scanner Correction");
  - at least one candidate **ending/late**-area natural encounter in a third area;
  - a GEO/ECL member inventory per game, with a clearly-labelled *heuristic* (not proven)
    wilderness/overland-style ranking by wall-openness, since Gen1 GEO bytes carry no
    explicit area-type tag we have decoded;
  - one candidate cross-area quest-flag reference: a static hit of the anchor's own
    persisted-flag DGROUP word inside a *different* ECL file.

For each middle/ending candidate this derives, from the raw ECL/GEO bytes:
  - the `AND <mask> -> ON_GOTO` selector chain along the scanner's already-chosen CFG path
    (the same mechanism used by the proven anchors' own docs);
  - the resulting GEO cell(s) whose plane-2 descriptor, masked, equals that selector value
    (`descriptor_offset = 514 + y*16 + x`, matching `goldbox_corpus.verify_dax_gen1_route`'s
    `natural_geo_cell_descriptor` check and `packages/engine/src/loaders/geo.ts`'s plane
    layout) -- a candidate is only kept when this match is unique;
  - legal reachability from the browser's own `chooseStart` spawn rule
    (`apps/web/src/ui/explore.ts::chooseStart`) via a directed-edge BFS reproducing
    `packages/engine/src/world/explorer.ts::Explorer.canMove`'s wall/door model. This
    reproduces the already-published anchor paths exactly (Pool 11 steps from (9,2),
    CoAB's literal `E S S E E E ...` 26-step path from (6,6), Secret 17 steps from (4,0)) --
    see the module docstring cross-check in the accompanying research doc.

Every emitted candidate is `route_proven=false` / `runtime_promoted=false`: this only
builds the target map, it does not execute or trace anything.
"""
from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Any

import goldbox_corpus
from report_guard import guard_narrowing_write
from gen1_ecl_encounter_scan import (
    DEFAULT_ADDRESS_ADDEND,
    PROFILE_ADDRESS_ADDENDS,
    build_report as build_encounter_report,
    decode_one,
    header_entries,
    offset_to_vaddr,
    vaddr_to_offset,
)

REPO_ROOT = goldbox_corpus.REPO_ROOT
DEFAULT_JSON = REPO_ROOT / "build/gen1-campaign-route-map.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/gen1-campaign-route-map.md"

DIRS = ("north", "east", "south", "west")
DELTA = {"north": (0, -1), "east": (1, 0), "south": (0, 1), "west": (-1, 0)}
GEO_GRID = 16
GEO_BLOCK_SIZE = 1026

# The three already-Persistent routes (`docs/engine/research/persistent-natural-routes.md`).
# Each anchor cites its own proof doc; this tool re-derives the selector/cell/reachability
# facts from the raw corpus rather than trusting the prose, so a stale doc would surface as
# a strict-mode failure (`anchor_self_check_failed`).
ANCHORS: dict[str, dict[str, Any]] = {
    "pool-of-radiance": {
        "ecl_file": "ECL1.DAX",
        "block_id": 18,
        "combat_vaddr": 0xB1A0,
        "entry": "search_location",
        "persistence_address": 0x4A38,
        "consumed_mask": 2,
        "source_doc": "docs/engine/research/pool-natural-encounter-route.md",
    },
    "curse-of-the-azure-bonds": {
        "ecl_file": "ECL4.DAX",
        "block_id": 37,
        "combat_vaddr": 0x88FE,
        "entry": "search_location",
        "persistence_address": 0x4CF4,
        "consumed_mask": 0x08,
        "source_doc": "docs/engine/research/coab-natural-encounter-route.md",
    },
    "secret-of-the-silver-blades": {
        "ecl_file": "ECL3.DAX",
        "block_id": 97,
        "combat_vaddr": 0x82BB,
        "entry": "search_location",
        "persistence_address": 0x4CCD,
        "consumed_mask": 0x04,
        "source_doc": "docs/engine/research/secret-natural-encounter-route.md",
    },
}

GEN1_PROFILE_IDS = ("pool-of-radiance", "curse-of-the-azure-bonds", "secret-of-the-silver-blades")


# ---------------------------------------------------------------------------
# GEO decode + reachability (ports packages/engine/src/loaders/geo.ts and
# packages/engine/src/world/explorer.ts::canMove/apps/web/src/ui/explore.ts::chooseStart
# to Python for static analysis; no engine code is modified).
# ---------------------------------------------------------------------------


def decode_geo_cells(raw: bytes) -> list[dict[str, Any]] | None:
    if len(raw) != GEO_BLOCK_SIZE:
        return None
    plane0 = raw[2:258]
    plane1 = raw[258:514]
    plane2 = raw[514:770]
    plane3 = raw[770:1026]
    cells: list[dict[str, Any]] = []
    for i in range(GEO_GRID * GEO_GRID):
        p0, p1, d = plane0[i], plane1[i], plane3[i]
        walls = {"north": p0 >> 4, "east": p0 & 0x0F, "south": p1 >> 4, "west": p1 & 0x0F}
        doors = {"north": d & 3, "east": (d >> 2) & 3, "south": (d >> 4) & 3, "west": (d >> 6) & 3}
        cells.append({"x": i % GEO_GRID, "y": i // GEO_GRID, "walls": walls, "doors": doors, "descriptor": plane2[i]})
    return cells


def edge_blocks(cell: dict[str, Any], direction: str) -> bool:
    return cell["walls"][direction] != 0 and cell["doors"].get(direction, 0) == 0


def choose_start(cells: list[dict[str, Any]]) -> tuple[int, int, str]:
    """Reproduces `apps/web/src/ui/explore.ts::chooseStart`: first (row-major y,x) cell with
    the strictly-most open walls; ties keep the first cell found (`>`, not `>=`)."""
    best: tuple[int, int, str] | None = None
    best_open = -1
    for y in range(GEO_GRID):
        for x in range(GEO_GRID):
            cell = cells[y * GEO_GRID + x]
            open_dirs = [d for d in DIRS if cell["walls"][d] == 0]
            if len(open_dirs) > best_open:
                best_open = len(open_dirs)
                best = (x, y, open_dirs[0] if open_dirs else "north")
    return best if best is not None else (0, 0, "north")


def bfs_reachable(cells: list[dict[str, Any]], start_xy: tuple[int, int]) -> dict[tuple[int, int], list[str]]:
    """Directed-edge BFS reproducing `Explorer.canMove` (only the leaving cell's wall/door
    state gates a step -- matches the engine's one-sided-edge tolerance)."""
    visited: dict[tuple[int, int], list[str]] = {start_xy: []}
    queue: deque[tuple[int, int]] = deque([start_xy])
    while queue:
        x, y = queue.popleft()
        cell = cells[y * GEO_GRID + x]
        for direction in DIRS:
            if edge_blocks(cell, direction):
                continue
            dx, dy = DELTA[direction]
            nx, ny = x + dx, y + dy
            if not (0 <= nx < GEO_GRID and 0 <= ny < GEO_GRID):
                continue
            if (nx, ny) in visited:
                continue
            visited[(nx, ny)] = visited[(x, y)] + [direction]
            queue.append((nx, ny))
    return visited


# ---------------------------------------------------------------------------
# Selector-chain decode: find the `AND <mask> -> ON_GOTO` pair along a scanner-chosen
# candidate path and the target index that selects the observed next instruction. Verified
# against all three published anchors (reproduces mask 0x7F/sel 6 for Pool, mask 0x3F/sel 20
# for CoAB, mask 0x3F/sel 3 for Secret -- exactly the values in each proof doc).
# ---------------------------------------------------------------------------


def selector_for_candidate(raw: bytes, candidate: dict[str, Any], addend: int) -> tuple[int | None, int | None]:
    path = candidate["path_offsets"]
    last_mask: int | None = None
    for k, off in enumerate(path):
        ins = decode_one(raw, off)
        if ins is None:
            continue
        if ins.mnemonic == "AND" and len(ins.args) >= 3:
            immediates = [a.word for a in ins.args[:-1] if a.code == 0]
            if immediates:
                last_mask = immediates[0]
        if ins.mnemonic in ("ON_GOTO", "ON_GOSUB") and len(ins.args) >= 2:
            count = ins.args[1].word
            targets = ins.args[2:2 + count]
            next_off = path[k + 1] if k + 1 < len(path) else candidate["combat_offset"]
            for idx, target in enumerate(targets):
                if target.code in (0, 1, 2, 3) and vaddr_to_offset(target.word, addend) == next_off:
                    return last_mask, idx
    return None, None


def geo_matches(cells: list[dict[str, Any]], mask: int, selector: int) -> list[tuple[int, int, int]]:
    return [
        (cell["x"], cell["y"], cell["descriptor"])
        for cell in cells
        if (cell["descriptor"] & mask) == selector
    ]


def roster_summary(roster: list[list[dict[str, Any]]], monster_lookup) -> list[dict[str, Any]]:
    out = []
    for group in roster:
        all_immediate = all(op["kind"] == "immediate" for op in group)
        entry: dict[str, Any] = {
            "all_immediate": all_immediate,
            "operands": group,
        }
        if all_immediate and len(group) == 3:
            monster_id, count, pic_id = group[0]["value"], group[1]["value"], group[2]["value"]
            entry["monster_id"] = monster_id
            entry["count"] = count
            entry["picture_block_id"] = pic_id
            entry["monster_name"] = monster_lookup(monster_id)
        out.append(entry)
    return out


def area_number(file_name: str) -> int:
    """Numeric area suffix of an `ECLn.DAX`/`GEOn.DAX` member name (letters-then-digits-then-.DAX)."""
    stem = file_name.replace(".DAX", "")
    digits = "".join(ch for ch in stem if ch.isdigit())
    return int(digits)


def make_monster_lookup(files: dict[str, Path]):
    cache: dict[str, dict[int, str] | None] = {}

    def load(archive_name: str) -> dict[int, str] | None:
        if archive_name in cache:
            return cache[archive_name]
        path = files.get(archive_name)
        if path is None or not path.exists():
            cache[archive_name] = None
            return None
        table = {b["block_id"]: goldbox_corpus.decode_record_name(b["raw"]) for b in goldbox_corpus.read_dax_blocks(path)}
        cache[archive_name] = table
        return table

    def lookup(area_n: int, monster_id: int) -> str:
        primary = load(f"MON{area_n}CHA.DAX")
        if primary is not None and monster_id in primary:
            return primary[monster_id]
        fallback = load("MON1CHA.DAX")
        if fallback is not None and monster_id in fallback:
            return f"{fallback[monster_id]} (MON1CHA.DAX fallback -- MON{area_n}CHA.DAX absent/unmatched)"
        return "UNKNOWN"

    return lookup


def resolve_candidate(
    profile_id: str,
    addend: int,
    ecl_file: str,
    ecl_raw_by_block: dict[int, bytes],
    geo_raw_by_block: dict[int, bytes],
    candidate: dict[str, Any],
    monster_lookup,
) -> dict[str, Any] | None:
    """Returns a fully-decoded candidate record, or None if the selector/cell/reachability
    chain doesn't resolve to a unique, reachable GEO cell (rejected, not invented)."""
    block_id = candidate["_block_id"]
    ecl_raw = ecl_raw_by_block[block_id]
    geo_raw = geo_raw_by_block.get(block_id)
    if geo_raw is None:
        return None
    mask, selector = selector_for_candidate(ecl_raw, candidate, addend)
    if mask is None or selector is None:
        return None
    cells = decode_geo_cells(geo_raw)
    if cells is None:
        return None
    matches = geo_matches(cells, mask, selector)
    if len(matches) != 1:
        return None
    cx, cy, descriptor = matches[0]
    start_x, start_y, start_facing = choose_start(cells)
    reach = bfs_reachable(cells, (start_x, start_y))
    path = reach.get((cx, cy))
    if path is None:
        return None
    area_n = area_number(ecl_file)
    combat_offset = candidate["combat_offset"]
    resume_offset = combat_offset + 1
    resume_vaddr = offset_to_vaddr(resume_offset, addend)
    entry_offset = next(
        (off for name, off in header_entries(ecl_raw, addend) if name == candidate["entry"]),
        None,
    )
    return {
        "ecl_archive_member": f"{ecl_file}#{block_id}",
        "geo_archive_member": f"GEO{area_n}.DAX#{block_id}",
        "major_area": area_n,
        "entry": candidate["entry"],
        "search_location_vaddr": f"0x{offset_to_vaddr(entry_offset, addend):04x}" if entry_offset is not None else None,
        "selector": {"and_mask": f"0x{mask:02x}", "selector_value": selector},
        "geo_cell": {"x": cx, "y": cy, "descriptor": descriptor, "unique_match": True},
        "roster": roster_summary(candidate["roster"], lambda mid: monster_lookup(area_n, mid)),
        "combat_vaddr": f"0x{candidate['combat_vaddr']:04x}",
        "resume_vaddr": f"0x{resume_vaddr:04x}",
        "requires_runtime_seed": candidate["requires_runtime_seed"],
        "reachability": {
            "spawn": {"x": start_x, "y": start_y, "facing": start_facing},
            "steps": len(path),
            "directions": path,
            "argument": (
                f"Reachable in {len(path)} legal directed-edge steps from chooseStart spawn "
                f"({start_x},{start_y}) facing {start_facing}: {' '.join(path) if path else '(spawn cell)'}."
            ),
        },
        "route_proven": False,
        "runtime_promoted": False,
    }


def candidate_rank(candidate: dict[str, Any]) -> tuple[int, int, int]:
    all_immediate = all(entry["all_immediate"] for entry in candidate["roster"])
    dynamic_ops = sum(
        1 for entry in candidate["roster"] for op in entry["operands"] if op["kind"] != "immediate"
    )
    return (0 if all_immediate else 1, dynamic_ops, int(candidate["combat_vaddr"], 16))


def build_game_candidates(profile_id: str, install, files: dict[str, Path]) -> dict[str, Any]:
    addend = PROFILE_ADDRESS_ADDENDS.get(profile_id, DEFAULT_ADDRESS_ADDEND)
    anchor_meta = ANCHORS[profile_id]
    anchor_area = area_number(anchor_meta["ecl_file"])
    monster_lookup = make_monster_lookup(files)

    scan = build_encounter_report({profile_id})["games"][0]

    resolved_by_area: dict[int, list[dict[str, Any]]] = {}
    anchor_resolved: dict[str, Any] | None = None

    for item in scan["ecl_files"]:
        ecl_file = item["file"]
        area_n = area_number(ecl_file)
        ecl_raw_by_block = {b["block_id"]: b["raw"] for b in goldbox_corpus.read_dax_blocks(files[ecl_file])}
        geo_name = f"GEO{area_n}.DAX"
        geo_path = files.get(geo_name)
        geo_raw_by_block = (
            {b["block_id"]: b["raw"] for b in goldbox_corpus.read_dax_blocks(geo_path)} if geo_path else {}
        )
        for block in item["blocks"]:
            for candidate in block["candidates"]:
                if candidate["entry"] != "search_location" or not candidate["roster"]:
                    continue
                candidate = {**candidate, "_block_id": block["block_id"]}
                resolved = resolve_candidate(
                    profile_id, addend, ecl_file, ecl_raw_by_block, geo_raw_by_block, candidate, monster_lookup
                )
                if resolved is None:
                    continue
                is_anchor = (
                    ecl_file == anchor_meta["ecl_file"]
                    and block["block_id"] == anchor_meta["block_id"]
                    and candidate["combat_vaddr"] == anchor_meta["combat_vaddr"]
                )
                if is_anchor:
                    if anchor_resolved is None or candidate_rank(resolved) < candidate_rank(anchor_resolved):
                        anchor_resolved = resolved
                    continue
                resolved_by_area.setdefault(area_n, []).append(resolved)

    for area_n in resolved_by_area:
        resolved_by_area[area_n].sort(key=candidate_rank)

    other_areas = sorted(n for n in resolved_by_area if n != anchor_area)
    middle_area = other_areas[0] if other_areas else None
    ending_area = other_areas[-1] if len(other_areas) > 1 else None

    middle_candidate = resolved_by_area[middle_area][0] if middle_area is not None else None
    ending_candidate = resolved_by_area[ending_area][0] if ending_area is not None else None

    return {
        "ecl_address_addend": f"0x{addend:04x}",
        "anchor_source_doc": anchor_meta["source_doc"],
        "early_anchor": {
            **(anchor_resolved or {}),
            "persistence": {
                "memory_address": f"0x{anchor_meta['persistence_address']:04x}",
                "consumed_mask": f"0x{anchor_meta['consumed_mask']:02x}",
            },
            "route_proven": anchor_resolved is not None,
            "runtime_promoted": False,
            "note": "Greybox-persistent (packages/engine/test/saveGame.test.ts); NOT an original-DOS CS:IP trace.",
        }
        if anchor_resolved is not None
        else {
            "route_proven": False,
            "runtime_promoted": False,
            "error": "anchor_self_check_failed: static re-derivation did not reproduce the published anchor",
        },
        "middle_area_candidate": middle_candidate,
        "ending_area_candidate": ending_candidate,
        "other_area_candidate_counts": {str(n): len(v) for n, v in sorted(resolved_by_area.items())},
        "area_label_convention": (
            "Labels are assigned by ascending ECLn.DAX area-file number among the two "
            "additional resolved areas (lowest -> middle, highest -> ending/late); this is "
            "file-numbering order, not a proven in-game narrative/geographic progression."
        ),
    }


def wilderness_town_inventory(profile_id: str, files: dict[str, Path]) -> dict[str, Any]:
    members: list[dict[str, Any]] = []
    for name in sorted(files):
        if not name.startswith("GEO") or not name.endswith(".DAX"):
            continue
        area_n = area_number(name)
        for block in goldbox_corpus.read_dax_blocks(files[name]):
            cells = decode_geo_cells(block["raw"])
            if cells is None:
                continue
            open_edges = sum(1 for cell in cells for d in DIRS if cell["walls"][d] == 0)
            openness = open_edges / (len(cells) * 4)
            members.append(
                {
                    "geo_archive_member": f"{name}#{block['block_id']}",
                    "major_area": area_n,
                    "raw_size": block["raw_size"],
                    "wall_openness": round(openness, 4),
                }
            )
    members.sort(key=lambda m: (-m["wall_openness"], m["geo_archive_member"]))
    return {
        "member_count": len(members),
        "members": members,
        "wilderness_overland_heuristic_candidates": members[:3],
        "town_candidates": "UNKNOWN -- no static GEO/ECL area-type tag is decoded yet for Gen1; "
        "classifying town vs. dungeon vs. wilderness needs ECL opcode-level RE "
        "(e.g. which LOAD_FILES/tileset calls select WILDCOM.DAX/DUNGCOM.DAX per area), "
        "not attempted in this pass.",
        "heuristic_caveat": (
            "wall_openness (fraction of the 16x16 grid's 1024 wall edges that are open) is an "
            "UNVERIFIED heuristic proxy for outdoor/overland style, not a proven classification. "
            "WILDCOM.DAX and DUNGCOM.DAX both exist in this game's archive set, confirming the "
            "engine supports a distinct wilderness rendering mode, but which GEO members use it "
            "is not mapped here."
        ),
    }


def cross_area_quest_flag_candidate(profile_id: str, files: dict[str, Path], addend: int) -> dict[str, Any]:
    anchor_meta = ANCHORS[profile_id]
    anchor_ecl = anchor_meta["ecl_file"]
    target_word = anchor_meta["persistence_address"]
    hits: list[dict[str, Any]] = []
    for name in sorted(files):
        if not name.startswith("ECL") or not name.endswith(".DAX") or name == anchor_ecl:
            continue
        for block in goldbox_corpus.read_dax_blocks(files[name]):
            raw = block["raw"]
            offset = 22
            while offset < len(raw):
                ins = decode_one(raw, offset)
                if ins is None:
                    offset += 1
                    continue
                for arg in ins.args:
                    if arg.code in (1, 2, 3) and arg.word == target_word:
                        hits.append(
                            {
                                "ecl_archive_member": f"{name}#{block['block_id']}",
                                "major_area": area_number(name),
                                "instruction_offset_vaddr": f"0x{offset_to_vaddr(offset, addend):04x}",
                                "mnemonic": ins.mnemonic,
                            }
                        )
                offset += ins.size
    hits.sort(key=lambda h: (h["ecl_archive_member"], h["instruction_offset_vaddr"]))
    return {
        "anchor_persisted_word": f"0x{target_word:04x}",
        "anchor_ecl_file": anchor_ecl,
        "cross_area_static_references": hits[:10],
        "candidate_present": bool(hits),
        "note": (
            "A static instruction operand elsewhere in the corpus reading/writing the anchor's "
            "own consumed-encounter DGROUP word, found outside the anchor's own ECL file. This "
            "is a byte-located reference, not proof that the two areas share game-state meaning "
            "at that address (Gen1 DGROUP words can be reused for unrelated per-area locals -- "
            "see docs/engine/research/gen1-dosbox-runtime-trace.md); route_proven=false."
            if hits
            else "No static cross-file operand reference to the anchor's own persisted flag word "
            "was found in this pass; UNKNOWN whether any other area reads it. Not fabricated."
        ),
    }


def build_report(profile_ids: set[str] | None = None) -> dict[str, Any]:
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    games: list[dict[str, Any]] = []
    for profile_id in GEN1_PROFILE_IDS:
        if profile_ids and profile_id not in profile_ids:
            continue
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        files = goldbox_corpus.file_index(install)
        title = next(p["title"] for p in goldbox_corpus.PROFILES if p["id"] == profile_id)
        anchor_ecl_file = ANCHORS[profile_id]["ecl_file"]
        if install is None or anchor_ecl_file not in files:
            games.append({"profile_id": profile_id, "title": title, "detected": False})
            continue
        addend = PROFILE_ADDRESS_ADDENDS.get(profile_id, DEFAULT_ADDRESS_ADDEND)
        candidates = build_game_candidates(profile_id, install, files)
        games.append(
            {
                "profile_id": profile_id,
                "title": title,
                "detected": True,
                **candidates,
                "town_wilderness_inventory": wilderness_town_inventory(profile_id, files),
                "cross_area_quest_flag_candidate": cross_area_quest_flag_candidate(profile_id, files, addend),
            }
        )
    return {
        "schema_version": 1,
        "provenance": "static-corpus-analysis-only",
        "generated_by": "tools/build_gen1_campaign_route_map.py",
        "limitations": [
            "This tool proves nothing new: it re-derives selector/cell/reachability facts "
            "already established for the three early anchors, and applies the identical "
            "method to additional ECL/GEO areas without a DOS runtime or manual save.",
            "Every middle/ending candidate is route_proven=false and runtime_promoted=false.",
            "Town/wilderness classification is an unverified heuristic (wall_openness only).",
            "Cross-area quest-flag candidates are byte-located operand hits, not proven "
            "shared game-state semantics.",
        ],
        "games": games,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Gen1 Campaign Route Target Map",
        "",
        "> Generated by `tools/build_gen1_campaign_route_map.py`. Do not edit by hand.",
        "",
        "Static target map for `BUILD-QUEUE.md` item 6's first leaf: for each of the three",
        "already-Persistent Gen1 games, the proven early-anchor route plus candidate middle-",
        "and ending/late-area natural encounters in distinct `ECLn.DAX`/`GEOn.DAX` major",
        "areas, an area/town/wilderness member inventory, and one candidate cross-area",
        "quest-flag reference. Every middle/ending candidate is `route_proven=false` /",
        "`runtime_promoted=false` -- this step only builds the target map.",
        "",
    ]
    for game in report["games"]:
        lines.append(f"## {game['title']}")
        lines.append("")
        if not game.get("detected"):
            lines.append("- Not detected in the local install roots.")
            lines.append("")
            continue
        lines.append(f"- ECL address addend: `{game['ecl_address_addend']}`")
        lines.append(f"- Anchor source: `{game['anchor_source_doc']}`")
        lines.append("")
        lines.append("| Slot | Area | ECL member | GEO cell | Combat | Resume | Roster | Reachability |")
        lines.append("| --- | ---: | --- | --- | --- | --- | --- | --- |")
        for slot_name, key in (("Early (proven)", "early_anchor"), ("Middle (candidate)", "middle_area_candidate"), ("Ending/late (candidate)", "ending_area_candidate")):
            entry = game.get(key)
            if not entry or not entry.get("ecl_archive_member"):
                lines.append(f"| {slot_name} | - | - | - | - | - | - | not resolved |")
                continue
            cell = entry["geo_cell"]
            roster = "; ".join(
                r.get("monster_name", "?") + f" x{r.get('count', '?')}" if r.get("all_immediate") else "dynamic"
                for r in entry["roster"]
            )
            lines.append(
                f"| {slot_name} | {entry['major_area']} | `{entry['ecl_archive_member']}` | "
                f"`({cell['x']},{cell['y']})` desc `0x{cell['descriptor']:02x}` | `{entry['combat_vaddr']}` | "
                f"`{entry['resume_vaddr']}` | {roster} | {entry['reachability']['steps']} steps |"
            )
        lines.append("")
        for slot_name, key in (("Middle", "middle_area_candidate"), ("Ending/late", "ending_area_candidate")):
            entry = game.get(key)
            if entry:
                lines.append(f"- **{slot_name} reachability:** {entry['reachability']['argument']}")
        lines.append(f"- {game['area_label_convention']}")
        lines.append("")
        wt = game["town_wilderness_inventory"]
        lines.append(f"- GEO members inventoried: {wt['member_count']}")
        lines.append(f"- Town candidates: {wt['town_candidates']}")
        lines.append("- Wilderness/overland heuristic top-3 (by wall-openness, unverified):")
        for m in wt["wilderness_overland_heuristic_candidates"]:
            lines.append(f"  - `{m['geo_archive_member']}` openness `{m['wall_openness']}`")
        lines.append(f"  ({wt['heuristic_caveat']})")
        lines.append("")
        cq = game["cross_area_quest_flag_candidate"]
        lines.append(f"- Cross-area quest-flag candidate for `{cq['anchor_persisted_word']}` "
                      f"(set by `{cq['anchor_ecl_file']}`): {cq['note']}")
        if cq["cross_area_static_references"]:
            for hit in cq["cross_area_static_references"][:5]:
                lines.append(f"  - `{hit['ecl_archive_member']}` `{hit['instruction_offset_vaddr']}` `{hit['mnemonic']}`")
        lines.append("")
    lines.extend(["## Verification Boundary", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", action="append", default=[])
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite the report even if this run covers fewer titles than it currently does",
    )
    args = parser.parse_args()
    report = build_report(set(args.profile) or None)
    markdown = render_markdown(report)
    # See tools/report_guard.py: --profile narrows the scan, DEFAULT_MARKDOWN is corpus-wide.
    guard_narrowing_write(args.markdown, markdown, force=args.force, label="the campaign route map")
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    args.markdown.write_text(markdown, encoding="utf-8")
    if args.strict:
        failures: list[str] = []
        for game in report["games"]:
            if not game.get("detected"):
                failures.append(f"{game['profile_id']}: not detected")
                continue
            anchor = game["early_anchor"]
            if not anchor.get("route_proven"):
                failures.append(f"{game['profile_id']}: anchor_self_check_failed")
            if game.get("middle_area_candidate") is None:
                failures.append(f"{game['profile_id']}: no middle-area candidate resolved")
            if game.get("ending_area_candidate") is None:
                failures.append(f"{game['profile_id']}: no ending-area candidate resolved")
            for key in ("middle_area_candidate", "ending_area_candidate"):
                cand = game.get(key)
                if cand is not None and (cand.get("route_proven") or cand.get("runtime_promoted")):
                    failures.append(f"{game['profile_id']}: {key} incorrectly marked proven/promoted")
            # No-address-base-bleed cross-check: this game's own addend/persistence address
            # must not equal another game's, and the anchor/candidates must have used this
            # game's own addend consistently.
            own_addend = game["ecl_address_addend"]
            own_persist = ANCHORS[game["profile_id"]]["persistence_address"]
            for other_id, other_meta in ANCHORS.items():
                if other_id == game["profile_id"]:
                    continue
                other_addend = f"0x{PROFILE_ADDRESS_ADDENDS.get(other_id, DEFAULT_ADDRESS_ADDEND):04x}"
                if own_addend == other_addend and own_addend != f"0x{DEFAULT_ADDRESS_ADDEND:04x}":
                    failures.append(f"{game['profile_id']}: address_addend collides with {other_id}")
                if own_persist == other_meta["persistence_address"]:
                    failures.append(f"{game['profile_id']}: persistence_address collides with {other_id}")
        if failures:
            raise SystemExit("strict failure: " + "; ".join(failures))
    resolved = sum(
        1
        for game in report["games"]
        if game.get("detected")
        for key in ("middle_area_candidate", "ending_area_candidate")
        if game.get(key)
    )
    print(f"gen1 campaign route map: {len(report['games'])} games, {resolved} middle/ending candidates resolved")


if __name__ == "__main__":
    main()
