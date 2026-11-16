"""Find every statically reachable ECL reference to a specific Gen1 persistent-flag word,
across an ENTIRE game's ECL corpus (every `ECLn.DAX` archive, every block), and classify
each hit by whether it lands in the SAME block that sets the flag, a DIFFERENT block in
the SAME archive, or a block in a DIFFERENT archive entirely.

This is the "quest" leg's evidence tool (`BUILD-QUEUE.md` item 6's campaign-promotion
matrix): the strongest possible "quest" proof is a consumed-bit flag set by one already-
proven natural route that is genuinely READ (not merely re-written) by a DIFFERENT block,
ideally in a DIFFERENT archive/area, and that read gates different content (dialogue text,
an `ON_GOTO` branch, a skipped/altered encounter) rather than being an unrelated reuse of
the same scratch word.

Reuses `gen1_ecl_encounter_scan`'s decode/BFS primitives (the same walker
`map_gen1_area_mode_writes.py` already uses for a single fixed SAVE destination) but
generalizes to: (a) an arbitrary caller-supplied set of target locations, (b) every
operand of every decodable instruction (not just SAVE's destination), and (c) every block
in every ECL archive belonging to a profile, not just blocks reachable from one known
route's own entry.

A hit only proves STATIC reachability of an instruction referencing the target word from
that block's own header entries -- it does not prove the branch is taken at runtime, and a
same-numbered word can coincidentally be reused as unrelated scratch space by a different
script. Every hit needs a manual byte-level read of its surrounding control flow before it
can be promoted to a "quest" route claim -- this tool only narrows the search.
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
    GEN1_WORD_SETS,
    ALL_COMPARE_OUTCOMES,
    ECL_HEADER_LEN,
    decode_one,
    header_entries,
    offset_to_vaddr,
    successors,
    word_sets_for_profile,
)

REPO_ROOT = goldbox_corpus.REPO_ROOT
DEFAULT_JSON = REPO_ROOT / "build/gen1-cross-area-flag-reads.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/gen1-cross-area-flag-reads.md"

# Known consumed/persistent-state words from each already-proven natural route
# (`docs/engine/research/persistent-natural-routes.md`), plus a couple of runtime-seed /
# town-transition words whose own SETTER is not yet located -- exactly the kind of word a
# cross-area "quest" flag would be.
FLAG_REGISTRY: dict[str, list[dict[str, Any]]] = {
    "secret-of-the-silver-blades": [
        {"location": 0x4CCD, "label": "early anchor consumed bit (ECL3#97, mask 0x04)", "source_file": "ECL3.DAX", "source_block": 97},
        {"location": 0x4C2E, "label": "middle route Marcus/BC LORD consumed bit (ECL1#16)", "source_file": "ECL1.DAX", "source_block": 16},
        {"location": 0x4C9E, "label": "ending route FIRE GIANT/PYROHYDRA consumed bit, mask 0x40 (ECL2#68)", "source_file": "ECL2.DAX", "source_block": 68},
        {"location": 0x4C4D, "label": "middle route runtime-seed precondition, setter UNLOCATED (ECL1#16 requires != 0)", "source_file": None, "source_block": None},
        {"location": 0x7ED5, "label": "town vm_run_1 'LEAVING THE TOWN' gate (ECL1#16)", "source_file": "ECL1.DAX", "source_block": 16},
    ],
    "pool-of-radiance": [
        {"location": 0x4A38, "label": "early anchor consumed bit (ECL1#18)", "source_file": "ECL1.DAX", "source_block": 18},
        {"location": 0x4ACF, "label": "middle route ORC/ORC LEADER checkpoint consumed bit, mask 0xff (ECL2#20)", "source_file": "ECL2.DAX", "source_block": 20},
        {"location": 0x4AD0, "label": "middle route (1,5)/selector-14 sibling guard word, distinct from 0x4acf (ECL2#20)", "source_file": "ECL2.DAX", "source_block": 20},
        {"location": 0x4A23, "label": "ending route KOBOLD warband consumed bit (ECL8#29)", "source_file": "ECL8.DAX", "source_block": 29},
        {"location": 0x4A1A, "label": "town Temple of Ilmater discovery flag, value 4 (ECL1#18)", "source_file": "ECL1.DAX", "source_block": 18},
    ],
    "curse-of-the-azure-bonds": [
        {"location": 0x4CF4, "label": "early-anchor MEDUSA/GRIFFON consumed bit, mask 0x08 (ECL4#37)", "source_file": "ECL4.DAX", "source_block": 37},
        {"location": 0x4CFF, "label": "middle-area FIRE KNIFE/MAGE checkpoint consumed flag, value 1 (ECL2#4)", "source_file": "ECL2.DAX", "source_block": 4},
        {"location": 0x4CBE, "label": "ending route GIANT SPIDER first-fight checkpoint, value 1 (ECL6#64)", "source_file": "ECL6.DAX", "source_block": 64},
        {"location": 0x4CBF, "label": "ending route RAKSHASA completion consumed flag, value 1 (ECL6#64)", "source_file": "ECL6.DAX", "source_block": 64},
        {"location": 0x4C20, "label": "cross-archive route persistence probe only; synthetic seed with no retail setter located (ECL4#37 -> ECL1#80 -> ECL5#49)", "source_file": None, "source_block": None},
        {"location": 0x4CA1, "label": "current_city wilderness BIGPIC cursor / combat-floor selector; hub ECL1#80/#81 copy destination selector 0x4C9B here", "source_file": None, "source_block": None},
    ],
    "champions-of-krynn": [
        {"location": 0x4C55, "label": "early anchor consumed bit, mask 0x20, plus selector-27 flavour bit 0x10 on the SAME word (ECL1#34)", "source_file": "ECL1.DAX", "source_block": 34},
        {"location": 0x4C44, "label": "selector-30 flavour-cell write, mask 0x1, en route to the early anchor (ECL1#34)", "source_file": "ECL1.DAX", "source_block": 34},
        {"location": 0x4C6E, "label": "middle route Myrtani/BAAZ/KAPAK consumed bit, mask 0x20, written eagerly (ECL2#49)", "source_file": "ECL2.DAX", "source_block": 49},
        {"location": 0x4CC2, "label": "ending route stage-2 SKYLA consumed bit, mask 0x10, plus selector-17 flavour bit 0x40 on the SAME word (ECL3#82)", "source_file": "ECL3.DAX", "source_block": 82},
        {"location": 0x4CC3, "label": "ending route stage-1 undead-legion checkpoint consumed bit, mask 0x08, written eagerly (ECL3#82)", "source_file": "ECL3.DAX", "source_block": 82},
        {"location": 0x4C84, "label": "town Ale House tavern-tale counter, incremented per visit (ECL2#50)", "source_file": "ECL2.DAX", "source_block": 50},
        {"location": 0x4C26, "label": "landmark-loop route selector (ECL1#17 requires ==1; ECL1#16 writes travel arms 0/1/2)", "source_file": "ECL1.DAX", "source_block": 16},
        {"location": 0x4C28, "label": "landmark-loop visit counter (ECL1#17 increments before its >6 gate)", "source_file": "ECL1.DAX", "source_block": 17},
        {"location": 0x4C5C, "label": "landmark-loop host-owned prerequisite (ECL1#17 requires !=0; no ECL setter currently located)", "source_file": None, "source_block": None},
        {"location": 0x4C7D, "label": "landmark-loop alternate host-owned prerequisite (ECL1#17 requires !=0; no ECL setter currently located)", "source_file": None, "source_block": None},
        {"location": 0x4C37, "label": "wilderness gate 'outpost discovered' precondition -- READ (not written) by the wilderness route; setter UNLOCATED (ECL1#16 arm 11 requires ==1)", "source_file": None, "source_block": None},
    ],
    "gateway-to-the-savage-frontier": [
        # The quest flag itself: exactly ONE writer in the whole five-archive corpus
        # (`ECL3.DAX#5 @0x9026 SAVE #1 -> [0x4c21]`, the Amanitas rescue in Everlund's
        # undercity), eleven COMPARE reads spread over three other blocks in two other
        # archives. See `docs/engine/research/gateway-quest-flag.md`.
        {"location": 0x4C21, "label": "quest flag AMANITAS RESCUED (ECL3#5 @0x9026); read by ECL2#1 Yartar x8, ECL2#4 Kraken base x2, ECL3#14 Secomber x1", "source_file": "ECL3.DAX", "source_block": 5},
        {"location": 0x4C32, "label": "Amanitas-rescue combat consumed bit, written at ECL3#5 @0x8f13 before the post-combat scene", "source_file": "ECL3.DAX", "source_block": 5},
        {"location": 0x4C20, "label": "early-leg Yartar thug-rescue consumed word (ECL2#1 @0x939b/@0x9444); all six writers are in ECL2#1", "source_file": "ECL2.DAX", "source_block": 1},
        {"location": 0x4C93, "label": "ECL2#3 -> ECL2#1 cross-block guard, sole writer ECL2#3 @0x96b1", "source_file": "ECL2.DAX", "source_block": 3},
        {"location": 0x4C22, "label": "Yartar city-gate Kraken-abduction one-shot bit, sole writer ECL2#1 @0x86e7 (consumed inside the same block)", "source_file": "ECL2.DAX", "source_block": 1},
        {"location": 0x4C03, "label": "SHARED per-area wandering/encounter scratch word -- written by 8 different blocks; NOT a quest flag, listed to document the collision hazard", "source_file": None, "source_block": None},
        {"location": 0x7ED5, "label": "host-owned 'leaving the town' gate -- zero ECL writers corpus-wide, read by every town/dungeon block's vm_run_1", "source_file": None, "source_block": None},
    ],
    "death-knights-of-krynn": [
        {"location": 0x4C5F, "label": "early anchor SIVAK-ambush consumed bit, mask 0x08 -- does NOT gate the encounter body, only arms SURPRISE on revisit (ECL1#34)", "source_file": "ECL1.DAX", "source_block": 34},
        {"location": 0x4C5E, "label": "early anchor IGORF second-group gate, setter UNLOCATED (ECL1#34 requires ==1)", "source_file": None, "source_block": None},
        {"location": 0x4CF7, "label": "wilderness route ECL1#17 initial_entry's OWN first write, SAVE #1 -> [0x4cf7] (one instruction before the proven inDungeon=0 write)", "source_file": "ECL1.DAX", "source_block": 17},
    ],
}


def scan_block_for_targets(
    raw: bytes,
    address_addend: int,
    targets: set[int],
    max_states: int = 50000,
    word_sets: dict[int, int] = GEN1_WORD_SETS,
) -> dict[int, list[dict[str, Any]]]:
    """BFS every block header entry, recording every instruction with ANY operand whose
    `.word` matches a target location -- any opcode, any argument position (not just
    SAVE's destination, unlike `map_gen1_area_mode_writes.py`'s narrower single-purpose
    scan)."""
    hits_by_location: dict[int, dict[tuple[int, str, int, int], dict[str, Any]]] = {loc: {} for loc in targets}
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
        ins = decode_one(raw, offset, word_sets)
        if ins is None:
            continue
        next_path = (path + (offset,))[-96:]

        for arg_index, arg in enumerate(ins.args):
            if arg.word in targets:
                is_write = ins.mnemonic == "SAVE" and arg_index == 1
                key = (offset, entry_name, arg_index, arg.word)
                bucket = hits_by_location[arg.word]
                if key not in bucket:
                    bucket[key] = {
                        "entry": entry_name,
                        "offset": offset,
                        "vaddr": offset_to_vaddr(offset, address_addend),
                        "mnemonic": ins.mnemonic,
                        "arg_index": arg_index,
                        "arg_code": arg.code,
                        "kind": "write" if is_write else "read",
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

        for target, target_stack, decision, target_outcomes in successors(raw, ins, stack, address_addend, next_compare_outcomes, word_sets):
            if ECL_HEADER_LEN <= target < len(raw) and len(target_stack) <= 24:
                next_decisions = decisions
                if decision in ("condition-true", "condition-false", "selector-fallthrough", "selector-target"):
                    next_decisions = (decisions + (f"0x{offset_to_vaddr(offset, address_addend):04x}:{decision}",))[-32:]
                queue.append((entry_name, target, target_stack, next_path, next_decisions, target_outcomes))

    return {loc: sorted(bucket.values(), key=lambda h: (h["offset"], h["entry"])) for loc, bucket in hits_by_location.items()}


def build_report(profile_ids: set[str] | None = None) -> dict[str, Any]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    games: list[dict[str, Any]] = []
    for profile_id, flags in FLAG_REGISTRY.items():
        if profile_ids and profile_id not in profile_ids:
            continue
        profile = next(p for p in goldbox_corpus.PROFILES if p["id"] == profile_id)
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        files = goldbox_corpus.file_index(install)
        address_addend = PROFILE_ADDRESS_ADDENDS.get(profile_id, DEFAULT_ADDRESS_ADDEND)
        word_sets = word_sets_for_profile(profile_id)
        targets = {flag["location"] for flag in flags}

        # location -> list of {file, block_id, hit}
        all_hits: dict[int, list[dict[str, Any]]] = {loc: [] for loc in targets}
        ecl_names = sorted(name for name in files if name.startswith("ECL") and files[name].suffix.upper() == ".DAX")
        for name in ecl_names:
            path = files[name]
            for block in goldbox_corpus.read_dax_blocks(path):
                scanned = scan_block_for_targets(block["raw"], address_addend, targets, word_sets=word_sets)
                for location, hits in scanned.items():
                    for hit in hits:
                        all_hits[location].append({"file": name, "block_id": block["block_id"], **hit})

        flag_reports: list[dict[str, Any]] = []
        for flag in flags:
            location = flag["location"]
            hits = all_hits[location]
            same_block: list[dict[str, Any]] = []
            cross_block_same_archive: list[dict[str, Any]] = []
            cross_archive: list[dict[str, Any]] = []
            for hit in hits:
                if hit["file"] == flag["source_file"] and hit["block_id"] == flag["source_block"]:
                    same_block.append(hit)
                elif hit["file"] == flag["source_file"]:
                    cross_block_same_archive.append(hit)
                else:
                    cross_archive.append(hit)
            flag_reports.append({
                "location": f"0x{location:04x}",
                "label": flag["label"],
                "source_file": flag["source_file"],
                "source_block": flag["source_block"],
                "total_hits": len(hits),
                "same_block_hits": len(same_block),
                "cross_block_same_archive": cross_block_same_archive,
                "cross_archive": cross_archive,
            })

        games.append({
            "profile_id": profile_id,
            "title": profile["title"],
            "detected": install is not None,
            "ecl_files_scanned": ecl_names,
            "flags": flag_reports,
        })
    return {
        "schema_version": 1,
        "provenance": "decoded-retail-ecl-control-flow",
        "limitations": [
            "Static branch exploration does not prove comparison/input seeds are reachable at runtime.",
            "A hit proves static reachability of an instruction referencing the target word from a header entry, not that the word's value at that point in real play matches the setting route's own outcome.",
            "A cross-block/cross-archive hit on the same numbered word can be a coincidental reuse of scratch memory by unrelated script logic; every hit needs a manual disassembly read before being promoted to a quest-route claim.",
        ],
        "games": games,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Gen1 Cross-Area Persistent-Flag Reference Scan",
        "",
        "> Generated by `tools/map_gen1_cross_area_flag_reads.py`. Do not edit by hand.",
        "",
        "For each already-known consumed/persistent-state flag word from a proven natural",
        "route, every statically reachable instruction referencing that word anywhere in the",
        "game's full ECL corpus, grouped by same-block / cross-block-same-archive /",
        "cross-archive.",
        "",
    ]
    for game in report["games"]:
        lines.extend([f"## {game['title']}", "", f"ECL archives scanned: {', '.join(game['ecl_files_scanned'])}", ""])
        lines.append("| Flag | Label | Same-block hits | Cross-block (same archive) | Cross-archive |")
        lines.append("| --- | --- | ---: | ---: | ---: |")
        for flag in game["flags"]:
            lines.append(
                f"| `{flag['location']}` | {flag['label']} | {flag['same_block_hits']} | "
                f"{len(flag['cross_block_same_archive'])} | {len(flag['cross_archive'])} |"
            )
        for flag in game["flags"]:
            if not flag["cross_block_same_archive"] and not flag["cross_archive"]:
                continue
            lines.extend(["", f"### `{flag['location']}` -- {flag['label']}", ""])
            for hit in flag["cross_archive"]:
                lines.append(
                    f"- **cross-archive** `{hit['file']}#{hit['block_id']}` `{hit['entry']}` -> "
                    f"`{hit['mnemonic']}` arg {hit['arg_index']} (`{hit['kind']}`) at vaddr `0x{hit['vaddr']:04x}`; "
                    f"branch decisions: `{'; '.join(hit['branch_decisions']) or 'none (unconditional)'}`."
                )
            for hit in flag["cross_block_same_archive"]:
                lines.append(
                    f"- cross-block (same archive) `{hit['file']}#{hit['block_id']}` `{hit['entry']}` -> "
                    f"`{hit['mnemonic']}` arg {hit['arg_index']} (`{hit['kind']}`) at vaddr `0x{hit['vaddr']:04x}`; "
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
    # See tools/report_guard.py: --profile narrows the scan, DEFAULT_MARKDOWN is corpus-wide.
    guard_narrowing_write(args.markdown, markdown, force=args.force, label="the cross-area flag report")
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(markdown, encoding="utf-8")
    total_cross = sum(
        len(flag["cross_block_same_archive"]) + len(flag["cross_archive"])
        for game in report["games"] for flag in game["flags"]
    )
    print(f"gen1 cross-area flag reads: {total_cross} cross-block/cross-archive hits across {len(report['games'])} game(s)")


if __name__ == "__main__":
    main()
