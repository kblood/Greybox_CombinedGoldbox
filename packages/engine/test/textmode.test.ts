/**
 * Bitmap-font text renderer tests. A synthetic 8×8 font (a few hand-built glyphs) drives the
 * glyph-bit walk, fg/bg painting, transparency, advance, and newline handling — no game font
 * needed (the real CoK font data plugs into the same BitmapFont shape).
 */
import { describe, it, expect } from 'vitest';
import { createFramebuffer } from '../src/render/screen.js';
import { makeBitmapFont, glyphSlot, drawChar, drawText, glyphToImage } from '../src/render/textmode.js';

// Two 8×8 glyphs starting at ASCII 'A' (0x41):
//  'A' = a full top row only; 'B' = a full left column only. One byte per row (MSB = left).
const FONT_BITS = new Uint8Array([
  // 'A'
  0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  // 'B'
  0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
]);
const font = makeBitmapFont(FONT_BITS, 8, 8, 0x41);

describe('BitmapFont text rendering', () => {
  it('reports glyph slots and out-of-range codes', () => {
    expect(font.count).toBe(2);
    expect(glyphSlot(font, 0x41)).toBe(0); // 'A'
    expect(glyphSlot(font, 0x42)).toBe(1); // 'B'
    expect(glyphSlot(font, 0x43)).toBe(-1); // 'C' not in font
    expect(glyphSlot(font, 0x20)).toBe(-1);
  });

  it("draws 'A' as a lit top row in the foreground colour, rest transparent", () => {
    const fb = createFramebuffer(8, 8, 3); // bg fill 3
    const adv = drawChar(fb, font, 0x41, 0, 0, 14); // fg 14, transparent bg
    expect(adv).toBe(8);
    // Row 0 all fg(14); rows 1..7 untouched (still 3).
    for (let x = 0; x < 8; x++) expect(fb.indices[x]).toBe(14);
    for (let x = 0; x < 8; x++) expect(fb.indices[8 + x]).toBe(3);
  });

  it('paints the background index when bg is given (opaque text cell)', () => {
    const fb = createFramebuffer(8, 8, 3);
    drawChar(fb, font, 0x41, 0, 0, 14, 0); // bg 0
    expect(fb.indices[0]).toBe(14); // lit
    expect(fb.indices[8]).toBe(0); // unlit → bg 0, not the prior 3
  });

  it("draws 'B' as a lit left column", () => {
    const fb = createFramebuffer(8, 8, 0);
    drawChar(fb, font, 0x42, 0, 0, 9);
    for (let y = 0; y < 8; y++) {
      expect(fb.indices[y * 8 + 0]).toBe(9); // left column lit
      expect(fb.indices[y * 8 + 1]).toBe(0); // next column off
    }
  });

  it('advances 8px per char and wraps on newline', () => {
    const fb = createFramebuffer(24, 24, 0);
    drawText(fb, font, 'AB\nB', 0, 0, 12);
    // 'A' top row at x=0..7, 'B' left col at x=8 ; second line 'B' left col at x=0,y=8.
    expect(fb.indices[0]).toBe(12); // 'A' row0
    expect(fb.indices[8]).toBe(12); // 'B' col at x=8,y=0
    expect(fb.indices[8 * 24 + 0]).toBe(12); // newline 'B' at x=0,y=8
  });

  it('honours a custom mapCode (folded addressing like the CoK font)', () => {
    // Two glyphs; map every code to its low bit so 'A'(odd→1) and 'B'(even→0) both resolve.
    const folded = makeBitmapFont(FONT_BITS, 8, 8, 0, 2, (code) => code & 1);
    expect(glyphSlot(folded, 0x41)).toBe(1); // 'A' odd → slot 1
    expect(glyphSlot(folded, 0x42)).toBe(0); // 'B' even → slot 0
    expect(glyphSlot(folded, 0x100)).toBe(0); // out-of-ASCII still folds in range
  });

  it('renders a glyph to a standalone image', () => {
    const img = glyphToImage(font, 0x41, 14, 0, 0);
    expect(img.width).toBe(8);
    expect(img.height).toBe(8);
    for (let x = 0; x < 8; x++) expect(img.indices[x]).toBe(14); // top row fg
    expect(img.indices[8]).toBe(0); // below = bg
    expect(img.transparentIndex).toBe(0);
  });
});
