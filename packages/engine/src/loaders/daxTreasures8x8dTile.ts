/**
 * Treasures of the Savage Frontier — third `8X8D` sub-format ("mode 2" wall-tile
 * bank), `8X8D1.DAX`'s own 12 blocks.
 *
 * Full investigation history: `docs/engine/research/treasures-8x8d1-thirdformat.md`
 * (round 1: structural facts + six visually-ruled-out hypotheses against the WRONG
 * pixel geometry; round 2: the two stuck `GAME.OVR` far calls resolved to static
 * `GAME.EXE` resident code, the draw routine at `0x229:0x1350` fully disassembled —
 * a sparse span-copy into the VGA linear framebuffer of plain 8bpp chunky bytes, NOT
 * 4bpp tiles; round 3, this module: the DGROUP lookup-table's contents AND the
 * "mode 2" pixel-payload path both resolved by static disassembly of `GAME.EXE`
 * around file offsets `0x2390`-`0x2c6e`, cross-checked with a bounded Unicorn
 * emulation of the real-mode startup/relocation stub to independently confirm the
 * DGROUP segment value).
 *
 * ## The corrected picture (round 3)
 *
 * Round 2 assumed `LOOKUP_TABLE` (referenced by the pixel-decode inner loop as
 * `DS:(di - 0x30ec)` i.e. `DS:0xcf14`) was a fixed, global, compile-time DGROUP
 * constant. It is not: DGROUP itself resolves to nominal segment `0x0c3e` (proven
 * two independent ways — see "DGROUP identification" below — and `DS:0xcf14` at
 * that segment lands *past EOF* in `GAME.EXE`, meaning it is BSS, not file-stored
 * data). The disassembly at file offset `0x2390` (`GAME.EXE`, the resource
 * "prepare" routine) shows `LOOKUP_TABLE` is instead **rebuilt from scratch for
 * every resource load**, straight out of bytes already present in the SAME raw
 * decompressed DAX block:
 *
 *   - `LOOKUP_TABLE[0..15] = 0..15` (identity, a plain counting loop, file offset
 *     `0x248b`-`0x24a6`).
 *   - Then, for `i = 0 .. numColors/2 - 1`: read one byte `b` from the block at
 *     `10 + numColors*3 + i` (i.e. immediately after the embedded palette),
 *     `LOOKUP_TABLE[paletteBase + i*2] = b >> 4`, `LOOKUP_TABLE[paletteBase + i*2 + 1]
 *     = b & 0xF` (file offset `0x24c2`-`0x2522`).
 *
 * `paletteBase` and `numColors` are themselves just the block's own header bytes 8
 * and 9 (`+1`) — proven by an exact numeric match: this file's constant header byte
 * 9 is `0x6f`, giving `numColors = 112`, which is EXACTLY round 1's independently
 * derived "336 = 112 × 3, a clean RGB-triple boundary" finding for the embedded
 * palette length. That cross-check (a value derived from live disassembly matching a
 * value derived from pure static byte-counting in an earlier, unrelated round) is
 * the strongest evidence in this whole investigation that the header-field mapping
 * above is correct, not a coincidence.
 *
 * `LOOKUP_TABLE` turns out NOT to be consulted by this specific block's own pixel
 * payload, though: the same `GAME.EXE` routine (`0x288c`) dispatches on a global
 * "mode" byte (`[0x7e4c]`, DS-relative) into three completely different pixel-decode
 * paths, and mode 2 — the one this file's blocks use, proven by the resident
 * palette-loader at file offset `0x2447` gating its OWN work on `cmp byte [0x7e4c],2`
 * — is a **plain, unencoded byte copy** (file offset `0x2bff`-`0x2c6e`, a Pascal
 * `System.Move` in a `for outer = 1..rowCount` loop copying `stride` bytes per
 * iteration straight from the block into the resource's pixel buffer; no table
 * lookup anywhere in that loop). `LOOKUP_TABLE` is real and its construction is now
 * fully solved (this is the literal answer to "the DGROUP lookup-table values": they
 * are per-block computed, not a static dump), but this specific mode/format's own
 * pixel bytes are already final palette-relative VGA-chunky values on disk — no
 * decode step is needed to use them, only the header/palette/skip bookkeeping this
 * module implements. `parseTreasures8x8dTile` still builds and returns the table
 * (`lookupTable`) for completeness/diagnostics and to keep the research record
 * checkable, even though this decoder's own pixel path does not consult it.
 *
 * ## Geometry
 *
 *   10                  header (fields below)
 * + numColors*3         embedded palette, 6-bit-DAC RGB triples (`paletteBase` is
 *                        the VGA DAC register the FIRST entry loads into — NOT
 *                        necessarily 0; this block bank loads into DAC 32..143,
 *                        leaving 0..31 to a separate, shared/global palette this
 *                        format does not carry, matching this project's existing
 *                        "hlib-range"-style partial-palette convention)
 * + numColors/2         `LOOKUP_TABLE` seed bytes (not needed for mode-2 pixels;
 *                        parsed and exposed anyway — see above)
 * + 4                   a "flag record" whose own semantics are UNRESOLVED (first
 *                        byte gates a conditional 3-byte copy into a small global
 *                        buffer at file offset `0x2540`-`0x255d`; not needed for
 *                        pixel decode and not modelled further here)
 * + 0x1c (conditional)  an EXTRA skip, proven only for `paletteBase===0x20 &&
 *                        numColors===0x70` — file offset `0x2566`-`0x2575`'s own
 *                        hardcoded special case, reproduced byte-for-byte rather
 *                        than generalized (every real block in this file matches
 *                        it; UNLOCATED beats invention for any other combination)
 * + stride*rowCount     plain row-major 8bpp chunky pixels, `stride =
 *                        header_byte0 * header_byte1 * 8` bytes per row (file
 *                        offset `0x25a2`-`0x25ad`), `rowCount` = header bytes 6-7
 *                        as a little-endian u16 (file offset `0x28e1`-`0x28e5`,
 *                        read from the SAME struct field the palette-loader wrote
 *                        it into at `0x25f9`, itself copied from raw block bytes
 *                        6-7 at `0x23cf`-`0x2405`)
 *
 * For `8X8D1.DAX`'s 12 real blocks (`header = 08 01 00 00 00 00 00 01 20 6f`):
 * `stride = 8*1*8 = 64`, `rowCount = 0x0100 = 256`, `paletteBase = 0x20 = 32`,
 * `numColors = 0x6f+1 = 112` — giving a 64×256 chunky image, and
 * `434 + 64*256 = 434 + 16384 = 16818` bytes exactly (the block's own known total,
 * zero slop). Rendered with the block's own embedded palette (indices 0..15, whose
 * real color is UNRESOLVED — see above — rendered black for inspection only) this
 * decoder produces a **visually coherent brick/stone wall texture** with horizontal
 * mortar-line banding, confirmed by eye across multiple blocks in
 * `renders/treasures_8x8d_probe/` (git-ignored, not committed).
 *
 * ## DGROUP identification (why `0x0c3e`, for anyone re-deriving this)
 *
 * 1. **Static**: two separate interrupt-handler code paths in `GAME.EXE` (a
 *    keyboard-ISR-shaped routine near file offset `0x9822` and a Ctrl-Break/critical-
 *    error-shaped routine near `0xa2b6`) both explicitly reload `DS` with the literal
 *    immediate `0x0c3e` right after saving the caller's registers — the standard
 *    "interrupt handlers can't trust the interrupted program's DS, so reload the
 *    resident program's own known-good DGROUP" idiom. Found by a whole-file regex
 *    scan for the `B8 xx xx 8E D8` (`mov ax,imm16; mov ds,ax`) byte pattern; the
 *    only OTHER hit, immediate `0x0040`, is the well-known BIOS-data-area segment
 *    (accessing the keyboard flags at `0040:0017`), not a DGROUP candidate.
 * 2. **Dynamic** (bounded Unicorn emulation, no DOSBox-X — this project's
 *    single-slot rule for that tool was respected): booting `GAME.EXE` under a
 *    from-scratch 16-bit real-mode DOS-loader shim (minimal `INT 21h`/`INT 10h`
 *    file-I/O + BIOS handlers, backed by the real retail files) and running past the
 *    Pascal RTL's own startup (`INT 21h AH=0x35` get-vector calls installing the
 *    Ctrl-Break/critical-error/divide-error hooks) shows `DS` settling to a STABLE
 *    value for 8,000,000+ consecutive instructions once the RTL init finishes.
 *    Converting that physical, load-address-dependent value back to the file's own
 *    "nominal" addressing convention (`nominal = physical_DS - IMAGE_SEG`, the same
 *    convention round 2 already validated for segments `0xa77`/`0x229`) gives
 *    exactly `0x0c3e` again — an independent method landing on the identical value.
 * Both facts point at nominal DGROUP segment `0x0c3e`; `DS:0xcf14` under that
 * segment (`file_offset = 512 + 0xc3e*16 + 0xcf14 = 0x194f4`) is indeed past this
 * `GAME.EXE`'s own EOF (`0x1195b`), confirming `LOOKUP_TABLE` is BSS (runtime-built),
 * matching the per-block reconstruction this module implements.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

const HEADER_LEN = 10;

/** `LOOKUP_TABLE[0..15] = 0..15` identity, then `numColors/2` bytes from right after
 * the embedded palette split into (high nibble, low nibble) written from `paletteBase`
 * onward. See the module doc — proven by static disassembly of `GAME.EXE`
 * `0x248b`-`0x2522`. Exposed for diagnostics; this format's own "mode 2" pixel path
 * (the only one `8X8D1.DAX`'s 12 blocks use) does not consult it.
 */
function buildLookupTable(
  raw: Uint8Array,
  paletteBase: number,
  numColors: number,
  seedStart: number,
): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 16; i++) table[i] = i;
  const seedCount = numColors >> 1;
  for (let i = 0; i < seedCount; i++) {
    const b = raw[seedStart + i]!;
    table[paletteBase + i * 2] = b >> 4;
    table[paletteBase + i * 2 + 1] = b & 0xf;
  }
  return table;
}

export interface Treasures8x8dTile {
  /** = header-derived `stride` (bytes per row = pixels per row, 8bpp chunky). */
  width: number;
  /** = header bytes 6-7 as a little-endian u16 ("row count"). */
  height: number;
  /** width*height raw byte values, row-major. In `[paletteBase, paletteBase+numColors)`
   * these are direct indices into `palette`; values `0..15` are real content (confirmed:
   * they render as the dark "mortar line" bands in every block) whose EXACT color is
   * UNRESOLVED — this format carries no palette entries for them (see module doc). */
  indices: Uint8Array;
  palette: Palette;
  paletteBase: number;
  numColors: number;
  /** The reconstructed DGROUP `LOOKUP_TABLE` — see module doc. Not used by this
   * decoder's own pixel path; kept for diagnostics/regression-pinning. */
  lookupTable: Uint8Array;
}

const scale6to8 = (v: number): number => Math.round((v * 255) / 63);

/**
 * Parse one already-decompressed DAX block as a Treasures `8X8D1.DAX`-family "mode 2"
 * wall-tile bank. Returns null on ANY shape mismatch — this is a strict,
 * self-verifying multi-constraint gate (stride must be sane, every embedded DAC byte
 * must be `<=63`, the byte budget must divide evenly by `stride`, and the derived row
 * count must exactly equal the header's own declared row count) so it can never
 * accidentally double-match an unrelated DAX block; same discipline as
 * `daxVga256Title.ts` / `daxVgaPicture.ts`.
 */
export function parseTreasures8x8dTile(raw: Uint8Array): Treasures8x8dTile | null {
  if (raw.byteLength < HEADER_LEN + 2) return null;

  const strideFactorA = raw[0]!;
  const strideFactorB = raw[1]!;
  const stride = strideFactorA * strideFactorB * 8;
  if (stride <= 0 || stride > raw.byteLength) return null;

  const rowCount = raw[6]! | (raw[7]! << 8);
  if (rowCount <= 0) return null;

  const paletteBase = raw[8]!;
  const numColors = raw[9]! + 1;
  if (numColors < 2 || numColors > 254 || paletteBase + numColors > 256) return null;

  const paletteStart = HEADER_LEN;
  const paletteBytes = numColors * 3;
  if (paletteStart + paletteBytes > raw.byteLength) return null;

  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < numColors; i++) {
    const o = paletteStart + i * 3;
    const r6 = raw[o]!;
    const g6 = raw[o + 1]!;
    const b6 = raw[o + 2]!;
    if (r6 > 63 || g6 > 63 || b6 > 63) return null; // not valid 6-bit DAC bytes
    colors[paletteBase + i] = { r: scale6to8(r6), g: scale6to8(g6), b: scale6to8(b6) };
  }

  const seedStart = paletteStart + paletteBytes;
  const seedLen = numColors >> 1;
  if (seedStart + seedLen > raw.byteLength) return null;
  const lookupTable = buildLookupTable(raw, paletteBase, numColors, seedStart);

  // 4-byte flag record (semantics unresolved, see module doc), then the hardcoded
  // extra 28-byte skip GAME.EXE only takes for paletteBase===0x20 && numColors===0x70
  // (file offset 0x2566-0x2575) — every real 8X8D1.DAX block matches this exactly;
  // reproduced as the same special case, not generalized past what's proven.
  let cursor = seedStart + seedLen + 4;
  if (paletteBase === 0x20 && numColors === 0x70) cursor += 0x1c;

  const remaining = raw.byteLength - cursor;
  if (remaining <= 0 || remaining % stride !== 0) return null;
  if (remaining / stride !== rowCount) return null;

  const indices = raw.slice(cursor, cursor + stride * rowCount);

  return {
    width: stride,
    height: rowCount,
    indices,
    palette: {
      colors,
      source: 'dax-8x8d-treasures-mode2',
      firstColor: paletteBase,
      count: numColors,
    },
    paletteBase,
    numColors,
    lookupTable,
  };
}

/** Decode a Treasures "mode 2" 8x8d tile bank straight to the neutral IndexedImage
 * model. `transparentIndex` is left `null` (opaque): this format's low-value (0..15)
 * pixels are real, non-transparent content (the mortar-line bands), not a
 * transparency key — see module doc. */
export function treasures8x8dTileToIndexedImage(tile: Treasures8x8dTile): IndexedImage {
  return {
    width: tile.width,
    height: tile.height,
    indices: tile.indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: tile.palette,
    encoding: 'dax-8x8d-treasures-mode2',
  };
}
