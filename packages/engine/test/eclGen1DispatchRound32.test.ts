/**
 * Round 32 R4 (`docs/engine/PLAN-ROUND-32.md`, `tools/map_gen1_ecl_dispatch.py`,
 * `docs/engine/research/{pools,gateway,treasures}-ecl-dispatch-map.md`): pins the corpus effect of
 * every dialect literal edit this round made to `ECL_GEN1_SHORT_GATEWAY` and
 * `ECL_GEN1_SHORT_TREASURES` on the titles' own real retail ECL corpora, against the PRE-edit
 * literal reconstructed here byte-for-byte (the same "PRE_R6_BUCK"-style pinning convention
 * `buckEclDialect.test.ts` already uses) — so a regression in either edit shows up as a census
 * change, not just a missing override.
 *
 * Consumers of these two dialects: `apps/web/src/ui/gameData.ts` routes `?explore=gateway`,
 * `gateway-natural`, `gateway-amiga`, `gateway-quest` (`eclDialect: 'gen1-short-gateway'`) and
 * `?explore=treasures`, `treasures-natural`, `treasures-town` (`eclDialect: 'gen1-short-treasures'`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import {
  disassembleEclBlock,
  ECL_GEN1_SHORT_GATEWAY,
  ECL_GEN1_SHORT_POOLS,
  ECL_GEN1_SHORT_TREASURES,
  type EclDialect,
} from '../src/ecl/disassemble.js';
import { FIND_CHARACTER_MNEMONICS } from '../src/ecl/vm.js';
import { KRYNN_GEN1_OPCODES } from '../src/ecl/opcodes.js';

const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';
const POOLS_FILES = [`${GOG}/Pools of Darkness/ECL1.DAX`];
const GATEWAY_FILES = [2, 3, 4, 5, 6].map((n) => `${GOG}/Gateway to the Savage Frontier/ECL${n}.DAX`);
const TREASURES_FILES = [`${GOG}/Treasures of the Savage Frontier/ECL1.DAX`];

const HAVE_POOLS = existsSync(POOLS_FILES[0]);
const HAVE_GATEWAY = existsSync(GATEWAY_FILES[0]);
const HAVE_TREASURES = existsSync(TREASURES_FILES[0]);

/** The Gateway dialect literal exactly as it stood before round 32 R4 -- used ONLY to pin the
 * before/after census delta as executable data, not imported from disassemble.ts (that state no
 * longer exists there). */
const PRE_R4_GATEWAY: EclDialect = {
  headerLen: 22,
  vbase: 0x7ffe,
  hasMagic: true,
  wordSetOverrides: { 0x1d: 0, 0x22: 0, 0x2c: 1 },
};

/** Treasures' dialect literal exactly as it stood before round 32 R4 (only the 0x21/0x42
 * overrides this round found already correct; none of 0x1f/0x37/0x41/0x43/0x44 were claimed). */
const PRE_R4_TREASURES: EclDialect = {
  headerLen: 22,
  vbase: 0x7ffe,
  hasMagic: true,
  wordSetOverrides: { 0x0c: 4, 0x1d: 0, 0x22: 0, 0x23: 0, 0x2c: 1, 0x21: 2 },
  opcodeOverrides: {
    0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' },
    0x42: { wordSet: 4, mnemonic: 'LOAD_AREA_PIECES' },
  },
  cellDescAddr: 0x002d,
  facingAddr: 0x0011,
};

function loadBlocks(files: string[]): { file: string; blockId: number; raw: Uint8Array }[] {
  const blocks: { file: string; blockId: number; raw: Uint8Array }[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const bytes = new Uint8Array(readFileSync(file));
    for (const b of readDaxDataBlocks(bytes)) blocks.push({ file, blockId: b.blockId, raw: b.raw });
  }
  return blocks;
}

interface Census {
  desync: number;
  cleanExit: number;
  other: number;
  desyncSample: string[];
}

function census(blocks: { file: string; blockId: number; raw: Uint8Array }[], dialect: EclDialect): Census {
  let desync = 0;
  let cleanExit = 0;
  let other = 0;
  const desyncSample: string[] = [];
  for (const b of blocks) {
    const disasm = disassembleEclBlock(b.raw, dialect);
    if (disasm.badOpcodeAt !== undefined) {
      desync++;
      desyncSample.push(`${b.file.split('/').pop()}#${b.blockId}@0x${disasm.badOpcodeAt.toString(16)}`);
    } else if (disasm.instructions[disasm.instructions.length - 1]?.mnemonic === 'EXIT') {
      cleanExit++;
    } else {
      other++;
    }
  }
  return { desync, cleanExit, other, desyncSample };
}

/** Count reachable instances of one opcode across a block list under `dialect` (shallow walker
 * -- see the "under-walks" caveat on every describe block below). Kept separate from `Census`
 * so existing exact-`toEqual` pins against that shape are untouched by round-33 R2's additions. */
function countOpcode(blocks: { file: string; blockId: number; raw: Uint8Array }[], dialect: EclDialect, opcode: number): number {
  let n = 0;
  for (const b of blocks) {
    for (const ins of disassembleEclBlock(b.raw, dialect).instructions) {
      if (ins.opcode === opcode) n++;
    }
  }
  return n;
}

describe.skipIf(!HAVE_GATEWAY)('ECL_GEN1_SHORT_GATEWAY round 32 R4 corpus effect (0x1d/0x22/0x2c/0x32/0x40/0x41)', () => {
  it('the real Gateway retail corpus is exactly 26 blocks across ECL2..6.DAX', () => {
    expect(loadBlocks(GATEWAY_FILES).length).toBe(26);
  });

  it('0x41 is no longer "unclaimed": round 34 put it in the BASE table, so the pre-edit dialect now decodes clean and the Gateway override is SUBSUMED, not needed', () => {
    // CHANGED 2026-09-04 (round 34 Phase B). This test used to assert that stripping Gateway's
    // overrides re-broke ECL5.DAX#99@0x428 on an "unclaimed" 0x41. Round 34 R1 measured 0x41 as
    // a REAL shared Gen1 opcode (wordSet 2) and put it in KRYNN_GEN1_OPCODES itself, so the base
    // table now claims it and PRE_R4_GATEWAY decodes all 26 blocks clean.
    //
    // That is a finding, not a broken test: Gateway's round-32 per-title override and round 34's
    // base-table entry were derived independently, from different binaries, by different methods,
    // and they AGREE on wordSet 2. So do Treasures', Pools', Buck's, Matrix's and DQK Gen2's own
    // 0x41 entries -- seven independent derivations, one answer.
    const blocks = loadBlocks(GATEWAY_FILES);
    const before = census(blocks, PRE_R4_GATEWAY);
    expect(before).toEqual({ desync: 0, cleanExit: 26, other: 0, desyncSample: [] });
    // The override is redundant with the base entry rather than in conflict with it. Pin BOTH
    // halves, so a future divergence between them fails here instead of passing silently.
    expect(ECL_GEN1_SHORT_GATEWAY.opcodeOverrides?.[0x41]?.wordSet).toBe(2);
    expect(KRYNN_GEN1_OPCODES[0x41]?.wordSet).toBe(2);
  });

  it('the round 32 R4 dialect (binary-measured 0x1D:1/0x22:2/0x2C:6/0x32:4/0x40:4, 0x41 modelled) resolves that block clean, with nothing at stake for 0x1D/0x22/0x2C/0x32/0x40', () => {
    const blocks = loadBlocks(GATEWAY_FILES);
    const after = census(blocks, ECL_GEN1_SHORT_GATEWAY);
    expect(after).toEqual({ desync: 0, cleanExit: 26, other: 0, desyncSample: [] });
    // The null for "0x1D/0x22/0x2C/0x32/0x40 corrections were free, not decided by this corpus":
    // none of the five is ever reached under EITHER dialect on this 26-block corpus.
    const watch = [0x1d, 0x22, 0x2c, 0x32, 0x40];
    const reachBefore: Record<number, number> = {};
    const reachAfter: Record<number, number> = {};
    for (const op of watch) {
      reachBefore[op] = 0;
      reachAfter[op] = 0;
    }
    for (const b of blocks) {
      for (const dis of [
        { dialect: PRE_R4_GATEWAY, counts: reachBefore },
        { dialect: ECL_GEN1_SHORT_GATEWAY, counts: reachAfter },
      ]) {
        for (const ins of disassembleEclBlock(b.raw, dis.dialect).instructions) {
          if (watch.includes(ins.opcode)) dis.counts[ins.opcode]++;
        }
      }
    }
    expect(reachBefore).toEqual({ 0x1d: 0, 0x22: 0, 0x2c: 0, 0x32: 0, 0x40: 0 });
    expect(reachAfter).toEqual({ 0x1d: 0, 0x22: 0, 0x2c: 0, 0x32: 0, 0x40: 0 });
  });

  it('mutation: this probe can still fail -- giving 0x41 the WRONG operand count desyncs the same block 9 bytes downstream', () => {
    // RE-ARMED 2026-09-04 (round 34 Phase B). Emptying `opcodeOverrides` no longer breaks
    // anything now that the base table claims 0x41, so the old mutation had quietly become a
    // probe that could not fail -- the precise failure mode this repo has a standing rule about.
    // The mutation is therefore a WRONG VALUE (wordSet 1) rather than an ABSENT one, which still
    // reproduces a desync in the same block -- at 0x431 rather than the original 0x428, because
    // wordSet 1 consumes one word before the stream misparses, where an ABSENT entry failed on the
    // 0x41 byte itself. Nine bytes downstream, same block, same cause: pinned as measured rather
    // than as 'the same site', which is what it is not.
    const blocks = loadBlocks(GATEWAY_FILES);
    const mutated: EclDialect = {
      ...ECL_GEN1_SHORT_GATEWAY,
      opcodeOverrides: { 0x41: { wordSet: 1, mnemonic: 'WRONG_ON_PURPOSE' } },
    };
    const result = census(blocks, mutated);
    expect(result.desync).toBe(1);
    expect(result.desyncSample).toEqual(['ECL5.DAX#99@0x431']);
  });
});

describe.skipIf(!HAVE_TREASURES)('ECL_GEN1_SHORT_TREASURES round 32 R4 additions (0x1f/0x41/0x43/0x44): null corpus effect, binary-only evidence -- and the 0x37 UN-RETRACTION', () => {
  it('the real Treasures retail corpus is exactly 30 blocks in ECL1.DAX', () => {
    expect(loadBlocks(TREASURES_FILES).length).toBe(30);
  });

  it("0x37 IS shipped as { wordSet: 2, mnemonic: 'TREASURES_FIND_CHARACTER' }: round 32 proposed it from Treasures' own handler at GAME.OVR file 0x2577, then retracted it when the real VM crashed reaching it from ECL1.DAX blocks 19/33/38/40/51 -- but that bisection toggled 0x37 while holding 0x27 at its OWN wrong base frame (wordSet 8), so it was never a clean single-variable test. With 0x27 corrected to { wordSet: 4, countAt: 3 } this round, the same 0x37 override runs the same blocks green and produces 0 deep desync sites across all 30 (packages/engine/test/eclReachability.test.ts). The retraction is retracted.", () => {
    expect(ECL_GEN1_SHORT_TREASURES.opcodeOverrides?.[0x37]).toEqual({
      wordSet: 2,
      mnemonic: 'TREASURES_FIND_CHARACTER',
    });
  });

  it('the shipped 0x37 mnemonic is one the VM actually branches on -- the failure mode that made this look falsified a second time', () => {
    // While shipping this override, naming it `TREASURES_FIND_CHARACTER` without teaching `vm.ts`
    // the name reproduced round 32's exact crash signature ("Cannot read properties of undefined
    // (reading 'code')" in `EclVm.rvalue`), because `case 0x37` fell through to the inherited
    // three-operand `loadPieces` path and read a third operand a two-operand frame never decoded.
    // That is a mnemonic-plumbing bug wearing a falsification's clothes, and it is exactly what a
    // reader would conclude from the crash alone. `vm.ts` now keys on a SET of mnemonics, so this
    // pins the shipped name against that set rather than against one hard-coded string.
    expect(FIND_CHARACTER_MNEMONICS.has(ECL_GEN1_SHORT_TREASURES.opcodeOverrides![0x37]!.mnemonic)).toBe(true);
    expect(FIND_CHARACTER_MNEMONICS.has(ECL_GEN1_SHORT_POOLS.opcodeOverrides![0x37]!.mnemonic)).toBe(true);
    // ...and the two titles keep their own labels rather than one borrowing the other's.
    expect(ECL_GEN1_SHORT_TREASURES.opcodeOverrides![0x37]!.mnemonic).not.toBe(
      ECL_GEN1_SHORT_POOLS.opcodeOverrides![0x37]!.mnemonic,
    );
  });

  it('none of the four SHIPPED additions is reachable in the real corpus under either dialect (the corpus is silent, only the binary decided) -- this is a materially weaker guarantee than for 0x42, which real combat/quest execution DOES reach (see treasuresLoadArea42.test.ts); the 0x37 retraction above is why that gap matters', () => {
    const blocks = loadBlocks(TREASURES_FILES);
    const watch = [0x1f, 0x41, 0x43, 0x44];
    const before: Record<number, number> = {};
    const after: Record<number, number> = {};
    for (const op of watch) {
      before[op] = 0;
      after[op] = 0;
    }
    for (const b of blocks) {
      for (const ins of disassembleEclBlock(b.raw, PRE_R4_TREASURES).instructions) {
        if (watch.includes(ins.opcode)) before[ins.opcode]++;
      }
      for (const ins of disassembleEclBlock(b.raw, ECL_GEN1_SHORT_TREASURES).instructions) {
        if (watch.includes(ins.opcode)) after[ins.opcode]++;
      }
    }
    expect(before).toEqual({ 0x1f: 0, 0x41: 0, 0x43: 0, 0x44: 0 });
    expect(after).toEqual({ 0x1f: 0, 0x41: 0, 0x43: 0, 0x44: 0 });
  });

  it('census is byte-identical before and after (0 desync, 30 clean EXIT both ways) -- the additions cost the corpus nothing either way', () => {
    const blocks = loadBlocks(TREASURES_FILES);
    const before = census(blocks, PRE_R4_TREASURES);
    const after = census(blocks, ECL_GEN1_SHORT_TREASURES);
    expect(before).toEqual({ desync: 0, cleanExit: 30, other: 0, desyncSample: [] });
    expect(after).toEqual({ desync: 0, cleanExit: 30, other: 0, desyncSample: [] });
  });
});

describe.skipIf(!HAVE_POOLS)('Pools opcode 0x27 TREASURE: round 32 measured it and withheld it; round 33 Phase B shipped it', () => {
  it('a flat wordSet:4 override would improve but not clear the real 56-block census (3 -> 1 desync), consistent with a countAt-shaped tail this dialect cannot represent', () => {
    // Written in round 32 to pin the DECISION not to edit ECL_GEN1_SHORT_POOLS's 0x27, and kept
    // verbatim now that round 33 Phase B has shipped the countAt frame instead: its point survives
    // the reversal unchanged, because it measures a FLAT wordSet:4 override -- the incomplete fix
    // -- and shows it leaves 1 desync rather than 0. It is built entirely from dialect literals
    // local to this file, so it goes on measuring the flat frame no matter what the shipped
    // dialect carries. That independence is the reason it is still here.
    const bytes = new Uint8Array(readFileSync(POOLS_FILES[0]));
    const blocks = readDaxDataBlocks(bytes).map((b) => ({ file: 'ECL1.DAX', blockId: b.blockId, raw: b.raw }));
    expect(blocks.length).toBe(56);
    const base: EclDialect = {
      headerLen: 22,
      vbase: 0x7ffe,
      hasMagic: true,
      wordSetOverrides: { 0x0c: 4, 0x1d: 0, 0x22: 0, 0x23: 0, 0x2c: 1, 0x1f: 1, 0x21: 2 },
      opcodeOverrides: {
        0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' },
        0x37: { wordSet: 2, mnemonic: 'POOLS_FIND_CHARACTER' },
        0x41: { wordSet: 2, mnemonic: 'POOLS_AWARD_XP' },
      },
      cellDescAddr: 0x002d,
      lastBlockIdAddr: 0x0016,
    };
    const flatFix: EclDialect = { ...base, wordSetOverrides: { ...base.wordSetOverrides, 0x27: 4 } };
    const before = census(blocks, base);
    const afterFlatFix = census(blocks, flatFix);
    expect(before.desync).toBe(3);
    expect(afterFlatFix.desync).toBe(1);
    expect(afterFlatFix.desyncSample).toEqual(['ECL1.DAX#49@0x698']);
  });

  /**
   * Round 33 R2 (`docs/engine/PLAN-ROUND-33.md`): both handlers (Pools `GAME.OVR:0x1626`,
   * Treasures `GAME.OVR:0x1afd`) transcribe as `wordSet: 4, countAt: 3` -- the SAME shape
   * `ECL_GEN2` already ships for `0x27`. The plan's own prediction was that swapping Pools'
   * (unshipped) `flat4` fix for a `countAt: 3` reading would take the shallow 56-block census
   * from `{desync: 1}` to `{desync: 0}`. MEASURED: it does not -- `countAt: 3` census is
   * `{desync: 1}`, IDENTICAL to `flat4`, because the one remaining desync
   * (`ECL1.DAX#49@0x698`) is caused by an UNRELATED opcode: the instruction immediately before
   * it is `0x678 ENCOUNTER_MENU (0x29)`, base `wordSet: 14` and unmeasured/"vacuous" in this
   * dialect -- `0x27` is not involved in this block at all. Both numbers are reported per the
   * "replace the null, report both" rule; the plan's `{desync: 0}` prediction is FALSE.
   *
   * SHIPPED after all, in round 33 Phase B, and the reason R2 withheld it is worth keeping.
   * R2 was told the four route goldens it would turn red were the oracle, so it stopped. They
   * were not: `poolsMiddleRoute.test.ts`'s own header says its expectations were generated by the
   * very VM under test, and `treasuresQuestFlag.test.ts` pinned `status === 'halted'` while its
   * own comment named the cause as the disclosed TREASURE/bad-opcode gap at 0xA1B6. A golden
   * produced by the code under test cannot adjudicate that code. The four were regenerated.
   *
   * What did NOT change is the measurement in this docblock: the plan's `{desync: 0}` prediction
   * is still false, and `ECL1.DAX#49@0x698` is still an unrelated `0x29` problem. Shipping the
   * frame was justified by the two retail handlers, by R1's execution-coverage oracle (12
   * executed-but-unreached Pools offsets going to 0), and by Treasures' deep desync count going
   * 14 -> 0 -- not by this shallow census, which the plan wrongly expected to move.
   */
  it('shallow-census triple base8/flat4/countAt3: countAt3 does NOT clear the desync the plan predicted (both stay 1, root cause is unrelated opcode 0x29)', () => {
    const bytes = new Uint8Array(readFileSync(POOLS_FILES[0]));
    const blocks = readDaxDataBlocks(bytes).map((b) => ({ file: 'ECL1.DAX', blockId: b.blockId, raw: b.raw }));
    const base: EclDialect = {
      headerLen: 22,
      vbase: 0x7ffe,
      hasMagic: true,
      wordSetOverrides: { 0x0c: 4, 0x1d: 0, 0x22: 0, 0x23: 0, 0x2c: 1, 0x1f: 1, 0x21: 2 },
      opcodeOverrides: {
        0x31: { wordSet: 2, countAt: 1, mnemonic: 'SHORT_MENU' },
        0x37: { wordSet: 2, mnemonic: 'POOLS_FIND_CHARACTER' },
        0x41: { wordSet: 2, mnemonic: 'POOLS_AWARD_XP' },
      },
      cellDescAddr: 0x002d,
      lastBlockIdAddr: 0x0016,
    };
    const flat4: EclDialect = { ...base, wordSetOverrides: { ...base.wordSetOverrides, 0x27: 4 } };
    const countAt3: EclDialect = {
      ...base,
      opcodeOverrides: { ...base.opcodeOverrides, 0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' } },
    };

    const base8Census = census(blocks, base);
    const flat4Census = census(blocks, flat4);
    const countAt3Census = census(blocks, countAt3);
    expect({ desync: base8Census.desync, count27: countOpcode(blocks, base, 0x27) }).toEqual({ desync: 3, count27: 6 });
    expect({ desync: flat4Census.desync, count27: countOpcode(blocks, flat4, 0x27) }).toEqual({ desync: 1, count27: 5 });
    // The plan predicted {desync: 0} here; measured is {desync: 1}, same as flat4.
    expect({ desync: countAt3Census.desync, count27: countOpcode(blocks, countAt3, 0x27) }).toEqual({ desync: 1, count27: 8 });
    expect(countAt3Census.desyncSample).toEqual(['ECL1.DAX#49@0x698']);

    // Root cause of the surviving desync: opcode 0x29 (ENCOUNTER_MENU), not 0x27.
    const block49 = blocks.find((b) => b.blockId === 49)!;
    const disasm = disassembleEclBlock(block49.raw, countAt3);
    expect(disasm.badOpcodeAt).toBe(0x698);
    const before29 = disasm.instructions[disasm.instructions.length - 1];
    expect(before29?.opcode).toBe(0x29);
    expect(before29?.mnemonic).toBe('ENCOUNTER_MENU');

    // Site classification: all 8 reachable sites' 4th operand (the count) is code 0x00
    // (immediate) -- 0/8 memory-coded -- and 7/8 have a non-zero tail (only
    // ECL1.DAX#42@0x33a has tail 0). This is the discriminating case for shipping countAt3 at
    // all: a non-zero tail on a named block IS separation from flat4 (which truncates the tail
    // outright), even though it does not change the desync count.
    const siteTails = new Map<string, number>();
    for (const b of blocks) {
      for (const ins of disassembleEclBlock(b.raw, countAt3).instructions) {
        if (ins.opcode !== 0x27) continue;
        expect(ins.args[3]?.code).toBe(0x00); // immediate, never memory
        siteTails.set(`${b.blockId}@0x${ins.offset.toString(16)}`, Math.max(0, ins.args.length - 4));
      }
    }
    expect(siteTails).toEqual(new Map([
      ['18@0x2b9', 5],
      ['18@0xdfd', 1],
      ['41@0x407', 3],
      ['42@0x33a', 0],
      ['55@0x11d4', 1],
      ['77@0x47e', 4],
      ['77@0x59a', 2],
      ['77@0x859', 5],
    ]));
    const nonZeroTails = [...siteTails.values()].filter((n) => n > 0).length;
    expect(nonZeroTails).toBe(7);
  });
});

/**
 * Round 33 R2: Treasures' `0x27` handler (`GAME.OVR:0x1afd`) is structurally IDENTICAL to
 * Pools' (same prologue, same 4-op prefetch, same 3x rvalue-accumulate, same count-driven
 * second prefetch, same 0xff-sentinel item-table loop shape -- differing only in constant
 * addresses). But Treasures' real ECL1.DAX corpus (30 blocks) reaches ZERO `0x27` sites under
 * the shallow walker in ANY of the three framings -- the corpus is silent here, exactly as
 * round 32 R4 found for `0x37`. Per the plan's own fallback clause: "if no tail is non-zero say
 * the corpus cannot discriminate" -- there ARE no tails at all to inspect, so the shallow
 * corpus cannot discriminate base8/flat4/countAt3 for Treasures. The frame rests entirely on
 * the handler transcription (see disassemble.ts's `ECL_GEN1_SHORT_TREASURES` doc comment), not
 * on any corpus evidence -- a materially weaker basis than Pools' 7/8-non-zero-tail result.
 */
describe.skipIf(!HAVE_TREASURES)('Treasures opcode 0x27 TREASURE: shallow corpus is silent -- cannot discriminate', () => {
  it('base8/flat4/countAt3 are byte-identical on the real 30-block corpus: 0 reachable 0x27 sites under any framing', () => {
    const bytes = new Uint8Array(readFileSync(TREASURES_FILES[0]));
    const blocks = readDaxDataBlocks(bytes).map((b) => ({ file: 'ECL1.DAX', blockId: b.blockId, raw: b.raw }));
    expect(blocks.length).toBe(30);
    const base8 = ECL_GEN1_SHORT_TREASURES; // no 0x27 override -> base wordSet 8
    const flat4: EclDialect = { ...base8, wordSetOverrides: { ...base8.wordSetOverrides, 0x27: 4 } };
    const countAt3: EclDialect = {
      ...base8,
      opcodeOverrides: { ...base8.opcodeOverrides, 0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' } },
    };
    for (const dialect of [base8, flat4, countAt3]) {
      const c = census(blocks, dialect);
      expect(c).toEqual({ desync: 0, cleanExit: 30, other: 0, desyncSample: [] });
      expect(countOpcode(blocks, dialect, 0x27)).toBe(0);
    }
  });
});
