import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDaa, type DaaArchive } from '../src/loaders/daa.js';
import {
  admitCokAmigaTravel, COK_AMIGA_TRAVEL_BASE_SOURCE, COK_AMIGA_TRAVEL_SOURCE,
  validateCokAmigaTravelDecodedEvidence,
} from '../../../apps/web/src/ui/cokAmigaTravelArt.js';
import { COK_TRAVEL_SOURCE } from '../../../apps/web/src/ui/cokTravelArt.js';
import manifest from '../../../apps/web/src/ui/cokAmigaTravelManifest.json';

const PIN = {
  archiveByteLength: 103275,
  archiveSha256: '6267f07ad52f4a7bc6bdf958c5201e7b4e3bc826547ec3c7626579ee9bf89fed',
  blockSha256: 'e75ffeaeb94e8b86dd1e96e0252905cb169374e9fc8534994897833263dc5438',
  baseSource: {
    game: 'cok', system: 'DOS-EGA', archive: 'BIGPIC1.DAX',
    archiveSha256: '34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec',
    blockId: 121, frameIndex: 0,
    blockSha256: '62b78a91d3e1b876f15ef70396c87b03279a996b22b5a16f781208f9bea0b395',
  },
  rgbSha256: '1986e5875cf01e505a42d978bef08a6d55a9c55f2f66da39504f679707873f35',
};
const REQUEST = {
  game: 'cok', system: 'Amiga', archive: 'BIGPIC1.DAA', archiveSha256: PIN.archiveSha256,
  blockId: 121, frameIndex: 0, blockSha256: PIN.blockSha256,
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('CoK Amiga BIGPIC1 #121 source admission', () => {
  it('pins the candidate source and links it to the exact existing DOS travel identity', () => {
    expect(manifest.archiveByteLength).toBe(PIN.archiveByteLength);
    expect(manifest.archiveSha256).toBe(PIN.archiveSha256);
    expect(manifest.blockSha256).toBe(PIN.blockSha256);
    expect(manifest.baseSource).toEqual(PIN.baseSource);
    expect(COK_AMIGA_TRAVEL_SOURCE).toEqual(REQUEST);
    expect(COK_AMIGA_TRAVEL_BASE_SOURCE).toBe(COK_TRAVEL_SOURCE);
    expect(Object.isFrozen(COK_AMIGA_TRAVEL_SOURCE)).toBe(true);
    expect(manifest.archiveProvenance).toMatch(/candidate-package copy only/i);
  });

  it.each([
    ['game', 'dok'], ['system', 'DOS-EGA'], ['archive', 'BIGPIC1.DAX'],
    ['archiveSha256', '0'.repeat(64)], ['blockId', 120], ['frameIndex', 1], ['blockSha256', '0'.repeat(64)],
  ])('rejects requested source mismatch (%s)', async (key, value) => {
    const result = await admitCokAmigaTravel(new Uint8Array(PIN.archiveByteLength), { ...REQUEST, [key]: value });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/requested identity/) });
  });

  it('rejects missing, truncated, and same-size foreign archive bytes', async () => {
    expect(await admitCokAmigaTravel(new Uint8Array(0), REQUEST))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/byte length/) });
    expect(await admitCokAmigaTravel(new Uint8Array(PIN.archiveByteLength - 1), REQUEST))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/byte length/) });
    expect(await admitCokAmigaTravel(new Uint8Array(PIN.archiveByteLength), REQUEST))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/archive SHA-256/) });
  });

  it('rejects incomplete decoded container evidence', async () => {
    const empty = { kind: 'blocks', dataBase: 47, blocks: [], subFrames: [],
      frameSet: { name: '', kind: 'unknown', frames: new Map() }, name: '' } as DaaArchive;
    await expect(validateCokAmigaTravelDecodedEvidence(empty)).rejects.toThrow(/container differs/);
  });
});

const archivePath = process.env.GB_COK_AMIGA_TRAVEL_ARCHIVE
  ?? 'C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/assets/amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA';
describe.skipIf(!existsSync(archivePath))('local exact candidate-package archive fixture', () => {
  it('admits the pinned #121 block and snapshots decoded image buffers', async () => {
    const bytes = new Uint8Array(readFileSync(archivePath));
    expect(bytes.byteLength).toBe(PIN.archiveByteLength);
    expect(hash(bytes)).toBe(PIN.archiveSha256);
    const decoded = decodeDaa(bytes, 'BIGPIC1.DAA');
    expect([decoded.kind, decoded.dataBase, decoded.blocks.length]).toEqual(['blocks', 47, 5]);
    const matches = decoded.blocks.filter((block) => block.blockId === 121);
    expect(matches).toHaveLength(1);
    expect(hash(matches[0]!.raw)).toBe(PIN.blockSha256);
    const pending = validateCokAmigaTravelDecodedEvidence(decoded);
    matches[0]!.raw.fill(0);
    matches[0]!.image!.indices.fill(0);
    const image = await pending;
    expect(image.width).toBe(304);
    expect(image.height).toBe(120);
    expect(hash(rgbBytes(image))).toBe(PIN.rgbSha256);
  });

  it('rejects one-byte archive mutations before decoding admission', async () => {
    const bytes = new Uint8Array(readFileSync(archivePath));
    bytes[0] ^= 1;
    expect(await admitCokAmigaTravel(bytes, REQUEST))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/archive SHA-256/) });
  });

  it.each([
    ['raw block bytes', (archive: DaaArchive) => { archive.blocks.find((block) => block.blockId === 121)!.raw[0] ^= 1; }, /raw block SHA-256/],
    ['duplicate block ID', (archive: DaaArchive) => { archive.blocks[0]!.blockId = 121; }, /exactly one selected block ID/],
    ['geometry', (archive: DaaArchive) => { archive.blocks.find((block) => block.blockId === 121)!.image!.width++; }, /geometry or opacity/],
    ['placement', (archive: DaaArchive) => { archive.blocks.find((block) => block.blockId === 121)!.image!.xOffset++; }, /geometry or opacity/],
    ['transparency', (archive: DaaArchive) => { archive.blocks.find((block) => block.blockId === 121)!.image!.transparentIndex = 0; }, /geometry or opacity/],
    ['undefined palette color', (archive: DaaArchive) => {
      archive.blocks.find((block) => block.blockId === 121)!.image!.palette!.colors[0] = null;
    }, /palette\/image opacity/],
    ['native RGB pixels', (archive: DaaArchive) => {
      archive.blocks.find((block) => block.blockId === 121)!.image!.palette!.colors[0]!.r ^= 1;
    }, /native RGB SHA-256/],
  ])('rejects altered decoded evidence: %s', async (_label, mutate, reason) => {
    const decoded = decodeDaa(new Uint8Array(readFileSync(archivePath)), 'BIGPIC1.DAA');
    mutate(decoded);
    await expect(validateCokAmigaTravelDecodedEvidence(decoded)).rejects.toThrow(reason);
  });
});

function rgbBytes(image: { indices: Uint8Array; palette: { colors: ({ r: number; g: number; b: number } | null)[] } | null }): Uint8Array {
  const out = new Uint8Array(image.indices.length * 3);
  for (let i = 0; i < image.indices.length; i++) {
    const color = image.palette!.colors[image.indices[i]!]!;
    out[i * 3] = color.r;
    out[i * 3 + 1] = color.g;
    out[i * 3 + 2] = color.b;
  }
  return out;
}
