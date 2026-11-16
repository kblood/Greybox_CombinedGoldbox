/**
 * HLIB writer (E1) tests — each encoder is the exact inverse of {@link decodeHlib}:
 *
 *  1) DATA library: pack raw members → decode → byte-identical members.
 *  2) TILE image round-trip: encode indexed images (method 16 AND 18) → decode → byte-identical pixels
 *     + palette slice.
 *  3) Real-file goldens (skipped when DQK data is absent):
 *     - GEO.GLB / ECL.GLB: decode → re-pack with encodeHlibDataLibrary → BYTE-IDENTICAL file (the
 *       faithful-repacker proof) + member-level round-trip.
 *     - BACK.TLB: decode a real image → re-encode (16 + 18) → re-decode → byte-identical pixels (the
 *       image encoder inverts the decoder on real VGA art).
 *     - SPRIT.TLB: every frame (93× method 23, 3× method 21) decode → re-encode with its own method →
 *       re-decode → pixel-identical; and every re-encoded method-23/21 BODY is byte-identical to the
 *       original chunk body (the method-23 encoder reproduces the original packer's exact stream,
 *       including the word-alignment pad). Header placement offsets also round-trip.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeHlib,
  sniffHlib,
  encodeHlibDataLibrary,
  encodeHlibImage,
  encodeHlibTile,
  type Palette,
} from '../src/index.js';

function ramp(n: number): Palette {
  const colors: ({ r: number; g: number; b: number } | null)[] = new Array(256).fill(null);
  for (let i = 0; i < n; i++) colors[i] = { r: i & 0xff, g: (i * 3) & 0xff, b: (255 - i) & 0xff };
  return { colors, source: 'hlib-range', firstColor: 0, count: n };
}

/** A deterministic indexed image with both flat runs and noise (so method-18 RLE is exercised). */
function makeImage(width: number, height: number): Uint8Array {
  const px = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Left third: a long flat run; middle: gradient; right: alternating (worst case for RLE).
      const v = x < width / 3 ? 7 : x < (2 * width) / 3 ? (x + y) & 0xff : (x & 1) ? 0 : 200;
      px[y * width + x] = v;
    }
  }
  return px;
}

describe('encodeHlibDataLibrary — raw member round-trip', () => {
  it('packs members the decoder reads back byte-identically', () => {
    const members = [
      Uint8Array.from([1, 2, 3, 4, 5]),
      Uint8Array.from([]),
      Uint8Array.from([0xff, 0x00, 0x10, 0x20, 0x30, 0x40, 0x50]),
      Uint8Array.from(Array.from({ length: 300 }, (_, i) => i & 0xff)),
    ];
    const bytes = encodeHlibDataLibrary(members, { tag: 'DATA', magic: 1 });
    expect(sniffHlib(bytes)).toBe(true);
    const arc = decodeHlib(bytes, 'SYN.GLB');
    expect(arc.nonImage).toBe(true);
    expect(arc.tag).toBe('DATA');
    expect(arc.rawMembers).toHaveLength(members.length);
    for (let i = 0; i < members.length; i++) {
      expect(Array.from(arc.rawMembers[i]), `member ${i}`).toEqual(Array.from(members[i]));
    }
  });
});

describe('encodeHlibTile — image round-trip (methods 16, 18, 21 & 23)', () => {
  for (const method of [16, 18, 21, 23]) {
    it(`encodes + decodes byte-identical pixels (method ${method})`, () => {
      const w = 16, h = 6;
      const imgs = [
        { width: w, height: h, indices: makeImage(w, h) },
        { width: 8, height: 3, indices: makeImage(8, 3) },
      ];
      const pal = ramp(64);
      const bytes = encodeHlibTile(imgs, pal, { method });
      expect(sniffHlib(bytes)).toBe(true);
      const arc = decodeHlib(bytes, 'SYN.TLB');
      expect(arc.tag).toBe('TILE');
      expect(arc.images).toHaveLength(imgs.length);
      for (let i = 0; i < imgs.length; i++) {
        const got = arc.images[i].image;
        expect(got.width).toBe(imgs[i].width);
        expect(got.height).toBe(imgs[i].height);
        expect(arc.images[i].drawMethod).toBe(method);
        expect(Array.from(got.indices), `image ${i} pixels`).toEqual(Array.from(imgs[i].indices));
      }
      // The shared colour table round-trips its defined slice.
      const p0 = arc.images[0].image.palette!;
      expect(p0.firstColor).toBe(0);
      expect(p0.count).toBe(64);
      expect(p0.colors[5]).toEqual({ r: 5, g: 15, b: 250 });
    });
  }

  it('method 21 carries 255 as the transparent key', () => {
    // A 4×2 image with two transparent (255) pixels and two coloured ones.
    const indices = Uint8Array.from([255, 3, 12, 255, 1, 2, 3, 4]);
    const bytes = encodeHlibTile([{ width: 4, height: 2, indices }], ramp(16), { method: 21 });
    const arc = decodeHlib(bytes, 'SYN21.TLB');
    expect(arc.images[0].drawMethod).toBe(21);
    expect(arc.images[0].image.transparentIndex).toBe(255);
    expect(Array.from(arc.images[0].image.indices)).toEqual(Array.from(indices));
  });

  it('method 23 carries 255 as the transparent key (interior + trailing transparency)', () => {
    // Row 0: interior transparent pixels (encoded as skips); row 1: a fully transparent row;
    // row 2: trailing transparency (dropped — the row terminator implies it).
    const indices = Uint8Array.from([
      255, 3, 255, 12, 9, 255, 255, 1,
      255, 255, 255, 255, 255, 255, 255, 255,
      2, 7, 255, 255, 255, 255, 255, 255,
    ]);
    const bytes = encodeHlibTile([{ width: 8, height: 3, indices }], ramp(16), { method: 23 });
    const arc = decodeHlib(bytes, 'SYN23.TLB');
    expect(arc.images[0].drawMethod).toBe(23);
    expect(arc.images[0].image.transparentIndex).toBe(255);
    expect(Array.from(arc.images[0].image.indices)).toEqual(Array.from(indices));
  });

  it('preserves screen-space placement through HLIB signed offsets', () => {
    const bytes = encodeHlibTile([
      { width: 4, height: 2, indices: makeImage(4, 2), xOffset: 24, yOffset: 69 },
    ], ramp(16));
    const image = decodeHlib(bytes, 'OFFSETS.TLB').images[0].image;
    expect(image.xOffset).toBe(24);
    expect(image.yOffset).toBe(69);
  });

  it('throws on a non-multiple-of-4 width', () => {
    expect(() => encodeHlibTile([{ width: 6, height: 2, indices: new Uint8Array(12) }], ramp(4))).toThrow();
  });

  it('throws on an unsupported draw method', () => {
    expect(() => encodeHlibTile([{ width: 4, height: 1, indices: new Uint8Array(4) }], ramp(4), { method: 99 })).toThrow(/draw method/);
  });
});

// --- Real-file goldens (skip when DQK data is absent) -------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const geoPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK3', 'GEO.GLB');
const eclPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK3', 'ECL.GLB');
const backPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK2', 'BACK.TLB');
const spritPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK2', 'SPRIT.TLB');

describe('encodeHlibDataLibrary — real .GLB faithful repack', () => {
  for (const [name, path] of [['GEO.GLB', geoPath], ['ECL.GLB', eclPath]] as const) {
    it.skipIf(!existsSync(path))(`re-packs ${name} byte-identically`, async () => {
      const orig = new Uint8Array(await readFile(path));
      const arc = decodeHlib(orig, name);
      expect(arc.nonImage).toBe(true);
      // Re-pack the exact member slices with the file's own tag + magic.
      const magic = orig[11];
      const repacked = encodeHlibDataLibrary(arc.rawMembers, { tag: arc.tag, magic });
      // Member-level round-trip always holds.
      const back = decodeHlib(repacked, name);
      expect(back.rawMembers).toHaveLength(arc.rawMembers.length);
      for (let i = 0; i < arc.rawMembers.length; i++) {
        expect(Array.from(back.rawMembers[i]), `${name} member ${i}`).toEqual(Array.from(arc.rawMembers[i]));
      }
      // Faithful-repacker proof: the bytes match the original file exactly.
      expect(repacked.byteLength).toBe(orig.byteLength);
      expect(Array.from(repacked)).toEqual(Array.from(orig));
    });
  }
});

describe('encodeHlibImage — real SPRIT.TLB method-23 round-trip', () => {
  it.skipIf(!existsSync(spritPath))(
    're-encodes every SPRIT.TLB frame losslessly; method-23/21 bodies are byte-identical to the originals',
    async () => {
      const bytes = new Uint8Array(await readFile(spritPath));
      const arc = decodeHlib(bytes, 'SPRIT');
      expect(arc.images).toHaveLength(96);

      // decodeHlib does not expose raw chunk slices, so walk the pointer tables here (same walk the
      // decoder does: outer master ptrs[1..] = leaf sets; a magic-1 leaf is ptr[0] id table + ptr[1]
      // colour table + ptr[2..] images, a magic-0 leaf is ptr[0] colour table + ptr[1..] images).
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const readPtrs = (base: number): { magic: number; ptrs: number[] } => {
        const count = dv.getUint16(base + 8, true) + 1;
        const ptrs: number[] = [];
        for (let i = 0; i < count; i++) ptrs.push(base + dv.getUint32(base + 16 + 4 * i, true));
        return { magic: bytes[base + 11], ptrs };
      };
      const chunks: { start: number; end: number }[] = [];
      const outer = readPtrs(0);
      for (let si = 1; si < outer.ptrs.length - 1; si++) {
        const leafBase = outer.ptrs[si];
        const leaf = readPtrs(leafBase);
        const firstImg = leaf.magic === 1 ? 2 : 1;
        for (let i = firstImg; i < leaf.ptrs.length - 1; i++) {
          chunks.push({ start: leaf.ptrs[i], end: leaf.ptrs[i + 1] });
        }
      }
      expect(chunks).toHaveLength(arc.images.length);

      const methodCounts = new Map<number, number>();
      let bodyIdentical = 0;
      for (let i = 0; i < arc.images.length; i++) {
        const m = arc.images[i];
        methodCounts.set(m.drawMethod, (methodCounts.get(m.drawMethod) ?? 0) + 1);
        const src = m.image;
        const re = encodeHlibImage(src, m.drawMethod);

        // 1) Pixel round-trip: re-decoding the re-encoded chunk reproduces the frame exactly.
        const tile = encodeHlibTile([{ width: src.width, height: src.height, indices: src.indices }], src.palette, { method: m.drawMethod });
        const back = decodeHlib(tile, 'SPRIT-RE');
        expect(back.images[0].drawMethod).toBe(m.drawMethod);
        expect(Array.from(back.images[0].image.indices), `frame ${i} pixels`).toEqual(Array.from(src.indices));

        // 2) Byte identity against the original file: the re-encoded BODY (after the 8-byte header)
        // matches the original chunk body exactly — including the one-byte word-alignment pad on
        // odd-length method-23 streams. All header fields, including signed placement offsets,
        // round-trip as well.
        const orig = bytes.subarray(chunks[i].start, chunks[i].end);
        expect(re[0], `frame ${i} height lo`).toBe(orig[0]);
        expect(re[1], `frame ${i} height hi`).toBe(orig[1]);
        expect(Array.from(re.subarray(2, 6)), `frame ${i} placement offsets`).toEqual(Array.from(orig.subarray(2, 6)));
        expect(re[6], `frame ${i} width/4`).toBe(orig[6]);
        expect(re[7], `frame ${i} method`).toBe(orig[7]);
        const sameBody = re.byteLength === orig.byteLength &&
          re.subarray(8).every((b, k) => b === orig[8 + k]);
        if (sameBody) bodyIdentical++;
        expect(sameBody, `frame ${i} (method ${m.drawMethod}) body byte-identical`).toBe(true);
      }
      // The real file mix: 93 compressed-transparent frames + 3 raw-transparent ones, all byte-exact.
      expect(methodCounts.get(23)).toBe(93);
      expect(methodCounts.get(21)).toBe(3);
      expect(bodyIdentical).toBe(96);
    },
  );
});

describe('encodeHlibTile — real VGA art round-trip', () => {
  it.skipIf(!existsSync(backPath))('re-encodes a real BACK.TLB image losslessly (methods 16 & 18)', async () => {
    const bytes = new Uint8Array(await readFile(backPath));
    const arc = decodeHlib(bytes, 'BACK');
    expect(arc.images.length).toBeGreaterThan(0);
    const src = arc.images[0].image;
    // Only opaque method-16/18 images round-trip pixel-exact; pick one whose width is %4 (always true).
    expect(src.width % 4).toBe(0);
    for (const method of [16, 18]) {
      const tile = encodeHlibTile([{ width: src.width, height: src.height, indices: src.indices }], src.palette, { method });
      const re = decodeHlib(tile, 'BACK-RE');
      const got = re.images[0].image;
      expect(got.width).toBe(src.width);
      expect(got.height).toBe(src.height);
      expect(Array.from(got.indices), `method ${method}`).toEqual(Array.from(src.indices));
    }
  });
});
