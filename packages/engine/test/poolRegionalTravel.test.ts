import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  blockSourceFrom,
  decodeGeoBlock,
  decodeMonsterArchive,
  dialogueForCell,
  EclVm,
  ECL_POOL,
  monsterLookupFromArchive,
  readDaxDataBlocks,
  runEclChain,
  spawnEnemies,
} from '../src/index.js';

const poolRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD';
const eclPaths = [6, 7, 8].map((disk) => resolve(poolRoot, `ECL${disk}.DAX`));
const poolGeo5 = resolve(poolRoot, 'GEO5.DAX');
const poolMon7 = resolve(poolRoot, 'MON7CHA.DAX');

async function regionalBlocks() {
  const archives = await Promise.all(eclPaths.map(async (path) =>
    readDaxDataBlocks(new Uint8Array(await readFile(path)))));
  const blocks = archives.flat().filter((block) => block.blockId >= 25 && block.blockId <= 27);
  return { blocks, source: blockSourceFrom(blocks) };
}

const regionalMemory = (blockId: number, x: number, direction: number): Map<number, number> => new Map([
  [0x4a9e, 0],
  [0x49c5, blockId],
  [0x49c3, x],
  [0x49c4, 28],
  [0x033d, direction],
  [0x035f, 0],
  [0x6dc9, 0],
]);

describe('Pool ECL25/ECL26/ECL27 retail regional strip', () => {
  it.skipIf(eclPaths.some((path) => !existsSync(path)))(
    'initializes all three ECL sectors against their GEO5 collision blocks',
    async () => {
      const { blocks } = await regionalBlocks();
      const cases = [
        { blockId: 25, entry: 0x15cf, geoBlockId: 4, operands: [4, 4, 0] },
        { blockId: 26, entry: 0x1814, geoBlockId: 5, operands: [5, 5, 0] },
        { blockId: 27, entry: 0x135a, geoBlockId: 6, operands: [6, 6, 0] },
      ];
      for (const testCase of cases) {
        const block = blocks.find(({ blockId }) => blockId === testCase.blockId)!;
        const memory = new Map<number, number>([[0x4a9e, 0], [0x49c5, testCase.blockId]]);
        const result = new EclVm(block.raw, {
          dialect: ECL_POOL,
          entry: testCase.entry,
          memory,
        }).run();
        expect(result.status, `ECL sector ${testCase.blockId}`).toBe('exited');
        expect(result.effects).toContainEqual({
          type: 'loadFiles',
          geoBlockId: testCase.geoBlockId,
          operands: testCase.operands,
        });
        expect(memory.get(0x49e6)).toBe(0);
        expect(memory.get(0x49fb)).toBe(0);
        // The outer Pool host owns this identity word; the initial-entry bytecode leaves it alone.
        expect(memory.get(0x49c5)).toBe(testCase.blockId);
      }
    },
  );

  it.skipIf(eclPaths.some((path) => !existsSync(path)))(
    'chains through all four directed seams and initializes the correct target GEO5 sector',
    async () => {
      const { blocks } = await regionalBlocks();
      const cases = [
        { from: 25, x: 15, direction: 2, to: 26, targetX: 3, selector: 7, geoBlockId: 5, targetEntry: 0x1814 },
        { from: 26, x: 15, direction: 2, to: 27, targetX: 3, selector: 8, geoBlockId: 6, targetEntry: 0x135a },
        { from: 27, x: 2, direction: 6, to: 26, targetX: 14, selector: 7, geoBlockId: 5, targetEntry: 0x1814 },
        { from: 26, x: 2, direction: 6, to: 25, targetX: 14, selector: 6, geoBlockId: 4, targetEntry: 0x15cf },
      ];
      for (const testCase of cases) {
        const memory = regionalMemory(testCase.from, testCase.x, testCase.direction);
        const sourceBlock = blocks.find(({ blockId }) => blockId === testCase.from)!;
        const targetBlock = blocks.find(({ blockId }) => blockId === testCase.to)!;
        const seam = new EclVm(sourceBlock.raw, {
          dialect: ECL_POOL,
          entry: 0x16,
          memory,
        }).run();
        expect(seam.status, `${testCase.from}->${testCase.to}`).toBe('chain');
        expect(seam.chainBlockId).toBe(testCase.to);
        expect([memory.get(0x49c3), memory.get(0x49c4)]).toEqual([testCase.targetX, 28]);
        expect(memory.get(0x6e12)).toBe(testCase.selector);

        // Pool's host invokes the target block's header initial_entry after NEWECL. EclVm's
        // default raw-0x16 entry is vm_run_1, so model that host dispatch explicitly, just as the
        // browser activate-sector seam does.
        const initialized = new EclVm(targetBlock.raw, {
          dialect: ECL_POOL,
          entry: testCase.targetEntry,
          memory,
        }).run();
        expect(initialized.status).toBe('exited');
        expect(memory.get(0x49e6)).toBe(0);
        expect(memory.get(0x49fb)).toBe(0);
        expect(initialized.effects).toContainEqual(expect.objectContaining({
          type: 'loadFiles',
          geoBlockId: testCase.geoBlockId,
        }));
      }
    },
  );

  it.skipIf(eclPaths.some((path) => !existsSync(path)))(
    'lets the retail scripts reject the two outer edges without a fabricated chain',
    async () => {
      const { source } = await regionalBlocks();
      const cases = [
        { blockId: 25, x: 2, direction: 6, candidateX: 1 },
        { blockId: 27, x: 15, direction: 2, candidateX: 16 },
      ];
      for (const testCase of cases) {
        const memory = regionalMemory(testCase.blockId, testCase.x, testCase.direction);
        const result = runEclChain(testCase.blockId, source, {
          dialect: ECL_POOL,
          entry: 0x16,
          memory,
          maxBlocks: 2,
        });
        expect(result.status, `outer edge ${testCase.blockId}`).toBe('exited');
        expect(result.visited).toEqual([testCase.blockId]);
        expect([memory.get(0x49c3), memory.get(0x49c4)]).toEqual([testCase.x, 28]);
        expect([memory.get(0x00fb), memory.get(0x00fc)]).toEqual([testCase.candidateX, 28]);
        expect(memory.get(0x6dc9)).toBe(0xff);
        expect(result.effects.some((effect) => effect.type === 'loadFiles')).toBe(false);
        expect(result.effects).toContainEqual(expect.objectContaining({
          type: 'call',
          routineId: 0x401c,
        }));
      }
    },
  );

  it.skipIf(!existsSync(eclPaths[1]!) || !existsSync(poolGeo5) || !existsSync(poolMon7))(
    'reaches the centre-sector Bandit encounter and resolves its retail monster records',
    async () => {
      const ecl26 = readDaxDataBlocks(new Uint8Array(await readFile(eclPaths[1]!)))
        .find(({ blockId }) => blockId === 26)!;
      const geo5 = readDaxDataBlocks(new Uint8Array(await readFile(poolGeo5)))
        .find(({ blockId }) => blockId === 5)!;
      const map = decodeGeoBlock(geo5.raw, 'Pool GEO5#5 regional centre').map;
      const cell = map.cells[(28 & 0x0f) * map.width + (4 & 0x0f)]!;
      const memory = regionalMemory(26, 4, 0);
      expect(cell.floor).toBe(0);
      expect([memory.get(0x49c3), memory.get(0x49c4)]).toEqual([4, 28]);

      const runner = dialogueForCell(ecl26.raw, 0, {
        dialect: ECL_POOL,
        memory,
        seed: 17,
      })!;
      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the regional Bandit menu');
      expect(opening.text).toBe('YOU SPOT A GROUP OF BANDITS');
      expect(opening.choices).toEqual(['COMBAT', 'WAIT', 'FLEE', 'PARLAY']);

      const turn = runner.choose(0);
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected the regional Bandit combat');
      expect(turn.monsters).toEqual([{ monsterId: 97, count: 2, picBlockId: 11 }]);

      const monsters = decodeMonsterArchive(new Uint8Array(await readFile(poolMon7)));
      const { enemies, unresolved } = spawnEnemies(turn.monsters, monsterLookupFromArchive(monsters));
      expect(unresolved).toEqual([]);
      expect(enemies.map(({ id, name, hp, maxHp }) => ({ id, name, hp, maxHp }))).toEqual([
        { id: 'e0', name: 'BANDIT', hp: 6, maxHp: 6 },
        { id: 'e1', name: 'BANDIT', hp: 6, maxHp: 6 },
      ]);
    },
  );
});
