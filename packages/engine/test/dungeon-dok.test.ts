/**
 * Death Knights of Krynn dungeon load-path golden (Phase B, B1).
 *
 * DoK is a Krynn-Gen1 DAX sibling of Champions of Krynn, so it runs through the SAME
 * `loadDungeon` path — but its real bytes exposed three Gen1-format deltas the CoK-only
 * loaders had baked in as constants:
 *
 *   1. GEO header word — CoK stores the constant 1024 (plane-data size); DoK stores a
 *      different area/checksum word. The planes still sit at offset 2, so `decodeGeoBlock`
 *      now keys off the 1026-byte length, not the header value.
 *   2. WALLDEF `Pieces` sentinel 0x7F — COAB's CoK dispatch only honours it on symbol set 1
 *      (`var_3 == 0x7F → block 0`); DoK passes it on set 3 (GEO 34 pieces `[1, 0xFF, 0x7F]`).
 *      It is a sentinel, never a literal block id, so `loadDungeonWalls` honours it on any set
 *      and leaves the set empty when the default block 0 is absent (DoK ships only block 1).
 *   3. 8X8D count byte — DoK's 256-tile wall bank (8X8D1 block 1) saturates its uint8 count at
 *      0xFF; the exact framing supplies the true 256.
 *
 * This pins the load path on real DoK bytes so those deltas can't silently regress. (First-person
 * wall-tile *rendering* for DoK — routing the single 256-tile bank across the three symbol sets —
 * is a separate format-reversing task tracked under B4; this golden asserts the map + ECL + WALLDEF
 * load and that the dungeon is walkable.)
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readDaxDataBlocks,
  loadDungeon,
  decodeGeoBlock,
  hasCokGeoHeader,
  decode8x8dBlock,
  composeWallView,
  type DungeonSources,
  type WallPose,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const dok = resolve(here, '..', '..', '..', 'Death Knights of Krynn');
const have = ['ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'].every((f) => existsSync(resolve(dok, f)));

async function daxIndex(file: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(dok, file))));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe.skipIf(!have)('DoK dungeon load path (real bytes)', () => {
  it('loads GEO 34 + resolves the WALLDEF sets from ECL1 block 34', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const tl = await daxIndex('8X8D1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const d = loadDungeon(ecl.get(34)!, src, { label: 'DoK GEO1#34' });

    expect(d.geoBlockId).toBe(34);
    expect(d.map.width).toBe(16);
    expect(d.map.height).toBe(16);
    expect(d.map.cells.length).toBe(256);
    // DoK passes the 0x7F default-set sentinel on set 3 — it must resolve, not throw.
    expect(d.pieces.setBlockIds).toEqual([1, 0xff, 0x7f]);
    // At least one cell has a wall edge → the map carries real geometry (walkable + collidable).
    const anyWall = d.map.cells.some((c) => c.walls.north || c.walls.east || c.walls.south || c.walls.west);
    expect(anyWall).toBe(true);
    // M36.S1 — block 34's own script PRINTCLEARs a real village-guard greeting before EXIT; this is
    // the same `vm.run()` call `loadDungeon()` already performs for loadFiles/loadPieces above, so
    // surfacing it needed no new fetch and no new opcode work (see docs/engine/research/m36-audit.md).
    expect(d.introText).toContain('WELCOME TO CEKOS');
  });

  it('decodeGeoBlock accepts DoK GEO blocks despite the non-1024 header word', async () => {
    const geo = await daxIndex('GEO1.DAX');
    const raw = geo.get(34)!;
    // DoK's header word is NOT the CoK 1024 constant…
    expect(hasCokGeoHeader(raw)).toBe(false);
    // …but the block still decodes to a full 16×16 map.
    const { map } = decodeGeoBlock(raw, 'DoK GEO34');
    expect(map.cells.length).toBe(256);
  });

  it('decodes the 256-tile 8X8D wall bank whose uint8 count saturates at 0xFF', async () => {
    const tl = await daxIndex('8X8D1.DAX');
    const bank = tl.get(1)!;
    // The stored count byte saturates at 255; the bank actually holds 256 tiles.
    expect(bank[8]).toBe(0xff);
    const set = decode8x8dBlock(bank, '8X8D1#1', { transparentMagenta: true });
    expect(set.tiles.length).toBe(256);
  });

  // B4 — first-person wall-tile routing. DoK's WALLDEF block 1 holds k=3 records and there is no
  // per-record 8X8D block (CoK's `blockId*10+i+1` packing); instead all three symbol sets share the
  // ONE 256-tile bank whose WALLDEF values are already zero-based global tile indices.
  it('routes the three symbol sets at the single 256-tile bank and renders wall tiles', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const tl = await daxIndex('8X8D1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const d = loadDungeon(ecl.get(34)!, src, { label: 'DoK GEO1#34' });

    // The single-bank packing was detected, holding the full 256-tile bank.
    expect(d.walls.singleBank).not.toBeNull();
    expect(d.walls.singleBank!.tiles.length).toBe(256);
    // WALLDEF block 1 carried k=3 records → all three symbol sets are populated from it.
    expect(d.walls.walldefBlocks.every((b) => b !== null)).toBe(true);
    // No CoK-style per-set relocation: record 2's raw first drawable value 64 remains 64.
    expect(d.walls.walldefBlocks[1]!.slices[0]![1]).toBe(64);

    // Across the map, at least one pose must now resolve real wall tiles from the bank (before B4
    // every set pointed at an absent 8X8D block, so nothing rendered).
    let resolved = 0;
    for (let i = 0; i < d.map.cells.length && resolved === 0; i++) {
      const px = i % d.map.width;
      const py = Math.floor(i / d.map.width);
      for (let facing = 0; facing < 4 && resolved === 0; facing++) {
        const pose: WallPose = { px, py, facing, eclBlockId: 34 };
        for (const blit of composeWallView(d.map, pose, d.walls.readId)) {
          if (d.walls.lookupTile(blit)) resolved++;
        }
      }
    }
    expect(resolved).toBeGreaterThan(0);
  });
});
