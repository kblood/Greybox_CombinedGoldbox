/**
 * First-person dungeon projection (M1.S5b) — pure geometry, art-independent.
 *
 * Turns a `GameMap` + party `Pose` into a painter-ordered list of `WallQuad`s: the
 * perspective trapezoids of the corridor the party is looking down. This is the Gold
 * Box "3-D view" geometry layer, deliberately split from the artwork: the renderer can
 * fill each quad with a flat shaded colour today, and drop the real EGA WALLDEF wall
 * frames into the exact same quads once the complex DAX sub-frame decoder lands. No
 * DOM, no canvas, no I/O — fully deterministic and unit-testable.
 *
 * Coordinate model: screen space is normalised to the unit square [0,1]×[0,1] with the
 * vanishing point at the centre (0.5, 0.5); the caller scales to its viewport. Depth is
 * measured in whole cells ahead of the party (0 = the cell the party stands in). At each
 * integer depth `k` there is a cross-section "plane" whose opening shrinks toward the
 * centre by `decay**k`, giving the classic forced-perspective hallway.
 */
import { DIRECTIONS, type Direction, type GameMap, type MapCell } from '../model/index.js';
import type { Pose } from './explorer.js';

/** A normalised screen-space point (0..1 on each axis). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Which face of a cell a quad represents, relative to the viewer. */
export type WallSurface = 'front' | 'left' | 'right';

/** One projected wall surface (a perspective trapezoid) in normalised screen space. */
export interface WallQuad {
  /** Cells ahead of the party (0 = current cell). */
  depth: number;
  /** Lateral cell offset from the centre column (negative = the party's left). */
  column: number;
  /** Face of the cell this quad shows. */
  surface: WallSurface;
  /** Raw map wall code on that edge (>0 = solid; the renderer may map it to a texture). */
  wallValue: number;
  /** Screen corners, clockwise from the top-left as seen on screen. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** Faux-lighting 0..1 (1 = nearest/brightest), for flat-shaded rendering. */
  shade: number;
}

export interface ViewportProjection {
  /** Wall quads in painter order (farthest first, so nearer quads overpaint). */
  quads: WallQuad[];
  /** The facing the projection was built for. */
  facing: Direction;
  /** Depth/column extents actually scanned (for renderers/tests). */
  maxDepth: number;
  sideColumns: number;
}

export interface ProjectOptions {
  /** How many cells deep to project (default 4). */
  maxDepth?: number;
  /** How many columns to each side of centre to project (default 1 → columns -1,0,1). */
  sideColumns?: number;
  /** Perspective shrink per cell of depth (default 0.62). Lower = steeper hallway. */
  decay?: number;
}

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

function rotate(facing: Direction, steps: number): Direction {
  const i = DIRECTIONS.indexOf(facing);
  return DIRECTIONS[(((i + steps) % 4) + 4) % 4];
}

/**
 * A fully-walled "virtual" cell used for out-of-bounds samples, so the map edge reads as
 * a solid boundary (you can never see past the grid).
 */
const SOLID_CELL: MapCell = {
  walls: { north: 1, east: 1, south: 1, west: 1 },
};

/**
 * Project a first-person view of `map` from `pose`.
 *
 * For each visible column the depth scan stops as soon as a solid front (facing) wall is
 * hit — you cannot see the cells behind it — which also keeps the projection from reading
 * garbage cells beyond a closed corridor. Out-of-bounds cells are treated as solid.
 */
export function projectViewport(map: GameMap, pose: Pose, opts: ProjectOptions = {}): ViewportProjection {
  const maxDepth = opts.maxDepth ?? 4;
  const sideColumns = opts.sideColumns ?? 1;
  const decay = opts.decay ?? 0.62;

  const facing = pose.facing;
  const fwd = DELTA[facing];
  const right = DELTA[rotate(facing, 1)];
  const leftDir = rotate(facing, -1);
  const rightDir = rotate(facing, 1);

  // Cross-section geometry at integer depth plane k.
  const halfExtent = (k: number): number => 0.5 * decay ** k;
  const topY = (k: number): number => 0.5 - halfExtent(k);
  const botY = (k: number): number => 0.5 + halfExtent(k);
  // Lateral cell-unit `u` → screen x at plane k. At k=0 one centre cell spans the full
  // width (u=-0.5 → 0, u=+0.5 → 1); deeper planes contract toward the centre.
  const screenX = (u: number, k: number): number => 0.5 + u * decay ** k;

  const sampleCell = (cx: number, cy: number): MapCell => {
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return SOLID_CELL;
    return map.cells[cy * map.width + cx];
  };

  const quads: WallQuad[] = [];

  for (let c = -sideColumns; c <= sideColumns; c++) {
    for (let d = 0; d < maxDepth; d++) {
      const cx = pose.x + fwd.dx * d + right.dx * c;
      const cy = pose.y + fwd.dy * d + right.dy * c;
      const cell = sampleCell(cx, cy);
      const shade = 1 - d / maxDepth;

      // Side walls span depth plane d..d+1 at lateral edges u = c-0.5 (left) and c+0.5.
      const left = cell.walls[leftDir];
      if (left !== 0) {
        quads.push(sideQuad(d, c, 'left', left, c - 0.5, screenX, topY, botY, shade));
      }
      const rightW = cell.walls[rightDir];
      if (rightW !== 0) {
        quads.push(sideQuad(d, c, 'right', rightW, c + 0.5, screenX, topY, botY, shade));
      }

      // Front (facing) wall is the far face of cell d: fills the plane-(d+1) opening of
      // this column. If solid it occludes everything deeper in this column.
      const front = cell.walls[facing];
      if (front !== 0) {
        const k = d + 1;
        const xl = screenX(c - 0.5, k);
        const xr = screenX(c + 0.5, k);
        const yt = topY(k);
        const yb = botY(k);
        quads.push({
          depth: d,
          column: c,
          surface: 'front',
          wallValue: front,
          corners: [
            { x: xl, y: yt },
            { x: xr, y: yt },
            { x: xr, y: yb },
            { x: xl, y: yb },
          ],
          shade: Math.max(0, shade - 0.05),
        });
        break; // occluded beyond a solid front wall
      }
    }
  }

  // Painter order: farthest first; within a depth, side walls before the front face.
  quads.sort((a, b) => b.depth - a.depth || surfaceRank(a.surface) - surfaceRank(b.surface));

  return { quads, facing, maxDepth, sideColumns };
}

function surfaceRank(s: WallSurface): number {
  return s === 'front' ? 1 : 0;
}

function sideQuad(
  depth: number,
  column: number,
  surface: 'left' | 'right',
  wallValue: number,
  u: number,
  screenX: (u: number, k: number) => number,
  topY: (k: number) => number,
  botY: (k: number) => number,
  shade: number,
): WallQuad {
  const xNear = screenX(u, depth);
  const xFar = screenX(u, depth + 1);
  const ytNear = topY(depth);
  const ybNear = botY(depth);
  const ytFar = topY(depth + 1);
  const ybFar = botY(depth + 1);
  // Order corners clockwise from the on-screen top-left. For the left wall the near edge
  // is to the left of the far edge; for the right wall it is to the right. Either way we
  // emit [top-near, top-far, bottom-far, bottom-near] which is a consistent CW loop.
  return {
    depth,
    column,
    surface,
    wallValue,
    corners: [
      { x: xNear, y: ytNear },
      { x: xFar, y: ytFar },
      { x: xFar, y: ybFar },
      { x: xNear, y: ybNear },
    ],
    // Side walls a touch darker than front faces for depth cueing.
    shade: Math.max(0, shade - 0.18),
  };
}
