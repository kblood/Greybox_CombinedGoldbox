/**
 * Pool of Radiance (Amiga, 1989) `.dax` loader — the 4th, distinct Amiga Gold Box
 * container generation (backwards bit-stream LZSS + XOR checksum, BE 10-byte TOC).
 * Direct port of `tools/pool_amiga_decode.py` (`parse_container`, `decompress`,
 * `planar_to_indices`, `parse_standard`, `parse_animated`, the five fixed palette
 * tables). See `docs/pool-amiga-format.md` for the full format writeup and the
 * disassembly evidence behind every constant below.
 *
 * Distinct from every other container this engine reads: DOS DAX (little-endian,
 * signed-byte RLE), Amiga `.DAA` (big-endian, 5 contiguous bitplanes, per-frame
 * embedded palette), and GLIB/HLIB (typed chunks). Pool-Amiga is big-endian like
 * DAA but uses 4 contiguous bitplanes, a distinct LZSS-family compressor (not the
 * shared signed-byte RLE), and carries NO palette in the file at all — palette
 * selection is a fixed per-context table baked into the executable (`program`
 * hunk 23), reproduced here as {@link poolAmigaPalette}.
 */
import type { FrameSet, IndexedImage, Palette, RGB } from '../model/index.js';
import { ByteReader } from '../util/ByteReader.js';

const ENTRY_SIZE = 10;
const NUM_PLANES = 4;

/** One decoded block from a Pool-Amiga `.dax` container. */
export interface PoolAmigaBlock {
  index: number;
  /** Sparse block id from the TOC (NOT a sequential index; matches the DOS block id for shared art). */
  blockId: number;
  /** Offset relative to the data section base. */
  dataOffset: number;
  compSize: number;
  rawSize: number;
  /** Decompressed bytes (post-LZSS, pre-frame-parse). */
  raw: Uint8Array;
  /** 'standard' = §3a fixed frame array, 'animated' = §3b pic/final/sprit delay array, 'data' = non-graphics (ecl/geo/item/...). */
  kind: 'standard' | 'animated' | 'data';
  /** First decoded frame, or null for a 'data' block. */
  image: IndexedImage | null;
  /** Every decoded frame in stored order, for multi-frame blocks (undefined for 'data'). */
  frames?: IndexedImage[];
}

export interface PoolAmigaArchive {
  name: string;
  dataBase: number;
  blocks: PoolAmigaBlock[];
  /** Images keyed by sparse blockId (first frame of each graphics block). */
  frameSet: FrameSet;
}

interface RawTocEntry {
  blockId: number;
  dataOffset: number;
  compSize: number;
  rawSize: number;
}

/**
 * Parse the 10-byte-TOC container. Validates the offset chain and requires the
 * last block to end EXACTLY at EOF (no slop) — mirrors `pool_amiga_decode.py`'s
 * `parse_container`, which is strict for the same reason DAA's 9-byte-TOC branch
 * is strict: a container sniffer that cannot say no is not a sniffer.
 */
function parseContainer(r: ByteReader): { dataBase: number; toc: RawTocEntry[] } {
  if (r.length < 12) throw new Error('Pool-Amiga: file too small');
  const word0 = r.u16At(0, false);
  if (word0 === 0 || word0 % ENTRY_SIZE !== 0) {
    throw new Error(`Pool-Amiga: word0=${word0} is not a multiple of ${ENTRY_SIZE}`);
  }
  const n = word0 / ENTRY_SIZE;
  const dataBase = 2 + word0;
  if (dataBase > r.length) throw new Error('Pool-Amiga: TOC exceeds file');
  const toc: RawTocEntry[] = [];
  let expectedOff = 0;
  for (let i = 0; i < n; i++) {
    const off = 2 + i * ENTRY_SIZE;
    const blockId = r.u16At(off, false);
    const dataOffset = r.u32At(off + 2, false);
    const compSize = r.u16At(off + 6, false);
    const rawSize = r.u16At(off + 8, false);
    if (dataOffset !== expectedOff) {
      throw new Error(`Pool-Amiga: entry ${i} offset ${dataOffset} does not chain (expected ${expectedOff})`);
    }
    expectedOff = dataOffset + compSize;
    toc.push({ blockId, dataOffset, compSize, rawSize });
  }
  if (dataBase + expectedOff !== r.length) {
    throw new Error(`Pool-Amiga: last block ends at ${dataBase + expectedOff}, file is ${r.length}`);
  }
  return { dataBase, toc };
}

/**
 * Cheap-but-real hintless sniff: the strict container chain above (word0 % 10 == 0,
 * offsets chain, last block ends exactly at EOF) plus an XOR-checksum verification
 * of the FIRST block's decompression. Measured against the alternative that this
 * structural shape also matches unrelated Gold Box containers: 0/57 false positives
 * across a sample of real DOS `.DAX` (Champions of Krynn, 20 files), DQK `.TLB`/`.GLB`
 * (20 files) and Amiga `.DAA` (CoK WHDLoad set, 17 files) — see
 * `docs/pool-amiga-format.md` "Manifest" section for the exact command. True-positive
 * rate on the real corpus: 23/23 Pool `.dax` files (checked before the checksum step
 * is even reached, since every one of them also decompresses cleanly).
 */
export function sniffPoolAmiga(bytes: Uint8Array): boolean {
  try {
    const r = new ByteReader(bytes);
    const { dataBase, toc } = parseContainer(r);
    if (toc.length === 0) return false;
    const first = toc[0]!;
    const comp = r.sliceAt(dataBase + first.dataOffset, first.compSize);
    decompress(comp, true);
    return true;
  } catch {
    return false;
  }
}

/**
 * The Pool-Amiga backwards bit-stream LZSS + XOR checksum ("Pool LZSS"), transcribed
 * from `program` hunk 27+0x7346 (see `pool_amiga_decode.py`'s `decompress` and
 * `docs/pool-amiga-format.md` §2 for the full bit-level derivation). 32-bit BE longs
 * are read from the END of `comp` backwards; the last long is `rawSize`, the second-
 * to-last is a running XOR checksum, and the rest are the bit buffer (LSB-first,
 * MSB-first field assembly, output written backwards). Throws if the checksum
 * residual is nonzero when `verify` is true (always true in this port; the Python
 * tool exposes `--verify` off only for exploratory dumps).
 */
function decompress(comp: Uint8Array, verify: boolean): Uint8Array {
  const dv = new DataView(comp.buffer, comp.byteOffset, comp.byteLength);
  let pos = comp.length;
  function rdlong(): number {
    pos -= 4;
    return dv.getUint32(pos, false);
  }

  const rawSize = rdlong();
  let checksum = rdlong();
  let bitBuf = rdlong();
  checksum = (checksum ^ bitBuf) >>> 0;

  function getBit(): number {
    let b = bitBuf & 1;
    bitBuf = bitBuf >>> 1;
    if (bitBuf === 0) {
      // sentinel exhausted: refill, the consumed bit is discarded per the reference
      const v = rdlong();
      checksum = (checksum ^ v) >>> 0;
      b = v & 1;
      bitBuf = (0x80000000 | (v >>> 1)) >>> 0;
    }
    return b;
  }
  function getBits(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | getBit();
    return v >>> 0;
  }

  const out = new Uint8Array(rawSize);
  let p = rawSize;
  while (p > 0) {
    if (getBit() === 0) {
      if (getBit() === 0) {
        // 00: short literal run
        const n = getBits(3) + 1;
        for (let i = 0; i < n; i++) {
          p -= 1;
          out[p] = getBits(8);
        }
      } else {
        // 01: 2-byte match
        const off = getBits(8);
        for (let i = 0; i < 2; i++) {
          p -= 1;
          out[p] = out[p + off]!;
        }
      }
    } else {
      const v = getBits(2);
      if (v === 3) {
        // 1 11: long literal run
        const n = getBits(8) + 9;
        for (let i = 0; i < n; i++) {
          p -= 1;
          out[p] = getBits(8);
        }
      } else if (v === 2) {
        // 1 10: long match (8-bit len, 12-bit offset)
        const length = getBits(8);
        const off = getBits(12);
        for (let i = 0; i <= length; i++) {
          p -= 1;
          out[p] = out[p + off]!;
        }
      } else {
        // 1 00 / 1 01: 3- or 4-byte match (9- or 10-bit offset)
        const off = getBits(9 + v);
        const n = v + 3;
        for (let i = 0; i < n; i++) {
          p -= 1;
          out[p] = out[p + off]!;
        }
      }
    }
  }
  if (verify && checksum !== 0) {
    throw new Error(`Pool-Amiga: XOR checksum residual 0x${checksum.toString(16)}`);
  }
  return out;
}

/**
 * 4 contiguous bitplanes, word-aligned rows, plane 0 = LSB, MSB-first pixels —
 * same conventions as DAA §4 but 4 planes instead of 5 (16 colors, not 32).
 */
function planarToIndices(pix: Uint8Array, w: number, h: number, planeSize: number): Uint8Array {
  const rowBytes = Math.ceil(w / 16) * 2;
  const idx = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const rowByteOff = y * rowBytes;
    for (let x = 0; x < w; x++) {
      let v = 0;
      const byteOff = rowByteOff + (x >> 3);
      const bit = 7 - (x & 7);
      for (let p = 0; p < NUM_PLANES; p++) {
        v |= ((pix[p * planeSize + byteOff]! >> bit) & 1) << p;
      }
      idx[y * w + x] = v;
    }
  }
  return idx;
}

interface StandardFrames {
  width: number;
  height: number;
  frameIndices: Uint8Array[];
}

/** §3a standard frame block -> geometry + one Uint8Array of indices per frame, or null. */
function parseStandard(raw: Uint8Array): StandardFrames | null {
  if (raw.length < 12) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const h = dv.getUint16(0, false);
  const w8 = dv.getUint16(2, false);
  const nf = dv.getUint16(8, false);
  const plane = dv.getUint16(10, false);
  if (h === 0 || w8 === 0 || nf === 0 || nf > 512 || h > 256 || w8 > 64) return null;
  const width = w8 * 8;
  const rowBytes = Math.ceil(width / 16) * 2;
  if (plane !== rowBytes * h) return null;
  if (12 + nf * NUM_PLANES * plane !== raw.length) return null;
  const frameIndices: Uint8Array[] = [];
  for (let f = 0; f < nf; f++) {
    const start = 12 + f * NUM_PLANES * plane;
    frameIndices.push(planarToIndices(raw.subarray(start), width, h, plane));
  }
  return { width, height: h, frameIndices };
}

interface AnimatedFrame {
  delay: number;
  width: number;
  height: number;
  indices: Uint8Array;
}

/** §3b pic/final/sprit animated block -> per-frame delay + geometry + indices, or null. */
function parseAnimated(raw: Uint8Array): AnimatedFrame[] | null {
  if (raw.length < 20) return null;
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const zero = dv.getUint16(0, false);
  const nf = dv.getUint16(2, false);
  if (zero !== 0 || nf === 0 || nf > 64) return null;
  let off = 4;
  const frames: AnimatedFrame[] = [];
  for (let i = 0; i < nf; i++) {
    if (off + 16 > raw.length) return null;
    const delay = dv.getUint32(off, false);
    const h = dv.getUint16(off + 4, false);
    const w8 = dv.getUint16(off + 6, false);
    const nsub = dv.getUint16(off + 12, false);
    const plane = dv.getUint16(off + 14, false);
    if (h === 0 || w8 === 0 || nsub !== 1 || h > 256 || w8 > 64) return null;
    const width = w8 * 8;
    const rowBytes = Math.ceil(width / 16) * 2;
    if (plane !== rowBytes * h || off + 16 + NUM_PLANES * plane > raw.length) return null;
    const indices = planarToIndices(raw.subarray(off + 16), width, h, plane);
    frames.push({ delay, width, height: h, indices });
    off += 16 + NUM_PLANES * plane;
  }
  if (off !== raw.length) return null;
  return frames;
}

// ---------------------------------------------------------------------------
// Palettes — no palette exists in any `.dax` file. `program` hunk 23 holds five
// fixed 16-color Amiga 12-bit (0x0RGB, scale x17) tables; see
// docs/pool-amiga-format.md §4 for the full per-context dispatch, traced by
// disassembling every caller of the five setter functions.
// ---------------------------------------------------------------------------

const PALETTES_RAW: Record<'dark' | 'combat' | 'pic' | 'alt', number[]> = {
  dark: [
    0x222, 0x06b, 0x096, 0x0aa, 0x000, 0x940, 0xb44, 0xfaa, 0xfe9, 0x59f, 0x0d8, 0x5ff, 0x555,
    0x777, 0xaaa, 0xfff,
  ],
  combat: [
    0x000, 0x06b, 0x096, 0x0aa, 0x000, 0x940, 0xb44, 0xfaa, 0xfe9, 0x59f, 0x0d8, 0x5ff, 0x555,
    0x777, 0xaaa, 0xfff,
  ],
  pic: [
    0x000, 0xdb9, 0xb97, 0x964, 0x521, 0x742, 0xa84, 0xcb6, 0xff9, 0x007, 0x44b, 0x444, 0x555,
    0x777, 0xaaa, 0xfff,
  ],
  alt: [
    0x000, 0x124, 0x953, 0xb97, 0xecb, 0x710, 0xa42, 0xdb0, 0xff5, 0x074, 0x053, 0x369, 0x555,
    0x777, 0xaaa, 0xfff,
  ],
};

/** `combat2` (+0x60 in hunk 23) is byte-identical to `combat` (+0x20) — see format doc §4. */
export type PoolAmigaPaletteName = 'dark' | 'combat' | 'pic' | 'alt' | 'combat2';

function amiga12BitToRgb(word: number): RGB {
  return { r: ((word >> 8) & 0xf) * 17, g: ((word >> 4) & 0xf) * 17, b: (word & 0xf) * 17 };
}

/**
 * Build one of the five fixed 16-color palettes. Reuses the `amiga-12bit` palette
 * source tag (shared with `.DAA`, `loaders/daa.ts`) since the color model is
 * identical (Amiga 12-bit RGB, x17 scale) — the only difference is provenance
 * (a fixed executable table here, vs. a per-frame embedded table in DAA), which
 * does not warrant a new `PaletteSource` variant in the shared model.
 */
export function poolAmigaPalette(name: PoolAmigaPaletteName): Palette {
  const key = name === 'combat2' ? 'combat' : name;
  const raw = PALETTES_RAW[key];
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < raw.length; i++) colors[i] = amiga12BitToRgb(raw[i]!);
  return { colors, source: 'amiga-12bit', firstColor: 0, count: raw.length };
}

/** Files whose engine display context installs the `pic` palette (docs §4/§4a). */
const PIC_FILES = new Set(['pic', 'final', 'bacpac', 'head', 'body']);

/**
 * Palette auto-selection from a filename stem, mirroring `pool_amiga_decode.py`'s
 * `--pal` default: `pic` for pic/final/bacpac/head/body, `combat` otherwise. This is
 * a coarse per-FILE approximation of the engine's real per-SCREEN dispatch (some
 * `pic.dax` blocks — 1, 29 — actually render under `alt`; see docs §4) — good enough
 * for a generic asset browser, not a claim of matching the game's live palette swaps
 * frame-for-frame.
 */
export function poolAmigaPaletteForStem(stem: string): PoolAmigaPaletteName {
  const base = stem.toLowerCase().replace(/[0-9]+$/, '');
  return PIC_FILES.has(base) ? 'pic' : 'combat';
}

function makeImage(width: number, height: number, indices: Uint8Array, palette: Palette): IndexedImage {
  return {
    width,
    height,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette,
    encoding: 'pool-amiga-planar4',
  };
}

/**
 * Decode a Pool-Amiga `.dax` container to the neutral model. `kind: 'standard'`
 * blocks (cpic/icon/cbody/chead/comspr/head/body/8x8d/dungcom/bacpac/wildcom/
 * randcom/sqrpaci) and `kind: 'animated'` blocks (pic/final/sprit) both decode to
 * one or more `IndexedImage`s; everything else (ecl/geo/item/moncha/monitm/monspc/
 * walldef) is `kind: 'data'` with `image: null`, matching how the DAX/DAA loaders
 * leave non-graphics or unrecognized blocks.
 */
export function decodePoolAmiga(bytes: Uint8Array, name = ''): PoolAmigaArchive {
  const r = new ByteReader(bytes);
  const { dataBase, toc } = parseContainer(r);

  const stem = (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, '');
  const palette = poolAmigaPalette(poolAmigaPaletteForStem(stem));

  const frameSet: FrameSet = { name, frames: new Map<number, IndexedImage>(), kind: 'unknown' };
  const blocks: PoolAmigaBlock[] = [];

  toc.forEach((t, i) => {
    const comp = r.sliceAt(dataBase + t.dataOffset, t.compSize);
    const raw = decompress(comp, true);
    if (raw.length !== t.rawSize) {
      throw new Error(`Pool-Amiga: block ${t.blockId} raw ${raw.length} != TOC ${t.rawSize}`);
    }
    const block: PoolAmigaBlock = {
      index: i,
      blockId: t.blockId,
      dataOffset: t.dataOffset,
      compSize: t.compSize,
      rawSize: t.rawSize,
      raw,
      kind: 'data',
      image: null,
    };

    const std = parseStandard(raw);
    if (std) {
      block.kind = 'standard';
      block.frames = std.frameIndices.map((indices) => makeImage(std.width, std.height, indices, palette));
      block.image = block.frames[0]!;
      frameSet.frames.set(t.blockId, block.image);
    } else {
      const anim = parseAnimated(raw);
      if (anim) {
        block.kind = 'animated';
        block.frames = anim.map((f) => makeImage(f.width, f.height, f.indices, palette));
        block.image = block.frames[0]!;
        frameSet.frames.set(t.blockId, block.image);
      }
    }
    blocks.push(block);
  });

  return { name, dataBase, blocks, frameSet };
}
