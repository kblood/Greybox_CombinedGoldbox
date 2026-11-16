/**
 * Late-Gen1 "palette-only" DAX record (`PIC1*`/`PIC1A*`/`OVER.DAX` in Treasures of the Savage
 * Frontier) — a fixed-format resource that carries a 223-colour 6-bit-DAC palette and NO pixel
 * data at all.
 *
 * ## Provenance
 *
 * The 25th handoff entry disclosed twelve Treasures `PIC1`/`PIC1A` blocks (798 bytes each) that
 * "still do not decode" under {@link parseVgaCompressedPicture} — its own doc comment already
 * measured them as `width = height = 0`, "not pictures under this reading at all", sharing a
 * 64-byte prefix and then differing in 29..108 bytes, with a would-be `colorCount` of 21 (odd),
 * which that decoder's palette gate rejects. This module reads the SAME bytes under the correct
 * field layout and finds they decode cleanly, as palette data:
 *
 * ```
 * off 0   u16 height        (0 for every accepted record)
 * off 2   u16 width_div8    (0 for every accepted record — so width is 0 too)
 * off 4   u16 yOffset       (0 for every accepted record)
 * off 6   u16 xOffset       (1 for every accepted record; carried, not required)
 * off 8   u8  paletteBase   (0x20 = 32 for every accepted record)
 * off 9   u8  colorCount    (223 for every accepted record — ODD, which is exactly why
 *                            parseVgaCompressedPicture's `(colorCount & 1) !== 0` gate, reading
 *                            the SAME byte through its own off-by-one 11-byte header, rejects
 *                            these; that decoder's `paletteBase`/`colorCount` are this record's
 *                            `colorCount`/`tail[0]` respectively — two different formats sharing
 *                            a byte range, not the same format read two ways)
 * off 10  colorCount x {u8 r, u8 g, u8 b}   6-bit DAC triples (each channel 0..63)
 * off 10+colorCount*3   a `tail` of `floor(colorCount/2) + 8` bytes
 * ```
 *
 * A corpus sweep of every `.DAX` in the repo, the GOG Galaxy installs and the standalone Buck
 * Rogers DOS folder (rerun by `vgaPaletteRecord.test.ts`, see that file for the exact command
 * and file count) finds **exactly 16** blocks matching `height===0 && width_div8===0 &&
 * paletteBase===0x20 && length === 10 + colorCount*3 + (floor(colorCount/2)+8)` with every DAC
 * byte `<= 63`: `OVER.DAX` ids 1-4, `PIC1.DAX` ids 38/47/48/57/68/70, `PIC1A.DAX` ids
 * 78/81/89/90/100/119 — all in Treasures of the Savage Frontier, all `colorCount === 223`. Zero
 * matches anywhere else (Pools, Buck Rogers, every EGA-generation title, every DQK/HLIB archive
 * — this format is DAX-only by construction, since HLIB carries its own embedded palette chunk).
 *
 * The twelve `PIC1`/`PIC1A` records share a 64-byte prefix (measured, not assumed) and differ in
 * 29..108 of their remaining bytes; all 16 decoded palettes (all 16, not just the twelve) are
 * pairwise distinct. See the test file for the exact byte-for-byte re-measurement.
 *
 * ## What the tail is — and is not
 *
 * `colorCount` is odd (223), so `floor(colorCount/2) = 111`. The tail is characterised, not
 * decoded: the first 111 bytes are carried as `lookupSeed` (by analogy with the "lookup seed"
 * bytes {@link parseVgaCompressedPicture} reads at the equivalent position in its own format —
 * SAME byte count relationship, unproven to be the SAME meaning here), and the remaining 8 bytes
 * as `tailExtra`. Neither is interpreted further; this module does not guess what selects or
 * consumes this palette at runtime, only that the palette itself decodes to 223 well-formed
 * 6-bit-DAC colours.
 *
 * ## No pixels — do not invent an image
 *
 * This record carries zero width, zero height and zero pixel bytes. It is not a picture. The
 * `image` this module returns is a synthetic 16x14 (224-cell, one cell spare) swatch of the
 * decoded palette — a way to *see* the colours, not a claim that the original game ever
 * rasterised this shape. The spare cell (224 - 223 = 1) repeats the last defined colour rather
 * than reading an undefined palette slot.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

const HEADER_LEN = 10;
const REQUIRED_PALETTE_BASE = 0x20;
const scale6to8 = (value: number): number => Math.round((value * 255) / 63);

export interface VgaPaletteRecord {
  /** Always 0x20 (32) across every corpus hit; kept as a field rather than a bare constant. */
  paletteBase: number;
  /** Always 223 across every corpus hit; kept as a field (it is odd, deliberately not gated). */
  colorCount: number;
  /** The word at offset 6 (0-1 elsewhere, this seat only). Carried, not interpreted. */
  xOffset: number;
  /** 256-slot palette with `[paletteBase, paletteBase+colorCount)` populated. */
  palette: Palette;
  /** First `floor(colorCount/2)` tail bytes — uninterpreted, see module doc. */
  lookupSeed: Uint8Array;
  /** Remaining tail bytes after `lookupSeed` — uninterpreted, see module doc. */
  tailExtra: Uint8Array;
}

/**
 * Parse a late-Gen1 palette-only record. Strict exact-length gate (header + palette + tail must
 * consume the whole block) so this can never double-match a real picture: real
 * {@link parseVgaCompressedPicture} records require nonzero width/height, which this format
 * never has, and this format requires `paletteBase === 0x20` plus an exact byte count that no
 * other known DAX record shape produces (see `vgaPaletteRecord.test.ts`'s corpus sweep).
 */
export function parseVgaPaletteRecord(raw: Uint8Array): VgaPaletteRecord | null {
  if (raw.length < HEADER_LEN + 2) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = view.getUint16(0, true);
  const widthDiv8 = view.getUint16(2, true);
  if (height !== 0 || widthDiv8 !== 0) return null;

  const paletteBase = raw[8]!;
  const colorCount = raw[9]!;
  if (paletteBase !== REQUIRED_PALETTE_BASE) return null;
  if (colorCount < 2 || paletteBase + colorCount > 256) return null;

  const paletteEnd = HEADER_LEN + colorCount * 3;
  const tailLen = Math.floor(colorCount / 2) + 8;
  const expectedLen = paletteEnd + tailLen;
  if (raw.length !== expectedLen) return null;

  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < colorCount; i++) {
    const offset = HEADER_LEN + i * 3;
    const r = raw[offset]!;
    const g = raw[offset + 1]!;
    const b = raw[offset + 2]!;
    if (r > 63 || g > 63 || b > 63) return null;
    colors[paletteBase + i] = { r: scale6to8(r), g: scale6to8(g), b: scale6to8(b) };
  }

  const seedLen = Math.floor(colorCount / 2);
  const lookupSeed = raw.slice(paletteEnd, paletteEnd + seedLen);
  const tailExtra = raw.slice(paletteEnd + seedLen, raw.length);

  return {
    paletteBase,
    colorCount,
    xOffset: view.getInt16(6, true),
    palette: {
      colors,
      source: 'dax-vga-palette-record',
      firstColor: paletteBase,
      count: colorCount,
    },
    lookupSeed,
    tailExtra,
  };
}

const SWATCH_COLS = 16;
const SWATCH_ROWS = 14;

/**
 * A synthetic 16x14 (224-cell) swatch over the decoded palette, one cell per colour in
 * palette order, row-major. NOT a picture the original game ever drew — see module doc. The
 * spare cell (224 - colorCount, always 1 for the measured colorCount=223) repeats the palette's
 * last defined index rather than an undefined one.
 */
export function vgaPaletteRecordToSwatchImage(record: VgaPaletteRecord): IndexedImage {
  const total = SWATCH_COLS * SWATCH_ROWS;
  const indices = new Uint8Array(total);
  const lastIndex = record.paletteBase + record.colorCount - 1;
  for (let i = 0; i < total; i++) {
    indices[i] = i < record.colorCount ? record.paletteBase + i : lastIndex;
  }
  return {
    width: SWATCH_COLS,
    height: SWATCH_ROWS,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: record.palette,
    encoding: 'dax-vga-palette-record-swatch',
  };
}
