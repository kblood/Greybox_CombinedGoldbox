import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_TILES,
  DQK_BACKGROUND_TILES,
  DQK_NATIVE_COMBAT_BACKGROUND_ID_FALLBACK,
  DQK_NATIVE_COMBAT_BACKGROUND_ID_MAX,
  backgroundCellTileMap,
  backgroundMoveCost,
  backgroundTile,
  backgroundTileIndex,
  backgroundTileRecordBytes,
  buildDqkNativeCombatMap,
  decodeBackgroundTileRecords,
  dqkNativeBackgroundTile,
  dqkNativeBackgroundCellMemberMap,
  dqkNativeCombatBackgroundId,
  dqkNativeCombatTerrainMemberByte,
  dqkNativeTerrainGridFromBackgroundMap,
  isBackgroundBlocked,
  terrainGridFromBackgroundMap,
} from '../src/index.js';

describe('combat background terrain helpers', () => {
  it('exposes the background tile table and falls back to open ground for unknown ids', () => {
    expect(BACKGROUND_TILES[0]).toEqual({ moveCost: 1, field1: 0, height: 0xff, tileIndex: 0 });
    expect(backgroundTile(0)).toBe(BACKGROUND_TILES[0]);
    expect(backgroundTile(-1)).toBe(BACKGROUND_TILES[0]);
    expect(backgroundTile(999)).toBe(BACKGROUND_TILES[0]);
  });

  it('classifies wall ids as blocked and preserves their render tile ids', () => {
    for (const id of [1, 2, 3, 4, 6, 7, 8]) {
      expect(isBackgroundBlocked(id)).toBe(true);
      expect(backgroundMoveCost(id)).toBe(0xff);
    }

    expect(backgroundTileIndex(1)).toBe(0);
    expect(backgroundTileIndex(2)).toBe(1);
    expect(backgroundTileIndex(3)).toBe(2);
    expect(backgroundTileIndex(4)).toBe(3);
  });

  it('keeps open and difficult terrain passable with normalized movement costs', () => {
    expect(isBackgroundBlocked(0)).toBe(false);
    expect(backgroundMoveCost(0)).toBe(1);

    expect(isBackgroundBlocked(26)).toBe(false);
    expect(backgroundMoveCost(26)).toBe(2);
    expect(backgroundTileIndex(26)).toBe(0x22);

    expect(isBackgroundBlocked(60)).toBe(false);
    expect(backgroundMoveCost(60)).toBe(4);
    expect(backgroundTileIndex(60)).toBe(0x1c);

    expect(isBackgroundBlocked(66)).toBe(false);
    expect(backgroundMoveCost(66)).toBe(1);
    expect(backgroundTileIndex(66)).toBe(0);
  });

  it('clamps render tile indexes to the available tile count', () => {
    expect(backgroundTileIndex(26, 16)).toBe(15);
    expect(backgroundTileIndex(60, 30)).toBe(28);
    expect(backgroundTileIndex(60, 0)).toBe(0x1c);
    expect(backgroundTileIndex(67)).toBe(0);
  });

  it('mirrors DQK native background-id clamp and HLIB member-byte conversion', () => {
    expect(DQK_NATIVE_COMBAT_BACKGROUND_ID_FALLBACK).toBe(0x15);
    expect(DQK_NATIVE_COMBAT_BACKGROUND_ID_MAX).toBe(0x4c);

    expect(dqkNativeCombatBackgroundId(0)).toBe(0x15);
    expect(dqkNativeCombatBackgroundId(0x15)).toBe(0x15);
    expect(dqkNativeCombatBackgroundId(0x4c)).toBe(0x4c);
    expect(dqkNativeCombatBackgroundId(0x4d)).toBe(0x15);

    expect(dqkNativeCombatTerrainMemberByte(1)).toBe(1);
    expect(dqkNativeCombatTerrainMemberByte(0)).toBe((DQK_BACKGROUND_TILES[0x15]!.tileIndex + 1) & 0xff);
    expect(dqkNativeCombatTerrainMemberByte(0x4d)).toBe((DQK_BACKGROUND_TILES[0x15]!.tileIndex + 1) & 0xff);
    expect(dqkNativeCombatTerrainMemberByte(66)).toBe((DQK_BACKGROUND_TILES[66]!.tileIndex + 1) & 0xff);
    expect(dqkNativeCombatTerrainMemberByte(0x4c)).toBe(0x20);
    expect(DQK_BACKGROUND_TILES).toHaveLength(0x4d);
    expect(DQK_BACKGROUND_TILES[0x47]).toEqual({ moveCost: 0x46, field1: 1, height: 0, tileIndex: 0x1a });
    expect(dqkNativeBackgroundTile(0)).toBe(DQK_BACKGROUND_TILES[0x15]);
    expect(dqkNativeBackgroundTile(0x4d)).toBe(DQK_BACKGROUND_TILES[0x15]);
    expect(dqkNativeBackgroundTile(0x4c)).toBe(DQK_BACKGROUND_TILES[0x4c]);
  });

  it('encodes and decodes raw four-byte BackGroundTiles records', () => {
    expect(backgroundTileRecordBytes(BACKGROUND_TILES[0]!)).toEqual([1, 0, 0xff, 0]);
    expect(backgroundTileRecordBytes(BACKGROUND_TILES[26]!)).toEqual([2, 2, 0, 0x22]);

    const bytes = new Uint8Array([
      ...backgroundTileRecordBytes(BACKGROUND_TILES[0]!),
      ...backgroundTileRecordBytes(BACKGROUND_TILES[1]!),
      ...backgroundTileRecordBytes(BACKGROUND_TILES[60]!),
    ]);

    expect(decodeBackgroundTileRecords(bytes)).toEqual([
      BACKGROUND_TILES[0],
      BACKGROUND_TILES[1],
      BACKGROUND_TILES[60],
    ]);
    expect(decodeBackgroundTileRecords(bytes, 4, 1)).toEqual([BACKGROUND_TILES[1]]);
  });

  it('builds a terrain grid with blocked, sight, and movement semantics', () => {
    const grid = terrainGridFromBackgroundMap(3, 2, [
      0, 1, 26,
      70, 66, 60,
    ]);

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);

    expect(grid.blocked(0, 0)).toBe(false);
    expect(grid.blocksSight(0, 0)).toBe(false);
    expect(grid.cost(0, 0)).toBe(1);

    expect(grid.blocked(1, 0)).toBe(true);
    expect(grid.blocksSight(1, 0)).toBe(true);
    expect(grid.cost(1, 0)).toBe(0xff);

    expect(grid.blocked(0, 1)).toBe(false);
    expect(grid.blocksSight(0, 1)).toBe(true);
    expect(grid.cost(0, 1)).toBe(1);

    expect(grid.cost(2, 0)).toBe(2);
    expect(grid.cost(2, 1)).toBe(4);

    expect(grid.blocked(-1, 0)).toBe(true);
    expect(grid.blocksSight(3, 0)).toBe(true);
    expect(grid.cost(0, 2)).toBe(0xff);
  });

  it('builds a DQK native terrain grid from recovered Gen2 BackGroundTiles rows', () => {
    const grid = dqkNativeTerrainGridFromBackgroundMap(3, 2, [
      0, 1, 0x1a,
      0x47, 0x4c, 0x4d,
    ]);

    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);

    // DQK native rendering clamps id 0 to row 0x15 before terrain interpretation.
    expect(grid.blocked(0, 0)).toBe(true);
    expect(grid.blocksSight(0, 0)).toBe(true);
    expect(grid.cost(0, 0)).toBe(0xff);

    expect(grid.blocked(1, 0)).toBe(true);
    expect(grid.blocksSight(1, 0)).toBe(true);
    expect(grid.cost(1, 0)).toBe(0xff);

    expect(grid.blocked(2, 0)).toBe(false);
    expect(grid.blocksSight(2, 0)).toBe(false);
    expect(grid.cost(2, 0)).toBe(2);

    expect(grid.blocked(0, 1)).toBe(false);
    expect(grid.cost(0, 1)).toBe(0x46);
    expect(grid.blocked(1, 1)).toBe(false);
    expect(grid.cost(1, 1)).toBe(0x46);

    expect(grid.blocked(2, 1)).toBe(true);
    expect(grid.cost(2, 1)).toBe(0xff);

    expect(grid.blocked(-1, 0)).toBe(true);
    expect(grid.blocksSight(3, 0)).toBe(true);
    expect(grid.cost(0, 2)).toBe(0xff);
  });

  it('maps a viewport of background cells to row-major render tile indexes', () => {
    const tiles = backgroundCellTileMap(
      3,
      2,
      [
        0, 26, 60,
        67, 66, 73,
      ],
      { col: -1, row: 0, cols: 5, rows: 3 },
      30,
    );

    expect(tiles).toEqual([
      0, 0, 29, 28, 0,
      0, 0, 0, 1, 0,
      0, 0, 0, 0, 0,
    ]);
  });

  it('maps a DQK native viewport to HLIB member bytes instead of CoAB tile indexes', () => {
    const members = dqkNativeBackgroundCellMemberMap(
      3,
      2,
      [
        0, 0x1a, 0x47,
        0x4c, 0x4d, 1,
      ],
      { col: -1, row: 0, cols: 5, rows: 3 },
    );

    expect(members).toEqual([
      1, 0x15, 0x27, 0x1b, 1,
      1, 0x20, 0x15, 1, 1,
      1, 1, 1, 1, 1,
    ]);
  });

  it('wraps explicit DQK native background ids as a terrain map without fabricating population', () => {
    const ids = [
      0, 1, 0x1a,
      0x47, 0x4c, 0x4d,
    ];
    const map = buildDqkNativeCombatMap({
      width: 3,
      height: 2,
      backgroundIds: ids,
      partyAnchor: { col: 0, row: 1 },
      enemyAnchor: { col: 2, row: 0 },
    });

    expect(map.width).toBe(3);
    expect(map.height).toBe(2);
    expect(map.backgroundIds).toEqual(ids);
    expect(map.partyAnchor).toEqual({ col: 0, row: 1 });
    expect(map.enemyAnchor).toEqual({ col: 2, row: 0 });
    expect(map.terrain.cost(0, 0)).toBe(0xff);
    expect(map.terrain.cost(0, 1)).toBe(0x46);
    expect(map.terrain.cost(2, 1)).toBe(0xff);

    expect(() => buildDqkNativeCombatMap({ width: 3, height: 2, backgroundIds: [0, 1] })).toThrow(
      /background id count 2 != 6/,
    );
  });
});
