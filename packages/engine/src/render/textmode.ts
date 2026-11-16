/**
 * Bitmap-font text into the indexed framebuffer — the original engine's text path.
 *
 * Gold Box text is drawn from a monochrome (1 bit/pixel) fixed-size font: each glyph is a
 * small bitmap whose set bits paint the chosen foreground colour index and whose clear bits
 * are either a background index or left transparent. The DOS exploration screen draws every
 * string this way (party names, the message window, menus), 8×8 per character on the 40×25
 * tile grid.
 *
 * This module is the renderer; the font DATA (glyph bitmaps + ASCII base) is loaded from the
 * game's own assets elsewhere. Pure / DOM-free — operates on an {@link IndexedFramebuffer}.
 */
import type { IndexedFramebuffer } from './screen.js';
import { blitIndexed } from './screen.js';
import type { IndexedImage } from '../model/index.js';

/**
 * A fixed-size 1-bpp bitmap font. `bits` holds `count` glyphs in ASCII order starting at
 * `first`; each glyph is `glyphHeight` rows of `rowBytes` bytes (MSB = leftmost pixel),
 * `rowBytes = ceil(glyphWidth/8)`.
 */
export interface BitmapFont {
  glyphWidth: number;
  glyphHeight: number;
  /** ASCII code of glyph 0 (e.g. 0x20 for space). */
  first: number;
  /** Number of glyphs stored. */
  count: number;
  /** Bytes per glyph row = ceil(glyphWidth / 8). */
  rowBytes: number;
  /** Packed glyph bitmaps, length === count * glyphHeight * rowBytes. */
  bits: Uint8Array;
  /**
   * Optional ASCII-code → glyph-slot mapping. Some fonts are not a simple contiguous run
   * from `first`: the Champions of Krynn font folds the ASCII range with `ToUpper(ch) % 64`
   * (so '@'→0, 'A'→1 … 'Z'→26, ' '→32, '0'→48). When set, this overrides the default
   * `code - first` lookup. Must return a slot in `[0, count)` or -1 for "no glyph".
   */
  mapCode?: (code: number) => number;
}

/**
 * Build a {@link BitmapFont} from a flat glyph-bitmap blob (the common case: `count` glyphs of
 * `glyphHeight` rows, `ceil(glyphWidth/8)` bytes each, contiguous). `first` is the ASCII code
 * the first glyph represents.
 */
export function makeBitmapFont(
  bits: Uint8Array,
  glyphWidth: number,
  glyphHeight: number,
  first: number,
  count?: number,
  mapCode?: (code: number) => number,
): BitmapFont {
  const rowBytes = Math.ceil(glyphWidth / 8);
  const maxCount = Math.floor(bits.length / (glyphHeight * rowBytes));
  const n = count ?? maxCount;
  if (n > maxCount) throw new Error(`BitmapFont: ${n} glyphs need more bytes than provided`);
  return { glyphWidth, glyphHeight, first, count: n, rowBytes, bits, mapCode };
}

/** Glyph slot for an ASCII code, or -1 if the font has no glyph for it. */
export function glyphSlot(font: BitmapFont, code: number): number {
  const slot = font.mapCode ? font.mapCode(code) : code - font.first;
  return slot >= 0 && slot < font.count ? slot : -1;
}

/** Test whether pixel (gx, gy) of glyph `slot` is set (foreground). */
function glyphBit(font: BitmapFont, slot: number, gx: number, gy: number): boolean {
  const rowOff = (slot * font.glyphHeight + gy) * font.rowBytes + (gx >> 3);
  const byte = font.bits[rowOff];
  return ((byte >> (7 - (gx & 7))) & 1) === 1;
}

/**
 * Draw one character into the framebuffer at top-left pixel (x, y). Set bits paint `fg`; clear
 * bits paint `bg` if given, or are left transparent (the framebuffer shows through). Out-of-font
 * codes draw nothing. Returns the advance width (glyphWidth).
 */
export function drawChar(
  fb: IndexedFramebuffer,
  font: BitmapFont,
  code: number,
  x: number,
  y: number,
  fg: number,
  bg: number | null = null,
): number {
  const slot = glyphSlot(font, code);
  if (slot < 0) return font.glyphWidth;
  const gw = font.glyphWidth;
  const gh = font.glyphHeight;
  for (let gy = 0; gy < gh; gy++) {
    const py = y + gy;
    if (py < 0 || py >= fb.height) continue;
    for (let gx = 0; gx < gw; gx++) {
      const px = x + gx;
      if (px < 0 || px >= fb.width) continue;
      const on = glyphBit(font, slot, gx, gy);
      if (on) fb.indices[py * fb.width + px] = fg;
      else if (bg !== null) fb.indices[py * fb.width + px] = bg;
    }
  }
  return gw;
}

/**
 * Draw a string left-to-right starting at top-left pixel (x, y), advancing `glyphWidth` per
 * character. `\n` returns to the start x and steps down one glyph height. Returns the pixel
 * width consumed on the final line.
 */
export function drawText(
  fb: IndexedFramebuffer,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  fg: number,
  bg: number | null = null,
): void {
  let cx = x;
  let cy = y;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10) {
      cx = x;
      cy += font.glyphHeight;
      continue;
    }
    cx += drawChar(fb, font, code, cx, cy, fg, bg);
  }
}

/** Render a single glyph as a standalone IndexedImage (e.g. for an asset browser). */
export function glyphToImage(
  font: BitmapFont,
  code: number,
  fg: number,
  bg: number,
  transparentIndex: number | null = null,
): IndexedImage {
  const { glyphWidth: gw, glyphHeight: gh } = font;
  const indices = new Uint8Array(gw * gh).fill(bg);
  const slot = glyphSlot(font, code);
  if (slot >= 0) {
    for (let gy = 0; gy < gh; gy++)
      for (let gx = 0; gx < gw; gx++) if (glyphBit(font, slot, gx, gy)) indices[gy * gw + gx] = fg;
  }
  return { width: gw, height: gh, indices, xOffset: 0, yOffset: 0, transparentIndex, palette: null };
}

/** Blit a pre-built glyph image (used when a font is supplied as IndexedImages). */
export function blitGlyphImage(fb: IndexedFramebuffer, glyph: IndexedImage, x: number, y: number): void {
  blitIndexed(fb, glyph, x, y);
}
