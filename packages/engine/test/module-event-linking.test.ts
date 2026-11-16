import { describe, expect, it } from 'vitest';
import {
  EclVm,
  compileTextEvent,
  createModuleEventVm,
  loadModule,
  runModuleEvent,
  type ModuleEvent,
  type ModuleMap,
  type ModulePackage,
} from '../src/index.js';

function map(name: string, events: ModuleEvent[]): ModuleMap {
  return {
    name,
    width: 1,
    height: 1,
    cells: [{
      walls: { north: 0, east: 0, south: 0, west: 0 },
      doors: { north: 0, east: 0, south: 0, west: 0 },
      flags: 0,
    }],
    entries: [{ id: 0, x: 0, y: 0, facing: 'north' }],
    events,
  };
}

function pkg(maps: ModuleMap[]): ModulePackage {
  return {
    schema: 1,
    id: 'event-link-test',
    title: 'Event link test',
    ruleset: 'addnd1e',
    maps,
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
  };
}

describe('module event link relocation', () => {
  it('keeps direct compiler calls identity-encoded', () => {
    const result = new EclVm(compileTextEvent({ text: 'DIRECT', chainTo: 42 })).run();
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 42 });
    expect(() => compileTextEvent({ text: 'TOO FAR', chainTo: 1002 })).toThrow(/0-255/);
  });

  it('encodes a high global target as one byte and translates run() back to the global id', () => {
    const loaded = loadModule(pkg([map('high ids', [
      { id: 1001, type: 'message', body: { text: 'FIRST', chainTo: 1002 } },
      { id: 1002, type: 'message', body: { text: 'SECOND' } },
    ])]));

    expect([...loaded.eventBlocks.keys()]).toEqual([1001, 1002]);
    const raw = new EclVm(loaded.eventBlocks.get(1001)!).run();
    expect(raw.status).toBe('chain');
    expect(raw.chainBlockId).toBeGreaterThanOrEqual(1);
    expect(raw.chainBlockId).toBeLessThanOrEqual(255);
    expect(raw.chainBlockId).not.toBe(1002);
    expect(loaded.eventChainLinks.get(1001)?.get(raw.chainBlockId!)).toBe(1002);

    expect(runModuleEvent(loaded, 1001)).toMatchObject({ status: 'chain', chainBlockId: 1002 });
    expect(runModuleEvent(loaded, 1002).effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'SECOND' }),
    ]);
  });

  it('resolves colliding preferred tokens correctly across resume()', () => {
    const loaded = loadModule(pkg([map('collision', [
      {
        id: 1001,
        type: 'questionButton',
        body: {
          prompt: 'WHICH?',
          options: [
            { label: 'HIGH', chainTo: 1002 },
            { label: 'LOW', chainTo: 1 },
          ],
        },
      },
      { id: 1002, type: 'message', body: { text: 'HIGH TARGET' } },
      { id: 1, type: 'message', body: { text: 'LOW TARGET' } },
    ])]));

    // The high target takes the first free token (1), so global target 1 must relocate to token 2.
    expect(loaded.eventChainLinks.get(1001)).toEqual(new Map([[1, 1002], [2, 1]]));

    const high = createModuleEventVm(loaded, 1001);
    expect(high.run().status).toBe('awaiting-input');
    expect(high.resume(1)).toMatchObject({ status: 'chain', chainBlockId: 1002 });

    const low = createModuleEventVm(loaded, 1001);
    expect(low.run().status).toBe('awaiting-input');
    expect(low.resume(2)).toMatchObject({ status: 'chain', chainBlockId: 1 });
  });

  it('relocates high targets for combat, utilities, and pure-chain event shapes', () => {
    const loaded = loadModule(pkg([map('all shapes', [
      {
        id: 1001,
        type: 'combat',
        body: { monsters: [], onVictory: 2001, onDefeat: 2002, onFlee: 2003 },
      },
      {
        id: 1002,
        type: 'utilities',
        body: { op: 'store', variable: 1, value: 7, compare: { op: 'eq', value: 7, onTrue: 2001, onFalse: 2002 } },
      },
      { id: 1003, type: 'chain', body: { chainTo: 2003 } },
      { id: 2001, type: 'message', body: { text: 'VICTORY' } },
      { id: 2002, type: 'message', body: { text: 'DEFEAT' } },
      { id: 2003, type: 'message', body: { text: 'FLEE' } },
    ])]));

    const combat = createModuleEventVm(loaded, 1001);
    expect(combat.run().status).toBe('combat');
    expect(combat.resume(0, { combatOutcome: 'victory' })).toMatchObject({ status: 'chain', chainBlockId: 2001 });
    expect(runModuleEvent(loaded, 1002)).toMatchObject({ status: 'chain', chainBlockId: 2001 });
    expect(runModuleEvent(loaded, 1003)).toMatchObject({ status: 'chain', chainBlockId: 2003 });
  });

  it('preserves identity links for ordinary authored ids', () => {
    const loaded = loadModule(pkg([map('authored', [
      { id: 7, type: 'message', body: { text: 'FIRST', chainTo: 8 } },
      { id: 8, type: 'message', body: { text: 'SECOND' } },
    ])]));

    expect(loaded.eventChainLinks.get(7)).toEqual(new Map([[8, 8]]));
    expect(runModuleEvent(loaded, 7)).toMatchObject({ status: 'chain', chainBlockId: 8 });
  });

  it('rejects dangling targets during loading', () => {
    expect(() => loadModule(pkg([map('dangling', [
      { id: 7, type: 'message', body: { text: 'FIRST', chainTo: 99 } },
    ])]))).toThrow(/event 7 has dangling chain target 99/);
  });

  it('rejects implicit cross-map chains', () => {
    expect(() => loadModule(pkg([
      map('source', [{ id: 7, type: 'message', body: { text: 'FIRST', chainTo: 1001 } }]),
      map('other', [{ id: 1001, type: 'message', body: { text: 'OTHER MAP' } }]),
    ]))).toThrow(/event 7.*cross-map chain target 1001.*other/);
  });
});
