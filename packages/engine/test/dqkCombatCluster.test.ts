import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_TILES,
  DQK_BACKGROUND_TILES,
  DQK_ART_LAYOUT,
  backgroundTileRecordBytes,
  decodeBackgroundTileRecords,
  decodeHlib,
  dqkNativeCombatTerrainMemberByte,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const dqkExe = resolve(repoRoot, 'The Dark Queen of Krynn', 'DQK.EXE');
const dqkDisk2 = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK2');

function asciiAt(bytes: Uint8Array, offset: number, text: string): string {
  return new TextDecoder('latin1').decode(bytes.slice(offset, offset + text.length));
}

function hexAt(bytes: Uint8Array, offset: number, length: number): string {
  return [...bytes.slice(offset, offset + length)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

function findBytePattern(bytes: Uint8Array, pattern: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i <= bytes.length - pattern.length; i++) {
    let ok = true;
    for (let p = 0; p < pattern.length; p++) {
      if (bytes[i + p] !== pattern[p]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

function indexOfBackgroundTile(tile: { moveCost: number; field1: number; height: number; tileIndex: number }): number {
  return BACKGROUND_TILES.findIndex((candidate) => (
    candidate.moveCost === tile.moveCost
    && candidate.field1 === tile.field1
    && candidate.height === tile.height
    && candidate.tileIndex === tile.tileIndex
  ));
}

function hlibSetImageCounts(bytes: Uint8Array, name: string): number[] {
  const archive = decodeHlib(bytes, name);
  const counts = new Map<number, number>();
  for (const image of archive.images) {
    const match = /^set(\d+)_img/.exec(image.label);
    if (!match) continue;
    const set = Number(match[1]);
    counts.set(set, (counts.get(set) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([, count]) => count);
}

function hlibMasterSetEntries(bytes: Uint8Array): {
  id: number;
  pointerNo: number;
  leafBase: number;
  leafEnd: number;
}[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint16(8, true) + 1;
  const tag = asciiAt(bytes, 12, 'HLIB');
  expect(tag).toBe('HLIB');

  const ptrs: number[] = [];
  for (let i = 0; i < count; i++) {
    ptrs.push(dv.getUint32(16 + i * 4, true));
  }

  const table = ptrs[0]!;
  const entries = dv.getUint16(table, true);
  const out: { id: number; pointerNo: number; leafBase: number; leafEnd: number }[] = [];
  for (let i = 0; i < entries; i++) {
    const id = dv.getUint16(table + 2 + i * 4, true);
    const pointerNo = dv.getUint16(table + 4 + i * 4, true);
    const leafBase = ptrs[pointerNo]!;
    const leafEnd = ptrs[pointerNo + 1] ?? bytes.length;
    expect(leafEnd).toBeGreaterThan(leafBase);
    out.push({ id, pointerNo, leafBase, leafEnd });
  }
  return out;
}

function hlibLeafPaletteHeader(bytes: Uint8Array, leafPointerNo: number): {
  cycle: number;
  first: number;
  ncol: number;
  nranges: number;
  cmagic: number;
} {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint16(8, true) + 1;
  const tag = asciiAt(bytes, 12, 'HLIB');
  expect(tag).toBe('HLIB');
  expect(leafPointerNo).toBeGreaterThan(0);
  expect(leafPointerNo).toBeLessThan(count - 1);

  const leafBase = dv.getUint32(16 + leafPointerNo * 4, true);
  expect(asciiAt(bytes, leafBase + 12, 'TILE')).toBe('TILE');
  const firstMember = leafBase + dv.getUint32(leafBase + 16, true);
  return {
    cycle: dv.getUint16(firstMember, true),
    first: dv.getUint16(firstMember + 2, true),
    ncol: dv.getUint16(firstMember + 4, true),
    nranges: bytes[firstMember + 6]!,
    cmagic: bytes[firstMember + 7]!,
  };
}

function hlibSetLabel(setNo: number, memberByte: number): string | null {
  return memberByte === 0
    ? null
    : `set${setNo.toString().padStart(2, '0')}_img${memberByte.toString().padStart(3, '0')}`;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectRowsMapToHlibLabels(
  rows: readonly { moveCost: number; field1: number; height: number; tileIndex: number }[],
  labels: ReadonlySet<string>,
): void {
  for (const row of rows) {
    const memberByte = (row.tileIndex + 1) & 0xff;
    const label = hlibSetLabel(1, memberByte);
    expect(label, `tileIndex ${row.tileIndex.toString(16)} -> member ${memberByte}`).not.toBeNull();
    expect(labels.has(label!)).toBe(true);
  }
}

describe('DQK overlay-12 combat setup cluster', () => {
  it.skipIf(!existsSync(dqkExe))('pins combat UI, tile-bank strings, and BackGroundTiles anchors in DQK.EXE', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(asciiAt(bytes, 0x684a1, 'attack ally?')).toBe('attack ally?');
    expect(asciiAt(bytes, 0x684af, 'Aim: range =')).toBe('Aim: range =');
    expect(asciiAt(bytes, 0x68ad3, 'Move Aim Use Cast Turn Guard Quick')).toBe('Move Aim Use Cast Turn Guard Quick');
    expect(asciiAt(bytes, 0x68b22, 'Next Prev Manual Target Center Exit')).toBe('Next Prev Manual Target Center Exit');
    expect(asciiAt(bytes, 0x697bb, 'COMSPR')).toBe('COMSPR');
    expect(asciiAt(bytes, 0x697c2, 'DungCom1')).toBe('DungCom1');
    expect(asciiAt(bytes, 0x697cb, 'WildCom1')).toBe('WildCom1');
    expect(asciiAt(bytes, 0x698f8, 'A battle begins')).toBe('A battle begins');

    expect(hexAt(bytes, 0x69ba7, 16)).toBe('13 01 00 01 01 01 00 ff ff ff 00 ff ff 00 01 01');
    expect(hexAt(bytes, 0x69bb7, 16)).toBe('01 00 ff 00 ff 01 02 00 ff 01 02 01 ff 01 02 02');
    expect(hexAt(bytes, 0x69c27, 16)).toBe('01 01 00 0d 01 01 00 0c 01 01 00 14 01 01 00 15');
    expect(hexAt(bytes, 0x69c37, 16)).toBe('ff 01 02 00 ff 01 02 01 ff 01 02 02 ff 01 02 03');
  });

  it.skipIf(!existsSync(dqkExe))('carves the known DQK BackGroundTiles runs and local variant rows', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(decodeBackgroundTileRecords(bytes, 0x69bb7, 26)).toEqual(BACKGROUND_TILES.slice(0, 26));
    expect(decodeBackgroundTileRecords(bytes, 0x69c37, 12)).toEqual(BACKGROUND_TILES.slice(32, 44));
    expect(decodeBackgroundTileRecords(bytes, 0x69bb7, DQK_BACKGROUND_TILES.length)).toEqual(DQK_BACKGROUND_TILES);

    const preludeA = decodeBackgroundTileRecords(bytes, 0x69ba7, 4);
    expect(preludeA).toEqual([
      { moveCost: 0x13, field1: 1, height: 0, tileIndex: 1 },
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0xff },
      { moveCost: 0xff, field1: 0xff, height: 0, tileIndex: 0xff },
      { moveCost: 0xff, field1: 0, height: 1, tileIndex: 1 },
    ]);
    expect(preludeA.map(indexOfBackgroundTile)).toEqual([-1, -1, -1, -1]);

    const variantRows = decodeBackgroundTileRecords(bytes, 0x69c1f, 6);
    expect(variantRows).toEqual([
      { moveCost: 2, field1: 2, height: 0, tileIndex: 0x26 },
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0x0e },
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0x0d },
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0x0c },
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0x14 },
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0x15 },
    ]);
    expect(variantRows.map(indexOfBackgroundTile)).toEqual([-1, 15, 45, 13, -1, -1]);
    expect(variantRows).not.toEqual(BACKGROUND_TILES.slice(26, 32));

    const row44Variant = decodeBackgroundTileRecords(bytes, 0x69c67, 1);
    const row48To49Variants = decodeBackgroundTileRecords(bytes, 0x69c77, 2);
    expect(row44Variant).toEqual([{ moveCost: 2, field1: 1, height: 0, tileIndex: 0x0c }]);
    expect(row44Variant).not.toEqual(BACKGROUND_TILES.slice(44, 45));
    expect(row48To49Variants).toEqual([
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0x10 },
      { moveCost: 1, field1: 1, height: 0, tileIndex: 0x11 },
    ]);
    expect(row48To49Variants).not.toEqual(BACKGROUND_TILES.slice(48, 50));

    expect(decodeBackgroundTileRecords(bytes, 0x69c7f, 2)).toEqual([
      { moveCost: 2, field1: 1, height: 0, tileIndex: 0x12 },
      { moveCost: 2, field1: 1, height: 0, tileIndex: 0x13 },
    ]);

    expect(backgroundTileRecordBytes(BACKGROUND_TILES[0]!)).toEqual([...bytes.slice(0x69bb7, 0x69bbb)]);
    expect(backgroundTileRecordBytes(BACKGROUND_TILES[32]!)).toEqual([...bytes.slice(0x69c37, 0x69c3b)]);
  });

  it.skipIf(!existsSync(dqkExe))('pins the DQK combat tile-bank loader wrapper call sites', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(findBytePattern(bytes, [0xff, 0x36, 0x03, 0xca])).toEqual([0x2cc15, 0x2cc2e]);
    const tileBankLoaderLcall = [0x9a, 0x07, 0x00, 0x4c, 0x10];
    expect(findBytePattern(bytes, tileBankLoaderLcall)).toEqual([0x2cc1e, 0x2cc37]);

    expect(hexAt(bytes, 0x2cc0f, 25)).toBe(
      'b0 19 50 b0 00 50 ff 36 03 ca 1e b8 a2 5d 50 9a 07 00 4c 10 83 c4 0a eb 17',
    );
    expect(hexAt(bytes, 0x2cc28, 25)).toBe(
      'b0 27 50 b0 00 50 ff 36 03 ca 1e b8 ab 5d 50 9a 07 00 4c 10 83 c4 0a c4 1e',
    );

    expect(hexAt(bytes, 0x128c7, 11)).toBe('55 8b ec b0 32 50 9a d1 01 a4 09');
    expect(hexAt(bytes, 0x128e1, 25)).toBe(
      '1e b8 d4 c5 50 b0 00 50 b0 00 50 ff 76 0a ff 76 08 ff 76 06 9a dc 01 a4 09',
    );
    expect(hexAt(bytes, 0x128fc, 13)).toBe('ff 36 d6 c5 ff 36 d4 c5 9a 8c 0b a4 09');
    expect(findBytePattern(bytes.slice(0x128c7, 0x1290c), [0xff, 0x76, 0x0e])).toEqual([]);
    expect(hexAt(bytes, 0xc01c, 12)).toBe('55 8b ec 83 ec 5c 56 57 c4 5e 10 26');
    expect(hexAt(bytes, 0xc9cc, 12)).toBe('55 8b ec 9a bc 14 b7 12 0a c0 75 09');
  });

  it.skipIf(!existsSync(dqkExe))('pins the DQK combat context key ca03 lifecycle anchors', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(hexAt(bytes, 0x35afc, 22)).toBe('b8 02 00 50 56 1e b8 03 ca 50 b8 00 3f 50 9a ef 26 d7 00 83 c4 0a');
    expect(hexAt(bytes, 0x363aa, 22)).toBe('b8 02 00 50 56 1e b8 03 ca 50 b8 00 40 50 9a ef 26 d7 00 83 c4 0a');
    expect(hexAt(bytes, 0x3801f, 15)).toBe('b8 04 00 50 1e b8 03 ca 50 9a 15 00 93 10 83');
    expect(hexAt(bytes, 0x38215, 15)).toBe('b8 04 00 50 1e b8 03 ca 50 9a 15 00 93 10 83');
    expect(hexAt(bytes, 0x420ac, 110)).toBe(
      '55 8b ec 83 ec 02 b0 02 50 9a 13 00 33 20 59 b0 01 50 9a 12 01 33 20 59 88 46 fe b0 02 50 9a 12 01 33 20 59 88 46 ff 8a 46 fe c4 1e 0f b2 26 88 47 13 ff 76 fe 9a b9 13 99 1d 59 c4 1e 0f b2 26 c6 47 03 00 80 7e ff ff 74 24 8a 46 ff b4 00 3b 06 03 ca 74 19 1e b8 a8 b7 50 9a 09 00 a4 09 59 59 c6 06 43 ae 00 8a 46 ff b4 00 a3 03 ca',
    );
    expect(findBytePattern(bytes, [0x9a, 0xb9, 0x13, 0x99, 0x1d])).toEqual([0x35cb6, 0x420e1]);
  });

  it.skipIf(!existsSync(dqkExe))('pins DQK 0x2033 operand parser/accessor bodies and caller patterns', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(hexAt(bytes, 0x31d24, 16)).toBe('55 8b ec 8a 46 06 a2 c4 ac 5d cb a0 c4 ac cb 55');
    expect(hexAt(bytes, 0x31d33, 80)).toBe(
      '55 8b ec 83 ec 06 56 c6 46 fb 00 be 01 00 e9 d9 00 a1 f9 b7 40 c4 1e 5c ae 03 d8 26 8a 07 88 84 15 b2 a1 f9 b7 40 40 8b 1e 5c ae 03 d8 26 8a 07 88 84 85 b1 83 06 f9 b7 02 8a 84 15 b2 b4 00 b9 05 00 bb 68 00 2e 3b 07 74 07 43 43 e2 f7 e9 98',
    );
    expect(hexAt(bytes, 0x31e32, 80)).toBe(
      '55 8b ec 83 ec 02 8a 46 06 98 8b d8 8a 87 85 b1 88 46 fe 8a 46 06 98 8b d8 8a 87 6a ae 88 46 ff 8a 46 06 98 8b d8 8a 87 15 b2 b4 00 b9 06 00 bb 53 01 2e 3b 07 74 06 43 43 e2 f7 eb 59 2e ff 67 0c 00 00 01 00 02 00 03 00 80 00 81 00 6b 01 72',
    );
    expect(hexAt(bytes, 0x31e92, 60)).toBe(
      '8a 46 06 98 8b d8 ff b7 15 b2 8a 46 ff b4 00 b1 08 d3 e0 8a 56 fe b6 00 03 c2 50 9a cf 11 99 1d 59 59 eb 14 8a 46 ff b4 00 b1 08 d3 e0 8a 56 fe b6 00 0b c2 eb 02 33 c0 8b e5 5d cb',
    );

    expect(findBytePattern(bytes, [0x9a, 0x13, 0x00, 0x33, 0x20])).toEqual([
      0x040320,
      0x04033d,
      0x04035a,
      0x040377,
      0x040394,
      0x0416ef,
      0x0416fb,
      0x041707,
      0x041713,
      0x04171e,
      0x041729,
      0x041734,
      0x041748,
      0x041753,
      0x041767,
      0x041772,
      0x041786,
      0x041fb7,
      0x042056,
      0x0420b5,
      0x04216c,
      0x0421ab,
      0x0422ff,
      0x042332,
      0x0423f0,
      0x042442,
      0x04258d,
      0x0428e0,
      0x0429e2,
      0x042bc2,
      0x042c66,
      0x043074,
      0x043145,
      0x043191,
      0x043204,
      0x0432b9,
      0x043344,
      0x0433b5,
      0x0434b1,
      0x04357b,
      0x043627,
    ]);
    expect(findBytePattern(bytes, [0x9a, 0x12, 0x01, 0x33, 0x20])).toEqual([
      0x041741,
      0x041760,
      0x04177f,
      0x041fd1,
      0x04206a,
      0x0420be,
      0x0420ca,
      0x04219b,
      0x042322,
      0x0423f9,
      0x04240c,
      0x04241f,
      0x042432,
      0x042452,
      0x042596,
      0x0425a2,
      0x0425ae,
      0x0425ba,
      0x0425c6,
      0x0428e9,
      0x0429eb,
      0x042a0c,
      0x042bcb,
      0x042bd7,
      0x042bed,
      0x042c76,
      0x042c8b,
      0x042ca0,
      0x04307d,
      0x043089,
      0x04309a,
      0x0430a6,
      0x043211,
      0x04334d,
      0x043362,
      0x0433be,
      0x043584,
      0x043635,
    ]);

    expect(hexAt(bytes, 0x43071, 64)).toBe(
      'b0 04 50 9a 13 00 33 20 59 b0 01 50 9a 12 01 33 20 59 a2 e8 be b0 02 50 9a 12 01 33 20 59 c4 1e 0f b2 26 88 47 38 b0 03 50 9a 12 01 33 20 59 a2 ca b1 b0 04 50 9a 12 01 33 20 59 a2 e7 c2 ff 36',
    );
    expect(hexAt(bytes, 0x416f8, 56)).toBe(
      'b0 02 50 9a 13 00 33 20 59 e9 8e 00 b0 03 50 9a 13 00 33 20 59 e9 82 00 b0 04 50 9a 13 00 33 20 59 eb 77 b0 05 50 9a 13 00 33 20 59 eb 6c b0 06 50 9a 13 00 33 20 59 eb',
    );
    expect(hexAt(bytes, 0x61bc3, 112)).toBe(
      '55 8b ec 83 ec 02 b0 33 50 9a 2f 11 99 1d 59 ff 36 0a ca ff 36 08 ca 16 8d 46 fe 50 ff 76 06 33 c0 50 50 1e b8 73 91 50 9a 1b 11 99 1d 83 c4 12 c4 1e 08 ca 26 8a 47 01 b4 00 26 8a 17 b6 00 f7 e2 d1 e0 d1 e0 05 08 00 3b 46 fe 74 11 1e b8 78 91 50 9a cf 03 02 11 59 59 9a 2d 00 93 10 c4 1e 08 ca 26 8a 47 01 b4 00 26 8a 17 b6 00 f7 e2 89',
    );
    expect(findBytePattern(bytes, [0x26, 0x88, 0x47, 0x13])).toEqual([0x420da, 0x50b26]);
    expect(findBytePattern(bytes, [0x26, 0x8a, 0x47, 0x13])).toEqual([0x26614, 0x35cb1]);
    expect(asciiAt(bytes, 0x6cb84, 'back1')).toBe('back1');
    expect(asciiAt(bytes, 0x6cb8a, '8x8d%c%d')).toBe('8x8d%c%d');
    expect(asciiAt(bytes, 0x6cb93, 'GEO1')).toBe('GEO1');
  });

  it.skipIf(!existsSync(dqkExe))('pins the DQK combat TLB HLIB downstream realization call chain', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(findBytePattern(bytes, [0x9a, 0x3d, 0x03, 0x3f, 0x19])).toEqual([0xc9ef]);
    expect(findBytePattern(bytes, [0x9a, 0x36, 0x05, 0x96, 0x17])).toEqual([
      0xca10,
      0x1341c,
      0x37e55,
      0x386f7,
      0x61206,
    ]);
    expect(findBytePattern(bytes, [0x9a, 0xb1, 0x00, 0x1b, 0x16])).toEqual([
      0x1a39f,
      0x3696d,
      0x36b26,
      0x38651,
    ]);
    expect(findBytePattern(bytes, [0x9a, 0x0b, 0x00, 0x1b, 0x16])).toEqual([0x37e44]);
    expect(findBytePattern(bytes, [0x9a, 0x55, 0x04, 0x1b, 0x16])).toEqual([
      0xc589,
      0x36989,
      0x36b2e,
      0x37e5d,
      0x38659,
    ]);

    expect(hexAt(bytes, 0xc9e1, 56)).toBe(
      'c4 5e 06 26 ff 37 9a fd 08 fa 17 59 52 50 9a 3d 03 3f 19 8b e5 0b c0 74 05 b8 01 00 eb 02 33 c0 50 c4 5e 06 26 ff 37 9a fd 08 fa 17 59 52 50 9a 36 05 96 17 8b e5 5d cb',
    );
    expect(hexAt(bytes, 0x1a296, 48)).toBe(
      '55 8b ec 81 ec 4c 03 56 57 16 8d 86 b4 fc 50 ff 76 0a ff 76 08 ff 76 06 9a 75 00 9b 16 83 c4 0a 89 96 fe fc 89 86 fc fc 0b d0 75 03 e9 e2 00 8a',
    );
    expect(hexAt(bytes, 0x1a39f, 14)).toBe('9a b1 00 1b 16 83 c4 0e 5f 5e 8b e5 5d cb');
    expect(hexAt(bytes, 0x18661, 32)).toBe(
      '55 8b ec 83 ec 0e 56 57 c4 5e 10 8c 46 f4 89 5e f2 c6 46 ff 00 33 ff 8b f7 e9 05 01 8b de d1 e3',
    );
    expect(hexAt(bytes, 0x185bb, 16)).toBe('56 33 c0 50 b8 00 03 50 1e b8 c5 cd 50 9a a6 27');
    expect(hexAt(bytes, 0x18a05, 16)).toBe('55 8b ec 83 ec 02 56 57 bf ff 00 c7 46 fe 00 00');
    expect(hexAt(bytes, 0x187b8, 48)).toBe(
      'c4 5e 0a 26 8a 07 d0 e8 d0 e8 88 46 fc ff 46 0a 8b 5e 0a 26 8a 07 d0 e8 d0 e8 88 46 fd ff 46 0a 8b 5e 0a 26 8a 07 d0 e8 d0 e8 88 46 fe ff 46 0a',
    );
  });

  it.skipIf(!existsSync(dqkExe))('pins the DQK 50x25 combat background-id map population routines', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(hexAt(bytes, 0x2cc04, 36)).toBe(
      'c4 1e 0f b2 26 80 7f 22 00 74 19 b0 19 50 b0 00 50 ff 36 03 ca 1e b8 a2 5d 50 9a 07 00 4c 10 83 c4 0a eb 17',
    );
    expect(hexAt(bytes, 0x2cc52, 22)).toBe(
      'c4 1e 0f b2 26 80 7f 22 00 74 06 0e e8 36 f7 eb 04 0e e8 c4 fe 8b',
    );

    expect(hexAt(bytes, 0x2bcf0, 40)).toBe(
      '55 8b ec 83 ec 02 a0 5e a9 98 ba 06 00 f7 e2 50 a0 5f a9 98 ba 05 00 f7 e2 5a 02 d0 02 56 06 80 c2 15 88 56 fe a0 5f a9',
    );
    expect(hexAt(bytes, 0x2bd3e, 29)).toBe(
      '8a 46 0a fe c0 50 8a 46 ff 98 ba 32 00 f7 e2 c4 1e db be 03 d8 8a 46 fe 98 03 d8 58 26',
    );
    expect(hexAt(bytes, 0x2c397, 32)).toBe(
      '55 8b ec 83 ec 02 b8 16 00 50 b8 e2 04 50 8b 16 dd be a1 db be 05 09 00 52 50 9a a6 27 d7 00 83',
    );
    expect(hexAt(bytes, 0x2cb2b, 29)).toBe(
      'b8 45 00 50 b8 e2 04 50 8b 16 dd be a1 db be 05 09 00 52 50 9a a6 27 d7 00 83 c4 08 c4',
    );
    expect(hexAt(bytes, 0x2c738, 48)).toBe(
      '8a 46 fe 98 ba 32 00 f7 e2 c4 1e db be 03 d8 8a 46 fd 98 03 d8 26 8a 47 09 b4 00 8b d8 d1 e3 d1 e3 81 c3 97 61 1e 07 26 80 7f 03 25 74 03 e9 e4',
    );
  });

  it.skipIf(!existsSync(dqkExe))('pins the DQK combat background-id renderer path', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(findBytePattern(bytes, [0x9a, 0x2c, 0x17, 0x40, 0x27])).toEqual([
      0x2a498,
      0x2a8db,
      0x2a90b,
      0x2ab37,
    ]);
    expect(findBytePattern(bytes, [0x9a, 0x46, 0x08, 0x40, 0x27])).toHaveLength(27);
    expect(findBytePattern(bytes, [0x9a, 0xc3, 0x0e, 0x99, 0x1d])).toEqual([
      0x802d,
      0x50bbc,
      0x562e5,
      0x56a54,
      0x56cb4,
      0x57c15,
      0x58ae4,
    ]);
    expect(hexAt(bytes, 0x20c53, 10)).toBe('e8 c7 f6 ea 46 08 40 27 00 00');
    expect(hexAt(bytes, 0x2aa06, 16)).toBe('55 8b ec 83 ec 0a c6 46 f6 00 c4 1e db be 26 8a');
    expect(hexAt(bytes, 0x2ab66, 16)).toBe('55 8b ec 83 ec 08 b0 01 50 9a ee 05 a4 09 59 8a');
    expect(hexAt(bytes, 0x2ab2b, 20)).toBe('ff 76 fb ff 76 fa ff 76 f9 ff 76 f8 9a 2c 17 40 27 83 c4 08');

    expect(findBytePattern(bytes, [0x9a, 0x15, 0x05, 0xa4, 0x09])).toEqual([
      0x12c5a,
      0x12cc4,
      0x12ce9,
      0x12d1c,
      0x2bbd1,
      0x2bbec,
      0x2bc09,
    ]);

    expect(hexAt(bytes, 0x2ba4c, 32)).toBe(
      '55 8b ec 83 ec 04 56 57 8a 46 06 98 8b f8 8a 46 06 98 03 f8 8a 46 06 98 03 f8 d1 e7 d1 e7 81 c7',
    );
    expect(hexAt(bytes, 0x2ba88, 40)).toBe(
      '8a 46 0c 98 ba 32 00 f7 e2 c4 1e db be 03 d8 8a 46 0a 98 03 d8 26 8a 47 09 88 46 fc 80 7e fc 4c 77 06 80 7e fc 00 75 04',
    );
    expect(hexAt(bytes, 0x2bab4, 32)).toBe(
      '8a 46 fc b4 00 8b d8 d1 e3 d1 e3 81 c3 97 61 1e 07 26 8a 47 03 88 46 fd 80 7e fc 1d 74 21 80 7e',
    );
    expect(hexAt(bytes, 0x2bba6, 56)).toBe(
      '8a 46 fc b4 00 8b d8 d1 e3 d1 e3 81 c3 97 61 1e 07 26 8a 47 03 88 46 fe ff 36 d6 c5 ff 36 d4 c5 b0 00 50 8a 46 fe fe c0 50 56 57 9a 15 05 a4 09 83 c4 0c ff 36 7f b1 ff',
    );
    expect(hexAt(bytes, 0x2bbd9, 28)).toBe(
      'ff 36 7f b1 ff 36 7d b1 b0 01 50 8a 46 fd 04 0f 50 56 57 9a 15 05 a4 09 83 c4 0c eb',
    );
  });

  it.skipIf(!existsSync(dqkExe))('pins the DQK 0x09a4:0x0515 render/copy fragment', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));

    expect(hexAt(bytes, 0xc355, 64)).toBe(
      '55 8b ec b0 01 50 9a ee 05 a4 09 59 8a 46 0a b4 00 50 c4 5e 0e 26 ff 37 ff 76 06 ff 76 08 9a d0 0b 9b 16 8b e5 5d cb 55 8b ec 8a 46 0a b4 00 50 c4 5e 0e 26 ff 37 ff 76 06 ff 76 08 9a d0 0b 9b',
    );
    expect(hexAt(bytes, 0xc6c1, 64)).toBe(
      '55 8b ec 83 ec 04 56 8b 46 06 0b 46 08 75 1b 33 c0 50 50 8a 46 12 b4 00 50 c4 5e 0e 26 ff 37 9a 82 03 3d 1a 83 c4 08 e9 d4 00 80 7e 0c 00 74 20 8a 46 0a b4 00 50 c4 5e 06 26 ff 37 9a fd 08 fa',
    );
    expect(hexAt(bytes, 0xc6f1, 80)).toBe(
      '8a 46 0a b4 00 50 c4 5e 06 26 ff 37 9a fd 08 fa 17 59 52 50 9a 80 03 3f 19 83 c4 06 8b f0 eb 07 8a 46 0a b4 00 8b f0 56 c4 5e 06 26 ff 37 9a fd 08 fa 17 59 52 50 9a a1 02 3f 19 83 c4 06 89 56 fe 89 46 fc 80 7e 12 98 72 28 8a 46 12 b4 00 50',
    );
    expect(hexAt(bytes, 0x19980, 80)).toBe(
      '55 8b ec ff 76 0c ff 76 0a 9a fd 08 fa 17 59 52 50 ff 76 08 ff 76 06 0e e8 b1 fe 8b e5 5d cb 55 8b ec 83 ec 08 56 57 16 8d 46 f8 50 ff 76 0c ff 76 0a 9a fd 08 fa 17 59 52 50 0e e8 67 f4 83 c4 0a 0b d0 75 03 e9 da 00 16 8d 46 08 50 16 8d 46',
    );

    expect(hexAt(bytes, 0x1b9ed, 64)).toBe(
      '55 8b ec 83 ec 14 56 8b 76 0a b8 10 00 50 16 8d 46 f0 50 ff 76 08 ff 76 06 9a c2 08 d7 00 83 c4 0a 81 7e f2 49 42 75 07 81 7e f0 48 4c 74 0e 1e b8 f3 9f 50 9a cf 03 02 11 59 59 eb 1a 0b f6 7c',
    );
    expect(hexAt(bytes, 0x1ba91, 64)).toBe(
      '55 8b ec 83 ec 18 56 8b 76 0a b8 10 00 50 16 8d 46 f0 50 ff 76 08 ff 76 06 9a c2 08 d7 00 83 c4 0a 81 7e f2 49 42 75 07 81 7e f0 48 4c 74 0e 1e b8 26 a0 50 9a cf 03 02 11 59 59 eb 1a 0b f6 7c',
    );
    expect(hexAt(bytes, 0x1bb70, 64)).toBe(
      '55 8b ec 83 ec 0a 33 c0 50 ff 76 08 ff 76 06 0e e8 6a fe 83 c4 06 89 56 fc 89 46 fa b8 02 00 50 16 8d 46 fe 50 52 ff 76 fa 9a c2 08 d7 00 83 c4 0a 33 d2 b8 02 00 52 50 ff 76 fc ff 76 fa 9a 7d',
    );

    expect(findBytePattern(bytes.slice(0xc355, 0xc37c), [0x9a, 0xee, 0x05, 0xa4, 0x09])).toEqual([0x6]);
    expect(findBytePattern(bytes.slice(0xc355, 0xc37c), [0x9a, 0xd0, 0x0b, 0x9b, 0x16])).toEqual([0x1e]);
    expect(findBytePattern(bytes.slice(0xc6c1, 0xc7c4), [0x9a, 0x80, 0x03, 0x3f, 0x19])).toEqual([0x44]);
    expect(findBytePattern(bytes.slice(0xc6c1, 0xc7c4), [0x9a, 0xa1, 0x02, 0x3f, 0x19])).toEqual([0x66, 0x8e]);
    expect(findBytePattern(bytes.slice(0xc6c1, 0xc7c4), [0x9a, 0xfd, 0x01, 0x3f, 0x19])).toEqual([0xd3, 0xec]);
  });

  it('matches DQK combat tile-bank strings to the catalogued TLB art banks', () => {
    expect(DQK_ART_LAYOUT.find((e) => e.name === 'DUNGCOM.TLB')).toMatchObject({
      disk: 'DISK2',
      width: 24,
      height: 24,
      imageCount: 136,
    });
    expect(DQK_ART_LAYOUT.find((e) => e.name === 'WILDCOM.TLB')).toMatchObject({
      disk: 'DISK2',
      width: 24,
      height: 24,
      imageCount: 160,
    });
    expect(DQK_ART_LAYOUT.find((e) => e.name === 'COMSPR.TLB')).toMatchObject({
      disk: 'DISK2',
      width: 24,
      height: 24,
      imageCount: 46,
    });
  });

  it.skipIf(!existsSync(resolve(dqkDisk2, 'DUNGCOM.TLB')) || !existsSync(resolve(dqkDisk2, 'WILDCOM.TLB')))(
    'pins DQK combat TLB master set counts separately from flat frame indexes',
    () => {
      const dungcom = new Uint8Array(readFileSync(resolve(dqkDisk2, 'DUNGCOM.TLB')));
      const wildcom = new Uint8Array(readFileSync(resolve(dqkDisk2, 'WILDCOM.TLB')));

      expect(hlibSetImageCounts(dungcom, 'DUNGCOM.TLB')).toEqual([26, 26, 26, 26, 32]);
      expect(hlibSetImageCounts(wildcom, 'WILDCOM.TLB')).toEqual([40, 40, 40, 40]);
      expect(decodeHlib(dungcom, 'DUNGCOM.TLB').frameSet.frames.size).toBe(136);
      expect(decodeHlib(wildcom, 'WILDCOM.TLB').frameSet.frames.size).toBe(160);
    },
  );

  it.skipIf(!existsSync(resolve(dqkDisk2, 'DUNGCOM.TLB')) || !existsSync(resolve(dqkDisk2, 'WILDCOM.TLB')))(
    'pins DQK combat TLB master set-id tables used by native group selection',
    () => {
      const dungcom = new Uint8Array(readFileSync(resolve(dqkDisk2, 'DUNGCOM.TLB')));
      const wildcom = new Uint8Array(readFileSync(resolve(dqkDisk2, 'WILDCOM.TLB')));
      const dungcomEntries = hlibMasterSetEntries(dungcom);
      const wildcomEntries = hlibMasterSetEntries(wildcom);

      expect(dungcomEntries).toEqual([
        { id: 1, pointerNo: 1, leafBase: 0x0046, leafEnd: 0x3f2e },
        { id: 5, pointerNo: 1, leafBase: 0x0046, leafEnd: 0x3f2e },
        { id: 2, pointerNo: 2, leafBase: 0x3f2e, leafEnd: 0x7e16 },
        { id: 3, pointerNo: 3, leafBase: 0x7e16, leafEnd: 0xbd02 },
        { id: 4, pointerNo: 4, leafBase: 0xbd02, leafEnd: 0xfbea },
        { id: 6, pointerNo: 5, leafBase: 0xfbea, leafEnd: 0x1489e },
      ]);
      expect(wildcomEntries).toEqual([
        { id: 1, pointerNo: 1, leafBase: 0x003a, leafEnd: 0x5f4a },
        { id: 2, pointerNo: 2, leafBase: 0x5f4a, leafEnd: 0xbe5a },
        { id: 4, pointerNo: 3, leafBase: 0xbe5a, leafEnd: 0x11d6a },
        { id: 5, pointerNo: 4, leafBase: 0x11d6a, leafEnd: 0x17c7a },
      ]);
      expect(dungcomEntries.map((entry) => entry.id)).not.toContain(101);
      expect(wildcomEntries.map((entry) => entry.id)).not.toContain(101);

      expect(decodeHlib(dungcom, 'DUNGCOM.TLB').images[0]?.label).toBe('set01_img001');
      expect(decodeHlib(wildcom, 'WILDCOM.TLB').images[0]?.label).toBe('set01_img001');
    },
  );

  it.skipIf(
    !existsSync(dqkExe) ||
    !existsSync(resolve(dqkDisk2, 'DUNGCOM.TLB')) ||
    !existsSync(resolve(dqkDisk2, 'WILDCOM.TLB')),
  )('maps recovered DQK terrain tile indexes to selected-leaf HLIB member labels', () => {
    const bytes = new Uint8Array(readFileSync(dqkExe));
    const dungcom = decodeHlib(new Uint8Array(readFileSync(resolve(dqkDisk2, 'DUNGCOM.TLB'))), 'DUNGCOM.TLB');
    const wildcom = decodeHlib(new Uint8Array(readFileSync(resolve(dqkDisk2, 'WILDCOM.TLB'))), 'WILDCOM.TLB');
    const dungLabels = new Set(dungcom.images.map((image) => image.label));
    const wildLabels = new Set(wildcom.images.map((image) => image.label));

    const dungeonRun = decodeBackgroundTileRecords(bytes, 0x69bb7, 26);
    const wildernessVariantRun = decodeBackgroundTileRecords(bytes, 0x69c1f, 6);
    const sharedRun = decodeBackgroundTileRecords(bytes, 0x69c37, 12);

    expectRowsMapToHlibLabels(dungeonRun, dungLabels);
    expectRowsMapToHlibLabels(wildernessVariantRun, wildLabels);
    expectRowsMapToHlibLabels(sharedRun, dungLabels);
    expectRowsMapToHlibLabels(sharedRun, wildLabels);

    expectRowsMapToHlibLabels(DQK_BACKGROUND_TILES, wildLabels);

    expect(dqkNativeCombatTerrainMemberByte(0)).toBe((DQK_BACKGROUND_TILES[0x15]!.tileIndex + 1) & 0xff);
    expect(dqkNativeCombatTerrainMemberByte(0x4d)).toBe((DQK_BACKGROUND_TILES[0x15]!.tileIndex + 1) & 0xff);
    expect(dqkNativeCombatTerrainMemberByte(0x4c)).toBe(0x20);
  });

  it.skipIf(!existsSync(resolve(dqkDisk2, 'DUNGCOM.TLB')) || !existsSync(resolve(dqkDisk2, 'WILDCOM.TLB')))(
    'pins DQK terrain member zero as palette table and terrain-used pixels as stable assets',
    () => {
      const dungcomBytes = new Uint8Array(readFileSync(resolve(dqkDisk2, 'DUNGCOM.TLB')));
      const wildcomBytes = new Uint8Array(readFileSync(resolve(dqkDisk2, 'WILDCOM.TLB')));
      const dungcom = decodeHlib(dungcomBytes, 'DUNGCOM.TLB');
      const wildcom = decodeHlib(wildcomBytes, 'WILDCOM.TLB');

      expect(hlibLeafPaletteHeader(dungcomBytes, 1)).toEqual({
        cycle: 5,
        first: 32,
        ncol: 224,
        nranges: 0,
        cmagic: 24,
      });
      expect(hlibLeafPaletteHeader(wildcomBytes, 1)).toEqual({
        cycle: 5,
        first: 32,
        ncol: 224,
        nranges: 0,
        cmagic: 24,
      });
      expect(dungcom.images.some((image) => image.label === 'set01_img000')).toBe(false);
      expect(wildcom.images.some((image) => image.label === 'set01_img000')).toBe(false);
      expect(DQK_BACKGROUND_TILES.map((_, id) => dqkNativeCombatTerrainMemberByte(id))).not.toContain(0);

      const dungImg001 = dungcom.images.find((image) => image.label === 'set01_img001');
      const dungImg026 = dungcom.images.find((image) => image.label === 'set01_img026');
      const wildImg001 = wildcom.images.find((image) => image.label === 'set01_img001');
      const wildImg032 = wildcom.images.find((image) => image.label === 'set01_img032');
      const wildImg039 = wildcom.images.find((image) => image.label === 'set01_img039');

      expect(dungImg001 && sha256Hex(dungImg001.image.indices)).toBe(
        '5374ee8eac84e1c81f9ec7cc4baaf67f27559d3e1cf7cd668ed308a7ffa303da',
      );
      expect(dungImg026 && sha256Hex(dungImg026.image.indices)).toBe(
        'bf34ef55466e70a804b97dfb92b5736f676926a913f905306387f5996959c02b',
      );
      expect(wildImg001 && sha256Hex(wildImg001.image.indices)).toBe(
        'c952ff4cb2adf6fe8a18c3510f860ed14723b3406981f1c8ad28625457fc02a1',
      );
      expect(wildImg032 && sha256Hex(wildImg032.image.indices)).toBe(
        '012dcfbd4420cfa3e9209eb356c68317eb8914018c1502d1738e123223024598',
      );
      expect(wildImg039 && sha256Hex(wildImg039.image.indices)).toBe(
        '882beee20a1d4c70a96fc6162ef84096b0834c25c2aa4cf96c8ca6e31db67c20',
      );
    },
  );
});
