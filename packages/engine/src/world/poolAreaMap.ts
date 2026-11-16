/**
 * Pool of Radiance's native regional-area map viewport.
 *
 * The old-engine `DrawAreaMap` routine draws an 11x11 window over a 16x16 GEO map. Each cell uses
 * one of sixteen wall-connectivity symbols from the boot/UI set, then the party's cardinal arrow is
 * overlaid at the current cell. Regional ECL coordinates may be wider than one GEO sector; callers
 * must pass their low-nibble, sector-local x/y coordinates here.
 */
import type { GameMap, IndexedImage, TileSet } from '../model/index.js';
import { blitTile, createFramebuffer, type IndexedFramebuffer } from '../render/screen.js';

export const POOL_AREA_MAP_GRID = 16;
export const POOL_AREA_MAP_WINDOW_TILES = 11;
export const POOL_AREA_MAP_TILE_PX = 8;
export const POOL_AREA_MAP_BOOT_BLOCK_ID = 0xca;
export const POOL_AREA_MAP_ARROW_TILES = 4;
export const POOL_AREA_MAP_WALL_TILE_BASE = 4;
export const POOL_AREA_MAP_TRANSPARENT_INDEX = 8;

export interface PoolAreaMapPose {
  /** Sector-local GEO coordinate, 0..15. */
  x: number;
  /** Sector-local GEO coordinate, 0..15. */
  y: number;
  /** Native eight-way direction ordinal, 0..7; `direction >> 1` selects N/E/S/W arrow art. */
  direction: number;
}

export interface PoolAreaMapWindow {
  framebuffer: IndexedFramebuffer;
  /** Top-left GEO coordinate sampled into framebuffer tile (0,0). */
  originX: number;
  originY: number;
  /** Party-arrow position within the 11x11 framebuffer tile grid. */
  markerCol: number;
  markerRow: number;
  /** Local set-4 arrow tile selected by the native `direction >> 1` rule. */
  arrowTile: number;
}

function clampOrigin(position: number): number {
  return Math.max(0, Math.min(POOL_AREA_MAP_GRID - POOL_AREA_MAP_WINDOW_TILES, position - 5));
}

function validateInputs(map: GameMap, pose: PoolAreaMapPose, symbols: TileSet): void {
  if (map.width !== POOL_AREA_MAP_GRID || map.height !== POOL_AREA_MAP_GRID ||
      map.cells.length !== POOL_AREA_MAP_GRID * POOL_AREA_MAP_GRID) {
    throw new Error(
      `Pool area map must be a complete 16x16 GEO grid, got ${map.width}x${map.height}/${map.cells.length} cells`,
    );
  }
  if (!Number.isInteger(pose.x) || !Number.isInteger(pose.y) ||
      pose.x < 0 || pose.x >= POOL_AREA_MAP_GRID || pose.y < 0 || pose.y >= POOL_AREA_MAP_GRID) {
    throw new Error(`Pool area-map pose (${pose.x},${pose.y}) is outside the 16x16 GEO grid`);
  }
  if (!Number.isInteger(pose.direction) || pose.direction < 0 || pose.direction > 7) {
    throw new Error(`Pool area-map direction ${pose.direction} is outside the native 0..7 domain`);
  }
  if (symbols.tileWidth !== POOL_AREA_MAP_TILE_PX || symbols.tileHeight !== POOL_AREA_MAP_TILE_PX ||
      symbols.tiles.length < POOL_AREA_MAP_WALL_TILE_BASE + 16) {
    throw new Error(
      `Pool area-map symbol set must contain at least 20 8x8 tiles, got ` +
      `${symbols.tiles.length} ${symbols.tileWidth}x${symbols.tileHeight} tiles`,
    );
  }
}

/** Convert one GEO cell's N/E/S/W wall presence into native set-4 tile 4..19. */
export function poolAreaMapWallTile(walls: GameMap['cells'][number]['walls']): number {
  const mask = (walls.north > 0 ? 1 : 0) |
    (walls.east > 0 ? 2 : 0) |
    (walls.south > 0 ? 4 : 0) |
    (walls.west > 0 ? 8 : 0);
  return POOL_AREA_MAP_WALL_TILE_BASE + mask;
}

/**
 * Compose Pool's exact native 88x88 regional map viewport, excluding outer screen chrome.
 *
 * `symbols` is decoded `8X8D1.DAX#202` (set 4). Tiles 0..3 are arrows and tiles 4..19 are
 * wall-connectivity glyphs. The arrow's palette index 8 is suppressed during its overlay, matching
 * the retail clipped-draw path and preserving the grey map glyph below it.
 */
export function composePoolAreaMapWindow(
  map: GameMap,
  pose: PoolAreaMapPose,
  symbols: TileSet,
): PoolAreaMapWindow {
  validateInputs(map, pose, symbols);
  const originX = clampOrigin(pose.x);
  const originY = clampOrigin(pose.y);
  const framebuffer = createFramebuffer(
    POOL_AREA_MAP_WINDOW_TILES * POOL_AREA_MAP_TILE_PX,
    POOL_AREA_MAP_WINDOW_TILES * POOL_AREA_MAP_TILE_PX,
  );

  for (let row = 0; row < POOL_AREA_MAP_WINDOW_TILES; row++) {
    for (let col = 0; col < POOL_AREA_MAP_WINDOW_TILES; col++) {
      const cell = map.cells[(originY + row) * POOL_AREA_MAP_GRID + originX + col]!;
      blitTile(framebuffer, symbols.tiles[poolAreaMapWallTile(cell.walls)]!, col, row);
    }
  }

  const markerCol = pose.x - originX;
  const markerRow = pose.y - originY;
  const arrowTile = pose.direction >> 1;
  const arrow: IndexedImage = {
    ...symbols.tiles[arrowTile]!,
    transparentIndex: POOL_AREA_MAP_TRANSPARENT_INDEX,
  };
  blitTile(framebuffer, arrow, markerCol, markerRow);

  return { framebuffer, originX, originY, markerCol, markerRow, arrowTile };
}
