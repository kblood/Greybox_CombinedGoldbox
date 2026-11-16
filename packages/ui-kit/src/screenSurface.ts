/**
 * ScreenSurface — the host-side display for the engine's exact-screen compositor.
 *
 * The engine composes a whole platform screen as an indexed {@link IndexedFramebuffer}
 * (e.g. CoK's 320×200 EGA exploration screen via `composeExploreScreen`). This module owns
 * the visible `<canvas>` and turns that framebuffer into pixels the way an emulator would:
 *
 *   1. resolve the indexed buffer to RGBA once (`framebufferToRGBA`, palette = graphics mode),
 *   2. stamp it 1:1 into an offscreen canvas at native resolution,
 *   3. blit that onto the visible canvas, scaled by {@link fitDisplayRect} so the picture keeps
 *      the platform's display aspect (4:3) and stays the SAME on-screen size regardless of the
 *      native pixel count — the user's "different versions look the same size" requirement.
 *
 * Nearest-neighbour throughout (`imageSmoothingEnabled = false`) keeps the EGA pixels crisp.
 * Switching `profile` (DOS↔Amiga↔C64) or `palette` re-displays the same indexed screen in a
 * different graphics mode without touching the compositor — the indexed-framebuffer payoff.
 *
 * `packages/ui-kit` (ROADMAP M0.S3) — extracted from `apps/web/src/ui/screenSurface.ts`, which
 * `apps/author/src/screenSurface.ts` had been a near-identical, explicitly-commented copy of
 * (both files shared the same `blitNative`/`render`/`paint` logic; only the entry point differed
 * — apps/web creates a fresh canvas per panel, apps/author paints into one fixed `<canvas>` in
 * `index.html`). One shared internal implementation now backs both entry points below.
 */
import {
  framebufferToRGBA,
  fitDisplayRect,
  type IndexedFramebuffer,
  type Palette,
  type PlatformProfile,
  type DisplayRect,
  type FitOptions,
  type CompositedRgbaScreen,
} from '@goldbox/engine';

export interface ScreenSurface {
  /** The visible canvas; append this to the DOM and size it via CSS (it fills its box). */
  readonly canvas: HTMLCanvasElement;
  /** Resolve `fb` through `palette` and display it, scaled/letterboxed to the canvas box. */
  paint(fb: IndexedFramebuffer, palette: Palette): void;
  /** Paint an already-composited high-resolution RGBA screen without palette quantization. */
  paintRgba(screen: CompositedRgbaScreen): void;
  /** Paint the native indexed screen, then overlay high-resolution RGBA art at native coordinates. */
  paintRgbaLayers(fb: IndexedFramebuffer, palette: Palette, layers: readonly ScreenRgbaLayer[]): void;
  /** Switch the platform profile (native size + display aspect); repaints the last frame. */
  setProfile(profile: PlatformProfile): void;
  /** Change scaling options (integer snap, max scale) at runtime; repaints the last frame. */
  setFitOptions(opts: FitOptions): void;
  /** The active platform profile. */
  profile(): PlatformProfile;
  /** The display rectangle (CSS px, within the canvas box) the last paint mapped the screen to. */
  rect(): DisplayRect | null;
  /**
   * Convert a client (viewport) pointer position to native-screen pixel coordinates using the SAME
   * rectangle the last paint drew into. Returns null for letterbox bars, outside the canvas, or before
   * the first paint, so a click on a bar never maps to a grid cell.
   */
  nativePointAt(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Re-run layout + paint for the current container size (called automatically on resize). */
  refresh(): void;
  /** Stop observing resize and drop references. */
  dispose(): void;
}

export interface ScreenRgbaLayer {
  art: { width: number; height: number; pixels: Uint8Array | Uint8ClampedArray };
  /** Native-screen coordinate of the layer's top-left edge. */
  x: number;
  y: number;
  /** Art pixels per native-screen pixel. */
  pixelScale: number;
}

interface PreparedRgbaLayer extends ScreenRgbaLayer {
  canvas: HTMLCanvasElement;
}

function makeSurface(canvas: HTMLCanvasElement, profile: PlatformProfile, opts: FitOptions): ScreenSurface {
  const ctx = canvas.getContext('2d');

  // Native-resolution scratch buffer the visible canvas magnifies. Reused across paints.
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');

  let curProfile = profile;
  let curOpts: FitOptions = opts;
  let hasFrame = false;
  let lastRect: DisplayRect | null = null;
  let rgbaLayers: readonly PreparedRgbaLayer[] = [];

  /** Copy prepared pixels to the scratch canvas at their actual resolution. */
  function blitRgba(width: number, height: number, pixels: Uint8ClampedArray): void {
    if (!offCtx) return;
    if (off.width !== width || off.height !== height) {
      off.width = width;
      off.height = height;
    }
    const img = offCtx.createImageData(width, height);
    img.data.set(pixels);
    offCtx.putImageData(img, 0, 0);
  }

  function render(): void {
    if (!ctx || !hasFrame) return;
    // Container box in CSS pixels. clientWidth/Height come from the element's CSS-driven layout;
    // fall back to the native size before the element is in the DOM / measured.
    const cssW = canvas.clientWidth || curProfile.nativeWidth;
    const cssH = canvas.clientHeight || curProfile.nativeHeight;
    if (cssW <= 0 || cssH <= 0) {
      lastRect = null;
      return;
    }

    // Back the canvas at device-pixel density so the letterbox bars and scaled image stay crisp
    // on HiDPI displays. The drawImage geometry is computed in CSS px then scaled by dpr.
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    const rect = fitDisplayRect(curProfile, cssW, cssH, curOpts);
    lastRect = rect;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, bw, bh);
    ctx.drawImage(
      off,
      0, 0, off.width, off.height,
      rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr,
    );

    if (rgbaLayers.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      for (const layer of rgbaLayers) {
        const left = rect.x * dpr + layer.x * rect.scaleX * dpr;
        const top = rect.y * dpr + layer.y * rect.scaleY * dpr;
        const width = layer.art.width / layer.pixelScale * rect.scaleX * dpr;
        const height = layer.art.height / layer.pixelScale * rect.scaleY * dpr;
        ctx.drawImage(layer.canvas, 0, 0, layer.art.width, layer.art.height, left, top, width, height);
      }
      ctx.restore();
    }
  }

  function paint(fb: IndexedFramebuffer, palette: Palette): void {
    blitRgba(fb.width, fb.height, framebufferToRGBA(fb, palette));
    rgbaLayers = [];
    hasFrame = true;
    render();
  }

  function paintRgba(screen: CompositedRgbaScreen): void {
    if (!Number.isSafeInteger(screen.width) || !Number.isSafeInteger(screen.height)
        || screen.width <= 0 || screen.height <= 0
        || screen.pixels.length !== screen.width * screen.height * 4) {
      throw new Error('ScreenSurface: invalid RGBA screen');
    }
    blitRgba(screen.width, screen.height, screen.pixels);
    rgbaLayers = [];
    hasFrame = true;
    render();
  }

  function paintRgbaLayers(fb: IndexedFramebuffer, palette: Palette, layers: readonly ScreenRgbaLayer[]): void {
    const prepared = layers.map((layer) => {
      if (!Number.isSafeInteger(layer.x) || !Number.isSafeInteger(layer.y)
          || !Number.isSafeInteger(layer.pixelScale) || layer.pixelScale <= 0
          || !Number.isSafeInteger(layer.art.width) || layer.art.width <= 0
          || !Number.isSafeInteger(layer.art.height) || layer.art.height <= 0
          || layer.art.width % layer.pixelScale !== 0 || layer.art.height % layer.pixelScale !== 0
          || layer.art.pixels.length !== layer.art.width * layer.art.height * 4) {
        throw new Error('ScreenSurface: invalid RGBA layer');
      }
      const layerCanvas = document.createElement('canvas');
      layerCanvas.width = layer.art.width;
      layerCanvas.height = layer.art.height;
      const layerCtx = layerCanvas.getContext('2d');
      if (!layerCtx) throw new Error('ScreenSurface: RGBA layer canvas unavailable');
      const image = layerCtx.createImageData(layer.art.width, layer.art.height);
      image.data.set(layer.art.pixels);
      layerCtx.putImageData(image, 0, 0);
      return { ...layer, canvas: layerCanvas };
    });
    blitRgba(fb.width, fb.height, framebufferToRGBA(fb, palette));
    rgbaLayers = prepared;
    hasFrame = true;
    render();
  }

  function setProfile(next: PlatformProfile): void {
    curProfile = next;
    render();
  }

  function setFitOptions(next: FitOptions): void {
    curOpts = next;
    render();
  }

  function refresh(): void {
    if (hasFrame) {
      // Native/RGBA buffer is unchanged; only the on-screen mapping needs recomputing.
      render();
    }
  }

  function nativePointAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = lastRect;
    if (!rect || !hasFrame || !off.width || !off.height) return null;
    const box = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    // Client px -> the canvas's CSS box (the space `rect` was measured in). Equal unless a CSS
    // transform scales the canvas; the border is excluded because the box origin is the padding edge.
    const cssW = canvas.clientWidth || box.width;
    const cssH = canvas.clientHeight || box.height;
    const localX = (clientX - box.left - canvas.clientLeft) * (cssW / box.width);
    const localY = (clientY - box.top - canvas.clientTop) * (cssH / box.height);
    if (localX < rect.x || localY < rect.y
        || localX >= rect.x + rect.width || localY >= rect.y + rect.height) return null;
    // Invert the exact mapping `render` draws with (source = off, destination = rect), so a click
    // lands on the native pixel the viewer sees under the pointer.
    const x = Math.min(off.width - 1, Math.floor((localX - rect.x) * off.width / rect.width));
    const y = Math.min(off.height - 1, Math.floor((localY - rect.y) * off.height / rect.height));
    return { x, y };
  }

  // Repaint on container resize so the picture always fits (and stays correctly letterboxed).
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refresh()) : null;
  ro?.observe(canvas);

  return {
    canvas,
    paint,
    paintRgba,
    paintRgbaLayers,
    setProfile,
    setFitOptions,
    profile: () => curProfile,
    rect: () => lastRect,
    nativePointAt,
    refresh,
    dispose: () => ro?.disconnect(),
  };
}

/**
 * Create a display surface for `profile`. `opts.integer` snaps to whole-pixel scales (sharpest,
 * but jumps in size); the default is smooth fit so the picture tracks the container. The canvas
 * starts class `gb-emu-canvas`; style it to fill whatever box you drop it in.
 */
export function createScreenSurface(
  profile: PlatformProfile,
  opts: FitOptions = {},
): ScreenSurface {
  const canvas = document.createElement('canvas');
  canvas.className = 'gb-emu-canvas pixelated';
  return makeSurface(canvas, profile, opts);
}

/**
 * Attach a display surface to an existing `<canvas>` (apps/author has one fixed canvas in
 * `index.html`, unlike apps/web which creates one per panel).
 */
export function attachScreenSurface(
  canvas: HTMLCanvasElement,
  profile: PlatformProfile,
  opts: FitOptions = {},
): ScreenSurface {
  return makeSurface(canvas, profile, opts);
}
