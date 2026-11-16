/**
 * First-person wall-view compositor → RGBA framebuffer (M1.S5d).
 *
 * Pure render half of the dungeon viewport: turns a party pose + loaded dungeon walls into a
 * flat 168×168 RGBA image (the EGA dungeon viewport, `WALL_VIEWPORT` 8,8→176,176). The host
 * just `putImageData`s it — no canvas logic leaks into the engine, so the whole first-person
 * picture is unit-testable headlessly (assert pixel bytes), not only the geometry.
 *
 * Pipeline: `composeWallView` (far→near painter order) → for each blit, look the relocated
 * tile id back to its decoded 8×8 `IndexedImage`, then blit it into the buffer at
 * `(blit.px−x0, blit.py−y0)`, clipped to the viewport. Wall tiles are sparse stone detail over
 * a magenta key (index 13) that `OverlayUnbounded` masks out, so a tile's `transparentIndex`
 * pixels are skipped (the ceiling/floor backdrop shows through the mortar gaps). Index 0 (black)
 * is a real colour and still paints.
 */
import type { GameMap, IndexedImage, Palette, RGB } from '../model/index.js';
import { makeEgaPalette } from '../render/palette.js';
import {
  createFramebuffer,
  blitIndexed,
  fillRectIndexed,
  type IndexedFramebuffer,
} from '../render/screen.js';
import { composeWallView, type WallPose } from './wallview.js';
import { WALL_VIEWPORT, WALL_TILE_PX, type WallTileBlit } from './wallpieces.js';

/** A flat RGBA picture, top-left origin, `width*height*4` bytes. */
export interface WallFramebuffer {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/** Just the two readers `renderWallView` needs from a loaded dungeon. */
export interface WallTileLookup {
  readId(wallset: number, slice: number, poolColumn: number): number;
  lookupTile(blit: Pick<WallTileBlit, 'set' | 'index' | 'tileId'>): IndexedImage | null;
}

export interface RenderWallViewOptions {
  /** Palette to resolve tile indices (tiles carry their own where present). Default EGA-16. */
  palette?: Palette;
  /** Top-half (ceiling) fill colour. Default EGA black. */
  ceiling?: RGB;
  /** Bottom-half (floor) fill colour. Default a dim brown. */
  floor?: RGB;
}

const VIEW_W = WALL_VIEWPORT.x1 - WALL_VIEWPORT.x0; // 168
const VIEW_H = WALL_VIEWPORT.y1 - WALL_VIEWPORT.y0; // 168
const DEFAULT_CEILING: RGB = { r: 0x0c, g: 0x0d, b: 0x14 };
const DEFAULT_FLOOR: RGB = { r: 0x1a, g: 0x14, b: 0x10 };

/**
 * Horizon line (buffer-local y) where the floor backdrop begins. The original COAB
 * `Draw3dWorldBackground` (ovr031) paints sky at screen y[24,68), a 2-px black divider at y[68,70),
 * then the floor from **screen y=70** down. The viewport buffer is offset by `WALL_VIEWPORT.y0` (=8)
 * from the screen, so the floor starts at buffer `y = 70 − 8 = 62`. Filling the floor only from the
 * vertical midline (84) instead left the *receding* floor band y[62,84) painted as black ceiling — the
 * "floor turns black one step away from the party" bug. Anchoring the split at the real horizon fixes it.
 */
const HORIZON_Y = 62;

function fillRect(rgba: Uint8ClampedArray, w: number, y0: number, y1: number, c: RGB): void {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o] = c.r;
      rgba[o + 1] = c.g;
      rgba[o + 2] = c.b;
      rgba[o + 3] = 255;
    }
  }
}

/**
 * Render the first-person dungeon viewport for `pose` as a 168×168 RGBA buffer.
 *
 * `walls` supplies `readId` (the WALLDEF reader `composeWallView` walks) and `lookupTile` (the
 * blit → 8×8 image resolver). Blits that resolve to no tile are skipped; tiles are clipped to
 * the viewport so an edge piece never writes out of bounds.
 */
export function renderWallView(
  map: GameMap,
  pose: WallPose,
  walls: WallTileLookup,
  opts: RenderWallViewOptions = {},
): WallFramebuffer {
  const palette = opts.palette ?? makeEgaPalette();
  const rgba = new Uint8ClampedArray(VIEW_W * VIEW_H * 4);

  // Ceiling / floor backdrop, split at the real horizon (HORIZON_Y), not the buffer midline — so the
  // floor reads as floor all the way up to the vanishing point, not just in the bottom half.
  fillRect(rgba, VIEW_W, 0, HORIZON_Y, opts.ceiling ?? DEFAULT_CEILING);
  fillRect(rgba, VIEW_W, HORIZON_Y, VIEW_H, opts.floor ?? DEFAULT_FLOOR);

  for (const blit of composeWallView(map, pose, walls.readId)) {
    const img = walls.lookupTile(blit);
    if (!img) continue;
    blitTile(rgba, img, palette, blit.px - WALL_VIEWPORT.x0, blit.py - WALL_VIEWPORT.y0);
  }

  return { width: VIEW_W, height: VIEW_H, rgba };
}

export interface RenderWallViewIndexedOptions {
  /** Ceiling (top-half) fill index. Default EGA 0 (black). */
  ceilingIndex?: number;
  /** Floor (bottom-half) fill index. Default EGA 8 (dark gray) — placeholder until the
   * textured SKY backdrop is wired in. */
  floorIndex?: number;
}

/**
 * Render the first-person viewport as an INDEXED 168×168 framebuffer, so it composes into
 * the full original screen ({@link IndexedFramebuffer}) without an intermediate RGBA step.
 * Same pipeline as {@link renderWallView}; the magenta key (transparentIndex) is skipped so
 * the ceiling/floor fill shows through the mortar gaps. Resolving this through the EGA
 * palette is byte-identical to {@link renderWallView} given matching backdrop colours
 * (locked by test).
 */
export function renderWallViewIndexed(
  map: GameMap,
  pose: WallPose,
  walls: WallTileLookup,
  opts: RenderWallViewIndexedOptions = {},
): IndexedFramebuffer {
  const fb = createFramebuffer(VIEW_W, VIEW_H, opts.ceilingIndex ?? 0);
  // Floor fill begins at the real horizon (HORIZON_Y), matching the original Draw3dWorldBackground —
  // not the buffer midline, which left the receding floor band above it black.
  fillRectIndexed(fb, 0, HORIZON_Y, VIEW_W, VIEW_H - HORIZON_Y, opts.floorIndex ?? 8);
  for (const blit of composeWallView(map, pose, walls.readId)) {
    const img = walls.lookupTile(blit);
    if (!img) continue;
    blitIndexed(fb, img, blit.px - WALL_VIEWPORT.x0, blit.py - WALL_VIEWPORT.y0);
  }
  return fb;
}

/** Blit one decoded tile at viewport-local (dx,dy), clipped to the 168×168 frame; skips the
 * tile's transparent index (magenta key) so the backdrop shows through. */
function blitTile(
  rgba: Uint8ClampedArray,
  img: IndexedImage,
  ctx: Palette,
  dx: number,
  dy: number,
): void {
  const own = img.palette;
  const transparent = img.transparentIndex;
  for (let ty = 0; ty < img.height; ty++) {
    const oy = dy + ty;
    if (oy < 0 || oy >= VIEW_H) continue;
    for (let tx = 0; tx < img.width; tx++) {
      const ox = dx + tx;
      if (ox < 0 || ox >= VIEW_W) continue;
      const idx = img.indices[ty * img.width + tx];
      if (idx === transparent) continue; // magenta key → leave the wall base / backdrop showing
      const c = own?.colors[idx] ?? ctx.colors[idx];
      if (!c) continue; // undefined colour → leave backdrop showing
      const o = (oy * VIEW_W + ox) * 4;
      rgba[o] = c.r;
      rgba[o + 1] = c.g;
      rgba[o + 2] = c.b;
      rgba[o + 3] = 255;
    }
  }
}

/** Viewport dimensions for hosts that allocate a matching canvas. */
export const WALL_VIEW_WIDTH = VIEW_W;
export const WALL_VIEW_HEIGHT = VIEW_H;
export { WALL_TILE_PX };
