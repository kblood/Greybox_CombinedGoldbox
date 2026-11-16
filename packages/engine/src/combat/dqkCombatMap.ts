import type { Direction } from '../model/index.js';
import type { GridPos, TerrainGrid } from './tactical.js';
import { dqkNativeTerrainGridFromBackgroundMap, DQK_BACKGROUND_TILES } from './terrain.js';
import { COAB_CITY_INFO } from './coabCombatMap.js';

export interface DqkNativeCombatMapInput {
  /** Row-major DQK live combat background ids from the recovered 50x25 `[bedb]+9` surface. */
  backgroundIds: readonly number[];
  /** Width of the supplied background-id surface. DQK native combat uses 50. */
  width?: number;
  /** Height of the supplied background-id surface. DQK native combat uses 25. */
  height?: number;
  /** Optional tactical party anchor on the supplied surface. */
  partyAnchor?: GridPos;
  /** Optional tactical enemy anchor on the supplied surface. */
  enemyAnchor?: GridPos;
}

export interface DqkNativeCombatMap {
  width: number;
  height: number;
  /** DQK `[bedb]+9` background ids, row-major. */
  backgroundIds: readonly number[];
  terrain: TerrainGrid;
  partyAnchor: GridPos;
  enemyAnchor: GridPos;
}

export function buildDqkNativeCombatMap(input: DqkNativeCombatMapInput): DqkNativeCombatMap {
  const width = input.width ?? 50;
  const height = input.height ?? 25;
  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError(`Invalid DQK combat map width: ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new RangeError(`Invalid DQK combat map height: ${height}`);
  }
  const expected = width * height;
  if (input.backgroundIds.length !== expected) {
    throw new RangeError(`DQK combat map background id count ${input.backgroundIds.length} != ${expected}`);
  }

  const backgroundIds = Array.from(input.backgroundIds, (id) => (Number.isInteger(id) ? id & 0xff : 0));
  return {
    width,
    height,
    backgroundIds,
    terrain: dqkNativeTerrainGridFromBackgroundMap(width, height, backgroundIds),
    partyAnchor: input.partyAnchor ?? { col: Math.max(0, Math.floor(width / 2) - 2), row: Math.floor(height / 2) },
    enemyAnchor: input.enemyAnchor ?? { col: Math.min(width - 1, Math.floor(width / 2) + 2), row: Math.floor(height / 2) },
  };
}

// ---------------------------------------------------------------------------
// DQK dungeon combat-surface population, transcribed from `DQK.EXE`.
//
// Round 32 R1. Source: the nine routines pinned in
// `docs/engine/research/dqk-overlay12-combat-setup-cluster.md` "Combat Map Population" and its R1
// addendum — dispatcher `0x02cb60`, population `0x02c397`, wall probe `0x02bd62`, edge classifier
// `0x02bddf`, floor/west `0x02be3e`, north `0x02beeb`, northwest corner `0x02bf75`, northeast
// corner `0x02c18e`, cell writer `0x02bcf0`. Every branch below carries the `DQK.EXE` file offset
// of the instruction it transcribes.
//
// Headline finding: this cluster is CoAB `SetupDungeonFloor`-shaped (same 13x5 window walk, same
// `ox*6+oy*5+0x15/0x0a` cell-coordinate formula, same edge-probe OOB special case, and every tile
// value in `buildBackgroundTiles1/2/3` transcribed byte-for-byte identical to
// `coabCombatMap.ts`'s CoAB constants) with three DIFFERENCES, all measured in
// `dqkCombatMap.test.ts`:
//   1. The whole 1250-cell surface is memset to raw id 0x16 (`0x02c397`, `lcall 0xd7,0x27a6`)
//      BEFORE the window walk, so DQK's off-window cells hold raw 0x16 — not CoAB's raw 0 (void).
//   2. `0x02c397` calls exactly four per-cell helpers and no RNG-driven fifth pass — DQK's dungeon
//      population never calls a random-number routine, unlike CoAB's `addRandomFurniture`.
//   3. The northeast-corner helper (`0x02c18e`) diverges from CoAB's `buildBackgroundTiles4` at
//      exactly one branch: when `northOfEast===3, dir2===0, eastOfNorth===0`, DQK writes tile `7`
//      (sharing code with its `northOfEast===1` case at file `0x02c274`) where CoAB writes `1`.
// ---------------------------------------------------------------------------

export type DqkWallFlag = 0 | 1 | 3;

export interface DqkDungeonCombatMapInput {
  /**
   * GEO wall lookup at `(x,y)`. `DQK.EXE:0x02bd62` bounds-checks `(x,y)` against the live GEO area
   * struct at `[0xca08]` (`+1`=width, `+0`=height) and, in-bounds, reads this cell's per-direction
   * wall byte through far calls `lcall 0x1d99,0x10fd` / `0x1d99,0x10f3`. Return `null` for any
   * out-of-area `(x,y)` — the routine's own out-of-bounds branch (file `0x2bdc1`) is folded into
   * `dqkWallProbe` below, so the caller does not need to replicate the width/height check.
   */
  sample: (x: number, y: number) => Record<Direction, number> | null;
  /** Optional door/x3 flags read by the same `0x02bd62` in-bounds branch (`lcall 0x1d99,0x10f3`). */
  sampleDoors?: (x: number, y: number) => Record<Direction, number> | null;
  /** Party dungeon position. `DQK.EXE:0x02c397` reads it from DGROUP `[0xc9f0]`/`[0xc9f1]`. */
  party: { x: number; y: number };
  /**
   * Injected RNG, kept ONLY for interface parity with `CoabRandomSource`/`addRandomFurniture`.
   * **Unused.** None of the nine transcribed routines contains an `lcall` to the DQK
   * random-number routine — `0x02c397`'s dungeon population calls exactly four per-cell helpers
   * (`0x02be3e`, `0x02beeb`, `0x02bf75`, `0x02c18e`) and no fifth furniture/RNG pass. See the RNG
   * census in `dqkCombatMap.test.ts` and the research doc.
   */
  rng?: { random: (maxExclusive: number) => number };
}

export interface DqkDungeonCombatMap {
  width: 50;
  height: 25;
  /** DQK `[bedb]+9` background ids (raw `tileId+1` encoding, `DQK.EXE:0x02bcf0`), row-major. */
  backgroundIds: readonly number[];
  terrain: TerrainGrid;
  partyAnchor: GridPos;
  enemyAnchor: GridPos;
}

type DqkDirId = 0 | 2 | 4 | 6;
const DQK_DIR_NAME: Record<DqkDirId, Direction> = { 0: 'north', 2: 'east', 4: 'south', 6: 'west' };
/** `(dir + 4) mod 8` at `0x02bddf`'s head (`0x02bde5..0x2bdf3`), restricted to the four cardinals
 *  this routine is ever called with. */
const DQK_OPPOSITE: Record<DqkDirId, DqkDirId> = { 0: 4, 2: 6, 4: 0, 6: 2 };
/** DGROUP delta tables at `0x6189`/`0x6192` (file `0x69ba9`/`0x69bb2`, 9 bytes each, compass
 *  order 0..7 with a trailing pad byte): dx=[0,1,1,1,0,-1,-1,-1,0], dy=[-1,-1,0,1,1,1,0,-1,0]. */
const DQK_DX: Record<DqkDirId, number> = { 0: 0, 2: 1, 4: 0, 6: -1 };
const DQK_DY: Record<DqkDirId, number> = { 0: -1, 2: 0, 4: 1, 6: 0 };

/** `DQK.EXE:0x02bd62`'s out-of-bounds branch (file `0x2bdc1..0x2bdda`): open only along the
 *  party's own row (`[0xc9f1]`) and only for east/west (`dir===2||dir===6`); wall otherwise. */
function dqkOutOfBoundsFlag(dir: DqkDirId, y: number, partyY: number): DqkWallFlag {
  if (y !== partyY) return 1;
  return dir === 2 || dir === 6 ? 0 : 1;
}

/** `DQK.EXE:0x02bd62` — wall/door read for one cell in one direction, folding in the OOB branch. */
function dqkWallProbe(input: DqkDungeonCombatMapInput, dir: DqkDirId, x: number, y: number): DqkWallFlag {
  const cell = input.sample(x, y);
  if (!cell) return dqkOutOfBoundsFlag(dir, y, input.party.y);
  const name = DQK_DIR_NAME[dir];
  const wall = cell[name] ?? 0;
  if (wall === 0) return 0;
  const doors = input.sampleDoors?.(x, y) ?? null;
  return (doors?.[name] ?? 0) === 0 ? 1 : 3;
}

/** `DQK.EXE:0x02bddf` — edge classifier: OR of the probe at `(x,y,dir)` and the probe from the
 *  neighbouring cell at `(x+dx,y+dy,opposite(dir))`. Byte-identical in shape to CoAB's `edgeFlag`. */
function dqkEdgeFlag(input: DqkDungeonCombatMapInput, dir: DqkDirId, x: number, y: number): DqkWallFlag {
  const a = dqkWallProbe(input, dir, x, y);
  const b = dqkWallProbe(input, DQK_OPPOSITE[dir], x + DQK_DX[dir], y + DQK_DY[dir]);
  return (a | b) as DqkWallFlag;
}

/** `DQK.EXE:0x02bcf0` — cell writer. `x = ox*6 + oy*5 + localX + 0x15`, `y = oy*5 + localY + 0x0a`;
 *  bounds `0<=x<=0x31`, `0<=y<=0x18`; writes `id+1` at `[bedb]+9 + y*50 + x`. */
function dqkWriteCell(ids: number[], ox: number, oy: number, id: number, localY: number, localX: number): void {
  const x = ox * 6 + oy * 5 + localX + 0x15;
  const y = oy * 5 + localY + 0x0a;
  if (x >= 0 && x <= 0x31 && y >= 0 && y <= 0x18) ids[y * 50 + x] = id + 1;
}

/** `DQK.EXE:0x02be3e` — floor fill (`y=2..4,x=0..5`, id `0x16`, file `0x2be44..0x2be72`) plus the
 *  west-wall (`dir6`) diagonal jog (`dir6===1`, file `0x2be79..0x2beb8`, values 4/3/0xd) or notch
 *  (`dir6===3`, file `0x2bec0..0x2bee4`, values 8@(2,1) and 0@(4,5)). Both value sets are
 *  byte-identical to CoAB `buildBackgroundTiles1`. */
function dqkBuildFloorAndWest(ids: number[], ox: number, oy: number, dir6: DqkWallFlag): void {
  for (let y = 2; y <= 4; y++) for (let x = 0; x <= 5; x++) dqkWriteCell(ids, ox, oy, 0x16, y, x);
  if (dir6 === 1) {
    for (let v = 2; v <= 4; v++) {
      dqkWriteCell(ids, ox, oy, 4, v, v - 1);
      dqkWriteCell(ids, ox, oy, 3, v, v);
      dqkWriteCell(ids, ox, oy, 0x0d, v, v + 1);
    }
  } else if (dir6 === 3) {
    dqkWriteCell(ids, ox, oy, 8, 2, 1);
    dqkWriteCell(ids, ox, oy, 0, 4, 5);
  }
}

/** `DQK.EXE:0x02beeb` — north wall (`dir0`), file `0x2beeb..0x2bf74`. Byte-identical to CoAB
 *  `buildBackgroundTiles2`. */
function dqkBuildNorth(ids: number[], ox: number, oy: number, dir0: DqkWallFlag): void {
  if (dir0 === 1) {
    dqkWriteCell(ids, ox, oy, 5, 0, 3);
    dqkWriteCell(ids, ox, oy, 5, 0, 4);
    dqkWriteCell(ids, ox, oy, 0x0a, 1, 3);
    dqkWriteCell(ids, ox, oy, 0x0a, 1, 4);
  } else {
    dqkWriteCell(ids, ox, oy, 0x16, 0, 3);
    dqkWriteCell(ids, ox, oy, 0x16, 0, 4);
    dqkWriteCell(ids, ox, oy, 0x16, 1, 3);
    dqkWriteCell(ids, ox, oy, 0x16, 1, 4);
  }
}

/**
 * `DQK.EXE:0x02bf75` — northwest corner. `cornerOpen` = both `edgeFlag(west, x, y-1)===0` (file
 * `0x2bf7b..0x2bf97`) and `edgeFlag(north, x-1, y)===0` (file `0x2bf99..0x2bfb7`); writes `a,b,c,d`
 * at local `(0,1),(0,2),(1,1),(1,2)` (file `0x2c14a..0x2c187`). Every branch of `a` (file
 * `0x2bfeb..0x2c05a`), `b` (`0x2c05d..0x2c083`), `c` (`0x2c086..0x2c0e1`) and `d`
 * (`0x2c0e3..0x2c13d`) was checked byte-for-byte against CoAB `buildBackgroundTiles3` — no
 * divergence found.
 */
function dqkBuildNorthwestCorner(
  input: DqkDungeonCombatMapInput,
  ids: number[],
  ox: number,
  oy: number,
  mapX: number,
  mapY: number,
  dir0: DqkWallFlag,
  dir6: DqkWallFlag,
): void {
  const cornerOpen = dqkEdgeFlag(input, 6, mapX, mapY - 1) === 0 && dqkEdgeFlag(input, 0, mapX - 1, mapY) === 0;

  const a = dir0 === 0
    ? (dir6 === 0 ? 0x16 : dir6 === 3 ? 0x0d : cornerOpen ? 0 : 0x0d)
    : dir6 === 0 ? (cornerOpen ? 0x0f : 5) : (cornerOpen ? 0x12 : 2);

  const b = dir0 === 0 ? 0x16 : dir0 === 3 ? 0x11 : 5;

  const c = dir6 === 0
    ? (dir0 === 0 ? 0x16 : cornerOpen ? 0x10 : 0x0a)
    : dir6 === 3 ? (cornerOpen ? 0x14 : 7) : (cornerOpen ? 1 : 3);

  const d = (dir6 === 0 || dir6 === 3)
    ? (dir0 === 0 ? 0x16 : dir0 === 3 ? 0x17 : 0x0a)
    : (dir0 === 0 ? 0x0d : dir0 === 3 ? 0x15 : 6);

  dqkWriteCell(ids, ox, oy, a, 0, 1);
  dqkWriteCell(ids, ox, oy, b, 0, 2);
  dqkWriteCell(ids, ox, oy, c, 1, 1);
  dqkWriteCell(ids, ox, oy, d, 1, 2);
}

/**
 * `DQK.EXE:0x02c18e` — northeast corner. `northOfEast = edgeFlag(east, x, y-1)` (file
 * `0x2c194..0x2c1ab`), `eastOfNorth = edgeFlag(north, x+1, y)` (file `0x2c1b1..0x2c1cb`); writes
 * `a,b,c,d` at local `(0,5),(0,6),(1,5),(1,6)` (file `0x2c353..0x2c390`).
 *
 * `a` (file `0x2c208..0x2c23b`), `c` (`0x2c2d3..0x2c2f6`) and `d` (`0x2c2f8..0x2c343`) match CoAB
 * `buildBackgroundTiles4` exactly. `b` (`0x2c23e..0x2c2d0`) diverges at exactly one sub-branch:
 * when `northOfEast===3` AND `dir2===0` AND `eastOfNorth===0`, file `0x2c260..0x2c274` falls
 * through into the SAME code as the `northOfEast===1,dir2===0,eastOfNorth===0` case (file
 * `0x2c289..0x2c27b`) and writes tile `7`; CoAB's `buildBackgroundTiles4` gives `1` for that one
 * sub-case (its `northOfEast===3` ternary has no third branch). This is the one place in the
 * cluster where DQK is NOT byte-identical to the CoAB oracle.
 */
function dqkBuildNortheastCorner(
  input: DqkDungeonCombatMapInput,
  ids: number[],
  ox: number,
  oy: number,
  mapX: number,
  mapY: number,
  dir0: DqkWallFlag,
  dir2: DqkWallFlag,
): void {
  const northOfEast = dqkEdgeFlag(input, 2, mapX, mapY - 1);
  const eastOfNorth = dqkEdgeFlag(input, 0, mapX + 1, mapY);
  const cornerOpen = northOfEast === 0 && eastOfNorth === 0;

  const a = dir0 === 0 ? (northOfEast === 1 ? 4 : 0x16) : dir0 === 3 ? 0x0f : 5;

  let b: number;
  if (dir0 === 0) {
    if (northOfEast === 0) b = 0x16;
    else if (northOfEast === 1) b = dir2 === 0 ? (eastOfNorth !== 0 ? 0x0b : 7) : 3;
    // northOfEast === 3: DQK-only divergence from CoAB at (dir2===0, eastOfNorth===0) -> 7, not 1.
    else b = dir2 === 0 ? (eastOfNorth !== 0 ? 0x18 : 7) : 1;
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

  dqkWriteCell(ids, ox, oy, a, 0, 5);
  dqkWriteCell(ids, ox, oy, b, 0, 6);
  dqkWriteCell(ids, ox, oy, c, 1, 5);
  dqkWriteCell(ids, ox, oy, d, 1, 6);
}

/**
 * `DQK.EXE:0x02c397` (the dungeon branch of dispatcher `0x02cb60`'s `[0xb20f]+0x22 != 0` test) —
 * DQK's own dungeon combat-surface population.
 *
 * Transcribed as: memset the full 1250-cell surface to raw id `0x16` (file `0x2c39d..0x2c3b6`,
 * `lcall 0xd7,0x27a6`), then walk `oy=-2..2` outer / `ox=-6..6` inner (file `0x2c3b9..0x2c46f`,
 * matching CoAB's window and outer/inner nesting), computing the four cardinal edge flags per cell
 * (file `0x2c3dd..0x2c426`, DQK probes west/north/east/south into DGROUP `[0xa96c]/[0xa970]/
 * [0xa964]/[0xa972]` — CoAB probes north/west/east/south; the order does not change the result)
 * and calling exactly the four helpers above (file `0x2c429..0x2c450`) with **no** fifth
 * furniture/RNG pass. `[0xa972]` (south) is computed but read by none of the four helpers — a
 * dead DGROUP read, transcribed here as an unused local for fidelity.
 */
export function buildDqkDungeonCombatMap(input: DqkDungeonCombatMapInput): DqkDungeonCombatMap {
  const ids = new Array<number>(50 * 25).fill(0x16);

  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -6; ox <= 6; ox++) {
      const mapX = input.party.x + ox;
      const mapY = input.party.y + oy;
      const dir6 = dqkEdgeFlag(input, 6, mapX, mapY);
      const dir0 = dqkEdgeFlag(input, 0, mapX, mapY);
      const dir2 = dqkEdgeFlag(input, 2, mapX, mapY);
      const dir4 = dqkEdgeFlag(input, 4, mapX, mapY);
      void dir4; // [0xa972]: computed at 0x2c416..0x2c426, read by no helper below.

      dqkBuildFloorAndWest(ids, ox, oy, dir6);
      dqkBuildNorth(ids, ox, oy, dir0);
      dqkBuildNorthwestCorner(input, ids, ox, oy, mapX, mapY, dir0, dir6);
      dqkBuildNortheastCorner(input, ids, ox, oy, mapX, mapY, dir0, dir2);
    }
  }

  return {
    width: 50,
    height: 25,
    backgroundIds: ids,
    terrain: dqkNativeTerrainGridFromBackgroundMap(50, 25, ids),
    // Same central-lane anchors as CoAB (`buildCoabDungeonCombatMap`) — DQK's cell-writer formula
    // places the party's own window cell at the identical (ox=0,oy=0) offset.
    partyAnchor: { col: 22, row: 12 },
    enemyAnchor: { col: 31, row: 12 },
  };
}

// ---------------------------------------------------------------------------
// DQK wilderness combat-surface population, transcribed from `DQK.EXE`.
//
// Round 33 R3. Source: `docs/engine/research/dqk-overlay12-combat-setup-cluster.md` R3 section --
// dispatcher `0x02cb2b`, flags-table lookup `0x02c473`, floor01 `0x02c550` (+ helper `0x02c49e`),
// floor02 `0x02c6d7`, floor03 `0x02c869` (+ helper `0x02c9d3`). Every branch below carries the
// `DQK.EXE` file offset of the instruction it transcribes.
//
// Headline findings, all measured in `dqkCombatMap.test.ts` against the alternative that this is
// CoAB's `SetupWildernessFloor()` verbatim under a tile-id relabel:
//   1. The 32-byte "city flags" table DQK indexes (DGROUP `0x5d7b`, file `0x69795`) is
//      BYTE-IDENTICAL (32/32) to `COAB_CITY_INFO` -- reused here as `DQK_CITY_INFO`, not merely
//      "shaped like it". The null for that 32/32 is `GATEWAY_CITY_INFO`, itself a genuine
//      independently-tuned sibling table: it agrees with `COAB_CITY_INFO` on only 31/32 bytes, so
//      DQK's exact match is signal, not an artifact of every Gold Box title sharing this shape.
//   2. Pass 1's gate is a raw `[0xb20f]+0x33 != 0` boolean read (`0x2c556`) where CoAB rolls
//      `1d100 > threshold` -- DQK consumes exactly one fewer d100 than CoAB whenever pass 1 runs.
//      Pass 1's BODY also writes six cells per processed row (`col..col+5`) against CoAB's two
//      (`col,col+1`) plus an occasional two-cell placement -- a body-shape difference beyond the
//      gate that the plan did not name.
//   3. Pass 2's threshold constants (base and all four deltas) are DQK-specific and roughly, not
//      exactly, halved from CoAB's (`5,-3,-3,+2,+5` vs CoAB's `10,-5,-2,+5,+10`); every BIT tested
//      is identical, including the one DQK reads through a DGROUP mask byte (`[0x5d0a]`, file
//      `0x69724` = `0x02` in the shipped binary) rather than an immediate -- functionally CoAB's
//      own `cityFlags & 2`. The write bodies (tile ids/dice) are byte-identical to CoAB's.
//   4. Pass 3's `score` setup (base + all six bit/magnitude adjustments) is IDENTICAL to CoAB's,
//      including the same `[0x5d0a]`-masked bit. Only ONE step value across all five score bands
//      differs from CoAB (`stepD` of the 10..29 band: DQK `0x14`=20, CoAB `0xe`=14) -- but the
//      per-cell WRITE helper (`dqkSetGroupMapStepped`) uses entirely different tile-id bases and
//      dice sizes than CoAB's `setGroupMapStepped`, and contains a genuine DEAD BRANCH: its third
//      bucket recomputes the exact same cumulative threshold as its second bucket (`s0+s1+1`,
//      file `0x2ca1e` and `0x2ca51` compute the identical expression), so that bucket's own
//      `roll(1d5)+0x2c` write can never execute -- a real compiled-code artifact in shipped
//      `DQK.EXE`, not a transcription error, kept here for fidelity.
//   5. Both floor02 and floor03 gate on `BackGroundTiles[storedId].tileIndex == 0x25`, which is
//      exactly DQK's own "still untouched fill" test: `DQK_BACKGROUND_TILES[0x45].tileIndex ===
//      0x25` (`terrain.ts`), the SAME fill id `0x02cb2b`'s memset uses. This is DQK's own version
//      of CoAB's `FLOOR_TILE_INDEX` gate (CoAB fill `23` -> `tileIndex 0x16`) -- same mechanism,
//      different fill/tileIndex pair, not a divergence.
// ---------------------------------------------------------------------------

export interface DqkDiceRoller {
  /** Equivalent to DQK's far dice routine `lcall 0x48f:0x1968`: returns `1..sides`. Same shape as
   *  `CoabDiceRoller.rollDie`. */
  rollDie: (sides: number) => number;
}

/**
 * `DQK.EXE:0x69795` (DGROUP `0x5d7b`), the 32-byte table `0x02c473` copies onto the stack
 * (`lcall 0xd7,0x2b69`, file `0x2c47a..0x2c486`) and indexes by `[0xa960]`. Dumped and compared
 * byte-for-byte against `COAB_CITY_INFO`: **identical, 32/32** (see the headline findings above for
 * the `GATEWAY_CITY_INFO` null). Re-exported under a DQK-specific name for callers that want to be
 * explicit about which binary they are modelling; the values are the SAME array as `COAB_CITY_INFO`.
 */
export const DQK_CITY_INFO: readonly number[] = COAB_CITY_INFO;

export interface DqkWildernessCombatMapInput {
  /**
   * `[0xb20f]+0x1a2`, copied to `[0xa960]` at the dispatcher (`DQK.EXE:0x02cb4b`) and used by
   * `0x02c473` as the index into `DQK_CITY_INFO`. Directly analogous to CoAB's own
   * `CoabWildernessCombatMapInput.currentCity`. **No writer for `[0xb20f]+0x1a2` was found** in the
   * modelled area-5 overland ECL host (`world/dqkArea5Overland.ts`'s own tracked memory offsets are
   * entirely different byte-addressed ECL VM cells -- `0x00c0/0x00c1/0x001b/0x00ca..0x00cc/0x003a`
   * -- not this native DGROUP struct field; see `docs/engine/research/address-space-not-flag`
   * caution in memory). Ships as an explicit input. Default `0`, matching `DQK_CITY_INFO[0] ===
   * 0x00` (CoAB's own "no city" row, all bits clear) -- no default area-5 city association was
   * found either.
   */
  currentCity?: number;
  /**
   * `[0xb20f]+0x33`, pass 1's (`DQK.EXE:0x02c550`) gate: pass 1 runs only when this byte is
   * non-zero (file `0x2c55a..0x2c561`). **No writer found** in the modelled area-5 overland code
   * either. Ships as an explicit input. Default `true` (pass 1 runs) -- stated reason: without a
   * default of `true`, no flags value could ever exercise pass 1, and the comparison test's own
   * requirement (at least two of the three passes must write cells) needs a way to turn it on.
   */
  pass1Gate?: boolean;
  /** Injected dice roller for all three passes (`DQK.EXE:0x48f:0x1968`). */
  rng: DqkDiceRoller;
}

export interface DqkWildernessCombatMap {
  width: 50;
  height: 25;
  /** DQK `[bedb]+9` background ids (raw stored id, `DQK.EXE:0x02cb2b`'s fill plus the three
   *  passes' writes), row-major. */
  backgroundIds: readonly number[];
  terrain: TerrainGrid;
  partyAnchor: GridPos;
  enemyAnchor: GridPos;
}

/** `DQK.EXE:0x48f:0x1968` far dice routine. Verified `lcall` argument push order: size pushed
 *  first (deep), count pushed last (shallow) -- so under this repo's far-call convention (last
 *  pushed = first stack argument), the routine reads as `(count, size)`. Modelled exactly the way
 *  `coabCombatMap.ts`'s own `rollDice` models CoAB's `roll_dice`: `count` independent
 *  `rng.rollDie(sides)` calls, summed. */
function dqkRollDice(rng: DqkDiceRoller, sides: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.max(1, Math.min(sides, Math.trunc(rng.rollDie(sides))));
  }
  return total;
}

/** `DQK.EXE:0x02c473` -- flags-table lookup, modelled as a direct table read (the far-call copy
 *  loop that stages `DQK_CITY_INFO` onto the stack before indexing it is not itself meaningful --
 *  see the constant above). `?? 0` matches CoAB's own `COAB_CITY_INFO[input.currentCity] ?? 0`
 *  out-of-range fallback. */
function dqkCurrentCityFlags(input: DqkWildernessCombatMapInput): number {
  return DQK_CITY_INFO[input.currentCity ?? 0] ?? 0;
}

/** `DQK.EXE:0x02c397`'s combat map stores raw ids directly in `DQK_BACKGROUND_TILES` index space
 *  (no renderer clamp at setup time -- the ASM does `id*4 + 0x6197`, no `0`-or-`>0x4c` guard), so
 *  this reads the table directly rather than through `dqkNativeCombatBackgroundId`. */
function dqkTileIndexOf(id: number): number {
  return DQK_BACKGROUND_TILES[id & 0xff]?.tileIndex ?? -1;
}

/** `DQK.EXE:0x02c49e` -- pass 1's per-hit river-mouth writer, called when the escalating `1d20`
 *  roll does not exceed the running counter. `x` here is literally the caller's `col+1` (the call
 *  site at `0x2c5da..0x2c5ef` pushes `col+1`, not `col`) -- kept as-is so every bounds check below
 *  matches the transcribed ASM term-for-term. The out-param write that resets the caller's counter
 *  to 1 (file `0x2c547..0x2c54a`) is applied by the caller, `dqkWildernessFloor01`, immediately
 *  after this call returns -- see there. */
function dqkWildernessFloor01Notch(ids: number[], x: number, y: number, rng: DqkDiceRoller): void {
  const at = (col: number) => y * 50 + col;
  ids[at(x)] = 0x3a; // file 0x2c4b6, unconditional
  if (x < 0x31) ids[at(x + 1)] = dqkRollDice(rng, 2, 1) + 0x3a; // file 0x2c4c4..0x2c4ea
  if (x + 1 < 0x31) ids[at(x + 2)] = dqkRollDice(rng, 2, 1) + 0x3a; // file 0x2c4f8..0x2c51e
  if (x + 2 < 0x31) ids[at(x + 3)] = 0x3d; // file 0x2c542
}

/**
 * Exported (unlike the dungeon sibling's private helpers) so `dqkCombatMap.test.ts` can call
 * each pass standalone with a fresh counting roller and report per-pass dice consumption --
 * `coabCombatMap.ts`'s own pass functions stay private, so this is a one-sided export made for
 * that test's sake, not a claim that CoAB's passes are independently callable in the same way.
 *
 * `DQK.EXE:0x02c550` -- floor01, the wilderness "river" pass.
 *
 * Gate: `[0xb20f]+0x33 != 0` (file `0x2c556..0x2c561`) -- NOT CoAB's `rollDie(100) > threshold`
 * gate; DQK reads a boolean straight from the area struct and consumes no d100 for it.
 *
 * `col = 0x22 - rollDice(rng,4,5)` (file `0x2c564..0x2c575`, a single `lcall` returning the 5d4
 * sum, exactly like CoAB's own `rollDice(rng,4,5)`); `while (((col+2)%7)>0) col--` (file
 * `0x2c57d..0x2c58b`) -- both byte-identical to CoAB's own `setupWildernessFloor01` derivation.
 *
 * Then, for `row = 0..0x18` (file `0x2c591..0x2c6d0`), while `col <= 0x31` (only then does `col`
 * advance -- file `0x2c598..0x2c6c7`, same "frozen once out of range" behaviour as CoAB): write
 * `(col,row) = 0x34` unconditionally (file `0x2c5b6`); if `col < 0x31` (file `0x2c5bb`), roll
 * `1d20` (file `0x2c5c4..0x2c5ca`) against an escalating counter (starts at 1, file `0x2c58d`):
 * roll > counter -> increment the counter and write a 4-cell "bank" run at `col+1..col+4` with ids
 * `roll(1d2)+0x34, 0x37, 0x37, roll(1d2)+0x37` (file `0x2c5f2..0x2c69a`, each of the last three
 * gated on the next column staying `< 0x31`); roll <= counter -> call
 * `dqkWildernessFloor01Notch(col+1, row)` (file `0x2c5da..0x2c5ef`) and reset the counter to 1
 * (file `0x2c547`, folded into the caller here). Either way, if `col+4 < 0x31`, write
 * `(col+5,row) = 0x34` (file `0x2c69e..0x2c6bf`) before advancing `col` (file `0x2c6c4`).
 *
 * DQK writes SIX cells per processed row (`col..col+5`) against CoAB's TWO (`col,col+1`) plus an
 * occasional `setGroundTile40` two-cell placement -- a body-shape difference this transcription
 * found beyond the gate the plan named.
 */
export function dqkWildernessFloor01(ids: number[], input: DqkWildernessCombatMapInput): void {
  if (!(input.pass1Gate ?? true)) return; // file 0x2c55a..0x2c561

  let col = 0x22 - dqkRollDice(input.rng, 4, 5); // file 0x2c564..0x2c575
  while (((col + 2) % 7) > 0) col--; // file 0x2c57d..0x2c58b

  let counter = 1; // file 0x2c58d
  for (let row = 0; row <= 0x18; row++) {
    if (col > 0x31) continue; // file 0x2c598..0x2c59e -- col frozen, row still advances
    const at = (c: number) => row * 50 + c;
    ids[at(col)] = 0x34; // file 0x2c5b6

    if (col < 0x31) {
      const roll = dqkRollDice(input.rng, 20, 1); // file 0x2c5c4..0x2c5ca
      if (roll > counter) {
        counter++; // file 0x2c5f2
        ids[at(col + 1)] = dqkRollDice(input.rng, 2, 1) + 0x34; // file 0x2c5f5..0x2c61b
        if (col + 1 < 0x31) ids[at(col + 2)] = 0x37; // file 0x2c61f..0x2c63e
        if (col + 2 < 0x31) ids[at(col + 3)] = 0x37; // file 0x2c643..0x2c663
        if (col + 3 < 0x31) ids[at(col + 4)] = dqkRollDice(input.rng, 2, 1) + 0x37; // file 0x2c668..0x2c69a
      } else {
        dqkWildernessFloor01Notch(ids, col + 1, row, input.rng); // file 0x2c5da..0x2c5ef
        counter = 1; // file 0x2c547 (the notch helper's out-param write, folded in here)
      }
    }
    if (col + 4 < 0x31) ids[at(col + 5)] = 0x34; // file 0x2c69e..0x2c6bf

    col++; // file 0x2c6c4
  }
}

/**
 * `DQK.EXE:0x02c6d7` -- floor02, the wilderness "statue" pass.
 *
 * Early exit: `flags & 0x80` (file `0x2c6de..0x2c6e5`) -- same bit as CoAB's own exit.
 *
 * `neededRoll`: base `5` (file `0x2c6e8`; CoAB's base is `10`); `flags & [0x5d0a]` (`==0x02` in the
 * shipped binary) -= `3` (file `0x2c6ec..0x2c6f8`; CoAB: bit `2`, delta `-5`); `flags & 4` -= `3`
 * (file `0x2c6fc..0x2c704`; CoAB delta `-2`); `flags & 0x40` += `2` (file `0x2c708..0x2c710`; CoAB
 * delta `+5`); `flags & 8` += `5` (file `0x2c714..0x2c71c`; CoAB delta `+10`); clamp `< 0` to `1`
 * (file `0x2c720..0x2c726`, matching CoAB). Every BIT tested equals CoAB's; every MAGNITUDE is
 * DQK-specific.
 *
 * Population: `for (col=0..0x31) for (row=1..0x18)` (file `0x2c731..0x2c865`, same nesting as
 * CoAB), gated on `BackGroundTiles[storedId].tileIndex == 0x25` at BOTH `(row,col)`
 * (file `0x2c738..0x2c766`) and `(row-1,col)` (file `0x2c769..0x2c798`). Then two independent
 * `1d100` rolls against `neededRoll` (file `0x2c79b..0x2c7ca`): roll1 > neededRoll -> skip the
 * cell entirely (no write, file `0x2c7ae..0x2c7b2`); else roll2 > neededRoll -> two tiles,
 * `roll(1d5)+0x1f` at `(row-1,col)` then `roll(1d5)+0x24` at `(row,col)` (file
 * `0x2c7f8..0x2c849`); else -> one tile, `roll(1d2)+0x29` at `(row,col)` (file
 * `0x2c7cc..0x2c7f2`). All three tile-id formulas are byte-identical to CoAB's.
 */
export function dqkWildernessFloor02(ids: number[], input: DqkWildernessCombatMapInput): void {
  if ((dqkCurrentCityFlags(input) & 0x80) !== 0) return; // file 0x2c6e1..0x2c6e5

  let neededRoll = 5; // file 0x2c6e8
  if ((dqkCurrentCityFlags(input) & 0x02) !== 0) neededRoll -= 3; // file 0x2c6ec..0x2c6f8, [0x5d0a]=0x02
  if ((dqkCurrentCityFlags(input) & 4) !== 0) neededRoll -= 3; // file 0x2c6fc..0x2c704
  if ((dqkCurrentCityFlags(input) & 0x40) !== 0) neededRoll += 2; // file 0x2c708..0x2c710
  if ((dqkCurrentCityFlags(input) & 8) !== 0) neededRoll += 5; // file 0x2c714..0x2c71c
  if (neededRoll < 0) neededRoll = 1; // file 0x2c720..0x2c726

  for (let col = 0; col <= 0x31; col++) {
    for (let row = 1; row <= 0x18; row++) {
      const hereIdx = row * 50 + col;
      const aboveIdx = (row - 1) * 50 + col;
      if (dqkTileIndexOf(ids[hereIdx] ?? 0) !== 0x25) continue; // file 0x2c74d..0x2c766
      if (dqkTileIndexOf(ids[aboveIdx] ?? 0) !== 0x25) continue; // file 0x2c77f..0x2c798

      const roll1 = dqkRollDice(input.rng, 100, 1); // file 0x2c79b..0x2c7a1
      if (roll1 > neededRoll) continue; // file 0x2c7ae..0x2c7b2 -- no write at all

      const roll2 = dqkRollDice(input.rng, 100, 1); // file 0x2c7b5..0x2c7bb
      if (roll2 > neededRoll) {
        ids[aboveIdx] = dqkRollDice(input.rng, 5, 1) + 0x1f; // file 0x2c7f8..0x2c81f
        ids[hereIdx] = dqkRollDice(input.rng, 5, 1) + 0x24; // file 0x2c823..0x2c849
      } else {
        ids[hereIdx] = dqkRollDice(input.rng, 2, 1) + 0x29; // file 0x2c7cc..0x2c7f2
      }
    }
  }
}

/**
 * `DQK.EXE:0x02c9d3` -- pass 3's per-cell stepped-tile writer. Rolls `1d100` (file
 * `0x2c9d9..0x2c9e6`), then up to five cumulative-threshold buckets against five caller-supplied
 * step values `s0..s4` (bucket file ranges noted inline). **Bucket 3 recomputes the IDENTICAL
 * threshold as bucket 2** (`s0+s1+1`, file `0x2ca1e..0x2ca32` and `0x2ca51..0x2ca65` compute the
 * same expression from the same two inputs) -- because bucket 2 already consumes every roll
 * `<= s0+s1+1` and returns, bucket 3's own `roll(1d5)+0x2c` write (file `0x2ca67..0x2ca8d`) can
 * never execute. This is a genuine dead branch in shipped `DQK.EXE`, transcribed here rather than
 * silently dropped -- see `dqkCombatMap.test.ts` for the reachability check.
 */
function dqkSetGroupMapStepped(
  ids: number[],
  rng: DqkDiceRoller,
  s0: number,
  s1: number,
  s2: number,
  s3: number,
  s4: number,
  row: number,
  col: number,
): void {
  const roll = dqkRollDice(rng, 100, 1); // file 0x2c9d9..0x2c9e6
  const idx = row * 50 + col;
  if (roll <= s0) { ids[idx] = dqkRollDice(rng, 2, 1) + 0x31; return; } // file 0x2c9ec..0x2ca17
  if (roll <= s0 + s1 + 1) { ids[idx] = 0x2c; return; } // file 0x2ca1e..0x2ca49
  if (roll <= s0 + s1 + 1) { ids[idx] = dqkRollDice(rng, 5, 1) + 0x2c; return; } // file 0x2ca51..0x2ca8d -- UNREACHABLE, see doc comment
  if (roll <= s0 + s1 + s2 + s3) { ids[idx] = 0x44; return; } // file 0x2ca94..0x2cad1
  if (roll <= s0 + s1 + s2 + s3 + s4) { ids[idx] = dqkRollDice(rng, 6, 1) + 0x3d; return; } // file 0x2cad3..0x2cb23
  // else: no write at all (file 0x2cafb -> exit) -- roll exceeds every bucket.
}

/**
 * `DQK.EXE:0x02c869` -- floor03, the wilderness "furniture" pass.
 *
 * `score` starts at `0x32`(50) (file `0x2c870`, same base as CoAB); six DGROUP-sourced flag tests
 * each adjust it by the SAME magnitude as CoAB's own `setupWildernessFloor03`
 * (`+10,+30,+20,-10,-20,-50`, file `0x2c874..0x2c8b6`) -- the `-20` test reads `flags & [0x5d0a]`
 * (file `0x2c89f..0x2c8ab`, `[0x5d0a]==0x02` in the shipped binary), functionally CoAB's own
 * `cityFlags & 2`. Unlike floor02, every constant here (bit AND magnitude) matches CoAB exactly.
 *
 * `for (col=0..0x31) for (row=0..0x18)` (file `0x2c8bd..0x2c9ce`, same nesting/bounds as CoAB),
 * gated on `BackGroundTiles[storedId].tileIndex == 0x25` at `(row,col)` only (file
 * `0x2c8dc..0x2c8f5` -- the same "still-default-fill" test as floor02, single-cell not two).
 *
 * Five NON-overlapping `score` bands (file `0x2c8f8..0x2c9b6`, evaluated unconditionally in
 * sequence -- functionally identical to CoAB's `else if` chain here only because DQK's five ranges
 * are already disjoint, unlike CoAB's own overlapping `60..89`/`30..69` source ranges) each call
 * `dqkSetGroupMapStepped` with five step values. Bands `-30..9`, `30..69`, `70..89` and `90..110`
 * pass IDENTICAL step values to CoAB's own four call sites; band `10..29` passes
 * `(s0,s1,s2,s3,s4) = (0,1,5,0x14,0xa)` where CoAB passes `(0,1,5,0xe,0xa)` -- the sole differing
 * step value in this pass's setup, isolated to `stepD` of exactly one band (file `0x2c92b`, `0x14`
 * vs CoAB's `0xe`).
 */
export function dqkWildernessFloor03(ids: number[], input: DqkWildernessCombatMapInput): void {
  let score = 0x32; // file 0x2c870
  if ((dqkCurrentCityFlags(input) & 0x10) !== 0) score += 0x0a; // file 0x2c874..0x2c87b
  if ((dqkCurrentCityFlags(input) & 0x20) !== 0) score += 0x1e; // file 0x2c87e..0x2c886
  if ((dqkCurrentCityFlags(input) & 0x40) !== 0) score += 0x14; // file 0x2c889..0x2c891
  if ((dqkCurrentCityFlags(input) & 4) !== 0) score -= 0x0a; // file 0x2c894..0x2c89c
  if ((dqkCurrentCityFlags(input) & 0x02) !== 0) score -= 0x14; // file 0x2c89f..0x2c8ab, [0x5d0a]=0x02
  if ((dqkCurrentCityFlags(input) & 0x80) !== 0) score -= 0x32; // file 0x2c8ae..0x2c8b6

  for (let col = 0; col <= 0x31; col++) {
    for (let row = 0; row <= 0x18; row++) {
      if (dqkTileIndexOf(ids[row * 50 + col] ?? 0) !== 0x25) continue; // file 0x2c8dc..0x2c8f5

      if (score >= -0x1e && score <= 9) dqkSetGroupMapStepped(ids, input.rng, 0, 0, 0, 0x1e, 0x0f, row, col); // file 0x2c8f8..0x2c91b
      if (score >= 0x0a && score <= 0x1d) dqkSetGroupMapStepped(ids, input.rng, 0, 1, 5, 0x14, 0x0a, row, col); // file 0x2c91e..0x2c941 -- DQK stepD=0x14, CoAB stepD=0xe
      if (score >= 0x1e && score <= 0x45) dqkSetGroupMapStepped(ids, input.rng, 0, 2, 5, 0x0a, 5, row, col); // file 0x2c944..0x2c967
      if (score >= 0x46 && score <= 0x59) dqkSetGroupMapStepped(ids, input.rng, 0x0a, 2, 0x0a, 0x0a, 1, row, col); // file 0x2c96a..0x2c98d
      if (score >= 0x5a && score <= 0x6e) dqkSetGroupMapStepped(ids, input.rng, 0x0f, 5, 0x0f, 0x0a, 1, row, col); // file 0x2c990..0x2c9b3
    }
  }
}

/**
 * `DQK.EXE:0x02cb2b` -- DQK's wilderness combat-surface population (the `[0xb20f]+0x22 == 0`
 * branch of dispatcher `0x02cb60`). Memsets the full 1250-cell surface to raw id `0x45` (file
 * `0x2cb2b..0x2cb44`, `lcall 0xd7,0x27a6` -- the SAME far memset call the dungeon sibling
 * `buildDqkDungeonCombatMap` uses for its own `0x16` fill), copies `[0xb20f]+0x1a2` into
 * `[0xa960]` (file `0x2cb47..0x2cb50`), then calls floor01 (`0x02c550`), floor02 (`0x02c6d7`),
 * floor03 (`0x02c869`) in that fixed order (file `0x2cb53..0x2cb5f`) -- no other passes.
 */
export function buildDqkWildernessCombatMap(input: DqkWildernessCombatMapInput): DqkWildernessCombatMap {
  const ids = new Array<number>(50 * 25).fill(0x45); // file 0x2cb2b..0x2cb44

  dqkWildernessFloor01(ids, input); // file 0x2cb53..0x2cb54
  dqkWildernessFloor02(ids, input); // file 0x2cb57..0x2cb58
  dqkWildernessFloor03(ids, input); // file 0x2cb5b..0x2cb5c

  return {
    width: 50,
    height: 25,
    backgroundIds: ids,
    terrain: dqkNativeTerrainGridFromBackgroundMap(50, 25, ids),
    // Same central-lane anchors as the dungeon sibling and CoAB's own wilderness builder.
    partyAnchor: { col: 22, row: 12 },
    enemyAnchor: { col: 31, row: 12 },
  };
}
