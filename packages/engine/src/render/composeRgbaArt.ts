/**
 * Render a native indexed game screen with reviewed high-resolution RGBA artwork.
 * This is a pure presentation transform: callers still own the indexed game screen,
 * and must supply exact logical identities and measured native placement separately.
 * No gallery item, output size, or filename is treated as a placement/approval hint.
 */
import type { Palette } from '../model/index.js';
import { framebufferToRGBA, type IndexedFramebuffer } from './screen.js';

export interface RgbaArt {
  width: number;
  height: number;
  /** Interleaved straight-alpha RGBA (4 bytes per pixel). */
  pixels: Uint8Array | Uint8ClampedArray;
}

export interface PlacedRgbaArt {
  art: RgbaArt;
  /** Explicit native-screen coordinates, before scaling. May be negative (clipped). */
  x: number;
  y: number;
  /** Number of art pixels per native-screen pixel (e.g. a 304x120 image at 6x). */
  pixelScale: number;
}

export interface CompositedRgbaScreen extends RgbaArt {
  pixels: Uint8ClampedArray;
}

const MAX_COMPOSITED_PIXELS = 16 * 1024 * 1024;
function positiveInteger(n: number, label: string): void {
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`RGBA art: invalid ${label}`);
}

/**
 * Preserve every pixel of the highest-resolution art by choosing an output scale
 * no smaller than any layer's pixelScale. Missing layers mean the unmodified original
 * screen; an overlay's alpha is composited over the screen rather than substituting
 * black for transparent pixels. Output is always opaque and can be sent to any host.
 */
export function composeRgbaArt(
  screen: IndexedFramebuffer,
  palette: Palette,
  layers: readonly PlacedRgbaArt[],
  outputScale: number,
): CompositedRgbaScreen {
  positiveInteger(screen.width, 'screen width');
  positiveInteger(screen.height, 'screen height');
  positiveInteger(outputScale, 'output scale');
  if (screen.indices.length !== screen.width * screen.height) throw new Error('RGBA art: invalid screen pixel count');
  const width = screen.width * outputScale;
  const height = screen.height * outputScale;
  if (!Number.isSafeInteger(width * height) || width * height > MAX_COMPOSITED_PIXELS) {
    throw new Error('RGBA art: output is too large');
  }

  // Validate every layer before writing any pixels. Output geometry is computed from
  // explicit native size, never rounded from a generated comparison preview.
  for (const layer of layers) {
    positiveInteger(layer.pixelScale, 'layer pixel scale');
    positiveInteger(layer.art.width, 'layer width');
    positiveInteger(layer.art.height, 'layer height');
    if (!Number.isSafeInteger(layer.x) || !Number.isSafeInteger(layer.y)) {
      throw new Error('RGBA art: invalid native placement');
    }
    if (layer.pixelScale > outputScale || layer.art.width % layer.pixelScale !== 0
        || layer.art.height % layer.pixelScale !== 0
        || !Number.isSafeInteger(layer.art.width * layer.art.height * 4)
        || layer.art.pixels.length !== layer.art.width * layer.art.height * 4
        || !Number.isSafeInteger(layer.x * outputScale)
        || !Number.isSafeInteger(layer.y * outputScale)
        || !Number.isSafeInteger((layer.x + layer.art.width / layer.pixelScale) * outputScale)
        || !Number.isSafeInteger((layer.y + layer.art.height / layer.pixelScale) * outputScale)) {
      throw new Error('RGBA art: incompatible layer scale or pixel count');
    }
  }

  const original = framebufferToRGBA(screen, palette);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = Math.floor(y / outputScale) * screen.width;
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      const src = (srcRow + Math.floor(x / outputScale)) * 4;
      pixels[dst] = original[src];
      pixels[dst + 1] = original[src + 1];
      pixels[dst + 2] = original[src + 2];
      pixels[dst + 3] = 255;
    }
  }

  for (const { art, x, y, pixelScale } of layers) {
    const left = x * outputScale;
    const top = y * outputScale;
    const right = left + (art.width / pixelScale) * outputScale;
    const bottom = top + (art.height / pixelScale) * outputScale;
    for (let py = Math.max(0, top); py < Math.min(height, bottom); py++) {
      const sy = Math.floor((py - top) * pixelScale / outputScale);
      for (let px = Math.max(0, left); px < Math.min(width, right); px++) {
        const sx = Math.floor((px - left) * pixelScale / outputScale);
        const src = (sy * art.width + sx) * 4;
        const alpha = art.pixels[src + 3];
        if (alpha === 0) continue;
        const dst = (py * width + px) * 4;
        if (alpha === 255) {
          pixels[dst] = art.pixels[src];
          pixels[dst + 1] = art.pixels[src + 1];
          pixels[dst + 2] = art.pixels[src + 2];
        } else {
          for (let channel = 0; channel < 3; channel++) {
            pixels[dst + channel] = Math.round(
              (art.pixels[src + channel] * alpha + pixels[dst + channel] * (255 - alpha)) / 255,
            );
          }
        }
      }
    }
  }
  return { width, height, pixels };
}
