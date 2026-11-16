import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GATEWAY_ECL6_GEO_SELECTOR_ADDR,
  composeGatewayOverlandWindow,
  loadGatewayOverlandBanks,
  readDaxDataBlocks,
  selectGatewayEcl6WildernessMap,
  type GatewayEcl6GeoSource,
  type GatewayOverlandBanks,
  type IndexedImage,
  type TileSet,
} from '../src/index.js';

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

function tileSet(name: string, values: readonly number[]): TileSet {
  return { name, tileWidth: 8, tileHeight: 8, tiles: values.map(solidTile), palette: null };
}

function syntheticBanks(): GatewayOverlandBanks {
  const terrain = [0, 1, 2].map((bank) =>
    tileSet(`terrain-${bank}`, Array.from({ length: 70 }, (_, i) => bank * 70 + i)),
  ) as [TileSet, TileSet, TileSet];
  const arrows = tileSet('arrows', [240, 241, 242, 243]);
  for (let direction = 0; direction < 4; direction++) {
    arrows.tiles[direction].indices.fill(13);
    arrows.tiles[direction].indices[0] = 240 + direction;
  }
  return { terrain, arrows, terrainBlockIds: [18, 56, 57], arrowBlockId: 202 };
}

function pixel(frame: { width: number; indices: Uint8Array }, x: number, y: number): number {
  return frame.indices[y * frame.width + x];
}

describe('Gateway native overland compositor', () => {
  it('routes GEO bytes across the three 70-tile banks and overlays the directional marker', () => {
    const terrain = new Uint8Array(256);
    terrain[0] = 0;
    terrain[1] = 69;
    terrain[2] = 70;
    terrain[3] = 139;
    terrain[4] = 140;
    terrain[6] = 209;
    terrain[5 * 16 + 5] = 42;

    const window = composeGatewayOverlandWindow(terrain, { x: 5, y: 5, facing: 'west' }, syntheticBanks());
    expect(window).toMatchObject({ originX: 0, originY: 0, markerCol: 5, markerRow: 5 });
    expect([window.framebuffer.width, window.framebuffer.height]).toEqual([88, 88]);
    expect([0, 1, 2, 3, 4, 6].map((col) => pixel(window.framebuffer, col * 8, 0)))
      .toEqual([0, 69, 70, 139, 140, 209]);
    expect(pixel(window.framebuffer, 5 * 8, 5 * 8)).toBe(243);
    expect(pixel(window.framebuffer, 5 * 8 + 1, 5 * 8)).toBe(42);
  });

  it('uses GAME.OVR contiguous-window origin clamping and rejects unproved terrain ids', () => {
    const terrain = new Uint8Array(256);
    const banks = syntheticBanks();
    const north = composeGatewayOverlandWindow(terrain, { x: 0, y: 0, facing: 'north' }, banks);
    expect(north)
      .toMatchObject({ originX: 0, originY: 0, markerCol: 0, markerRow: 0 });
    expect(pixel(north.framebuffer, 0, 0)).toBe(240);
    const east = composeGatewayOverlandWindow(terrain, { x: 8, y: 9, facing: 'east' }, banks);
    expect(east)
      .toMatchObject({ originX: 3, originY: 4, markerCol: 5, markerRow: 5 });
    expect(pixel(east.framebuffer, 5 * 8, 5 * 8)).toBe(241);
    const south = composeGatewayOverlandWindow(terrain, { x: 15, y: 15, facing: 'south' }, banks);
    expect(south)
      .toMatchObject({ originX: 5, originY: 5, markerCol: 10, markerRow: 10 });
    expect(pixel(south.framebuffer, 10 * 8, 10 * 8)).toBe(242);

    terrain[0] = 210;
    expect(() => composeGatewayOverlandWindow(terrain, { x: 0, y: 0, facing: 'north' }, banks))
      .toThrow(/proved 0\.\.209/);
  });
});

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const required = ['ECL6.DAX', 'GEO6.DAX', '8X8D6.DAX', '8X8D1.DAX'];
const haveRetail = required.every((name) => existsSync(resolve(gateway, name)));

function daxIndex(name: string): Map<number, Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(readFileSync(resolve(gateway, name))));
  return new Map(blocks.map((block) => [block.blockId, block.raw]));
}

describe('Gateway native overland compositor — retail', () => {
  it.skipIf(!haveRetail)('decodes and composes all six dynamically-selected bank triples', () => {
    const ecl = daxIndex('ECL6.DAX').get(21)!;
    const geo = daxIndex('GEO6.DAX');
    const areaTiles = daxIndex('8X8D6.DAX');
    const bootTiles = daxIndex('8X8D1.DAX');
    const geoSource: GatewayEcl6GeoSource = { geoBlock: (id) => geo.get(id) ?? null };
    const maxima: number[] = [];
    const hashes: string[] = [];

    for (let submap = 21; submap <= 26; submap++) {
      const selected = selectGatewayEcl6WildernessMap(
        ecl,
        geoSource,
        new Map([[GATEWAY_ECL6_GEO_SELECTOR_ADDR, submap]]),
      );
      const banks = loadGatewayOverlandBanks(selected.rawPieceOperands, {
        areaTileBlock: (id) => areaTiles.get(id) ?? null,
        bootTileBlock: (id) => bootTiles.get(id) ?? null,
      });
      expect(selected.rawPieceOperands.map((id) => areaTiles.get(id)!.length)).toEqual([2858, 2858, 2858]);
      expect(banks.terrain.map((bank) => bank.tiles.length)).toEqual([70, 70, 70]);
      expect(banks.arrows.tiles.length).toBe(40);
      expect(banks.terrainBlockIds).toEqual([18, 2 * submap + 8, 2 * submap + 9]);

      maxima.push(Math.max(...selected.terrainPlane));
      const rendered = composeGatewayOverlandWindow(
        selected.terrainPlane,
        { x: 8, y: 2, facing: 'west' },
        banks,
      );
      expect(rendered).toMatchObject({ originX: 3, originY: 0, markerCol: 5, markerRow: 2 });
      hashes.push(createHash('sha256').update(rendered.framebuffer.indices).digest('hex'));
    }

    expect(maxima).toEqual([176, 170, 181, 186, 159, 188]);
    expect(hashes).toEqual([
      '0a67f0fe9226f06b4cae77440a18770fa6db875051e1a94e99cdaba3d9afcb19',
      'bc8c63b402a131098eae64c602a1e650694809f8c4ff5155460e63a80577fc4e',
      '8f2143c338f164b99862f327f61d81ab3573b0e103da52a0e68d1d981a5987c7',
      'c0bc4a93caf5269c679fbc5a1e1ad8c70f446115868eaa282f3dab9d2a8ed5bc',
      '20e379d8fae901451bd408e5cf3928e14bdcd062a20c3d61978619a48d93909f',
      '34fc0fd27a8dda1e849ba54a9392a589fdf29e24b1207f3c8a510ef47734044d',
    ]);
  });
});
