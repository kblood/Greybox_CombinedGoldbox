import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeDax } from '../src/loaders/dax.js';
import { parseVgaPaletteRecord } from '../src/loaders/daxVgaPaletteRecord.js';

/**
 * Every location the project's own docs (`CLAUDE.md`) say holds DOS `.DAX` files. Amiga (.DAA)
 * and C64 (.d64/.g64) sources are excluded on purpose: this record's DAC-byte gate (`<= 63`)
 * only means anything for a 6-bit-VGA-DAC container, and neither of those platforms ships one.
 */
const ROOTS = [
  'C:/Modding/GoldBox/Champions of Krynn',
  'C:/Modding/GoldBox/Death Knights of Krynn',
  'C:/Modding/GoldBox/The Dark Queen of Krynn',
  'C:/Program Files (x86)/GOG Galaxy/Games',
  'D:/Games/Emulator/DOS/Goldbox',
].filter((root) => existsSync(root));

function walkDaxFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else if (entry.toLowerCase().endsWith('.dax')) out.push(full);
    }
  }
  return out;
}

interface Hit {
  title: string;
  file: string;
  blockId: number;
  raw: Uint8Array;
}

function sweepCorpus(): Hit[] {
  const hits: Hit[] = [];
  for (const root of ROOTS) {
    for (const path of walkDaxFiles(root)) {
      let archive;
      try {
        archive = decodeDax(new Uint8Array(readFileSync(path)), path.split(/[\\/]/).pop()!);
      } catch {
        continue;
      }
      for (const block of archive.blocks) {
        if (parseVgaPaletteRecord(block.raw)) {
          const title = path.replace(/\\/g, '/').split('/').slice(-2, -1)[0]!;
          hits.push({ title, file: path.split(/[\\/]/).pop()!, blockId: block.blockId, raw: block.raw });
        }
      }
    }
  }
  return hits;
}

const HAVE_TREASURES = existsSync(
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/PIC1.DAX',
);

describe.skipIf(!HAVE_TREASURES || ROOTS.length === 0)('late-Gen1 VGA palette-only record', () => {
  it('claims exactly 16 blocks, all in Treasures of the Savage Frontier, and nothing else', () => {
    const hits = sweepCorpus();
    const lines = hits
      .map((h) => `${h.title}/${h.file}#${h.blockId}`)
      .sort();
    expect(lines).toEqual(
      [
        'Treasures of the Savage Frontier/OVER.DAX#1',
        'Treasures of the Savage Frontier/OVER.DAX#2',
        'Treasures of the Savage Frontier/OVER.DAX#3',
        'Treasures of the Savage Frontier/OVER.DAX#4',
        'Treasures of the Savage Frontier/PIC1.DAX#38',
        'Treasures of the Savage Frontier/PIC1.DAX#47',
        'Treasures of the Savage Frontier/PIC1.DAX#48',
        'Treasures of the Savage Frontier/PIC1.DAX#57',
        'Treasures of the Savage Frontier/PIC1.DAX#68',
        'Treasures of the Savage Frontier/PIC1.DAX#70',
        'Treasures of the Savage Frontier/PIC1A.DAX#78',
        'Treasures of the Savage Frontier/PIC1A.DAX#81',
        'Treasures of the Savage Frontier/PIC1A.DAX#89',
        'Treasures of the Savage Frontier/PIC1A.DAX#90',
        'Treasures of the Savage Frontier/PIC1A.DAX#100',
        'Treasures of the Savage Frontier/PIC1A.DAX#119',
      ].sort(),
    );
    expect(hits.length).toBe(16);
    // Every hit is Treasures — no other title's install (Pools, Buck, the two EGA titles, DQK)
    // contributes one, over every root this test can see.
    expect(new Set(hits.map((h) => h.title))).toEqual(new Set(['Treasures of the Savage Frontier']));
  });

  it('every hit decodes to paletteBase 0x20 / colorCount 223 / a 798-byte block with a 119-byte tail', () => {
    const hits = sweepCorpus();
    for (const hit of hits) {
      const record = parseVgaPaletteRecord(hit.raw)!;
      expect(record.paletteBase).toBe(0x20);
      expect(record.colorCount).toBe(223);
      expect(hit.raw.length).toBe(798);
      expect(record.lookupSeed.length).toBe(111);
      expect(record.tailExtra.length).toBe(8);
      for (const c of record.palette.colors) {
        if (c) {
          expect(c.r).toBeGreaterThanOrEqual(0);
          expect(c.r).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('all 16 decoded palettes are pairwise distinct', () => {
    const hits = sweepCorpus();
    const digests = new Set<string>();
    for (const hit of hits) {
      const record = parseVgaPaletteRecord(hit.raw)!;
      const bytes = new Uint8Array(record.colorCount * 3);
      for (let i = 0; i < record.colorCount; i++) {
        const c = record.palette.colors[record.paletteBase + i]!;
        bytes[i * 3] = c.r;
        bytes[i * 3 + 1] = c.g;
        bytes[i * 3 + 2] = c.b;
      }
      digests.add(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(digests.size).toBe(16);
  });

  it('the twelve PIC1/PIC1A blocks share a 64-byte prefix and differ in 29..108 bytes after it', () => {
    const gog = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
    const ids: Record<string, number[]> = {
      PIC1: [38, 47, 48, 57, 68, 70],
      PIC1A: [78, 81, 89, 90, 100, 119],
    };
    const raws: Uint8Array[] = [];
    for (const [name, blockIds] of Object.entries(ids)) {
      const archive = decodeDax(new Uint8Array(readFileSync(`${gog}/${name}.DAX`)), `${name}.DAX`);
      for (const id of blockIds) {
        const block = archive.blocks.find((b) => b.blockId === id)!;
        expect(block.kind).toBe('vga-palette-record');
        raws.push(block.raw);
      }
    }
    expect(raws.length).toBe(12);
    let commonPrefix = 0;
    while (raws.every((r) => r[commonPrefix] === raws[0]![commonPrefix])) commonPrefix++;
    expect(commonPrefix).toBe(64);

    const first = raws[0]!;
    const diffCounts = raws.map((r) => {
      let n = 0;
      for (let i = 0; i < r.length; i++) if (r[i] !== first[i]) n++;
      return n;
    });
    // First record diffs 0 against itself; every other one is in the measured 29..108 band.
    for (const n of diffCounts.slice(1)) {
      expect(n).toBeGreaterThanOrEqual(29);
      expect(n).toBeLessThanOrEqual(108);
    }
  });

  it('the OVER.DAX blocks decode too, distinct from each other and from the PIC1/PIC1A twelve', () => {
    const gog = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
    const archive = decodeDax(new Uint8Array(readFileSync(`${gog}/OVER.DAX`)), 'OVER.DAX');
    const overBlocks = [1, 2, 3, 4].map((id) => archive.blocks.find((b) => b.blockId === id)!);
    for (const b of overBlocks) expect(b.kind).toBe('vga-palette-record');
    const digests = overBlocks.map((b) => createHash('sha256').update(b.raw).digest('hex'));
    expect(new Set(digests).size).toBe(4);
  });

  it('does not double-decode: the 16 blocks are unreachable from any other kind (frames empty, one swatch image)', () => {
    const gog = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
    const archive = decodeDax(new Uint8Array(readFileSync(`${gog}/PIC1.DAX`)), 'PIC1.DAX');
    const block = archive.blocks.find((b) => b.blockId === 38)!;
    expect(block.kind).toBe('vga-palette-record');
    expect(block.frames).toEqual([]);
    expect(block.image).not.toBeNull();
    expect(block.image!.width).toBe(16);
    expect(block.image!.height).toBe(14);
    expect(block.image!.indices.length).toBe(16 * 14);
    // Pinned digest of the decoded 223-colour palette (OVER.DAX#1) — proves the DAC-byte scaling
    // is exact, not just "some non-null value". XOR one byte of this string and the assertion
    // below must fail (verified manually; see vgaPaletteRecord.test.ts's test file history / the
    // R5 handoff note for the mutation record).
    const over = decodeDax(new Uint8Array(readFileSync(`${gog}/OVER.DAX`)), 'OVER.DAX');
    const overBlock1 = over.blocks.find((b) => b.blockId === 1)!;
    const record = parseVgaPaletteRecord(overBlock1.raw)!;
    const bytes = new Uint8Array(record.colorCount * 3);
    for (let i = 0; i < record.colorCount; i++) {
      const c = record.palette.colors[record.paletteBase + i]!;
      bytes[i * 3] = c.r;
      bytes[i * 3 + 1] = c.g;
      bytes[i * 3 + 2] = c.b;
    }
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '0c095267804de9cee4b9cc751b7d56460de19e758c53bb0e90a2886c49c4efdf',
    );
  });
});
