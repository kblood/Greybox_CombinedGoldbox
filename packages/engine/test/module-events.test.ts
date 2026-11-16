/**
 * `ModuleEvent` scripting tests (M5.S4 "Event editor + scripting"). Covers the four new compiled
 * shapes (text/choice/combat/utilities/chain — `module/eventCompiler.ts`), the
 * variables/arithmetic/branching primitive (`utilities`), and an end-to-end authored event chain
 * that a `combat` event branches through by outcome — the BUILD-QUEUE M5.S4 acceptance ("author an
 * event chain, playtest fires it correctly").
 */
import { describe, it, expect } from 'vitest';
import { compileGiveTreasureEvent } from '../src/module/eventCompiler.js';
import {
  compileModuleEvent,
  compileTextEvent,
  compileChoiceEvent,
  compileCombatEvent,
  compileUtilitiesEvent,
  compileChainEvent,
  createModuleEventVm,
  loadModule,
  runModuleEvent,
  sniffGen1EclBlock,
  EclVm,
  type ModulePackage,
  type ModuleEvent,
} from '../src/index.js';

function createOwnVm(block: Uint8Array): EclVm {
  return new EclVm(block);
}

function eventBlockIsWellFormed(block: Uint8Array): void {
  expect(sniffGen1EclBlock(block)).toBe(true);
}

describe('compileTextEvent (19 types incl. message)', () => {
  it('prints then exits when chainTo is omitted', () => {
    const block = compileTextEvent({ text: 'WELCOME' });
    eventBlockIsWellFormed(block);
    const result = new EclVm(block).run();
    expect(result.status).toBe('exited');
    expect(result.effects).toEqual([expect.objectContaining({ type: 'print', text: 'WELCOME' })]);
  });

  it('keeps multiple source text boxes as distinct ordered print effects', () => {
    const result = new EclVm(compileTextEvent({
      text: 'FIRST BOX',
      additionalTexts: ['SECOND BOX', 'THIRD BOX'],
    })).run();
    expect(result.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
      'FIRST BOX', 'SECOND BOX', 'THIRD BOX',
    ]);
  });

  it('chains to another event id when chainTo is given', () => {
    const block = compileTextEvent({ text: 'ONWARD', chainTo: 42 });
    const result = new EclVm(block).run();
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 42 });
  });

  it('routes all 19 text-shape ModuleEventTypes through compileModuleEvent without error', () => {
    const types = [
      'message', 'damage', 'trainingHall', 'tavern', 'shop', 'temple', 'guidedTour',
      'addNpc', 'npcSays', 'sounds', 'smallTown', 'vault', 'combatTreasure', 'gainExperience',
      'passTime', 'camp', 'removeNpc', 'tavernTales', 'specialItems',
    ] as const;
    for (const type of types) {
      const event: ModuleEvent = { id: 1, type, body: { text: `${type} fires` } };
      eventBlockIsWellFormed(compileModuleEvent(event));
    }
  });
});

describe('compileGiveTreasureEvent', () => {
  const reward = {
    platinum: 125,
    gems: 3,
    jewelry: 5,
    items: [96, 246, 80, 80],
    itemsIdentified: false,
    chainTo: 46,
  };

  it('compiles a relocated control-flow carrier without fabricating generic ECL treasure', () => {
    const block = compileGiveTreasureEvent(reward, { encodeChainTarget: (target) => target - 40 });
    eventBlockIsWellFormed(block);
    const result = new EclVm(block).run();
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 6 });
    expect(result.effects).toEqual([]);
    eventBlockIsWellFormed(compileModuleEvent({ id: 45, type: 'giveTreasure', body: reward }));
  });

  it('rejects amounts or unresolved source IDs outside the lossless FRUA wire ranges', () => {
    expect(() => compileGiveTreasureEvent({ ...reward, platinum: 0x80000000 })).toThrow(/platinum/);
    expect(() => compileGiveTreasureEvent({ ...reward, items: [0] })).toThrow(/1-255/);
    expect(() => compileGiveTreasureEvent({ ...reward, items: Array(9).fill(1) })).toThrow(/at most 8/);
    expect(() => compileGiveTreasureEvent({
      ...reward,
      source: {
        format: 'frua', sourceEventSlot: 45,
        itemDatSourceName: {} as never,
        itemsDatSourceName: 'DISK1/ITEMS.DAT',
      },
    })).toThrow(/source provenance is invalid/);
  });
});

describe('compileChoiceEvent (11 types)', () => {
  const body = {
    prompt: 'Take the stairs?',
    options: [
      { label: 'Yes', chainTo: 10 },
      { label: 'No', chainTo: 20 },
    ],
  };

  it('rejects fewer than 2 options', () => {
    expect(() => compileChoiceEvent({ prompt: 'x', options: [{ label: 'only' }] })).toThrow(/at least 2 options/);
  });

  it('rejects more than 9 options', () => {
    const options = Array.from({ length: 10 }, (_, i) => ({ label: `opt${i}` }));
    expect(() => compileChoiceEvent({ prompt: 'x', options })).toThrow(/at most 9 options/);
  });

  it('chains to the option matching the host reply', () => {
    const block = compileChoiceEvent(body);
    eventBlockIsWellFormed(block);
    const vm = createOwnVm(block);
    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'TAKE THE STAIRS?' }),
      expect.objectContaining({ type: 'print', text: '1) YES' }),
      expect.objectContaining({ type: 'print', text: '2) NO' }),
      expect.objectContaining({ type: 'input', mode: 'number' }),
    ]);
    const result = vm.resume(2);
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 20 });
  });

  it('falls through to EXIT on an out-of-range reply', () => {
    const vm = createOwnVm(compileChoiceEvent(body));
    vm.run();
    const result = vm.resume(9);
    expect(result.status).toBe('exited');
  });

  it('routes all 11 choice-shape ModuleEventTypes through compileModuleEvent without error', () => {
    const types = [
      'stairs', 'questionButton', 'transferModule', 'whoTries', 'whoPays', 'enterPassword',
      'questionList', 'teleporter', 'questStage', 'questionYesNo', 'encounter',
    ] as const;
    for (const type of types) {
      const event: ModuleEvent = {
        id: 1,
        type,
        body: { prompt: `${type}?`, options: [{ label: 'a' }, { label: 'b' }] },
      };
      eventBlockIsWellFormed(compileModuleEvent(event));
    }
  });
});

describe('compileCombatEvent (2 types)', () => {
  it('loads monsters, pauses on COMBAT, and branches on the outcome', () => {
    const block = compileCombatEvent({
      monsters: [{ monsterId: 3, count: 2, picBlockId: 9 }],
      onVictory: 5,
      onDefeat: 6,
      onFlee: 7,
    });
    eventBlockIsWellFormed(block);

    const vm = createOwnVm(block);
    const paused = vm.run();
    expect(paused.status).toBe('combat');
    expect(paused.effects).toEqual([
      { type: 'combat', monsters: [{ monsterId: 3, count: 2, picBlockId: 9 }] },
    ]);

    const victory = createOwnVm(block);
    victory.run();
    expect(victory.resume(0, { combatOutcome: 'victory' })).toMatchObject({ status: 'chain', chainBlockId: 5 });

    const defeat = createOwnVm(block);
    defeat.run();
    expect(defeat.resume(0, { combatOutcome: 'defeat' })).toMatchObject({ status: 'chain', chainBlockId: 6 });

    const flee = createOwnVm(block);
    flee.run();
    expect(flee.resume(0, { combatOutcome: 'flee' })).toMatchObject({ status: 'chain', chainBlockId: 7 });
  });

  it('prints source narration but keeps friendly groups out of the hostile ECL queue', () => {
    const vm = createOwnVm(compileCombatEvent({
      intro: 'THE PARTY JOINS THE FIGHT.',
      monsters: [{ monsterId: 4, count: 20, picBlockId: 2 }],
      friendlyMonsters: [{ monsterId: 111, count: 6, picBlockId: 2 }],
    }));
    const paused = vm.run();
    expect(paused.status).toBe('combat');
    expect(paused.effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'THE PARTY JOINS THE FIGHT.' }),
      { type: 'combat', monsters: [{ monsterId: 4, count: 20, picBlockId: 2 }] },
    ]);
  });

  it('routes both combat-shape ModuleEventTypes through compileModuleEvent without error', () => {
    for (const type of ['combat', 'pickOneCombat'] as const) {
      const event: ModuleEvent = { id: 1, type, body: { monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }] } };
      eventBlockIsWellFormed(compileModuleEvent(event));
    }
  });
});

describe('compileUtilitiesEvent — the variables/arithmetic/branching primitive', () => {
  it('stores a value into a scripting variable', () => {
    const block = compileUtilitiesEvent({ op: 'store', variable: 1, value: 5 });
    const result = createOwnVm(block).run();
    expect(result.status).toBe('exited');
  });

  it('adds to a variable then branches true/false on a compare', () => {
    const addAndCheckEq = compileUtilitiesEvent({
      op: 'add',
      variable: 2,
      value: 3, // starts at 0 (fresh memory) → var becomes 3
      compare: { op: 'eq', value: 3, onTrue: 100, onFalse: 200 },
    });
    expect(createOwnVm(addAndCheckEq).run()).toMatchObject({ status: 'chain', chainBlockId: 100 });
  });

  it('subtracts from a variable then branches on the mismatch arm', () => {
    const subAndCheckEq = compileUtilitiesEvent({
      op: 'subtract',
      variable: 3,
      value: 7, // starts at 0 → var becomes -7 (masked to 0xffff)
      compare: { op: 'eq', value: 0, onTrue: 100, onFalse: 200 },
    });
    expect(createOwnVm(subAndCheckEq).run()).toMatchObject({ status: 'chain', chainBlockId: 200 });
  });

  it('exits with no branch when compare is omitted', () => {
    const block = compileUtilitiesEvent({ op: 'store', variable: 4, value: 1 });
    expect(createOwnVm(block).run().status).toBe('exited');
  });
});

describe('compileChainEvent — pure unconditional flow control', () => {
  it('chains when chainTo is given', () => {
    expect(createOwnVm(compileChainEvent({ chainTo: 77 })).run()).toMatchObject({ status: 'chain', chainBlockId: 77 });
  });

  it('exits when chainTo is omitted', () => {
    expect(createOwnVm(compileChainEvent({})).run().status).toBe('exited');
  });
});

// A 1x1 map is enough to host every fixture event below — none of these tests need real movement.
function moduleFixture(events: ModuleEvent[]): ModulePackage {
  return {
    schema: 1,
    id: 'event-chain-fixture',
    title: 'Event Chain Fixture',
    ruleset: 'addnd1e',
    maps: [
      {
        name: 'room',
        width: 1,
        height: 1,
        cells: [{ walls: { north: 1, east: 1, south: 1, west: 1 } }],
        entries: [{ id: 0, x: 0, y: 0, facing: 'north' }],
        events,
      },
    ],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
  };
}

describe('authored event chain — M5.S4 e2e acceptance', () => {
  it('an intro message chains into combat, which branches by outcome, which chains into a closing message', () => {
    const pkg = moduleFixture([
      { id: 1, type: 'message', body: { text: 'A GOBLIN BLOCKS THE PATH', chainTo: 2 } },
      {
        id: 2,
        type: 'combat',
        body: { monsters: [{ monsterId: 12, count: 1, picBlockId: 0 }], onVictory: 3, onDefeat: 4, onFlee: 5 },
      },
      { id: 3, type: 'message', body: { text: 'YOU WIN' } },
      { id: 4, type: 'message', body: { text: 'YOU DIED' } },
      { id: 5, type: 'message', body: { text: 'YOU FLED' } },
    ]);
    const loaded = loadModule(pkg);

    // Step 1: fire the intro message — it chains straight to the combat event.
    const intro = runModuleEvent(loaded, 1);
    expect(intro).toMatchObject({ status: 'chain', chainBlockId: 2 });

    // Step 2: the host follows the chain to event 2 (combat) and drives it to a verdict.
    const combatVm = createModuleEventVm(loaded, intro.chainBlockId!);
    const paused = combatVm.run();
    expect(paused.status).toBe('combat');
    const afterCombat = combatVm.resume(0, { combatOutcome: 'victory' });
    expect(afterCombat).toMatchObject({ status: 'chain', chainBlockId: 3 });

    // Step 3: follow the victory chain to event 3 and confirm the closing text.
    const ending = runModuleEvent(loaded, afterCombat.chainBlockId!);
    expect(ending.status).toBe('exited');
    expect(ending.effects).toEqual([expect.objectContaining({ type: 'print', text: 'YOU WIN' })]);
  });

  it('a defeated fight follows the defeat branch instead', () => {
    const pkg = moduleFixture([
      {
        id: 2,
        type: 'pickOneCombat',
        body: { monsters: [{ monsterId: 12, count: 1, picBlockId: 0 }], onVictory: 3, onDefeat: 4 },
      },
      { id: 3, type: 'message', body: { text: 'YOU WIN' } },
      { id: 4, type: 'message', body: { text: 'YOU DIED' } },
    ]);
    const loaded = loadModule(pkg);
    const vm = createModuleEventVm(loaded, 2);
    vm.run();
    const after = vm.resume(0, { combatOutcome: 'defeat' });
    expect(after).toMatchObject({ status: 'chain', chainBlockId: 4 });
    expect(runModuleEvent(loaded, after.chainBlockId!).effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'YOU DIED' }),
    ]);
  });

  it('a questionYesNo choice event chains through the module loader like any other event', () => {
    const pkg = moduleFixture([
      { id: 1, type: 'questionYesNo', body: { prompt: 'Enter the crypt?', options: [{ label: 'Yes', chainTo: 2 }, { label: 'No', chainTo: 3 }] } },
      { id: 2, type: 'message', body: { text: 'YOU ENTER' } },
      { id: 3, type: 'message', body: { text: 'YOU LEAVE' } },
    ]);
    const loaded = loadModule(pkg);
    const vm = createModuleEventVm(loaded, 1);
    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    const after = vm.resume(1); // "1) Yes"
    expect(after).toMatchObject({ status: 'chain', chainBlockId: 2 });
  });
});
