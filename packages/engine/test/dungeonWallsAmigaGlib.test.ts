/**
 * M9.S5 — R5 (round 29): the GLIB/DataLib-era counterpart of `dungeonWallsAmiga.test.ts` /
 * `dungeonWallsAmigaDok.test.ts`. Those two pin `wallArtProvenance` for the `.DAA`-era titles
 * (CoK/DoK); this file reproduces the SAME `wallArtProvenance` measurement for the two GLIB
 * routes the twenty-eighth handoff entry named as the mixed-provenance browser exemplar: Pools
 * of Darkness's `?explore=pools` (ECL1 block 18) and Gateway's `?explore=gateway-amiga`
 * (ECL2 block 2).
 *
 * It reproduces `apps/web/src/ui/explore.ts`'s ACTUAL production data flow byte-for-byte
 * (`sources.tileBlock` sourced from `tilesPath` alone — `framePath` is merged into `tlIdx` for
 * font/moon/frame extraction only, never into the wall-geometry `tileBlock` source; see
 * `explore.ts:6183-6193`), not an idealized version of it — because the actual finding here is
 * that this production omission determines what `wallArtProvenance` reports for both routes.
 *
 * MEASURED (not predicted — this REPLACES the plan's own guess, per PLAN-ROUND-29.md R5's own
 * "measurement wins" rule): boot tile sets 0/4 (8X8D block ids 202/203, `BOOT_8X8D_SET0/4` in
 * `dungeonWalls.ts`) live ONLY in each title's `framePath` archive (Pools: `8X8D0.DAX`; Gateway:
 * `8X8D1.DAX`), never in `tilesPath` (Pools: `8X8D1.DAX` id-set {1..6}; Gateway: `8X8D2.DAX`
 * id-set {3,4,5,12,16,31,36}) — confirmed by listing both archives' TOC block ids directly. So on
 * BOTH routes, `dosWalls.tileSets[0]` and `[4]` are `null` in the browser today: not "DOS-EGA
 * category, Amiga falls back to it" (the plan's prediction), but "category absent entirely" —
 * `buildDungeonWallGraphicSet` skips a `null` tileSet (`if (!ts) continue`), so `wallArtProvenance`
 * never emits a "symbol set 0"/"symbol set 4" row for either route at all.
 *
 * A second, independent divergence from the plan's prediction: Pools' `8X8D1.DAX` blocks are
 * 256-tile banks (the SAME `DungeonWalls.singleBank` packing DoK's dungeons use), so WALLDEF
 * block 1's 3 records collapse sets 1-3 into ONE "wall bricks (shared bank)" category, not three
 * "symbol set N" categories — `buildDungeonWallGraphicSet` skips the whole per-set band whenever
 * `singleBank` is set. Gateway, by contrast, genuinely has three independent per-set decodes of
 * the same WALLDEF/8X8D block 3 (no `singleBank`), so it DOES report 3 separate categories. Net
 * result for both routes: uniform coverage, not mixed — see each `it` below for the exact arrays
 * and the resulting badge text, computed from real bytes, not asserted from the doc comments in
 * `explore.ts` that motivated this file.
 *
 * Real bytes: `C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/*`,
 * `.../Gateway to the Savage Frontier/*`, and the WHDLoad-unpacked Amiga masters under
 * `D:/Games/Emulator/Amiga/WHDLoad/...` (same paths `poolsAmigaWallArt.test.ts` /
 * `gatewayAmigaWallArt.test.ts` already use). Skips (never fails) when either source tree is
 * absent — neither is vendored.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  decodeDax,
  decodeGlib,
  firstGlibPalette,
  glibIdTable,
  glibTileBanks,
  bankSwapParity,
  loadDungeon,
  loadDungeonWalls,
  buildDungeonWallGraphicSet,
  createGraphicSetManager,
  wallArtProvenance,
  ECL_GEN1_SHORT_POOLS,
  ECL_GEN1_SHORT_GATEWAY,
  type DungeonSources,
  type WallArtCategoryProvenance,
} from '../src/index.js';

const read = (p: string) => new Uint8Array(readFileSync(p));

/** Re-implements `explore.ts`'s `describeProvenance` (M9.S5) format for the report — this test
 * file does not import it (out of Phase A's scope; `apps/web` owns it), so the exact string is
 * recomputed here from the same `WallArtCategoryProvenance[]` shape it consumes. */
function describeProvenanceLike(entries: WallArtCategoryProvenance[]): string {
  if (entries.length === 0) return '';
  const bySource = new Map<string, number>();
  for (const e of entries) {
    const key = e.source === null ? 'no source' : e.source === 'mixed' ? 'mixed' : e.source;
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }
  if (bySource.size === 1) {
    const [only] = [...bySource.keys()];
    return `art: ${only} (full coverage, ${entries.length} categor${entries.length === 1 ? 'y' : 'ies'})`;
  }
  const parts = [...bySource.entries()].sort(([, a], [, b]) => b - a).map(([source, count]) => `${source} (${count})`);
  return `art: mixed — ${parts.join(', ')} of ${entries.length} categories`;
}

// ---------------------------------------------------------------------------------------------
// Pools of Darkness — ?explore=pools, ECL1 block 18 (eclInitBlock in gameData.ts)
// ---------------------------------------------------------------------------------------------
const POOLS_DOS = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const POOLS_AMIGA =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2';
const havePools = existsSync(`${POOLS_DOS}/ECL1.DAX`) && existsSync(`${POOLS_AMIGA}/8X8D.TLB`);
const maybePools = havePools ? describe : describe.skip;

maybePools('Pools of Darkness — ?explore=pools real-bytes wallArtProvenance (R5)', () => {
  it('DOS-EGA-only tile source (matching production) yields exactly ONE category, "symbol set 1"', () => {
    const wdIdx = new Map(decodeDax(read(`${POOLS_DOS}/WALLDEF1.DAX`), 'WALLDEF1.DAX').blocks.map((b) => [b.blockId, b.raw]));
    // Production `sources.tileBlock` = `tilesPath` alone (8X8D1.DAX) — `framePath` (8X8D0.DAX,
    // which is where boot blocks 202/203 actually live) is NOT merged in for wall loading.
    const tlIdx = new Map(decodeDax(read(`${POOLS_DOS}/8X8D1.DAX`), '8X8D1.DAX').blocks.map((b) => [b.blockId, b.raw]));
    const eclIdx = new Map(decodeDax(read(`${POOLS_DOS}/ECL1.DAX`), 'ECL1.DAX').blocks.map((b) => [b.blockId, b.raw]));
    const geoIdx = new Map(decodeDax(read(`${POOLS_DOS}/GEO1.DAX`), 'GEO1.DAX').blocks.map((b) => [b.blockId, b.raw]));

    const sources: DungeonSources = {
      geoBlock: (id) => geoIdx.get(id) ?? null,
      walldefBlock: (id) => wdIdx.get(id) ?? null,
      tileBlock: (id) => tlIdx.get(id) ?? null,
    };
    const dungeon = loadDungeon(eclIdx.get(18)!, sources, {
      label: 'Pools ECL1#18',
      dialect: ECL_GEN1_SHORT_POOLS,
      fallbackPieces: [1, 0xff, 0xff], // gameData.ts's own eclFallbackPieces — ECL1#18 never calls LOAD_PIECES
    });
    // Confirms the fallback actually fired (no real LOAD_PIECES on this block) and its exact value.
    expect(dungeon.pieces.setBlockIds).toEqual([1, 255, 255]);
    const dosWalls = dungeon.walls;
    // The measured absence: boot sets never resolve from tilesPath alone.
    expect(dosWalls.tileSets[0], 'boot set 0 (block 203) is not in 8X8D1.DAX').toBeNull();
    expect(dosWalls.tileSets[4], 'boot set 4 (block 202) is not in 8X8D1.DAX either — it is in 8X8D0.DAX').toBeNull();
    // MEASURED (not assumed from the "symbol set 1/2/3" per-set band): 8X8D1.DAX's blocks are
    // 16818-byte 256-tile banks, the SAME single-bank packing DoK's own dungeons use — so WALLDEF
    // block 1 (its own record count k=3) fills ALL of sets 1/2/3 from `walls.singleBank`, not from
    // three independent per-set banks, even though only set 1's operand is non-RESET.
    expect(dosWalls.singleBank?.tiles.length, 'DOS single 256-tile bank').toBe(256);
    expect(dosWalls.tileSets[1]).toBe(dosWalls.singleBank);
    expect(dosWalls.tileSets[2]).toBe(dosWalls.singleBank);
    expect(dosWalls.tileSets[3]).toBe(dosWalls.singleBank);

    const amigaBytes = read(`${POOLS_AMIGA}/8X8D.TLB`);
    const banks = glibTileBanks(decodeGlib(amigaBytes, '8X8D.TLB'), glibIdTable(amigaBytes));
    // The exact bank the route actually loads (set 1 -> WALLDEF/8X8D block 1) passes bankSwapParity.
    const amigaBank1 = banks.banks.get(1)!;
    expect(bankSwapParity(dosWalls.singleBank!, amigaBank1).ok).toBe(true);

    const amigaWalls = loadDungeonWalls(dungeon.pieces.setBlockIds, {
      walldefBlock: (id) => wdIdx.get(id) ?? null,
      tileBlock: () => null, // buildGlibWallGraphics's own contract: no raw fallback, only tileSetForBlock
      tileSetForBlock: (id) => banks.banks.get(id) ?? null,
    });
    expect(amigaWalls.singleBank?.tiles.length, 'Amiga single 256-tile bank resolves too').toBe(256);

    const dosSet = buildDungeonWallGraphicSet(dosWalls, 'DOS-EGA', 'DOS EGA', { width: 320, height: 200 });
    const amigaSet = buildDungeonWallGraphicSet(amigaWalls, 'Amiga', 'Amiga (32-color)', { width: 320, height: 200, pixelAspect: 1 });
    const manager = createGraphicSetManager([dosSet, amigaSet], { active: 'Amiga' });

    const provenanceAmiga = wallArtProvenance(dosSet, manager);
    // MEASURED, not the plan's predicted 5-category "Amiga (3), DOS-EGA (2)" guess: exactly ONE
    // category exists, because (a) `buildDungeonWallGraphicSet` collapses sets 1-3 into the single
    // "wall bricks (shared bank)" band whenever `singleBank` is present (skipping the per-set band
    // entirely — `dungeonWallGraphicSet.ts:64`), and (b) boot sets 0/4 never entered `dosSet`'s key
    // space to begin with (the production tileBlock-source gap this file's header documents).
    expect(provenanceAmiga).toEqual([{ category: 'wall bricks (shared bank)', source: 'Amiga' }]);
    expect(describeProvenanceLike(provenanceAmiga)).toBe('art: Amiga (full coverage, 1 category)');

    manager.setActive('DOS-EGA');
    const provenanceDos = wallArtProvenance(dosSet, manager);
    expect(provenanceDos).toEqual([{ category: 'wall bricks (shared bank)', source: 'DOS-EGA' }]);
    expect(describeProvenanceLike(provenanceDos)).toBe('art: DOS-EGA (full coverage, 1 category)');
  });
});

// ---------------------------------------------------------------------------------------------
// Gateway to the Savage Frontier — ?explore=gateway-amiga, ECL2 block 2
// ---------------------------------------------------------------------------------------------
const GW_DOS = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const GW_AMIGA_C =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC';
const GW_AMIGA_A =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA';
const haveGateway = existsSync(`${GW_DOS}/ECL2.DAX`) && existsSync(`${GW_AMIGA_C}/Walls.tlb`);
const maybeGateway = haveGateway ? describe : describe.skip;

maybeGateway('Gateway to the Savage Frontier — ?explore=gateway-amiga real-bytes wallArtProvenance (R5)', () => {
  it('DOS-EGA-only tile source (matching production) yields exactly THREE categories, symbol sets 1-3', () => {
    const wdIdx = new Map(decodeDax(read(`${GW_DOS}/WALLDEF2.DAX`), 'WALLDEF2.DAX').blocks.map((b) => [b.blockId, b.raw]));
    // Production `sources.tileBlock` = `tilesPath` alone (8X8D2.DAX) — `framePath` (8X8D1.DAX,
    // where boot blocks 202/203 actually live) is NOT merged in for wall loading.
    const tlIdx = new Map(decodeDax(read(`${GW_DOS}/8X8D2.DAX`), '8X8D2.DAX').blocks.map((b) => [b.blockId, b.raw]));
    const eclIdx = new Map(decodeDax(read(`${GW_DOS}/ECL2.DAX`), 'ECL2.DAX').blocks.map((b) => [b.blockId, b.raw]));
    const geoIdx = new Map(decodeDax(read(`${GW_DOS}/GEO2.DAX`), 'GEO2.DAX').blocks.map((b) => [b.blockId, b.raw]));

    const sources: DungeonSources = {
      geoBlock: (id) => geoIdx.get(id) ?? null,
      walldefBlock: (id) => wdIdx.get(id) ?? null,
      tileBlock: (id) => tlIdx.get(id) ?? null,
    };
    const dungeon = loadDungeon(eclIdx.get(2)!, sources, {
      label: 'Gateway ECL2#2',
      dialect: ECL_GEN1_SHORT_GATEWAY,
    });
    // ECL2#2's own real LOAD_PIECES (#3,#3,#3) — no fallback needed, confirming the route
    // description's own claim about this block.
    expect(dungeon.pieces.setBlockIds).toEqual([3, 3, 3]);
    const dosWalls = dungeon.walls;
    expect(dosWalls.tileSets[0], 'boot set 0 (block 203) is not in 8X8D2.DAX').toBeNull();
    expect(dosWalls.tileSets[4], 'boot set 4 (block 202) is not in 8X8D2.DAX either — it is in 8X8D1.DAX').toBeNull();
    expect(dosWalls.tileSets[1]).not.toBeNull();
    expect(dosWalls.tileSets[2]).not.toBeNull();
    expect(dosWalls.tileSets[3]).not.toBeNull();

    const amigaPalette = firstGlibPalette(read(`${GW_AMIGA_A}/Always.tlb`));
    const amigaBytes = read(`${GW_AMIGA_C}/Walls.tlb`);
    const banks = glibTileBanks(decodeGlib(amigaBytes, 'Walls.tlb'), glibIdTable(amigaBytes), [], amigaPalette);
    // The one bank this route actually loads (block 3, all three sets) passes bankSwapParity —
    // documented in `gatewayAmigaWallArt.test.ts`'s own test E alongside block 15's real rejection
    // (not re-measured here to avoid loading the extra DOS archives block 15 needs).
    const amigaBank3 = banks.banks.get(3)!;
    expect(bankSwapParity(dosWalls.tileSets[1]!, amigaBank3).ok).toBe(true);

    const amigaWalls = loadDungeonWalls(dungeon.pieces.setBlockIds, {
      walldefBlock: (id) => wdIdx.get(id) ?? null,
      tileBlock: () => null,
      tileSetForBlock: (id) => banks.banks.get(id) ?? null,
    });

    const dosSet = buildDungeonWallGraphicSet(dosWalls, 'DOS-EGA', 'DOS EGA', { width: 320, height: 200 });
    const amigaSet = buildDungeonWallGraphicSet(amigaWalls, 'Amiga', 'Amiga (32-color)', { width: 320, height: 200, pixelAspect: 1 });
    const manager = createGraphicSetManager([dosSet, amigaSet], { active: 'Amiga' });

    const provenanceAmiga = wallArtProvenance(dosSet, manager);
    // MEASURED, not the plan's predicted 5-category "same shape" guess: exactly three categories,
    // all Amiga (uniform, not mixed) — because sets 1-3 all resolve from the SAME accepted bank 3,
    // and boot sets 0/4 never entered `dosSet`'s key space at all (same production gap as Pools).
    expect(provenanceAmiga).toEqual([
      { category: 'symbol set 1', source: 'Amiga' },
      { category: 'symbol set 2', source: 'Amiga' },
      { category: 'symbol set 3', source: 'Amiga' },
    ]);
    expect(describeProvenanceLike(provenanceAmiga)).toBe('art: Amiga (full coverage, 3 categories)');

    manager.setActive('DOS-EGA');
    const provenanceDos = wallArtProvenance(dosSet, manager);
    expect(provenanceDos.every((p) => p.source === 'DOS-EGA')).toBe(true);
    expect(describeProvenanceLike(provenanceDos)).toBe('art: DOS-EGA (full coverage, 3 categories)');
  });
});
