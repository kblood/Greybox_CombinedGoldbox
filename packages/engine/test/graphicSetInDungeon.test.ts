/**
 * M9.S1 — proves the M1.S2 GraphicSetManager/buildGraphicSet machinery already covers the
 * IN-DUNGEON categories (tile8x8, sprite), not just the title-scene categories `gswitch.ts`
 * exercises. Gap G5 (the 6-byte Amiga sub-frame codec, solved in M8) is what unblocked this —
 * `8X8D1.DAA`/`SPRIT1.DAA` decode real pixels today, so a CoK {DOS-EGA, Amiga} GraphicSet pair
 * built over the REAL manifests resolves real in-dungeon art on both sides.
 *
 * Verify-before-build (M8 precedent): a throwaway smoke check confirmed `buildGraphicSet`'s
 * existing positional (category,index) mapping already aligns these slots well enough for the
 * manager's own contract (both sets resolve some frame at the same ref; a DOS-only tail index
 * correctly falls back) — no code change was needed, only this pinning test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadGame,
  buildGraphicSet,
  createGraphicSetManager,
  type GameManifest,
  type FetchBytes,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

function loadManifest(name: string): GameManifest {
  return JSON.parse(readFileSync(resolve(repoRoot, 'apps', 'web', 'games', name), 'utf8')) as GameManifest;
}

const fetchBytes: FetchBytes = async (p: string) => new Uint8Array(readFileSync(resolve(repoRoot, p)));

const dosManifestPath = resolve(repoRoot, 'apps', 'web', 'games', 'champions-dos.json');
const amigaManifestPath = resolve(repoRoot, 'apps', 'web', 'games', 'champions-amiga.json');

function manifestFilesExist(m: GameManifest): boolean {
  return m.files.every((f) => existsSync(resolve(repoRoot, f.path)));
}

const gated = existsSync(dosManifestPath) && existsSync(amigaManifestPath);
const ready = gated && manifestFilesExist(loadManifest('champions-dos.json')) && manifestFilesExist(loadManifest('champions-amiga.json'));

describe('GraphicSetManager over real CoK in-dungeon art (M9.S1)', () => {
  it.skipIf(!ready)(
    'a real CoK {DOS-EGA, Amiga} pair resolves tile8x8 + sprite refs, switches source per category, and falls back per-frame',
    async () => {
      const dosGame = await loadGame(loadManifest('champions-dos.json'), fetchBytes);
      const amigaGame = await loadGame(loadManifest('champions-amiga.json'), fetchBytes);
      expect(dosGame.errors, 'DOS manifest loads with no file errors').toEqual([]);
      expect(amigaGame.errors, 'Amiga manifest loads with no file errors').toEqual([]);

      const dosSet = buildGraphicSet(dosGame, 'DOS-EGA', 'DOS EGA');
      const amigaSet = buildGraphicSet(amigaGame, 'Amiga', 'Amiga (32 colors)');

      const dosTiles = dosSet.frames.get('tile8x8');
      const amigaTiles = amigaSet.frames.get('tile8x8');
      const dosSprites = dosSet.frames.get('sprite');
      const amigaSprites = amigaSet.frames.get('sprite');
      // Real, decoded counts (Gap G5 unblocked): both platforms have real in-dungeon frames now,
      // not empty categories — this is the assertion that would have failed before M8's DAA
      // sub-frame port.
      expect(dosTiles?.size ?? 0, 'DOS has real tile8x8 frames').toBeGreaterThan(0);
      expect(amigaTiles?.size ?? 0, 'Amiga has real tile8x8 frames').toBeGreaterThan(0);
      expect(dosSprites?.size ?? 0, 'DOS has real sprite frames').toBeGreaterThan(0);
      expect(amigaSprites?.size ?? 0, 'Amiga has real sprite frames').toBeGreaterThan(0);

      const manager = createGraphicSetManager([dosSet, amigaSet], { active: 'DOS-EGA' });

      for (const category of ['tile8x8', 'sprite'] as const) {
        const ref = { category, index: 0 };
        // (a) both sets resolve the ref.
        expect(manager.has('DOS-EGA', ref), `DOS-EGA resolves ${category}:0`).toBe(true);
        expect(manager.has('Amiga', ref), `Amiga resolves ${category}:0`).toBe(true);

        const dosFrame = manager.resolve(ref)!;
        manager.setActive('Amiga');
        const amigaFrame = manager.resolve(ref)!;
        manager.setActive('DOS-EGA');

        expect(dosFrame, `DOS-EGA ${category}:0 resolves`).toBeTruthy();
        expect(amigaFrame, `Amiga ${category}:0 resolves`).toBeTruthy();

        // (b) the Amiga frame really comes from the Amiga decoder, not the DOS bytes re-served
        // under an Amiga label. `encoding` is the discriminator, because pixel inequality is NOT
        // one: see below.
        expect(amigaFrame.encoding, `Amiga ${category}:0 is decoded from DAA`).toMatch(/^daa-/);
        expect(dosFrame.encoding, `DOS ${category}:0 is decoded from DAX`).not.toMatch(/^daa-/);
        expect(amigaFrame).not.toBe(dosFrame);

        // (b2) whether the two platforms' pixels differ is a per-category FACT, not a proxy for
        // (b). CoK's 8×8 chrome is the same 16-colour EGA art on both platforms — `daa-format.md`
        // §7 and `daaTileStrip.test.ts` pin block 202 at IoU 1.0, 0 differing pixels — while the
        // sprites are where Amiga's 32-colour advantage actually lives.
        //
        // This assertion read `.not.toEqual` for BOTH categories until 2026-08-21, and passed
        // because the Amiga tile it compared against was garbage: `decodeDaa` had no tile-strip
        // routing, so it served the first byte-column of a 70-tile strip as an 8×8 picture with
        // 64 bytes of tile pixels misread as its palette. Fixing the routing made the tile match
        // DOS exactly, as the research always said it should, and turned this red. Re-pinned to
        // the verified fact rather than to whatever the new code prints.
        if (category === 'tile8x8') {
          expect(
            [...amigaFrame.indices],
            'tile8x8:0 is the SAME shared EGA chrome on both platforms',
          ).toEqual([...dosFrame.indices]);
        } else {
          expect(
            [...amigaFrame.indices],
            `${category}:0 is pixel-distinct between DOS-EGA and Amiga`,
          ).not.toEqual([...dosFrame.indices]);
        }
      }

      // (c) a ref only DOS has (past Amiga's tail) falls back to the DOS frame via the manager's
      // existing per-frame chain — no null, no throw, and it's the SAME frame DOS itself serves.
      const dosTileMax = Math.max(...(dosTiles?.keys() ?? [0]));
      const amigaTileMax = Math.max(...(amigaTiles?.keys() ?? [0]));
      expect(dosTileMax, 'DOS has more tile8x8 frames than Amiga (a real fallback case exists)').toBeGreaterThan(amigaTileMax);
      const fallbackRef = { category: 'tile8x8' as const, index: dosTileMax };
      expect(manager.has('Amiga', fallbackRef), 'Amiga genuinely lacks the tail index').toBe(false);

      manager.setActive('Amiga');
      expect(manager.resolveSet(fallbackRef), 'resolveSet reports the fallback set, not Amiga').toBe('DOS-EGA');
      const fallenBack = manager.resolve(fallbackRef);
      expect(fallenBack, 'falls back instead of returning null').toBeTruthy();
      expect([...fallenBack!.indices]).toEqual([...dosTiles!.get(dosTileMax)!.indices]);
    },
  );
});
