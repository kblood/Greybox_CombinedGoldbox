/**
 * Display scaling / aspect normalization for live graphics-mode switching.
 *
 * The platform versions of a Gold Box game render at different native resolutions and pixel
 * shapes — DOS EGA 320×200, Amiga PAL 320×256, C64 320×200 — but on their original hardware
 * they all filled a ~4:3 screen. A lower-resolution mode was never meant to occupy *less* of
 * the display. So when the user switches DOS ↔ Amiga ↔ C64 live, the picture must stay the
 * same physical size and keep the correct aspect ratio (square circles), not jump around as
 * the pixel count changes.
 *
 * The trick: give every platform the same intended on-screen aspect (`displayAspect`, e.g.
 * 4/3) and fit *that shape* into the host container. The result rectangle then depends only on
 * the container — identical across platforms — while each native framebuffer is stretched to
 * fill it (which also applies the platform's pixel-aspect correction for free: 320×200 → 4:3
 * stretches 200 lines up; 320×256 barely stretches at all).
 *
 * Pure / DOM-free: this computes geometry only. The web host applies it via a single
 * `ctx.drawImage(canvas, dx, dy, dWidth, dHeight)` (or a CSS transform).
 */

/** A platform's native framebuffer size and the aspect it was meant to display at. */
export interface PlatformProfile {
  id: string;
  label: string;
  /** Native framebuffer width in pixels (what the engine renders). */
  nativeWidth: number;
  /** Native framebuffer height in pixels. */
  nativeHeight: number;
  /** Intended on-screen aspect ratio (width / height), e.g. 4/3 for a CRT. */
  displayAspect: number;
}

export const DOS_EGA: PlatformProfile = {
  id: 'dos-ega',
  label: 'DOS (EGA)',
  nativeWidth: 320,
  nativeHeight: 200,
  displayAspect: 4 / 3,
};

export const AMIGA_PAL: PlatformProfile = {
  id: 'amiga-pal',
  label: 'Amiga (PAL)',
  nativeWidth: 320,
  nativeHeight: 256,
  displayAspect: 4 / 3,
};

export const C64: PlatformProfile = {
  id: 'c64',
  label: 'Commodore 64',
  nativeWidth: 320,
  nativeHeight: 200,
  displayAspect: 4 / 3,
};

/** The built-in platform profiles, in switch order. */
export const DISPLAY_PROFILES: readonly PlatformProfile[] = [DOS_EGA, AMIGA_PAL, C64];

/**
 * Pixel aspect ratio (width / height of a single native pixel as displayed). >1 = wide pixels,
 * <1 = tall pixels. DOS 320×200@4:3 ≈ 0.833 (tall pixels → vertical stretch); Amiga
 * 320×256@4:3 ≈ 1.067.
 */
export function pixelAspectRatio(p: PlatformProfile): number {
  return p.displayAspect / (p.nativeWidth / p.nativeHeight);
}

/** A computed placement of the framebuffer inside a container (top-left origin). */
export interface DisplayRect {
  /** Left offset within the container (letterbox/pillarbox margin). */
  x: number;
  /** Top offset within the container. */
  y: number;
  /** Displayed width in container pixels. */
  width: number;
  /** Displayed height in container pixels. */
  height: number;
  /** Horizontal stretch from native: width / nativeWidth. */
  scaleX: number;
  /** Vertical stretch from native: height / nativeHeight. */
  scaleY: number;
  /**
   * True when the integer row snap was applied. False for fit mode, and for integer mode when the
   * container is shorter than one native row set (the fitted box is used instead; see FitOptions).
   */
  integer: boolean;
}

export interface FitOptions {
  /**
   * Whole-row integer scaling (the CoK default). The box height is snapped DOWN to `k × nativeHeight`
   * for the largest `k ≥ 1` that fits, and the width follows the display aspect. So every native row
   * is drawn at exactly `k` CSS rows (whole in CSS px; with a fractional device pixel ratio these map to
   * fractional device rows, so only the CSS-row count is guaranteed whole). The
   * horizontal stretch is `k × pixelAspectRatio`, which is not a whole number for 4:3 profiles
   * (DOS 0.833k, Amiga 1.067k); that is the aspect correction, not a rounding error.
   *
   * Consequences: the box size is per profile in this mode (Amiga 256 rows and DOS 200 rows snap to
   * different heights), so switching systems can change the picture size. Fit mode keeps the
   * identical box across 4:3 profiles. A container shorter than one native row set is never cropped:
   * integer mode falls back to the fitted (smaller, non-integer) box and reports `integer: false`.
   */
  integer?: boolean;
  /** Clamp the scale so the picture never grows beyond this factor of its display-aspect box. */
  maxScale?: number;
}

/**
 * Fit `profile`'s display-aspect box into a `containerW × containerH` area, centered
 * (letterbox/pillarbox). Returns the rectangle to draw the native framebuffer into.
 *
 * Because the returned box depends only on the container and `displayAspect` — not on the
 * native pixel count — two profiles that share a `displayAspect` (DOS, Amiga, C64 all 4/3)
 * yield the SAME rectangle: switching modes keeps the picture the same size. `scaleX`/`scaleY`
 * differ per profile so each native buffer stretches to fill that common box.
 */
export function fitDisplayRect(
  profile: PlatformProfile,
  containerW: number,
  containerH: number,
  opts: FitOptions = {},
): DisplayRect {
  const aspect = profile.displayAspect;
  // Largest aspect-correct box that fits the container.
  let width = containerW;
  let height = width / aspect;
  if (height > containerH) {
    height = containerH;
    width = height * aspect;
  }

  if (opts.maxScale && opts.maxScale > 0) {
    // The box's "scale" is measured against a 1× display-aspect box of native height.
    const max = opts.maxScale * profile.nativeHeight * aspect;
    if (width > max) {
      width = max;
      height = width / aspect;
    }
  }

  let integer = false;
  if (opts.integer) {
    // Snap height DOWN to a whole number of native row sets, then derive an aspect-correct width.
    // Snapping down keeps the box inside the fitted box, so it never overflows the container.
    const k = Math.floor(height / profile.nativeHeight);
    if (k >= 1) {
      height = k * profile.nativeHeight;
      width = height * aspect;
      integer = true;
    }
    // k < 1: the container is shorter than one native row set. Keep the fitted box rather than
    // growing past the container (which the host canvas would silently crop).
  }

  const x = (containerW - width) / 2;
  const y = (containerH - height) / 2;
  return {
    x,
    y,
    width,
    height,
    scaleX: width / profile.nativeWidth,
    scaleY: height / profile.nativeHeight,
    integer,
  };
}
