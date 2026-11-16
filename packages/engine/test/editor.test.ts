import { describe, it, expect } from 'vitest';
import {
  createEmptyModuleMap,
  setWall,
  setFloor,
  setZone,
  placeEntry,
  removeEntry,
  setCellEvent,
  upsertEvent,
  removeEvent,
  serializeModuleMap,
  deserializeModuleMap,
  loadModule,
  runModuleEvent,
  createModuleEventVm,
  resolveEntryPoint,
  Explorer,
  type ModulePackage,
} from '../src/index.js';

describe('createEmptyModuleMap (M5.S3)', () => {
  it('builds a blank grid with every wall open and one default entry point', () => {
    const map = createEmptyModuleMap('Level 1', 3, 2);
    expect(map.width).toBe(3);
    expect(map.height).toBe(2);
    expect(map.cells).toHaveLength(6);
    expect(map.cells.every((c) => c.walls.north === 0 && c.walls.east === 0 && c.walls.south === 0 && c.walls.west === 0)).toBe(true);
    expect(map.entries).toEqual([{ id: 0, x: 0, y: 0, facing: 'north' }]);
    expect(map.events).toEqual([]);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => createEmptyModuleMap('x', 0, 4)).toThrow();
    expect(() => createEmptyModuleMap('x', 4, -1)).toThrow();
  });
});

describe('setWall / setFloor / setZone (M5.S3)', () => {
  const base = createEmptyModuleMap('Level 1', 2, 2);

  it('paints one wall edge without touching the rest of the cell or map', () => {
    const next = setWall(base, 1, 0, 'north', 5);
    expect(next.cells[1].walls).toEqual({ north: 5, east: 0, south: 0, west: 0 });
    // original untouched (pure function)
    expect(base.cells[1].walls.north).toBe(0);
    // untouched cells are unaffected
    expect(next.cells[0].walls.north).toBe(0);
  });

  it('paints a floor tile id', () => {
    const next = setFloor(base, 0, 1, 7);
    expect(next.cells[2].floor).toBe(7);
  });

  it('paints a zone tag into flags', () => {
    const next = setZone(base, 0, 1, 3);
    expect(next.cells[2].flags).toBe(3);
  });

  it('rejects out-of-bounds cells and out-of-range values', () => {
    expect(() => setWall(base, 5, 0, 'north', 1)).toThrow();
    expect(() => setWall(base, 0, 0, 'north', 256)).toThrow();
    expect(() => setWall(base, 0, 0, 'north', -1)).toThrow();
    expect(() => setFloor(base, 0, 0, 256)).toThrow();
    expect(() => setZone(base, 0, 0, -1)).toThrow();
  });
});

describe('placeEntry / removeEntry (M5.S3)', () => {
  const base = createEmptyModuleMap('Level 1', 3, 3);

  it('upserts an entry point by id', () => {
    const next = placeEntry(base, 1, 2, 2, 'south');
    expect(next.entries).toEqual([
      { id: 0, x: 0, y: 0, facing: 'north' },
      { id: 1, x: 2, y: 2, facing: 'south' },
    ]);
    // moving an existing id replaces it, doesn't duplicate
    const moved = placeEntry(next, 1, 1, 1, 'east');
    expect(moved.entries).toEqual([
      { id: 0, x: 0, y: 0, facing: 'north' },
      { id: 1, x: 1, y: 1, facing: 'east' },
    ]);
  });

  it('removes an entry point', () => {
    const withTwo = placeEntry(base, 1, 2, 2, 'south');
    const removed = removeEntry(withTwo, 0);
    expect(removed.entries).toEqual([{ id: 1, x: 2, y: 2, facing: 'south' }]);
  });

  it('rejects an out-of-bounds entry placement', () => {
    expect(() => placeEntry(base, 2, 9, 9, 'north')).toThrow();
  });
});

describe('setCellEvent / upsertEvent / removeEvent (M5.S4)', () => {
  const base = createEmptyModuleMap('Level 1', 3, 3);

  it('links a cell to an event id and unlinks it with 0', () => {
    const linked = setCellEvent(base, 1, 1, 5);
    expect(linked.cells[4].event).toBe(5);
    const unlinked = setCellEvent(linked, 1, 1, 0);
    expect(unlinked.cells[4].event).toBeUndefined();
  });

  it('rejects out-of-bounds cells and out-of-range event ids', () => {
    expect(() => setCellEvent(base, 9, 9, 1)).toThrow();
    expect(() => setCellEvent(base, 0, 0, 256)).toThrow();
    expect(() => setCellEvent(base, 0, 0, -1)).toThrow();
  });

  it('upserts an authored event by id, replacing an existing one rather than duplicating', () => {
    const withOne = upsertEvent(base, { id: 3, type: 'message', body: { text: 'HI' } });
    expect(withOne.events).toHaveLength(1);
    const replaced = upsertEvent(withOne, { id: 3, type: 'message', body: { text: 'BYE' } });
    expect(replaced.events).toHaveLength(1);
    expect(replaced.events[0].body).toEqual({ text: 'BYE' });
  });

  it('rejects an event id outside 1-255', () => {
    expect(() => upsertEvent(base, { id: 0, type: 'message', body: { text: 'X' } })).toThrow();
    expect(() => upsertEvent(base, { id: 256, type: 'message', body: { text: 'X' } })).toThrow();
  });

  it('removes an authored event by id', () => {
    const withTwo = upsertEvent(upsertEvent(base, { id: 1, type: 'message', body: { text: 'A' } }), { id: 2, type: 'message', body: { text: 'B' } });
    const removed = removeEvent(withTwo, 1);
    expect(removed.events.map((e) => e.id)).toEqual([2]);
  });
});

describe('serializeModuleMap / deserializeModuleMap (M5.S3)', () => {
  it('round-trips a map exactly', () => {
    const map = setWall(placeEntry(createEmptyModuleMap('Level 1', 2, 2), 1, 1, 0, 'west'), 0, 0, 'east', 9);
    const json = serializeModuleMap(map);
    const back = deserializeModuleMap(json);
    expect(back).toEqual(map);
  });

  it('rejects malformed JSON and shape/size mismatches', () => {
    expect(() => deserializeModuleMap('not json')).toThrow();
    expect(() => deserializeModuleMap(JSON.stringify({ width: 2, height: 2 }))).toThrow(); // missing cells/entries/events
    expect(() => deserializeModuleMap(JSON.stringify({ name: 'x', width: 2, height: 2, cells: [], entries: [], events: [] }))).toThrow();
  });
});

describe('an authored map loads and plays headlessly (M5.S3 acceptance)', () => {
  it('place walls, save (serialize), reload (deserialize), playtest (walk it via the real engine)', () => {
    // "Place tiles/walls": a 2x1 room with a wall closing off the east edge of (0,0), and a floor
    // tile painted on (1,0), authored purely through the editor functions above.
    let map = createEmptyModuleMap('Author Test', 2, 1);
    map = setWall(map, 0, 0, 'east', 3); // a wall graphic, still passable (0 would be "no wall")
    map = setFloor(map, 1, 0, 4);
    map = setZone(map, 1, 0, 1);
    map = placeEntry(map, 0, 0, 0, 'east');

    // "Save" + "reload": round-trip through the exact persistence pair `apps/author` uses.
    const reloaded = deserializeModuleMap(serializeModuleMap(map));
    expect(reloaded).toEqual(map);

    // "Playtest": load through the real engine path and walk it.
    const pkg: ModulePackage = {
      schema: 1,
      id: 'author-fixture',
      title: 'Author Test',
      ruleset: 'addnd1e',
      maps: [reloaded],
      entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
    };
    const loaded = loadModule(pkg);
    const { map: startMap, entryId } = resolveEntryPoint(loaded, 0);
    const explorer = Explorer.atEntry(startMap, entryId);
    expect(explorer.getPose()).toEqual({ x: 0, y: 0, facing: 'east' });

    // A painted wall graphic (non-zero, no door) blocks movement...
    expect(explorer.canMove('east')).toBe(false);
    const blocked = explorer.forward();
    expect(blocked.moved).toBe(false);

    // ...but a still-open edge (west, never painted) is walkable.
    explorer.setPose({ x: 1, y: 0, facing: 'west' });
    expect(explorer.canMove('west')).toBe(true);
    const step = explorer.forward();
    expect(step.moved).toBe(true);
    expect(explorer.getPose()).toEqual({ x: 0, y: 0, facing: 'west' });
  });
});

describe('an authored event chain fires correctly during playtest (M5.S4 acceptance)', () => {
  it('walking onto the linked cell fires a message that chains into a two-way question', () => {
    // Author a 2-cell corridor. (1,0) is linked to event 1, a text event that chains to event 2, a
    // yes/no question — exactly the "author an event chain, playtest fires it correctly" shape.
    let map = createEmptyModuleMap('Chain Test', 2, 1);
    map = placeEntry(map, 0, 0, 0, 'east');
    map = setCellEvent(map, 1, 0, 1);
    map = upsertEvent(map, { id: 1, type: 'message', body: { text: 'A DOOR AHEAD', chainTo: 2 } });
    map = upsertEvent(
      map,
      { id: 2, type: 'questionYesNo', body: { prompt: 'Open it?', options: [{ label: 'Yes', chainTo: 3 }, { label: 'No' }] } },
    );
    map = upsertEvent(map, { id: 3, type: 'message', body: { text: 'IT CREAKS OPEN' } });

    const pkg: ModulePackage = {
      schema: 1,
      id: 'chain-fixture',
      title: 'Chain Test',
      ruleset: 'addnd1e',
      maps: [map],
      entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
    };
    const loaded = loadModule(pkg);
    const { map: startMap, entryId } = resolveEntryPoint(loaded, 0);
    const explorer = Explorer.atEntry(startMap, entryId);

    const step = explorer.forward();
    expect(step.moved).toBe(true);
    expect(step.event).toBe(1);

    // Playtest fires event 1: it prints and chains into event 2.
    const first = runModuleEvent(loaded, step.event!);
    expect(first.effects).toEqual([expect.objectContaining({ type: 'print', text: 'A DOOR AHEAD' })]);
    expect(first).toMatchObject({ status: 'chain', chainBlockId: 2 });

    // Event 2 pauses for the player's answer; picking "Yes" chains into event 3.
    const vm = createModuleEventVm(loaded, first.chainBlockId!);
    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    const answered = vm.resume(1);
    expect(answered).toMatchObject({ status: 'chain', chainBlockId: 3 });

    const closing = runModuleEvent(loaded, answered.chainBlockId!);
    expect(closing.effects).toEqual([expect.objectContaining({ type: 'print', text: 'IT CREAKS OPEN' })]);
  });
});
