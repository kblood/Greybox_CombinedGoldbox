import type { TerrainGrid } from './tactical.js';

export interface BackgroundTile {
  /** Movement cost from the Gold Box `BackGroundTiles` record; `0xff` means blocked. */
  moveCost: number;
  /** Original field_1: floor/elevation seed used by combat reach calculations. */
  field1: number;
  /** Original field_2: wall/obstacle height; `0xff` is a sentinel/non-ray value. */
  height: number;
  /** 24x24 DUNGCOM/WILDCOM/RANDCOM tile index to render for this terrain id. */
  tileIndex: number;
}

export const BACKGROUND_TILE_RECORD_SIZE = 4;
export const DQK_NATIVE_COMBAT_BACKGROUND_ID_FALLBACK = 0x15;
export const DQK_NATIVE_COMBAT_BACKGROUND_ID_MAX = 0x4c;

/**
 * COAB/Gold Box `BackGroundTiles` records, transcribed as data facts from the decompiled oracle and
 * cross-checked against the DQK byte table at `DQK.EXE:0x69bb7`.
 *
 * Record shape: `(move_cost, field_1, field_2, tile_index)`. The same table drives movement,
 * sight-height, and the 24x24 battle-floor tile index.
 */
export const BACKGROUND_TILES: readonly BackgroundTile[] = [
  [1, 0, 0xff, 0],
  [0xff, 1, 2, 0],
  [0xff, 1, 2, 1],
  [0xff, 1, 2, 2],
  [0xff, 1, 2, 3],
  [1, 1, 0, 4],
  [0xff, 1, 2, 5],
  [0xff, 1, 2, 6],
  [0xff, 1, 2, 7],
  [1, 1, 0, 8],
  [0xff, 1, 2, 9],
  [1, 1, 0, 0x0a],
  [0xff, 1, 2, 0x0b],
  [1, 1, 0, 0x0c],
  [0xff, 1, 2, 0x0d],
  [1, 1, 0, 0x0e],
  [0xff, 1, 2, 0x0f],
  [1, 1, 0, 0x10],
  [0xff, 1, 2, 0x11],
  [0xff, 1, 2, 0x12],
  [0xff, 1, 2, 0x13],
  [0xff, 1, 2, 0x14],
  [0xff, 1, 2, 0x15],
  [1, 1, 0, 0x16],
  [1, 1, 0, 0x17],
  [0xff, 1, 2, 0x18],
  [2, 2, 0, 0x22],
  [1, 1, 0, 0x23],
  [1, 1, 0, 0x24],
  [1, 1, 0, 0x25],
  [1, 1, 0, 0x26],
  [1, 1, 0, 0x27],
  [0xff, 1, 2, 0],
  [0xff, 1, 2, 1],
  [0xff, 1, 2, 2],
  [0xff, 1, 2, 3],
  [0xff, 1, 2, 4],
  [1, 1, 0, 5],
  [1, 1, 0, 6],
  [1, 1, 0, 7],
  [1, 1, 0, 8],
  [1, 1, 0, 9],
  [0xff, 1, 2, 10],
  [0xff, 1, 2, 11],
  [1, 1, 0, 12],
  [1, 1, 0, 13],
  [1, 1, 0, 14],
  [1, 1, 0, 15],
  [2, 1, 0, 16],
  [2, 1, 0, 17],
  [2, 1, 0, 18],
  [2, 1, 0, 19],
  [2, 1, 0, 20],
  [2, 1, 0, 21],
  [1, 1, 0, 22],
  [1, 1, 0, 0x17],
  [1, 1, 0, 0x18],
  [1, 1, 0, 0x19],
  [2, 1, 0, 0x1a],
  [2, 1, 0, 0x1b],
  [4, 0, 0, 0x1c],
  [4, 0, 0, 0x1d],
  [4, 0, 0, 0x1e],
  [4, 0, 0, 0x1f],
  [1, 1, 0, 0x20],
  [1, 1, 0, 0x21],
  [0, 0, 0xff, 0xff],
  [0xff, 0xff, 0xff, 0xff],
  [0, 0, 0, 1],
  [0xff, 0xff, 0xff, 0xff],
  [0, 0, 1, 0],
  [0xff, 0xff, 0xff, 0xff],
  [0, 0, 1, 0],
  [0, 1, 1, 1],
].map(([moveCost, field1, height, tileIndex]) => ({ moveCost, field1, height, tileIndex }));

/**
 * DQK's Gen2 `BackGroundTiles` table as carved from `DQK.EXE:0x69bb7`.
 *
 * Rows `0..25` and `32..43` match the CoAB-shaped table above, but DQK diverges in several later
 * terrain ids and the native renderer treats ids through `0x4c` as valid.
 */
export const DQK_BACKGROUND_TILES: readonly BackgroundTile[] = [
  [1, 0, 0xff, 0],
  [0xff, 1, 2, 0],
  [0xff, 1, 2, 1],
  [0xff, 1, 2, 2],
  [0xff, 1, 2, 3],
  [1, 1, 0, 4],
  [0xff, 1, 2, 5],
  [0xff, 1, 2, 6],
  [0xff, 1, 2, 7],
  [1, 1, 0, 8],
  [0xff, 1, 2, 9],
  [1, 1, 0, 0x0a],
  [0xff, 1, 2, 0x0b],
  [1, 1, 0, 0x0c],
  [0xff, 1, 2, 0x0d],
  [1, 1, 0, 0x0e],
  [0xff, 1, 2, 0x0f],
  [1, 1, 0, 0x10],
  [0xff, 1, 2, 0x11],
  [0xff, 1, 2, 0x12],
  [0xff, 1, 2, 0x13],
  [0xff, 1, 2, 0x14],
  [0xff, 1, 2, 0x15],
  [1, 1, 0, 0x16],
  [1, 1, 0, 0x17],
  [0xff, 1, 2, 0x18],
  [2, 2, 0, 0x26],
  [1, 1, 0, 0x0e],
  [1, 1, 0, 0x0d],
  [1, 1, 0, 0x0c],
  [1, 1, 0, 0x14],
  [1, 1, 0, 0x15],
  [0xff, 1, 2, 0],
  [0xff, 1, 2, 1],
  [0xff, 1, 2, 2],
  [0xff, 1, 2, 3],
  [0xff, 1, 2, 4],
  [1, 1, 0, 5],
  [1, 1, 0, 6],
  [1, 1, 0, 7],
  [1, 1, 0, 8],
  [1, 1, 0, 9],
  [0xff, 1, 2, 10],
  [0xff, 1, 2, 11],
  [2, 1, 0, 12],
  [1, 1, 0, 13],
  [1, 1, 0, 14],
  [1, 1, 0, 15],
  [1, 1, 0, 16],
  [1, 1, 0, 17],
  [2, 1, 0, 18],
  [2, 1, 0, 19],
  [1, 1, 0, 20],
  [1, 1, 0, 21],
  [1, 1, 0, 22],
  [0xff, 1, 0, 23],
  [0xff, 1, 0, 24],
  [0xff, 1, 0, 25],
  [1, 1, 0, 26],
  [1, 1, 0, 27],
  [1, 1, 0, 28],
  [1, 0, 0, 29],
  [1, 0, 0, 30],
  [0xff, 0, 0, 31],
  [0xff, 1, 0, 32],
  [2, 1, 0, 33],
  [1, 1, 0, 34],
  [0xff, 1, 0, 35],
  [1, 1, 0, 36],
  [1, 1, 0, 37],
  [1, 1, 0, 22],
  [0x46, 1, 0, 26],
  [0x46, 1, 0, 27],
  [0x46, 1, 0, 28],
  [0x46, 1, 0, 29],
  [0x46, 1, 0, 30],
  [0x46, 1, 0, 31],
].map(([moveCost, field1, height, tileIndex]) => ({ moveCost, field1, height, tileIndex }));

function byteValue(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`Background tile byte out of range: ${value}`);
  }
  return value;
}

export function backgroundTileRecordBytes(tile: BackgroundTile): readonly [number, number, number, number] {
  return [
    byteValue(tile.moveCost),
    byteValue(tile.field1),
    byteValue(tile.height),
    byteValue(tile.tileIndex),
  ];
}

export function decodeBackgroundTileRecords(
  bytes: ArrayLike<number>,
  offset = 0,
  count = Math.floor((bytes.length - offset) / BACKGROUND_TILE_RECORD_SIZE),
): BackgroundTile[] {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError(`Invalid BackGroundTiles byte offset: ${offset}`);
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`Invalid BackGroundTiles record count: ${count}`);
  }
  const end = offset + count * BACKGROUND_TILE_RECORD_SIZE;
  if (end > bytes.length) {
    throw new RangeError(`BackGroundTiles decode exceeds byte length: ${end} > ${bytes.length}`);
  }
  const out: BackgroundTile[] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + i * BACKGROUND_TILE_RECORD_SIZE;
    out.push({
      moveCost: byteValue(bytes[at] ?? 0),
      field1: byteValue(bytes[at + 1] ?? 0),
      height: byteValue(bytes[at + 2] ?? 0),
      tileIndex: byteValue(bytes[at + 3] ?? 0),
    });
  }
  return out;
}

export function backgroundTile(id: number): BackgroundTile {
  return BACKGROUND_TILES[id] ?? BACKGROUND_TILES[0]!;
}

export function backgroundTileIndex(id: number, tileCount = Infinity): number {
  const idx = backgroundTile(id).tileIndex;
  if (idx === 0xff || idx < 0) return 0;
  return Number.isFinite(tileCount) && tileCount > 0 ? Math.min(idx, tileCount - 1) : idx;
}

export function dqkNativeCombatBackgroundId(id: number): number {
  const byte = Number.isInteger(id) ? id & 0xff : 0;
  return byte === 0 || byte > DQK_NATIVE_COMBAT_BACKGROUND_ID_MAX
    ? DQK_NATIVE_COMBAT_BACKGROUND_ID_FALLBACK
    : byte;
}

/**
 * DQK's Gen2 renderer indexes BackGroundTiles by the live 50x25 background-id byte, then passes
 * `(tileIndex + 1) & 0xff` to `0x09a4:0x0515` as the HLIB member byte. Return `null` for native-valid
 * ids whose BackGroundTiles row has not yet been recovered in this table.
 */
export function dqkNativeCombatTerrainMemberByte(backgroundId: number): number | null {
  const id = dqkNativeCombatBackgroundId(backgroundId);
  const tile = DQK_BACKGROUND_TILES[id];
  if (!tile) return null;
  return (tile.tileIndex + 1) & 0xff;
}

export function dqkNativeBackgroundTile(backgroundId: number): BackgroundTile | null {
  return DQK_BACKGROUND_TILES[dqkNativeCombatBackgroundId(backgroundId)] ?? null;
}

export function isBackgroundBlocked(id: number): boolean {
  return backgroundTile(id).moveCost === 0xff;
}

export function backgroundMoveCost(id: number): number {
  const cost = backgroundTile(id).moveCost;
  return cost === 0xff ? 0xff : Math.max(1, cost);
}

export function terrainGridFromBackgroundMap(width: number, height: number, ids: readonly number[]): TerrainGrid {
  const idAt = (col: number, row: number): number => {
    if (col < 0 || row < 0 || col >= width || row >= height) return 1;
    return ids[row * width + col] ?? 0;
  };
  return {
    width,
    height,
    blocked: (col, row) => isBackgroundBlocked(idAt(col, row)),
    blocksSight: (col, row) => {
      const t = backgroundTile(idAt(col, row));
      return t.moveCost === 0xff || (t.height !== 0xff && t.height > 0);
    },
    cost: (col, row) => backgroundMoveCost(idAt(col, row)),
  };
}

export function dqkNativeTerrainGridFromBackgroundMap(
  width: number,
  height: number,
  ids: readonly number[],
): TerrainGrid {
  const tileAt = (col: number, row: number): BackgroundTile | null => {
    if (col < 0 || row < 0 || col >= width || row >= height) return DQK_BACKGROUND_TILES[1]!;
    return dqkNativeBackgroundTile(ids[row * width + col] ?? 0);
  };
  return {
    width,
    height,
    blocked: (col, row) => tileAt(col, row)?.moveCost === 0xff,
    blocksSight: (col, row) => {
      const t = tileAt(col, row);
      return !t || t.moveCost === 0xff || (t.height !== 0xff && t.height > 0);
    },
    cost: (col, row) => {
      const cost = tileAt(col, row)?.moveCost ?? 0xff;
      return cost === 0xff ? 0xff : Math.max(1, cost);
    },
  };
}

export function backgroundCellTileMap(
  width: number,
  height: number,
  ids: readonly number[],
  view: { col: number; row: number; cols: number; rows: number },
  tileCount = Infinity,
): number[] {
  const out: number[] = [];
  for (let r = 0; r < view.rows; r++) {
    for (let c = 0; c < view.cols; c++) {
      const col = view.col + c;
      const row = view.row + r;
      const id = col < 0 || row < 0 || col >= width || row >= height ? 1 : ids[row * width + col] ?? 0;
      out.push(backgroundTileIndex(id, tileCount));
    }
  }
  return out;
}

export function dqkNativeBackgroundCellMemberMap(
  width: number,
  height: number,
  ids: readonly number[],
  view: { col: number; row: number; cols: number; rows: number },
): number[] {
  const out: number[] = [];
  for (let r = 0; r < view.rows; r++) {
    for (let c = 0; c < view.cols; c++) {
      const col = view.col + c;
      const row = view.row + r;
      const id = col < 0 || row < 0 || col >= width || row >= height ? 1 : ids[row * width + col] ?? 0;
      out.push(dqkNativeCombatTerrainMemberByte(id) ?? 0);
    }
  }
  return out;
}
