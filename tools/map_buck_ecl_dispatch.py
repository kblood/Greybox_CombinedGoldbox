"""Map Buck Rogers: Countdown to Doomsday's ECL dispatcher, operand parser, and per-opcode
operand word sets from its own real `GAME.OVR` bytes.

Buck is the only detected DOS title with NO ECL dialect verified against its own binary
(`tools/gen1_ecl_encounter_scan.py`'s `PROFILE_WORD_SETS` and
`packages/engine/src/ecl/disassemble.ts`'s `ECL_GEN1_SHORT*` dialects cover DoK/Gateway/
Treasures/Pools; Buck has none). This tool applies the same technique
`tools/map_pool_ecl_dispatch.py` and `tools/map_dok_ecl_dispatch.py` use (same-subsystem
structural function matching against the shared CoAB oracle, `build/coab-oracle-map.json`)
to Buck's own `GAME.OVR`, and adds one capability neither of those needed: **per-opcode
operand-count extraction straight from each handler's own prefetch call**, the same evidence
class `docs/engine/research/dok-natural-route.md`'s 2026-07-23 operand-table audit used for
DoK (`vm_LoadCmdSets(N)`'s `mov al,N; push ax; lcall <target>` prologue). Buck was never a
correlation-pipeline member (`build/vroomm-call-correlations.json`'s `caller_profiles` does not
include it), so the DoK/Pool tools' `correlated_pool_target` shortcut is unavailable here — the
operand-parser call target is instead *derived* from Buck's own dispatch table (the single far-call
target that is the FIRST `lcall` inside a majority of Buck's own handlers), never hard-coded.

Buck's `GAME.OVR` carries the `TPOV` magic (`tools/gen1_map.py`), not `FBOV` like CoAB/Pool/DoK —
so this is also the first exercise of the structural-match method against a `TPOV` overlay. The
4-byte-vs-8-byte overlay descriptor header is a *loader* difference; it says nothing about whether
the compiled command-dispatch function bodies inside the overlay match CoAB's shape, which is the
only thing this tool measures.

Two-sided by construction: `build_report` never invents a word set. Opcodes whose handler does not
call the derived operand-parser target before its first `ret`/`retf` are reported as
`measured_word_set: null`, not defaulted to a guessed table value.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from typing import Any

import goldbox_corpus
from map_pool_ecl_dispatch import (
    FunctionShape,
    dispatch_table,
    disassemble_shape,
    nearest_function,
    oracle_offset,
)

DEFAULT_ORACLE = goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/buck-ecl-dispatch-map.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/buck-ecl-dispatch-map.md"

# Literal copies of the two dialects the shared engine already carries, so this tool can compare
# Buck's own measured word sets against them without importing TypeScript. Keep these in sync with
# their sources by hand -- `tools/gen1_ecl_encounter_scan.py` already does the same thing for the
# same reason (no cross-language import) and cites the same two files.
#
#   * LONG_WORD_SETS: packages/engine/src/ecl/opcodes.ts `KRYNN_GEN1_OPCODES` (the base/"long"
#     Pool-of-Radiance/CoAB/Secret/CoK dialect `ECL_GEN1` uses as-is).
#   * SHORT_OVERRIDES: packages/engine/src/ecl/disassemble.ts `ECL_GEN1_SHORT.wordSetOverrides`
#     (DoK/Gateway/Treasures/Pools' 1991+ "short form" deltas on top of the same base table).
LONG_WORD_SETS: dict[int, int] = {
    0x00: 0, 0x01: 1, 0x02: 1, 0x03: 2, 0x04: 3, 0x05: 3, 0x06: 3, 0x07: 3, 0x08: 2, 0x09: 2,
    0x0A: 1, 0x0B: 3, 0x0C: 3, 0x0D: 0, 0x0E: 1, 0x0F: 2, 0x10: 2, 0x11: 1, 0x12: 1, 0x13: 0,
    0x14: 4, 0x15: 3, 0x16: 0, 0x17: 0, 0x18: 0, 0x19: 0, 0x1A: 0, 0x1B: 0, 0x1C: 0, 0x1D: 1,
    0x1E: 6, 0x1F: 2, 0x20: 1, 0x21: 3, 0x22: 2, 0x23: 4, 0x24: 0, 0x25: 2, 0x26: 2, 0x27: 8,
    0x28: 3, 0x29: 14, 0x2A: 3, 0x2B: 2, 0x2C: 6, 0x2D: 1, 0x2E: 5, 0x2F: 3, 0x30: 3, 0x31: 0,
    0x32: 1, 0x33: 0, 0x34: 2, 0x35: 3, 0x36: 2, 0x37: 3, 0x38: 1, 0x39: 1, 0x3A: 0, 0x3B: 3,
    0x3C: 1, 0x3D: 0, 0x3E: 0, 0x3F: 1, 0x40: 1,
    # 0x41 added 2026-09-10: round 34 Phase B put it in the engine's shared base table after
    # seven binaries agreed on `mov al,2`, and this mirror stopped at 0x40 for six days. While
    # it did, every title's own measured `0x41 = 2` was reported as a DESYNC against a `None`.
    0x41: 2,
}
SHORT_OVERRIDES: dict[int, int] = {0x0C: 4, 0x1D: 0, 0x22: 0, 0x23: 0, 0x2C: 1}


def retail_files() -> tuple[Path, Path]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    paths: dict[str, Path] = {}
    for profile_id in ("buck-rogers-countdown-to-doomsday", "curse-of-the-azure-bonds"):
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        if install is None:
            raise FileNotFoundError(f"install not found: {profile_id}")
        files = goldbox_corpus.file_index(install)
        paths[profile_id] = files["GAME.OVR"]
    return paths["buck-rogers-countdown-to-doomsday"], paths["curse-of-the-azure-bonds"]


def resolve_fallthrough_dispatch(
    data: bytes, function: FunctionShape, missing_opcodes: set[int]
) -> dict[int, int]:
    """Recover opcode -> handler mappings `dispatch_table`'s linear `cmp al,imm; call H` scan
    cannot see because the compiler MERGED that opcode's case body into an adjacent opcode's
    handler, emitting a `cmp/je`-or-`jne` fallthrough chain instead of its own immediate call.

    Found by hand while investigating why Buck's own corpus preferred `ECL_GEN1_SHORT_POOLS`'s
    `0x21: 2` override on raw desync count: opcode `0x21`'s comparison at Buck file offset 0x3803
    is `cmp al,0x21; je 0x380b`, and 0x380b is the SAME `push cs; call 0x165f` that opcode 0x37's
    OWN `cmp al,0x37; jne 0x3812` falls into when equal -- i.e. Buck's compiler folded 0x21 and
    0x37 into one shared handler body, exactly the pattern `disassemble.ts` already documents for
    Gen2's `0x2b`/`0x31` MENU pair and this file's own 0x22/0x23 (both already visible to the plain
    scanner because 0x23's handler passes a literal `mov al,1` discriminator before its call).
    Applying the same forward walk to every opcode in `missing_opcodes` recovers 12 of Buck's 14
    (all but `0x1f`, `0x3b`), and every recovered opcode lands on the handler ALREADY assigned to
    its immediate numeric neighbor by the plain scanner -- `0x04..0x06 -> 0x07`'s handler,
    `0x11 -> 0x12`'s, `0x16..0x1a -> 0x1b`'s, `0x21 -> 0x37`'s, `0x25 -> 0x26`'s, `0x2f -> 0x30`'s
    -- a consistent, semantically plausible grouping (arithmetic ops, PRINT/PRINTCLEAR, the six
    IF_* comparisons, ON_GOTO/ON_GOSUB, AND/OR), not a coincidental nearby call.

    Bounded to a short forward walk (<=6 instructions, aborting on a second `cmp` before any
    `call`) so a resolution is only credited when a handler is reached with NO intervening opcode
    comparison -- the structural signature of a true merge, not a guess.
    """
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    insns = list(md.disasm(data[function.offset:function.offset + function.size], function.offset))
    by_addr = {ins.address: ins for ins in insns}
    addrs = sorted(by_addr)
    idx_of = {addr: i for i, addr in enumerate(addrs)}

    def call_forward(addr: int, max_lookahead: int = 6) -> int | None:
        if addr not in idx_of:
            return None
        start = idx_of[addr]
        for j in range(start, min(start + max_lookahead, len(addrs))):
            ins = by_addr[addrs[j]]
            if ins.mnemonic == "call" and ins.operands and ins.operands[0].type == capstone.x86.X86_OP_IMM:
                return ins.operands[0].imm
            if ins.mnemonic == "cmp":
                return None
        return None

    resolved: dict[int, int] = {}
    for i, ins in enumerate(insns):
        if ins.mnemonic != "cmp" or len(ins.operands) != 2 or i + 1 >= len(insns):
            continue
        left, right = ins.operands
        if not (
            left.type == capstone.x86.X86_OP_REG
            and ins.reg_name(left.reg) == "al"
            and right.type == capstone.x86.X86_OP_IMM
        ):
            continue
        opcode = right.imm & 0xFF
        if opcode not in missing_opcodes:
            continue
        following = insns[i + 1]
        handler: int | None = None
        if following.mnemonic == "je" and following.operands and following.operands[0].type == capstone.x86.X86_OP_IMM:
            handler = call_forward(following.operands[0].imm)
        elif following.mnemonic == "jne":
            handler = call_forward(following.address + following.size)
        if handler is not None:
            resolved[opcode] = handler
    return resolved


def _first_far_call(data: bytes, offset: int, max_size: int = 1024) -> str | None:
    """The `op_str` of the first `lcall` instruction reached from `offset`, scanning until a
    ret/retf/iret or `max_size` bytes. None if the handler returns without ever making a far call."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    for ins in md.disasm(data[offset:offset + max_size], offset):
        if ins.mnemonic == "lcall":
            return ins.op_str
        if ins.mnemonic in {"ret", "retf", "iret"}:
            return None
    return None


def derive_operand_parser_call_target(
    data: bytes, dispatch_rows: list[dict[str, int]], min_share: float = 0.5
) -> tuple[str, int, int]:
    """Find the operand-parser's far-call signature (`seg, off` as capstone renders it) as the
    single most common FIRST `lcall` target across all dispatched handlers.

    This is deliberately not hard-coded: Buck was never run through the VROOMM correlation
    pipeline (`correlated_pool_target` in map_pool_ecl_dispatch.py has no Buck rows to match), so
    the only available identifier is the handlers' own shared behavior -- nearly every Gen1
    command handler's very first action is to tell the operand parser how many argument sets to
    load. Returns (target, count_as_first, total_handlers). Raises if no target reaches
    `min_share` of handlers, since a plurality winner below that bar is not good evidence of a
    shared convention.
    """
    counts: Counter[str] = Counter()
    total = 0
    for row in dispatch_rows:
        target = _first_far_call(data, row["handler_file_offset"])
        total += 1
        if target is not None:
            counts[target] += 1
    if not counts:
        raise ValueError("no handler makes any far call -- cannot derive an operand-parser target")
    target, count = counts.most_common(1)[0]
    if count / total < min_share:
        raise ValueError(
            f"no operand-parser call target reaches {min_share:.0%} of handlers "
            f"(best: {target!r} at {count}/{total})"
        )
    return target, count, total


def operand_word_sets(
    data: bytes, dispatch_rows: list[dict[str, int]], call_target: str, max_size: int = 600
) -> dict[int, int | None]:
    """For each dispatched opcode, the operand count `N` its handler passes to the operand parser
    (the immediate loaded into AL immediately before the first `push ax; lcall <call_target>`),
    scanning from the handler's own entry to its first ret/retf/iret. `None` when the handler never
    reaches `call_target` before returning -- most commonly a genuinely zero-operand opcode, but
    reported as unmeasured rather than assumed to be exactly zero (a handler could also branch
    around the call on some other path within the scan window).
    """
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    results: dict[int, int | None] = {}
    for row in dispatch_rows:
        offset = row["handler_file_offset"]
        pending_al: int | None = None
        found: int | None = None
        for ins in md.disasm(data[offset:offset + max_size], offset):
            if ins.mnemonic == "mov" and len(ins.operands) == 2:
                left, right = ins.operands
                if (
                    left.type == capstone.x86.X86_OP_REG
                    and ins.reg_name(left.reg) == "al"
                    and right.type == capstone.x86.X86_OP_IMM
                ):
                    pending_al = right.imm & 0xFF
            if ins.mnemonic == "lcall" and ins.op_str == call_target:
                found = pending_al
                break
            if ins.mnemonic in {"ret", "retf", "iret"}:
                break
        results[row["opcode"]] = found
    return results


def stop_reasons(
    data: bytes,
    dispatch_rows: list[dict[str, int]],
    measured: dict[int, int | None],
    call_target: str,
    max_size: int = 600,
) -> dict[int, dict[str, Any]]:
    """For every opcode `operand_word_sets` left `None`, explain WHY its handler never reached
    `call_target` -- R6 (2026-09-03), added to attribute Buck's 7 pinned ECL desyncs to specific
    handlers instead of leaving "Unmeasured" as an unexplained dead end. Scans the same window
    `operand_word_sets` uses (handler entry to the first ret/retf/iret, or `max_size` bytes) and
    sorts into three disjoint, two-sided-by-construction buckets:

      - `no_far_call`: the handler makes NO far call at all before returning -- the strongest
        possible structural evidence of a genuinely zero-operand opcode, since there is no
        mechanism left inside the handler by which it could consume ECL script bytes. Verified
        real examples: `0x3c` (file `0x2d5a`, a pure `push bp;mov bp,sp;mov sp,bp;pop bp;retf`
        no-op) and `0x44`/`0x47`/`0x4a` (beyond-0x40 extensions that only touch fixed engine
        globals, never the ECL operand stream).
      - `different_far_call_target`: the handler calls one or more OTHER far routines before
        returning -- it may consume operands through an unidentified alternate mechanism, so
        "reason unmeasured" must NOT be read as "reason zero". Verified real example: `0x29`
        ENCOUNTER_MENU (file `0x2646`) calls three different far routines
        (`0xbe4:0x62a`, `0xb8:0x7f`, `0x653:0x1359`) and visibly builds dynamic menu content --
        this is the handler directly upstream of the `ecl6.dax#94@0x50` and (after the `0x4c`
        fix) `ecl1.dax#17@0xec` desync sites; its true word set stays unmodelled this round.
      - `ran_past_scan_window`: neither `call_target` nor a ret/retf/iret turned up within
        `max_size` bytes -- inconclusive; widen the scan to resolve.

    Opcodes with a real measured value are omitted (nothing to explain). Never invents a word
    set -- this function only classifies the absence of one, the same claim boundary
    `operand_word_sets` itself keeps.
    """
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    reasons: dict[int, dict[str, Any]] = {}
    for row in dispatch_rows:
        opcode = row["opcode"]
        if measured.get(opcode) is not None:
            continue
        offset = row["handler_file_offset"]
        far_targets: list[str] = []
        reached_ret = False
        for ins in md.disasm(data[offset:offset + max_size], offset):
            if ins.mnemonic == "lcall" and ins.op_str != call_target and ins.op_str not in far_targets:
                far_targets.append(ins.op_str)
            if ins.mnemonic in {"ret", "retf", "iret"}:
                reached_ret = True
                break
        if far_targets:
            reason = "different_far_call_target"
        elif reached_ret:
            reason = "no_far_call"
        else:
            reason = "ran_past_scan_window"
        reasons[opcode] = {"reason": reason, "far_call_targets": far_targets[:3]}
    return reasons


def far_call_resolution_summary(
    reasons: dict[int, dict[str, Any]], far_report: dict[str, Any] | None = None
) -> dict[int, dict[str, Any]]:
    """Round 30 R4's new column: for every `different_far_call_target` opcode, cross-reference its
    far call targets against `tools/buck_far_targets.py`'s CoAB-calibrated resolution attempt for
    Buck's seven blocking far-call targets. Deliberately does NOT add keys to `stop_reasons()`'s own
    per-opcode dict -- that function's existing pins (`tools/test_map_buck_ecl_dispatch.py`) stay
    untouched, since none of their `reason`/`far_call_targets` values changed this round. This is
    purely an ADDITIONAL report column, keyed the same way (`str(opcode)` when serialized to JSON).

    `buck_far_targets.build_report()`'s CoAB calibration is a landable negative (best fit well under
    its 10-call bar, and the winning constant does not generalize to a held-out slice of CoAB's own
    calls either -- see that module's docstring and `docs/engine/research/buck-ecl-desyncs.md`'s
    dated appendix), so every target below comes back `status: "unresolved"`; nothing here reports a
    resolved operand count from an uncalibrated mapping.
    """
    if far_report is None:
        import buck_far_targets

        far_report = buck_far_targets.build_report()
    by_target = {row["target"]: row for row in far_report["buck_targets"]}
    summary: dict[int, dict[str, Any]] = {}
    for opcode, info in reasons.items():
        if info["reason"] != "different_far_call_target":
            continue
        target_rows = []
        for target_str in info["far_call_targets"]:
            row = by_target.get(target_str)
            target_rows.append(
                row if row is not None else {"target": target_str, "status": "not_attempted_this_round"}
            )
        target_statuses = {row["status"] for row in target_rows}
        summary[opcode] = {
            "targets": target_rows,
            "resolved_operand_count": None,
            "status": "resolved" if target_statuses == {"resolved"} else "unresolved",
            "calibration_summary": far_report["calibration_summary"],
        }
    return summary


def find_operand_parser_pc_global(data: bytes, offset: int, max_size: int = 400) -> list[int]:
    """The ECL PC (script byte-position cursor) global the operand parser at `offset` itself
    advances: a 16-bit memory address that is BOTH read via a direct (no base/index register)
    `mov ax, word ptr [addr]` AND written via `inc word ptr [addr]` or `add word ptr [addr], N`,
    scanning the parser's own body from `offset` to its first ret/retf/iret (or `max_size` bytes).

    Verified against Buck's own parser at `GAME.OVR:0x1ca15` (round 31 R1): exactly one candidate,
    `0x3be2` (read 8 times), matching the `inc word ptr [0x3be2]` / `add word ptr [0x3be2], 3`
    instructions visible in a manual full disassembly of the same function. Returns the full
    candidate list (not just the first) so a title with more than one candidate is visible as an
    ambiguity, not silently resolved to the wrong address."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    read_addrs: Counter[int] = Counter()
    write_addrs: set[int] = set()
    for ins in md.disasm(data[offset : offset + max_size], offset):
        if ins.mnemonic == "mov" and len(ins.operands) == 2:
            left, right = ins.operands
            if (
                left.type == capstone.x86.X86_OP_REG
                and ins.reg_name(left.reg) == "ax"
                and right.type == capstone.x86.X86_OP_MEM
                and right.mem.base == 0
                and right.mem.index == 0
            ):
                read_addrs[right.mem.disp & 0xFFFF] += 1
        if ins.mnemonic in ("inc", "add") and ins.operands and ins.operands[0].type == capstone.x86.X86_OP_MEM:
            mem = ins.operands[0].mem
            if mem.base == 0 and mem.index == 0:
                write_addrs.add(mem.disp & 0xFFFF)
        if ins.mnemonic in {"ret", "retf", "iret"}:
            break
    return sorted(addr for addr in read_addrs if addr in write_addrs)


def _descriptor_containing(layouts: list[Any], file_offset: int) -> Any | None:
    """The `DescriptorLayout` whose overlay code range contains `file_offset`, or None -- used to
    bound near (`call rel16`) targets to the SAME descriptor, since a near call cannot legally
    cross a VROOMM overlay boundary."""
    for row in layouts:
        if row.ovr_file_offset <= file_offset < row.ovr_file_offset + row.code_size:
            return row
    return None


def walk_far_call_chain(
    data: bytes,
    layouts: list[Any],
    resolved_pairs: dict[tuple[int, int], Any],
    entry_offset: int,
    parser_pair: tuple[int, int],
    pc_global_addr: int,
    max_depth: int = 4,
    max_nodes: int = 60,
    resident_image: bytes | None = None,
    start_space: str = "ovr",
) -> dict[str, Any]:
    """Bounded, static, recursive walk of everything reachable from `entry_offset`: every near
    call (`call rel16`) whose target stays inside the SAME descriptor's code bounds
    (`_descriptor_containing`), and every far call (`lcall seg,off`) that `resolved_pairs`
    classifies `public_stub_owned` under vroomm_layout.py's own descriptor/stub geometry (built
    the same way `buck_far_targets._stub_route_lookup` builds it, across the WHOLE binary -- not
    just the seven `BUCK_TARGETS` -- so a target additionally reachable one level deeper, like
    `0x124, 0x25`, still resolves).

    Reports the instant ANY visited node's operand touches `pc_global_addr` (`touched_pc`) or
    calls `parser_pair` directly (`called_parser`); a chain that bottoms out entirely in resident,
    unresolved far calls before either happens is reported honestly via `resident_targets` -- this
    function never converts "nothing found yet" into a `0` verdict itself, that judgment belongs
    to the caller (`script_bytes_consumed_verdicts`).

    `resident_image` (round 32 R5, `tools/exepack_unpack.py`'s decompressed load image) is
    OPTIONAL and defaults to `None`, which reproduces the exact pre-round-32 behaviour byte for
    byte (every prior caller, and every test pinned against it, keeps working unchanged). When
    given, a far call whose `(seg, off)` is NOT resolved by `resolved_pairs` is no longer
    automatically `unresolved`/resident: if `seg*16+off` falls inside `resident_image`, the walk
    treats it as a genuine STATIC MZ mapping resolution (round 32 R5's own independent check --
    documented in `docs/engine/research/buck-ecl-desyncs.md`'s 2026-09-03 section -- found this
    formula lands on a Borland prologue at shift 0 for 10 of Buck's 16 previously-unresolved
    segments, and on coherent register-convention code for the rest) and CONTINUES the walk
    inside that image, in a separate `resident` node space (near calls there stay within
    `resident_image`'s bounds; far calls from there can return into `data`/OVR space through the
    same `resolved_pairs` geometry, or go deeper into `resident_image`)."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True

    state = {"touched_pc": False, "called_parser": False}
    far_calls_seen: set[str] = set()
    unresolved_far_calls: set[str] = set()
    resident_resolved_targets: set[str] = set()
    near_calls_seen: set[int] = set()
    visited: set[tuple[str, int]] = set()

    def touches_pc_global(op: Any) -> bool:
        return (
            op.type == capstone.x86.X86_OP_MEM
            and op.mem.base == 0
            and op.mem.index == 0
            and (op.mem.disp & 0xFFFF) == pc_global_addr
        )

    def visit(space: str, offset: int, depth: int) -> None:
        node = (space, offset)
        if node in visited or len(visited) >= max_nodes or depth > max_depth:
            return
        visited.add(node)
        buf = data if space == "ovr" else resident_image
        descriptor = _descriptor_containing(layouts, offset) if space == "ovr" else None
        for ins in md.disasm(buf[offset : offset + 1024], offset):
            if len(ins.operands) and any(touches_pc_global(op) for op in ins.operands):
                state["touched_pc"] = True
            if ins.mnemonic == "lcall" and len(ins.operands) == 2:
                seg_op, off_op = ins.operands
                if seg_op.type == capstone.x86.X86_OP_IMM and off_op.type == capstone.x86.X86_OP_IMM:
                    seg = seg_op.imm & 0xFFFF
                    off = off_op.imm & 0xFFFF
                    label = f"0x{seg:x}, 0x{off:x}"
                    if (seg, off) == parser_pair:
                        state["called_parser"] = True
                        far_calls_seen.add(label)
                    else:
                        entry = resolved_pairs.get((seg, off))
                        if entry is not None and getattr(entry, "route_kind", None) == "public_stub_owned":
                            far_calls_seen.add(label)
                            target = entry.target_ovr_file_offset
                            if target is not None:
                                visit("ovr", target, depth + 1)
                        elif resident_image is not None and (seg * 16 + off) < len(resident_image):
                            far_calls_seen.add(label)
                            resident_resolved_targets.add(label)
                            visit("resident", seg * 16 + off, depth + 1)
                        else:
                            unresolved_far_calls.add(label)
            if (
                ins.mnemonic == "call"
                and ins.operands
                and ins.operands[0].type == capstone.x86.X86_OP_IMM
            ):
                target = ins.operands[0].imm
                if space == "ovr" and descriptor is not None:
                    if descriptor.ovr_file_offset <= target < descriptor.ovr_file_offset + descriptor.code_size:
                        near_calls_seen.add(target)
                        visit("ovr", target, depth + 1)
                elif space == "resident" and 0 <= target < len(resident_image):
                    near_calls_seen.add(target)
                    visit("resident", target, depth + 1)
            if ins.mnemonic in {"ret", "retf", "iret"}:
                break

    visit(start_space, entry_offset, 0)
    return {
        "touched_pc": state["touched_pc"],
        "called_parser": state["called_parser"],
        "far_calls_seen": sorted(far_calls_seen),
        "unresolved_far_calls": sorted(unresolved_far_calls),
        "resident_targets": sorted(unresolved_far_calls),
        "resident_resolved_targets": sorted(resident_resolved_targets),
        "near_calls_seen": sorted(f"0x{addr:x}" for addr in near_calls_seen),
        "nodes_visited": len(visited),
    }


def script_bytes_consumed_verdicts(
    buck: bytes,
    buck_root: Path,
    far_report: dict[str, Any],
    parser_offset: int,
    resident_image: bytes | None = None,
    max_depth: int = 4,
    max_nodes: int = 60,
) -> dict[str, Any]:
    """Deliverable 2's verdict: for each of Buck's `0x29`/`0x2c`/`0x42`, walk every reachable,
    resolvable static call target of its `buck_far_targets`-resolved far-call operands (round 31
    R1's stub-geometry resolutions) and report whether ECL script bytes are ever consumed:

      - `0` -- no reachable node touches the ECL PC global or calls the operand parser, AND every
        far call the walk encountered was resolved (nothing left unread).
      - `N (...)` -- a reachable node DOES touch the PC global or call the parser; this round does
        not attempt to recover the exact operand count from that node (that is `operand_word_sets`'s
        job, applied to a DIFFERENT handler than the ones walked here), so the honest report is
        that script bytes ARE consumed somewhere in the chain, not a specific N.
      - `unknown (resident callee 0xSEG, 0xOFF unread)` -- the walk touched neither the PC nor the
        parser, but at least one far call in the chain landed on a genuinely resident segment
        (`unresolved_relocated_segment`) this round cannot read; the specific blocking callee is
        named, never silently treated as if it were a `0`.

    Requires `find_operand_parser_pc_global` to return EXACTLY one candidate; if it does not, every
    verdict is `unknown (operand-parser PC global not uniquely identified)` and no walk is even
    attempted, since a walk without a confirmed PC address cannot honestly rule out `0`.
    """
    import gen1_map
    import vroomm_layout

    pc_candidates = find_operand_parser_pc_global(buck, parser_offset)
    pc_global = pc_candidates[0] if len(pc_candidates) == 1 else None

    loader_path = buck_root / ("START.EXE" if (buck_root / "START.EXE").exists() else "GAME.EXE")
    overlay_path = buck_root / "GAME.OVR"
    loader = loader_path.read_bytes()
    overlay = overlay_path.read_bytes()
    descriptors = gen1_map.scan_descriptors(loader, overlay)
    layouts = vroomm_layout.descriptor_layouts(loader, overlay, descriptors)
    mz = gen1_map.parse_mz(loader)
    vroomm_layout.classify_lcall_routes(loader, overlay, mz, layouts)

    resolved_pairs: dict[tuple[int, int], Any] = {}
    for row in layouts:
        for entry in row.fixup_entries:
            if entry.context != "lcall_segment" or entry.call_target_offset is None:
                continue
            key = (entry.original_segment, entry.call_target_offset)
            existing = resolved_pairs.get(key)
            if existing is None or (entry.route_kind == "public_stub_owned" and existing.route_kind != "public_stub_owned"):
                resolved_pairs[key] = entry

    import buck_far_targets

    parser_pair = buck_far_targets.BUCK_PARSER_PAIR
    by_opcode: dict[int, list[tuple[str, int, int]]] = {}
    for opcode, op_str, seg, off in buck_far_targets.BUCK_TARGETS:
        by_opcode.setdefault(opcode, []).append((op_str, seg, off))
    by_target_row = {row["target"]: row for row in far_report["buck_targets"]}

    verdicts: dict[str, Any] = {}
    for opcode, targets in sorted(by_opcode.items()):
        key = f"0x{opcode:02x}"
        if pc_global is None:
            verdicts[key] = {
                "verdict": "unknown (operand-parser PC global not uniquely identified)",
                "pc_global_candidates": [f"0x{addr:x}" for addr in pc_candidates],
            }
            continue
        walks: dict[str, Any] = {}
        touched_pc = False
        called_parser = False
        resident_blocking: set[str] = set()
        for op_str, seg, off in targets:
            row = by_target_row.get(op_str)
            if row is not None and row.get("status") == "resolved" and "file_offset" in row:
                entry_offset = int(row["file_offset"], 16)
                walk = walk_far_call_chain(
                    buck, layouts, resolved_pairs, entry_offset, parser_pair, pc_global,
                    max_depth=max_depth, max_nodes=max_nodes, resident_image=resident_image,
                )
                walks[op_str] = walk
                touched_pc = touched_pc or walk["touched_pc"]
                called_parser = called_parser or walk["called_parser"]
                resident_blocking.update(walk["resident_targets"])
            elif resident_image is not None and (seg * 16 + off) < len(resident_image):
                # Round 32 R5: this target was genuinely resident on disk (EXEPACK-compressed);
                # with the decompressed image available, walk it directly, starting IN resident
                # space at seg*16+off (the same static MZ mapping formula the R5 doc's own
                # Borland-prologue check validated).
                walk = walk_far_call_chain(
                    buck, layouts, resolved_pairs, seg * 16 + off, parser_pair, pc_global,
                    max_depth=max_depth, max_nodes=max_nodes,
                    resident_image=resident_image, start_space="resident",
                )
                walks[op_str] = walk
                touched_pc = touched_pc or walk["touched_pc"]
                called_parser = called_parser or walk["called_parser"]
                resident_blocking.update(walk["resident_targets"])
            else:
                # Genuinely resident -- the walk cannot even start from this target.
                walks[op_str] = {"resident": True}
                resident_blocking.add(op_str)
        if touched_pc or called_parser:
            verdict = (
                "N (reachable code touches the ECL PC global or calls the operand parser -- "
                "see walks for the deciding node; the exact N is not modelled this round)"
            )
        elif resident_blocking:
            verdict = f"unknown (resident callee {sorted(resident_blocking)[0]} unread)"
        else:
            verdict = "0"
        verdicts[key] = {
            "verdict": verdict,
            "pc_global": f"0x{pc_global:x}",
            "resident_blocking": sorted(resident_blocking),
            "walks": walks,
        }
    return verdicts


def walk_vacuous_opcodes(
    data: bytes,
    layouts: list[Any],
    resolved_pairs: dict[tuple[int, int], Any],
    reasons: dict[str, Any],
    word_sets: dict[int, int | None],
    parser_pair: tuple[int, int],
    pc_global: int,
    resident_image: bytes,
    max_depth: int = 25,
    max_nodes: int = 5000,
) -> dict[str, Any]:
    """Round 32 R5, deliverable 4: generalises `script_bytes_consumed_verdicts`'s resident-aware
    walk (previously hand-targeted at Buck's own `0x29`/`0x2c`/`0x42`) to EVERY opcode whose
    measured word set is `None` for the `different_far_call_target` reason -- the 17 (of 22
    total vacuous, the other 5 being `no_far_call`) opcodes whose handler calls some OTHER far
    routine `operand_word_sets` never identified as the operand parser. `data`/`layouts`/
    `resolved_pairs`/`parser_pair`/`pc_global` are the SAME per-title objects
    `script_bytes_consumed_verdicts` already builds; shared here rather than duplicated so this
    works unmodified for both Buck's own GAME.OVR bytes and Matrix's own (different binary, same
    method) -- see both modules' `build_report`.

    For each such opcode, walks every one of its `far_call_targets` (parsed back out of the
    `"0xSEG, 0xOFF"` strings `stop_reasons` already recorded) exactly like
    `script_bytes_consumed_verdicts` does for its three hand-picked opcodes: resolve via
    `resolved_pairs`' stub geometry first, fall back to starting the walk directly in resident
    space when the target itself falls inside `resident_image`, and union `touched_pc`/
    `called_parser` across every target. Verdict per opcode:

      - `"0"` -- exhausted every reachable node (checked against `max_nodes` below) without
        touching the PC global or calling the parser.
      - `"N (touches PC/parser, exact count not modelled)"` -- at least one walk did. This is
        NOT automatically a `wordSetOverrides` correction: IF_EQ/IF_NE/.../IF_GE (`0x16..0x1b`)
        all land here, and their base-table `wordSet: 0` is a claim about OPERAND bytes, not
        about whether the handler ever touches the script cursor -- a conditional-skip opcode
        legitimately manipulates the same global to jump over the following instructions without
        that being an extra operand. Reported as a fact (the chain touches the global), not
        reinterpreted as a wordSet disagreement.

    Every walk's own `nodes_visited` is included so a caller can check it against `max_nodes`
    (the same truncation-vs-exhaustion null `test_map_buck_ecl_dispatch.py`'s own tests check for
    the three hand-picked opcodes)."""
    import re

    out: dict[str, Any] = {}
    for opcode, measured in sorted(word_sets.items()):
        if measured is not None:
            continue
        key = str(opcode)
        info = reasons.get(key, {})
        if info.get("reason") != "different_far_call_target":
            continue
        targets = info.get("far_call_targets", [])
        touched_pc = False
        called_parser = False
        walks: dict[str, Any] = {}
        for target_str in targets:
            m = re.match(r"0x([0-9a-f]+), 0x([0-9a-f]+)", target_str)
            assert m is not None, target_str
            seg, off = int(m.group(1), 16), int(m.group(2), 16)
            route = resolved_pairs.get((seg, off))
            if route is not None and route.route_kind == "public_stub_owned" and route.target_ovr_file_offset is not None:
                walk = walk_far_call_chain(
                    data, layouts, resolved_pairs, route.target_ovr_file_offset, parser_pair,
                    pc_global, max_depth=max_depth, max_nodes=max_nodes, resident_image=resident_image,
                )
            elif (seg * 16 + off) < len(resident_image):
                walk = walk_far_call_chain(
                    data, layouts, resolved_pairs, seg * 16 + off, parser_pair, pc_global,
                    max_depth=max_depth, max_nodes=max_nodes, resident_image=resident_image,
                    start_space="resident",
                )
            else:
                walk = {"resident": True, "touched_pc": False, "called_parser": False, "nodes_visited": 0}
            walks[target_str] = walk
            touched_pc = touched_pc or walk.get("touched_pc", False)
            called_parser = called_parser or walk.get("called_parser", False)
        verdict = (
            "N (touches PC/parser, exact count not modelled)" if (touched_pc or called_parser) else "0"
        )
        out[f"0x{opcode:02x}"] = {"verdict": verdict, "walks": walks}
    return out


def compare_to_known_dialects(measured: dict[int, int | None]) -> dict[str, Any]:
    """Score Buck's measured word sets against the two dialects the engine already carries.
    Only opcodes with BOTH a measurement and a value in the reference table count toward
    agree/disagree; opcodes above 0x40 (Buck's own extension range, beyond either reference
    table) are always excluded and listed separately."""
    agreements: list[dict[str, Any]] = []
    disagreements: list[dict[str, Any]] = []
    unmeasured: list[int] = []
    extended: list[dict[str, Any]] = []
    for opcode in sorted(measured):
        value = measured[opcode]
        if opcode > 0x40:
            extended.append({"opcode": opcode, "measured_word_set": value})
            continue
        if value is None:
            unmeasured.append(opcode)
            continue
        long_value = LONG_WORD_SETS.get(opcode)
        short_value = SHORT_OVERRIDES.get(opcode, long_value)
        row = {
            "opcode": opcode,
            "measured_word_set": value,
            "long_dialect_word_set": long_value,
            "short_dialect_word_set": short_value,
        }
        if value == long_value or value == short_value:
            agreements.append(row)
        else:
            disagreements.append(row)
    return {
        "agree": agreements,
        "disagree": disagreements,
        "unmeasured": unmeasured,
        "extended": extended,
    }


def build_report(oracle_path: Path = DEFAULT_ORACLE, use_resident_image: bool = True) -> dict[str, Any]:
    """`use_resident_image` (round 32 R5, default True): unpack Buck's own `START.EXE` with
    `tools/exepack_unpack.py` and thread the decompressed load image into
    `script_bytes_consumed_verdicts` so its walk can follow far calls that land on genuinely
    resident code -- the round-31 report could only ever report `unknown (resident callee ...)`
    for such a target because it had no bytes to read there at all. Set False to reproduce
    round 31's original, resident-blind report exactly (used by nothing in this repo; kept only
    so the historical numbers stay reproducible on request)."""
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    buck_path, coab_path = retail_files()
    buck = buck_path.read_bytes()
    coab = coab_path.read_bytes()
    references = {
        "dispatcher": disassemble_shape(coab, oracle_offset(oracle, "commandTable")),
        "operand_parser": disassemble_shape(coab, oracle_offset(oracle, "@parse_command_sub$q4Byte")),
    }
    if any(value is None for value in references.values()):
        raise ValueError("failed to disassemble CoAB oracle functions")
    matches: dict[str, dict[str, Any]] = {}
    for name, reference in references.items():
        assert reference is not None
        candidate, ratio, jaccard = nearest_function(buck, reference)
        matches[name] = {
            "coab": asdict(reference),
            "buck": asdict(candidate),
            "sequence_similarity": ratio,
            "trigram_jaccard": jaccard,
        }
    dispatcher = FunctionShape(**matches["dispatcher"]["buck"])
    linear_rows = dispatch_table(buck, dispatcher)
    linear_opcodes = {row["opcode"] for row in linear_rows}
    linear_missing = {
        value for value in range(min(linear_opcodes), max(linear_opcodes) + 1) if value not in linear_opcodes
    }
    fallthrough = resolve_fallthrough_dispatch(buck, dispatcher, linear_missing)
    for row in linear_rows:
        row["source"] = "linear"
    rows = linear_rows + [
        {"opcode": opcode, "handler_file_offset": handler, "source": "fallthrough-merge"}
        for opcode, handler in sorted(fallthrough.items())
    ]
    rows.sort(key=lambda row: row["opcode"])
    opcodes = [row["opcode"] for row in rows]
    buck_missing = [value for value in range(min(opcodes), max(opcodes) + 1) if value not in opcodes]

    # Apply the SAME two-pass method (linear scan, then fallthrough-merge resolution) to CoAB's own
    # commandTable, so the missing-opcode-signature comparison stays apples-to-apples rather than
    # crediting Buck with a resolution pass CoAB never got.
    coab_dispatcher = FunctionShape(**matches["dispatcher"]["coab"])
    coab_linear_rows = dispatch_table(coab, coab_dispatcher)
    coab_linear_opcodes = {row["opcode"] for row in coab_linear_rows}
    coab_linear_missing = {
        value
        for value in range(min(coab_linear_opcodes), max(coab_linear_opcodes) + 1)
        if value not in coab_linear_opcodes
    }
    coab_fallthrough = resolve_fallthrough_dispatch(coab, coab_dispatcher, coab_linear_missing)
    coab_opcodes = coab_linear_opcodes | set(coab_fallthrough)
    coab_missing = sorted(
        value for value in range(min(coab_opcodes), max(coab_opcodes) + 1) if value not in coab_opcodes
    )
    shared_missing_within_040 = sorted(set(coab_missing) & set(v for v in buck_missing if v <= 0x40))

    call_target, call_target_first_count, handler_count = derive_operand_parser_call_target(buck, rows)
    measured = operand_word_sets(buck, rows, call_target)
    comparison = compare_to_known_dialects(measured)
    reasons = stop_reasons(buck, rows, measured, call_target)
    import buck_far_targets

    far_report = buck_far_targets.build_report()
    far_call_resolution = far_call_resolution_summary(reasons, far_report)

    resident_image: bytes | None = None
    resident_image_dest_len_bytes: int | None = None
    if use_resident_image:
        import exepack_unpack

        loader_dir = buck_path.parent
        loader_path = loader_dir / ("START.EXE" if (loader_dir / "START.EXE").exists() else "GAME.EXE")
        resident_image, unpack_result = exepack_unpack.unpack(loader_path)
        resident_image_dest_len_bytes = unpack_result.dest_len_bytes

    script_bytes_consumed = script_bytes_consumed_verdicts(
        buck, buck_path.parent, far_report, matches["operand_parser"]["buck"]["offset"],
        resident_image=resident_image, max_depth=25, max_nodes=5000,
    )

    vacuous_opcode_walk: dict[str, Any] = {}
    if use_resident_image:
        import gen1_map as _gen1_map
        import vroomm_layout as _vroomm_layout

        pc_candidates = find_operand_parser_pc_global(buck, matches["operand_parser"]["buck"]["offset"])
        if len(pc_candidates) == 1:
            loader_dir = buck_path.parent
            loader_path_local = loader_dir / ("START.EXE" if (loader_dir / "START.EXE").exists() else "GAME.EXE")
            loader_bytes = loader_path_local.read_bytes()
            overlay_bytes = buck_path.read_bytes()
            descriptors_local = _gen1_map.scan_descriptors(loader_bytes, overlay_bytes)
            layouts_local = _vroomm_layout.descriptor_layouts(loader_bytes, overlay_bytes, descriptors_local)
            mz_local = _gen1_map.parse_mz(loader_bytes)
            _vroomm_layout.classify_lcall_routes(loader_bytes, overlay_bytes, mz_local, layouts_local)
            resolved_pairs_local: dict[tuple[int, int], Any] = {}
            for row in layouts_local:
                for entry in row.fixup_entries:
                    if entry.context != "lcall_segment" or entry.call_target_offset is None:
                        continue
                    rkey = (entry.original_segment, entry.call_target_offset)
                    existing = resolved_pairs_local.get(rkey)
                    if existing is None or (entry.route_kind == "public_stub_owned" and existing.route_kind != "public_stub_owned"):
                        resolved_pairs_local[rkey] = entry
            vacuous_opcode_walk = walk_vacuous_opcodes(
                buck, layouts_local, resolved_pairs_local, {str(o): v for o, v in reasons.items()},
                measured, buck_far_targets.BUCK_PARSER_PAIR, pc_candidates[0], resident_image,
            )

    return {
        "schema_version": 2,
        "provenance": "same-subsystem-structural-map-verified-against-coab-oracle-and-retail-bytes",
        "buck_path": goldbox_corpus.slash(buck_path),
        "coab_path": goldbox_corpus.slash(coab_path),
        "matches": matches,
        "buck_dispatch": rows,
        "buck_opcodes": opcodes,
        "buck_opcode_min": min(opcodes),
        "buck_opcode_max": max(opcodes),
        "buck_handler_count": len(rows),
        "buck_fallthrough_resolved_count": len(fallthrough),
        "missing_within_range": buck_missing,
        "coab_opcode_max": max(coab_opcodes),
        "coab_missing_within_range": coab_missing,
        "shared_missing_signature_within_0x40": shared_missing_within_040,
        "operand_parser_call_target": {
            "target": call_target,
            "handlers_using_it_first": call_target_first_count,
            "handlers_total": handler_count,
        },
        "word_sets": {str(opcode): value for opcode, value in measured.items()},
        "dialect_comparison": comparison,
        "stop_reasons": {str(opcode): info for opcode, info in reasons.items()},
        "far_call_resolution": {str(opcode): info for opcode, info in far_call_resolution.items()},
        "far_call_resolution_calibration_summary": far_report["calibration_summary"],
        "resident_image_used": use_resident_image,
        "resident_image_dest_len_bytes": resident_image_dest_len_bytes,
        "script_bytes_consumed": script_bytes_consumed,
        "vacuous_opcode_walk": vacuous_opcode_walk,
        "claim_boundary": (
            "Dispatcher/operand-parser ROLES are established by same-subsystem structural identity "
            "against the CoAB oracle, measured directly on Buck's own real GAME.OVR bytes (TPOV "
            "overlay, not FBOV -- the first structural-match run against this overlay shape). "
            "Per-opcode word sets are measured from each handler's own operand-parser prefetch call "
            "(mov al,N; push ax; lcall <derived target>), not inferred from corpus statistics or "
            "assumed from another title's table. Opcodes above the CoAB oracle's own 0x00-0x40 range "
            "are Buck-specific extensions with no oracle counterpart; their measured word sets are "
            "reported but their MNEMONICS/semantics are not claimed."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    dispatcher = report["matches"]["dispatcher"]
    parser = report["matches"]["operand_parser"]
    comparison = report["dialect_comparison"]
    lines = [
        "# Buck Rogers: Countdown to Doomsday ECL Dispatcher Map",
        "",
        "> Generated by `tools/map_buck_ecl_dispatch.py`. Do not edit by hand.",
        "",
        f"- Buck dispatcher: `GAME.OVR:0x{dispatcher['buck']['offset']:x}` ({dispatcher['buck']['instruction_count']} instructions).",
        f"- CoAB oracle dispatcher: `GAME.OVR:0x{dispatcher['coab']['offset']:x}` ({dispatcher['coab']['instruction_count']} instructions).",
        f"- Dispatcher sequence similarity: `{dispatcher['sequence_similarity']:.4f}`; trigram Jaccard: `{dispatcher['trigram_jaccard']:.4f}`.",
        f"- Buck operand parser: `GAME.OVR:0x{parser['buck']['offset']:x}`; CoAB oracle: `0x{parser['coab']['offset']:x}`.",
        f"- Operand-parser sequence similarity: `{parser['sequence_similarity']:.4f}`; trigram Jaccard: `{parser['trigram_jaccard']:.4f}`.",
        f"- Buck dispatches `{report['buck_handler_count']}` opcodes from `0x{report['buck_opcode_min']:02x}` "
        f"through `0x{report['buck_opcode_max']:02x}` (CoAB's own table tops out at `0x{report['coab_opcode_max']:02x}`); "
        f"missing in range: `{[hex(v) for v in report['missing_within_range']]}`.",
        f"- Of those, `{report['buck_fallthrough_resolved_count']}` were recovered by following a "
        "`cmp al,N; je/jne` fallthrough chain to a handler the compiler merged with an adjacent "
        "opcode (the same evidentiary shape as this file's own `0x22`/`0x23` merge) -- not present "
        "in the plain linear `cmp al,imm; call` scan `dispatch_table` performs. Every recovered "
        "opcode lands on the handler already assigned to its immediate numeric neighbor.",
        f"- CoAB's own missing set (same two-pass method -- linear scan, then the identical "
        f"fallthrough resolver -- run on CoAB itself): `{[hex(v) for v in report['coab_missing_within_range']]}`.",
        f"- Shared missing-opcode signature within 0x00-0x40: `{len(report['shared_missing_signature_within_0x40'])}` "
        f"of `{len(report['coab_missing_within_range'])}` CoAB gaps also missing from Buck's own table.",
        f"- Operand-parser call target (derived from Buck's own handlers, not hard-coded): `{report['operand_parser_call_target']['target']}`, "
        f"the FIRST far call in {report['operand_parser_call_target']['handlers_using_it_first']}/"
        f"{report['operand_parser_call_target']['handlers_total']} dispatched handlers.",
        "",
        "## Word-set agreement against the two known dialects",
        "",
        f"- Agree with the long (Pool/CoAB/Secret/CoK) or short (DoK/Gateway/Treasures/Pools) dialect: "
        f"**{len(comparison['agree'])}**.",
        f"- Disagree with BOTH (a genuinely Buck-specific frame, measured from Buck's own bytes): "
        f"**{len(comparison['disagree'])}**.",
        f"- Unmeasured (handler never reaches the derived call target before returning): "
        f"**{len(comparison['unmeasured'])}**.",
        f"- Beyond the CoAB oracle's own 0x00-0x40 range (no reference to compare against): "
        f"**{len(comparison['extended'])}**.",
        "",
        "### Opcodes where Buck's own measured word set differs from both known dialects",
        "",
        "| Opcode | Measured | Long dialect | Short dialect |",
        "| ---: | ---: | ---: | ---: |",
        *[
            f"| `0x{row['opcode']:02x}` | `{row['measured_word_set']}` | `{row['long_dialect_word_set']}` | `{row['short_dialect_word_set']}` |"
            for row in comparison["disagree"]
        ],
        "",
        "## Opcode Handlers",
        "",
        "| Opcode | Buck handler file offset | Measured word set | Source | Stop reason (if unmeasured) |",
        "| ---: | ---: | ---: | --- | --- |",
        *[
            f"| `0x{row['opcode']:02x}` | `0x{row['handler_file_offset']:x}` | `{report['word_sets'][str(row['opcode'])]}` | {row['source']} | "
            + (
                (
                    lambda info: f"{info['reason']}"
                    + (f" ({', '.join(info['far_call_targets'])})" if info["far_call_targets"] else "")
                )(report["stop_reasons"][str(row["opcode"])])
                if str(row["opcode"]) in report.get("stop_reasons", {})
                else ""
            )
            + " |"
            for row in report["buck_dispatch"]
        ],
        "",
        "### Why each Unmeasured/beyond-0x40 handler stayed unmeasured",
        "",
        "R6 (2026-09-03): every opcode above with a `Measured word set` of `None` is classified by "
        "why its handler never reached the derived operand-parser call target -- see "
        "`stop_reasons()` in `map_buck_ecl_dispatch.py` for the full evidentiary rule. "
        "`no_far_call` is the strongest possible zero-operand signal (the handler makes no call "
        "of any kind that could consume ECL script bytes); `different_far_call_target` means the "
        "handler reads its data through an unidentified alternate mechanism and must NOT be read "
        "as zero-operand; `ran_past_scan_window` is inconclusive.",
        "",
        "| Opcode | Reason | Far call targets seen |",
        "| ---: | --- | --- |",
        *[
            f"| `0x{int(opcode):02x}` | `{info['reason']}` | "
            f"{', '.join(f'`{t}`' for t in info['far_call_targets']) if info['far_call_targets'] else '(none)'} |"
            for opcode, info in sorted(report.get("stop_reasons", {}).items(), key=lambda kv: int(kv[0]))
        ],
        "",
        "## Far-call resolution attempt (round 30 R4, corrected round 31 R1)",
        "",
        "`tools/buck_far_targets.py` calibrates a `seg:off -> GAME.OVR file offset` mapping for "
        "large-segment far calls against CoAB's 851-function oracle (`build/coab-oracle-map.json`) "
        "before ever pointing it at Buck -- see that module's own docstring. Round 30's LINEAR-fit "
        "calibration is a **landable negative** (unchanged): "
        + (report.get("far_call_resolution_calibration_summary") or "")
        + " Round 31 R1 found a SEPARATE, non-linear resolution: `vroomm_layout.py`'s own "
        "descriptor/public-stub-array geometry already routes three of the seven blocking targets "
        "(`0xb8, 0x7f`; `0xb8, 0xb6`; `0x10f, 0x4d`) to real `GAME.OVR` file offsets, calibrated "
        "against CoAB's own oracle-named operand parser landing exactly (229/240 distinct targets "
        "on an oracle function start, shifted null 1/0/0/0) -- see `buck_stub_geometry_resolution` "
        "in that module. The other four sit on segments the SAME geometry also classifies "
        "`unresolved_relocated_segment` (genuinely resident code) and stay honestly unresolved.",
        "",
        "| Opcode | Status | Targets |",
        "| ---: | --- | --- |",
        *[
            f"| `0x{int(opcode):02x}` | `{info['status']}` | "
            + ", ".join(
                f"`{row.get('target', row.get('status'))}` ({row['status']}"
                + (f" via {row['resolution_method']}, `{row['file_offset']}`" if row.get("resolution_method") == "stub_geometry" else "")
                + ")"
                for row in info["targets"]
            )
            + " |"
            for opcode, info in sorted(report.get("far_call_resolution", {}).items(), key=lambda kv: int(kv[0]))
        ],
        "",
        "## Script-bytes-consumed verdicts (round 31 R1, resolved round 32 R5)",
        "",
        "For each of `0x29`/`0x2c`/`0x42`, every reachable, resolvable static call target of its "
        "resolved far-call operands above was walked (near calls within the same descriptor, far "
        "calls resolvable via the SAME stub geometry, and -- round 32 R5 -- far calls landing "
        "inside `tools/exepack_unpack.py`'s decompressed `START.EXE` load image, `resident_image` "
        "below) to check whether it ever touches the ECL PC global the operand parser itself "
        "advances (identified from the parser's own body, `find_operand_parser_pc_global`) or "
        "calls the parser directly. See `walk_far_call_chain` and `script_bytes_consumed_verdicts` "
        "in `map_buck_ecl_dispatch.py`.",
        "",
        f"`resident_image_used`: `{report.get('resident_image_used')}` "
        f"(`{report.get('resident_image_dest_len_bytes')}`-byte decompressed load image).",
        "",
        "| Opcode | ECL PC global | Verdict |",
        "| ---: | --- | --- |",
        *[
            f"| `{opcode}` | `{info.get('pc_global', '?')}` | {info['verdict']} |"
            for opcode, info in sorted(report.get("script_bytes_consumed", {}).items())
        ],
        "",
        "## Vacuous-opcode resident walk (round 32 R5, deliverable 4)",
        "",
        "Generalises the walk above to every opcode with `measured word set: None` for the "
        "`different_far_call_target` reason (17 of the 22 total vacuous opcodes; the other 5 are "
        "`no_far_call`, already the strongest possible zero-operand signal and not walked here). "
        "See `walk_vacuous_opcodes`.",
        "",
        "| Opcode | Verdict |",
        "| ---: | --- |",
        *[
            f"| `{opcode}` | {info['verdict']} |"
            for opcode, info in sorted(report.get("vacuous_opcode_walk", {}).items())
        ],
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.oracle)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    if args.strict:
        weak = [name for name, row in report["matches"].items() if row["sequence_similarity"] < 0.8]
        if weak:
            raise SystemExit(f"strict failure: weak Buck ECL mapping {weak}")
        if len(report["dialect_comparison"]["agree"]) < 25:
            raise SystemExit("strict failure: too few opcodes agree with a known dialect to trust the match")
    print(
        f"buck ecl map: dispatcher 0x{report['matches']['dispatcher']['buck']['offset']:x} "
        f"({report['matches']['dispatcher']['sequence_similarity']:.3f}), "
        f"parser 0x{report['matches']['operand_parser']['buck']['offset']:x} "
        f"({report['matches']['operand_parser']['sequence_similarity']:.3f}), "
        f"{len(report['dialect_comparison']['agree'])} agree / "
        f"{len(report['dialect_comparison']['disagree'])} disagree / "
        f"{len(report['dialect_comparison']['unmeasured'])} unmeasured"
    )


if __name__ == "__main__":
    main()
