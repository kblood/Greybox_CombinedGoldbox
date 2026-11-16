/**
 * Exploration / movement core (M1.S5 logic; map-format-agnostic).
 *
 * Drives first-person dungeon movement over an engine-neutral `GameMap`: turn,
 * step forward/back with wall + bounds collision, and surface the event hook of the
 * cell the party enters (so the ECL VM can fire it in M2). Pure and deterministic —
 * no rendering, no I/O — so it is fully unit-testable now and plugs straight onto the
 * real `GameMap` once the GEO decoder (M1.S4) lands.
 *
 * Wall model: a move in direction D from the current cell is blocked when that
 * cell's `walls[D]` is non-zero (a solid wall on that edge) OR the destination leaves
 * the grid. An edge that carries a **door flag** (`cell.doors[D]` ≠ 0 — a door or
 * gateway) is passable even though it has a wall graphic: the party steps through it.
 * Gold Box maps usually record an edge on both adjacent cells; this engine only
 * consults the cell being left, which is correct for that convention and also tolerates
 * one-sided edges (you can't walk *through* a solid wall from either side as long as
 * it's recorded on the leaving edge).
 */
import { DIRECTIONS, type Direction, type EdgeExit, type GameMap, type MapCell, type MapEntry } from '../model/index.js';

/** Party location + facing on a map. */
export interface Pose {
  x: number;
  y: number;
  facing: Direction;
}

/** Why a step did not happen. */
export type BlockReason = 'wall' | 'edge';

/** Result of attempting a step. */
export interface StepResult {
  moved: boolean;
  /** Set when `moved` is false. */
  blocked?: BlockReason;
  /** The pose after the attempt (unchanged if blocked). */
  pose: Pose;
  /** Non-zero event id of the cell the party now stands on (0 if none). */
  event: number;
  /**
   * In-game minutes this step cost: 0 if blocked, 1 for a normal step, 10 for a
   * careful/search step (ovr015 `step_game_time(search_flags&1 ? 2 : 1, 1)`). The caller
   * advances `gameClock` by this (see `stepGameTime`).
   */
  timeMinutes: number;
  /**
   * Set only when `blocked === 'edge'` AND the cell being left declares an {@link EdgeExit} on the
   * edge the step attempted (`MapCell.edgeExits[dir]` — see `markMapEdgeExits`). Lets a host detect
   * a map-boundary bump that is meant to dispatch something (e.g. a "DO YOU WISH TO LEAVE?" ECL
   * prompt) instead of a silent dead end, without `Explorer` itself knowing anything about ECL.
   */
  edgeExit?: EdgeExit;
}

/** Minutes a normal step costs (ovr015 / ovr021 slot-1 = minute). */
export const STEP_MINUTES_NORMAL = 1;
/** Minutes a careful/search step costs (ovr015 / ovr021 slot-2 = 10-minute unit). */
export const STEP_MINUTES_CAREFUL = 10;

/** Per-cell door-interaction permissions, reset on every successful step (ovr015). */
export interface DoorAttempts {
  bash: boolean;
  pick: boolean;
  knock: boolean;
}

/** Unit step deltas per facing (north = -y, screen/grid convention). */
const DELTA: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
};

/**
 * Movement class of the edge leaving a cell via `dir`. The single shared definition used by
 * `Explorer` (2D) and `stepTarget` (3D view), so the two cannot drift. `open` = no wall; a
 * walled edge is `blocked` (door flag 0), `door` (1), `gateway` (2) or `locked` (3, per the
 * ovr015 `WallDoorFlagsGet == 3` reading). `Explorer` treats every class except `blocked` as
 * passable (unchanged historical behaviour); `stepTarget` additionally blocks `locked` unless asked.
 */
export type EdgeClass = 'open' | 'blocked' | 'door' | 'gateway' | 'locked';
export function edgeClass(
  walls: Record<Direction, number>,
  doors: Record<Direction, number> | undefined,
  dir: Direction,
): EdgeClass {
  if (walls[dir] === 0) return 'open';
  switch (doors?.[dir] ?? 0) {
    case 0:
      return 'blocked';
    case 1:
      return 'door';
    case 2:
      return 'gateway';
    default:
      return 'locked';
  }
}

function rotate(facing: Direction, steps: number): Direction {
  const i = DIRECTIONS.indexOf(facing);
  return DIRECTIONS[(((i + steps) % 4) + 4) % 4];
}

export class Explorer {
  private readonly map: GameMap;
  private pose: Pose;
  /** Careful/search movement mode — each step costs 10 minutes instead of 1 (ovr015). */
  private careful = false;
  /** Door bash/pick/knock permissions for the current tile; reset on each move. */
  private doorAttempts: DoorAttempts = { bash: true, pick: true, knock: true };

  constructor(map: GameMap, start: Pose | MapEntry) {
    this.map = map;
    this.pose = { x: start.x, y: start.y, facing: start.facing };
    if (!this.inBounds(start.x, start.y)) {
      throw new Error(`Explorer: start (${start.x},${start.y}) is outside ${map.width}×${map.height} map`);
    }
  }

  /** Build an Explorer at a named entry (defaults to the first entry / 0,0 N). */
  static atEntry(map: GameMap, entryId?: number): Explorer {
    const entry =
      entryId !== undefined
        ? map.entries.find((e) => e.id === entryId)
        : map.entries[0];
    const start: Pose = entry
      ? { x: entry.x, y: entry.y, facing: entry.facing }
      : { x: 0, y: 0, facing: 'north' };
    return new Explorer(map, start);
  }

  getPose(): Pose {
    return { ...this.pose };
  }

  /** Teleport the party to a pose (e.g. restoring a save); throws if the target is out of bounds. */
  setPose(pose: Pose): void {
    if (!this.inBounds(pose.x, pose.y)) {
      throw new Error(`setPose: (${pose.x},${pose.y}) is outside ${this.map.width}×${this.map.height} map`);
    }
    this.pose = { x: pose.x, y: pose.y, facing: pose.facing };
  }

  private inBounds(x: number, y: number): boolean {
    return Number.isSafeInteger(x) && Number.isSafeInteger(y) &&
      x >= 0 && y >= 0 && x < this.map.width && y < this.map.height;
  }

  /** The cell at (x,y); throws if out of bounds. */
  cellAt(x: number, y: number): MapCell {
    if (!this.inBounds(x, y)) throw new Error(`cellAt: (${x},${y}) out of bounds`);
    return this.map.cells[y * this.map.width + x];
  }

  /** The cell the party currently stands on. */
  currentCell(): MapCell {
    return this.cellAt(this.pose.x, this.pose.y);
  }

  /** Event id of the current cell (0 if none). */
  currentEvent(): number {
    return this.currentCell().event ?? 0;
  }

  turnLeft(): Direction {
    this.pose.facing = rotate(this.pose.facing, -1);
    return this.pose.facing;
  }
  turnRight(): Direction {
    this.pose.facing = rotate(this.pose.facing, 1);
    return this.pose.facing;
  }
  turnAround(): Direction {
    this.pose.facing = rotate(this.pose.facing, 2);
    return this.pose.facing;
  }

  /** A walled edge blocks unless it carries a door/gateway flag (then it's a passage). */
  private edgeBlocks(cell: MapCell, dir: Direction): boolean {
    return edgeClass(cell.walls, cell.doors, dir) === 'blocked';
  }

  /** Can the party move one step in `dir` from the current cell? */
  canMove(dir: Direction): boolean {
    const cell = this.currentCell();
    if (this.edgeBlocks(cell, dir)) return false;
    const { dx, dy } = DELTA[dir];
    return this.inBounds(this.pose.x + dx, this.pose.y + dy);
  }

  private step(dir: Direction): StepResult {
    const cell = this.currentCell();
    if (this.edgeBlocks(cell, dir)) {
      return { moved: false, blocked: 'wall', pose: this.getPose(), event: this.currentEvent(), timeMinutes: 0 };
    }
    const { dx, dy } = DELTA[dir];
    const nx = this.pose.x + dx;
    const ny = this.pose.y + dy;
    if (!this.inBounds(nx, ny)) {
      const edgeExit = cell.edgeExits?.[dir];
      return {
        moved: false,
        blocked: 'edge',
        pose: this.getPose(),
        event: this.currentEvent(),
        timeMinutes: 0,
        ...(edgeExit ? { edgeExit } : {}),
      };
    }
    this.pose.x = nx;
    this.pose.y = ny;
    // Each new tile re-grants one bash/pick/knock attempt and costs game time.
    this.doorAttempts = { bash: true, pick: true, knock: true };
    const timeMinutes = this.careful ? STEP_MINUTES_CAREFUL : STEP_MINUTES_NORMAL;
    return { moved: true, pose: this.getPose(), event: this.currentEvent(), timeMinutes };
  }

  /** Enable/disable careful (search) movement — careful steps cost 10 game-minutes. */
  setCareful(on: boolean): void {
    this.careful = on;
  }
  /** Whether careful/search movement is active. */
  isCareful(): boolean {
    return this.careful;
  }

  /** Current tile's remaining door bash/pick/knock permissions (a copy). */
  getDoorAttempts(): DoorAttempts {
    return { ...this.doorAttempts };
  }
  /** Consume one door-interaction attempt of `kind` on the current tile; false if spent. */
  useDoorAttempt(kind: keyof DoorAttempts): boolean {
    if (!this.doorAttempts[kind]) return false;
    this.doorAttempts[kind] = false;
    return true;
  }

  /**
   * Mark the door on `dir` of a cell as unlocked/open and persist it in the GEO cell so it
   * stays open across re-entry (ovr015 `MapSetDoorUnlocked`). Defaults to the current cell.
   */
  openDoor(dir: Direction, at?: { x: number; y: number }): void {
    const cell = at ? this.cellAt(at.x, at.y) : this.currentCell();
    (cell.doorsOpen ??= {})[dir] = true;
  }
  /** Re-lock/close the door on `dir` (clears the persisted open bit). */
  closeDoor(dir: Direction, at?: { x: number; y: number }): void {
    const cell = at ? this.cellAt(at.x, at.y) : this.currentCell();
    if (cell.doorsOpen) delete cell.doorsOpen[dir];
  }
  /** Whether the door on `dir` of a cell has been opened (persisted). Defaults to current. */
  isDoorOpen(dir: Direction, at?: { x: number; y: number }): boolean {
    const cell = at ? this.cellAt(at.x, at.y) : this.currentCell();
    return cell.doorsOpen?.[dir] === true;
  }

  /** Step in the facing direction. */
  forward(): StepResult {
    return this.step(this.pose.facing);
  }
  /** Step backward (opposite of facing) without turning. */
  backward(): StepResult {
    return this.step(OPPOSITE[this.pose.facing]);
  }
  /** Strafe relative to facing (does not change facing). */
  stepLeft(): StepResult {
    return this.step(rotate(this.pose.facing, -1));
  }
  stepRight(): StepResult {
    return this.step(rotate(this.pose.facing, 1));
  }
}

/**
 * Mark every boundary edge of `map` — any cell+direction where a step would leave the grid — with
 * `exit`. This is the usual way a host opts a whole map's perimeter into the same declared
 * "exit map" trigger in one call, matching the real Gold Box behavior this models: `vm_run_1`'s
 * `tried_to_exit_map` condition fires on ANY edge-of-map walk attempt, not just a specific named
 * gate cell. A host that only wants a single boundary cell to carry the trigger can instead set
 * `cell.edgeExits` directly (this helper is a convenience, not the only way to populate it).
 *
 * Idempotent (safe to call again with a different `exit`, e.g. after a re-mount) and harmless to
 * call on a boundary cell whose outward edge is also walled: `Explorer.step()` only ever surfaces
 * `StepResult.edgeExit` from the bounds-check branch (`blocked === 'edge'`), so a walled edge still
 * reports plain `blocked: 'wall'` and the `edgeExits` entry sits unused.
 */
export function markMapEdgeExits(map: GameMap, exit: EdgeExit): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[y * map.width + x];
      if (!cell) continue;
      for (const dir of DIRECTIONS) {
        const { dx, dy } = DELTA[dir];
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height) continue; // interior edge
        (cell.edgeExits ??= {})[dir] = exit;
      }
    }
  }
}
