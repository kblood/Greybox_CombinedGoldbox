/**
 * M9.S3 — proves a real CoK Amiga-art `DungeonWalls` can be built for the SAME dungeon the DOS
 * side plays, by reusing `loadDungeonWalls`'s WALLDEF-driven relocation logic (shared game-logic
 * routing data across platforms) with only the tile PIXEL source swapped (`decodeTileBlock` hook,
 * `decodeDaaTileBlock` reading the Amiga `.DAA` 8X8D archive instead of the DOS `.DAX` one). This
 * is what backs the in-game EGA<->Amiga wall toggle (`apps/web/src/ui/explore.ts`).
 *
 * Real bytes both sides: `Champions of Krynn/{ECL1,WALLDEF1,8X8D1}.DAX` (DOS) +
 * `amiga_extracted/ChampionsOfKrynn/disk2/8X8D1.DAA` (Amiga) — same block ids (per `daa.ts`'s own
 * `DaaBlock.blockId` doc comment: "matches the DOS DAX block id for the same art"), same WALLDEF.
 *
 * **Ground-truth finding (verified here, extending `docs/engine/research/amiga-8x8d-planeorder.md`
 * beyond its original block-202-only scope): CoK's Amiga wall-tile art for this dungeon is
 * EGA-INDEX-IDENTICAL to DOS.** 1122 real per-blit comparisons across 6 sampled wall-facing poses
 * (every tile source this dungeon actually uses: boot sets 0/4 + symbol sets 1-3) found 0 pixel
 * differences. This isn't a decode bug — `amiga-8x8d-planeorder.md` already established block 202
 * (frame+moons) is byte-identical for the same reason: SSI's Amiga CoK port reused the SAME EGA-16
 * dungeon-chrome tile data wholesale and only redrew the 32-colour FULL-SCREEN art (BIGPIC/CPIC/
 * BODY — see `apps/web/src/ui/gswitch.ts`, which is why it doesn't offer a `tile8x8` category).
 * So the toggle this test's ref-key machinery backs is a genuinely correct, byte-verified
 * pointer-swap — it just has nothing to visibly swap FOR THIS dungeon's wall view. The manager/
 * seam is still real, exact, and forward-looking (a later area using `8X8D2.DAA`/`8X8D3.DAA`, or
 * DoK's own Amiga set, may differ — `docs/daa-format.md` flags disk3's `8X8D2.DAA` as unverified).
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
  decodeDaa,
  decodeDaaTileBlock,
  composeWallView,
  planWallView,
  renderWallViewIndexed,
  buildDungeonWallGraphicSet,
  resolveWallTileLookup,
  createGraphicSetManager,
  wallArtProvenance,
  type DungeonWallSources,
  type EclEffect,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const cok = resolve(here, '..', '..', '..', 'Champions of Krynn');
const amigaDir = resolve(here, '..', '..', '..', 'amiga_extracted', 'ChampionsOfKrynn', 'disk2');
const paths = {
  ecl1: resolve(cok, 'ECL1.DAX'),
  geo1: resolve(cok, 'GEO1.DAX'),
  walldef1: resolve(cok, 'WALLDEF1.DAX'),
  tiles1: resolve(cok, '8X8D1.DAX'),
  amigaTiles1: resolve(amigaDir, '8X8D1.DAA'),
};
const haveAll = Object.values(paths).every(existsSync);

async function daxIndex(path: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(path)));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe('a real Amiga-art DungeonWalls plugs into the same GraphicSetManager seam (M9.S3)', () => {
  it.skipIf(!haveAll)(
    'DOS-EGA and Amiga resolve the SAME ref keys with an exact, real-bytes-verified pointer-swap',
    async () => {
      const blk34 = (await daxIndex(paths.ecl1)).get(34)!;
      const r = new EclVm(blk34).run();
      const loadFiles = r.effects.find((e): e is Extract<EclEffect, { type: 'loadFiles' }> => e.type === 'loadFiles')!;
      const loadPieces = r.effects.find((e): e is Extract<EclEffect, { type: 'loadPieces' }> => e.type === 'loadPieces')!;

      const geoIdx = await daxIndex(paths.geo1);
      const wdIdx = await daxIndex(paths.walldef1);
      const dosTlIdx = await daxIndex(paths.tiles1);
      const { map } = decodeGeoBlock(geoIdx.get(loadFiles.geoBlockId)!, 'GEO1/34');

      const amigaArchive = decodeDaa(new Uint8Array(await readFile(paths.amigaTiles1)), '8X8D1.DAA');
      const amigaRaw = new Map(amigaArchive.blocks.map((b) => [b.blockId, b.raw]));

      const dosSources: DungeonWallSources = {
        walldefBlock: (id) => wdIdx.get(id) ?? null,
        tileBlock: (id) => dosTlIdx.get(id) ?? null,
      };
      // Amiga walls reuse the SAME WALLDEF bytes (routing is shared game data) — only the tile
      // pixel source + decoder differ.
      const amigaSources: DungeonWallSources = {
        walldefBlock: (id) => wdIdx.get(id) ?? null,
        tileBlock: (id) => amigaRaw.get(id) ?? null,
        decodeTileBlock: (raw, label) => decodeDaaTileBlock(raw, label, { transparentMagenta: true }),
      };

      const dosWalls = loadDungeonWalls(loadPieces.setBlockIds, dosSources);
      const amigaWalls = loadDungeonWalls(loadPieces.setBlockIds, amigaSources);

      // Ref-key alignment premise: same set shape, same per-set tile counts, so the SAME
      // `set*1000+index` / singleBank keys address the SAME logical tile slot on both sides.
      expect(!!amigaWalls.singleBank).toBe(!!dosWalls.singleBank);
      for (let s = 0; s <= 4; s++) {
        expect(amigaWalls.tileSets[s]?.tiles.length ?? -1, `set ${s} tile count`).toBe(
          dosWalls.tileSets[s]?.tiles.length ?? -1,
        );
      }

      const dosSet = buildDungeonWallGraphicSet(dosWalls, 'DOS-EGA', 'DOS EGA', { width: 320, height: 200 });
      const amigaSet = buildDungeonWallGraphicSet(amigaWalls, 'Amiga', 'Amiga (32-color)', {
        width: 320,
        height: 200,
        pixelAspect: 1,
      });
      const manager = createGraphicSetManager([dosSet, amigaSet], { active: 'DOS-EGA' });
      const resolveBacked = resolveWallTileLookup(manager, dosWalls);

      let posesChecked = 0;
      let totalBlits = 0;
      let distinctBlits = 0;
      outer: for (let y = 0; y < 16 && posesChecked < 6; y++) {
        for (let x = 0; x < 16 && posesChecked < 6; x++) {
          for (const facing of [0, 2, 4, 6]) {
            const pose = { px: x, py: y, facing, eclBlockId: 34 };
            if (planWallView(map, pose).length === 0) continue;
            const composed = composeWallView(map, pose, dosWalls.readId);
            if (composed.length === 0) continue;
            posesChecked++;

            // DOS-EGA active: byte-identical to the direct dosWalls lookup (M9.S2's own parity
            // guarantee still holds through this manager, live-toggle-capable or not).
            const direct = renderWallViewIndexed(map, pose, dosWalls);
            const viaDos = renderWallViewIndexed(map, pose, resolveBacked);
            expect([...viaDos.indices]).toEqual([...direct.indices]);

            for (const blit of composed) {
              const dosImg = dosWalls.lookupTile(blit);
              const amigaImg = amigaWalls.lookupTile(blit);
              if (dosImg === null) {
                expect(amigaImg).toBeNull();
                continue;
              }
              expect(amigaImg, `blit set ${blit.set} index ${blit.index}`).not.toBeNull();
              totalBlits++;
              if (![...amigaImg!.indices].every((v, i) => v === dosImg.indices[i])) distinctBlits++;
            }

            if (posesChecked >= 6) break outer;
          }
        }
      }

      expect(posesChecked, 'at least one wall-facing pose was exercised').toBeGreaterThan(0);
      expect(totalBlits, 'a real, non-trivial number of tile blits were compared').toBeGreaterThan(100);
      // The ground-truth finding (see module doc comment): CoK's Amiga wall art for this dungeon
      // is EGA-index-identical to DOS, so a real cross-check finds ZERO pixel differences — pinned
      // here so a future decode regression (accidentally producing garbage that "differs" by
      // being wrong, not by being genuinely distinct Amiga art) fails loudly.
      expect(distinctBlits, 'CoK Amiga wall tiles are byte-identical to DOS for this dungeon (ground truth)').toBe(0);

      // Switching the manager's active set is still the real runtime mechanism (a correct,
      // exact pointer-swap) even though the resolved bytes happen to be identical here.
      manager.setActive('Amiga');
      expect(manager.active).toBe('Amiga');
      manager.setActive('DOS-EGA');
      expect(manager.active).toBe('DOS-EGA');

      // M9.S5 — the honest provenance badge. With Amiga active, real ground truth for THIS
      // dungeon: every category is genuinely supplied by Amiga (no fallback) — the wall art
      // really is fully present on the Amiga side, it just happens to be byte-identical to DOS
      // (see the finding above). Pinned here so a future regression that silently drops Amiga
      // coverage for a category shows up as an unexpected 'DOS-EGA'/'mixed' entry.
      manager.setActive('Amiga');
      const provenance = wallArtProvenance(dosSet, manager);
      expect(provenance.length, 'at least one category exists for this dungeon').toBeGreaterThan(0);
      for (const entry of provenance) {
        expect(entry.source, `category "${entry.category}" fully supplied by Amiga`).toBe('Amiga');
      }
      manager.setActive('DOS-EGA');
      // Trivial but worth pinning: DOS-EGA active must report DOS-EGA everywhere (resolveSet
      // always tries the active set first).
      const dosProvenance = wallArtProvenance(dosSet, manager);
      for (const entry of dosProvenance) {
        expect(entry.source).toBe('DOS-EGA');
      }
    },
  );
});
