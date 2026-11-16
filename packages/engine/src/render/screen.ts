/**
 * Indexed framebuffer — the substrate for reproducing an original Gold Box screen
 * pixel-for-pixel (DOS EGA 320×200, and later Amiga/C64 variants).
 *
 * The original hardware screen is a paletted indexed bitmap; the engine composes the
 * full screen by blitting indexed tiles/images (border frame symbols, the 3D viewport,
 * font glyphs, …) into one indexed buffer, then resolves it through a palette to RGBA
 * exactly once. Keeping the framebuffer INDEXED (not RGBA) is what makes live
 * graphics-mode switching cheap: swap the palette (and the asset set) to switch DOS-EGA
 * ↔ Amiga ↔ C64 without re-compositing.
 *
 * Pure / DOM-free. The web layer calls {@link framebufferToRGBA} and paints the result
 * onto a single <canvas> at an integer scale.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

/** A paletted indexed bitmap, row-major, top-left origin. `indices[y*width + x]` ∈ 0..255. */
export interface IndexedFramebuffer {
  width: number;
  height: number;
  /** Palette indices, length === width*height. */
  indices: Uint8Array;
}

/** Standard DOS Gold Box screen geometry (EGA 320×200, 40×25 tiles of 8×8). */
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 200;
export const TILE = 8;

/** Allocate a framebuffer filled with a single palette index (default 0 = black). */
export function createFramebuffer(
  width: number,
  height: number,
  fill = 0,
): IndexedFramebuffer {
  const indices = new Uint8Array(width * height);
  if (fill !== 0) indices.fill(fill);
  return { width, height, indices };
}

/**
 * Blit an {@link IndexedImage} into the framebuffer at top-left pixel (x, y). Pixels equal
 * to the source's `transparentIndex` are skipped (the destination shows through). Anything
 * outside the framebuffer bounds is clipped. Source indices are written verbatim — the
 * framebuffer is paletted, so no colour resolution happens here.
 */
export function blitIndexed(
  dst: IndexedFramebuffer,
  src: IndexedImage,
  x: number,
  y: number,
): void {
  const { width: sw, height: sh, indices: si, transparentIndex } = src;
  const { width: dw, height: dh, indices: di } = dst;
  for (let sy = 0; sy < sh; sy++) {
    const dyRow = y + sy;
    if (dyRow < 0 || dyRow >= dh) continue;
    for (let sx = 0; sx < sw; sx++) {
      const dxCol = x + sx;
      if (dxCol < 0 || dxCol >= dw) continue;
      const idx = si[sy * sw + sx];
      if (transparentIndex !== null && idx === transparentIndex) continue;
      di[dyRow * dw + dxCol] = idx;
    }
  }
}

/**
 * Like {@link blitIndexed}, but additionally confined to the rectangle `[clipX0,clipX1) ×
 * [clipY0,clipY1)`. Used to drop a larger source (e.g. the 168×168 first-person viewport)
 * into a smaller on-screen window without spilling into neighbouring regions (the right
 * party panel, the separators). Transparency and framebuffer-bounds clipping still apply.
 */
export function blitIndexedClipped(
  dst: IndexedFramebuffer,
  src: IndexedImage,
  x: number,
  y: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
): void {
  const { width: sw, height: sh, indices: si, transparentIndex } = src;
  const { width: dw, height: dh, indices: di } = dst;
  const cx0 = Math.max(0, clipX0);
  const cy0 = Math.max(0, clipY0);
  const cx1 = Math.min(dw, clipX1);
  const cy1 = Math.min(dh, clipY1);
  for (let sy = 0; sy < sh; sy++) {
    const dyRow = y + sy;
    if (dyRow < cy0 || dyRow >= cy1) continue;
    for (let sx = 0; sx < sw; sx++) {
      const dxCol = x + sx;
      if (dxCol < cx0 || dxCol >= cx1) continue;
      const idx = si[sy * sw + sx];
      if (transparentIndex !== null && idx === transparentIndex) continue;
      di[dyRow * dw + dxCol] = idx;
    }
  }
}

/**
 * Nearest-neighbour integer-upscaled clipped blit: draws `src` at `scale`× into `dst` at (x,y),
 * each source texel becoming a `scale`×`scale` block, clipped to `[clipX0,clipX1)×[clipY0,clipY1)`.
 * Used to paint a **Large (2×2) monster's** single-cell SPRIT fallback across its footprint (CT.7i)
 * — a real big-monster sprite ships at native size, so `scale = 1` reduces to {@link blitIndexedClipped}.
 */
export function blitIndexedScaledClipped(
  dst: IndexedFramebuffer,
  src: IndexedImage,
  x: number,
  y: number,
  scale: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
): void {
  const s = Math.max(1, Math.floor(scale));
  if (s === 1) {
    blitIndexedClipped(dst, src, x, y, clipX0, clipY0, clipX1, clipY1);
    return;
  }
  const { width: sw, height: sh, indices: si, transparentIndex } = src;
  const { width: dw, height: dh, indices: di } = dst;
  const cx0 = Math.max(0, clipX0);
  const cy0 = Math.max(0, clipY0);
  const cx1 = Math.min(dw, clipX1);
  const cy1 = Math.min(dh, clipY1);
  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const idx = si[sy * sw + sx];
      if (transparentIndex !== null && idx === transparentIndex) continue;
      const bx = x + sx * s;
      const by = y + sy * s;
      for (let py = 0; py < s; py++) {
        const dyRow = by + py;
        if (dyRow < cy0 || dyRow >= cy1) continue;
        for (let px = 0; px < s; px++) {
          const dxCol = bx + px;
          if (dxCol < cx0 || dxCol >= cx1) continue;
          di[dyRow * dw + dxCol] = idx;
        }
      }
    }
  }
}

/**
 * Blit an image at a tile-grid cell (col, row). The DOS screen is a 40×25 grid of 8×8
 * tiles; the engine's `Put8x8Symbol(rowY, colX)` places a symbol at pixel (colX·8, rowY·8).
 */
export function blitTile(
  dst: IndexedFramebuffer,
  src: IndexedImage,
  col: number,
  row: number,
  tile = TILE,
): void {
  blitIndexed(dst, src, col * tile, row * tile);
}

/** Fill an axis-aligned rectangle (clipped) with a single palette index. */
export function fillRectIndexed(
  dst: IndexedFramebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  index: number,
): void {
  const { width: dw, height: dh, indices: di } = dst;
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(dw, x + w);
  const y1 = Math.min(dh, y + h);
  for (let yy = y0; yy < y1; yy++) {
    di.fill(index, yy * dw + x0, yy * dw + x1);
  }
}

const BLACK: RGB = { r: 0, g: 0, b: 0 };

/**
 * Resolve the indexed framebuffer to a flat RGBA buffer (width*height*4, top-left origin,
 * every pixel opaque) through `palette`. Undefined indices fall back to black, as on
 * hardware. This is the single colour-resolution step; switching `palette` re-renders the
 * same indexed screen in a different graphics mode.
 */
export function framebufferToRGBA(
  fb: IndexedFramebuffer,
  palette: Palette,
): Uint8ClampedArray {
  const { indices } = fb;
  const out = new Uint8ClampedArray(indices.length * 4);
  for (let i = 0; i < indices.length; i++) {
    const c = palette.colors[indices[i]] ?? BLACK;
    const o = i * 4;
    out[o] = c.r;
    out[o + 1] = c.g;
    out[o + 2] = c.b;
    out[o + 3] = 255;
  }
  return out;
}
