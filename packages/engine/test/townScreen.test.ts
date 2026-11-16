/**
 * composeTownScreen — the shared town/location compositor. Solid-font pixel asserts on the title,
 * steel line, body lines (cursor + right-aligned price + greyed lines), status, and command bar.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import { composeTownScreen, TOWN_LINE_DISABLED, type TownView } from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const VIEW: TownView = {
  title: 'Armoury',
  gold: 250,
  lines: [
    { text: 'Long Sword', price: 15 },
    { text: 'Chain Mail', price: 90, color: TOWN_LINE_DISABLED },
  ],
  cursor: 0,
};

describe('composeTownScreen', () => {
  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = composeTownScreen({ font: solidFont(), view: VIEW });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('draws the title (white) and the steel line (yellow)', () => {
    const fb = composeTownScreen({ font: solidFont(), view: VIEW });
    expect(px(fb, 16, 16)).toBe(15); // title at row 2 col 2
    expect(px(fb, 16, 32)).toBe(14); // STEEL line at row 4 col 2
  });

  it('marks the cursor row white and shows a right-aligned price (yellow)', () => {
    const fb = composeTownScreen({ font: solidFont(), view: VIEW });
    // cursor row 0 → screen row 6: '>' at col 2 (pixel 16,48) white.
    expect(px(fb, 16, 48)).toBe(15);
    // price "15" ends at col 36 → starts col 34 → pixel (34*8, 48) yellow.
    expect(px(fb, 34 * 8, 48)).toBe(14);
  });

  it('greys a disabled line via its colour override', () => {
    const fb = composeTownScreen({ font: solidFont(), view: { ...VIEW, cursor: -1 } });
    // line 1 (Chain Mail) → screen row 7, text at col 3 → pixel (24,56) grey.
    expect(px(fb, 24, 56)).toBe(TOWN_LINE_DISABLED);
  });

  it('omits the steel line when no gold is supplied', () => {
    const fb = composeTownScreen({ font: solidFont(), view: { ...VIEW, gold: undefined } });
    expect(px(fb, 16, 32)).toBe(0);
  });

  it('renders the command bar on the bottom row', () => {
    const fb = composeTownScreen({
      font: solidFont(),
      view: VIEW,
      menu: { items: ['Buy', 'Sell', 'Exit'], selected: 0 },
    });
    expect(px(fb, 8, 192)).toBe(15);
  });

  it('skips text when no font is provided', () => {
    const fb = composeTownScreen({ view: VIEW });
    expect(px(fb, 16, 16)).toBe(0);
  });
});
