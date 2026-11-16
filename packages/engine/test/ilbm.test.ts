/**
 * ILBM golden-file parity test (IFF .LBM title screens, per-row interleaved planes).
 *
 * For each fixture (test/fixtures/ilbm/*.json — produced by make-fixtures.py from
 * read_lbm in tools/daa_decode.py), run the TS decodeIlbm on the SAME source .LBM
 * and assert EXACT equality of width, height, the palette-index array, AND the
 * palette-mapped RGB against the Python decoder.
 *
 * Fixtures and game data are git-ignored; absent fixture or source => SKIP.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeIlbm } from '../src/loaders/ilbm.js';
import { indexedToRGBA } from '../src/render/rgba.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'ilbm');
const REPO_ROOT = resolve(__dirname, '..', '..', '..'); // packages/engine/test/../../.. = repo root

interface Fixture {
  file: string;
  stem: string;
  width: number;
  height: number;
  palette: [number, number, number][];
  indices: number[];
  rgb: number[];
}

function listFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
}

const fixtures = listFixtures();

describe('ILBM golden parity (TS decodeIlbm vs Python read_lbm)', () => {
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
    const label = `${fixture.stem} (${fixture.width}x${fixture.height})`;

    if (!existsSync(srcPath)) {
      it.skip(`${label} — source LBM missing: ${fixture.file}`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${label} matches the Python decode exactly`, () => {
      const bytes = new Uint8Array(readFileSync(srcPath));
      const { image } = decodeIlbm(bytes, fixture.stem);

      expect(image.width).toBe(fixture.width);
      expect(image.height).toBe(fixture.height);
      expect(image.indices.length).toBe(fixture.width * fixture.height);

      // Exact palette-index parity.
      expect(Array.from(image.indices)).toEqual(fixture.indices);

      // Exact RGB parity against the Python frame.
      const rgba = indexedToRGBA(image);
      const px = fixture.width * fixture.height;
      let mismatch = -1;
      for (let p = 0; p < px; p++) {
        const o = p * 4;
        if (
          rgba[o] !== fixture.rgb[p * 3] ||
          rgba[o + 1] !== fixture.rgb[p * 3 + 1] ||
          rgba[o + 2] !== fixture.rgb[p * 3 + 2]
        ) {
          mismatch = p;
          break;
        }
      }
      expect(mismatch, `RGB mismatch at pixel ${mismatch}`).toBe(-1);
    });
  }
});
