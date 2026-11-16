/**
 * Compose a Champions of Krynn **town** screen into a single indexed 320×200 framebuffer — the
 * bordered page shared by the town hub and every location inside it (shop, temple, training hall,
 * tavern): a title, the party's steel, a scrolling list of lines (each optionally cursor-highlighted
 * and/or showing a right-aligned price/cost), a status line, and a command bar. One generic
 * compositor renders them all by varying the title + lines + menu. Pure / DOM-free, mirroring
 * {@link composeTreasure}.
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
const C_YELLOW = 14; // steel / prices
const C_GREY = 8; // disabled / unavailable lines

export interface TownLine {
  text: string;
  /** A steel-piece amount shown right-aligned (a buy/sell price or service cost); omit for none. */
  price?: number;
  /** Override colour (e.g. grey for an unaffordable / unavailable line). */
  color?: number;
}

export interface TownView {
  /** Screen title, e.g. "TOWN OF KENDERMORE" or "ARMOURY". */
  title: string;
  /** The party's steel, shown under the title; omit to hide the steel line. */
  gold?: number;
  /** The body lines (menu options, stock, party members…). */
  lines: TownLine[];
  /** Cursor row into `lines` (0-based); -1 / undefined for none. */
  cursor?: number;
  /** Status / prompt line near the bottom. */
  status?: string;
}

export interface TownInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: TownView;
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Maximum body lines shown between the steel line and the command bar. */
export const TOWN_VISIBLE_ROWS = 14;

/** Column where a line's right-aligned price ends. */
const PRICE_END_COL = 36;

/**
 * Build a town screen as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 2  title (white)
 *   row 4  "STEEL: n" (yellow) — when a gold value is supplied
 *   rows 6..19  body lines (cursor in white with '>', price right-aligned in yellow)
 *   row 22 status line
 *   row 24 command bar
 */
export function composeTownScreen(input: TownInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;
  const v = input.view;
  const cursor = v.cursor ?? -1;
  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  drawText(fb, font, v.title.toUpperCase(), cell(2), rowY(2), C_WHITE);
  if (typeof v.gold === 'number') drawText(fb, font, `STEEL: ${v.gold}`, cell(2), rowY(4), C_YELLOW);

  const total = v.lines.length;
  let start = 0;
  if (cursor >= 0 && total > TOWN_VISIBLE_ROWS) {
    start = Math.min(Math.max(0, cursor - (TOWN_VISIBLE_ROWS >> 1)), total - TOWN_VISIBLE_ROWS);
  }
  for (let i = 0; i < TOWN_VISIBLE_ROWS && start + i < total; i++) {
    const idx = start + i;
    const r = 6 + i;
    const line = v.lines[idx]!;
    const isCursor = idx === cursor;
    const color = line.color ?? (isCursor ? C_WHITE : C_GREEN);
    drawText(fb, font, isCursor ? '>' : ' ', cell(2), rowY(r), C_WHITE);
    drawText(fb, font, line.text.toUpperCase(), cell(3), rowY(r), color);
    if (typeof line.price === 'number') {
      const label = String(line.price);
      drawText(fb, font, label, cell(PRICE_END_COL - label.length), rowY(r), C_YELLOW);
    }
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

// Re-export the disabled colour so a host can grey out lines consistently with the compositor.
export const TOWN_LINE_DISABLED = C_GREY;
