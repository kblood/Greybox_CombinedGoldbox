/**
 * primeSearchLocation tests (M2.S3) — the per-step dungeon-event entry.
 *
 * 1) Synthetic: a block whose SearchLocation far pointer reaches an ON_GOTO that dispatches on
 *    `mapWallRoof` — proves the entry positioning, the mapWallRoof preset, the &63 mask, and
 *    the null path when no SearchLocation exists.
 * 2) Golden: real CoK ECL1 block 34. Its SearchLocation (vaddr 0x81DE) dispatches the open-floor
 *    selector 0 into the wandering-monster check at 0x8287 and runs to a clean stop — no halt.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  primeSearchLocation,
  primeVmRun1,
  dialogueForCell,
  dialogueForVmRun1,
  decodeGeoBlock,
  MAP_WALL_ROOF_ADDR,
  MAP_DIRECTION_ADDR,
  MAP_CELL_BYTE_ADDR,
  EVENT_INDEX_MASK,
  gen1MapDirectionValue,
  readDaxDataBlocks,
  decodeEclGlb,
  ECL_HEADER_LEN,
  ECL_POOL,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_GATEWAY,
  ECL_GEN1_SHORT_TREASURES,
  ECL_GEN2,
  runEclChain,
  blockSourceFrom,
  EclVm,
  Explorer,
  DialogueRunner,
  type BlockSource,
  type EclEffect,
} from '../src/index.js';

const imm = (v: number) => [0x00, v & 0xff];
const addr = (w: number) => [0x01, w & 0xff, (w >> 8) & 0xff];

/** Build a block whose far-pointer `searchLocation` (slot 1) = `searchVaddr`; body at 0x8014. */
function blockWithSearch(searchVaddr: number, ...body: number[]): Uint8Array {
  const raw = new Uint8Array(ECL_HEADER_LEN + body.length);
  raw[0] = 0x88; raw[1] = 0x13; // magic 0x1388
  // far pointer slot 1 vaddr word lives at byte 4 + 1*4 = 8.
  raw[8] = searchVaddr & 0xff; raw[9] = (searchVaddr >> 8) & 0xff;
  // slot 4 (eclInitialEntry) = 0x8014, for completeness.
  raw[20] = 0x14; raw[21] = 0x80;
  raw.set(body, ECL_HEADER_LEN);
  return raw;
}

// SearchLocation handler at 0x8014:
//   0x8014 ON_GOTO mem[mapWallRoof], 2, T0=0x8020, T1=0x8027   (12 bytes)
//   0x8020 SAVE #111, 0x4c10 ; EXIT   (target 0)
//   0x8027 SAVE #222, 0x4c10 ; EXIT   (target 1)
const T0 = 0x8020;
const T1 = 0x8027;
function searchBlock(): Uint8Array {
  return blockWithSearch(
    0x8014,
    0x25, ...addr(MAP_WALL_ROOF_ADDR), ...imm(2), 0x01, T0 & 0xff, T0 >> 8, 0x01, T1 & 0xff, T1 >> 8,
    0x09, ...imm(111), ...addr(0x4c10), 0x00,
    0x09, ...imm(222), ...addr(0x4c10), 0x00,
  );
}

describe('primeSearchLocation (synthetic)', () => {
  it('runs the SearchLocation handler dispatching on the cell backdrop (open floor → target 0)', () => {
    const vm = primeSearchLocation(searchBlock(), 0)!;
    expect(vm).not.toBeNull();
    expect(vm.memory.get(MAP_WALL_ROOF_ADDR)).toBe(0); // mapWallRoof preset
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c10)).toBe(111); // selector 0 → target 0
  });

  it('dispatches a non-zero backdrop to its event handler (masking the high bits)', () => {
    // backdrop 0x41 → &63 = 1 → target 1. The 0x40 flag bit is masked off.
    const vm = primeSearchLocation(searchBlock(), 0x41)!;
    expect(vm.memory.get(MAP_WALL_ROOF_ADDR)).toBe(0x41 & EVENT_INDEX_MASK);
    vm.run();
    expect(vm.memory.get(0x4c10)).toBe(222);
  });

  it('seeds the Gen1 host map direction at retail host register 0xc04d', () => {
    expect(MAP_DIRECTION_ADDR).toBe(0xc04d);
    const north = primeSearchLocation(searchBlock(), 0)!;
    expect(north.memory.get(MAP_DIRECTION_ADDR)).toBe(0);
    // ECL-visible ordinals 0=N,1=E,2=S,3=W (the retail vm_GetMemoryValue read halves the stored
    // even 0/2/4/6 DGROUP code before the script sees it — see gen1MapDirectionValue's doc).
    const east = primeSearchLocation(searchBlock(), 0, { facing: 'east' })!;
    expect(east.memory.get(MAP_DIRECTION_ADDR)).toBe(1);
    const west = primeSearchLocation(searchBlock(), 0, { facing: 'west' })!;
    expect(west.memory.get(MAP_DIRECTION_ADDR)).toBe(gen1MapDirectionValue('west'));
    expect(west.memory.get(MAP_DIRECTION_ADDR)).toBe(3);
  });

  it('carries area state across steps via a shared memory map', () => {
    const memory = new Map<number, number>([[0x4c10, 7]]);
    const vm = primeSearchLocation(searchBlock(), 0x41, { memory })!;
    vm.run();
    expect(memory.get(0x4c10)).toBe(222); // the same map the VM wrote through
  });

  it('returns null when the block has no SearchLocation pointer', () => {
    // searchVaddr 0 → entry out of range → null.
    const noSearch = blockWithSearch(0x0000, 0x00);
    expect(primeSearchLocation(noSearch, 0)).toBeNull();
    // Too-small buffer → null, no throw.
    expect(primeSearchLocation(new Uint8Array(4), 0)).toBeNull();
  });
});

// --- primeVmRun1 (the per-step main loop) ----------------------------------

/**
 * Build a Gen2 (DQK) block whose far-pointer `vmRun1` (slot 0) = `vmVaddr`. Gen2 headers carry no
 * magic and a 20-byte header (vbase 0x8000); slot 0's vaddr word lives at byte 2, the body at 0x8014.
 */
function gen2BlockWithVmRun1(vmVaddr: number, ...body: number[]): Uint8Array {
  const raw = new Uint8Array(ECL_GEN2.headerLen + body.length);
  raw[2] = vmVaddr & 0xff; raw[3] = (vmVaddr >> 8) & 0xff; // slot 0 = vmRun1
  raw[18] = 0x14; raw[19] = 0x80; // slot 4 = eclInitialEntry 0x8014 (completeness)
  raw.set(body, ECL_GEN2.headerLen);
  return raw;
}

// vmRun1 handler at 0x8014: LOAD_MONSTER #5,#2,#0 ; COMBAT  — queues a group then fights.
function vmRun1CombatBlock(): Uint8Array {
  return gen2BlockWithVmRun1(
    0x8014,
    0x0b, ...imm(5), ...imm(2), ...imm(0), // LOAD_MONSTER monsterId=5, count=2, picBlock=0
    0x24, // COMBAT
  );
}

describe('primeVmRun1 (synthetic Gen2)', () => {
  it('positions a VM at the vmRun1 handler and reaches COMBAT with the queued roster', () => {
    const vm = primeVmRun1(vmRun1CombatBlock(), { dialect: ECL_GEN2 })!;
    expect(vm).not.toBeNull();
    const r = vm.run();
    expect(r.status).toBe('combat');
    const combat = r.effects.find((e): e is Extract<typeof e, { type: 'combat' }> => e.type === 'combat')!;
    expect(combat.monsters).toEqual([{ monsterId: 5, count: 2, picBlockId: 0 }]);
  });

  it('seeds party position/facing into the shared memory before running', () => {
    const memory = new Map<number, number>();
    primeVmRun1(vmRun1CombatBlock(), {
      dialect: ECL_GEN2,
      memory,
      seedMemory: { 0xbf: 3, 0xc0: 12, 0x11: 2 },
    })!.run();
    expect(memory.get(0xbf)).toBe(3);
    expect(memory.get(0xc0)).toBe(12);
    expect(memory.get(0x11)).toBe(2);
  });

  it('returns null when the block exposes no vmRun1 pointer', () => {
    expect(primeVmRun1(gen2BlockWithVmRun1(0x0000, 0x00), { dialect: ECL_GEN2 })).toBeNull();
    expect(primeVmRun1(new Uint8Array(4), { dialect: ECL_GEN2 })).toBeNull();
  });
});

// --- golden: real CoK ECL1 block 34 ----------------------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const ecl1 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ECL1.DAX');
const geo1 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'GEO1.DAX');

describe('primeSearchLocation — golden CoK ECL1 block 34', () => {
  it.skipIf(!existsSync(ecl1))('runs SearchLocation for an open-floor step without halting', async () => {
    const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(ecl1))).find((b) => b.blockId === 34)!;
    const vm = primeSearchLocation(blk34.raw, 0, { seed: 0x1234 })!;
    expect(vm).not.toBeNull();
    // Open floor (backdrop 0) dispatches ON_GOTO target 0 = the 0x8287 encounter check; it
    // runs the random roll and resolves to a clean stop (exit/chain/combat) — never 'halted'.
    const r = vm.run();
    expect(r.status).not.toBe('halted');
  });

  it.skipIf(!existsSync(ecl1))('dispatches a room backdrop to its real (inline-decoded) event text', async () => {
    const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(ecl1))).find((b) => b.blockId === 34)!;
    // Backdrop 13 is a "skeleton room" cell in GEO 34; its event prints a real CoK description.
    const vm = primeSearchLocation(blk34.raw, 13, { seed: 0x1234 })!;
    const text = vm
      .run()
      .effects.filter((e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print')
      .map((e) => e.text ?? '')
      .join('');
    expect(text).toMatch(/SKELETONS/i);
    // Different backdrops select different rooms (proves the ON_GOTO indexing is real).
    const other = primeSearchLocation(blk34.raw, 12, { seed: 0x1234 })!
      .run()
      .effects.filter((e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print')
      .map((e) => e.text ?? '')
      .join('');
    expect(other).not.toBe(text);
    expect(other).toMatch(/ROOM/i);
  });

  it.skipIf(!existsSync(ecl1) || !existsSync(geo1))('reaches a retail SearchLocation COMBAT cell with its decoded roster', async () => {
    const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(ecl1))).find((b) => b.blockId === 34)!;
    const geo34 = readDaxDataBlocks(new Uint8Array(await readFile(geo1))).find((b) => b.blockId === 34)!;
    const map34 = decodeGeoBlock(geo34.raw, 'CoK GEO1#34');
    const cell = map34.map.cells[0 * map34.map.width + 1]!;
    expect(cell.floor).toBe(129);

    const runner = dialogueForCell(blk34.raw, cell.floor ?? 0, { seed: 0x1234 });
    expect(runner).not.toBeNull();
    if (!runner) return;
    const text: string[] = [];
    let turn = runner.start();
    for (let guard = 0; guard < 12; guard++) {
      if (turn.text) text.push(turn.text);
      if (turn.kind === 'combat') break;
      if (turn.kind === 'end' || turn.kind === 'chain') break;
      turn = runner.choose(0);
    }
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected combat');
    expect(text.join(' ')).toMatch(/FIGHTERS SURGE FROM AROUND THE CORNER/i);
    expect(turn.monsters).toEqual([
      { monsterId: 35, count: 7, picBlockId: 35 },
      { monsterId: 38, count: 2, picBlockId: 38 },
    ]);
  });
});

describe('primeSearchLocation — golden CoK ECL1 block 16 overland WILD dispatch', () => {
  it.skipIf(!existsSync(ecl1))('preserves the runtime WILD string, branches to the caravan event, and reaches combat', async () => {
    const blk16 = readDaxDataBlocks(new Uint8Array(await readFile(ecl1))).find((b) => b.blockId === 16)!;
    const memory = new Map<number, number>([[0x4bc3, 2], [0x4bc4, 3]]);
    const vm = primeSearchLocation(blk16.raw, 0, { memory, seed: 0x1600 })!;
    const result = vm.run();
    const text = result.effects
      .filter((e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print')
      .map((e) => e.text ?? '')
      .join(' ');
    expect(text).toMatch(/CARAVAN\s+UNDER\s+ATTACK/i);
    expect(result.status).toBe('awaiting-input');
    expect(vm.resume(0).status).toBe('combat');
  });
});

// --- golden: real Pool ECL1/GEO1 block 18 ----------------------------------

const poolRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD';
const poolEcl1 = resolve(poolRoot, 'ECL1.DAX');
const poolFindItemEcl4 = resolve(poolRoot, 'ECL4.DAX');
const poolEcl7 = resolve(poolRoot, 'ECL7.DAX');
const poolGeo1 = resolve(poolRoot, 'GEO1.DAX');

describe('primeSearchLocation — golden Pool ECL1 block 18', () => {
  it.skipIf(!existsSync(poolEcl1) || !existsSync(poolGeo1))(
    'reaches the unique selector-6 GEO cell encounter and resumes after combat',
    async () => {
      const blk18 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl1)))
        .find((b) => b.blockId === 18)!;
      const geo18 = readDaxDataBlocks(new Uint8Array(await readFile(poolGeo1)))
        .find((b) => b.blockId === 18)!;
      const map18 = decodeGeoBlock(geo18.raw, 'Pool GEO1#18');
      const matching = map18.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 6);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[14, 8, 0x86]]);

      const memory = new Map<number, number>([[0x4a38, 0], [0x4a35, 0xff]]);
      const runner = dialogueForCell(blk18.raw, matching[0].cell.floor ?? 0, {
        dialect: ECL_POOL,
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      let turn = runner.start();
      expect(turn.kind).toBe('say');
      if (turn.kind !== 'say') throw new Error('expected Pool encounter menu');
      expect(turn.choices).toEqual(['LEAVE', 'GREET', 'ATTACK']);
      turn = runner.choose(2);
      for (let guard = 0; guard < 8 && turn.kind !== 'combat'; guard++) {
        if (turn.kind === 'end' || turn.kind === 'chain') break;
        turn = runner.choose(2);
      }

      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected Pool combat');
      expect(turn.monsters).toEqual([{ monsterId: 5, count: 1, picBlockId: 5 }]);

      runner.afterCombat('victory');
      expect(memory.get(0x4a38)).toBe(2);
    },
  );
});

describe('EclVm — golden Pool ECL4#2 Brass Key FIND_ITEM gate', () => {
  it.skipIf(!existsSync(poolFindItemEcl4))(
    'takes the real no-key branch when item type 75 is absent and unlocks the padlocks when present',
    async () => {
      const blk2 = readDaxDataBlocks(new Uint8Array(await readFile(poolFindItemEcl4)))
        .find((b) => b.blockId === 2)!;
      const entry = 0xa23f - ECL_POOL.vbase;

      const absent = new EclVm(blk2.raw, { dialect: ECL_POOL, entry });
      expect(absent.step().instruction?.vaddr).toBe(0xa23f); // FIND_ITEM #75
      expect(absent.step().instruction?.vaddr).toBe(0xa242); // IF_EQ skips the following GOTO
      const noKey = absent.step();
      expect(noKey.instruction?.vaddr).toBe(0xa247);
      expect(noKey.effects).toContainEqual(expect.objectContaining({
        type: 'print',
        text: 'YOU HAVE NO KEY TO UNLOCK THE PADLOCKS.',
      }));
      expect(absent.memory.has(0x4a73)).toBe(false);

      const present = new EclVm(blk2.raw, { dialect: ECL_POOL, entry, partyItemTypes: [75] });
      expect(present.step().instruction?.vaddr).toBe(0xa23f); // FIND_ITEM #75
      expect(present.step().instruction?.vaddr).toBe(0xa242); // IF_EQ executes the following GOTO
      expect(present.step().instruction?.vaddr).toBe(0xa243);
      const unlocked = present.step();
      expect(unlocked.instruction?.vaddr).toBe(0xa26c);
      expect(unlocked.effects).toContainEqual(expect.objectContaining({
        type: 'print',
        text: 'THE BRASS KEY YOU FOUND OPENS ALL OF THE PADLOCKS.',
      }));
      expect(present.step().instruction?.vaddr).toBe(0xa295); // SAVE #128,[0x4A73]
      expect(present.memory.get(0x4a73)).toBe(128);
    },
  );
});

describe('EclVm — golden Pool ECL7#26 eastern-city route into ECL1#24', () => {
  it.skipIf(!existsSync(poolEcl7))(
    'starts at the western edge, then matches (13,27), chooses SOUTH, and saves the authentic ECL1#24 landing state',
    async () => {
      const blk26 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl7)))
        .find((b) => b.blockId === 26)!;
      const initialized = new EclVm(blk26.raw, {
        dialect: ECL_POOL,
        entry: 0x1814,
        memory: new Map([[0x49c5, 26]]),
      }).run();
      expect(initialized.effects).toContainEqual(expect.objectContaining({
        type: 'loadFiles',
        geoBlockId: 5,
      }));
      // ECL1#18 selector 3 lands at the western edge.  Reaching block 24 still requires the real
      // regional host to move to the distinct eastern-edge coordinate tested below.
      const arrival = new EclVm(blk26.raw, {
        dialect: ECL_POOL,
        entry: 0x9ae0 - ECL_POOL.vbase,
        memory: new Map([
          [0x49c3, 11],
          [0x49c4, 28],
        ]),
      }).run();
      expect(arrival.status).toBe('awaiting-input');
      expect(arrival.effects).toContainEqual(expect.objectContaining({
        type: 'print',
        text: expect.stringContaining('WESTERN EDGE OF THE CITY'),
      }));
      expect(arrival.effects).toContainEqual(expect.objectContaining({
        type: 'menu',
        items: ['NORTH', 'SOUTH', 'LEAVE'],
      }));

      // ECL7#26's search_location walks its retail coordinate tables at 0xb04a/0xb053,
      // whose (13,27) entry maps to selector 3: the eastern edge of New Phlan.
      const memory = new Map<number, number>([
        [0x49c3, 13],
        [0x49c4, 27],
      ]);
      const vm = new EclVm(blk26.raw, {
        dialect: ECL_POOL,
        entry: 0x9ae0 - ECL_POOL.vbase,
        memory,
      });

      const opening = vm.run();
      expect(opening.status).toBe('awaiting-input');
      expect(opening.effects).toContainEqual(expect.objectContaining({
        type: 'print',
        text: 'YOU ARE ON THE EASTERN EDGE OF THE CITY.  THERE ARE  NORTH AND SOUTH ENTRANCES INTO THE CITY AND A SMALL BOAT THAT YOU CAN TAKE TO THE CIVILISED AREA.  WHICH ROUTE WILL YOU TAKE?',
      }));
      expect(opening.effects).toContainEqual(expect.objectContaining({
        type: 'menu',
        style: 'horizontal',
        items: ['NORTH', 'SOUTH', 'BOAT', 'LEAVE'],
      }));

      const south = vm.resume(1);
      expect(south.status).toBe('chain');
      expect(south.chainBlockId).toBe(24);
      expect(memory.get(0xc04b)).toBe(15); // landing x
      expect(memory.get(0xc04c)).toBe(4); // landing y
      expect(memory.get(0xc04d)).toBe(3); // west in the ECL-visible 0=N,1=E,2=S,3=W encoding
      expect(memory.get(0x6e12)).toBe(1); // ECL1#24's saved current-area/entrance selector
    },
  );
});

describe('EclVm — golden Pool ECL7#26 regional movement candidates', () => {
  it.skipIf(!existsSync(poolEcl7))(
    'derives all eight candidate coordinates before the synchronous 0x401c host call',
    async () => {
      const blk26 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl7)))
        .find((b) => b.blockId === 26)!;
      const expected = [
        [11, 27], [12, 27], [12, 28], [12, 29],
        [11, 29], [10, 29], [10, 28], [10, 27],
      ] as const;
      for (let direction = 0; direction < expected.length; direction++) {
        const memory = new Map<number, number>([
          [0x49c3, 11], [0x49c4, 28], [0x033d, direction], [0x035f, 0],
        ]);
        let candidate: readonly [number, number] | null = null;
        const vm = new EclVm(blk26.raw, {
          dialect: ECL_POOL,
          entry: 0x9914 - ECL_POOL.vbase,
          memory,
          onCall: (effect, liveMemory) => {
            if (effect.routineId === 0x401c) {
              candidate = [liveMemory.get(0x00fb) ?? -1, liveMemory.get(0x00fc) ?? -1];
            }
          },
        });
        vm.run();
        expect(candidate, `direction ${direction}`).toEqual(expected[direction]);
        // Candidate calculation is deliberately non-committing; the native host owns the move.
        expect([memory.get(0x49c3), memory.get(0x49c4)]).toEqual([11, 28]);
      }
    },
  );
});

describe('primeSearchLocation — golden Pool ECL1#24 Temple of Bane FIND_ITEM gate', () => {
  it.skipIf(!existsSync(poolEcl1))(
    'welcomes a party carrying type 74 and sends a party without it into the eight-ORC fight',
    async () => {
      const blk24 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl1)))
        .find((b) => b.blockId === 24)!;
      const templeMemory = (): Map<number, number> => new Map([
        [0x49c5, 24], // select GEO1#24, not the alternate GEO1#31 dispatch in this ECL block
        [0x4abd, 0],
        [0x4a0f, 0],
        [0x4a2a, 0],
      ]);

      // The regional host invokes the header's real initial_entry (raw 0x1DA5), not vm_run_1 at
      // raw 0x16. It selects both GEO24 and the target disk's [1,3,5] wall pieces from [49C5].
      const initialized = new EclVm(blk24.raw, {
        dialect: ECL_POOL,
        entry: 0x1da5,
        memory: new Map([...templeMemory(), [0x6e12, 1]]),
      }).run();
      expect(initialized.effects).toContainEqual(expect.objectContaining({ type: 'loadFiles', geoBlockId: 24 }));
      expect(initialized.effects).toContainEqual(expect.objectContaining({ type: 'loadPieces', setBlockIds: [1, 3, 5] }));

      const foundMemory = templeMemory();
      const found = dialogueForCell(blk24.raw, 0x04, {
        dialect: ECL_POOL,
        memory: foundMemory,
        partyItemTypes: [74],
      })!;
      const foundOpening = found.start();
      expect(foundOpening.kind).toBe('say');
      if (foundOpening.kind !== 'say') throw new Error('expected the Temple of Bane entrance menu');
      expect(foundOpening.text).toContain('ENTRANCE TO A LARGE SHADOWY TEMPLE');
      expect(foundOpening.choices).toEqual(['LET HIM TOUCH YOU', 'BACK OFF', 'ATTACK']);
      const welcomed = found.choose(0);
      expect(welcomed.kind).toBe('end');
      expect(welcomed.text).toContain('FINDING THE LEATHER HOLY SYMBOL');
      expect(welcomed.text).toContain('WELCOME TO THE TEMPLE OF BANE');
      expect(foundMemory.get(0x4a0f)).toBe(0);

      const missingMemory = templeMemory();
      const missing = dialogueForCell(blk24.raw, 0x04, {
        dialect: ECL_POOL,
        memory: missingMemory,
      })!;
      const missingOpening = missing.start();
      expect(missingOpening.kind).toBe('say');
      if (missingOpening.kind !== 'say') throw new Error('expected the Temple of Bane entrance menu');
      expect(missingOpening.choices).toEqual(['LET HIM TOUCH YOU', 'BACK OFF', 'ATTACK']);
      const rejected = missing.choose(0);
      expect(rejected.kind).toBe('combat');
      if (rejected.kind !== 'combat') throw new Error('expected the Temple guards to attack');
      expect(rejected.text).toContain('KILL THESE UNBELIEVERS');
      expect(rejected.monsters).toEqual([{ monsterId: 4, count: 8, picBlockId: 4 }]);
      expect(missing.afterCombat('victory').kind).toBe('end');
      expect(missingMemory.get(0x4a0f)).toBe(1);
    },
  );
});

// --- golden: real CoAB ECL4/GEO4 block 37 ---------------------------------

const coabRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds';
const coabEcl4 = resolve(coabRoot, 'ECL4.DAX');
const coabGeo4 = resolve(coabRoot, 'GEO4.DAX');

describe('primeSearchLocation — golden CoAB ECL4 block 37', () => {
  it.skipIf(!existsSync(coabEcl4) || !existsSync(coabGeo4))(
    'reaches the unique selector-20 encounter and exits cleanly after combat',
    async () => {
      const blk37 = readDaxDataBlocks(new Uint8Array(await readFile(coabEcl4)))
        .find((b) => b.blockId === 37)!;
      const geo37 = readDaxDataBlocks(new Uint8Array(await readFile(coabGeo4)))
        .find((b) => b.blockId === 37)!;
      const map37 = decodeGeoBlock(geo37.raw, 'CoAB GEO4#37');
      const matching = map37.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 20);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[5, 3, 0x94]]);

      const memory = new Map<number, number>([[0x4cf4, 0]]);
      const runner = dialogueForCell(blk37.raw, matching[0].cell.floor ?? 0, {
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      const turn = runner.start();
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected CoAB combat');
      expect(turn.monsters).toEqual([
        { monsterId: 39, count: 3, picBlockId: 39 },
        { monsterId: 37, count: 5, picBlockId: 37 },
      ]);
      expect(memory.get(0x4cf4)).toBe(8);

      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4cf4)).toBe(8);
    },
  );
});

// --- golden: real CoAB ECL2/GEO2 block 4 (middle-area route) --------------

const coabEcl2 = resolve(coabRoot, 'ECL2.DAX');
const coabGeo2 = resolve(coabRoot, 'GEO2.DAX');

describe('primeSearchLocation — golden CoAB ECL2 block 4 (middle-area route)', () => {
  it.skipIf(!existsSync(coabEcl2) || !existsSync(coabGeo2))(
    'reaches the Fire Knives checkpoint, gates on an explicit SURRENDER choice, and sets its flag after combat',
    async () => {
      const blk4 = readDaxDataBlocks(new Uint8Array(await readFile(coabEcl2)))
        .find((b) => b.blockId === 4)!;
      const geo4 = readDaxDataBlocks(new Uint8Array(await readFile(coabGeo2)))
        .find((b) => b.blockId === 4)!;
      const map4 = decodeGeoBlock(geo4.raw, 'CoAB GEO2#4');

      // NOTE: the campaign-route target map (`build/gen1-campaign-route-map.json`) names selector 7,
      // cell (3,13) descriptor 0x87 as this game's "middle candidate" — its walls-only BFS reachability
      // check is blind to scripted triggers. A directed BFS excluding only interactive/combat cells
      // proves selector 7 is NOT reachable fresh from `chooseStart` (1,1): every legal route to it is
      // forced through this cell first — selector 4, cell (4,12) descriptor 0x84, a "SURRENDER?"
      // checkpoint. Choosing YES there walks the party to the leader and merges into the *exact* same
      // decoded tail (SETUP_MONSTER → two LOAD_MONSTER groups → TREASURE → COMBAT at vaddr 0x838e →
      // resume 0x838f) as selector 7's own script, byte-verified by tracing both prefixes to the
      // identical offset. So selector 4's checkpoint — not selector 7's cell — is this game's real,
      // legally-reachable middle-area natural route; selector 7 remains valid retail content but is
      // only ever reached pre-consumed, after the checkpoint already fired.
      const matching = map4.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 4);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[4, 12, 0x84]]);

      const memory = new Map<number, number>([[0x4cff, 0]]);
      const runner = dialogueForCell(blk4.raw, matching[0].cell.floor ?? 0, {
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      // The explicit player-facing gate the campaign-route decomposition calls for: a genuine
      // two-choice SURRENDER prompt (not a degenerate one-choice "continue"). YES walks the party to
      // the Fire Knives' leader.
      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the SURRENDER Y/N checkpoint prompt');
      expect(opening.choices).toEqual(['YES', 'NO']);
      expect(opening.text).toContain('CHECKPOINT');

      let turn = runner.choose(0); // YES
      for (let guard = 0; guard < 4 && turn.kind === 'say'; guard++) {
        turn = runner.choose(0);
      }
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected CoAB combat');
      expect(turn.monsters).toEqual([
        { monsterId: 1, count: 20, picBlockId: 1 },
        { monsterId: 3, count: 1, picBlockId: 3 },
      ]);
      expect(memory.get(0x4cff)).toBe(0);

      // Victory resumes at the exact next decoded instruction (COMPARE at vaddr 0x838f) and sets
      // the consumed flag immediately, before any of the following journal/story beats run.
      let resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('say');
      expect(memory.get(0x4cff)).toBe(1);

      // The retail script chains through several fixed story beats (freeing Giogi, the dream
      // sequence) before handing off to the next block — a clean `chain`, not an in-block `EXIT`.
      for (let guard = 0; guard < 8 && resumed.kind === 'say'; guard++) {
        resumed = runner.choose(0);
      }
      expect(resumed.kind).toBe('chain');
      if (resumed.kind !== 'chain') throw new Error('expected a clean chain to the next CoAB block');
      expect(resumed.blockId).toBe(80);
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4cff)).toBe(1);
    },
  );
});

// --- golden: ADR-0009 cross-archive NEWECL (ECL4#37 -> hub ECL1#80 -> ECL5#49) --------------

const coabEcl1 = resolve(coabRoot, 'ECL1.DAX');
const coabEcl5 = resolve(coabRoot, 'ECL5.DAX');

describe('runEclChain — golden ADR-0009 cross-archive crossing (real CoAB ECL4/ECL1/ECL5)', () => {
  it.skipIf(!existsSync(coabEcl4) || !existsSync(coabEcl1) || !existsSync(coabEcl5))(
    'follows a real SAVE(...,0x7F12)+NEWECL out of ECL4#37, through the ECL1#80 wilderness hub, into ECL5#49, carrying memory across both archive crossings',
    async () => {
      const src4 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(coabEcl4))));
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(coabEcl1))));
      const src5 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(coabEcl5))));
      // ADR-0009 §Decision (D): the host resolves `game_area -> BlockSource`; the VM/chain runner
      // stay file-ignorant. Real CoAB ships one archive set per game_area (ECL{n}.DAX), so this
      // mirrors GameData.archiveSet's eventual web-host resolver (gameData.ts/explore.ts) at the
      // scale this headless golden needs — just the three areas the route actually crosses.
      const areaSource = (gameArea: number): BlockSource | undefined => {
        if (gameArea === 4) return src4;
        if (gameArea === 1) return src1;
        if (gameArea === 5) return src5;
        return undefined;
      };

      // Real, byte-traced reachable path (`tools/scratch_scan_newecl_paths.py`, ADR-0009 + the
      // town-classification research doc):
      //   - ECL4.DAX#37's own `initial_entry` (vaddr 0x8014) reaches a real "SHOP"/"EXPLORE" then
      //     "RETURN TO DAGGER FALLS"/"GO TO THE TOWER" menu pair; picking index 0 both times
      //     (an ordinary empty roadside ambush, then declining the side quest) walks straight to
      //     `SAVE 1, 0x7F12 ; NEWECL 80` (vaddr 0x8225/0x822b) — the real exit-to-hub instruction.
      //   - ECL1.DAX#80 (the wilderness hub) statically reaches `SAVE 1,0x4BE6; SAVE 5,0x7F12;
      //     NEWECL 49` (vaddr 0x85b8-0x85c5) once its own destination selector (`mem[0x4C9C]`,
      //     copied to `mem[0x4C9B]` at vaddr 0x8098, then dispatched by the `ON_GOTO` at 0x853c)
      //     is 9 (CoAB's "go to ECL5#49" hub-menu entry) and its "confirm travel" flag
      //     (`mem[0x4C0C]`) is set — exactly the CoAB overworld-map selection this leaf's ADR
      //     explicitly defers (the procedural WildernessMap/city floor renderer, §Scope). Seeding
      //     those two host cells stands in for "the player already picked this hub destination",
      //     the same way the other CoAB goldens in this file seed a single host memory cell to
      //     reach a specific scripted branch without reimplementing unrelated engine surface.
      //   - ECL5.DAX#49 is CoAB's only town-narrated, GEO-backed location reachable through the
      //     hub (town-classification.md §3b): its opening print ends "...PAST SHUTTERED
      //     WINDOWS. NO ONE IS ABOUT." — a distinctive, real-byte confirmation the chain actually
      //     landed in the right block, not a synthetic stand-in.
      const memory = new Map<number, number>([
        [0x4c20, 0x2a], // synthetic quest flag "written during ECL4#37" — an otherwise-untouched
        // cell in Area1's persistent quest-flag range (0x4B00..0x4EFF, ADR-0009 Consequences) —
        // proving the shared `memory` Map (program.ts:85) really does survive BOTH crossings.
        [0x4c9c, 9], // hub destination selector -> ECL5#49 (game_area 5)
        [0x4c0c, 1], // hub "confirm travel" flag -> skip the interactive travel/city menu
      ]);

      let result = runEclChain(37, src4, {
        memory,
        seed: 1,
        autoCombat: true,
        areaSource,
        startGameArea: 4,
        maxBlocks: 10,
      });
      let guard = 0;
      // Three ordinary "press on" menu pauses along the real path (ECL4#37's SHOP/EXPLORE choice,
      // its RETURN/TOWER follow-up, and ECL5#49's own "PRESS BUTTON..." continue prompt); index 0
      // at each answers "the mundane default" and never diverts off the traced route.
      while (result.resume && guard < 10) {
        guard++;
        result = result.resume(0);
      }

      expect(result.status).toBe('exited');
      // The real archive crossing happened: THREE different archives' blocks were chained through,
      // not a single-archive NEWECL loop.
      expect(result.visited).toEqual([37, 80, 49]);
      // Both `SAVE …,0x7F12` writes surfaced as ADR-0009 `setGameArea` effects, in crossing order.
      expect(result.effects.filter((e) => e.type === 'setGameArea')).toEqual([
        { type: 'setGameArea', gameArea: 1 },
        { type: 'setGameArea', gameArea: 5 },
      ]);
      // ECL5#49's real opening narration ("THIS RUN DOWN VILLAGE IS STRANGELY QUIET...") proves the
      // chain landed in the correct real block, not a coincidental halt.
      expect(result.effects.some((e) => e.type === 'print' && e.text?.includes('NO ONE IS ABOUT'))).toBe(true);
      // The persistence proof: a flag set before ECL4#37 ran is still readable after BOTH archive
      // crossings, untouched by either area's own script (program.ts's shared `memory` Map, reused
      // verbatim across every chained EclVm instance).
      expect(result.memory.get(0x4c20)).toBe(0x2a);
    },
  );
});

// --- golden: real Secret ECL3/GEO3 block 97 -------------------------------

const secretRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades';
const secretEcl3 = resolve(secretRoot, 'ECL3.DAX');
const secretGeo3 = resolve(secretRoot, 'GEO3.DAX');

describe('primeSearchLocation — golden Secret ECL3 block 97', () => {
  it.skipIf(!existsSync(secretEcl3) || !existsSync(secretGeo3))(
    'reaches the unique selector-3 hydra encounter and sets its consumed bit after combat',
    async () => {
      const blk97 = readDaxDataBlocks(new Uint8Array(await readFile(secretEcl3)))
        .find((b) => b.blockId === 97)!;
      const geo97 = readDaxDataBlocks(new Uint8Array(await readFile(secretGeo3)))
        .find((b) => b.blockId === 97)!;
      const map97 = decodeGeoBlock(geo97.raw, 'Secret GEO3#97');
      const matching = map97.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 3);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[12, 3, 0x83]]);

      // Selectors 7 and 6 lie on the legal browser path. Mark their independent events consumed,
      // while selector 3's 0x04 bit remains clear for this encounter.
      const memory = new Map<number, number>([[0x4cd0, 0x10], [0x4ccd, 0x20]]);
      const runner = dialogueForCell(blk97.raw, matching[0].cell.floor ?? 0, {
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      let turn = runner.start();
      for (let guard = 0; guard < 4 && turn.kind !== 'combat'; guard++) {
        if (turn.kind === 'end' || turn.kind === 'chain') break;
        turn = runner.choose(0);
      }
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected Secret hydra combat');
      expect(turn.monsters).toEqual([{ monsterId: 24, count: 8, picBlockId: 27 }]);
      expect(memory.get(0x4ccd)).toBe(0x20);

      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4ccd)).toBe(0x24);
      expect(memory.get(0x4cd0)).toBe(0x10);
    },
  );
});

// --- golden: real CoK ECL1/GEO1 block 34 natural encounter (descriptor 28) -----------------
//
// P2 CoK slice: block 34 is the SAME retail block CoK's boot dungeon already loads (see the
// "golden CoK ECL1 block 34" describe above and `dungeon.test.ts`'s exploration golden), so this
// natural encounter needs no separate area. Selector 28 (`mapWallRoof & 0x3F == 28`) is the only
// GEO1#34 cell that reaches it: `(3,15)`, descriptor `0x9C`. It is 22 legal directed-edge steps
// from Greybox's current CoK default spawn `(14,10,north)` (`tools/find_geo_path.py`); the walk
// crosses two harmless one-shot flavour-text cells (selector 27 at `(11,14)` sets `[0x4c55]|=0x10`,
// selector 30 at `(8,12)` sets `[0x4c44]|=0x1`) that do not collide with this encounter's own
// `[0x4c55]` bit `0x20` and never gate combat, so no seeding is required. The event first shows a
// one-choice "PRESS BUTTON OR RETURN TO CONTINUE" flavour beat, then a genuine three-way
// ATTACK/WAIT/LEAVE menu (`HORIZONTAL_MENU`/`ON_GOTO` at vaddr 0x93C7/0x93DF) — ATTACK (choice 0)
// is this golden's proven combat path. Victory resumes at 0x9405 (a day-count `COMPARE`), prints a
// second flavour beat, and only then executes the consumed-bit write at 0x9450
// (`ADD #0x20, [0x4c55] -> [0x4c55]`) — later than the immediately-next-instruction resume the
// Pool/CoAB/Secret routes use, so the golden below drains one more `say` turn before asserting the
// final memory word. See docs/engine/research/cok-natural-route.md.
describe('primeSearchLocation — golden CoK ECL1 block 34 natural encounter (descriptor 28)', () => {
  it.skipIf(!existsSync(ecl1) || !existsSync(geo1))(
    'reaches the unique selector-28 hobgoblin/warrior/mage encounter and sets its consumed bit after combat',
    async () => {
      const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(ecl1))).find((b) => b.blockId === 34)!;
      const geo34 = readDaxDataBlocks(new Uint8Array(await readFile(geo1))).find((b) => b.blockId === 34)!;
      const map34 = decodeGeoBlock(geo34.raw, 'CoK GEO1#34 natural');
      const matching = map34.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 28);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[3, 15, 0x9c]]);

      const memory = new Map<number, number>();
      const runner = dialogueForCell(blk34.raw, matching[0]!.cell.floor ?? 0, { memory, seed: 0x1234 });
      expect(runner).not.toBeNull();
      if (!runner) return;

      // A one-choice flavour beat precedes the real menu — press through it first.
      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the opening flavour beat');
      expect(opening.text).toMatch(/HOBGOBLINS AND HUMANS/i);
      expect(opening.choices).toEqual(['PRESS BUTTON OR RETURN TO CONTINUE.']);

      const menuTurn = runner.choose(0);
      expect(menuTurn.kind).toBe('say');
      if (menuTurn.kind !== 'say') throw new Error('expected the explicit ATTACK/WAIT/LEAVE prompt');
      expect(menuTurn.choices).toEqual(['ATTACK', 'WAIT', 'LEAVE']);

      const turn = runner.choose(0); // ATTACK
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected CoK combat');
      expect(turn.monsters).toEqual([
        { monsterId: 13, count: 8, picBlockId: 13 },
        { monsterId: 35, count: 5, picBlockId: 35 },
        { monsterId: 38, count: 2, picBlockId: 38 },
      ]);
      expect(memory.get(0x4c55) ?? 0).toBe(0);

      // Resume runs a day-count check and a second flavour beat before the consumed-bit write.
      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('say');
      expect(memory.get(0x4c55) ?? 0).toBe(0);

      const after = runner.choose(0);
      expect(after.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4c55)).toBe(0x20);
    },
  );
});

// --- golden: real CoK ECL2/GEO2 block 49 natural encounter (descriptor 28, MIDDLE route) -----
//
// BUILD-QUEUE item 6's CoK middle-area leaf: a second, distinct-area natural encounter following
// the same method CoAB/Secret/Pool's own middle routes used
// (`docs/engine/research/persistent-natural-routes.md`). The campaign-route target map's own
// FIRST-sorted ECL2.DAX candidate (`ECL2.DAX#48`, requiring `[0x4c5c] != 0`) was investigated and
// REJECTED: that flag is set only by a different, undecodable branch of ECL1.DAX#34 itself (a
// `COMPARE [0x7ec7],#128` day-count guard whose false-branch immediate opcode `0x41` is outside
// this project's Gen1 `OPCODES` table — a genuine decode gap, not a reachable checkpoint). Rather
// than force an unprovable cross-file quest gate, this promotion picked the next-best, fully
// self-contained ECL2 candidate: `ECL2.DAX#49` selector 28, whose own `[0x4c6e]` consumed bit is
// both read and written inside this same block. GEO2#49's unique selector-28 cell `(6,10)` is a
// single legal directed-edge step from the block's own `chooseStart` spawn `(6,9,north)`
// (`tools/find_geo_path.py --geo GEO2.DAX --block 49 --start 6,9 --target 6,10 --facing north`),
// so no intermediate cells are crossed and no memory seeding is required. The encounter is a named
// story beat, not a generic wandering-monster roll: "MYRTANI LAUGHS AT YOU FROM THE TOP OF A
// CIRCULAR STAIRCASE. HE CARRIES THE DRAGONLANCE." (Myrtani is CoK's own draconian antagonist).
// Unlike every other proven Gen1 route in this project, the consumed-bit write
// (`ADD #0x20, [0x4c6e] -> [0x4c6e]` at vaddr `0x916F`) executes BEFORE `SETUP_MONSTER`/`COMBAT`
// (vaddr `0x9220`), not after victory — the golden below asserts the bit is already `0x20` at the
// opening flavour beat, not just at the end. Victory's own resume (vaddr `0x9221`) leads to a
// genuine two-choice "DO YOU WISH TO GO UP?" `['NO','YES']` menu; `NO` ends the runner cleanly.
// `YES` re-presents the same prompt rather than transitioning floors — Greybox's own `EclVm` does
// not model whatever operand this branch's stairs-up dispatch uses, so that follow-up is left
// uninvestigated (out of scope for this leaf) rather than forced. See
// docs/engine/research/persistent-natural-routes.md's "CoK's Second Route (Middle)".
const ecl2 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ECL2.DAX');
const geo2 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'GEO2.DAX');

describe('primeSearchLocation — golden CoK ECL2 block 49 natural encounter (descriptor 28, middle route)', () => {
  it.skipIf(!existsSync(ecl2) || !existsSync(geo2))(
    'reaches the unique selector-28 Myrtani/BAAZ/KAPAK encounter and sets its consumed bit before combat',
    async () => {
      const blk49 = readDaxDataBlocks(new Uint8Array(await readFile(ecl2))).find((b) => b.blockId === 49)!;
      const geo49 = readDaxDataBlocks(new Uint8Array(await readFile(geo2))).find((b) => b.blockId === 49)!;
      const map49 = decodeGeoBlock(geo49.raw, 'CoK GEO2#49 natural (middle)');
      const matching = map49.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 28);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[6, 10, 0x9c]]);

      const memory = new Map<number, number>();
      const runner = dialogueForCell(blk49.raw, matching[0]!.cell.floor ?? 0, { memory, seed: 0x1234 });
      expect(runner).not.toBeNull();
      if (!runner) return;

      // A one-choice flavour beat precedes combat — no explicit ATTACK/WAIT/LEAVE menu here.
      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the opening flavour beat');
      expect(opening.text).toMatch(/MYRTANI/i);
      expect(opening.choices).toEqual(['PRESS BUTTON OR RETURN TO CONTINUE.']);
      // Unlike every other proven Gen1 route, the consumed bit is set BEFORE combat resolves.
      expect(memory.get(0x4c6e)).toBe(0x20);

      const turn = runner.choose(0);
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected CoK combat');
      expect(turn.text).toMatch(/THEY ATTACK/i);
      expect(turn.monsters).toEqual([
        { monsterId: 1, count: 5, picBlockId: 1 },
        { monsterId: 14, count: 4, picBlockId: 14 },
      ]);
      expect(memory.get(0x4c6e)).toBe(0x20);

      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('say');
      if (resumed.kind !== 'say') throw new Error('expected the post-combat stairs prompt');
      expect(resumed.text).toMatch(/CIRCULAR STAIRS GOING UP/i);
      expect(resumed.choices).toEqual(['NO', 'YES']);

      const after = runner.choose(0); // NO — stay on this floor
      expect(after.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4c6e)).toBe(0x20);
    },
  );
});

// --- investigation: DoK ECL1/GEO1 block 33 natural encounter (descriptor 33) --------------
//
// DoK's own P2 slice (`docs/engine/BUILD-QUEUE.md`'s "Blocked prerequisite for CoK/DoK" leaf).
// 2026-07-18 UPDATE (operand-table audit, dok-natural-route.md): DoK uses the 1991+ SHORT operand
// frames (`ECL_GEN1_SHORT`: 0x1D = 0 operands, 0x2C = 1) — every earlier decode of this block that
// crossed a 0x1D/0x2C instruction was desynced from that point. Two prior claims in this comment's
// earlier revision are hereby corrected: (a) the PRIESTS branch does NOT contain
// `SETUP_MONSTER #70` followed by a bad GOTO — the corrected stream at 0x8b76 is
// `PRINTCLEAR "PRIESTS HOLD AN EVIL RITE." ; DELAY ; PRINT " 'HEATHENS!'" ; SAVE #8 -> [0x4c58] ;
// GOTO 0x9ad5`, which enters a SHARED table-driven encounter builder at 0x9ad5 (seven GETTABLE
// reads indexed by [0x4c58]; row 8 = ROGUE x4 + BLACK WIZARD x1 + PATRIARCH x3, picture 75); and
// (b) monster ids 45/66/67/70/72 are all REAL `MON1CHA.DAX` records (the archive is a sparse
// 64-record set whose ids reach 97 — "ids 0-63" was wrong; id 97 is the named NPC IGORF).
// 2026-07-23 UPDATE (dok-natural-route.md Update 15): **the long-standing "code-0x79 GOTO"
// blocker is CLOSED — it was never a GOTO at all.** DoK's own GAME.OVR handler for SETUP_MONSTER
// (0x0C, file offset 0xBAC) is `vm_LoadCmdSets(4)` — the short dialect gives 0x0C a FOUR-operand
// frame (`ECL_GEN1_SHORT.wordSetOverrides[0x0c] = 4`), and the bytes `01 79 7f` at 0x9b28 are
// exactly SETUP_MONSTER's fourth operand (code 0x01 = address, word 0x7F79) — not an opcode. The
// corrected stream is `SETUP_MONSTER #70, #1, #255, [0x7F79]` (10 bytes, ending at 0x9b2b), and
// the builder then decodes with ZERO exotic constructs straight through `CLEARMONSTERS` -> six
// conditional table-driven `LOAD_MONSTER`s -> `COMBAT` at 0x9b86. This also retroactively explains
// why the static scanner's "dynamic-GOTO fallthrough" model looked coherent: its fallthrough
// continuation (operand end = 0x9b2b) happened to be exactly the correct next-instruction
// boundary. The multi-round DOSBox-X hunt for a "code-0x79 GOTO semantic" was chasing an operand
// -frame artifact. This test is now a full route pin, no longer a halting tripwire: with the
// documented `[0x4c57]=3` seed the PRIESTS branch (`SAVE #8 -> [0x4c58]`) selects encounter-table
// row 8 (tables at vaddrs 0x9d14..0x9d50, read directly from the block bytes): picture 75,
// ROGUE (id 45) x4 + BLACK WIZARD (id 67, pic 66) x1 + PATRIARCH (id 70) x3.
const dokEcl1 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'ECL1.DAX');
const dokGeo1 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'GEO1.DAX');

describe('primeSearchLocation — DoK ECL1 block 33 natural encounter (descriptor 33, ex-"code-0x79" blocker CLOSED)', () => {
  it.skipIf(!existsSync(dokEcl1) || !existsSync(dokGeo1))(
    'reaches the byte-grounded selector-33 GEO cell, real retail flavour text, and the table-row-8 COMBAT (the old "GOTO 0x79" halt was SETUP_MONSTER\'s 4th operand)',
    async () => {
      const blk33 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl1))).find((b) => b.blockId === 33)!;
      const geo33 = readDaxDataBlocks(new Uint8Array(await readFile(dokGeo1))).find((b) => b.blockId === 33)!;
      const map33 = decodeGeoBlock(geo33.raw, 'DoK GEO1#33 investigation');
      const matching = map33.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 33);
      // Five cells share this descriptor (unlike CoK block 34's single selector-28 cell); the exact
      // one chosen does not matter for this investigation, only that the descriptor is real GEO data.
      expect(matching.length).toBe(5);
      expect(matching[0]!.cell.floor).toBe(0xa1);

      // Explicit seed: the second-tier dispatch this branch reads from `[0x4c57]` (a scratch cell
      // reused for unrelated purposes elsewhere in the same block — see the research doc) is not
      // naturally 3 on a fresh game; seeding it selects the "PRIESTS" branch deterministically, the
      // same documented-seed convention Pool's own golden uses for `0x4a35`.
      const memory = new Map<number, number>([[0x4c57, 3]]);
      const vm = primeSearchLocation(blk33.raw, matching[0]!.cell.floor ?? 0, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT })!;
      expect(vm).not.toBeNull();
      const r = vm.run();

      const text = r.effects
        .filter((e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print')
        .map((e) => e.text ?? '')
        .join(' ');
      expect(text).toMatch(/PRIESTS HOLD AN EVIL RITE/i);
      expect(text).toMatch(/HEATHENS/i);

      // The visit counter (this block's closest analogue to a "consumed bit" — a second visit takes
      // a different, non-combat dispatch branch entirely) still advances before the halt.
      expect(memory.get(0x4c10)).toBe(1);

      // The shared encounter builder's `SETUP_MONSTER #70, #1, #255, [0x7F79]` (vaddr 0x9b21,
      // 4-operand short frame) executes — PATRIARCH (id 70) is a real MON1CHA.DAX record.
      expect(r.effects.some((e) => e.type === 'encounterSetup')).toBe(true);

      // CLOSED BLOCKER: with 0x0C's real 4-operand frame there is no "code-0x79 GOTO" — the
      // builder runs straight through the six conditional table-driven LOAD_MONSTERs to COMBAT
      // at vaddr 0x9b86. Row 8 of the embedded tables (vaddrs 0x9d1e..0x9d50, index [0x4c58]=8
      // written by the PRIESTS branch): id 28 x0 (skipped), id 45 x4, id 72 x0 (skipped),
      // id 66 x0 (skipped), id 67 x1 (pic 66), id 70 x3 — ROGUE x4 + BLACK WIZARD x1 +
      // PATRIARCH x3, byte-read from the block itself, matching what the VM loads here.
      expect(r.status).toBe('combat');
      const combatEffects = r.effects.filter((e): e is Extract<typeof e, { type: 'combat' }> => e.type === 'combat');
      expect(combatEffects.at(-1)?.monsters).toEqual([
        { monsterId: 45, count: 4, picBlockId: 45 },
        { monsterId: 67, count: 1, picBlockId: 66 },
        { monsterId: 70, count: 3, picBlockId: 70 },
      ]);
    },
  );
});

// --- golden: real DoK ECL1/GEO1 block 34 natural encounter (descriptor 12, SIVAK ambush) ----
//
// DoK's OWN P2 slice — the first PROVEN DoK natural combat, unblocked by the 2026-07-18
// operand-table audit (dok-natural-route.md "Update 9"): block 34 (Cekos, the SAME retail block
// Greybox's `dok` profile already boots — see dungeon-dok.test.ts) hides its whole dispatch
// behind `PARTYSTRENGTH` sites, which the old Gen1-long frames mis-decoded as a 1-operand
// instruction, killing every scan one instruction before the roster load. Under `ECL_GEN1_SHORT`
// the chain decodes and RUNS end to end: `GEO1.DAX#34` cell `(11,1)` (raw byte `0x8c` — the only
// descriptor-12 cell in the block) → `search_location` ON_GOTO index 12 → vaddr `0x92b7` →
// PRINTCLEAR "SIVAKS ARE GATHERED AROUND A TABLE." → `LOAD_MONSTER #33,#15,#33` (SIVAK ×15) →
// conditional `LOAD_MONSTER #97,#1,#97` (IGORF, only when `[0x4c5e]==1`) → `COMBAT` at `0x9327`
// → victory resume `OR #8,[0x4c5f]` (bit 3, the route's persistent word) + a real reward beat
// ("A SILVER KEY LIES ON THE TABLE.").
//
// 2026-07-23 REVISIT-SEMANTICS CORRECTION (dok-natural-route.md Update 15): the earlier claim
// that "the consumed bit does NOT suppress a revisit — it ARMS the SURPRISE and refires" was an
// artifact of decoding SURPRISE (0x23) with the long dialect's 4-operand frame. DoK's own
// GAME.OVR handler for 0x23 (file offset 0x3076) fetches ZERO ECL operands and TAIL-CALLS the
// CMD_Exit handler after a fixed message-window redraw — short-dialect SURPRISE is a 1-byte,
// script-TERMINAL instruction. So `AND #8,[0x4c5f] ; IF_NE ; SURPRISE` at 0x92b7-0x92c1 is the
// standard Gen1 consumed-bit idiom after all: bit 3 set → the guarded terminal SURPRISE runs →
// the script exits silently, NO refire. The revisit case below pins the corrected semantic
// (and the browser persistence check asserts the same "cannot refire" as every other route).
describe('primeSearchLocation — golden DoK ECL1 block 34 natural encounter (descriptor 12, SIVAK route)', () => {
  it.skipIf(!existsSync(dokEcl1) || !existsSync(dokGeo1))(
    'reaches the unique descriptor-12 SIVAK x15 ambush, resumes with the silver-key beat, and sets [0x4c5f] bit 3',
    async () => {
      const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl1))).find((b) => b.blockId === 34)!;
      const geo34 = readDaxDataBlocks(new Uint8Array(await readFile(dokGeo1))).find((b) => b.blockId === 34)!;
      const map34 = decodeGeoBlock(geo34.raw, 'DoK GEO1#34 natural');
      const matching = map34.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 12);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[11, 1, 0x8c]]);

      // Fresh visit: no seeding at all — [0x4c5f] (consumed word) and [0x4c5e] (IGORF gate) both
      // start clear, exactly the state a new game's first walk to Cekos has. The chain is
      // seed-independent (no RANDOM executes on the fight path when [0x7ca8] is 0).
      const memory = new Map<number, number>();
      const runner = dialogueForCell(blk34.raw, matching[0]!.cell.floor ?? 0, {
        memory, seed: 0x1234, dialect: ECL_GEN1_SHORT,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      const turn = runner.start();
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected the SIVAK combat');
      expect(turn.text).toMatch(/SIVAKS ARE GATHERED AROUND A TABLE/i);
      expect(turn.text).toMatch(/THEY ATTACK/i);
      // The IGORF group does NOT load on a fresh game ([0x4c5e]=0 fails the COMPARE #1 gate).
      expect(turn.monsters).toEqual([{ monsterId: 33, count: 15, picBlockId: 33 }]);
      // Fresh visit: the guarded SURPRISE instruction is skipped (bit 3 clear → IF_NE false).
      expect(turn.surprise).toBeUndefined();
      expect(memory.get(0x4c5f) ?? 0).toBe(0);

      // Victory resume: the consumed-bit OR runs immediately, then the silver-key reward beat.
      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(resumed.text).toMatch(/A SILVER KEY LIES ON THE TABLE/i);
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4c5f)).toBe(0x08);
    },
  );

  it.skipIf(!existsSync(dokEcl1))(
    'adds the conditional IGORF group when [0x4c5e]=1; a revisit with bit 3 set is consumed by the terminal short SURPRISE (no refire)',
    async () => {
      const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl1))).find((b) => b.blockId === 34)!;

      // IGORF arm: [0x4c5e]==1 satisfies the COMPARE #1/IF_EQ gate before the second LOAD_MONSTER.
      const igorfMemory = new Map<number, number>([[0x4c5e, 1]]);
      const igorfRunner = dialogueForCell(blk34.raw, 0x8c, {
        memory: igorfMemory, seed: 0x1234, dialect: ECL_GEN1_SHORT,
      })!;
      const igorfTurn = igorfRunner.start();
      expect(igorfTurn.kind).toBe('combat');
      if (igorfTurn.kind !== 'combat') throw new Error('expected the SIVAK+IGORF combat');
      expect(igorfTurn.monsters).toEqual([
        { monsterId: 33, count: 15, picBlockId: 33 },
        { monsterId: 97, count: 1, picBlockId: 97 },
      ]);

      // Revisit: bit 3 of [0x4c5f] set → `AND #8,[0x4c5f] ; IF_NE ; SURPRISE` — the guarded
      // SURPRISE is the SHORT dialect's 0-operand, script-TERMINAL form (DoK GAME.OVR handler
      // 0x3076 tail-calls CMD_Exit), so the encounter is consumed: silent exit, no combat, no
      // memory change. (The pre-2026-07-23 "refires with SURPRISE armed" reading came from the
      // wrong 4-operand SURPRISE frame — see the describe comment.)
      const revisitMemory = new Map<number, number>([[0x4c5f, 0x08]]);
      const revisitRunner = dialogueForCell(blk34.raw, 0x8c, {
        memory: revisitMemory, seed: 0x1234, dialect: ECL_GEN1_SHORT,
      })!;
      const revisitTurn = revisitRunner.start();
      expect(revisitTurn.kind).toBe('end');
      if (revisitTurn.kind !== 'end') throw new Error('expected the consumed revisit to end silently');
      expect(revisitTurn.text).toBe('');
      expect(revisitMemory.get(0x4c5f)).toBe(0x08);
    },
  );
});

// DoK's MIDDLE campaign-matrix leg (docs/engine/research/persistent-natural-routes.md § DoK's
// Fourth Route). ECL2.DAX#67's descriptor-3 town-square ambush was previously mis-diagnosed as
// blocked on a "cross-block precondition [0xC00D] a fresh game never satisfies"
// (dok-natural-route.md Update 11) — the gate is actually `COMPARE #1, [0xC04D]` (a transcription
// slip in the update), and [0xC04D] is the retail HOST FACING register: the check is simply
// "party is facing east", a fully player-controllable, deterministic condition, not an unproven
// flag. Firing it through the production `facing:` option additionally required fixing
// gen1MapDirectionValue to the ECL-visible half-direction ordinals (0=N,1=E,2=S,3=W) — see its
// doc comment for the 5-title corpus census grounding that fix.
const dokEcl2 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'ECL2.DAX');
const dokGeo2 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'GEO2.DAX');

describe('primeSearchLocation — golden DoK ECL2 block 67 middle-area ambush (descriptor 3, facing-gated)', () => {
  it.skipIf(!existsSync(dokEcl2) || !existsSync(dokGeo2))(
    'fires the east-facing town-square ambush (PATRIARCH/CRAZED DWARF/BLACK MAGE), sets [0x4c65] bit 4 on victory',
    async () => {
      const blk67 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl2))).find((b) => b.blockId === 67)!;
      const geo67 = readDaxDataBlocks(new Uint8Array(await readFile(dokGeo2))).find((b) => b.blockId === 67)!;
      const map67 = decodeGeoBlock(geo67.raw, 'DoK GEO2#67 natural');
      // The ambush square: exactly four masked-3 cells, a contiguous 2x2 block. NOTE the raw floor
      // byte is 0x03 — no 0x80 "event" bit — the dispatch masks &0x3f, so plain 0x03 selects
      // ON_GOTO arm 3 exactly like 0x83 would (the browser walk dispatches every stepped cell).
      const matching = map67.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 3);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([
        [8, 7, 0x03], [9, 7, 0x03], [8, 8, 0x03], [9, 8, 0x03],
      ]);

      // Fresh visit, facing east ([0xC04D]=1 through the production facing option): the
      // "gotten behind the ambush" arm (GOTO 0x8851) → SAVE #2,[0x7ecb] → combat at 0x87e7.
      const memory = new Map<number, number>();
      const runner = dialogueForCell(blk67.raw, matching[0]!.cell.floor ?? 0, {
        memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing: 'east',
      });
      expect(runner).not.toBeNull();
      if (!runner) return;
      const turn = runner.start();
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected the town-square ambush combat');
      expect(turn.text).toMatch(/YOU HAVE GOTTEN BEHIND THE AMBUSH/i);
      expect(turn.text).toMatch(/FIGHTERS CLOSEST TO THE ATTACK TURN TO FIGHT/i);
      // MON1CHA.DAX ids (DoK ships a single MONCHA archive): 70=PATRIARCH, 43=CRAZED DWARF,
      // 66=BLACK MAGE.
      expect(turn.monsters).toEqual([
        { monsterId: 70, count: 6, picBlockId: 70 },
        { monsterId: 43, count: 10, picBlockId: 43 },
        { monsterId: 66, count: 6, picBlockId: 66 },
      ]);
      // Fresh visit: the SURPRISE instruction is guarded by [0x4c65] bit 4 (revisit-only).
      expect(turn.surprise).toBeUndefined();
      expect(memory.get(0x4c65) ?? 0).toBe(0);

      // Victory resume: post-combat facing check (COMPARE #1,[0xC04D] again at 0x87f3) routes the
      // east-facing fight straight to the consumed-bit OR (0x8836) and the rout beat.
      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(resumed.text).toMatch(/THE REST RUN AWAY/i);
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4c65)).toBe(0x10);
    },
  );

  it.skipIf(!existsSync(dokEcl2))(
    'warns without combat (and without consuming) on any non-east entry; a revisit with bit 4 set is consumed by the terminal short SURPRISE',
    async () => {
      const blk67 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl2))).find((b) => b.blockId === 67)!;

      // Non-east entries take the warning arm (PRINTCLEAR 0x8754): real retail text, no combat,
      // no consumed-bit write.
      //
      // CORRECTED 2026-08-06 — this case previously asserted `kind === 'end'` and explained the
      // silence as "the ambush stays armed, so a walk can enter the square frontally and still
      // trigger the fight by stepping east afterwards". That reading was an artifact of the old
      // `0x31 = SPRITE_OFF` framing, not retail behaviour. The retail bytes at 0x879b are:
      //
      //   OLD (0x31 = 0-operand SPRITE_OFF)      NEW (0x31 = SHORT_MENU, wordSet 2, countAt 1)
      //   0x879b [31] SPRITE_OFF                 0x879b [31] SHORT_MENU (1,0x7f79) (0,0x2)
      //   0x879c [01] GOTO (code 121, 0x7f)                          'RETREAT' 'ATTACK'
      //   0x879f [00] EXIT                       0x87b0 [25] ON_GOTO (1,0x7f79) (0,0x2)
      //   0x87a0 [02] GOSUB 'RETREAT'                                (1,0x9bc4) (1,0x87bc)
      //   0x87a9      *** TRUNCATED (0x80) ***   0x87bc [12] PRINTCLEAR 'THE ENEMY IS UPON YOU!'
      //
      // The old arm's "GOTO" operand code 121 is the low byte of 0x7f79 — the standard Gen1 menu
      // destination cell, the very address the Gateway HORIZONTAL_MENU golden below asserts as
      // `destAddr: 0x7f79`. Under the correct framing the following ON_GOTO *reads that same cell*
      // as its selector, and its item-1 target 0x87bc loads 0x46 x6 / 0x2b x10 / 0x42 x6 — exactly
      // the {70,6},{43,10},{66,6} roster the east-facing golden above already asserts. Skipping the
      // menu also walked the decoder straight into a hard truncation four instructions later.
      //
      // So retail offers RETREAT/ATTACK here and pauses for the answer. `end` was never correct.
      for (const facing of ['north', 'south', 'west'] as const) {
        const memory = new Map<number, number>();
        const r = dialogueForCell(blk67.raw, 0x03, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing })!;
        const t = r.start();
        expect(t.kind).toBe('say');
        if (t.kind !== 'say') throw new Error('expected the ambush menu');
        expect(t.text).toMatch(/AS YOU ENTER THE SQUARE/i);
        expect(t.text).toMatch(/AN AMBUSH!/i);
        expect(t.choices).toEqual(['RETREAT', 'ATTACK']);
        // Still unconsumed at the choice point: the bit-4 write lives past the combat arm.
        expect(memory.get(0x4c65) ?? 0).toBe(0);

        // Item 1 (ON_GOTO target 0x87bc) is the fight, with the block's own roster.
        const fight = r.choose(1);
        expect(fight.kind).toBe('combat');
        if (fight.kind !== 'combat') throw new Error('expected the ATTACK arm to fight');
        expect(fight.text).toMatch(/THE ENEMY IS UPON YOU/i);
        expect(fight.monsters).toEqual([
          { monsterId: 70, count: 6, picBlockId: 70 },
          { monsterId: 43, count: 10, picBlockId: 43 },
          { monsterId: 66, count: 6, picBlockId: 66 },
        ]);
      }

      // Revisit with bit 4 set: `AND #0x10,[0x4c65] ; IF_NE ; SURPRISE` at 0x8735-0x873f — the
      // guarded SURPRISE is the short dialect's 0-operand, script-TERMINAL form (DoK GAME.OVR
      // handler 0x3076 tail-calls CMD_Exit): the encounter is consumed, silent exit, regardless
      // of facing. (Same 2026-07-23 correction as block 34 — the old "refires armed" reading
      // came from the wrong 4-operand SURPRISE frame; see the block-34 describe comment.)
      const revisitMemory = new Map<number, number>([[0x4c65, 0x10]]);
      const revisitRunner = dialogueForCell(blk67.raw, 0x03, {
        memory: revisitMemory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing: 'east',
      })!;
      const revisitTurn = revisitRunner.start();
      expect(revisitTurn.kind).toBe('end');
      if (revisitTurn.kind !== 'end') throw new Error('expected the consumed revisit to end silently');
      expect(revisitTurn.text).toBe('');
      expect(revisitMemory.get(0x4c65)).toBe(0x10);
    },
  );

  it.skipIf(!existsSync(dokEcl2))(
    'route intermediates (2026-07-23 correction): descriptor 9 is a REAL consumable encounter — first crossing fights PATRIARCH x4 + BLACK MAGE x4, victory sets [0x4C03] bit 2, second crossing is silent; open floor stays silent',
    async () => {
      const blk67 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl2))).find((b) => b.blockId === 67)!;
      // The 13-step find_geo_path walk from the block's own scripted arrival (10,0) to the square
      // crosses exactly two nonzero-descriptor cells — (11,5) and (9,6), both masked 9 (byte
      // 0x89). The pre-2026-07-23 claim that both were "VM-proven silent no-ops" was an artifact
      // of the 3-operand SETUP_MONSTER frame: the ON_GOTO arm-9 stream at 0x8FC0 desynced right
      // after `SETUP_MONSTER #70,#1,#255` and appeared to exit. Under the byte-proven 4-operand
      // frame (`SETUP_MONSTER #70,#1,#255,#0`, DoK GAME.OVR handler 0xBAC = vm_LoadCmdSets(4))
      // the arm decodes as a full retail encounter: guard `AND #4,[0x4C03] ; IF_NE ; EXIT`
      // (consumed check) → PRINTCLEAR "YOU SURPRISE MAGES AND CLERICS PRACTICING THEIR SPELLS."
      // → PARTYSTRENGTH → SAVE #2,[0x7ECB] → CLEARMONSTERS → LOAD_MONSTER #70 x4 + #66 x4 →
      // COMBAT (0x9017) → victory: `OR #4,[0x4C03]` (0x9023) → EXIT. So the natural middle-leg
      // walk REALLY fights this spell-practice encounter at (11,5) first; the second descriptor-9
      // crossing at (9,6) is then silent via the consumed bit. [0x4c65] (the square's own word)
      // is untouched throughout — no collision with the ambush leg.
      const memory = new Map<number, number>();
      const first = dialogueForCell(blk67.raw, 0x89, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing: 'west' })!;
      const firstTurn = first.start();
      expect(firstTurn.kind).toBe('combat');
      if (firstTurn.kind !== 'combat') throw new Error('expected the descriptor-9 spell-practice combat');
      expect(firstTurn.text).toMatch(/YOU SURPRISE MAGES AND CLERICS PRACTICING THEIR SPELLS/i);
      expect(firstTurn.monsters).toEqual([
        { monsterId: 70, count: 4, picBlockId: 70 },
        { monsterId: 66, count: 4, picBlockId: 66 },
      ]);
      expect(memory.get(0x4c03) ?? 0).toBe(0);
      const firstResumed = first.afterCombat('victory');
      expect(firstResumed.kind).toBe('end');
      expect(memory.get(0x4c03)).toBe(0x04);
      expect(memory.get(0x4c65) ?? 0).toBe(0);

      // Second crossing (same persistent memory): the consumed bit short-circuits to EXIT.
      for (const facing of ['north', 'east', 'south', 'west'] as const) {
        const again = dialogueForCell(blk67.raw, 0x89, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing })!;
        const t = again.start();
        expect(t.kind).toBe('end');
        expect(t.text).toBe('');
      }
      expect(memory.get(0x4c03)).toBe(0x04);

      // Open floor (0x80 / 0x00) stays a silent no-op for every facing on a fresh memory.
      for (const backdrop of [0x80, 0x00]) {
        for (const facing of ['north', 'east', 'south', 'west'] as const) {
          const fresh = new Map<number, number>();
          const r = dialogueForCell(blk67.raw, backdrop, { memory: fresh, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing })!;
          const t = r.start();
          expect(t.kind).toBe('end');
          expect(t.text).toBe('');
          expect(fresh.get(0x4c65) ?? 0).toBe(0);
        }
      }
    },
  );
});

describe('EclVm cold run — golden DoK ECL1 block 17 wilderness-mode entry (campaign matrix, wilderness leg)', () => {
  // 2026-07-18: tools/map_gen1_area_mode_writes.py had two stacked bugs that produced a false
  // "0 hits" result for DoK -- (1) `death-knights-of-krynn` was missing from the tool's own
  // GEN1_PROFILE_IDS tuple entirely (every `--profile death-knights-of-krynn` invocation was
  // silently filtered to zero games scanned), and (2) even once added, its `decode_one()` call
  // omitted DoK's `GEN1_SHORT_WORD_SETS` operand dialect (the same class of decode-desync bug
  // dok-natural-route.md's Update 9 already root-caused for the P2/combat scanner). Both are now
  // fixed in the tool; rerunning it against real retail bytes surfaces 25 genuine SAVE-to-0x4BE6
  // hits across DoK's ECL1/2/3.DAX (previously invisible). This test locks in the simplest one:
  // ECL1.DAX#17's `initial_entry` (vaddr 0x8014, ALWAYS the cold entry point of a freshly loaded
  // block -- see disassemble.ts's header doc) writes `SAVE #0, 0x4BE6` at vaddr 0x801a
  // UNCONDITIONALLY -- zero COMPARE/IF instructions execute before it, so no memory seeding is
  // needed at all, unlike every other proven Gen1 natural route in this project.
  //
  // 0x4BE6 is CoAB's own `Area1.inDungeon` flag (ovr008.cs `vm_SetMemoryValue`'s SAVE
  // special-case, `field_6A00_Set` -> Area1 offset 0x1CC; see
  // tools/map_gen1_area_mode_writes.py's module docstring for the full source citation): 0 means
  // `GameState.WildernessMap`. This is engine-golden proof, against real retail ECL1.DAX bytes,
  // that DoK's own content genuinely drives the WildernessMap engine mode -- the evidentiary bar
  // the campaign matrix's "proven" status requires (VM golden and/or CFG trace against the real
  // retail disassembly; live in-browser wiring is explicitly NOT required, matching this
  // project's own precedent for CoK's and Secret's quest legs). Live in-browser wiring of DoK's
  // own wilderness walk (which area(s) actually render on the WILDCOM tileset once this flag is
  // clear) is left for a follow-up round, exactly like CoK's Sixth Route deferred its own
  // block-17 narration trigger.
  it.skipIf(!existsSync(dokEcl1))(
    'ECL1#17 initial_entry sets inDungeon=0 (WildernessMap) unconditionally, before any branch, then LOAD_FILES/PICTURE/EXIT cleanly',
    async () => {
      const blk17 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl1))).find((b) => b.blockId === 17)!;

      const vm = new EclVm(blk17.raw, { dialect: ECL_GEN1_SHORT });

      // Step to the SAVE at 0x801a and confirm it is the SECOND instruction executed (only
      // `initial_entry`'s own opening SAVE at 0x8014 precedes it) -- i.e. genuinely unconditional,
      // not merely reachable under some branch outcome.
      const first = vm.step();
      expect(first.instruction?.vaddr).toBe(0x8014);
      expect(first.instruction?.mnemonic).toBe('SAVE');
      const second = vm.step();
      expect(second.instruction?.vaddr).toBe(0x801a);
      expect(second.instruction?.mnemonic).toBe('SAVE');
      expect(second.instruction?.args.map((a) => a.word)).toEqual([0, 0x4be6]);

      // Run to completion cold (no seeded memory at all) and confirm a clean exit with the
      // area-setup effects the retail bytes actually produce on a fresh load.
      const fresh = new EclVm(blk17.raw, { dialect: ECL_GEN1_SHORT });
      const res = fresh.run();
      expect(res.status).toBe('exited');
      expect(fresh.memory.get(0x4be6)).toBe(0); // inDungeon cleared -> WildernessMap
      expect(res.effects).toEqual([
        { type: 'loadFiles', geoBlockId: 127, operands: [127, 127, 127] },
        { type: 'picture', id: 112 },
      ]);
    },
  );
});

// --- golden: real DoK town-leg entries (campaign matrix, town leg) --------
// (`dokEcl2` is declared above, with the middle-leg block-67 goldens.)

const dokEcl3 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'ECL3.DAX');

describe('EclVm cold run — golden DoK ECL3 block 81 town entry (campaign matrix, town leg)', () => {
  // 2026-07-18: found while sweeping the campaign matrix's remaining `not-tracked` DoK legs.
  // ECL3.DAX#81's `initial_entry` COMPAREs [0x4bf2] against 81 and IF_EQs away on a match; on
  // cold (all-zero) memory the compare is false, so nothing is skipped and execution falls
  // straight through into the same SAVE chain either way -- this is a self-identity guard
  // ("is this really area 81"), not a game-progress gate, so no memory seeding is required for a
  // genuine cold entry. The SAVE chain then writes `SAVE #1 -> 0x4BE6` (`Area1.inDungeon = 1`,
  // the mirror image of ECL1#17's wilderness-leg `inDungeon = 0` golden above -- 1 selects the
  // local/tactical area map that both dungeons AND towns render on), `LOAD_FILES(80,...)`,
  // `LOAD_PIECES(5,...)`, then a `PARLAY` (attitude-select menu) before printing the arrival
  // text and exiting.
  //
  // The PARLAY itself exposed a real, general (non-DoK-specific) VM bug: DoK's Gen1-SHORT
  // dialect encodes PARLAY with a single operand (just `destAddr`, no value-remap table), which
  // made `case 0x2c` in vm.ts build an EMPTY `valueMap: []` (truthy, not undefined) -- every
  // resumed choice then resolved via `valueMap[index] ?? valueMap[0] ?? 0`, i.e. always 0,
  // regardless of which attitude the caller picked. Fixed in `src/ecl/vm.ts` (`valueMap:
  // values.length > 0 ? values : undefined`) so a table-less PARLAY now passes the raw chosen
  // index straight through, matching the existing MENU/ASK passthrough convention. This single
  // fix is what unblocks this test AND the ECL2#64 golden below (previously both looped/limbo'd
  // on every PARLAY resume, byte-identically regardless of the choice argument).
  const town = { text: [] as string[] };
  it.skipIf(!existsSync(dokEcl3))(
    'ECL3#81 initial_entry falls through into inDungeon=1, LOAD_FILES/LOAD_PIECES/PARLAY, then a real Dulcimer arrival text on any attitude choice',
    async () => {
      const blk81 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl3))).find((b) => b.blockId === 81)!;

      const cold = new EclVm(blk81.raw, { dialect: ECL_GEN1_SHORT });
      const first = cold.run();
      expect(first.status).toBe('awaiting-input');
      expect(cold.memory.get(0x4be6)).toBe(1); // inDungeon set -> local/town area mode
      const menuEffect = first.effects.find((e) => e.type === 'menu') as any;
      expect(menuEffect?.style).toBe('parlay');
      const loadFilesEffect = first.effects.find((e) => e.type === 'loadFiles') as any;
      expect(loadFilesEffect).toEqual({ type: 'loadFiles', geoBlockId: 80, operands: [80, 127, 255] });

      // Every attitude choice reaches the SAME clean exit with the SAME real Dulcimer arrival
      // text -- proving the PARLAY fix genuinely unblocks the leg rather than just one lucky
      // choice value, and that DoK's own retail content really does drive a named-town entry.
      for (let choice = 0; choice < 5; choice++) {
        const vm = new EclVm(blk81.raw, { dialect: ECL_GEN1_SHORT });
        vm.run();
        const resumed = vm.resume(choice);
        expect(resumed.status).toBe('exited');
        const text = resumed.effects
          .filter((e) => e.type === 'print')
          .map((e: any) => e.text as string)
          .join('');
        expect(text).toContain('THIS MAIN STREET LEADS INTO DULCIMER');
        expect(text).toContain('ZOMBIES FILL A MARKET TO THE EAST');
        town.text.push(text);
      }
      expect(new Set(town.text).size).toBe(1); // choice-independent, as expected for a location-arrival print
    },
  );
});

describe('EclVm cold run — golden DoK ECL2 block 64 town entry (campaign matrix, town leg, second archive)', () => {
  // Same shape as ECL3#81 above, in a different ECL archive (ECL2, Cerberus rather than
  // Dulcimer) -- confirms the PARLAY fix and the inDungeon=1 town-entry pattern generalize
  // across DoK's content rather than being a one-block coincidence.
  it.skipIf(!existsSync(dokEcl2))(
    'ECL2#64 reaches a real Cerberus arrival text (funeral NPC dialogue) on any attitude choice, inDungeon=1',
    async () => {
      const blk64 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl2))).find((b) => b.blockId === 64)!;

      const cold = new EclVm(blk64.raw, { dialect: ECL_GEN1_SHORT });
      cold.run();
      expect(cold.memory.get(0x4be6)).toBe(1);

      const vm = new EclVm(blk64.raw, { dialect: ECL_GEN1_SHORT });
      vm.run();
      const resumed = vm.resume(0);
      expect(resumed.status).toBe('exited');
      const text = resumed.effects
        .filter((e) => e.type === 'print')
        .map((e: any) => e.text as string)
        .join('');
      expect(text).toContain('PEOPLE FROM CERBERUS FILL THE AREA');
      expect(text).toContain("FUNERAL IS IN THE MAUSOLEUM");
    },
  );
});

// --- golden: real DoK ECL3/GEO3 block 98 (campaign matrix, ending leg) -----
//
// Dargaard Keep, top floor — DoK's finale area (Lord Soth's keep; the box back-cover and the
// cluebook both name Dargaard as the campaign's end). The whole leg is re-derived from bytes:
//
// **Spawn (byte-grounded).** `ECL3.DAX#98`'s `initial_entry` (vaddr 0x8014) writes
// `SAVE #8,[0xC04B]; SAVE #14,[0xC04C]; SAVE #3,[0xC04D]` — party at (8,14) facing WEST — plus
// `SAVE #98,[0x4BF2]` (area id), `SAVE #1,[0x4BE6]` (inDungeon=1, same flag the town/wilderness
// legs golden), and `LOAD_FILES(98,127,255)` (GEO3#98). GEO3#98's own descriptor plane puts
// masked descriptor 1 on the spawn cell itself (raw 0x81 at (8,14)): the party spawns ON the
// spiral staircase. `initial_entry` then prints the Dargaard arrival text and GOTOs (0x80FD ->
// 0x8246) straight INTO the descriptor-1 arm's stair prompt — "GO DOWN THE STAIRS?" — which is
// the short-dialect 0-operand PARTY_SURPRISE (0x22), i.e. the byte-proven YES/NO prompt (DoK
// GAME.OVR handler 0x23BB; see disassemble.ts's ECL_GEN1_SHORT doc): YES (EQ) skips the
// `IF_NE; EXIT` guard into `NEWECL(#97)` (the floor below — the stair pair 98<->97); NO exits.
// On a plain walk-back onto the cell, the same arm is facing-gated `[0xC04D]==1` (east — facing
// the staircase).
//
// **The gauntlet (search_location, vaddr 0x81E0).** The dispatch prologue ANDs the cell byte
// with 63, resets the flash-door latch `[0x4C07]` on every non-4 descriptor, EXITs for
// descriptors >18, then ON_GOTOs 19 arms. `tools`-side Dijkstra over GEO3#98's wall/door edges
// (min-descriptor-crossings, then min-steps) from the spawn (8,14) to the Soth door (12,6)
// yields a 60-step wall-legal path crossing exactly 13 descriptor cells, in this order:
// d2(5,13) d4(3,14) d5(1,12) d4(2,10) d6(2,6) d7(1,4) d4(1,3) d8(1,2) d20(6,6) d22(6,7)
// d9(10,11) d10(11,11) d13(12,6). That order matches the script's own designed sequence
// EXACTLY: the taunting-voice arms are chained by `[0x4CCF]` (d2 requires 0 -> sets 1; d5
// requires 1 -> sets 2; d6 requires 2 -> sets 3; d7 requires 3 -> sets 4 and runs the Lady
// Lenore join beat, ending in the short dialect's script-TERMINAL 0-operand SURPRISE. The
// walked path needs no facing detours: both d4 flash-door crossings enter facing west/north
// (the arm accepts [0xC04D] 0 or 3), d8 enters north (requires 0), d20/d22 are >18 EXITs.
// (d7's Lenore text branches on `[0x4CD1]` — cold 0 gives the "I witnessed the body of a
// Solamnic Knight being risen... they called him 'Durfey'" foreshadow; `[0x4CD1]`=1, set by the
// lower floors' Durfey discovery, gives the alternate confession.)
//
// **Statues -> Durfey -> Soth.** d9 (10,11) is the statue door: HORIZONTAL_MENU
// 'IGNORE THEM'/'TALK'/'ATTACK'; IGNORE and TALK both `SAVE #1,[0x4C02]` (statues left animate);
// ATTACK fights IRON STATUE x2 and sets 2 (rubble). d10 (11,11) is the Durfey fight: MON3CHA
// 75=SIR DURFEY (undead) x1 + 18=SPECTRE x4, and — because `[0x4C02]`==1 from IGNORE — the
// statues "LUMBER THROUGH THE DOORWAY!" and join as 30=IRON STATUE x2 (the IF_EQ chain at
// 0x8AC5 also flips [0x4C02] to 3). Victory (engine combat-result register `[0x7EC7]` <= 128)
// runs `PARLAY(#134)` then the Durfey release beat and `SAVE #1,[0x4C03]`. d13 (12,6) is the
// finale arm at 0x8CAB: its FIRST instruction is `SAVE #1,[0x4CD0]` — the campaign-completion
// flag, the ONLY write to 0x4CD0 in DoK's entire ECL corpus (all three archives scanned; 26
// read sites across ECL1#17/#36, ECL2#48/#50/#64, ECL3#80/#81/#82 consume it) — then
// PARLAY(#133), the Lord Soth speech, and LOAD_MONSTER 78=LORD SOTH x1 + 26 x4 + 30 x5 into
// COMBAT. Victory -> "DO YOU STRIKE HIM WITH THE ROD OF OMNISCIENCE?" (0-operand
// PARTY_SURPRISE yes/no; NO regenerates Soth and loops the fight) -> whirlpool + PICTURE(115)
// + PARLAY(#135) -> "DO YOU TRY TO STOP HER?" (Lenore/Kitiara reveal, either answer converges)
// -> the rod explodes, `SAVE #0,[0x4CFF]; SAVE #0,[0x4BFB]; SAVE #3,[0x7F12]` and
// `NEWECL(#48)` — the ECL2#48 epilogue block. Campaign-matrix bar: VM goldens against real
// retail bytes; live browser wiring is explicitly NOT required (same precedent as CoK's and
// Secret's quest legs and DoK's own wilderness leg above).

const dokGeo3 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'GEO3.DAX');

describe('EclVm + dialogueForCell — golden DoK ECL3 block 98 Dargaard Keep top floor (campaign matrix, ending leg)', () => {
  it.skipIf(!existsSync(dokEcl3) || !existsSync(dokGeo3))(
    'initial_entry boots the byte-grounded spawn (8,14,west) on the descriptor-1 staircase and pauses at the stair YES/NO; NO exits, YES chains to block 97',
    async () => {
      const blk98 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl3))).find((b) => b.blockId === 98)!;
      const geo98 = readDaxDataBlocks(new Uint8Array(await readFile(dokGeo3))).find((b) => b.blockId === 98)!;

      // GEO ground truth: the spawn cell carries the staircase descriptor itself.
      const map98 = decodeGeoBlock(geo98.raw, 'DoK GEO3#98 ending');
      expect((map98.map.cells[14 * 16 + 8]!.floor ?? 0) & 0x3f).toBe(1);

      const vm = new EclVm(blk98.raw, { dialect: ECL_GEN1_SHORT });
      const r = vm.run();
      expect(r.status).toBe('awaiting-input');
      // Spawn pose + area bookkeeping, all from initial_entry's own SAVEs.
      expect(vm.memory.get(0x4bf2)).toBe(98); // area id
      expect(vm.memory.get(0x4be6)).toBe(1); // inDungeon=1 (local area map)
      expect(vm.memory.get(0xc04b)).toBe(8); // x
      expect(vm.memory.get(0xc04c)).toBe(14); // y
      expect(vm.memory.get(0xc04d)).toBe(3); // facing west
      const loadFiles = r.effects.find((e) => e.type === 'loadFiles') as any;
      expect(loadFiles).toEqual({ type: 'loadFiles', geoBlockId: 98, operands: [98, 127, 255] });
      const text = r.effects.filter((e) => e.type === 'print').map((e: any) => e.text as string).join('');
      expect(text).toContain('YOU REACH THE TOP FLOOR OF DARGAARD KEEP');
      expect(text).toContain('GO DOWN THE STAIRS?');
      const menu = r.effects.filter((e) => e.type === 'menu').pop() as any;
      expect(menu?.style).toBe('yesno');
      expect(menu?.items).toEqual(['YES', 'NO']);

      // NO (index 1 -> NE): the IF_NE'd EXIT fires.
      const no = new EclVm(blk98.raw, { dialect: ECL_GEN1_SHORT });
      no.run();
      expect(no.resume(1).status).toBe('exited');

      // YES (index 0 -> EQ): NEWECL(#97) — the stairs really go somewhere (floor below).
      const yes = new EclVm(blk98.raw, { dialect: ECL_GEN1_SHORT });
      yes.run();
      const y = yes.resume(0);
      expect(y.status).toBe('chain');
      expect(y.chainBlockId).toBe(97);
    },
  );

  it.skipIf(!existsSync(dokEcl3) || !existsSync(dokGeo3))(
    'the 60-step min-descriptor walk fires the [0x4CCF] voice gauntlet in order, joins Lenore, and the statue/Durfey/Soth chain writes [0x4CD0]=1 before chaining to the ECL2#48 epilogue',
    async () => {
      const blk98 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl3))).find((b) => b.blockId === 98)!;
      const geo98 = readDaxDataBlocks(new Uint8Array(await readFile(dokGeo3))).find((b) => b.blockId === 98)!;

      // GEO ground truth for every descriptor crossing on the derived path (raw byte, 0x80 event
      // bit set on all of them) — the walk below replays exactly these cells in this order.
      const map98 = decodeGeoBlock(geo98.raw, 'DoK GEO3#98 ending');
      const crossings: Array<[number, number, number]> = [
        [5, 13, 0x82], [3, 14, 0x84], [1, 12, 0x85], [2, 10, 0x84], [2, 6, 0x86], [1, 4, 0x87],
        [1, 3, 0x84], [1, 2, 0x88], [6, 6, 0x94], [6, 7, 0x96], [10, 11, 0x89], [11, 11, 0x8a], [12, 6, 0x8d],
      ];
      for (const [x, y, raw] of crossings) {
        expect(map98.map.cells[y * 16 + x]!.floor ?? 0, `GEO3#98 (${x},${y})`).toBe(raw);
      }

      // Walk the gauntlet prefix with ONE shared memory (the browser walk dispatches every
      // stepped cell, descriptor-0 included — those crossings reset the [0x4C07] flash latch, so
      // representative d0 cells from the path are replayed too).
      const memory = new Map<number, number>();
      const gauntlet: Array<{ at: [number, number]; facing: 'north' | 'east' | 'south' | 'west'; raw: number; expectText?: RegExp; ccf?: number }> = [
        { at: [5, 13], facing: 'west', raw: 0x82, expectText: /A DEEP VOICE SPEAKS SLOWLY|MAKE YOUR CHOICE!/, ccf: 1 },
        { at: [4, 13], facing: 'west', raw: 0 },
        { at: [3, 14], facing: 'west', raw: 0x84, expectText: /A FLASH OF LIGHT BLINDS YOU/ },
        { at: [2, 14], facing: 'west', raw: 0 },
        { at: [1, 12], facing: 'north', raw: 0x85, expectText: /AGAIN YOU MUST CHOOSE/, ccf: 2 },
        { at: [2, 12], facing: 'east', raw: 0 },
        { at: [2, 10], facing: 'north', raw: 0x84, expectText: /A FLASH OF LIGHT BLINDS YOU/ },
        { at: [1, 10], facing: 'west', raw: 0 },
        { at: [2, 6], facing: 'north', raw: 0x86, expectText: /YOU'VE MADE IT THIS FAR/, ccf: 3 },
        { at: [1, 6], facing: 'west', raw: 0 },
        { at: [1, 4], facing: 'north', raw: 0x87, expectText: /LADY LENORE IS HUDDLED HERE.*LENORE FALLS IN PLACE BEHIND THE PARTY/, ccf: 4 },
        { at: [1, 3], facing: 'north', raw: 0x84, expectText: /A FLASH OF LIGHT BLINDS YOU/ },
        { at: [1, 2], facing: 'north', raw: 0x88, expectText: /ARROW SLITS LINE THE WESTERN AND NORTHERN WALLS/ },
        { at: [1, 1], facing: 'north', raw: 0 },
        { at: [6, 6], facing: 'south', raw: 0x94 }, // descriptor 20: >18, prologue EXIT, silent
        { at: [6, 7], facing: 'south', raw: 0x96 }, // descriptor 22: >18, prologue EXIT, silent
      ];
      for (const step of gauntlet) {
        const runner = dialogueForCell(blk98.raw, step.raw, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing: step.facing })!;
        const turn = runner.start();
        expect(turn.kind, `(${step.at}) d${step.raw & 0x3f}`).toBe('end');
        if (turn.kind !== 'end') throw new Error('gauntlet steps never pause or fight');
        if (step.expectText) expect(turn.text.replace(/\s+/g, ' '), `(${step.at})`).toMatch(step.expectText);
        else if (!step.raw || (step.raw & 0x3f) > 18) expect(turn.text).toBe('');
        if (step.ccf !== undefined) expect(memory.get(0x4ccf), `(${step.at}) voice chain`).toBe(step.ccf);
      }
      expect(memory.get(0x4ccf)).toBe(4);

      // d9 statue door (10,11) entered east: IGNORE leaves the statues animate ([0x4C02]=1).
      const statue = dialogueForCell(blk98.raw, 0x89, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing: 'east' })!;
      const statueTurn = statue.start();
      expect(statueTurn.kind).toBe('say');
      if (statueTurn.kind !== 'say') throw new Error('expected the statue menu');
      expect(statueTurn.awaiting).toBe('menu');
      expect(statueTurn.choices).toEqual(['IGNORE THEM', 'TALK', 'ATTACK']);
      expect(statueTurn.text).toMatch(/THE TWO STATUES FLANKING THIS DOOR SLOWLY TURN/);
      const ignored = statue.choose(0);
      expect(ignored.kind).toBe('end');
      expect(ignored.text).toMatch(/THEY SAY NO MORE/);
      expect(memory.get(0x4c02)).toBe(1);

      // d10 Durfey (11,11) east: the ignored statues join the fight (roster gains IRON STATUE x2).
      const durfey = dialogueForCell(blk98.raw, 0x8a, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing: 'east' })!;
      const durfeyTurn = durfey.start();
      expect(durfeyTurn.kind).toBe('combat');
      if (durfeyTurn.kind !== 'combat') throw new Error('expected the Durfey fight');
      expect(durfeyTurn.text).toMatch(/REMAINS OF YOUR FORMER COMRADE, SIR DURFEY/);
      expect(durfeyTurn.text).toMatch(/THE STATUES FROM THE OTHER ROOM LUMBER THROUGH THE DOORWAY!/);
      expect(durfeyTurn.monsters).toEqual([
        { monsterId: 75, count: 1, picBlockId: 75 },
        { monsterId: 18, count: 4, picBlockId: 18 },
        { monsterId: 30, count: 2, picBlockId: 30 },
      ]);
      // Victory ([0x7EC7] engine result register stays <=128) -> PARLAY(#134) -> release beat.
      const durfeyParlay = durfey.afterCombat('victory');
      expect(durfeyParlay.kind).toBe('say');
      if (durfeyParlay.kind !== 'say') throw new Error('expected the post-Durfey parlay');
      const durfeyEnd = durfey.choose(0);
      expect(durfeyEnd.kind).toBe('end');
      expect(durfeyEnd.text).toMatch(/DURFEY YOU KNEW AND BEFRIENDED/);
      expect(memory.get(0x4c02)).toBe(3);
      expect(memory.get(0x4c03)).toBe(1);

      // d13 Soth (12,6) north: [0x4CD0]=1 is written BEFORE the parlay pause — reaching the door
      // is what completes the campaign flag, not any particular fight/rod outcome afterwards.
      const soth = dialogueForCell(blk98.raw, 0x8d, { memory, seed: 0x1234, dialect: ECL_GEN1_SHORT, facing: 'north' })!;
      const sothParlay = soth.start();
      expect(sothParlay.kind).toBe('say');
      expect(memory.get(0x4cd0)).toBe(1); // THE quest flag — sole corpus-wide write site (0x8CAB)
      const sothCombat = soth.choose(0);
      expect(sothCombat.kind).toBe('combat');
      if (sothCombat.kind !== 'combat') throw new Error('expected the Lord Soth fight');
      expect(sothCombat.text).toMatch(/LORD SOTH STANDS BEFORE YOU!/);
      expect(sothCombat.monsters).toEqual([
        { monsterId: 78, count: 1, picBlockId: 78 },
        { monsterId: 26, count: 4, picBlockId: 26 },
        { monsterId: 30, count: 5, picBlockId: 30 },
      ]);
      const rod = soth.afterCombat('victory');
      expect(rod.kind).toBe('say');
      if (rod.kind !== 'say') throw new Error('expected the rod prompt');
      expect(rod.text).toMatch(/DO YOU STRIKE HIM WITH THE ROD OF OMNISCIENCE\?/);
      expect(rod.choices).toEqual(['YES', 'NO']);
      const whirlpool = soth.choose(0); // YES
      expect(whirlpool.kind).toBe('say');
      if (whirlpool.kind !== 'say') throw new Error('expected the whirlpool parlay');
      expect(whirlpool.text).toMatch(/THE ROD ERUPTS WITH A WHIRLPOOL OF ENERGY/);
      const lenore = soth.choose(0);
      expect(lenore.kind).toBe('say');
      if (lenore.kind !== 'say') throw new Error('expected the Lenore prompt');
      expect(lenore.text).toMatch(/KITIARA, HELP ME!/);
      expect(lenore.text).toMatch(/DO YOU TRY TO STOP HER\?/);
      expect(lenore.choices).toEqual(['YES', 'NO']);
      const finale = soth.choose(0); // YES -> the Kitiara reveal converges into the epilogue
      expect(finale.kind).toBe('chain');
      if (finale.kind !== 'chain') throw new Error('expected the epilogue chain');
      expect(finale.text).toMatch(/YOU ARE DEALING WITH KITIARA/);
      expect(finale.blockId).toBe(48); // ECL2#48 epilogue
      expect(memory.get(0x4cff)).toBe(0);
      expect(memory.get(0x4bfb)).toBe(0);
      expect(memory.get(0x7f12)).toBe(3);
    },
  );
});

// --- golden: DoK quest leg — [0x4CD0] world-state gate (campaign matrix) ---

describe('EclVm cold run — golden DoK ECL2 block 64 quest gate (campaign matrix, quest leg, [0x4CD0])', () => {
  // The quest leg's cross-archive persistence proof, mirroring CoK's [0x4c37] and Secret's
  // [0x4c4d] Sixth-Route precedent: the flag written by the ending leg's sole corpus-wide setter
  // (`ECL3.DAX#98` vaddr 0x8CAB, the Soth-door arm above) is CONSUMED by a different archive's
  // area entry. `ECL2.DAX#64` is the Cerberus graveyard — the same block whose cold-boot funeral
  // branch the town-leg golden above already pins. Its `initial_entry` at 0x807C runs
  // `COMPARE [0x4CD0],#1; IF_EQ SAVE #5,[0x4C89]; IF_EQ GOTO 0x8236` -> "THE GRAVEYARD LIES
  // BEFORE YOU, RESTORED TO ITS PRIOR SERENITY." — the world visibly changes state after the
  // Dargaard finale (and [0x4C89]=5 marks the graveyard subplot resolved; 0x81D2 shows the same
  // convergence for a mid-quest [0x4C87] path). With the flag clear, the same entry pauses at
  // the funeral PARLAY and prints the haunted-graveyard content instead — proven cold in the
  // town-leg golden. 25 further read sites across ECL1#17/#36, ECL2#48/#50/#64, ECL3#80/#81/#82
  // consume the same flag (camp interrupts, epilogue gating, area entries) — this is the
  // headline reader, chosen because it is reachable from the block's own default cold entry
  // with a single seeded flag.
  it.skipIf(!existsSync(dokEcl2))(
    'ECL2#64 initial_entry with [0x4CD0]=1 skips the funeral parlay entirely and exits on the restored-serenity text, setting [0x4C89]=5',
    async () => {
      const blk64 = readDaxDataBlocks(new Uint8Array(await readFile(dokEcl2))).find((b) => b.blockId === 64)!;

      // Flag set (post-Dargaard): no pause at all — straight to the restored graveyard.
      const done = new EclVm(blk64.raw, { dialect: ECL_GEN1_SHORT, memory: new Map([[0x4cd0, 1]]) });
      const r = done.run();
      expect(r.status).toBe('exited');
      const text = r.effects.filter((e) => e.type === 'print').map((e: any) => e.text as string).join('');
      expect(text).toContain('THE GRAVEYARD LIES BEFORE YOU, RESTORED TO ITS PRIOR SERENITY.');
      expect(text).not.toContain('PEOPLE FROM CERBERUS');
      expect(done.memory.get(0x4c89)).toBe(5);

      // Flag clear (pre-Dargaard): the entry pauses at the funeral parlay instead — the contrast
      // that makes the gate a real world-state switch (full funeral content pinned by the
      // town-leg golden above).
      const before = new EclVm(blk64.raw, { dialect: ECL_GEN1_SHORT });
      const b = before.run();
      expect(b.status).toBe('awaiting-input');
      expect(before.memory.get(0x4c89)).toBeUndefined();
    },
  );
});

// --- golden: real DQK ECL.GLB vmRun1 handlers ------------------------------

const eclGlb = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'ECL.GLB');

describe('primeVmRun1 — golden DQK ECL.GLB', () => {
  // Every known terminal/pause status `EclVm.run()` can return — the host's drain loop handles all.
  const TERMINAL = ['exited', 'halted', 'combat', 'awaiting-input', 'chain'];

  it.skipIf(!existsSync(eclGlb))('reaches an in-range vmRun1 and runs it to a terminal status, no throw', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclGlb)));
    // Areas confirmed by the C4.2b-2b-2c probe to expose an in-range vmRun1 pointer.
    for (const areaId of [5, 18, 22, 23, 30, 66]) {
      const block = arch.blockSourceById(areaId);
      expect(block, `area ${areaId} block`).toBeTruthy();
      const vm = primeVmRun1(block!, {
        dialect: ECL_GEN2,
        seedMemory: { 0xbf: 5, 0xc0: 5, 0x1b: areaId, 0x11: 0 },
        seed: 0x1234,
      });
      expect(vm, `area ${areaId} vmRun1`).not.toBeNull();
      // Naive seeding (no cell-descriptor [0x002d] / tickers — deferred to -iii) may dead-end in a
      // region the walker can't fully decode → 'halted'; the guarantee here is it terminates safely,
      // never throwing and never spuriously firing combat.
      const r = vm!.run();
      expect(TERMINAL, `area ${areaId} status`).toContain(r.status);
      expect(r.effects.some((e) => e.type === 'combat'), `area ${areaId} no spurious combat`).toBe(false);
    }
  });
});

// --- golden: real CoAB ECL6/GEO6 block 64 (ending/late-area route) --------

// BUILD-QUEUE item 6's ending/late-area leaf. The campaign-route target map
// (`build/gen1-campaign-route-map.json`) named this CoAB's "ending/late" candidate: area 6,
// `ECL6.DAX#64`, GEO cell `(6,14)` descriptor `0x82`, `COMBAT 0x880c`, GIANT SPIDER x4. Unlike the
// middle-route leaf's `ECL2#4`, this candidate's own cell IS the legally-reachable entry point —
// re-derived here against the real engine, not trusted from the JSON: `tools/find_geo_path.py
// --geo GEO6.DAX --block 64 --start 12,6 --target 6,14 --facing north --avoid-event-index <every
// other masked descriptor 1..22>` finds a real 14-step wall-legal path from the browser-style
// `chooseStart` spawn `(12,6)` that touches ONLY the ambient descriptor-0 floor and the target cell
// itself — no forced detour through another area-6 checkpoint, unlike the second route's selector-7
// pitfall. `ECL6.DAX#64`'s own `search_location` entry ANDs the loaded cell's raw floor byte with
// `127` (a 7-bit mask, not every CoAB block's `0x3F`) before its 23-way `ON_GOTO`; masked value `2`
// (`0x82 & 0x7F`) is the sole match and is cell `(6,14)`'s own unique descriptor (verified: no other
// cell in GEO6#64 masks to 2). Reachability into `ECL6.DAX` itself is the hub's own real dispatch,
// not synthetic: `ECL1.DAX#80`'s destination `ON_GOTO` on `mem[0x4C9B]` (copied from `mem[0x4C9C]`
// at vaddr 0x8098) has 14 targets; index 13 is `SAVE 1,0x4BE6; SAVE 6,0x7F12; NEWECL 64` (vaddr
// 0x85c8-0x85d5) — the same hub mechanism ADR-0009's golden already proved for index 9 -> area 5.
// `ECL6.DAX#64`'s vaddr 0x8768 dispatch is a genuine two-stage boss encounter, not a single fight:
// a real four-choice menu (`HORIZONTAL_MENU`/`ON_GOTO` at vaddr 0x87a7/0x87cb) gates entry; choice 0
// runs `SETUP_MONSTER`/`LOAD_MONSTER(66,4,65)` (GIANT SPIDER x4, `MON6CHA.DAX` id 66) into `COMBAT`
// at 0x880c. On a fresh visit (`[0x4CBE]` unset) the resume at 0x880d takes an unconditional `GOTO
// 0x8858` straight into a SECOND `SETUP_MONSTER`/`LOAD_MONSTER(67,1,67)` (RAKSHASA x1, `MON6CHA.DAX`
// id 67) `COMBAT` at 0x886d, only setting the consumed bit `[0x4CBF]=1` after THAT fight resolves.
// See `docs/engine/research/persistent-natural-routes.md`'s "CoAB's Fourth Route" section.
const coabEcl6 = resolve(coabRoot, 'ECL6.DAX');
const coabGeo6 = resolve(coabRoot, 'GEO6.DAX');

describe('primeSearchLocation — golden CoAB ECL6 block 64 (ending/late-area route)', () => {
  it.skipIf(!existsSync(coabEcl6) || !existsSync(coabGeo6))(
    'reaches the unique masked-2 giant-spider/rakshasa encounter and sets its consumed bit only after both fights',
    async () => {
      const blk64 = readDaxDataBlocks(new Uint8Array(await readFile(coabEcl6)))
        .find((b) => b.blockId === 64)!;
      const geo64 = readDaxDataBlocks(new Uint8Array(await readFile(coabGeo6)))
        .find((b) => b.blockId === 64)!;
      const map64 = decodeGeoBlock(geo64.raw, 'CoAB GEO6#64');
      // ECL6#64's own search_location masks the raw floor byte with 0x7F, not the 0x3F every other
      // CoAB block in this file uses — decoded straight from its own AND instruction, not assumed.
      const matching = map64.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 2);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[6, 14, 0x82]]);

      const memory = new Map<number, number>([[0x4cbe, 0], [0x4cbf, 0]]);
      const runner = dialogueForCell(blk64.raw, matching[0]!.cell.floor ?? 0, { memory, seed: 0x1234 });
      expect(runner).not.toBeNull();
      if (!runner) return;

      // A genuine four-way menu gates entry (not a degenerate single-choice continue).
      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the ending-area encounter menu');
      expect(opening.choices).toHaveLength(4);

      const turn = runner.choose(0);
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected the GIANT SPIDER combat');
      expect(turn.monsters).toEqual([{ monsterId: 66, count: 4, picBlockId: 65 }]);
      expect(memory.get(0x4cbf)).toBe(0);

      // Fresh visit ([0x4CBE] unset) resumes straight into the RAKSHASA fight with no interactive
      // beat in between — the retail script's own unconditional GOTO past the "already fought"
      // flavour text, byte-traced above.
      const second = runner.afterCombat('victory');
      expect(second.kind).toBe('combat');
      if (second.kind !== 'combat') throw new Error('expected the chained RAKSHASA combat');
      expect(second.monsters).toEqual([{ monsterId: 67, count: 1, picBlockId: 67 }]);
      expect(memory.get(0x4cbe)).toBe(1);
      expect(memory.get(0x4cbf)).toBe(0);

      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4cbf)).toBe(1);
    },
  );
});

// --- golden: ADR-0009 cross-archive NEWECL into the ending/late area (ECL4#37 -> hub ECL1#80 ->
// ECL6#64) -------------------------------------------------------------------------------------
//
// Strengthens the ending/late-area leaf's "reachable via real NEWECL targets, not guessed" bar the
// same way the wilderness-transition leaf's own golden did for area 5: chains through the SAME real
// hub dispatch (`ECL1.DAX#80`'s `mem[0x4C9B]` `ON_GOTO`) but seeds destination selector 13 instead
// of 9, landing in `ECL6.DAX#64` (game_area 6) instead of `ECL5.DAX#49` (game_area 5).
describe('runEclChain — golden ending/late-area cross-archive crossing (real CoAB ECL4/ECL1/ECL6)', () => {
  it.skipIf(!existsSync(coabEcl4) || !existsSync(coabEcl1) || !existsSync(coabEcl6))(
    'follows a real SAVE(...,0x7F12)+NEWECL out of ECL4#37, through the ECL1#80 wilderness hub, into ECL6#64 (game_area 6)',
    async () => {
      const src4 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(coabEcl4))));
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(coabEcl1))));
      const src6 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(coabEcl6))));
      const areaSource = (gameArea: number): BlockSource | undefined => {
        if (gameArea === 4) return src4;
        if (gameArea === 1) return src1;
        if (gameArea === 6) return src6;
        return undefined;
      };

      // Real, byte-traced path (`tools/scratch_scan_hub_newecl.py`, deleted after use, same
      // convention as the ADR-0009 golden's own now-deleted scratch scanner): the hub's `ON_GOTO` on
      // `mem[0x4C9B]` (copied from `mem[0x4C9C]` at vaddr 0x8098) has 14 targets; index 13 is
      // `SAVE 1,0x4BE6; SAVE 6,0x7F12; NEWECL 64` (vaddr 0x85c8-0x85d5) — verified by a BFS over the
      // decoded CFG that tracks the last immediate value written to 0x7F12 before every reachable
      // `NEWECL`, the same primitive `gen1_ecl_encounter_scan.py` already exports.
      const memory = new Map<number, number>([
        [0x4c9c, 13], // hub destination selector -> ECL6#64 (game_area 6)
        [0x4c0c, 1], // hub "confirm travel" flag -> skip the interactive travel/city menu
      ]);

      let result = runEclChain(37, src4, {
        memory,
        seed: 1,
        autoCombat: true,
        areaSource,
        startGameArea: 4,
        maxBlocks: 10,
      });
      let guard = 0;
      while (result.resume && guard < 10) {
        guard++;
        result = result.resume(0);
      }

      expect(result.status).toBe('exited');
      expect(result.visited).toEqual([37, 80, 64]);
      expect(result.effects.filter((e) => e.type === 'setGameArea')).toEqual([
        { type: 'setGameArea', gameArea: 1 },
        { type: 'setGameArea', gameArea: 6 },
      ]);
    },
  );
});

// --- golden: real Secret ECL1/GEO1 block 16 (middle-area route) -----------
//
// BUILD-QUEUE item 6's "repeat the matrix for the remaining two already-Persistent games" leaf,
// Secret's own middle-area candidate. The campaign-route target map (`build/gen1-campaign-route-
// map.json`) names area 1, `ECL1.DAX#16`, GEO cell `(14,11)` descriptor `0x82`, `COMBAT 0x892a`,
// BC LORD x7 -- re-verified here against the real engine, not trusted from the JSON, the same way
// CoAB's own middle-route leaf did (which found its literal candidate cell was NOT reachable and
// substituted an earlier checkpoint). Unlike CoAB's case, this literal candidate DOES hold up:
// `tools/find_geo_path.py --geo GEO1.DAX --block 16 --start 5,3 --target 14,11 --facing north`
// finds a real 17-step wall-legal path from the browser-style `chooseStart` spawn `(5,3)` that
// crosses no OTHER area-1 checkpoint requiring its own resolution -- the two nonzero intermediate
// descriptors on the shortest route (selector 18 at `(8,3)`/`(10,3)`, selector 14 at `(13,11)`) are
// both harmless one-shot flavour-text branches (byte-traced: selector 14's handler only formats a
// signpost string via `[0x4c2e]` bit `0x02`, a DIFFERENT bit than this encounter's own `0x01`;
// selector 18's handler is a guarded-EXIT flavour beat gated by its own independent `[0x4c2a]`
// one-shot flag) -- neither forces a detour through a different geo cell's own combat, so no
// safety seed is needed for them (unlike the early anchor's own two seeded neighbours).
//
// `ECL1.DAX#16`'s own `search_location` masks the loaded cell's raw floor byte with `0x3F` before
// a 20-way `ON_GOTO`; masked value `2` is cell `(14,11)`'s own unique descriptor. Its target branch
// (vaddr `0x8796`) is gated on two independent guards that must both be FALSE on a fresh visit
// (`[0x4cd9]==0`, `([0x4c2e]&1)==0` -- the latter is this encounter's own target precondition, its
// consumed bit), then presents THREE real player-facing checkpoints in sequence -- a "MARCUS" door
// scene that escalates into a guard confrontation, decoded straight from the printed retail text,
// not invented -- each requiring choice index 1 (the "press on"/decline-to-leave option) to stay on
// the combat path:
//   1. An opening GOSUB-driven prompt (vaddr 0x8806 -> 0x9b20): "A FIGHTER ANSWERS THE DOOR,
//      'MARCUS IS INVOLVED AND CANNOT BE DISTURBED. MIGHT I INTEREST YOU IN TRINKETS?'" /
//      `['YES','NO']` -- index 1 (NO) stays on route.
//   2. A genuine `HORIZONTAL_MENU`/`ON_GOTO` at vaddr 0x8884/0x8895: "'IF THERE IS NOTHING ELSE,
//      THEN I WILL BID YOU GOOD DAY.' WHAT DO YOU DO?" / `['LEAVE','STAY']` -- choice 0 exits via
//      `GOTO 0x9602`, index 1 (STAY) continues toward combat.
//   3. A second GOSUB-driven prompt (vaddr 0x8919 -> 0x9b20 again) immediately before
//      `LOAD_MONSTER`/`COMBAT`: "MORE GUARDS RUSH OUT INTO THE CORRIDOR. ... DO YOU LEAVE?" /
//      `['YES','NO']` -- index 1 (NO) triggers the fight.
// One guard along this path requires a runtime seed (`requires_runtime_seed: true` in the target
// map, matching the mechanism Pool/CoAB/Secret's other goldens already use): `[0x4c4d]!=0` gates
// the branch from the first checkpoint's narrative (vaddr 0x8834) into the second checkpoint's
// menu (vaddr 0x8862's `COMPARE`/`IF_NE`) rather than a different, unrelated fallthrough. Victory
// resumes at vaddr 0x892b (a morale/gold `COMPARE`) and sets the consumed bit
// (`OR [0x4c2e], #1 -> [0x4c2e]` at vaddr 0x8936) before the in-block `EXIT` at 0x893f, so the
// runner ends cleanly (`kind: 'end'`) right after combat resolves, the same immediately-next-
// instruction resume shape the early anchor and Pool/CoAB use.
// See `docs/engine/research/secret-natural-encounter-route.md`'s "Secret's Second Route" section.
const secretEcl1 = resolve(secretRoot, 'ECL1.DAX');
const secretGeo1 = resolve(secretRoot, 'GEO1.DAX');

describe('primeSearchLocation — golden Secret ECL1 block 16 (middle-area route)', () => {
  it.skipIf(!existsSync(secretEcl1) || !existsSync(secretGeo1))(
    'reaches the unique selector-2 BC LORD checkpoint chain and sets its consumed bit after combat',
    async () => {
      const blk16 = readDaxDataBlocks(new Uint8Array(await readFile(secretEcl1)))
        .find((b) => b.blockId === 16)!;
      const geo16 = readDaxDataBlocks(new Uint8Array(await readFile(secretGeo1)))
        .find((b) => b.blockId === 16)!;
      const map16 = decodeGeoBlock(geo16.raw, 'Secret GEO1#16');
      const matching = map16.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 2);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[14, 11, 0x82]]);

      // [0x4c4d]: the runtime seed the target map flags as required (see comment above). [0x4c2e]:
      // this encounter's own consumed word, starting clear (target precondition).
      const memory = new Map<number, number>([[0x4c4d, 1], [0x4c2e, 0]]);
      const runner = dialogueForCell(blk16.raw, matching[0]!.cell.floor ?? 0, { memory, seed: 0x1234 });
      expect(runner).not.toBeNull();
      if (!runner) return;

      // Checkpoint 1: the MARCUS door scene, a genuine two-choice prompt (not a degenerate
      // single-choice continue). NO (index 1) stays on route.
      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the MARCUS door-scene checkpoint prompt');
      expect(opening.choices).toEqual(['YES', 'NO']);
      expect(opening.text).toContain('MARCUS IS INVOLVED');

      // Checkpoint 2: the LEAVE/STAY menu. STAY (index 1) continues toward the guards.
      const second = runner.choose(1);
      expect(second.kind).toBe('say');
      if (second.kind !== 'say') throw new Error('expected the LEAVE/STAY checkpoint prompt');
      expect(second.choices).toEqual(['LEAVE', 'STAY']);
      expect(second.text).toContain('WHAT DO YOU DO');

      // Checkpoint 3: the guards' "DO YOU LEAVE?" prompt. NO (index 1) triggers the fight.
      const third = runner.choose(1);
      expect(third.kind).toBe('say');
      if (third.kind !== 'say') throw new Error('expected the guards\' DO YOU LEAVE? checkpoint prompt');
      expect(third.choices).toEqual(['YES', 'NO']);
      expect(third.text).toContain('MORE GUARDS RUSH OUT');

      const turn = runner.choose(1);
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected Secret BC LORD combat');
      expect(turn.monsters).toEqual([{ monsterId: 69, count: 7, picBlockId: 69 }]);
      expect(memory.get(0x4c2e)).toBe(0);

      // Victory sets the consumed bit and the runner ends cleanly (no further story beats).
      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4c2e)).toBe(1);
    },
  );
});

// --- golden: real Secret "quest" leg -- cross-block persistent alert flag ------------------
//
// BUILD-QUEUE item 6's campaign-promotion matrix "quest" leaf: a story-relevant flag SET in one
// block that is READ (and gates available content) in a genuinely DIFFERENT block -- never
// attempted for any Gen1 game before this. Found via `tools/map_gen1_cross_area_flag_reads.py`
// scanning every already-known consumed/precondition word from Secret's OWN proven routes for
// cross-block static reachability, then manually byte-verified (this project's
// "UNLOCATED beats invention" convention -- every hit needs a real disassembly read before
// promotion, per that tool's own doc comment).
//
// **The link:** ECL1.DAX block 34's `vm_run_1` handler (run on every step, not just per-cell
// `search_location`) contains a guarded write: `AND [0xc04f],#0x3f -> [0x7f79]` (the shared
// masked-descriptor compute already used by this file's CoK block-34 golden), then
// `COMPARE [0x7ed5],#1` / `IF_NE` (skip unless the town-exit gate flag from Secret's Fourth
// Route -- see `docs/engine/research/persistent-natural-routes.md` -- is exactly 1), then on the
// descriptor-45 branch: `SAVE #0xff,[0x4c4d]` ("Black Circle full alert"). Descriptor 45 belongs
// to GEO1.DAX#34 cell `(15,8)` (verified below, both the `&0x3f` and `&0x7f` masks agree since 45
// < 64). ECL1.DAX block 16 -- New Verdigris, Marcus's residence, the SAME `search_location` cell
// `(14,11)` this file's own "golden Secret ECL1 block 16" test above already proves -- reads
// `[0x4c4d]` at its very first branch point: 0 (or unset) takes the peaceful "YOU LEAVE THE
// BUILDING" exit with no combat; nonzero escalates into the guard confrontation and the BC LORD
// x7 fight the block-16 golden above proves. So block 34's alert write literally GATES whether
// block 16's already-proven middle route is reachable in escalated form at all -- a genuine
// cross-block quest dependency, not a same-block consumed bit.
//
// **Honest caveat:** `[0x7ed5]`'s own natural setter is UNLOCATED -- the full corpus scan finds
// only reads of it (ECL1.DAX blocks 16/33/34, ECL2.DAX blocks 52/68, ECL3.DAX blocks 81/96/97/98),
// zero `SAVE`-to-`[0x7ed5]` writes anywhere. Consistent with this project's existing
// `requires_runtime_seed` convention for other routes' unresolved preconditions (e.g. Secret's
// Second Route's own `[0x4c4d]!=0` precondition, which THIS finding turns out to explain -- see
// `persistent-natural-routes.md`), this test seeds `[0x7ed5]` directly rather than proving how a
// real playthrough sets it. The proof below is a real VM-executed round trip: block 34's
// `vm_run_1` genuinely computes and writes `[0x4c4d]`, and block 16's `search_location` genuinely
// branches on the value that write produced -- not an inferred or synthetic claim.
describe('primeVmRun1 — golden Secret ECL1 block 34 vm_run_1 (quest-flag setter, descriptor 45)', () => {
  it.skipIf(!existsSync(secretEcl1) || !existsSync(secretGeo1))(
    'writes the Black Circle alert flag [0x4c4d]=0xff only when [0x7ed5]==1, standing on the descriptor-45 cell',
    async () => {
      const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(secretEcl1))).find((b) => b.blockId === 34)!;
      const geo34 = readDaxDataBlocks(new Uint8Array(await readFile(secretGeo1))).find((b) => b.blockId === 34)!;
      const map34 = decodeGeoBlock(geo34.raw, 'Secret GEO1#34');
      const matching = map34.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 45);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[15, 8, 45]]);

      // Negative: standing on the descriptor-45 cell, but [0x7ed5] not seeded to 1 -- the write is
      // gated off, [0x4c4d] stays untouched.
      const unseededMemory = new Map<number, number>();
      const unseededVm = dialogueForVmRun1(blk34.raw, {
        memory: unseededMemory,
        seedMemory: { [MAP_CELL_BYTE_ADDR]: 45, [0x7ed5]: 0 },
      });
      expect(unseededVm).not.toBeNull();
      if (!unseededVm) return;
      const unseededTurn = unseededVm.start();
      expect(unseededTurn.kind).toBe('end');
      expect(unseededMemory.get(0x4c4d)).toBeUndefined();

      // Positive: [0x7ed5]==1 -- the guarded write fires.
      const setterMemory = new Map<number, number>();
      const setterVm = dialogueForVmRun1(blk34.raw, {
        memory: setterMemory,
        seedMemory: { [MAP_CELL_BYTE_ADDR]: 45, [0x7ed5]: 1 },
      });
      expect(setterVm).not.toBeNull();
      if (!setterVm) return;
      const setterTurn = setterVm.start();
      expect(setterTurn.kind).toBe('chain');
      expect(setterMemory.get(0x4c4d)).toBe(0xff);
    },
  );
});

describe('primeSearchLocation — golden Secret ECL1 block 16 quest gate (cross-block persistence of [0x4c4d])', () => {
  it.skipIf(!existsSync(secretEcl1) || !existsSync(secretGeo1))(
    'the Marcus door scene reads [0x4c4d]: unset ends peacefully with no combat, 0xff (set by block 34) escalates to BC LORD combat',
    async () => {
      const ecl1Blocks = readDaxDataBlocks(new Uint8Array(await readFile(secretEcl1)));
      const blk16 = ecl1Blocks.find((b) => b.blockId === 16)!;
      const blk34 = ecl1Blocks.find((b) => b.blockId === 34)!;
      const geo16 = readDaxDataBlocks(new Uint8Array(await readFile(secretGeo1))).find((b) => b.blockId === 16)!;
      const map16 = decodeGeoBlock(geo16.raw, 'Secret GEO1#16');
      const matching = map16.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 2);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[14, 11, 0x82]]);
      const cellFloor = matching[0]!.cell.floor ?? 0;

      // Negative direction: [0x4c4d] unset (block 34 never fired). Decline (index 1) at every
      // prompt; the scene must end peacefully with no combat and leave [0x4c4d]/[0x4c2e] untouched.
      const negMemory = new Map<number, number>([[0x4c4d, 0], [0x4c2e, 0]]);
      const negRunner = dialogueForCell(blk16.raw, cellFloor, { memory: negMemory, seed: 0x1234 });
      expect(negRunner).not.toBeNull();
      if (!negRunner) return;
      let negTurn = negRunner.start();
      expect(negTurn.kind).toBe('say');
      const negTexts: string[] = [];
      for (let guard = 0; guard < 4 && negTurn.kind === 'say'; guard++) {
        if (negTurn.text) negTexts.push(negTurn.text);
        negTurn = negRunner.choose(1);
      }
      expect(negTurn.kind).toBe('end');
      expect(negTexts.some((text) => text.includes('YOU LEAVE THE BUILDING'))).toBe(true);
      expect(negMemory.get(0x4c4d)).toBe(0);
      expect(negMemory.get(0x4c2e)).toBe(0);

      // Positive direction: reuse the SAME Map after block 34's vm_run_1 produces 0xff; do not
      // manufacture the consumer flag independently. The retail handler also emits NEWECL 32.
      // The browser's bounded evidence route makes the still-unrecovered #32 -> #16 link explicit.
      const posMemory = new Map<number, number>([[0x4c4d, 0], [0x4c2e, 0]]);
      const setterRunner = dialogueForVmRun1(blk34.raw, {
        memory: posMemory,
        seedMemory: { [MAP_CELL_BYTE_ADDR]: 45, [0x7ed5]: 1 },
      });
      expect(setterRunner).not.toBeNull();
      if (!setterRunner) return;
      const setterTurn = setterRunner.start();
      expect(setterTurn.kind).toBe('chain');
      if (setterTurn.kind !== 'chain') throw new Error('expected Secret alert setter to emit NEWECL');
      expect(setterTurn.blockId).toBe(32);
      expect(posMemory.get(0x4c4d)).toBe(0xff);

      // The SAME decline choices now escalate into the guard confrontation and BC LORD combat --
      // the same encounter this file's "golden Secret ECL1 block 16" test proves, reached here
      // purely because a DIFFERENT block's write changed the value block 16 reads.
      const posRunner = dialogueForCell(blk16.raw, cellFloor, { memory: posMemory, seed: 0x1234 });
      expect(posRunner).not.toBeNull();
      if (!posRunner) return;
      let posTurn = posRunner.start();
      expect(posTurn.kind).toBe('say');
      for (let guard = 0; guard < 4 && posTurn.kind !== 'combat'; guard++) {
        if (posTurn.kind === 'end' || posTurn.kind === 'chain') break;
        posTurn = posRunner.choose(1);
      }
      expect(posTurn.kind).toBe('combat');
      if (posTurn.kind !== 'combat') throw new Error('expected Secret BC LORD combat, gated open by [0x4c4d]');
      expect(posTurn.monsters).toEqual([{ monsterId: 69, count: 7, picBlockId: 69 }]);
    },
  );
});

// --- golden: real Pool ECL2/GEO2 block 20 (middle-area route) -------------
//
// BUILD-QUEUE item 6's "repeat the matrix for the remaining two already-Persistent games" leaf,
// Pool's own middle-area candidate. The campaign-route target map (`build/gen1-campaign-route-
// map.json`) names area 2, `ECL2.DAX#20`, GEO cell `(1,5)` descriptor `0x8e` (masked selector 14),
// `COMBAT 0xabf7`, OGRE x1 + GNOLL x2 + HOBGOBLIN LDR x2 -- re-verified here against the real
// engine, not trusted from the JSON, the same rigor CoAB's own middle-route leaf used (which found
// its literal candidate cell was NOT reachable and substituted an earlier checkpoint).
//
// **Finding: like CoAB, the literal (1,5)/selector-14 cell does NOT hold up as the reachable entry
// point.** `ECL2.DAX#20`'s `search_location` computes the masked descriptor once (`AND 0xc04f,
// #0x7f -> [0x6e82]`) then walks a manual linear-search loop (`[0x9800]` 0..20, `COMPARE
// [0x9800],[0x6e82]`/`IF_EQ`, else `[0x9800]+=1` and retry, `EXIT` past index 20) before its 21-way
// `ON_GOTO [0x9800]` -- the scanner's static branch exploration jumps straight to the index-14
// target without walking that loop, so the JSON candidate's own reachability is blind to every
// OTHER indexed cell the walk crosses first. A directed BFS replay
// (`tools/build_gen1_campaign_route_map.py`'s own `bfs_reachable`/`chooseStart` ported primitives)
// from `chooseStart (12,6,north)` to `(1,5)` is forced, in all 28 legal steps, through THREE cells
// with masked descriptor `13` first: `(0,7)` (25 steps), then `(0,6)`, then `(0,5)`, immediately
// before the final `east` step onto `(1,5)` itself.
// `tools/find_geo_path.py --geo GEO2.DAX --block 20 --start 12,6 --target 1,5 --facing north
// --avoid-event-index 13` (mask `0x7f`) **fails** -- "target (1, 5) is not reachable from (12, 6)"
// -- proving there is no way to reach `(1,5)` without first stepping onto a masked-13 cell, exactly
// mirroring CoAB's "every walk is forced through the checkpoint first" finding.
//
// Descriptor `13`'s own `ON_GOTO` branch (vaddr `0xab49`) is real content, not a dead end: gated on
// `[0x4acf]!=0xff` (fresh/default `0`, so the guard's `EXIT` is skipped), it runs `SETUP_MONSTER`,
// `APPROACH`, a `PRINTCLEAR` ("GUARDS RUN TO INTERCEPT YOU."), the SAME shared `GOSUB 0xb6bc`
// one-choice "press on" menu subroutine the target map's own (1,5)/selector-14 branch also calls,
// then `CLEARMONSTERS`/`LOAD_MONSTER(4,30,4)`/`LOAD_MONSTER(5,4,5)` into `COMBAT` at vaddr `0xab90`
// -- ORC x30 (`MON2CHA.DAX` id 4) + ORC LEADER x4 (id 5). Resume (`0xab91`) runs a `GOSUB 0xb69c`
// (shared treasure/victory narration, also reused by the (1,5) branch) then `SAVE 0xff,[0x4acf]`
// (the consumed flag) and an in-block `EXIT` -- no further chain. Two OTHER nonzero descriptors on
// the same walk (`21` at several cells, `7` at `(1,8)`/`(2,8)`/`(3,8)`) are byte-traced harmless:
// masked value `21` exceeds the `ON_GOTO`'s own 21-entry bound (indices `0..20`) and hits the loop's
// `IF_GT #0x14; EXIT` guard immediately; masked value `7` is a guarded one-shot `DELAY`/`RANDOM`
// three-way flavour-text branch (`[0x4a0a]` one-shot flag) with no `COMBAT`/`SETUP_MONSTER` on
// either arm. So descriptor 13's checkpoint -- not `(1,5)`'s own cell -- is Pool's real,
// legally-reachable middle-area natural route; `(1,5)`/selector 14 remains valid retail content but
// is only ever reached pre-consumed, after the checkpoint has already fired (its own `[0x4ad0]`
// guard is a DIFFERENT word than this checkpoint's `[0x4acf]`, so the two encounters do not share
// consumed state). The static target map's `ecl2-dax-20` middle candidate entry is left unmodified
// (`route_proven: false`) -- correct as a byte-decoded candidate, not as a claim about which cell in
// that block is the reachable entry point. See
// `docs/engine/research/persistent-natural-routes.md`'s "Pool's Second Route" section.
const poolEcl2 = resolve(poolRoot, 'ECL2.DAX');
const poolGeo2 = resolve(poolRoot, 'GEO2.DAX');

describe('primeSearchLocation — golden Pool ECL2 block 20 (middle-area route)', () => {
  it.skipIf(!existsSync(poolEcl2) || !existsSync(poolGeo2))(
    'replays the retail-proven locked-door descriptor-3 encounter through combat and resume',
    async () => {
      const blk20 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl2)))
        .find((b) => b.blockId === 20)!;
      const geo20 = readDaxDataBlocks(new Uint8Array(await readFile(poolGeo2)))
        .find((b) => b.blockId === 20)!;
      const map20 = decodeGeoBlock(geo20.raw, 'Pool GEO2#20');
      const cell = map20.map.cells[10 * 16 + 13]!;

      // DOSBox-X host-register trace: (14,10) west crosses wall slot 10 / door flag 2 only after
      // Bash succeeds, landing here with raw descriptor 0x83 (masked selector 3).
      expect({ floor: cell.floor, wallWest: cell.walls.west, doorWest: cell.doors?.west }).toEqual({
        floor: 0x83,
        wallWest: 0,
        doorWest: 0,
      });

      const memory = new Map<number, number>();
      const runner = dialogueForCell(blk20.raw, cell.floor ?? 0, {
        dialect: ECL_POOL,
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      let turn = runner.start();
      expect(turn.kind).toBe('say');
      if (turn.kind !== 'say') throw new Error('expected Pool descriptor-3 encounter menu');
      expect(turn.text).toMatch(/ELEGANTLY PANELLED ROOM/i);
      expect(turn.choices).toEqual(['LEAVE', 'TALK', 'ATTACK']);

      turn = runner.choose(2);
      for (let guard = 0; guard < 8 && turn.kind !== 'combat'; guard++) {
        if (turn.kind === 'end' || turn.kind === 'chain') break;
        turn = runner.choose(0);
      }
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected Pool descriptor-3 combat');
      expect(turn.monsters).toEqual([
        { monsterId: 6, count: 25, picBlockId: 6 },
        { monsterId: 5, count: 2, picBlockId: 5 },
        { monsterId: 94, count: 1, picBlockId: 94 },
        { monsterId: 4, count: 8, picBlockId: 4 },
      ]);

      let resumed = runner.afterCombat('victory');
      for (let guard = 0; guard < 8 && resumed.kind === 'say'; guard++) resumed = runner.choose(0);
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4a81)).toBe(0xff);
    },
  );

  it.skipIf(!existsSync(poolEcl2) || !existsSync(poolGeo2))(
    'reaches the unique selector-13 ORC/ORC LEADER checkpoint (not the JSON selector-14 cell) and sets its consumed flag after combat',
    async () => {
      const blk20 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl2)))
        .find((b) => b.blockId === 20)!;
      const geo20 = readDaxDataBlocks(new Uint8Array(await readFile(poolGeo2)))
        .find((b) => b.blockId === 20)!;
      const map20 = decodeGeoBlock(geo20.raw, 'Pool GEO2#20');

      // The target map's own literal candidate: selector 14, cell (1,5) — confirmed unique but,
      // per the finding above, only reachable AFTER the selector-13 checkpoint has already fired.
      const literalCandidate = map20.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 14);
      expect(literalCandidate.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[1, 5, 0x8e]]);

      // The real, legally-reachable checkpoint: selector 13, three cells, the nearest — (0,7) — 25
      // steps from chooseStart, a strict prefix of the 28-step walk to the JSON's own (1,5) cell.
      const checkpoint = map20.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 13);
      expect(checkpoint.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([
        [0, 5, 0x8d],
        [0, 6, 0x8d],
        [0, 7, 0x8d],
      ]);
      const nearest = checkpoint.find(({ x, y }) => x === 0 && y === 7)!;

      const memory = new Map<number, number>([[0x4acf, 0]]);
      const runner = dialogueForCell(blk20.raw, nearest.cell.floor ?? 0, {
        dialect: ECL_POOL,
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      // A genuine player-facing beat gates entry — "GUARDS RUN TO INTERCEPT YOU." plus a one-choice
      // continue (the shared GOSUB 0xb6bc subroutine every checkpoint in this block reuses).
      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the guards-intercept checkpoint prompt');
      expect(opening.text).toContain('GUARDS RUN TO INTERCEPT YOU');

      let turn = runner.choose(0);
      for (let guard = 0; guard < 4 && turn.kind === 'say'; guard++) {
        turn = runner.choose(0);
      }
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected Pool ORC/ORC LEADER combat');
      expect(turn.monsters).toEqual([
        { monsterId: 4, count: 30, picBlockId: 4 },
        { monsterId: 5, count: 4, picBlockId: 5 },
      ]);
      expect(memory.get(0x4acf)).toBe(0);

      // Victory resumes through a shared treasure/victory GOSUB, sets the consumed flag, and exits
      // cleanly in-block (no further chain).
      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4acf)).toBe(0xff);
    },
  );
});

// --- golden: real Secret ECL2/GEO2 block 68 (ending/late-area route) ------
//
// BUILD-QUEUE item 6's ending/late-area leaf for Secret. The campaign-route target map
// (`build/gen1-campaign-route-map.json`) names area 2, `ECL2.DAX#68`, GEO cell `(6,8)` descriptor
// `0x82` (masked selector 2), `COMBAT 0x856b`, "BC VETERAN x8" as the literal ending/late candidate
// -- re-verified here against the real engine, not trusted from the JSON, the same rigor CoAB's and
// Pool's own middle-route leaves used.
//
// **Finding: like CoAB's and Pool's middle routes, the literal (6,8)/selector-2 cell does NOT hold
// up as the reachable entry point -- and the real blocker here is more extreme than either of
// those.** `chooseStart`'s own algorithm spawns the party at `(4,4)` facing north, inside a tiny
// 3x3 room (`x:3..5, y:3..5`); a directed BFS shows the room has exactly ONE exit cell, `(5,4)`
// (masked descriptor `42`, raw `0xaa`) -- blocking it strands the party in an 8-cell pocket with
// `(6,8)` unreachable. Past that door, TWO MORE masked descriptors on the shortest route
// individually gate off `(6,8)` the same way: `41` at `(8,4)` and `43` at `(10,7)`
// (`tools/find_geo_path.py --geo GEO2.DAX --block 68 --start 4,4 --target 6,8 --facing north
// --event-mask 0x3f --avoid-event-index N`, run once per index, fails "target (6, 8) is not
// reachable" for every N in `{42, 41, 31, 43, 23, 46}` -- every nonzero descriptor on the walk, not
// only some of them). GEO2#68 is effectively a single-file gauntlet corridor from spawn, not an open
// room with alternate paths.
//
// Descriptor `42`'s own branch (vaddr `0x9575`) is real, substantial content, not a dead end: gated
// on `[0x4c9e]&0x40==0` (fresh/default `0`), it is a genuine TWO-STAGE boss fight -- the same
// "chained SETUP_MONSTER/LOAD_MONSTER/COMBAT pair, consumed bit set only after both" shape CoAB's
// own ending/late-area route (`ECL6#64`) uses. `SETUP_MONSTER`/`PRINTCLEAR`/a one-choice
// `GOSUB 0x9949` "press on" continue/`CLEARMONSTERS`/`LOAD_MONSTER(0xd,9,0xd)` into `COMBAT` at
// vaddr `0x95e1`: FIRE GIANT x9 (`MON1CHA.DAX` id `0xd` -- Secret ships ONE shared monster
// catalogue for the whole game, unlike CoAB's per-area files, so there is no "MONnCHA.DAX absent"
// fallback here, just the game's own single-file convention). On victory (not defeat -- the shared
// `COMPARE [0x7ec7],0x80;IF_GT;GOTO 0x9923` death branch every combat in this block reuses),
// execution falls straight through to a second `SETUP_MONSTER`/`PRINTCLEAR`/another one-choice
// `GOSUB 0x9949` continue/`CLEARMONSTERS`/`LOAD_MONSTER(0x1b,4,0x1b)` into `COMBAT` at vaddr
// `0x9626`: 12HD PYROHYDRA x4 (`MON1CHA.DAX` id `0x1b`). Only after BOTH fights resolve does the
// script set the consumed bit (`OR [0x4c9e],#0x40 -> [0x4c9e]` at vaddr `0x9632`) and `EXIT`
// cleanly -- no further chain, matching every other Secret/Pool/CoAB route's shape.
//
// This checkpoint needs no runtime seed at all (simpler than either of Secret's own other two
// routes): reaching it is nothing but walking one step east from `chooseStart`. `(6,8)`/selector 2
// (`BC VETERAN x8`) remains valid retail content but is only ever reached pre-consumed, well past
// this checkpoint (and the two further checkpoints at `(8,4)`/`(10,7)`) -- the static target map's
// `ecl2-dax-68` candidate entry is left unmodified (`route_proven: false`), correct as a
// byte-decoded candidate, not as a claim about which cell in that block is the actual reachable
// entry point. See `docs/engine/research/persistent-natural-routes.md`'s "Secret's Third Route"
// section.
const secretEcl2 = resolve(secretRoot, 'ECL2.DAX');
const secretGeo2 = resolve(secretRoot, 'GEO2.DAX');

describe('primeSearchLocation — golden Secret ECL2 block 68 (ending/late-area route)', () => {
  it.skipIf(!existsSync(secretEcl2) || !existsSync(secretGeo2))(
    'reaches the unique selector-42 door checkpoint (not the JSON selector-2 cell) and sets its consumed bit only after both fights',
    async () => {
      const blk68 = readDaxDataBlocks(new Uint8Array(await readFile(secretEcl2)))
        .find((b) => b.blockId === 68)!;
      const geo68 = readDaxDataBlocks(new Uint8Array(await readFile(secretGeo2)))
        .find((b) => b.blockId === 68)!;
      const map68 = decodeGeoBlock(geo68.raw, 'Secret GEO2#68');

      // The target map's own literal candidate: selector 2, cell (6,8) — confirmed unique but, per
      // the finding above, only reachable AFTER the selector-42 checkpoint (and two more) have
      // already fired.
      const literalCandidate = map68.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 2);
      expect(literalCandidate.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[6, 8, 0x82]]);

      // The real, legally-reachable checkpoint: selector 42, the sole exit from the spawn room.
      const checkpoint = map68.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 42);
      expect(checkpoint.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[5, 4, 0xaa]]);

      const memory = new Map<number, number>([[0x4c9e, 0]]);
      const runner = dialogueForCell(blk68.raw, checkpoint[0]!.cell.floor ?? 0, {
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      let turn = runner.start();
      for (let guard = 0; guard < 4 && turn.kind !== 'combat'; guard++) {
        if (turn.kind === 'end' || turn.kind === 'chain') break;
        turn = runner.choose(0);
      }
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected Secret FIRE GIANT combat');
      expect(turn.monsters).toEqual([{ monsterId: 13, count: 9, picBlockId: 13 }]);
      expect(memory.get(0x4c9e)).toBe(0);

      // Fresh visit falls straight through to a second flavour/continue beat then the chained
      // PYROHYDRA fight — no other player-facing decision in between.
      let second = runner.afterCombat('victory');
      for (let guard = 0; guard < 4 && second.kind !== 'combat'; guard++) {
        if (second.kind === 'end' || second.kind === 'chain') break;
        second = runner.choose(0);
      }
      expect(second.kind).toBe('combat');
      if (second.kind !== 'combat') throw new Error('expected the chained 12HD PYROHYDRA combat');
      expect(second.monsters).toEqual([{ monsterId: 27, count: 4, picBlockId: 27 }]);
      expect(memory.get(0x4c9e)).toBe(0);

      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4c9e)).toBe(0x40);
    },
  );
});

// --- golden: real Pool ECL8/GEO8 block 29 (ending/late-area route) --------
//
// BUILD-QUEUE item 6's ending/late-area leaf for Pool of Radiance. The campaign-route target map
// (`docs/engine/research/gen1-campaign-route-map.md`, `build/gen1-campaign-route-map.json`) names
// area 8, `ECL8.DAX#29`, GEO cell `(7,8)` descriptor `0x02` (masked selector 2), `COMBAT 0xa337`,
// "KOBOLD x6; KOBOLD LEADER x3" as the literal ending/late candidate -- re-verified here against the
// real engine, not trusted from the JSON, the same rigor CoAB's, Secret's, and Pool's own middle
// routes used.
//
// **Finding: the literal (7,8)/selector-2 cell does NOT hold the real dispatch -- ECL8#29's
// `search_location` is a THIRD dispatch shape, distinct from both the simple `AND mask -> ON_GOTO`
// pattern (Pool's early anchor, CoAB, Secret's middle) and the manual linear-search loop (Pool's own
// middle route).** It masks the floor byte (`AND [0xc04f],#0x7f -> [0x6e82]`, vaddr `0x9a2c`), then
// `GETTABLE [0xafce],[0x6e82] -> [0x9800]` -- an embedded byte LOOKUP TABLE at vaddr `0xafce`
// re-maps the masked descriptor to the actual `ON_GOTO [0x9800]` arm index, so "descriptor equals
// ON_GOTO arm index" (the assumption every prior route's own selector math relied on, and the one the
// static target-map tool's `selector_for_candidate` still makes) is simply false for this block.
// Decoding the table directly (`table[masked_descriptor]`) shows masked descriptor `2` -> arm `3`
// (vaddr `0x9a81`, a shared "sense of danger" sub-branch covering descriptors `{2,5,0x10,0x11}` --
// see below), NOT arm `2` (vaddr `0xa2d1`, `COMBAT 0xa337`'s real entry). Arm `2` is reached only by
// masked descriptor `1` (`table[1] == 2`, the sole preimage) -- GEO8#29's cell `(7,7)`, raw
// descriptor `0x1`, one cell north of the JSON's own `(7,8)`.
//
// **Reachability, re-verified against the real engine.** `tools/find_geo_path.py --geo GEO8.DAX
// --block 29 --start 11,2 --target 7,7 --facing north` finds a real 9-step walk (south south west
// south south south west west west) from `chooseStart`. Unlike CoAB's and Pool's own middle routes,
// this is not a forced-through-a-checkpoint trap: `(7,7)`'s four neighbours all carry their own
// nonzero descriptors (`2`/`(7,8)`, `5`/`(7,6)`, `0x10`/`(8,7)`, `0x11`/`(6,7)`), so EVERY approach
// necessarily steps onto one first (`--avoid-event-index` for all of them together fails --
// unavoidable, not a wrong-candidate signal). All four route through the SAME shared arm 3
// (`0x9a81`): gated on `[0x4a10]==0`, it sets a per-side selector then, when the party isn't
// surprised, harmlessly falls through a `PARTY_SURPRISE`/`SURPRISE`/`COMPARE [0x6dca],#1;IF_NE;EXIT`
// gauntlet. `SURPRISE` (opcode `0x23`) always writes its roll result to this engine's fixed
// `SURPRISE_RESULT_ADDR` (`0x02cb`, reverse-engineered from CoAB's own decompile), never to Pool's
// own `[0x6dca]` reference -- so in THIS engine `[0x6dca]` stays permanently `0`, making every one of
// these adjacent "sense of danger" triggers a deterministic no-op (confirmed by direct bytecode
// trace of both the shared arm-3 branch and the desc-4 corridor's own identical `[0x6dca]==1` gate --
// neither ever fires early combat or writes any flag). This is an existing engine simplification
// (the same shape as ADR-0009's CoAB-specific `0x7f12`/`set_game_area` hardcode), not something
// introduced for this route, and is the reason the walk is safely deterministic rather than
// RNG-sensitive despite crossing those cells.
//
// **A second, independent trap: the block's DEFAULT VM entry point is a no-op for a synthetic
// boot.** Booting `ECL8.DAX#29` with no `entry` override (this engine's default, `vm_run_1` at file
// offset `0x16`) computes an area-transition "which door did I enter through" check against
// `[0xc04f]` -- on an empty/fresh memory map (no real GEO edge crossing happened) this resolves to
// `[0x6e79]==0`, fails a `COMPARE [0x6e79],#3;IF_NE;EXIT` guard, and exits WITHOUT ever running
// `LOAD_FILES`/`LOAD_PIECES` (verified directly: `loadDungeon` throws "ECL init block emitted no
// LOAD_FILES (GEO map) effect" with no entry override). The block's own straight-line "normal
// in-area boot" leaf sits at file offset `0x35d` (vaddr `0x9c5b`): `LOAD_FILES(0x1d=29,2,0xff)` +
// `LOAD_PIECES(3,0x14,1)` + `EXIT` -- no compares before it, so it is entry-order-independent and
// deterministic regardless of memory state (confirmed: `loadDungeon(..., { entry: 0x35d })` succeeds
// with `geoBlockId=29`, `pieces=[3,20,1]`). This mirrors the `pool` profile's own pre-existing
// `eclEntryOffset: 0x73` (a real, non-default retail boot path), NOT the reverted `pool-natural-2`
// diff another concurrent pass tried and rolled back -- this offset was independently derived here
// from the real disassembly of block 29 alone, not copied from that attempt.
//
// **The encounter itself.** Arm `2` (vaddr `0xa2d1`) is gated on `[0x4a23]&1==0` (fresh/default `0`;
// set diverts to a distinct "already fought here" scene at `0xae4a`). Fresh, it falls through a
// `PRINTCLEAR` ("MONSTERS FROM THE SURROUNDING BUILDINGS ATTACK YOU.") plus the shared `GOSUB
// 0xaf0c` one-choice "press on" menu, then `CLEARMONSTERS`/`LOAD_MONSTER(0,6,0)`/`LOAD_MONSTER(1,3,
// 1)` into `COMBAT` at vaddr `0xa337`: **KOBOLD x6** (`MON8CHA.DAX` id `0`) + **KOBOLD LEADER x3**
// (id `1`) -- exactly the target map's own named roster, just reached from the neighbouring cell.
// This is a genuine TWO-WAVE fight, the same "chained combat, consumed bit set only after both"
// shape as CoAB's and Secret's own ending/late routes: victory resumes at `0xa338`, and (on a fresh
// `[0x6e79]!=0xfa` first pass) runs a second `PRINTCLEAR` ("A BAND OF KOBOLDS CLIMBS FROM THE WELL
// AND ATTACKS."), the SAME one-choice continue, then loops back through the identical
// `CLEARMONSTERS`/`LOAD_MONSTER`/`COMBAT` sequence for a SECOND, identical KOBOLD x6 + KOBOLD LEADER
// x3 fight. Only after THIS SECOND victory (`[0x6e79]==0xfa` now true) does the script set the
// consumed bit (`OR [0x4a23],#1 -> [0x4a23]` at vaddr `0xa3d1`) and `EXIT` cleanly -- no further
// chain, matching every other Gen1 route's shape.
//
// `(7,8)`/selector 2 remains valid retail content (the shared arm-3 "sense of danger" branch) but
// was never the real combat entry; the static target map's `ecl8-dax-29` candidate entry is left
// unmodified (`route_proven: false`) -- correct as a byte-decoded candidate, not as a claim about
// which cell in that block is the actual reachable entry point. See `docs/engine/research/
// persistent-natural-routes.md`'s "Pool's Third Route" section.
const poolEcl8 = resolve(poolRoot, 'ECL8.DAX');
const poolGeo8 = resolve(poolRoot, 'GEO8.DAX');

describe('primeSearchLocation — golden Pool ECL8 block 29 (ending/late-area route)', () => {
  it.skipIf(!existsSync(poolEcl8) || !existsSync(poolGeo8))(
    'reaches the unique selector-1 cell (7,7) (not the JSON selector-2 cell) and sets its consumed flag only after TWO waves',
    async () => {
      const blk29 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl8)))
        .find((b) => b.blockId === 29)!;
      const geo29 = readDaxDataBlocks(new Uint8Array(await readFile(poolGeo8)))
        .find((b) => b.blockId === 29)!;
      const map29 = decodeGeoBlock(geo29.raw, 'Pool GEO8#29');

      // The target map's own literal candidate: selector 2, cell (7,8) — confirmed unique but, per
      // the finding above, only reaches the SHARED "sense of danger" arm, not the real combat.
      const literalCandidate = map29.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 2);
      expect(literalCandidate.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[7, 8, 0x02]]);

      // The real, legally-reachable KOBOLD-lair cell: selector 1, unique, one step north.
      const real = map29.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 1);
      expect(real.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[7, 7, 0x01]]);
      const target = real[0];

      const memory = new Map<number, number>([[0x4a23, 0]]);
      const runner = dialogueForCell(blk29.raw, target.cell.floor ?? 0, {
        dialect: ECL_POOL,
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the surrounding-buildings ambush prompt');
      expect(opening.text).toContain('MONSTERS FROM THE SURROUNDING BUILDINGS ATTACK YOU');

      let turn = runner.choose(0);
      for (let guard = 0; guard < 4 && turn.kind === 'say'; guard++) {
        turn = runner.choose(0);
      }
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected the first KOBOLD wave');
      expect(turn.monsters).toEqual([
        { monsterId: 0, count: 6, picBlockId: 0 },
        { monsterId: 1, count: 3, picBlockId: 1 },
      ]);
      expect(memory.get(0x4a23)).toBe(0);

      // Victory chains straight into a second, identical wave — the well-narration continue beat,
      // then the SAME roster again — before the consumed bit is ever set.
      let second = runner.afterCombat('victory');
      expect(second.kind).toBe('say');
      if (second.kind !== 'say') throw new Error('expected the kobolds-from-the-well continue prompt');
      expect(second.text).toContain('A BAND OF KOBOLDS CLIMBS FROM THE WELL AND ATTACKS');
      for (let guard = 0; guard < 4 && second.kind === 'say'; guard++) {
        second = runner.choose(0);
      }
      expect(second.kind).toBe('combat');
      if (second.kind !== 'combat') throw new Error('expected the second KOBOLD wave');
      expect(second.monsters).toEqual([
        { monsterId: 0, count: 6, picBlockId: 0 },
        { monsterId: 1, count: 3, picBlockId: 1 },
      ]);
      expect(memory.get(0x4a23)).toBe(0);

      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4a23)).toBe(1);
    },
  );
});

// --- golden: real Pool ECL1/GEO1 block 18 (town-ward Temple route) --------
//
// BUILD-QUEUE item 6's town-enter/exit leaf for Pool of Radiance, following the exact method
// CoAB's own agent used for this leaf (`docs/engine/research/coab-town-classification.md`): find
// every reachable dungeon/wilderness engine-mode toggle write via
// `tools/map_gen1_area_mode_writes.py` (CoAB's own `SAVE …,0x4BE6` mechanism gets ZERO hits for
// Pool — Pool's engine does not use that fixed address, or does not use an ECL-visible fixed-address
// toggle for this at all), then determine from Pool's OWN data whether a discrete GEO-backed town
// exists, rather than assuming either way.
//
// **Finding, unlike CoAB: Pool's very first area (`ECL1.DAX#18`/`GEO1.DAX#18`) — the SAME block
// this project's already-proven early-anchor route already boots into (`pool` GameData profile,
// `eclInitBlock: 18`, `eclEntryOffset: 0x73`) — IS itself a real, discrete, GEO-backed town ward**
// (New Phlan's Slums, per the retail setting), not a wilderness/dungeon map. `GEO1.DAX#18`'s masked
// descriptor `4` names a UNIQUE cell, `(1,15)`, distinct from the early-anchor route's own selector-6
// cell `(14,8)`. `ECL1.DAX#18`'s `search_location` (`AND 0xc04f,#0x7f -> 0x6e79` at vaddr `0x9a57`,
// `ON_GOTO 0x6e79,#12,[...]` at vaddr `0x9a60`) dispatches selector 4 to vaddr `0xadab`: a
// `COMPARE 0x4a1a,#4` first-visit gate (default `0`, so a fresh party takes the `IF_NE` branch
// straight to the healing offer, skipping an extra "you feel safe here" line reserved for repeat
// visits), then `PICTURE #25`, `PRINTCLEAR "A YOUNG WOMAN COMES FORWARD 'WE PROVIDE HELP FOR THOSE
// WHO CAN REACH US. ARE YOU IN NEED OF HEALING?"`, and a real `HORIZONTAL_MENU` — exactly the "in-town
// action that sets host state" this leaf's method calls for (a temple interaction), landing on
// genuine retail content, not a synthetic seam.
//
// The `YES` arm (`0xae55`) runs `CLEARMONSTERS`/`COMBAT` against an empty roster (never otherwise
// exercised by this route and not meaningful without a scripted monster setup); the `NO` arm
// (`0xae5d`) is the clean, real "declined healing" path: `PRINTCLEAR "'YOU CAN REST HERE AS LONG AS
// YOU WISH.' SHE THEN LEAVES."`, `PICTURE #255` (clear), `SAVE #255,0x6de1`, then the actual
// persistent state change — `SAVE #4,0x4a1a` — and a clean in-block `EXIT`. This test takes the `NO`
// arm. See `docs/engine/research/persistent-natural-routes.md`'s "Pool's Fourth Route" section.
describe('primeSearchLocation — golden Pool ECL1 block 18 (town-ward Temple route)', () => {
  it.skipIf(!existsSync(poolEcl1) || !existsSync(poolGeo1))(
    'reaches the unique selector-4 hidden Temple of Ilmater and sets its discovery flag after declining healing',
    async () => {
      const blk18 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl1)))
        .find((b) => b.blockId === 18)!;
      const geo18 = readDaxDataBlocks(new Uint8Array(await readFile(poolGeo1)))
        .find((b) => b.blockId === 18)!;
      const map18 = decodeGeoBlock(geo18.raw, 'Pool GEO1#18');
      const matching = map18.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 4);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[1, 15, 0x84]]);

      const memory = new Map<number, number>([[0x4a1a, 0]]);
      const runner = dialogueForCell(blk18.raw, matching[0].cell.floor ?? 0, {
        dialect: ECL_POOL,
        memory,
        seed: 0x1234,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;

      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the Temple healing offer');
      expect(opening.text).toContain('ARE YOU IN NEED OF HEALING');
      expect(opening.choices).toEqual(['YES', 'NO']);

      // Decline healing (index 1, "NO") — the clean real path; "YES" chains into an
      // empty-roster COMBAT this leaf does not otherwise exercise.
      const turn = runner.choose(1);
      expect(turn.kind).toBe('end');
      if (turn.kind === 'say') expect(turn.text).toContain('YOU CAN REST HERE');
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4a1a)).toBe(4);
    },
  );
});

// --- golden: real Pool vm_run_1 area crossing (ECL1#18 -> ECL4#2) ---------
//
// BUILD-QUEUE item 6's wilderness/overland-transition leaf for Pool of Radiance. Pool's crossing
// mechanism is architecturally DIFFERENT from ADR-0009's CoAB-specific one: CoAB writes a
// `game_area` register via `SAVE …,0x7F12`, which the VM surfaces as a `setGameArea` effect that
// `runEclChain`'s `areaSource` callback consumes to rebind the active `BlockSource`. Pool's own
// NEWECL crossings never write to that address (`tools/map_gen1_area_mode_writes.py`, re-run for
// this leaf: zero hits) — the real mechanism is `vm_run_1` itself (the "you have arrived, check for
// a pending travel selection" hook every Gen1 area runs BEFORE `search_location`; confirmed against
// CoAB's own decompiled retail source, `coab_extracted/engine/ovr003.cs sub_29677`, which calls
// `initial_entry` -> `vm_run_1` -> `search_location` in that order on every area load).
//
// `ECL1.DAX#18`'s own `vm_run_1` (vaddr `0x99b9`, file offset `0xbb` — NOT the block's
// `eclEntryOffset: 0x73` `initial_entry`, which is the every-day per-step boot the `pool` GameData
// profile already uses): `COMPARE 0x6dd5,#0; IF_EQ; GOTO 0x9a1a` gates a native "pending travel
// selection" flag (default `0` takes the gate and never reaches the dispatch below — that fallback
// arm is the block's ordinary self-contained `search_location` prep, not a crossing); nonzero falls
// through to `ON_GOTO 0xc04d,#4,[0x99e6,0x99f0,0x99fa,0x9a04]` — a 4-way destination-selector
// dispatch, each arm doing `SAVE <val>,0x6e12; NEWECL <target>`. Arm index 2 (`0x99fa`) is
// `SAVE #4,0x6e12; NEWECL #2`. Pool's block-id space is globally unique across all 8 ECL archives
// (re-verified directly here: block id 2 exists ONLY in `ECL4.DAX`), so `NEWECL #2`'s operand alone
// resolves the cross-archive target — no per-block "game_area" register needed, unlike CoAB.
// `ECL4.DAX#2`'s own `initial_entry` sits at the STANDARD file offset (`0x16`, confirmed by
// `vaddr_to_offset`), and runs an unconditional `LOAD_FILES(2,2,255); LOAD_PIECES(1,3,20)` before
// any compare — real, walkable `GEO4.DAX#2` content, not a stub, reached with no `entry` override of
// its own (only the FIRST block, `ECL1.DAX#18`, needs the `vm_run_1`-offset override, since it is
// the one the host itself boots synthetically; program.ts's `RunChainOptions.entry` — added for this
// leaf — applies it to that first block ONLY, matching how the real engine only takes an explicit
// entry point for the block the host itself loads and runs `initial_entry -> vm_run_1 ->
// search_location` on every subsequent one it chains into on its own).
//
// **Scope note (browser wiring):** this proves the crossing at the engine level, byte-for-byte
// against the real disassembly. The web host's cross-archive rendering switch
// (`GameData.archiveSet`/`startCrossArchiveExplore` in `apps/web/src/ui/explore.ts`) is currently
// keyed to the `setGameArea` VM effect (ADR-0009's own mechanism) — it does not yet have a "chain
// landed outside the current archive's block range" trigger for a crossing like this one that never
// emits that effect. Extending it is a real, moderate-scope follow-up (documented in
// `docs/engine/research/persistent-natural-routes.md`'s "Pool's Fifth Route" section and the
// BUILD-QUEUE matrix), deliberately deferred rather than forced — the destination area (`ECL4.DAX#2`
// / `GEO4.DAX#2`) is instead proven reachable and walkable in-browser directly, as its own
// single-archive GameData profile, the same staged-scope precedent CoAB's own original cross-archive
// leaf used before ADR-0009 was built.
const poolEcl4 = resolve(poolRoot, 'ECL4.DAX');
const poolGeo4 = resolve(poolRoot, 'GEO4.DAX');

describe('runEclChain — golden Pool vm_run_1 area crossing (ECL1#18 -> ECL4#2, no ADR-0009 game_area register)', () => {
  it.skipIf(!existsSync(poolEcl1) || !existsSync(poolEcl4) || !existsSync(poolGeo4))(
    'follows a real vm_run_1 ON_GOTO(0xc04d) + NEWECL(2) area crossing, carrying memory across archives with no SAVE(...,0x7F12)/setGameArea effect',
    async () => {
      const blocks1 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl1)));
      const blocks4 = readDaxDataBlocks(new Uint8Array(await readFile(poolEcl4)));
      // Globally-unique block ids across Pool's whole archive set mean a flat merged BlockSource
      // resolves the crossing with no per-archive "game_area" register — unlike ADR-0009.
      const merged = blockSourceFrom([...blocks1, ...blocks4]);

      const memory = new Map<number, number>([
        [0x6dd5, 1], // "a travel selection is pending" — stands in for the retail overland/travel
        // menu the way the ADR-0009 golden seeds CoAB's own hub-destination selector.
        [0xc04d, 2], // destination selector -> arm 2 -> NEWECL #2 (ECL4.DAX#2)
        [0x4a1a, 4], // the town leg's OWN Temple-discovery flag (golden above) — seeded here to
        // prove it is an untouched cell that survives the crossing, tying both legs together.
      ]);

      const result = runEclChain(18, merged, {
        memory,
        seed: 1,
        dialect: ECL_POOL,
        entry: 0xbb, // vm_run_1's real file offset; the block's own `initial_entry`
        // (`eclEntryOffset: 0x73`, the `pool` profile's every-day boot) never reaches this dispatch.
        maxBlocks: 4,
      });

      expect(result.status).toBe('exited');
      // The real archive crossing happened: TWO different archives' blocks were chained through,
      // resolved purely by NEWECL's own operand against the merged source.
      expect(result.visited).toEqual([18, 2]);
      expect(result.effects.some((e) => e.type === 'setGameArea')).toBe(false);
      // ECL4.DAX#2's real `initial_entry` ran unconditionally — real, walkable GEO4 content.
      const loadFiles = result.effects.find((e) => e.type === 'loadFiles');
      expect(loadFiles).toMatchObject({ type: 'loadFiles', geoBlockId: 2, operands: [2, 2, 255] });
      const loadPieces = result.effects.find((e) => e.type === 'loadPieces');
      expect(loadPieces).toMatchObject({ type: 'loadPieces', operands: [1, 3, 20] });
      // The persistence proof: the town leg's own discovery flag survives the crossing via the
      // shared `memory` Map, untouched by either block's own script on this path.
      expect(result.memory.get(0x4a1a)).toBe(4);
    },
  );
});

// --- golden: real Secret ECL1 block 16 archway -> block 33 (town-exit route) ---------------------
//
// BUILD-QUEUE item 6's town-enter/exit leaf for Secret, following the exact method CoAB's and
// Pool's own agents used for this leaf: find every reachable dungeon/wilderness engine-mode toggle
// write via `tools/map_gen1_area_mode_writes.py` (ZERO hits anywhere in Secret's ECL corpus — unlike
// CoAB's 39 hits, Secret's engine does not use a fixed-address `Area1.inDungeon`-style toggle at
// all), then determine from Secret's OWN data whether a discrete GEO-backed town exists.
//
// **Finding, unlike CoAB: Secret DOES have a real, named, GEO-backed town.** `ECL1.DAX#16`/
// `GEO1.DAX#16` — the SAME block the already-shipped `secret-natural-2` middle-area route uses — is
// "New Verdigris" (Mayor Priam's opening greeting, named shop/service buildings, a
// "YOU ARE LEAVING THE TOWN" `vm_run_1` prompt gated on `[0x7ED5]==1`). The middle route's own entry
// (17-step walk from `chooseStart (5,3,north)` to `(14,11)`) and in-town action (the MARCUS/BC LORD
// checkpoint chain, `[0x4c2e]` consumed) already prove "normal-controls entry" and "an in-town action
// that sets host state" — see "Secret's Second Route" above; this route continues from there to
// prove the third leg, "exit back to dungeon."
//
// **Correction to Secret's Second Route's own write-up.** That section characterizes the two
// selector-18 cells crossed en route to Marcus (`(8,3)`/`(10,3)`) as "harmless one-shot flavour-text
// branches." Re-verified here against the real engine (not re-derived from the ECL bytecode alone,
// the same rigor gap this project's own "UNLOCATED beats invention" convention warns about): with
// the SAME memory state that route's own checkpoint uses (`[0x4c4d]=1`), selector 18 is a REAL,
// interactive two-choice prompt — "THE ROOM CONTAINS A SIMPLE ARCHWAY THAT BURSTS INTO SHIMMERING
// ENERGY. DO YOU STEP THROUGH?" / `['YES','NO']` — not degenerate flavour text. `NO` (index 1) stays
// on the Second Route's own walk with no side effect (consistent with why that route's own e2e case,
// which drives `window.__explore.move()` directly rather than simulating keyboard-gated dialogue,
// still reaches `(14,11)`: it silently plows through the prompt without answering it, a pre-existing
// gap in that route's e2e coverage, not a new one introduced here). `YES` (index 0) is real content:
// `NEWECL 33` — a same-archive (no `SAVE …,0x7F12`/`setGameArea`) chain, exactly the shape Pool's own
// `ECL1#18 -> ECL4#2` town-exit leg uses (`runEclChain — golden Pool vm_run_1 area crossing` above).
//
// **Reachability of the exit cell.** `tools/find_geo_path.py --geo GEO1.DAX --block 16 --start
// 14,11 --facing east --target 10,3` finds a clean 12-step directed-edge return path from the
// Marcus checkpoint back toward spawn (2 west, 8 north, 2 west), crossing selector 14 at `(13,11)`
// first — independently re-verified below as the SAME harmless "A SIGN OVER THIS DOOR READS ' .'"
// one-shot text the Second Route's write-up already correctly identified for that OTHER descriptor —
// before reaching `(10,3)`, one of the two selector-18 archway cells. `(10,3)`'s own floor byte
// (`0x12`) is asserted directly below rather than via a "unique cell" filter: selector 18 recurs at
// nine GEO1#16 cells total (unlike every other checkpoint cell in this file's goldens), so this test
// pins the SPECIFIC reachable one, not "the only one."
//
// **The chain.** `ECL1.DAX#33`'s own `initial_entry` (unconditional on a fresh `NEWECL`, guarded only
// by a `[0x4c9e...]`-style repeat-visit branch this fresh-memory run takes the "first visit" arm of)
// prints `"YOU'VE ENTERED THE DOMAIN OF THE WELL OF KNOWLEDGE."` / `"YOU HEAR THE CLASH OF ARMS."` —
// a genuinely different, dungeon-flavoured GEO-backed area (`GEO1.DAX#33` exists and has its own
// `search_location`/`vm_run_1` handlers, confirmed real walkable content, not a text-only dead end) —
// then pauses on one shared "press on" continue before exiting cleanly. Both of the town leg's own
// memory cells (`[0x4c4d]`, `[0x4c2e]`) survive the chain untouched, the same cross-block persistence
// proof CoAB's and Pool's own area-crossing goldens use.
//
// **Scope note (browser wiring), matching Pool's own `ECL1#18 -> ECL4#2` leaf exactly.** This proves
// the crossing at the engine level, byte-for-byte against the real disassembly. The web host's
// per-cell dialogue path (`apps/web/src/ui/explore.ts`'s `runStepEvent`) currently DISCARDS a
// `dialogueForCell` `'chain'` result rather than re-mounting into the new block's own GEO/walls —
// `startCrossArchiveExplore`/`mountCrossedDungeon` (the existing live re-mount machinery) is wired
// only to `GameData.archiveSet`, driven from a profile's OWN `eclInitBlock` via a dialogue-only
// crossing sequence with no GEO walking at all, not to a `'chain'` reached mid-walk from an ordinary
// per-cell prompt. Building that is real, moderate-scope, new engine/UI work — deliberately deferred
// rather than forced, per this project's own precedent (see Pool's matching scope note above and
// `docs/engine/research/coab-town-classification.md`). Entry + the in-town action ARE already live
// today via the already-shipped `?explore=secret-natural-2` route; only the archway exit itself is
// engine-proven-but-not-live. See `docs/engine/research/persistent-natural-routes.md`'s "Secret's
// Fourth Route" section.
describe('runEclChain — golden Secret ECL1 block 16 archway -> block 33 (town-exit route, no ADR-0009 game_area register)', () => {
  it.skipIf(!existsSync(secretEcl1) || !existsSync(secretGeo1))(
    'follows the real interactive archway prompt at (10,3) into a same-archive NEWECL(33) landing in a genuinely different GEO-backed area, carrying the town leg\'s own memory across the chain',
    async () => {
      const ecl1Blocks = readDaxDataBlocks(new Uint8Array(await readFile(secretEcl1)));
      const blk16 = ecl1Blocks.find((b) => b.blockId === 16)!;
      const geo16 = readDaxDataBlocks(new Uint8Array(await readFile(secretGeo1))).find((b) => b.blockId === 16)!;
      const map16 = decodeGeoBlock(geo16.raw, 'Secret GEO1#16');
      const cellAt = (x: number, y: number) => map16.map.cells[y * 16 + x];
      const src1 = blockSourceFrom(ecl1Blocks);

      // Post-Marcus-victory memory: [0x4c4d] unchanged (1), [0x4c2e] set by the in-town action (1) —
      // exactly the Second Route golden's own final state, continued from here.
      const memory = new Map<number, number>([[0x4c4d, 1], [0x4c2e, 1]]);

      // The intermediate checkpoint on the real 12-step return path: selector 14, confirmed harmless
      // (matches the Second Route's own characterization for THIS descriptor).
      const signCell = cellAt(13, 11);
      expect((signCell.floor ?? 0) & EVENT_INDEX_MASK).toBe(14);
      const signRunner = dialogueForCell(blk16.raw, signCell.floor ?? 0, { memory, facing: 'west', seed: 0x1234 });
      expect(signRunner).not.toBeNull();
      const signTurn = signRunner!.start();
      expect(signTurn.kind).toBe('end');
      if (signTurn.kind === 'say') throw new Error('unreachable');
      expect(signTurn.text).toContain('A SIGN OVER THIS DOOR');

      // The archway cell itself: a real interactive YES/NO prompt, not flavour text.
      const archCell = cellAt(10, 3);
      expect(archCell.floor).toBe(0x12);
      const archRunner = dialogueForCell(blk16.raw, archCell.floor ?? 0, { memory, facing: 'west', seed: 0x1234 });
      expect(archRunner).not.toBeNull();
      if (!archRunner) return;
      const archFirst = archRunner.start();
      expect(archFirst.kind).toBe('say');
      if (archFirst.kind !== 'say') throw new Error('expected the archway prompt');
      expect(archFirst.choices).toEqual(['YES', 'NO']);
      expect(archFirst.text).toContain('SIMPLE ARCHWAY');

      const chained = archRunner.choose(0); // YES
      expect(chained.kind).toBe('chain');
      if (chained.kind !== 'chain') throw new Error('expected a same-archive NEWECL chain');
      expect(chained.blockId).toBe(33);

      // Continue the chain into block 33's own initial_entry with the carried memory — the real
      // "exit back to dungeon" landing, proven the same way Pool's ECL1#18 -> ECL4#2 leg is.
      let result = runEclChain(chained.blockId, src1, { memory, seed: 0x1234, autoCombat: true, maxBlocks: 5 });
      let guard = 0;
      while (result.resume && guard < 5) { guard++; result = result.resume(0); }

      expect(result.status).toBe('exited');
      expect(result.visited).toEqual([33]);
      expect(result.effects.some((e) => e.type === 'setGameArea')).toBe(false);
      const prints = result.effects.filter((e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print');
      expect(prints.some((e) => e.text?.includes('WELL OF KNOWLEDGE'))).toBe(true);
      expect(prints.some((e) => e.text?.includes('CLASH OF ARMS'))).toBe(true);
      // The persistence proof: the town leg's own memory survives the chain, untouched by block 33's
      // own script on this path.
      expect(result.memory.get(0x4c4d)).toBe(1);
      expect(result.memory.get(0x4c2e)).toBe(1);
    },
  );
});

// --- golden: real CoK ECL3/GEO3 block 82 (ending/late-area route) --------------
//
// BUILD-QUEUE item 6's CoK ending/late-area leaf, extending the already-proven First
// (`ECL1.DAX#34` selector 28, `docs/engine/research/cok-natural-route.md`) and Second/Middle
// (`ECL2.DAX#49` selector 28, above) routes into CoK's own late-game archive. Block numbering
// alone confirms `ECL3.DAX` (blocks 80-99) is the later area file relative to `ECL1.DAX`
// (16-36) and `ECL2.DAX` (48-68); `build/gen1-ecl-encounters.json`'s champions-of-krynn entry
// lists block 82 as the richest ECL3 block (14 rostered CFG candidates).
//
// **Reachability, cross-archive.** `ECL1.DAX#18` (a clean 144-byte hub block, unrelated to the
// First/Second routes' own blocks) has a real `SAVE 5,0x7F12 ; NEWECL 80` transition (traced by
// hand from block 18's decoded bytecode, then confirmed live: `runEclChain(18, ...)` with
// `mem[0x4cb1]=1` seeded emits `{type:'setGameArea',gameArea:5}` then chains straight into
// `ECL3.DAX#80`'s own `LOAD_FILES(80,2,255)` — `geoBlockId 80` matching `GEO3.DAX#80`,
// confirming the crossing lands in the correct real area, not a coincidental halt). This is
// corroborated by `ECL1.DAX#16`'s own 12-destination travel menu, whose index-9 entry encodes
// the identical `dest_area=5,dest_block=80` pair. `ECL3.DAX#82` itself boots cleanly from its
// own default `initial_entry` (file offset 22, this engine's default VM entry) with no special
// entry-offset override or memory seeding required — unlike Pool's own ECL8#29 ending leaf.
//
// **The encounter is a forced two-stage gauntlet, not a single fight.** `GEO3.DAX#82`'s
// selector-15 cells (the JSON's own richest literal candidate — EVIL CHAMPION x5, ENCHANTER x2,
// EVIL PRIEST x2, and **SKYLA x1**, a genuine named/unique monster record) sit at `(6,1)`,
// `(5,3)`, and `(10,3)`; the nearest, `(5,3)`, is a real 22-step walk from `chooseStart`
// `(1,1,north)` (`tools/find_geo_path.py --geo GEO3.DAX --block 82 --start 1,1 --target 5,3
// --facing west`). **Every one of those three cells is unreachable without first crossing a
// selector-25 cell** (GHAST x2, ZOMBIE x4, SKELETAL KNIGHT x4, GHOUL x3 — the same "undead
// legion" idiom CoK's own retail flavour text leans on elsewhere): `find_geo_path.py
// --avoid-event-index 25` fails for all three selector-15 targets, confirmed by hand-tracing
// `GEO3.DAX#82`'s own directed-edge topology, not merely by CLI behaviour. This mirrors the
// "chained combat, consumed bit set only after both fights" shape CoAB's Fourth, Secret's
// Third, and Pool's Third routes established — except here the two stages are two separate
// forced GEO cells (not one intra-script chain), so this golden drives them as two independent
// `dialogueForCell` calls sharing one `memory` Map, the same way a real walk crossing both cells
// in sequence would.
//
// **Stage 1 (checkpoint, selector 25, `(2,2)`)** starts directly in combat — no flavour/menu
// beat precedes it, unlike every other CoK route in this file. Its consumed bit
// (`OR [0x4CC3],#8 -> [0x4CC3]`) is written EAGERLY, matching the Middle route's own precedent;
// the golden confirms it reads `8` even before `afterCombat` resolves.
//
// **Stage 2 (the promoted ending encounter, selector 15, `(5,3)`)** opens with THREE sequential
// one-choice flavour beats ("A FAMILIAR FACE LOOMS UP BEFORE YOU...", then by name "SKYLA GRINS
// WITH EVIL DELIGHT...", then a SIR LEBAUM undead-army taunt — the same SIR LEBAUM named in the
// rejected selector-30 candidate below) before SKYLA's own combat line ("SKYLA AND HIS EVIL
// FORCES ATTACK!") — no ATTACK/WAIT/LEAVE menu. Its own
// consumed bit (`[0x4CC2]`, a DIFFERENT word from stage 1's `[0x4CC3]`) is unset beforehand and
// written to `0x10` immediately after victory, before a final "JOURNAL ENTRY 61" flavour beat
// that ends the runner cleanly. Selector 17, an unrelated harmless flavour cell crossed en route,
// sets a DIFFERENT bit (`0x40`) of this SAME `[0x4CC2]` word — the "same-word-different-bit"
// pattern already documented for the First route's selectors 27/28 and CoAB's own natural route.
//
// **Investigated and rejected: selector 30 (SIR LEBAUM x1, MINOTAUR x3, GHAST x4).** Its cell
// sits at `(0,13)`/`(0,14)`, inside a 14-cell component of `GEO3.DAX#82`'s FOUR disconnected
// components (sizes 156/80/14/6) — the same "two-wall-set dungeon" shape the First route's own
// rejected selector-5 candidate had. `chooseStart` lands in the 156-cell component; no directed
// edge reaches the 14-cell one. This gate blocks the whole "SIR LEBAUM -> BLUE DRAGON (selector
// 22, gated on `[0x4CC5]==255`) -> draconian squad" storyline at its entry point, not just the
// SIR LEBAUM fight itself.
//
// **Investigated and NOT pursued: `ECL3.DAX#98` selector 5 (MYRTANI x1, SIVAK x3, BOZAK x4,
// BAAZ x5), which a hand-trace shows chaining into a RED DRAGON encounter setup afterward** —
// compelling "true final boss" content (MYRTANI is CoK's own antagonist, already named in the
// Middle route's own flavour text). `GEO3.DAX` contains blocks `[80, 81, 82, 96, 97, 99]` only —
// **no block 98** — so this candidate's GEO-cell reachability cannot be established with the
// same rigor every other route in this project uses. Left honestly unproven rather than forced;
// see `docs/engine/research/persistent-natural-routes.md`'s "CoK's Third Route (Ending)".
const ecl3 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ECL3.DAX');
const geo3 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'GEO3.DAX');

describe('runEclChain — golden CoK ECL1 block 18 hub crossing into ECL3 block 80 (ending-area entry)', () => {
  it.skipIf(!existsSync(ecl1) || !existsSync(ecl3))(
    'follows a real SAVE(5,0x7F12)+NEWECL out of ECL1#18 into the ECL3#80 late-area entry, loading the matching GEO block',
    async () => {
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));
      const src3 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl3))));
      const areaSource = (gameArea: number): BlockSource | undefined => {
        if (gameArea === 1) return src1;
        if (gameArea === 5) return src3;
        return undefined;
      };
      const memory = new Map<number, number>([[0x4cb1, 1]]);
      let result = runEclChain(18, src1, {
        memory,
        seed: 1,
        autoCombat: true,
        areaSource,
        startGameArea: 1,
        maxBlocks: 10,
      });
      let guard = 0;
      while (result.resume && guard < 10) {
        guard++;
        result = result.resume(0);
      }

      expect(result.status).toBe('exited');
      expect(result.visited).toEqual([18, 80]);
      expect(result.effects.filter((e) => e.type === 'setGameArea')).toEqual([
        { type: 'setGameArea', gameArea: 5 },
      ]);
      expect(result.effects.some((e) => e.type === 'loadFiles' && e.geoBlockId === 80)).toBe(true);
    },
  );
});

// --- golden: real CoK ECL1#16 search_location wilderness/overland crossing into ECL2#68 --------
//
// BUILD-QUEUE item 6's wilderness/overland-transition leaf for CoK. `tools/map_gen1_area_mode_writes.py`
// confirms every `SAVE …,0x4BE6` (`inDungeon`) write in CoK's whole corpus is confined to
// `ECL1.DAX` blocks 16/17/18 — the same dispatch-only hub trio the First/Third/Fourth Routes
// already use — and every one of them sets `inDungeon=1` before its `NEWECL`, never `0`. Per this
// project's own operational definition of this leaf (established by CoAB's and Pool's own
// "wilderness" legs, which ALSO set `inDungeon=1` before every destination — see Pool's Fifth
// Route above), the defining shape is a menu-driven, coordinate-matched destination picker
// crossing into a genuinely different real archive, not the literal `WildernessMap` flag state.
//
// `ECL1.DAX#16`'s `search_location` entry (header offset `0x2c0`/704, vaddr `0x82be` — distinct
// from the block's `initial_entry` the First/Fourth Routes already use) is exactly this picker: a
// manual linear search over a 12-arm table (`GETTABLE` bases `0x8e72`/`0x8e7e`, read straight off
// the block's own raw bytes) matching `[0x4bc3]`/`[0x4bc4]` (a world-map coordinate pair) against
// each arm's `(x,y)` entry, landing on the arm whose coordinates match. Arm 11's own table values
// are `(15,11)`; reaching it also requires `[0x4c37]==1` (a gate none of the OTHER 11 arms check —
// modelled as a "this outpost has been discovered" flag, the same seed-one-memory-cell convention
// this project's other routes already use for their own unlocated preconditions). On a match, the
// arm prints "YOU ARE NEAR ... . DO YOU ENTER?", and — unlike every other menu-confirm in this
// file — index 0 is YES (index 1 is NO; verified directly against the VM, not assumed). Choosing
// YES runs `SAVE #1,[0x4be6]` (inDungeon); `SAVE #4,[0x7f12]` (game_area, surfaced as the usual
// `setGameArea` effect); `NEWECL [0x4c25]` (`#68`).
//
// `ECL2.DAX#68`/`GEO2.DAX#68` — "THE OUTPOST", a military checkpoint never claimed by any earlier
// CoK route (First/Second/Fourth already claim ECL2 blocks 34/48/49/50/64) — is real, walkable
// content: `chooseStart (2,2,north)` sits inside a 158-of-256-cell connected component (the
// project's own connectivity BFS, matching `find_geo_path.py`'s directed-edge model), reaching
// TWO other candidate arms' own destinations first and rejecting them: arm 7's `(11,3)`-table
// match (area4/block67) and arm 8's `(16,8)`-table match (area6/block99) both land in tiny,
// disconnected 9-11-cell pockets with EVERY real descriptor unreachable from `chooseStart` — the
// same class of rejection CoK's own Fourth Route already applied to Sanction's dock pocket. Arm
// 11's block68 is the only one of the three previously-unclaimed general-menu arms with a genuinely
// walkable interior, so it is the promotion target. `initial_entry` opens on a scripted "THE
// OUTPOST GUARDS STOP YOU AT THE ENTRANCE ... THEY ESCORT YOU TO THE COMMANDANT" cutscene; nearby
// reachable cells are real interactive content too — `(5,8)`/`(6,6)` (masked descriptors 33/34,
// raw floor `0x21`/`0x22`) both open "YOU HAVE COME ACROSS A CHECKPOINT. THE LEAD GUARD ASKS YOU TO
// MOVE AWAY. WHAT DO YOU DO?" and `(14,8)` (descriptor 1) opens "THE GUARDS WATCH YOU AS YOU PASS."
//
// See docs/engine/research/persistent-natural-routes.md's "CoK's Fifth Route (Wilderness/Overland
// Crossing)".
describe('runEclChain — golden CoK ECL1 block 16 search_location wilderness crossing into ECL2 block 68 (THE OUTPOST)', () => {
  it.skipIf(!existsSync(ecl1) || !existsSync(ecl2))(
    'follows the real coordinate-matched arm-11 picker + SAVE(1,0x4be6)+SAVE(4,0x7f12)+NEWECL(68) out of ECL1#16 into ECL2#68',
    async () => {
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));
      const src2 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl2))));
      const areaSource = (gameArea: number): BlockSource | undefined => {
        if (gameArea === 1) return src1;
        if (gameArea === 4) return src2;
        return undefined;
      };
      // [0x4bc3]/[0x4bc4]: the world-map coordinate pair arm 11's own table entry matches
      // ((15,11), decoded straight off the block's raw bytes at GETTABLE bases 0x8e72/0x8e7e).
      // [0x4c37]: arm 11's own extra gate (every other arm skips this check).
      const memory = new Map<number, number>([
        [0x4bc3, 15],
        [0x4bc4, 11],
        [0x4c37, 1],
      ]);
      let result = runEclChain(16, src1, {
        memory,
        seed: 1,
        autoCombat: true,
        areaSource,
        startGameArea: 1,
        maxBlocks: 10,
        entry: 0x82be - 0x7ffe, // search_location, not initial_entry
      });
      let guard = 0;
      while (result.resume && guard < 10) {
        guard++;
        result = result.resume(0); // "YOU ARE NEAR ... DO YOU ENTER?" — index 0 is YES here
      }

      expect(result.status).toBe('exited');
      expect(result.visited).toEqual([16, 68]);
      expect(result.effects.filter((e) => e.type === 'setGameArea')).toEqual([
        { type: 'setGameArea', gameArea: 4 },
      ]);
      expect(memory.get(0x4be6)).toBe(1); // inDungeon set before the crossing, like every other CoK hub arm
      expect(memory.get(0x4c24)).toBe(4); // dest_area staging cell
      expect(memory.get(0x4c25)).toBe(68); // dest_block staging cell
      expect(result.effects.some((e) => e.type === 'loadFiles' && e.geoBlockId === 68)).toBe(true);
    },
  );
});

// --- golden: real CoK "quest" leg -- cross-block persistent landmark-discovery flag ------------
//
// BUILD-QUEUE item 6's campaign-promotion matrix "quest" leaf for CoK: a story-relevant flag SET
// in one block that is READ (and gates available content) in a genuinely DIFFERENT block. Found
// via `tools/map_gen1_cross_area_flag_reads.py --profile champions-of-krynn` scanning CoK's own
// proven-route flags for cross-block static reachability, then manually byte-verified (this
// project's "UNLOCATED beats invention" convention). Of the seven flags checked (all five proven
// routes' own consumed bits, plus the two intermediate flavour-cell writes noted along the way in
// the First Route's own write-up), only `[0x4c37]` -- the Fifth Route's own "outpost discovered"
// precondition, previously seeded directly with its setter UNLOCATED -- turned up a genuine hit.
//
// **The link.** `ECL1.DAX` block 17's own `initial_entry` contains a "landmark discovery" loop:
// past an unrelated counter-driven preamble (an apparent "steps travelled in this region" gate,
// out of scope for this leaf and bypassed here by entering directly at the loop's own vaddr
// `0x80b5`, the same "isolate the mechanism under test" convention Pool's ECL8#29 and this file's
// own CoK Fifth Route already use), the loop checks successive bits of `[0x4c29]` (a
// "which landmarks has the party found" bitmask) in a fixed order -- masks `1`, `2`, `16`, `4`,
// ... -- revealing the FIRST unset one: two real "PRESS BUTTON OR RETURN TO CONTINUE." prompts, a
// narration beat, `ADD <mask>,[0x4c29]`, and a mask-specific per-landmark flag write. Mask `16`'s
// own write is `SAVE #1,[0x4c37]` -- literally the Fifth Route's own "outpost discovered" flag. So
// a completely different block, running the wilderness map's own landmark-reveal narration (not
// the destination picker at all), is what a real playthrough would use to set the precondition the
// Fifth Route's golden above has always had to seed directly.
//
// **The gate, byte-verified in the reader.** `ECL1.DAX` block 16's own `search_location` -- the
// SAME 12-arm coordinate picker the Fifth Route golden above already drives -- arm 11's handler
// (vaddr `0x8522`) opens with `COMPARE [0x4c37],#1 ; IF_NE ; GOTO 0x842a`: unset/non-1 skips the
// outpost entirely and falls into a SHARED fallback at vaddr `0x842a` that stages `dest_area=1,
// dest_block=17` -- routing the party right back into the SETTER's own block, a closed loop with
// its own narrative logic ("you found nothing new here yet"). Only `[0x4c37]==1` (plus a second,
// unrelated gate `[0x4c3a]!=1` this leaf does not otherwise exercise) lets arm 11 proceed to stage
// `dest_area=4, dest_block=68` -- THE OUTPOST, exactly the crossing the Fifth Route golden proves.
//
// See docs/engine/research/persistent-natural-routes.md's "CoK's Sixth Route (Quest)".
describe('runEclChain — golden CoK ECL1 block 17 landmark-discovery loop (quest-flag setter, [0x4c37])', () => {
  it.skipIf(!existsSync(ecl1))(
    'reveals the outpost landmark (mask 0x10) once masks 0x1/0x2 are already found, writing [0x4c37]=1',
    async () => {
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));

      // [0x4c29]: the "landmarks found" bitmask, seeded with masks 0x1/0x2 already revealed (a
      // real prior-visit state) so the loop's own fixed check order (1, 2, 16, 4, ...) reaches the
      // mask-16 (outpost) branch on this call rather than re-revealing an earlier landmark.
      const memory = new Map<number, number>([[0x4c29, 0x03]]);
      let result = runEclChain(17, src1, {
        memory,
        seed: 1,
        maxBlocks: 3,
        entry: 0x80b5 - 0x7ffe, // the landmark-discovery loop's own vaddr, not initial_entry's 0x8014
      });
      expect(memory.get(0x4c37)).toBeUndefined();
      let guard = 0;
      // Two real "PRESS BUTTON OR RETURN TO CONTINUE." prompts precede the write.
      while (result.status === 'awaiting-input' && memory.get(0x4c37) === undefined && guard < 4) {
        guard++;
        expect(result.resume).not.toBeNull();
        result = result.resume!(0);
      }
      expect(memory.get(0x4c37)).toBe(1);
      expect((memory.get(0x4c29) ?? 0) & 0x10).toBe(0x10);
    },
  );

  it.skipIf(!existsSync(ecl1))(
    'reaches the same Outpost setter from block 17 normal initial_entry after the seventh qualifying visit',
    async () => {
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));
      const memory = new Map<number, number>([
        [0x4c26, 1], [0x4c5c, 0xff], [0x4c28, 6],
        [0x4c29, 0x03], [0x4c37, 0], [0x4c7d, 0],
      ]);
      let result = runEclChain(17, src1, { memory, seed: 1, maxBlocks: 3 });
      expect(memory.get(0x4c28)).toBe(7);
      expect(memory.get(0x4c29)).toBe(0x13);
      expect(memory.get(0x4c37)).toBe(0);
      let prompts = 0;
      while (result.status === 'awaiting-input' && memory.get(0x4c37) !== 1 && prompts < 4) {
        prompts++;
        expect(result.resume).not.toBeNull();
        result = result.resume!(0);
      }
      expect(prompts).toBe(2);
      expect(memory.get(0x4c28)).toBe(7);
      expect(memory.get(0x4c29)).toBe(0x13);
      expect(memory.get(0x4c37)).toBe(1);

      const runControl = (entries: Array<[number, number]>) => {
        const controlMemory = new Map<number, number>([
          [0x4c26, 1], [0x4c5c, 0xff], [0x4c28, 6],
          [0x4c29, 0x03], [0x4c37, 0], [0x4c7d, 0],
          ...entries,
        ]);
        const controlResult = runEclChain(17, src1, {
          memory: controlMemory,
          seed: 1,
          maxBlocks: 3,
        });
        expect(controlResult.status).toBe('awaiting-input');
        expect(controlResult.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text).join(' '))
          .toContain('WHERE DO YOU WISH TO GO');
        return controlMemory;
      };
      const noHostGate = runControl([[0x4c5c, 0]]);
      const wrongSelector = runControl([[0x4c26, 2]]);
      const tooEarly = runControl([[0x4c28, 5]]);
      for (const control of [noHostGate, wrongSelector, tooEarly]) {
        expect(control.get(0x4c37)).toBe(0);
        expect(control.get(0x4c29)).toBe(0x03);
      }
      expect(tooEarly.get(0x4c28)).toBe(6);
    },
  );

  it.skipIf(!existsSync(ecl1) || !existsSync(ecl2))(
    'carries one Map through ECL1#16 arm 3, block 17 normal entry, and ECL1#16 arm 11 into ECL2#68',
    async () => {
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));
      const src2 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl2))));
      const areaSource = (gameArea: number): BlockSource | undefined => gameArea === 1 ? src1 : gameArea === 4 ? src2 : undefined;
      const memory = new Map<number, number>([
        [0x4c5c, 0xff], [0x4c28, 6], [0x4c29, 0x03],
        [0x4bc3, 13], [0x4bc4, 5],
      ]);
      let result = runEclChain(16, src1, {
        memory,
        seed: 1,
        areaSource,
        startGameArea: 1,
        maxBlocks: 10,
        entry: 0x82be - 0x7ffe,
      });
      expect(result.status).toBe('awaiting-input');
      expect(result.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text).join(' '))
        .toContain('YOU ARE NEAR');
      result = result.resume!(0); // arm 3 YES -> [4c26]=1 -> NEWECL 17 normal initial_entry
      expect(memory.get(0x4c26)).toBe(1);
      expect(memory.get(0x4c28)).toBe(7);
      expect(memory.get(0x4c29)).toBe(0x13);
      expect(memory.get(0x4c37) ?? 0).toBe(0);
      result = result.resume!(0); // first landmark Continue
      expect(memory.get(0x4c37) ?? 0).toBe(0);
      result = result.resume!(0); // second landmark Continue -> setter
      expect(memory.get(0x4c37)).toBe(1);

      // Re-enter the same real coordinate picker with the SAME producer-mutated Map.
      memory.set(0x4bc3, 15);
      memory.set(0x4bc4, 11);
      let outpost = runEclChain(16, src1, {
        memory,
        seed: 1,
        areaSource,
        startGameArea: 1,
        maxBlocks: 10,
        entry: 0x82be - 0x7ffe,
      });
      expect(outpost.status).toBe('awaiting-input');
      expect(outpost.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text).join(' '))
        .toContain('YOU ARE NEAR');
      outpost = outpost.resume!(0); // arm 11 YES
      let guard = 0;
      while (outpost.resume && guard++ < 10) outpost = outpost.resume(0);
      expect(outpost.visited).toEqual([16, 68]);
      expect(memory.get(0x4c24)).toBe(4);
      expect(memory.get(0x4c25)).toBe(68);
      expect(memory.get(0x4be6)).toBe(1);
      expect(memory.get(0x4c37)).toBe(1);
    },
  );
});

describe('runEclChain — golden CoK ECL1 block 16 quest gate (cross-block persistence of [0x4c37])', () => {
  it.skipIf(!existsSync(ecl1) || !existsSync(ecl2))(
    "arm 11 falls back to block 17 (dest_area=1,dest_block=17) unless [0x4c37]==1, as set by block 17's own discovery loop above",
    async () => {
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));
      const src2 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl2))));
      const areaSource = (gameArea: number): BlockSource | undefined => {
        if (gameArea === 1) return src1;
        if (gameArea === 4) return src2;
        return undefined;
      };
      const driveToRest = (result: ReturnType<typeof runEclChain>) => {
        let r = result;
        let guard = 0;
        while (r.resume && guard < 10) {
          guard++;
          r = r.resume(0);
        }
        return r;
      };

      // Negative: same coordinate match (15,11) as the Fifth Route golden, but [0x4c37] unset --
      // arm 11's own gate fails, and the shared fallback stages dest_area=1/dest_block=17 (NOT the
      // outpost), chaining back into block 17 -- the setter's own block -- instead of block 68.
      const failMemory = new Map<number, number>([[0x4bc3, 15], [0x4bc4, 11]]);
      const fail = driveToRest(
        runEclChain(16, src1, {
          memory: failMemory,
          seed: 1,
          autoCombat: true,
          areaSource,
          startGameArea: 1,
          maxBlocks: 10,
          entry: 0x82be - 0x7ffe,
        }),
      );
      expect(fail.visited).toEqual([16, 17]);
      expect(failMemory.get(0x4c24)).toBe(1);
      expect(failMemory.get(0x4c25)).toBe(17);
      expect(fail.effects.some((e) => e.type === 'loadFiles' && e.geoBlockId === 68)).toBe(false);

      // Positive: [0x4c37]=1 -- exactly what block 17's own landmark-discovery loop golden above
      // produces -- the SAME coordinate match now clears arm 11's gate and crosses into ECL2#68
      // (THE OUTPOST), the identical destination the Fifth Route golden already proves.
      const passMemory = new Map<number, number>([[0x4bc3, 15], [0x4bc4, 11], [0x4c37, 1]]);
      const pass = driveToRest(
        runEclChain(16, src1, {
          memory: passMemory,
          seed: 1,
          autoCombat: true,
          areaSource,
          startGameArea: 1,
          maxBlocks: 10,
          entry: 0x82be - 0x7ffe,
        }),
      );
      expect(pass.status).toBe('exited');
      expect(pass.visited).toEqual([16, 68]);
      expect(pass.effects.filter((e) => e.type === 'setGameArea')).toEqual([
        { type: 'setGameArea', gameArea: 4 },
      ]);
      expect(passMemory.get(0x4c24)).toBe(4);
      expect(passMemory.get(0x4c25)).toBe(68);
    },
  );
});

describe('primeSearchLocation — golden CoK ECL3 block 82 (ending/late-area route)', () => {
  it.skipIf(!existsSync(ecl3) || !existsSync(geo3))(
    'forces the undead-legion checkpoint (selector 25) before the SKYLA squad (selector 15), each with its own consumed bit',
    async () => {
      const blk82 = readDaxDataBlocks(new Uint8Array(await readFile(ecl3))).find((b) => b.blockId === 82)!;
      const geo82 = readDaxDataBlocks(new Uint8Array(await readFile(geo3))).find((b) => b.blockId === 82)!;
      const map82 = decodeGeoBlock(geo82.raw, 'CoK GEO3#82 natural (ending)');

      const checkpoint = map82.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 25);
      expect(checkpoint.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([
        [0, 2, 25],
        [1, 2, 25],
        [2, 2, 25],
        [3, 2, 25],
      ]);

      const target = map82.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 15);
      expect(target.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([
        [6, 1, 0x8f],
        [5, 3, 0x8f],
        [10, 3, 0x8f],
      ]);

      const memory = new Map<number, number>();

      // Stage 1: the forced undead-legion checkpoint — starts directly in combat, no flavour beat.
      const stage1 = dialogueForCell(blk82.raw, checkpoint[2]!.cell.floor ?? 0, { memory, seed: 0x1234 });
      expect(stage1).not.toBeNull();
      if (!stage1) return;
      const stage1Turn = stage1.start();
      expect(stage1Turn.kind).toBe('combat');
      if (stage1Turn.kind !== 'combat') throw new Error('expected the undead-legion combat');
      expect(stage1Turn.text).toMatch(/UNDEAD ATTACK/i);
      expect(stage1Turn.monsters).toEqual([
        { monsterId: 6, count: 2, picBlockId: 6 },
        { monsterId: 31, count: 4, picBlockId: 31 },
        { monsterId: 55, count: 4, picBlockId: 26 },
        { monsterId: 7, count: 3, picBlockId: 6 },
      ]);
      // Eager write — already set before the resume, matching the Middle route's own precedent.
      expect(memory.get(0x4cc3)).toBe(8);
      const stage1After = stage1.afterCombat('victory');
      expect(stage1After.kind).toBe('end');
      expect(stage1.isDone()).toBe(true);
      expect(memory.get(0x4cc3)).toBe(8);

      // Stage 2: SKYLA's own cell, reached only via the checkpoint above (real walks always cross
      // it first — see the "unavoidable" finding in the comment block above).
      const stage2 = dialogueForCell(blk82.raw, target[1]!.cell.floor ?? 0, { memory, seed: 0x1234 });
      expect(stage2).not.toBeNull();
      if (!stage2) return;
      const opening = stage2.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the opening flavour beat');
      expect(opening.text).toMatch(/FAMILIAR FACE LOOMS UP/i);
      expect(opening.choices).toEqual(['PRESS BUTTON OR RETURN TO CONTINUE.']);
      expect(memory.get(0x4cc2) ?? 0).toBe(0);

      // A second flavour beat — SKYLA gloating by name — precedes a third (SIR LEBAUM's own
      // undead-army taunt, corroborating the rejected SIR LEBAUM candidate's own storyline) before
      // the actual combat trigger.
      const secondBeat = stage2.choose(0);
      expect(secondBeat.kind).toBe('say');
      if (secondBeat.kind !== 'say') throw new Error('expected the SKYLA gloating beat');
      expect(secondBeat.text).toMatch(/SKYLA GRINS/i);
      expect(secondBeat.choices).toEqual(['PRESS BUTTON OR RETURN TO CONTINUE.']);
      expect(memory.get(0x4cc2) ?? 0).toBe(0);

      const thirdBeat = stage2.choose(0);
      expect(thirdBeat.kind).toBe('say');
      if (thirdBeat.kind !== 'say') throw new Error('expected the SIR LEBAUM taunt beat');
      expect(thirdBeat.text).toMatch(/SIR LEBAUM/i);
      expect(thirdBeat.choices).toEqual(['PRESS BUTTON OR RETURN TO CONTINUE.']);
      expect(memory.get(0x4cc2) ?? 0).toBe(0);

      const stage2Turn = stage2.choose(0);
      expect(stage2Turn.kind).toBe('combat');
      if (stage2Turn.kind !== 'combat') throw new Error('expected the SKYLA combat');
      expect(stage2Turn.text).toMatch(/SKYLA AND HIS EVIL FORCES ATTACK/i);
      expect(stage2Turn.monsters).toEqual([
        { monsterId: 37, count: 5, picBlockId: 35 },
        { monsterId: 40, count: 2, picBlockId: 38 },
        { monsterId: 43, count: 2, picBlockId: 41 },
        { monsterId: 44, count: 1, picBlockId: 44 },
      ]);
      expect(memory.get(0x4cc2) ?? 0).toBe(0);

      const stage2Resumed = stage2.afterCombat('victory');
      expect(stage2Resumed.kind).toBe('say');
      if (stage2Resumed.kind !== 'say') throw new Error('expected the post-combat journal beat');
      expect(stage2Resumed.text).toMatch(/JOURNAL ENTRY 61/i);
      // The consumed bit is written immediately after victory, before this trailing flavour beat.
      expect(memory.get(0x4cc2)).toBe(0x10);

      const stage2Final = stage2.choose(0);
      expect(stage2Final.kind).toBe('end');
      expect(stage2.isDone()).toBe(true);
      expect(memory.get(0x4cc2)).toBe(0x10);
    },
  );
});

// --- golden: real CoK ECL2/GEO2 block 50 town action + exit (TOWN route) ----------------------
//
// BUILD-QUEUE item 6's CoK town leaf. Unlike CoAB (whose real cities are procedural — see
// docs/engine/research/coab-town-classification.md), CoK ships several real GEO-backed
// settlements: Sanction (`ECL3.DAX#80`/`GEO3.DAX#80`, four named shops — Horgathindorn's
// Training Hall, Gusmarken's Magic Shop, Sanction Weaponsmith, Southern Sanction Inn) and Neraka
// (`ECL2.DAX#64`/`GEO2.DAX#64`, a Sir Karl rescue cutscene). Both were investigated and REJECTED
// as this leaf's browser-wiring target: Sanction's `chooseStart` (the browser's own
// most-open-edges heuristic in `apps/web/src/ui/explore.ts`, which every prior `*-naturalN`
// profile also relies on unmodified) lands at `(0,0)` — a 44-cell dock/water pocket structurally
// DISCONNECTED (BFS-confirmed) from the rest of `GEO3.DAX#80`'s walkable interior, including the
// Training Hall itself. That is the same class of rejection CoK's own Third Route already applied
// to selector 30 ("a disconnected 14-cell GEO component, unreachable from chooseStart") — just
// fatal here instead of merely inconvenient, since the stranded pocket has no interactive cells
// at all (every cell in it is descriptor 0). Neraka's own content is a linear one-shot cutscene,
// not a repeatable in-town action with its own persisted state.
//
// `ECL2.DAX#50` — part of the Gargath settlement complex (block 48 is "THE GATES OF GARGATH";
// block 49 is the already-promoted Second Route's "GARGATH KEEP") — is the promotion target
// instead: a real walkable civilian district with four named shop signs (`RED DAGGER INN`,
// `JARLKRAND'S ALE HOUSE`, `JELEK ARMOURY`, `WILGARTEN'S MAGIC SHOP`) and a working
// `chooseStart` spawn — `(14,4,north)`, 4 open edges, inside the map's main 211-cell walkable
// component (verified by BFS over the same directed-edge model `find_geo_path.py` uses).
//
// In-town action: the Ale House (masked descriptor 11, GEO cell `(3,12)`, raw floor byte `0x8b`)
// is a single reachable 23-step walk from `chooseStart`
// (`tools/find_geo_path.py --geo GEO2.DAX --block 50 --start 14,4 --target 3,12 --facing north
// --event-mask 0x3f`), crossing only harmless sign/flavour cells (descriptors 0, 7, 21, 22 — none
// forces combat or a blocking menu). Choosing 'YES' to a drink performs a genuine persistent
// host-state write — `ADD #1, [0x4c84], [0x4c84]` (`area1.word_308`, the tavern-tale-index
// counter) fires at vaddr `0x9371`, before the tale text even prints — and the prompt loops back
// on itself so a second visit can decline.
//
// Exit: CoK's `vm_run_1` per-step main loop (not SearchLocation) drives the real "leave the
// settlement" prompt, reached whenever the retail engine sets `area2.tried_to_exit_map`
// (`[0x7ed5]`) on an edge-of-map walk attempt — the same host-computed-condition convention this
// project already models via `dialogueForVmRun1`'s `seedMemory` (see `primeVmRun1`'s own doc
// comment), not a synthetic seam. Choosing 'YES' to 'DO YOU WISH TO LEAVE?' performs the exact
// same cross-archive exit mechanism as CoK's own Third Route hub crossing: `SAVE #1, [0x7f12]`
// (`area2.game_area`) then `NEWECL 16` — CoK's `ECL1.DAX#16` wilderness/travel hub, the identical
// dispatch-only block (no GEO backing) the First/Second/Third Routes already proved reachable.
// See docs/engine/research/persistent-natural-routes.md's "CoK's Fourth Route (Town)".

describe('primeSearchLocation — golden CoK ECL2 block 50 town action (descriptor 11, Ale House, town route)', () => {
  it.skipIf(!existsSync(ecl2) || !existsSync(geo2))(
    'writes the tavern-tale counter on a real in-town SAVE, then a declined second prompt ends cleanly',
    async () => {
      const blk50 = readDaxDataBlocks(new Uint8Array(await readFile(ecl2))).find((b) => b.blockId === 50)!;
      const geo50 = readDaxDataBlocks(new Uint8Array(await readFile(geo2))).find((b) => b.blockId === 50)!;
      const map50 = decodeGeoBlock(geo50.raw, 'CoK GEO2#50 natural (town)');

      const aleHouse = map50.map.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 11);
      expect(aleHouse.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[3, 12, 0x8b]]);

      const memory = new Map<number, number>();
      const runner = dialogueForCell(blk50.raw, aleHouse[0]!.cell.floor ?? 0, { memory, seed: 1 });
      expect(runner).not.toBeNull();
      if (!runner) return;

      const opening = runner.start();
      expect(opening.kind).toBe('say');
      if (opening.kind !== 'say') throw new Error('expected the ale house greeting');
      expect(opening.text).toMatch(/WELCOME TO MY ALE HOUSE/i);
      expect(opening.text).toMatch(/DO YOU WISH A DRINK/i);
      expect(opening.choices).toEqual(['NO', 'YES']);
      expect(memory.get(0x4c84) ?? 0).toBe(0);

      // The tale text itself pauses on its own "press button to continue" prompt (a real GOSUB
      // menu, `0x9CEB`) — the SAVE at vaddr `0x9371` executes only AFTER that prompt is answered.
      const tale = runner.choose(1); // YES
      expect(tale.kind).toBe('say');
      if (tale.kind !== 'say') throw new Error('expected the first tavern tale');
      expect(tale.text).toMatch(/YOU HEAR TAVERN TALE/i);
      expect(tale.choices).toEqual(['PRESS BUTTON OR RETURN TO CONTINUE.']);
      expect(memory.get(0x4c84) ?? 0).toBe(0);

      const secondPrompt = runner.choose(0);
      expect(secondPrompt.kind).toBe('say');
      if (secondPrompt.kind !== 'say') throw new Error('expected the repeat drink prompt');
      expect(secondPrompt.text).toMatch(/DO YOU WISH A DRINK/i);
      expect(secondPrompt.choices).toEqual(['NO', 'YES']);
      // The SAVE has now fired, before this repeat prompt is even shown.
      expect(memory.get(0x4c84)).toBe(1);

      const decline = runner.choose(0); // NO this time
      expect(decline.kind).toBe('end');
      expect(decline.text).toMatch(/THEN YOU MUST LEAVE/i);
      expect(runner.isDone()).toBe(true);
      expect(memory.get(0x4c84)).toBe(1);
    },
  );
});

describe('primeVmRun1 — golden CoK ECL2 block 50 town exit (tried_to_exit_map, town route)', () => {
  it.skipIf(!existsSync(ecl2))(
    'performs the real cross-archive "leave the settlement" exit on a map-edge walk attempt',
    async () => {
      const blk50 = readDaxDataBlocks(new Uint8Array(await readFile(ecl2))).find((b) => b.blockId === 50)!;

      // NO on 'DO YOU WISH TO LEAVE?' stays — a harmless flag write, no NEWECL.
      const stayMemory = new Map<number, number>([[0x7ed5, 1]]);
      const stayRunner = dialogueForVmRun1(blk50.raw, { memory: stayMemory, seed: 1 });
      expect(stayRunner).not.toBeNull();
      if (!stayRunner) return;
      const stayPrompt = stayRunner.start();
      expect(stayPrompt.kind).toBe('say');
      if (stayPrompt.kind !== 'say') throw new Error('expected the leave prompt');
      expect(stayPrompt.text).toMatch(/DO YOU WISH TO LEAVE/i);
      expect(stayPrompt.choices).toEqual(['NO', 'YES']);
      const stayed = stayRunner.choose(0); // NO
      expect(stayed.kind).toBe('end');
      expect(stayMemory.get(0x7f12) ?? 0).toBe(0);

      // YES performs the real exit: SAVE area2.game_area=1, then NEWECL 16 (CoK's own proven
      // ECL1.DAX#16 wilderness/travel hub — no GEO backing, dispatch-only, same as the First/
      // Second/Third Routes' own hub crossings).
      const leaveMemory = new Map<number, number>([[0x7ed5, 1]]);
      const leaveRunner = dialogueForVmRun1(blk50.raw, { memory: leaveMemory, seed: 1 });
      expect(leaveRunner).not.toBeNull();
      if (!leaveRunner) return;
      const leavePrompt = leaveRunner.start();
      expect(leavePrompt.kind).toBe('say');
      if (leavePrompt.kind !== 'say') throw new Error('expected the leave prompt');
      expect(leavePrompt.choices).toEqual(['NO', 'YES']);
      const left = leaveRunner.choose(1); // YES
      expect(left.kind).toBe('chain');
      if (left.kind !== 'chain') throw new Error('expected the NEWECL 16 chain');
      expect(left.blockId).toBe(16);
      expect(leaveMemory.get(0x7f12)).toBe(1);
    },
  );
});

describe('runEclChain — golden CoK ECL2 block 50 town exit round trip (into ECL1 block 16)', () => {
  it.skipIf(!existsSync(ecl1) || !existsSync(ecl2))(
    'follows the real SAVE(1,0x7F12)+NEWECL out of the town exit into CoK’s own wilderness/travel hub',
    async () => {
      const src1 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));
      const src2 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl2))));
      const areaSource = (gameArea: number): BlockSource | undefined => {
        if (gameArea === 1) return src1;
        if (gameArea === 2) return src2;
        return undefined;
      };
      // `entry` starts the FIRST block's VM at its `vm_run_1` handler (vaddr 0x854D, i.e.
      // `0x854D - ECL_VBASE`) instead of `initial_entry` — the exact same "override the first
      // block's entry offset" mechanism `primeVmRun1`/`primeHandler` use, applied through
      // `runEclChain` so this test proves the FULL cross-archive round trip (not just the single
      // VM the two `dialogueForVmRun1` cases above already cover in isolation).
      const memory = new Map<number, number>([[0x7ed5, 1]]);
      let result = runEclChain(50, src2, {
        memory,
        seed: 1,
        autoCombat: true,
        areaSource,
        startGameArea: 2,
        maxBlocks: 10,
        entry: 0x854d - 0x7ffe,
      });
      // The 'DO YOU WISH TO LEAVE?' menu pauses the chain; answer YES (index 1).
      expect(result.status).toBe('awaiting-input');
      expect(result.resume).not.toBeNull();
      if (!result.resume) return;
      result = result.resume(1);
      let guard = 0;
      while (result.resume && guard < 10) {
        guard++;
        result = result.resume(0);
      }

      expect(result.status).toBe('exited');
      expect(result.visited).toEqual([50, 16]);
      expect(result.effects.filter((e) => e.type === 'setGameArea')).toEqual([
        { type: 'setGameArea', gameArea: 1 },
      ]);
      expect(memory.get(0x7f12)).toBe(1);
    },
  );
});

// --- golden: real Treasures of the Savage Frontier ECL1/GEO1 block 34 natural encounter ------
//
// `treasures-natural`'s own P2 slice — Treasures' first proven natural combat. Found by
// `tools/gen1_ecl_encounter_scan.py`'s corrected-dialect sweep (this scanner previously used the
// WRONG shared `gen1-short` word set for this title, silently desyncing every reachable
// LOAD_FILES/0x21 site a few bytes past — see that tool's own `GEN1_SHORT_TREASURES_WORD_SETS`
// comment) and confirmed live through this exact production entry point
// (`dialogueForCell`/`primeSearchLocation`, the same call `runStepEvent` makes on every step).
//
// Getting a real hit needed a genuine engine fix, not just data: Treasures' own retail script
// reads its per-cell descriptor from address `[0x002d]` — byte-verified via block 34's own
// `AND #127, 0x002d, 0x009a` — rather than the CoK/DoK-family `[0xc04f]` `MAP_CELL_BYTE_ADDR`
// `primeSearchLocation` seeds by default. See `EclDialect.cellDescAddr`'s own doc comment
// (disassemble.ts) and `ECL_GEN1_SHORT_TREASURES`'s updated doc comment — this title's own
// "Stormfront" engine generation evidently shares DQK's later Gen2 data-segment convention, not
// the older FTL-derived CoK/DoK layout. `docs/engine/research/treasures-natural-route.md` has
// the full evidence chain (walk path, rejected candidates, monster roster corroboration).
const treasuresRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const treasuresEcl1 = resolve(treasuresRoot, 'ECL1.DAX');
const treasuresGeo1 = resolve(treasuresRoot, 'GEO1.DAX');

describe('primeSearchLocation — golden Treasures of the Savage Frontier ECL1 block 34 natural encounter', () => {
  it.skipIf(!existsSync(treasuresEcl1) || !existsSync(treasuresGeo1))(
    'reaches the unique descriptor-0xFF GEO cell and the YETI CHIEF/ICE HOUND horde ambush through the real dialect-fixed cellDescAddr seeding',
    async () => {
      const blk34 = readDaxDataBlocks(new Uint8Array(await readFile(treasuresEcl1))).find((b) => b.blockId === 34)!;
      const geo34 = readDaxDataBlocks(new Uint8Array(await readFile(treasuresGeo1))).find((b) => b.blockId === 34)!;
      const map34 = decodeGeoBlock(geo34.raw, 'Treasures GEO1#34').map;

      // Two physically separate rooms share this unique descriptor — both real retail bytes.
      const matching = map34.cells
        .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
        .filter(({ cell }) => cell.floor === 0xff);
      expect(matching.map(({ x, y }) => `${x},${y}`).sort()).toEqual(['7,7', '8,9']);

      const memory = new Map<number, number>();
      const runner = dialogueForCell(blk34.raw, matching[0]!.cell.floor ?? 0, {
        memory,
        facing: 'north',
        dialect: ECL_GEN1_SHORT_TREASURES,
      });
      expect(runner).not.toBeNull();
      if (!runner) return;
      const turn = runner.start();

      expect(turn.text).toMatch(/HORDE OF YETIS CHARGING FORWARD TO GREET YOU/i);
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected combat');
      expect(turn.monsters).toEqual([
        { monsterId: 84, count: 4, picBlockId: 84 },
        { monsterId: 86, count: 14, picBlockId: 86 },
      ]);

      // The engine fix under test: without `cellDescAddr`'s extra `[0x002d]` write, this title's
      // own `AND #127, 0x002d, 0x009a` masks a zeroed address and the dispatch takes a different,
      // non-combat branch entirely — this assertion is the regression tripwire for that fix.
      expect(memory.get(0x002d)).toBe(0xff);

      // This encounter's actual post-victory continuation is part of the route contract. The
      // narration and the second tactical wave arrive in the same ECL turn; after that second
      // victory the rescued-miners journal entry ends the runner.
      const afterFirstCombatStart = new Map(memory);
      const resumed = runner.afterCombat('victory');
      expect(resumed.kind).toBe('combat');
      if (resumed.kind !== 'combat') throw new Error('expected the retail second wave');
      expect(resumed.text).toMatch(/SECOND PACK OF YETI AND ICE HOUNDS/i);
      expect(resumed.monsters).toEqual([
        { monsterId: 84, count: 2, picBlockId: 84 },
        { monsterId: 86, count: 12, picBlockId: 86 },
        { monsterId: 85, count: 1, picBlockId: 85 },
      ]);
      const complete = runner.afterCombat('victory');
      expect(complete.kind).toBe('end');
      expect(complete.text).toMatch(/MINERS, FREED FROM THEIR YETI CAPTORS/i);
      expect(runner.isDone()).toBe(true);

      // The first win only advances to the second wave. The second win makes the room persistent:
      // its retail journal/quest writes at 0x022d and 0x0232 prevent the horde from replaying.
      expect([...memory.entries()].filter(([key, value]) => afterFirstCombatStart.get(key) !== value)).toEqual([
        [0x54, 0], [0x022d, 1], [0x0232, 1],
      ]);
      const revisit = dialogueForCell(blk34.raw, matching[0]!.cell.floor ?? 0, {
        memory,
        facing: 'north',
        dialect: ECL_GEN1_SHORT_TREASURES,
      });
      expect(revisit?.start().kind).toBe('end');
    },
  );
});

// --- golden: Gateway ECL5#19 explicit FIGHT/LEAVE combat branch -------------------------------
//
// Gateway's native front-end has not yet been driven to this area, but the retail ECL branch is a
// complete local contract once its menu entry is reached: raw offset 0xC09 (vaddr 0x8C07 under
// Gateway's Gen1 `vbase=0x7FFE`) is HORIZONTAL_MENU FIGHT/LEAVE, choice 0 enters raw offset 0xC27,
// stages MON5CHA id 4 x3, and pauses at one-byte COMBAT raw offset 0xC36 / vaddr 0x8C34. Pinning
// the actual VM behavior prevents the existing static target report from silently drifting while
// the separate DOSBox-X save/new-game acquisition work remains open.
const gatewayRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const gatewayEcl5 = resolve(gatewayRoot, 'ECL5.DAX');
const gatewayGeo5 = resolve(gatewayRoot, 'GEO5.DAX');

describe('EclVm — golden Gateway ECL5 block 19 FIGHT/LEAVE branch', () => {
  it.skipIf(!existsSync(gatewayEcl5))(
    'runs the retail menu at 0x8c07 through FIGHT to MON5CHA id 4 x3, COMBAT 0x8c34, and its in-place exit',
    async () => {
      const blk19 = readDaxDataBlocks(new Uint8Array(await readFile(gatewayEcl5))).find((b) => b.blockId === 19)!;
      const vm = new EclVm(blk19.raw, {
        dialect: ECL_GEN1_SHORT_GATEWAY,
        entry: 0x8c07 - ECL_GEN1_SHORT_GATEWAY.vbase,
      });
      const menu = vm.run();
      expect(menu.status).toBe('awaiting-input');
      expect(menu.effects.find((effect) => effect.type === 'menu')).toMatchObject({
        type: 'menu', style: 'horizontal', items: ['FIGHT', 'LEAVE'], destAddr: 0x7f79,
      });

      const combat = vm.resume(0);
      expect(combat.status).toBe('combat');
      expect(combat.effects.find((effect) => effect.type === 'combat')).toEqual({
        type: 'combat', monsters: [{ monsterId: 4, count: 3, picBlockId: 4 }],
      });

      const resumed = vm.resume(0, { combatOutcome: 'victory' });
      expect(resumed.status).toBe('exited');
      expect(resumed.effects.some((effect) => effect.type === 'chain')).toBe(false);
    },
  );

  it.skipIf(!existsSync(gatewayEcl5) || !existsSync(gatewayGeo5))(
    'walks the captured Sundabar route, synchronously resumes descriptor 18 at its destination, and persists descriptor 122 consumption',
    async () => {
      const blk19 = readDaxDataBlocks(new Uint8Array(await readFile(gatewayEcl5))).find((b) => b.blockId === 19)!;
      const geo19 = readDaxDataBlocks(new Uint8Array(await readFile(gatewayGeo5))).find((b) => b.blockId === 19)!;
      const map = decodeGeoBlock(geo19.raw, 'Gateway GEO5#19').map;

      // The captured incoming campaign state is not merely a host constant: run the retail
      // initial_entry and prove this branch itself writes the observed Sundabar arrival registers.
      const arrivalMemory = new Map<number, number>([
        [0x4bf2, 21], [0xc04d, 3], [0x4c27, 0], [0x4c79, 0], [0x4cf5, 0], [0x4c6c, 0],
      ]);
      const initVm = new EclVm(blk19.raw, { memory: arrivalMemory, dialect: ECL_GEN1_SHORT_GATEWAY });
      const initialized = initVm.run();
      expect(initialized.status).toBe('exited');
      expect(arrivalMemory.get(0xc04b)).toBe(15);
      expect(arrivalMemory.get(0xc04c)).toBe(2);
      expect(arrivalMemory.get(0xc04d)).toBe(3); // west
      expect(initialized.effects).toContainEqual(expect.objectContaining({ type: 'loadFiles', geoBlockId: 19 }));
      expect(initialized.effects).toContainEqual(expect.objectContaining({ type: 'loadPieces', operands: [7, 15, 30] }));

      const explorer = new Explorer(map, { x: 15, y: 2, facing: 'west' });

      // Exact GameLink/native route from the captured campaign arrival (15,2,W) to the tavern
      // door (9,8,N): W W Sx6 W S Wx3 N. Every forward below crosses a retail GEO edge.
      explorer.forward();
      explorer.forward();
      explorer.turnLeft();
      for (let i = 0; i < 6; i++) expect(explorer.forward().moved).toBe(true);
      explorer.turnRight();
      expect(explorer.forward().moved).toBe(true);
      explorer.turnLeft();
      expect(explorer.forward().moved).toBe(true);
      explorer.turnRight();
      for (let i = 0; i < 3; i++) expect(explorer.forward().moved).toBe(true);
      explorer.turnRight();
      expect(explorer.forward().moved).toBe(true);
      expect(explorer.getPose()).toEqual({ x: 9, y: 8, facing: 'north' });
      expect(explorer.currentCell().floor).toBe(0x92); // descriptor 18 + high flag bit

      const memory = new Map<number, number>([
        [0x4c27, 0], [0x4c79, 0], [0x4cf5, 0], [0x4c6c, 0],
        [0xc04b, 9], [0xc04c, 8], [0xc04d, 0], [0xc04f, 0x92], [0x7f79, 18],
      ]);
      let hostMoves = 0;
      const onCall = (effect: Extract<EclEffect, { type: 'call' }>, live: Map<number, number>) => {
        if (effect.routine !== 'movePositionForward') return;
        hostMoves++;
        // Retail rotates north -> south before C01E, using DIV's remainder side effect to
        // recover the direction ordinal. The browser host must move in that live ECL direction,
        // not the Explorer's pre-script facing.
        expect(live.get(0xc04d)).toBe(2);
        const before = explorer.getPose();
        const scriptedFacing = (['north', 'east', 'south', 'west'] as const)[live.get(0xc04d) ?? 0] ?? before.facing;
        explorer.setPose({ ...before, facing: scriptedFacing });
        const step = explorer.forward();
        expect(step.moved).toBe(true);
        const pose = explorer.getPose();
        const cell = explorer.currentCell();
        live.set(0xc04b, pose.x);
        live.set(0xc04c, pose.y);
        live.set(0xc04d, gen1MapDirectionValue(pose.facing));
        live.set(0xc04e, cell.walls[pose.facing] ?? 0);
        live.set(0xc04f, cell.floor ?? 0);
        live.set(0x7f79, (cell.floor ?? 0) & 0x3f);
      };
      const applyFinalScriptPose = () => {
        const pose = explorer.getPose();
        const facing = (['north', 'east', 'south', 'west'] as const)[memory.get(0xc04d) ?? 0] ?? pose.facing;
        explorer.setPose({ x: memory.get(0xc04b) ?? pose.x, y: memory.get(0xc04c) ?? pose.y, facing });
        const finalPose = explorer.getPose();
        const cell = explorer.currentCell();
        memory.set(0xc04e, cell.walls[finalPose.facing] ?? 0);
        memory.set(0xc04f, cell.floor ?? 0);
        memory.set(0x7f79, (cell.floor ?? 0) & 0x3f);
      };

      const tavern = dialogueForCell(blk19.raw, explorer.currentCell().floor ?? 0, {
        memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 1, onCall,
      })!;
      const prompt = tavern.start();
      expect(prompt.kind).toBe('say');
      if (prompt.kind !== 'say') throw new Error('expected Gateway tavern choice');
      expect(prompt.text).toMatch(/WHAT'LL IT BE/i);
      expect(prompt.choices).toEqual(['FIGHT', 'LEAVE']);
      const fight = tavern.choose(0);
      expect(fight.kind).toBe('combat');
      if (fight.kind !== 'combat') throw new Error('expected Zhentil Fighter combat');
      expect(fight.monsters).toEqual([{ monsterId: 4, count: 3, picBlockId: 4 }]);
      const resumed = tavern.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(resumed.text).toMatch(/A SIGN SHAPED LIKE A LARGE MUG/i);
      expect(hostMoves).toBe(1);
      expect(memory.get(0xc04d)).toBe(0); // the script restores north after the host call
      applyFinalScriptPose();
      expect(explorer.getPose()).toEqual({ x: 9, y: 9, facing: 'north' });
      const destination = map.cells[9 * map.width + 9]!;
      expect(memory.get(0xc04b)).toBe(9);
      expect(memory.get(0xc04c)).toBe(9);
      expect(memory.get(0xc04d)).toBe(0);
      expect(memory.get(0xc04e)).toBe(destination.walls.north ?? 0);
      expect(memory.get(0xc04f)).toBe(destination.floor ?? 0);
      expect((memory.get(0xc04f) ?? 0) & 0x3f).toBe(17);
      expect(memory.get(0x4c03)).toBe(0);

      // Descriptor 18 is intentionally NOT consumed: walking north into it again presents the
      // same choice. LEAVE executes the same temporary 180-degree host move and returns to the
      // tavern-sign cell at (9,9,N).
      expect(explorer.forward().moved).toBe(true);
      const revisitTavern = dialogueForCell(blk19.raw, explorer.currentCell().floor ?? 0, {
        memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 1, onCall,
      })!;
      const revisitPrompt = revisitTavern.start();
      expect(revisitPrompt.kind).toBe('say');
      if (revisitPrompt.kind !== 'say') throw new Error('expected repeatable Gateway tavern choice');
      expect(revisitPrompt.choices).toEqual(['FIGHT', 'LEAVE']);
      const left = revisitTavern.choose(1);
      expect(left.kind).toBe('end');
      expect(left.text).toMatch(/A SIGN SHAPED LIKE A LARGE MUG/i);
      applyFinalScriptPose();
      expect(explorer.getPose()).toEqual({ x: 9, y: 9, facing: 'north' });
      expect(hostMoves).toBe(2);

      // Retail route from the tavern sign to descriptor 122: turn south, then Sx4, Wx3, S.
      explorer.turnAround();
      for (let i = 0; i < 4; i++) expect(explorer.forward().moved).toBe(true);
      explorer.turnRight();
      for (let i = 0; i < 3; i++) expect(explorer.forward().moved).toBe(true);
      explorer.turnLeft();
      expect(explorer.forward().moved).toBe(true);
      expect(explorer.getPose()).toEqual({ x: 6, y: 14, facing: 'south' });
      expect((explorer.currentCell().floor ?? 0) & 0x7f).toBe(122);

      const griffons = dialogueForCell(blk19.raw, explorer.currentCell().floor ?? 0, {
        memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 1, onCall,
      })!;
      const griffonFight = griffons.start();
      expect(griffonFight.kind).toBe('combat');
      if (griffonFight.kind !== 'combat') throw new Error('expected persistent Griffon combat');
      expect(griffonFight.text).toMatch(/THE CEILING OF THIS OLD BUILDING HAS COLLAPSED/i);
      expect(griffonFight.monsters).toEqual([{ monsterId: 42, count: 3, picBlockId: 42 }]);
      expect(memory.get(0x4c6c)).toBe(1); // written before COMBAT, exactly as retail
      expect(griffons.afterCombat('victory').kind).toBe('end');

      // A serialized/restored memory image keeps the room silent. This is the actual consumed word;
      // unlike descriptor 18, no pose-only or invented encounter flag is claimed here.
      const restoredMemory = new Map(memory);
      const consumed = dialogueForCell(blk19.raw, explorer.currentCell().floor ?? 0, {
        memory: restoredMemory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 1, onCall,
      })!;
      expect(consumed.start()).toMatchObject({ kind: 'end', text: '' });
      expect(restoredMemory.get(0x4c6c)).toBe(1);

      // A genuinely fresh zero-memory dispatch re-triggers the room. This isolates the retail
      // [4C6C] word as the suppression cause rather than any state retained by the prior runner.
      const freshMemory = new Map<number, number>();
      const freshGriffons = dialogueForCell(blk19.raw, explorer.currentCell().floor ?? 0, {
        memory: freshMemory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 1, onCall,
      })!;
      const freshFight = freshGriffons.start();
      expect(freshFight.kind).toBe('combat');
      if (freshFight.kind !== 'combat') throw new Error('expected fresh-memory Griffon combat');
      expect(freshFight.monsters).toEqual([{ monsterId: 42, count: 3, picBlockId: 42 }]);
      expect(freshMemory.get(0x4c6c)).toBe(1);
    },
  );
});

// --- golden: Gateway ECL5#19 COLD-memory arrival arm -> descriptor 18 (FIGHT/LEAVE) -------------
//
// The two goldens below sit BESIDE the entry-injected control above, which they deliberately do
// not duplicate: that one injects `entry: 0x8c07` (the menu itself), while these two enter the
// block the way the retail engine does — at `initial_entry` vaddr 0x8014 — and reach the same
// handler through the real GEO wall graph and the real `search_location` dispatch.
//
// Byte facts, all re-derived from the retail install with `tools/gen1_ecl_encounter_scan.py`'s
// `decode_one`/`header_entries` under Gateway's own operand dialect (`word_sets_for_profile
// ('gateway-to-the-savage-frontier')` = {29:0, 33:3, 34:0, 44:1}) and addend 0x8000. ECL5.DAX#19
// (Sundabar) is 6606 raw bytes, magic 88 13, Gen1 `vbase = 0x7FFE` (so file offset = vaddr -
// 0x8000 + 2). Header far pointers: `initial_entry` @0x8014, `search_location` @0x8127,
// `vm_run_1` @0x81C3, `pre_camp_check` @0x8386, `camp_interrupted` @0x83BA.
//
// `initial_entry` @0x8014 sets up the area and then picks an arrival pose off TWO guards:
//   0x8036 LOAD_FILES  #19,#2,#255      (geoBlockId 19 — GEO5.DAX#19, this map)
//   0x803D LOAD_PIECES #7,#15,#30       (wall/tile sets; see the archive note at the end)
//   0x8044 COMPARE [0x4BF2],#19 / IF_EQ / GOTO 0x8115   (same-area resume)
//   0x804F COMPARE [0x4BF2],#21 / IF_EQ / GOTO 0x8071   (arrival out of ECL6.DAX#21)
//   fall-through: SAVE #11->[0xC04C]; #7->[0xC04B]; #0->[0xC04D] => default pose (7,11) north.
// [0x4BF2] is the retail LastEclBlockId; ECL6.DAX#21 @0x8803 PRINTCLEAR "ENTER SUNDABAR?" ->
// 0x8812 CALL [0x080C] (yes/no host call) -> 0x8824 NEWECL #19, which is what puts 21 there.
//
// The arrival arm @0x8071 then has two guards of its own:
//   0x8071 COMPARE #1,[0x4CF5] / IF_EQ / GOTO 0x80C3
//   0x807C COMPARE [0xC04D],#3 / IF_EQ / GOTO 0x809D   (incoming facing WEST)
// On a COLD memory image ([0x4CF5]=0, [0xC04D]=0) both fail and execution falls through to the
// three unconditional pose writes this golden pins:
//   0x8087 SAVE #1  -> [0xC04D]   facing 1
//   0x808D SAVE #10 -> [0xC04C]   mapPosY 10
//   0x8093 SAVE #0  -> [0xC04B]   mapPosX 0
//
// NAME CAVEAT (honest): the describe title says "campaign" because this is the campaign-entry
// block id, but (0,10,east) is specifically the pose the script writes when the incoming facing
// is NOT west. The real ECL6#21 hand-off gates its own prompt on facing west (0x87FB
// `COMPARE [0xC04D],#3 / IF_NE / RETURN` immediately precedes the PRINTCLEAR/NEWECL), so a live
// retail arrival carries [0xC04D]=3 and takes the 0x809D arm to (15,2) facing west instead —
// which is exactly what the neighbouring "walks the captured Sundabar route" golden pins from a
// GameLink capture. Both poses are byte-true for their respective incoming states; this golden
// is the cold-memory arm, that one is the facing-west arm, and together they cover 0x8071's
// whole branch. Nothing here claims (0,10,east) is what a player sees on a retail campaign run.
//
// Register identity is not assumed. Gateway's OWN GAME.OVR read-side dispatcher at flat file
// offset 0xA552 decodes to `3d 4b c0 / 75 09 / a0 00 85` (cmp ax,0C04Bh -> mov al,[0x8500]),
// `3d 4c c0 -> a0 01 85`, and `3d 4d c0 -> a0 02 85 / 30 e4 / d1 e8` — the trailing `SHR AX,1`
// on the 0xC04D arm is what proves the ECL-visible half-direction ordinal (0=N,1=E,2=S,3=W), so
// [0xC04D]=1 is EAST. (The CoAB decompile `coab_extracted/engine/ovr008.cs vm_GetMemoryValue`'s
// `loc -= 0xC04B` switch agrees: case 0 mapPosX, 1 mapPosY, 2 mapDirection/2, 4 cell descriptor
// 0xC04F.) This is title-local evidence, not a cross-title assumption.
//
// `search_location` @0x8127 is the per-step entry `primeSearchLocation` primes:
//   0x8127 SAVE [0x4C02],[0x4C01]              (Gen1 SAVE is source,dest — stashes the PREVIOUS
//                                               cell's descriptor before 0x812E overwrites it)
//   0x812E AND #127,[0xC04F],[0x4C02]          (the script's OWN mask of the raw plane-2 byte)
//   0x8137 COMPARE [0x4C02],#121 / IF_GE / GOTO 0x819F
//   0x8142 ON_GOTO [0x4C02],#29,<29 targets>   (descriptors 0..28; index 18 -> 0x8BE9)
//   0x819F SUBTRACT #121,[0x4C02],[0x7F79]     (val_b - val_a = descriptor - 121)
//   0x81A8 ON_GOTO [0x7F79],#7,<7 targets>     (descriptors 121..127; index 1 -> 0x95D1)
//
// Descriptor 18 handler @0x8BE9: SAVE #8->[0x7EE1]; PICTURE #6; SAVE #255->[0x7EE1];
// PRINTCLEAR @0x8BF8 (12 packed bytes -> "'WHAT'LL IT BE?'", apostrophes included — they are in
// the retail data); HORIZONTAL_MENU @0x8C07 [FIGHT, LEAVE] destAddr 0x7F79; ON_GOTO @0x8C19 ->
// [0x8C25, 0x8277]; 0x8C25 CLEARMONSTERS; SETUP_MONSTER #255,#0,#255; LOAD_MONSTER #4,#3,#4;
// 0x8C34 COMBAT; 0x8C35 GOTO 0x8277. MON5CHA.DAX block 4 (422 bytes, Pascal-length name) is
// "ZHENTIL FIGHTER".
//
// NOTE — descriptor 18 has NO consumed flag. Its only writes are the [0x7EE1] portrait scratch
// and the [0x7F79] menu result; the post-combat GOTO 0x8277 is the shared "step back off the
// door" tail (a temporary 180-degree host move + redraw), not a persistence write. Walking into
// it again presents the same menu forever. That is precisely why the SECOND golden below uses
// descriptor 122 instead: the consumed/persistent-flag contract needs a descriptor that actually
// owns a flag, and [0x4C6C] is the real one on this map.
describe('primeSearchLocation — golden Gateway ECL5 block 19 descriptor 18 (campaign FIGHT/LEAVE)', () => {
  it.skipIf(!existsSync(gatewayEcl5) || !existsSync(gatewayGeo5))(
    'runs initial_entry cold to the byte-written (0,10,east) arrival pose, walks the real wall graph to descriptor 18 across only non-combat cells, and takes FIGHT to ZHENTIL FIGHTER x3',
    async () => {
      const blk19 = readDaxDataBlocks(new Uint8Array(await readFile(gatewayEcl5))).find((b) => b.blockId === 19)!;
      const geo19 = readDaxDataBlocks(new Uint8Array(await readFile(gatewayGeo5))).find((b) => b.blockId === 19)!;
      const map = decodeGeoBlock(geo19.raw, 'Gateway GEO5#19').map;

      // A1 — the arrival pose is BYTE-PROVEN, not a host constant. Seed only [0x4BF2]=21 (the
      // LastEclBlockId ECL6#21's NEWECL leaves behind) and let the retail initial_entry itself
      // choose the arm and write the registers.
      const arrival = new Map<number, number>([[0x4bf2, 21]]);
      const initVm = new EclVm(blk19.raw, { memory: arrival, dialect: ECL_GEN1_SHORT_GATEWAY });
      const initialized = initVm.run();
      expect(initialized.status).toBe('exited');
      expect(arrival.get(0xc04b)).toBe(0);  // 0x8093 SAVE #0  -> [0xC04B] mapPosX
      expect(arrival.get(0xc04c)).toBe(10); // 0x808D SAVE #10 -> [0xC04C] mapPosY
      expect(arrival.get(0xc04d)).toBe(1);  // 0x8087 SAVE #1  -> [0xC04D] facing = EAST
      // The same run's area-setup effects (0x8036 / 0x803D) — this is what a host must honour to
      // render the area at all, so it belongs in the same contract as the pose.
      expect(initialized.effects).toContainEqual(
        expect.objectContaining({ type: 'loadFiles', geoBlockId: 19, operands: [19, 2, 255] }),
      );
      expect(initialized.effects).toContainEqual(
        expect.objectContaining({ type: 'loadPieces', operands: [7, 15, 30] }),
      );

      // A2 — walk the REAL wall graph from that pose to descriptor 18 at (9,8).
      //
      // A `startPose` override is mandatory here and this is the byte reason: GEO5#19's passable
      // graph (passable = wall==0 OR door!=0) has FOUR components sized 211 / 32 / 12 / 1, and
      // `apps/web/src/ui/explore.ts`'s `chooseStart` heuristic (line 1766 — first row-major cell
      // with all four edges open) lands on (9,0), which is in the 32-cell component. (0,10),
      // (9,8) and (6,14) are all in the 211-cell component, so the heuristic spawn has NO path
      // to either target. The arrival pose proven in A1 is the override.
      const explorer = new Explorer(map, { x: 0, y: 10, facing: 'east' });
      expect(((explorer.currentCell().floor ?? 0) & 0x7f)).toBe(5); // start cell, print-only flavour

      // Retail-legal cardinal route (0,10) -> (9,8): E x8, N, E, N. Each `forward()` must cross a
      // real GEO edge, so `moved` is asserted every step rather than assumed.
      const crossed: { x: number; y: number; floor: number }[] = [];
      const stepForward = () => {
        expect(explorer.forward().moved).toBe(true);
        const pose = explorer.getPose();
        crossed.push({ x: pose.x, y: pose.y, floor: explorer.currentCell().floor ?? 0 });
      };
      for (let i = 0; i < 8; i++) stepForward();  // (1,10) .. (8,10)
      explorer.turnLeft();                        // east -> north
      stepForward();                              // (8,9)
      explorer.turnRight();                       // north -> east
      stepForward();                              // (9,9)
      explorer.turnLeft();                        // east -> north
      stepForward();                              // (9,8) — the descriptor-18 cell
      expect(explorer.getPose()).toEqual({ x: 9, y: 8, facing: 'north' });
      expect(crossed.map(({ x, y }) => `${x},${y}`)).toEqual([
        '1,10', '2,10', '3,10', '4,10', '5,10', '6,10', '7,10', '8,10', '8,9', '9,9', '9,8',
      ]);
      // Raw plane-2 bytes along the route (bit 7 is the retail high flag, masked off for the
      // descriptor). 0x92 & 0x7f = 18 — and 18 occurs exactly once on this 1026-byte map.
      expect(crossed.map(({ floor }) => floor & 0x7f)).toEqual([7, 1, 11, 1, 1, 22, 25, 24, 1, 17, 18]);
      expect(explorer.currentCell().floor).toBe(0x92);
      expect(map.cells.filter((cell) => ((cell.floor ?? 0) & 0x7f) === 18)).toHaveLength(1);

      // A4 (asserted before A3 so the route is validated before it is used) — every intermediate
      // cell is dispatched through the SAME production entry point on a THROWAWAY copy of the
      // arrival memory, and none of them may queue a fight. This is what makes the route honest
      // rather than lucky: without it, "we reached descriptor 18" says nothing about what the
      // party walked through to get there.
      //
      // The route is NOT inert by construction. Descriptor 1 @0x83D2 is `COMPARE [0x4C27],#15 /
      // IF_EQ / EXIT`: on cold memory [0x4C27]=0 != 15, the guarded EXIT is SKIPPED and control
      // falls straight into descriptor 0's handler @0x83DA, which jumps to 0x83F3
      // `RANDOM #100 -> [0x7F7F] / COMPARE [0x7F7F],#6 / IF_GE / EXIT` — the retail
      // wandering-monster roll (low arm 0x8412 OGRES = MON5CHA 26, high arm 0x8448 ZHENTIL
      // GUARDS = MON5CHA 4). Four cells on this leg carry descriptor 1, so four live rolls run.
      // The VM's RANDOM is a deterministic seeded LCG, so this is reproducible, not flaky — but
      // it is a real roll, and the assertion below is a statement about THIS seed, not a claim
      // that descriptors 0/1 are inert.
      const routeSeed = 0x1234; // the VM default; no roll on this leg lands under 6 with it
      for (const { x, y, floor } of crossed.slice(0, -1)) {
        const scratch = new Map(arrival);
        const probe = dialogueForCell(blk19.raw, floor, {
          memory: scratch, facing: 'east', dialect: ECL_GEN1_SHORT_GATEWAY, seed: routeSeed,
        });
        expect(probe).not.toBeNull();
        const turn = probe!.start();
        expect(turn.kind, `descriptor ${floor & 0x7f} at (${x},${y}) queued a fight`).not.toBe('combat');
      }

      // A3 — dispatch the destination cell itself. `dialogueForCell` is exactly
      // `primeSearchLocation` + `DialogueRunner`; it is spelled out here only so the runner's own
      // effect tap can pin the retail menu's destAddr, which the `say` turn does not surface.
      const memory = new Map(arrival);
      const effects: EclEffect[] = [];
      let hostMoves = 0;
      // 0x8277 (the shared post-choice tail both FIGHT and LEAVE reach) rotates the party 180
      // degrees and asks the host to step it back off the door, then redispatches
      // `search_location` for the destination cell inside the SAME VM invocation. Without this
      // bridge [0xC04F] would still hold 0x92 at the redispatch and the menu would reappear
      // instead of ending — see EclVmOptions.onCall's own doc comment, which cites this exact
      // Gateway block.
      const onCall = (effect: Extract<EclEffect, { type: 'call' }>, live: Map<number, number>) => {
        if (effect.routine !== 'movePositionForward') return;
        hostMoves++;
        expect(live.get(0xc04d)).toBe(2); // the script rotated north -> south before the call
        const scriptedFacing = (['north', 'east', 'south', 'west'] as const)[live.get(0xc04d) ?? 0]!;
        explorer.setPose({ ...explorer.getPose(), facing: scriptedFacing });
        expect(explorer.forward().moved).toBe(true);
        const pose = explorer.getPose();
        const cell = explorer.currentCell();
        live.set(0xc04b, pose.x);
        live.set(0xc04c, pose.y);
        live.set(0xc04d, gen1MapDirectionValue(pose.facing));
        live.set(0xc04e, cell.walls[pose.facing] ?? 0);
        live.set(0xc04f, cell.floor ?? 0);          // the byte 0x812E masks on the redispatch
        live.set(0x7f79, (cell.floor ?? 0) & 0x3f); // primeSearchLocation's own companion seed
      };
      const vm = primeSearchLocation(blk19.raw, explorer.currentCell().floor ?? 0, {
        memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: routeSeed, onCall,
      });
      expect(vm).not.toBeNull();
      const tavern = new DialogueRunner(vm!, (batch) => effects.push(...batch));

      const prompt = tavern.start();
      expect(prompt.kind).toBe('say');
      if (prompt.kind !== 'say') throw new Error('expected the Gateway FIGHT/LEAVE menu');
      expect(prompt.text).toMatch(/WHAT'LL IT BE/i);
      expect(prompt.choices).toEqual(['FIGHT', 'LEAVE']);
      expect(effects).toContainEqual(expect.objectContaining({
        // HORIZONTAL_MENU @0x8C07, destAddr 0x7F79 — the word the ON_GOTO @0x8C19 then selects on.
        type: 'menu', style: 'horizontal', items: ['FIGHT', 'LEAVE'], destAddr: 0x7f79,
      }));

      const fight = tavern.choose(0); // ON_GOTO index 0 -> 0x8C25
      expect(fight.kind).toBe('combat');
      if (fight.kind !== 'combat') throw new Error('expected the ZHENTIL FIGHTER combat');
      expect(fight.monsters).toEqual([{ monsterId: 4, count: 3, picBlockId: 4 }]);

      const resumed = tavern.afterCombat('victory');
      expect(resumed.kind).toBe('end');
      expect(effects.some((effect) => effect.type === 'chain')).toBe(false);
      expect(hostMoves).toBe(1); // 0x8277's single step-back, nothing else
      // Descriptor 18 wrote no persistent word: only the [0x7EE1] portrait scratch and the
      // [0x7F79] menu result changed relative to the arrival image. (Compare golden B's [0x4C6C].)
      expect([...memory.keys()].filter((key) => key >= 0x4c00 && key <= 0x4cff && memory.get(key) !== arrival.get(key)))
        .not.toContain(0x4c6c);
    },
  );
});

// --- golden: Gateway ECL5#19 descriptor 122 — the map's real one-shot ([0x4C6C]) ---------------
//
// The consumed/persistent-flag half of the pair. Descriptor 122 lives at (6,14) as raw plane-2
// byte 0x7A and is dispatched through `search_location`'s SECOND table: 122 >= 121 takes
// 0x813D's IF_GE to 0x819F, `SUBTRACT #121,[0x4C02],[0x7F79]` leaves 1, and table 2 index 1 is
// 0x95D1.
//
// Handler @0x95D1, with sizes, exactly as the retail bytes decode:
//   0x95D1 COMPARE [0x4C6C],#1   (6)
//   0x95D7 IF_EQ                 (1)
//   0x95D8 EXIT                  (1)   <- already consumed: silent, no narration, no fight
//   0x95D9 SAVE #1 -> [0x4C6C]   (6)   <- marks itself consumed BEFORE the fight, not after
//   0x95DF PRINTCLEAR len=145    (148) -> 193 chars, "THE CEILING OF THIS OLD BUILDING HAS
//                                        COLLAPSED, ..." (no trailing junk)
//   0x9673 CALL [0x0809]         (4)
//   0x9677 CLEARMONSTERS         (1)
//   0x9678 SETUP_MONSTER #255,#1,#255 (7)
//   0x967F LOAD_MONSTER #42,#3,#42    (7)   MON5CHA.DAX block 42 = "GRIFFON"
//   0x9686 COMBAT                (1)
//   0x9687 GOTO [0x826E]         (4)   -> 0x826E CALL [0x2E10]; 0x8272 EXIT (redraw, in place)
//
// Because the flag write at 0x95D9 precedes COMBAT, the room is consumed even if the host never
// resolves the fight — the assertions below pin that ordering explicitly.
//
// EVENT_INDEX_MASK is NOT a hazard for this descriptor even though 122 > 0x3F.
// `primeSearchLocation` seeds BOTH [0xC04F] = backdrop & 0xff (0x7A = 122, intact) and
// [0x7F79] = backdrop & 0x3F (0x3A = 58, mangled) — but this block reads [0xC04F] and applies
// its OWN `AND #127` at 0x812E, and [0x7F79] is only ever WRITTEN here (at 0x819F) before the
// second ON_GOTO reads it, so the masked seed is dead on this path. The raw byte reaches the
// primer because `decodeGeoBlock` stores `floor: backdropPlane[i]` unmasked
// (packages/engine/src/loaders/geo.ts:157) and the walk loop passes `map.cells[i].floor`.
describe('primeSearchLocation — golden Gateway ECL5 block 19 descriptor 122 (one-shot GRIFFON ambush, consumed flag [0x4c6c])', () => {
  it.skipIf(!existsSync(gatewayEcl5) || !existsSync(gatewayGeo5))(
    'fires the GRIFFON x3 ambush once, sets [0x4c6c] before COMBAT, ends in place, then stays silent on the same memory while a fresh memory re-triggers it',
    async () => {
      const blk19 = readDaxDataBlocks(new Uint8Array(await readFile(gatewayEcl5))).find((b) => b.blockId === 19)!;
      const geo19 = readDaxDataBlocks(new Uint8Array(await readFile(gatewayGeo5))).find((b) => b.blockId === 19)!;
      const map = decodeGeoBlock(geo19.raw, 'Gateway GEO5#19').map;

      // Locate the cell from the real GEO bytes rather than hard-coding 0x7A.
      const matching = map.cells
        .map((cell, index) => ({ cell, x: index % map.width, y: Math.floor(index / map.width) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 122);
      expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([[6, 14, 0x7a]]);
      const cellFloor = matching[0]!.cell.floor ?? 0;

      // B1 — first visit on a shared cold memory map.
      const memory = new Map<number, number>();
      const first = dialogueForCell(blk19.raw, cellFloor, {
        memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      });
      expect(first).not.toBeNull();
      if (!first) return;
      const ambush = first.start();
      expect(ambush.kind).toBe('combat');
      if (ambush.kind !== 'combat') throw new Error('expected the GRIFFON ambush');
      expect(ambush.text).toMatch(/THE CEILING OF THIS OLD BUILDING HAS COLLAPSED/i);
      expect(ambush.monsters).toEqual([{ monsterId: 42, count: 3, picBlockId: 42 }]);
      // 0x95D9 runs BEFORE 0x9686 COMBAT: the room is already consumed at the combat pause.
      expect(memory.get(0x4c6c)).toBe(1);

      // B2 — GOTO 0x826E is a redraw-and-exit tail: clean end, in place, no NEWECL.
      const afterVictory = first.afterCombat('victory');
      expect(afterVictory.kind).toBe('end');
      expect(first.isDone()).toBe(true);
      expect(memory.get(0x4c6c)).toBe(1);

      // B3 — THE CONSUMED-STATE PROOF. Re-dispatch the SAME cell against the SAME memory map:
      // 0x95D1's COMPARE now matches, 0x95D7's IF_EQ holds, and 0x95D8's EXIT ends the script
      // before the PRINTCLEAR at 0x95DF — so no narration and no roster at all.
      const revisit = dialogueForCell(blk19.raw, cellFloor, {
        memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      })!;
      const silent = revisit.start();
      expect(silent).toMatchObject({ kind: 'end', text: '' });
      expect(memory.get(0x4c6c)).toBe(1);

      // B4 — negative control. A genuinely FRESH memory map re-triggers the whole encounter, so
      // the suppression in B3 is caused by the retail word [0x4C6C] and not by any state the
      // previous DialogueRunner/EclVm retained (each dispatch builds a brand-new VM; this proves
      // it, rather than assuming it).
      const freshMemory = new Map<number, number>();
      const fresh = dialogueForCell(blk19.raw, cellFloor, {
        memory: freshMemory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      })!;
      const refired = fresh.start();
      expect(refired.kind).toBe('combat');
      if (refired.kind !== 'combat') throw new Error('expected the fresh-memory GRIFFON ambush');
      expect(refired.text).toMatch(/THE CEILING OF THIS OLD BUILDING HAS COLLAPSED/i);
      expect(refired.monsters).toEqual([{ monsterId: 42, count: 3, picBlockId: 42 }]);
      expect(freshMemory.get(0x4c6c)).toBe(1);
    },
  );
});

// ARCHIVE NOTE for both goldens above — ECL5#19's `LOAD_PIECES #7,#15,#30` (0x803D) spans two
// archives: WALLDEF5.DAX holds block ids [4,7,9,16] and 8X8D5.DAX [4,5,7,9,16], while ids 15 and
// 30 live only in the shared WALLDEF.DAX / 8X8D.DAX (both [5,15,30]). That is NOT a rendering
// gap on the path a `*-natural` profile takes: `startExplore` (apps/web/src/ui/explore.ts:5874)
// merges the shared archives into one lookup namespace before handing them to the wall/tile
// sources (`sharedTilesIdx`/`tiles.blocks` at ~5963 and `sharedWdIdx`/`wdIdx` at ~5966), and
// `gateway-natural` declares both `sharedWalldefPath = WALLDEF.DAX` and `sharedTilesPath =
// 8X8D.DAX`, so all three sets resolve (WALLDEF 7 local; 15 and 30 shared, one 780-byte record
// each). Worth stating because the failure mode would be loud rather than cosmetic:
// `loadDungeonWalls` (packages/engine/src/world/dungeonWalls.ts:154-161) THROWS on a missing
// non-sentinel block — only WALLDEF_RESET (0xFF) and WALLDEF_DEFAULT_SET1 (0x7F) are tolerated —
// so a genuinely unresolved 15/30 would be a hard load failure, not blank walls.

// --- golden: real Neverwinter Nights (DOS/AOL) GEO1/ECL1 block 10 natural encounter ------------
//
// `nwn-natural`'s own combat-handoff slice. GEO1.DAX block 10 (the Neverwinter town map) and
// ECL1.DAX block 10 hold a real, native-proven encounter: `docs/engine/research/
// neverwinter-nights-dos-combat-flow.md` records a live GBBOOT trace that resumes from a persisted
// pose `(14,4)` facing east, steps into descriptor cell `(15,4)`, and queues monster `0x0045`
// (id 69) x2 + `0x001e` (id 30) x3 before writing its own resume state. Reproducing that same
// dispatch here through `dialogueForCell` — this title's real per-step production entry point —
// is the independent cross-check: the monster ids/counts below match the native trace exactly,
// with zero AOL host-key state involved (this leg is reachable through ordinary GEO-walk
// `search_location` dispatch alone).
//
// Two engine findings this route needed, neither a bug fix (unlike Treasures' `cellDescAddr`):
//
// 1. **Block 10's DEFAULT entry is a trampoline, not a boot.** Running ECL1.DAX#10 from its normal
//    entry point immediately executes an unconditional `GOTO` into block 19 — this block is only
//    ever reached as a mid-session redirect target, never a fresh-boot target, from its default
//    entry. The real "boot into THIS area" sequence lives at the block's own `eclInitialEntry`
//    header pointer, byte offset 149 relative to the block start (`LOAD_FILES` geoBlockId=10
//    self-referencing, `LOAD_PIECES` setBlockIds=[33,27,16]) — reused via the existing
//    `GameData.eclEntryOffset`/`loadDungeon({ entry })` mechanism Pool of Radiance's own
//    byte-located startup already established, no new engine code required.
// 2. **`chooseStart`'s heuristic spawn cannot reach this encounter without fighting a different one
//    first.** This is a densely-scripted town map: classifying every non-zero-floor cell found 15
//    OTHER combat-triggering cells besides the target, and a combat-cell-avoiding BFS from the
//    normal spawn came back unreachable — every path crosses at least one of them. `nwn-natural`'s
//    own `GameData.startPose` override `(7,7,north)` was picked from the reverse-BFS "safe region"
//    around the target (116 cells, hard-avoiding every other combat cell), the same `startPose`
//    mechanism Treasures' own natural route established, here for a different underlying cause
//    (hostile-cell avoidance, not map fragmentation). The walk below is a real 22-action legal
//    path within that safe region, crossing exactly 2 benign print-only sign cells en route —
//    consistent with (and slightly more tolerant than) the DoK-natural precedent of allowing one
//    intermediate non-combat event cell.
const nwnRoot = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const nwnEcl1 = resolve(nwnRoot, 'ECL1.DAX');
const nwnGeo1 = resolve(nwnRoot, 'GEO1.DAX');

describe('primeSearchLocation — golden Neverwinter Nights (DOS/AOL) GEO1/ECL1 block 10 natural encounter', () => {
  it.skipIf(!existsSync(nwnEcl1) || !existsSync(nwnGeo1))(
    'walks from the startPose-overridden spawn to the descriptor-229 doorway and reaches the CARRION CRAWLER/SCORPION ambush the native GBBOOT trace independently recorded',
    async () => {
      const blk10 = readDaxDataBlocks(new Uint8Array(await readFile(nwnEcl1))).find((b) => b.blockId === 10)!;
      const geo10 = readDaxDataBlocks(new Uint8Array(await readFile(nwnGeo1))).find((b) => b.blockId === 10)!;
      const map10 = decodeGeoBlock(geo10.raw, 'NWN GEO1#10').map;

      const target = map10.cells[4 * map10.width + 15]!;
      expect(target.floor).toBe(229);

      const runner = dialogueForCell(blk10.raw, target.floor ?? 0, { facing: 'east' });
      expect(runner).not.toBeNull();
      if (!runner) return;

      const turn = runner.start();
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected NWN combat');
      expect(turn.monsters).toEqual([
        { monsterId: 69, count: 2, picBlockId: 69 },
        { monsterId: 30, count: 3, picBlockId: 30 },
      ]);
    },
  );
});
