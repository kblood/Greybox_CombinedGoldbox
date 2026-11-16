import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  composePoolAreaMapWindow,
  decode8x8dBlock,
  decodeGeoBlock,
  readDaxDataBlocks,
  type GameMap,
  type IndexedImage,
  type MapCell,
  type TileSet,
} from '../src/index.js';

const poolRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD';
const poolGeo5 = resolve(poolRoot, 'GEO5.DAX');
const poolTiles1 = resolve(poolRoot, '8X8D1.DAX');

function solidTile(value: number): IndexedImage {
  return {
    width: 8,
    height: 8,
    indices: new Uint8Array(64).fill(value),
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: null,
    encoding: 'test',
  };
}

function wallCell(mask = 0): MapCell {
  return {
    walls: {
      north: mask & 1,
      east: mask & 2,
      south: mask & 4,
      west: mask & 8,
    },
  };
}

function map(): GameMap {
  return {
    name: 'synthetic Pool regional sector',
    width: 16,
    height: 16,
    cells: Array.from({ length: 256 }, () => wallCell()),
    entries: [],
  };
}

function symbols(): TileSet {
  const tiles = Array.from({ length: 20 }, (_, index) => solidTile(index));
  for (let arrow = 0; arrow < 4; arrow++) {
    tiles[arrow]!.indices.fill(8);
    tiles[arrow]!.indices[0] = 240 + arrow;
  }
  return { name: 'synthetic Pool 8X8D1#202', tileWidth: 8, tileHeight: 8, tiles, palette: null };
}

function pixel(frame: { width: number; indices: Uint8Array }, x: number, y: number): number {
  return frame.indices[y * frame.width + x]!;
}

describe('Pool native DrawAreaMap viewport', () => {
  it('maps all sixteen N/E/S/W wall masks to set-4 tiles 4..19', () => {
    const geo = map();
    for (let mask = 0; mask < 16; mask++) {
      const x = mask % 11;
      const y = Math.floor(mask / 11);
      geo.cells[y * 16 + x] = wallCell(mask);
    }

    const view = composePoolAreaMapWindow(geo, { x: 5, y: 5, direction: 0 }, symbols());
    for (let mask = 0; mask < 16; mask++) {
      const col = mask % 11;
      const row = Math.floor(mask / 11);
      expect(pixel(view.framebuffer, col * 8, row * 8), `wall mask ${mask}`).toBe(4 + mask);
    }
  });

  it('clamps the 11x11 window origin and keeps the marker on the matching GEO cell', () => {
    const geo = map();
    const tileSet = symbols();
    const northWest = composePoolAreaMapWindow(geo, { x: 0, y: 0, direction: 0 }, tileSet);
    expect(northWest).toMatchObject({ originX: 0, originY: 0, markerCol: 0, markerRow: 0 });
    expect([northWest.framebuffer.width, northWest.framebuffer.height]).toEqual([88, 88]);

    const centre = composePoolAreaMapWindow(geo, { x: 8, y: 9, direction: 0 }, tileSet);
    expect(centre).toMatchObject({ originX: 3, originY: 4, markerCol: 5, markerRow: 5 });

    const southEast = composePoolAreaMapWindow(geo, { x: 15, y: 15, direction: 0 }, tileSet);
    expect(southEast).toMatchObject({ originX: 5, originY: 5, markerCol: 10, markerRow: 10 });
  });

  it('selects arrows with direction >> 1 and suppresses palette index 8 over the map', () => {
    const geo = map();
    const tileSet = symbols();
    for (let direction = 0; direction < 8; direction++) {
      const view = composePoolAreaMapWindow(geo, { x: 5, y: 5, direction }, tileSet);
      const left = view.markerCol * 8;
      const top = view.markerRow * 8;
      expect(view.arrowTile).toBe(direction >> 1);
      expect(pixel(view.framebuffer, left, top)).toBe(240 + (direction >> 1));
      // Arrow tile pixel 1 is index 8. Native clipped drawing leaves wall-mask tile 4 visible.
      expect(pixel(view.framebuffer, left + 1, top)).toBe(4);
    }
  });

  it.skipIf(!existsSync(poolGeo5) || !existsSync(poolTiles1))(
    'matches retail GEO5 seam-arrival viewport hashes with 8X8D1#202',
    async () => {
      const [geoBlocks, tileBlocks] = await Promise.all([
        readFile(poolGeo5).then((bytes) => readDaxDataBlocks(new Uint8Array(bytes))),
        readFile(poolTiles1).then((bytes) => readDaxDataBlocks(new Uint8Array(bytes))),
      ]);
      const symbolsRaw = tileBlocks.find(({ blockId }) => blockId === 202)!.raw;
      const retailSymbols = decode8x8dBlock(symbolsRaw, 'Pool retail 8X8D1#202');
      const cases = [
        { geoBlockId: 4, x: 14, y: 12, direction: 6, hash: '38d95d8ff5004b466ad357728c3059d2a412a84dcc64dcd3769418eb1520ea0d' },
        { geoBlockId: 5, x: 3, y: 12, direction: 2, hash: 'a7ce6bf9ad50fdedda9ae15f94300ad0f7b11025e7c3e82f8ebd0f8e414584c1' },
        { geoBlockId: 5, x: 14, y: 12, direction: 6, hash: 'e234ad65c5a3b8bdfa25b14b62e9fa2eaea89e8ab6e5261ab515daf73bc6e2ff' },
        { geoBlockId: 6, x: 3, y: 12, direction: 2, hash: '5f8e3af6e5fd0d6c31a387c7d18bcb7d8a146f9021068dbf78aa2b5f1f65e190' },
      ];
      for (const testCase of cases) {
        const raw = geoBlocks.find(({ blockId }) => blockId === testCase.geoBlockId)!.raw;
        const map = decodeGeoBlock(raw, `Pool GEO5#${testCase.geoBlockId}`).map;
        const view = composePoolAreaMapWindow(map, testCase, retailSymbols);
        const hash = createHash('sha256').update(view.framebuffer.indices).digest('hex');
        expect(hash, `GEO5#${testCase.geoBlockId} (${testCase.x},${testCase.y})`).toBe(testCase.hash);
      }
    },
  );
});
