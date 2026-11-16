#!/usr/bin/env python3
"""C1.8: settle the C64 dungeon display MODE from VIC-II register state, not from pixels.

Background (why this module exists at all). `docs/engine/research/c64-wallset-format.md` had a
"WALLSET glyphs are multicolour" verdict RETRACTED in round 4: both of its legs were
non-discriminating (a 96.9% corpus statistic that a structure-destroying null pushes to 100%, and
a visual read that multicolour decoding produces for *any* input). The doc then concluded that a
glyph sheet is the wrong instrument and the question is blocked on `WALLDEF`.

It is not blocked. The display mode is a **hardware state**, and the population of code that can
set it is tiny and already readable:

  * `docs/engine/research/c64-disk-format.md` §7.5 proved `GDRIVE01`'s table-slot-0 routine at
    `$C0A1` does `LDA #$34 / STA $D018 / ORA $D016 / STA $D016` -- i.e. it SETS `$D016` bit 4
    (multicolour character mode) and points the VIC at screen `$CC00` / charset `$D000`.
  * `docs/engine/research/c64-wallset-format.md` §3.4 proved `DUNGEON.prg` reaches exactly that
    slot (`JSR $C000`), and makes zero VIC writes of its own.

So the ONLY thing that could make charset-based dungeon output hires is a LATER write that
clears `$D016` bit 4, or switches `$D011` into bitmap mode (bit 5). Nobody had ever censused
those writes. This module does: every opcode in the whole 7-title C64 corpus that can write
`$D011` / `$D016` / `$D018`, adjudicated site by site.

Rule 4 (search every idiom, not the one you thought of) is the load-bearing design constraint
here. A store-only scan (`STA abs`) would have found `GDRIVE01`'s write but NOT its value,
because the real idiom in this corpus is a read-modify pair (`ORA $D016` ... `STA $D016`). So
`candidate_sites()` enumerates:

  * absolute stores in every addressing mode that has one: STA abs/abx/aby, STX abs, STY abs
  * the read-modify-write opcodes: INC/DEC/ASL/LSR/ROL/ROR in abs and abx
  * the *undocumented* NMOS RMW/store opcodes (SLO/RLA/SRE/RRA/DCP/ISC/SAX/SHA/SHX/SHY/TAS) --
    `c64_disasm.py` deliberately does not decode these, so they are matched here by raw opcode
    byte and reported as their own class rather than silently missed
  * the READ side (LDA/LDX/LDY/ORA/AND/EOR/ADC/SBC/CMP/BIT in abs/abx/aby), which is what makes
    a read-modify pair's stored VALUE resolvable at all
  * indexed bases in `$D000-$D018` whose runtime `,X`/`,Y` displacement could land on a target
    even though the literal operand does not (`indexed_base_sites()`)

Adjudication of byte-alias false positives follows the technique the sprite doc established
(`c64_sprite.illegal_opcode_fraction` + decode alignment): a raw operand scan is not
decode-accurate (see `c64_disasm.find_stores`'s own docstring), so a hit is a CANDIDATE until
its offset is shown to be a real instruction boundary and its host file is shown to be code.

Two independent alignment tests are provided, because neither alone is safe:
  * `linear_boundaries()` -- offsets that are instruction starts in a linear decode from body
    offset 0. Cheap, but a data run at the head of a file desynchronises it.
  * `convergence(body, off, lookback)` -- how many of the `lookback` possible start offsets
    before `off` decode forward onto `off` exactly. 6502 code is strongly self-synchronising, so
    a real instruction attracts nearly all of them and a mid-operand alias attracts few.
    **The window's own edge is not a fact**: `convergence_window_sweep()` reports the score at
    `lookback-1`, `lookback` and `lookback+1` so a caller can see the edge is not doing the work.

CLI:
    python tools/c64_vicmode.py census                    # all 7 titles, all sides
    python tools/c64_vicmode.py census --title "Champions of Krynn"
    python tools/c64_vicmode.py show --title "Champions of Krynn" --file LIBRARY --off 3451
    python tools/c64_vicmode.py indexed                   # the ,X/,Y base sweep
    python tools/c64_vicmode.py summary                   # the headline verdict table

External source images are read-only and never vendored (CLAUDE.md); every corpus function
raises `SourceUnavailable` when `D:\\Games\\Emulator\\C64\\Goldbox` is absent, so tests skip.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disk as c64  # noqa: E402
import c64_disasm as da  # noqa: E402

# ------------------------------------------------------------------------------------------
# Corpus
# ------------------------------------------------------------------------------------------

GOLDBOX_ROOT = r"D:\Games\Emulator\C64\Goldbox"

#: The seven complete C64 title sets (same list as tools/c64_walldef_struct.TITLES; kept as its
#: own literal here so this module has no import dependency on that slice's analysis code).
TITLES = (
    "Champions of Krynn",
    "Death Knights of Krynn",
    "Curse of the Azure Bonds",
    "Secret of the Silver Blades",
    "Gateway to the Savage Frontier",
    "Pool of Radiance",
    "Buck Rogers - Countdown to Doomsday",
)


class SourceUnavailable(RuntimeError):
    """The external, never-vendored D:\\...\\Goldbox corpus is not present on this machine."""


def title_dir(title: str, root: str = GOLDBOX_ROOT) -> str:
    d = os.path.join(root, title)
    if not os.path.isdir(d):
        raise SourceUnavailable(f"external source directory not found: {d}")
    return d


def side_paths(title: str, root: str = GOLDBOX_ROOT) -> list[str]:
    """Every `.d64` for `title`, globbed NON-recursively so each title's `superseded\\` folder
    (deliberately-damaged alternate dumps, see CLAUDE.md) is never read back."""
    paths = sorted(glob.glob(os.path.join(title_dir(title, root), "*.d64")))
    if not paths:
        raise SourceUnavailable(f"no .d64 images found for {title}")
    return paths


_BODY_CACHE: dict[tuple[str, str], dict[str, bytes]] = {}


def all_bodies(title: str, root: str = GOLDBOX_ROOT) -> dict[str, bytes]:
    """name -> body bytes (2-byte CBM load address stripped), unioned over EVERY side of the
    title. First occurrence of a name wins (deterministic, sides are read in sorted order).

    Same contract as `c64_kernel.all_bodies`, but for all seven titles rather than the two that
    module has `TITLE_DIRS` entries for. Cached, because the census reads 49 sides.
    """
    key = (root, title)
    if key in _BODY_CACHE:
        return _BODY_CACHE[key]
    out: dict[str, bytes] = {}
    for p in side_paths(title, root):
        img = c64.read_image(p)
        for e in c64.directory(img):
            if e.name in out:
                continue
            try:
                data = c64.read_file(img, e)
            except Exception:
                continue
            if len(data) < 3:
                continue
            out[e.name] = data[2:]
    _BODY_CACHE[key] = out
    return out


# ------------------------------------------------------------------------------------------
# The registers and the two mode bits
# ------------------------------------------------------------------------------------------

VIC_CTRL1 = 0xD011      # bit 5 = BMM (bitmap mode), bit 3 = RSEL, bit 4 = DEN
VIC_CTRL2 = 0xD016      # bit 4 = MCM (multicolour mode)
VIC_MEMPTR = 0xD018     # screen base (bits 4-7) / charset base (bits 1-3)

TARGETS = (VIC_CTRL1, VIC_CTRL2, VIC_MEMPTR)

MCM_BIT = 0x10          # $D016 bit 4 -- multicolour
BMM_BIT = 0x20          # $D011 bit 5 -- bitmap
ECM_BIT = 0x40          # $D011 bit 6 -- extended background colour mode

#: Every bit that changes how the VIC *interprets a character-mode glyph*, per register.
#: `$D018` carries no mode bit (it is an address pointer) and is censused for its VALUE only.
#:
#: ECM is included on purpose. The question "are WALLSET glyphs hires or multicolour" has a
#: third answer nobody had ruled out: extended-colour mode, which reinterprets the top two bits
#: of every screen code as a background-colour select and so restricts the charset to 64 glyphs.
#: Searching only for the two idioms one first thinks of is the failure mode STANDING PROJECT
#: RULE 4 names, so the third mode bit is censused rather than assumed off.
MODE_BITS: dict[int, tuple[tuple[str, int], ...]] = {
    VIC_CTRL1: (("BMM", BMM_BIT), ("ECM", ECM_BIT)),
    VIC_CTRL2: (("MCM", MCM_BIT),),
    VIC_MEMPTR: (),
}


# ------------------------------------------------------------------------------------------
# Opcode classes (rule 4: every idiom that can perform the operation)
# ------------------------------------------------------------------------------------------

#: Documented NMOS opcodes that WRITE an absolute (or absolute-indexed) address.
WRITE_OPCODES: dict[int, tuple[str, str]] = {
    0x8D: ("STA", da.ABS), 0x9D: ("STA", da.ABX), 0x99: ("STA", da.ABY),
    0x8E: ("STX", da.ABS), 0x8C: ("STY", da.ABS),
    # read-modify-write: these both read and write the named address
    0xEE: ("INC", da.ABS), 0xFE: ("INC", da.ABX),
    0xCE: ("DEC", da.ABS), 0xDE: ("DEC", da.ABX),
    0x0E: ("ASL", da.ABS), 0x1E: ("ASL", da.ABX),
    0x4E: ("LSR", da.ABS), 0x5E: ("LSR", da.ABX),
    0x2E: ("ROL", da.ABS), 0x3E: ("ROL", da.ABX),
    0x6E: ("ROR", da.ABS), 0x7E: ("ROR", da.ABX),
}

#: The RMW subset of the above -- these modify the register in place, so their effect on a mode
#: bit is computable from the opcode alone without resolving any CPU register.
RMW_OPCODES = frozenset({0xEE, 0xFE, 0xCE, 0xDE, 0x0E, 0x1E, 0x4E, 0x5E, 0x2E, 0x3E, 0x6E, 0x7E})

#: Undocumented ("illegal") NMOS opcodes with a 3-byte abs/abx/aby form that WRITES memory.
#: `c64_disasm.OPCODES` deliberately omits all illegal opcodes, so these would be invisible to
#: any scan built on it. Matched here by raw opcode byte and reported as their own class.
ILLEGAL_WRITE_OPCODES: dict[int, str] = {
    0x0F: "SLO", 0x1F: "SLO", 0x1B: "SLO",
    0x2F: "RLA", 0x3F: "RLA", 0x3B: "RLA",
    0x4F: "SRE", 0x5F: "SRE", 0x5B: "SRE",
    0x6F: "RRA", 0x7F: "RRA", 0x7B: "RRA",
    0x8F: "SAX", 0x9F: "SHA", 0x9E: "SHX", 0x9C: "SHY", 0x9B: "TAS",
    0xCF: "DCP", 0xDF: "DCP", 0xDB: "DCP",
    0xEF: "ISC", 0xFF: "ISC", 0xFB: "ISC",
}

#: Documented opcodes that READ an absolute address. Needed because the real idiom in this
#: corpus is a read-modify pair (`LDA #$34 / ORA $D016 / STA $D016`), whose stored VALUE is only
#: resolvable if the read half is in the census too.
READ_OPCODES: dict[int, tuple[str, str]] = {
    0xAD: ("LDA", da.ABS), 0xBD: ("LDA", da.ABX), 0xB9: ("LDA", da.ABY),
    0xAE: ("LDX", da.ABS), 0xBE: ("LDX", da.ABY),
    0xAC: ("LDY", da.ABS), 0xBC: ("LDY", da.ABX),
    0x0D: ("ORA", da.ABS), 0x1D: ("ORA", da.ABX), 0x19: ("ORA", da.ABY),
    0x2D: ("AND", da.ABS), 0x3D: ("AND", da.ABX), 0x39: ("AND", da.ABY),
    0x4D: ("EOR", da.ABS), 0x5D: ("EOR", da.ABX), 0x59: ("EOR", da.ABY),
    0x6D: ("ADC", da.ABS), 0x7D: ("ADC", da.ABX), 0x79: ("ADC", da.ABY),
    0xED: ("SBC", da.ABS), 0xFD: ("SBC", da.ABX), 0xF9: ("SBC", da.ABY),
    0xCD: ("CMP", da.ABS), 0xDD: ("CMP", da.ABX), 0xD9: ("CMP", da.ABY),
    0x2C: ("BIT", da.ABS),
}

WRITE, READ, ILLEGAL_WRITE = "write", "read", "illegal-write"


@dataclass(frozen=True)
class Site:
    title: str
    file: str
    offset: int          # body offset of the candidate opcode byte
    opcode: int
    mnemonic: str
    mode: str            # da.ABS / da.ABX / da.ABY, or "?" for illegal opcodes
    target: int          # the absolute address named by the operand bytes
    kind: str            # WRITE / READ / ILLEGAL_WRITE


def candidate_sites(title: str, file: str, body: bytes,
                    targets: tuple[int, ...] = TARGETS) -> list[Site]:
    """Every body offset whose 3 bytes read as `<opcode> <lo> <hi>` with `lo|hi<<8` in `targets`
    and the opcode in one of the three classes above.

    RAW scan -- every offset is tried, with no instruction-boundary tracking, exactly like
    `c64_disasm.find_stores`. That is deliberate: this is the recall-maximising step, and the
    precision step (`adjudicate`) runs afterwards. A hit here is a CANDIDATE, never a fact.
    """
    tset = set(targets)
    out: list[Site] = []
    for i in range(len(body) - 2):
        addr = body[i + 1] | (body[i + 2] << 8)
        if addr not in tset:
            continue
        op = body[i]
        if op in WRITE_OPCODES:
            mnem, mode = WRITE_OPCODES[op]
            out.append(Site(title, file, i, op, mnem, mode, addr, WRITE))
        elif op in ILLEGAL_WRITE_OPCODES:
            out.append(Site(title, file, i, op, ILLEGAL_WRITE_OPCODES[op], "?", addr,
                            ILLEGAL_WRITE))
        elif op in READ_OPCODES:
            mnem, mode = READ_OPCODES[op]
            out.append(Site(title, file, i, op, mnem, mode, addr, READ))
    return out


def census(title: str, targets: tuple[int, ...] = TARGETS,
           root: str = GOLDBOX_ROOT) -> list[Site]:
    """`candidate_sites` over every file on every side of `title`, sorted by (file, offset)."""
    out: list[Site] = []
    for name, body in sorted(all_bodies(title, root).items()):
        out.extend(candidate_sites(title, name, body, targets))
    return out


# ------------------------------------------------------------------------------------------
# Indexed-base sweep: `STA $D010,X` with X=6 writes $D016 without ever naming it
# ------------------------------------------------------------------------------------------

#: Bases an `,X`/`,Y` write could use to reach a target without naming it literally. Bounded to
#: the VIC register block below the highest target: an unsigned index only ever adds, so a base
#: above $D018 can never reach $D011/$D016/$D018 (it would have to wrap a full 64 KB).
INDEXED_BASE_LO = 0xD000
INDEXED_BASE_HI = VIC_MEMPTR  # inclusive


def _indexed_sites_in_body(title: str, file: str, body: bytes) -> list[Site]:
    out: list[Site] = []
    for i in range(len(body) - 2):
        op = body[i]
        if op in WRITE_OPCODES:
            mnem, mode = WRITE_OPCODES[op]
            if mode not in (da.ABX, da.ABY):
                continue
            kind = WRITE
        elif op in ILLEGAL_WRITE_OPCODES:
            mnem, mode, kind = ILLEGAL_WRITE_OPCODES[op], "?", ILLEGAL_WRITE
        else:
            continue
        addr = body[i + 1] | (body[i + 2] << 8)
        if not (INDEXED_BASE_LO <= addr <= INDEXED_BASE_HI) or addr in TARGETS:
            continue
        out.append(Site(title, file, i, op, mnem, mode, addr, kind))
    return out


def indexed_base_sites(title: str, root: str = GOLDBOX_ROOT) -> list[Site]:
    """Every ABX/ABY *write* whose literal base lies in [$D000, $D018] but is NOT itself a
    target. These are the writes a literal-operand census structurally cannot see, because the
    address they hit depends on a runtime index. Reported so the census's blind spot is a
    measured number rather than an unexamined assumption.
    """
    out: list[Site] = []
    for name, body in sorted(all_bodies(title, root).items()):
        out.extend(_indexed_sites_in_body(title, name, body))
    return out


#: How far back `index_bound` looks for the instruction that loads the index register. 48 bytes
#: covers the longest such gap in this corpus (GDRIVE00's $CAC7 `LDX #$01`, 20 bytes before its
#: `STA $D00E,X`); the sweep in the CLI's `indexed` output shows the values are not sensitive
#: to it, because every real case loads the index within one basic block of the store.
INDEX_LOOKBACK = 48


def index_bound(body: bytes, offset: int, lookback: int = INDEX_LOOKBACK) -> int | None:
    """The largest index an `abs,X` / `abs,Y` write at `offset` can use, when that is provable
    from the nearest preceding ALIGNED `LDX/LDY #imm` in the same straight-line run.

    Returns None -- meaning "read it by hand" -- when the index register is loaded from memory
    or computed, or when an `INX`/`INY` appears between the load and the store (which would let
    the index climb above the immediate). Every graphics-path site in this corpus counts DOWN
    from an immediate, so `base + index_bound()` is the highest address the loop can touch.
    """
    op = body[offset]
    entry = WRITE_OPCODES.get(op)
    if entry is None:
        return None
    mode = entry[1]
    if mode == da.ABX:
        load_op, inc_mnem = 0xA2, "INX"
    elif mode == da.ABY:
        load_op, inc_mnem = 0xA0, "INY"
    else:
        return None
    start = _sync_start(body, offset, lookback)
    value = None
    for off, opcode, mnem, imode in _instr_stream(body, start):
        if off >= offset:
            break
        if opcode == load_op and imode == da.IMM:
            value = body[off + 1]
        elif mnem == inc_mnem:
            value = None
        elif mnem in ("JSR", "RTS", "RTI", ".byte"):
            value = None
    return value


def self_consistency_excluding(body: bytes, org: int,
                               exclude: tuple[int, int]) -> tuple[int, int]:
    """(hits, total) own absolute JSR/JMP operands landing inside [org, org+len(body)), ignoring
    any operand inside `exclude`.

    Same measure and same rationale as `c64_kernel.self_consistency_excluding` (restated here so
    this module does not import that one's corpus surface): LIBRARY's own heavily-called span
    inflates the score of ANY candidate origin that overlaps it, so it has to be filtered out
    before an overlay's true local-jump signal is visible.
    """
    lo, hi = exclude
    hits = total = 0
    for i in range(len(body) - 2):
        if body[i] in (0x20, 0x4C):
            addr = body[i + 1] | (body[i + 2] << 8)
            if lo <= addr < hi:
                continue
            total += 1
            if org <= addr < org + len(body):
                hits += 1
    return hits, total


# ------------------------------------------------------------------------------------------
# Decode alignment: telling a real instruction from a byte-alias
# ------------------------------------------------------------------------------------------

def linear_boundaries(body: bytes, start: int = 0) -> set[int]:
    """Offsets that are instruction starts in a linear decode beginning at `start`. Unknown
    opcode bytes advance by 1 (same walk as `c64_sprite.illegal_opcode_fraction`), so a data run
    degrades this into visible desynchronisation rather than silent fiction."""
    out: set[int] = set()
    pc = start
    n = len(body)
    while pc < n:
        out.add(pc)
        entry = da.OPCODES.get(body[pc])
        if entry is None:
            pc += 1
            continue
        size = da.SIZE[entry[1]]
        pc += 1 if pc + size > n else size
    return out


def decodes_onto(body: bytes, start: int, target: int) -> bool:
    """Does a linear decode from `start` land exactly on offset `target`?"""
    pc = start
    while pc < target:
        entry = da.OPCODES.get(body[pc])
        if entry is None:
            pc += 1
            continue
        size = da.SIZE[entry[1]]
        pc += 1 if pc + size > len(body) else size
    return pc == target


def convergence(body: bytes, offset: int, lookback: int = 12) -> tuple[int, int]:
    """(hits, tried): of the `lookback` start offsets immediately before `offset`, how many
    decode forward onto `offset` exactly?

    6502 machine code is strongly self-synchronising, so a genuine instruction boundary attracts
    nearly every nearby start, while an offset in the middle of an operand attracts few. This is
    the alias test that does not depend on the whole file decoding cleanly from byte 0.
    """
    lo = max(0, offset - lookback)
    tried = hits = 0
    for s in range(lo, offset):
        tried += 1
        if decodes_onto(body, s, offset):
            hits += 1
    return hits, tried


def convergence_window_sweep(body: bytes, offset: int, lookback: int = 12
                             ) -> dict[int, tuple[int, int]]:
    """`convergence` at `lookback-1`, `lookback` and `lookback+1`.

    STANDING PROJECT RULE 1: an analysis window's own edge is not a fact about the data. Any
    reported convergence figure must be quotable together with its immediate neighbours, so a
    reader can see the verdict is not an artefact of where the window was cut.
    """
    return {w: convergence(body, offset, w) for w in (lookback - 1, lookback, lookback + 1)
            if w > 0}


# ------------------------------------------------------------------------------------------
# Value resolution: what does the store actually put in the register?
# ------------------------------------------------------------------------------------------

SET, CLEAR, UNKNOWN = "set", "clear", "unknown"

_IMM = {0xA9: "LDA", 0xA2: "LDX", 0xA0: "LDY"}


def _instr_stream(body: bytes, start: int = 0) -> list[tuple[int, int, str, str]]:
    """[(offset, opcode, mnemonic, mode), ...] for a linear decode from `start`; unknown opcodes
    are emitted with mnemonic '.byte' and mode '?' and advance by 1."""
    out = []
    pc = start
    n = len(body)
    while pc < n:
        entry = da.OPCODES.get(body[pc])
        if entry is None:
            out.append((pc, body[pc], ".byte", "?"))
            pc += 1
            continue
        mnem, mode = entry
        size = da.SIZE[mode]
        if pc + size > n:
            out.append((pc, body[pc], ".byte", "?"))
            pc += 1
            continue
        out.append((pc, body[pc], mnem, mode))
        pc += size
    return out


def _sync_start(body: bytes, offset: int, lookback: int) -> int:
    """The earliest start offset within `lookback` bytes that decodes onto `offset` -- i.e. the
    longest instruction prefix we can trust to be aligned with the store. Falls back to `offset`
    itself when nothing converges (an isolated, unaligned candidate)."""
    for s in range(max(0, offset - lookback), offset):
        if decodes_onto(body, s, offset):
            return s
    return offset


def trace_bit(body: bytes, store_offset: int, mask: int, lookback: int = 12
              ) -> tuple[str, list[str]]:
    """Symbolically evaluate the state of bit `mask` in the register a store at `store_offset`
    writes, by forward-simulating the aligned instruction prefix before it.

    Returns (state, trace) where state is SET / CLEAR / UNKNOWN. The simulator tracks ONLY the
    one bit, for A/X/Y, and is deliberately conservative: anything it cannot prove (a JSR, a
    memory load, an arithmetic op, a pull) resets the bit to UNKNOWN rather than guessing. So a
    SET/CLEAR verdict is a positive statement about the bytes; UNKNOWN means "read it yourself".

    Rules (only what this corpus actually uses, plus the obvious neighbours):
      LDA/LDX/LDY #imm      -> that register's bit := imm & mask
      ORA #imm              -> A.bit := SET if imm & mask else unchanged
      AND #imm              -> A.bit := CLEAR if not imm & mask else unchanged
      EOR #imm              -> A.bit flipped if imm & mask else unchanged
      ORA/AND/EOR mem       -> SET (ORA on an already-SET bit) / CLEAR (AND on already-CLEAR) /
                               else UNKNOWN -- this is what resolves `LDA #$34 / ORA $D016`
      TAX/TAY/TXA/TYA       -> copy the bit
      anything else writing A/X/Y (loads from memory, ADC/SBC, shifts, PLA, INX/DEY, JSR) ->
                               UNKNOWN for every register it can touch
    """
    reg = {"A": UNKNOWN, "X": UNKNOWN, "Y": UNKNOWN}
    trace: list[str] = []
    start = _sync_start(body, store_offset, lookback)
    for off, op, mnem, mode in _instr_stream(body, start):
        if off >= store_offset:
            break
        opnd = body[off + 1] if off + 1 < len(body) else 0
        if mnem == "LDA" and mode == da.IMM:
            reg["A"] = SET if opnd & mask else CLEAR
        elif mnem == "LDX" and mode == da.IMM:
            reg["X"] = SET if opnd & mask else CLEAR
        elif mnem == "LDY" and mode == da.IMM:
            reg["Y"] = SET if opnd & mask else CLEAR
        elif mnem == "ORA" and mode == da.IMM:
            if opnd & mask:
                reg["A"] = SET
        elif mnem == "AND" and mode == da.IMM:
            if not opnd & mask:
                reg["A"] = CLEAR
        elif mnem == "EOR" and mode == da.IMM:
            if opnd & mask:
                reg["A"] = {SET: CLEAR, CLEAR: SET}.get(reg["A"], UNKNOWN)
        elif mnem == "ORA":
            reg["A"] = SET if reg["A"] == SET else UNKNOWN
        elif mnem == "AND":
            reg["A"] = CLEAR if reg["A"] == CLEAR else UNKNOWN
        elif mnem in ("TAX",):
            reg["X"] = reg["A"]
        elif mnem in ("TAY",):
            reg["Y"] = reg["A"]
        elif mnem in ("TXA",):
            reg["A"] = reg["X"]
        elif mnem in ("TYA",):
            reg["A"] = reg["Y"]
        elif mnem in ("LDA", "EOR", "ADC", "SBC", "PLA", "ASL", "LSR", "ROL", "ROR"):
            reg["A"] = UNKNOWN
        elif mnem in ("LDX", "TSX", "INX", "DEX"):
            reg["X"] = UNKNOWN
        elif mnem in ("LDY", "INY", "DEY"):
            reg["Y"] = UNKNOWN
        elif mnem in ("JSR", "JMP", "RTS", "RTI", "BRK", ".byte"):
            reg = {"A": UNKNOWN, "X": UNKNOWN, "Y": UNKNOWN}
        trace.append(f"{off}: {mnem} {mode}")
    src = {0x8D: "A", 0x9D: "A", 0x99: "A", 0x8E: "X", 0x8C: "Y"}.get(body[store_offset])
    if src is None:
        return UNKNOWN, trace
    return reg[src], trace


#: How an in-place read-modify-write opcode affects one bit of the register it targets. These
#: need no CPU-register resolution at all: the opcode alone decides.
def rmw_bit_effect(opcode: int, mask: int) -> str:
    """SET / CLEAR / UNKNOWN for the mode bit after an in-place RMW on the register.

    INC/DEC and the rotates depend on the register's prior contents (and `$D016`'s prior
    contents are only partly knowable statically), so they are UNKNOWN. ASL abs shifts a 0 into
    bit 0 and bit 4 gets bit 3's old value -> UNKNOWN. The honest answer for every RMW form on a
    single bit is UNKNOWN; this function exists so that fact is stated once, in code, instead of
    being assumed at each call site.
    """
    return UNKNOWN


# ------------------------------------------------------------------------------------------
# Adjudication
# ------------------------------------------------------------------------------------------

#: Convergence at or above this fraction of the lookback window is treated as decode-aligned.
#: Chosen (not tuned) as "most of the window agrees"; every site's raw (hits, tried) is carried
#: in the record so a reader can apply a different threshold without re-running anything.
ALIGN_MIN_FRACTION = 0.5

#: Illegal-opcode fraction above this is treated as "not code". The sprite doc measured every
#: confirmed-code overlay under 10% file-wide (DUNGEON 7.7-9.0%, COMBAT 0.5%, LIBRARY 6.0-6.6%,
#: GDRIVE01 8.3%) and picture data at 31-44%. 0.20 sits in that gap.
#:
#: **This threshold is applied to the LOCAL fraction (`local_illegal_fraction`), not the
#: file-wide one, and that choice is load-bearing.** Applying it file-wide put `INIT` on the
#: wrong side of the line in two titles for no reason but where the cut fell -- Curse of the
#: Azure Bonds' INIT scores 0.198 and Secret of the Silver Blades' 0.209, so a 0.20 file-wide
#: cut would have deleted 10 real, correctly-decoding sites from one title's census and kept
#: the identical 10 in another. That is precisely the "the window's own edge became the
#: finding" failure this project has shipped before. Locally, around their own VIC sites, both
#: files score 0.000 (radius 64) -- the file-wide number is dominated by INIT's large embedded
#: data tables, which have nothing to do with whether the site is an instruction.
CODE_MAX_ILLEGAL_FRACTION = 0.20

#: Bytes either side of a site included in `local_illegal_fraction`. 64 is wide enough to span
#: a whole VIC-setup routine and narrow enough not to reach a neighbouring data table;
#: `local_illegal_fraction_sweep` reports 32/64/96/128 so the choice is inspectable.
LOCAL_RADIUS = 64


def illegal_opcode_fraction(body: bytes) -> float:
    """Local copy of `c64_sprite.illegal_opcode_fraction`'s walk (that module imports a large
    corpus surface this one does not need). Same semantics: fraction of a linear decode from
    offset 0 landing on an undefined opcode or an instruction running past EOF."""
    pc = 0
    illegal = total = 0
    n = len(body)
    while pc < n:
        entry = da.OPCODES.get(body[pc])
        if entry is None:
            illegal += 1
            total += 1
            pc += 1
            continue
        size = da.SIZE[entry[1]]
        if pc + size > n:
            illegal += 1
            total += 1
            pc += 1
            continue
        total += 1
        pc += size
    return illegal / total if total else 0.0


def local_illegal_fraction(body: bytes, offset: int, radius: int = LOCAL_RADIUS) -> float:
    """`illegal_opcode_fraction`, but measured only over the decode that actually contains
    `offset`: it starts at the earliest start within `radius` that converges onto `offset`, and
    runs to `offset + radius`.

    This is the code-vs-data test that a site deserves. A file-wide fraction answers "is this
    file mostly code", which is the wrong question for a mixed code+table overlay like `INIT`
    (whose file-wide score straddles any plausible threshold across the seven titles while its
    VIC routines decode perfectly).
    """
    start = _sync_start(body, offset, radius)
    end = min(len(body), offset + radius)
    pc = start
    illegal = total = 0
    while pc < end:
        entry = da.OPCODES.get(body[pc])
        total += 1
        if entry is None or pc + da.SIZE[entry[1]] > len(body):
            illegal += 1
            pc += 1
            continue
        pc += da.SIZE[entry[1]]
    return illegal / total if total else 0.0


def local_illegal_fraction_sweep(body: bytes, offset: int,
                                 radii: tuple[int, ...] = (32, 64, 96, 128)) -> dict[int, float]:
    """`local_illegal_fraction` at several radii. STANDING PROJECT RULE 1 again: the radius is
    an analysis window, so its neighbours have to be quotable next to whatever value is used."""
    return {r: local_illegal_fraction(body, offset, r) for r in radii}


@dataclass(frozen=True)
class Verdict:
    site: Site
    aligned: bool
    conv_hits: int
    conv_tried: int
    file_illegal_fraction: float
    local_illegal: float
    bit_states: tuple[tuple[str, str], ...]   # (("MCM", "set"), ...) for this register's bits
    imm_value: int | None  # the literal byte, when an ALIGNED `LDA/LDX/LDY #imm` feeds the store

    def bit(self, name: str) -> str:
        """SET / CLEAR / UNKNOWN for one named mode bit; UNKNOWN if this register has no such
        bit (so a caller can ask any site about any bit without special-casing)."""
        return dict(self.bit_states).get(name, UNKNOWN)

    @property
    def code_like(self) -> bool:
        return self.local_illegal <= CODE_MAX_ILLEGAL_FRACTION

    @property
    def credible(self) -> bool:
        """A site that is both decode-aligned and sits in locally code-like bytes. Only credible
        WRITE sites can bear on the mode question; the rest are byte-aliases inside data."""
        return self.aligned and self.code_like


def adjudicate(body: bytes, site: Site, lookback: int = 12,
               radius: int = LOCAL_RADIUS) -> Verdict:
    hits, tried = convergence(body, site.offset, lookback)
    aligned = tried > 0 and hits / tried >= ALIGN_MIN_FRACTION
    frac = illegal_opcode_fraction(body)
    local = local_illegal_fraction(body, site.offset, radius)
    states: list[tuple[str, str]] = []
    for name, mask in MODE_BITS.get(site.target, ()):
        if site.kind != WRITE:
            states.append((name, UNKNOWN))
        elif site.opcode in RMW_OPCODES:
            states.append((name, rmw_bit_effect(site.opcode, mask)))
        else:
            states.append((name, trace_bit(body, site.offset, mask, lookback)[0]))
    # The immediate is only reported when the `LDA #imm` is itself on the SAME decode as the
    # store. A raw `body[off-2] in _IMM` check reports fiction: Gateway's `GATEWAY` file has
    # `A9 C8` two bytes before an aliasing `8D 16 D0`, but the aligned decode consumes those
    # bytes as a `BNE` operand plus an `INY`, so "$D016 := $C8" would have been invented.
    imm = None
    if site.opcode in (0x8D, 0x8E, 0x8C) and site.offset >= 2 and body[site.offset - 2] in _IMM:
        anchored = {off for off, _, _, _ in
                    _instr_stream(body, _sync_start(body, site.offset, lookback))}
        if site.offset - 2 in anchored:
            imm = body[site.offset - 1]
    return Verdict(site, aligned, hits, tried, frac, local, tuple(states), imm)


def adjudicated_census(title: str, targets: tuple[int, ...] = TARGETS,
                       lookback: int = 12, root: str = GOLDBOX_ROOT,
                       radius: int = LOCAL_RADIUS) -> list[Verdict]:
    bodies = all_bodies(title, root)
    return [adjudicate(bodies[s.file], s, lookback, radius)
            for s in census(title, targets, root)]


# ------------------------------------------------------------------------------------------
# The literal idioms, as byte constants
#
# These are a SECOND, independent instrument, not the primary one: a raw byte search finds only
# the exact spelling it is given, which is why the opcode census above exists. They are kept
# because they are trivially re-derivable by anyone with a hex editor, and because the two
# instruments disagreeing is itself informative -- e.g. `MCM_CLEAR_IDIOM` finds ONE site per
# title while the opcode census finds TWO in Champions of Krynn, Death Knights of Krynn and
# Secret of the Silver Blades, whose second clear is spelled
# `LDA $D016 / STA <save> / AND #$EF / STA $D016` and so is invisible to the pattern.
# ------------------------------------------------------------------------------------------

#: `LDA #$34 / STA $D018 / LDA #$10 / ORA $D016 / STA $D016` -- charset $D000 + multicolour ON.
MCM_SET_IDIOM = bytes.fromhex("A9348D18D0A9100D16D08D16D0")
#: `LDA $D016 / ORA #$10 / STA $D016` -- multicolour ON without touching `$D018`.
MCM_SET_ORA_IDIOM = bytes.fromhex("AD16D009108D16D0")
#: `LDA $D016 / AND #$EF / STA $D016` -- multicolour OFF (hires).
MCM_CLEAR_IDIOM = bytes.fromhex("AD16D029EF8D16D0")
#: `LDA $D011 / ORA #$20 / STA $D011` -- bitmap mode ON.
BMM_SET_IDIOM = bytes.fromhex("AD11D009208D11D0")
#: `LDA $D011 / AND #$DF / STA $D011` -- bitmap mode OFF (character mode).
BMM_CLEAR_IDIOM = bytes.fromhex("AD11D029DF8D11D0")
#: `LDA $D011 / ORA #$40 / STA $D011` -- extended-colour mode ON. Censused, never found.
ECM_SET_IDIOM = bytes.fromhex("AD11D009408D11D0")


def find_idiom(bodies: dict[str, bytes], pattern: bytes) -> list[tuple[str, int]]:
    """Every (file, offset) where `pattern` occurs literally, over a title's whole file set."""
    out: list[tuple[str, int]] = []
    for name, body in sorted(bodies.items()):
        i = body.find(pattern)
        while i >= 0:
            out.append((name, i))
            i = body.find(pattern, i + 1)
    return out


def credible_writes(verdicts: list[Verdict]) -> list[Verdict]:
    return [v for v in verdicts if v.site.kind == WRITE and v.credible]


def writes_to(verdicts: list[Verdict], target: int, credible_only: bool = True) -> list[Verdict]:
    return [v for v in verdicts if v.site.target == target and v.site.kind == WRITE
            and (v.credible or not credible_only)]


def writes_leaving(verdicts: list[Verdict], bit_name: str, state: str) -> list[Verdict]:
    """Every credible WRITE site that provably leaves mode bit `bit_name` in `state`.

    `writes_leaving(vs, "MCM", CLEAR)` is the refutation set for the multicolour claim (hires
    restored); `writes_leaving(vs, "BMM", SET)` is the refutation set for the bitmap claim.
    """
    return [v for v in verdicts
            if v.site.kind == WRITE and v.credible and v.bit(bit_name) == state]


# ------------------------------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------------------------------

def _fmt(v: Verdict) -> str:
    s = v.site
    imm = "" if v.imm_value is None else f"  imm=${v.imm_value:02X}"
    bits = " ".join(f"{n}={st}" for n, st in v.bit_states) or "-"
    return (f"  {'*' if v.credible else ' '} {s.file:<12} off={s.offset:<6d} {s.mnemonic:<5} "
            f"{s.mode:<3} ${s.target:04X} [{s.kind:<13}] conv={v.conv_hits}/{v.conv_tried} "
            f"ill={v.file_illegal_fraction:.3f}/{v.local_illegal:.3f} {bits}{imm}")


def _cmd_census(titles: list[str], lookback: int) -> None:
    for t in titles:
        try:
            vs = adjudicated_census(t, lookback=lookback)
        except SourceUnavailable as exc:
            print(f"{t}: skipped ({exc})")
            continue
        writes = [v for v in vs if v.site.kind == WRITE]
        cred = [v for v in writes if v.credible]
        print(f"\n=== {t}: {len(vs)} candidates "
              f"({len(writes)} write, {sum(1 for v in vs if v.site.kind == READ)} read, "
              f"{sum(1 for v in vs if v.site.kind == ILLEGAL_WRITE)} illegal-write); "
              f"{len(cred)} credible writes")
        for v in vs:
            print(_fmt(v))


def _cmd_show(title: str, file: str, off: int, org: int, count: int, lookback: int) -> None:
    body = all_bodies(title)[file]
    print(f"{title} {file} ({len(body)}B) offset {off}, org=${org:04X}")
    for w, (h, t) in sorted(convergence_window_sweep(body, off, lookback).items()):
        print(f"  convergence lookback={w}: {h}/{t}")
    start = _sync_start(body, off, lookback)
    for line in da.disassemble(body, org, max(0, start - 0), count):
        print("  " + line)


def _cmd_indexed(titles: list[str]) -> None:
    for t in titles:
        try:
            sites = indexed_base_sites(t)
        except SourceUnavailable as exc:
            print(f"{t}: skipped ({exc})")
            continue
        bodies = all_bodies(t)
        cred = [s for s in sites
                if adjudicate(bodies[s.file], s).credible]
        print(f"{t}: {len(sites)} indexed writes based in "
              f"[${INDEXED_BASE_LO:04X},${INDEXED_BASE_HI:04X}], {len(cred)} credible")
        for s in sites:
            v = adjudicate(bodies[s.file], s)
            mark = "*" if v.credible else " "
            print(f"  {mark} {s.file:<12} off={s.offset:<6d} {s.mnemonic} ${s.target:04X},"
                  f"{'X' if s.mode == da.ABX else 'Y'}  conv={v.conv_hits}/{v.conv_tried}")


def _cmd_summary(titles: list[str], lookback: int) -> None:
    print(f"{'title':<36} {'cand':>5} {'wr':>4} {'cred':>5} "
          f"{'MCM+':>5} {'MCM-':>5} {'BMM+':>5} {'ECM+':>5} {'DUNG':>5}")
    for t in titles:
        try:
            vs = adjudicated_census(t, lookback=lookback)
        except SourceUnavailable as exc:
            print(f"{t:<36} skipped ({exc})")
            continue
        writes = [v for v in vs if v.site.kind == WRITE]
        cred = [v for v in writes if v.credible]
        print(f"{t:<36} {len(vs):>5} {len(writes):>4} {len(cred):>5} "
              f"{len(writes_leaving(vs, 'MCM', SET)):>5} "
              f"{len(writes_leaving(vs, 'MCM', CLEAR)):>5} "
              f"{len(writes_leaving(vs, 'BMM', SET)):>5} "
              f"{len(writes_leaving(vs, 'ECM', SET)):>5} "
              f"{sum(1 for v in vs if v.site.file == 'DUNGEON'):>5}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    for name in ("census", "summary", "indexed"):
        p = sub.add_parser(name)
        p.add_argument("--title", action="append", choices=list(TITLES))
        p.add_argument("--lookback", type=int, default=12)

    p = sub.add_parser("show")
    p.add_argument("--title", required=True, choices=list(TITLES))
    p.add_argument("--file", required=True)
    p.add_argument("--off", type=lambda s: int(s, 0), required=True)
    p.add_argument("--org", type=lambda s: int(s, 0), default=0x0800)
    p.add_argument("--count", type=int, default=16)
    p.add_argument("--lookback", type=int, default=12)

    a = ap.parse_args(argv)
    titles = list(a.title) if getattr(a, "title", None) else list(TITLES)
    if a.cmd == "census":
        _cmd_census(titles, a.lookback)
    elif a.cmd == "summary":
        _cmd_summary(titles, a.lookback)
    elif a.cmd == "indexed":
        _cmd_indexed(titles)
    elif a.cmd == "show":
        _cmd_show(a.title, a.file, a.off, a.org, a.count, a.lookback)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
