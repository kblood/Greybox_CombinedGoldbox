/**
 * composeHudPanel (D2). Solid-font pixel asserts: the panel composes a full 320×200 framebuffer,
 * renders one row per party member (active / down / dead colouring), and surfaces the HP "cur/max"
 * + XP values. Uses a solid 8×8 font so any drawn glyph paints its whole cell (easy presence test).
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import { composeHudPanel, HUD_MAX_ROWS, type HudRow } from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const ROWS: HudRow[] = [
  { name: 'Tanis', hp: 18, maxHp: 22, xp: 4200, ac: 4, cls: 'FTR 3', down: false, dead: false },
  { name: 'Goldmoon', hp: 0, maxHp: 16, xp: 3100, ac: 8, cls: 'CLR 3', down: true, dead: false },
  { name: 'Raistlin', hp: -3, maxHp: 9, xp: 5000, ac: 9, cls: 'MU 4', down: true, dead: true },
];

// Cell geometry mirrors hudPanel.ts (8×8 grid): names at col 2, first member row 5.
const COL_NAME = 2;
const FIRST_ROW = 5;
const cellX = (c: number) => c * 8 + 1; // +1 to sample inside a glyph cell
const rowY = (r: number) => r * 8 + 1;

describe('composeHudPanel', () => {
  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = composeHudPanel({ font: solidFont(), rows: ROWS });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('renders one row per party member (a name glyph is painted on each row)', () => {
    const fb = composeHudPanel({ font: solidFont(), rows: ROWS });
    ROWS.forEach((_, i) => {
      // Some non-black pixel exists in the name column on this member's row.
      let painted = false;
      for (let dx = 0; dx < 8 && !painted; dx++) {
        if (px(fb, COL_NAME * 8 + dx, rowY(FIRST_ROW + i)) !== 0) painted = true;
      }
      expect(painted).toBe(true);
    });
  });

  it('colours an active member green, a down member brown, a dead member red', () => {
    const fb = composeHudPanel({ font: solidFont(), rows: ROWS });
    expect(px(fb, cellX(COL_NAME), rowY(FIRST_ROW + 0))).toBe(10); // Tanis active → green
    expect(px(fb, cellX(COL_NAME), rowY(FIRST_ROW + 1))).toBe(6); // Goldmoon down → brown
    expect(px(fb, cellX(COL_NAME), rowY(FIRST_ROW + 2))).toBe(12); // Raistlin dead → red
  });

  it('paints the HP cur/max and XP fields (non-black cells in their columns)', () => {
    const fb = composeHudPanel({ font: solidFont(), rows: ROWS });
    // HP column (col 25) and XP column (col 31, yellow=14) on the first row.
    expect(px(fb, 25 * 8 + 1, rowY(FIRST_ROW))).not.toBe(0);
    expect(px(fb, 31 * 8 + 1, rowY(FIRST_ROW))).toBe(14);
  });

  it('renders a column header row and a title', () => {
    const fb = composeHudPanel({ font: solidFont(), rows: ROWS, title: 'Party Status' });
    expect(px(fb, COL_NAME * 8 + 1, 2 * 8 + 1)).toBe(15); // title white at row 2
    expect(px(fb, COL_NAME * 8 + 1, 4 * 8 + 1)).toBe(8); // NAME header grey at row 4
  });

  it('shows an empty-party hint when there are no rows', () => {
    const fb = composeHudPanel({ font: solidFont(), rows: [] });
    expect(px(fb, COL_NAME * 8 + 1, (FIRST_ROW + 1) * 8 + 1)).toBe(8); // grey hint
  });

  it('caps at HUD_MAX_ROWS members', () => {
    const many: HudRow[] = Array.from({ length: HUD_MAX_ROWS + 4 }, (_, i) => ({
      name: `M${i}`, hp: 5, maxHp: 5, xp: 100, ac: 5, cls: 'FTR 1', down: false, dead: false,
    }));
    const fb = composeHudPanel({ font: solidFont(), rows: many });
    // A row beyond the cap must be blank in the name column.
    let painted = false;
    for (let dx = 0; dx < 8; dx++) if (px(fb, COL_NAME * 8 + dx, rowY(FIRST_ROW + HUD_MAX_ROWS)) !== 0) painted = true;
    expect(painted).toBe(false);
  });

  it('renders without a font (frame only) and without a frame (no crash)', () => {
    expect(() => composeHudPanel({ rows: ROWS })).not.toThrow();
    const fb = composeHudPanel({ rows: ROWS });
    expect(fb.width).toBe(320);
  });
});
