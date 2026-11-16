"""Audit reachable Pool of Radiance FIND_ITEM gates from retail ECL bytecode.

The prior quest-state scan exhausted shared ECL-memory flags.  This deliberately
separate pass follows decoded ECL control flow, records `FIND_ITEM` (0x32), its
immediately following comparison branch where present, and all reachable
`DESTROY_ITEMS`/`TREASURE` sites. It decodes the shared 63-byte item-instance layout
(`Item.type` at offset 0x2E), then joins a TREASURE's eighth operand to the matching
`ITEM{area}.DAX` block. This keeps the ECL item type and archive block id as distinct
identity layers instead of comparing their unrelated numeric values.
"""
from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Any

import goldbox_corpus
from gen1_ecl_encounter_scan import (
    DEFAULT_ADDRESS_ADDEND,
    PROFILE_ADDRESS_ADDENDS,
    ALL_COMPARE_OUTCOMES,
    Instruction,
    decode_one,
    header_entries,
    offset_to_vaddr,
    successors,
    target_offset,
    word_sets_for_profile,
)


PROFILE_ID = "pool-of-radiance"
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/pool-find-item-gates.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/pool-find-item-gates.md"
INTERESTING = {0x00, 0x20, 0x24, 0x27, 0x40}
CONDITION_NAMES = {0x16: "IF_EQ", 0x17: "IF_NE", 0x18: "IF_LT", 0x19: "IF_GT", 0x1A: "IF_LE", 0x1B: "IF_GE"}
ITEM_RECORD_SIZE = 0x3F
ITEM_TYPE_OFFSET = 0x2E
ITEM_COUNT_OFFSET = 0x39
EXPECTED_GATE_EVIDENCE = (
    ("ECL1.DAX", 24, "0x9a1e", 74, "IF_EQ"),
    ("ECL1.DAX", 24, "0xa5cf", 74, "IF_EQ"),
    ("ECL4.DAX", 2, "0xa23f", 75, "IF_EQ"),
    ("ECL4.DAX", 10, "0xb14b", 82, "IF_NE"),
    ("ECL4.DAX", 10, "0xb25e", 82, "IF_EQ"),
    ("ECL6.DAX", 1, "0xabbd", 91, "IF_NE"),
    ("ECL6.DAX", 19, "0x9994", 82, "IF_EQ"),
)
EXPECTED_IDENTITY_EVIDENCE = (
    (74, "ITEM1.DAX", 22, 0, "6 Leather Holy Symbol", 6),
    (75, "ITEM4.DAX", 38, 6, "Brass Key", 0),
    (82, "ITEM8.DAX", 50, 0, "Efreeti Bottle", 0),
    (91, "ITEM6.DAX", 57, 0, "Pass", 0),
)
EXPECTED_PRODUCER_EVIDENCE = (
    (74, "ECL1.DAX", 18, "0xb15d", "ITEM1.DAX", 22),
    (74, "ECL1.DAX", 18, "0xb18f", "ITEM1.DAX", 22),
    (74, "ECL1.DAX", 24, "0xb074", "ITEM1.DAX", 22),
    (75, "ECL4.DAX", 2, "0xa705", "ITEM4.DAX", 38),
    (91, "ECL6.DAX", 1, "0xb078", "ITEM6.DAX", 57),
    (82, "ECL8.DAX", 13, "0xa681", "ITEM8.DAX", 50),
)


def immediate_values(ins: Instruction) -> list[int]:
    return [arg.word for arg in ins.args if arg.code == 0]


def decode_item_records(files: dict[str, Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for name, path in sorted(files.items()):
        if not name.startswith("ITEM") or path.suffix.upper() != ".DAX":
            continue
        for block in goldbox_corpus.read_dax_blocks(path):
            raw = block["raw"]
            if not raw or len(raw) % ITEM_RECORD_SIZE:
                continue
            for index, offset in enumerate(range(0, len(raw), ITEM_RECORD_SIZE)):
                record = raw[offset:offset + ITEM_RECORD_SIZE]
                name_len = record[0]
                if not 1 <= name_len <= 40:
                    break
                item_name = record[1:1 + name_len].split(b"\0", 1)[0].decode("ascii", "replace")
                records.append({
                    "file": name,
                    "block_id": block["block_id"],
                    "block_item_index": index,
                    "name": item_name,
                    "item_type": record[ITEM_TYPE_OFFSET],
                    "count": record[ITEM_COUNT_OFFSET],
                })
    return records


def walk(raw: bytes, address_addend: int, word_sets: dict[int, int]) -> dict[int, Instruction]:
    """Return every instruction reachable from an authentic ECL header entry.

    This is intentionally a reachability map, not a simulated playthrough: dynamic
    comparisons/menus keep all legal successor edges so no input assumption turns a
    missing edge into a claimed structural absence.
    """
    queue: deque[tuple[int, tuple[int, ...], tuple[int, ...]]] = deque(
        (offset, (), ALL_COMPARE_OUTCOMES) for _, offset in header_entries(raw, address_addend)
    )
    seen: set[tuple[int, tuple[int, ...], tuple[int, ...]]] = set()
    decoded: dict[int, Instruction] = {}
    while queue and len(seen) < 50000:
        offset, stack, outcomes = queue.popleft()
        key = (offset, stack[-8:], outcomes)
        if key in seen:
            continue
        seen.add(key)
        ins = decode_one(raw, offset, word_sets)
        if ins is None:
            continue
        decoded.setdefault(offset, ins)
        next_outcomes = outcomes
        if ins.opcode == 0x03 and len(ins.args) >= 2:
            left, right = ins.args[:2]
            if left.code == 0 and right.code == 0:
                next_outcomes = ((left.word > right.word) - (left.word < right.word),)
            else:
                next_outcomes = ALL_COMPARE_OUTCOMES
        elif ins.opcode in (0x14, 0x1D, 0x2F, 0x30, 0x32, 0x3F):
            # These commands replace the interpreter comparison flags. Their runtime values are
            # not known statically, so constraints from an earlier COMPARE must not leak through
            # a later FIND_ITEM/boolean query and erase a valid branch.
            next_outcomes = ALL_COMPARE_OUTCOMES
        for target, next_stack, _decision, target_outcomes in successors(
            raw, ins, stack, address_addend, next_outcomes, word_sets
        ):
            if 22 <= target < len(raw) and len(next_stack) <= 24:
                queue.append((target, next_stack, target_outcomes))
    return decoded


def consequence(
    raw: bytes, decoded: dict[int, Instruction], start: int, address_addend: int, word_sets: dict[int, int]
) -> dict[str, Any] | None:
    """Describe the first nearby terminal/stateful instruction on straight-line code only."""
    offset = start
    for _ in range(18):
        ins = decoded.get(offset) or decode_one(raw, offset, word_sets)
        if ins is None:
            return None
        if ins.opcode in INTERESTING:
            return {
                "mnemonic": ins.mnemonic,
                "vaddr": f"0x{offset_to_vaddr(ins.offset, address_addend):04x}",
                "immediate_args": immediate_values(ins),
            }
        # A control-flow command means this small linear explanation must stop rather
        # than pretending to know which dynamic/menu path executes.
        if ins.opcode in (0x01, 0x02, 0x13, 0x15, 0x25, 0x26, 0x2B):
            return {"mnemonic": ins.mnemonic, "vaddr": f"0x{offset_to_vaddr(ins.offset, address_addend):04x}", "control_flow": "unresolved"}
        offset += ins.size
    return None


def branch_summary(
    raw: bytes, decoded: dict[int, Instruction], find: Instruction, address_addend: int, word_sets: dict[int, int]
) -> dict[str, Any]:
    next_offset = find.offset + find.size
    guard = decoded.get(next_offset) or decode_one(raw, next_offset, word_sets)
    if guard is None or guard.opcode not in CONDITION_NAMES:
        return {"kind": "no-immediate-condition"}
    guarded = decoded.get(guard.offset + guard.size) or decode_one(raw, guard.offset + guard.size, word_sets)
    # In Gen1 an IF executes the immediately following instruction when true and
    # skips it when false. FIND_ITEM reports EQ when an item is present, NE otherwise.
    found_executes_guard = guard.opcode in (0x16, 0x1A, 0x1B)
    after_guarded = guarded.offset + guarded.size if guarded else guard.offset + guard.size
    found_start = guarded.offset if found_executes_guard and guarded else after_guarded
    missing_start = after_guarded if found_executes_guard else (guarded.offset if guarded else guard.offset + guard.size)
    found = consequence(raw, decoded, found_start, address_addend, word_sets)
    missing = consequence(raw, decoded, missing_start, address_addend, word_sets)
    if found_executes_guard and guarded and guarded.opcode == 0x01:
        target = target_offset(guarded.args[0] if guarded.args else None, address_addend)
        if target is not None:
            found = {
                "mnemonic": "GOTO",
                "vaddr": f"0x{offset_to_vaddr(guarded.offset, address_addend):04x}",
                "target_vaddr": f"0x{offset_to_vaddr(target, address_addend):04x}",
                "target_first_effect": consequence(raw, decoded, target, address_addend, word_sets),
            }
    return {
        "kind": CONDITION_NAMES[guard.opcode],
        "condition_vaddr": f"0x{offset_to_vaddr(guard.offset, address_addend):04x}",
        "guarded_mnemonic": guarded.mnemonic if guarded else None,
        "found_consequence": found,
        "missing_consequence": missing,
    }


def build_report() -> dict[str, Any]:
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    install = goldbox_corpus.choose_install(inventory, PROFILE_ID, routes.get(PROFILE_ID))
    if install is None:
        raise RuntimeError("Pool of Radiance retail installation was not detected")
    files = goldbox_corpus.file_index(install)
    item_records = decode_item_records(files)
    identities_by_type: dict[int, list[dict[str, Any]]] = {}
    for record in item_records:
        identities_by_type.setdefault(record["item_type"], []).append(record)
    address_addend = PROFILE_ADDRESS_ADDENDS.get(PROFILE_ID, DEFAULT_ADDRESS_ADDEND)
    word_sets = word_sets_for_profile(PROFILE_ID)
    gates: list[dict[str, Any]] = []
    destroys: dict[int, list[dict[str, Any]]] = {}
    treasure_producers: dict[int, list[dict[str, Any]]] = {}
    archives: list[str] = []
    for name, path in sorted(files.items()):
        if not name.startswith("ECL") or path.suffix.upper() != ".DAX":
            continue
        archives.append(name)
        for block in goldbox_corpus.read_dax_blocks(path):
            decoded = walk(block["raw"], address_addend, word_sets)
            for ins in decoded.values():
                values = immediate_values(ins)
                site = {"file": name, "block_id": block["block_id"], "vaddr": f"0x{offset_to_vaddr(ins.offset, address_addend):04x}", "mnemonic": ins.mnemonic}
                if ins.opcode == 0x32 and ins.args:
                    item = ins.args[0]
                    gates.append({**site, "item_operand": item.evidence(), "branch": branch_summary(block["raw"], decoded, ins, address_addend, word_sets)})
                elif ins.opcode == 0x40 and ins.args and ins.args[0].code == 0:
                    destroys.setdefault(ins.args[0].word, []).append(site)
                elif ins.opcode == 0x27 and len(ins.args) >= 8:
                    item_block = ins.args[7]
                    if item_block.code != 0 or item_block.word >= 0x80:
                        continue
                    area_suffix = name.removeprefix("ECL").removesuffix(".DAX")
                    item_file = f"ITEM{area_suffix}.DAX"
                    loaded = [
                        record for record in item_records
                        if record["file"] == item_file and record["block_id"] == item_block.word
                    ]
                    producer = {
                        **site,
                        "item_file": item_file,
                        "item_block_id": item_block.word,
                        "loaded_items": loaded,
                    }
                    for item_type in sorted({record["item_type"] for record in loaded}):
                        treasure_producers.setdefault(item_type, []).append(producer)

    for gate in gates:
        item = gate["item_operand"]
        if item["kind"] == "immediate":
            value = item["value"]
            gate["destroy_sites"] = destroys.get(value, [])
            gate["item_identities"] = identities_by_type.get(value, [])
            gate["treasure_producer_sites"] = treasure_producers.get(value, [])
        else:
            gate["destroy_sites"] = []
            gate["item_identities"] = []
            gate["treasure_producer_sites"] = []
    immediate_gates = [g for g in gates if g["item_operand"]["kind"] == "immediate"]
    mapped_types = sorted({
        g["item_operand"]["value"] for g in immediate_gates if g["item_identities"]
    })
    producer_linked = [g for g in immediate_gates if g["item_identities"] and g["treasure_producer_sites"]]
    mapped_identities_by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    unique_producers_by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    for item_type in mapped_types:
        for identity in identities_by_type.get(item_type, []):
            key = (
                item_type,
                identity["file"],
                identity["block_id"],
                identity["block_item_index"],
                identity["name"],
                identity["count"],
            )
            mapped_identities_by_key[key] = {"item_type": item_type, **identity}
        for producer in treasure_producers.get(item_type, []):
            key = (
                item_type,
                producer["file"],
                producer["block_id"],
                producer["vaddr"],
                producer["item_file"],
                producer["item_block_id"],
            )
            unique_producers_by_key[key] = {"item_type": item_type, **producer}
    mapped_identities = [mapped_identities_by_key[key] for key in sorted(mapped_identities_by_key)]
    unique_producers = [unique_producers_by_key[key] for key in sorted(unique_producers_by_key)]
    return {
        "schema_version": 2,
        "profile_id": PROFILE_ID,
        "provenance": "reachable decoded retail ECL control flow",
        "ecl_archives_scanned": archives,
        "gate_count": len(gates),
        "immediate_gate_count": len(immediate_gates),
        "mapped_item_types": mapped_types,
        "mapped_item_type_count": len(mapped_types),
        "mapped_item_identities": mapped_identities,
        "producer_linked_gate_count": len(producer_linked),
        "unique_producer_site_count": len(unique_producers),
        "unique_producer_sites": unique_producers,
        "reachable_destroy_site_count": sum(len(sites) for sites in destroys.values()),
        "limitations": [
            "A source-proven TREASURE producer queues the item block before combat; the party must still win and take the item.",
            "Static producer-to-gate linkage does not by itself prove one continuous saved retail playthrough.",
            "No quest matrix promotion is made until a carried retail item changes the separate gate at runtime.",
        ],
        "gates": sorted(gates, key=lambda g: (g["file"], g["block_id"], g["vaddr"])),
    }


def strict_validation_errors(report: dict[str, Any]) -> list[str]:
    """Return exact retail-evidence drift, not merely aggregate count drift."""
    actual_gates = tuple(sorted(
        (
            gate["file"],
            gate["block_id"],
            gate["vaddr"],
            gate["item_operand"].get("value"),
            gate["branch"]["kind"],
        )
        for gate in report["gates"]
    ))
    actual_identities = tuple(sorted(
        (
            identity["item_type"],
            identity["file"],
            identity["block_id"],
            identity["block_item_index"],
            identity["name"],
            identity["count"],
        )
        for identity in report["mapped_item_identities"]
    ))
    actual_producers = tuple(sorted(
        (
            producer["item_type"],
            producer["file"],
            producer["block_id"],
            producer["vaddr"],
            producer["item_file"],
            producer["item_block_id"],
        )
        for producer in report["unique_producer_sites"]
    ))
    errors: list[str] = []
    for label, actual, expected in (
        ("gate evidence", actual_gates, tuple(sorted(EXPECTED_GATE_EVIDENCE))),
        ("item identity evidence", actual_identities, tuple(sorted(EXPECTED_IDENTITY_EVIDENCE))),
        ("producer evidence", actual_producers, tuple(sorted(EXPECTED_PRODUCER_EVIDENCE))),
    ):
        if actual != expected:
            errors.append(f"{label} changed: expected {expected!r}, got {actual!r}")
    expected_counts = {
        "gate_count": 7,
        "immediate_gate_count": 7,
        "mapped_item_type_count": 4,
        "producer_linked_gate_count": 7,
        "unique_producer_site_count": 6,
        "reachable_destroy_site_count": 0,
    }
    for field, expected in expected_counts.items():
        if report.get(field) != expected:
            errors.append(f"{field} changed: expected {expected}, got {report.get(field)!r}")
    return errors


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Pool of Radiance FIND_ITEM Gate Scan",
        "",
        "> Generated by `tools/scan_pool_find_item_gates.py`. Do not edit by hand.",
        "",
        f"Scanned {len(report['ecl_archives_scanned'])} retail ECL archives; decoded reachable gates: **{report['gate_count']}** "
        f"({report['immediate_gate_count']} immediate item ids).",
        "",
        "The identity join follows recovered retail source: `CMD_Treasure` operand 8 loads an",
        "`ITEM{area}.DAX` block, and `CMD_FindItem` compares each carried record's `Item.type` byte at 0x2E.",
        "",
        "| Gate | Item identity | Immediate branch | Retail TREASURE producers | Destroy sites |",
        "| --- | --- | --- | ---: | ---: |",
    ]
    for gate in report["gates"]:
        item = gate["item_operand"]
        operand = f"{item['kind']} `{item['value']}`" if item["kind"] == "immediate" else f"dynamic code {item['code']}"
        identities = gate["item_identities"]
        identity = ", ".join(
            f"`{record['name']}` (`{record['file']}#{record['block_id']}`)" for record in identities
        ) or operand
        lines.append(
            f"| `{gate['file']}#{gate['block_id']} {gate['vaddr']}` | {identity} | {gate['branch']['kind']} | "
            f"{len(gate['treasure_producer_sites'])} | {len(gate['destroy_sites'])} |"
        )
    lines.extend(["", "## Result", ""])
    if report["mapped_item_type_count"] == 4 and report["producer_linked_gate_count"] == 7:
        lines.append("All four FIND_ITEM identities are mapped and all seven gates have a source-correct retail TREASURE producer. Type 74 is `6 Leather Holy Symbol` (`ITEM1#22`), type 75 is `Brass Key` (`ITEM4#38`), type 82 is `Efreeti Bottle` (`ITEM8#50`), and type 91 is `Pass` (`ITEM6#57`).")
    else:
        lines.append("One or more FIND_ITEM identities or their source-correct TREASURE producers remain unmapped.")
    lines.extend(["", "## Limits", ""] + [f"- {item}" for item in report["limitations"]])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="reject an unexpected retail gate corpus")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = build_report()
    strict_errors = strict_validation_errors(report)
    if args.strict and strict_errors:
        raise RuntimeError(
            "Pool FIND_ITEM retail corpus changed; inspect the generated report before promotion:\n- "
            + "\n- ".join(strict_errors)
        )
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    print(f"Pool FIND_ITEM gates: {report['gate_count']} ({report['immediate_gate_count']} immediate)")
    print(f"json: {args.json}")
    print(f"markdown: {args.markdown}")


if __name__ == "__main__":
    main()
