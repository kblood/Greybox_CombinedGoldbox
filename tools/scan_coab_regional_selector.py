#!/usr/bin/env python3
"""Decode CoAB's retail wilderness regional-selector lookup tables.

The ECL1 wilderness-hub blocks 80 and 81 each execute two adjacent GETTABLE
instructions. Both are indexed by ECL word 0x4c9d: the first yields
Area1.current_city (0x4ca1), and the second yields the arm for the immediately
following ON_GOTO. The producer is now located: VERTICAL_MENU writes a
zero-based local choice to 0x7f79, then retail ECL computes
0x4c9d = 4 * old route node + local choice.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import goldbox_corpus
from gen1_ecl_encounter_scan import DEFAULT_ADDRESS_ADDEND, decode_one, vaddr_to_offset


REPO_ROOT = goldbox_corpus.REPO_ROOT
DEFAULT_JSON = REPO_ROOT / "build/coab-regional-selector.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/coab-regional-selector.md"
HUBS = {
    80: {"gettable": 0x910C, "neighbors": 0x9C02, "travel_cost": 0x9C3A, "travel_mode": 0x9C72},
    81: {"gettable": 0x8DB9, "neighbors": 0x9C61, "travel_cost": 0x9C99, "travel_mode": 0x9CD1},
}
INDEX_WORD = 0x4C9D
CURRENT_CITY_WORD = 0x4CA1
# Retail MapCursor coordinate pairs from the recovered CoAB `ovr028.cs` city_map_x/y tables.
# The index is `Area1.current_city`; `ovr027.cs` calls MapCursor.SetPosition(current_city) when
# drawing the regional BIGPIC. Keeping the values here makes the selector table independently
# usable without treating the visual map as a free-walk grid.
CITY_CURSOR_COORDS = (
    (0x04, 0x0F), (0x0C, 0x08), (0x15, 0x0B), (0x0B, 0x04), (0x1D, 0x0A),
    (0x14, 0x04), (0x26, 0x01), (0x15, 0x02), (0x1E, 0x0D), (0x1F, 0x0F),
    (0x19, 0x03), (0x25, 0x05), (0x1C, 0x02), (0x1D, 0x08), (0x03, 0x0C),
    (0x0C, 0x0D), (0x19, 0x0A), (0x1D, 0x0C), (0x1D, 0x09), (0x21, 0x09),
    (0x13, 0x08), (0x10, 0x06), (0x09, 0x06), (0x10, 0x03), (0x14, 0x02),
    (0x15, 0x02), (0x19, 0x03), (0x19, 0x02), (0x1A, 0x03), (0x1F, 0x04),
    (0x25, 0x02), (0x22, 0x01), (0x0F, 0x00),
)


def load_block(block_id: int) -> bytes:
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    install = goldbox_corpus.choose_install(
        inventory, "curse-of-the-azure-bonds", goldbox_corpus.load_routes().get("curse-of-the-azure-bonds")
    )
    if install is None:
        raise FileNotFoundError("retail Curse of the Azure Bonds install was not detected")
    files = goldbox_corpus.file_index(install)
    blocks = {item["block_id"]: item["raw"] for item in goldbox_corpus.read_dax_blocks(files["ECL1.DAX"])}
    return blocks[block_id]


def gettable(raw: bytes, vaddr: int):
    ins = decode_one(raw, vaddr_to_offset(vaddr, DEFAULT_ADDRESS_ADDEND))
    if ins is None or ins.mnemonic != "GETTABLE" or len(ins.args) != 3:
        raise ValueError(f"expected GETTABLE at 0x{vaddr:04x}")
    if ins.args[1].word != INDEX_WORD:
        raise ValueError(f"GETTABLE at 0x{vaddr:04x} is not indexed by 0x{INDEX_WORD:04x}")
    return ins


def table_bytes(raw: bytes, vaddr: int, length: int) -> list[int]:
    offset = vaddr_to_offset(vaddr, DEFAULT_ADDRESS_ADDEND)
    values = list(raw[offset:offset + length])
    if len(values) != length:
        raise ValueError(f"table at 0x{vaddr:04x} is truncated")
    return values


def scan_hub(block_id: int, config: dict[str, int]) -> dict[str, Any]:
    raw = load_block(block_id)
    first_vaddr = config["gettable"]
    city = gettable(raw, first_vaddr)
    arm = gettable(raw, first_vaddr + city.size)
    if city.args[2].word != CURRENT_CITY_WORD:
        raise ValueError(f"first table in ECL1#{block_id} does not write current_city")
    on_goto = decode_one(raw, vaddr_to_offset(first_vaddr + city.size + arm.size, DEFAULT_ADDRESS_ADDEND))
    if on_goto is None or on_goto.mnemonic != "ON_GOTO" or len(on_goto.args) < 3:
        raise ValueError(f"expected ON_GOTO after GETTABLE pair in ECL1#{block_id}")
    if on_goto.args[0].word != arm.args[2].word:
        raise ValueError("dispatch table result does not feed adjacent ON_GOTO")
    arm_count = on_goto.args[1].word
    # Every route node owns four possible edge slots. The adjacency, cost, mode, city, and
    # dispatch tables are all exactly 14 * 4 = 56 bytes. The former 40-row bound was too short.
    table_len = 14 * 4
    city_values = table_bytes(raw, city.args[0].word, table_len)
    arm_values = table_bytes(raw, arm.args[0].word, table_len)
    neighbors = table_bytes(raw, config["neighbors"], table_len)
    travel_costs = table_bytes(raw, config["travel_cost"], table_len)
    travel_modes = table_bytes(raw, config["travel_mode"], table_len)
    rows = []
    for index, (current_city, dispatch_arm) in enumerate(zip(city_values, arm_values)):
        rows.append({
            "selector_key": index,
            "route_node": index // 4,
            "local_choice": index % 4,
            "next_route_node": None if neighbors[index] == 0xFF else neighbors[index],
            "travel_cost": travel_costs[index],
            "travel_mode": travel_modes[index],
            "current_city": None if current_city == 0xFF else current_city,
            "cursor_xy": (
                {"x": CITY_CURSOR_COORDS[current_city][0], "y": CITY_CURSOR_COORDS[current_city][1]}
                if current_city != 0xFF and current_city < len(CITY_CURSOR_COORDS) else None
            ),
            "dispatch_arm": dispatch_arm,
            "dispatch_target_vaddr": (
                on_goto.args[2 + dispatch_arm].word if dispatch_arm < arm_count else None
            ),
        })
    return {
        "ecl_block": block_id,
        "index_word": f"0x{INDEX_WORD:04x}",
        "current_city_word": f"0x{CURRENT_CITY_WORD:04x}",
        "city_table_vaddr": f"0x{city.args[0].word:04x}",
        "dispatch_table_vaddr": f"0x{arm.args[0].word:04x}",
        "on_goto_vaddr": f"0x{first_vaddr + city.size + arm.size:04x}",
        "neighbor_table_vaddr": f"0x{config['neighbors']:04x}",
        "travel_cost_table_vaddr": f"0x{config['travel_cost']:04x}",
        "travel_mode_table_vaddr": f"0x{config['travel_mode']:04x}",
        "rows": rows,
    }


def build_report() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "provenance": "decoded-retail-ECL1.DAX-GETTABLE-pairs",
        "important_boundary": (
            "selector_key is a directed edge key (4 * old route node + zero-based local "
            "VERTICAL_MENU choice), not a global city-menu index or free-map coordinate."
        ),
        "hubs": [scan_hub(block_id, config) for block_id, config in HUBS.items()],
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# CoAB Regional Selector Tables",
        "",
        "> Generated by `tools/scan_coab_regional_selector.py`. Do not edit by hand.",
        "",
        "Each hub executes adjacent retail `GETTABLE` instructions indexed by `0x4C9D`: the",
        "first writes `Area1.current_city` (`0x4CA1`) and the second supplies the following",
        "`ON_GOTO` arm. Retail ECL computes `selector_key = 4 * route_node + local_choice`; it",
        "is a directed edge key, not a global city-menu index.",
        "",
    ]
    for hub in report["hubs"]:
        lines.extend([
            f"## ECL1.DAX#{hub['ecl_block']}",
            "",
            f"City table `{hub['city_table_vaddr']}`; dispatch table `{hub['dispatch_table_vaddr']}`; ON_GOTO `{hub['on_goto_vaddr']}`.",
            "",
            "| edge | node | choice | next | cost | mode | city | cursor | arm | target |",
            "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ])
        for row in hub["rows"]:
            city = "unused" if row["current_city"] is None else str(row["current_city"])
            cursor = "unused" if row["cursor_xy"] is None else f"({row['cursor_xy']['x']},{row['cursor_xy']['y']})"
            target = "out of range" if row["dispatch_target_vaddr"] is None else f"0x{row['dispatch_target_vaddr']:04X}"
            next_node = "unused" if row["next_route_node"] is None else str(row["next_route_node"])
            lines.append(
                f"| {row['selector_key']} | {row['route_node']} | {row['local_choice']} | "
                f"{next_node} | {row['travel_cost']} | {row['travel_mode']} | {city} | "
                f"{cursor} | {row['dispatch_arm']} | {target} |"
            )
        lines.append("")
    lines.extend([
        "## Implementation boundary",
        "",
        "This proves local menu choice → directed route edge → next route node / travel cost /",
        "travel mode / current_city / regional cursor / dispatch arm. The host must preserve the",
        "retail per-node menu labels and predecessor-block return binding; it must not expose the",
        "56 edge keys as an invented global city menu.",
    ])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = build_report()
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")


if __name__ == "__main__":
    main()
