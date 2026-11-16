/**
 * DAA loader — Amiga Champions/Death Knights of Krynn 32-color graphics container.
 *
 * Direct port of tools/daa_decode.py. BIG-ENDIAN; signed-byte RLE (shared with
 * DAX); 5 CONTIGUOUS (non-interleaved) bitplanes for 32 colors; a 12-bit Amiga
 * palette embedded per frame (32 × BE uint16 0x0RGB, each nibble ×17 → 8-bit).
 * See docs/daa-format.md.
 *
 * Container mirrors DAX but big-endian and with `word0 = 2 + entries*9` which
 * EQUALS data_base directly (DAX has word0 = entries*9 and data_base = 2 + word0).
 *
 * The 6-byte sub-frame INDEX variant (SPRIT*, DoK PIC*, big HEAD*) is now SOLVED
 * end-to-end (2026-06-25, by disassembling the Amiga `game` 68000 executable — there
 * is no C decompile for the Amiga build, unlike DOS COAB). Full write-up:
 * docs/daa-format.md §1b, docs/engine/research/subframe-format.md §3; reference
 * decoder: tools/subframe_decode.py (`rle_amiga_sprite` / `decode_amiga_subframe`,
 * ported faithfully below as {@link rleAmigaSprite} / {@link decodeAmigaSubEntry}).
 * The outer 6-byte TOC `{u8 blockId, u8 0, u32 BE subOffset}` gives each entry's
 * compressed body; that body is ONE continuous stream compressed with a DISTINCT
 * "Amiga sprite RLE" (not {@link signedByteRLE} — the opcode boundary at 0x80 means
 * something different in each: the outer scheme repeats 128 times, the inner scheme
 * is a no-op). The decompressor runs in CONSECUTIVE SEGMENTS off one running source
 * position: segment 1 = the header+palette (`pixOff` bytes), followed by the stored
 * planar bitmap frames. `numDist` is the historical field name for the header's frame
 * count; the meaning and selector/playback rules are family-specific and may be unknown.
 * `frameSet.frames` uses the first stored frame as the generic preview for `kind: 'index'`
 * archives; every decoded frame is kept on {@link DaaSubFrame.frames}.
 * The segmented interpretation remains the compatibility default. An explicit,
 * explicit tail-layout opt-ins are available for independently identified sources;
 * the CoK SPRIT1/2 three-frame/XOR interpretation is separate from the legacy and
 * single-frame paths. See {@link DaaDecodeOptions} and docs/daa-format.md §1b.
 */
import type { FrameSet, IndexedImage, Palette, RGB, TileSet } from '../model/index.js';
import { ByteReader } from '../util/ByteReader.js';
import { signedByteRLE } from '../util/rle.js';
import { EGA16, makeEgaPalette } from '../render/palette.js';

const ENTRY_SIZE = 9;
const NUM_PLANES = 5;
/** EGA-16 transparent key (magenta), shared with the DOS 8X8D tiles. */
const MAGENTA_KEY = 13;
/** 8X8D tiles are 4 bitplanes (16 colours), 8×8 px, MSB-first, plane 0 = LSB. */
const TILE_PLANES = 4;
const TILE_PX = 8;
/** 8X8D block header: 8-byte frame header + 1 count byte, then the planar strip. */
const TILE_STRIP_PIX_OFFSET = 9;
/** Amiga `*COM` combat-backdrop item edge, in pixels (24×24). */
const COM_PX = 24;
/** Bytes that follow the plane data in every shipped `*COM` block. Purpose unknown. */
const COM_TRAILER = 2;
const PAL_COLORS = 32;
const PAL_BYTES = PAL_COLORS * 2;
/** header(8) + pad(1) + palette(64) = 73 bytes before planar pixel data. */
const FRAME_PIX_OFFSET = 8 + 1 + PAL_BYTES;

/** A DAA 9-byte-TOC block. */
export interface DaaBlock {
  index: number;
  /** Sparse block id from the file (NOT a sequential index). */
  blockId: number;
  /** Offset relative to the data section base. */
  dataOffset: number;
  rawSize: number;
  compSize: number;
  raw: Uint8Array;
  /** Decoded image (null for unrecognized headers). For a tile strip this is `frames[0]`. */
  image: IndexedImage | null;
  /**
   * Every item in a multi-item block, in strip order — the DAA counterpart of `DaxBlock.frames`.
   * Populated only for 8X8D tile strips (`item_count >= 2` at header byte 8, exact 4-plane fit);
   * `undefined` for ordinary single-item frames. See {@link decodeDaaTileStrip}.
   */
  frames?: IndexedImage[];
  /** `'tileset'` for a decoded 8X8D strip, `'frame'` for a single-item image. */
  kind?: 'frame' | 'tileset';
}

/**
 * A 6-byte sub-frame index entry (SPRIT*, PIC*, big HEAD* families) with decoded pixels
 * (see the module doc comment). Its frame semantics are family-specific. `frames[0]` is
 * the generic preview placed into {@link DaaArchive.frameSet} under this entry's `blockId`.
 */
export interface DaaSubFrame {
  /** Positional index in the 6-byte TOC (0..n-1), retained even if inner decoding fails. */
  index: number;
  /** Sparse block id (matches the DOS DAX block id for the same art). */
  blockId: number;
  /** Offset of this entry's compressed body relative to the data-section base. */
  subOffset: number;
  /**
   * Raw header field at decompressed offset 0. Used as the header output budget by
   * the legacy segmented decoder; it is NOT the bitmap offset in the opt-in tail
   * layout (CoK PIC1 #18 has pixOff=77 and actual bitmap start=87).
   */
  pixOff: number;
  /** Canvas height, BE u16 at decompressed header offset 1 (88 across all examined CoK/DoK sprites). */
  height: number;
  /** Canvas width ÷ 8, BE u16 at decompressed header offset 3 (11 → 88 px). */
  widthDiv8: number;
  /** Canvas width in pixels (`widthDiv8 * 8`). */
  width: number;
  /** Placement hint x, BE u16 at decompressed header offset 5 (unused for raster). */
  x: number;
  /** Placement hint y, BE u16 at decompressed header offset 7 (unused for raster). */
  y: number;
  /**
   * Stored-frame count (1–6 observed), read from decompressed header offset 10. `numDist`
   * is the historical API field name; frame meaning is family-specific. CORRECTED from
   * the pre-pixel-solve implementation, which mis-read offset 9 (an unused flag byte,
   * always 0) — kept under its original field name.
   */
  numDist: number;
  /**
   * Every decoded frame, in stored order (index 0 is the generic preview placed into
   * {@link DaaArchive.frameSet}). Do not infer time-animation or distance-selection
   * semantics from order alone. Each carries this entry's own 32-colour palette. Empty when
   * this entry failed to decode (malformed/truncated sub-block) — logged nowhere, just
   * skipped, so one bad entry doesn't fail the whole archive. As of 2026-07-18 every
   * real CoK/DoK 6-byte-index sub-block (158/158) decodes; the guard remains for
   * corrupt data only. (The comspr, CPIC and HEAD families never reach this path — they
   * are 9-byte-TOC standard-frame files the chain validation correctly routes to 'blocks'.)
   */
  frames: IndexedImage[];
  /** Present only for an explicitly selected, successfully decoded tail-layout entry. */
  tailLayout?: DaaSingleFrameTailLayout | DaaCokSpritTailLayout;
}

export interface DaaSingleFrameTailLayout {
  layout: 'amiga-sprite-single-frame-tail-v1';
  /** Exact-sized owned copy of the complete decompressed stream, including header/trailer. */
  decodedStream: Uint8Array;
  bitmapStart: number;
  planarByteLength: number;
  frameStride: number;
}

export interface DaaCokSpritTailLayout {
  layout: 'cok-sprit-three-frame-tail-xor-v1';
  /** Exact-sized owned copy of the complete decompressed stream, including trailing bytes. */
  decodedStream: Uint8Array;
  bitmapStart: number;
  planarByteLength: number;
  frameStride: number;
  storedFrameCount: 3;
  xorBaseFrame: 0;
}

/** Internal lightweight TOC entry before the body is decompressed/parsed. */
interface SubFrameToc {
  blockId: number;
  subOffset: number;
}

export interface DaaArchive {
  name: string;
  /** "blocks" = renderable 9-byte TOC; "index" = 6-byte sub-frame index (SPRIT/PIC/HEAD; SOLVED). */
  kind: 'blocks' | 'index';
  dataBase: number;
  /** 9-byte TOC blocks (only for kind === 'blocks'). */
  blocks: DaaBlock[];
  /** 6-byte sub-frame entries (only for kind === 'index'), each carrying its decoded `frames`. */
  subFrames: DaaSubFrame[];
  /**
   * Images keyed by sparse blockId. For kind === 'index', each entry contributes its first
   * stored frame as a generic preview; the full per-entry frame set is on `subFrames`.
   */
  frameSet: FrameSet;
}

export interface DaaDecodeOptions {
  /**
   * Explicitly selected 6-byte-index block IDs decoded as a complete sprite-RLE
   * stream with one tail-framed bitmap and one trailing byte. Requires numDist=1;
   * never changes later-frame/XOR semantics. Selected malformed or absent entries
   * throw instead of becoming empty frames. All other entries retain legacy behavior.
   * The caller must independently verify archive identity before selecting IDs;
   * this option checks layout, not provenance or suitability for another family.
   */
  singleFrameTailBlockIds?: readonly number[];
  /**
   * Explicit 6-byte-index IDs using the verified candidate CoK SPRIT1/2 88x88, three-frame
   * tail/XOR layout. Requires caller-verified archive provenance; never inferred by filename.
   * This only decodes stored pixels and does not establish selector, playback, or runtime use.
   */
  cokSpritTailBlockIds?: readonly number[];
}

/**
 * Cheap shape check: big-endian word0 is in range and (word0-2) is a multiple of 9 or 6.
 *
 * Deliberately LOOSER than `parseContainer` since 2026-08-25, and the gap is load-bearing rather
 * than an oversight. The nine Amiga Pool of Radiance resources satisfy this and are not DAA; they
 * still enter the DAA branch of `decodeAsset` and fail there naming the offending entry, which is
 * a better answer than the dispatcher's generic "unrecognized container format". That is only
 * safe because `sniffDax` declines all nine as well — if DAX claimed them, sniff ORDER would be
 * quietly deciding a format question. Pinned in `test/daaIndexValidation.test.ts`.
 */
export function sniffDaa(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 11) return false;
  const word0 = (bytes[0] << 8) | bytes[1];
  if (word0 < 11 || word0 > bytes.byteLength) return false;
  const body = word0 - 2;
  return body % ENTRY_SIZE === 0 || body % 6 === 0;
}

/**
 * Parse the container. Tries the 9-byte block TOC first and accepts it only when
 * every data_offset chains and the last block ends within 4 bytes of EOF;
 * otherwise falls back to the 6-byte sub-frame index. Throws on non-DAA.
 */
function parseContainer(
  r: ByteReader,
):
  | { kind: 'blocks'; dataBase: number; blocks: DaaBlock[] }
  | { kind: 'index'; dataBase: number; toc: SubFrameToc[] } {
  if (r.length < 11) throw new Error('DAA: file too small');
  const word0 = r.u16At(0, false);
  if (word0 < 11 || word0 > r.length) {
    throw new Error(`DAA: word0=${word0} out of range; not a DAA container`);
  }
  const body = word0 - 2;
  const dataBase = word0;

  // Try the 9-byte block TOC, validate by chaining + EOF.
  if (body % ENTRY_SIZE === 0) {
    const n = body / ENTRY_SIZE;
    const blocks: DaaBlock[] = [];
    let ok = true;
    let expectedOff = 0;
    for (let i = 0; i < n; i++) {
      const off = 2 + i * ENTRY_SIZE;
      const bid = r.u8At(off);
      const dOff = r.u32At(off + 1, false);
      const raw = r.u16At(off + 5, false);
      const comp = r.u16At(off + 7, false);
      if (dOff !== expectedOff) {
        ok = false;
        break;
      }
      blocks.push({
        index: i,
        blockId: bid,
        dataOffset: dOff,
        rawSize: raw,
        compSize: comp,
        raw: new Uint8Array(0),
        image: null,
      });
      expectedOff = dOff + comp;
    }
    if (ok && blocks.length > 0) {
      const last = blocks[blocks.length - 1];
      const lastEnd = dataBase + last.dataOffset + last.compSize;
      const trailing = r.length - lastEnd;
      if (trailing >= 0 && trailing <= 4) {
        return { kind: 'blocks', dataBase, blocks };
      }
    }
  }

  // Otherwise treat as a 6-byte sub-frame index (SPRIT/PIC/HEAD family; SOLVED, see the
  // module doc comment). `{u8 blockId, u8 0, u32 BE subOffset}` per entry.
  //
  // This branch VALIDATES, which it did not until 2026-08-25. `body % 6 === 0` on its own is a
  // rubber stamp: it accepted all nine Amiga Pool of Radiance resources — a fourth, still
  // unsolved container format — as sub-frame indices, with sub-offsets as large as 4,245,164,308
  // inside a 270 KB file and 77 of 98 entries past EOF. The block branch above has always
  // validated by chaining on EOF; only this one did not, and a sniffer that cannot say no is not
  // a sniffer. The zero pad byte the comment above already documents is one of the checks — it
  // was described and then not used.
  //
  // Each of the three checks is perfect and two-sided across the whole Amiga corpus (14 genuine
  // index files vs the 9 Pool ones): pad byte zero 14/14 vs 0/9, non-decreasing offsets 14/14 vs
  // 0/9, offsets inside the file 14/14 vs 0/9. Worth recording which check is NOT here and why:
  // `toc[0].subOffset === 0` holds for 9/9 of the Pool files too, so it separates nothing.
  if (body % 6 === 0) {
    const n = body / 6;
    const toc: SubFrameToc[] = [];
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const off = 2 + i * 6;
      const pad = r.u8At(off + 1);
      if (pad !== 0) {
        throw new Error(`DAA: 6-byte index entry ${i}: pad byte is ${pad}, not 0`);
      }
      const subOffset = r.u32At(off + 2, false);
      if (subOffset < prev) {
        throw new Error(`DAA: 6-byte index entry ${i}: subOffset ${subOffset} goes backwards`);
      }
      if (dataBase + subOffset > r.length) {
        throw new Error(`DAA: 6-byte index entry ${i}: subOffset ${subOffset} lands past EOF`);
      }
      prev = subOffset;
      toc.push({ blockId: r.u8At(off), subOffset });
    }
    return { kind: 'index', dataBase, toc };
  }

  throw new Error(`DAA: word0=${word0} (body ${body}) not a multiple of 9 or 6`);
}

/**
 * The Amiga SPRIT/PIC/HEAD sub-frame's inner RLE (decoder = hunk 88 of the CoK Amiga
 * `game` 68000 executable, entry @ offset 12). This is a DIFFERENT signed-byte scheme
 * than the outer container's {@link signedByteRLE} — do not conflate them (their 0x80
 * opcode means something different in each):
 *
 *   read control byte c:
 *     c <= 0x7f          : copy next (c + 1) literal bytes
 *     c == 0x80          : no-op (emits nothing)
 *     0x81 <= c <= 0xff  : repeat next single byte ((256 - c) + 1) times
 *
 * Decodes until exactly `outBudget` output bytes have been produced (the final op may
 * overshoot by up to 127 bytes, mirroring the Python reference `rle_amiga_sprite`,
 * which never clips a completing op — the extra bytes are harmless slack that callers
 * ignore). Returns the produced bytes and the input position immediately after the
 * last consumed op, so a caller can resume decoding a following segment from the same
 * continuous compressed stream (see {@link decodeAmigaSubEntry}).
 */
function rleAmigaSprite(
  comp: Uint8Array,
  start: number,
  outBudget: number,
): { out: Uint8Array; pos: number } {
  const buf = new Uint8Array(outBudget + 256); // max single-op overshoot is 127 bytes
  let outLen = 0;
  let pos = start;
  while (outLen < outBudget) {
    if (pos >= comp.length) {
      throw new RangeError('rleAmigaSprite: ran out of input before reaching the output budget');
    }
    const c = comp[pos++];
    if (c <= 0x7f) {
      const n = c + 1; // literal run of n bytes
      if (pos + n > comp.length) throw new RangeError('rleAmigaSprite: literal run overruns input');
      buf.set(comp.subarray(pos, pos + n), outLen);
      pos += n;
      outLen += n;
    } else if (c === 0x80) {
      // no-op: emits nothing
    } else {
      const n = 0x100 - c + 1; // repeat run: 0x81..0xff -> 128..2 repeats
      if (pos >= comp.length) throw new RangeError('rleAmigaSprite: repeat run missing its byte');
      const b = comp[pos++];
      buf.fill(b, outLen, outLen + n);
      outLen += n;
    }
  }
  return { out: buf.subarray(0, outLen), pos };
}

/** Fixed-size portion of the decompressed sub-frame header (before the variable per-frame table). */
const SUBFRAME_HEADER_MIN = 75; // pixOff(1) + h/w8/x/y(8) + flag(1) + stored-frame-count(1) + palette(64)
/** Generous peek budget used only to read the fixed header fields (mirrors the Python reference). */
const SUBFRAME_PEEK_BUDGET = 96;
const SUBFRAME_PALETTE_OFFSET = 11;

/** One decoded 6-byte-index entry (header geometry + every stored frame). */
interface AmigaSubEntry {
  pixOff: number;
  height: number;
  widthDiv8: number;
  width: number;
  x: number;
  y: number;
  numDist: number;
  frames: IndexedImage[];
  tailLayout?: DaaSingleFrameTailLayout | DaaCokSpritTailLayout;
}

/**
 * Decode one 6-byte-index sub-block's compressed body (`comp`, the whole entry's compressed
 * stream) into its header geometry and every stored frame. Faithful port of the Python
 * reference `decode_amiga_subframe` (tools/subframe_decode.py): the header is decompressed
 * TWICE — once as a generous fixed-size peek to read the geometry fields (matching the Python
 * reference exactly), then again with the real `pixOff` budget so the running stream position
 * lands precisely on the first frame's planar bitmap — segments cannot be sliced out of a single
 * flat decode because a completing RLE op can straddle where a fixed-length slice would cut.
 * Throws on any implausible/truncated header or a frame segment that runs out of input (callers
 * catch this per-entry so one malformed sub-block doesn't fail the whole archive).
 */
function decodeAmigaSubEntry(comp: Uint8Array): AmigaSubEntry {
  const peek = rleAmigaSprite(comp, 0, SUBFRAME_PEEK_BUDGET).out;
  if (peek.byteLength < SUBFRAME_HEADER_MIN) {
    throw new Error('DAA sub-frame: header too short (not a 6-byte-index sprite block)');
  }
  const pv = new DataView(peek.buffer, peek.byteOffset, peek.byteLength);
  const pixOff = peek[0];
  const height = pv.getUint16(1, false);
  const widthDiv8 = pv.getUint16(3, false);
  const x = pv.getUint16(5, false);
  const y = pv.getUint16(7, false);
  const numDist = peek[10]; // frame count — offset 10, NOT 9 (an unused flag byte, always 0)
  // NOTE: `pixOff` is NOT bounded below by SUBFRAME_HEADER_MIN here — DoK sub-frames use a
  // smaller per-frame table than CoK's `75 + 2*numDist` (real DoK SPRIT1.DAA entries have pixOff
  // as low as 62), so the header segment can legitimately decode to fewer than 75 bytes before
  // any single-op overshoot. `readPalette` below still reads the fixed 64-byte/32-colour table at
  // its usual offset, which real files satisfy via that same overshoot slack (mirrors the Python
  // reference, which applies no lower bound on pix_off either — see decode_amiga_subframe).
  if (widthDiv8 === 0 || widthDiv8 > 64 || height === 0 || height > 256 || numDist > 16) {
    throw new Error('DAA sub-frame: implausible header geometry');
  }
  const width = widthDiv8 * 8;

  // Re-decode the header segment for real (exactly `pixOff` bytes) so the running stream
  // position lands on the first frame's planar bitmap.
  const hdrSeg = rleAmigaSprite(comp, 0, pixOff);
  const palette = readPalette(hdrSeg.out, SUBFRAME_PALETTE_OFFSET);

  const rowBytes = Math.floor((width + 15) / 16) * 2;
  const planeSize = rowBytes * height;
  const frameSize = planeSize * NUM_PLANES;

  const frames: IndexedImage[] = [];
  let pos = hdrSeg.pos;
  for (let f = 0; f < numDist; f++) {
    const seg = rleAmigaSprite(comp, pos, frameSize);
    pos = seg.pos;
    frames.push({
      width,
      height,
      indices: planarFrameToIndices(seg.out, width, height, 0),
      xOffset: x,
      yOffset: y,
      transparentIndex: null,
      palette,
      encoding: 'daa-subframe',
    });
  }
  return { pixOff, height, widthDiv8, width, x, y, numDist, frames };
}

// Bounded opt-in envelope: existing geometry ceiling (512x256), five planes,
// at most 256 header bytes, and one trailing byte. This is not a family claim.
const TAIL_HEADER_MAX = 256;
const TAIL_STREAM_MAX = (512 / 8) * 256 * NUM_PLANES + TAIL_HEADER_MAX + 1;
const COK_SPRIT_STREAM_MAX = 15_930;

/** Full-stream sprite RLE: retain runs crossing header/pixel boundaries; reject truncation. */
function rleAmigaSpriteFull(comp: Uint8Array, outputLimit = TAIL_STREAM_MAX): Uint8Array {
  const out = new Uint8Array(outputLimit);
  let pos = 0;
  let size = 0;
  while (pos < comp.length) {
    const c = comp[pos++];
    if (c === 0x80) continue;
    const n = c <= 0x7f ? c + 1 : 0x100 - c + 1;
    const inputSize = c <= 0x7f ? n : 1;
    if (pos + inputSize > comp.length) {
      throw new RangeError('DAA tail sub-frame: truncated sprite-RLE run');
    }
    if (size + n > outputLimit) {
      throw new RangeError('DAA tail sub-frame: decoded stream exceeds size limit');
    }
    if (c <= 0x7f) out.set(comp.subarray(pos, pos + n), size);
    else out.fill(comp[pos], size, size + n);
    size += n;
    pos += inputSize;
  }
  return out.slice(0, size);
}

/** CoK SPRIT1/2 candidate-verified 88x88 x3 tail layout with frame-zero XOR deltas. */
function decodeCokSpritTail(comp: Uint8Array): AmigaSubEntry {
  const raw = rleAmigaSpriteFull(comp, COK_SPRIT_STREAM_MAX);
  if (raw.length < SUBFRAME_HEADER_MIN) throw new Error('DAA CoK SPRIT tail: header too short');
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const pixOff = raw[0];
  const height = dv.getUint16(1, false);
  const widthDiv8 = dv.getUint16(3, false);
  const x = dv.getUint16(5, false);
  const y = dv.getUint16(7, false);
  const numDist = raw[10];
  if (pixOff !== 81 || height !== 88 || widthDiv8 !== 11 || numDist !== 3) {
    throw new Error(`DAA CoK SPRIT tail: expected pixOff 81 and 88x88 x3, got ${pixOff}/${widthDiv8 * 8}x${height} x${numDist}`);
  }

  const width = widthDiv8 * 8;
  const rowBytes = Math.ceil(width / 16) * 2;
  const planeSize = rowBytes * height;
  const planarByteLength = planeSize * NUM_PLANES;
  const frameStride = planarByteLength + 1;
  const bitmapStart = raw.length - numDist * frameStride;
  if (raw.length !== COK_SPRIT_STREAM_MAX || bitmapStart !== 87
      || bitmapStart < SUBFRAME_HEADER_MIN + 2 * numDist
      || bitmapStart + numDist * frameStride !== raw.length) {
    throw new Error('DAA CoK SPRIT tail: inconsistent decoded length/frame span');
  }
  for (let off = SUBFRAME_PALETTE_OFFSET; off < SUBFRAME_HEADER_MIN; off += 2) {
    if ((raw[off] & 0xf0) !== 0) throw new Error('DAA CoK SPRIT tail: palette word exceeds 12 bits');
  }
  const palette = readPalette(raw, SUBFRAME_PALETTE_OFFSET);
  const storedIndices: Uint8Array[] = [];
  const frames: IndexedImage[] = [];
  for (let frame = 0; frame < numDist; frame++) {
    const frameStart = bitmapStart + frame * frameStride;
    const indices = planarFrameToIndices(raw, width, height, frameStart);
    storedIndices.push(indices);
    const reconstructed = frame === 0
      ? indices
      : Uint8Array.from(indices, (value, pixel) => value ^ storedIndices[0]![pixel]!);
    frames.push({
      width,
      height,
      indices: reconstructed,
      xOffset: x,
      yOffset: y,
      transparentIndex: null,
      palette,
      encoding: 'daa-subframe',
    });
  }
  return {
    pixOff, height, widthDiv8, width, x, y, numDist, frames,
    tailLayout: {
      layout: 'cok-sprit-three-frame-tail-xor-v1',
      decodedStream: raw,
      bitmapStart,
      planarByteLength,
      frameStride,
      storedFrameCount: 3,
      xorBaseFrame: 0,
    },
  };
}

/** Corrected tail layout, deliberately restricted to one stored frame. */
function decodeAmigaSingleFrameTail(comp: Uint8Array): AmigaSubEntry {
  const raw = rleAmigaSpriteFull(comp);
  if (raw.length < SUBFRAME_HEADER_MIN) throw new Error('DAA tail sub-frame: header too short');
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const pixOff = raw[0];
  const height = dv.getUint16(1, false);
  const widthDiv8 = dv.getUint16(3, false);
  const x = dv.getUint16(5, false);
  const y = dv.getUint16(7, false);
  const numDist = raw[10];
  if (numDist !== 1) throw new Error('DAA tail sub-frame: requires exactly one stored frame');
  if (widthDiv8 === 0 || widthDiv8 > 64 || height === 0 || height > 256) {
    throw new Error('DAA tail sub-frame: implausible header geometry');
  }
  const width = widthDiv8 * 8;
  const frameSize = Math.ceil(width / 16) * 2 * height * NUM_PLANES;
  const start = raw.length - numDist * (frameSize + 1);
  if (start < SUBFRAME_HEADER_MIN + 2 * numDist || start > TAIL_HEADER_MAX) {
    throw new Error('DAA tail sub-frame: inconsistent header/frame span');
  }
  for (let off = SUBFRAME_PALETTE_OFFSET; off < SUBFRAME_HEADER_MIN; off += 2) {
    if ((raw[off] & 0xf0) !== 0) throw new Error('DAA tail sub-frame: palette word exceeds 12 bits');
  }
  const palette = readPalette(raw, SUBFRAME_PALETTE_OFFSET);
  const image: IndexedImage = {
    width,
    height,
    indices: planarFrameToIndices(raw, width, height, start),
    xOffset: x,
    yOffset: y,
    transparentIndex: null,
    palette,
    encoding: 'daa-subframe',
  };
  return {
    pixOff, height, widthDiv8, width, x, y, numDist, frames: [image],
    tailLayout: {
      layout: 'amiga-sprite-single-frame-tail-v1',
      decodedStream: raw,
      bitmapStart: start,
      planarByteLength: frameSize,
      frameStride: frameSize + 1,
    },
  };
}

/** Read the 32-color 12-bit Amiga palette at raw offset `off` (8 + 1 = 9). */
function readPalette(raw: Uint8Array, off: number): Palette {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let c = 0; c < PAL_COLORS; c++) {
    const v = dv.getUint16(off + c * 2, false); // big-endian 0x0RGB
    const r = ((v >> 8) & 0xf) * 17;
    const g = ((v >> 4) & 0xf) * 17;
    const b = (v & 0xf) * 17;
    colors[c] = { r, g, b };
  }
  return { colors, source: 'amiga-12bit', firstColor: 0, count: PAL_COLORS };
}

/**
 * Parse the frame header; returns geometry + palette + pixel offset, or null when
 * the block is not a renderable image frame (mirrors parse_frame_header).
 *
 * **Header byte 8 is `item_count`, not padding** (verified 2026-08-21). It is the same field the
 * DOS 17-byte header carries at the same offset, and the two platforms agree block for block:
 * for `8X8D1` ids 202/203/11/12/31/32/23 the DOS `item_count` reads 38/45/70/70/70/70/70 and the
 * Amiga byte 8 reads 38/45/70/70/70/70/70; for `DUNGCOM`/`WILDCOM`/`RANDCOM` block 1 both read
 * 25/35/6 (DoK's `WILDCOM` reads 45 on both). That is cross-platform identity, not a fit
 * heuristic — the DOS side publishes the answer for the same sparse block id.
 *
 * This function still accepts `item_count !== 1` rather than rejecting it the way DOS
 * `parseStandardFrame` does, because only one of the two multi-item families is solved:
 *
 *  - **8X8D strips are solved.** `count` tiles of 8×8, 4 planes, 1-byte stride, 32 bytes each,
 *    consuming the payload exactly (e.g. 70 × 32 = 2240 = `rawSize − 9`). {@link decodeDaa}
 *    routes them to {@link decodeDaaTileStrip} before reaching here.
 *  - **The 24×24 `*COM` combat backdrops are not.** Their `item_count` is known (above) but the
 *    per-item pixel layout is not: 5 planes at a 3-byte stride would be 360 bytes an item, which
 *    leaves 186 bytes unaccounted in `DUNGCOM`/`WILDCOM` and 66 in `RANDCOM`. Matching the Amiga
 *    item 0 structurally against the DOS render of the same block — best index mapping over all
 *    576 pixels, swept across every plausible start offset and both 4- and 5-plane readings —
 *    produced no peak: the best score is 0.776 against a **null of 0.608**, and it is flat across
 *    adjacent offsets rather than sharp, which is what a non-alignment looks like. So those
 *    blocks still surface only their first item, with a palette read out of pixel bytes. They are
 *    left as they were rather than nulled, but nothing here should be read as endorsing that
 *    render.
 */
function parseFrameHeader(
  raw: Uint8Array,
): { width: number; height: number; palette: Palette; pixOff: number } | null {
  if (raw.byteLength < FRAME_PIX_OFFSET) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = dv.getUint16(0, false);
  const widthDiv8 = dv.getUint16(2, false);
  // y_offset (4) and x_offset (6) are placement hints, unused for raster.
  if (widthDiv8 === 0 || height === 0 || widthDiv8 > 256 || height > 2048) {
    return null;
  }
  const width = widthDiv8 * 8;
  const rowBytes = Math.floor((width + 15) / 16) * 2; // word-aligned row stride
  const need = rowBytes * height * NUM_PLANES;
  if (raw.byteLength - FRAME_PIX_OFFSET < need) return null;
  const palette = readPalette(raw, 8 + 1);
  return { width, height, palette, pixOff: FRAME_PIX_OFFSET };
}

/**
 * Decode 5 contiguous (non-interleaved) bitplanes into a flat index buffer.
 * row_bytes is word-aligned; plane p occupies a contiguous [p*plane_size ...]
 * span (NOT the ILBM per-row interleave). LSB = plane 0.
 */
function planarFrameToIndices(
  raw: Uint8Array,
  width: number,
  height: number,
  pixOff: number,
): Uint8Array {
  const rowBytes = Math.floor((width + 15) / 16) * 2;
  const planeSize = rowBytes * height;
  const indices = new Uint8Array(width * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    const rbase = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const byteI = rbase + (x >> 3);
      const bit = 7 - (x & 7);
      let idx = 0;
      for (let p = 0; p < NUM_PLANES; p++) {
        const b = raw[pixOff + p * planeSize + byteI];
        idx |= ((b >> bit) & 1) << p;
      }
      indices[o++] = idx;
    }
  }
  return indices;
}

/**
 * CoK Amiga 8×8 tile strip (`8X8D*.DAA`) — SOLVED. Unlike the 32-colour 5-plane image
 * frames, these blocks pack N tiles side-by-side as a **4-plane contiguous strip** of a virtual
 * N·8-wide, 8-tall image, sharing the fixed **EGA-16** palette (no embedded palette — the first
 * 16 of the 32-colour `DUNGCOM`/`BORDER` palette, == standard IBM EGA). Header = 8-byte frame
 * header `{height=8, width_div8=1, …}` + 1 count byte (N), then 4 planes each `row_bytes·8` long
 * (`row_bytes = ceil(N·8/16)·2`, word-aligned). Plane 0 = LSB; MSB-first within each byte.
 *
 * Verified against the DOS `8X8D1.DAX` block-202 frame (the shape oracle): CoK's exploration
 * frame + moons live at the SAME tile indices as DOS (frame 20–25, moons 26–37), so the same
 * `COK_FRAME_LAYOUT` composes either platform — only the art/palette source changes. See
 * `docs/engine/research/amiga-8x8d-planeorder.md` and `docs/daa-format.md` §7.
 */
export function isDaaTileStrip(raw: Uint8Array): boolean {
  if (raw.byteLength < TILE_STRIP_PIX_OFFSET + 1) return false;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = dv.getUint16(0, false);
  const widthDiv8 = dv.getUint16(2, false);
  if (height !== TILE_PX || widthDiv8 !== 1) return false;
  const count = raw[8]!;
  if (count === 0) return false;
  const rowBytes = Math.ceil((count * TILE_PX) / 16) * 2;
  const need = TILE_PLANES * rowBytes * TILE_PX;
  return raw.byteLength - TILE_STRIP_PIX_OFFSET === need;
}

/**
 * Decode a CoK Amiga 8X8D block (decompressed `raw`) into its N 8×8 tiles. Returns EGA-16
 * IndexedImages with magenta (index 13) as the transparent key — matching the DOS `decode8x8dBlock`
 * output so either platform's tiles drop into the same compositor. Returns [] if `raw` is not a
 * tile strip. `opts.transparentMagenta` (default true) keys index 13 transparent.
 */
export function decodeDaaTileStrip(
  raw: Uint8Array,
  opts: { transparentMagenta?: boolean } = {},
): IndexedImage[] {
  if (!isDaaTileStrip(raw)) return [];
  const count = raw[8]!;
  const rowBytes = Math.ceil((count * TILE_PX) / 16) * 2;
  const planeSize = rowBytes * TILE_PX;
  const palette = makeEgaPalette();
  const transparentIndex = opts.transparentMagenta === false ? null : MAGENTA_KEY;
  const tiles: IndexedImage[] = [];
  for (let t = 0; t < count; t++) {
    const indices = new Uint8Array(TILE_PX * TILE_PX);
    let o = 0;
    for (let ty = 0; ty < TILE_PX; ty++) {
      const byteI = ty * rowBytes + t; // each tile is one byte-column wide (8 px)
      for (let tx = 0; tx < TILE_PX; tx++) {
        const bit = 7 - tx; // MSB = leftmost pixel
        let idx = 0;
        for (let p = 0; p < TILE_PLANES; p++) {
          const b = raw[TILE_STRIP_PIX_OFFSET + p * planeSize + byteI]!;
          idx |= ((b >> bit) & 1) << p; // plane 0 = LSB
        }
        indices[o++] = idx;
      }
    }
    tiles.push({
      width: TILE_PX,
      height: TILE_PX,
      indices,
      xOffset: 0,
      yOffset: 0,
      transparentIndex,
      palette,
      encoding: 'daa-tile4',
    });
  }
  return tiles;
}

/**
 * Amiga 24×24 combat-backdrop strip (`DUNGCOM` / `WILDCOM` / `RANDCOM`) — **SOLVED 2026-08-22**.
 *
 * These were the last unsolved Krynn graphics blocks. Every previous attempt swept a *per-item*
 * stride (5 planes × 3-byte rows = 360 bytes/item) and found nothing, because the items are not
 * stored per-item at all: exactly like the {@link decodeDaaTileStrip} 8X8D blocks, the whole set
 * is ONE virtual image `N·24` px wide and 24 px tall, and item `t` is the 24-px-wide **pixel
 * column band** `[t·24, t·24+24)` inside it. The row stride is therefore word-aligned across the
 * FULL strip (`ceil(N·24/16)·2`), not per item — which is why a per-item stride never divided
 * evenly and left an unexplained 186/66-byte residue.
 *
 * Layout: the ordinary 73-byte frame preamble ({@link FRAME_PIX_OFFSET} — 8-byte BE header
 * `{height=24, width_div8=3, y, x}`, item count at byte 8, 32-colour palette at byte 9), then 5
 * contiguous bitplanes of `rowBytes·24` each, then **2 trailing bytes** (purpose unknown; they
 * are after the pixels, so they do not affect decoding).
 *
 * The header's `width_div8=3` describes ONE item (24 px), not the strip — so `parseFrameHeader`
 * alone under-reads these blocks and must not be used for them.
 *
 * Verified against the DOS `.DAX` oracle, which ships the same sets as `N`×288-byte chunky 4bpp
 * items after a 17-byte header: decoding CoK and DoK `DUNGCOM` this way makes the Amiga index map
 * determine the DOS index map exactly (`1 - H(DOS|Amiga)/H(DOS)` = 1.0000, versus 0.19 for an
 * item-permuted null), and `WILDCOM`/`RANDCOM` score 0.918/0.898 where the Amiga art carries
 * detail EGA could not. A preamble sweep over 0..199 picks 73 uniquely: next-best is 0.1898.
 * See `docs/daa-format.md` §7d.
 */
export function isDaaComStrip(raw: Uint8Array): boolean {
  return comStripGeometry(raw) !== null;
}

function comStripGeometry(
  raw: Uint8Array,
): { count: number; rowBytes: number; planeSize: number } | null {
  if (raw.byteLength < FRAME_PIX_OFFSET + 1) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = dv.getUint16(0, false);
  const widthDiv8 = dv.getUint16(2, false);
  if (height !== COM_PX || widthDiv8 * 8 !== COM_PX) return null;
  const count = raw[8]!;
  if (count === 0) return null;
  const rowBytes = Math.ceil((count * COM_PX) / 16) * 2;
  const planeSize = rowBytes * COM_PX;
  // 2 trailing bytes follow the plane data in every shipped *COM block (CoK + DoK).
  const body = raw.byteLength - FRAME_PIX_OFFSET;
  if (body !== NUM_PLANES * planeSize + COM_TRAILER) return null;
  return { count, rowBytes, planeSize };
}

/**
 * Decode an Amiga `*COM` block (decompressed `raw`) into its N 24×24 combat backdrops, each
 * carrying the block's own embedded 32-colour palette. Returns [] if `raw` is not a `*COM` strip.
 */
export function decodeDaaComStrip(raw: Uint8Array): IndexedImage[] {
  const geo = comStripGeometry(raw);
  if (!geo) return [];
  const { count, rowBytes, planeSize } = geo;
  const palette = readPalette(raw, 8 + 1);
  const items: IndexedImage[] = [];
  for (let t = 0; t < count; t++) {
    const indices = new Uint8Array(COM_PX * COM_PX);
    let o = 0;
    for (let y = 0; y < COM_PX; y++) {
      const rowBase = y * rowBytes;
      for (let x = 0; x < COM_PX; x++) {
        const px = t * COM_PX + x; // item t is a pixel-column band of the shared strip
        const byteI = rowBase + (px >> 3);
        const bit = 7 - (px & 7); // MSB = leftmost pixel
        let idx = 0;
        for (let p = 0; p < NUM_PLANES; p++) {
          idx |= ((raw[FRAME_PIX_OFFSET + p * planeSize + byteI]! >> bit) & 1) << p;
        }
        indices[o++] = idx;
      }
    }
    items.push({
      width: COM_PX,
      height: COM_PX,
      indices,
      xOffset: 0,
      yOffset: 0,
      transparentIndex: null,
      palette,
      encoding: 'daa-planar5',
    });
  }
  return items;
}

/**
 * {@link decodeDaaComStrip} wrapped as a `TileSet`, so an Amiga combat-backdrop set drops into
 * the same tile plumbing the DOS `*COM.DAX` sets use.
 */
export function decodeDaaComBlock(raw: Uint8Array, name = ''): TileSet {
  const tiles = decodeDaaComStrip(raw);
  return { name, tileWidth: COM_PX, tileHeight: COM_PX, tiles, palette: tiles[0]?.palette ?? null };
}

/**
 * {@link decodeDaaTileStrip} wrapped as a `TileSet` (M9.S3) — the shape
 * `DungeonWallSources.decodeTileBlock` expects, so a per-dungeon `DungeonWalls` can be built from
 * Amiga 8X8D bytes via the SAME `loadDungeonWalls` WALLDEF-driven relocation logic the DOS side
 * uses (only the pixel source differs).
 */
export function decodeDaaTileBlock(
  raw: Uint8Array,
  name = '',
  opts: { transparentMagenta?: boolean } = {},
): TileSet {
  const tiles = decodeDaaTileStrip(raw, opts);
  return { name, tileWidth: TILE_PX, tileHeight: TILE_PX, tiles, palette: tiles[0]?.palette ?? null };
}

/**
 * DoK Amiga 8×8 tile block (`8x8d1.daa`) — a DIFFERENT sub-format from CoK's 4-plane strip
 * above: DoK packs its dungeon tiles as one or more **standard 5-plane frames** (the §3/§4
 * BIGPIC-style format, own embedded 32-colour palette — `docs/daa-format.md` §7c), each a
 * single row of N tiles (height 8, width `N*8`). `raw` may hold several such frames
 * back-to-back — DoK's 256-tile wall banks split into 64-tile chunks across 4 sparse block
 * ids (M9.S4 research) — so this walks the buffer frame-by-frame (each frame's own byte size
 * computed from its own header) and concatenates every frame's tiles into one flat list, in
 * buffer order. No known transparent-key index for DoK's own embedded palette (unlike CoK's
 * shared fixed EGA-16 table where magenta is always index 13) — `transparentIndex` defaults to
 * null (fully-opaque tiles). A caller that has independently established a transparent index for
 * this specific raw buffer (e.g. {@link combineDokWallChunkRaws}'s synthetic wall-bank frame,
 * whose transparency key is the DOS-13 background, relocated to Amiga slot 16 — see
 * {@link deriveDokWallColorMap}) can pass it via `opts.transparentIndex`.
 */
export function decodeDaaWideTileBlock(
  raw: Uint8Array,
  name = '',
  opts: { transparentIndex?: number | null } = {},
): TileSet {
  const transparentIndex = opts.transparentIndex ?? null;
  const tiles: IndexedImage[] = [];
  let palette: Palette | null = null;
  let offset = 0;
  while (offset < raw.byteLength) {
    const chunk = offset === 0 ? raw : raw.subarray(offset);
    const fr = parseFrameHeader(chunk);
    if (!fr || fr.height !== TILE_PX || fr.width % TILE_PX !== 0) break;
    const indices = planarFrameToIndices(chunk, fr.width, fr.height, fr.pixOff);
    const rowBytes = Math.floor((fr.width + 15) / 16) * 2;
    const frameBytes = fr.pixOff + rowBytes * fr.height * NUM_PLANES;
    palette = palette ?? fr.palette;
    const count = fr.width / TILE_PX;
    for (let t = 0; t < count; t++) {
      const tileIdx = new Uint8Array(TILE_PX * TILE_PX);
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          tileIdx[y * TILE_PX + x] = indices[y * fr.width + t * TILE_PX + x]!;
        }
      }
      tiles.push({
        width: TILE_PX,
        height: TILE_PX,
        indices: tileIdx,
        xOffset: 0,
        yOffset: 0,
        transparentIndex,
        palette: fr.palette,
        encoding: 'daa-planar5',
      });
    }
    if (frameBytes <= 0) break;
    offset += frameBytes;
  }
  return { name, tileWidth: TILE_PX, tileHeight: TILE_PX, tiles, palette };
}

/** DOS EGA index (0..15) → Amiga wall-bank palette index (0, or 16..31). */
export type DokWallColorMap = Readonly<Record<number, number>>;

/**
 * Derive the DOS EGA (0..15) → Amiga wall-bank colour-index map from a boot block's own embedded
 * palette (`8x8d1.daa` block 202 — 203 and 204 carry the identical relocation) — R1, 2026-09-03,
 * `docs/engine/research/dok-8x8d-amiga-format.md` §3. This corrects the 2026-09-02 finding that
 * DoK's wall-bank chunks (block ids 1/21/41/61 etc.) have "no colour source": their OWN embedded
 * palette really is all-zero, but the boot blocks in the SAME file carry a real, shared
 * relocation — slots 17..31 hold the sixteen EGA colours, matched here by EXACT RGB (never a
 * resolved-colour or shape comparison; port of `tools/dok_amiga_wallbank.py:derive_amiga_index_map`).
 *
 * Two slots are NOT recoverable by colour match and are pinned rather than derived:
 *  - DOS EGA 0 (black): Amiga slot 0 AND slot 16 both read (0,0,0) in this palette, so colour
 *    matching alone cannot tell them apart — slot 0 is the conventional background slot.
 *  - DOS EGA 13 (bright magenta, the DOS wall-bank transparency key): slot 16 ALSO reads
 *    (0,0,0) here (it is the Amiga transparency key, never resolved to a real colour, so its own
 *    palette entry can't identify it either). Its colour-derived candidate — slot 29, the
 *    genuine bright magenta (255,85,255) — is real but measured (2026-09-03) to never be the
 *    slot the wall banks actually draw with (Amiga index 16's per-tile pixel COUNT matches DOS
 *    EGA 13's exactly on bank 1 — 2596 vs 2596 — while slot 29 never appears in any wall tile),
 *    so 13 is pinned to 16, discarding the spurious colour-only match to 29.
 *
 * Throws unless the result is a bijection over all 16 EGA colours with every value in
 * `{0} ∪ {16..31}` — a decode/format regression, not a data question.
 */
export function deriveDokWallColorMap(paletteBlockRaw: Uint8Array): DokWallColorMap {
  const fr = parseFrameHeader(paletteBlockRaw);
  if (!fr) throw new Error('deriveDokWallColorMap: palette source is not a standard 5-plane frame');
  const key = (c: RGB) => `${c.r},${c.g},${c.b}`;
  const egaByKey = new Map<string, number>();
  EGA16.forEach((c, i) => egaByKey.set(key(c), i));

  const map: Record<number, number> = {};
  for (let slot = 17; slot <= 31; slot++) {
    const c = fr.palette.colors[slot];
    if (!c) continue;
    const ega = egaByKey.get(key(c));
    if (ega === undefined) continue;
    if (ega in map) {
      throw new Error(`deriveDokWallColorMap: EGA ${ega} matches both slot ${map[ega]} and ${slot}`);
    }
    map[ega] = slot;
  }
  delete map[13]; // discard the spurious colour-only match to slot 29 — see docblock
  map[0] = 0;
  map[13] = 16;

  const values = Object.values(map);
  if (Object.keys(map).length !== 16 || new Set(values).size !== 16) {
    throw new Error(`deriveDokWallColorMap: derived map is not a bijection over 16 EGA colours: ${JSON.stringify(map)}`);
  }
  for (const v of values) {
    if (v !== 0 && (v < 16 || v > 31)) {
      throw new Error(`deriveDokWallColorMap: value ${v} outside {0,16..31}`);
    }
  }
  return map;
}

/** DoK Amiga wall-bank chunking: 4 sparse block ids per 256-tile series, 64 tiles each. */
const WALL_CHUNK_TILES = 64;
const WALL_BANK_CHUNKS = 4;

/**
 * Reassemble DoK's 256-tile Amiga wall bank from its four sparse chunks (`8x8d1.daa` block ids
 * `id`, `id+20`, `id+40`, `id+60` — each a `512×8` = 64-tile standard 5-plane frame with an
 * ALL-ZERO embedded palette, see {@link deriveDokWallColorMap}'s docblock) into ONE synthetic
 * `2048×8` = 256-tile standard frame that {@link decodeDaaWideTileBlock} slices unchanged.
 *
 * `chunks` must be given in the order the caller wants reassembled — the natural DOS order
 * `[id, id+20, id+40, id+60]` reproduces the DOS bank almost exactly (measured 2026-09-03:
 * 1786/1792 tiles byte-identical across the 7 series under {@link deriveDokWallColorMap}; every
 * one of the other 23 chunk orders scores at most 128/256 on the series measured in full — see
 * `docs/engine/research/dok-8x8d-amiga-format.md` §3 and `tools/dok_amiga_wallbank.py`). This
 * function itself does not know or enforce an order — it only reassembles bytes, in the order
 * given, and never resolves a pixel to RGB.
 *
 * `paletteSource` supplies the 64-byte embedded palette copied verbatim into the synthetic
 * frame's header (bytes 9..72) — a boot block (202/203/204 all carry the identical relocation),
 * since the wall-bank chunks' own palette is all-zero and cannot supply one.
 */
export function combineDokWallChunkRaws(chunks: Uint8Array[], paletteSource: Uint8Array): Uint8Array {
  if (chunks.length !== WALL_BANK_CHUNKS) {
    throw new Error(`combineDokWallChunkRaws: expected ${WALL_BANK_CHUNKS} chunks, got ${chunks.length}`);
  }
  if (!parseFrameHeader(paletteSource)) {
    throw new Error('combineDokWallChunkRaws: paletteSource is not a standard 5-plane frame');
  }
  const chunkWidth = WALL_CHUNK_TILES * TILE_PX; // 512
  const chunkFrames = chunks.map((raw, i) => {
    const fr = parseFrameHeader(raw);
    if (!fr || fr.height !== TILE_PX || fr.width !== chunkWidth) {
      throw new Error(
        `combineDokWallChunkRaws: chunk ${i} is not a ${chunkWidth}x${TILE_PX} standard frame`,
      );
    }
    return { raw, pixOff: fr.pixOff };
  });

  const height = TILE_PX;
  const chunkRowBytes = Math.floor((chunkWidth + 15) / 16) * 2; // 64
  const width = WALL_BANK_CHUNKS * chunkWidth; // 2048
  const rowBytes = Math.floor((width + 15) / 16) * 2; // 256
  const planeSize = rowBytes * height; // 2048
  const pixel = new Uint8Array(NUM_PLANES * planeSize);

  for (let p = 0; p < NUM_PLANES; p++) {
    for (let y = 0; y < height; y++) {
      let destOff = p * planeSize + y * rowBytes;
      for (const { raw, pixOff } of chunkFrames) {
        const srcOff = pixOff + p * chunkRowBytes * height + y * chunkRowBytes;
        pixel.set(raw.subarray(srcOff, srcOff + chunkRowBytes), destOff);
        destOff += chunkRowBytes;
      }
    }
  }

  const out = new Uint8Array(FRAME_PIX_OFFSET + pixel.length);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint16(0, height, false);
  dv.setUint16(2, width / 8, false); // width_div8 = 256
  dv.setUint16(4, 0, false); // y_offset
  dv.setUint16(6, 0, false); // x_offset
  out[8] = 1; // pad byte (observed 0x01 in every real frame header)
  out.set(paletteSource.subarray(9, 9 + PAL_BYTES), 9);
  out.set(pixel, FRAME_PIX_OFFSET);
  return out;
}

/**
 * Decode a DAA container to the neutral model. 9-byte-TOC image blocks become
 * IndexedImages (with the per-frame 32-color palette). The 6-byte sub-frame index
 * variant (SPRIT/PIC/HEAD) is also decoded: each entry's compressed body is run
 * through the distinct inner Amiga sprite RLE in consecutive header+frame segments
 * (see {@link decodeAmigaSubEntry}). The first stored frame is placed into
 * `frameSet.frames` as a generic preview; every decoded frame is kept on the corresponding
 * `DaaSubFrame.frames`. Sequence semantics are not inferred by the decoder.
 */
export function decodeDaa(bytes: Uint8Array, name = '', options: DaaDecodeOptions = {}): DaaArchive {
  const r = new ByteReader(bytes);
  const parsed = parseContainer(r);
  const tailIds = new Set(options.singleFrameTailBlockIds);
  for (const id of tailIds) {
    if (!Number.isInteger(id) || id < 0 || id > 255) {
      throw new Error(`DAA: invalid single-frame tail block ID ${id}`);
    }
    if (parsed.kind !== 'index' || !parsed.toc.some((entry) => entry.blockId === id)) {
      throw new Error(`DAA: single-frame tail block ${id} not found in 6-byte index`);
    }
  }
  const cokSpritIds = new Set(options.cokSpritTailBlockIds);
  if (cokSpritIds.size !== (options.cokSpritTailBlockIds?.length ?? 0)) {
    throw new Error('DAA: duplicate CoK SPRIT tail block ID');
  }
  for (const id of cokSpritIds) {
    if (!Number.isInteger(id) || id < 0 || id > 255) {
      throw new Error(`DAA: invalid CoK SPRIT tail block ID ${id}`);
    }
    if (tailIds.has(id)) {
      throw new Error(`DAA: block ${id} cannot select both single-frame and CoK SPRIT tail layouts`);
    }
    if (parsed.kind !== 'index' || !parsed.toc.some((entry) => entry.blockId === id)) {
      throw new Error(`DAA: CoK SPRIT tail block ${id} not found in 6-byte index`);
    }
  }

  const frameSet: FrameSet = {
    name,
    frames: new Map<number, IndexedImage>(),
    kind: 'unknown',
  };

  if (parsed.kind === 'index') {
    const { dataBase, toc } = parsed;
    const subFrames: DaaSubFrame[] = [];
    for (let i = 0; i < toc.length; i++) {
      const start = dataBase + toc[i].subOffset;
      const end = i + 1 < toc.length ? dataBase + toc[i + 1].subOffset : r.length;
      const comp = end > start ? r.sliceAt(start, end - start) : new Uint8Array(0);
      let sf: DaaSubFrame;
      try {
        const d = tailIds.has(toc[i].blockId)
          ? decodeAmigaSingleFrameTail(comp)
          : cokSpritIds.has(toc[i].blockId)
            ? decodeCokSpritTail(comp)
            : decodeAmigaSubEntry(comp);
        sf = {
          index: i,
          blockId: toc[i].blockId,
          subOffset: toc[i].subOffset,
          pixOff: d.pixOff,
          height: d.height,
          widthDiv8: d.widthDiv8,
          width: d.width,
          x: d.x,
          y: d.y,
          numDist: d.numDist,
          frames: d.frames,
        };
        if (d.tailLayout !== undefined) sf.tailLayout = d.tailLayout;
      } catch (error) {
        if (tailIds.has(toc[i].blockId)) {
          throw new Error(`DAA: single-frame tail block ${toc[i].blockId} failed to decode`, { cause: error });
        }
        if (cokSpritIds.has(toc[i].blockId)) {
          throw new Error(`DAA: CoK SPRIT tail block ${toc[i].blockId} failed to decode`, { cause: error });
        }
        // Malformed/truncated sub-block. No real CoK/DoK file hits this (158/158 sub-blocks
        // decode; the once-suspected CPIC*/HEAD* files are really 9-byte-TOC containers that
        // route to 'blocks' above — see docs/daa-format.md §1b). Keep the entry with zero
        // decoded frames instead of failing the whole archive, mirroring how a DAX block
        // with an unrecognized header gets `image: null`.
        sf = {
          index: i,
          blockId: toc[i].blockId,
          subOffset: toc[i].subOffset,
          pixOff: 0,
          height: 0,
          widthDiv8: 0,
          width: 0,
          x: 0,
          y: 0,
          numDist: 0,
          frames: [],
        };
      }
      subFrames.push(sf);
      if (sf.frames.length > 0) {
        frameSet.frames.set(sf.blockId, sf.frames[0]);
      }
    }
    return { name, kind: 'index', dataBase, blocks: [], subFrames, frameSet };
  }

  const { dataBase, blocks } = parsed;
  for (const blk of blocks) {
    const start = dataBase + blk.dataOffset;
    const comp = r.sliceAt(start, blk.compSize);
    blk.raw = signedByteRLE(comp, blk.rawSize);

    // Multi-item 8X8D tile strip. This MUST run before parseFrameHeader, which ignores the
    // item count at header byte 8 and would take the strip's first tile-column as an 8x8 picture
    // while reading the next 64 bytes of tile pixels as its palette — surfacing 1 of up to 70
    // tiles, in invented colours. See the header note above `parseFrameHeader`.
    const tiles = decodeDaaTileStrip(blk.raw);
    if (tiles.length > 1) {
      blk.kind = 'tileset';
      blk.frames = tiles;
      blk.image = tiles[0]!;
      frameSet.frames.set(blk.blockId, tiles[0]!);
      continue;
    }

    // Multi-item 24x24 *COM combat-backdrop strip. Like the 8X8D case above this MUST run
    // before parseFrameHeader — the *COM header's width_div8=3 describes ONE item, so
    // parseFrameHeader "succeeds" on these blocks and hands back a 24x24 raster assembled from
    // five plane offsets that are all wrong, silently discarding the other N-1 backdrops.
    const backdrops = decodeDaaComStrip(blk.raw);
    if (backdrops.length > 1) {
      blk.kind = 'tileset';
      blk.frames = backdrops;
      blk.image = backdrops[0]!;
      frameSet.frames.set(blk.blockId, backdrops[0]!);
      continue;
    }

    const fr = parseFrameHeader(blk.raw);
    if (!fr) {
      blk.image = null;
      continue;
    }
    blk.kind = 'frame';
    const indices = planarFrameToIndices(blk.raw, fr.width, fr.height, fr.pixOff);
    blk.image = {
      width: fr.width,
      height: fr.height,
      indices,
      xOffset: 0,
      yOffset: 0,
      transparentIndex: null,
      palette: fr.palette,
      encoding: 'daa-planar5',
    };
    frameSet.frames.set(blk.blockId, blk.image);
  }

  return { name, kind: 'blocks', dataBase, blocks, subFrames: [], frameSet };
}
