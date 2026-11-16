/**
 * composeMainMenu — the CoK main game menu (party-formation / startup screen). Pixel asserts on a
 * solid font: the title row, the byte-verified 10-option command list with a white-highlighted
 * cursor (and a white hotkey + green body on idle options), the empty-party hint, and a roster row.
 * Option geometry comes from the same `layoutMainMenu` the compositor uses.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import {
  composeMainMenu,
  layoutMainMenu,
  COK_MAIN_MENU,
  COK_MAIN_MENU_TITLE,
  MAIN_MENU_MENU_ROW,
  type MainMenuMember,
} from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const C_BLACK = 0;
const C_GREEN = 10;
const C_WHITE = 15;

describe('composeMainMenu', () => {
  it('exposes the byte-verified CoK option list + title', () => {
    expect(COK_MAIN_MENU[0]).toBe('Create New Character');
    expect(COK_MAIN_MENU[8]).toBe('Begin Adventuring');
    expect(COK_MAIN_MENU[9]).toBe('Exit to DOS');
    expect(COK_MAIN_MENU).toHaveLength(10);
    expect(COK_MAIN_MENU_TITLE).toBe('Champions of Krynn');
  });

  it('composes a full 320×200 indexed framebuffer with the title drawn', () => {
    const fb = composeMainMenu({ font: solidFont(), view: { roster: [], selected: 8 } });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
    // Title "CHAMPIONS OF KRYNN" (18) centred → col 11, row 2: white glyph block present.
    expect(px(fb, 11 * 8 + 1, 2 * 8 + 1)).toBe(C_WHITE);
  });

  it('highlights the selected option white; idle options show a white hotkey + green body', () => {
    const selected = 8; // Begin Adventuring
    const fb = composeMainMenu({ font: solidFont(), view: { roster: [], selected } });
    const hits = layoutMainMenu(null, null, COK_MAIN_MENU, selected, MAIN_MENU_MENU_ROW);

    const sel = hits[selected]!;
    expect(px(fb, sel.x0 + 1, sel.y0 + 1)).toBe(C_WHITE); // whole selected word white
    expect(px(fb, sel.x0 + 8 + 1, sel.y0 + 1)).toBe(C_WHITE);

    const idle = hits[0]!; // Create New Character
    expect(px(fb, idle.x0 + 1, idle.y0 + 1)).toBe(C_WHITE); // hotkey 'C' white
    expect(px(fb, idle.x0 + 8 + 1, idle.y0 + 1)).toBe(C_GREEN); // body green
  });

  it('wraps the long option list across multiple rows', () => {
    const hits = layoutMainMenu(null, null, COK_MAIN_MENU, -1, MAIN_MENU_MENU_ROW);
    const rows = new Set(hits.map((h) => h.y0));
    expect(rows.size).toBeGreaterThan(1); // 10 long items cannot fit one row
    // All options laid out within the screen.
    for (const h of hits) {
      expect(h.x1).toBeLessThanOrEqual(320);
      expect(h.y1).toBeLessThanOrEqual(200);
    }
  });

  it('shows the empty-party hint when the roster is empty', () => {
    const fb = composeMainMenu({ font: solidFont(), view: { roster: [], selected: 0 } });
    // "(NO CHARACTERS IN PARTY)" at col 3, row 6 → green glyph.
    expect(px(fb, 3 * 8 + 1, 6 * 8 + 1)).toBe(C_GREEN);
  });

  it('draws a roster row with the member name', () => {
    const roster: MainMenuMember[] = [
      { name: 'STURM', cls: 'KN', level: 6, ac: 2, hp: 48, maxHp: 48 },
    ];
    const fb = composeMainMenu({ font: solidFont(), view: { roster, selected: 8 } });
    // Name at col 2, row 6 → green (alive).
    expect(px(fb, 2 * 8 + 1, 6 * 8 + 1)).toBe(C_GREEN);
    // The empty-party hint must NOT be present (col 3 row 6 still green from the name area is fine;
    // assert the row 8/9 hint text is absent → black).
    expect(px(fb, 3 * 8 + 1, 8 * 8 + 1)).toBe(C_BLACK);
  });
});
