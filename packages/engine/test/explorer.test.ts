/**
 * Exploration/movement core tests (M1.S5 logic). Pure, no game data: builds a tiny
 * hand-authored GameMap and asserts turning, forward/back collision against walls and
 * grid edges, strafing, and event surfacing.
 */
import { describe, it, expect } from 'vitest';
import { Explorer, markMapEdgeExits, type GameMap, type MapCell, type Direction, type EdgeExit } from '../src/index.js';

function openCell(over: Partial<MapCell> = {}): MapCell {
  return { walls: { north: 0, east: 0, south: 0, west: 0 }, ...over };
}

// A 3×3 open room. Outer movement is bounded by the grid edge. We add one interior
// wall on the east edge of the centre cell (1,1) and an event on (2,0).
function room(): GameMap {
  const cells: MapCell[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) cells.push(openCell());
  }
  const at = (x: number, y: number) => cells[y * 3 + x];
  at(1, 1).walls.east = 5; // wall id 5 on the centre cell's east edge
  at(2, 0).event = 42; // event on top-right cell
  return {
    name: 'test-room',
    width: 3,
    height: 3,
    cells,
    entries: [{ id: 0, x: 1, y: 1, facing: 'north' }],
  };
}

describe('Explorer', () => {
  it('starts at the named entry', () => {
    const e = Explorer.atEntry(room());
    expect(e.getPose()).toEqual({ x: 1, y: 1, facing: 'north' });
  });

  it('rejects an out-of-bounds start', () => {
    expect(() => new Explorer(room(), { x: 9, y: 9, facing: 'north' })).toThrow(/outside/);
  });

  it('rejects fractional grid poses without mutating the current pose', () => {
    expect(() => new Explorer(room(), { x: 1.5, y: 1, facing: 'north' })).toThrow(/outside/);
    const e = Explorer.atEntry(room());
    expect(() => e.setPose({ x: 1, y: 1.5, facing: 'east' })).toThrow(/outside/);
    expect(e.getPose()).toEqual({ x: 1, y: 1, facing: 'north' });
  });

  it('turns clockwise / counter-clockwise / around', () => {
    const e = Explorer.atEntry(room());
    const seq: Direction[] = [];
    seq.push(e.turnRight()); // north -> east
    seq.push(e.turnRight()); // east -> south
    seq.push(e.turnLeft()); // south -> east
    seq.push(e.turnAround()); // east -> west
    expect(seq).toEqual(['east', 'south', 'east', 'west']);
  });

  it('moves forward into an open cell and reports its event', () => {
    const e = new Explorer(room(), { x: 1, y: 2, facing: 'north' });
    const r = e.forward(); // (1,2) -> (1,1)
    expect(r.moved).toBe(true);
    expect(r.pose).toEqual({ x: 1, y: 1, facing: 'north' });
    expect(r.event).toBe(0);
  });

  it('is blocked by a wall on the leaving edge', () => {
    const e = new Explorer(room(), { x: 1, y: 1, facing: 'east' });
    expect(e.canMove('east')).toBe(false);
    const r = e.forward(); // east edge of (1,1) is wall 5
    expect(r.moved).toBe(false);
    expect(r.blocked).toBe('wall');
    expect(r.pose).toEqual({ x: 1, y: 1, facing: 'east' }); // unchanged
  });

  it('steps through a walled edge that carries a door flag', () => {
    // Same centre cell (1,1) east wall 5, but now flagged as a door (flag 1):
    // the wall graphic stays, yet the party can walk through it.
    const m = room();
    const centre = m.cells[1 * 3 + 1];
    centre.doors = { north: 0, east: 1, south: 0, west: 0 };
    const e = new Explorer(m, { x: 1, y: 1, facing: 'east' });
    expect(e.canMove('east')).toBe(true);
    const r = e.forward();
    expect(r.moved).toBe(true);
    expect(r.pose).toEqual({ x: 2, y: 1, facing: 'east' });
  });

  it('treats a gateway flag (2) as passable too', () => {
    const m = room();
    const centre = m.cells[1 * 3 + 1];
    centre.doors = { north: 0, east: 2, south: 0, west: 0 };
    const e = new Explorer(m, { x: 1, y: 1, facing: 'east' });
    expect(e.canMove('east')).toBe(true);
    expect(e.forward().moved).toBe(true);
  });

  it('still blocks a walled edge with no door flag', () => {
    // A door flag on a DIFFERENT edge must not open the walled east edge.
    const m = room();
    const centre = m.cells[1 * 3 + 1];
    centre.doors = { north: 1, east: 0, south: 0, west: 0 };
    const e = new Explorer(m, { x: 1, y: 1, facing: 'east' });
    expect(e.canMove('east')).toBe(false);
    expect(e.forward().blocked).toBe('wall');
  });

  it('is blocked by the grid edge', () => {
    const e = new Explorer(room(), { x: 1, y: 0, facing: 'north' });
    const r = e.forward(); // would leave the top of the grid
    expect(r.moved).toBe(false);
    expect(r.blocked).toBe('edge');
  });

  it('backward steps opposite to facing without turning', () => {
    const e = new Explorer(room(), { x: 1, y: 1, facing: 'north' });
    const r = e.backward(); // facing north, back = south -> (1,2)
    expect(r.moved).toBe(true);
    expect(r.pose).toEqual({ x: 1, y: 2, facing: 'north' });
  });

  it('strafes relative to facing and surfaces the destination event', () => {
    // Stand at (1,0) facing north; strafe right = east -> (2,0) which has event 42.
    const e = new Explorer(room(), { x: 1, y: 0, facing: 'north' });
    const r = e.stepRight();
    expect(r.moved).toBe(true);
    expect(r.pose).toEqual({ x: 2, y: 0, facing: 'north' });
    expect(r.event).toBe(42);
    expect(e.currentEvent()).toBe(42);
  });

  it('walks a path and lands where expected', () => {
    // From (0,2) facing north, go forward twice to (0,0), turn right, forward twice to (2,0).
    const e = new Explorer(room(), { x: 0, y: 2, facing: 'north' });
    expect(e.forward().pose.y).toBe(1);
    expect(e.forward().pose.y).toBe(0);
    e.turnRight();
    expect(e.forward().pose.x).toBe(1);
    const last = e.forward();
    expect(last.pose).toEqual({ x: 2, y: 0, facing: 'east' });
    expect(last.event).toBe(42);
  });
});

// General map-edge ECL-dispatch hook (BUILD-QUEUE.md's "no ECL dispatch hook for a map-edge step
// at all" gap, closed here at the engine level): `MapCell.edgeExits`/`StepResult.edgeExit` let a
// host detect a `blocked: 'edge'` bump that is meant to dispatch something (a "DO YOU WISH TO
// LEAVE?" prompt, in CoK's proven case) — game/profile-agnostic, no ECL knowledge in `Explorer`
// itself. See `packages/engine/src/world/explorer.ts`'s `markMapEdgeExits` and
// `docs/engine/research/persistent-natural-routes.md`'s "CoK's Fourth Route (Town)".
describe('Explorer — edge-of-map ECL exit hook', () => {
  it('a plain grid-edge bump has no edgeExit when the map declares none (pre-existing behavior unchanged)', () => {
    const e = new Explorer(room(), { x: 1, y: 0, facing: 'north' });
    const r = e.forward();
    expect(r.blocked).toBe('edge');
    expect(r.edgeExit).toBeUndefined();
  });

  it('surfaces a directly-set MapCell.edgeExits entry on the matching blocked edge, not on other directions', () => {
    const m = room();
    const exit: EdgeExit = { kind: 'vm_run_1', meta: { seedMemory: { 0x7ed5: 1 } } };
    const top = m.cells[0 * 3 + 1]!; // (1,0)
    top.edgeExits = { north: exit };
    const e = new Explorer(m, { x: 1, y: 0, facing: 'north' });
    const north = e.forward();
    expect(north.blocked).toBe('edge');
    expect(north.edgeExit).toEqual(exit);

    // Same cell, a different outward direction with no declared exit: no edgeExit surfaced.
    const e2 = new Explorer(m, { x: 0, y: 0, facing: 'west' });
    const west = e2.forward();
    expect(west.blocked).toBe('edge');
    expect(west.edgeExit).toBeUndefined();
  });

  it('never surfaces edgeExit on a wall block, even if the cell also declares one (edge-only hook)', () => {
    const m = room();
    const centre = m.cells[1 * 3 + 1]!; // (1,1), walls.east = 5 (see room())
    centre.edgeExits = { east: { kind: 'vm_run_1' } };
    const e = new Explorer(m, { x: 1, y: 1, facing: 'east' });
    const r = e.forward();
    expect(r.blocked).toBe('wall');
    expect(r.edgeExit).toBeUndefined();
  });

  it('markMapEdgeExits decorates every boundary cell/direction, not interior edges', () => {
    const m = room();
    const exit: EdgeExit = { kind: 'vm_run_1' };
    markMapEdgeExits(m, exit);

    // Every corner carries exits on its two outward directions.
    expect(m.cells[0]!.edgeExits).toEqual({ north: exit, west: exit }); // (0,0)
    const topRight = m.cells[0 * 3 + 2]!; // (2,0)
    expect(topRight.edgeExits).toEqual({ north: exit, east: exit });
    const bottomLeft = m.cells[2 * 3 + 0]!; // (0,2)
    expect(bottomLeft.edgeExits).toEqual({ south: exit, west: exit });

    // A pure edge (non-corner) cell carries exactly one outward direction.
    const topMid = m.cells[0 * 3 + 1]!; // (1,0)
    expect(topMid.edgeExits).toEqual({ north: exit });

    // The interior centre cell touches no grid boundary: no edgeExits at all.
    const centre = m.cells[1 * 3 + 1]!; // (1,1)
    expect(centre.edgeExits).toBeUndefined();

    // Live proof: walking off any of the four sides now surfaces the exit.
    expect(new Explorer(m, { x: 1, y: 0, facing: 'north' }).forward().edgeExit).toEqual(exit);
    expect(new Explorer(m, { x: 2, y: 1, facing: 'east' }).forward().edgeExit).toEqual(exit);
    expect(new Explorer(m, { x: 1, y: 2, facing: 'south' }).forward().edgeExit).toEqual(exit);
    expect(new Explorer(m, { x: 0, y: 1, facing: 'west' }).forward().edgeExit).toEqual(exit);
  });

  it('markMapEdgeExits is idempotent/overwritable — a second call replaces the prior descriptor', () => {
    const m = room();
    markMapEdgeExits(m, { kind: 'vm_run_1' });
    markMapEdgeExits(m, { kind: 'wilderness_hub' });
    const r = new Explorer(m, { x: 1, y: 0, facing: 'north' }).forward();
    expect(r.edgeExit).toEqual({ kind: 'wilderness_hub' });
  });
});

describe('Explorer — step game-time (ovr015)', () => {
  it('a normal step costs 1 game-minute; a blocked step costs none', () => {
    const e = new Explorer(room(), { x: 1, y: 2, facing: 'north' });
    expect(e.isCareful()).toBe(false);
    expect(e.forward().timeMinutes).toBe(1); // (1,2)->(1,1)
    // a blocked step (walled east edge of the centre cell) advances no time
    const blocked = new Explorer(room(), { x: 1, y: 1, facing: 'east' }).forward();
    expect(blocked.moved).toBe(false);
    expect(blocked.timeMinutes).toBe(0);
  });

  it('a careful/search step costs 10 game-minutes', () => {
    const e = new Explorer(room(), { x: 1, y: 2, facing: 'north' });
    e.setCareful(true);
    expect(e.isCareful()).toBe(true);
    expect(e.forward().timeMinutes).toBe(10);
  });
});

describe('Explorer — door bits persist in the GEO cell (ovr015 MapSetDoorUnlocked)', () => {
  it('persists an opened door across leaving and re-entering the cell', () => {
    const m = room();
    const e = new Explorer(m, { x: 1, y: 1, facing: 'north' });
    expect(e.isDoorOpen('east')).toBe(false);
    e.openDoor('east');
    expect(e.isDoorOpen('east')).toBe(true);
    // leave to (1,0) and come back to (1,1): the bit is stored on the cell, not transient
    e.forward(); // (1,1)->(1,0)
    e.turnAround();
    e.forward(); // (1,0)->(1,1)
    expect(e.getPose()).toMatchObject({ x: 1, y: 1 });
    expect(e.isDoorOpen('east')).toBe(true);
    // and it lives on the underlying map cell
    expect(m.cells[1 * 3 + 1].doorsOpen?.east).toBe(true);
    e.closeDoor('east');
    expect(e.isDoorOpen('east')).toBe(false);
  });

  it('door bits are independent per direction and per cell', () => {
    const m = room();
    const e = new Explorer(m, { x: 0, y: 0, facing: 'north' });
    e.openDoor('south');
    expect(e.isDoorOpen('south')).toBe(true);
    expect(e.isDoorOpen('east')).toBe(false);
    expect(e.isDoorOpen('south', { x: 2, y: 2 })).toBe(false);
  });
});

describe('Explorer — per-tile door-interaction permissions (ovr015)', () => {
  it('grants one bash/pick/knock per tile and re-grants on each move', () => {
    const e = new Explorer(room(), { x: 1, y: 2, facing: 'north' });
    expect(e.getDoorAttempts()).toEqual({ bash: true, pick: true, knock: true });
    expect(e.useDoorAttempt('bash')).toBe(true);
    expect(e.useDoorAttempt('bash')).toBe(false); // already spent this tile
    expect(e.getDoorAttempts().bash).toBe(false);
    e.forward(); // step to a new tile re-grants attempts
    expect(e.getDoorAttempts()).toEqual({ bash: true, pick: true, knock: true });
  });
});
