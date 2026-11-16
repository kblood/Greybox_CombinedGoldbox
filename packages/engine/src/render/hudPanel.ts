/**
 * Compose the **HUD companion panel** (D2) into one indexed 320×200 framebuffer — an always-available
 * read-only roster sheet the player can pop over any screen to check the party at a glance: each
 * member's name, HP (cur/max), XP, AC, class/level, and condition (down / dead / active). It reuses
 * the exploration screen's right-panel layout idiom (a tabular NAME … AC HP row per member) but lays
 * the columns out across the full bordered page so the extra XP / class / status fields fit.
 *
 * Pure / DOM-free, mirroring {@link composeJournalScreen}: the border is drawn from the game's own
 * 8×8 frame tiles via {@link drawOuterBorder}, text via the 8X8D bitmap font. The web overlay
 * (`apps/web/src/ui/hudPanel.ts`) feeds it live `partyStatus()` + `getXp` rows.
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

// ── EGA colour indices (match the exploration UI palette, see exploreScreen §8) ──────────────
const C_BLACK = 0;
const C_GREEN = 10; // bright green — idle member rows / values
const C_GREY = 8; // dimmed — column headers / hints
const C_YELLOW = 14; // XP values
const C_WHITE = 15; // headers / title
const C_RED = 12; // dead member
const C_BROWN = 6; // unconscious (down but not dead)

/** One party member's read-only status, as shown in the HUD panel. */
export interface HudRow {
  name: string;
  /** Current hit points (may be ≤ 0 when down). */
  hp: number;
  /** Maximum hit points. */
  maxHp: number;
  /** Experience points. */
  xp: number;
  /** Armour class (lower is better, AD&D). */
  ac: number | string;
  /** Short class/level label, e.g. "FTR 3". */
  cls: string;
  /** At/below 0 HP — fallen (unconscious OR dead). */
  down: boolean;
  /** Permanently slain — needs a Raise Dead. Implies {@link down}. */
  dead: boolean;
}

export interface HudPanelInput {
  /** The 8×8 frame tiles (e.g. `8X8D1.DAX` block 202) the border is drawn from. Border skipped if absent. */
  frameTiles?: IndexedImage[] | null;
  /** Placement layout for `frameTiles`. Defaults to {@link COK_FRAME_LAYOUT}. */
  frameLayout?: ExploreFrameLayout;
  /** Text font (block 201). When absent, all text is skipped (frame still renders). */
  font?: BitmapFont | null;
  /** Screen title; defaults to "PARTY STATUS". */
  title?: string;
  /** Party rows, in marching order (max {@link HUD_MAX_ROWS} shown). */
  rows: HudRow[];
  /** Status / hint line near the bottom. */
  status?: string;
  /** Optional command bar (Gold Box style). */
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Maximum member rows shown (a Gold Box party caps at six, with a couple of NPC slots over it). */
export const HUD_MAX_ROWS = 8;

/** First member row (8×8 cell grid). */
const FIRST_ROW = 5;
/** Column origins (8×8 cells) for each field. */
const COL_NAME = 2;
const COL_CLASS = 13;
const COL_AC = 21;
const COL_HP = 25;
const COL_XP = 31;
const TITLE_ROW = 2;
const HEADER_ROW = 4;
const STATUS_ROW = 22;
const MENU_ROW = 24;

/** Per-member row colour: red if dead, brown if merely down, else green. */
function rowColor(r: HudRow): number {
  if (r.dead) return C_RED;
  if (r.down) return C_BROWN;
  return C_GREEN;
}

/** A short condition tag for the HP column when fallen. */
function conditionTag(r: HudRow): string | null {
  if (r.dead) return 'DEAD';
  if (r.down) return 'DOWN';
  return null;
}

/**
 * Build the HUD companion panel as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 2  title (white)
 *   row 4  column headers (grey): NAME / CLASS / AC / HP / XP
 *   rows 5..  one row per member: name + class (row colour), AC, "cur/max" HP (+ DOWN/DEAD tag), XP (yellow)
 *   row 22 status (white)            row 24 command bar (when given)
 */
export function composeHudPanel(input: HudPanelInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;

  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  drawText(fb, font, (input.title ?? 'Party Status').toUpperCase(), cell(COL_NAME), rowY(TITLE_ROW), C_WHITE);

  // Column headers.
  drawText(fb, font, 'NAME', cell(COL_NAME), rowY(HEADER_ROW), C_GREY);
  drawText(fb, font, 'CLASS', cell(COL_CLASS), rowY(HEADER_ROW), C_GREY);
  drawText(fb, font, 'AC', cell(COL_AC), rowY(HEADER_ROW), C_GREY);
  drawText(fb, font, 'HP', cell(COL_HP), rowY(HEADER_ROW), C_GREY);
  drawText(fb, font, 'XP', cell(COL_XP), rowY(HEADER_ROW), C_GREY);

  const rows = (input.rows ?? []).slice(0, HUD_MAX_ROWS);
  if (rows.length === 0) {
    drawText(fb, font, 'NO PARTY.', cell(COL_NAME), rowY(FIRST_ROW + 1), C_GREY);
  } else {
    rows.forEach((m, i) => {
      const r = FIRST_ROW + i;
      const color = rowColor(m);
      drawText(fb, font, m.name.toUpperCase().slice(0, 10), cell(COL_NAME), rowY(r), color);
      drawText(fb, font, m.cls.toUpperCase().slice(0, 8), cell(COL_CLASS), rowY(r), color);
      drawText(fb, font, String(m.ac), cell(COL_AC), rowY(r), color);
      drawText(fb, font, `${m.hp}/${m.maxHp}`, cell(COL_HP), rowY(r), color);
      drawText(fb, font, String(m.xp), cell(COL_XP), rowY(r), C_YELLOW);
      const tag = conditionTag(m);
      if (tag) drawText(fb, font, tag, cell(COL_HP + 5), rowY(r), m.dead ? C_RED : C_BROWN);
    });
  }

  if (input.status) drawText(fb, font, input.status.toUpperCase().slice(0, 36), cell(COL_NAME), rowY(STATUS_ROW), C_WHITE);

  if (input.menu && input.menu.items.length > 0) {
    drawHorizontalMenu(fb, font, input.menu.items, {
      x: cell(1),
      y: rowY(MENU_ROW),
      selected: input.menu.selected,
      idleColor: C_GREEN,
      selColor: C_WHITE,
    });
  }

  return fb;
}
