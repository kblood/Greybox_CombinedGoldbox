import { describe, expect, it } from 'vitest';
import {
  ModuleEventRuntime,
  loadModule,
  type ModulePackage,
} from '../src/index.js';

function fixture(): ModulePackage {
  return {
    schema: 1,
    id: 'runtime-fixture',
    title: 'Runtime Fixture',
    ruleset: 'addnd1e',
    maps: [{
      name: 'map',
      width: 2,
      height: 1,
      cells: [
        { walls: { north: 0, east: 0, south: 0, west: 0 }, event: 1 },
        { walls: { north: 0, east: 0, south: 0, west: 0 }, event: 1 },
      ],
      entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
      events: [
        {
          id: 1,
          onceOnly: true,
          type: 'questionButton',
          body: {
            prompt: 'ACTION?',
            options: [
              { label: 'FIGHT', chainTo: 2, repeatQuestion: true },
              { label: 'LEAVE' },
            ],
          },
        },
        {
          id: 2,
          type: 'combat',
          body: {
            monsters: [{ monsterId: 7, count: 1, picBlockId: 9 }],
            onVictory: 3,
          },
        },
        { id: 3, onceOnly: true, type: 'message', body: { text: 'VICTORY' } },
        { id: 4, type: 'message', body: { text: 'REPEATABLE' } },
        { id: 5, type: 'message', body: { text: 'PRELUDE', chainTo: 3 } },
        {
          id: 6,
          type: 'message',
          body: { text: 'SUPPORTED PRELUDE', chainTo: 7 },
        },
        {
          id: 7,
          type: 'giveTreasure',
          unsupported: {
            sourceFormat: 'FRUA',
            sourceEventSlot: 45,
            sourceType: 3,
            sourceTypeName: 'Give Treasure',
          },
          body: { text: '' },
        },
      ],
    }],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
  };
}

function renumberedRewardFixture(sourceBacked = false): ModulePackage {
  return {
    schema: 1,
    id: 'renumbered-reward-fixture',
    title: 'Renumbered Reward Fixture',
    ruleset: 'addnd1e',
    maps: [{
      name: 'reward-map',
      width: 1,
      height: 1,
      cells: [{ walls: { north: 0, east: 0, south: 0, west: 0 }, event: 1014 }],
      entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
      events: [
        {
          id: 1014,
          onceOnly: true,
          type: 'message',
          body: { text: 'EVENT14 BOX1', additionalTexts: ['EVENT14 BOX2'], chainTo: 1045 },
        },
        {
          id: 1045,
          onceOnly: true,
          type: 'giveTreasure',
          body: {
            platinum: 125,
            gems: 3,
            jewelry: 5,
            items: [96, 246, 80, 80],
            itemsIdentified: false,
            ...(sourceBacked ? {
              source: {
                format: 'frua' as const,
                sourceEventSlot: 45,
                itemDatSourceName: 'DISK1/ITEM.DAT',
                itemsDatSourceName: 'DISK1/ITEMS.DAT',
              },
            } : {}),
            chainTo: 1046,
          },
        },
        {
          id: 1046,
          type: 'message',
          body: {
            text: 'EVENT46 BOX1',
            additionalTexts: ['EVENT46 BOX2', 'EVENT46 BOX3'],
          },
        },
      ],
    }],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
  };
}

describe('ModuleEventRuntime', () => {
  it('carries a repeat continuation through combat and consumes every once-only source globally', () => {
    const runtime = new ModuleEventRuntime(loadModule(fixture()));
    expect(runtime.fire(1).status).toBe('awaiting-input');
    expect(() => runtime.snapshot()).toThrow(/cannot save while an event is awaiting input/);

    const combat = runtime.resumeChoice(1);
    expect(combat).toMatchObject({ status: 'combat', eventId: 2 });
    expect(() => runtime.snapshot()).toThrow(/cannot save while an event is awaiting input/);

    const repeated = runtime.resumeCombat('victory');
    expect(repeated.status).toBe('awaiting-input');
    expect(repeated.eventId).toBe(1);
    expect(repeated.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
      'VICTORY', 'ACTION?', '1) FIGHT', '2) LEAVE',
    ]);
    expect(runtime.isConsumed(1)).toBe(true);
    expect(runtime.isConsumed(3)).toBe(true);

    expect(runtime.resumeChoice(2).status).toBe('exited');
    expect(runtime.fire(1).status).toBe('consumed');
  });

  it('keeps old events repeatable and filters restored ids to this package\'s once-only events', () => {
    const loaded = loadModule(fixture());
    const repeatable = new ModuleEventRuntime(loaded);
    expect(repeatable.fire(4).effects).toContainEqual(expect.objectContaining({ text: 'REPEATABLE' }));
    expect(repeatable.fire(4).effects).toContainEqual(expect.objectContaining({ text: 'REPEATABLE' }));

    const restored = new ModuleEventRuntime(loaded, {
      version: 1,
      moduleId: 'runtime-fixture',
      consumedEventIds: [999, 4, 3, 1],
    });
    expect(restored.snapshot().consumedEventIds).toEqual([1, 3]);
    // The same source id on another cell is consumed globally, rather than keyed by cell.
    expect(restored.fire(1).status).toBe('consumed');
    expect(restored.fire(4).status).toBe('exited');
  });

  it('binds snapshots to an immutable exact artifact identity even when package ids match', () => {
    const first = loadModule(fixture());
    const second = loadModule({
      ...fixture(),
      // Both are valid packages with the same logical id but observably different serialized bytes.
      title: 'Different Runtime Fixture Artifact',
    });
    const firstArtifact = 'a'.repeat(64);
    const secondArtifact = 'b'.repeat(64);
    const mutableOptions = { artifactId: firstArtifact };
    const runtime = new ModuleEventRuntime(first, undefined, mutableOptions);
    expect(runtime.fire(3).status).toBe('exited');
    mutableOptions.artifactId = secondArtifact;

    const snapshot = runtime.snapshot();
    expect(snapshot).toEqual({
      version: 1,
      moduleId: 'runtime-fixture',
      artifactId: firstArtifact,
      consumedEventIds: [3],
    });
    expect(new ModuleEventRuntime(first, snapshot, { artifactId: firstArtifact }).snapshot()).toEqual(snapshot);
    expect(() => new ModuleEventRuntime(second, snapshot, { artifactId: secondArtifact })).toThrow(
      /snapshot artifact identity .* does not match runtime artifact identity/,
    );

    // Absence is part of the identity: only legacy snapshot <-> legacy runtime is compatible.
    const legacySnapshot = new ModuleEventRuntime(first).snapshot();
    expect(new ModuleEventRuntime(first, legacySnapshot).snapshot()).toEqual(legacySnapshot);
    expect(() => new ModuleEventRuntime(first, snapshot)).toThrow(/artifact identity/);
    expect(() => new ModuleEventRuntime(first, legacySnapshot, { artifactId: firstArtifact })).toThrow(
      /artifact identity/,
    );
  });

  it('rejects malformed artifact identities instead of normalizing them into legacy state', () => {
    const loaded = loadModule(fixture());
    expect(() => new ModuleEventRuntime(loaded, undefined, { artifactId: ' leading-space' })).toThrow(
      /invalid artifact identity/,
    );
    expect(() => new ModuleEventRuntime(loaded, {
      version: 1,
      moduleId: 'runtime-fixture',
      artifactId: '',
      consumedEventIds: [],
    })).toThrow(/invalid event-state snapshot/);
  });

  it('preserves prior chain effects when traversal stops at a consumed target', () => {
    const loaded = loadModule(fixture());
    const runtime = new ModuleEventRuntime(loaded);
    expect(runtime.fire(3).status).toBe('exited');
    const chained = runtime.fire(5);
    expect(chained).toMatchObject({ status: 'consumed', eventId: 3 });
    expect(chained.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual(['PRELUDE']);
  });

  it('rejects restore while an interaction is paused without changing its continuation', () => {
    const loaded = loadModule(fixture());
    const runtime = new ModuleEventRuntime(loaded);
    runtime.fire(1);
    expect(() => runtime.restore({
      version: 1,
      moduleId: 'runtime-fixture',
      consumedEventIds: [],
    })).toThrow(/cannot restore while an event is awaiting input/);
    expect(runtime.resumeChoice(2).status).toBe('exited');
    expect(runtime.isConsumed(1)).toBe(true);
  });

  it('halts explicitly before an unsupported retained source event without consuming it', () => {
    const runtime = new ModuleEventRuntime(loadModule(fixture()));
    const result = runtime.fire(6);
    expect(result).toMatchObject({
      status: 'halted',
      eventId: 7,
      haltReason: 'Unsupported FRUA event 45: Give Treasure',
    });
    expect(result.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
      'SUPPORTED PRELUDE',
    ]);
    expect(runtime.isConsumed(7)).toBe(false);
  });

  it('orders a renumbered source-shaped reward between narration blocks and emits it exactly once', () => {
    const loaded = loadModule(renumberedRewardFixture());
    const runtime = new ModuleEventRuntime(loaded);
    const result = runtime.fire(1014);
    expect(result).toMatchObject({ status: 'exited', eventId: 1046 });
    expect(result.effects.map((effect) => effect.type === 'print' ? effect.text : effect)).toEqual([
      'EVENT14 BOX1',
      'EVENT14 BOX2',
      {
        type: 'giveTreasure',
        eventId: 1045,
        platinum: 125,
        gems: 3,
        jewelry: 5,
        items: [96, 246, 80, 80],
        itemsIdentified: false,
      },
      'EVENT46 BOX1',
      'EVENT46 BOX2',
      'EVENT46 BOX3',
    ]);
    expect(runtime.snapshot()).toEqual({
      version: 1,
      moduleId: 'renumbered-reward-fixture',
      consumedEventIds: [1014, 1045],
      treasureReceipts: [{
        type: 'giveTreasure',
        eventId: 1045,
        platinum: 125,
        gems: 3,
        jewelry: 5,
        items: [96, 246, 80, 80],
        itemsIdentified: false,
      }],
    });
    expect(runtime.fire(1045)).toMatchObject({ status: 'consumed', effects: [], eventId: 1045 });

    const restored = new ModuleEventRuntime(loaded, runtime.snapshot());
    expect(restored.fire(1045)).toMatchObject({ status: 'consumed', effects: [], eventId: 1045 });
    expect(restored.fire(1046).effects.filter((effect) => effect.type === 'print')).toHaveLength(3);
  });

  it('halts a fresh source-backed reward before consumption when authorization is absent or refused', () => {
    const loaded = loadModule(renumberedRewardFixture(true));
    const absent = new ModuleEventRuntime(loaded);
    const absentResult = absent.fire(1014);
    expect(absentResult).toMatchObject({
      status: 'halted',
      eventId: 1045,
      haltReason: 'Give Treasure event 45 requires source authorization',
    });
    expect(absentResult.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
      'EVENT14 BOX1', 'EVENT14 BOX2',
    ]);
    expect(absentResult.effects.some((effect) => effect.type === 'giveTreasure')).toBe(false);
    expect(absent.isConsumed(1045)).toBe(false);
    expect(absent.snapshot()).toEqual({
      version: 1,
      moduleId: 'renumbered-reward-fixture',
      consumedEventIds: [1014],
    });

    const refused = new ModuleEventRuntime(loaded, undefined, {
      authorizeGiveTreasure: (event, body) => {
        expect(event.id).toBe(1045);
        expect(body.source).toEqual({
          format: 'frua',
          sourceEventSlot: 45,
          itemDatSourceName: 'DISK1/ITEM.DAT',
          itemsDatSourceName: 'DISK1/ITEMS.DAT',
        });
        return 'selected ITEM capabilities do not match';
      },
    });
    expect(refused.fire(1045)).toMatchObject({
      status: 'halted',
      eventId: 1045,
      haltReason: 'selected ITEM capabilities do not match',
      effects: [],
    });
    expect(refused.isConsumed(1045)).toBe(false);
  });

  it('authorizes source rewards and canonicalizes durable receipts from loaded event payloads', () => {
    const loaded = loadModule(renumberedRewardFixture(true));
    const runtime = new ModuleEventRuntime(loaded, undefined, { authorizeGiveTreasure: () => true });
    expect(runtime.fire(1045).effects[0]).toMatchObject({
      type: 'giveTreasure', eventId: 1045, platinum: 125, items: [96, 246, 80, 80],
    });
    const snapshot = runtime.snapshot();
    const tampered = {
      ...snapshot,
      treasureReceipts: [{
        ...snapshot.treasureReceipts![0],
        platinum: 999999,
        gems: 999,
        items: [1],
        itemsIdentified: true,
      }],
    };
    expect(() => new ModuleEventRuntime(loaded, tampered)).toThrow(
      /restore: Give Treasure event 45 requires source authorization/,
    );
    const restored = new ModuleEventRuntime(loaded, tampered, { authorizeGiveTreasure: () => true });
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.fire(1045)).toMatchObject({ status: 'consumed', effects: [] });

    // Neither half of the invariant is trusted alone: a consumed reward without its receipt is
    // rejected (never silently re-armed), and an unconsumed orphan receipt is discarded.
    expect(() => new ModuleEventRuntime(loaded, {
      version: 1,
      moduleId: 'renumbered-reward-fixture',
      consumedEventIds: [1045],
    })).toThrow(/consumed Give Treasure event 1045 has no valid receipt/);
    const orphanReceipt = new ModuleEventRuntime(loaded, {
      version: 1,
      moduleId: 'renumbered-reward-fixture',
      consumedEventIds: [],
      treasureReceipts: snapshot.treasureReceipts,
    });
    expect(orphanReceipt.snapshot()).toEqual({
      version: 1,
      moduleId: 'renumbered-reward-fixture',
      consumedEventIds: [],
    });
  });
});
