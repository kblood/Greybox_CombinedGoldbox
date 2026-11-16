import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDax, parseVgaCompressedPicture } from '../src/index.js';

const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';
/** Every retail SPRIT family this format covers, with its measured block and frame totals. */
const SPRIT_CORPUS = [
  { title: 'Buck Rogers', dir: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday', files: ['SPRIT1', 'SPRIT2', 'SPRIT3', 'SPRIT4', 'SPRIT5', 'SPRIT6'], blocks: 35, paletteBase: 32, colorCount: 224 },
  { title: 'Pools of Darkness', dir: `${GOG}/Pools of Darkness`, files: ['SPRIT1'], blocks: 29, paletteBase: 32, colorCount: 224 },
  { title: 'Treasures', dir: `${GOG}/Treasures of the Savage Frontier`, files: ['SPRIT1'], blocks: 13, paletteBase: 176, colorCount: 80 },
] as const;
/** EGA titles whose identically-named files must keep falling through to the older path. */
const EGA_CONTROL = [
  { title: 'Champions of Krynn', dir: `${GOG}/Champions of Krynn`, files: ['SPRIT1', 'SPRIT2', 'SPRIT3'], blocks: 36 },
  { title: 'Death Knights of Krynn', dir: `${GOG}/Death Knights of Krynn`, files: ['SPRIT1', 'SPRIT2', 'SPRIT3', 'SPRIT4'], blocks: 16 },
] as const;

const haveAll = (entries: readonly { dir: string; files: readonly string[] }[]): boolean =>
  entries.every((entry) => entry.files.every((name) => existsSync(`${entry.dir}/${name}.DAX`)));

const BUCK = 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday';
/**
 * The PIC families, with the frame-count histogram each title actually ships. These are the blocks
 * that decide which field holds the count: the SPRIT triples agree under either reading, and only
 * here do the two rules diverge.
 */
const PIC_CORPUS = [
  { title: 'Buck Rogers', dir: BUCK, files: ['pic1', 'pic2', 'pic3', 'pic4', 'pic5', 'pic6', 'pic7', 'pic8', 'pic9'], blocks: 40, frames: 88, histogram: '1x28 3x3 4x4 6x3 8x1 9x1', undecoded: 0 },
  { title: 'Pools of Darkness', dir: `${GOG}/Pools of Darkness`, files: ['PIC1'], blocks: 49, frames: 81, histogram: '1x41 2x1 3x2 4x1 6x2 8x2', undecoded: 0 },
  { title: 'Treasures', dir: `${GOG}/Treasures of the Savage Frontier`, files: ['PIC1', 'PIC1A'], blocks: 139, frames: 130, histogram: '1x126 4x1', undecoded: 12 },
] as const;

/** Where the record headers begin, or null if the block fails the palette/geometry gates. */
function recordStartOf(raw: Uint8Array): number | null {
  if (raw.length < 21) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const width = view.getUint16(2, true) * 8;
  const height = view.getUint16(0, true);
  if (!width || !height || width > 4096 || height > 2048) return null;
  const colorCount = raw[10]!;
  if (colorCount < 2 || (colorCount & 1) !== 0 || raw[9]! + colorCount > 256) return null;
  const start = 11 + colorCount * 3 + colorCount / 2 + 4;
  return start + 5 > raw.length ? null : start;
}

/**
 * Do the two structural constraints hold at this candidate frame count? The declared lengths must
 * sum to exactly the bytes left after the headers, and every payload must expand to exactly
 * `width * height`. Deliberately independent of `parseVgaCompressedPicture` so the uniqueness null
 * below is not the parser grading its own homework.
 */
function structurallyFits(raw: Uint8Array, frameCount: number): boolean {
  const start = recordStartOf(raw);
  if (start === null) return false;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const expected = view.getUint16(2, true) * 8 * view.getUint16(0, true);
  const headersEnd = start + 2 + frameCount * 3;
  if (headersEnd > raw.length) return false;
  const lengths: number[] = [];
  let declared = 0;
  for (let i = 0; i < frameCount; i++) {
    const length = view.getUint16(start + 2 + i * 3, true);
    lengths.push(length);
    declared += length;
  }
  if (headersEnd + declared !== raw.length) return false;
  let at = headersEnd;
  for (const length of lengths) {
    let input = at;
    const end = at + length;
    let out = 0;
    while (input < end && out < expected) {
      const control = raw[input++]!;
      if (control < 128) {
        input += control + 1;
        out += control + 1;
      } else {
        input += 1;
        out += 257 - control;
      }
    }
    if (input !== end || out !== expected) return false;
    at = end;
  }
  return true;
}

function syntheticPicture(): Uint8Array {
  const pixels = Uint8Array.from({ length: 16 }, (_, index) => 32 + (index & 1));
  const compressed = Uint8Array.from([15, ...pixels]);
  const raw = new Uint8Array(11 + 6 + 1 + 4 + 5 + compressed.length);
  const view = new DataView(raw.buffer);
  view.setUint16(0, 2, true);
  view.setUint16(2, 1, true);
  raw[9] = 32;
  raw[10] = 2;
  raw.set([0, 0, 0, 63, 63, 63], 11);
  const record = 11 + 6 + 1 + 4;
  view.setUint16(record + 2, compressed.length, true);
  raw[record + 4] = 0;
  raw.set(compressed, record + 5);
  return raw;
}

describe('late Gen1 compressed VGA portrait', () => {
  it('strictly expands a flat DRAW18 stream', () => {
    const picture = parseVgaCompressedPicture(syntheticPicture());
    expect(picture && {
      width: picture.width,
      height: picture.height,
      mode: picture.mode,
      indices: [...picture.indices],
      firstColor: picture.palette.firstColor,
      count: picture.palette.count,
    }).toEqual({
      width: 8,
      height: 2,
      mode: 0,
      indices: [32, 33, 32, 33, 32, 33, 32, 33, 32, 33, 32, 33, 32, 33, 32, 33],
      firstColor: 32,
      count: 2,
    });
  });

  const retailPath = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/PIC1.DAX';
  it.skipIf(!existsSync(retailPath))('matches the native-RAM-verified retail portrait', () => {
    const archive = decodeDax(new Uint8Array(readFileSync(retailPath)), 'PIC1.DAX');
    const block = archive.blocks.find((candidate) => candidate.blockId === 21)!;
    expect(block.kind).toBe('vga-compressed-picture');
    expect(block.image && createHash('sha256').update(block.image.indices).digest('hex'))
      .toBe('3ad4f8c2f7db4c8146ee7a40a40edb0f3d58f58669be7c433a97b7fbdd1ff58e');
  });

  /**
   * `SPRIT*.DAX` was in this format all along. The loader read the word at `recordStart` as a
   * required structural zero — it is `frameCount - 1` — and so returned null for every single
   * block in three shipped titles, two of which advertise "monster sprites" in their browser
   * manifest.
   *
   * The number that decides this is the null, not the hit: the assertion below records that the
   * OLD rule accepted **0 of 77** blocks, so "the blocks now decode" is a change of state and not
   * a widened tolerance quietly re-labelling what already worked.
   */
  describe.skipIf(!haveAll(SPRIT_CORPUS))('SPRIT monster view-sizes', () => {
    it('decodes every retail block as three exact 88x88 frames', () => {
      const seen: string[] = [];
      let totalBlocks = 0;
      let totalFrames = 0;
      let acceptedByOldRule = 0;
      for (const entry of SPRIT_CORPUS) {
        let blocksHere = 0;
        for (const name of entry.files) {
          const archive = decodeDax(new Uint8Array(readFileSync(`${entry.dir}/${name}.DAX`)), `${name}.DAX`);
          for (const block of archive.blocks) {
            blocksHere++;
            const picture = parseVgaCompressedPicture(block.raw)!;
            seen.push(`${entry.title}/${name}#${block.blockId}:${block.kind}:${picture?.frames.length}:${picture?.width}x${picture?.height}`);
            expect(block.kind).toBe('vga-compressed-picture');
            expect(block.frames?.length).toBe(3);
            expect(picture.palette.firstColor).toBe(entry.paletteBase);
            expect(picture.palette.count).toBe(entry.colorCount);
            for (const frame of picture.frames) expect(frame.indices.length).toBe(88 * 88);
            if (oldSingleRecordRuleAccepts(block.raw)) acceptedByOldRule++;
            totalFrames += picture.frames.length;
          }
        }
        expect(`${entry.title}:${blocksHere}`).toBe(`${entry.title}:${entry.blocks}`);
        totalBlocks += blocksHere;
      }
      expect(totalBlocks).toBe(77);
      expect(totalFrames).toBe(231);
      // The null. Every one of the 77 was rejected before, so nothing here is a re-label.
      expect(acceptedByOldRule).toBe(0);
      expect(seen.filter((line) => !line.endsWith(':3:88x88')).length).toBe(0);
    });

    it('is a near/mid/far triple, and the frames really differ', () => {
      const archive = decodeDax(
        new Uint8Array(readFileSync(`${GOG}/Pools of Darkness/SPRIT1.DAX`)),
        'SPRIT1.DAX',
      );
      // Coverage shrinks monotonically across the three view-sizes in EVERY block — the signature
      // of the Gold Box monster distance triple, and something a mis-parse has no reason to produce.
      const shrinking = archive.blocks.filter((block) => {
        const covered = block.frames!.map((f) => f.indices.reduce((n, v) => n + (v ? 1 : 0), 0));
        return covered[0]! > covered[1]! && covered[1]! > covered[2]!;
      });
      expect(shrinking.length).toBe(archive.blocks.length);
      expect(archive.blocks.length).toBe(29);

      const first = archive.blocks[0]!;
      const digests = first.frames!.map((f) => createHash('sha256').update(f.indices).digest('hex'));
      expect(new Set(digests).size).toBe(3);
      expect(digests[0]).toBe('4d1c0b5b0a0258f07778f43447d33c57815b0d6465aa284e711882a2e1780a82');
    });

    it('does not claim the EGA titles that ship files of the same name', () => {
      for (const entry of EGA_CONTROL) {
        let blocks = 0;
        for (const name of entry.files) {
          const archive = decodeDax(new Uint8Array(readFileSync(`${entry.dir}/${name}.DAX`)), `${name}.DAX`);
          for (const block of archive.blocks) {
            blocks++;
            expect(`${entry.title}/${name}#${block.blockId}`).toBe(`${entry.title}/${name}#${block.blockId}`);
            expect(parseVgaCompressedPicture(block.raw)).toBeNull();
            expect(block.kind).not.toBe('vga-compressed-picture');
          }
        }
        expect(`${entry.title}:${blocks}`).toBe(`${entry.title}:${entry.blocks}`);
      }
    });
  });
});


/**
 * Which field holds the frame count. The first fix read the `u16` at `recordStart`, which is 0 on a
 * PIC portrait and 2 on a SPRIT triple and so looked like `frameCount - 1`. It is not: the count is
 * the standard DAX header's `item_count` at byte 8. SPRIT cannot tell the two apart — every SPRIT
 * block agrees under both — so these PIC families are the whole experiment.
 */
describe.skipIf(!haveAll(PIC_CORPUS))('late Gen1 PIC frame counts', () => {
  it('decodes each title to its shipped histogram, every frame 88x88', () => {
    const lines: string[] = [];
    let total = 0;
    let frames = 0;
    for (const entry of PIC_CORPUS) {
      const counts = new Map<number, number>();
      let blocksHere = 0;
      let undecoded = 0;
      for (const name of entry.files) {
        const path = `${entry.dir}/${name}.DAX`;
        if (!existsSync(path)) continue;
        const archive = decodeDax(new Uint8Array(readFileSync(path)), `${name}.DAX`);
        for (const block of archive.blocks) {
          blocksHere++;
          const picture = parseVgaCompressedPicture(block.raw);
          if (!picture) {
            undecoded++;
            continue;
          }
          counts.set(picture.frames.length, (counts.get(picture.frames.length) ?? 0) + 1);
          frames += picture.frames.length;
          expect(`${entry.title}/${name}#${block.blockId}:${picture.width}x${picture.height}`)
            .toBe(`${entry.title}/${name}#${block.blockId}:88x88`);
          expect(block.kind).toBe('vga-compressed-picture');
          expect(block.frames?.length).toBe(picture.frames.length);
        }
      }
      const histogram = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}x${v}`).join(' ');
      lines.push(`${entry.title}: ${blocksHere} blocks, ${histogram}, ${undecoded} undecoded`);
      total += blocksHere;
    }
    expect(lines).toEqual(PIC_CORPUS.map((e) => `${e.title}: ${e.blocks} blocks, ${e.histogram}, ${e.undecoded} undecoded`));
    expect(total).toBe(228);
    expect(frames).toBe(299);
  });

  it('the null: exactly one of sixteen candidate counts fits, and byte 8 is it every time', () => {
    let accepted = 0;
    let ambiguous = 0;
    let notTheHeaderField = 0;
    let wordRuleDisagrees = 0;
    let modeAboveOne = 0;
    for (const entry of [...PIC_CORPUS, ...SPRIT_CORPUS]) {
      for (const name of entry.files) {
        const path = `${entry.dir}/${name}.DAX`;
        if (!existsSync(path)) continue;
        const archive = decodeDax(new Uint8Array(readFileSync(path)), `${name}.DAX`);
        for (const block of archive.blocks) {
          const picture = parseVgaCompressedPicture(block.raw);
          if (!picture) continue;
          accepted++;
          const fits: number[] = [];
          for (let n = 1; n <= 16; n++) if (structurallyFits(block.raw, n)) fits.push(n);
          if (fits.length !== 1) ambiguous++;
          if (fits[0] !== block.raw[8]! + 1) notTheHeaderField++;
          const start = recordStartOf(block.raw)!;
          const view = new DataView(block.raw.buffer, block.raw.byteOffset, block.raw.byteLength);
          if (view.getUint16(start, true) + 1 !== block.raw[8]! + 1) wordRuleDisagrees++;
          if (picture.frames.some((frame) => frame.mode > 1)) modeAboveOne++;
        }
      }
    }
    expect(accepted).toBe(293);
    // The count is pinned by the bytes alone, in every block, without consulting any header field.
    expect(ambiguous).toBe(0);
    // ...and the field agrees with that unique answer 293/293. A wrong field would break here.
    expect(notTheHeaderField).toBe(0);
    // The rule this replaces. It is right 275 times and wrong 18 times, all in multi-frame PIC.
    expect(wordRuleDisagrees).toBe(18);
    // And the reason the `mode <= 1` gate had to go: it would have discarded these exact blocks.
    expect(modeAboveOne).toBe(24);
  });

  it('names the twelve Treasures blocks it still cannot read', () => {
    const leftovers: string[] = [];
    const digests = new Set<string>();
    const raws: Uint8Array[] = [];
    for (const name of ['PIC1', 'PIC1A']) {
      const path = `${GOG}/Treasures of the Savage Frontier/${name}.DAX`;
      const archive = decodeDax(new Uint8Array(readFileSync(path)), `${name}.DAX`);
      for (const block of archive.blocks) {
        if (parseVgaCompressedPicture(block.raw)) continue;
        leftovers.push(`${name}.DAX#${block.blockId}`);
        digests.add(createHash('sha256').update(block.raw).digest('hex'));
        raws.push(block.raw);
        // Not a picture under this reading at all: zero width, zero height, odd colour count.
        expect(`${name}#${block.blockId}`).toBe(`${name}#${block.blockId}`);
        expect(block.raw.length).toBe(798);
        expect([block.raw[0], block.raw[1], block.raw[2], block.raw[3], block.raw[10]]).toEqual([0, 0, 0, 0, 21]);
      }
    }
    expect(leftovers).toEqual([
      'PIC1.DAX#38', 'PIC1.DAX#47', 'PIC1.DAX#48', 'PIC1.DAX#57', 'PIC1.DAX#68', 'PIC1.DAX#70',
      'PIC1A.DAX#78', 'PIC1A.DAX#81', 'PIC1A.DAX#89', 'PIC1A.DAX#90', 'PIC1A.DAX#100', 'PIC1A.DAX#119',
    ]);
    // Twelve DISTINCT records, not one repeated: they share a 64-byte prefix and then diverge in
    // 29..108 of their 798 bytes. So this is one unknown record *type* with twelve instances, and
    // the shared prefix is where a future reading should start.
    expect(digests.size).toBe(12);
    let commonPrefix = 0;
    while (raws.every((r) => r[commonPrefix] === raws[0]![commonPrefix])) commonPrefix++;
    expect(commonPrefix).toBe(64);
    expect(new Set(raws.map((r) => r.length))).toEqual(new Set([798]));
  });
});

/**
 * The accept rule this module used before 2026-08-26: one record, its declared length running to
 * the exact end of the block. Kept as executable history so the "0 of 77" null above is a measured
 * statement about the old code rather than a claim in a comment.
 */
function oldSingleRecordRuleAccepts(raw: Uint8Array): boolean {
  if (raw.length < 21) return false;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const paletteBase = raw[9]!;
  const colorCount = raw[10]!;
  if (colorCount < 2 || (colorCount & 1) !== 0 || paletteBase + colorCount > 256) return false;
  const recordStart = 11 + colorCount * 3 + colorCount / 2 + 4;
  if (recordStart + 5 > raw.length) return false;
  if (view.getUint16(recordStart, true) !== 0) return false;
  return recordStart + 5 + view.getUint16(recordStart + 2, true) === raw.length;
}
