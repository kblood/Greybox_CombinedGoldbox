import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeDaa } from '../src/loaders/daa.js';
import { indexedToRGBA } from '../src/render/rgba.js';

const options = { singleFrameTailBlockIds: [18] };

function literal(raw: Uint8Array): number[] {
  const out: number[] = [];
  for (let pos = 0; pos < raw.length; pos += 128) {
    const run = raw.subarray(pos, pos + 128);
    out.push(run.length - 1, ...run);
  }
  return out;
}

/** Two-entry index; entry 99 is deliberately truncated and stays a legacy empty frame. */
function archive(comp: number[]): Uint8Array {
  return Uint8Array.from([0, 14, 18, 0, 0, 0, 0, 0,
    99, 0, (comp.length >>> 24) & 255, (comp.length >>> 16) & 255,
    (comp.length >>> 8) & 255, comp.length & 255, ...comp, 0, 0]);
}

function source(headerSize = 87): Uint8Array {
  const raw = new Uint8Array(headerSize + 20 + 1); // 16x2, five planes, one trailing byte
  raw.set([77, 0, 2, 0, 2, 0, 9, 0, 12, 0, 1]);
  for (let c = 0; c < 32; c++) raw[12 + c * 2] = c;
  raw.fill(0x5a, 75, headerSize); // visibly different from pixels; not a pixel offset
  for (let p = 0; p < 5; p++) {
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 16; x++) {
        if (((x + y * 3) & (1 << p)) !== 0) {
          raw[headerSize + p * 4 + y * 2 + (x >>> 3)] |= 0x80 >>> (x & 7);
        }
      }
    }
  }
  return raw;
}

function failure(comp: number[]): string {
  try {
    decodeDaa(archive(comp), 'SYNTH.DAA', options);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/single-frame tail block 18 failed/);
    return String(((error as Error).cause as Error)?.message);
  }
  throw new Error('Expected selected malformed block 18 to throw');
}

describe('DAA opt-in single-frame tail layout', () => {
  it('retains boundary-crossing runs and decodes independently known pixels and palette', () => {
    const raw = source();
    // Header budget 77 ends mid-header. The next run crosses the true bitmap start (87).
    const bytes = archive([...literal(raw.subarray(0, 77)), 0x80, ...literal(raw.subarray(77)), 0x80]);
    const legacy = decodeDaa(bytes, 'SYNTH.DAA');
    const corrected = decodeDaa(bytes, 'SYNTH.DAA', options);
    const sf = corrected.subFrames[0];
    expect(sf.pixOff).toBe(77); // preserve raw field, not a fabricated corrected value
    expect(sf.tailLayout).toEqual({
      layout: 'amiga-sprite-single-frame-tail-v1',
      decodedStream: raw,
      bitmapStart: 87,
      planarByteLength: 20,
      frameStride: 21,
    });
    expect(sf.tailLayout!.decodedStream.byteOffset).toBe(0);
    expect(sf.tailLayout!.decodedStream.buffer.byteLength).toBe(raw.length);
    for (const entry of legacy.subFrames) expect(entry).not.toHaveProperty('tailLayout');
    expect(corrected.subFrames[1]).not.toHaveProperty('tailLayout');
    expect([sf.width, sf.height, sf.numDist]).toEqual([16, 2, 1]);
    const image = sf.frames[0];
    expect([image.xOffset, image.yOffset]).toEqual([9, 12]);
    expect(Array.from(image.indices)).toEqual(
      Array.from({ length: 32 }, (_, i) => ((i % 16) + Math.floor(i / 16) * 3) & 31),
    );
    expect(image.palette?.colors.slice(0, 32)).toEqual(
      Array.from({ length: 32 }, (_, c) => ({ r: 0, g: (c >>> 4) * 17, b: (c & 15) * 17 })),
    );
    expect(corrected.frameSet.frames.get(18)).toBe(image);
    expect(legacy.subFrames[0].frames[0].indices).not.toEqual(image.indices);
    expect(corrected.subFrames[1]).toEqual(legacy.subFrames[1]);
    expect(corrected.subFrames[1].frames).toEqual([]);
    expect(decodeDaa(bytes, 'SYNTH.DAA', {}).subFrames).toEqual(legacy.subFrames);
  });

  it('handles repeat runs without dropping their boundary-crossing output', () => {
    const raw = source();
    raw.fill(0, 87);
    const comp = [...literal(raw.subarray(0, 77)), ...literal(raw.subarray(77, 87)), 0xec, 0]; // 21 zeroes
    const image = decodeDaa(archive(comp), '', options).frameSet.frames.get(18)!;
    expect(Array.from(new Set(image.indices))).toEqual([0]);
  });

  it('rejects literal/repeat truncation and a short palette/header', () => {
    expect(failure([...literal(source()), 2, 0])).toMatch(/truncated sprite-RLE/);
    expect(failure([...literal(source()), 0x81])).toMatch(/truncated sprite-RLE/);
    expect(failure(literal(source().subarray(0, 74)))).toMatch(/header too short/);
    const badPalette = source();
    badPalette[11] = 0xf0;
    expect(failure(literal(badPalette))).toMatch(/palette word exceeds 12 bits/);
  });

  it('rejects zero/multiple frames without assuming later-frame or XOR semantics', () => {
    for (const count of [0, 2, 16, 255]) {
      const raw = source();
      raw[10] = count;
      expect(failure(literal(raw))).toMatch(/exactly one stored frame/);
    }
  });

  it('accepts the exact header and geometry limits within the bounded envelope', () => {
    for (const headerSize of [77, 256]) {
      expect(decodeDaa(archive(literal(source(headerSize))), '', options).frameSet.frames.get(18)?.width)
        .toBe(16);
    }
    const raw = new Uint8Array(82_177); // 256 header + 512x256x5 bits + one trailing byte
    raw.set([77, 1, 0, 0, 64, 0, 0, 0, 0, 0, 1]);
    const image = decodeDaa(archive(literal(raw)), '', options).frameSet.frames.get(18)!;
    expect([image.width, image.height, image.indices.length]).toEqual([512, 256, 131_072]);
    expect(Array.from(new Set(image.indices))).toEqual([0]);
  });

  it('rejects geometry, frame-span, and decompression size violations', () => {
    for (const [off, value] of [[1, 2], [2, 0], [3, 1], [4, 0]] as const) {
      const raw = source();
      raw[off] = value;
      expect(failure(literal(raw))).toMatch(/implausible header geometry/);
    }
    expect(failure(literal(source(76)))).toMatch(/inconsistent header\/frame span/);
    expect(failure(literal(source(257)))).toMatch(/inconsistent header\/frame span/);
    expect(failure(Array.from({ length: 643 }, () => [0x81, 0]).flat())).toMatch(/exceeds size limit/);
  });

  it('rejects invalid or absent requested IDs explicitly', () => {
    const bytes = archive(literal(source()));
    for (const id of [-1, 256, 1.5, Number.NaN]) {
      expect(() => decodeDaa(bytes, '', { singleFrameTailBlockIds: [id] })).toThrow(/invalid.*ID/);
    }
    expect(() => decodeDaa(bytes, '', { singleFrameTailBlockIds: [17] })).toThrow(/block 17 not found/);
    expect(() => decodeDaa(bytes, '', { singleFrameTailBlockIds: [99] })).toThrow(/block 99 failed/);
  });
});

// Optional local differential evidence; no game data, Python or numpy required by portable tests.
const oraclePath = process.env.GB_DAA_TAIL_ORACLE;
it.skipIf(!oraclePath)('pinned CoK PIC1 #18 matches the independent corrected Python renderer', () => {
  const bytes = new Uint8Array(readFileSync(oraclePath!));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687',
  );
  const tools = fileURLToPath(new URL('../../../tools/', import.meta.url));
  const script = [
    'import sys,json',
    'sys.path.insert(0,sys.argv[1])',
    'import amiga_cokdok_render as ref',
    'data=open(sys.argv[2],"rb").read()',
    '_,entries=ref.SF.amiga_index_entries(data)',
    'd=ref.decode_subblock(next(comp for bid,comp in entries if bid==18))',
    'print(json.dumps(dict(width=d["width"],height=d["height"],start=d["start"],indices=d["frames"][0].flatten().tolist(),palette=d["palette"])))',
  ].join('\n');
  const ref = JSON.parse(execFileSync('python', ['-c', script, tools, oraclePath!], { encoding: 'utf8' }));
  const corrected = decodeDaa(bytes, 'PIC1.DAA', options);
  const legacy = decodeDaa(bytes, 'PIC1.DAA');
  const image = corrected.frameSet.frames.get(18)!;
  const tail = corrected.subFrames.find((sf) => sf.blockId === 18)!.tailLayout!;
  expect(tail.layout).toBe('amiga-sprite-single-frame-tail-v1');
  expect([tail.decodedStream.byteLength, tail.bitmapStart, tail.planarByteLength, tail.frameStride])
    .toEqual([5368, 87, 5280, 5281]);
  expect(tail.decodedStream.byteOffset).toBe(0);
  expect(tail.decodedStream.buffer.byteLength).toBe(5368);
  // Independent review goldens: a changed live Python oracle cannot redefine these bytes/pixels.
  expect(createHash('sha256').update(tail.decodedStream).digest('hex')).toBe(
    '2f09979383ed4d936c3dce1e94499afbe97d64916a46248d24cf4c2f10099704',
  );
  expect(createHash('sha256').update(image.indices).digest('hex')).toBe(
    '6ee0763ee82ebe70f886f765ccde2f036f2e2a4123b25de52a12013257d9c78f',
  );
  const rgbPalette = Uint8Array.from(image.palette!.colors.slice(0, 32).flatMap((c) => [c!.r, c!.g, c!.b]));
  expect(createHash('sha256').update(rgbPalette).digest('hex')).toBe(
    '9f1908f0f5b7a83b2e5ea2ecdfd336091c70bf60f851fc93ee53a730197a1676',
  );
  const rgba = indexedToRGBA(image);
  expect(createHash('sha256').update(rgba).digest('hex')).toBe(
    'e5c5eacb57d4e7527df6ac42f85a9bf6b09be70490895b8eceef706e3f49e7fe',
  );
  expect(image.transparentIndex).toBeNull();
  expect(Array.from(rgba).filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  for (const sf of legacy.subFrames) expect(sf).not.toHaveProperty('tailLayout');
  for (const sf of corrected.subFrames.filter((entry) => entry.blockId !== 18)) {
    expect(sf).not.toHaveProperty('tailLayout');
  }
  expect([image.width, image.height]).toEqual([88, 88]);
  expect([ref.start, image.width, image.height]).toEqual([87, ref.width, ref.height]);
  expect(Array.from(image.indices)).toEqual(ref.indices);
  expect(image.palette?.colors.slice(0, 32).map((c) => [c?.r, c?.g, c?.b])).toEqual(ref.palette);
  expect(image.indices).not.toEqual(legacy.frameSet.frames.get(18)!.indices);
  expect(corrected.subFrames.filter((sf) => sf.blockId !== 18)).toEqual(
    legacy.subFrames.filter((sf) => sf.blockId !== 18),
  );
});
