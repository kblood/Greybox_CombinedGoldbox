/**
 * End-to-end first-person pipeline on REAL Champions of Krynn assets (M1.S5c integration).
 *
 * Proves the whole engine data path works on real CoK bytes BEFORE the web layer wires it
 * into a canvas: run the dungeon-init ECL block → take its loadFiles/loadPieces effects →
 * load exactly the GEO + WALLDEF + 8X8D blocks they name → composeWallView → resolve the
 * resulting blits back to real decoded 8×8 tiles. Skips cleanly when game data is absent.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EclVm,
  readDaxDataBlocks,
  decodeGeoBlock,
  loadDungeonWalls,
  composeWallView,
  planWallView,
  type DungeonWallSources,
  type EclEffect,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const cok = resolve(here, '..', '..', '..', 'Champions of Krynn');
const paths = {
  ecl1: resolve(cok, 'ECL1.DAX'),
  geo1: resolve(cok, 'GEO1.DAX'),
  walldef1: resolve(cok, 'WALLDEF1.DAX'),
  tiles1: resolve(cok, '8X8D1.DAX'),
};
const haveAll = Object.values(paths).every(existsSync);

/** Index a DAX archive's DATA blocks by block id → decompressed bytes. */
async function daxIndex(path: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(path)));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe('first-person pipeline on real CoK assets (ECL1 block 34 dungeon)', () => {
  it.skipIf(!haveAll)('runs init → loads GEO/WALLDEF/8X8D → composeWallView yields real tiles', async () => {
    // 1) Run the dungeon-init ECL block 34 and collect its load effects.
    const blk34 = (await daxIndex(paths.ecl1)).get(34);
    expect(blk34, 'ECL1 must contain block 34').toBeDefined();
    const r = new EclVm(blk34!).run();
    const loadFiles = r.effects.find((e): e is Extract<EclEffect, { type: 'loadFiles' }> => e.type === 'loadFiles');
    const loadPieces = r.effects.find((e): e is Extract<EclEffect, { type: 'loadPieces' }> => e.type === 'loadPieces');
    expect(loadFiles?.geoBlockId).toBe(34);
    // Block 34 is a two-set area (it SAVEs both area flags 1 just before LOAD_PIECES), so the
    // CMD_LoadFiles dispatch keeps set 1 (block 3) and set 3 (block 23) and skips set 2 (block
    // 4, which isn't even present in WALLDEF1.DAX — only 1, 3, 23 are). Raw operands = [3,4,23].
    expect(loadPieces?.operands).toEqual([3, 4, 23]);
    expect(loadPieces?.twoSet).toBe(true);
    expect(loadPieces?.setBlockIds).toEqual([3, 0xff, 23]);

    // 2) Load exactly the blocks the ECL named.
    const geoIdx = await daxIndex(paths.geo1);
    const wdIdx = await daxIndex(paths.walldef1);
    const tlIdx = await daxIndex(paths.tiles1);

    const geoRaw = geoIdx.get(loadFiles!.geoBlockId);
    expect(geoRaw, 'GEO1 must contain the dungeon map block').toBeDefined();
    const { map } = decodeGeoBlock(geoRaw!, 'GEO1/34');

    const sources: DungeonWallSources = {
      walldefBlock: (id) => wdIdx.get(id) ?? null,
      tileBlock: (id) => tlIdx.get(id) ?? null,
    };
    const walls = loadDungeonWalls(loadPieces!.setBlockIds, sources);

    // Two-set area, but WALLDEF block 3 is a *2-record* block: although the dispatch issues no
    // separate set-2 CALL, set 1's load spills its second record into slot 2 (research §3.2),
    // pairing 8X8D blocks 31/32; set 3 ← block 23 pairs 8X8D 23. All three wallsets populate and
    // every paired 8X8D pool (31, 32, 23 — all present in 8X8D1.DAX) loads.
    for (let ws = 0; ws < 3; ws++) expect(walls.walldefBlocks[ws], `wallset ${ws}`).not.toBeNull();
    for (let set = 1; set <= 3; set++) {
      expect(walls.tileSets[set]?.tiles.length, `8X8D set ${set}`).toBeGreaterThan(0);
    }

    // 3) Find a pose that actually sees a wall, then compose the view and resolve its tiles.
    let composed: ReturnType<typeof composeWallView> = [];
    let pose = { px: 0, py: 0, facing: 0, eclBlockId: 34 };
    outer: for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        for (const facing of [0, 2, 4, 6]) {
          const p = { px: x, py: y, facing, eclBlockId: 34 };
          if (planWallView(map, p).length > 0) {
            pose = p;
            composed = composeWallView(map, p, walls.readId);
            if (composed.length > 0) break outer;
          }
        }
      }
    }

    // The dungeon has walls, so some pose produces wall-tile blits.
    expect(composed.length, 'a wall-facing pose should produce blits').toBeGreaterThan(0);

    // Every blit's pixel anchor sits inside the 168×168 EGA dungeon viewport (8,8)-(176,176).
    for (const b of composed) {
      expect(b.px).toBeGreaterThanOrEqual(8);
      expect(b.py).toBeGreaterThanOrEqual(8);
      expect(b.px).toBeLessThan(176);
      expect(b.py).toBeLessThan(176);
    }

    // The per-dungeon wall tiles route to loaded routeTileId sets (1 and 3 here; set 2 is the
    // skipped two-set slot). Every blit hitting a loaded set resolves to a real decoded 8×8.
    const dungeonBlits = composed.filter((b) => b.set >= 1 && b.set <= 3 && walls.tileSets[b.set] !== null);
    expect(dungeonBlits.length, 'wall art should route to a loaded per-dungeon set').toBeGreaterThan(0);
    for (const b of dungeonBlits) {
      const img = walls.lookupTile(b);
      expect(img, `blit set ${b.set} index ${b.index} (tileId ${b.tileId})`).not.toBeNull();
      expect(img!.width).toBe(8);
      expect(img!.height).toBe(8);
    }
  });
});
