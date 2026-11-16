import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeDax } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const games = {
  cok: resolve(repoRoot, 'Champions of Krynn'),
  dok: resolve(repoRoot, 'Death Knights of Krynn'),
  nwn: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint',
};

interface LoaderTriplet {
  offset: number;
  blockId: number;
  destOffset: number;
  cellCount: number;
}

function scanLoad24x24Triplets(bytes: Uint8Array): LoaderTriplet[] {
  const out: LoaderTriplet[] = [];
  for (let i = 0; i < bytes.length - 16; i++) {
    if (
      bytes[i] === 0xb0
      && bytes[i + 2] === 0x50
      && bytes[i + 3] === 0xb0
      && bytes[i + 5] === 0x50
      && bytes[i + 6] === 0xb0
      && bytes[i + 8] === 0x50
      && bytes[i + 9] === 0x9a
      && bytes[i + 10] === 0x25
      && bytes[i + 11] === 0x00
    ) {
      out.push({ offset: i, blockId: bytes[i + 1]!, destOffset: bytes[i + 4]!, cellCount: bytes[i + 7]! });
    }
  }
  return out;
}

function tileCounts(path: string): number[] {
  const archive = decodeDax(new Uint8Array(readFileSync(path)), path);
  return archive.blocks.map((block) => block.raw[8] ?? 0);
}

describe('cross-game Load24x24Set combat tile-bank anchors', () => {
  const haveOldEngineGames = [
    resolve(games.cok, 'GAME.OVR'),
    resolve(games.dok, 'GAME.OVR'),
    resolve(games.nwn, 'GAME.OVR'),
    resolve(games.cok, 'DUNGCOM.DAX'),
    resolve(games.cok, 'WILDCOM.DAX'),
    resolve(games.cok, 'RANDCOM.DAX'),
    resolve(games.dok, 'DUNGCOM.DAX'),
    resolve(games.dok, 'WILDCOM.DAX'),
    resolve(games.nwn, 'DUNGCOM.DAX'),
    resolve(games.nwn, 'RANDCOM.DAX'),
  ].every(existsSync);

  it.skipIf(!haveOldEngineGames)('pins old-engine combat tile-bank loader arguments against real DAX tile counts', () => {
    const cokTriplets = scanLoad24x24Triplets(new Uint8Array(readFileSync(resolve(games.cok, 'GAME.OVR'))));
    const dokTriplets = scanLoad24x24Triplets(new Uint8Array(readFileSync(resolve(games.dok, 'GAME.OVR'))));
    const nwnTriplets = scanLoad24x24Triplets(new Uint8Array(readFileSync(resolve(games.nwn, 'GAME.OVR'))));

    expect(cokTriplets).toEqual(expect.arrayContaining([
      { offset: 0xf1e4, blockId: 1, destOffset: 0, cellCount: 0x19 },
      { offset: 0xf203, blockId: 1, destOffset: 0, cellCount: 0x21 },
      { offset: 0xf220, blockId: 1, destOffset: 0x22, cellCount: 0x06 },
    ]));
    expect(dokTriplets).toEqual(expect.arrayContaining([
      { offset: 0xce73, blockId: 1, destOffset: 0, cellCount: 0x19 },
      { offset: 0xcea3, blockId: 1, destOffset: 0, cellCount: 0x26 },
    ]));
    expect(nwnTriplets).toEqual(expect.arrayContaining([
      { offset: 0xe04c, blockId: 1, destOffset: 0, cellCount: 0x21 },
      { offset: 0xee4f, blockId: 1, destOffset: 0, cellCount: 0x19 },
      { offset: 0xee71, blockId: 1, destOffset: 0x22, cellCount: 0x06 },
    ]));

    expect(tileCounts(resolve(games.cok, 'DUNGCOM.DAX'))).toEqual([25]);
    expect(tileCounts(resolve(games.cok, 'WILDCOM.DAX'))).toEqual([35]);
    expect(tileCounts(resolve(games.cok, 'RANDCOM.DAX'))).toEqual([6]);
    expect(tileCounts(resolve(games.dok, 'DUNGCOM.DAX'))).toEqual([25]);
    expect(tileCounts(resolve(games.dok, 'WILDCOM.DAX'))).toEqual([38]);
    expect(existsSync(resolve(games.dok, 'RANDCOM.DAX'))).toBe(false);
    expect(tileCounts(resolve(games.nwn, 'DUNGCOM.DAX')).slice(0, 6)).toEqual([26, 26, 26, 26, 26, 26]);
    expect(tileCounts(resolve(games.nwn, 'RANDCOM.DAX'))).toEqual([6]);
    expect(existsSync(resolve(games.nwn, 'WILDCOM.DAX'))).toBe(false);
  });
});
