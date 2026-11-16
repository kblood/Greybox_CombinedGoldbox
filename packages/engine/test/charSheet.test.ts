/**
 * composeCharSheet — the character-sheet ("View") screen compositor. Drives it with a synthetic
 * solid font (every glyph fills its 8×8 cell) so we can assert that text actually lands in the
 * expected grid cells, and that the page composes to a full 320×200 indexed framebuffer with the
 * name, abilities, derived combat line, saves and command bar all present.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import { composeCharSheet, type CharSheetView } from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}

const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) => fb.indices[y * fb.width + x];

const SHEET: CharSheetView = {
  name: 'Sturm',
  raceLine: 'Human Male',
  classLine: 'Fighter 5',
  abilities: [
    { label: 'Str', value: '18/75' },
    { label: 'Int', value: '10' },
    { label: 'Wis', value: '12' },
    { label: 'Dex', value: '15' },
    { label: 'Con', value: '16' },
    { label: 'Cha', value: '13' },
  ],
  ac: 2,
  thac0: 16,
  hp: 44,
  maxHp: 44,
  saves: [
    { label: 'Paralyze/Poison/Death', value: 13 },
    { label: 'Petrify/Polymorph', value: 14 },
    { label: 'Rod/Staff/Wand', value: 15 },
    { label: 'Breath Weapon', value: 16 },
    { label: 'Spell', value: 17 },
  ],
  footer: 'Knight of the Crown',
  index: '1/4',
};

describe('composeCharSheet', () => {
  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('draws the name at row 2 col 2 in white (15)', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
    // 'S' fills cell (col 2, row 2) → pixel (16,16) set to white.
    expect(px(fb, 16, 16)).toBe(15);
  });

  it('draws the first ability row (STR) at row 6, value in white', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
    // label 'STR' at col 2 row 6 (green 10), value at col 8 row 6 (white 15).
    expect(px(fb, 16, 48)).toBe(10);
    expect(px(fb, 64, 48)).toBe(15);
  });

  it('draws the derived combat line (AC) on the right at col 20', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
    // 'AC' label at col 20 row 6 → pixel (160,48) green.
    expect(px(fb, 160, 48)).toBe(10);
  });

  it('draws the MV row on the right at row 9 when sheet.move is set', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, move: 12 } });
    // 'MV' label at col 20 row 9 → pixel (160, 72) green.
    expect(px(fb, 160, 72)).toBe(10);
  });

  it('omits the MV row when sheet.move is undefined (existing SHEET fixture)', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
    expect(px(fb, 160, 72)).toBe(0); // interior stays black — no 4th combat row drawn
  });

  it('draws the ATK row on the right at row 10 when both move and attacks are set', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, move: 12, attacks: '3/2' } });
    // 'ATK' label at col 20 row 10 → pixel (160, 80) green.
    expect(px(fb, 160, 80)).toBe(10);
  });

  it('draws the ATK row at row 9 (not 10) when attacks is set but move is not', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, attacks: '3/2' } });
    expect(px(fb, 160, 72)).toBe(10); // row 9 — no gap left by the skipped MV row
  });

  it('omits the ATK row when sheet.attacks is undefined (existing SHEET fixture)', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
    expect(px(fb, 160, 80)).toBe(0); // row 10 stays black
  });

  it('draws the DMG row on the right at row 9 when only dmg is set (no move/attacks)', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, dmg: '1d2 (base)' } });
    // 'DMG' label at col 20 row 9 → pixel (160, 72) green — no MV/ATK rows precede it here.
    expect(px(fb, 160, 72)).toBe(10);
  });

  it('omits the DMG row when sheet.dmg is undefined (existing SHEET fixture)', () => {
    const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
    expect(px(fb, 160, 72)).toBe(0); // row 9 stays black
  });

  it('renders the command bar on the bottom row', () => {
    const fb = composeCharSheet({
      font: solidFont(),
      sheet: SHEET,
      menu: { items: ['Next', 'Prev', 'Exit'], selected: 0 },
    });
    // 'Next' selected → its first cell (col 1, row 24) is white (15).
    expect(px(fb, 8, 192)).toBe(15);
  });

  it('skips all text when no font is provided (frame-only)', () => {
    const fb = composeCharSheet({ sheet: SHEET });
    // Interior stays black where the name would be.
    expect(px(fb, 16, 16)).toBe(0);
  });
});
