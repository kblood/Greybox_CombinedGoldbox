/**
 * ECL chain runner tests (M2.S2b). Synthetic multi-block chains (memory persistence across
 * NEWECL, input auto-response, maxBlocks guard) + a golden across real CoK ECL1/2/3 where
 * block 18 chains to block 80 with the area flag set.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEclChain, blockSourceFrom, readDaxDataBlocks, ECL_HEADER_LEN } from '../src/index.js';

function block(...body: number[]): Uint8Array {
  const raw = new Uint8Array(ECL_HEADER_LEN + body.length);
  raw[0] = 0x88; raw[1] = 0x13; raw[2] = 0x01; raw[3] = 0x01;
  raw.set(body, ECL_HEADER_LEN);
  return raw;
}
const imm = (v: number) => [0x00, v & 0xff];
const addr = (w: number) => [0x01, w & 0xff, (w >> 8) & 0xff];

describe('runEclChain', () => {
  it('follows a NEWECL chain and carries memory across blocks', () => {
    // block 1: SAVE #7,0x4c00 ; NEWECL #2
    // block 2: SAVE #9,0x4c01 ; EXIT
    const src = blockSourceFrom([
      { blockId: 1, raw: block(0x09, ...imm(7), ...addr(0x4c00), 0x20, ...imm(2)) },
      { blockId: 2, raw: block(0x09, ...imm(9), ...addr(0x4c01), 0x00) },
    ]);
    const r = runEclChain(1, src);
    expect(r.status).toBe('exited');
    expect(r.visited).toEqual([1, 2]);
    expect(r.memory.get(0x4c00)).toBe(7); // set in block 1, survived the chain
    expect(r.memory.get(0x4c01)).toBe(9); // set in block 2
  });

  it('halts when a chained block is missing', () => {
    const src = blockSourceFrom([{ blockId: 1, raw: block(0x20, ...imm(99)) }]); // NEWECL #99
    const r = runEclChain(1, src);
    expect(r.status).toBe('halted');
    expect(r.haltReason).toMatch(/99 not found/);
    expect(r.visited).toEqual([1]);
  });

  it('bounds runaway chains with maxBlocks', () => {
    // block 1 chains to itself forever.
    const src = blockSourceFrom([{ blockId: 1, raw: block(0x20, ...imm(1)) }]);
    const r = runEclChain(1, src, { maxBlocks: 5 });
    expect(r.status).toBe('halted');
    expect(r.haltReason).toMatch(/maxBlocks/);
    expect(r.visited.length).toBe(5);
  });

  it('auto-answers input pauses headlessly', () => {
    // INPUT_NUMBER ignored,dest=0x4c20 ; EXIT — autoInput supplies 55.
    const src = blockSourceFrom([{ blockId: 1, raw: block(0x0f, ...imm(0), ...addr(0x4c20), 0x00) }]);
    const r = runEclChain(1, src, { autoInput: () => 55 });
    expect(r.status).toBe('exited');
    expect(r.memory.get(0x4c20)).toBe(55);
  });

  it('pauses for the host on input when no auto-responder, then resumes', () => {
    const src = blockSourceFrom([{ blockId: 1, raw: block(0x0f, ...imm(0), ...addr(0x4c20), 0x00) }]);
    const r1 = runEclChain(1, src);
    expect(r1.status).toBe('awaiting-input');
    expect(r1.resume).toBeTypeOf('function');
    const r2 = r1.resume!(42);
    expect(r2.status).toBe('exited');
    expect(r2.memory.get(0x4c20)).toBe(42);
  });

  it('resumes a combat pause with the host-supplied combat outcome', () => {
    const src = blockSourceFrom([{
      blockId: 1,
      raw: block(
        0x24,
        0x16, 0x09, ...imm(1), ...addr(0x4c22),
        0x18, 0x09, ...imm(2), ...addr(0x4c22),
        0x19, 0x09, ...imm(3), ...addr(0x4c22),
        0x00,
      ),
    }]);
    const r1 = runEclChain(1, src);
    expect(r1.status).toBe('combat');
    expect(r1.resume).toBeTypeOf('function');

    const r2 = r1.resume!(0, { combatOutcome: 'victory' });
    expect(r2.status).toBe('exited');
    expect(r2.memory.get(0x4c22)).toBe(1);
  });

  it('auto-continues combat with a callback-provided outcome', () => {
    const src = blockSourceFrom([{
      blockId: 1,
      raw: block(
        0x24,
        0x16, 0x09, ...imm(1), ...addr(0x4c22),
        0x18, 0x09, ...imm(2), ...addr(0x4c22),
        0x19, 0x09, ...imm(3), ...addr(0x4c22),
        0x00,
      ),
    }]);
    const r = runEclChain(1, src, { autoCombat: () => 'flee' });
    expect(r.status).toBe('exited');
    expect(r.memory.get(0x4c22)).toBe(3);
  });

  it('passes host VM context to chained blocks', () => {
    const src = blockSourceFrom([
      { blockId: 1, raw: block(0x20, ...imm(2)) },
      {
        blockId: 2,
        raw: block(
          0x0c, ...imm(9), ...imm(3), ...imm(5),
          0x22, ...addr(0x4c30), ...addr(0x4c31),
          0x1d, ...imm(3),
          0x1b, 0x09, ...imm(0xaa), ...addr(0x4c32),
          0x32, ...imm(31),
          0x16, 0x09, ...imm(0xbb), ...addr(0x4c33),
          0x3b, ...imm(22), ...addr(0x4c34), ...addr(0x4c35),
          0x0a, ...imm(1),
          0x3f, ...imm(12),
          0x16, 0x09, ...imm(0xcc), ...addr(0x4c36),
          0x00,
        ),
      },
    ]);

    const r = runEclChain(1, src, {
      encounterDistance: 7,
      partyHasRanger: true,
      partyStrength: 5,
      partyItemTypes: [31],
      partySpellLists: [[1, 22]],
      partyMemberAffects: [[], [12]],
    });

    expect(r.status).toBe('exited');
    expect(r.visited).toEqual([1, 2]);
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'encounterSetup',
      setup: { spriteId: 9, maxDistance: 3, picId: 5, distance: 3 },
    }));
    expect(r.memory.get(0x4c30)).toBe(1);
    expect(r.memory.get(0x4c31)).toBe(0);
    expect(r.memory.get(0x4c32)).toBe(0xaa);
    expect(r.memory.get(0x4c33)).toBe(0xbb);
    expect(r.memory.get(0x4c34)).toBe(2);
    expect(r.memory.get(0x4c35)).toBe(0);
    expect(r.memory.get(0x4c36)).toBe(0xcc);
  });

  it('carries ECL_CLOCK state across chained blocks', () => {
    const src = blockSourceFrom([
      { blockId: 1, raw: block(0x34, ...imm(5), ...imm(2), 0x20, ...imm(2)) },
      { blockId: 2, raw: block(0x34, ...imm(1), ...imm(2), 0x00) },
    ]);

    const r = runEclChain(1, src);
    expect(r.status).toBe('exited');
    const clocks = r.effects.filter((e) => e.type === 'eclClock');
    expect(clocks).toEqual([
      expect.objectContaining({ before: [0, 0, 0, 0, 0, 0, 0], after: [0, 0, 5, 0, 0, 0, 0] }),
      expect.objectContaining({ before: [0, 0, 5, 0, 0, 0, 0], after: [0, 0, 0, 1, 0, 0, 0] }),
    ]);
  });
});

// --- Golden: real CoK ECL1/2/3 chain (skips if game data absent) -------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const eclPaths = [1, 2, 3].map((n) => resolve(repoRoot, 'Champions of Krynn', `ECL${n}.DAX`));

describe('runEclChain — golden CoK ECL1 block 18 → 80', () => {
  it.skipIf(!eclPaths.every(existsSync))('chains block 18 into block 80 with the area flag set', async () => {
    const blocks = [];
    for (const p of eclPaths) blocks.push(...readDaxDataBlocks(new Uint8Array(await readFile(p))));
    const src = blockSourceFrom(blocks);

    // Flag 0x4cb1 (word_362) set → block 18's `COMPARE 0==word_362 ; IF=` fails so its GOTO is
    // skipped, SAVE #5→0x7f12 runs, and it NEWECLs to module 80 (in ECL3). Runner loads 80.
    const r = runEclChain(18, src, { memory: new Map([[0x4cb1, 1]]), autoInput: () => 0, autoCombat: true });
    expect(r.visited[0]).toBe(18);
    expect(r.visited).toContain(80); // entered the chained block
    expect(r.memory.get(0x7f12)).toBe(5); // area indicator persisted across the chain
  });
});
