/**
 * Gateway to the Savage Frontier — VGA-extended DAX "picture" frame decoder.
 *
 * P3.1 (Savage Frontier VGA archive contract). This is a DIFFERENT, newly-discovered
 * container variant from the plain EGA `parseStandardFrame` in `dax.ts` — it does NOT
 * replace or touch that path. It applies to Gateway/Treasures-family single-frame
 * "picture" DAX blocks: TITLE.DAX, the BIGPIC family, BODY.DAX, and CPIC2..CPIC6.DAX —
 * all CONFIRMED (zero-slop formula match + exact round-trip across the full retail
 * corpus of each). CBODY.DAX and CHEAD.DAX turned out to be plain EGA instead (NOT this
 * format — see the research doc's Part 3), and PIC.DAX/PIC2..6.DAX use a related but
 * DISTINCT animation-wrapped 5-bitplane variant decoded by `parseGatewayPicPlanar5`
 * further down in this module (single-frame solved Part 17, multi-frame XOR-delta
 * animation solved Part 18 — `parseVgaExtendedPicture` itself still correctly returns
 * null for those blocks; they are dispatched separately).
 * CoK/DoK's own files of the same names never match this format (proven negative control
 * in the test suite), so detection is a safe, self-verifying exact-byte-count gate, not a
 * filename guess.
 *
 * ## What retail bytes prove (see the research doc for the full derivation)
 *
 * A Gateway "picture" DAX block (17-byte standard header, `item_count === 1`) is NOT
 * just `17 + width·height/2` bytes (CoK/DoK's plain 4bpp layout). Native CPIC recovery
 * corrected the formerly ambiguous placement and packing. It is exactly:
 *
 *   17 (header) + 33 (prefix) + height·5·ceil(width/8) (planar rows)
 *
 * Each row contains five consecutive one-bit planes, least-significant plane first;
 * bits are MSB-first within each byte. This is the same proven planar5 representation
 * used by Gateway's animated PIC family. The correction is backed by a native combat
 * frame and its byte-for-byte expanded 48x48 CPIC buffer in the t=150 RAM checkpoint.
 *
 * This exact byte formula was verified against every real "picture" block in Gateway's
 * retail `TITLE.DAX` (5/5 blocks) and `BIGPIC1.DAX` (6/6 blocks) with **zero slop** —
 * see `packages/engine/test/dax-vga-picture.test.ts`. The row stride (200 bytes for a
 * 320px-wide row) is independently confirmed by row-to-row autocorrelation on the raw
 * bytes (documented in the research doc).
 *
 * **Plane order correction (2026-07-21):** the row's two planes are extension-THEN-base,
 * not base-then-extension as originally written up. Byte round-trip alone (decode then
 * re-encode, byte-identical) cannot distinguish the two orderings — swapping which half
 * of each row is called "plane A" vs "plane B" round-trips perfectly either way, since
 * it's a self-consistent permutation either direction. The two orderings were only
 * disambiguated by actually rendering full TITLE.DAX blocks and reading the result:
 * extension-then-base produces cleanly legible real screen text across all 5 TITLE.DAX
 * blocks ("STRATEGIC SIMULATIONS, INC.", "AN ADVANCED DUNGEONS & DRAGONS ... FANTASY
 * ROLE-PLAYING GAME VOLUME 1", "BEYOND SOFTWARE", and a full credits roll — GAME DESIGN /
 * PROGRAMMING / ART DIRECTOR / ILLUSTRATION / MAP GRAPHICS / EXECUTIVE PRODUCER); the
 * base-then-extension order (this module's original claim) instead tiles into
 * unreadable, repeated-looking noise. See `docs/engine/research/gateway-vga-picture-format.md`
 * for the corrected derivation.
 *
 * GAME.OVR (Gateway's overlay pool) contains a compiled wrapper for INT 10h AX=1010h
 * ("Set Individual DAC Register") plus two direct call sites that explicitly program VGA
 * palette registers 0x10 (16) and 0x11 (17) — indices reachable ONLY when the extension
 * bit is set — to 6-bit-DAC RGB triples (0x3C,0x30,0x10) and (0x3C,0x24,0x10). No such
 * code or DAC register exists in CoK/DoK. This corroborates the pixel format independent
 * of the byte-count proof above.
 *
 * ## What remains UNPROVEN (do not invent)
 *
 * - The per-frame prefix is real, varying metadata whose component meanings are only partly
 *   identified: the 24 bytes ending at the pixel offset are the picture's own extended
 *   palette (see below), and the rest is not.
 * - PIC.DAX/PIC2..6.DAX (portrait/scene animation blocks) do NOT match this module's
 *   vga-ext format — they are the separate 5-bitplane family handled by
 *   `parseGatewayPicPlanar5` below (solved: Parts 17/18 of
 *   `docs/engine/research/gateway-vga-picture-format.md`). Their 17/33/41-byte PREFIX
 *   structure's content meaning is still unidentified (preserved verbatim).
 * - Dungeon exploration art (8X8D-family tile strips, WALLDEF-family wall-composition
 *   tables) is UNAFFECTED and unrelated: Gateway's own `8X8D2.DAX` is byte-structurally
 *   identical (same 17-byte tileset header, same raw block sizes, nibble values only
 *   0..15) to CoK/DoK's EGA tile strips, and `WALLDEF2.DAX` is a 780-byte (5 depth-slices
 *   x 156 pool-columns) tile-ID routing table consumed by `world/dungeonWalls.ts`'s
 *   `decodeWalldefBlock` — not pixel data at all. Neither shows any trace of this
 *   VGA-extension format. See the research doc for the full exploration-surface finding.
 *
 * ## Resolved 2026-08-11: DAC registers 18..31
 *
 * These were UNLOCATED across four DOSBox-X rounds, and the reason they were never findable
 * as a static table is now positive rather than merely "not found": there is no table.
 * `GAME.OVR` builds the DAC contents per picture, at runtime, from the 24 nibble-packed bytes
 * ending at the block's own pixel offset. The overlay's single `mov dx,0x3c8` (offset
 * 0x5156e) is preceded by `mov si,0xA108; mov cx,0x0E` and followed by `mov bl,0x12` — start
 * at register 18, write 14 RGB triplets, i.e. 18..31 — and `0xA108`/`0xA11A` are the work
 * buffers the routine at 0x51513 fills by splitting those 24 bytes into low and high nibbles.
 * Searching the retail files for the literal RGB bytes returns zero hits, exactly as a
 * runtime-computed buffer predicts.
 *
 * Registers 16 and 17 are still set once, separately, via `INT 10h AX=1010h` — and they are
 * *also* the first six low nibbles of every block's own 24 bytes, which is what makes the rule
 * self-checking: two independently known values must fall out of it, and they do in all 73
 * blocks. {@link gatewayExtendedDacFromCore24} refuses to decode bytes where they do not.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';
import { EGA16 } from '../render/palette.js';

/** Same 17-byte standard-frame header layout as `dax.ts`'s `parseStandardFrame`. */
const HEADER_LEN = 17;

/** Fixed metadata prefix between the 17-byte frame header and planar pixels. */
export const VGA_PICTURE_PREFIX_LEN = 33;
/** @deprecated Compatibility name; the 33 bytes are a prefix, not a trailer. */
export const VGA_PICTURE_TRAILER_LEN = VGA_PICTURE_PREFIX_LEN;

/** Bytes per row of one MSB-first one-bit plane. */
function extRowBytes(width: number): number {
  return Math.ceil(width / 8);
}

/**
 * Exact total block size (including the 17-byte header and 33-byte prefix) for a
 * Gateway VGA-extended picture of the given geometry. This is the strict detection
 * gate: real Gateway picture blocks match it with zero slop; plain EGA blocks (CoK/DoK,
 * and Gateway's own ordinary EGA tile/wall data) never do, because they carry no prefix or
 * fifth plane.
 */
export function vgaExtendedPictureByteLength(width: number, height: number): number {
  return HEADER_LEN + VGA_PICTURE_PREFIX_LEN + height * 5 * extRowBytes(width);
}

export interface VgaExtendedPicture {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  /** width*height pixel indices, 0..31 (bit 4 = extension-plane bit), row-major. */
  indices: Uint8Array;
  /** Header retained verbatim so the lossless encoder preserves field_9. */
  header: Uint8Array;
  /** The 33 metadata bytes preceding the planar pixels, retained verbatim. */
  prefix: Uint8Array;
}

/**
 * Parse one decompressed DAX block as a Gateway VGA-extended picture frame. Returns
 * null if the bytes don't match the format (wrong header shape, or the exact byte-count
 * formula above doesn't fit) — this is a strict, self-verifying gate, never a guess.
 */
export function parseVgaExtendedPicture(raw: Uint8Array): VgaExtendedPicture | null {
  if (raw.byteLength < HEADER_LEN) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = dv.getUint16(0, true);
  const widthDiv8 = dv.getUint16(2, true);
  const yOffset = dv.getUint16(4, true);
  const xOffset = dv.getUint16(6, true);
  const itemCount = raw[8];
  if (widthDiv8 === 0 || height === 0 || itemCount !== 1) return null;
  const width = widthDiv8 * 8;
  if (raw.byteLength !== vgaExtendedPictureByteLength(width, height)) return null;

  const pixOff = HEADER_LEN + VGA_PICTURE_PREFIX_LEN;
  const indices = decodeGatewayPicPlanar5Pixels(raw, pixOff, height, widthDiv8);
  return {
    width,
    height,
    xOffset,
    yOffset,
    indices,
    header: raw.slice(0, HEADER_LEN),
    prefix: raw.slice(HEADER_LEN, pixOff),
  };
}

/**
 * Re-encode a decoded picture back into the exact prefixed planar5 retail byte layout. Used
 * as this format's parity proof (no independent VGA reference renderer is available):
 * decode → re-encode → byte-identical to the original retail block proves the
 * pixel-packing rule above is exactly and losslessly correct, straight from the bytes.
 */
export function encodeVgaExtendedPicture(pic: VgaExtendedPicture): Uint8Array {
  const { width, height, indices, header, prefix } = pic;
  const width8 = width / 8;
  const total = vgaExtendedPictureByteLength(width, height);
  const out = new Uint8Array(total);
  out.set(header, 0);
  out.set(prefix, HEADER_LEN);
  const pixOff = HEADER_LEN + prefix.byteLength;
  for (let y = 0; y < height; y++) {
    for (let plane = 0; plane < 5; plane++) {
      const planeOff = pixOff + y * 5 * width8 + plane * width8;
      for (let xb = 0; xb < width8; xb++) {
        let packed = 0;
        for (let bit = 0; bit < 8; bit++) {
          packed |= ((indices[y * width + xb * 8 + bit] >> plane) & 1) << (7 - bit);
        }
        out[planeOff + xb] = packed;
      }
    }
  }
  return out;
}

/**
 * The two VGA DAC registers proven set in Gateway's `GAME.OVR` (see the module doc and
 * the research doc for the exact file offsets/hex). 6-bit DAC values (0..63) scaled to
 * 0..255 the same way `hlib-format.md`'s HLIB palette scaling works.
 */
function dac6(r6: number, g6: number, b6: number): RGB {
  const scale = (v: number) => Math.round((v * 255) / 63);
  return { r: scale(r6), g: scale(g6), b: scale(b6) };
}

/** Proven extended-DAC registers: index 16 ← (0x3C,0x30,0x10), index 17 ← (0x3C,0x24,0x10). */
export const GATEWAY_VGA_EXT_DAC: Readonly<Partial<Record<number, RGB>>> = Object.freeze({
  16: dac6(0x3c, 0x30, 0x10),
  17: dac6(0x3c, 0x24, 0x10),
});

/**
 * Palette when the block's own prefix is not available: 0..15 EGA16, 16/17 the two proven
 * DAC registers, 18..31 `null` (undefined-by-this-source — see `Palette.colors`).
 *
 * Prefer {@link gatewayExtendedPaletteFromPicture}, which fills 18..31 from the picture's own
 * bytes. This remains for callers that hold only indices.
 */
export function buildGatewayVgaExtendedPalette(): Palette {
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < EGA16.length; i++) {
    const c = EGA16[i];
    colors[i] = { r: c.r, g: c.g, b: c.b };
  }
  for (const [k, v] of Object.entries(GATEWAY_VGA_EXT_DAC)) {
    if (v) colors[Number(k)] = v;
  }
  return { colors, source: 'dax-vga-ext-partial' };
}

/** Bytes of extended-palette data at the tail of a Gateway picture prefix. */
export const GATEWAY_EXT_PALETTE_BYTES = 24;

/**
 * The 16 extended DAC registers (16..31) from the 24 bytes immediately preceding a picture's
 * pixel data.
 *
 * Those 24 bytes hold two interleaved nibble planes. Taken in byte order, the LOW nibbles
 * grouped in threes give registers 16..23 and the HIGH nibbles grouped in threes give 24..31;
 * each nibble is a 6-bit DAC component shifted left by 2. That is the split `GAME.OVR` 0x51513
 * performs into its two work buffers before writing the DAC.
 *
 * The window is anchored to the pixel offset, not to the start of the prefix: category 0x0c
 * blocks have only a 17-byte prefix, so their palette begins seven bytes earlier, inside the
 * frame header's tail. {@link gatewayExtendedDacFromPicture} assembles it correctly.
 *
 * Returns `null` if the self-check fails — registers 16 and 17 are known independently, from
 * the `INT 10h AX=1010h` calls at `GAME.OVR` 0x515a2, so bytes whose first six low nibbles are
 * not `f c 4 f 9 4` are not carrying this structure and must not be read as though they were.
 */
export function gatewayExtendedDacFromCore24(core: Uint8Array): RGB[] | null {
  if (core.byteLength !== GATEWAY_EXT_PALETTE_BYTES) return null;
  const low: RGB[] = [];
  const high: RGB[] = [];
  for (let i = 0; i < GATEWAY_EXT_PALETTE_BYTES; i += 3) {
    low.push(dac6((core[i] & 0x0f) << 2, (core[i + 1] & 0x0f) << 2, (core[i + 2] & 0x0f) << 2));
    high.push(dac6((core[i] >> 4) << 2, (core[i + 1] >> 4) << 2, (core[i + 2] >> 4) << 2));
  }
  const out = [...low, ...high];
  for (const [k, want] of Object.entries(GATEWAY_VGA_EXT_DAC)) {
    const got = out[Number(k) - 16];
    if (!want || !got || got.r !== want.r || got.g !== want.g || got.b !== want.b) return null;
  }
  return out;
}

/**
 * Anything carrying the bytes that precede a picture's pixels. The two parsed picture types
 * name their leading bytes differently (`header` on the vga-ext frame, `head` on the planar5
 * frame), and both are accepted.
 */
export interface GatewayPictureLeadingBytes {
  header?: Uint8Array;
  head?: Uint8Array;
  prefix: Uint8Array;
}

/** The 24 palette bytes ending at the pixel offset, spanning back into the header if needed. */
function core24Of(pic: GatewayPictureLeadingBytes): Uint8Array {
  const { prefix } = pic;
  if (prefix.byteLength >= GATEWAY_EXT_PALETTE_BYTES) {
    return prefix.subarray(prefix.byteLength - GATEWAY_EXT_PALETTE_BYTES);
  }
  const header = pic.header ?? pic.head;
  const want = GATEWAY_EXT_PALETTE_BYTES - prefix.byteLength;
  if (!header || header.byteLength < want) return new Uint8Array(0);
  const out = new Uint8Array(GATEWAY_EXT_PALETTE_BYTES);
  out.set(header.subarray(header.byteLength - want), 0);
  out.set(prefix, want);
  return out;
}

/** The extended DAC registers for a parsed picture, from its leading bytes and prefix. */
export function gatewayExtendedDacFromPicture(pic: GatewayPictureLeadingBytes): RGB[] | null {
  return gatewayExtendedDacFromCore24(core24Of(pic));
}

/**
 * Full 0..31 palette for a Gateway picture: EGA16 below, then the block's own extended DAC
 * registers. Falls back to {@link buildGatewayVgaExtendedPalette} — 18..31 left `null` — when
 * the bytes do not carry a recognisable palette, rather than inventing colours for it.
 */
export function gatewayExtendedPaletteFromPicture(pic: GatewayPictureLeadingBytes): Palette {
  const ext = gatewayExtendedDacFromPicture(pic);
  if (!ext) return buildGatewayVgaExtendedPalette();
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < EGA16.length; i++) {
    const c = EGA16[i];
    colors[i] = { r: c.r, g: c.g, b: c.b };
  }
  for (let i = 0; i < ext.length; i++) colors[16 + i] = ext[i];
  return { colors, source: 'dax-vga-ext' };
}

/** Decode a Gateway VGA-extended picture block straight to the neutral IndexedImage model. */
export function vgaExtendedPictureToIndexedImage(pic: VgaExtendedPicture): IndexedImage {
  return {
    width: pic.width,
    height: pic.height,
    indices: pic.indices,
    xOffset: pic.xOffset,
    yOffset: pic.yOffset,
    transparentIndex: null,
    palette: gatewayExtendedPaletteFromPicture(pic),
    encoding: 'dax-vga-ext-picture',
  };
}

// ---------------------------------------------------------------------------------------
// Gateway `PIC*.DAX` single-frame 5-bitplane pictures — SOLVED 2026-07-22 (research doc
// Part 17) via a live-captured loader output buffer as oracle, after 9 ruled-out static
// hypotheses. Faithful port of `tools/gateway_pic_decode.py` (the proven reference).
//
// After the standard Gen1 DAX RLE decompression, a single-frame PIC block is:
//
//   raw[0]      u8  numFrames (1 for every block this decoder handles)
//   raw[1..21]  21-byte animation frame header (`dax.ts` ANIM_FRAME_HEADER): u32 delay,
//               u16 height, u16 width_div8, u16 x, u16 y(+pad), u8[9] tail — tail byte 1
//               (raw[14]) is the Part 6 categorical format predictor
//   raw[22..]   PREFIX structure — 17/33/41 bytes by category byte (0x0c/0x0e/0x0f).
//               Parts 3/6 derived the same lengths by byte arithmetic but placed them as
//               a TRAILER after the pixels; the captured oracle proves the structure sits
//               BEFORE the pixel data (this misplacement is exactly why every prior pixel
//               hypothesis rendered noise). Content meaning still unidentified.
//   then        PIXELS: height rows, each row = 5 consecutive 1-bit planes of width_div8
//               bytes each (plane order LSB..MSB: bit0 first, bit4/extension last), bits
//               MSB-first within a byte. Row stride = 5*width_div8; 88x88 blocks consume
//               88 x 55 = 4,840 bytes with zero slop. Pixel = 5-bit palette index 0..31.
//
// Evidence bar (honest): byte-exact PROOF exists for `PIC2.DAX` block id 5 — the decode
// is byte-identical (7,736/7,736 comparable bytes) to the 7,744-byte loader output buffer
// captured live at the strict PIC loader's RETF in two independent DOSBox-X sessions
// (sha256 25293b40cd5114cf…; the buffer's first 8 bytes are non-pixel metadata words
// `0000 8354 0000 01E4`). The other 71 single-frame blocks across `PIC.DAX`–`PIC6.DAX`
// carry exact-fit (zero slop) + coherent-render evidence, one notch below. The palette is
// the same partial `buildGatewayVgaExtendedPalette` (16/17 proven, 18..31 honestly null).
//
// MULTI-FRAME blocks (numFrames > 1) — SOLVED 2026-07-23 (research doc Part 18) by
// closing the loader disassembly: frame 0 is the full single-frame layout above; every
// subsequent frame is a 14-byte header (u32 delay, u16 height, u16 width_div8, u16 x,
// u16 y, u8 pad=0x01, u8 category=0x04 — the loader's "reuse frame 0's cached 59-byte
// tail structure" marker, `GAME.OVR` 0x46b61) followed by a FULL height*5*width8-byte
// planar5 image that is the XOR delta against frame 0 (the game XORs the UNPACKED chunky
// buffers, loop bound height*width at 0x46bfd..0x46c41, but XOR commutes with bit-plane
// unpacking so planar-domain XOR is byte-identical). Part 6's "4,833-byte payload,
// 7 bytes short of a full image" was a misattribution: tail frames have a 14-byte header,
// not 21 — the 7 "header tail" zero bytes are really the delta's first 7 (unchanged)
// pixel bytes. Exact-consume, zero slop: 22 + prefix + P + (numFrames-1)*(14 + P) with
// P = height*5*width8 (`PIC.DAX` id 29: 1 + 4894 + 5*4854 = 29165). Same frame-0
// XOR-delta convention as CoK's own PIC family (`dax.ts` animXor), confirmed straight
// from Gateway's compiled code (Part 7) — deltas are all against frame 0, not cumulative.
// ---------------------------------------------------------------------------------------

/** Prefix-structure length by the frame-header category byte (raw[14]). Proven Part 6/17. */
export const GATEWAY_PIC_PREFIX_BY_CATEGORY: Readonly<Partial<Record<number, number>>> =
  Object.freeze({ 0x0c: 17, 0x0e: 33, 0x0f: 41 });

/** 1-byte numFrames + 21-byte animation frame header (same layout as dax.ts's ANIM path). */
const GATEWAY_PIC_HEAD_LEN = 22;

/**
 * Tail (non-reference) frame header: u32 delay, u16 height, u16 width_div8, u16 x,
 * u16 y, u8 pad (0x01), u8 category (0x04) — and then immediately the full planar5
 * XOR-delta image. 14 bytes, NOT the 21 of frame 0: the loader's tail-structure parser
 * consumes exactly one byte (the 0x04 marker) for delta frames and reuses frame 0's
 * cached structure (disassembly, `GAME.OVR` 0x46b30..0x46b7b).
 */
const GATEWAY_PIC_TAIL_HEAD_LEN = 14;

/** Category byte marking a delta (tail) frame. Never occurs on a reference frame. */
export const GATEWAY_PIC_TAIL_CATEGORY = 0x04;

export interface GatewayPicPlanar5Picture {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  /** The frame-header category byte raw[14]: 0x0c, 0x0e or 0x0f. */
  category: number;
  /** raw[0..22) verbatim (numFrames + 21-byte frame header) — kept for lossless re-encode. */
  head: Uint8Array;
  /** The 17/33/41-byte prefix structure verbatim — real data, meaning not yet identified. */
  prefix: Uint8Array;
  /** width*height pixel indices 0..31 (5-bit chunky), row-major. */
  indices: Uint8Array;
}

/** A decoded multi-frame (XOR-delta-animated) Gateway PIC block. */
export interface GatewayPicMultiFrame {
  /** Frame 0 — the reference frame, full single-frame layout (head + prefix + planes). */
  picture: GatewayPicPlanar5Picture;
  /**
   * Every frame's reconstructed chunky indices (0..31), row-major; frames[0] is the
   * reference frame's own indices (same array content as picture.indices). Tail frames
   * are frame0 XOR delta, already resolved — NOT the raw deltas.
   */
  frames: Uint8Array[];
  /** Each tail frame's 14-byte header verbatim (kept for the lossless re-encode proof). */
  tailHeads: Uint8Array[];
}

/** Typed parse outcome: a single still picture, or a decoded XOR-delta animation. */
export type GatewayPicParse =
  | { outcome: 'single-frame'; picture: GatewayPicPlanar5Picture }
  | { outcome: 'multi-frame'; multi: GatewayPicMultiFrame };

/**
 * Faithful port of gateway_pic_decode.py's `decode_planar5`: per row, 5 consecutive
 * 1-bit planes of width_div8 bytes (LSB plane first), MSB-first bits → chunky 0..31.
 */
function decodeGatewayPicPlanar5Pixels(
  raw: Uint8Array,
  pixOff: number,
  height: number,
  width8: number,
): Uint8Array {
  const width = width8 * 8;
  const img = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowBase = y * width;
    for (let plane = 0; plane < 5; plane++) {
      const off = pixOff + y * 5 * width8 + plane * width8;
      for (let k = 0; k < width8; k++) {
        const v = raw[off + k];
        const base = rowBase + k * 8;
        for (let j = 0; j < 8; j++) {
          img[base + j] |= ((v >> (7 - j)) & 1) << plane;
        }
      }
    }
  }
  return img;
}

/**
 * Parse one decompressed Gateway `PIC*.DAX` block. Returns:
 *  - `{ outcome: 'single-frame', picture }` for a numFrames===1 category-0x0c/0x0e/0x0f
 *    block that satisfies the exact-consume formula `22 + prefix + height*5*width8`
 *    (zero slop — the strict, self-verifying accept gate; all 72 retail single-frame
 *    blocks pass it, and no CoK/DoK block does — proven negative control in the tests);
 *  - `{ outcome: 'multi-frame', multi }` for a numFrames>1 block satisfying the exact
 *    multi-frame formula `22 + prefix + P + (numFrames-1)·(14 + P)` with every tail
 *    frame carrying matching height/width_div8 and the 0x04 delta-frame category byte —
 *    tail frames are full planar5 XOR deltas against frame 0, resolved here (Part 18);
 *  - `null` when the bytes are not this format at all.
 */
export function parseGatewayPicPlanar5(raw: Uint8Array): GatewayPicParse | null {
  if (raw.byteLength < GATEWAY_PIC_HEAD_LEN) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const numFrames = raw[0];
  if (numFrames === 0 || numFrames > 64) return null;
  const height = dv.getUint16(5, true);
  const width8 = dv.getUint16(7, true);
  const category = raw[14];
  const prefixLen = GATEWAY_PIC_PREFIX_BY_CATEGORY[category];
  if (prefixLen === undefined) return null;
  if (height === 0 || width8 === 0 || height > 256 || width8 > 64) return null;
  const pixelBytes = height * 5 * width8;
  const singleFrameLen = GATEWAY_PIC_HEAD_LEN + prefixLen + pixelBytes;

  // Strict exact-consume gate for the whole block (single- and multi-frame).
  const tailFrameSpan = GATEWAY_PIC_TAIL_HEAD_LEN + pixelBytes;
  if (raw.byteLength !== singleFrameLen + (numFrames - 1) * tailFrameSpan) return null;

  const xOffset = dv.getUint16(9, true);
  const yOffset = dv.getUint16(11, true);
  const pixOff = GATEWAY_PIC_HEAD_LEN + prefixLen;
  const picture: GatewayPicPlanar5Picture = {
    width: width8 * 8,
    height,
    xOffset,
    yOffset,
    category,
    head: raw.slice(0, GATEWAY_PIC_HEAD_LEN),
    prefix: raw.slice(GATEWAY_PIC_HEAD_LEN, GATEWAY_PIC_HEAD_LEN + prefixLen),
    indices: decodeGatewayPicPlanar5Pixels(raw, pixOff, height, width8),
  };
  if (numFrames === 1) return { outcome: 'single-frame', picture };

  // Multi-frame: each tail frame = 14-byte header + full planar5 XOR delta vs frame 0.
  const f0Planar = raw.subarray(pixOff, pixOff + pixelBytes);
  const frames: Uint8Array[] = [picture.indices];
  const tailHeads: Uint8Array[] = [];
  let s = singleFrameLen;
  const stream = new Uint8Array(pixelBytes);
  for (let f = 1; f < numFrames; f++) {
    const th = dv.getUint16(s + 4, true);
    const tw8 = dv.getUint16(s + 6, true);
    const tcat = raw[s + 13];
    if (th !== height || tw8 !== width8 || tcat !== GATEWAY_PIC_TAIL_CATEGORY) return null;
    tailHeads.push(raw.slice(s, s + GATEWAY_PIC_TAIL_HEAD_LEN));
    const deltaOff = s + GATEWAY_PIC_TAIL_HEAD_LEN;
    // XOR in the planar domain — byte-identical to the game's chunky-domain XOR,
    // because bit-plane unpacking is linear over GF(2).
    for (let i = 0; i < pixelBytes; i++) stream[i] = f0Planar[i] ^ raw[deltaOff + i];
    frames.push(decodeGatewayPicPlanar5Pixels(stream, 0, height, width8));
    s += tailFrameSpan;
  }
  return { outcome: 'multi-frame', multi: { picture, frames, tailHeads } };
}

/**
 * Re-encode a decoded single-frame picture back into the exact retail byte layout
 * (head + prefix verbatim, pixels repacked into the 5 per-row bit-planes). Used as this
 * format's lossless round-trip proof in the tests: decode → re-encode is byte-identical
 * to the original decompressed block for all 72 retail single-frame blocks.
 */
export function encodeGatewayPicPlanar5(pic: GatewayPicPlanar5Picture): Uint8Array {
  const width8 = pic.width / 8;
  const pixOff = GATEWAY_PIC_HEAD_LEN + pic.prefix.byteLength;
  const out = new Uint8Array(pixOff + pic.height * 5 * width8);
  out.set(pic.head, 0);
  out.set(pic.prefix, GATEWAY_PIC_HEAD_LEN);
  packGatewayPicPlanar5Pixels(pic.indices, pic.height, width8, out, pixOff);
  return out;
}

/** Pack chunky 0..31 indices into the per-row 5-bit-plane layout at out[pixOff..]. */
function packGatewayPicPlanar5Pixels(
  indices: Uint8Array,
  height: number,
  width8: number,
  out: Uint8Array,
  pixOff: number,
): void {
  const width = width8 * 8;
  for (let y = 0; y < height; y++) {
    const rowBase = y * width;
    for (let plane = 0; plane < 5; plane++) {
      const off = pixOff + y * 5 * width8 + plane * width8;
      for (let k = 0; k < width8; k++) {
        let v = 0;
        const base = rowBase + k * 8;
        for (let j = 0; j < 8; j++) {
          v |= ((indices[base + j] >> plane) & 1) << (7 - j);
        }
        out[off + k] = v;
      }
    }
  }
}

/**
 * Re-encode a decoded multi-frame block back into the exact retail byte layout:
 * frame 0 via {@link encodeGatewayPicPlanar5}, then each tail frame as its verbatim
 * 14-byte header + the planar5 packing of (frameN XOR frame0) — the XOR is taken in
 * the chunky domain and packed, which is byte-identical to the file's planar-domain
 * delta (bit-plane packing is linear over GF(2)). Lossless round-trip proof for the
 * multi-frame layout in the tests.
 */
export function encodeGatewayPicPlanar5Multi(multi: GatewayPicMultiFrame): Uint8Array {
  const { picture, frames, tailHeads } = multi;
  const width8 = picture.width / 8;
  const pixelBytes = picture.height * 5 * width8;
  const frame0 = encodeGatewayPicPlanar5(picture);
  const tailSpan = GATEWAY_PIC_TAIL_HEAD_LEN + pixelBytes;
  const out = new Uint8Array(frame0.byteLength + tailHeads.length * tailSpan);
  out.set(frame0, 0);
  const deltaIndices = new Uint8Array(picture.width * picture.height);
  let s = frame0.byteLength;
  for (let f = 0; f < tailHeads.length; f++) {
    out.set(tailHeads[f], s);
    const frameN = frames[f + 1];
    for (let i = 0; i < deltaIndices.length; i++) {
      deltaIndices[i] = frameN[i] ^ picture.indices[i];
    }
    packGatewayPicPlanar5Pixels(deltaIndices, picture.height, width8, out, s + GATEWAY_PIC_TAIL_HEAD_LEN);
    s += tailSpan;
  }
  return out;
}

/**
 * Decode a single-frame Gateway PIC picture to the neutral IndexedImage model, with the full
 * 0..31 palette read from the block's own bytes (see `gatewayExtendedPaletteFromPicture`).
 */
export function gatewayPicPlanar5ToIndexedImage(pic: GatewayPicPlanar5Picture): IndexedImage {
  return {
    width: pic.width,
    height: pic.height,
    indices: pic.indices,
    xOffset: pic.xOffset,
    yOffset: pic.yOffset,
    transparentIndex: null,
    palette: gatewayExtendedPaletteFromPicture(pic),
    encoding: 'dax-gateway-pic-planar5',
  };
}

/**
 * Decode a multi-frame Gateway PIC block to one IndexedImage per frame (frame 0 first,
 * tail XOR deltas already resolved to full frames). Every frame shares frame 0's palette —
 * the tail frames carry a 14-byte header with no prefix, so there is only one to read.
 */
export function gatewayPicMultiFrameToIndexedImages(multi: GatewayPicMultiFrame): IndexedImage[] {
  const { picture, frames } = multi;
  const palette = gatewayExtendedPaletteFromPicture(picture);
  return frames.map((indices) => ({
    width: picture.width,
    height: picture.height,
    indices,
    xOffset: picture.xOffset,
    yOffset: picture.yOffset,
    transparentIndex: null,
    palette,
    encoding: 'dax-gateway-pic-planar5',
  }));
}

// ---------------------------------------------------------------------------------------
// Pixel-less planar5 STRUCTURE RECORDS — Gateway `COMSPR.DAX` blocks 254/255, resolved
// 2026-07-23 (research doc Part 19). A structure record is a planar5 frame header with
// ZERO geometry followed by the full Part 18 category-gated component stream and NO
// pixel bytes (P = height*5*width8 = 0):
//
//   raw[0..8)   u16 height=0, u16 width_div8=0, u16 x=0, u16 y=0
//   raw[8]      0x01 (the pad/count byte, same position+value as the planar5 header)
//   raw[9]      category: 0x0e → [comp16][core24] (40 bytes), 0x0f → [comp8][comp16]
//               [core24] (48 bytes) — identical grammar/lengths to the PIC frame-0 prefix
//   raw[10..]   the components verbatim; block ends exactly there (zero slop)
//
// Both retail specimens carry Part 18's component signatures (comp16 opens on the
// identity nibble permutation — exact in block 255, one nibble varied in 254; comp16[8]
// = 0x7e as in 57/60 PIC specimens; core24's first-6 low nibbles are the constant
// `f c 4 f 9 4` seen in 73/73 PIC specimens). Corpus: a 547-file / 7,683-block sweep of
// all nine installed Gold Box titles matches the strict gate below on EXACTLY these two
// blocks — no other title ships structure records.
//
// Proven consumption (static disassembly, retail GAME.OVR): the boot preloader
// (GAME.OVR+0x11751/+0x11773) loads COMSPR id 0xFF into DS:0x53F8 and id 0xFE into
// DS:0x53FC via the raw block loader `0x149:0x39` (no per-item image unpack — unlike
// the 26 real combat sprites, which go through the id/id+0x80 pair loader). Each record
// has exactly ONE consumer, and both "draw" it via the standard draw-image primitive
// `0x149:0x43(x=1, y=1, recordPtr)` gated on `[DS:0x5DB6] == 3` (the video-mode global,
// live-confirmed = 3 under VGA in Part 16): block 255 at the end of the exploration
// area-view draw (GAME.OVR+0x41E6A), block 254 at the end of the 3D dungeon-viewport
// draw (GAME.OVR+0x48410). So they are VGA-mode-only color/structure setup applied to
// the two main play screens — drawing a zero-pixel image runs only the prefix/structure
// parse. Component MEANINGS remain unidentified (same honest `unknown_comp8/16/24` as
// Part 18); a plausible-but-unproven reading is that they program the extended DAC
// registers for picture-less screens — a concrete lead for the queued DAC 18..31
// live-capture lane, recorded as a lead, not a claim.
// ---------------------------------------------------------------------------------------

/** Component-stream length (bytes after the category byte) by category — Part 18 grammar. */
export const GATEWAY_STRUCTURE_RECORD_COMPONENTS: Readonly<Partial<Record<number, number>>> =
  Object.freeze({ 0x0c: 24, 0x0e: 40, 0x0f: 48 });

/** A parsed pixel-less structure record (Gateway COMSPR.DAX ids 254/255). */
export interface GatewayPicStructureRecord {
  /** The category byte raw[9]: 0x0c, 0x0e or 0x0f (retail specimens: 0x0f=254, 0x0e=255). */
  category: number;
  /** 8-byte component (category 0x0f only), verbatim; meaning unidentified. */
  comp8: Uint8Array | null;
  /** 16-byte component (categories 0x0e/0x0f), verbatim; opens on the identity nibble
   *  permutation `10 32 54 76 98 ba dc fe` (exact in block 255). Meaning unidentified. */
  comp16: Uint8Array | null;
  /** 24-byte component (always present, always last), verbatim; meaning unidentified. */
  core24: Uint8Array;
}

/**
 * Parse a pixel-less planar5 structure record. Strict gate: 8 zero geometry bytes,
 * pad/count byte 0x01, a known category, and EXACT length 10 + component bytes (zero
 * slop — geometry 0 means zero pixel bytes). Returns null for anything else; across
 * all nine installed titles' DAX corpora only Gateway COMSPR.DAX ids 254/255 match.
 */
export function parseGatewayPicStructureRecord(
  raw: Uint8Array,
): GatewayPicStructureRecord | null {
  if (raw.byteLength < 10) return null;
  for (let i = 0; i < 8; i++) if (raw[i] !== 0) return null;
  if (raw[8] !== 1) return null;
  const category = raw[9];
  const sLen = GATEWAY_STRUCTURE_RECORD_COMPONENTS[category];
  if (sLen === undefined) return null;
  if (raw.byteLength !== 10 + sLen) return null;
  let off = 10;
  const comp8 = category === 0x0f ? raw.slice(off, (off += 8)) : null;
  const comp16 = category !== 0x0c ? raw.slice(off, (off += 16)) : null;
  const core24 = raw.slice(off, off + 24);
  return { category, comp8, comp16, core24 };
}

/**
 * Re-encode a structure record back to the exact retail byte layout (8 zero geometry
 * bytes + 0x01 + category + components verbatim). Lossless round-trip proof in tests.
 */
export function encodeGatewayPicStructureRecord(rec: GatewayPicStructureRecord): Uint8Array {
  const parts = [rec.comp8, rec.comp16, rec.core24].filter(
    (p): p is Uint8Array => p !== null,
  );
  const total = 10 + parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  out[8] = 1;
  out[9] = rec.category;
  let off = 10;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}
