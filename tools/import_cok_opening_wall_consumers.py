#!/usr/bin/env python3
"""Reproduce conditional CoK DOS area-34 wall-table evidence from pinned DAX data."""

from __future__ import annotations

import argparse
import copy
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import dax_decode
from gen1_geo_traversal_scope import DIALECT_COK, decode_instruction_at
from graphics_asset_registry import validate
from import_cok_ecl_picture_consumers import ROOT, _atomic_write, sha256

TASK = "COK-OPENING-WALL-CONSUMERS-159"
DOS_FOLDER = "Champions of Krynn"
RESEARCH = "docs/engine/research"
REGISTRY = ROOT / RESEARCH / "cok-graphics-identity-registry-v1.json"
RECEIPT_REF = f"{RESEARCH}/cok-opening-wall-consumers-159-v1.json"
RECEIPT = ROOT / RECEIPT_REF
RECEIPT_LIMIT = 160 * 1024
PREVIOUS_RECEIPT_SHA = "66ea90a7b923670470cabedb268034135a00c4d224359cb4757e25abfab28a29"
OWNED_USE_PREFIX = f"Source-only {TASK} evidence:"
CLAIM_LIMIT = "Conditional static table references. Visibility and runtime use are unobserved."
TILE_ARCHIVE = "8X8D1.DAX"

# Whole source files with CRLF normalized to LF for Git checkout portability.
ENGINE_SOURCE = "packages/engine/src"
HOST_PINS = {
    "ecl/disassemble.ts": "fb856d7f21b3c3771b80e673e96d139a638d14e9f76e3beb9a2be4b1a69de0ca",
    "ecl/opcodes.ts": "8501a195a573290218b4e48ea478ffa3a823ed223197c4cef4840e0728626305",
    "ecl/vm.ts": "d95ee6d3c1b2f7c96a5d3effcec80984957cbcf7ee6b463a3cd3824c46193562",
    "loaders/geo.ts": "dc568b662fcf14a30dd230037b31304c480dcbe8bdfb71448d16bad0a0881aea",
    "loaders/walldef.ts": "20e9c43ccdeaafd43964535cb896560377db8d36fba5425ce90db2e7821e348d",
    "world/dungeon.ts": "2968a406eb6dfe0d2f19887b75a82a629e4bf019a9d1655b4cb7e4b8431305c3",
    "world/dungeonWalls.ts": "59f65c84b994245b9421f24a62e637f4ca8c01614127d73bf279847240d35fc8",
    "world/wallpieces.ts": "2141c8fe5d8ca9921be5586aa096c7d532980ba1371b35ceb4dfda8c3b21ff30",
}

# Repository game-folder copies. SHA-256 pins for whole archives, ordered TOCs, and
# per-selected-entry (index, relative offset, raw size, compressed size, raw SHA-256).
ARCHIVES = {
    "ECL1.DAX": (
        "6387021ed8c84f2834d32d7c5e66dd03b88322d0c5072cba6cfb64a48e9ccf79",
        (16, 17, 18, 32, 33, 34, 36),
        {34: (5, 24585, 6497, 6646, "66ec7047a86f22200bb746f98733d73274ddbec8a385e007c578258232d110fe")},
    ),
    "GEO1.DAX": (
        "e3670f73462c68dc15a438229aba82daf62f55e8e029a87e9da47ec4769165ae",
        (32, 34),
        {34: (1, 990, 1026, 825, "68dd1f4d8dc18e558b3e8d839cbe16362522f08c4a05648ed75c7aab444400ba")},
    ),
    "WALLDEF1.DAX": (
        "70cf9f18fe0dc87bf5cec047c52a33ad48dc543d48812d627c3b05579c29be85",
        (1, 3, 23),
        {
            3: (1, 1550, 1560, 1511, "439c389ee5d96033dcf1f50fabdc54fcd38001751e7e257bd6bb20b8fb96e0af"),
            23: (2, 3061, 780, 787, "4f00b2a2635eca23ea8823a3181791403da3b2169ea83c94631400e33d266aec"),
        },
    ),
    TILE_ARCHIVE: (
        "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915",
        (201, 202, 203, 11, 12, 31, 32, 23),
        {
            31: (5, 8393, 2257, 2271, "171fac99ca6a4f878c99ee491be223a03b603242a02b589db86c1e36ddddf6f0"),
            32: (6, 10664, 2257, 1215, "503b22622079cb279032d67a05bc2c31fc207566a44e8bc76f286c1a2614efdc"),
            23: (7, 11879, 2257, 2393, "311afd2934d6eeaf443640bf496bcf8568790d7ae6233726771da871ddd51c25"),
            203: (2, 2421, 1457, 1259, "e9f41ebcbafe3bb37d6f5a92193430910c13999a6d81fcfe625decc6c0bad553"),
        },
    ),
}
# Whole banks in decoder order, first as palette indices and then as native RGB.
TILE_PINS = {
    31: (70, "e18eab4a0d6841312fc8c47d0d6025430d68c2beb859553820ffd7ff1056c16d",
         "a3bfe5ca2bb9392d2778dc8c49985d2609e1f90eaf2d512c29db88bf6f32cb05"),
    32: (70, "3f0eb96cfa30714492fdfd34fa102d41bf94ec83ad1affc4eba236e7750a4a0b",
         "3c9434121aac10d205794516ef428418f8237d01af519b7c40adcc1ca0865a10"),
    23: (70, "e08a84c3891978326f7cb2b51695ffdd550d40f0a632948edb1b066aaed92959",
         "6803e4a903c54e29b7112254c0f387b16313b4eda24eea0e472b12a9355ae549"),
    203: (45, "331bcad9f1c00e68c55c6279871be22ae70adb7ec4601a95edc175bb2947a210",
          "eb1c078f32f16363c16f51a8a67d5b68e37a2d23f68bedadff9bf8081d929f3d"),
}
EXPECTED_DISTINCT = {31: 62, 32: 28, 23: 69, 203: 15}
EXPECTED_MATCHES = {31: 505, 32: 299, 23: 741, 203: 389}
EXPECTED_SLOTS = (1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15)
SET_BASES = (1, 46, 116, 186)
BOOT_BANK = 203
ECL_BASE = 0x7FFE
RECORD_SIZE = 780
SLICE_SIZE = 156
DIRECTIONS = ("north", "east", "south", "west")


def source_id(bank: int, index: int) -> str:
    return f"cok/dos-ega/disk1/8x8d1.dax/block/{bank}/tile/{index}"


def verify_host_sources(root: Path) -> dict[str, str]:
    pins = {f"{ENGINE_SOURCE}/{path}": digest for path, digest in HOST_PINS.items()}
    for path, digest in pins.items():
        if sha256((root / path).read_bytes().replace(b"\r\n", b"\n")) != digest:
            raise ValueError(f"{path}: host source SHA-256 differs")
    return pins


def read_archive(dos_root: Path, name: str) -> tuple[dict[int, bytes], dict[str, Any]]:
    expected_sha, expected_toc, entries = ARCHIVES[name]
    data = (dos_root / name).read_bytes()
    if sha256(data) != expected_sha:
        raise ValueError(f"{name}: archive SHA-256 differs from pinned repository source")
    base, toc = dax_decode.parse_container(data)
    if tuple(row.block_id for row in toc) != expected_toc or len(set(expected_toc)) != len(toc):
        raise ValueError(f"{name}: ordered, unique TOC differs from the source pin")
    raw_blocks, blocks = {}, []
    for block_id, pin in entries.items():
        index, offset, raw_size, comp_size, block_sha = pin
        row = toc[index]
        if (row.block_id, row.data_offset, row.raw_size, row.comp_size) != (block_id, offset, raw_size, comp_size):
            raise ValueError(f"{name}#{block_id}: TOC entry differs from the source pin")
        if not base <= base + offset < base + offset + comp_size <= len(data):
            raise ValueError(f"{name}#{block_id}: compressed block lies outside the archive")
        raw = dax_decode.decompress_block(data, base, row)
        if len(raw) != raw_size or sha256(raw) != block_sha:
            raise ValueError(f"{name}#{block_id}: decompressed size or SHA-256 differs from the source pin")
        raw_blocks[block_id] = raw
        blocks.append({"blockId": block_id, "entryIndex": index, "dataOffset": offset,
                       "rawSize": raw_size, "compressedSize": comp_size, "rawSha256": block_sha})
    return raw_blocks, {
        "path": f"{DOS_FOLDER}/{name}", "sha256": expected_sha, "byteLength": len(data),
        "dataBase": base, "orderedTocBlockIds": list(expected_toc), "blocks": blocks,
    }


def decode_init(raw: bytes) -> dict[str, Any]:
    """Walk the initial-entry prefix through the two loads, keeping the early exit."""
    # Header slot 4 (initial_entry) is the fifth far pointer, starting at byte 18.
    segment = int.from_bytes(raw[18:20], "little")
    entry = int.from_bytes(raw[20:22], "little")
    if raw[:2] != b"\x88\x13" or (segment, entry) != (0x0101, 0x8014):
        raise ValueError("ECL1#34: initial_entry header pin differs")
    expected = (
        (0x8014, 0x03, ((1, 0x4BF2), (0, 34))),
        (0x801A, 0x16, ()),
        (0x801B, 0x00, ()),
        (0x801C, 0x09, ((0, 1), (1, 0x4BE7))),
        (0x8022, 0x09, ((0, 1), (1, 0x4BE8))),
        (0x8028, 0x21, ((0, 34), (0, 2), (0, 255))),
        (0x802F, 0x37, ((0, 3), (0, 4), (0, 23))),
    )
    offset = entry - ECL_BASE
    sites = []
    for address, opcode, operands in expected:
        ins, next_offset, bad_opcode, truncated = decode_instruction_at(raw, offset, DIALECT_COK)
        if (bad_opcode or truncated or ins is None or next_offset > len(raw)
                or (offset + ECL_BASE, ins.opcode, tuple((arg.code, arg.word) for arg in ins.args))
                != (address, opcode, operands)):
            raise ValueError(f"ECL1#34: initial-entry control or operand pin differs at 0x{address:04x}")
        sites.append({"offset": offset, "vaddr": address, "mnemonic": ins.mnemonic,
                      "operands": [{"code": arg.code, "value": arg.word} for arg in ins.args]})
        offset = next_offset
    geo_id = sites[-2]["operands"][0]["value"]
    first, skipped, third = [arg["value"] for arg in sites[-1]["operands"]]
    return {
        "entry": {"name": "initial_entry", "segment": segment, "vaddr": entry, "offset": entry - ECL_BASE},
        "loadCondition": "Byte [0x4bf2] differs from 34. Equality executes EXIT at 0x801b.",
        "sites": sites,
        "geoBlockId": geo_id,
        "wallDefCalls": [{"symbolSet": 1, "blockId": first}, {"symbolSet": 3, "blockId": third}],
        "skippedOperand": {"symbolSet": 2, "blockId": skipped},
        "twoSetReason": "The two SAVE sites set bytes [0x4be7] and [0x4be8] to 1 before LOAD_PIECES.",
    }


def decode_map(raw: bytes) -> dict[int, list[dict[str, Any]]]:
    if len(raw) != 1026 or raw[:2] != b"\x00\x04":
        raise ValueError("GEO1#34: map framing differs")
    edges = defaultdict(list)
    for cell in range(256):
        for index, direction in enumerate(DIRECTIONS):
            offset = 2 + 256 * (index // 2) + cell
            shift = 4 * (1 - index % 2)
            slot = (raw[offset] >> shift) & 15
            door = (raw[770 + cell] >> (2 * index)) & 3
            edges[slot].append({"x": cell % 16, "y": cell // 16, "direction": direction,
                                "geoOffset": offset, "wallByte": raw[offset], "wallSlot": slot,
                                "doorOffset": 770 + cell, "doorFlag": door})
    if tuple(sorted(edges)) != (0, *EXPECTED_SLOTS):
        raise ValueError("GEO1#34: wall slot roster differs")
    return edges


def mount_wall_tables(raw_blocks: dict[int, bytes], calls: list[dict[str, int]]) -> dict[int, dict[str, int]]:
    tables = {}
    for call in calls:
        symbol_set, block_id = call["symbolSet"], call["blockId"]
        raw_size = len(raw_blocks[block_id])
        record_count, remainder = divmod(raw_size, RECORD_SIZE)
        if remainder or record_count < 1 or symbol_set + record_count > 4:
            raise ValueError(f"WALLDEF1#{block_id}: invalid symbol-set span")
        for record in range(record_count):
            mounted_set = symbol_set + record
            if mounted_set in tables:
                raise ValueError(f"WALLDEF1#{block_id}: overlapping symbol-set span")
            tables[mounted_set] = {
                "wallDefBlockId": block_id, "recordIndex": record, "loadSymbolSet": symbol_set,
                "relocation": SET_BASES[symbol_set] - SET_BASES[1],
                "loadedBank": block_id if record_count == 1 else 10 * block_id + record + 1,
            }
    if [table["loadedBank"] for table in tables.values()] != [31, 32, 23]:
        raise ValueError("WALLDEF1: opening bank roster differs")
    return tables


def decode_bank(raw: bytes, bank: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    count, indexed_sha, rgb_sha = TILE_PINS[bank]
    layout = dax_decode.parse_ega_tile_array(raw)
    if layout != (8, 8, count, 17):
        raise ValueError(f"{TILE_ARCHIVE}#{bank}: exact tile array framing differs")
    tiles = [bytes(tile) for tile in dax_decode.ega_tile_array_tiles(raw, *layout)]
    rgb = [dax_decode.indexed_to_rgb(tile, dax_decode.EGA_PALETTE) for tile in tiles]
    if (len(tiles), sha256(b"".join(tiles)), sha256(b"".join(rgb))) != (count, indexed_sha, rgb_sha):
        raise ValueError(f"{TILE_ARCHIVE}#{bank}: ordered tile index or RGB SHA-256 differs")
    rows = [{"sourceAssetId": source_id(bank, index), "tileIndex": index,
             "indexSha256": sha256(tile), "pixelSha256": sha256(rgb[index])}
            for index, tile in enumerate(tiles)]
    return rows, {"tileCount": count, "orderedIndexSha256": indexed_sha, "orderedRgbSha256": rgb_sha}


def collect_matches(raw_blocks: dict[int, bytes], tables: dict[int, dict[str, int]],
                    slots: list[int]) -> tuple[dict[int, Any], list[dict[str, int]]]:
    by_bank = {bank: defaultdict(list) for bank in EXPECTED_DISTINCT}
    selectors = []
    for slot in slots:
        set_index, slice_index = divmod(slot - 1, 5)
        table = tables[set_index + 1]
        offset = table["recordIndex"] * RECORD_SIZE + slice_index * SLICE_SIZE
        selector = {"wallSlot": slot, "symbolSet": set_index + 1, "sliceIndex": slice_index,
                    "blockOffset": offset, **table}
        selectors.append(selector)
        row = raw_blocks[table["wallDefBlockId"]][offset:offset + SLICE_SIZE]
        if len(row) != SLICE_SIZE:
            raise ValueError(f"WALLDEF1: truncated slice for GEO slot {slot}")
        for column, value in enumerate(row):
            tile_id = (value + table["relocation"]) & 255 if value >= 45 else value
            if tile_id == 0:
                continue
            routed_set = max(index for index, base in enumerate(SET_BASES) if tile_id >= base)
            bank = tables[routed_set]["loadedBank"] if routed_set else BOOT_BANK
            tile_index = tile_id - SET_BASES[routed_set]
            if tile_index >= TILE_PINS[bank][0]:
                raise ValueError(f"WALLDEF1: GEO slot {slot}, column {column} routes outside bank #{bank}")
            # Keep all matched columns. The slot's selector gives the record and row start.
            by_bank[bank][tile_index].append([slot, column, value, tile_id])
    return by_bank, selectors


def build_receipt(dos_root: Path = ROOT / DOS_FOLDER) -> dict[str, Any]:
    host_pins = verify_host_sources(ROOT)
    archives, decoded = {}, {}
    for name in ARCHIVES:
        decoded[name], archives[name] = read_archive(dos_root, name)
    control = decode_init(decoded["ECL1.DAX"][34])
    geo = decode_map(decoded["GEO1.DAX"][control["geoBlockId"]])
    wall_blocks = decoded["WALLDEF1.DAX"]
    tables = mount_wall_tables(wall_blocks, control["wallDefCalls"])
    used_slots = sorted(set(geo) - {0})
    matches, selectors = collect_matches(wall_blocks, tables, used_slots)
    banks = []
    for bank, bank_matches in matches.items():
        rows, bank_pin = decode_bank(decoded[TILE_ARCHIVE][bank], bank)
        match_count = sum(len(hits) for hits in bank_matches.values())
        if len(bank_matches) != EXPECTED_DISTINCT[bank] or match_count != EXPECTED_MATCHES[bank]:
            raise ValueError(f"{TILE_ARCHIVE}#{bank}: wall reference denominator differs")
        for row in rows:
            row["matches"] = bank_matches.get(row["tileIndex"], [])
        banks.append({
            "blockId": bank, **bank_pin, "distinctReferencedTiles": len(bank_matches),
            "tableMatchCount": match_count, "bootBankExcluded": bank == BOOT_BANK, "tiles": rows,
        })
    return {
        "schema": "cok-opening-wall-consumers-159-v1", "task": TASK,
        "claimLimit": CLAIM_LIMIT, "runtimeObservations": 0,
        "source": "Hash-pinned DOS game-folder archive copies.",
        "methodReferences": [
            f"{RESEARCH}/firstperson-wall-walk-cok.md",
            f"{RESEARCH}/firstperson-wall-geometry-cok.md",
        ],
        "hostSource": {"sha256Input": "Whole files with CRLF normalized to LF.", "files": host_pins},
        "denominator": {
            "scope": "All 156 columns of each WALLDEF slice selected by any nonzero GEO1#34 wall nibble.",
            "loadedOpeningTiles": 210, "referencedOpeningTiles": 159, "unreferencedOpeningTiles": 51,
            "excludedReferencedBootTiles": 15,
        },
        "archives": archives, "eclControl": control,
        "indexConvention": "GEO wall slots and symbol sets are one-based. Map coordinates, TOC entries, "
                           "record indices, slice indices, columns, byte offsets and tile indices are zero-based.",
        "mapSlots": [{"wallSlot": slot, "edgeCount": len(geo[slot]), "firstEdge": geo[slot][0]}
                     for slot in used_slots],
        "mapWitnesses": [
            next(edge for edge in geo[7] if (edge["x"], edge["y"], edge["direction"]) == (12, 12, "east")),
            next(edge for edge in geo[15] if (edge["x"], edge["y"], edge["direction"]) == (13, 12, "west")),
        ],
        "openEdges": len(geo[0]), "unusedSlots": sorted(set(range(1, 16)) - set(geo)),
        "selectors": selectors,
        "tileMatchFields": ["geoWallSlot", "wallDefColumn", "rawValue", "relocatedTileId"],
        "banks": banks,
    }


def receipt_bytes(receipt: dict[str, Any]) -> bytes:
    # Keep the full column-level witness list while emitting one tile per line.
    header = {key: value for key, value in receipt.items() if key != "banks"}
    lines = [json.dumps(header, ensure_ascii=False, indent=2)[:-2] + ",", '  "banks": [']
    for bank in receipt["banks"]:
        if bank is not receipt["banks"][0]:
            lines[-1] += ","
        summary = {key: value for key, value in bank.items() if key != "tiles"}
        lines.append("    " + json.dumps(summary)[:-1] + ', "tiles": [')
        lines.append(",\n".join("      " + json.dumps(row, separators=(",", ":")) for row in bank["tiles"]))
        lines.append("    ]}")
    lines.extend(["  ]", "}", ""])
    data = "\n".join(lines).encode("utf-8")
    if len(data) > RECEIPT_LIMIT:
        raise ValueError("opening wall receipt exceeds the 160 KiB limit")
    return data


def verify_tile(asset: dict[str, Any], tile: dict[str, Any], bank: int) -> None:
    asset_id = tile["sourceAssetId"]
    archive, locator, decoded = asset.get("archive", {}), asset.get("locator", {}), asset.get("decoded", {})
    entry = locator.get("entryIndex")
    if (asset.get("game") != "cok" or asset.get("platform") != "DOS-EGA"
            or asset.get("identityStatus") != "source-pinned"
            or archive.get("name") != TILE_ARCHIVE or archive.get("path") != f"{DOS_FOLDER}/{TILE_ARCHIVE}"
            or archive.get("sha256") != ARCHIVES[TILE_ARCHIVE][0]):
        raise ValueError(f"{asset_id}: canonical DOS archive pin differs")
    if (locator.get("kind") != "tile" or type(locator.get("blockId")) is not int or locator["blockId"] != bank
            or type(locator.get("tileIndex")) is not int or locator["tileIndex"] != tile["tileIndex"]
            or "entryIndex" not in locator or (entry is not None and
                (type(entry) is not int or entry != ARCHIVES[TILE_ARCHIVE][2][bank][0]))
            or locator.get("frameIndex") is not None or locator.get("cellIndex") is not None):
        raise ValueError(f"{asset_id}: canonical tile or TOC locator differs")
    if (decoded.get("width"), decoded.get("height"), decoded.get("pixelSha256")) != (8, 8, tile["pixelSha256"]):
        raise ValueError(f"{asset_id}: canonical native RGB pin differs")


def merge_consumers(registry: dict[str, Any], receipt: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    """Merge a locally derived receipt, preserving all evidence owned by other producers."""
    merged = copy.deepcopy(registry)
    assets = {asset["id"]: asset for asset in merged["assets"]}
    if len(assets) != len(merged["assets"]):
        raise ValueError("registry contains duplicate source IDs")
    receipt_sha = sha256(receipt_bytes(receipt))
    targets = {}
    for bank in receipt["banks"]:
        for tile in bank["tiles"]:
            asset_id = tile["sourceAssetId"]
            if asset_id not in assets:
                raise ValueError(f"{asset_id}: source ID is absent from the registry")
            verify_tile(assets[asset_id], tile, bank["blockId"])
            if tile["matches"] and not bank["bootBankExcluded"]:
                targets[asset_id] = (bank["blockId"], tile)
    if len(targets) != 159:
        raise ValueError("opening wall consumer roster differs from the reviewed denominator")
    counts = {"added": 0, "updated": 0, "unchanged": 0}
    for asset_id, asset in assets.items():
        consumers = asset.get("gameConsumers", [])
        if not isinstance(consumers, list) or not consumers:
            raise ValueError(f"{asset_id}: gameConsumers must remain a nonempty array")
        owned = [index for index, item in enumerate(consumers)
                 if isinstance(item, dict) and str(item.get("use", "")).startswith(OWNED_USE_PREFIX)]
        if asset_id not in targets:
            if owned:
                raise ValueError(f"{asset_id}: existing opening-wall evidence is outside the reviewed roster")
            continue
        bank, tile = targets[asset_id]
        slots = ", ".join(str(slot) for slot in sorted({hit[0] for hit in tile["matches"]}))
        record = {
            "status": "partial",
            "use": f"{OWNED_USE_PREFIX} ECL1#34 initial-entry loads select GEO1#34 "
                   f"wall slots {slots} that reference this tile through WALLDEF1. {CLAIM_LIMIT}",
            "evidence": [{
                "kind": "research-doc", "reference": f"{RECEIPT_REF}#banks",
                "note": f"{TILE_ARCHIVE}#{bank}/tile/{tile['tileIndex']}, "
                        f"{len(tile['matches'])} matching table columns, native RGB SHA-256 "
                        f"{tile['pixelSha256']}. Receipt SHA-256 {receipt_sha}.",
            }],
        }
        if not owned:
            consumers.append(record)
            counts["added"] += 1
        elif len(owned) == 1 and consumers[owned[0]] == record:
            counts["unchanged"] += 1
        else:
            consumers[owned[0]] = record
            for index in reversed(owned[1:]):
                del consumers[index]
            counts["updated"] += 1
    return merged, counts


def registry_bytes(registry: dict[str, Any], newline: bytes) -> bytes:
    return (json.dumps(registry, ensure_ascii=False, indent=2) + "\n").encode("utf-8").replace(b"\n", newline)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="atomically update the receipt and registry files")
    args = parser.parse_args()
    receipt = build_receipt()
    derived = receipt_bytes(receipt)
    existing = RECEIPT.read_bytes() if RECEIPT.exists() else None
    if (existing is not None and existing != derived
            and not (args.write and sha256(existing) == PREVIOUS_RECEIPT_SHA)):
        raise ValueError("existing receipt differs from pinned derivation")
    original = REGISTRY.read_bytes()
    registry = json.loads(original)
    merged, counts = merge_consumers(registry, receipt)
    errors, warnings = validate(merged)
    if errors:
        raise ValueError("registry validation failed: " + "; ".join(errors[:12]))
    if args.write:
        newline = b"\r\n" if b"\r\n" in original else b"\n"
        updated = counts["added"] or counts["updated"]
        if updated and registry_bytes(registry, newline) != original:
            raise ValueError("registry formatting has diverged from its canonical serialization")
        if REGISTRY.read_bytes() != original:
            raise ValueError("registry changed while opening wall evidence was computed")
        # A registry reference is published only after its receipt is present. An interrupted
        # registry replacement can be retried with the same deterministic receipt.
        if (RECEIPT.read_bytes() if RECEIPT.exists() else None) != existing:
            raise ValueError("receipt changed while opening wall evidence was computed")
        if existing != derived:
            _atomic_write(RECEIPT, derived)
        if updated:
            _atomic_write(REGISTRY, registry_bytes(merged, newline))
    print(json.dumps({"referencedOpeningTiles": 159, "unreferencedOpeningTiles": 51,
                      "excludedReferencedBootTiles": 15, "runtimeObservations": 0,
                      "receiptBytes": len(derived), "receiptPresent": existing is not None or args.write,
                      "registryValidationWarnings": len(warnings), "write": args.write, **counts}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError) as exc:
        raise SystemExit(f"ERROR: {exc}")
