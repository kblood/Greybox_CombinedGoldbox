"""Generalised structural ECL-dispatch mapper for the three Gold Box Gen1 FBOV titles that had
never been run through the CoAB-oracle structural-match pipeline on their OWN `GAME.OVR` bytes:
Pools of Darkness, Gateway to the Savage Frontier, and Treasures of the Savage Frontier
(`--game pools|gateway|treasures`).

Round 32 R4's brief (`docs/engine/PLAN-ROUND-32.md`) found a real contradiction: the capability
ledger's Pools `ecl` gap says the dialect's word sets are "derived from scan agreement across the
corpus, not from a handler table", while `disassemble.ts`'s own `ECL_GEN1_SHORT_POOLS` docblock
says the opposite -- that its four overrides were read from Pools' own handlers at `+0x264a`,
`+0x0e9e`, `+0x1eca`, `+0x240c`. Treasures' docblock, by contrast, HONESTLY admits its dispatch
was never located and its `0x42` SET ORDER is assumed. Neither claim was backed by a generated
map the way CoAB/Pool of Radiance/DoK/Buck/Matrix all are. This tool closes that gap by pointing
the SAME structural-match pipeline `tools/map_pool_ecl_dispatch.py` and `tools/map_buck_ecl_dispatch.py`
built at these three titles' own bytes.

Method (identical to `tools/map_matrix_ecl_dispatch.py`'s FBOV path -- this module is that same
generalisation, factored so a fourth FBOV title needs only a new `--game` entry, not a new file):

  1. Confirm the file's own magic (`FBOV` for all three; refuses loudly otherwise, so pointing
     this tool at a `TPOV` file like Buck's or Secret's own `GAME.OVR` fails honestly rather than
     silently producing a wrong map).
  2. Structurally match the CoAB oracle's `commandTable` (dispatcher) and
     `@parse_command_sub$q4Byte` (operand parser) against every Borland-prologue-shaped function
     start in the title's own file (`map_pool_ecl_dispatch.disassemble_shape` / `nearest_function`,
     imported read-only -- this module never edits that file).
  3. Read the opcode -> handler dispatch table off the located dispatcher (`dispatch_table`), then
     recover any compiler-folded fallthrough opcodes the same way Buck's tool does
     (`resolve_fallthrough_dispatch`, imported read-only from `map_buck_ecl_dispatch`).
  4. Derive the operand-parser's own far-call signature from the handlers themselves
     (`derive_operand_parser_call_target`) and read each dispatched opcode's operand count straight
     off its handler's own `mov al,N; push ax; lcall <target>` prefetch (`operand_word_sets`,
     `stop_reasons` -- same two imports, same generic structural-disassembly functions R5 owns
     concurrently this round per `docs/engine/PLAN-ROUND-32.md`'s R4 brief).

Two-sided by construction, same as every sibling tool: `build_report` never invents a word set.
An opcode whose handler never reaches the derived call target is `measured_word_set: null`, with
`stop_reasons` explaining why (`no_far_call` / `different_far_call_target` / `ran_past_scan_window`).

The NULL for "the structural match found the right function, not just a plausible one of similar
length": every Borland-prologue-shaped candidate in the file is ranked, and this module reports
BOTH (a) the global runner-up's similarity (the same null `matrixEclDialect`'s own mutation test
computes: Buck's own docblock/test measured 0.26/0.49 for its dispatcher/parser runner-ups, Matrix
independently landed in the same range) and (b) the same-length null: the best similarity among
candidates whose byte length is within 10% (floor 16 bytes) of the winner's -- a tighter, more
adversarial null than the global runner-up, since it rules out "we just found the longest function
in the file" rather than "we found a similarly-shaped one by chance".
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import goldbox_corpus
from map_buck_ecl_dispatch import (
    LONG_WORD_SETS,
    SHORT_OVERRIDES,
    operand_word_sets,
    resolve_fallthrough_dispatch,
    stop_reasons,
)
from map_pool_ecl_dispatch import (
    FunctionShape,
    dispatch_table,
    disassemble_shape,
    nearest_function,
    oracle_offset,
)

DEFAULT_ORACLE = goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json"

# profile id, expected GAME.OVR magic, expected GAME.OVR size (docs/engine/PLAN-ROUND-32.md's R4
# brief; asserted, not just documented, so a wrong install path fails loudly instead of silently
# mapping the wrong file).
GAME_PROFILES: dict[str, dict[str, Any]] = {
    "pools": {
        "profile_id": "pools-of-darkness",
        "magic": b"FBOV",
        "expected_size": 264086,
    },
    "gateway": {
        "profile_id": "gateway-to-the-savage-frontier",
        "magic": b"FBOV",
        "expected_size": 347622,
    },
    "treasures": {
        "profile_id": "treasures-of-the-savage-frontier",
        "magic": b"FBOV",
        "expected_size": 310572,
    },
    "secret": {
        "profile_id": "secret-of-the-silver-blades",
        "magic": b"TPOV",
        "expected_size": 278528,
    },
    # Round 35 R1. Death Knights of Krynn has had a dispatch map since 2026-07-17
    # (`tools/map_dok_ecl_dispatch.py` -> `build/dok-ecl-dispatch-map.json`), but that v1 map
    # stops at "opcode -> handler file offset": it never derived the operand-parser call target
    # and never read a single handler's `mov al,N` prefetch, so DoK's 54 dispatched opcodes were
    # the only Gen1 title's whose word sets came from nothing but inheritance of the shared
    # `ECL_GEN1_SHORT` literal. Routing DoK through THIS tool adds exactly that missing half, and
    # the v1 map becomes the tooling control: this pipeline must reproduce all 54 of its
    # `handler_file_offset` values byte-for-byte or the structural match found the wrong function.
    "dok": {
        "profile_id": "death-knights-of-krynn",
        "magic": b"FBOV",
        "expected_size": 252469,
    },
}

# The opcode-0x31 SPRITE_OFF/SHORT_MENU wordSet override every ECL_GEN1_SHORT* dialect that
# CARRIES an opcodeOverrides table inherits unchanged from packages/engine/src/ecl/disassemble.ts
# `ECL_GEN1_SHORT.opcodeOverrides` (`{0x31: {wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU'}}`).
# Gateway's own dialect literal has NO `opcodeOverrides` key at all, so its effective 0x31 falls
# through to the base table's own `SPRITE_OFF` (wordSet 0) -- this dict is keyed by the SAME
# per-game selector as GAME_PROFILES so that fact is represented structurally, not by a comment.
SHORT_MENU_OPCODE = 0x31
SHORT_MENU_WORD_SET = 2

# Python literal mirror of each of the three titles' CURRENT `packages/engine/src/ecl/disassemble.ts`
# dialect, and of the plain `ECL_GEN1_SHORT` alternative each one is a title-specific split off of.
# Kept in sync by hand (same convention `LONG_WORD_SETS`/`SHORT_OVERRIDES` above already use, and
# the same reason: no cross-language import). `word_set_overrides` mirrors `wordSetOverrides`;
# `opcode_overrides` mirrors `opcodeOverrides` (wordSet only -- countAt/mnemonic don't affect the
# operand-count comparison this tool makes). `has_short_menu` records whether the dialect literal
# carries an `opcodeOverrides` table at all (Gateway's does not).
# RESYNCED 2026-09-10 against `disassemble.ts`, and the reason this block needed resyncing is now
# checked mechanically rather than remembered: `tools/test_ecl_dialect_parity.py` derives the
# engine's tables from the engine's source on every `pnpm test:corpus` run and fails when this
# literal disagrees with the dialect it names. Fourteen opcode rows across all four games had
# drifted, every one of them because the ENGINE moved and this hand-kept mirror did not -- which is
# the failure mode "kept in sync by hand" above always eventually produces.
#
# A stale row here is not cosmetic: this tool's whole output is a comparison between a dialect and
# the binary, so a mirror row that lags reports a real agreement as a DESYNC. That is exactly what
# was happening for DoK's 0x1F/0x27/0x29 and Gateway's five.
CURRENT_DIALECTS: dict[str, dict[str, Any]] = {
    "pools": {
        "word_set_overrides": {0x0C: 4, 0x1D: 0, 0x22: 0, 0x23: 0, 0x2C: 1, 0x1F: 1, 0x21: 2},
        # 0x27: Pools' own handler at file `0x1626` declares four fixed operands (round 33 Phase B).
        "opcode_overrides": {0x27: 4, 0x37: 2, 0x41: 2},
        "has_short_menu": True,
    },
    # Gateway is LONG, not short (round 32 R4, `--game gateway`): its own handlers give 0x1D=1
    # (file `0x1ecc`), 0x22=2 (`0x22b8`) and 0x2C=6 (`0x3360`), so the three "1991+ short form"
    # overrides that stood here are DELETED rather than corrected -- with them gone the base table
    # supplies the long values directly. What remains are the two frames Gateway really does widen.
    "gateway": {
        "word_set_overrides": {0x32: 4, 0x40: 4},
        "opcode_overrides": {0x41: 2},
        "has_short_menu": False,
    },
    "treasures": {
        "word_set_overrides": {0x0C: 4, 0x1D: 0, 0x1F: 1, 0x22: 0, 0x23: 0, 0x2C: 1, 0x21: 2},
        "opcode_overrides": {0x27: 4, 0x37: 2, 0x41: 2, 0x42: 4, 0x43: 4, 0x44: 4},
        "has_short_menu": True,
    },
    # DoK DOES carry a split of its own, and this comment said the opposite until 2026-09-10:
    # `ECL_GEN1_SHORT_DOK` has existed since round 35 R1 (2026-09-05) with three frames read from
    # DoK's own 66 handlers -- 0x1F=1 (file `0x2fbc`), 0x29=0 (`0x30e6`), 0x27=4-with-count-slot
    # (`0x2150`). While this mirror still said "no split of its own", every DoK row in this tool's
    # output was partitioned against a dialect DoK's binary refutes.
    "dok": {
        "word_set_overrides": {**SHORT_OVERRIDES, 0x1F: 1, 0x29: 0},
        "opcode_overrides": {0x27: 4},
        "has_short_menu": True,
    },
}
# The plain ECL_GEN1_SHORT alternative every one of the three above is a split off of.
PLAIN_SHORT_DIALECT: dict[str, Any] = {
    "word_set_overrides": dict(SHORT_OVERRIDES),
    "opcode_overrides": {},
    "has_short_menu": True,
}


# Round 34 Phase B added `0x41: {wordSet: 2}` to the SHARED base table
# (`packages/engine/src/ecl/opcodes.ts` `KRYNN_GEN1_OPCODES`) after seven independent binaries
# agreed on it. `map_buck_ecl_dispatch.LONG_WORD_SETS`, the Python mirror this module imports,
# still stops at `0x40` and is owned by another file, so it is supplemented here rather than
# edited there. Without this, every title's own measured `0x41 = 2` is reported as a DESYNC
# against a `None` -- which is what Death Knights' first round-35 run printed, and it is a defect
# in the mirror, not in the binary.
BASE_TABLE_EXTENSIONS: dict[int, int] = {0x41: 2}


def effective_word_set(opcode: int, dialect: dict[str, Any]) -> int | None:
    """The operand count `opcode` carries under `dialect`, applying the same precedence
    `disassemble.ts` does: opcodeOverrides > wordSetOverrides > base KRYNN_GEN1_OPCODES (dense
    0x00-0x40 only). `None` when nothing in this universe has an opinion (an extension opcode with
    no override at all)."""
    if opcode == SHORT_MENU_OPCODE and dialect.get("has_short_menu"):
        return SHORT_MENU_WORD_SET
    overrides = dialect.get("opcode_overrides", {})
    if opcode in overrides:
        return overrides[opcode]
    word_set_overrides = dialect.get("word_set_overrides", {})
    if opcode in word_set_overrides:
        return word_set_overrides[opcode]
    if opcode in LONG_WORD_SETS:
        return LONG_WORD_SETS[opcode]
    return BASE_TABLE_EXTENSIONS.get(opcode)


def retail_files(game: str) -> tuple[Path, Path]:
    profile = GAME_PROFILES[game]
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    paths: dict[str, Path] = {}
    for profile_id in (profile["profile_id"], "curse-of-the-azure-bonds"):
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        if install is None:
            raise FileNotFoundError(f"install not found: {profile_id}")
        files = goldbox_corpus.file_index(install)
        paths[profile_id] = files["GAME.OVR"]
    return paths[profile["profile_id"]], paths["curse-of-the-azure-bonds"]


def read_game_bytes(game: str, path: Path) -> bytes:
    """Read `path` and refuse (loudly) anything that does not open with this title's own expected
    magic -- the same two-sided-by-construction null `map_matrix_ecl_dispatch.read_matrix_bytes`
    uses: pointing this tool at the wrong title's `GAME.OVR` (e.g. Buck's or Secret's own `TPOV`
    file under `--game pools`) must fail with a clear reason, not silently produce a map."""
    profile = GAME_PROFILES[game]
    data = path.read_bytes()
    magic = data[:4]
    if magic != profile["magic"]:
        raise ValueError(
            f"{path}: expected {profile['magic']!r} overlay magic for --game {game}, got {magic!r}"
        )
    if len(data) != profile["expected_size"]:
        raise ValueError(
            f"{path}: expected {profile['expected_size']} bytes for --game {game}, got {len(data)}"
        )
    return data


def _prologue_starts(data: bytes) -> list[int]:
    return sorted(
        {
            offset
            for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")
            for offset in range(len(data))
            if data.startswith(pattern, offset)
        }
    )


def rank_candidates(data: bytes, reference: FunctionShape) -> list[tuple[float, float, FunctionShape]]:
    """Every Borland-prologue-shaped candidate function in `data`, ranked by sequence similarity to
    `reference` (ties broken by trigram Jaccard) -- the full ranking `nearest_function` collapses to
    just its winner. Used to compute the runner-up and same-length nulls."""
    ref_grams = set(zip(reference.tokens, reference.tokens[1:], reference.tokens[2:]))
    ranked: list[tuple[float, float, FunctionShape]] = []
    for start in _prologue_starts(data):
        candidate = disassemble_shape(data, start)
        if candidate is None:
            continue
        ratio = SequenceMatcher(None, reference.tokens, candidate.tokens, autojunk=False).ratio()
        grams = set(zip(candidate.tokens, candidate.tokens[1:], candidate.tokens[2:]))
        jaccard = len(ref_grams & grams) / max(1, len(ref_grams | grams))
        ranked.append((ratio, jaccard, candidate))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return ranked


def structural_match_with_nulls(data: bytes, reference: FunctionShape) -> dict[str, Any]:
    ranked = rank_candidates(data, reference)
    if not ranked:
        raise ValueError("no candidate functions found")
    best_ratio, best_jaccard, best = ranked[0]
    runner_up_ratio = ranked[1][0] if len(ranked) > 1 else None
    tolerance = max(16, int(best.size * 0.1))
    same_length = [
        row for row in ranked[1:] if abs(row[2].size - best.size) <= tolerance
    ]
    same_length_null = max((row[0] for row in same_length), default=None)
    return {
        "winner": best,
        "sequence_similarity": best_ratio,
        "trigram_jaccard": best_jaccard,
        "candidate_count": len(ranked),
        "runner_up_similarity_null": runner_up_ratio,
        "same_length_candidate_count": len(same_length),
        "same_length_similarity_null": same_length_null,
    }


def _first_prefetch_far_call(data: bytes, offset: int, max_size: int = 1024) -> str | None:
    """The op_str of the first `lcall` in the handler at `offset` that is IMMEDIATELY preceded by
    `push ax` which is ITSELF immediately preceded by `mov al, imm` -- the exact
    `mov al,N; push ax; lcall <target>` three-instruction idiom every dialect docblock in
    `disassemble.ts` cites, not merely "the first far call of any kind".

    `map_buck_ecl_dispatch._first_far_call` (imported nowhere in this module for exactly this
    reason) returns the textually first `lcall`, which on Gateway and Treasures is a Borland
    large-local-frame stack-probe helper most handlers call before touching AL at all (observed
    directly: Gateway opcode 0x03's handler at file `0xb9a` opens `mov ax,0x204; lcall 0x343,0x4df;
    sub sp,0x204` -- a stack-frame-size argument in AX, not an operand count in AL -- immediately
    followed by the REAL `mov al,2; push ax; lcall 0x53,0x2a`, which the naive first-far-call
    heuristic never reaches because it already returned on the stack-probe call). Buck's own
    handlers apparently don't carry this prologue (its own tool's naive version worked there), but
    Gateway/Treasures's compiler emits it whenever a handler allocates a large enough local buffer,
    so this stricter version is required for those two titles' bytes specifically -- confirmed by
    disassembly, not assumed."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    prev2: Any = None
    prev1: Any = None
    for ins in md.disasm(data[offset:offset + max_size], offset):
        if ins.mnemonic == "lcall":
            is_push_ax = (
                prev1 is not None
                and prev1.mnemonic == "push"
                and prev1.operands
                and prev1.operands[0].type == capstone.x86.X86_OP_REG
                and prev1.reg_name(prev1.operands[0].reg) == "ax"
            )
            is_mov_al = (
                prev2 is not None
                and prev2.mnemonic == "mov"
                and len(prev2.operands) == 2
                and prev2.operands[0].type == capstone.x86.X86_OP_REG
                and prev2.reg_name(prev2.operands[0].reg) == "al"
                and prev2.operands[1].type == capstone.x86.X86_OP_IMM
            )
            if is_push_ax and is_mov_al:
                return ins.op_str
        if ins.mnemonic in {"ret", "retf", "iret"}:
            return None
        prev2, prev1 = prev1, ins
    return None


def derive_operand_parser_call_target_strict(
    data: bytes, dispatch_rows: list[dict[str, int]], min_share: float = 0.5
) -> tuple[str, int, int]:
    """Same contract as `map_buck_ecl_dispatch.derive_operand_parser_call_target`, but using
    `_first_prefetch_far_call` above instead of "first far call of any kind" -- see that function's
    docstring for why Gateway/Treasures need the stricter version."""
    from collections import Counter

    counts: Counter[str] = Counter()
    total = 0
    for row in dispatch_rows:
        target = _first_prefetch_far_call(data, row["handler_file_offset"])
        total += 1
        if target is not None:
            counts[target] += 1
    if not counts:
        raise ValueError("no handler's mov al,N; push ax; lcall idiom found -- cannot derive a target")
    target, count = counts.most_common(1)[0]
    if count / total < min_share:
        raise ValueError(
            f"no operand-parser call target reaches {min_share:.0%} of handlers "
            f"(best: {target!r} at {count}/{total})"
        )
    return target, count, total


def _handler_pc_ops(data: bytes, offset: int, call_target: str | None, max_size: int = 512) -> dict[str, Any]:
    """Disassemble one handler body and report the absolute `word ptr [imm]` cells it `inc`s and
    `dec`s, plus the operand count its `mov al,N; push ax; lcall <call_target>` prefetch declares
    (None when it makes no such call). Stops at the first ret/retf/iret, like every other reader
    in this module."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    incs: list[int] = []
    decs: list[int] = []
    prefetch_n: int | None = None
    pending_al: int | None = None
    for ins in md.disasm(data[offset:offset + max_size], offset):
        if ins.mnemonic == "mov" and len(ins.operands) == 2:
            left, right = ins.operands
            if (
                left.type == capstone.x86.X86_OP_REG
                and ins.reg_name(left.reg) == "al"
                and right.type == capstone.x86.X86_OP_IMM
            ):
                pending_al = right.imm & 0xFF
        if ins.mnemonic in ("inc", "dec") and ins.operands:
            op0 = ins.operands[0]
            if (
                op0.type == capstone.x86.X86_OP_MEM
                and op0.mem.base == 0
                and op0.mem.index == 0
                and ins.op_str.startswith("word ptr")
            ):
                (incs if ins.mnemonic == "inc" else decs).append(op0.mem.disp & 0xFFFF)
        if call_target is not None and ins.mnemonic == "lcall" and ins.op_str == call_target and prefetch_n is None:
            prefetch_n = pending_al
        if ins.mnemonic in {"ret", "retf", "iret"}:
            break
    return {"incs": incs, "decs": decs, "prefetch_n": prefetch_n}


def zero_operand_by_pc_advance(
    data: bytes, dispatch_rows: list[dict[str, int]], call_target: str | None
) -> dict[str, Any]:
    """A SECOND operand-count reader, for the handlers `operand_word_sets` leaves unmeasured.

    A handler that never calls the operand parser still has to step the ECL program counter past
    its own opcode byte, and the compiler emits that as a bare `inc word ptr [PC]` at the top of
    the body. So `no prefetch call AND inc [PC]` reads as **zero operands consumed** -- the same
    standard `map_buck_ecl_dispatch.stop_reasons`'s `no_far_call` verdict already uses, but with
    the PC store as positive evidence rather than the absence of a call as negative evidence.

    THE PC CELL IS DERIVED FROM THE FILE, NEVER PASSED IN. It is the plurality `inc word ptr [imm]`
    target among handlers that make no prefetch call. Two independent cross-checks are reported so
    the caller can refuse the whole result rather than trust the plurality:

      * `pc_inc_unanimous` -- was there any competing address at all among those handlers?
      * `pc_dec_opcodes`   -- which opcodes `dec` the SAME cell? A count-driven opcode must, right
        before its second, register-argument prefetch (the `dec [0xb7f9]` idiom `ECL_GEN2`'s own
        docblock records for DQK). If nothing `dec`s it, the cell is probably not the PC.

    AND THE NULL IS COMPUTED HERE, not left to the caller: `false_positive_opcodes` lists every
    handler that BOTH declares a prefetch of N >= 1 AND `inc`s the candidate cell. Those two facts
    are contradictory -- an operand-consuming handler does not also hand-step the PC -- so a
    non-empty list means the idiom is not a zero-operand signal in this binary and the caller must
    discard it. On Death Knights of Krynn it is empty out of 47 prefetch-measured handlers.
    """
    if not dispatch_rows:
        return {"pc_cell": None, "zero_operand_opcodes": [], "false_positive_opcodes": [], "reason": "no dispatch rows"}
    from collections import Counter

    per_opcode = {
        row["opcode"]: _handler_pc_ops(data, row["handler_file_offset"], call_target)
        for row in dispatch_rows
    }
    candidates: Counter[int] = Counter()
    for info in per_opcode.values():
        if info["prefetch_n"] is None and info["incs"]:
            candidates[info["incs"][0]] += 1
    if not candidates:
        return {"pc_cell": None, "zero_operand_opcodes": [], "false_positive_opcodes": [], "reason": "no inc [imm] among no-prefetch handlers"}
    pc_cell, pc_votes = candidates.most_common(1)[0]
    return {
        "pc_cell": pc_cell,
        "pc_cell_hex": f"0x{pc_cell:04x}",
        "pc_inc_votes": pc_votes,
        "pc_inc_candidates": {f"0x{addr:04x}": count for addr, count in candidates.most_common()},
        "pc_inc_unanimous": len(candidates) == 1,
        "pc_dec_opcodes": sorted(op for op, info in per_opcode.items() if pc_cell in info["decs"]),
        "zero_operand_opcodes": sorted(
            op for op, info in per_opcode.items() if info["prefetch_n"] is None and pc_cell in info["incs"]
        ),
        "false_positive_opcodes": sorted(
            op
            for op, info in per_opcode.items()
            if info["prefetch_n"] is not None and info["prefetch_n"] >= 1 and pc_cell in info["incs"]
        ),
        "prefetch_measured_count": sum(1 for info in per_opcode.values() if info["prefetch_n"] is not None),
        "reason": None,
    }


def check_prefetch_at(
    data: bytes, offset: int, call_target: str, max_size: int = 48
) -> dict[str, Any]:
    """Does the code AT `offset` (not the handler's own entry -- the EXACT docblock-cited offset)
    hold the `mov al,N; push ax; lcall <call_target>` prefetch idiom before its first
    ret/retf/iret? Returns the quoted raw bytes either way, so a failed verdict is still evidence,
    not a silent skip."""
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    pending_al: int | None = None
    found_n: int | None = None
    end = offset
    for ins in md.disasm(data[offset:offset + max_size], offset):
        end = ins.address + ins.size
        if ins.mnemonic == "mov" and len(ins.operands) == 2:
            left, right = ins.operands
            if (
                left.type == capstone.x86.X86_OP_REG
                and ins.reg_name(left.reg) == "al"
                and right.type == capstone.x86.X86_OP_IMM
            ):
                pending_al = right.imm & 0xFF
        if ins.mnemonic == "lcall" and ins.op_str == call_target:
            found_n = pending_al
            break
        if ins.mnemonic in {"ret", "retf", "iret"}:
            break
    raw = data[offset:end]
    return {
        "offset": offset,
        "holds_prefetch_idiom": found_n is not None,
        "measured_n": found_n,
        "raw_bytes_hex": raw.hex(),
    }


POOLS_DOCBLOCK_HANDLERS: dict[int, tuple[int, int]] = {
    # opcode -> (docblock file offset, docblock-claimed operand count)
    0x1F: (0x264A, 1),
    0x21: (0x0E9E, 2),
    0x37: (0x1ECA, 2),
    0x41: (0x240C, 2),
}


def partition_opcodes(
    measured: dict[int, int | None],
    current_dialect: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for opcode in range(0x00, 0x50):
        dialect_val = effective_word_set(opcode, current_dialect)
        alt_val = effective_word_set(opcode, PLAIN_SHORT_DIALECT)
        measured_val = measured.get(opcode)
        if measured_val is None:
            partition = "vacuous"
        elif dialect_val == alt_val:
            partition = "free"
        else:
            partition = "discriminating"
        agrees_with_dialect = None if measured_val is None else measured_val == dialect_val
        agrees_with_alt = None if measured_val is None else measured_val == alt_val
        # NOT restricted to partition == "discriminating": a "free" opcode (dialect and alt agree
        # with EACH OTHER) can still be a desync if the BINARY disagrees with both -- this is
        # exactly Treasures' own 0x37, where neither hypothesis overrides the shared base value (so
        # they "agree" and the opcode reads `free`) while the handler's own prefetch measures a
        # THIRD value the corpus-agreement partition alone would never surface. Round 32 R4's own
        # near-miss: an earlier version of this function only set `desync` inside the
        # `discriminating` branch and silently missed this exact opcode -- see
        # `test_map_gen1_ecl_dispatch.py::test_free_opcode_can_still_be_a_hidden_desync` for the
        # mutation this shape is pinned against.
        desync = agrees_with_dialect is False
        rows.append(
            {
                "opcode": opcode,
                "measured_word_set": measured_val,
                "current_dialect_word_set": dialect_val,
                "plain_short_word_set": alt_val,
                "partition": partition,
                "agrees_with_dialect": agrees_with_dialect,
                "agrees_with_alt": agrees_with_alt,
                "desync": desync,
            }
        )
    return rows


def build_report(game: str, oracle_path: Path = DEFAULT_ORACLE) -> dict[str, Any]:
    if game not in ("pools", "gateway", "treasures", "dok"):
        raise ValueError(f"unsupported --game {game!r} (supported: pools, gateway, treasures, dok)")
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    game_path, coab_path = retail_files(game)
    data = read_game_bytes(game, game_path)
    coab = coab_path.read_bytes()

    references = {
        "dispatcher": disassemble_shape(coab, oracle_offset(oracle, "commandTable")),
        "operand_parser": disassemble_shape(coab, oracle_offset(oracle, "@parse_command_sub$q4Byte")),
    }
    if any(value is None for value in references.values()):
        raise ValueError("failed to disassemble CoAB oracle functions")

    matches: dict[str, Any] = {}
    for name, reference in references.items():
        assert reference is not None
        result = structural_match_with_nulls(data, reference)
        matches[name] = {
            "coab": asdict(reference),
            "game": asdict(result["winner"]),
            "sequence_similarity": result["sequence_similarity"],
            "trigram_jaccard": result["trigram_jaccard"],
            "candidate_count": result["candidate_count"],
            "runner_up_similarity_null": result["runner_up_similarity_null"],
            "same_length_candidate_count": result["same_length_candidate_count"],
            "same_length_similarity_null": result["same_length_similarity_null"],
        }

    dispatcher = FunctionShape(**matches["dispatcher"]["game"])
    linear_rows = dispatch_table(data, dispatcher)
    linear_opcodes = {row["opcode"] for row in linear_rows}
    if linear_opcodes:
        linear_missing = {
            value
            for value in range(min(linear_opcodes), max(linear_opcodes) + 1)
            if value not in linear_opcodes
        }
    else:
        linear_missing = set()
    fallthrough = resolve_fallthrough_dispatch(data, dispatcher, linear_missing)
    for row in linear_rows:
        row["source"] = "linear"
    rows = linear_rows + [
        {"opcode": opcode, "handler_file_offset": handler, "source": "fallthrough-merge"}
        for opcode, handler in sorted(fallthrough.items())
    ]
    rows.sort(key=lambda row: row["opcode"])
    opcodes = [row["opcode"] for row in rows]
    missing = [value for value in range(min(opcodes), max(opcodes) + 1) if value not in opcodes] if opcodes else []

    dispatch_by_opcode = {row["opcode"]: row["handler_file_offset"] for row in rows}

    try:
        call_target, call_target_first_count, handler_count = derive_operand_parser_call_target_strict(data, rows)
        measured = operand_word_sets(data, rows, call_target)
        reasons = stop_reasons(data, rows, measured, call_target)
    except ValueError as exc:
        call_target, call_target_first_count, handler_count = None, 0, len(rows)
        measured = {row["opcode"]: None for row in rows}
        reasons = {row["opcode"]: {"reason": f"derivation_failed: {exc}", "far_call_targets": []} for row in rows}

    # Second reader (round 35 R1). Only its zero verdicts are merged into `measured`, and only for
    # opcodes the prefetch reader left unmeasured -- it can never overwrite a prefetch measurement,
    # and it is discarded entirely if its own null fires.
    pc_idiom = zero_operand_by_pc_advance(data, rows, call_target)
    pc_idiom_applied: list[int] = []
    if pc_idiom["pc_cell"] is not None and not pc_idiom["false_positive_opcodes"]:
        for opcode in pc_idiom["zero_operand_opcodes"]:
            if measured.get(opcode) is None:
                measured[opcode] = 0
                pc_idiom_applied.append(opcode)
                reasons[opcode] = {
                    "reason": f"zero_operand_by_pc_advance (inc word ptr [{pc_idiom['pc_cell_hex']}], no prefetch call)",
                    "far_call_targets": reasons.get(opcode, {}).get("far_call_targets", []),
                }

    partition_rows = partition_opcodes(measured, CURRENT_DIALECTS[game])

    docblock_verdict: dict[str, Any] | None = None
    if game == "pools":
        docblock_verdict = {}
        for opcode, (offset, claimed_n) in POOLS_DOCBLOCK_HANDLERS.items():
            check = check_prefetch_at(data, offset, call_target) if call_target else {
                "offset": offset, "holds_prefetch_idiom": False, "measured_n": None, "raw_bytes_hex": data[offset:offset+16].hex(),
            }
            dispatcher_offset = dispatch_by_opcode.get(opcode)
            docblock_verdict[f"0x{opcode:02x}"] = {
                "docblock_offset": f"0x{offset:x}",
                "docblock_claimed_n": claimed_n,
                "dispatcher_routes_opcode_to_offset": (
                    f"0x{dispatcher_offset:x}" if dispatcher_offset is not None else None
                ),
                "dispatcher_agrees_with_docblock_offset": dispatcher_offset == offset,
                "holds_prefetch_idiom_at_docblock_offset": check["holds_prefetch_idiom"],
                "measured_n_at_docblock_offset": check["measured_n"],
                "matches_claimed_n": check["measured_n"] == claimed_n,
                "raw_bytes_hex": check["raw_bytes_hex"],
            }

    return {
        "schema_version": 1,
        "game": game,
        "provenance": "same-subsystem-structural-map-verified-against-coab-oracle-and-retail-bytes",
        "game_path": goldbox_corpus.slash(game_path),
        "coab_path": goldbox_corpus.slash(coab_path),
        "magic": GAME_PROFILES[game]["magic"].decode("ascii"),
        "file_size": len(data),
        "matches": matches,
        "dispatch": rows,
        "opcodes": opcodes,
        "opcode_min": min(opcodes) if opcodes else None,
        "opcode_max": max(opcodes) if opcodes else None,
        "handler_count": len(rows),
        "fallthrough_resolved_count": len(fallthrough),
        "missing_within_range": missing,
        "operand_parser_call_target": {
            "target": call_target,
            "handlers_using_it_first": call_target_first_count,
            "handlers_total": handler_count,
        },
        "zero_operand_by_pc_advance": {
            **pc_idiom,
            "applied_opcodes": sorted(pc_idiom_applied),
        },
        "word_sets": {str(opcode): value for opcode, value in measured.items()},
        "stop_reasons": {str(opcode): info for opcode, info in reasons.items()},
        "partition": partition_rows,
        "partition_totals": {
            "discriminating": sum(1 for row in partition_rows if row["partition"] == "discriminating"),
            "free": sum(1 for row in partition_rows if row["partition"] == "free"),
            "vacuous": sum(1 for row in partition_rows if row["partition"] == "vacuous"),
            "desync": sum(1 for row in partition_rows if row["desync"]),
        },
        "pools_docblock_verdict": docblock_verdict,
        "claim_boundary": (
            "Dispatcher/operand-parser ROLES are established by same-subsystem structural identity "
            "against the CoAB oracle, measured directly on this title's own real GAME.OVR bytes "
            "(magic and size both asserted, not assumed). Per-opcode word sets are measured from "
            "each handler's own operand-parser prefetch call (mov al,N; push ax; lcall <derived "
            "target>), not inferred from corpus statistics or another title's dialect. The runner-up "
            "and same-length similarity nulls quantify how decisively the winning candidate stands "
            "out from every OTHER function in the file of comparable shape/size."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    game = report["game"]
    title = {
        "pools": "Pools of Darkness",
        "gateway": "Gateway to the Savage Frontier",
        "treasures": "Treasures of the Savage Frontier",
        "dok": "Death Knights of Krynn",
    }[game]
    dispatcher = report["matches"]["dispatcher"]
    parser = report["matches"]["operand_parser"]
    totals = report["partition_totals"]
    lines = [
        f"# {title} ECL Dispatcher Map",
        "",
        "> Generated by `tools/map_gen1_ecl_dispatch.py --game "
        f"{game}`. Do not edit by hand.",
        "",
        f"- `{title}` `GAME.OVR` magic: `{report['magic']}`, size `{report['file_size']}` bytes (both asserted).",
        f"- Dispatcher: `GAME.OVR:0x{dispatcher['game']['offset']:x}` ({dispatcher['game']['instruction_count']} instructions).",
        f"- CoAB oracle dispatcher: `GAME.OVR:0x{dispatcher['coab']['offset']:x}` ({dispatcher['coab']['instruction_count']} instructions).",
        f"- Dispatcher sequence similarity: `{dispatcher['sequence_similarity']:.4f}`; trigram Jaccard: `{dispatcher['trigram_jaccard']:.4f}`.",
        f"  - NULL (alternative: this is just some other function, not the dispatcher) -- global runner-up "
        f"of `{dispatcher['candidate_count']}` candidates: `{dispatcher['runner_up_similarity_null']}`; "
        f"same-length runner-up of `{dispatcher['same_length_candidate_count']}` same-length candidates: "
        f"`{dispatcher['same_length_similarity_null']}`.",
        f"- Operand parser: `GAME.OVR:0x{parser['game']['offset']:x}`; CoAB oracle: `0x{parser['coab']['offset']:x}`.",
        f"- Operand-parser sequence similarity: `{parser['sequence_similarity']:.4f}`; trigram Jaccard: `{parser['trigram_jaccard']:.4f}`.",
        f"  - NULL -- global runner-up of `{parser['candidate_count']}` candidates: `{parser['runner_up_similarity_null']}`; "
        f"same-length runner-up of `{parser['same_length_candidate_count']}` same-length candidates: "
        f"`{parser['same_length_similarity_null']}`.",
        f"- Dispatches `{report['handler_count']}` opcodes from "
        + (f"`0x{report['opcode_min']:02x}` through `0x{report['opcode_max']:02x}`" if report['opcode_min'] is not None else "(none)")
        + f"; `{report['fallthrough_resolved_count']}` recovered by fallthrough-merge; "
        f"missing in range: `{[hex(v) for v in report['missing_within_range']]}`.",
        f"- Operand-parser call target (derived from this title's own handlers): `{report['operand_parser_call_target']['target']}`, "
        f"the FIRST far call in {report['operand_parser_call_target']['handlers_using_it_first']}/"
        f"{report['operand_parser_call_target']['handlers_total']} dispatched handlers.",
        "",
        "## Per-opcode partition (0x00-0x4f): current dialect vs plain ECL_GEN1_SHORT, against the binary",
        "",
        f"Totals: discriminating **{totals['discriminating']}**, free **{totals['free']}**, "
        f"vacuous **{totals['vacuous']}**, desync (binary contradicts the shipped dialect) **{totals['desync']}**.",
        "",
        "| Opcode | Measured (binary) | Current dialect | Plain ECL_GEN1_SHORT | Partition | Agrees w/ dialect | Agrees w/ alt |",
        "| ---: | ---: | ---: | ---: | --- | --- | --- |",
        *[
            f"| `0x{row['opcode']:02x}` | `{row['measured_word_set']}` | `{row['current_dialect_word_set']}` | "
            f"`{row['plain_short_word_set']}` | {row['partition']}{' (DESYNC)' if row['desync'] else ''} | "
            f"{row['agrees_with_dialect']} | {row['agrees_with_alt']} |"
            for row in report["partition"]
        ],
        "",
    ]
    if report["pools_docblock_verdict"] is not None:
        lines += [
            "## The Pools docblock verdict: do the four cited offsets hold the prefetch idiom with the claimed counts?",
            "",
            "| Opcode | Docblock offset | Claimed N | Dispatcher routes opcode here? | Holds prefetch idiom | Measured N | Matches claim | Raw bytes |",
            "| ---: | ---: | ---: | --- | --- | ---: | --- | --- |",
        ]
        for opcode_str, row in report["pools_docblock_verdict"].items():
            lines.append(
                f"| `{opcode_str}` | `{row['docblock_offset']}` | `{row['docblock_claimed_n']}` | "
                f"{row['dispatcher_routes_opcode_to_offset']} ({row['dispatcher_agrees_with_docblock_offset']}) | "
                f"{row['holds_prefetch_idiom_at_docblock_offset']} | `{row['measured_n_at_docblock_offset']}` | "
                f"{row['matches_claimed_n']} | `{row['raw_bytes_hex']}` |"
            )
        lines.append("")
    lines += [
        "## Opcode Handlers",
        "",
        "| Opcode | Handler file offset | Measured word set | Source | Stop reason (if unmeasured) |",
        "| ---: | ---: | ---: | --- | --- |",
        *[
            f"| `0x{row['opcode']:02x}` | `0x{row['handler_file_offset']:x}` | `{report['word_sets'][str(row['opcode'])]}` | {row['source']} | "
            + (
                (
                    lambda info: f"{info['reason']}"
                    + (f" ({', '.join(info['far_call_targets'])})" if info.get("far_call_targets") else "")
                )(report["stop_reasons"][str(row["opcode"])])
                if str(row["opcode"]) in report.get("stop_reasons", {})
                else ""
            )
            + " |"
            for row in report["dispatch"]
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
    parser.add_argument("--game", required=True, choices=["pools", "gateway", "treasures", "dok"])
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=None)
    parser.add_argument("--markdown", type=Path, default=None)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    # `dok` writes `-v2` by default ON PURPOSE. `build/dok-ecl-dispatch-map.json` and
    # `docs/engine/research/dok-ecl-dispatch-map.md` are the 2026-07-17 v1 artifacts produced by
    # the DIFFERENT tool `tools/map_dok_ecl_dispatch.py`, and round 35 R1 uses their 54
    # handler_file_offsets as this pipeline's tooling control. A default that overwrote the
    # control with output from the thing being controlled would destroy the check -- the
    # "a golden produced by the code under test cannot adjudicate that code" rule, applied to a
    # file path. Pass --json/--markdown explicitly to override.
    suffix = "-v2" if args.game == "dok" else ""
    json_path = args.json or goldbox_corpus.REPO_ROOT / f"build/{args.game}-ecl-dispatch-map{suffix}.json"
    markdown_path = args.markdown or goldbox_corpus.REPO_ROOT / f"docs/engine/research/{args.game}-ecl-dispatch-map{suffix}.md"
    report = build_report(args.game, args.oracle)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    if args.strict:
        weak = [name for name, row in report["matches"].items() if row["sequence_similarity"] < 0.8]
        if weak:
            raise SystemExit(f"strict failure: weak {args.game} ECL mapping {weak}")
    print(
        f"{args.game} ecl map: dispatcher 0x{report['matches']['dispatcher']['game']['offset']:x} "
        f"({report['matches']['dispatcher']['sequence_similarity']:.3f}), "
        f"parser 0x{report['matches']['operand_parser']['game']['offset']:x} "
        f"({report['matches']['operand_parser']['sequence_similarity']:.3f}), "
        f"partition: {report['partition_totals']}"
    )


if __name__ == "__main__":
    main()
