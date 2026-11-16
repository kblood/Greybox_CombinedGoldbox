/**
 * First-person projection tests (M1.S5b). Pure geometry, no game data: hand-authored
 * maps assert that the perspective quads are emitted with correct depth/occlusion,
 * symmetry, painter ordering, and screen bounds. Art is rendered separately, so these
 * tests pin the geometry contract the WALLDEF renderer will draw into.
 */
import { describe, it, expect } from 'vitest';
import {
  projectViewport,
  type GameMap,
  type MapCell,
  type Pose,
  type WallQuad,
} from '../src/index.js';

function cell(over: Partial<MapCell['walls']> = {}): MapCell {
  return { walls: { north: 0, east: 0, south: 0, west: 0, ...over } };
}

/** Build a width×height map from a per-cell wall factory. */
function grid(width: number, height: number, make: (x: number, y: number) => MapCell): GameMap {
  const cells: MapCell[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push(make(x, y));
  return { name: 'vp-test', width, height, cells, entries: [] };
}

const inUnit = (q: WallQuad) =>
  q.corners.every((c) => c.x >= -1e-9 && c.x <= 1 + 1e-9 && c.y >= -1e-9 && c.y <= 1 + 1e-9);

describe('projectViewport', () => {
  it('treats the map edge as a solid boundary (closed cell → only a front wall ahead)', () => {
    // A single fully-open cell; everything around it is out of bounds (solid).
    const map = grid(1, 1, () => cell());
    const pose: Pose = { x: 0, y: 0, facing: 'north' };
    const { quads } = projectViewport(map, pose, { sideColumns: 0, maxDepth: 4 });
    // Centre column only: north is open within the cell, but the cell ahead (0,-1) is OOB
    // → solid, so we get exactly one front wall at depth 1 and nothing deeper.
    const fronts = quads.filter((q) => q.surface === 'front');
    expect(fronts.length).toBe(1);
    expect(fronts[0].depth).toBe(1);
    // No side walls: the single cell's own east/west edges are open.
    expect(quads.every(inUnit)).toBe(true);
  });

  it('renders a straight corridor: side walls at increasing depth, open ahead', () => {
    // 1-wide vertical corridor, walls on east+west of every cell, open north/south.
    const map = grid(1, 6, () => cell({ east: 2, west: 2 }));
    const pose: Pose = { x: 0, y: 5, facing: 'north' };
    const { quads } = projectViewport(map, pose, { sideColumns: 0, maxDepth: 4 });
    const lefts = quads.filter((q) => q.surface === 'left');
    const rights = quads.filter((q) => q.surface === 'right');
    // One left + one right wall per depth 0..3 (corridor is open ahead until the map edge).
    expect(lefts.map((q) => q.depth).sort()).toEqual([0, 1, 2, 3]);
    expect(rights.map((q) => q.depth).sort()).toEqual([0, 1, 2, 3]);
    // The wall code is carried through for the renderer.
    expect(lefts.every((q) => q.wallValue === 2)).toBe(true);
  });

  it('shrinks side walls toward the vanishing point with depth', () => {
    const map = grid(1, 6, () => cell({ east: 2, west: 2 }));
    const pose: Pose = { x: 0, y: 5, facing: 'north' };
    const { quads } = projectViewport(map, pose, { sideColumns: 0, maxDepth: 4 });
    const lefts = quads.filter((q) => q.surface === 'left').sort((a, b) => a.depth - b.depth);
    // Near wall's near edge is wider (smaller x, further from centre 0.5) than far walls.
    const nearX = lefts[0].corners[0].x; // depth-0 near top-left x
    const farX = lefts[3].corners[0].x; // depth-3 near top-left x
    expect(nearX).toBeLessThan(farX);
    expect(farX).toBeLessThan(0.5);
    // Shade dims with depth.
    expect(lefts[0].shade).toBeGreaterThan(lefts[3].shade);
  });

  it('occludes cells behind a solid front wall', () => {
    // Open corridor but a wall on the north edge of the cell 2 ahead blocks the view.
    const map = grid(1, 6, (x, y) => (y === 3 ? cell({ north: 9, east: 2, west: 2 }) : cell({ east: 2, west: 2 })));
    const pose: Pose = { x: 0, y: 5, facing: 'north' };
    const { quads } = projectViewport(map, pose, { sideColumns: 0, maxDepth: 4 });
    // Party at y=5: depth 0→y5, 1→y4, 2→y3 has the north wall. Front wall at depth 2, and
    // no side walls deeper than 2.
    const fronts = quads.filter((q) => q.surface === 'front');
    expect(fronts.length).toBe(1);
    expect(fronts[0].depth).toBe(2);
    expect(quads.every((q) => q.depth <= 2)).toBe(true);
  });

  it('is left/right symmetric for a symmetric corridor', () => {
    const map = grid(1, 6, () => cell({ east: 2, west: 2 }));
    const pose: Pose = { x: 0, y: 5, facing: 'north' };
    const { quads } = projectViewport(map, pose, { sideColumns: 0, maxDepth: 4 });
    const left0 = quads.find((q) => q.surface === 'left' && q.depth === 0)!;
    const right0 = quads.find((q) => q.surface === 'right' && q.depth === 0)!;
    // Mirror about x=0.5: left near-x and right near-x equidistant from centre.
    expect(left0.corners[0].x + right0.corners[0].x).toBeCloseTo(1, 6);
  });

  it('emits quads in painter order (farthest first)', () => {
    const map = grid(1, 6, () => cell({ east: 2, west: 2 }));
    const pose: Pose = { x: 0, y: 5, facing: 'north' };
    const { quads } = projectViewport(map, pose, { sideColumns: 0, maxDepth: 4 });
    for (let i = 1; i < quads.length; i++) {
      expect(quads[i - 1].depth).toBeGreaterThanOrEqual(quads[i].depth);
    }
  });

  it('keeps centre-column corners inside the viewport (side columns clip)', () => {
    const map = grid(3, 6, (x) => cell({ east: x === 2 ? 2 : 0, west: x === 0 ? 2 : 0 }));
    const pose: Pose = { x: 1, y: 5, facing: 'north' };
    const { quads } = projectViewport(map, pose, { sideColumns: 1, maxDepth: 4 });
    expect(quads.length).toBeGreaterThan(0);
    // The centre column always lands within the normalised viewport; peripheral columns
    // may legitimately extend past the edges (the renderer clips them to the canvas).
    expect(quads.filter((q) => q.column === 0).every(inUnit)).toBe(true);
  });

  it('projects consistently for every facing (rotational invariance of a square room)', () => {
    // A 3×3 room walled only on its outer border; from the centre each facing should see
    // the same number of quads.
    const map = grid(3, 3, (x, y) =>
      cell({
        north: y === 0 ? 1 : 0,
        south: y === 2 ? 1 : 0,
        west: x === 0 ? 1 : 0,
        east: x === 2 ? 1 : 0,
      }),
    );
    const counts = (['north', 'east', 'south', 'west'] as const).map(
      (f) => projectViewport(map, { x: 1, y: 1, facing: f }, { sideColumns: 1, maxDepth: 4 }).quads.length,
    );
    expect(new Set(counts).size).toBe(1);
  });
});
