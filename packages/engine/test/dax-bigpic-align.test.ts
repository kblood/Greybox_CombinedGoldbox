/**
 * Regression: DOS-EGA BIGPIC frames must be horizontally ALIGNED with the Amiga DAA decode of the
 * same scene — i.e. NOT cyclically rolled.
 *
 * The DAX block header is 17 bytes (COAB `DaxBlock.cs`: height, width/8, x, y, item_count@8,
 * field_9[8]@9, pixels@17). An earlier 8-byte assumption read every frame 9 bytes early, rolling it
 * RIGHT by 18 px — the rightmost 18 columns wrapped onto the left margin (the reported "right end of
 * the image at the left end" on the live EGA↔Amiga switch). With the 17-byte header the EGA scene is
 * column-aligned with the (always-correct) Amiga DAA decode of the same block id.
 *
 * Data-dependent: skips on a clone without the game/Amiga assets.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDax } from '../src/loaders/dax.js';
import { decodeDaa } from '../src/loaders/daa.js';
import type { IndexedImage } from '../src/model/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..', '..', '..');

const CASES = [
  {
    dax: resolve(root, 'Champions of Krynn', 'BIGPIC1.DAX'),
    daa: resolve(root, 'amiga_extracted', 'ChampionsOfKrynn', 'disk2', 'BIGPIC1.DAA'),
    ids: [112, 114, 115, 121],
  },
  {
    dax: resolve(root, 'Death Knights of Krynn', 'BIGPIC1.DAX'),
    daa: resolve(root, 'amiga_extracted', 'DeathKnightsOfKrynn', 'disk1', 'BIGPIC1.DAA'),
    ids: [113], // the only block id common to the DoK DOS + Amiga BIGPIC1 containers
  },
];

/** Per-column count of background (index-0) pixels — a palette-independent shape profile. */
function bgProfile(img: IndexedImage): number[] {
  const { width, height, indices } = img;
  const p = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (indices[y * width + x] === 0) p[x]++;
  return p;
}

/** Best cyclic horizontal shift (|k|≤40) aligning EGA onto Amiga by column profile. */
function bestRoll(ega: IndexedImage, ami: IndexedImage): number {
  const w = ega.width;
  const e = bgProfile(ega);
  const a = bgProfile(ami);
  let best = 0;
  let bestErr = Infinity;
  for (let k = -40; k <= 40; k++) {
    let err = 0;
    for (let x = 0; x < w; x++) {
      const d = e[x] - a[((x + k) % w + w) % w];
      err += d * d;
    }
    if (err < bestErr) { bestErr = err; best = k; }
  }
  return best;
}

describe('DAX BIGPIC EGA↔Amiga horizontal alignment (no 18px roll)', () => {
  for (const c of CASES) {
    const present = existsSync(c.dax) && existsSync(c.daa);
    it.skipIf(!present)(`${c.dax.split(/[\\/]/).slice(-2).join('/')} is column-aligned with the Amiga decode`, () => {
      const dax = decodeDax(new Uint8Array(readFileSync(c.dax)), 'BIGPIC1.DAX');
      const daa = decodeDaa(new Uint8Array(readFileSync(c.daa)), 'BIGPIC1.DAA');
      for (const id of c.ids) {
        const ega = dax.frameSet.frames.get(id);
        const ami = daa.frameSet.frames.get(id);
        expect(ega, `EGA block ${id}`).toBeDefined();
        expect(ami, `Amiga block ${id}`).toBeDefined();
        if (!ega || !ami) continue;
        expect(ega.width).toBe(ami.width);
        // The fix: alignment shift is 0 (was -18 under the 8-byte-header bug).
        expect(bestRoll(ega, ami), `block ${id} EGA↔Amiga roll`).toBe(0);
      }
    });
  }
});
