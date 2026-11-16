/**
 * Compose the Champions of Krynn **inventory** ("Items") screen into a single indexed 320×200
 * framebuffer — the bordered full-screen page the original engine shows when you View a character's
 * pack: the owner's name + recomputed AC/THAC0 at the top, the carried items listed down the page
 * (a cursor row highlighted, readied gear tagged "READY", stacks prefixed with their count), and a
 * command bar (Ready / Use / Drop / Next / Exit) on the bottom row. Pure / DOM-free, mirroring
 * {@link composeCharSheet} — same 8×8 frame tiles, font and EGA colours.
 *
 * The view model is flattened from an {@link Inventory} by the caller (so the engine stays unaware
 * of persistence); the AC/THAC0 shown come straight from the inventory recompute helpers.
 */
import type { IndexedImage } from '../model/index.js';
import {
  createFramebuffer,
  fillRectIndexed,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedFramebuffer,
} from './screen.js';
import { drawText, type BitmapFont } from './textmode.js';
import { drawHorizontalMenu } from './menuBar.js';
import { COK_FRAME_LAYOUT, drawOuterBorder, type ExploreFrameLayout } from './exploreScreen.js';

const C_BLACK = 0;
const C_GREEN = 10; // labels + idle rows
const C_WHITE = 15; // headers / readied items / cursor row
const C_CYAN = 11; // "READY" tag

/** One displayed inventory row. */
export interface InventoryRowView {
  /** Item label, e.g. "Long Sword" or "20 Arrow" (count folded in by the caller). */
  label: string;
  equipped: boolean;
}

export interface InventoryView {
  /** Owner name, shown top-left. */
  name: string;
  /** Recomputed armour class (from readied gear). */
  ac: number | string;
  /** Recomputed THAC0. */
  thac0: number | string;
  rows: InventoryRowView[];
  /** Cursor row (0-based); -1 for none. */
  cursor: number;
  /** Optional "1/4" position indicator, shown top-right. */
  index?: string;
  /** Optional carried weight, e.g. "49.0 LB" (A4.2). */
  weight?: string;
  /** Optional encumbrance label, e.g. "LIGHT" (A4.2). */
  encumbrance?: string;
  /** Optional status line (e.g. "GAVE LONG SWORD TO TANIS") shown just above the command bar. */
  status?: string;
}

export interface InventoryInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: InventoryView;
  /** Bottom-row command bar (e.g. "Ready Use Drop Next Exit"). */
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Maximum item rows that fit between the header and the command bar. */
export const INVENTORY_VISIBLE_ROWS = 14;

/**
 * Build the inventory screen as a 320×200 indexed framebuffer (resolve to RGBA with the EGA
 * palette to display). Layout (8×8 cell grid):
 *   row 2  owner name (white) · col 34 index "1/4"
 *   row 3  AC / THAC0 line
 *   rows 5..18  item rows (cursor row in white, "READY" tag in cyan at col 30)
 *   row 24 command bar
 */
export function composeInventory(input: InventoryInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;
  const v = input.view;
  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  drawText(fb, font, v.name.toUpperCase(), cell(2), rowY(2), C_WHITE);
  if (v.index) drawText(fb, font, v.index, cell(34), rowY(2), C_GREEN);
  drawText(fb, font, `AC ${v.ac}`, cell(2), rowY(3), C_GREEN);
  drawText(fb, font, `THAC0 ${v.thac0}`, cell(12), rowY(3), C_GREEN);
  if (v.weight) drawText(fb, font, `WT ${v.weight}`, cell(2), rowY(4), C_GREEN);
  if (v.encumbrance) drawText(fb, font, v.encumbrance.toUpperCase(), cell(14), rowY(4), C_CYAN);

  // Scroll the list so the cursor stays visible.
  const total = v.rows.length;
  let start = 0;
  if (v.cursor >= 0 && total > INVENTORY_VISIBLE_ROWS) {
    start = Math.min(
      Math.max(0, v.cursor - (INVENTORY_VISIBLE_ROWS >> 1)),
      total - INVENTORY_VISIBLE_ROWS,
    );
  }
  if (total === 0) {
    drawText(fb, font, '(NOTHING CARRIED)', cell(3), rowY(6), C_GREEN);
  }
  for (let i = 0; i < INVENTORY_VISIBLE_ROWS && start + i < total; i++) {
    const idx = start + i;
    const r = 5 + i;
    const item = v.rows[idx];
    const isCursor = idx === v.cursor;
    drawText(fb, font, isCursor ? '>' : ' ', cell(2), rowY(r), C_WHITE);
    drawText(fb, font, item.label.toUpperCase(), cell(3), rowY(r), isCursor ? C_WHITE : C_GREEN);
    if (item.equipped) drawText(fb, font, 'READY', cell(31), rowY(r), C_CYAN);
  }

  if (v.status) drawText(fb, font, v.status.toUpperCase(), cell(2), rowY(22), C_WHITE);

  if (input.menu && input.menu.items.length > 0) {
    drawHorizontalMenu(fb, font, input.menu.items, {
      x: cell(1),
      y: rowY(24),
      selected: input.menu.selected,
      idleColor: C_GREEN,
      selColor: C_WHITE,
    });
  }

  return fb;
}
