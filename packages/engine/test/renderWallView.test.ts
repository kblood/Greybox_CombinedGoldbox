/**
 * renderWallView tests (M1.S5d) — the pure RGBA compositor for the first-person viewport.
 *
 * Drives a fully-walled synthetic map through a constant WALLDEF reader + a solid-colour tile
 * so the output is predictable: a 168×168 buffer with a ceiling/floor backdrop and real wall
 * pixels painted where `composeWallView` places tiles. No game data or canvas needed.
 */
import { describe, it, expect } from 'vitest';
import {
  renderWallView,
  renderWallViewIndexed,
  framebufferToRGBA,
  makeEgaPalette,
  WALL_VIEW_WIDTH,
  WALL_VIEW_HEIGHT,
  EGA16,
  type GameMap,
  type IndexedImage,
  type WallPose,
  type WallTileLookup,
} from '../src/index.js';

/** A 4×4 map with every edge walled (slot 1) — any pose sees walls all around. */
function walledMap(): GameMap {
  const cells = Array.from({ length: 16 }, () => ({ walls: { north: 1, east: 1, south: 1, west: 1 } }));
  return { name: 'test', width: 4, height: 4, cells, entries: [] };
}

/** An 8×8 tile whose every pixel is EGA index `idx` (no own palette → default EGA-16). */
function solidTile(idx: number): IndexedImage {
  return {
    width: 8,
    height: 8,
    indices: new Uint8Array(64).fill(idx),
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: null,
  };
}

/** Walls that resolve every queried surface to a single solid tile (EGA bright red, idx 12). */
const RED = 12;
const walls: WallTileLookup = {
  readId: () => 0x30, // any positive id → routeTileId set 1, index 2
  lookupTile: () => solidTile(RED),
};

function pixel(rgba: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number, number] {
  const o = (y * w + x) * 4;
  return [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]];
}

describe('renderWallView', () => {
  const map = walledMap();
  const pose: WallPose = { px: 1, py: 1, facing: 0, eclBlockId: 34 };

  it('produces a 168×168 opaque framebuffer', () => {
    const fb = renderWallView(map, pose, walls);
    expect(fb.width).toBe(WALL_VIEW_WIDTH);
    expect(fb.height).toBe(WALL_VIEW_HEIGHT);
    expect(fb.rgba.length).toBe(168 * 168 * 4);
    // Every pixel is opaque (backdrop + tiles both alpha 255).
    for (let i = 3; i < fb.rgba.length; i += 4) expect(fb.rgba[i]).toBe(255);
  });

  it('keeps the ceiling/floor backdrop in the always-uncovered edge columns', () => {
    const fb = renderWallView(map, pose, walls);
    // Draw-grid col 0 maps to px=24 → local x=16, so x<16 is never covered by a wall piece.
    const [cr, cg, cb] = pixel(fb.rgba, fb.width, 0, 0); // top-left = ceiling
    expect([cr, cg, cb]).toEqual([0x0c, 0x0d, 0x14]);
    const [fr, fg, fbl] = pixel(fb.rgba, fb.width, 0, 167); // bottom-left = floor
    expect([fr, fg, fbl]).toEqual([0x1a, 0x14, 0x10]);
  });

  it('fills the receding floor up to the horizon, not just the bottom half', () => {
    // Regression: the floor used to fill only from the buffer midline (y=84) down, so the receding
    // floor band y[62,84) — visible "one step away" from the party — was painted as black ceiling.
    // The horizon now sits at y=62 (the original Draw3dWorldBackground line), so a row at y=70 in an
    // always-uncovered edge column (x<16 is never reached by a wall piece) must read as FLOOR.
    const fb = renderWallView(map, pose, walls, { ceiling: { r: 1, g: 2, b: 3 }, floor: { r: 4, g: 5, b: 6 } });
    expect(pixel(fb.rgba, fb.width, 0, 61).slice(0, 3)).toEqual([1, 2, 3]); // just above horizon = ceiling
    expect(pixel(fb.rgba, fb.width, 0, 62).slice(0, 3)).toEqual([4, 5, 6]); // at horizon = floor
    expect(pixel(fb.rgba, fb.width, 0, 70).slice(0, 3)).toEqual([4, 5, 6]); // one step away (was black)
    expect(pixel(fb.rgba, fb.width, 0, 83).slice(0, 3)).toEqual([4, 5, 6]); // above old midline = floor
  });

  it('paints real wall tiles through the EGA palette', () => {
    const fb = renderWallView(map, pose, walls);
    const red = EGA16[RED];
    let painted = 0;
    for (let i = 0; i < fb.rgba.length; i += 4) {
      if (fb.rgba[i] === red.r && fb.rgba[i + 1] === red.g && fb.rgba[i + 2] === red.b) painted++;
    }
    expect(painted).toBeGreaterThan(0);
  });

  it('honours custom ceiling/floor colours', () => {
    const fb = renderWallView(map, pose, walls, { ceiling: { r: 1, g: 2, b: 3 }, floor: { r: 4, g: 5, b: 6 } });
    expect(pixel(fb.rgba, fb.width, 0, 0).slice(0, 3)).toEqual([1, 2, 3]);
    expect(pixel(fb.rgba, fb.width, 0, 167).slice(0, 3)).toEqual([4, 5, 6]);
  });

  it('indexed render resolves byte-identically to the RGBA render', () => {
    // Lock renderWallViewIndexed to the proven RGBA path: with matching backdrop colours
    // (EGA index 0 ceiling, index 8 floor), framebufferToRGBA(indexed) must equal renderWallView.
    const ega = makeEgaPalette();
    const rgbaRef = renderWallView(map, pose, walls, {
      ceiling: ega.colors[0]!,
      floor: ega.colors[8]!,
    });
    const indexed = renderWallViewIndexed(map, pose, walls, { ceilingIndex: 0, floorIndex: 8 });
    expect(indexed.width).toBe(WALL_VIEW_WIDTH);
    expect(indexed.height).toBe(WALL_VIEW_HEIGHT);
    const rgbaFromIndexed = framebufferToRGBA(indexed, ega);
    expect(rgbaFromIndexed.length).toBe(rgbaRef.rgba.length);
    let mismatch = -1;
    for (let i = 0; i < rgbaRef.rgba.length; i++) {
      if (rgbaFromIndexed[i] !== rgbaRef.rgba[i]) { mismatch = i; break; }
    }
    expect(mismatch, `first mismatch at byte ${mismatch}`).toBe(-1);
  });
});
