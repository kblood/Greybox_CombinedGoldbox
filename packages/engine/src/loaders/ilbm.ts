/**
 * ILBM loader — standard IFF interleaved-bitmap (.LBM) title/text screens used by
 * the Amiga games. Direct port of read_lbm in tools/daa_decode.py.
 *
 * BIG-ENDIAN IFF: FORM....ILBM, chunks BMHD (w,h,planes,masking,compression),
 * CMAP (3 bytes/color, already 8-bit), BODY (compression 0=raw, 1=ByteRun1).
 *
 * Crucially the planar pixels are PER-ROW INTERLEAVED (plane 0 row, plane 1 row,
 * ... then the next scanline) — the OPPOSITE of DAA's contiguous bitplanes. A mask
 * plane (masking==1) adds one extra plane per row that is skipped for the index.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

export interface IlbmImage {
  width: number;
  height: number;
  planes: number;
  /** 1 = ByteRun1, 0 = uncompressed. */
  compression: number;
  image: IndexedImage;
  palette: Palette;
}

/** Cheap shape check: IFF FORM....ILBM container. */
export function sniffIlbm(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  return (
    bytes[0] === 0x46 && // 'F'
    bytes[1] === 0x4f && // 'O'
    bytes[2] === 0x52 && // 'R'
    bytes[3] === 0x4d && // 'M'
    bytes[8] === 0x49 && // 'I'
    bytes[9] === 0x4c && // 'L'
    bytes[10] === 0x42 && // 'B'
    bytes[11] === 0x4d // 'M'
  );
}

function fourcc(bytes: Uint8Array, off: number): string {
  return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

/**
 * Decode an IFF ILBM to a single IndexedImage + Palette. ByteRun1 is decoded over
 * the whole BODY (per the Python oracle), then deinterleaved per-row. Mirrors
 * read_lbm exactly, including out-of-palette indices falling back to black.
 */
export function decodeIlbm(bytes: Uint8Array, name = ''): IlbmImage {
  if (!sniffIlbm(bytes)) throw new Error('ILBM: not an IFF ILBM');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let off = 12;
  let bmhd: Uint8Array | null = null;
  let cmap: Uint8Array | null = null;
  let body: Uint8Array | null = null;
  while (off + 8 <= bytes.byteLength) {
    const cid = fourcc(bytes, off);
    const csz = dv.getUint32(off + 4, false);
    const payload = bytes.subarray(off + 8, off + 8 + csz);
    if (cid === 'BMHD') bmhd = payload;
    else if (cid === 'CMAP') cmap = payload;
    else if (cid === 'BODY') body = payload;
    off += 8 + csz + (csz & 1); // chunks are word-aligned
  }
  if (!bmhd) throw new Error('ILBM: missing BMHD');
  if (!cmap) throw new Error('ILBM: missing CMAP');
  if (!body) throw new Error('ILBM: missing BODY');

  const bdv = new DataView(bmhd.buffer, bmhd.byteOffset, bmhd.byteLength);
  const w = bdv.getUint16(0, false);
  const h = bdv.getUint16(2, false);
  // skip x (4), y (6) as signed int16 origin
  const nplanes = bmhd[8];
  const masking = bmhd[9];
  const compression = bmhd[10];

  // Palette: 3 bytes/color, already 0..255.
  const ncolors = Math.floor(cmap.byteLength / 3);
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < ncolors; i++) {
    colors[i] = { r: cmap[i * 3], g: cmap[i * 3 + 1], b: cmap[i * 3 + 2] };
  }
  const palette: Palette = {
    colors,
    source: 'iff-cmap',
    firstColor: 0,
    count: ncolors,
  };

  // ByteRun1 decompress (whole body), or use raw.
  let decoded: Uint8Array = body;
  if (compression === 1) {
    const out: number[] = [];
    let i = 0;
    const n = body.byteLength;
    while (i < n) {
      const ctrl = body[i++];
      if (ctrl < 128) {
        const cnt = ctrl + 1;
        for (let k = 0; k < cnt && i < n; k++) out.push(body[i++]);
      } else if (ctrl > 128) {
        const cnt = 257 - ctrl;
        const v = i < n ? body[i++] : 0;
        for (let k = 0; k < cnt; k++) out.push(v);
      }
      // ctrl === 128 -> noop
    }
    decoded = Uint8Array.from(out);
  }

  const rowBytes = Math.floor((w + 15) / 16) * 2;
  const totalPlanes = nplanes + (masking === 1 ? 1 : 0);
  const indices = new Uint8Array(w * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const rbase = y * rowBytes * totalPlanes; // per-row interleaved planes
    for (let x = 0; x < w; x++) {
      const byteI = x >> 3;
      const bit = 7 - (x & 7);
      let idx = 0;
      for (let p = 0; p < nplanes; p++) {
        const b = decoded[rbase + p * rowBytes + byteI];
        idx |= ((b >> bit) & 1) << p;
      }
      indices[o++] = idx;
    }
  }

  const image: IndexedImage = {
    width: w,
    height: h,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette,
    encoding: 'ilbm',
  };
  void name;
  return { width: w, height: h, planes: nplanes, compression, image, palette };
}
