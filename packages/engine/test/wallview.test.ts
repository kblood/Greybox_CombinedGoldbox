/**
 * First-person cell-walk tests (M1.S5c). The planWallView golden is the worked example in
 * docs/engine/research/firstperson-wall-walk-cok.md §4 (party facing North, a wall one cell
 * ahead and walls on both sides of the party cell) — its placement table is reproduced
 * verbatim. Plus wallType off-map semantics and a composeWallView expansion check.
 */
import { describe, it, expect } from 'vitest';
import type { Direction, GameMap, MapCell } from '../src/index.js';
import { planWallView, composeWallView, wallType } from '../src/index.js';

/** Build an all-open 16×16 map, then apply per-cell wall overrides. */
function makeMap(walls: { x: number; y: number; dir: Direction; slot: number }[] = []): GameMap {
  const cells: MapCell[] = [];
  for (let i = 0; i < 256; i++) {
    cells.push({ walls: { north: 0, east: 0, south: 0, west: 0 }, floor: 0, flags: 0 });
  }
  for (const w of walls) cells[w.y * 16 + w.x].walls[w.dir] = w.slot;
  return { name: 't', width: 16, height: 16, cells, entries: [], sharedEdges: false };
}

describe('wallType — off-map semantics', () => {
  it('reads an in-map edge directly', () => {
    const map = makeMap([{ x: 8, y: 7, dir: 'north', slot: 1 }]);
    expect(wallType(map, 0 /* N */, 7, 8, 5)).toBe(1);
    expect(wallType(map, 2 /* E */, 7, 8, 5)).toBe(0);
  });

  it('returns 0 (open) off-map only on ECL block 0 or 10', () => {
    const map = makeMap();
    expect(wallType(map, 0, -1, 8, 0)).toBe(0); // off top, block 0 → open
    expect(wallType(map, 0, -1, 8, 10)).toBe(0); // block 10 → open
  });

  it('clamp-wraps off-map coords to the opposite edge on a normal block', () => {
    // y = -1 wraps to y = 15; put a north wall there and confirm the wrapped read finds it.
    const map = makeMap([{ x: 8, y: 15, dir: 'north', slot: 3 }]);
    expect(wallType(map, 0, -1, 8, 5)).toBe(3); // -1 → 15
    // x = 16 wraps to x = 0.
    const map2 = makeMap([{ x: 0, y: 4, dir: 'east', slot: 2 }]);
    expect(wallType(map2, 2, 4, 16, 5)).toBe(2); // 16 → 0
  });
});

describe('planWallView — §4 worked example (facing North, wall ahead + both sides)', () => {
  // Cell (8,7) north wall (one ahead); party cell (8,8) west + east walls. Everything else open.
  const map = makeMap([
    { x: 8, y: 7, dir: 'north', slot: 1 },
    { x: 8, y: 8, dir: 'west', slot: 1 },
    { x: 8, y: 8, dir: 'east', slot: 1 },
  ]);

  it('schedules exactly the four §4 placements in paint order', () => {
    const plan = planWallView(map, { px: 8, py: 8, facing: 0, eclBlockId: 5 });
    expect(plan).toEqual([
      { pieceIdx: 3, slot: 1, colStart: 4, rowStart: 3 }, // mid front
      { pieceIdx: 3, slot: 1, colStart: 4, rowStart: 3 }, // mid front (focus drawn twice)
      { pieceIdx: 7, slot: 1, colStart: 0, rowStart: 0 }, // near left
      { pieceIdx: 8, slot: 1, colStart: 9, rowStart: 0 }, // near right
    ]);
  });

  it('draws nothing in an entirely open map', () => {
    const plan = planWallView(makeMap(), { px: 8, py: 8, facing: 0, eclBlockId: 5 });
    expect(plan).toHaveLength(0);
  });

  it('adds the in-your-face near front (piece 6, twice) when the party cell has a front wall', () => {
    const m = makeMap([{ x: 8, y: 8, dir: 'north', slot: 1 }]);
    const plan = planWallView(m, { px: 8, py: 8, facing: 0, eclBlockId: 5 });
    // Both near scans hit the party cell at var_12=0 → piece 6 at colBase 2, rowBase 1, twice.
    expect(plan).toEqual([
      { pieceIdx: 6, slot: 1, colStart: 2, rowStart: 1 },
      { pieceIdx: 6, slot: 1, colStart: 2, rowStart: 1 },
    ]);
  });
});

describe('composeWallView — expands placements to tile blits', () => {
  it('expands the §4 plan into the expected tile count via readId', () => {
    const map = makeMap([
      { x: 8, y: 7, dir: 'north', slot: 1 },
      { x: 8, y: 8, dir: 'west', slot: 1 },
      { x: 8, y: 8, dir: 'east', slot: 1 },
    ]);
    // readId returns a fixed in-range tile id (0x30 → routeTileId set 1).
    const blits = composeWallView(map, { px: 8, py: 8, facing: 0, eclBlockId: 5 }, () => 0x30);
    // 2×(piece3: 3×4=12) + (piece7: 2×11=22) + (piece8: 2×11=22) = 24+22+22 = 68, all in-clip.
    expect(blits).toHaveLength(68);
    expect(blits.every((b) => b.set === 1)).toBe(true);
    // Painter order: the two mid-front runs come before the near side walls.
    expect(blits[0].py).toBe((3 + 3) * 8); // mid front rowStart 3 → y 48
    expect(blits[24].px).toBe((0 + 3) * 8); // first near-left tile → x 24
  });
});
