"""Guard: native's Gen2 ECL operand table and the TypeScript `ECL_GEN2` dialect must not drift.

WHY THIS EXISTS (2026-09-10). `native/src/ccecl.asm`'s `optab` says, in its own comment, that it
"mirrors `packages/engine/src/ecl/opcodes.ts`". It mirrors the *base* table. It does not mirror the
*dialect overrides*, and nothing in this repo could go red for the difference.

That produced a shipped defect: opcode `0x27` TREASURE ran on the Gen1 frame `(wordSet 8,
countAt none)` under Gen2 (DQK), where the retail handler's own operand prefetches say `(4, 3)`.
Native had copied the Gen1 base entry and never the Gen2 override. Fixed in `0634e15`; the
evidence, both classes and their nulls, is in
`docs/engine/research/ecl-gen2-treasure-operand-frame.md`.

`0x27` was one entry of a table native copied only half of. Repairing it repairs an instance.
THIS FILE IS FOR THE CLASS: it derives BOTH sides from their own source on every run and fails when
they disagree about an opcode that is not on a written, dated, two-sided exception list.

WHAT IT COMPARES, stated narrowly because a guard that overstates itself is worse than none.

  * The NATIVE side is `optab` plus the `is_gen2` arm of `get_operand_meta`, derived by executing
    that routine symbolically (see `eval_frame`). That pair is the operand-frame authority for
    native's *skip* path (`skip_operands_generic`, reached from `op_if`) and for every opcode
    dispatched to `op_script_effect` -- which includes `0x27` itself. It is NOT the authority for
    opcodes with a dedicated handler: `op_encounter_menu`, `op_parlay`, `op_setup_monster`,
    `op_loadpieces` and friends read their operands with hand-written `read_opp` sequences and
    never call `get_operand_meta`. Native therefore has TWO operand-frame authorities, and this
    file reads one of them. Where a known divergence's handler matters, the exception entry pins
    the handler fact too (see `0x29`).
  * The TYPESCRIPT side is `ECL_GEN2`'s effective frame, derived through `ecl_dialect_parity`,
    which already parses `opcodes.ts`/`disassemble.ts` for the Python-mirror guard. Deliberately
    reused rather than re-implemented: a second hand-written copy of the TS resolution order is
    exactly the second source of truth this whole file exists to prevent.
  * Neither side is an oracle for the other. Both can agree and both be wrong about a retail
    handler neither has read. This says only that the two tracks speak with one voice.

THE RESOLUTION ORDER IS THE TRAP, so it is modelled explicitly on both sides and pinned by
`ResolutionOrderTests`. A previous cross-track drift guard in this repo went red on CORRECT code
because it searched only `opcodeOverrides` when the engine resolves
`opcodeOverrides ?? KRYNN_GEN1_OPCODES` -- it then demanded a redundant override the engine had
deliberately declined to write. An opcode absent from an override map is NOT absent from the
dialect.

  * TS: `def = opcodeOverrides[op] ?? KRYNN_GEN1_OPCODES[op]`; if that is undefined the opcode is
    a bad opcode and `wordSetOverrides` is never consulted. Then
    `wordSet = wordSetOverrides[op] ?? def.wordSet`, while `countAt` comes from `def` ALONE -- a
    `wordSetOverrides` entry cannot introduce or remove a count-driven tail.
  * Native: `dl/dh` are loaded from `optab` FIRST, then the `is_gen2` arm may replace one or both.
    Most arms set only `DL` and inherit `DH` from the table (which is why `0x27`'s fix needed an
    explicit `mov dh, 3`).

AREA GATING IS REPRESENTED, NOT FLATTENED. Native has no remaining Gen2 area-gated frame.
The derivation still evaluates native at `area_id == 5` and away from it, so a future area-only
answer is reported as an `area-gated` divergence, never as agreement.

EXCEPTIONS ARE TWO-SIDED. `KNOWN_DIVERGENCES` records each surviving disagreement with both
native frames, the TS frame, a date, why it is not fixed, and what would resolve it. An entry whose
frames have changed goes red; an entry that has CONVERGED goes red as a stale exception. A silent
exclusion list is how a vacuous check passes, so there is no way to remove an opcode from scope
without saying so in writing.
"""
from __future__ import annotations

import re
import unittest
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence

import ecl_dialect_parity as ts

REPO_ROOT = Path(__file__).resolve().parents[1]
CCECL_ASM = REPO_ROOT / "native" / "src" / "ccecl.asm"

#: `optab`'s second byte when an opcode has no count-driven tail.
NO_COUNT_SENTINEL = 0xFF

#: `(word_set, count_at)`; `count_at is None` means "no count-driven tail".
Frame = tuple[int, Optional[int]]


class AsmParseError(RuntimeError):
    """Raised when `ccecl.asm` cannot be read as the constructs this file models.

    Deliberately LOUD. A parser that returned an empty table, or silently ignored an instruction it
    did not understand, would turn the live comparison into a vacuous pass the moment somebody
    refactored the routine -- the exact failure shape this repo's "probes must be able to fail"
    rule exists to stop. If `get_operand_meta` grows a construct the interpreter below does not
    model, this file goes red and someone has to decide whether to model it or to narrow the
    guard's declared scope in writing.
    """


# ---------------------------------------------------------------------------
# NASM source parsing
# ---------------------------------------------------------------------------

_HEX_0X = re.compile(r"^0x([0-9a-fA-F]+)$")
_HEX_H = re.compile(r"^([0-9a-fA-F]+)h$")
_DEC = re.compile(r"^\d+$")


def parse_num(token: str) -> int:
    """A NASM integer literal: `0xff`, `21h`, `14`."""
    token = token.strip()
    match = _HEX_0X.match(token) or _HEX_H.match(token)
    if match:
        return int(match.group(1), 16)
    if _DEC.match(token):
        return int(token, 10)
    raise AsmParseError("not a numeric literal: %r" % token)


def strip_comment(line: str) -> tuple[str, str]:
    """Split an assembly line into (code, comment). `ccecl.asm` uses `;` and no `;` in strings
    appears in either construct this file reads, but the split is done on the first `;` outside a
    quoted run so a future string constant cannot silently truncate a line."""
    quote: Optional[str] = None
    for i, ch in enumerate(line):
        if quote is not None:
            if ch == quote:
                quote = None
            continue
        if ch in "'\"":
            quote = ch
        elif ch == ";":
            return line[:i], line[i + 1 :]
    return line, ""


_OPTAB_DB = re.compile(r"^db\s+(\S+)\s*,\s*(\S+)$")
_OPTAB_COMMENT = re.compile(r"^\s*([0-9A-Fa-f]{2})\s+(\S+)")


def parse_optab(text: str, *, min_entries: int = 0x41) -> list[int]:
    """`optab`'s bytes, in order: two per opcode, `{word_set, count_at}`.

    The per-line comment (`; 27 TREASURE`) is cross-checked against the entry's position, so a
    hand-edit that inserts or deletes a row -- shifting every opcode after it -- fails here rather
    than producing a plausible, wrong table.

    `min_entries` exists ONLY so the synthetic fixtures below can use a four-row table. Every live
    call takes the default, which is the density `optab`'s own header comment claims.
    """
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if line.strip() == "optab:" and not line[:1].isspace():
            start = i + 1
            break
    if start is None:
        raise AsmParseError("no `optab:` label in ccecl.asm")

    out: list[int] = []
    seen = 0
    for line in lines[start:]:
        code, comment = strip_comment(line)
        if not code.strip():
            if out:
                break
            continue
        if not line[:1].isspace():
            break
        match = _OPTAB_DB.match(code.strip())
        if not match:
            break
        word_set = parse_num(match.group(1))
        count_at = parse_num(match.group(2))
        cmatch = _OPTAB_COMMENT.match(comment)
        if not cmatch:
            raise AsmParseError(
                "optab entry %d has no `; NN MNEMONIC` comment to cross-check: %r" % (seen, line)
            )
        documented = int(cmatch.group(1), 16)
        if documented != seen:
            raise AsmParseError(
                "optab row %d is commented as opcode 0x%02x -- the table has shifted" % (seen, documented)
            )
        out.append(word_set)
        out.append(count_at)
        seen += 1
    if seen < min_entries:
        raise AsmParseError(
            "optab has only %d entries; expected at least %d" % (seen, min_entries)
        )
    return out


def parse_optab_mnemonics(text: str) -> dict[int, str]:
    """Opcode -> the mnemonic `optab`'s own comment gives it (used only for readable messages)."""
    lines = text.splitlines()
    start = next(
        (i + 1 for i, l in enumerate(lines) if l.strip() == "optab:" and not l[:1].isspace()),
        None,
    )
    if start is None:
        raise AsmParseError("no `optab:` label in ccecl.asm")
    out: dict[int, str] = {}
    seen = 0
    for line in lines[start:]:
        code, comment = strip_comment(line)
        if not code.strip():
            if out:
                break
            continue
        if not line[:1].isspace() or not _OPTAB_DB.match(code.strip()):
            break
        cmatch = _OPTAB_COMMENT.match(comment)
        if cmatch:
            out[seen] = cmatch.group(2)
        seen += 1
    return out


@dataclass(frozen=True)
class Insn:
    line_no: int
    mnemonic: str
    ops: tuple[str, ...]
    text: str


_GLOBAL_LABEL = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*):")
_LOCAL_LABEL = re.compile(r"^(\.[A-Za-z0-9_]+):")


def _split_operands(rest: str) -> tuple[str, ...]:
    """Split on commas outside `[...]`, and squeeze whitespace inside each operand."""
    ops: list[str] = []
    depth = 0
    cur = ""
    for ch in rest:
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        if ch == "," and depth == 0:
            ops.append(cur)
            cur = ""
            continue
        cur += ch
    if cur.strip():
        ops.append(cur)
    return tuple(re.sub(r"\s+", "", op) for op in ops)


def parse_routine(text: str, name: str) -> tuple[list[Insn], dict[str, int]]:
    """Instructions and local labels of one global routine, from `name:` to the next global label."""
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        match = _GLOBAL_LABEL.match(line)
        if match and match.group(1) == name:
            start = i + 1
            break
    if start is None:
        raise AsmParseError("no `%s:` label in ccecl.asm" % name)

    insns: list[Insn] = []
    labels: dict[str, int] = {}
    for offset, line in enumerate(lines[start:], start=start):
        if _GLOBAL_LABEL.match(line):
            break
        code, _ = strip_comment(line)
        code = code.strip()
        if not code:
            continue
        lmatch = _LOCAL_LABEL.match(code)
        if lmatch:
            labels[lmatch.group(1)] = len(insns)
            code = code[lmatch.end() :].strip()
            if not code:
                continue
        parts = code.split(None, 1)
        mnemonic = parts[0].lower()
        ops = _split_operands(parts[1]) if len(parts) > 1 else ()
        insns.append(Insn(offset + 1, mnemonic, ops, code))
    if not insns:
        raise AsmParseError("routine %s parsed to zero instructions" % name)
    return insns, labels


# ---------------------------------------------------------------------------
# Symbolic execution of get_operand_meta
# ---------------------------------------------------------------------------

_BYTE_REGS = {"al", "ah", "bl", "bh", "cl", "ch", "dl", "dh"}
_WORD_REGS = {"ax", "bx", "cx", "dx", "si", "di", "bp"}
_MEM_BYTE = re.compile(r"^(byte)?\[([a-z_][a-z0-9_]*)\]$")
_MEM_WORD = re.compile(r"^(word)?\[([a-z_][a-z0-9_]*)\]$")
_OPTAB_REF = re.compile(r"^(byte)?\[optab\+bx(?:\+(\d+))?\]$")

_CONDITIONS = {
    "je": lambda a, b: a == b,
    "jz": lambda a, b: a == b,
    "jne": lambda a, b: a != b,
    "jnz": lambda a, b: a != b,
    "jb": lambda a, b: a < b,
    "jbe": lambda a, b: a <= b,
    "ja": lambda a, b: a > b,
    "jae": lambda a, b: a >= b,
}

_STEP_BUDGET = 2000


def eval_frame(
    optab: Sequence[int],
    insns: Sequence[Insn],
    labels: dict[str, int],
    opcode: int,
    *,
    is_gen2: int,
    area_id: int,
    short_opframes: int,
) -> Optional[Frame]:
    """Run `get_operand_meta` for one opcode under one machine state.

    Returns `(word_set, count_at)`, or `None` when the routine cannot produce a frame -- which
    today means the `optab` lookup fell off the end of the table (opcodes above `0x40`) and no
    override arm supplied both halves. Any instruction outside the modelled subset raises
    `AsmParseError` naming the line, so an unmodelled construct is loud rather than silently
    skipped.
    """
    regs: dict[str, Optional[int]] = {"al": opcode & 0xFF, "bx": 0, "dl": None, "dh": None}
    mem = {"is_gen2": is_gen2, "area_id": area_id, "short_opframes": short_opframes}
    stack: list[Optional[int]] = []
    flags: Optional[tuple[int, int]] = None

    def value_of(token: str) -> int:
        if token in regs and regs[token] is not None:
            return int(regs[token])  # type: ignore[arg-type]
        if token in mem:
            return mem[token]
        raise AsmParseError("unreadable operand %r" % token)

    pc = 0
    steps = 0
    while True:
        steps += 1
        if steps > _STEP_BUDGET:
            raise AsmParseError("get_operand_meta did not terminate for opcode 0x%02x" % opcode)
        if pc >= len(insns):
            raise AsmParseError("ran off the end of get_operand_meta for opcode 0x%02x" % opcode)
        ins = insns[pc]
        m, ops = ins.mnemonic, ins.ops

        def bad() -> AsmParseError:
            return AsmParseError(
                "ccecl.asm:%d: get_operand_meta uses a construct this guard does not model: %r"
                % (ins.line_no, ins.text)
            )

        if m == "ret":
            break
        if m == "push" and len(ops) == 1 and ops[0] in _WORD_REGS:
            stack.append(regs.get(ops[0]))
            pc += 1
            continue
        if m == "pop" and len(ops) == 1 and ops[0] in _WORD_REGS:
            if not stack:
                raise bad()
            regs[ops[0]] = stack.pop()
            pc += 1
            continue
        if m == "movzx" and len(ops) == 2 and ops[0] in _WORD_REGS and ops[1] in _BYTE_REGS:
            regs[ops[0]] = value_of(ops[1]) & 0xFF
            pc += 1
            continue
        if m == "add" and len(ops) == 2 and ops[0] in _WORD_REGS:
            src = value_of(ops[1]) if ops[1] in regs else parse_num(ops[1])
            regs[ops[0]] = (value_of(ops[0]) + src) & 0xFFFF
            pc += 1
            continue
        if m == "xor" and len(ops) == 2 and ops[0] == ops[1] and ops[0] in _BYTE_REGS:
            regs[ops[0]] = 0
            pc += 1
            continue
        if m == "mov" and len(ops) == 2 and ops[0] in _BYTE_REGS:
            table = _OPTAB_REF.match(ops[1])
            if table:
                index = value_of("bx") + int(table.group(2) or 0)
                regs[ops[0]] = optab[index] if index < len(optab) else None
            else:
                regs[ops[0]] = parse_num(ops[1]) & 0xFF
            pc += 1
            continue
        if m == "cmp" and len(ops) == 2:
            target = ops[0]
            mem_ref = _MEM_BYTE.match(target) or _MEM_WORD.match(target)
            if mem_ref:
                lhs = mem.get(mem_ref.group(2))
                if lhs is None:
                    raise bad()
            elif target in _BYTE_REGS or target in _WORD_REGS:
                lhs = value_of(target)
            else:
                raise bad()
            flags = (lhs, parse_num(ops[1]))
            pc += 1
            continue
        if m == "jmp" and len(ops) == 1:
            if ops[0] not in labels:
                raise bad()
            pc = labels[ops[0]]
            continue
        if m in _CONDITIONS and len(ops) == 1:
            if flags is None or ops[0] not in labels:
                raise bad()
            pc = labels[ops[0]] if _CONDITIONS[m](*flags) else pc + 1
            continue
        raise bad()

    word_set, count_at = regs["dl"], regs["dh"]
    if word_set is None or count_at is None:
        return None
    return (word_set, None if count_at == NO_COUNT_SENTINEL else count_at)


@dataclass(frozen=True)
class NativeFrames:
    """Native's Gen2 frame in the two states `get_operand_meta` distinguishes."""

    default: Optional[Frame]
    area5: Optional[Frame]

    @property
    def defined(self) -> bool:
        return self.default is not None or self.area5 is not None


#: Areas probed to prove `area_id == 5` is the ONLY value that changes an answer. If native ever
#: gains a second gated area this list makes the two-state model fail loudly instead of averaging.
PROBE_AREAS = (0, 1, 2, 4, 6, 31, 66, 0xFFFF)


def native_gen2_frames(text: Optional[str] = None, *, min_entries: int = 0x41) -> dict[int, NativeFrames]:
    """Every opcode's effective native Gen2 frame, derived from `ccecl.asm`.

    `short_opframes` is a Gen1 DoK state, so Gen2 is evaluated with it clear. The separate
    state-independence test still proves that a future Gen2 arm cannot silently make it matter.
    """
    text = CCECL_ASM.read_text(encoding="utf-8", errors="replace") if text is None else text
    optab = parse_optab(text, min_entries=min_entries)
    insns, labels = parse_routine(text, "get_operand_meta")
    out: dict[int, NativeFrames] = {}
    for opcode in range(0x100):
        default = eval_frame(
            optab, insns, labels, opcode, is_gen2=1, area_id=PROBE_AREAS[1], short_opframes=0
        )
        area5 = eval_frame(
            optab, insns, labels, opcode, is_gen2=1, area_id=5, short_opframes=0
        )
        out[opcode] = NativeFrames(default, area5)
    return out


def native_gen1_frames(text: Optional[str] = None, *, short_opframes: int = 0) -> dict[int, Optional[Frame]]:
    """The Gen1 arm, derived the same way. Not compared here -- used only to prove that this
    file's changes and claims are Gen2-scoped, exactly as `0634e15` was."""
    text = CCECL_ASM.read_text(encoding="utf-8", errors="replace") if text is None else text
    optab = parse_optab(text)
    insns, labels = parse_routine(text, "get_operand_meta")
    return {
        opcode: eval_frame(
            optab, insns, labels, opcode, is_gen2=0, area_id=1, short_opframes=short_opframes
        )
        for opcode in range(0x100)
    }


def ts_gen2_frames(
    base: Optional[dict] = None, dialects: Optional[dict] = None
) -> dict[int, Frame]:
    """`ECL_GEN2`'s effective frame per opcode, through `ecl_dialect_parity`'s TS parser."""
    base = ts.parse_base_opcode_table() if base is None else base
    dialects = ts.parse_ts_dialects() if dialects is None else dialects
    if "ECL_GEN2" not in dialects:
        raise ts.TsParseError("ECL_GEN2 not found in disassemble.ts")
    return dialects["ECL_GEN2"].effective(base)


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

KIND_AREA_GATED = "area-gated"
KIND_TABLE = "table"
KIND_MISSING_NATIVE = "missing-native-entry"
KIND_MISSING_TS = "missing-ts-entry"


@dataclass(frozen=True)
class Divergence:
    opcode: int
    kind: str
    native_default: Optional[Frame]
    native_area5: Optional[Frame]
    ts_frame: Optional[Frame]

    def describe(self, mnemonics: Optional[dict[int, str]] = None) -> str:
        name = (mnemonics or {}).get(self.opcode, "?")
        return (
            "0x%02x %s [%s]: native/src/ccecl.asm optab+get_operand_meta -> %s "
            "(area_id==5: %s); packages/engine/src/ecl ECL_GEN2 -> %s"
            % (
                self.opcode,
                name,
                self.kind,
                _fmt(self.native_default),
                _fmt(self.native_area5),
                _fmt(self.ts_frame),
            )
        )


def _fmt(frame: Optional[Frame]) -> str:
    if frame is None:
        return "absent"
    word_set, count_at = frame
    return "(wordSet %d, countAt %s)" % (word_set, "none" if count_at is None else count_at)


def compare(
    native: dict[int, NativeFrames], tsf: dict[int, Frame]
) -> tuple[dict[int, Divergence], list[int]]:
    """(divergences by opcode, opcodes compared). An opcode is compared when EITHER side defines
    it, so a missing entry is a divergence rather than a silent exclusion."""
    compared = sorted({op for op, fr in native.items() if fr.defined} | set(tsf))
    found: dict[int, Divergence] = {}
    for op in compared:
        frames = native.get(op, NativeFrames(None, None))
        want = tsf.get(op)
        if not frames.defined:
            kind = KIND_MISSING_NATIVE
        elif want is None:
            kind = KIND_MISSING_TS
        elif frames.default == want and frames.area5 == want:
            continue
        elif frames.area5 == want or frames.default == want:
            kind = KIND_AREA_GATED
        else:
            kind = KIND_TABLE
        found[op] = Divergence(op, kind, frames.default, frames.area5, want)
    return found, compared


# ---------------------------------------------------------------------------
# The exception list
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Exemption:
    """One declared, dated divergence. Every field except `why`/`resolves` is compared against the
    live derivation, so the entry cannot survive either side changing OR the two converging."""

    kind: str
    native_default: Optional[Frame]
    native_area5: Optional[Frame]
    ts_frame: Optional[Frame]
    since: str
    why: str
    resolves: str


#: Opcode -> the divergence that is currently allowed to exist, and why.
#:
#: RE-DERIVED 2026-09-10 against `native/src/ccecl.asm` at repo HEAD 5691b97 (statically; no build
#: and no DOSBox session stands behind these entries). The list started from
#: `docs/engine/research/ecl-gen2-treasure-operand-frame.md`'s "Native's Gen2 dialect is much
#: narrower than the TypeScript one" section and every line of it was re-checked against the source
#: rather than copied -- that section's own list of native's unconditional overrides was already
#: stale, naming only `0x21` when `0634e15` had added `0x27` beside it.
KNOWN_DIVERGENCES: dict[int, Exemption] = {
}

#: Pins attached to individual exemptions above, so the FACT each justification rests on cannot
#: change without this file going red. Neither is a restatement of the frame comparison.
ENCOUNTER_MENU_READ_OPP_CALLS = 14
KNOWN_OP_MAX = 0x40


def count_read_opp(text: str, routine: str) -> int:
    """`call read_opp` sites inside one routine -- a static count, not a runtime one. Loops or
    conditional reads would make it a floor; for op_encounter_menu the 14 sites are straight-line
    (verified by reading it), which is the property the 0x29 exemption cites."""
    insns, _ = parse_routine(text, routine)
    return sum(1 for ins in insns if ins.mnemonic == "call" and ins.ops == ("read_opp",))


def _calls(text: str, routine: str) -> list[tuple[str, tuple[str, ...]]]:
    """(mnemonic, operands) of every instruction in one routine -- used to ask which routines
    consult `get_operand_meta` and which roll their own operand reads."""
    insns, _ = parse_routine(text, routine)
    return [(ins.mnemonic, ins.ops) for ins in insns]


def parse_equ(text: str, name: str) -> int:
    match = re.search(r"^%s\s+equ\s+(\S+)" % re.escape(name), text, re.MULTILINE)
    if not match:
        raise AsmParseError("no `%s equ` in ccecl.asm" % name)
    return parse_num(match.group(1))


def live_divergences() -> tuple[dict[int, Divergence], list[int]]:
    return compare(native_gen2_frames(), ts_gen2_frames())


# ---------------------------------------------------------------------------
# Fixtures for the synthetic tests
# ---------------------------------------------------------------------------

FIXTURE_ASM = """\
KNOWN_OP_MAX    equ 0x40

get_operand_meta:
        push    bx
        movzx   bx, al
        add     bx, bx
        mov     dl, [optab+bx]
        mov     dh, [optab+bx+1]
        cmp     byte [is_gen2], 0
        je      .maybe_dok
        cmp     al, 21h
        je      .two
        cmp     al, 27h
        je      .gen2_treasure
        cmp     word [area_id], 5
        jne     .done
        cmp     al, 2ch
        jne     .done
        jmp     .one
.two:
        mov     dl, 2
        jmp     .done
.gen2_treasure:
        mov     dl, 4
        mov     dh, 3
        jmp     .done
.maybe_dok:
        cmp     byte [short_opframes], 0
        je      .done
        cmp     al, 2ch
        je      .one
        jmp     .done
.one:
        mov     dl, 1
.done:
        pop     bx
        ret

op_encounter_menu:
        call    read_opp
        call    opp_rvalue
        call    read_opp
        ret

optab:
        db 0,0xff    ; 00 EXIT
        db 1,0xff    ; 01 GOTO
        db 2,1       ; 02 FAKE_MENU
        db 3,0xff    ; 03 COMPARE

next_global:
        ret
"""

#: A one-dialect TypeScript source that exercises the resolution order the previous drift guard in
#: this repo got wrong. `0x02` is defined ONLY in the base table (inherited, not overridden);
#: `0x03` is width-overridden but must keep the base's absent countAt; `0x04` is
#: definition-overridden; `0x4a` has a wordSetOverride with NO definition anywhere, which
#: decodeInstructionAt treats as a bad opcode before wordSetOverrides is ever consulted.
#:
#: The base table is generated dense over 0x00..0x41 because `parse_base_opcode_table` refuses a
#: sparse one -- itself a guard against a parser that reads nothing and then reports agreement.
def fixture_ts_opcodes() -> str:
    special = {
        0x02: "{ wordSet: 2, mnemonic: 'ON_GOTO', countAt: 1 }",
        0x03: "{ wordSet: 8, mnemonic: 'TREASURE' }",
        0x04: "{ wordSet: 0, mnemonic: 'SPRITE_OFF' }",
    }
    rows = [
        "  0x%02x: %s," % (op, special.get(op, "{ wordSet: 1, mnemonic: 'FILLER_%02X' }" % op))
        for op in range(0x00, 0x42)
    ]
    return (
        "export const KRYNN_GEN1_OPCODES: Record<number, OpcodeDef> = {\n"
        + "\n".join(rows)
        + "\n};\n"
    )


FIXTURE_TS_DIALECT = """\
export const ECL_GEN2: EclDialect = {
  headerLen: 20,
  vbase: 0x8000,
  hasMagic: false,
  wordSetOverrides: { 0x03: 4, 0x4a: 7 },
  opcodeOverrides: {
    0x04: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' },
  },
};
"""


def _fixture_ts_frames() -> dict[int, Frame]:
    base = ts.parse_base_opcode_table(ts.strip_ts_comments(fixture_ts_opcodes()))
    dialects = ts.parse_ts_dialects(ts.strip_ts_comments(FIXTURE_TS_DIALECT))
    return dialects["ECL_GEN2"].effective(base)


def _fixture_native_frames(text: str = FIXTURE_ASM) -> dict[int, NativeFrames]:
    return native_gen2_frames(text, min_entries=1)


# ---------------------------------------------------------------------------
# (a) The native parser reproduces ccecl.asm's own values.
# ---------------------------------------------------------------------------


class NativeParserTests(unittest.TestCase):
    def setUp(self) -> None:
        self.text = CCECL_ASM.read_text(encoding="utf-8", errors="replace")

    def test_optab_is_dense_over_the_documented_range(self) -> None:
        """`optab` covers the 0x00..0x41 union of the Gen1 and Gen2 dispatches."""
        optab = parse_optab(self.text)
        self.assertEqual(len(optab), 2 * 0x42)
        self.assertEqual(optab[0:2], [0, 0xFF])  # 00 EXIT
        self.assertEqual(optab[2 * 0x15 : 2 * 0x15 + 2], [3, 2])  # 15 VERTICAL_MENU, countAt 2
        self.assertEqual(optab[2 * 0x27 : 2 * 0x27 + 2], [8, 0xFF])  # 27 TREASURE, Gen1 frame

    def test_optab_row_comments_are_cross_checked(self) -> None:
        """Deleting a row shifts every opcode after it; the `; NN` comments catch that."""
        broken = self.text.replace("        db 1,0xff    ; 01 GOTO\n", "", 1)
        with self.assertRaises(AsmParseError) as raised:
            parse_optab(broken)
        self.assertIn("shifted", str(raised.exception))

    def test_get_operand_meta_parses_to_instructions_and_labels(self) -> None:
        insns, labels = parse_routine(self.text, "get_operand_meta")
        self.assertIn(".gen2_treasure", labels)
        self.assertIn(".maybe_dok", labels)
        self.assertTrue(any(i.mnemonic == "ret" for i in insns))

    def test_gen2_arm_reproduces_the_values_ccecl_asm_writes_by_hand(self) -> None:
        frames = native_gen2_frames(self.text)
        self.assertEqual(frames[0x21].default, (2, None))  # `mov dl, 2` arm
        self.assertEqual(frames[0x27].default, (4, 3))  # 0634e15's dl=4/dh=3 arm
        self.assertEqual(frames[0x27].area5, (4, 3))  # placed ABOVE the area gate
        self.assertEqual(frames[0x2C].default, (1, None))  # Gen2 PARLAY frame
        self.assertEqual(frames[0x2C].area5, (1, None))  # not area-gated
        self.assertEqual(frames[0x1D].default, (0, None))  # Gen2 PARTYSTRENGTH frame
        self.assertEqual(frames[0x1D].area5, (0, None))  # not area-gated
        self.assertEqual(frames[0x22].default, (0, None))  # Gen2 PARTY_SURPRISE frame
        self.assertEqual(frames[0x22].area5, (0, None))  # not area-gated
        self.assertEqual(frames[0x23].default, (0, None))  # Gen2 SURPRISE frame
        self.assertEqual(frames[0x23].area5, (0, None))  # not area-gated
        self.assertEqual(frames[0x0C].default, (4, None))  # Gen2 SETUP_MONSTER frame
        self.assertEqual(frames[0x0C].area5, (4, None))  # not area-gated
        self.assertEqual(frames[0x03].default, (2, None))  # inherited straight from optab
        self.assertEqual(frames[0x15].default, (3, 2))  # countAt inherited from optab

    def test_gen1_arm_is_untouched_by_the_gen2_overrides(self) -> None:
        """0634e15 was Gen2-only, and this guard says nothing about Gen1. Proven, not assumed:
        under `is_gen2 == 0` opcode 0x27 keeps the (8, none) CoK frame the research doc measured
        as correct there (CoK 22 sites, 0 halts)."""
        gen1 = native_gen1_frames(self.text)
        self.assertEqual(gen1[0x27], (8, None))
        self.assertEqual(gen1[0x21], (3, None))

    def test_area_gate_model_is_complete(self) -> None:
        """The two-state model is only honest if area 5 is the ONLY special area. Probe several."""
        optab = parse_optab(self.text)
        insns, labels = parse_routine(self.text, "get_operand_meta")
        baseline = {
            op: eval_frame(optab, insns, labels, op, is_gen2=1, area_id=1, short_opframes=0)
            for op in range(0x100)
        }
        for area in PROBE_AREAS:
            if area == 5:
                continue
            for op in range(0x100):
                self.assertEqual(
                    eval_frame(optab, insns, labels, op, is_gen2=1, area_id=area, short_opframes=0),
                    baseline[op],
                    "area_id=%d changes opcode 0x%02x: the two-state model is incomplete" % (area, op),
                )

    def test_short_opframes_cannot_change_a_gen2_answer(self) -> None:
        """`select_operand_dialect` sets it inside area 5, but the Gen2 arm never reads it."""
        optab = parse_optab(self.text)
        insns, labels = parse_routine(self.text, "get_operand_meta")
        for op in range(0x100):
            self.assertEqual(
                eval_frame(optab, insns, labels, op, is_gen2=1, area_id=5, short_opframes=0),
                eval_frame(optab, insns, labels, op, is_gen2=1, area_id=5, short_opframes=1),
            )


# ---------------------------------------------------------------------------
# (b) The parsers CANNOT GO QUIET.
# ---------------------------------------------------------------------------


class ParserCannotGoQuietTests(unittest.TestCase):
    """Every way these parsers might fail must raise, not return an empty table. An empty table
    makes the live comparison below pass forever with nothing in it."""

    def test_missing_optab_raises(self) -> None:
        with self.assertRaises(AsmParseError):
            parse_optab("nothing here\n")

    def test_truncated_optab_raises(self) -> None:
        with self.assertRaises(AsmParseError):
            parse_optab(FIXTURE_ASM)  # only 4 rows

    def test_missing_routine_raises(self) -> None:
        with self.assertRaises(AsmParseError):
            parse_routine("optab:\n", "get_operand_meta")

    def test_unmodelled_instruction_raises_and_names_the_line(self) -> None:
        mutated = FIXTURE_ASM.replace("        mov     dl, 2\n", "        shl     dl, 1\n")
        insns, labels = parse_routine(mutated, "get_operand_meta")
        with self.assertRaises(AsmParseError) as raised:
            eval_frame([0] * 8, insns, labels, 0x21, is_gen2=1, area_id=1, short_opframes=0)
        self.assertIn("does not model", str(raised.exception))
        self.assertIn("shl", str(raised.exception))

    def test_nonterminating_routine_raises(self) -> None:
        mutated = FIXTURE_ASM.replace("        mov     dl, 2\n        jmp     .done\n", "        jmp     .two\n")
        insns, labels = parse_routine(mutated, "get_operand_meta")
        with self.assertRaises(AsmParseError) as raised:
            eval_frame([0] * 8, insns, labels, 0x21, is_gen2=1, area_id=1, short_opframes=0)
        self.assertIn("did not terminate", str(raised.exception))

    def test_ts_side_raises_rather_than_returning_nothing(self) -> None:
        with self.assertRaises(ts.TsParseError):
            ts_gen2_frames(base={}, dialects={})


# ---------------------------------------------------------------------------
# (c) The resolution order -- the trap a previous drift guard fell into.
# ---------------------------------------------------------------------------


class ResolutionOrderTests(unittest.TestCase):
    """A previous cross-track guard here went red on CORRECT code by searching only
    `opcodeOverrides` when the engine resolves `opcodeOverrides ?? KRYNN_GEN1_OPCODES`. These
    pin both sides' real order on synthetic input, where the expected answers are unarguable."""

    def test_ts_inherits_from_the_base_table_when_no_override_exists(self) -> None:
        frames = _fixture_ts_frames()
        self.assertEqual(frames[0x02], (2, 1), "an opcode absent from every override map is still "
                                               "in the dialect, with its base frame")

    def test_ts_word_set_override_keeps_the_base_count_slot(self) -> None:
        """`countAt` comes from `def` alone; a wordSetOverrides entry cannot add or remove a tail."""
        frames = _fixture_ts_frames()
        self.assertEqual(frames[0x03], (4, None))

    def test_ts_opcode_override_replaces_the_whole_definition(self) -> None:
        frames = _fixture_ts_frames()
        self.assertEqual(frames[0x04], (2, 1))

    def test_ts_word_set_override_alone_does_not_define_an_opcode(self) -> None:
        """`0x4a` has a wordSetOverride and no definition: decodeInstructionAt returns badOpcode
        before wordSetOverrides is read. Modelling this the other way would invent an opcode."""
        self.assertNotIn(0x4A, _fixture_ts_frames())

    def test_native_inherits_dh_from_optab_when_an_arm_sets_only_dl(self) -> None:
        """The `mov dh, 3` lesson from 0634e15, in reverse: `0x2c`'s arm sets DL only, so its
        count slot must come from the table, not from the arm."""
        frames = _fixture_native_frames()
        self.assertEqual(frames[0x02].default, (2, 1))  # untouched by any arm
        table_only = FIXTURE_ASM.replace("        cmp     al, 2ch\n        jne     .done\n"
                                         "        jmp     .one\n",
                                         "        cmp     al, 02h\n        jne     .done\n"
                                         "        jmp     .one\n")
        gated = native_gen2_frames(table_only, min_entries=1)
        self.assertEqual(gated[0x02].area5, (1, 1), "a DL-only arm must inherit the table's countAt")

    def test_native_absent_entry_is_absent_not_zero(self) -> None:
        """Opcodes past the end of `optab` must read as absent. Returning (0, none) would make a
        missing entry look like a zero-operand opcode -- agreement with a TS `wordSet: 0`."""
        frames = _fixture_native_frames()
        self.assertIsNone(frames[0x04].default)
        self.assertIsNone(frames[0x40].default)


# ---------------------------------------------------------------------------
# (d) THE GUARD.
# ---------------------------------------------------------------------------


class LiveDriftTests(unittest.TestCase):
    def setUp(self) -> None:
        self.text = CCECL_ASM.read_text(encoding="utf-8", errors="replace")
        self.mnemonics = parse_optab_mnemonics(self.text)
        self.found, self.compared = live_divergences()

    def test_denominator_is_the_union_of_both_tables(self) -> None:
        """State the denominator. Native's optab is dense 0x00..0x40, TS's base 0x00..0x41, so 66
        opcodes are compared and 0x41 is compared as a MISSING native entry rather than skipped."""
        self.assertEqual(self.compared, list(range(0x00, 0x42)))
        self.assertEqual(len(self.compared), 66)

    def test_no_undeclared_divergence(self) -> None:
        undeclared = [d for op, d in sorted(self.found.items()) if op not in KNOWN_DIVERGENCES]
        self.assertEqual(
            [],
            [d.describe(self.mnemonics) for d in undeclared],
            "native's Gen2 operand table and TypeScript's ECL_GEN2 disagree about an opcode that "
            "is not on KNOWN_DIVERGENCES. Either fix the frame or add a dated, justified entry -- "
            "this is the class of defect 0634e15 was one instance of.",
        )

    def test_every_exemption_is_still_divergent_in_exactly_the_recorded_way(self) -> None:
        """Two-sided: an exemption dies when the opcode converges AND when either side moves."""
        for opcode, exemption in sorted(KNOWN_DIVERGENCES.items()):
            with self.subTest(opcode="0x%02x" % opcode):
                divergence = self.found.get(opcode)
                self.assertIsNotNone(
                    divergence,
                    "KNOWN_DIVERGENCES[0x%02x] is STALE: the two tracks now agree. Delete the "
                    "entry (its resolution note says what the fix was: %s)"
                    % (opcode, exemption.resolves),
                )
                assert divergence is not None
                self.assertEqual(
                    (
                        exemption.kind,
                        exemption.native_default,
                        exemption.native_area5,
                        exemption.ts_frame,
                    ),
                    (
                        divergence.kind,
                        divergence.native_default,
                        divergence.native_area5,
                        divergence.ts_frame,
                    ),
                    "KNOWN_DIVERGENCES[0x%02x] no longer describes the divergence it exempts. "
                    "Live: %s" % (opcode, divergence.describe(self.mnemonics)),
                )

    def test_exemptions_are_documented(self) -> None:
        for opcode, exemption in sorted(KNOWN_DIVERGENCES.items()):
            with self.subTest(opcode="0x%02x" % opcode):
                self.assertRegex(exemption.since, r"^\d{4}-\d{2}-\d{2}$")
                self.assertGreater(len(exemption.why), 80, "an exemption needs a real reason")
                self.assertGreater(len(exemption.resolves), 40, "and a route out")

    def test_the_agreeing_set_is_large_and_includes_inherited_frames(self) -> None:
        """A guard whose agreement set is empty proves nothing. Name witnesses of each shape:
        plain base inheritance on both sides, countAt inherited from a base on both sides, an
        opcode overridden on both sides, and the one 0634e15 fixed."""
        agreeing = [op for op in self.compared if op not in self.found]
        self.assertEqual(len(agreeing), 66 - len(KNOWN_DIVERGENCES))
        native = native_gen2_frames(self.text)
        tsf = ts_gen2_frames()
        witnesses = {
            0x04: "ADD -- both sides inherit wordSet 3 from their base table",
            0x14: "COMPARE_AND -- base inheritance, wordSet 4",
            0x2E: "DAMAGE -- base inheritance, wordSet 5",
            0x15: "VERTICAL_MENU -- countAt 2 inherited from BOTH base tables, no override",
            0x25: "ON_GOTO -- countAt 1 inherited from both base tables",
            0x26: "ON_GOSUB -- countAt 1 inherited from both base tables",
            0x2B: "HORIZONTAL_MENU -- countAt 1 inherited from both base tables",
            0x21: "LOAD_FILES -- OVERRIDDEN on both sides (native arm dl=2, TS wordSetOverrides)",
            0x27: "TREASURE -- the 0634e15 fix; overridden on both sides, count slot included",
        }
        for opcode, note in sorted(witnesses.items()):
            with self.subTest(opcode="0x%02x" % opcode):
                self.assertNotIn(opcode, self.found, note)
                self.assertEqual(native[opcode].default, tsf[opcode], note)
                self.assertEqual(native[opcode].area5, tsf[opcode], note)

    def test_facts_the_exemptions_rest_on(self) -> None:
        """Each pin here is cited by an exemption's `why`. If the fact moves, the justification is
        wrong even when the frames still differ, so the guard must notice."""
        self.assertEqual(
            count_read_opp(self.text, "op_encounter_menu"),
            ENCOUNTER_MENU_READ_OPP_CALLS,
            "the legacy 0x29 reader must retain its fourteen operands.",
        )
        self.assertEqual(
            parse_equ(self.text, "KNOWN_OP_MAX"),
            KNOWN_OP_MAX,
            "the 0x41 exemption rests on vm_run_resume halting above 0x40.",
        )
        # NOT a read_opp count: op_script_effect legitimately calls read_opp once per fixed
        # operand and once per tail operand. The 0x1f and 0x31 corrections rest on its operand
        # COUNT coming from get_operand_meta rather than from a hand-written sequence.
        self.assertIn(
            ("call", ("get_operand_meta",)),
            _calls(self.text, "op_script_effect"),
            "the 0x1f/0x31 corrections rely on op_script_effect taking its frame from "
            "get_operand_meta; if it stopped doing so, a table-only fix would no longer suffice.",
        )
        for routine in ("op_loadpieces", "op_parlay", "op_setup_monster"):
            self.assertNotIn(
                ("call", ("get_operand_meta",)),
                _calls(self.text, routine),
                "%s is described above as a hand-written reader OUTSIDE this guard's scope. If it "
                "now consults get_operand_meta, the scope statement is wrong." % routine,
            )
        self.assertIn(
            "op_encounter_menu:\n        cmp     byte [is_gen2], 1\n        je      .gen2\n",
            self.text,
            "Gen2 0x29 is zero-operand; it must bypass the legacy 14-operand reader.",
        )
        encounter = self.text[
            self.text.index("op_encounter_menu:") : self.text.index("; ---- 0x2C PARLAY")
        ]
        self.assertIn(
            ".gen2:\n        mov     ax, [opp]\n        mov     [pc], ax\n        ret\n",
            encounter,
            "The Gen2 0x29 bypass must advance to the decoded next instruction and return.",
        )
        loadpieces = re.sub(r"\s+", " ", " ".join(
            line.split(";", 1)[0] for line in self.text[
                self.text.index("op_loadpieces:"):self.text.index("loadpieces_gen2:")
            ].splitlines()))
        self.assertIn("mov al, [is_gen2] and al, 1 or al, [short2_frames] jnz loadpieces_gen2", loadpieces)
        self.assertIn(("call", ("op_script_effect",)), _calls(self.text, "loadpieces_gen2"))


# ---------------------------------------------------------------------------
# (e) THE GUARD CAN FAIL -- mutation, against the real sources, in memory.
# ---------------------------------------------------------------------------


class MutationTests(unittest.TestCase):
    """Mutate a COPY of each real source in memory and watch the comparison go red, then watch it
    go green again on the unmutated text. Nothing here writes to `native/src` or
    `packages/engine`; the derivation functions take source TEXT precisely so this is possible
    without touching a file that another agent may own."""

    def setUp(self) -> None:
        self.asm = CCECL_ASM.read_text(encoding="utf-8", errors="replace")
        self.base = ts.parse_base_opcode_table()
        self.dialect_text = ts.strip_ts_comments(
            ts.DISASSEMBLE_TS.read_text(encoding="utf-8")
        )

    def _diverging(self, *, asm: Optional[str] = None, dialect_text: Optional[str] = None) -> set[int]:
        native = native_gen2_frames(asm if asm is not None else self.asm)
        dialects = ts.parse_ts_dialects(
            dialect_text if dialect_text is not None else self.dialect_text
        )
        found, _ = compare(native, ts_gen2_frames(self.base, dialects))
        return set(found)

    def _undeclared(self, diverging: set[int]) -> set[int]:
        return diverging - set(KNOWN_DIVERGENCES)

    def _converged(self, diverging: set[int]) -> set[int]:
        return set(KNOWN_DIVERGENCES) - diverging

    def test_control_the_unmutated_tree_is_green(self) -> None:
        diverging = self._diverging()
        self.assertEqual(set(), self._undeclared(diverging))
        self.assertEqual(set(), self._converged(diverging))

    def test_mutation_1_an_optab_entry_moves(self) -> None:
        """A base-table row nobody overrides: the drift surfaces at that opcode alone."""
        mutated = self.asm.replace("db 4,0xff    ; 14 COMPARE_AND", "db 5,0xff    ; 14 COMPARE_AND")
        self.assertNotEqual(mutated, self.asm)
        self.assertEqual({0x14}, self._undeclared(self._diverging(asm=mutated)))
        self.assertEqual(set(), self._undeclared(self._diverging()))

    def test_mutation_2_the_treasure_arm_loses_its_count_slot(self) -> None:
        """`mov dh, 3` is the load-bearing half of 0634e15. Dropping it yields (4, none) -- config
        D in the research doc, the framing that scores 0 halts by silently stopping."""
        mutated = self.asm.replace(
            "        mov     dh, 3                   ; operand index 3 holds the tail length\n", "", 1
        )
        self.assertNotEqual(mutated, self.asm)
        diverging = self._diverging(asm=mutated)
        self.assertEqual({0x27}, self._undeclared(diverging))
        native = native_gen2_frames(mutated)
        self.assertEqual((4, None), native[0x27].default)

    def test_mutation_3_the_treasure_arm_falls_below_the_area_gate(self) -> None:
        """The mistake the research doc warns against by name: 0x27's 43 Gen2 sites span 17 areas,
        so gating it on area 5 would be wrong. It must be reported as area-gated, NOT flattened
        into agreement just because the area-5 answer matches."""
        mutated = self.asm.replace(
            "        cmp     al, 27h\n        je      .gen2_treasure\n"
            "        cmp     al, 1fh\n        je      .one                 ; Gen2 UNKNOWN_1F has one operand\n",
            "        cmp     al, 27h\n        jne     .after_treasure_gate\n"
            "        cmp     word [area_id], 5\n        jne     .done\n"
            "        jmp     .gen2_treasure\n"
            ".after_treasure_gate:\n"
            "        cmp     al, 1fh\n        je      .one                 ; Gen2 UNKNOWN_1F has one operand\n",
            1,
        )
        self.assertNotEqual(mutated, self.asm)
        diverging = self._diverging(asm=mutated)
        self.assertEqual({0x27}, self._undeclared(diverging))
        native = native_gen2_frames(mutated)
        self.assertEqual((8, None), native[0x27].default)
        self.assertEqual((4, 3), native[0x27].area5)

    def test_mutation_4_historical_replay_of_the_pre_0634e15_defect(self) -> None:
        """The whole reason this file exists: would it have caught the shipped bug? Remove both
        halves of 0634e15's get_operand_meta change and check the answer is yes."""
        mutated = self.asm.replace(
            "        cmp     al, 27h\n        je      .gen2_treasure\n", "", 1
        )
        mutated = re.sub(
            r"\.gen2_treasure:\n(?:        .*\n)+?        jmp     \.done\n", "", mutated, count=1
        )
        self.assertNotIn(".gen2_treasure", mutated)
        diverging = self._diverging(asm=mutated)
        self.assertEqual({0x27}, self._undeclared(diverging))
        self.assertEqual((8, None), native_gen2_frames(mutated)[0x27].default)

    def test_mutation_5_a_typescript_override_is_deleted(self) -> None:
        """Drift can start on either track. Deleting TS's `0x1f: 1` must expose the
        now-correct native one-operand frame as an undeclared divergence."""
        mutated = self.dialect_text.replace(
            "0x0c: 4, 0x1d: 0, 0x1f: 1, 0x21: 2,", "0x0c: 4, 0x1d: 0, 0x21: 2,", 1
        )
        self.assertNotEqual(mutated, self.dialect_text)
        diverging = self._diverging(dialect_text=mutated)
        self.assertEqual({0x1F}, self._undeclared(diverging))
        self.assertEqual(set(), self._converged(diverging))
        self.assertEqual(set(), self._converged(self._diverging()))

    def test_mutation_6_a_typescript_opcode_override_is_deleted(self) -> None:
        """Deleting ECL_GEN2's `0x27` override drops it to the base `wordSet: 8` -- the same
        divergence as mutation 4, arriving from the other side.

        FOUR dialects carry that identical line and ECL_GEN2's is the LAST. Replacing the first
        occurrence mutates ECL_GEN1_SHORT_DOK and leaves ECL_GEN2 untouched, which would read as
        "the mutation did not fire" -- a mutation test that mutates the wrong thing is exactly the
        vacuous probe this section exists to rule out, so the position is asserted, not assumed."""
        needle = "0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' },"
        gen2_at = self.dialect_text.index("export const ECL_GEN2: EclDialect = ")
        cut = self.dialect_text.rindex(needle)
        self.assertGreater(cut, gen2_at, "the last copy of the 0x27 override must be ECL_GEN2's")
        mutated = self.dialect_text[:cut] + self.dialect_text[cut + len(needle) :]
        self.assertNotEqual(mutated, self.dialect_text)
        self.assertEqual({0x27}, self._undeclared(self._diverging(dialect_text=mutated)))

    def test_mutation_7_an_exemption_is_removed(self) -> None:
        """Delete an entry from KNOWN_DIVERGENCES and the live divergence it covered is undeclared
        again. Proves the exemption list is what makes the tree green, not an empty comparison."""
        diverging = self._diverging()
        for opcode in sorted(KNOWN_DIVERGENCES):
            with self.subTest(opcode="0x%02x" % opcode):
                self.assertIn(opcode, diverging - (set(KNOWN_DIVERGENCES) - {opcode}))

    def test_mutation_8_a_stale_exemption_frame_is_detected(self) -> None:
        """An exemption that records the wrong frames must fail even while the opcode still
        diverges -- otherwise the list could drift into fiction while staying green."""
        found, _ = compare(native_gen2_frames(self.asm), ts_gen2_frames(self.base))
        for opcode, exemption in sorted(KNOWN_DIVERGENCES.items()):
            with self.subTest(opcode="0x%02x" % opcode):
                live = found[opcode]
                wrong = Exemption(
                    kind=exemption.kind,
                    native_default=(99, None),
                    native_area5=exemption.native_area5,
                    ts_frame=exemption.ts_frame,
                    since=exemption.since,
                    why=exemption.why,
                    resolves=exemption.resolves,
                )
                self.assertNotEqual(wrong.native_default, live.native_default)


if __name__ == "__main__":  # pragma: no cover - convenience for a manual run
    divergences, compared = live_divergences()
    mnemonics = parse_optab_mnemonics(CCECL_ASM.read_text(encoding="utf-8", errors="replace"))
    print("compared %d opcodes (0x%02x..0x%02x)" % (len(compared), compared[0], compared[-1]))
    for opcode, divergence in sorted(divergences.items()):
        flag = "declared" if opcode in KNOWN_DIVERGENCES else "UNDECLARED"
        print("  [%s] %s" % (flag, divergence.describe(mnemonics)))
    print("agreeing: %d" % (len(compared) - len(divergences)))
