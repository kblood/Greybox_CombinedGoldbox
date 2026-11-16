/**
 * 8X8D dungeon-tile loader (M1.S5c prerequisite) — the 8×8 EGA tiles the first-person
 * wall renderer blits, indexed by the WALLDEF table.
 *
 * An `8X8D*.DAX` tile block (decompressed) is the standard multi-item DaxBlock layout
 * (`coab_extracted/Classes/DaxFiles/DaxBlock.cs`), the SAME format as DUNGCOM:
 *
 *   raw[0:2]   = uint16_le tile pixel height = 8
 *   raw[2:4]   = uint16_le width/8 = 1            (→ 8 px wide)
 *   raw[4:8]   = uint16_le x_pos, y_pos (0)
 *   raw[8]       = uint8 item_count N
 *   raw[9:17]    = field_9[8]  (EGA-plane/editor meta; ignored for render)
 *   raw[17 ..]   = N contiguous 32-byte tiles   (no trailer)
 *
 * **17-byte header, VERIFIED by render** (2026-06-21): `17 + N*32 == len` exactly for every
 * real CoK 8X8D block (11/12/23/31/32 = 70 tiles, 202 = 38, 203 = 45). An earlier split
 * (9-byte header + 8-byte *trailer*) put the tiles 8 bytes too early, folding `field_9` into
 * tile 0 and rolling every tile down by 2 rows — see renders/ui/_cmp_8x8d202_*.png. With the
 * 17-byte header, block 202's tiles resolve to the crisp UI set (direction arrows, gauges,
 * orbs) and the wall blocks to clean cyan-dithered stone. Cross-checked against DUNGCOM, which
 * is the same format (25× 24×24); full write-up: docs/engine/research/dax-complex-subframe.md §D.
 *
 * Each ordinary tile is 32 bytes — 8 rows × 4 bytes, **chunky 4bpp** (high nibble = left pixel). This
 * matches COAB's tile addressing `data[header + tile_index * 32]` (Put8x8Symbol,
 * docs/engine/research/firstperson-wall-geometry-cok.md §6.2). Colour 13 (EGA magenta) is the
 * conventional transparent/background key in these tiles.
 *
 * Gateway's boot/UI block 202 is a strict second framing: `17 + 33 + N*40`; its wall banks use
 * `17 + 41 + N*40`. The 33/41 bytes are a PREFIX (the same convention as Gateway's solved planar
 * PIC family), followed by tiles stored as eight rows of five 1-bit planes (LSB plane first,
 * MSB-first pixels). Exact byte counts distinguish these from ordinary 4bpp banks; the retail
 * framebuffer proves the prefix position and row/plane order at 237/237 UI cells. This is opaque
 * 5-bit art, so EGA-magenta transparency is not applied.
 *
 * Pools of Darkness and Treasures ship a THIRD framing: the late-Gen1 VGA chunky item array with
 * an embedded DAC window (`daxVgaChunkyItems.ts`). 20 retail blocks, 4648 tiles. `sniff8x8dBlock`
 * rejects every one of them, so that branch is the sole reader and the two framings never compete.
 *
 * All three obey the same `transparentMagenta` switch. Two of them always did; the chunky branch
 * sat above the option parsing and answered 13 unconditionally until 2026-08-25.
 */
import type { IndexedImage, Palette, TileSet } from '../model/index.js';
import { makeEgaPalette } from '../render/palette.js';
import { parseVgaChunkyItems, vgaChunkyItemsToImages } from './daxVgaChunkyItems.js';

export interface Decode8x8Options {
  /** Palette to attach (default fixed EGA-16). */
  palette?: Palette;
  /**
   * Treat colour 13 (EGA magenta) as the transparent key on every tile (sets
   * `transparentIndex`). Wall tiles are sparse stone detail over a magenta field that
   * `OverlayUnbounded` masks out, so the first-person compositor wants this on. Off by
   * default so the asset browser still shows the raw bytes. Default false.
   *
   * Honoured by all three framings — 4bpp, Gateway planar5 (wall banks only; its 33-byte UI
   * bank is an opaque frame) and the Pools/Treasures VGA chunky item array.
   */
  transparentMagenta?: boolean;
}

/** Bytes before the first tile: dims/pos (8) + count byte (1) + field_9 (8) = 17. */
export const TILE8X8_HEADER = 17;
export const TILE8X8_SIZE = 8; // px, square
export const TILE8X8_BYTES = 32; // 8 rows × 4 bytes (4bpp)
export const TILE8X8_PLANAR5_BYTES = 40; // 8 rows × 5 one-bit planes
export const TILE8X8_PLANAR5_TRAILER = 33;
export const TILE8X8_PLANAR5_WALL_TRAILER = 41;
/** Offset of the uint8 tile-count byte within the header. */
export const TILE8X8_COUNT_OFFSET = 8;
/** No trailer: the 8 post-count bytes (`field_9`) are part of the 17-byte header. */
export const TILE8X8_TRAILER = 0;
/** EGA magenta — the conventional transparent/background key in CoK wall tiles. */
export const TILE8X8_TRANSPARENT = 13;

/** A decompressed 8X8D block looks like a tile strip: header word0 = 8, word1 = 1. */
export function sniff8x8dBlock(raw: Uint8Array): boolean {
  if (raw.length < TILE8X8_HEADER + TILE8X8_BYTES) return false;
  const h0 = raw[0] | (raw[1] << 8);
  const h1 = raw[2] | (raw[3] << 8);
  if (h0 !== TILE8X8_SIZE || h1 !== 1) return false;
  // The count byte must agree with the contiguous-tile framing (header + N*32 fits, with a
  // sub-tile trailer left over). This rejects non-tile blocks like 8X8D1 block 201, whose
  // dims word is garbage and whose count byte does not match the floor framing.
  const count = raw[TILE8X8_COUNT_OFFSET];
  if (count < 1) return false;
  if (sniff8x8dPlanar5Block(raw)) {
    return true;
  }
  const framed = Math.floor((raw.length - TILE8X8_HEADER) / TILE8X8_BYTES);
  // Death Knights of Krynn ships a single 256-tile wall bank (8X8D1 block 1, len 8209): the uint8
  // count byte saturates at 0xFF while the framing is exact (17 + 256*32). Accept that case — the
  // bank is byte-exact (no trailer), so the framing, not the saturated byte, is authoritative.
  if (count === 0xff && (raw.length - TILE8X8_HEADER) % TILE8X8_BYTES === 0 && framed >= 0xff) return true;
  return count === framed;
}

/** Gateway's exact 5-plane UI/wall-bank framing. */
export function sniff8x8dPlanar5Block(raw: Uint8Array): boolean {
  if (raw.length < TILE8X8_HEADER + TILE8X8_PLANAR5_BYTES + TILE8X8_PLANAR5_TRAILER) return false;
  if ((raw[0] | (raw[1] << 8)) !== TILE8X8_SIZE || (raw[2] | (raw[3] << 8)) !== 1) return false;
  const count = raw[TILE8X8_COUNT_OFFSET];
  if (count < 1) return false;
  const tail = raw.length - TILE8X8_HEADER - count * TILE8X8_PLANAR5_BYTES;
  return tail === TILE8X8_PLANAR5_TRAILER || tail === TILE8X8_PLANAR5_WALL_TRAILER;
}

function decodePlanar5Tile(
  raw: Uint8Array,
  off: number,
  palette: Palette | null,
  transparentIndex: number | null,
): IndexedImage {
  const indices = new Uint8Array(TILE8X8_SIZE * TILE8X8_SIZE);
  for (let y = 0; y < TILE8X8_SIZE; y++) {
    for (let x = 0; x < TILE8X8_SIZE; x++) {
      let value = 0;
      for (let plane = 0; plane < 5; plane++) {
        value |= ((raw[off + y * 5 + plane] >> (7 - x)) & 1) << plane;
      }
      indices[y * TILE8X8_SIZE + x] = value;
    }
  }
  return {
    width: TILE8X8_SIZE,
    height: TILE8X8_SIZE,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex,
    palette,
    encoding: '8x8d-planar5',
  };
}

/** Decode one 8×8 chunky-4bpp tile (32 bytes at `off`) into an IndexedImage. */
function decodeTile(
  raw: Uint8Array,
  off: number,
  palette: Palette | null,
  transparentIndex: number | null,
): IndexedImage {
  const indices = new Uint8Array(TILE8X8_SIZE * TILE8X8_SIZE);
  const rowBytes = TILE8X8_SIZE / 2; // 4
  for (let y = 0; y < TILE8X8_SIZE; y++) {
    for (let xb = 0; xb < rowBytes; xb++) {
      const srcI = off + y * rowBytes + xb;
      const byte = srcI < raw.byteLength ? raw[srcI] : 0;
      const o = y * TILE8X8_SIZE + 2 * xb;
      indices[o] = byte >> 4; // high nibble = left pixel
      indices[o + 1] = byte & 0x0f;
    }
  }
  return {
    width: TILE8X8_SIZE,
    height: TILE8X8_SIZE,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex,
    palette,
    encoding: '8x8d',
  };
}

/**
 * Decode a decompressed 8X8D block into a {@link TileSet} of 8×8 EGA tiles. Tiles are
 * indexed 0..N-1 in storage order; the WALLDEF table's relocated ids map onto this order
 * (id − symbol_set_fix[set], per the research §6.2). Pass `palette` to override the default
 * fixed EGA-16.
 */
export function decode8x8dBlock(
  raw: Uint8Array,
  name = '',
  opts: Decode8x8Options | Palette = {},
): TileSet {
  // Back-compat: a bare Palette as the 3rd arg still works. Parsed FIRST, because the VGA
  // chunky branch below needs the options too — it used to sit above this line and therefore
  // hardcoded its answers, which is how it came to contradict this function's own docblock.
  const options: Decode8x8Options =
    'colors' in opts || 'source' in opts ? { palette: opts as Palette } : (opts as Decode8x8Options);

  // Late-Gen1 VGA chunky item arrays (Pools of Darkness / Treasures 8X8D0 + 8X8D1). This branch
  // is these blocks' ONLY reader: `sniff8x8dBlock` rejects all 20 of them in the retail corpus,
  // so the 4bpp/planar5 path below can never see one.
  //
  // Magenta 13 is a real key here and not an EGA leftover: the 2 `base 0 / 16 colour` blocks
  // declare index 13 = (255,85,255), and the 18 `base 32 / 112 colour` wall banks spend 113942 of
  // their 294912 pixels below index 32 — i.e. on that same shared low window, which their sibling
  // 8X8D0 block is what declares. What was wrong was applying it unconditionally: `transparentMagenta`
  // is documented as off by default, the 4bpp and planar5 paths below honour that, and `decodeDax`
  // hands the very same bytes back as `dax-vga-chunky-items` with `transparentIndex: null`. One
  // family cannot key a colour or not depending on which of two entry points you decode it through.
  const chunky = parseVgaChunkyItems(raw);
  if (chunky && chunky.width === TILE8X8_SIZE && chunky.height === TILE8X8_SIZE) {
    const transparentIndex = options.transparentMagenta ? TILE8X8_TRANSPARENT : null;
    // The block's embedded DAC window is the default rather than EGA-16: these are 256-colour
    // banks reaching index 143, which no 16-entry palette can express. An explicit `options.palette`
    // still wins, and is applied to the tiles too — attaching it only to the TileSet would leave
    // every `IndexedImage` carrying a palette the caller just replaced.
    const palette = options.palette ?? chunky.palette;
    const tiles = vgaChunkyItemsToImages(chunky).map((tile) => ({ ...tile, transparentIndex, palette }));
    return {
      name,
      tileWidth: TILE8X8_SIZE,
      tileHeight: TILE8X8_SIZE,
      tiles,
      palette,
    };
  }
  if (!sniff8x8dBlock(raw)) {
    throw new Error(
      `8X8D: expected a tile block (header 8,1 + matching count), got header (${raw[0] | (raw[1] << 8)},${raw[2] | (raw[3] << 8)})`,
    );
  }
  const pal = options.palette ?? makeEgaPalette();
  const planar5 = sniff8x8dPlanar5Block(raw);
  const planarPrefix = planar5
    ? raw.length - TILE8X8_HEADER - raw[TILE8X8_COUNT_OFFSET] * TILE8X8_PLANAR5_BYTES
    : 0;
  // Gateway wall banks' index 13 pixels match native black/background cells and use the same
  // overlay semantics as EGA magenta. Its 33-byte UI bank is an opaque frame and must retain 13.
  const transparent = options.transparentMagenta && (!planar5 || planarPrefix === TILE8X8_PLANAR5_WALL_TRAILER)
    ? TILE8X8_TRANSPARENT
    : null;
  // The count byte is authoritative; clamp to the bytes actually present as a safety net. When the
  // byte saturates at 0xFF (DoK's 256-tile bank), the exact framing supplies the true count.
  const bytesPerTile = planar5 ? TILE8X8_PLANAR5_BYTES : TILE8X8_BYTES;
  const available = planar5
    ? raw[TILE8X8_COUNT_OFFSET]
    : Math.floor((raw.length - TILE8X8_HEADER) / bytesPerTile);
  const countByte = raw[TILE8X8_COUNT_OFFSET];
  const count = countByte === 0xff && (raw.length - TILE8X8_HEADER) % TILE8X8_BYTES === 0
    ? available
    : Math.min(countByte, available);
  const tiles: IndexedImage[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const offset = TILE8X8_HEADER + planarPrefix + i * bytesPerTile;
    tiles[i] = planar5
      ? decodePlanar5Tile(raw, offset, pal, transparent)
      : decodeTile(raw, offset, pal, transparent);
  }
  return { name, tileWidth: TILE8X8_SIZE, tileHeight: TILE8X8_SIZE, tiles, palette: pal };
}
