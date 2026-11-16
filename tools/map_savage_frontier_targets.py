#!/usr/bin/env python3
"""Select bounded Savage Frontier runtime targets and 422-byte stride candidates."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import capstone
import dax_decode
import gen1_ecl_encounter_scan as ecl_scan


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LAYOUTS = REPO_ROOT / "build/vroomm-layouts.json"
DEFAULT_ENCOUNTERS = REPO_ROOT / "build/gen1-ecl-encounters.json"
DEFAULT_JSON = REPO_ROOT / "build/savage-frontier-targets.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/savage-frontier-targets.generated.md"
PROFILES = (
    "gateway-to-the-savage-frontier",
    "treasures-of-the-savage-frontier",
)
DATA_MNEMONICS = {"mov", "add", "sub", "imul"}
TRANSFER_SPECS = {
    "gateway-to-the-savage-frontier": {
        "descriptor_index": 29,
        "arrays": [
            ("attack_dice_count", 0x11D, 0x19D),
            ("attack_die_size", 0x11F, 0x19F),
            ("attack_damage_bonus", 0x121, 0x1A1),
        ],
        "scalars": [
            ("armor_class_inverted", 0x124, 0x19A),
            ("current_hp", 0xE4, 0x1A5),
            ("thac0_inverted", 0x73, 0x199),
        ],
        "direct": [
            ("source_footprint", [0xDE], "cmp", "byte ptr es:[di + 0xde], 0x80"),
            ("saving_throws", list(range(0xDF, 0xE4)), "mov", "byte ptr es:[di + 0xdf], 0x14"),
            ("hit_dice", [0xE5], "mov", "al, byte ptr es:[di + 0xe5]"),
            ("control_morale", [0xF7], "cmp", "byte ptr es:[di + 0xf7], 0x7f"),
            ("experience_points", list(range(0x127, 0x12B)), "mov", "ax, word ptr es:[di + 0x127]"),
        ],
    },
    "treasures-of-the-savage-frontier": {
        "descriptor_index": 27,
        "arrays": [
            ("attack_dice_count", 0x169, 0x1F5),
            ("attack_die_size", 0x16B, 0x1F7),
            ("attack_damage_bonus", 0x16D, 0x1F9),
        ],
        "scalars": [
            ("armor_class_inverted", 0x170, 0x1F2),
            ("current_hp", 0x137, 0x1FD),
            ("thac0_inverted", 0xAC, 0x1F1),
        ],
        "direct": [
            ("source_footprint", [0x131], "cmp", "byte ptr es:[di + 0x131], 0x80"),
            ("saving_throws", list(range(0x132, 0x137)), "mov", "byte ptr es:[di + 0x132], 0x14"),
            ("hit_dice", [0x138], "mov", "al, byte ptr es:[di + 0x138]"),
            ("control_morale", [0x147], "cmp", "byte ptr es:[di + 0x147], 0x7f"),
            ("experience_points", list(range(0x172, 0x176)), "mov", "ax, word ptr es:[di + 0x172]"),
            ("race_monster_discriminator", [0xAD], "cmp", "byte ptr es:[di + 0xad], 6"),
        ],
    },
}

COMPACT_ITEM_FIELDS = [
    ("base_type", [0], [0x2E], [("mov", "al, byte ptr es:[di + 0x2e]")]),
    ("name_codes", [1, 2, 3], [0x2F, 0x30, 0x31], [
        ("mov", "al, byte ptr es:[di + 0x2f]"),
        ("mov", "al, byte ptr es:[di + 0x30]"),
        ("mov", "al, byte ptr es:[di + 0x31]"),
    ]),
    ("magic_plus", [4], [0x32], [("cmp", "byte ptr es:[di + 0x32], 0")]),
    ("plus_save", [5], [0x33], [("mov", "al, byte ptr es:[di + 0x33]")]),
    ("readied", [6], [0x34], [("cmp", "byte ptr es:[di + 0x34], 0")]),
    ("hidden_names", [7], [0x35], [("mov", "al, byte ptr es:[di + 0x35]")]),
    ("cursed", [8], [0x36], [("cmp", "byte ptr es:[di + 0x36], 0")]),
    ("weight", [9, 10], [0x37, 0x38], [("mov", "ax, word ptr es:[di + 0x37]")]),
    ("count", [11], [0x39], [("mov", "al, byte ptr es:[di + 0x39]")]),
    ("value", [12, 13], [0x3A, 0x3B], [("push", "word ptr es:[di + 0x3a]")]),
    ("affect_codes", [14, 15, 16], [0x3C, 0x3D, 0x3E], [
        ("mov", "al, byte ptr es:[di + 0x3c]"),
        ("mov", "al, byte ptr es:[di + 0x3d]"),
        ("mov", "al, byte ptr es:[di + 0x3e]"),
    ]),
]

XP_FORMULA_SPECS = {
    "gateway-to-the-savage-frontier": {
        "descriptor_index": 7,
        "monster_award": "u16(+0x13C) + u8(+0x12C) * u8(+0x13E)",
        "treasure_terms": ["u32(0x822C)/200", "u32(0x8230)/20", "u32(0x8234)/2", "u32(0x8238)",
                           "u32(0x823C)*5", "u32(0x8240)*250", "u32(0x8244)*2200"],
        "item_award": "positive i8(item+0x32) * 400",
        "split_divisor": "u16(party+0x67C) - u8(0x9E7F)",
        "anchors": [
            (0x00F2, "mov", "al, byte ptr es:[di + 0x12c]"),
            (0x00FE, "mov", "al, byte ptr es:[di + 0x13e]"),
            (0x0105, "mul", "dx"),
            (0x010F, "mov", "ax, word ptr es:[di + 0x13c]"),
            (0x0250, "mov", "ax, word ptr [0x822c]"),
            (0x0257, "mov", "cx, 0xc8"),
            (0x0267, "mov", "ax, word ptr [0x8230]"),
            (0x026E, "mov", "cx, 0x14"),
            (0x027E, "mov", "ax, word ptr [0x8234]"),
            (0x0285, "mov", "cx, 2"),
            (0x0295, "mov", "ax, word ptr [0x8238]"),
            (0x02A2, "mov", "ax, word ptr [0x823c]"),
            (0x02A9, "mov", "cx, 5"),
            (0x02B9, "mov", "ax, word ptr [0x8240]"),
            (0x02C0, "mov", "cx, 0xfa"),
            (0x02D0, "mov", "ax, word ptr [0x8244]"),
            (0x02D7, "mov", "cx, 0x898"),
            (0x0311, "cmp", "byte ptr es:[di + 0x32], 0"),
            (0x031B, "mov", "al, byte ptr es:[di + 0x32]"),
            (0x0320, "mov", "dx, 0x190"),
            (0x0323, "mul", "dx"),
            (0x033F, "mov", "al, byte ptr [0x9e7f]"),
            (0x034A, "mov", "ax, word ptr es:[di + 0x67c]"),
            (0x034F, "sub", "ax, dx"),
            (0x035D, "lcall", "0x343, 0xa74"),
        ],
    },
    "treasures-of-the-savage-frontier": {
        "descriptor_index": 6,
        "monster_award": "u16(+0x198)",
        "treasure_terms": ["u32(0x9E02)/2", "u32(0x9E06)/250", "u32(0x9E0A)/2200"],
        "item_award": "positive i8(item+0x32) * 400",
        "split_divisor": "u8(party+0x1F) - u8(0xBC6E)",
        "anchors": [
            (0x0344, "mov", "ax, word ptr es:[di + 0x198]"),
            (0x0487, "mov", "ax, word ptr [0x9e02]"),
            (0x048E, "mov", "cx, 2"),
            (0x049E, "mov", "ax, word ptr [0x9e06]"),
            (0x04A5, "mov", "cx, 0xfa"),
            (0x04B5, "mov", "ax, word ptr [0x9e0a]"),
            (0x04BC, "mov", "cx, 0x898"),
            (0x04F6, "cmp", "byte ptr es:[di + 0x32], 0"),
            (0x0500, "mov", "al, byte ptr es:[di + 0x32]"),
            (0x0505, "mov", "dx, 0x190"),
            (0x0508, "mul", "dx"),
            (0x0524, "mov", "al, byte ptr [0xbc6e]"),
            (0x052F, "mov", "al, byte ptr es:[di + 0x1f]"),
            (0x0535, "sub", "ax, dx"),
            (0x0542, "lcall", "0xa77, 0xa2d"),
        ],
    },
}


def decode_ecl_string(raw: bytes, offset: int, packed_len: int) -> str:
    acc = 0
    bits = 0
    out = ""
    for value in raw[offset:offset + packed_len]:
        acc = ((acc << 8) | value) & 0xFFFFFF
        bits += 8
        while bits >= 6:
            bits -= 6
            char = (acc >> bits) & 0x3F
            if char == 0:
                return out
            out += chr(char + 64 if 1 <= char <= 31 else char)
    return out


def inline_texts(raw: bytes, instruction: ecl_scan.Instruction) -> list[str]:
    texts: list[str] = []
    pos = instruction.offset + 1
    for _ in instruction.args:
        code, high = raw[pos], raw[pos + 1]
        pos += 2
        if code in (1, 2, 3, 0x81):
            pos += 1
        if code == 0x80:
            texts.append(decode_ecl_string(raw, pos, high))
            pos += high
    return texts


def annotate_route(layout: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    archive_path = Path(layout["loader_path"]).parent / row["ecl_file"]
    data = archive_path.read_bytes()
    base, entries = dax_decode.parse_container(data)
    entry = next(item for item in entries if int(item.block_id) == row["ecl_block"])
    raw = dax_decode.decompress_block(data, base, entry)
    path = set(row["path_offsets"])
    word_sets = ecl_scan.word_sets_for_profile(layout["profile_id"])
    menus: list[dict[str, Any]] = []
    dispatches: list[dict[str, Any]] = []
    for offset in row["path_offsets"]:
        instruction = ecl_scan.decode_one(raw, offset, word_sets)
        if instruction is None:
            continue
        if instruction.opcode == 0x2B and len(instruction.args) >= 2:
            menus.append({
                "vaddr": ecl_scan.offset_to_vaddr(offset, ecl_scan.DEFAULT_ADDRESS_ADDEND),
                "destination": instruction.args[0].word,
                "choices": inline_texts(raw, instruction),
            })
        elif instruction.opcode == 0x25 and len(instruction.args) >= 2:
            targets = [operand.word for operand in instruction.args[2:2 + instruction.args[1].word]]
            dispatches.append({
                "vaddr": ecl_scan.offset_to_vaddr(offset, ecl_scan.DEFAULT_ADDRESS_ADDEND),
                "selector": instruction.args[0].word,
                "targets": targets,
            })

    tactical_choice = None
    combat_words = {"FIGHT", "ATTACK", "COMBAT"}
    for menu in menus:
        dispatch = next((item for item in dispatches if item["selector"] == menu["destination"]), None)
        if dispatch is None:
            continue
        for choice_index, choice_text in enumerate(menu["choices"]):
            if choice_index >= len(dispatch["targets"]):
                continue
            target_vaddr = dispatch["targets"][choice_index]
            target_offset = ecl_scan.vaddr_to_offset(target_vaddr, ecl_scan.DEFAULT_ADDRESS_ADDEND)
            if choice_text.upper() in combat_words and target_offset in path:
                tactical_choice = {
                    "menu_vaddr": menu["vaddr"],
                    "choices": menu["choices"],
                    "choice_index": choice_index,
                    "choice_text": choice_text,
                    "dispatch_vaddr": dispatch["vaddr"],
                    "target_vaddr": target_vaddr,
                    "indexing": "zero-based",
                }
                break
        if tactical_choice is not None:
            break
    return {**row, "menus": menus, "tactical_choice": tactical_choice}


def route_rows(game: dict[str, Any], layout: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ecl_file in game.get("ecl_files", []):
        for block in ecl_file.get("blocks", []):
            for candidate in block.get("candidates", []):
                if not candidate.get("roster"):
                    continue
                rows.append(annotate_route(layout, {
                    "ecl_file": ecl_file["file"],
                    "ecl_block": int(block["block_id"]),
                    "entry": candidate["entry"],
                    "combat_vaddr": int(candidate["combat_vaddr"]),
                    "roster": candidate["roster"],
                    "requires_runtime_seed": bool(candidate["requires_runtime_seed"]),
                    "branch_decisions": candidate.get("branch_decisions", []),
                    "path_offsets": candidate.get("path_offsets", []),
                }))
    return rows


def select_route(rows: list[dict[str, Any]], interactive: bool) -> dict[str, Any] | None:
    rows = [row for row in rows if bool(row["tactical_choice"]) == interactive]
    if not rows:
        return None
    return min(
        rows,
        key=lambda row: (
            row["requires_runtime_seed"],
            sum(item["kind"] != "immediate" for group in row["roster"] for item in group),
            len(row["branch_decisions"]),
            len(row["path_offsets"]),
            row["ecl_file"],
            row["ecl_block"],
        ),
    )


def stride_candidates(layout: dict[str, Any], record_size: int = 422) -> list[dict[str, Any]]:
    data = Path(layout["overlay_path"]).read_bytes()
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    rows: list[dict[str, Any]] = []
    for descriptor in layout["descriptors"]:
        start = int(descriptor["ovr_file_offset"])
        code = data[start:start + int(descriptor["code_size"])]
        for instruction in md.disasm(code, 0):
            if instruction.mnemonic not in DATA_MNEMONICS:
                continue
            if not any(
                operand.type == capstone.x86.X86_OP_IMM
                and (int(operand.imm) & 0xFFFF) == record_size
                for operand in instruction.operands
            ):
                continue
            rows.append({
                "descriptor_index": int(descriptor["index"]),
                "descriptor_relative_offset": int(instruction.address),
                "retail_file_offset": start + int(instruction.address),
                "mnemonic": instruction.mnemonic,
                "operands": instruction.op_str,
                "record_size": record_size,
                "status": "linear_disassembly_stride_candidate",
            })
    return rows


def monster_archives(layout: dict[str, Any]) -> dict[str, Any]:
    root = Path(layout["loader_path"]).parent
    archives = []
    sizes: set[int] = set()
    record_count = 0
    for path in sorted(root.glob("MON*CHA.DAX")):
        data = path.read_bytes()
        base, entries = dax_decode.parse_container(data)
        block_sizes = []
        for entry in entries:
            raw = dax_decode.decompress_block(data, base, entry)
            block_sizes.append(len(raw))
            sizes.add(len(raw))
            record_count += 1
        archives.append({"filename": path.name, "record_count": len(entries), "record_sizes": sorted(set(block_sizes))})
    return {"archives": archives, "record_count": record_count, "record_sizes": sorted(sizes)}


def monster_side_archives(layout: dict[str, Any]) -> dict[str, Any]:
    root = Path(layout["loader_path"]).parent
    cha_ids_by_area: dict[str, set[int]] = {}
    for path in sorted(root.glob("MON*CHA.DAX")):
        data = path.read_bytes()
        _, entries = dax_decode.parse_container(data)
        cha_ids_by_area[path.name[3:-7]] = {int(entry.block_id) for entry in entries}

    expected_sizes = {"SPC": 9, "ITM": 63 if layout["profile_id"].startswith("gateway") else 17}
    archives: list[dict[str, Any]] = []
    for kind, record_size in expected_sizes.items():
        for path in sorted(root.glob(f"MON*{kind}.DAX")):
            data = path.read_bytes()
            base, entries = dax_decode.parse_container(data)
            block_sizes = []
            ids = []
            record_count = 0
            for entry in entries:
                raw = dax_decode.decompress_block(data, base, entry)
                block_sizes.append(len(raw))
                ids.append(int(entry.block_id))
                if len(raw) % record_size == 0:
                    record_count += len(raw) // record_size
            area = path.name[3:-7]
            archives.append({
                "filename": path.name,
                "kind": kind,
                "block_count": len(entries),
                "record_count": record_count,
                "record_size": record_size,
                "block_sizes": sorted(set(block_sizes)),
                "all_blocks_aligned": all(size % record_size == 0 for size in block_sizes),
                "ids_subset_of_cha": set(ids) <= cha_ids_by_area.get(area, set()),
            })
    return {
        "archives": archives,
        "strict_status": "pass" if archives and all(
            row["all_blocks_aligned"] and row["ids_subset_of_cha"] for row in archives
        ) else "fail",
    }


def compact_item_expansion(layout: dict[str, Any]) -> dict[str, Any] | None:
    if layout["profile_id"] != "treasures-of-the-savage-frontier":
        return None
    data = Path(layout["overlay_path"]).read_bytes()
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    instruction_index: dict[tuple[str, str], list[dict[str, int]]] = {}
    descriptor_instructions: dict[int, list[Any]] = {}
    descriptor_starts: dict[int, int] = {}
    for descriptor in layout["descriptors"]:
        descriptor_index = int(descriptor["index"])
        start = int(descriptor["ovr_file_offset"])
        code = data[start:start + int(descriptor["code_size"])]
        instructions = list(md.disasm(code, 0))
        descriptor_instructions[descriptor_index] = instructions
        descriptor_starts[descriptor_index] = start
        for instruction in instructions:
            instruction_index.setdefault((instruction.mnemonic, instruction.op_str), []).append({
                "descriptor_index": descriptor_index,
                "descriptor_relative_offset": int(instruction.address),
                "retail_file_offset": start + int(instruction.address),
            })

    copy_descriptor = 18
    copy_sequence = [
        (0x57B5, "mov", "dx, 0x11"),
        (0x57BA, "les", "di, ptr [0x931a]"),
        (0x57C0, "add", "di, 0xffef"),
        (0x57C9, "add", "di, 0x2e"),
        (0x57CF, "mov", "ax, 0x11"),
        (0x57D3, "lcall", "0xa77, 0x1aaf"),
    ]
    decoded = {(int(ins.address), ins.mnemonic, ins.op_str) for ins in descriptor_instructions[copy_descriptor]}
    copy_proven = all(row in decoded for row in copy_sequence)
    fields = []
    for semantic, source_offsets, runtime_offsets, consumers in COMPACT_ITEM_FIELDS:
        anchors = [instruction_index.get(consumer, []) for consumer in consumers]
        fields.append({
            "semantic": semantic,
            "compact_offsets": source_offsets,
            "runtime_offsets": runtime_offsets,
            "consumer_anchors": [items[0] for items in anchors if items],
            "status": "copy_and_consumer_proven" if copy_proven and all(anchors) else "missing",
        })
    return {
        "source_record_size": 17,
        "runtime_tail_start": 0x2E,
        "runtime_tail_end": 0x3E,
        "copy_descriptor_index": copy_descriptor,
        "copy_sequence": [
            {
                "descriptor_relative_offset": offset,
                "retail_file_offset": descriptor_starts[copy_descriptor] + offset,
                "mnemonic": mnemonic,
                "operands": operands,
            }
            for offset, mnemonic, operands in copy_sequence
        ],
        "fields": fields,
        "strict_status": "pass" if copy_proven and all(row["status"] == "copy_and_consumer_proven" for row in fields) else "fail",
    }


def combat_xp_formula(layout: dict[str, Any]) -> dict[str, Any]:
    spec = XP_FORMULA_SPECS[layout["profile_id"]]
    descriptor = next(row for row in layout["descriptors"] if int(row["index"]) == spec["descriptor_index"])
    start = int(descriptor["ovr_file_offset"])
    data = Path(layout["overlay_path"]).read_bytes()
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    decoded = {
        (int(ins.address), ins.mnemonic, ins.op_str)
        for ins in md.disasm(data[start:start + int(descriptor["code_size"])], 0)
    }
    anchors = [
        {
            "descriptor_relative_offset": offset,
            "retail_file_offset": start + offset,
            "mnemonic": mnemonic,
            "operands": operands,
            "status": "proven" if (offset, mnemonic, operands) in decoded else "missing",
        }
        for offset, mnemonic, operands in spec["anchors"]
    ]
    return {
        "descriptor_index": int(spec["descriptor_index"]),
        "descriptor_file_offset": start,
        "monster_award": spec["monster_award"],
        "treasure_terms": spec["treasure_terms"],
        "item_award": spec["item_award"],
        "split_divisor": spec["split_divisor"],
        "anchors": anchors,
        "strict_status": "pass" if all(row["status"] == "proven" for row in anchors) else "fail",
    }


def combat_field_transfers(layout: dict[str, Any]) -> dict[str, Any]:
    spec = TRANSFER_SPECS[layout["profile_id"]]
    descriptor = next(row for row in layout["descriptors"] if int(row["index"]) == spec["descriptor_index"])
    data = Path(layout["overlay_path"]).read_bytes()
    start = int(descriptor["ovr_file_offset"])
    code = data[start:start + int(descriptor["code_size"])]
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    instructions = list(md.disasm(code, 0))
    text_index = {(ins.mnemonic, ins.op_str): int(ins.address) for ins in instructions}
    rows = []

    for semantic, source_base, runtime_base in spec["arrays"]:
        read_key = ("mov", f"dl, byte ptr es:[di + 0x{source_base:x}]")
        write_key = ("mov", f"byte ptr es:[di + 0x{runtime_base:x}], dl")
        read_offset = text_index.get(read_key)
        write_offset = text_index.get(write_key)
        rows.append({
            "semantic": semantic,
            "kind": "two-entry-indexed-array",
            "source_offsets": [source_base + 1, source_base + 2],
            "runtime_offsets": [runtime_base + 1, runtime_base + 2],
            "read_instruction_offset": read_offset,
            "write_instruction_offset": write_offset,
            "retail_read_file_offset": None if read_offset is None else start + read_offset,
            "retail_write_file_offset": None if write_offset is None else start + write_offset,
            "status": "consumer_copy_proven" if read_offset is not None and write_offset is not None else "missing",
        })

    for semantic, source_offset, runtime_offset in spec["scalars"]:
        read_key = ("mov", f"al, byte ptr es:[di + 0x{source_offset:x}]")
        write_key = ("mov", f"byte ptr es:[di + 0x{runtime_offset:x}], al")
        read_at = text_index.get(read_key)
        write_at = text_index.get(write_key)
        rows.append({
            "semantic": semantic,
            "kind": "scalar",
            "source_offsets": [source_offset],
            "runtime_offsets": [runtime_offset],
            "read_instruction_offset": read_at,
            "write_instruction_offset": write_at,
            "retail_read_file_offset": None if read_at is None else start + read_at,
            "retail_write_file_offset": None if write_at is None else start + write_at,
            "status": "consumer_copy_proven" if read_at is not None and write_at is not None else "missing",
        })
    all_instructions: dict[tuple[str, str], tuple[int, int]] = {}
    for candidate_descriptor in layout["descriptors"]:
        candidate_start = int(candidate_descriptor["ovr_file_offset"])
        candidate_code = data[candidate_start:candidate_start + int(candidate_descriptor["code_size"])]
        for instruction in md.disasm(candidate_code, 0):
            all_instructions.setdefault(
                (instruction.mnemonic, instruction.op_str),
                (int(candidate_descriptor["index"]), candidate_start + int(instruction.address)),
            )
    for semantic, source_offsets, mnemonic, operands in spec["direct"]:
        anchor = all_instructions.get((mnemonic, operands))
        rows.append({
            "semantic": semantic,
            "kind": "direct-title-local-consumer",
            "source_offsets": source_offsets,
            "runtime_offsets": [],
            "read_instruction_offset": None,
            "write_instruction_offset": None,
            "retail_read_file_offset": None if anchor is None else anchor[1],
            "retail_write_file_offset": None,
            "consumer_descriptor_index": None if anchor is None else anchor[0],
            "status": "direct_consumer_proven" if anchor is not None else "missing",
        })
    return {
        "descriptor_index": int(descriptor["index"]),
        "descriptor_file_offset": start,
        "fields": rows,
        "strict_status": "pass" if all(row["status"] in {"consumer_copy_proven", "direct_consumer_proven"} for row in rows) else "fail",
    }


def build_report(layouts: dict[str, Any], encounters: dict[str, Any]) -> dict[str, Any]:
    layout_index = {row["profile_id"]: row for row in layouts["games"]}
    encounter_index = {row["profile_id"]: row for row in encounters["games"]}
    games = []
    for profile_id in PROFILES:
        layout = layout_index[profile_id]
        routes = route_rows(encounter_index[profile_id], layout)
        interactive_route = select_route(routes, interactive=True)
        smoke_route = select_route(routes, interactive=False)
        monster = monster_archives(layout)
        side_tables = monster_side_archives(layout)
        compact_items = compact_item_expansion(layout)
        record_size = monster["record_sizes"][0] if len(monster["record_sizes"]) == 1 else None
        strides = stride_candidates(layout, record_size) if record_size is not None else []
        transfers = combat_field_transfers(layout)
        xp_formula = combat_xp_formula(layout)
        games.append({
            "profile_id": profile_id,
            "descriptor_count": len(layout["descriptors"]),
            "selected_route": interactive_route or smoke_route,
            "direct_smoke_route": smoke_route,
            "monster_archives": monster,
            "monster_side_archives": side_tables,
            "compact_item_expansion": compact_items,
            "record_size": record_size,
            "stride_candidates": strides,
            "combat_field_transfers": transfers,
            "combat_xp_formula": xp_formula,
            "runtime_priority": "gateway-first" if profile_id.startswith("gateway") else "after-gateway-profile",
        })
    gateway, treasures = games
    strict = (
        gateway["selected_route"] is not None
        and gateway["selected_route"]["requires_runtime_seed"]
        and gateway["selected_route"]["ecl_file"] == "ECL5.DAX"
        and gateway["selected_route"]["ecl_block"] == 19
        and gateway["selected_route"]["combat_vaddr"] == 0x8C34
        and gateway["selected_route"]["tactical_choice"] is not None
        and gateway["selected_route"]["tactical_choice"]["choice_index"] == 0
        and gateway["selected_route"]["tactical_choice"]["choice_text"] == "FIGHT"
        and gateway["selected_route"]["tactical_choice"]["target_vaddr"] == 0x8C25
        and gateway["direct_smoke_route"] is not None
        and not gateway["direct_smoke_route"]["requires_runtime_seed"]
        and gateway["direct_smoke_route"]["ecl_file"] == "ECL2.DAX"
        and gateway["direct_smoke_route"]["ecl_block"] == 82
        and gateway["direct_smoke_route"]["combat_vaddr"] == 0x82F3
        and gateway["record_size"] == 422
        and gateway["monster_archives"]["record_count"] == 72
        and len(gateway["stride_candidates"]) > 0
        and gateway["combat_field_transfers"]["strict_status"] == "pass"
        and gateway["combat_xp_formula"]["strict_status"] == "pass"
        and gateway["monster_side_archives"]["strict_status"] == "pass"
        and treasures["selected_route"] is not None
        and treasures["selected_route"]["requires_runtime_seed"]
        and treasures["selected_route"]["tactical_choice"] is not None
        and treasures["record_size"] == 510
        and treasures["monster_archives"]["record_count"] == 102
        and len(treasures["stride_candidates"]) > 0
        and treasures["combat_field_transfers"]["strict_status"] == "pass"
        and treasures["combat_xp_formula"]["strict_status"] == "pass"
        and treasures["monster_side_archives"]["strict_status"] == "pass"
        and treasures["compact_item_expansion"] is not None
        and treasures["compact_item_expansion"]["strict_status"] == "pass"
    )
    return {
        "schema_version": 1,
        "generator": "tools/map_savage_frontier_targets.py",
        "games": games,
        "strict_status": "pass" if strict else "fail",
        "claim_boundary": (
            "Gateway's selected ECL5#19 route is closed beyond static candidacy: a genuine GameLink "
            "campaign arrived at (15,2,W), presented the explicit player choice FIGHT/LEAVE, completed the "
            "Zhentil Fighter combat, resumed synchronously through host CALL 0x401F at (9,9,N), then "
            "completed descriptor 122's Griffon combat and persisted [0x4C6C]=1 through save/cold "
            "reload. The canonical Greybox browser route mirrors that cycle. The separate ECL2#82 "
            "route enters COMBAT directly and remains smoke evidence only. Gateway's ECL6 host now "
            "covers boat-abandon and NPC-gated exits, retail wandering encounters, title-local MON6 "
            "rosters, the recovered WILDCOM/RANDCOM floor, source placement, temporary cloud/downed "
            "tiles, and exact resume. Its remaining route boundary is the unobserved ECL2#1 entrance; "
            "native RNG continuity and fixed-map placement origin remain narrower fidelity gaps. Record sizes are "
            "decompressed archive facts; matching immediate instructions are linear-disassembly stride "
            "candidates, not semantic field consumers. The listed combat fields are separately proven by "
            "title-local source-to-runtime copy or direct-consumer instructions. The stored 32-bit "
            "character-experience field is distinct from the title-local kill-XP fields. The combat-award "
            "arithmetic, positive item-plus times 400 term, and living-party split are statically proven; "
            "the semantic names of the raw treasure globals remain provisional. Side-table "
            "keying and record boundaries are proven (Gateway SPC=9/ITM=63; Treasures SPC=9/ITM=17). "
            "Treasures race/category byte 0xAD has a title-local monster-code-6 consumer. Retail descriptor "
            "18 copies each compact 17-byte item source record into canonical runtime item offsets "
            "0x2E..0x3E, and every mapped field has a title-local consumer."
        ),
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Savage Frontier Runtime Targets",
        "",
        "> Generated by `tools/map_savage_frontier_targets.py`; do not edit by hand.",
        "",
        "| Game | Selected route | Runtime seed | Records | Size | Stride candidates | Priority |",
        "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ]
    for game in report["games"]:
        route = game["selected_route"]
        route_text = "none" if route is None else (
            f"`{route['ecl_file']}#{route['ecl_block']}` `{route['entry']}` -> `COMBAT 0x{route['combat_vaddr']:04X}`"
        )
        lines.append(
            f"| `{game['profile_id']}` | {route_text} | "
            f"`{str(bool(route and route['requires_runtime_seed'])).lower()}` | "
            f"{game['monster_archives']['record_count']} | {game['record_size']} | "
            f"{len(game['stride_candidates'])} | `{game['runtime_priority']}` |"
        )
        choice = route and route.get("tactical_choice")
        if choice:
            choices = ", ".join(f"`{item}`" for item in choice["choices"])
            lines.append(
                f"|  | Explicit tactical choice: `{choice['choice_text']}` index `{choice['choice_index']}` "
                f"from {choices} -> `0x{choice['target_vaddr']:04X}` |  |  |  |  |  |"
            )
    gateway_smoke = report["games"][0].get("direct_smoke_route")
    if gateway_smoke:
        lines.extend([
            "",
            "Gateway direct smoke route: "
            f"`{gateway_smoke['ecl_file']}#{gateway_smoke['ecl_block']}` "
            f"`{gateway_smoke['entry']}` -> `COMBAT 0x{gateway_smoke['combat_vaddr']:04X}`. "
            "It has no tactical-choice menu and cannot satisfy the interaction gate.",
        ])
    for game in report["games"]:
        lines.extend(["", f"## {game['profile_id']} {game['record_size']}-byte Candidates", "", "| Descriptor | Offset | Retail file | Instruction |", "| ---: | ---: | ---: | --- |"])
        for row in game["stride_candidates"]:
            lines.append(
                f"| {row['descriptor_index']} | `+0x{row['descriptor_relative_offset']:X}` | "
                f"`GAME.OVR+0x{row['retail_file_offset']:X}` | `{row['mnemonic']} {row['operands']}` |"
            )
        lines.extend([
            "",
            f"## {game['profile_id']} Combat Field Transfers",
            "",
            "| Field | Source | Runtime | Read instruction | Status |",
            "| --- | --- | --- | ---: | --- |",
        ])
        for field in game["combat_field_transfers"]["fields"]:
            source = ", ".join(f"`0x{value:X}`" for value in field["source_offsets"])
            runtime = ", ".join(f"`0x{value:X}`" for value in field["runtime_offsets"])
            read_file = field["retail_read_file_offset"]
            read_text = "missing" if read_file is None else f"`GAME.OVR+0x{read_file:X}`"
            lines.append(f"| `{field['semantic']}` | {source} | {runtime} | {read_text} | `{field['status']}` |")
        lines.extend([
            "",
            f"## {game['profile_id']} Monster Side Tables",
            "",
            "| Archive | Kind | Blocks | Records | Record size | Aligned | IDs in CHA |",
            "| --- | --- | ---: | ---: | ---: | --- | --- |",
        ])
        for side in game["monster_side_archives"]["archives"]:
            lines.append(
                f"| `{side['filename']}` | `{side['kind']}` | {side['block_count']} | "
                f"{side['record_count']} | {side['record_size']} | "
                f"`{str(side['all_blocks_aligned']).lower()}` | "
                f"`{str(side['ids_subset_of_cha']).lower()}` |"
            )
        compact = game.get("compact_item_expansion")
        if compact:
            lines.extend([
                "",
                f"## {game['profile_id']} Compact Item Expansion",
                "",
                "Retail descriptor 18 indexes 17-byte source records, copies each record into runtime",
                "item offsets `0x2E..0x3E`, and title-local consumers read the expanded fields.",
                "",
                "| Field | Compact source | Runtime item | First consumer | Status |",
                "| --- | --- | --- | ---: | --- |",
            ])
            for field in compact["fields"]:
                source = ", ".join(f"`0x{value:X}`" for value in field["compact_offsets"])
                runtime = ", ".join(f"`0x{value:X}`" for value in field["runtime_offsets"])
                anchor = field["consumer_anchors"][0]
                lines.append(
                    f"| `{field['semantic']}` | {source} | {runtime} | "
                    f"`GAME.OVR+0x{anchor['retail_file_offset']:X}` | `{field['status']}` |"
                )
        xp = game["combat_xp_formula"]
        lines.extend([
            "",
            f"## {game['profile_id']} Combat XP Formula",
            "",
            f"- Monster award: `{xp['monster_award']}`",
            f"- Treasure terms: `{ ' + '.join(xp['treasure_terms']) }`",
            f"- Carried-item award: `{xp['item_award']}`",
            f"- Split divisor: `{xp['split_divisor']}`",
            f"- Static anchor gate: **{xp['strict_status']}** ({len(xp['anchors'])} instructions)",
        ])
    lines.extend([
        "",
        "## Gateway Runtime Status and Remaining Gates",
        "",
        "Gateway's ECL5#19 route is closed in native DOS and the canonical `?explore=gateway` browser route.",
        "A genuine GameLink campaign arrived at `(15,2,W)`, presented descriptor 18's `FIGHT` / `LEAVE` choice,",
        "fought Zhentil Fighter roster `4,3,4`, and resumed synchronously through host `CALL 0x401F` at the",
        "tavern-sign cell `(9,9,N)`. Descriptor 122 then fought Griffon roster `42,3,42`; `[0x4C6C]=1`",
        "persisted through an original-DOS save and cold silent reload. The browser regression covers the same",
        "choice, combat/resume, second encounter, save, restart, and consumed-cell silence. ECL2#82 remains a",
        "direct-combat smoke route only.",
        "",
        "Gateway's ECL6 host also covers boat-abandon and NPC-gated exits, retail wandering encounters,",
        "title-local MON6 rosters, the recovered WILDCOM/RANDCOM 50x25 floor, source placement, temporary",
        "cloud/downed tiles, and exact resume. The remaining route boundary is the unobserved ECL2#1 entrance;",
        "native RNG continuity and fixed-map placement origin remain narrower fidelity gaps.",
        "Vision annotations remain advisory; retail bytes, GameLink cursor/RAM records, saved bytes, cold reload,",
        "and automated engine/browser tests are authoritative.",
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layouts", type=Path, default=DEFAULT_LAYOUTS)
    parser.add_argument("--encounters", type=Path, default=DEFAULT_ENCOUNTERS)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(
        json.loads(args.layouts.read_text(encoding="utf-8")),
        json.loads(args.encounters.read_text(encoding="utf-8")),
    )
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(markdown(report), encoding="utf-8")
    print("Savage Frontier targets: " + ", ".join(
        f"{row['profile_id']}={row['record_size']}B/{len(row['stride_candidates'])} strides" for row in report["games"]
    ))
    return 1 if args.strict and report["strict_status"] != "pass" else 0


if __name__ == "__main__":
    raise SystemExit(main())
