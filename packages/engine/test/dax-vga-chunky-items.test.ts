import { describe, expect, it } from 'vitest';
import { parseVgaChunkyItems, vgaChunkyItemsToImages } from '../src/loaders/daxVgaChunkyItems.js';

function fixture(height: number, width8: number, count: number, base = 16, colors = 4): Uint8Array {
  const header = 10;
  const metadata = colors * 3 + (colors >> 1) + 4;
  const pixels = height * width8 * 8 * count;
  const raw = new Uint8Array(header + metadata + pixels);
  raw[0] = height; raw[1] = width8;
  raw[2] = 0xfe; raw[3] = 0xff; // x = -2
  raw[4] = 3; raw[6] = count & 0xff; raw[7] = count >> 8;
  raw[8] = base; raw[9] = colors - 1;
  for (let i = 0; i < colors * 3; i++) raw[10 + i] = i % 64;
  const start = header + metadata;
  for (let i = 0; i < pixels; i++) raw[start + i] = (base + i) & 0xff;
  return raw;
}

describe('late Gen1 embedded-palette chunky item arrays', () => {
  it('decodes exact framing, signed offsets, palette, and multiple items', () => {
    const parsed = parseVgaChunkyItems(fixture(8, 1, 3));
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({ width: 8, height: 8, count: 3, xOffset: -2, yOffset: 3 });
    const images = vgaChunkyItemsToImages(parsed!);
    expect(images).toHaveLength(3);
    expect(images[0]!.indices).toHaveLength(64);
    expect(images[1]!.indices[0]).toBe((16 + 64) & 0xff);
    expect(images[0]!.palette?.colors[16]).toEqual({ r: 0, g: 4, b: 8 });
  });

  it('rejects trailing bytes and invalid six-bit DAC values', () => {
    const trailing = new Uint8Array([...fixture(8, 1, 1), 0]);
    expect(parseVgaChunkyItems(trailing)).toBeNull();
    const badPalette = fixture(8, 1, 1);
    badPalette[10] = 64;
    expect(parseVgaChunkyItems(badPalette)).toBeNull();
  });
});
