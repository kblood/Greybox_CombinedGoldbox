/**
 * M9.S4 — DoK counterpart of `dungeonWallsAmiga.test.ts` (M9.S3's CoK finding). DoK's Amiga 8X8D
 * archive uses a DIFFERENT sub-format from CoK's (`docs/daa-format.md` §7c): not the compact
 * 4-plane tile-strip (`decodeDaaTileBlock`), but the standard 5-plane BIGPIC-style frame format,
 * one frame per block (`decodeDaaWideTileBlock`). This test pins two real-bytes findings:
 *
 * 1. **The boot/frame tile sets (0 and 4, sourced from DAX/DAA block 202/203) decode as real Amiga
 *    art and plug into the SAME `set*1000+index` ref-key band DOS uses for those sets** — a genuine
 *    live-togglable difference (unlike CoK, where the equivalent block 202 turned out byte-identical
 *    — see `amiga-8x8d-planeorder.md`). The border/compass-arrow tile range is EGA-index-identical
 *    to DOS once each side's own palette is resolved to RGB; a later tile range (this dungeon's
 *    "moon" tiles) resolves to genuinely different RGB — see `docs/engine/research/
 *    dok-8x8d-amiga-format.md` for the full tile-by-tile breakdown.
 * 2. **DoK's 256-tile single-bank wall sets (1-3) are chunked across FOUR separate Amiga block ids
 *    per bank** (base id, +20, +40, +60) — R1 (2026-09-03) SOLVES the reassembly: the natural
 *    order (`combineDokWallChunkRaws([id, id+20, id+40, id+60], ...)`), resolved through
 *    `deriveDokWallColorMap`'s boot-palette-derived colour map, reproduces DOS's 256-tile bank at
 *    >= 255/256 tiles byte-identical (measured 1786/1792 across all 7 series). **This retracts the
 *    2026-09-02 finding** ("96 hypotheses rejected", "own embedded palette all zero, no colour
 *    source"): that negative was a tool bug — `tools/dok_amiga_wallbank.py` read the DOS bank
 *    through the WRONG 8-byte tile-STRIP format instead of the 17-byte tile-ARRAY format DoK's
 *    256-tile banks actually use — not a property of the data. See
 *    `docs/engine/research/dok-8x8d-amiga-format.md` §3 for the full correction.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readDaxDataBlocks,
  loadDungeon,
  loadDungeonWalls,
  decodeDaa,
  decodeDaaWideTileBlock,
  composeWallView,
  planWallView,
  renderWallViewIndexed,
  buildDungeonWallGraphicSet,
  resolveWallTileLookup,
  createGraphicSetManager,
  wallArtProvenance,
  type DungeonSources,
  type DungeonWallSources,
} from '../src/index.js';
// R1's exports land in `index.ts` in Phase B (R2 is the sole Phase A owner of that file) — import
// straight from the loader module in the meantime, the same pattern several sibling tests use.
import { combineDokWallChunkRaws, deriveDokWallColorMap } from '../src/loaders/daa.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const dok = resolve(here, '..', '..', '..', 'Death Knights of Krynn');
const amigaDir = resolve(here, '..', '..', '..', 'amiga_extracted', 'DeathKnightsOfKrynn', 'disk1');
const paths = {
  ecl1: resolve(dok, 'ECL1.DAX'),
  geo1: resolve(dok, 'GEO1.DAX'),
  walldef1: resolve(dok, 'WALLDEF1.DAX'),
  tiles1: resolve(dok, '8X8D1.DAX'),
  amigaTiles1: resolve(amigaDir, '8x8d1.daa'),
};
const haveAll = Object.values(paths).every(existsSync);

async function daxIndex(path: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(path)));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe('DoK Amiga wall art: real content where decodable, honest DOS fallback elsewhere (M9.S4)', () => {
  it.skipIf(!haveAll)(
    'boot/frame sets get real Amiga pixels; the single-bank wall sets now resolve real Amiga pixels too (R1), never null',
    async () => {
      const ecl = await daxIndex(paths.ecl1);
      const geo = await daxIndex(paths.geo1);
      const wdIdx = await daxIndex(paths.walldef1);
      const dosTlIdx = await daxIndex(paths.tiles1);
      const dungeonSources: DungeonSources = {
        geoBlock: (id) => geo.get(id) ?? null,
        walldefBlock: (id) => wdIdx.get(id) ?? null,
        tileBlock: (id) => dosTlIdx.get(id) ?? null,
      };
      const d = loadDungeon(ecl.get(34)!, dungeonSources, { label: 'DoK GEO1#34' });
      expect(d.pieces.setBlockIds).toEqual([1, 0xff, 0x7f]);

      const amigaArchive = decodeDaa(new Uint8Array(await readFile(paths.amigaTiles1)), '8x8d1.daa');
      const amigaRaw = new Map(amigaArchive.blocks.map((b) => [b.blockId, b.raw]));

      // R1: the DOS EGA -> Amiga wall-bank colour map, derived from boot block 202's own
      // embedded palette (never the wall-bank chunks' own — all-zero — palette).
      const wallColorMap = deriveDokWallColorMap(amigaRaw.get(202)!);

      // R1: series `id` (1..7) reassembles from its 4 sparse chunks (id, +20, +40, +60) into ONE
      // synthetic 256-tile wide frame, in the natural order — memoized since `tileBlock` may be
      // called more than once per id.
      const CHUNK_OFFSETS = [0, 20, 40, 60] as const;
      const WALL_SERIES_IDS = new Set([1, 2, 3, 4, 5, 6, 7]);
      const combinedWallBankRaw = new Map<number, Uint8Array>();
      function amigaWallBankRaw(id: number): Uint8Array | null {
        if (!WALL_SERIES_IDS.has(id)) return null;
        const cached = combinedWallBankRaw.get(id);
        if (cached) return cached;
        const chunks = CHUNK_OFFSETS.map((off) => amigaRaw.get(id + off));
        if (chunks.some((c) => !c)) return null;
        const combined = combineDokWallChunkRaws(chunks as Uint8Array[], amigaRaw.get(202)!);
        combinedWallBankRaw.set(id, combined);
        return combined;
      }

      const dosSources: DungeonWallSources = {
        walldefBlock: (id) => wdIdx.get(id) ?? null,
        tileBlock: (id) => dosTlIdx.get(id) ?? null,
      };
      const amigaSources: DungeonWallSources = {
        walldefBlock: (id) => wdIdx.get(id) ?? null,
        tileBlock: (id) => amigaWallBankRaw(id) ?? amigaRaw.get(id) ?? null,
        // The wall-bank ("8X8D:bank<id>") tiles carry the DOS-13 transparency key relocated to
        // Amiga slot 16 (`deriveDokWallColorMap`); the boot/frame blocks ("8X8D:set0"/"set4")
        // are ordinary opaque frames and must NOT have that treatment applied.
        decodeTileBlock: (raw, label) =>
          label.startsWith('8X8D:bank')
            ? decodeDaaWideTileBlock(raw, label, { transparentIndex: 16 })
            : decodeDaaWideTileBlock(raw, label),
      };

      const dosWalls = loadDungeonWalls(d.pieces.setBlockIds, dosSources);
      const amigaWalls = loadDungeonWalls(d.pieces.setBlockIds, amigaSources);

      // R1: DOS resolves its 256-tile single bank, and — now that the 4-chunk reassembly is
      // wired — so does the Amiga side, from the SAME (synthesized) 256-tile bank.
      expect(dosWalls.singleBank?.tiles.length).toBe(256);
      expect(amigaWalls.singleBank?.tiles.length).toBe(256);

      // The pin this correction exists to make checkable: resolved Amiga tiles equal the DOS
      // tiles for >= 255/256 of this bank's 256 tiles, under the derived colour map — so BOTH a
      // silent regression back to the DOS fallback (amigaWalls.singleBank would be null again)
      // AND a wrong chunk order (would collapse this count to <= 128, see the research doc's
      // 24-order table) go red here, not just in the Python tool's own tests.
      let bankMatches = 0;
      for (let i = 0; i < 256; i++) {
        const dosTile = dosWalls.singleBank!.tiles[i]!.indices;
        const amigaTile = amigaWalls.singleBank!.tiles[i]!.indices;
        let ok = true;
        for (let p = 0; p < dosTile.length; p++) {
          if (wallColorMap[dosTile[p]!] !== amigaTile[p]) {
            ok = false;
            break;
          }
        }
        if (ok) bankMatches++;
      }
      expect(bankMatches, 'resolved Amiga wall-bank tiles vs DOS, under the derived colour map').toBeGreaterThanOrEqual(255);

      // Boot/frame sets (0, 4) DO decode real Amiga content. Tile counts are NOT asserted equal:
      // block 203 (set 0's source) decodes one extra Amiga tile (46 vs DOS's 45) — an unresolved
      // alignment nuance documented in the research doc, not fixed here. What matters for
      // correctness is that Amiga never has FEWER tiles than DOS (so every blit index DOS uses is
      // still in-bounds on the Amiga side — no out-of-range null).
      for (const s of [0, 4]) {
        const dosCount = dosWalls.tileSets[s]?.tiles.length ?? -1;
        const amigaCount = amigaWalls.tileSets[s]?.tiles.length ?? -1;
        expect(amigaCount, `set ${s} tile count (amiga) >= dos (${dosCount})`).toBeGreaterThanOrEqual(dosCount);
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
      let bootSetDistinct = 0;
      let bootSetTotal = 0;
      let wallBankFallbacks = 0;
      let wallBankMismatches = 0;
      const wallBankMismatchTileIds = new Set<number>();
      outer: for (let y = 0; y < 16 && posesChecked < 8; y++) {
        for (let x = 0; x < 16 && posesChecked < 8; x++) {
          for (const facing of [0, 2, 4, 6]) {
            const pose = { px: x, py: y, facing, eclBlockId: 34 };
            if (planWallView(d.map, pose).length === 0) continue;
            const composed = composeWallView(d.map, pose, dosWalls.readId);
            if (composed.length === 0) continue;
            posesChecked++;

            // DOS-EGA active: identical to the direct dosWalls lookup regardless of the manager.
            const direct = renderWallViewIndexed(d.map, pose, dosWalls);
            const viaDos = renderWallViewIndexed(d.map, pose, resolveBacked);
            expect([...viaDos.indices]).toEqual([...direct.indices]);

            // Now flip Amiga active and confirm every blit still resolves (never null/throw).
            manager.setActive('Amiga');
            const viaAmiga = renderWallViewIndexed(d.map, pose, resolveBacked);
            expect(viaAmiga.indices.length).toBe(direct.indices.length);
            manager.setActive('DOS-EGA');

            for (const blit of composed) {
              const dosImg = dosWalls.lookupTile(blit);
              if (dosImg === null) continue;
              totalBlits++;
              if (blit.set >= 1 && blit.set <= 3) {
                // Single-bank blit: query through the SAME lookup the renderer actually uses
                // (resolveWallTileLookup's internal ref math), with DOS-EGA active first as the
                // known-good baseline, then Amiga active — the case this test exists to pin.
                const resolvedImg = resolveBacked.lookupTile(blit);
                manager.setActive('Amiga');
                const amigaImg = resolveBacked.lookupTile(blit);
                manager.setActive('DOS-EGA');
                expect(amigaImg, `wall-bank blit set ${blit.set} tileId ${blit.tileId} must resolve, not null`).not.toBeNull();
                // R1: Amiga now resolves this bank for real (no longer a DOS fallback), so compare
                // through the derived colour map rather than asserting literal equality — the
                // research doc's per-series count says exactly 1/256 tiles (index 255) differs.
                let sameTile = true;
                for (let p = 0; p < resolvedImg!.indices.length; p++) {
                  if (wallColorMap[resolvedImg!.indices[p]!] !== amigaImg!.indices[p]) {
                    sameTile = false;
                    break;
                  }
                }
                if (!sameTile) {
                  wallBankMismatches++;
                  wallBankMismatchTileIds.add(blit.tileId);
                }
                wallBankFallbacks++;
              } else {
                bootSetTotal++;
                const amigaImg = amigaWalls.lookupTile(blit);
                expect(amigaImg, `boot-set blit set ${blit.set} index ${blit.index}`).not.toBeNull();
                if (!([...amigaImg!.indices].every((v, i) => v === dosImg.indices[i]))) bootSetDistinct++;
              }
            }

            if (posesChecked >= 8) break outer;
          }
        }
      }

      expect(posesChecked, 'at least one wall-facing pose was exercised').toBeGreaterThan(0);
      expect(totalBlits, 'a real, non-trivial number of tile blits were compared').toBeGreaterThan(50);
      expect(wallBankFallbacks, 'wall-bank (single-bank) blits were exercised for this dungeon').toBeGreaterThan(0);
      // The bank has exactly ONE known-discrepant global tile id (255 -- see the research doc's
      // per-series count and tools/test_dok_amiga_wallbank.py's
      // test_the_only_differing_tile_per_series_is_index_255). GEO1#34 happens to lean on that
      // exact tile heavily (it reads as a common corridor-filler pattern), so MOST sampled blits
      // can legitimately mismatch by the same tiny (1-2px) delta -- what must NOT happen is any
      // OTHER tile id joining the mismatch set, which is what a wrong chunk order or a regressed
      // colour map would actually produce (see the 24-order table: the runner-up order scores
      // 128/256, not 255/256).
      void wallBankMismatches;
      expect(
        [...wallBankMismatchTileIds].filter((id) => id !== 255),
        'no wall-bank tile OTHER than the known id-255 discrepancy may mismatch',
      ).toEqual([]);
      // Boot-set tiles get real Amiga pixels; whether they visually match DOS is a content finding,
      // not a pass/fail condition here (see module doc comment + the research doc for the tile
      // ranges that differ) — the assertion is only that they resolved to SOMETHING real.
      expect(bootSetTotal, 'boot-set (frame/moon) blits were exercised for this dungeon').toBeGreaterThan(0);
      void bootSetDistinct;

      manager.setActive('Amiga');
      expect(manager.active).toBe('Amiga');
      manager.setActive('DOS-EGA');
      expect(manager.active).toBe('DOS-EGA');

      // M9.S5 — the honest provenance badge, UPDATED for R1. DoK's boot dungeon (GEO1#34) was the
      // one real "mixed provenance" example (CoK's boot dungeon, per dungeonWallsAmiga.test.ts, is
      // already fully Amiga-covered with zero fallback) — but that mix existed only because the
      // single-bank wall-brick reassembly was a REJECTED hypothesis, and the rejection itself was
      // a tool bug (wrong DOS tile-array reading), not a property of the data — see R1 and
      // docs/engine/research/dok-8x8d-amiga-format.md §3. Now that the reassembly resolves for
      // real, this SPECIFIC dungeon reports 'Amiga' uniformly across every category: boot/frame
      // sets 0 and 4 (unchanged), and now the wall-brick bank too. The DOS-EGA fallback path
      // itself remains real and tested — via this same test's earlier `manager.setActive
      // ('DOS-EGA')` calls, and via any dungeon/game still lacking an Amiga wall-bank source —
      // just not as a "mixed" example on THIS dungeon any more.
      manager.setActive('Amiga');
      const provenance = wallArtProvenance(dosSet, manager);
      expect(provenance.length, 'at least one category exists for this dungeon').toBeGreaterThan(0);
      const bank = provenance.find((p) => p.category === 'wall bricks (shared bank)');
      expect(bank?.source, 'the single-bank wall category now resolves via Amiga (R1)').toBe('Amiga');
      const bootCategories = provenance.filter((p) => p.category.startsWith('symbol set'));
      expect(bootCategories.length, 'boot/frame categories (sets 0, 4) exist').toBeGreaterThan(0);
      for (const entry of bootCategories) {
        expect(entry.source, `category "${entry.category}" supplied by Amiga`).toBe('Amiga');
      }
      // Uniform provenance is itself the pin now: a regression to the pre-R1 tool-bug behaviour,
      // OR a wrong chunk order that collapses the bank's tile-match count, would reintroduce a
      // DOS-EGA category here.
      const sources = new Set(provenance.map((p) => p.source));
      expect(sources.has('Amiga'), 'every category is supplied by Amiga').toBe(true);
      expect(sources.has('DOS-EGA'), 'no category silently falls back to DOS any more').toBe(false);
    },
  );
});
