#!/usr/bin/env python3
"""Read-only static census of CoK ECL SETUP_MONSTER opcode sites.

The report records script instruction identities and raw operands, and pins the retail
dispatcher/state stores plus the conditional SPRIT/PIC selector path. It leaves each site's
bank-qualified canonical source identity and animation semantics unresolved.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import goldbox_corpus as gc
import gen1_ecl_encounter_scan as ecl
import exepack_unpack as exepack

ROOT = Path(__file__).resolve().parents[1]
PROFILE_ID = "champions-of-krynn"
OUTPUT = ROOT / "docs/engine/research/cok-ecl-setup-monster-census-v1.json"
GAME_OVR = ROOT / "Champions of Krynn/GAME.OVR"
GAME_OVR_SHA256 = "c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529"
START_EXE = ROOT / "Champions of Krynn/START.EXE"
START_EXE_SHA256 = "e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956"
START_IMAGE_SHA256 = "1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5"
DISPATCH_OFFSET = 0x424E
DISPATCH_BYTES = bytes.fromhex("3c0c75070ee8dfcae9ee01")
HANDLER_OFFSET = 0x0D35
HANDLER_LENGTH = 0x97
HANDLER_SHA256 = "4c43ad105792ca0ace151a68720f793b24d8345a526c08c2dbecf7066e352f4e"
ARCHIVE_PINS = {
    "ECL1.DAX": "6387021ed8c84f2834d32d7c5e66dd03b88322d0c5072cba6cfb64a48e9ccf79",
    "ECL2.DAX": "4f4ba999b0d46817091e82fe5ccf27cb6eee95cd833389353d7285c2a8dccbea",
    "ECL3.DAX": "9629aa3ef46bb354270aab1fa3e158d5b1507363bdf452fec5ca5d190f602f1f",
}
GAME_GRAPHICS_SPAN_PINS = {
    "approachToDescriptor": (0x125A, 0x1C, "45b5cd805fba38ca77b84a96a9865adea97e5a1f71a8f690894fabf5a6744307"),
    "spritLoadCall": (0x8FFA, 0x20, "86ef0a0038af6fc15ce8710f402526056877a7d2baa32dac378bceb36f93c5f7"),
    "displayCall": (0x9039, 0x0E, "6103562de045539a58787b9ba0b6374ed62f8505fdd786e6880b786b72fe7343"),
    "picLoadCall": (0x90A6, 0x20, "ce77c1b2a0dfeec637697f662912b0c171df275cf68d4b83b736a503f125340d"),
    "spritPascalStem": (0x8FAC, 6, "cda42b0e9d1a4aca6f0968eb0c3399fc73285df620664e39125ec63bbe651d62"),
    "picPascalStem": (0x8FB2, 4, "eb19f7d69322b11bb3910ba9e4aedb2615e23a8793f612ab833ab4d3a89c831d"),
    "daxSelectorFormal": (0x3CA94, 0x1E, "bb473dcdde8a25801435297915de8c125fe8083e4000d96e035898b5046204c6"),
    "daxSelectorPassedToLoader": (0x3CB6B, 0x17, "816783a817d5c563f22ee77ec7411a61213c4e42782256de61fdb6d2e57ae820"),
    "tableEntryRender": (0x3D0FE, 0x5F, "a77577d5b838fefa61cc19cf1eb21015c622dbfc4c38eea541e12d7a568c5298"),
    "newGameBankInitA": (0x10627, 5, "2a51c64c35556b82dc5e7ae6b3a9c4d014e5c0c9b29f3013bcbeaaedddc80e76"),
    "newGameBankInitB": (0x10A5F, 5, "2a51c64c35556b82dc5e7ae6b3a9c4d014e5c0c9b29f3013bcbeaaedddc80e76"),
    "savedAreaBankRestore": (0x1F746, 0x0C, "e870fe22435894861c72a7efb87338989992fbd334b4a145f226a49c2dc00e03"),
    "savedAreaBankStore": (0x1FC25, 0x0E, "f0c0ce8637b74bbfe3d658497deb20bb82d2782052a405896026b6d74f624011"),
}
RESIDENT_GRAPHICS_SPAN_PINS = {
    "daxIndexScan": (0x72CA, 0xA2, "f8985014a69dc61f9fd95e177c18a3017bdf46bdda637cd282a2f4d0afd257f4"),
    "daxFirstMatchLoad": (0x739B, 0x44, "2ab6ead7db1f6385dcb7abc68acbe0145bc181b23dd8452d80a6a96b7813d700"),
    "daxDecoder": (0x7084, 0xBC, "4e95dc618042ab2bf5f018ee3ed85fdc32727f98879831df747e9907146183de"),
    "pascalAssignment": (0xAF24, 0x1A, "4681f1935f55d71f05afab0b13fff0505aa17e9a04fb372ff559ef28ed88058f"),
}
SOURCE_REQUEST_SCHEMA = "cok-ecl-setup-source-request-v1"
SOURCE_REQUEST_SELECTOR_CONTRACT = (("SPRIT", 0, 1), ("PIC", 2, 0))


def conditional_selector_rules() -> list[dict[str, Any]]:
    return [{
        "sourceFamily": family,
        "setupMonsterOperand": operand_index,
        "mode": mode,
        "bankSuffixExpression": "DS:0x5782",
        "daxLookup": "first matching one-byte block ID",
    } for family, operand_index, mode in SOURCE_REQUEST_SELECTOR_CONTRACT]


def source_request_rows(operands: list[dict[str, Any]], selector_rules: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    rules = conditional_selector_rules() if selector_rules is None else selector_rules
    if rules != conditional_selector_rules():
        raise ValueError("conditional selector evidence differs from the pinned source-request contract")
    if len(operands) != 3:
        raise ValueError("SETUP_MONSTER source requests require exactly three preserved operands")
    requests = []
    for selector_index, (_family, operand_index, _mode) in enumerate(SOURCE_REQUEST_SELECTOR_CONTRACT):
        operand = operands[operand_index]
        kind = operand.get("kind")
        value = operand.get("value")
        if kind == "immediate" and isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 0xFF:
            block_selector = {"status": "literal-byte", "value": value}
        elif kind == "dynamic":
            block_selector = {"status": "unresolved-dynamic", "value": None}
        else:
            raise ValueError(f"unsupported selector operand encoding at position {operand_index}")
        requests.append({
            "selectorRef": f"#/retailGraphicsLink/conditionalSelectors/{selector_index}",
            "operandIndex": operand_index,
            "blockSelector": block_selector,
            "branchStatus": "not-evaluated",
            "bankValue": None,
            "archiveName": None,
            "archiveEntryOrdinal": None,
            "displayTableIndex": None,
            "sourceAssetId": None,
            "resolutionStatus": "unresolved-bank-entry-and-display-frame",
        })
    return requests


def validate_source_request_rows(rows: list[dict[str, Any]], operands: list[dict[str, Any]],
                                 selector_rules: list[dict[str, Any]] | None = None) -> None:
    expected = source_request_rows(operands, selector_rules)
    if rows != expected:
        raise ValueError("per-site conditional source requests differ from raw operands or preserve an unproved resolution")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def scan_setup_sites(raw: bytes, file_name: str, entry_ordinal: int, block_id: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Collect only instructions decoded by the existing bounded CFG traversal."""
    sites: dict[int, dict[str, Any]] = {}
    original_decode = ecl.decode_one

    def capture(raw_bytes, offset, word_sets, opcodes):
        instruction = original_decode(raw_bytes, offset, word_sets, opcodes)
        if instruction is not None and instruction.opcode == 0x0C:
            row = {
                "offset": instruction.offset,
                "vaddr": ecl.offset_to_vaddr(instruction.offset, 0x8000),
                "operands": [operand.evidence() for operand in instruction.args],
            }
            previous = sites.setdefault(instruction.offset, row)
            if previous != row:
                raise ValueError(f"conflicting decode at {file_name}#{block_id}+0x{offset:x}")
        return instruction

    ecl.decode_one = capture
    try:
        result = ecl.scan_block(
            raw,
            address_addend=0x8000,
            word_sets=ecl.word_sets_for_profile(PROFILE_ID),
            opcodes=ecl.opcodes_for_profile(PROFILE_ID),
        )
    finally:
        ecl.decode_one = original_decode

    records = [{
        "file": file_name,
        "entryOrdinal": entry_ordinal,
        "blockId": block_id,
        **sites[offset],
    } for offset in sorted(sites)]
    for row in records:
        row["sourceRequests"] = source_request_rows(row["operands"])
        validate_source_request_rows(row["sourceRequests"], row["operands"])
    return records, {
        "decodedInstructionOffsets": result["decoded_instruction_offsets"],
        "exploredStates": result["explored_states"],
        "stateLimitReached": result["state_limit_reached"],
        "decodeHoles": result["truncated_offsets"],
    }


def summarize(sites: list[dict[str, Any]]) -> dict[str, Any]:
    by_file: dict[str, int] = {}
    operand_summaries = []
    for row in sites:
        by_file[row["file"]] = by_file.get(row["file"], 0) + 1
    for operand_index in range(3):
        immediate: dict[str, int] = {}
        dynamic: dict[str, int] = {}
        for row in sites:
            operand = row["operands"][operand_index]
            target = immediate if operand["kind"] == "immediate" else dynamic
            key = str(operand["value"])
            target[key] = target.get(key, 0) + 1
        operand_summaries.append({
            "index": operand_index,
            "immediateSiteCount": sum(immediate.values()),
            "immediateValueCounts": dict(sorted(immediate.items(), key=lambda item: int(item[0]))),
            "dynamicSiteCount": sum(dynamic.values()),
            "dynamicAddressCounts": dict(sorted(dynamic.items(), key=lambda item: int(item[0]))),
        })
    source_requests = [request for row in sites for request in row.get("sourceRequests", [])]
    literal_requests = sum(request["blockSelector"]["status"] == "literal-byte" for request in source_requests)
    dynamic_requests = sum(request["blockSelector"]["status"] == "unresolved-dynamic" for request in source_requests)
    return {"siteCount": len(sites), "siteCountsByFile": by_file, "operands": operand_summaries,
            "sourceRequests": {"rowCount": len(source_requests), "literalByteSelectorCount": literal_requests,
                "unresolvedDynamicSelectorCount": dynamic_requests, "resolvedBankCount": 0,
                "resolvedArchiveEntryCount": 0, "resolvedDisplayFrameCount": 0,
                "resolvedCanonicalAssetCount": 0}}


def retail_handler_evidence_for_bytes(
    data: bytes,
    *,
    expected_game_sha256: str = GAME_OVR_SHA256,
    expected_handler_sha256: str = HANDLER_SHA256,
) -> dict[str, Any]:
    actual = sha256(data)
    if actual != expected_game_sha256:
        raise ValueError("CoK GAME.OVR SHA-256 differs from the pinned dispatcher/handler source")
    dispatch = data[DISPATCH_OFFSET:DISPATCH_OFFSET + len(DISPATCH_BYTES)]
    if dispatch != DISPATCH_BYTES:
        raise ValueError("CoK opcode 0x0C dispatcher bytes differ from the pinned callsite")
    handler = data[HANDLER_OFFSET:HANDLER_OFFSET + HANDLER_LENGTH]
    if len(handler) != HANDLER_LENGTH or sha256(handler) != expected_handler_sha256:
        raise ValueError("CoK opcode 0x0C handler bytes differ from the pinned source span")
    if data[HANDLER_OFFSET + 6:HANDLER_OFFSET + 8] != b"\xb0\x03":
        raise ValueError("CoK opcode 0x0C no longer prefetches three operands")
    return {
        "gameOvrSha256": actual,
        "dispatcher": {
            "offset": DISPATCH_OFFSET,
            "length": len(dispatch),
            "sha256": sha256(dispatch),
            "opcode": 0x0C,
            "handlerOffset": HANDLER_OFFSET,
        },
        "handler": {
            "offset": HANDLER_OFFSET,
            "length": HANDLER_LENGTH,
            "sha256": sha256(handler),
            "operandCount": 3,
            "sourceBytePins": "Opcode 0x0C dispatch at GAME.OVR 0x424e calls handler 0x0d35; handler prefetches three operands and stores operand positions 0/1/2 to DS:0x72e9, area2+0x580, and DS:0x72ea respectively. It computes and clamps a separate extent at area2+0x582, then passes DS:0x72e9, DS:0x72ea, that extent, and DS:0x8830 to descriptor procedure 0x4e:0x48 (mapped to GAME.OVR 0x8fb6 in cok-composed-startup-capture-2026-09-27.md).",
            "graphicsLinkStatus": "The opcode handler span alone records state stores; retailGraphicsLink separately pins the downstream conditional SPRIT/PIC selector path.",
        },
    }


def retail_handler_evidence() -> dict[str, Any]:
    return retail_handler_evidence_for_bytes(GAME_OVR.read_bytes())


def verify_span_pins(data: bytes, pins: dict[str, tuple[int, int, str]], source_name: str) -> list[dict[str, Any]]:
    rows = []
    for name, (offset, length, expected_sha256) in pins.items():
        span = data[offset:offset + length]
        actual = sha256(span)
        if len(span) != length or actual != expected_sha256:
            raise ValueError(f"{source_name} {name} span differs from the pinned source")
        rows.append({"name": name, "offset": offset, "length": length, "sha256": actual})
    return rows


def retail_graphics_link_evidence_for_bytes(
    game_ovr: bytes,
    start_exe: bytes,
    resident_image: bytes,
    *,
    expected_game_sha256: str = GAME_OVR_SHA256,
    expected_start_sha256: str = START_EXE_SHA256,
    expected_image_sha256: str = START_IMAGE_SHA256,
) -> dict[str, Any]:
    game_sha = sha256(game_ovr)
    start_sha = sha256(start_exe)
    image_sha = sha256(resident_image)
    if game_sha != expected_game_sha256:
        raise ValueError("CoK GAME.OVR SHA-256 differs from the pinned graphics selector source")
    if start_sha != expected_start_sha256:
        raise ValueError("CoK START.EXE SHA-256 differs from the pinned resident loader source")
    if image_sha != expected_image_sha256:
        raise ValueError("unpacked CoK START.EXE image differs from the pinned resident image")

    game_spans = verify_span_pins(game_ovr, GAME_GRAPHICS_SPAN_PINS, "GAME.OVR")
    resident_spans = verify_span_pins(resident_image, RESIDENT_GRAPHICS_SPAN_PINS, "START.EXE image")
    return {
        "sourceIdentity": {
            "gameOvrSha256": game_sha,
            "startExeSha256": start_sha,
            "completeResidentImageBytes": len(resident_image),
            "completeResidentImageSha256": image_sha,
            "unpacker": "tools/exepack_unpack.py:unpack_complete_load_image",
        },
        "overlayMapping": {
            "resolver": "python tools/disasm_cok.py resolve 0x4e 0x48",
            "descriptorOrdinal": 7,
            "gameOvrBase": 0x8A41,
            "procedureOffset": 0x575,
            "procedureFileOffset": 0x8FB6,
            "strings": [
                {"segmentOffset": 0x056B, "gameOvrOffset": 0x8FAC, "pascalBytesHex": "055350524954", "stem": "SPRIT"},
                {"segmentOffset": 0x0571, "gameOvrOffset": 0x8FB2, "pascalBytesHex": "03504943", "stem": "PIC"},
            ],
        },
        "gameOvrSpans": game_spans,
        "residentImageSpans": resident_spans,
        "conditionalSelectors": conditional_selector_rules(),
        "bankSuffixLifecycle": {
            "initialValue": 1,
            "initializationOffsets": [0x10627, 0x10A5F],
            "areaRecordOffset": 0x624,
            "restoreOffset": 0x1F746,
            "saveOffset": 0x1FC25,
            "interpretation": "New-game paths initialize bank 1; a current-area record restores the value and receives it back when stored. This does not establish the value at every ECL site or justify deriving it from ECL1/2/3.DAX.",
        },
        "displaySelection": {
            "approachExtentSource": "area2+0x582, decremented by APPROACH",
            "tableIndexExpression": "approach extent + 1",
            "validTableIndices": [1, 2, 3],
            "tableEntryBytes": 8,
            "renderCall": "0x027F:0x09C3",
        },
        "limitations": [
            "DS:0x5782 has source-pinned new-game and current-area save/restore paths, but its value is not resolved per ECL site; do not infer it from ECL1/2/3.DAX.",
            "The display table may have been populated by the conditional SPRIT or PIC branch; exact successful table contents are not joined.",
            "DAX duplicate IDs resolve to the first index row; actual duplicate-block effects are not observed here.",
            "Table indices 1..3 are not classified as temporal animation frames versus distance/pose variants.",
            "These are source-byte and static call-path findings, not runtime observation or runtime-art admission.",
        ],
    }


def retail_graphics_link_evidence() -> dict[str, Any]:
    game_ovr = GAME_OVR.read_bytes()
    start_exe = START_EXE.read_bytes()
    resident_image, _result = exepack.unpack_complete_load_image(START_EXE)
    return retail_graphics_link_evidence_for_bytes(game_ovr, start_exe, resident_image)


def build_report() -> dict[str, Any]:
    inventory = gc.binary_inventory.inventory(gc.inventory_roots([]), recursive=False, max_depth=3,
                                              include_unprofiled=False)
    install = gc.choose_install(inventory, PROFILE_ID, gc.load_routes().get(PROFILE_ID))
    if install is None:
        raise ValueError("the pinned Champions of Krynn install is unavailable")
    files = gc.file_index(install)
    if set(files) & set(ARCHIVE_PINS) != set(ARCHIVE_PINS):
        raise ValueError("the selected CoK install does not contain ECL1/2/3.DAX")

    source_archives = []
    site_rows = []
    scan_receipts = []
    for file_name, expected_hash in ARCHIVE_PINS.items():
        path = files[file_name]
        archive_bytes = path.read_bytes()
        actual_hash = sha256(archive_bytes)
        if actual_hash != expected_hash:
            raise ValueError(f"{path}: SHA-256 differs from the pinned CoK ECL archive")
        source_archives.append({"name": file_name, "sha256": actual_hash})
        for ordinal, block in enumerate(gc.read_dax_blocks(path)):
            records, scan_receipt = scan_setup_sites(block["raw"], file_name, ordinal, block["block_id"])
            site_rows.extend(records)
            scan_receipts.append({
                "file": file_name,
                "entryOrdinal": ordinal,
                "blockId": block["block_id"],
                **scan_receipt,
            })

    site_rows.sort(key=lambda row: (list(ARCHIVE_PINS).index(row["file"]), row["entryOrdinal"], row["offset"]))
    if any(row["stateLimitReached"] or row["decodeHoles"] for row in scan_receipts):
        raise ValueError("the existing bounded CFG scan did not decode every reachable site")
    if len({(row["file"], row["entryOrdinal"], row["offset"]) for row in site_rows}) != len(site_rows):
        raise ValueError("duplicate CoK ECL setup-site identity")

    scanner_path = Path(ecl.__file__).resolve()
    generator_path = Path(__file__).resolve()
    return {
        "schema": "cok-ecl-setup-monster-census-v1",
        "sourceRequestSchema": SOURCE_REQUEST_SCHEMA,
        "profile": PROFILE_ID,
        "sourceArchives": source_archives,
        "retailHandler": retail_handler_evidence(),
        "retailGraphicsLink": retail_graphics_link_evidence(),
        "scanner": {
            "path": "tools/gen1_ecl_encounter_scan.py",
            "sha256": sha256(scanner_path.read_bytes()),
            "dialect": "CoK Gen1 long form with the shared grounded opcode 0x41 extension",
        },
        "generator": {
            "path": "tools/cok_ecl_setup_monster_census.py",
            "sha256": sha256(generator_path.read_bytes()),
        },
        "claim": "Static CFG-reachable SETUP_MONSTER sites, operand encodings, and source-pinned conditional SPRIT/PIC family selectors; not bank-qualified source-ID linkage, animation semantics, or runtime observation.",
        "limitations": [
            "Both sides of unresolved comparisons and selectors are retained by the existing bounded scanner.",
            "Cross-ECL NEWECL transitions and runtime/campaign inputs are not resolved here.",
            "The DS:0x5782 bank suffix has initialization and current-area save/restore evidence but is not mapped to a specific ECL site or canonical disk-qualified source ID.",
            "No table record is linked to a canonical source frame; 1..3 display indices are not classified as temporal animation.",
            "The conditional PIC selector is included to preserve operand distinction; this census does not map PIC IDs to game-use descriptions.",
            "The third SETUP_MONSTER operand is kept separate from LOAD_MONSTER.picBlockId.",
        ],
        "summary": summarize(site_rows),
        "scanReceipts": scan_receipts,
        "sites": site_rows,
    }


def json_bytes(report: dict[str, Any]) -> bytes:
    return (json.dumps(report, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true", help="write the deterministic source-only receipt")
    action.add_argument("--check", action="store_true", help="compare the current receipt without writing")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    try:
        data = json_bytes(build_report())
        if args.check:
            if not args.output.is_file() or args.output.read_bytes() != data:
                print(f"FAIL {args.output}: receipt differs or is absent", file=sys.stderr)
                return 1
            print(f"PASS {args.output}")
            return 0
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(data)
        print(f"WROTE {args.output}")
        return 0
    except (OSError, ValueError, KeyError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
