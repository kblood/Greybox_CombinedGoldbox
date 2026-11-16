import type { IndexedImage, Palette, RGB } from '../model/index.js';

const BLACK: RGB = { r: 0, g: 0, b: 0 };

/**
 * Convert an IndexedImage to a flat RGBA buffer (width*height*4 bytes, top-left
 * origin), resolving each index through the image's own palette, falling back to
 * an optional context palette, then to black (as on hardware for undefined).
 *
 * Transparent pixels (idx === transparentIndex) are emitted as fully transparent
 * (alpha 0); all others get alpha 255. For an opaque image (transparentIndex
 * null) every pixel is alpha 255.
 *
 * The render half of the golden-file anchor: an IndexedImage rendered through its
 * palette here must match the Python decoder's frame_to_rgb output (RGB) exactly.
 */
export function indexedToRGBA(
  image: IndexedImage,
  palette?: Palette | null,
): Uint8ClampedArray {
  const { width, height, indices, transparentIndex } = image;
  const ctx = palette ?? null;
  const own = image.palette ?? null;
  const out = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const o = i * 4;
    if (transparentIndex !== null && idx === transparentIndex) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
      continue;
    }
    const c = own?.colors[idx] ?? ctx?.colors[idx] ?? BLACK;
    out[o] = c.r;
    out[o + 1] = c.g;
    out[o + 2] = c.b;
    out[o + 3] = 255;
  }
  return out;
}
