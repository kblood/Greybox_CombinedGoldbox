/**
 * DAX title-screen de-roll (synthetic, no game data needed).
 *
 * A few SSI full-screen frames are stored horizontally cyclic-ROLLED (the rightmost columns wrap to
 * the left margin) and the engine un-rolls them on decode (see `derollFrameIndices` in dax.ts; real
 * case: CoK TITLE.DAX block 1, rolled +13 px). These tests build a tiny in-memory DAX container so
 * the behaviour is covered even on a clone without the game files:
 *  - a frame with a uniform border that is rolled right by R must come back de-rolled (border
 *    restored, content in the right place);
 *  - a full-bleed frame with no matching border must be left exactly as stored (no false de-roll).
 */
import { describe, it, expect } from 'vitest';
import { decodeDax } from '../src/loaders/dax.js';

const ENTRY_SIZE = 9;

/** Encode bytes as SSI signed-byte RLE using literal runs only (control c<0x80 ⇒ c+1 literals). */
function rleLiteral(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; ) {
    const run = Math.min(128, data.length - i);
    out.push(run - 1);
    for (let j = 0; j < run; j++) out.push(data[i + j]!);
    i += run;
  }
  return Uint8Array.from(out);
}

/**
 * Pack one chunky-4bpp frame using the real 17-byte DAX block header (COAB DaxBlock.cs):
 * height@0, width/8@2, x@4, y@6, item_count=1@8, field_9[8]@9, pixels@17.
 */
const FRAME_HEADER = 17;
function packFrame(indices: Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array(FRAME_HEADER + (width * height) / 2);
  const dv = new DataView(raw.buffer);
  dv.setUint16(0, height, true);
  dv.setUint16(2, width / 8, true);
  raw[8] = 1; // item_count = 1 (single frame)
  for (let i = 0; i < width * height; i += 2) {
    raw[FRAME_HEADER + i / 2] = ((indices[i]! & 0x0f) << 4) | (indices[i + 1]! & 0x0f);
  }
  return raw;
}

/** Build a single-block DAX container from a decompressed frame payload. */
function buildDax(raw: Uint8Array, blockId = 1): Uint8Array {
  const comp = rleLiteral(raw);
  const tocBytes = ENTRY_SIZE; // one entry
  const out = new Uint8Array(2 + tocBytes + comp.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, tocBytes, true);
  out[2] = blockId; // u8 block id
  dv.setUint32(3, 0, true); // data_offset
  dv.setUint16(7, raw.length, true); // raw_size
  dv.setUint16(9, comp.length, true); // comp_size
  out.set(comp, 2 + tocBytes);
  return out;
}

const W = 64, H = 64;

/** A 64×64 image with a uniform index-0 border (col 0 + col W-1) and an asymmetric interior. */
function borderedImage(): Uint8Array {
  const idx = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      idx[y * W + x] = x === 0 || x === W - 1 ? 0 : ((x * 3 + y) % 15) + 1;
    }
  }
  return idx;
}

/** Cyclically roll every row RIGHT by r: out[x] = in[(x - r + W) % W]. */
function rollRight(idx: Uint8Array, r: number): Uint8Array {
  const out = new Uint8Array(idx.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) out[y * W + x] = idx[y * W + ((x - r + W) % W)]!;
  return out;
}

describe('DAX title-screen de-roll', () => {
  it('undoes a stored horizontal roll, restoring the original framing', () => {
    const correct = borderedImage();
    const stored = rollRight(correct, 13); // the on-disk frame is rolled +13
    const dax = buildDax(packFrame(stored, W, H));
    const img = decodeDax(dax, 'TITLE').frameSet.frames.get(1)!;
    expect(img.width).toBe(W);
    expect(img.height).toBe(H);
    expect(Array.from(img.indices)).toEqual(Array.from(correct)); // de-rolled back to original
  });

  it('leaves a full-bleed frame (no matching border) untouched', () => {
    // No uniform border → no clean de-roll exists → must decode verbatim.
    const idx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) idx[y * W + x] = ((x * 7 + y * 5) % 15) + 1;
    const dax = buildDax(packFrame(idx, W, H));
    const img = decodeDax(dax, 'BIGPIC').frameSet.frames.get(1)!;
    expect(Array.from(img.indices)).toEqual(Array.from(idx));
  });
});
