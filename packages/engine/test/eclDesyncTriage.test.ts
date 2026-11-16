/**
 * R1 (round 34): triage of the "deep desync" sites `walkEclReachable` (reachability.ts) finds
 * across the corpus, asking whether they are dead bytes the walker's own static rules manufacture
 * (an unconditional GOSUB/ON_GOSUB fall-through pushed regardless of whether the callee ever
 * RETURNs) or real `ECL_GEN1` dialect gaps. See docs/engine/research/ecl-deep-desync-triage.md for
 * the full write-up; this file pins the measurements two-sided.
 *
 * HEADLINE RESULT (falsifies the plan's own P1): 0 of 792 desync sites across ALL 12 pinned
 * corpora (CoK 33, DoK 72, Secret 40, Buck 195, Matrix 452, and 0 each for CoAB/PoR/Pools/Gateway/
 * Treasures/NWN, which have none) classify as `'dead-fallthrough'`. Every GOSUB/ON_GOSUB whose
 * fall-through desyncs has a callee that either reaches a real RETURN or is nonlocal (`EclVm`'s own
 * `inCode` guard, vm.ts, makes a nonlocal call's fall-through unconditionally live). Instead, CoK's
 * 33/33 and Secret's 40/40 sites, and 47 of DoK's 72, share ONE root cause across every edge kind
 * (`straight`, `IF:taken`, `IF:fallthrough`, `GOTO`, `ON_GOTO`, `GOSUB:fallthrough` alike): opcode
 * `0x41` is simply missing from the base Gen1 table (`KRYNN_GEN1_OPCODES` is dense only over
 * `0x00..0x40` — `ECL_OPCODE_MAX = 0x40`, opcodes.ts). Every one of those 120 sites' first byte is
 * `0x41`; a single test-local override (`wordSet: 2`, first operand a 2-byte imm, second a 3-byte
 * word) collapses CoK 33→0 and Secret 40→0 with zero shallow-census regression, and Buck's own
 * independently-derived `ECL_GEN1_BUCK.opcodeOverrides[0x41]` (`{ wordSet: 2, mnemonic:
 * 'BUCK_EXT_41' }`, derived from Countdown's own binary dispatch table, unrelated to this
 * measurement) already agrees on `wordSet: 2` — a second, independent oracle for the same operand
 * count.
 *
 * ROUND 35 R1 UPDATE (2026-09-05) — ONE OF THIS FILE'S OWN CLAIMS IS FALSIFIED, AND THE HEADLINE
 * GETS STRONGER FOR IT. The DoK numbers above (72 sites, 47 of them first-byte `0x41`, "the
 * residual 25 are a SEPARATE, unclosed gap (`0x80` and others)") were all measured under the
 * SHARED `ECL_GEN1_SHORT` literal, because DoK had no dialect of its own. It does now:
 * `ECL_GEN1_SHORT_DOK`, split off this round from three operand counts read out of DoK's own
 * `GAME.OVR` handlers (`0x1f` 2 -> 1, `0x27` 8 -> 4 with `countAt: 3`, `0x29` 14 -> 0; see
 * `dokEclDispatchRound35.test.ts` and `docs/engine/research/dok-ecl-word-sets.md`).
 *
 * Re-measured under DoK's own dialect, the pre-`0x41` reconstruction gives **58 sites, and ALL 58
 * are first-byte `0x41`** — 100%, not 65%. There was never a second opcode gap. The "residual 25"
 * were DoK's own word-set drift walking the decoder off alignment onto mid-instruction bytes, and
 * `0x80` at block 33 offset `0x51b` — the byte this file named as the second gap's evidence — is
 * not a desync site under the corrected dialect and is not even REACHED by the VM oracle. So DoK
 * joins CoK and Secret as a corpus `0x41` explains entirely, and this file's central claim gains a
 * third clean title while losing its one counterexample. Both measurements are kept side by side
 * below rather than overwritten, because the shared-dialect numbers are what round 34 shipped.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { EclVm } from '../src/ecl/vm.js';
import {
  parseEclHeader,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_DOK,
  ECL_GEN1_BUCK,
  ECL_GEN1_MATRIX,
  type EclDialect,
} from '../src/ecl/disassemble.js';
import { walkEclReachable, type EclDesyncSite } from '../src/ecl/reachability.js';
import { KRYNN_GEN1_OPCODES, type OpcodeDef } from '../src/ecl/opcodes.js';
import {
  classifyParentEdge,
  triageDesyncSites,
  histogramDesyncTriage,
  type EclDesyncTriageEntry,
} from '../src/ecl/desyncTriage.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';

const COK_DIR = resolve(repoRoot, 'Champions of Krynn');
const DOK_DIR = resolve(repoRoot, 'Death Knights of Krynn');
const SECRET_DIR = `${GOG}/Secret of the Silver Blades`;
const BUCK_DIR = 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday';
const MATRIX_DIR = resolve(repoRoot, 'matrixcubed_extracted', 'BuckRogers2', 'c', 'Matrix');

// ---------------------------------------------------------------------------------------------
// Synthetic unit tests — the walker/edge-classification/dead-fallthrough rules in isolation.
// (Mirrors eclReachability.test.ts's own synthetic-block builder; kept test-local per this item's
// "do not edit reachability.ts/disassemble.ts/vm.ts or their tests" rule.)
// ---------------------------------------------------------------------------------------------
const VBASE = ECL_GEN1.vbase;
const HLEN = ECL_GEN1.headerLen;
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

function wordOp(code: 1 | 2 | 3, w: number): number[] {
  return [code, w & 0xff, (w >> 8) & 0xff];
}

describe('classifyParentEdge — pure label parsing', () => {
  it('classifies every edge kind the walker\'s labels can produce', () => {
    expect(classifyParentEdge(['searchLocation'])).toBe('entry');
    expect(classifyParentEdge(['searchLocation', 'IF@0x10:taken'])).toBe('IF:taken');
    expect(classifyParentEdge(['searchLocation', 'IF@0x10:fallthrough'])).toBe('IF:fallthrough');
    expect(classifyParentEdge(['searchLocation', 'GOTO@0x10'])).toBe('GOTO');
    expect(classifyParentEdge(['searchLocation', 'GOSUB@0x10'])).toBe('GOSUB:target');
    expect(classifyParentEdge(['searchLocation', 'GOSUB@0x10:fallthrough'])).toBe('GOSUB:fallthrough');
    expect(classifyParentEdge(['searchLocation', 'ON_GOTO@0x10[2]'])).toBe('ON_GOTO');
    expect(classifyParentEdge(['searchLocation', 'ON_GOSUB@0x10[2]'])).toBe('ON_GOSUB:target');
    expect(classifyParentEdge(['searchLocation', 'ON_GOSUB@0x10:fallthrough'])).toBe('ON_GOSUB:fallthrough');
    expect(classifyParentEdge(['searchLocation', 'SAVE@0x10:fallthrough'])).toBe('straight');
  });
});

describe('triageDesyncSites — dead-fallthrough detection on synthetic fixtures', () => {
  it('a GOSUB whose ONLY callee path dead-ends at EXIT (never RETURNs) is dead-fallthrough', () => {
    // 22: GOSUB -> 30; 26: bad opcode (the fall-through, and the desync site); 30: EXIT (no RETURN)
    const { raw, put } = buildBlock(31);
    put(22, [0x02, ...wordOp(1, vaddrOf(30))]);
    put(26, [0xff]);
    put(30, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect(result.desyncSites).toHaveLength(1);
    const triage = triageDesyncSites(raw, ECL_GEN1, result.desyncSites);
    expect(triage[0].edgeKind).toBe('GOSUB:fallthrough');
    expect(triage[0].classification).toBe('dead-fallthrough');
    expect(triage[0].callee).toEqual({ callSiteOffset: 22, targets: [30], reachesReturn: false, anyNonlocal: false });
  });

  it('a GOSUB whose callee reaches RETURN makes the SAME shaped fall-through live', () => {
    const { raw, put } = buildBlock(32);
    put(22, [0x02, ...wordOp(1, vaddrOf(30))]);
    put(26, [0xff]);
    put(30, [0x13]); // RETURN
    const result = walkEclReachable(raw, ECL_GEN1);
    const triage = triageDesyncSites(raw, ECL_GEN1, result.desyncSites);
    expect(triage[0].classification).toBe('live');
    expect(triage[0].callee?.reachesReturn).toBe(true);
  });

  it('a GOSUB whose callee reaches RETURN only through an IF-guarded path is still live (both IF branches are explored)', () => {
    // 30: IF_EQ; 31: RETURN (taken); 35: EXIT (not-taken) -- only ONE branch returns.
    const { raw, put } = buildBlock(37);
    put(22, [0x02, ...wordOp(1, vaddrOf(30))]);
    put(26, [0xff]);
    put(30, [0x16]);
    put(31, [0x13]);
    put(35, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    const triage = triageDesyncSites(raw, ECL_GEN1, result.desyncSites);
    expect(triage[0].classification).toBe('live');
  });

  it('a GOSUB target that is out-of-block (nonlocal) is live regardless of return-reachability (mirrors EclVm.exec\'s own inCode guard)', () => {
    const { raw, put } = buildBlock(27);
    put(22, [0x02, ...wordOp(1, 0xffff)]); // resolves to an offset far past raw.length
    put(26, [0xff]);
    const result = walkEclReachable(raw, ECL_GEN1);
    const triage = triageDesyncSites(raw, ECL_GEN1, result.desyncSites);
    expect(triage[0].classification).toBe('live');
    expect(triage[0].callee?.anyNonlocal).toBe(true);
  });

  it('an IF-guarded GOTO\'s not-taken fall-through is ALWAYS live (never dead-fallthrough), even though it is one of the two "18 fall-through" edge kinds the plan named', () => {
    // This is CoK's actual dominant shape (see the corpus census below): IF; GOTO; <bad opcode>.
    const { raw, put } = buildBlock(31);
    put(22, [0x16]); // IF_EQ
    put(23, [0x01, ...wordOp(1, vaddrOf(30))]); // GOTO 30 (guarded)
    put(27, [0xff]); // not-taken fall-through: bad opcode
    put(30, [0x00]);
    const result = walkEclReachable(raw, ECL_GEN1);
    expect(result.desyncSites).toHaveLength(1);
    const triage = triageDesyncSites(raw, ECL_GEN1, result.desyncSites);
    expect(triage[0].edgeKind).toBe('IF:fallthrough');
    expect(triage[0].classification).toBe('live'); // no callee analysis applies to this edge kind at all
    expect(triage[0].callee).toBeUndefined();
  });

  it('a bad opcode sitting directly at a header entry point classifies as "entry"', () => {
    const { raw, put } = buildBlock(23);
    put(22, [0xff]);
    const result = walkEclReachable(raw, ECL_GEN1);
    const triage = triageDesyncSites(raw, ECL_GEN1, result.desyncSites);
    expect(triage[0].edgeKind).toBe('entry');
    expect(triage[0].classification).toBe('live');
  });
});

// ---------------------------------------------------------------------------------------------
// Corpus census: parent-edge histogram + dead-fallthrough classification for every pinned dialect.
// Bar A (descriptive, no null needed).
// ---------------------------------------------------------------------------------------------
interface Census {
  blocks: number;
  triage: EclDesyncTriageEntry[];
}

function censusDax(files: string[], dialect: EclDialect): Census | null {
  if (!files.every((f) => existsSync(f))) return null;
  const triage: EclDesyncTriageEntry[] = [];
  let blocks = 0;
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(f));
    for (const b of readDaxDataBlocks(bytes)) {
      blocks++;
      const r = walkEclReachable(b.raw, dialect);
      if (r.desyncSites.length === 0) continue;
      triage.push(...triageDesyncSites(b.raw, dialect, r.desyncSites));
    }
  }
  return { blocks, triage };
}

// Reproduced from eclReachability.test.ts's CENSUS_PINS deep-desync column at 4fc4533 (round 33).
// This item does not re-verify blocks/shallowDesync (eclReachability.test.ts's own job); it
// re-derives ONLY the deep-desync total per corpus as the precondition for triage.
// RECONSTRUCTED BASELINE, added 2026-09-04 (round 34 Phase B).
//
// Everything below was measured while opcode 0x41 was ABSENT from `KRYNN_GEN1_OPCODES`. Phase B
// then shipped it (wordSet 2), which is what this item's own evidence argued for -- so the
// numbers these tests pin no longer describe the shipped engine.
//
// The tempting fix is to overwrite them with the post-fix values. That would delete the
// evidence: "33 sites, all first-byte 0x41" is the measurement that JUSTIFIED the change, and a
// pin that can no longer be checked is not evidence, it is a claim. So instead the pre-fix state
// is RECONSTRUCTED here by removing 0x41 from the base table for the duration of a measurement
// and restoring it in a `finally`. The historical numbers stay falsifiable, and the shipped
// numbers are pinned separately below.
//
// Vitest isolates module state per test file, so this mutation is not visible to any other file.
// The PRE-fix table is this file's default, because almost every measurement here is a pre-fix one;
// the single shipped-state assertion opts back in through `withOpcode0x41`.
let saved0x41: OpcodeDef | undefined;
beforeAll(() => {
  saved0x41 = KRYNN_GEN1_OPCODES[0x41];
  if (saved0x41 === undefined) {
    // Guard, not decoration: if 0x41 is ever removed from the shipped table, this file would
    // silently start "reconstructing" a state identical to the real one, and every historical
    // number below would quietly become a tautology instead of a record.
    throw new Error('opcode 0x41 is absent from KRYNN_GEN1_OPCODES: the reconstruction below would measure nothing');
  }
  delete KRYNN_GEN1_OPCODES[0x41];
});
afterAll(() => {
  if (saved0x41 !== undefined) KRYNN_GEN1_OPCODES[0x41] = saved0x41;
});

/** Run `fn` against the SHIPPED table (0x41 present), then restore this file's pre-fix default. */
function withOpcode0x41<T>(fn: () => T): T {
  if (saved0x41 === undefined) throw new Error('no saved 0x41 definition to restore');
  KRYNN_GEN1_OPCODES[0x41] = saved0x41;
  try {
    return fn();
  } finally {
    delete KRYNN_GEN1_OPCODES[0x41];
  }
}

/**
 * Deep desync totals as measured BEFORE 0x41 shipped (reconstructed via `withOpcode0x41`'s
 * inverse -- this file's default state).
 *
 * ROUND 35 R1 (2026-09-05) -- WHY THE BUCK/MATRIX ROWS MOVED AND THE OTHER THREE DID NOT. The
 * `0x41` reconstruction machinery above deletes `0x41` from `KRYNN_GEN1_OPCODES`. Buck's and
 * Matrix's dialects carry their OWN `opcodeOverrides[0x41]`, which is resolved first, so that
 * reconstruction has never had any effect on those two corpora at all -- which is exactly why
 * their rows here and in `DEEP_DESYNC_PINS_SHIPPED` were, and still are, the same number. Their
 * movement this round has a different cause: `ECL_GEN1_BUCK`/`ECL_GEN1_MATRIX`'s measured
 * `0x42: wordSet 0` moved from `wordSetOverrides` (where no decoder reads it, so byte 0x42 kept
 * decoding as a bad opcode) into `opcodeOverrides` (where it is read). 232 Buck and 528 Matrix
 * `0x42` instructions decode for the first time and the deep-desync totals collapse, 195 -> 9 and
 * 452 -> 16.
 *
 * The CoK/Secret rows are UNTOUCHED and must stay untouched: neither dialect has a 0x42 def, so
 * nothing about the 0x42 move can touch them, and they remain the falsifiable record of the
 * pre-0x41 state that justified shipping 0x41.
 *
 * THE DoK ROW MOVED FOR A THIRD, SEPARATE REASON: 72 -> 58, because the corpus below is now walked
 * under `ECL_GEN1_SHORT_DOK` instead of the shared `ECL_GEN1_SHORT`. BINARY EVIDENCE, one handler
 * byte per correction, all in DoK's own `GAME.OVR` (`FBOV`, 252,469 bytes) and pinned in
 * `tools/test_map_gen1_ecl_dispatch.py::DokRealBytesTests`: `0x1f` 2 -> 1 (`mov al,1` at 0x2fc3),
 * `0x27` 8 -> 4 with `countAt: 3` (`mov al,4` at 0x2156 plus a second, count-driven prefetch after
 * `dec word ptr [0x8c48]`), `0x29` 14 -> 0 (handler 0x30e6 is `55 89 e5 ff 06 48 8c 5d cb` --
 * `push bp; mov bp,sp; inc word ptr [0x8c48]; pop bp; retf`, no call of any kind). The 14 sites
 * that disappeared were not `0x41` sites: what remains is 58 of 58 first-byte `0x41`, up from
 * 47 of 72.
 */
const DEEP_DESYNC_PINS: Record<string, number> = {
  CoK: 33,
  DoK: 58,
  Secret: 40,
  Buck: 9,
  Matrix: 16,
};

/** The same corpora under the SHIPPED table, i.e. with 0x41 modelled. Mirrors
 *  eclReachability.test.ts's CENSUS_PINS, which is the product-facing copy of these numbers. */
const DEEP_DESYNC_PINS_SHIPPED: Record<string, number> = {
  CoK: 0,
  // Round 35 R1: 29 -> 0. Round 34 recorded these 29 as "a scattered, separate gap that 0x41 does
  // NOT explain" and left them open. They were DoK's own operand-count drift; under
  // `ECL_GEN1_SHORT_DOK` with the shipped table there are none left, and the DoK corpus is closed.
  DoK: 0,
  Secret: 0,
  // Round 35 R1: 195 -> 9 and 452 -> 16, from the 0x42 opcodeOverrides move. Identical to the
  // reconstructed row above BY CONSTRUCTION for these two titles -- see that block's comment.
  Buck: 9,
  Matrix: 16,
};

// Bar A + the dead-fallthrough verdict, per corpus. EVERY corpus pins deadFallthrough: 0 — the
// headline finding. CoK/Secret additionally pin the edge-kind histogram (the plan's own "18 of
// CoK's 33 sit on GOSUB or IF fall-through edges" claim, reproduced exactly: 10 + 8 = 18) and the
// first-byte-0x41 count, since those are the two numbers the report's verdict rests on.
describe('corpus census — parent-edge histogram + dead-fallthrough triage (Bar A, Bar D)', () => {
  const cases: Array<{ name: string; files: string[]; dialect: EclDialect }> = [
    { name: 'CoK', files: ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(COK_DIR, f)), dialect: ECL_GEN1 },
    { name: 'DoK', files: ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(DOK_DIR, f)), dialect: ECL_GEN1_SHORT_DOK },
    { name: 'Secret', files: [1, 2, 3].map((n) => resolve(SECRET_DIR, `ECL${n}.DAX`)), dialect: ECL_GEN1 },
    { name: 'Buck', files: [1, 2, 3, 4, 5, 6].map((n) => resolve(BUCK_DIR, `ecl${n}.dax`)), dialect: ECL_GEN1_BUCK },
    { name: 'Matrix', files: [resolve(MATRIX_DIR, 'ECL1.DAX')], dialect: ECL_GEN1_MATRIX },
  ];

  for (const c of cases) {
    it(`${c.name}: deep-desync total matches round-33's pin, and 0 sites classify dead-fallthrough`, () => {
      const result = censusDax(c.files, c.dialect);
      if (!result) {
        // eslint-disable-next-line no-console
        console.log(`${c.name}: SKIPPED (data absent)`);
        return;
      }
      const h = histogramDesyncTriage(result.triage);
      // Two-sided: the reconstructed PRE-fix total, then the SHIPPED total on the same corpus.
      // If these two ever coincide for CoK/Secret/DoK, the reconstruction has stopped
      // reconstructing anything and this whole file's evidence is void.
      const shipped = withOpcode0x41(() => censusDax(c.files, c.dialect));
      expect(histogramDesyncTriage(shipped!.triage).total).toBe(DEEP_DESYNC_PINS_SHIPPED[c.name]);
      // eslint-disable-next-line no-console
      console.log(`${c.name} triage:`, h);
      expect(h.total).toBe(DEEP_DESYNC_PINS[c.name]);
      // THE HEADLINE FINDING, pinned two-sided for every corpus: the dead-fallthrough post-filter
      // (Bar D) removes 0 sites everywhere it is measured — far under the plan's "< 25%" bar, but
      // for a stronger reason than "modest": there are no dead-fallthrough sites AT ALL in this
      // entire multi-title corpus. Alternative named per the plan ("some fraction ARE dead"):
      // predicts deadFallthrough > 0 for at least one corpus; measured instead: 0 everywhere.
      expect(h.deadFallthrough).toBe(0);
      expect(h.indeterminate).toBe(0);
    });
  }

  it('CoK: parent-edge histogram reproduces the plan\'s own "18 of 33 sit on GOSUB or IF fall-through edges" claim exactly (10 GOSUB:fallthrough + 8 IF:fallthrough)', () => {
    const result = censusDax(['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(COK_DIR, f)), ECL_GEN1);
    if (!result) return;
    const h = histogramDesyncTriage(result.triage);
    expect(h.byEdgeKind).toEqual({
      'GOSUB:fallthrough': 10,
      straight: 8,
      'IF:fallthrough': 8,
      'IF:taken': 3,
      GOTO: 3,
      ON_GOTO: 1,
    });
    expect((h.byEdgeKind['GOSUB:fallthrough'] ?? 0) + (h.byEdgeKind['IF:fallthrough'] ?? 0)).toBe(18);
  });

  it('CoK: every one of the 33 sites\' first byte is 0x41 (opcode missing from KRYNN_GEN1_OPCODES, whose table is dense only over 0x00..0x40) — the real, single root cause, independent of edge kind', () => {
    const files = ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(COK_DIR, f));
    if (!files.every((f) => existsSync(f))) return;
    let checked = 0;
    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(f));
      for (const b of readDaxDataBlocks(bytes)) {
        const r = walkEclReachable(b.raw, ECL_GEN1);
        for (const site of r.desyncSites) {
          expect(b.raw[site.offset]).toBe(0x41);
          checked++;
        }
      }
    }
    expect(checked).toBe(33);
  });

  it('Secret: all 40 sites are ALSO first-byte 0x41 — the same base-table gap, not a CoK-specific one (Secret shares plain ECL_GEN1, not a Secret-specific override)', () => {
    const files = [1, 2, 3].map((n) => resolve(SECRET_DIR, `ECL${n}.DAX`));
    if (!files.every((f) => existsSync(f))) return;
    let checked = 0;
    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(f));
      for (const b of readDaxDataBlocks(bytes)) {
        const r = walkEclReachable(b.raw, ECL_GEN1);
        for (const site of r.desyncSites) {
          expect(b.raw[site.offset]).toBe(0x41);
          checked++;
        }
      }
    }
    expect(checked).toBe(40);
  });

  it('DoK: 58 of 58 sites are first-byte 0x41 under DoK\'s OWN dialect — round 34\'s "47 of 72, residual 25 are a SEPARATE gap" is FALSIFIED, and both measurements are kept', () => {
    const files = ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(DOK_DIR, f));
    if (!files.every((f) => existsSync(f))) return;

    const measure = (dialect: EclDialect) => {
      let is0x41 = 0;
      let total = 0;
      const otherFirstBytes = new Set<number>();
      for (const f of files) {
        const bytes = new Uint8Array(readFileSync(f));
        for (const b of readDaxDataBlocks(bytes)) {
          for (const site of walkEclReachable(b.raw, dialect).desyncSites) {
            total++;
            if (b.raw[site.offset] === 0x41) is0x41++;
            else otherFirstBytes.add(b.raw[site.offset]);
          }
        }
      }
      return { total, is0x41, otherFirstBytes: [...otherFirstBytes].sort((x, y) => x - y) };
    };

    // WHAT ROUND 34 MEASURED, kept verbatim as the prior state: under the SHARED `ECL_GEN1_SHORT`,
    // 47 of 72, with 20 distinct other first bytes. That scatter is what got called "a separate
    // gap"; it is what an operand-count error looks like from the other side, since a wrong word
    // set puts the walker on arbitrary mid-instruction bytes.
    const shared = measure(ECL_GEN1_SHORT);
    expect(shared.total).toBe(72);
    expect(shared.is0x41).toBe(47);
    expect(shared.otherFirstBytes.length).toBe(20);

    // WHAT DoK'S OWN DIALECT MEASURES: 58 of 58, no residue at all. Three operand counts read from
    // DoK's own handler bytes (0x1f, 0x27, 0x29) account for every one of the 25 "other" sites.
    const own = measure(ECL_GEN1_SHORT_DOK);
    expect(own.total).toBe(58);
    expect(own.is0x41).toBe(58);
    expect(own.otherFirstBytes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The override measurement: does the SAME single opcode-0x41 frame (wordSet 2, first operand a
// 2-byte imm, second a 3-byte word: 6 bytes total) close the gap with NO shallow regression?
// This is the plan's Method step 4 ("try a test-local opcodeOverrides frame ... report which single
// override drops the corpus count most"), and it is the module's central falsification of P1: the
// fix that actually works has nothing to do with fall-through liveness.
// ---------------------------------------------------------------------------------------------
import { disassembleEclBlock } from '../src/ecl/disassemble.js';

const TEST_LOCAL_0X41_COK: EclDialect = {
  ...ECL_GEN1,
  opcodeOverrides: { ...ECL_GEN1.opcodeOverrides, 0x41: { wordSet: 2, mnemonic: 'TEST_LOCAL_0x41', uncertain: true } },
};
const TEST_LOCAL_0X41_SECRET: EclDialect = {
  ...ECL_GEN1,
  opcodeOverrides: { ...ECL_GEN1.opcodeOverrides, 0x41: { wordSet: 2, mnemonic: 'TEST_LOCAL_0x41', uncertain: true } },
};
const TEST_LOCAL_0X41_DOK: EclDialect = {
  ...ECL_GEN1_SHORT,
  opcodeOverrides: { ...ECL_GEN1_SHORT.opcodeOverrides, 0x41: { wordSet: 2, mnemonic: 'TEST_LOCAL_0x41', uncertain: true } },
};
/** The same test-local frame on top of DoK's OWN dialect (round 35 R1). */
const TEST_LOCAL_0X41_DOK_OWN: EclDialect = {
  ...ECL_GEN1_SHORT_DOK,
  opcodeOverrides: { ...ECL_GEN1_SHORT_DOK.opcodeOverrides, 0x41: { wordSet: 2, mnemonic: 'TEST_LOCAL_0x41', uncertain: true } },
};

describe('single-override falsification of P1: opcode 0x41 (wordSet 2), not dead-fallthrough, explains CoK/Secret entirely', () => {
  it('P2 (exceeded): the override drops CoK 33 -> 0 and Secret 40 -> 0 deep desyncs with ZERO shallow-census regression', () => {
    const cokFiles = ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(COK_DIR, f));
    const secretFiles = [1, 2, 3].map((n) => resolve(SECRET_DIR, `ECL${n}.DAX`));
    if (!cokFiles.every((f) => existsSync(f)) || !secretFiles.every((f) => existsSync(f))) return;

    let cokDeepBase = 0, cokDeepOverride = 0, cokShallowBase = 0, cokShallowOverride = 0;
    for (const f of cokFiles) {
      const bytes = new Uint8Array(readFileSync(f));
      for (const b of readDaxDataBlocks(bytes)) {
        cokDeepBase += walkEclReachable(b.raw, ECL_GEN1).desyncSites.length;
        cokDeepOverride += walkEclReachable(b.raw, TEST_LOCAL_0X41_COK).desyncSites.length;
        if (disassembleEclBlock(b.raw, ECL_GEN1).badOpcodeAt !== undefined) cokShallowBase++;
        if (disassembleEclBlock(b.raw, TEST_LOCAL_0X41_COK).badOpcodeAt !== undefined) cokShallowOverride++;
      }
    }
    expect(cokDeepBase).toBe(33);
    expect(cokDeepOverride).toBe(0);
    expect(cokShallowBase).toBe(0);
    expect(cokShallowOverride).toBe(0); // no regression

    let secretDeepBase = 0, secretDeepOverride = 0;
    for (const f of secretFiles) {
      const bytes = new Uint8Array(readFileSync(f));
      for (const b of readDaxDataBlocks(bytes)) {
        secretDeepBase += walkEclReachable(b.raw, ECL_GEN1).desyncSites.length;
        secretDeepOverride += walkEclReachable(b.raw, TEST_LOCAL_0X41_SECRET).desyncSites.length;
      }
    }
    expect(secretDeepBase).toBe(40);
    expect(secretDeepOverride).toBe(0);
  });

  it('the SAME override on DoK: 72 -> 29 under the shared dialect (round 34), but 58 -> 0 under DoK\'s own — it DOES close the corpus, and the 29 that survived were word-set drift, not a second opcode gap', () => {
    const files = ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(DOK_DIR, f));
    if (!files.every((f) => existsSync(f))) return;

    const measure = (base: EclDialect, withOverride: EclDialect) => {
      let baseCount = 0, overrideCount = 0;
      for (const f of files) {
        const bytes = new Uint8Array(readFileSync(f));
        for (const b of readDaxDataBlocks(bytes)) {
          baseCount += walkEclReachable(b.raw, base).desyncSites.length;
          overrideCount += walkEclReachable(b.raw, withOverride).desyncSites.length;
        }
      }
      return { baseCount, overrideCount };
    };

    // Round 34's measurement, kept: the override did not close DoK, and that residue is what got
    // recorded as an open finding rather than smoothed away. Keeping it is the point -- it is the
    // measurement that was correct about there being SOMETHING left, and wrong about what.
    const shared = measure(ECL_GEN1_SHORT, TEST_LOCAL_0X41_DOK);
    expect(shared).toEqual({ baseCount: 72, overrideCount: 29 });

    // Under DoK's own dialect the same single override closes the corpus outright, exactly as it
    // does for CoK and Secret above.
    const own = measure(ECL_GEN1_SHORT_DOK, TEST_LOCAL_0X41_DOK_OWN);
    expect(own).toEqual({ baseCount: 58, overrideCount: 0 });
  });

  it('cross-oracle: Buck\'s OWN independently-derived ECL_GEN1_BUCK.opcodeOverrides[0x41] (from Countdown\'s binary dispatch table, unrelated to this measurement) already carries wordSet: 2 — agreeing with the byte-derived frame above without having been consulted for it', () => {
    expect(ECL_GEN1_BUCK.opcodeOverrides?.[0x41]).toMatchObject({ wordSet: 2 });
  });
});

// ---------------------------------------------------------------------------------------------
// Bar B (EclDump oracle) — reported VOID. See the module docblock and the research doc for why:
// EclDump.exe's own opcode table (EclDump.il's SetupCommandTable) is dense ONLY over 0x00..0x40 —
// the IDENTICAL upper bound `KRYNN_GEN1_OPCODES`/`ECL_OPCODE_MAX` was reverse-engineered FROM. Its
// silence at every 0x41 site is therefore GUARANTEED regardless of whether the gap is real or dead:
// EclDump structurally cannot decode opcode 0x41, so "EclDump emits nothing" cannot discriminate
// between the two hypotheses the plan's Bar B was built to separate. This test pins the raw
// measurement (0/33 — generated listings in build/r1-ecldump/*.txt, EclDump.exe run against CoK's
// own ECL1-3.DAX) without treating it as a pass.
describe('Bar B (EclDump oracle) — measurement only, verdict reported VOID in the research doc', () => {
  const dumpDir = resolve(repoRoot, 'build', 'r1-ecldump');
  const have = existsSync(resolve(dumpDir, 'ECL1_033.txt'));

  it.skipIf(!have)('EclDump emits no instruction at ANY of CoK\'s 33 desync vaddrs (0/33) — consistent with dead OR with a gap EclDump cannot see either way', () => {
    const fileNum: Record<string, number> = { 'ECL1.DAX': 1, 'ECL2.DAX': 2, 'ECL3.DAX': 3 };
    let emits = 0;
    let total = 0;
    for (const f of ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX']) {
      const bytes = new Uint8Array(readFileSync(resolve(COK_DIR, f)));
      for (const b of readDaxDataBlocks(bytes)) {
        const r = walkEclReachable(b.raw, ECL_GEN1);
        for (const site of r.desyncSites) {
          total++;
          const blockPad = String(b.blockId).padStart(3, '0');
          const dumpPath = resolve(dumpDir, `ECL${fileNum[f]}_${blockPad}.txt`);
          if (!existsSync(dumpPath)) continue;
          const txt = readFileSync(dumpPath, 'utf8');
          const vaddrHex = '0x' + site.vaddr.toString(16).toUpperCase().padStart(4, '0');
          if (new RegExp('^' + vaddrHex + ' ', 'm').test(txt)) emits++;
        }
      }
    }
    expect(total).toBe(33);
    expect(emits).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Bar C (VM execution oracle) — FALSIFIES "0 executed": at least one CoK site and one DoK site are
// genuinely reached by a from-cold bare EclVm run from all five header entries (same disclosed
// substitution eclReachability.test.ts uses for its own VM oracle: no *Route.test.ts file exports a
// reusable harness, so a fresh EclVm per entry point, no scripted memory, stepBudget 3000, is used
// instead). This is the round's most important finding per the plan's own framing of the
// alternative: >= 1 executed site turns this into a live-VM-execution issue, not merely a static
// walker curiosity.
// ---------------------------------------------------------------------------------------------
function pcsVisitedAllEntries(raw: Uint8Array, dialect: EclDialect): Set<number> {
  const header = parseEclHeader(raw, dialect);
  const toOff = (w: number) => (w >= dialect.vbase ? w - dialect.vbase : w);
  const entryOffsets = [
    header.vmRun1,
    header.searchLocation,
    header.preCampCheck,
    header.campInterrupted,
    header.eclInitialEntry,
  ].map(toOff);
  const visited = new Set<number>();
  const seen = new Set<number>();
  for (const entry of entryOffsets) {
    if (entry < dialect.headerLen || entry >= raw.length || seen.has(entry)) continue;
    seen.add(entry);
    const vm = new EclVm(raw, { dialect, entry, stepBudget: 3000 });
    for (let i = 0; i < 3000; i++) {
      visited.add(vm.pc); // record BEFORE stepping: EclVm.step() halts gracefully on a bad opcode
      // (returns instruction: null, status: 'halted') rather than throwing, so the offset it tried
      // to decode at is only visible via `vm.pc` at the moment of the call, not via the result.
      const r = vm.step();
      if (r.done) break;
    }
  }
  return visited;
}

describe('Bar C — VM execution oracle: does any entry-point run actually reach a desync PC?', () => {
  it('CoK block 16 offset 0x79a IS reached — a full GOSUB(0x796->0xdb0 HORIZONTAL_MENU)->RETURN(0xdd6)->resume(0x79a) sequence, from searchLocation, with zero scripted memory', () => {
    const bytes = new Uint8Array(readFileSync(resolve(COK_DIR, 'ECL1.DAX')));
    const b = readDaxDataBlocks(bytes).find((bb) => bb.blockId === 16)!;
    const visited = pcsVisitedAllEntries(b.raw, ECL_GEN1);
    expect(visited.has(0x79a)).toBe(true);
    // The desync site itself: confirms the walker's own static claim and the VM's real execution
    // agree on this exact offset.
    const deep = walkEclReachable(b.raw, ECL_GEN1);
    expect(deep.desyncSites.map((s) => s.offset)).toEqual([0x79a]);
  });

  it('DoK block 33 offset 0x51b: reached under the SHARED dialect, NOT a site and NOT reached under DoK\'s own — round 34\'s "different opcode gap, first byte 0x80" was an alignment artefact', () => {
    const bytes = new Uint8Array(readFileSync(resolve(DOK_DIR, 'ECL1.DAX')));
    const b = readDaxDataBlocks(bytes).find((bb) => bb.blockId === 33)!;

    // Round 34's measurement, reproduced exactly. Byte 0x80 really is there and the VM really did
    // decode at that offset -- the observation was sound; the INFERENCE ("a different opcode gap")
    // was not.
    expect(b.raw[0x51b]).toBe(0x80);
    expect(pcsVisitedAllEntries(b.raw, ECL_GEN1_SHORT).has(0x51b)).toBe(true);
    expect(walkEclReachable(b.raw, ECL_GEN1_SHORT).desyncSites.map((x) => x.offset)).toContain(0x51b);

    // Under DoK's own dialect the walker never lands there and the VM never decodes there: 0x51b
    // is an interior byte of a correctly-sized instruction, not an opcode.
    expect(walkEclReachable(b.raw, ECL_GEN1_SHORT_DOK).desyncSites.map((x) => x.offset)).not.toContain(0x51b);
    expect(pcsVisitedAllEntries(b.raw, ECL_GEN1_SHORT_DOK).has(0x51b)).toBe(false);
  });

  it('Secret: 0/40 desync sites are reached by this same oracle — Bar C\'s "0 executed" DOES hold for Secret specifically, even though it does not for CoK/DoK', () => {
    const files = [1, 2, 3].map((n) => resolve(SECRET_DIR, `ECL${n}.DAX`));
    if (!files.every((f) => existsSync(f))) return;
    let totalDesync = 0;
    let visitedCount = 0;
    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(f));
      for (const b of readDaxDataBlocks(bytes)) {
        const deep = walkEclReachable(b.raw, ECL_GEN1);
        if (deep.desyncSites.length === 0) continue;
        totalDesync += deep.desyncSites.length;
        const visited = pcsVisitedAllEntries(b.raw, ECL_GEN1);
        for (const site of deep.desyncSites) if (visited.has(site.offset)) visitedCount++;
      }
    }
    expect(totalDesync).toBe(40);
    expect(visitedCount).toBe(0);
  });

  it('CoK+DoK combined: 1 of the 91 (33+58) desync sites is reached by this oracle — P3 ("0 executed") is STILL FALSIFIED, but by CoK alone; DoK\'s contribution was an artefact of the shared dialect', () => {
    // Round 34 measured 2 of 105 under the shared `ECL_GEN1_SHORT`. Under DoK's own dialect the
    // DoK hit (block 33 @0x51b, byte 0x80) is gone -- see the test above -- so the honest figure is
    // 1 of 91, from CoK's ECL1.DAX block 16 @0x79a, first byte 0x41. The claim survives on a
    // narrower base, which is the whole reason it is re-measured here rather than left at 2/105.
    let visitedCount = 0;
    let totalDesync = 0;
    for (const [dir, dialect] of [
      [COK_DIR, ECL_GEN1],
      [DOK_DIR, ECL_GEN1_SHORT_DOK],
    ] as const) {
      for (const f of ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX']) {
        const bytes = new Uint8Array(readFileSync(resolve(dir, f)));
        for (const b of readDaxDataBlocks(bytes)) {
          const deep = walkEclReachable(b.raw, dialect);
          if (deep.desyncSites.length === 0) continue;
          totalDesync += deep.desyncSites.length;
          const visited = pcsVisitedAllEntries(b.raw, dialect);
          for (const site of deep.desyncSites) if (visited.has(site.offset)) visitedCount++;
        }
      }
    }
    expect(totalDesync).toBe(91);
    expect(visitedCount).toBe(1);
  });
});
