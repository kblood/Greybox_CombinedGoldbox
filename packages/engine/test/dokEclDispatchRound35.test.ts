/**
 * R1 (round 35): Death Knights of Krynn's own ECL word sets, and the two nulls that say which
 * parts of the census could NOT have decided them.
 *
 * WHAT THIS FILE IS FOR. Until this round DoK was the only Gen1 title whose ECL operand counts
 * came entirely from inheriting the shared `ECL_GEN1_SHORT` literal. It had a dispatch map since
 * 2026-07-17 (`build/dok-ecl-dispatch-map.json`) that stopped at "opcode -> handler file offset"
 * and never derived an operand-parser target or read a single handler prologue. Round 35 R1 ran
 * DoK's own `GAME.OVR` through `tools/map_gen1_ecl_dispatch.py` (see
 * `tools/test_map_gen1_ecl_dispatch.py::DokRealBytesTests` for the binary-side pins and
 * `docs/engine/research/dok-ecl-word-sets.md` for the write-up) and split
 * `ECL_GEN1_SHORT_DOK` off the shared literal with three corrections:
 * `0x1f` 2 -> 1, `0x27` 8 -> 4 with `countAt: 3`, `0x29` 14 -> 0.
 *
 * THE POINT OF THE NULLS BELOW. Two of those three corrections are things the ECL CORPUS CANNOT
 * DECIDE, and this file measures that rather than letting the census take credit for them:
 *
 *   * `0x1f` = 0 and `0x1f` = 1 produce identical block, shallow-desync, deep-desync and
 *     misaligned-target counts on the whole DoK corpus -- i.e. every number the census actually
 *     pins. Only reachable bytes separates them, by 3.1%.
 *   * `0x27` `{wordSet: 4, countAt: 3}` and a flat `{wordSet: 4}` produce identical desync and
 *     misaligned-target counts; only reachable bytes separate them.
 *
 * In both cases the handler byte is the only evidence, and the corpus is FREE-AGREEING. That is
 * the shape this repo has been burned by before ("the null decides the finding"), so it is pinned
 * here as a first-class assertion, not mentioned in a comment.
 *
 * SCOPE BOUNDARY: every number here is an operand COUNT and a decode-coverage consequence of it.
 * No opcode SEMANTICS are claimed for any of the three corrected opcodes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { EclVm } from '../src/ecl/vm.js';
import {
  disassembleEclBlock,
  parseEclHeader,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_DOK,
  type EclDialect,
} from '../src/ecl/disassemble.js';
import { walkEclReachable } from '../src/ecl/reachability.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const DOK_DIR = resolve(repoRoot, 'Death Knights of Krynn');
const DOK_FILES = ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].map((f) => resolve(DOK_DIR, f));
const HAVE_DOK = DOK_FILES.every((f) => existsSync(f));

interface DokCensus {
  blocks: number;
  shallowDesync: number;
  deepDesync: number;
  misalignedTargets: number;
  reachableBytes: number;
  desyncSites: string[];
}

function censusDok(dialect: EclDialect): DokCensus {
  const acc: DokCensus = {
    blocks: 0,
    shallowDesync: 0,
    deepDesync: 0,
    misalignedTargets: 0,
    reachableBytes: 0,
    desyncSites: [],
  };
  for (const file of DOK_FILES) {
    const bytes = new Uint8Array(readFileSync(file));
    const name = file.slice(file.lastIndexOf('\\') + 1).replace(/^.*\//, '');
    for (const block of readDaxDataBlocks(bytes)) {
      acc.blocks++;
      const shallow = disassembleEclBlock(block.raw, dialect);
      if (shallow.badOpcodeAt !== undefined) acc.shallowDesync++;
      const deep = walkEclReachable(block.raw, dialect);
      acc.deepDesync += deep.desyncSites.length;
      acc.misalignedTargets += deep.misalignedTargets.length;
      acc.reachableBytes += deep.reachableBytes;
      for (const site of deep.desyncSites) {
        acc.desyncSites.push(`${name}#${block.blockId}@0x${site.offset.toString(16)}`);
      }
    }
  }
  return acc;
}

/** A dialect identical to `ECL_GEN1_SHORT_DOK` except for one deliberately altered opcode frame. */
function dokWith(overrides: {
  wordSet?: Record<number, number>;
  opcodes?: Record<number, { wordSet: number; countAt?: number; mnemonic?: string }>;
  dropOpcodes?: number[];
}): EclDialect {
  const opcodeOverrides = { ...ECL_GEN1_SHORT_DOK.opcodeOverrides, ...(overrides.opcodes ?? {}) };
  for (const op of overrides.dropOpcodes ?? []) delete opcodeOverrides[op];
  return {
    ...ECL_GEN1_SHORT_DOK,
    wordSetOverrides: { ...ECL_GEN1_SHORT_DOK.wordSetOverrides, ...(overrides.wordSet ?? {}) },
    opcodeOverrides,
  };
}

describe('DoK ECL word sets (round 35 R1) — dialect shape', () => {
  it('is a SPLIT off ECL_GEN1_SHORT, never an edit of it', () => {
    // The round-32 Gateway/Treasures rule: three other titles (Pools, Gateway, Treasures) inherit
    // the shared literal and nothing here was measured on their binaries. If a future change
    // "simplifies" this by editing `ECL_GEN1_SHORT` in place, this goes RED.
    expect(ECL_GEN1_SHORT.wordSetOverrides?.[0x1f]).toBeUndefined();
    expect(ECL_GEN1_SHORT.wordSetOverrides?.[0x29]).toBeUndefined();
    expect(ECL_GEN1_SHORT.opcodeOverrides?.[0x27]).toBeUndefined();
    expect(ECL_GEN1_SHORT.headerLen).toBe(22);
    expect(ECL_GEN1_SHORT.vbase).toBe(0x7ffe);
  });

  it('carries exactly the three measured corrections, and puts each in the table the decoder reads', () => {
    // `wordSetOverrides` is a MODIFIER on an existing base def; it is only read once
    // `opcodeOverrides?.[op] ?? KRYNN_GEN1_OPCODES[op]` has produced one. 0x1f and 0x29 both have
    // base defs, so a wordSet override is the right home for them. 0x27 needs `countAt` too, which
    // only lives on an `OpcodeDef`, so it must be an opcodeOverride.
    expect(ECL_GEN1_SHORT_DOK.wordSetOverrides?.[0x1f]).toBe(1);
    expect(ECL_GEN1_SHORT_DOK.wordSetOverrides?.[0x29]).toBe(0);
    expect(ECL_GEN1_SHORT_DOK.opcodeOverrides?.[0x27]).toEqual({
      wordSet: 4,
      countAt: 3,
      mnemonic: 'TREASURE',
    });
    // Inherited, deliberately not re-stated: DoK measures 0x41 = 2 from its own `mov al,2` at
    // GAME.OVR 0x2e15, and round 34 already put that in the BASE table, so an override here would
    // be a free-agreement claim.
    expect(ECL_GEN1_SHORT_DOK.opcodeOverrides?.[0x41]).toBeUndefined();
    expect(ECL_GEN1_SHORT_DOK.wordSetOverrides?.[0x41]).toBeUndefined();
    // Everything the shared literal already had survives the split.
    expect(ECL_GEN1_SHORT_DOK.wordSetOverrides?.[0x0c]).toBe(4);
    expect(ECL_GEN1_SHORT_DOK.wordSetOverrides?.[0x2c]).toBe(1);
    expect(ECL_GEN1_SHORT_DOK.opcodeOverrides?.[0x31]).toEqual(ECL_GEN1_SHORT.opcodeOverrides?.[0x31]);
  });
});

describe.skipIf(!HAVE_DOK)('DoK ECL word sets (round 35 R1) — corpus census and its nulls', () => {
  it('closes the residual 29-site DoK gap round 34 left open', () => {
    const before = censusDok(ECL_GEN1_SHORT);
    const after = censusDok(ECL_GEN1_SHORT_DOK);
    // eslint-disable-next-line no-console
    console.log('DoK census — ECL_GEN1_SHORT:', before, '\nDoK census — ECL_GEN1_SHORT_DOK:', after);
    // The fixture really is there and really does contain work: assert this BEFORE any
    // zero-valued expectation below, so "0 desyncs" can never be "0 blocks read".
    expect(before.blocks).toBe(25);
    expect(after.blocks).toBe(25);
    expect(before.deepDesync).toBe(29);
    expect(before.shallowDesync).toBe(1);
    expect(before.misalignedTargets).toBe(202);
    expect(before.reachableBytes).toBe(132423);
    // Round 34 Phase B recorded these 29 sites as "a scattered, separate gap that 0x41 does NOT
    // explain" and pinned 0x51b/byte 0x80 as VM-reachable-from-cold. Three handler-derived operand
    // counts account for all 29.
    expect(after.deepDesync).toBe(0);
    expect(after.desyncSites).toEqual([]);
    expect(after.shallowDesync).toBe(0);
    expect(after.misalignedTargets).toBe(2);
    expect(after.reachableBytes).toBe(140730);
    expect(after.reachableBytes).toBeGreaterThan(before.reachableBytes);
  });

  it('NULL: every number the census pins is blind to 0x1f = 0 vs 0x1f = 1', () => {
    // DoK's 0x1f handler at GAME.OVR 0x2fc3 is `mov al,1; push ax; lcall 0x41,0x2a`, so the value
    // is 1. The census does NOT say that. 0 and 1 give the SAME 25 blocks, 0 shallow desyncs, 0
    // deep desyncs and 2 misaligned targets -- every quantity `CENSUS_PINS` records. The only
    // measurement that separates them at all is reachable bytes, 136,538 vs 140,730 (+3.1%), and
    // "maximise reachable bytes" is a weak tiebreak this repo has been wrong with before. So the
    // value is the handler's, and this test exists to stop a later reader from crediting the
    // corpus with it. (The inherited 2 IS separable -- see the last two expectations.)
    const asOne = censusDok(ECL_GEN1_SHORT_DOK);
    const asZero = censusDok(dokWith({ wordSet: { 0x1f: 0 } }));
    const asTwo = censusDok(dokWith({ wordSet: { 0x1f: 2 } }));
    // eslint-disable-next-line no-console
    console.log('DoK 0x1f null — ws0:', asZero, '\n ws1:', asOne, '\n ws2:', asTwo);
    expect(asZero.blocks).toBe(asOne.blocks);
    expect(asZero.shallowDesync).toBe(asOne.shallowDesync);
    expect(asZero.deepDesync).toBe(asOne.deepDesync);
    expect(asZero.misalignedTargets).toBe(asOne.misalignedTargets);
    expect(asZero.reachableBytes).toBe(136538);
    expect(asOne.reachableBytes).toBe(140730);
    // ...and the inherited value the split moved away from IS separable, which is why the
    // correction is a real corpus-visible finding even though its exact value is not.
    expect(asTwo.deepDesync).toBe(20);
    expect(asTwo.misalignedTargets).toBe(166);
    expect(asTwo.deepDesync).toBeGreaterThan(asOne.deepDesync);
  });

  it('NULL: the corpus cannot tell 0x27 countAt-3 from a flat wordSet-4 on desyncs', () => {
    // The `countAt: 3` comes from the handler at 0x2150: it prefetches 4, reads operand 4 into
    // [bp-1], `dec word ptr [0x8c48]`s the ECL PC, then issues a SECOND prefetch whose count is
    // that operand's value. On the corpus, dropping `countAt` changes NOTHING about desyncs or
    // misaligned targets; only reachable bytes move, and by less than 1%.
    const withCount = censusDok(ECL_GEN1_SHORT_DOK);
    const flat = censusDok({
      ...ECL_GEN1_SHORT_DOK,
      opcodeOverrides: {
        ...ECL_GEN1_SHORT_DOK.opcodeOverrides,
        0x27: { wordSet: 4, mnemonic: 'TREASURE' },
      },
    });
    // eslint-disable-next-line no-console
    console.log('DoK 0x27 null — countAt3:', withCount, '\n flat4:', flat);
    expect(flat.deepDesync).toBe(withCount.deepDesync);
    expect(flat.misalignedTargets).toBe(withCount.misalignedTargets);
    expect(flat.reachableBytes).toBe(139562);
    expect(withCount.reachableBytes).toBe(140730);
    expect(withCount.reachableBytes).toBeGreaterThan(flat.reachableBytes);
  });

  it('the inherited 0x27 = 8 IS separable, so that part of the correction is corpus-visible', () => {
    const inheritedEight = censusDok(dokWith({ dropOpcodes: [0x27] }));
    const measuredFour = censusDok(ECL_GEN1_SHORT_DOK);
    expect(inheritedEight.deepDesync).toBeGreaterThan(measuredFour.deepDesync);
  });

  it('the inherited 0x29 = 14 IS separable, and 0x29 = 0 is the handler value', () => {
    // Handler 0x30e6 is nine bytes: `push bp; mov bp,sp; inc word ptr [0x8c48]; pop bp; retf`.
    // No call of any kind, so nothing in it can consume a script byte.
    const measuredZero = censusDok(ECL_GEN1_SHORT_DOK);
    const inheritedFourteen = censusDok(dokWith({ wordSet: { 0x29: 14 } }));
    expect(inheritedFourteen.deepDesync).toBeGreaterThan(measuredZero.deepDesync);
  });
});

describe.skipIf(!HAVE_DOK)('DoK block 33 — the round-34 open finding, run from cold', () => {
  function block33(): Uint8Array {
    const bytes = new Uint8Array(readFileSync(DOK_FILES[0]));
    const found = readDaxDataBlocks(bytes).find((b) => b.blockId === 33);
    if (!found) throw new Error('DoK ECL1.DAX block 33 not present');
    return found.raw;
  }

  it('halts on a bad opcode at 0x51b under ECL_GEN1_SHORT, and exits cleanly under ECL_GEN1_SHORT_DOK', () => {
    const raw = block33();
    // Fixture presence asserted before any success expectation: byte 0x51b is what round 34 named,
    // and 0x80 is what it named it as. A "0 bad opcodes" result on an absent or empty block would
    // otherwise read as a fix.
    expect(raw.length).toBe(7550);
    expect(raw[0x51b]).toBe(0x80);

    // From COLD -- no scripted memory, no route. The site sits behind `searchLocation`'s own
    // per-descriptor dispatch, which needs exactly one input answer to get there, so `resume(0)`
    // is looped rather than the run being taken at face value after `run()`.
    const runFromSearchLocation = (dialect: EclDialect) => {
      const header = parseEclHeader(raw, dialect);
      const vm = new EclVm(raw, { dialect, entry: header.searchLocation - dialect.vbase, stepBudget: 200000 });
      let result = vm.run();
      let resumes = 0;
      while (resumes < 40 && (result.status === 'awaiting-input' || result.status === 'combat')) {
        result = vm.resume(0);
        resumes++;
      }
      return { result, resumes };
    };

    const before = runFromSearchLocation(ECL_GEN1_SHORT);
    // eslint-disable-next-line no-console
    console.log('DoK block 33 — ECL_GEN1_SHORT:', before.result.status, before.result.haltReason);
    expect(before.result.status).toBe('halted');
    // 1307 === 0x51b. This is the site round 34 Phase B recorded as the residual gap, reproduced
    // here from cold before it is closed. `resumes` is pinned too: if a future change made the run
    // halt before it ever paused, the halt would be a different halt.
    expect(before.result.haltReason).toBe('bad opcode at 1307');
    expect(before.resumes).toBe(1);

    const after = runFromSearchLocation(ECL_GEN1_SHORT_DOK);
    // eslint-disable-next-line no-console
    console.log('DoK block 33 — ECL_GEN1_SHORT_DOK:', after.result.status, after.result.haltReason);
    expect(after.result.status).toBe('exited');
    expect(after.result.haltReason).toBeUndefined();
    expect(after.resumes).toBe(1);
  });

  it('the other four header entry points were already clean under BOTH dialects', () => {
    // The honest boundary on the claim above: only `searchLocation` reached 0x51b. Saying "block
    // 33 was broken and now runs" without this would overstate a one-entry-point result.
    const raw = block33();
    for (const dialect of [ECL_GEN1_SHORT, ECL_GEN1_SHORT_DOK]) {
      const header = parseEclHeader(raw, dialect);
      for (const entryName of ['vmRun1', 'preCampCheck', 'campInterrupted', 'eclInitialEntry'] as const) {
        const vm = new EclVm(raw, { dialect, entry: header[entryName] - dialect.vbase, stepBudget: 200000 });
        expect(vm.run().status).toBe('exited');
      }
    }
  });
});
