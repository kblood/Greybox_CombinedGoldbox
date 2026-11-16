#!/usr/bin/env python3
"""Build one deterministic evidence corpus across all local Gold Box families.

This is the P1 aggregator from docs/engine/LONG-TERM-GOALS.md. It composes the existing binary
inventory and Gen1 overlay mapper, then adds archive, browser-manifest, and declared route-byte
verification. It does not replace the deeper reports; it gives later tools and the support matrix a
single per-game capability record.

Default usage writes both canonical outputs:

  python tools/goldbox_corpus.py

Explicit outputs and strict verification:

  python tools/goldbox_corpus.py --json build/goldbox-corpus.json \
    --markdown docs/engine/research/goldbox-corpus.md --strict
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from dataclasses import asdict
from functools import lru_cache
from pathlib import Path
from typing import Any

import dax_decode
import dqk_ecl_combat_scan
import format_manifest
import gen1_map
import inventory_goldbox_binaries as binary_inventory
import rtlink_map


REPO_ROOT = Path(__file__).resolve().parents[1]
GOG_ROOT = Path("C:/Program Files (x86)/GOG Galaxy/Games")
NWN_ROOT = Path("D:/Games/Neverwinter Nights DOS")
# Buck Rogers has no GOG release. Countdown to Doomsday is a loose DOS install here; Matrix Cubed
# is still inside `buckrogers2_dos_win.7z` and stays undetected until it is extracted.
BUCK_ROOT = Path("D:/Games/Emulator/DOS/Goldbox")
ROUTES_PATH = Path(__file__).with_name("goldbox_corpus_routes.json")
CAMPAIGN_MATRIX_PATH = Path(__file__).with_name("goldbox_campaign_matrix.json")
CAPABILITIES_PATH = Path(__file__).with_name("goldbox_capabilities.json")
DEFAULT_JSON = REPO_ROOT / "build/goldbox-corpus.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs/engine/research/goldbox-corpus.md"
DEFAULT_SUPPORT_JSON = REPO_ROOT / "apps/web/src/generated/support-evidence.json"
SUPPORT_CLAIMS_PATH = REPO_ROOT / "apps/web/src/ui/supportClaims.json"


PROFILES: list[dict[str, Any]] = [
    {"id": "pool-of-radiance", "title": "Pool of Radiance", "family": "gen1-fbov", "manifest": "pool-of-radiance"},
    {"id": "curse-of-the-azure-bonds", "title": "Curse of the Azure Bonds", "family": "gen1-fbov", "manifest": "curse-of-the-azure-bonds"},
    {"id": "secret-of-the-silver-blades", "title": "Secret of the Silver Blades", "family": "gen1-tpov", "manifest": "secret-of-the-silver-blades"},
    {"id": "champions-of-krynn", "title": "Champions of Krynn", "family": "gen1-fbov", "manifest": "champions-dos"},
    {"id": "death-knights-of-krynn", "title": "Death Knights of Krynn", "family": "gen1-fbov", "manifest": "death-knights-dos"},
    {"id": "gateway-to-the-savage-frontier", "title": "Gateway to the Savage Frontier", "family": "gen1-fbov-vga", "manifest": "gateway-to-the-savage-frontier"},
    {"id": "treasures-of-the-savage-frontier", "title": "Treasures of the Savage Frontier", "family": "gen1-fbov-vga", "manifest": "treasures-of-the-savage-frontier"},
    {"id": "pools-of-darkness", "title": "Pools of Darkness", "family": "gen1-fbov", "manifest": "pools-of-darkness"},
    {"id": "neverwinter-nights-dos", "title": "Neverwinter Nights (DOS/AOL)", "family": "gen1-fbov-online", "manifest": "neverwinter-nights-dos"},
    {"id": "dark-queen-of-krynn", "title": "The Dark Queen of Krynn", "family": "gen2-rtlink", "manifest": "dark-queen-dos"},
    {"id": "forgotten-realms-unlimited-adventures", "title": "Forgotten Realms Unlimited Adventures", "family": "gen2-rtlink", "manifest": "forgotten-realms-unlimited-adventures"},
    {"id": "buck-rogers-countdown-to-doomsday", "title": "Buck Rogers: Countdown to Doomsday", "family": "gen1-buck", "manifest": "buck-rogers-countdown-to-doomsday"},
    {"id": "buck-rogers-matrix-cubed", "title": "Buck Rogers: Matrix Cubed", "family": "gen1-buck", "manifest": "buck-rogers-matrix-cubed"},
]


def slash(path: Path | str) -> str:
    return str(path).replace("\\", "/")


def load_routes(path: Path = ROUTES_PATH) -> dict[str, dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise ValueError(f"unsupported route schema in {path}")
    return {route["profile_id"]: route for route in payload.get("routes", [])}


def load_capabilities(path: Path = CAPABILITIES_PATH) -> dict[str, dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise ValueError(f"unsupported capability schema in {path}")
    return {entry["profile_id"]: entry for entry in payload.get("profiles", [])}


@lru_cache(maxsize=1)
def _capabilities_by_profile() -> dict[str, dict[str, Any]]:
    """Capability ledger keyed by profile id, for verify_release_contract's proven-negative form."""
    try:
        return load_capabilities()
    except (OSError, ValueError, KeyError):
        return {}


VERIFIED_CHECKPOINTS = {
    "detection",
    "opening_dialogue",
    "town_service",
    "wilderness_travel",
    "quest",
    "exploration",
    "natural_combat",
    "outcome_resume",
    "save_reload",
    "graphics_switch",
    "companion",
    "browser",
    "electron",
}


# Checkpoints a game may declare `structurally-absent` instead of evidencing positively, and the
# capability-ledger area each one must be backed by. See ADR-0010.
#
# The list is deliberately short and content-derived. A checkpoint qualifies only when the GAME can
# genuinely lack the feature -- NWN-DOS ships no continuous overland layer, so `wilderness_travel`
# demands evidence for something that does not exist. Engine-side checkpoints (`detection`,
# `browser`, `electron`, `exploration`, `natural_combat`, `outcome_resume`, `save_reload`) are
# properties of OUR port, never structurally absent from the game, so they are not waivable.
#
# `graphics_switch` is deliberately excluded even though NWN cannot satisfy it either: NWN's blocker
# is that no Amiga release exists to source a second art set from, which is a limitation of the
# PROJECT's asset sources, not a feature the game structurally lacks. Waiving it here would let a
# sourcing gap masquerade as a proven negative -- exactly the confusion this mechanism must not
# introduce.
STRUCTURALLY_ABSENT_CHECKPOINTS = {
    "wilderness_travel": "wilderness",
    "town_service": "towns",
    "quest": "quests",
    "companion": "companion",
}


# The two e2e harnesses whose evidence markers must sit in code the harness actually runs.
#
# Added 2026-08-17. A plain substring test accepted a marker anywhere in a named file, including
# inside a case function that was defined, registered in the GB_E2E_ONLY dispatch map, and never
# awaited by main() -- so it executed only when a human named it explicitly. `runDokCampaignOpening`
# was exactly that: its route PASSES when run standalone, so the claim it backs was not false, but
# it had no standing execution and this checker could not tell a live marker from one in dead code.
E2E_REACHABILITY_REFS = frozenset({"apps/web/test/e2e.mjs", "apps/electron/test/e2e.mjs"})

# Top-level `function f(` / `async function f(` only -- every case and helper in both harnesses is
# declared that way at column 0, so nested declarations stay attributed to their enclosing case.
_JS_TOP_LEVEL_DEF = re.compile(r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")
# Call sites, over-approximated: `foo(` anywhere, including inside nested callbacks. Over-approxima-
# tion is the safe direction here (it can only make the reachable set larger, never hide dead code),
# but a declaration is not a call, hence the lookbehind.
_JS_CALL = re.compile(r"(?<!function )\b([A-Za-z_$][\w$]*)\s*\(")
_JS_ONLY_BLOCK_START = "if (ONLY.size > 0)"
_JS_ONLY_BLOCK_END = "return printResults(focused)"
#: The runner registry the GB_E2E_ONLY block dispatches through. It used to be declared INSIDE
#: that block, so the start marker above covered it. On 2026-08-22 it was hoisted out so the full
#: pass could check itself against it, and the registration lines stopped being excluded -- a case
#: registered but never awaited started reading as live code again, which is the exact hole this
#: predicate exists to close. The map is still only CONSUMED inside the block, so exclusion has to
#: follow the declaration rather than its position.
_JS_RUNNER_MAP_START = "const runners = new Map(["


def _js_focused_block_lines(lines: list[str]) -> set[int]:
    """Line indices of the GB_E2E_ONLY dispatch block, which runs INSTEAD of the full suite.

    Registration there makes a case selectable by hand; it does not make it run. Calls inside this
    block therefore do not seed reachability, and a marker inside it is not live-code evidence.
    """
    start = next((i for i, line in enumerate(lines) if _JS_RUNNER_MAP_START in line), None)
    if start is None:
        start = next((i for i, line in enumerate(lines) if _JS_ONLY_BLOCK_START in line), None)
    elif not any(_JS_ONLY_BLOCK_START in line for line in lines):
        # A registry with no dispatch block is not the shape this predicate understands; refuse
        # rather than silently excluding the registry and nothing else.
        return set()
    if start is None:
        return set()
    for end in range(start, len(lines)):
        if _JS_ONLY_BLOCK_END in lines[end]:
            return set(range(start, end + 1))
    return set()


def _js_top_level_functions(lines: list[str]) -> list[list[Any]]:
    """[name, first_line, last_line] for each top-level function declaration, in file order."""
    spans: list[list[Any]] = []
    for index, line in enumerate(lines):
        match = _JS_TOP_LEVEL_DEF.match(line)
        if match:
            spans.append([match.group(1), index, len(lines) - 1])
    for position in range(len(spans) - 1):
        spans[position][2] = spans[position + 1][1] - 1
    return spans


def marker_reaches_live_code(text: str, marker: str) -> bool:
    """True when `marker` occurs in code TRANSITIVELY reachable from the harness's `main()`.

    Transitive, not direct-call: CoK's opening/quest/town markers live in the shared helper
    `driveCokOpeningToTravel`, which `main()` never calls itself -- it is reached through
    `runCokRetailTravel` / `runCokCampaignContinuity` / `runPlay`. A direct-call predicate would
    reject a legitimately verified title, so the reachable set is closed to a fixpoint.
    """
    lines = text.splitlines()
    skip = _js_focused_block_lines(lines)
    spans = _js_top_level_functions(lines)
    names = {str(span[0]) for span in spans}
    calls: dict[str, set[str]] = {}
    for name, start, end in spans:
        called: set[str] = set()
        for index in range(int(start), int(end) + 1):
            if index in skip:
                continue
            called.update(_JS_CALL.findall(lines[index]))
        calls[str(name)] = called & names
    reachable = {"main"}
    pending = list(calls.get("main", ()))
    while pending:
        name = pending.pop()
        if name in reachable:
            continue
        reachable.add(name)
        pending.extend(calls.get(name, ()))
    for index, line in enumerate(lines):
        if marker not in line or index in skip:
            continue
        owner = next((str(name) for name, start, end in spans if start <= index <= end), None)
        # `owner is None` means module top level, which executes on import.
        if owner is None or owner in reachable:
            return True
    return False


def _evidence_refs_resolve(evidence: Any, repo_root: Path | None = None) -> bool:
    """A non-empty list of {file, marker} refs, each naming a real file that contains the marker.

    For the e2e harnesses in E2E_REACHABILITY_REFS the marker must additionally sit in a function
    the harness's own `main()` reaches, so a case that is registered but never awaited cannot back
    a Verified checkpoint. `repo_root` is a seam for tests; production always resolves in-repo.
    """
    root = REPO_ROOT if repo_root is None else repo_root
    if not isinstance(evidence, list) or not evidence:
        return False
    for reference in evidence:
        if not isinstance(reference, dict):
            return False
        rel = reference.get("file")
        marker = reference.get("marker")
        path = root / str(rel or "")
        if not rel or not isinstance(marker, str) or not marker or not path.is_file():
            return False
        text = path.read_text(encoding="utf-8")
        if marker not in text:
            return False
        if slash(rel) in E2E_REACHABILITY_REFS and not marker_reaches_live_code(text, marker):
            return False
    return True


def _capability_evidence_paths_resolve(evidence: Any, repo_root: Path | None = None) -> bool:
    """A non-empty list of repo-relative path strings, each naming a file that actually exists.

    The capability ledger's evidence entries are bare paths, not the {file, marker} refs the release
    contract uses, so they get their own predicate. Added 2026-08-17: `validate_capability_contract`
    previously asked only `isinstance(list) and bool(list)`, which a list of one empty string, one
    renamed source file, or one hopeful path satisfies just as well as real evidence. `repo_root` is
    a seam for tests; production always resolves in-repo.
    """
    root = REPO_ROOT if repo_root is None else repo_root
    if not isinstance(evidence, list) or not evidence:
        return False
    for reference in evidence:
        if not isinstance(reference, str) or not reference.strip():
            return False
        if not (root / reference).is_file():
            return False
    return True


def verify_release_contract(
    route: dict[str, Any], capability_entry: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Validate the source-backed browser/Electron checkpoint ledger for Verified promotion.

    A checkpoint is satisfied either by positive evidence -- a non-empty list of {file, marker}
    references that resolve -- or, for the few checkpoints in STRUCTURALLY_ABSENT_CHECKPOINTS, by a
    declared proven negative. `capability_entry` is that title's capability ledger; when omitted it
    is looked up from CAPABILITIES_PATH by the route's profile id.
    """
    declaration = route.get("verification")
    if not isinstance(declaration, dict):
        return {"declared": False, "status": "missing", "checks": {}, "failed_checks": ["declaration"]}
    if capability_entry is None:
        capability_entry = _capabilities_by_profile().get(str(route.get("id") or ""))
    ledger_areas = capability_entry.get("capabilities", {}) if isinstance(capability_entry, dict) else {}
    checkpoints = declaration.get("checkpoints", {})
    checks: dict[str, bool] = {
        "clean_user_selected_input": declaration.get("input") == "user-selected-retail-folder",
        "all_checkpoints_declared": isinstance(checkpoints, dict) and VERIFIED_CHECKPOINTS.issubset(checkpoints),
    }
    absent: list[str] = []
    if isinstance(checkpoints, dict):
        for checkpoint in sorted(VERIFIED_CHECKPOINTS):
            evidence = checkpoints.get(checkpoint)
            if isinstance(evidence, dict):
                # The proven-negative form. Every clause below is load-bearing: this must be harder
                # to satisfy than citing a marker, not an easier way out of one.
                area = STRUCTURALLY_ABSENT_CHECKPOINTS.get(checkpoint)
                declared = ledger_areas.get(area) if isinstance(ledger_areas, dict) else None
                ok = (
                    evidence.get("status") == "structurally-absent"
                    # The checkpoint must be one of the few that a game can genuinely lack, and the
                    # declaration must name the SAME capability area this table sanctions -- so a
                    # title cannot wave `quest` through by pointing at its wilderness verdict.
                    and area is not None
                    and evidence.get("capability") == area
                    # The proven negative has to already be established in the capability ledger,
                    # which imposes its own detail+gaps burden. This is the tie that keeps the two
                    # contracts from disagreeing about the same fact.
                    and isinstance(declared, dict)
                    and declared.get("status") == "structurally-absent"
                    # A proven negative still points at something real. Absence of evidence is not
                    # what is being accepted here; evidence of absence is.
                    and _evidence_refs_resolve(evidence.get("evidence"))
                )
                checks[f"checkpoint_{checkpoint}"] = ok
                if ok:
                    absent.append(checkpoint)
                continue
            checks[f"checkpoint_{checkpoint}"] = _evidence_refs_resolve(evidence)
    failed = sorted(name for name, ok in checks.items() if not ok)
    return {
        "declared": True,
        "status": "verified-contract" if not failed else "failed-checks",
        "input": declaration.get("input"),
        "checks": checks,
        # Surfaced rather than folded silently into a pass, so a reader of the corpus report can see
        # which checkpoints were satisfied by a proven negative instead of by a live acceptance.
        "structurally_absent": sorted(absent),
        "failed_checks": failed,
    }


CAPABILITY_AREAS = {
    "ruleset", "ecl", "map_container", "graphics", "audio", "retail_save",
    "towns", "wilderness", "quests", "companion",
}
CAPABILITY_STATUSES = {"proven", "partial", "unsupported", "structurally-absent"}


def validate_capability_contract(entry: dict[str, Any] | None) -> dict[str, Any]:
    """Require a complete, candid capability ledger; partial features are valid only with gaps."""
    if not isinstance(entry, dict):
        return {"declared": False, "status": "missing", "checks": {}, "failed_checks": ["declaration"]}
    areas = entry.get("capabilities", {})
    checks: dict[str, bool] = {
        "all_areas_declared": isinstance(areas, dict) and CAPABILITY_AREAS.issubset(areas),
    }
    if isinstance(areas, dict):
        for area in sorted(CAPABILITY_AREAS):
            value = areas.get(area)
            status = value.get("status") if isinstance(value, dict) else None
            detail = value.get("detail") if isinstance(value, dict) else None
            gaps = value.get("gaps") if isinstance(value, dict) else None
            checks[f"area_{area}"] = (
                status in CAPABILITY_STATUSES
                and isinstance(detail, str) and bool(detail.strip())
                and (status == "proven" or isinstance(gaps, list) and bool(gaps))
            )
            # Areas are not required to cite evidence, but an area that DOES cite it was until now
            # inspected by nothing at all -- the loop above reads only status/detail/gaps. Any area
            # carrying an `evidence` key therefore has to have it resolve.
            if isinstance(value, dict) and "evidence" in value:
                checks[f"area_{area}_evidence"] = _capability_evidence_paths_resolve(value["evidence"])
        saves = areas.get("retail_save", {})
        for direction in ("import", "export"):
            value = saves.get(direction) if isinstance(saves, dict) else None
            checks[f"retail_save_{direction}"] = (
                isinstance(value, dict)
                and value.get("status") in CAPABILITY_STATUSES
                and isinstance(value.get("scope"), str) and bool(value["scope"].strip())
                and isinstance(value.get("gaps"), list) and bool(value["gaps"])
                and _capability_evidence_paths_resolve(value.get("evidence"))
            )
    failed = sorted(name for name, ok in checks.items() if not ok)
    return {
        **entry,
        "declared": True,
        "status": "verified-contract" if not failed else "failed-checks",
        "checks": checks,
        "failed_checks": failed,
    }


# BUILD-QUEUE.md's "awards Campaign" gate: a leg counts as PASSING only when it is `proven`
# (engine-level byte-grounded proof, live browser wiring not required -- see
# tools/goldbox_campaign_matrix.json's own `statuses.proven` doc string for the precedent) or
# `structurally-absent` (investigated and found to genuinely not exist in the game's own retail
# content -- a proven negative). `blocked` (investigated, genuinely unresolved) and
# `not-applicable`/`not-tracked` (never part of that game's own matrix scope) do NOT count as
# passing -- both represent a real, undischarged gap rather than proven coverage, even though only
# `blocked` is a "we looked and it's stuck" gap and the other is "this was never in scope."
CAMPAIGN_PASSING_LEG_STATUSES = {"proven", "structurally-absent"}


def load_campaign_matrix(path: Path = CAMPAIGN_MATRIX_PATH) -> dict[str, dict[str, Any]]:
    """Load the per-game six-leg natural-route matrix and compute pass/fail per profile.

    Returns a dict keyed by profile_id. Each value carries the raw `legs` record plus a computed
    `satisfied` bool (True only when every one of the schema's declared legs is present and its
    status is in CAMPAIGN_PASSING_LEG_STATUSES) and `failing_legs` (leg names that keep the game
    from the campaign gate, for gap reporting).
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise ValueError(f"unsupported campaign matrix schema in {path}")
    expected_legs: list[str] = payload.get("legs", [])
    result: dict[str, dict[str, Any]] = {}
    for entry in payload.get("games", []):
        legs = entry.get("legs", {})
        failing = [
            leg
            for leg in expected_legs
            if legs.get(leg, {}).get("status") not in CAMPAIGN_PASSING_LEG_STATUSES
        ]
        result[entry["profile_id"]] = {
            "legs": legs,
            "satisfied": bool(expected_legs) and not failing,
            "failing_legs": failing,
        }
    return result


def inventory_roots(extra: list[Path]) -> list[Path]:
    roots = [REPO_ROOT]
    for path in [GOG_ROOT, NWN_ROOT, BUCK_ROOT, *extra]:
        if path.exists() and path not in roots:
            roots.append(path)
    return roots


def normalize_profile_id(profile_id: str | None) -> str | None:
    aliases = {
        "buck-rogers-countdown": "buck-rogers-countdown-to-doomsday",
    }
    return aliases.get(profile_id or "", profile_id)


def choose_install(items: list[binary_inventory.FolderInventory], profile_id: str, route: dict[str, Any] | None) -> binary_inventory.FolderInventory | None:
    candidates = [item for item in items if normalize_profile_id(item.profile_id) == profile_id]
    if not candidates:
        return None
    route_names = {
        str(route[key]).upper()
        for key in ("ecl_file", "geo_file", "walldef_file", "tiles_file", "monster_file")
        if route and route.get(key)
    }

    def score(item: binary_inventory.FolderInventory) -> tuple[int, int]:
        names = {f.name.upper() for f in item.files}
        value = 100 if "GAME.OVR" in names else 0
        value += 20 if any(name.endswith(".CFG") for name in names) else 0
        value += len(route_names & names) * 10
        value -= 200 if "coab_extracted" in item.path.lower() else 0
        return value, -len(Path(item.path).parts)

    return max(candidates, key=score)


def file_index(item: binary_inventory.FolderInventory | None) -> dict[str, Path]:
    if item is None:
        return {}
    root = Path(item.path)
    out: dict[str, Path] = {}
    for evidence in item.files:
        path = root / Path(evidence.rel_path)
        out.setdefault(evidence.name.upper(), path)
    return out


def read_dax_blocks(path: Path) -> list[dict[str, Any]]:
    data = path.read_bytes()
    base, entries = dax_decode.parse_container(data)
    blocks: list[dict[str, Any]] = []
    for entry in entries:
        raw = dax_decode.decompress_block(data, base, entry)
        blocks.append({"block_id": entry.block_id, "raw_size": len(raw), "raw": raw})
    return blocks


def immediate_instruction(opcode: int, operands: list[int]) -> bytes:
    encoded = bytearray([opcode])
    for value in operands:
        if not 0 <= value <= 0xFF:
            raise ValueError(f"route operand {value} is not an immediate byte")
        encoded.extend((0, value))
    return bytes(encoded)


def save_instruction(value: int, address: int) -> bytes:
    """Encode Gen1 SAVE with an immediate byte source and 16-bit memory destination."""
    if not 0 <= value <= 0xFF:
        raise ValueError(f"SAVE value {value} is not an immediate byte")
    if not 0 <= address <= 0xFFFF:
        raise ValueError(f"SAVE address {address} is not a 16-bit address")
    return bytes((0x09, 0, value, 1, address & 0xFF, address >> 8))


def route_instruction_bytes(route: dict[str, Any], name: str, opcode: int) -> bytes:
    """Return a route-pinned instruction encoding.

    Most Gen1 contracts use the ordinary immediate-byte encoding.  A few late Gen1
    dialects encode a loader instruction differently, however.  Their route records
    pin the exact retail byte sequence rather than pretending that the earlier
    three-operand spelling applies.
    """
    explicit = route.get(f"{name}_bytes")
    if explicit is not None:
        if not isinstance(explicit, str):
            raise ValueError(f"{name}_bytes must be a hex string")
        return bytes.fromhex(explicit)
    operands = route.get(name)
    if not isinstance(operands, list):
        raise ValueError(f"route {name} must be a byte list or declare {name}_bytes")
    return immediate_instruction(opcode, operands)


def decode_record_name(raw: bytes) -> str:
    if not raw:
        return ""
    length = min(raw[0], 15, max(0, len(raw) - 1))
    return raw[1 : 1 + length].decode("ascii", errors="replace").rstrip("\0 ")


def sniff_gen2_geo(raw: bytes) -> bool:
    if len(raw) < 8:
        return False
    # raw[0] is HEIGHT and raw[1] is WIDTH, per GetFacingWallType at 2f0d:0628 in DQK.EXE and
    # `decodeGen2GeoBlock` in packages/engine/src/loaders/geo.ts. The names were transposed here
    # until round 29. The behaviour was never wrong -- the two are only ever multiplied, and
    # multiplication commutes -- but the misnaming is exactly the kind of thing a later reader
    # copies into a coordinate calculation, where it stops commuting. R4's audit found 21 stale
    # coordinate claims in the DQK research docs from that same transposition upstream.
    height, width = raw[0], raw[1]
    return width > 0 and height > 0 and len(raw) == 8 + 4 * width * height


def verify_hlib_gen2_route(route: dict[str, Any], files: dict[str, Path]) -> dict[str, Any]:
    required_keys = ["ecl_file", "geo_file"]
    required_paths = {key: files.get(str(route[key]).upper()) for key in required_keys}
    missing_files = [str(route[key]) for key, path in required_paths.items() if path is None or not path.exists()]
    result: dict[str, Any] = {
        "declared": True,
        "container_kind": "hlib-gen2",
        "status": "missing-files" if missing_files else "unverified",
        "surface": route.get("surface"),
        "ecl_file": route["ecl_file"],
        "ecl_area": route["ecl_area"],
        "geo_file": route["geo_file"],
        "geo_area": route["geo_area"],
        "load_files_geo": route.get("load_files_geo"),
        "engine_test": route.get("engine_test"),
        "missing_files": missing_files,
        "checks": {},
    }
    if missing_files:
        return result

    try:
        ecl_archive = dqk_ecl_combat_scan.read_hlib_data_archive(required_paths["ecl_file"])
        geo_archive = dqk_ecl_combat_scan.read_hlib_data_archive(required_paths["geo_file"])
        ecl_ids = dqk_ecl_combat_scan.parse_id_table(ecl_archive.members[0])
        geo_ids = dqk_ecl_combat_scan.parse_id_table(geo_archive.members[0])
        ecl_member = ecl_ids.get(route["ecl_area"])
        geo_member = geo_ids.get(route["geo_area"])
        ecl = ecl_archive.members[ecl_member] if ecl_member is not None and 0 < ecl_member < len(ecl_archive.members) else b""
        geo = geo_archive.members[geo_member] if geo_member is not None and 0 < geo_member < len(geo_archive.members) else b""
        instructions, _ = dqk_ecl_combat_scan.collect_boundaries(
            ecl,
            dqk_ecl_combat_scan.header_entries(ecl),
            route.get("max_decode_steps", 20000),
        ) if ecl else ({}, {})
    except Exception as exc:
        result["status"] = "archive-error"
        result["error"] = str(exc)
        return result

    load_files = [ins for ins in instructions.values() if ins.opcode == 0x21]
    expected_geo = route.get("load_files_geo")
    checks = {
        "ecl_member_count": len(ecl_archive.members) == route.get("expected_ecl_members", len(ecl_archive.members)),
        "ecl_area_count": len(ecl_ids) == route.get("expected_ecl_areas", len(ecl_ids)),
        "ecl_area_member_present": bool(ecl),
        "ecl_gen2_header": len(ecl) >= 20 and all(ecl[slot * 4 : slot * 4 + 2] == b"\x01\x01" for slot in range(5)),
        "ecl_entries_in_range": bool(ecl) and all(20 <= entry < len(ecl) for entry in dqk_ecl_combat_scan.header_entries(ecl)),
        "load_files_reachable": bool(load_files),
        "load_files_geo_matches": expected_geo is None or any(ins.args and ins.args[0] == expected_geo for ins in load_files),
        "geo_area_member_present": bool(geo),
        "geo_shape_valid": sniff_gen2_geo(geo),
        "engine_test_present": bool(route.get("engine_test")) and (REPO_ROOT / route["engine_test"]).exists(),
    }
    natural = route.get("natural_encounter")
    if route.get("surface") == "natural-combat":
        checks["natural_contract_present"] = isinstance(natural, dict)
        if isinstance(natural, dict) and ecl:
            table_vaddr = natural.get("terrain_table_vaddr")
            target = natural.get("target", {})
            x, y = target.get("x"), target.get("y")
            width = natural.get("terrain_width")
            selector = natural.get("terrain_selector")
            table_offset = table_vaddr - 0x8000 if isinstance(table_vaddr, int) else -1
            table_index = y * width + x if all(isinstance(v, int) for v in (x, y, width)) else -1
            checks["natural_terrain_selector"] = (
                table_offset >= 20 and table_index >= 0 and table_offset + table_index < len(ecl)
                and ecl[table_offset + table_index] == selector
            )
            parlay = natural.get("short_parlay_bytes")
            checks["natural_short_parlay"] = isinstance(parlay, str) and bytes.fromhex(parlay) in ecl
            monster_id = natural.get("monster_id")
            checks["natural_load_monster"] = any(
                ins.opcode == 0x0B and len(ins.args) >= 2 and ins.args[0] == monster_id
                for ins in instructions.values()
            )
            checks["natural_combat_opcode"] = any(ins.opcode == 0x24 for ins in instructions.values())
        checks["browser_test_present"] = bool(route.get("browser_test")) and (REPO_ROOT / route["browser_test"]).exists()

    persistence = route.get("persistence")
    if isinstance(persistence, dict):
        save_model = REPO_ROOT / "packages/engine/src/world/saveGame.ts"
        engine_test = REPO_ROOT / str(persistence.get("engine_test", ""))
        browser_test = REPO_ROOT / str(persistence.get("browser_test", ""))
        browser_host = REPO_ROOT / "apps/web/src/ui/dqkExplore.ts"
        engine_host = REPO_ROOT / "packages/engine/src/world/dqkArea5Overland.ts"
        save_text = save_model.read_text(encoding="utf-8") if save_model.exists() else ""
        engine_text = engine_test.read_text(encoding="utf-8") if engine_test.exists() else ""
        browser_text = browser_test.read_text(encoding="utf-8") if browser_test.exists() else ""
        host_text = browser_host.read_text(encoding="utf-8") if browser_host.exists() else ""
        engine_host_text = engine_host.read_text(encoding="utf-8") if engine_host.exists() else ""
        address = persistence.get("memory_address")
        consumed_value = persistence.get("consumed_value")
        expected_version = persistence.get("save_version")
        persistence_checks = {
            "persistence_save_schema": (
                isinstance(expected_version, int)
                and f"SAVE_VERSION = {expected_version}" in save_text
                and "areaMemory" in save_text
            ),
            "persistence_consumed_guard": (
                isinstance(address, int)
                and isinstance(consumed_value, int)
                and f"0x{address:04x}" in engine_text.lower()
                and f"0x{address:04x}" in engine_host_text.lower()
                and f"=== {consumed_value}" in engine_host_text
            ),
            "persistence_area5_host": (
                isinstance(persistence.get("area_memory_key"), str)
                and persistence["area_memory_key"] in host_text
                and "dqkQuickSave" in host_text
                and "dqkQuickLoad" in host_text
            ),
            "persistence_browser_test": (
                browser_test.exists()
                and isinstance(persistence.get("browser_marker"), str)
                and persistence["browser_marker"] in browser_text
                and "dqk-consumed-word" in browser_text
            ),
        }
        checks.update(persistence_checks)
        result["persistence"] = {
            "declared": True,
            "status": "verified-contract" if all(persistence_checks.values()) else "failed-checks",
            "checks": persistence_checks,
        }

    result["checks"] = checks
    result["evidence"] = {
        "ecl_members": len(ecl_archive.members),
        "ecl_areas": len(ecl_ids),
        "ecl_member": ecl_member,
        "reachable_instructions": len(instructions),
        "reachable_load_files": [ins.text for ins in load_files],
        "geo_members": len(geo_archive.members),
        "geo_areas": len(geo_ids),
        "geo_member": geo_member,
        "geo_dimensions": [geo[0], geo[1]] if sniff_gen2_geo(geo) else None,
    }
    result["status"] = "verified-byte-contract" if all(checks.values()) else "failed-checks"
    result["failed_checks"] = sorted(name for name, ok in checks.items() if not ok)
    # The Gen1 and FRUA verifiers both end with this line; this one did not. The omission was not
    # a design choice — game_gaps() and evidence_level() both read route["verification"]["status"],
    # so for the only hlib-gen2 title in the corpus that read always yielded None and a declared
    # release contract would have been silently ignored. DQK could never have reached Verified.
    result["verification"] = verify_release_contract(route)
    return result


def verify_dax_gen1_route(route: dict[str, Any], files: dict[str, Path]) -> dict[str, Any]:
    required_keys = ["ecl_file", "geo_file", "walldef_file", "tiles_file"]
    required_keys.extend(key for key in ("shared_walldef_file", "frame_file") if route.get(key))
    required_paths = {key: files.get(str(route[key]).upper()) for key in required_keys}
    missing_files = [str(route[key]) for key, path in required_paths.items() if path is None or not path.exists()]
    result: dict[str, Any] = {
        "declared": True,
        "container_kind": "dax-gen1",
        "status": "missing-files" if missing_files else "unverified",
        "surface": route.get("surface"),
        "ecl_file": route["ecl_file"],
        "ecl_block": route["ecl_block"],
        "entry_offset": route["entry_offset"],
        "geo_file": route["geo_file"],
        "geo_block": route["geo_block"],
        "load_files": route["load_files"],
        "load_pieces": route["load_pieces"],
        "engine_test": route.get("engine_test"),
        "missing_files": missing_files,
        "checks": {},
    }
    if missing_files:
        return result

    try:
        ecl_blocks = read_dax_blocks(required_paths["ecl_file"])
        ecl = next((b for b in ecl_blocks if b["block_id"] == route["ecl_block"]), None)
        geo_blocks = read_dax_blocks(required_paths["geo_file"])
        geo = next((b for b in geo_blocks if b["block_id"] == route["geo_block"]), None)
        walldef_ids = {b["block_id"] for b in read_dax_blocks(required_paths["walldef_file"])}
        if "shared_walldef_file" in required_paths:
            walldef_ids.update(b["block_id"] for b in read_dax_blocks(required_paths["shared_walldef_file"]))
        tile_ids = {b["block_id"] for b in read_dax_blocks(required_paths["tiles_file"])}
        frame_ids = (
            {b["block_id"] for b in read_dax_blocks(required_paths["frame_file"])}
            if "frame_file" in required_paths
            else set()
        )
    except Exception as exc:  # malformed local data should become evidence, not crash the full corpus
        result["status"] = "archive-error"
        result["error"] = str(exc)
        return result

    load_files_bytes = route_instruction_bytes(route, "load_files", 0x21)
    load_pieces_bytes = route_instruction_bytes(route, "load_pieces", 0x37)
    ecl_raw = ecl["raw"] if ecl else b""
    expected_wall_ids = {value for value in route.get("resolved_wall_blocks", route["load_pieces"]) if value not in (0x7F, 0xFF)}
    checks = {
        "ecl_block_present": ecl is not None,
        "entry_in_range": ecl is not None and route["entry_offset"] < ecl["raw_size"],
        "load_files_bytes_present": bool(load_files_bytes) and ecl_raw.find(load_files_bytes) >= 0,
        # Treasures/Pools deliberately use their byte-proven renderer fallback when a retail
        # ECL boot leg has no LOAD_PIECES instruction.  This is an explicit contract, never a
        # silent empty-byte match.
        "load_pieces_bytes_present": (
            bool(load_pieces_bytes) and ecl_raw.find(load_pieces_bytes) >= 0
        ) or (
            route.get("fallback_pieces") is True
            and isinstance(route.get("load_pieces"), list)
            and bool(route["load_pieces"])
        ),
        "geo_block_present": geo is not None,
        "geo_shape_16x16": geo is not None and geo["raw_size"] == 1026,
        "walldef_operands_present": expected_wall_ids.issubset(walldef_ids),
        "tile_archive_nonempty": bool(tile_ids),
        "frame_archive_ui_blocks": "frame_file" not in required_paths or {201, 202}.issubset(frame_ids),
        "engine_test_present": bool(route.get("engine_test")) and (REPO_ROOT / route["engine_test"]).exists(),
    }

    natural = route.get("natural_encounter")
    if route.get("surface") == "natural-combat":
        addend = route.get("ecl_address_addend")
        checks["natural_contract_present"] = isinstance(natural, dict) and isinstance(addend, int)
        if isinstance(natural, dict) and isinstance(addend, int) and geo is not None and ecl is not None:
            natural_block_id = natural.get("ecl_block", route["ecl_block"])
            natural_ecl = next((b for b in ecl_blocks if b["block_id"] == natural_block_id), None)
            natural_ecl_raw = natural_ecl["raw"] if natural_ecl else b""
            checks["natural_ecl_block_present"] = natural_ecl is not None
            cell = natural.get("cell", {})
            x, y = cell.get("x"), cell.get("y")
            cell_index = y * 16 + x if isinstance(x, int) and isinstance(y, int) else -1
            descriptor_offset = 514 + cell_index
            checks["natural_geo_cell_descriptor"] = (
                0 <= cell_index < 256
                and descriptor_offset < len(geo["raw"])
                and geo["raw"][descriptor_offset] == cell.get("descriptor")
            )

            def natural_offset(vaddr: Any) -> int:
                return ((vaddr + addend) & 0xFFFF) + 2 if isinstance(vaddr, int) else -1

            chain = natural.get("chain")
            if natural_block_id != route["ecl_block"]:
                checks["natural_chain_present"] = isinstance(chain, dict)
            if isinstance(chain, dict):
                source_block_id = chain.get("source_ecl_block", route["ecl_block"])
                chain_declared = all(
                    isinstance(chain.get(field), int)
                    for field in (
                        "selector_save_vaddr",
                        "selector_address",
                        "selector_value",
                        "new_ecl_vaddr",
                        "target_ecl_block",
                    )
                ) and isinstance(source_block_id, int)
                source_ecl = next((b for b in ecl_blocks if b["block_id"] == source_block_id), None)
                source_raw = source_ecl["raw"] if source_ecl else b""
                selector_offset = natural_offset(chain.get("selector_save_vaddr"))
                new_ecl_offset = natural_offset(chain.get("new_ecl_vaddr"))
                selector_bytes = (
                    save_instruction(chain["selector_value"], chain["selector_address"])
                    if chain_declared else b""
                )
                new_ecl_bytes = (
                    immediate_instruction(0x20, [chain["target_ecl_block"]])
                    if chain_declared else b""
                )
                checks["natural_chain_declared"] = chain_declared
                checks["natural_chain_source_block"] = source_ecl is not None
                checks["natural_chain_selector_save"] = (
                    bool(selector_bytes)
                    and source_raw[selector_offset:selector_offset + len(selector_bytes)] == selector_bytes
                )
                checks["natural_chain_new_ecl"] = (
                    chain.get("target_ecl_block") == natural_block_id
                    and bool(new_ecl_bytes)
                    and source_raw[new_ecl_offset:new_ecl_offset + len(new_ecl_bytes)] == new_ecl_bytes
                )

            waves = natural.get("waves")
            if isinstance(waves, list) and waves:
                for index, wave in enumerate(waves, start=1):
                    load_vaddrs = wave.get("load_monster_vaddrs", []) if isinstance(wave, dict) else []
                    groups = wave.get("monster_groups", []) if isinstance(wave, dict) else []
                    load_checks = []
                    for vaddr, group in zip(load_vaddrs, groups):
                        load_offset = natural_offset(vaddr)
                        load_bytes = immediate_instruction(0x0B, group) if isinstance(group, list) and len(group) == 3 else b""
                        load_checks.append(bool(load_bytes) and natural_ecl_raw[load_offset:load_offset + len(load_bytes)] == load_bytes)
                    combat_offset = natural_offset(wave.get("combat_vaddr") if isinstance(wave, dict) else None)
                    resume_offset = natural_offset(wave.get("resume_vaddr") if isinstance(wave, dict) else None)
                    resume_opcode = wave.get("resume_opcode", 0x09) if isinstance(wave, dict) else None
                    checks[f"natural_wave_{index}_load_monster"] = (
                        len(load_vaddrs) == len(groups) and bool(load_checks) and all(load_checks)
                    )
                    checks[f"natural_wave_{index}_combat_opcode"] = (
                        0 <= combat_offset < len(natural_ecl_raw) and natural_ecl_raw[combat_offset] == 0x24
                    )
                    checks[f"natural_wave_{index}_resume_opcode"] = (
                        isinstance(resume_opcode, int)
                        and 0 <= resume_offset < len(natural_ecl_raw)
                        and natural_ecl_raw[resume_offset] == resume_opcode
                    )
            else:
                load_vaddrs = natural.get("load_monster_vaddrs")
                groups = natural.get("monster_groups")
                if not isinstance(load_vaddrs, list):
                    load_vaddrs = [natural.get("load_monster_vaddr")]
                if not isinstance(groups, list):
                    groups = [natural.get("monster_group", [])]
                combat_offset = natural_offset(natural.get("combat_vaddr"))
                resume_offset = natural_offset(natural.get("resume_vaddr"))
                load_checks = []
                for vaddr, group in zip(load_vaddrs, groups):
                    load_offset = natural_offset(vaddr)
                    load_bytes = immediate_instruction(0x0B, group) if isinstance(group, list) and len(group) == 3 else b""
                    load_checks.append(bool(load_bytes) and natural_ecl_raw[load_offset:load_offset + len(load_bytes)] == load_bytes)
                checks["natural_load_monster"] = len(load_vaddrs) == len(groups) and bool(load_checks) and all(load_checks)
                checks["natural_combat_opcode"] = 0 <= combat_offset < len(natural_ecl_raw) and natural_ecl_raw[combat_offset] == 0x24
                resume_opcode = natural.get("resume_opcode", 0x09)
                checks["natural_resume_opcode"] = 0 <= resume_offset < len(natural_ecl_raw) and natural_ecl_raw[resume_offset] == resume_opcode
        checks["browser_test_present"] = bool(route.get("browser_test")) and (REPO_ROOT / route["browser_test"]).exists()

    persistence = route.get("persistence")
    if isinstance(persistence, dict):
        save_model = REPO_ROOT / "packages/engine/src/world/saveGame.ts"
        engine_test = REPO_ROOT / str(persistence.get("engine_test", ""))
        browser_test = REPO_ROOT / str(persistence.get("browser_test", ""))
        save_text = save_model.read_text(encoding="utf-8") if save_model.exists() else ""
        engine_text = engine_test.read_text(encoding="utf-8") if engine_test.exists() else ""
        browser_text = browser_test.read_text(encoding="utf-8") if browser_test.exists() else ""
        address = persistence.get("memory_address")
        mask = persistence.get("consumed_mask")
        resume_write = natural.get("resume_write", []) if isinstance(natural, dict) else []
        guards = persistence.get("guards")
        expected_version = persistence.get("save_version")
        save_schema_check = (
            isinstance(expected_version, int)
            and f"SAVE_VERSION = {expected_version}" in save_text
            and "areaMemory" in save_text
        )
        if isinstance(guards, list) and guards:
            addend = route.get("ecl_address_addend")
            guard_declarations = all(
                isinstance(guard, dict)
                and isinstance(guard.get("vaddr"), int)
                and isinstance(guard.get("address"), int)
                and isinstance(guard.get("value"), int)
                and isinstance(guard.get("ecl_block", route["ecl_block"]), int)
                for guard in guards
            )
            guard_bytes = guard_declarations and isinstance(addend, int) and all(
                (
                    (offset := ((guard["vaddr"] + addend) & 0xFFFF) + 2) >= 0
                    and (
                        guard_ecl := next(
                            (b for b in ecl_blocks if b["block_id"] == guard.get("ecl_block", route["ecl_block"])),
                            None,
                        )
                    ) is not None
                    and guard_ecl["raw"][offset:offset + 6] == save_instruction(guard["value"], guard["address"])
                )
                for guard in guards
            )
            markers = persistence.get("browser_markers", [])
            persistence_checks = {
                "persistence_save_schema": save_schema_check,
                "persistence_guards_declared": guard_declarations,
                "persistence_guard_bytes": bool(guard_bytes),
                "persistence_engine_test": (
                    engine_test.exists()
                    and guard_declarations
                    and all(
                        f"0x{guard['address']:x}" in engine_text.lower()
                        or f"0x{guard['address']:04x}" in engine_text.lower()
                        for guard in guards
                    )
                ),
                "persistence_browser_test": (
                    browser_test.exists()
                    and guard_declarations
                    and isinstance(markers, list)
                    and bool(markers)
                    and all(isinstance(marker, str) and marker in browser_text for marker in markers)
                ),
            }
        else:
            persistence_checks = {
                "persistence_save_schema": save_schema_check,
                "persistence_resume_address": (
                    isinstance(address, int)
                    and len(resume_write) == 2
                    and resume_write[0] == address
                ),
                "persistence_consumed_mask": (
                    isinstance(mask, int)
                    and mask > 0
                    and len(resume_write) == 2
                    and isinstance(resume_write[1], int)
                    and resume_write[1] & mask == mask
                ),
                "persistence_engine_test": (
                    engine_test.exists()
                    and isinstance(address, int)
                    and f"0x{address:x}" in engine_text.lower()
                ),
                "persistence_browser_test": (
                    browser_test.exists()
                    and isinstance(persistence.get("browser_marker"), str)
                    and persistence["browser_marker"] in browser_text
                    and "verifyNaturalPersistence" in browser_text
                ),
            }
        checks.update(persistence_checks)
        result["persistence"] = {
            "declared": True,
            "status": "verified-contract" if all(persistence_checks.values()) else "failed-checks",
            "checks": persistence_checks,
        }

    monster_file = route.get("monster_file")
    if monster_file:
        monster_path = files.get(str(monster_file).upper())
        checks["monster_file_present"] = monster_path is not None and monster_path.exists()
        if monster_path and monster_path.exists():
            try:
                monsters = read_dax_blocks(monster_path)
                expected_size = route.get("monster_record_size")
                checks["monster_record_size"] = bool(monsters) and all(b["raw_size"] == expected_size for b in monsters)
                preview = route.get("preview_monster")
                if preview:
                    record = next((b for b in monsters if b["block_id"] == preview["block_id"]), None)
                    checks["preview_monster_present"] = record is not None and decode_record_name(record["raw"]) == preview["name"]
                result["monster"] = {
                    "file": monster_file,
                    "records": len(monsters),
                    "record_sizes": sorted({b["raw_size"] for b in monsters}),
                    "layout": route.get("monster_layout", "decoded-layout"),
                    "preview_monster": preview,
                }
            except Exception as exc:
                checks["monster_archive_readable"] = False
                result["monster_error"] = str(exc)

    result["checks"] = checks
    result["status"] = "verified-byte-contract" if checks and all(checks.values()) else "failed-checks"
    result["failed_checks"] = sorted(name for name, ok in checks.items() if not ok)
    result["verification"] = verify_release_contract(route)
    return result


def decode_frua_6bit(raw: bytes) -> str:
    """Decode GEODATA.TXT's 6-bit FRUA string alphabet (the same mapping as ECL strings)."""
    out: list[str] = []
    acc = 0
    bits = 0
    for byte in raw:
        acc = (acc << 8) | byte
        bits += 8
        while bits >= 6:
            bits -= 6
            value = (acc >> bits) & 0x3F
            if value == 0:
                return "".join(out)
            out.append(chr(value + 64 if value <= 31 else value))
    return "".join(out)


def decode_frua_string_ref(geo: bytes, string_ref: int) -> str:
    """Decode one 1-based GEO text-box reference; zero is the explicit no-string sentinel."""
    if not isinstance(string_ref, int) or string_ref <= 0 or len(geo) < 6200:
        return ""
    lengths = geo[5800:6200]
    string_index = string_ref - 1
    if string_index >= len(lengths):
        return ""
    string_offset = 6200 + sum(lengths[:string_index])
    string_length = lengths[string_index]
    if string_offset + string_length > len(geo):
        return ""
    return decode_frua_6bit(geo[string_offset:string_offset + string_length])


def frua_event_record(geo: bytes, event_slot: Any) -> bytes:
    """Return one 20-byte, 1-based FRUA event record, or empty bytes for an invalid slot/file."""
    if not isinstance(event_slot, int) or not 1 <= event_slot <= 100:
        return b""
    event_offset = 3786 + (event_slot - 1) * 20
    record = geo[event_offset:event_offset + 20]
    return record if len(record) == 20 else b""


def split_frua_button_labels(text: str) -> list[str]:
    """Split Question-Button's caret field while retaining internal empty button positions."""
    if not text:
        return []
    labels = text.split("^")
    if labels and labels[0] == "":
        labels.pop(0)
    if labels and labels[-1] == "":
        labels.pop()
    return labels[:5]


def verify_frua_dsn_route(route: dict[str, Any], files: dict[str, Path]) -> dict[str, Any]:
    """Verify a path-shaped retail FRUA design checkpoint without treating SCRIPT.GLB as DQK ECL."""
    result: dict[str, Any] = {
        "declared": True,
        "container_kind": "frua-dsn",
        "status": "unverified",
        "surface": route.get("surface"),
        "design_dir": route.get("design_dir"),
        "module_number": route.get("module_number"),
        "entry": route.get("entry"),
        "target": route.get("target"),
        "event_slot": route.get("event_slot"),
        "event_type": route.get("event_type"),
        "event_text": route.get("event_text"),
        "engine_test": route.get("engine_test"),
        "checks": {},
    }
    ckit = files.get("CKIT.EXE")
    if ckit is None:
        result["status"] = "missing-files"
        result["missing_files"] = ["CKIT.EXE"]
        return result
    design_root = ckit.parent / str(route.get("design_dir", ""))
    game_path = design_root / str(route.get("game_file", "GAME001.DAT"))
    geo_path = design_root / str(route.get("geo_file", ""))
    question = route.get("question_button")
    question_geo_path = (
        design_root / str(question.get("geo_file", ""))
        if isinstance(question, dict) and isinstance(question.get("geo_file"), str)
        else None
    )
    required_paths = [game_path, geo_path]
    if question_geo_path is not None:
        required_paths.append(question_geo_path)
    if any(not path.is_file() for path in required_paths):
        result["status"] = "missing-files"
        result["missing_files"] = [slash(path) for path in required_paths if not path.is_file()]
        return result

    game = game_path.read_bytes()
    geo = geo_path.read_bytes()
    entry = route.get("entry", {})
    target = route.get("target", {})
    width = route.get("width")
    height = route.get("height")
    event_slot = route.get("event_slot")
    event_type = route.get("event_type")
    event_text = route.get("event_text")
    engine_test = REPO_ROOT / str(route.get("engine_test", ""))
    browser_test = REPO_ROOT / str(route.get("browser_test", ""))
    engine_text = engine_test.read_text(encoding="utf-8") if engine_test.exists() else ""
    browser_text = browser_test.read_text(encoding="utf-8") if browser_test.exists() else ""

    cell_index = target.get("y", -1) * width + target.get("x", -1) if isinstance(width, int) else -1
    cell_event_offset = 322 + cell_index * 6 + 4
    event_record = frua_event_record(geo, event_slot)
    # Text Statement type 2 stores statement #1 at 1-based record bytes 9-10 (GEOEVENT.TXT).
    string_ref = int.from_bytes(event_record[8:10], "little") if event_record else -1
    decoded_text = decode_frua_string_ref(geo, string_ref)

    checks = {
        "frua_game_hash": hashlib.sha256(game).hexdigest() == str(route.get("game_sha256", "")).lower(),
        "frua_geo_hash": hashlib.sha256(geo).hexdigest() == str(route.get("geo_sha256", "")).lower(),
        "frua_game_start": (
            len(game) > 49
            and game[48] == route.get("game_start_module")
            and game[49] == route.get("game_start_entry_raw")
        ),
        "frua_geo_dimensions": len(geo) >= 6200 and geo[26] == height and geo[27] == width,
        "frua_entry_pose": (
            len(geo) > 40
            and geo[38] == entry.get("x")
            and geo[39] == entry.get("y")
            and geo[40] == entry.get("facing_code")
        ),
        "frua_target_event_slot": 0 <= cell_event_offset < len(geo) and geo[cell_event_offset] == event_slot,
        "frua_event_type": bool(event_record) and event_record[0] == event_type,
        "frua_event_text": decoded_text == event_text,
        "engine_test_present": (
            engine_test.exists()
            and str(route.get("game_sha256", "")).lower() in engine_text.lower()
            and str(route.get("geo_sha256", "")).lower() in engine_text.lower()
            and str(event_text) in engine_text
        ),
        "browser_test_present": (
            browser_test.exists()
            and str(route.get("browser_marker", "")) in browser_text
            and str(event_text) in browser_text
        ),
    }

    if isinstance(question, dict) and question_geo_path is not None:
        question_geo = question_geo_path.read_bytes()
        q_entry = question.get("entry", {})
        q_target = question.get("target", {})
        q_width = question.get("width")
        q_height = question.get("height")
        q_slot = question.get("event_slot")
        q_record = frua_event_record(question_geo, q_slot)
        try:
            expected_record = bytes.fromhex(str(question.get("event_record_hex", "")))
        except ValueError:
            expected_record = b""

        q_cell_index = (
            q_target.get("y", -1) * q_width + q_target.get("x", -1)
            if isinstance(q_width, int) and isinstance(q_target, dict)
            else -1
        )
        q_cell_event_offset = 322 + q_cell_index * 6 + 4
        q_prompt_ref = int.from_bytes(q_record[4:6], "little") if q_record else -1
        q_labels_ref = int.from_bytes(q_record[8:10], "little") if q_record else -1
        decoded_prompt = decode_frua_string_ref(question_geo, q_prompt_ref)
        decoded_labels_text = decode_frua_string_ref(question_geo, q_labels_ref)
        decoded_labels = split_frua_button_labels(decoded_labels_text)
        decoded_branches = list(q_record[10:15]) if q_record else []
        decoded_repeats = [
            button for button in range(1, 6)
            if q_record and q_record[7] & (1 << (button + 1))
        ]
        decoded_backups = [
            button for button in range(1, 6)
            if q_record and q_record[15] & (1 << (button - 1))
        ]

        q_engine_test = REPO_ROOT / str(question.get("engine_test", ""))
        q_engine_text = q_engine_test.read_text(encoding="utf-8") if q_engine_test.is_file() else ""
        button_targets = question.get("button_targets")
        decoded_button_targets: list[dict[str, Any]] = []
        button_target_checks: dict[str, bool] = {}
        if isinstance(button_targets, list):
            for declaration in button_targets:
                button = declaration.get("button") if isinstance(declaration, dict) else None
                target_slot = declaration.get("slot") if isinstance(declaration, dict) else None
                target_record = frua_event_record(question_geo, target_slot)
                target_type = target_record[0] if target_record else None
                target_once = bool(target_record[1] & 1) if target_record else None
                # Combat stores player text at bytes 5-6; Text Statement stores statement 1 at 9-10.
                text_record_offset = 4 if target_type == 1 else 8 if target_type == 2 else -1
                target_ref = (
                    int.from_bytes(target_record[text_record_offset:text_record_offset + 2], "little")
                    if text_record_offset >= 0
                    else -1
                )
                target_text = decode_frua_string_ref(question_geo, target_ref)
                decoded_button_targets.append({
                    "button": button,
                    "slot": target_slot,
                    "event_type": target_type,
                    "once_only": target_once,
                    "text": target_text,
                })
                branch_matches = (
                    isinstance(button, int)
                    and 1 <= button <= len(decoded_branches)
                    and decoded_branches[button - 1] == target_slot
                )
                button_target_checks[f"frua_question_button_{button}_target"] = (
                    branch_matches
                    and target_type == declaration.get("event_type")
                    and target_once == declaration.get("once_only")
                    and target_text == declaration.get("text")
                )

        # The exact entry-to-cell proof is map-local: authentic entry 0 faces south, then
        # left/east + two forward moves cross four zero/open edge bytes into event cell 11.
        route_cells: list[int] = []
        if (
            isinstance(q_width, int)
            and isinstance(q_entry, dict)
            and isinstance(q_target, dict)
            and all(isinstance(q_entry.get(k), int) for k in ("x", "y"))
        ):
            for x in range(q_entry["x"], q_target.get("x", -1) + 1):
                route_cells.append(322 + (q_entry["y"] * q_width + x) * 6)
        route_open = (
            len(route_cells) == 3
            and question.get("route_actions") == ["left", "forward", "forward"]
            and q_entry.get("facing_code") == 4
            and q_target.get("y") == q_entry.get("y")
            and q_target.get("x") == q_entry.get("x") + 2
            and question_geo[route_cells[0] + 1] == 0
            and question_geo[route_cells[1] + 3] == 0
            and question_geo[route_cells[1] + 1] == 0
            and question_geo[route_cells[2] + 3] == 0
        )
        event_cell_offsets = [
            322 + index * 6 + 4
            for index in range(q_width * q_height)
        ] if isinstance(q_width, int) and isinstance(q_height, int) else []

        question_checks = {
            "frua_question_geo_hash": (
                hashlib.sha256(question_geo).hexdigest() == str(question.get("geo_sha256", "")).lower()
            ),
            "frua_question_geo_dimensions": (
                len(question_geo) >= 6200
                and question_geo[26] == q_height
                and question_geo[27] == q_width
            ),
            "frua_question_entry_pose": (
                len(question_geo) > 40
                and question_geo[38] == q_entry.get("x")
                and question_geo[39] == q_entry.get("y")
                and question_geo[40] == q_entry.get("facing_code")
            ),
            "frua_question_natural_route": route_open,
            "frua_question_target_event_slot": (
                0 <= q_cell_event_offset < len(question_geo)
                and question_geo[q_cell_event_offset] == q_slot
            ),
            "frua_question_unique_cell": (
                bool(event_cell_offsets)
                and [offset for offset in event_cell_offsets if question_geo[offset] == q_slot] == [q_cell_event_offset]
            ),
            "frua_question_event_record": bool(expected_record) and q_record == expected_record,
            "frua_question_event_type": bool(q_record) and q_record[0] == question.get("event_type"),
            "frua_question_once_only": (
                bool(q_record) and bool(q_record[1] & 1) == question.get("once_only")
            ),
            "frua_question_common_header": (
                bool(q_record) and q_record[1] & 0xFE == 0 and q_record[2] == 0 and q_record[3] == 0
            ),
            "frua_question_prompt": decoded_prompt == question.get("prompt"),
            "frua_question_labels": decoded_labels == question.get("labels"),
            "frua_question_branches": decoded_branches == question.get("branch_targets"),
            "frua_question_repeat_buttons": decoded_repeats == question.get("repeat_question_buttons"),
            "frua_question_backup_buttons": decoded_backups == question.get("backup_one_step_buttons"),
            "frua_question_no_art": (
                bool(q_record) and bool(q_record[7] & 0x80) == question.get("no_art")
            ),
            "frua_question_engine_test": (
                q_engine_test.is_file()
                and str(question.get("geo_sha256", "")).lower() in q_engine_text.lower()
                and str(question.get("prompt", "")) in q_engine_text
                and isinstance(button_targets, list)
                and any(str(target.get("text", "")) in q_engine_text for target in button_targets if target.get("button") == 4)
                and "consumes the source event, repeats YELL in place, and restores the consumed state" in q_engine_text
            ),
            **button_target_checks,
        }
        checks.update(question_checks)
        result["question_button"] = {
            "declared": True,
            "status": "verified-byte-contract" if all(question_checks.values()) else "failed-checks",
            "module_number": question.get("module_number"),
            "geo_file": question.get("geo_file"),
            "entry": question.get("entry"),
            "target": question.get("target"),
            "event_slot": q_slot,
            "event_type": q_record[0] if q_record else None,
            "once_only": bool(q_record[1] & 1) if q_record else None,
            "decoded_prompt": decoded_prompt,
            "decoded_labels": decoded_labels,
            "branch_targets": decoded_branches,
            "repeat_question_buttons": decoded_repeats,
            "backup_one_step_buttons": decoded_backups,
            "no_art": bool(q_record[7] & 0x80) if q_record else None,
            "button_targets": decoded_button_targets,
            "checks": question_checks,
            "failed_checks": sorted(name for name, ok in question_checks.items() if not ok),
        }

    persistence = route.get("persistence")
    if isinstance(persistence, dict):
        save_model = REPO_ROOT / "packages/engine/src/world/saveGame.ts"
        state_model = REPO_ROOT / "packages/engine/src/module/eventState.ts"
        runtime_model = REPO_ROOT / "packages/engine/src/module/eventRuntime.ts"
        module_host = REPO_ROOT / "apps/web/src/ui/moduleExplore.ts"
        persistence_engine_test = REPO_ROOT / str(persistence.get("engine_test", ""))
        persistence_save_test = REPO_ROOT / str(persistence.get("save_test", ""))
        persistence_browser_test = REPO_ROOT / str(persistence.get("browser_test", ""))
        persistence_electron_test = REPO_ROOT / str(persistence.get("electron_test", ""))
        save_text = save_model.read_text(encoding="utf-8") if save_model.is_file() else ""
        state_text = state_model.read_text(encoding="utf-8") if state_model.is_file() else ""
        runtime_text = runtime_model.read_text(encoding="utf-8") if runtime_model.is_file() else ""
        host_text = module_host.read_text(encoding="utf-8") if module_host.is_file() else ""
        persistence_engine_text = (
            persistence_engine_test.read_text(encoding="utf-8") if persistence_engine_test.is_file() else ""
        )
        persistence_save_text = (
            persistence_save_test.read_text(encoding="utf-8") if persistence_save_test.is_file() else ""
        )
        persistence_browser_text = (
            persistence_browser_test.read_text(encoding="utf-8") if persistence_browser_test.is_file() else ""
        )
        persistence_electron_text = (
            persistence_electron_test.read_text(encoding="utf-8") if persistence_electron_test.is_file() else ""
        )
        save_version = persistence.get("save_version")
        event_state_version = persistence.get("module_event_state_version")
        module_id = persistence.get("module_id")
        consumed_ids = persistence.get("consumed_event_ids")
        consumed_literal = ", ".join(str(value) for value in consumed_ids) if isinstance(consumed_ids, list) else ""
        snapshot_markers = (
            isinstance(module_id, str)
            and isinstance(consumed_ids, list)
            and f"moduleId: '{module_id}'" in persistence_browser_text
            and f"consumedEventIds: [{consumed_literal}]" in persistence_browser_text
        )
        electron_snapshot_markers = (
            isinstance(module_id, str)
            and isinstance(consumed_ids, list)
            and f"moduleId: '{module_id}'" in persistence_electron_text
            and f"consumedEventIds: [{consumed_literal}]" in persistence_electron_text
        )
        persistence_checks = {
            "persistence_save_schema": (
                isinstance(save_version, int)
                and f"SAVE_VERSION = {save_version}" in save_text
                and "moduleEventState" in save_text
            ),
            "persistence_event_state_schema": (
                isinstance(event_state_version, int)
                and f"MODULE_EVENT_STATE_VERSION = {event_state_version}" in state_text
                and "moduleId" in state_text
                and "consumedEventIds" in state_text
            ),
            "persistence_shared_runtime": (
                "class ModuleEventRuntime" in runtime_text
                and "isConsumed(eventId" in runtime_text
                and "snapshot(): ModuleEventStateSnapshot" in runtime_text
                and "restore(value" in runtime_text
            ),
            "persistence_module_host": (
                "ModuleEventRuntime" in host_text
                and "saveModuleSession" in host_text
                and "loadModuleSession" in host_text
                and "moduleEventState" in host_text
            ),
            "persistence_engine_test": (
                persistence_engine_test.is_file()
                and "consumes the source event, repeats YELL in place, and restores the consumed state" in persistence_engine_text
                and isinstance(consumed_ids, list)
                and f"consumedEventIds: [{consumed_literal}]" in persistence_engine_text
            ),
            "persistence_save_test": (
                persistence_save_test.is_file()
                and "moduleEventState" in persistence_save_text
                and isinstance(consumed_ids, list)
                and f"consumedEventIds: [{consumed_literal}]" in persistence_save_text
            ),
            "persistence_browser_test": (
                persistence_browser_test.is_file()
                and isinstance(persistence.get("browser_marker"), str)
                and persistence["browser_marker"] in persistence_browser_text
                and snapshot_markers
            ),
            "persistence_electron_test": (
                persistence_electron_test.is_file()
                and isinstance(persistence.get("electron_marker"), str)
                and persistence["electron_marker"] in persistence_electron_text
                and electron_snapshot_markers
            ),
        }
        checks.update(persistence_checks)
        result["persistence"] = {
            "declared": True,
            "status": "verified-contract" if all(persistence_checks.values()) else "failed-checks",
            "save_version": save_version,
            "module_event_state_version": event_state_version,
            "module_id": module_id,
            "consumed_event_ids": consumed_ids,
            "engine_test": persistence.get("engine_test"),
            "checks": persistence_checks,
            "failed_checks": sorted(name for name, ok in persistence_checks.items() if not ok),
        }

    result["checks"] = checks
    result["decoded_event_text"] = decoded_text
    result["status"] = "verified-byte-contract" if all(checks.values()) else "failed-checks"
    result["failed_checks"] = sorted(name for name, ok in checks.items() if not ok)
    result["verification"] = verify_release_contract(route)
    return result


def verify_route(route: dict[str, Any], files: dict[str, Path]) -> dict[str, Any]:
    kind = route.get("container_kind", "dax-gen1")
    if kind == "hlib-gen2":
        return verify_hlib_gen2_route(route, files)
    if kind == "dax-gen1":
        return verify_dax_gen1_route(route, files)
    if kind == "frua-dsn":
        return verify_frua_dsn_route(route, files)
    raise ValueError(f"unsupported route container kind: {kind}")


def resolve_manifest_asset(path_text: str) -> Path:
    path = Path(path_text)
    return path if path.is_absolute() else REPO_ROOT / path


def inspect_manifest(manifest_id: str | None) -> dict[str, Any]:
    if not manifest_id:
        return {"declared": False, "status": "missing", "file_count": 0, "present_files": 0, "missing_files": []}
    path = REPO_ROOT / "apps/web/games" / f"{manifest_id}.json"
    if not path.exists():
        return {"declared": True, "status": "missing", "id": manifest_id, "file_count": 0, "present_files": 0, "missing_files": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("files", [])
    missing = [entry.get("path", "") for entry in entries if not resolve_manifest_asset(entry.get("path", "")).exists()]
    return {
        "declared": True,
        "status": "complete-local" if not missing else "partial-local",
        "id": manifest_id,
        "path": slash(path.relative_to(REPO_ROOT)),
        "file_count": len(entries),
        "present_files": len(entries) - len(missing),
        "missing_files": missing,
    }


def binary_evidence(
    gen1_report: gen1_map.Gen1MapReport,
    profile_id: str,
    install: binary_inventory.FolderInventory | None,
    rtlink: rtlink_map.RtlinkMap | None,
) -> dict[str, Any]:
    mapped = next((item for item in gen1_report.binary_maps if normalize_profile_id(item.profile_id) == profile_id), None)
    if mapped:
        resolved = sum(1 for row in mapped.selector_resolutions if row.resolved)
        return {
            "status": mapped.status,
            "overlay_format": mapped.fbov.magic if mapped.fbov else None,
            "descriptors": len(mapped.descriptors),
            "anchors": len(mapped.anchor_hits),
            "selector_rows": len(mapped.selector_resolutions),
            "selectors_resolved": resolved,
        }
    if rtlink:
        return {
            "status": "rtlink-mapped",
            "overlay_format": "RTLink/Plus",
            "descriptors": len(rtlink.overlays),
            "resident_stubs": len(rtlink.stubs),
            "stubs_resolved": sum(1 for stub in rtlink.stubs if stub.target_status == "resolved"),
            "descriptor_confidence": rtlink.descriptor_table_confidence,
            "sha256": rtlink.sha256,
        }
    if install:
        names = {file.name.upper() for file in install.files}
        if profile_id in {"dark-queen-of-krynn", "forgotten-realms-unlimited-adventures"}:
            return {"status": "inventory-only", "overlay_format": "RTLink/Plus", "executable_present": any(name.endswith(".EXE") for name in names)}
    return {"status": "not-found", "overlay_format": None}


def archive_summary(install: binary_inventory.FolderInventory | None) -> dict[str, Any]:
    if install is None:
        return {"file_count": 0, "extensions": {}, "signatures": {}}
    extensions = Counter(Path(file.name).suffix.upper() or "(none)" for file in install.files)
    signatures = Counter(sig for file in install.files for sig in file.signatures)
    return {
        "file_count": len(install.files),
        "extensions": dict(sorted(extensions.items())),
        "signatures": dict(sorted(signatures.items())),
    }


def archive_category(name: str) -> str:
    upper = name.upper()
    stem = Path(upper).stem
    if stem.startswith("ECL"):
        return "ecl"
    if stem.startswith("GEO"):
        return "geo"
    if stem.startswith("WALL"):
        return "wall"
    if stem.startswith("MON"):
        return "monster"
    if stem.startswith("ITEM"):
        return "item"
    if any(token in stem for token in ("SOUND", "MUSIC", "ZOUND", "SFX", "SONG")):
        return "audio"
    if any(stem.startswith(token) for token in ("8X8", "BIGPIC", "BODY", "COMSPR", "CPIC", "DUNG", "PIC", "SPRIT", "TITLE", "WILD")):
        return "graphics"
    if Path(upper).suffix in {".SAV", ".QSV"} or any(token in stem for token in ("SAVE", "SAVGAM", "CHRDATA")):
        return "save"
    return "other"


def archive_member_inventory(install: binary_inventory.FolderInventory | None) -> dict[str, Any]:
    if install is None:
        return {"containers": 0, "members": 0, "parse_failures": 0, "categories": {}, "files": []}
    root = Path(install.path)
    rows: list[dict[str, Any]] = []
    for evidence in install.files:
        path = root / Path(evidence.rel_path)
        suffix = path.suffix.upper()
        category = archive_category(evidence.name)
        kind: str | None = None
        if suffix == ".DAX":
            kind = "dax"
        elif suffix == ".DAA":
            kind = "daa"
        elif suffix in {".GLB", ".TLB"} and path.exists() and path.read_bytes()[:4] == b"HLIB":
            kind = "hlib"
        elif category == "save" and path.is_file():
            raw = path.read_bytes()
            rows.append({
                "file": slash(Path(evidence.rel_path)),
                "kind": "raw-save",
                "category": category,
                "member_count": 1,
                "unpacked_size": len(raw),
                "members": [{"index": 0, "id": 0, "size": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}],
                "provenance": "retail-bytes",
                "confidence": "exact-file-hash",
            })
            continue
        if kind is None:
            continue

        row: dict[str, Any] = {
            "file": slash(Path(evidence.rel_path)),
            "kind": kind,
            "category": category,
            "provenance": "retail-bytes",
            "confidence": "exact-container-parse",
        }
        try:
            if kind == "dax":
                container_kind, data_base, members = format_manifest.manifest_dax(path)
                row.update({"container_kind": container_kind, "data_base": data_base})
            elif kind == "daa":
                container_kind, data_base, members = format_manifest.manifest_daa(path)
                row.update({"container_kind": container_kind, "data_base": data_base})
            else:
                tag, members = format_manifest.manifest_hlib(path)
                row["container_kind"] = tag
            row["members"] = members
            row["member_count"] = len(members)
            row["unpacked_size"] = sum(member["size"] for member in members if member["size"] >= 0)
        except Exception as exc:
            row.update({"member_count": 0, "unpacked_size": 0, "members": [], "error": str(exc), "confidence": "parse-failed"})
        rows.append(row)

    categories = Counter(row["category"] for row in rows)
    return {
        "containers": len(rows),
        "members": sum(row["member_count"] for row in rows),
        "parse_failures": sum(1 for row in rows if row.get("error")),
        "categories": dict(sorted(categories.items())),
        "files": rows,
    }


def game_gaps(game: dict[str, Any]) -> list[str]:
    gaps: list[str] = []
    if not game["detected"]:
        gaps.append("local-install-not-found")
        return gaps
    if game["binary"]["status"] in {"not-found", "inventory-only"}:
        gaps.append("deep-binary-map-missing")
    if game["manifest"]["status"] == "missing":
        gaps.append("browser-manifest-missing")
    if not game["route"]["declared"]:
        gaps.append("retail-route-not-declared")
    elif game["route"]["status"] != "verified-byte-contract":
        gaps.append("retail-route-byte-contract-failed")
    if game["route"].get("surface") == "combat-preview":
        gaps.append("natural-encounter-handoff-unverified")
    if game["route"].get("surface") == "exploration-vga-fallback":
        gaps.extend(["vga-render-fidelity-unverified", "sav-frontier-monster-tail-unlocated"])
    campaign_matrix = game.get("campaign_matrix")
    if (
        game["route"]["status"] == "verified-byte-contract"
        and game["route"].get("persistence", {}).get("status") == "verified-contract"
        and isinstance(campaign_matrix, dict)
        and not campaign_matrix.get("satisfied")
    ):
        failing = ",".join(campaign_matrix.get("failing_legs", [])) or "unknown"
        gaps.append(f"campaign-matrix-incomplete:{failing}")
    if isinstance(campaign_matrix, dict) and campaign_matrix.get("satisfied"):
        if game["route"].get("verification", {}).get("status") != "verified-contract":
            gaps.append("verified-release-contract-missing")
        if game.get("capabilities", {}).get("status") != "verified-contract":
            gaps.append("capability-manifest-missing-or-invalid")
    saves = game.get("capabilities", {}).get("capabilities", {}).get("retail_save", {})
    for direction in ("import", "export"):
        status = saves.get(direction, {}).get("status") if isinstance(saves, dict) else None
        if status in {"partial", "unsupported"}:
            gaps.append(f"retail-save-{direction}-{status}")
    return gaps


def evidence_level(game: dict[str, Any]) -> str:
    if game["route"]["status"] == "verified-byte-contract":
        if game["route"].get("persistence", {}).get("status") == "verified-contract":
            campaign_matrix = game.get("campaign_matrix")
            if isinstance(campaign_matrix, dict) and campaign_matrix.get("satisfied"):
                if (
                    game["route"].get("verification", {}).get("status") == "verified-contract"
                    and game.get("capabilities", {}).get("status") == "verified-contract"
                ):
                    return "verified"
                return "campaign"
            return "persistent"
        if game["route"].get("surface") == "natural-combat":
            return "combat"
        return "route"
    if game["manifest"]["status"] == "complete-local":
        return "preview"
    if game["binary"]["status"] not in {"not-found", "inventory-only"}:
        return "mapped"
    return "missing"


def public_support_evidence(corpus: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "evidence_date": corpus["evidence_date"],
        "summary": corpus["summary"],
        "games": [
            {
                "profile_id": game["profile_id"],
                "title": game["title"],
                "family": game["family"],
                "detected": game["detected"],
                "binary": game["binary"],
                "manifest_status": game["manifest"]["status"],
                "route_status": game["route"]["status"],
                "route_kind": game["route"].get("container_kind"),
                "surface": game["route"].get("surface"),
                "level": evidence_level(game),
                "gaps": game["gaps"],
                "campaign_matrix": game.get("campaign_matrix"),
                "verification": game["route"].get("verification"),
                "capabilities": game.get("capabilities"),
            }
            for game in corpus["games"]
        ],
    }


# Profile ids allowed to publish a support level BELOW the one the corpus derives.
#
# Added 2026-08-17 together with the under-claim arm of validate_support_claims. Deliberately EMPTY,
# and it should stay that way. An entry here is a written, justified reason why a title's public
# claim is knowingly held back below its own evidence -- e.g. a level the corpus derives from data
# we do not yet trust enough to advertise. It is NOT a parking spot for "the ledger drifted and
# nobody updated the JSON": that is the exact failure the under-claim arm exists to catch, and the
# fix for it is to correct apps/web/src/ui/supportClaims.json, not to add an id here.
SUPPORT_CLAIM_LAG_EXCEPTIONS: dict[str, str] = {}


def validate_support_claims(evidence: dict[str, Any], claims_path: Path = SUPPORT_CLAIMS_PATH) -> list[str]:
    if not claims_path.exists():
        return [f"support claims file missing: {slash(claims_path.relative_to(REPO_ROOT))}"]
    claims = json.loads(claims_path.read_text(encoding="utf-8"))
    ranks = {"missing": 0, "mapped": 1, "preview": 2, "route": 3, "combat": 4, "persistent": 5, "campaign": 6, "verified": 7}
    by_id = {game["profile_id"]: game for game in evidence["games"]}
    errors: list[str] = []
    claim_ids: set[str] = set()
    for claim in claims.get("games", []):
        profile_id = claim.get("profile_id", "")
        claim_ids.add(profile_id)
        game = by_id.get(profile_id)
        if game is None:
            errors.append(f"unknown support profile: {profile_id}")
            continue
        level = claim.get("web_level", "missing")
        if level not in ranks:
            errors.append(f"{profile_id}: unknown web level {level}")
        elif ranks[level] > ranks[game["level"]]:
            errors.append(f"{profile_id}: claims {level}, corpus permits only {game['level']}")
        # The under-claim arm. Publishing LESS than the evidence supports is the conservative
        # direction and never misleads a reader, but it makes this gate unable to fail in the only
        # way it realistically drifts: the corpus advances and the checked-in JSON is left behind.
        # A one-directional check silently accepts that forever, so the ledger stops being a
        # statement about the evidence and becomes a statement about when someone last edited it.
        elif ranks[level] < ranks[game["level"]] and profile_id not in SUPPORT_CLAIM_LAG_EXCEPTIONS:
            errors.append(f"{profile_id}: claims {level}, corpus derives {game['level']}")
    for profile_id in sorted(set(by_id) - claim_ids):
        errors.append(f"support claim missing for corpus profile: {profile_id}")
    return errors


def build_corpus(extra_roots: list[Path] | None = None) -> dict[str, Any]:
    routes = load_routes()
    route_payload = json.loads(ROUTES_PATH.read_text(encoding="utf-8"))
    campaign_matrix = load_campaign_matrix()
    capabilities = load_capabilities()
    roots = inventory_roots(extra_roots or [])
    inventory = binary_inventory.inventory(roots, recursive=False, max_depth=3, include_unprofiled=False)
    gen1_report = gen1_map.build_report([])
    games: list[dict[str, Any]] = []
    for profile in PROFILES:
        route_decl = routes.get(profile["id"])
        install = choose_install(inventory, profile["id"], route_decl)
        files = file_index(install)
        rtlink_binary = None
        if profile["id"] == "dark-queen-of-krynn" and files.get("DQK.EXE"):
            rtlink_binary = rtlink_map.map_file(files["DQK.EXE"])
        elif profile["id"] == "forgotten-realms-unlimited-adventures" and files.get("CKIT.EXE"):
            rtlink_binary = rtlink_map.map_file(files["CKIT.EXE"])
        route = verify_route(route_decl, files) if route_decl else {"declared": False, "status": "missing", "checks": {}}
        game = {
            "profile_id": profile["id"],
            "title": profile["title"],
            "family": profile["family"],
            "detected": install is not None,
            "install_root": slash(install.path) if install else None,
            "detection_confidence": install.confidence if install else "none",
            "markers": install.markers if install else [],
            "binary": binary_evidence(gen1_report, profile["id"], install, rtlink_binary),
            "archives": archive_summary(install),
            "archive_members": archive_member_inventory(install),
            "manifest": inspect_manifest(profile.get("manifest")),
            "route": route,
            "campaign_matrix": campaign_matrix.get(profile["id"]),
            "capabilities": validate_capability_contract(capabilities.get(profile["id"])),
        }
        game["gaps"] = game_gaps(game)
        games.append(game)

    detected = sum(1 for game in games if game["detected"])
    route_verified = sum(1 for game in games if game["route"]["status"] == "verified-byte-contract")
    manifests = sum(1 for game in games if game["manifest"]["status"] != "missing")
    return {
        "schema_version": 1,
        "evidence_date": route_payload["evidence_date"],
        "charter": "docs/engine/LONG-TERM-GOALS.md#p1-evidence-factory",
        "inputs": {
            "roots": [slash(root) for root in roots],
            "route_declarations": slash(ROUTES_PATH.relative_to(REPO_ROOT)),
            "capability_declarations": slash(CAPABILITIES_PATH.relative_to(REPO_ROOT)),
            "gen1_mapper": "tools/gen1_map.py",
            "binary_inventory": "tools/inventory_goldbox_binaries.py",
        },
        "summary": {
            "profiles": len(games),
            "detected": detected,
            "missing": len(games) - detected,
            "binary_mapped": sum(1 for game in games if game["binary"]["status"] not in {"not-found", "inventory-only"}),
            "manifests": manifests,
            "routes_verified": route_verified,
            "archive_containers": sum(game["archive_members"]["containers"] for game in games),
            "archive_members": sum(game["archive_members"]["members"] for game in games),
            "archive_parse_failures": sum(game["archive_members"]["parse_failures"] for game in games),
        },
        "games": games,
    }


def markdown(corpus: dict[str, Any]) -> str:
    summary = corpus["summary"]
    lines = [
        "# Gold Box All-Games Evidence Corpus",
        "",
        "> Generated by `python tools/goldbox_corpus.py`. This is the P1 aggregate evidence view from",
        "> `docs/engine/LONG-TERM-GOALS.md`; deeper binary findings remain in their subsystem reports.",
        "",
        "## Summary",
        "",
        f"- Profiles: `{summary['profiles']}`; locally detected: `{summary['detected']}`; missing: `{summary['missing']}`",
        f"- Deep binary maps: `{summary['binary_mapped']}`; browser manifests: `{summary['manifests']}`; verified route byte contracts: `{summary['routes_verified']}`",
        f"- Parsed archives/save files: `{summary['archive_containers']}`; exact members hashed: `{summary['archive_members']}`; parse failures: `{summary['archive_parse_failures']}`",
        "",
        "## Capability Matrix",
        "",
        "| Game | Family | Install | Binary evidence | Manifest | Route evidence | Surface | Immediate gaps |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for game in corpus["games"]:
        install = "detected" if game["detected"] else "missing"
        binary = game["binary"]["status"]
        manifest = game["manifest"]["status"]
        route = game["route"]["status"]
        surface = game["route"].get("surface") or "-"
        gaps = ", ".join(f"`{gap}`" for gap in game["gaps"]) or "-"
        lines.append(f"| {game['title']} | `{game['family']}` | {install} | `{binary}` | `{manifest}` | `{route}` | `{surface}` | {gaps} |")

    lines.extend(
        [
            "",
            "## Exact Archive Inventory",
            "",
            "Every listed member is parsed from retail bytes and carries its member id/index, unpacked size,",
            "and SHA-256 in the JSON corpus. Counts include repeated archives when an install retains disk",
            "copies in separate subdirectories.",
            "",
            "| Game | Containers / save files | Members | Categories | Parse failures |",
            "| --- | ---: | ---: | --- | ---: |",
        ]
    )
    for game in corpus["games"]:
        archives = game["archive_members"]
        categories = ", ".join(f"{name} {count}" for name, count in archives["categories"].items()) or "-"
        lines.append(
            f"| {game['title']} | {archives['containers']} | {archives['members']} | {categories} | {archives['parse_failures']} |"
        )

    lines.extend(["", "## Verified Retail Routes", ""])
    for game in corpus["games"]:
        route = game["route"]
        if not route["declared"]:
            continue
        lines.extend(
            [
                f"### {game['title']}",
                "",
                f"- Status: `{route['status']}`; surface: `{route.get('surface')}`",
            ]
        )
        if route.get("container_kind") == "hlib-gen2":
            lines.extend(
                [
                    f"- ECL: `{route['ecl_file']}` logical area `{route['ecl_area']}`; GEO: `{route['geo_file']}` logical area `{route['geo_area']}`",
                    f"- Reachable effect: `LOAD_FILES GEO {route.get('load_files_geo')}`",
                    f"- Engine test anchor: `{route.get('engine_test')}`",
                ]
            )
        elif route.get("container_kind") == "frua-dsn":
            entry = route.get("entry") or {}
            target = route.get("target") or {}
            lines.extend(
                [
                    f"- Design: `{route['design_dir']}`; module `{route['module_number']}`; entry `{entry.get('slot')}` at `({entry.get('x')},{entry.get('y')},{entry.get('facing')})`",
                    f"- Event: slot `{route.get('event_slot')}` at `({target.get('x')},{target.get('y')})` — {str(route.get('event_text', '')).rstrip()}",
                    f"- Engine test anchor: `{route.get('engine_test')}`",
                ]
            )
            question = route.get("question_button")
            if isinstance(question, dict):
                q_entry = question.get("entry") or {}
                q_target = question.get("target") or {}
                labels = " / ".join(question.get("decoded_labels", []))
                repeats = ", ".join(str(button) for button in question.get("repeat_question_buttons", [])) or "none"
                target_summary = "; ".join(
                    f"button {item.get('button')} -> slot {item.get('slot')} type {item.get('event_type')}"
                    f"{' once' if item.get('once_only') else ' repeatable'}"
                    for item in question.get("button_targets", [])
                )
                lines.extend(
                    [
                        f"- Question checkpoint: module `{question.get('module_number')}`; entry `{q_entry.get('slot')}` at "
                        f"`({q_entry.get('x')},{q_entry.get('y')},{q_entry.get('facing')})`; event slot "
                        f"`{question.get('event_slot')}` at `({q_target.get('x')},{q_target.get('y')})`",
                        f"- Question semantics: once-only `{str(question.get('once_only')).lower()}`; choices `{labels}`; "
                        f"return-to-question button(s) `{repeats}`",
                        f"- Question targets: {target_summary}",
                    ]
                )
            persistence = route.get("persistence")
            if isinstance(persistence, dict):
                lines.extend(
                    [
                        f"- Persistence: `{persistence.get('status')}`; SaveGame v{persistence.get('save_version')}; "
                        f"module-event state v{persistence.get('module_event_state_version')}; consumed ids "
                        f"`{persistence.get('consumed_event_ids')}`",
                        f"- Persistence tests: `{route.get('question_button', {}).get('geo_file')}` retail bytes via "
                        f"`{persistence.get('engine_test')}` plus browser/Electron save-reload acceptance",
                    ]
                )
        else:
            lines.extend(
                [
                    f"- ECL: `{route['ecl_file']}#{route['ecl_block']}` entry byte `{route['entry_offset']}`",
                    f"- Effects: `LOAD_FILES {route['load_files']}`; `LOAD_PIECES {route['load_pieces']}`; GEO block `{route['geo_block']}`",
                    f"- Engine test anchor: `{route.get('engine_test')}`",
                ]
            )
        failed = route.get("failed_checks", [])
        if failed:
            lines.append(f"- Failed checks: `{', '.join(failed)}`")
        monster = route.get("monster")
        if monster:
            lines.append(
                f"- Monster archive: `{monster['file']}`, records `{monster['records']}`, sizes `{monster['record_sizes']}`, layout `{monster['layout']}`"
            )
        lines.append("")

    matrix_games = [game for game in corpus["games"] if isinstance(game.get("campaign_matrix"), dict)]
    if matrix_games:
        lines.extend(
            [
                "## Campaign Matrix (BUILD-QUEUE.md item 6)",
                "",
                "Award rule: a game reaches `campaign` only on top of an already-`persistent` base",
                "(verified route byte-contract plus verified persistence contract) AND only when every",
                "one of the six early/middle/ending/town/wilderness/quest legs is `proven` or",
                "`structurally-absent` (a proven negative -- the content genuinely does not exist in the",
                "game's own retail data). `blocked` (investigated, genuinely unresolved), `not-tracked`",
                "(never part of that game's own matrix scope) and `not-investigated` (the work has simply",
                "not been done, so the leg is unevidenced in either direction) do NOT count as passing.",
                "Every Persistent game now carries a row: before 2026-08-03 this table listed only the",
                "games that had already passed, so a game with no row read the same as a game with no",
                "gaps. Source of truth: `tools/goldbox_campaign_matrix.json`; rule implementation:",
                "`tools/goldbox_corpus.py::load_campaign_matrix`/`evidence_level`.",
                "",
                "| Game | early | middle | ending | town | wilderness | quest | Campaign? |",
                "| --- | --- | --- | --- | --- | --- | --- | --- |",
            ]
        )
        for game in matrix_games:
            matrix = game["campaign_matrix"]
            legs = matrix.get("legs", {})
            cells = " | ".join(f"`{legs.get(leg, {}).get('status', '?')}`" for leg in ["early", "middle", "ending", "town", "wilderness", "quest"])
            verdict = "**yes**" if matrix.get("satisfied") else "no"
            lines.append(f"| {game['title']} | {cells} | {verdict} |")
        lines.append("")

    gap_counts = Counter(gap for game in corpus["games"] for gap in game["gaps"])
    lines.extend(["## Derived Substeps", ""])
    for gap, count in sorted(gap_counts.items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"- `{gap}`: {count} profile(s)")
    lines.extend(
        [
            "",
            "These gap labels are inputs to `BUILD-QUEUE.md`, not proof that every gap has already been",
            "split into an executable slice. The active milestone should promote the next dependency-bound",
            "gap into concrete research, implementation, and verification substeps.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", action="append", default=[], type=Path, help="Additional scan root; may be repeated.")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON, help=f"JSON output (default: {slash(DEFAULT_JSON.relative_to(REPO_ROOT))}).")
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN, help=f"Markdown output (default: {slash(DEFAULT_MARKDOWN.relative_to(REPO_ROOT))}).")
    parser.add_argument("--support-json", type=Path, default=DEFAULT_SUPPORT_JSON, help=f"Sanitized web evidence output (default: {slash(DEFAULT_SUPPORT_JSON.relative_to(REPO_ROOT))}).")
    parser.add_argument("--stdout", action="store_true", help="Print JSON instead of writing output files.")
    parser.add_argument("--strict", action="store_true", help="Fail when a detected game's declared route byte contract does not verify.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    corpus = build_corpus(args.root)
    payload = json.dumps(corpus, indent=2, sort_keys=True) + "\n"
    support_evidence = public_support_evidence(corpus)
    support_payload = json.dumps(support_evidence, indent=2, sort_keys=True) + "\n"
    claim_errors = validate_support_claims(support_evidence)
    if args.stdout:
        print(payload, end="")
    else:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.support_json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(payload, encoding="utf-8")
        args.markdown.write_text(markdown(corpus), encoding="utf-8")
        args.support_json.write_text(support_payload, encoding="utf-8")
        print(f"profiles: {corpus['summary']['profiles']}; detected: {corpus['summary']['detected']}; routes verified: {corpus['summary']['routes_verified']}")
        print(f"json: {slash(args.json)}")
        print(f"markdown: {slash(args.markdown)}")
        print(f"support evidence: {slash(args.support_json)}")
    if args.strict:
        failed = [game["profile_id"] for game in corpus["games"] if game["detected"] and game["route"]["declared"] and game["route"]["status"] != "verified-byte-contract"]
        if failed:
            print(f"strict route failures: {', '.join(failed)}")
            return 1
        if claim_errors:
            print("support claim drift:")
            for error in claim_errors:
                print(f"  - {error}")
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
