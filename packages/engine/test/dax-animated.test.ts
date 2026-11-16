/**
 * DAX animated multi-frame picture tests (the former "complex" variant, now decoded —
 * see docs/engine/research/dax-complex-subframe.md §B).
 *
 * 1) Synthetic: a hand-built 2-frame block decodes to the right dimensions, and the
 *    PIC-style XOR-delta path reconstructs frame 1 from frame 0.
 * 2) Golden: real CoK SPRIT1.DAX decodes its monster blocks to the documented three
 *    view-sizes (skips cleanly when game data is absent).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDax } from '../src/loaders/dax.js';

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

/** Build a minimal DAX container holding one block of `body` bytes (id 1). */
function daxWithBlock(body: number[]): Uint8Array {
  // One 9-byte TOC entry: id=1, dataOffset=0, rawSize=len, compSize=len (store raw, no RLE
  // run that changes length — use a literal-copy RLE: positive count blocks copy verbatim).
  // signedByteRLE: a leading count byte 0..127 means "copy next (count+1) bytes". We chunk
  // body into ≤128-byte literal runs.
  const comp: number[] = [];
  for (let i = 0; i < body.length; i += 128) {
    const chunk = body.slice(i, i + 128);
    comp.push(chunk.length - 1, ...chunk);
  }
  const tocBytes = 9;
  const header = [...u16(tocBytes)];
  const entry = [1, ...u16le32(0), ...u16(body.length), ...u16(comp.length)];
  return new Uint8Array([...header, ...entry, ...comp]);
}
const u16le32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];

/** A per-frame 21-byte header for the animated format. */
function frameHeader(height: number, width8: number, x = 0, y = 0): number[] {
  return [
    ...u16le32(0), // delay
    ...u16(height),
    ...u16(width8),
    ...u16(x),
    ...u16(y),
    0, // pad after y
    0, 0, 0, 0, 0, 0, 0, 0, // field_9[8]
  ];
}

describe('DAX animated multi-frame decode', () => {
  it('decodes a 2-frame block to the right dimensions', () => {
    // frame 0: 16x2 (width8=2 → 16px), 16*2*... pixBytes = height*width8*4 = 2*2*4 = 16
    // frame 1: 8x1 (width8=1 → 8px), pixBytes = 1*1*4 = 4
    const f0pix = Array.from({ length: 16 }, (_, i) => i & 0xff);
    const f1pix = [0x12, 0x34, 0x56, 0x78];
    const body = [
      2, // numFrames
      ...frameHeader(2, 2), ...f0pix,
      ...frameHeader(1, 1), ...f1pix,
    ];
    const arc = decodeDax(daxWithBlock(body), 'SPRITX'); // SPRIT* → no XOR
    const blk = arc.blocks[0];
    expect(blk.kind).toBe('animated');
    expect(blk.frames).toHaveLength(2);
    expect(blk.frames![0]).toMatchObject({ width: 16, height: 2 });
    expect(blk.frames![1]).toMatchObject({ width: 8, height: 1 });
    // SPRIT mask = magenta index 13.
    expect(blk.frames![0].transparentIndex).toBe(13);
  });

  it('applies the XOR-delta for PIC-style portraits', () => {
    // Two equal-size frames; frame 1 stored as XOR vs frame 0 → decodes back to known pixels.
    const f0 = [0x11, 0x22, 0x33, 0x44]; // 8x1
    const target = [0xab, 0xcd, 0xef, 0x01];
    const f1stored = target.map((b, i) => b ^ f0[i]);
    const body = [2, ...frameHeader(1, 1), ...f0, ...frameHeader(1, 1), ...f1stored];
    const arc = decodeDax(daxWithBlock(body), 'PIC9'); // PIC* → XOR
    const blk = arc.blocks[0];
    expect(blk.kind).toBe('animated');
    // Reconstruct frame 1's high/low nibble indices from `target`.
    const f1 = blk.frames![1];
    expect([...f1.indices]).toEqual([
      0xa, 0xb, 0xc, 0xd, 0xe, 0xf, 0x0, 0x1,
    ]);
    // Portraits are not masked.
    expect(f1.transparentIndex).toBeNull();
  });
});

describe('DAX tileset (fixed-size multi-item: DUNGCOM/WILDCOM combat backdrops)', () => {
  it('decodes a 17-byte-header N-tile block to N equal tiles', () => {
    // height=12, width8=2 (16px), 3 tiles. tileBytes = 12*2*4 = 96. header = 17.
    // (Avoids the {8,1} tile-strip signature, which is detected first.)
    const tileBytes = 12 * 2 * 4;
    const tiles = [
      ...Array(tileBytes).fill(0x10), // tile 0: index 1 / index 0 pixels
      ...Array(tileBytes).fill(0x23), // tile 1
      ...Array(tileBytes).fill(0x45), // tile 2
    ];
    const body = [
      ...u16(12), // height
      ...u16(2), // width/8
      ...u16(0), // x_pos
      ...u16(0), // y_pos
      3, // item_count
      0, 0, 0, 0, 0, 0, 0, 0, // field_9[8]
      ...tiles,
    ];
    const arc = decodeDax(daxWithBlock(body), 'DUNGCOM');
    const blk = arc.blocks[0];
    expect(blk.kind).toBe('tileset');
    expect(blk.frames).toHaveLength(3);
    for (const fr of blk.frames!) {
      expect(fr).toMatchObject({ width: 16, height: 12 });
      expect(fr.indices.length).toBe(192);
    }
    // tile 0: byte 0x10 → high nibble 1, low nibble 0.
    expect([...blk.frames![0].indices.slice(0, 2)]).toEqual([1, 0]);
    expect([...blk.frames![2].indices.slice(0, 2)]).toEqual([4, 5]);
  });

  it('rejects a block whose tiles do not exactly fill the payload', () => {
    // Same header but one byte short of 3 whole tiles → not a tileset.
    const body = [
      ...u16(12), ...u16(2), ...u16(0), ...u16(0), 3,
      0, 0, 0, 0, 0, 0, 0, 0,
      ...Array(12 * 2 * 4 * 3 - 1).fill(0x11),
    ];
    const arc = decodeDax(daxWithBlock(body), 'DUNGCOM');
    expect(arc.blocks[0].kind).not.toBe('tileset');
  });
});

// --- Golden: real CoK SPRIT1.DAX (skips if game data absent) -----------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const sprit1 = resolve(repoRoot, 'Champions of Krynn', 'SPRIT1.DAX');
const dungcom = resolve(repoRoot, 'Champions of Krynn', 'DUNGCOM.DAX');
const x8x8d1 = resolve(repoRoot, 'Champions of Krynn', '8X8D1.DAX');

describe('DAX animated — golden CoK SPRIT1', () => {
  it.skipIf(!existsSync(sprit1))('decodes monster blocks to 3 verbatim view-sizes', async () => {
    const bytes = new Uint8Array(await readFile(sprit1));
    const arc = decodeDax(bytes, 'SPRIT1');
    const animated = arc.blocks.filter((b) => b.kind === 'animated');
    // Research §B.5: ids 1,8,12,30,35 — all 3 frames.
    expect(animated.length).toBeGreaterThanOrEqual(5);
    for (const b of animated) {
      expect(b.frames!.length).toBe(3);
      // Each frame a sane non-empty image with the magenta mask.
      for (const fr of b.frames!) {
        expect(fr.width).toBeGreaterThan(0);
        expect(fr.height).toBeGreaterThan(0);
        expect(fr.indices.length).toBe(fr.width * fr.height);
        expect(fr.transparentIndex).toBe(13);
      }
    }
    // Block 1 = an armored warrior at 56x80 / 32x65 / 24x57 (research §B.4).
    const b1 = animated.find((b) => b.blockId === 1)!;
    expect(b1.frames!.map((f) => [f.width, f.height])).toEqual([
      [56, 80], [32, 65], [24, 57],
    ]);
  });
});

describe('DAX tileset — golden CoK DUNGCOM', () => {
  it.skipIf(!existsSync(dungcom))('decodes the combat backdrop to 25 tiles of 24x24', async () => {
    const bytes = new Uint8Array(await readFile(dungcom));
    const arc = decodeDax(bytes, 'DUNGCOM');
    const tileset = arc.blocks.find((b) => b.kind === 'tileset');
    expect(tileset, 'DUNGCOM should have a tileset block').toBeDefined();
    expect(tileset!.frames).toHaveLength(25);
    for (const fr of tileset!.frames!) {
      expect(fr).toMatchObject({ width: 24, height: 24 });
      expect(fr.indices.length).toBe(24 * 24);
      // EGA index range only (0..15).
      expect(Math.max(...fr.indices)).toBeLessThanOrEqual(15);
      // Opaque combat ground — no transparency key.
      expect(fr.transparentIndex).toBeNull();
    }
  });
});

describe('DAX tileset — golden CoK 8X8D (8x8 UI/decoration tiles)', () => {
  it.skipIf(!existsSync(x8x8d1))('decodes 8X8D1 blocks to magenta-keyed 8x8 tile sets', async () => {
    const bytes = new Uint8Array(await readFile(x8x8d1));
    const arc = decodeDax(bytes, '8X8D1');
    const tilesets = arc.blocks.filter((b) => b.kind === 'tileset');
    // Most blocks are 70/45/38-tile 8x8 sets (one odd header block is not a tileset).
    expect(tilesets.length).toBeGreaterThanOrEqual(7);
    for (const ts of tilesets) {
      expect(ts.frames!.length).toBeGreaterThanOrEqual(2);
      for (const fr of ts.frames!) {
        expect(fr).toMatchObject({ width: 8, height: 8 });
        expect(fr.indices.length).toBe(64);
        // 8X8D tiles are magenta-keyed (EGA index 13).
        expect(fr.transparentIndex).toBe(13);
      }
    }
    // The 70-tile UI/decoration block (id 11) is present.
    const b11 = arc.blocks.find((b) => b.blockId === 11 && b.kind === 'tileset');
    expect(b11, 'block 11 should be a tileset').toBeDefined();
    expect(b11!.frames).toHaveLength(70);
  });
});
