/**
 * Compose the Champions of Krynn **treasure** screen into a single indexed 320×200 framebuffer — the
 * bordered page shown after a won battle: a "TREASURE" header, the recovered gold, the dropped items
 * listed down the page (a cursor row highlighted, already-taken rows tagged), and a Take-All / Money
 * / Items / Exit command bar. Pure / DOM-free, mirroring {@link composeInventory}.
 */
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
import type { IndexedImage } from '../model/index.js';

const C_BLACK = 0;
const C_GREEN = 10;
const C_WHITE = 15;
const C_YELLOW = 14; // gold
const C_GREY = 8; // taken / spent rows

export interface TreasureRowView {
  label: string;
  taken: boolean;
}

export interface TreasureView {
  /** Recovered gold (steel pieces). */
  gold: number;
  /** True once the gold has been collected. */
  goldTaken: boolean;
  rows: TreasureRowView[];
  /** Cursor row (0-based); -1 for none. */
  cursor: number;
  /** Optional status line, e.g. "ALL TREASURE TAKEN". */
  status?: string;
}

export interface TreasureInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: TreasureView;
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Maximum item rows shown between the gold line and the command bar. */
export const TREASURE_VISIBLE_ROWS = 14;

/**
 * Build the treasure screen as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 2  "TREASURE" (white)
 *   row 4  "GOLD: n" (yellow; grey "TAKEN" once collected)
 *   rows 6..19  item rows (cursor in white, taken rows greyed + "TAKEN")
 *   row 22 status line
 *   row 24 command bar
 */
export function composeTreasure(input: TreasureInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;
  const v = input.view;
  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  drawText(fb, font, 'TREASURE', cell(2), rowY(2), C_WHITE);
  if (v.goldTaken) {
    drawText(fb, font, `GOLD: ${v.gold}`, cell(2), rowY(4), C_GREY);
    drawText(fb, font, 'TAKEN', cell(14), rowY(4), C_GREY);
  } else {
    drawText(fb, font, `GOLD: ${v.gold}`, cell(2), rowY(4), C_YELLOW);
  }

  const total = v.rows.length;
  let start = 0;
  if (v.cursor >= 0 && total > TREASURE_VISIBLE_ROWS) {
    start = Math.min(Math.max(0, v.cursor - (TREASURE_VISIBLE_ROWS >> 1)), total - TREASURE_VISIBLE_ROWS);
  }
  if (total === 0) {
    drawText(fb, font, '(NO ITEMS)', cell(3), rowY(6), C_GREEN);
  }
  for (let i = 0; i < TREASURE_VISIBLE_ROWS && start + i < total; i++) {
    const idx = start + i;
    const r = 6 + i;
    const item = v.rows[idx];
    const isCursor = idx === v.cursor;
    const color = item.taken ? C_GREY : isCursor ? C_WHITE : C_GREEN;
    drawText(fb, font, isCursor && !item.taken ? '>' : ' ', cell(2), rowY(r), C_WHITE);
    drawText(fb, font, item.label.toUpperCase(), cell(3), rowY(r), color);
    if (item.taken) drawText(fb, font, 'TAKEN', cell(31), rowY(r), C_GREY);
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
