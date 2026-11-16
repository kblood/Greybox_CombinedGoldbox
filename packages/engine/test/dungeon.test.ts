/**
 * loadDungeon orchestrator tests (M1.S5d).
 *
 * 1) Synthetic: a hand-built ECL init block (LOAD_FILES + LOAD_PIECES + EXIT) over synthetic
 *    GEO/WALLDEF/8X8D sources — proves the run→take-effects→decode-map→load-walls wiring and
 *    its error paths, no game data needed.
 * 2) Golden: the same path on REAL CoK ECL1 block 34 (two-set area) — GEO 34 + WALLDEF [3,_,23]
 *    + 8X8D 31/32/23 — skips cleanly when game data is absent.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDungeon,
  readDaxDataBlocks,
  ECL_HEADER_LEN,
  encodeEclString,
  type DungeonSources,
} from '../src/index.js';

// --- synthetic builders -----------------------------------------------------

/** 22-byte ECL header (magic 0x1388) + body bytes (body[0] = vaddr 0x8014). */
function eclBlock(...body: number[]): Uint8Array {
  const raw = new Uint8Array(ECL_HEADER_LEN + body.length);
  raw[0] = 0x88; raw[1] = 0x13; raw[2] = 0x01; raw[3] = 0x01;
  raw.set(body, ECL_HEADER_LEN);
  return raw;
}
const imm = (v: number) => [0x00, v & 0xff];

/** An init block: LOAD_FILES geo, g1, g2 ; LOAD_PIECES s1, s2, s3 ; EXIT. */
function initBlock(geo: number, pieces: [number, number, number]): Uint8Array {
  return eclBlock(
    0x21, ...imm(geo), ...imm(0), ...imm(0xff), // LOAD_FILES (operand 0 = GEO block)
    0x37, ...imm(pieces[0]), ...imm(pieces[1]), ...imm(pieces[2]), // LOAD_PIECES
    0x00, // EXIT
  );
}

const RECORD = 780;
/** A 1026-byte GEO block (header 1024); `wall(y,x,dir)` seeds nibble-packed walls (default open). */
function geoBlock(wall: (y: number, x: number) => { n: number; e: number; s: number; w: number } = () => ({ n: 0, e: 0, s: 0, w: 0 })): Uint8Array {
  const raw = new Uint8Array(1026);
  raw[0] = 0x00; raw[1] = 0x04; // data size = 1024
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = y * 16 + x;
      const { n, e, s, w } = wall(y, x);
      raw[2 + 0 * 256 + i] = ((n & 0xf) << 4) | (e & 0xf); // plane 0 = N<<4 | E
      raw[2 + 1 * 256 + i] = ((s & 0xf) << 4) | (w & 0xf); // plane 1 = S<<4 | W
    }
  }
  return raw;
}

/** A WALLDEF block of `records` records; tile id `id` at slice 0, pool column `col`. */
function walldef(records: number, id: number, col: number): Uint8Array {
  const raw = new Uint8Array(records * RECORD);
  for (let r = 0; r < records; r++) raw[r * RECORD + 0 * 156 + col] = id & 0xff;
  return raw;
}

/** A valid 8X8D block (header 8,1) with `count` tiles, all pixels nibble `i&0xf`. */
function tiles8x8(count: number): Uint8Array {
  const raw = new Uint8Array(9 + count * 32 + 8);
  raw[0] = 8; raw[2] = 1; raw[8] = count;
  for (let i = 0; i < count; i++) {
    const nib = i & 0x0f;
    raw.fill((nib << 4) | nib, 9 + i * 32, 9 + (i + 1) * 32);
  }
  return raw;
}

function sources(geo: Record<number, Uint8Array>, wd: Record<number, Uint8Array>, tl: Record<number, Uint8Array>): DungeonSources {
  return {
    geoBlock: (id) => geo[id] ?? null,
    walldefBlock: (id) => wd[id] ?? null,
    tileBlock: (id) => tl[id] ?? null,
  };
}

describe('loadDungeon (synthetic)', () => {
  it('runs the init block, decodes the GEO map, and loads the WALLDEF sets', () => {
    const d = loadDungeon(
      initBlock(7, [5, 6, 7]),
      sources(
        { 7: geoBlock((y, x) => (y === 3 && x === 4 ? { n: 1, e: 0, s: 0, w: 0 } : { n: 0, e: 0, s: 0, w: 0 })) },
        { 5: walldef(1, 0x30, 10), 6: walldef(1, 0x30, 10), 7: walldef(1, 0x30, 10) },
        { 5: tiles8x8(70), 6: tiles8x8(70), 7: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );
    expect(d.geoBlockId).toBe(7);
    expect(d.pieces.setBlockIds).toEqual([5, 6, 7]);
    expect(d.pieces.twoSet).toBe(false);
    expect(d.map.width).toBe(16);
    expect(d.map.cells[3 * 16 + 4].walls.north).toBe(1); // the seeded wall survived decode
    for (let ws = 0; ws < 3; ws++) expect(d.walls.walldefBlocks[ws]).not.toBeNull();
    expect(d.walls.readId(0, 0, 10)).toBe(0x30); // set 1, varA 0
  });

  it('collects ADD_NPC (0x36) joins into npcJoins, in emission order (M35.S1)', () => {
    // LOAD_FILES + ADD_NPC #48,#100 + ADD_NPC #49,#60 + LOAD_PIECES + EXIT.
    const block = eclBlock(
      0x21, ...imm(7), ...imm(0), ...imm(0xff), // LOAD_FILES
      0x36, ...imm(48), ...imm(100), // ADD_NPC
      0x36, ...imm(49), ...imm(60), // ADD_NPC
      0x37, ...imm(5), ...imm(6), ...imm(7), // LOAD_PIECES
      0x00, // EXIT
    );
    const d = loadDungeon(
      block,
      sources(
        { 7: geoBlock() },
        { 5: walldef(1, 0x30, 10), 6: walldef(1, 0x30, 10), 7: walldef(1, 0x30, 10) },
        { 5: tiles8x8(70), 6: tiles8x8(70), 7: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );
    expect(d.npcJoins).toEqual([
      { npcId: 48, morale: 100 },
      { npcId: 49, morale: 60 },
    ]);
  });

  it('npcJoins is empty for a dungeon that scripts no ADD_NPC (the common case)', () => {
    const d = loadDungeon(
      initBlock(7, [5, 6, 7]),
      sources(
        { 7: geoBlock() },
        { 5: walldef(1, 0x30, 10), 6: walldef(1, 0x30, 10), 7: walldef(1, 0x30, 10) },
        { 5: tiles8x8(70), 6: tiles8x8(70), 7: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );
    expect(d.npcJoins).toEqual([]);
  });

  it('collects a multi-print burst into introText, in emission order (M36.S1)', () => {
    // LOAD_FILES + PRINT "WELCOME TRAVELER" + PRINT "THE GUARD NODS" + LOAD_PIECES + EXIT.
    const greeting = encodeEclString('WELCOME TRAVELER');
    const followUp = encodeEclString('THE GUARD NODS');
    const block = eclBlock(
      0x21, ...imm(7), ...imm(0), ...imm(0xff), // LOAD_FILES
      0x11, 0x80, greeting.length, ...greeting, // PRINT
      0x11, 0x80, followUp.length, ...followUp, // PRINT
      0x37, ...imm(5), ...imm(6), ...imm(7), // LOAD_PIECES
      0x00, // EXIT
    );
    const d = loadDungeon(
      block,
      sources(
        { 7: geoBlock() },
        { 5: walldef(1, 0x30, 10), 6: walldef(1, 0x30, 10), 7: walldef(1, 0x30, 10) },
        { 5: tiles8x8(70), 6: tiles8x8(70), 7: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );
    expect(d.introText).toBe('WELCOME TRAVELER THE GUARD NODS');
  });

  it('throws a clear error when the GEO block is absent', () => {
    expect(() =>
      loadDungeon(initBlock(99, [5, 0xff, 0xff]), sources({}, { 5: walldef(1, 0, 0) }, { 5: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) })),
    ).toThrow(/GEO block 99 not found/);
  });

  it('throws when the init block emits no LOAD_PIECES', () => {
    // Only LOAD_FILES + EXIT.
    const onlyFiles = eclBlock(0x21, ...imm(7), ...imm(0), ...imm(0xff), 0x00);
    expect(() => loadDungeon(onlyFiles, sources({ 7: geoBlock() }, {}, {}))).toThrow(/no LOAD_PIECES/);
  });
});

// --- golden: real CoK ECL1 block 34 ----------------------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const cok = resolve(here, '..', '..', '..', 'Champions of Krynn');
const have = ['ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'].every((f) => existsSync(resolve(cok, f)));

async function daxIndex(file: string, base = cok): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(base, file))));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe('loadDungeon — golden CoK ECL1 block 34 (two-set dungeon)', () => {
  it.skipIf(!have)('loads GEO 34 + the resolved WALLDEF/8X8D sets from real bytes', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const tl = await daxIndex('8X8D1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const d = loadDungeon(ecl.get(34)!, src, { label: 'CoK GEO1#34' });

    expect(d.geoBlockId).toBe(34);
    expect(d.pieces.operands).toEqual([3, 4, 23]);
    expect(d.pieces.twoSet).toBe(true);
    expect(d.pieces.setBlockIds).toEqual([3, 0xff, 23]);
    expect(d.map.width).toBe(16);
    expect(d.map.height).toBe(16);
    // All three wallsets populate (block 3 is a 2-record block; set 3 ← block 23).
    for (let ws = 0; ws < 3; ws++) expect(d.walls.walldefBlocks[ws], `wallset ${ws}`).not.toBeNull();
    for (let set = 1; set <= 3; set++) expect(d.walls.tileSets[set]?.tiles.length, `8X8D set ${set}`).toBeGreaterThan(0);
    // M36.S1 negative control — CoK's own real block 34 scripts no PRINT at all (unlike DoK's sibling
    // "WELCOME TO CEKOS" greeting, dungeon-dok.test.ts), so this finding is honestly DoK-only.
    expect(d.introText).toBe('');
  });
});

// --- golden: real Pool of Radiance ECL1 block 18 ---------------------------------------------

const pool = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD';
const havePool = ['ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'].every((f) => existsSync(resolve(pool, f)));

describe('loadDungeon — golden Pool of Radiance ECL1 block 18', () => {
  it.skipIf(!havePool)('loads the first Pool DOS area route from real GOG bytes', async () => {
    const ecl = await daxIndex('ECL1.DAX', pool);
    const geo = await daxIndex('GEO1.DAX', pool);
    const wd = await daxIndex('WALLDEF1.DAX', pool);
    const tl = await daxIndex('8X8D1.DAX', pool);
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const d = loadDungeon(ecl.get(18)!, src, { label: 'Pool GEO1#18', entry: 0x73 });

    expect(d.geoBlockId).toBe(18);
    expect(d.pieces.operands).toEqual([1, 3, 5]);
    expect(d.pieces.setBlockIds).toEqual([1, 3, 5]);
    expect(d.map.width).toBe(16);
    expect(d.map.height).toBe(16);
    for (let ws = 0; ws < 3; ws++) expect(d.walls.walldefBlocks[ws], `wallset ${ws}`).not.toBeNull();
    for (let set = 1; set <= 3; set++) expect(d.walls.tileSets[set]?.tiles.length, `8X8D set ${set}`).toBeGreaterThan(0);
  });
});

// --- golden: real Curse of the Azure Bonds ECL2 block 1 -------------------------------------

const coab = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds';
const haveCoab = ['ECL2.DAX', 'GEO2.DAX', 'WALLDEF2.DAX', '8X8D2.DAX'].every((f) => existsSync(resolve(coab, f)));

describe('loadDungeon — golden Curse of the Azure Bonds ECL2 block 1', () => {
  it.skipIf(!haveCoab)('loads the first CoAB dungeon route from real GOG bytes', async () => {
    const ecl = await daxIndex('ECL2.DAX', coab);
    const geo = await daxIndex('GEO2.DAX', coab);
    const wd = await daxIndex('WALLDEF2.DAX', coab);
    const tl = await daxIndex('8X8D2.DAX', coab);
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const d = loadDungeon(ecl.get(1)!, src, { label: 'CoAB GEO2#1' });

    expect(d.geoBlockId).toBe(1);
    expect(d.pieces.operands).toEqual([1, 2, 3]);
    expect(d.pieces.setBlockIds).toEqual([1, 2, 3]);
    expect(d.pieces.twoSet).toBe(false);
    expect(d.map.width).toBe(16);
    expect(d.map.height).toBe(16);
    for (let ws = 0; ws < 3; ws++) expect(d.walls.walldefBlocks[ws], `wallset ${ws}`).not.toBeNull();
    for (let set = 1; set <= 3; set++) expect(d.walls.tileSets[set]?.tiles.length, `8X8D set ${set}`).toBe(70);
  });
});

// --- golden: real Gateway to the Savage Frontier ECL2 block 2 -------------------------------

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const haveGateway = ['ECL2.DAX', 'GEO2.DAX', 'WALLDEF2.DAX', '8X8D2.DAX'].every((f) => existsSync(resolve(gateway, f)));

describe('loadDungeon — golden Gateway ECL2 block 2', () => {
  it.skipIf(!haveGateway)('loads a Savage Frontier dungeon route from real GOG bytes', async () => {
    const ecl = await daxIndex('ECL2.DAX', gateway);
    const geo = await daxIndex('GEO2.DAX', gateway);
    const wd = await daxIndex('WALLDEF2.DAX', gateway);
    const tl = await daxIndex('8X8D2.DAX', gateway);
    const d = loadDungeon(ecl.get(2)!, {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    }, { label: 'Gateway GEO2#2' });

    expect(d.geoBlockId).toBe(2);
    expect(d.pieces.operands).toEqual([3, 3, 3]);
    expect(d.pieces.setBlockIds).toEqual([3, 3, 3]);
    expect(d.map.width).toBe(16);
    expect(d.map.height).toBe(16);
    for (let ws = 0; ws < 3; ws++) expect(d.walls.walldefBlocks[ws], `wallset ${ws}`).not.toBeNull();
    for (let set = 1; set <= 3; set++) expect(d.walls.tileSets[set]?.tiles.length, `8X8D set ${set}`).toBe(70);
  });
});
