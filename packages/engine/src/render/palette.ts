import type { ColorCycle, Palette, RGB } from '../model/index.js';

/**
 * Standard IBM EGA 16-color default palette (text/CGA-compatible arrangement,
 * with the classic "brown" fix at index 6). RGB 0..255.
 *
 * DOS CoK/DoK are EGA-16 and do NOT store a palette in the file; the DAX loader
 * uses this fixed table. Matches EGA_PALETTE in tools/dax_decode.py exactly.
 */
export const EGA16: readonly RGB[] = [
  { r: 0x00, g: 0x00, b: 0x00 }, // 0  black
  { r: 0x00, g: 0x00, b: 0xaa }, // 1  blue
  { r: 0x00, g: 0xaa, b: 0x00 }, // 2  green
  { r: 0x00, g: 0xaa, b: 0xaa }, // 3  cyan
  { r: 0xaa, g: 0x00, b: 0x00 }, // 4  red
  { r: 0xaa, g: 0x00, b: 0xaa }, // 5  magenta
  { r: 0xaa, g: 0x55, b: 0x00 }, // 6  brown
  { r: 0xaa, g: 0xaa, b: 0xaa }, // 7  light gray
  { r: 0x55, g: 0x55, b: 0x55 }, // 8  dark gray
  { r: 0x55, g: 0x55, b: 0xff }, // 9  bright blue
  { r: 0x55, g: 0xff, b: 0x55 }, // 10 bright green
  { r: 0x55, g: 0xff, b: 0xff }, // 11 bright cyan
  { r: 0xff, g: 0x55, b: 0x55 }, // 12 bright red
  { r: 0xff, g: 0x55, b: 0xff }, // 13 bright magenta
  { r: 0xff, g: 0xff, b: 0x55 }, // 14 yellow
  { r: 0xff, g: 0xff, b: 0xff }, // 15 white
] as const;

/**
 * Build a neutral-model Palette from the fixed EGA-16 table: indices 0..15 are
 * defined, 16..255 are null (undefined-by-this-source / inherit at render time).
 */
export function makeEgaPalette(): Palette {
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < EGA16.length; i++) {
    const c = EGA16[i];
    colors[i] = { r: c.r, g: c.g, b: c.b };
  }
  return { colors, source: 'ega-fixed' };
}

/** Count how many of the 256 slots a palette actually defines (non-null). */
export function definedColorCount(palette: Palette | null | undefined): number {
  if (!palette) return 0;
  let n = 0;
  for (let i = 0; i < 256; i++) if (palette.colors[i]) n++;
  return n;
}

/**
 * Composite several partial palettes into one 256-entry VGA palette.
 *
 * DQK's VGA runtime assembles its active 256-color DAC by *layering* leaf palettes:
 * the UI chrome (ALWAYS.TLB) owns indices 0–15, FRAME/GEN own 16–31, walls 32–68,
 * combat sprites 64–95, backdrops 144–175, sprites 176–255 (per `UAPALETT.TXT`). A
 * single HLIB leaf therefore only fills its own slice and renders dim/black in the
 * slots it doesn't own — standalone-correct but incomplete. Merging the leaves that
 * are co-resident on a screen reconstructs the true full-colour palette.
 *
 * Slots fill in argument order: a later palette's defined colour overrides an
 * earlier one (last-wins) and a `null` never clobbers an already-defined slot.
 * Colour-cycle ranges are concatenated. The result is always a full 256-slot table
 * (undefined slots stay null → black at render time, exactly as on hardware).
 *
 * **This last-wins model is DQK's, verified in its own machine code** — it used to be an
 * inference from `UAPALETT.TXT`'s slot assignments, which is why `hlib-format.md` §8 listed
 * "which leaf's palette wins per screen" as unsolved. The installer at `DQK.EXE:0x018661`
 * (`0x161b:0x00b1`) writes into ONE global 768-byte shadow palette at `DS:0xd145`, three bytes
 * per slot, touching only `[first_col, first_col + ncolors)` and never clearing anything else.
 * A later install over the same slot simply overwrites it; a slot no install covers keeps
 * whatever the previous screen left there. There is no per-leaf DAC, no priority field and no
 * z-order — layering IS overwrite order, exactly as implemented here.
 *
 * Two engine details this function does NOT model, deliberately:
 * - The engine stores `byte >> 2`, because the VGA DAC is 6-bit. Keeping the file's full 8-bit
 *   value renders at most 3/255 brighter per channel than DOS did; see `hlib-format.md` §2.
 * - It keeps a 12-entry table of *registered* ranges at `DS:0xd445` with LRU eviction and a
 *   per-slot dirty bitmap at `DS:0xd0c5`, so it can skip re-uploading an unchanged range.
 *   That is an upload optimisation; it cannot change which colour ends up in a slot.
 */
export function mergePalettes(
  ...palettes: (Palette | null | undefined)[]
): Palette {
  const colors: (RGB | null)[] = new Array(256).fill(null);
  const cycles: ColorCycle[] = [];
  for (const p of palettes) {
    if (!p) continue;
    for (let i = 0; i < 256; i++) {
      const c = p.colors[i];
      if (c) colors[i] = c;
    }
    if (p.cycles) cycles.push(...p.cycles);
  }
  return { colors, source: 'hlib-range', ...(cycles.length ? { cycles } : {}) };
}
