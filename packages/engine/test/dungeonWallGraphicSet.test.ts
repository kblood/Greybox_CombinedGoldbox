/**
 * M9.S2 — proves the `GraphicSetManager`-backed wall lookup (`dungeonWallGraphicSet.ts`) is
 * TRANSPARENT when the active set is `DOS-EGA`: every existing `renderWallViewIndexed` caller
 * keeps producing byte-identical framebuffers once its `WallTileLookup` is swapped from the
 * direct `DungeonWalls` object to `resolveWallTileLookup(manager, walls)`. Real CoK-DOS bytes,
 * same dungeon-init setup `firstperson-integration.test.ts` uses (ECL1 block 34).
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
  loadDungeon,
  composeWallView,
  planWallView,
  renderWallViewIndexed,
  buildDungeonWallGraphicSet,
  resolveWallTileLookup,
  createGraphicSetManager,
  wallArtProvenance,
  type DungeonWallSources,
  type DungeonSources,
  type EclEffect,
  type WallPose,
  type GraphicSet,
  type IndexedImage,
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

const dok = resolve(here, '..', '..', '..', 'Death Knights of Krynn');
const haveDok = ['ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'].every((f) => existsSync(resolve(dok, f)));

async function daxIndex(path: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(path)));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

async function daxIndexIn(dir: string, file: string): Promise<Map<number, Uint8Array>> {
  return daxIndex(resolve(dir, file));
}

describe('GraphicSetManager-backed wall lookup is DOS-EGA-transparent (M9.S2)', () => {
  it.skipIf(!haveAll)('renderWallViewIndexed produces a byte-identical framebuffer through the resolve seam', async () => {
    const blk34 = (await daxIndex(paths.ecl1)).get(34)!;
    const r = new EclVm(blk34).run();
    const loadFiles = r.effects.find((e): e is Extract<EclEffect, { type: 'loadFiles' }> => e.type === 'loadFiles')!;
    const loadPieces = r.effects.find((e): e is Extract<EclEffect, { type: 'loadPieces' }> => e.type === 'loadPieces')!;

    const geoIdx = await daxIndex(paths.geo1);
    const wdIdx = await daxIndex(paths.walldef1);
    const tlIdx = await daxIndex(paths.tiles1);
    const { map } = decodeGeoBlock(geoIdx.get(loadFiles.geoBlockId)!, 'GEO1/34');

    const sources: DungeonWallSources = {
      walldefBlock: (id) => wdIdx.get(id) ?? null,
      tileBlock: (id) => tlIdx.get(id) ?? null,
    };
    const walls = loadDungeonWalls(loadPieces.setBlockIds, sources);

    // Build the DOS-EGA GraphicSet straight from this SAME loaded dungeon and a manager over it.
    const dosSet = buildDungeonWallGraphicSet(walls, 'DOS-EGA', 'DOS EGA', { width: 320, height: 200 });
    const manager = createGraphicSetManager([dosSet], { active: 'DOS-EGA' });
    const resolveBacked = resolveWallTileLookup(manager, walls);

    // Sanity: the resolve-backed lookup must resolve every real blit the direct lookup does, to
    // the exact same image object's bytes — not just "some frame".
    let posesChecked = 0;
    let blitsCompared = 0;
    outer: for (let y = 0; y < 16 && posesChecked < 6; y++) {
      for (let x = 0; x < 16 && posesChecked < 6; x++) {
        for (const facing of [0, 2, 4, 6]) {
          const pose = { px: x, py: y, facing, eclBlockId: 34 };
          if (planWallView(map, pose).length === 0) continue;
          const composed = composeWallView(map, pose, walls.readId);
          if (composed.length === 0) continue;
          posesChecked++;

          for (const blit of composed) {
            const direct = walls.lookupTile(blit);
            const viaManager = resolveBacked.lookupTile(blit);
            if (direct === null) {
              expect(viaManager, `blit set ${blit.set} index ${blit.index}`).toBeNull();
            } else {
              expect(viaManager, `blit set ${blit.set} index ${blit.index}`).not.toBeNull();
              expect([...viaManager!.indices]).toEqual([...direct.indices]);
              blitsCompared++;
            }
          }

          // The literal Done-bar assertion: the FULL rendered framebuffer, byte-identical.
          const direct = renderWallViewIndexed(map, pose, walls);
          const viaManager = renderWallViewIndexed(map, pose, resolveBacked);
          expect(viaManager.width).toBe(direct.width);
          expect(viaManager.height).toBe(direct.height);
          expect([...viaManager.indices]).toEqual([...direct.indices]);

          if (posesChecked >= 6) break outer;
        }
      }
    }

    expect(posesChecked, 'at least one wall-facing pose was exercised').toBeGreaterThan(0);
    expect(blitsCompared, 'at least one real tile blit was compared').toBeGreaterThan(0);
  });

  it.skipIf(!haveDok)('covers the DoK single-bank path too — same byte-identical framebuffer proof', async () => {
    const ecl = await daxIndexIn(dok, 'ECL1.DAX');
    const geo = await daxIndexIn(dok, 'GEO1.DAX');
    const wd = await daxIndexIn(dok, 'WALLDEF1.DAX');
    const tl = await daxIndexIn(dok, '8X8D1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const d = loadDungeon(ecl.get(34)!, src, { label: 'DoK GEO1#34' });
    // This dungeon must exercise the shared-256-tile-bank path (dungeonWallGraphicSet.ts's other
    // branch) — DUNGEON-DOK's own golden already pins this; re-confirm it here so a future change
    // that breaks the precondition fails loudly instead of silently testing the trivial branch.
    expect(d.walls.singleBank).not.toBeNull();

    const dosSet = buildDungeonWallGraphicSet(d.walls, 'DOS-EGA', 'DOS EGA', { width: 320, height: 200 });
    const manager = createGraphicSetManager([dosSet], { active: 'DOS-EGA' });
    const resolveBacked = resolveWallTileLookup(manager, d.walls);

    let posesChecked = 0;
    let blitsCompared = 0;
    outer: for (let i = 0; i < d.map.cells.length && posesChecked < 6; i++) {
      const px = i % d.map.width;
      const py = Math.floor(i / d.map.width);
      for (let facing = 0; facing < 4; facing++) {
        const pose: WallPose = { px, py, facing, eclBlockId: 34 };
        const composed = composeWallView(d.map, pose, d.walls.readId);
        if (composed.length === 0) continue;
        posesChecked++;

        for (const blit of composed) {
          const direct = d.walls.lookupTile(blit);
          const viaManager = resolveBacked.lookupTile(blit);
          if (direct === null) {
            expect(viaManager).toBeNull();
          } else {
            expect(viaManager).not.toBeNull();
            expect([...viaManager!.indices]).toEqual([...direct.indices]);
            blitsCompared++;
          }
        }

        const direct = renderWallViewIndexed(d.map, pose, d.walls);
        const viaManager = renderWallViewIndexed(d.map, pose, resolveBacked);
        expect([...viaManager.indices]).toEqual([...direct.indices]);

        if (posesChecked >= 6) break outer;
      }
    }

    expect(posesChecked, 'at least one wall-facing pose was exercised').toBeGreaterThan(0);
    expect(blitsCompared, 'at least one single-bank tile blit was compared').toBeGreaterThan(0);
  });
});

/**
 * M9.S5 — R5 (round 29): pins BOTH `wallArtProvenance` "mixed" semantics with synthetic,
 * no-real-bytes GraphicSets, falsifying the twenty-eighth handoff entry's claim that this
 * file has no `'mixed'` case (it previously had none at all — see PLAN-ROUND-29.md R5).
 *
 * There are two distinct "mixed" meanings and this describe pins both:
 *   - WITHIN-category `source: 'mixed'` (`dungeonWallGraphicSet.ts:130`): different tiles in the
 *     SAME category resolve to different sets — a genuine partial fallback inside one category.
 *   - CROSS-category mixed (the browser badge, `explore.ts`'s `describeProvenance`): different
 *     CATEGORIES resolve to different (but each internally uniform) sets. This engine test does
 *     not import `describeProvenance` (that file is out of Phase A's scope) — it pins the
 *     `WallArtCategoryProvenance[]` array `describeProvenance` would consume instead.
 */
function stubTile(): IndexedImage {
  return {
    width: 8,
    height: 8,
    indices: new Uint8Array(64),
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: null,
  };
}

/** Build a minimal `GraphicSet` with `tile8x8` frames at exactly the given ref keys. */
function stubWallSet(id: string, label: string, keys: number[]): GraphicSet {
  const tile8x8 = new Map<number, IndexedImage>();
  for (const key of keys) tile8x8.set(key, stubTile());
  return { id, label, display: { width: 320, height: 200 }, frames: new Map([['tile8x8', tile8x8]]), complete: true };
}

describe('wallArtProvenance: both "mixed" semantics, pinned with synthetic GraphicSets (M9.S5, R5)', () => {
  it('(a) within-category mixed: a richer set covering HALF a category reports that category "mixed", others by their real single source', () => {
    // Base ("DOS-EGA"): category "symbol set 1" has TWO keys (1000, 1001); category "symbol set 2"
    // has ONE key (2000). Authoritative key space per wallArtProvenance's own contract.
    const base = stubWallSet('DOS-EGA', 'DOS EGA', [1000, 1001, 2000]);
    // Richer ("Amiga"): covers ONLY 1000 of set 1's two keys (a genuine partial fallback), and
    // covers 2000 fully.
    const richer = stubWallSet('Amiga', 'Amiga', [1000, 2000]);
    const manager = createGraphicSetManager([base, richer], { active: 'Amiga' });

    const provenance = wallArtProvenance(base, manager);
    const set1 = provenance.find((p) => p.category === 'symbol set 1');
    const set2 = provenance.find((p) => p.category === 'symbol set 2');
    expect(set1?.source, 'partially-covered category reports mixed').toBe('mixed');
    expect(set2?.source, 'fully-covered category reports the richer set alone').toBe('Amiga');
  });

  it('(b) cross-category mixed: richer set covers categories 1..3 fully and 0/4 not at all — exact sorted array', () => {
    // Base ("DOS-EGA"): five categories, symbol sets 0..4, one key each.
    const base = stubWallSet('DOS-EGA', 'DOS EGA', [0, 1000, 2000, 3000, 4000]);
    // Richer ("Amiga"): sets 1..3 fully covered; 0 and 4 not covered at all (falls through to DOS).
    const richer = stubWallSet('Amiga', 'Amiga', [1000, 2000, 3000]);
    const manager = createGraphicSetManager([base, richer], { active: 'Amiga' });

    const provenance = wallArtProvenance(base, manager);
    // wallArtProvenance sorts categories by `category.localeCompare` — "symbol set 0" < "symbol
    // set 1" < ... lexicographically, which happens to match numeric order for single digits.
    expect(provenance).toEqual([
      { category: 'symbol set 0', source: 'DOS-EGA' },
      { category: 'symbol set 1', source: 'Amiga' },
      { category: 'symbol set 2', source: 'Amiga' },
      { category: 'symbol set 3', source: 'Amiga' },
      { category: 'symbol set 4', source: 'DOS-EGA' },
    ]);
  });

  it('(c) the null: with the base set itself active, every category reports the base set', () => {
    const base = stubWallSet('DOS-EGA', 'DOS EGA', [0, 1000, 2000, 3000, 4000]);
    const richer = stubWallSet('Amiga', 'Amiga', [1000, 2000, 3000]);
    const manager = createGraphicSetManager([base, richer], { active: 'DOS-EGA' });

    const provenance = wallArtProvenance(base, manager);
    expect(provenance.length).toBe(5);
    for (const entry of provenance) {
      expect(entry.source, `category "${entry.category}" with DOS-EGA active`).toBe('DOS-EGA');
    }
  });
});
