import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Explorer,
  ModuleEventRuntime,
  deserializeModulePackage,
  loadModule,
  resolveEntryPoint,
  serializeModulePackage,
  validateModulePackage,
  type ModuleEventRuntimeResult,
  type ModuleEventStateSnapshot,
} from '../src/index.js';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/the-greyfen-beacon.gbmod', import.meta.url));
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);
const FIXTURE_TEXT = FIXTURE_BYTES.toString('utf8');
const FIXTURE_PACKAGE = deserializeModulePackage(FIXTURE_TEXT);

const EXPECTED_BYTE_LENGTH = 1_503;
const EXPECTED_SHA256 = 'b5fdc35ece34631c6787c97476a7d57b6b214c288885b8626810b3d4fb7c1077';
const REWARD_RECEIPT = {
  type: 'giveTreasure' as const,
  eventId: 3,
  platinum: 25,
  gems: 0,
  jewelry: 0,
  items: [],
  itemsIdentified: false,
};

function freshRuntime(snapshot?: ModuleEventStateSnapshot): ModuleEventRuntime {
  return new ModuleEventRuntime(loadModule(FIXTURE_PACKAGE), snapshot);
}

function printTexts(result: ModuleEventRuntimeResult): string[] {
  return result.effects
    .map((effect) => effect.type === 'print' ? effect.text : undefined)
    .filter((text): text is string => typeof text === 'string');
}

function beginFight(runtime: ModuleEventRuntime): void {
  const question = runtime.fire(1);
  expect(question).toMatchObject({ status: 'awaiting-input', eventId: 1 });
  expect(printTexts(question)).toEqual([
    'THE GREYFEN BEACON IS DARK. WILL YOU LIGHT IT?',
    '1) LIGHT IT',
    '2) WALK AWAY',
  ]);

  const combat = runtime.resumeChoice(1);
  expect(combat).toMatchObject({ status: 'combat', eventId: 2 });
  expect(printTexts(combat)).toEqual(['AN ASH MOTH GUARDS THE LANTERN.']);
  expect(combat.effects).toContainEqual({
    type: 'combat',
    monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }],
  });
}

describe('The Greyfen Beacon reference campaign', () => {
  it('pins the exact Author-produced artifact and round-trips it byte-for-byte', () => {
    expect(FIXTURE_BYTES.byteLength).toBe(EXPECTED_BYTE_LENGTH);
    expect(createHash('sha256').update(FIXTURE_BYTES).digest('hex')).toBe(EXPECTED_SHA256);
    expect(serializeModulePackage(FIXTURE_PACKAGE)).toBe(FIXTURE_TEXT);

    expect(FIXTURE_PACKAGE).toMatchObject({
      schema: 1,
      id: 'the-greyfen-beacon',
      title: 'The Greyfen Beacon',
      ruleset: 'addnd1e',
      maps: [{
        name: 'Greyfen Causeway',
        width: 3,
        height: 1,
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
      }],
      entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
      databases: {
        monsters: [{
          id: 1,
          name: 'ASH MOTH',
          hitPoints: 1,
          armorClass: 20,
          thac0: 20,
          damage: { count: 1, sides: 2, bonus: 0 },
          xp: 5,
        }],
      },
    });
  });

  it('passes strict complete-campaign validation with no diagnostics', () => {
    expect(validateModulePackage(FIXTURE_PACKAGE, { completeCampaign: true })).toEqual({
      ok: true,
      diagnostics: [],
      errors: [],
      warnings: [],
    });
  });

  it('starts at the declared west entry, walks the 3x1 causeway, and makes a revisit silent', () => {
    const loaded = loadModule(FIXTURE_PACKAGE);
    const { map, entryId } = resolveEntryPoint(loaded, 0);
    const explorer = Explorer.atEntry(map, entryId);
    const runtime = new ModuleEventRuntime(loaded);

    expect(map).toMatchObject({ name: 'Greyfen Causeway', width: 3, height: 1 });
    expect(explorer.getPose()).toEqual({ x: 0, y: 0, facing: 'east' });
    expect(explorer.currentEvent()).toBe(0);

    const trigger = explorer.forward();
    expect(trigger).toMatchObject({
      moved: true,
      pose: { x: 1, y: 0, facing: 'east' },
      event: 1,
      timeMinutes: 1,
    });
    expect(runtime.fire(trigger.event).status).toBe('awaiting-input');
    expect(runtime.resumeChoice(2).status).toBe('exited');

    expect(explorer.forward()).toMatchObject({
      moved: true,
      pose: { x: 2, y: 0, facing: 'east' },
      event: 0,
    });
    const revisit = explorer.backward();
    expect(revisit).toMatchObject({
      moved: true,
      pose: { x: 1, y: 0, facing: 'east' },
      event: 1,
    });
    expect(runtime.fire(revisit.event)).toEqual({ status: 'consumed', effects: [], eventId: 1 });
  });

  it('records the durable decline branch as [1,7]', () => {
    const runtime = freshRuntime();
    expect(runtime.fire(1).status).toBe('awaiting-input');

    const declined = runtime.resumeChoice(2);
    expect(declined).toMatchObject({ status: 'exited', eventId: 7 });
    expect(printTexts(declined)).toEqual(['YOU LEAVE THE BEACON UNLIT.']);
    expect(runtime.snapshot()).toEqual({
      version: 1,
      moduleId: 'the-greyfen-beacon',
      consumedEventIds: [1, 7],
    });
  });

  it('orders one victory reward before the terminal and restores it without duplication', () => {
    const runtime = freshRuntime();
    beginFight(runtime);

    const victory = runtime.resumeCombat('victory');
    expect(victory).toMatchObject({ status: 'exited', eventId: 4 });
    expect(victory.effects.filter((effect) => effect.type === 'giveTreasure')).toEqual([REWARD_RECEIPT]);
    expect(printTexts(victory)).toEqual(['THE BEACON BURNS. GREYFEN IS SAFE.']);
    const rewardIndex = victory.effects.findIndex((effect) => effect.type === 'giveTreasure');
    const terminalIndex = victory.effects.findIndex(
      (effect) => effect.type === 'print' && effect.text === 'THE BEACON BURNS. GREYFEN IS SAFE.',
    );
    expect(rewardIndex).toBeGreaterThanOrEqual(0);
    expect(terminalIndex).toBeGreaterThan(rewardIndex);

    const snapshot = runtime.snapshot();
    expect(snapshot).toEqual({
      version: 1,
      moduleId: 'the-greyfen-beacon',
      consumedEventIds: [1, 2, 3, 4],
      treasureReceipts: [REWARD_RECEIPT],
    });

    // Model a process restart: parse the package again, JSON-round-trip the save, then restore.
    const restartedPackage = deserializeModulePackage(FIXTURE_TEXT);
    const restoredSnapshot = JSON.parse(JSON.stringify(snapshot)) as ModuleEventStateSnapshot;
    const restored = new ModuleEventRuntime(loadModule(restartedPackage), restoredSnapshot);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.fire(3)).toEqual({ status: 'consumed', effects: [], eventId: 3 });
    expect(restored.fire(4)).toEqual({ status: 'consumed', effects: [], eventId: 4 });
    expect(restored.snapshot().treasureReceipts).toEqual([REWARD_RECEIPT]);
  });

  it.each([
    ['defeat', 5, 'THE ASH MOTH CLAIMS THE BEACON.'],
    ['flee', 6, 'YOU ESCAPE. THE BEACON STAYS DARK.'],
  ] as const)('records the durable %s branch with its distinct terminal', (outcome, terminalId, text) => {
    const runtime = freshRuntime();
    beginFight(runtime);

    const result = runtime.resumeCombat(outcome);
    expect(result).toMatchObject({ status: 'exited', eventId: terminalId });
    expect(printTexts(result)).toEqual([text]);
    expect(result.effects.some((effect) => effect.type === 'giveTreasure')).toBe(false);
    expect(runtime.snapshot()).toEqual({
      version: 1,
      moduleId: 'the-greyfen-beacon',
      consumedEventIds: [1, 2, terminalId],
    });
  });
});
