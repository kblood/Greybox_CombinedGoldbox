#!/usr/bin/env python3
"""C1.9b: the Gold Box C64 boot and load chain.

Two prior slices (documented at the top of the C1.9b task prompt, and reproduced in
`docs/engine/research/c64-boot-chain.md`) hunted for a ~3.5 KB "kernel" that owns ten JSR/JMP
targets clustered around $2E00-$3C00 that no known resident explains. Both a hidden-file
hypothesis (refuted by a BAM audit -- zero orphaned blocks on the boot side of either title) and a
page-aligned fixed-residency hypothesis (unsupported -- best fit only 3/10 targets, and disagreed
between titles) came up empty.

This module answers the boot-chain half of that question directly, by DETOKENIZING the actual
BASIC bootstrap program (`BOOT` / `DEATH KNIGHTS`, a CBM BASIC V2 program stored at $0801) rather
than guessing at a 6502 origin. The BASIC stub turns out to load its overlays with a KERNAL LOAD
call whose secondary address is 0 -- which on real C64 hardware means "ignore the file's own
embedded load address and use the caller-supplied X/Y instead" (this is the exact mechanism behind
the well-known `LOAD"X",8,1` vs `LOAD"X",8` distinction; SA=1 keeps the file's own address, SA=0
overrides it). Every file in this corpus stores $4000 as its embedded address (see
`tools/c64_disk.py:load_address`'s docstring) -- but that value is a compile-time fossil the real
loader NEVER HONOURS. The BASIC stub instead supplies its own address per file via a `FI=` BASIC
variable, and that is where the real, non-page-aligned resident addresses come from.

Concretely, both titles' boot stub loads a file named `LIBRARY` to address **$2DC8** (decimal
11720) and immediately `SYS`s into it. $2DC8 is not page-aligned, which is exactly why the earlier
page-aligned sweep (`find_kernel.py`, tried every origin in $0200-$D000 step 256) never found it.
All ten previously-unexplained JSR/JMP targets fall inside LIBRARY's real span at that origin, in
BOTH titles, and (where the same call site is known in both titles) the code at the corresponding
offset is recognizably the same routine, shifted -- see the doc for the full evidence table.

This module provides:
  - `TOKENS`: the CBM BASIC V2 token table.
  - `detokenize(data)`: turns a raw BASIC PRG (link-listed lines, tokenized) into
    `[(line_number, text), ...]`.
  - `format_listing(lines)`: renders that back to a plain-text program listing.
  - `parse_loader_calls(lines)`: regex-scans a detokenized boot listing for the
    `N$="NAME":FI=ADDR:GOSUB 20000` load pattern this corpus's boot stubs use, plus any bare
    `SYS ADDR` calls, in program order.
  - `find_dispatch_table(data, org)`: locates and decodes LINKER's runtime overlay-name dispatch
    table (the "GEN/DUNGEON/COMBAT/INIT/COM.PREP/POST.COM/FINAL/CAMP" table LINKER indexes with
    the $7F11 "next program" flag) -- present verbatim in CoK's `LINKER` and, in a NUL-separated
    variant, near the tail of DoK's `LIBRARY`.

CLI:
    python tools/c64_boot.py --disk IMG.d64 --list BOOT           # detokenize a BASIC file
    python tools/c64_boot.py --disk IMG.d64 --loader BOOT         # summarize the load chain
    python tools/c64_boot.py --disk IMG.d64 --dispatch LINKER --org 0x2D00
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import c64_disk as c64  # noqa: E402

# --------------------------------------------------------------------------------------------
# CBM BASIC V2 tokens (the standard C64 KERNAL keyword table, $80-$CB, plus $FF = pi).
# --------------------------------------------------------------------------------------------

TOKENS: dict[int, str] = {
    0x80: "END", 0x81: "FOR", 0x82: "NEXT", 0x83: "DATA", 0x84: "INPUT#",
    0x85: "INPUT", 0x86: "DIM", 0x87: "READ", 0x88: "LET", 0x89: "GOTO",
    0x8A: "RUN", 0x8B: "IF", 0x8C: "RESTORE", 0x8D: "GOSUB", 0x8E: "RETURN",
    0x8F: "REM", 0x90: "STOP", 0x91: "ON", 0x92: "WAIT", 0x93: "LOAD",
    0x94: "SAVE", 0x95: "VERIFY", 0x96: "DEF", 0x97: "POKE", 0x98: "PRINT#",
    0x99: "PRINT", 0x9A: "CONT", 0x9B: "LIST", 0x9C: "CLR", 0x9D: "CMD",
    0x9E: "SYS", 0x9F: "OPEN", 0xA0: "CLOSE", 0xA1: "GET", 0xA2: "NEW",
    0xA3: "TAB(", 0xA4: "TO", 0xA5: "FN", 0xA6: "SPC(", 0xA7: "THEN",
    0xA8: "NOT", 0xA9: "STEP", 0xAA: "+", 0xAB: "-", 0xAC: "*", 0xAD: "/",
    0xAE: "^", 0xAF: "AND", 0xB0: "OR", 0xB1: ">", 0xB2: "=", 0xB3: "<",
    0xB4: "SGN", 0xB5: "INT", 0xB6: "ABS", 0xB7: "USR", 0xB8: "FRE",
    0xB9: "POS", 0xBA: "SQR", 0xBB: "RND", 0xBC: "LOG", 0xBD: "EXP",
    0xBE: "COS", 0xBF: "SIN", 0xC0: "TAN", 0xC1: "ATN", 0xC2: "PEEK",
    0xC3: "LEN", 0xC4: "STR$", 0xC5: "VAL", 0xC6: "ASC", 0xC7: "CHR$",
    0xC8: "LEFT$", 0xC9: "RIGHT$", 0xCA: "MID$", 0xCB: "GO", 0xFF: "π",
}


def _printable(b: int) -> str:
    return chr(b) if 32 <= b < 127 else f"<${b:02X}>"


def detokenize(data: bytes) -> list[tuple[int, str]]:
    """Detokenize a raw BASIC V2 PRG (as read straight off disk: 2-byte load address, then
    link-listed lines). Returns `[(line_number, source_text), ...]` in file order.

    CBM BASIC V2 on-disk line format: `link_lo link_hi lineno_lo lineno_hi <tokenized text> $00`,
    repeated until a line whose link word is $0000 (the program's own end marker). Bytes >= $80
    inside the text are token bytes; a `$22` (quote) byte starts a verbatim run copied through to
    the next quote or end-of-line, matching how the real BASIC parser treats REM/string literals
    (it does not tokenize keywords found inside quotes).
    """
    pos = 2  # skip the 2-byte load address; the file's own link chain does the rest
    lines: list[tuple[int, str]] = []
    while pos + 4 <= len(data):
        link = data[pos] | (data[pos + 1] << 8)
        lineno = data[pos + 2] | (data[pos + 3] << 8)
        pos += 4
        if link == 0:
            break
        out: list[str] = []
        while pos < len(data) and data[pos] != 0:
            b = data[pos]
            if b == 0x22:  # quoted string: copy verbatim, do not tokenize inside it
                out.append('"')
                pos += 1
                while pos < len(data) and data[pos] not in (0x22, 0x00):
                    out.append(_printable(data[pos]))
                    pos += 1
                if pos < len(data) and data[pos] == 0x22:
                    out.append('"')
                    pos += 1
                continue
            if b >= 0x80:
                out.append(TOKENS.get(b, f"<${b:02X}>"))
            else:
                out.append(_printable(b))
            pos += 1
        pos += 1  # skip the line's terminating NUL
        lines.append((lineno, "".join(out)))
    return lines


def format_listing(lines: list[tuple[int, str]]) -> str:
    return "\n".join(f"{ln} {text}" for ln, text in lines)


# --------------------------------------------------------------------------------------------
# Loader-call extraction: what does the boot program actually load, and where to?
# --------------------------------------------------------------------------------------------


@dataclass
class LoadCall:
    name: str
    address: int  # the FI value: the REAL runtime load address (the on-disk 2-byte header is not
    # honoured -- see module docstring). Not necessarily page-aligned.
    line: int


_LOAD_RE = re.compile(r'N\$\s*=\s*"([^"]*)"\s*:\s*FI\s*=\s*(\d+)\s*:\s*GOSUB\s*20000')
_SYS_RE = re.compile(r'SYS\s*(\d+)')


def parse_loader_calls(lines: list[tuple[int, str]]) -> list[LoadCall]:
    """Every `N$="NAME":FI=ADDR:GOSUB 20000` load, in program order.

    This is the pattern the "BIN LOAD" subroutine (BASIC line 20000 in both titles' boot stub)
    implements: SETLFS with secondary address 0 (so the file's own embedded load-address byte is
    IGNORED), SETNAM from N$, then LOAD with X/Y = FI. FI is therefore the file's real runtime
    load address, independent of -- and often different from -- the fossil header every file on
    this corpus's disks carries (see `tools/c64_disk.py:load_address`).
    """
    calls = []
    for lineno, text in lines:
        m = _LOAD_RE.search(text)
        if m:
            calls.append(LoadCall(name=m.group(1), address=int(m.group(2)), line=lineno))
    return calls


def parse_sys_calls(lines: list[tuple[int, str]]) -> list[tuple[int, int]]:
    """Every bare `SYS ADDR` (not inside the BIN LOAD/SAVE subroutines), as `(line, addr)`."""
    out = []
    for lineno, text in lines:
        if lineno >= 20000:  # the BIN LOAD/SAVE subroutine bodies use SYS internally for KERNAL
            continue  # calls (SETLFS/SETNAM/LOAD/SAVE) -- not a program entry point
        for m in _SYS_RE.finditer(text):
            out.append((lineno, int(m.group(1))))
    return out


# --------------------------------------------------------------------------------------------
# LINKER's runtime overlay dispatch table.
# --------------------------------------------------------------------------------------------
# LINKER (loaded to $2D00 by the boot stub, see the loader calls above) reads a "next program"
# index out of a global flag byte, looks up an entry in this table, and loads + JSR $0800s the
# named overlay in a loop. Two on-disk encodings were found, both decoded here:
#
#   CoK's LINKER embeds the table directly, as one unseparated ASCII blob:
#       "GENDUNGEONCOMBATINITCOM.PREPPOST.COMFINALCAMP"
#     followed by three parallel 10-byte tables: length, pointer-lo, pointer-hi (10 slots for 8
#     real names -- 2 slots are unused padding that alias an existing name's address).
#
#   DoK's LINKER is smaller and does not carry the table itself; the same table lives near the
#   tail of DoK's LIBRARY instead, NUL-separated:
#       "GEN\0DUNGEON\0COMBAT\0INIT\0COMPREP\0POSTCOM\0FINAL\0CAMP\0"
#     followed by the identical three-table layout.
#
# Both encodings self-check: pointer-hi is constant (the table's own page), and
# pointer-lo[i] - pointer-lo[0] must equal the cumulative sum of the preceding real lengths.

_UNSEP_ANCHOR = b"GENDUNGEON"
_NULSEP_ANCHOR = b"GEN\x00DUNGEON"
_NAMES_UNSEP = ["GEN", "DUNGEON", "COMBAT", "INIT", "COM.PREP", "POST.COM", "FINAL", "CAMP"]
_NAMES_NULSEP = ["GEN", "DUNGEON", "COMBAT", "INIT", "COMPREP", "POSTCOM", "FINAL", "CAMP"]


@dataclass
class DispatchEntry:
    index: int
    name: str
    length: int
    address: int  # absolute address of the name string itself, from the ptr-lo/ptr-hi tables


@dataclass
class DispatchTable:
    style: str  # "unsep" (CoK LINKER) or "nulsep" (DoK LIBRARY)
    blob_addr: int
    entries: list[DispatchEntry]  # 8 real names, padding slots dropped
    slot_count: int  # total table slots including padding (always 10 in the corpus so far)


def find_dispatch_table(data: bytes, org: int) -> DispatchTable | None:
    """Locate and decode the overlay dispatch table inside a file's body, given its real origin.

    `data` is the FULL file including its 2-byte on-disk load-address header (as read from disk);
    `org` is the file's REAL runtime address (see module docstring -- often not what the header
    says). Returns None if no anchor is found.
    """
    body = data[2:]
    idx = body.find(_UNSEP_ANCHOR)
    style = "unsep"
    names = _NAMES_UNSEP
    if idx < 0:
        idx = body.find(_NULSEP_ANCHOR)
        style = "nulsep"
        names = _NAMES_NULSEP
    if idx < 0:
        return None

    blob_addr = org + idx
    pos = idx
    real_lengths: list[int] = []  # name length only (matches the on-disk length table)
    real_strides: list[int] = []  # name length + any separator byte (address arithmetic)
    if style == "unsep":
        for name in names:
            if body[pos : pos + len(name)].decode("ascii", "replace") != name:
                return None
            pos += len(name)
            real_lengths.append(len(name))
            real_strides.append(len(name))
        table_start = pos
    else:
        for name in names:
            end = body.find(b"\x00", pos)
            if end < 0 or body[pos:end].decode("ascii", "replace") != name:
                return None
            real_lengths.append(end - pos)
            real_strides.append(end + 1 - pos)  # include the NUL separator
            pos = end + 1
        table_start = pos

    # Three parallel tables follow: length, pointer-lo, pointer-hi. The corpus so far always uses
    # 10 slots (8 real names + 2 padding slots reusing an existing address) -- read 10 but accept
    # fewer if the file is too short, since a shorter title build is plausible and should degrade
    # to "table truncated" rather than crash.
    slot_count = 10
    len_tab = body[table_start : table_start + slot_count]
    lo_tab = body[table_start + slot_count : table_start + 2 * slot_count]
    hi_tab = body[table_start + 2 * slot_count : table_start + 3 * slot_count]
    if len(len_tab) < slot_count or len(lo_tab) < slot_count or len(hi_tab) < slot_count:
        return None

    entries: list[DispatchEntry] = []
    real_i = 0
    for i in range(slot_count):
        addr = (hi_tab[i] << 8) | lo_tab[i]
        # A real (non-padding) slot's address must equal blob_addr + cumulative stride so far, AND
        # its length-table entry must match that name's own length -- address alone is not enough
        # because this corpus's padding slots deliberately ALIAS a real name's start address (see
        # the CoK/DoK worked examples in the module docstring), and only the length field
        # distinguishes the real slot from the padding slot that shares its address.
        if real_i >= len(names):
            continue
        expected = blob_addr + sum(real_strides[:real_i])
        if addr == expected and len_tab[i] == real_lengths[real_i]:
            entries.append(
                DispatchEntry(index=i, name=names[real_i], length=len_tab[i], address=addr)
            )
            real_i += 1
    return DispatchTable(style=style, blob_addr=blob_addr, entries=entries, slot_count=slot_count)


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--disk", required=True, help=".d64/.g64 image")
    ap.add_argument("--list", metavar="FILE", help="detokenize a BASIC program file")
    ap.add_argument("--loader", metavar="FILE", help="summarize a boot program's load chain")
    ap.add_argument("--dispatch", metavar="FILE", help="decode a LINKER/LIBRARY dispatch table")
    ap.add_argument("--org", type=lambda s: int(s, 0), default=0x2D00,
                     help="real origin for --dispatch (default 0x2D00, LINKER's)")
    args = ap.parse_args(argv)

    disk = c64.read_image(args.disk)
    entries_by_name = {e.name: e for e in c64.directory(disk)}

    def read(name: str) -> bytes:
        e = entries_by_name.get(name)
        if e is None:
            raise SystemExit(f"no such file on disk: {name!r}")
        data, problem = c64.read_file_checked(disk, e)
        if problem:
            print(f"warning: {name}: {problem}", file=sys.stderr)
        return data

    if args.list:
        print(format_listing(detokenize(read(args.list))))
    if args.loader:
        lines = detokenize(read(args.loader))
        for call in parse_loader_calls(lines):
            print(f"line {call.line}: LOAD {call.name!r} -> ${call.address:04X} ({call.address})")
        for lineno, addr in parse_sys_calls(lines):
            print(f"line {lineno}: SYS ${addr:04X} ({addr})")
    if args.dispatch:
        table = find_dispatch_table(read(args.dispatch), args.org)
        if table is None:
            print("no dispatch table found", file=sys.stderr)
            return 1
        print(f"style={table.style} blob@${table.blob_addr:04X} slots={table.slot_count}")
        for e in table.entries:
            print(f"  [{e.index}] {e.name:<10} len={e.length}  @${e.address:04X}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
