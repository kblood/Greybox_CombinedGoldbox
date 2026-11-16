#!/usr/bin/env python3
"""Normalize DOSBox-X INT 21h/AH=42 snapshots into a runtime VROOMM map."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable


REGISTER_RE = re.compile(r"\b(EAX|EBX|ECX|EDX|CS|EIP)=([0-9A-F]{4,8})\b")
DESTINATION_RE = re.compile(r"es:\[0010\]=([0-9A-F]{4})")
SIZE_RE = re.compile(r"es:\[0008\]=([0-9A-F]{4})")
SNAPSHOT_RE = re.compile(r"debugger_console_(\d+)\.txt$")

TARGETS_BY_PROFILE = {
    "pool-of-radiance": {
        "dispatcher_candidate": 0x3C73,
        "operand_parser_candidate": 0x74D3,
        "combat_handler_candidate": 0x24E1,
        "save_handler_candidate": 0x0FD8,
        "load_monster_candidate": 0x1196,
        "clear_monsters_candidate": 0x1FA3,
        "horizontal_menu_candidate": 0x1E17,
    },
    "gateway-to-the-savage-frontier": {
        "dispatcher_candidate": 0x43F3,
        "operand_parser_candidate": 0x9471,
        "ecl_loader_candidate": 0x9800,
        "memory_type_candidate": 0x9C1E,
        "memory_set_candidate": 0xA2CF,
        "memory_get_candidate": 0xA46D,
        "command_parser_candidate": 0xB578,
    },
}


@dataclass(frozen=True)
class SeekSnapshot:
    snapshot: int
    eax: int
    ebx: int
    ecx: int
    edx: int
    cs: int
    eip: int
    seek_offset: int
    destination_segment: int | None
    code_size: int | None


def parse_snapshot(path: Path) -> SeekSnapshot | None:
    match = SNAPSHOT_RE.search(path.name)
    if not match:
        return None
    text = path.read_text(encoding="utf-8", errors="replace")
    registers = {name: int(value, 16) for name, value in REGISTER_RE.findall(text)}
    required = {"EAX", "EBX", "ECX", "EDX", "CS", "EIP"}
    if not required.issubset(registers):
        return None
    eax = registers["EAX"]
    if ((eax >> 8) & 0xFF) != 0x42 or registers["EBX"] != 5 or (eax & 0xFF) != 0:
        return None
    destination = DESTINATION_RE.search(text)
    size = SIZE_RE.search(text)
    return SeekSnapshot(
        snapshot=int(match.group(1)),
        eax=eax,
        ebx=registers["EBX"],
        ecx=registers["ECX"],
        edx=registers["EDX"],
        cs=registers["CS"],
        eip=registers["EIP"],
        seek_offset=((registers["ECX"] & 0xFFFF) << 16) | (registers["EDX"] & 0xFFFF),
        destination_segment=int(destination.group(1), 16) if destination else None,
        code_size=int(size.group(1), 16) if size else None,
    )


def load_profile(map_path: Path, profile_id: str) -> dict[str, Any]:
    payload = json.loads(map_path.read_text(encoding="utf-8"))
    matches = [entry for entry in payload["binary_maps"] if entry["profile_id"] == profile_id]
    if len(matches) != 1:
        raise ValueError(f"expected one {profile_id!r} map, found {len(matches)}")
    return matches[0]


def normalize_trace(
    snapshots: Iterable[SeekSnapshot],
    profile: dict[str, Any],
    dosbox_version: str,
    targets_by_name: dict[str, int] | None = None,
) -> dict[str, Any]:
    seeks = sorted(snapshots, key=lambda item: item.snapshot)
    header_seeks = [item for item in seeks if item.seek_offset == 0 and item.destination_segment is None]
    loads = [item for item in seeks if item.destination_segment is not None and item.code_size is not None]
    expected = sorted(profile["descriptors"], key=lambda item: item["index"], reverse=True)
    errors: list[str] = []
    if len(header_seeks) != 1:
        errors.append(f"expected one header seek, found {len(header_seeks)}")
    if len(loads) != len(expected):
        errors.append(f"expected {len(expected)} descriptor loads, found {len(loads)}")

    records: list[dict[str, Any]] = []
    previous: dict[str, Any] | None = None
    for position, (observed, descriptor) in enumerate(zip(loads, expected)):
        index = int(descriptor["index"])
        offset = int(descriptor["ovr_file_offset"])
        size = int(descriptor["code_size"])
        if observed.seek_offset != offset:
            errors.append(
                f"load {position}: descriptor {index} offset 0x{offset:X}, observed 0x{observed.seek_offset:X}"
            )
        if observed.code_size != size:
            errors.append(
                f"load {position}: descriptor {index} size 0x{size:X}, observed 0x{observed.code_size:X}"
            )
        contiguous_expected = None
        contiguous = None
        if previous is not None:
            contiguous_expected = previous["destination_segment"] + (previous["code_size"] + 15) // 16
            contiguous = observed.destination_segment == contiguous_expected
        record = {
            "snapshot": observed.snapshot,
            "descriptor_index": index,
            "seek_offset": observed.seek_offset,
            "destination_segment": observed.destination_segment,
            "code_size": observed.code_size,
            "loader_cs": observed.cs,
            "loader_ip": observed.eip,
            "contiguous_expected_segment": contiguous_expected,
            "contiguous_from_previous": contiguous,
        }
        records.append(record)
        previous = record

    by_index = {record["descriptor_index"]: record for record in records}
    targets: list[dict[str, Any]] = []
    profile_targets = TARGETS_BY_PROFILE.get(profile["profile_id"], {})
    for name, file_offset in (profile_targets if targets_by_name is None else targets_by_name).items():
        descriptor = next(
            (
                item
                for item in profile["descriptors"]
                if int(item["ovr_file_offset"]) <= file_offset
                < int(item["ovr_file_offset"]) + int(item["code_size"])
            ),
            None,
        )
        if descriptor is None or int(descriptor["index"]) not in by_index:
            errors.append(f"target {name} at 0x{file_offset:X} has no traced descriptor")
            continue
        index = int(descriptor["index"])
        relative = file_offset - int(descriptor["ovr_file_offset"])
        targets.append(
            {
                "name": name,
                "file_offset": file_offset,
                "descriptor_index": index,
                "descriptor_relative_offset": relative,
                "loaded_cs": by_index[index]["destination_segment"],
                "candidate_cs_ip": f"{by_index[index]['destination_segment']:04X}:{relative:04X}",
                "claim": "loaded-byte candidate; execution not yet observed",
            }
        )

    source = profile["fbov"]
    return {
        "schema_version": 1,
        "captured_at": "2026-07-15",
        "profile_id": profile["profile_id"],
        "title": profile["title"],
        "dosbox_x_version": dosbox_version,
        "source": {
            "filename": "GAME.OVR",
            "size": int(source["file_size"]),
            "sha256": source["sha256"],
        },
        "probe": {"interrupt": "21h", "ah": "42h", "origin": 0, "dos_handle": 5},
        "header_seek_count": len(header_seeks),
        "descriptor_count": len(records),
        "records": records,
        "targets": targets,
        "validation": {"ok": not errors, "errors": errors},
    }


def render_markdown(payload: dict[str, Any]) -> str:
    source = payload["source"]
    lines = [
        "# Pool runtime VROOMM overlay map",
        "",
        "> Generated by `tools/parse_dosbox_vroomm_trace.py` from process-scoped DOSBox-X console snapshots.",
        "> Loaded addresses are valid for the captured startup layout. Candidate handler addresses are not",
        "> execution proof until a route trace reaches them.",
        "",
        f"- Capture: `{payload['captured_at']}`, DOSBox-X `{payload['dosbox_x_version']}`",
        f"- Retail source: `GAME.OVR`, {source['size']} bytes, SHA-256 `{source['sha256']}`",
        f"- Validation: **{'PASS' if payload['validation']['ok'] else 'FAIL'}**, "
        f"{payload['descriptor_count']} descriptor loads, {payload['header_seek_count']} header seek",
        "",
        "## Loaded candidate addresses",
        "",
        "| Static candidate | GAME.OVR | Descriptor | Relative | Captured candidate CS:IP | Claim |",
        "| --- | ---: | ---: | ---: | --- | --- |",
    ]
    for target in payload["targets"]:
        lines.append(
            f"| `{target['name']}` | `0x{target['file_offset']:X}` | {target['descriptor_index']} | "
            f"`0x{target['descriptor_relative_offset']:X}` | `{target['candidate_cs_ip']}` | "
            f"{target['claim']} |"
        )
    lines.extend(
        [
            "",
            "## Descriptor load evidence",
            "",
            "| Desc | Seek | Code size | Destination segment | Contiguous from previous | Snapshot |",
            "| ---: | ---: | ---: | ---: | :---: | ---: |",
        ]
    )
    for record in payload["records"]:
        contiguous = "-" if record["contiguous_from_previous"] is None else (
            "yes" if record["contiguous_from_previous"] else "no"
        )
        lines.append(
            f"| {record['descriptor_index']} | `0x{record['seek_offset']:X}` | "
            f"`0x{record['code_size']:X}` | `{record['destination_segment']:04X}` | "
            f"{contiguous} | {record['snapshot']} |"
        )
    if payload["validation"]["errors"]:
        lines.extend(["", "## Validation errors", ""])
        lines.extend(f"- {error}" for error in payload["validation"]["errors"])
    lines.extend(
        [
            "",
            "## Reproduction",
            "",
            "The exact DOSBox-X capture command and tool hash are in `gen1-dosbox-runtime-trace.md`.",
            "Normalize a fresh capture with:",
            "",
            "```powershell",
            "python tools/parse_dosbox_vroomm_trace.py `",
            "  --trace-dir build/dosbox-x-pool-all-overlay-seeks `",
            "  --map-json build/gen1-all-games-map.json `",
            "  --fixture docs/engine/research/pool-runtime-overlay-trace.json `",
            "  --markdown docs/engine/research/pool-runtime-overlay-map.md `",
            "  --strict",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def write_if_changed(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text(encoding="utf-8") != content:
        path.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace-dir", type=Path, required=True)
    parser.add_argument("--map-json", type=Path, default=Path("build/gen1-all-games-map.json"))
    parser.add_argument("--profile", default="pool-of-radiance")
    parser.add_argument("--dosbox-version", default="2026.07.02")
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--markdown", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    paths = sorted(
        args.trace_dir.glob("debugger_console_*.txt"),
        key=lambda path: int(SNAPSHOT_RE.search(path.name).group(1)),  # type: ignore[union-attr]
    )
    snapshots = [item for path in paths if (item := parse_snapshot(path)) is not None]
    payload = normalize_trace(snapshots, load_profile(args.map_json, args.profile), args.dosbox_version)
    fixture = json.dumps(payload, indent=2, sort_keys=False) + "\n"
    write_if_changed(args.fixture, fixture)
    write_if_changed(args.markdown, render_markdown(payload))
    digest = hashlib.sha256(fixture.encode("utf-8")).hexdigest()
    print(
        f"[vroomm-runtime] descriptors={payload['descriptor_count']} "
        f"targets={len(payload['targets'])} ok={payload['validation']['ok']} fixture_sha256={digest}"
    )
    return 1 if args.strict and not payload["validation"]["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
