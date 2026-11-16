/**
 * `ModulePackage` model + loader tests (M5.S1). Hand-authors a minimal module (one 2-cell map,
 * one entrypoint, one event) — no real game data — loads it, and plays it headlessly: walk a
 * cell with `Explorer`, fire the event's compiled ECL block with `EclVm`, and read the effect.
 * Proves an authored module runs through the same world/VM/ruleset path as an original game.
 */
import { describe, it, expect } from 'vitest';
import {
  Explorer,
  loadModule,
  runModuleEvent,
  resolveEntryPoint,
  compileModuleEvent,
  encodeEclString,
  type ModulePackage,
  type MapCell,
} from '../src/index.js';

function openCell(over: Partial<MapCell> = {}): MapCell {
  return { walls: { north: 0, east: 0, south: 0, west: 0 }, ...over };
}

// A 2×1 corridor: (0,0) is the start, (1,0) carries event id 7 ("HELLO GOLDBOX").
function fixtureModule(): ModulePackage {
  return {
    schema: 1,
    id: 'fixture-corridor',
    title: 'Fixture Corridor',
    ruleset: 'addnd1e',
    maps: [
      {
        name: 'corridor',
        width: 2,
        height: 1,
        cells: [openCell(), openCell({ event: 7 })],
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
        events: [{ id: 7, type: 'message', body: { text: 'HELLO GOLDBOX' } }],
      },
    ],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
  };
}

describe('encodeEclString', () => {
  it('round-trips through the real ECL string decoder', async () => {
    const { decodeEclString } = await import('../src/ecl/disassemble.js');
    const packed = encodeEclString('HELLO [GOLDBOX]\\^_');
    expect(decodeEclString(packed, 0, packed.length)).toBe('HELLO [GOLDBOX]\\^_');
  });

  it('rejects characters outside the ECL 6-bit alphabet', () => {
    expect(() => encodeEclString('café')).toThrow(/unsupported character/);
  });
});

describe('compileModuleEvent', () => {
  it('compiles a message event to a real Gen1 ECL block a disassembler recognizes', async () => {
    const { sniffGen1EclBlock } = await import('../src/loaders/eclEncode.js');
    const block = compileModuleEvent({ id: 1, type: 'message', body: { text: 'HI' } });
    expect(sniffGen1EclBlock(block)).toBe(true);
  });
});

describe('loadModule', () => {
  it('resolves the ruleset and adapts maps to GameMap', () => {
    const loaded = loadModule(fixtureModule());
    expect(loaded.ruleset.id).toBe('addnd1e');
    expect(loaded.maps).toHaveLength(1);
    expect(loaded.maps[0]).toMatchObject({ name: 'corridor', width: 2, height: 1 });
    expect(loaded.eventBlocks.size).toBe(1);
  });

  it('throws on an unknown ruleset id', () => {
    const pkg = { ...fixtureModule(), ruleset: 'not-a-real-ruleset' };
    expect(() => loadModule(pkg)).toThrow(/unknown ruleset/);
  });

  it('throws on an entrypoint referencing a missing map entry', () => {
    const pkg = fixtureModule();
    pkg.entrypoints = [{ id: 0, mapIndex: 0, entryId: 99 }];
    expect(() => loadModule(pkg)).toThrow(/missing entry id/);
  });

  it('throws on duplicate event ids across maps', () => {
    const pkg = fixtureModule();
    pkg.maps.push({ ...pkg.maps[0], name: 'corridor-2' });
    expect(() => loadModule(pkg)).toThrow(/duplicate event id/);
  });
});

describe('a hand-authored module loads and plays headlessly (M5.S1 acceptance)', () => {
  it('walks a cell and fires its event through the real Explorer + EclVm path', () => {
    const loaded = loadModule(fixtureModule());
    const { map, entryId } = resolveEntryPoint(loaded, 0);

    const explorer = Explorer.atEntry(map, entryId);
    expect(explorer.getPose()).toEqual({ x: 0, y: 0, facing: 'east' });

    const step = explorer.forward();
    expect(step.moved).toBe(true);
    expect(step.event).toBe(7);

    const result = runModuleEvent(loaded, step.event);
    expect(result.status).toBe('exited');
    expect(result.effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'HELLO GOLDBOX' }),
    ]);
  });
});
