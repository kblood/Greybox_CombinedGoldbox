#!/usr/bin/env python3
"""Map Gen1 SAVGAM string references to VROOMM procedures and inbound calls."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LAYOUTS = REPO_ROOT / "build" / "vroomm-layouts.json"


def preceding_prologue(data: bytes, ref: int, lower_bound: int, window: int = 0x1000) -> int | None:
    start = max(lower_bound, ref - window)
    matches = [data.rfind(pattern, start, ref + 1) for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")]
    found = max(matches)
    return found if found >= start else None


def pascal_string(data: bytes, offset: int) -> str | None:
    if offset < 0 or offset >= len(data):
        return None
    size = data[offset]
    if not size or offset + 1 + size > len(data):
        return None
    raw = data[offset + 1 : offset + 1 + size]
    if any(byte < 0x20 or byte > 0x7E for byte in raw):
        return None
    return raw.decode("ascii")


def scan_descriptor(data: bytes, descriptor: dict[str, Any], anchor_file_offset: int) -> list[dict[str, Any]]:
    base = int(descriptor["ovr_file_offset"])
    size = int(descriptor["code_size"])
    relative = anchor_file_offset - base
    needle = b"\xbf" + relative.to_bytes(2, "little")
    refs: list[dict[str, Any]] = []
    cursor = base
    end = base + size
    stub_offsets = {int(value): index for index, value in enumerate(descriptor.get("stub_proc_offsets", []))}
    while True:
        found = data.find(needle, cursor, end)
        if found < 0:
            break
        prologue = preceding_prologue(data, found, base)
        proc_offset = None if prologue is None else prologue - base
        refs.append(
            {
                "instruction_file_offset": found,
                "instruction_code_offset": found - base,
                "procedure_file_offset": prologue,
                "procedure_code_offset": proc_offset,
                "public_stub_index": stub_offsets.get(proc_offset),
            }
        )
        cursor = found + 1
    return refs


def map_game(game: dict[str, Any]) -> dict[str, Any]:
    overlay = Path(game["overlay_path"])
    loader = Path(game["loader_path"])
    result: dict[str, Any] = {
        "profile_id": game["profile_id"],
        "title": game["title"],
        "root": game["root"],
        "overlay_path": str(overlay),
        "loader_path": str(loader),
        "anchors": [],
        "resident_anchors": [],
    }
    if loader.is_file():
        resident = loader.read_bytes().lower()
        cursor = 0
        while True:
            found = resident.find(b"savgam", cursor)
            if found < 0:
                break
            result["resident_anchors"].append({"file_offset": found, "text": "savgam"})
            cursor = found + 1
    if not overlay.is_file():
        result["status"] = "overlay_missing"
        return result

    data = overlay.read_bytes()
    lower = data.lower()
    descriptors = game.get("descriptors", [])
    cursor = 0
    while True:
        found = lower.find(b"savgam", cursor)
        if found < 0:
            break
        cursor = found + 1
        descriptor = next(
            (
                item
                for item in descriptors
                if int(item["ovr_file_offset"]) <= found < int(item["ovr_file_offset"]) + int(item["code_size"])
            ),
            None,
        )
        if descriptor is None:
            continue
        anchor_start = found - 1 if found and data[found - 1] == 6 else found
        refs = scan_descriptor(data, descriptor, anchor_start)
        anchor: dict[str, Any] = {
            "text": data[found : found + 6].decode("ascii", errors="replace"),
            "file_offset": anchor_start,
            "descriptor_index": int(descriptor["index"]),
            "code_offset": anchor_start - int(descriptor["ovr_file_offset"]),
            "pascal_text": pascal_string(data, anchor_start),
            "references": refs,
        }
        for ref in refs:
            proc = ref["procedure_code_offset"]
            if proc is None:
                ref["inbound_public_calls"] = []
                continue
            inbound = []
            for source in descriptors:
                for fixup in source.get("fixup_entries", []):
                    if fixup.get("target_descriptor_index") == descriptor["index"] and fixup.get("target_proc_offset") == proc:
                        inbound.append(
                            {
                                "source_descriptor_index": int(source["index"]),
                                "source_code_offset": int(fixup["instruction_offset"]),
                                "target_stub_index": fixup.get("target_stub_index"),
                            }
                        )
            ref["inbound_public_calls"] = inbound
        result["anchors"].append(anchor)
    if result["anchors"]:
        result["status"] = "overlay_mapped"
    elif result["resident_anchors"]:
        result["status"] = "resident_anchor_only"
    else:
        result["status"] = "no_literal_anchor"
    return result


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Generated Gen1 Save Dispatch Map",
        "",
        "> Generated by `tools/map_gen1_save_dispatch.py`; offsets are byte evidence, names are anchors rather than recovered symbols.",
        "",
        "| Profile | Corpus root | Status | OVR anchors | EXE anchors | Procedures | Inbound calls |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: |",
    ]
    for game in payload["games"]:
        refs = [ref for anchor in game["anchors"] for ref in anchor["references"]]
        inbound = sum(len(ref["inbound_public_calls"]) for ref in refs)
        lines.append(
            f"| `{game['profile_id']}` | `{game['root']}` | {game['status']} | "
            f"{len(game['anchors'])} | {len(game['resident_anchors'])} | {len(refs)} | {inbound} |"
        )
    lines.extend(["", "## Procedures", ""])
    for game in payload["games"]:
        lines.append(f"### {game['title']} - `{game['root']}`")
        lines.append("")
        for anchor in game["resident_anchors"]:
            lines.append(
                f"- resident `{Path(game['loader_path']).name}` literal at file `0x{anchor['file_offset']:X}`; "
                "procedure ownership requires MZ relocation/runtime mapping"
            )
        if not game["anchors"]:
            lines.append(f"No in-overlay `savgam` anchor ({game['status']}).")
            lines.append("")
            continue
        for anchor in game["anchors"]:
            lines.append(
                f"- descriptor `ovr{anchor['descriptor_index']:03d}` anchor `0x{anchor['code_offset']:04X}` "
                f"(file `0x{anchor['file_offset']:X}`), text `{anchor['pascal_text'] or anchor['text']}`"
            )
            for ref in anchor["references"]:
                proc = ref["procedure_code_offset"]
                proc_text = "unknown" if proc is None else f"0x{proc:04X}"
                stub = ref["public_stub_index"]
                calls = ref["inbound_public_calls"]
                source = ", ".join(f"ovr{call['source_descriptor_index']:03d}+0x{call['source_code_offset']:04X}" for call in calls) or "none"
                lines.append(f"  - ref `0x{ref['instruction_code_offset']:04X}` -> procedure `{proc_text}`, stub `{stub}`, inbound: {source}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layouts", type=Path, default=DEFAULT_LAYOUTS)
    parser.add_argument("--json", type=Path)
    parser.add_argument("--markdown", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    layouts = json.loads(args.layouts.read_text(encoding="utf-8"))
    games = [map_game(game) for game in layouts.get("games", [])]
    payload = {"format_version": 1, "source_layouts": str(args.layouts), "games": games}
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(render_markdown(payload), encoding="utf-8")
    if not args.json and not args.markdown:
        print(json.dumps(payload, indent=2))
    if args.strict and any(game["status"] == "overlay_missing" for game in games):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
