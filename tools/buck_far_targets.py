"""Attempt to resolve the seven `unresolved_relocated_segment` far-call targets that block
measuring Buck Rogers: Countdown to Doomsday's ECL opcodes `0x29`, `0x2c` and `0x42`
(`docs/engine/research/buck-ecl-desyncs.md`, `docs/engine/research/buck-ecl-dispatch-map.md`).

**THE CENTRAL HAZARD (round 30 R4).** `tools/vroomm_layout.py`'s `classify_lcall_routes` only
resolves an `lcall`'s relocatable segment word when that segment falls inside the small set of
per-descriptor "stub selector" values it infers (`stub_selector_geometry` / `infer_stub_selector_base`)
-- values on the order of a few hundred. Every one of Buck's seven blocking targets carries a large
segment (`0xbe4`, `0x653`, `0xb8`, `0x10f`) that is nowhere near that range, so `vroomm_layout.py`
correctly reports them `unresolved_relocated_segment` rather than guessing. This module's whole job
is to find, and independently VERIFY, a `seg:off -> GAME.OVR file offset` mapping for that same class
of large-segment call, calibrated against CoAB's `build/coab-oracle-map.json` (851 named, byte-grounded
functions) BEFORE it is ever pointed at Buck. Per the round's standing instruction: never carry an
uncalibrated mapping into Buck and report addresses from it.

**Method.** CoAB's own ECL command dispatcher (`commandTable`, oracle-named, so its file offset is
known exactly -- no fuzzy structural matching needed) is walked the same way
`tools/map_pool_ecl_dispatch.py::dispatch_table` walks Buck's: `cmp al,imm; call handler`. Each
handler is then disassembled (Capstone, real mode) from its own entry to its first `ret`/`retf`/`iret`
(a 1024-byte cap), collecting every `lcall`'s `(segment, offset)` operand pair. Any pair whose segment
sits outside CoAB's own inferred stub-selector range is, by definition, the same
`unresolved_relocated_segment` class Buck's seven targets belong to -- these are the calibration set.

For each of a battery of candidate `file_offset = segment * multiplier + offset + D` formulas
(multiplier in {1,2,4,8,16,32,...,256}), the best additive constant `D` is found by a plurality vote:
for every calibration pair and every one of the 851 oracle function offsets, tally the `D` that would
make that pair land exactly on that function; the most-voted `D` is then re-checked against every
calibration pair to count how many land on ANY of the 851 offsets (not just the one that produced the
vote). A formula counts as a working calibration only if it explains **>= 10 distinct calibration
pairs** this way (round 30's bar, chosen so the fit is well above the pure-chance rate: 851 functions
scattered across a ~272 KB file give roughly a 1-in-320 chance per (segment,offset,multiplier) guess,
so 851/272000 * (number of D values effectively tried) predicts a handful of accidental hits even
under a formula with no real relationship to the file -- the null this module reports alongside every
real fit).

If (and only if) a formula clears the bar, `resolve_buck_targets` applies it to Buck's own seven
targets and disassembles the landing spot. If no formula clears the bar, every Buck target is
reported `status: "unresolved"` with the reason and the fit table -- never a guessed address, per
the round's central hazard.

**Round 31 R1 correction.** The paragraph above (and round 30's whole section in
`docs/engine/research/buck-ecl-desyncs.md`) is right that the LINEAR calibration attempt failed --
but it is wrong as a claim about the seven targets themselves, because it never tried the resolver
`tools/vroomm_layout.py` already carries for a DIFFERENT, non-linear class of far call:
`classify_lcall_routes`'s own descriptor/public-stub-array geometry. That resolver already routes
Buck's own `0xb8:0x2a` operand-parser call (`stub_route_targets`/`buck_stub_geometry_resolution`
below) to `GAME.OVR:0x1ca15` -- byte-identical to the structurally-matched offset
`tools/map_buck_ecl_dispatch.py` found by an entirely independent method (Borland-prologue scan +
CoAB-oracle shape match) -- and CoAB's own `0x4c:0x2a` under the SAME geometry lands on the
oracle-named `@parse_command_sub$q4Byte` at `0x810a` exactly, with 229 of 240 distinct
`public_stub_owned` CoAB targets landing on a real oracle function start against a shifted null of
1/0/0/0 at +-1/+-16 bytes. Three of Buck's seven blocking targets (`0xb8:0x7f`, `0xb8:0xb6`,
`0x10f:0x4d`) are `public_stub_owned` under this SAME geometry and resolve cleanly; the other four
(`0xbe4:0x62a`, `0xbe4:0x1b2b`, `0x653:0x1359`, `0x653:0xe58`) sit on segments `vroomm_layout.py`
itself classifies `unresolved_relocated_segment` (resident code, not a descriptor's public stub
array) and stay genuinely unresolved -- `stub_route_targets`/`resolve_buck_targets` below never
guesses an address for those four. See `docs/engine/research/buck-ecl-desyncs.md`'s round-31
section for the full retraction and every number's null.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import goldbox_corpus
from map_pool_ecl_dispatch import FunctionShape, dispatch_table, disassemble_shape, oracle_offset

DEFAULT_ORACLE = goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/buck-far-targets.json"

# Buck's seven blocking targets, as `map_buck_ecl_dispatch.py::stop_reasons()` reports them
# (`docs/engine/research/buck-ecl-dispatch-map.md`'s "Far-call resolution attempt" table, `0x29`/
# `0x2c`/`0x42` rows -- line numbers there shift each regeneration, so cited by row, not line).
# Kept as a literal list (not re-derived here) so a change in the dispatch map is visible as a diff
# against this list rather than silently changing what gets "resolved".
BUCK_TARGETS: list[tuple[int, str, int, int]] = [
    (0x29, "0xbe4, 0x62a", 0xBE4, 0x62A),
    (0x29, "0xb8, 0x7f", 0xB8, 0x7F),
    (0x29, "0x653, 0x1359", 0x653, 0x1359),
    (0x2C, "0xbe4, 0x1b2b", 0xBE4, 0x1B2B),
    (0x2C, "0xbe4, 0x62a", 0xBE4, 0x62A),
    (0x2C, "0x10f, 0x4d", 0x10F, 0x4D),
    (0x42, "0x653, 0xe58", 0x653, 0xE58),
    (0x42, "0xb8, 0xb6", 0xB8, 0xB6),
]

MULTIPLIERS: list[int] = [1, 2, 4, 8, 16, 32, 64, 128, 256]
FIT_THRESHOLD = 10

# Round 31 R1 stub-geometry calibration points (see the module docstring's "Round 31 R1
# correction"). `tools/map_buck_ecl_dispatch.py`'s operand parser was located structurally
# (Borland-prologue scan + CoAB-oracle shape match) at this Buck GAME.OVR file offset --
# `docs/engine/research/buck-ecl-dispatch-map.md:8`. If `vroomm_layout.py`'s descriptor/public-stub
# geometry independently routes Buck's OWN `0xb8, 0x2a` far call to this SAME offset, the two
# methods agree and the geometry is trusted for Buck's other six targets too.
BUCK_OPERAND_PARSER_FILE_OFFSET = 0x1CA15
BUCK_PARSER_PAIR: tuple[int, int] = (0xB8, 0x2A)

# CoAB's own oracle-named operand parser (`@parse_command_sub$q4Byte`) is called the same way from
# CoAB's own dispatch handlers, at `4c, 2a` (CoAB's descriptor/offset numbering differs from
# Buck's, which is exactly why this is a calibration point and not an assumption). Expected value
# is CoAB's own oracle-published file offset for that function.
COAB_PARSE_COMMAND_SUB_PAIR: tuple[int, int] = (0x4C, 0x2A)
COAB_PARSE_COMMAND_SUB_EXPECTED = 0x810A

# Shifted-null offsets used to show the exact-address hits above are not a byte-alignment
# coincidence: how many DISTINCT `public_stub_owned` targets land on an oracle function start only
# after being shifted by this many bytes (and did NOT already land exactly).
NULL_SHIFTS: list[int] = [1, -1, 16, -16]


def retail_files() -> tuple[Path, Path]:
    """(buck_game_ovr, coab_game_ovr) -- same profile ids `map_buck_ecl_dispatch.retail_files` uses."""
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    paths: dict[str, Path] = {}
    for profile_id in ("buck-rogers-countdown-to-doomsday", "curse-of-the-azure-bonds"):
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        if install is None:
            raise FileNotFoundError(f"install not found: {profile_id}")
        files = goldbox_corpus.file_index(install)
        paths[profile_id] = files["GAME.OVR"]
    return paths["buck-rogers-countdown-to-doomsday"], paths["curse-of-the-azure-bonds"]


def handler_lcall_pairs(data: bytes, offset: int, max_size: int = 1024) -> list[tuple[int, int]]:
    """Every `lcall (segment, offset)` operand pair reached scanning from `offset` to the handler's
    first `ret`/`retf`/`iret` (or `max_size` bytes, whichever comes first). Unlike
    `map_buck_ecl_dispatch._first_far_call`, this collects ALL far calls in the handler, not just the
    first -- the calibration wants every large-segment call CoAB's own dispatcher body makes."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    pairs: list[tuple[int, int]] = []
    for ins in md.disasm(data[offset : offset + max_size], offset):
        if ins.mnemonic == "lcall" and len(ins.operands) == 2:
            seg_op, off_op = ins.operands
            if seg_op.type == capstone.x86.X86_OP_IMM and off_op.type == capstone.x86.X86_OP_IMM:
                pairs.append((seg_op.imm & 0xFFFF, off_op.imm & 0xFFFF))
        if ins.mnemonic in {"ret", "retf", "iret"}:
            break
    return pairs


def stub_selector_owned_segments(root: Path) -> set[int]:
    """The small set of segment values `vroomm_layout.classify_lcall_routes` can actually resolve
    for this game (selector_base + each descriptor's cumulative stub-geometry delta). Anything
    outside this set is, by `vroomm_layout.py`'s own logic, `unresolved_relocated_segment` --
    exactly the class this module calibrates against. Used only to LABEL the calibration pairs as
    genuinely unresolved (a sanity cross-check); the pairs themselves come from disassembling
    CoAB's dispatcher handlers directly, not from vroomm's fixup table."""
    import vroomm_layout
    import gen1_map

    loader_path = root / ("START.EXE" if (root / "START.EXE").exists() else "GAME.EXE")
    overlay_path = root / "GAME.OVR"
    loader = loader_path.read_bytes()
    overlay = overlay_path.read_bytes()
    descriptors = gen1_map.scan_descriptors(loader, overlay)
    layouts = vroomm_layout.descriptor_layouts(loader, overlay, descriptors)
    mz = gen1_map.parse_mz(loader)
    selector_base, _, _ = vroomm_layout.classify_lcall_routes(loader, overlay, mz, layouts)
    if selector_base is None:
        return set()
    geometry = vroomm_layout.stub_selector_geometry(layouts)
    return {(selector_base + delta) & 0xFFFF for delta, _ in geometry}


def _stub_route_lookup(
    root: Path,
) -> tuple[dict[tuple[int, int], Any], int | None, int, int, list[Any]]:
    """Run `vroomm_layout.classify_lcall_routes` for `root` and index every `lcall_segment` fixup
    entry it finds by the exact `(original_segment, call_target_offset)` pair the instruction
    itself encodes -- the SAME pair `handler_lcall_pairs`/`BUCK_TARGETS` extract by disassembling
    handler bodies directly, so a target found by either method looks the same key here. When more
    than one occurrence of a pair exists (the same far call made from multiple call sites), a
    `public_stub_owned` classification wins over any other route_kind recorded for that pair.
    Returns (lookup, selector_base, selector_score, selector_runner_up_score, layouts)."""
    import vroomm_layout
    import gen1_map

    loader_path = root / ("START.EXE" if (root / "START.EXE").exists() else "GAME.EXE")
    overlay_path = root / "GAME.OVR"
    loader = loader_path.read_bytes()
    overlay = overlay_path.read_bytes()
    descriptors = gen1_map.scan_descriptors(loader, overlay)
    layouts = vroomm_layout.descriptor_layouts(loader, overlay, descriptors)
    mz = gen1_map.parse_mz(loader)
    selector_base, score, runner_up = vroomm_layout.classify_lcall_routes(loader, overlay, mz, layouts)

    lookup: dict[tuple[int, int], Any] = {}
    for row in layouts:
        for entry in row.fixup_entries:
            if entry.context != "lcall_segment" or entry.call_target_offset is None:
                continue
            key = (entry.original_segment, entry.call_target_offset)
            existing = lookup.get(key)
            if existing is None or (entry.route_kind == "public_stub_owned" and existing.route_kind != "public_stub_owned"):
                lookup[key] = entry
    return lookup, selector_base, score, runner_up, layouts


def coab_stub_geometry_calibration(coab_root: Path, oracle_offsets: set[int]) -> dict[str, Any]:
    """Calibration point (a)+(b) from the round-31 finding: verify `vroomm_layout.py`'s OWN
    descriptor/public-stub geometry (not the linear-fit method above, which already failed) routes
    CoAB's `0x4c, 0x2a` operand-parser call to the oracle's own `@parse_command_sub$q4Byte` offset
    exactly, and that this is true of `public_stub_owned` targets broadly (229/240 landing on a
    real oracle function start), against a shifted null that shows the exact alignment is not a
    coincidence of byte spacing."""
    lookup, selector_base, score, runner_up = _stub_route_lookup(coab_root)[:4]
    owned = {key: entry for key, entry in lookup.items() if entry.route_kind == "public_stub_owned"}
    distinct_targets = sorted({entry.target_ovr_file_offset for entry in owned.values() if entry.target_ovr_file_offset is not None})
    on_oracle = [target for target in distinct_targets if target in oracle_offsets]

    calibration_entry = lookup.get(COAB_PARSE_COMMAND_SUB_PAIR)
    parse_command_sub_actual = (
        calibration_entry.target_ovr_file_offset
        if calibration_entry is not None and calibration_entry.route_kind == "public_stub_owned"
        else None
    )
    parse_command_sub_matches = parse_command_sub_actual == COAB_PARSE_COMMAND_SUB_EXPECTED

    shifted_null = {}
    for shift in NULL_SHIFTS:
        shifted_null[str(shift)] = sum(
            1 for target in distinct_targets if target not in oracle_offsets and (target + shift) in oracle_offsets
        )

    return {
        "selector_base": selector_base,
        "selector_score": score,
        "selector_runner_up_score": runner_up,
        "distinct_public_stub_owned_targets": len(distinct_targets),
        "on_oracle_count": len(on_oracle),
        "parse_command_sub_pair": f"0x{COAB_PARSE_COMMAND_SUB_PAIR[0]:x}, 0x{COAB_PARSE_COMMAND_SUB_PAIR[1]:x}",
        "parse_command_sub_expected_file_offset": f"0x{COAB_PARSE_COMMAND_SUB_EXPECTED:x}",
        "parse_command_sub_actual_file_offset": (
            f"0x{parse_command_sub_actual:x}" if parse_command_sub_actual is not None else None
        ),
        "parse_command_sub_matches": parse_command_sub_matches,
        "shifted_null": shifted_null,
    }


def disassemble_callee(data: bytes, offset: int, max_size: int = 1024) -> list[dict[str, Any]]:
    """Disassemble from `offset` to its first `ret`/`retf`/`iret` (or `max_size` bytes),
    returning every instruction -- used to publish the actual bytes at a stub-geometry-resolved
    target, not just its address, so a reviewer can check the resolution against real code."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    out: list[dict[str, Any]] = []
    for ins in md.disasm(data[offset : offset + max_size], offset):
        out.append({"address": f"0x{ins.address:x}", "mnemonic": ins.mnemonic, "op_str": ins.op_str})
        if ins.mnemonic in {"ret", "retf", "iret"}:
            break
    return out


def buck_stub_geometry_resolution(buck_root: Path, buck: bytes | None = None) -> dict[str, Any]:
    """Calibration point (c): verify the SAME geometry routes Buck's own `0xb8, 0x2a` operand-parser
    call to `BUCK_OPERAND_PARSER_FILE_OFFSET` (the structurally-matched offset
    `map_buck_ecl_dispatch.py` found independently). If (and only if) that holds, resolve each of
    `BUCK_TARGETS` through the SAME lookup -- never through a formula, never guessed."""
    lookup, selector_base, score, runner_up, _layouts = _stub_route_lookup(buck_root)
    parser_entry = lookup.get(BUCK_PARSER_PAIR)
    parser_actual = (
        parser_entry.target_ovr_file_offset
        if parser_entry is not None and parser_entry.route_kind == "public_stub_owned"
        else None
    )
    calibration_ok = parser_actual == BUCK_OPERAND_PARSER_FILE_OFFSET

    resolved_targets: dict[str, dict[str, Any]] = {}
    for _opcode, op_str, seg, off in BUCK_TARGETS:
        if op_str in resolved_targets:
            continue
        entry = lookup.get((seg, off))
        if entry is not None and entry.route_kind == "public_stub_owned" and entry.target_ovr_file_offset is not None:
            row: dict[str, Any] = {
                "route_kind": entry.route_kind,
                "descriptor_index": entry.target_descriptor_index,
                "stub_index": entry.target_stub_index,
                "proc_offset": entry.target_proc_offset,
                "file_offset": f"0x{entry.target_ovr_file_offset:x}",
            }
            if buck is not None:
                row["disassembly"] = disassemble_callee(buck, entry.target_ovr_file_offset)
        else:
            row = {"route_kind": entry.route_kind if entry is not None else "not_found_in_fixup_table"}
        resolved_targets[op_str] = row

    return {
        "selector_base": selector_base,
        "selector_score": score,
        "selector_runner_up_score": runner_up,
        "parser_pair": f"0x{BUCK_PARSER_PAIR[0]:x}, 0x{BUCK_PARSER_PAIR[1]:x}",
        "parser_expected_file_offset": f"0x{BUCK_OPERAND_PARSER_FILE_OFFSET:x}",
        "parser_actual_file_offset": f"0x{parser_actual:x}" if parser_actual is not None else None,
        "calibration_ok": calibration_ok,
        "resolved_targets": resolved_targets,
    }


def coab_calibration_pairs(coab: bytes, oracle: dict[str, Any]) -> tuple[list[tuple[int, int]], dict[str, Any]]:
    """Distinct `(segment, offset)` pairs from every `lcall` inside CoAB's own dispatch handlers,
    resolved via the oracle's exact `commandTable` offset (no fuzzy matching needed -- CoAB IS the
    oracle). Also returns provenance: handler count, total lcall sites, distinct pairs."""
    dispatcher_offset = oracle_offset(oracle, "commandTable")
    dispatcher_shape = disassemble_shape(coab, dispatcher_offset)
    if dispatcher_shape is None:
        raise ValueError(f"could not disassemble CoAB commandTable at 0x{dispatcher_offset:x}")
    rows = dispatch_table(coab, dispatcher_shape)
    all_pairs: list[tuple[int, int]] = []
    for row in rows:
        all_pairs.extend(handler_lcall_pairs(coab, row["handler_file_offset"]))
    distinct = sorted(set(all_pairs))
    provenance = {
        "dispatcher_offset": dispatcher_offset,
        "handler_count": len(rows),
        "lcall_sites_total": len(all_pairs),
        "distinct_pairs": len(distinct),
    }
    return distinct, provenance


def fit_formula(
    pairs: list[tuple[int, int]], oracle_offsets: set[int], multiplier: int
) -> tuple[int | None, int, dict[tuple[int, int], bool]]:
    """Plurality-vote the additive constant `D` (over `file_offset = seg*multiplier + off + D`)
    that lands the most calibration pairs on a real oracle function offset, then report exactly how
    many of ALL calibration pairs that single `D` explains (not just the ones that voted for it)."""
    votes: Counter[int] = Counter()
    for seg, off in pairs:
        base = seg * multiplier + off
        for target in oracle_offsets:
            votes[target - base] += 1
    if not votes:
        return None, 0, {}
    best_d, _ = votes.most_common(1)[0]
    hits = {(seg, off): (seg * multiplier + off + best_d) in oracle_offsets for seg, off in pairs}
    return best_d, sum(hits.values()), hits


def calibration_fit_table(
    pairs: list[tuple[int, int]], oracle_offsets: set[int]
) -> list[dict[str, Any]]:
    table = []
    for multiplier in MULTIPLIERS:
        best_d, hits, per_pair = fit_formula(pairs, oracle_offsets, multiplier)
        table.append(
            {
                "multiplier": multiplier,
                "best_additive_constant": best_d,
                "hits": hits,
                "total_pairs": len(pairs),
                "hit_pairs": [f"0x{seg:x}:0x{off:x}" for (seg, off), hit in per_pair.items() if hit],
            }
        )
    return table


def holdout_null_check(
    pairs: list[tuple[int, int]], oracle_offsets: set[int]
) -> dict[str, Any]:
    """Nulls/mutations (iv): fit on all-but-the-last-10 distinct pairs, then apply that SAME formula
    to the reserved 10 (or fewer, if there are not 10 to reserve) and report how many land -- a
    formula that only fits the pairs it was voted from, and lands nothing new, is not a real mapping.
    """
    if len(pairs) <= FIT_THRESHOLD:
        return {"status": "too_few_pairs_to_hold_out", "total_pairs": len(pairs)}
    ordered = sorted(pairs)
    holdout = ordered[-FIT_THRESHOLD:]
    train = ordered[: -FIT_THRESHOLD]
    results = []
    for multiplier in MULTIPLIERS:
        best_d, train_hits, _ = fit_formula(train, oracle_offsets, multiplier)
        if best_d is None:
            continue
        holdout_hits = sum(
            (seg * multiplier + off + best_d) in oracle_offsets for seg, off in holdout
        )
        results.append(
            {
                "multiplier": multiplier,
                "additive_constant": best_d,
                "train_hits": train_hits,
                "train_total": len(train),
                "holdout_hits": holdout_hits,
                "holdout_total": len(holdout),
            }
        )
    return {"train_size": len(train), "holdout_size": len(holdout), "results": results}


def resolve_buck_targets(
    buck: bytes,
    fit_table: list[dict[str, Any]],
    stub_resolution: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Resolve Buck's seven targets by trying TWO independently-calibrated methods, in order:

    1. Round 31 R1's stub-geometry route (`buck_stub_geometry_resolution`) -- preferred when
       `stub_resolution["calibration_ok"]` is true (calibration point (c) from the module
       docstring held), because it is a structural match to how the game itself resolves these
       calls, not a fitted formula.
    2. Round 30 R4's linear-fit route -- unchanged from before, tried only for whatever the stub
       route did not resolve, and only IF AND ONLY IF some formula cleared `FIT_THRESHOLD` on CoAB.

    Whatever neither method reaches is reported `status: "unresolved"` -- never a guessed address
    from an uncalibrated mapping (the round's central hazard, unchanged)."""
    winner = max(fit_table, key=lambda row: row["hits"], default=None)
    calibrated = winner is not None and winner["hits"] >= FIT_THRESHOLD
    stub_ok = bool(stub_resolution and stub_resolution.get("calibration_ok"))
    stub_targets: dict[str, Any] = stub_resolution.get("resolved_targets", {}) if stub_ok else {}

    results = []
    for opcode, op_str, seg, off in BUCK_TARGETS:
        row: dict[str, Any] = {"opcode": f"0x{opcode:02x}", "target": op_str, "segment": seg, "offset": off}
        stub_row = stub_targets.get(op_str)
        if stub_ok and stub_row is not None and stub_row.get("route_kind") == "public_stub_owned":
            row["status"] = "resolved"
            row["resolution_method"] = "stub_geometry"
            row["file_offset"] = stub_row["file_offset"]
            row["descriptor_index"] = stub_row["descriptor_index"]
            row["stub_index"] = stub_row["stub_index"]
            row["proc_offset"] = stub_row["proc_offset"]
            file_offset_int = int(stub_row["file_offset"], 16)
            row["first_bytes_hex"] = buck[file_offset_int : file_offset_int + 16].hex() if 0 <= file_offset_int < len(buck) else None
            if "disassembly" in stub_row:
                row["disassembly"] = stub_row["disassembly"]
            results.append(row)
            continue
        if not calibrated:
            row["status"] = "unresolved"
            row["resolution_method"] = "unresolved"
            row["reason"] = (
                f"not `public_stub_owned` under stub geometry "
                f"(route: {stub_row.get('route_kind') if stub_row else 'not_found_in_fixup_table'}); "
                f"CoAB linear-fit calibration also did not clear the >= {FIT_THRESHOLD}-call bar "
                f"(best: multiplier={winner['multiplier'] if winner else None}, "
                f"hits={winner['hits'] if winner else 0}/{winner['total_pairs'] if winner else 0})"
            )
            # Report, but do not claim, what the best (still-failing) linear formula would guess --
            # for transparency only, exactly parallel to the plan document's own byte dump at these
            # same addresses (PLAN-ROUND-30.md's R4 section) which is not treated as resolution.
            if winner is not None and winner["best_additive_constant"] is not None:
                guess = seg * winner["multiplier"] + off + winner["best_additive_constant"]
                row["unverified_naive_guess_file_offset"] = f"0x{guess:x}" if 0 <= guess < 1 << 24 else None
            results.append(row)
            continue
        assert winner is not None
        guess = seg * winner["multiplier"] + off + winner["best_additive_constant"]
        row["status"] = "resolved"
        row["resolution_method"] = "linear_fit"
        row["file_offset"] = f"0x{guess:x}"
        row["multiplier"] = winner["multiplier"]
        row["additive_constant"] = winner["best_additive_constant"]
        row["first_bytes_hex"] = buck[guess : guess + 16].hex() if 0 <= guess < len(buck) else None
        results.append(row)
    return results


def build_report(oracle_path: Path = DEFAULT_ORACLE) -> dict[str, Any]:
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    oracle_offsets = {int(item["retail_file_offset"]) for item in oracle["functions"]}
    buck_path, coab_path = retail_files()
    buck = buck_path.read_bytes()
    coab = coab_path.read_bytes()

    pairs, provenance = coab_calibration_pairs(coab, oracle)

    coab_root = coab_path.parent
    buck_root = buck_path.parent
    owned_coab = stub_selector_owned_segments(coab_root)
    owned_buck = stub_selector_owned_segments(buck_root)
    outside_owned = [pair for pair in pairs if pair[0] not in owned_coab]
    provenance["pairs_outside_stub_selector_range"] = len(outside_owned)
    provenance["stub_selector_owned_segment_count_coab"] = len(owned_coab)

    buck_target_segments = {seg for _, _, seg, _ in BUCK_TARGETS}
    provenance["buck_target_segments_outside_buck_stub_selector_range"] = sorted(
        f"0x{seg:x}" for seg in buck_target_segments if seg not in owned_buck
    )

    fit_table = calibration_fit_table(pairs, oracle_offsets)
    holdout = holdout_null_check(pairs, oracle_offsets)

    coab_stub_calibration = coab_stub_geometry_calibration(coab_root, oracle_offsets)
    buck_stub_resolution = buck_stub_geometry_resolution(buck_root, buck)
    stub_resolution = buck_stub_resolution if coab_stub_calibration.get("parse_command_sub_matches") else None

    buck_targets = resolve_buck_targets(buck, fit_table, stub_resolution)

    winner = max(fit_table, key=lambda row: row["hits"], default=None)
    calibrated = winner is not None and winner["hits"] >= FIT_THRESHOLD

    return {
        "schema_version": 2,
        "buck_path": goldbox_corpus.slash(str(buck_path)),
        "coab_path": goldbox_corpus.slash(str(coab_path)),
        "fit_threshold": FIT_THRESHOLD,
        "calibration_provenance": provenance,
        "calibration_pairs": [f"0x{seg:x}:0x{off:x}" for seg, off in pairs],
        "fit_table": fit_table,
        "holdout_null_check": holdout,
        "calibration_status": "calibrated" if calibrated else "landable_negative",
        "calibration_summary": (
            f"Best fit: multiplier={winner['multiplier'] if winner else None}, "
            f"hits={winner['hits'] if winner else 0}/{len(pairs)} distinct CoAB calibration pairs "
            f"(threshold {FIT_THRESHOLD})."
            + (
                ""
                if calibrated
                else " No formula reached the threshold -- this is a landable negative, not a"
                " resolution. No Buck target below is reported as a resolved address from this"
                " linear-fit mapping (round 31 R1's stub-geometry mapping below is a separate,"
                " non-linear method and is not affected by this negative)."
            )
        ),
        "coab_stub_geometry_calibration": coab_stub_calibration,
        "buck_stub_geometry_resolution": buck_stub_resolution,
        "buck_targets": buck_targets,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    args = parser.parse_args()
    report = build_report(args.oracle)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(report["calibration_summary"])
    print(f"Wrote {args.json}")


if __name__ == "__main__":
    main()
