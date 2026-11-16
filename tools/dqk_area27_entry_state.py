#!/usr/bin/env python3
"""DQK area-27 entry state (round-10 task T9): can a natural route reach it from the retail save?

Static only (no DOSBox).  Inputs are the retail ``DISK3/ECL.GLB`` (Gen2 ECL, 47 areas), the
retail ``SAVGAMA.QSV`` and nothing else.  The target is the area-27 Hulderfolk ``ADD_NPC #115``
at member 15 vaddr ``0x86F0`` (docs/engine/research/dqk-area27-86de-decode.md).

The tool answers four separable questions and keeps them separate, because they have different
strengths of evidence:

1. ``qsv_facts``      what the shipped save carries (header, roster walk, tail).  It carries NO
                      decoded ECL-memory block: see the doc for what that does and does not prove.
2. ``census_writers`` every reachable instruction that names one of the four cells
                      ``0x002D, 0x009F, 0x00BB, 0x00A2``, split into writers / readers / aliasing
                      risks.  Reachability is the boundary walk used by the other DQK scanners.
3. ``area_graph``     literal-NEWECL reachability between the 47 areas, and the dynamic NEWECL
                      sites that stop the chain.
4. ``explore``        a path-sensitive abstract interpreter (constants plus tagged symbols for host
                      and player inputs) that follows NEWECL chains and answers, per goal, which
                      constraints a path to the goal needs and which of them the fresh save meets.

The interpreter is an over-approximation of what is reachable (an unknown value branches both
ways) and says so: every reported route carries the list of guards it could not decide.
"""

from __future__ import annotations

import argparse
import struct
from dataclasses import dataclass
from pathlib import Path

from dqk_ca03_stream_decode import read_opp
from dqk_ecl_combat_scan import (
    collect_boundaries,
    decode_one,
    header_entries,
    in_code,
    parse_id_table,
    read_hlib_data_archive,
    target_offset,
)

REPO = Path(__file__).resolve().parents[1]
DQK = REPO / "The Dark Queen of Krynn"
ECL_GLB = DQK / "DISK3" / "ECL.GLB"
QSV_PATH = DQK / "SAVGAMA.QSV"

CELLS = (0x002D, 0x009F, 0x00BB, 0x00A2)
TARGET_AREA = 27
TARGET_VADDR = 0x86F0  # ADD_NPC #115,#100 (TASSLEHOFF)
HOST_CELLS = frozenset({0x002D, 0x0111, 0x0112})  # recomputed by the host on every invocation

# --- operand roles -------------------------------------------------------------------------
# Destination operand indices for ops that write a memory cell.  CHECKPARTY is listed only so the
# census can say "0 reachable sites"; its retail result framing is unresolved (see the doc).
WRITE_POS: dict[int, tuple[int, ...]] = {
    0x04: (2,), 0x05: (2,), 0x06: (2,), 0x07: (2,), 0x2F: (2,), 0x30: (2,),
    0x08: (1,), 0x09: (1,), 0x0F: (1,), 0x10: (1,), 0x2A: (2,), 0x37: (1,),
    0x15: (0,), 0x2B: (0,), 0x31: (0,), 0x2C: (0,), 0x3B: (1, 2), 0x1E: (2, 3, 4, 5),
}
# Ops whose cell operands are pure reads (verified against the census: these are the only
# non-writer ops that name the four cells).
READ_ONLY_OPS = frozenset({0x03, 0x11, 0x14, 0x25, 0x26, 0x0B})


@dataclass(frozen=True)
class Frame:
    kind: str  # 'imm' | 'cell' | 'memstr' | 'str' | 'other'
    value: int | None


def frame_kind(text: str) -> str:
    if text.startswith("#"):
        return "imm"
    if text.startswith("0x"):
        return "cell"
    if text.startswith("memstr"):
        return "memstr"
    if text.startswith("str["):
        return "str"
    return "other"


def operand_frames(block: bytes, ins) -> list[Frame]:
    pos = ins.offset + 1
    out: list[Frame] = []
    for _ in range(len(ins.args)):
        text, pos, value = read_opp(block, pos)
        out.append(Frame(frame_kind(text), value))
    return out


# --- loading ----------------------------------------------------------------------------------

def load_ecl(path: Path = ECL_GLB):
    arch = read_hlib_data_archive(path)
    a2m = parse_id_table(arch.members[0])
    return arch.members, a2m


def reachable(block: bytes):
    seen, _ = collect_boundaries(block, header_entries(block), 10**6)
    return seen


# --- 1. the save ------------------------------------------------------------------------------

QSV_ROSTER = 1039
QSV_FIXED = 0x1A1


def qsv_facts(data: bytes) -> dict:
    party = data[31]
    off = QSV_ROSTER
    spans = []
    for _ in range(party):
        items = data[off + 8]
        if items != data[off + 0xC9]:
            raise ValueError("item-count mirror mismatch")
        pos = off + QSV_FIXED + 17 * items
        nodes = 0
        while data[pos + 2:pos + 6] != b"\0\0\0\0":
            pos += 9
            nodes += 1
        pos += 6
        spans.append((off, pos - off, items, nodes))
        off = pos
    header_nonzero = [i for i in range(QSV_ROSTER) if data[i]]
    return {
        "size": len(data),
        "party_size": party,
        "area_byte_18": data[18],
        "ecl_member_byte_21": data[21],
        "header_nonzero_offsets": header_nonzero,
        "roster_spans": spans,
        "roster_end": off,
        "tail_len": len(data) - off,
        # The only mapping hypothesis the repo has for header bytes vs ECL cells is identity;
        # report what it would say for the four cells (all in the 0..1038 header).
        "identity_cell_values": {c: data[c] for c in CELLS},
        # Records carry the retail NPC flag at +0x9B (bit 7).  LOAD_PIECES at 0x86DE matches only
        # records with this bit set.
        "npc_flag_bit7_per_record": [bool(data[o + 0x9B] & 0x80) for o, *_ in spans],
        "record_names": [data[o + 0x68:o + 0x78].split(b"\0")[0].decode("ascii", "replace")
                         for o, *_ in spans],
    }


# --- 2. writer census ------------------------------------------------------------------------

def census_writers(members, a2m):
    m2a = {m: a for a, m in a2m.items()}
    rows = []
    for mi in range(1, len(members)):
        block = members[mi]
        for off, ins in sorted(reachable(block).items()):
            frames = operand_frames(block, ins)
            for k, fr in enumerate(frames):
                if fr.kind != "cell" or fr.value not in CELLS:
                    continue
                if k in WRITE_POS.get(ins.opcode, ()):
                    role = "write"
                elif ins.opcode in READ_ONLY_OPS or ins.opcode in WRITE_POS or ins.opcode in (
                        0x01, 0x02):
                    role = "read"
                else:
                    role = "unmodelled"
                src = None
                if role == "write" and ins.opcode == 0x09:
                    src = frames[0]
                rows.append({
                    "area": m2a.get(mi), "member": mi, "vaddr": ins.vaddr, "mnemonic": ins.mnemonic,
                    "operand": k, "cell": fr.value, "role": role,
                    "src": None if src is None else (src.kind, src.value),
                    "text": ins.text,
                })
    return rows


def alias_risks(members, a2m):
    """Reachable SAVE_TABLE / CALL sites that could write one of the four cells indirectly."""
    m2a = {m: a for a, m in a2m.items()}
    out = {"save_table": [], "call_non_event": [], "checkparty": 0}
    for mi in range(1, len(members)):
        block = members[mi]
        for off, ins in sorted(reachable(block).items()):
            if ins.opcode == 0x35:
                fr = operand_frames(block, ins)
                base = fr[1].value
                for c in CELLS:
                    if base is None or (base <= c < base + 0x100):
                        out["save_table"].append((m2a.get(mi), ins.vaddr, base, c))
            elif ins.opcode == 0x2D and ins.args and ins.args[0] not in (1, 2):
                out["call_non_event"].append((m2a.get(mi), ins.vaddr, ins.args[0]))
            elif ins.opcode == 0x1E:
                out["checkparty"] += 1
    return out


def writer_summary(rows):
    """Per cell: counts of writer sites and the set of immediate values SAVE'd to it."""
    out = {}
    for c in CELLS:
        w = [r for r in rows if r["cell"] == c and r["role"] == "write"]
        consts = sorted({r["src"][1] for r in w if r["src"] and r["src"][0] == "imm"})
        out[c] = {
            "writers": len(w),
            "by_mnemonic": {m: sum(1 for r in w if r["mnemonic"] == m)
                            for m in sorted({r["mnemonic"] for r in w})},
            "save_immediates": consts,
            "areas": sorted({r["area"] for r in w}),
            "unmodelled": sum(1 for r in rows if r["cell"] == c and r["role"] == "unmodelled"),
        }
    return out


# --- 3. area graph ---------------------------------------------------------------------------

def area_graph(members, a2m):
    m2a = {m: a for a, m in a2m.items()}
    edges: dict[int, dict[int, list[int]]] = {}
    dynamic: list[tuple[int, int, str]] = []
    for mi in range(1, len(members)):
        block = members[mi]
        for off, ins in sorted(reachable(block).items()):
            if ins.opcode != 0x20:
                continue
            if block[off + 1] == 0 and ins.args and ins.args[0] in a2m:
                edges.setdefault(m2a[mi], {}).setdefault(ins.args[0], []).append(ins.vaddr)
            else:
                dynamic.append((m2a[mi], ins.vaddr, ins.text))
    return edges, dynamic


def shortest_chain(edges, start: int, goal: int):
    prev = {start: None}
    queue = [start]
    for x in queue:
        for y in sorted(edges.get(x, {})):
            if y not in prev:
                prev[y] = x
                queue.append(y)
    if goal not in prev:
        return None
    chain = [goal]
    while prev[chain[-1]] is not None:
        chain.append(prev[chain[-1]])
    return chain[::-1]


def reach_set(edges, start: int) -> set[int]:
    seen = {start}
    stack = [start]
    while stack:
        x = stack.pop()
        for y in edges.get(x, {}):
            if y not in seen:
                seen.add(y)
                stack.append(y)
    return seen


# --- 4. abstract interpreter -----------------------------------------------------------------
# Values: int (known), tuple (symbolic expression), None (opaque).
#   ('init', cell)   cell content at the start of the first invocation (fresh save: see ZERO_INIT)
#   ('host', cell, n) host-supplied cell value for invocation n
#   ('free', vaddr)  player answer (menu / numeric prompt)
#   ('rand', vaddr)  RANDOM result
#   ('look', vaddr)  LOAD_PIECES party-name lookup result
#   ('and'|'or'|'add'|'sub', a, b) with ints folded; 'sub' is b - a (ECL SUBTRACT order)

IF_OPS = {0x16: "EQ", 0x17: "NE", 0x18: "LT", 0x19: "GT", 0x1A: "LE", 0x1B: "GE"}
NEG = {"EQ": "NE", "NE": "EQ", "LT": "GE", "GE": "LT", "GT": "LE", "LE": "GT"}
MAX_EXPR_DEPTH = 2
TRACK_ARITH = frozenset(CELLS) | {0x009B, 0x0097}


def s16(v: int) -> int:
    v &= 0xFFFF
    return v - 0x10000 if v & 0x8000 else v


def fold(op: str, a, b):
    if a is None or b is None:
        return None
    if isinstance(a, int) and isinstance(b, int):
        if op == "and":
            return a & b
        if op == "or":
            return a | b
        if op == "add":
            return (a + b) & 0xFFFF
        if op == "sub":
            return (b - a) & 0xFFFF
    out = (op, a, b)
    return out if depth(out) <= MAX_EXPR_DEPTH else None


def depth(v) -> int:
    if not isinstance(v, tuple) or v[0] in ("init", "host", "free", "rand", "look"):
        return 0
    return 1 + max(depth(v[1]), depth(v[2]))


def guard_kinds(v) -> frozenset:
    if v is None:
        return frozenset({"unknown"})
    if isinstance(v, int):
        return frozenset()
    tag = v[0]
    if tag == "host":
        return frozenset({f"host:0x{v[1]:04X}"})
    if tag in ("free", "rand", "look", "init"):
        return frozenset({tag})
    return guard_kinds(v[1]) | guard_kinds(v[2])


def cmp_int(op: str, l: int, r: int) -> bool:
    ls, rs = s16(l), s16(r)
    return {"EQ": ls == rs, "NE": ls != rs, "LT": ls < rs, "GT": ls > rs,
            "LE": ls <= rs, "GE": ls >= rs}[op]


def show(v) -> str:
    if isinstance(v, int):
        return f"{v}"
    if v is None:
        return "?"
    tag = v[0]
    if tag == "init":
        return f"init[0x{v[1]:04X}]"
    if tag == "host":
        return f"host[0x{v[1]:04X}]"
    if tag in ("free", "rand", "look"):
        return f"{tag}@{v[1]:04X}"
    return f"({show(v[1])} {tag} {show(v[2])})"


@dataclass(frozen=True)
class Constraint:
    op: str
    lhs: object
    rhs: object

    def text(self) -> str:
        return f"{show(self.lhs)} {self.op} {show(self.rhs)}"


def consistent(cons: frozenset, new: Constraint) -> bool:
    """Interval/disequality feasibility of the constraints on one expression (signed 16-bit).

    Only constraints whose right side is an integer are used; anything else is accepted (the
    check may say "feasible" for an infeasible set, never the reverse).
    """
    lo, hi, ne = -0x8000, 0x7FFF, set()
    for c in list(cons) + [new]:
        if c.lhs != new.lhs or not isinstance(c.rhs, int):
            continue
        r = s16(c.rhs)
        if c.op == "EQ":
            lo, hi = max(lo, r), min(hi, r)
        elif c.op == "NE":
            ne.add(r)
        elif c.op == "LT":
            hi = min(hi, r - 1)
        elif c.op == "LE":
            hi = min(hi, r)
        elif c.op == "GT":
            lo = max(lo, r + 1)
        elif c.op == "GE":
            lo = max(lo, r)
    if lo > hi:
        return False
    return not (hi - lo < len(ne) and all(v in ne for v in range(lo, hi + 1)))


@dataclass(frozen=True)
class St:
    member: int
    pc: int
    stack: tuple
    mem: tuple  # sorted ((cell, value), ...)
    cmp: object  # None | (lhs, rhs)
    cons: frozenset
    opaque: frozenset  # (vaddr) of guards decided by an opaque value
    chain: tuple  # areas visited in this invocation, in order
    inv: int
    slot: int


@dataclass
class Route:
    goal: tuple
    constraints: tuple
    opaque_guards: tuple
    chain: tuple
    inv: int
    mem: tuple


class Explorer:
    def __init__(self, members, a2m, *, zero_init: bool = True, state_cap: int = 400_000,
                 allowed_areas=None):
        self.members = members
        self.a2m = a2m
        self.m2a = {m: a for a, m in a2m.items()}
        self.zero_init = zero_init
        self.allowed = None if allowed_areas is None else frozenset(allowed_areas)
        self.state_cap = state_cap
        self.capped = False
        self.decoded: dict[int, dict] = {}

    def code(self, mi: int) -> dict:
        if mi not in self.decoded:
            self.decoded[mi] = {}
        return self.decoded[mi]

    def ins_at(self, mi: int, off: int):
        cache = self.code(mi)
        if off not in cache:
            cache[off] = decode_one(self.members[mi], off)
        return cache[off]

    # memory ------------------------------------------------------------------------------
    def initial(self, cell: int, inv: int):
        if cell in HOST_CELLS:
            return ("host", cell, inv)
        return 0 if self.zero_init else ("init", cell)

    def read(self, mem: dict, cell: int, inv: int):
        return mem[cell] if cell in mem else self.initial(cell, inv)

    def val(self, fr: Frame, mem: dict, inv: int):
        if fr.kind == "imm":
            return fr.value
        if fr.kind == "cell":
            return self.read(mem, fr.value, inv)
        return None

    def invocation(self, mi: int, slot: int, mem: dict, inv: int, goals: set, *,
                   seed_cons: frozenset = frozenset(), max_chain: int = 8):
        """Explore one host invocation starting at area-member ``mi`` entry ``slot``."""
        routes: list[Route] = []
        finals: list[tuple] = []  # (member, mem tuple, constraints, opaque, chain)
        final_keys: set = set()
        entry = header_entries(self.members[mi])[slot]
        if not in_code(self.members[mi], entry):
            return routes, finals
        start = St(mi, entry, (), tuple(sorted(mem.items(), key=lambda kv: kv[0])), None,
                   seed_cons, frozenset(), (self.m2a[mi],), inv, slot)
        seen: dict = {}
        work: list = []
        self.push(start, seen, work)
        steps = 0
        while work:
            steps += 1
            if steps > self.state_cap:
                self.capped = True
                break
            st = work.pop()
            self.step(st, seen, work, routes, finals, goals, max_chain)
        # Only the memory at the end of a chain matters to the next invocation (the host
        # recomputes its own cells), so keep one final per (member, memory).
        finals = list({(f[0], f[1]): f for f in finals}.values())
        return routes, finals

    def join_mem(self, a: tuple, b: tuple, inv: int) -> tuple:
        da, db = dict(a), dict(b)
        out = {}
        for c in da.keys() | db.keys():
            va = da[c] if c in da else self.initial(c, inv)
            vb = db[c] if c in db else self.initial(c, inv)
            out[c] = va if va == vb else None
        return tuple(sorted(out.items()))

    def push(self, new: St, seen: dict, work: list) -> None:
        key = (new.member, new.pc, new.stack, new.cons, new.inv, new.slot)
        old = seen.get(key)
        if old is None:
            seen[key] = (new.mem, new.cmp, new.opaque, new.chain)
            work.append(new)
            return
        mem = self.join_mem(old[0], new.mem, new.inv)
        cmp = old[1] if old[1] == new.cmp else None
        opaque = old[2] | new.opaque
        if mem != old[0] or cmp != old[1] or opaque != old[2]:
            seen[key] = (mem, cmp, opaque, old[3])
            work.append(St(new.member, new.pc, new.stack, mem, cmp, new.cons, opaque,
                           old[3], new.inv, new.slot))

    def step(self, st: St, seen, work, routes, finals, goals, max_chain):
        block = self.members[st.member]
        ins = self.ins_at(st.member, st.pc)
        if ins is None:
            return
        gkey = (self.m2a[st.member], ins.vaddr)
        if gkey in goals:
            routes.append(Route(gkey, tuple(sorted(c.text() for c in st.cons)),
                                tuple(sorted(st.opaque)), st.chain, st.inv, st.mem))
        mem = dict(st.mem)
        op = ins.opcode
        nxt = st.pc + ins.size
        frames = operand_frames(block, ins)

        def push(new: St):
            self.push(new, seen, work)

        def adv(pc=None, mem_=None, stack=None, cmp="keep", cons=None, opaque=None):
            push(St(st.member, nxt if pc is None else pc, st.stack if stack is None else stack,
                    st.mem if mem_ is None else tuple(sorted(mem_.items())),
                    st.cmp if cmp == "keep" else cmp,
                    st.cons if cons is None else cons,
                    st.opaque if opaque is None else opaque, st.chain, st.inv, st.slot))

        def write(cell_fr: Frame, value, m):
            if cell_fr.kind != "cell":
                return
            m[cell_fr.value] = value

        if op == 0x00:
            finals.append((st.member, st.mem, st.cons, st.opaque, st.chain))
            return
        if op == 0x13:
            if st.stack:
                adv(pc=st.stack[-1], stack=st.stack[:-1])
            else:
                finals.append((st.member, st.mem, st.cons, st.opaque, st.chain))
            return
        if op == 0x20:
            imm = block[ins.offset + 1] == 0
            target = ins.args[0] if ins.args else None
            tm = self.a2m.get(target) if imm and target is not None else None
            if tm is None or len(st.chain) >= max_chain or (
                    self.allowed is not None and target not in self.allowed):
                finals.append((st.member, st.mem, st.cons, st.opaque | {(ins.vaddr, 'dynamic-newecl')}, st.chain))
                return
            entries = header_entries(self.members[tm])
            slot_entry = entries[st.slot] if st.slot < len(entries) else None
            if slot_entry is None or not in_code(self.members[tm], slot_entry):
                finals.append((tm, st.mem, st.cons, st.opaque, st.chain))
                return
            push(St(tm, slot_entry, (), st.mem, None, st.cons, st.opaque,
                    st.chain + (target,), st.inv, st.slot))
            return
        if op == 0x01:
            t = target_offset(ins.args[0] if ins.args else None)
            adv(pc=t if in_code(block, t) else nxt)
            return
        if op == 0x02:
            t = target_offset(ins.args[0] if ins.args else None)
            if not in_code(block, t):
                adv()
            elif len(st.stack) < 32:
                adv(pc=t, stack=st.stack + (nxt,))
            return
        if op in (0x25, 0x26):
            count = ins.args[1] if len(ins.args) > 1 and ins.args[1] else 0
            sel = self.val(frames[0], mem, st.inv)
            targets = [target_offset(a) for a in ins.args[2:2 + count]]
            for i, t in enumerate(targets):
                if not in_code(block, t):
                    continue
                cons, opq, ok = self.refine(st, "EQ", sel, i, ins.vaddr)
                if not ok:
                    continue
                kw = dict(pc=t, cons=cons, opaque=opq)
                if op == 0x26:
                    if len(st.stack) >= 32:
                        continue
                    kw["stack"] = st.stack + (nxt,)
                adv(**kw)
            # out of range falls through
            cons, opq, ok = self.refine(st, "GE", sel, count, ins.vaddr)
            if ok:
                adv(cons=cons, opaque=opq)
            return
        if op == 0x03:
            adv(cmp=(self.val(frames[0], mem, st.inv), self.val(frames[1], mem, st.inv)))
            return
        if op in IF_OPS:
            guarded = self.ins_at(st.member, nxt)
            lhs, rhs = st.cmp if st.cmp is not None else (None, None)
            for taken in (True, False):
                name = IF_OPS[op] if taken else NEG[IF_OPS[op]]
                cons, opq, ok = self.refine(st, name, lhs, rhs, ins.vaddr)
                if not ok:
                    continue
                if taken:
                    adv(pc=nxt, cons=cons, opaque=opq)
                elif guarded is not None:
                    adv(pc=nxt + guarded.size, cons=cons, opaque=opq)
            return
        m = dict(mem)
        cmp_next: object = "keep"
        if op in (0x04, 0x05, 0x06, 0x07, 0x2F, 0x30):
            a = self.val(frames[0], mem, st.inv)
            b = self.val(frames[1], mem, st.inv)
            name = {0x04: "add", 0x05: "sub", 0x2F: "and", 0x30: "or"}.get(op)
            dest = frames[2]
            if name is None:
                v = None  # DIVIDE / MULTIPLY are not modelled symbolically
                if isinstance(a, int) and isinstance(b, int):
                    v = ((b // a) if (op == 0x06 and a) else 0 if op == 0x06 else (a * b)) & 0xFFFF
            else:
                v = fold(name, a, b)
                if v is not None and not isinstance(v, int) and dest.value not in TRACK_ARITH:
                    v = None
            write(dest, v, m)
            if op in (0x2F, 0x30):
                cmp_next = (v, 0)
        elif op == 0x09:
            write(frames[1], self.val(frames[0], mem, st.inv), m)
        elif op == 0x08:
            write(frames[1], ("rand", ins.vaddr), m)
        elif op in (0x0F, 0x10):
            write(frames[1], ("free", ins.vaddr), m)
            cmp_next = None
        elif op in (0x15, 0x2B, 0x31, 0x2C):
            write(frames[0], ("free", ins.vaddr), m)
            cmp_next = None
        elif op == 0x2A:
            write(frames[2], None, m)
        elif op == 0x37:
            write(frames[1], ("look", ins.vaddr), m)
        elif op == 0x3B:
            for fr in frames[1:]:
                write(fr, None, m)
            cmp_next = None
        elif op == 0x1E:
            for fr in frames[2:]:
                write(fr, None, m)
            cmp_next = None
        elif op == 0x35:
            fb = frames[1]
            if fb.value is not None:
                for c in CELLS + (0x9B, 0x97):
                    if fb.value <= c < fb.value + 0x100:
                        m[c] = None
        elif op == 0x2D:
            if not (ins.args and ins.args[0] in (1, 2)):
                for c in CELLS + (0x9B, 0x97):
                    m[c] = None
                cmp_next = None
        elif op in (0x14, 0x1D, 0x1F, 0x22, 0x23, 0x24, 0x28, 0x29, 0x32, 0x39, 0x3F, 0x40):
            cmp_next = None
        adv(mem_=m, cmp=cmp_next)

    def refine(self, st: St, op: str, lhs, rhs, vaddr: int):
        """Add ``lhs op rhs`` to the path.  Returns (constraints, opaque guards, feasible).

        Only guards on the host cell descriptor become constraints; every other symbolic guard
        (player answer, RANDOM, party lookup, unknown value) is recorded as an opaque guard with its
        kind and branches both ways.  That keeps the state space finite and the report honest: the
        guards the route does not control are listed, not silently satisfied.
        """
        if isinstance(lhs, int) and isinstance(rhs, int):
            return st.cons, st.opaque, cmp_int(op, lhs, rhs)
        kinds = guard_kinds(lhs) | guard_kinds(rhs)
        if "unknown" in kinds or not any(k.startswith("host") for k in kinds):
            return st.cons, st.opaque | {(vaddr, "+".join(sorted(kinds)))}, True
        c = Constraint(op, lhs, rhs)
        if not consistent(st.cons, c):
            return st.cons, st.opaque, False
        return st.cons | {c}, st.opaque, True

    def run(self, start_area: int, goals: set, *, max_inv: int = 3, slots=range(5)):
        """Breadth-first over invocations: (current member, memory) -> slot -> outcome."""
        results: list[Route] = []
        frontier = [(self.a2m[start_area], {}, frozenset(), 0)]
        visited = set()
        for inv in range(max_inv):
            nxt_frontier = []
            for mi, mem, cons, _ in frontier:
                for slot in slots:
                    routes, finals = self.invocation(mi, slot, mem, inv, goals, seed_cons=frozenset())
                    for r in routes:
                        results.append(Route(r.goal, r.constraints, r.opaque_guards,
                                             r.chain, inv, r.mem))
                    for fm, fmem, fcons, fopq, fchain in finals:
                        key = (fm, fmem)
                        if key in visited:
                            continue
                        visited.add(key)
                        nxt_frontier.append((fm, dict(fmem), fcons, inv + 1))
            frontier = nxt_frontier
        return results


def dedupe(routes: list[Route]) -> list[Route]:
    seen = set()
    out = []
    for r in routes:
        key = (r.goal, r.constraints, r.opaque_guards, r.chain, r.inv)
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-inv", type=int, default=3)
    ap.add_argument("--no-zero-init", action="store_true")
    args = ap.parse_args()
    members, a2m = load_ecl()
    rows = census_writers(members, a2m)
    for c, s in writer_summary(rows).items():
        print(f"cell 0x{c:04X}: {s}")
    edges, dyn = area_graph(members, a2m)
    print("chain 1->27:", shortest_chain(edges, 1, TARGET_AREA))
    print("dynamic NEWECL:", dyn)
    ex = Explorer(members, a2m, zero_init=not args.no_zero_init)
    routes = dedupe(ex.run(1, {(TARGET_AREA, TARGET_VADDR)}, max_inv=args.max_inv))
    print(f"routes to 27:0x{TARGET_VADDR:04X}: {len(routes)} (capped={ex.capped})")
    for r in routes[:20]:
        print(r.inv, r.chain, r.constraints, r.opaque_guards)
    print(qsv_facts(QSV_PATH.read_bytes()))


if __name__ == "__main__":
    main()
