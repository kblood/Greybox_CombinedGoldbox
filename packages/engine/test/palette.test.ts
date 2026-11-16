/**
 * VGA palette compositing tests (Phase C, C3).
 *
 * DQK is VGA 256-colour, but each HLIB leaf only stores its own palette SLICE
 * (ALWAYS = 0–15, GEN/FRAME = 16–31, BIGPIC/overland = 32–255, …). To render the
 * real full-colour art the leaves co-resident on a screen are LAYERED into one
 * 256-entry DAC. `mergePalettes` / `compositeHlibPalette` do that layering; these
 * tests pin the merge semantics (synthetic) and prove it against the real DQK
 * BIGPIC.TLB + ALWAYS.TLB (golden — skips if the game data is absent).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mergePalettes,
  definedColorCount,
  compositeHlibPalette,
  decodeHlib,
  indexedToRGBA,
} from '../src/index.js';
import type { Palette, RGB } from '../src/index.js';

function slicePalette(first: number, count: number, fill: RGB): Palette {
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < count; i++) colors[first + i] = { ...fill };
  return { colors, source: 'hlib-range', firstColor: first, count };
}

describe('mergePalettes — synthetic', () => {
  it('layers disjoint slices into one table (UI 0–15 + picture 32–255)', () => {
    const ui = slicePalette(0, 16, { r: 10, g: 20, b: 30 });
    const pic = slicePalette(32, 224, { r: 200, g: 100, b: 50 });
    const merged = mergePalettes(ui, pic);
    expect(definedColorCount(merged)).toBe(16 + 224); // 240 slots; 16–31 stay null
    expect(merged.colors[0]).toEqual({ r: 10, g: 20, b: 30 });
    expect(merged.colors[16]).toBeNull();
    expect(merged.colors[32]).toEqual({ r: 200, g: 100, b: 50 });
    expect(merged.colors[255]).toEqual({ r: 200, g: 100, b: 50 });
  });

  it('is last-wins on overlap and a null never clobbers a defined slot', () => {
    const base = slicePalette(0, 32, { r: 1, g: 1, b: 1 });
    const over = slicePalette(0, 16, { r: 9, g: 9, b: 9 }); // only 0–15 defined
    const merged = mergePalettes(base, over);
    expect(merged.colors[0]).toEqual({ r: 9, g: 9, b: 9 }); // later wins
    expect(merged.colors[20]).toEqual({ r: 1, g: 1, b: 1 }); // over's null left base intact
    expect(definedColorCount(merged)).toBe(32);
  });

  it('concatenates colour-cycle ranges and ignores null/undefined args', () => {
    const a: Palette = { ...slicePalette(0, 4, { r: 0, g: 0, b: 0 }), cycles: [{ dir: 0, speed: 1, start: 0, count: 4 }] };
    const b: Palette = { ...slicePalette(8, 4, { r: 0, g: 0, b: 0 }), cycles: [{ dir: 1, speed: 2, start: 8, count: 4 }] };
    const merged = mergePalettes(null, a, undefined, b);
    expect(merged.cycles?.length).toBe(2);
    expect(definedColorCount(merged)).toBe(8);
  });

  it('definedColorCount handles null/empty palettes', () => {
    expect(definedColorCount(null)).toBe(0);
    expect(definedColorCount({ colors: new Array(256).fill(null), source: 'hlib-range' })).toBe(0);
  });
});

// --- Golden: real DQK BIGPIC.TLB + ALWAYS.TLB (skips if data absent) ----------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const dqk = (rel: string) => resolve(repoRoot, 'The Dark Queen of Krynn', rel);
const bigpicPath = dqk('DISK2/BIGPIC.TLB');
const alwaysPath = dqk('DISK1/ALWAYS.TLB');

describe('VGA palette compositing — golden DQK BIGPIC + ALWAYS', () => {
  const have = existsSync(bigpicPath) && existsSync(alwaysPath);
  it.skipIf(!have)('composites the overland + UI palettes and renders real 256-colour art', async () => {
    const bigpic = decodeHlib(new Uint8Array(await readFile(bigpicPath)), 'BIGPIC.TLB');
    const always = decodeHlib(new Uint8Array(await readFile(alwaysPath)), 'ALWAYS.TLB');

    // BIGPIC is a master of 3 overland pictures; each leaf carries the 32–255 slice.
    expect(bigpic.images.length).toBe(3);
    const picPal = compositeHlibPalette(bigpic);
    expect(definedColorCount(picPal)).toBe(224); // slots 32–255
    expect(picPal.colors[0]).toBeNull(); // 0–31 not owned by an overland leaf
    expect(picPal.colors[31]).toBeNull();
    expect(picPal.colors[32]).not.toBeNull();
    expect(picPal.colors[255]).not.toBeNull();

    // ALWAYS owns the UI chrome slice 0–15.
    const uiPal = compositeHlibPalette(always);
    expect(definedColorCount(uiPal)).toBe(16);
    expect(uiPal.colors[0]).not.toBeNull();
    expect(uiPal.colors[15]).not.toBeNull();

    // Layered, they reconstruct a full-colour DAC: 0–15 (UI) + 32–255 (picture) = 240 slots.
    const dac = mergePalettes(uiPal, picPal);
    expect(definedColorCount(dac)).toBe(240);
    expect(dac.colors[0]).not.toBeNull();
    expect(dac.colors[254]).not.toBeNull();

    // The first overland picture is a 304×120 method-18 image; rendered through the
    // composited DAC it must be real VGA art — many distinct colours, not a dim blob.
    const img = bigpic.images[0].image;
    expect(img.width).toBe(304);
    expect(img.height).toBe(120);
    expect(bigpic.images[0].drawMethod).toBe(18);
    const rgba = indexedToRGBA({ ...img, transparentIndex: null }, dac);
    expect(rgba.length).toBe(304 * 120 * 4);
    const distinct = new Set<number>();
    for (let i = 0; i < rgba.length; i += 4) {
      distinct.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    }
    expect(distinct.size).toBeGreaterThan(50);
  });
});
