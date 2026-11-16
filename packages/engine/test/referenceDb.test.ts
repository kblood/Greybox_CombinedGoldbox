/**
 * composeReferenceDb (D5) — the monster/item/spell cyclopedia browser. Pixel asserts on a solid
 * font: the title, the active category + game tag, the windowed name list with a white-highlighted
 * cursor (selected white, idle green) and a grey right-aligned tag, the detail header (yellow), a
 * detail row (grey label / white value), and the empty-list hint.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import {
  composeReferenceDb,
  REFERENCE_DB_LIST_ROWS,
  type ReferenceDbView,
} from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const C_GREEN = 10;
const C_WHITE = 15;
const C_YELLOW = 14;
const C_GREY = 8;
const C_CYAN = 11;

const view: ReferenceDbView = {
  title: 'Reference DB',
  category: 'Monsters',
  game: 'COK',
  entries: [
    { name: 'Kapak', tag: 'M' },
    { name: 'Sivak', tag: 'M' },
    { name: 'Baaz', tag: 'M' },
  ],
  selected: 1,
  detailTitle: 'Sivak',
  detail: [
    { label: 'AC', value: '3' },
    { label: 'HD', value: '6' },
    { label: 'THAC0', value: '13' },
  ],
  status: '↑↓ NAV  TAB CATEGORY',
};

describe('composeReferenceDb', () => {
  it('composes a full 320×200 indexed framebuffer with the title + category', () => {
    const fb = composeReferenceDb({ font: solidFont(), view });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
    // Title at col 2 row 2 → white.
    expect(px(fb, 2 * 8 + 1, 2 * 8 + 1)).toBe(C_WHITE);
    // Category "MONSTERS" at col 22 row 2 → cyan.
    expect(px(fb, 22 * 8 + 1, 2 * 8 + 1)).toBe(C_CYAN);
    // Game tag "COK" at col 36 row 2 → grey.
    expect(px(fb, 36 * 8 + 1, 2 * 8 + 1)).toBe(C_GREY);
  });

  it('highlights the selected name white and idle names green, with a grey tag', () => {
    const fb = composeReferenceDb({ font: solidFont(), view });
    // Selected (index 1 → row 5): '>' marker col 2 white, name col 3 white.
    expect(px(fb, 2 * 8 + 1, 5 * 8 + 1)).toBe(C_WHITE);
    expect(px(fb, 3 * 8 + 1, 5 * 8 + 1)).toBe(C_WHITE);
    // Idle (index 0 → row 4): name green; no '>' marker (col 2 black).
    expect(px(fb, 3 * 8 + 1, 4 * 8 + 1)).toBe(C_GREEN);
    expect(px(fb, 2 * 8 + 1, 4 * 8 + 1)).toBe(0);
    // Tag at col LIST_COL+17 = 19, row 4 → grey.
    expect(px(fb, 19 * 8 + 1, 4 * 8 + 1)).toBe(C_GREY);
  });

  it('draws the detail header yellow and a detail row grey-label / white-value', () => {
    const fb = composeReferenceDb({ font: solidFont(), view });
    // Detail header "SIVAK" at col 22 row 4 → yellow.
    expect(px(fb, 22 * 8 + 1, 4 * 8 + 1)).toBe(C_YELLOW);
    // First detail row at row 5: label "AC" grey at col 22, value "3" white at col 31.
    expect(px(fb, 22 * 8 + 1, 5 * 8 + 1)).toBe(C_GREY);
    expect(px(fb, 31 * 8 + 1, 5 * 8 + 1)).toBe(C_WHITE);
  });

  it('shows the empty-list hint when there are no entries', () => {
    const empty: ReferenceDbView = { ...view, entries: [], selected: 0, detailTitle: '', detail: [] };
    const fb = composeReferenceDb({ font: solidFont(), view: empty });
    // "(NO ENTRIES)" at col 3 row 4 → grey.
    expect(px(fb, 3 * 8 + 1, 4 * 8 + 1)).toBe(C_GREY);
  });

  it('exposes a stable visible-row budget', () => {
    expect(REFERENCE_DB_LIST_ROWS).toBe(13);
  });
});
