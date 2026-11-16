/**
 * WALLDEF index-table tests. Synthetic record framing + entry classification, plus a
 * golden against the real CoK WALLDEF1 block 23 values (research dax-complex-subframe §C.1).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeWalldefBlock,
  walldefEntryKind,
  walldefTileIndex,
  sniffWalldef,
  readDaxDataBlocks,
  WALLDEF_RECORD_SIZE,
  WALLDEF_SLICES,
  WALLDEF_COLUMNS,
} from '../src/index.js';

describe('WALLDEF table decode', () => {
  it('splits a 2-record block into 5×156 slices each', () => {
    const raw = new Uint8Array(2 * WALLDEF_RECORD_SIZE);
    // Tag record 1, slice 2, column 3 so we can find it.
    raw[WALLDEF_RECORD_SIZE + 2 * WALLDEF_COLUMNS + 3] = 0x77;
    const { records } = decodeWalldefBlock(raw);
    expect(records).toHaveLength(2);
    expect(records[0].slices).toHaveLength(WALLDEF_SLICES);
    expect(records[0].slices[0]).toHaveLength(WALLDEF_COLUMNS);
    expect(records[1].slices[2][3]).toBe(0x77);
  });

  it('trims trailing all-zero records as padding (Neverwinter Nights DOS finding)', () => {
    // Neverwinter Nights (DOS/AOL) pads every WALLDEF block to a uniform 3-record (2340-byte)
    // size even when only the first record carries real tile data — see
    // docs/engine/research/neverwinter-nights-dos-eclinit.md. A block with real data only in
    // record 0 should decode as a single record, not three.
    const raw = new Uint8Array(3 * WALLDEF_RECORD_SIZE);
    raw[10] = 0x30; // record 0, slice 0, column 10 — real data
    const { records } = decodeWalldefBlock(raw);
    expect(records).toHaveLength(1);
    expect(records[0].slices[0][10]).toBe(0x30);
  });

  it('never trims a fully all-zero block below one record', () => {
    const raw = new Uint8Array(2 * WALLDEF_RECORD_SIZE); // entirely zero
    const { records } = decodeWalldefBlock(raw);
    expect(records).toHaveLength(1);
  });

  it('keeps a real trailing record even when an earlier one is degenerate', () => {
    const raw = new Uint8Array(2 * WALLDEF_RECORD_SIZE);
    raw[WALLDEF_RECORD_SIZE + 10] = 0x31; // only record 1 has real data
    const { records } = decodeWalldefBlock(raw);
    expect(records).toHaveLength(2); // trailing record IS real, nothing trimmed
  });

  it('rejects a non-multiple length', () => {
    expect(() => decodeWalldefBlock(new Uint8Array(100))).toThrow(/multiple/);
    expect(sniffWalldef(new Uint8Array(100))).toBe(false);
    expect(sniffWalldef(new Uint8Array(WALLDEF_RECORD_SIZE))).toBe(true);
  });

  it('classifies and resolves entries', () => {
    expect(walldefEntryKind(0)).toBe('none');
    expect(walldefEntryKind(1)).toBe('border');
    expect(walldefEntryKind(0x2d)).toBe('tile');
    expect(walldefTileIndex(0)).toBeNull();
    expect(walldefTileIndex(1)).toBeNull();
    expect(walldefTileIndex(0x2d)).toBe(0x2d);
    expect(walldefTileIndex(0x2d, 10)).toBe(0x2d + 10);
  });
});

// --- Golden: real CoK WALLDEF1 block 23 (skips if game data absent) ----------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const walldef1 = resolve(repoRoot, 'Champions of Krynn', 'WALLDEF1.DAX');

describe('WALLDEF — golden CoK WALLDEF1 block 23', () => {
  it.skipIf(!existsSync(walldef1))('matches the documented 5×156 table head', async () => {
    const bytes = new Uint8Array(await readFile(walldef1));
    const blk23 = readDaxDataBlocks(bytes).find((b) => b.blockId === 23)!;
    expect(blk23).toBeDefined();
    expect(blk23.raw.length).toBe(WALLDEF_RECORD_SIZE); // 1 record

    const { records } = decodeWalldefBlock(blk23.raw);
    expect(records).toHaveLength(1);
    // Research §C.1: first 16 columns of each of the 5 slices.
    const head = (s: number) => Array.from(records[0].slices[s].slice(0, 16));
    expect(head(0)).toEqual([113, 65, 1, 46, 75, 79, 1, 46, 75, 78, 1, 1, 1, 93, 93, 46]);
    expect(head(1)).toEqual([113, 75, 1, 93, 75, 81, 1, 93, 65, 80, 1, 1, 1, 46, 46, 93]);
    expect(head(2)).toEqual([113, 104, 1, 46, 104, 114, 1, 46, 104, 115, 1, 1, 1, 46, 62, 46]);
    expect(head(3)).toEqual([113, 91, 1, 46, 92, 96, 1, 46, 92, 97, 1, 1, 1, 46, 49, 46]);
    expect(head(4)).toEqual([113, 105, 1, 46, 76, 55, 1, 46, 76, 56, 1, 1, 1, 46, 61, 46]);
    // The recurring `1`s at fixed columns (2,6,10,11,12) are the border symbol.
    for (const s of [0, 1, 2, 3, 4]) {
      for (const c of [2, 6, 10, 11, 12]) expect(walldefEntryKind(records[0].slices[s][c])).toBe('border');
    }
  });
});
