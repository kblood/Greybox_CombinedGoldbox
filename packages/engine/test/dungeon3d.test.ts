/**
 * 3D dungeon mesh (packages/engine/src/world/dungeon3d.ts) - unit tests + all-maps invariants.
 *
 * Oracles live HERE, written in a different form from the builder: raw-plane nibble reads and
 * neighbour comparison, never the builder's own expression. Retail-data tests skip per title with
 * a printed `SKIP title (no data)`; the hand-built fixtures always run.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDungeonMesh,
  meshWallSet,
  stepTarget,
  isBackFacing,
  paintOrder,
  frontFaceRequests,
  CELL_SIZE,
  WALL_HEIGHT,
  Explorer,
  decodeGeoBlock,
  decodeGen2GeoBlock,
  decodeHlib,
  readDaxDataBlocks,
  planWallView,
  wallType,
  eclBlockIdForGeoArea,
  looksOverland,
  pickDefaultStart,
  type DungeonMesh,
  type GameMap,
  type MapCell,
  type Direction,
} from '../src/index.js';

const DIRS: Direction[] = ['north', 'east', 'south', 'west'];

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

type CellSpec = Partial<Record<Direction, number>>;
interface DoorSpec { doors?: Partial<Record<Direction, number>>; open?: Partial<Record<Direction, boolean>>; floor?: number }

function mkMap(w: number, h: number, name: string, f: (x: number, y: number) => CellSpec & DoorSpec | undefined): GameMap {
  const cells: MapCell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = f(x, y) ?? {};
      const cell: MapCell = {
        walls: { north: s.north ?? 0, east: s.east ?? 0, south: s.south ?? 0, west: s.west ?? 0 },
        doors: { north: 0, east: 0, south: 0, west: 0, ...(s.doors ?? {}) },
        floor: s.floor ?? 0x80,
      };
      if (s.open) cell.doorsOpen = { ...s.open };
      cells.push(cell);
    }
  }
  return { name, width: w, height: h, cells, entries: [], sharedEdges: false };
}
const cellAt = (m: GameMap, x: number, y: number) => m.cells[y * m.width + x];

/** A closed room: perimeter walls only (slot 1), symmetric on every shared edge. */
function room(w: number, h: number, name = 'room'): GameMap {
  return mkMap(w, h, name, (x, y) => ({
    north: y === 0 ? 1 : 0,
    south: y === h - 1 ? 1 : 0,
    west: x === 0 ? 1 : 0,
    east: x === w - 1 ? 1 : 0,
  }));
}

// ---------------------------------------------------------------------------
// Independent oracle: raw planes -> directed wall set (no decodeGeoBlock involved)
// ---------------------------------------------------------------------------

interface Planes { w: number; h: number; p0: Uint8Array; p1: Uint8Array; p3: Uint8Array }

function rawWallSet(pl: Planes): Set<string> {
  const s = new Set<string>();
  for (let y = 0; y < pl.h; y++) {
    for (let x = 0; x < pl.w; x++) {
      const i = y * pl.w + x;
      if (pl.p0[i] >> 4) s.add(`${x},${y},north`);
      if (pl.p0[i] & 15) s.add(`${x},${y},east`);
      if (pl.p1[i] >> 4) s.add(`${x},${y},south`);
      if (pl.p1[i] & 15) s.add(`${x},${y},west`);
    }
  }
  return s;
}
function gen1Planes(raw: Uint8Array): Planes {
  return { w: 16, h: 16, p0: raw.subarray(2, 258), p1: raw.subarray(258, 514), p3: raw.subarray(770, 1026) };
}
function gen2Planes(raw: Uint8Array): Planes {
  const h = raw[0];
  const w = raw[1];
  const n = w * h;
  return { w, h, p0: raw.subarray(8, 8 + n), p1: raw.subarray(8 + n, 8 + 2 * n), p3: raw.subarray(8 + 3 * n, 8 + 4 * n) };
}
function slotAt(pl: Planes, x: number, y: number, d: Direction): number {
  const i = y * pl.w + x;
  return d === 'north' ? pl.p0[i] >> 4 : d === 'east' ? pl.p0[i] & 15 : d === 'south' ? pl.p1[i] >> 4 : pl.p1[i] & 15;
}
function doorAt(pl: Planes, x: number, y: number, d: Direction): number {
  return (pl.p3[y * pl.w + x] >> (DIRS.indexOf(d) * 2)) & 3;
}

/** Independent census by direct neighbour comparison over the raw planes. */
function recount(pl: Planes) {
  const opp: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };
  const dx = { north: 0, east: 1, south: 0, west: -1 };
  const dy = { north: -1, east: 0, south: 1, west: 0 };
  let walls = 0, oneWay = 0, mismatch = 0, doors = 0, doorsOnOpen = 0, boundary = 0, openBoundary = 0;
  for (let y = 0; y < pl.h; y++) for (let x = 0; x < pl.w; x++) for (const d of DIRS) {
    const s = slotAt(pl, x, y, d);
    const door = doorAt(pl, x, y, d);
    const nx = x + dx[d], ny = y + dy[d];
    const inside = nx >= 0 && ny >= 0 && nx < pl.w && ny < pl.h;
    if (!inside) { boundary++; if (s === 0) openBoundary++; }
    if (s === 0) { if (door) doorsOnOpen++; continue; }
    walls++;
    if (door) doors++;
    if (inside) {
      const r = slotAt(pl, nx, ny, opp[d]);
      if (r === 0) oneWay++;
      else if (r !== s) mismatch++;
    }
  }
  return { walls, oneWay, slotMismatch: mismatch, doors, doorsOnOpen, boundary, openBoundary, cells: pl.w * pl.h };
}

// ---------------------------------------------------------------------------
// Fixtures (always on)
// ---------------------------------------------------------------------------

describe('dungeon3d fixtures: exact geometry', () => {
  it('3x3 room: counts, ordering, determinism', () => {
    const m = room(3, 3);
    const a = buildDungeonMesh(m, { topology: 'bounded' })!;
    const b = buildDungeonMesh(m, { topology: 'bounded' })!;
    expect(a).toEqual(b);
    expect(a.walls.length).toBe(12);
    expect(a.stats).toEqual({ walls: 12, oneWay: 0, slotMismatch: 0, doors: 0, doorsOnOpen: 0, boundary: 12, openBoundary: 0, cells: 9 });
    expect(a.floors.length).toBe(9);
    expect(a.ceilings.length).toBe(9);
    // sorted (y, x, N,E,S,W)
    const order = a.walls.map((q) => [q.y, q.x, DIRS.indexOf(q.side)]);
    const sorted = [...order].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    expect(order).toEqual(sorted);
    expect(CELL_SIZE).toBe(1);
    expect(WALL_HEIGHT).toBe(1);
  });

  it('corners, normals and winding for each side of cell (2,3)', () => {
    const m = room(5, 5);
    // give the interior cell all four walls
    cellAt(m, 2, 3).walls = { north: 3, east: 4, south: 5, west: 6 };
    const mesh = buildDungeonMesh(m, { topology: 'bounded' })!;
    const q = (side: Direction) => mesh.walls.find((w) => w.x === 2 && w.y === 3 && w.side === side)!;
    expect(q('north').corners).toEqual([[2, 0, 3], [3, 0, 3], [3, 1, 3], [2, 1, 3]]);
    expect(q('east').corners).toEqual([[3, 0, 3], [3, 0, 4], [3, 1, 4], [3, 1, 3]]);
    expect(q('south').corners).toEqual([[3, 0, 4], [2, 0, 4], [2, 1, 4], [3, 1, 4]]);
    expect(q('west').corners).toEqual([[2, 0, 4], [2, 0, 3], [2, 1, 3], [2, 1, 4]]);
    expect(q('north').slot).toBe(3);
    expect(q('west').slot).toBe(6);
    const toward = { north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0] } as const;
    for (const side of DIRS) {
      const c = q(side).corners;
      const e1 = c[1].map((v, i) => v - c[0][i]);
      const e2 = c[3].map((v, i) => v - c[0][i]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      // CCW seen from the interior => the normal points toward the cell interior, i.e. opposite the side
      const outward = toward[side];
      expect(n.map((v) => v + 0)).toEqual(outward.map((v) => -v + 0));
      expect(q(side).face).toBe({ north: 'south', east: 'west', south: 'north', west: 'east' }[side]);
    }
    // floor winding is +Y, ceiling -Y
    const f = mesh.floors[0].corners;
    const fa = f[1].map((v, i) => v - f[0][i]), fb = f[2].map((v, i) => v - f[0][i]);
    expect(fa[2] * fb[0] - fa[0] * fb[2]).toBeGreaterThan(0);
    const c = mesh.ceilings[0].corners;
    const ca = c[1].map((v, i) => v - c[0][i]), cb = c[2].map((v, i) => v - c[0][i]);
    expect(ca[2] * cb[0] - ca[0] * cb[2]).toBeLessThan(0);
  });

  it('non-square 5x3 indexes by width/height', () => {
    const m = room(5, 3);
    const mesh = buildDungeonMesh(m, { topology: 'bounded' })!;
    expect(mesh.width).toBe(5);
    expect(mesh.height).toBe(3);
    expect(mesh.walls.length).toBe(2 * (5 + 3));
    expect(mesh.floors.length).toBe(15);
    expect(meshWallSet(mesh).has('4,2,east')).toBe(true);
    expect(meshWallSet(mesh).has('4,2,south')).toBe(true);
    expect(meshWallSet(mesh).has('2,2,east')).toBe(false);
  });

  it('oneWay / slotMismatch / reverseSlot / boundary flags', () => {
    const m = room(3, 3);
    cellAt(m, 0, 0).walls.east = 4; // (0,0).east=4, (1,0).west=0 -> oneWay
    cellAt(m, 1, 1).walls.east = 7;
    cellAt(m, 2, 1).walls.west = 9; // both sides, differing slots
    const mesh = buildDungeonMesh(m, { topology: 'bounded' })!;
    const get = (x: number, y: number, s: Direction) => mesh.walls.find((q) => q.x === x && q.y === y && q.side === s)!;
    expect(get(0, 0, 'east')).toMatchObject({ oneWay: true, reverseSlot: 0, slotMismatch: false, boundary: false });
    expect(get(1, 1, 'east')).toMatchObject({ oneWay: false, reverseSlot: 9, slotMismatch: true, slot: 7 });
    expect(get(2, 1, 'west')).toMatchObject({ oneWay: false, reverseSlot: 7, slotMismatch: true, slot: 9 });
    expect(get(0, 0, 'north')).toMatchObject({ boundary: true, reverseSlot: null, oneWay: false, slotMismatch: false });
    expect(mesh.stats.oneWay).toBe(1);
    expect(mesh.stats.slotMismatch).toBe(2);
  });

  it('doors: passage classes, doorState per side, doorsOnOpen', () => {
    const m = room(4, 4);
    for (const [x, door] of [[0, 1], [1, 2], [2, 3]] as const) {
      cellAt(m, x, 1).walls.south = 2;
      cellAt(m, x, 1).doors!.south = door;
    }
    cellAt(m, 1, 1).doorsOpen = { south: true };
    cellAt(m, 3, 3).doors!.north = 2; // door bits on an OPEN edge
    const mesh = buildDungeonMesh(m, { topology: 'bounded' })!;
    const get = (x: number) => mesh.walls.find((q) => q.x === x && q.y === 1 && q.side === 'south')!;
    expect(get(0)).toMatchObject({ passage: 'door', door: 1, doorState: 'closed' });
    expect(get(1)).toMatchObject({ passage: 'gateway', door: 2, doorState: 'open' });
    expect(get(2)).toMatchObject({ passage: 'locked', door: 3, doorState: 'closed' });
    expect(mesh.walls.find((q) => q.x === 3 && q.y === 0 && q.side === 'east')).toMatchObject({ passage: 'blocked', door: 0, doorState: 'none' });
    expect(mesh.doorsOnOpen).toEqual([{ x: 3, y: 3, side: 'north', door: 2 }]);
    expect(mesh.walls.some((q) => q.x === 3 && q.y === 3 && q.side === 'north')).toBe(false);
    expect(mesh.stats.doors).toBe(3);
    expect(mesh.stats.doorsOnOpen).toBe(1);
    // movement classes
    expect(stepTarget(m, 0, 1, 'south', 'bounded')).toEqual({ x: 0, y: 2 });
    expect(stepTarget(m, 1, 1, 'south', 'bounded')).toEqual({ x: 1, y: 2 });
    expect(stepTarget(m, 2, 1, 'south', 'bounded')).toBeNull();
    expect(stepTarget(m, 2, 1, 'south', 'bounded', { allowLocked: true })).toEqual({ x: 2, y: 2 });
    expect(stepTarget(m, 3, 3, 'north', 'bounded')).toEqual({ x: 3, y: 2 });
    expect(stepTarget(m, 3, 1, 'south', 'bounded')).toEqual({ x: 3, y: 2 });
    expect(stepTarget(m, 3, 0, 'north', 'bounded')).toBeNull();
  });

  it('FRUA-style fixture: secret(2)/locked(1)/blocked(0) kinds and a slot-0 door marker', () => {
    const m = mkMap(6, 6, 'frua-like', (x, y) => ({
      north: y === 0 ? 2 : 0, south: y === 5 ? 2 : 0, west: x === 0 ? 2 : 0, east: x === 5 ? 2 : 0,
    }));
    cellAt(m, 2, 2).walls.east = 5; cellAt(m, 2, 2).doors!.east = 1; // locked kind -> door
    cellAt(m, 3, 2).walls.west = 5; cellAt(m, 3, 2).doors!.west = 1;
    cellAt(m, 2, 3).walls.east = 5; // blocked kind -> plain wall
    cellAt(m, 4, 4).walls.south = 6; cellAt(m, 4, 4).doors!.south = 2; // secret kind -> gateway bucket
    const mesh = buildDungeonMesh(m, { topology: 'bounded' })!;
    expect(mesh.topology).toBe('bounded');
    expect(stepTarget(m, 2, 2, 'east', 'bounded')).toEqual({ x: 3, y: 2 });
    expect(stepTarget(m, 2, 3, 'east', 'bounded')).toBeNull();
    expect(stepTarget(m, 4, 4, 'south', 'bounded')).toEqual({ x: 4, y: 5 });
    expect(mesh.walls.find((q) => q.x === 4 && q.y === 4 && q.side === 'south')!.passage).toBe('gateway');
  });

  it('options: overland null, ceilings off, outdoor cells get no ceiling, default topology', () => {
    const m = room(16, 16, 'GEO1#3');
    expect(buildDungeonMesh(m, { overland: true })).toBeNull();
    expect(buildDungeonMesh(m, { overland: true, rejectOverland: false })).not.toBeNull();
    expect(buildDungeonMesh(m)!.topology).toBe('torus');
    expect(buildDungeonMesh(m, { eclBlockId: 0 })!.topology).toBe('bounded');
    expect(buildDungeonMesh(m, { eclBlockId: 10 })!.topology).toBe('bounded');
    expect(buildDungeonMesh(m, { eclBlockId: 7 })!.topology).toBe('torus');
    expect(buildDungeonMesh(m, { topology: 'bounded' })!.topology).toBe('bounded');
    expect(buildDungeonMesh(room(16, 16, 'GEO.GLB/area34'))!.topology).toBe('bounded');
    expect(buildDungeonMesh(room(10, 12))!.topology).toBe('bounded');
    expect(buildDungeonMesh(m, { ceilings: false })!.ceilings.length).toBe(0);
    cellAt(m, 5, 5).floor = 0x10; // outdoor (< 0x80)
    const mesh = buildDungeonMesh(m)!;
    expect(mesh.floors.find((f) => f.x === 5 && f.y === 5)!.outdoor).toBe(true);
    expect(mesh.ceilings.length).toBe(255);
    expect(mesh.ceilings.some((c) => c.x === 5 && c.y === 5)).toBe(false);
    // Gen2-named maps never infer outdoors
    const g2 = room(16, 16, 'GEO.GLB/area2');
    cellAt(g2, 1, 1).floor = 0x10;
    expect(buildDungeonMesh(g2)!.floors.find((f) => f.x === 1 && f.y === 1)!.outdoor).toBe(false);
  });

  it('frontFaceRequests: distinct raw slots only', () => {
    const m = room(3, 3);
    cellAt(m, 1, 1).walls.north = 9;
    cellAt(m, 1, 1).walls.south = 9;
    cellAt(m, 1, 1).walls.east = 14;
    const reqs = frontFaceRequests(buildDungeonMesh(m, { topology: 'bounded' })!);
    expect(reqs).toEqual([{ slot: 1 }, { slot: 9 }, { slot: 14 }]);
    expect(Object.keys(reqs[0])).toEqual(['slot']);
  });
});

describe('dungeon3d fixtures: topology and stepTarget', () => {
  it('torus wraps the grid edge, bounded blocks it, walls still decide first', () => {
    const m = mkMap(16, 16, 'GEO1#1', () => ({}));
    expect(stepTarget(m, 0, 0, 'north', 'torus')).toEqual({ x: 0, y: 15 });
    expect(stepTarget(m, 0, 0, 'west', 'torus')).toEqual({ x: 15, y: 0 });
    expect(stepTarget(m, 15, 15, 'east', 'torus')).toEqual({ x: 0, y: 15 });
    expect(stepTarget(m, 15, 15, 'south', 'torus')).toEqual({ x: 15, y: 0 });
    expect(stepTarget(m, 0, 0, 'north', 'bounded')).toBeNull();
    expect(stepTarget(m, 15, 15, 'east', 'bounded')).toBeNull();
    cellAt(m, 0, 0).walls.north = 1;
    expect(stepTarget(m, 0, 0, 'north', 'torus')).toBeNull();
    expect(stepTarget(m, -1, 0, 'east', 'torus')).toBeNull();
    expect(stepTarget(m, 16, 0, 'west', 'torus')).toBeNull();
  });

  it('wrap works on non-16 grids too (view-chosen torus)', () => {
    const m = mkMap(5, 3, 'odd', () => ({}));
    expect(stepTarget(m, 4, 2, 'east', 'torus')).toEqual({ x: 0, y: 2 });
    expect(stepTarget(m, 0, 0, 'north', 'torus')).toEqual({ x: 0, y: 2 });
  });

  it('mesh quads are identical across topologies (topology never changes which quads exist)', () => {
    const m = room(16, 16, 'GEO1#9');
    const a = buildDungeonMesh(m, { topology: 'bounded' })!;
    const b = buildDungeonMesh(m, { topology: 'torus' })!;
    expect(a.walls).toEqual(b.walls);
    expect(a.topology).not.toBe(b.topology);
  });
});

describe('dungeon3d fixtures: culling / one-way invisibility', () => {
  it('one-way edge: drawn from A, culled from B; symmetric wall: each side survives only from its own cell', () => {
    const m = room(3, 1); // 3 wide, 1 high
    // A=(0,0) east wall, B=(1,0) west open  => one-way
    cellAt(m, 0, 0).walls.east = 4;
    // symmetric wall between (1,0) and (2,0)
    cellAt(m, 1, 0).walls.east = 5;
    cellAt(m, 2, 0).walls.west = 5;
    const mesh = buildDungeonMesh(m, { topology: 'bounded' })!;
    const a = mesh.walls.find((q) => q.x === 0 && q.y === 0 && q.side === 'east')!;
    expect(a.oneWay).toBe(true);
    expect(isBackFacing(a, 0.5, 0.5)).toBe(false); // from A interior
    expect(isBackFacing(a, 1.5, 0.5)).toBe(true); // from B interior
    expect(paintOrder(mesh, 0.5, 0.5).includes(a)).toBe(true);
    expect(paintOrder(mesh, 1.5, 0.5).includes(a)).toBe(false);

    const left = mesh.walls.find((q) => q.x === 1 && q.y === 0 && q.side === 'east')!;
    const right = mesh.walls.find((q) => q.x === 2 && q.y === 0 && q.side === 'west')!;
    expect(isBackFacing(left, 1.5, 0.5)).toBe(false);
    expect(isBackFacing(left, 2.5, 0.5)).toBe(true);
    expect(isBackFacing(right, 2.5, 0.5)).toBe(false);
    expect(isBackFacing(right, 1.5, 0.5)).toBe(true);
    const fromB = paintOrder(mesh, 1.5, 0.5);
    expect(fromB.includes(left)).toBe(true);
    expect(fromB.includes(right)).toBe(false);
    // camera exactly on the plane is degenerate => culled
    expect(isBackFacing(left, 2, 0.5)).toBe(true);
  });

  it('paintOrder is far to near and stable', () => {
    const m = room(6, 1);
    cellAt(m, 4, 0).walls.west = 2; // one-way wall facing east: back-facing from x=0.5
    const mesh = buildDungeonMesh(m, { topology: 'bounded' })!;
    const order = paintOrder(mesh, 0.5, 0.5);
    const dist = (q: (typeof order)[number]) => {
      const cx = q.corners.reduce((s, c) => s + c[0], 0) / 4;
      const cz = q.corners.reduce((s, c) => s + c[2], 0) / 4;
      return (cx - 0.5) ** 2 + (cz - 0.5) ** 2;
    };
    for (let i = 1; i < order.length; i++) expect(dist(order[i - 1])).toBeGreaterThanOrEqual(dist(order[i]));
    expect(paintOrder(mesh, 0.5, 0.5)).toEqual(order);
    expect(order.length).toBeLessThan(mesh.walls.length); // some are back-facing from here
  });
});

describe('dungeon3d fixtures: movement parity with the real Explorer', () => {
  it('stepTarget(bounded, allowLocked) agrees with Explorer.canMove on every side of a scrambled map', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const m = mkMap(7, 5, 'scrambled', () => {
      const s: CellSpec & DoorSpec = { doors: {} };
      for (const d of DIRS) {
        if (rnd() < 0.5) s[d] = 1 + Math.floor(rnd() * 15);
        s.doors![d] = Math.floor(rnd() * 4);
      }
      return s;
    });
    let locked = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) for (const d of DIRS) {
      const ex = new Explorer(m, { x, y, facing: d });
      const can = ex.canMove(d);
      expect(stepTarget(m, x, y, d, 'bounded', { allowLocked: true }) !== null).toBe(can);
      const cell = cellAt(m, x, y);
      const isLocked = cell.walls[d] !== 0 && cell.doors![d] === 3;
      if (isLocked) {
        locked++;
        // the single documented divergence: default blocks locked; Explorer (historic) passes it
        const inBounds = x + (d === 'east' ? 1 : d === 'west' ? -1 : 0) >= 0;
        void inBounds;
        expect(stepTarget(m, x, y, d, 'bounded')).toBeNull();
      } else {
        expect(stepTarget(m, x, y, d, 'bounded') !== null).toBe(can);
      }
    }
    expect(locked).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Retail data: every map the engine can load locally
// ---------------------------------------------------------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '..', '..', '..');
const GOG = process.env.GB_GOG_DIR ?? 'C:/Program Files (x86)/GOG Galaxy/Games';

interface Gen1Title { title: string; dirs: string[] }
const GEN1_TITLES: Gen1Title[] = [
  { title: 'Champions of Krynn', dirs: [resolve(repo, 'Champions of Krynn')] },
  { title: 'Death Knights of Krynn', dirs: [resolve(repo, 'Death Knights of Krynn')] },
  { title: 'Curse of the Azure Bonds', dirs: [resolve(GOG, 'Curse of the Azure Bonds')] },
  { title: 'Secret of the Silver Blades', dirs: [resolve(GOG, 'Secret of the Silver Blades')] },
  { title: 'Pools of Darkness', dirs: [resolve(GOG, 'Pools of Darkness')] },
  { title: 'Gateway to the Savage Frontier', dirs: [resolve(GOG, 'Gateway to the Savage Frontier')] },
  { title: 'Treasures of the Savage Frontier', dirs: [resolve(GOG, 'Treasures of the Savage Frontier')] },
  { title: 'Pool of Radiance', dirs: [resolve(GOG, 'Pool of Radiance', 'POOLRAD'), resolve(GOG, 'Pool of Radiance')] },
];

/** Independent DAX TOC reader: u16 toc_bytes, then 9-byte {id,u32 off,u16 raw,u16 comp}. */
function tocRawSizes(bytes: Uint8Array): { id: number; raw: number }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint16(0, true) / 9;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: bytes[2 + i * 9], raw: dv.getUint16(2 + i * 9 + 5, true) });
  return out;
}

interface LoadedMap { label: string; raw: Uint8Array; gen: 1 | 2; file: string }
interface TitleData { title: string; maps: LoadedMap[]; expectedCount: number; files: string[] }

function loadGen1(t: Gen1Title): TitleData | null {
  const dir = t.dirs.find((d) => existsSync(d) && [1, 2, 3, 4, 5, 6, 7, 8].some((n) => existsSync(resolve(d, `GEO${n}.DAX`))));
  if (!dir) return null;
  const maps: LoadedMap[] = [];
  const files: string[] = [];
  let expected = 0;
  for (let n = 1; n <= 8; n++) {
    const f = resolve(dir, `GEO${n}.DAX`);
    if (!existsSync(f)) continue;
    files.push(`GEO${n}.DAX`);
    const bytes = new Uint8Array(readFileSync(f));
    expected += tocRawSizes(bytes).filter((e) => e.raw === 1026).length;
    for (const b of readDaxDataBlocks(bytes)) {
      if (b.raw.length === 1026) maps.push({ label: `${t.title} GEO${n}#${b.blockId}`, raw: b.raw, gen: 1, file: `GEO${n}.DAX` });
    }
  }
  return { title: t.title, maps, expectedCount: expected, files };
}

function loadDqk(): TitleData | null {
  const f = resolve(repo, 'The Dark Queen of Krynn', 'DISK3', 'GEO.GLB');
  if (!existsSync(f)) return null;
  const arch = decodeHlib(new Uint8Array(readFileSync(f)), 'GEO.GLB');
  const maps: LoadedMap[] = [];
  arch.rawMembers.forEach((m, i) => {
    // independent shape sniff: byte0 = height, byte1 = width, len == 8 + 4*w*h
    if (m.length >= 8 && m[0] >= 1 && m[1] >= 1 && m.length === 8 + 4 * m[0] * m[1]) {
      maps.push({ label: `DQK GEO member ${i}`, raw: m, gen: 2, file: 'GEO.GLB' });
    }
  });
  return { title: 'The Dark Queen of Krynn', maps, expectedCount: arch.rawMembers.filter((m) => m.length >= 8 && m[0] >= 1 && m[1] >= 1 && m.length === 8 + 4 * m[0] * m[1]).length, files: ['GEO.GLB'] };
}

const titles: { data: TitleData | null; name: string }[] = [
  ...GEN1_TITLES.map((t) => ({ name: t.title, data: loadGen1(t) })),
  { name: 'The Dark Queen of Krynn', data: loadDqk() },
];
for (const t of titles) if (!t.data) console.log(`SKIP title (no data): ${t.name}`);

function decodeMap(m: LoadedMap): GameMap {
  return m.gen === 1 ? decodeGeoBlock(m.raw, m.label).map : decodeGen2GeoBlock(m.raw, m.label).map;
}
const planesOf = (m: LoadedMap) => (m.gen === 1 ? gen1Planes(m.raw) : gen2Planes(m.raw));

describe('dungeon3d retail: wall set == raw planes == 2D predicate, every side of every cell', () => {
  const report: string[] = [];
  for (const { name, data } of titles) {
    describe.skipIf(!data)(name, () => {
      it('map count matches the independent TOC/member count and every map matches', () => {
        const d = data!;
        expect(d.maps.length).toBeGreaterThan(0);
        expect(d.maps.length).toBe(d.expectedCount);
        let sides = 0;
        const agg = { walls: 0, oneWay: 0, slotMismatch: 0, doors: 0, doorsOnOpen: 0, boundary: 0, openBoundary: 0, cells: 0 };
        for (const lm of d.maps) {
          const map = decodeMap(lm);
          const pl = planesOf(lm);
          const mesh = buildDungeonMesh(map, lm.gen === 2 ? { topology: 'bounded' } : { topology: 'torus' })!;
          // (1) vs raw planes, decoder bypassed
          const expected = rawWallSet(pl);
          expect(mesh.width).toBe(pl.w);
          expect(mesh.height).toBe(pl.h);
          const got = meshWallSet(mesh);
          expect(got.size).toBe(expected.size);
          for (const k of expected) if (!got.has(k)) throw new Error(`${lm.label}: raw wall ${k} missing from mesh`);
          // (2) vs the 2D predicate (wallType) for every in-grid side, Gen1
          if (lm.gen === 1) {
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) for (let di = 0; di < 4; di++) {
              const twoD = wallType(map, di * 2, y, x, 1) !== 0;
              const threeD = got.has(`${x},${y},${DIRS[di]}`);
              sides++;
              if (twoD !== threeD) throw new Error(`${lm.label} (${x},${y}) ${DIRS[di]}: 2D=${twoD} 3D=${threeD}`);
            }
          }
          // (3) slots per quad are the raw nibbles, doors the raw plane-3 bits
          for (const q of mesh.walls) {
            expect(q.slot).toBe(slotAt(pl, q.x, q.y, q.side));
            expect(q.door).toBe(doorAt(pl, q.x, q.y, q.side));
          }
          // (4) independent census by neighbour comparison
          const rc = recount(pl);
          expect(mesh.stats).toEqual(rc);
          for (const k of Object.keys(agg) as (keyof typeof agg)[]) agg[k] += rc[k];
          // passage / flags consistent
          for (const q of mesh.walls) {
            expect(q.passage).toBe(['blocked', 'door', 'gateway', 'locked'][q.door]);
            expect(q.boundary).toBe(q.reverseSlot === null);
          }
        }
        report.push(`${name}: ${d.maps.length} maps [${d.files.join(',')}] ${JSON.stringify(agg)} 2Dsides=${sides}`);
        console.log(`CENSUS ${report[report.length - 1]}`);
      });

      it('movement: stepTarget(bounded, allowLocked) == real Explorer.canMove for every cell/side', () => {
        for (const lm of data!.maps) {
          const map = decodeMap(lm);
          let locked = 0;
          for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) for (const dir of DIRS) {
            const can = new Explorer(map, { x, y, facing: dir }).canMove(dir);
            const t = stepTarget(map, x, y, dir, 'bounded', { allowLocked: true });
            if ((t !== null) !== can) throw new Error(`${lm.label} (${x},${y}) ${dir}: explorer=${can} step=${t !== null}`);
            const cell = cellAt(map, x, y);
            const isLocked = cell.walls[dir] !== 0 && cell.doors![dir] === 3;
            if (isLocked) {
              locked++;
              if (stepTarget(map, x, y, dir, 'bounded') !== null) throw new Error(`${lm.label}: locked door passable by default`);
            } else if ((stepTarget(map, x, y, dir, 'bounded') !== null) !== can) {
              throw new Error(`${lm.label}: non-locked divergence at (${x},${y}) ${dir}`);
            }
          }
          void locked;
        }
      });

      it('culling: every retail one-way edge is invisible from the open neighbour and visible from its owner', () => {
        let oneWays = 0;
        for (const lm of data!.maps) {
          const mesh = buildDungeonMesh(decodeMap(lm), { topology: lm.gen === 2 ? 'bounded' : 'torus' })!;
          const dx = { north: 0, east: 1, south: 0, west: -1 };
          const dy = { north: -1, east: 0, south: 1, west: 0 };
          for (const q of mesh.walls) {
            if (!q.oneWay) continue;
            oneWays++;
            expect(isBackFacing(q, q.x + 0.5, q.y + 0.5)).toBe(false);
            expect(isBackFacing(q, q.x + dx[q.side] + 0.5, q.y + dy[q.side] + 0.5)).toBe(true);
          }
        }
        console.log(`CULL ${name}: ${oneWays} one-way edges checked`);
      });
    });
  }
});

describe('dungeon3d retail: Gen1 out-of-grid convention (torus vs 0/10 open)', () => {
  for (const { name, data } of titles) {
    describe.skipIf(!data || data.maps[0]?.gen !== 1)(name, () => {
      it('wallType off-map reads equal the mesh wrapped read; ECL 0/10 reads open; independent edge-cell recount', () => {
        let edgeDiffer = 0;
        let edgeDifferRaw = 0;
        for (const lm of data!.maps) {
          const map = decodeMap(lm);
          const mesh = buildDungeonMesh(map, { topology: 'torus' })!;
          const keys = meshWallSet(mesh);
          const pl = planesOf(lm);
          const mod = (v: number) => ((v % 16) + 16) % 16;
          for (let i = -1; i <= 16; i++) for (const j of [-1, 16]) for (const [x, y] of [[i, j], [j, i]]) {
            if (x >= 0 && x < 16 && y >= 0 && y < 16) continue;
            for (let di = 0; di < 4; di++) {
              const meshWrapped = keys.has(`${mod(x)},${mod(y)},${DIRS[di]}`);
              if ((wallType(map, di * 2, y, x, 1) !== 0) !== meshWrapped) throw new Error(`${lm.label} off-map (${x},${y}) ${DIRS[di]}`);
              if (wallType(map, di * 2, y, x, 0) !== 0 || wallType(map, di * 2, y, x, 10) !== 0) throw new Error('0/10 not open');
            }
          }
          // independent count: boundary walls whose side facing outward is walled (torus would read them,
          // bounded 0/10 would not): recounted from raw planes, compared with mesh boundary quads.
          for (let k = 0; k < 16; k++) {
            if (slotAt(pl, k, 0, 'north')) edgeDifferRaw++;
            if (slotAt(pl, k, 15, 'south')) edgeDifferRaw++;
            if (slotAt(pl, 0, k, 'west')) edgeDifferRaw++;
            if (slotAt(pl, 15, k, 'east')) edgeDifferRaw++;
          }
          edgeDiffer += mesh.walls.filter((q) => q.boundary).length;
        }
        expect(edgeDiffer).toBe(edgeDifferRaw);
      });
    });
  }
});

describe('dungeon3d retail: wall view parity with the real 2D planner (planWallView)', () => {
  for (const { name, data } of titles) {
    describe.skipIf(!data || data.maps[0]?.gen !== 1)(name, () => {
      it('slots planned for a pose all come from mesh quads in the visible window; empty window => empty plan', () => {
        let poses = 0;
        for (const lm of data!.maps) {
          const map = decodeMap(lm);
          const mesh = buildDungeonMesh(map, { topology: 'torus' })!;
          const bySide = new Map<string, number>();
          for (const q of mesh.walls) bySide.set(`${q.x},${q.y},${q.side}`, q.slot);
          const mod = (v: number) => ((v % 16) + 16) % 16;
          const XD = [0, 1, 1, 1, 0, -1, -1, -1];
          const YD = [-1, -1, 0, 1, 1, 1, 0, -1];
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) for (const facing of [0, 2, 4, 6]) {
            poses++;
            const plan = planWallView(map, { px: x, py: y, facing, eclBlockId: 1 });
            // window: cells within 3 ahead, +-4 laterally; any side
            const slots = new Set<number>();
            const left = (facing + 6) % 8;
            for (let f = -1; f <= 3; f++) for (let l = -4; l <= 4; l++) {
              const cx = mod(x + f * XD[facing] + l * XD[left]);
              const cy = mod(y + f * YD[facing] + l * YD[left]);
              for (const d of DIRS) { const s = bySide.get(`${cx},${cy},${d}`); if (s) slots.add(s); }
            }
            for (const p of plan) if (!slots.has(p.slot)) throw new Error(`${lm.label} pose (${x},${y},${facing}): planned slot ${p.slot} has no mesh quad in window`);
            if (slots.size === 0 && plan.length !== 0) throw new Error('empty window but non-empty plan');
          }
        }
        expect(poses).toBe(data!.maps.length * 1024);
      });
    });
  }
});

describe('dungeon3d retail: DQK Gen2 header order (height then width)', () => {
  const d = titles.find((t) => t.name === 'The Dark Queen of Krynn')!.data;
  describe.skipIf(!d)('DQK', () => {
    it('non-square maps index by width=byte1, height=byte0; a transposed reading is detected', () => {
      let nonSquare = 0;
      for (const lm of d!.maps) {
        const h = lm.raw[0], w = lm.raw[1];
        const mesh = buildDungeonMesh(decodeMap(lm), { topology: 'bounded' })!;
        expect([mesh.width, mesh.height]).toEqual([w, h]);
        if (w !== h) {
          nonSquare++;
          // control: read the same planes transposed; the wall sets must differ for a non-square map
          const swapped: Planes = { ...gen2Planes(lm.raw), w: h, h: w };
          expect(rawWallSet(swapped)).not.toEqual(meshWallSet(mesh));
        }
        // DQK clamp convention vs the bounded rule: stepping off the edge is blocked
        const mapG = decodeMap(lm);
        expect(stepTarget(mapG, 0, 0, 'north', 'bounded')).toBeNull();
        expect(stepTarget(mapG, w - 1, h - 1, 'east', 'bounded')).toBeNull();
      }
      expect(d!.maps.length).toBe(20);
      expect(nonSquare).toBe(8);
    });
  });
});

describe('dungeon3d retail: overland maps', () => {
  const cases: [string, string, string][] = [
    ['Gateway to the Savage Frontier', 'GEO6.DAX', 'Gateway GEO6'],
    ['Treasures of the Savage Frontier', 'GEO1.DAX', 'Treasures GEO1'],
  ];
  for (const [title, file, label] of cases) {
    const d = titles.find((t) => t.name === title)!.data;
    describe.skipIf(!d)(label, () => {
      it('overland hint returns null; without it openBoundary is reported', () => {
        const ms = d!.maps.filter((m) => m.file === file);
        expect(ms.length).toBeGreaterThan(0);
        for (const lm of ms) {
          const map = decodeMap(lm);
          expect(buildDungeonMesh(map, { overland: true })).toBeNull();
          const mesh = buildDungeonMesh(map)!;
          const total = 2 * (mesh.width + mesh.height);
          console.log(`OVERLAND ${lm.label}: openBoundary ${mesh.stats.openBoundary}/${total}`);
          expect(mesh.stats.openBoundary).toBeGreaterThanOrEqual(0);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Round 11 fixes: ECL block id semantics, overland classification, default start
// ---------------------------------------------------------------------------

describe('eclBlockIdForGeoArea: the ECL block id of a GEO area is its ECL PARTNER, not the GEO id', () => {
  it('returns the id only when the disk has an ECL block with that id', () => {
    const ecl = new Set([1, 10, 34]);
    expect(eclBlockIdForGeoArea(34, ecl)).toBe(34);
    expect(eclBlockIdForGeoArea(10, ecl)).toBe(10);
    // a GEO map with no ECL partner has NO ECL block id (it used to be faked from the GEO id)
    expect(eclBlockIdForGeoArea(48, ecl)).toBeUndefined();
    expect(eclBlockIdForGeoArea(0, ecl)).toBeUndefined();
  });
  it('an unreadable ECL archive (null) falls back to the pairing convention', () => {
    expect(eclBlockIdForGeoArea(10, null)).toBe(10);
    expect(eclBlockIdForGeoArea(0, null)).toBe(0);
  });
  it('ids 0 and 10 force bounded only through a real partner; an unpaired 0/10 keeps the shape default', () => {
    const m = mkMap(16, 16, 'g', () => ({}));
    const paired = new Set([0, 10]);
    expect(buildDungeonMesh(m, { eclBlockId: eclBlockIdForGeoArea(10, paired) })!.topology).toBe('bounded');
    expect(buildDungeonMesh(m, { eclBlockId: eclBlockIdForGeoArea(0, paired) })!.topology).toBe('bounded');
    expect(buildDungeonMesh(m, { eclBlockId: eclBlockIdForGeoArea(10, new Set([1])) })!.topology).toBe('torus');
  });
});

describe('dungeon3d retail: ECL pairing per title matches the ECL archive TOC (independent read)', () => {
  for (const t of GEN1_TITLES) {
    const dir = t.dirs.find((d) => existsSync(d) && [1, 2, 3, 4, 5, 6, 7, 8].some((n) => existsSync(resolve(d, `GEO${n}.DAX`))));
    describe.skipIf(!dir)(t.title, () => {
      it('defined iff the disk ECL TOC holds the id; topology follows 0/10 only for paired ids', () => {
        let paired = 0;
        let unpaired = 0;
        for (let n = 1; n <= 8; n++) {
          const g = resolve(dir!, `GEO${n}.DAX`);
          if (!existsSync(g)) continue;
          const e = resolve(dir!, `ECL${n}.DAX`);
          const toc = new Set(existsSync(e) ? tocRawSizes(new Uint8Array(readFileSync(e))).map((r) => r.id) : []);
          for (const b of readDaxDataBlocks(new Uint8Array(readFileSync(g))).filter((x) => x.raw.length === 1026)) {
            const map = decodeGeoBlock(b.raw, 'x').map;
            const ecl = eclBlockIdForGeoArea(b.blockId, toc);
            expect(ecl !== undefined).toBe(toc.has(b.blockId));
            const topo = buildDungeonMesh(map, { eclBlockId: ecl })!.topology;
            expect(topo).toBe(toc.has(b.blockId) && (b.blockId === 0 || b.blockId === 10) ? 'bounded' : 'torus');
            if (ecl === undefined) unpaired++; else paired++;
          }
        }
        console.log(`ECLPAIR ${t.title}: paired ${paired}, unpaired ${unpaired}`);
        expect(paired).toBeGreaterThan(0);
      });
    });
  }
});

describe('looksOverland: only an UNPAIRED map with a mostly-open edge is refused', () => {
  const empty = mkMap(16, 16, 'empty', () => ({}));
  const boxed = mkMap(16, 16, 'boxed', (x, y) => ({
    north: y === 0 ? 3 : 0, south: y === 15 ? 3 : 0, west: x === 0 ? 3 : 0, east: x === 15 ? 3 : 0,
  }));
  const stats = (m: GameMap) => buildDungeonMesh(m)!.stats;
  it('truth table', () => {
    expect(stats(empty).openBoundary).toBe(64);
    expect(looksOverland(stats(empty), 16, 16, false)).toBe(true);
    expect(looksOverland(stats(empty), 16, 16, true)).toBe(false); // paired: noted, never refused
    expect(stats(boxed).openBoundary).toBe(0);
    expect(looksOverland(stats(boxed), 16, 16, false)).toBe(false);
    expect(looksOverland({ openBoundary: 32 }, 16, 16, false)).toBe(false); // exactly half is not "more than half"
    expect(looksOverland({ openBoundary: 33 }, 16, 16, false)).toBe(true);
  });
});

describe('pickDefaultStart: a start pose with something to look at', () => {
  const canStep = (m: GameMap, topo: 'bounded' | 'torus', s: { x: number; y: number; facing: number }) =>
    stepTarget(m, s.x, s.y, DIRS[s.facing]!, topo) !== null;
  it('never starts facing a wall when any open pose exists, and prefers a corridor with side walls', () => {
    // 16x16 map with a walled 1-wide corridor along y=8, x=2..12, closed by distinct walls at both ends
    const m = mkMap(16, 16, 'corr', (x, y) => {
      const c: CellSpec = {};
      if (y === 8 && x >= 2 && x <= 12) { c.north = 5; c.south = 9; }
      if (y === 8 && x === 2) c.west = 7;
      if (y === 8 && x === 12) c.east = 11;
      return c;
    });
    const s = pickDefaultStart(m, 'bounded');
    expect(s.y).toBe(8);
    expect([1, 3]).toContain(s.facing); // along the corridor, not into a side wall
    expect(canStep(m, 'bounded', s)).toBe(true);
    expect(pickDefaultStart(m, 'bounded')).toEqual(s); // deterministic
  });
  it('blank map and tiny maps fall back without throwing', () => {
    expect(pickDefaultStart(mkMap(16, 16, 'blank', () => ({})), 'bounded')).toEqual(expect.objectContaining({ x: expect.any(Number) }));
    const one = mkMap(1, 1, 'one', () => ({ north: 1, east: 1, south: 1, west: 1 }));
    expect(pickDefaultStart(one, 'bounded')).toEqual({ x: 0, y: 0, facing: 0 });
  });
  // The REAL 2D planner is the oracle for "what is on screen": planWallView over all 1024 poses.
  for (const { name, data } of titles) {
    describe.skipIf(!data || data.maps[0]?.gen !== 1)(name, () => {
      it('every map starts with an open step ahead and at least min(2, best possible) distinct wall slots on the 2D plan', () => {
        const distinct = (map: GameMap, x: number, y: number, f: number) =>
          new Set(planWallView(map, { px: x, py: y, facing: f * 2, eclBlockId: 1 }).map((p) => p.slot)).size;
        for (const lm of data!.maps) {
          const map = decodeMap(lm);
          const s = pickDefaultStart(map, 'torus');
          expect(canStep(map, 'torus', s)).toBe(true);
          let best = 0;
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) for (let f = 0; f < 4; f++) if (canStep(map, 'torus', { x, y, facing: f })) best = Math.max(best, distinct(map, x, y, f));
          const got = distinct(map, s.x, s.y, s.facing);
          if (got < Math.min(2, best)) throw new Error(`${lm.label}: start (${s.x},${s.y},${s.facing}) shows ${got} distinct slots, best ${best}`);
        }
      });
    });
  }
  const pool = titles.find((t) => t.name === 'Pool of Radiance')?.data;
  describe.skipIf(!pool)('Pool of Radiance 1:18 (the flat pink plane defect)', () => {
    it('old centre-nearest start showed fewer slots than the new one, which shows >= 3', () => {
      const lm = pool!.maps.find((m) => m.file === 'GEO1.DAX' && m.label.endsWith('#18'))!;
      const map = decodeMap(lm);
      const slotsAt = (x: number, y: number, f: number) => new Set(planWallView(map, { px: x, py: y, facing: f * 2, eclBlockId: 18 }).map((p) => p.slot)).size;
      // the previous rule: the passable pose nearest the map centre, first facing that can step
      let old: { x: number; y: number; f: number } | null = null;
      const cells: { x: number; y: number; d: number }[] = [];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) cells.push({ x, y, d: Math.abs(x - 8) + Math.abs(y - 8) });
      cells.sort((a, b) => a.d - b.d);
      outer: for (const c of cells) for (let f = 0; f < 4; f++) if (stepTarget(map, c.x, c.y, DIRS[f]!, 'torus')) { old = { x: c.x, y: c.y, f }; break outer; }
      const s = pickDefaultStart(map, 'torus');
      console.log(`POOL1:18 old ${JSON.stringify(old)} slots ${slotsAt(old!.x, old!.y, old!.f)}; new ${JSON.stringify(s)} slots ${slotsAt(s.x, s.y, s.facing)}`);
      expect(slotsAt(s.x, s.y, s.facing)).toBeGreaterThanOrEqual(3);
      expect(slotsAt(s.x, s.y, s.facing)).toBeGreaterThan(slotsAt(old!.x, old!.y, old!.f));
    });
  });
});
