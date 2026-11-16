#!/usr/bin/env python3
"""C64 Gold Box `MON<hex>` monster-record reader (CoK / DoK, C1.6).

**What this module exposes is deliberately narrow.** The DOS-side monster layout
(`packages/engine/src/loaders/monster.ts`) was reverse-engineered by *statistical
correlation* across records, not by reading a consumer. This module instead starts from
the C64 6502 code that actually touches a loaded `MON<hex>` buffer, so it only surfaces
fields a disassembled instruction proves. See `docs/engine/research/c64-mon-format.md`
for the full disassembly writeup, citations, and what remains open.

FACT, code-cited (see the doc for the exact instructions):
  * Every `MON<hex>` file on both CoK and DoK side-1 disks is 482 bytes on disk -- a
    2-byte C64 load address ($4000) + a 480-byte payload. This holds for every MON file
    checked (14/14 CoK, 22/22 DoK from the retail Side 1 disks) -- see
    `mon_payload_length_is_480` in `test_c64_mon.py`.
  * Monster name is ASCII, NUL-padded, starting at **payload offset 0** (no length-prefix
    byte, unlike the DOS record's `u8 name_length` at offset 0 followed by the name at
    offset 1). This is a direct observation of the raw file bytes (e.g. CoK MON01 reads
    b"BAAZ\x00..."), independent of any consumer trace -- see the next bullet for why it
    can no longer be described as consumer-proven.
  * **CORRECTED 2026-08-12** (was wrongly read as consumer-proof of the name field until
    the C1.9 kernel-origin breakthrough made $2E9A/$2E49 readable -- both land inside
    LIBRARY, resident at $2DC8 in both titles, see docs/engine/research/c64-resident-kernel.md
    and docs/engine/research/c64-boot-chain.md): CoK COM.PREP ($0800+$0A0F-$0A26) and DoK
    COMPREP ($0800+$0A15-$0A2A) do run byte-for-byte identical loops (differing only in
    the JSR target: CoK calls $2E9A, DoK calls $2E49) that walk Y from $27 down to $00
    (40 bytes) over a buffer reached through zero-page pointer $4E, replacing any byte
    >= $40 with a space ($20). But tracing $2E9A/$2E49 -> $2E84/$2E2D -> the one $0288
    write site in LIBRARY proves ($4E) resolves to **VIC-II screen memory**
    ($CC00 + row*40, row = the caller's loop index, with Color RAM at $D800 + row*40 as
    a parallel pointer computed by the same routine) -- NOT the raw $4000 MON staging
    buffer. The same loop is reused byte-for-byte by three unrelated overlays
    (COM.PREP/COMPREP, DUNGEON, INIT), always with a fixed 24-row count, which is a much
    better fit for "scrub stray graphics-mode screen codes off an alternate text screen"
    than for anything MON-specific. Full disassembly, cross-title VIC-bank-register
    proof, and the byte-value argument (C64 screen codes place A-Z below $40; ASCII does
    not, so this loop would blank real ASCII text) are in
    docs/engine/research/c64-mon-format.md section 11. **Do not treat this loop as proof
    of the name field's location or length going forward** -- only the raw-byte
    observation above stands.
  * Payload offset 0xCB (203) is used as (part of) a caller-supplied pointer parameter
    written into a fixed $0600-based parameter block in BOTH CoK COM.PREP ($0800+$149C /
    $0800+$14A1) and DoK COMPREP ($0800+$14C0 / $0800+$14C5) during combat encounter
    setup, immediately before the block is handed to the sprite compositor (GDRIVE01).
    The pointer value written is literally $40CB = $4000 + 0xCB, i.e. "record start +
    203" -- so offset 203 onward is graphics/sprite-pointer territory, not a stat byte.
    Unaffected by the correction above (a different code path, a literal immediate
    pointer write, not routed through $2E84/$2E2D).

NOT proven here (deliberately absent, do not guess): hp, AC, THAC0, saves, hit dice,
category, damage dice/bonus/size, XP, morale. The zero-page pointer $4E lead is now
CLOSED (see above) rather than open, and closed in the unhelpful direction: the one
consumer this project could reach turns out to be unrelated to monster records at all.
No other candidate consumer of the raw $4000 buffer was found in this pass. See the
doc's "Open questions" section (and its section 11) for what remains.

Record-length delta vs. DOS (task C1.6d): the C64 payload (480 bytes) does NOT match
either DOS Gen1 monster-record size. CoK's own DOS `MON1CHA.DAX` block for the same
monster (verified by name, e.g. block 0x01 = BAAZ) is 409 bytes (480 - 409 = **+71**
bytes on C64). DoK's is 216 bytes (480 - 216 = **+264** bytes on C64) -- yet both CoK and
DoK share the identical 480-byte C64 record size. This directly falsifies applying
`tools/c64_disk.py`'s general "DOS block and C64 counterpart are byte-identical from
offset 2 onward" claim to the MON family: it does not hold here (report this as a
correction elsewhere -- this module does not edit `c64_disk.py`).

2026-08-12 "mon-populate" round (see docs/engine/research/c64-mon-format.md section 12
for the full writeup): re-derived a prior round's naive linear byte scan ("29 CoK / 20
DoK absolute-operand matches inside $4000-$41E0") with real control-flow-following
disassembly. Two results:

  * ROOT-CAUSE FINDING: LIBRARY's own proven-resident body ($2DC8 to $2DC8+len, per
    c64-resident-kernel.md) entirely CONTAINS the $4000-$41E0 window that scan searched
    -- confirmed for both titles by `library_contains_mon_window()`. That window is
    exactly 480 bytes wide (0x41E0-0x4000 = MON_PAYLOAD_LENGTH), so it was clearly sized
    to match the payload length, but its placement was never cross-checked against
    LIBRARY's own address range. Any hit in that window is therefore ambiguous between
    "references the MON staging buffer" and "references another part of LIBRARY's own
    body" by address alone -- and every hit that survives a real trace turns out to be
    the latter.
  * A first pass at `library_window_hits()` seeded the trace ONLY from LIBRARY's own
    leading jump table + one documented wrapper entry -- 32 slots for CoK, but just 3 for
    DoK, so the trace covered 13.2% of CoK's LIBRARY and only 0.8% of DoK's. DoK's "0
    survivors" from that pass was retracted as a coverage artifact, not a finding -- see
    the 2026-08-12 "mon-verify" round below for the fix.

2026-08-12 "mon-verify" round (see docs/engine/research/c64-mon-format.md section 13):
widened the trace seed set to a REAL inbound-call census -- every genuine `JSR` (opcode
$20 only) landing inside LIBRARY's span, from a file on an established-real-code
allowlist (`_CODE_FILES`, excludes known DATA files like MON/GEO/SPELL/PIC/COMBAT2 --
see the allowlist's own docstring), across ALL disk sides (`c64_kernel.all_bodies`, not
just side 1). Results:

  * Coverage is now comparable between titles: CoK 2836/7435 = 38.1%, DoK 2878/7467 =
    38.5% (`library_trace_coverage()`) -- a large, symmetric improvement over the prior
    13.2%/0.8%, and no longer a coverage artifact for either title.
  * `library_window_hits()` now returns 22 CoK / 11 DoK survivors (`library_window_hits`).
    Disassembled, every one is either a `JSR`/`JMP` to an ordinary intra-LIBRARY
    subroutine (advancing zero-page pointers by the screen-width constant, a
    multiply-accumulate into shared globals, or similar) or an indexed load/compare
    against a small (~20-entry) LIBRARY-internal lookup table -- the SAME tables,
    byte-for-byte near-identical, at analogous addresses in both titles. None reference
    MON name/text data or use the ($4C)/($4E) row-pointer idiom the scrub loop and
    cursor-blink write use.
  * An UNRESTRICTED census (every file on every side, no code/data distinction) finds a
    12th DoK hit that the restricted census correctly excludes: `EOR $4142` at LIBRARY
    offset 7310 (address $4A56), seeded from a "JSR"-shaped byte pair inside `SPELLE66`
    -- a spell-message DATA file. Disassembling the target shows it lands squarely on the
    ASCII string `"COMBAT2"` embedded in LIBRARY's own dispatch-table name list -- the
    EXACT SAME false-positive shape already documented for CoK's COM.PREP in the module's
    own §5-equivalent note above, this time reached via a bad entry point rather than a
    bad window hit. This is why `_CODE_FILES` restricts the census to established-code
    files rather than scanning every file indiscriminately.
  * `row_pointer_helper_callers()` re-derives the $2E84/$2E2D caller census (previously
    side-1-only) across ALL sides. CoK is unchanged at 9 sites. DoK grows to 11
    candidates, but the new one (`PIC07` offset 1624) is a SECOND confirmed byte-alias
    false positive (`ORA $2E2D` -- opcode $0D, not JSR/$20; PIC07 is picture data, and
    the surrounding bytes are an unstructured pixel jumble). The REAL population is
    unchanged for both titles: 8 LIBRARY-internal sites + GDRIVE02.
  * `dungeon_cursor_write_reachability()` attempts to settle whether the DUNGEON
    cursor-blink write is reachable from DUNGEON's own entry point. Two addresses are in
    play and this docstring previously conflated them: the SEQUENCE START (the opening
    `LDA $FC`) is $1235/offset 2613 on CoK and $1037/offset 2103 on DoK -- that is what
    `_DUNGEON_CURSOR_WRITE` holds and what the tests pin -- while the `STA ($4E),Y`
    INSTRUCTION ITSELF sits 10 bytes further on, at $123F/offset 2623 (CoK) and
    $1041/offset 2113 (DoK). The sequence was confirmed structurally identical in both
    titles this round, closing a cross-title gap the prior pass left open. It is NOT
    reached by a static trace in either title -- but DUNGEON's own trace coverage from
    its single seeded entry (address $0800) is only 6.1% (CoK) / 6.6% (DoK), so this is
    NOT evidence of unreachability -- it is a
    tooling limitation (this project's BFS trace only follows JSR/JMP-abs/branches; it
    cannot follow the classic 6502 "push target-1, RTS" indirect-dispatch trick, and
    DUNGEON's low coverage from one entry point is consistent with heavy use of exactly
    that trick for command dispatch). Reported as genuinely unsettled, with a diagnosed
    reason, rather than a false negative.
    CORRECTED 2026-08-12, then corrected AGAIN the same day (this bullet, and the two
    other places that repeated it, first said "LINKER is the only non-data-file caller of
    any of those addresses", then "TWO non-data-file references per title" -- the second
    is right for CoK and wrong for DoK). Re-run of `c64_kernel.find_callers(all_bodies(t),
    [0x0800, 0x0803, 0x0806])`. Note that helper is NOT a JSR search and does NOT respect
    instruction boundaries (see its own docstring): every entry below is a byte match, and
    the bytes are quoted so they can be re-checked.
      * CoK -- 2 non-data-file references. (1) `LINKER`'s `JSR $0800`, body offset 60,
        bytes `20 00 08`: the real overlay-dispatch call, and the only reference naming
        $0800. (2) `LIBRARY`'s OWN leading jump-table slot `JMP $0803`, bytes `4C 03 08`
        at LIBRARY body offset 72 = slot 24, address $2E10 -- the slot
        `c64_kernel._print_jumptable` labels "overlay-call trampoline (JMP into the $0800
        slot)", i.e. a generic redispatch into the second slot of WHICHEVER overlay is
        resident at $0800, not a DUNGEON-specific caller. CoK's $0806 has no non-data-file
        reference at all (its one byte-match is PIC11 offset 525, `FD 06 08` = SBC abs,X).
      * DoK -- 4 references across 3 files: the same two (LINKER body offset 69,
        `20 00 08`; LIBRARY body offset 3 = slot 1, address $2DCB, `4C 03 08`) PLUS two in
        `DUNGEON` itself, a code file on `_CODE_FILES`. Body offset 0 is `4C 06 08` =
        `JMP $0806`, DoK DUNGEON's own leading slot 0 (its table is 2 slots,
        `4C 06 08 | 4C 2E 0A`), and $0806 is where its body begins (offsets 6-9 =
        `BA` TSX, `8E BF 03` STX $03BF). Body offset 5894 (address $1F06) is `4C 06 08`
        again, preceded by `AE BF 03` at 5890 and `9A` at 5893 -- bytes consistent with a
        stack-restore-then-re-enter-$0806 path; alignment into it was not independently
        established, only the byte values were checked.
    The remaining byte-matches are in data files: CoK ECL*/PIC*/GEO44/GEO52/SPRITE00/
    BODY44/COMPIC38/SAVEDRAGN/.SALINA; DoK ECL*/PIC*/GEO41/SPRITE*/COMPIC04/SAVEDEATH plus
    MON25 (offset 158) and WALLDEF04 (offset 2496), two families the earlier list omitted.
    The trace above still seeds only $0800 -- so $0803's real non-data-file entry path is
    unfollowed in both titles, while DoK's $0806 is reached anyway, via slot 0's JMP.
  * `screen_memory_writes()` widens the TARGET search (what writes text into $CC00-
    $CFFF) from the prior round's 3-file bounded check to every file on the same
    established-code allowlist, across all sides, both titles. Result: STILL NO
    text-populating consumer found. The full return value, per title and per file
    (CORRECTED 2026-08-12 -- this list used to merge the two titles, omit CoK GEN, and
    call several multi-hit files "single fixed-address writes"): CoK returns 5 files / 28
    hits -- INIT 20, COMBAT 3, DUNGEON 3, COM.PREP 1, GEN 1; DoK returns 8 files / 34
    hits -- INIT 20, CODE00 3, CODE03 3, DUNGEON 3, COMBAT 2, CAMP 1, CODE01 1,
    COMPREP 1. `INIT` is by far the largest cluster (20 of CoK's 28 and of DoK's 34) --
    a border-draw + full-screen-clear routine, byte-identical in shape between titles,
    using only literal immediate constants, never an indexed read from a source buffer.
    It is not the only multi-site one: DUNGEON has 3 in both titles, CoK COMBAT 3, and
    DoK CODE00 and CODE03 3 each. Of the rest, FIVE are indexed stores
    (CORRECTED 2026-08-12: this said "three", merging the two titles) -- three on CoK (GEN
    9241 `STA $CEA6,X`, DUNGEON 8870 `STA $CFF8,Y` after `LDY #$00; TXA`, COMBAT 519
    `STA $CD57,Y` after `LDA #$20`) and two on DoK (DUNGEON 7717, COMBAT 499, the same two
    shapes) -- each writing a register or a literal, not buffer text; the remainder are
    single absolute pokes. Two hits are not claimed as real: CoK GEN offset 9241 sits in an
    ascending-byte-run lookup table (that reading stands), while CoK COMBAT offset 9432
    ($2CD8) actually decodes CLEANLY from a natural boundary -- what is unverified there is
    its reachability (no JSR/JMP-abs and no relative branch anywhere in CoK COMBAT's bytes
    targets $2CD8, and the preceding instruction is an unconditional JMP). See
    c64-mon-format.md section 13.6 for the full per-offset tables. The open question
    stands: nothing in the established-code corpus demonstrably reads MON<hex> data and
    writes it as text into screen memory.

2026-08-13 round (see docs/engine/research/c64-mon-format.md section 14): closes a real
methodology gap the prior rounds' `screen_memory_writes()` left open -- it only searched
ABS/ABX/ABY-mode stores and never looked at indirect-indexed (`STA (zp),Y`) forms, even
though the row-pointer helper's own output is read exactly that way. Two results:

  * `zp_indirect_store_census()` shows the zero-page pair $4C/$4D (believed exclusive to
    the row-pointer helper's output) is also loaded directly from several OTHER sources
    in DUNGEON (mostly `LDX $7Fxx; STX $4C`), so a bare `STA ($4C),Y` hit is NOT, by
    itself, evidence of a $CC00 write -- it depends on what last set the pointer.
  * A genuine new finding: a generic NUL-terminated string-copy primitive, CoK DUNGEON
    $1802 / DoK DUNGEON $1601 (byte-identical shape both titles), reached by REAL
    opcode-exact JSR/JMP references in established code -- `print_string_routine_callers()`
    -- including two direct `JSR`s from DoK's own COMPREP (combat-encounter setup). CoK's
    one caller has a literal, statically-resolvable source pointer ($7A00, a shared
    multi-owner scratch buffer, NOT the $4000 MON buffer); DoK COMPREP's two source
    pointers could NOT be resolved statically this round (their value depends on a
    ~64-iteration loop's exit-time register state) -- reported open, not guessed. Still no
    confirmed MON-text consumer, but the false idiom-narrowness that produced the earlier
    "nothing found" is now closed, and a real, more-specific open lead (DoK COMPREP's two
    call sites) is on record for whoever continues this.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import NamedTuple

import c64_disk as c64
import c64_disasm as c64d
import c64_kernel as c64k

#: Every observed MON<hex> payload (post 2-byte load-address strip) is exactly this long,
#: for BOTH CoK and DoK. Verified against all 14 CoK + 22 DoK Side-1 MON files.
MON_PAYLOAD_LENGTH = 480

#: Name field start. FACT (see module docstring): no length-prefix byte, unlike DOS.
#: Proven only by direct inspection of the raw file bytes -- NOT by the scrub loop below
#: (that loop was shown 2026-08-12 to operate on VIC-II screen memory, not this buffer).
NAME_OFFSET = 0
#: Practical scan bound for _petscii_name, kept at 40 for historical continuity with the
#: COM.PREP/COMPREP scrub loop's own byte count (Y = 0x27 down to 0x00 inclusive = 40).
#: CORRECTED 2026-08-12: that loop's 40 is the C64's screen width in columns, an
#: unrelated coincidence -- see docs/engine/research/c64-mon-format.md section 11. This
#: constant is NOT a proven MON-record name-field length; it just rarely binds in
#: practice, since every observed name terminates at NUL well before 40 bytes.
NAME_SCRUB_LENGTH = 40

#: Payload offset written into a sprite-compositor pointer parameter in both titles'
#: combat-prep overlay. FACT, instruction-cited above. NOT claimed to be a stat field.
SPRITE_POINTER_FIELD_OFFSET = 0xCB

# DOS Gen1 monster-record sizes for the same titles (packages/engine/src/loaders/monster.ts),
# kept here only for the size-delta report in `describe()` / the CLI -- not used to guess
# C64 offsets.
DOS_RECORD_LENGTH = {"cok": 409, "dok": 216}

# --- 2026-08-12 "mon-populate" round: is the $4000-$41E0 byte window even meaningful? ---
#
# FACT, arithmetic + code-cited (see docs/engine/research/c64-mon-format.md section 12):
# LIBRARY's own proven resident body (docs/engine/research/c64-resident-kernel.md:
# KERNEL_ORIGIN=$2DC8, both titles) is long enough that it ENTIRELY CONTAINS the
# $4000-$41E0 window a prior round scanned for MON-buffer references. That window's
# width (0x41E0-0x4000 = 480 = MON_PAYLOAD_LENGTH exactly) shows it was sized to match
# the payload length, but its placement was never cross-checked against LIBRARY's own
# already-proven address range from the SAME investigation. Any absolute operand a
# LIBRARY routine has that lands in that window is therefore indistinguishable, by
# address alone, between "references the external MON staging buffer" and "references
# another part of LIBRARY's own resident body" -- and control-flow tracing (below) shows
# it is always the latter, never the former.
_MON_WINDOW = (0x4000, 0x41E0)  # the address range the prior round's naive scan searched


def library_span(title: str) -> tuple[int, int]:
    """(org, org+len) for `title`'s LIBRARY body -- i.e. the proven-resident address
    range. Used only to demonstrate the self-overlap fact above; not a MON-record field.
    """
    body = c64k.kernel_body(title)
    return c64k.KERNEL_ORIGIN, c64k.KERNEL_ORIGIN + len(body)


def library_contains_mon_window(title: str) -> bool:
    """True iff `title`'s LIBRARY body fully contains `_MON_WINDOW` -- see the fact
    above. True for both CoK and DoK as of this round (pinned in test_c64_mon.py)."""
    lo, hi = library_span(title)
    return lo <= _MON_WINDOW[0] and _MON_WINDOW[1] <= hi


# Entry points into LIBRARY that are proven real by DIRECT DISASSEMBLY QUOTATION
# elsewhere in this investigation (docs/engine/research/c64-mon-format.md section 11.1:
# CoK COM.PREP's own JSR $2E9A operand, DoK COMPREP's own JSR $2E49 operand) -- NOT
# found by a naive byte scan. Used as an extra control-flow-trace seed alongside
# LIBRARY's own leading JMP table (the least-disputable entry-point set of all: by
# construction, library_jump_table() only returns consecutive real `JMP abs`
# instructions starting at body offset 0).
_DOCUMENTED_WRAPPER_ENTRY = {"cok": 0x2E9A, "dok": 0x2E49}


def _trace_control_flow(
    body: bytes, org: int, seed_addrs: set[int]
) -> tuple[set[int], list[tuple[int, int, str, str]]]:
    """Follow REAL control flow (JSR/JMP-abs/conditional-branch targets) starting from
    `seed_addrs`, decoding with c64_disasm's real opcode table -- the antidote to a
    naive linear byte scan (project standing rule 5: a byte-alias hit is a lead, not a
    finding, until re-derived from real instruction boundaries reachable from a real
    entry point). Returns (visited body-offsets, hits) where hits is every
    (body_offset, abs_operand_addr, mnemonic, disasm_line) for an ABS/ABX/ABY-mode
    instruction actually reached by the trace. An empty `dead_ends` (not returned, but
    see the caller in test_c64_mon.py) means the whole traced region decoded cleanly --
    the strongest evidence this decoder can offer that the trace's own alignment is
    correct throughout, without needing a second oracle.
    """
    n = len(body)
    visited: set[int] = set()
    hits: list[tuple[int, int, str, str]] = []
    worklist = [a - org for a in seed_addrs if org <= a < org + n]
    while worklist:
        off = worklist.pop()
        if off in visited or not (0 <= off < n):
            continue
        pc = off
        while 0 <= pc < n and pc not in visited:
            op = body[pc]
            entry = c64d.OPCODES.get(op)
            if entry is None:
                break
            mnem, mode = entry
            size = c64d.SIZE[mode]
            if pc + size > n:
                break
            visited.add(pc)
            lo = body[pc + 1] if size > 1 else 0
            hi = body[pc + 2] if size > 2 else 0
            text, addr = c64d.operand(mode, lo, hi, org + pc)
            raw = " ".join(f"{b:02X}" for b in body[pc : pc + size])
            line = f"{org+pc:04X}  {raw:<9}  {mnem} {text}".rstrip()
            if mode in (c64d.ABS, c64d.ABX, c64d.ABY) and addr is not None:
                hits.append((pc, addr, mnem, line))
            if mnem in ("JSR", "JMP") and mode == c64d.ABS and addr is not None:
                worklist.append(addr - org)
                if mnem == "JMP":
                    break
                pc += size
                continue
            if mnem == "JMP" and mode == c64d.IND:
                break
            if mode == c64d.REL and addr is not None:
                worklist.append(addr - org)
                pc += size
                continue
            if mnem in ("RTS", "RTI"):
                break
            pc += size
    return visited, hits


# --- 2026-08-12 "mon-verify" round: a REAL inbound-call census, both titles, all sides ---
#
# `library_window_hits()`'s original seed set (LIBRARY's own jump table + one documented
# wrapper entry) is strict but wildly asymmetric between titles -- DoK's LIBRARY jump table
# has only 3 slots against CoK's 32, so the same rule gave DoK a 0.8%-coverage trace and its
# "0 survivors" was a coverage artifact, not a finding (see the module docstring history
# above). This section replaces that seed set with a real inbound-call census: every genuine
# `JSR` (opcode $20 only, not any absolute-mode instruction) landing inside LIBRARY's own
# address span, found in a file this project has independently established IS executed code
# -- never a data file -- across ALL disk sides (most overlay-family files live on sides 2-6,
# per c64_kernel.all_bodies's own docstring).
#
# The allowlist below is deliberately conservative: the 8-name LINKER/LIBRARY dispatch table
# (GEN, DUNGEON, COMBAT, INIT, COM.PREP/COMPREP, POST.COM/POSTCOM, FINAL, CAMP -- see
# c64_kernel._DISPATCH_UNSEP_ANCHOR) minus nothing, plus the graphics-driver slot
# (GDRIVE00-05), plus LINKER/STOP/SOUNDFX/FASTL.O/BOOT/CODE00-03 (candidate DoK overlay code,
# per c64_kernel's own "coderesidence" command). COMBAT2 is DELIBERATELY EXCLUDED despite
# living in the same $0800 overlay-slot family: this project's own investigation (see the
# module docstring's section-2-equivalent note) already proved it is >95% printable ASCII
# text, a data table COMBAT reads directly, not an independently-executed overlay. Everything
# else in the corpus (MON*, GEO*, SPELL*, PIC*/COMPIC*, ITEMFILE*/ITEMNAMES, WALLSET*/
# WALLDEF*, SPRITE*, ECL*, TITLEPG, CHARSET/CHARPIC00, ANIMATE00, MUSIC, HEAD*/BODY*,
# SECSET*, portrait files, disk-banner strings) is a documented asset/data format elsewhere
# in this project, never independently-executed code -- so a JSR-shaped byte pair inside one
# of those is a byte alias by definition, not a lead. See library_window_hits()'s own
# docstring for a proven example of exactly this failure mode (a DoK hit that only appears in
# the UNRESTRICTED census, seeded from SPELLE66, landing on the ASCII string "COMBAT2").
_CODE_FILES: dict[str, set[str]] = {
    "cok": {
        "DUNGEON", "COMBAT", "CAMP", "GEN", "COM.PREP", "POST.COM", "INIT",
        "GDRIVE00", "GDRIVE01", "GDRIVE02", "LINKER", "STOP", "SOUNDFX", "FASTL.O", "BOOT",
    },
    "dok": {
        "DUNGEON", "COMBAT", "CAMP", "GEN", "COMPREP", "POSTCOM", "INIT",
        "GDRIVE00", "GDRIVE01", "GDRIVE02", "GDRIVE04", "GDRIVE05", "LINKER",
        "CODE00", "CODE01", "CODE03", "SOUNDFX", "FASTL.O",
    },
}


def library_entry_census(title: str) -> dict[int, list[tuple[str, int]]]:
    """Every address inside `title`'s LIBRARY span reached by a real `JSR` (opcode $20
    exactly) from a file on `_CODE_FILES[title]`'s allowlist, across ALL disk sides
    (`c64_kernel.all_bodies`). Returns addr -> [(file, body_offset), ...]. This is the
    inbound-call census `library_trace_seeds()` uses to widen the control-flow trace.
    """
    bodies = c64k.all_bodies(title)
    lib = bodies.get("LIBRARY")
    if lib is None:
        return {}
    lo, hi = c64k.KERNEL_ORIGIN, c64k.KERNEL_ORIGIN + len(lib)
    out: dict[int, list[tuple[str, int]]] = {}
    for name in _CODE_FILES[title]:
        body = bodies.get(name)
        if body is None:
            continue
        for i in range(len(body) - 2):
            if body[i] == 0x20:  # JSR abs, opcode-exact
                addr = body[i + 1] | (body[i + 2] << 8)
                if lo <= addr < hi:
                    out.setdefault(addr, []).append((name, i))
    return out


def library_trace_seeds(title: str) -> set[int]:
    """The widened seed set: LIBRARY's own jump table + the documented wrapper entry
    (both already proven real by direct disassembly quotation, see the module docstring)
    plus every address `library_entry_census()` finds -- i.e. every real JSR any
    established-code file makes into LIBRARY's address range, on any disk side."""
    body = c64k.kernel_body(title)
    org = c64k.KERNEL_ORIGIN
    jt = c64k.library_jump_table(body, org)
    seeds = {t for _, _, t in jt}
    seeds.add(_DOCUMENTED_WRAPPER_ENTRY[title])
    seeds |= set(library_entry_census(title).keys())
    return seeds


def library_trace_coverage(title: str) -> tuple[int, int]:
    """(visited_bytes, total_bytes) for the widened trace -- the real, comparable-between-
    titles coverage number that replaces the original 13.2% (CoK) / 0.8% (DoK) figures."""
    body = c64k.kernel_body(title)
    org = c64k.KERNEL_ORIGIN
    visited, _ = _trace_control_flow(body, org, library_trace_seeds(title))
    return len(visited), len(body)


def library_window_hits(title: str) -> list[tuple[int, int, str, str]]:
    """Every ABS/ABX/ABY-mode operand landing inside `_MON_WINDOW`, reached by a
    control-flow trace seeded from `library_trace_seeds()` -- LIBRARY's own proven jump
    table, the documented wrapper entry point, AND a real inbound-call census across all
    disk sides restricted to established-code files (see the `_CODE_FILES` block above).

    HISTORY: an earlier version of this function seeded ONLY from the jump table + wrapper
    entry. That was strict but wildly asymmetric between titles (DoK's LIBRARY jump table
    has only 3 slots against CoK's 32), giving a 13.2%-coverage CoK trace (4 survivors, a
    real result) and a 0.8%-coverage DoK trace (0 survivors -- a coverage artifact, not a
    result: nothing was actually searched). The widened seed set here reaches 38.1%
    (CoK) / 38.5% (DoK) -- see `library_trace_coverage()` -- and finds 22 CoK / 11 DoK
    survivors, individually disassembled (see the module docstring's 2026-08-12
    "mon-verify" section): every one is either a JSR/JMP to an ordinary intra-LIBRARY
    subroutine or an indexed read/compare against a small LIBRARY-internal lookup table,
    with the same table shapes appearing at analogous addresses in both titles. None
    reference MON name/text data.
    """
    body = c64k.kernel_body(title)
    org = c64k.KERNEL_ORIGIN
    _, hits = _trace_control_flow(body, org, library_trace_seeds(title))
    lo, hi = _MON_WINDOW
    return [h for h in hits if lo <= h[1] < hi]


_ROW_POINTER_HELPER = {"cok": 0x2E84, "dok": 0x2E2D}


def row_pointer_helper_callers(title: str) -> dict[str, list[int]]:
    """Re-derives the $2E84 (CoK) / $2E2D (DoK) row-pointer-helper caller census across ALL
    disk sides (c64-mon-format.md section 11.4 originally computed this on side 1 only).
    Uses `c64_kernel.find_callers`, which is opcode-decode-based for ABS/ABX/ABY-mode
    instructions naming the target address -- not calls specifically -- so, per that
    function's own documented caveat, a hit is a candidate, not a proof, until checked
    against real instruction boundaries. Returns name -> sorted [body_offset, ...].

    FACT (all-sides re-derivation, this round): CoK's population is UNCHANGED at 9 sites
    (8 LIBRARY-internal + GDRIVE02) -- side 1 already had the complete population. DoK
    grows from the side-1-only 9 real sites (8 LIBRARY + GDRIVE02) plus the already-
    confirmed-false CODE00 offset-122 hit, to ALSO include a new candidate at PIC07 offset
    1624 -- CONFIRMED a second byte-alias false positive here too (`body[1624]` decodes as
    `ORA $2E2D`, opcode $0D, not JSR/$20; PIC07 is picture/graphics data, and the
    surrounding bytes are an unstructured pixel/RLE byte jumble, not an instruction
    stream). So the REAL caller population is unchanged by the wider search for BOTH
    titles: exactly 8 LIBRARY-internal sites + GDRIVE02.
    """
    bodies = c64k.all_bodies(title)
    target = _ROW_POINTER_HELPER[title]
    hits = c64k.find_callers(bodies, [target])[target]
    out: dict[str, list[int]] = {}
    for name, off in hits:
        out.setdefault(name, []).append(off)
    return {name: sorted(offs) for name, offs in out.items()}


_DUNGEON_ORIGIN = 0x0800
# CoK: $0800+$0A35 -- LDA $FC; JSR $2E9D; LDY $FB; LDA $2CBF; STA ($4E),Y; LDA #$01; STA
# ($A3),Y (see c64-mon-format.md section 12.4). DoK's own DUNGEON body has the structurally
# identical sequence (row from $FC, JSR into the $2E84/$2E2D wrapper's second half, column
# from $FB, one glyph byte written to screen + color RAM) at a DIFFERENT address --
# confirmed by disassembly this round, closing a cross-title gap the prior pass left open
# (it only had the CoK instance).
_DUNGEON_CURSOR_WRITE = {"cok": 0x1235, "dok": 0x1037}


def dungeon_cursor_write_reachability(title: str) -> dict:
    """Attempts to settle whether DUNGEON's cursor-blink glyph write (see
    `_DUNGEON_CURSOR_WRITE`, which holds the SEQUENCE START -- the opening `LDA $FC` --
    not the `STA ($4E),Y` 10 bytes later) is reachable via a real control-flow trace from
    DUNGEON's own proven-real external entry point (address $0800, offset 0 -- the fixed
    overlay-slot address every LINKER-dispatched overlay is entered at).

    CORRECTED 2026-08-12, twice (this docstring first claimed "LINKER is the only
    non-data-file caller of any of those addresses", then "TWO non-data-file references
    per title" -- right for CoK, wrong for DoK). Cross-checking
    `c64_kernel.find_callers(all_bodies(t), [0x0800, 0x0803, 0x0806])` -- a byte-match
    search, not a JSR search, and not instruction-boundary-aligned, per that function's own
    docstring -- gives, per title:
      * CoK: 2 non-data-file references. LINKER's `JSR $0800` (body offset 60, bytes
        `20 00 08`), the real dispatch call and the only reference to $0800 itself; and
        LIBRARY's own leading jump-table slot `JMP $0803` (bytes `4C 03 08` at LIBRARY body
        offset 72, slot 24, address $2E10) -- the slot `c64_kernel._print_jumptable` labels
        "overlay-call trampoline (JMP into the $0800 slot)", a generic redispatch into the
        second slot of whichever overlay is resident at $0800 rather than a DUNGEON-specific
        caller. CoK's $0806 has no non-data-file reference at all.
      * DoK: 4 references across 3 files -- the same two (LINKER body offset 69; LIBRARY
        body offset 3, slot 1, address $2DCB) plus DUNGEON itself at body offsets 0 and
        5894, both `4C 06 08` = `JMP $0806`. Offset 0 is DoK DUNGEON's own leading slot 0
        and $0806 is where its body begins (`BA` TSX, `8E BF 03` STX $03BF at offsets 6-9);
        offset 5894 ($1F06) is preceded by `AE BF 03` and `9A`, bytes consistent with a
        stack-restore-then-re-enter-$0806 path (alignment not independently established).
    The remaining byte-matches are inside data files, including -- on DoK -- MON25 (offset
    158) and WALLDEF04 (offset 2496), alongside the ECL*/PIC*/GEO*/SPRITE*/COMPIC*/
    SAVEDRAGN/SAVEDEATH/.SALINA/BODY44 families. The trace below is still seeded only from
    $0800 (which on DoK reaches $0806 anyway, by following slot 0's JMP).

    Returns a dict (not a bare bool) because the coverage number is the load-bearing part
    of the answer: DUNGEON is a large overlay (9452 CoK / 8248 DoK bytes) and this trace
    only reaches ~6% of it from its one entry point -- nowhere near enough for a "not
    reached" verdict to mean anything on its own. This low coverage is itself consistent
    with DUNGEON using a runtime-computed/indirect dispatch mechanism (the classic 6502
    "push target-1 then RTS" trick) for the bulk of its command handling, which a static
    JSR/JMP-abs/branch-following trace cannot follow BY CONSTRUCTION, regardless of seed
    set. Reported as genuinely unsettled with a diagnosed reason, not a false negative.
    """
    body = c64k.get_file(c64k.load_side1(title), "DUNGEON")
    org = _DUNGEON_ORIGIN
    visited, _ = _trace_control_flow(body, org, {org})
    target_off = _DUNGEON_CURSOR_WRITE[title] - org
    total = len(body)
    return {
        "visited": len(visited),
        "total": total,
        "coverage_pct": round(100 * len(visited) / total, 1),
        "target_offset": target_off,
        "reached": target_off in visited,
    }


def screen_memory_writes(title: str) -> dict[str, list[tuple[int, str, int]]]:
    """Every absolute STA/STX/STY (opcode-decode-based, ABS/ABX/ABY mode only) targeting
    $CC00-$CFFF (the 1000-byte alternate screen this whole investigation is about, rounded
    up to a full page) inside a file on `_CODE_FILES[title]`'s allowlist -- i.e. an
    established-real overlay/driver, never a data file -- across ALL disk sides. This is
    the round's bounded widening of the TARGET question (what writes text into these rows)
    from the prior pass's 3-file (COM.PREP/DUNGEON/INIT) check to every established-code
    file, both titles. Returns file -> [(body_offset, mnemonic, address), ...].

    RESULT (see the module docstring's 2026-08-12 "mon-verify" section and
    docs/engine/research/c64-mon-format.md section 13 for the full per-hit disassembly):
    STILL NO text-populating consumer found. INIT contains a real, byte-identical-in-shape-
    across-titles border-draw + full-screen-clear routine (writes only literal immediate
    constants -- $00/$24/$26 to screen memory, $0B/$0C to Color RAM, $20 for the clear --
    never an indexed read from a source buffer). CoK INIT's 16 border-group hits break down
    as 4 indexed span-fills of $00 (rows 0/4/23/20) + 6 absolute pokes of $24 + 6 of $26;
    the interleaved Color-RAM writes are outside the $CC00-$CFFF window and not among them.

    RETURN SHAPE, measured (CORRECTED 2026-08-12: the earlier wording merged both titles,
    omitted CoK GEN, and described multi-hit files as single writes):
      cok -> 5 files, 28 hits: INIT 20, COMBAT 3, DUNGEON 3, COM.PREP 1, GEN 1
      dok -> 8 files, 34 hits: INIT 20, CODE00 3, CODE03 3, DUNGEON 3, COMBAT 2,
                               CAMP 1, CODE01 1, COMPREP 1
    FIVE non-INIT hits are indexed rather than fixed-address (CORRECTED 2026-08-12: this
    said "three", which merged the two titles' counts) -- three on CoK (GEN offset 9241
    `STA $CEA6,X`, DUNGEON offset 8870 `STA $CFF8,Y`, COMBAT offset 519 `STA $CD57,Y`) and
    two on DoK (DUNGEON offset 7717 `STA $CFF8,Y`, COMBAT offset 499 `STA $CD57,Y`). Each
    stores a register or a literal immediate, not a byte read out of a source buffer, so
    the honest negative is unaffected; the rest are single absolute pokes.
    Two hits are not claimed as real, for DIFFERENT reasons (also corrected 2026-08-12 --
    both used to be described as "decoding as data/incoherent instructions"):
      * CoK GEN offset 9241 sits in a monotonically-ascending byte run that reads as a
        lookup table, not an instruction stream. That description stands.
      * CoK COMBAT offset 9432 ($2CD8) does NOT. Decoded from a natural boundary (body
        offset 9420 = $2CCC) the stream is coherent: STA $A905 / STX $A904 / JSR $122C /
        JMP $2CC1 / STA $CC00 / JSR $3046 / CMP #$53 / BNE $2CE9, and the same 9-byte
        STA/STX/JSR triple recurs at body offset 9397. What is unverified is its
        REACHABILITY: a byte-level scan of the whole CoK COMBAT body found no JSR/JMP-abs
        and no relative branch (at any byte offset) targeting $2CD8, and the preceding
        instruction is an unconditional JMP $2CC1.
    """
    bodies = c64k.all_bodies(title)
    out: dict[str, list[tuple[int, str, int]]] = {}
    for name in _CODE_FILES[title]:
        body = bodies.get(name)
        if body is None:
            continue
        hits: list[tuple[int, str, int]] = []
        for i in range(len(body) - 2):
            entry = c64d.OPCODES.get(body[i])
            if not entry:
                continue
            mnem, mode = entry
            if mnem in ("STA", "STX", "STY") and mode in (c64d.ABS, c64d.ABX, c64d.ABY):
                addr = body[i + 1] | (body[i + 2] << 8)
                if 0xCC00 <= addr < 0xD000:
                    hits.append((i, mnem, addr))
        if hits:
            out[name] = hits
    return out


# --- 2026-08-13 round: the indirect-indexed gap (rule 4) ---
#
# `screen_memory_writes()` (above) only scanned ABS/ABX/ABY-mode STA/STX/STY -- it never
# looked at indirect-indexed forms (`STA (zp),Y` / `STA (zp,X)`, 6502 addressing modes IZY
# / IZX), even though the row-pointer helper's own OUTPUT ($4E/$4F, per section 11) is
# read through exactly that addressing mode. That is the literal shape of the standing
# rule-4 mistake: a census that searches one operand SHAPE (absolute) cannot find writes
# that use the other. Two real findings from closing the gap (see
# docs/engine/research/c64-mon-format.md section 14 for the full disassembly):
#
#   1. The zero-page pointer $4C/$4D is NOT exclusive to the row-pointer helper's output.
#      `zp_indirect_store_census()` shows DUNGEON alone (both titles) writes through
#      `($4C),Y` from several OTHER sources -- most commonly a direct `LDX $7Fxx/$4C`
#      pair, unrelated to $2E84/$2E2D. Any `STA ($4C),Y` hit is therefore ambiguous
#      between "row-pointer helper output (-> $CC00 screen memory)" and "whatever else
#      last loaded $4C/$4D" until the specific call site's immediate history is checked.
#   2. A genuine, previously undocumented generic string primitive exists: CoK DUNGEON
#      $1802 / DoK DUNGEON $1601 (byte-for-byte identical shape in both titles) copies a
#      NUL-terminated byte string from a caller-supplied pointer (passed in A/X) to a
#      destination resolved through a bytecode-style "operand fetch" dispatcher into
#      $4C/$4D, one byte per `STA ($4C),Y`. It is reached by REAL, opcode-exact JSR/JMP
#      instructions in established-code files in both titles --
#      `print_string_routine_callers()` -- including two direct `JSR`s from DoK's own
#      COMPREP (combat-encounter setup, the file this whole investigation centers on).
#      The one call site whose SOURCE pointer resolves to a static literal (a CoK DUNGEON
#      `JMP` with `LDA #$00; LDX #$7A` immediately before it, i.e. source = literal $7A00)
#      was traced further: $7A00 is a shared, multi-owner scratch buffer written by at
#      least 6 different established-code files per title for unrelated purposes (menu
#      text, digit-formatting loops observed in COMBAT that filter/reverse a small
#      fixed-size array) -- NOT the raw $4000 MON buffer, and not obviously MON-shaped.
#      DoK COMPREP's own two call sites' source pointers could NOT be resolved statically
#      in this round (see the doc for exactly what's missing) -- reported open, not guessed.
_PRINT_STRING_ROUTINE = {"cok": 0x1802, "dok": 0x1601}

# `_CODE_FILES` deliberately omits LIBRARY: every consumer it was written for
# (`library_entry_census`, `library_window_hits`, `library_trace_seeds`) censuses calls
# INBOUND to LIBRARY, so including LIBRARY there would count the kernel's own internal
# JSRs as external callers. That omission is correct for those functions and WRONG for an
# operation census, which wants every established-code file including the resident kernel.
#
# CORRECTED 2026-08-13: the two functions below originally reused `_CODE_FILES` unchanged
# and so silently excluded LIBRARY -- the single largest established-code file in the
# corpus (7,435 B CoK / 7,467 B DoK) and the one whose interior C1.9 already solved. That
# is standing rule 4 ("search for the OPERATION, then classify what it does") failing at
# FILE scope instead of opcode-idiom scope, inside a docstring that invoked rule 4 by name.
# It mattered: LIBRARY holds 26 (CoK) / 27 (DoK) `STA (zp),Y` sites, including SEVEN through
# `$4C` and one through `$4E` -- the exact pointer pair section 14.2's whole argument is
# about. See c64-mon-format.md section 14.5 for the print loop that turned up there.
_OPERATION_CENSUS_FILES: dict[str, set[str]] = {
    t: files | {"LIBRARY"} for t, files in _CODE_FILES.items()
}


def zp_indirect_store_census(title: str) -> dict[tuple[str, int], int]:
    """(file, zp_address) -> count, for every `STA (zp),Y` (opcode $91, mode IZY) inside a
    file on `_OPERATION_CENSUS_FILES[title]`'s allowlist (`_CODE_FILES` PLUS LIBRARY --
    see the note above that constant), across ALL disk sides. This is the indirect-indexed
    counterpart `screen_memory_writes()` never covered (see the module note above) -- it
    does NOT itself prove any hit reaches $CC00-$CFFF (indirect addressing is
    data-dependent on whatever last loaded the zp pointer pair), but it is the census a
    rule-4-compliant search for "the operation, not one idiom" requires before individual
    sites can be classified. Reproduce and see individual site classifications in
    docs/engine/research/c64-mon-format.md section 14.

    Totals: CoK 174 hits / 62 distinct (file, zp) pairs; DoK 242 / 78. The pre-correction
    LIBRARY-excluding figures were CoK 148/51 and DoK 215/66 -- and the doc's first draft
    printed 46/47 for the pair counts, which reproduced from nothing at all.
    """
    bodies = c64k.all_bodies(title)
    out: dict[tuple[str, int], int] = {}
    for name in _OPERATION_CENSUS_FILES[title]:
        body = bodies.get(name)
        if body is None:
            continue
        for i in range(len(body) - 2):
            entry = c64d.OPCODES.get(body[i])
            if entry == ("STA", c64d.IZY):
                key = (name, body[i + 1])
                out[key] = out.get(key, 0) + 1
    return out


def print_string_routine_callers(title: str) -> dict[str, list[int]]:
    """Every REAL (opcode-exact `JSR`/`$20` or `JMP`/`$4C`, absolute mode) reference to
    the generic NUL-terminated string-copy primitive found this round
    (`_PRINT_STRING_ROUTINE`: CoK DUNGEON $1802 / DoK DUNGEON $1601), restricted to
    `_OPERATION_CENSUS_FILES[title]`'s established-code allowlist (`_CODE_FILES` PLUS
    LIBRARY -- see the note above that constant), across ALL disk sides.

    CORRECTED 2026-08-13: this also originally omitted LIBRARY. Widening it changed NOTHING
    here -- LIBRARY contains zero opcode-exact JSR/JMP references to either title's routine
    (verified by direct byte scan, both titles) -- so the caller lists below stand as
    written. Recorded anyway, because "the widened scan found no new hits" and "the scan was
    never widened" are different facts and only one of them is evidence.

    FACT (this round, both titles individually confirmed by disassembly -- see
    c64-mon-format.md section 14): CoK -- one hit, `DUNGEON` body offset 4427 (`JMP
    $1802`), a tail-call from inside DUNGEON's own body with a literal `LDA #$00; LDX
    #$7A` (source = $7A00) immediately before it. DoK -- three hits: `DUNGEON` body
    offset 3914 (`JMP $1601`, the structural analog of CoK's), plus TWO real `JSR $1601`
    calls from `COMPREP` (body offsets 719 and 3914) -- i.e. DoK's own combat-encounter-
    setup overlay calls this routine directly, twice, unlike CoK's COM.PREP (which has no
    opcode-exact reference to $1802 at all in this census). An UNRESTRICTED byte-match
    search (not opcode-filtered, not code-file-restricted) additionally turns up matches
    in `PIC64`/`SPRITE0C` (CoK) and `ECL21`/`PIC18`/`PIC72` (DoK) -- all confirmed false
    positives by inspection (wrong opcode, e.g. `STA`/`ASL` absolute, or a real JSR/JMP
    byte pair landing inside a DATA file never independently executed), the same
    byte-alias failure mode this file's own docstring already documents for `SPELLE66`/
    `CODE00`/`PIC07`. Excluded here by construction (allowlist + opcode filter), not
    manually vetted per-call the way those three precedents were.
    """
    bodies = c64k.all_bodies(title)
    target = _PRINT_STRING_ROUTINE[title]
    out: dict[str, list[int]] = {}
    for name in _OPERATION_CENSUS_FILES[title]:
        body = bodies.get(name)
        if body is None:
            continue
        for i in range(len(body) - 2):
            if body[i] in (0x20, 0x4C) and (body[i + 1] | (body[i + 2] << 8)) == target:
                out.setdefault(name, []).append(i)
    return out


# --- 2026-08-13 round (C1.6): tracing the print loop's OWN $07/$08 source pointer ---
#
# Section 14.5 found the destination side of the LIBRARY string-print loop is settled
# ($4E/$4F = $CC00 + row*40, proven by section 11) but left the SOURCE side -- who sets
# $07/$08 -- entirely un-enumerated. This section closes that: every OPERATION that can
# write $07 or $08 (STA/STX/STY zero-page, plus the INC/DEC the loop's own tail uses),
# across `_OPERATION_CENSUS_FILES` (both titles), classified site by site. Full writeup:
# docs/engine/research/c64-mon-format.md section 14.7.

#: Zero-page STA/STX/STY (direct, NOT indirect-indexed -- that's `zp_indirect_store_census`
#: above) opcodes, and the two zero-page INC/DEC opcodes the loop's own tail uses to
#: advance $07/$08 after each character. Together these are every opcode that can WRITE
#: a zero-page byte outright (as opposed to reading it, as `LDA ($07),Y` does).
_ZP_STORE_OPCODES = {0x85: "STA", 0x86: "STX", 0x84: "STY"}
_ZP_INCDEC_OPCODES = {0xE6: "INC", 0xC6: "DEC"}

#: The print loop's own source-pointer pair (section 14.5's instructions (b)/(h)/(i)).
_SOURCE_PTR_ZP = (0x07, 0x08)

#: The loop's own tail (section 14.5, lines `INC $07`/`INC $08`) advances the pointer by
#: one byte per character -- this IS one of the "INC/DEC $07/$08" hits the census below
#: finds, but it is the loop's own bookkeeping, not an external writer setting an initial
#: value, so it is called out by (file, offset) here rather than silently mixed in.
#: (LIBRARY, offset) for INC $07 in both titles; INC $08 follows 4 bytes later.
_LOOP_SELF_ADVANCE_INC07 = {"cok": ("LIBRARY", 306), "dok": ("LIBRARY", 225)}


def source_pointer_writer_census(title: str) -> dict[str, list[tuple[int, str, int]]]:
    """Every STA/STX/STY (zero-page mode) or INC/DEC (zero-page mode) targeting `$07` or
    `$08`, across `_OPERATION_CENSUS_FILES[title]` (established code + LIBRARY, all disk
    sides) -- the OPERATION census standing rule 5 requires (search for every store
    opcode that can touch the address, not one idiom). Returns file -> sorted
    [(body_offset, mnemonic, zp_addr), ...]. Does NOT itself resolve what value each site
    writes -- see `docs/engine/research/c64-mon-format.md` section 14.7 for the
    site-by-site source classification (literal / table lookup / register copy /
    unresolved) done by manual disassembly on top of this census.

    Totals (reproduced independently from the census, not asserted):
    CoK 72 hits across 8 files (35 at $07 + 37 at $08); DoK 82 hits across **11** files (40
    at $07 + 42 at $08). CORRECTED 2026-08-13 (round #3): this said "9 files" for DoK, which
    matches neither the census nor section 14.7.1's own per-file list (CAMP, CODE00, CODE03,
    COMPREP, DUNGEON, GDRIVE00, GDRIVE04, GEN, INIT, LIBRARY, POSTCOM = 11).

    CAVEAT, established the same round by `census_alignment_report()`: this is a RAW OPCODE
    BYTE scan and cannot tell an instruction from another instruction's operand byte. SIX of
    the 154 hits are byte aliases (`CENSUS_BYTE_ALIAS_SITES`), so the real writer population
    is at most 148. Use `resolve_source_pointer()` when the distinction matters.
    """
    bodies = c64k.all_bodies(title)
    out: dict[str, list[tuple[int, str, int]]] = {}
    for name in _OPERATION_CENSUS_FILES[title]:
        body = bodies.get(name)
        if body is None:
            continue
        hits: list[tuple[int, str, int]] = []
        for i in range(len(body) - 1):
            op = body[i]
            mnem = _ZP_STORE_OPCODES.get(op) or _ZP_INCDEC_OPCODES.get(op)
            if mnem is None:
                continue
            zp = body[i + 1]
            if zp in _SOURCE_PTR_ZP:
                hits.append((i, mnem, zp))
        if hits:
            out[name] = hits
    return out


#: Immediate-load opcodes for the three registers, used by `mon_page_immediate_sweep`.
_IMMEDIATE_LOAD_OPCODES = {0xA9: "LDA", 0xA2: "LDX", 0xA0: "LDY"}

#: High byte of the MON staging page (`$4000`), i.e. the byte anyone building a literal
#: pointer INTO the MON record would have to load.
MON_PAGE_HIGH_BYTE = 0x40


def mon_page_immediate_sweep(title: str, window: int = 8) -> dict[str, list[tuple[int, str, int]]]:
    """The corpus-wide "does anyone literally reach for the MON page?" sweep.

    For every `STA`/`STX`/`STY $08` site in `source_pointer_writer_census(title)` -- `$08`
    being the HIGH byte of the print loop's source pointer, so the only one that could
    select the `$4000` page -- scan the `window` bytes immediately before it for an
    immediate load of `#$40` (`LDA #$40` / `LDX #$40` / `LDY #$40`). Returns
    file -> [(store_offset, load_mnemonic, load_offset), ...]; an empty dict means no site
    in the whole population is fed by that idiom.

    RESULT at the documented 8-byte window: **zero hits, both titles**, over the full
    154-site census (CoK 72 + DoK 82; of which 29 CoK / 33 DoK are `$08` stores, the only
    ones this sweep can hit). This is the "cheapest and most direct" check
    `docs/engine/research/c64-mon-format.md` section 14.7.3 describes and section 14.7.4
    calls the investigation's strongest single piece of evidence against the print loop
    being a MON-text consumer.

    WIDENING THE WINDOW IS NOT CLEAN, and the prose never said so: 8 and 16 are empty in
    both titles, but **32 finds one DoK hit and 64 finds one CoK hit** -- the analogous
    cross-title pair `(store 5444, LDX, load 5406)` in CoK and `(store 5269, LDX, load
    5239)` in DoK. Both are byte-real `LDX #$40; LDY #$0D; JSR ...` sites, and both are
    non-genuine as sources of `$08`, for two independent reasons visible in the raw bytes:

      * the `LDX` is consumed immediately by the very next `JSR` (CoK `$343E`, DoK `$33DB`),
        which takes the X/Y pair as its own parameters; and
      * the store is not even reachable by fall-through from there -- the bytes between end
        `... JSR $3DDC; JMP $3DE8` (DoK: `JSR $3D43; JMP $3D3A`), so the `STA $07; STX $08`
        that follows is the JUMP TARGET's own body, a separate routine, not a continuation.

    So the negative survives, but it survives on an argument the 8-byte window was hiding
    rather than making. Reported here rather than tuned away: the honest form of this result
    is "empty at 8/16, and the two hits at 32/64 are disassembled and excluded", not "empty
    at every width".

    **Deliberately over-inclusive, and that is the point.** The backward scan matches RAW
    BYTES, not decoded instructions -- a `40` that is really an operand or the tail of some
    other instruction counts as a hit. That is the opposite of this project's usual
    opcode-exact discipline, and it is the correct direction here: the claim being tested is
    a NEGATIVE ("nobody does this"), so a search that over-reports and STILL returns nothing
    is strictly stronger than an exact one that returns nothing. An opcode-exact version
    could only ever find fewer sites.

    ADDED 2026-08-13. This sweep previously existed ONLY as prose in section 14.7.3 -- no
    function, no test -- while section 14.7.4 leaned on it as the strongest evidence in the
    whole investigation. A claim that load-bearing must be re-runnable from the owned files
    alone, which is what this function and its tests now make it. The window width was also
    an unexplained magic 8 in that prose; it is a parameter here, and
    `MON_PAGE_SWEEP_WINDOWS` pins the answer at all four widths -- including the two widths
    that are NOT empty.
    """
    census = source_pointer_writer_census(title)
    bodies = c64k.all_bodies(title)
    out: dict[str, list[tuple[int, str, int]]] = {}
    for name, hits in census.items():
        body = bodies[name]
        found: list[tuple[int, str, int]] = []
        for off, mnem, zp in hits:
            if zp != 0x08 or mnem not in ("STA", "STX", "STY"):
                continue
            for back in range(max(0, off - window), off):
                load = _IMMEDIATE_LOAD_OPCODES.get(body[back])
                if load is not None and back + 1 < len(body) and body[back + 1] == MON_PAGE_HIGH_BYTE:
                    found.append((off, load, back))
        if found:
            out[name] = found
    return out


#: Window widths the sweep's tests re-run at. The doc's original prose used 8 with no
#: justification; 16/32/64 are the robustness check it never ran. 8 and 16 are empty in both
#: titles; 32 and 64 are NOT (see `mon_page_immediate_sweep`'s docstring for the two
#: disassembled, excluded hits) -- pinned per width rather than as one blanket claim.
MON_PAGE_SWEEP_WINDOWS = (8, 16, 32, 64)

#: Exact expected `mon_page_immediate_sweep` output per (title, window). Pins the empty
#: widths AND the two non-empty ones, so a future change that made the 8-byte window start
#: reporting hits -- or that silently swallowed the 32/64 ones -- goes red either way.
MON_PAGE_SWEEP_EXPECTED: dict[tuple[str, int], dict[str, list[tuple[int, str, int]]]] = {
    ("cok", 8): {}, ("cok", 16): {}, ("cok", 32): {},
    ("cok", 64): {"LIBRARY": [(5444, "LDX", 5406)]},
    ("dok", 8): {}, ("dok", 16): {},
    ("dok", 32): {"LIBRARY": [(5269, "LDX", 5239)]},
    ("dok", 64): {"LIBRARY": [(5269, "LDX", 5239)]},
}


#: The print loop's own address cluster is NOT one entry point -- disassembly this round
#: (docs/engine/research/c64-mon-format.md section 14.7) found FIVE: `field_setter` takes
#: row/col in A/Y and falls through; `param_entry` (by far the most-called -- see
#: `print_loop_entry_callers`) reads `$08` for an unrelated ROM/RAM-bank-switch decision
#: before falling into the same row-wrap-then-print sequence; `row_post_entry` is
#: LIBRARY's own jump-table slot skipping the row-wrap check (CoK only -- DoK's jump
#: table, 3 slots, does not reach this cluster at all); `loop_start` is the exact address
#: section 14.5's quoted block begins at, and has ZERO opcode-exact JSR/JMP references
#: anywhere in either title's corpus -- it is reached ONLY by fall-through from the
#: row-wrap comparison immediately before it, never called directly; `global_ptr_entry`
#: takes a source pointer in A/X, stores it to the shared globals `$7FFE`/`$7FFF`, then
#: copies THAT into `$07`/`$08` and falls into `param_entry` -- a second, independently
#: real front door (**10 CoK / 9 DoK** established-code callers, all resolved -- see the
#: doc). CORRECTED 2026-08-13: this said "9 established-code callers per title", which is
#: DoK's number applied to both; `test_global_ptr_entry_is_a_second_real_front_door` has
#: pinned 10/9 since it was written, so only the prose was ever wrong.
PRINT_LOOP_ENTRIES: dict[str, dict[str, int]] = {
    "cok": {"field_setter": 0x2EA5, "param_entry": 0x2EAB, "row_post_entry": 0x2ECF,
            "loop_start": 0x2ECC, "global_ptr_entry": 0x41E3},
    "dok": {"field_setter": 0x2E54, "param_entry": 0x2E5A, "row_post_entry": 0x2E7E,
            "loop_start": 0x2E7B, "global_ptr_entry": 0x4141},
}


def print_loop_entry_callers(title: str, entry: str) -> dict[str, list[int]]:
    """Every REAL (opcode-exact `JSR`/`$20` or `JMP`/`$4C`, absolute mode) reference to
    `PRINT_LOOP_ENTRIES[title][entry]`, restricted to `_OPERATION_CENSUS_FILES[title]`,
    across all disk sides. Returns file -> sorted [body_offset, ...].

    FACT (this round -- see c64-mon-format.md section 14.7 for the full per-site
    disassembly): `param_entry` is the loop cluster's real front door -- **22 CoK / 26
    DoK** established-code call sites, spanning nearly every overlay in the corpus -- the
    first ENUMERATED population behind section 14.5's "suspected general-purpose kernel
    print" hedge. Per title, not pooled:

      * CoK (22): LIBRARY 11, POST.COM 4, GEN 3, DUNGEON 2, CAMP 1, INIT 1.
      * DoK (26): LIBRARY 10, CODE00 4, POSTCOM 4, DUNGEON 2, GEN 2, CAMP 1, CODE03 1,
        GDRIVE04 1.

    CORRECTED 2026-08-13: this said "27 established-code call sites in EACH title" over a
    single pooled file list (CAMP, DUNGEON, GEN, INIT, POST.COM/POSTCOM, CODE00/CODE03,
    GDRIVE04, LIBRARY). Neither title has 27, and the file list was the UNION of the two --
    CoK reaches this entry from no CODE00/CODE03/GDRIVE04 at all. The pinning test
    (`test_param_entry_is_the_clusters_real_front_door`) has asserted 22/26 since it was
    written, so the defect was confined to this prose. `field_setter` has only LIBRARY's own jump-table
    JMP as a confirmed caller in CoK (slot 6) and ZERO in DoK. `row_post_entry` has only
    LIBRARY's own jump-table JMP in CoK (slot 5) and ZERO in DoK (its 3-slot table never
    reaches this cluster). `loop_start` has ZERO callers in both titles (fall-through
    only, see `PRINT_LOOP_ENTRIES`'s own docstring).
    """
    target = PRINT_LOOP_ENTRIES[title][entry]
    bodies = c64k.all_bodies(title)
    out: dict[str, list[int]] = {}
    for name in _OPERATION_CENSUS_FILES[title]:
        body = bodies.get(name)
        if body is None:
            continue
        for i in range(len(body) - 2):
            if body[i] in (0x20, 0x4C) and (body[i + 1] | (body[i + 2] << 8)) == target:
                out.setdefault(name, []).append(i)
    return out


#: The seven `STA ($4C),Y` sites per title section 14.2's correction flagged as an open,
#: un-walked LIBRARY population. All 14 (7 CoK + 7 DoK) are walked this round -- see
#: c64-mon-format.md section 14.7 for the disassembly each label below is derived from.
#: NONE reads through `$07`/`$08` -- they use five OTHER source mechanisms (a sibling
#: `($A7),Y` row-copy, a literal-`$20` blank/space fill used twice per title, a small
#: reusable "putchar + color" utility, a two-plane font-bitmap copy shared verbatim
#: between titles at source addresses `$7C00`/`$7D20`, and a table-driven hex-nibble
#: formatter used twice per title for a 2-digit value). This is a further widening of
#: section 14.2's "$4C/$4D is a general-purpose current-pointer pair" finding: now SEVEN
#: purposes are attested (the four section 14.2 already had, plus these five, minus
#: overlap), none of them the `$07`/`$08` print loop's own destination-setting idiom.
LIBRARY_STA_4C_SITES: dict[str, dict[int, str]] = {
    "cok": {
        0x2E4F: "row_copy_from_A7A8",
        0x2F89: "row_blank_fill_space",
        0x2FC9: "row_blank_fill_space",
        0x30E2: "putchar_plus_color",
        0x337B: "font_bitplane_copy_7C00_7D20",
        0x4177: "hex_nibble_format",
        0x4182: "hex_nibble_format",
    },
    "dok": {
        0x2DF8: "row_copy_from_A7A8",
        0x2F3D: "row_blank_fill_space",
        0x2F72: "row_blank_fill_space",
        0x309B: "putchar_plus_color",
        0x3343: "font_bitplane_copy_7C00_7D20",
        0x40B8: "hex_nibble_format",
        0x40C3: "hex_nibble_format",
    },
}


def check_library_4c_sites(title: str) -> dict[int, bool]:
    """Byte-exact verification that every address in `LIBRARY_STA_4C_SITES[title]` really
    decodes as `STA ($4C),Y` (opcode `$91`, operand `$4C`) at that address in the real
    LIBRARY body -- so the labels above are pinned to bytes, not just asserted. Returns
    addr -> True/False (True for every entry, both titles, as of this round).
    """
    body = c64k.kernel_body(title)
    org = c64k.KERNEL_ORIGIN
    out: dict[int, bool] = {}
    for addr in LIBRARY_STA_4C_SITES[title]:
        off = addr - org
        out[addr] = 0 <= off < len(body) - 1 and body[off] == 0x91 and body[off + 1] == 0x4C
    return out


# =====================================================================================
# 2026-08-13 round #3 (C1.6): MECHANISING the $07/$08 source census
#
# Section 14.7 hand-walked 68 of the 154 `source_pointer_writer_census()` sites and left 86
# counted-but-never-disassembled. Hand-walking does not scale; the machinery to mechanise it
# already existed in this repo for a DIFFERENT pointer (`c64_sprite.scan_generic_loader_call_
# sites` / `_find_setter` / `_resolve_x`, docs/engine/research/c64-sprite-format.md section
# 12.3: decode-aligned scan + bounded backward instruction walk resolving X and A). This
# section ports that method to the `$07`/`$08` question so ALL 154 sites get a mechanical,
# re-runnable classification instead of a 44%-walked prose argument. Full writeup:
# docs/engine/research/c64-mon-format.md section 14.8.
# =====================================================================================

#: Established runtime origins, per file, for every file that carries `$07`/`$08` writer
#: sites (plus its established siblings). Sources, all elsewhere in this project, none
#: invented here: LIBRARY `$2DC8` and LINKER `$2D00` (c64_kernel.KERNEL_ORIGIN /
#: LINKER_ORIGIN, docs/engine/research/c64-resident-kernel.md); the GDRIVE family `$C000`
#: (c64_sprite's `GDRIVE01_TABLE_SPAN`/`GDRIVE00_EXCLUSIVE_TAIL`); `FASTL.O` `$B700`
#: (c64-resident-kernel.md section 10.2); DoK `CODE03` `$8000` (SOLVED, section 10.3),
#: `CODE01` `$8000` (a corroborated lead), `CODE00` `$8000` (explicitly UNRESOLVED there --
#: recorded in `_ORIGIN_UNCERTAIN` below so nothing silently depends on it). Every other
#: file is an ordinary LINKER-dispatched overlay at the fixed `$0800` slot.
#:
#: Origin affects only ADDRESS REPORTING and the "is this table/global inside the owning
#: file's own body" containment test -- never the decode alignment or the register
#: resolution, which are computed on body offsets and are origin-independent.
_FILE_ORIGINS: dict[str, int] = {
    "LIBRARY": c64k.KERNEL_ORIGIN,
    "LINKER": c64k.LINKER_ORIGIN,
    "GDRIVE00": 0xC000, "GDRIVE01": 0xC000, "GDRIVE02": 0xC000,
    "GDRIVE04": 0xC000, "GDRIVE05": 0xC000,
    "FASTL.O": 0xB700,
    "CODE00": 0x8000, "CODE01": 0x8000, "CODE03": 0x8000,
}
_OVERLAY_ORIGIN = 0x0800
#: Files whose origin above is NOT established (see `_FILE_ORIGINS`'s note on CODE00).
_ORIGIN_UNCERTAIN = frozenset({"CODE00"})


def file_origin(name: str) -> int:
    """Runtime origin for `name`'s body offset 0 -- see `_FILE_ORIGINS`. Unlisted files are
    ordinary `$0800` overlay-slot files."""
    return _FILE_ORIGINS.get(name, _OVERLAY_ORIGIN)


def _build_setter_tables() -> dict[str, dict[int, tuple[str, str, str]]]:
    """opcode -> (mnemonic, addressing mode, role) for EVERY documented opcode that can
    change A, X or Y -- derived from `c64_disasm.OPCODES` itself rather than hand-listed, so
    standing rule 4 ("search for every opcode/idiom that can perform the operation") holds by
    construction and cannot drift as the opcode table changes.

    Role is one of: `load` (the value comes from the operand), `transfer` (the value comes
    from another register or the stack), `clobber` (the register is modified by arithmetic /
    inc / dec / shift -- the value is COMPUTED, so an earlier load is NOT the source and the
    walk must stop here rather than reporting it).
    """
    loads = {"A": "LDA", "X": "LDX", "Y": "LDY"}
    transfers = {"A": {"PLA", "TXA", "TYA"}, "X": {"TAX", "TSX"}, "Y": {"TAY"}}
    clobbers = {
        "A": {"ADC", "SBC", "AND", "ORA", "EOR"},
        "X": {"INX", "DEX"},
        "Y": {"INY", "DEY"},
    }
    out: dict[str, dict[int, tuple[str, str, str]]] = {"A": {}, "X": {}, "Y": {}}
    for op, (mnem, mode) in c64d.OPCODES.items():
        for reg in ("A", "X", "Y"):
            if mnem == loads[reg]:
                out[reg][op] = (mnem, mode, "load")
            elif mnem in transfers[reg]:
                out[reg][op] = (mnem, mode, "transfer")
            elif mnem in clobbers[reg]:
                out[reg][op] = (mnem, mode, "clobber")
            elif reg == "A" and mnem in ("ASL", "LSR", "ROL", "ROR") and mode == c64d.ACC:
                out[reg][op] = (mnem, mode, "clobber")
    return out


_REG_SETTERS = _build_setter_tables()

#: Which register each writer opcode takes its value from. `INC`/`DEC` take none.
_STORE_REGISTER = {0x85: "A", 0x86: "X", 0x84: "Y"}

#: Unconditional control-flow terminators. If the backward walk crosses one of these before
#: finding a setter, the store cannot be reached by fall-through from anything before it, so
#: its register value MUST come from a caller / a branch predecessor -- that is a different,
#: strictly more informative answer than "ran out of lookback depth", and the two are
#: reported as different kinds (`caller_register` vs `unresolved`).
_FLOW_TERMINATORS = {0x60, 0x40, 0x4C, 0x6C}  # RTS, RTI, JMP abs, JMP (ind)
#: A JSR between the setter and the store can clobber the register inside the callee. Not
#: fatal (many real idioms do `LDA #imm; JSR ...; STA $07` where the callee preserves A), but
#: it is recorded per site so the confidence of a resolution is visible rather than assumed.
_JSR = 0x20


def _decode_run(body: bytes, start: int, stop: int) -> list[tuple[int, int, str, bytes]] | None:
    """Linear decode from body offset `start`; return the instruction list iff the decode
    lands EXACTLY on `stop` as an instruction boundary and every byte in between is a
    documented opcode with an in-range operand. `None` otherwise (an undefined opcode, an
    operand running past `stop`, or an overshoot -- all of which mean this start position is
    not a valid alignment). Entries are `(offset, opcode, mode, operand_bytes)`.
    """
    out: list[tuple[int, int, str, bytes]] = []
    pc = start
    while pc < stop:
        entry = c64d.OPCODES.get(body[pc])
        if entry is None:
            return None
        _mnem, mode = entry
        size = c64d.SIZE[mode]
        if pc + size > stop:
            return None  # operand straddles the site -> this alignment is wrong
        out.append((pc, body[pc], mode, body[pc + 1:pc + size]))
        pc += size
    return out if pc == stop else None


def instructions_before(body: bytes, off: int, depth: int = 12) -> list[tuple[int, int, str, bytes]]:
    """Up to `depth` decoded instructions ending exactly at body offset `off`, recovered by
    FORWARD RE-SYNC: try every start position in a bounded window before `off` and keep the
    earliest one whose linear decode lands exactly on `off` with no undefined opcodes.

    This is the backward half of `c64_sprite`'s decode-aligned method (section 12.3), made
    local: it does not depend on a global linear decode from body offset 0 staying in sync
    across the whole file (which it does not, in files with embedded data -- DUNGEON, GEN and
    POST.COM all carry long non-code runs), and it does not depend on a control-flow trace
    having reached the site. Its own failure mode is visible: if NO start position in the
    window syncs, an empty list comes back and the site is classified `unaligned`.
    """
    window = 3 * depth + 3  # a 6502 instruction is 1-3 bytes, so this can always hold `depth`
    for start in range(max(0, off - window), off):
        run = _decode_run(body, start, off)
        if run is not None:
            return run
    return []


class SourceSite(NamedTuple):
    """One classified `$07`/`$08` writer site."""

    file: str
    offset: int          # body offset of the writing instruction
    address: int         # its runtime address (body offset + `file_origin(file)`)
    mnemonic: str        # STA / STX / STY / INC / DEC
    zp: int              # 0x07 or 0x08
    kind: str            # see `SOURCE_KINDS`
    detail: str          # the resolving instruction, rendered
    value: int | None    # the literal byte, when `kind == "literal"`
    source: int | None   # table base / global address / zp address, when the kind names one
    back: int | None     # instruction distance from the store to its resolver
    via_jsr: bool        # a JSR sits between the resolver and the store
    sync: int            # instructions the forward re-sync recovered before the site. A
                         # SHORT sync (1-2) means no long clean instruction chain reaches
                         # this offset -- the site is probably inside data (see
                         # `CENSUS_BYTE_ALIAS_SITES`); 0 means no alignment at all.


#: Every classification `resolve_source_pointer` can return, with what it means.
SOURCE_KINDS = {
    "self_advance": "the print loop's own `INC $07`/`INC $08` per-character advance",
    "increment": "some OTHER INC/DEC of the pointer (a different routine's own advance)",
    "literal": "an immediate load -- the byte written is statically known",
    "table": "an indexed load (abs,X / abs,Y) -- the table BASE is known, contents are not",
    "global": "an absolute unindexed load -- a copy of another memory cell",
    "zeropage": "a zero-page load -- a copy of another zero-page cell",
    "indirect": "an indirect-indexed load -- pointer-dependent, not statically resolvable",
    "computed": "the register was last modified by arithmetic/shift/inc/dec",
    "stack": "PLA/TSX -- the value came off the stack",
    "caller_register": "no setter, and the walk crossed an unconditional flow terminator: "
                       "the register must be supplied by a caller or a branch predecessor",
    "unresolved": "no setter found within the lookback depth",
    "unaligned": "no start position in the window decodes cleanly onto this site -- the "
                 "census hit is not at a real instruction boundary (a byte alias)",
}


def _render(op: int, mode: str, opnd: bytes, addr: int) -> tuple[str, int | None]:
    """(rendered instruction text, absolute/zp address it names or None)."""
    mnem, _ = c64d.OPCODES[op]
    lo = opnd[0] if opnd else 0
    hi = opnd[1] if len(opnd) > 1 else 0
    text, named = c64d.operand(mode, lo, hi, addr)
    return (f"{mnem} {text}".rstrip(), named)


def _classify_setter(body: bytes, run: list, idx: int, reg: str,
                     org: int, hops: int = 1) -> tuple[str, str, int | None, int | None, int, bool]:
    """Walk backward through `run` from index `idx` (exclusive) for the nearest instruction
    that sets `reg`. Returns (kind, detail, value, source, back, via_jsr).

    `hops` allows resolving ONE register-transfer indirection (`LDA #imm; TAX` -> X is known),
    the same single hop `c64_sprite._resolve_x` documents as the only indirect shape that
    corpus actually uses; a second transfer in the chain is reported as a transfer, not
    followed further.
    """
    setters = _REG_SETTERS[reg]
    via_jsr = False
    for back, j in enumerate(range(idx - 1, -1, -1), start=1):
        off, op, mode, opnd = run[j]
        if op == _JSR:
            via_jsr = True
        if op in _FLOW_TERMINATORS:
            return ("caller_register", f"crossed {c64d.OPCODES[op][0]} at +{back}",
                    None, None, back, via_jsr)
        info = setters.get(op)
        if info is None:
            continue
        mnem, smode, role = info
        text, named = _render(op, smode, opnd, org + off)
        if role == "load":
            if smode == c64d.IMM:
                return ("literal", text, opnd[0], None, back, via_jsr)
            if smode in (c64d.ABX, c64d.ABY):
                return ("table", text, None, named, back, via_jsr)
            if smode == c64d.ABS:
                return ("global", text, None, named, back, via_jsr)
            if smode in (c64d.ZP, c64d.ZPX, c64d.ZPY):
                return ("zeropage", text, None, named, back, via_jsr)
            return ("indirect", text, None, named, back, via_jsr)
        if role == "transfer":
            if mnem in ("PLA", "TSX"):
                return ("stack", text, None, None, back, via_jsr)
            src = {"TXA": "X", "TYA": "Y", "TAX": "A", "TAY": "A"}[mnem]
            if hops <= 0:
                return ("computed", text, None, None, back, via_jsr)
            k, d, v, s, b, vj = _classify_setter(body, run, j, src, org, hops - 1)
            return (k, f"{text} <- {d}", v, s, back + b, via_jsr or vj)
        return ("computed", text, None, None, back, via_jsr)
    return ("unresolved", f"no {reg} setter within {len(run)} instructions",
            None, None, None, via_jsr)


def resolve_source_pointer(title: str, depth: int = 12,
                           files: dict[str, set[str]] | None = None) -> list[SourceSite]:
    """MECHANICAL classification of EVERY site `source_pointer_writer_census(title)` finds --
    all 154 (72 CoK + 82 DoK), not the 44% section 14.7 could hand-walk.

    For each site: recover a real instruction boundary by forward re-sync
    (`instructions_before`), then walk backward through the decoded stream for the nearest
    instruction that sets the register the store writes from (`STA`->A, `STX`->X, `STY`->Y),
    using a setter table derived from the whole opcode table (`_build_setter_tables`), and
    classify the result (see `SOURCE_KINDS`). `INC`/`DEC` sites are classified without a walk:
    they advance an existing pointer rather than setting one.

    Returns a flat list of `SourceSite`, sorted by (file, offset). `depth` is the backward
    lookback in INSTRUCTIONS; per standing rule 1 the depth is an analysis-window edge, so
    `source_pointer_depth_sensitivity()` reports the same totals at depth-1 and depth+1.
    """
    census = source_pointer_writer_census(title) if files is None else _census_over(title, files)
    bodies = c64k.all_bodies(title)
    out: list[SourceSite] = []
    for name in sorted(census):
        body = bodies[name]
        org = file_origin(name)
        self_advance = _LOOP_SELF_ADVANCE_INC07[title]
        for off, mnem, zp in census[name]:
            addr = org + off
            if mnem in ("INC", "DEC"):
                is_self = (name == self_advance[0] and
                           off in (self_advance[1], self_advance[1] + 4))
                sync = len(instructions_before(body, off, depth))
                kind = "unaligned" if sync == 0 else (
                    "self_advance" if is_self else "increment")
                out.append(SourceSite(name, off, addr, mnem, zp, kind,
                                      f"{mnem} ${zp:02X}", None, None, None, False, sync))
                continue
            run = instructions_before(body, off, depth)
            if not run:
                out.append(SourceSite(name, off, addr, mnem, zp, "unaligned",
                                      "no clean decode lands on this offset", None, None,
                                      None, False, 0))
                continue
            walk = run[-depth:]
            reg = _STORE_REGISTER[body[off]]
            kind, detail, value, source, back, via_jsr = _classify_setter(
                body, walk, len(walk), reg, org)
            out.append(SourceSite(name, off, addr, mnem, zp, kind, detail, value, source,
                                  back, via_jsr, len(run)))
    return sorted(out, key=lambda s: (s.file, s.offset))


def _census_over(title: str, files: dict[str, set[str]]) -> dict[str, list[tuple[int, str, int]]]:
    """`source_pointer_writer_census` over an arbitrary file allowlist -- the rule-2 lever
    (see `unrestricted_census_delta`). Kept private: the public census deliberately names its
    own file set."""
    bodies = c64k.all_bodies(title)
    out: dict[str, list[tuple[int, str, int]]] = {}
    for name in files[title]:
        body = bodies.get(name)
        if body is None:
            continue
        hits = []
        for i in range(len(body) - 1):
            mnem = _ZP_STORE_OPCODES.get(body[i]) or _ZP_INCDEC_OPCODES.get(body[i])
            if mnem is not None and body[i + 1] in _SOURCE_PTR_ZP:
                hits.append((i, mnem, body[i + 1]))
        if hits:
            out[name] = hits
    return out


def resolved_pointer_addresses(title: str, depth: int = 12,
                               pair_window: int = 8) -> list[tuple[str, int, int, int]]:
    """Every fully-resolved 16-bit source pointer: a `literal` `$07` (low byte) site paired
    with a `literal` `$08` (high byte) site within `pair_window` BYTES in the same file.
    Returns `(file, lo_offset, hi_offset, address)` sorted.

    This is the list the round's headline claim is graded against: does ANY of these land in
    `$4000`-`$41E0`? (`mon_window_hits()`.)
    """
    lit = [s for s in resolve_source_pointer(title, depth) if s.kind == "literal"]
    los = [s for s in lit if s.zp == 0x07]
    his = [s for s in lit if s.zp == 0x08]
    out: list[tuple[str, int, int, int]] = []
    for lo in los:
        cands = [h for h in his if h.file == lo.file and 0 < h.offset - lo.offset <= pair_window]
        if not cands:
            continue
        hi = min(cands, key=lambda h: h.offset)
        out.append((lo.file, lo.offset, hi.offset, lo.value | (hi.value << 8)))
    return sorted(out)


def mon_window_hits(title: str, depth: int = 12) -> dict[str, list]:
    """The round's refutation test, in three independent shapes -- ANY non-empty list is a
    candidate MON-buffer consumer and would reopen the whole question:

      * `literal_pointers`  -- a fully resolved literal pointer pair landing in `$4000`-`$41E0`.
      * `page_immediate`    -- ANY `$08` (high-byte) site whose resolved literal is `$40`,
                               paired or not. This is the decode-aligned, register-correct
                               replacement for `mon_page_immediate_sweep`'s raw byte scan: it
                               matches the instruction that actually sets the stored register,
                               at a real instruction boundary, at any distance up to `depth`,
                               instead of any `#$40`-shaped byte pair within N raw bytes.
      * `chased_globals`    -- a `global`-kind pair whose RAM cells' own writers all resolve
                               to literals (`chased_global_pointers`), giving a 16-bit
                               address in the window. This is the ONE shape that is not
                               empty: DoK's `$4129`, and it is proven self-referential.
      * `table_or_global`   -- a `$08` site fed by a table/global/zeropage whose SOURCE cell is
                               inside the owning file's own readable body AND whose readable
                               contents contain the byte `$40` (i.e. a non-immediate idiom that
                               could still select the MON page). Table contents are read for
                               256 bytes from the base; a global for 1 byte.
    """
    lo, hi = _MON_WINDOW
    bodies = c64k.all_bodies(title)
    sites = resolve_source_pointer(title, depth)
    out: dict[str, list] = {"literal_pointers": [], "page_immediate": [],
                            "chased_globals": [], "table_or_global": []}
    for f, l_off, h_off, addr in resolved_pointer_addresses(title, depth):
        if lo <= addr < hi:
            out["literal_pointers"].append((f, l_off, h_off, addr))
    for c in chased_global_pointers(title, depth):
        for a in c["in_mon_window"]:
            out["chased_globals"].append((c["file"], c["lo_offset"], c["hi_offset"], a,
                                          "self_reference" if a in c["self_reference"]
                                          else "EXTERNAL"))
    for s in sites:
        if s.zp == 0x08 and s.kind == "literal" and s.value == MON_PAGE_HIGH_BYTE:
            out["page_immediate"].append((s.file, s.offset, s.detail))
        if s.zp == 0x08 and s.kind in ("table", "global", "zeropage") and s.source is not None:
            body = bodies[s.file]
            org = file_origin(s.file)
            start = s.source - org
            span = 256 if s.kind == "table" else 1
            if s.kind == "zeropage" or not (0 <= start < len(body)):
                continue  # source cell is live RAM, not a readable byte in this file's image
            chunk = body[start:start + span]
            if MON_PAGE_HIGH_BYTE in chunk:
                out["table_or_global"].append(
                    (s.file, s.offset, s.detail, s.source,
                     [i for i, b in enumerate(chunk) if b == MON_PAGE_HIGH_BYTE][:8]))
    return out


def unresolved_high_byte_sources(title: str, depth: int = 12) -> list[tuple[str, int, str, int]]:
    """The honest gap, enumerated: every `$08` (page-selecting) site whose source is a
    table/global/zeropage cell that is NOT readable out of any file body this project can
    place -- i.e. the sites where "no MON-window hit" cannot be checked by reading bytes.
    Returns `(file, offset, kind, source_address)`.

    SIX per title, and the same shape in both: the third resident region `$9E00`/`$9F00`,
    `$9E8C`/`$9F8C` (LIBRARY's two message tables), `$9F9E` (GEN's global), one
    title-specific table (`$9718` CoK GEN / `$89DE` DoK GEN, `$EB2C` DoK CODE03), the
    `$7F8B` DUNGEON accumulator table (CoK only), and `$7FFF` -- which
    `chased_global_pointers()` closes one hop further in both titles.
    """
    bodies = c64k.all_bodies(title)
    out = []
    for s in resolve_source_pointer(title, depth):
        if s.zp != 0x08 or s.kind not in ("table", "global", "zeropage"):
            continue
        if s.source is None:
            continue
        off = s.source - file_origin(s.file)
        if not (0 <= off < len(bodies[s.file])):
            out.append((s.file, s.offset, s.kind, s.source))
    return out


def source_pointer_depth_sensitivity(title: str, depths=(11, 12, 13)) -> dict[int, dict[str, int]]:
    """Standing rule 1: the backward-walk depth IS an analysis-window edge, so the counts
    immediately OUTSIDE both edges are reported next to the headline. Returns
    depth -> {kind: count} for each depth in `depths`."""
    out: dict[int, dict[str, int]] = {}
    for d in depths:
        counts: dict[str, int] = {}
        for s in resolve_source_pointer(title, d):
            counts[s.kind] = counts.get(s.kind, 0) + 1
        out[d] = dict(sorted(counts.items()))
    return out


#: Standing rule 2, discharged explicitly rather than inherited. `_OPERATION_CENSUS_FILES`
#: was built as `_CODE_FILES | {LIBRARY}` for the INBOUND-CALL question, and `_CODE_FILES`
#: itself was assembled for the LIBRARY-entry census. Reusing it for the `$07`/`$08`
#: operation census is itself a filter and needs its own justification. What it excludes,
#: measured (`unrestricted_census_delta`), is 326 of CoK's 342 files and 254 of DoK's 273 --
#: every one of which is a documented asset/data family (MON*, GEO*, PIC*/COMPIC*, SPRITE*,
#: ECL*, WALLSET*/WALLDEF*, ITEM*, SPELL*, CHARSET/CHARPIC, MUSIC, TITLEPG, SECSET*,
#: portrait/banner strings) with exactly TWO names that are even arguably code: `COMBAT2`
#: (proven >95% printable ASCII, a data table COMBAT reads -- see `_CODE_FILES`'s docstring)
#: and `SECSET02`/`10`/`64` (identification still open, c64-resident-kernel.md section 10.2).
#: Rather than argue the allowlist, this round MEASURES the delta: it runs the identical
#: census over EVERY file and classifies every extra hit.
_ALL_FILES_SENTINEL = "*"


def unrestricted_census_delta(title: str, depth: int = 12) -> dict:
    """Run the `$07`/`$08` write census over EVERY file on every disk side (no allowlist),
    and report what the allowlist excluded. Returns
    `{"extra_files": {name: n_hits}, "extra_sites": N, "aligned": [...], "mon_window": [...]}`
    where `aligned` is the subset of excluded-file hits that a forward re-sync can place at a
    real instruction boundary (the only ones that could possibly be real code) and
    `mon_window` is any of those whose resolved source lands in `$4000`-`$41E0`.
    """
    bodies = c64k.all_bodies(title)
    allow = _OPERATION_CENSUS_FILES[title]
    everything = {title: set(bodies)}
    full = _census_over(title, everything)
    extra = {n: v for n, v in full.items() if n not in allow}
    aligned: list[tuple[str, int, str, int, str, str]] = []
    lo, hi = _MON_WINDOW
    mon: list = []
    literals: dict[str, dict[int, tuple[int, int]]] = {}
    for name, hits in sorted(extra.items()):
        body = bodies[name]
        for off, mnem, zp in hits:
            if mnem in ("INC", "DEC"):
                continue
            run = instructions_before(body, off, depth)[-depth:]
            if not run:
                continue
            reg = _STORE_REGISTER[body[off]]
            kind, detail, value, source, _back, _vj = _classify_setter(
                body, run, len(run), reg, _OVERLAY_ORIGIN)
            aligned.append((name, off, mnem, zp, kind, detail))
            if kind == "literal" and value is not None:
                literals.setdefault(name, {})[off] = (zp, value)
            if zp == 0x08 and kind == "literal" and value == MON_PAGE_HIGH_BYTE:
                mon.append((name, off, detail, "page_immediate"))
    for name, sites in literals.items():  # the same lo/hi pairing the allowlisted census gets
        for off, (zp, val) in sites.items():
            if zp != 0x07:
                continue
            for other in range(off + 1, off + 9):
                if other in sites and sites[other][0] == 0x08:
                    addr = val | (sites[other][1] << 8)
                    if lo <= addr < hi:
                        mon.append((name, off, other, addr, "literal_pair"))
                    break
    return {
        "extra_files": {n: len(v) for n, v in sorted(extra.items())},
        "extra_sites": sum(len(v) for v in extra.values()),
        "aligned": aligned,
        "mon_window": mon,
    }


#: THREE of the 154 census sites are BYTE ALIASES -- not instructions at all -- found by
#: this round's decode-aligned pass and confirmed by reading the surrounding bytes. The
#: census (`source_pointer_writer_census`, a raw opcode-byte scan by construction) counts
#: them; every prose total built on it, including section 14.7's own "154", is therefore 3
#: too high. The REAL writer population is 71 CoK + 80 DoK = 151.
#:
#:   * CoK `CAMP` offset 125 (`$087D`) -- inside the operand of `STA $0886` at `$087C`.
#:     Context: `LDA $0890,X ; STA $0886 ; LDA $0891,X ; STA $0887 ; JSR $FFFF` -- a
#:     self-modifying-code patch of the JSR target two instructions later. `86 08` is the
#:     low half of the absolute operand `$0886`.
#:   * DoK `POSTCOM` offset 224 (`$08E0`) -- inside the operand of `JMP $0886` at `$08DF`
#:     (`4C 86 08`). Same alias byte pair, different host instruction.
#:   * DoK `CAMP` offset 184 (`$08B8`) -- inside CAMP's own menu dispatch DATA table, which
#:     the file's OWN code names as a table 20 bytes earlier (`LDA $08AD,X ; STA $08A3`),
#:     and which is immediately followed by the NUL-terminated menu string list
#:     `b"\x00SAVE\x00VIEW\x00MAGIC\x00REST\x00ALTER\x00FIX\x00EXIT\x00"`. CoK's structurally
#:     identical table at `$0890` holds different bytes and contains no `86 07` pair, which
#:     is exactly why CoK has no census hit there -- a cross-title asymmetry that is itself
#:     evidence the hit is data, not code.
#:
#: The first two are `unaligned` (no start position decodes onto them at all); the third is
#: reachable by a 1-instruction clean chain, so it is caught by its `sync` count, not by
#: alignment -- which is why `SourceSite.sync` exists.
CENSUS_BYTE_ALIAS_SITES: dict[str, dict[int, str]] = {
    "cok": {125: "CAMP", 337: "DUNGEON", 399: "DUNGEON"},
    "dok": {224: "POSTCOM", 3121: "CODE00", 457: "GEN"},
}

#: Two MORE census sites that are almost certainly not instructions either, but which the
#: mechanical `alias` test (a covering alignment better supported than the boundary one)
#: does NOT flag, so they are recorded separately rather than folded into the count above:
#:   * DoK `CAMP` 184 -- the menu-table case described above. Boundary chain = 1 instruction,
#:     no covering alignment at all, local illegal-opcode fraction 0.29.
#:   * DoK `INIT` 2208 (`$10A0`, `DEC $08`) -- inside a dense structured byte table
#:     (`FE C3 8A 02 D4 03 87 | FE C2 04 D6 05 | FE C2 06 D6 07 | FE FE 8A C6 08 D4 09 ...`),
#:     local illegal-opcode fraction 0.35, and its `boundary` chain (5) is itself made of
#:     nonsense (`INC $04C2,X ; DEC $05,X ; INC $06C2,X ...`). CoK's INIT has no analog.
#: Reported as LOW CONFIDENCE, not as proven aliases: the honest statement is that the real
#: writer population is AT MOST 148 (154 - 6 proven aliases; CoK 69 + DoK 79) and, if these
#: two also fall, 146 (CoK 69 + DoK 77).
CENSUS_LOW_CONFIDENCE_SITES: dict[str, dict[int, str]] = {
    "cok": {},
    "dok": {184: "CAMP", 2208: "INIT"},
}


def covering_instruction(body: bytes, off: int, name: str = "",
                         depth: int = 12) -> tuple[int, str, int] | None:
    """The BEST-SUPPORTED instruction whose operand swallows body offset `off`, as
    `(offset, rendered instruction, chain_length)`, or `None` if no alignment covers it.

    `chain_length` is how many instructions decode cleanly from the alignment's start up to
    and including the covering instruction. It is the load-bearing number: 6502 code is
    self-synchronising, so ALMOST EVERY offset has SOME one-instruction alignment that
    swallows it (start one byte early and `85` becomes the operand of `CPX #$85`). A covering
    alignment is only evidence when it is better supported than the boundary alignment --
    which is what `census_alignment_report()` compares it against, and what an earlier draft
    of this function got wrong by returning the first covering alignment it found (that
    version "proved" 33 CoK / 38 DoK sites were aliases, including sites hand-disassembled
    as real in section 14.7.3 -- a textbook false positive from an unnormalised score).
    """
    org = file_origin(name)
    limit = min(len(body), off + 4)
    best: tuple[int, str, int] | None = None
    for start in range(max(0, off - (3 * depth + 3)), off):
        pc, chain = start, 0
        while pc < limit:
            entry = c64d.OPCODES.get(body[pc])
            if entry is None:
                break
            size = c64d.SIZE[entry[1]]
            if pc + size > len(body):
                break
            chain += 1
            if pc < off < pc + size:
                cand = (pc, _render(body[pc], entry[1], body[pc + 1:pc + size], org + pc)[0],
                        chain)
                if best is None or cand[2] > best[2]:
                    best = cand
                break
            if pc == off:
                break  # this alignment makes `off` a real boundary, not a covered byte
            pc += size
    return best


def census_alignment_report(title: str, depth: int = 12) -> list[dict]:
    """For EVERY site in `source_pointer_writer_census(title)`: the boundary-alignment chain
    length (`sync`), the best covering alignment (`covered`), and the mechanical verdict
    `alias = covered_chain > sync`. This is the census's own quality control -- standing rule
    6 in the "a probe that never executes reads as PASS" sense applied to a census: a raw
    opcode-byte scan cannot tell an instruction from somebody else's operand byte, and this
    is the pass that measures how often it did not.
    """
    bodies = c64k.all_bodies(title)
    out: list[dict] = []
    for s in resolve_source_pointer(title, depth):
        cov = covering_instruction(bodies[s.file], s.offset, s.file, depth)
        out.append({"file": s.file, "offset": s.offset, "address": s.address,
                    "mnemonic": s.mnemonic, "zp": s.zp, "kind": s.kind, "sync": s.sync,
                    "covered": cov, "alias": bool(cov and cov[2] > s.sync)})
    return out


def census_alias_sites(title: str, depth: int = 12) -> list[tuple[str, int]]:
    """`(file, offset)` for every census site the alignment report calls a byte alias."""
    return [(r["file"], r["offset"]) for r in census_alignment_report(title, depth) if r["alias"]]


def check_census_byte_aliases(title: str, depth: int = 12) -> dict[tuple[str, int], dict]:
    """Byte-exact re-derivation of `CENSUS_BYTE_ALIAS_SITES`: for each listed site report
    `{"kind":..., "sync":..., "covered_by":...}` where `covered_by` is the (offset, rendered
    instruction) of the instruction whose operand SWALLOWS the site, searched by forward
    re-sync from the nearest clean anchor, or `None` when the site sits in a data table with
    no covering instruction. Pinned in `test_c64_mon_hp.py`.
    """
    bodies = c64k.all_bodies(title)
    sites = {(s.file, s.offset): s for s in resolve_source_pointer(title, depth)}
    out: dict[tuple[str, int], dict] = {}
    for off, name in CENSUS_BYTE_ALIAS_SITES[title].items():
        body = bodies[name]
        s = sites[(name, off)]
        out[(name, off)] = {"kind": s.kind, "sync": s.sync,
                            "covered_by": covering_instruction(body, off, name, depth)}
    return out


def _resolve_writers(title: str, target: int, depth: int = 12) -> list[tuple[str, int, str, int | None]]:
    """Every established-code absolute `STA`/`STX`/`STY` naming `target`, decode-aligned, with
    its own backward-resolved source. Returns `(file, offset, kind, literal_value_or_None)`.
    This is the ONE HOP that turns a `global`-kind site (a copy of some other memory cell)
    into an answer -- see `chased_global_pointers`."""
    bodies = c64k.all_bodies(title)
    out: list[tuple[str, int, str, int | None]] = []
    for name in sorted(_OPERATION_CENSUS_FILES[title]):
        body = bodies.get(name)
        if body is None:
            continue
        for i in range(len(body) - 2):
            entry = c64d.OPCODES.get(body[i])
            if not entry:
                continue
            mnem, mode = entry
            if mnem not in ("STA", "STX", "STY") or mode != c64d.ABS:
                continue
            if (body[i + 1] | (body[i + 2] << 8)) != target:
                continue
            run = instructions_before(body, i, depth)[-depth:]
            if not run:
                out.append((name, i, "unaligned", None))
                continue
            reg = {"STA": "A", "STX": "X", "STY": "Y"}[mnem]
            kind, _d, val, _s, _b, _vj = _classify_setter(
                body, run, len(run), reg, file_origin(name))
            out.append((name, i, kind, val))
    return out


def chased_global_pointers(title: str, depth: int = 12,
                           pair_window: int = 8) -> list[dict]:
    """The `global`-kind sites' one-hop closure: for each `$07`(low)/`$08`(high) pair that is
    a COPY of a fixed RAM cell pair (`LDA $xxxx; STA $07` / `LDA $yyyy; STA $08`), census
    every established-code absolute write to `$xxxx` and `$yyyy` (`_resolve_writers`) and, if
    every writer of both resolves to an immediate literal, report the resulting 16-bit
    pointer(s).

    This is what mechanically reproduces section 14.7.3's hand-found DoK `$4129` result: DoK
    LIBRARY has exactly ONE hard-coded writer pair for `$7FFE`/`$7FFF` (`LDA #$29` /
    `LDX #$41`), CoK has none (both CoK writers take A/X from their caller, which is
    `global_ptr_entry`'s documented front door). Each returned dict carries
    `self_reference`: True when the resolved address lands inside the CONSUMING file's own
    body span, i.e. the section-12 ambiguity, not the external MON buffer.
    """
    lib_lo, lib_hi = library_span(title)
    bodies = c64k.all_bodies(title)
    sites = resolve_source_pointer(title, depth)
    globals_ = [s for s in sites if s.kind == "global" and s.source is not None]
    out: list[dict] = []
    for lo in [s for s in globals_ if s.zp == 0x07]:
        cands = [h for h in globals_
                 if h.zp == 0x08 and h.file == lo.file and 0 < h.offset - lo.offset <= pair_window]
        if not cands:
            continue
        hi = min(cands, key=lambda h: h.offset)
        lo_w = _resolve_writers(title, lo.source, depth)
        hi_w = _resolve_writers(title, hi.source, depth)
        lo_v = sorted({v for _f, _o, k, v in lo_w if k == "literal" and v is not None})
        hi_v = sorted({v for _f, _o, k, v in hi_w if k == "literal" and v is not None})
        closed = (bool(lo_w) and bool(hi_w) and
                  all(k == "literal" for _f, _o, k, _v in lo_w + hi_w))
        addrs = [l | (h << 8) for l in lo_v for h in hi_v]
        org = file_origin(lo.file)
        body_span = (org, org + len(bodies[lo.file]))
        out.append({
            "file": lo.file, "lo_offset": lo.offset, "hi_offset": hi.offset,
            "lo_cell": lo.source, "hi_cell": hi.source,
            "writers": {"lo": lo_w, "hi": hi_w},
            "closed": closed, "addresses": addrs,
            "in_mon_window": [a for a in addrs if _MON_WINDOW[0] <= a < _MON_WINDOW[1]],
            "self_reference": [a for a in addrs
                               if (lib_lo <= a < lib_hi if lo.file == "LIBRARY"
                                   else body_span[0] <= a < body_span[1])],
        })
    return out


def entry_caller_sources(title: str, entry: str = "global_ptr_entry",
                         depth: int = 12) -> list[tuple[str, int, str, int | None, str, int | None]]:
    """Resolve the A (low byte) and X (high byte) each real caller of
    `PRINT_LOOP_ENTRIES[title][entry]` supplies, using the same backward walk. Returns
    `(file, call_offset, a_kind, a_value, x_kind, x_value)`.

    `global_ptr_entry` takes its source pointer in A/X (it stores them to `$7FFE`/`$7FFF`
    then copies those into `$07`/`$08`), so these 19 call sites are `$07`/`$08` writers in
    EFFECT without appearing in `source_pointer_writer_census` at all -- section 14.7.2's own
    reason the operation census alone is insufficient. Section 14.7.3 hand-resolved all 19;
    this reproduces them mechanically.
    """
    target = PRINT_LOOP_ENTRIES[title][entry]
    bodies = c64k.all_bodies(title)
    out = []
    for name in sorted(_OPERATION_CENSUS_FILES[title]):
        body = bodies.get(name)
        if body is None:
            continue
        for i in range(len(body) - 2):
            if body[i] not in (0x20, 0x4C):
                continue
            if (body[i + 1] | (body[i + 2] << 8)) != target:
                continue
            run = instructions_before(body, i, depth)[-depth:]
            org = file_origin(name)
            if not run:
                out.append((name, i, "unaligned", None, "unaligned", None))
                continue
            ak, _ad, av, _as_, _ab, _aj = _classify_setter(body, run, len(run), "A", org)
            xk, _xd, xv, _xs, _xb, _xj = _classify_setter(body, run, len(run), "X", org)
            out.append((name, i, ak, av, xk, xv))
    return out


def entry_caller_pointers(title: str, entry: str = "global_ptr_entry",
                          depth: int = 12) -> list[tuple[str, int, int]]:
    """The subset of `entry_caller_sources` where BOTH A and X resolve to immediates, as
    `(file, call_offset, address)` with `address = A | (X << 8)`."""
    return [(f, o, av | (xv << 8))
            for f, o, ak, av, xk, xv in entry_caller_sources(title, entry, depth)
            if ak == "literal" and xk == "literal" and av is not None and xv is not None]


# --- Standing rule 5: the same question, asked of all SEVEN C64 Gold Box titles ---
#
# Everything above is CoK/DoK-only because `c64_kernel.TITLE_DIRS` only knows those two (the
# resident-kernel origin `$2DC8` was solved for them). The print loop itself, though, is not
# obviously Krynn-specific, and that IS answerable corpus-wide with nothing but a byte
# search: the loop's own pointer advance is a 7-byte sequence with no operands to vary.
#: `INC $07 ; BNE +2 ; INC $08 ; INY` -- the print loop's per-character pointer advance,
#: quoted from section 14.5 and verified byte-exact at CoK LIBRARY offset 306 / DoK 225.
PRINT_LOOP_ADVANCE_BYTES = bytes.fromhex("e607d002e608c8")

_ALL_C64_TITLE_DIRS = {
    "por": "Pool of Radiance",
    "coab": "Curse of the Azure Bonds",
    "ssb": "Secret of the Silver Blades",
    "cok": "Champions of Krynn",
    "dok": "Death Knights of Krynn",
    "gate": "Gateway to the Savage Frontier",
    "buck": "Buck Rogers - Countdown to Doomsday",
}


def print_loop_advance_sweep() -> dict[str, list[tuple[str, str, int]]]:
    """Where `PRINT_LOOP_ADVANCE_BYTES` occurs in EVERY file of ALL SEVEN C64 Gold Box
    titles (`D:\\Games\\Emulator\\C64\\Goldbox`, every side, `*.d64` non-recursively so the
    `superseded\\` damaged dumps are never read). Returns title -> [(image, file, offset)].

    Standing rule 5 discharged with a real answer rather than a scope note: the sequence
    occurs EXACTLY ONCE, in the file named `LIBRARY`, in every one of the seven titles -- so
    this print loop is a shared resident-kernel primitive of the whole C64 Gold Box engine
    family, not a Krynn-specific routine. (Pool of Radiance additionally carries one copy in
    its `POOLRB` boot file.) Raises `c64k.SourceUnavailable` when `D:` is absent.
    """
    import glob as _glob
    import os as _os
    if not _os.path.isdir(c64k.GOLDBOX_ROOT):
        raise c64k.SourceUnavailable(c64k.GOLDBOX_ROOT)
    out: dict[str, list[tuple[str, str, int]]] = {}
    for key, folder in _ALL_C64_TITLE_DIRS.items():
        hits: list[tuple[str, str, int]] = []
        for image in sorted(_glob.glob(_os.path.join(c64k.GOLDBOX_ROOT, folder, "*.d64"))):
            disk = c64.read_image(image)
            for entry in c64.directory(disk):
                data, problem = c64.read_file_checked(disk, entry)
                if problem:
                    continue
                body = data[2:]
                start = body.find(PRINT_LOOP_ADVANCE_BYTES)
                while start != -1:
                    hits.append((_os.path.basename(image), entry.name, start))
                    start = body.find(PRINT_LOOP_ADVANCE_BYTES, start + 1)
        out[key] = hits
    return out


#: The 44 LIBRARY sites section 14.7.3 hand-walked (22 per title), as
#: `(cok_offset, dok_offset) -> expected mechanical kind`. This is the CROSS-CHECK the task
#: requires before any NEW classification from `resolve_source_pointer` is trusted: the
#: mechanical resolver must independently reproduce every one of these hand classifications.
#: The prose labels map onto `SOURCE_KINDS` as follows -- "the loop's own advance" ->
#: `self_advance`, "a DIFFERENT routine's advance" -> `increment`, "literal $XXXX" ->
#: `literal`, "X-indexed lo/hi table" -> `table`, "caller-supplied X/Y register pair" ->
#: `caller_register`, "copy of $7FFE/$7FFF" -> `global`.
HANDWALKED_LIBRARY_SITES: tuple[tuple[int, int, str], ...] = (
    (306, 225, "self_advance"), (310, 229, "self_advance"),
    (996, 925, "literal"), (1000, 929, "literal"),
    (1631, 1532, "literal"), (1635, 1536, "literal"),
    (1660, 1561, "table"), (1665, 1566, "table"),
    (1727, 1628, "literal"), (1731, 1632, "literal"),
    (3257, 3114, "table"), (3262, 3119, "table"),
    (3846, 3697, "caller_register"), (3848, 3699, "caller_register"),
    (3963, 3814, "increment"), (3967, 3818, "increment"),
    (3987, 3838, "caller_register"), (3989, 3840, "caller_register"),
    (5176, 5008, "global"), (5181, 5013, "global"),
    (5442, 5267, "caller_register"), (5444, 5269, "caller_register"),
)

#: The literal ADDRESSES section 14.7.3 hand-resolved, per title, as
#: `(file, lo_offset) -> address`. `resolved_pointer_addresses()` must reproduce each.
HANDWALKED_LITERAL_POINTERS: dict[str, dict[tuple[str, int], int]] = {
    "cok": {("COM.PREP", 2628): 0x4DE0, ("INIT", 790): 0x4DE0,
            ("LIBRARY", 996): 0x03D0, ("LIBRARY", 1631): 0x3430,
            ("LIBRARY", 1727): 0x7C00, ("POST.COM", 7588): 0x261F},
    "dok": {("CODE00", 898): 0x83F6, ("COMPREP", 2654): 0x4DE0,
            ("INIT", 795): 0x4DE0, ("LIBRARY", 925): 0x03D0,
            ("LIBRARY", 1532): 0x33CD, ("LIBRARY", 1628): 0x7C00,
            ("POSTCOM", 6184): 0x209E},
}

#: The 19 `global_ptr_entry` call sites section 14.7.3 hand-resolved (10 CoK + 9 DoK), as
#: `(file, call_offset) -> address` for the ones that resolved to a literal A/X pair. The
#: two "copy of `$7F41`/`$7F42`" sites and the two GEN Y-indexed-table sites are absent by
#: construction (they resolve to a mechanism, not an address); CoK `LIBRARY` 5903 is present
#: here but was NOT in the doc's hand-walked list -- the doc left it at "LIBRARY-internal,
#: not traced further" and this round resolves it mechanically to `$44DA` (inside LIBRARY's
#: own body, outside `$4000`-`$41E0`).
HANDWALKED_ENTRY_CALLER_POINTERS: dict[str, dict[tuple[str, int], int]] = {
    "cok": {("CAMP", 569): 0x25E1, ("CAMP", 4030): 0x27D3, ("DUNGEON", 7474): 0x0C32,
            ("GEN", 3669): 0x1693, ("GEN", 5712): 0x1E67, ("GEN", 6395): 0x2208,
            ("GEN", 6774): 0x228A, ("LIBRARY", 5903): 0x44DA},
    "dok": {("CAMP", 550): 0x24BC, ("CAMP", 3928): 0x26AE, ("CODE01", 78): 0x239C,
            ("GEN", 4101): 0x1856, ("GEN", 6647): 0x220E, ("GEN", 7338): 0x25B1,
            ("GEN", 7702): 0x262A},
}


class MonRecord(NamedTuple):
    """A parsed `MON<hex>` payload. Only code-proven fields are named; everything else
    stays in `raw` rather than being guessed into a struct field."""

    raw: bytes
    name: str


def _petscii_name(payload: bytes) -> str:
    """Decode the name field per the FACT above: offset 0, NUL/high-byte terminated.

    The scrub loop (see module docstring) treats any byte >= $40 in offsets 0..39 as
    non-text and blanks it for display; a NUL (0x00) is the natural terminator for the
    ASCII names actually observed (e.g. b'BAAZ\\x00...'). Mirrors that behaviour: stop at
    the first byte that is 0x00 or >= 0x40 and is not a printable ASCII letter/space.
    """
    out = bytearray()
    for b in payload[NAME_OFFSET:NAME_OFFSET + NAME_SCRUB_LENGTH]:
        if b == 0x00:
            break
        if 0x20 <= b < 0x40 or 0x41 <= b <= 0x5A:
            out.append(b)
        else:
            break
    return out.decode("ascii", errors="replace")


def parse_mon_record(data: bytes) -> MonRecord:
    """Parse a `MON<hex>` file's raw bytes (INCLUDING the 2-byte C64 load address).

    Strips the load-address prefix (see the offset-2 rule in `c64_disk.py`), then
    decodes only what the code proves. Raises ValueError if the payload length is not
    the observed-constant 480 bytes -- a length surprise is more useful reported than
    silently reinterpreted.
    """
    if len(data) < 2:
        raise ValueError(f"MON record too short to hold a load address: {len(data)} bytes")
    payload = data[2:]
    if len(payload) != MON_PAYLOAD_LENGTH:
        raise ValueError(
            f"unexpected MON payload length {len(payload)} (expected {MON_PAYLOAD_LENGTH})"
        )
    return MonRecord(raw=payload, name=_petscii_name(payload))


def read_mon_file(path: str | Path) -> MonRecord:
    """Read and parse a loose extracted `MON<hex>` PRG file from disk."""
    return parse_mon_record(Path(path).read_bytes())


def read_mon_from_image(image_path: str | Path, filename: str) -> MonRecord:
    """Read and parse `filename` (e.g. "MON01") directly out of a `.d64`/`.g64` image."""
    disk = c64.read_image(image_path)
    entries = {e.name: e for e in c64.directory(disk)}
    if filename not in entries:
        raise KeyError(f"{filename!r} not found on {image_path}")
    data, problem = c64.read_file_checked(disk, entries[filename])
    if problem:
        raise ValueError(f"{filename}: {problem}")
    return parse_mon_record(data)


def describe(rec: MonRecord, title: str | None = None) -> str:
    lines = [f"name={rec.name!r}", f"payload_length={len(rec.raw)}"]
    if title and title in DOS_RECORD_LENGTH:
        dos_len = DOS_RECORD_LENGTH[title]
        lines.append(f"dos_record_length({title})={dos_len} delta={len(rec.raw) - dos_len:+d}")
    lines.append(
        f"sprite_pointer_field_offset=0x{SPRITE_POINTER_FIELD_OFFSET:02X} "
        f"(byte value at that offset: 0x{rec.raw[SPRITE_POINTER_FIELD_OFFSET]:02X})"
    )
    lines.append("name_scrub_consumer (2026-08-12): resolved to VIC-II screen memory "
                  "($CC00+row*40), NOT the raw MON buffer -- see c64-mon-format.md #11")
    if title:
        lo, hi = library_span(title)
        lines.append(
            f"LIBRARY body ({title}) spans ${lo:04X}-${hi-1:04X}, which fully contains "
            f"the ${_MON_WINDOW[0]:04X}-${_MON_WINDOW[1]:04X} window a prior scan "
            f"searched -- see c64-mon-format.md #12 (library_window_hits={len(library_window_hits(title))})"
        )
    lines.append("all other DOS-analog fields (hp/ac/thac0/saves/hitDice/category/"
                  "damage/xp/morale): UNPROVEN by C64 code -- not decoded here")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("path", help="MON<hex> PRG file, or a .d64/.g64 image with --entry")
    ap.add_argument("--entry", help="directory entry name to read out of a disk image (e.g. MON01)")
    ap.add_argument("--title", choices=sorted(DOS_RECORD_LENGTH), help="report delta vs this title's DOS record size")
    args = ap.parse_args(argv)

    rec = read_mon_from_image(args.path, args.entry) if args.entry else read_mon_file(args.path)
    print(describe(rec, args.title))
    return 0


if __name__ == "__main__":
    sys.exit(main())
