/**
 * Late Gen1 embedded-palette chunky-VGA item arrays (Treasures/Pools family).
 *
 * The decompressed resource is self-describing:
 *
 *   byte 0      item height
 *   byte 1      item width / 8
 *   bytes 2..5  drawing offsets (signed 16-bit x/y)
 *   bytes 6..7  item count (u16; zero means one picture)
 *   byte 8      first VGA DAC register
 *   byte 9      number of palette entries minus one
 *   byte 10..   6-bit RGB triples, packed-nibble lookup seeds, four flag bytes,
 *               and (only for palette 32..143) the retail 28-byte special record
 *   tail        count * width * height direct 8-bit chunky pixels
 *
 * This is the item-array generalization of the already-proven Treasures 8X8D
 * "mode 2" path. Pools native capture proves the same framing in 8X8D0, BORDERS,
 * BACK, SKYGRND, BIGPIC, DUNGCOM, and CPIC. Exact byte consumption is the gate.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

const HEADER_LEN = 10;
const scale6to8 = (v: number): number => Math.round((v * 255) / 63);

export interface VgaChunkyItems {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  count: number;
  palette: Palette;
  pixels: Uint8Array;
}

function i16(raw: Uint8Array, off: number): number {
  const value = raw[off]! | (raw[off + 1]! << 8);
  return value & 0x8000 ? value - 0x10000 : value;
}

export function parseVgaChunkyItems(raw: Uint8Array): VgaChunkyItems | null {
  if (raw.byteLength < HEADER_LEN + 1) return null;
  const height = raw[0]!;
  const width = raw[1]! * 8;
  if (width < 8 || height < 1) return null;

  const declaredCount = raw[6]! | (raw[7]! << 8);
  const count = declaredCount || 1;
  const paletteBase = raw[8]!;
  const numColors = raw[9]! + 1;
  if (numColors < 2 || paletteBase + numColors > 256) return null;

  const paletteStart = HEADER_LEN;
  const paletteBytes = numColors * 3;
  const seedBytes = numColors >> 1;
  let pixelStart = paletteStart + paletteBytes + seedBytes + 4;
  if (paletteBase === 0x20 && numColors === 0x70) pixelStart += 0x1c;
  const pixelBytes = width * height * count;
  if (pixelStart + pixelBytes !== raw.byteLength) return null;

  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < numColors; i++) {
    const off = paletteStart + i * 3;
    const r6 = raw[off]!, g6 = raw[off + 1]!, b6 = raw[off + 2]!;
    if (r6 > 63 || g6 > 63 || b6 > 63) return null;
    colors[paletteBase + i] = { r: scale6to8(r6), g: scale6to8(g6), b: scale6to8(b6) };
  }

  return {
    width,
    height,
    xOffset: i16(raw, 2),
    yOffset: i16(raw, 4),
    count,
    palette: { colors, source: 'dax-vga-chunky-items', firstColor: paletteBase, count: numColors },
    pixels: raw.slice(pixelStart),
  };
}

export function vgaChunkyItemsToImages(items: VgaChunkyItems): IndexedImage[] {
  const itemBytes = items.width * items.height;
  const images: IndexedImage[] = [];
  for (let i = 0; i < items.count; i++) {
    images.push({
      width: items.width,
      height: items.height,
      indices: items.pixels.slice(i * itemBytes, (i + 1) * itemBytes),
      xOffset: items.xOffset,
      yOffset: items.yOffset,
      transparentIndex: null,
      palette: items.palette,
      encoding: 'dax-vga-chunky-items',
    });
  }
  return images;
}
