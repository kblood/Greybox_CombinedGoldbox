/**
 * Whole-`ModulePackage` serializer tests (M11.S1) — `module/serialize.ts`. Hand-authors a package
 * with ≥2 maps, a chained pair of events, a populated `ModuleDatabase`, and a custom ruleset id;
 * proves it survives serialize→deserialize structurally AND plays identically afterwards through
 * the real `loadModule`/`Explorer`/`EclVm` path (the M11.S1 acceptance in `BUILD-QUEUE.md`).
 */
import { describe, it, expect } from 'vitest';
import {
  serializeModulePackage,
  deserializeModulePackage,
  graphicSetNames,
  loadModule,
  resolveEntryPoint,
  runEclChain,
  Explorer,
  createEmptyModuleDatabase,
  upsertMonster,
  createRulesetRegistry,
  createDataRuleset,
  type ModulePackage,
  type MapCell,
  type FrameSet,
  type IndexedImage,
} from '../src/index.js';

function openCell(over: Partial<MapCell> = {}): MapCell {
  return { walls: { north: 0, east: 0, south: 0, west: 0 }, ...over };
}

// Two 1×2 rooms joined by an entrypoint each; map 0 cell (1,0) chains event 7 -> event 8 on step.
function fixturePackage(): ModulePackage {
  return {
    schema: 1,
    id: 'fixture-two-room',
    title: 'Fixture Two Room',
    ruleset: 'addnd1e',
    maps: [
      {
        name: 'room-a',
        width: 2,
        height: 1,
        cells: [openCell(), openCell({ event: 7 })],
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
        events: [
          { id: 7, onceOnly: true, type: 'message', body: { text: 'FIRST ROOM', chainTo: 8 } },
          { id: 8, type: 'message', body: { text: 'CHAINED' } },
        ],
      },
      {
        name: 'room-b',
        width: 1,
        height: 2,
        cells: [openCell(), openCell({ event: 9 })],
        entries: [{ id: 1, x: 0, y: 0, facing: 'south' }],
        events: [{
          id: 9,
          type: 'questionButton',
          body: {
            prompt: 'SECOND ROOM',
            options: [{ label: 'STAY', repeatQuestion: true }, { label: 'LEAVE' }],
          },
        }],
      },
    ],
    entrypoints: [
      { id: 0, mapIndex: 0, entryId: 0 },
      { id: 1, mapIndex: 1, entryId: 1 },
    ],
    databases: upsertMonster(createEmptyModuleDatabase(), {
      id: 1,
      name: 'TEST OGRE',
      hitPoints: 20,
      armorClass: 4,
      thac0: 15,
      damage: { count: 1, sides: 8, bonus: 2 },
      xp: 100,
    }),
  };
}

describe('serializeModulePackage / deserializeModulePackage (M11.S1)', () => {
  it('round-trips a package with ≥2 maps, chained events, a populated database, and a custom ruleset id', () => {
    const pkg = fixturePackage();
    const registry = createRulesetRegistry();
    registry.register(createDataRuleset({ id: 'custom-fixture-ruleset', name: 'Custom Fixture', classes: {} }));
    const withCustomRuleset: ModulePackage = { ...pkg, ruleset: 'custom-fixture-ruleset' };

    const json = serializeModulePackage(withCustomRuleset);
    const roundTripped = deserializeModulePackage(json);
    expect(roundTripped).toEqual(withCustomRuleset);

    // Plays identically through the real path both before and after the round trip.
    const before = loadModule(withCustomRuleset, { registry });
    const after = loadModule(roundTripped, { registry });
    expect(after.ruleset.id).toBe(before.ruleset.id);
    expect(after.maps).toEqual(before.maps);
    expect(after.eventBlocks.size).toBe(before.eventBlocks.size);

    const { map, entryId } = resolveEntryPoint(after, 0);
    const explorer = Explorer.atEntry(map, entryId);
    const step = explorer.forward();
    expect(step.moved).toBe(true);
    expect(step.event).toBe(7);
    // Follows the authored chainTo (event 7 -> event 8) the same way a host would.
    const result = runEclChain(step.event, (id) => after.eventBlocks.get(id));
    expect(result.status).toBe('exited');
    expect(result.visited).toEqual([7, 8]);
    expect(result.effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'FIRST ROOM' }),
      expect.objectContaining({ type: 'print', text: 'CHAINED' }),
    ]);
  });

  it('throws on malformed JSON', () => {
    expect(() => deserializeModulePackage('not json')).toThrow(/invalid JSON/);
  });

  it('throws on a well-formed but non-ModulePackage-shaped object', () => {
    expect(() => deserializeModulePackage(JSON.stringify({ hello: 'world' }))).toThrow(/not a ModulePackage-shaped/);
  });

  it('a package with no graphicSets round-trips with no _graphicSets note', () => {
    const json = serializeModulePackage(fixturePackage());
    expect(JSON.parse(json)._graphicSets).toBeUndefined();
    expect(graphicSetNames(json)).toEqual([]);
  });

  it.each([
    ['null container', null],
    ['object container', {}],
    ['string container', 'art'],
    ['null set', [null]],
    ['array set', [[]]],
    ['primitive set', ['art']],
    ['missing set fields', [{}]],
    ['non-string name', [{ name: 1, kind: 'unknown', frames: [] }]],
    ['non-string kind', [{ name: 'ART', kind: null, frames: [] }]],
    ['missing frames', [{ name: 'ART', kind: 'unknown' }]],
    ['non-array frames', [{ name: 'ART', kind: 'unknown', frames: {} }]],
  ])('rejects malformed embedded art: %s', (_label, _graphicSets) => {
    expect(() => deserializeModulePackage(JSON.stringify({ ...fixturePackage(), _graphicSets })))
      .toThrow(new Error('deserializeModulePackage: not a ModulePackage-shaped object'));
  });

  it.each([
    ['null frame', null],
    ['object frame', {}],
    ['empty tuple', []],
    ['short tuple', [0]],
    ['long tuple', [0, { indices: '' }, 'extra']],
    ['non-number id', ['0', { indices: '' }]],
    ['null image', [0, null]],
    ['array image', [0, []]],
    ['primitive image', [0, 'image']],
    ['missing indices', [0, {}]],
    ['null indices', [0, { indices: null }]],
    ['numeric indices', [0, { indices: 1 }]],
    ['array indices', [0, { indices: [] }]],
    ['object indices', [0, { indices: {} }]],
  ])('rejects malformed embedded frame: %s', (_label, frame) => {
    const _graphicSets = [{ name: 'ART', kind: 'unknown', frames: [frame] }];
    expect(() => deserializeModulePackage(JSON.stringify({ ...fixturePackage(), _graphicSets })))
      .toThrow(new Error('deserializeModulePackage: not a ModulePackage-shaped object'));
  });

  it('accepts empty art payloads and leaves unrelated metadata unrestricted', () => {
    const pkg = fixturePackage();
    expect(deserializeModulePackage(JSON.stringify({ ...pkg, _graphicSets: [] }))).toEqual(pkg);
    const image = { indices: '', palette: null, transparentIndex: null, extra: 'retained' };
    const result = deserializeModulePackage(JSON.stringify({
      ...pkg,
      extra: 'package metadata',
      _graphicSets: [
        { name: '', kind: '', frames: [] },
        { name: 'ART', kind: 'future-kind', frames: [[0, image]], extra: true },
      ],
    }));
    expect(result).toMatchObject({ extra: 'package metadata' });
    expect(result.graphicSets).toEqual([
      { name: '', kind: '', frames: new Map() },
      { name: 'ART', kind: 'future-kind', frames: new Map([[0, { ...image, indices: new Uint8Array() }]]) },
    ]);
  });

  // M11.S4 — graphicSets is EMBEDDED (not dropped/referenced): pixel bytes must survive
  // byte-identically through JSON, including edge cases the base64 codec must not corrupt
  // (non-multiple-of-3 lengths, a null palette entry mid-array, transparentIndex: null).
  it('embeds graphicSets and round-trips pixel data byte-identically', () => {
    const frame0: IndexedImage = {
      width: 3,
      height: 2,
      // 6 bytes = 2 base64 groups exactly (tests the "no padding" branch too, alongside frame1).
      indices: Uint8Array.from([0, 1, 2, 253, 254, 255]),
      xOffset: -4,
      yOffset: 7,
      transparentIndex: 255,
      palette: {
        colors: [
          { r: 0, g: 0, b: 0 },
          null,
          { r: 255, g: 128, b: 64 },
        ],
        source: 'hlib-range',
        firstColor: 0,
        count: 3,
      },
      encoding: 'raw',
    };
    // 5 bytes = not a multiple of 3 (exercises the base64 padding branches), opaque image.
    const frame7: IndexedImage = {
      width: 5,
      height: 1,
      indices: Uint8Array.from([9, 8, 7, 6, 5]),
      xOffset: 0,
      yOffset: 0,
      transparentIndex: null,
      palette: null,
    };
    const bigpic: FrameSet = { name: 'BIGPIC', kind: 'bigpic', frames: new Map([[0, frame0], [7, frame7]]) };
    const empty: FrameSet = { name: 'EMPTY', kind: 'unknown', frames: new Map() };
    const pkg: ModulePackage = { ...fixturePackage(), graphicSets: [bigpic, empty] };

    const json = serializeModulePackage(pkg);
    expect(Array.isArray(JSON.parse(json)._graphicSets)).toBe(true);
    expect(graphicSetNames(json)).toEqual(['BIGPIC', 'EMPTY']);

    const roundTripped = deserializeModulePackage(json);
    expect(roundTripped.graphicSets).toHaveLength(2);
    const [rtBigpic, rtEmpty] = roundTripped.graphicSets!;
    expect(rtBigpic.name).toBe('BIGPIC');
    expect(rtBigpic.kind).toBe('bigpic');
    expect(rtBigpic.frames.size).toBe(2);
    expect(rtBigpic.frames.get(0)).toEqual(frame0);
    expect(rtBigpic.frames.get(7)).toEqual(frame7);
    expect(rtEmpty.frames.size).toBe(0);

    // Still loads and plays — art is cosmetic to the load/play path.
    expect(() => loadModule(roundTripped)).not.toThrow();
  });
});
