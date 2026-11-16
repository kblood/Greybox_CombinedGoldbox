/**
 * DAX golden-file parity test.
 *
 * For each fixture (test/fixtures/dax/*.json — produced by make-fixtures.py from
 * the verified Python decoder), run the TS decodeDax on the SAME source .DAX
 * file, find the same blockId, and assert EXACT equality of width, height, the
 * palette index array, and the palette-mapped RGBA. This proves the TS port is
 * byte-for-byte identical to the Python oracle on the solved subset.
 *
 * Fixtures and game data are git-ignored. If a fixture file (or its source .DAX)
 * is absent, the test SKIPS with a clear message so a fresh clone without game
 * data still runs green.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeDax } from '../src/loaders/dax.js';
import { indexedToRGBA } from '../src/render/rgba.js';
import { makeEgaPalette } from '../src/render/palette.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'dax');
const REPO_ROOT = resolve(__dirname, '..', '..', '..'); // packages/engine/test/../../.. = repo root

interface Fixture {
  file: string; // path relative to repo root, e.g. "Champions of Krynn/BIGPIC1.DAX"
  stem: string;
  blockId: number;
  width: number;
  height: number;
  palette: [number, number, number][];
  indices: number[];
}

function listFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
}

const fixtures = listFixtures();

describe('DAX golden parity (TS decodeDax vs Python dax_decode)', () => {
  if (fixtures.length === 0) {
    it.skip('no fixtures present — run `python test/make-fixtures.py` (needs game data)', () => {
      /* skipped */
    });
    return;
  }

  for (const fname of fixtures) {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURE_DIR, fname), 'utf8'),
    ) as Fixture;
    const srcPath = join(REPO_ROOT, fixture.file);

    const label = `${fixture.stem} block ${fixture.blockId} (${fixture.width}x${fixture.height})`;

    if (!existsSync(srcPath)) {
      it.skip(`${label} — source DAX missing: ${fixture.file}`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${label} matches the Python decode exactly`, () => {
      const bytes = new Uint8Array(readFileSync(srcPath));
      const archive = decodeDax(bytes, fixture.stem);
      const image = archive.frameSet.frames.get(fixture.blockId);

      expect(image, `block ${fixture.blockId} should decode to an image`).toBeDefined();
      if (!image) return;

      // Geometry
      expect(image.width).toBe(fixture.width);
      expect(image.height).toBe(fixture.height);
      expect(image.indices.length).toBe(fixture.width * fixture.height);

      // Exact palette-index parity
      const got = Array.from(image.indices);
      expect(got).toEqual(fixture.indices);

      // Palette-mapped RGBA parity (render half of the golden anchor).
      // Build expected RGBA from the fixture's palette + indices.
      const ega = makeEgaPalette();
      const rgba = indexedToRGBA(image, ega);
      const px = fixture.width * fixture.height;
      expect(rgba.length).toBe(px * 4);

      let mismatch = -1;
      for (let p = 0; p < px; p++) {
        const idx = fixture.indices[p];
        const [r, g, b] = fixture.palette[idx];
        const o = p * 4;
        if (
          rgba[o] !== r ||
          rgba[o + 1] !== g ||
          rgba[o + 2] !== b ||
          rgba[o + 3] !== 255
        ) {
          mismatch = p;
          break;
        }
      }
      expect(mismatch, `RGBA mismatch at pixel ${mismatch}`).toBe(-1);
    });
  }
});
