/**
 * Compose the Adventurer's **Journal** screen into one indexed 320×200 framebuffer — the bordered
 * page the party reads recorded entries from (A5.4). Layout: a title, a scrolling list of entry
 * headings (each "N TITLE", an unread '*' marker, coloured by category, the cursor row in white with
 * '>'), a separator, then a reading pane that word-wraps the selected entry's body, and a command
 * bar. Pure / DOM-free, mirroring {@link composeTownScreen}.
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
import type { JournalCategory } from '../world/journal.js';

const C_BLACK = 0;
const C_GREEN = 10;
const C_WHITE = 15;
const C_YELLOW = 14;
const C_CYAN = 11;
const C_GREY = 8;
const C_RED = 12;

/** Per-category list colour for an idle (non-cursor) row. */
const CATEGORY_COLOR: Record<JournalCategory, number> = {
  story: C_GREEN,
  quest: C_YELLOW,
  rumour: C_CYAN,
  lore: C_GREY,
};

/** One heading in the entry list. */
export interface JournalLineView {
  id: number;
  title: string;
  category: JournalCategory;
  read: boolean;
}

/** The expanded page currently being read (the reading pane). */
export interface JournalReadingView {
  id: number;
  title: string;
  body: string;
  category: JournalCategory;
  day?: number;
}

export interface JournalView {
  /** Screen title; defaults to "ADVENTURER'S JOURNAL". */
  title?: string;
  /** The entry headings, in display order. */
  entries: JournalLineView[];
  /** Cursor row into `entries` (0-based); -1 / undefined for none. */
  cursor?: number;
  /** The selected entry expanded for reading; omit to show the empty-pane hint. */
  reading?: JournalReadingView | null;
  /** Status / prompt line near the bottom. */
  status?: string;
}

export interface JournalInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: JournalView;
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Visible heading rows in the list region (rows 5..11). */
export const JOURNAL_LIST_ROWS = 7;
/** Body lines shown in the reading pane (rows 14..21). */
export const JOURNAL_BODY_ROWS = 8;
/** Wrap width (character columns) for the reading pane. */
export const JOURNAL_WRAP_COLS = 36;

/** Greedy word-wrap to `maxCols` columns; hard-breaks any single word longer than the width. */
export function wrapText(text: string, maxCols: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    let line = '';
    for (const word of rawLine.split(/\s+/).filter(Boolean)) {
      let w = word;
      // A word longer than the line: emit full-width chunks until it fits.
      while (w.length > maxCols) {
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, maxCols));
        w = w.slice(maxCols);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= maxCols) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    out.push(line); // keep blank lines (paragraph breaks)
  }
  return out;
}

/**
 * Build the journal screen as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 2  title (white)            row 3  unread count (yellow) when any
 *   rows 5..11  entry list (cursor white '>', unread '*', category colour)
 *   row 13 separator caption        rows 14..21 reading pane (wrapped body)
 *   row 22 status                   row 24 command bar
 */
export function composeJournalScreen(input: JournalInput): IndexedFramebuffer {
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

  drawText(fb, font, (v.title ?? "Adventurer's Journal").toUpperCase(), cell(2), rowY(2), C_WHITE);
  const unread = v.entries.filter((e) => !e.read).length;
  if (unread > 0) drawText(fb, font, `${unread} NEW`, cell(32), rowY(2), C_YELLOW);

  // Entry list (scrolls to keep the cursor in view).
  const total = v.entries.length;
  if (total === 0) {
    drawText(fb, font, 'THE JOURNAL IS EMPTY.', cell(3), rowY(6), C_GREY);
  } else {
    let start = 0;
    if (cursor >= 0 && total > JOURNAL_LIST_ROWS) {
      start = Math.min(Math.max(0, cursor - (JOURNAL_LIST_ROWS >> 1)), total - JOURNAL_LIST_ROWS);
    }
    for (let i = 0; i < JOURNAL_LIST_ROWS && start + i < total; i++) {
      const idx = start + i;
      const r = 5 + i;
      const e = v.entries[idx]!;
      const isCursor = idx === cursor;
      const color = isCursor ? C_WHITE : CATEGORY_COLOR[e.category];
      drawText(fb, font, isCursor ? '>' : ' ', cell(2), rowY(r), C_WHITE);
      if (!e.read) drawText(fb, font, '*', cell(3), rowY(r), C_RED);
      drawText(fb, font, `${e.id}`, cell(4), rowY(r), C_YELLOW);
      const title = e.title.toUpperCase().slice(0, 28);
      drawText(fb, font, title, cell(8), rowY(r), color);
    }
  }

  // Reading pane: a white "N. TITLE" header at row 13, then the wrapped body from row 14.
  if (v.reading) {
    // M41.S1 — the game day this entry was recorded (row 12, otherwise-unused). Gated on truthy
    // day so day===0/undefined ("unknown/pre-dated", journal.ts's own convention) shows nothing.
    if (v.reading.day) {
      drawText(fb, font, `RECORDED — DAY ${v.reading.day}`.toUpperCase(), cell(2), rowY(12), C_GREY);
    }
    const head = `${v.reading.id}. ${v.reading.title.toUpperCase()}`.slice(0, 36);
    drawText(fb, font, head, cell(2), rowY(13), C_WHITE);
    const wrapped = wrapText(v.reading.body, JOURNAL_WRAP_COLS).slice(0, JOURNAL_BODY_ROWS);
    wrapped.forEach((line, i) => {
      drawText(fb, font, line.toUpperCase(), cell(2), rowY(14 + i), C_GREEN);
    });
  } else {
    drawText(fb, font, '— ENTRY —', cell(2), rowY(13), C_GREY);
    drawText(fb, font, 'SELECT AN ENTRY TO READ IT.', cell(2), rowY(14), C_GREY);
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
