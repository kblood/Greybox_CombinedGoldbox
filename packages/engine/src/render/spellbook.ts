/**
 * Compose the Champions of Krynn spell **memorization** screen (A2.1) into a single indexed
 * 320×200 framebuffer — the bordered list page where a caster prepares spells: a title line
 * (character + class), a slot-usage subtitle, then the spell list grouped by spell level with a
 * per-level "used/total" header and the memorized count beside each spell, a cursor on the current
 * row, and a command bar (Memorize / Forget / Next / Exit). Pure / DOM-free, mirroring the other
 * compositors and reusing the same frame tiles, font, EGA colours, and outer-border helper.
 *
 * The compositor renders a pre-built, already-scrolled list of rows; the spell→slot logic
 * (`memorize`/`spellSlots`) lives in the ruleset, and the web layer turns it into these rows.
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
const C_GREEN = 10; // body text
const C_WHITE = 15; // headers / cursor row
const C_YELLOW = 14; // memorized-count marker

/** One rendered list row: a spell-level header or a selectable spell line. */
export interface SpellbookRow {
  /** Display text (e.g. "LEVEL 1   2/3" for a header, "MAGIC MISSILE" for a spell). */
  text: string;
  /** A spell-level header row (drawn in white, not selectable). */
  header?: boolean;
  /** The cursor is on this row (drawn in white with a "▶"). */
  selected?: boolean;
  /** Memorized copies of this spell (drawn as "×N" at the right when > 0). */
  count?: number;
}

export interface SpellbookView {
  /** Top line, e.g. "RAISTLIN — MAGE 5". */
  title: string;
  /** Second line, e.g. "MEMORIZE SPELLS   MOON: WAXING +1". */
  subtitle?: string;
  /** M98 — third line (row 4, previously blank), e.g. a cleric's deity-granted "Extra spells" list. */
  note?: string;
  /** The visible (already-scrolled) list rows, top to bottom. */
  rows: SpellbookRow[];
}

export interface SpellbookInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: SpellbookView;
  menu?: { items: readonly string[]; selected: number } | null;
}

const LIST_ROW0 = 5; // first list row (8×8 cell row)
const LIST_MAX = 16; // rows 5..20
const CURSOR_COL = 2;
const TEXT_COL = 4;
const COUNT_COL = 33;

/** Build the spellbook screen as a 320×200 indexed framebuffer. */
export function composeSpellbook(input: SpellbookInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;
  const v = input.view;
  const cell = (c: number) => c * 8;
  const row = (r: number) => r * 8;

  drawText(fb, font, v.title.toUpperCase(), cell(2), row(2), C_WHITE);
  if (v.subtitle) drawText(fb, font, v.subtitle.toUpperCase(), cell(2), row(3), C_GREEN);
  if (v.note) drawText(fb, font, v.note.toUpperCase(), cell(2), row(4), C_GREEN);

  v.rows.slice(0, LIST_MAX).forEach((r, i) => {
    const y = row(LIST_ROW0 + i);
    if (r.header) {
      drawText(fb, font, r.text.toUpperCase(), cell(2), y, C_WHITE);
      return;
    }
    const color = r.selected ? C_WHITE : C_GREEN;
    if (r.selected) drawText(fb, font, '\x10', cell(CURSOR_COL), y, C_WHITE); // ▶ (CP437 0x10)
    drawText(fb, font, r.text.toUpperCase(), cell(TEXT_COL), y, color);
    if (r.count && r.count > 0) drawText(fb, font, `x${r.count}`, cell(COUNT_COL), y, C_YELLOW);
  });

  if (input.menu && input.menu.items.length > 0) {
    drawHorizontalMenu(fb, font, input.menu.items, {
      x: cell(1),
      y: row(24),
      selected: input.menu.selected,
      idleColor: C_GREEN,
      selColor: C_WHITE,
    });
  }

  return fb;
}
