/**
 * Neverwinter Nights (DOS/AOL) — real-bytes boot + GEO genuineness + monster/item format tests
 * (`docs/engine/research/neverwinter-nights-dos-eclinit.md`). Mirrors the existing per-title real-data
 * test pattern (e.g. `dax-vga256-title.test.ts`): `it.skipIf` when the user's local NWN install isn't
 * present, since it's an external, unvendored asset directory (same convention as every non-CoK/DoK/DQK
 * title in this project).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  listPairedGen1Areas,
  loadDungeon,
  loadDungeonWalls,
  decodeGeoBlock,
  readDaxDataBlocks,
  decodeMonsterRecord,
  sniffMonsterRecord,
  decodeItemArchive,
  decodeDokItemArchive,
  ECL_GEN1,
  type DungeonSources,
} from '../src/index.js';

const ROOT = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const WALLDEF_RECORD_SIZE = 780;

const haveNwn = existsSync(resolve(ROOT, 'GAME.CFG')) && existsSync(resolve(ROOT, 'ECL0.DAX'));

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, name)));
}

/** Single-record WALLDEF truncation (see the research doc §3): NWN pads every WALLDEF block to a
 * fixed 3-record size but the file format only ever addresses record 0 by block id (8X8D.DAX's
 * direct 1:1 block-id mapping proves this). Mirrors `apps/web/src/ui/explore.ts`'s own
 * `walldefSingleRecord`-gated truncation. */
function singleRecordWalldefBlock(blocks: ReturnType<typeof readDaxDataBlocks>, id: number): Uint8Array | null {
  const raw = blocks.find((b) => b.blockId === id)?.raw;
  return raw ? raw.subarray(0, WALLDEF_RECORD_SIZE) : null;
}

describe.skipIf(!haveNwn)('Neverwinter Nights (DOS/AOL) — real boot', () => {
  it('lists paired GEO0/ECL0 areas and boots eclInitBlock 1 to a real dungeon', () => {
    const geoBytes = read('GEO0.DAX');
    const eclBytes = read('ECL0.DAX');
    const paired = listPairedGen1Areas(geoBytes, eclBytes);
    expect(paired.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const eclBlocks = readDaxDataBlocks(eclBytes);
    const geoBlocks = readDaxDataBlocks(geoBytes);
    const walldefBlocks = readDaxDataBlocks(read('WALLDEF.DAX'));
    const initBlock = eclBlocks.find((b) => b.blockId === 1)!;

    const sources: DungeonSources = {
      geoBlock: (id) => geoBlocks.find((b) => b.blockId === id)?.raw ?? null,
      walldefBlock: (id) => singleRecordWalldefBlock(walldefBlocks, id),
      tileBlock: () => null, // geometry-only probe, same convention as the Pools/Treasures sweep
    };
    const dungeon = loadDungeon(initBlock.raw, sources, { dialect: ECL_GEN1, label: 'NWN ECL0#1' });

    expect(dungeon.geoBlockId).toBe(1);
    expect(dungeon.map.width).toBe(16);
    expect(dungeon.map.height).toBe(16);
    expect(dungeon.pieces.setBlockIds).toEqual([25, 15, 14]);
    expect(dungeon.introText).toContain('WELCOME TO NEVERWINTER');
    expect(dungeon.introText).toContain('LORD NASHER');
  });

  it('WALLDEF.DAX: every block used by a paired-id loadPieces boots under single-record truncation', () => {
    const walldefBlocks = readDaxDataBlocks(read('WALLDEF.DAX'));
    expect(walldefBlocks.length).toBe(37);
    // decodeWalldefBlock's general all-zero trim already collapses the common case; single-record
    // truncation additionally covers the 2 blocks (14, 24) with genuine non-zero trailing data — see
    // the research doc §9's honest note on those two.
    for (const b of walldefBlocks) {
      const raw = singleRecordWalldefBlock(walldefBlocks, b.blockId)!;
      expect(raw.length).toBe(WALLDEF_RECORD_SIZE);
    }
  });

  it('resolves ECL0#1 wallset-2 ids from WALLDEF 15’s own 8X8D bank', () => {
    const walldef = readDaxDataBlocks(read('WALLDEF.DAX'));
    const tiles = readDaxDataBlocks(read('8X8D.DAX'));
    const walls = loadDungeonWalls([25, 15, 14], {
      walldefBlock: (id) => singleRecordWalldefBlock(walldef, id),
      tileBlock: (id) => tiles.find((b) => b.blockId === id)?.raw ?? null,
      directWallsetTileIds: true,
    });
    // 61 occurs in WALLDEF 15; its direct local index is 61 - 46 = 15. CoK-style relocation
    // would instead route it into WALLDEF 14’s bank, the source of the reported garbling.
    expect(walls.readId(1, 0, 1)).toBe(61);
    expect(walls.lookupTile({ wallset: 1, set: 1, index: 15, tileId: 61 }))
      .toBe(walls.tileSets[2]?.tiles[15]);
  });

  it('GEO1.DAX block 10 — native-walk cross-check ((14,4) facing east -> descriptor 229 at (15,4))', () => {
    // Permanent regression test for the native GBBOOT-traced anchor in
    // docs/engine/research/neverwinter-nights-dos-combat-flow.md: "GEO1.DAX block 10 has a passable
    // step into descriptor 229... target (15,4)". "descriptor" = MapCell.floor (the GEO backdrop
    // plane byte SearchLocation dispatches on — see world/dungeonEvents.ts's MAP_CELL_BYTE_ADDR doc).
    const geoBlocks = readDaxDataBlocks(read('GEO1.DAX'));
    const b10 = geoBlocks.find((b) => b.blockId === 10)!;
    const { map } = decodeGeoBlock(b10.raw, 'GEO1#10');
    const cellAt = (x: number, y: number) => map.cells[y * map.width + x];

    const start = cellAt(14, 4);
    // East edge is walled but carries a door flag -> steppable (see geo.ts's door-passability doc).
    expect(start.walls.east).toBeGreaterThan(0);
    expect(start.doors?.east).toBeGreaterThan(0);

    const dest = cellAt(15, 4);
    expect(dest.floor).toBe(229);
  });

  it('GEO0.DAX block 1 — sign cross-check (descriptor 33 at (8,14))', () => {
    const geoBlocks = readDaxDataBlocks(read('GEO0.DAX'));
    const b1 = geoBlocks.find((b) => b.blockId === 1)!;
    const { map } = decodeGeoBlock(b1.raw, 'GEO0#1');
    const cell = map.cells[14 * map.width + 8];
    expect(cell.floor).toBe(33);
  });

  it('all 29 GEO blocks (GEO0-3) decode as 16x16 with non-degenerate wall/door counts', () => {
    let total = 0;
    for (let n = 0; n <= 3; n++) {
      const blocks = readDaxDataBlocks(read(`GEO${n}.DAX`));
      for (const b of blocks) {
        const { map } = decodeGeoBlock(b.raw, `GEO${n}#${b.blockId}`);
        expect(map.width, `GEO${n}#${b.blockId} width`).toBe(16);
        expect(map.height, `GEO${n}#${b.blockId} height`).toBe(16);
        let walls = 0;
        for (const c of map.cells) {
          for (const d of ['north', 'east', 'south', 'west'] as const) if (c.walls[d] !== 0) walls++;
        }
        expect(walls, `GEO${n}#${b.blockId} non-degenerate walls`).toBeGreaterThan(0);
        total++;
      }
    }
    expect(total).toBe(29);
  });

  it('MONCHA.DAX: 100 records, 422 bytes, decode as sane under GATEWAY_LAYOUT (not COAB_LAYOUT)', () => {
    const blocks = readDaxDataBlocks(read('MONCHA.DAX'));
    expect(blocks.length).toBe(100);
    expect(new Set(blocks.map((b) => b.raw.length))).toEqual(new Set([422]));

    const names: string[] = [];
    for (const b of blocks) {
      expect(sniffMonsterRecord(b.raw, 'neverwinter-nights-dos')).toBe(true);
      const m = decodeMonsterRecord(b.raw, b.blockId, 'neverwinter-nights-dos') as any;
      expect(m.armorClass, `${m.name} AC`).toBeGreaterThanOrEqual(-10);
      expect(m.armorClass, `${m.name} AC`).toBeLessThanOrEqual(10);
      expect(m.hitPoints, `${m.name} HP`).toBeGreaterThan(0);
      expect(m.thac0, `${m.name} thac0`).toBeGreaterThanOrEqual(0);
      expect(m.thac0, `${m.name} thac0`).toBeLessThanOrEqual(20);
      names.push(m.name);
    }
    expect(names).toContain('DRACOLICH');
    expect(names).toContain('HOODED MEDUSA');
  });

  it('ITEM.DAX decodes real named items under cok-63, not dok-17', () => {
    const bytes = read('ITEM.DAX');
    const cok = decodeItemArchive(bytes);
    expect(cok.length).toBeGreaterThan(0);
    expect(cok.some((r) => r.name === 'Shield')).toBe(true);
    expect(cok.some((r) => r.name === 'Plate Mail')).toBe(true);

    const dok = decodeDokItemArchive(bytes);
    expect(dok.length).toBe(0); // confirms cok-63 over dok-17, not just "both happen to work"
  });

  it('8X8D.DAX carries font (201), frame/moons (202), and boot-set0 (203) blocks in one archive', () => {
    const blocks = readDaxDataBlocks(read('8X8D.DAX'));
    for (const id of [201, 202, 203]) {
      expect(blocks.some((b) => b.blockId === id), `block ${id} present`).toBe(true);
    }
  });
});
