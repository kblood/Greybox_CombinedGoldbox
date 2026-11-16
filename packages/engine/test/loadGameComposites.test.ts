/**
 * `loadGame()` must surface HLIB method-25 / GLIB method-0x19 composites, not just `images`.
 *
 * THE BUG THIS PINS (round 35 R3). `renderHlibComposite` has assembled all 16 shipped DOS
 * composites correctly since 2026-08-22, and `HlibArchive.composites` has carried the parsed
 * records since then — but the pass that turns them into frames is opt-in by design (composites
 * stay out of `archive.images` so positional member indices never shift), and exactly ONE of the
 * codebase's flattening sites had it: `apps/web/src/ui/main.ts`'s single-file asset browser.
 * `loadGame.ts` listed `archive.images` only, so every `?game=` route dropped them. This is the
 * same class of defect as `pool-amiga` reaching `nwnPreview.ts` and not `loadGame.ts` (928 of
 * 1672 frames hidden, nothing red) — smaller in frames, identical in shape.
 *
 * WHAT IS ASSERTED, AND WHY IT IS NOT CIRCULAR. The expected per-file frame count is not a
 * number typed in from a previous run of the code under test: it is
 * `decodeHlib(bytes).images.length + decodeHlib(bytes).composites.length`, recomputed here from
 * the retail bytes through the decoder, and compared against what `loadGame`'s flattening
 * produced. `framesFromDecoded` is the code under test; `decodeHlib`'s two array lengths are not.
 * A composite pass that silently stops running fails the equality AND the labelled-frame count.
 *
 * MEASURED CENSUS (this file's own numbers, from the two shipped manifests):
 *   - `dark-queen-dos`  gains 3  — all from `DISK3/FRAME.TLB`.
 *   - `forgotten-realms-unlimited-adventures` gains 9 — PICA.TLB 1, PICD.TLB 4, FRAME.TLB 4.
 * The plan predicted 3 and 13. The 13 was wrong by 4: DQK `DISK2/PICC.TLB` holds 4 composites but
 * appears in NO manifest, so those 4 are reachable only through the asset browser. 16 composites
 * exist in 5 files; 12 of them are reachable from a `?game=` route.
 *
 * External, never-vendored sources; absent => SKIP. Every arm asserts fixture presence before it
 * asserts anything about content, so a missing install can never look like a pass.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame, type GameManifest, type FetchBytes, type GameFileResult } from '../src/index.js';
import { decodeHlib } from '../src/loaders/hlib.js';
import { decodeGlib } from '../src/loaders/glib.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const fsFetch: FetchBytes = async (path: string): Promise<Uint8Array> => {
  return new Uint8Array(await readFile(resolve(repoRoot, path)));
};

function manifestPath(file: string): string {
  return resolve(repoRoot, 'apps', 'web', 'games', file);
}

function readManifest(file: string): GameManifest {
  return JSON.parse(readFileSync(manifestPath(file), 'utf8')) as GameManifest;
}

/** Every source file a manifest references, resolved the way `fsFetch` resolves it. */
function manifestSources(m: GameManifest): string[] {
  return m.files.map((f) => resolve(repoRoot, f.path));
}

function haveAll(file: string): boolean {
  if (!existsSync(manifestPath(file))) return false;
  return manifestSources(readManifest(file)).every((p) => existsSync(p));
}

const COMPOSITE_LABEL = /· composite \d+ \(method (25|0x19),/;

function rowsWithComposites(files: GameFileResult[]): { name: string; count: number }[] {
  return files
    .map((f) => ({ name: f.name, count: f.frames.filter((fr) => COMPOSITE_LABEL.test(fr.label)).length }))
    .filter((r) => r.count > 0);
}

const DQK = 'dark-queen-dos.json';
const FRUA = 'forgotten-realms-unlimited-adventures.json';
const DQK_AMIGA = 'dark-queen-amiga.json';

describe('loadGame surfaces container composites, not only `images`', () => {
  it.skipIf(!haveAll(DQK))('dark-queen-dos gains exactly 3 method-25 composite frames', async () => {
    // Fixture presence asserted before anything else in the body.
    const manifest = readManifest(DQK);
    for (const p of manifestSources(manifest)) expect(existsSync(p)).toBe(true);

    const game = await loadGame(manifest, fsFetch);
    const files = game.categories.flatMap((c) => c.files);

    const rows = rowsWithComposites(files);
    expect(rows).toEqual([{ name: 'FRAME (UI frame chrome)', count: 3 }]);

    // Independent expectation: images + composites, recomputed from the retail bytes.
    const frame = files.find((f) => f.path.endsWith('DISK3/FRAME.TLB'))!;
    expect(frame).toBeDefined();
    const arc = decodeHlib(new Uint8Array(readFileSync(resolve(repoRoot, frame.path))), 'FRAME.TLB');
    expect(arc.composites).toHaveLength(3);
    expect(frame.frames.length).toBe(arc.images.length + arc.composites.length);
  });

  it.skipIf(!haveAll(FRUA))(
    'FRUA gains exactly 9 method-25 composite frames across 3 of its files',
    async () => {
      const manifest = readManifest(FRUA);
      for (const p of manifestSources(manifest)) expect(existsSync(p)).toBe(true);

      const game = await loadGame(manifest, fsFetch);
      const files = game.categories.flatMap((c) => c.files);

      const rows = rowsWithComposites(files);
      expect(rows.reduce((n, r) => n + r.count, 0)).toBe(9);
      expect(rows.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 4, 4]);

      for (const row of rows) {
        const f = files.find((x) => x.name === row.name)!;
        const arc = decodeHlib(new Uint8Array(readFileSync(resolve(repoRoot, f.path))), f.name);
        expect(arc.composites.length).toBe(row.count);
        expect(f.frames.length).toBe(arc.images.length + arc.composites.length);
      }
    },
  );

  it.skipIf(!haveAll(DQK_AMIGA))(
    'dark-queen-amiga gains exactly 3 method-0x19 composite frames (the GLIB twin)',
    async () => {
      const manifest = readManifest(DQK_AMIGA);
      for (const p of manifestSources(manifest)) expect(existsSync(p)).toBe(true);

      const game = await loadGame(manifest, fsFetch);
      const files = game.categories.flatMap((c) => c.files);

      const rows = rowsWithComposites(files);
      expect(rows).toEqual([{ name: 'FRAME (UI frame chrome)', count: 3 }]);

      const frame = files.find((f) => f.path.endsWith('Disk3/FRAME.TLB'))!;
      const arc = decodeGlib(new Uint8Array(readFileSync(resolve(repoRoot, frame.path))), 'FRAME.TLB');
      expect(arc.composites).toHaveLength(3);
      expect(frame.frames.length).toBe(arc.images.length + arc.composites.filter((c) => c.image).length);
    },
  );

  /**
   * The 4 composites in DQK `DISK2/PICC.TLB` are real and assemble, but that file is in no
   * manifest — so wiring `loadGame` recovers 12 of the 16, not 16. Pinned so the difference
   * between "the decoder can do it" and "a route reaches it" stays visible; if PICC.TLB is ever
   * added to the manifest, this fails and the census sentence gets updated with it.
   */
  it.skipIf(!haveAll(DQK))('PICC.TLB’s 4 composites are reachable by no `?game=` route', () => {
    const picc = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK2', 'PICC.TLB');
    expect(existsSync(picc)).toBe(true);
    const arc = decodeHlib(new Uint8Array(readFileSync(picc)), 'PICC.TLB');
    expect(arc.composites).toHaveLength(4);
    const listed = readManifest(DQK).files.some((f) => f.path.endsWith('PICC.TLB'));
    expect(listed).toBe(false);
  });
});
