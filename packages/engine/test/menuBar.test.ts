/**
 * drawHorizontalMenu — the shared Gold Box command-bar renderer. Drives it with a synthetic
 * 1-bpp font so glyph pixels are predictable, and pins: item hit-spans, the selected verb in
 * the highlight colour, and the hotkey first-letter highlighted on unselected verbs.
 */
import { describe, it, expect } from 'vitest';
import { createFramebuffer } from '../src/render/screen.js';
import { makeBitmapFont } from '../src/render/textmode.js';
import {
  drawHorizontalMenu,
  menuHotkey,
  GB_MENU_DUNGEON,
  GB_MENU_ENCAMP,
} from '../src/render/menuBar.js';

/** A font where every glyph is a fully-set 8×8 block, so any drawn char paints its whole cell.
 * 256 contiguous glyphs from code 0, so slot === char code (covers all upper-case letters). */
function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}

const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) => fb.indices[y * fb.width + x];

describe('drawHorizontalMenu', () => {
  it('lays items left-to-right with a one-cell gap and reports spans', () => {
    const fb = createFramebuffer(320, 200, 0);
    const hits = drawHorizontalMenu(fb, solidFont(), ['AB', 'C'], {
      x: 0,
      y: 0,
      selected: -1,
      idleColor: 10,
      selColor: 15,
    });
    expect(hits).toEqual([
      { index: 0, x0: 0, x1: 16 }, // "AB" = 2 cells
      { index: 1, x0: 24, x1: 32 }, // gap of one cell (8px) then "C"
    ]);
  });

  it('draws the selected verb fully in the highlight colour', () => {
    const fb = createFramebuffer(320, 200, 0);
    drawHorizontalMenu(fb, solidFont(), ['MOVE', 'CAST'], {
      x: 0,
      y: 0,
      selected: 1,
      idleColor: 10,
      selColor: 15,
    });
    // CAST starts after "MOVE"(32px) + gap(8px) = x=40. Every glyph pixel is selColor 15.
    expect(px(fb, 41, 1)).toBe(15);
    expect(px(fb, 60, 4)).toBe(15);
    // MOVE (unselected): hotkey 'M' in selColor, body in idleColor.
    expect(px(fb, 1, 1)).toBe(15); // 'M' hotkey
    expect(px(fb, 9, 1)).toBe(10); // 'O' body
  });

  it('hotkeyColor overrides the unselected first-letter colour', () => {
    const fb = createFramebuffer(320, 200, 0);
    drawHorizontalMenu(fb, solidFont(), ['SAVE'], {
      x: 0,
      y: 0,
      selected: -1,
      idleColor: 10,
      selColor: 15,
      hotkeyColor: 14,
    });
    expect(px(fb, 1, 1)).toBe(14); // 'S' hotkey in hotkeyColor
    expect(px(fb, 9, 1)).toBe(10); // 'A' body in idleColor
  });

  it('exposes the authentic Gold Box verb sets and their hotkeys', () => {
    expect([...GB_MENU_DUNGEON]).toEqual(['Area', 'Cast', 'View', 'Encamp', 'Search', 'Look']);
    expect([...GB_MENU_ENCAMP]).toEqual(['Save', 'View', 'Magic', 'Rest', 'Alter', 'Fix', 'Exit']);
    expect(GB_MENU_DUNGEON.map(menuHotkey)).toEqual(['A', 'C', 'V', 'E', 'S', 'L']);
  });
});
