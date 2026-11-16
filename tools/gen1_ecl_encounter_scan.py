"""Find statically reachable Gen1 ECL encounter-to-COMBAT paths.

The scanner decodes instructions from the five retail ECL header entries and carries
LOAD_MONSTER state through local control flow. Raw opcode-byte hits are never evidence.
It emits candidate paths for runtime seeding; dynamic comparisons and inputs remain
explicitly unresolved until a VM trace proves a concrete route.
"""
from __future__ import annotations

import argparse
import json
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import goldbox_corpus
from report_guard import guard_narrowing_write
from dqk_ca03_stream_decode import OPCODES, Opcode


ECL_HEADER_LEN = 22
ECL_VBASE = 0x7FFE
DEFAULT_ADDRESS_ADDEND = 0x8000
PROFILE_ADDRESS_ADDENDS = {"pool-of-radiance": 0x6700}
ENTRY_NAMES = ("vm_run_1", "search_location", "pre_camp_check", "camp_interrupted", "initial_entry")
# Per-dialect operand-count overrides on top of the shared Gen2 base table (OPCODES).
# The Gen1 titles split into two proven camps (docs/engine/research/dok-natural-route.md,
# 2026-07-18 operand-table audit):
#   - "long forms" (Pool 1988 / CoAB 1989 / Secret 1990 / CoK 1990 / NWN): 0x1D PARTYSTRENGTH
#     takes 1 operand (result variable), 0x2C PARLAY takes 6 (five mapped values + dest).
#     Proven by EclDump ground-truth dumps (daxdump_extracted/ECL1_033.txt: PARLAY spans
#     0x85C7..0x85D5 = 14 bytes = 1 + one 3-byte word + five 2-byte immediates) and by
#     anchor re-landing on 55/59 sole-pass sites across Pool/CoAB/Secret/CoK.
#   - "short forms" (DoK 1991 / Gateway 1991 / Treasures 1992 / PoD 1991): 0x1D takes 0
#     operands and 0x2C takes 1. Proven by instruction-boundary-exact whole-block parses
#     (DoK ECL1#2/#16 parse to exactly the block length only under 0/1) and unanimous
#     anchor verdicts (DoK 65:0, Treasures 75:0, PoD 154:0 decisive sites for 0x1D=0).
#     Gateway itself has zero reachable 0x1D/0x2C instructions; it is grouped with its
#     sibling Treasures (same Stormfront engine family) — the choice cannot affect output.
# 0x21 LOAD_FILES takes 3 operands in the early/long titles; later title-specific splits are
# recorded below from their own retail handlers.
GEN1_WORD_SETS = {0x1D: 1, 0x21: 3, 0x2C: 6}
# 0x22 PARTY_SURPRISE takes 0 operands in the short dialect (proven 2026-07-18 via a
# corpus-wide CFG-reachable-instruction audit across DoK/Gateway/Treasures/PoD: near-100%
# non-address-coded operand decodes under the shared wordSet=2, vs 100% clean under Pool of
# Radiance's long dialect). See packages/engine/src/ecl/disassemble.ts ECL_GEN1_SHORT and
# docs/engine/research/dok-natural-route.md Update 13.
# 0x23 SURPRISE takes 0 operands and 0x0C SETUP_MONSTER takes 4 in the short dialect (proven
# 2026-07-23 from DoK's OWN GAME.OVR handlers via build/dok-ecl-dispatch-map.json: 0x23 @ file
# offset 0x3076 fetches no ECL operands and tail-calls the CMD_Exit handler — i.e. short SURPRISE
# is also script-TERMINAL, see successors(); 0x0C @ 0xBAC is vm_LoadCmdSets(4). Corpus audit:
# 0x23 clean-under-4op = Pool 22/22 vs DoK 0/205 / Treasures 6/209 / PoD 9/369; 0x0C 4th-slot
# valid = DoK 157/157, Treasures 229/230, PoD 390/400 vs long titles 16-37 of ~200). See
# packages/engine/src/ecl/disassemble.ts ECL_GEN1_SHORT and dok-natural-route.md Update 15.
GEN1_SHORT_WORD_SETS = {0x0C: 4, 0x1D: 0, 0x21: 3, 0x22: 0, 0x23: 0, 0x2C: 1}
# Death Knights' own split off the shared short table (ported 2026-09-10 from
# `packages/engine/src/ecl/disassemble.ts`'s `ECL_GEN1_SHORT_DOK`, where it had lived since round
# 35 R1 on 2026-09-05 without this module ever being updated -- see `tools/ecl_dialect_parity.py`
# for the guard that now stops that recurring). Both deltas are read off DoK's OWN `GAME.OVR`
# handler prefetches (`docs/engine/research/dok-ecl-word-sets.md`), NOT inferred from a sibling
# title and NOT decided by the corpus, which that document is explicit about:
#
#   * `0x1F` = 1, against the shared literal's 2. Handler at file `0x2fbc`; bytes
#     `b0 01 50 9a 2a 00 41 00` at `0x2fc3` = `mov al,1; push ax; lcall 0x41,0x2a`, where
#     `0x41:0x2a` is DoK's own operand-parser entry. Re-read from the retail bytes 2026-09-10.
#   * `0x29` = 0, against 14. Handler at file `0x30e6` is the whole function
#     `push bp; mov bp,sp; inc word ptr [0x8c48]; pop bp; retf` -- it advances the PC and fetches
#     nothing, the same zero-operand shape the shared table already records for `0x1D`/`0x22`.
#
# `0x27 TREASURE` moves too, but it needs `count_at` as well as a count and so lives in
# `PROFILE_EXTENDED_OPCODES` below rather than here -- `word_sets` cannot express a count slot.
GEN1_SHORT_DOK_WORD_SETS = {**GEN1_SHORT_WORD_SETS, 0x1F: 1, 0x29: 0}
# Gateway's own split (2026-07-23, same audit): affirmatively LONG 3-operand 0x0C (237/238
# reachable sites clean only under 3-op) and zero reachable 0x23 sites (base 4-op frame kept as
# the claim-free default) — see disassemble.ts ECL_GEN1_SHORT_GATEWAY.
#
# CORRECTED 2026-09-10. This table read `{0x1D: 0, 0x21: 3, 0x22: 0, 0x2C: 1}` -- Gateway grouped
# with its 1991+ "short form" siblings on the strength of having ZERO reachable 0x1D/0x2C sites of
# its own, i.e. on the absence of evidence. Round 32 R4 then read Gateway's OWN `GAME.OVR` handler
# prefetches (`tools/map_gen1_ecl_dispatch.py --game gateway`,
# `docs/engine/research/gateway-ecl-dispatch-map.md`) and found the short grouping simply wrong:
# Gateway is LONG. `ECL_GEN1_SHORT_GATEWAY` was corrected on 2026-09-03 and this mirror was not,
# so for a week the scanner decoded Gateway under a framing Gateway's binary refutes. Each value
# below was re-read from the retail bytes on 2026-09-10:
#
#   * `0x1D` = 1 (long), not 0. Handler file `0x1ecc`: `b0 01 50 9a 2a 00 53 00`
#     = `mov al,1; push ax; lcall 0x53,0x2a`, Gateway's own operand-parser entry.
#   * `0x22` = 2 (long), not 0. Handler file `0x22b8`, same prefetch idiom with `mov al,2`.
#   * `0x2C` = 6 (long), not 1. Handler file `0x3360`, `mov al,6`.
#   * `0x32` = 4 and `0x40` = 4, both absent here entirely before today -- Gateway's own frames for
#     FIND_ITEM and DESTROY_ITEMS, wider than the shared table's 1 apiece.
#
# Spreading GEN1_WORD_SETS rather than restating 0x1D/0x21/0x2C says the LONG grouping structurally:
# Gateway now differs from the base Gen1 dialect in exactly the two opcodes listed after it.
GEN1_SHORT_GATEWAY_WORD_SETS = {**GEN1_WORD_SETS, 0x32: 4, 0x40: 4}
# Treasures of the Savage Frontier's own further split off GEN1_SHORT_WORD_SETS (2026-07-19,
# packages/engine/src/ecl/disassemble.ts ECL_GEN1_SHORT_TREASURES): its ECL1.DAX corpus desyncs
# every reachable LOAD_FILES (0x21) site under the shared 3-operand short frame; re-decoding 0x21
# as Gen2's own 2-operand short form resolves every one of them (all 30 blocks decode cleanly,
# several run to a clean EXIT). DoK/Gateway retain three operands; Pools now has its own independently
# handler-proven two-operand split below. Using the shared GEN1_SHORT_WORD_SETS dict for Treasures
# (as this scanner previously did) desyncs its whole corpus a few bytes past every LOAD_FILES site,
# producing phantom candidates.
# Two more of Treasures' own frames, ported 2026-09-10 from `ECL_GEN1_SHORT_TREASURES`, both read
# from Treasures' own `GAME.OVR` and both landing here a week late (the engine side moved
# 2026-09-03/04): `0x1F` = 1, and `0x37` = 2 -- the latter a `TREASURES_FIND_CHARACTER` frame
# whose FIRST proposal in round 32 R4 was FALSIFIED and retracted on a bad corpus census, then
# re-established. The retraction is the reason to cite the handler and not the census.
GEN1_SHORT_TREASURES_WORD_SETS = {
    0x0C: 4, 0x1D: 0, 0x1F: 1, 0x21: 2, 0x22: 0, 0x23: 0, 0x2C: 1, 0x37: 2,
}
# Pools of Darkness's OWN retail GAME.OVR handlers prove three more framing points beyond the
# shared short family: 0x1F=1, LOAD_FILES(0x21)=2, and the title-repurposed 0x37=2. The last is a
# party-name lookup in Pools, not the earlier three-set LOAD_PIECES command; the scanner only needs
# its exact frame to keep the CFG aligned. See ECL_GEN1_SHORT_POOLS in disassemble.ts.
GEN1_SHORT_POOLS_WORD_SETS = {
    0x0C: 4, 0x1D: 0, 0x1F: 1, 0x21: 2, 0x22: 0, 0x23: 0, 0x2C: 1, 0x37: 2,
}
# Buck Rogers: Countdown to Doomsday (2026-09-03, R6) -- measured directly from Buck's OWN
# GAME.OVR by `tools/map_buck_ecl_dispatch.py` (`docs/engine/research/buck-ecl-dispatch-map.md`),
# not inferred from corpus statistics or borrowed from another title's dialect. Buck's dispatcher
# and operand parser were located structurally against the shared CoAB oracle (dispatcher
# similarity 0.887, operand-parser 0.855 -- decisively above the runner-up candidates at
# 0.26/0.49, but below the ~1.0 the FBOV-family DoK/Pool tools see against the same oracle, since
# Buck's overlay carries the `TPOV` magic, a different retail link of the engine). Each opcode's
# word set below is read straight off its own handler's `mov al,N; push ax; lcall <parser>`
# prologue (the same evidentiary class as DoK's 2026-07-23 operand-table audit), not assumed:
#   * `0x0C` SETUP_MONSTER = 4 -- agrees with the 1991+ short family, not the base/long table's 3.
#   * `0x1D`, `0x22`, `0x23` = 2/3/3 -- agree with NEITHER the long dialect (1/2/4) nor the short
#     family's zero-operand reuse of the same three bytes. This is a third, Buck-specific framing.
#   * `0x27` = 2 -- the base table's opcode 0x27 is TREASURE (wordSet 8); Buck's own handler at
#     this byte position loads only 2 argument sets and then loops over them, so this is very
#     likely a different, Buck-specific command sharing the byte, not a narrower TREASURE.
#   * `0x3F`, `0x40` = 2/2 -- the base table has both as 1-operand (FIND_SPECIAL, DESTROY_ITEMS).
# `0x3C` PROTECTION = 0 (added 2026-09-03, round 30 R4, syncing this dict to
# `packages/engine/src/ecl/disassemble.ts` ECL_GEN1_BUCK.wordSetOverrides, which already carried
# it): Buck's own handler at file offset 0x2d5a is a literal no-op
# (`push bp;mov bp,sp;mov sp,bp;pop bp;retf`) -- no call, no memory touch at all, the strongest
# possible zero-operand signal (see `tools/map_buck_ecl_dispatch.py`'s `stop_reasons()`).
#
# `0x31` is NOW wired (2026-09-03, round 30 R4) as `GEN1_SHORT_MENU_31`'s exact frame
# (`SHORT_MENU`, wordSet 2, count_at 1), added to `PROFILE_EXTENDED_OPCODES` below alongside
# DoK/Pools. The evidence is stronger than either of those titles had: Buck's own dispatch map
# shows `0x2b` and `0x31` sharing the IDENTICAL compiled handler (file offset `0x1adf`) -- direct
# code-identity, not just a matching operand count -- plus a CFG walk across all six `ECL{1..6}.DAX`
# files finds 18 of 19 reachable sites decoding clean English menu labels (`docs/engine/research/
# buck-ecl-desyncs.md`'s dated appendix; `packages/engine/src/ecl/disassemble.ts`'s `ECL_GEN1_BUCK`
# docblock has the full list). Buck's own further extensions at `0x41..0x4C` (beyond the CoAB
# oracle's 0x00-0x40 range) have measured word sets in the generated map, `uncertain: true` in the
# engine, and still no oracle counterpart or real mnemonic (only placeholder names like
# `BUCK_EXT_41`) -- they are deliberately NOT added here either, for the same reason this module's
# own policy already states just above: adding a placeholder name would silently misroute this
# scanner's own opcode-name reporting, exactly what `POOLS_AWARD_XP`/`LOAD_AREA_PIECES` were held
# to before being listed.
# Three more of Buck's own frames, ported 2026-09-10 from `ECL_GEN1_BUCK`: `0x29` = 0 and
# `0x2C` = 0, both measured in round 32 R5 from Buck's EXEPACK-UNPACKED resident image
# (`build/exepack/buck-start.bin`) -- the packed bytes are the reason an earlier sweep of this
# family read nothing, and this repo has already shipped one "decisive" 0/140 negative that was
# measured through an un-inverted transform. `0x21` = 3 needs no Buck-specific claim at all: it is
# the base Gen1 frame, and it appears here only because THIS module's base table
# (`dqk_ca03_stream_decode.OPCODES`) is the GEN2 one, where 0x21 is 2. Spreading GEN1_WORD_SETS
# supplies it the same way it does for every other Gen1 dialect above.
GEN1_BUCK_WORD_SETS = {
    **GEN1_WORD_SETS,
    0x0C: 4, 0x1D: 2, 0x22: 3, 0x23: 3, 0x27: 2, 0x29: 0, 0x2C: 0, 0x3C: 0, 0x3F: 2, 0x40: 2,
}
PROFILE_WORD_SETS = {
    "death-knights-of-krynn": GEN1_SHORT_DOK_WORD_SETS,
    "gateway-to-the-savage-frontier": GEN1_SHORT_GATEWAY_WORD_SETS,
    "treasures-of-the-savage-frontier": GEN1_SHORT_TREASURES_WORD_SETS,
    "pools-of-darkness": GEN1_SHORT_POOLS_WORD_SETS,
    "buck-rogers-countdown-to-doomsday": GEN1_BUCK_WORD_SETS,
}
# Opcodes above the shared 0x00-0x40 table. These mirror `opcodeOverrides` in
# `packages/engine/src/ecl/disassemble.ts` exactly -- this scanner must not invent a framing the
# engine does not already stand behind. Only the two entries the engine has grounded are listed:
#
#   * Pools `0x41` (`ECL_GEN1_SHORT_POOLS`, `POOLS_AWARD_XP`) -- `wordSet: 2`, and the same frame
#     the DQK Gen2 dispatch-table Unicorn trace proved for its own `0x41`
#     (`docs/engine/research/decompile-dqk-ecl-dispatch.md`).
#   * Treasures `0x42` (`ECL_GEN1_SHORT_TREASURES`, `LOAD_AREA_PIECES`) -- `wordSet: 4`, Treasures'
#     own combined area loader, doing what CoAB splits across `0x21 LOAD_FILES` and
#     `0x37 LOAD_PIECES`. Updated 2026-08-10: this entry read `Opcode(1, "TREASURES_EXT_42",
#     trailing_bytes=1)` -- the superseded 1-operand framing -- long after the engine side was
#     corrected to the 4-operand one, which left this module's own guard test red on HEAD.
#     The old reading resynced only by accident: a 4-operand frame ends at the SAME byte, so both
#     land on the following SAVE and neither produces a bad opcode. Four things pick 4 operands
#     (see `ECL_GEN1_SHORT_TREASURES` in `disassemble.ts` for the full argument): the 0x42 site is
#     always preceded by the `SAVE #N -> [0x0016]` game_area write with operand 0 == N; those sites
#     include ECL1#16, the area the retail game opens in, which must load a GEO map; every non-0xFF
#     operand 1..3 across all 30 corpus sites is a real WALLDEF1/8X8D1 block id (12 legal values of
#     256, zero exceptions); and the 1-operand reading makes the following bytes decode as nonsense
#     the retail VM could not execute. Because the two framings end on the same byte, this changes
#     operand decoding only, never resync.
#
# `0x41` -- THE PARAGRAPH THAT STOOD HERE WAS TRUE WHEN WRITTEN (2026-08-06, `fc5c1fd`) AND IS
# NOW FALSE, so it is quoted rather than deleted: "`0x41` is ALSO reachable in Champions, Death
# Knights, Secret, Gateway and Neverwinter Nights, where neither side has a grounded frame yet.
# Those are deliberately left out so they keep surfacing as `truncated_offsets` instead of being
# decoded on an assumed framing." The premise -- *neither side has a grounded frame yet* -- was
# retired on 2026-09-04 by `ca047d4`/`6cac69b`, which put `0x41: {wordSet: 2, mnemonic:
# 'GEN1_AWARD_XP'}` into the engine's SHARED base table after reading the handlers themselves.
# This module was never revisited, so an exclusion justified by an absence of evidence outlived
# the evidence by six days and went on emitting 74 decodable sites as `truncated_offsets`.
#
# Ported 2026-09-10, with the evidence tier stated PER TITLE rather than as one figure, because
# they are not equally grounded and a single confidence would hide that:
#
#   * HANDLER-GROUNDED, that title's own `GAME.OVR`, `mov al,2` prefetch into its own operand
#     parser: Champions (file `0x4048`, `lcall 0x4e,0x2a`), Secret (`0x43ff`, `lcall 0x7d,0x2a`)
#     -- both `docs/engine/research/gen1-opcode-41.md`; Death Knights (`0x2e0e`, `mov al,2` at
#     `0x2e15`, `docs/engine/research/dok-ecl-word-sets.md`, an audit that read all 66 of DoK's
#     handlers); Gateway (`0x421f`) and Treasures (`0x2c40`, which then multiplies operand 2 by
#     100 -- the award-XP shape) from their own dispatch maps.
#   * CORPUS-ONLY, n=1: Neverwinter Nights. Its single deep-desync 0x41 site resolves under
#     wordSet 2 (`ca047d4`). One site is a weak null and is labelled as one.
#   * INERT: Curse of the Azure Bonds and Pool of Radiance reach 0x41 zero times in their own
#     corpora, so this changes nothing for either. They are included to match the engine rather
#     than on evidence of their own, and that is the whole claim being made for them.
#
# What porting COSTS, stated because the old policy's reasoning was sound even though its premise
# expired: 74 sites (33 CoK + 40 Secret + 1 NWN) stop being reported as `truncated_offsets` and
# start decoding, so a real gap-signal is traded for a real decode. `GEN1_AWARD_XP` carries
# `uncertain: true` on the engine side; that flag is about the NAME (EclDump registered no handler
# for it, so no oracle NAMES the opcode), not about the operand count, which is what a scanner
# decodes with. It is therefore NOT the placeholder case the Buck paragraph below refuses --
# `BUCK_EXT_41` names nothing at all, `GEN1_AWARD_XP` names what the handler was read doing.
GEN1_AWARD_XP_41 = {0x41: Opcode(2, "GEN1_AWARD_XP")}
#
# `0x31` is different in kind from the two above: it exists in the shared table (as the
# zero-operand `SPRITE_OFF`) but the 1991+ short dialect reuses the byte as a MENU with
# `0x2B HORIZONTAL_MENU`'s exact frame. It is listed here rather than in a word-set table because
# it also needs `count_at`, which `word_sets` cannot express. Evidence is semantic, not
# "more bytes decode" -- inline operands unpacked with the 6-bit codec give 142/142 (DoK) and
# 491/491 (Pools) real menu labels, against 100/161 and visible desync garbage for Pool of
# Radiance. Only the two titles with reachable sites are listed; Gateway and Treasures have none.
# Buck Rogers joins this list 2026-09-03 (round 30 R4) on independent evidence stronger than
# either: `0x2b`/`0x31` share one COMPILED handler in Buck's own GAME.OVR (file offset `0x1adf`),
# and 18/19 CFG-reachable sites across Buck's own ECL corpus decode clean English menu labels.
GEN1_SHORT_MENU_31 = {0x31: Opcode(2, "SHORT_MENU", count_at=1)}
# `0x27 TREASURE` is listed here rather than in a word-set table for the same reason `0x31` is: it
# carries a COUNT SLOT, and `word_sets` cannot express one. Ported 2026-09-10 for the three titles
# whose own binaries were read for it, INDEPENDENTLY of each other rather than by assuming a family:
#
#   * Death Knights -- handler file `0x2150`, `mov al,4` at `0x2156`, body then loops on `args[3]`.
#   * Pools of Darkness -- handler file `0x1626`. 8 reached sites, all immediate counts, 7 of the 8
#     with non-zero tails that a flat 4-word frame misparses as instructions.
#   * Treasures -- handler file `0x1afd`.
#
# What stood here before was the shared base table's 8-operand, no-count-slot framing: the
# un-audited GEN2 default, which all three binaries refute. Note the count slot is the half the
# corpus could NOT decide -- `docs/engine/research/dok-ecl-word-sets.md` says so plainly -- so this
# rests on the handler control flow, not on "more bytes decode".
GEN1_SHORT_TREASURE_27 = {0x27: Opcode(4, "TREASURE", count_at=3)}
PROFILE_EXTENDED_OPCODES: dict[str, dict[int, Opcode]] = {
    "death-knights-of-krynn": {
        **GEN1_SHORT_MENU_31,
        **GEN1_SHORT_TREASURE_27,
        **GEN1_AWARD_XP_41,
    },
    "pools-of-darkness": {
        **GEN1_SHORT_MENU_31,
        **GEN1_SHORT_TREASURE_27,
        0x41: Opcode(2, "POOLS_AWARD_XP"),
    },
    "treasures-of-the-savage-frontier": {
        **GEN1_SHORT_TREASURE_27,
        0x41: Opcode(2, "TREASURES_AWARD_XP"),
        0x42: Opcode(4, "LOAD_AREA_PIECES"),
    },
    "gateway-to-the-savage-frontier": {0x41: Opcode(2, "GATEWAY_EXT_41")},
    "buck-rogers-countdown-to-doomsday": {**GEN1_SHORT_MENU_31},
}
# Titles with no extensions of their own still get the shared Gen1 `0x41`, the same way the engine
# gives it to every Gen1 dialect from `KRYNN_GEN1_OPCODES`. A profile that fell through to a bare
# `OPCODES` here would be silently decoding under the pre-2026-09-04 table.
DEFAULT_EXTENDED_OPCODES: dict[int, Opcode] = {**GEN1_AWARD_XP_41}
PROFILE_DIALECT_NAMES = {
    "death-knights-of-krynn": "gen1-short-dok",
    "gateway-to-the-savage-frontier": "gen1-short-gateway",
    "treasures-of-the-savage-frontier": "gen1-short-treasures",
    "pools-of-darkness": "gen1-short-pools",
    "buck-rogers-countdown-to-doomsday": "gen1-buck",
}


def word_sets_for_profile(profile_id: str) -> dict[int, int]:
    return PROFILE_WORD_SETS.get(profile_id, GEN1_WORD_SETS)


def opcodes_for_profile(profile_id: str) -> dict[int, Opcode]:
    extended = PROFILE_EXTENDED_OPCODES.get(profile_id, DEFAULT_EXTENDED_OPCODES)
    return {**OPCODES, **extended} if extended else OPCODES


ALL_COMPARE_OUTCOMES = (-1, 0, 1)
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/gen1-ecl-encounters.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/gen1-ecl-natural-encounters.md"


@dataclass(frozen=True)
class Operand:
    code: int
    word: int

    def evidence(self) -> dict[str, Any]:
        return {
            "kind": "immediate" if self.code == 0 else "dynamic",
            "code": self.code,
            "value": self.word,
        }


@dataclass(frozen=True)
class Instruction:
    offset: int
    opcode: int
    mnemonic: str
    args: tuple[Operand, ...]
    size: int


def read_operand(raw: bytes, pos: int) -> tuple[Operand, int] | None:
    if pos + 2 > len(raw):
        return None
    code, high = raw[pos], raw[pos + 1]
    pos += 2
    if code in (1, 2, 3, 0x81):
        if pos >= len(raw):
            return None
        word = high | (raw[pos] << 8)
        pos += 1
    else:
        word = high
    if code == 0x80:
        pos += high
        if pos > len(raw):
            return None
    return Operand(code, word), pos


def decode_one(
    raw: bytes,
    offset: int,
    word_sets: dict[int, int] = GEN1_WORD_SETS,
    opcodes: dict[int, Opcode] = OPCODES,
) -> Instruction | None:
    if not ECL_HEADER_LEN <= offset < len(raw):
        return None
    opcode = raw[offset]
    spec = opcodes.get(opcode)
    if spec is None:
        return None
    count = word_sets.get(opcode, spec.word_set)
    pos = offset + 1
    args: list[Operand] = []
    for _ in range(count):
        decoded = read_operand(raw, pos)
        if decoded is None:
            return None
        operand, pos = decoded
        args.append(operand)
    if spec.count_at is not None and spec.count_at < len(args):
        for _ in range(args[spec.count_at].word):
            decoded = read_operand(raw, pos)
            if decoded is None:
                return None
            operand, pos = decoded
            args.append(operand)
    pos += spec.trailing_bytes
    if pos > len(raw):
        return None
    return Instruction(offset, opcode, spec.mnemonic, tuple(args), pos - offset)


def vaddr_to_offset(vaddr: int, address_addend: int) -> int:
    # Retail loaders strip the two-byte 0x1388 prefix, then index the ECL buffer with
    # a title-specific addend. File offset restores that stripped prefix.
    return ((vaddr + address_addend) & 0xFFFF) + 2


def offset_to_vaddr(offset: int, address_addend: int) -> int:
    return (offset - 2 - address_addend) & 0xFFFF


def target_offset(operand: Operand | None, address_addend: int) -> int | None:
    if operand is None or operand.code not in (0, 1, 2, 3):
        return None
    return vaddr_to_offset(operand.word, address_addend)


def header_entries(raw: bytes, address_addend: int = DEFAULT_ADDRESS_ADDEND) -> list[tuple[str, int]]:
    if len(raw) < ECL_HEADER_LEN or raw[:2] != b"\x88\x13":
        return []
    entries: list[tuple[str, int]] = []
    for slot, name in enumerate(ENTRY_NAMES):
        base = 2 + slot * 4
        if raw[base:base + 2] != b"\x01\x01":
            continue
        vaddr = int.from_bytes(raw[base + 2:base + 4], "little")
        offset = vaddr_to_offset(vaddr, address_addend)
        if ECL_HEADER_LEN <= offset < len(raw):
            entries.append((name, offset))
    return entries


def condition_holds(opcode: int, outcome: int) -> bool:
    return {
        0x16: outcome == 0,
        0x17: outcome != 0,
        0x18: outcome < 0,
        0x19: outcome > 0,
        0x1A: outcome <= 0,
        0x1B: outcome >= 0,
    }[opcode]


def successors(
    raw: bytes,
    ins: Instruction,
    stack: tuple[int, ...],
    address_addend: int,
    compare_outcomes: tuple[int, ...] = ALL_COMPARE_OUTCOMES,
    word_sets: dict[int, int] = GEN1_WORD_SETS,
    opcodes: dict[int, Opcode] = OPCODES,
) -> list[tuple[int, tuple[int, ...], str, tuple[int, ...]]]:
    next_offset = ins.offset + ins.size
    if ins.opcode in (0x00, 0x20):
        return []
    if ins.opcode == 0x23 and word_sets.get(0x23) == 0:
        # Short-dialect SURPRISE is script-terminal: DoK's GAME.OVR handler (file offset 0x3076)
        # tail-calls the CMD_Exit handler after its fixed-rect redraw — bytes after a short 0x23
        # are NOT a fallthrough continuation.
        return []
    if ins.opcode == 0x13:
        return [(stack[-1], stack[:-1], "return", compare_outcomes)] if stack else []
    if ins.opcode == 0x01:
        target = target_offset(ins.args[0] if ins.args else None, address_addend)
        # Older titles use mapped/dynamic GOTO operands. Their retail interpreter continues
        # at the operand end when the operand is not a local code address; stopping here would
        # erase the rest of SearchLocation from the static graph.
        return [(target, stack, "goto", compare_outcomes)] if target is not None else [(next_offset, stack, "dynamic-goto-fallthrough", compare_outcomes)]
    if ins.opcode == 0x02:
        target = target_offset(ins.args[0] if ins.args else None, address_addend)
        return [(target, stack + (next_offset,), "gosub", compare_outcomes)] if target is not None else []
    if 0x16 <= ins.opcode <= 0x1B:
        guarded = decode_one(raw, next_offset, word_sets, opcodes)
        passing = tuple(value for value in compare_outcomes if condition_holds(ins.opcode, value))
        failing = tuple(value for value in compare_outcomes if not condition_holds(ins.opcode, value))
        out = [(next_offset, stack, "condition-true", passing)] if passing else []
        if guarded is not None and failing:
            out.append((next_offset + guarded.size, stack, "condition-false", failing))
        return out
    if ins.opcode in (0x25, 0x26):
        out = [(next_offset, stack, "selector-fallthrough", compare_outcomes)]
        count = ins.args[1].word if len(ins.args) > 1 else 0
        for operand in ins.args[2:2 + count]:
            target = target_offset(operand, address_addend)
            if target is not None:
                target_stack = stack + (next_offset,) if ins.opcode == 0x26 else stack
                out.append((target, target_stack, "selector-target", compare_outcomes))
        return out
    return [(next_offset, stack, "fallthrough", compare_outcomes)]


def scan_block(
    raw: bytes,
    max_states: int = 50000,
    address_addend: int = DEFAULT_ADDRESS_ADDEND,
    word_sets: dict[int, int] = GEN1_WORD_SETS,
    opcodes: dict[int, Opcode] = OPCODES,
) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    decoded_offsets: set[int] = set()
    # A reachable byte that `decode_one` refuses is a hole in this scan's coverage, not the end
    # of the code. Count them so a truncated scan cannot be mistaken for a complete one; see
    # `docs/engine/research/gen1-ecl-extended-opcodes.md`.
    truncated_offsets: dict[int, int] = {}
    states_seen: set[tuple[str, int, tuple[tuple[Operand, ...], ...], tuple[int, ...], tuple[int, ...]]] = set()
    queue: deque[tuple[str, int, tuple[tuple[Operand, ...], ...], tuple[int, ...], tuple[int, ...], tuple[str, ...], tuple[int, ...]]] = deque()
    for entry_name, offset in header_entries(raw, address_addend):
        queue.append((entry_name, offset, (), (), (), (), ALL_COMPARE_OUTCOMES))

    states = 0
    while queue and states < max_states:
        entry_name, offset, roster, stack, path, decisions, compare_outcomes = queue.popleft()
        state_key = (entry_name, offset, roster, stack[-8:], compare_outcomes)
        if state_key in states_seen:
            continue
        states_seen.add(state_key)
        states += 1
        ins = decode_one(raw, offset, word_sets, opcodes)
        if ins is None:
            truncated_offsets[offset] = raw[offset]
            continue
        decoded_offsets.add(offset)
        next_path = (path + (offset,))[-96:]
        next_roster = roster
        if ins.opcode == 0x1C or ins.opcode == 0x24:
            if ins.opcode == 0x24:
                candidates.append({
                    "entry": entry_name,
                    "combat_offset": offset,
                    "combat_vaddr": offset_to_vaddr(offset, address_addend),
                    "roster": [[operand.evidence() for operand in group] for group in roster],
                    "path_offsets": list(next_path),
                    "path_vaddrs": [offset_to_vaddr(item, address_addend) for item in next_path],
                    "branch_decisions": list(decisions[-32:]),
                    "roster_source": "local-load-monster" if roster else "external-or-host-state-unresolved",
                    "requires_runtime_seed": not roster or bool(decisions) or any(op.code != 0 for group in roster for op in group),
                    "confidence": "decoded-static-path-with-roster" if roster else "decoded-path-only-no-roster-proof",
                })
            next_roster = ()
        elif ins.opcode == 0x0B and len(ins.args) >= 3:
            next_roster = (roster + (ins.args[:3],))[-16:]

        next_compare_outcomes = compare_outcomes
        if ins.opcode == 0x03 and len(ins.args) >= 2:
            left, right = ins.args[:2]
            if left.code == 0 and right.code == 0:
                next_compare_outcomes = ((left.word > right.word) - (left.word < right.word),)
            else:
                next_compare_outcomes = ALL_COMPARE_OUTCOMES
        elif ins.opcode in (0x14, 0x1D, 0x2F, 0x30, 0x3F):
            # These commands replace the interpreter's compare flags. Their values need runtime
            # state, so discard constraints inherited from an earlier COMPARE.
            next_compare_outcomes = ALL_COMPARE_OUTCOMES

        for target, target_stack, decision, target_outcomes in successors(raw, ins, stack, address_addend, next_compare_outcomes, word_sets, opcodes):
            if ECL_HEADER_LEN <= target < len(raw) and len(target_stack) <= 24:
                next_decisions = decisions
                if decision in ("condition-true", "condition-false", "selector-fallthrough", "selector-target"):
                    next_decisions = (decisions + (f"0x{offset_to_vaddr(offset, address_addend):04x}:{decision}",))[-32:]
                queue.append((entry_name, target, next_roster, target_stack, next_path, next_decisions, target_outcomes))

    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for candidate in candidates:
        key = (candidate["entry"], candidate["combat_offset"])
        grouped.setdefault(key, []).append(candidate)
    unique: list[dict[str, Any]] = []
    for variants in grouped.values():
        def rank(candidate: dict[str, Any]) -> tuple[int, int, int, int]:
            dynamic = sum(op["kind"] != "immediate" for group in candidate["roster"] for op in group)
            return (-int(bool(candidate["roster"])), dynamic, len(candidate["branch_decisions"]), len(candidate["path_offsets"]))

        selected = min(variants, key=rank)
        selected["alternate_path_count"] = len(variants) - 1
        selected["rostered_path_variants"] = sum(bool(item["roster"]) for item in variants)
        unique.append(selected)
    return {
        "address_addend": address_addend,
        "header_entries": [{"name": name, "offset": offset, "vaddr": offset_to_vaddr(offset, address_addend)} for name, offset in header_entries(raw, address_addend)],
        "decoded_instruction_offsets": len(decoded_offsets),
        "explored_states": states,
        "state_limit_reached": bool(queue),
        "truncated_offsets": len(truncated_offsets),
        "unknown_opcodes": {
            f"0x{opcode:02x}": sum(1 for value in truncated_offsets.values() if value == opcode)
            for opcode in sorted({value for value in truncated_offsets.values() if value not in opcodes})
        },
        "candidates": sorted(unique, key=lambda item: (item["combat_offset"], item["entry"])),
    }


def build_report(profile_ids: set[str] | None = None) -> dict[str, Any]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    games: list[dict[str, Any]] = []
    for profile in goldbox_corpus.PROFILES:
        profile_id = profile["id"]
        if profile_ids and profile_id not in profile_ids:
            continue
        if not profile["family"].startswith("gen1-"):
            continue
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        files = goldbox_corpus.file_index(install)
        ecl_files: list[dict[str, Any]] = []
        for name, path in sorted(files.items()):
            if not name.startswith("ECL") or path.suffix.upper() != ".DAX":
                continue
            blocks: list[dict[str, Any]] = []
            for block in goldbox_corpus.read_dax_blocks(path):
                scanned = scan_block(
                    block["raw"],
                    address_addend=PROFILE_ADDRESS_ADDENDS.get(profile_id, DEFAULT_ADDRESS_ADDEND),
                    word_sets=word_sets_for_profile(profile_id),
                    opcodes=opcodes_for_profile(profile_id),
                )
                if scanned["header_entries"] or scanned["candidates"]:
                    blocks.append({"block_id": block["block_id"], "raw_size": block["raw_size"], **scanned})
            ecl_files.append({"file": name, "blocks": blocks})
        candidate_count = sum(len(block["candidates"]) for item in ecl_files for block in item["blocks"])
        roster_count = sum(1 for item in ecl_files for block in item["blocks"] for candidate in block["candidates"] if candidate["roster"])
        truncated_count = sum(block["truncated_offsets"] for item in ecl_files for block in item["blocks"])
        unknown_opcodes: dict[str, int] = {}
        for item in ecl_files:
            for block in item["blocks"]:
                for opcode, count in block["unknown_opcodes"].items():
                    unknown_opcodes[opcode] = unknown_opcodes.get(opcode, 0) + count
        games.append({
            "profile_id": profile_id,
            "title": profile["title"],
            "detected": install is not None,
            "word_set_dialect": PROFILE_DIALECT_NAMES.get(profile_id, "gen1-long"),
            "candidate_count": candidate_count,
            "rostered_candidate_count": roster_count,
            "truncated_offsets": truncated_count,
            "unknown_opcodes": dict(sorted(unknown_opcodes.items(), key=lambda pair: -pair[1])),
            "ecl_files": ecl_files,
        })
    return {
        "schema_version": 1,
        "provenance": "decoded-retail-ecl-control-flow",
        "limitations": [
            "Static branch exploration does not prove comparison/input seeds.",
            "Candidates require runtime or VM replay before compatibility promotion.",
            "Cross-ECL NEWECL transitions are not followed in this pass.",
            "`decode_one` implements opcodes 0x00-0x40 only and has no per-title extension "
            "machinery, unlike the TypeScript disassembler. Reachable bytes it cannot decode are "
            "counted as `truncated_offsets`, so a non-zero count means this scan stopped early "
            "rather than ran out of code. See `docs/engine/research/gen1-ecl-extended-opcodes.md`.",
        ],
        "games": games,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Gen1 ECL Natural Encounter Candidates",
        "",
        "> Generated by `tools/gen1_ecl_encounter_scan.py`. Do not edit by hand.",
        "",
        "Only decoded paths from retail ECL header entries are included. A candidate is not a",
        "runtime proof until its branch/input seeds and post-combat resume are replayed.",
        "",
        "`Truncated` counts reachable bytes this scanner could not decode. A non-zero value means",
        "the scan stopped early inside that game's scripts, so its other numbers are lower bounds.",
        "",
        "| Game | Decoded COMBAT paths | Paths with LOAD_MONSTER roster | Truncated | Unknown opcodes |",
        "| --- | ---: | ---: | ---: | --- |",
    ]
    for game in report["games"]:
        unknown = ", ".join(f"`{opcode}` x{count}" for opcode, count in game["unknown_opcodes"].items()) or "none"
        lines.append(
            f"| {game['title']} | {game['candidate_count']} | {game['rostered_candidate_count']} "
            f"| {game['truncated_offsets']} | {unknown} |"
        )
    for game in report["games"]:
        if not game["candidate_count"]:
            continue
        lines.extend(["", f"## {game['title']}", ""])
        rows: list[tuple[tuple[int, int, int], str, dict[str, Any], dict[str, Any]]] = []
        for item in game["ecl_files"]:
            for block in item["blocks"]:
                for candidate in block["candidates"]:
                    dynamic = sum(op["kind"] != "immediate" for group in candidate["roster"] for op in group)
                    rows.append(((-int(bool(candidate["roster"])), dynamic, len(candidate["branch_decisions"])), item["file"], block, candidate))
        rows.sort(key=lambda row: (row[0], row[1], row[2]["block_id"], row[3]["combat_offset"]))
        for _, file_name, block, candidate in rows[:25]:
            roster = "; ".join(
                ",".join(str(op["value"]) if op["kind"] == "immediate" else f"dynamic(c{op['code']}:{op['value']})" for op in group)
                for group in candidate["roster"]
            ) or "empty"
            lines.append(
                f"- `{file_name}#{block['block_id']}` `{candidate['entry']}` -> "
                f"`COMBAT 0x{candidate['combat_vaddr']:04x}`; roster `{roster}`; "
                f"runtime seed required: `{str(candidate['requires_runtime_seed']).lower()}`."
            )
        if len(rows) > 25:
            lines.append(f"- `{len(rows) - 25}` additional candidates are retained in `build/gen1-ecl-encounters.json`.")
    lines.extend(["", "## Verification Boundary", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", action="append", default=[])
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite the report even if this run covers fewer titles than it currently does",
    )
    args = parser.parse_args()
    report = build_report(set(args.profile) or None)
    markdown = render_markdown(report)
    # This tool's checked-in report was destroyed once (242 lines, 11 titles) by a --profile run
    # writing to the path the repo's own recipe documents. See tools/report_guard.py.
    guard_narrowing_write(args.markdown, markdown, force=args.force, label="the encounter scan report")
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(markdown, encoding="utf-8")
    if args.strict:
        by_id = {game["profile_id"]: game for game in report["games"]}
        failures: list[str] = []
        pool = by_id.get("pool-of-radiance")
        if pool is not None and pool["detected"] and pool["candidate_count"] == 0:
            failures.append("Pool has no decoded COMBAT entry candidate")
        for profile_id in ("curse-of-the-azure-bonds", "secret-of-the-silver-blades"):
            game = by_id.get(profile_id)
            if game is not None and game["detected"] and game["rostered_candidate_count"] == 0:
                failures.append(f"{profile_id} has no decoded rostered COMBAT path")
        if failures:
            raise SystemExit("strict failure: " + "; ".join(failures))
    print(
        "gen1 encounter paths: "
        f"{sum(game['candidate_count'] for game in report['games'])}; "
        f"rostered: {sum(game['rostered_candidate_count'] for game in report['games'])}"
    )


if __name__ == "__main__":
    main()
