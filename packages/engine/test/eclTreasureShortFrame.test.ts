/**
 * Round 33 R2 (`docs/engine/PLAN-ROUND-33.md`): a tail golden for the `0x27 TREASURE`
 * `{wordSet: 4, countAt: 3}` frame that `EclVm.exec()`'s `case 0x27` now discriminates via
 * `this.dialect.opcodeOverrides?.[0x27]?.countAt !== undefined` (see `vm.ts`'s doc comment on the
 * `'treasure'` effect and on `case 0x27` itself). Before this round the case read `operands[7]`
 * unconditionally, which was ALREADY wrong for DQK's real, shipped `ECL_GEN2` dialect (it ships
 * this same 4+tail frame) whenever the tail held fewer than 4 items.
 *
 * Three dialects are exercised:
 *  - the real, shipped `ECL_GEN2` (DQK) — proof the frame-aware case is correct for production.
 *  - test-LOCAL Pools/Treasures dialects carrying the `countAt` override that
 *    `ECL_GEN1_SHORT_POOLS`/`ECL_GEN1_SHORT_TREASURES` do NOT ship this round (see the extensive
 *    "MEASURED but NOT SHIPPED" doc comment in `disassemble.ts` above those two dialects, and the
 *    round-33 R2 report, for why: shipping it changes 4 pre-existing Pools/Treasures route test
 *    files this item is forbidden to touch). These two local dialects exist ONLY to prove the VM
 *    fix is dialect-shape-generic, not DQK-specific — they must never be imported by production
 *    code or by another test as a stand-in for the real, unshipped dialects.
 *
 * All three run the SAME byte pattern: TREASURE #10,#20,#30,#2,#7,#0xff EXIT — four fixed
 * operands (three "gold" accumulators + a count of 2), then two tail item operands where the
 * second is the `0xff` "no item" sentinel that `itemTail` must filter out.
 */
import { describe, expect, it } from 'vitest';
import { EclVm, ECL_GEN2, ECL_GEN1_SHORT_POOLS, ECL_GEN1_SHORT_TREASURES, type EclDialect } from '../src/index.js';

const imm = (v: number) => [0x00, v & 0xff];

/** Gen1 block: 22-byte header (magic 0x1388) + body. */
function gen1Block(...body: number[]): Uint8Array {
  const raw = new Uint8Array(22 + body.length);
  raw[0] = 0x88; raw[1] = 0x13; // magic = 0x1388
  raw.set(body, 22);
  return raw;
}

/** Gen2 block: 20-byte header (5 far-pointer slots, no magic) + body. */
function gen2Block(...body: number[]): Uint8Array {
  const raw = new Uint8Array(20 + body.length);
  for (let slot = 0; slot < 5; slot++) {
    const off = slot * 4;
    raw[off] = 0x01; raw[off + 1] = 0x01; raw[off + 2] = 0x14; raw[off + 3] = 0x80;
  }
  raw.set(body, 20);
  return raw;
}

// TREASURE #10,#20,#30,#2, tail=[#7,#0xff], EXIT
const TREASURE_BODY = [
  0x27, ...imm(10), ...imm(20), ...imm(30), ...imm(2), ...imm(7), ...imm(0xff),
  0x00,
];

/** Test-local ONLY — proves the frame-aware VM case, not a shipped dialect. Never import elsewhere. */
const POOLS_COUNT_AT_3: EclDialect = {
  ...ECL_GEN1_SHORT_POOLS,
  opcodeOverrides: {
    ...ECL_GEN1_SHORT_POOLS.opcodeOverrides,
    0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' },
  },
};

/** Test-local ONLY — proves the frame-aware VM case, not a shipped dialect. Never import elsewhere. */
const TREASURES_COUNT_AT_3: EclDialect = {
  ...ECL_GEN1_SHORT_TREASURES,
  opcodeOverrides: {
    ...ECL_GEN1_SHORT_TREASURES.opcodeOverrides,
    0x27: { wordSet: 4, countAt: 3, mnemonic: 'TREASURE' },
  },
};

describe('TREASURE (0x27) gold3Tail frame — frame-aware case, all three countAt-3 dialects', () => {
  it('ECL_GEN2 (real, shipped): partyGold + itemTail with the 0xff sentinel filtered', () => {
    const vm = new EclVm(gen2Block(...TREASURE_BODY), { dialect: ECL_GEN2 });
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toHaveLength(1);
    const fx = r.effects[0];
    if (fx.type !== 'treasure') throw new Error(`expected treasure effect, got ${fx.type}`);
    expect(fx.frame).toBe('gold3Tail');
    expect(fx.partyGold).toEqual([10, 20, 30]);
    expect(fx.itemTail).toEqual([7]);
    expect(fx.operands).toEqual([10, 20, 30, 2, 7, 0xff]);
  });

  it('Pools (test-local countAt-3 dialect, NOT the shipped ECL_GEN1_SHORT_POOLS): same frame', () => {
    const vm = new EclVm(gen1Block(...TREASURE_BODY), { dialect: POOLS_COUNT_AT_3 });
    const r = vm.run();
    expect(r.status).toBe('exited');
    const fx = r.effects[0];
    if (fx.type !== 'treasure') throw new Error(`expected treasure effect, got ${fx.type}`);
    expect(fx.frame).toBe('gold3Tail');
    expect(fx.partyGold).toEqual([10, 20, 30]);
    expect(fx.itemTail).toEqual([7]);
  });

  it('Treasures (test-local countAt-3 dialect, NOT the shipped ECL_GEN1_SHORT_TREASURES): same frame', () => {
    const vm = new EclVm(gen1Block(...TREASURE_BODY), { dialect: TREASURES_COUNT_AT_3 });
    const r = vm.run();
    expect(r.status).toBe('exited');
    const fx = r.effects[0];
    if (fx.type !== 'treasure') throw new Error(`expected treasure effect, got ${fx.type}`);
    expect(fx.frame).toBe('gold3Tail');
    expect(fx.partyGold).toEqual([10, 20, 30]);
    expect(fx.itemTail).toEqual([7]);
  });

  it('base coins7Item frame (no countAt override) is unaffected by the frame-aware case', () => {
    // Sanity control: the SAME opcode byte under a dialect with no `countAt` on 0x27 still takes
    // the original 8-operand coins+item reading, proving the branch in `case 0x27` is real, not
    // a no-op that always picks gold3Tail.
    //
    // UPDATED 2026-09-04 (round 33 Phase B): this control used `ECL_GEN1_SHORT_POOLS` directly,
    // which was a no-override dialect when R2 wrote it. Phase B shipped `0x27`'s
    // `{wordSet: 4, countAt: 3}` frame to Pools and Treasures, so that dialect now HAS the
    // override and this control was silently measuring the same branch as the tests above. It is
    // now built explicitly by stripping the override, which is what the control always meant.
    const NO_COUNTAT: EclDialect = (() => {
      const { 0x27: _dropped, ...rest } = ECL_GEN1_SHORT_POOLS.opcodeOverrides ?? {};
      return { ...ECL_GEN1_SHORT_POOLS, opcodeOverrides: rest };
    })();
    const body = [0x27, ...imm(1), ...imm(2), ...imm(3), ...imm(4), ...imm(5), ...imm(6), ...imm(7), ...imm(9), 0x00];
    const vm = new EclVm(gen1Block(...body), { dialect: NO_COUNTAT });
    const r = vm.run();
    const fx = r.effects[0];
    if (fx.type !== 'treasure') throw new Error(`expected treasure effect, got ${fx.type}`);
    expect(fx.frame).toBe('coins7Item');
    expect(fx.itemBlockId).toBe(9);
    expect(fx.partyGold).toBeUndefined();
  });
});
