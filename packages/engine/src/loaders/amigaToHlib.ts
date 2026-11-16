/**
 * Amiga art → DQK HLIB `TILE` converter (E2) — the lossless-direction art transfer at the heart of
 * the project's goal ("lift the superior Amiga CoK/DoK art into the rebuilt DQK-engine games"). The
 * planar→chunky step is already done by {@link decodeDaa} (it expands the Amiga 5-bitplane frames to a
 * chunky index buffer with the per-frame 32-colour palette, each nibble ×17 → full 8-bit RGB); E2
 * does the remaining two steps:
 *
 *   1. **32 → 256 colour placement.** The decoded frame uses palette indices `[srcFirst, srcFirst+N)`
 *      (N ≤ 32). The converter relocates those N colours to a chosen VGA base slot and shifts every
 *      pixel index by the same delta, so the art drops into whichever slice of the 256-colour DAC the
 *      DQK screen reserves for it (e.g. backdrops 144–175, sprites 176–255 per `UAPALETT.TXT`).
 *   2. **HLIB `TILE` emit.** The remapped frame is written through {@link encodeHlibTile} (draw method
 *      16 raw or 18 compressed) — the DQK container the rebuilt engine loads.
 *
 * Lossless: re-decoding the emitted TILE reproduces the source pixels (shifted by the chosen base) and
 * the 32 colours land at their new slots. Verified by round-trip over real `BIGPIC1.DAA` art in
 * `amigaToHlib.test.ts`. The Amiga colour depth (12-bit → 8-bit) already happened in the DAA decoder,
 * so this stage neither gains nor loses colour — it only relocates indices.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';
import { encodeHlibTile, encodeHlibMaster } from './hlibEncode.js';

export interface AmigaToHlibOptions {
  /** Draw method for the emitted TILE images: 16 (raw), 18 (compressed), 21 (raw transparent), or
   * 23 (compressed transparent — the SPRIT.TLB codec). Default 16. */
  method?: number;
  /**
   * VGA palette slot to place the Amiga frame's first colour at. Every pixel index is shifted by
   * `paletteBase − srcFirst`. Default 0 (keep the 0..31 layout). Must keep all indices within 0..255.
   */
  paletteBase?: number;
}

/** The remapped frame: VGA-space pixel indices + a 256-slot palette with the relocated colour slice. */
export interface VgaFrame {
  width: number;
  height: number;
  indices: Uint8Array;
  palette: Palette;
}

/**
 * Relocate a decoded Amiga frame into VGA index space at `paletteBase` (the 32 → 256 colour step). The
 * source's defined palette slice `[srcFirst, srcFirst+count)` moves to `[paletteBase, paletteBase+count)`
 * and every pixel index shifts by the same delta. Throws if a shifted index would leave 0..255, or if the
 * width is not a multiple of 4 (HLIB stores width/4 in one byte; all DAA frames are %8 so this holds).
 */
export function amigaImageToVga(image: IndexedImage, paletteBase = 0): VgaFrame {
  const { width, height, indices } = image;
  if (width % 4 !== 0) throw new Error(`amigaToHlib: width must be %4==0, got ${width}`);
  const srcPal = image.palette;
  const srcFirst = srcPal?.firstColor ?? 0;
  const count = srcPal?.count ?? 32;
  const delta = paletteBase - srcFirst;

  // Validate the shifted index range against the actual pixels used.
  let maxIdx = 0;
  let minIdx = 255;
  for (let i = 0; i < width * height; i++) {
    const v = indices[i];
    if (v > maxIdx) maxIdx = v;
    if (v < minIdx) minIdx = v;
  }
  if (minIdx + delta < 0 || maxIdx + delta > 255) {
    throw new Error(`amigaToHlib: paletteBase ${paletteBase} shifts indices out of 0..255 (src ${minIdx}..${maxIdx})`);
  }

  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = indices[i] + delta;

  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let c = 0; c < count; c++) {
    const rgb = srcPal?.colors[srcFirst + c] ?? null;
    if (rgb) colors[paletteBase + c] = { r: rgb.r, g: rgb.g, b: rgb.b };
  }
  const palette: Palette = { colors, source: 'hlib-range', firstColor: paletteBase, count };
  return { width, height, indices: out, palette };
}

/**
 * Convert one decoded Amiga frame ({@link decodeDaa} block image) into a leaf HLIB `TILE` — the
 * single-frame art-transfer primitive. Relocates the palette to `opts.paletteBase` and writes the
 * remapped pixels with `opts.method`.
 */
export function amigaImageToHlibTile(image: IndexedImage, opts: AmigaToHlibOptions = {}): Uint8Array {
  const vga = amigaImageToVga(image, opts.paletteBase ?? 0);
  return encodeHlibTile([{ width: vga.width, height: vga.height, indices: vga.indices }], vga.palette, { method: opts.method ?? 16 });
}

/**
 * Convert many decoded Amiga frames into one HLIB `TILE` per frame, returned keyed by an id (e.g. the
 * DAA block id). All frames share the same `paletteBase`/`method`; each keeps its own colour table
 * (Amiga frames carry per-frame palettes, so one leaf-per-frame preserves them losslessly). Frames
 * whose image is null are skipped.
 */
export function amigaFramesToHlibTiles(
  frames: { id: number; image: IndexedImage | null }[],
  opts: AmigaToHlibOptions = {},
): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  for (const f of frames) {
    if (!f.image) continue;
    out.set(f.id, amigaImageToHlibTile(f.image, opts));
  }
  return out;
}

/** The decoded-Amiga-archive shape this converter consumes (just the solved frame images). */
export interface AmigaFrameSource {
  frameSet: { frames: Map<number, IndexedImage> };
}

/**
 * Convert a whole decoded Amiga art archive ({@link decodeDaa}, the solved `kind: 'blocks'` form) into
 * one **master HLIB `.TLB`** — a drop-in replacement for a DQK art library like `BIGPIC.TLB`/`CPIC.TLB`.
 * Each solved frame becomes one leaf TILE set (relocated to `opts.paletteBase`, default 32 — the DAC
 * slice the DQK picture libraries use — and written with `opts.method`, default 18 like the real
 * BIGPIC), and the sets are packed under a master container the engine reads back set-by-set. The
 * frames are emitted in archive iteration order. Throws if the archive has no solved frames.
 *
 * This is the **art override** the rebuild feeds to `planDqkBuild` (e.g. `overrides: { 'BIGPIC.TLB':
 * amigaArchiveToHlibMaster(decodeDaa(bigpic1Daa)) }`), so a CoK/DoK-on-DQK build ships the superior
 * Amiga artwork in the native DQK container — the project's core "best-of art on the newest engine" goal.
 */
export function amigaArchiveToHlibMaster(
  archive: AmigaFrameSource,
  opts: AmigaToHlibOptions = {},
): Uint8Array {
  const method = opts.method ?? 18;
  const paletteBase = opts.paletteBase ?? 32;
  const sets: Uint8Array[] = [];
  for (const image of archive.frameSet.frames.values()) {
    sets.push(amigaImageToHlibTile(image, { method, paletteBase }));
  }
  if (sets.length === 0) throw new Error('amigaToHlib: archive has no solved frames to pack');
  return encodeHlibMaster(sets);
}

/** Transparent key index in DQK draw methods 21/23 (a pixel of 255 is see-through). */
const HLIB_TRANSPARENT = 255;

/**
 * Detect a sprite sheet's transparent **background** colour as the index that dominates the frame
 * borders across the whole archive. Sprite art keeps its see-through background on the frame edges, so
 * the most frequent border pixel is the background — robust because it is measured over every frame's
 * perimeter, not guessed (CoK `comspr.daa` → 8, DoK `COMSPR.DAA` → 16, each overwhelmingly dominant).
 * This is what makes the leaf converter game-agnostic: the transparent key is read from the source, not
 * hardcoded per game. Returns 0 for an empty archive.
 */
export function detectTransparentBackground(archive: AmigaFrameSource): number {
  const hist = new Map<number, number>();
  const add = (v: number) => hist.set(v, (hist.get(v) ?? 0) + 1);
  for (const f of archive.frameSet.frames.values()) {
    const { width: W, height: H, indices: ix } = f;
    if (W === 0 || H === 0) continue;
    for (let x = 0; x < W; x++) { add(ix[x]); add(ix[(H - 1) * W + x]); }
    for (let y = 0; y < H; y++) { add(ix[y * W]); add(ix[y * W + (W - 1)]); }
  }
  let best = 0;
  let bestN = -1;
  for (const [v, n] of hist) if (n > bestN) { bestN = n; best = v; }
  return best;
}

/**
 * Detect ONE frame's transparent **background** colour as its dominant border pixel — the per-frame
 * counterpart of {@link detectTransparentBackground} (same measurement, scoped to a single image
 * instead of a whole archive). Needed by the mapped-art repack path, where a single Amiga frame is
 * lifted into a transparent-class (method 21/23) DQK slot and its background must become the HLIB
 * 255 key: the key is measured from the frame itself, not hardcoded, because it varies within one
 * archive (CoK sub-frame SPRIT blocks use index 13 on the closest-view frame but index 0 on the
 * combat-view frames). Returns 0 for an empty image.
 */
export function detectFrameTransparentBackground(image: IndexedImage): number {
  const { width: W, height: H, indices: ix } = image;
  if (W === 0 || H === 0) return 0;
  const hist = new Map<number, number>();
  const add = (v: number) => hist.set(v, (hist.get(v) ?? 0) + 1);
  for (let x = 0; x < W; x++) { add(ix[x]); add(ix[(H - 1) * W + x]); }
  for (let y = 0; y < H; y++) { add(ix[y * W]); add(ix[y * W + (W - 1)]); }
  let best = 0;
  let bestN = -1;
  for (const [v, n] of hist) if (n > bestN) { bestN = n; best = v; }
  return best;
}

export interface AmigaToHlibLeafOptions extends AmigaToHlibOptions {
  /**
   * Source palette index that means "transparent background" in the Amiga frames. Every pixel equal to
   * it is written as the HLIB transparent key (255) so the emitted method-21/23 sprite composites over
   * the scene (e.g. COMSPR combat sprites use source index 8 — the dominant border/corner colour). When
   * omitted, no pixel is forced transparent (a fully opaque leaf).
   */
  transparentSourceIndex?: number;
}

/**
 * Convert a whole decoded Amiga art archive into one **leaf HLIB `TILE`** with a single **shared colour
 * table** — the drop-in form DQK uses for its sprite/icon libraries (COMSPR, CBODY, ALWAYS): `tag TILE`,
 * `ptr[0]` = one colour table, `ptr[1..]` = the frames, all indexing that shared palette. This is the
 * leaf counterpart to {@link amigaArchiveToHlibMaster} (which gives every frame its own palette).
 *
 * Each frame is relocated to `opts.paletteBase` (default 64 — the DQK sprite DAC slice); the pixel
 * indices are carried **losslessly**. Because a leaf has only one palette but Amiga frames may carry
 * several, the colour tables are merged across frames (last-non-null wins per slot) into one shared
 * table — lossless when the frames agree, and a single best-effort table when they don't (e.g. COMSPR's
 * 32 frames use 2 palettes, so a couple of slots resolve to the later frame's colour; the *pixels* are
 * always exact). With `transparentSourceIndex` set, that source colour becomes the 255 transparent key
 * (method 21/23). Emits with `opts.method` (default 21, raw transparent). Throws if no frames decode.
 */
export function amigaArchiveToHlibLeaf(
  archive: AmigaFrameSource,
  opts: AmigaToHlibLeafOptions = {},
): Uint8Array {
  const method = opts.method ?? 21;
  const paletteBase = opts.paletteBase ?? 64;
  const tIndex = opts.transparentSourceIndex;

  const images: { width: number; height: number; indices: Uint8Array }[] = [];
  const mergedColors: (RGB | null)[] = new Array(256).fill(null);
  let mergedCount = 0;

  for (const image of archive.frameSet.frames.values()) {
    const vga = amigaImageToVga(image, paletteBase);
    if (tIndex !== undefined) {
      // Map the source background colour to the transparent key, working from the original indices
      // (before the +delta relocation) so the caller's index space matches the decoded Amiga frame.
      const src = image.indices;
      for (let i = 0; i < vga.indices.length; i++) if (src[i] === tIndex) vga.indices[i] = HLIB_TRANSPARENT;
    }
    images.push({ width: vga.width, height: vga.height, indices: vga.indices });

    const first = vga.palette.firstColor ?? paletteBase;
    const count = vga.palette.count ?? 0;
    for (let c = 0; c < count; c++) {
      const rgb = vga.palette.colors[first + c];
      if (rgb) mergedColors[first + c] = rgb; // last-non-null wins
    }
    if (count > mergedCount) mergedCount = count;
  }
  if (images.length === 0) throw new Error('amigaToHlib: archive has no solved frames to pack (leaf)');

  const palette: Palette = { colors: mergedColors, source: 'hlib-range', firstColor: paletteBase, count: mergedCount };
  return encodeHlibTile(images, palette, { method });
}
