/**
 * loadGame smoke test — runs the whole-game loader on the DQK DOS manifest with a
 * Node `fs` fetcher and asserts it returns multiple categories with decoded
 * frames. Skips cleanly if the game files (or manifest) are absent so a fresh
 * clone still runs green.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame, type GameManifest, type FetchBytes } from '../src/index.js';

// Monorepo layout: this file is packages/engine/test/loadgame.test.ts
//   here       = packages/engine/test
//   engineRoot = packages/engine
//   repoRoot   = packages/engine/../../.. = repo root
// The per-game manifests live in the web app package (apps/web/games/).
const here = fileURLToPath(new URL('.', import.meta.url));
const engineRoot = resolve(here, '..');
const repoRoot = resolve(engineRoot, '..', '..');
const manifestPath = resolve(repoRoot, 'apps', 'web', 'games', 'dark-queen-dos.json');

// A repo-root-relative fs fetcher mirroring the browser /@fs fetcher.
const fsFetch: FetchBytes = async (path: string): Promise<Uint8Array> => {
  const abs = resolve(repoRoot, path);
  return new Uint8Array(await readFile(abs));
};

describe('loadGame (DQK DOS manifest, fs fetcher)', () => {
  it('assembles multiple categories with decoded frames', async () => {
    if (!existsSync(manifestPath)) {
      console.warn(`skip: manifest missing at ${manifestPath}`);
      return;
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as GameManifest;

    // Sanity-skip if the referenced game files aren't present in this checkout.
    const firstGfx = manifest.files.find((f) => f.decode !== false);
    if (!firstGfx || !existsSync(resolve(repoRoot, firstGfx.path))) {
      console.warn('skip: DQK game files not present');
      return;
    }

    const game = await loadGame(manifest, fsFetch);

    expect(game.id).toBe('dark-queen-dos');
    expect(game.title).toBe('The Dark Queen of Krynn');

    // Multiple categories present.
    expect(game.categories.length).toBeGreaterThan(3);

    // Multiple categories actually have decoded frames.
    const withFrames = game.categories.filter((c) => c.frameCount > 0);
    expect(withFrames.length).toBeGreaterThan(2);

    // Total decoded frames is large (HLIB libraries hold many images).
    expect(game.totalFrames).toBeGreaterThan(100);

    // Title category specifically decoded something.
    const title = game.categories.find((c) => c.category === 'title');
    expect(title?.frameCount ?? 0).toBeGreaterThan(0);

    // Data category files are present but skipped (decode:false).
    const data = game.categories.find((c) => c.category === 'data');
    expect(data?.frameCount).toBe(0);
    expect((data?.files.length ?? 0)).toBeGreaterThan(0);
  });
});
