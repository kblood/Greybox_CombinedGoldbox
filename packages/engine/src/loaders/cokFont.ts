/**
 * Gen1 (Champions/Death Knights/Buck Rogers-family) text font loader.
 *
 * The DOS engine's text is drawn from a monochrome 8×8 bitmap font stored as block id 201
 * ("8X8D1.DAX", first TOC entry). Unlike the tile blocks it is NOT a standard DaxBlock: the
 * leading dimension bytes are not a valid header — the engine treats the decompressed payload
 * as a flat array of 8-byte glyphs (one bit per pixel, MSB = leftmost). See
 * `docs/engine/research/cok-dos-screen-layout.md` §7 (oracle: COAB `seg041.Load8x8Tiles`).
 *
 * Addressing is folded: `glyph = ToUpper(ch) % 64` (COAB `seg041.cs:49`), so '@'→0, 'A'→1 …
 * 'Z'→26, ' '→32, '0'→48. We expose that via {@link BitmapFont.mapCode}; only slots 0..63 are
 * ever addressed, though the data carries 177 glyphs (256 for Buck Rogers — see below).
 *
 * `loadCokFont` is the original Champions of Krynn entry point (block 201, kept for the 16
 * existing UI consumers). `loadGen1Font` generalises it: the SAME 8-byte-flat-glyph, SAME
 * `ToUpper(ch) % 64` fold decodes Buck Rogers: Countdown to Doomsday's own `8X8D1.DAX#201`
 * (measured 2026-09-02) — it is a distinct typeface (only 1 of the 64 addressable slots is
 * byte-identical to CoK's, vs. CoK==DoK at 64/64) stored as 256 glyphs (70 populated, 0..70)
 * instead of CoK/DoK's 177. Digits and uppercase letters are NOT "missing" from this bank —
 * they were only unreachable under a wrong linear-from-'@' reading (`code - 0x40`, which is
 * negative for every digit); the real fold lands '0' on slot 48, same as CoK/DoK.
 */
import { readDaxDataBlocks } from './dax.js';
import { makeBitmapFont, type BitmapFont } from '../render/textmode.js';
import type { IndexedImage } from '../model/index.js';
import { makeEgaPalette } from '../render/palette.js';

/** Block id of the monochrome 8×8 font inside 8X8D1.DAX. */
export const COK_FONT_BLOCK = 201;
/** Bytes per glyph (8 rows × 1 byte, 1bpp). */
const GLYPH_BYTES = 8;
/** Only these 64 folded slots are ever addressed by `cokGlyphSlot`. */
const ADDRESSABLE_SLOTS = 64;
/** Font sheet layout: 16 columns × 4 rows of 8×8 glyphs = 128×32. */
const SHEET_COLS = 16;
const SHEET_ROWS = 4;

/** Fold an ASCII code to a CoK glyph slot: uppercase, then mod 64 (COAB `seg041.cs:49`). */
export function cokGlyphSlot(code: number): number {
  // ToUpper for a..z → A..Z; other codes pass through, then % 0x40.
  const upper = code >= 0x61 && code <= 0x7a ? code - 0x20 : code;
  return (upper & 0xff) % 0x40;
}

/**
 * Build a Gen1 (CoK/DoK/Buck Rogers-family) text {@link BitmapFont} from the raw bytes of a
 * DAX container, given the block id that holds the flat 8-byte-glyph font (default: CoK/DoK's
 * `COK_FONT_BLOCK` = 201, also Buck Rogers' own font block). Returns null if the block is
 * absent or too small to hold a single glyph.
 */
export function loadGen1Font(daxBytes: Uint8Array, blockId: number = COK_FONT_BLOCK): BitmapFont | null {
  const blocks = readDaxDataBlocks(daxBytes);
  const font = blocks.find((b) => b.blockId === blockId);
  if (!font || font.raw.byteLength < GLYPH_BYTES) return null;
  const glyphCount = Math.floor(font.raw.byteLength / GLYPH_BYTES); // CoK/DoK: 1416/8=177; Buck: 2048/8=256
  // first=0 is unused because mapCode overrides slot resolution; count covers all stored
  // glyphs so any folded slot (0..63) is in range.
  return makeBitmapFont(font.raw, 8, 8, 0, glyphCount, cokGlyphSlot);
}

/**
 * Build the Champions of Krynn text {@link BitmapFont} from the raw bytes of `8X8D1.DAX`.
 * Thin wrapper over {@link loadGen1Font} kept for the 16 existing UI consumers' stable API.
 * Returns null if block 201 is absent or too small to hold a single glyph.
 */
export function loadCokFont(daxBytes: Uint8Array): BitmapFont | null {
  return loadGen1Font(daxBytes, COK_FONT_BLOCK);
}

/**
 * Render every addressable folded slot (0..63, i.e. the '@'..'?' fold range `cokGlyphSlot`
 * ever returns) of a Gen1 font into a single 128×32 {@link IndexedImage} sheet: 16 columns ×
 * 4 rows of 8×8 glyphs, in fold/code order — row 0 `@..O`, row 1 `P.._`, row 2 ` ../`, row 3
 * `0..?`. Slot `r*16+c` occupies pixel cell `(c*8, r*8)`. Background is EGA index 0 (black),
 * foreground is EGA index 15 (white); opaque (no transparency) so the sheet previews cleanly
 * on its own.
 */
export function fontSheetImage(font: BitmapFont): IndexedImage {
  const width = SHEET_COLS * font.glyphWidth;
  const height = SHEET_ROWS * font.glyphHeight;
  const indices = new Uint8Array(width * height); // pre-filled with 0 (background)
  const rowBytes = font.rowBytes;
  for (let slot = 0; slot < ADDRESSABLE_SLOTS; slot++) {
    const col = slot % SHEET_COLS;
    const row = Math.floor(slot / SHEET_COLS);
    const cellX = col * font.glyphWidth;
    const cellY = row * font.glyphHeight;
    if (slot >= font.count) continue; // slot not present in this font's data at all
    for (let gy = 0; gy < font.glyphHeight; gy++) {
      const rowOff = (slot * font.glyphHeight + gy) * rowBytes;
      for (let gx = 0; gx < font.glyphWidth; gx++) {
        const byte = font.bits[rowOff + (gx >> 3)] ?? 0;
        const on = ((byte >> (7 - (gx & 7))) & 1) === 1;
        if (on) indices[(cellY + gy) * width + (cellX + gx)] = 15; // white foreground
      }
    }
  }
  return {
    width,
    height,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: makeEgaPalette(),
    encoding: 'gen1-font-sheet',
  };
}
