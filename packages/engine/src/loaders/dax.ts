/**
 * DAX loader — DOS Champions/Death Knights of Krynn EGA graphics container.
 *
 * Direct port of tools/dax_decode.py. Little-endian; signed-byte RLE; chunky
 * 4bpp (2 px/byte, HIGH nibble = left pixel); fixed EGA-16 palette (no palette
 * stored in the file). See docs/dax-format.md and docs/web-engine/loaders.md.
 *
 * Output is the engine-neutral model (IndexedImage / FrameSet). PIC/BODY/SPRIT multi-frame
 * pictures are decoded by `parseAnimatedPicture` (including PIC/BODY XOR deltas); only genuinely
 * unknown residual variants are classified as `complex` and skipped.
 */
import type { AssetKind, FrameSet, IndexedImage } from '../model/index.js';
import { ByteReader } from '../util/ByteReader.js';
import { signedByteRLE } from '../util/rle.js';
import { makeEgaPalette } from '../render/palette.js';
import {
  parseVgaExtendedPicture,
  vgaExtendedPictureToIndexedImage,
  parseGatewayPicPlanar5,
  gatewayPicPlanar5ToIndexedImage,
  gatewayPicMultiFrameToIndexedImages,
  parseGatewayPicStructureRecord,
  type GatewayPicStructureRecord,
} from './daxVgaPicture.js';
import { parseVga256Title, vga256TitleToIndexedImage } from './daxVga256Title.js';
import {
  parseTreasures8x8dTile,
  treasures8x8dTileToIndexedImage,
} from './daxTreasures8x8dTile.js';
import { parseVgaChunkyItems, vgaChunkyItemsToImages } from './daxVgaChunkyItems.js';
import {
  parseVgaCompressedPicture,
  vgaCompressedPictureToIndexedImages,
} from './daxVgaCompressedPicture.js';
import {
  parseVgaPaletteRecord,
  vgaPaletteRecordToSwatchImage,
} from './daxVgaPaletteRecord.js';
import { makeBitmapFont } from '../render/textmode.js';
import { COK_FONT_BLOCK, fontSheetImage } from './cokFont.js';

const ENTRY_SIZE = 9;

/** A DAX table-of-contents entry (9 bytes LE). */
export interface DaxBlock {
  /** Positional index in the TOC (0..n-1). */
  index: number;
  /** Sparse block id from the file (NOT 0..n-1). */
  blockId: number;
  /** Offset relative to the data section base. */
  dataOffset: number;
  /** Decompressed size in bytes. */
  rawSize: number;
  /** Compressed size in bytes. */
  compSize: number;
  /** Decompressed bytes (filled when decoded). */
  raw: Uint8Array;
  /**
   * Classification after decompression:
   *  - 'frame'      standard rectangular frame (decoded to an IndexedImage)
   *  - 'tile-strip' 8x8 dungeon-tile strip (decoded to a 16-px-wide IndexedImage)
   *  - 'animated'   multi-frame chunky-4bpp picture (SPRIT/PIC/portraits — see frames)
   *  - 'tileset'    fixed-size multi-item tile array (DUNGCOM/WILDCOM combat backdrops — see frames)
   *  - 'vga-ext-frame' Gateway/Treasures-family single-frame VGA-extended picture (see daxVgaPicture.ts)
   *  - 'vga256-title' Treasures/Pools-family chunky VGA256 title picture (see daxVga256Title.ts)
   *  - '8x8d-treasures-mode2' Treasures `8X8D1.DAX`-family "mode 2" wall-tile bank
   *    (see daxTreasures8x8dTile.ts)
   *  - 'vga-chunky-items' Treasures/Pools embedded-palette 8-bit item arrays
   *  - 'vga-compressed-picture' Treasures/Pools DRAW18-compressed VGA portraits
   *  - 'gateway-pic-planar5' Gateway `PIC*.DAX` single-frame 5-bitplane picture — solved
   *    2026-07-22 via the captured-loader-buffer oracle (see daxVgaPicture.ts)
   *  - 'gateway-pic-multiframe' Gateway `PIC*.DAX` multi-frame XOR-delta animation
   *    (`PIC.DAX` id 29) — solved 2026-07-23 (research doc Part 18): frame 0 planar5 +
   *    full planar5 XOR-delta tail frames under 14-byte headers; decoded, all frames kept
   *  - 'gateway-structure-record' Gateway `COMSPR.DAX` ids 254/255 — pixel-less planar5
   *    structure record (zero geometry + Part 18 component stream), resolved 2026-07-23
   *    (research doc Part 19): VGA-mode-only color/structure setup applied to the
   *    exploration and 3D-view screens; no image BY DESIGN (see `structure`)
   *  - 'vga-palette-record' Late-Gen1 palette-only record — 223-colour 6-bit-DAC palette at
   *    base 0x20, zero width/height, NO pixel data (see `daxVgaPaletteRecord.ts`). Exactly 16
   *    corpus hits, all in Treasures of the Savage Frontier: `OVER.DAX` ids 1-4, `PIC1.DAX` ids
   *    38/47/48/57/68/70, `PIC1A.DAX` ids 78/81/89/90/100/119 — the twelve PIC ids are the same
   *    "still do not decode" blocks the 25th handoff entry disclosed. `image` is a synthetic
   *    16x14 swatch of the decoded palette, NOT a picture the game ever drew; `frames` is empty
   *    by design (there is nothing to animate).
   *  - 'font'       Gen1 (CoK/DoK/Buck Rogers-family) monochrome 8×8 text font bank —
   *    `8X8D*.DAX` block id 201 (`COK_FONT_BLOCK`), a flat array of 8-byte 1bpp glyphs with
   *    no frame/tile-strip/tileset header at all (see `loaders/cokFont.ts`). `image` is a
   *    128×32 sheet of the 64 folded/addressable slots (`fontSheetImage`); `frames` holds
   *    those same 64 glyphs individually, in fold/slot order. Scoped to exactly
   *    `blockId === 201` on an `8X8D*` stem, decompressed length a multiple of 8 and at
   *    least 64 glyphs, AFTER every other parse above has declined — measured 2026-09-02
   *    (`gen1Font.test.ts`'s corpus sweep, over EVERY `8X8D*.DAX`, not just `8X8D1.DAX`):
   *    every one of the nine DOS Gen1/late-Gen1 titles we hold carries a block-201 font —
   *    CoK, DoK, Curse of the Azure Bonds, Gateway to the Savage Frontier and Pool of
   *    Radiance in their own `8X8D1.DAX` (1416 bytes = 177 glyphs); Pools of Darkness and
   *    Treasures of the Savage Frontier in `8X8D0.DAX`; Secret of the Silver Blades in
   *    `8X8D5.DAX`; Buck Rogers: Countdown to Doomsday in `8X8D1.DAX` (2048 bytes = 256
   *    glyphs, 70 populated). NOT added to `frameSet.frames` (the cross-platform GraphicSet
   *    `tile8x8` category) — a text sheet is not a dungeon tile; see the code comment above
   *    this arm in `decodeDax`.
   *  - 'complex'    still-unsolved variant (SKIPPED, no image)
   */
  kind:
    | 'frame'
    | 'tile-strip'
    | 'animated'
    | 'tileset'
    | 'vga-ext-frame'
    | 'vga256-title'
    | '8x8d-treasures-mode2'
    | 'vga-chunky-items'
    | 'vga-compressed-picture'
    | 'vga-palette-record'
    | 'gateway-pic-planar5'
    | 'gateway-pic-multiframe'
    | 'gateway-structure-record'
    | 'font'
    | 'complex';
  /** Decoded image (frame 0 for 'animated'; null for 'complex'). */
  image: IndexedImage | null;
  /** All frames for 'animated' blocks (length ≥ 1); absent otherwise. */
  frames?: IndexedImage[];
  /** Parsed components for 'gateway-structure-record' blocks; absent otherwise. */
  structure?: GatewayPicStructureRecord;
}

export interface DaxArchive {
  /** Source filename stem if known (e.g. "BIGPIC1"); '' otherwise. */
  name: string;
  /** data_base = 2 + toc_bytes. */
  dataBase: number;
  /** All TOC blocks in file order, classified and (where solved) decoded. */
  blocks: DaxBlock[];
  /** Convenience: standard + tile-strip images keyed by sparse blockId. */
  frameSet: FrameSet;
}

/** Cheap shape check: little-endian word0 is a nonzero multiple of 9. */
export function sniffDax(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 2) return false;
  const word0 = bytes[0] | (bytes[1] << 8);
  return word0 !== 0 && word0 % ENTRY_SIZE === 0;
}

/** Parse the container header + TOC. Throws ValueError-equivalent on non-DAX. */
function parseContainer(r: ByteReader): { dataBase: number; blocks: DaxBlock[] } {
  if (r.length < 2) throw new Error('DAX: file too small');
  const tocBytes = r.u16At(0, true);
  if (tocBytes === 0 || tocBytes % ENTRY_SIZE !== 0) {
    throw new Error(
      `DAX: word0=${tocBytes} is not a multiple of ${ENTRY_SIZE}; not a DAX graphics container?`,
    );
  }
  const n = tocBytes / ENTRY_SIZE;
  const dataBase = 2 + tocBytes;
  const blocks: DaxBlock[] = [];
  for (let i = 0; i < n; i++) {
    const off = 2 + i * ENTRY_SIZE;
    const blockId = r.u8At(off);
    const dataOffset = r.u32At(off + 1, true);
    const rawSize = r.u16At(off + 5, true);
    const compSize = r.u16At(off + 7, true);
    blocks.push({
      index: i,
      blockId,
      dataOffset,
      rawSize,
      compSize,
      raw: new Uint8Array(0),
      kind: 'complex',
      image: null,
    });
  }
  return { dataBase, blocks };
}

/**
 * The DAX block header is **17 bytes**, confirmed by the COAB clean-room decompile
 * (`coab_extracted/Classes/DaxFiles/DaxBlock.cs`):
 *
 *   off 0  u16 height
 *   off 2  u16 width_div8
 *   off 4  u16 x_pos
 *   off 6  u16 y_pos
 *   off 8  u8  item_count   (1 for a single-frame picture; ≥2 for a tile array)
 *   off 9  u8[8] field_9    (EGA-plane / editor metadata; ignored for render)
 *   off 17 pixels           (item_count × height·width_div8·4 chunky-4bpp bytes)
 *
 * This is the SAME header `parseTileSet` already documents; a "standard frame" is just the
 * `item_count === 1` case. The pixel data starts at byte **17**, not 8 — an earlier 8-byte
 * assumption read every frame 9 bytes early, cyclically rolling it right by 18 px (the rightmost
 * 18 columns wrapped onto the left margin — visible on full-screen BIGPIC scenes and badly
 * garbling 24-wide portraits). Verified across every CoK/DoK graphics DAX: all 734 single-frame
 * blocks have `item_count == 1` and `17 + width·height/2 === rawSize` exactly (0 trailing bytes),
 * and the corrected BIGPIC render is byte-aligned with the Amiga DAA decode of the same scene.
 */
const FRAME_HEADER = 17;

/**
 * Standard rectangular frame (the `item_count === 1` case of the unified DAX block): nonzero
 * width_div8 and height, with the pixel data filling exactly `17 + width·height/2` bytes (a small
 * trailing pad is tolerated). Returns geometry or null. Multi-item blocks (`item_count ≥ 2`) fall
 * through to {@link parseTileSet}; the SPRIT/PIC sub-frame variant (`width_div8 === 0`) to
 * {@link parseAnimatedPicture}.
 */
function parseStandardFrame(
  raw: Uint8Array,
): { width: number; height: number; xOff: number; yOff: number } | null {
  if (raw.byteLength < FRAME_HEADER) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = dv.getUint16(0, true);
  const widthDiv8 = dv.getUint16(2, true);
  const yOff = dv.getUint16(4, true);
  const xOff = dv.getUint16(6, true);
  const itemCount = raw[8];
  if (widthDiv8 === 0 || height === 0) return null;
  if (itemCount !== 1) return null; // ≥2 → tile array (parseTileSet); 0 → not a picture
  const width = widthDiv8 * 8;
  const need = Math.floor((width * height) / 2); // bytes of pixel data (2 px/byte)
  const payload = raw.byteLength - FRAME_HEADER;
  if (payload < need || payload - need > 16) return null;
  if (width > 4096 || height > 2048) return null;
  return { width, height, xOff, yOff };
}

/**
 * 8x8 dungeon-tile strip: header {height=8, width_div8=1}; payload is a tall
 * 16-px-wide vertical strip (two 8x8 tiles per row). Returns geometry+headerLen
 * or null. ASSUMED layout (renders coherently), per dax-format.md §4b.
 */
function parseTileStrip(
  raw: Uint8Array,
): { width: number; height: number; headerLen: number } | null {
  if (raw.byteLength < 8) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const h0 = dv.getUint16(0, true);
  const h1 = dv.getUint16(2, true);
  if (h0 !== 8 || h1 !== 1) return null;
  const payload = raw.byteLength - 8;
  if (payload < 8) return null;
  const width = 16;
  const height = Math.floor(payload / 8); // 8 bytes per 16-px row (2 px/byte)
  if (height === 0) return null;
  return { width, height, headerLen: 8 };
}

/**
 * Expand chunky-4bpp pixels (2 px/byte, HIGH nibble = left) into a flat
 * Uint8Array of palette indices, row-major. Mirrors frame_to_rgb's pixel walk
 * (out-of-range reads yield index 0, as in the Python).
 */
function expandIndices(
  raw: Uint8Array,
  width: number,
  height: number,
  headerLen: number,
): Uint8Array {
  const rowBytes = width / 2;
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const base = y * rowBytes;
    for (let xb = 0; xb < rowBytes; xb++) {
      const srcI = headerLen + base + xb;
      const byte = srcI < raw.byteLength ? raw[srcI] : 0;
      const o = y * width + 2 * xb;
      indices[o] = byte >> 4; // high nibble = left pixel
      indices[o + 1] = byte & 0x0f;
    }
  }
  return indices;
}

/**
 * Detect and undo a horizontal cyclic ROLL in a full-screen frame.
 *
 * A few SSI title screens are stored shifted sideways — the rightmost columns wrap onto the left
 * margin — and the original engine un-rolled them on display (e.g. CoK `TITLE.DAX` block 1, the
 * "Strategic Simulations, Inc." boot screen, is rolled +13 px: its ® marks land in the left
 * margin). The decompressed bytes are correct (byte-identical to `DaxDump.exe`); only the on-screen
 * framing is shifted, so the correction belongs here in the renderer, not the container decoder.
 *
 * We recover the shift purely from the pixels: a correctly-framed full-screen image has a uniform
 * background border, so its left and right border columns match. We find the cyclic de-roll `k` that
 * makes those border columns **pixel-identical** (row-for-row). If the borders are clearly torn at
 * the stored offset (`k=0`) but become essentially clean at some small `k>0`, the frame is rolled by
 * `k` and we shift every row left by `k` in place. The test is deliberately strict (torn → clean),
 * so full-bleed art with no border, and already-correct frames, are never touched — validated to
 * fire on exactly one frame across every CoK DAX frame. See `docs/dax-format.md`.
 */
function derollFrameIndices(indices: Uint8Array, width: number, height: number): void {
  if (width < 64 || height < 64) return; // full-screen frames only
  const lim = Math.min(40, width >> 2);
  // missAt(k): rows whose displayed left/right border columns differ after a left cyclic shift of k
  // (matches np.roll(img, -k): displayed col j = stored col (j+k) mod width).
  const missAt = (k: number): number => {
    let miss = 0;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      if (indices[row + ((0 + k) % width)] !== indices[row + ((width - 1 + k) % width)]) miss++;
    }
    return miss;
  };
  const miss0 = missAt(0);
  let bestK = 0;
  let bestMiss = miss0;
  for (let k = 1; k <= lim; k++) {
    const m = missAt(k);
    if (m < bestMiss) {
      bestMiss = m;
      bestK = k;
    }
  }
  const rolled =
    bestK > 0 &&
    bestMiss <= 2 && // borders essentially identical after the shift
    miss0 >= Math.max(8, Math.floor(height * 0.1)) && // clearly torn at the stored offset
    miss0 >= 8 * Math.max(1, bestMiss); // and the shift is a dramatic improvement
  if (!rolled) return;
  const tmp = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let j = 0; j < width; j++) tmp[j] = indices[row + ((j + bestK) % width)];
    indices.set(tmp, row);
  }
}

const ANIM_FRAME_HEADER = 21;

/**
 * Animated multi-frame picture (SPRIT, PIC, portraits) — the larger half of the former
 * "complex" variant, per docs/engine/research/dax-complex-subframe.md §B. Layout after RLE:
 * `u8 numFrames`, then per frame a 21-byte record {u32 delay, u16 height, u16 width/8,
 * u16 x, u16 y(+1 pad), u8[8] field} followed by height·(width/8)·4 chunky-4bpp pixel
 * bytes. A correct parse consumes the block EXACTLY — used here as the accept check.
 *
 * `xorDelta` (PIC/portrait animations): every frame after 0 stores its pixels XORed
 * against frame 0 (mouth/eyes delta). SPRIT monster frames are verbatim view-sizes (no
 * XOR). Returns the decoded frames, or null if the bytes don't fit this format.
 */
function parseAnimatedPicture(
  raw: Uint8Array,
  egaPalette: ReturnType<typeof makeEgaPalette>,
  xorDelta: boolean,
  transparentIndex: number | null,
): IndexedImage[] | null {
  if (raw.byteLength < 1 + ANIM_FRAME_HEADER) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const numFrames = raw[0];
  if (numFrames === 0 || numFrames > 64) return null;

  // First pass: read headers + locate pixel regions, validating bounds and exact consume.
  interface FrameSpec {
    width: number;
    height: number;
    xOff: number;
    yOff: number;
    pixOffset: number;
    pixBytes: number;
  }
  const specs: FrameSpec[] = [];
  let pos = 1;
  for (let f = 0; f < numFrames; f++) {
    if (pos + ANIM_FRAME_HEADER > raw.byteLength) return null;
    const height = dv.getUint16(pos + 4, true);
    const width8 = dv.getUint16(pos + 6, true);
    const xOff = dv.getUint16(pos + 8, true);
    const yOff = dv.getUint16(pos + 10, true);
    if (width8 === 0 || height === 0 || width8 > 64 || height > 256) return null;
    const width = width8 * 8;
    const pixBytes = height * width8 * 4; // = width*height/2 (2 px/byte)
    const pixOffset = pos + ANIM_FRAME_HEADER;
    if (pixOffset + pixBytes > raw.byteLength) return null;
    specs.push({ width, height, xOff, yOff, pixOffset, pixBytes });
    pos = pixOffset + pixBytes;
  }
  // Exact-consume checksum (allow ≤1 trailing pad byte).
  if (pos !== raw.byteLength && raw.byteLength - pos > 1) return null;

  const frame0 = raw.subarray(specs[0].pixOffset, specs[0].pixOffset + specs[0].pixBytes);
  const images: IndexedImage[] = [];
  for (let f = 0; f < specs.length; f++) {
    const s = specs[f];
    let pixels = raw.subarray(s.pixOffset, s.pixOffset + s.pixBytes);
    if (xorDelta && f > 0 && s.pixBytes === frame0.byteLength) {
      const delta = new Uint8Array(s.pixBytes);
      for (let i = 0; i < s.pixBytes; i++) delta[i] = pixels[i] ^ frame0[i];
      pixels = delta;
    }
    images.push({
      width: s.width,
      height: s.height,
      indices: expandIndices(pixels, s.width, s.height, 0),
      xOffset: s.xOff,
      yOffset: s.yOff,
      transparentIndex,
      palette: egaPalette,
      encoding: 'dax-animated',
    });
  }
  return images;
}

const TILESET_HEADER = 17;

/** Bytes per glyph in the Gen1 8×8 monochrome font bank (8 rows × 1 byte, 1bpp). */
const GEN1_FONT_GLYPH_BYTES = 8;
/** Number of folded/addressable slots (`cokGlyphSlot`'s range) in the Gen1 font. */
const GEN1_FONT_SLOTS = 64;

/**
 * One 8×8 1bpp glyph of the Gen1 font bank as a standalone {@link IndexedImage}: MSB = leftmost
 * pixel, set bits paint EGA index 15 (white), clear bits EGA index 0 (black), opaque.
 */
function gen1FontGlyphImage(
  raw: Uint8Array,
  slot: number,
  egaPalette: ReturnType<typeof makeEgaPalette>,
): IndexedImage {
  const width = 8;
  const height = 8;
  const indices = new Uint8Array(width * height);
  const base = slot * GEN1_FONT_GLYPH_BYTES;
  for (let gy = 0; gy < height; gy++) {
    const byte = raw[base + gy] ?? 0;
    for (let gx = 0; gx < width; gx++) {
      const on = ((byte >> (7 - gx)) & 1) === 1;
      indices[gy * width + gx] = on ? 15 : 0;
    }
  }
  return {
    width,
    height,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: egaPalette,
    encoding: 'gen1-font-glyph',
  };
}

/**
 * Fixed-size multi-item tile array — the former "complex" DUNGCOM block, solved via
 * the COAB DaxBlock loader (`coab_extracted/Classes/DaxFiles/DaxBlock.cs`) and
 * cross-confirmed by Codex + coherent renders. Two CoK users:
 *   - DUNGCOM/WILDCOM/RANDCOM: 25 opaque 24×24 combat-backdrop tiles.
 *   - 8X8D1/2/3: 38–70 magenta-keyed 8×8 UI/decoration tiles (arrows, gauges, orbs,
 *     dungeon decoration). These were previously mis-read by the 8-byte-header
 *     tile-strip path (a 9-byte/18-px shift); the 17-byte header is correct.
 * Layout after RLE:
 *
 *   off 0  u16 height        (px)
 *   off 2  u16 width_div8    (×8 = px)
 *   off 4  u16 x_pos
 *   off 6  u16 y_pos
 *   off 8  u8  item_count    number of tiles, all the SAME size
 *   off 9  u8[8] field_9     (EGA-plane/editor metadata; ignored for render)
 *   off 17 pixels            item_count × (height·width_div8·4) chunky-4bpp bytes
 *
 * Distinguished from a standard single frame (8-byte header, pixels at 8) by the
 * 17-byte header + an EXACT consume check: 17 + count·tileBytes === rawSize. That
 * exact-fit requirement is the accept gate, so it never false-positives on the
 * frame/tile-strip/animated paths (all tried first). For DUNGCOM: 24×24, 25 tiles,
 * 17 + 25·288 = 7217 ✓. Returns the decoded tiles or null.
 */
function parseTileSet(
  raw: Uint8Array,
  egaPalette: ReturnType<typeof makeEgaPalette>,
  transparentIndex: number | null,
): IndexedImage[] | null {
  if (raw.byteLength < TILESET_HEADER) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = dv.getUint16(0, true);
  const widthDiv8 = dv.getUint16(2, true);
  const yOff = dv.getUint16(4, true);
  const xOff = dv.getUint16(6, true);
  const count = raw[8];
  if (height === 0 || widthDiv8 === 0 || count < 2) return null;
  if (height > 256 || widthDiv8 > 64) return null;
  const width = widthDiv8 * 8;
  const tileBytes = height * widthDiv8 * 4; // = width*height/2 (2 px/byte)
  // Exact consume: header + count whole tiles must equal the decompressed size.
  if (TILESET_HEADER + count * tileBytes !== raw.byteLength) return null;

  const images: IndexedImage[] = [];
  for (let i = 0; i < count; i++) {
    const off = TILESET_HEADER + i * tileBytes;
    images.push({
      width,
      height,
      indices: expandIndices(raw, width, height, off),
      xOffset: xOff,
      yOffset: yOff,
      transparentIndex,
      palette: egaPalette,
      encoding: 'dax-tileset',
    });
  }
  return images;
}

/** One decompressed DAX block, format-agnostic (graphics OR data: ECL/GEO/MON/…). */
export interface DaxDataBlock {
  /** Sparse block id from the TOC. */
  blockId: number;
  /** Position in the TOC (file order). */
  index: number;
  /** Decompressed bytes (length === TOC rawSize). */
  raw: Uint8Array;
}

/**
 * Read + decompress every block of a DAX container WITHOUT graphics interpretation.
 * This is the shared foundation for the non-graphics decoders (ECL bytecode, GEO maps,
 * MON/ITEM tables) which need the raw decompressed payload, not an IndexedImage.
 */
export function readDaxDataBlocks(bytes: Uint8Array): DaxDataBlock[] {
  const r = new ByteReader(bytes);
  const { dataBase, blocks } = parseContainer(r);
  return blocks.map((blk) => {
    const comp = r.sliceAt(dataBase + blk.dataOffset, blk.compSize);
    return { blockId: blk.blockId, index: blk.index, raw: signedByteRLE(comp, blk.rawSize) };
  });
}

/**
 * Decode a DAX container to the neutral model. Each block is decompressed and
 * classified; standard frames and tile strips become IndexedImages, complex
 * blocks are kept in the listing with `kind:'complex'` / `image:null`.
 */
export function decodeDax(bytes: Uint8Array, name = ''): DaxArchive {
  const r = new ByteReader(bytes);
  const { dataBase, blocks } = parseContainer(r);
  const egaPalette = makeEgaPalette();

  const frameSet: FrameSet = {
    name,
    frames: new Map<number, IndexedImage>(),
    kind: kindFromName(name),
  };

  // Role from the filename stem (drives animated-picture handling): PIC*/BODY* portraits
  // use XOR-delta frames; SPRIT* monster sprites are verbatim view-sizes with a magenta
  // (index 13) mask. See docs/engine/research/dax-complex-subframe.md §B.
  const stem = name.toUpperCase();
  const isPic = stem.startsWith('PIC') || stem.startsWith('BODY') || stem.startsWith('CBODY');
  const isSprite = stem.startsWith('SPRIT');
  const animXor = isPic;
  const animTransparent = isSprite ? 13 : null;
  // 8X8D* small-tile sets (UI elements, dungeon decoration glyphs) are magenta-keyed
  // (EGA index 13) and composite over a background; DUNGCOM/WILDCOM backdrops are opaque.
  const tilesetTransparent = stem.startsWith('8X8D') ? 13 : null;

  for (const blk of blocks) {
    const start = dataBase + blk.dataOffset;
    const comp = r.sliceAt(start, blk.compSize);
    blk.raw = signedByteRLE(comp, blk.rawSize);

    const fr = parseStandardFrame(blk.raw);
    if (fr) {
      const indices = expandIndices(blk.raw, fr.width, fr.height, FRAME_HEADER);
      derollFrameIndices(indices, fr.width, fr.height); // undo SSI title-screen horizontal roll
      blk.kind = 'frame';
      blk.image = {
        width: fr.width,
        height: fr.height,
        indices,
        xOffset: fr.xOff,
        yOffset: fr.yOff,
        transparentIndex: null,
        palette: egaPalette,
        encoding: 'dax-frame',
      };
      frameSet.frames.set(blk.blockId, blk.image);
      continue;
    }

    // Gateway VGA-extended single-frame picture (5-bit/32-colour, 33-byte prefix followed by
    // five per-row bitplanes — see daxVgaPicture.ts). A strict exact-byte-count gate, so
    // it never double-matches a plain EGA frame (proven negative control: CoK/DoK never hit this).
    const vgaPic = parseVgaExtendedPicture(blk.raw);
    if (vgaPic) {
      blk.kind = 'vga-ext-frame';
      blk.image = vgaExtendedPictureToIndexedImage(vgaPic);
      derollFrameIndices(blk.image.indices, vgaPic.width, vgaPic.height);
      frameSet.frames.set(blk.blockId, blk.image);
      continue;
    }

    // Treasures/Pools-family chunky VGA256 title picture (full embedded 256-colour
    // palette, plain row-major 8bpp pixels — see daxVga256Title.ts). Strict exact-byte-
    // count + in-range-DAC-byte gate, so it never double-matches a plain EGA frame or
    // Gateway's own vga-ext-frame (different byte counts: 64910 vs Gateway's 40050).
    const vga256Pic = parseVga256Title(blk.raw);
    if (vga256Pic) {
      blk.kind = 'vga256-title';
      blk.image = vga256TitleToIndexedImage(vga256Pic);
      frameSet.frames.set(blk.blockId, blk.image);
      continue;
    }

    // Treasures `8X8D1.DAX`-family "mode 2" wall-tile bank (embedded partial VGA
    // palette + plain 8bpp chunky pixels — see daxTreasures8x8dTile.ts). Restricted
    // to 8X8D*-stem files: its own gates (stride sanity, in-range DAC bytes, exact
    // row-count self-check) are already strict, but this format was reverse-engineered
    // from ONE title's ONE file family, so keep it filename-scoped rather than risk a
    // false-positive match against an unrelated game's block shape.
    if (stem.startsWith('8X8D')) {
      const tile = parseTreasures8x8dTile(blk.raw);
      if (tile) {
        blk.kind = '8x8d-treasures-mode2';
        blk.image = treasures8x8dTileToIndexedImage(tile);
        frameSet.frames.set(blk.blockId, blk.image);
        continue;
      }
    }

    // Late-Gen1 palette-only record (Treasures `PIC1`/`PIC1A`/`OVER.DAX` — see
    // daxVgaPaletteRecord.ts). Zero width/height, no pixel data: a strict exact-length gate on
    // `paletteBase === 0x20` plus the header+palette+tail byte count, so it cannot double-match
    // a real picture (which always has nonzero width/height) or the general chunky-items reading
    // below (whose own header requires nonzero height/width8 too). Runs before that general
    // reading and before the PIC/SPRIT vga-compressed-picture branch so this narrower, exact
    // shape wins first; the corpus sweep in vgaPaletteRecord.test.ts proves neither ever
    // contends for the same 16 blocks in practice.
    const paletteRecord = parseVgaPaletteRecord(blk.raw);
    if (paletteRecord) {
      blk.kind = 'vga-palette-record';
      blk.image = vgaPaletteRecordToSwatchImage(paletteRecord);
      blk.frames = [];
      frameSet.frames.set(blk.blockId, blk.image);
      continue;
    }

    // General late-Gen1 embedded-palette item arrays. This intentionally follows the
    // specialized 8X8D1 mode-2 classifier so its established combined-bank API remains stable.
    // The exact-consume and valid-DAC gates make this safe for UI, backdrop, BIGPIC, DUNGCOM,
    // and CPIC archives while unrelated EGA resources fall through unchanged.
    const chunkyItems = parseVgaChunkyItems(blk.raw);
    if (chunkyItems) {
      blk.kind = 'vga-chunky-items';
      blk.frames = vgaChunkyItemsToImages(chunkyItems);
      blk.image = blk.frames[0]!;
      frameSet.frames.set(blk.blockId, blk.image);
      continue;
    }

    // Late-Gen1 PIC portraits and SPRIT monsters: embedded DAC range + lookup seeds + one flat
    // DRAW18 stream per declared frame. Exact byte consumption and exact expanded geometry are
    // both required, so this cannot accidentally claim the older EGA animated format or Gateway's
    // planar5 PIC family. SPRIT joined this path on 2026-08-26: the blocks were always this
    // format, but the loader read their `frameCount - 1` word as a required zero and rejected
    // all 77 of them across Buck Rogers, Pools of Darkness and Treasures.
    if (stem.startsWith('PIC') || stem.startsWith('SPRIT')) {
      const compressedPicture = parseVgaCompressedPicture(blk.raw);
      if (compressedPicture) {
        blk.kind = 'vga-compressed-picture';
        blk.frames = vgaCompressedPictureToIndexedImages(compressedPicture);
        blk.image = blk.frames[0]!;
        frameSet.frames.set(blk.blockId, blk.image);
        continue;
      }
    }

    // Gateway `PIC*.DAX` single-frame 5-bitplane picture (solved 2026-07-22 via the
    // captured-loader-buffer oracle — see daxVgaPicture.ts). Filename-scoped to PIC*
    // stems like the Treasures 8X8D path: the format was proven from ONE title's PIC
    // family only, and its own gates (category byte 0x0c/0x0e/0x0f at raw[14] + exact
    // zero-slop byte formula) do the real work — CoK/DoK's own PIC*.DAX never match
    // (proven negative control in the tests; they fall through to 'animated' below).
    // Runs BEFORE parseAnimatedPicture: the two accept conditions are mutually
    // exclusive on the same geometry (4 vs 5+prefix bytes/row), so order is safety
    // margin, not a tiebreak.
    if (stem.startsWith('PIC')) {
      const gwPic = parseGatewayPicPlanar5(blk.raw);
      if (gwPic) {
        if (gwPic.outcome === 'single-frame') {
          blk.kind = 'gateway-pic-planar5';
          blk.image = gatewayPicPlanar5ToIndexedImage(gwPic.picture);
          frameSet.frames.set(blk.blockId, blk.image);
        } else {
          // Multi-frame XOR-delta animation (solved Part 18): tail frames are full
          // planar5 XOR deltas against frame 0 under a 14-byte header. Decoded like
          // the plain-EGA 'animated' path: frame 0 as the block image, all frames kept.
          blk.kind = 'gateway-pic-multiframe';
          blk.frames = gatewayPicMultiFrameToIndexedImages(gwPic.multi);
          blk.image = blk.frames[0];
          frameSet.frames.set(blk.blockId, blk.image);
        }
        continue;
      }
    }

    // Multi-frame chunky-4bpp picture (SPRIT/PIC/portraits).
    const anim = parseAnimatedPicture(blk.raw, egaPalette, animXor, animTransparent);
    if (anim) {
      blk.kind = 'animated';
      blk.frames = anim;
      blk.image = anim[0];
      frameSet.frames.set(blk.blockId, anim[0]);
      continue;
    }

    // Fixed-size multi-item tile array (DUNGCOM/WILDCOM combat backdrops; 8X8D UI/decoration
    // tiles). Strict exact-consume gate, so it runs before the loose tile-strip fallback.
    const tiles = parseTileSet(blk.raw, egaPalette, tilesetTransparent);
    if (tiles) {
      blk.kind = 'tileset';
      blk.frames = tiles;
      blk.image = tiles[0];
      frameSet.frames.set(blk.blockId, tiles[0]);
      continue;
    }

    // Loose 8x8 dungeon-tile strip fallback ({8,1} header that does NOT exact-fit the
    // tile array above). Kept for any non-8X8D {8,1} block in other games.
    const strip = parseTileStrip(blk.raw);
    if (strip) {
      const indices = expandIndices(blk.raw, strip.width, strip.height, strip.headerLen);
      blk.kind = 'tile-strip';
      blk.image = {
        width: strip.width,
        height: strip.height,
        indices,
        xOffset: 0,
        yOffset: 0,
        transparentIndex: null,
        palette: egaPalette,
        encoding: 'dax-tile-strip',
      };
      frameSet.frames.set(blk.blockId, blk.image);
      continue;
    }

    // Pixel-less planar5 structure record (Gateway COMSPR.DAX ids 254/255 — the former
    // "COMSPR mini-records" open case, resolved 2026-07-23, research doc Part 19):
    // zero geometry + 0x01 + category + Part 18 component stream, no pixels by design.
    // Strict exact-length gate; across all nine installed titles' DAX corpora only
    // these two Gateway blocks match.
    const structure = parseGatewayPicStructureRecord(blk.raw);
    if (structure) {
      blk.kind = 'gateway-structure-record';
      blk.structure = structure;
      blk.image = null;
      continue;
    }

    // Gen1 (CoK/DoK/Buck Rogers-family) monochrome 8×8 text font bank: `8X8D*.DAX` block id
    // 201 (COK_FONT_BLOCK), the SAME flat 8-byte-per-glyph layout `cokFont.ts` already reads
    // for CoK/DoK — no frame/tile-strip/tileset header, so it only reaches here once every
    // header-based parse above has declined. Scoped to exactly `blockId === COK_FONT_BLOCK`
    // on an 8X8D*-stem file (never 202/203, the sibling UI-tile blocks in the SAME file) with
    // a decompressed length that is a whole number of 8-byte glyphs and covers all 64
    // addressable fold slots — measured 2026-09-02 across every `8X8D*.DAX` in the corpus
    // (not just `8X8D1.DAX`; see `gen1Font.test.ts`'s corpus sweep): every one of the nine
    // DOS Gen1/late-Gen1 titles we hold carries a block-201 font somewhere — CoK, DoK, Curse
    // of the Azure Bonds, Gateway to the Savage Frontier and Pool of Radiance in their own
    // `8X8D1.DAX` (1416 bytes = 177 glyphs); Pools of Darkness and Treasures of the Savage
    // Frontier in `8X8D0.DAX`; Secret of the Silver Blades in `8X8D5.DAX`; and Buck Rogers:
    // Countdown to Doomsday in `8X8D1.DAX` (2048 bytes = 256 glyphs). None is missing one.
    //
    // Deliberately NOT added to `frameSet.frames`: that map feeds the cross-platform
    // GraphicSet `tile8x8` category (positional DOS/Amiga parity — see
    // `graphicSetInDungeon.test.ts`), and a text-glyph sheet is not a dungeon wall/floor tile;
    // inserting it there shifted "index 0" of that category and broke the DOS/Amiga pixel
    // parity assertion for an unrelated block. `main.ts`'s generic per-block DAX viewer reads
    // `image`/`frames` straight off `DaxBlock`, not off `frameSet`, so this block still
    // surfaces there without needing `frameSet.frames.set`.
    if (
      stem.startsWith('8X8D') &&
      blk.blockId === COK_FONT_BLOCK &&
      blk.raw.byteLength % GEN1_FONT_GLYPH_BYTES === 0 &&
      blk.raw.byteLength >= GEN1_FONT_GLYPH_BYTES * GEN1_FONT_SLOTS
    ) {
      const glyphCount = Math.floor(blk.raw.byteLength / GEN1_FONT_GLYPH_BYTES);
      const font = makeBitmapFont(blk.raw, 8, 8, 0, glyphCount);
      const frames: IndexedImage[] = [];
      for (let slot = 0; slot < GEN1_FONT_SLOTS; slot++) {
        frames.push(gen1FontGlyphImage(blk.raw, slot, egaPalette));
      }
      blk.kind = 'font';
      blk.frames = frames;
      blk.image = fontSheetImage(font);
      continue;
    }

    // Still-unsolved variant — skip (no image).
    blk.kind = 'complex';
    blk.image = null;
  }

  return { name, dataBase, blocks, frameSet };
}

/** Coarse AssetKind from the filename stem (best-effort, for the FrameSet). */
function kindFromName(name: string): AssetKind {
  const s = name.toUpperCase();
  if (s.startsWith('BIGPIC')) return 'bigpic';
  if (s.startsWith('TITLE')) return 'title';
  if (s.startsWith('CHEAD')) return 'chead';
  if (s.startsWith('CBODY') || s.startsWith('BODY')) return 'cbody';
  if (s.startsWith('CPIC')) return 'cpic';
  if (s.startsWith('PIC')) return 'pic';
  if (s.startsWith('BACK')) return 'back';
  if (s.startsWith('SPRIT')) return 'sprite';
  if (s.startsWith('COMSPR')) return 'comspr';
  if (s.startsWith('8X8D')) return 'tile8x8';
  if (s.startsWith('WALLDEF')) return 'walldef';
  if (s.startsWith('CURSOR')) return 'cursor';
  return 'unknown';
}
