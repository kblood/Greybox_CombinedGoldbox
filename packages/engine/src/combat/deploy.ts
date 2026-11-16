/**
 * Battle-setup formation generator (ovr011) — `PlaceCombatants` / `place_combatant`, decompiled in
 * `docs/engine/research/decompile-ovr011-battle-setup.md`.
 *
 * The tactical engine (`tactical.ts`) takes combatants whose `pos` is **already set**; it had no
 * initial-deployment glue. This module is that glue: it seeds the two teams' starting cells and facings
 * into the **11×6 placement region** (x 0..10, y 0..5) the originals deploy on, so a battle opens with
 * the classic Gold Box "two formations across the field" layout.
 *
 * VERIFIED behaviour reproduced here (spec §`PlaceCombatants` / §`place_combatant`):
 *  • Region is **11 wide × 6 tall** — `place_combatant` rejects a cell when `cur_x > 10 || cur_y > 5`.
 *  • **Team 0 (party)** anchors the corner `(0,0)`, 4-way facing `mapDirection / 2`.
 *  • **Team 1 (enemies)** anchors `encounter_distance` tiles away along the party's facing, 4-way facing
 *    `((mapDirection + 4) % 8) / 2` (turned back at the party).
 *  • **Front-rank width** per team `= (count + 1) / 2` (half rounded up); the rest spill into rows behind
 *    (up to 12 per back row, capped by the grid).
 *  • **Tri-state lateral expansion** (`start → right → left`) lays each rank out symmetrically from the
 *    anchor column; an out-of-grid cell pushes the formation back a rank (`row_scale++`) and retries.
 *  • **Boxed-in fallback**: a member that cannot be placed in the team's nominal frame retries against
 *    alternate frames (up to a few attempts) before being dropped — handles cramped encounters.
 *
 * Frame convention (matches `coabCombatMap.ts`): the combat grid is **normalized** so the party always
 * looks toward +col (east) and the enemy toward −col (west). `mapDirection` (the 8-way overland facing
 * the fight was entered on) is preserved as the 4-way `partyFacing4` / `enemyFacing4` per the spec
 * formulas; the per-figure `facing` written onto combatants is the normalized grid facing (`DIR8`
 * east = 0 for the party, west = 4 for the enemy). Pure / deterministic — no RNG, no engine state.
 */
import type { GridPos, Facing, TacticalCombatant } from './tactical.js';

/** The placement region the originals deploy onto: 11 wide (x 0..10) × 6 tall (y 0..5). */
export const DEPLOY_REGION = { width: 11, height: 6 } as const;

/** One deployed slot: where the figure stands and which way it faces (normalized grid `DIR8` facing). */
export interface Placement {
  pos: GridPos;
  facing: Facing;
}

export interface DeploymentResult {
  party: Placement[];
  enemies: Placement[];
  /** The party's 4-way tactical facing per the spec, `mapDirection / 2` (0=N,1=E,2=S,3=W). */
  partyFacing4: number;
  /** The enemy's 4-way tactical facing per the spec, `((mapDirection + 4) % 8) / 2`. */
  enemyFacing4: number;
}

export interface DeployOptions {
  /** Override the placement region (default {@link DEPLOY_REGION}, 11×6). */
  region?: { width: number; height: number };
}

export interface CoabSourcePlacement extends Placement {
  /** CoAB local placement column (`cur_x`) inside the 11×6 placement mask. */
  local: GridPos;
  /** Which `direction_165EC` / placement-mask variant was used by `place_combatant`. */
  directionAttempt: number;
  /** CoAB team-start cell offset (`team_start_x/y` plus any fallback direction offset). */
  teamStart: GridPos;
  /** CoAB `CombatMap.size` used for placement footprint probing. */
  sourceSize: number;
}

export interface CoabSourceDeploymentResult {
  party: CoabSourcePlacement[];
  enemies: CoabSourcePlacement[];
  partyFacing4: number;
  enemyFacing4: number;
}

export interface CoabSourceDeployOptions {
  /**
   * Team-0 cell offset inside the generated combat floor. CoAB always seeds `(0,0)`. Gateway's
   * newer `PlaceCombatants` computes `mapPos - floorOrigin`: this is also `(0,0)` for ordinary
   * 2-D/wilderness battles, but fixed/3-D callers must pass the title's captured delta.
   */
  partyStart?: GridPos;
  /**
   * CoAB `gbl.game_state == WildernessMap`; alternate placement directions are always allowed there.
   * Dungeon placement may gate alternates through `edgeFlag`.
   */
  wilderness?: boolean;
  /** CoAB `gbl.mapPosX/Y`, used only for dungeon alternate-direction checks. */
  mapPos?: GridPos;
  /** CoAB `get_dir_flags(tmpDir,tmpY,tmpX)` result for dungeon alternate-direction checks. */
  edgeFlag?: (dir: number, mapX: number, mapY: number) => number;
  /** Optional final-map occupancy/terrain rejection. `true` means the final tile cannot be used. */
  blocked?: (col: number, row: number) => boolean;
  /** Optional CoAB `CombatMap.size` values for party-side combatants. Defaults to 1 per combatant. */
  partySizes?: readonly number[];
  /** Optional CoAB `CombatMap.size` values for enemy-side combatants. Defaults to 1 per combatant. */
  enemySizes?: readonly number[];
}

/** Front-rank width: half the team rounded up, `(count + 1) / 2` (spec — `half_team_count`). */
export function frontRankWidth(count: number): number {
  return Math.floor((Math.max(0, count) + 1) / 2);
}

/** Tri-state lateral offset for the `slot`-th member of a rank: 0, +1, −1, +2, −2, … (start→right→left). */
function lateralOffset(slot: number): number {
  const k = Math.ceil(slot / 2);
  return slot % 2 === 1 ? k : -k;
}

const inRegion = (p: GridPos, region: { width: number; height: number }): boolean =>
  p.col >= 0 && p.row >= 0 && p.col < region.width && p.row < region.height;

const COAB_DIRECTION_165EC = [
  [8, 4, 6, 2],
  [8, 6, 4, 0],
  [8, 0, 6, 2],
  [8, 2, 0, 4],
] as const;
const COAB_DIRECTION_165FC = [
  [0, 0, 2, 6],
  [2, 2, 0, 4],
  [4, 4, 2, 6],
  [6, 6, 4, 0],
] as const;
const COAB_HALF_DIR_TO_ISO = [7, 2, 3, 6] as const;
const COAB_BASE_X = [5, 4, 5, 6, 3, 8, 7, 2] as const;
const COAB_BASE_Y = [3, 2, 2, 3, 0, 2, 5, 3] as const;
const COAB_PLACEMENT_MASK_RANGES = [
  [[1, 0], [1, 0], [1, 0], [2, 9], [3, 10], [4, 10]],
  [[0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [4, 7]],
  [[0, 6], [0, 7], [1, 8], [1, 0], [1, 0], [1, 0]],
  [[3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 10]],
  [[0, 6], [0, 7], [1, 8], [2, 9], [3, 10], [4, 10]],
] as const;
const COAB_MAP_DX = [0, 1, 1, 1, 0, -1, -1, -1, 0] as const;
const COAB_MAP_DY = [-1, -1, 0, 1, 1, 1, 0, -1, 0] as const;

export function coabSourceFootprintCells(pos: GridPos, sourceSize = 1): GridPos[] {
  switch (Math.trunc(sourceSize)) {
    case 0: return [];
    case 2: return [pos, { col: pos.col, row: pos.row + 1 }];
    case 3: return [pos, { col: pos.col + 1, row: pos.row }];
    case 4: return [pos, { col: pos.col + 1, row: pos.row }, { col: pos.col, row: pos.row + 1 }, { col: pos.col + 1, row: pos.row + 1 }];
    case 1:
    default: return [pos];
  }
}

function normaliseMapDirection(dir: number): number {
  return ((Math.floor(dir) % 8) + 8) % 8;
}

function placementMaskAllows(direction: number, row: number, col: number): boolean {
  const range = COAB_PLACEMENT_MASK_RANGES[direction]?.[row];
  if (!range) return false;
  return col >= range[0] && col <= range[1];
}

function rowColumnBothOutOfRange(row: number, col: number): boolean {
  return (col < 0 || col > 10) && (row < 0 || row > 5);
}

function coabPlacementPos(local: GridPos, teamStart: GridPos): GridPos {
  return {
    col: local.col + (teamStart.col * 6) + (teamStart.row * 5) + 22,
    row: local.row + (teamStart.row * 5) + 10,
  };
}

function canUseAlternateDirection(
  opts: CoabSourceDeployOptions,
  dir: number,
  teamStart: GridPos,
): boolean {
  if (opts.wilderness) return true;
  const mapPos = opts.mapPos ?? { col: 0, row: 0 };
  const mapX = teamStart.col + mapPos.col;
  const mapY = teamStart.row + mapPos.row;
  return (opts.edgeFlag?.(dir, mapX, mapY) ?? 0) !== 1;
}

function placeCoabSourceTeam(
  count: number,
  halfCount: number,
  team: 0 | 1,
  teamDirection: number,
  initialTeamStart: GridPos,
  facing: Facing,
  occupied: Set<string>,
  sourceSizes: readonly number[],
  opts: CoabSourceDeployOptions,
): CoabSourcePlacement[] {
  const placed: CoabSourcePlacement[] = [];
  const masks = Array.from({ length: 4 }, (_, attempt) => {
    const direction = attempt === 1 ? 4 : teamDirection;
    return Array.from({ length: 6 }, (_row, row) =>
      Array.from({ length: 11 }, (_col, col) => placementMaskAllows(direction, row, col)));
  });
  const key = (p: GridPos): string => `${p.col},${p.row}`;

  for (let member = 0; member < count; member++) {
    const sourceSize = Math.trunc(sourceSizes[member] ?? 1);
    let cur: GridPos = { col: 0, row: 0 };
    let base: GridPos = { col: 0, row: 0 };
    let var13 = 0;
    let firstRow = true;
    let rowScale = 0;
    let colScale = 0;
    let attempt = 0;
    let state: 0 | 1 | 2 | 3 = 1;
    let gaveUp = false;
    let teamStart = { ...initialTeamStart };
    let memberPlaced: CoabSourcePlacement | null = null;

    for (let guard = 0; guard < 1024 && !memberPlaced && !gaveUp; guard++) {
      const halfDir = Math.floor(COAB_DIRECTION_165FC[teamDirection]![attempt]! / 2);
      if (state === 1) {
        const isoDir = COAB_HALF_DIR_TO_ISO[(halfDir + 2) % 4]!;
        base = {
          col: COAB_BASE_X[(attempt > 0 ? 4 : 0) + halfDir]! + (rowScale * COAB_MAP_DX[isoDir]!),
          row: COAB_BASE_Y[(attempt > 0 ? 4 : 0) + halfDir]! + (rowScale * COAB_MAP_DY[isoDir]!),
        };
        cur = { ...base };
        colScale = 1;
        state = 2;
        var13 = 1;
      } else if (state === 2) {
        const isoDir = COAB_HALF_DIR_TO_ISO[(halfDir + 1) % 4]!;
        cur = {
          col: base.col + (COAB_MAP_DX[isoDir]! * colScale),
          row: base.row + (COAB_MAP_DY[isoDir]! * colScale),
        };
        state = 3;
        var13 += 1;
      } else {
        const isoDir = COAB_HALF_DIR_TO_ISO[(halfDir + 3) % 4]!;
        cur = {
          col: base.col + (COAB_MAP_DX[isoDir]! * colScale),
          row: base.row + (COAB_MAP_DY[isoDir]! * colScale),
        };
        state = 2;
        colScale += 1;
        var13 += 1;
      }

      const anyInvalid = cur.col < 0 || cur.row < 0 || cur.col > 10 || cur.row > 5;
      if (
        state > 1 &&
        ((anyInvalid && !rowColumnBothOutOfRange(cur.row, cur.col)) ||
          (firstRow && var13 >= halfCount) ||
          (!firstRow && var13 > 11))
      ) {
        rowScale += 1;
        if (team === 0 && (teamDirection & 1) === 1 && attempt === 0 && rowScale === 1) {
          let foundOpenAlternate = false;
          for (let alt = 1; alt <= 3; alt++) {
            const tmpDir = COAB_DIRECTION_165EC[teamDirection]![alt]!;
            if (canUseAlternateDirection(opts, tmpDir, initialTeamStart)) foundOpenAlternate = true;
          }
          if (foundOpenAlternate) rowScale += 1;
        }
        state = 1;
        firstRow = false;
      }

      if (anyInvalid && rowColumnBothOutOfRange(cur.row, cur.col)) {
        state = 0;
        while (attempt < 3 && state !== 1) {
          attempt += 1;
          const tmpDir = COAB_DIRECTION_165EC[teamDirection]![attempt]!;
          if (canUseAlternateDirection(opts, tmpDir, initialTeamStart)) {
            teamStart = {
              col: initialTeamStart.col + COAB_MAP_DX[tmpDir]!,
              row: initialTeamStart.row + COAB_MAP_DY[tmpDir]!,
            };
            rowScale = 0;
            state = 1;
          }
        }
        if (state !== 1) gaveUp = true;
      }

      if (!anyInvalid && masks[attempt]![cur.row]![cur.col]) {
        const pos = coabPlacementPos(cur, teamStart);
        const footprint = coabSourceFootprintCells(pos, sourceSize);
        const blocked = footprint.length === 0 ||
          footprint.some((cell) => occupied.has(key(cell)) || (opts.blocked?.(cell.col, cell.row) ?? false));
        if (!blocked) {
          masks[attempt]![cur.row]![cur.col] = false;
          for (const cell of footprint) occupied.add(key(cell));
          memberPlaced = {
            local: { ...cur },
            teamStart: { ...teamStart },
            directionAttempt: attempt,
            pos,
            sourceSize,
            facing,
          };
        }
      }
    }

    if (memberPlaced) placed.push(memberPlaced);
  }

  return placed;
}

/**
 * Place one team of `count` members starting from `anchor`, expanding via the tri-state lateral fill
 * along `lateral` and deepening ranks along `depth`. The first rank holds `half` members; subsequent
 * ranks hold up to 12 (capped by the grid). Cells already in `used` (or out of region) are skipped, a
 * full/blocked rank advances the depth (`row_scale++`). Returns the placed cells; mutates `used`.
 */
function placeTeam(
  count: number,
  half: number,
  anchor: GridPos,
  lateral: GridPos,
  depth: GridPos,
  region: { width: number; height: number },
  used: Set<string>,
): GridPos[] {
  const placed: GridPos[] = [];
  const key = (p: GridPos): string => `${p.col},${p.row}`;
  let rank = 0;
  let slot = 0;
  const maxRanks = region.width + region.height; // generous depth bound (grid guarantees termination)
  let placedCount = 0;
  while (placedCount < count) {
    const cap = rank === 0 ? Math.max(1, half) : 12;
    if (slot >= cap) { rank++; slot = 0; if (rank > maxRanks) break; continue; }
    const off = lateralOffset(slot);
    slot++;
    const pos: GridPos = {
      col: anchor.col + depth.col * rank + lateral.col * off,
      row: anchor.row + depth.row * rank + lateral.row * off,
    };
    if (!inRegion(pos, region)) continue; // out of grid → next slot, eventually next rank
    const k = key(pos);
    if (used.has(k)) continue;            // a cell another member already took
    used.add(k);
    placed.push(pos);
    placedCount++;
  }
  return placed;
}

/**
 * Build the starting formation for both teams (spec §`PlaceCombatants`). Returns each team's placements
 * (cells + normalized grid facings) and the spec's 4-way overland facings. The party anchors `(0,0)` and
 * fills toward +col/+row; the enemy anchors `encounterDistance` cells along +col and fills toward
 * +col/+row, turned to face the party. A team that cannot fit a member (cramped region / overlap) retries
 * an alternate lateral direction before dropping it (the boxed-in fallback), so the returned arrays may be
 * shorter than the requested counts only when the 11×6 grid genuinely cannot hold the formation.
 */
export function deployCombatants(
  partyCount: number,
  enemyCount: number,
  mapDirection: number,
  encounterDistance: number,
  opts: DeployOptions = {},
): DeploymentResult {
  const region = opts.region ?? { width: DEPLOY_REGION.width, height: DEPLOY_REGION.height };
  const dir = ((Math.floor(mapDirection) % 8) + 8) % 8;
  const partyFacing4 = Math.floor(dir / 2);
  const enemyFacing4 = Math.floor(((dir + 4) % 8) / 2);

  const used = new Set<string>();

  // Party: corner (0,0), front rank along +row, ranks deepen +col. Faces east (DIR8 0) in the
  // normalized grid (party-looks-+col, matching coabCombatMap.ts).
  const partyAnchor: GridPos = { col: 0, row: 0 };
  const partyCells = placeTeamWithFallback(
    partyCount, frontRankWidth(partyCount), partyAnchor,
    { col: 0, row: 1 }, { col: 1, row: 0 }, region, used,
  );

  // Enemy: anchored encounterDistance cells along +col (along the party's facing), clamped into the grid;
  // front rank along +row, ranks deepen +col. Faces west (DIR8 4), back at the party.
  const enemyCol = Math.min(Math.max(1, Math.floor(encounterDistance)), region.width - 1);
  const enemyAnchor: GridPos = { col: enemyCol, row: 0 };
  const enemyCells = placeTeamWithFallback(
    enemyCount, frontRankWidth(enemyCount), enemyAnchor,
    { col: 0, row: 1 }, { col: 1, row: 0 }, region, used,
  );

  return {
    party: partyCells.map((pos) => ({ pos, facing: 0 as Facing })),
    enemies: enemyCells.map((pos) => ({ pos, facing: 4 as Facing })),
    partyFacing4,
    enemyFacing4,
  };
}

/**
 * Source-shaped CoAB `PlaceCombatants` / `place_combatant` placement over the recovered tables.
 *
 * Unlike {@link deployCombatants}, this returns CoAB's final `CombatMap[player].pos` coordinates inside
 * the `mapToBackGroundTile` frame using `x = cur_x + team_x*6 + team_y*5 + 22`,
 * `y = cur_y + team_y*5 + 10`. It is meant as the source oracle for recovered 50×25 combat maps; the
 * existing web-normalized deployment remains separate until the renderer/scrolling path can consume
 * these coordinates directly.
 */
export function deployCoabSourceCombatants(
  partyCount: number,
  enemyCount: number,
  mapDirection: number,
  encounterDistance: number,
  opts: CoabSourceDeployOptions = {},
): CoabSourceDeploymentResult {
  const dir = normaliseMapDirection(mapDirection);
  const partyFacing4 = Math.floor(dir / 2);
  const enemyFacing4 = Math.floor(((dir + 4) % 8) / 2);
  const partyStart = {
    col: Math.trunc(opts.partyStart?.col ?? 0),
    row: Math.trunc(opts.partyStart?.row ?? 0),
  };
  const enemyStart = {
    col: partyStart.col + (Math.floor(encounterDistance) * COAB_MAP_DX[dir]!),
    row: partyStart.row + (Math.floor(encounterDistance) * COAB_MAP_DY[dir]!),
  };
  const occupied = new Set<string>();

  return {
    party: placeCoabSourceTeam(
      Math.max(0, Math.trunc(partyCount)),
      frontRankWidth(partyCount),
      0,
      partyFacing4,
      partyStart,
      0 as Facing,
      occupied,
      opts.partySizes ?? [],
      opts,
    ),
    enemies: placeCoabSourceTeam(
      Math.max(0, Math.trunc(enemyCount)),
      frontRankWidth(enemyCount),
      1,
      enemyFacing4,
      enemyStart,
      4 as Facing,
      occupied,
      opts.enemySizes ?? [],
      opts,
    ),
    partyFacing4,
    enemyFacing4,
  };
}

/**
 * {@link placeTeam} with the spec's **boxed-in alternate-direction fallback**: if the nominal frame
 * cannot seat every member, retry the leftovers against mirrored lateral/depth frames before giving up.
 */
function placeTeamWithFallback(
  count: number,
  half: number,
  anchor: GridPos,
  lateral: GridPos,
  depth: GridPos,
  region: { width: number; height: number },
  used: Set<string>,
): GridPos[] {
  const placed = placeTeam(count, half, anchor, lateral, depth, region, used);
  if (placed.length >= count) return placed;
  // Alternate frames (mirror lateral, then mirror depth) — up to 3 retries (spec: `direction_165EC`).
  const alts: Array<[GridPos, GridPos]> = [
    [{ col: -lateral.col, row: -lateral.row }, depth],
    [lateral, { col: -depth.col, row: -depth.row }],
    [{ col: -lateral.col, row: -lateral.row }, { col: -depth.col, row: -depth.row }],
  ];
  for (const [lat, dep] of alts) {
    if (placed.length >= count) break;
    const more = placeTeam(count - placed.length, half, anchor, lat, dep, region, used);
    placed.push(...more);
  }
  return placed;
}

/**
 * Convenience wrapper that **applies** a deployment onto live combatants — sets each figure's `pos` and
 * `facing` in roster order (party array, then enemy array) using {@link deployCombatants}. Any figure
 * past the placeable count keeps its existing `pos` (the 11×6 grid could not seat it). Returns the raw
 * {@link DeploymentResult} for inspection.
 */
export function applyDeployment(
  party: TacticalCombatant[],
  enemies: TacticalCombatant[],
  mapDirection: number,
  encounterDistance: number,
  opts: DeployOptions = {},
): DeploymentResult {
  const d = deployCombatants(party.length, enemies.length, mapDirection, encounterDistance, opts);
  party.forEach((c, i) => { const p = d.party[i]; if (p) { c.pos = { ...p.pos }; c.facing = p.facing; } });
  enemies.forEach((c, i) => { const p = d.enemies[i]; if (p) { c.pos = { ...p.pos }; c.facing = p.facing; } });
  return d;
}
