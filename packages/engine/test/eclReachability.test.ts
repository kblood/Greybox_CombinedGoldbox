/**
 * R1 (round 33): pins `walkEclReachable` (packages/engine/src/ecl/reachability.ts) against
 * synthetic unit fixtures for every rule, the round-32 `0x37` positive control, a VM oracle over
 * the Pools and Treasures corpora, and a shallow-vs-deep census across every dialect this repo
 * pins. See docs/engine/research/ecl-census-reachability.md for the write-up.
 *
 * SUBSTITUTION DISCLOSED (ground rule 2 — the plan's own null must be measured, not inherited):
 * the plan's scope item 2 says "reuse the harness those test files build" (treasuresQuestFlag.
 * test.ts / treasuresEndingRoute.test.ts and their Pools siblings). Those files build one
 * hand-scripted route each (specific memory seeds, specific cell walks) and export nothing
 * reusable — there is no harness function to import without editing them, which the plan
 * forbids. The oracle below instead drives a bare `EclVm` to completion from ALL FIVE header
 * entry points (not just `eclInitialEntry`) across EVERY block of the real `ECL1.DAX` corpus for
 * each title, with no scripted memory. This is a different, disclosed harness: it cannot reach
 * memory-gated content deep inside a script (e.g. the FREEZEFIRE encounter reached only after the
 * party is loaded onto a specific overland cell), but it does exercise `search_location`'s own
 * per-descriptor `ON_GOTO` dispatch and `vmRun1`'s own guard chains — code the shallow walker
 * never sees at all. The positive control below is the literal round-32 falsification (the
 * `0x37` override under `ECL_GEN1_SHORT_TREASURES`), which IS reproduced exactly as the plan
 * describes it, static-only, no VM run required for that part.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { decodeEclGlb } from '../src/loaders/eclGlb.js';
import { EclVm } from '../src/ecl/vm.js';
import {
  disassembleEclBlock,
  parseEclHeader,
  ECL_GEN1,
  ECL_POOL,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_DOK,
  ECL_GEN1_SHORT_GATEWAY,
  ECL_GEN1_SHORT_TREASURES,
  ECL_GEN1_SHORT_POOLS,
  ECL_GEN1_BUCK,
  ECL_GEN1_MATRIX,
  ECL_GEN2,
  type EclDialect,
} from '../src/ecl/disassemble.js';
import { walkEclReachable } from '../src/ecl/reachability.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

// ---------------------------------------------------------------------------------------------
// Synthetic block builder (Gen1 header: 2-byte 0x1388 magic + five 4-byte far pointers, code from
// byte 22 = vaddr 0x8014). Body bytes are placed at absolute OFFSETS (not body-relative indices)
// via `put`, matching how the doc comments below quote them.
// ---------------------------------------------------------------------------------------------
const VBASE = ECL_GEN1.vbase; // 0x7ffe
const HLEN = ECL_GEN1.headerLen; // 22
const vaddrOf = (offset: number) => VBASE + offset;

function farPointer(vaddr: number): number[] {
  return [0x01, 0x01, vaddr & 0xff, (vaddr >> 8) & 0xff];
}

interface EntryOverrides {
  vmRun1?: number;
  searchLocation?: number;
  preCampCheck?: number;
  campInterrupted?: number;
  eclInitialEntry?: number;
}

/** Build a synthetic Gen1 block. Unlisted entries default to vaddr 0 (out-of-block, inert);
 * `eclInitialEntry` defaults to 0x8014 (offset {@link HLEN}) unless overridden. `size` pads the
 * body with zero bytes to at least this many total raw bytes. */
function buildBlock(size: number, entries: EntryOverrides = {}): { raw: Uint8Array; put: (offset: number, bytes: number[]) => void } {
  const e = {
    vmRun1: entries.vmRun1 ?? 0,
    searchLocation: entries.searchLocation ?? 0,
    preCampCheck: entries.preCampCheck ?? 0,
    campInterrupted: entries.campInterrupted ?? 0,
    eclInitialEntry: entries.eclInitialEntry ?? vaddrOf(HLEN),
  };
  const header = [
    0x88,
    0x13,
    ...farPointer(e.vmRun1),
    ...farPointer(e.searchLocation),
    ...farPointer(e.preCampCheck),
    ...farPointer(e.campInterrupted),
    ...farPointer(e.eclInitialEntry),
  ];
  const raw = new Uint8Array(Math.max(size, header.length));
  raw.set(header, 0);
  const put = (offset: number, bytes: number[]) => {
    for (let i = 0; i < bytes.length; i++) raw[offset + i] = bytes[i];
  };
  return { raw, put };
}

/** 3-byte EclOpp form (code ∈ {1,2,3,0x81}): `(code, low, high)` decodes to word `w`. */
function wordOp(code: 1 | 2 | 3, w: number): number[] {
  return [code, w & 0xff, (w >> 8) & 0xff];
}
/** 2-byte EclOpp form (code 0x00 imm): word = the single data byte (0..255). */
function immOp(v: number): number[] {
  return [0x00, v & 0xff];
}

// ---------------------------------------------------------------------------------------------
// Unit tests — one per walker rule.
// ---------------------------------------------------------------------------------------------
describe('walkEclReachable — synthetic rule unit tests', () => {
  it('IF_* keeps a guarded GOTO\'s not-taken fall-through live (and the taken target)', () => {
    // 22: IF_EQ (0x16)                        -- guards the next instruction
    // 23: GOTO -> 30 (4 bytes: 23..26)         -- the guarded instruction; "taken" branch
    // 27: EXIT                                 -- not-taken fall-through (right after GOTO)
    // 30: EXIT                                 -- GOTO's own target
    const { raw, put } = buildBlock(31);
    put(22, [0x16]);
    put(23, [0x01, ...wordOp(1, vaddrOf(30))]);
    put(27, [0x00]);
    put(30, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22, 23, 27, 30]);
    expect(result.desyncSites).toEqual([]);
  });

  it('mutation hook: disabling the IF-guard fall-through rule drops the not-taken offset', () => {
    const { raw, put } = buildBlock(31);
    put(22, [0x16]);
    put(23, [0x01, ...wordOp(1, vaddrOf(30))]);
    put(27, [0x00]);
    put(30, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1, { disableIfGuardFallthrough: true });
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22, 23, 30]);
    expect(result.reachableOffsets.has(27)).toBe(false);
  });

  it('an unguarded GOTO ends the path: only its target is enqueued, never its own fall-through', () => {
    // 22: GOTO -> 26 (4 bytes: 22..25)
    // 26: EXIT (target)
    // 27: PRINT_RETURN -- must NEVER be reached (no fall-through past an unguarded GOTO)
    const { raw, put } = buildBlock(28);
    put(22, [0x01, ...wordOp(1, vaddrOf(26))]);
    put(26, [0x00]);
    put(27, [0x33]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22, 26]);
    expect(result.reachableOffsets.has(27)).toBe(false);
  });

  it('GOSUB enqueues its target AND continues at the fall-through', () => {
    // 22: GOSUB -> 28 (4 bytes: 22..25)
    // 26: EXIT (fall-through)
    // 28: EXIT (target)
    const { raw, put } = buildBlock(29);
    put(22, [0x02, ...wordOp(1, vaddrOf(28))]);
    put(26, [0x00]);
    put(28, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22, 26, 28]);
  });

  it('ON_GOTO enqueues every target and ends the path (no fall-through)', () => {
    // 22: ON_GOTO selector=5, count=2, target0=40, target1=45 (1+2+2+3+3 = 11 bytes: 22..32)
    // 33: PRINT_RETURN -- must NEVER be reached (ON_GOTO has no fall-through)
    // 40: EXIT (target0)
    // 45: EXIT (target1)
    const { raw, put } = buildBlock(46);
    put(22, [0x25, ...immOp(5), ...immOp(2), ...wordOp(1, vaddrOf(40)), ...wordOp(1, vaddrOf(45))]);
    put(33, [0x33]);
    put(40, [0x00]);
    put(45, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22, 40, 45]);
    expect(result.reachableOffsets.has(33)).toBe(false);
  });

  it('ON_GOSUB enqueues every target AND continues at the fall-through', () => {
    // 22: ON_GOSUB selector=1, count=1, target0=40 (1+2+2+3 = 8 bytes: 22..29)
    // 30: EXIT (fall-through)
    // 40: EXIT (target0)
    const { raw, put } = buildBlock(41);
    put(22, [0x26, ...immOp(1), ...immOp(1), ...wordOp(1, vaddrOf(40))]);
    put(30, [0x00]);
    put(40, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22, 30, 40]);
  });

  it('a bad opcode records a desync site with the path that reached it', () => {
    const { raw, put } = buildBlock(23);
    put(22, [0xff]); // not in KRYNN_GEN1_OPCODES (dense only over 0x00..0x40)
    const result = walkEclReachable(raw, ECL_GEN1);
    expect(result.reachableOffsets.size).toBe(0);
    expect(result.desyncSites).toHaveLength(1);
    expect(result.desyncSites[0].offset).toBe(22);
    expect(result.desyncSites[0].entries).toEqual(['eclInitialEntry']);
    expect(result.desyncSites[0].path).toEqual(['eclInitialEntry']);
  });

  it('an out-of-block jump target is recorded as misaligned, not followed', () => {
    // GOTO -> vaddr 0xFFFF, which resolves to offset 0xFFFF - 0x7FFE = 0x8001, far past raw.length.
    const { raw, put } = buildBlock(26);
    put(22, [0x01, ...wordOp(1, 0xffff)]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect(result.reachableOffsets.has(22)).toBe(true);
    const misaligned = result.misalignedTargets.find((m) => m.reason === 'out-of-block' && m.target === 0x8001);
    expect(misaligned).toBeDefined();
    expect(result.desyncSites).toEqual([]); // out-of-block is misaligned, never a desync
  });

  it('a target landing mid-instruction is recorded as misaligned, even when discovered by a DIFFERENT entry point (the shared, ascending-order worklist catches it)', () => {
    // eclInitialEntry -> 22: GOTO -> 30 (4 bytes: 22..25); 30: EXIT.
    // vmRun1 -> 23, i.e. exactly the SECOND byte of that same GOTO's own operand bytes.
    // Ascending-offset processing decides offset 22 (size 4) before offset 23 is ever popped,
    // regardless of which array position each entry started at, so the collision is caught.
    const { raw, put } = buildBlock(31, { vmRun1: vaddrOf(23) });
    put(22, [0x01, ...wordOp(1, vaddrOf(30))]);
    put(30, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22, 30]);
    const hit = result.misalignedTargets.find((m) => m.reason === 'mid-instruction' && m.target === 23);
    expect(hit).toBeDefined();
    expect(hit?.entries).toEqual(['vmRun1']);
    expect(result.coverageByEntry.vmRun1).toBe(0);
    expect(result.coverageByEntry.eclInitialEntry).toBe(2);
  });

  it('mutation hook applied to a real desync: breaking ON_GOTO target enumeration (simulated by truncating count to 0) drops both targets from reachable, i.e. the enumeration rule is load-bearing', () => {
    // Same fixture as the ON_GOTO unit test above; this test just re-demonstrates load-bearing-ness
    // by constructing the "broken" input directly (count=0) rather than editing the walker, since
    // the walker's own ON_GOTO loop has no separate toggle — see the report for the actual
    // source-level mutation (temporarily forcing the loop bound to 0) and its RED output.
    const { raw, put } = buildBlock(46);
    put(22, [0x25, ...immOp(5), ...immOp(0), ...wordOp(1, vaddrOf(40)), ...wordOp(1, vaddrOf(45))]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect([...result.reachableOffsets].sort((a, b) => a - b)).toEqual([22]);
  });
});

// ---------------------------------------------------------------------------------------------
// Positive control (round-32's falsified Treasures 0x37 override, reproduced statically).
// ---------------------------------------------------------------------------------------------
const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';
const TREASURES_ECL1 = `${GOG}/Treasures of the Savage Frontier/ECL1.DAX`;
const POOLS_ECL1 = `${GOG}/Pools of Darkness/ECL1.DAX`;
const HAVE_TREASURES = existsSync(TREASURES_ECL1);
const HAVE_POOLS = existsSync(POOLS_ECL1);

const TREASURES_0X37_OVERRIDE: EclDialect = {
  ...ECL_GEN1_SHORT_TREASURES,
  opcodeOverrides: {
    ...ECL_GEN1_SHORT_TREASURES.opcodeOverrides,
    // This is the exact override round 32 proposed and retracted after the real VM crashed
    // reaching it from ECL1.DAX blocks 19/33/38/40/51 -- and which round 33 Phase B shipped for
    // real once `0x27`'s frame stopped interfering. It is still built as a separate literal rather
    // than aliased to the shipped dialect, so that this measurement keeps being able to disagree
    // with it. The mnemonic is deliberately NOT one of `vm.ts`'s `FIND_CHARACTER_MNEMONICS`: this
    // is a static decode measurement and giving it the live mnemonic would quietly change which
    // VM branch a future reader of this fixture exercises.
    0x37: { wordSet: 2, mnemonic: 'TEST_LOCAL_TREASURES_FIND_CHARACTER' },
  },
};

describe.skipIf(!HAVE_TREASURES)('positive control — Treasures 0x37 override (round-32 falsification, reproduced statically)', () => {
  it('the corpus is 30 blocks (precondition — every other number here assumes this)', () => {
    const blocks = readDaxDataBlocks(new Uint8Array(readFileSync(TREASURES_ECL1)));
    expect(blocks.length).toBe(30);
  });

  it('positive control: a KNOWN-WRONG 0x27 frame is flagged by the deep walker and invisible to the shallow one', () => {
    // REBUILT 2026-09-04 (round 33 Phase B), and the reason is the whole point of this file.
    //
    // R1 built this control on round 32's `0x37 -> {wordSet: 2}` "falsification", asserting that
    // the deep walker flags >=1 desync in blocks {19,33,38,40,51} under it while the shallow walker
    // flags 0/30. That control is now DEAD: with `0x27`'s frame corrected, the same falsified
    // `0x37` override produces ZERO deep desyncs in all 30 blocks (measured by sweeping every
    // block, not just the five named). The round-32 signal that `0x37: wordSet 2` was wrong was an
    // ARTIFACT of the `0x27` bug decoding past its instruction and into 0x37's neighbourhood --
    // which is independently what R2 concluded from Treasures' dispatch table this round: the
    // entry at `0x2577` IS 0x37's own linear entry (`cmp al,0x37` / `jne` / `call 0x2577`,
    // bracketed by 0x36 -> 0x2506 and 0x38 -> 0x2837), so `wordSet: 2` was probably right all along
    // and round 32 bisected it while a second wrong frame was interfering.
    //
    // A positive control that can no longer fire is not a control, so it is rebuilt here on a
    // frame we can still prove wrong: stripping `0x27`'s shipped `{wordSet: 4, countAt: 3}` back to
    // the base `{wordSet: 8}`. That is the exact defect this round fixed, so its signal is real and
    // measured -- 15 deep desyncs against 0 shallow -- and it keeps this file's central claim
    // ("deep sees what shallow structurally cannot") under a probe that demonstrably fails.
    //
    // The count read 14 for the few hours between this control being rebuilt and `0x37` being
    // shipped later the same day. Once the falsification above was acted on rather than merely
    // recorded -- `ECL_GEN1_SHORT_TREASURES` now carries `0x37: {wordSet: 2}` for real -- the
    // stripped-`0x27` dialect decodes one block further before losing sync, and the number is 15.
    // Both numbers are the same measurement of the same defect through slightly different
    // downstream dialects; neither is a correction of the other.
    const TREASURES_FLAT_0X27: EclDialect = (() => {
      const { 0x27: _dropped, ...rest } = ECL_GEN1_SHORT_TREASURES.opcodeOverrides ?? {};
      return { ...ECL_GEN1_SHORT_TREASURES, opcodeOverrides: rest };
    })();

    const blocks = readDaxDataBlocks(new Uint8Array(readFileSync(TREASURES_ECL1)));
    let shallowDesyncAll = 0;
    let deepDesyncBlocks = 0;
    let deepDesyncSites = 0;
    for (const b of blocks) {
      const shallow = disassembleEclBlock(b.raw, TREASURES_FLAT_0X27);
      if (shallow.badOpcodeAt !== undefined) shallowDesyncAll++;
      const deep = walkEclReachable(b.raw, TREASURES_FLAT_0X27);
      if (deep.desyncSites.length > 0) deepDesyncBlocks++;
      deepDesyncSites += deep.desyncSites.length;
    }
    // Alternative hypothesis named per the plan: "the shallow census already sees everything",
    // which predicts deep === shallow === 0 here. It does not survive.
    expect(shallowDesyncAll).toBe(0);
    expect(deepDesyncSites).toBe(15);
    expect(deepDesyncBlocks).toBeGreaterThanOrEqual(1);

    // …and under the SHIPPED frame the same sweep is clean, which is what makes the 15 a signal
    // about the frame rather than a property of the corpus or of the walker.
    let shippedDeepSites = 0;
    for (const b of blocks) shippedDeepSites += walkEclReachable(b.raw, ECL_GEN1_SHORT_TREASURES).desyncSites.length;
    expect(shippedDeepSites).toBe(0);
  });

  it('the un-retracted 0x37 override produces no desync — the measurement that got it shipped', () => {
    // Under round 32's "falsified" `0x37 -> {wordSet: 2}`, the deep walker finds 0 desync sites
    // across ALL 30 blocks (not merely the five that were named). Round 32's doubt about `0x37`
    // is retracted; see R2's dispatch-table transcription in
    // docs/engine/research/treasures-ecl-dispatch-map.md.
    //
    // This started life as "recorded so it is not re-derived" -- a measurement filed away next to
    // a dialect that still did not carry the override. That is the shape of finding this project
    // keeps having to correct, so it was acted on: `ECL_GEN1_SHORT_TREASURES` now ships
    // `0x37: { wordSet: 2, mnemonic: 'TREASURES_FIND_CHARACTER' }`, and the sweep below is
    // consequently a check on the SHIPPED dialect rather than on a hypothetical one.
    const blocks = readDaxDataBlocks(new Uint8Array(readFileSync(TREASURES_ECL1)));
    let sites = 0;
    for (const b of blocks) sites += walkEclReachable(b.raw, TREASURES_0X37_OVERRIDE).desyncSites.length;
    expect(sites).toBe(0);
  });
  it('block 40 is CLEAN under the shipped frame — R1 measured 2 desyncs against a file being edited under it', () => {
    // RESOLVED 2026-09-04 (round 33 Phase B), and worth keeping for the process lesson.
    //
    // R1 reported two deep desync sites in block 40 only (offsets 0xcf5 and 0xdaf), reached via
    // `searchLocation`'s `ON_GOTO` chain, invisible to the shallow first-EXIT census, and both
    // immediately following a decoded `0x27 TREASURE` on its `:fallthrough` edge. It disclosed
    // them as an additional, un-diagnosed `0x27`-adjacent defect and named its own leading
    // hypothesis: a memory-coded count operand at that one site, which would have contradicted
    // R2's "0 of 8 sites are memory-coded" measurement.
    //
    // Neither was right, and the reason is procedural rather than technical. R1's comment says the
    // frame it measured was "already Treasures' own override" -- but `ECL_GEN1_SHORT_TREASURES`
    // carried no `0x27` entry at the start of the round and none at R2's finish; R2 measured the
    // frame, decided not to ship it, and reverted. R1 was reading `disassemble.ts` while R2 edited
    // it, a hazard R1 flagged explicitly ("two of my measurements changed value twice between
    // runs"). So these two sites are a property of an intermediate state that never shipped.
    // Under the frame this round actually ships, block 40 is clean.
    //
    // The lesson generalises past this file: six agents on one working tree can produce findings
    // about a state no commit ever contained. A measurement is only about the tree it was taken
    // from, and concurrent edits make that tree unnameable unless the agent pins it.
    const named = [19, 33, 38, 40, 51];
    const blocks = readDaxDataBlocks(new Uint8Array(readFileSync(TREASURES_ECL1))).filter((b) => named.includes(b.blockId));
    expect(blocks).toHaveLength(5);
    const bySite: Record<number, number[]> = {};
    for (const b of blocks) {
      const deep = walkEclReachable(b.raw, ECL_GEN1_SHORT_TREASURES);
      if (deep.desyncSites.length > 0) bySite[b.blockId] = deep.desyncSites.map((d) => d.offset).sort((a, c) => a - c);
    }
    expect(bySite).toEqual({});

    // The corresponding control: strip the shipped frame and block 40's neighbourhood desyncs
    // reappear, so this test is not merely asserting that nothing ever happens here.
    const FLAT: EclDialect = (() => {
      const { 0x27: _dropped, ...rest } = ECL_GEN1_SHORT_TREASURES.opcodeOverrides ?? {};
      return { ...ECL_GEN1_SHORT_TREASURES, opcodeOverrides: rest };
    })();
    let flatSites = 0;
    for (const b of blocks) flatSites += walkEclReachable(b.raw, FLAT).desyncSites.length;
    expect(flatSites).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// VM oracle: executed ⊆ reachable, deep vs shallow, on Pools and Treasures (see the file-top
// SUBSTITUTION note for how "the route fixtures" was operationalised here).
// ---------------------------------------------------------------------------------------------
function shallowOffsets(raw: Uint8Array, dialect: EclDialect): Set<number> {
  return new Set(disassembleEclBlock(raw, dialect).instructions.map((i) => i.offset));
}

function executedOffsetsAllEntries(raw: Uint8Array, dialect: EclDialect): Set<number> {
  const header = parseEclHeader(raw, dialect);
  const toOff = (w: number) => (w >= dialect.vbase ? w - dialect.vbase : w);
  const entryOffsets = [
    header.vmRun1,
    header.searchLocation,
    header.preCampCheck,
    header.campInterrupted,
    header.eclInitialEntry,
  ].map(toOff);
  const executed = new Set<number>();
  const seen = new Set<number>(); // de-dupe identical entry offsets
  for (const entry of entryOffsets) {
    if (entry < dialect.headerLen || entry >= raw.length || seen.has(entry)) continue;
    seen.add(entry);
    const vm = new EclVm(raw, { dialect, entry, stepBudget: 3000 });
    for (let i = 0; i < 3000; i++) {
      const r = vm.step();
      if (r.instruction) executed.add(r.instruction.offset);
      if (r.done) break;
    }
  }
  return executed;
}

interface OracleReport {
  blocks: number;
  totalExecuted: number;
  executedButNotDeep: number;
  executedButNotShallow: number;
  deepMisses: string[];
}

function oracleReport(file: string, dialect: EclDialect): OracleReport {
  const bytes = new Uint8Array(readFileSync(file));
  const blocks = readDaxDataBlocks(bytes);
  let totalExecuted = 0;
  let executedButNotDeep = 0;
  let executedButNotShallow = 0;
  const deepMisses: string[] = [];
  for (const b of blocks) {
    const executed = executedOffsetsAllEntries(b.raw, dialect);
    const deep = walkEclReachable(b.raw, dialect).reachableOffsets;
    const shallow = shallowOffsets(b.raw, dialect);
    for (const off of executed) {
      totalExecuted++;
      if (!deep.has(off)) {
        executedButNotDeep++;
        deepMisses.push(`#${b.blockId}@0x${off.toString(16)}`);
      }
      if (!shallow.has(off)) executedButNotShallow++;
    }
  }
  return { blocks: blocks.length, totalExecuted, executedButNotDeep, executedButNotShallow, deepMisses };
}

describe.skipIf(!HAVE_POOLS)('VM oracle — Pools of Darkness ECL1.DAX (56 blocks)', () => {
  it('executed ⊆ deep-reachable: 0 executed-but-unreached under the SHIPPED frame — the 12 misses were the 0x27 gap, now closed', () => {
    // HISTORY (round 33 R1 -> Phase B, 2026-09-04). R1 measured this at **12**, refuting the
    // plan's P1 prediction of 0, and root-caused every one: blocks #33 (6 offsets), #51 (3) and
    // #80 (3), each immediately following a `0x27 TREASURE` site decoded under Pools' UN-overridden
    // base `{wordSet: 8}`. That wide frame ran past the real instruction's end and swallowed the
    // START of the next real instruction (e.g. block 51's real `SAVE` at 0x61f), so the walker
    // called a real, VM-executed offset "mid-instruction" and refused to follow it. R1 proved the
    // diagnosis with a TEST-LOCAL narrow clone that dropped the count to 0, and disclosed it
    // rather than shipping, because `disassemble.ts` was R2's file that round.
    //
    // Phase B shipped that frame once three independent lines of evidence agreed (see the `0x27`
    // docblock in disassemble.ts), so the count is now 0. Note what the SHALLOW walker could never
    // have told us: it never reaches blocks #33/#51/#80's `0x27` sites at all -- they sit well past
    // each block's first `EXIT` -- which is why the earlier frame analysis, comparing candidate
    // frames by shallow desync count alone, could not see this and chose not to fix Pools.
    const report = oracleReport(POOLS_ECL1, ECL_GEN1_SHORT_POOLS);
    expect(report.blocks).toBe(56);
    // Alternative named per the plan: "shallow already covers execution", predicting the shallow
    // count is also 0. Measured instead: shallow misses thousands of executed offsets here.
    // eslint-disable-next-line no-console
    console.log('Pools oracle:', report);
    expect(report.executedButNotDeep).toBe(0);
    expect(report.executedButNotShallow).toBeGreaterThan(1000);
  });

  it('the 12 misses return the moment the 0x27 frame is removed — this fails if the fix is reverted', () => {
    // The mirror of the test above, and the reason both are kept. Reconstructing Pools' pre-fix
    // flat `0x27` reproduces R1's original finding exactly, offset for offset. If someone drops
    // the shipped override, the test above goes red while this one keeps passing, which localises
    // the regression to the frame rather than to the walker.
    const POOLS_LEGACY_FLAT: EclDialect = (() => {
      const { 0x27: _dropped, ...rest } = ECL_GEN1_SHORT_POOLS.opcodeOverrides ?? {};
      return { ...ECL_GEN1_SHORT_POOLS, opcodeOverrides: rest };
    })();
    const report = oracleReport(POOLS_ECL1, POOLS_LEGACY_FLAT);
    expect(report.executedButNotDeep).toBe(12);
    expect(new Set(report.deepMisses)).toEqual(
      new Set([
        '#33@0x1d7e', '#33@0x1d7f', '#33@0x1d80', '#33@0x1d81', '#33@0x1d8d', '#33@0x1d8e',
        '#51@0x61f', '#51@0x625', '#51@0x636',
        '#80@0x7e4', '#80@0x7ea', '#80@0x7fb',
      ]),
    );
  });
});

describe.skipIf(!HAVE_TREASURES)('VM oracle — Treasures of the Savage Frontier ECL1.DAX (30 blocks)', () => {
  it('executed ⊆ deep-reachable (0 executed-but-unreached); shallow undercounts by comparison', () => {
    const report = oracleReport(TREASURES_ECL1, ECL_GEN1_SHORT_TREASURES);
    expect(report.blocks).toBe(30);
    // eslint-disable-next-line no-console
    console.log('Treasures oracle:', report);
    expect(report.executedButNotDeep).toBe(0);
  });

  it('mutation: disabling the IF-guard fall-through rule makes the executed-but-unreached count rise above 0 on this fixture', () => {
    const bytes = new Uint8Array(readFileSync(TREASURES_ECL1));
    const blocks = readDaxDataBlocks(bytes);
    let executedButNotDeepMutated = 0;
    for (const b of blocks) {
      const executed = executedOffsetsAllEntries(b.raw, ECL_GEN1_SHORT_TREASURES);
      const deepMutated = walkEclReachable(b.raw, ECL_GEN1_SHORT_TREASURES, { disableIfGuardFallthrough: true }).reachableOffsets;
      for (const off of executed) if (!deepMutated.has(off)) executedButNotDeepMutated++;
    }
    // eslint-disable-next-line no-console
    console.log('Treasures executed-but-unreached with IF-guard fall-through DISABLED:', executedButNotDeepMutated);
    expect(executedButNotDeepMutated).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Corpus census: shallow vs deep, every pinned dialect this repo carries.
// ---------------------------------------------------------------------------------------------
interface Census {
  blocks: number;
  shallowDesync: number;
  deepDesync: number;
  reachableBytesShallow: number;
  reachableBytesDeep: number;
  totalNonZeroBytes: number;
}

function censusFile(raw: Uint8Array, dialect: EclDialect, acc: Census): void {
  acc.blocks++;
  const shallow = disassembleEclBlock(raw, dialect);
  if (shallow.badOpcodeAt !== undefined) acc.shallowDesync++;
  for (const ins of shallow.instructions) acc.reachableBytesShallow += ins.size;
  const deep = walkEclReachable(raw, dialect);
  acc.deepDesync += deep.desyncSites.length;
  acc.reachableBytesDeep += deep.reachableBytes;
  for (let i = dialect.headerLen; i < raw.length; i++) if (raw[i] !== 0) acc.totalNonZeroBytes++;
}

function censusDax(files: string[], dialect: EclDialect): Census | null {
  if (!files.every((f) => existsSync(f))) return null;
  const acc: Census = { blocks: 0, shallowDesync: 0, deepDesync: 0, reachableBytesShallow: 0, reachableBytesDeep: 0, totalNonZeroBytes: 0 };
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(f));
    for (const b of readDaxDataBlocks(bytes)) censusFile(b.raw, dialect, acc);
  }
  return acc;
}

const COK_DIR = resolve(repoRoot, 'Champions of Krynn');
const DOK_DIR = resolve(repoRoot, 'Death Knights of Krynn');
const COAB_DIR = `${GOG}/Curse of the Azure Bonds`;
const POR_DIR = `${GOG}/Pool of Radiance/POOLRAD`;
const SECRET_DIR = `${GOG}/Secret of the Silver Blades`;
const GATEWAY_DIR = `${GOG}/Gateway to the Savage Frontier`;
const NWN_DIR = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const BUCK_DIR = 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday';
const MATRIX_DIR = resolve(repoRoot, 'matrixcubed_extracted', 'BuckRogers2', 'c', 'Matrix');
const DQK_ECLGLB = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK3', 'ECL.GLB');

// Pinned golden numbers, MEASURED against this session's disassemble.ts (round 33 — a file R2
// was actively revising concurrently with this item: the Pools/Treasures numbers below moved
// twice, upward, over the course of this item as R2's own `0x27`/`0x37` edits landed; see
// docs/engine/research/ecl-census-reachability.md's "shared-file hazard" note). If a future
// disassemble.ts change moves any of these, that is real information — re-measure with this same
// file's `console.log` output and update the pin in the same commit, per the repo's own
// documented-claims convention (CLAUDE.md's `tools/test_docs_claims.py` model).
const CENSUS_PINS: Record<string, { blocks: number; shallowDesync: number; deepDesync: number }> = {
  // CoK/DoK/Secret/NWN RE-MEASURED 2026-09-04 (round 34 Phase B), after opcode `0x41`
  // (`wordSet: 2`) was added to the BASE `KRYNN_GEN1_OPCODES` table. Deep sites: CoK 33 -> 0,
  // Secret 40 -> 0, DoK 72 -> 29, NWN 1 -> 0. Shallow moved nowhere, which is the point: the
  // shallow scan stops at each block's first EXIT and never reached these bytes to be wrong
  // about them.
  //
  // NWN was NOT one of the three titles round 34's R1 measured -- it moved because `0x41` went
  // into the base table every Gen1 dialect inherits, so the whole census was re-run rather
  // than the three named numbers being patched. A base-table edit is never a three-title edit.
  CoK: { blocks: 22, shallowDesync: 0, deepDesync: 0 },
  // DoK RE-MEASURED 2026-09-05 (round 35 R1): 29 -> 0 deep, 1 -> 0 shallow, and the case below
  // now runs under `ECL_GEN1_SHORT_DOK` instead of the shared `ECL_GEN1_SHORT`.
  //
  // BINARY EVIDENCE FOR THE MOVE, per this repo's rule that no pin moves without one -- three
  // operand counts, each read from a handler in DoK's own `GAME.OVR` (`FBOV`, 252,469 bytes) and
  // pinned byte-for-byte in `tools/test_map_gen1_ecl_dispatch.py::DokRealBytesTests`:
  //   * `0x1f` 2 -> 1: handler 0x2fbc, prefetch `b0 01 50 9a 2a 00 41 00` at 0x2fc3
  //     (`mov al,1; push ax; lcall 0x41,0x2a`).
  //   * `0x27` 8 -> 4 with `countAt: 3`: handler 0x2150, prefetch `mov al,4` at 0x2156, then a
  //     SECOND prefetch after `dec word ptr [0x8c48]` whose count is operand 4's own value.
  //   * `0x29` 14 -> 0: handler 0x30e6 is nine bytes, `55 89 e5 ff 06 48 8c 5d cb` =
  //     `push bp; mov bp,sp; inc word ptr [0x8c48]; pop bp; retf`. No call of any kind, so
  //     nothing in it can consume a script byte.
  // `[0x8c48]` is DoK's ECL program counter, derived (not assumed) as the unanimous 18-of-18
  // `inc word ptr` target among no-prefetch handlers and cross-checked by the six count-driven
  // opcodes that `dec` it. Round 34 Phase B's open finding -- offset 0x51b, first byte 0x80,
  // VM-reachable from cold -- is closed by these three and pinned two-sided in
  // `dokEclDispatchRound35.test.ts`.
  //
  // THE NULL, MEASURED: of the three, only `0x27` 8 -> 4 and `0x29` 14 -> 0 are corpus-visible.
  // `0x1f` = 0 and `0x1f` = 1 give IDENTICAL block/shallow/deep/misaligned numbers on this corpus
  // (they differ only in reachable bytes, 136,538 vs 140,730), so the census could not have
  // decided that one and does not get credit for it -- the handler byte did. Pinned as its own
  // assertion in `dokEclDispatchRound35.test.ts`.
  DoK: { blocks: 25, shallowDesync: 0, deepDesync: 0 },
  CoAB: { blocks: 25, shallowDesync: 0, deepDesync: 0 },
  PoR: { blocks: 29, shallowDesync: 1, deepDesync: 1 },
  // Pools/Treasures RE-MEASURED 2026-09-04 (round 33 Phase B), after `0x27 TREASURE`'s
  // `{wordSet: 4, countAt: 3}` frame shipped to both short dialects. This is the movement the
  // pin block above predicted, and it is the single largest correction in this census: Pools
  // went shallow 3 -> 1 and deep 18 -> 3, Treasures deep 14 -> 0. One opcode frame accounted
  // for ALL 14 of Treasures' deep desyncs and 15 of Pools' 18 -- which is exactly what R1's
  // own root-cause said would happen, and is why the four route goldens were regenerated
  // rather than treated as the oracle (see disassemble.ts's `0x27` docblock).
  Pools: { blocks: 56, shallowDesync: 1, deepDesync: 3 },
  Gateway: { blocks: 26, shallowDesync: 0, deepDesync: 0 },
  Treasures: { blocks: 30, shallowDesync: 0, deepDesync: 0 },
  Secret: { blocks: 22, shallowDesync: 0, deepDesync: 0 },
  NWN: { blocks: 33, shallowDesync: 4, deepDesync: 0 },
  // Buck/Matrix RE-MEASURED 2026-09-05 (round 35 R1). BINARY EVIDENCE FOR THE MOVE, per this
  // repo's rule that no pin moves without one: the handler byte is unchanged — Buck's `0x42`
  // handler at `GAME.OVR` file `0x313b` and Matrix's at `0x3340` were both read in round 32 R5
  // out of the EXEPACK-unpacked resident image and both returned a concrete `0` script bytes
  // consumed. NOTHING about that measurement is revised. What changed is that the measurement
  // was written as `wordSetOverrides[0x42] = 0`, which `decodeInstructionAt` never reads for an
  // opcode with no `def` (the dense base table stops at 0x41), so byte 0x42 kept decoding as a
  // BAD OPCODE for two rounds and the entry was dead code. Round 35 moved it to
  // `opcodeOverrides` as `BUCK_EXT_42` (wordSet 0, `uncertain`, NO semantics claimed) and the
  // decoder finally applies it: 232 Buck / 528 Matrix `0x42` instructions across 13 / 24 blocks
  // now decode. Deep: Buck 195 -> 9, Matrix 452 -> 16. Shallow: 2 -> 1 and 3 -> 2. Reachable
  // bytes: 158,421 -> 165,391 and 217,569 -> 236,375.
  //
  // THE NULL, MEASURED, NOT INHERITED. The plan warned that a zero-operand opcode cannot desync
  // a walker, so the deep-desync collapse is partly free under ANY reading. It is: sweeping
  // wordSet 0..8 (with the dead key removed so the frame actually varies) gives Buck 52..71 and
  // Matrix 92..141 at every non-zero value — merely giving 0x42 a `def` buys about two thirds of
  // the drop. The measurements that DO separate wordSet 0 from the alternatives are misaligned
  // jump targets (Buck 6 at ws=0 vs a best alternative of 108, 18x; Matrix 2 vs 247, 123x) and
  // reachable bytes (Buck 165,391 vs 152,324; Matrix 236,375 vs 181,837 — ws=0 is the maximum in
  // both). One plan prediction is FALSIFIED and recorded rather than smoothed: the plan expected
  // misaligned targets to "collapse from 108+". They do not move at all — on HEAD they were
  // already 6 and 2, because a bad opcode stops the walk thread before it can emit a bogus jump
  // target. The 108/247 numbers are the alternative-wordSet null, never a before-state.
  Buck: { blocks: 25, shallowDesync: 1, deepDesync: 9 },
  Matrix: { blocks: 33, shallowDesync: 2, deepDesync: 16 },
};

describe('corpus census — shallow vs deep, every pinned dialect', () => {
  const cases: Array<{ name: string; files: string[]; dialect: EclDialect }> = [
    { name: 'CoK', files: ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(COK_DIR, f)), dialect: ECL_GEN1 },
    { name: 'DoK', files: ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(DOK_DIR, f)), dialect: ECL_GEN1_SHORT_DOK },
    { name: 'CoAB', files: [1, 2, 3, 4, 5, 6].map((n) => resolve(COAB_DIR, `ECL${n}.DAX`)), dialect: ECL_GEN1 },
    { name: 'PoR', files: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => resolve(POR_DIR, `ECL${n}.DAX`)), dialect: ECL_POOL },
    { name: 'Pools', files: [resolve(GOG, 'Pools of Darkness', 'ECL1.DAX')], dialect: ECL_GEN1_SHORT_POOLS },
    { name: 'Gateway', files: [2, 3, 4, 5, 6].map((n) => resolve(GATEWAY_DIR, `ECL${n}.DAX`)), dialect: ECL_GEN1_SHORT_GATEWAY },
    { name: 'Treasures', files: [resolve(GOG, 'Treasures of the Savage Frontier', 'ECL1.DAX')], dialect: ECL_GEN1_SHORT_TREASURES },
    { name: 'Secret', files: [1, 2, 3].map((n) => resolve(SECRET_DIR, `ECL${n}.DAX`)), dialect: ECL_GEN1 },
    { name: 'NWN', files: ['ECL0.DAX', 'ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX', 'ECL5.DAX', 'ECL7.DAX'].map((f) => resolve(NWN_DIR, f)), dialect: ECL_GEN1 },
    { name: 'Buck', files: [1, 2, 3, 4, 5, 6].map((n) => resolve(BUCK_DIR, `ecl${n}.dax`)), dialect: ECL_GEN1_BUCK },
    { name: 'Matrix', files: [resolve(MATRIX_DIR, 'ECL1.DAX')], dialect: ECL_GEN1_MATRIX },
  ];

  for (const c of cases) {
    it(`${c.name}: shallow vs deep desync census (pinned) + reachable-bytes (logged)`, () => {
      const result = censusDax(c.files, c.dialect);
      if (!result) {
        // Data not present on this machine — the plan's ground rule 7 (external sources
        // referenced, never vendored): skip rather than fail.
        // eslint-disable-next-line no-console
        console.log(`${c.name}: SKIPPED (data absent)`);
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`${c.name} census:`, result);
      const pin = CENSUS_PINS[c.name];
      expect({ blocks: result.blocks, shallowDesync: result.shallowDesync, deepDesync: result.deepDesync }).toEqual(pin);
      // Alternative named per the plan ("shallow already covers execution") predicts
      // deepDesync === shallowDesync for every title. It was falsified when this census was first
      // taken (round 33), and the honest thing to record is that EVERY round since has eroded the
      // margin, because each round's fix removes deep desyncs and shallow was never wrong about
      // those bytes -- it simply stops at the first EXIT and never reads them.
      //
      // As measured RIGHT NOW against the pins above, deep exceeds shallow in 3 of 11 titles:
      // Pools (3 vs 1), Buck (9 vs 1), Matrix (16 vs 2). NWN (0 vs 4) is the one title where
      // shallow reports MORE, because its shallow first-EXIT walk desyncs early inside a region
      // the deep walker's IF-guard/GOTO-chain routing steps around entirely. The other seven are
      // 0 vs 0 and support neither side.
      //
      // Titles that USED to support the claim and no longer do, each dropped in the round that
      // fixed it rather than left in the count: Treasures 14 vs 0 -> 0 vs 0 (round 33's `0x27`
      // frame), CoK 33 vs 0 and Secret 40 vs 0 -> 0 vs 0 (round 34's base-table `0x41`), DoK
      // 29 vs 1 -> 0 vs 0 (round 35 R1's `ECL_GEN1_SHORT_DOK` split). Reporting the count as
      // still 6 of 11 would have been the easy error here.
      expect(result.reachableBytesDeep).toBeGreaterThanOrEqual(result.reachableBytesShallow);
    });
  }

  it('DQK (Gen2 ECL.GLB): shallow vs deep desync/reachable-bytes census', () => {
    if (!existsSync(DQK_ECLGLB)) {
      // eslint-disable-next-line no-console
      console.log('DQK: SKIPPED (data absent)');
      return;
    }
    const arch = decodeEclGlb(new Uint8Array(readFileSync(DQK_ECLGLB)));
    const acc: Census = { blocks: 0, shallowDesync: 0, deepDesync: 0, reachableBytesShallow: 0, reachableBytesDeep: 0, totalNonZeroBytes: 0 };
    for (const raw of arch.members.slice(1)) censusFile(raw, ECL_GEN2, acc);
    // eslint-disable-next-line no-console
    console.log('DQK census:', acc);
    // Gen2 pin (measured): 47 blocks, 2 shallow desyncs, 0 deep desyncs — the only pinned corpus
    // where deep is STRICTLY BETTER than shallow on desyncs (deep's cross-entry/GOTO-chain routing
    // resolves both sites the shallow first-EXIT walk flags as bad opcodes).
    expect({ blocks: acc.blocks, shallowDesync: acc.shallowDesync, deepDesync: acc.deepDesync }).toEqual({
      blocks: 47,
      shallowDesync: 2,
      deepDesync: 0,
    });
  });
});
