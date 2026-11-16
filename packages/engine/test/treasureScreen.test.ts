/**
 * composeTreasure — the post-battle treasure screen compositor. Solid-font pixel asserts on the
 * header, gold line (yellow → grey when taken), item rows (cursor + TAKEN tag), and command bar.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import { composeTreasure, type TreasureView } from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const VIEW: TreasureView = {
  gold: 52,
  goldTaken: false,
  rows: [
    { label: 'Vial', taken: false },
    { label: '3 Darts', taken: false },
  ],
  cursor: 0,
};

describe('composeTreasure', () => {
  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = composeTreasure({ font: solidFont(), view: VIEW });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('draws the TREASURE header (white) and gold line (yellow 14)', () => {
    const fb = composeTreasure({ font: solidFont(), view: VIEW });
    expect(px(fb, 16, 16)).toBe(15); // header at row 2 col 2
    expect(px(fb, 16, 32)).toBe(14); // "GOLD:" at row 4 col 2, yellow
  });

  it('greys the gold line once taken', () => {
    const fb = composeTreasure({ font: solidFont(), view: { ...VIEW, goldTaken: true } });
    expect(px(fb, 16, 32)).toBe(8); // grey
  });

  it('marks the cursor row white and tags taken rows grey', () => {
    const fb = composeTreasure({
      font: solidFont(),
      view: { ...VIEW, rows: [{ label: 'Vial', taken: true }, { label: '3 Darts', taken: false }], cursor: 1 },
    });
    // taken row 0 → screen row 6, "TAKEN" tag at col 31 → pixel (248,48) grey.
    expect(px(fb, 248, 48)).toBe(8);
    // cursor on row 1 → screen row 7, '>' at col 2 → pixel (16,56) white.
    expect(px(fb, 16, 56)).toBe(15);
  });

  it('shows (NO ITEMS) when the haul is gold-only', () => {
    const fb = composeTreasure({ font: solidFont(), view: { ...VIEW, rows: [], cursor: -1 } });
    expect(px(fb, 24, 48)).toBe(10); // green message at col 3 row 6
  });

  it('renders the command bar on the bottom row', () => {
    const fb = composeTreasure({
      font: solidFont(),
      view: VIEW,
      menu: { items: ['Take All', 'Money', 'Items', 'Exit'], selected: 0 },
    });
    expect(px(fb, 8, 192)).toBe(15);
  });

  it('skips text when no font is provided', () => {
    const fb = composeTreasure({ view: VIEW });
    expect(px(fb, 16, 16)).toBe(0);
  });
});
