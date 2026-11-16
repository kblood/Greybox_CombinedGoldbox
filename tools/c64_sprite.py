#!/usr/bin/env python3
"""Decode the C64 Gold Box `SPRITE*` family: hardware VIC-II sprite bitmaps.

Method (per this project's convention): derive from the code that displays the data, then
confirm the result against the data itself, rather than fitting a layout to a byte count.

**The outer container is now understood; the small header/trailer's exact field semantics are
NOT fully proven** -- see docs/engine/research/c64-sprite-format.md for the full account of what
is derived from the disassembled driver versus what is a well-evidenced but unverified reading.

What is established
--------------------
1. **The pixel unit is a standard 64-byte VIC-II sprite block** (63 bytes of bitmap data, 21 rows
   of 3 bytes each = 24x21 pixels, plus 1 pad byte). This is proven two ways:
   - Pool of Radiance's `SPRITE*` files are EXACT multiples of 64 bytes (5..13 blocks, no header
     or trailer at all) -- there is no other divisor that explains all eight size clusters.
   - A quantitative per-frame **run-length coherence score** (average same-value run length per
     scanline; real line art has long runs, noise does not) measured across every corpus title
     favours the **HIRES** (1 bit/pixel) interpretation over MULTICOLOUR (2 bits/pixel) by at
     least 10:1 on every title with SPRITE data (Champions 284:28, Death Knights 180:14, Buck
     Rogers 285:26, Curse of the Azure Bonds 453:38, Secret of the Silver Blades 303:19, Pool of
     Radiance 593:45). This is the same kind of
     falsifiable structural test the DAX/DAA/C64-picture decoders were cracked with -- see
     `test_hires_beats_multicolour_on_the_whole_corpus`, which fails outright under a forced
     multicolour decode.
2. **Three container dialects**, distinguished purely by body length arithmetic, confirmed by
   inspecting the actual extra bytes (not just fitting the count):
   - **bare** (Pool of Radiance): body length is an exact multiple of 64. No header, no trailer.
   - **trailer**, 16 bytes at the END (Champions of Krynn, Death Knights of Krynn, Buck Rogers,
     Curse of the Azure Bonds): body length is `64*N + 16`. The trailing 6 bytes are `03 xx yy 00
     00 00` in 135 of the 136 trailer-dialect files -- far too improbable to be sprite pixel
     data, so this is metadata, not a 14th block. Byte 10 (`03`) never varies; bytes 11-12 vary
     with the file (`0F 3F` is the common case; Curse of the Azure Bonds also shows `03 3F`,
     `07 0F`, `03 0F`, `07 3F`), consistent with per-hardware-sprite VIC register masks
     ($D01D/$D015/$D01C: X-expand/enable/multicolour) but this reading is UNPROVEN -- see below.
   - **header**, 13 bytes at the START (Secret of the Silver Blades): body length is `13 + 64*N`.
     The 13 bytes show a clear coordinate-pair-plus-zeros shape (bytes 0-1 and 6-7 are near-equal
     X/Y-like pairs, bytes 2-5 and 8-9 are zero) -- structurally similar to the trailer's first two
     "records" but positioned at the opposite end of the file, which is why it reads as a header
     for this title rather than the trailer style used by the other four.
3. Frame count is always `N=13` for the trailer dialect; Secret's header dialect ships either
   `N=7` or `N=13`.

What is NOT established (deliberately left UNLOCATED, not invented)
---------------------------------------------------------------------------
- **The exact semantics of the header/trailer fields.** The consuming code in `GDRIVE01`
  (disassembled at $C6BA and $C744-C795, real origin $C000, stored load word $4000) reads a
  per-hardware-sprite pointer table via `STA (ptr),X` and a per-frame attribute byte via
  `LDA (ptr2),Y`, where `ptr`/`ptr2` are 16-bit variables at $C087/$C088 and $C08B/$C08C that
  GDRIVE01 itself never writes -- they are supplied by a CALLER. **2026-08-11: DUNGEON, COMBAT,
  COMBAT2 and CAMP (both Champions of Krynn and Death Knights of Krynn) are now disassembled and
  do NOT contain the caller** -- `find_param_block_refs` against all 8 files (read straight off
  the real disk images) returns zero genuine hits (one raw-offset match in each title's DUNGEON is
  a proven false positive, a misaligned byte pair inside an unrelated `STA ($4C),Y` operand, not a
  real reference). A second search style (immediate loads of the pointers' low bytes, `LDA
  #$83/$87/$8B` etc., looking for a `STA <zeropage>` setup instead of a literal absolute store)
  was also tried and also found nothing genuine. So the plausible reading that trailer bytes 10-12
  feed $D01D/$D015/$D01C, and that bytes 0-9 are two 5-byte colour+position "part records", still
  could not be bound to a specific file offset -- it is recorded as a hypothesis in the docs, not
  asserted by any test here. See the doc's 2026-08-11 section for the full ruled-out file list and
  the concrete next candidates.
  2026-08-12: those next candidates (SOUNDFX, SPR.TP, TITLEPG) plus MUSIC, CODE00/01/03 (Death
  Knights only) and SECSET64 are now all checked and ruled out too -- zero genuine $C080-$C08F
  references in any of them, in either title. The alternative "caller writes GDRIVE01's own
  self-modified operands directly" hypothesis was also swept, corpus-wide (all named PRG files on
  side 1 of both titles): the only hits are inside GDRIVE00, GDRIVE01 and (Death Knights only)
  GDRIVE04 themselves, every one explained as either GDRIVE01's own known self-patching or
  address-space aliasing between mutually-exclusive $C000-slot occupants (see doc). The caller
  remains unlocated; every named, extracted file on side 1 of both titles has now been checked
  under both hypotheses.
  2026-08-12 (round 2, the resident-kernel files LIBRARY/$2DC8 and LINKER/$2D00): both are now
  checked under both hypotheses too -- zero genuine hits beyond LIBRARY's already-known false
  positive (LINKER is checked for the first time, clean). LIBRARY DOES contain one genuine call
  into the $C000 driver slot -- `JSR $C003` (table slot 1), inside a tiny trampoline reached only
  from DUNGEON (both titles, cross-title consistent) -- but slot 1 is a different table entry from
  the sprite-composite entry (slot 19/20, $C6BA), and neither driver's own slot-1 target reads the
  $C080-$C08F block, so this is very likely driver init, not the sprite caller. Still no proof
  either way for its own GDRIVE00-vs-GDRIVE01 residency. Separately, a new disambiguation check
  (`find_gdrive00_exclusive_tail_refs`, entries 25-34 / $C04B-$C066, valid ONLY in GDRIVE00's own
  35-entry table) resolves a previously-ambiguous lead: COMBAT/COMBAT2/ECL64 (Champions of
  Krynn)/CODE03 (Death Knights) make a genuine direct `JSR $C03C` (the same table slot GDRIVE01
  uses for its sprite entry) -- but the SAME files also make genuine, alignment-verified calls
  into the GDRIVE00-exclusive tail in the same normal control flow, which only makes sense if
  GDRIVE00 (not GDRIVE01) is resident there. So this round's best-supported reading is that
  COMBAT's $C000-range calls, including $C03C, resolve against GDRIVE00, not GDRIVE01 -- the
  caller is still not there either. See docs section 10 for the full account.
  2026-08-13 (docs section 16): every round above ran on Champions of Krynn + Death Knights of
  Krynn ONLY -- 615 files -- while stating its negative as a fact about the format. Swept to all
  SEVEN titles (2,662 unique file bodies, 4,426 PRG directory entries, 49 sides) the answer is
  unchanged: zero genuine references. 417 raw hits; 294 are GDRIVE01's own self-patching, 106 are
  in data-like files (illegal-opcode fraction 17.3%-52.8%), and all 17 in code-like files are
  false positives of the two mechanisms sections 8.2/8.4 already document -- including the named
  first candidate (Buck Rogers COMBAT @2464/@2536, the trailing $BE operand byte of a real
  `LDA $BE75`) and the best-looking new lead (Curse of the Azure Bonds GDRIVE03's two well-aligned
  `JSR $C08A`, which `origin_census` shows is that file calling its OWN $C000-resident body). A
  third search idiom (`find_pointer_build_sites`) was added and swept at the same scope: 4 files
  carry it, 2 are code-like, both ruled out. Also corrected there: there are no GDRIVE01
  "variants" -- all seven titles ship the byte-identical 2560-byte body, see
  `GDRIVE01_BODY_SHA256`.
- **Per-hardware-sprite colour.** VIC-II sprite colour is an external register
  ($D027-$D02E), not part of the bitmap; this decoder exposes a caller-settable colour and
  defaults to a neutral one. The header/trailer's small (<=0x0F) byte at offset 1 (trailer) or
  11 (header) is plausibly a colour index, again unproven.
- Gateway to the Savage Frontier ships no `SPRITE*` files at all (0 across 8 sides).

See docs/engine/research/c64-sprite-format.md for the full investigation, including the
disassembly excerpts and the hypotheses that were tried and not confirmed.

Usage:
    python tools/c64_sprite.py --disk "D:/.../Champions of Krynn - Side 2.D64" --name SPRITE01 --out a.png
    python tools/c64_sprite.py --disk DISK.d64 --all --outdir renders/c64_sprite
    python tools/c64_sprite.py SPRITE01.prg --out a.png
"""

from __future__ import annotations

import argparse
import math
import random
import struct
import sys
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disasm as disasm  # noqa: E402
import c64_disk as c64  # noqa: E402

BLOCK = 64          # bytes per hardware sprite block
USABLE = 63          # bytes actually read by VIC-II (21 rows * 3 bytes)
ROWS = 21
ROW_BYTES = 3
SPRITE_W, SPRITE_H = ROW_BYTES * 8, ROWS   # 24 x 21

TRAILER_LEN = 16
HEADER_LEN = 13

# GDRIVE01's own parameter block (docs section 4): three caller-supplied 16-bit pointers at
# $C083/$C084, $C087/$C088 and $C08B/$C08C, read by absolute-mode LDA at $C6C6-$C0DB. The whole
# $C080-$C08F span is scanned (not just the two pointer pairs the trailer question turns on) so a
# hit can't be missed by only checking half the block.
GDRIVE01_PARAM_BLOCK = tuple(range(0xC080, 0xC090))


def find_param_block_refs(body: bytes, org: int = 0x0800) -> list[int]:
    """Body offsets of every absolute-mode (ABS/ABX/ABY) instruction whose operand names an
    address in `GDRIVE01_PARAM_BLOCK`. Thin wrapper over `c64_disasm.find_stores` -- see its
    docstring for the same "candidate, not proof" caveat: a hit can be a real reference OR a
    coincidental byte pair inside an unrelated instruction's operand, so always disassemble
    around a hit before trusting it (this is exactly how the one DUNGEON false positive at body
    offset 6244 in both Champions of Krynn and Death Knights of Krynn was told apart from a real
    reference -- see docs/engine/research/c64-sprite-format.md's 2026-08-11 section).

    `org` only affects how addresses are *labelled* by the caller, not which bytes are matched --
    the search is on literal little-endian operand bytes, so the default is harmless even when
    the real origin of the scanned file differs.
    """
    return disasm.find_stores(body, org, set(GDRIVE01_PARAM_BLOCK))


# 2026-08-12: while chasing the "does a caller build the block through self-modifying code a
# literal $C08x search can't see" hypothesis (docs section 4/8), GDRIVE01 turned out to have THREE
# internal entry points that each copy part of the $C080-$C08F block into their OWN self-modifying
# LDA/STA (abs){,X,Y} operands, not just the one excerpted in the doc's section 4:
#   entry ~$C449 (disassembled $C449-$C466): $C083/$C084 -> $C462/$C463, $C085/$C086 -> $C465/$C466
#   entry  $C6BA (doc section 4):            $C087/$C088 -> $C763/$C764, $C08B/$C08C -> $C76B/$C76C
#   entry ~$C8D3 (disassembled $C8C0-$C90E): $C083/$C084 -> $C8EE/$C8EF, $C08B/$C08C -> $C8FF/$C900
# ($C089/$C08A feed an ADC-based destination-pointer computation at this third entry, not a direct
# copy, so they are not included as a patch-target pair here.) This is the alternative surface
# hypothesis (1) from the task brief asked to be checked: maybe some overlay writes GDRIVE01's
# *patched* operand bytes directly instead of the untouched $C080-$C08F block. See the doc's
# 2026-08-12 section for the corpus-wide sweep result.
GDRIVE01_SELFMOD_PATCH_TARGETS = (
    0xC462, 0xC463, 0xC465, 0xC466,  # entry ~$C449
    0xC763, 0xC764, 0xC76B, 0xC76C,  # entry $C6BA (docs section 4)
    0xC8EE, 0xC8EF, 0xC8FF, 0xC900,  # entry ~$C8D3
)


def find_selfmod_patch_target_refs(body: bytes, org: int = 0x0800) -> list[int]:
    """Body offsets of absolute-mode references to `GDRIVE01_SELFMOD_PATCH_TARGETS` -- see the
    constant's docstring comment above. Same "candidate, not proof" caveat as
    `find_param_block_refs`: disassemble around any hit before trusting it."""
    return disasm.find_stores(body, org, set(GDRIVE01_SELFMOD_PATCH_TARGETS))


# 2026-08-12: the "which of GDRIVE00/GDRIVE01 is actually resident at a given $C000-range call
# site" disambiguation the caller hunt needs (docs section 10). GDRIVE01's own JMP table is only
# 25 entries ($C000-$C048, i.e. body offsets 0-0x48); GDRIVE00's is 35 entries at the SAME base
# address, so entries 0-24 ($C000-$C048) are indistinguishable between the two drivers by address
# alone -- a JSR there is real evidence of *a* resident $C000-slot driver, but not of WHICH one.
# Entries 25-34 ($C04B-$C066) exist ONLY in GDRIVE00's table; in GDRIVE01 those same addresses
# fall past its 25-slot table into its own local data/variable area (confirmed by disassembly --
# see the doc), so a genuine, aligned JSR/JMP into this span is real evidence GDRIVE00 -- not
# GDRIVE01 -- is resident at that call site.
GDRIVE01_TABLE_SPAN = tuple(range(0xC000, 0xC049))          # ambiguous: valid in EITHER driver
GDRIVE00_EXCLUSIVE_TAIL = tuple(range(0xC04B, 0xC067))       # discriminates: GDRIVE00 only


def find_gdrive00_exclusive_tail_refs(body: bytes, org: int = 0x0800) -> list[int]:
    """Body offsets of absolute-mode references into `GDRIVE00_EXCLUSIVE_TAIL`. Same
    "candidate, not proof" caveat as the other finders here -- always disassemble around a hit
    (and, for a large data-bearing file like DUNGEON, disassemble from well before the hit to
    confirm real instruction alignment reaches it, not just that the raw bytes match; DUNGEON's
    own body is known to contain long non-code data runs that alias many small absolute
    addresses by chance -- see docs section 10)."""
    return disasm.find_stores(body, org, set(GDRIVE00_EXCLUSIVE_TAIL))


def illegal_opcode_fraction(body: bytes) -> float:
    """Fraction of a linear 6502 decode, starting at body offset 0, that lands on an undefined
    opcode byte (not in `disasm.OPCODES`) or an instruction whose operand runs past the end of the
    file. Origin-independent -- instruction *boundaries* depend only on where decoding starts
    (offset 0 here), never on how the addresses are labelled.

    Used as a residence/code-vs-data probe for caller-search candidates that don't visibly
    disassemble as sensible code (see docs/engine/research/c64-sprite-format.md's 2026-08-12
    section): every $0800-family overlay this project has independently confirmed is real code
    (by its own self-consistent JMP table or call graph, not by this metric) scores LOW here --
    DUNGEON 7.7%, COMBAT 0.5%, LIBRARY 6.0%, GDRIVE01 8.3% (Champions of Krynn values; Death
    Knights' own LIBRARY/DUNGEON differ slightly at 6.6%/9.0%, still all under 10%). TITLEPG scores
    43.9%/42.7% (Champions/Death Knights), comfortably more than 4x the highest confirmed-code
    score in EITHER title (Death Knights' own ceiling is DUNGEON's 9.0%) -- consistent with it
    being picture data, not a code overlay, and in the same range as a same-corpus C64 `PIC`-family
    file (`PIC12`, 31.6%) whose own pixel encoding is itself unsolved (see
    docs/engine/research/c64-disk-format.md section 7.4) -- offered as a second non-code data
    point, not proof PIC12 is a verified-correct decode.
    This is a classification SIGNAL, not a decode: a wrong start offset for genuine code
    would also degrade this score, so a high fraction shows "not ordinary code starting at byte 0
    of this file", not conclusively "picture". Verified non-vacuous by mutation: slicing DUNGEON's
    own bytes to TITLEPG's length scores 11.4%, code-like, not 43.9% -- the metric tracks real
    content, not just file length.
    """
    pc = 0
    illegal = total = 0
    n = len(body)
    while pc < n:
        entry = disasm.OPCODES.get(body[pc])
        if entry is None:
            illegal += 1
            total += 1
            pc += 1
            continue
        size = disasm.SIZE[entry[1]]
        if pc + size > n:
            illegal += 1
            total += 1
            pc += 1
            continue
        total += 1
        pc += size
    return illegal / total if total else 0.0


# 2026-08-13: sweeping the five never-searched title corpora (docs section 16) needed the
# ad hoc "disassemble around the hit and read it" adjudication of sections 8/9 turned into
# something mechanical and mutation-testable, because the sweep produces 417 raw hits across
# 2,662 files -- far too many to read by hand, and reading-by-hand is exactly how the earlier
# rounds' overstated coverage claims happened. `GDRIVE01_BODY_SHA256` justifies reusing the
# CoK-derived constants on the other six titles; `alignment_vote` and `origin_census` do the
# adjudication.

# Every one of the seven C64 Gold Box titles ships the SAME 2560-byte GDRIVE01 body. The stored
# 2-byte CBM load word differs ($4000 in Champions of Krynn / Death Knights of Krynn / Buck
# Rogers / Secret of the Silver Blades, $3000 in Curse of the Azure Bonds / Gateway to the Savage
# Frontier, $1388 in Pool of Radiance) -- which is why the whole-FILE sha256 comes in three
# flavours -- but strip that word and all seven are byte-identical. That identity is what makes
# `GDRIVE01_PARAM_BLOCK` and `GDRIVE01_SELFMOD_PATCH_TARGETS`, both derived by disassembling
# Champions of Krynn's copy, valid unchanged in every title: the operands those constants name are
# literal bytes inside this shared body, so they cannot differ. It also means the load word is NOT
# the residence (three different values, one identical driver): the residence is re-derived per
# title from the body's own 25-entry JMP table via `origin_census`, and comes out $C000 in all
# seven -- see `test_gdrive01_body_is_byte_identical_in_all_seven_titles`.
GDRIVE01_BODY_SHA256 = "274e8f92e03bd63d818bf9afa1954c37a845a53bc3974b6511ddd5474019f269"


def leading_jmp_table(body: bytes) -> list[int]:
    """The run of `4C lo hi` (absolute JMP) triples starting at body offset 0, as target
    addresses. GDRIVE01's is 25 entries long in every title; GDRIVE00's is 35. Returns `[]` for a
    file that does not open with a jump table (GDRIVE03 and GDRIVE04 do not)."""
    out: list[int] = []
    i = 0
    while i + 2 < len(body) and body[i] == 0x4C:
        out.append(body[i + 1] | (body[i + 2] << 8))
        i += 3
    return out


def branch_targets(body: bytes) -> list[int]:
    """Absolute `JSR`/`JMP` operands seen by a linear 6502 decode from body offset 0.

    Origin-independent, same as `illegal_opcode_fraction`: instruction boundaries depend only on
    where the walk starts. Includes targets found inside embedded data (a linear decode cannot
    know where code stops), which is why `origin_census` scores a FRACTION rather than demanding
    that every target land inside the body."""
    out: list[int] = []
    pc, n = 0, len(body)
    while pc < n:
        entry = disasm.OPCODES.get(body[pc])
        if entry is None:
            pc += 1
            continue
        size = disasm.SIZE[entry[1]]
        if pc + size > n:
            pc += 1
            continue
        if body[pc] in (0x20, 0x4C):          # JSR abs / JMP abs
            out.append(body[pc + 1] | (body[pc + 2] << 8))
        pc += size
    return out


def origin_census(body: bytes, targets: list[int] | None = None,
                  lo: int = 0x0200, hi: int = 0x10000,
                  step: int = 0x100) -> list[tuple[float, int]]:
    """Census-scored residence sweep: score every page-aligned candidate origin by the fraction of
    the file's own absolute JSR/JMP targets that land inside its own body at that origin.

    Returned best-first as `[(fraction, origin), ...]`. This is the same self-containment evidence
    already used by hand to pin GDRIVE01 to $C000 (docs/engine/research/c64-disk-format.md section
    7.5) and GDRIVE00 to $C000 (c64-compic-format.md section 3a) -- mechanised so a file's
    residence can be re-derived instead of assumed. It has to be re-derived, not read off the PRG
    load word: all seven titles' GDRIVE01 bodies are identical yet carry three DIFFERENT stored
    load words ($4000/$3000/$1388), so the load word is a staging-buffer address, not a residence.

    Pass `targets=leading_jmp_table(body)` to score against a file's dispatch table alone, which
    is far sharper when the file has one (GDRIVE01: 25/25 targets inside, at $C000 UNIQUELY,
    every title) than the whole-body linear decode (which drags in targets found inside data).
    """
    tg = branch_targets(body) if targets is None else list(targets)
    if not tg:
        return []
    n = len(body)
    scored = [(sum(1 for t in tg if 0 <= t - org < n) / len(tg), org)
              for org in range(lo, hi, step)]
    scored.sort(key=lambda s: (-s[0], s[1]))
    return scored


def alignment_vote(body: bytes, off: int, window: int = 24) -> tuple[float, int, int]:
    """Adjudicate a raw `find_stores` hit: what fraction of nearby decode start points treat
    `off` as an instruction BOUNDARY rather than stepping over it as an operand byte?

    Returns `(fraction, aligned_count, stepped_count)`. 6502 code re-synchronises quickly after a
    wrong start, so for a genuine instruction almost every start in the window converges onto it;
    for the "hit is really the tail byte of the previous instruction's operand" false positive
    (docs section 8.4's GEN case, and the Buck Rogers COMBAT and Secret of the Silver Blades
    LIBRARY cases in section 16) the true instruction stream steps straight over it.

    Calibration, measured on the real disk images (docs section 16.3). The REAL population is
    every one of the 42 raw hits both scanners produce inside GDRIVE01's own shared body -- NOT a
    hand-picked shortlist, because a shortlist is itself a filter: an earlier draft used four
    cherry-picked references, reported a floor of 0.83, and the full population immediately
    refuted it. Real floor is 0.667 (body offsets 702/708/1115, all disassembled and all genuine
    `LDA $C08x`).

    **THERE IS NO SEPARATING GAP, and an earlier version of this docstring claimed one.**
    CORRECTED 2026-08-13. It read "the five hand-settled false positives top out at 0.458. Counts
    immediately outside both edges of the (0.458, 0.667) gap are zero, from both populations."
    The real population had just been widened from 4 cherry-picked references to all 42 -- and the
    false-positive population was left at the five cases inherited from docs sections 8.2/8.4, a
    set assembled for a different question. Fixing one side of a comparison and not the other
    manufactures the gap; that is standing rule 2, applied to the null side of the very
    cherry-picking correction the sentence before it describes.

    Scored against the round's OWN adjudicated false positives -- the 17 code-like hits docs
    section 16.5 tabulates, every one disassembled and ruled not-a-reference -- the votes span
    **0.000 to 1.000**, and **seven sit at or above the real floor of 0.667** (six `GDRIVE00`
    copies at 0.958, Pool of Radiance `POST.COM` at 1.000). No threshold separates the two
    populations. A LOW vote is still informative (0.00 is strong evidence of an operand-tail
    misread, which is how the `LIBRARY`/`ECL64` cases were settled); a HIGH vote means nothing on
    its own. Pinned by `test_alignment_vote_does_not_separate_real_references_from_false_positives`.

    **This is a necessary, not a sufficient, signal, and it must not be used alone.** It fails
    high two ways. In non-code data a byte run of 1-byte-decoding values makes every start
    converge trivially: 47 of the 106 raw hits this sweep found in data-like files score a perfect
    1.00 (docs section 16.4). And even inside a code-like file it fires on embedded text -- Pool of
    Radiance's POST.COM (8.8% illegal, comfortably code) votes 1.00 at a hit that is the trailing
    space of the literal string "GIVE HOW MUCH ". Always gate on `illegal_opcode_fraction` (or
    independent knowledge that the file is code) FIRST, then use this vote, then read the
    disassembly, and settle any $C000-range hit's residence with `origin_census` before calling it
    a call rather than aliasing.
    """
    aligned = stepped = 0
    n = len(body)
    for start in range(max(0, off - window), off):
        pc = start
        while pc < off:
            entry = disasm.OPCODES.get(body[pc])
            size = 1 if entry is None else disasm.SIZE[entry[1]]
            if pc + size > n:
                size = 1
            pc += size
        if pc == off:
            aligned += 1
        else:
            stepped += 1
    total = aligned + stepped
    return (aligned / total if total else 0.0), aligned, stepped


# Immediate-load opcodes whose operand could be half of a hand-built 16-bit pointer.
_IMMEDIATE_LOADS = (0xA9, 0xA2, 0xA0)     # LDA/LDX/LDY #imm


def find_pointer_build_sites(body: bytes, window: int = 16) -> list[int]:
    """Third search style (standing rule 4: search every idiom that can perform the operation).

    A caller that builds a zero-page pointer TO the parameter block -- `LDA #$83; STA $fb;
    LDA #$C0; STA $fc` -- never emits a literal `$C083` absolute operand, so neither
    `find_param_block_refs` nor `find_selfmod_patch_target_refs` can see it. This finds the
    signature that idiom must leave: an immediate load of a low byte in `$80-$8F` with an
    immediate load of `$C0` within `window` bytes on either side.

    Deliberately loose (it will fire on unrelated code that happens to load both values nearby),
    because the point is a cheap over-approximation that can then be adjudicated. Corpus result
    (docs section 16.5): 4 files across all seven titles, only 2 of them code-like, both ruled out
    by disassembly."""
    highs = [i for i in range(len(body) - 1)
             if body[i] in _IMMEDIATE_LOADS and body[i + 1] == 0xC0]
    if not highs:
        return []
    out = []
    for i in range(len(body) - 1):
        if body[i] in _IMMEDIATE_LOADS and 0x80 <= body[i + 1] <= 0x8F:
            if any(abs(h - i) <= window for h in highs):
                out.append(i)
    return out


# ---------------------------------------------------------------------------------------------
# 2026-08-12: inverting the caller hunt -- the code that LOADS a graphics driver, rather than
# the code that calls into one already resident (docs section 11 has the full narrative). The
# question "who requests GDRIVE01/02/04/05 by name" turned out to be the wrong shape: no file
# anywhere embeds a literal "GDRIVE01" (etc.) ASCII string (docs section 10.4). Instead LIBRARY
# has ONE generic per-family/area resource loader, and GDRIVE00's own stem string -- the only
# GDRIVE literal that exists on disk -- is a template whose trailing "00" gets patched at
# runtime with the two hex-ASCII digits of a caller-supplied 8-bit "area code". This section
# documents that mechanism, verified by direct disassembly in both titles.
#
# ITEMNAMES (loaded at the fixed $9E00, per docs/engine/research/c64-boot-chain.md) carries a
# 21-entry table of resource-family ASCII "stems" ("GDRIVE00", "SQRPACI00", "GEO00", ...,
# "MON00", ..., "ITEMFILE00"[, "CODE00" in Death Knights]) whose trailing 2 characters are a
# per-request placeholder. A 21-entry low-byte pointer table to those stems sits at a FIXED,
# cross-title-IDENTICAL address inside ITEMNAMES's own loaded bytes; a parallel high-byte table
# sits exactly one page higher. GDRIVE is table index 0 in BOTH titles -- confirmed directly by
# decoding the table (see `family_stem_table`): index 0 resolves to "GDRIVE00" (Champions of
# Krynn: table address $A767; Death Knights: $A748 -- different absolute addresses because the
# stem TEXT differs between the titles' ITEMNAMES layouts, but the POINTER TABLE address, and
# every entry's meaning, is identical).
FAMILY_TABLE_LOW = 0x9EE6    # low byte of each family's stem-string address, index 0..20
FAMILY_TABLE_HIGH = 0x9FE6   # high byte, same index -- always FAMILY_TABLE_LOW + 0x100
ITEMNAMES_LOAD_ADDR = 0x9E00  # ITEMNAMES's own fixed load address (docs/c64-boot-chain.md)
GDRIVE_FAMILY_INDEX = 0       # the Y value that selects the "GDRIVE" stem in that table


def family_stem_table(itemnames_body: bytes,
                       load_addr: int = ITEMNAMES_LOAD_ADDR) -> list[tuple[int, bytes]]:
    """Decode ITEMNAMES's own 21-entry family-stem pointer table (`FAMILY_TABLE_LOW`/`_HIGH`).

    Returns `[(address, up_to_12_bytes_at_that_address), ...]`, index 0 = GDRIVE. The snippet is
    a fixed 12-byte read starting at the pointed-to address (not a proper length-delimited
    string decode -- Champions' stems run concatenated with no separator at all, Death Knights'
    are NUL-separated; 12 bytes safely covers the longest stem, "ITEMFILE00", either way). Used
    by the tests to pin the real, disassembly-derived table content rather than re-deriving it
    from a hardcoded guess.
    """
    lo_off = FAMILY_TABLE_LOW - load_addr
    hi_off = FAMILY_TABLE_HIGH - load_addr
    lo = itemnames_body[lo_off:lo_off + 21]
    hi = itemnames_body[hi_off:hi_off + 21]
    out = []
    for i in range(len(lo)):
        addr = lo[i] | (hi[i] << 8)
        off = addr - load_addr
        snippet = itemnames_body[off:off + 12] if 0 <= off < len(itemnames_body) else b""
        out.append((addr, snippet))
    return out


# LIBRARY's own entry points for the generic loader (see the module-level narrative above),
# located by disassembling forward from the KERNAL LOAD/SETNAM wrapper region documented in
# docs/engine/research/c64-resident-kernel.md. All three are reached with the caller's resource
# "family" index already in X (used throughout via `,X`-indexed addressing) and the requested
# 8-bit "area code" in A:
#   cache_check         -- re-fetches the family's last-loaded area code from $7F13,X into A,
#                           compares against the requested value (also in A on entry), and
#                           either short-circuits (RTS, same area already resident) or falls
#                           into `reload`.
#   cache_check_preset   -- same routine 3 bytes further in: the caller already has A loaded
#                           with the value to check (skips the redundant `LDA $7F13,X`). This
#                           is the entry point almost every real caller in the corpus uses.
#   reload               -- unconditionally builds "<stem[:-2]><hex(A>>4)><hex(A&0xF)>" using
#                           the family table above and the nibble-to-hex helper below, then
#                           calls LIBRARY's own SETNAM+LOAD wrappers to load it.
# Verified byte-identical in structure across both titles (only the absolute addresses and the
# 1-byte-shorter `$40xx,Y`/`$41xx,Y` index-table addend differ, matching every other title-vs-
# title delta already documented in c64-resident-kernel.md).
GENERIC_LOADER_ENTRY = {
    "cok": {"cache_check": 0x413F, "cache_check_preset": 0x4142, "reload": 0x4156},
    "dok": {"cache_check": 0x4080, "cache_check_preset": 0x4083, "reload": 0x4097},
}

# The X-index-to-Y-index remap table each title's `reload` consults (`LDY $4126,X` cok /
# `LDY $4066,X` dok) before indexing FAMILY_TABLE_LOW/_HIGH. Byte-identical in both titles.
# Caller-facing X therefore ranges 0-20 but only ever selects stem-table Y 0-16 through this
# path -- families 17-20 (CHARPIC/COMPIC/ITEMFILE[/CODE]) are reachable in the stem table
# itself but never through this particular remap, consistent with those four being loaded by
# a different, non-generic routine (not investigated here; out of scope for the GDRIVE
# question this section answers).
GENERIC_LOADER_INDEX_MAP = bytes.fromhex("000102030405060708090a0d0e0f100b0b0b0c0c0c")
GENERIC_LOADER_INDEX_MAP_ADDR = {"cok": 0x4126, "dok": 0x4066}


def hex_digit(nibble: int) -> str:
    """LIBRARY's own nibble-to-ASCII-hex conversion: 0-9 -> '0'-'9', 10-15 -> 'A'-'F'.

    Reproduces the 8-byte routine `18 69 30 C9 3A 90 02 69` (`CLC; ADC #$30; CMP #$3A; BCC +2;
    ADC #$06; RTS`), byte-IDENTICAL at $4809 (Champions of Krynn) and $4749 (Death Knights) --
    see `HEX_DIGIT_ROUTINE_BYTES` / `HEX_DIGIT_ROUTINE_ADDR` below for the pinned addresses.

    The `+= 6` in the ADC is not the whole story: 6502 `CMP` sets the carry flag on
    `A >= operand` (true on every path that reaches the ADC, since that's exactly the branch
    NOT taken), and that carry is still set going into `ADC #$06` (nothing clears it in
    between) -- so the real effective addend on the taken path is 6+1=7, not 6. Skipping this
    carry-chaining is an easy, silent-until-verified mistake (an earlier draft of this
    function made exactly it, mapping nibble 15 to 'E' instead of 'F' -- caught by
    `test_hex_digit_matches_the_disassembled_routine_including_carry_chaining` going red).
    """
    n = nibble & 0x0F
    v = n + 0x30
    if v >= 0x3A:
        v += 7  # ADC #$06 + the carry CMP left set, not a bare +6
    return chr(v)


HEX_DIGIT_ROUTINE_BYTES = bytes.fromhex("186930c93a900269")
HEX_DIGIT_ROUTINE_ADDR = {"cok": 0x4809, "dok": 0x4749}


def loader_filename(stem: str, area_byte: int) -> str:
    """What `reload` actually requests: `stem`'s trailing 2 characters replaced by the two
    hex-ASCII nibbles of `area_byte` (high nibble first). E.g. `loader_filename("GDRIVE00", 3)
    == "GDRIVE03"`, matching the literal filename INIT's own $1116(cok)/$10F8(dok) routine
    requests (see `GDRIVE03_TAIL_JUMP` below) -- a file that does not exist anywhere in either
    title's disk corpus -- **13 sides in total: 7 for Champions (Sides 1-6 plus the Savedisk)
    and 6 for Death Knights** (corrected 2026-08-12; this said "12-side", which drops
    Champions' savedisk. `all_side_paths('cok')` returns 7 paths and the test backing this
    claim iterates exactly that list, so the sweep was always wider than the prose said).
    Re-verified this round; see the docs section for the sweep.
    """
    hi = hex_digit((area_byte >> 4) & 0x0F)
    lo = hex_digit(area_byte & 0x0F)
    return stem[:-2] + hi + lo


# Confirmed, disassembly-verified real call sites requesting the GDRIVE family (X=0) with an
# immediate (not computed) area code, found by scanning EVERY file in each title's full-corpus
# `all_bodies()` union (Champions of Krynn: 342 files; Death Knights of Krynn: 273 files) for a
# literal `JSR` to one of `GENERIC_LOADER_ENTRY`'s three addresses, then confirming each hit by
# disassembling the local instruction stream (not trusting the raw byte-scan alone -- one raw
# hit, in LINKER, decodes to garbage around it and is excluded here as unconfirmed; see the
# docs section for that byte-alias case). `offset` is the body offset (2-byte PRG load word
# already stripped) of the `JSR`; `origin` is that file's own real run address, where known.
# This directly resolves the caller question for GDRIVE00/03/04/05; GDRIVE01/02 are NOT among
# these results -- see `GDRIVE01_GDRIVE02_HONEST_NEGATIVE` below.
GDRIVE_CALL_SITES = {
    "cok": [
        # (file, offset, origin, area_code, entry_used, note)
        ("COM.PREP", 219, 0x0800, 0x00, "cache_check_preset",
         "LDA #$00; TAX; JSR -- requests GDRIVE00"),
        ("INIT", 2330, 0x0800, 0x03, "cache_check_preset",
         "LDX #$00; LDA #$03; JSR; JMP $C000 -- requests+runs GDRIVE03, see GDRIVE03_TAIL_JUMP"),
        ("DUNGEON", 8562, 0x0800, 0x03, "cache_check_preset",
         "first of DUNGEON's own save/load-GDRIVE03/exec/restore wrapper at $2965, see below"),
        ("DUNGEON", 8574, 0x0800, None, "cache_check_preset",
         "second call in the same $2965 wrapper -- A is restored via PLA, not immediate"),
    ],
    "dok": [
        ("COMPREP", 225, 0x0800, 0x00, "cache_check_preset",
         "LDA #$00; TAX; JSR -- requests GDRIVE00"),
        ("INIT", 2300, 0x0800, 0x03, "cache_check_preset",
         "LDX #$00; LDA #$03; JSR; JMP $C000 -- requests+runs GDRIVE03, see GDRIVE03_TAIL_JUMP"),
        ("CAMP", 396, 0x0800, 0x04, "cache_check_preset", "requests GDRIVE04"),
        ("GEN", 1621, 0x0800, 0x04, "cache_check_preset", "requests GDRIVE04"),
        ("CODE01", 623, 0x0800, 0x05, "cache_check_preset", "requests GDRIVE05"),
        ("GEN", 4288, 0x0800, 0x05, "cache_check_preset", "requests GDRIVE05"),
        ("POSTCOM", 20, 0x0800, 0x05, "cache_check_preset",
         "requests GDRIVE05 near POSTCOM's own file start (offset 20 of ~5700)"),
    ],
}

# The literal tail-jump routine both titles' INIT carries: request GDRIVE03, then JMP straight
# into the freshly-loaded driver slot without returning. Byte-identical in shape (only the JSR
# target and the trailing JMP address differ per title, both self-referential to $C000).
GDRIVE03_TAIL_JUMP = {
    "cok": {"addr": 0x1116, "bytes": bytes.fromhex("a200a9032042414c00c0")},
    "dok": {"addr": 0x10F8, "bytes": bytes.fromhex("a200a9032083404c00c0")},
}

# Reachability of GDRIVE03_TAIL_JUMP, swept as a literal `JSR $1116`/`JSR $10F8` across each
# title's full corpus (same file counts as GDRIVE_CALL_SITES above):
#   cok: exactly one caller, POST.COM offset 2000 (`JSR $1116` at address $0FD0) -- confirmed
#        real by direct disassembly: POST.COM polls input via a `JSR $4813` loop at $0FC3,
#        stores the resulting choice with `STX $2C39`, and falls through to the GDRIVE03 branch
#        only when that choice is 0 (`BNE $0FD6` skips it for any nonzero value; choice 4 exits,
#        choice 1 goes to an unrelated menu-scroll routine at $112B). So POST.COM's menu choice
#        0 is a LIVE, reachable trigger for a GDRIVE03 load -- and GDRIVE03 is absent from every
#        disk side of Champions of Krynn (verified in the prior round and unchanged this round).
#   dok: the raw scan's one candidate (PIC5E offset 588, `INC $10F8,X`) is a proven false
#        positive -- PIC5E is picture data (37.1% `illegal_opcode_fraction`, in line with this
#        corpus's picture-file range, versus <10% for every confirmed code overlay including
#        POST.COM's own 9.1%), and the bytes around the "hit" decode to garbage. Zero confirmed
#        callers of Death Knights' own GDRIVE03_TAIL_JUMP anywhere in its 273-file corpus.
GDRIVE03_REACHABILITY = {
    "cok": {"caller": ("POST.COM", 2000), "gate": "POST.COM menu choice == 0"},
    "dok": {"caller": None, "false_positive": ("PIC5E", 588)},
}

# DUNGEON's OWN, separate GDRIVE03 request (Champions of Krynn only -- no Death Knights
# counterpart was found anywhere in its corpus, checked both by the same JSR-to-loader-entry
# corpus scan and by a direct byte-signature search of DUNGEON's own body for the CoK pattern).
# Unlike the tail-jump above, this is a save/load/execute/restore WRAPPER that returns:
#   $2965  JSR $1C5E            ; (unrelated helper)
#   $2968  LDA $7F13 : ORA #$80 : PHA     ; save the CURRENTLY loaded driver's area code
#   $296E  LDX #$00 : LDA #$03 : JSR <cache_check_preset>   ; load+select GDRIVE03
#   $2975  JSR $C000            ; EXECUTE the freshly loaded driver immediately
#   $2978  JSR $1360
#   $297B  PLA : LDX #$00 : JSR <cache_check_preset>        ; restore the saved driver
#   $2981  JSR $11B1 : JSR $0D59 : JMP $0A4E
# Swept for literal `JSR $2965` callers across all 342 files in Champions of Krynn's corpus:
# ZERO hits. This routine is present, well-formed, and never reached by any statically-provable
# path in the shipped game -- an honest negative with a stated predicate (literal absolute-JSR
# scan; a computed/indirect call this scan cannot see remains possible but unproven).
DUNGEON_GDRIVE03_WRAPPER_ADDR = {"cok": 0x2965}
DUNGEON_GDRIVE03_WRAPPER_BYTES = bytes.fromhex(
    "20 5e 1c ad 13 7f 09 80 48 a2 00 a9 03 20 42 41 20 00 c0 20 60 13 68 a2 00 20 42 41 "
    "20 b1 11 20 59 0d 4c 4e 0a".replace(" ", ""))

# The honest negative this section leaves standing: no literal, immediate-operand JSR to any of
# GENERIC_LOADER_ENTRY's three addresses with X=0 (GDRIVE family) and A=1 or A=2 was found
# anywhere in either title's full corpus (cok 342 files / dok 273 files -- the same sweep that
# found every GDRIVE_CALL_SITES entry above). This does not prove GDRIVE01/GDRIVE02 are
# unreachable: the scan can only see an area code loaded via an immediate `LDA #imm` directly
# feeding the call (or a `LDA #imm; TAX`-style register copy); a caller that computes or loads
# the area code from a variable -- exactly the pattern DUNGEON's own $297B `PLA` restore uses
# for its SECOND call -- is invisible to it. GDRIVE01 and GDRIVE02 remain real, structurally
# distinct, on-disk files (GDRIVE01's own sprite-composite entry at $C6BA; GDRIVE02 is a small
# 407-byte picture-blit driver) with no caller this project has yet been able to pin down.
GDRIVE01_GDRIVE02_HONEST_NEGATIVE = {
    "predicate": "literal JSR to a GENERIC_LOADER_ENTRY address with X=0 and an IMMEDIATE "
                 "A=1 or A=2, across every file returned by all_bodies() for the title",
    "cok_files_swept": 342,
    "dok_files_swept": 273,
    "hits": 0,
}


# =================================================================================================
# 2026-08-12 ("absent-names" slice): GDRIVE03 (this file) and FINAL (a sibling-owned LINKER
# dispatch-table anomaly, docs/engine/research/c64-resident-kernel.md section 9.5) are two
# independently-discovered "referenced by shipped code, present on no disk" names. This section
# answers two questions about GDRIVE03 with real disassembly, in both titles:
#   (1) what happens when it's requested and the load fails -- does LIBRARY's generic loader
#       probe existence first and silently skip, or does it actually attempt the load?
#   (2) what selects the driver number (the 8-bit "area code" fed to the loader) at every GDRIVE
#       call site in the corpus -- immediate literal, or something computed/restored?
# See docs/engine/research/c64-sprite-format.md section 12 for the full write-up.

# --- (1) GDRIVE03's failure path is IDENTICAL, byte-for-byte address, to FINAL's --------------
# `reload` (docs section 11 above) does NOT call the file-existence probe (below) before loading.
# It falls straight through into a small tail routine (GENERIC_LOADER_RELOAD_TAIL) that performs
# a real KERNAL LOAD via the same `$31CD`/`$3186` wrapper c64-resident-kernel.md section 9.4
# documents, tests the parsed disk-status code, and ONLY on success continues to the caching code
# `reload` already had (docs section 11's disassembly). On FAILURE it calls `retry_handler` --
# THE SAME numeric address ($4298 cok / $41EE dok) that LINKER's own dispatch loop calls for its
# FINAL-index failure (c64-boot-chain.md section 2, c64-resident-kernel.md section 9.5's
# `$4298`/`$3F28` cluster) -- then loops back and retries the identical load, unconditionally,
# forever. Verified by direct disassembly of BOTH callers in BOTH titles (see the docs section);
# `retry_handler`'s own internals (docs section 9.4's "$4298 load-failure/disk-swap handler")
# poll the keyboard, so this is an interactive "please insert the right disk, press a key" loop,
# not a silent hang -- but since GDRIVE03 exists on no disk in this 13-side corpus (section 11.5),
# the loop can never be satisfied and repeats indefinitely. This is the SAME conclusion
# c64-resident-kernel.md section 9.5 reached for FINAL, independently, through LINKER's own copy
# of the identical two addresses -- two anomalies, one shared engine behaviour: an absent named
# resource does not crash and does not silently no-op, it produces an unwinnable disk-swap prompt.
GENERIC_LOADER_RELOAD_TAIL = {
    "cok": {"addr": 0x4098, "spine_addr": 0x40B9, "load_wrapper": 0x31CD,
            "retry_handler": 0x4298, "success_target": 0x47E6},
    "dok": {"addr": 0x3FD3, "spine_addr": 0x3FF4, "load_wrapper": 0x3186,
            "retry_handler": 0x41EE, "success_target": 0x471C},
}

# Exact bytes of GENERIC_LOADER_RELOAD_TAIL's control-flow spine (at `spine_addr`, a few
# instructions into `reload`, after the filename has been built): `JSR <load_wrapper>`,
# `BEQ <success_target-relative>` (branch taken on success, $03F1==0), else
# `JSR <retry_handler>` then `JMP <addr>` (retries the WHOLE reload from the top -- re-fetching X
# and rebuilding the filename, not just re-issuing LOAD). Verified byte-for-byte against the real
# LIBRARY files (`tools/test_c64_sprite.py`).
GENERIC_LOADER_RELOAD_TAIL_BYTES = {
    # JSR $31CD ; BEQ $40C4 ; JSR $4298 ; JMP $4098
    "cok": bytes.fromhex("20cd31f0062098424c9840"),
    # JSR $3186 ; BEQ $3FFF ; JSR $41EE ; JMP $3FD3
    "dok": bytes.fromhex("208631f00620ee414cd33f"),
}

# --- (1b) The file-existence probe exists, is well-formed, and is never actually called -------
# LIBRARY's `$322E` (cok) / `$31E7` (dok) -- OPEN a named file at SA=15 (command-channel style),
# read back the parsed disk-status code, CLOSE, RTS -- documented as a "file-existence probe" in
# c64-resident-kernel.md section 9.4 with zero JSR fan-in in that round's census. This round
# widens the check: `reload`'s own instruction stream (above) never calls it, and a corpus-wide
# sweep (cok: 342 files via all_bodies(), plus LIBRARY's own 32-slot JMP table; dok: 273 files,
# whose LIBRARY table has only 3 slots) finds:
#   cok: the probe IS exposed as a real, well-formed LIBRARY jump-table entry -- slot 16
#        ($2DF8 -> $322E), sitting right next to the LOAD/SAVE/SETNAM primitives (slots 17-19).
#        But NOTHING in the 342-file corpus calls it, either by its raw address OR through the
#        table-vector address $2DF8 -- checked both ways.
#   dok: the routine exists (byte-identical structure to cok's, confirmed by direct disassembly)
#        but DoK's own LIBRARY table is too short (3 slots) to expose it at all, and the raw
#        corpus-wide sweep also finds zero callers.
# So in both titles this is real, correct, callable code that this project's readable corpus
# never actually invokes -- an honest negative under a stated predicate (literal absolute JSR to
# either the probe's own address or its jump-table slot), not proof nothing ever calls it
# (an indirect/computed call, e.g. through a runtime-built jump-table index, is invisible to this
# scan, the same caveat every other honest negative in this file carries).
FILE_EXISTENCE_PROBE = {"cok": 0x322E, "dok": 0x31E7}
FILE_EXISTENCE_PROBE_JUMP_TABLE_SLOT = {"cok": 16}  # dok's table has only 3 slots, no entry
FILE_EXISTENCE_PROBE_BYTES = {
    # JSR <setnam> ; LDA #$0F ; LDX $038E ; LDY #$0F ; JSR $FFBA (SETLFS) ; JSR $FFC0 (OPEN) ;
    # JSR <status-parser> ; JSR $FFE7 (CLOSE) ; LDA $03F1 ; RTS
    "cok": bytes.fromhex("201332a90fae8e03a00f20baff20c0ff2037" "3f20e7ffadf10360"),
    "dok": bytes.fromhex("20cc31a90fae8e03a00f20baff20c0ff207f" "3e20e7ffadf10360"),
}


# --- (2) What selects the driver number: a decode-aligned, corpus-wide re-sweep --------------
# The earlier honest negative (GDRIVE01_GDRIVE02_HONEST_NEGATIVE) only checked for a literal
# BYTE-ALIAS match of `LDX #$00` + `LDA #$01`/`#$02` near a raw JSR-opcode byte -- it could not
# tell a real call from a coincidental byte pattern inside unrelated data (this project's
# standing byte-alias hazard, section 8.2/9.1 etc.), and it only recognised ONE non-immediate
# shape (nothing). This section replaces that with a DECODE-ALIGNED walk: every file in
# `all_bodies()` is linearly disassembled from body offset 0 (org $0800, the established overlay
# convention), every JSR reached AT REAL INSTRUCTION ALIGNMENT to a GENERIC_LOADER_ENTRY address
# is kept, and the immediately-preceding X-setting and A-setting instructions (walking BACKWARD
# through the real decoded instruction stream, not raw bytes -- LDX #imm/LDX abs/zp/TAX for X;
# LDA #imm/LDA abs/zp/(zp),Y/PLA/TXA/TYA for A, within a 12-instruction lookback window) are
# resolved, including the one case (`LDA #imm; TAX`) where X's value is carried indirectly.
GDRIVE_X_SETTERS = {0xA2: "LDX #imm", 0xAE: "LDX abs", 0xA6: "LDX zp", 0xB6: "LDX zpy",
                     0xBE: "LDX abs,Y", 0xAA: "TAX"}
GDRIVE_A_SETTERS = {0xA9: "LDA #imm", 0xAD: "LDA abs", 0xA5: "LDA zp", 0xB5: "LDA zpx",
                     0xBD: "LDA abs,X", 0xB9: "LDA abs,Y", 0xB1: "LDA (zp),Y",
                     0xA1: "LDA (zp,X)", 0x68: "PLA", 0x8A: "TXA", 0x98: "TYA"}


def decode_all(body: bytes, org: int = 0x0800) -> list[tuple[int, int, str | None, int, bytes]]:
    """Full linear 6502 decode of `body` starting at offset 0. Returns
    `[(address, opcode_byte, mode_or_None, size, operand_bytes), ...]`. An undefined opcode, or
    one whose operand runs past the end of the file, is recorded as a 1-byte entry with
    `mode=None` (matching `illegal_opcode_fraction`'s own walk) rather than raising -- the caller
    decides what an illegal-opcode-dense run means (this project's usual "desync into data"
    signal)."""
    out: list[tuple[int, int, str | None, int, bytes]] = []
    pc = 0
    n = len(body)
    while pc < n:
        op = body[pc]
        entry = disasm.OPCODES.get(op)
        if entry is None:
            out.append((org + pc, op, None, 1, b""))
            pc += 1
            continue
        _mnem, mode = entry
        size = disasm.SIZE[mode]
        if pc + size > n:
            out.append((org + pc, op, None, 1, b""))
            pc += 1
            continue
        out.append((org + pc, op, mode, size, body[pc + 1:pc + size]))
        pc += size
    return out


def _find_setter(instrs, idx: int, setters: dict, window: int = 12):
    """Walk backward from `instrs[idx]` for the nearest instruction whose opcode is in
    `setters`. Returns `(distance, description, imm_value_or_None)` or `None`."""
    for back in range(1, window + 1):
        j = idx - back
        if j < 0:
            break
        _addr, op, mode, _size, opnd = instrs[j]
        if op in setters:
            val = opnd[0] if (mode == "imm" and opnd) else None
            return back, setters[op], val
    return None


def _resolve_x(instrs, idx: int):
    """Like `_find_setter` for X, but resolves the one indirect shape this corpus actually
    uses: `LDA #imm ; TAX` (COM.PREP/COMPREP's own GDRIVE00 request does exactly this) -- TAX
    carries no operand of its own, so a naive one-hop lookup would silently report X as
    "unknown" for a real, resolvable X=0 case."""
    hit = _find_setter(instrs, idx, GDRIVE_X_SETTERS)
    if hit is None:
        return None, None
    back, desc, val = hit
    if desc == "TAX" and val is None:
        a_hit = _find_setter(instrs, idx - back, GDRIVE_A_SETTERS)
        if a_hit and a_hit[1] == "LDA #imm" and a_hit[2] is not None:
            return f"TAX<-LDA#{a_hit[2]}", a_hit[2]
    return desc, val


# 2026-08-12: the three raw byte-scan hits (of 30 total literal `20 xx xx` JSR-shaped byte
# triples targeting a GENERIC_LOADER_ENTRY address in Champions of Krynn's 342-file corpus) that
# a decode-aligned walk from offset 0 STILL reaches at real instruction alignment, yet are not
# genuine calls: each sits inside an embedded ASCII UI-text string, where " BA" (space-B-A, a
# common English substring -- "CONTINUE BATTLE", "GETS BACK UP", "GO BACK") happens to equal the
# opcode+operand-low-byte bytes of `JSR $4142` (0x20 0x42 0x41) BYTE-FOR-BYTE. This is a
# previously-undocumented false-positive mechanism, distinct from the illegal-opcode-desync class
# (section 8.2/9.1): decode-CLEAN text that aliases a real, valid instruction, not a desync
# marker. Confirmed by reading the raw bytes as ASCII on both sides of each hit (see the doc).
# Death Knights of Krynn has none of this kind (its own 27-hit raw scan has exactly one false
# positive, PIC71, and that one is NOT decode-aligned -- PIC71 is picture data, so a linear decode
# from its own offset 0 never reaches this position at all; it only appears in a raw byte scan).
GENERIC_LOADER_DECODE_ALIGNED_FALSE_POSITIVES = {
    "cok": {("COMBAT2", 0x1E9A): b" BATTLE : ",     # "...CONTINUE BATTLE : ..."
            ("ECL65", 0x15CB): b" BACK UP\x00P",     # "...GETS BACK UP\\0POINTS OF DAMAGE..."
            ("POST.COM", 0x0C05): b" BACK\x00LEAV"}, # "...GO BACK\\0LEAVE TREASURE..."
    "dok": {},
}


def scan_generic_loader_call_sites(bodies: dict[str, bytes], title: str):
    """The decode-aligned, corpus-wide sweep itself. Returns a list of
    `(file, address, entry_name, x_desc, x_value_or_None, a_desc, a_value_or_None)` for every
    JSR reached at real instruction alignment (linear decode from offset 0, org $0800) to one of
    `GENERIC_LOADER_ENTRY[title]`'s three addresses, EXCLUDING the known ASCII-text false
    positives above. `x_value`/`a_value` are `None` when the setter is non-immediate (a real
    computed/restored source, e.g. `PLA`) or when no setter was found within the lookback window.
    """
    addr_to_entry = {v: k for k, v in GENERIC_LOADER_ENTRY[title].items()}
    false_positives = GENERIC_LOADER_DECODE_ALIGNED_FALSE_POSITIVES[title]
    out = []
    for name, body in bodies.items():
        instrs = decode_all(body, 0x0800)
        for idx, (addr, op, mode, _size, opnd) in enumerate(instrs):
            if op != 0x20 or mode != disasm.ABS:
                continue
            target = opnd[0] | (opnd[1] << 8)
            if target not in addr_to_entry:
                continue
            if (name, addr) in false_positives:
                continue
            xdesc, xval = _resolve_x(instrs, idx)
            a_hit = _find_setter(instrs, idx, GDRIVE_A_SETTERS)
            adesc, aval = (a_hit[1], a_hit[2]) if a_hit else (None, None)
            out.append((name, addr, addr_to_entry[target], xdesc, xval, adesc, aval))
    return out


# The GDRIVE-family (X=0) subset of the above, expected to reproduce exactly the 11
# REAL_GDRIVE_CALL_SITES already pinned in the test suite (docs section 11) -- now under a
# strictly stronger method (decode-aligned, not byte-scanned; every JSR to the loader is
# inspected, not just ones that already looked X=0/A=imm) that NARROWS -- does not close --
# section 11.7/11.8's explicitly-named open item ("computed/indirect area-code loads... not swept
# this round"), covering it only at every call site this scan's own predicate can reach. Section
# 11.7's own named next step, a census of writes to $7F13,X, is NOT done here (docs section 12.5).
# Of every GDRIVE (X=0) request found
# anywhere in the 615-file two-title corpus, exactly ONE has a non-immediate area code
# (DUNGEON's PLA at $297B, feeding the JSR at $297E) and it is a save/restore of whatever
# driver was resident BEFORE the temporary GDRIVE03 detour. The saved value is read from the
# FIXED cell $7F13: `LDA $7F13 ; ORA #$80 ; PHA` at $2968, where the LDA's opcode byte is $AD
# -- LDA ABSOLUTE, UNINDEXED (the indexed form `BD 13 7F` occurs nowhere in DUNGEON's body) --
# and it is restored by the PLA TWO instructions before that JSR ($297B PLA ; $297C LDX #$00 ;
# $297E JSR $4142). $7F13 is the base of LIBRARY's per-family "currently loaded area code"
# table, which LIBRARY itself always addresses X-indexed (`LDA $7F13,X` / `STA $7F13,X`); the
# GDRIVE family's slot is index 0, and DUNGEON reaches it by hardcoding the base address rather
# than by setting up a generic per-family index -- so this save/restore is specific to GDRIVE by
# construction, not by a runtime family selector. It is not a per-area GEO field, not an
# arbitrary $7E00-$7FFF game-mode global, and (per section 11.5) not reachable in the shipped
# game anyway. No OTHER GDRIVE (X=0) request anywhere in either corpus uses anything but a bare
# `LDA #imm`. Non-immediate area codes DO exist elsewhere in this engine (e.g.
# POST.COM/COMPREP's `LDA abs`/`LDA abs,X` computed requests for OTHER resource families,
# X=5/13/14/23/24) -- the mechanism is real, it is simply never used for GDRIVE at any site this
# scan's predicate reaches.
#
# Scope of that negative, stated rather than assumed: the predicate is a linear decode-aligned
# scan (from body offset 0, org $0800) for JSR-ABSOLUTE to a GENERIC_LOADER_ENTRY address, with
# a BOUNDED backward instruction walk (12 instructions, plus one TAX hop) to resolve X and A. A
# selector computed further back than that window, reached via JMP or an indirect call, or
# supplied from GEO-level/other per-area data rather than from code near the call, is outside
# it: the computed-selector hypothesis (docs sections 11.8/12.5's own "not swept" list) is still
# unswept.
GDRIVE_AREA_CODE_SOURCES_SUMMARY = {
    "predicate": "every JSR reached at real decode alignment (linear walk from body offset 0) "
                 "to a GENERIC_LOADER_ENTRY address, across all_bodies() for the title, "
                 "restricted to X=0 (the GDRIVE family)",
    "cok": {"gdrive_call_sites": 4, "immediate_area_code": 3, "non_immediate": 1,
            "non_immediate_source": "PLA restore of the fixed cell $7F13 "
                                    "(DUNGEON: PLA $297B -> JSR $297E)"},
    "dok": {"gdrive_call_sites": 7, "immediate_area_code": 7, "non_immediate": 0},
}


# =================================================================================================
# 2026-08-13: the `$4DC0` resource-cache mirror's write side (docs section 13). The generic
# loader's save/restore loop pair (already documented, `$4DC0,X <-> $7F13,X`) is the well-known
# path; this section is everything ELSE found touching `$4DC0` or the `ORA #$80` tag it carries,
# plus whether any of it can supply GDRIVE area code 1 or 2 (S12.4's standing open question). See
# docs/engine/research/c64-sprite-format.md section 13 for the full narrative.

# `cache_check_preset`'s own masking logic -- the mechanism behind "what is ORA #$80 for?" (docs
# 13.2). Disassembles to: `CMP #$FF ; BEQ +$0E` (a first special sentinel -- always "loaded", skips
# the $4DC0-restore's tag) then `CMP #$7F` (a second special sentinel), else `CMP $7F13,X` compares the
# MASKED requested value against the RAW cached byte -- a bit-7-tagged cached byte can never match a
# masked comparand, so it is an unconditional forced cache-miss, which is the entire point of the
# tag: it is never explicitly cleared anywhere because `reload`'s own untagged overwrite clears it
# implicitly, as a side effect of doing a real reload.
CACHE_CHECK_PRESET_MASKING_BYTES = bytes.fromhex(
    "c9fff00e297fc97ff005dd137fd0059d137f1860")
CACHE_CHECK_PRESET_MASKING_ADDR = {"cok": 0x4142, "dok": 0x4083}

# `$4BF2`: a masked (bit-7-stripped) snapshot of the ECL family's live cache byte ($7F1B =
# $7F13+8, family-stem-table index 8 = "ECL00..." in both titles -- see `family_stem_table`).
# Written by this exact 9-byte idiom, found by a corpus-wide search, EXACTLY TWICE PER TITLE, both
# inside DUNGEON:
#   LDA $7F1B ; AND #$7F ; STA $4BF2 [; RTS]
#
# **"...and nowhere else" was WRONG (corrected 2026-08-13).** That census searched only for the
# 9-byte idiom, so it could only ever find masked writes. The general opcode scan -- `STA $4BF2`
# (`8D F2 4B`) across every file of both corpora -- finds `ECL_SNAPSHOT_OTHER_WRITE_SITES` below in
# addition. Search for the STORE, then classify what it stores; do not search for one idiom and
# report the result as a census of the variable.
ECL_SNAPSHOT_VAR = 0x4BF2
ECL_SNAPSHOT_LIVE_CACHE_ADDR = 0x7F1B  # $7F13 + 8 (ECL's slot)
ECL_SNAPSHOT_PATTERN_BYTES = bytes.fromhex("ad1b7f297f8df24b")  # LDA $7F1B;AND #$7F;STA $4BF2
ECL_SNAPSHOT_STORE_BYTES = bytes.fromhex("8df24b")  # STA $4BF2, any source
ECL_SNAPSHOT_SITES = {
    # (file, body offset, addr, standalone-ends-in-RTS)
    "cok": [("DUNGEON", 4765, 0x1A9D, True), ("DUNGEON", 6395, 0x20FB, False)],
    "dok": [("DUNGEON", 4273, 0x18B1, True), ("DUNGEON", 5849, 0x1ED9, False)],
}

# Every OTHER `STA $4BF2` in either corpus, from the general opcode scan. Both titles share a
# boot-time zero-init in INIT; only dok additionally seeds the variable with an UNMASKED,
# bit-7-tagged $81 during POSTCOM. The surrounding POST.COM/POSTCOM sequence is otherwise
# byte-identical across the two titles -- dok simply inserts one extra `8D F2 4B`:
#
#   cok POST.COM@4499:  a9 81  8d 1b 7f          a9 01  8d 78 7e  ...
#   dok POSTCOM @4036:  a9 81  8d 1b 7f  8d f2 4b  a9 01  8d 78 7e  ...
#
# dok never READS $4BF2 anywhere (the `LDA $4BF2` scan is still zero-hit for dok), so this is a
# write to a variable that title never consults -- consistent with the shared-codebase divergence
# already recorded for cok's CAMP re-tag, and NOT a masked snapshot.
ECL_SNAPSHOT_OTHER_WRITE_SITES = {
    # (file, body offset, what it stores)
    "cok": [("INIT", 345, "0 (LDA #$00, shared with STA $7ED2/$7ED3 -- boot zero-init)")],
    "dok": [
        ("INIT", 337, "0 (LDA #$00, shared with STA $7ED2/$7ED3 -- boot zero-init)"),
        ("POSTCOM", 4041, "$81 UNMASKED (LDA #$81, shared with STA $7F1B) -- dok only"),
    ],
}

# cok `CAMP` re-tags the ECL mirror slot ($4DC8 = $4DC0+8) from `$4BF2` instead of trusting the
# generic loop's own copy of `$7F1B` -- and separately re-requests the ECL family (X=8) via a tail
# JMP straight into `cache_check_preset`, using `$4BF2` as the requested value. Both are cok-only:
# a corpus-wide decode-accurate opcode scan for `LDA $4BF2` (`AD F2 4B`) finds these two hits in
# cok and ZERO anywhere in dok's full corpus (including LIBRARY); the `ORA #$80 ; STA $4DCx` re-tag
# shape (`09 80 8D` with a $4DC0-$4DDF destination) likewise finds one hit in cok, zero in dok.
CAMP_ECL_RETAG_READ_BYTES = bytes.fromhex("adf24ba2084c4241")   # LDA $4BF2;LDX #$08;JMP cache_check_preset
CAMP_ECL_RETAG_WRITE_BYTES = bytes.fromhex("adf24b09808dc84d")  # LDA $4BF2;ORA #$80;STA $4DC8
CAMP_ECL_RETAG_SITES_COK = {"read": ("CAMP", 111, 0x086F), "write": ("CAMP", 1269, 0x0CF5)}

# `DUNGEON` also writes the literal sentinel `$7F` directly (unindexed -- unambiguously slot 0,
# GDRIVE, regardless of any runtime X) to six cache slots in one shot, byte-identical in both
# titles. A corpus-wide census of the UNINDEXED store form `STA $7F13` (opcode `8D 13 7F`, which
# can only ever be slot 0) finds exactly one occurrence per title, both here, both writing `$7F` --
# never `$01` or `$02`. Directly relevant to docs section 13.3 (Q3): this is a real, confirmed
# non-generic writer of GDRIVE's own live cache cell, and it never writes an area code at all, only
# the "$7F" always-succeed sentinel.
DUNGEON_SENTINEL_RESET_BYTES = bytes.fromhex(
    "a97f8d157f8d167f8d1c7f8d137fa2059d227fca10fa60")
DUNGEON_SENTINEL_RESET_ADDR = {"cok": 0x2168, "dok": 0x1F4A}

# A second, independent sentinel: `$FF` ("not yet verified", checked by cache_check_preset's own
# FIRST instruction, before any masking). Written by a full-table reset loop
# (`LDX #imm ; LDA #$FF ; STA $7F13,X ; DEX ; BPL`, covering every slot including 0, i.e. GDRIVE)
# found in POST.COM/POSTCOM and INIT in both titles -- four sites, byte-identical shape apart from
# the loop's own trip count (X start value = highest slot index, one less than the slot count).
FULL_TABLE_FF_RESET_TAIL_BYTES = bytes.fromhex("a9ff9d137fca10fa")  # LDA #$FF;STA $7F13,X;DEX;BPL
FULL_TABLE_FF_RESET_SITES = {
    # (file, body offset of the LDX #imm, addr, X start value = slot count - 1)
    "cok": [("POST.COM", 4470, 0x1976, 0x18), ("INIT", 168, 0x08A8, 0x18)],
    "dok": [("POSTCOM", 4007, 0x17A7, 0x1F), ("INIT", 157, 0x089D, 0x19)],
}

# dok CODE00's candidate whole-mirror zero-fill (docs section 13.1c) -- structurally real
# (matched PHA/PLA push-pop pairs, loop trip counts matching the three regions' exact sizes
# 256/192/32 bytes) but with NO confirmed caller found this round (self-referential decode-aligned
# JSR/JMP/branch scan of CODE00's own body: zero hits; LIBRARY: zero references). Its start is NOT
# immediately preceded by an RTS: the nearest real RTS (a short 11-byte table-membership routine,
# $16DE-$16E8) sits 11 bytes earlier, with a 10-byte non-instruction gap (07 12 1A 2F 4D 5B 5C 5F 69
# 73 -- decodes as illegal/misaligned opcodes, i.e. data, not code) between that RTS and the zero-
# fill's own $78 (SEI). RTS never falls through in real 6502 execution regardless of what follows it
# in memory, so this gap doesn't change the reachability question either way -- it only means the
# earlier "preceding byte is RTS" phrasing was imprecise about WHICH byte precedes it; the caller
# question is answered by the JSR/JMP scan above, not by adjacency. If reached, it would zero-fill
# `$4DC0`-`$4DDF` (all 32 dok mirror slots, including GDRIVE's) with no exception carved out for
# it (unlike the two adjacent regions, which each have one live byte preserved around the fill).
# A cok-wide search for the same `STA $4DC0,Y` opcode shape (`99 C0 4D`) finds ZERO occurrences --
# cok has no analogous routine under this exact predicate.
CODE00_ZEROFILL_CANDIDATE_ADDR = {"dok": 0x16F3}
CODE00_ZEROFILL_CANDIDATE_BYTES = bytes.fromhex(
    "78adfc4b48adf44c48ad334c48ad344c48a0009899c04b88d0fa99c04cc8c0c0"
    "90f8a01f99c04d8810fa688d344c688d334c688df44c688dfc4b")


# A neutral two-colour palette for the hires bitmap: background, foreground.
DEFAULT_BG = (0x00, 0x00, 0x00)
DEFAULT_FG = (0xB2, 0xB2, 0xB2)  # VIC-II light grey (Pepto colodore index 15)


class Framing(NamedTuple):
    kind: str          # "bare" | "trailer" | "header"
    frame_count: int
    bitmap_start: int  # byte offset of frame 0 within the body
    meta: bytes         # the header/trailer bytes, b"" for "bare"


def body(prg: bytes) -> bytes:
    """Strip the 2-byte CBM load word."""
    return prg[2:]


def framing(data_body: bytes) -> Framing:
    """Classify a SPRITE body into one of the three known container dialects.

    Order matters only for the (rare, unobserved) case of a coincidental match: "bare" is
    checked first since it needs no extra evidence, "trailer" requires its byte-10 signature
    (`0x03`, true in 135/136 trailer-dialect files) to accept, and "header" is the fallback. Arithmetic
    alone cannot make trailer and header collide (16 % 64 != 13 % 64), so this never has to choose
    between the two on ambiguous evidence.
    """
    n = len(data_body)
    if n > 0 and n % BLOCK == 0:
        return Framing("bare", n // BLOCK, 0, b"")
    if n > TRAILER_LEN and (n - TRAILER_LEN) % BLOCK == 0:
        trailer = data_body[-TRAILER_LEN:]
        if trailer[10] == 0x03:
            return Framing("trailer", (n - TRAILER_LEN) // BLOCK, 0, trailer)
    if n > HEADER_LEN and (n - HEADER_LEN) % BLOCK == 0:
        header = data_body[:HEADER_LEN]
        return Framing("header", (n - HEADER_LEN) // BLOCK, HEADER_LEN, header)
    raise ValueError(f"unrecognized SPRITE framing: {n} body bytes")


def is_sprite(prg: bytes) -> bool:
    try:
        framing(body(prg))
        return True
    except ValueError:
        return False


def frames(prg: bytes) -> list[bytes]:
    """Every 64-byte sprite block in file order, regardless of dialect."""
    b = body(prg)
    fr = framing(b)
    start = fr.bitmap_start
    return [b[start + i * BLOCK: start + i * BLOCK + BLOCK] for i in range(fr.frame_count)]


def trailer_field_properties(prg: bytes) -> dict | None:
    """Per-instance trailer bytes plus the decodable body-derived properties the trailer-field
    correlation tests (docs/engine/research/c64-sprite-format.md section 14) check them against:
    frame count, body length, count of all-zero ("blank") 64-byte frames, and count of frames the
    existing run-length heuristic (`hires_run_score`/`multicolour_run_score`) scores as
    multicolour-preferred. Returns `None` for anything that is not trailer-dialect (bare/header
    files and the one Death Knights of Krynn `SPRITE62` anomaly all return `None`), so callers can
    filter a whole corpus with a plain `is not None` check without duplicating `framing()`'s own
    dialect logic.
    """
    b = body(prg)
    try:
        fr = framing(b)
    except ValueError:
        return None
    if fr.kind != "trailer":
        return None
    frs = frames(prg)
    blank = sum(1 for f in frs if f == bytes(BLOCK))
    multicolour = sum(1 for f in frs if multicolour_run_score(f) > hires_run_score(f))
    return {
        "trailer": fr.meta,
        "frame_count": fr.frame_count,
        "body_length": len(b),
        "blank_frames": blank,
        "multicolour_frames": multicolour,
    }


def pearson_r(xs: list[float], ys: list[float]) -> float:
    """Pearson correlation coefficient between two equal-length series.

    Returns 0.0 if either series has zero variance -- a degenerate (constant) population has
    nothing to correlate against, which is a fact about the population, not an error condition
    the caller needs to special-case.
    """
    n = len(xs)
    if n == 0 or n != len(ys):
        raise ValueError("pearson_r needs two non-empty series of equal length")
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    if dx == 0.0 or dy == 0.0:
        return 0.0
    return num / (dx * dy)


def permutation_correlation_p(xs: list[float], ys: list[float], trials: int = 4000,
                               seed: int = 0) -> tuple[float, float]:
    """Two-sided permutation-null test for a Pearson correlation between `xs` and `ys`.

    Per this project's rule 3 (state the null and what it destroys): the null here reshuffles
    `ys` relative to `xs`, holding BOTH real marginal populations fixed -- every observed value on
    each side is used exactly once, just re-paired at random. This destroys only the *pairing*
    between the two co-located quantities being tested, nothing else about either population's own
    shape (unlike, e.g., a whole-body shuffle or a uniform-random redraw, which would also destroy
    each series' own distribution and so test a different, unrelated null).

    Returns `(observed_r, p)`, where `p` is the fraction of `trials` reshuffles whose `|r|` is >=
    the observed `|r|`. A degenerate input (either series constant, so there is no real pairing to
    test) returns `(0.0, 1.0)` without spending any permutation trials -- a constant population is
    reported as "nothing to correlate", never as a false "no significant correlation found".

    `seed` is fixed by the caller so results are exactly reproducible, not re-derived to a
    different p on every run.
    """
    if len(set(xs)) <= 1 or len(set(ys)) <= 1:
        return 0.0, 1.0
    r_obs = pearson_r(xs, ys)
    rng = random.Random(seed)
    shuffled = list(ys)
    hits = 0
    for _ in range(trials):
        rng.shuffle(shuffled)
        if abs(pearson_r(xs, shuffled)) >= abs(r_obs) - 1e-12:
            hits += 1
    return r_obs, hits / trials


def fisher_combined_p(pvalues: list[float]) -> float:
    """Combine independent two-sided p-values via Fisher's method.

    `-2 * sum(ln(p_i))` is chi-square distributed with `2*len(pvalues)` degrees of freedom under
    the joint null that every input test's own null holds. Degrees of freedom here are always
    even (`2 * k`), which has a closed-form survival function -- computed directly, since this
    project has neither scipy nor mpmath available -- so no numerical integration is needed.

    Each input p must be in `(0, 1]`; a literal `0.0` is rejected (undefined `log`) rather than
    silently treated as "infinitely significant" -- a permutation test that finds zero
    hits-out-of-`trials` should report its own trial-count floor (e.g. `max(hits, 1) / trials`)
    to the caller instead of a bare `0.0`.
    """
    if not pvalues:
        raise ValueError("fisher_combined_p needs at least one p-value")
    if any(p <= 0.0 or p > 1.0 for p in pvalues):
        raise ValueError("Fisher's method needs every p in (0, 1]")
    chi2 = -2.0 * sum(math.log(p) for p in pvalues)
    m = len(pvalues)  # degrees of freedom = 2*m, always even
    half = chi2 / 2.0
    return math.exp(-half) * sum(half ** i / math.factorial(i) for i in range(m))


def hires_indices(block: bytes) -> bytearray:
    """Decode one 64-byte block as a standard 1-bit-per-pixel VIC-II hires sprite.

    Only the first 63 bytes (21 rows * 3 bytes) are read; the VIC-II sprite hardware itself never
    looks past them, so the 64th "padding" byte -- which is not always zero in this corpus, see
    the module docstring -- is intentionally ignored.
    """
    px = bytearray(SPRITE_W * SPRITE_H)
    for row in range(ROWS):
        for col_byte in range(ROW_BYTES):
            byte = block[row * ROW_BYTES + col_byte]
            for bit in range(8):
                x = col_byte * 8 + bit
                px[row * SPRITE_W + x] = (byte >> (7 - bit)) & 1
    return px


def multicolour_indices(block: bytes) -> bytearray:
    """Decode one 64-byte block as a 2-bit-per-pixel multicolour sprite (pixels doubled in X).

    Provided for completeness and for the corpus-wide comparison in the tests; the module
    docstring's run-length measurement shows HIRES wins on this corpus by roughly 9:1, so this is
    not the default render.
    """
    px = bytearray(SPRITE_W * SPRITE_H)
    for row in range(ROWS):
        for col_byte in range(ROW_BYTES):
            byte = block[row * ROW_BYTES + col_byte]
            for pair in range(4):
                v = (byte >> (6 - 2 * pair)) & 3
                x = col_byte * 8 + pair * 2
                px[row * SPRITE_W + x] = v
                px[row * SPRITE_W + x + 1] = v
    return px


def run_score(rows: list[list[int]]) -> float:
    """Average run length across scanlines. Higher = more spatially coherent (real art);
    near 1.0 = alternating noise. Used by the corpus test to pick hires vs multicolour."""
    total_runs = total_len = 0
    for row in rows:
        total_len += len(row)
        runs = 1
        for i in range(1, len(row)):
            if row[i] != row[i - 1]:
                runs += 1
        total_runs += runs
    return total_len / total_runs if total_runs else 0.0


def _rows_from_indices(indices: bytearray, width: int, height: int) -> list[list[int]]:
    return [list(indices[y * width:(y + 1) * width]) for y in range(height)]


def _multicolour_symbols(block: bytes) -> list[list[int]]:
    """One row of 12 undoubled 2-bit symbols per scanline (not the 24-wide doubled-pixel form
    `multicolour_indices` renders). Scoring needs this undoubled form: doubling every symbol
    guarantees a minimum run length of 2 regardless of content, which biases a same-width
    comparison against hires's native 1-bit, undoubled runs. Rendering still uses the doubled
    24-wide form so multicolour frames occupy the same on-screen width as hires ones."""
    out = []
    for row in range(ROWS):
        vals = []
        for col_byte in range(ROW_BYTES):
            byte = block[row * ROW_BYTES + col_byte]
            for pair in range(4):
                vals.append((byte >> (6 - 2 * pair)) & 3)
        out.append(vals)
    return out


def hires_run_score(block: bytes) -> float:
    return run_score(_rows_from_indices(hires_indices(block), SPRITE_W, SPRITE_H))


def multicolour_run_score(block: bytes) -> float:
    """Scored on the undoubled 12-wide symbol stream -- see `_multicolour_symbols`."""
    return run_score(_multicolour_symbols(block))


# A 4-colour palette for multicolour frames (index 3 keeps DEFAULT_FG so hires and multicolour
# frames read consistently when placed side by side in a filmstrip).
MULTICOLOUR_PALETTE = ((0x00, 0x00, 0x00), (0x81, 0x33, 0x38), (0x56, 0xac, 0x4d), DEFAULT_FG)


def rgb(block: bytes, fg: tuple[int, int, int] = DEFAULT_FG,
        bg: tuple[int, int, int] = DEFAULT_BG) -> bytes:
    out = bytearray(SPRITE_W * SPRITE_H * 3)
    for i, idx in enumerate(hires_indices(block)):
        out[i * 3:i * 3 + 3] = bytes(fg if idx else bg)
    return bytes(out)


def multicolour_rgb(block: bytes) -> bytes:
    out = bytearray(SPRITE_W * SPRITE_H * 3)
    for i, idx in enumerate(multicolour_indices(block)):
        out[i * 3:i * 3 + 3] = bytes(MULTICOLOUR_PALETTE[idx])
    return bytes(out)


def auto_rgb(block: bytes) -> bytes:
    """Per-frame heuristic pick between hires and multicolour by run-length coherence score.

    NOT proven by code -- the caller that would settle per-frame mode for real is unlocated (see
    the module docstring). This is a data-driven best-effort render, kept separate from the
    default `rgb()` so the plain hires decode (the corpus-wide majority interpretation) stays the
    unambiguous default. Improves several frames -- e.g. Champions SPRITE01 frame 5, which is
    solid noise under forced hires and a coherent green-and-red silhouette under this heuristic --
    without asserting the answer is certain for every frame.
    """
    if hires_run_score(block) >= multicolour_run_score(block):
        return rgb(block)
    return multicolour_rgb(block)


_RENDERERS = {"hires": rgb, "multicolour": multicolour_rgb, "auto": auto_rgb}


def filmstrip_rgb(prg: bytes, mode: str = "hires", gap: int = 1) -> tuple[int, int, bytes]:
    """All frames of one SPRITE file laid out left-to-right, separated by a 1px gap column."""
    render = _RENDERERS[mode]
    fr = frames(prg)
    n = len(fr)
    width = n * SPRITE_W + (n - 1) * gap
    height = SPRITE_H
    out = bytearray(width * height * 3)
    for i in range(width * height):
        out[i * 3:i * 3 + 3] = bytes(DEFAULT_BG)
    for i, block in enumerate(fr):
        frame_rgb = render(block)
        x0 = i * (SPRITE_W + gap)
        for y in range(SPRITE_H):
            src = y * SPRITE_W * 3
            dst = (y * width + x0) * 3
            out[dst:dst + SPRITE_W * 3] = frame_rgb[src:src + SPRITE_W * 3]
    return width, height, bytes(out)


def write_png(path: Path, width: int, height: int, rgb_bytes: bytes, scale: int = 1) -> None:
    try:
        from PIL import Image
    except ImportError:
        _write_png_raw(path, width, height, rgb_bytes)
        return
    im = Image.frombytes("RGB", (width, height), bytes(rgb_bytes))
    if scale != 1:
        im = im.resize((width * scale, height * scale), Image.NEAREST)
    im.save(path)


def _write_png_raw(path: Path, width: int, height: int, rgb_bytes: bytes) -> None:
    import zlib
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgb_bytes[y * width * 3:(y + 1) * width * 3]

    def chunk(typ: bytes, payload: bytes) -> bytes:
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def disk_files(image: Path) -> dict[str, bytes]:
    """Every readable closed PRG on one image, by name."""
    disk = c64.read_image(image)
    out: dict[str, bytes] = {}
    for e in c64.directory(disk):
        if e.file_type != "PRG" or not e.closed:
            continue
        data, problem = c64.read_file_checked(disk, e)
        if not problem:
            out[e.name] = data
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", type=Path, nargs="?", help="a SPRITE PRG extracted from a disk")
    ap.add_argument("--disk", type=Path, help="read the sprite straight out of a .d64/.g64")
    ap.add_argument("--name", help="sprite name on --disk, e.g. SPRITE01")
    ap.add_argument("--all", action="store_true", help="render every SPRITE file on --disk")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--outdir", type=Path, default=Path("renders/c64_sprite"))
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--mode", choices=sorted(_RENDERERS), default="hires",
                    help="hires (default, corpus-majority mode), multicolour, "
                         "or auto (per-frame heuristic, see module docstring)")
    a = ap.parse_args(argv)

    if a.disk:
        files = disk_files(a.disk)
        wanted = ([n for n, d in sorted(files.items()) if n.startswith("SPRITE") and is_sprite(d)]
                  if a.all else [a.name] if a.name else [])
        if not wanted:
            print("give --name or --all", file=sys.stderr)
            return 2
        a.outdir.mkdir(parents=True, exist_ok=True)
        for name in wanted:
            if name not in files:
                print(f"{name}: not on {a.disk.name}", file=sys.stderr)
                return 1
            w, h, px = filmstrip_rgb(files[name], a.mode)
            out = a.out if (a.out and not a.all) else a.outdir / f"{name}.png"
            write_png(out, w, h, px, a.scale)
            fr = framing(body(files[name]))
            print(f"{name} -> {out}  ({fr.kind}, {fr.frame_count} frames)")
        return 0

    if not a.file:
        print("give --disk, or a loose SPRITE PRG file", file=sys.stderr)
        return 2
    prg = a.file.read_bytes()
    w, h, px = filmstrip_rgb(prg, a.mode)
    out = a.out or a.file.with_suffix(".png")
    write_png(out, w, h, px, a.scale)
    fr = framing(body(prg))
    print(f"{a.file.name} -> {out}  ({fr.kind}, {fr.frame_count} frames)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
