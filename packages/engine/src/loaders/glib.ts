/**
 * GLIB loader — Amiga DataLib graphics container (.TLB / .GLB), the big-endian
 * sibling of DOS HLIB (`loaders/hlib.ts`). Used by the Amiga ports of the
 * DataLib-era Gold Box games: Dark Queen of Krynn / Pools of Darkness
 * (5 bitplanes, 32 colours), Curse of the Azure Bonds / Secret of the Silver
 * Blades (4 bitplanes, 16 colours), Gateway/Treasures of the Savage Frontier
 * (mixed). Direct port of tools/glib_decode.py; see docs/glib-format.md.
 *
 * Container deltas vs HLIB: BIG-endian throughout; byte 10 of the header is a
 * file-level compression method (0 stored, 3 LZW, 5 LZ77 — both cracked from
 * the Amiga DQK 68000 executable); masters use tag "GLIB" (CoAB-era masters
 * say "HLIB" — engine drift); pixel data is PLANAR (Amiga MSB-first), not
 * chunky, except the 4-plane-era compressed-opaque method 0x02 which is
 * chunky 4bpp. Colour tables come in two shapes: cmagic 0xE8 / 104 bytes
 * (32 × 8-bit RGB, 5-plane era) and cmagic 0x08 / 56 bytes (16 × RGB, 4-plane
 * era; 8-byte header-only empties also occur); min(ncolors, capacity)
 * triplets load at index first_col (FRAME.TLB: colours 16..31).
 *
 * Drawing methods (dm >= 0xE0 → 5 planes; dm < 0xE0 → 4 planes):
 *   0xE0/0x00 raw opaque (contiguous planes), 0xE1/0x01 raw masked (mask
 *   plane first; mask bit 1 = TRANSPARENT / keep destination — proven
 *   corpus-wide, see the format doc), 0xE2/0xD2 RLE row-interleaved planar
 *   (5-/4-plane), 0x02 RLE chunky 4bpp, 0xE3/0x03 two-stream
 *   ctrl+per-plane-data masked (untouched pixels → 255).
 *   0x19 (image-id list) members are skipped.
 */
import type { FrameSet, IndexedImage, Palette, RGB } from '../model/index.js';
import { mergePalettes } from '../render/palette.js';

/** Transparent / key index convention (matches the 255 model convention). */
const TRANSPARENT = 255;

interface GlibHeader {
  fsize: number;
  /** Pointer count INCLUDING the trailing EOF sentinel. */
  count: number;
  /** File-level compression method (0 stored, 3 LZW, 5 LZ77). */
  method: number;
  magic: number;
  tag: string;
  /** Pointers relative to `base`. */
  ptrs: number[];
  base: number;
}

export interface GlibImageMember {
  /** Hierarchical label, e.g. "set01_img001" (master) or "img001" (leaf). */
  label: string;
  drawMethod: number;
  image: IndexedImage;
}

/**
 * One part of a drawing-method-`0x19` composite: "take the image at `sourcePtrIndex` in this same
 * leaf and put it at row `destY`, column `destX`". The big-endian twin of
 * {@link HlibCompositePart} in `loaders/hlib.ts`.
 */
export interface GlibCompositePart {
  sourcePtrIndex: number;
  destY: number;
  destX: number;
}

/**
 * A drawing-method-`0x19` "image-id list" slot — the Amiga counterpart of the DOS HLIB method-25
 * composite (`loaders/hlib.ts`'s {@link HlibComposite}, solved 2026-08-22 from `DQK.EXE`).
 *
 * **Where they are.** Across the whole never-vendored WHDLoad Amiga corpus (272 `.TLB`/`.GLB`
 * files, 171 of them GLIB-magic) exactly ONE file carries `0x19` records: Amiga DQK
 * `data/Disk3/FRAME.TLB`, with exactly 3 — against the DOS twin `DISK3/FRAME.TLB`'s 3. Before
 * this existed `decodeImage` returned null for them and `walkLeaf` filed the bytes under
 * `rawMembers`, i.e. "I could not read this".
 *
 * **Why big-endian.** Read big-endian, all three Amiga records reproduce the DOS `FRAME.TLB`
 * composites exactly — same part counts (15/8/6), same source pointer indices (47, 46×n, 45), the
 * same strictly-descending destY ladder (112,104,…,0 / 55,48,…,0 / 35,32,…,0) and the same lone
 * non-zero destX of 3 in the middle record. Little-endian reproduces none of them (28672, 26624,
 * … and destX 768), and its declared composite height of 30720 rows is outside anything the
 * container can hold. This DOS-twin comparison is the load-bearing evidence and is unchanged by
 * the correction below.
 *
 * CORRECTED 2026-09-05 (round 35 R3 was found defective on this point). The first pass of this
 * docblock — and the matching test — also reported the DOS height invariant
 * `max(destY) + height(source) === height(composite)` as holding 3/3 under BOTH byte orders, and
 * concluded the invariant is "structurally incapable" of discriminating endianness (a homogeneous,
 * scale-invariant relation, since every field in these three records is < 256). That 3/3-both-ways
 * result was manufactured: the little-endian arm ALSO byte-swapped `height(source)` — the height
 * of the part's source image, read from that image's own header elsewhere in the leaf. That value
 * is not a field of the `0x19` record at all, so swapping it is not "reading this record
 * little-endian"; it is an unrelated extra transform, and it is the only reason the two readings
 * agreed.
 *
 * Measured correctly — swapping only the two 16-bit fields the record actually stores (each part's
 * destY, and the composite's own declared height) and leaving the independently-sourced
 * `height(source)` alone — the invariant DOES discriminate: **BE 3/3, LE 0/3.** E.g. record 1
 * (declared height 120, destY ladder 112,104,…,0, source height 8): BE `112 + 8 = 120` ✓;
 * record-fields-only LE `swap16(112) + 8 = 28680` vs `swap16(120) = 30720` ✗. All three records
 * behave the same way (28680≠30720, 14088≠16128, 8968≠11008). So the height invariant was never
 * neutral evidence here — correctly computed, it independently corroborates the DOS-twin
 * comparison instead of failing to discriminate. The durable lesson: a null computed by
 * byte-swapping a value the format does not contain is not a null about the format.
 *
 * The composed image is rendered here rather than left to the caller, because a GLIB leaf may be
 * LZW/LZ77-compressed: the decompressed leaf buffer exists only inside this decoder, so a caller
 * holding the on-disk bytes could not resolve the part sources the way {@link renderHlibComposite}
 * lets an HLIB caller. {@link renderGlibComposite} is the pure function that does the work, and it
 * takes the decompressed leaf.
 *
 * Composites stay OUT of {@link GlibArchive.images} for the same reason they stay out of the HLIB
 * image list: positional walk indices downstream must not shift.
 */
export interface GlibComposite {
  /** Label prefix of the leaf holding this composite ("set03_", or "" for a bare TILE leaf). */
  leafLabel: string;
  /** Pointer index of the composite within that leaf. */
  ptrIndex: number;
  /** Declared height from the 8-byte header, big-endian. */
  height: number;
  /** Raw header byte +6. Recorded, not trusted — see {@link renderGlibComposite}. */
  widthByte: number;
  parts: GlibCompositePart[];
  /** Assembled image, or null when any part's source member failed to decode. */
  image: IndexedImage | null;
}

export interface GlibArchive {
  name: string;
  tag: string;
  /** Decoded image members (in walk order). */
  images: GlibImageMember[];
  /**
   * Drawing-method-`0x19` composite slots, parsed AND assembled. See {@link GlibComposite}.
   * Empty for every shipped container except Amiga DQK `Disk3/FRAME.TLB` (3).
   */
  composites: GlibComposite[];
  /** Images keyed by positional walk index. */
  frameSet: FrameSet;
  /**
   * Bytes this decoder did not turn into an image, exposed rather than dropped.
   *
   * For non-image containers (DATA/DIG8/TEXT member tags) that is the whole decompressed
   * directory. For an image-tagged container it is every region the walk refused: a set that
   * does not sniff as GLIB, a sub-leaf whose tag is not TILE, or a member whose drawing method
   * `decodeImage` does not implement.
   *
   * This is not hypothetical. Gateway to the Savage Frontier and Treasures of the Savage
   * Frontier tag 12 Amiga libraries of monster / item / GEO / script / text records with an
   * outer `GLIB` or `TILE` tag where every other title in the corpus uses `DATA`. Before this
   * field was populated, decoding those files returned `images: []` and `rawMembers: []` —
   * 437,680 of 439,671 member bytes (99.5%) gone with no diagnostic, against 326 of 7,477,009
   * bytes (0.004%) on the corpus's 140 genuine picture files. Non-empty `rawMembers` on a
   * container whose `nonImage` is false means exactly that: undecoded content is present.
   */
  rawMembers: Uint8Array[];
  /** True for a non-image library (DATA/DIG8/TEXT). */
  nonImage: boolean;
  /**
   * Count of frames whose palette assignment was refused by `guardPalette` — a frame decoded to
   * pixel indices past what the palette it was about to receive (in-file table OR a borrowed
   * `fallbackPalette`) actually covers, so it was left with `palette: null` instead. Diagnostic
   * only; 0 in the common case. See `packages/engine/test/glibPaletteFallback.test.ts` for the
   * measured real-vs-null-fallback counts this exists to make visible.
   */
  paletteGuardCount: number;
}

/** Cheap shape check: ASCII "GLIB" at offset 0. */
export function sniffGlib(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false;
  return (
    bytes[0] === 0x47 && // 'G'
    bytes[1] === 0x4c && // 'L'
    bytes[2] === 0x49 && // 'I'
    bytes[3] === 0x42 // 'B'
  );
}

function readHeader(bytes: Uint8Array, base = 0): GlibHeader {
  if (
    bytes[base] !== 0x47 ||
    bytes[base + 1] !== 0x4c ||
    bytes[base + 2] !== 0x49 ||
    bytes[base + 3] !== 0x42
  ) {
    throw new Error(`GLIB: bad signature at ${base}; not a GLIB container`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fsize = dv.getUint32(base + 4, false);
  const count = dv.getUint16(base + 8, false) + 1; // stored value is count-1
  const method = bytes[base + 10];
  const magic = bytes[base + 11];
  const tag = String.fromCharCode(
    bytes[base + 12],
    bytes[base + 13],
    bytes[base + 14],
    bytes[base + 15],
  );
  const ptrs: number[] = [];
  for (let i = 0; i < count; i++) {
    ptrs.push(dv.getUint32(base + 16 + 4 * i, false));
  }
  return { fsize, count, method, magic, tag, ptrs, base };
}

/* ------------------------------------------------------------------------- *
 * File-level decompression (methods 3 and 5), ported from tools/glib_decode
 * (originally cracked from the Amiga DQK executable, routines 0x4c372 [LZ77]
 * and 0x49198/0x49720/0x4912a/0x490ac [LZW]).
 * ------------------------------------------------------------------------- */

/** Method-5 LZ77 body: `src` starts at the sub-file's GLIB header. */
function decompress5(src: Uint8Array, total: number): Uint8Array {
  const out = new Uint8Array(total);
  let op = 0; // output write position
  let pos = 18; // 16-byte header + WORD in-place slack
  while (op < total) {
    chunk: for (;;) {
      const c = src[pos++];
      if (c < 0x80) {
        const d5 = src[pos++];
        const lit = (d5 >> 3) & 3;
        for (let i = 0; i < lit; i++) out[op++] = src[pos++];
        const dist = ((d5 << 2) & 0x380) | c;
        const n = (d5 & 7) + 3;
        let s = op - dist - 1;
        for (let i = 0; i < n; i++) out[op++] = out[s++];
      } else if (c < 0xc0) {
        const d5 = src[pos];
        const d6 = src[pos + 1];
        pos += 2;
        const lit = d6 & 3;
        for (let i = 0; i < lit; i++) out[op++] = src[pos++];
        const dist = ((d5 & 0xe0) << 1) | (c & 0x3f) | ((d6 << 7) & 0x7e00);
        const n = (d5 & 0x1f) + 3;
        let s = op - dist - 1;
        for (let i = 0; i < n; i++) out[op++] = out[s++];
      } else if (c < 0xe0) {
        let n = c & 0x0f;
        if (!(c & 0x10)) n = (n + 1) << 2;
        for (let i = 0; i < n; i++) out[op++] = src[pos++];
      } else {
        break chunk; // 0xE0.. = end of 0x2000-output chunk
      }
    }
  }
  return out;
}

/** Method-3 LZW body: 10-bit fixed-width codes with mark/sweep recycling. */
function decompress3(src: Uint8Array, total: number): Uint8Array {
  // Table state (exe 0x4912a init): codes 0..0xFF literal/permanent.
  const flag = new Uint8Array(0x402); // includes free-scan sentinel at 0x400
  flag.fill(0xff, 0, 0x100);
  const append = new Uint8Array(0x400);
  for (let i = 0; i < 0x100; i++) append[i] = i;
  const prefix = new Uint16Array(0x400).fill(0xffff);
  let nextCode = 0x100;

  const out = new Uint8Array(total + 0x1000); // slack: expansions may overshoot
  let op = 0;
  let pos = 18; // 16-byte header + WORD slack
  const stack: number[] = [];

  const expand = (code: number): number => {
    let c = code;
    while (c >= 0x100) {
      stack.push(append[c]);
      c = prefix[c];
    }
    out[op++] = c;
    const first = c;
    while (stack.length) out[op++] = stack.pop()!;
    return first;
  };

  const reclaim = (prev: number, curNext: number): number => {
    let freed = 0;
    let newMin = curNext;
    for (;;) {
      for (let c = 0x100; c < 0x400; c++) {
        const f = flag[c];
        if (f >= 0x80) {
          if (c !== prev) {
            flag[c] = 0;
            freed++;
            if (c < newMin) newMin = c;
          }
        } else if (f > 0) {
          flag[c] = 0xff; // recently used → demote
        }
      }
      for (let c = 0x100; c < 0x400; c++) {
        if (flag[c] !== 0) flag[prefix[c] & 0x3ff] = 1; // protect prefixes
      }
      if (freed >= 0x55) return newMin;
    }
  };

  while (op < total) {
    // One 0x2000-output chunk: fresh bit seed, PERSISTENT string table.
    const target = Math.min(op + 0x2000, total);
    let bitbuf = (src[pos] << 8) | src[pos + 1];
    pos += 2;
    let bits = 6;
    let prev = bitbuf >> 6;
    expand(prev);
    let nc = nextCode;
    while (op < target) {
      if (bits) {
        bitbuf = ((bitbuf << 8) & 0xffff) | src[pos++];
        bits -= 2;
      } else {
        bitbuf = (src[pos] << 8) | src[pos + 1];
        pos += 2;
        bits = 6;
      }
      const code = (bitbuf >> bits) & 0x3ff;
      const first = expand(code);
      if (nc >= 0x400) nc = reclaim(prev, nc);
      flag[prev] = 1;
      flag[nc] = 0xff;
      append[nc] = first;
      prefix[nc] = prev;
      let c = nc + 1;
      while (flag[c] !== 0) c++;
      nc = c;
      prev = code;
    }
    nextCode = nc;
  }
  return out.subarray(0, total);
}

/** Return the fully-decompressed bytes of the (sub-)file at `base`. */
function loadContainer(bytes: Uint8Array, base = 0): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fsize = dv.getUint32(base + 4, false);
  const method = bytes[base + 10];
  if (method === 0) return bytes.subarray(base, base + fsize);
  if (method !== 3 && method !== 5) {
    throw new Error(`GLIB: unsupported compression method ${method} at ${base}`);
  }
  const src = bytes.subarray(base);
  const body = method === 3 ? decompress3(src, fsize - 16) : decompress5(src, fsize - 16);
  const full = new Uint8Array(fsize);
  full.set(bytes.subarray(base, base + 16), 0);
  full.set(body, 16);
  return full;
}

/* ------------------------------------------------------------------------- *
 * Colour table + image decode
 * ------------------------------------------------------------------------- */

/**
 * Parse a GLIB colour table member. Two shapes exist: cmagic 0xE8 with 32
 * triplet slots (104 bytes, 5-plane era) and cmagic 0x08 with 16 slots
 * (56 bytes, 4-plane era) or none (8 bytes, header-only empty table). The
 * header is `{u16 cycle, u16 first_col, u16 ncolors, u8 nranges, u8 cmagic}`;
 * min(ncolors, capacity) triplets (all of them when ncolors == 0) load at
 * palette index first_col, merged over `base` (e.g. FRAME.TLB tables target
 * colours 16..31 only — matching their DOS HLIB twins member-for-member).
 * Returns null when the region is not a colour table.
 */
function readPalette(
  bytes: Uint8Array,
  off: number,
  size: number,
  base: Palette | null = null,
): Palette | null {
  if (size !== 8 && size !== 56 && size !== 104) return null;
  if (off + size > bytes.byteLength) return null;
  const cmagic = bytes[off + 7];
  if (cmagic !== 0x08 && cmagic !== 0xe8) return null;
  const firstCol = (bytes[off + 2] << 8) | bytes[off + 3];
  const ncolors = (bytes[off + 4] << 8) | bytes[off + 5];
  const capacity = (size - 8) / 3 | 0;
  const n = ncolors > 0 ? Math.min(ncolors, capacity) : capacity;
  if (firstCol + n > 256) return null;
  const colors: (RGB | null)[] = base
    ? base.colors.slice()
    : new Array(256).fill(null);
  let p = off + 8;
  for (let c = 0; c < n; c++) {
    colors[firstCol + c] = { r: bytes[p], g: bytes[p + 1], b: bytes[p + 2] };
    p += 3;
  }
  return { colors, source: 'glib-ctab', firstColor: firstCol, count: n };
}

/**
 * Stand-in palette for 4-plane (16-colour) sets that carry no colour-table
 * member. Many 4-plane sets DO ship a real 56-byte cmagic-0x08 table (all
 * Secret BIGPIC/PIC sets; CoAB ALWAYS/TITLE), absorbed automatically; sets
 * without one inherit the game-global ALWAYS.TLB palette at runtime — pass
 * it as `fallbackPalette` to decodeGlib, else this EGA stand-in applies.
 */
const EGA16: readonly (readonly [number, number, number])[] = [
  [0x00, 0x00, 0x00], [0x00, 0x00, 0xaa], [0x00, 0xaa, 0x00], [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00], [0xaa, 0x00, 0xaa], [0xaa, 0x55, 0x00], [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55], [0x55, 0x55, 0xff], [0x55, 0xff, 0x55], [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55], [0xff, 0x55, 0xff], [0xff, 0xff, 0x55], [0xff, 0xff, 0xff],
];

function ega16Palette(): Palette {
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < 16; i++) {
    const [r, g, b] = EGA16[i];
    colors[i] = { r, g, b };
  }
  return { colors, source: 'ega-fixed' };
}

/** PCX-style RLE shared by dm 2/0xE2 (same scheme as DOS HLIB method 18). */
function rle18(src: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen);
  let op = 0;
  let pos = 0;
  while (op < outLen && pos < src.byteLength) {
    const c = src[pos++];
    if (c < 128) {
      const n = Math.min(c + 1, outLen - op);
      out.set(src.subarray(pos, pos + n), op);
      op += n;
      pos += c + 1;
    } else {
      const v = src[pos++];
      const n = Math.min(257 - c, outLen - op);
      out.fill(v, op, op + n);
      op += n;
    }
  }
  return out;
}

/**
 * MSB-first planar → chunky. Where `mask` (h*wb bytes) bit is 0 the pixel
 * becomes 255 (transparent).
 */
function planesToChunky(
  planes: Uint8Array[],
  h: number,
  wb: number,
  mask: Uint8Array | null,
): Uint8Array {
  const w = wb * 8;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * wb;
    for (let x = 0; x < w; x++) {
      const byi = row + (x >> 3);
      const bit = 7 - (x & 7);
      if (mask && !((mask[byi] >> bit) & 1)) {
        px[y * w + x] = TRANSPARENT;
        continue;
      }
      let v = 0;
      for (let p = 0; p < planes.length; p++) {
        v |= ((planes[p][byi] >> bit) & 1) << p;
      }
      px[y * w + x] = v;
    }
  }
  return px;
}

/** dm 3 / 0xE3 two-stream decoder (exe 0x4ac4c). */
function decodeE3(
  body: Uint8Array,
  h: number,
  wb: number,
  nplanes: number,
): { planes: Uint8Array[]; mask: Uint8Array } | null {
  if (body.byteLength < 4) return null;
  const dataOff = (body[0] << 8) | body[1];
  const stride = (body[2] << 8) | body[3];
  if (4 + dataOff + nplanes * stride > body.byteLength) return null;
  const ctrl = body.subarray(4, 4 + dataOff);
  const planes: Uint8Array[] = [];
  const mask = new Uint8Array(h * wb);
  for (let p = 0; p < nplanes; p++) {
    const data = body.subarray(4 + dataOff + p * stride, 4 + dataOff + (p + 1) * stride);
    const plane = new Uint8Array(h * wb);
    let cp = 0;
    let dp = 0;
    for (let row = 0; row < h; row++) {
      let o = row * wb;
      for (;;) {
        if (cp >= ctrl.byteLength) return null;
        const op = ctrl[cp++];
        if (op === 0) break;
        const k = op & 0x3f;
        if (op < 0x40) {
          o += op; // skip (transparent)
        } else if (op < 0x80) {
          for (let i = 0; i < k; i++) {
            const m = ctrl[cp++];
            plane[o] = (plane[o] & (~m & 0xff)) | (data[dp] & m);
            mask[o] |= m;
            dp++;
            o++;
          }
        } else if (op < 0xc0) {
          const b = data[dp++];
          for (let i = 0; i < k; i++) {
            plane[o] = b;
            mask[o] = 0xff;
            o++;
          }
        } else {
          for (let i = 0; i < k; i++) {
            plane[o] = data[dp];
            mask[o] = 0xff;
            dp++;
            o++;
          }
        }
      }
    }
    planes.push(plane);
  }
  return { planes, mask };
}

/**
 * Decode one image member (header at `start`, bytes up to `end`) of a
 * DECOMPRESSED leaf. Returns null for id lists / unknown methods / placeholder
 * (header-only) members. 255 is the transparent key. Mirrors decode_image.
 */
function decodeImage(
  bytes: Uint8Array,
  start: number,
  end: number,
): { width: number; height: number; indices: Uint8Array; drawMethod: number } | null {
  if (end - start < 8) return null;
  const height = (bytes[start] << 8) | bytes[start + 1];
  // voff (start+2), hoff (start+4) are placement hints, unused for raster.
  const wb = bytes[start + 6];
  const dm = bytes[start + 7];
  if (height === 0 || wb === 0 || height > 2048 || wb > 128) return null;
  const nplanes = dm >= 0xe0 ? 5 : 4;
  const variant = dm >= 0xe0 ? dm & 0x1f : dm;
  const body = bytes.subarray(start + 8, end);
  const planeSz = height * wb;
  const width = wb * 8;

  if (variant === 0) {
    // raw opaque: contiguous planes
    if (body.byteLength < nplanes * planeSz) return null;
    const planes: Uint8Array[] = [];
    for (let p = 0; p < nplanes; p++) planes.push(body.subarray(p * planeSz, (p + 1) * planeSz));
    return { width, height, indices: planesToChunky(planes, height, wb, null), drawMethod: dm };
  }
  if (variant === 1) {
    // raw masked: MASK plane first, then colour planes. Mask polarity (proven
    // corpus-wide): bit 1 = transparent (keep destination), bit 0 = draw.
    // planesToChunky keys on bit 0 → pass the INVERTED mask plane.
    if (body.byteLength < (nplanes + 1) * planeSz) return null;
    const planes: Uint8Array[] = [];
    for (let p = 0; p < nplanes; p++) {
      planes.push(body.subarray((p + 1) * planeSz, (p + 2) * planeSz));
    }
    const inv = new Uint8Array(planeSz);
    for (let i = 0; i < planeSz; i++) inv[i] = ~body[i] & 0xff;
    return { width, height, indices: planesToChunky(planes, height, wb, inv), drawMethod: dm };
  }
  if (variant === 2 || dm === 0xd2) {
    const dec = rle18(body, nplanes * planeSz);
    if (nplanes === 5 || dm === 0xd2) {
      // 0xE2 / 0xD2: planar, ROW-INTERLEAVED (nplanes sub-rows per screen row)
      const planes: Uint8Array[] = [];
      for (let p = 0; p < nplanes; p++) planes.push(new Uint8Array(planeSz));
      for (let row = 0; row < height; row++) {
        for (let p = 0; p < nplanes; p++) {
          const o = (row * nplanes + p) * wb;
          planes[p].set(dec.subarray(o, o + wb), row * wb);
        }
      }
      return { width, height, indices: planesToChunky(planes, height, wb, null), drawMethod: dm };
    }
    // 4-plane era: CHUNKY 4bpp, high nibble = left pixel (the format's one
    // non-planar method; verified CoAB PIC + Secret BIGPIC)
    const px = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = y * (width >> 1);
      for (let x = 0; x < width; x++) {
        const b = dec[row + (x >> 1)];
        px[y * width + x] = (x & 1) === 0 ? (b >> 4) & 0xf : b & 0xf;
      }
    }
    return { width, height, indices: px, drawMethod: dm };
  }
  if (variant === 3) {
    const r = decodeE3(body, height, wb, nplanes);
    if (!r) return null;
    return {
      width,
      height,
      indices: planesToChunky(r.planes, height, wb, r.mask),
      drawMethod: dm,
    };
  }
  return null; // 0x19 image-id list and placeholders: skip
}

/* ------------------------------------------------------------------------- *
 * Leaf / master walking
 * ------------------------------------------------------------------------- */

function* iterLeafRegions(
  _full: Uint8Array,
  hdr: GlibHeader,
): Generator<{ index: number; start: number; end: number }> {
  const first = hdr.magic === 1 ? 1 : 0; // ptr[0] = image-id table when magic==1
  for (let i = first; i < hdr.ptrs.length - 1; i++) {
    yield { index: i, start: hdr.ptrs[i], end: hdr.ptrs[i + 1] };
  }
}

/** True when every recognisable image in the leaf uses a 4-plane method. */
function setIs4Plane(full: Uint8Array, hdr: GlibHeader): boolean {
  for (const r of iterLeafRegions(full, hdr)) {
    if (r.end - r.start >= 8 && !readPalette(full, r.start, r.end - r.start)) {
      const dm = full[r.start + 7];
      if (dm >= 0xe0) return false;
      if (dm <= 3 || dm === 0xd2) return true;
    }
  }
  return false;
}

function* iterLeafImages(
  full: Uint8Array,
  hdr: GlibHeader,
  fallbackPal: Palette | null,
): Generator<{ imgIndex: number; start: number; end: number; pal: Palette | null }> {
  let pal = fallbackPal;
  for (const r of iterLeafRegions(full, hdr)) {
    const p = readPalette(full, r.start, r.end - r.start, pal);
    if (p) {
      pal = p; // colour-table member: absorb (merged over current), don't yield
      continue;
    }
    yield { imgIndex: r.index, start: r.start, end: r.end, pal };
  }
}

interface WalkItem {
  label: string;
  image: IndexedImage;
  drawMethod: number;
}

/**
 * Effective palette capacity: the highest index this palette actually covers, plus one.
 * `glib-ctab` sources record how many colours their own table loaded (`count`, offset by
 * `firstColor`); the synthetic EGA stand-in records neither and is always exactly 16 slots.
 * Used to guard against handing a too-small BORROWED palette (a fallback sourced from a
 * different file, e.g. ALWAYS.TLB) to a frame whose decoded pixels need more slots than it has.
 */
function paletteCapacity(p: Palette): number {
  if (typeof p.count === 'number') return (p.firstColor ?? 0) + p.count;
  return 16; // ega16Palette(): fixed 16 slots, no count/firstColor recorded.
}

/**
 * Guard a palette assignment against the frame it is actually being given to: if the frame's
 * highest non-transparent index is outside what `pal` covers, the palette is wrong for this
 * frame specifically (even though it may be right for the leaf in general) and must not be
 * applied. Returns the palette unchanged when it fits, `null` when guarded, and increments
 * `guard.count` (a plain counter object, not a class, so callers needn't share module state)
 * so a caller can report how often this actually fires.
 */
function guardPalette(
  pal: Palette | null,
  indices: Uint8Array,
  guard?: { count: number },
): Palette | null {
  if (!pal) return pal;
  const cap = paletteCapacity(pal);
  let maxIdx = -1;
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (v !== TRANSPARENT && v > maxIdx) maxIdx = v;
  }
  if (maxIdx >= cap) {
    if (guard) guard.count++;
    return null;
  }
  return pal;
}

function buildImage(
  r: { width: number; height: number; indices: Uint8Array; drawMethod: number },
  pal: Palette | null,
): IndexedImage {
  // Both masked families key 255: two-stream (0xE3/0x03) pixels never touched
  // by the ctrl stream, and raw-masked (0xE1/0x01) pixels whose mask bit is 1
  // (mask polarity proven: 1 = transparent / keep destination).
  const variant = r.drawMethod >= 0xe0 ? r.drawMethod & 0x1f : r.drawMethod;
  return {
    width: r.width,
    height: r.height,
    indices: r.indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: variant === 1 || variant === 3 ? TRANSPARENT : null,
    palette: pal,
    encoding: `glib-method${r.drawMethod}`,
  };
}

/** Drawing method of a composite slot (hackdocs: "image-id list"); DOS HLIB spells it 25. */
const COMPOSITE_METHOD = 0x19;

/**
 * Parse a method-`0x19` composite region out of a DECOMPRESSED leaf. Big-endian, mirroring
 * `hlib.ts`'s `readComposite` field for field. Returns null when the payload is not a whole
 * 6-byte record list or when the per-record count byte disagrees with the derived count — the
 * same two structural gates the DOS reader applies, kept so a mis-sniffed region cannot become a
 * composite by accident.
 */
function readGlibComposite(
  full: Uint8Array,
  start: number,
  end: number,
  ptrIndex: number,
  leafLabel: string,
): Omit<GlibComposite, 'image'> | null {
  const body = end - start - 8;
  if (body <= 0 || body % 6 !== 0) return null;
  const dv = new DataView(full.buffer, full.byteOffset, full.byteLength);
  const n = body / 6;
  const parts: GlibCompositePart[] = [];
  for (let k = 0; k < n; k++) {
    const at = start + 8 + 6 * k;
    if (full[at + 1] !== n) return null; // byte 1 is the record count, repeated in every record
    parts.push({
      sourcePtrIndex: full[at]!,
      destY: dv.getUint16(at + 2, false),
      destX: dv.getUint16(at + 4, false),
    });
  }
  return {
    leafLabel,
    ptrIndex,
    height: dv.getUint16(start, false),
    widthByte: full[start + 6]!,
    parts,
  };
}

/**
 * Compose a method-`0x19` slot into a single image from its own DECOMPRESSED leaf.
 *
 * `leafBytes` must be the leaf buffer `loadContainer` produced (pointers are relative to its own
 * offset 0), NOT the on-disk file — a compressed leaf's members do not exist in the file bytes.
 * That is the one structural difference from {@link renderHlibComposite}; everything else is the
 * same routine: size the canvas from the parts (the header's byte +6 is not a width here — the
 * DOS disassembly showed the engine never reads it on this path), fill with the transparent key,
 * and blit each source at its own `destX`/`destY`.
 *
 * Returns null when any part's source cannot be decoded, rather than emitting a partial picture.
 */
export function renderGlibComposite(
  leafBytes: Uint8Array,
  composite: Omit<GlibComposite, 'image'>,
  palette: Palette | null = null,
): IndexedImage | null {
  let hdr: GlibHeader;
  try {
    hdr = readHeader(leafBytes, 0);
  } catch {
    return null;
  }
  const sources: {
    part: GlibCompositePart;
    img: NonNullable<ReturnType<typeof decodeImage>>;
  }[] = [];
  for (const part of composite.parts) {
    const i = part.sourcePtrIndex;
    if (i < 0 || i + 1 >= hdr.ptrs.length) return null;
    const img = decodeImage(leafBytes, hdr.ptrs[i], hdr.ptrs[i + 1]);
    if (!img) return null;
    sources.push({ part, img });
  }
  if (sources.length === 0) return null;

  const width = Math.max(...sources.map((s) => s.part.destX + s.img.width));
  const height = Math.max(composite.height, ...sources.map((s) => s.part.destY + s.img.height));
  if (width <= 0 || height <= 0 || width * height > 1 << 22) return null;

  const indices = new Uint8Array(width * height).fill(TRANSPARENT);
  for (const { part, img } of sources) {
    for (let y = 0; y < img.height; y++) {
      const dy = part.destY + y;
      if (dy < 0 || dy >= height) continue;
      for (let x = 0; x < img.width; x++) {
        const v = img.indices[y * img.width + x]!;
        if (v === TRANSPARENT) continue;
        const dx = part.destX + x;
        if (dx < 0 || dx >= width) continue;
        indices[dy * width + dx] = v;
      }
    }
  }
  return {
    width,
    height,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: TRANSPARENT,
    palette,
    encoding: 'glib-composite',
  };
}

/**
 * Walk one DECOMPRESSED leaf TILE.
 *
 * `fallbackPalette` (typically ALWAYS.TLB's colour table via `firstGlibPalette`) covers a
 * 4-plane (<=16 colour) set unconditionally — that was the only case this ever handled before
 * 2026-09 — and now ALSO covers a 5-plane (<=32 colour) set, but only when the fallback itself
 * has room for a 5-plane frame's full index range (>=32 colours): a 16-colour ALWAYS.TLB (Curse,
 * Secret) cannot correctly stand in for 5-plane art and must not be forced onto it, whereas a
 * 32-colour one (Gateway, Treasures, Pools, DQK) can. `guardPalette` is the second, per-frame
 * line of defence: even a nominally-sized fallback is refused for any individual frame whose
 * decoded pixels actually need more slots than it has.
 */
function* walkLeaf(
  full: Uint8Array,
  labelPrefix: string,
  fallbackPalette: Palette | null = null,
  undecoded?: Uint8Array[],
  guard?: { count: number },
  composites?: GlibComposite[],
): Generator<WalkItem> {
  const hdr = readHeader(full, 0);
  const is4 = setIs4Plane(full, hdr);
  const fallback = is4
    ? (fallbackPalette ?? ega16Palette())
    : fallbackPalette && paletteCapacity(fallbackPalette) >= 32
      ? fallbackPalette
      : null;
  let parsed: Omit<GlibComposite, 'image'> | null = null;
  for (const it of iterLeafImages(full, hdr, fallback)) {
    const r = decodeImage(full, it.start, it.end);
    if (r) {
      const pal = guardPalette(it.pal, r.indices, guard);
      yield {
        label: `${labelPrefix}img${String(it.imgIndex).padStart(3, '0')}`,
        image: buildImage(r, pal),
        drawMethod: r.drawMethod,
      };
    } else if (
      composites &&
      it.end - it.start >= 8 &&
      full[it.start + 7] === COMPOSITE_METHOD &&
      (parsed = readGlibComposite(full, it.start, it.end, it.imgIndex, labelPrefix))
    ) {
      // A method-0x19 image-id list: parsed and assembled into `composites` rather than filed
      // under `rawMembers`. It is deliberately NOT yielded as an image, so positional walk
      // indices downstream are unchanged (same contract as the DOS HLIB side).
      const raw = renderGlibComposite(full, parsed, null);
      const pal = raw ? guardPalette(it.pal, raw.indices, guard) : null;
      composites.push({ ...parsed, image: raw ? { ...raw, palette: pal } : null });
    } else {
      // A drawing method this decoder does not implement (unparseable 0x19 lists, placeholders).
      // Hand the bytes back rather than dropping them: `null` here used to mean "nothing was
      // here", which is not the same thing as "I could not read this".
      undecoded?.push(full.subarray(it.start, it.end));
    }
  }
}

/** Walk a whole GLIB file (raw on-disk bytes; decompression is internal). */
function* walk(
  bytes: Uint8Array,
  fallbackPalette: Palette | null = null,
  undecoded?: Uint8Array[],
  guard?: { count: number },
  composites?: GlibComposite[],
): Generator<WalkItem> {
  const hdr = readHeader(bytes, 0);
  if (hdr.tag === 'GLIB' || hdr.tag === 'HLIB') {
    // master: ptr[0]=set-id table (when magic==1), remaining pointers = sets,
    // each a self-contained (possibly compressed) leaf.
    const first = hdr.magic === 1 ? 1 : 0;
    for (let si = first; si < hdr.ptrs.length - 1; si++) {
      const setBase = hdr.ptrs[si];
      if (!sniffGlib(bytes.subarray(setBase, setBase + 16))) {
        // NOT an image set. Gateway and Treasures tag whole non-picture libraries
        // (monster/item/geo/script/text records) with an outer GLIB or TILE tag where every
        // other title uses DATA, so this gate fires on every member of those files. Expose the
        // bytes instead of discarding them silently.
        undecoded?.push(bytes.subarray(setBase, hdr.ptrs[si + 1]));
        continue;
      }
      const full = loadContainer(bytes, setBase);
      const sub = readHeader(full, 0);
      if (sub.tag !== 'TILE') {
        undecoded?.push(full);
        continue;
      }
      yield* walkLeaf(full, `set${String(si).padStart(2, '0')}_`, fallbackPalette, undecoded, guard, composites);
    }
  } else if (hdr.tag === 'TILE') {
    yield* walkLeaf(loadContainer(bytes, 0), '', fallbackPalette, undecoded, guard, composites);
  } else {
    throw new Error(`GLIB: unknown tag ${JSON.stringify(hdr.tag)}`);
  }
}

/**
 * Decode a GLIB container to the neutral model. Master "GLIB"/"HLIB" recurses
 * into its self-contained leaf sets (decompressing each as needed); leaf
 * "TILE" decodes its images directly. Non-image libraries (DATA/DIG8/TEXT)
 * are exposed as raw decompressed member slices, payload not decoded.
 * `fallbackPalette` overrides the EGA stand-in for 4-plane sets that carry no
 * colour table of their own (source it from the game's ALWAYS.TLB via
 * `firstGlibPalette`), and — since 2026-09, when it has room for a full 5-plane
 * index range (>=32 colours) — also stands in for a 5-plane set with no table of
 * its own. See `walkLeaf` for exactly which case applies which stand-in, and
 * `guardPalette` for the per-frame refusal that protects against a too-small one.
 * The refusal count is reported on the result as `paletteGuardCount`.
 */
export function decodeGlib(
  bytes: Uint8Array,
  name = '',
  fallbackPalette: Palette | null = null,
): GlibArchive {
  const hdr = readHeader(bytes, 0);

  const frameSet: FrameSet = {
    name,
    frames: new Map<number, IndexedImage>(),
    kind: 'unknown',
  };

  if (hdr.tag !== 'TILE' && hdr.tag !== 'GLIB' && hdr.tag !== 'HLIB') {
    // DATA / DIG8 / TEXT library: expose raw (decompressed) members.
    const full = loadContainer(bytes, 0);
    const h2 = readHeader(full, 0);
    const rawMembers: Uint8Array[] = [];
    for (const r of iterLeafRegions(full, h2)) {
      rawMembers.push(full.subarray(r.start, r.end));
    }
    return { name, tag: hdr.tag, images: [], frameSet, rawMembers, nonImage: true, paletteGuardCount: 0, composites: [] };
  }

  const images: GlibImageMember[] = [];
  const rawMembers: Uint8Array[] = [];
  const composites: GlibComposite[] = [];
  const guard = { count: 0 };
  let pos = 0;
  for (const item of walk(bytes, fallbackPalette, rawMembers, guard, composites)) {
    images.push({ label: item.label, drawMethod: item.drawMethod, image: item.image });
    frameSet.frames.set(pos++, item.image);
  }

  return {
    name,
    tag: hdr.tag,
    images,
    frameSet,
    rawMembers,
    nonImage: false,
    paletteGuardCount: guard.count,
    composites,
  };
}

/**
 * Return a GLIB master's image-id table — pointer 0's member when `magic === 1` — as raw bytes,
 * or null when the file carries none. `iterLeafRegions` deliberately skips this member (it holds
 * no image), but it is the file's own statement of which id each following set answers to, so a
 * caller mapping sets onto another platform's block ids needs it. Decoding its layout is the
 * caller's job (see `glibTileBank.readGlibIdTable`); this only locates the bytes.
 */
export function glibIdTable(bytes: Uint8Array): Uint8Array | null {
  const hdr = readHeader(bytes, 0);
  if (hdr.magic !== 1 || hdr.ptrs.length < 2) return null;
  const start = hdr.base + hdr.ptrs[0];
  const end = hdr.base + hdr.ptrs[1];
  if (end <= start || end > bytes.length) return null;
  return bytes.subarray(start, end);
}

/**
 * Return the first colour table found in a GLIB file (any leaf), or null.
 * Used to source a game-global palette for `decodeGlib`'s `fallbackPalette`
 * (e.g. CoAB/Secret ALWAYS.TLB, whose 56-byte cmagic-0x08 table holds the
 * real Amiga 16-colour game palette).
 */
export function firstGlibPalette(bytes: Uint8Array): Palette | null {
  const hdr = readHeader(bytes, 0);
  const bases: number[] = [];
  if (hdr.tag === 'GLIB' || hdr.tag === 'HLIB') {
    const first = hdr.magic === 1 ? 1 : 0;
    for (let si = first; si < hdr.ptrs.length - 1; si++) {
      if (sniffGlib(bytes.subarray(hdr.ptrs[si], hdr.ptrs[si] + 16))) bases.push(hdr.ptrs[si]);
    }
  } else if (hdr.tag === 'TILE') {
    bases.push(0);
  }
  for (const base of bases) {
    const full = loadContainer(bytes, base);
    const sub = readHeader(full, 0);
    for (const r of iterLeafRegions(full, sub)) {
      if (r.end - r.start <= 8) continue; // header-only empty tables
      const p = readPalette(full, r.start, r.end - r.start);
      if (p) return p;
    }
  }
  return null;
}

/**
 * Composite every leaf palette in this archive into one 256-colour palette
 * (see `mergePalettes`). 5-plane sets contribute their 32-colour tables;
 * 4-plane sets contribute the EGA stand-in. Empty/non-image archives yield an
 * all-null palette.
 */
export function compositeGlibPalette(archive: GlibArchive): Palette {
  return mergePalettes(...archive.images.map((m) => m.image.palette));
}
