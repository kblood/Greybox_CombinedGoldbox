/**
 * First-person sky backdrop — per-area sky colour + time-of-day sun/moon overlay (ovr028/029 +
 * ovr030 gap).
 *
 * The original first-person renderer paints a *background* behind the wall geometry before the
 * far→near wall walk: a flat horizon-band sky colour, then — outdoors — a sun/moon sprite whose
 * position tracks the game clock and the party's facing. `renderWallView.ts` only ever filled a
 * black ceiling, so this module supplies the two missing pieces, as pure functions over the
 * indexed framebuffer the engine already uses (no DOM/Node):
 *
 *   1. {@link selectSkyColour} — `RedrawView` (ovr029): the cell's roof byte (`get_wall_x2`) high
 *      bit picks the area's INDOOR vs OUTDOOR sky index into the fixed 16-entry EGA
 *      {@link SKY_COLOURS} table. So a single dungeon renders roofed cells with one horizon colour
 *      and open cells with another as the party walks.
 *   2. {@link skyBodyPlacement} / the overlay in {@link paintSkyBackdrop} — `Draw3dWorldBackground`
 *      (ovr030): outdoors with the open-sky colour, a sun/moon body rises in the East at dawn and
 *      sinks in the West at dusk, driven by the hour and the compass facing. The hour is fully
 *      INJECTED (caller passes it, e.g. from the gameClock calendar) so a host without a clock
 *      still renders a plain sky.
 *
 * The two compose: area sky colour underneath, celestial body on top, wall geometry over both.
 */
import type { GameMap, IndexedImage } from '../model/index.js';
import {
  blitIndexed,
  createFramebuffer,
  fillRectIndexed,
  type IndexedFramebuffer,
} from './screen.js';
import { composeWallView, type WallPose } from '../world/wallview.js';
import type { WallTileLookup } from '../world/renderWallView.js';
import { WALL_VIEW_WIDTH, WALL_VIEW_HEIGHT } from '../world/renderWallView.js';

/**
 * `sky_colours` (COAB seg600:0A8A) — a fixed 16-entry EGA table; eight distinct colours repeated
 * ×2. Each area carries two indices into it (`indoor_sky_colour`, `outdoor_sky_colour`); the value
 * is the EGA-16 colour index used as the horizon fill behind the wall geometry.
 */
export const SKY_COLOURS: readonly number[] = [
  0x00, 0x0f, 0x04, 0x0b, 0x0d, 0x02, 0x09, 0x0e,
  0x00, 0x0f, 0x04, 0x0b, 0x0d, 0x02, 0x09, 0x0e,
];

/**
 * Horizon line (buffer-local y) where the sky band ends and the floor begins. Mirrors the private
 * `HORIZON_Y` in `renderWallView.ts` (the original `Draw3dWorldBackground` sky/floor split). Kept
 * in sync so a sky fill produced here lines up with the wall renderer's floor.
 */
export const SKY_HORIZON_Y = 62;

/** `get_wall_x2 > 0x7F` ⇒ the cell is roofed/indoor (top bit of the roof byte). */
export const ROOF_INDOOR_BIT = 0x80;

/**
 * The single `sky_colours` value that enables the time-of-day body. `Draw3dWorldBackground` only
 * overlays the sun/moon when the resolved sky colour is the open-sky blue (ovr030: `sky_colour == 11`).
 */
export const SKY_OUTDOOR_OPEN = 0x0b;

/** Even facing as used by {@link WallPose}: 0=N, 2=E, 4=S, 6=W. */
export type SkyFacing = 0 | 2 | 4 | 6;

/** The two per-area sky-colour indices (`area.indoor_sky_colour` / `area.outdoor_sky_colour`). */
export interface AreaSky {
  /** Index 0..15 into {@link SKY_COLOURS} used for roofed (indoor) cells. */
  indoorSkyColour: number;
  /** Index 0..15 into {@link SKY_COLOURS} used for open (outdoor) cells. */
  outdoorSkyColour: number;
}

/** True iff the cell's roof byte marks it roofed/indoor (`get_wall_x2 > 0x7F`). */
export function isIndoorCell(roofByte: number): boolean {
  return (roofByte & 0xff) >= ROOF_INDOOR_BIT;
}

/**
 * Resolve the EGA-16 sky colour for one cell (`RedrawView`): the roof byte's high bit selects the
 * area's indoor vs outdoor index, which then reads {@link SKY_COLOURS}. Returns the EGA colour
 * index to fill the horizon band with.
 */
export function selectSkyColour(area: AreaSky, roofByte: number): number {
  const tableIndex = isIndoorCell(roofByte) ? area.indoorSkyColour : area.outdoorSkyColour;
  return SKY_COLOURS[tableIndex & 0x0f];
}

/** A placed celestial body in the sky-band tile grid (8-px cells, buffer-local). */
export interface SkyBody {
  /** Whether the body is visible for this hour+facing. */
  visible: boolean;
  /** Tile-grid column (×8 = buffer-local x). */
  col: number;
  /** Tile-grid row (×8 = buffer-local y); lower = higher in the sky. */
  row: number;
  /** Which `sky_dax` body: 0 = 250 (sun / north body), 1 = 251, 2 = 252 (moons). */
  bodyIndex: number;
}

const NOT_VISIBLE: SkyBody = { visible: false, col: 0, row: 0, bodyIndex: 0 };

/** Centre column of the 168-px (21-cell) viewport, where a body the party faces sits. */
const CENTRE_COL = 10;
/** Column for the sunrise body when glimpsed off-axis (facing South). */
const OFF_AXIS_COL = 14;
/** Row for the always-present North body. */
const NORTH_ROW = 1;

/**
 * Sun/moon placement for the given hour (0..23) and even facing, per `Draw3dWorldBackground`
 * (ovr030). Pure — the drawing is separate so the geometry is unit-testable:
 *
 * - Facing **North (0)** always shows the `sky_dax_250` body (high, centred).
 * - **Sunrise** hours 1–5 rise in the **East (2)** as `row = 7 − hour` (hour 1 low → hour 5 high);
 *   for hour > 2 the body is also glimpsed off-axis facing **South (4)** (the COAB note labels this
 *   "North dir 4", but dir 4 = South in 0=N,2=E,4=S,6=W — name vs constant mismatch in the spec).
 * - **Sunset** hours 13–18 sink in the **West (6)** as `row = (2 + hour) − 13` (hour 13 high →
 *   hour 18 at the horizon).
 *
 * Any other hour/facing returns `visible: false` (plain sky). Columns are a documented model (the
 * binary column table is not byte-pinned); the rows are the pinned formulas.
 */
export function skyBodyPlacement(hour: number, facing: SkyFacing): SkyBody {
  // North always carries the sky_dax_250 body.
  if (facing === 0) return { visible: true, col: CENTRE_COL, row: NORTH_ROW, bodyIndex: 0 };

  // Sunrise in the East (and off-axis facing South for the later hours).
  if (hour >= 1 && hour <= 5) {
    if (facing === 2) return { visible: true, col: CENTRE_COL, row: 7 - hour, bodyIndex: 0 };
    if (facing === 4 && hour > 2) return { visible: true, col: OFF_AXIS_COL, row: 7 - hour, bodyIndex: 0 };
  }

  // Sunset in the West.
  if (hour >= 13 && hour <= 18) {
    if (facing === 6) return { visible: true, col: CENTRE_COL, row: 2 + hour - 13, bodyIndex: 0 };
  }

  return NOT_VISIBLE;
}

/** Default EGA colour for each `sky_dax` body when no sprite is injected. */
const DEFAULT_BODY_COLOUR = [0x0e, 0x0f, 0x07]; // 250 sun=yellow, 251 moon=white, 252 moon=grey
/** Side of the default (sprite-less) body block, in pixels. */
const BODY_PX = 8;

/** Inputs for the optional time-of-day overlay; omit to render a plain sky. */
export interface SkyOverlayOptions {
  /** Game-clock hour 0..23 (injected). Required for the overlay; omit ⇒ no body drawn. */
  hour?: number;
  /** Party facing (even dir). Required for the overlay; omit ⇒ no body drawn. */
  facing?: SkyFacing;
  /** Inject a real `sky_dax_250/251/252` sprite to stamp; omit ⇒ a solid {@link BODY_PX} block. */
  bodySprite?: IndexedImage;
  /** Override the default body colour index (used only for the sprite-less block). */
  bodyColourIndex?: number;
}

/** Options for {@link paintSkyBackdrop}. */
export interface PaintSkyOptions extends SkyOverlayOptions {
  /** Horizon split (default {@link SKY_HORIZON_Y}). Sky fills `[0, horizonY)`. */
  horizonY?: number;
  /** Floor fill index for `[horizonY, height)`. Omit to leave the lower band untouched. */
  floorIndex?: number;
  /**
   * The resolved sky colour (from {@link selectSkyColour}). The overlay only draws when this is the
   * open-sky colour {@link SKY_OUTDOOR_OPEN} — pass it so the gate matches `Draw3dWorldBackground`.
   * If omitted, the overlay gate falls back to "the body is visible" only.
   */
  skyColour?: number;
}

/**
 * Paint the sky band (and optionally the floor) into `fb`, then overlay the time-of-day sun/moon
 * when an `hour` + `facing` are supplied AND the sky is the open-sky colour. Returns the body
 * placement that was drawn, or `null` for a plain sky. Call this BEFORE the wall walk so wall
 * geometry overpaints the backdrop, matching the original far→near painter order.
 */
export function paintSkyBackdrop(
  fb: IndexedFramebuffer,
  skyIndex: number,
  opts: PaintSkyOptions = {},
): SkyBody | null {
  const horizonY = opts.horizonY ?? SKY_HORIZON_Y;
  fillRectIndexed(fb, 0, 0, fb.width, horizonY, skyIndex);
  if (opts.floorIndex !== undefined) {
    fillRectIndexed(fb, 0, horizonY, fb.width, fb.height - horizonY, opts.floorIndex);
  }

  if (opts.hour === undefined || opts.facing === undefined) return null;
  // Outdoor gate: only the open-sky colour carries a celestial body (ovr030 sky_colour == 11).
  if (opts.skyColour !== undefined && opts.skyColour !== SKY_OUTDOOR_OPEN) return null;

  const body = skyBodyPlacement(opts.hour, opts.facing);
  if (!body.visible) return null;

  const x = body.col * BODY_PX;
  const y = body.row * BODY_PX;
  if (opts.bodySprite) {
    blitIndexed(fb, opts.bodySprite, x, y);
  } else {
    const colour = opts.bodyColourIndex ?? DEFAULT_BODY_COLOUR[body.bodyIndex] ?? DEFAULT_BODY_COLOUR[0];
    fillRectIndexed(fb, x, y, BODY_PX, BODY_PX, colour);
  }
  return body;
}

/** Options for {@link renderFirstPersonViewWithSky}. */
export interface FirstPersonSkyOptions extends SkyOverlayOptions {
  /** Per-area indoor/outdoor sky indices. */
  area: AreaSky;
  /** The party cell's roof byte (`get_wall_x2`); its high bit picks indoor vs outdoor sky. */
  roofByte: number;
  /** Horizon split (default {@link SKY_HORIZON_Y}). */
  horizonY?: number;
  /** Floor fill index below the horizon (default EGA 8, matching `renderWallViewIndexed`). */
  floorIndex?: number;
  /**
   * Optional title-native 168×168 precomposed sky/ground framebuffer. When supplied it replaces
   * the flat colour bands; wall geometry is still painted over it in the normal far→near order.
   */
  backdrop?: IndexedImage;
}

/**
 * Host-facing composite: render the full first-person viewport as an indexed framebuffer with the
 * per-area sky colour, the optional time-of-day body, and the wall geometry on top. Equivalent to
 * `renderWallViewIndexed` but with a real sky backdrop instead of a black ceiling.
 *
 * Order matches the original: per-cell sky fill → floor → celestial body → far→near wall blits.
 */
export function renderFirstPersonViewWithSky(
  map: GameMap,
  pose: WallPose,
  walls: WallTileLookup,
  opts: FirstPersonSkyOptions,
): IndexedFramebuffer {
  const skyIndex = selectSkyColour(opts.area, opts.roofByte);
  const fb = createFramebuffer(WALL_VIEW_WIDTH, WALL_VIEW_HEIGHT, 0);
  if (opts.backdrop) {
    blitIndexed(fb, opts.backdrop, 0, 0);
  } else {
    paintSkyBackdrop(fb, skyIndex, {
      horizonY: opts.horizonY,
      floorIndex: opts.floorIndex ?? 8,
      hour: opts.hour,
      facing: opts.facing,
      bodySprite: opts.bodySprite,
      bodyColourIndex: opts.bodyColourIndex,
      skyColour: skyIndex,
    });
  }
  for (const blit of composeWallView(map, pose, walls.readId)) {
    const img = walls.lookupTile(blit);
    if (!img) continue;
    blitIndexed(fb, img, blit.px - 8, blit.py - 8); // WALL_VIEWPORT origin (8,8) → buffer-local
  }
  return fb;
}
