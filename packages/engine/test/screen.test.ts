/**
 * Indexed framebuffer substrate tests (the exact-screen compositor's foundation).
 * Covers allocation, tile/pixel blit with transparency + clipping, rect fill, and the
 * single palette→RGBA resolution step.
 */
import { describe, it, expect } from 'vitest';
import {
  createFramebuffer,
  blitIndexed,
  blitIndexedScaledClipped,
  blitTile,
  fillRectIndexed,
  framebufferToRGBA,
} from '../src/render/screen.js';
import { makeEgaPalette } from '../src/render/palette.js';
import type { IndexedImage } from '../src/model/index.js';

/** A tiny IndexedImage from a 2D index grid. */
function img(grid: number[][], transparentIndex: number | null = null): IndexedImage {
  const height = grid.length;
  const width = grid[0].length;
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) indices[y * width + x] = grid[y][x];
  return { width, height, indices, xOffset: 0, yOffset: 0, transparentIndex, palette: null };
}

describe('IndexedFramebuffer', () => {
  it('allocates filled with the given index', () => {
    const fb = createFramebuffer(4, 3, 7);
    expect(fb.width).toBe(4);
    expect(fb.height).toBe(3);
    expect(fb.indices).toHaveLength(12);
    expect([...fb.indices].every((v) => v === 7)).toBe(true);
  });

  it('blits an image at a pixel offset', () => {
    const fb = createFramebuffer(4, 4, 0);
    blitIndexed(fb, img([[1, 2], [3, 4]]), 1, 1);
    // row1: 0 1 2 0 ; row2: 0 3 4 0
    expect([...fb.indices]).toEqual([0, 0, 0, 0, 0, 1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 0]);
  });

  it('skips transparent-index pixels (destination shows through)', () => {
    const fb = createFramebuffer(2, 2, 9);
    // index 5 is transparent → only the non-5 pixels overwrite.
    blitIndexed(fb, img([[5, 1], [2, 5]], 5), 0, 0);
    expect([...fb.indices]).toEqual([9, 1, 2, 9]);
  });

  it('clips blits that fall partly outside the framebuffer', () => {
    const fb = createFramebuffer(3, 3, 0);
    blitIndexed(fb, img([[1, 1], [1, 1]]), 2, 2); // only top-left pixel lands at (2,2)
    expect(fb.indices[2 * 3 + 2]).toBe(1);
    // negative offset: only bottom-right pixel lands at (0,0)
    const fb2 = createFramebuffer(3, 3, 0);
    blitIndexed(fb2, img([[1, 2], [3, 4]]), -1, -1);
    expect(fb2.indices[0]).toBe(4);
  });

  it('blitTile places at an 8×8 tile grid cell', () => {
    const fb = createFramebuffer(24, 16, 0);
    const tile = img([Array(8).fill(6)].concat(Array.from({ length: 7 }, () => Array(8).fill(6))));
    blitTile(fb, tile, 2, 1); // pixel (16, 8)
    expect(fb.indices[8 * 24 + 16]).toBe(6);
    expect(fb.indices[0]).toBe(0);
  });

  it('fills a clipped rectangle with an index', () => {
    const fb = createFramebuffer(4, 4, 0);
    fillRectIndexed(fb, 1, 1, 10, 1, 5); // width overruns → clipped to right edge
    expect([...fb.indices.slice(4, 8)]).toEqual([0, 5, 5, 5]);
  });

  it('scaled blit (×2) expands each texel to a 2×2 block (CT.7i)', () => {
    const fb = createFramebuffer(4, 4, 0);
    blitIndexedScaledClipped(fb, img([[1, 2], [3, 4]]), 0, 0, 2, 0, 0, 4, 4);
    // Each source texel → a 2×2 block: row0/1 = 1 1 2 2 ; row2/3 = 3 3 4 4
    expect([...fb.indices]).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4]);
  });

  it('scaled blit honours transparency and the clip rect (CT.7i)', () => {
    const fb = createFramebuffer(4, 4, 9);
    // index 0 transparent; clip to the left half [0,2). The ×2 of the opaque texel (1) lands as a
    // 2×2 block at (0,0); the transparent texel leaves 9 showing; everything at x>=2 is clipped away.
    blitIndexedScaledClipped(fb, img([[1, 0], [0, 1]], 0), 0, 0, 2, 0, 0, 2, 4);
    expect([...fb.indices]).toEqual([1, 1, 9, 9, 1, 1, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
  });

  it('scaled blit with scale 1 matches the unscaled clipped blit (CT.7i)', () => {
    const fb = createFramebuffer(3, 3, 0);
    blitIndexedScaledClipped(fb, img([[1, 2], [3, 4]]), 1, 1, 1, 0, 0, 3, 3);
    expect(fb.indices[1 * 3 + 1]).toBe(1);
    expect(fb.indices[2 * 3 + 2]).toBe(4);
  });

  it('resolves to RGBA through a palette (opaque, EGA)', () => {
    const ega = makeEgaPalette();
    const fb = createFramebuffer(2, 1, 0);
    fb.indices[0] = 0; // black
    fb.indices[1] = 15; // white
    const rgba = framebufferToRGBA(fb, ega);
    expect([...rgba.slice(0, 4)]).toEqual([ega.colors[0]!.r, ega.colors[0]!.g, ega.colors[0]!.b, 255]);
    expect([...rgba.slice(4, 8)]).toEqual([ega.colors[15]!.r, ega.colors[15]!.g, ega.colors[15]!.b, 255]);
  });
});
