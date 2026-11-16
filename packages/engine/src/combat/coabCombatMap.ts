import type { Direction } from '../model/index.js';
import type { GridPos, TerrainGrid } from './tactical.js';
import { backgroundTile, terrainGridFromBackgroundMap } from './terrain.js';

export type CoabWallFlag = 0 | 1 | 3;

export interface CoabCombatMapInput {
  /** Dungeon cell at `(x,y)`: 0 = open edge, non-zero = wall/door graphic. null = void/solid. */
  sample: (x: number, y: number) => Record<Direction, number> | null;
  /** Optional CoAB x3/door flags. On a non-zero wall slot, x3=0 -> flag 1; x3!=0 -> flag 3. */
  sampleDoors?: (x: number, y: number) => Record<Direction, number> | null;
  /** CoAB `get_wall_x2(mapY,mapX)` source byte. Bit 0x40 gates random table/chair placement. */
  sampleX2?: (x: number, y: number) => number;
  /** Optional CoAB `sub_370D3` random dungeon furniture pass. Omit to keep the deterministic core. */
  randomFurniture?: { rollD10: () => number };
  /** Party dungeon position around which CoAB builds the 50x25 battle map. */
  party: { x: number; y: number };
}

export interface CoabCombatMap {
  width: 50;
  height: 25;
  /** CoAB `mapToBackGroundTile` ids, row-major, after `set_background_tile(tileId+1)`. */
  backgroundIds: readonly number[];
  terrain: TerrainGrid;
  partyAnchor: GridPos;
  enemyAnchor: GridPos;
}

export interface CoabDiceRoller {
  /** Equivalent to CoAB `roll_dice(sides,1)`: returns 1..sides. */
  rollDie: (sides: number) => number;
}

export interface CoabRandomSource {
  /**
   * Equivalent to CoAB `seg051.Random(maxExclusive)`: returns 0..maxExclusive-1.
   * This wraps the recovered call shape, not the still-unrecovered original DOS RNG algorithm/state.
   */
  random: (maxExclusive: number) => number;
}

export function rollCoabDie(random: CoabRandomSource, sides: number): number {
  const maxExclusive = Math.max(0, Math.trunc(sides));
  if (maxExclusive === 0) return 1;
  const raw = Math.trunc(random.random(maxExclusive));
  return Math.max(0, Math.min(maxExclusive - 1, raw)) + 1;
}

/** CoAB `ovr024.roll_dice(dice_size,dice_count)` byte result over an injected `seg051.Random` source. */
export function rollCoabDice(random: CoabRandomSource, diceSize: number, diceCount: number): number {
  let total = 0;
  const count = Math.max(0, Math.trunc(diceCount));
  for (let i = 0; i < count; i++) total += rollCoabDie(random, diceSize);
  return total & 0xff;
}

export function coabDiceRollerFromRandom(random: CoabRandomSource): CoabDiceRoller {
  return {
    rollDie: (sides) => rollCoabDie(random, sides),
  };
}

export interface CoabWildernessCombatMapInput {
  /** CoAB `gbl.area_ptr.current_city`, used as an index into the recovered `CityInfo` table. */
  currentCity: number;
  /** Injected dice roller. Required to mirror CoAB's RNG-consuming wilderness passes deterministically. */
  rng: CoabDiceRoller;
}

type DirId = 0 | 2 | 4 | 6;

const DIR_NAME: Record<DirId, Direction> = {
  0: 'north',
  2: 'east',
  4: 'south',
  6: 'west',
};
const OPPOSITE: Record<DirId, DirId> = {
  0: 4,
  2: 6,
  4: 0,
  6: 2,
};
const DX: Record<DirId, number> = { 0: 0, 2: 1, 4: 0, 6: -1 };
const DY: Record<DirId, number> = { 0: -1, 2: 0, 4: 1, 6: 0 };
const TILE_TABLE = 0x1a;
const TILE_CHAIR = 0x1b;
const FLOOR_TILE_INDEX = 0x16;
export const COAB_TILE_CLOUD_KILL = 0x1c;
export const COAB_TILE_STINKING_CLOUD = 0x1e;
export const COAB_TILE_DOWN_PLAYER = 0x1f;
export const COAB_CITY_INFO: readonly number[] = [
  0x00, 0x18, 0x11, 0x15, 0x01, 0x01, 0x60, 0x14,
  0x08, 0x01, 0x00, 0x21, 0x71, 0x09, 0x06, 0x04,
  0x01, 0x09, 0x09, 0x08, 0x59, 0x00, 0x11, 0x11,
  0x00, 0x00, 0x01, 0x11, 0x00, 0x00, 0x20, 0x20,
  0x0a,
];

/**
 * Gateway to the Savage Frontier `CityInfo` bytes consumed by `GAME.OVR` ovr012:09BA.
 *
 * Retail provenance: packed `GAME.EXE` SHA-256
 * `0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00`, table at file
 * offset `0x4ed9` / runtime `DS:042c`. The table differs from CoAB only at city 31, where
 * Gateway uses `0x80` rather than `0x20`.
 */
export const GATEWAY_CITY_INFO: readonly number[] = [
  0x00, 0x18, 0x11, 0x15, 0x01, 0x01, 0x60, 0x14,
  0x08, 0x01, 0x00, 0x21, 0x71, 0x09, 0x06, 0x04,
  0x01, 0x09, 0x09, 0x08, 0x59, 0x00, 0x11, 0x11,
  0x00, 0x00, 0x01, 0x11, 0x00, 0x00, 0x20, 0x80,
  0x0a,
];

export interface CoabDownedTile {
  col: number;
  row: number;
  originalBackgroundTile: number;
  targetId?: string | null;
}

export type CoabGasCloudKind = 'stinking' | 'cloudkill';

export interface CoabGasCloudCell {
  col: number;
  row: number;
  present: boolean;
  savedGroundId: number;
}

export interface CoabGasCloudRecord {
  kind: CoabGasCloudKind;
  target: GridPos;
  cells: CoabGasCloudCell[];
  ordinal?: number;
  casterId?: string | null;
}

export interface CoabTimedGasCloudRecord extends CoabGasCloudRecord {
  id: string;
  createdRound: number;
  expiresRound: number;
}

export interface CoabCombatTileState {
  width: 50;
  height: 25;
  /** Mutable CoAB `mapToBackGroundTile` ids for the live combat. */
  backgroundIds: number[];
  /** Terrain view over `backgroundIds`; its closures observe later tile mutations. */
  terrain: TerrainGrid;
  downed: CoabDownedTile[];
  clouds: CoabTimedGasCloudRecord[];
  nextCloudOrdinal: number;
}

function sourceEdgeFlag(input: CoabCombatMapInput, dir: DirId, x: number, y: number): CoabWallFlag {
  const cell = input.sample(x, y);
  if (!cell) return y === input.party.y && (dir === 2 || dir === 6) ? 0 : 1;
  const name = DIR_NAME[dir];
  const wall = cell[name] ?? 0;
  if (wall === 0) return 0;
  const doors = input.sampleDoors?.(x, y) ?? null;
  return (doors?.[name] ?? 0) === 0 ? 1 : 3;
}

function edgeFlag(input: CoabCombatMapInput, dir: DirId, x: number, y: number): CoabWallFlag {
  const nx = x + DX[dir];
  const ny = y + DY[dir];
  const a = sourceEdgeFlag(input, dir, x, y);
  const b = sourceEdgeFlag(input, OPPOSITE[dir], nx, ny);
  return (a | b) as CoabWallFlag;
}

function setBackgroundTile(ids: number[], ox: number, oy: number, tileId: number, y: number, x: number): void {
  const col = (ox * 6) + (oy * 5) + 21 + x;
  const row = (oy * 5) + 10 + y;
  if (col >= 0 && col <= 49 && row >= 0 && row <= 24) ids[row * 50 + col] = tileId + 1;
}

function buildBackgroundTiles1(ids: number[], ox: number, oy: number, dir6: CoabWallFlag): void {
  for (let y = 2; y <= 4; y++) {
    for (let x = 0; x <= 5; x++) setBackgroundTile(ids, ox, oy, 22, y, x);
  }

  if (dir6 === 1) {
    for (let v = 2; v <= 4; v++) {
      setBackgroundTile(ids, ox, oy, 4, v, v - 1);
      setBackgroundTile(ids, ox, oy, 3, v, v);
      setBackgroundTile(ids, ox, oy, 13, v, v + 1);
    }
  } else if (dir6 === 3) {
    setBackgroundTile(ids, ox, oy, 8, 2, 1);
    setBackgroundTile(ids, ox, oy, 0, 4, 5);
  }
}

function buildBackgroundTiles2(ids: number[], ox: number, oy: number, dir0: CoabWallFlag): void {
  if (dir0 === 1) {
    setBackgroundTile(ids, ox, oy, 5, 0, 3);
    setBackgroundTile(ids, ox, oy, 5, 0, 4);
    setBackgroundTile(ids, ox, oy, 10, 1, 3);
    setBackgroundTile(ids, ox, oy, 10, 1, 4);
  } else {
    setBackgroundTile(ids, ox, oy, 22, 0, 3);
    setBackgroundTile(ids, ox, oy, 22, 0, 4);
    setBackgroundTile(ids, ox, oy, 22, 1, 3);
    setBackgroundTile(ids, ox, oy, 22, 1, 4);
  }
}

function buildBackgroundTiles3(
  input: CoabCombatMapInput,
  ids: number[],
  ox: number,
  oy: number,
  mapX: number,
  mapY: number,
  dir0: CoabWallFlag,
  dir6: CoabWallFlag,
): void {
  const cornerOpen = edgeFlag(input, 6, mapX, mapY - 1) === 0 && edgeFlag(input, 0, mapX - 1, mapY) === 0;
  let a = 0, b = 0, c = 0, d = 0;

  if (dir0 === 0) {
    a = dir6 === 0 ? 0x16 : dir6 === 3 ? 0x0d : cornerOpen ? 0 : 0x0d;
  } else if (dir6 === 0) {
    a = cornerOpen ? 0x0f : 5;
  } else {
    a = cornerOpen ? 0x12 : 2;
  }

  b = dir0 === 0 ? 0x16 : dir0 === 3 ? 0x11 : 5;

  switch (dir6) {
    case 0:
      c = dir0 === 0 ? 0x16 : cornerOpen ? 0x10 : 0x0a;
      break;
    case 3:
      c = cornerOpen ? 0x14 : 7;
      break;
    case 1:
      c = cornerOpen ? 1 : 3;
      break;
  }

  if (dir6 === 0 || dir6 === 3) {
    d = dir0 === 0 ? 0x16 : dir0 === 3 ? 0x17 : 0x0a;
  } else {
    d = dir0 === 0 ? 0x0d : dir0 === 3 ? 0x15 : 6;
  }

  setBackgroundTile(ids, ox, oy, a, 0, 1);
  setBackgroundTile(ids, ox, oy, b, 0, 2);
  setBackgroundTile(ids, ox, oy, c, 1, 1);
  setBackgroundTile(ids, ox, oy, d, 1, 2);
}

function buildBackgroundTiles4(
  input: CoabCombatMapInput,
  ids: number[],
  ox: number,
  oy: number,
  mapX: number,
  mapY: number,
  dir0: CoabWallFlag,
  dir2: CoabWallFlag,
): void {
  const northOfEast = edgeFlag(input, 2, mapX, mapY - 1);
  const eastOfNorth = edgeFlag(input, 0, mapX + 1, mapY);
  const cornerOpen = northOfEast === 0 && eastOfNorth === 0;

  const a = dir0 === 0 ? (northOfEast === 1 ? 4 : 0x16) : dir0 === 3 ? 0x0f : 5;

  let b: number;
  if (dir0 === 0) {
    if (northOfEast === 0) b = 0x16;
    else if (northOfEast === 3) b = dir2 === 0 && eastOfNorth !== 0 ? 0x18 : 1;
    else b = dir2 === 0 ? (eastOfNorth !== 0 ? 0x0b : 7) : 3;
  } else if (dir2 !== 0) b = 9;
  else if (eastOfNorth !== 0) b = 5;
  else b = cornerOpen ? 0x11 : 0x13;

  const c = dir0 === 0 ? 0x16 : dir0 === 3 ? 0x10 : 0x0a;

  let d: number;
  if (dir0 === 0) {
    if (northOfEast === 0) d = 0x16;
    else if (dir2 !== 0) d = 4;
    else d = eastOfNorth === 0 ? 8 : 0x0c;
  } else if (dir2 !== 0) d = 0x0e;
  else d = eastOfNorth === 0 ? 0x17 : 0x0a;

  setBackgroundTile(ids, ox, oy, a, 0, 5);
  setBackgroundTile(ids, ox, oy, b, 0, 6);
  setBackgroundTile(ids, ox, oy, c, 1, 5);
  setBackgroundTile(ids, ox, oy, d, 1, 6);
}

function clampD10(v: number): number {
  return Math.max(1, Math.min(10, Math.trunc(v)));
}

function rollDie(rng: CoabDiceRoller, sides: number): number {
  return Math.max(1, Math.min(sides, Math.trunc(rng.rollDie(sides))));
}

function rollDice(rng: CoabDiceRoller, sides: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(rng, sides);
  return total;
}

function canPlaceRandomFurniture(dir0: CoabWallFlag, dir2: CoabWallFlag, dir4: CoabWallFlag, dir6: CoabWallFlag): boolean {
  if (dir0 !== 1 && dir2 !== 1 && dir4 !== 1 && dir6 !== 1) return false;
  if (dir0 === 1 && dir4 === 1 && (dir2 !== 1 || dir6 !== 1)) return false;
  if (dir2 === 1 && dir6 === 1 && (dir0 !== 1 || dir4 !== 1)) return false;
  if (dir0 === 3 || dir2 === 3 || dir4 === 3 || dir6 === 3) return false;
  return true;
}

function isDungeonFloor(ids: readonly number[], col: number, row: number): boolean {
  return col >= 0 && col <= 49 && row >= 0 && row <= 24 && backgroundTile(ids[row * 50 + col] ?? 0).tileIndex === FLOOR_TILE_INDEX;
}

function addRandomFurniture(
  input: CoabCombatMapInput,
  ids: number[],
  ox: number,
  oy: number,
  mapX: number,
  mapY: number,
  dir0: CoabWallFlag,
  dir2: CoabWallFlag,
  dir4: CoabWallFlag,
  dir6: CoabWallFlag,
): void {
  const rng = input.randomFurniture;
  if (!rng || ((input.sampleX2?.(mapX, mapY) ?? 0) & 0x40) === 0) return;
  if (!canPlaceRandomFurniture(dir0, dir2, dir4, dir6)) return;

  for (let v1 = 2; v1 <= 3; v1++) {
    for (let v2 = 2; v2 <= 4; v2++) {
      const col = (ox * 6) + (oy * 5) + 0x15 + v1 + v2;
      const row = (oy * 5) + 0x0a + v2;
      if (!isDungeonFloor(ids, col, row) || clampD10(rng.rollD10()) > 5) continue;

      ids[row * 50 + col] = TILE_TABLE;

      for (const dir of [0, 2, 4, 6] as const) {
        const nx = col + DX[dir];
        const ny = row + DY[dir];
        if (isDungeonFloor(ids, nx, ny) && clampD10(rng.rollD10()) <= 9) {
          ids[row * 50 + col] = TILE_CHAIR;
        }
      }
    }
  }
}

/**
 * Deterministic CoAB `SetupDungeonFloor` core.
 *
 * Source: `coab_extracted/engine/ovr011.cs` `SetupDungeonFloor` plus
 * `build_background_tiles_1..4`, `set_background_tile`, and optionally `sub_370D3`
 * when an explicit `randomFurniture` roller is supplied.
 */
export function buildCoabDungeonCombatMap(input: CoabCombatMapInput): CoabCombatMap {
  const ids = new Array<number>(50 * 25).fill(0);

  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -6; ox <= 6; ox++) {
      const mapX = input.party.x + ox;
      const mapY = input.party.y + oy;
      const dir0 = edgeFlag(input, 0, mapX, mapY);
      const dir6 = edgeFlag(input, 6, mapX, mapY);
      const dir2 = edgeFlag(input, 2, mapX, mapY);
      const dir4 = edgeFlag(input, 4, mapX, mapY);

      buildBackgroundTiles1(ids, ox, oy, dir6);
      buildBackgroundTiles2(ids, ox, oy, dir0);
      buildBackgroundTiles3(input, ids, ox, oy, mapX, mapY, dir0, dir6);
      buildBackgroundTiles4(input, ids, ox, oy, mapX, mapY, dir0, dir2);
      addRandomFurniture(input, ids, ox, oy, mapX, mapY, dir0, dir2, dir4, dir6);
    }
  }

  return {
    width: 50,
    height: 25,
    backgroundIds: ids,
    terrain: terrainGridFromBackgroundMap(50, 25, ids),
    // CoAB positions the current dungeon cell near x 21..27, y 10..14; use the central lane as anchors.
    partyAnchor: { col: 22, row: 12 },
    enemyAnchor: { col: 31, row: 12 },
  };
}

function setGroundTile40(ids: number[], col: number, row: number): void {
  if (col < 0x31) ids[row * 50 + col + 1] = 0x40;
  if (row < 0x18 && col < 0x31) ids[(row + 1) * 50 + col + 1] = 0x41;
}

function setupWildernessFloor01(ids: number[], cityFlags: number, rng: CoabDiceRoller): void {
  let threshold = 0;
  if ((cityFlags & 0x20) !== 0) threshold = 0x23;
  if ((cityFlags & 0x10) !== 0) threshold = 0x4b;
  if (rollDie(rng, 100) > threshold) return;

  let col = 0x22 - rollDice(rng, 4, 5);
  while (((col + 2) % 7) > 0) col--;

  for (let row = 0; row <= 0x18; row++) {
    if (col <= 0x31) {
      ids[row * 50 + col] = rollDie(rng, 2) + 0x3b;
      if (col < 0x31) ids[row * 50 + col + 1] = rollDie(rng, 2) + 0x3d;
      if (rollDie(rng, 20) === 1) setGroundTile40(ids, col, row);
      col++;
    }
  }
}

function setupWildernessFloor02(ids: number[], cityFlags: number, rng: CoabDiceRoller): void {
  if ((cityFlags & 0x80) !== 0) return;
  let neededRoll = 10;
  if ((cityFlags & 2) !== 0) neededRoll -= 5;
  if ((cityFlags & 4) !== 0) neededRoll -= 2;
  if ((cityFlags & 0x40) !== 0) neededRoll += 5;
  if ((cityFlags & 8) !== 0) neededRoll += 10;
  if (neededRoll < 0) neededRoll = 1;

  for (let col = 0; col <= 0x31; col++) {
    for (let row = 1; row <= 0x18; row++) {
      if (
        backgroundTile(ids[row * 50 + col] ?? 0).tileIndex === FLOOR_TILE_INDEX &&
        backgroundTile(ids[(row - 1) * 50 + col] ?? 0).tileIndex === FLOOR_TILE_INDEX &&
        neededRoll >= rollDie(rng, 100)
      ) {
        if (neededRoll >= rollDie(rng, 100)) {
          ids[row * 50 + col] = rollDie(rng, 2) + 0x29;
        } else {
          ids[(row - 1) * 50 + col] = rollDie(rng, 5) + 0x1f;
          ids[row * 50 + col] = rollDie(rng, 5) + 0x24;
        }
      }
    }
  }
}

function setGroupMapStepped(
  ids: number[],
  rng: CoabDiceRoller,
  stepE: number,
  stepD: number,
  stepC: number,
  stepB: number,
  stepA: number,
  row: number,
  col: number,
): void {
  const roll = rollDie(rng, 100);
  if (roll <= stepA) ids[row * 50 + col] = rollDie(rng, 2) + 0x39;
  else if (roll <= stepA + stepB) ids[row * 50 + col] = rollDie(rng, 2) + 0x2f;
  else if (roll <= stepA + stepB + stepC) ids[row * 50 + col] = rollDie(rng, 4) + 0x2b;
  else if (roll <= stepA + stepB + stepC + stepD) ids[row * 50 + col] = rollDie(rng, 3) + 0x36;
  else if (roll <= stepA + stepB + stepC + stepD + stepE) ids[row * 50 + col] = rollDie(rng, 4) + 0x31;
}

function setupWildernessFloor03(ids: number[], cityFlags: number, rng: CoabDiceRoller): void {
  let score = 50;
  if ((cityFlags & 0x10) !== 0) score += 10;
  if ((cityFlags & 0x20) !== 0) score += 30;
  if ((cityFlags & 0x40) !== 0) score += 20;
  if ((cityFlags & 4) !== 0) score -= 10;
  if ((cityFlags & 2) !== 0) score -= 20;
  if ((cityFlags & 0x80) !== 0) score -= 50;

  for (let col = 0; col <= 49; col++) {
    for (let row = 0; row <= 24; row++) {
      if (backgroundTile(ids[row * 50 + col] ?? 0).tileIndex !== FLOOR_TILE_INDEX) continue;
      if (score >= -30 && score <= 9) setGroupMapStepped(ids, rng, 15, 30, 0, 0, 0, row, col);
      else if (score >= 10 && score <= 29) setGroupMapStepped(ids, rng, 10, 14, 5, 1, 0, row, col);
      else if (score >= 30 && score <= 69) setGroupMapStepped(ids, rng, 5, 10, 5, 2, 0, row, col);
      else if (score >= 60 && score <= 89) setGroupMapStepped(ids, rng, 1, 10, 10, 2, 10, row, col);
      else if (score >= 90 && score <= 110) setGroupMapStepped(ids, rng, 1, 10, 15, 5, 15, row, col);
    }
  }
}

function buildGen1WildernessCombatMap(cityFlags: number, rng: CoabDiceRoller): CoabCombatMap {
  const ids = new Array<number>(50 * 25).fill(23);
  setupWildernessFloor01(ids, cityFlags, rng);
  setupWildernessFloor02(ids, cityFlags, rng);
  setupWildernessFloor03(ids, cityFlags, rng);

  return {
    width: 50,
    height: 25,
    backgroundIds: ids,
    terrain: terrainGridFromBackgroundMap(50, 25, ids),
    partyAnchor: { col: 22, row: 12 },
    enemyAnchor: { col: 31, row: 12 },
  };
}

/** CoAB `SetupWildernessFloor()` over the recovered `CityInfo` table and injected dice. */
export function buildCoabWildernessCombatMap(input: CoabWildernessCombatMapInput): CoabCombatMap {
  return buildGen1WildernessCombatMap(COAB_CITY_INFO[input.currentCity] ?? 0, input.rng);
}

/**
 * Gateway ovr012 `SetupWildernessFloor()` over Gateway's exact resident `CityInfo` table.
 * The five generator/helper routines are instruction-identical to CoAB after Gateway's compiler
 * entry thunk, so the shared implementation is byte-proven rather than a cross-title inference.
 */
export function buildGatewayWildernessCombatMap(input: CoabWildernessCombatMapInput): CoabCombatMap {
  return buildGen1WildernessCombatMap(GATEWAY_CITY_INFO[input.currentCity] ?? 0, input.rng);
}

function coabIndex(col: number, row: number): number {
  return row * 50 + col;
}

function inCoabCombatMap(col: number, row: number): boolean {
  return col >= 0 && col <= 49 && row >= 0 && row <= 24;
}

/**
 * CoAB downed-player tile mutation over `mapToBackGroundTile`.
 *
 * Battle setup (`ovr011`) writes `Tile_DownPlayer` unconditionally for already-downed team members.
 * The in-combat death animation path (`ovr033`) preserves a `Tile_StinkingCloud` cell visually while
 * still recording the original tile for later restore.
 */
export function markCoabDownedPlayerTile(
  ids: number[],
  pos: { col: number; row: number },
  opts: { targetId?: string | null; preserveStinkingCloud?: boolean } = {},
): CoabDownedTile | null {
  if (!inCoabCombatMap(pos.col, pos.row)) return null;
  const idx = coabIndex(pos.col, pos.row);
  const originalBackgroundTile = ids[idx] ?? 0;
  const record: CoabDownedTile = { col: pos.col, row: pos.row, originalBackgroundTile, targetId: opts.targetId ?? null };
  if (!(opts.preserveStinkingCloud && originalBackgroundTile === COAB_TILE_STINKING_CLOUD)) {
    ids[idx] = COAB_TILE_DOWN_PLAYER;
  }
  return record;
}

/**
 * Restore a downed-player background tile after the target stands up or is removed. Mirrors the CoAB
 * guard that avoids overwriting the same map cell while another downed player record still occupies it.
 */
export function restoreCoabDownedPlayerTile(
  ids: number[],
  record: CoabDownedTile,
  remainingDowned: readonly CoabDownedTile[] = [],
): void {
  if (!inCoabCombatMap(record.col, record.row)) return;
  if (remainingDowned.some((d) => d.targetId != null && d.col === record.col && d.row === record.row)) return;
  ids[coabIndex(record.col, record.row)] = record.originalBackgroundTile;
}

const COAB_DIR_DELTA: Record<number, GridPos> = {
  0: { col: 0, row: -1 },
  1: { col: 1, row: -1 },
  2: { col: 1, row: 0 },
  3: { col: 1, row: 1 },
  4: { col: 0, row: 1 },
  5: { col: -1, row: 1 },
  6: { col: -1, row: 0 },
  7: { col: -1, row: -1 },
  8: { col: 0, row: 0 },
};
const SMALL_CLOUD_DIRECTIONS = [8, 2, 3, 4] as const;
const CLOUD_DIRECTIONS = [8, 0, 1, 2, 3, 4, 5, 6, 7] as const;

function cloudTile(kind: CoabGasCloudKind): number {
  return kind === 'stinking' ? COAB_TILE_STINKING_CLOUD : COAB_TILE_CLOUD_KILL;
}

function downedAt(downed: readonly CoabDownedTile[], col: number, row: number): CoabDownedTile | null {
  for (let i = downed.length - 1; i >= 0; i--) {
    const d = downed[i]!;
    if (d.targetId != null && d.col === col && d.row === row) return d;
  }
  return null;
}

function cloudAt(clouds: readonly CoabGasCloudRecord[], col: number, row: number): CoabGasCloudCell | null {
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i]!;
    const cell = c.cells.find((p) => p.present && p.col === col && p.row === row);
    if (cell && cell.savedGroundId !== COAB_TILE_STINKING_CLOUD && cell.savedGroundId !== COAB_TILE_CLOUD_KILL) return cell;
  }
  return null;
}

function peeledGroundId(
  ids: readonly number[],
  col: number,
  row: number,
  downed: readonly CoabDownedTile[],
  clouds: readonly CoabGasCloudRecord[],
): number {
  const current = ids[coabIndex(col, row)] ?? 0;
  if (current === COAB_TILE_DOWN_PLAYER) return downedAt(downed, col, row)?.originalBackgroundTile ?? current;
  if (current === COAB_TILE_STINKING_CLOUD || current === COAB_TILE_CLOUD_KILL) return cloudAt(clouds, col, row)?.savedGroundId ?? current;
  return current;
}

/** Apply CoAB stinking-cloud/cloudkill `mapToBackGroundTile` overlay and return its saved-ground record. */
export function applyCoabGasCloudTileMutation(
  ids: number[],
  input: {
    kind: CoabGasCloudKind;
    target: GridPos;
    downed?: readonly CoabDownedTile[];
    clouds?: readonly CoabGasCloudRecord[];
    ordinal?: number;
    casterId?: string | null;
  },
): CoabGasCloudRecord {
  const directions = input.kind === 'stinking' ? SMALL_CLOUD_DIRECTIONS : CLOUD_DIRECTIONS;
  const downed = input.downed ?? [];
  const clouds = input.clouds ?? [];
  const record: CoabGasCloudRecord = { kind: input.kind, target: input.target, cells: [], ordinal: input.ordinal, casterId: input.casterId ?? null };
  for (const dir of directions) {
    const delta = COAB_DIR_DELTA[dir]!;
    const col = input.target.col + delta.col;
    const row = input.target.row + delta.row;
    if (!inCoabCombatMap(col, row)) {
      record.cells.push({ col, row, present: false, savedGroundId: 0 });
      continue;
    }
    const savedGroundId = peeledGroundId(ids, col, row, downed, clouds);
    const present = savedGroundId > 0 && backgroundTile(savedGroundId).moveCost < 0xff;
    record.cells.push({ col, row, present, savedGroundId });
    if (present) ids[coabIndex(col, row)] = cloudTile(input.kind);
  }
  return record;
}

/**
 * Restore a saved CoAB gas cloud and re-overlay remaining clouds of the same kind on its cells.
 * The native Stinking Cloud and Cloudkill expiry routines traverse separate lists; cross-kind
 * overlaps are therefore not repainted by the expiring kind's restore pass.
 */
export function restoreCoabGasCloudTileMutation(
  ids: number[],
  record: CoabGasCloudRecord,
  input: { downed?: readonly CoabDownedTile[]; remainingClouds?: readonly CoabGasCloudRecord[] } = {},
): void {
  const downed = input.downed ?? [];
  const remainingClouds = input.remainingClouds ?? [];
  for (const cell of record.cells) {
    if (!cell.present || !inCoabCombatMap(cell.col, cell.row)) continue;
    const idx = coabIndex(cell.col, cell.row);
    ids[idx] = downedAt(downed, cell.col, cell.row) ? COAB_TILE_DOWN_PLAYER : cell.savedGroundId;
    for (const cloud of remainingClouds) {
      if (cloud.kind !== record.kind) continue;
      if (cloud.cells.some((c) => c.present && c.col === cell.col && c.row === cell.row)) ids[idx] = cloudTile(cloud.kind);
    }
  }
}

/** Create a live CoAB combat tile state from a recovered 50x25 `mapToBackGroundTile` snapshot. */
export function createCoabCombatTileState(backgroundIds: readonly number[]): CoabCombatTileState {
  const ids = Array.from(backgroundIds);
  return {
    width: 50,
    height: 25,
    backgroundIds: ids,
    terrain: terrainGridFromBackgroundMap(50, 25, ids),
    downed: [],
    clouds: [],
    nextCloudOrdinal: 0,
  };
}

function reoverlayCloudsAt(state: CoabCombatTileState, col: number, row: number): void {
  if (!inCoabCombatMap(col, row)) return;
  for (const cloud of state.clouds) {
    if (cloud.cells.some((c) => c.present && c.col === col && c.row === row)) {
      state.backgroundIds[coabIndex(col, row)] = cloudTile(cloud.kind);
    }
  }
}

/** Mark a live combatant as downed in the CoAB tile state and remember the cell for later restore. */
export function markCoabCombatTileDowned(
  state: CoabCombatTileState,
  pos: GridPos,
  opts: { targetId?: string | null; preserveStinkingCloud?: boolean } = {},
): CoabDownedTile | null {
  const existing = opts.targetId == null ? -1 : state.downed.findIndex((d) => d.targetId === opts.targetId);
  if (existing >= 0) state.downed.splice(existing, 1);
  const rec = markCoabDownedPlayerTile(state.backgroundIds, pos, opts);
  if (rec) state.downed.push(rec);
  return rec;
}

/** Restore a downed combatant tile by target id or record, preserving any still-active cloud overlay. */
export function restoreCoabCombatTileDowned(
  state: CoabCombatTileState,
  targetOrRecord: string | CoabDownedTile,
): boolean {
  const idx = typeof targetOrRecord === 'string'
    ? state.downed.findIndex((d) => d.targetId === targetOrRecord)
    : state.downed.indexOf(targetOrRecord);
  if (idx < 0) return false;
  const [rec] = state.downed.splice(idx, 1);
  if (!rec) return false;
  restoreCoabDownedPlayerTile(state.backgroundIds, rec, state.downed);
  reoverlayCloudsAt(state, rec.col, rec.row);
  return true;
}

/** Add a timed CoAB gas cloud to live tile state and apply its visible `mapToBackGroundTile` overlay. */
export function addCoabCombatTileGasCloud(
  state: CoabCombatTileState,
  input: {
    kind: CoabGasCloudKind;
    target: GridPos;
    currentRound: number;
    durationRounds: number;
    casterId?: string | null;
  },
): CoabTimedGasCloudRecord {
  const ordinal = state.nextCloudOrdinal++;
  const base = applyCoabGasCloudTileMutation(state.backgroundIds, {
    kind: input.kind,
    target: input.target,
    downed: state.downed,
    clouds: state.clouds,
    ordinal,
    casterId: input.casterId,
  });
  const createdRound = Math.max(0, Math.floor(input.currentRound));
  const duration = Math.max(1, Math.floor(input.durationRounds));
  const rec: CoabTimedGasCloudRecord = {
    ...base,
    id: `${base.kind}:${ordinal}`,
    ordinal,
    createdRound,
    expiresRound: createdRound + duration,
  };
  state.clouds.push(rec);
  return rec;
}

/** Restore one timed cloud and re-overlay still-active clouds of that kind or downed-player cells. */
export function expireCoabCombatTileGasCloud(
  state: CoabCombatTileState,
  target: string | CoabTimedGasCloudRecord,
): boolean {
  const idx = typeof target === 'string' ? state.clouds.findIndex((c) => c.id === target) : state.clouds.indexOf(target);
  if (idx < 0) return false;
  const [rec] = state.clouds.splice(idx, 1);
  if (!rec) return false;
  restoreCoabGasCloudTileMutation(state.backgroundIds, rec, { downed: state.downed, remainingClouds: state.clouds });
  return true;
}

/** Expire all clouds whose timed affect has reached `currentRound`; returns the records removed. */
export function tickCoabCombatTileClouds(state: CoabCombatTileState, currentRound: number): CoabTimedGasCloudRecord[] {
  const roundNow = Math.max(0, Math.floor(currentRound));
  const expired = state.clouds.filter((c) => c.expiresRound <= roundNow);
  for (const cloud of expired) expireCoabCombatTileGasCloud(state, cloud);
  return expired;
}
