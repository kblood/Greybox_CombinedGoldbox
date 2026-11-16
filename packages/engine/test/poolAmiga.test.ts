/**
 * Pool of Radiance Amiga `.dax` — TS port golden parity, PLAN-ROUND-32.md R3.
 *
 * Fixture: `test/fixtures/pool-amiga-golden.json` (hashes only, no pixel data — see
 * `tools/pool_amiga_golden.py`). It is CHECKED IN and does not require the external
 * WHDLoad source to read; matching it against a fresh decode of the real files does.
 *
 * Three things are proven here:
 *   1. 843/843 decompressed-block sha256 hashes match the Python oracle, and every
 *      decoded frame's index-array hash matches too (N/N, N reported below).
 *   2. The null: flip one bit of the FIRST compressed byte per block and re-decode —
 *      expected 0/843 blocks still hash-match (the negative control the acceptance bar
 *      names), against the alternative "the port merely renders plausibly" that a
 *      hash-only comparison could otherwise miss.
 *   3. Consumer: `decodeAsset` reaches this loader via its `pool-amiga` branch for
 *      every one of the 23 real files (not just direct `decodePoolAmiga` calls).
 *
 * Absent WHDLoad source => SKIP (never fail) — matches every other Amiga-corpus test
 * in this suite (see buckAmigaArt.test.ts, daaIndexValidation.test.ts).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeAsset, decodePoolAmiga, sniffPoolAmiga } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, 'fixtures', 'pool-amiga-golden.json');

const DATA_DIR =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data';

const haveCorpus = existsSync(DATA_DIR);
const haveFixture = existsSync(FIXTURE_PATH);

interface GoldenBlock {
  index: number;
  blockId: number;
  dataOffset: number;
  compSize: number;
  rawSize: number;
  rawSha256: string;
  kind: 'standard' | 'animated' | 'data';
  frameCount: number;
  frameSha256: string[];
}
interface GoldenFile {
  blocks: GoldenBlock[];
}
interface GoldenFixture {
  files: Record<string, GoldenFile>;
  totals: { files: number; blocks: number; frames: number };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function loadFixture(): GoldenFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GoldenFixture;
}

describe.skipIf(!haveFixture)('Pool-Amiga golden fixture sanity', () => {
  it('totals match what tools/pool_amiga_golden.py and docs/pool-amiga-format.md name', () => {
    const fixture = loadFixture();
    expect(fixture.totals.files).toBe(23);
    expect(fixture.totals.blocks).toBe(843);
    expect(fixture.totals.frames).toBe(1672);
  });
});

describe.skipIf(!haveCorpus || !haveFixture)('Pool-Amiga TS port vs Python oracle (real corpus)', () => {
  const fixture = loadFixture();

  it('has the same 23 files as the checked-in fixture (corpus has not drifted)', () => {
    const files = readdirSync(DATA_DIR)
      .filter((f) => /\.dax$/i.test(f))
      .sort();
    expect(files).toEqual(Object.keys(fixture.files).sort());
  });

  it('843/843 block hashes and 1672/1672 frame hashes match, against the alternative that the ' +
      'port merely renders plausibly (see the bit-flip null test below)', () => {
    let blocksChecked = 0;
    let blocksMatched = 0;
    let framesChecked = 0;
    let framesMatched = 0;

    for (const [name, expected] of Object.entries(fixture.files)) {
      const bytes = new Uint8Array(readFileSync(join(DATA_DIR, name)));
      const archive = decodePoolAmiga(bytes, name);
      expect(archive.blocks.length, `${name} block count`).toBe(expected.blocks.length);

      for (const expBlock of expected.blocks) {
        const block = archive.blocks[expBlock.index]!;
        expect(block.blockId, `${name} block ${expBlock.index} id`).toBe(expBlock.blockId);
        blocksChecked++;
        const rawHash = sha256Hex(block.raw);
        if (rawHash === expBlock.rawSha256) blocksMatched++;
        expect(rawHash, `${name} block ${expBlock.blockId} raw hash`).toBe(expBlock.rawSha256);
        expect(block.kind, `${name} block ${expBlock.blockId} kind`).toBe(expBlock.kind);

        const frames = block.frames ?? [];
        expect(frames.length, `${name} block ${expBlock.blockId} frame count`).toBe(expBlock.frameCount);
        frames.forEach((frame, i) => {
          framesChecked++;
          const h = sha256Hex(frame.indices);
          if (h === expBlock.frameSha256[i]) framesMatched++;
          expect(h, `${name} block ${expBlock.blockId} frame ${i} index hash`).toBe(expBlock.frameSha256[i]);
        });
      }
    }

    expect(blocksChecked).toBe(843);
    expect(`${blocksMatched}/${blocksChecked}`).toBe('843/843');
    expect(framesChecked).toBe(1672);
    expect(`${framesMatched}/${framesChecked}`).toBe('1672/1672');
  });

  it('null: flipping one bit of the first compressed byte per block breaks the hash match ' +
      '(expect 0/843 blocks to still match) — proves the comparison above is not vacuous', () => {
    let stillMatch = 0;
    let total = 0;
    for (const [name, expected] of Object.entries(fixture.files)) {
      const bytes = new Uint8Array(readFileSync(join(DATA_DIR, name)));
      for (const expBlock of expected.blocks) {
        total++;
        const mutated = bytes.slice();
        // dataBase = 2 + word0 (BE u16); flip bit 0 of the block's first compressed byte.
        const word0 = (mutated[0]! << 8) | mutated[1]!;
        const dataBase = 2 + word0;
        const at = dataBase + expBlock.dataOffset;
        mutated[at] = mutated[at]! ^ 0x01;
        try {
          const archive = decodePoolAmiga(mutated, name);
          const block = archive.blocks[expBlock.index]!;
          if (sha256Hex(block.raw) === expBlock.rawSha256) stillMatch++;
        } catch {
          // A checksum failure or a corrupted match-offset walking off the buffer both count
          // as "does not still match" — the mutation broke something, which is the point.
        }
      }
    }
    expect(total).toBe(843);
    expect(stillMatch).toBe(0);
  });
});

describe.skipIf(!haveCorpus)('Pool-Amiga sniff + decodeAsset consumer', () => {
  it('sniffPoolAmiga claims every real file, and decodeAsset reaches decodePoolAmiga for each', () => {
    const files = readdirSync(DATA_DIR).filter((f) => /\.dax$/i.test(f));
    expect(files.length).toBe(23);
    for (const name of files) {
      const bytes = new Uint8Array(readFileSync(join(DATA_DIR, name)));
      expect(sniffPoolAmiga(bytes), `${name} sniffPoolAmiga`).toBe(true);
      const decoded = decodeAsset(bytes, name);
      expect(decoded.format, `${name} decodeAsset format`).toBe('pool-amiga');
    }
  });

  it('sniffPoolAmiga rejects a truncated/corrupted file (the sniffer can say no)', () => {
    const bytes = new Uint8Array(readFileSync(join(DATA_DIR, 'bacpac.dax')));
    expect(sniffPoolAmiga(bytes.slice(0, 5))).toBe(false); // too small to hold even one TOC entry
    const corrupted = bytes.slice();
    corrupted[0] = 0xff; // implausible word0
    corrupted[1] = 0xff;
    expect(sniffPoolAmiga(corrupted)).toBe(false);
  });
});
