import { describe, expect, it } from 'vitest';
import { createFramebuffer } from '../src/render/screen.js';
import { indexedToRGBA } from '../src/render/rgba.js';
import { makeEgaPalette } from '../src/render/palette.js';
import { composeRgbaArt, type RgbaArt } from '../src/render/composeRgbaArt.js';

const palette = makeEgaPalette();
const at = (art: RgbaArt, x: number, y: number) => {
  const n = (y * art.width + x) * 4;
  return [...art.pixels.slice(n, n + 4)];
};
const image = (width: number, height: number, pixels: number[]): RgbaArt => ({
  width, height, pixels: Uint8Array.from(pixels),
});

describe('RGBA restyle composition over a native indexed game screen', () => {
  it('nearest-neighbour expands the original, including the unchanged HUD when no layers match', () => {
    const screen = createFramebuffer(2, 2);
    screen.indices.set([0, 15, 15, 0]);
    const result = composeRgbaArt(screen, palette, [], 2);
    expect([result.width, result.height]).toEqual([4, 4]);
    expect(at(result, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(at(result, 1, 1)).toEqual([0, 0, 0, 255]);
    expect(at(result, 2, 0)).toEqual([255, 255, 255, 255]);
    expect(at(result, 3, 3)).toEqual([0, 0, 0, 255]);
    expect([...screen.indices]).toEqual([0, 15, 15, 0]);
  });

  it('retains every subpixel of a 2x restyle rather than quantizing or downsampling to EGA', () => {
    const screen = createFramebuffer(2, 1, 15);
    const art = image(2, 2, [
      13, 27, 41, 255, 51, 62, 73, 255,
      88, 99, 110, 255, 121, 132, 143, 255,
    ]);
    const result = composeRgbaArt(screen, palette, [{ art, x: 1, y: 0, pixelScale: 2 }], 2);
    expect(at(result, 2, 0)).toEqual([13, 27, 41, 255]);
    expect(at(result, 3, 0)).toEqual([51, 62, 73, 255]);
    expect(at(result, 2, 1)).toEqual([88, 99, 110, 255]);
    expect(at(result, 3, 1)).toEqual([121, 132, 143, 255]);
    expect(at(result, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it('composes alpha over the actual underlying screen, not black, and never mutates the source', () => {
    const screen = createFramebuffer(2, 1, 15);
    const art = image(2, 1, [0, 0, 0, 128, 255, 0, 0, 0]);
    const result = composeRgbaArt(screen, palette, [{ art, x: 0, y: 0, pixelScale: 1 }], 1);
    expect(at(result, 0, 0)).toEqual([127, 127, 127, 255]);
    expect(at(result, 1, 0)).toEqual([255, 255, 255, 255]);
    expect([...art.pixels]).toEqual([0, 0, 0, 128, 255, 0, 0, 0]);
  });

  it('keeps DOS HUD palette separate from an Amiga original picture palette', () => {
    const screen = createFramebuffer(3, 1, 15);
    const amigaPalette = makeEgaPalette();
    amigaPalette.colors[15] = { r: 17, g: 89, b: 143 };
    const amiga = { width: 1, height: 1, indices: Uint8Array.of(15),
      xOffset: 0, yOffset: 0, transparentIndex: null, palette: amigaPalette };
    const art = image(1, 1, [...indexedToRGBA(amiga)]);
    const result = composeRgbaArt(screen, palette, [{ art, x: 1, y: 0, pixelScale: 1 }], 1);
    expect(at(result, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(at(result, 1, 0)).toEqual([17, 89, 143, 255]);
    expect(at(result, 2, 0)).toEqual([255, 255, 255, 255]);
  });

  it('supports an explicitly placed partial overlay, clipping it to the screen', () => {
    const screen = createFramebuffer(2, 1);
    const art = image(3, 1, [
      11, 0, 0, 255, 22, 0, 0, 255, 33, 0, 0, 255,
    ]);
    const result = composeRgbaArt(screen, palette, [{ art, x: -1, y: 0, pixelScale: 1 }], 1);
    expect(at(result, 0, 0)).toEqual([22, 0, 0, 255]);
    expect(at(result, 1, 0)).toEqual([33, 0, 0, 255]);
  });

  it('keeps a 2x image intact while nearest-expanding a separately placed 1x layer to 2x', () => {
    const screen = createFramebuffer(2, 1);
    const hi = image(2, 2, Array.from({ length: 4 }, () => [10, 20, 30, 255]).flat());
    const lo = image(1, 1, [100, 110, 120, 255]);
    const result = composeRgbaArt(screen, palette, [
      { art: hi, x: 0, y: 0, pixelScale: 2 },
      { art: lo, x: 1, y: 0, pixelScale: 1 },
    ], 2);
    expect(at(result, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(at(result, 1, 1)).toEqual([10, 20, 30, 255]);
    expect(at(result, 2, 0)).toEqual([100, 110, 120, 255]);
    expect(at(result, 3, 1)).toEqual([100, 110, 120, 255]);
  });

  it('fails closed for malformed output, unmeasured scale/placement or excessive allocations', () => {
    const screen = createFramebuffer(2, 1);
    const art = image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);
    expect(() => composeRgbaArt(screen, palette, [{ art, x: 0, y: 0, pixelScale: 2 }], 2))
      .toThrow(/incompatible layer scale/);
    expect(() => composeRgbaArt(screen, palette, [{ art, x: 0, y: 0, pixelScale: 2 }], 1))
      .toThrow(/incompatible layer scale/);
    expect(() => composeRgbaArt(screen, palette, [{ art, x: 0.5, y: 0, pixelScale: 1 }], 1))
      .toThrow(/invalid native placement/);
    expect(() => composeRgbaArt(screen, palette, [{
      art: image(2, 1, [0, 0, 0, 255]), x: 0, y: 0, pixelScale: 1,
    }], 1)).toThrow(/incompatible layer scale or pixel count/);
    expect(() => composeRgbaArt(screen, palette, [], 0)).toThrow(/invalid output scale/);
    expect(() => composeRgbaArt(createFramebuffer(320, 200), palette, [], 17)).toThrow(/too large/);
  });
});
