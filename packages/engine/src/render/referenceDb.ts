/**
 * Compose the **Reference DB** browser (D5) into one indexed 320×200 framebuffer — a Gold Box
 * Companion-style cyclopedia: pick a category (Monsters / Items / Spells), scroll a name list on
 * the left, and read the selected entry's stat sheet on the right. The compositor is data-neutral:
 * the host decodes the game's real tables (engine `decodeMonsterArchive` / `decodeItemArchive` /
 * the `COK_SPELLS` ruleset list) and flattens each entry into a `{name, tag}` row plus a list of
 * `{label, value}` detail rows. Pure / DOM-free, mirroring {@link composeEclInspector}.
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
const C_YELLOW = 14;
const C_GREY = 8;
const C_CYAN = 11;

/** One entry in the name list (left column). */
export interface RefDbEntry {
  /** Display name. */
  name: string;
  /** Optional right-aligned annotation (e.g. a category letter or spell level). */
  tag?: string;
}

/** One labelled field in the detail sheet (right column). */
export interface RefDbDetailRow {
  label: string;
  value: string;
}

export interface ReferenceDbView {
  /** Screen title; defaults to "REFERENCE DB". */
  title?: string;
  /** Active category label, e.g. "MONSTERS". */
  category: string;
  /** Optional game/source tag, e.g. "COK". */
  game?: string;
  /** The name list, **already windowed** to fit the visible rows, in display order. */
  entries: RefDbEntry[];
  /** Index of the highlighted row within `entries` (the visible window). */
  selected: number;
  /** Selected entry's name, drawn as the detail header. */
  detailTitle?: string;
  /** The selected entry's stat sheet. */
  detail: RefDbDetailRow[];
  /** Status / prompt line. */
  status?: string;
}

export interface ReferenceDbInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: ReferenceDbView;
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Visible rows in the name list (rows 4..16). */
export const REFERENCE_DB_LIST_ROWS = 13;
/**
 * Visible rows in the detail sheet (rows 5..17).
 *
 * The draw loop below TRUNCATES at this cap — no scroll, no ellipsis, no warning — so a longer
 * stat sheet silently loses its tail. Headroom is currently ZERO: 17 real corpus records already
 * emit exactly 13 rows. `test/referenceDbDetailCap.test.ts` is the gate that makes the next
 * overflow loud instead of invisible; raise this number deliberately (moving the status line at
 * row 22 down as needed) rather than relaxing that test.
 */
export const REFERENCE_DB_DETAIL_ROWS = 13;
/** Left column where the name list starts, and where the detail sheet starts. */
const LIST_COL = 2;
const DETAIL_COL = 22;

/**
 * Build the Reference DB browser as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 2  title (white)               · row 2 col 22 category (cyan) + game tag (grey)
 *   rows 4..16  name list (left cols 2..20; selected white '>'; tag grey right-aligned)
 *   row 4  detail header (yellow, right col 22)        · rows 5..16 detail rows (label grey/value white)
 *   row 22 status                       · row 24 command bar
 */
export function composeReferenceDb(input: ReferenceDbInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;

  const v = input.view;
  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  drawText(fb, font, (v.title ?? 'Reference DB').toUpperCase(), cell(2), rowY(2), C_WHITE);
  drawText(fb, font, v.category.toUpperCase().slice(0, 12), cell(DETAIL_COL), rowY(2), C_CYAN);
  if (v.game) drawText(fb, font, v.game.toUpperCase().slice(0, 4), cell(36), rowY(2), C_GREY);

  // Name list (left column).
  const rows = Math.min(REFERENCE_DB_LIST_ROWS, v.entries.length);
  for (let i = 0; i < rows; i++) {
    const e = v.entries[i]!;
    const r = 4 + i;
    const sel = i === v.selected;
    if (sel) drawText(fb, font, '>', cell(LIST_COL), rowY(r), C_WHITE);
    drawText(fb, font, e.name.toUpperCase().slice(0, 15), cell(LIST_COL + 1), rowY(r), sel ? C_WHITE : C_GREEN);
    if (e.tag) drawText(fb, font, e.tag.toUpperCase().slice(0, 3), cell(LIST_COL + 17), rowY(r), C_GREY);
  }
  if (rows === 0) drawText(fb, font, '(NO ENTRIES)', cell(LIST_COL + 1), rowY(4), C_GREY);

  // Detail sheet (right column).
  if (v.detailTitle) {
    drawText(fb, font, v.detailTitle.toUpperCase().slice(0, 16), cell(DETAIL_COL), rowY(4), C_YELLOW);
  }
  const drows = Math.min(REFERENCE_DB_DETAIL_ROWS, v.detail.length);
  for (let i = 0; i < drows; i++) {
    const d = v.detail[i]!;
    const r = 5 + i;
    drawText(fb, font, d.label.toUpperCase().slice(0, 9), cell(DETAIL_COL), rowY(r), C_GREY);
    drawText(fb, font, d.value.toUpperCase().slice(0, 8), cell(DETAIL_COL + 9), rowY(r), C_WHITE);
  }

  if (v.status) drawText(fb, font, v.status.toUpperCase().slice(0, 36), cell(2), rowY(22), C_CYAN);

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
