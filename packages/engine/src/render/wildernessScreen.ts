/**
 * Compose the Champions of Krynn **wilderness / overland travel** screen into a single indexed
 * 320×200 framebuffer — the bordered area-map page the party crosses between dungeons and towns: the
 * region name across the top, a top-down terrain map on the left (terrain-coloured 8×8 tiles, the
 * party marked, sites flagged), a right-hand info panel (current terrain / site, the game clock, a
 * status line), and a Move / Look / Camp / Map / Exit command bar. Pure / DOM-free, mirroring
 * {@link composeTreasure} and {@link composeExploreScreen}.
 *
 * The map is drawn into the left viewport region (the same 8×8 grid the exploration screen uses) and
 * scrolls to keep the party centred when the region is larger than the window. Terrain colours are
 * EGA indices chosen for legibility (water blue, plains green, forest dark green, mountains grey…).
 */
import {
  createFramebuffer,
  fillRectIndexed,
  blitTile,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedFramebuffer,
} from './screen.js';
import { drawText, type BitmapFont } from './textmode.js';
import { drawHorizontalMenu } from './menuBar.js';
import { COK_FRAME_LAYOUT, drawOuterBorder, MOON_COLUMNS, type ExploreFrameLayout } from './exploreScreen.js';
import type { Terrain } from '../world/wilderness.js';
import type { IndexedImage } from '../model/index.js';

const C_BLACK = 0;
const C_GREEN = 10;
const C_WHITE = 15;
const C_YELLOW = 14;

/** EGA index each terrain paints with on the area map. */
export const TERRAIN_COLOR: Record<Terrain, number> = {
  water: 1, // blue
  road: 7, // light grey track
  town: 14, // yellow
  plains: 2, // green
  forest: 6, // brown-green (darker than plains)
  hills: 4, // dark red / clay
  mountains: 8, // dark grey peaks
};

/** Per-tile view: its terrain plus whether the party stands here / it is a named site. */
export interface WildTileView {
  terrain: Terrain;
  party?: boolean;
  site?: boolean;
}

export interface WildernessView {
  /** Region name shown across the top. */
  areaName: string;
  width: number;
  height: number;
  /** width × height tiles, row-major. */
  tiles: readonly WildTileView[];
  /** Party position (used to centre the scroll window). */
  party: { x: number; y: number };
  /** Right-panel current-location label, e.g. "PLAINS" or "RIVERSIDE". */
  locationLabel: string;
  /** Right-panel game-clock string, e.g. "DAY 1  06:00". */
  time: string;
  /** Optional status line (arrival / encounter / blocked). */
  status?: string;
}

export interface WildernessInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  /** M62.S1 — the three moons, drawn over the top frame row at the same MOON_COLUMNS
   * `composeExploreScreen` uses. This screen's border already reuses the identical
   * COK_FRAME_LAYOUT/block-202 asset (bracket-flanked slots at these exact columns already
   * exist in the art, currently unused). Entries may be null to skip. */
  moons?: (IndexedImage | null)[];
  font?: BitmapFont | null;
  view: WildernessView;
  menu?: { items: readonly string[]; selected: number } | null;
}

// Map window geometry (8×8 cell grid). The terrain map fills the left viewport box; the right of the
// screen is the info panel. These mirror the exploration screen's viewport placement.
const MAP_COL = 2; // tile column where the map starts (x = 16)
const MAP_ROW = 3; // tile row where the map starts (y = 24)
const MAP_COLS = 14; // 14 tiles wide  → x 16..128
const MAP_ROWS = 13; // 13 tiles tall → y 24..128
const TILE_PX = 8;
const PANEL_COL = 18; // right info panel start column (x = 144)

/** Top-left tile shown so the party stays centred, clamped to the map bounds. */
function scrollOrigin(party: number, span: number, window: number): number {
  if (span <= window) return 0;
  return Math.min(Math.max(0, party - (window >> 1)), span - window);
}

/**
 * Build the wilderness screen as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 1   region name (white)
 *   rows 3..15, cols 2..15   terrain map (party marker white, sites yellow-dotted)
 *   col 18+ panel: location label, game clock, status
 *   row 24  command bar
 */
export function composeWildernessScreen(input: WildernessInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);
  // M62.S1 — same overlay composeExploreScreen already does (packages/engine/src/render/
  // exploreScreen.ts:324-335): the moon disc sits on a black cell, not the plain bar, so clear
  // the cell first.
  if (input.moons) {
    input.moons.forEach((m, i) => {
      if (m && i < MOON_COLUMNS.length) {
        const col = MOON_COLUMNS[i]!;
        fillRectIndexed(fb, col * 8, 0, 8, 8, C_BLACK);
        blitTile(fb, m, col, 0);
      }
    });
  }

  const v = input.view;
  const ox = scrollOrigin(v.party.x, v.width, MAP_COLS);
  const oy = scrollOrigin(v.party.y, v.height, MAP_ROWS);

  // ── Terrain map: one filled 8×8 cell per visible tile. ──
  for (let ry = 0; ry < MAP_ROWS; ry++) {
    for (let rx = 0; rx < MAP_COLS; rx++) {
      const mx = ox + rx;
      const my = oy + ry;
      if (mx >= v.width || my >= v.height) continue;
      const t = v.tiles[my * v.width + mx]!;
      const px = (MAP_COL + rx) * TILE_PX;
      const py = (MAP_ROW + ry) * TILE_PX;
      fillRectIndexed(fb, px, py, TILE_PX, TILE_PX, TERRAIN_COLOR[t.terrain]);
      // A named site gets a yellow dot in its centre so it reads as a place to visit.
      if (t.site && !t.party) fillRectIndexed(fb, px + 3, py + 3, 2, 2, C_YELLOW);
      // The party is a white box with a black core (a clear marker over any terrain colour).
      if (t.party) {
        fillRectIndexed(fb, px + 1, py + 1, TILE_PX - 2, TILE_PX - 2, C_WHITE);
        fillRectIndexed(fb, px + 3, py + 3, 2, 2, C_BLACK);
      }
    }
  }

  const font = input.font ?? null;
  if (!font) return fb;
  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  drawText(fb, font, v.areaName.toUpperCase(), cell(MAP_COL), rowY(1), C_WHITE);

  // Right info panel.
  drawText(fb, font, 'LOCATION', cell(PANEL_COL), rowY(3), C_WHITE);
  drawText(fb, font, v.locationLabel.toUpperCase(), cell(PANEL_COL), rowY(4), C_GREEN);
  drawText(fb, font, 'TIME', cell(PANEL_COL), rowY(6), C_WHITE);
  drawText(fb, font, v.time.toUpperCase(), cell(PANEL_COL), rowY(7), C_GREEN);
  if (v.status) drawText(fb, font, v.status.toUpperCase(), cell(PANEL_COL), rowY(9), C_YELLOW);

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
