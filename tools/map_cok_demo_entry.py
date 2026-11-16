#!/usr/bin/env python3
"""Locate Champions of Krynn's own literal `inDemo`/new-game `EclBlockId` constants
and decode the resulting ECL script chain.

Continues `docs/engine/research/cok-demo-decompile.md` sec 6/7. That doc's raw
`A3 8D` byte-pattern xref scan for CoK's own `load_ecl_dax`-analogue call sites was a
proven dead end (4/4 false positives). This module instead ports the *structural*
technique `docs/engine/research/gateway-newgame-route.md` Part 1 used successfully for
Gateway to the Savage Frontier, then strengthens it one step further because CoK's own
compiled constants turned out NOT to collide-disambiguate the same way Gateway's did:

1. Locate CoK's own compiled counterpart of the CoAB oracle's `sub_29758`
   (`coab_extracted/engine/seg001.cs:2230-2299`) by control-flow *shape* match against
   CoAB's own compiled `GAME.OVR` bytes (`map_gateway_ecl_runtime_candidates.function_shapes`
   / `best_match`, unmodified -- those helpers are generic over any FBOV `GAME.OVR` byte
   blob, not Gateway-specific despite the module name).
2. `map_gateway_newgame_route.boot_dispatch_constants`'s own disambiguator (match the
   value *pair* against CoAB's own `(0x52, 1)`) is ambiguous for CoK: CoK's own compiled
   constants are NOT `(0x52, 1)` (title-specific data, expected), and 3 different
   byte-write groups inside the matched function happen to have a same-shaped 2-value
   sequence, so value matching alone cannot pick the right one blind. This module adds a
   second, independent, purely *structural* (address-content-free) disambiguator that
   turns out to nail it uniquely: both CoAB's own `sub_29758` and CoK's matched candidate
   open with the identical idiom `les di, ptr [P]; cmp word ptr es:[di+X], 0; jne ...`
   (testing whether `area_ptr->LastEclBlockId` is already set -- CoAB source: `if
   (gbl.area_ptr.LastEclBlockId == 0)`), and later, in the "else" (continuing-game) arm,
   repeat `les di, ptr [P]; mov al, byte ptr es:[di+X]; mov byte ptr [ADDR], al` -- copying
   that same struct field into the demo/new-game target address. `ADDR` from that second
   idiom is provably the `EclBlockId` location (COAB: `0x8b78`; this module resolves CoK's
   own `ADDR` the same way, independent of any assumption about literal values). See
   `struct_field_confirmed_target`.
3. Once the literal `EclBlockId` constants are known, decode the resulting ECL script(s)
   using this project's already-verified Gen1 ECL decode primitives
   (`gen1_ecl_encounter_scan.decode_one`/`header_entries`/`successors`, the opcode table +
   6-bit string codec from `dqk_ca03_stream_decode`), following `NEWECL` chains
   cross-file exactly like `map_gateway_newgame_route.scan_block_for_newecl` already does
   for Gateway, so the whole reachable script content is rendered as human-readable text,
   not just structural offsets.

No DOSBox-X, no GameLink, no live trace -- pure static analysis, matching the house
style of both source documents.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import capstone

import goldbox_corpus
from gen1_ecl_encounter_scan import (
    ALL_COMPARE_OUTCOMES,
    DEFAULT_ADDRESS_ADDEND,
    ECL_HEADER_LEN,
    GEN1_WORD_SETS,
    decode_one,
    header_entries,
    offset_to_vaddr,
    successors,
)
from dqk_ca03_stream_decode import OPCODES, decode_ecl_string
from map_gateway_newgame_route import (
    BOOT_DISPATCH_SYMBOL,
    boot_dispatch_constants,
    disassemble_full,
    mem_imm8_write_groups,
    sha256,
)
from map_gateway_ecl_runtime_candidates import DEFAULT_COAB, best_match, function_shapes
from map_pool_ecl_dispatch import disassemble_shape, oracle_offset

REPO_ROOT = goldbox_corpus.REPO_ROOT
DEFAULT_JSON = REPO_ROOT / "build/cok-demo-entry.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/cok-demo-entry-located.generated.md"
DEFAULT_ORACLE = REPO_ROOT / "build" / "coab-oracle-map.json"
PROFILE_ID = "champions-of-krynn"
GAME_AREA_LOCATION = 0x7F12
SAVE_OPCODE = 0x09
NEWECL_OPCODE = 0x20


# ---------------------------------------------------------------------------
# Boot dispatch: structural disambiguation beyond map_gateway_newgame_route's
# value-sequence match (needed because CoK's own compiled constants do not collide-
# disambiguate the same way Gateway's did against the (0x52, 1) CoAB literal pair).
# ---------------------------------------------------------------------------


def struct_field_confirmed_target(instrs: list[Any]) -> dict[str, Any] | None:
    """Find the `les di,ptr[P]; cmp word ptr es:[di+X],0; jne ...` gate near the top of
    the function, then the later `les di,ptr[P]; mov al,byte ptr es:[di+X]; mov byte ptr
    [ADDR],al` idiom that copies the same struct field into the EclBlockId target -- and
    return `ADDR`. This is address-content-free (it never looks at the byte *values*
    written, only the *shape* of the two matching `les`/field-offset idioms), so it works
    even when the literal EclBlockId constants are ambiguous by value alone.
    """
    les_cmp_jne: tuple[str, str] | None = None
    for i in range(len(instrs) - 2):
        a, b, c = instrs[i], instrs[i + 1], instrs[i + 2]
        if (
            a.mnemonic == "les" and len(a.operands) == 2 and a.operands[1].type == capstone.x86.X86_OP_MEM
            and b.mnemonic == "cmp" and len(b.operands) == 2
            and b.operands[0].type == capstone.x86.X86_OP_MEM and b.operands[1].type == capstone.x86.X86_OP_IMM
            and b.operands[1].imm == 0
            and c.mnemonic == "jne"
        ):
            p_text = a.op_str.split(",", 1)[1].strip()
            x_text = b.op_str.split(",", 1)[0].strip()
            les_cmp_jne = (p_text, x_text)
            break
    if les_cmp_jne is None:
        return None
    p_text, x_text = les_cmp_jne

    for i in range(len(instrs) - 2):
        a, b, c = instrs[i], instrs[i + 1], instrs[i + 2]
        if (
            a.mnemonic == "les" and a.op_str.split(",", 1)[1].strip() == p_text
            and b.mnemonic == "mov" and b.op_str.startswith("al, byte ptr es:")
            and x_text.split("es:", 1)[-1].strip() in b.op_str
            and c.mnemonic == "mov" and c.op_str.endswith(", al") and c.operands[0].type == capstone.x86.X86_OP_MEM
        ):
            target_text = c.op_str.rsplit(",", 1)[0].strip()
            return {
                "struct_ptr": p_text,
                "field": x_text,
                "target_address_text": target_text,
                "confirm_instruction_index": i,
            }
    return None


def resolve_boot_dispatch(cok_overlay: bytes, coab_overlay: bytes, oracle: dict[str, Any]) -> dict[str, Any]:
    """CoK-specific boot-dispatch resolver: structural function match (shared helper)
    plus the struct-field confirmation above, cross-checked against CoAB's own oracle
    function (proving the technique reproduces CoAB's own already-known `0x8b78` target
    before trusting it on CoK)."""
    coab_offset = oracle_offset(oracle, BOOT_DISPATCH_SYMBOL)
    coab_instrs = disassemble_full(coab_overlay, coab_offset)
    coab_confirm = struct_field_confirmed_target(coab_instrs)
    coab_groups = mem_imm8_write_groups(coab_instrs)
    coab_self_check = (
        coab_confirm is not None
        and coab_confirm["target_address_text"] in coab_groups
        and tuple(v for _, _, v in coab_groups[coab_confirm["target_address_text"]][:2]) == (0x52, 1)
    )

    coab_shape = disassemble_shape(coab_overlay, coab_offset)
    if coab_shape is None:
        raise ValueError(f"failed to disassemble CoAB oracle shape for {BOOT_DISPATCH_SYMBOL}")
    candidates = function_shapes(cok_overlay)
    cok_shape, ratio, jaccard = best_match(coab_shape, candidates)
    cok_instrs = disassemble_full(cok_overlay, cok_shape.offset)
    cok_confirm = struct_field_confirmed_target(cok_instrs)
    cok_groups = mem_imm8_write_groups(cok_instrs)

    resolved = cok_confirm is not None and cok_confirm["target_address_text"] in cok_groups
    values = None
    if resolved:
        group = cok_groups[cok_confirm["target_address_text"]]
        values = tuple(v for _, _, v in group[:2])

    return {
        "coab_function_offset": coab_offset,
        "coab_struct_field_confirm": coab_confirm,
        "coab_self_check_reproduces_0x52_1_pair": coab_self_check,
        "cok_function_offset": cok_shape.offset,
        "cok_function_size": cok_shape.size,
        "structural_match_ratio": ratio,
        "structural_match_jaccard": jaccard,
        "cok_struct_field_confirm": cok_confirm,
        "cok_candidate_group_count": len(cok_groups),
        "cok_all_groups": {addr: [v for _, _, v in group] for addr, group in cok_groups.items()},
        "resolved": resolved,
        "cok_target_address": cok_confirm["target_address_text"] if cok_confirm else None,
        "cok_value_sequence": list(values) if values else None,
        "cok_demo_ecl_block_id": values[0] if values else None,
        "cok_newgame_ecl_block_id": values[1] if values and len(values) > 1 else None,
    }


def render_operand(raw: bytes, opcode_pos_after: int, arg) -> str:  # noqa: ANN001
    """Render one decoded Operand (gen1_ecl_encounter_scan.Operand) as human text,
    reusing the exact string-decode convention `dqk_ca03_stream_decode.read_opp` uses."""
    code, word = arg.code, arg.word
    if code == 0x00:
        return f"#{word}"
    if code in (0x01, 0x02, 0x03):
        return f"[1:0x{word:04x}]"
    if code == 0x81:
        return f"memstr[0x{word:04x}]"
    if code == 0x09:
        return f"flag:{word}"
    return f"c{code:02x}:{word}"


def decode_string_operand(raw: bytes, offset: int, opcode: int) -> str | None:
    """For opcodes whose sole/leading operand is an inline 6-bit string (str[N]),
    re-decode the actual text the same way `dqk_ca03_stream_decode.read_opp` does for
    operand code 0x80. `gen1_ecl_encounter_scan.read_operand` only skips these bytes; this
    duplicates its position math but decodes the text, matching the approach
    `cok-demo-decompile.md` sec 7.1 already used and verified byte-identical."""
    pos = offset + 1
    if pos + 2 > len(raw):
        return None
    code, high = raw[pos], raw[pos + 1]
    if code != 0x80:
        return None
    pos += 2
    text_raw = raw[pos:pos + high]
    return decode_ecl_string(text_raw)


def render_instruction(raw: bytes, ins) -> str:  # noqa: ANN001
    parts = [ins.mnemonic]
    string_text = decode_string_operand(raw, ins.offset, ins.opcode)
    if string_text is not None:
        parts.append(f'"{string_text}"')
    else:
        parts.append(", ".join(render_operand(raw, ins.offset, arg) for arg in ins.args))
    return " ".join(p for p in parts if p)


def linearize_entry(
    raw: bytes,
    entry_name: str,
    start_offset: int,
    address_addend: int,
    word_sets: dict[int, int] | None = None,
    max_states: int = 20000,
) -> list[dict[str, Any]]:
    """DFS-style ordered walk of one header entry's control flow, emitting every
    instruction the first time it is reached (both sides of every conditional), with the
    branch-decision breadcrumbs leading to it -- the same style
    `cok-demo-decompile.md` sec 7 used by hand, done systematically and reproducibly."""
    out: list[dict[str, Any]] = []
    seen_offsets: set[int] = set()
    states_seen: set[tuple[int, tuple[int, ...], tuple[int, ...]]] = set()
    queue: list[tuple[int, tuple[int, ...], tuple[str, ...], tuple[int, ...]]] = [
        (start_offset, (), (), ALL_COMPARE_OUTCOMES)
    ]
    states = 0
    head = 0
    active_word_sets = word_sets if word_sets is not None else GEN1_WORD_SETS
    while head < len(queue) and states < max_states:
        offset, stack, decisions, compare_outcomes = queue[head]
        head += 1
        state_key = (offset, stack[-8:], compare_outcomes)
        if state_key in states_seen:
            continue
        states_seen.add(state_key)
        states += 1
        ins = decode_one(raw, offset, active_word_sets)
        if ins is None:
            continue
        if offset not in seen_offsets:
            seen_offsets.add(offset)
            out.append({
                "offset": offset,
                "vaddr": offset_to_vaddr(offset, address_addend),
                "opcode": ins.opcode,
                "text": render_instruction(raw, ins),
                "decisions": list(decisions[-16:]),
            })
        for target, target_stack, decision, target_outcomes in successors(
            raw, ins, stack, address_addend, compare_outcomes, active_word_sets
        ):
            if ECL_HEADER_LEN <= target < len(raw) and len(target_stack) <= 24:
                next_decisions = decisions
                if decision in ("condition-true", "condition-false", "selector-fallthrough", "selector-target"):
                    next_decisions = (decisions + (f"0x{offset_to_vaddr(offset, address_addend):04x}:{decision}",))[-16:]
                queue.append((target, target_stack, next_decisions, target_outcomes))
    return sorted(out, key=lambda item: item["offset"])


def area_number_from_file(name: str) -> int | None:
    stem = name.upper()
    if not stem.startswith("ECL") or not stem.endswith(".DAX"):
        return None
    digits = stem[len("ECL"):-len(".DAX")]
    return int(digits) if digits.isdigit() else None


def follow_chain(
    files: dict[str, Path],
    start_file: str,
    start_block: int,
    entry_name: str = "initial_entry",
    address_addend: int = DEFAULT_ADDRESS_ADDEND,
    word_sets: dict[int, int] | None = None,
    max_hops: int = 12,
) -> list[dict[str, Any]]:
    """Decode `initial_entry` for `start_file#start_block`, then keep following any
    statically-immediate `NEWECL` reached from that entry into the target block's own
    `initial_entry`, cross-file, exactly like `map_gateway_newgame_route.scan_block_for_newecl`
    resolves `game_area`(0x7F12)-qualified `NEWECL` edges -- but rendering full readable
    instruction text instead of just graph edges."""
    visited: set[tuple[str, int]] = set()
    chain: list[dict[str, Any]] = []
    current_file, current_block = start_file, start_block
    for _ in range(max_hops):
        key = (current_file, current_block)
        if key in visited:
            chain.append({"file": current_file, "block_id": current_block, "note": "loop -- already visited, stopping"})
            break
        visited.add(key)
        path = files.get(current_file)
        if path is None:
            chain.append({"file": current_file, "block_id": current_block, "note": "file not present in this install"})
            break
        blocks = {b["block_id"]: b for b in goldbox_corpus.read_dax_blocks(path)}
        block = blocks.get(current_block)
        if block is None:
            chain.append({"file": current_file, "block_id": current_block, "note": "block id not present in file"})
            break
        raw = block["raw"]
        entries = dict(header_entries(raw, address_addend))
        start_offset = entries.get(entry_name)
        if start_offset is None:
            chain.append({"file": current_file, "block_id": current_block, "note": f"no {entry_name} header slot"})
            break
        instructions = linearize_entry(
            raw,
            entry_name,
            start_offset,
            address_addend,
            word_sets=word_sets,
        )
        chain.append({
            "file": current_file,
            "block_id": current_block,
            "entry": entry_name,
            "raw_size": block["raw_size"],
            "header_entries": {name: off for name, off in entries.items()},
            "instructions": instructions,
        })

        # find the first statically-immediate NEWECL reached (in offset order) to continue
        # the chain; track any immediate game_area SAVE seen along the way on the same path
        # (mirrors scan_block_for_newecl's "last immediate SAVE to 0x7F12 wins" rule, but
        # simplified to "first NEWECL in offset order" since this is a rendering pass, not
        # an exhaustive graph build).
        next_hit = None
        game_area = None
        for item in instructions:
            if item["opcode"] == SAVE_OPCODE and f"[1:0x{GAME_AREA_LOCATION:04x}]" in item["text"]:
                # SAVE <val> -> [1:0x7f12]; parse the leading operand text for an immediate
                if item["text"].startswith("SAVE #"):
                    try:
                        game_area = int(item["text"].split("#")[1].split(",")[0])
                    except ValueError:
                        game_area = None
            if item["opcode"] == NEWECL_OPCODE and item["text"].startswith("NEWECL #"):
                try:
                    next_hit = int(item["text"].split("#")[1])
                except ValueError:
                    next_hit = None
                break
        if next_hit is None:
            break
        next_file = f"ECL{game_area}.DAX" if game_area is not None else current_file
        current_file, current_block = next_file, next_hit
    return chain


def build_report(coab: Path = DEFAULT_COAB, oracle_path: Path = DEFAULT_ORACLE) -> dict[str, Any]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    install = goldbox_corpus.choose_install(inventory, PROFILE_ID, routes.get(PROFILE_ID))
    if install is None:
        raise FileNotFoundError("champions-of-krynn install not detected")
    files = goldbox_corpus.file_index(install)
    cok_root = install.path

    cok_overlay = files["GAME.OVR"].read_bytes()
    coab_overlay = (coab / "GAME.OVR").read_bytes()
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))

    # First try the plain Gateway-style value-sequence disambiguator (works out of the
    # box if the values happen to be unambiguous); record it for comparison even though
    # CoK needs the stronger resolver below.
    naive_dispatch = boot_dispatch_constants(cok_overlay, coab_overlay, oracle)
    dispatch = resolve_boot_dispatch(cok_overlay, coab_overlay, oracle)

    demo_chain: list[dict[str, Any]] = []
    newgame_chain: list[dict[str, Any]] = []
    demo_block_known = False
    newgame_block_known = False
    demo_file = newgame_file = None
    if dispatch["resolved"]:
        demo_id = dispatch["cok_demo_ecl_block_id"]
        newgame_id = dispatch["cok_newgame_ecl_block_id"]
        # Which ECL*.DAX file holds each literal block id -- determined empirically from
        # this install's own DAX table-of-contents (no assumption about file numbering).
        block_locations: dict[int, str] = {}
        for name, path in sorted(files.items()):
            if not name.upper().startswith("ECL") or path.suffix.upper() != ".DAX":
                continue
            for block in goldbox_corpus.read_dax_blocks(path):
                block_locations.setdefault(block["block_id"], name)
        demo_file = block_locations.get(demo_id)
        newgame_file = block_locations.get(newgame_id)
        demo_block_known = demo_file is not None
        newgame_block_known = newgame_file is not None
        if demo_block_known:
            demo_chain = follow_chain(files, demo_file, demo_id)
        if newgame_block_known:
            newgame_chain = follow_chain(files, newgame_file, newgame_id)

    return {
        "schema_version": 2,
        "profile_id": PROFILE_ID,
        "cok_path": str(cok_root),
        "sources": {
            "cok_overlay": {"path": str(files["GAME.OVR"]), "sha256": sha256(cok_overlay)},
            "coab_overlay": {"path": str(coab / "GAME.OVR"), "sha256": sha256(coab_overlay)},
            "coab_oracle": str(oracle_path),
        },
        "naive_value_sequence_dispatch": naive_dispatch,
        "boot_dispatch": dispatch,
        "demo_block_id": dispatch.get("cok_demo_ecl_block_id"),
        "newgame_block_id": dispatch.get("cok_newgame_ecl_block_id"),
        "demo_file": demo_file,
        "newgame_file": newgame_file,
        "demo_block_known": demo_block_known,
        "newgame_block_known": newgame_block_known,
        "demo_chain": demo_chain,
        "newgame_chain": newgame_chain,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coab", type=Path, default=DEFAULT_COAB)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    args = parser.parse_args()
    report = build_report(coab=args.coab, oracle_path=args.oracle)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"resolved={report['boot_dispatch']['resolved']} "
        f"demo_block={report['demo_block_id']} file={report['demo_file']} (known={report['demo_block_known']}) "
        f"newgame_block={report['newgame_block_id']} file={report['newgame_file']} (known={report['newgame_block_known']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
