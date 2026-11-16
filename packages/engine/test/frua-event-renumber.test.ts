import { describe, expect, it } from 'vitest';
import { renumberMapEvents } from '../src/module/frua/design.js';
import type { ModuleMap } from '../src/module/types.js';

function fixtureMap(): ModuleMap {
  return {
    name: 'FRUA event target fixture',
    width: 2,
    height: 1,
    cells: [
      { walls: { north: 1, east: 0, south: 1, west: 1 }, event: 1 },
      { walls: { north: 1, east: 1, south: 1, west: 0 } },
    ],
    entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
    events: [
      { id: 1, type: 'message', body: { text: 'INTRO', chainTo: 2 } },
      {
        id: 2,
        onceOnly: true,
        type: 'questionButton',
        body: {
          prompt: 'CHOOSE',
          options: [
            { label: 'FIGHT', chainTo: 3 },
            { label: 'LEAVE', repeatQuestion: true },
          ],
        },
      },
      {
        id: 3,
        type: 'combat',
        body: {
          monsters: [{ monsterId: 7, count: 2, picBlockId: 9 }],
          onVictory: 4,
          onFlee: 5,
        },
      },
      {
        id: 4,
        type: 'utilities',
        body: {
          op: 'store',
          variable: 1,
          value: 2,
          compare: { op: 'eq', value: 2, onTrue: 5, onFalse: 1 },
        },
      },
      { id: 5, type: 'chain', body: { chainTo: 1 } },
      { id: 6, type: 'chain', body: { chainTo: 0 } },
      { id: 7, type: 'utilities', body: { op: 'add', variable: 2, value: 1 } },
    ],
  };
}

describe('renumberMapEvents — nested same-map targets', () => {
  it('shifts text, choice, combat, utilities, and chain targets with their event and cell ids', () => {
    const map = fixtureMap();
    const original = structuredClone(map);
    const shifted = renumberMapEvents(map, 14_000);

    expect(shifted.cells[0].event).toBe(14_001);
    expect(shifted.cells[1].event).toBeUndefined();
    expect(shifted.events.map((event) => event.id)).toEqual([
      14_001, 14_002, 14_003, 14_004, 14_005, 14_006, 14_007,
    ]);

    expect(shifted.events[0].body).toEqual({ text: 'INTRO', chainTo: 14_002 });
    expect(shifted.events[1].body).toEqual({
      prompt: 'CHOOSE',
      options: [
        { label: 'FIGHT', chainTo: 14_003 },
        { label: 'LEAVE', repeatQuestion: true },
      ],
    });
    expect(shifted.events[1].onceOnly).toBe(true);
    expect(shifted.events[2].body).toEqual({
      monsters: [{ monsterId: 7, count: 2, picBlockId: 9 }],
      onVictory: 14_004,
      onFlee: 14_005,
    });
    expect(shifted.events[3].body).toEqual({
      op: 'store',
      variable: 1,
      value: 2,
      compare: { op: 'eq', value: 2, onTrue: 14_005, onFalse: 14_001 },
    });
    expect(shifted.events[4].body).toEqual({ chainTo: 14_001 });
    expect(shifted.events[5].body).toEqual({ chainTo: 14_000 });
    expect(shifted.events[6].body).toEqual({ op: 'add', variable: 2, value: 1 });

    expect(map).toEqual(original);
  });
});
