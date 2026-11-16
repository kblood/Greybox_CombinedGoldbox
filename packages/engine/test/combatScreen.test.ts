/**
 * composeCombatScreen — synthetic-tile placement goldens (CS.2/CS.3/CS.4).
 *
 * Mirrors exploreScreen.test.ts: drives the compositor with tiny solid-colour tiles so each
 * region's pixels are predictable, and asserts the combat-specific layer (backdrop confined to
 * the battle box, combatant icon at the right grid cell, the active cursor, the command menu and
 * panel text at the combat chrome coords). Geometry is the CANDIDATE default — these tests pin
 * placement RELATIVE to the geometry, so they survive the screenshot-recovery re-pin.
 */
import { describe, it, expect } from 'vitest';
import {
  composeCombatScreen,
  COK_COMBAT_GEOMETRY,
  makeEgaPalette,
  type IndexedImage,
  type CombatCellState,
} from '../src/index.js';
import { loadCokFont } from '../src/loaders/cokFont.js';

/** A solid w×h tile of one palette index (opaque). */
function solid(w: number, h: number, index: number): IndexedImage {
  return {
    width: w,
    height: h,
    indices: new Uint8Array(w * h).fill(index),
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: null,
  };
}

const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) => fb.indices[y * fb.width + x];

describe('composeCombatScreen', () => {
  it('returns a 320×200 framebuffer', () => {
    const fb = composeCombatScreen({});
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('pins the COAB-recovered grid geometry (origin 8,8 · 24px cells · 7×7 window)', () => {
    // A3.1/CS.0 — confirmed from the COAB oracle: cell (c,r) → pixel (8 + c*24, 8 + r*24),
    // clipped to the draw_combat_picture window x/y [8,176) = 168px = exactly 7 cells.
    const g = COK_COMBAT_GEOMETRY;
    expect(g.originX).toBe(8);
    expect(g.originY).toBe(8);
    expect(g.cellW).toBe(24);
    expect(g.cellH).toBe(24);
    expect(g.cols).toBe(7);
    expect(g.rows).toBe(7);
    // The 7×7 window of 24px cells fills the 168px field exactly (last cell ends at the clip edge).
    expect(g.originX + g.cols * g.cellW).toBe(176);
    expect(g.originY + g.rows * g.cellH).toBe(176);
  });

  it('tiles the backdrop only inside the 168×168 combat box (never past x=176 / y=176)', () => {
    const fb = composeCombatScreen({ backdrop: { tiles: [solid(24, 24, 7)], fillTile: 0 } });
    // Inside the box → backdrop colour 7 (the real draw_combat_picture clip is x/y [8,176)).
    expect(px(fb, 8, 8)).toBe(7);
    expect(px(fb, 170, 170)).toBe(7); // still inside the 168px field (cell col/row 6)
    // At/after the clip edge (x>=176 / y>=176) must remain black.
    expect(px(fb, 176, 60)).toBe(0);
    expect(px(fb, 60, 176)).toBe(0);
  });

  it('draws a combatant glyph in its grid cell when no icon is given', () => {
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null };
    const fb = composeCombatScreen({ cells: [cell] });
    const g = COK_COMBAT_GEOMETRY;
    const cx = g.originX + cell.col * g.cellW + 2; // inside the glyph's 1px inset
    const cy = g.originY + cell.row * g.cellH + 2;
    expect(px(fb, cx, cy)).toBe(12); // C_ENEMY_GLYPH (light red)
  });

  it('blits a supplied icon bottom-anchored at the active cell and draws a white cursor', () => {
    const icon = solid(8, 8, 14); // yellow figure (smaller than the 24px cell)
    const cell: CombatCellState = { combatantId: 'p1', side: 'party', col: 4, row: 4, icon, active: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const g = COK_COMBAT_GEOMETRY;
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    // The icon is bottom-anchored to the cell floor and horizontally centred in the 24px cell.
    const dx = Math.round(x0 + g.cellW / 2 - icon.width / 2);
    const dy = y0 + g.cellH - icon.height;
    // Icon centre pixel is yellow…
    expect(px(fb, dx + 4, dy + 4)).toBe(14);
    // …and the cursor outline (top edge, full cell) is white over the cell border.
    expect(px(fb, x0 + 1, y0)).toBe(15);
  });

  it('paints a Large (2×2) glyph across its whole footprint, not just the anchor cell (CT.7i)', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 2, row: 2, icon: null, size: 2 };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    // The glyph fills the 2×2 = 48×48 footprint interior: a pixel deep in the SECOND cell over and
    // down (which a 1×1 anchor-cell draw would leave black) is the enemy colour.
    expect(px(fb, x0 + g.cellW + 6, y0 + g.cellH + 6)).toBe(12); // C_ENEMY_GLYPH, far corner cell
    // And it does NOT bleed past the footprint into the next (col+2) cell.
    expect(px(fb, x0 + 2 * g.cellW + 2, y0 + 2)).toBe(0);
  });

  it('upscales a Large monster icon to fill its footprint and outlines the 2×2 cursor (CT.7i)', () => {
    const g = COK_COMBAT_GEOMETRY;
    const icon = solid(12, 12, 14); // a 12px sprite → scaled ×2 to 24px, bottom-anchored in the 48px footprint
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 1, row: 1, icon, size: 2, active: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    const fw = g.cellW * 2;
    const fh = g.cellH * 2;
    const sw = icon.width * 2; // 24
    const sh = icon.height * 2; // 24
    const dx = Math.round(x0 + fw / 2 - sw / 2);
    const dy = y0 + fh - sh; // bottom of the 48px footprint
    expect(px(fb, dx + 12, dy + 12)).toBe(14); // a scaled icon texel lands yellow
    // Cursor outline now spans the full 2×2 footprint: the bottom edge sits at the footprint floor (y0+48-1).
    expect(px(fb, x0 + 2, y0 + fh - 1)).toBe(15); // C_WHITE
    // The single-cell bottom (y0+24-1) is NOT the cursor edge for a Large figure (it would be for Small).
    expect(px(fb, x0 + 2, y0 + g.cellH - 1)).not.toBe(15);
  });

  it('a Large down marker lies across the footprint floor (48px wide), not one cell (CT.7i)', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 1, row: 1, icon: null, size: 2, down: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    // Prone bar runs the full 48px footprint width, at the footprint floor (y0 + 48 - 1).
    expect(px(fb, x0 + 2, y0 + 2 * g.cellH - 1)).toBe(8); // C_GRAY, near edge
    expect(px(fb, x0 + g.cellW + 10, y0 + 2 * g.cellH - 1)).toBe(8); // C_GRAY, into the second cell
  });

  it('draws an impaired caution bar across the top of the footprint (M70.S1), distinct from the down bar', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null, impaired: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    expect(px(fb, x0 + 2, y0)).toBe(14); // C_YELLOW at the footprint top
    expect(px(fb, x0 + 2, y0 + g.cellH - 2)).toBe(12); // C_ENEMY_GLYPH still fills the rest (glyph unaffected)
  });

  it('a down figure never also shows the impaired bar (down returns early)', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null, down: true, impaired: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    expect(px(fb, x0 + 2, y0)).not.toBe(14); // no yellow bar
    expect(px(fb, x0 + 2, y0 + g.cellH - 2)).toBe(8); // C_GRAY prone bar still at the bottom
  });

  it('the party figure (glyph-only today) also shows the impaired bar, not just enemies', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'p1', side: 'party', col: 2, row: 2, icon: null, impaired: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    expect(px(fb, x0 + 2, y0)).toBe(14); // C_YELLOW
  });

  it('draws a guarding left-edge bar (M71.S1), distinct from impaired\'s top bar and down\'s bottom bar', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null, guarding: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    expect(px(fb, x0, y0 + 10)).toBe(11); // C_CYAN along the left edge
    expect(px(fb, x0 + 4, y0 + 10)).toBe(12); // C_ENEMY_GLYPH still fills the rest (glyph unaffected)
  });

  it('a down figure never also shows the guarding bar (down returns early)', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null, down: true, guarding: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    expect(px(fb, x0, y0 + 10)).not.toBe(11); // no cyan bar
    expect(px(fb, x0 + 2, y0 + g.cellH - 2)).toBe(8); // C_GRAY prone bar still at the bottom
  });

  it('impaired and guarding coexist without overwriting each other away from the shared corner', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null, impaired: true, guarding: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    expect(px(fb, x0 + 4, y0)).toBe(14); // C_YELLOW top bar, away from the left edge
    expect(px(fb, x0, y0 + 10)).toBe(11); // C_CYAN left bar, away from the top edge
  });

  it('the party figure (glyph-only today) also shows the guarding bar, not just enemies', () => {
    const g = COK_COMBAT_GEOMETRY;
    const cell: CombatCellState = { combatantId: 'p1', side: 'party', col: 2, row: 2, icon: null, guarding: true };
    const fb = composeCombatScreen({ cells: [cell] });
    const x0 = g.originX + cell.col * g.cellW;
    const y0 = g.originY + cell.row * g.cellH;
    expect(px(fb, x0, y0 + 10)).toBe(11); // C_CYAN
  });

  it('paints the optional sky band into the battle box without touching the right panel (ovr028-030)', () => {
    // sky.skyIndex 11 (open-sky blue) fills the top horizon band of the 168×168 battle box; the
    // right party panel (x>180) and the area past the clip edge stay black/untouched.
    const fb = composeCombatScreen({ sky: { skyIndex: 11, horizonY: 48, floorIndex: 8 } });
    expect(px(fb, 20, 12)).toBe(11); // inside the sky band (battle box, above the horizon)
    expect(px(fb, 60, 100)).toBe(8); // below horizon → floor index 8
    expect(px(fb, 200, 12)).toBe(0); // right panel region untouched (still black)
    const plain = composeCombatScreen({});
    expect(px(plain, 20, 12)).toBe(0); // sky is default-off
  });

  it('keeps an already-large CPIC at native resolution inside its 2×2 footprint', () => {
    const icon = solid(48, 48, 12);
    const cell: CombatCellState = { combatantId: 'dragon', side: 'enemy', col: 1, row: 1, icon, size: 2 };
    const fb = composeCombatScreen({ cells: [cell], message: '' });
    const g = COK_COMBAT_GEOMETRY;
    const x0 = g.originX + g.cellW;
    const y0 = g.originY + g.cellH;

    expect(px(fb, x0, y0)).toBe(12);
    expect(px(fb, x0 + 47, y0 + 47)).toBe(12);
    // A second enlargement would spill another 48 pixels to the right of the footprint.
    expect(px(fb, x0 + 48, y0 + 24)).not.toBe(12);
  });

  it('uses combat chrome, not the dungeon inner viewport frame, over the tactical field', () => {
    const fb = composeCombatScreen({
      backdrop: { tiles: [solid(24, 24, 7)], fillTile: 0 },
      frameTiles: Array.from({ length: 38 }, (_, i) => solid(8, 8, i === 24 ? 8 : 10)),
    });
    // The old dungeon compositor drew its vertical separator at col 16 (x=128), which cuts straight
    // through the confirmed combat field. That pixel must remain battlefield backdrop.
    expect(px(fb, 128, 64)).toBe(7);
    // Combat's own divider starts after the full 168px field, at x=176.
    expect(px(fb, 176, 64)).toBe(8);
  });

  it('renders the command menu with the selected item highlighted (white) vs idle (green)', () => {
    const font = loadCokFontOrSkip();
    if (!font) return;
    const fb = composeCombatScreen({ font, menu: { items: ['MOVE', 'ATTACK', 'CAST'], selected: 1 } });
    // Row 24 (y=192). Some white (selected) and some green (idle) pixels must appear.
    let white = 0;
    let green = 0;
    for (let x = 8; x < 312; x++) {
      for (let y = 192; y < 200; y++) {
        const v = px(fb, x, y);
        if (v === 15) white++;
        else if (v === 10) green++;
      }
    }
    expect(white).toBeGreaterThan(0);
    expect(green).toBeGreaterThan(0);
  });

  it('can render an input prompt before a command menu on the bottom row', () => {
    const font = loadCokFontOrSkip();
    if (!font) return;
    const fb = composeCombatScreen({ font, menu: { prompt: 'Aim:', items: ['NEXT'], selected: 0 } });
    let promptGreen = 0;
    let selectedWhite = 0;
    for (let x = 8; x < 48; x++) {
      for (let y = 192; y < 200; y++) if (px(fb, x, y) === 10) promptGreen++;
    }
    for (let x = 48; x < 96; x++) {
      for (let y = 192; y < 200; y++) if (px(fb, x, y) === 15) selectedWhite++;
    }
    expect(promptGreen).toBeGreaterThan(0);
    expect(selectedWhite).toBeGreaterThan(0);
  });

  it('greys a downed party-panel row (M42.S1), white wins over down, green is the default', () => {
    const font = loadCokFontOrSkip();
    if (!font) return;
    // Row 4 = PANEL_FIRST_PLAYER_ROW (y 32..39), name text starts at col 23 = PANEL_COL (x 184..),
    // outside the x[8,176) tactical field.
    const rowHasColor = (fb: { width: number; indices: Uint8Array }, color: number) => {
      for (let x = 184; x < 256; x++) {
        for (let y = 32; y < 40; y++) {
          if (px(fb, x, y) === color) return true;
        }
      }
      return false;
    };
    const downFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 0, down: true }] });
    expect(rowHasColor(downFb, 8)).toBe(true); // C_GRAY somewhere in the row
    expect(rowHasColor(downFb, 10)).toBe(false); // never green

    const activeDownFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 0, down: true, active: true }] });
    expect(rowHasColor(activeDownFb, 15)).toBe(true); // C_WHITE — active still wins over down
    expect(rowHasColor(activeDownFb, 8)).toBe(false);

    const standingFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 9 }] });
    expect(rowHasColor(standingFb, 10)).toBe(true); // C_GREEN — the pre-existing default, no `down`
    expect(rowHasColor(standingFb, 8)).toBe(false);
  });

  it('marks an impaired party-panel row yellow (M69.S1); down wins over impaired, active wins over both', () => {
    const font = loadCokFontOrSkip();
    if (!font) return;
    const rowHasColor = (fb: { width: number; indices: Uint8Array }, color: number) => {
      for (let x = 184; x < 256; x++) {
        for (let y = 32; y < 40; y++) {
          if (px(fb, x, y) === color) return true;
        }
      }
      return false;
    };
    const impairedFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 9, impaired: true }] });
    expect(rowHasColor(impairedFb, 14)).toBe(true); // C_YELLOW
    expect(rowHasColor(impairedFb, 10)).toBe(false); // never green

    const downBeatsImpairedFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 0, down: true, impaired: true }] });
    expect(rowHasColor(downBeatsImpairedFb, 8)).toBe(true); // C_GRAY — down still wins over impaired
    expect(rowHasColor(downBeatsImpairedFb, 14)).toBe(false);

    const activeBeatsImpairedFb = composeCombatScreen({ font, party: [{ name: 'Fizban', ac: 5, hp: 9, active: true, impaired: true }] });
    expect(rowHasColor(activeBeatsImpairedFb, 15)).toBe(true); // C_WHITE — active still wins
    expect(rowHasColor(activeBeatsImpairedFb, 14)).toBe(false);
  });

  it('renders combat summary HP with CoAB display_hp-style full/damaged/highlighted colours', () => {
    const font = loadCokFontOrSkip();
    if (!font) return;
    const summaryHpHasColor = (fb: { width: number; indices: Uint8Array }, color: number) => {
      for (let x = 288; x < 312; x++) {
        for (let y = 32; y < 40; y++) {
          if (px(fb, x, y) === color) return true;
        }
      }
      return false;
    };
    const fullFb = composeCombatScreen({ font, summary: { name: 'Draconian', hp: 14, hpState: 'full', ac: 6 } });
    expect(summaryHpHasColor(fullFb, 10)).toBe(true); // C_GREEN — full HP
    expect(summaryHpHasColor(fullFb, 14)).toBe(false);

    const hurtFb = composeCombatScreen({ font, summary: { name: 'Draconian', hp: 5, hpState: 'damaged', ac: 6 } });
    expect(summaryHpHasColor(hurtFb, 14)).toBe(true); // C_YELLOW — damaged HP
    expect(summaryHpHasColor(hurtFb, 10)).toBe(false);

    const highlightedFb = composeCombatScreen({ font, summary: { name: 'Draconian', hp: 14, hpState: 'highlighted', ac: 6 } });
    expect(summaryHpHasColor(highlightedFb, 13)).toBe(true); // C_MAGENTA — highlighted HP
    expect(summaryHpHasColor(highlightedFb, 10)).toBe(false);

    const downFb = composeCombatScreen({ font, summary: { name: 'Draconian', hp: 0, hpState: 'damaged', ac: 6, down: true } });
    expect(summaryHpHasColor(downFb, 8)).toBe(true); // C_GRAY still wins for downed targets
    expect(summaryHpHasColor(downFb, 14)).toBe(false);
  });
});

/** Load the real CoK font if the GOG asset is present; else return null so the test self-skips. */
function loadCokFontOrSkip(): ReturnType<typeof loadCokFont> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync, existsSync } = require('node:fs');
    const { resolve } = require('node:path');
    const p = resolve(__dirname, '../../../Champions of Krynn/8X8D1.DAX');
    if (!existsSync(p)) return null;
    return loadCokFont(new Uint8Array(readFileSync(p)));
  } catch {
    return null;
  }
}

// keep makeEgaPalette imported (used by the manual harness / future RGBA goldens)
void makeEgaPalette;
