#!/usr/bin/env python3
"""Gen1 (CoK/DoK) GEO "traversal scope" measurement — LAYER 1 is the headline number.

Replaces the unquantified `native-cok-dok-compatibility-plan.md` / `CLAUDE.md` disclaimer ("no
claim is made yet for complete map traversal ...") with a re-derivable count, and is explicit
about which of FOUR distinct layers that count actually certifies:

    1. container sniff / structural load   <- THIS MODULE'S HEADLINE NUMBER (34/34)
    2. texture bank (WALLDEF/8X8D)         <- not measured here (see docs/engine/HANDOFF.md's
                                               DoK wall-art cross-disk writeup: 19/19 playable
                                               areas resolve wall art, a DIFFERENT count from
                                               this module's 34 container-level GEO blocks)
    3. ECL LOAD_FILES wiring                <- a SECONDARY, advisory cross-check lives in this
                                               module (`ecl_load_files_sites` / `dok_paired_area_
                                               census`) because it was needed to settle two
                                               disputed sub-findings and to reproduce the
                                               mandatory dialect-mutation the item's brief
                                               demanded. It is NOT folded into the headline count.
    4. DOSBox-PROVEN RUNTIME TRAVERSAL      <- NOT measured here. No DOSBox session was run to
                                               produce this module. Nothing below may be cited as
                                               evidence of layer 4.

LAYER 1 — THE HEADLINE MEASUREMENT
-----------------------------------
`geo_container_scope(root)` parses the retail `GEO{1,2,3}.DAX` TOCs directly (headerless
9-byte-entry DAX container, `docs/dax-format.md` section 1) with NO decompression needed to
answer "how many blocks does this container structurally offer as GEO maps": a block is a Gen1
GEO map iff its DECOMPRESSED size is exactly 1026 bytes (`native/src/ccgeo.asm`'s own
`cmp ax, 1026` gate — 2-byte header word + 4 x 256-byte planes). This module actually
decompresses every block whose TOC `raw_size` field already claims 1026, using the same
signed-byte RLE `tools/dax_decode.py` implements, and asserts the decompressed length actually
IS 1026 — so a TOC field that lies about its own decompressed size cannot inflate the count.

Measured on the retail GOG installs in this repo root:
    CoK (Champions of Krynn/GEO{1,2,3}.DAX):  15 blocks, ids
        32, 34, 48, 49, 50, 64, 66, 67, 68, 80, 81, 82, 96, 97, 99
    DoK (Death Knights of Krynn/GEO{1,2,3}.DAX): 19 blocks, ids
        32, 33, 34, 36, 48, 49, 50, 51, 64, 65, 66, 67, 80, 82, 83, 96, 97, 98, 99
    TOTAL: 34. The set of raw_size values seen (over every TOC entry, not just the 1026 ones) is
    used only to report "no other value present" as a sanity fact; the 1026 filter is what
    selects GEO maps.

SUB-FINDING (d)(i) — GEO id 127 is NOT a container-level block, in either game
-------------------------------------------------------------------------------
`127` never appears as a `block_id` in any GEO{1,2,3}.DAX TOC (of either game), at ANY raw_size —
not just among the 1026-byte ones. Verified by `id_127_present_in_container` below by scanning
every TOC entry, not only the accepted ones. `127` IS a real ECL bytecode literal: it is the
"no-map" sentinel value CoK/DoK area-transition scripts pass as the target of an `0x21
LOAD_FILES` instruction to mean "stay wherever you already are" (documented in
`docs/engine/HANDOFF.md`'s CoK wall-art-residuals section: "16/17/36 are overland/travel scripts
(`LOAD_FILES(127,127,127)` — the no-map sentinel)"). Two prior re-implementations that scanned
ECL LOAD_FILES operands (a LAYER 3 activity) rather than GEO container TOCs (LAYER 1) apparently
counted that sentinel as an "extra target" — it is not a 35th GEO block, and this module's
headline number is correctly 34, not 35.

SUB-FINDING (d)(ii) — DoK's LOAD_FILES(127) "dynamic site" count is 1, not 2
-------------------------------------------------------------------------------
Settled by actually decoding DoK's own ECL1/2/3.DAX bytecode (all 25 blocks: 2,16,17,32-36 /
48-51,64-67 / 80-84,96-99) with a full five-entry-point reachability walk (`walk_ecl_reachable`,
a direct, disclosed Python port of `packages/engine/src/ecl/reachability.ts`'s
`walkEclReachable` + `packages/engine/src/ecl/disassemble.ts`'s `decodeInstructionAt`/opcode
table, done because no existing Python ECL tool in this repo implements the control-flow walk
this needed and porting was cheaper and more auditable than shelling out to node). Under DoK's
OWN verified dialect (`ECL_GEN1_SHORT_DOK` — `disassemble.ts`, round 35 R1, 2026-09-05: 0x1f
wordSet 2->1, 0x29 wordSet 14->0, 0x27 TREASURE wordSet 8->{wordSet 4, countAt 3}), the walk
produces **zero desync sites across all 25 blocks** and finds **exactly ONE** `0x21 LOAD_FILES`
instruction whose first operand is 127: block 17, offset 0x2e (vaddr 0x802e). Block 16 and block
35 — DoK's other two non-map-paired ECL scripts — never reach a LOAD_FILES instruction at all
under any dialect tried (matches `docs/engine/HANDOFF.md`'s CoK-side finding that some
non-map scripts have "no LOAD_FILES of a real map ... anywhere in their full subroutine graphs").
This count is ROBUST: it stays exactly 1 even when the corpus is deliberately decoded under the
WRONG dialect (see the mandatory mutation below) — the site survives because it sits very close
to block 17's own entry point, ahead of where the wrong dialect first desyncs.

MANDATORY MUTATION — reproducing the false "17/19, ids 65+97 uncovered" DoK census
-------------------------------------------------------------------------------------
`dok_paired_area_census(dialect)` derives, from the ECL reachability walk, which of the 19 real
(container-verified) DoK GEO ids also have an ECL block that LOAD_FILES's ITS OWN id (the
self-referential "this area's script loads this area's own map" pairing every playable Gen1 area
uses). Under DoK's own correct dialect this reproduces all 19/19. Under the WRONG dialect —
CoK's un-overridden `ECL_GEN1` ("long word-set" dialect: 0x1f stays at the shared base wordSet 2
instead of DoK's own 1, 0x29 stays at 14 instead of DoK's own 0, `0x27` stays at the Gen1 base
8-operand TREASURE frame instead of DoK's own 4-operand/countAt-3 one) — every one of those three
operand-count deltas desyncs the byte stream at the first site it fires, and the corruption
cascades: desync sites go from 0 to 185 across the corpus (a very visible spike), and the
self-referential LOAD_FILES pairing is lost for EXACTLY ids 65 and 97 (their own LOAD_FILES
instructions decode as, respectively, nothing at all and nothing at all, because the byte stream
carrying them has already desynced by the time execution would reach them under the wrong
dialect) — reproducing the historical false "17/19, ids 65+97 uncovered" DoK census exactly.
See `test_gen1_geo_traversal_scope.py`'s `test_mandatory_mutation_...` for the assertions and the
raw evidence this module used to derive them (`docs/engine/research/dok-geo127-dialect-mutation.md`
is NOT written by this module — the evidence lives in the test file's own recorded output).

WHAT THIS MODULE DOES NOT DO
-------------------------------
- It does not run DOSBox, and makes no claim about layer 4 (runtime traversal).
- It does not resolve WALLDEF/8X8D texture-bank coverage (layer 2) — see
  `docs/engine/HANDOFF.md`'s "DoK wall-art coverage gap" writeup for that count (19/19, a
  DIFFERENT 19 than this module's DoK GEO-block count, even though the number matches).
- The ECL walker here is a PURPOSE-BUILT, narrowly-scoped port: it implements exactly the two
  dialects (`DIALECT_COK` / `DIALECT_DOK_OWN`) and exactly the opcode table needed to reproduce
  the LOAD_FILES pairing census and the mandatory mutation. It is not a general ECL disassembler
  and must not be reused as one — the canonical, actively-maintained implementation is
  `packages/engine/src/ecl/{disassemble.ts,reachability.ts,opcodes.ts}`.
- Incidental correction (e): DoK's `8X8D4.DAX`/`8X8D5.DAX` and `WALLDEF4.DAX`/`WALLDEF5.DAX`
  are NOT evidence of a 4th/5th playable AREA. DoK ships only `GEO1.DAX`/`GEO2.DAX`/`GEO3.DAX` —
  three GEO containers, same as CoK — and every one of the 19 real GEO blocks this module finds
  lives in one of those three files. The two extra WALLDEF/8X8D archives are a texture-bank
  fact (layer 2): DoK's wall-tile/8X8D block-id space happens to be split across 5 archives
  where CoK's fits in 3, and some DoK areas' `LOAD_PIECES` operands resolve only against
  `WALLDEF4.DAX`/`8X8D4.DAX`/`8X8D5.DAX` even though those areas are defined on `ECL1.DAX`/
  `GEO1.DAX` (`docs/engine/research/dok-wall-art-cross-disk.md`). No GEO block anywhere
  references a 4th or 5th AREA disk; there is no such thing in DoK's data.
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[1]

TOC_ENTRY_SIZE = 9
GEN1_GEO_RAW_SIZE = 1026  # 2-byte header word + 4 x 256-byte planes (ccgeo.asm: cmp ax, 1026)

GEN1_GAMES: dict[str, str] = {
    "cok": "Champions of Krynn",
    "dok": "Death Knights of Krynn",
}
GEO_FILE_NUMBERS = (1, 2, 3)


# ---------------------------------------------------------------------------
# LAYER 1 — DAX container TOC parsing + signed-byte RLE (ported from
# tools/dax_decode.py's parse_container/rle_decode; kept local and dependency-free so this
# module's own test can mutate ONLY this copy without touching a shared file another tool relies
# on).
# ---------------------------------------------------------------------------


@dataclass
class DaxTocEntry:
    index: int
    block_id: int
    data_offset: int
    raw_size: int
    comp_size: int


def parse_dax_toc(data: bytes) -> tuple[int, list[DaxTocEntry]]:
    """Return (data_base, entries). Raises ValueError if `data` is not a DAX container."""
    if len(data) < 2:
        raise ValueError("file too small to hold a DAX header word")
    toc_bytes = struct.unpack_from("<H", data, 0)[0]
    if toc_bytes == 0 or toc_bytes % TOC_ENTRY_SIZE != 0:
        raise ValueError(f"word0={toc_bytes} is not a positive multiple of {TOC_ENTRY_SIZE}")
    n = toc_bytes // TOC_ENTRY_SIZE
    data_base = 2 + toc_bytes
    if data_base > len(data):
        raise ValueError(f"TOC of {toc_bytes} bytes overruns a {len(data)}-byte file")
    entries = []
    for i in range(n):
        off = 2 + i * TOC_ENTRY_SIZE
        block_id = data[off]
        data_offset, raw_size, comp_size = struct.unpack_from("<IHH", data, off + 1)
        entries.append(DaxTocEntry(i, block_id, data_offset, raw_size, comp_size))
    return data_base, entries


def rle_decode(buf: bytes, expected: Optional[int] = None) -> bytes:
    """SSI signed-byte RLE (same algorithm as tools/dax_decode.py's rle_decode)."""
    out = bytearray()
    i = 0
    n = len(buf)
    while i < n:
        if expected is not None and len(out) >= expected:
            break
        c = buf[i]
        i += 1
        if c < 0x80:  # literal run of c+1 bytes
            cnt = c + 1
            out += buf[i:i + cnt]
            i += cnt
        else:  # repeat next byte (256-c) times
            cnt = 256 - c
            if i < n:
                out += bytes([buf[i]]) * cnt
            i += 1
    return bytes(out)


@dataclass
class GeoBlockRecord:
    file: str
    block_id: int
    toc_raw_size: int
    decompressed_len: int
    header_word: Optional[int]  # first 2 LE bytes of the decompressed payload, if long enough


@dataclass
class Gen1GeoScopeResult:
    game: str
    game_dir: str
    accepted: list[GeoBlockRecord] = field(default_factory=list)
    all_raw_sizes_seen: set[int] = field(default_factory=set)
    all_block_ids_seen: set[int] = field(default_factory=set)
    missing_files: list[str] = field(default_factory=list)

    @property
    def accepted_ids(self) -> list[int]:
        return sorted(r.block_id for r in self.accepted)

    @property
    def count(self) -> int:
        return len(self.accepted)


def geo_container_scope(
    game: str,
    *,
    root: Path = REPO_ROOT,
    raw_size_filter: int = GEN1_GEO_RAW_SIZE,
    require_header_word: Optional[int] = None,
) -> Gen1GeoScopeResult:
    """Parse `GEO{1,2,3}.DAX` for `game` ('cok' or 'dok') and return every block whose
    DECOMPRESSED length equals `raw_size_filter` (the real Gen1-GEO structural gate).

    `require_header_word`, when given, additionally requires the decompressed payload's first
    2 bytes (little-endian) to equal that value. This parameter exists ONLY so the mandatory
    mutation test can demonstrate what a wrong, CoK-specific extra constraint would do to DoK's
    count — production code (and the default call) never sets it.
    """
    if game not in GEN1_GAMES:
        raise ValueError(f"unknown Gen1 game {game!r}; expected one of {sorted(GEN1_GAMES)}")
    game_dir = GEN1_GAMES[game]
    result = Gen1GeoScopeResult(game=game, game_dir=game_dir)
    for n in GEO_FILE_NUMBERS:
        path = root / game_dir / f"GEO{n}.DAX"
        if not path.is_file():
            result.missing_files.append(str(path))
            continue
        data = path.read_bytes()
        data_base, entries = parse_dax_toc(data)
        for e in entries:
            result.all_raw_sizes_seen.add(e.raw_size)
            result.all_block_ids_seen.add(e.block_id)
            if e.raw_size != raw_size_filter:
                continue
            comp = data[data_base + e.data_offset: data_base + e.data_offset + e.comp_size]
            raw = rle_decode(comp, e.raw_size)
            if len(raw) != raw_size_filter:
                # The TOC field lied about its own decompressed size — do not accept it as a
                # Gen1 GEO block just because the TOC said so.
                continue
            header_word = struct.unpack_from("<H", raw, 0)[0] if len(raw) >= 2 else None
            if require_header_word is not None and header_word != require_header_word:
                continue
            result.accepted.append(
                GeoBlockRecord(
                    file=f"GEO{n}.DAX",
                    block_id=e.block_id,
                    toc_raw_size=e.raw_size,
                    decompressed_len=len(raw),
                    header_word=header_word,
                )
            )
    return result


def id_127_present_in_container(game: str, *, root: Path = REPO_ROOT) -> bool:
    """True iff block id 127 appears ANYWHERE in game's GEO{1,2,3}.DAX TOCs, at any raw_size.
    Answers sub-finding (d)(i): 127 is an ECL-level sentinel, never a container-level GEO block.
    """
    game_dir = GEN1_GAMES[game]
    for n in GEO_FILE_NUMBERS:
        path = root / game_dir / f"GEO{n}.DAX"
        if not path.is_file():
            continue
        data = path.read_bytes()
        _, entries = parse_dax_toc(data)
        if any(e.block_id == 127 for e in entries):
            return True
    return False


# ---------------------------------------------------------------------------
# LAYER 3 (advisory cross-check only) — a narrowly-scoped ECL Gen1 reachability walker.
#
# Direct, disclosed port of:
#   packages/engine/src/ecl/opcodes.ts       (KRYNN_GEN1_OPCODES)
#   packages/engine/src/ecl/disassemble.ts   (EclDialect, decodeInstructionAt, ECL_GEN1,
#                                              ECL_GEN1_SHORT_DOK)
#   packages/engine/src/ecl/reachability.ts  (walkEclReachable's worklist/control-flow rules)
# read on 2026-09-09. Ported rather than shelled out to node so this cross-check is pure Python,
# reproducible without a JS toolchain, and independently auditable line-by-line against the TS
# source cited above. NOT a general ECL disassembler — see the module docstring's "WHAT THIS
# MODULE DOES NOT DO".
# ---------------------------------------------------------------------------

ECL_HEADER_LEN = 22
ECL_VBASE = 0x7FFE

# opcode -> (wordSet, mnemonic, countAt-or-None). Ported verbatim from KRYNN_GEN1_OPCODES
# (packages/engine/src/ecl/opcodes.ts) — only the fields this walker actually uses.
KRYNN_GEN1_OPCODES: dict[int, tuple[int, str, Optional[int]]] = {
    0x00: (0, "EXIT", None),
    0x01: (1, "GOTO", None),
    0x02: (1, "GOSUB", None),
    0x03: (2, "COMPARE", None),
    0x04: (3, "ADD", None),
    0x05: (3, "SUBTRACT", None),
    0x06: (3, "DIVIDE", None),
    0x07: (3, "MULTIPLY", None),
    0x08: (2, "RANDOM", None),
    0x09: (2, "SAVE", None),
    0x0a: (1, "LOAD_CHARACTER", None),
    0x0b: (3, "LOAD_MONSTER", None),
    0x0c: (3, "SETUP_MONSTER", None),
    0x0d: (0, "APPROACH", None),
    0x0e: (1, "PICTURE", None),
    0x0f: (2, "INPUT_NUMBER", None),
    0x10: (2, "INPUT_STRING", None),
    0x11: (1, "PRINT", None),
    0x12: (1, "PRINTCLEAR", None),
    0x13: (0, "RETURN", None),
    0x14: (4, "COMPARE_AND", None),
    0x15: (3, "VERTICAL_MENU", 2),
    0x16: (0, "IF_EQ", None),
    0x17: (0, "IF_NE", None),
    0x18: (0, "IF_LT", None),
    0x19: (0, "IF_GT", None),
    0x1a: (0, "IF_LE", None),
    0x1b: (0, "IF_GE", None),
    0x1c: (0, "CLEARMONSTERS", None),
    0x1d: (1, "PARTYSTRENGTH", None),
    0x1e: (6, "CHECKPARTY", None),
    0x1f: (2, "UNKNOWN_1F", None),
    0x20: (1, "NEWECL", None),
    0x21: (3, "LOAD_FILES", None),
    0x22: (2, "PARTY_SURPRISE", None),
    0x23: (4, "SURPRISE", None),
    0x24: (0, "COMBAT", None),
    0x25: (2, "ON_GOTO", 1),
    0x26: (2, "ON_GOSUB", 1),
    0x27: (8, "TREASURE", None),
    0x28: (3, "ROB", None),
    0x29: (14, "ENCOUNTER_MENU", None),
    0x2a: (3, "GETTABLE", None),
    0x2b: (2, "HORIZONTAL_MENU", 1),
    0x2c: (6, "PARLAY", None),
    0x2d: (1, "CALL", None),
    0x2e: (5, "DAMAGE", None),
    0x2f: (3, "AND", None),
    0x30: (3, "OR", None),
    0x31: (0, "SPRITE_OFF", None),
    0x32: (1, "FIND_ITEM", None),
    0x33: (0, "PRINT_RETURN", None),
    0x34: (2, "ECL_CLOCK", None),
    0x35: (3, "SAVE_TABLE", None),
    0x36: (2, "ADD_NPC", None),
    0x37: (3, "LOAD_PIECES", None),
    0x38: (1, "PROGRAM", None),
    0x39: (1, "WHO", None),
    0x3a: (0, "DELAY", None),
    0x3b: (3, "SPELL", None),
    0x3c: (1, "PROTECTION", None),
    0x3d: (0, "CLEAR_BOX", None),
    0x3e: (0, "DUMP", None),
    0x3f: (1, "FIND_SPECIAL", None),
    0x40: (1, "DESTROY_ITEMS", None),
    0x41: (2, "GEN1_AWARD_XP", None),
}

IF_MIN, IF_MAX = 0x16, 0x1B
EXIT, RETURN, NEWECL, GOTO, GOSUB, ON_GOTO, ON_GOSUB = 0x00, 0x13, 0x20, 0x01, 0x02, 0x25, 0x26

# A Dialect carries two INDEPENDENT kinds of per-opcode delta, matching
# `packages/engine/src/ecl/disassemble.ts`'s `EclDialect` shape exactly (this distinction is
# what the first version of this port got wrong — see the comment on `Dialect` below):
#
#   - `wordset_overrides`: opcode -> replacement wordSet, layered ON TOP of the shared base
#     table's (wordSet, mnemonic, countAt) — countAt and mnemonic are UNCHANGED.
#   - `opcode_overrides`: opcode -> a WHOLE NEW (wordset, count_at, mnemonic) triple that
#     REPLACES the shared base table entry outright (TS's `opcodeOverrides`) — used for an
#     opcode whose per-title meaning is not just "N operands instead of M" but a different
#     instruction shape entirely (e.g. 0x31 stops being 0-operand SPRITE_OFF and becomes a
#     count-driven SHORT_MENU).
#
# `ECL_GEN1` (CoK / the shared Gen1 base) has neither. `ECL_GEN1_SHORT_DOK` is DoK's OWN
# verified dialect (disassemble.ts, round 35 R1, 2026-09-05): `ECL_GEN1_SHORT`'s base
# {wordset_overrides: {0x0c:4,0x1d:0,0x22:0,0x23:0,0x2c:1}, opcode_overrides: {0x31: SHORT_MENU
# wordSet=2/countAt=1}} PLUS DoK's own three measured deltas — two more wordset_overrides
# ({0x1f:1, 0x29:0}) and one opcode_override (0x27 TREASURE: wordSet 8 -> {wordSet 4,
# countAt 3}).
#
# FIRST-DRAFT BUG, FOUND AND FIXED BY MUTATION-TESTING THIS VERY MODULE (2026-09-09): the first
# version of this file modelled dialects as a single flat `{opcode: wordset}` dict and never
# ported `opcode_overrides` (0x31 -> SHORT_MENU) at all, so 0x31 stayed the base table's 0-operand
# SPRITE_OFF under `DIALECT_DOK_OWN`. That silently desynced DoK ECL1 block 35 one instruction
# after the first real 0x31 site (a spurious GOTO decoded where SHORT_MENU's own operands should
# have been skipped, landing on an unrelated data byte and reading it as a bad opcode) and
# reported a false desync where the TypeScript oracle (`walkEclReachable` under
# `ECL_GEN1_SHORT_DOK`) reports none. Caught by cross-checking this port's block-by-block desync
# count against a live `pnpm --filter @goldbox/engine vitest run` probe of the same bytes
# (recorded in this item's handoff, not committed as a fixture) BEFORE publishing the "0 desync
# sites, dialect is clean" claim below — the module docstring's own numbers were regenerated
# after this fix, not before it.
@dataclass(frozen=True)
class Dialect:
    wordset_overrides: dict[int, int] = field(default_factory=dict)
    opcode_overrides: dict[int, tuple[int, Optional[int], str]] = field(default_factory=dict)


DIALECT_COK = Dialect()
DIALECT_DOK_OWN = Dialect(
    wordset_overrides={0x0c: 4, 0x1d: 0, 0x22: 0, 0x23: 0, 0x2c: 1, 0x1f: 1, 0x29: 0},
    opcode_overrides={
        0x31: (2, 1, "SHORT_MENU"),
        0x27: (4, 3, "TREASURE"),
    },
)


@dataclass
class EclOpp:
    code: int
    high: int
    word: int


@dataclass
class EclInstruction:
    offset: int
    opcode: int
    mnemonic: str
    args: list[EclOpp]
    size: int


def _def_for(opcode: int, dialect: Dialect) -> tuple[int, Optional[int], str]:
    """(wordset, count_at, mnemonic) for `opcode` under `dialect` — mirrors
    decodeInstructionAt's `dialect?.opcodeOverrides?.[opcode] ?? KRYNN_GEN1_OPCODES[opcode]`
    followed by `dialect?.wordSetOverrides?.[opcode] ?? def.wordSet`."""
    override = dialect.opcode_overrides.get(opcode)
    if override is not None:
        base_wordset, count_at, mnemonic = override
    else:
        base_wordset, mnemonic, count_at = KRYNN_GEN1_OPCODES[opcode]
    wordset = dialect.wordset_overrides.get(opcode, base_wordset)
    return wordset, count_at, mnemonic


def decode_instruction_at(raw: bytes, offset: int, dialect: Dialect) -> tuple[Optional[EclInstruction], int, bool, bool]:
    """Returns (instruction_or_None, next_offset, bad_opcode, truncated)."""
    if offset >= len(raw):
        return None, offset, True, False
    opcode = raw[offset]
    if opcode not in KRYNN_GEN1_OPCODES and opcode not in dialect.opcode_overrides:
        return None, offset, True, False
    wordset, count_at, mnemonic = _def_for(opcode, dialect)
    pos = offset + 1
    args: list[EclOpp] = []
    truncated = False

    def read_opp() -> bool:
        nonlocal pos, truncated
        if pos >= len(raw):
            truncated = True
            return False
        code = raw[pos]
        high = raw[pos + 1] if pos + 1 < len(raw) else 0
        pos += 2
        if code in (1, 2, 3, 0x81):
            val = raw[pos] if pos < len(raw) else 0
            pos += 1
            word = ((val << 8) | high) & 0xFFFF
        else:
            word = high
        if code == 0x80:
            pos += high  # skip the inline 6-bit packed string body
            if pos > len(raw):
                truncated = True
        args.append(EclOpp(code=code, high=high, word=word))
        return not truncated

    for _ in range(wordset):
        if not read_opp():
            break
    if not truncated and count_at is not None:
        count = args[count_at].word if count_at < len(args) else 0
        for _ in range(count):
            if not read_opp():
                break

    ins = EclInstruction(offset=offset, opcode=opcode, mnemonic=mnemonic, args=args, size=pos - offset)
    return ins, pos, False, truncated


def _to_offset(word: int, vbase: int = ECL_VBASE) -> int:
    return word - vbase if word >= vbase else word


def _far_pointer_offset(raw: bytes, slot: int) -> int:
    o = 2 + slot * 4 + 2  # magic(2) + slot*{segment(2),vaddr(2)}, vaddr word at +2
    return raw[o] | (raw[o + 1] << 8)


@dataclass
class ReachabilityResult:
    instructions: dict[int, EclInstruction]
    desync_offsets: set[int]

    @property
    def desync_count(self) -> int:
        return len(self.desync_offsets)


def walk_ecl_reachable(raw: bytes, dialect: Dialect) -> ReachabilityResult:
    """Port of walkEclReachable (reachability.ts): worklist walk from all FIVE header entry
    points, following GOTO/GOSUB/ON_GOTO/ON_GOSUB/IF_* control flow, ascending-offset processing.
    """
    entry_offsets = [_to_offset(_far_pointer_offset(raw, slot)) for slot in range(5)]
    instructions: dict[int, EclInstruction] = {}
    desync_offsets: set[int] = set()
    seen_pairs: set[tuple[int, int]] = set()
    # worklist item: (offset, entry_index)
    worklist: list[tuple[int, int]] = []
    for entry_idx, start in enumerate(entry_offsets):
        if start < ECL_HEADER_LEN or start >= len(raw):
            continue  # invalid entry pointer: metadata, never executed code, not a desync
        worklist.append((start, entry_idx))

    def is_mid_instruction(offset: int) -> bool:
        for ins in instructions.values():
            if ins.offset < offset < ins.offset + ins.size:
                return True
        return False

    while worklist:
        min_idx = min(range(len(worklist)), key=lambda i: worklist[i][0])
        offset, entry_idx = worklist.pop(min_idx)
        pair_key = (offset, entry_idx)
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        if offset in desync_offsets:
            continue
        if offset not in instructions:
            if offset < ECL_HEADER_LEN or offset >= len(raw):
                continue  # out-of-block target: misaligned, not a desync
            if is_mid_instruction(offset):
                continue  # mid-instruction target: misaligned, not a desync
            ins, _next, bad, truncated = decode_instruction_at(raw, offset, dialect)
            if bad or ins is None or truncated:
                desync_offsets.add(offset)
                continue
            instructions[offset] = ins
        ins = instructions[offset]
        next_off = offset + ins.size
        op = ins.opcode

        if IF_MIN <= op <= IF_MAX:
            worklist.append((next_off, entry_idx))
            guard_ins, guard_next, guard_bad, guard_truncated = decode_instruction_at(raw, next_off, dialect)
            if not guard_bad and guard_ins is not None and not guard_truncated:
                worklist.append((guard_next, entry_idx))
            continue

        if op in (EXIT, RETURN, NEWECL):
            continue
        if op == GOTO:
            worklist.append((_to_offset(ins.args[0].word), entry_idx))
        elif op == GOSUB:
            worklist.append((_to_offset(ins.args[0].word), entry_idx))
            worklist.append((next_off, entry_idx))
        elif op in (ON_GOTO, ON_GOSUB):
            count = ins.args[1].word if len(ins.args) > 1 else 0
            for i in range(count):
                idx = 2 + i
                if idx < len(ins.args):
                    worklist.append((_to_offset(ins.args[idx].word), entry_idx))
            if op == ON_GOSUB:
                worklist.append((next_off, entry_idx))
        else:
            worklist.append((next_off, entry_idx))

    return ReachabilityResult(instructions=instructions, desync_offsets=desync_offsets)


def ecl_load_files_sites(ecl_dax_path: Path, dialect: Dialect) -> tuple[list[tuple[int, int, int]], int]:
    """Decode every block of `ecl_dax_path` under `dialect`; return
    ([(block_id, offset, target), ...] for every 0x21 LOAD_FILES instruction found, total
    desync-site count across the whole file)."""
    data = ecl_dax_path.read_bytes()
    data_base, entries = parse_dax_toc(data)
    sites: list[tuple[int, int, int]] = []
    total_desync = 0
    for e in entries:
        comp = data[data_base + e.data_offset: data_base + e.data_offset + e.comp_size]
        raw = rle_decode(comp, e.raw_size)
        result = walk_ecl_reachable(raw, dialect)
        total_desync += result.desync_count
        for ins in result.instructions.values():
            if ins.opcode == 0x21 and ins.args:
                sites.append((e.block_id, ins.offset, ins.args[0].word))
    return sites, total_desync


def dok_paired_area_census(dialect: Dialect, *, root: Path = REPO_ROOT) -> tuple[set[int], int]:
    """Return (set of DoK GEO ids whose OWN ECL block LOAD_FILES's that SAME id, total desync
    count across ECL1-3.DAX) under `dialect`. Self-referential pairing = the mechanism every
    playable Gen1 area uses (its own init script's first LOAD_FILES loads its own map)."""
    game_dir = GEN1_GAMES["dok"]
    paired: set[int] = set()
    total_desync = 0
    for n in GEO_FILE_NUMBERS:
        path = root / game_dir / f"ECL{n}.DAX"
        sites, desync = ecl_load_files_sites(path, dialect)
        total_desync += desync
        by_block: dict[int, list[int]] = {}
        for block_id, _offset, target in sites:
            by_block.setdefault(block_id, []).append(target)
        for block_id, targets in by_block.items():
            if block_id in targets:
                paired.add(block_id)
    return paired, total_desync


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_report() -> dict:
    cok = geo_container_scope("cok")
    dok = geo_container_scope("dok")
    report = {
        "layer": "1 (container sniff / structural load) — headline number",
        "cok": {
            "count": cok.count,
            "ids": cok.accepted_ids,
            "raw_sizes_seen": sorted(cok.all_raw_sizes_seen),
        },
        "dok": {
            "count": dok.count,
            "ids": dok.accepted_ids,
            "raw_sizes_seen": sorted(dok.all_raw_sizes_seen),
        },
        "total": cok.count + dok.count,
        "id_127_present_in_container": {
            "cok": id_127_present_in_container("cok"),
            "dok": id_127_present_in_container("dok"),
        },
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="write the report as JSON to this path")
    args = parser.parse_args()
    report = build_report()
    text = json.dumps(report, indent=2)
    if args.json:
        args.json.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
