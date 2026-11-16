/**
 * composeInventory — the inventory ("Items") screen compositor. Drives it with a synthetic solid
 * font (every glyph fills its 8×8 cell) so text placement can be asserted by pixel, and checks the
 * owner/AC line, item rows (cursor + READY tag), the empty-pack message and the command bar.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import { composeInventory, type InventoryView } from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const VIEW: InventoryView = {
  name: 'Sturm',
  ac: 4,
  thac0: 16,
  rows: [
    { label: 'Long Sword', equipped: true },
    { label: 'Shield', equipped: false },
    { label: '20 Arrow', equipped: false },
  ],
  cursor: 0,
  index: '1/4',
  weight: '49.0 LB',
  encumbrance: 'LIGHT',
};

describe('composeInventory', () => {
  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = composeInventory({ font: solidFont(), view: VIEW });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('draws the owner name at row 2 col 2 in white (15)', () => {
    const fb = composeInventory({ font: solidFont(), view: VIEW });
    expect(px(fb, 16, 16)).toBe(15);
  });

  it('draws the AC line at row 3 (green 10)', () => {
    const fb = composeInventory({ font: solidFont(), view: VIEW });
    expect(px(fb, 16, 24)).toBe(10);
  });

  it('draws the weight line at row 4 and the encumbrance tag in cyan (11)', () => {
    const fb = composeInventory({ font: solidFont(), view: VIEW });
    // "WT 49.0 LB" at col 2 row 4 → pixel (16,32) green.
    expect(px(fb, 16, 32)).toBe(10);
    // encumbrance "LIGHT" at col 14 row 4 → pixel (112,32) cyan.
    expect(px(fb, 112, 32)).toBe(11);
  });

  it('draws a status line above the command bar when present', () => {
    const fb = composeInventory({ font: solidFont(), view: { ...VIEW, status: 'GAVE LONG SWORD' } });
    // status at col 2 row 22 → pixel (16,176) white.
    expect(px(fb, 16, 176)).toBe(15);
  });

  it('marks the cursor row in white and tags readied gear cyan (11)', () => {
    const fb = composeInventory({ font: solidFont(), view: VIEW });
    // cursor row 0 → screen row 5; the '>' is at col 2 (white 15).
    expect(px(fb, 16, 40)).toBe(15);
    // "READY" tag for the equipped long sword at col 31 row 5 → pixel (248,40) cyan.
    expect(px(fb, 248, 40)).toBe(11);
  });

  it('shows the empty-pack message when nothing is carried', () => {
    const fb = composeInventory({
      font: solidFont(),
      view: { name: 'X', ac: 10, thac0: 20, rows: [], cursor: -1 },
    });
    // "(NOTHING CARRIED)" at col 3 row 6 → pixel (24,48) green.
    expect(px(fb, 24, 48)).toBe(10);
  });

  it('renders the command bar on the bottom row', () => {
    const fb = composeInventory({
      font: solidFont(),
      view: VIEW,
      menu: { items: ['Ready', 'Use', 'Drop', 'Exit'], selected: 0 },
    });
    expect(px(fb, 8, 192)).toBe(15);
  });

  it('skips all text when no font is provided (frame-only)', () => {
    const fb = composeInventory({ view: VIEW });
    expect(px(fb, 16, 16)).toBe(0);
  });
});
