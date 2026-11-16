/**
 * Wilderness / overland travel (A5.1) — the Gold Box area-map layer.
 *
 * Between the dungeons and towns, a Gold Box game drops the party onto a top-down regional map:
 * the party steps from tile to tile across terrain (plains, forest, mountains, roads…), each step
 * passing in-game time and rolling a wandering-monster check that can drop into combat, and stepping
 * onto a named site (a town, keep, or dungeon mouth) announces an arrival. This module models that
 * pure-and-deterministically — no rendering, no I/O — so it is fully unit-testable and feeds both the
 * `composeWildernessScreen` compositor and the web travel controller.
 *
 * Terrain decides three things: whether the party can enter it at all (water is impassable without a
 * boat), how many in-game minutes a tile costs to cross (open road is fast, mountains slow), and the
 * per-step encounter chance. Encounter rolls go through the engine {@link Rng} (the same LCG the ECL
 * VM's RANDOM opcode uses), so a given seed replays an identical journey.
 */
import { Rng } from '../util/rng.js';

/** The overland terrain kinds the area map is painted from. */
export type Terrain = 'road' | 'town' | 'plains' | 'forest' | 'hills' | 'mountains' | 'water';

export interface TerrainInfo {
  /** Can the party enter this terrain on foot? (Water needs a boat — impassable here.) */
  passable: boolean;
  /** In-game minutes to cross one tile of this terrain. */
  minutes: number;
  /** Wandering-monster chance when entering this terrain, in percent (0–100). */
  encounterPct: number;
  /** Display label for the info panel. */
  label: string;
}

/**
 * Per-terrain travel cost + danger. Roads are quick and safe, wilderness slower and riskier,
 * mountains slowest and most dangerous; towns are safe havens (no wandering monsters). These are
 * CANDIDATE tuning values (plausible Gold Box feel, not yet pinned to an oracle) — isolated in this
 * one table so a later pass can replace them without touching the travel logic.
 */
export const TERRAIN: Record<Terrain, TerrainInfo> = {
  road: { passable: true, minutes: 30, encounterPct: 3, label: 'Road' },
  town: { passable: true, minutes: 20, encounterPct: 0, label: 'Town' },
  plains: { passable: true, minutes: 60, encounterPct: 10, label: 'Plains' },
  forest: { passable: true, minutes: 90, encounterPct: 18, label: 'Forest' },
  hills: { passable: true, minutes: 90, encounterPct: 15, label: 'Hills' },
  mountains: { passable: true, minutes: 150, encounterPct: 22, label: 'Mountains' },
  water: { passable: false, minutes: 0, encounterPct: 0, label: 'Water' },
};

/** One overland tile: its terrain and an optional named site (town/keep/dungeon mouth). */
export interface WildTile {
  terrain: Terrain;
  /** A named location on this tile; entering it announces arrival. */
  location?: string;
}

/** An engine-neutral overland area map: a row-major grid of terrain tiles + a start position. */
export interface WildernessMap {
  name: string;
  width: number;
  height: number;
  /** width × height tiles, row-major (index = y*width + x). */
  tiles: WildTile[];
  /** Where the party first enters the area. */
  start: { x: number; y: number };
}

export type WildDir = 'north' | 'east' | 'south' | 'west';

const DELTA: Record<WildDir, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

/** Outcome of a single overland step. */
export interface WildStep {
  /** True if the party actually changed tiles. */
  moved: boolean;
  /** Why the step failed (only set when `moved` is false): off the map edge or into impassable terrain. */
  blocked?: 'edge' | 'impassable';
  /** Party position after the step (unchanged if blocked). */
  pos: { x: number; y: number };
  /** Terrain of the tile the party is on after the step (the destination if it moved). */
  terrain: Terrain;
  /** In-game minutes that elapsed (0 when blocked). */
  minutes: number;
  /** Name of the site the party just stepped onto, if any. */
  arrived?: string;
  /** A wandering-monster encounter triggered on this step. */
  encounter: boolean;
}

/**
 * The wandering-monster check: true when the terrain's chance fires on this `rng` draw. A `d100`
 * (1–100) is rolled and compared `<=` the percent, so 0% never triggers and 100% always does — which
 * makes the rule trivially testable with a controlled Rng. Pure: the caller owns the Rng stream.
 */
export function checkEncounter(encounterPct: number, rng: Rng): boolean {
  if (encounterPct <= 0) return false;
  return rng.die(100) <= encounterPct;
}

/**
 * Stateful overland traveller: holds the area map, the party's position, and the encounter Rng
 * stream. `step(dir)` attempts a one-tile move — blocked by the map edge or impassable terrain (no
 * time passes, no encounter) — and otherwise advances the party, accrues the destination terrain's
 * travel minutes, reports any site arrival, and rolls the wandering-monster check. Seeding the
 * constructor makes a whole journey replayable.
 */
export class WildernessTravel {
  readonly map: WildernessMap;
  private readonly rng: Rng;
  pos: { x: number; y: number };

  constructor(map: WildernessMap, seedOrRng: number | Rng = 0x5eed) {
    this.map = map;
    this.pos = { ...map.start };
    this.rng = typeof seedOrRng === 'number' ? new Rng(seedOrRng) : seedOrRng;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.map.width && y < this.map.height;
  }

  tileAt(x: number, y: number): WildTile | null {
    if (!this.inBounds(x, y)) return null;
    return this.map.tiles[y * this.map.width + x];
  }

  /** The tile the party currently stands on. */
  currentTile(): WildTile {
    return this.tileAt(this.pos.x, this.pos.y)!;
  }

  step(dir: WildDir): WildStep {
    const { dx, dy } = DELTA[dir];
    const nx = this.pos.x + dx;
    const ny = this.pos.y + dy;
    const here = this.currentTile();
    if (!this.inBounds(nx, ny)) {
      return { moved: false, blocked: 'edge', pos: { ...this.pos }, terrain: here.terrain, minutes: 0, encounter: false };
    }
    const dest = this.tileAt(nx, ny)!;
    const info = TERRAIN[dest.terrain];
    if (!info.passable) {
      return { moved: false, blocked: 'impassable', pos: { ...this.pos }, terrain: dest.terrain, minutes: 0, encounter: false };
    }
    this.pos = { x: nx, y: ny };
    const encounter = checkEncounter(info.encounterPct, this.rng);
    return {
      moved: true,
      pos: { ...this.pos },
      terrain: dest.terrain,
      minutes: info.minutes,
      arrived: dest.location,
      encounter,
    };
  }
}

/**
 * Author an overland map from an ASCII art grid — one character per tile — so demo maps (and tests)
 * stay legible. Legend: `=` road · `T` town · `.` plains · `f` forest · `h` hills · `^` mountains ·
 * `~` water. Unknown characters fall back to plains. Named sites are supplied separately by (x,y);
 * a site's tile keeps its drawn terrain but gains the `location` name (towns are usually `T` tiles).
 * Every row must be the same length; the first row sets the width.
 */
export function wildernessFromAscii(
  name: string,
  rows: readonly string[],
  opts: { start?: { x: number; y: number }; locations?: readonly { x: number; y: number; name: string }[] } = {},
): WildernessMap {
  const height = rows.length;
  const width = height > 0 ? rows[0]!.length : 0;
  const legend: Record<string, Terrain> = {
    '=': 'road', T: 'town', '.': 'plains', f: 'forest', h: 'hills', '^': 'mountains', '~': 'water',
  };
  const tiles: WildTile[] = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y]!;
    if (row.length !== width) throw new Error(`wildernessFromAscii: row ${y} is ${row.length} wide, expected ${width}`);
    for (let x = 0; x < width; x++) {
      tiles.push({ terrain: legend[row[x]!] ?? 'plains' });
    }
  }
  for (const loc of opts.locations ?? []) {
    if (loc.x >= 0 && loc.y >= 0 && loc.x < width && loc.y < height) {
      tiles[loc.y * width + loc.x]!.location = loc.name;
    }
  }
  return { name, width, height, tiles, start: opts.start ?? { x: 0, y: 0 } };
}
