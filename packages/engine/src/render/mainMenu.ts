/**
 * Compose the Champions of Krynn **main game menu** (the "party formation" / startup screen) into a
 * single indexed 320×200 framebuffer — the bordered page the original engine shows after the title,
 * where you build your party and choose **Begin Adventuring**. Layout: the game title at the top, the
 * current party roster (name / class+level / AC / HP, or a "(no characters)" hint when empty), then
 * the command menu — the engine's own wrapped hotkey bar — across the lower rows.
 *
 * **The option list and title are transcribed byte-for-byte from `START.EXE`** (the menu strings live
 * at the executable's data segment, each on its own line): "Create New Character / Drop Character /
 * Modify Character / Train Character / View Character / Add Character to Party / Remove Character from
 * Party / Load Saved Game / Begin Adventuring / Exit to DOS", under the title "Champions of Krynn".
 * Every CoK first-letter is unique, so the standard first-letter-hotkey idiom maps cleanly. Pure /
 * DOM-free, mirroring {@link composeJournalScreen} / {@link composeTownScreen}.
 */
import {
  createFramebuffer,
  fillRectIndexed,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedFramebuffer,
} from './screen.js';
import { drawText, type BitmapFont } from './textmode.js';
import { COK_FRAME_LAYOUT, drawOuterBorder, type ExploreFrameLayout } from './exploreScreen.js';
import type { IndexedImage } from '../model/index.js';

const C_BLACK = 0;
const C_GREEN = 10;
const C_WHITE = 15;
const C_YELLOW = 14;
const C_GREY = 8;
const C_RED = 12;

/** The CoK main-menu options, byte-verified from START.EXE, in the original order. */
export const COK_MAIN_MENU = [
  'Create New Character',
  'Drop Character',
  'Modify Character',
  'Train Character',
  'View Character',
  'Add Character to Party',
  'Remove Character from Party',
  'Load Saved Game',
  'Begin Adventuring',
  'Exit to DOS',
] as const;

/** The title drawn at the top of the menu (START.EXE: "Champions of Krynn v1.2"). */
export const COK_MAIN_MENU_TITLE = 'Champions of Krynn';

/** One roster line on the party-formation screen. */
export interface MainMenuMember {
  name: string;
  /** Short class label, e.g. "KN" or "FTR/MU". */
  cls: string;
  level?: number;
  ac: number;
  hp: number;
  maxHp: number;
  /** Dimmed when the character is unconscious/dead. */
  down?: boolean;
  dead?: boolean;
}

export interface MainMenuView {
  /** Screen title; defaults to {@link COK_MAIN_MENU_TITLE}. */
  title?: string;
  /** Current party roster (may be empty before any character is created/added). */
  roster: MainMenuMember[];
  /** The command options; defaults to {@link COK_MAIN_MENU}. */
  options?: readonly string[];
  /** Cursor index into `options` (0-based). */
  selected: number;
  /** Status / prompt line near the bottom. */
  status?: string;
}

export interface MainMenuInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: MainMenuView;
}

/** Visible roster rows on the screen (rows 6..15). */
export const MAIN_MENU_ROSTER_ROWS = 10;
/** The row the wrapped command menu starts on. */
export const MAIN_MENU_MENU_ROW = 17;
/** Usable column span for the wrapped menu [left, right). */
const MENU_COL_LEFT = 2;
const MENU_COL_RIGHT = 38;

/** Where a drawn menu option sits, for click/touch hit-testing. */
export interface MainMenuHit {
  index: number;
  /** Left pixel (inclusive). */
  x0: number;
  /** Top pixel (inclusive). */
  y0: number;
  /** Right pixel (exclusive). */
  x1: number;
  /** Bottom pixel (exclusive). */
  y1: number;
}

/**
 * Flow the command options across rows like the engine's `displayInput` wrapping: pack items
 * left-to-right with a one-column gap, wrap to the next row when the next item would overrun the
 * usable width. The selected item is drawn fully in white; others show a white hotkey first-letter
 * and a green body. Returns each option's pixel rectangle for hit-testing.
 */
export function layoutMainMenu(
  fb: IndexedFramebuffer | null,
  font: BitmapFont | null,
  options: readonly string[],
  selected: number,
  startRow: number,
): MainMenuHit[] {
  const hits: MainMenuHit[] = [];
  let col = MENU_COL_LEFT;
  let row = startRow;
  options.forEach((item, i) => {
    const label = item.toUpperCase();
    const widthCols = label.length;
    // Wrap if this item would overrun the usable width (but always place at least one per row).
    if (col > MENU_COL_LEFT && col + widthCols > MENU_COL_RIGHT) {
      col = MENU_COL_LEFT;
      row += 1;
    }
    const x = col * 8;
    const y = row * 8;
    if (fb && font) {
      if (i === selected) {
        drawText(fb, font, label, x, y, C_WHITE);
      } else if (label.length > 0) {
        drawText(fb, font, label[0]!, x, y, C_WHITE);
        if (label.length > 1) drawText(fb, font, label.slice(1), x + 8, y, C_GREEN);
      }
    }
    hits.push({ index: i, x0: x, y0: y, x1: x + widthCols * 8, y1: y + 8 });
    col += widthCols + 1; // one-column gap
  });
  return hits;
}

/**
 * Build the main-menu screen as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 2  game title (white, centred)
 *   row 4  roster header ("NAME ... AC HP")
 *   rows 6..15  party roster (or the empty-party hint)
 *   row 17+ wrapped command menu
 *   row 22 status line
 */
export function composeMainMenu(input: MainMenuInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;

  const v = input.view;
  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  // Title, centred across the 40-column screen.
  const title = (v.title ?? COK_MAIN_MENU_TITLE).toUpperCase();
  const titleCol = Math.max(2, Math.floor((40 - title.length) / 2));
  drawText(fb, font, title, cell(titleCol), rowY(2), C_WHITE);

  // Roster header + rows.
  drawText(fb, font, 'NAME', cell(2), rowY(4), C_GREY);
  drawText(fb, font, 'CLASS', cell(16), rowY(4), C_GREY);
  drawText(fb, font, 'AC', cell(26), rowY(4), C_GREY);
  drawText(fb, font, 'HP', cell(30), rowY(4), C_GREY);

  if (v.roster.length === 0) {
    drawText(fb, font, '(NO CHARACTERS IN PARTY)', cell(3), rowY(6), C_GREEN);
    drawText(fb, font, 'CREATE OR ADD CHARACTERS, THEN', cell(3), rowY(8), C_GREY);
    drawText(fb, font, 'CHOOSE BEGIN ADVENTURING.', cell(3), rowY(9), C_GREY);
  } else {
    for (let i = 0; i < MAIN_MENU_ROSTER_ROWS && i < v.roster.length; i++) {
      const m = v.roster[i]!;
      const r = 6 + i;
      const color = m.dead ? C_RED : m.down ? C_YELLOW : C_GREEN;
      drawText(fb, font, `${i + 1}`, cell(1), rowY(r), C_YELLOW);
      drawText(fb, font, m.name.toUpperCase().slice(0, 12), cell(2), rowY(r), color);
      const cls = (m.level ? `${m.cls} ${m.level}` : m.cls).toUpperCase().slice(0, 9);
      drawText(fb, font, cls, cell(16), rowY(r), color);
      drawText(fb, font, String(m.ac), cell(26), rowY(r), color);
      drawText(fb, font, `${m.hp}/${m.maxHp}`, cell(30), rowY(r), color);
    }
  }

  // The command menu (wrapped hotkey bar).
  layoutMainMenu(fb, font, v.options ?? COK_MAIN_MENU, v.selected, MAIN_MENU_MENU_ROW);

  if (v.status) drawText(fb, font, v.status.toUpperCase().slice(0, 36), cell(2), rowY(22), C_WHITE);

  return fb;
}
