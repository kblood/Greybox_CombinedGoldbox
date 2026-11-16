#!/usr/bin/env python3
"""Trace Gateway's save-free new-game ECL dispatch chain toward `ECL5.DAX#19` (P3.3).

`docs/engine/research/gateway-ecl5-19-runtime-route.md` proved the FIGHT/LEAVE -> COMBAT
route inside `ECL5.DAX` block 19 down to raw opcode bytes, and separately proved (two
file-I/O-trace reproductions) that `ECL5.DAX` is never *opened* during a silent, zero-
keypress DOSBox-X boot -- the game idles in a title/attract loop instead. That leaves two
ways to reach the encounter without inventing input: a save file (confirmed genuinely
unavailable, `gateway-save-acquisition.md`), or a save-free static front-end/character-
creation dispatch chain proven by decoded control flow alone, which this module builds.

Two things have to be established, both without raw opcode-byte scanning:

1. **What ECL block does Gateway's own new-game boot actually start at?** This is native
   x86 code, not ECL bytecode -- CoAB's own decompile (`coab_extracted/engine/seg001.cs
   sub_29758`, CoAB oracle symbol `sub_29758`) hardcodes `gbl.EclBlockId = 1` for a non-
   demo boot and `gbl.EclBlockId = 0x52` (82) for a demo boot, both as plain `mov byte ptr
   [mem], imm8` writes to the same host location a few instructions apart. Gateway shares
   this engine skeleton (`gen1-fbov-vga` family); `map_gateway_ecl_runtime_candidates.py`'s
   structural CoAB-oracle matcher (`function_shapes`/`best_match`) locates Gateway's own
   compiled counterpart of `sub_29758` by control-flow shape, then this module locates the
   *same* pair of immediate byte-writes inside it by matching the CoAB oracle's own
   demo/new-game *value pair* (82, 1) against every `mov byte ptr [addr], imm8` write-group
   in the Gateway candidate -- not by hardcoding a byte offset, so a title with extra/fewer
   prologue instructions still resolves correctly as long as the write-value pair is
   distinctive (verified true for Gateway: three other write-groups exist in the matched
   function, with value sequences `(1,1,1)`, `(0,1)`, `(1,0)` -- none collide with `(82,1)`).
   Separately, `coab_extracted/engine/seg001.cs PROGRAM()` hardcodes `gbl.game_area = 2` for
   the non-demo path (vs. `gbl.game_area = 1` for demo) -- this assignment runs *before*
   `sub_29758`/ECL block selection and is shared resident (`GAME.EXE`) code across the whole
   `gen1-fbov*` family, not overlay code specific to one title, so it is not independently
   re-derived per title here; Gateway's own `ECL2.DAX` containing both block `1` (new-game)
   and block `82` (demo) is consistent corroboration (both live in the same numbered
   archive, as the shared `game_area=2` assignment for both would imply -- CoAB itself
   splits demo/new-game across areas 1/2, so this is family-shared *logic*, not a family-
   shared *constant*).

2. **From that start block, does any statically reachable `NEWECL` (opcode `0x20`) chain,
   through any number of cross-archive hops, land on `(game_area=5, ECL block 19)`?**
   `gen1_ecl_encounter_scan.py`'s own module docstring says plainly: "Cross-ECL NEWECL
   transitions are not followed in this pass." This module adds that capability: a BFS scan
   (modeled on `map_gen1_area_mode_writes.scan_block_for_save`'s SAVE-tracking pattern) that
   walks each ECL block's decoded control-flow graph, tracks the last immediate value
   written by `SAVE` (opcode `0x09`) to the `game_area` host location (`0x7F12`, per
   `docs/engine/adr/0009-cross-archive-ecl-area-switching.md`), and records every statically
   reachable `NEWECL` instruction's target block together with the `game_area` in effect at
   that point (or, if never (re)written on that path, the current archive's own numeral --
   `NEWECL` without a preceding `game_area` write stays in the same numbered archive). This
   is run across every block of every `ECL*.DAX` archive in the retail install, producing a
   directed graph; a second BFS finds the shortest path (if any) from the proven start node
   to the target node.

A hit here proves *static reachability* of the same kind `gen1_ecl_encounter_scan.py`
already accepts for in-archive COMBAT paths -- not a runtime replay. Any dynamic (non-
immediate) COMPARE guard on the path is left fully nondeterministic (`ALL_COMPARE_OUTCOMES`,
imported unchanged from `gen1_ecl_encounter_scan`), so a route through such a guard is not
proof the guard's *default* boot-time value takes that branch; that residual gap is reported
explicitly per branch, not smoothed over. This module does not run DOSBox-X, does not wire
anything into the browser engine, and does not promote a Route -- it only answers the static
reachability question the P3.3 leaf asked for.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import deque
from pathlib import Path
from typing import Any

import capstone

import goldbox_corpus
from gen1_ecl_encounter_scan import (
    ALL_COMPARE_OUTCOMES,
    DEFAULT_ADDRESS_ADDEND,
    ECL_HEADER_LEN,
    decode_one,
    header_entries,
    offset_to_vaddr,
    successors,
)
from map_gateway_ecl_runtime_candidates import DEFAULT_COAB, DEFAULT_GATEWAY, best_match, function_shapes
from map_pool_ecl_dispatch import disassemble_shape, oracle_offset

REPO_ROOT = goldbox_corpus.REPO_ROOT
DEFAULT_JSON = REPO_ROOT / "build/gateway-newgame-route.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/gateway-newgame-route.generated.md"
DEFAULT_ORACLE = REPO_ROOT / "build" / "coab-oracle-map.json"
PROFILE_ID = "gateway-to-the-savage-frontier"

EXPECTED_HASHES = {
    "gateway_loader": "0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00",
    "gateway_overlay": "c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd",
}
BOOT_DISPATCH_SYMBOL = "sub_29758"
# coab_extracted/engine/seg001.cs sub_29758(): `gbl.EclBlockId = 0x52` (demo) then, on the
# non-demo path, `gbl.EclBlockId = 1` -- the two-write value sequence identifying the target
# byte among sub_29758's several unrelated `mov byte ptr [mem], imm8` writes.
COAB_BOOT_DISPATCH_VALUES = (0x52, 1)
NON_DEMO_GAME_AREA = 2  # coab_extracted/engine/seg001.cs PROGRAM(); shared resident (GAME.EXE) code, not re-derived here.
GAME_AREA_LOCATION = 0x7F12
SAVE_OPCODE = 0x09
NEWECL_OPCODE = 0x20
TARGET_FILE = "ECL5.DAX"
TARGET_BLOCK = 19


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Part 1: boot dispatch constants (native x86, structural CoAB-oracle match)
# ---------------------------------------------------------------------------


def disassemble_full(data: bytes, offset: int, max_size: int = 1024) -> list[Any]:
    """Full capstone instruction stream from `offset` to the first ret (inclusive)."""
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    instrs: list[Any] = []
    for ins in md.disasm(data[offset:offset + max_size], offset):
        instrs.append(ins)
        if ins.mnemonic.lower() in {"ret", "retf", "iret"}:
            break
    return instrs


def mem_imm8_write_groups(instrs: list[Any]) -> dict[str, list[tuple[int, int, int]]]:
    """Group `mov byte ptr [addr], imm8` instructions by target address text.

    Each group's value list is `(instruction_index, instruction_address, immediate_value)`,
    in program order -- the shape needed to match a known oracle value *sequence* (e.g.
    demo-then-new-game) against a candidate function without assuming a fixed byte offset.
    """
    groups: dict[str, list[tuple[int, int, int]]] = {}
    for index, ins in enumerate(instrs):
        if ins.mnemonic.lower() != "mov" or len(ins.operands) != 2:
            continue
        dst, src = ins.operands
        if dst.type != capstone.x86.X86_OP_MEM or src.type != capstone.x86.X86_OP_IMM or dst.size != 1:
            continue
        mem_text = ins.op_str.split(",")[0].strip()
        groups.setdefault(mem_text, []).append((index, ins.address, src.imm))
    return groups


def boot_dispatch_constants(gateway_overlay: bytes, coab_overlay: bytes, oracle: dict[str, Any]) -> dict[str, Any]:
    coab_offset = oracle_offset(oracle, BOOT_DISPATCH_SYMBOL)
    coab_instrs = disassemble_full(coab_overlay, coab_offset)
    coab_groups = mem_imm8_write_groups(coab_instrs)
    coab_matching = [(mem, group) for mem, group in coab_groups.items() if tuple(v for _, _, v in group) == COAB_BOOT_DISPATCH_VALUES]
    if len(coab_matching) != 1:
        raise ValueError(
            f"expected exactly one CoAB byte-write group with value sequence {COAB_BOOT_DISPATCH_VALUES} "
            f"in {BOOT_DISPATCH_SYMBOL}, found {len(coab_matching)} (candidates: {sorted(coab_groups)})"
        )
    coab_target, coab_writes = coab_matching[0]
    coab_values = tuple(value for _, _, value in coab_writes)

    coab_shape = disassemble_shape(coab_overlay, coab_offset)
    if coab_shape is None:
        raise ValueError(f"failed to disassemble CoAB oracle shape for {BOOT_DISPATCH_SYMBOL}")
    candidates = function_shapes(gateway_overlay)
    gateway_shape, ratio, jaccard = best_match(coab_shape, candidates)
    gateway_instrs = disassemble_full(gateway_overlay, gateway_shape.offset)
    gateway_groups = mem_imm8_write_groups(gateway_instrs)

    matching = [(mem, group) for mem, group in gateway_groups.items() if tuple(v for _, _, v in group) == coab_values]
    return {
        "coab_function_offset": coab_offset,
        "coab_target_address": coab_target,
        "coab_value_sequence": list(coab_values),
        "coab_demo_ecl_block_id": coab_values[0],
        "coab_newgame_ecl_block_id": coab_values[1],
        "gateway_function_offset": gateway_shape.offset,
        "gateway_function_size": gateway_shape.size,
        "structural_match_ratio": ratio,
        "structural_match_jaccard": jaccard,
        "gateway_candidate_group_count": len(gateway_groups),
        "gateway_ambiguous_matches": len(matching) != 1,
        "gateway_target_address": matching[0][0] if len(matching) == 1 else None,
        "gateway_demo_ecl_block_id": matching[0][1][0][2] if len(matching) == 1 else None,
        "gateway_newgame_ecl_block_id": matching[0][1][1][2] if len(matching) == 1 else None,
        "gateway_demo_instruction_offset": matching[0][1][0][1] if len(matching) == 1 else None,
        "gateway_newgame_instruction_offset": matching[0][1][1][1] if len(matching) == 1 else None,
        "resolved": len(matching) == 1,
    }


# ---------------------------------------------------------------------------
# Part 2: cross-archive NEWECL/game_area BFS graph over the ECL corpus
# ---------------------------------------------------------------------------


def scan_block_for_newecl(raw: bytes, address_addend: int, max_states: int = 80000) -> dict[str, Any]:
    hits_by_key: dict[tuple[int, str, int, int, tuple], dict[str, Any]] = {}
    states_seen: set[tuple[str, int, tuple[int, ...], tuple[int, ...], Any]] = set()
    queue: list[tuple[str, int, tuple[int, ...], tuple[int, ...], tuple[str, ...], tuple[int, ...], Any]] = []
    for entry_name, offset in header_entries(raw, address_addend):
        queue.append((entry_name, offset, (), (), (), ALL_COMPARE_OUTCOMES, None))

    states = 0
    head = 0
    while head < len(queue) and states < max_states:
        entry_name, offset, stack, path, decisions, compare_outcomes, game_area = queue[head]
        head += 1
        state_key = (entry_name, offset, stack[-8:], compare_outcomes, game_area)
        if state_key in states_seen:
            continue
        states_seen.add(state_key)
        states += 1
        ins = decode_one(raw, offset)
        if ins is None:
            continue
        next_path = (path + (offset,))[-96:]

        next_game_area = game_area
        if ins.opcode == SAVE_OPCODE and len(ins.args) >= 2 and ins.args[1].word == GAME_AREA_LOCATION:
            value_arg = ins.args[0]
            # `value` is only meaningful for the "immediate" kind; a dynamic write's true
            # value depends on host memory state at runtime and is not statically known, so
            # `value` stays None for it (the operand's raw code/word are kept for provenance).
            if value_arg.code == 0:
                next_game_area = ("immediate", value_arg.word, value_arg.code, value_arg.word)
            else:
                next_game_area = ("dynamic", None, value_arg.code, value_arg.word)

        if ins.opcode == NEWECL_OPCODE and ins.args:
            block_arg = ins.args[0]
            area_kind = next_game_area[0] if next_game_area else "unset"
            area_value = next_game_area[1] if next_game_area else None
            hit_key = (offset, entry_name, block_arg.code, block_arg.word, next_game_area)
            if hit_key not in hits_by_key:
                hits_by_key[hit_key] = {
                    "entry": entry_name,
                    "offset": offset,
                    "vaddr": offset_to_vaddr(offset, address_addend),
                    "target_block_kind": "immediate" if block_arg.code == 0 else "dynamic",
                    "target_block": block_arg.word,
                    "game_area_kind": area_kind,
                    "game_area": area_value,
                    "game_area_operand_code": next_game_area[2] if next_game_area else None,
                    "game_area_operand_word": next_game_area[3] if next_game_area else None,
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
                queue.append((entry_name, target, target_stack, next_path, next_decisions, target_outcomes, next_game_area))

    hits = sorted(hits_by_key.values(), key=lambda h: (h["offset"], h["entry"]))
    return {
        "address_addend": address_addend,
        "header_entries": [{"name": name, "offset": offset, "vaddr": offset_to_vaddr(offset, address_addend)} for name, offset in header_entries(raw, address_addend)],
        "explored_states": states,
        "state_limit_reached": head < len(queue),
        "hits": hits,
    }


def area_number_from_file(name: str) -> int | None:
    stem = name.upper()
    if not stem.startswith("ECL") or not stem.endswith(".DAX"):
        return None
    digits = stem[len("ECL"):-len(".DAX")]
    return int(digits) if digits.isdigit() else None


def build_newecl_graph(files: dict[str, Path]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    for name, path in sorted(files.items()):
        if not name.upper().startswith("ECL") or path.suffix.upper() != ".DAX":
            continue
        own_area = area_number_from_file(name)
        for block in goldbox_corpus.read_dax_blocks(path):
            scanned = scan_block_for_newecl(block["raw"], DEFAULT_ADDRESS_ADDEND)
            node_key = f"{name}#{block['block_id']}"
            nodes[node_key] = {
                "file": name,
                "block_id": block["block_id"],
                "own_area": own_area,
                "header_entries": scanned["header_entries"],
            }
            for hit in scanned["hits"]:
                if hit["game_area_kind"] == "immediate":
                    resolved_area = hit["game_area"]
                elif hit["game_area_kind"] == "unset":
                    resolved_area = own_area
                else:
                    resolved_area = None  # dynamic game_area write on this path: not statically resolvable
                to_file = f"ECL{resolved_area}.DAX" if resolved_area is not None else None
                resolved = to_file is not None and hit["target_block_kind"] == "immediate"
                edges.append({
                    "from": node_key,
                    "to_file": to_file,
                    "to_block": hit["target_block"] if hit["target_block_kind"] == "immediate" else None,
                    "resolved": resolved,
                    **hit,
                })
    return {"nodes": nodes, "edges": edges}


def bfs_route(graph: dict[str, Any], start_node: str, target_file: str, target_block: int) -> list[dict[str, Any]] | None:
    adjacency: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for edge in graph["edges"]:
        if not edge["resolved"]:
            continue
        to_key = f"{edge['to_file']}#{edge['to_block']}"
        adjacency.setdefault(edge["from"], []).append((to_key, edge))

    target_key = f"{target_file}#{target_block}"
    if start_node not in graph["nodes"]:
        return None
    visited = {start_node}
    queue: deque[tuple[str, list[dict[str, Any]]]] = deque([(start_node, [])])
    while queue:
        node, path = queue.popleft()
        if node == target_key:
            return path
        for to_key, edge in adjacency.get(node, []):
            if to_key in visited:
                continue
            visited.add(to_key)
            queue.append((to_key, path + [edge]))
    return None


# ---------------------------------------------------------------------------
# Report assembly
# ---------------------------------------------------------------------------


def build_report(gateway: Path = DEFAULT_GATEWAY, coab: Path = DEFAULT_COAB, oracle_path: Path = DEFAULT_ORACLE) -> dict[str, Any]:
    gateway_loader = (gateway / "GAME.EXE").read_bytes()
    gateway_overlay = (gateway / "GAME.OVR").read_bytes()
    coab_overlay = (coab / "GAME.OVR").read_bytes()
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))

    dispatch = boot_dispatch_constants(gateway_overlay, coab_overlay, oracle)

    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    install = goldbox_corpus.choose_install(inventory, PROFILE_ID, routes.get(PROFILE_ID))
    detected = install is not None
    files = goldbox_corpus.file_index(install) if detected else {}

    graph = build_newecl_graph(files) if detected else {"nodes": {}, "edges": []}

    start_node = None
    route = None
    if detected and dispatch["resolved"]:
        start_node = f"ECL{NON_DEMO_GAME_AREA}.DAX#{dispatch['gateway_newgame_ecl_block_id']}"
        route = bfs_route(graph, start_node, TARGET_FILE, TARGET_BLOCK)

    return {
        "schema_version": 1,
        "profile_id": PROFILE_ID,
        "provenance": "structural-coab-oracle-match + decoded-retail-ecl-control-flow",
        "sources": {
            "gateway_loader": {"path": str(gateway / "GAME.EXE"), "sha256": sha256(gateway_loader)},
            "gateway_overlay": {"path": str(gateway / "GAME.OVR"), "sha256": sha256(gateway_overlay)},
            "coab_oracle": str(oracle_path),
        },
        "detected": detected,
        "boot_dispatch": dispatch,
        "non_demo_game_area": NON_DEMO_GAME_AREA,
        "non_demo_game_area_source": "coab_extracted/engine/seg001.cs PROGRAM() (shared resident GAME.EXE code, not overlay-specific; not independently re-derived per title)",
        "start_node": start_node,
        "target_node": f"{TARGET_FILE}#{TARGET_BLOCK}",
        "route_found": route is not None,
        "route": route or [],
        "graph_node_count": len(graph["nodes"]),
        "graph_edge_count": len(graph["edges"]),
        "graph_resolved_edge_count": sum(1 for edge in graph["edges"] if edge["resolved"]),
        "limitations": [
            "Static branch exploration does not prove comparison/input seeds; any dynamic COMPARE guard on the route is left fully nondeterministic (see each hop's branch_decisions).",
            "A hit proves static reachability of NEWECL from a header entry point with the stated target/game_area, not that the branch is taken by default at boot.",
            "Edges whose game_area write is itself dynamic (host-memory-dependent, not an immediate) are not resolved into the graph and cannot contribute to the route.",
            "This module does not run DOSBox-X, does not wire a route into the browser engine, and does not promote a Route -- it answers static reachability only.",
        ],
    }


def render_markdown(report: dict[str, Any]) -> str:
    dispatch = report["boot_dispatch"]
    lines = [
        "# Gateway save-free new-game route toward `ECL5.DAX#19`",
        "",
        "> Generated by `tools/map_gateway_newgame_route.py`. Do not edit by hand.",
        "",
        "Continues the P3.3 leaf in `docs/engine/BUILD-QUEUE.md`. `docs/engine/research/",
        "gateway-ecl5-19-runtime-route.md` proved the FIGHT/LEAVE -> COMBAT decode inside",
        "`ECL5.DAX#19` and proved `ECL5.DAX` is never opened during silent startup. This",
        "report answers the remaining open path: a save-free, statically decoded dispatch",
        "chain from Gateway's own new-game boot to that block.",
        "",
        "## Boot dispatch constants (native code, structural CoAB-oracle match)",
        "",
        f"- CoAB oracle symbol `{BOOT_DISPATCH_SYMBOL}` at `GAME.OVR+0x{dispatch['coab_function_offset']:X}`, "
        f"target address `{dispatch['coab_target_address']}`, value sequence `{dispatch['coab_value_sequence']}` "
        "(demo, new-game).",
        f"- Gateway structural match at `GAME.OVR+0x{dispatch['gateway_function_offset']:X}` "
        f"(size {dispatch['gateway_function_size']}, sequence similarity `{dispatch['structural_match_ratio']:.4f}`, "
        f"trigram jaccard `{dispatch['structural_match_jaccard']:.4f}`); "
        f"{dispatch['gateway_candidate_group_count']} candidate byte-write groups examined, "
        f"resolved unambiguously: `{str(dispatch['resolved']).lower()}`.",
    ]
    if dispatch["resolved"]:
        lines.append(
            f"- Gateway target address `{dispatch['gateway_target_address']}`: "
            f"demo write `{dispatch['gateway_demo_ecl_block_id']}` at "
            f"`GAME.OVR+0x{dispatch['gateway_demo_instruction_offset']:X}`, "
            f"new-game write `{dispatch['gateway_newgame_ecl_block_id']}` at "
            f"`GAME.OVR+0x{dispatch['gateway_newgame_instruction_offset']:X}` -- "
            "byte-identical constants to the CoAB oracle at the structurally aligned position."
        )
    lines.extend([
        "",
        f"Non-demo `game_area` is `{report['non_demo_game_area']}` ({report['non_demo_game_area_source']}).",
        f"Proven start node: `{report['start_node']}`. Target node: `{report['target_node']}`.",
        "",
        "## NEWECL/game_area graph",
        "",
        f"- Detected install: `{str(report['detected']).lower()}`.",
        f"- `{report['graph_node_count']}` ECL blocks scanned, `{report['graph_edge_count']}` statically reachable "
        f"`NEWECL` hits, `{report['graph_resolved_edge_count']}` resolved to a concrete `(file, block)` edge.",
        f"- Route found: `{str(report['route_found']).lower()}`.",
        "",
    ])
    if report["route"]:
        lines.append("## Route")
        lines.append("")
        node = report["start_node"]
        for index, hop in enumerate(report["route"], start=1):
            to_node = f"{hop['to_file']}#{hop['to_block']}"
            lines.append(
                f"{index}. `{node}` `{hop['entry']}` -> `NEWECL {hop['target_block']}` at vaddr "
                f"`0x{hop['vaddr']:04x}` (game_area write: `{hop['game_area_kind']}`"
                + (f"={hop['game_area']}" if hop["game_area"] is not None else "")
                + f") -> `{to_node}`; branch decisions: `{'; '.join(hop['branch_decisions']) or 'none (unconditional)'}`."
            )
            node = to_node
        lines.append("")
    lines.extend(["## Verification boundary", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gateway", type=Path, default=DEFAULT_GATEWAY)
    parser.add_argument("--coab", type=Path, default=DEFAULT_COAB)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.gateway, args.coab, args.oracle)
    if args.strict:
        hash_failures = [key for key, expected in EXPECTED_HASHES.items() if report["sources"][key]["sha256"] != expected]
        failures: list[str] = []
        if not report["boot_dispatch"]["resolved"]:
            failures.append("boot dispatch constants not resolved unambiguously")
        if not report["detected"]:
            failures.append("Gateway install not detected")
        if failures or hash_failures:
            raise SystemExit(f"strict failure: {failures}; hashes={hash_failures}")
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    print(f"gateway newgame route: found={report['route_found']} hops={len(report['route'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
