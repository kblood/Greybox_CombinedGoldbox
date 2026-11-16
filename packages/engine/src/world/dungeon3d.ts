/**
 * 3D dungeon mesh builder (renderer-neutral, pure TS, zero DOM).
 *
 * Turns an engine-neutral `GameMap` into wall/floor/ceiling quads for a 3D view that agrees with
 * how the 2D first-person view READS walls (see docs/engine/web-dungeon-3d-spec.md):
 *
 *  - Per-edge ownership is DIRECTED. Each cell emits one quad for each of ITS OWN non-zero sides,
 *    visible only from that cell's interior. A wall recorded from both sides is two coincident
 *    back-to-back quads, each with its own raw slot; a one-way edge is one quad and is invisible
 *    from the open neighbour (exactly as the 2D view never reads the edge facing the viewer).
 *  - Back-face culling is part of the contract (`isBackFacing`, `paintOrder`).
 *  - Topology (`bounded` | `torus`) is an explicit property: it changes movement (`stepTarget`) and
 *    how a view treats the grid edge, never which quads exist.
 *
 * Unit convention: 1 cell = 1 unit, X east+, Z south+, Y up. Cell (x,y) spans X [x,x+1], Z [y,y+1].
 * North = -Z. All corner lists are counter-clockwise seen from the quad's visible side.
 */
import { DIRECTIONS, type Direction, type GameMap } from '../model/index.js';
import { edgeClass } from './explorer.js';
import { planWallView } from './wallview.js';

/** 1 cell = 1 unit. */
export const CELL_SIZE = 1;
export const WALL_HEIGHT = 1;

/** Compass direction the VISIBLE side of a quad faces (toward the owning cell's interior). */
export type Face = 'north' | 'east' | 'south' | 'west';

export type Topology = 'bounded' | 'torus';

export interface WallQuad {
  /** Owning cell (in-grid only; torus copies are a view concern). */
  x: number;
  y: number;
  /** The `cell.walls` key this quad was emitted for. */
  side: Direction;
  /** THIS side's raw nibble, 1..15. */
  slot: number;
  /** The neighbour's opposite-side nibble, or null when there is no in-grid neighbour. */
  reverseSlot: number | null;
  /** Both sides walled but slot !== reverseSlot. Textures are keyed per quad slot, never per edge. */
  slotMismatch: boolean;
  /** Raw 2-bit plane-3 flag for this side, 0..3. */
  door: number;
  /** Per SIDE (`doorsOpen` is stored on one cell only). */
  doorState: 'none' | 'closed' | 'open';
  /** Movement class of this edge. */
  passage: 'blocked' | 'door' | 'locked' | 'gateway';
  /** In-grid neighbour exists and has no wall on its opposite side (wall seen from one side only). */
  oneWay: boolean;
  /** Side lies on the grid edge (no in-grid neighbour). */
  boundary: boolean;
  /** 4 corners, CCW seen from the owning cell's interior. */
  corners: readonly [number, number, number][];
  /**
   * Direction the visible side faces, i.e. the quad's normal points that way. A north-side wall
   * of cell (x,y) lies on Z=y and is seen from the south, so its `face` is 'south'.
   */
  face: Face;
}

/** An edge with slot 0 but non-zero door bits. Emits NO wall quad; surfaced so it is not lost. */
export interface DoorOnOpenEdge {
  x: number;
  y: number;
  side: Direction;
  door: number;
}

export interface FloorQuad {
  x: number;
  y: number;
  /** cell.floor, the plane-2 byte (zone/graphic selector, NOT a texture id). */
  backdrop: number;
  /** backdrop < 0x80 (Gen1 only; from the ovr030 doc, unverified against GAME.OVR). */
  outdoor: boolean;
  corners: readonly [number, number, number][];
}

export interface CeilingQuad {
  x: number;
  y: number;
  corners: readonly [number, number, number][];
}

export interface DungeonMesh {
  name: string;
  width: number;
  height: number;
  topology: Topology;
  /** Sorted (y, x, N, E, S, W): deterministic. */
  walls: WallQuad[];
  doorsOnOpen: DoorOnOpenEdge[];
  /** Row-major. */
  floors: FloorQuad[];
  /** Row-major, indoor cells only. */
  ceilings: CeilingQuad[];
  stats: {
    walls: number;
    oneWay: number;
    slotMismatch: number;
    doors: number;
    doorsOnOpen: number;
    boundary: number;
    openBoundary: number;
    cells: number;
  };
}

export interface BuildMeshOptions {
  /** Default: 'torus' for Gen1-shaped 16x16 maps unless eclBlockId is 0 or 10, else 'bounded'. */
  topology?: Topology;
  /** The ECL block id the 2D view would use for off-map reads; 0 or 10 => off-map is open (bounded). */
  eclBlockId?: number;
  /** Default true; only emitted for cells with outdoor === false. */
  ceilings?: boolean;
  /** Caller hint that a map is an overland/world map. */
  overland?: boolean;
  /** Default true: with `overland`, the builder returns null. */
  rejectOverland?: boolean;
}

const DX: Record<Direction, number> = { north: 0, east: 1, south: 0, west: -1 };
const DY: Record<Direction, number> = { north: -1, east: 0, south: 1, west: 0 };
const OPP: Record<Direction, Direction> = { north: 'south', east: 'west', south: 'north', west: 'east' };
type Vec = [number, number, number];

/** Gen2 (DQK) map names come from decodeGen2GeoArchive as `<base>/area<id>`. */
const GEN2_NAME = /\/area\d+$/i;

/** True when the map has the Gen1 shape (fixed 16x16, not a Gen2 archive member). */
function isGen1Shape(map: GameMap): boolean {
  return map.width === 16 && map.height === 16 && !GEN2_NAME.test(map.name);
}

function defaultTopology(map: GameMap, eclBlockId: number | undefined): Topology {
  if (eclBlockId === 0 || eclBlockId === 10) return 'bounded';
  return isGen1Shape(map) ? 'torus' : 'bounded';
}

function wallCorners(x: number, y: number, side: Direction): Vec[] {
  const H = WALL_HEIGHT;
  switch (side) {
    case 'north':
      return [[x, 0, y], [x + 1, 0, y], [x + 1, H, y], [x, H, y]];
    case 'east':
      return [[x + 1, 0, y], [x + 1, 0, y + 1], [x + 1, H, y + 1], [x + 1, H, y]];
    case 'south':
      return [[x + 1, 0, y + 1], [x, 0, y + 1], [x, H, y + 1], [x + 1, H, y + 1]];
    case 'west':
      return [[x, 0, y + 1], [x, 0, y], [x, H, y], [x, H, y + 1]];
  }
}

/** Build the mesh. Returns null for a map flagged `overland` (unless `rejectOverland === false`). */
export function buildDungeonMesh(map: GameMap, opts: BuildMeshOptions = {}): DungeonMesh | null {
  if (opts.overland && opts.rejectOverland !== false) return null;
  const topology = opts.topology ?? defaultTopology(map, opts.eclBlockId);
  const { width: w, height: h } = map;
  const gen1 = isGen1Shape(map);
  const wantCeilings = opts.ceilings !== false;

  const walls: WallQuad[] = [];
  const doorsOnOpen: DoorOnOpenEdge[] = [];
  const floors: FloorQuad[] = [];
  const ceilings: CeilingQuad[] = [];
  const stats = { walls: 0, oneWay: 0, slotMismatch: 0, doors: 0, doorsOnOpen: 0, boundary: 0, openBoundary: 0, cells: w * h };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = map.cells[y * w + x];
      if (!cell) continue;
      for (const side of DIRECTIONS) {
        const slot = cell.walls[side] & 0x0f;
        const door = (cell.doors?.[side] ?? 0) & 0x03;
        const nx = x + DX[side];
        const ny = y + DY[side];
        const inGrid = nx >= 0 && ny >= 0 && nx < w && ny < h;
        const nb = inGrid ? map.cells[ny * w + nx] : undefined;
        const reverse = nb ? nb.walls[OPP[side]] & 0x0f : null;
        const boundary = !inGrid;
        if (boundary) {
          stats.boundary++;
        }
        if (slot === 0) {
          if (boundary) stats.openBoundary++;
          if (door !== 0) {
            doorsOnOpen.push({ x, y, side, door });
            stats.doorsOnOpen++;
          }
          continue;
        }
        const oneWay = reverse === 0;
        const slotMismatch = reverse !== null && reverse !== 0 && reverse !== slot;
        const cls = edgeClass(cell.walls, cell.doors, side);
        const passage = cls === 'open' ? 'blocked' : cls;
        walls.push({
          x,
          y,
          side,
          slot,
          reverseSlot: reverse,
          slotMismatch,
          door,
          doorState: door === 0 ? 'none' : cell.doorsOpen?.[side] === true ? 'open' : 'closed',
          passage,
          oneWay,
          boundary,
          corners: wallCorners(x, y, side),
          face: OPP[side],
        });
        stats.walls++;
        if (oneWay) stats.oneWay++;
        if (slotMismatch) stats.slotMismatch++;
        if (door !== 0) stats.doors++;
      }
      const backdrop = cell.floor ?? 0;
      const outdoor = gen1 && cell.floor !== undefined && backdrop < 0x80;
      floors.push({
        x,
        y,
        backdrop,
        outdoor,
        corners: [[x, 0, y], [x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y]],
      });
      if (wantCeilings && !outdoor) {
        const H = WALL_HEIGHT;
        ceilings.push({ x, y, corners: [[x, H, y], [x + 1, H, y], [x + 1, H, y + 1], [x, H, y + 1]] });
      }
    }
  }

  return { name: map.name, width: w, height: h, topology, walls, doorsOnOpen, floors, ceilings, stats };
}

/** Wall key set of a mesh ("x,y,side"). */
export function meshWallSet(mesh: DungeonMesh): Set<string> {
  const s = new Set<string>();
  for (const q of mesh.walls) s.add(`${q.x},${q.y},${q.side}`);
  return s;
}

/**
 * Pure movement predicate shared with `Explorer` (via `edgeClass`): where does leaving (x,y) via
 * `dir` land, or null if blocked? `locked` (door flag 3) blocks unless `allowLocked`. `torus`
 * wraps over the grid edge; `bounded` blocks there.
 */
export function stepTarget(
  map: GameMap,
  x: number,
  y: number,
  dir: Direction,
  topology: Topology,
  opts: { allowLocked?: boolean } = {},
): { x: number; y: number } | null {
  const { width: w, height: h } = map;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= w || y >= h) return null;
  const cell = map.cells[y * w + x];
  if (!cell) return null;
  const cls = edgeClass(cell.walls, cell.doors, dir);
  if (cls === 'blocked') return null;
  if (cls === 'locked' && !opts.allowLocked) return null;
  let nx = x + DX[dir];
  let ny = y + DY[dir];
  if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
    if (topology !== 'torus') return null;
    nx = (nx + w) % w;
    ny = (ny + h) % h;
  }
  return { x: nx, y: ny };
}

const FACE_NORMAL: Record<Face, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

function quadCentre(q: WallQuad): [number, number] {
  let cx = 0;
  let cz = 0;
  for (const c of q.corners) {
    cx += c[0];
    cz += c[2];
  }
  return [cx / q.corners.length, cz / q.corners.length];
}

/** Back-face test: true iff the quad's visible side faces away from the camera (must be culled). */
export function isBackFacing(q: WallQuad, camX: number, camZ: number): boolean {
  const [cx, cz] = quadCentre(q);
  const n = FACE_NORMAL[q.face];
  return n[0] * (camX - cx) + n[1] * (camZ - cz) <= 0;
}

/** Painter order for a Canvas2D fallback: back-face culled, far to near (stable). */
export function paintOrder(mesh: DungeonMesh, camX: number, camZ: number): WallQuad[] {
  const keyed: { q: WallQuad; d: number; i: number }[] = [];
  mesh.walls.forEach((q, i) => {
    if (isBackFacing(q, camX, camZ)) return;
    const [cx, cz] = quadCentre(q);
    keyed.push({ q, d: (cx - camX) ** 2 + (cz - camZ) ** 2, i });
  });
  keyed.sort((a, b) => b.d - a.d || a.i - b.i);
  return keyed.map((k) => k.q);
}

export interface FrontFaceRequest {
  slot: number;
}

/** Distinct RAW slots used by the mesh, ascending. Never keyed by wallset/slice. */
export function frontFaceRequests(mesh: DungeonMesh): FrontFaceRequest[] {
  const slots = new Set<number>();
  for (const q of mesh.walls) slots.add(q.slot);
  return [...slots].sort((a, b) => a - b).map((slot) => ({ slot }));
}

// ---------------------------------------------------------------------------------------------
// View helpers shared by the 3D dungeon view (pure, DOM-free, unit-tested)
// ---------------------------------------------------------------------------------------------

/**
 * The ECL block id the 2D first-person view would use for off-map reads ("0 or 10 => open") when
 * it shows the Gen1 GEO map stored at block `geoId`. A Gen1 area is the pair "GEO block N + ECL
 * block N of the same disk" (`listPairedGen1Areas`), so the ECL block id is `geoId` ONLY when the
 * disk's ECL archive really has such a block. A GEO map with no ECL partner has no ECL block at all
 * (returns undefined, so the caller applies the plain shape default instead of faking a block id).
 * `eclIds === null` means the ECL archive could not be read (for example a Library folder without
 * it): the pairing convention is then assumed, which keeps ids 0/10 bounded.
 */
export function eclBlockIdForGeoArea(geoId: number, eclIds: ReadonlySet<number> | null): number | undefined {
  if (eclIds === null) return geoId;
  return eclIds.has(geoId) ? geoId : undefined;
}

/**
 * Overland heuristic for a map that has no per-file hint: a GEO map without an ECL partner whose
 * grid edge is mostly open (more than half of the boundary sides carry no wall) is a wilderness
 * sheet, not a dungeon. Paired maps are never refused (towns and cities are often open at the
 * edge); they only carry the "mostly open edge" note in the view.
 */
export function looksOverland(
  stats: Pick<DungeonMesh['stats'], 'openBoundary'>,
  width: number,
  height: number,
  hasEclPartner: boolean,
): boolean {
  const boundarySides = 2 * (width + height);
  return !hasEclPartner && boundarySides > 0 && stats.openBoundary / boundarySides > 0.5;
}

export interface DefaultStart {
  x: number;
  y: number;
  /** 0..3 = north, east, south, west. */
  facing: number;
}

const FACING: readonly Direction[] = ['north', 'east', 'south', 'west'];

/**
 * Deterministic default walk pose. Looking straight at a wall (or into a blank map) shows one flat
 * plane, so the start is the pose with the most to look at. A pose must be able to step forward.
 * For Gen1-shaped maps the score is led by the open steps ahead (at most 3, via `stepTarget`, so the nearest wall is not a screen-filling
 * plane) plus, for Gen1-shaped maps, what the REAL 2D first-person planner (`planWallView`) puts on
 * screen (8 per distinct wall slot, 1 per planned piece); for other shapes (DQK) it is 2 per distinct
 * slot on the left, right and closing wall, 1 per side wall and 3 if a wall closes the corridor. Ties go to the
 * pose nearest the map centre, then lowest y, x, facing. Pure function of the map.
 */
export function pickDefaultStart(map: GameMap, topology: Topology): DefaultStart {
  const { width: w, height: h } = map;
  const cx0 = Math.floor(w / 2);
  const cy0 = Math.floor(h / 2);
  const gen1 = isGen1Shape(map);
  interface Cand { x: number; y: number; facing: number; score: number; d: number }
  const cands: Cand[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let f = 0; f < 4; f++) {
        const front = FACING[f]!;
        if (!stepTarget(map, x, y, front, topology)) continue;
        // Corridor walk ahead (shared stepTarget): open steps, side walls, the wall that closes it.
        const left = FACING[(f + 3) % 4]!;
        const right = FACING[(f + 1) % 4]!;
        const slots = new Set<number>();
        let sideWalls = 0;
        let closed = 0;
        let steps = 0;
        let px = x;
        let py = y;
        for (let d = 0; d <= 5; d++) {
          const c = map.cells[py * w + px];
          if (!c) break;
          for (const sd of [left, right]) {
            const slot = c.walls[sd] & 0x0f;
            if (slot) { sideWalls++; slots.add(slot); }
          }
          // A passable-but-drawn edge (a door) is a visible plane: it closes the view like a wall.
          const t = (c.walls[front] & 0x0f) === 0 ? stepTarget(map, px, py, front, topology) : null;
          if (!t) {
            const slot = c.walls[front] & 0x0f;
            if (slot) { closed = 1; slots.add(slot); }
            break;
          }
          if (d === 5) break;
          px = t.x;
          py = t.y;
          steps++;
        }
        // A wall one or two cells ahead fills the whole screen as one flat plane, so depth counts too.
        // Depth class dominates (a wall within ~2 cells is a screen-filling plane in 3D even when the 2D plan
        // lists several slots), then the on-screen content breaks ties.
        let score = 1000 * Math.min(steps, 3);
        if (gen1) {
          const plan = planWallView(map, { px: x, py: y, facing: f * 2, eclBlockId: 1 });
          score += 8 * new Set(plan.map((p) => p.slot)).size + plan.length;
        } else {
          score += 2 * slots.size + sideWalls + 3 * closed;
        }
        cands.push({ x, y, facing: f, score, d: Math.abs(x - cx0) + Math.abs(y - cy0) });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score || a.d - b.d || a.y - b.y || a.x - b.x || a.facing - b.facing);
  const best = cands[0];
  return best ? { x: best.x, y: best.y, facing: best.facing } : { x: cx0, y: cy0, facing: 0 };
}
