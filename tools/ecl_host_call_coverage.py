#!/usr/bin/env python3
"""Quantify ECL host-call coverage: what fraction of the ECL work retail CoK/DoK scripts ask
for is actually APPLIED by the native VM (`native/src/ccecl.asm`), versus recorded and skipped.

Background (verified against the source before writing this tool, not assumed; the paragraph
below is the ORIGINAL 2026-09-09 finding, kept for history -- see the FIXED note right after it):
`op_call` (opcode 0x2D CALL) computes a routine id from its operand and compares it against seven
named constants (0xae11 redraw dungeon view, 0x0001/0x0002 SetupDuel, 0x3201 contextual sound,
0x401f MovePositionForward, 0x4019 refresh outdoor wall type, 0xe804 advance animated picture).
Every `je .known` landed on a block that was character-for-character identical to the code the
seven comparisons fell through to when NONE of them matched:

    call record_call_event
    mov  ax, [opp]
    mov  [pc], ax
    ret

Seven comparisons selecting between two identical paths. The id list read as dispatch and was a
research annotation, not live host-routine dispatch -- CALL always just recorded the event and
advanced `pc` the same way regardless of which (if any) named id matched.

FIXED 2026-09-09, then extended 2026-09-12 after a DoK-own-byte check: `native/src/ccecl.asm`'s
`.known:` now reads `[call_routine_id]` and gives 3 of the 8 named ids -- 0xae11 (**112** CoK
occurrences), 0xadcc (**109** DoK occurrences), and 0xe804 (**69** combined = 24 CoK + 45 DoK)
-- genuinely
distinct native state/trace output, ground-truthed against COAB's decompiled `CMD_Call` switch
(`coab_extracted/engine/ovr003.cs`) and `DaxArray.NextFrame()`
(`coab_extracted/Classes/DaxFiles/DaxArray.cs`). Both attach their data as EXTRA OPERANDS on
the instruction's own 0x2D CALL trace event rather than as separate events, so the trace keeps
its one-instruction-one-event invariant and no GBSX count or #NN index pin in the flow suite
shifts: a position/facing pose snapshot (ARGC 2 -> 5) for
0xae11/0xadcc (the wall/roof id itself is NOT computed -- this VM has no GEO wall grid), and a
persistent picture-frame counter for 0xe804 (the numFrames wrap is NOT
modeled -- this VM does not track a loaded picture's frame count). The other 5 named ids
(SetupDuel x2, contextual sound, MovePositionForward, refresh outdoor wall type) are UNCHANGED
and still fall through to the vacuous tail above -- grounding them would need combat-duel,
sound-channel, and outdoor-wall-type state this VM does not own, and was deliberately left
undone rather than guessed. See `op_call_dispatch_diverges` below, which proves the
function-level divergence programmatically rather than by re-reading the source by eye, and
`tools/test_ecl_host_call_coverage.py::test_op_call_routine_id_dispatch_genuinely_diverges_for_grounded_ids`
which turns it into a standing check (formerly a `pytest.mark.xfail(strict=True)` pin of the
gap this fix closed).

CORRECTED 2026-09-10 -- the two figures in the paragraph above READ 307 and 114 when this file was
committed (f015c0e), and neither reproduces. State the FRAME with a count like this, because the
frame is what the wrong numbers were missing. The frame is the one this module's own tables use:
DISTINCT reachable code offsets that decode to opcode 0x2D, CFG-walked by
`count_reachable_opcodes` from each block's `header_entries` -- and the re-derivation reproduced
this module's published reachable-instruction totals EXACTLY before any per-id figure was read
out of it, so it is measuring in the same frame and not merely agreeing by luck. In that frame
CoK has 155 reachable CALL sites and DoK 166 (321 combined, the figure the
`call_scale_of_vacuous_dispatch` table already published), so **307 cannot be a count of anything
0xae11 does in CoK: it is larger than CoK's entire CALL population by a factor of two.** That is
the tell -- the rest of this file's generated report was computed correctly from the census all
along (112 + 69 = 181 grounded of 321 = 56%), and only the prose here was wrong.

RE-MEASURED 2026-09-10, hours later, and the population moved for a reason unrelated to the above:
opcode 0x41 gained a grounded extended-opcode definition for both Gen1 titles, so CFG walks that
used to STOP at an unknown 0x41 byte now continue past it. Reachable totals went 13,244 -> 13,544
(CoK) and 13,571 -> 14,277 (DoK); CALL sites went 154 -> 155 and 155 -> 166. **The 307/114
retraction above is unaffected by that** -- 307 still exceeds CoK's whole CALL population, now by
a factor of 1.98 rather than 2.0, and the "no frame tried reproduces them" verdict stands. The
figures in this paragraph are the current ones; where a superseded figure is quoted it is marked
as such rather than silently refreshed.

Four other frames were measured to see whether 307/114 came from any of them, and none produces
either number: linear decode with no reachability filter (0xae11 112, 0xe804 69), a raw 16-bit
word scan for the on-disk operand (0x2e10 -> 112 in CoK, 0x2dcb -> 111 in DoK), the naive raw
BYTE scan of opcode 0x2D that `naive_raw_byte_scan_count` performs (CoK 302, DoK 446 -- a
different quantity entirely, and the closest coincidence at 5 away from 307), and per-title
splits of either id. **So the honest statement is not "the frame was wrong" but "no frame tried
reproduces them".**

The single most common CALL routine id in DoK is **0xadcc, 109 of DoK's 166 reachable CALL
sites (66%)**. This is now grounded as the DoK redraw sibling: DoK `GAME.OVR:0x2ab1` is the
same CALL dispatcher shape as CoK `GAME.OVR:0x3c07`; its first arm compares `0xadcc`, directly
calls the DoK view routine, and returns, while the following `0x3204`, `0x401f`, `0x4019`, and
`0xe804` arms retain CoK's order. This moves combined grounded CALL coverage from 181/321 (56%)
to **290/321 (90%)** without claiming a GEO wall/roof calculation that CCECL cannot perform.

This module has three parts:

  (a) `extract_dispatch_chain` / `dispatch_map_from_comparisons` -- derive `ccecl.asm`'s
      opcode -> handler map PROGRAMMATICALLY, by simulating the byte-by-byte `cmp al,N / jcc`
      fallthrough chain in `exec_one` rather than hand-copying a parallel opcode list (a
      hand-maintained list has bitten this repo twice; see MEMORY.md `goldbox-golden-cannot
      -adjudicate-its-own-code.md`). Simulating the chain per candidate AL byte, rather than
      pattern-matching known idioms, is what makes the range form used for opcodes 0x16..0x1b
      (`cmp al,0x16 / jb op_default` then `cmp al,0x1b / jbe op_if`, mapping the whole inclusive
      range to `op_if`) come out correctly with no special-cased range detector to get subtly
      wrong -- and it would also handle a THIRD dispatch idiom this file doesn't know exists yet.

  (b) `count_reachable_opcodes` -- CFG-walk one decoded ECL block (reusing the exact decode/
      control-flow primitives `tools/gen1_ecl_encounter_scan.py` already proved against retail
      bytes: `decode_one`, `header_entries`, `successors`, `condition_holds`) and tally how many
      DISTINCT reachable code offsets decode to each opcode. Reachability, not raw byte-value
      scanning: an opcode-shaped byte sitting inside another instruction's OPERAND is not an
      occurrence of that opcode, and a naive `bytes.count()` over the raw block cannot tell the
      difference. See "The self-disagreeing prior measurement" in the companion doc for a
      demonstration of exactly how much that overcounts.

  (c) `build_report` -- combine (a) and (b) across CoK's and DoK's own retail `ECL{1,2,3}.DAX`
      (decoded in pure Python via `goldbox_corpus.read_dax_blocks` -> `dax_decode`, never via
      `EclDump.exe`) into a coverage table: implemented-over-used, per title AND combined, with
      unimplemented opcodes ranked by how often they actually occur in the wild.

2026-09-23 (plan §33.4): `04a7f9d9` (then `6294d929`, `b9051a5b`) gated `exec_one`'s 0x31 entry
on `is_gen2`, `short_menu_opframes` and `interactive_menu` instead of dispatching it with a
plain `cmp al,0x31 / je op_script_effect`. The old `extract_dispatch_chain` read the gate's
closing `jmp` as the whole chain's fallback -- it does not evaluate any flag, it just returns at
the first unconditional `jmp` it meets -- so every opcode declared after 0x31 in `exec_one` was
silently dropped from the derived map and nine tests went red. The pinned coverage figures were
correct throughout; the bug was in this analyzer, not in `ccecl.asm` or in the numbers. The
parser now resolves such a gate against an explicit flag configuration (see
`DEFAULT_DISPATCH_FLAGS` below) and raises rather than guessing on an unmodelled flag or an
unrecognized block shape. Under `/!` (CCECL's interactive-menu switch) with a DoK install, 0x31
genuinely reaches `op_horizontal_menu` -- it is APPLIED there, not merely recorded -- and this
report does not measure that mode; it measures both Gen1 titles run without `/!`.

Usage:

    python tools/ecl_host_call_coverage.py --json build/ecl-host-call-coverage.json \
        --markdown docs/engine/research/ecl-host-call-coverage.md
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, deque
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

import goldbox_corpus
from dqk_ca03_stream_decode import OPCODES, Opcode
from gen1_ecl_encounter_scan import (
    ALL_COMPARE_OUTCOMES,
    condition_holds,
    DEFAULT_ADDRESS_ADDEND,
    ECL_HEADER_LEN,
    PROFILE_ADDRESS_ADDENDS,
    decode_one,
    header_entries,
    opcodes_for_profile,
    successors,
    word_sets_for_profile,
)

REPO_ROOT = goldbox_corpus.REPO_ROOT
CCECL_PATH = REPO_ROOT / "native" / "src" / "ccecl.asm"
DEFAULT_JSON = REPO_ROOT / "build" / "ecl-host-call-coverage.json"
DEFAULT_MARKDOWN = REPO_ROOT / "docs" / "engine" / "research" / "ecl-host-call-coverage.md"

# The two Gen1 titles this tool measures. Both have their retail ECL{1,2,3}.DAX at the repo root
# per CLAUDE.md's workspace layout, so `goldbox_corpus.choose_install` finds them without any
# path hardcoded here.
TITLES: dict[str, str] = {
    "champions-of-krynn": "Champions of Krynn",
    "death-knights-of-krynn": "Death Knights of Krynn",
}

DISPATCH_START_LABEL = "exec_one"
DEFAULT_MAX_STATES = 50000

# The flag configuration this module's report measures: BOTH Gen1 titles (CoK and DoK), CCECL
# run WITHOUT the interactive `/!` switch. `short_menu_opframes` is 1 for a DoK install
# (`DKK.CFG`) and 0 for a CoK one, but that difference cannot change any dispatch target here
# while `interactive_menu` is 0 -- see the 0x31 gate in `native/src/ccecl.asm`'s `exec_one`
# (module docstring, 2026-09-23 paragraph, plan §33.4). `None` passed to
# `extract_dispatch_chain`/`build_dispatch_map` means "use this configuration".
DEFAULT_DISPATCH_FLAGS: dict[str, int] = {
    "is_gen2": 0,
    "is_matrix": 0,  # CoK/DoK have no Matrix marker; 0x4C keeps its zero frame.
    "short_menu_opframes": 0,
    "interactive_menu": 0,
}

# ---------------------------------------------------------------------------
# (a) Programmatic dispatch-table extraction from ccecl.asm
# ---------------------------------------------------------------------------

_CMP_AL_RE = re.compile(r"^\s*cmp\s+al,\s*(0x[0-9a-fA-F]+)\s*(?:;.*)?$")
_JCC_RE = re.compile(r"^\s*(je|jne|jb|jbe|ja|jae)\s+(\.?[A-Za-z_][A-Za-z0-9_.]*)\s*(?:;.*)?$")
_JMP_RE = re.compile(r"^\s*jmp\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:;.*)?$")
_GLOBAL_LABEL_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(?:;.*)?$")
# A flag-gate predicate line, e.g. "cmp byte [is_gen2], 0". Only ever appears inside a gated
# block opened by a top-level "cmp al, IMM / jne .LOCAL" (see `_parse_gated_block`).
_CMP_FLAG_RE = re.compile(
    r"^\s*cmp\s+byte\s+\[([A-Za-z_][A-Za-z0-9_]*)\],\s*"
    r"(0[xX][0-9a-fA-F]+|[0-9][0-9a-fA-F]*[hH]|[0-9]+)\s*(?:;.*)?$"
)


def read_asm_lines(asm_path: Path = CCECL_PATH) -> list[str]:
    return asm_path.read_text(encoding="utf-8", errors="replace").splitlines()


def _parse_gated_block(
    lines: list[str],
    after_jne_idx: int,
    local_label: str,
    flags: Mapping[str, int],
    gate_open_line: int,
) -> tuple[str, int]:
    """Parse a flag-gated dispatch sub-branch and resolve it to one target label.

    See the module docstring's 2026-09-23 paragraph (plan §33.4) for the idiom this parses,
    e.g. `native/src/ccecl.asm`'s `exec_one` 0x31 entry:

        cmp     al, 0x31
        jne     .not_short_menu
        cmp     byte [is_gen2], 1
        je      op_horizontal_menu
        cmp     byte [short_menu_opframes], 0
        je      op_script_effect
        cmp     byte [interactive_menu], 0
        je      op_script_effect
        jmp     op_horizontal_menu
    .not_short_menu:

    `after_jne_idx` is the line index right after the opening `jne LOCAL_LABEL` (already known
    to target a local label, i.e. one starting with '.'). The block is a sequence of
    `cmp byte [NAME], BYTE_CONSTANT` / `je LABEL`-or-`jne LABEL` pairs (LABEL global), terminated by an
    unconditional `jmp LABEL`, followed by the closing `LOCAL_LABEL:` line. `je` is taken iff
    `flags[NAME] == BYTE_CONSTANT`; `jne` is taken iff the values differ. Numeric enum values
    remain bytes, rather than being coerced to Boolean flags. The FIRST taken pair decides the
    target; if none is taken, the closing `jmp`'s target is the target. Every line is still
    consumed (to validate shape and find the closing label), even after a target is decided.

    Returns (target_label, index_of_line_after_the_closing_local_label).
    """
    j = after_jne_idx
    decided_target: str | None = None
    first = True
    while True:
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j >= len(lines):
            raise ValueError(
                f"ran off end of file inside gated block opened by 'jne {local_label}' "
                f"at line {gate_open_line + 1}"
            )
        line = lines[j]
        if not first:
            jmpm = _JMP_RE.match(line)
            if jmpm:
                if decided_target is None:
                    decided_target = jmpm.group(1)
                j += 1
                break
        cm = _CMP_FLAG_RE.match(line)
        if not cm:
            if first:
                raise ValueError(
                    f"'jne {local_label}' at line {gate_open_line + 1} is not followed by a "
                    f"flag compare -- got {line!r} at line {j + 1}"
                )
            raise ValueError(f"unexpected line inside gated block at line {j + 1}: {line!r}")
        name = cm.group(1)
        literal = cm.group(2)
        immediate = (int(literal[:-1], 16) if literal.lower().endswith("h") else
                     int(literal, 16) if literal.lower().startswith("0x") else int(literal, 10))
        if not 0 <= immediate <= 255:
            raise ValueError(f"gated block at line {j + 1} compares a non-byte constant {literal!r}")
        if name not in flags:
            raise ValueError(
                f"gated block at line {j + 1} references unmodelled flag {name!r} "
                f"(known flags: {sorted(flags)})"
            )
        value = flags[name]
        if not isinstance(value, int) or not 0 <= value <= 255:
            raise ValueError(f"gated block at line {j + 1} requires byte state for {name!r}, got {value!r}")
        k = j + 1
        while k < len(lines) and not lines[k].strip():
            k += 1
        if k >= len(lines):
            raise ValueError(f"ran off end of file looking for je/jne after flag compare at line {j + 1}")
        jm = _JCC_RE.match(lines[k])
        if jm is None or jm.group(1) not in ("je", "jne"):
            raise ValueError(
                f"expected 'je LABEL' or 'jne LABEL' after flag compare at line {j + 1}, "
                f"got: {lines[k]!r}"
            )
        mnemonic, label = jm.group(1), jm.group(2)
        if label.startswith("."):
            raise ValueError(
                f"a 'jne' to a local label is not followed by a flag compare -- flag compare "
                f"at line {j + 1} instead targets local label {label!r}, which this parser does "
                f"not support (nested gates are unmodelled)"
            )
        taken = (value == immediate) if mnemonic == "je" else (value != immediate)
        if taken and decided_target is None:
            decided_target = label
        j = k + 1
        first = False

    while j < len(lines) and not lines[j].strip():
        j += 1
    expected = f"{local_label}:"
    if j >= len(lines) or lines[j].strip() != expected:
        raise ValueError(
            f"gated block opened at line {gate_open_line + 1} is missing its closing "
            f"{expected!r} label"
        )
    assert decided_target is not None
    return decided_target, j + 1


def extract_dispatch_chain(
    lines: list[str],
    start_label: str = DISPATCH_START_LABEL,
    flags: Mapping[str, int] | None = None,
) -> tuple[list[tuple[int, str, str]], str, int, int]:
    """Return (comparisons, fallback_label, start_line_idx, end_line_idx).

    `comparisons` is the ordered list of (immediate, jcc_mnemonic, target_label) exactly as they
    appear after `start_label:`, in file order -- i.e. in the same order the CPU evaluates them
    as a linear cmp/jcc fallthrough chain. `fallback_label` is the target of the terminating
    unconditional `jmp` that closes the chain when nothing above matched.

    `flags` resolves any flag-gated sub-branch (see `_parse_gated_block`) against a concrete
    configuration; `None` means `DEFAULT_DISPATCH_FLAGS`. A gated entry is folded into a single
    `(imm, "je", resolved_target)` comparison, so a caller of this function never has to know the
    gate existed -- the return SHAPE is unchanged from before gates existed.
    """
    if flags is None:
        flags = DEFAULT_DISPATCH_FLAGS
    start = None
    for i, line in enumerate(lines):
        if line.strip() == f"{start_label}:":
            start = i
            break
    if start is None:
        raise ValueError(f"could not find {start_label}: label")

    comparisons: list[tuple[int, str, str]] = []
    i = start + 1
    while i < len(lines):
        line = lines[i]
        m = _CMP_AL_RE.match(line)
        if m:
            imm = int(m.group(1), 16)
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j >= len(lines):
                raise ValueError(f"ran off end of file looking for jcc after line {i + 1}")
            jm = _JCC_RE.match(lines[j])
            if not jm:
                raise ValueError(
                    f"expected a conditional jump after 'cmp al, ...' at line {i + 1}, "
                    f"got: {lines[j]!r}"
                )
            mnemonic, target = jm.group(1), jm.group(2)
            if mnemonic == "jne" and target.startswith("."):
                resolved_target, next_i = _parse_gated_block(
                    lines, j + 1, target, flags, gate_open_line=j
                )
                comparisons.append((imm, "je", resolved_target))
                i = next_i
                continue
            comparisons.append((imm, mnemonic, target))
            i = j + 1
            continue
        jmpm = _JMP_RE.match(line)
        if jmpm:
            return comparisons, jmpm.group(1), start, i
        i += 1
    raise ValueError(
        "did not find the terminating unconditional 'jmp' that closes the al dispatch chain"
    )


def _jcc_taken(al: int, imm: int, mnemonic: str) -> bool:
    if mnemonic == "je":
        return al == imm
    if mnemonic == "jne":
        return al != imm
    if mnemonic == "jb":
        return al < imm
    if mnemonic == "jbe":
        return al <= imm
    if mnemonic == "ja":
        return al > imm
    if mnemonic == "jae":
        return al >= imm
    raise ValueError(f"unhandled conditional-jump mnemonic {mnemonic!r}")


def dispatch_map_from_comparisons(
    comparisons: list[tuple[int, str, str]], fallback_label: str
) -> dict[int, str]:
    """Simulate the linear cmp/jcc chain for every possible AL (opcode byte) value 0..255.

    This is the piece that must handle BOTH dispatch idioms `ccecl.asm` actually uses: plain
    `cmp al,N / je LABEL` pairs, and the 0x16..0x1b range form (`cmp al,0x16 / jb op_default`
    then `cmp al,0x1b / jbe op_if`). Simulating byte-by-byte rather than pattern-matching either
    idiom means a range boundary can never be miscounted by one, and a third idiom introduced
    later would still be handled correctly without touching this function.
    """
    mapping: dict[int, str] = {}
    for al in range(256):
        target = fallback_label
        for imm, mnemonic, label in comparisons:
            if _jcc_taken(al, imm, mnemonic):
                target = label
                break
        mapping[al] = target
    return mapping


def build_dispatch_map(
    asm_path: Path = CCECL_PATH, flags: Mapping[str, int] | None = None
) -> tuple[dict[int, str], str, list[str], int, int]:
    lines = read_asm_lines(asm_path)
    comparisons, fallback_label, start, end = extract_dispatch_chain(lines, flags=flags)
    mapping = dispatch_map_from_comparisons(comparisons, fallback_label)
    return mapping, fallback_label, lines, start, end


# ---------------------------------------------------------------------------
# THE PRIMARY FINDING: op_script_effect is a RECORDER, not an implementation.
#
# native/src/ccecl.asm's `op_script_effect` (see its body) writes `cur_op` and its
# dialect-adjusted operands into `fx_script_events`, bumps `fx_script_count`, sets
# `FX_HAVE_SCRIPT`, and returns. It never touches game state beyond that log. An opcode
# dispatched to it is therefore NOT unimplemented in the "falls to op_default" sense used by
# the dispatch-coverage metric below -- dispatch genuinely succeeds -- but it is also not
# APPLIED: nothing the opcode asks for (print dialogue, clear the text box, show a picture,
# delay, award treasure, rob the party, show a menu) actually happens to the simulated game.
# A coverage metric that only asks "did dispatch reach a non-default handler" cannot see this
# gap at all. Both Krynn titles now read 1.000 under that metric: opcode 0x41
# reaches `op_award_xp`, which selects CoK's lossless layout or DoK's validated
# compact GBD1 threshold-cache contract at runtime.
#
# The placeholder handler's NAME is referenced here because that is what this round's manual
# read of ccecl.asm found; the SET of opcodes routed to it is still derived programmatically
# from the dispatch map (never hard-coded as a literal opcode list) so a future ccecl.asm edit
# that adds/removes a placeholder opcode is picked up automatically without touching this file.
# ---------------------------------------------------------------------------

PLACEHOLDER_HANDLER = "op_script_effect"


def derive_placeholder_opcodes(
    dispatch_map: dict[int, str], placeholder_handler: str = PLACEHOLDER_HANDLER
) -> set[int]:
    """Return every opcode byte value whose dispatch handler IS the placeholder recorder.

    Derived PROGRAMMATICALLY from `dispatch_map` (as produced by `build_dispatch_map`) by
    exact handler-label match -- never a hard-coded opcode list. If `ccecl.asm` is edited so a
    different (or additional) opcode routes to `placeholder_handler`, or so `op_script_effect`
    starts doing real work under a renamed handler, this function's answer changes with it.
    """
    return {op for op, label in dispatch_map.items() if label == placeholder_handler}


# ---------------------------------------------------------------------------
# op_call's internal routine-id sub-dispatch: prove the vacuous-dispatch finding programmatically
# ---------------------------------------------------------------------------


def extract_function_body(lines: list[str], func_label: str) -> tuple[int, int]:
    """Return [start, end) line indices for the body of a top-level (non-local) label."""
    start = None
    for i, line in enumerate(lines):
        if line.strip() == f"{func_label}:":
            start = i
            break
    if start is None:
        raise ValueError(f"label {func_label}: not found")
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if _GLOBAL_LABEL_RE.match(lines[i]):
            end = i
            break
    return start, end


def normalize_asm_line(line: str) -> str | None:
    text = line.split(";", 1)[0].strip()
    if not text:
        return None
    return " ".join(text.split())


# CoK/DoK are Gen1; DQK is the Gen2 dialect. `op_call` branches on `[is_gen2]`, so the id rule
# has to as well -- see `call_routine_id`.
GEN2_PROFILE_IDS = frozenset({"dark-queen-of-krynn"})

_CMP_AX_RE = re.compile(r"^cmp ax, ?0?([0-9a-fA-F]+)h$")


def call_routine_id(operand_word: int, is_gen2: bool = False) -> int:
    """Mirror `op_call`'s routine-id computation in `native/src/ccecl.asm`, exactly.

        mov ax, [o_word]
        cmp byte [is_gen2], 0
        je  .coab_id          ; is_gen2 == 0 -> ALWAYS subtract
        test ax, 8000h
        jz  .have_id          ; gen2 AND high bit clear -> no subtraction
    .coab_id:
        sub ax, 7fffh

    Note which arm the `test ax, 8000h` guard belongs to: it is the GEN2 arm. Reading it as
    Gen1's (i.e. "subtract only when the high bit is set") is an easy misread and it silently
    shifts every Gen1 id by 0x8001 -- 0x2e10 comes out as itself instead of 0xae11 -- which
    makes every named constant in the recognizer chain read as absent from the corpus.
    """
    if not is_gen2 or (operand_word & 0x8000):
        return (operand_word - 0x7FFF) & 0xFFFF
    return operand_word


def call_operand_word_gen1(routine_id: int) -> int:
    """Inverse of `call_routine_id()` on the Gen1 arm: the RAW 16-bit operand word that sits in
    the retail ECL bytes and produces `routine_id`.

    Gen1 `op_call` ALWAYS subtracts, so the inverse is total and unambiguous here:
    `raw = (routine_id + 0x7FFF) & 0xFFFF`, equivalently `routine_id - 0x8001` mod 2**16.
    (0xae11 -> $2E10, 0xadcc -> $2DCB, 0xe804 -> $6803, 0x401f -> $C01E, 0x3204 -> $B203.)
    It is deliberately NOT defined for Gen2, where `op_call` leaves a high-bit-clear operand
    alone and the map is therefore not injective.

    Published alongside the transformed id from 2026-09-10 because the RAW word is the quantity
    that carries the cross-platform correspondence: each Gen1 title's redraw operand word equals
    that title's own C64 LIBRARY `JMP $0803` overlay-call trampoline SLOT ADDRESS. See
    `test_PIN_call_redraw_operand_equals_c64_overlay_trampoline_slot` and
    docs/engine/research/c64-resident-kernel.md section 9.2a -- including the limit that $0803 is
    generic overlay dispatch, so the correspondence settles the SLOT, never the semantic label.
    """
    return (routine_id + 0x7FFF) & 0xFFFF


def extract_op_call_routine_ids(
    lines: list[str], func_label: str = "op_call", known_label: str = ".known"
) -> tuple[list[int], list[int]]:
    """Return (recognized_ids, grounded_ids), both DERIVED from `ccecl.asm`, never hand-copied.

    `recognized_ids` are the `cmp ax, <id>h` values whose `je .known` sits in the recognizer
    chain BEFORE the `.known:` label -- the named constants. `grounded_ids` are the
    `cmp ax, <id>h` values compared INSIDE the `.known:` block, i.e. the subset that actually
    reaches behaviour distinct from the vacuous record-and-advance tail. The distinction is the
    whole point of this module's CALL finding, so deriving both from the source is what keeps a
    later id being added (or removed) from silently leaving this file's prose behind.
    """
    start, end = extract_function_body(lines, func_label)
    known_idx = None
    for i in range(start, end):
        if lines[i].strip() == f"{known_label}:":
            known_idx = i
            break
    if known_idx is None:
        raise ValueError(f"{func_label} has no {known_label}: label -- extraction assumption broken")

    def ids_in(lo: int, hi: int) -> list[int]:
        out: list[int] = []
        pending: int | None = None
        for i in range(lo, hi):
            text = normalize_asm_line(lines[i])
            if text is None:
                continue
            m = _CMP_AX_RE.match(text)
            if m is not None:
                pending = int(m.group(1), 16)
                continue
            if text.startswith("je ") and pending is not None:
                out.append(pending)
            pending = None
        return out

    return ids_in(start, known_idx), ids_in(known_idx, end)


def extract_op_call_known_and_fallthrough(
    lines: list[str], func_label: str = "op_call", known_label: str = ".known"
) -> tuple[list[str], list[str]]:
    """Return (fallthrough_block, known_block) as normalized instruction-line lists.

    `fallthrough_block` is the code executed when NONE of the routine-id comparisons matched
    (the lines between the LAST `je .known` and the `.known:` label). `known_block` is the code
    at the `.known:` label itself, running to the end of the function. Comparing these two lists
    for equality is the whole vacuous-dispatch check -- see `op_call_dispatch_diverges`.
    """
    start, end = extract_function_body(lines, func_label)
    known_idx = None
    for i in range(start, end):
        if lines[i].strip() == f"{known_label}:":
            known_idx = i
            break
    if known_idx is None:
        raise ValueError(f"{func_label} has no {known_label}: label -- extraction assumption broken")

    last_je_known = None
    known_jcc = re.compile(rf"^\s*je\s+{re.escape(known_label)}\s*(?:;.*)?$")
    for i in range(start, known_idx):
        if known_jcc.match(lines[i]):
            last_je_known = i
    if last_je_known is None:
        raise ValueError(f"{func_label} has a {known_label}: label but no 'je {known_label}' branch into it")

    fallthrough_raw = lines[last_je_known + 1:known_idx]
    known_raw = lines[known_idx + 1:end]
    fallthrough = [n for n in (normalize_asm_line(l) for l in fallthrough_raw) if n is not None]
    known = [n for n in (normalize_asm_line(l) for l in known_raw) if n is not None]
    if not fallthrough or not known:
        raise ValueError(
            f"{func_label}: extracted an empty block (fallthrough={len(fallthrough)}, "
            f"known={len(known)}) -- extraction assumption broken, refusing to report a false pass"
        )
    return fallthrough, known


def op_call_dispatch_diverges(
    lines: list[str], func_label: str = "op_call", known_label: str = ".known"
) -> tuple[bool, list[str], list[str]]:
    fallthrough, known = extract_op_call_known_and_fallthrough(lines, func_label, known_label)
    return fallthrough != known, fallthrough, known


# ---------------------------------------------------------------------------
# (b) CFG-walk one decoded ECL block, tally reachable instruction occurrences per opcode
# ---------------------------------------------------------------------------


def count_reachable_opcodes(
    raw: bytes,
    address_addend: int,
    word_sets: dict[int, int],
    opcodes: dict[int, Opcode],
    max_states: int = DEFAULT_MAX_STATES,
    is_gen2: bool = False,
) -> dict[str, Any]:
    """CFG-walk one ECL block's five header entry points and tally opcode occurrences.

    An "occurrence" is a DISTINCT reachable code offset that decodes to that opcode -- not a
    raw byte-value scan (which cannot distinguish an opcode byte from the same byte value sitting
    inside another instruction's operand) and not a per-path visit count (the same offset can be
    queued multiple times under different comparison-outcome constraints; counting it once per
    reachable location, the same convention `gen1_ecl_encounter_scan.scan_block`'s
    `decoded_instruction_offsets` uses, is what a CFG-based occurrence count should mean).

    This reuses `gen1_ecl_encounter_scan`'s own decode/successor primitives (`decode_one`,
    `header_entries`, `successors`) rather than re-deriving ECL control flow independently, and
    deliberately drops that module's `roster` bookkeeping from the search-state key: roster is
    LOAD_MONSTER accounting for combat-candidate attribution and does not affect which offsets
    `successors()` reaches, so carrying it here would only re-explore the same reachable set
    through more (redundant) states, not find any offset this walk would otherwise miss.
    """
    decoded_offsets: set[int] = set()
    # IF offset -> record, for reachable 0x16..0x1B sites whose GUARDED instruction decodes.
    # Collected inside this same walk rather than by a second CFG pass: the walk already visits
    # every reachable offset, and a separate scan would double the cost while risking a second,
    # subtly different control-flow model of the same data.
    if_sites: dict[int, dict[str, Any]] = {}
    _if_sites_undecodable: set[int] = set()
    # offset -> routine id, for reachable 0x2D CALL sites whose operand is a literal. Recorded
    # per OFFSET rather than incremented per visit for the same reason the opcode tally is: the
    # same offset can be queued repeatedly under different comparison-outcome constraints.
    call_ids_at: dict[int, int] = {}
    call_dynamic_operand_offsets: set[int] = set()
    truncated_offsets: dict[int, int] = {}
    states_seen: set[tuple[str, int, tuple[int, ...], tuple[int, ...]]] = set()
    queue: deque[tuple[str, int, tuple[int, ...], tuple[int, ...]]] = deque()
    for entry_name, offset in header_entries(raw, address_addend):
        queue.append((entry_name, offset, (), ALL_COMPARE_OUTCOMES))

    states = 0
    while queue and states < max_states:
        entry_name, offset, stack, compare_outcomes = queue.popleft()
        state_key = (entry_name, offset, stack[-8:], compare_outcomes)
        if state_key in states_seen:
            continue
        states_seen.add(state_key)
        states += 1

        ins = decode_one(raw, offset, word_sets, opcodes)
        if ins is None:
            truncated_offsets[offset] = raw[offset]
            continue
        decoded_offsets.add(offset)
        if 0x16 <= ins.opcode <= 0x1B:
            # Decode the guarded instruction ONCE PER DISTINCT OFFSET, not once per state
            # visit. The same IF offset is re-queued under many comparison-outcome
            # constraints, and decoding it on every visit made this walk ~60% slower --
            # measured, after a first attempt at the wrong cause (caching the naive scans'
            # block reads) changed the suite runtime by nothing at all.
            record = if_sites.get(offset)
            if record is None and offset not in _if_sites_undecodable:
                guarded = decode_one(raw, offset + ins.size, word_sets, opcodes)
                if guarded is None:
                    # A reachable IF whose guarded instruction does not decode is NOT counted
                    # in the census denominator, and is remembered so it is not re-attempted.
                    _if_sites_undecodable.add(offset)
                else:
                    record = if_sites[offset] = {
                        "if_opcode": ins.opcode,
                        "guarded_opcode": guarded.opcode,
                        "guarded_size": guarded.size,
                        # Which of the two branches the walk actually reached this site under.
                        # This is the load-bearing field for the native skip_one_instruction
                        # defect: only the FALSE branch calls it, so a site whose false branch is
                        # never live cannot reach get_operand_meta at all.
                        "true_branch_live": False,
                        "false_branch_live": False,
                        "bytes_hex": raw[offset:offset + ins.size + guarded.size].hex(" "),
                    }
            if record is not None:
                # Cheap short-circuit: once both branches are known live, nothing further can
                # be learned from re-testing this site's outcome set.
                if not (record["true_branch_live"] and record["false_branch_live"]):
                    for value in compare_outcomes:
                        if condition_holds(ins.opcode, value):
                            record["true_branch_live"] = True
                        else:
                            record["false_branch_live"] = True
        if ins.opcode == 0x2D and ins.args:
            operand = ins.args[0]
            # Operand code 1 is the 16-bit literal form; codes 2/3 are dynamic (memory) reads
            # whose `word` is an ADDRESS, not a routine id, so tallying them as ids would be the
            # same category error as a raw byte scan. EVERY reachable CoK+DoK CALL site is
            # code 1 -- but do not re-hard-code that population here. This comment read "All 309
            # reachable CoK+DoK CALL sites are code 1" until 2026-09-10, when the 0x41 decoder
            # port widened the reachable frame to 321 and left the sentence quietly wrong in the
            # one place no test reads. The live count is published as
            # `call_routine_id_census.literal_operand_call_sites` and pinned in the test suite;
            # read it there. A code-2/3 site must be counted somewhere it can be seen, not
            # dropped, which is what `call_dynamic_operand_offsets` below is for.
            if operand.code in (0, 1):
                call_ids_at[offset] = call_routine_id(operand.word, is_gen2)
            else:
                call_dynamic_operand_offsets.add(offset)

        # Same compare-flag-invalidation rule scan_block uses: COMPARE with two immediates sets
        # a known outcome; any command that itself consumes/replaces the flags forces "unknown".
        next_compare_outcomes = compare_outcomes
        if ins.opcode == 0x03 and len(ins.args) >= 2:
            left, right = ins.args[:2]
            if left.code == 0 and right.code == 0:
                next_compare_outcomes = ((left.word > right.word) - (left.word < right.word),)
            else:
                next_compare_outcomes = ALL_COMPARE_OUTCOMES
        elif ins.opcode in (0x14, 0x1D, 0x2F, 0x30, 0x3F):
            next_compare_outcomes = ALL_COMPARE_OUTCOMES

        for target, target_stack, _decision, target_outcomes in successors(
            raw, ins, stack, address_addend, next_compare_outcomes, word_sets, opcodes
        ):
            if ECL_HEADER_LEN <= target < len(raw) and len(target_stack) <= 24:
                queue.append((entry_name, target, target_stack, target_outcomes))

    opcode_counts = Counter(raw[offset] for offset in decoded_offsets)
    live_if_sites = {off: rec for off, rec in if_sites.items() if off in decoded_offsets}
    if_guarded_counts = Counter(rec["guarded_opcode"] for rec in live_if_sites.values())
    unknown_opcode_bytes = Counter(v for v in truncated_offsets.values() if v not in opcodes)
    call_id_counts = Counter(rid for off, rid in call_ids_at.items() if off in decoded_offsets)
    return {
        "decoded_instruction_offsets": len(decoded_offsets),
        # Denominator for the guarded-opcode census: every reachable IF whose guarded
        # instruction decodes. Publishing it stops the 0x41 slice being quoted without one.
        "if_sites_with_decodable_guarded_instruction": len(live_if_sites),
        "if_guarded_opcode_counts": {f"0x{k:02x}": v for k, v in sorted(if_guarded_counts.items())},
        "if_guarded_sites": {
            str(off): rec for off, rec in sorted(live_if_sites.items())
        },
        "explored_states": states,
        "state_limit_reached": bool(queue),
        "truncated_offsets": len(truncated_offsets),
        "opcode_counts": dict(sorted(opcode_counts.items())),
        "call_routine_id_counts": dict(sorted(call_id_counts.items())),
        "call_dynamic_operand_sites": len(call_dynamic_operand_offsets & decoded_offsets),
        "unknown_opcode_byte_counts": {f"0x{k:02x}": v for k, v in sorted(unknown_opcode_bytes.items())},
    }


# ---------------------------------------------------------------------------
# (c) Combine (a) + (b) across CoK's and DoK's own retail ECL{1,2,3}.DAX
# ---------------------------------------------------------------------------


@lru_cache(maxsize=None)
def find_ecl_dax_files(profile_id: str) -> tuple[tuple[str, Path], ...]:
    """Locate one title's retail ECL{1,2,3}.DAX. CACHED -- see the note below.

    PROFILED 2026-09-10: this was 15.6s of a 16.2s `build_report()`. Every call re-runs the
    whole binary inventory, which stats, hashes and CLASSIFIES ~6,882 files across the five
    source locations, and `build_report` called it SIX times -- twice for the CFG walks and
    once for each of the two naive scans, per title. The result is a pure function of the
    on-disk corpus, which does not change during a run, so it is memoised.

    This is worth writing down because the first two attempts to speed this file up were aimed
    at the wrong thing. Adding the byte-pair scan took the test file 150s -> 297s, and the
    obvious-looking culprit -- two extra DAX reads and RLE decompressions per report -- was
    caching-fixed first, which changed the runtime by NOTHING. The second attempt (decoding an
    IF's guarded instruction once per distinct offset instead of once per state visit) is a
    genuine improvement to the walk and was kept, but it did not move the total either. Only
    profiling found it: the cost was never the new code, it was that the new code called an
    already-expensive function two more times. Measure before optimising; this file has now
    disproven two confident guesses about its own hot spot.

    Returns a TUPLE rather than a list so the cached value cannot be mutated by a caller.
    """
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
    files = goldbox_corpus.file_index(install)
    out: list[tuple[str, Path]] = []
    for name, path in sorted(files.items()):
        if name.startswith("ECL") and path.suffix.upper() == ".DAX":
            out.append((name, path))
    return tuple(out)


def coverage_for_profile(
    profile_id: str,
    dispatch_map: dict[int, str],
    fallback_label: str,
    placeholder_opcodes: set[int],
    max_states: int = DEFAULT_MAX_STATES,
    call_dispatch_diverges: bool = False,
) -> dict[str, Any]:
    word_sets = word_sets_for_profile(profile_id)
    opcodes = opcodes_for_profile(profile_id)
    address_addend = PROFILE_ADDRESS_ADDENDS.get(profile_id, DEFAULT_ADDRESS_ADDEND)

    per_file: list[dict[str, Any]] = []
    total_counts: Counter[int] = Counter()
    total_unknown: Counter[str] = Counter()
    total_truncated = 0
    total_state_limit_hits = 0
    total_explored_states = 0
    total_blocks = 0
    total_call_ids: Counter[int] = Counter()
    total_call_dynamic_sites = 0
    total_if_sites = 0
    total_if_guarded: Counter[str] = Counter()
    if_guarded_site_rows: list[dict[str, Any]] = []
    is_gen2 = profile_id in GEN2_PROFILE_IDS
    # Both Gen1 Krynn titles admit 0x41. `op_award_xp` performs its writeback
    # only when the matching validated transient GBPR contract is available.
    profile_recorded_only: set[int] = set()
    profile_unadmitted: set[int] = set()
    recorded_only_opcodes = placeholder_opcodes | profile_recorded_only

    ecl_files = find_ecl_dax_files(profile_id)
    for name, path in ecl_files:
        blocks_out = []
        for block in goldbox_corpus.read_dax_blocks(path):
            total_blocks += 1
            result = count_reachable_opcodes(
                block["raw"], address_addend, word_sets, opcodes, max_states, is_gen2=is_gen2
            )
            if result["state_limit_reached"]:
                total_state_limit_hits += 1
            total_explored_states += result["explored_states"]
            total_truncated += result["truncated_offsets"]
            for opcode_str, n in result["opcode_counts"].items():
                total_counts[opcode_str] += n
            for opcode_str, n in result["unknown_opcode_byte_counts"].items():
                total_unknown[opcode_str] += n
            for routine_id, n in result["call_routine_id_counts"].items():
                total_call_ids[routine_id] += n
            total_call_dynamic_sites += result["call_dynamic_operand_sites"]
            total_if_sites += result["if_sites_with_decodable_guarded_instruction"]
            for guarded_str, n in result["if_guarded_opcode_counts"].items():
                total_if_guarded[guarded_str] += n
            for offset_str, record in result["if_guarded_sites"].items():
                if_guarded_site_rows.append(
                    {
                        "file": name,
                        "block_id": block["block_id"],
                        "offset": int(offset_str),
                        **record,
                    }
                )
            if result["decoded_instruction_offsets"]:
                blocks_out.append({"block_id": block["block_id"], **result})
        per_file.append({"file": name, "path": str(path), "block_count": len(blocks_out)})

    opcode_rows = []
    for opcode in sorted(total_counts):
        label = dispatch_map.get(opcode, fallback_label)
        has_handler = label != fallback_label and opcode not in profile_unadmitted
        is_placeholder = opcode in placeholder_opcodes
        is_recorded_only = opcode in recorded_only_opcodes
        spec = opcodes.get(opcode)
        mnemonic = spec.mnemonic if spec is not None else "UNKNOWN"
        opcode_rows.append(
            {
                "opcode": f"0x{opcode:02x}",
                "mnemonic": mnemonic,
                "handler": label,
                "has_handler": has_handler,
                "is_placeholder_recorder": is_placeholder,
                "is_recorded_only": is_recorded_only,
                "applied": has_handler and not is_recorded_only,
                "occurrences": total_counts[opcode],
                # FIXED 2026-09-09 (ecl-op-call-real-dispatch item): this used to be the static
                # `opcode == 0x2D` -- true for CALL regardless of whether its sub-dispatch was
                # actually vacuous. It is now the REAL, function-level `op_call_dispatch_diverges`
                # verdict, so a future genuine fix (or regression) to op_call is reflected here
                # instead of being silently masked by a hardcoded flag. Two ids (0xAE11, 0xE804)
                # now diverge, so this reads False for CALL -- "no longer WHOLLY vacuous", not
                # "now fully applied"; the other five named ids still fall through unimplemented.
                "vacuous_dispatch": opcode == 0x2D and not call_dispatch_diverges,
            }
        )
    opcode_rows.sort(key=lambda r: (-r["occurrences"], r["opcode"]))

    used_opcodes = set(total_counts)
    has_handler_used = {
        op for op in used_opcodes
        if dispatch_map.get(op, fallback_label) != fallback_label and op not in profile_unadmitted
    }
    placeholder_used = used_opcodes & recorded_only_opcodes
    applied_used = has_handler_used - recorded_only_opcodes

    total_instr = sum(total_counts.values())
    dispatch_covered_instr = sum(n for op, n in total_counts.items() if op in has_handler_used)
    placeholder_instr = sum(n for op, n in total_counts.items() if op in placeholder_used)
    applied_instr = dispatch_covered_instr - placeholder_instr
    no_handler_instr = total_instr - dispatch_covered_instr

    placeholder_rows = sorted(
        (
            {
                "opcode": f"0x{op:02x}",
                "mnemonic": (opcodes[op].mnemonic if op in opcodes else "UNKNOWN"),
                "occurrences": total_counts[op],
            }
            for op in placeholder_used
        ),
        key=lambda r: (-r["occurrences"], r["opcode"]),
    )

    return {
        "profile_id": profile_id,
        "title": TITLES.get(profile_id, profile_id),
        "detected": bool(ecl_files),
        "ecl_files": per_file,
        "ecl_block_count": total_blocks,
        "distinct_opcodes_used": len(used_opcodes),
        "total_reachable_instructions": total_instr,
        "call_routine_id_counts": {f"0x{rid:04x}": n for rid, n in sorted(total_call_ids.items())},
        "call_routine_id_literal_sites": sum(total_call_ids.values()),
        "call_dynamic_operand_sites": total_call_dynamic_sites,
        # --- IF-guarded-opcode census. The denominator for any "N sites guard opcode X" claim,
        # published beside the slice so the slice cannot be quoted without it.
        "if_sites_with_decodable_guarded_instruction": total_if_sites,
        "if_guarded_opcode_counts": dict(sorted(total_if_guarded.items())),
        "if_guarded_sites": if_guarded_site_rows,
        # --- PRIMARY metric: applied vs. recorded-only (placeholder) vs. no handler at all.
        # These three buckets are mutually exclusive and sum to total_reachable_instructions.
        "distinct_opcodes_applied": len(applied_used),
        "distinct_opcodes_placeholder_only": len(placeholder_used),
        "recorded_only_opcodes_title_override": sorted(f"0x{op:02x}" for op in profile_recorded_only),
        "unadmitted_opcodes_title_override": sorted(f"0x{op:02x}" for op in profile_unadmitted),
        "applied_instructions": applied_instr,
        "placeholder_instructions": placeholder_instr,
        "no_handler_instructions": no_handler_instr,
        "fraction_applied": (applied_instr / total_instr) if total_instr else None,
        "fraction_recorded_only_placeholder": (placeholder_instr / total_instr) if total_instr else None,
        "fraction_no_handler": (no_handler_instr / total_instr) if total_instr else None,
        "placeholder_opcode_occurrences_ranked": placeholder_rows,
        # --- SECONDARY / WEAKER metric, kept for reference. CAVEAT: this answers only "did the
        # opcode reach SOME handler other than op_default", not "did that handler do anything".
        # op_script_effect (the placeholder recorder) counts as "has a handler" here, which is
        # exactly why this reads 1.000 for both Krynn titles despite the
        # applied-vs-recorded gap above.
        # NEVER quote this figure alone as "ECL coverage".
        "distinct_opcodes_with_handler_and_used": len(has_handler_used),
        "dispatch_coverage_fraction_by_distinct_opcode": (
            len(has_handler_used) / len(used_opcodes) if used_opcodes else None
        ),
        "total_reachable_instructions_with_handler": dispatch_covered_instr,
        "dispatch_coverage_fraction_by_instruction_volume": (
            dispatch_covered_instr / total_instr if total_instr else None
        ),
        "state_limit_hits": total_state_limit_hits,
        "explored_states": total_explored_states,
        "truncated_offsets": total_truncated,
        "unknown_opcode_landings": dict(sorted(total_unknown.items())),
        "opcodes": opcode_rows,
    }


@lru_cache(maxsize=None)
def _naive_scan_blocks(path_str: str) -> tuple[bytes, ...]:
    """Decompressed block payloads of one ECL DAX, cached for the naive scans.

    See the note above `naive_raw_byte_scan_count`: this exists only to stop the two raw
    scans re-decompressing the same six retail files on every `build_report()` call. It is a
    read-only cache of retail bytes that never change during a run.
    """
    return tuple(block["raw"] for block in goldbox_corpus.read_dax_blocks(Path(path_str)))


def naive_raw_byte_scan_count(profile_id: str, opcode: int) -> dict[str, Any]:
    """Count raw occurrences of `opcode`'s byte value anywhere in each ECL block's bytes.

    This is the WRONG methodology, kept here only to demonstrate, reproducibly, why it
    disagrees with a CFG-based reachable count: it does not decode instruction boundaries at
    all, so it also counts the byte value wherever it happens to appear inside another
    instruction's operand words, and it counts every block (including ones with zero reachable
    header entries) rather than only code actually reachable from a valid entry point.

    0x41 is used here deliberately -- but WHY it is the sharpest example CHANGED on 2026-09-10,
    and the old reason is quoted here rather than deleted because it is the thing a reader would
    otherwise assume still holds. It used to read:

        "it is NOT in CoK's or DoK's own opcode table (`OPCODES` only covers 0x00-0x40, and
        neither profile has an extended-opcode override for 0x41), so `decode_one` refuses to
        frame it and any reachable landing on that byte value is counted as an
        `unknown_opcode_byte_count`, never as a real decoded occurrence"

    Half of that is still true and half is now false. `OPCODES` (imported from
    `dqk_ca03_stream_decode`) genuinely still stops at 0x40 -- 65 entries, 0x00..0x40, nothing
    beyond. But "neither profile has an extended-opcode override for 0x41" is now false for BOTH
    titles: `gen1_ecl_encounter_scan.opcodes_for_profile` resolves 0x41 to a real 2-word
    `Opcode("GEN1_AWARD_XP")` for DoK via its explicit `PROFILE_EXTENDED_OPCODES` entry and for
    CoK via `DEFAULT_EXTENDED_OPCODES`. Both were grounded on each title's own retail `GAME.OVR`
    handler prefetch (`mov al,2; push ax; lcall`), not inferred from the corpus.

    So 0x41 now DECODES, and the comparison this function feeds had to change with it. The naive
    scan is now compared against the CFG-reachable DECODED OCCURRENCE count of 0x41, not against
    an unknown-byte landing count -- because that landing count is now 0 for both titles BY
    CONSTRUCTION (a known opcode can never appear in `unknown_opcode_landings`), and comparing
    617 against a structural zero would be a vacuous demonstration dressed as an emphatic one.
    Both quantities are published side by side below so the difference stays visible.
    """
    total = 0
    per_file: dict[str, int] = {}
    for name, path in find_ecl_dax_files(profile_id):
        file_total = 0
        for raw in _naive_scan_blocks(str(path)):
            file_total += raw.count(bytes([opcode]))
        per_file[name] = file_total
        total += file_total
    return {"opcode": f"0x{opcode:02x}", "profile_id": profile_id, "total": total, "per_file": per_file}


def naive_raw_if_pair_scan(profile_id: str, opcode: int = 0x41) -> dict[str, Any]:
    """Raw byte-PAIR upper bound: any 0x16..0x1B byte immediately followed by `opcode`.

    This is the CONTROL for the CFG-derived `if_guarded_sites` census, and it exists for the
    same reason `naive_raw_byte_scan_count` exists for the plain opcode tally: a raw scan cannot
    tell an instruction start from the same byte value sitting inside another instruction's
    operand, an inline string payload, or a jump table. It therefore cannot UNDERSTATE the true
    number of real IF->opcode adjacencies, which is precisely what makes it useful -- it bounds
    the CFG figure from above, so the two together give a range rather than a bare point.

    Read the gap between the two as a measurement of the raw scan's category error, NOT as
    "sites the CFG walk missed". Neither number alone is the answer; see the census's own
    `interpretation` field.
    """
    total = 0
    per_file: dict[str, int] = {}
    for name, path in find_ecl_dax_files(profile_id):
        file_total = 0
        for raw in _naive_scan_blocks(str(path)):
            file_total += sum(
                1 for i in range(len(raw) - 1) if 0x16 <= raw[i] <= 0x1B and raw[i + 1] == opcode
            )
        per_file[name] = file_total
        total += file_total
    return {"opcode": f"0x{opcode:02x}", "profile_id": profile_id, "total": total, "per_file": per_file}


def build_report(max_states: int = DEFAULT_MAX_STATES, asm_path: Path = CCECL_PATH) -> dict[str, Any]:
    dispatch_map, fallback_label, lines, start, end = build_dispatch_map(asm_path)
    diverges, fallthrough, known = op_call_dispatch_diverges(lines)
    placeholder_opcodes = derive_placeholder_opcodes(dispatch_map)

    games = {
        pid: coverage_for_profile(
            pid, dispatch_map, fallback_label, placeholder_opcodes, max_states, diverges
        )
        for pid in TITLES
    }

    combined_counts: Counter[int] = Counter()
    for game in games.values():
        for row in game["opcodes"]:
            combined_counts[int(row["opcode"], 16)] += row["occurrences"]

    combined_rows = []
    for opcode, n in combined_counts.items():
        label = dispatch_map.get(opcode, fallback_label)
        combined_rows.append(
            {
                "opcode": f"0x{opcode:02x}",
                "handler": label,
                "has_handler": label != fallback_label,
                "is_placeholder_recorder": opcode in placeholder_opcodes,
                "occurrences_combined": n,
            }
        )
    combined_rows.sort(key=lambda r: (-r["occurrences_combined"], r["opcode"]))
    # Handler admission can vary by title, so preserve that dimension in the
    # combined fallback ranking even though the Krynn 0x41 paths now agree.
    no_handler_ranked = sorted(
        (
            {
                "title": game["title"],
                "opcode": row["opcode"],
                "handler": row["handler"],
                "occurrences": row["occurrences"],
            }
            for game in games.values()
            for row in game["opcodes"]
            if not row["has_handler"]
        ),
        key=lambda r: (-r["occurrences"], r["title"], r["opcode"]),
    )

    # --- PRIMARY combined metric: applied vs. recorded-only (placeholder) vs. no handler. ---
    combined_total_instr = sum(g["total_reachable_instructions"] for g in games.values())
    combined_applied_instr = sum(g["applied_instructions"] for g in games.values())
    combined_placeholder_instr = sum(g["placeholder_instructions"] for g in games.values())
    combined_no_handler_instr = sum(g["no_handler_instructions"] for g in games.values())
    applied_vs_recorded_combined = {
        "total_reachable_instructions": combined_total_instr,
        "applied_instructions": combined_applied_instr,
        "placeholder_instructions": combined_placeholder_instr,
        "no_handler_instructions": combined_no_handler_instr,
        "fraction_applied": (combined_applied_instr / combined_total_instr) if combined_total_instr else None,
        "fraction_recorded_only_placeholder": (
            combined_placeholder_instr / combined_total_instr if combined_total_instr else None
        ),
        "fraction_no_handler": (
            combined_no_handler_instr / combined_total_instr if combined_total_instr else None
        ),
    }

    # Per-opcode placeholder ranking WITH each title's own count alongside the combined total, so
    # a reader sees e.g. "PRINT: CoK 1210 / DoK 624 / combined 1834" in one row rather than having
    # to cross-reference two per-game tables.
    placeholder_by_opcode: dict[int, dict[str, Any]] = {}
    for pid, game in games.items():
        for row in game["placeholder_opcode_occurrences_ranked"]:
            op = int(row["opcode"], 16)
            entry = placeholder_by_opcode.setdefault(
                op, {"opcode": row["opcode"], "mnemonic": row["mnemonic"], "occurrences_by_title": {}}
            )
            entry["occurrences_by_title"][pid] = row["occurrences"]
    for op, entry in placeholder_by_opcode.items():
        for pid in TITLES:
            entry["occurrences_by_title"].setdefault(pid, 0)
        entry["occurrences_combined"] = sum(entry["occurrences_by_title"].values())
    placeholder_ranked_combined = sorted(
        placeholder_by_opcode.values(), key=lambda r: (-r["occurrences_combined"], r["opcode"])
    )

    # Scale of the pinned op_call finding: how much of the reachable instruction volume is
    # affected by it, per title and combined. CALL (0x2D) IS opcode-dispatched (it never falls
    # to op_default), so it never appears in `unimplemented_ranked` above -- that ranking only
    # catches opcodes with NO handler at all, which is the wrong bucket for a handler that exists
    # but whose internal sub-dispatch does nothing. This is why that section is reported
    # separately rather than folded into "unimplemented".
    call_scale = {}
    for pid, game in games.items():
        call_row = next((r for r in game["opcodes"] if r["opcode"] == "0x2d"), None)
        occurrences = call_row["occurrences"] if call_row else 0
        total = game["total_reachable_instructions"]
        call_scale[pid] = {
            "call_occurrences": occurrences,
            "total_reachable_instructions": total,
            "fraction_of_reachable_instructions": (occurrences / total) if total else None,
        }
    call_scale["combined"] = {
        "call_occurrences": sum(v["call_occurrences"] for v in call_scale.values()),
        "total_reachable_instructions": sum(v["total_reachable_instructions"] for v in call_scale.values()),
    }
    call_scale["combined"]["fraction_of_reachable_instructions"] = (
        call_scale["combined"]["call_occurrences"] / call_scale["combined"]["total_reachable_instructions"]
        if call_scale["combined"]["total_reachable_instructions"]
        else None
    )

    # ---------------------------------------------------------------------------------------
    # Which routine ids the corpus actually CALLS, and how many of those calls reach behaviour.
    #
    # Added 2026-09-10 because this module's own docstring carried two per-id counts (307 / 114)
    # that no frame reproduces, and nothing in the repo could have gone red for it: the standing
    # test pinned only the FACT that op_call's sub-dispatch diverges, never the population it
    # diverges over. A prose figure with no artifact behind it is exactly the shape this project
    # keeps getting caught by, so the figures now come out of the same CFG walk that produces
    # every other number here, and both id lists are parsed out of `ccecl.asm` rather than typed.
    recognized_ids, grounded_ids = extract_op_call_routine_ids(lines)
    census_by_id: dict[int, dict[str, Any]] = {}
    for pid, game in games.items():
        for id_str, n in game["call_routine_id_counts"].items():
            rid = int(id_str, 16)
            entry = census_by_id.setdefault(
                rid, {"routine_id": id_str, "occurrences_by_title": {}}
            )
            entry["occurrences_by_title"][pid] = n
    for rid, entry in census_by_id.items():
        # The raw on-disk operand word, published beside the transformed id since 2026-09-10:
        # it is the quantity that matches the C64 LIBRARY trampoline slot address. Round-tripped
        # through call_routine_id() rather than asserted, so a change to either direction of the
        # id arithmetic makes this raise here instead of publishing a silently wrong word.
        raw = call_operand_word_gen1(rid)
        if call_routine_id(raw, is_gen2=False) != rid:  # pragma: no cover - arithmetic invariant
            raise AssertionError(f"raw/id round-trip broken for 0x{rid:04x} -> 0x{raw:04x}")
        entry["raw_operand_word"] = f"0x{raw:04x}"
        for pid in TITLES:
            entry["occurrences_by_title"].setdefault(pid, 0)
        entry["occurrences_combined"] = sum(entry["occurrences_by_title"].values())
        entry["recognized_by_op_call"] = rid in recognized_ids
        entry["grounded_in_known_block"] = rid in grounded_ids
    census_ranked = sorted(
        census_by_id.values(), key=lambda r: (-r["occurrences_combined"], r["routine_id"])
    )
    grounded_calls = sum(r["occurrences_combined"] for r in census_ranked if r["grounded_in_known_block"])
    recognized_calls = sum(r["occurrences_combined"] for r in census_ranked if r["recognized_by_op_call"])
    literal_calls = sum(r["occurrences_combined"] for r in census_ranked)
    dynamic_calls = sum(game["call_dynamic_operand_sites"] for game in games.values())
    call_routine_id_census = {
        "frame": (
            "DISTINCT reachable code offsets decoding to opcode 0x2D, from the same CFG walk "
            "(count_reachable_opcodes) that produces every reachable-instruction figure in this "
            "report; routine id computed by call_routine_id(), mirroring op_call in ccecl.asm"
        ),
        "recognized_ids": [f"0x{rid:04x}" for rid in recognized_ids],
        "grounded_ids": [f"0x{rid:04x}" for rid in grounded_ids],
        "raw_operand_word_note": (
            "raw_operand_word is the literal 16-bit word in the retail ECL bytes; Gen1 op_call "
            "always subtracts, so raw = routine_id - 0x8001 (mod 2**16). It is the quantity that "
            "equals each title's own C64 LIBRARY 'JMP $0803' overlay-call trampoline slot "
            "ADDRESS (CoK/Gateway $2E10, DoK/Secret $2DCB). $0803 is generic overlay dispatch, "
            "so that correspondence identifies the SLOT, not the routine's semantics."
        ),
        "ranked": census_ranked,
        "literal_operand_call_sites": literal_calls,
        "dynamic_operand_call_sites": dynamic_calls,
        "calls_reaching_grounded_id": grounded_calls,
        "calls_reaching_recognized_id": recognized_calls,
        "fraction_of_calls_grounded": (grounded_calls / literal_calls) if literal_calls else None,
        "unrecognized_ids_ranked": [
            r for r in census_ranked if not r["recognized_by_op_call"]
        ],
    }

    total_combined = sum(combined_counts.values())
    has_handler_combined = sum(
        game["total_reachable_instructions_with_handler"] for game in games.values()
    )

    # 2026-09-10: `cfg_reachable_landing_count` used to be the sole comparison quantity and read
    # `unknown_opcode_landings["0x41"]`. Once 0x41 gained a grounded extended-opcode definition for
    # both Gen1 titles that expression became a STRUCTURAL zero -- a known opcode cannot land in
    # the unknown table -- so the demonstration would have gone on passing while measuring nothing.
    # Both quantities are now published: the decoded occurrence count is the live comparison, and
    # the unknown-byte landing count is kept so its collapse to zero is visible as evidence that
    # the opcode is now framed rather than as an absence of sites.
    def _decoded_occurrences(pid: str, opcode: int) -> int:
        key = f"0x{opcode:02x}"
        for row in games[pid]["opcodes"]:
            if row["opcode"] == key:
                return row["occurrences"]
        return 0

    naive_0x41 = {
        pid: {
            **naive_raw_byte_scan_count(pid, 0x41),
            "cfg_reachable_landing_count": _decoded_occurrences(pid, 0x41),
            "cfg_reachable_decoded_occurrences": _decoded_occurrences(pid, 0x41),
            "cfg_reachable_unknown_byte_landings": games[pid]["unknown_opcode_landings"].get("0x41", 0),
            "opcode_is_decoded_by_this_profile": _decoded_occurrences(pid, 0x41) > 0
            or "0x41" not in games[pid]["unknown_opcode_landings"],
        }
        for pid in TITLES
    }
    # Independent corroboration, checked against docs/engine/research/gen1-opcode-41.md: that
    # doc's OWN from-scratch reachability walker (a separate Python port, not this tool and not
    # walkEclReachable) found "CoK found 33 reached 0x41 sites ... matches R1's
    # eclDesyncTriage.test.ts census EXACTLY". This tool's CFG-reachable landing count for CoK is
    # also 33 -- three independent implementations now agree on that number. That doc's DoK count
    # (50) does NOT match this tool's DoK count (`cfg_reachable_landing_count` below); the doc
    # itself discloses why before this tool ever ran: its own scratch walker found "37 residual
    # desyncs from other causes" on DoK relative to `walkEclReachable`'s exact rules ("most likely
    # GOSUB/GOTO targets computed through non-literal operand codes, which this scratch walker
    # does not special-case"), and says explicitly this "does not affect the CoK/Secret numbers,
    # which match exactly". So the DoK mismatch is a disclosed limitation of THAT document's own
    # walker, not evidence against this tool (which reuses `gen1_ecl_encounter_scan`'s exact,
    # already-proven decode/successor primitives rather than a new scratch implementation).
    # --- The IF->0x41 adjacency census. SETTLES a question this report carried as
    # UNESTABLISHED until 2026-09-10; see `no_handler_native_runtime_note` for the retraction.
    _if_sites_0x41 = {
        pid: [row for row in games[pid]["if_guarded_sites"] if row["guarded_opcode"] == 0x41]
        for pid in TITLES
    }
    _pair_scan = {pid: naive_raw_if_pair_scan(pid, 0x41) for pid in TITLES}
    # Detect, do not assume, the digit collisions between this census's per-title site count,
    # its per-title raw byte-pair bound, and the per-title decoded-0x41 OCCURRENCE count that
    # `methodology_discrepancy_demo_opcode_0x41` publishes. See the comment on
    # `numeric_collision_warning` below for why an undisclosed collision is a live hazard here.
    _collisions = [
        (
            TITLES[pid],
            _pair_scan[pid]["total"],
            naive_0x41[pid]["cfg_reachable_decoded_occurrences"],
            len(_if_sites_0x41[pid]),
        )
        for pid in TITLES
        if _pair_scan[pid]["total"] == naive_0x41[pid]["cfg_reachable_decoded_occurrences"]
    ]
    if _collisions:
        _collision_warning = (
            "COLLIDING DIGITS, DIFFERENT SUBJECTS -- read the field name, not the number. "
            + "; ".join(
                f"{title}: the raw IF->0x41 byte-pair upper bound ({pair}) and the "
                f"CFG-reachable decoded 0x41 OCCURRENCE count ({occ}) are the same number, and "
                f"NEITHER is this census's site count for that title, which is {sites}"
                for title, pair, occ, sites in _collisions
            )
            + ". docs/engine/research/gen1-opcode-41.md publishes the occurrence count too, so "
            "the same digits appear in three places for one title. Quoting them "
            "interchangeably is this repo's most-repeated defect: a true figure under the "
            "wrong subject, which no gate here can catch."
        )
    else:
        _collision_warning = (
            "No per-title digit collision between the byte-pair upper bound and the decoded "
            "0x41 occurrence count in the current measurement. This field is derived, so it "
            "will start warning again by itself if one reappears."
        )
    # --- An INDEPENDENT re-derivation, in TypeScript rather than Python.
    #
    # Both Python walks of this question (this tool, and the scratch walker that first raised
    # it) bottom out in `gen1_ecl_encounter_scan`'s decode/successor primitives, so they are
    # not independent of each other in the way that matters. The browser engine has its own,
    # separately written ECL walker and disassembler; on 2026-09-10 it was run against the same
    # retail files via `walkEclReachable` (packages/engine/src/ecl/reachability.ts) and
    # `decodeInstructionAt` (disassemble.ts), with the DoK dialect resolving 0x41 through the
    # shared KRYNN_GEN1_OPCODES base table exactly as `disassemble.ts`'s own docblock says it
    # should. That run was re-executed and reproduced before being recorded here; these are not
    # figures taken on report.
    _TS_SITES = {
        ("champions-of-krynn", "ECL2.DAX", 50, 5529),
        ("champions-of-krynn", "ECL2.DAX", 66, 592),
        ("champions-of-krynn", "ECL2.DAX", 67, 7166),
        ("death-knights-of-krynn", "ECL3.DAX", 83, 4721),
        ("death-knights-of-krynn", "ECL3.DAX", 99, 2514),
    }
    _TS_REACHABLE_OFFSETS = {"champions-of-krynn": 13540, "death-knights-of-krynn": 14783}
    _TS_BLOCKS = {"champions-of-krynn": 22, "death-knights-of-krynn": 25}
    _own_sites = {
        (pid, row["file"], row["block_id"], row["offset"])
        for pid, rows in _if_sites_0x41.items()
        for row in rows
    }
    _cross_impl = {
        "implementation": (
            "packages/engine/src/ecl/reachability.ts walkEclReachable + "
            "packages/engine/src/ecl/disassemble.ts decodeInstructionAt (TypeScript, vitest), "
            "sharing no code with this tool's Python walk."
        ),
        "date": "2026-09-10",
        "ts_sites": sorted(_TS_SITES),
        "sites_agree": _own_sites == _TS_SITES,
        "ts_reachable_offsets_by_title": _TS_REACHABLE_OFFSETS,
        "this_tool_reachable_offsets_by_title": {
            pid: games[pid]["total_reachable_instructions"] for pid in TITLES
        },
        "ts_block_counts_by_title": _TS_BLOCKS,
        "block_counts_agree": all(
            games[pid]["ecl_block_count"] == _TS_BLOCKS[pid] for pid in TITLES
        ),
        "reachable_offset_totals_agree": all(
            games[pid]["total_reachable_instructions"] == _TS_REACHABLE_OFFSETS[pid]
            for pid in TITLES
        ),
        # --- The disagreement, stated rather than smoothed over.
        "divergence_note": (
            "The two implementations agree EXACTLY on the finding (same five sites, same "
            "offsets, byte-identical) and on the block counts (22 / 25), and BOTH report zero "
            "decode desyncs. They do NOT agree on the reachable-offset denominator: this tool "
            "reads CoK 13544 / DoK 14277, the TypeScript walker CoK 13540 / DoK 14783. That is "
            "a real divergence and it is NOT resolved here. Note it points in OPPOSITE "
            "directions per title (-4 on CoK, +506 on DoK), so any single-cause story is "
            "already wrong. At least three known model differences bear on it, and they pull "
            "against each other: this tool PRUNES an IF edge that the accumulated comparison "
            "outcomes provably rule out (fewer offsets); this tool CONTINUES past a dynamic "
            "GOTO operand rather than stopping (more offsets); and the TypeScript walker has "
            "no state cap at all, while this tool caps at 50,000 states per block -- though "
            "that cap was not reached by any of the 47 blocks in this measurement, so it "
            "cannot be the explanation here. Which effect dominates was NOT decomposed per "
            "title. What matters for THIS census is that the divergence does not touch the "
            "result: five sites under both models."
        ),
        # --- What the cross-check does NOT corroborate. The most important field here.
        "does_not_corroborate_branch_liveness": (
            "The TypeScript walk cannot confirm this census's both-branches-live finding, and "
            "must not be cited for it. Opcode 0x41 is not a branching opcode there, so its "
            "own fallthrough successor is the SAME offset as the IF's not-taken edge; a flat "
            "offset-reachability set therefore cannot separate 'reached via the false branch' "
            "from 'reached by executing the guarded instruction and continuing'. The "
            "sites_with_false_branch_live figure rests on THIS tool's comparison-outcome "
            "model alone. An attempt to isolate it with that walker's disableIfGuardFallthrough "
            "option was confounded -- the flag is block-global, and disabling it made all five "
            "sites unreachable because those blocks reach their own tails through OTHER IFs' "
            "not-taken edges -- so it is reported as inconclusive, not as evidence either way."
        ),
    }
    guarded_0x41_after_if_census = {
        "question": (
            "How often do retail CoK/DoK IF instructions guard an immediately following 0x41, "
            "and which of those false branches are statically live? The decoder supplies 0x41's "
            "two-operand frame; the runtime admits it for CoK only, so this is corpus context "
            "rather than a runtime hazard."
        ),
        # --- The frame. State it before the number, per this repo's standing convention.
        "frame": (
            "Static decode of the retail ECL{1,2,3}.DAX of both Gen1 titles, under this tool's "
            "own dialect resolution and gen1_ecl_encounter_scan's decode/successor primitives, "
            "walking each block's five header entry points. No DOSBox session was run."
        ),
        "denominator_blocks": sum(games[pid]["ecl_block_count"] for pid in TITLES),
        "denominator_decoded_instruction_offsets": sum(
            games[pid]["total_reachable_instructions"] for pid in TITLES
        ),
        "denominator_if_sites_with_decodable_guarded_instruction": sum(
            games[pid]["if_sites_with_decodable_guarded_instruction"] for pid in TITLES
        ),
        "blocks_hitting_state_limit": sum(games[pid]["state_limit_hits"] for pid in TITLES),
        "truncated_offsets": sum(games[pid]["truncated_offsets"] for pid in TITLES),
        # --- The number, and its two liveness slices.
        "sites_by_title": {pid: len(rows) for pid, rows in _if_sites_0x41.items()},
        "sites_combined": sum(len(rows) for rows in _if_sites_0x41.values()),
        "sites_with_false_branch_live": sum(
            1 for rows in _if_sites_0x41.values() for row in rows if row["false_branch_live"]
        ),
        "sites_with_both_branches_live": sum(
            1
            for rows in _if_sites_0x41.values()
            for row in rows
            if row["false_branch_live"] and row["true_branch_live"]
        ),
        "sites": {pid: rows for pid, rows in _if_sites_0x41.items()},
        # --- The control: a raw byte-pair scan, which bounds the answer from ABOVE.
        "raw_byte_pair_upper_bound_by_title": {pid: _pair_scan[pid]["total"] for pid in TITLES},
        "raw_byte_pair_upper_bound_combined": sum(_pair_scan[pid]["total"] for pid in TITLES),
        "interpretation": (
            "Exactly N=sites_combined under THIS decoder and CFG model; at least that many in the "
            "retail data. The raw byte-pair scan is an upper bound, not a rival count -- the "
            "difference is the raw scan's category error (a 0x16..0x1B byte followed by 0x41 "
            "inside an operand, an inline string payload, or unreached code), the same error "
            "methodology_discrepancy_demo_opcode_0x41 demonstrates for the plain opcode tally."
        ),
        # A NUMERIC COLLISION, disclosed on purpose and derived rather than asserted.
        #
        # This repo's most-repeated defect is not a false number: it is a TRUE number filed
        # under the wrong subject. Champions of Krynn currently produces the SAME digits for
        # two unrelated quantities in this one report -- its CFG-reachable decoded 0x41
        # OCCURRENCE count, and its raw IF-followed-by-0x41 byte-PAIR upper bound. A third
        # "33 for CoK" sits in docs/engine/research/gen1-opcode-41.md, which is the occurrence
        # count again. None of those three is the IF-guarded site count, which is 3.
        #
        # Left underived, that collision is a trap: a future reader who quotes "CoK: 33" for
        # this census would be exactly wrong by a factor of 11, and every check in this repo
        # would stay green, because the number is true of something. So the collision is
        # detected from the live values and its existence is stated, not assumed.
        "numeric_collision_warning": _collision_warning,
        # --- What this still does NOT establish. Kept in the artifact, not only in prose,
        # so a reader who quotes the number is handed its limits in the same object.
        # --- Cross-implementation check. Same shape as
        # corroboration_0x41_vs_gen1_opcode_41_doc: external figures are recorded as literals
        # and compared against the LIVE ones, so the comparison cannot silently rot.
        "cross_implementation_check": _cross_impl,
        "still_unestablished": [
            "Whether the engine ever EXECUTES the false branch at these sites at runtime. This "
            "is a static reachability result; no DOSBox session was run for it, and "
            "false_branch_live means the static walk could not rule the branch out, not that a "
            "real playthrough takes it.",
            "Whether a retail playthrough reaches any of these IF branches; static liveness is "
            "not a runtime trace.",
            "The raw byte-pair candidates that this walk does not reach as instruction starts "
            "were not decomposed one by one; they are bounded and counted, not explained.",
            "Whether the CoK selected-target mapping used by op_award_xp matches every retail "
            "selected-character transition; the census only establishes ECL placement.",
        ],
    }
    corroboration_0x41 = {
        "doc": "docs/engine/research/gen1-opcode-41.md",
        "cok_matches_exactly": naive_0x41["champions-of-krynn"]["cfg_reachable_landing_count"] == 33,
        "cok_doc_value": 33,
        "cok_this_tool_value": naive_0x41["champions-of-krynn"]["cfg_reachable_landing_count"],
        "dok_doc_value": 50,
        "dok_this_tool_value": naive_0x41["death-knights-of-krynn"]["cfg_reachable_landing_count"],
        "dok_mismatch_is_disclosed_in_source_doc": True,
        "note": (
            "gen1-opcode-41.md's own from-scratch walker found CoK=33, matching this tool's "
            "CFG-reachable count for CoK exactly -- free corroboration from an independent "
            "implementation. Its DoK figure (50) does not match this tool's DoK figure, but that "
            "doc discloses its own DoK undercount/overcount risk as a known limitation of ITS "
            "walker's simplified GOSUB/GOTO handling, unrelated to this tool, and says so before "
            "this tool ever ran."
        ),
    }

    return {
        "schema_version": 1,
        "source_asm": str(asm_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "dispatch_chain_lines": {"start": start + 1, "end": end + 1},
        "fallback_handler": fallback_label,
        "placeholder_handler": PLACEHOLDER_HANDLER,
        "placeholder_opcodes_0_255": sorted(f"0x{op:02x}" for op in placeholder_opcodes),
        "opcodes_with_any_handler_count_0_255": sum(1 for v in dispatch_map.values() if v != fallback_label),
        "applied_vs_recorded_combined": applied_vs_recorded_combined,
        "placeholder_opcode_occurrences_ranked_combined": placeholder_ranked_combined,
        "op_call_vacuous_dispatch_finding": {
            "opcode": "0x2d",
            "mnemonic": "CALL",
            "fallthrough_block": fallthrough,
            "known_block": known,
            "diverges": diverges,
            "note": (
                "op_call's .known: block is character-for-character identical to its fallthrough: "
                "the seven routine-id comparisons select between two identical code paths. CALL is "
                "opcode-dispatched (0x2D does not fall to op_default) but its internal routine-id "
                "sub-dispatch is a research annotation, not live host dispatch."
                if not diverges
                else
                "FIXED 2026-09-09 (ecl-op-call-real-dispatch item), PARTIALLY: op_call's .known: "
                "block now differs from its fallthrough, so the FUNCTION-LEVEL vacuous-dispatch "
                "finding no longer applies. Do not read this as 'CALL is now fully applied' -- "
                "only 3 of the 8 named ids have real per-id dispatch (0xAE11/0xADCC 'redraw "
                "dungeon view': a position/facing snapshot event; 0xAE11 is ground-truthed "
                "against coab_extracted/engine/ovr003.cs's CMD_Call case, and 0xADCC against "
                "DoK GAME.OVR:0x2ab1's homologous first switch arm; 0xE804 'advance "
                "animated picture': a persistent frame counter, ground-truthed against "
                "coab_extracted/Classes/DaxFiles/DaxArray.cs's NextFrame()). The other 5 named ids (SetupDuel x1/x2, "
                "contextual sound, MovePositionForward, refresh outdoor wall type) still fall "
                "through to the original vacuous tail unchanged -- grounding them would need "
                "combat-duel, sound-channel, and outdoor-wall-type state this VM does not own, "
                "and was deliberately left undone rather than guessed."
            ),
        },
        "games": games,
        "combined_opcode_occurrences": combined_rows,
        "combined_totals_dispatch_coverage": {
            "total_reachable_instructions": total_combined,
            "total_reachable_instructions_with_handler": has_handler_combined,
            "dispatch_coverage_fraction_by_instruction_volume": (
                has_handler_combined / total_combined if total_combined else None
            ),
        },
        "opcodes_with_no_handler_ranked_by_occurrence": no_handler_ranked,
        "no_handler_ranking_note": (
            "The table names ordinary fallback handlers. Both Krynn titles admit 0x41 and "
            "reach op_award_xp; its CoK and validated DoK GBPR writeback paths are covered "
            "separately by the DOSBox effects smoke."
        ),
        "no_handler_native_runtime_note": (
            "The prior Gen1 0x41 bad-opcode and skip-one-instruction out-of-bounds concern is "
            "closed: vm_run reaches op_award_xp and optab supplies the two-operand frame for "
            "both titles. DoK writeback requires CCPARTY's GBD1 threshold-cache capability; "
            "without it the event is recorded but the roster is unchanged. The retained "
            "IF-adjacency census below is descriptive corpus evidence, not an active runtime-failure claim."
        ),
        "call_scale_of_vacuous_dispatch": call_scale,
        "call_routine_id_census": call_routine_id_census,
        "methodology_discrepancy_demo_opcode_0x41": naive_0x41,
        "guarded_0x41_after_if_census": guarded_0x41_after_if_census,
        "corroboration_0x41_vs_gen1_opcode_41_doc": corroboration_0x41,
    }


# ---------------------------------------------------------------------------
# Markdown rendering + CLI
# ---------------------------------------------------------------------------


def render_markdown(report: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# ECL host-call coverage")
    lines.append("")
    lines.append(
        "Generated by `tools/ecl_host_call_coverage.py`. Do not hand-edit; regenerate and diff."
    )
    lines.append("")
    lines.append("## Reproduction")
    lines.append("")
    lines.append("```")
    lines.append(
        "python tools/ecl_host_call_coverage.py --json build/ecl-host-call-coverage.json "
        "--markdown docs/engine/research/ecl-host-call-coverage.md"
    )
    lines.append("python -m pytest tools/test_ecl_host_call_coverage.py -v")
    lines.append("```")
    lines.append("")
    lines.append(
        "The second command is expected to end fully green, with "
        "`test_PIN_op_call_routine_id_dispatch_should_genuinely_diverge` reporting **xfailed** "
        "(not failed, not skipped). That pin is `pytest.mark.xfail(strict=True)`: it documents "
        "the standing gap below as a real, expected-to-fail condition so the suite stays green on "
        "HEAD without hiding the gap, and `strict=True` means the pin itself breaks LOUDLY (XPASS "
        "-> hard failure) the moment the underlying defect is fixed, forcing whoever fixes it to "
        "also update this pin. See that test's docstring before touching it."
    )
    lines.append("")
    lines.append("## Headline: recorded-only work and vacuous CALL handling")
    lines.append("")
    lines.append(
        "This tool finds two separate gaps between what CoK's and DoK's retail ECL scripts ask "
        "the native VM (`native/src/ccecl.asm`) to do and what the VM applies:"
    )
    lines.append("")
    lines.append(
        "1. **The placeholder-recorder gap (this section, the PRIMARY finding).** Ten opcode byte "
        "values -- `PRINT`, `PRINTCLEAR`, `DELAY`, `PICTURE`, `PRINT_RETURN`, `TREASURE`, "
        "`CLEAR_BOX`, `ROB`, `SHORT_MENU`, `UNKNOWN_1F` -- all dispatch to `op_script_effect`. "
        "Read in `native/src/ccecl.asm`, that handler writes `cur_op` and its dialect-adjusted "
        "operands into `fx_script_events`, bumps `fx_script_count`, sets `FX_HAVE_SCRIPT`, and "
        "returns. It is a RECORDER, not an implementation: dispatch succeeds, decode is correct, "
        "control flow is preserved, and **nothing else happens**. No text prints, no box clears, "
        "no picture shows, no delay elapses, no treasure is granted, no item is stolen, no menu "
        "appears. This is the game's dialogue, its cutscene art, its pacing, and its loot."
    )
    lines.append(
        "2. **The `op_call` vacuous-dispatch finding (below, SEPARATE).** `CALL` (0x2D) has its "
        "own real handler, `op_call`, which does NOT go through `op_script_effect` at all -- but "
        "that handler's internal seven-way routine-id sub-dispatch selects between two "
        "byte-identical code paths, so it too never actually branches on which host routine was "
        "requested."
    )
    lines.append("")
    _cov = {
        g["title"]: g["dispatch_coverage_fraction_by_distinct_opcode"]
        for g in report["games"].values()
    }
    _cov_text = ", ".join(f"{name} {frac:.3f}" for name, frac in _cov.items())
    lines.append(
        "`op_award_xp` applies each title's verified transient-GBPR XP behavior: CoK's eligible "
        "party split and DoK's per-member class-slot split with a CCPARTY threshold cache."
    )
    lines.append("")
    lines.append(
        "A metric that asks only whether an opcode reaches a non-default handler cannot see "
        "either recorded-only effects or `op_call`'s incomplete routine-id work. Dispatch coverage "
        f"is { _cov_text }; retain it only as a narrower control-flow measure."
    )
    lines.append("")
    lines.append("## Scope and what this does NOT establish")
    lines.append("")
    lines.append(
        "- Static source-text analysis of `native/src/ccecl.asm` plus static CFG decode of "
        "retail `ECL{1,2,3}.DAX` bytes. No DOSBox/emulator run, no debugger, no runtime trace "
        "backs any number here."
    )
    lines.append(
        "- \"Applied\" means the opcode reaches a handler that is neither `op_default` (no "
        "handler at all) nor `op_script_effect` (the placeholder recorder). It does NOT mean the "
        "handler is semantically correct or complete -- only that it is not KNOWN to be a no-op "
        "recorder. `op_call` is the one exception known to also do nothing useful despite not "
        "being `op_script_effect`; it is called out separately below rather than folded into "
        "\"applied\", and is excluded from the applied/placeholder split's denominator by neither "
        "-- it still counts as \"applied\" in that split because this tool's placeholder-detection "
        "is a handler-identity check, not a semantic one, and `op_call`'s vacuity was found by a "
        "different, targeted proof (comparing its own two branches), not by the placeholder rule. "
        "Treat `applied` as an upper bound on real implementation, not a certificate of it."
    )
    lines.append(
        "- CFG reachability from the five documented ECL header entry points "
        "(`vm_run_1`/`search_location`/`pre_camp_check`/`camp_interrupted`/`initial_entry`), "
        "not from a save-file-seeded runtime walk. An instruction reachable only via a "
        "GOTO/GOSUB target this tool cannot resolve statically (a non-immediate/dynamic "
        "operand) is undercounted, not overcounted -- see each block's `truncated_offsets`."
    )
    lines.append(
        "- Only CoK and DoK are measured (this item's scope). The dispatch-map extraction in "
        "part (a) covers the full 0x00-0xff byte range, including Buck/Pool-only extended "
        "opcodes (0x42-0x4c, 0xa1) that never appear in CoK's or DoK's own corpus and are "
        "reported as having-a-handler-but-unused rather than omitted."
    )
    lines.append("")
    lines.append("## PRIMARY metric: applied vs. recorded-only vs. no handler")
    lines.append("")
    avr = report["applied_vs_recorded_combined"]
    lines.append(
        f"`{report['placeholder_handler']}` is the placeholder recorder; its opcodes are derived "
        f"PROGRAMMATICALLY from the dispatch map (`derive_placeholder_opcodes`, handler-label "
        f"match), never hard-coded. Today that set is "
        f"{', '.join(report['placeholder_opcodes_0_255'])} "
        f"({len(report['placeholder_opcodes_0_255'])} opcodes). Both Krynn titles apply `0x41` "
        "when their validated transient roster contract is available."
    )
    lines.append("")
    lines.append(
        "| Title | reachable instrs | applied | recorded-only | no handler | "
        "fraction applied | fraction recorded-only |"
    )
    lines.append("|---|---|---|---|---|---|---|")
    for game in report["games"].values():
        fa = game["fraction_applied"]
        fp = game["fraction_recorded_only_placeholder"]
        lines.append(
            f"| {game['title']} | {game['total_reachable_instructions']} | "
            f"{game['applied_instructions']} | {game['placeholder_instructions']} | "
            f"{game['no_handler_instructions']} | "
            f"{'' if fa is None else f'{fa:.3f}'} | {'' if fp is None else f'{fp:.3f}'} |"
        )
    fa = avr["fraction_applied"]
    fp = avr["fraction_recorded_only_placeholder"]
    lines.append(
        f"| **Combined** | **{avr['total_reachable_instructions']}** | "
        f"**{avr['applied_instructions']}** | **{avr['placeholder_instructions']}** | "
        f"**{avr['no_handler_instructions']}** | "
        f"**{'' if fa is None else f'{fa:.3f}'}** | **{'' if fp is None else f'{fp:.3f}'}** |"
    )
    lines.append("")
    lines.append(
        "That is: CoK's own retail scripts spend roughly a fifth of their reachable ECL "
        "instruction volume on opcodes that are decoded correctly, control-flow-preserved "
        "perfectly, and applied never; DoK is close behind."
    )
    lines.append("")
    lines.append("### Recorded-only opcodes, ranked by combined occurrence")
    lines.append("")
    lines.append("| opcode | mnemonic | CoK | DoK | combined |")
    lines.append("|---|---|---|---|---|")
    for row in report["placeholder_opcode_occurrences_ranked_combined"]:
        by_title = row["occurrences_by_title"]
        lines.append(
            f"| {row['opcode']} | {row['mnemonic']} | "
            f"{by_title.get('champions-of-krynn', 0)} | {by_title.get('death-knights-of-krynn', 0)} | "
            f"{row['occurrences_combined']} |"
        )
    lines.append("")
    lines.append("## The op_call vacuous-dispatch finding (separate from the placeholder gap above)")
    lines.append("")
    finding = report["op_call_vacuous_dispatch_finding"]
    lines.append(f"`diverges: {finding['diverges']}` -- {finding['note']}")
    lines.append("")
    lines.append("Fallthrough block (no routine id matched):")
    lines.append("```")
    lines.extend(finding["fallthrough_block"])
    lines.append("```")
    lines.append("")
    lines.append("`.known:` block (a routine id DID match):")
    lines.append("```")
    lines.extend(finding["known_block"])
    lines.append("```")
    lines.append("")
    lines.append(
        f"Dispatch chain parsed from `{report['source_asm']}` lines "
        f"{report['dispatch_chain_lines']['start']}-{report['dispatch_chain_lines']['end']}."
    )
    lines.append("")
    lines.append("### Scale of the pinned op_call finding")
    lines.append("")
    lines.append(
        "CALL (0x2D) is NOT one of the ten `op_script_effect` placeholder opcodes above -- it has "
        "its own handler, `op_call`, which never falls to `op_default` either. Its handler exists, "
        "records the event, and always advances `pc` the same way outside the grounded ids. "
        "This is how much of each title's own reachable ECL "
        "instruction volume that affects:"
    )
    lines.append("")
    lines.append("| title | CALL (0x2D) occurrences | total reachable instructions | fraction |")
    lines.append("|---|---|---|---|")
    for pid, game in report["games"].items():
        scale = report["call_scale_of_vacuous_dispatch"][pid]
        frac = scale["fraction_of_reachable_instructions"]
        lines.append(
            f"| {game['title']} | {scale['call_occurrences']} | "
            f"{scale['total_reachable_instructions']} | {'' if frac is None else f'{frac:.4f}'} |"
        )
    combined_scale = report["call_scale_of_vacuous_dispatch"]["combined"]
    combined_frac = combined_scale["fraction_of_reachable_instructions"]
    lines.append(
        f"| Combined | {combined_scale['call_occurrences']} | "
        f"{combined_scale['total_reachable_instructions']} | "
        f"{'' if combined_frac is None else f'{combined_frac:.4f}'} |"
    )
    lines.append("")

    # --- WHICH routine ids those CALLs actually name -----------------------------------------
    census = report["call_routine_id_census"]
    lines.append("### Which routine ids those CALLs name, and how many reach behaviour")
    lines.append("")
    lines.append(
        "The table above counts CALL sites; this one says which routine id each one asks for. "
        "**Frame:** " + census["frame"] + ". Both id lists below are parsed out of `ccecl.asm` "
        "on every run rather than transcribed, so an id added to (or dropped from) the "
        "recognizer chain moves these columns instead of leaving this page behind."
    )
    lines.append("")
    lines.append(
        "Recognized by `op_call` (the named constants): "
        + ", ".join(f"`{i}`" for i in census["recognized_ids"])
        + ". Genuinely grounded inside `.known:` (distinct behaviour, not the vacuous "
        "record-and-advance tail): "
        + ", ".join(f"`{i}`" for i in census["grounded_ids"])
        + "."
    )
    lines.append("")
    header = "| routine id | " + " | ".join(g["title"] for g in report["games"].values())
    lines.append(header + " | combined | recognized | grounded |")
    lines.append("|---" * (3 + len(report["games"])) + "|---|")
    for row in census["ranked"]:
        per_title = " | ".join(
            str(row["occurrences_by_title"].get(pid, 0)) for pid in report["games"]
        )
        lines.append(
            f"| `{row['routine_id']}` | {per_title} | {row['occurrences_combined']} | "
            f"{'yes' if row['recognized_by_op_call'] else 'NO'} | "
            f"{'yes' if row['grounded_in_known_block'] else 'no'} |"
        )
    lines.append("")
    frac = census["fraction_of_calls_grounded"]
    lines.append(
        f"**{census['calls_reaching_grounded_id']} of {census['literal_operand_call_sites']} "
        f"reachable CALL sites ({'' if frac is None else f'{frac:.3f}'}) name a grounded id**; "
        f"{census['calls_reaching_recognized_id']} name a recognized one, so the gap between "
        "those two figures is the CALLs that match a named constant and still fall through to "
        "the vacuous tail. `dynamic_operand_call_sites` is "
        f"{census['dynamic_operand_call_sites']} -- CALL sites whose operand is a memory read "
        "rather than a literal, which have no statically-known id and are excluded from the "
        "table rather than counted as if their operand word were one."
    )
    lines.append("")
    unrecognized = census["unrecognized_ids_ranked"]
    if unrecognized:
        top = unrecognized[0]
        lines.append(
            f"The largest UNRECOGNIZED id is `{top['routine_id']}` at "
            f"{top['occurrences_combined']} occurrences -- it is in neither list above, so every "
            "one of those calls takes the fallthrough path. Ranked: "
            + ", ".join(f"`{r['routine_id']}` ({r['occurrences_combined']})" for r in unrecognized)
            + "."
        )
        lines.append("")
    lines.append(
        "## SECONDARY / WEAKER metric: opcode-level dispatch coverage (does NOT mean applied)"
    )
    lines.append("")
    lines.append(
        "**Caveat, read before quoting any number in this section:** dispatch coverage only "
        "answers whether an opcode reaches some handler other than `op_default`. `op_script_effect`, "
        "and incomplete `op_call` work all count as handlers here. The live values therefore "
        "do not mean every requested effect is "
        "implemented."
    )
    lines.append("")
    lines.append(
        "| Title | ECL blocks | distinct opcodes used | distinct opcodes with a handler | "
        "dispatch coverage (opcode) | reachable instrs | instrs with a handler | "
        "dispatch coverage (volume) | state-limit hits |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for game in report["games"].values():
        cov_op = game["dispatch_coverage_fraction_by_distinct_opcode"]
        cov_vol = game["dispatch_coverage_fraction_by_instruction_volume"]
        lines.append(
            f"| {game['title']} | {game['ecl_block_count']} | {game['distinct_opcodes_used']} | "
            f"{game['distinct_opcodes_with_handler_and_used']} | "
            f"{'' if cov_op is None else f'{cov_op:.3f}'} | {game['total_reachable_instructions']} | "
            f"{game['total_reachable_instructions_with_handler']} | "
            f"{'' if cov_vol is None else f'{cov_vol:.3f}'} | {game['state_limit_hits']} |"
        )
    combined = report["combined_totals_dispatch_coverage"]
    cov_vol = combined["dispatch_coverage_fraction_by_instruction_volume"]
    lines.append("")
    lines.append(
        f"Combined (CoK + DoK): {combined['total_reachable_instructions']} reachable instructions, "
        f"{combined['total_reachable_instructions_with_handler']} reaching a handler "
        f"({'' if cov_vol is None else f'{cov_vol:.3f}'} dispatch coverage by instruction volume -- "
        "see the caveat above before repeating this number)."
    )
    lines.append("")
    lines.append("### Opcodes with NO handler at all, ranked by how often they occur")
    lines.append("")
    no_handler = report["opcodes_with_no_handler_ranked_by_occurrence"]
    if no_handler:
        lines.append("| title | opcode | handler (fallback) | occurrences |")
        lines.append("|---|---|---|---|")
        for row in no_handler:
            lines.append(
                f"| {row['title']} | {row['opcode']} | {row['handler']} | {row['occurrences']} |"
            )
        # The note must render in BOTH branches. It used to appear only when the table was
        # empty -- i.e. only when it had nothing to disclose -- so the moment this ranking
        # acquired a real entry, the paragraph explaining what the entry MEANS stopped being
        # printed. A disclosure that hides itself as soon as there is something to disclose is
        # worse than no disclosure, because the empty table had been carrying the explanation.
        lines.append("")
        lines.append(report["no_handler_ranking_note"])
        lines.append("")
        lines.append(report["no_handler_native_runtime_note"])
    else:
        lines.append(f"(empty) -- {report['no_handler_ranking_note']}")
        lines.append("")
        lines.append(report["no_handler_native_runtime_note"])
    lines.append("")
    lines.append("## Methodology-discrepancy demonstration (opcode byte 0x41)")
    lines.append("")
    lines.append(
        "**This section changed meaning on 2026-09-10 and the previous framing is quoted, not "
        "deleted, because it is what a returning reader will expect to find.** It used to open: "
        "\"0x41 is not in CoK's or DoK's own opcode table (`OPCODES` covers 0x00-0x40 only, and "
        "neither profile has an extended-opcode override for 0x41), so a reachable landing on "
        "that byte value is an `unknown_opcode_byte_count`, not a decoded occurrence -- this "
        "tool is honest that it does not know what 0x41 means in this dialect.\" The first "
        "clause is still true (`OPCODES` really does stop at 0x40); the second is now FALSE. "
        "Both Gen1 titles now carry a grounded extended-opcode definition for 0x41 "
        "(`GEN1_AWARD_XP`, two operand words), read from each title's OWN retail `GAME.OVR` "
        "handler prefetch idiom rather than fitted to the corpus, so 0x41 DECODES and its sites "
        "are real decoded occurrences."
    )
    lines.append("")
    lines.append(
        "That matters for what this table is allowed to claim. The comparison quantity is now "
        "the CFG-reachable DECODED OCCURRENCE count. The old quantity -- unknown-opcode-byte "
        "landings -- is published beside it and now reads 0 for both titles **by construction, "
        "not by measurement**: a decoded opcode can never appear in `unknown_opcode_landings`, "
        "so comparing a naive scan against it would be a demonstration that can no longer fail. "
        "The point it was built to make survives the change intact: a naive raw-byte scan "
        "(`bytes.count(bytes([0x41]))` over each ECL block, ignoring instruction boundaries and "
        "reachability entirely) still overcounts by roughly 15-19x, because it also counts 0x41 "
        "wherever it happens to fall inside another instruction's operand words, and it counts "
        "unreachable blocks too:"
    )
    lines.append("")
    lines.append(
        "| profile | naive raw-byte-scan count | CFG-reachable decoded occurrences | "
        "unknown-byte landings (0 by construction since 0x41 decodes) | overcount factor |"
    )
    lines.append("|---|---|---|---|---|")
    for pid, naive in report["methodology_discrepancy_demo_opcode_0x41"].items():
        decoded = naive["cfg_reachable_decoded_occurrences"]
        factor = f"{naive['total'] / decoded:.1f}x" if decoded else "n/a"
        lines.append(
            f"| {pid} | {naive['total']} | {decoded} | "
            f"{naive['cfg_reachable_unknown_byte_landings']} | {factor} |"
        )
    lines.append("")
    corrob = report["corroboration_0x41_vs_gen1_opcode_41_doc"]
    lines.append(
        f"**Independent corroboration:** `{corrob['doc']}`'s own from-scratch reachability walker "
        f"(a separate Python port, not this tool) reports CoK = {corrob['cok_doc_value']} reached "
        f"`0x41` sites; this tool's CFG-reachable landing count for CoK is "
        f"{corrob['cok_this_tool_value']} -- **"
        + (
            "a match, two independent implementations agreeing exactly.**"
            if corrob["cok_matches_exactly"]
            else "a MISMATCH; the two implementations disagree and this corroboration does NOT hold.**"
        )
        + " That doc's DoK figure "
        f"({corrob['dok_doc_value']}) does not match this tool's DoK figure "
        f"({corrob['dok_this_tool_value']}), but the doc itself discloses why: its own scratch "
        "walker found residual desyncs from simplified GOSUB/GOTO handling on DoK specifically, "
        "and says explicitly this does not affect its CoK number. The DoK mismatch is a disclosed "
        "limitation of that document's own walker, not evidence against this tool."
    )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--max-states", type=int, default=DEFAULT_MAX_STATES)
    parser.add_argument("--no-write", action="store_true", help="print only, write nothing")
    args = parser.parse_args()

    report = build_report(max_states=args.max_states)

    if not args.no_write:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(render_markdown(report), encoding="utf-8")
        print(f"wrote {args.json}")
        print(f"wrote {args.markdown}")

    finding = report["op_call_vacuous_dispatch_finding"]
    print(f"op_call diverges: {finding['diverges']}  ({finding['note']})")
    avr = report["applied_vs_recorded_combined"]
    print(
        f"combined: {avr['total_reachable_instructions']} reachable instrs, "
        f"{avr['applied_instructions']} applied, {avr['placeholder_instructions']} recorded-only "
        f"(fraction_applied={avr['fraction_applied']})"
    )
    for game in report["games"].values():
        print(
            f"{game['title']}: {game['total_reachable_instructions']} reachable instrs, "
            f"{game['applied_instructions']} applied, {game['placeholder_instructions']} "
            f"recorded-only (fraction_applied={game['fraction_applied']}, "
            f"fraction_recorded_only={game['fraction_recorded_only_placeholder']}), "
            f"state_limit_hits={game['state_limit_hits']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
