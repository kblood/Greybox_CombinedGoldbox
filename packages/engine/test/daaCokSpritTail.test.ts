import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeDaa } from '../src/loaders/daa.js';
import { indexedToRGBA } from '../src/render/rgba.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const RECEIPT_PATH = resolve(REPO_ROOT, 'docs/engine/research/cok-amiga-sprit-decode-receipt-v1.json');
const STREAM_BYTES = 15_930;
const BITMAP_START = 87;
const FRAME_BYTES = 5_280;
const FRAME_STRIDE = 5_281;

interface RleSpan { start: number; length: number; kind: 'literal' | 'repeat' }
interface Encoded { bytes: Uint8Array; spans: RleSpan[] }
interface Entry { id: number; compressed: Uint8Array }

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function rgbBytes(indices: Uint8Array, palette: { colors: ({ r: number; g: number; b: number } | null)[] }): Uint8Array {
  const rgb = new Uint8Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const color = palette.colors[indices[i]!]!;
    rgb.set([color.r, color.g, color.b], i * 3);
  }
  return rgb;
}

function planar(indices: Uint8Array): Uint8Array {
  const width = 88;
  const height = 88;
  const rowBytes = 12;
  const planeSize = rowBytes * height;
  const bytes = new Uint8Array(planeSize * 5);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = indices[y * width + x]!;
      for (let plane = 0; plane < 5; plane++) {
        if ((value & (1 << plane)) !== 0) {
          bytes[plane * planeSize + y * rowBytes + (x >>> 3)]! |= 0x80 >>> (x & 7);
        }
      }
    }
  }
  return bytes;
}

function syntheticSpritStream(): { raw: Uint8Array; targets: Uint8Array[]; palette: { r: number; g: number; b: number }[] } {
  const targets = Array.from({ length: 3 }, (_, frame) => {
    const pixels = new Uint8Array(88 * 88);
    for (let y = 0; y < 88; y++) {
      for (let x = 0; x < 88; x++) {
        // Even values in the first 16 columns keep early plane-0 bytes zero, so RLE repeats
        // deliberately cross the header/frame boundaries below.
        pixels[y * 88 + x] = x < 16 && y < 3
          ? ((frame * 2 + y * 4) & 31)
          : ((x * 3 + y * 5 + frame * 7 + ((x * y) % 11)) & 31);
      }
    }
    return pixels;
  });
  const palette = Array.from({ length: 32 }, (_, i) => ({
    r: ((i * 5) & 15) * 17,
    g: ((i * 3) & 15) * 17,
    b: ((i * 7) & 15) * 17,
  }));
  const raw = new Uint8Array(STREAM_BYTES);
  raw.set([81, 0, 88, 0, 11, 0x12, 0x34, 0xab, 0xcd, 0, 3]);
  for (let i = 0; i < palette.length; i++) {
    const word = ((palette[i]!.r / 17) << 8) | ((palette[i]!.g / 17) << 4) | (palette[i]!.b / 17);
    raw[11 + i * 2] = word >>> 8;
    raw[12 + i * 2] = word & 0xff;
  }
  for (let frame = 0; frame < 3; frame++) {
    const stored = frame === 0
      ? targets[0]!
      : Uint8Array.from(targets[frame]!, (value, pixel) => value ^ targets[0]![pixel]!);
    raw.set(planar(stored), BITMAP_START + frame * FRAME_STRIDE);
    raw[BITMAP_START + frame * FRAME_STRIDE + FRAME_BYTES] = 0;
  }
  return { raw, targets, palette };
}

function encodeRle(raw: Uint8Array): Encoded {
  const output: number[] = [];
  const spans: RleSpan[] = [];
  let pos = 0;
  while (pos < raw.length) {
    let repeat = 1;
    while (pos + repeat < raw.length && raw[pos + repeat] === raw[pos] && repeat < 128) repeat++;
    if (repeat >= 3) {
      output.push(0x101 - repeat, raw[pos]!);
      spans.push({ start: pos, length: repeat, kind: 'repeat' });
      pos += repeat;
    } else {
      const start = pos;
      pos += repeat;
      while (pos < raw.length && pos - start < 128) {
        let nextRepeat = 1;
        while (pos + nextRepeat < raw.length && raw[pos + nextRepeat] === raw[pos] && nextRepeat < 128) nextRepeat++;
        if (nextRepeat >= 3) break;
        pos += Math.min(nextRepeat, 128 - (pos - start));
      }
      const length = pos - start;
      output.push(length - 1, ...raw.subarray(start, pos));
      spans.push({ start, length, kind: 'literal' });
    }
    output.push(0x80); // legal no-op between commands
  }
  return { bytes: Uint8Array.from(output), spans };
}

function makeArchive(entries: Entry[]): Uint8Array {
  const normalized = entries.length === 1
    ? [...entries, { id: 255, compressed: new Uint8Array(0) }]
    : entries;
  const dataBase = 2 + normalized.length * 6;
  const size = dataBase + normalized.reduce((sum, entry) => sum + entry.compressed.length, 0);
  const bytes = new Uint8Array(size);
  bytes[0] = dataBase >>> 8;
  bytes[1] = dataBase & 0xff;
  let offset = 0;
  let body = dataBase;
  for (const entry of normalized) {
    bytes[offset + 2] = entry.id;
    bytes[offset + 3] = 0;
    const subOffset = body - dataBase;
    bytes[offset + 4] = subOffset >>> 24;
    bytes[offset + 5] = (subOffset >>> 16) & 0xff;
    bytes[offset + 6] = (subOffset >>> 8) & 0xff;
    bytes[offset + 7] = subOffset & 0xff;
    bytes.set(entry.compressed, body);
    body += entry.compressed.length;
    offset += 6;
  }
  return bytes;
}

function singleFrameStream(): Uint8Array {
  const raw = new Uint8Array(5_368);
  raw.set([77, 0, 88, 0, 11, 0, 0, 0, 0, 0, 1]);
  for (let color = 0; color < 32; color++) raw[12 + color * 2] = color;
  return raw;
}

function validLegacyEntry(): Uint8Array {
  const header = new Uint8Array(75);
  header.set([75, 0, 8, 0, 1, 0, 0, 0, 0, 0, 1]);
  for (let color = 0; color < 32; color++) header[12 + color * 2] = color;
  const pixels = new Uint8Array(80);
  pixels.fill(0xaa);
  return Uint8Array.from([...encodeRle(header).bytes, ...encodeRle(pixels).bytes]);
}

function failure(compressed: Uint8Array): string {
  try {
    decodeDaa(makeArchive([{ id: 7, compressed }]), 'SYNTH.SPRIT1.DAA', { cokSpritTailBlockIds: [7] });
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/CoK SPRIT tail block 7 failed/);
    return String(((error as Error).cause as Error)?.message);
  }
  throw new Error('Expected selected malformed CoK SPRIT block to throw');
}

describe('DAA explicit CoK SPRIT1/2 three-frame tail/XOR layout', () => {
  it('decodes independent asymmetric pixels, palettes and RLE runs spanning all three boundaries', () => {
    const { raw, targets, palette } = syntheticSpritStream();
    const encoded = encodeRle(raw);
    const boundaries = [BITMAP_START, BITMAP_START + FRAME_STRIDE, BITMAP_START + FRAME_STRIDE * 2];
    expect(boundaries.filter((boundary) => encoded.spans.some((span) => span.kind === 'repeat'
      && span.start < boundary && span.start + span.length > boundary))).toEqual(boundaries);

    const archive = makeArchive([{ id: 7, compressed: encoded.bytes }]);
    const decoded = decodeDaa(archive, 'synthetic', { cokSpritTailBlockIds: [7] });
    const sf = decoded.subFrames[0]!;
    expect([sf.blockId, sf.width, sf.height, sf.pixOff, sf.numDist]).toEqual([7, 88, 88, 81, 3]);
    expect(sf.tailLayout).toEqual({
      layout: 'cok-sprit-three-frame-tail-xor-v1',
      decodedStream: raw,
      bitmapStart: BITMAP_START,
      planarByteLength: FRAME_BYTES,
      frameStride: FRAME_STRIDE,
      storedFrameCount: 3,
      xorBaseFrame: 0,
    });
    const tail = sf.tailLayout!;
    expect(tail.decodedStream.byteOffset).toBe(0);
    expect(tail.decodedStream.buffer.byteLength).toBe(STREAM_BYTES);
    expect(sf.frames).toHaveLength(3);
    for (let frame = 0; frame < 3; frame++) {
      const image = sf.frames[frame]!;
      expect(image.indices).toEqual(targets[frame]);
      expect(image.palette!.colors.slice(0, 32)).toEqual(palette);
      expect([image.xOffset, image.yOffset]).toEqual([0x1234, 0xabcd]);
      expect(image.transparentIndex).toBeNull();
      expect(image.encoding).toBe('daa-subframe');
      const expectedRgba = new Uint8Array(88 * 88 * 4);
      const expectedRgb = rgbBytes(targets[frame]!, { colors: palette });
      for (let pixel = 0; pixel < 88 * 88; pixel++) {
        expectedRgba.set([...expectedRgb.subarray(pixel * 3, pixel * 3 + 3), 255], pixel * 4);
      }
      expect(Uint8Array.from(indexedToRGBA(image))).toEqual(expectedRgba);
    }
    expect(new Set(sf.frames.map((image) => image.indices.buffer)).size).toBe(3);
    expect(decoded.frameSet.frames.get(7)).toBe(sf.frames[0]);
  });

  it('XORs both deltas against the original frame zero, never the preceding reconstructed frame', () => {
    const { raw, targets } = syntheticSpritStream();
    const encoded = encodeRle(raw);
    const archive = makeArchive([{ id: 7, compressed: encoded.bytes }]);
    const frames = decodeDaa(archive, '', { cokSpritTailBlockIds: [7] }).subFrames[0]!.frames;
    const wrongPreviousBase = Uint8Array.from(frames[1]!.indices, (value, i) => value
      ^ planarFrameIndex(raw, 2, i));
    expect(frames[2]!.indices).toEqual(targets[2]);
    expect(wrongPreviousBase).not.toEqual(targets[2]);
  });

  it('keeps default legacy output and unselected malformed-entry fallback unchanged', () => {
    const { raw } = syntheticSpritStream();
    const sprite = encodeRle(raw).bytes;
    const legacy = validLegacyEntry();
    const broken = Uint8Array.of(2, 0);
    const archive = makeArchive([
      { id: 7, compressed: sprite },
      { id: 8, compressed: legacy },
      { id: 9, compressed: broken },
    ]);
    const before = decodeDaa(archive, 'mixed');
    const selected = decodeDaa(archive, 'mixed', { cokSpritTailBlockIds: [7] });
    expect(selected.subFrames[1]).toEqual(before.subFrames[1]);
    expect(selected.subFrames[2]).toEqual(before.subFrames[2]);
    expect(selected.subFrames[2]!.frames).toEqual([]);
    expect(selected.subFrames[0]!.tailLayout?.layout).toBe('cok-sprit-three-frame-tail-xor-v1');
    expect(before.subFrames[0]!.tailLayout).toBeUndefined();
    if (before.subFrames[0]!.frames.length > 0) {
      expect(before.subFrames[0]!.frames[0]!.indices).not.toEqual(selected.subFrames[0]!.frames[0]!.indices);
    } else {
      expect(before.subFrames[0]!.frames).toEqual([]);
    }
  });

  it('coexists with the existing independently selected one-frame PIC tail path', () => {
    const { raw } = syntheticSpritStream();
    const sprit = encodeRle(raw).bytes;
    const pic = encodeRle(singleFrameStream()).bytes;
    const archive = makeArchive([{ id: 7, compressed: sprit }, { id: 18, compressed: pic }]);
    const decoded = decodeDaa(archive, '', {
      cokSpritTailBlockIds: [7],
      singleFrameTailBlockIds: [18],
    });
    expect(decoded.subFrames[0]!.tailLayout?.layout).toBe('cok-sprit-three-frame-tail-xor-v1');
    expect(decoded.subFrames[1]!.tailLayout?.layout).toBe('amiga-sprite-single-frame-tail-v1');
    expect(() => decodeDaa(archive, '', {
      cokSpritTailBlockIds: [18], singleFrameTailBlockIds: [18],
    })).toThrow(/cannot select both/);
  });

  it('rejects malformed selected streams, layout mismatches and unsafe expansion', () => {
    const { raw } = syntheticSpritStream();
    expect(failure(Uint8Array.of(2, 0))).toMatch(/truncated sprite-RLE/);
    expect(failure(Uint8Array.of(0x81))).toMatch(/truncated sprite-RLE/);
    expect(failure(encodeRle(raw.subarray(0, 74)).bytes)).toMatch(/header too short/);
    for (const [offset, value] of [[0, 80], [4, 0], [4, 10], [10, 2]] as const) {
      const changed = raw.slice();
      changed[offset] = value;
      expect(failure(encodeRle(changed).bytes)).toMatch(/expected pixOff 81 and 88x88 x3/);
    }
    const badPalette = raw.slice();
    badPalette[11] = 0xf0;
    expect(failure(encodeRle(badPalette).bytes)).toMatch(/palette word exceeds 12 bits/);
    expect(failure(encodeRle(raw.subarray(0, raw.length - 1)).bytes)).toMatch(/inconsistent decoded length/);
    expect(failure(encodeRle(Uint8Array.from([...raw, 0])).bytes)).toMatch(/exceeds size limit/);
    expect(failure(encodeRle(raw.subarray(0, 87 + FRAME_STRIDE * 3 - 1)).bytes))
      .toMatch(/inconsistent decoded length/);
  });

  it('validates requested IDs, duplicate/overlapping selections and the six-byte container', () => {
    const { raw } = syntheticSpritStream();
    const index = makeArchive([{ id: 7, compressed: encodeRle(raw).bytes }]);
    for (const id of [-1, 256, 1.5, Number.NaN]) {
      expect(() => decodeDaa(index, '', { cokSpritTailBlockIds: [id] })).toThrow(/invalid CoK SPRIT tail block ID/);
    }
    expect(() => decodeDaa(index, '', { cokSpritTailBlockIds: [8] })).toThrow(/not found in 6-byte index/);
    expect(() => decodeDaa(index, '', { cokSpritTailBlockIds: [7, 7] })).toThrow(/duplicate CoK SPRIT/);
    const standardDaa = Uint8Array.from([0, 11, 7, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => decodeDaa(standardDaa, '', { cokSpritTailBlockIds: [7] }))
      .toThrow(/not found in 6-byte index/);
  });
});

interface ReceiptFrame {
  frame: number;
  storedPlanarSha256: string;
  storedIndexSha256: string;
  storedRgbPixelSha256: string;
  candidateRenderedIndexSha256: string;
  candidateRenderedRgbPixelSha256: string;
  trailingByteHex: string;
}
interface ReceiptBlock {
  blockId: number;
  compressedOffset: number;
  compressedBytes: number;
  compressedSha256: string;
  decompressedBytes: number;
  decompressedSha256: string;
  pixOff: number;
  bitmapStart: number;
  width: number;
  height: number;
  frameCount: number;
  planarFrameBytes: number;
  frameStrideBytes: number;
  paletteSha256: string;
  frames: ReceiptFrame[];
}
interface ReceiptArchive {
  name: string;
  sha256: string;
  bytes: number;
  dataBase: number;
  tocBlockIds: number[];
  blocks: ReceiptBlock[];
}

const receipt = JSON.parse(readFileSync(RECEIPT_PATH, 'utf8')) as { archives: ReceiptArchive[] };
function verifyPinnedArchive(path: string, archiveName: 'SPRIT1.DAA' | 'SPRIT2.DAA'): void {
  const expected = receipt.archives.find((row) => row.name === archiveName)!;
  const bytes = new Uint8Array(readFileSync(path));
  expect(bytes.byteLength).toBe(expected.bytes);
  expect(sha256(bytes)).toBe(expected.sha256);
  const mutated = bytes.slice();
  mutated[0]! ^= 1;
  expect(sha256(mutated)).not.toBe(expected.sha256);
  expect((bytes[0]! << 8) | bytes[1]!).toBe(expected.dataBase);
  expect(expected.dataBase).toBe(2 + expected.tocBlockIds.length * 6);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let ordinal = 0; ordinal < expected.tocBlockIds.length; ordinal++) {
    const block = expected.blocks[ordinal]!;
    const tocOffset = 2 + ordinal * 6;
    expect(bytes[tocOffset]).toBe(block.blockId);
    expect(bytes[tocOffset + 1]).toBe(0);
    expect(view.getUint32(tocOffset + 2, false)).toBe(block.compressedOffset);
    const compressed = bytes.subarray(expected.dataBase + block.compressedOffset,
      expected.dataBase + block.compressedOffset + block.compressedBytes);
    expect(sha256(compressed)).toBe(block.compressedSha256);
  }
  const decoded = decodeDaa(bytes, archiveName, { cokSpritTailBlockIds: expected.tocBlockIds });
  expect(decoded.kind).toBe('index');
  expect(decoded.subFrames.map((row) => row.blockId)).toEqual(expected.tocBlockIds);
  expect(decoded.subFrames).toHaveLength(17);
  for (const block of expected.blocks) {
    const sf = decoded.subFrames.find((row) => row.blockId === block.blockId)!;
    const tail = sf.tailLayout!;
    expect(tail.layout).toBe('cok-sprit-three-frame-tail-xor-v1');
    expect([tail.decodedStream.byteLength, tail.bitmapStart, tail.planarByteLength, tail.frameStride])
      .toEqual([block.decompressedBytes, block.bitmapStart, block.planarFrameBytes, block.frameStrideBytes]);
    expect(sha256(tail.decodedStream)).toBe(block.decompressedSha256);
    expect(sha256(tail.decodedStream.subarray(11, 75))).toBe(block.paletteSha256);
    expect(sf.frames).toHaveLength(3);
    for (const frame of block.frames) {
      const image = sf.frames[frame.frame]!;
      const offset = tail.bitmapStart + frame.frame * tail.frameStride;
      expect(sha256(tail.decodedStream.subarray(offset, offset + tail.planarByteLength)))
        .toBe(frame.storedPlanarSha256);
      const storedIndices = Uint8Array.from({ length: block.width * block.height }, (_, pixel) =>
        planarFrameIndex(tail.decodedStream, frame.frame, pixel));
      expect(sha256(storedIndices)).toBe(frame.storedIndexSha256);
      expect(sha256(rgbBytes(storedIndices, image.palette!))).toBe(frame.storedRgbPixelSha256);
      expect(sha256(image.indices)).toBe(frame.candidateRenderedIndexSha256);
      expect(sha256(rgbBytes(image.indices, image.palette!))).toBe(frame.candidateRenderedRgbPixelSha256);
      expect(tail.decodedStream[offset + tail.planarByteLength]).toBe(parseInt(frame.trailingByteHex, 16));
    }
    expect(decoded.frameSet.frames.get(block.blockId)).toBe(sf.frames[0]);
  }
}

const sprit1Oracle = process.env.GB_COK_SPRIT1_ORACLE;
const sprit2Oracle = process.env.GB_COK_SPRIT2_ORACLE;
it.skipIf(!sprit1Oracle || !existsSync(sprit1Oracle))(
  'candidate-pinned CoK SPRIT1 matches every receipt frame (51 frames)',
  () => verifyPinnedArchive(sprit1Oracle!, 'SPRIT1.DAA'),
);
it.skipIf(!sprit2Oracle || !existsSync(sprit2Oracle))(
  'candidate-pinned CoK SPRIT2 matches every receipt frame (51 frames)',
  () => verifyPinnedArchive(sprit2Oracle!, 'SPRIT2.DAA'),
);

it.skipIf(!sprit1Oracle || !existsSync(sprit1Oracle) || !sprit2Oracle || !existsSync(sprit2Oracle))(
  'SPRIT1 and SPRIT2 archive pins remain distinct even where frame pixels are identical',
  () => {
    const first = receipt.archives.find((row) => row.name === 'SPRIT1.DAA')!;
    const second = receipt.archives.find((row) => row.name === 'SPRIT2.DAA')!;
    const firstBytes = new Uint8Array(readFileSync(sprit1Oracle!));
    const secondBytes = new Uint8Array(readFileSync(sprit2Oracle!));
    expect(sha256(firstBytes)).toBe(first.sha256);
    expect(sha256(secondBytes)).toBe(second.sha256);
    expect(sha256(firstBytes)).not.toBe(second.sha256);
    expect(sha256(secondBytes)).not.toBe(first.sha256);
    const rgbHash = (archive: ReceiptArchive, blockId: number) =>
      archive.blocks.find((block) => block.blockId === blockId)!.frames[0]!.candidateRenderedRgbPixelSha256;
    expect(rgbHash(first, 1)).toBe(rgbHash(first, 14));
    expect(rgbHash(first, 14)).toBe(rgbHash(second, 14));
    expect(first.sha256).not.toBe(second.sha256);
  },
);

function planarFrameIndex(raw: Uint8Array, frame: number, pixel: number): number {
  const x = pixel % 88;
  const y = Math.floor(pixel / 88);
  const rowBytes = 12;
  const planeSize = rowBytes * 88;
  const offset = BITMAP_START + frame * FRAME_STRIDE;
  let value = 0;
  for (let plane = 0; plane < 5; plane++) {
    const byte = raw[offset + plane * planeSize + y * rowBytes + (x >>> 3)]!;
    value |= ((byte >>> (7 - (x & 7))) & 1) << plane;
  }
  return value;
}
