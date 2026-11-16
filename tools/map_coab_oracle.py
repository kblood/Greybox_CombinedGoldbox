#!/usr/bin/env python3
"""Map CoAB source-oracle overlay symbols back to CoAB retail GAME.OVR bytes."""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LAYOUTS = REPO_ROOT / "build" / "vroomm-layouts.json"
DEFAULT_PATTERNS = REPO_ROOT / "build" / "goldbox-patterns.json"
DEFAULT_CALLS = REPO_ROOT / "build" / "vroomm-call-correlations.json"
DEFAULT_LISTING = REPO_ROOT / "coab_extracted" / "coab_new.lst"


COMBAT_ANCHORS = {
    # The MANGLED KEY keeps its typo because that is the real symbol in the
    # binary. Only the friendly label is corrected (2026-09-07): the routine
    # resolves group MOVEMENT bounds, not initiative. The CoAB decompile renamed
    # it calc_group_movement and left "calc_group_inituative" as a trailing
    # comment -- and that stale comment is the origin of the misnomer here.
    "@calc_group_inituative$qm3Minm3Max": ("calc_group_movement", "combat group movement bounds"),
    "sub_32200": ("apply_and_describe_damage", "damage text and HP/status handoff"),
    "sub_378CD": ("setup_dungeon_floor", "dungeon combat floor"),
    "sub_37A00": ("setup_wilderness_floor_01", "wilderness combat floor pass 1"),
    "sub_37B0B": ("setup_wilderness_floor_02", "wilderness combat floor pass 2"),
    "sub_37E4A": ("setup_wilderness_floor_03", "wilderness combat floor pass 3"),
    "sub_37FC8": ("setup_wilderness_floor", "wilderness combat floor orchestration"),
    "sub_38030": ("setup_ground_tiles", "DUNGCOM/WILDCOM/RANDCOM bank and floor selection"),
    "battle_begins": ("battle_setup", "combat state/map/combatant setup"),
    "damage_player": ("damage_player", "HP status transition"),
    "Load24x24Set": ("load_24x24_set", "combat tile-bank loader"),
}


@dataclass
class ListingOverlay:
    unit: int
    listing_name: str
    listing_size: int


@dataclass
class ListingFunction:
    unit: int
    unit_offset: int
    symbol: str
    proc_kind: str


@dataclass
class OverlayMapping:
    unit: int
    listing_name: str
    listing_size: int
    descriptor_index: int
    retail_file_offset: int
    retail_code_size: int
    size_matches: bool


@dataclass
class OracleFunction:
    unit: int
    unit_offset: int
    symbol: str
    proc_kind: str
    retail_file_offset: int
    retail_prefix_hex: str
    borland_prologue: bool
    canonical_candidate: str | None
    role: str | None
    cluster_hash: str | None
    cluster_match_kind: str | None
    cluster_confidence: str | None
    cluster_source_count: int | None
    exact_lcall_target_count: int
    evidence_status: str


SEGMENT_START_RE = re.compile(r"^ovr(\d{3}):0000\s+ovr\d{3}\s+segment\s+byte\s+public\s+'OVERLAY'", re.MULTILINE)
SEGMENT_END_RE = re.compile(r"^ovr(\d{3}):([0-9A-Fa-f]+)\s+ovr\d{3}\s+ends", re.MULTILINE)
FUNCTION_RE = re.compile(
    r"^ovr(\d{3}):([0-9A-Fa-f]+)\s+([^\s;]+)\s+proc\s+(far|near)\b",
    re.MULTILINE,
)


def parse_listing(text: str) -> tuple[list[ListingOverlay], list[ListingFunction]]:
    starts = [int(match.group(1)) for match in SEGMENT_START_RE.finditer(text)]
    ends = {int(match.group(1)): int(match.group(2), 16) for match in SEGMENT_END_RE.finditer(text)}
    overlays = [
        ListingOverlay(unit=unit, listing_name=f"ovr{unit:03d}", listing_size=ends[unit] + 1)
        for unit in starts
        if unit in ends
    ]
    functions = [
        ListingFunction(
            unit=int(match.group(1)),
            unit_offset=int(match.group(2), 16),
            symbol=match.group(3),
            proc_kind=match.group(4),
        )
        for match in FUNCTION_RE.finditer(text)
    ]
    return overlays, functions


def find_coab_layout(layouts: dict[str, object]) -> dict[str, object]:
    games = [game for game in layouts.get("games", []) if game.get("profile_id") == "curse-of-the-azure-bonds"]
    if len(games) != 1:
        raise ValueError(f"expected one CoAB retail layout, found {len(games)}")
    return games[0]


def map_overlays(overlays: list[ListingOverlay], game: dict[str, object]) -> list[OverlayMapping]:
    descriptors = game.get("descriptors", [])
    if len(overlays) != len(descriptors):
        raise ValueError(f"listing has {len(overlays)} overlays, retail map has {len(descriptors)} descriptors")
    return [
        OverlayMapping(
            unit=overlay.unit,
            listing_name=overlay.listing_name,
            listing_size=overlay.listing_size,
            descriptor_index=int(descriptor["index"]),
            retail_file_offset=int(descriptor["ovr_file_offset"]),
            retail_code_size=int(descriptor["code_size"]),
            size_matches=overlay.listing_size == int(descriptor["code_size"]),
        )
        for overlay, descriptor in zip(overlays, descriptors, strict=True)
    ]


def best_cluster_index(patterns: dict[str, object], source: str) -> dict[int, dict[str, object]]:
    rows: dict[int, dict[str, object]] = {}
    rank = {"exact": 0, "relocation-normalized": 1, "control-flow-shape": 2}
    for candidate in patterns.get("function_cluster_index", []):
        if str(candidate["source"]) != source:
            continue
        offset = int(candidate["offset"])
        current = rows.get(offset)
        if current is None or rank.get(str(candidate["match_kind"]), 9) < rank.get(str(current["match_kind"]), 9):
            rows[offset] = candidate
    return rows


def call_target_counts(calls: dict[str, object], source: str) -> dict[int, int]:
    return {
        int(row["target_offset"]): int(row["call_count"])
        for row in calls.get("correlations", [])
        if str(row["target_source"]) == source
    }


def map_functions(
    functions: list[ListingFunction],
    mappings: list[OverlayMapping],
    game: dict[str, object],
    patterns: dict[str, object],
    calls: dict[str, object],
) -> list[OracleFunction]:
    by_unit = {mapping.unit: mapping for mapping in mappings}
    source = str(game["overlay_path"])
    retail = Path(source).read_bytes()
    clusters = best_cluster_index(patterns, source)
    target_counts = call_target_counts(calls, source)
    rows: list[OracleFunction] = []
    for function in functions:
        mapping = by_unit.get(function.unit)
        if mapping is None or function.unit_offset >= mapping.retail_code_size:
            continue
        retail_offset = mapping.retail_file_offset + function.unit_offset
        prefix = retail[retail_offset : retail_offset + 8]
        cluster = clusters.get(retail_offset)
        canonical, role = COMBAT_ANCHORS.get(function.symbol, (None, None))
        rows.append(
            OracleFunction(
                unit=function.unit,
                unit_offset=function.unit_offset,
                symbol=function.symbol,
                proc_kind=function.proc_kind,
                retail_file_offset=retail_offset,
                retail_prefix_hex=prefix.hex(),
                borland_prologue=prefix[:3] in (b"\x55\x89\xe5", b"\x55\x8b\xec"),
                canonical_candidate=canonical,
                role=role,
                cluster_hash=str(cluster["normalized_sha256"]) if cluster else None,
                cluster_match_kind=str(cluster["match_kind"]) if cluster else None,
                cluster_confidence=str(cluster["confidence"]) if cluster else None,
                cluster_source_count=int(cluster["source_count"]) if cluster else None,
                exact_lcall_target_count=target_counts.get(retail_offset, 0),
                evidence_status=(
                    "same_game_oracle_retail_cluster_and_call_target"
                    if cluster and retail_offset in target_counts
                    else "same_game_oracle_retail_cluster"
                    if cluster
                    else "same_game_oracle_retail_offset"
                ),
            )
        )
    return rows


def build_report(
    layouts: dict[str, object],
    patterns: dict[str, object],
    calls: dict[str, object],
    listing_text: str,
) -> dict[str, object]:
    overlays, listing_functions = parse_listing(listing_text)
    game = find_coab_layout(layouts)
    mappings = map_overlays(overlays, game)
    functions = map_functions(listing_functions, mappings, game, patterns, calls)
    combat = [row for row in functions if row.canonical_candidate is not None]
    return {
        "format_version": 1,
        "profile_id": game["profile_id"],
        "retail_overlay": game["overlay_path"],
        "listing_overlay_count": len(overlays),
        "retail_descriptor_count": len(mappings),
        "size_match_count": sum(row.size_matches for row in mappings),
        "listing_function_count": len(listing_functions),
        "mapped_function_count": len(functions),
        "borland_prologue_count": sum(row.borland_prologue for row in functions),
        "clustered_function_count": sum(row.cluster_hash is not None for row in functions),
        "combat_anchor_count": len(combat),
        "combat_cluster_count": sum(row.cluster_hash is not None for row in combat),
        "overlay_mappings": [asdict(row) for row in mappings],
        "combat_anchors": [asdict(row) for row in combat],
        "functions": [asdict(row) for row in functions],
        "rules": [
            "overlay units map only when all listing and retail code sizes agree in link order",
            "oracle symbols name CoAB retail offsets only; sibling titles receive no semantic name",
            "cluster matches remain candidates until retail behavior or a title-specific trace confirms semantics",
        ],
    }


def hx(value: int) -> str:
    return f"0x{value:x}"


def markdown(report: dict[str, object]) -> str:
    lines = [
        "# CoAB Oracle-to-Retail Overlay Map",
        "",
        "> Generated by `python tools/map_coab_oracle.py`. The decompiled listing is a same-game",
        "> naming oracle. Retail offsets and bytes come from the installed CoAB `GAME.OVR`.",
        "",
        "## Mapping Gate",
        "",
        f"- Listing overlays / retail descriptors: `{report['listing_overlay_count']}` / `{report['retail_descriptor_count']}`.",
        f"- Exact code-size matches in link order: `{report['size_match_count']}/{report['retail_descriptor_count']}`.",
        f"- Listing functions mapped in bounds: `{report['mapped_function_count']}/{report['listing_function_count']}`.",
        f"- Mapped Borland prologues: `{report['borland_prologue_count']}`; cross-source clustered starts: `{report['clustered_function_count']}`.",
        "",
        "## Overlay Units",
        "",
        "| Oracle unit | Descriptor | Listing size | Retail base | Retail size | Match |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for row in report["overlay_mappings"]:
        lines.append(
            f"| `{row['listing_name']}` | {row['descriptor_index']} | {hx(int(row['listing_size']))} | "
            f"{hx(int(row['retail_file_offset']))} | {hx(int(row['retail_code_size']))} | {row['size_matches']} |"
        )
    lines.extend(
        [
            "",
            "## Combat Anchors",
            "",
            "| Candidate | Oracle symbol | Oracle offset | CoAB retail offset | Prefix | Cluster | Calls | Evidence |",
            "| --- | --- | --- | ---: | --- | --- | ---: | --- |",
        ]
    )
    for row in report["combat_anchors"]:
        cluster = "" if row["cluster_hash"] is None else f"{row['cluster_match_kind']} `{str(row['cluster_hash'])[:16]}`"
        lines.append(
            f"| `{row['canonical_candidate']}` | `{row['symbol']}` | `ovr{int(row['unit']):03d}:{int(row['unit_offset']):04x}` | "
            f"{hx(int(row['retail_file_offset']))} | `{row['retail_prefix_hex']}` | {cluster} | "
            f"{row['exact_lcall_target_count']} | {row['evidence_status']} |"
        )
    lines.extend(
        [
            "",
            "These candidates are valid CoAB retail naming anchors. A cluster may nominate sibling-game",
            "offsets for investigation, but it does not transfer the CoAB semantic name without sibling",
            "retail behavior or a title-specific runtime trace.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layouts", type=Path, default=DEFAULT_LAYOUTS)
    parser.add_argument("--patterns", type=Path, default=DEFAULT_PATTERNS)
    parser.add_argument("--calls", type=Path, default=DEFAULT_CALLS)
    parser.add_argument("--listing", type=Path, default=DEFAULT_LISTING)
    parser.add_argument("--json", dest="json_path", type=Path)
    parser.add_argument("--markdown", dest="markdown_path", type=Path)
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(
        json.loads(args.layouts.read_text(encoding="utf-8")),
        json.loads(args.patterns.read_text(encoding="utf-8")),
        json.loads(args.calls.read_text(encoding="utf-8")),
        args.listing.read_text(encoding="latin1"),
    )
    payload = json.dumps(report, indent=2, sort_keys=True) + "\n"
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
            f"coab oracle map: {report['size_match_count']}/{report['retail_descriptor_count']} overlays, "
            f"{report['mapped_function_count']} functions, {report['combat_anchor_count']} combat anchors"
        )
    if args.strict and (
        report["size_match_count"] != report["retail_descriptor_count"]
        or report["mapped_function_count"] != report["listing_function_count"]
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
