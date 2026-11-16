/**
 * Treasures of the Savage Frontier / Pools of Darkness — "chunky VGA256 title" DAX
 * picture decoder.
 *
 * A THIRD single-frame DAX picture variant, distinct from both `dax.ts`'s plain 4bpp
 * EGA frames and `daxVgaPicture.ts`'s Gateway-family interleaved-4bpp+1bit-extension
 * format. Found and render-verified in `docs/engine/research/
 * treasures-pools-darkness-scoping.md` §2: both titles' `TITLE.DAX` are 64910 bytes/
 * block (Gateway's own `TITLE.DAX`, by contrast, is 40050 bytes/block under its own
 * format — the two never collide). The shape is much simpler than Gateway's:
 *
 *   10  (header, fields not fully decoded — see below)
 * + 768 (a FULL embedded 256-colour palette, 6-bit-DAC RGB triples, unlike Gateway's
 *        format which carries no in-file palette at all for its extended colours)
 * + 132 (trailer, real non-constant data, meaning UNIDENTIFIED — preserved verbatim)
 * + width·height (plain row-major 8bpp chunky pixels — ONE byte per pixel, no
 *        plane interleave, no de-roll; unlike every other DAX picture format in this
 *        project, this one needs neither `expandIndices` nor `derollFrameIndices`)
 *
 * Four blocks across both titles decoded clean under this rule and were visually
 * confirmed legible (BEYOND SOFTWARE logo, a "FORGOTTEN REALMS ... Vol. IV" banner,
 * the TREASURES OF THE SAVAGE FRONTIER logo with a painted portrait) — this is
 * render-proven, not byte-arithmetic alone.
 *
 * ## What remains UNPROVEN (do not invent)
 *
 * - The 10-byte header's field layout is not decoded beyond an informal read of one
 *   example (`c8 28 00 00 00 00 01 00 00 ff` for a 320×200 block — byte 0 = 200 =
 *   height, byte 1 = 40 = width/8 look plausible by eye, matching the standard DAX
 *   frame header's own height/width_div8 convention, but this was NOT cross-checked
 *   against a second geometry since every observed block in both titles is 320×200).
 *   This decoder does NOT read width/height from the header — it takes them as a
 *   parameter (default 320×200, the only geometry ever observed) and gates purely on
 *   the exact total byte count, the same "strict, self-verifying, never a guess"
 *   discipline `daxVgaPicture.ts` uses.
 * - The 132-byte trailer between the palette and the pixel data is undeciphered.
 *   Preserved verbatim (`trailer`) rather than discarded.
 * - Whether `BIGPIC1.DAX` (a different per-block size in both titles) uses a variant
 *   of this same layout was spot-checked and did NOT cleanly reproduce — left
 *   unresolved, not assumed. This decoder only claims the sizes it exact-matches.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

const HEADER_LEN = 10;
/** 256 colours × 3 components, 6-bit DAC (each byte 0..63) — a full in-file palette. */
const PALETTE_LEN = 768;
/** Real, non-constant, UNIDENTIFIED trailer data — see module doc. */
export const VGA256_TITLE_TRAILER_LEN = 132;

/** Exact total block size for a chunky-VGA256 title picture of the given geometry. */
export function vga256TitleByteLength(width: number, height: number): number {
  return HEADER_LEN + PALETTE_LEN + VGA256_TITLE_TRAILER_LEN + width * height;
}

export interface Vga256TitlePicture {
  width: number;
  height: number;
  /** width*height pixel indices, 0..255, row-major — no plane interleave, no de-roll. */
  indices: Uint8Array;
  /** The full embedded 256-colour palette (6-bit DAC scaled to 8-bit), all slots defined. */
  palette: Palette;
  /** The 132 trailing bytes verbatim — real per-frame data, meaning not yet identified. */
  trailer: Uint8Array;
}

const scale6to8 = (v: number): number => Math.round((v * 255) / 63);

/**
 * Parse one decompressed DAX block as a Treasures/Pools chunky-VGA256 title picture.
 * Returns null if the bytes don't match: wrong total length for the given geometry
 * (default 320×200, the only geometry ever observed in retail data), or the would-be
 * palette region contains a byte > 63 (not a valid 6-bit DAC value — the same
 * "verify the shape before trusting it" discipline used everywhere else in this
 * project). Never a guess.
 */
export function parseVga256Title(raw: Uint8Array, width = 320, height = 200): Vga256TitlePicture | null {
  if (raw.byteLength !== vga256TitleByteLength(width, height)) return null;

  const paletteStart = HEADER_LEN;
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < 256; i++) {
    const o = paletteStart + i * 3;
    const r6 = raw[o]!;
    const g6 = raw[o + 1]!;
    const b6 = raw[o + 2]!;
    if (r6 > 63 || g6 > 63 || b6 > 63) return null;
    colors[i] = { r: scale6to8(r6), g: scale6to8(g6), b: scale6to8(b6) };
  }

  const trailerStart = paletteStart + PALETTE_LEN;
  const trailer = raw.slice(trailerStart, trailerStart + VGA256_TITLE_TRAILER_LEN);
  const pixelStart = trailerStart + VGA256_TITLE_TRAILER_LEN;
  const indices = raw.slice(pixelStart, pixelStart + width * height);

  return { width, height, indices, palette: { colors, source: 'dax-vga256-title' }, trailer };
}

/** Decode a chunky-VGA256 title picture straight to the neutral IndexedImage model. */
export function vga256TitleToIndexedImage(pic: Vga256TitlePicture): IndexedImage {
  return {
    width: pic.width,
    height: pic.height,
    indices: pic.indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: pic.palette,
    encoding: 'dax-vga256-title',
  };
}
