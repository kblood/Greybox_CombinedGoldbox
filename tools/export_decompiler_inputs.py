#!/usr/bin/env python3
"""Export deterministic, tool-neutral decompiler inputs from generated evidence maps.

The exporter deliberately uses collision-free synthetic linear addresses. Runtime selectors and
segments remain metadata until runtime evidence proves their loaded addresses. A later IDA/Ghidra
adapter can therefore reproduce the same blocks without turning unresolved relocation words into
false code references.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import struct
from pathlib import Path
from typing import Any

import gen1_map


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LAYOUTS = REPO_ROOT / "build/vroomm-layouts.json"
DEFAULT_RTLINK = REPO_ROOT / "build/rtlink-map-dqk-ckit.json"
DEFAULT_COAB = REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_SECRET_SYMBOLS = REPO_ROOT / "build/secret-runtime-symbols.json"
DEFAULT_GATEWAY_SYMBOLS = REPO_ROOT / "docs/engine/research/gateway-ecl-runtime-candidates.json"
DEFAULT_PATTERNS = REPO_ROOT / "build/goldbox-patterns.json"
DEFAULT_OUTPUT = REPO_ROOT / "build/decompiler-inputs"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/decompiler-project-inputs.md"
SCHEMA = "greybox-decompiler-inputs-v1"
SYNTHETIC_BASE = 0x00100000
BLOCK_STRIDE = 0x00010000
RESIDENT_REGION_SIZE = 0x00100000
PROTECTED_MODE_LIMIT = 0x01000000
APPROVED_CANDIDATE_PROFILES = {
    "secret-of-the-silver-blades",
    "gateway-to-the-savage-frontier",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def source_record(source_id: str, path: Path, role: str, data: bytes) -> dict[str, Any]:
    return {
        "id": source_id,
        "filename": path.name,
        "role": role,
        "size": len(data),
        "sha256": sha256_bytes(data),
    }


def block_address(ordinal: int) -> int:
    if ordinal == 0:
        return SYNTHETIC_BASE
    return SYNTHETIC_BASE + RESIDENT_REGION_SIZE + (ordinal - 1) * BLOCK_STRIDE


def block_record(
    block_id: str,
    name: str,
    kind: str,
    source_id: str,
    file_offset: int,
    size: int,
    ordinal: int,
    boundary_evidence: str,
    **metadata: Any,
) -> dict[str, Any]:
    row = {
        "id": block_id,
        "name": name,
        "kind": kind,
        "source_id": source_id,
        "source_file_offset": file_offset,
        "size": size,
        "synthetic_address": block_address(ordinal),
        "address_space": "synthetic-linear-32",
        "bitness": 16,
        "permissions": "r-x",
        "boundary_evidence": boundary_evidence,
    }
    row.update(metadata)
    return row


def import_name(raw: str, unit: int, file_offset: int, used: set[str]) -> str:
    stem = re.sub(r"[^A-Za-z0-9_]+", "_", raw).strip("_") or "function"
    if stem[0].isdigit():
        stem = f"fn_{stem}"
    candidate = f"coab_ovr{unit:03d}_{stem}"
    if candidate in used:
        candidate = f"{candidate}_{file_offset:06x}"
    used.add(candidate)
    return candidate


def containing_descriptor(descriptors: list[dict[str, Any]], file_offset: int) -> dict[str, Any] | None:
    return next(
        (
            row
            for row in descriptors
            if row["ovr_file_offset"] <= file_offset < row["ovr_file_offset"] + row["code_size"]
        ),
        None,
    )


def coab_symbols(
    profile_id: str,
    descriptors: list[dict[str, Any]],
    blocks: dict[str, dict[str, Any]],
    oracle: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if profile_id != "curse-of-the-azure-bonds" or not oracle:
        return []
    if oracle.get("profile_id") != profile_id:
        raise ValueError("CoAB oracle profile does not match the target package")

    symbols: list[dict[str, Any]] = []
    used: set[str] = set()
    for function in oracle.get("functions", []):
        descriptor = containing_descriptor(descriptors, function["retail_file_offset"])
        if descriptor is None:
            raise ValueError(f"CoAB symbol outside mapped descriptor: {function['symbol']}")
        block_id = f"ovr{descriptor['index']:03d}"
        offset = function["retail_file_offset"] - descriptor["ovr_file_offset"]
        preferred = function.get("canonical_candidate") or function["symbol"]
        symbols.append(
            {
                "name": import_name(preferred, function["unit"], function["retail_file_offset"], used),
                "raw_name": function["symbol"],
                "kind": "function",
                "block_id": block_id,
                "block_offset": offset,
                "synthetic_address": blocks[block_id]["synthetic_address"] + offset,
                "source_file_offset": function["retail_file_offset"],
                "provenance": function["evidence_status"],
                "confidence": "high" if function.get("borland_prologue") else "medium",
                "oracle_scope": "same-game-only",
                "unit": function["unit"],
                "unit_offset": function["unit_offset"],
            }
        )
    return symbols


def candidate_import_name(profile_id: str, raw: str, used: set[str]) -> str:
    profile = re.sub(r"[^A-Za-z0-9_]+", "_", profile_id).strip("_") or "game"
    stem = re.sub(r"[^A-Za-z0-9_]+", "_", raw).strip("_") or "function"
    candidate = f"candidate_{profile}_{stem}"
    suffix = 2
    while candidate in used:
        candidate = f"candidate_{profile}_{stem}_{suffix}"
        suffix += 1
    used.add(candidate)
    return candidate


def runtime_candidate_symbols(
    profile_id: str,
    descriptors: list[dict[str, Any]],
    blocks: dict[str, dict[str, Any]],
    report: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not report or report.get("profile_id") != profile_id:
        return []
    if profile_id not in APPROVED_CANDIDATE_PROFILES:
        raise ValueError("runtime candidate report is not approved for this profile")
    if report.get("strict_status") != "pass":
        raise ValueError("runtime candidate report did not pass its strict static gate")

    descriptor_index = {int(row["index"]): row for row in descriptors}
    candidates: list[dict[str, Any]] = []
    used: set[str] = set()
    for symbol in report.get("symbols", []):
        descriptor = descriptor_index.get(int(symbol["descriptor_index"]))
        if descriptor is None:
            raise ValueError(f"candidate symbol has no descriptor: {symbol['candidate_name']}")
        offset = int(symbol["descriptor_relative_offset"])
        if int(symbol["retail_file_offset"]) != int(descriptor["ovr_file_offset"]) + offset:
            raise ValueError(f"candidate symbol file offset mismatch: {symbol['candidate_name']}")
        block_id = f"ovr{int(descriptor['index']):03d}"
        candidates.append({
            "name": candidate_import_name(profile_id, symbol["candidate_name"], used),
            "raw_name": symbol["candidate_name"],
            "kind": "function",
            "block_id": block_id,
            "block_offset": offset,
            "synthetic_address": blocks[block_id]["synthetic_address"] + offset,
            "source_file_offset": int(symbol["retail_file_offset"]),
            "size": int(symbol["size"]),
            "provenance": symbol["semantic_status"],
            "confidence": "high-static-location",
            "status": "candidate",
            "claim_boundary": report["claim_boundary"],
            "evidence": "; ".join(symbol.get("evidence", [])),
        })
    return candidates


def gen1_package(
    layout: dict[str, Any],
    oracle: dict[str, Any] | None = None,
    runtime_candidates: dict[str, Any] | None = None,
) -> dict[str, Any]:
    loader_path = Path(layout["loader_path"])
    overlay_path = Path(layout["overlay_path"])
    loader = loader_path.read_bytes()
    overlay = overlay_path.read_bytes()
    mz = gen1_map.parse_mz(loader)
    if mz is None:
        raise ValueError(f"Gen1 loader is not MZ: {loader_path}")

    sources = [
        source_record("loader", loader_path, "resident-mz-loader", loader),
        source_record("overlay", overlay_path, "vroomm-fbov-tpov-pool", overlay),
    ]
    blocks: list[dict[str, Any]] = [
        block_record(
            "resident",
            "resident",
            "mz-resident-image",
            "loader",
            mz.header_bytes,
            mz.image_bytes - mz.header_bytes,
            0,
            "mz-header",
        )
    ]
    for descriptor in layout["descriptors"]:
        blocks.append(
            block_record(
                f"ovr{descriptor['index']:03d}",
                f"ovr{descriptor['index']:03d}",
                "vroomm-overlay-code",
                "overlay",
                descriptor["ovr_file_offset"],
                descriptor["code_size"],
                descriptor["index"] + 1,
                descriptor["fixup_format_status"],
                descriptor_index=descriptor["index"],
                loader_descriptor_file_offset=descriptor["loader_file_offset"],
                fixup_table_file_offset=descriptor["fixup_file_offset"],
                fixup_table_size=descriptor["fixup_size"],
                stub_array_file_offset=descriptor["stub_array_file_offset"],
                stub_count=descriptor["stub_count"],
            )
        )
    block_index = {row["id"]: row for row in blocks}

    relocations: list[dict[str, Any]] = []
    calls: list[dict[str, Any]] = []
    for descriptor in layout["descriptors"]:
        source_block_id = f"ovr{descriptor['index']:03d}"
        source_block = block_index[source_block_id]
        for entry in descriptor["fixup_entries"]:
            target_block_id = None
            target_block_offset = None
            target_address = None
            if entry.get("target_descriptor_index") is not None and entry.get("target_proc_offset") is not None:
                candidate_block_id = f"ovr{entry['target_descriptor_index']:03d}"
                candidate_block = block_index[candidate_block_id]
                if 0 <= entry["target_proc_offset"] < candidate_block["size"]:
                    target_block_id = candidate_block_id
                    target_block_offset = entry["target_proc_offset"]
                    target_address = candidate_block["synthetic_address"] + target_block_offset
            route_kind = entry.get("route_kind") or (
                "segment_load_no_offset"
                if entry["context"] == "mov_reg_segment_immediate"
                else "unclassified_relocation"
            )
            relocation = {
                "block_id": source_block_id,
                "block_offset": entry["code_offset"],
                "source_file_offset": descriptor["ovr_file_offset"] + entry["code_offset"],
                "width": 2,
                "kind": "vroomm-segment-word",
                "context": entry["context"],
                "original_value": entry["original_segment"],
                "route_status": route_kind,
                "target_block_id": target_block_id,
                "target_block_offset": target_block_offset,
                "target_synthetic_address": target_address,
                "candidate_target_descriptor_index": entry.get("target_descriptor_index"),
                "candidate_target_proc_offset": entry.get("target_proc_offset"),
                "candidate_target_ovr_file_offset": entry.get("target_ovr_file_offset"),
                "provenance": "retail-fixup-table",
            }
            relocations.append(relocation)
            if entry["context"] == "lcall_segment":
                instruction_offset = entry["instruction_offset"]
                calls.append(
                    {
                        "source_block_id": source_block_id,
                        "source_block_offset": instruction_offset,
                        "source_synthetic_address": source_block["synthetic_address"] + instruction_offset,
                        "encoded_target_offset": entry.get("call_target_offset"),
                        "encoded_segment_word": entry["original_segment"],
                        "route_status": route_kind,
                        "target_block_id": target_block_id,
                        "target_block_offset": target_block_offset,
                        "target_synthetic_address": target_address,
                        "candidate_target_descriptor_index": entry.get("target_descriptor_index"),
                        "candidate_target_proc_offset": entry.get("target_proc_offset"),
                        "candidate_target_ovr_file_offset": entry.get("target_ovr_file_offset"),
                        "provenance": "retail-fixup-table-and-stub-routing",
                    }
                )

    symbols = coab_symbols(layout["profile_id"], layout["descriptors"], block_index, oracle)
    candidate_symbols = runtime_candidate_symbols(
        layout["profile_id"], layout["descriptors"], block_index, runtime_candidates
    )
    entry_offset = mz.entry_cs * 16 + mz.entry_ip
    return {
        "schema": SCHEMA,
        "format_version": 1,
        "generator": "tools/export_decompiler_inputs.py",
        "profile_id": layout["profile_id"],
        "title": layout["title"],
        "engine_family": "gen1-vroomm",
        "container_format": "FBOV/TPOV/VROOMM",
        "address_model": {
            "kind": "synthetic-linear-32",
            "base": SYNTHETIC_BASE,
            "resident_region_size": RESIDENT_REGION_SIZE,
            "block_stride": BLOCK_STRIDE,
            "runtime_address_claim": False,
        },
        "source_files": sources,
        "entry_point": {
            "block_id": "resident",
            "block_offset": entry_offset,
            "synthetic_address": block_index["resident"]["synthetic_address"] + entry_offset,
            "original_cs": mz.entry_cs,
            "original_ip": mz.entry_ip,
        },
        "blocks": blocks,
        "relocations": relocations,
        "calls": calls,
        "symbols": symbols,
        "candidate_symbols": candidate_symbols,
        "claims_boundary": [
            "Synthetic addresses separate mutually exclusive overlays and are not runtime segment claims.",
            "Unresolved selector words remain unresolved and do not create references.",
            "Semantic source-oracle names are imported only into the matching CoAB retail binary.",
            "Candidate labels remain explicitly nonsemantic until their title-local runtime gate passes.",
        ],
        "statistics": {
            "blocks": len(blocks),
            "relocations": len(relocations),
            "calls": len(calls),
            "resolved_calls": sum(1 for row in calls if row["target_block_id"] is not None),
            "symbols": len(symbols),
            "candidate_symbols": len(candidate_symbols),
        },
    }


def parse_mz_relocations(data: bytes, mz: dict[str, Any]) -> list[tuple[int, int]]:
    rows: list[tuple[int, int]] = []
    for index in range(mz["relocation_count"]):
        pos = mz["relocation_table"] + index * 4
        if pos + 4 > len(data):
            raise ValueError("MZ relocation table extends beyond source file")
        offset, segment = struct.unpack_from("<HH", data, pos)
        rows.append((segment, offset))
    return rows


def rtlink_profile(path: Path) -> tuple[str, str]:
    if path.name.upper() == "DQK.EXE":
        return "dark-queen-of-krynn", "The Dark Queen of Krynn"
    if path.name.upper() == "CKIT.EXE":
        return "forgotten-realms-unlimited-adventures", "Forgotten Realms: Unlimited Adventures"
    stem = re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-")
    return stem, path.stem


def gen2_package(mapped: dict[str, Any]) -> dict[str, Any]:
    source_path = Path(mapped["path"])
    data = source_path.read_bytes()
    if sha256_bytes(data) != mapped["sha256"]:
        raise ValueError(f"RTLink source hash drift: {source_path}")
    profile_id, title = rtlink_profile(source_path)
    mz = mapped["mz"]
    blocks: list[dict[str, Any]] = [
        block_record(
            "resident",
            "resident",
            "mz-resident-image",
            "executable",
            mz["header_bytes"],
            mz["image_bytes"] - mz["header_bytes"],
            0,
            "mz-header",
        )
    ]
    for overlay in mapped["overlays"]:
        if overlay["code_start"] is None or overlay["code_size"] is None:
            file_offset = overlay["file_offset"]
            size = overlay["blob_size"]
            boundary = "unresolved-code-boundary-whole-blob"
        else:
            file_offset = overlay["code_start"]
            size = overlay["code_size"]
            boundary = overlay["prefix_source"]
        blocks.append(
            block_record(
                f"ovr{overlay['index']:03d}",
                f"ovr{overlay['index']:03d}",
                "rtlink-overlay-code",
                "executable",
                file_offset,
                size,
                overlay["index"] + 1,
                boundary,
                descriptor_index=overlay["index"],
                descriptor_file_offset=overlay["table_file_offset"],
                blob_file_offset=overlay["file_offset"],
                blob_size=overlay["blob_size"],
                runtime_segment=overlay["runtime_seg"],
                runtime_segment_claim="descriptor-metadata-only",
                prefix_source=overlay["prefix_source"],
            )
        )
    block_index = {row["id"]: row for row in blocks}

    relocations: list[dict[str, Any]] = []
    for segment, offset in parse_mz_relocations(data, mz):
        block_offset = segment * 16 + offset
        file_offset = mz["header_bytes"] + block_offset
        original = struct.unpack_from("<H", data, file_offset)[0] if file_offset + 2 <= len(data) else None
        relocations.append(
            {
                "block_id": "resident",
                "block_offset": block_offset,
                "source_file_offset": file_offset,
                "width": 2,
                "kind": "mz-load-segment-word",
                "context": "mz-relocation",
                "original_value": original,
                "route_status": "load-segment-relative",
                "target_block_id": None,
                "target_block_offset": None,
                "target_synthetic_address": None,
                "original_segment": segment,
                "original_offset": offset,
                "provenance": "mz-relocation-table",
            }
        )

    calls: list[dict[str, Any]] = []
    for stub in mapped["stubs"]:
        source_offset = stub["file_offset"] - mz["header_bytes"]
        target_block_id = None
        target_block_offset = None
        target_address = None
        if stub["target_overlay_index"] is not None and stub["target_file_offset"] is not None:
            candidate = f"ovr{stub['target_overlay_index']:03d}"
            target_block = block_index.get(candidate)
            if target_block and target_block["source_file_offset"] <= stub["target_file_offset"] < target_block["source_file_offset"] + target_block["size"]:
                target_block_id = candidate
                target_block_offset = stub["target_file_offset"] - target_block["source_file_offset"]
                target_address = target_block["synthetic_address"] + target_block_offset
        calls.append(
            {
                "source_block_id": "resident",
                "source_block_offset": source_offset,
                "source_synthetic_address": block_index["resident"]["synthetic_address"] + source_offset,
                "encoded_target_offset": stub["ljmp_off"],
                "encoded_segment_word": stub["ljmp_seg"],
                "route_status": stub["target_status"],
                "target_block_id": target_block_id,
                "target_block_offset": target_block_offset,
                "target_synthetic_address": target_address,
                "overlay_index": stub["overlay_index"],
                "provenance": "retail-resident-rtlink-stub",
            }
        )

    entry_offset = mz["entry_cs"] * 16 + mz["entry_ip"]
    return {
        "schema": SCHEMA,
        "format_version": 1,
        "generator": "tools/export_decompiler_inputs.py",
        "profile_id": profile_id,
        "title": title,
        "engine_family": "gen2-rtlink-plus",
        "container_format": "MZ/RTLink-Plus",
        "address_model": {
            "kind": "synthetic-linear-32",
            "base": SYNTHETIC_BASE,
            "resident_region_size": RESIDENT_REGION_SIZE,
            "block_stride": BLOCK_STRIDE,
            "runtime_address_claim": False,
        },
        "source_files": [source_record("executable", source_path, "mz-and-rtlink-overlays", data)],
        "entry_point": {
            "block_id": "resident",
            "block_offset": entry_offset,
            "synthetic_address": block_index["resident"]["synthetic_address"] + entry_offset,
            "original_cs": mz["entry_cs"],
            "original_ip": mz["entry_ip"],
        },
        "blocks": blocks,
        "relocations": relocations,
        "calls": calls,
        "symbols": [],
        "candidate_symbols": [],
        "claims_boundary": [
            "Synthetic addresses separate RTLink overlays and are not runtime segment claims.",
            "RTLink code boundaries retain their prefix evidence, including approximations and unknowns.",
            "MZ relocations do not create semantic cross-overlay references by themselves.",
            "No DQK or FRUA semantic names are promoted by structural similarity alone.",
        ],
        "statistics": {
            "blocks": len(blocks),
            "relocations": len(relocations),
            "calls": len(calls),
            "resolved_calls": sum(1 for row in calls if row["target_block_id"] is not None),
            "symbols": 0,
            "candidate_symbols": 0,
        },
    }


def validate_package(package: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if package.get("schema") != SCHEMA:
        errors.append("wrong schema")
    source_index = {row["id"]: row for row in package.get("source_files", [])}
    block_index = {row["id"]: row for row in package.get("blocks", [])}
    if len(block_index) != len(package.get("blocks", [])):
        errors.append("duplicate block id")
    for block in package.get("blocks", []):
        source = source_index.get(block["source_id"])
        if source is None:
            errors.append(f"{block['id']}: missing source")
        elif block["source_file_offset"] < 0 or block["source_file_offset"] + block["size"] > source["size"]:
            errors.append(f"{block['id']}: source range out of bounds")
        capacity = RESIDENT_REGION_SIZE if block["id"] == "resident" else BLOCK_STRIDE
        if block["size"] > capacity:
            errors.append(f"{block['id']}: block exceeds synthetic stride")
        if block["synthetic_address"] + block["size"] > PROTECTED_MODE_LIMIT:
            errors.append(f"{block['id']}: block exceeds 16-bit protected-mode address space")
    for collection, source_key, offset_key in [
        ("relocations", "block_id", "block_offset"),
        ("calls", "source_block_id", "source_block_offset"),
        ("symbols", "block_id", "block_offset"),
        ("candidate_symbols", "block_id", "block_offset"),
        ("signature_seeds", "block_id", "block_offset"),
    ]:
        for index, row in enumerate(package.get(collection, [])):
            block = block_index.get(row[source_key])
            if block is None:
                errors.append(f"{collection}[{index}]: missing block")
            elif not 0 <= row[offset_key] < block["size"]:
                errors.append(f"{collection}[{index}]: block offset out of bounds")
            target_id = row.get("target_block_id")
            if target_id is not None:
                target = block_index.get(target_id)
                target_offset = row.get("target_block_offset")
                if target is None or target_offset is None or not 0 <= target_offset < target["size"]:
                    errors.append(f"{collection}[{index}]: invalid target")
                elif row.get("target_synthetic_address") != target["synthetic_address"] + target_offset:
                    errors.append(f"{collection}[{index}]: target address mismatch")
    if package.get("profile_id") != "curse-of-the-azure-bonds" and package.get("symbols"):
        errors.append("semantic symbols escaped the same-game CoAB package")
    for index, candidate in enumerate(package.get("candidate_symbols", [])):
        if package.get("profile_id") not in APPROVED_CANDIDATE_PROFILES:
            errors.append(f"candidate_symbols[{index}]: candidate escaped approved packages")
        if candidate.get("status") != "candidate" or not candidate.get("name", "").startswith("candidate_"):
            errors.append(f"candidate_symbols[{index}]: candidate identity is not explicit")
        block = block_index.get(candidate.get("block_id"))
        if block and candidate.get("size", 0) <= 0:
            errors.append(f"candidate_symbols[{index}]: invalid function size")
        elif block and candidate["block_offset"] + candidate["size"] > block["size"]:
            errors.append(f"candidate_symbols[{index}]: function extends beyond block")
    seed_names: set[str] = set()
    for index, seed in enumerate(package.get("signature_seeds", [])):
        block = block_index.get(seed["block_id"])
        if block and seed["block_offset"] + seed["size"] > block["size"]:
            errors.append(f"signature_seeds[{index}]: function extends beyond block")
        if seed["name"] in seed_names:
            errors.append(f"signature_seeds[{index}]: duplicate name")
        seed_names.add(seed["name"])
        if seed["match_kind"] not in {"exact", "relocation-normalized"}:
            errors.append(f"signature_seeds[{index}]: structural seed forbidden")
        if seed["semantic_name"] and package.get("profile_id") != "curse-of-the-azure-bonds":
            errors.append(f"signature_seeds[{index}]: semantic name escaped CoAB")
        if any(offset < 0 or offset >= seed["size"] for offset in seed["variant_offsets"]):
            errors.append(f"signature_seeds[{index}]: variant offset out of range")
        if len(seed["flirt_pattern32"]) != min(32, seed["size"]) * 2:
            errors.append(f"signature_seeds[{index}]: invalid pattern width")
    serialized = json.dumps(package, sort_keys=True)
    if re.search(r"[A-Za-z]:[/\\]", serialized):
        errors.append("manifest contains a host-absolute path")
    return errors


def package_identity(package: dict[str, Any]) -> tuple[str, tuple[str, ...]]:
    return package["profile_id"], tuple(row["sha256"] for row in package["source_files"])


def package_id(package: dict[str, Any], profile_revisions: dict[str, int]) -> str:
    profile_id = package["profile_id"]
    if profile_revisions[profile_id] == 1:
        return profile_id
    digest = package["source_files"][-1]["sha256"][:12]
    return f"{profile_id}-{digest}"


def signature_variant_offsets(data: bytes) -> list[int]:
    try:
        import capstone
    except ImportError as exc:
        raise RuntimeError("capstone is required for signature seed generation") from exc
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    offsets: set[int] = set()
    for instruction in md.disasm(data, 0):
        for relative, size in (
            (instruction.imm_offset, instruction.imm_size),
            (instruction.disp_offset, instruction.disp_size),
        ):
            if relative and size:
                offsets.update(range(instruction.address + relative, instruction.address + relative + size))
    return sorted(offset for offset in offsets if offset < len(data))


def signature_pattern(data: bytes, variants: list[int], width: int = 32) -> str:
    variant_set = set(variants)
    return "".join(".." if index in variant_set else f"{byte:02X}" for index, byte in enumerate(data[:width]))


def signature_eligible(row: dict[str, Any]) -> tuple[bool, str]:
    if row["match_kind"] == "exact":
        if row["confidence"] not in {"high", "medium"}:
            return False, "exact-low-confidence"
        if row["size"] < 8:
            return False, "exact-too-short"
        return True, "eligible-exact"
    if row["match_kind"] == "relocation-normalized":
        if row["confidence"] != "high":
            return False, "normalized-not-high-confidence"
        if row["size"] < 12 or row["instruction_count"] < 5:
            return False, "normalized-too-short"
        return True, "eligible-relocation-normalized"
    return False, "structural-only-rejected"


def attach_signature_seeds(packages: list[dict[str, Any]], patterns: dict[str, Any]) -> dict[str, int]:
    by_hash: dict[str, list[tuple[dict[str, Any], str]]] = {}
    for package in packages:
        package["signature_seeds"] = []
        package["statistics"]["signature_seeds"] = 0
        for source in package["source_files"]:
            by_hash.setdefault(source["sha256"], []).append((package, source["id"]))

    path_cache: dict[str, tuple[str, bytes]] = {}
    exclusions: dict[str, int] = {}
    seen: set[tuple[str, int, int]] = set()
    used_names: dict[str, set[str]] = {package["profile_id"]: set() for package in packages}
    for row in patterns.get("function_cluster_index", []):
        eligible, reason = signature_eligible(row)
        if not eligible:
            exclusions[reason] = exclusions.get(reason, 0) + 1
            continue
        source_path = str(row["source"])
        cached = path_cache.get(source_path)
        if cached is None:
            path = Path(source_path)
            if not path.exists():
                exclusions["source-missing"] = exclusions.get("source-missing", 0) + 1
                continue
            source_data = path.read_bytes()
            cached = (sha256_bytes(source_data), source_data)
            path_cache[source_path] = cached
        source_hash, source_data = cached
        destinations = by_hash.get(source_hash, [])
        if not destinations:
            exclusions["source-not-in-package"] = exclusions.get("source-not-in-package", 0) + 1
            continue
        start = row["offset"]
        end = start + row["size"]
        if end > len(source_data):
            exclusions["function-out-of-source"] = exclusions.get("function-out-of-source", 0) + 1
            continue
        raw = source_data[start:end]
        variants = signature_variant_offsets(raw)
        for package, source_id in destinations:
            block = next(
                (
                    candidate
                    for candidate in package["blocks"]
                    if candidate["source_id"] == source_id
                    and candidate["source_file_offset"] <= start
                    and end <= candidate["source_file_offset"] + candidate["size"]
                ),
                None,
            )
            if block is None:
                exclusions["outside-imported-code-block"] = exclusions.get("outside-imported-code-block", 0) + 1
                continue
            block_offset = start - block["source_file_offset"]
            address = block["synthetic_address"] + block_offset
            identity = (package["profile_id"], address, row["size"])
            if identity in seen:
                continue
            seen.add(identity)
            semantic = next((symbol for symbol in package["symbols"] if symbol["synthetic_address"] == address), None)
            stem = "exact" if row["match_kind"] == "exact" else "norm"
            base_name = semantic["name"] if semantic else f"gbx_{stem}_{row['normalized_sha256'][:16]}"
            name = base_name
            names = used_names[package["profile_id"]]
            if name in names:
                name = f"{base_name}_at_{address:07x}"
            names.add(name)
            package["signature_seeds"].append(
                {
                    "name": name,
                    "block_id": block["id"],
                    "block_offset": block_offset,
                    "synthetic_address": address,
                    "source_file_offset": start,
                    "size": row["size"],
                    "instruction_count": row["instruction_count"],
                    "match_kind": row["match_kind"],
                    "confidence": row["confidence"],
                    "source_count": row["source_count"],
                    "cluster_hash": row["normalized_sha256"],
                    "exact_sha256": sha256_bytes(raw),
                    "variant_offsets": variants,
                    "flirt_pattern32": signature_pattern(raw, variants),
                    "semantic_name": semantic is not None,
                    "provenance": "cross-source-exact" if row["match_kind"] == "exact" else "cross-source-relocation-normalized",
                }
            )
    for package in packages:
        package["signature_seeds"].sort(key=lambda row: (row["synthetic_address"], row["name"]))
        package["statistics"]["signature_seeds"] = len(package["signature_seeds"])
    return dict(sorted(exclusions.items()))


CSV_FIELDS = {
    "segments.csv": [
        "block_id", "name", "kind", "source_id", "source_filename", "source_sha256",
        "source_file_offset", "size", "synthetic_address", "bitness", "permissions",
        "boundary_evidence", "descriptor_index", "runtime_segment", "runtime_segment_claim",
    ],
    "relocations.csv": [
        "block_id", "block_offset", "source_file_offset", "width", "kind", "context",
        "original_value", "route_status", "target_block_id", "target_block_offset",
        "target_synthetic_address", "candidate_target_descriptor_index",
        "candidate_target_proc_offset", "candidate_target_ovr_file_offset", "original_segment",
        "original_offset", "provenance",
    ],
    "calls.csv": [
        "source_block_id", "source_block_offset", "source_synthetic_address",
        "encoded_target_offset", "encoded_segment_word", "route_status", "target_block_id",
        "target_block_offset", "target_synthetic_address", "candidate_target_descriptor_index",
        "candidate_target_proc_offset", "candidate_target_ovr_file_offset", "overlay_index",
        "provenance",
    ],
    "symbols.csv": [
        "name", "raw_name", "kind", "block_id", "block_offset", "synthetic_address",
        "source_file_offset", "provenance", "confidence", "oracle_scope", "unit", "unit_offset",
    ],
    "candidate-symbols.csv": [
        "name", "raw_name", "kind", "block_id", "block_offset", "synthetic_address",
        "source_file_offset", "size", "provenance", "confidence", "status",
        "claim_boundary", "evidence",
    ],
    "signature-seeds.csv": [
        "name", "block_id", "block_offset", "synthetic_address", "source_file_offset", "size",
        "instruction_count", "match_kind", "confidence", "source_count", "cluster_hash",
        "exact_sha256", "variant_offsets", "flirt_pattern32", "semantic_name", "provenance",
    ],
}


def csv_text(rows: list[dict[str, Any]], fields: list[str]) -> str:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({field: "" if row.get(field) is None else row.get(field, "") for field in fields})
    return stream.getvalue()


def package_csv(package: dict[str, Any]) -> dict[str, str]:
    sources = {row["id"]: row for row in package["source_files"]}
    segments = []
    for block in package["blocks"]:
        source = sources[block["source_id"]]
        segments.append(
            {
                "block_id": block["id"],
                **block,
                "source_filename": source["filename"],
                "source_sha256": source["sha256"],
            }
        )
    collections = {
        "segments.csv": segments,
        "relocations.csv": package["relocations"],
        "calls.csv": package["calls"],
        "symbols.csv": package["symbols"],
        "candidate-symbols.csv": package.get("candidate_symbols", []),
        "signature-seeds.csv": [
            {**row, "variant_offsets": " ".join(str(value) for value in row["variant_offsets"])}
            for row in package.get("signature_seeds", [])
        ],
    }
    return {name: csv_text(collections[name], fields) for name, fields in CSV_FIELDS.items()}


def package_readme(package: dict[str, Any]) -> str:
    source_rows = "\n".join(
        f"- `{row['filename']}`: {row['size']} bytes, SHA-256 `{row['sha256']}` ({row['role']})"
        for row in package["source_files"]
    )
    boundaries = "\n".join(f"- {line}" for line in package["claims_boundary"])
    return f"""# {package['title']} Decompiler Inputs

Generated by `python tools/export_decompiler_inputs.py --strict`.

## Retail Sources

{source_rows}

## Import

Use a 16-bit x86 protected-mode database and the checked-in helper matching the decompiler:

- Ghidra: `tools/decompiler/ghidra_import.py <manifest.json> <game-directory>`
- IDA: `tools/decompiler/ida_import.py <manifest.json> <game-directory>`

The helper locates source files by filename and SHA-256. See `tools/decompiler/README.md` for project
creation details. `segments.csv`, `relocations.csv`, `calls.csv`, `symbols.csv`,
`candidate-symbols.csv`, and `signature-seeds.csv` provide the same data for manual or alternate
importers. Candidate symbols are visibly prefixed and are not semantic signature inputs.

## Evidence Boundary

{boundaries}

Statistics: {package['statistics']['blocks']} blocks, {package['statistics']['relocations']}
relocations, {package['statistics']['calls']} routed calls
({package['statistics']['resolved_calls']} resolved), {package['statistics']['symbols']} symbols,
{package['statistics'].get('candidate_symbols', 0)} candidate symbols, and
{package['statistics'].get('signature_seeds', 0)} signature seeds.
"""


def build_packages(
    layouts_path: Path = DEFAULT_LAYOUTS,
    rtlink_path: Path = DEFAULT_RTLINK,
    coab_path: Path = DEFAULT_COAB,
    patterns_path: Path = DEFAULT_PATTERNS,
    secret_symbols_path: Path = DEFAULT_SECRET_SYMBOLS,
    gateway_symbols_path: Path = DEFAULT_GATEWAY_SYMBOLS,
) -> list[dict[str, Any]]:
    layouts = read_json(layouts_path)
    rtlink = read_json(rtlink_path)
    oracle = read_json(coab_path) if coab_path.exists() else None
    secret_candidates = read_json(secret_symbols_path) if secret_symbols_path.exists() else None
    gateway_candidates = read_json(gateway_symbols_path) if gateway_symbols_path.exists() else None
    runtime_candidates = {
        report["profile_id"]: report
        for report in (secret_candidates, gateway_candidates)
        if report is not None
    }
    patterns = read_json(patterns_path)
    candidates = [
        gen1_package(row, oracle, runtime_candidates.get(row["profile_id"]))
        for row in layouts["games"]
    ]
    candidates.extend(gen2_package(row) for row in rtlink)

    unique: dict[tuple[str, tuple[str, ...]], dict[str, Any]] = {}
    for package in candidates:
        unique.setdefault(package_identity(package), package)
    packages = sorted(unique.values(), key=lambda row: (row["profile_id"], package_identity(row)[1]))
    revision_counts: dict[str, int] = {}
    for package in packages:
        revision_counts[package["profile_id"]] = revision_counts.get(package["profile_id"], 0) + 1
    for package in packages:
        package["package_id"] = package_id(package, revision_counts)
    exclusions = attach_signature_seeds(packages, patterns)
    for package in packages:
        package["signature_seed_exclusions"] = exclusions
    return packages


def write_packages(packages: list[dict[str, Any]], output: Path) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    index_rows = []
    for package in packages:
        errors = validate_package(package)
        if errors:
            raise ValueError(f"{package['package_id']}: " + "; ".join(errors))
        package_dir = output / package["package_id"]
        package_dir.mkdir(parents=True, exist_ok=True)
        (package_dir / "manifest.json").write_text(
            json.dumps(package, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        for filename, content in package_csv(package).items():
            (package_dir / filename).write_text(content, encoding="utf-8", newline="")
        (package_dir / "README.md").write_text(package_readme(package), encoding="utf-8")
        index_rows.append(
            {
                "package_id": package["package_id"],
                "profile_id": package["profile_id"],
                "title": package["title"],
                "engine_family": package["engine_family"],
                "source_sha256": [row["sha256"] for row in package["source_files"]],
                "statistics": package["statistics"],
                "manifest": f"{package['package_id']}/manifest.json",
                "tables": {
                    "segments": f"{package['package_id']}/segments.csv",
                    "relocations": f"{package['package_id']}/relocations.csv",
                    "calls": f"{package['package_id']}/calls.csv",
                    "symbols": f"{package['package_id']}/symbols.csv",
                    "candidate_symbols": f"{package['package_id']}/candidate-symbols.csv",
                    "signature_seeds": f"{package['package_id']}/signature-seeds.csv",
                },
            }
        )
    index = {
        "schema": SCHEMA,
        "format_version": 1,
        "generator": "tools/export_decompiler_inputs.py",
        "package_count": len(index_rows),
        "packages": index_rows,
    }
    (output / "index.json").write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "README.md").write_text(
        "# Generated Greybox Decompiler Inputs\n\n"
        "Regenerate with `python tools/export_decompiler_inputs.py --strict`. The package index is "
        "`index.json`; import instructions are checked in at `tools/decompiler/README.md`.\n",
        encoding="utf-8",
    )
    return index


def markdown_report(packages: list[dict[str, Any]], index: dict[str, Any]) -> str:
    total_blocks = sum(row["statistics"]["blocks"] for row in packages)
    total_relocations = sum(row["statistics"]["relocations"] for row in packages)
    total_calls = sum(row["statistics"]["calls"] for row in packages)
    total_resolved = sum(row["statistics"]["resolved_calls"] for row in packages)
    total_symbols = sum(row["statistics"]["symbols"] for row in packages)
    total_candidates = sum(row["statistics"].get("candidate_symbols", 0) for row in packages)
    total_seeds = sum(row["statistics"].get("signature_seeds", 0) for row in packages)
    lines = [
        "# Reproducible Decompiler Project Inputs",
        "",
        "> Generated by `python tools/export_decompiler_inputs.py --strict`. Do not hand-edit the",
        "> package matrix or totals. Generated packages live under `build/decompiler-inputs/`.",
        "",
        "## Result",
        "",
        f"The current corpus emits **{index['package_count']}** unique retail packages with "
        f"**{total_blocks}** memory blocks, **{total_relocations}** relocation rows, "
        f"**{total_calls}** routed calls (**{total_resolved}** statically resolved), and "
        f"**{total_symbols}** same-game semantic symbols, **{total_candidates}** explicitly nonsemantic "
        f"candidate symbols, and **{total_seeds}** conservative signature seeds.",
        "",
        "Exact duplicate CoK/DoK installs in the workspace and GOG library are deduplicated by the",
        "loader/overlay SHA-256 pair. Different retail revisions receive hash-suffixed package IDs.",
        "",
        "| Package | Family | Blocks | Relocations | Calls | Resolved | Symbols | Candidates | Seeds |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for package in packages:
        stats = package["statistics"]
        lines.append(
            f"| `{package['package_id']}` | `{package['engine_family']}` | {stats['blocks']} | "
            f"{stats['relocations']} | {stats['calls']} | {stats['resolved_calls']} | {stats['symbols']} | "
            f"{stats.get('candidate_symbols', 0)} | "
            f"{stats.get('signature_seeds', 0)} |"
        )
    lines.extend(
        [
            "",
            "## Reproduction",
            "",
            "```powershell",
            "pnpm corpus",
            "python tools/export_decompiler_inputs.py --strict",
            "python -m unittest tools.test_goldbox_corpus",
            "```",
            "",
            "Each package contains `manifest.json`, `segments.csv`, `relocations.csv`, `calls.csv`,",
            "`symbols.csv`, `candidate-symbols.csv`, `signature-seeds.csv`, and a source-hash/import README. The checked-in helpers and setup",
            "instructions are in `tools/decompiler/`.",
            "",
            "## Address and Evidence Contract",
            "",
            "The resident image occupies a dedicated 1 MiB synthetic region beginning at `0x00100000`;",
            "each overlay then receives one collision-free 64 KiB slot. Projects use 16-bit x86",
            "protected-mode addressing solely so every mutually exclusive overlay can coexist in one",
            "database. These synthetic addresses are never presented as DOS runtime segments.",
            "",
            "Gen1 relocation rows come from the retail VROOMM fixup arrays. Only in-bounds routed",
            "stub/direct targets become references. Unresolved selectors and DoK's out-of-range public",
            "stub candidates retain their raw values and rejection status. Gen2 rows expand every MZ",
            "relocation and RTLink resident stub; DQK verified boundaries and CKIT's approximate/unknown",
            "prefix evidence remain distinguishable.",
            "",
            "All 851 semantic symbols are CoAB listing functions mapped back to CoAB's own retail",
            "descriptor offsets. No CoAB name is copied into Pool, Secret, Krynn, Savage Frontier, NWN,",
            "DQK, or FRUA from structural similarity alone.",
            "",
            "Signature seeds include only exact high/medium-confidence functions of at least eight",
            "bytes and relocation-normalized high-confidence functions of at least twelve bytes/five",
            "instructions. Current exclusions are 505 low-confidence exact and 651 non-high normalized",
            "candidates. Control-flow-shape clusters never become FLIRT/Function-ID seeds.",
            "",
            "## Open Gate",
            "",
            "Neither IDA nor Ghidra is installed in the current build environment. Helper syntax, source",
            "hashes, source/block ranges, target references, protected-mode limits, CSV parity, and strict",
            "retail regeneration are verified locally. A real project import in each decompiler remains",
            "environment-pending and must be recorded here before P1.4 is called fully complete.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layouts", type=Path, default=DEFAULT_LAYOUTS)
    parser.add_argument("--rtlink", type=Path, default=DEFAULT_RTLINK)
    parser.add_argument("--coab", type=Path, default=DEFAULT_COAB)
    parser.add_argument("--secret-symbols", type=Path, default=DEFAULT_SECRET_SYMBOLS)
    parser.add_argument("--gateway-symbols", type=Path, default=DEFAULT_GATEWAY_SYMBOLS)
    parser.add_argument("--patterns", type=Path, default=DEFAULT_PATTERNS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    packages = build_packages(
        args.layouts,
        args.rtlink,
        args.coab,
        args.patterns,
        args.secret_symbols,
        args.gateway_symbols,
    )
    index = write_packages(packages, args.output)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.write_text(markdown_report(packages, index), encoding="utf-8")
    families: dict[str, int] = {}
    for row in index["packages"]:
        families[row["engine_family"]] = families.get(row["engine_family"], 0) + 1
    print(f"decompiler inputs: {index['package_count']} packages {dict(sorted(families.items()))}")
    if args.strict:
        errors = [
            f"{package['package_id']}: {error}"
            for package in packages
            for error in validate_package(package)
        ]
        if errors:
            print("\n".join(errors))
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
