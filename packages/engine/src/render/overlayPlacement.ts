import type { IndexedImage } from '../model/index.js';

/** Result of sliding an indexed overlay across a larger indexed image. */
export interface OverlayPlacement {
  x: number;
  y: number;
  /** Non-transparent overlay pixels equal to the candidate background pixels. */
  matches: number;
  /** Non-transparent overlay pixels compared at every candidate position. */
  compared: number;
}

/**
 * Find where a partial redraw belongs by trying every position at which it fits and counting
 * equal palette indexes. Gold Box title bands contain both new lettering and a large amount of
 * background copied from the full title picture; the copied pixels make the intended position
 * stand out without relying on the usually-zero DAX frame offsets.
 *
 * Transparent pixels do not participate in the score. Ties are deterministic: the first
 * row-major candidate (topmost, then leftmost) wins. Returns `null` when the overlay cannot fit,
 * either index buffer is malformed, or the overlay has no comparable pixels.
 */
export function findBestIndexedOverlayPlacement(
  base: IndexedImage,
  overlay: IndexedImage,
): OverlayPlacement | null {
  if (
    base.width <= 0 ||
    base.height <= 0 ||
    overlay.width <= 0 ||
    overlay.height <= 0 ||
    base.indices.length < base.width * base.height ||
    overlay.indices.length < overlay.width * overlay.height ||
    overlay.width > base.width ||
    overlay.height > base.height
  ) return null;

  const key = overlay.transparentIndex;
  let compared = 0;
  for (const index of overlay.indices.subarray(0, overlay.width * overlay.height)) {
    if (key === null || index !== key) compared++;
  }
  if (compared === 0) return null;

  let bestX = 0;
  let bestY = 0;
  let bestMatches = -1;
  const maxX = base.width - overlay.width;
  const maxY = base.height - overlay.height;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= maxX; x++) {
      let matches = 0;
      for (let sy = 0; sy < overlay.height; sy++) {
        const baseRow = (y + sy) * base.width + x;
        const overlayRow = sy * overlay.width;
        for (let sx = 0; sx < overlay.width; sx++) {
          const index = overlay.indices[overlayRow + sx];
          if (key !== null && index === key) continue;
          if (index === base.indices[baseRow + sx]) matches++;
        }
      }
      if (matches > bestMatches) {
        bestMatches = matches;
        bestX = x;
        bestY = y;
      }
    }
  }
  return { x: bestX, y: bestY, matches: bestMatches, compared };
}
