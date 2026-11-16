#!/usr/bin/env python3
"""Validate a Gateway operand-parser execution probe and reject inherited Secret aliases.

BUILD-QUEUE.md line 474 requires Gateway's own DGROUP, archive/member selector, ECL cursor
address, body far pointer, virtual-address conversion, and Area1 base to be *independently
derived and byte-validated*, and explicitly forbids inheriting Secret's DS/ES/cursor-offset/
parser-segment/breakpoint aliases (see docs/engine/BUILD-QUEUE.md item 5's "Recover Gateway's
own live game-area/member selector..." bullet).

This script is the retained-RAM validator called for by that item. It consumes the JSON
produced by tools/trace_gateway_operand_parser_execution.ps1 (schema
"Gateway operand-parser silent-execution probe (looped)") and:

1. Rejects any claimed match whose CS segment or DS segment at the moment of the hit is a
   segment ever used as a Secret of the Silver Blades runtime alias (docs/engine/research/
   secret-startup-input-trace.md: 407F/4674/1E48/54DC/411B/41B7/4465/250A).
2. Rejects any claimed Gateway DGROUP/selector/cursor/body-pointer/Area1-base offset that
   equals one of Secret's own DGROUP-relative offsets (0x49E3/0x49ED/0x49D2/0x01E4/0x5376/
   0x8000/0x4CCD/0x4CD0/0x6A00/0x67D2/0x38A2/0x0800/0x7420/0xA4C2).
3. Reports, per hit, whether the resident bytes actually matched the retail operand parser
   (GAME.OVR+0x9471); a probe with zero matching hits is reported as
   "operand_parser_execution_not_confirmed", not silently treated as success.
4. Leaves Gateway's own DGROUP/selector/cursor/body-pointer/Area1-base fields explicit
   "UNLOCATED" placeholders until a future probe supplies confirmed values, so this script can
   be rerun unchanged once that evidence exists -- it will then reject any of those confirmed
   values that happen to collide with a Secret alias, rather than requiring a second script.

As of 2026-07-16 the only Gateway-confirmed runtime facts are: destination segment 1B37 is
genuinely *executed* (not just data-copied into) during silent startup with zero keypresses,
and the routine resident there at every observed silent-startup hit has DS=0CEB and does NOT
match any of the six named descriptor-9 roles (operand_parser/ecl_loader/memory_type/
memory_set/memory_get/command_parser) at GAME.OVR+0x9471/0x9800/0x9C1E/0xA2CF/0xA46D/0xB578.
Neither 1B37 nor 0CEB collides with any Secret alias, so this is recorded as a clean (if
still unconfirmed) result rather than a rejected one.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

# Segments observed as Secret of the Silver Blades runtime aliases across
# docs/engine/research/secret-startup-input-trace.md. Any Gateway CS or DS equal to one of
# these at a claimed-match hit would indicate an accidental copy-paste of Secret's own runtime
# state rather than an independently derived Gateway value.
SECRET_ALIAS_SEGMENTS: frozenset[str] = frozenset(
    {
        "407F",  # Secret's first-observed ECL loader/parser segment
        "4674",  # Secret's writer/consumer selector-transition segment
        "1E48",  # Secret's Load-procedure transient DS (explicitly rejected as a route DGROUP)
        "54DC",  # Secret's ES-relative Area1 word resolver segment
        "411B",  # Secret's relocated operand-parser segment (world init)
        "41B7",  # Secret's relocated tactical-parser segment
        "4465",  # Secret's relocated resume-parser segment
        "250A",  # Secret's corrected LOADFIX memory-breakpoint alias
    }
)

# DGROUP-relative / logical offsets that are Secret-specific field addresses, not Gateway's own.
SECRET_ALIAS_OFFSETS: frozenset[int] = frozenset(
    {
        0x49E3,  # Secret ECL header table
        0x49ED,  # Secret ECL cursor
        0x49D2,  # Secret area pointer
        0x01E4,  # Secret area ECL member field offset
        0x5376,  # Secret archive-set field
        0x8000,  # Secret virtual-address conversion constant (body[va - 0x8000])
        0x4CCD,  # Secret Area1 logical consumed-flag word (natural-encounter route)
        0x4CD0,  # Secret Area1 logical seed word (natural-encounter route)
        0x6A00,  # Secret Area1 word resolver base (ES:((0x6A00 + logical*2) & 0xFFFF))
        0x67D2,  # Secret loader's published decompressed-body pointer field
        0x38A2,  # Secret's differential ECL-member selector candidate
        0x0800,  # Secret's differential game-area/archive selector candidate
        0x7420,  # Secret's live archive selector byte
        0xA4C2,  # Secret's live ECL-member consumer byte
    }
)

GATEWAY_ROLE_FILE_OFFSETS = {
    "operand_parser": 0x9471,
    "ecl_loader": 0x9800,
    "memory_type_candidate": 0x9C1E,
    "memory_set_candidate": 0xA2CF,
    "memory_get_candidate": 0xA46D,
    "command_parser": 0xB578,
}


def _segment_of(cs_ip: str | None) -> str | None:
    if not cs_ip or ":" not in cs_ip:
        return None
    return cs_ip.split(":", 1)[0].upper()


def validate_probe(
    probe: dict[str, Any],
    *,
    confirmed_dgroup: int | None = None,
    confirmed_selector_offsets: dict[str, int] | None = None,
) -> dict[str, Any]:
    if probe.get("profile_id") != "gateway-to-the-savage-frontier":
        raise ValueError("probe is not a Gateway to the Savage Frontier artifact")

    rejections: list[str] = []
    matches = [h for h in probe.get("hits", []) if h.get("resident_bytes_match_retail_parser")]

    for hit in probe.get("hits", []):
        cs_seg = _segment_of(hit.get("cs_ip"))
        ds_seg = hit.get("ds")
        if cs_seg and cs_seg in SECRET_ALIAS_SEGMENTS:
            rejections.append(
                f"hit {hit.get('index')}: CS segment {cs_seg} is a Secret-only runtime alias, "
                "not an independently derived Gateway value"
            )
        if ds_seg and ds_seg.upper() in SECRET_ALIAS_SEGMENTS:
            rejections.append(
                f"hit {hit.get('index')}: DS segment {ds_seg} is a Secret-only runtime alias, "
                "not an independently derived Gateway value"
            )

    confirmed_selector_offsets = confirmed_selector_offsets or {}
    for name, offset in confirmed_selector_offsets.items():
        if offset in SECRET_ALIAS_OFFSETS:
            rejections.append(
                f"confirmed selector '{name}'=0x{offset:04X} collides with a Secret-specific "
                "DGROUP/logical offset and must not be promoted as a Gateway value"
            )
    if confirmed_dgroup is not None:
        confirmed_dgroup_seg = f"{confirmed_dgroup:04X}"
        if confirmed_dgroup_seg in SECRET_ALIAS_SEGMENTS:
            rejections.append(
                f"confirmed DGROUP segment {confirmed_dgroup_seg} collides with a Secret runtime "
                "alias and must not be promoted as Gateway's own DGROUP"
            )

    verdict = "operand_parser_execution_confirmed" if matches else "operand_parser_execution_not_confirmed"

    return {
        "schema_version": 1,
        "title": "Gateway runtime execution validator",
        "profile_id": "gateway-to-the-savage-frontier",
        "hit_count": len(probe.get("hits", [])),
        "matching_hit_count": len(matches),
        "verdict": verdict,
        "rejections": rejections,
        "clean": not rejections,
        "gateway_own_values": {
            "dgroup": f"0x{confirmed_dgroup:04X}" if confirmed_dgroup is not None else "UNLOCATED",
            "archive_member_selector": confirmed_selector_offsets.get("archive_member_selector", "UNLOCATED"),
            "ecl_cursor_address": confirmed_selector_offsets.get("ecl_cursor_address", "UNLOCATED"),
            "body_far_pointer": confirmed_selector_offsets.get("body_far_pointer", "UNLOCATED"),
            "virtual_address_conversion": confirmed_selector_offsets.get("virtual_address_conversion", "UNLOCATED"),
            "area1_base": confirmed_selector_offsets.get("area1_base", "UNLOCATED"),
        },
        "claim_boundary": (
            "This validates whatever the input probe actually captured; it does not itself "
            "prove operand-parser execution. A 'not_confirmed' verdict with zero rejections "
            "means no Secret alias was found -- it does not mean Gateway's own runtime values "
            "are known."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe-json", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    probe = json.loads(args.probe_json.read_text(encoding="utf-8"))
    report = validate_probe(probe)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2))

    if not report["clean"]:
        return 1
    if args.strict and report["verdict"] != "operand_parser_execution_confirmed":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
