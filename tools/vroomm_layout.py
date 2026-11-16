#!/usr/bin/env python3
"""Inventory Gen1 VROOMM descriptor, public-stub, and OVR fixup geometry.

The loader and GAME.OVR contain different halves of the format:

* the loader contains 14-byte descriptor headers followed by a short runtime
  preamble and a stride-5 public-stub array;
* GAME.OVR stores each overlay's code followed by ``fixup_size`` bytes.  Those
  bytes are a sorted array of little-endian u16 code-relative offsets.  The
  word at each offset is the segment value relocated when the overlay loads.

This command emits the complete machine-readable fixup rows and a compact
Markdown audit across every discovered Gen1 install.
"""
from __future__ import annotations

import argparse
import json
import struct
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

import gen1_map
import exepack_unpack


DESCRIPTOR_HEADER_SIZE = 14
STUB_STRIDE = 5
STUB_SEARCH_BYTES = 32


@dataclass
class FixupEntry:
    code_offset: int
    original_segment: int
    context: str
    instruction_offset: int | None
    call_target_offset: int | None = None
    loader_target_file_offset: int | None = None
    loader_target_coordinate_space: str | None = None
    route_kind: str | None = None
    target_descriptor_index: int | None = None
    target_stub_index: int | None = None
    target_proc_offset: int | None = None
    target_ovr_file_offset: int | None = None


@dataclass
class DescriptorLayout:
    index: int
    loader_file_offset: int
    next_loader_file_offset: int | None
    loader_span_size: int | None
    loader_preamble_size: int | None
    stub_array_file_offset: int | None
    runtime_descriptor_image_offset: int | None
    runtime_stub_array_image_offset: int | None
    stub_count: int
    stub_candidate_count: int
    stub_candidate_file_offsets: list[int]
    stub_proc_offsets: list[int]
    packed_stub_proc_offsets: list[int]
    runtime_stub_proc_offsets: list[int]
    stub_tags: list[int]
    bytes_after_stub_to_next_descriptor: int | None
    loader_layout_status: str
    ovr_file_offset: int
    code_size: int
    fixup_file_offset: int
    fixup_size: int
    fixup_entry_count: int
    fixup_offsets_sorted_unique: bool
    fixup_offsets_in_code: bool
    tiles_next_ovr: bool | None
    fixup_format_status: str
    fixup_context_counts: dict[str, int]
    fixup_entries: list[FixupEntry]


@dataclass
class GameLayout:
    root: str
    profile_id: str
    title: str
    loader_path: str
    overlay_path: str
    runtime_image_status: str
    descriptor_count: int
    total_fixups: int
    fixup_lcall_count: int
    scanned_lcall_count: int
    lcall_counts_match: bool
    stub_selector_base: int | None
    stub_selector_score: int
    stub_selector_runner_up_score: int
    stub_selector_mapped_lcalls: int
    lcall_route_counts: dict[str, int]
    owned_stub_targets_in_code: bool
    valid_fixup_descriptors: int
    located_stub_layouts: int
    runtime_stub_layouts: int
    packed_runtime_stub_differences: int
    unique_stub_layouts: int
    resolved_overlapping_stub_layouts: int
    ambiguous_stub_layouts: int
    top_lcall_segments: list[dict[str, int]]
    strict_status: str
    descriptors: list[DescriptorLayout]


@dataclass
class LayoutReport:
    format_version: int
    games: list[GameLayout]
    totals: dict[str, int]
    conclusions: list[str]


def classify_fixup(code: bytes, offset: int) -> tuple[str, int | None]:
    if offset >= 3 and code[offset - 3] == 0x9A:
        return "lcall_segment", offset - 3
    if offset >= 3 and code[offset - 3] == 0xEA:
        return "ljmp_segment", offset - 3
    if offset >= 1 and 0xB8 <= code[offset - 1] <= 0xBF:
        return "mov_reg_segment_immediate", offset - 1
    return "relocatable_segment_word", None


def parse_fixup_entries(code: bytes, raw: bytes) -> tuple[list[FixupEntry], bool, bool]:
    if len(raw) % 2:
        return [], False, False
    offsets = list(struct.unpack(f"<{len(raw) // 2}H", raw)) if raw else []
    sorted_unique = offsets == sorted(set(offsets))
    in_code = all(offset + 2 <= len(code) for offset in offsets)
    entries: list[FixupEntry] = []
    for offset in offsets:
        if offset + 2 > len(code):
            continue
        segment = struct.unpack_from("<H", code, offset)[0]
        context, instruction_offset = classify_fixup(code, offset)
        entries.append(FixupEntry(offset, segment, context, instruction_offset))
    return entries, sorted_unique, in_code


def find_stub_candidates(loader: bytes, descriptor: gen1_map.VroommDescriptor) -> list[int]:
    count = descriptor.jmp_count_byte
    if count <= 0:
        return []
    first = descriptor.loader_file_offset + DESCRIPTOR_HEADER_SIZE
    last = min(len(loader), first + STUB_SEARCH_BYTES)
    candidates: list[int] = []
    for start in range(first, last):
        end = start + count * STUB_STRIDE
        if end > len(loader):
            break
        if all(loader[start + i * STUB_STRIDE : start + i * STUB_STRIDE + 2] == b"\xcd\x3f" for i in range(count)):
            candidates.append(start)
    return candidates


def descriptor_layouts(
    loader: bytes,
    overlay: bytes,
    descriptors: list[gen1_map.VroommDescriptor],
) -> list[DescriptorLayout]:
    physical = sorted(descriptors, key=lambda row: row.loader_file_offset)
    next_loader = {
        row.loader_file_offset: physical[index + 1].loader_file_offset if index + 1 < len(physical) else None
        for index, row in enumerate(physical)
    }
    rows: list[DescriptorLayout] = []
    for descriptor in descriptors:
        code_start = descriptor.ovr_file_offset
        code_end = code_start + descriptor.code_size
        fixup_end = code_end + descriptor.fixup_size
        code = overlay[code_start:code_end]
        raw_fixups = overlay[code_end:fixup_end]
        entries, sorted_unique, in_code = parse_fixup_entries(code, raw_fixups)
        candidates = find_stub_candidates(loader, descriptor)
        stub_start = candidates[0] if len(candidates) == 1 else None
        stub_procs: list[int] = []
        stub_tags: list[int] = []
        if stub_start is not None:
            for index in range(descriptor.jmp_count_byte):
                pos = stub_start + index * STUB_STRIDE
                stub_procs.append(struct.unpack_from("<H", loader, pos + 2)[0])
                stub_tags.append(loader[pos + 4])
        following = next_loader[descriptor.loader_file_offset]
        span = following - descriptor.loader_file_offset if following is not None else None
        trailer = None
        if following is not None and stub_start is not None:
            trailer = following - (stub_start + descriptor.jmp_count_byte * STUB_STRIDE)
        format_ok = len(raw_fixups) == descriptor.fixup_size and sorted_unique and in_code
        rows.append(
            DescriptorLayout(
                index=descriptor.index,
                loader_file_offset=descriptor.loader_file_offset,
                next_loader_file_offset=following,
                loader_span_size=span,
                loader_preamble_size=(stub_start - descriptor.loader_file_offset - DESCRIPTOR_HEADER_SIZE) if stub_start is not None else None,
                stub_array_file_offset=stub_start,
                runtime_descriptor_image_offset=None,
                runtime_stub_array_image_offset=None,
                stub_count=descriptor.jmp_count_byte,
                stub_candidate_count=len(candidates),
                stub_candidate_file_offsets=candidates,
                stub_proc_offsets=stub_procs,
                packed_stub_proc_offsets=list(stub_procs),
                runtime_stub_proc_offsets=[],
                stub_tags=stub_tags,
                bytes_after_stub_to_next_descriptor=trailer,
                loader_layout_status=(
                    "unique_stride5_stub_array"
                    if len(candidates) == 1
                    else "ambiguous_stride5_stub_array"
                    if candidates
                    else "stub_array_unresolved"
                ),
                ovr_file_offset=descriptor.ovr_file_offset,
                code_size=descriptor.code_size,
                fixup_file_offset=code_end,
                fixup_size=descriptor.fixup_size,
                fixup_entry_count=len(entries),
                fixup_offsets_sorted_unique=sorted_unique,
                fixup_offsets_in_code=in_code,
                tiles_next_ovr=(fixup_end == descriptor.next_ovr_file_offset) if descriptor.next_ovr_file_offset is not None else None,
                fixup_format_status="u16_code_relative_offsets" if format_ok else "invalid_or_unclassified",
                fixup_context_counts=dict(sorted(Counter(entry.context for entry in entries).items())),
                fixup_entries=entries,
            )
        )
    return rows


def stub_selector_geometry(layouts: list[DescriptorLayout]) -> list[tuple[int, int]]:
    """Return each stub segment's selector delta and runtime byte size."""
    out: list[tuple[int, int]] = []
    paragraphs = 0
    for row in layouts:
        runtime_size = 0x20 + row.stub_count * STUB_STRIDE
        out.append((paragraphs, runtime_size))
        paragraphs += (runtime_size + 15) // 16
    return out


def infer_stub_selector_base(layouts: list[DescriptorLayout]) -> tuple[int | None, int, int]:
    scores: Counter[int] = Counter()
    geometry = stub_selector_geometry(layouts)
    for source in layouts:
        for entry in source.fixup_entries:
            if entry.context != "lcall_segment" or entry.call_target_offset is None:
                continue
            for descriptor, (delta, runtime_size) in zip(layouts, geometry, strict=True):
                target = entry.call_target_offset
                is_header = target == 0
                is_public = 0x20 <= target < runtime_size and (target - 0x20) % STUB_STRIDE == 0
                if is_header or is_public:
                    scores[(entry.original_segment - delta) & 0xFFFF] += 1
    ranked = scores.most_common(2)
    if not ranked:
        return None, 0, 0
    return ranked[0][0], ranked[0][1], ranked[1][1] if len(ranked) > 1 else 0


def classify_lcall_routes(
    loader: bytes,
    overlay: bytes,
    mz: gen1_map.MzInfo | None,
    layouts: list[DescriptorLayout],
    runtime_image: bytes | None = None,
) -> tuple[int | None, int, int]:
    del mz  # Relocated selector words are not static MZ segment addresses.
    descriptor_header_positions = {row.loader_file_offset for row in layouts}
    for row in layouts:
        if len(row.stub_candidate_file_offsets) <= 1:
            continue
        viable = [
            start for start in row.stub_candidate_file_offsets
            if not any(start + index * STUB_STRIDE in descriptor_header_positions for index in range(row.stub_count))
        ]
        if len(viable) != 1:
            continue
        selected = viable[0]
        row.stub_array_file_offset = selected
        row.stub_proc_offsets = [struct.unpack_from("<H", loader, selected + index * STUB_STRIDE + 2)[0] for index in range(row.stub_count)]
        row.stub_tags = [loader[selected + index * STUB_STRIDE + 4] for index in range(row.stub_count)]
        row.loader_preamble_size = selected - row.loader_file_offset - DESCRIPTOR_HEADER_SIZE
        if row.next_loader_file_offset is not None:
            row.bytes_after_stub_to_next_descriptor = row.next_loader_file_offset - (selected + row.stub_count * STUB_STRIDE)
        row.loader_layout_status = "header_boundary_resolved_stride5_stub_array"

    # Packed EXEPACK offsets are not load-image offsets. Re-associate each raw
    # descriptor with its runtime record by stable OVR geometry, then take the
    # actual public-stub procedure words from that complete image.
    if runtime_image is not None:
        runtime_descriptors = gen1_map.scan_descriptors(runtime_image, overlay)
        runtime_by_ovr = {d.ovr_file_offset: d for d in runtime_descriptors}
        runtime_headers = {d.loader_file_offset for d in runtime_descriptors}
        for row in layouts:
            runtime = runtime_by_ovr.get(row.ovr_file_offset)
            if runtime is None or (runtime.code_size, runtime.fixup_size, runtime.jmp_count_byte) != (row.code_size, row.fixup_size, row.stub_count):
                row.loader_layout_status = "runtime_descriptor_unmatched"
                continue
            candidates = find_stub_candidates(runtime_image, runtime)
            candidates = [
                start for start in candidates
                if not any(start + index * STUB_STRIDE in runtime_headers for index in range(row.stub_count))
            ]
            if len(candidates) != 1:
                row.loader_layout_status = "runtime_stub_layout_unresolved"
                continue
            runtime_stub = candidates[0]
            row.runtime_descriptor_image_offset = runtime.loader_file_offset
            row.runtime_stub_array_image_offset = runtime_stub
            row.stub_proc_offsets = [
                struct.unpack_from("<H", runtime_image, runtime_stub + index * STUB_STRIDE + 2)[0]
                for index in range(row.stub_count)
            ]
            row.runtime_stub_proc_offsets = list(row.stub_proc_offsets)
            row.stub_tags = [runtime_image[runtime_stub + index * STUB_STRIDE + 4] for index in range(row.stub_count)]
            row.loader_layout_status = "complete_load_image_stride5_stub_array"

    for row in layouts:
        code = overlay[row.ovr_file_offset : row.ovr_file_offset + row.code_size]
        for entry in row.fixup_entries:
            if entry.context == "lcall_segment" and entry.instruction_offset is not None:
                entry.call_target_offset = struct.unpack_from("<H", code, entry.instruction_offset + 1)[0]

    selector_base, selector_score, runner_up = infer_stub_selector_base(layouts)
    geometry = stub_selector_geometry(layouts)
    selectors = {
        (selector_base + delta) & 0xFFFF: (row, runtime_size)
        for row, (delta, runtime_size) in zip(layouts, geometry, strict=True)
    } if selector_base is not None else {}

    for row in layouts:
        for entry in row.fixup_entries:
            if entry.context != "lcall_segment":
                continue
            selected = selectors.get(entry.original_segment)
            target = entry.call_target_offset
            if selected is None or target is None:
                entry.route_kind = "unresolved_relocated_segment"
                continue
            owner, runtime_size = selected
            entry.target_descriptor_index = owner.index
            if target == 0:
                entry.route_kind = "descriptor_header_entry"
                continue
            if target >= runtime_size and target < owner.code_size:
                entry.route_kind = "direct_overlay_code"
                entry.target_proc_offset = target
                entry.target_ovr_file_offset = owner.ovr_file_offset + target
                continue
            if not (0x20 <= target < runtime_size) or (target - 0x20) % STUB_STRIDE:
                entry.route_kind = "stub_segment_non_entry_offset"
                continue
            stub_index = (target - 0x20) // STUB_STRIDE
            entry.target_stub_index = stub_index
            stub_array = owner.runtime_stub_array_image_offset if runtime_image is not None else owner.stub_array_file_offset
            stub_source = runtime_image if runtime_image is not None else loader
            if stub_array is None:
                entry.route_kind = "public_stub_layout_unresolved"
                continue
            stub_file = stub_array + stub_index * STUB_STRIDE
            entry.loader_target_file_offset = stub_file
            entry.loader_target_coordinate_space = "complete_load_image" if runtime_image is not None else "packed_file"
            if stub_source[stub_file : stub_file + 2] != b"\xcd\x3f":
                entry.route_kind = "public_stub_bytes_invalid"
                continue
            proc_offset = struct.unpack_from("<H", stub_source, stub_file + 2)[0]
            entry.target_proc_offset = proc_offset
            entry.target_ovr_file_offset = owner.ovr_file_offset + proc_offset
            entry.route_kind = "public_stub_owned" if proc_offset < owner.code_size else "public_stub_target_out_of_bounds"
    return selector_base, selector_score, runner_up


def map_game(root: Path) -> GameLayout:
    profile_id, title = gen1_map.profile_for_root(root)
    loader_path = root / ("START.EXE" if (root / "START.EXE").exists() else "GAME.EXE")
    overlay_path = root / "GAME.OVR"
    loader = loader_path.read_bytes()
    overlay = overlay_path.read_bytes()
    descriptors = gen1_map.scan_descriptors(loader, overlay)
    layouts = descriptor_layouts(loader, overlay, descriptors)
    mz = gen1_map.parse_mz(loader)
    try:
        runtime_image, _ = exepack_unpack.unpack_complete_load_image(loader_path)
    except exepack_unpack.ExepackError:
        # Some older/special Gen1 loader variants do not use EXEPACK v1. Keep
        # their prior packed-byte analysis explicit instead of claiming a
        # complete load-image mapping that this decoder cannot provide.
        runtime_image = None
    selector_base, selector_score, selector_runner_up = classify_lcall_routes(loader, overlay, mz, layouts, runtime_image)
    _, scanned_selector_counts = gen1_map.collect_lcall_selector_offsets(overlay, descriptors)
    scanned_lcalls = sum(scanned_selector_counts.values())
    fixup_lcalls = sum(row.fixup_context_counts.get("lcall_segment", 0) for row in layouts)
    route_counts = Counter(
        entry.route_kind
        for row in layouts
        for entry in row.fixup_entries
        if entry.context == "lcall_segment" and entry.route_kind is not None
    )
    owned_targets_in_code = all(
        entry.route_kind not in {"public_stub_owned", "public_stub_target_out_of_bounds"}
        or (
            entry.target_proc_offset is not None
            and entry.target_proc_offset < layouts[entry.target_descriptor_index].code_size
        )
        for row in layouts
        for entry in row.fixup_entries
        if entry.context == "lcall_segment"
    )
    lcall_segments = Counter(
        entry.original_segment
        for row in layouts
        for entry in row.fixup_entries
        if entry.context == "lcall_segment"
    )
    valid_fixups = sum(row.fixup_format_status == "u16_code_relative_offsets" for row in layouts)
    located_stubs = sum(row.stub_candidate_count > 0 for row in layouts)
    runtime_stub_layouts = sum(row.runtime_stub_array_image_offset is not None for row in layouts)
    packed_runtime_stub_differences = sum(
        packed != runtime
        for row in layouts
        for packed, runtime in zip(row.packed_stub_proc_offsets, row.runtime_stub_proc_offsets)
    )
    unique_stubs = sum(
        row.loader_layout_status
        in {
            "unique_stride5_stub_array",
            "header_boundary_resolved_stride5_stub_array",
            "call_edge_resolved_stride5_stub_array",
            "complete_load_image_stride5_stub_array",
        }
        for row in layouts
    )
    ambiguous_stubs = sum(row.loader_layout_status == "ambiguous_stride5_stub_array" for row in layouts)
    resolved_overlaps = sum(
        row.loader_layout_status
        in {"header_boundary_resolved_stride5_stub_array", "call_edge_resolved_stride5_stub_array"}
        for row in layouts
    )
    tiled = all(row.tiles_next_ovr is not False for row in layouts)
    strict = (
        bool(layouts)
        and valid_fixups == len(layouts)
        and located_stubs == len(layouts)
        and (runtime_image is None or runtime_stub_layouts == len(layouts))
        and fixup_lcalls == scanned_lcalls
        and sum(route_counts.values()) == fixup_lcalls
        and selector_base is not None
        and selector_score > selector_runner_up
        and tiled
    )
    return GameLayout(
        root=str(root),
        profile_id=profile_id,
        title=title,
        loader_path=str(loader_path),
        overlay_path=str(overlay_path),
        runtime_image_status="complete_exepack_load_image" if runtime_image is not None else "not_exepack_v1",
        descriptor_count=len(layouts),
        total_fixups=sum(row.fixup_entry_count for row in layouts),
        fixup_lcall_count=fixup_lcalls,
        scanned_lcall_count=scanned_lcalls,
        lcall_counts_match=fixup_lcalls == scanned_lcalls,
        stub_selector_base=selector_base,
        stub_selector_score=selector_score,
        stub_selector_runner_up_score=selector_runner_up,
        stub_selector_mapped_lcalls=sum(
            count for route, count in route_counts.items()
            if route in {"public_stub_owned", "descriptor_header_entry"}
        ),
        lcall_route_counts=dict(sorted(route_counts.items())),
        owned_stub_targets_in_code=owned_targets_in_code,
        valid_fixup_descriptors=valid_fixups,
        located_stub_layouts=located_stubs,
        runtime_stub_layouts=runtime_stub_layouts,
        packed_runtime_stub_differences=packed_runtime_stub_differences,
        unique_stub_layouts=unique_stubs,
        resolved_overlapping_stub_layouts=resolved_overlaps,
        ambiguous_stub_layouts=ambiguous_stubs,
        top_lcall_segments=[{"segment": segment, "sites": sites} for segment, sites in lcall_segments.most_common(16)],
        strict_status="verified" if strict else "incomplete",
        descriptors=layouts,
    )


def build_report(paths: list[Path]) -> LayoutReport:
    games = [map_game(root) for root in gen1_map.discover_binary_roots(paths)]
    totals = {
        "games": len(games),
        "descriptors": sum(game.descriptor_count for game in games),
        "fixup_entries": sum(game.total_fixups for game in games),
        "lcall_fixups": sum(game.fixup_lcall_count for game in games),
        "verified_games": sum(game.strict_status == "verified" for game in games),
    }
    return LayoutReport(
        format_version=2,
        games=games,
        totals=totals,
        conclusions=[
            "fixup_size bytes are stored after each GAME.OVR code body, not inside the loader descriptor span",
            "every verified fixup table is a sorted unique array of little-endian u16 code-relative offsets",
            "an lcall fixup points at the segment word three bytes after opcode 0x9a",
            "loader public-stub arrays use stride 5 but have variable preamble and tag bytes; for EXEPACK v1, procedure words are read from the complete load image rather than packed-file offsets",
            "relocated selector words map to runtime stub segments by a game-specific base plus cumulative paragraph-rounded stub geometry",
            "public target offset 0 is the descriptor entry; offsets 0x20+n*5 select loader public-stub record n",
            "selectors outside the inferred stub geometry remain unresolved rather than being mislabelled as resident MZ targets",
            "large in-bounds offsets on a mapped selector are direct calls into already-loaded overlay code",
            "descriptor-header entries are distinct from public stubs; all non-lcall fixups are MOV register segment immediates",
        ],
    )


def hx(value: int | None) -> str:
    return "" if value is None else f"0x{value:x}"


def slash(value: str) -> str:
    return value.replace("\\", "/")


def markdown(report: LayoutReport) -> str:
    lines = [
        "# VROOMM Descriptor and Fixup Layout",
        "",
        "> Generated by `python tools/vroomm_layout.py`. Values come from installed retail loaders",
        "> and `GAME.OVR` bytes; no selector target is promoted from sibling-game similarity.",
        "",
        "## Verified Format",
        "",
        "- Loader: 14-byte descriptor header, variable preamble, then a stride-5 public-stub array.",
        "- For EXEPACK v1 loaders, packed bytes locate candidate descriptors and public-stub procedure words come from a matched complete load image keyed by OVR offset and descriptor geometry. Other loader variants are explicitly marked without that mapping.",
        "- Bytes after that array are measured only to the next physical descriptor; large gaps may contain unrelated resident code/data and are not labelled padding.",
        "- Overlay: `code_size` bytes followed immediately by `fixup_size` bytes.",
        "- Fixups: sorted unique little-endian `u16` offsets into that descriptor's code body.",
        "- At each fixup offset, the code word is the original relocatable segment value.",
        "- For `LCALL`, the fixup offset is exactly instruction offset + 3; independent complete-instruction counts must match.",
        "",
        "## Corpus Gate",
        "",
        "| Install | Descriptors | Fixups | LCALL fixups / scan | Selector base | Public stubs | Direct overlay | Descriptor entries | Unresolved selectors | Status |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for game in report.games:
        lines.append(
            f"| {game.title} | {game.descriptor_count} | {game.total_fixups} | "
            f"{game.fixup_lcall_count} / {game.scanned_lcall_count} | "
            f"{hx(game.stub_selector_base)} | "
            f"{game.lcall_route_counts.get('public_stub_owned', 0)} | "
            f"{game.lcall_route_counts.get('direct_overlay_code', 0)} | "
            f"{game.lcall_route_counts.get('descriptor_header_entry', 0)} | "
            f"{game.lcall_route_counts.get('unresolved_relocated_segment', 0)} | {game.strict_status} |"
        )
    lines.extend(
        [
            "",
            f"Totals: `{report.totals['games']}` installs, `{report.totals['descriptors']}` descriptors, "
            f"`{report.totals['fixup_entries']}` fixups, `{report.totals['lcall_fixups']}` LCALL fixups.",
            "",
            "## Per-Install Evidence",
            "",
        ]
    )
    for game in report.games:
        preambles = Counter(row.loader_preamble_size for row in game.descriptors if row.loader_preamble_size is not None)
        after_stub = Counter(
            row.bytes_after_stub_to_next_descriptor
            for row in game.descriptors
            if row.bytes_after_stub_to_next_descriptor is not None
        )
        contexts = Counter()
        for row in game.descriptors:
            contexts.update(row.fixup_context_counts)
        top = ", ".join(f"`{hx(row['segment'])}` ({row['sites']})" for row in game.top_lcall_segments[:8])
        lines.extend(
            [
                f"### {game.title}",
                "",
                f"- Root: `{slash(game.root)}`",
                f"- Runtime image: `{game.runtime_image_status}`.",
                f"- Descriptor fixup format: `{game.valid_fixup_descriptors}/{game.descriptor_count}` valid.",
                f"- Fixup contexts: `{dict(sorted(contexts.items()))}`.",
                f"- Runtime stub selector base: `{hx(game.stub_selector_base)}` (score `{game.stub_selector_score}`, runner-up `{game.stub_selector_runner_up_score}`).",
                f"- LCALL routes: `{game.lcall_route_counts}`; owned stub targets in descriptor code: `{game.owned_stub_targets_in_code}`.",
                f"- Public-stub layouts located: `{game.located_stub_layouts}/{game.descriptor_count}` "
                f"(`{game.resolved_overlapping_stub_layouts}` overlapping starts resolved; "
                f"`{game.ambiguous_stub_layouts}` unresolved).",
                f"- Runtime stub records matched: `{game.runtime_stub_layouts}/{game.descriptor_count}`; packed/runtime procedure-word differences: `{game.packed_runtime_stub_differences}`.",
                f"- Loader preamble sizes: `{dict(sorted(preambles.items()))}`; bytes after stub array to next descriptor: `{dict(sorted(after_stub.items()))}`.",
                f"- Most-used LCALL segment words: {top}.",
                "",
            ]
        )
        differences = [
            f"descriptor {row.index} OVR {hx(row.ovr_file_offset)} stub {stub_index}: "
            f"packed {hx(packed)} -> load image {hx(runtime)}"
            for row in game.descriptors
            for stub_index, (packed, runtime) in enumerate(
                zip(row.packed_stub_proc_offsets, row.runtime_stub_proc_offsets)
            )
            if packed != runtime
        ]
        if differences:
            lines.append("- Packed/runtime procedure-word changes: " + "; ".join(differences) + ".")
            lines.append("")
    lines.extend(
        [
            "## Remaining Boundary",
            "",
            "The fixup record format and every relocatable far-call segment word are now statically located.",
            "The inferred selector base plus cumulative runtime stub geometry maps overlay calls to exact",
            "descriptor/public-entry records, direct overlay calls, and in-bounds OVR procedure offsets. Public",
            "records whose stored target lies outside one descriptor remain explicit exceptions. Segment words outside that",
            "stub geometry remain `unresolved_relocated_segment`; they are not static MZ addresses and require",
            "runtime relocation/`CS:IP` evidence. The remaining non-LCALL relocations are MOV segment immediates",
            "with no encoded target offset.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path)
    parser.add_argument("--json", dest="json_path", type=Path)
    parser.add_argument("--markdown", dest="markdown_path", type=Path)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(args.paths)
    payload = json.dumps(asdict(report), indent=2, sort_keys=True) + "\n"
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(payload, encoding="utf-8")
    if args.markdown_path:
        args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_path.write_text(markdown(report), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(payload, end="")
    else:
        print(
            f"vroomm layouts: {report.totals['verified_games']}/{report.totals['games']} verified, "
            f"{report.totals['fixup_entries']} fixups"
        )
    if args.strict and report.totals["verified_games"] != report.totals["games"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
