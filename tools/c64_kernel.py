#!/usr/bin/env python3
"""C1.9a: locate the C64 Gold Box "resident kernel" -- the shared 6502 routines that answer
JSR calls from $2E00-$3C00 even though no directory entry claims to live there.

Prior rounds collected ten call-site addresses (from GDRIVE00/GDRIVE02/MON name-scrub calls)
and ruled out two hypotheses: a hidden/orphaned disk block (no orphaned blocks on either
title's boot side), and an ordinary file resident *unmodified* at a page-aligned shifted
origin (best fit only 3 of 10 targets, disagreeing between titles). This module finds the
answer: it is neither. Two files -- **LIBRARY** and **LINKER** -- carry PRG headers claiming
load address $4000 (the corpus-wide staging-buffer placeholder, same as every ordinary
overlay) but are placed by the game's own custom loader at their *true*, un-page-aligned
runtime addresses: LINKER at $2D00, and the first ~4.6KB of LIBRARY (the kernel proper) at
$2DC8 -- identically in both Champions of Krynn and Death Knights of Krynn. See
docs/engine/research/c64-resident-kernel.md for the full writeup and evidence chain.

This module provides the reusable pieces:
  - call_census()          unbiased JSR fan-in census (which addresses are called from many
                            independently-loaded, mutually-exclusive overlay files -- the
                            fingerprint of a resident routine, found without assuming any
                            hand-me-down target list)
  - sweep_origin()          byte-exact (NOT page-aligned) content-matching sweep: for one
                            file's body, find the origin that explains the most targets
  - best_hosts()            run sweep_origin() over every side-1 file, ranked
  - self_consistency()      count how many of a file's OWN absolute JSR/JMP operands land
                            inside its own claimed origin range -- the strongest, least
                            foolable origin evidence (type (a) in the brief), used to pin
                            LINKER's origin independently of any target list at all
  - kernel_body() / linker_body()   fetch the proven files' raw bytes for a title

C1.9c (mapping LIBRARY's interior, this round) adds:
  - all_bodies()            like read_bodies() but unions EVERY side's directory, not just
                             side 1 -- most overlay-family callers (ECLnn, MONnn, GEOnn,
                             SPELLnn, CODEnn, WALLSETnn, ...) live on sides 2-6, so a
                             side-1-only census undercounts real fan-in
  - library_jump_table()    decode LIBRARY's own leading run of `JMP abs` slots (32 in CoK,
                             3 in DoK) -- slot 0 is the literal target of the BASIC boot
                             stub's `SYS <KERNEL_ORIGIN>` (see stop_prg_diff below)
  - stop_prg_diff()          byte-compare STOP.PRG against LIBRARY's own slot-0 target: they
                             are the same 13-byte STOP-key-vector-install template, differing
                             only in the 2-byte target address operand

C1.9d (closing the four loose ends the C1.9c round left open) adds:
  - find_abs_writes()        every (offset, mnemonic) where some file's body contains an
                              absolute STA/STX/STY naming a given target address -- the write
                              side of find_callers()'s read side, used to census every site
                              in the corpus that assigns LINKER's $7F11 dispatch index
  - immediate_before()       resolve the literal value a store writes, when it's loaded by an
                              immediate LDA/LDX/LDY directly before it (the common case here)
  - dispatch_padding_slot_names()  decode ALL 10 raw dispatch-table slots (not just the 8
                              "real" ones), including what the two PADDING slots (index 6/7,
                              which alias FINAL's own address with the wrong length) actually
                              spell out
  - self_consistency_excluding()   self_consistency(), but ignoring any operand landing in a
                              caller-supplied exclusion window -- needed because LIBRARY's own
                              huge, heavily-called span drowns out a candidate file's true
                              local-jump signal for any origin whose window happens to overlap
                              it (the confound that made DoK's CODE00/01/03 hard to place)

See docs/engine/research/c64-resident-kernel.md for the full writeup of what this round
found inside LIBRARY, and its C1.9d section for the four loose-end closures above.

Out-of-sample extension (2026-09-10): `TITLE_DIRS` now also maps **secret** (Secret of the
Silver Blades) and **gateway** (Gateway to the Savage Frontier), added to test a hypothesis
formed only on CoK/DoK -- that a DOS ECL `op_call` redraw operand word equals its own title's
C64 LIBRARY `JMP $0803` trampoline SLOT ADDRESS. The prediction held on both
(`overlay_trampoline_slot()`: Secret slot 1 = $2DCB, Gateway slot 24 = $2E10, matching the
$2DCB / $2E10 those two titles' DOS ECL blocks actually use). Two caveats travel with that:

  * `KERNEL_ORIGIN` ($2DC8) is grounded per title, not assumed. CoK, DoK **and Secret** each
    carry a tokenized-BASIC boot stub whose line 41 reads `SYS 11720` = $2DC8 (see
    `c64_boot.parse_sys_calls`). **Gateway does not** -- its boot file is a `SYS 2059` machine
    -language loader with no BASIC listing -- so Gateway's origin rests on two weaker but
    independent signals: `self_consistency(LIBRARY, 0x2DC8)` = 422/540 (78.1%) versus 189/540
    (35.0%) at the PRG header's own $4000 placeholder and <2% at $0800/$8000/$C000; and nine of
    its jump-table TARGET operands ($2E2B, $2EAB, $2ECF, $2EA5, $2F12, $2F46, $2FA2, $2F9D,
    $2F7E) being the same absolute addresses CoK's table holds, which only decode as those
    addresses if the table sits at $2DC8.
  * `$0803` is GENERIC overlay dispatch -- "jump 3 bytes into whatever overlay is staged at
    $0800" -- so a match settles WHICH SLOT the operand names, never what that slot's currently
    staged overlay does. It is not evidence for the semantic label "redraw dungeon view", and a
    32-slot table (CoK/Gateway) versus a 3-slot one (DoK/Secret) is a differently-built table,
    not 29 deleted entries.

External source images are read-only and never vendored (see CLAUDE.md); every function
here degrades to returning None / raising FileNotFoundError if D:\\...\\Goldbox is absent,
so callers (see test_c64_kernel.py) can skip cleanly.

CLI:
    python tools/c64_kernel.py census --title cok
    python tools/c64_kernel.py sweep  --title dok
    python tools/c64_kernel.py selfcheck --title cok --file LINKER --org 0x2D00
    python tools/c64_kernel.py show   --title cok --addr 0x2E9A
    python tools/c64_kernel.py fullcensus --title cok --top 40
    python tools/c64_kernel.py jumptable  --title dok
    python tools/c64_kernel.py trampoline --title gateway
    python tools/c64_kernel.py stopcheck  --title cok
"""

from __future__ import annotations

import argparse
import collections
import glob
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import c64_disk as c64  # noqa: E402
import c64_disasm as da  # noqa: E402

# NMOS 6502 "routine ender" opcodes: an entry point is expected to be preceded by one of
# these, since real code sequences one routine to the next across an unconditional exit.
ENDERS = {0x60, 0x4C, 0x40, 0x6C}  # RTS, JMP abs, RTI, JMP ind

# External source roots -- read-only, never vendored. Glob non-recursively so a title's
# superseded/ subfolder (deliberately-damaged alternate dumps) is never picked up.
GOLDBOX_ROOT = r"D:\Games\Emulator\C64\Goldbox"
TITLE_DIRS = {
    "cok": os.path.join(GOLDBOX_ROOT, "Champions of Krynn"),
    "dok": os.path.join(GOLDBOX_ROOT, "Death Knights of Krynn"),
    # Added 2026-09-10 for the H1 out-of-sample test (see the "Out-of-sample" note in the
    # module docstring). Both hold LIBRARY on their own side 1, exactly as CoK/DoK do.
    "secret": os.path.join(GOLDBOX_ROOT, "Secret of the Silver Blades"),
    "gateway": os.path.join(GOLDBOX_ROOT, "Gateway to the Savage Frontier"),
}

# The overlay-call trampoline's fixed target: `JMP $0803` = "jump 3 bytes into whatever overlay
# is currently staged at $0800". Exactly ONE slot of each title's LIBRARY jump table carries it.
OVERLAY_TRAMPOLINE_TARGET = 0x0803

# Six of the seven C64 titles name their images `... - Side 1.D64` (UPPERCASE); only Buck Rogers
# uses lowercase. `glob("*.d64")` happens to match both on Windows (fnmatch normcases the
# pattern) but NOT on a case-sensitive filesystem, so the extension is matched explicitly here
# instead -- CLAUDE.md records a case-sensitive glob having already reported six of seven titles
# as missing once. The side match is likewise a regex rather than an `in` test.
_SIDE1_RE = re.compile(r"side[ _-]*0*1(?!\d)", re.IGNORECASE)


def _d64_paths(d: str) -> list[str]:
    """Every `.d64` image directly in `d`, case-insensitively, sorted. Non-recursive on purpose:
    a title's `superseded/` subfolder holds deliberately-damaged alternate dumps (CLAUDE.md)."""
    return sorted(
        p for p in glob.glob(os.path.join(d, "*"))
        if os.path.isfile(p) and os.path.splitext(p)[1].lower() == ".d64"
    )

# This round's proven result (see docs/engine/research/c64-resident-kernel.md). Both are
# identical across titles -- the strongest single fact this investigation produced.
KERNEL_ORIGIN = 0x2DC8   # LIBRARY body offset 0, in both CoK and DoK
LINKER_ORIGIN = 0x2D00   # LINKER body offset 0, in both CoK and DoK


class SourceUnavailable(RuntimeError):
    """Raised when the external D:\\...\\Goldbox corpus is not present on this machine."""


def side1_path(title: str) -> str:
    d = TITLE_DIRS[title]
    if not os.path.isdir(d):
        raise SourceUnavailable(f"external source directory not found: {d}")
    matches = [p for p in _d64_paths(d) if _SIDE1_RE.search(os.path.basename(p))]
    if not matches:
        raise SourceUnavailable(f"no 'Side 1' .d64 found in {d}")
    return matches[0]


def load_side1(title: str) -> "c64.Disk":
    return c64.read_image(side1_path(title))


def all_side_paths(title: str) -> list[str]:
    """Every .d64 for `title` (all sides + savedisk, if any), sorted by filename."""
    d = TITLE_DIRS[title]
    if not os.path.isdir(d):
        raise SourceUnavailable(f"external source directory not found: {d}")
    paths = _d64_paths(d)
    if not paths:
        raise SourceUnavailable(f"no .d64 images found in {d}")
    return paths


def all_bodies(title: str) -> dict[str, bytes]:
    """name -> raw body bytes (2-byte PRG load address stripped), unioned across EVERY side
    of `title` (not just side 1). Only used for the C1.9c inbound-call census: a routine's
    callers are not all on the boot side (most overlay-family files -- ECLnn, MONnn, GEOnn,
    SPELLnn, CODEnn, WALLSETnn, ... -- are scattered across sides 2-6). First occurrence of a
    given filename wins if the same name somehow appears on more than one side (it does not,
    in this corpus, but the tie-break is deterministic rather than order-dependent surprise).
    """
    out: dict[str, bytes] = {}
    for p in all_side_paths(title):
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
    return out


def read_bodies(img: "c64.Disk") -> dict[str, bytes]:
    """name -> raw body bytes (2-byte PRG load address stripped) for every directory entry
    that reads back cleanly. A handful of non-file directory entries (disk-name banners on
    DoK) fail to read as PRGs and are skipped, not raised."""
    out: dict[str, bytes] = {}
    for e in c64.directory(img):
        try:
            data = c64.read_file(img, e)
        except Exception:
            continue
        if len(data) < 3:
            continue
        out[e.name] = data[2:]
    return out


def get_file(img: "c64.Disk", name: str) -> bytes:
    for e in c64.directory(img):
        if e.name == name:
            return c64.read_file(img, e)[2:]
    raise KeyError(name)


def kernel_body(title: str) -> bytes:
    """LIBRARY's raw body for `title`. body[0] is address KERNEL_ORIGIN at runtime."""
    return get_file(load_side1(title), "LIBRARY")


def linker_body(title: str) -> bytes:
    """LINKER's raw body for `title`. body[0] is address LINKER_ORIGIN at runtime."""
    return get_file(load_side1(title), "LINKER")


def call_census(bodies: dict[str, bytes], lo: int = 0x2000, hi: int = 0x4000,
                 fanin_min: int = 4) -> dict[int, list[str]]:
    """addr -> sorted file names containing a JSR ($20, absolute) to addr, restricted to
    addr in [lo, hi) and requiring at least `fanin_min` distinct calling files.

    This is the UNBIASED discovery step: it makes no assumption about which addresses matter,
    only that a routine called from many independently-loaded, mutually-exclusive $0800-slot
    overlay files cannot itself live inside any single one of them. Compare against
    sweep_origin(), which then explains WHERE those addresses' code actually lives on disk.
    """
    callers: dict[int, set[str]] = collections.defaultdict(set)
    for name, body in bodies.items():
        for i in range(len(body) - 2):
            if body[i] == 0x20:  # JSR abs
                addr = body[i + 1] | (body[i + 2] << 8)
                if lo <= addr < hi:
                    callers[addr].add(name)
    return {addr: sorted(files) for addr, files in callers.items() if len(files) >= fanin_min}


def find_callers(bodies: dict[str, bytes], targets: list[int]) -> dict[int, list[tuple[str, int]]]:
    """For each address in `targets`, every (file, body_offset) whose bytes name it as the
    operand of an absolute-mode opcode -- the per-target detail behind call_census()'s tallies.

    **Read this before quoting a result as a "caller" (corrected 2026-08-12).** Two earlier
    descriptions of this function, here and in the C64 research docs, were wrong in ways that
    propagated into published claims:

    - **It is not a JSR search.** `c64_disasm.find_stores` accepts *any* opcode whose addressing
      mode is ABS/ABX/ABY, so `SBC $0806,X`, `ORA $322E,Y` and `AND $322E` all match a target
      just as `JSR` does. Filter by opcode yourself if you mean calls specifically.
    - **It does not respect instruction boundaries.** `find_stores` tries every byte offset in
      `range(len(data) - 2)` with no alignment tracking; its own docstring says "Not
      decode-accurate". Describing a result as decode-aligned -- or explaining a missing hit by
      claiming this function skips mid-operand matches -- is wrong in both directions. It
      reports mid-operand aliases, and it never suppresses one.

    So a hit is a *candidate*: disassemble around it from a real boundary, and check the file
    type (picture/data files alias constantly -- see c64-resident-kernel.md's TITLEPG example).
    """
    tset = set(targets)
    out: dict[int, list[tuple[str, int]]] = {t: [] for t in targets}
    for name, body in bodies.items():
        for off in da.find_stores(body, 0, tset):
            val = body[off + 1] | (body[off + 2] << 8)
            out[val].append((name, off))
    return out


def library_jump_table(body: bytes, org: int = KERNEL_ORIGIN) -> list[tuple[int, int, int]]:
    """LIBRARY's own leading run of `JMP abs` instructions, starting at `org` (body offset 0).

    Returns [(index, slot_address, jump_target), ...] for every CONSECUTIVE 3-byte `JMP abs`
    ($4C) starting at offset 0, stopping at the first byte that is not opcode $4C. CoK's
    LIBRARY has 32 such slots (96 bytes); DoK's has only 3 (9 bytes) -- both titles' code
    resumes immediately after the table with ordinary (non-JMP-table) instructions, which is
    what naturally terminates the scan (see docs/engine/research/c64-resident-kernel.md,
    "LIBRARY's own entry-point table").
    """
    slots = []
    i = 0
    while i + 3 <= len(body) and body[i] == 0x4C:
        target = body[i + 1] | (body[i + 2] << 8)
        slots.append((len(slots), org + i, target))
        i += 3
    return slots


def overlay_trampoline_slot(body: bytes, org: int = KERNEL_ORIGIN) -> tuple[int, int] | None:
    """(slot_index, slot_address) of the ONE leading-jump-table slot whose target is
    `OVERLAY_TRAMPOLINE_TARGET` ($0803), or None if this LIBRARY has no such slot.

    Returns None -- it does not guess -- if the table carries more than one `JMP $0803`, since
    "the trampoline slot" would then be ill-defined and every caller of this function treats the
    address as unique. Measured 2026-09-10: exactly one slot qualifies in each of the four
    titles this module knows (CoK slot 24 / $2E10, DoK slot 1 / $2DCB, Secret slot 1 / $2DCB,
    Gateway slot 24 / $2E10), so the multi-hit arm has never fired on real data.
    """
    hits = [(i, a) for i, a, t in library_jump_table(body, org) if t == OVERLAY_TRAMPOLINE_TARGET]
    return hits[0] if len(hits) == 1 else None


def stop_prg_diff(stop_body: bytes, library_body: bytes, slot0_target: int,
                   org: int = KERNEL_ORIGIN) -> list[tuple[int, int, int]]:
    """Byte-by-byte compare of the standalone STOP.PRG body against the 13 bytes at
    LIBRARY's own jump-table slot 0 target (the routine `SYS <KERNEL_ORIGIN>` -- i.e. the
    BASIC boot stub's own line-41 call -- lands on). Returns every (offset, stop_byte,
    library_byte) where they differ; an empty list would mean byte-identical, but in practice
    this returns exactly the 2 bytes of the STOP-key-vector's target ADDRESS operand (both
    titles install the identical SEI/LDA/STA/LDA/STA/CLI/RTS template, pointing at a
    different resident copy of the same 3-instruction STKEY-check routine -- LINKER's tail
    for STOP.PRG, LIBRARY's own tail for the built-in copy). See
    docs/engine/research/c64-resident-kernel.md, "STOP.PRG is LIBRARY's own boot-time
    STOP-vector install, duplicated".
    """
    off = slot0_target - org
    lib_slice = library_body[off: off + len(stop_body)]
    return [(i, a, b) for i, (a, b) in enumerate(zip(stop_body, lib_slice)) if a != b]


_STORE_OP = {0x8D: "STA", 0x8E: "STX", 0x8C: "STY"}
_IMM_OP = {0xA9: "LDA", 0xA2: "LDX", 0xA0: "LDY"}


def find_abs_writes(bodies: dict[str, bytes], target: int) -> dict[str, list[tuple[int, str]]]:
    """Every (offset, mnemonic) where some file's body contains an absolute STA/STX/STY
    ($8D/$8E/$8C) naming `target`. Opcode-decode-accurate (only the three real absolute
    store opcodes -- still not immune to the corpus's general byte-alias hazard, see
    find_callers()'s own docstring, so treat a hit as a candidate until the surrounding bytes
    are disassembled). The write-side counterpart to find_callers()'s read side; used this
    round to census every site that assigns LINKER's $7F11 "next program" dispatch index.
    """
    out: dict[str, list[tuple[int, str]]] = {}
    for name, body in bodies.items():
        hits = []
        for i in range(len(body) - 2):
            op = body[i]
            if op in _STORE_OP and (body[i + 1] | (body[i + 2] << 8)) == target:
                hits.append((i, _STORE_OP[op]))
        if hits:
            out[name] = hits
    return out


def immediate_before(body: bytes, offset: int) -> tuple[str, int] | None:
    """If the 2 bytes immediately before body offset `offset` decode as a LDA/LDX/LDY #imm
    ($A9/$A2/$A0), return (mnemonic, value); else None. Resolves the literal value a store
    instruction writes, for the common case in this corpus where the load is right before the
    store with nothing in between.
    """
    if offset < 2:
        return None
    op = body[offset - 2]
    if op in _IMM_OP:
        return _IMM_OP[op], body[offset - 1]
    return None


# The two encodings LINKER's/LIBRARY's dispatch table uses for its 8 real overlay names (see
# docs/engine/research/c64-boot-chain.md section 2a): CoK's LINKER concatenates them with no
# separator; DoK's LIBRARY (LINKER itself is too short to hold the table) NUL-terminates each.
_DISPATCH_UNSEP_ANCHOR = b"GENDUNGEONCOMBATINITCOM.PREPPOST.COMFINALCAMP"
_DISPATCH_NAME_COUNT = 8
_DISPATCH_SLOT_COUNT = 10


def dispatch_padding_slot_names(title: str) -> list[tuple[int, int, int, bytes]]:
    """Decode ALL 10 raw (length, address) dispatch-table slots the LINKER/LIBRARY loop reads
    by index -- not just the 8 "real" ones docs/engine/research/c64-boot-chain.md's own
    find_dispatch_table() (tools/c64_boot.py, a sibling module -- deliberately not imported
    here) recognises, which treats index 6/7 as padding to be skipped. This decodes what those
    two padding slots' (address, length) pairs actually spell out, by re-reading the same
    bytes their own address happens to land on.

    Returns [(index, length, runtime_address, decoded_bytes), ...] for all 10 slots, 0-9, in
    this title's own address space (CoK: LINKER's body at LINKER_ORIGIN; DoK: LIBRARY's body
    at KERNEL_ORIGIN, NUL-separated names).
    """
    if title == "cok":
        body = linker_body(title)
        org = LINKER_ORIGIN
        idx = body.find(_DISPATCH_UNSEP_ANCHOR)
        if idx < 0:
            return []
        table_start = idx + len(_DISPATCH_UNSEP_ANCHOR)
    else:
        body = kernel_body(title)
        org = KERNEL_ORIGIN
        idx = body.find(b"GEN\x00")
        if idx < 0:
            return []
        pos = idx
        for _ in range(_DISPATCH_NAME_COUNT):
            end = body.find(b"\x00", pos)
            if end < 0:
                return []
            pos = end + 1
        table_start = pos
    len_tab = body[table_start: table_start + _DISPATCH_SLOT_COUNT]
    lo_tab = body[table_start + _DISPATCH_SLOT_COUNT: table_start + 2 * _DISPATCH_SLOT_COUNT]
    hi_tab = body[table_start + 2 * _DISPATCH_SLOT_COUNT: table_start + 3 * _DISPATCH_SLOT_COUNT]
    if len(hi_tab) < _DISPATCH_SLOT_COUNT:
        return []
    out = []
    for i in range(_DISPATCH_SLOT_COUNT):
        length = len_tab[i]
        addr = (hi_tab[i] << 8) | lo_tab[i]
        off = addr - org
        name = body[off: off + length] if 0 <= off < len(body) else b""
        out.append((i, length, addr, name))
    return out


def self_consistency_excluding(body: bytes, org: int, exclude: tuple[int, int]) -> tuple[int, int]:
    """Like self_consistency(), but ignores any own abs JSR/JMP operand landing inside
    `exclude` = (lo, hi). Needed because a huge, heavily-called region (LIBRARY's own real
    span, $2DC8-ish to almost $4B00) inflates the self-consistency score of ANY candidate
    origin whose window happens to overlap it -- every ordinary overlay legitimately calls
    LIBRARY a lot, so that overlap is noise for THIS purpose, not signal, and it drowned out
    DoK's CODE00/CODE01/CODE03's own true local-jump signal until it was filtered out.
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


def sweep_origin(body: bytes, targets: list[int], min_inside: int = 2):
    """Best (entryish_score, inside_count, origin) explaining `targets` for this one file's
    body, at BYTE-exact origins -- deliberately NOT restricted to page alignment (org % 0x100
    == 0), which is what let the true origin ($2DC8, not page-aligned) slip through the prior
    round's sweep.

    Candidate origins are generated as org = target - offset for every (target, offset) pair
    where body[offset - 1] is an ender byte -- i.e. we only propose an origin where at least
    one target would land right after a routine boundary, then score ALL targets against
    that org. This keeps the search tractable (it would otherwise be O(65536) origins per
    file) without reintroducing a page-alignment assumption.

    Returns None if no origin clears `min_inside`.
    """
    if len(body) < min_inside:
        return None
    ender_offsets = [i + 1 for i in range(len(body) - 1) if body[i] in ENDERS]
    if not ender_offsets:
        return None
    best = None
    seen_orgs: set[int] = set()
    for t in targets:
        for off in ender_offsets:
            org = t - off
            if org < 0 or org > 0xFFFF or org in seen_orgs:
                continue
            seen_orgs.add(org)
            inside = [x for x in targets if org <= x < org + len(body)]
            if len(inside) < min_inside:
                continue
            entryish = sum(1 for x in inside
                            if 0 <= (x - org - 1) < len(body) and body[x - org - 1] in ENDERS)
            cand = (entryish, len(inside), org)
            if best is None or cand[:2] > best[:2]:
                best = cand
    return best


def best_hosts(bodies: dict[str, bytes], targets: list[int], top: int = 15,
               min_body_len: int = 512):
    """Rank every file in `bodies` by sweep_origin() score. Returns a list of
    (entryish, inside, org, name, body_len), highest score first."""
    rows = []
    for name, body in bodies.items():
        if len(body) < min_body_len:
            continue
        result = sweep_origin(body, targets)
        if result is None:
            continue
        entryish, inside, org = result
        rows.append((entryish, inside, org, name, len(body)))
    rows.sort(reverse=True)
    return rows[:top]


def self_consistency(body: bytes, org: int) -> tuple[int, int]:
    """(hits, total) -- how many of this file's OWN absolute JSR ($20) / JMP ($4C) operands
    land inside [org, org + len(body))? This is evidence type (a) from the brief: it needs no
    external target list at all, so it cannot be fooled by a conflated cross-title list the
    way the page-aligned sweep was. A file genuinely resident at `org` will mostly jump/call
    within its own range (loops, local subroutine calls); a file resident elsewhere, viewed
    at the wrong org, will not.
    """
    hits = total = 0
    for i in range(len(body) - 2):
        if body[i] in (0x20, 0x4C):
            total += 1
            addr = body[i + 1] | (body[i + 2] << 8)
            if org <= addr < org + len(body):
                hits += 1
    return hits, total


def _print_census(title: str) -> None:
    bodies = read_bodies(load_side1(title))
    census = call_census(bodies)
    print(f"{title}: {len(census)} addresses in [0x2000,0x4000) with fan-in >= 4")
    for addr, files in sorted(census.items(), key=lambda kv: -len(kv[1]))[:30]:
        preview = ", ".join(files[:8]) + ("..." if len(files) > 8 else "")
        print(f"  ${addr:04X}  {len(files):3d} files  {preview}")


def _print_sweep(title: str) -> None:
    bodies = read_bodies(load_side1(title))
    census = call_census(bodies)
    targets = sorted(census.keys())
    print(f"{title}: sweeping {len(targets)} census targets, span "
          f"${min(targets):04X}-${max(targets):04X}")
    for entryish, inside, org, name, blen in best_hosts(bodies, targets):
        print(f"  {name:<12} {blen:6d}B  org=${org:04X}  "
              f"{entryish} entryish / {inside} inside")


def _print_selfcheck(title: str, filename: str, org: int) -> None:
    body = get_file(load_side1(title), filename)
    hits, total = self_consistency(body, org)
    print(f"{title} {filename}: org=${org:04X}  {hits}/{total} own abs JSR/JMP operands "
          f"land inside [${org:04X},${org + len(body):04X})")


def _print_show(title: str, addr: int, org: int, count: int) -> None:
    body = get_file(load_side1(title), "LIBRARY")
    off = addr - org
    if not (0 <= off < len(body)):
        print(f"${addr:04X} is outside LIBRARY's body at org=${org:04X}")
        return
    before = body[off - 1] if off > 0 else None
    print(f"{title} LIBRARY @ ${addr:04X} (body offset {off}), "
          f"byte before = {'none' if before is None else f'${before:02X}'}"
          f"{' (ender)' if before in ENDERS else ''}")
    for line in da.disassemble(body, org, max(0, off - 6), count):
        print(" ", line)


def _print_fullcensus(title: str, top: int) -> None:
    """C1.9c: inbound call census across EVERY side (not just side 1) -- the callers of most
    overlay-family files (ECLnn, MONnn, GEOnn, SPELLnn, CODEnn, WALLSETnn, ...) live on sides
    2-6, so a side-1-only census undercounts fan-in and misses callers entirely for addresses
    only ever reached from those later-side files.
    """
    bodies = all_bodies(title)
    lib = bodies.get("LIBRARY")
    if lib is None:
        print(f"{title}: no LIBRARY file found")
        return
    lo, hi = KERNEL_ORIGIN, KERNEL_ORIGIN + len(lib)
    callers: dict[int, set[str]] = collections.defaultdict(set)
    for name, body in bodies.items():
        if name == "LIBRARY":
            continue
        for i in range(len(body) - 2):
            if body[i] == 0x20:
                addr = body[i + 1] | (body[i + 2] << 8)
                if lo <= addr < hi:
                    callers[addr].add(name)
    print(f"{title}: {len(bodies)} distinct files across all sides; "
          f"{len(callers)} addresses in LIBRARY's own range ${lo:04X}-${hi:04X} "
          f"called from outside LIBRARY")
    for addr in sorted(callers, key=lambda a: -len(callers[a]))[:top]:
        names = sorted(callers[addr])
        off = addr - lo
        entry = lib[off - 1] in ENDERS if 0 <= off - 1 < len(lib) else False
        marker = "E" if entry else " "
        preview = ", ".join(names[:8]) + ("..." if len(names) > 8 else "")
        print(f"  ${addr:04X} [{marker}]  fanin={len(names):3d}  {preview}")


def _print_jumptable(title: str) -> None:
    body = kernel_body(title)
    slots = library_jump_table(body)
    print(f"{title}: LIBRARY leading jump table, {len(slots)} slots at "
          f"${KERNEL_ORIGIN:04X}-${KERNEL_ORIGIN + 3 * len(slots) - 1:04X}")
    for index, addr, target in slots:
        note = ""
        if index == 0:
            note = "  <- BASIC boot SYS target (line 41)"
        elif target == 0x0803:
            note = "  <- overlay-call trampoline (JMP into the $0800 slot)"
        print(f"  [{index:2d}] ${addr:04X}  JMP ${target:04X}{note}")


def _print_trampoline(title: str) -> None:
    """Print the one `JMP $0803` overlay-call trampoline slot, the quantity the DOS ECL
    `op_call` redraw operand is claimed to equal numerically (see the module docstring's
    "Out-of-sample" note and docs/engine/research/c64-resident-kernel.md section 9.2a)."""
    body = kernel_body(title)
    slots = library_jump_table(body)
    hit = overlay_trampoline_slot(body)
    if hit is None:
        print(f"{title}: no unique JMP ${OVERLAY_TRAMPOLINE_TARGET:04X} slot in "
              f"{len(slots)} leading JMP slots")
        return
    index, addr = hit
    print(f"{title}: {len(slots)} leading JMP slots, span "
          f"${KERNEL_ORIGIN:04X}-${KERNEL_ORIGIN + 3 * len(slots) - 1:04X}; "
          f"overlay-call trampoline = slot {index} at ${addr:04X} "
          f"(JMP ${OVERLAY_TRAMPOLINE_TARGET:04X})")


def _print_stopcheck(title: str) -> None:
    if title != "cok":
        print("STOP.PRG exists only on Champions of Krynn's boot side; nothing to compare")
        return
    img = load_side1(title)
    stop = get_file(img, "STOP")
    lib = kernel_body(title)
    slots = library_jump_table(lib)
    slot0_target = slots[0][2]
    diffs = stop_prg_diff(stop, lib, slot0_target)
    print(f"STOP.PRG ({len(stop)}B) vs LIBRARY's slot-0 target ${slot0_target:04X} "
          f"({len(stop)}B window): {len(diffs)} differing byte(s)")
    for off, a, b in diffs:
        print(f"  offset {off}: STOP=${a:02X}  LIBRARY=${b:02X}")


def _print_writesites(title: str, addr: int) -> None:
    """C1.9d: every write to `addr` across all sides, and (where resolvable) the literal
    value stored -- reproduces the FINAL-reachability census."""
    bodies = all_bodies(title)
    sites = find_abs_writes(bodies, addr)
    total = sum(len(v) for v in sites.values())
    print(f"{title}: {total} write(s) to ${addr:04X} across {len(sites)} file(s)")
    for name in sorted(sites):
        for off, mnem in sites[name]:
            imm = immediate_before(bodies[name], off)
            note = f"literal {imm[0]} #${imm[1]:02X} ({imm[1]})" if imm else "computed (not an immediate load)"
            print(f"  {name:<10} off={off:<6d} {mnem} ${addr:04X}   {note}")


def _print_padding(title: str) -> None:
    """C1.9d: decode all 10 dispatch-table slots, including the two padding slots that alias
    FINAL's own address (index 6/7) -- reproduces the corrected FINAL index and the garbled
    names those two padding slots actually spell out."""
    slots = dispatch_padding_slot_names(title)
    if not slots:
        print(f"{title}: dispatch table not found")
        return
    print(f"{title}: all 10 raw dispatch-table slots")
    for i, length, addr, name in slots:
        note = "  <- real overlay name" if i not in (6, 7) else "  <- PADDING (garbled alias)"
        print(f"  [{i}] len={length:2d} addr=${addr:04X}  {name!r}{note}")


def _print_coderesidence(title: str, filename: str) -> None:
    """C1.9d: compare a candidate DoK CODEnn overlay's self-consistency at the three
    plausible origins ($0800 overlay slot, $8000 -- this round's finding, $C000 graphics-
    driver slot), both raw and with LIBRARY's own span excluded (removes the confound where
    any origin overlapping LIBRARY's heavily-called range scores well for free)."""
    bodies = all_bodies(title)
    if filename not in bodies:
        print(f"{title}: no {filename}")
        return
    body = bodies[filename]
    lib = bodies.get("LIBRARY")
    lib_lo, lib_hi = KERNEL_ORIGIN, KERNEL_ORIGIN + (len(lib) if lib else 0)
    print(f"{title} {filename} ({len(body)}B): self-consistency by candidate origin")
    for org in (0x0800, 0x8000, 0xC000):
        h, t = self_consistency(body, org)
        he, te = self_consistency_excluding(body, org, (lib_lo, lib_hi))
        print(f"  ${org:04X}  raw {h:3d}/{t} ({100*h/t:.1f}%)   "
              f"LIBRARY-excluded {he:3d}/{te} ({100*he/te:.1f}%)" if t and te else
              f"  ${org:04X}  no abs ops")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("census", help="unbiased JSR fan-in census for a title")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)

    p = sub.add_parser("sweep", help="byte-exact origin sweep, ranked by score")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)

    p = sub.add_parser("selfcheck", help="self-consistency of a file's own abs JSR/JMP ops")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)
    p.add_argument("--file", required=True)
    p.add_argument("--org", type=lambda s: int(s, 0), required=True)

    p = sub.add_parser("show", help="disassemble LIBRARY around one address at KERNEL_ORIGIN")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)
    p.add_argument("--addr", type=lambda s: int(s, 0), required=True)
    p.add_argument("--org", type=lambda s: int(s, 0), default=KERNEL_ORIGIN)
    p.add_argument("--count", type=int, default=20)

    p = sub.add_parser("fullcensus", help="inbound call census across ALL sides, not just side 1")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)
    p.add_argument("--top", type=int, default=60)

    p = sub.add_parser("jumptable", help="decode LIBRARY's own leading JMP-abs table")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)

    p = sub.add_parser("trampoline", help="print the one JMP $0803 overlay-call trampoline slot")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)

    p = sub.add_parser("stopcheck", help="diff STOP.PRG against LIBRARY's slot-0 target (CoK only)")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)

    p = sub.add_parser("writesites", help="every write to an address across all sides, with resolved literal values")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)
    p.add_argument("--addr", type=lambda s: int(s, 0), default=0x7F11)

    p = sub.add_parser("padding", help="decode all 10 dispatch-table slots incl. the 2 padding slots")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)

    p = sub.add_parser("coderesidence", help="self-consistency of a DoK CODEnn file at $0800/$8000/$C000")
    p.add_argument("--title", choices=sorted(TITLE_DIRS), required=True)
    p.add_argument("--file", required=True)

    a = ap.parse_args()
    try:
        if a.cmd == "census":
            _print_census(a.title)
        elif a.cmd == "sweep":
            _print_sweep(a.title)
        elif a.cmd == "selfcheck":
            _print_selfcheck(a.title, a.file, a.org)
        elif a.cmd == "show":
            _print_show(a.title, a.addr, a.org, a.count)
        elif a.cmd == "fullcensus":
            _print_fullcensus(a.title, a.top)
        elif a.cmd == "jumptable":
            _print_jumptable(a.title)
        elif a.cmd == "trampoline":
            _print_trampoline(a.title)
        elif a.cmd == "stopcheck":
            _print_stopcheck(a.title)
        elif a.cmd == "writesites":
            _print_writesites(a.title, a.addr)
        elif a.cmd == "padding":
            _print_padding(a.title)
        elif a.cmd == "coderesidence":
            _print_coderesidence(a.title, a.file)
    except SourceUnavailable as exc:
        print(f"skipped: {exc}")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
