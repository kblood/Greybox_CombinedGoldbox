#!/usr/bin/env python3
"""C1.8/C1.9 follow-up: the ITEMNAMES resource-stem catalog and its digit-patching loader.

This module follows the lead recorded in docs/engine/BUILD-QUEUE.md's C1.8 round-3 box as "the
unfollowed lead worth having": `ITEMNAMES` ships a catalog of resource-family name STEMS
(`GDRIVE00`, `SQRPACI00`, `GEO00`, ... `ITEMFILE00`), each ending in a literal ASCII `00`
placeholder that some routine patches with two hex-ASCII digits before the resulting name is
handed to the KERNAL as a filename. See docs/engine/research/c64-resource-stems.md for the full
narrative; this module is the reusable, re-derivable evidence behind that writeup.

What this module establishes, from raw bytes, re-derivable at any time (nothing here is a
hand-copied one-off number):

1. `parse_stem_table()` -- the catalog itself. Two on-disk SHAPES are used across the corpus:
   CoK and Buck Rogers concatenate the stems with NO separator, as the literal tail of the
   ITEMNAMES file (ends exactly at EOF); DoK and Secret of the Silver Blades NUL-terminate each
   stem individually, starting right after the last ordinary (NUL-terminated) UI/item-name
   string. CoAB, Gateway and Pool of Radiance have **no such catalog in ITEMNAMES at all** --
   their equivalent stems (confirmed present via `find_gdrive00_files_containing`) live inside
   their own `LIBRARY` file instead, not traced further by this module (out of this round's scope).

2. `HEX_ASCII_IDIOM` / `find_hex_ascii_routine()` -- the actual digit-patch mechanism. A 10-byte
   nibble-to-uppercase-hex-ASCII 6502 routine (`CLC;ADC #$30;CMP #$3A;BCC +2;ADC #$06;RTS`) is
   byte-identical and present EXACTLY ONCE in the `LIBRARY` resident-kernel file of all 7 titles
   in the corpus (verified in `test_c64_resources.py`; a 10-byte exact match at a stable, callable
   position in ~7KB of hand-written machine code, in all 7 independently-assembled titles, is not
   plausible by chance -- see the test's own null). This is the shared prize the C1.8 lead asked
   for: it is not GDRIVE-specific, it is the resource system's generic hex-digit encoder, called
   twice per patch (once per nibble) by a generic "load resource family X, id A" routine that
   lives a short distance before it in LIBRARY, in both CoK and DoK (independently pinned by
   disassembly -- CoK entry `$413F`/`$4142`, DoK entry `$4080`/`$4083`; see LOADER_* below).

3. `resolve_family()` -- the loader's own X (call-site "resource kind") -> Y (stem index) ->
   (pointer, length) lookup chain, read directly out of LIBRARY's bytes for CoK and DoK. The
   length table this exposes was cross-checked against `parse_stem_table()`'s independently
   -derived (from ITEMNAMES's own string layout) stem lengths and matches exactly, 20/20 (CoK)
   and 21/21 (DoK) -- two independent readings of "how long is each stem" (one from string
   boundaries, one from a machine-code lookup table) agreeing exactly is the strongest evidence
   in this module.

4. `find_loader_calls()` -- an aligned (instruction-boundary-respecting, NOT a raw byte scan; see
   `c64_kernel.find_callers`'s own docstring for why that distinction matters) 6502 decoder that
   finds every real `JSR`/`JMP` to the loader's two entry points in a given overlay file, and
   resolves the immediately-preceding `LDX #imm` / `LDA #imm` when present. Applied to every
   $0800-slot overlay file in both CoK and DoK, this is how the actual GDRIVE (family index X=0)
   call sites were found -- see `COK_GDRIVE_CALL_SITES` / `DOK_GDRIVE_CALL_SITES` below, and
   `docs/engine/research/c64-resource-stems.md` for the full disassembly narrative each site.

External source images are read-only and never vendored (see CLAUDE.md); every function that
touches D:\\...\\Goldbox degrades to raising `c64_kernel.SourceUnavailable` so callers can skip
cleanly, matching the rest of the C64 tooling.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disasm as da  # noqa: E402
import c64_disk as c64  # noqa: E402
import c64_kernel as k  # noqa: E402

SourceUnavailable = k.SourceUnavailable

# ---------------------------------------------------------------------------------------------
# 1. The ITEMNAMES resource-stem catalog
# ---------------------------------------------------------------------------------------------

# The 20 CoK / 21 DoK stem names, in on-disk table order (index == the loader's Y index -- see
# resolve_family()). Recorded here as the independently-known-correct answer that
# parse_stem_table() is checked against; NOT used to derive parse_stem_table()'s own output.
COK_STEMS_EXPECTED = [
    "GDRIVE00", "SQRPACI00", "GEO00", "SECSET00", "SQRDATA00", "PIC00", "SPELLN00", "SPELLE00",
    "ECL00", "WALLS00", "SPRITE00", "WALLSET00", "WALLDEF00", "ANIMATE00", "MON00", "BODY00",
    "HEAD00", "CHARPIC00", "COMPIC00", "ITEMFILE00",
]
DOK_STEMS_EXPECTED = [
    "GDRIVE00", "SQRPACI00", "GEO00", "SECSET00", "SQRDATA00", "PIC00", "SPELLN00", "SPELLE00",
    "ECL00", "WALLSET00", "SPRITE00", "WALLSET00", "WALLDEF00", "ANIMATE00", "MON00", "BODY00",
    "HEAD00", "CHARPIC00", "COMPIC00", "ITEMFILE00", "CODE00",
]
# Note DoK's real, on-disk difference from CoK: slot 9 is "WALLSET00" (9 chars) not CoK's
# "WALLS00" (7 chars) -- WALLSET the stem appears TWICE in DoK's table (slots 9 and 11) -- and
# DoK has a 21st stem, "CODE00", that CoK's table does not have at all.


def _itemnames_side1(title: str) -> bytes:
    """Raw ITEMNAMES body (2-byte load address stripped) from `title`'s side 1. title is
    'cok' or 'dok' (the two titles c64_kernel.py already has a TITLE_DIRS entry for)."""
    img = k.load_side1(title)
    return k.get_file(img, "ITEMNAMES")


def parse_stem_table(body: bytes) -> list[str]:
    """Recover the ordered list of resource-family stems (each ending in a literal ASCII '00'
    placeholder) from an ITEMNAMES body, auto-detecting which of the two on-disk shapes it uses.

    Shape A (CoK, Buck Rogers): the stems are concatenated with NO separator and form the
    LITERAL TAIL of the file -- the run starting at the last NUL byte's successor, ending at EOF.
    Recovered by walking that tail and repeatedly consuming "letters/digits until two more
    consecutive ASCII digits" (i.e. a run of the form <word><1-2 digits>) -- deliberately not by
    matching a fixed dictionary of expected stem names, so this returns real evidence rather than
    replaying what we already knew.

    Shape B (DoK, Secret of the Silver Blades): each stem is individually NUL-terminated, in the
    same tail region (right after the last ordinary UI-string). Recovered by simply NUL-splitting
    that tail.

    Returns [] if neither shape is found (CoAB / Gateway / Pool of Radiance -- see module
    docstring point 1).
    """
    idx = body.find(b"GDRIVE00")
    if idx < 0:
        return []
    # Shape B: is GDRIVE00 immediately followed by a NUL?
    if idx + 8 < len(body) and body[idx + 8] == 0x00:
        tail = body[idx:]
        parts = tail.split(b"\x00")
        stems = []
        for p in parts:
            if not p:
                continue
            if not _looks_like_stem(p):
                break
            stems.append(p.decode("ascii"))
        return stems
    # Shape A: concatenated with no separator, running to EOF.
    tail = body[idx:]
    return _split_concatenated_stems(tail)


def _looks_like_stem(word: bytes) -> bool:
    """A stem is letters followed by exactly 2 ASCII digits, e.g. b'GDRIVE00', b'GEO00'."""
    if len(word) < 3:
        return False
    if not word[-2:].isdigit():
        return False
    return word[:-2].isalpha()


def _split_concatenated_stems(tail: bytes) -> list[str]:
    """Split a no-separator run of <LETTERS><2 digits><LETTERS><2 digits>... stems.

    Walks forward consuming one run of ASCII letters then exactly 2 ASCII digits per stem; stops
    (returning what it has) at the first position that doesn't fit that shape, so a wrong offset
    degrades into a short, visibly-incomplete list rather than a silently-wrong one.
    """
    stems = []
    i = 0
    n = len(tail)
    while i < n:
        j = i
        while j < n and 65 <= tail[j] <= 90:  # 'A'-'Z'
            j += 1
        if j == i:
            break
        if j + 2 > n or not (48 <= tail[j] <= 57 and 48 <= tail[j + 1] <= 57):
            break
        stems.append(tail[i:j + 2].decode("ascii"))
        i = j + 2
    return stems


def stem_lengths(stems: list[str]) -> list[int]:
    return [len(s) for s in stems]


def cok_stems() -> list[str]:
    return parse_stem_table(_itemnames_side1("cok"))


def dok_stems() -> list[str]:
    return parse_stem_table(_itemnames_side1("dok"))


# ---------------------------------------------------------------------------------------------
# 2. The digit-patch mechanism: hex-nibble -> uppercase-ASCII conversion
# ---------------------------------------------------------------------------------------------

# CLC ; ADC #$30 ; CMP #$3A ; BCC +2 ; ADC #$06 ; RTS  -- 10 bytes, found byte-identical and
# exactly once in LIBRARY in all 7 titles (test_hex_idiom_present_in_all_seven_titles).
HEX_ASCII_IDIOM = bytes.fromhex("1869" "30C9" "3A90" "0269" "0660")


def find_hex_ascii_routine(library_body: bytes) -> int | None:
    """Byte offset of HEX_ASCII_IDIOM within a LIBRARY body, or None if absent."""
    idx = library_body.find(HEX_ASCII_IDIOM)
    return idx if idx >= 0 else None


def hex_nibble_to_ascii_reference(nibble: int) -> int:
    """Pure-Python re-implementation of the 6502 routine's semantics (input masked to 4 bits).

    A = (nibble & 0xF) + 0x30 ; if A >= 0x3A: A += 6 (the routine relies on CMP's carry-out being
    consumed by the following ADC, which is why 10-15 lands on 'A'-'F' and not '@'-'E' -- see the
    module docstring / research doc for the full carry trace). Returns an ASCII code point.
    """
    n = nibble & 0x0F
    a = (n + 0x30) & 0xFF
    if a >= 0x3A:
        a = (a + 0x07) & 0xFF  # +6 for ADC, +1 for the carry CMP left set
    return a


# ---------------------------------------------------------------------------------------------
# 3. The loader's X -> Y -> (pointer, length) lookup chain -- proven addresses, CoK and DoK
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class LoaderConstants:
    length_table_addr: int   # $40C7,Y (CoK) / $4002,Y (DoK) -- stem length, indexed by Y
    index_table_addr: int    # $4126,X (CoK) / $4066,X (DoK) -- call-site X -> stem index Y
    loader_full_entry: int   # entry that also loads A from the per-family $7F13,X cache slot
    loader_skip_entry: int   # entry used when the caller has already set A itself
    hexconv_addr: int        # the HEX_ASCII_IDIOM subroutine's own JSR target address
    stem_count: int          # real (non-garbage) table length, established by parse_stem_table()


COK_LOADER = LoaderConstants(
    length_table_addr=0x40C7, index_table_addr=0x4126,
    loader_full_entry=0x413F, loader_skip_entry=0x4142,
    hexconv_addr=0x4809, stem_count=20,
)
DOK_LOADER = LoaderConstants(
    length_table_addr=0x4002, index_table_addr=0x4066,
    loader_full_entry=0x4080, loader_skip_entry=0x4083,
    hexconv_addr=0x4749, stem_count=21,
)
LOADER_CONSTANTS = {"cok": COK_LOADER, "dok": DOK_LOADER}


def read_table(library_body: bytes, addr: int, count: int) -> list[int]:
    """`count` raw bytes of LIBRARY's body at runtime address `addr` (org = KERNEL_ORIGIN)."""
    off = addr - k.KERNEL_ORIGIN
    return list(library_body[off: off + count])


def length_table(title: str, library_body: bytes) -> list[int]:
    c = LOADER_CONSTANTS[title]
    return read_table(library_body, c.length_table_addr, c.stem_count)


def index_table(title: str, library_body: bytes, count: int = 32) -> list[int]:
    """The full raw X->Y table, including the trailing garbage bytes past the real table (the
    table has no explicit length prefix; `count` defaults wide so callers can see the "falls off
    the end into unrelated data" boundary for themselves, same as the research doc does)."""
    c = LOADER_CONSTANTS[title]
    return read_table(library_body, c.index_table_addr, count)


def resolve_family(title: str, x_index: int, library_body: bytes | None = None) -> str | None:
    """The stem name (e.g. 'GDRIVE00') a call-site index X resolves to for `title`, by walking
    the real index table -> stem table chain. None if X falls outside the real table (garbage
    region) or the resolved Y is out of range."""
    if library_body is None:
        library_body = k.kernel_body(title)
    c = LOADER_CONSTANTS[title]
    idx_tab = index_table(title, library_body, count=max(c.stem_count + 6, 32))
    if x_index >= len(idx_tab):
        return None
    y = idx_tab[x_index]
    stems = parse_stem_table(_itemnames_side1(title))
    if y >= len(stems):
        return None
    return stems[y]


# ---------------------------------------------------------------------------------------------
# 4. Finding real (instruction-aligned) calls to the loader's entry points
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class LoaderCall:
    file: str
    addr: int          # address of the JSR/JMP opcode itself
    target: int         # which loader entry point it calls
    x_imm: int | None   # resolved X immediate (family/call-site index), or None if not found
    x_back: int | None  # how many instructions before the call the LDX #imm was
    a_imm: int | None   # resolved A immediate (the id to hex-encode), or None (carried/computed)
    a_back: int | None


def _aligned_decode(body: bytes, org: int):
    """(address, mnemonic, mode, (lo, hi)) for every instruction boundary from body offset 0,
    unknown opcodes falling back to a single-byte skip (same degrade-visibly policy as
    c64_disasm.disassemble). This is deliberately NOT c64_kernel.find_callers -- that function
    matches ANY byte offset (see its own corrected docstring); this one only ever reports a call
    that a real instruction-boundary walk from a file's own start actually produced.
    """
    pc = 0
    n = len(body)
    out = []
    while pc < n:
        op = body[pc]
        entry = da.OPCODES.get(op)
        if entry is None:
            out.append((org + pc, None, None, None))
            pc += 1
            continue
        mnem, mode = entry
        size = da.SIZE[mode]
        if pc + size > n:
            out.append((org + pc, None, None, None))
            pc += 1
            continue
        lo = body[pc + 1] if size > 1 else 0
        hi = body[pc + 2] if size > 2 else 0
        out.append((org + pc, mnem, mode, (lo, hi)))
        pc += size
    return out


def find_loader_calls(name: str, body: bytes, org: int, entries: tuple[int, ...]) -> list[LoaderCall]:
    """Every real (aligned) JSR/JMP to an address in `entries`, with the nearest preceding
    LDX #imm / LDA #imm resolved (within 8 instructions, stopping early at any JSR/JMP/RTS,
    since that is a control-flow boundary the values can't be assumed to survive across)."""
    lines = _aligned_decode(body, org)
    out: list[LoaderCall] = []
    for i, (addr, mnem, mode, opnd) in enumerate(lines):
        if mnem not in ("JSR", "JMP") or mode != da.ABS:
            continue
        target = opnd[0] | (opnd[1] << 8)
        if target not in entries:
            continue
        x_imm = x_back = a_imm = a_back = None
        for back in range(1, 9):
            j = i - back
            if j < 0:
                break
            _, bmnem, bmode, bopnd = lines[j]
            if bmnem == "LDX" and bmode == da.IMM and x_imm is None:
                x_imm, x_back = bopnd[0], back
            if bmnem == "LDA" and bmode == da.IMM and a_imm is None:
                a_imm, a_back = bopnd[0], back
            if bmnem in ("JSR", "JMP", "RTS"):
                break
        out.append(LoaderCall(name, addr, target, x_imm, x_back, a_imm, a_back))
    return out


# Which overlay files were actually searched this round (the standard $0800 slot; LIBRARY itself
# is excluded here -- its own internal self-calls at the wrapper's skip-entry are not "callers"
# in the resource-request sense, see the research doc).
COK_CANDIDATE_FILES = [
    "GEN", "CAMP", "DUNGEON", "COMBAT", "COMBAT2", "INIT", "POST.COM", "COM.PREP",
    "ECL65", "SPELLN64",
]
DOK_CANDIDATE_FILES = [
    "GEN", "CAMP", "DUNGEON", "COMBAT", "COMBAT2", "INIT", "POSTCOM", "COMPREP",
    "CODE00", "CODE01",
]

# CoK's DUNGEON carries its own two 6-byte local stubs ("PHA;JSR $27D3;PLA;JMP <entry>" -- $27D3
# is a shared helper, unrelated to the resource system) that tail-jump into LIBRARY's two loader
# entries rather than calling them directly. A caller-immediate search restricted to the direct
# entry addresses misses both of DUNGEON's own hardcoded GDRIVE01 requests ($0A5F/$12AF, both
# X=0/A=1) because they go through these stubs. $1179/$1181 are DUNGEON-local addresses (inside
# its own $0800-slot body) and are deliberately only ever added when scanning DUNGEON itself.
COK_DUNGEON_WRAPPER_ENTRIES = (0x1179, 0x1181)


def all_loader_calls(title: str) -> list[LoaderCall]:
    c = LOADER_CONSTANTS[title]
    bodies = k.all_bodies(title)
    candidates = COK_CANDIDATE_FILES if title == "cok" else DOK_CANDIDATE_FILES
    entries = (c.loader_full_entry, c.loader_skip_entry)
    out: list[LoaderCall] = []
    for name in candidates:
        if name not in bodies:
            continue
        file_entries = entries
        if title == "cok" and name == "DUNGEON":
            file_entries = entries + COK_DUNGEON_WRAPPER_ENTRIES
        out.extend(find_loader_calls(name, bodies[name], 0x0800, file_entries))
    return out


def gdrive_calls(title: str) -> list[LoaderCall]:
    """Every found loader call whose resolved X immediate is 0 (the GDRIVE family slot, both
    titles -- index_table(title)[0] == 0 in both, i.e. Y=0 == GDRIVE00, the first stem)."""
    return [c for c in all_loader_calls(title) if c.x_imm == 0]


# ---------------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("stems", help="print the parsed ITEMNAMES stem table for a title")
    p.add_argument("--title", choices=("cok", "dok"), required=True)

    p = sub.add_parser("gdrive", help="print every found GDRIVE (X=0) loader call site")
    p.add_argument("--title", choices=("cok", "dok"), required=True)

    p = sub.add_parser("calls", help="print every found loader call site (all families)")
    p.add_argument("--title", choices=("cok", "dok"), required=True)

    a = ap.parse_args(argv)
    try:
        if a.cmd == "stems":
            stems = parse_stem_table(_itemnames_side1(a.title))
            for i, s in enumerate(stems):
                print(f"  [{i:2d}] {s}")
        elif a.cmd == "gdrive":
            for call in gdrive_calls(a.title):
                a_desc = f"#${call.a_imm:02X}" if call.a_imm is not None else "carried"
                print(f"  {call.file:<10} ${call.addr:04X} -> ${call.target:04X}  A={a_desc}")
        elif a.cmd == "calls":
            for call in all_loader_calls(a.title):
                x_desc = f"X=#${call.x_imm:02X}" if call.x_imm is not None else "X=?"
                a_desc = f"A=#${call.a_imm:02X}" if call.a_imm is not None else "A=carried"
                fam = resolve_family(a.title, call.x_imm) if call.x_imm is not None else "?"
                print(f"  {call.file:<10} ${call.addr:04X} -> ${call.target:04X}  {x_desc} {a_desc}  ({fam})")
    except SourceUnavailable as exc:
        print(f"skipped: {exc}")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
