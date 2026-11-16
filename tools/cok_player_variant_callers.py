#!/usr/bin/env python3
"""Pin CoK DOS player-frame variant calls and their wrapper draw gates (source only)."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
START_EXE = ROOT / "Champions of Krynn/START.EXE"
GAME_OVR = ROOT / "Champions of Krynn/GAME.OVR"
OUTPUT = ROOT / "docs/engine/research/cok-player-variant-callers-v1.json"
START_SHA256 = "e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956"
OVR_SHA256 = "c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529"
IMAGE_SHA256 = "1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5"
CALL_BYTES = bytes.fromhex("9a 57 00 16 01")
CALL_OWNERS = {
    0x0BC60: 8,
    0x0D1C6: 9,
    0x16874: 13,
    0x168A8: 13,
    0x16B1D: 13,
    0x16B3B: 13,
    0x2F24F: 22,
    0x2F2C8: 22,
    0x2F2E6: 22,
    0x32BDD: 22,
    0x32D9F: 22,
    0x32F72: 22,
    0x33240: 22,
}
TARGETS = {
    "playerVariantWrapper": {"segment": 0x116, "offset": 0x57, "descriptorIndex": 31,
                             "entryIndex": 11, "procedureOffset": 0x0AD8, "ovrFileOffset": 0x3FDE8},
    "frameRenderer": {"segment": 0x11F, "offset": 0x39, "descriptorIndex": 32,
                      "entryIndex": 5, "procedureOffset": 0x04B0, "ovrFileOffset": 0x40B4A},
}
WRAPPER_SPAN = (0x3FDE8, 0x3FEDB)
WRAPPER_SHA256 = "8267f2f613b4d427d9cacdfd64919a8932e161a77a015786f1483cfe6e00ade2"
DRAW_FLAG_CHECK = (0x3FE84, bytes.fromhex("80 7e 06 00 75 4b"))
DRAW_PREDICATE_CALL = (0x3FE8A, bytes.fromhex("ff 76 0e ff 76 0c b0 00 50 0e e8 68 fb"))
DRAW_PREDICATE_RESULT = (0x3FE97, bytes.fromhex("08 c0 74 3a"))
DRAW_ENABLE_BYTE = (0x3FE9B, bytes.fromhex("80 3e ad 71 00 74 33"))
RENDERER_CALL = (0x3FECB, bytes.fromhex("9a 39 00 1f 01"))

sys.path.insert(0, str(ROOT / "tools"))
import exepack_unpack  # noqa: E402
import gen1_map  # noqa: E402
import vroomm_layout  # noqa: E402


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _span(data: bytes, offset: int, expected: bytes, label: str) -> dict[str, Any]:
    actual = data[offset:offset + len(expected)]
    if actual != expected:
        raise ValueError(f"{label} bytes differ at 0x{offset:x}")
    return {"offset": offset, "length": len(expected), "bytesHex": actual.hex(), "sha256": sha256(actual)}


def resolve_target_stub(load_image: bytes, descriptors: list[Any], layouts: list[Any], key: str) -> dict[str, Any]:
    target = TARGETS[key]
    segment, offset = target["segment"], target["offset"]
    descriptor_index, entry_index = target["descriptorIndex"], target["entryIndex"]
    image_base = segment * 16
    descriptor = next((row for row in descriptors if row.index == descriptor_index), None)
    layout = next((row for row in layouts if row.index == descriptor_index), None)
    if descriptor is None or layout is None:
        raise ValueError(f"missing target descriptor {descriptor_index}")
    if image_base + 14 > len(load_image) or load_image[image_base:image_base + 2] != b"\xcd\x3f":
        raise ValueError(f"target descriptor {descriptor_index} header is absent at complete-image offset 0x{image_base:x}")
    file_offset, code_size, fixup_size, stub_count = struct.unpack_from("<IHHH", load_image, image_base + 4)
    if (file_offset, code_size, fixup_size, stub_count) != (
        descriptor.ovr_file_offset, descriptor.code_size, descriptor.fixup_size, descriptor.jmp_count_word
    ):
        raise ValueError(f"complete-image descriptor header differs from descriptor index {descriptor_index}")
    if offset < 0x20 or (offset - 0x20) % vroomm_layout.STUB_STRIDE:
        raise ValueError("selector offset does not land on a stride-5 public stub")
    actual_entry = (offset - 0x20) // vroomm_layout.STUB_STRIDE
    if actual_entry != entry_index or actual_entry >= stub_count or actual_entry >= len(layout.stub_proc_offsets):
        raise ValueError("selector entry index differs from the validated public stub table")
    image_offset = image_base + offset
    stub = load_image[image_offset:image_offset + vroomm_layout.STUB_STRIDE]
    if len(stub) != vroomm_layout.STUB_STRIDE or stub[:2] != b"\xcd\x3f":
        raise ValueError(f"public stub bytes are invalid at complete-image offset 0x{image_offset:x}")
    procedure = struct.unpack_from("<H", stub, 2)[0]
    if procedure != target["procedureOffset"] or procedure != layout.stub_proc_offsets[actual_entry]:
        raise ValueError("complete-image stub procedure differs from the descriptor's validated stub entry")
    ovr_target = descriptor.ovr_file_offset + procedure
    if ovr_target != target["ovrFileOffset"]:
        raise ValueError("public stub procedure maps to an unexpected GAME.OVR offset")
    return {"selector": {"segment": segment, "offset": offset},
            "completeImageDescriptorHeaderOffset": image_base,
            "completeImageStubArrayOffset": image_base + 0x20,
            "completeImageStubOffset": image_offset,
            "stubIndex": actual_entry, "stubBytesHex": stub.hex(), "stubSha256": sha256(stub),
            "descriptorIndex": descriptor_index, "descriptorOvrFileOffset": descriptor.ovr_file_offset,
            "procedureOffset": procedure, "procedureOvrFileOffset": ovr_target}


def parse_variant_and_flag(ovr: bytes, call_offset: int) -> tuple[dict[str, int], dict[str, int]]:
    prefix_offset = call_offset - 6
    prefix = ovr[prefix_offset:call_offset]
    if len(prefix) != 6 or prefix[0] != 0xB0 or prefix[2] != 0x50 or prefix[3] != 0xB0 or prefix[5] != 0x50:
        raise ValueError(f"variant/renderer-flag push sequence is not the pinned form at 0x{call_offset:x}")
    return (
        {"value": prefix[1], "movAlOffset": prefix_offset, "pushAxOffset": prefix_offset + 2},
        {"value": prefix[4], "movAlOffset": prefix_offset + 3, "pushAxOffset": prefix_offset + 5},
    )


def caller_rows(ovr: bytes, descriptors: list[Any], layouts: list[Any]) -> list[dict[str, Any]]:
    rows = []
    for offset, expected_owner in CALL_OWNERS.items():
        if ovr[offset:offset + len(CALL_BYTES)] != CALL_BYTES:
            raise ValueError(f"direct wrapper call differs at GAME.OVR 0x{offset:x}")
        owners = [row for row in descriptors if row.ovr_file_offset <= offset < row.ovr_file_offset + row.code_size]
        if len(owners) != 1 or owners[0].index != expected_owner:
            raise ValueError(f"direct call owner mismatch at GAME.OVR 0x{offset:x}")
        owner = owners[0]
        layout = next((row for row in layouts if row.index == owner.index), None)
        if layout is None:
            raise ValueError(f"missing fixup table for owner descriptor {owner.index}")
        relative = offset - owner.ovr_file_offset
        fixups = [row for row in layout.fixup_entries if row.code_offset == relative + 3]
        if len(fixups) != 1 or fixups[0].context != "lcall_segment" \
                or fixups[0].instruction_offset != relative or fixups[0].original_segment != 0x116:
            raise ValueError(f"direct wrapper call lacks its exact owner fixup at GAME.OVR 0x{offset:x}")
        variant, flag = parse_variant_and_flag(ovr, offset)
        rows.append({
            "callSiteFileOffset": offset,
            "ownerDescriptorOrdinal": owner.index,
            "callBytesHex": CALL_BYTES.hex(),
            "callBytesSha256": sha256(CALL_BYTES),
            "variant": variant,
            "rendererFlag": flag,
            "fixup": {"codeOffset": fixups[0].code_offset, "instructionCodeOffset": fixups[0].instruction_offset,
                      "originalSegment": fixups[0].original_segment, "context": fixups[0].context},
            "drawEligibility": "suppressed-by-nonzero-renderer-flag" if flag["value"] else "conditional",
            "drawPredicates": [] if flag["value"] else [
                "descriptor31 wrapper predicate 0x3F9FF(record, mode=0) must return nonzero",
                "DS:0x71AD must be nonzero",
            ],
            "retailMeaning": "unresolved",
            "runtimeObserved": False,
        })
    return rows


def build_report() -> dict[str, Any]:
    start = START_EXE.read_bytes()
    ovr = GAME_OVR.read_bytes()
    if sha256(start) != START_SHA256:
        raise ValueError("START.EXE SHA-256 differs from the pinned CoK source")
    if sha256(ovr) != OVR_SHA256:
        raise ValueError("GAME.OVR SHA-256 differs from the pinned CoK source")
    load_image, unpack_result = exepack_unpack.unpack_complete_load_image(START_EXE)
    if sha256(load_image) != IMAGE_SHA256:
        raise ValueError("complete EXEPACK load-image SHA-256 differs from the pinned image")
    descriptors = gen1_map.scan_descriptors(start, ovr)
    layouts = vroomm_layout.descriptor_layouts(start, ovr, descriptors)
    if len(descriptors) != 35:
        raise ValueError("CoK loader descriptor count differs from the pinned roster")
    wrapper_start, wrapper_end = WRAPPER_SPAN
    wrapper = ovr[wrapper_start:wrapper_end]
    if sha256(wrapper) != WRAPPER_SHA256:
        raise ValueError("descriptor31 player-wrapper byte span differs from its pin")
    gate_spans = {
        "rendererFlagGate": _span(ovr, *DRAW_FLAG_CHECK, "renderer-flag gate"),
        "predicateCall": _span(ovr, *DRAW_PREDICATE_CALL, "mode-0 predicate call"),
        "predicateResultGate": _span(ovr, *DRAW_PREDICATE_RESULT, "predicate result gate"),
        "enableByteGate": _span(ovr, *DRAW_ENABLE_BYTE, "DS:0x71AD gate"),
        "rendererCall": _span(ovr, *RENDERER_CALL, "descriptor32 renderer call"),
    }
    wrapper_target = resolve_target_stub(load_image, descriptors, layouts, "playerVariantWrapper")
    renderer_target = resolve_target_stub(load_image, descriptors, layouts, "frameRenderer")
    rows = caller_rows(ovr, descriptors, layouts)
    if len(rows) != 13 or sum(row["drawEligibility"] == "suppressed-by-nonzero-renderer-flag" for row in rows) != 2:
        raise ValueError("direct-call roster or flag-suppression count differs from the pinned source")
    return {
        "schema": "cok-player-variant-callers-v1",
        "sourceIdentity": {"startExeSha256": sha256(start), "gameOvrSha256": sha256(ovr),
            "completeLoadImageBytes": len(load_image), "completeLoadImageSha256": sha256(load_image),
            "unpacker": "tools/exepack_unpack.py:unpack_complete_load_image",
            "unpackedFirstDecompressedOffset": unpack_result.first_decompressed_offset},
        "stubRoutes": {"playerVariantWrapper": wrapper_target, "frameRenderer": renderer_target},
        "wrapper": {"gameOvrFileOffset": wrapper_start, "length": len(wrapper),
            "sha256": sha256(wrapper), "drawGateSpans": gate_spans,
            "drawContract": {
                "finalArgument": "byte [BP+6]",
                "nonzeroFlag": "draw is skipped by JNE 0x3FED5",
                "zeroFlagRequirements": ["predicate 0x3F9FF(record, mode=0) returns nonzero",
                    "DS:0x71AD != 0"],
                "meaningOfPredicateAndEnableByte": "unresolved",
                "rendererCallOffset": 0x3FECB,
                "drawIsNotRuntimeObservation": True,
            }},
        "counts": {"directCallCount": len(rows),
            "ownerDescriptorOrdinals": {str(index): sum(row["ownerDescriptorOrdinal"] == index for row in rows)
                for index in sorted({row["ownerDescriptorOrdinal"] for row in rows})},
            "conditionalDrawCallCount": sum(row["drawEligibility"] == "conditional" for row in rows),
            "flagSuppressedCallCount": sum(row["drawEligibility"] == "suppressed-by-nonzero-renderer-flag" for row in rows),
            "runtimeObservedDrawCount": 0},
        "limitations": [
            "The 13 rows are direct source calls, not 13 observed or successful retail draws.",
            "Eleven documented indirect FF/3 call paths remain unresolved and are outside this direct-call roster.",
            "Variant values, pointer-table slot, caller control byte and final renderer flag are separate arguments.",
            "No variant is classified as idle, attack, movement, direction or temporal animation.",
            "The generic selector resolver's unresolved result is not used as a substitute for the exact complete-image stub and owner fixup joins recorded here.",
        ],
        "callers": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true")
    group.add_argument("--check", action="store_true")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    try:
        data = (json.dumps(build_report(), indent=2, ensure_ascii=False) + "\n").encode("utf-8")
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
    except (OSError, ValueError, KeyError, struct.error) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
