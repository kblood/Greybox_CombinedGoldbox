/**
 * Compose the **Automap panel** (D1) into one indexed 320×200 framebuffer — a dedicated overview of
 * the current dungeon level: every cell the party has discovered, the walls/doors found on those
 * cells, the party's position + facing, and any notes the player has pinned. It is the persistent,
 * full-screen companion to the small live minimap on the exploration screen.
 *
 * Pure / DOM-free, mirroring {@link composeHudPanel} / {@link composeJournalScreen}: the border comes
 * from the game's own 8×8 frame tiles via {@link drawOuterBorder}, text from the 8X8D bitmap font.
 * The grid is fog-of-war faithful — only **visited** cells (and the walls discovered on them) are
 * drawn, so the map fills in as the party explores. {@link automapGridLayout} exposes the same cell
 * geometry the panel renders with, so a host can translate a canvas click back to a `(x,y)` cell to
 * place a note.
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
import { DIRECTIONS, type Direction, type IndexedImage, type MapCell } from '../model/index.js';

// ── EGA colour indices (match the exploration UI / automap canvas palette) ──────────────────────
const C_BLACK = 0;
const C_FLOOR = 8; // dim grey — a discovered (visited) floor cell
const C_WALL = 11; // bright cyan — a discovered wall edge
const C_DOOR = 14; // yellow — a door edge (passable)
const C_GATE = 10; // green — a gateway / special door edge
const C_PARTY = 15; // white — the party marker
const C_FACE = 12; // red — the party facing pip
const C_NOTE = 13; // bright magenta — a pinned note marker
const C_GREY = 8;
const C_WHITE = 15;

/** A minimal read-model of the {@link Automap} the panel needs (decoupled from the class). */
export interface AutomapReadModel {
  isVisited(x: number, y: number): boolean;
  getNote(x: number, y: number): string | null;
}

/** Just the geometry the panel renders over (a {@link GameMap} satisfies this). */
export interface AutomapMapView {
  width: number;
  height: number;
  cells: MapCell[];
}

export interface AutomapPanelInput {
  /** The 8×8 frame tiles (e.g. `8X8D1.DAX` block 202) the border is drawn from. Border skipped if absent. */
  frameTiles?: IndexedImage[] | null;
  /** Placement layout for `frameTiles`. Defaults to {@link COK_FRAME_LAYOUT}. */
  frameLayout?: ExploreFrameLayout;
  /** Text font (block 201). When absent, all text is skipped (the grid still renders). */
  font?: BitmapFont | null;
  /** Screen title; defaults to "AUTOMAP". */
  title?: string;
  /** The map geometry (walls/doors per cell). */
  map: AutomapMapView;
  /** Discovered-cells + notes model. */
  automap: AutomapReadModel;
  /** Party position + facing (drawn as a marker). Omit to hide it. */
  pose?: { x: number; y: number; facing: Direction } | null;
  /** Status / hint line near the bottom. */
  status?: string;
  /** Optional command bar (Gold Box style). */
  menu?: { items: readonly string[]; selected: number } | null;
}

// The grid is laid out inside the bordered page, below the title row and above the status/menu rows.
const GRID_X0 = 12;
const GRID_Y0 = 24; // below the title (row 1–2)
const GRID_X1 = 308;
const GRID_Y1 = 176; // above the status (row 22) / menu (row 24)
const MIN_CELL = 2;
const MAX_CELL = 14;

export interface AutomapGridLayout {
  /** Pixel size of one cell. */
  cellPx: number;
  /** Top-left pixel of cell (0,0). */
  originX: number;
  originY: number;
  /** Drawn pixel extent of the whole grid. */
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * Compute the cell pixel size + centred origin the panel draws a `width×height` map with. Exposed so
 * a host can map a canvas click `(px,py)` back to a cell: `x = floor((px-originX)/cellPx)`, likewise
 * `y`. Returns a zero-cell layout for an empty map.
 */
export function automapGridLayout(width: number, height: number): AutomapGridLayout {
  if (width <= 0 || height <= 0) return { cellPx: 0, originX: GRID_X0, originY: GRID_Y0, pixelWidth: 0, pixelHeight: 0 };
  const availW = GRID_X1 - GRID_X0;
  const availH = GRID_Y1 - GRID_Y0;
  const cellPx = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(availW / width), Math.floor(availH / height)));
  const pixelWidth = cellPx * width;
  const pixelHeight = cellPx * height;
  const originX = GRID_X0 + Math.floor((availW - pixelWidth) / 2);
  const originY = GRID_Y0 + Math.floor((availH - pixelHeight) / 2);
  return { cellPx, originX, originY, pixelWidth, pixelHeight };
}

/** Colour for a wall edge given its door flag (0 plain wall, 1 door, 2 gateway). */
function edgeColor(door: number): number {
  if (door === 1) return C_DOOR;
  if (door === 2) return C_GATE;
  return C_WALL;
}

/** Draw one discovered wall edge of a cell as a thin line. */
function drawEdge(
  fb: IndexedFramebuffer,
  dir: Direction,
  ox: number,
  oy: number,
  cp: number,
  color: number,
): void {
  const t = cp >= 6 ? 2 : 1; // line thickness scales a touch with the cell size
  switch (dir) {
    case 'north': fillRectIndexed(fb, ox, oy, cp, t, color); break;
    case 'south': fillRectIndexed(fb, ox, oy + cp - t, cp, t, color); break;
    case 'west': fillRectIndexed(fb, ox, oy, t, cp, color); break;
    case 'east': fillRectIndexed(fb, ox + cp - t, oy, t, cp, color); break;
  }
}

/**
 * Build the Automap panel as a 320×200 indexed framebuffer. Only visited cells (and the walls/doors
 * discovered on them) are drawn — the grid fills in with exploration. The party is a white block with
 * a red facing pip; pinned notes are a magenta dot in the cell corner.
 */
export function composeAutomapPanel(input: AutomapPanelInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const { map, automap } = input;
  const { cellPx, originX, originY } = automapGridLayout(map.width, map.height);

  if (cellPx > 0) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!automap.isVisited(x, y)) continue;
        const ox = originX + x * cellPx;
        const oy = originY + y * cellPx;
        fillRectIndexed(fb, ox, oy, cellPx, cellPx, C_FLOOR);
        const cell = map.cells[y * map.width + x];
        if (cell) {
          for (const dir of DIRECTIONS) {
            if ((cell.walls?.[dir] ?? 0) > 0) {
              drawEdge(fb, dir, ox, oy, cellPx, edgeColor(cell.doors?.[dir] ?? 0));
            }
          }
        }
        if (automap.getNote(x, y)) {
          const s = Math.max(2, Math.floor(cellPx / 3));
          fillRectIndexed(fb, ox + cellPx - s - 1, oy + 1, s, s, C_NOTE);
        }
      }
    }

    // Party marker — a white block over its cell with a red pip toward its facing.
    const pose = input.pose ?? null;
    if (pose && pose.x >= 0 && pose.x < map.width && pose.y >= 0 && pose.y < map.height) {
      const ox = originX + pose.x * cellPx;
      const oy = originY + pose.y * cellPx;
      const m = Math.max(2, cellPx - 2);
      const inset = Math.floor((cellPx - m) / 2);
      fillRectIndexed(fb, ox + inset, oy + inset, m, m, C_PARTY);
      const pip = Math.max(1, Math.floor(cellPx / 4));
      const cx = ox + Math.floor(cellPx / 2) - Math.floor(pip / 2);
      const cy = oy + Math.floor(cellPx / 2) - Math.floor(pip / 2);
      switch (pose.facing) {
        case 'north': fillRectIndexed(fb, cx, oy, pip, pip, C_FACE); break;
        case 'south': fillRectIndexed(fb, cx, oy + cellPx - pip, pip, pip, C_FACE); break;
        case 'west': fillRectIndexed(fb, ox, cy, pip, pip, C_FACE); break;
        case 'east': fillRectIndexed(fb, ox + cellPx - pip, cy, pip, pip, C_FACE); break;
      }
    }
  }

  const font = input.font ?? null;
  if (!font) return fb;

  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;
  drawText(fb, font, (input.title ?? 'Automap').toUpperCase(), cell(2), rowY(1), C_WHITE);
  if (input.status) drawText(fb, font, input.status.toUpperCase().slice(0, 36), cell(2), rowY(22), C_GREY);
  if (input.menu && input.menu.items.length > 0) {
    drawHorizontalMenu(fb, font, input.menu.items, {
      x: cell(1),
      y: rowY(24),
      selected: input.menu.selected,
      idleColor: 10, // green idle
      selColor: C_WHITE,
    });
  }
  return fb;
}
