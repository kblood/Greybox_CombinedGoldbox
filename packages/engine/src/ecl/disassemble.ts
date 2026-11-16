/**
 * ECL disassembler — Krynn-Gen1 dialect (M2.S1).
 *
 * Walks a decompressed CoK ECL block into a list of `EclInstruction`s. The opcode
 * table is in ecl/opcodes.ts; the framing is verified against EclDump ground truth
 * (daxdump_extracted/ECL1_018.txt et al.):
 *
 *   - A block opens with a 22-byte header: a 2-byte magic word (0x1388, the VM
 *     dispatch constant) followed by FIVE 4-byte far pointers — each `{segment word
 *     0x0101, vaddr word}`. The five vaddrs are vm_run_1, SearchLocation,
 *     PreCampCheck, CampInterrupted, and `ecl_initial_entry`. Execution starts at the
 *     `ecl_initial_entry` vaddr, which is ALWAYS 0x8014 (= byte 22, immediately after
 *     the header) in every Krynn-Gen1 block. So virtual = 0x7FFE + byteIndex (byte
 *     22 → 0x8014). NOTE: a prior revision used a 20-byte/5-pointer model and started
 *     at byte 20 — it dropped the fifth pointer and mis-decoded the entry pointer's
 *     `14 80` bytes as a spurious COMPARE_AND, shifting every jump target by 2.
 *   - Each instruction is `1 opcode byte + wordSet × EclOpp argument-set`.
 *   - An EclOpp set is 2 bytes `(code, high)`, or 3 bytes `(code, high, val)` when
 *     `code ∈ {1,2,3,0x81}`. For the 3-byte form the operand is a 16-bit little-endian
 *     word `(val << 8) | high` (verified: `01 14 80` → virtual address 0x8014;
 *     `81 00 7C` → runtime memory string at 0x7C00).
 *
 * This is a forward (linear) disassembler of one subroutine: it decodes from a start
 * offset until an `EXIT` (0x00) or the end of the block. The VM that consumes these
 * (GOTO/GOSUB/IF/NEWECL semantics) is M2.S2.
 */
import { KRYNN_GEN1_OPCODES, type OpcodeDef } from './opcodes.js';

/**
 * ECL block-header dialect. The bytecode body (opcodes, operand framing, 6-bit string packing)
 * mostly matches across the Krynn generations, but Gen2 has a few proven opcode-frame deltas:
 *
 *   - **Krynn Gen1** (Champions / Death Knights of Krynn, DAX): 22-byte header = a 2-byte `0x1388`
 *     magic word + five 4-byte far pointers `{segment 0x0101, vaddr}`. Code entry is byte 22,
 *     vaddr 0x8014, so `vbase = 0x8014 − 22 = 0x7FFE`.
 *   - **Pool of Radiance** (early Gen1, DAX): the same 22-byte header and instruction framing, but
 *     the retail operand parser adds `0x6700` after the loader strips the two-byte magic prefix.
 *     Therefore `vaddr = byteOffset + 0x98FE` and the body starts at vaddr `0x9914`.
 *   - **Gen2** (The Dark Queen of Krynn, HLIB `ECL.GLB`): 20-byte header = the SAME five far
 *     pointers with **NO magic word**. Code entry is byte 20, still vaddr 0x8014, so
 *     `vbase = 0x8014 − 20 = 0x8000`.
 *
 * Verified against the real `ECL.GLB`: zero members carry the 0x1388 magic, every member's
 * far-pointer segment word is 0x0101, the `eclInitialEntry` far pointer is 0x8014, and 446
 * inline strings decode to clean English under the shared 6-bit packing. See
 * docs/engine/research/ecl-gen2-dqk.md.
 */
export interface EclDialect {
  /** Header byte length; execution entry is right after it (= byte `headerLen`). */
  headerLen: number;
  /** Virtual base: vaddr = vbase + byteOffset (so the entry at `headerLen` lands on 0x8014). */
  vbase: number;
  /** True iff the block opens with the 2-byte 0x1388 magic word before the five far pointers. */
  hasMagic: boolean;
  /**
   * Per-dialect operand-count (wordSet) overrides on top of {@link KRYNN_GEN1_OPCODES}. The
   * bytecode body is shared across generations, but a few opcodes changed their operand frame:
   * decoding with the wrong count desyncs the whole downstream stream (subsequent opcode bytes
   * get consumed as operand data). Keys are opcode bytes, values replace `OpcodeDef.wordSet`.
   */
  wordSetOverrides?: Readonly<Record<number, number>>;
  /**
   * Per-dialect brand-new opcode definitions that do not exist in the shared Gen1 table at all
   * (as opposed to {@link wordSetOverrides}, which only changes the operand count of an opcode
   * both dialects share). Keys are opcode bytes; a hit here takes priority over
   * `KRYNN_GEN1_OPCODES`. Introduced for title-specific extensions outside the shared table:
   * DQK Gen2's `0x41` and Pools of Darkness's independently retail-proven two-operand `0x41`.
   */
  opcodeOverrides?: Readonly<Record<number, OpcodeDef>>;
  /**
   * Per-dialect override for the absolute game-data address `primeSearchLocation` seeds with the
   * raw per-cell backdrop byte (`world/dungeonEvents.ts`'s `MAP_CELL_BYTE_ADDR`, 0xc04f, is the
   * CoK/DoK/Pool/CoAB/Secret default). Treasures of the Savage Frontier's own retail
   * `search_location` handler reads its cell descriptor from `[0x002d]` instead — byte-verified:
   * ECL1.DAX block 34 `AND #127, 0x002d, 0x009a` masks it directly, the same low address DQK's own
   * Gen2 `DQK_CELL_DESC_ADDR` uses (this title's "Stormfront" engine generation evidently shares
   * DQK's data-segment convention, not the older FTL-derived CoK/DoK layout — see
   * docs/engine/research/treasures-natural-route.md). Undefined ⇒ no extra write (current
   * behavior, unchanged for every other Gen1 dialect).
   */
  cellDescAddr?: number;
  /**
   * Per-dialect override for the address `primeSearchLocation` seeds with the party's facing
   * ordinal (`0=N,1=E,2=S,3=W`). `world/dungeonEvents.ts`'s `MAP_DIRECTION_ADDR` (0xc04d) is the
   * CoK/DoK/Pool/CoAB/Secret default.
   *
   * Treasures of the Savage Frontier reads facing from `[0x0011]`, the same low host window its
   * cell descriptor lives in. Byte-grounded from the title's own `GAME.OVR`: the ECL value getter's
   * special case at file `0x7F1C` matches ECL location `0x0011` and returns the raw 8-way host
   * direction when `area[0x21]==0`, else the halved 4-way ordinal
   * (`docs/engine/research/treasures-wilderness-route.md`, "MEMORY MODEL"/"inDUNGEON"). Its town
   * services are facing-gated on that word — Llorkh's training hall fires only from the west, both
   * inns only from the north — so seeding 0xc04d instead leaves every service cell silent.
   * Undefined ⇒ the 0xc04d default, unchanged for every other Gen1 dialect.
   */
  facingAddr?: number;
  /**
   * Logical game-data address where this title's NEWECL implementation records the block being
   * departed. Undefined means the chain runner must not invent a predecessor write. Pools'
   * retail `CMD_NewECL` stores `EclBlockId` at `Area+0x15`; Pools ECL itself immediately consumes
   * `[0x0016]` as the predecessor id, strongly identifying the title's one-based logical address.
   * Other dialects remain unchanged until their own executable and scripts identify an address.
   */
  lastBlockIdAddr?: number;
  /**
   * Logical ECL address the DIVIDE opcode (0x06) writes its remainder to, so a later instruction
   * can read it back (e.g. Gateway ECL5#19's temporary-facing-rotation helper). Undefined ⇒ the
   * VM's Gen1 default (`0x7f3f`).
   *
   * Gen1/CoAB proof (`coab_extracted/engine/ovr003.cs` `CMD_AddSubDivMulti`, case 6):
   * `gbl.area2_ptr.field_67E = (short)(val_a % val_b);` — a *named* decompiled struct field, not a
   * generic array cell. `Area2.cs` declares `field_67E` at struct offset `0x67e`
   * (`coab_extracted/Classes/Area2.cs:77`). ECL sees that same field through
   * `vm_GetMemoryValue`'s generic path (`ovr008.cs:839`,
   * `gbl.area2_ptr.field_800_Get((loc * 2) + 0x800)`), i.e. struct offset `(loc * 2 + 0x800) &
   * 0xFFFF`. Solving `(loc * 2 + 0x800) & 0xFFFF == 0x67e` for `loc` gives `loc == 0x7f3f` exactly
   * — the two independent decompiled sources agree without any inference.
   *
   * Gen2/DQK proof (byte-read from `The Dark Queen of Krynn/DISK3/ECL.GLB`, area 31, the generic
   * "set bit N of a bitfield" helper at vaddr `0xA43B`): `06 01 bf 00 00 08 01 bf 00` is
   * `DIV [0x00BF], #8 -> [0x00BF]`, immediately followed at `0xA444` by `09 03 29 00 01 c2 00`, a
   * SAVE whose source operand is `(code 3, addr 0x0029)` — i.e. the very next instruction reads the
   * DIVIDE remainder through operand code 3 naming address `0x0029`. Independently corroborated by
   * static disassembly of `GAME.OVR`'s own shared arithmetic handler (see
   * docs/engine/research/dqk-campaign-legs.md, "DIVIDE remainder address"): the DIV arm at file
   * offset `0x03204E` is `les bx,[0xb20f]; mov byte ptr es:[bx+0x29],dl` — remainder lands at ECL
   * data offset `0x29`.
   */
  divRemainderAddr?: number;
}

/** Krynn-Gen1 (CoK, DAX) ECL header: magic word + five far pointers (22 bytes). The base opcode
 * table IS this dialect's frame (0x1D=1 operand, 0x2C=6 — EclDump ground truth). */
export const ECL_GEN1: EclDialect = { headerLen: 22, vbase: 0x7ffe, hasMagic: true };
/** Pool of Radiance early-Gen1 ECL: Gen1 framing with its executable's `0x6700` address addend. */
export const ECL_POOL: EclDialect = { headerLen: 22, vbase: 0x98fe, hasMagic: true };
/**
 * 1991+ Gen1 "short form" dialect (Death Knights of Krynn, Gateway/Treasures of the Savage
 * Frontier, Pools of Darkness): identical Gen1 header/vbase, but opcode 0x1D PARTYSTRENGTH takes
 * ZERO operands, 0x22 PARTY_SURPRISE takes ZERO operands, and 0x2C PARLAY takes ONE — the
 * mid-point toward the Gen2 frame. 0x1D/0x2C proven by instruction-boundary-exact parses of DoK
 * ECL1 blocks 2/16 (whole block ends exactly at block length only under 0/1) and unanimous anchor
 * re-landing across DoK/Treasures/PoD (see docs/engine/research/dok-natural-route.md, 2026-07-18
 * operand-table audit). 0x22 proven the same evidentiary way (2026-07-18, "opcode-0x22
 * short-dialect finding"): a corpus-wide reachable-instruction walk finds the long-dialect
 * 2-operand reading decodes cleanly at every reachable site under Pool of Radiance (14/14) but
 * desyncs at nearly every reachable site under DoK/Treasures/PoD (119/120, 115/115, 254/254),
 * while the 0-operand reading runs 60+ clean instructions past DoK ECL3#98's own previously-stuck
 * site, landing on coherent retail content (see vm.ts's case 0x22 comment for the runtime side).
 * Decoding DoK with plain ECL_GEN1 desyncs every stream that crosses a 0x1D/0x22/0x2C instruction.
 *
 * 2026-07-23 (DoK ending-leg round, docs/engine/research/dok-natural-route.md Update 15): two more
 * deltas, this time proven from DoK's OWN retail binary, not just corpus statistics — DoK's
 * `GAME.OVR` command dispatch table (build/dok-ecl-dispatch-map.json, the same table that located
 * `CMD_Goto`) gives each opcode's handler, and each handler's `vm_LoadCmdSets(N)` call (the
 * `mov al,N; push ax; lcall vm_LoadCmdSets` prologue, verified against five known-count controls:
 * 0x03=2, 0x09=2, 0x2C=1, and the no-call 0x1D/0x22) states its operand frame directly:
 * - **0x23 SURPRISE takes ZERO operands** (handler at file offset 0x3076 fetches no ECL operands
 *   at all — it pushes four compiled-in constants (0x16,0x26,0x11,1) to a helper, calls the
 *   RedrawView-analog engine export (the same `0x41:0x8e` far stub `CALL [0x2DCB]` dispatches to),
 *   then TAIL-CALLS the opcode-0x00 CMD_Exit handler at 0x81d — i.e. short-dialect SURPRISE is
 *   script-TERMINAL). Corpus corroboration matches 0x22's own audit shape exactly: Pool of
 *   Radiance (long control) 22/22 reachable sites decode cleanly under the 4-operand frame;
 *   DoK 0/205, Treasures 6/209, PoD 9/369.
 * - **0x0C SETUP_MONSTER takes FOUR operands** (handler at 0xBAC: `vm_LoadCmdSets(4)` + four
 *   `vm_GetCmdSet` fetches; params 1-3 land in the same sprite/area/pic globals as CoAB's
 *   3-operand `CMD_SetupMonster`, param 4 in an extra DoK global `[0xc4cc]`, semantics unlocated).
 *   Corpus: every long title is unanimous 3-op (4th slot decodes as a valid operand at only
 *   18/187 Pool, 18/197 CoAB, 37/235 Secret, 16/205 CoK sites) while DoK 157/157, Treasures
 *   229/230, PoD 390/400 have a valid 4th operand slot. **Gateway is the exception**: 1/238 —
 *   affirmatively 3-operand, hence {@link ECL_GEN1_SHORT_GATEWAY} below.
 */
/**
 * `opcodeOverrides[0x31]` (2026-08-06): in the short dialect `0x31` is a **menu**, not the shared
 * table's zero-operand `SPRITE_OFF`. Its frame is byte-identical to `0x2b HORIZONTAL_MENU`
 * (`wordSet: 2, countAt: 1` — dest, count, then `count` inline items), and the VM routes it to the
 * same handler.
 *
 * Proven semantically, not by "more bytes decode" — that criterion is worthless here, since a
 * wider frame consumes more bytes and can look better while being wrong (see
 * `docs/engine/research/gen1-ecl-extended-opcodes.md` §3). The decisive test is whether the inline
 * operands unpack to real menu labels under {@link decodeEclString}'s 6-bit codec:
 *
 * - Death Knights **142/142** and Pools of Darkness **491/491** inline items are legal English, and
 *   they read unmistakably as menu labels — `ATTACK`, `FLEE`, `TALK`, `WAIT`, `PAY`, `BLUFF`,
 *   `GROVEL`, `LEAVE`, `SAVE THEM`, `LISTEN`, `DRINK`. Control: the PRINT family on the same
 *   corpora is 2102/2118 and 4387/4488, so the extractor is sound.
 * - Pool of Radiance (long dialect, the only long title with a meaningful number of reachable
 *   `0x31` sites) is **100/161** under the same frame, and its legal fragments are *narration*
 *   (`DO YOU WANT TO GO DOWN`, `FROM THE TOP OF THE GA`) interleaved with desync garbage
 *   (`Q2EAT(EASCHEBAXCPQ1[HI`) — the signature of a frame that is picking up neighbouring
 *   instructions' text. It also loses 603 reachable instructions and goes from 1 to 20
 *   truncations. So this override is deliberately NOT applied to the long dialect.
 *
 * Champions, Secret, Neverwinter Nights and Curse of the Azure Bonds have no or negligible
 * reachable `0x31` sites, so they carry no evidence either way and keep the base table.
 */
export const ECL_GEN1_SHORT: EclDialect = {
  headerLen: 22,
  vbase: 0x7ffe,
  hasMagic: true,
  wordSetOverrides: { 0x0c: 4, 0x1d: 0, 0x22: 0, 0x23: 0, 0x2c: 1 },
  opcodeOverrides: { 0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' } },
};
/**
 * Death Knights of Krynn's own split off {@link ECL_GEN1_SHORT} (2026-09-05, round 35 R1,
 * `tools/map_gen1_ecl_dispatch.py --game dok`, `docs/engine/research/dok-ecl-word-sets.md`).
 *
 * A SPLIT, not an edit, for the round-32 Gateway/Treasures reason: three other titles inherit the
 * shared `ECL_GEN1_SHORT` literal, and nothing here was measured on their binaries.
 *
 * WHAT WAS ACTUALLY READ. DoK had a dispatch map since 2026-07-17 (`build/dok-ecl-dispatch-map.json`)
 * that stopped at "opcode -> handler file offset" and never derived an operand-parser target or
 * read one handler prologue, so DoK's word sets were the only Gen1 title's taken purely from
 * inheritance. This round ran DoK's own `GAME.OVR` (`FBOV`, 252,469 bytes) through the same
 * structural pipeline Pools/Gateway/Treasures use. Dispatcher at file `0x3271`, sequence
 * similarity **0.9757** against the CoAB oracle's `commandTable`; operand parser at `0x6ba8`,
 * similarity **1.0000**. Its own handlers name their operand-parser call target: `lcall 0x41,0x2a`,
 * the first far call in 45 of 66 dispatched handlers. TOOLING CONTROL: this pipeline reproduces
 * **all 54** of the v1 map's `handler_file_offset` values byte-for-byte, 0 disagreements — and
 * finds 12 MORE opcodes v1's linear-only reader missed (`0x04`-`0x06`, `0x11`, `0x16`-`0x1a`,
 * `0x21`, `0x25`, `0x2f`, all recovered by the fallthrough-merge resolver), so DoK dispatches
 * `0x00..0x41` with NO gap, not 54 with 12 holes.
 *
 * COVERAGE: 65 of 66 handlers measured. 47 by the `mov al,N; push ax; lcall 0x41,0x2a` prefetch;
 * 18 more by a second idiom this round derived and validated — a handler that makes NO prefetch
 * call but opens `inc word ptr [0x8c48]` consumes zero operands, because `[0x8c48]` is DoK's ECL
 * program counter and that `inc` is how a zero-operand handler steps past its own opcode byte.
 * `[0x8c48]` is DERIVED, not assumed: it is the plurality (18 of 18, unanimous — no competing
 * address at all) `inc word ptr` target among no-prefetch handlers, and it is independently
 * `dec`'d by exactly the six count-driven opcodes `0x15`, `0x25`, `0x26`, `0x27`, `0x2b`, `0x31`
 * immediately before their SECOND, register-argument prefetch — the same `dec [PC]` idiom
 * {@link ECL_GEN2}'s docblock records at DQK's own `[0xb7f9]`. THE NULL FOR THAT IDIOM: 0 of the
 * 47 prefetch-measured handlers with N >= 1 also carries `inc [0x8c48]`. Zero false positives out
 * of 47 possible ones, so the two methods never contradict each other on this binary.
 *
 * THREE DISAGREEMENTS with the shared `ECL_GEN1_SHORT`, all read from a handler byte:
 *
 *   - **`0x1f`: 2 -> 1.** Handler `0x2fbc` opens `mov al,1; push ax; lcall 0x41,0x2a` and then
 *     reads exactly operand 1. (Pools' own dialect independently reads `0x1f` as 1; DoK's value is
 *     read from DoK's binary, not taken from Pools.)
 *   - **`0x27` TREASURE: 8 -> 4, with `countAt: 3`.** Handler `0x2150` prefetches 4
 *     (`mov al,4`), reads operands 1/2/3 into three 32-bit accumulators at `[0xbe58]`/`[0xbe5c]`/
 *     `[0xbe60]` (the coin piles), reads operand **4** into `[bp-1]`, then does
 *     `dec word ptr [0x8c48]` followed by `mov al,[bp-1]; push ax; lcall 0x41,0x2a` — a second
 *     prefetch whose count IS operand 4's value — and loops `1..[bp-0x47]` reading one more
 *     operand per iteration into a 0x11-stride item table at `ds:0xa2b9`. The `countAt: 3` is that
 *     fourth operand (0-based index 3), read from the handler's own control flow, NOT chosen
 *     because the census liked it.
 *   - **`0x29`: 14 -> 0.** Handler `0x30e6` is five instructions —
 *     `push bp; mov bp,sp; inc word ptr [0x8c48]; pop bp; retf` — with no call of ANY kind, so
 *     nothing in it can consume a script byte. Calibrated, not asserted: that body is the same
 *     shape as `0x24 COMBAT` (`0x1f09`), `0x33` (`0x284a`), `0x3d CLEAR_BOX` (`0x2873`) and
 *     `0x3e` (`0x2ca4`) — four opcodes the shared base table ALREADY reads as zero-operand.
 *
 * AND THREE CONFIRMATIONS the shared literal had never actually verified on DoK's bytes:
 * `0x0c` = 4 (handler `0xbac`, `mov al,4`), `0x2c` = 1 (`0x3095`, `mov al,1`), and the
 * zero-operand trio `0x1d` (`0x237c`) / `0x22` (`0x23bb`) / `0x23` (`0x3076`). The first two of
 * that trio open `inc [0x8c48]` with no prefetch; `0x23` is the one handler neither method covers
 * and was read by hand: it pushes four compiled-in message-window constants (1, 0x11, 0x26, 0x16),
 * calls `0x4e4:0xb6b`, then TAIL-CALLS opcode `0x00`'s own handler at `0x81d` (which does the
 * `inc [PC]`) — the identical shape {@link ECL_GEN2}'s docblock records for DQK's `0x23`, fetching
 * no operands. All three land on the value the shared literal already had; they are corroboration,
 * and they are worth nothing to the alternative, which is the point of listing them separately
 * from the three that moved.
 *
 * `0x41` = 2 (handler `0x2e0e`, `mov al,2`) is deliberately NOT overridden here: round 34 put
 * `0x41: {wordSet: 2}` into the shared base table, so DoK inherits the right value for free and an
 * override would be a free-agreement claim. DoK is nevertheless an eighth independent binary
 * agreeing with that base-table addition.
 *
 * WHAT IS STILL UNMEASURED, and it is not nothing: 0x23 aside, one handler of 66 reaches neither
 * idiom; and this method measures the operand COUNT a handler declares, never its semantics.
 */
export const ECL_GEN1_SHORT_DOK: EclDialect = {
  ...ECL_GEN1_SHORT,
  wordSetOverrides: { ...ECL_GEN1_SHORT.wordSetOverrides, 0x1f: 1, 0x29: 0 },
  opcodeOverrides: {
    ...ECL_GEN1_SHORT.opcodeOverrides,
    0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' },
  },
};
/**
 * Gateway to the Savage Frontier's own split off `ECL_GEN1_SHORT` (2026-07-23, same audit as the
 * 0x0C/0x23 deltas above): Gateway's corpus is affirmatively **3-operand for 0x0C SETUP_MONSTER**
 * (only 1 of 238 reachable sites has a valid 4th operand slot — the long-dialect shape, against
 * its short-camp siblings' unanimous 4-op), and has **zero reachable 0x23 SURPRISE sites** (same
 * "no evidence either way" position it already held for 0x1D/0x2C in the original operand-table
 * audit). So Gateway keeps the pre-2026-07-23 short table: no 0x0C override (base 3-op frame) and
 * no 0x23 override (base 4-op frame — unreachable, so the choice cannot affect output, and the
 * un-overridden base is the claim-free default).
 *
 * CORRECTED 2026-09-03 (round 32 R4, `tools/map_gen1_ecl_dispatch.py --game gateway`,
 * `docs/engine/research/gateway-ecl-dispatch-map.md`): the `0x1D:0, 0x22:0, 0x2C:1` "1991+
 * short-form" overrides above were never actually read off Gateway's OWN `GAME.OVR` — the
 * "no evidence either way" framing already admitted zero reachable sites for two of the three.
 * Now measured directly (structural dispatcher match, similarity 0.988; each handler's own
 * `mov al,N; push ax; lcall 0x53,0x2a` prefetch, cross-checked against its own subsequent
 * `lcall 0x53,0x25` operand-set reads): `0x1D` (file `0x1ecc`) reads **1** operand, `0x22` (file
 * `0x22b8`) reads **2**, `0x2C` (file `0x3360`) reads **6** — i.e. Gateway's binary carries the
 * LONG/base frame for all three, not the short-family override this literal assumed by grouping
 * Gateway with DoK/Treasures/PoD. Zero corpus impact either way (both `0x1D` and `0x2C` remain
 * genuinely unreached across all 26 real Gateway ECL2-6.DAX blocks under either reading, matching
 * the pre-existing "not behavior-changing on current data" note), so the binary decides with
 * nothing at stake for the corpus census: the overrides are REMOVED (falling through to the base
 * table's own 1/2/6).
 *
 * Two further corrections from the SAME binary pass, previously unclaimed by any dialect: `0x32`
 * (file `0x3475`) and `0x40` (file `0x40d7`) both measure **4** operand sets, not the shared base
 * table's `1` — confirmed by each handler's own four sequential `lcall 0x53,0x25` reads
 * immediately following the prefetch call. Also unreached in this corpus (0/26 either way).
 *
 * `0x41` (file `0x421f`) is a genuine extension beyond the CoAB oracle's own `0x00-0x40` range,
 * previously unclaimed by this dialect: its own prefetch reads **2** operands, matching
 * `ECL_GEN1_BUCK`'s/`ECL_GEN1_MATRIX`'s own `BUCK_EXT_41` (also wordSet 2) — read here from
 * Gateway's OWN bytes, not inherited from Buck. Adding it is a measured corpus WIN, not merely
 * neutral: `ECL5.DAX#99` decodes a bad opcode at file `0x428` under the old table (an unclaimed
 * `0x41` byte) and decodes clean to `EXIT` once `0x41` is modelled — Gateway's full 26-block
 * retail census goes from `{desync:1, cleanExit:25}` to `{desync:0, cleanExit:26}`, against the
 * alternative (leave `0x41` unclaimed) which stays at 1 desync. See
 * `packages/engine/test/eclGen1DispatchRound32.test.ts` for the census.
 */
export const ECL_GEN1_SHORT_GATEWAY: EclDialect = {
  headerLen: 22,
  vbase: 0x7ffe,
  hasMagic: true,
  wordSetOverrides: { 0x32: 4, 0x40: 4 },
  opcodeOverrides: { 0x41: { wordSet: 2, mnemonic: 'GATEWAY_EXT_41', uncertain: true } },
};
/**
 * Treasures of the Savage Frontier's own further split off `ECL_GEN1_SHORT` (2026-07-19, "walk any
 * area" picker default-boot investigation): its `ECL1.DAX` corpus (the game's only disk) desyncs
 * every single reachable LOAD_FILES (0x21) site under the plain 3-operand Gen1 frame — every area
 * script halts on a bad opcode a fixed few bytes after LOAD_FILES's own operands. Re-decoding
 * LOAD_FILES as Gen2's own 2-operand short form (`wordSet: 2`, matching {@link ECL_GEN2}'s own
 * `0x21` override) resolves every one of them: all 30 of `ECL1.DAX`'s blocks decode cleanly (zero
 * bad-opcode halts on the LOAD_FILES-bearing ones) and several (areas 20/22/24/25/34/40) run to a
 * clean `EXIT` emitting a real `loadFiles` + `encounterSurprise` pair. NOT folded into the shared
 * `ECL_GEN1_SHORT` — DoK/Gateway retain independently proven 3-operand frames, while Pools now
 * has a separately handler-proven 2-operand split of its own below. This is a title-specific
 * micro-dialect point within the "1991+ short form" family, not a universal correction. NB: even
 * under this fix, no block in `ECL1.DAX` ever emits a `loadPieces`
 * effect — the wilderness-encounter scripts on this disk apparently reuse a wall/tile set the host
 * loads once outside the ECL VM (consistent with `WILDCOM.DAX`'s presence), not per-encounter. The
 * web host's `loadDungeon` call for this profile supplies an explicit `fallbackPieces` default
 * (WALLDEF1 block 1) for exactly this reason — see `apps/web/src/ui/gameData.ts`'s `treasures`
 * entry and `world/dungeon.ts`'s `fallbackPieces` option.
 *
 * CORRECTED 2026-08-08 — the paragraph above is only true of the 0x21 half of this corpus.
 * `0x42` is not an opaque extension: it is this title's OWN combined area loader, and 19 of
 * ECL1.DAX's 30 blocks (including ECL1#16, the game's opening area) use it INSTEAD of 0x21, which
 * is why they emitted no `loadFiles` at all and could not be mounted. See the `0x42` entry in
 * `opcodeOverrides` below for the evidence.
 */
export const ECL_GEN1_SHORT_TREASURES: EclDialect = {
  ...ECL_GEN1_SHORT,
  wordSetOverrides: { ...ECL_GEN1_SHORT.wordSetOverrides, 0x21: 2 },
  /**
   * `0x42 LOAD_AREA_PIECES area, set1, set2, set3` — Treasures' own combined area loader: one
   * instruction doing what CoAB splits across `0x21 LOAD_FILES` and `0x37 LOAD_PIECES`.
   *
   * It was previously decoded as a 1-operand extension with one trailing byte and left
   * deliberately unhandled ("re-lands exactly on SAVE"). That reading is wrong, and it re-landed
   * on a SAVE only by accident: a 4-operand frame ends at the SAME byte, so both readings resync
   * and neither produces a bad opcode. Four independent things pick the 4-operand frame:
   *
   *  1. POSITION. In all 19 blocks that carry it, the 0x42 site is immediately preceded by
   *     `SAVE #N -> [0x0016]` (the game_area write) and its operand 0 IS that same N — exactly
   *     the invariant the 0x21 sites satisfy in the other 11 blocks. No block has both.
   *  2. NECESSITY. Those 19 include ECL1#16, the area the retail game OPENS in. A block that
   *     never loads a GEO map cannot be the opening area, so the load must be this instruction.
   *  3. OPERAND DOMAIN. Across all 30 `0x42` sites in the corpus, every non-0xFF operand 1..3 is
   *     a real block id of this title's own WALLDEF1.DAX/8X8D1.DAX ({1,2,7..16}) — 12 legal values
   *     out of 256, zero exceptions — and 0xFF appears exactly where the older LOAD_PIECES uses it
   *     for "no set". Operand 0 is likewise always a real GEO1.DAX block id.
   *  4. WHAT THE OLD READING IMPLIED. Under the 1-operand frame the following bytes decode as
   *     nonsense the retail VM could not execute: ECL1#16/#4 yield `SAVE #10, #11` — a SAVE whose
   *     DESTINATION is an immediate, not a memory location — and ECL1#17 yields a SETUP_MONSTER
   *     in an area-init prologue.
   *
   * UPDATED 2026-09-03 (round 32 R4, `tools/map_gen1_ecl_dispatch.py --game treasures`,
   * `docs/engine/research/treasures-ecl-dispatch-map.md`): the paragraph above is RETRACTED where
   * it says the dispatch was never located. Treasures' own dispatcher and operand parser now
   * structurally match the CoAB oracle directly on Treasures' own `GAME.OVR` bytes (dispatcher
   * similarity 0.9412 at file `0x319e`; operand parser 0.9924 at `0x7354`; runner-up nulls 0.29/0.48
   * — decisively below), and `0x42`'s own handler is now READ, at file `0x12a6`:
   * `mov al,4; push ax; lcall 0x58,0x2a` (`b0 04 50 9a 2a 00 58 00`) — confirming `wordSet: 4`
   * from the binary, not merely corpus agreement.
   *
   * The SET ORDER is now DECIDED, not assumed — and not by analogy to any other opcode. The
   * handler's own loop (file `0x1316`-`0x134a`) walks the three wall-set operands
   * (stored at `[bp-0xa]`/`[bp-9]`/`[bp-8]`, i.e. operands 1/2/3 in that order) with an ascending
   * loop counter `[bp-1]` = 0,1,2, skips `0xFF` ("no set") and 0-valued slots, and otherwise computes
   * the destination as `[bp-1]*4 + 0x93c2` before calling the resource loader
   * (`lcall 0x229,0x1d96`) — i.e. operand 1 -> slot 0, operand 2 -> slot 1, operand 3 -> slot 2,
   * confirmed ascending directly from the handler, independent of `0x37`.
   */
  opcodeOverrides: {
    ...ECL_GEN1_SHORT.opcodeOverrides,
    0x42: { wordSet: 4, mnemonic: 'LOAD_AREA_PIECES' },
    // `0x27` (2026-09-04, round 33 Phase B): transcribed from Treasures' own `GAME.OVR` handler
    // at file `0x1afd` -- see the shipped-frame docblock above this dialect for the full
    // instruction quote and for why the four route goldens were regenerated rather than obeyed.
    0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' },
    /**
     * `0x37` (2026-09-03, round 32 R4): a `wordSet: 2` `TREASURES_FIND_CHARACTER` override was
     * PROPOSED this round from a handler read (file `0x2577`: `mov al,2; push ax; lcall
     * 0x58,0x2a`) structurally resembling `ECL_GEN1_SHORT_POOLS`'s own `POOLS_FIND_CHARACTER`, on
     * the strength of a corpus census claiming `0x37` unreached in all 30 `ECL1.DAX` blocks (so
     * "NULL corpus effect" either way). That census was WRONG, and the override was FALSIFIED
     * and RETRACTED before shipping: `disassembleEclBlock`'s linear scan stops at each block's
     * FIRST `EXIT` and so never walks the combat/event subroutines placed later in a block's own
     * bytes — the actual real-VM combat/quest run in `test/treasuresQuestFlag.test.ts` and
     * `test/treasuresEndingRoute.test.ts` (ECL1.DAX blocks 19/33/38/40/51, none of them the
     * `initial_entry` preamble the shallow census sees) DOES reach `0x37` under the proposed
     * 2-operand reading and crashes (`EclVm.rvalue`: "Cannot read properties of undefined (reading
     * 'code')" — an operand-count desync). Bisected by toggling this single override with the
     * other four `0x1f`/`0x41`/`0x43`/`0x44` additions and `0x42` both held constant: removing
     * `0x37` alone restores all 28 tests across those two files to green; every other addition
     * this round is innocent. `0x37` is therefore LEFT AT THE INHERITED BASE VALUE (`3`, the
     * shared `LOAD_PIECES` reading), unresolved — the binary handler read above may be the wrong
     * handler (a fallthrough-merge misattribution) or the structural analogy to Pools may not
     * hold; either way, shipping a plausible-looking but real-execution-breaking frame is worse
     * than an honest inherited default. See
     * `packages/engine/test/eclGen1DispatchRound32.test.ts`'s Treasures block for the retracted
     * finding and `docs/engine/research/treasures-ecl-dispatch-map.md` for the raw measurement.
     *
     * RE-READ 2026-09-03 (round 33 R2): the "fallthrough-merge misattribution" alternative above
     * is FALSIFIED, directly from the dispatcher bytes. Treasures' `GAME.OVR` at file `0x33c1`
     * reads `cmp al,0x37` (`3c 37`) immediately followed at `0x33c6` by `call 0x2577` (`e8 ae f1`,
     * a near CALL, target = `0x33c6 + 5 + 0xf1ae` = `0x2577`) — a straight-line `cmp`/`call` pair
     * with NO shared target with either neighbour (`0x36` dispatches to `0x2506`, `0x38` to
     * `0x2837`). `map_gen1_ecl_dispatch.py`'s own JSON confirms this structurally: opcode `55`
     * (`0x37`)'s dispatch-table row is `{handler_file_offset: 9591 (=0x2577), source: 'linear'}` —
     * not `'fallthrough-merge'` (compare opcode `37`/`0x25`'s row, genuinely a merge, which DOES
     * carry that tag). `0x2577` is therefore `0x37`'s own, distinct dispatch entry, full stop —
     * the round-32 doubt about it being a merge was never true. The handler at `0x2577` itself
     * re-confirms `wordSet: 2` (`mov al,2; push ax; lcall 0x58,0x2a` at its very top, before
     * reading a 28-byte inline name at `[0xa862]` and walking the party list — exactly the
     * `POOLS_FIND_CHARACTER` shape).
     *
     * The round-32 crash is real but was diagnosed on an incomplete bisection: it toggled `0x37`
     * alone while holding `0x27` at its (also wrong) base `wordSet: 8`. `treasuresEndingRoute.test.ts`
     * already carries (since before this round) a `ENDING_DIALECT` fixture that applies BOTH the
     * `0x27` `{wordSet: 4, countAt: 3}` fix AND this `0x37` `{wordSet: 2}` fix together, and proves
     * the combination plays Treasures' real campaign-ending script (block 38) end to end — full
     * retail narration through "IT HAS, INDEED, BEEN GLORIOUS!", the terminal memory writes, and
     * the `NEWECL #51` chain — none of which the base dialect reaches. That test file's own doc
     * comment states plainly: "closing this chain needs two Treasures-only operand-frame
     * corrections beyond the shipped `ECL_GEN1_SHORT_TREASURES` dialect: `0x27` is `wordSet 4 /
     * countAt 3` (not 8) and `0x37` is the two-operand party-name lookup (not three-operand
     * LOAD_PIECES)". So the VERDICT is: `0x2577` is `0x37`'s real, non-merged dispatch target,
     * `wordSet: 2` is correct, and it is required TOGETHER WITH the `0x27` fix.
     *
     * SHIPPED 2026-09-04 (round 33 Phase B) — see the override below this comment. R2 stopped one
     * step short of shipping either fix because both turn pinned assertions red in
     * `treasuresEndingRoute.test.ts` (tests D and F pin the pre-fix divergence between the shipped
     * dialect and `ENDING_DIALECT` as a negative control) and in `treasuresQuestFlag.test.ts`
     * (which pins a `'halted'` status whose own comment names it as the `0x27`/`0x37` gap). Those
     * pins were not an oracle: `'halted'` carries `haltReason: 'bad opcode at <pc>'`, i.e. the
     * assertion was pinning the defect by name, and the route goldens were generated by the very
     * VM the frames belong to. They were regenerated rather than obeyed, and the ending route now
     * plays under the SHIPPED dialect rather than only under a test-local fixture.
     *
     * One trap on the way in, recorded because it reproduces round 32's crash exactly and would
     * read as a second falsification: `vm.ts`'s `case 0x37` selects the two-operand lookup by
     * MNEMONIC. Shipping `{ wordSet: 2, mnemonic: 'TREASURES_FIND_CHARACTER' }` without teaching
     * `vm.ts` that name sends the instruction down the inherited three-operand `loadPieces` path,
     * which reads an operand the frame never decoded and throws "Cannot read properties of
     * undefined (reading 'code')" — round 32's signature, from a plumbing bug rather than a wrong
     * frame. `vm.ts` now matches a set (`FIND_CHARACTER_MNEMONICS`) so each title keeps its own
     * label; `eclGen1DispatchRound32.test.ts` pins that.
     */
    /**
     * `0x1F` (2026-09-03, round 32 R4): previously un-overridden (falling through to base `2`).
     * Handler (file `0x2e86`): `mov al,1; push ax; lcall 0x58,0x2a` (`b0 01 50 9a 2a 00 58 00`) —
     * ONE operand. Corpus effect: NULL (unreached in all 30 `ECL1.DAX` blocks either way).
     */
    0x37: { wordSet: 2, mnemonic: 'TREASURES_FIND_CHARACTER' },
    0x1f: { wordSet: 1, mnemonic: 'TREASURES_UNKNOWN_1F', uncertain: true },
    /**
     * `0x41`/`0x43`/`0x44` (2026-09-03, round 32 R4): three beyond-`0x40` extensions this dialect
     * never claimed, all read from Treasures' own handlers the same way `0x42` was:
     * `0x41` (file `0x2c40`) reads 2 operands then multiplies operand 2 by `100` (`mov cx, 0x64`) —
     * the SAME shape as `ECL_GEN1_SHORT_POOLS`'s own `POOLS_AWARD_XP`, hence the mnemonic below.
     * `0x43` (file `0x1f55`) and `0x44` (file `0x2add`) both read 4 sequential operand sets with no
     * further identified semantics. All three are unreached in Treasures' 30-block real corpus
     * under either reading (NULL corpus effect), so, as with `0x1F` above, they carry `uncertain`
     * mnemonics rather than claimed ones.
     */
    0x41: { wordSet: 2, mnemonic: 'TREASURES_AWARD_XP' },
    0x43: { wordSet: 4, mnemonic: 'TREASURES_EXT_43', uncertain: true },
    0x44: { wordSet: 4, mnemonic: 'TREASURES_EXT_44', uncertain: true },
  },
  // See EclDialect.cellDescAddr's own doc comment — Treasures' search_location handler reads its
  // cell descriptor from [0x002d], not the CoK/DoK-family [0xc04f].
  cellDescAddr: 0x002d,
  // ...and its facing from [0x0011] in the same low host window — see EclDialect.facingAddr.
  facingAddr: 0x0011,
};
/**
 * SHIPPED 2026-09-04 (round 33 Phase B) to both `ECL_GEN1_SHORT_POOLS` and
 * `ECL_GEN1_SHORT_TREASURES` below: opcode `0x27 TREASURE`'s `countAt`-shaped tail, withheld by
 * round 32 R4 as "a flat `wordSet` cannot represent this". The dialect mechanism
 * `opcodeOverrides[op].countAt` already existed — Gen2's own `0x27` has shipped
 * `{wordSet: 4, countAt: 3}` since before this round — so this is a frame correction, not an
 * engine change.
 *
 * **Why this shipped over four route goldens that went red, and why that is not the usual
 * answer.** Round 33's R2 was instructed that the 19 Pools/Treasures route tests are the oracle
 * and "if one goes red the edit is wrong, not the test". It correctly declined to ship on its own
 * authority and reported the conflict instead. That rule is right for behavioural regressions and
 * exactly backwards here, because these goldens are **produced by running this repo's own
 * `EclVm`** — `poolsMiddleRoute.test.ts` says so in its own "WHAT THIS DOES NOT ESTABLISH"
 * section: *"if that VM mis-models an opcode the walk inherits the error."* A golden generated by
 * the code under test cannot adjudicate that code's opcode framing; it is downstream of it.
 *
 * Three independent lines of evidence agree, which is what made this decidable:
 *
 *  1. **The retail bytes.** Both handlers were transcribed instruction-quoted from their own
 *     `GAME.OVR` (Pools file `0x1626`, Treasures file `0x1afd`) and are structurally identical
 *     past their differing constant addresses — operand #4's VALUE is the tail count (quote
 *     below). Across the 8 reached Pools sites the count is an immediate in 8/8 (0/8 memory), and
 *     7/8 carry a non-zero tail that a flat 4-word frame necessarily misparses as instructions.
 *  2. **A golden that pins the bug by name.** `treasuresQuestFlag.test.ts` pinned
 *     `win.r3.status === 'halted'`, and its own comment attributes that halt to "the disclosed
 *     Sec.8.4.2 TREASURE/bad-opcode gap at 0xA1B6". In this VM `halted` carries
 *     `haltReason: 'bad opcode at <pc>'`. The test was pinning a decode desync as expected
 *     behaviour, and this frame is what closes it.
 *  3. **An execution-coverage oracle, measured independently.** Round 33's R1 built
 *     {@link walkEclReachable} and found 12 executed-but-unreached offsets on the Pools route
 *     (against a predicted 0) — root-caused not to a walker bug but to Pools lacking exactly this
 *     override, and dropping to **0** under a test-local clone of it. R1 also found 2 desyncs in
 *     Treasures block #40 in the shipped dialect, immediately after a `0x27` fallthrough.
 *
 * The four goldens (`poolsMiddleRoute`, `poolsWildernessRoute`, `treasuresEndingRoute`,
 * `treasuresQuestFlag`) were regenerated against the corrected frame. Their diffs all move toward
 * more coherent behaviour, not less: Treasures' ending plays its real FREEZEFIRE denouement
 * instead of halting mid-script. `vm.ts`'s `case 0x27` was made frame-aware in the same round (a
 * real, independent bug — it read `operands[7]` unconditionally against a frame Gen2 already
 * shipped), and `eclTreasureShortFrame.test.ts` exercises the frame under all three dialects.
 *
 * Both handlers were transcribed instruction-quoted from their own `GAME.OVR` (Pools file
 * `0x1626`, Treasures file `0x1afd`) and are structurally identical past their differing constant
 * addresses:
 *
 * ```
 * push bp; mov bp,sp; sub sp,N          ; prologue
 * mov al,4; push ax; lcall <parser>     ; prefetch 4 operand SETS (1-indexed operands #1..#4)
 * mov al,1; push ax; lcall <rvalue>     ; rvalue(#1) -> ax
 * xor dx,dx; add [acc1_lo],ax; adc [acc1_hi],dx   ; accumulate into a 32-bit party-gold field
 * mov al,2; push ax; lcall <rvalue>; ...add/adc [acc2_lo/hi]     ; rvalue(#2) accumulated
 * mov al,3; push ax; lcall <rvalue>; ...add/adc [acc3_lo/hi]     ; rvalue(#3) accumulated
 * mov al,4; push ax; lcall <rvalue>     ; rvalue(#4) -> AL (byte)
 * mov [bp-1],al; dec word ptr [treasure_parcels_remaining]
 * mov al,[bp-1]; push ax; lcall <parser>          ; SECOND prefetch: #4's VALUE is the tail COUNT
 * mov [bp-0x58],al                                 ; count kept for the loop-bound compare
 * cmp al,1(loop idx); jbe loop_body ... else jmp epilogue   ; count==0 skips the loop entirely
 * loop_body:
 *   mov al,idx; push ax; lcall <rvalue>            ; rvalue(item id), idx = 1..count
 *   cmp al,0xff; je next                           ; 0xff sentinel = "no item"
 *   ... les di,[item_table_base]; mul dx,0x11 ...   ; 17-byte item record lookup + add-to-inventory
 * ```
 * (Pools: `<parser>`/`<rvalue>` = far pointer `0x55:0x2a`/`0x55:0x25`; accumulators
 * `0xa7be/c0`, `0xa7c2/c4`, `0xa7c6/c8`; parcel counter `[0x880a]`; item table `[0x9cff]`.
 * Treasures: `0x58:0x2a`/`0x58:0x25`; accumulators `0x9e02/04`, `0x9e06/08`, `0x9e0a/0c`; parcel
 * counter `[0x7e22]`; item table `[0x931a]`. Both use `mov dx,0x11; mul dx` — 17-byte records,
 * `ITEM_RECORD_SIZE`'s `DOK_ITEM_RECORD_SIZE` sibling.)
 *
 * The four FIXED reads are operands #1, #2, #3 (each accumulated via `rvalue()` into a 32-bit
 * party-gold-type field — not the 7-coin-type breakdown the base 8-operand `treasureCoins` model
 * assumes) and #4 (the tail count). **The count is read through `rvalue()`, exactly the call that
 * resolves BOTH immediate (`code 0x00`, `rvalue = a.high`) and memory-reference (`code 1/2/3`,
 * `rvalue = memory[a.word]`) operand encodings** — so the binary genuinely can express either a
 * literal count or a variable one. `decodeInstructionAt`'s static `countAt` reader
 * (`disassemble.ts` ~line 995) only reads `args[countAt].word` directly, with NO rvalue
 * resolution — which is byte-identical to `rvalue()`'s result ONLY when the operand's `code` is
 * the immediate encoding (0x00 forces `word = high` in `readOpp`, matching `rvalue`'s `a.high`
 * read for that same code). A memory-coded (1/2/3) count operand would make `.word` an ECL
 * memory ADDRESS, not the count — `countAt` would then consume a wild, address-sized number of
 * trailing operand pairs. **This is why the shipped frame below is conditioned on a corpus check
 * that every count operand actually compiled is an immediate**, not on the handler's own
 * capability to also decode a memory reference.
 *
 * Corpus check (own scratch enumeration, cross-checked against `eclGen1DispatchRound32.test.ts`):
 * decoding all 56 Pools `ECL1.DAX` blocks under the candidate `{wordSet: 4, countAt: 3}` frame
 * finds **8** reachable `0x27` sites (vs. 6 under the shipped-until-now base-8 frame and 5 under
 * a flat `wordSet: 4` with no tail — the flat frame silently re-syncs onto the WRONG boundary
 * after some sites, hiding real occurrences rather than desyncing on them: Pools block 18 has TWO
 * real `0x27` sites but flat-4 only finds one, because its unconsumed tail bytes are misread as a
 * run of further instructions that coincidentally revalidate all the way to a byte-value-0
 * `EXIT` far short of the block's real end — 54 instructions decoded vs. 574 real ones once the
 * tail is modelled correctly). **All 8 sites' 4th operand is `code: 0x00` (immediate) — 0 are
 * memory-coded** — the alternative this decision turns on (a memory-coded count) scores 0/8, so
 * the corpus supports shipping the frame. 7 of the 8 sites carry a non-zero tail (lengths
 * 5,1,3,1,4,5,2; one site, `ECL1.DAX#42@0x33a`, has tail 0) — the tail is genuinely exercised, not
 * merely theoretical. Treasures' own 30-block `ECL1.DAX` corpus reaches **0** `0x27` sites under
 * ANY of the three framings via the shallow first-EXIT walker (this IS the shallow walker and
 * under-walks — R1's deep walker re-runs this count in parallel); the frame for Treasures rests on
 * its own handler transcription alone, not on corpus agreement (a materially weaker guarantee, the
 * same gap this file already states for Treasures' `0x1f`/`0x41`/`0x43`/`0x44`).
 *
 * Desync effect on Pools' 56-block census: base-8 `{desync: 3}` -> flat-4 `{desync: 1}` ->
 * countAt-3 `{desync: 1}` — **NOT** `{desync: 0}` as a naive read of the round-32 note might
 * predict. The one persisting desync, `ECL1.DAX#49@0x698`, is unrelated to `0x27`: it is opcode
 * `0x29` (`ENCOUNTER_MENU`, the base table's un-measured `wordSet: 14`, marked `vacuous` in
 * `pools-ecl-dispatch-map.md`) decoding garbage argument codes under both the flat-4 and the
 * countAt-3 dialect alike — a pre-existing, `0x27`-independent gap this item does not fix. So by
 * RAW DESYNC COUNT, countAt-3 does not separate from flat-4 on Pools (both score 1) — the
 * separation is in which sites are found and how much of the block decodes before a real `EXIT`,
 * not in the desync tally; see `eclGen1DispatchRound32.test.ts` for the numbers this paragraph
 * reports.
 */
/**
 * Pools of Darkness's retail ECL micro-dialect (2026-07-29). This is sourced from Pools' OWN
 * `GAME.OVR` dispatcher and handlers, not inferred merely from corpus alignment:
 *
 * - `0x1f` calls the operand parser with **one** operand (handler file `+0x264a`);
 * - `0x21 LOAD_FILES` parses **two** operands (`+0x0e9e`);
 * - `0x37` is not this title's earlier-engine three-set LOAD_PIECES command. Its handler
   *   (`+0x1eca`) parses **two** operands, decodes an inline name, walks the party list, and writes
   *   0xFF when absent or a zero-based TeamList ordinal with bit 7 set when the match is inactive;
   * - `0x41` parses **two** operands (`+0x240c`) and distributes operand-2 × 100 experience to
   *   either the party or current character according to operand 1.
 *
 * The corrected frames re-land exactly on retail instruction boundaries in ECL1#69/#72 and remove
 * both the old phantom `GOTO(nonlocal)` and the false post-0x37 bad opcode. Pools' search-location
 * scripts also read the raw GEO descriptor from `[0x002d]` (ECL1#69 `AND #0x3f,[0x002d],...`), the
 * same low-address convention as Treasures/DQK rather than the older CoK-family `0xc04f` default.
 */
export const ECL_GEN1_SHORT_POOLS: EclDialect = {
  ...ECL_GEN1_SHORT,
  wordSetOverrides: { ...ECL_GEN1_SHORT.wordSetOverrides, 0x1f: 1, 0x21: 2 },
  opcodeOverrides: {
    ...ECL_GEN1_SHORT.opcodeOverrides,
    0x37: { wordSet: 2, mnemonic: 'POOLS_FIND_CHARACTER' },
    0x41: { wordSet: 2, mnemonic: 'POOLS_AWARD_XP' },
    // `0x27` (2026-09-04, round 33 Phase B): transcribed from Pools' own `GAME.OVR` handler at
    // file `0x1626`, independently of Treasures'. 8 reached sites, all immediate counts (0/8
    // memory), 7/8 with non-zero tails that a flat 4-word frame misparses as instructions.
    0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' },
  },
  cellDescAddr: 0x002d,
  // Strongly identified by CMD_NewECL's Area+0x15 store plus ECL1#69's immediate predecessor
  // comparisons against [0x0016]; exact real-byte tests pin both sides of that identification.
  lastBlockIdAddr: 0x0016,
};
/**
 * Buck Rogers: Countdown to Doomsday's own ECL micro-dialect (2026-09-03, R6,
 * `tools/map_buck_ecl_dispatch.py` / `docs/engine/research/buck-ecl-dispatch-map.md`). Buck's
 * `GAME.OVR` carries the `TPOV` magic, not `FBOV` like every other structurally-matched Gen1
 * title (CoAB/Pool/DoK) — this is the first exercise of the dispatcher/operand-parser structural
 * match against that overlay shape, and it lands well below those titles' ~1.0 similarity
 * (dispatcher 0.887, operand parser 0.855 — still decisive: the runner-up candidates score 0.26
 * and 0.49, and Buck's own dispatch table is missing EXACTLY the same 13 opcode bytes as CoAB's
 * within 0x00-0x40). Unlike every other Gen1 dialect below, Buck's per-opcode word sets are read
 * straight off each handler's own `mov al,N; push ax; lcall <operand parser>` prologue — the
 * parser's call target itself derived from Buck's own handlers (the single far-call target that
 * is the FIRST call in 43/63 of them), since Buck was never part of the VROOMM correlation
 * pipeline the DoK/Pool tools otherwise use.
 *
 * NOT an alias of {@link ECL_GEN1_SHORT} or its siblings, despite `0x0c` agreeing with them: three
 * of the seven measured deltas below (`0x1d`, `0x22`, `0x23`) measure NEITHER the long dialect's
 * value NOR the short family's zero-operand reuse of those same three bytes — a third, genuinely
 * Buck-specific framing, not a member of the 1991+ "short form" family. `0x27`'s measured value of
 * 2 is far below the long table's TREASURE (8) and Gen2's own re-split TREASURE (4 + countAt 3,
 * see {@link ECL_GEN2}); Buck's handler loads only 2 argument sets and loops over them, so this
 * byte is very likely a different, Buck-specific command, not a narrower TREASURE — reported as a
 * flat word set, not claimed as TREASURE's own `countAt` shape.
 *
 * `0x31` IS now included as `SHORT_MENU` (2026-09-03, round 30 R4): Buck's own dispatch map shows
 * `0x2b` and `0x31` sharing the IDENTICAL handler file offset `0x1adf` — the compiler generated
 * ONE routine for both opcodes, which is direct code-identity evidence that `0x31`'s frame is
 * `0x2b HORIZONTAL_MENU`'s frame, stronger than either DoK or Pools ever had for the same decision
 * (neither of their compilers merged the two opcodes' bodies). Behavioral confirmation: a
 * CFG walk from all six `ECL{1..6}.DAX` files' header entries under the new frame reaches 19
 * distinct `0x31` sites; 18 of 19 (94.7%) decode their inline 6-bit-packed operands into clean,
 * coherent, thematically-Buck-Rogers English menu labels — `['SHOOT','CHARGE','TAKE COVER']`,
 * `['BUY DRINK','ORDER FOOD','TALK','WAIT','EXIT']`, `['LAUNCH','REPAIR','FUEL','AMMO','MED
 * SUP','EXIT']`, `['UP','DOWN','STAY']`, `['FEED','PLAY','IGNORE']`, etc. The one exception
 * (`ECL4.DAX#65@0xd27`) decodes zero items with garbage operand codes (`0x26`, `0xe8` — not a
 * plausible title/count pair) and is a false-branch artifact of the static walk, the same
 * evidentiary class as {@link ECL_GEN2}'s own documented false-branch VERTICAL_MENU halt, not a
 * counterexample to the frame. The raw corpus-decode metric independently prefers the SAME value:
 * sweeping wordSet 0..8 with `countAt: 1` over the full Buck corpus, `decoded_instruction_offsets`
 * peaks at wordSet 2 (10245, vs 9451 at the untouched baseline and never above 9768 at any other
 * swept value 0..8 except 2 itself) — corpus fit and binary/semantic evidence agree here, unlike
 * `0x4c`/`0x43` below where they did not (see `tools/gen1_ecl_encounter_scan.py`'s Buck sweep).
 *
 * 2026-09-03 (R6, `docs/engine/research/buck-ecl-desyncs.md`): attributed all 7 of the corpus
 * census's pinned desync sites to specific `GAME.OVR` handlers. 6 of the 7 land EXACTLY on the
 * byte immediately after a correctly-decoded prior instruction, at opcode `0x4c` — one of Buck's
 * own extensions beyond the CoAB oracle's `0x00-0x40` ceiling, previously left unmodeled ("no
 * mnemonic evidence" — true, but its OPERAND COUNT is directly readable from its handler's own
 * `mov al,2; push ax; lcall 0xb8,0x2a` prologue at file offset `0x363b`, matching the same derived
 * operand-parser target every other opcode below is measured against). Adding `0x4c` alone closes
 * 3 of those 6 blocks to a clean EXIT (`ecl4.dax#64`, `ecl5.dax#80`, `ecl6.dax#95`) and reveals
 * that the other 3 (`ecl1.dax#17`, `ecl1.dax#18`, `ecl6.dax#99`) decode a great deal further before
 * hitting a SECOND, previously-masked opcode — most dramatically `ecl1.dax#18`, which goes from a
 * 1-instruction stub to 60+ real instructions (SAVE/LOAD_FILES/LOAD_PIECES/ADD_NPC/SETUP_MONSTER/
 * APPROACH/LOAD_MONSTER/COMBAT — an unmistakable, coherent ambush-encounter script) before it
 * finally stops. The 7th site (`ecl6.dax#94`) lands directly on `0x29` ENCOUNTER_MENU, whose
 * handler (file `0x2646`) never reaches the derived operand-parser call at all — it calls three
 * OTHER, unidentified far routines (`0xbe4:0x62a`, `0xb8:0x7f`, `0x653:0x1359`) instead, so its
 * true word set (inherited here as the inherited long dialect's `14`, unverified for Buck) stays
 * genuinely UNMEASURED; this is also the second-layer cause behind `ecl1.dax#17`'s post-`0x4c`
 * stopping point. `tools/map_buck_ecl_dispatch.py`'s new `stop_reasons()` now classifies every
 * Unmeasured/beyond-0x40 handler this way (`no_far_call` vs `different_far_call_target` vs
 * `ran_past_scan_window` — see that function's own doc comment and
 * `docs/engine/research/buck-ecl-dispatch-map.md`'s generated table).
 *
 * That same evidence directly disassembled 10 more opcodes this round, all independently verified
 * against real `GAME.OVR` bytes (not corpus-fit — see `buck-ecl-desyncs.md`'s attribution table):
 *
 *   - **8 measured the same way as the original 7** (`mov al,N; push ax; lcall 0xb8,0x2a`, the
 *     SAME derived call target): `0x41:2` (`0x301d`), `0x43:1` (`0x3164`), `0x45:2` (`0x31a7`),
 *     `0x46:2` (`0x3207`), `0x48:1` (`0x326c`), `0x49:6` (`0x33a4`), `0x4b:1` (`0x34d8`),
 *     `0x4c:2` (`0x363b`, above).
 *   - **3 read as wordSet 0 from `no_far_call`** — the strongest possible zero-operand signal,
 *     since the handler makes NO call of any kind that could consume ECL script bytes, not merely
 *     one that skips the derived target: `0x44` (`0x319c`, a bare 6-byte global-counter bump),
 *     `0x47` (`0x323e`, touches only fixed globals), `0x4a` (`0x34c8`, sets a flag then NEAR-calls
 *     `0x24`'s own handler, itself `no_far_call` and already the base table's `COMBAT`, wordSet 0).
 *   - `0x3c` PROTECTION (`0x2d5a`) is a WORDSET OVERRIDE, not a new opcode: its Buck handler is a
 *     literal no-op (`push bp; mov bp,sp; mov sp,bp; pop bp; retf` — no call, no memory touch at
 *     all), overriding the long dialect's `1`.
 *   - `0x42` (`0x313b`) and `0x2c` PARLAY (`0x267d`) both call OTHER, unidentified far routines
 *     (`0x42`: `0x653:0xe58`, `0xb8:0xb6`; `0x2c`: `0xbe4:0x1b2b`, `0xbe4:0x62a`, `0x10f:0x4d` — a
 *     fixed-string Y/N prompt, reads a keypress, writes flags — clearly NOT the ECL operand
 *     stream, but not provably zero either) and stay genuinely unmeasured, same standard as `0x29`.
 *
 * `ecl2.dax#32-35` (the four blocks `eclInspector.ts`'s `?ecl=buck` route opens) disassemble
 * byte-for-byte IDENTICALLY before and after every override in this round — none of them reaches
 * any of the newly-modeled opcodes.
 *
 * 2026-09-03 (round 30 R4, `docs/engine/research/buck-ecl-desyncs.md`'s dated appendix,
 * `tools/buck_far_targets.py`): attempted to resolve the seven remaining `unresolved_relocated_segment`
 * far-call targets blocking `0x29`/`0x2c`/`0x42` (listed just above) using `tools/vroomm_layout.py`,
 * the same resolver that already handles Buck's public-stub-owned calls. THE CENTRAL HAZARD this
 * round was told to guard against — never carry an uncalibrated `seg:off -> file offset` mapping
 * into Buck — is exactly what happened: calibrating the same class of large-segment call against
 * CoAB's 851-function oracle (`build/coab-oracle-map.json`) first, the best of 9 tested multipliers
 * (`file_offset = seg*mult + off + D`, `D` plurality-voted per multiplier) explained only **9 of
 * 103** distinct CoAB calibration pairs — already short of the round's own >= 10 bar — and that
 * SAME winning constant landed **0 of 10** held-out CoAB pairs it was not fitted on, for every
 * multiplier tried. This is a landable negative, not a resolution: all seven targets
 * (`0xbe4:0x62a`, `0xb8:0x7f`, `0x653:0x1359`, `0xbe4:0x1b2b`, `0x10f:0x4d`, `0x653:0xe58`,
 * `0xb8:0xb6`) stay genuinely UNRESOLVED, and `0x29`/`0x2c`/`0x42`'s true word sets remain
 * unmeasured — no address from this attempt is used anywhere in this dialect. See
 * `tools/buck_far_targets.py`'s own docstring for the method and `tools/test_buck_far_targets.py`
 * for the mutation test (lowering the bar by 1, to 9, flips this exact result to "calibrated").
 *
 * 2026-09-03 (round 31 R1, `docs/engine/research/buck-ecl-desyncs.md`'s dated appendix): the
 * paragraph above's LINEAR-fit negative is unchanged and still correct on its own terms, but its
 * "all seven targets stay genuinely UNRESOLVED" framing is RETRACTED — it never tried the
 * resolver `tools/vroomm_layout.py` already carries for a different, non-linear class of far call.
 * That SAME descriptor/public-stub-array geometry (calibrated against CoAB's own oracle-named
 * `@parse_command_sub$q4Byte`, landing exactly at `0x810a`, with 229 of 240 distinct
 * `public_stub_owned` CoAB targets landing on a real oracle function start against a shifted null
 * of 1/0/0/0 at ±1/±16 bytes) independently routes Buck's own `0xb8:0x2a` operand-parser call to
 * the SAME `GAME.OVR:0x1ca15` this dialect's parser-derivation already found structurally, and
 * resolves three of the seven targets to real code: `0xb8:0x7f` → `0x1e0f2`, `0xb8:0xb6` →
 * `0x1e98e`, `0x10f:0x4d` → `0x2d9cd`. The other four (`0xbe4:0x62a`, `0xbe4:0x1b2b`,
 * `0x653:0x1359`, `0x653:0xe58`) sit on segments the SAME geometry ALSO classifies
 * `unresolved_relocated_segment` and stay genuinely resident/unresolved — the retraction is scoped
 * to exactly the three named targets, not all seven.
 *
 * Despite that, **no `wordSetOverrides`/`opcodeOverrides` entry changes for `0x29`/`0x2c`/`0x42`
 * this round.** `tools/map_buck_ecl_dispatch.py`'s `walk_far_call_chain` first identified the ECL
 * PC (script cursor) global straight from the operand parser's own body at `0x1ca15` — exactly one
 * candidate, `0x3be2` (read via `mov ax,[0x3be2]` 8 times, written via `inc`/`add` at the same
 * address) — then exhaustively walked every reachable, resolvable static call target of all three
 * opcodes' resolved operands (every same-descriptor near call, every additionally
 * `public_stub_owned` far call, up to 31 nodes deep for `0x29`'s chain). NONE of that reachable
 * code ever touches `0x3be2` or calls the parser directly, but EVERY chain bottoms out in
 * genuinely resident code (first named blocker: `0x129:0x72`) before that question is settled. Per
 * this round's own rule — an override lands only for a verdict of `0`/`N` with every reachable
 * callee read, never with an `unknown` still in the chain — the honest verdict for all three stays
 * `unknown (resident callee 0x129, 0x72 unread)`; see
 * `docs/engine/research/buck-ecl-dispatch-map.md`'s "Script-bytes-consumed verdicts" table and
 * `tools/test_map_buck_ecl_dispatch.py`'s `test_script_bytes_consumed_verdicts_for_the_three_opcodes`
 * for the full walk evidence. `ecl2.dax#32-35` still disassemble byte-for-byte identically, since
 * nothing here changed any decoded frame.
 *
 * 2026-09-03 (round 32 R5) — THE PARAGRAPH ABOVE IS SUPERSEDED, AND ITS BLOCKER WAS AN ARTIFACT.
 * `0x29`, `0x2c` and `0x42` now carry `wordSet: 0` below, read from the binary. The reason the
 * round-31 walk bottomed out in "genuinely resident code" is that it was walking **EXEPACK-
 * compressed bytes**. All eight Gen1 loaders are genuine Microsoft EXEPACK v1 (relocs 0, `RB` at
 * `CS:0010`, entry `8c c0 05 10 00 0e 1f a3 04 00`); `tools/exepack_unpack.py` now decompresses
 * them to `build/exepack/*.bin` at the declared `dest_len*16`, and `walk_far_call_chain` run into
 * the unpacked resident image reaches the callees that were previously unreadable and returns a
 * concrete `0` for all three (`max_nodes=5000`, observed peak 469 — exhaustion, not truncation).
 *
 * That also RETRACTS round 31's headline negative outright. Round 31 reported "0 of 140" CoAB
 * oracle calls landing on Borland prologues at shift 0 and called it decisive. Against the
 * unpacked image it is **66 of 140 (47%) at shift 0, against 0 of 140 at ±1**; Buck is **98 of 175
 * pairs (56%) at shift 0 against 0 of 175 at ±1**. A negative measured through an un-inverted
 * transform is not a negative about the data — nothing in round 31 had established that the bytes
 * being searched were the bytes the loader executes. Independent check that the unpacking is
 * right, not merely plausible: the fraction of decoded relocation targets holding a word below
 * `dest_len` (in PARAGRAPHS — the byte scale exceeds 0xFFFF for several titles and destroys the
 * test) is **1.000 across all eight titles**, against a packed-file null of **0.239–0.442**.
 *
 * Scope of what this does NOT settle: only 11 of Buck's 16 unresolved segments resolve; the five
 * stride-5 stub segments do not, and are left disclosed rather than forced. Buck's desyncs go
 * **4 → 2** (`ecl1.dax#17@0xec` and `ecl6.dax#94@0x50` fixed; `#18@0x395` and `ecl6.dax#99@0x2c0`
 * unchanged and still unattributed). Of the 22 opcodes the round-31 partition called vacuous, 17
 * are now measured — 11 return a concrete `0`, and 6 (`0x16`–`0x1b`) touch the ECL PC global
 * `0x3be2` as branch/skip control flow. **Those 6 are deliberately NOT claimed as corrections**:
 * the base table already gives them `wordSet: 0`, so measuring them changes no decoded byte. Only
 * `0x29`/`0x2c`/`0x42` discriminate, which is why only they appear below. {@link ECL_GEN1_MATRIX}
 * reproduces the identical 6/11/5 partition on its own, differently-compiled binary.
 *
 * 2026-09-05 (round 35 R1) — THE `0x42` HALF OF THE PARAGRAPH ABOVE SHIPPED AS DEAD CODE, AND
 * THIS ROUND IS WHERE IT STARTS RUNNING. Round 32 R5's measurement (`wordSet 0`, from the
 * EXEPACK-unpacked resident image) is not in dispute and is not re-derived here; what was wrong
 * is WHERE it was written. `decodeInstructionAt` (this file) and `eclEncode.ts`'s own
 * `effectiveWordSet` both resolve `opcodeOverrides?.[op] ?? KRYNN_GEN1_OPCODES[op]` FIRST and
 * return `badOpcode`/`undefined` when that is empty — they never reach `wordSetOverrides`. The
 * base table's dense range stops at `0x41`, so a bare `wordSetOverrides[0x42] = 0` had no `def`
 * to modify and byte `0x42` kept decoding as a bad opcode for two rounds. Verified directly:
 * `decodeInstructionAt(new Uint8Array([0x42, ...]), 0, 0x7ffe, ECL_GEN1_BUCK)` returned
 * `{next: 0, badOpcode: true}` on HEAD. `eclDialectOverrideKeys.test.ts` now pins the whole
 * class: every `wordSetOverrides` key of every exported dialect must resolve to a `def` under
 * that dialect's own resolution order.
 *
 * MEASURED EFFECT of moving it into `opcodeOverrides` (corpus census, `eclReachability.test.ts`):
 * Buck deep desyncs 195 → 9, shallow 2 → 1, reachable bytes 158,421 → 165,391, and 232 real
 * `0x42` instructions across 13 blocks start decoding. Matrix: 452 → 16, 3 → 2,
 * 217,569 → 236,375, 528 instructions across 24 blocks.
 *
 * THE NULL, AND WHAT IT DOES AND DOES NOT CARRY. The plan's null said a zero-operand opcode
 * cannot desync a walker, so most of the deep-desync collapse is free under ANY reading. Measured
 * (sweep of `wordSet` 0..8 with the dead `wordSetOverrides` key removed so the frame actually
 * varies): partly true — merely giving `0x42` a `def` at all buys Buck 195 → 52..71 and Matrix
 * 452 → 92..141, so roughly two thirds of the headline drop is free. What is NOT free is the
 * misaligned-jump-target count and the reachable-byte total, and those separate `wordSet: 0` from
 * every alternative by more than an order of magnitude: Buck misaligned targets 6 at ws=0 vs
 * 108..186 at ws=1..8 (best alternative 108, an 18x gap); Matrix 2 vs 247..439 (123x). Reachable
 * bytes peak at ws=0 in both (Buck 165,391 vs a best alternative of 152,324; Matrix 236,375 vs
 * 181,837). One correction to the plan's own framing: it predicted misaligned targets would
 * "collapse from 108+". They do not — on HEAD they are ALREADY 6 (Buck) and 2 (Matrix), because a
 * bad opcode stops the thread before it can emit a bogus jump target at all. The 108/247 figures
 * are the ALTERNATIVE-wordSet null, not a before-state; that is what makes them evidence.
 */
export const ECL_GEN1_BUCK: EclDialect = {
  headerLen: 22,
  vbase: 0x7ffe,
  hasMagic: true,
  // 0x29/0x2c/0x42: round 32 R5, read from the EXEPACK-unpacked resident image
  // (build/exepack/buck-start.bin); see the 2026-09-03 note above.
  wordSetOverrides: {
    0x0c: 4, 0x1d: 2, 0x22: 3, 0x23: 3, 0x27: 2, 0x3f: 2, 0x40: 2, 0x3c: 0,
    0x29: 0, 0x2c: 0,
  },
  opcodeOverrides: {
    0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' },
    0x41: { wordSet: 2, mnemonic: 'BUCK_EXT_41', uncertain: true },
    // 0x42: round 35 R1. The wordSet-0 measurement is round 32 R5's, unchanged; what moved is
    // WHERE it lives. As a bare `wordSetOverrides` key it was DEAD CODE -- see the round-35 note
    // in this dialect's docblock. `BUCK_EXT_42` is deliberately NOT `LOAD_AREA_PIECES`: vm.ts's
    // `case 0x42` keys on that mnemonic and would read four operands this frame never decodes.
    0x42: { wordSet: 0, mnemonic: 'BUCK_EXT_42', uncertain: true },
    0x43: { wordSet: 1, mnemonic: 'BUCK_EXT_43', uncertain: true },
    0x44: { wordSet: 0, mnemonic: 'BUCK_EXT_44', uncertain: true },
    0x45: { wordSet: 2, mnemonic: 'BUCK_EXT_45', uncertain: true },
    0x46: { wordSet: 2, mnemonic: 'BUCK_EXT_46', uncertain: true },
    0x47: { wordSet: 0, mnemonic: 'BUCK_EXT_47', uncertain: true },
    0x48: { wordSet: 1, mnemonic: 'BUCK_EXT_48', uncertain: true },
    0x49: { wordSet: 6, mnemonic: 'BUCK_EXT_49', uncertain: true },
    0x4a: { wordSet: 0, mnemonic: 'BUCK_EXT_4A', uncertain: true },
    0x4b: { wordSet: 1, mnemonic: 'BUCK_EXT_4B', uncertain: true },
    0x4c: { wordSet: 2, mnemonic: 'BUCK_EXT_4C', uncertain: true },
  },
};

/**
 * Buck Rogers: **Matrix Cubed** (the 1992 sequel) ECL dialect.
 *
 * Derived in round 31 (R2) from Matrix Cubed's OWN `GAME.OVR` by the same pipeline that produced
 * {@link ECL_GEN1_BUCK} from Countdown to Doomsday's: structural match of the dispatcher and
 * operand parser against the CoAB oracle map, the dispatch table plus its fallthrough resolver,
 * and per-opcode word sets read from each handler's own `mov al,N; push ax; lcall` prefetch.
 * Nothing here was inherited from Countdown — `headerLen`/`vbase`/`hasMagic` were read from
 * Matrix's own `ECL1.DAX` block bytes (every block opens with the `0x1388` magic and its fifth
 * far pointer's vaddr is `0x8014`, so `vbase = 0x8014 - 22`).
 *
 * The two binaries are not even the same overlay format: Countdown's `GAME.OVR` is `TPOV`,
 * Matrix's is `FBOV` (Curse of the Azure Bonds' own overlay magic). Measured match quality:
 * dispatcher similarity 0.8885 / trigram 0.6087 at `GAME.OVR:0x38e8` (Countdown: 0.8872 /
 * 0.4615), operand parser 0.8750 / 0.9059 at `0x1cf69` (Countdown: 0.8550 / 0.8276). Matrix
 * dispatches the same 75 opcodes over `0x00..0x4c` with the same `0x1f`/`0x3b` gaps, and its
 * parser call target `0x6b:0x2a` is reached by 50 of 75 handlers — the same share as Countdown's
 * `0xb8:0x2a`, at a different absolute address, as two separately linked binaries should be.
 *
 * **It came out field-for-field identical to {@link ECL_GEN1_BUCK}** (53 opcodes agree on a
 * concrete value, 0 disagree, 22 are unmeasured in both; the eleven `0x41..0x4c` extensions agree
 * 11/11 on their prefetch immediate, including three that independently land on the same
 * no-far-call verdict). That is a result, not a shortcut.
 *
 * HOW MUCH OF THAT 75 IS LOAD-BEARING: 16, not 53. An adversarial pass attacked the sentence above
 * for stating an agreement without naming the alternative it was supposed to beat. The alternative
 * is "Matrix follows the plain Gen1 base table" ({@link KRYNN_GEN1_OPCODES}), and Countdown's
 * dialect never diverged from that base on most opcodes, so agreeing there costs the alternative
 * nothing: 56 shared-range opcodes carry the same word set under plain `ECL_GEN1` as under this
 * table. The opcodes that actually separate the two readings are the 8 whose width differs from
 * base AND that Matrix's own handler concretely measured (`0x0c`, `0x1d`, `0x22`, `0x23`, `0x27`,
 * `0x31`, `0x3f`, `0x40` — `0x27` jumps from base 8 to 2), plus the 8 beyond-`0x40` extensions
 * with a measured width, which the base table has no row for at all. Matrix matches Countdown on
 * 16 of 16. `0x3c` is the near-miss that fixes the count at 8 and not 9: this table overrides it
 * from base 1 to 0, so it looks discriminating, but Matrix's own `0x3c` handler is `no_far_call`
 * and measured nothing. `matrixEclDialect.test.ts` computes that whole partition rather than
 * restating it.
 *
 * AND THE CORPUS CENSUS IS NOT THE EVIDENCE. 29 of Matrix's 33 retail ECL blocks reach a clean
 * terminating EXIT under this table and 4 desync — but plain `ECL_GEN1` scores 26/7 on the same
 * blocks, and {@link ECL_GEN1_SHORT_POOLS}, which is wrong for Matrix, ties at exactly 29/4. A raw
 * clean-exit count does not discriminate on this corpus. The binary does.
 *
 * SO WHY IS THIS A SEPARATE LITERAL AND NOT `= ECL_GEN1_BUCK`? Because
 * `packages/engine/test/matrixEclDialect.test.ts` pins the two deep-equal, and an alias would make
 * that assertion incapable of failing — the exact defect round 30's probe audit was created to
 * find. Kept as its own object, the pin becomes a live guard against round 30's OTHER regression,
 * where `0x31 SHORT_MENU` was added to one dialect and simultaneously deleted from its twin and
 * only the browser harness noticed. Edit one of these two tables and the deep-equal tells you.
 *
 * The `BUCK_EXT_*` mnemonics are deliberately shared rather than renamed `MATRIX_EXT_*`: they name
 * the same opcodes in the same table, and divergent names would imply a divergence that was
 * measured NOT to exist. If the tables ever diverge, rename then.
 *
 * 2026-09-05 (round 35 R1): `0x42` moved from `wordSetOverrides` to `opcodeOverrides` here for
 * exactly the reason given in {@link ECL_GEN1_BUCK}'s round-35 note — as a bare `wordSetOverrides`
 * key it was unreachable dead code and Matrix's byte `0x42` decoded as a bad opcode. Matrix's own
 * numbers: deep desyncs 452 → 16, shallow 3 → 2, reachable bytes 217,569 → 236,375, 528 `0x42`
 * instructions across 24 blocks. `BUCK_EXT_42` is a deliberately opaque label: NO semantics are
 * claimed for Buck's or Matrix's `0x42` (its handler's far-call targets `0x653:0xe58` and
 * `0xb8:0xb6` are still unidentified), and in particular it must NOT be `LOAD_AREA_PIECES`, which
 * is Treasures' own 4-operand combined area loader and the mnemonic `vm.ts`'s `case 0x42` keys on.
 */
export const ECL_GEN1_MATRIX: EclDialect = {
  headerLen: 22,
  vbase: 0x7ffe,
  hasMagic: true,
  // 0x29/0x2c/0x42: round 32 R5, measured from MATRIX CUBED's OWN handlers in the
  // EXEPACK-unpacked image (build/exepack/matrix-start.bin), NOT inherited from
  // ECL_GEN1_BUCK -- matrix-ecl-dispatch-map.md reports all three as 0 under a claim
  // boundary that forbids taking word sets from Countdown. Same 6/11/5 vacuous
  // partition as Buck, independently reproduced on a differently-compiled binary.
  wordSetOverrides: {
    0x0c: 4, 0x1d: 2, 0x22: 3, 0x23: 3, 0x27: 2, 0x3f: 2, 0x40: 2, 0x3c: 0,
    0x29: 0, 0x2c: 0,
  },
  opcodeOverrides: {
    0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' },
    0x41: { wordSet: 2, mnemonic: 'BUCK_EXT_41', uncertain: true },
    // 0x42: round 35 R1. The wordSet-0 measurement is round 32 R5's, unchanged; what moved is
    // WHERE it lives. As a bare `wordSetOverrides` key it was DEAD CODE -- see the round-35 note
    // in this dialect's docblock. `BUCK_EXT_42` is deliberately NOT `LOAD_AREA_PIECES`: vm.ts's
    // `case 0x42` keys on that mnemonic and would read four operands this frame never decodes.
    0x42: { wordSet: 0, mnemonic: 'BUCK_EXT_42', uncertain: true },
    0x43: { wordSet: 1, mnemonic: 'BUCK_EXT_43', uncertain: true },
    0x44: { wordSet: 0, mnemonic: 'BUCK_EXT_44', uncertain: true },
    0x45: { wordSet: 2, mnemonic: 'BUCK_EXT_45', uncertain: true },
    0x46: { wordSet: 2, mnemonic: 'BUCK_EXT_46', uncertain: true },
    0x47: { wordSet: 0, mnemonic: 'BUCK_EXT_47', uncertain: true },
    0x48: { wordSet: 1, mnemonic: 'BUCK_EXT_48', uncertain: true },
    0x49: { wordSet: 6, mnemonic: 'BUCK_EXT_49', uncertain: true },
    0x4a: { wordSet: 0, mnemonic: 'BUCK_EXT_4A', uncertain: true },
    0x4b: { wordSet: 1, mnemonic: 'BUCK_EXT_4B', uncertain: true },
    0x4c: { wordSet: 2, mnemonic: 'BUCK_EXT_4C', uncertain: true },
  },
};
/**
 * Krynn-Gen2 (DQK, HLIB ECL.GLB) ECL header: five far pointers, NO magic word (20 bytes).
 * Operand-frame deltas vs the Gen1 base table (all runtime-trace proven): LOAD_FILES short form
 * (2 operands), PARTYSTRENGTH zero-operand (Gen1's 1-operand frame consumes the next opcode and
 * can turn a PRINTCLEAR string length 0x24 into a false COMBAT), PARLAY short form (3 mapped
 * values + destination), and SETUP_MONSTER **four** operands.
 *
 * `0x0c: 4` (2026-07-23, the cok-m4 combat-init desync round — cok-m4-fidelity-plan.md §25):
 * DQK's own live SETUP_MONSTER handler (canonical `25a4:2db1`, overlay body file base 0x402C0,
 * the body the crash-route trace's INT21 lseek log proves loaded) opens with
 * `mov al,4; push ax; lcall 2033:0013` — it tells the shared operand parser to pull FOUR frames
 * (op1→[0xbee8] sprite, op2→es:[b20f+0x38] max-distance, op3→[0xb1ca] pic, op4→[0xc2e7],
 * consumer unlocated — the exact analog of DoK's `[0xc4cc]` fourth param). This matches the
 * whole 1991+ short-form family ({@link ECL_GEN1_SHORT} `0x0c: 4`) and is corroborated by the
 * native DISK3 ECL.GLB corpus decoding coherently under the 4-operand frame. Champions of Krynn
 * (long dialect) is affirmatively 3-operand, which is why running a ported CoK block on DQK
 * swallowed the two bytes after SETUP_MONSTER (a `3a 0d` DELAY+APPROACH pair) as a bogus 4th
 * operand — the desync behind the area-34 combat-init crash investigation.
 *
 * `0x22: 0` / `0x23: 0` (same round, found when the corrected 4-frame SETUP_MONSTER let the
 * area-65 retail stream decode PAST its previously-fake "EXIT" — which turned out to be the
 * first byte of SETUP_MONSTER's 4th operand frame — into a live SURPRISE site): DQK's own
 * resident dispatch-table handlers prove both take ZERO operands, exactly like DoK's short
 * dialect. Handler `2033:1402` (op 0x23) pushes the same four compiled-in message-window
 * constants as DoK's (0x16,0x26,0x11,1), fetches no operands, and TAIL-CALLS the opcode-0x00
 * CMD_Exit handler at `2033:01ae` — script-terminal. Handler `2033:13c4` (op 0x22) advances
 * the cursor past the opcode byte, clears 4 flag bytes at [0xb2f5], runs a prompt helper
 * (`0bdb:0424`), and writes the answer to [0xb2f5]/[0xb2f6] — a yes/no whose result lands in
 * the compare flags, no operand parser call anywhere. Both mirror `ECL_GEN1_SHORT` and the
 * VM's existing zero-arg handling applies unchanged.
 *
 * `opcodeOverrides[0x41]` is Gen2's ONE real opcode-table extension beyond Gen1's `0x00-0x40`
 * ceiling, live-confirmed by Unicorn-tracing the retail dispatch table at canonical `2033:0d34`
 * (docs/engine/research/decompile-dqk-ecl-dispatch.md, "2026-07-18 DYNAMIC TRACE — SOLVED"): the
 * live range check is `cmp ax,0x41; jbe` — table slots run `0x00..0x41` (0x42 total) and every
 * higher byte falls through to a bare `retf` (a silent no-op back in the real interpreter). A
 * live fire (run r3, area 65 member 45) observed operand bytes `00 01 00 64` — two 2-byte `imm`
 * EclOpp sets (`wordSet: 2`) — so that framing is trace-proven, not guessed. The handler's own
 * semantics are NOT proven (see {@link KRYNN_GEN1_OPCODES}'s sibling comment in vm.ts's exec()
 * switch for the grounded-but-unconfirmed "party-wide award/split" hypothesis); `uncertain: true`
 * flags that honestly, the same convention already used for Gen1's `0x1F`.
 *
 * 2026-08-07 — the remaining overrides below are no longer per-opcode inferences: the whole Gen2
 * operand table was read out of DQK.EXE. Every Gen2 handler declares its own operand count by
 * calling the shared prefetch routine `2033:0013` as `mov al,N; push ax; (push cs;) call 0x0013`,
 * then reads operand `i` via `2033:0112`. `2033:0013` itself carries the operand-code dispatch
 * table at `cs:0x0068` = `{1, 2, 3, 0x80, 0x81}` (raw bytes at DQK.EXE file 0x031D88:
 * `01 00 02 00 03 00 80 00 81 00`; code 0 is the fallthrough default, not a table entry)
 * — the documented EclOpp codes — and advances the ECL
 * PC (`[0xb7f9]`) two bytes per set, so that `N` IS `wordSet`. Count-driven opcodes issue a SECOND
 * prefetch with a register argument after `dec [0xb7f9]`. Extracting `N` for all 0x42 slots
 * (near handlers at file base 0x031d20, overlay-body handlers at 0x0402c0 — see the note in
 * docs/engine/research/decompile-dqk-ecl-dispatch.md) corrected six opcodes:
 *
 *   0x1f 2 -> 1 | 0x27 8 -> 4 (+countAt 3) | 0x29 14 -> 0
 *   0x2c 4 -> 1 | 0x31 0 -> 2 (+countAt 1) | 0x37 3 -> 2
 *
 * Measured over a control-flow walk from the five header entries of all 47 DQK ECL.GLB members,
 * the corrected table reaches 6789 instructions with ONE halt (and that halt is not a framing
 * error — it is a VERTICAL_MENU's inline string reached via a false branch target); the previous
 * table reached 5292 with 74 halts, and found 3 COMBAT sites where there are really 41. `0x2c
 * PARLAY` occurs 130 times and was the dominant desync.
 *
 * `0x31` is a MENU in Gen2, not SPRITE_OFF: it SHARES handler `25a4:1ff7` with `0x2b`, and the
 * slot stub at `2033:0eab` passes `al` (0 for 0x2b, 1 for 0x31) purely as a discriminator, not as
 * an operand count. That independently corroborates the same conclusion reached for the Gen1-SHORT
 * dialects from the other direction (docs/engine/research/gen1-ecl-extended-opcodes.md §8).
 */
export const ECL_GEN2: EclDialect = {
  headerLen: 20,
  vbase: 0x8000,
  hasMagic: false,
  wordSetOverrides: {
    0x0c: 4, 0x1d: 0, 0x1f: 1, 0x21: 2, 0x22: 0, 0x23: 0, 0x29: 0, 0x2c: 1, 0x37: 2,
  },
  opcodeOverrides: {
    0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' },
    // RESTORED 2026-09-03: round 30's R4 deleted this line while adding the same opcode to
    // ECL_GEN1_BUCK, against its own brief's "must NOT touch every other dialect constant in
    // disassemble.ts". Removing it desyncs DQK: area 4's event text changed from the retail
    // "...SUPPLIES..." string to a different (real, but wrong-for-that-cell) one, which the
    // `explore-dqk` browser case caught. Nothing in the engine suite covers Gen2's 0x31, so the
    // unit tests stayed green through the regression — the reason the browser harness is a
    // required gate and not an optional one.
    0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' },
    0x41: { wordSet: 2, mnemonic: 'GEN2_EXT_41', uncertain: true },
  },
  // See EclDialect.divRemainderAddr's own doc comment for the byte evidence (both the CoAB Gen1
  // decompile and DQK's own retail area-31/GAME.OVR bytes): Gen2's DIVIDE remainder lands at
  // ECL address 0x0029, not Gen1's 0x7f3f.
  divRemainderAddr: 0x0029,
};

/**
 * Retained as an alias of {@link ECL_GEN2} so existing call sites keep working.
 *
 * This used to scope PARLAY's one-operand frame to DQK area 5 alone, on the belief that "a global
 * override desynchronizes those other scripts". That belief was measured and is false. `0x2c`
 * takes exactly one operand everywhere — its handler `2033:1420` does `mov al,1; push ax; push cs;
 * call 0x0013` — and applying `0x2c: 1` globally, changing nothing else, cuts bad-opcode halts
 * across the DQK ECL.GLB corpus from 24 to 5 and reaches 22% more instructions. The per-area
 * exception was the correct universal value applied locally. It now lives in `ECL_GEN2` itself.
 */
export const ECL_GEN2_DQK_AREA5: EclDialect = ECL_GEN2;

/**
 * Virtual base each Gen1 ECL block maps to: virtual = ECL_VBASE + byteIndex. byte 0 (the magic
 * word) loads at 0x7FFE so that the entry at byte 22 lands on the canonical 0x8014. (Gen2 uses
 * 0x8000 — see {@link ECL_GEN2}.)
 */
export const ECL_VBASE = ECL_GEN1.vbase;
/** Gen1 header length (2-byte magic + five 4-byte far pointers); execution entry is right after. */
export const ECL_HEADER_LEN = ECL_GEN1.headerLen;

/** Operand kind, derived from the EclOpp `code` byte. */
export type EclOppKind = 'imm' | 'word' | 'strref' | 'string' | 'flag' | 'other';

/** One decoded argument-set. */
export interface EclOpp {
  /** Type-indicator byte. */
  code: number;
  /** Second byte (low byte of a word operand, the immediate value, or — when `code` is
   * 0x80 — the byte length of the inline packed string that follows). */
  high: number;
  /** Third byte — present only when `code ∈ {1,2,3,0x81}`. */
  val?: number;
  /** Decoded operand: `(val<<8)|high` for 3-byte form, else `high`. */
  word: number;
  kind: EclOppKind;
  /** Decoded text — present only when `code` is 0x80 (an inline 6-bit packed string). */
  text?: string;
}

/**
 * Decode an inline ECL string: `packedLen` bytes of 6-bit characters, MSB-first, starting at
 * `offset`. Char rule (per hackdocs STRGFORM): value 0 terminates; 1–31 map to ASCII +64
 * (so 1→'A'…26→'Z'); 32–63 are taken as-is (space, digits, punctuation). Verified against
 * EclDump output (e.g. "YOU ARE ABOUT TO LEAVE...", "LEAVE"/"STAY" menu items).
 */
export function decodeEclString(raw: Uint8Array, offset: number, packedLen: number): string {
  const end = Math.min(offset + packedLen, raw.length);
  let acc = 0;
  let bits = 0;
  let out = '';
  for (let i = offset; i < end; i++) {
    acc = ((acc << 8) | raw[i]) & 0xffffff;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      const v = (acc >> bits) & 0x3f;
      if (v === 0) return out; // terminator
      out += String.fromCharCode(v >= 1 && v <= 31 ? v + 64 : v);
    }
  }
  return out;
}

/** One decoded instruction. */
export interface EclInstruction {
  /** Raw byte offset of the opcode within the block. */
  offset: number;
  /** Virtual address (ECL_VBASE + offset). */
  vaddr: number;
  opcode: number;
  mnemonic: string;
  args: EclOpp[];
  /** Total instruction size in bytes (1 + Σ arg sizes). */
  size: number;
  /**
   * True when the opcode's mnemonic/frame is speculative rather than grounded. Originally meant
   * "defined-but-handlerless in EclDump" (DQK's own `0x1f`); also now carried by every Buck
   * (`ECL_GEN1_BUCK`, `0x41..0x4c`) and Gen2 (`ECL_GEN2`, `0x41`) extension-range opcode whose
   * word set is measured directly from its own handler's operand-parser prefetch but whose
   * MNEMONIC/semantics have no oracle counterpart to confirm against (see the doc comments above
   * each dialect's `opcodeOverrides`).
   */
  uncertain?: boolean;
}

/** The 22-byte header: a magic word + five far-pointer virtual addresses. */
export interface EclHeader {
  /** Always 0x1388 — the game-global VM dispatch constant (header bytes 0..1). */
  magic: number;
  /** Entry of this block's main VM-run sub (far pointer 0). */
  vmRun1: number;
  /** Entry of this block's "search this location" sub (far pointer 1). */
  searchLocation: number;
  /** Entry of this block's "pre-camp check" sub (far pointer 2). */
  preCampCheck: number;
  /** Entry of this block's "camp interrupted" sub (far pointer 3). */
  campInterrupted: number;
  /** Code entry point (far pointer 4) — always 0x8014 (= byte 22, after the header). */
  eclInitialEntry: number;
}

/** A disassembled ECL block (header + the main subroutine from byte 22). */
export interface EclBlock {
  header: EclHeader;
  /** Instructions of the main subroutine (byte 22 → first EXIT inclusive). */
  instructions: EclInstruction[];
  /** Set if an undefined opcode byte was hit (disassembly stopped there). */
  badOpcodeAt?: number;
}

function classify(code: number): EclOppKind {
  if (code === 0x00) return 'imm';
  if (code === 0x02) return 'imm';
  if (code === 0x01 || code === 0x03) return 'word';
  if (code === 0x80) return 'strref';
  if (code === 0x81) return 'string';
  if (code === 0x09) return 'flag';
  return 'other';
}

/**
 * Read the vaddr word of far pointer `slot`. The header is `[magic(2)] + slot×{segment(2),
 * vaddr(2)}`; the far-pointer table starts at byte 2 when a magic word is present (Gen1) or
 * byte 0 when it is not (Gen2). So pointer `slot`'s vaddr word is at `tableBase + slot*4 + 2`.
 */
function farOffset(raw: Uint8Array, slot: number, hasMagic: boolean): number {
  const o = (hasMagic ? 2 : 0) + slot * 4 + 2;
  return raw[o] | (raw[o + 1] << 8);
}

export function parseEclHeader(raw: Uint8Array, dialect: EclDialect = ECL_GEN1): EclHeader {
  const m = dialect.hasMagic;
  return {
    magic: m ? raw[0] | (raw[1] << 8) : 0,
    vmRun1: farOffset(raw, 0, m),
    searchLocation: farOffset(raw, 1, m),
    preCampCheck: farOffset(raw, 2, m),
    campInterrupted: farOffset(raw, 3, m),
    eclInitialEntry: farOffset(raw, 4, m),
  };
}

/** Result of decoding exactly one instruction at a byte offset. */
export interface DecodeOne {
  /** The decoded instruction (absent only when `badOpcode`). */
  ins?: EclInstruction;
  /** Byte offset immediately after the decoded instruction. */
  next: number;
  /** Set when the opcode byte is not in the table. */
  badOpcode?: boolean;
  /** Set when the argument bytes ran past the end of the block. */
  truncated?: boolean;
}

/**
 * Decode the single instruction at `offset` (random access — used by both the linear
 * disassembler and the ECL VM, which jumps around via GOTO/GOSUB). Pure: never mutates.
 */
export function decodeInstructionAt(
  raw: Uint8Array,
  offset: number,
  vbase: number = ECL_VBASE,
  dialect?: EclDialect,
): DecodeOne {
  const start = offset;
  const opcode = raw[start];
  const def: OpcodeDef | undefined = dialect?.opcodeOverrides?.[opcode] ?? KRYNN_GEN1_OPCODES[opcode];
  if (!def) return { next: start, badOpcode: true };

  let pos = start + 1;
  const args: EclOpp[] = [];
  let truncated = false;

  // Read one EclOpp at `pos`, advancing past it (and, for code 0x80, past its inline 6-bit
  // packed string of `high` bytes). Returns false if the block ran out mid-operand.
  const readOpp = (): boolean => {
    if (pos >= raw.length) {
      truncated = true;
      return false;
    }
    const code = raw[pos];
    const high = raw[pos + 1] ?? 0;
    pos += 2;
    let val: number | undefined;
    let word: number;
    if (code === 1 || code === 2 || code === 3 || code === 0x81) {
      val = raw[pos] ?? 0;
      pos += 1;
      word = ((val << 8) | high) & 0xffff;
    } else {
      word = high;
    }
    let text: string | undefined;
    if (code === 0x80) {
      // Inline packed string: `high` bytes of 6-bit text follow the operand.
      text = decodeEclString(raw, pos, high);
      pos += high;
      if (pos > raw.length) truncated = true;
    }
    args.push({ code, high, ...(val !== undefined ? { val } : {}), word, kind: classify(code), ...(text !== undefined ? { text } : {}) });
    return !truncated;
  };

  // Per-dialect operand frames (Gen2 short LOAD_FILES/PARLAY, zero-operand PARTYSTRENGTH;
  // Gen1-short DoK/Savage/PoD frames) live on the dialect itself — see the EclDialect docs.
  const wordSet = dialect?.wordSetOverrides?.[opcode] ?? def.wordSet;

  // Fixed operands, then (for count-driven opcodes) `count` more variable operands — jump
  // targets (ON_GOTO/ON_GOSUB) or inline-string menu items (VERTICAL/HORIZONTAL_MENU).
  for (let i = 0; i < wordSet; i++) {
    if (!readOpp()) break;
  }
  if (!truncated && def.countAt !== undefined) {
    const count = args[def.countAt]?.word ?? 0;
    for (let i = 0; i < count; i++) {
      if (!readOpp()) break;
    }
  }
  if (!truncated && def.trailingBytes) {
    pos += def.trailingBytes;
    if (pos > raw.length) truncated = true;
  }

  const ins: EclInstruction = {
    offset: start,
    vaddr: vbase + start,
    opcode,
    mnemonic: def.mnemonic,
    args,
    size: pos - start,
    ...(def.uncertain ? { uncertain: true } : {}),
  };
  return { ins, next: pos, ...(truncated ? { truncated: true } : {}) };
}

/**
 * Disassemble one subroutine starting at `startOffset` (default: after the header),
 * stopping after the first `EXIT` (0x00) or at end-of-block. Returns the instruction
 * list and, if an undefined opcode is encountered, the offset where it stopped.
 */
export function disassembleSubroutine(
  raw: Uint8Array,
  startOffset: number = ECL_HEADER_LEN,
  dialect: EclDialect = ECL_GEN1,
): { instructions: EclInstruction[]; badOpcodeAt?: number } {
  const instructions: EclInstruction[] = [];
  let pos = startOffset;

  while (pos < raw.length) {
    const dec = decodeInstructionAt(raw, pos, dialect.vbase, dialect);
    if (dec.badOpcode) {
      return { instructions, badOpcodeAt: pos };
    }
    instructions.push(dec.ins!);
    pos = dec.next;
    if (dec.truncated || dec.ins!.opcode === 0x00 /* EXIT */) break;
  }

  return { instructions };
}

/** Parse the header and disassemble the main subroutine (from byte `dialect.headerLen`). */
export function disassembleEclBlock(raw: Uint8Array, dialect: EclDialect = ECL_GEN1): EclBlock {
  if (raw.length < dialect.headerLen) {
    throw new Error(`ECL block too small (${raw.length} bytes; need ≥ ${dialect.headerLen})`);
  }
  const header = parseEclHeader(raw, dialect);
  const { instructions, badOpcodeAt } = disassembleSubroutine(raw, dialect.headerLen, dialect);
  return { header, instructions, ...(badOpcodeAt !== undefined ? { badOpcodeAt } : {}) };
}

/** Render one operand to canonical text (diagnostics). */
export function formatOpp(a: EclOpp): string {
  switch (a.kind) {
    case 'imm':
      return `#${a.high}`;
    case 'word':
      return `0x${a.word.toString(16).padStart(4, '0')}`;
    case 'strref':
      return `str[${a.high}]`;
    case 'string':
      return `instr[${a.high}]`;
    case 'flag':
      return `f:${a.high}`;
    default:
      return `c${a.code}:${a.high}`;
  }
}

/** Render one instruction to canonical text (diagnostics / golden dumps). */
export function formatInstruction(ins: EclInstruction): string {
  const addr = `${ins.vaddr.toString(16).padStart(4, '0')}h`;
  const body = ins.args.map(formatOpp).join(', ');
  return `${addr}  ${ins.mnemonic}${body ? ' ' + body : ''}`;
}
