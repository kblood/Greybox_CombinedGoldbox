import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as engine from '@goldbox/engine';
import { decodeDaa, type DaaArchive } from '../src/loaders/daa.js';
import { indexedToRGBA } from '../src/render/rgba.js';
import {
  admitCokAmigaPortrait18, COK_AMIGA_PORTRAIT_18_SOURCE,
  validateCokAmigaPortrait18DecodedEvidence, validateCokAmigaPortrait18ImportedPng,
} from '../../../apps/web/src/ui/cokAmigaPortrait18Art.js';
import manifest from '../../../apps/web/src/ui/cokAmigaDialogue18RestyleManifest.json';

vi.mock('@goldbox/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/index.js')>();
  return { ...actual, decodeDaa: vi.fn(actual.decodeDaa) };
});

// Independent review constants. Never derive expected values from the production manifest.
const PIN = {
  game: 'cok', system: 'Amiga', archive: 'amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa',
  archiveByteLength: 165455,
  archiveSha256: 'b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687',
  baseSource: {
    game: 'cok', system: 'DOS-EGA', archive: 'PIC1.DAX',
    archiveSha256: '2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97',
    blockId: 18, frameIndex: 0,
  },
  blockId: 18, frameIndex: 0,
  blockSha256: '2f09979383ed4d936c3dce1e94499afbe97d64916a46248d24cf4c2f10099704',
  container: {
    kind: 'index', dataBase: 164, entryCount: 27, tocOrdinal: 7, subOffset: 46191,
    compressedStart: 46355, compressedEnd: 51114, compressedByteLength: 4759,
    compressedSha256: 'f5dc0c21cf16b2c532c1637148e8026844f34e92c327379e9a33909db2966581',
  },
  decoded: {
    layout: 'amiga-sprite-single-frame-tail-v1', byteLength: 5368, pixOff: 77,
    bitmapStart: 87, planarByteLength: 5280, frameStride: 5281,
    planarSha256: '8ad04853254d7c0c4a09cc044532579b0210a8ae3fc627ee946670d28d8848bf',
    indicesSha256: '6ee0763ee82ebe70f886f765ccde2f036f2e2a4123b25de52a12013257d9c78f',
    rgbPaletteSha256: '9f1908f0f5b7a83b2e5ea2ecdfd336091c70bf60f851fc93ee53a730197a1676',
    opaqueRgbaSha256: 'e5c5eacb57d4e7527df6ac42f85a9bf6b09be70490895b8eceef706e3f49e7fe',
    width: 88, height: 88, x: 0, y: 0, numFrames: 1, transparentIndex: null,
  },
  source: {
    file: 'batch02/native/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png',
    sha256: '2dc959c59b0d431d3c1a2b6403c6134388c0182f5076f8da5fdd0c03ff28711b',
    width: 88, height: 88,
    prompt: 'batch02/036_cok_amiga_daa_cok_pic1_pic1_018_f0_prompt.txt',
    promptSha256: 'efc19f53a6cd137d794d3896a2cfb76cdc2649f9e0ad04fbe1bdfb1fbd9f7727',
    input: 'batch02/036_cok_amiga_daa_cok_pic1_pic1_018_f0_input.png',
    inputSha256: 'e1078376462d6a0e3d5032797ef72ccfa00b8d4c1400bf1f88719f6e24a9cfdf',
  },
  restyle: {
    file: 'AMIGA_PIC1_018_f0_restyle.png',
    reviewedImport: 'batch02_review/pic1_018_v3_import/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png',
    byteLength: 2726186,
    sha256: 'a7d21c06f8c457591a1009c67a1e69c68bc0e0ace99240afee2387643d092cc7',
    rawOutput: 'batch02/done/036_cok_amiga_daa_cok_pic1_pic1_018_f0_out.png',
    rawOutputSha256: 'd13586a916e6b6682728b2a5056a902f87e804a3d6518093a25392b917baf31e',
    nativeWidth: 88, nativeHeight: 88, pixelScale: 16, width: 1408, height: 1408,
    bitDepth: 8, colorType: 2, destination: 'dialogue/AMIGA_PIC1_018_f0_restyle.png',
  },
  comparison: {
    stem: '036_cok_amiga_daa_cok_pic1_pic1_018_f0',
    originalSha256: '84bdaea39e7ad3d7d27fa69d6bf8627da39c26d42982bfefdd54744c1b52f2a6',
    previousOutputSha256: '255a5fbd5a2650303dc7adb4008e9cb5af0931bd3f0d1b342f76551a3d85c883',
    fidelity: { verdict: 'ok', edge_corr: 0.8539, hist_dist: 0.1931, aspect_dev: 0 },
  },
};
const REQUEST = { game: 'cok', system: 'Amiga', archive: 'PIC1.DAA',
  archiveSha256: PIN.archiveSha256, blockId: 18, frameIndex: 0, blockSha256: PIN.blockSha256 };
const hash = (bytes: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(bytes).digest('hex');

async function expectAdmissionFailure(
  result: ReturnType<typeof admitCokAmigaPortrait18>, reason: RegExp,
): Promise<void> {
  expect(await result).toEqual({ ok: false, reason: expect.stringMatching(reason) });
}

async function admittedImage(result: ReturnType<typeof admitCokAmigaPortrait18>) {
  const admitted = await result;
  expect(admitted.ok).toBe(true);
  if (!admitted.ok) throw new Error(admitted.reason);
  return admitted;
}

function fakePng(): Uint8Array {
  const bytes = new Uint8Array(PIN.restyle.byteLength);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1408, false);
  view.setUint32(20, 1408, false);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

describe('CoK Amiga PIC1 #18 portable source-admission guards', () => {
  it('pins every manifest field independently and exposes the Amiga-qualified identity', () => {
    expect(manifest).toEqual(PIN);
    expect(COK_AMIGA_PORTRAIT_18_SOURCE).toEqual(REQUEST);
    expect(Object.isFrozen(COK_AMIGA_PORTRAIT_18_SOURCE)).toBe(true);
  });

  it.each([
    ['game', 'dok'], ['system', 'DOS-EGA'], ['archive', 'PIC1.DAX'], ['archiveSha256', '0'.repeat(64)],
    ['blockId', 59], ['frameIndex', 1], ['blockSha256', '0'.repeat(64)],
  ])('rejects requested identity mismatch: %s', async (key, value) => {
    await expectAdmissionFailure(admitCokAmigaPortrait18(new Uint8Array(PIN.archiveByteLength),
      { ...REQUEST, [key]: value }), /requested identity/);
  });

  it('rejects missing/truncated/foreign archive bytes before any decode admission', async () => {
    await expectAdmissionFailure(admitCokAmigaPortrait18(new Uint8Array(0), REQUEST), /byte length/);
    await expectAdmissionFailure(admitCokAmigaPortrait18(new Uint8Array(PIN.archiveByteLength - 1), REQUEST),
      /byte length/);
    await expectAdmissionFailure(admitCokAmigaPortrait18(new Uint8Array(PIN.archiveByteLength), REQUEST),
      /archive SHA-256/); // supplied identity/hash cannot vouch for the bytes
  });

  it('proves identity/hash mismatches return before the corrected decoder is invoked', async () => {
    const decoder = vi.mocked(engine.decodeDaa);
    decoder.mockClear();
    await expectAdmissionFailure(admitCokAmigaPortrait18(new Uint8Array(PIN.archiveByteLength),
      { ...REQUEST, system: 'DOS-EGA' }), /requested identity/);
    expect(decoder).not.toHaveBeenCalled();
    await expectAdmissionFailure(admitCokAmigaPortrait18(new Uint8Array(PIN.archiveByteLength), REQUEST),
      /archive SHA-256/);
    expect(decoder).not.toHaveBeenCalled();
  });

  it('rejects the distinct DOS PIC1.DAX #18 frame identity explicitly', async () => {
    await expectAdmissionFailure(admitCokAmigaPortrait18(new Uint8Array(PIN.archiveByteLength), {
      game: 'cok', system: 'DOS-EGA', archive: 'PIC1.DAX', blockId: 18, frameIndex: 0,
      archiveSha256: '2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97',
    }), /requested identity/);
  });

  it('rejects incomplete decoded evidence without claiming archive provenance', async () => {
    const archive = { kind: 'index', dataBase: 164, blocks: [], subFrames: [],
      frameSet: { name: '', kind: 'unknown', frames: new Map() }, name: '' } as DaaArchive;
    await expect(validateCokAmigaPortrait18DecodedEvidence(archive)).rejects.toThrow(/container differs/);
  });

  it('rejects PNG size, signature/IHDR, geometry/type and foreign same-shape bytes', async () => {
    await expect(validateCokAmigaPortrait18ImportedPng(new Uint8Array(32))).rejects.toThrow(/byte length/);
    const signature = fakePng(); signature[0] ^= 1;
    await expect(validateCokAmigaPortrait18ImportedPng(signature)).rejects.toThrow(/signature\/IHDR/);
    const ihdr = fakePng(); ihdr[11] = 12;
    await expect(validateCokAmigaPortrait18ImportedPng(ihdr)).rejects.toThrow(/signature\/IHDR/);
    for (const off of [16, 20, 24, 25, 26, 27, 28]) {
      const bytes = fakePng(); bytes[off] ^= 1;
      await expect(validateCokAmigaPortrait18ImportedPng(bytes)).rejects.toThrow(/geometry\/type/);
    }
    await expect(validateCokAmigaPortrait18ImportedPng(fakePng())).rejects.toThrow(/PNG SHA-256/);
  });
});

const archivePath = process.env.GB_COK_AMIGA_18_ARCHIVE
  ?? 'C:/GoldBoxImg/batch03_work/dist-app-b3-cpic-runtime-20261027/assets/amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa';
const nativePath = process.env.GB_COK_AMIGA_18_NATIVE
  ?? 'C:/GoldBoxImg/batch02/native/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png';
const importPath = process.env.GB_COK_AMIGA_18_IMPORT
  ?? 'C:/GoldBoxImg/batch02_review/pic1_018_v3_import/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png';
const lineageRoot = process.env.GB_COK_AMIGA_18_LINEAGE_ROOT ?? 'C:/GoldBoxImg';
const rawOutputPath = `${lineageRoot}/${PIN.restyle.rawOutput}`;
const priorImportPath = process.env.GB_COK_AMIGA_18_PRIOR_IMPORT
  ?? 'C:/GoldBoxImg/batch03_work/dist-app-b3-cpic-runtime-20261027/restyle/out/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png';
const readArchive = () => new Uint8Array(readFileSync(archivePath));
const decode = () => decodeDaa(readArchive(), 'PIC1.DAA', { singleFrameTailBlockIds: [18] });
const haveNativeTools = existsSync(archivePath) && existsSync(nativePath)
  && spawnSync('python', ['-c', 'from PIL import Image'], { encoding: 'utf8' }).status === 0;

describe.skipIf(!existsSync(archivePath))('local pinned archive fixture (GB_COK_AMIGA_18_ARCHIVE; missing => SKIP)', () => {
  it('admits the exact archive and all independently pinned evidence', async () => {
    const bytes = readArchive();
    expect(bytes.length).toBe(PIN.archiveByteLength);
    expect(hash(bytes)).toBe(PIN.archiveSha256);
    expect(hash(bytes.subarray(46355, 51114))).toBe(PIN.container.compressedSha256);
    const arc = decode();
    const sf = arc.subFrames[7];
    const tail = sf.tailLayout!;
    expect([arc.kind, arc.dataBase, arc.subFrames.length, sf.blockId, sf.subOffset, sf.pixOff])
      .toEqual(['index', 164, 27, 18, 46191, 77]);
    expect([tail.layout, tail.decodedStream.length, tail.bitmapStart, tail.planarByteLength, tail.frameStride])
      .toEqual([PIN.decoded.layout, 5368, 87, 5280, 5281]);
    expect(hash(tail.decodedStream)).toBe(PIN.blockSha256);
    expect(hash(tail.decodedStream.subarray(87, 5367))).toBe(PIN.decoded.planarSha256);
    const decoder = vi.mocked(engine.decodeDaa);
    decoder.mockClear();
    const admitted = await admittedImage(admitCokAmigaPortrait18(bytes, REQUEST));
    expect(decoder).toHaveBeenCalledTimes(1);
    expect(decoder).toHaveBeenCalledWith(expect.any(Uint8Array), 'PIC1.DAA', { singleFrameTailBlockIds: [18] });
    expect(admitted.source).toEqual(REQUEST);
    expect(hash(admitted.original.indices)).toBe(PIN.decoded.indicesSha256);
    expect(hash(Uint8Array.from(admitted.original.palette!.colors.slice(0, 32)
      .flatMap((c) => [c!.r, c!.g, c!.b])))).toBe(PIN.decoded.rgbPaletteSha256);
    expect(hash(indexedToRGBA(admitted.original))).toBe(PIN.decoded.opaqueRgbaSha256);
    expect(admitted.original.transparentIndex).toBeNull();
  });

  it('owns the archive snapshot even for Buffer aliases mutated during the digest await', async () => {
    const backing = Buffer.alloc(PIN.archiveByteLength + 16);
    backing.set(readArchive(), 8);
    const alias = backing.subarray(8, backing.length - 8);
    const pending = admitCokAmigaPortrait18(alias, REQUEST);
    backing.fill(0);
    expect(hash((await admittedImage(pending)).original.indices)).toBe(PIN.decoded.indicesSha256);
  });

  it.each([0, 2 + 7 * 6, 2 + 7 * 6 + 2, 46355, 51113, 165454])(
    'rejects one-byte archive mutation at %i before decoding', async (off) => {
      const bytes = readArchive(); bytes[off] ^= 1;
      await expectAdmissionFailure(admitCokAmigaPortrait18(bytes, REQUEST), /archive SHA-256/);
    },
  );

  it('rejects legacy decoding and forged decoded layout/geometry/pixel evidence', async () => {
    await expect(validateCokAmigaPortrait18DecodedEvidence(decodeDaa(readArchive(), 'PIC1.DAA')))
      .rejects.toThrow(/tail-layout/);
    const mutations: ((arc: DaaArchive) => void)[] = [
      (arc) => { arc.dataBase++; },
      (arc) => { arc.subFrames[7].blockId = 59; },
      (arc) => { arc.subFrames[7].subOffset++; },
      (arc) => { arc.subFrames[7].pixOff++; },
      (arc) => { arc.subFrames[7].numDist = 2; },
      (arc) => { arc.subFrames[7].width = 80; },
      (arc) => { arc.subFrames[7].frames[0].height = 80; },
      (arc) => { arc.subFrames[7].frames[0].transparentIndex = 0; },
      (arc) => { arc.subFrames[7].frames[0].xOffset = 1; },
      (arc) => { Object.assign(arc.subFrames[7].tailLayout!, { layout: 'legacy-segmented' }); },
      (arc) => { arc.subFrames[7].tailLayout!.bitmapStart++; },
      (arc) => { arc.subFrames[7].tailLayout!.planarByteLength--; },
      (arc) => { arc.subFrames[7].tailLayout!.frameStride++; },
      (arc) => { arc.subFrames[7].tailLayout!.decodedStream[0] ^= 1; },
      (arc) => { arc.subFrames[7].tailLayout!.decodedStream[100] ^= 1; },
      (arc) => { arc.subFrames[7].frames[0].indices[0] ^= 1; },
      (arc) => { arc.subFrames[7].frames[0].palette!.colors[0]!.r ^= 1; },
      (arc) => { arc.frameSet.frames.delete(18); },
      (arc) => {
        const tail = arc.subFrames[7].tailLayout!;
        const oversized = new Uint8Array(82177); oversized.set(tail.decodedStream);
        tail.decodedStream = oversized.subarray(0, 5368);
      },
    ];
    for (const mutate of mutations) {
      const arc = decode(); mutate(arc);
      await expect(validateCokAmigaPortrait18DecodedEvidence(arc)).rejects.toThrow(/admission:/);
    }
  });

  it('owns the decoded evidence snapshot before asynchronous hashing', async () => {
    const arc = decode();
    const pending = validateCokAmigaPortrait18DecodedEvidence(arc);
    arc.subFrames[7].frames[0].indices.fill(0);
    arc.subFrames[7].tailLayout!.decodedStream.fill(0);
    arc.subFrames[7].frames[0].palette!.colors[0]!.r ^= 1;
    expect(hash((await pending).indices)).toBe(PIN.decoded.indicesSha256);
  });

  it('rejects another existing entry relabeled #18 without changing the array length', async () => {
    const arc = decode();
    arc.subFrames[0].blockId = 18;
    expect(arc.subFrames.length).toBe(27);
    expect(arc.subFrames[7].blockId).toBe(18);
    await expect(validateCokAmigaPortrait18DecodedEvidence(arc)).rejects.toThrow(/identity\/order/);
  });
});

it.skipIf(!haveNativeTools)(
  'local native PNG lineage fixture (GB_COK_AMIGA_18_NATIVE + archive; missing path/Python/Pillow => SKIP)', async () => {
    expect(hash(new Uint8Array(readFileSync(nativePath)))).toBe(PIN.source.sha256);
    // Pillow is an explicit local fixture prerequisite; no image or decoder dependency is vendored.
    const native = JSON.parse(execFileSync('python', ['-c',
      'import sys,json,hashlib; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGBA"); print(json.dumps(dict(size=im.size,rgba=hashlib.sha256(im.tobytes()).hexdigest())))',
      nativePath], { encoding: 'utf8' }));
    expect(native.size).toEqual([88, 88]);
    expect(native.rgba).toBe(PIN.decoded.opaqueRgbaSha256);
    expect(hash(indexedToRGBA((await admittedImage(admitCokAmigaPortrait18(readArchive(), REQUEST))).original)))
      .toBe(native.rgba);
  },
);

for (const [label, relative, expected] of [
  ['full prompt', PIN.source.prompt, PIN.source.promptSha256],
  ['generation input', PIN.source.input, PIN.source.inputSha256],
  ['raw generation output', PIN.restyle.rawOutput, PIN.restyle.rawOutputSha256],
]) {
  const path = `${lineageRoot}/${relative}`;
  it.skipIf(!existsSync(path))(`local ${label} lineage fixture (${relative}; missing => SKIP)`, () => {
    expect(hash(new Uint8Array(readFileSync(path)))).toBe(expected);
  });
}

it.skipIf(!existsSync(rawOutputPath))('local raw generation PNG cannot substitute for the reviewed import (missing => SKIP)', async () => {
  const bytes = new Uint8Array(readFileSync(rawOutputPath));
  expect(hash(bytes)).toBe(PIN.restyle.rawOutputSha256);
  await expect(validateCokAmigaPortrait18ImportedPng(bytes)).rejects.toThrow(/imported PNG/);
});

it.skipIf(!existsSync(priorImportPath))('local previous imported PNG cannot substitute for the reviewed import (GB_COK_AMIGA_18_PRIOR_IMPORT; missing => SKIP)', async () => {
  const bytes = new Uint8Array(readFileSync(priorImportPath));
  expect(hash(bytes)).toBe('255a5fbd5a2650303dc7adb4008e9cb5af0931bd3f0d1b342f76551a3d85c883');
  expect(hash(bytes)).not.toBe(PIN.restyle.sha256);
  await expect(validateCokAmigaPortrait18ImportedPng(bytes)).rejects.toThrow(/imported PNG/);
});

describe.skipIf(!existsSync(importPath))('local approved imported PNG fixture (GB_COK_AMIGA_18_IMPORT; missing => SKIP)', () => {
  it('accepts the exact reviewed import and owns its snapshot during digest', async () => {
    const bytes = readFileSync(importPath);
    expect(bytes.length).toBe(2726186);
    expect(hash(bytes)).toBe(PIN.restyle.sha256);
    const pending = validateCokAmigaPortrait18ImportedPng(bytes);
    bytes.fill(0);
    expect(hash(await pending)).toBe(PIN.restyle.sha256);
  });
  it.each([0, 11, 16, 20, 24, 25, 26, 1000, 2726185])('rejects imported PNG mutation at %i', async (off) => {
    const bytes = new Uint8Array(readFileSync(importPath)); bytes[off] ^= 1;
    await expect(validateCokAmigaPortrait18ImportedPng(bytes)).rejects.toThrow(/imported PNG/);
  });
});
