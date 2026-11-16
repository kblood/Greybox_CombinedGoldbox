import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES,
  GATEWAY_ECL6_STEP_MINUTES,
  GatewayEcl6WildernessController,
  advanceGatewayEcl6Encounter,
  createGatewayEcl6ControllerState,
  readDaxDataBlocks,
  transitionGatewayEcl6Boundary,
  type GatewayEcl6BoundaryState,
  type GatewayEcl6ControllerHooks,
  type GatewayEcl6GeoSource,
  type Direction,
} from '../src/index.js';

function boundary(selector: number, x: number, y: number, facing: 'north' | 'east' | 'south' | 'west'):
GatewayEcl6BoundaryState {
  return { selector, pose: { x, y, facing } };
}

describe('Gateway ECL6 exact boundary transition function', () => {
  it('matches all sixteen retail-derived remount seeds', () => {
    const cases: Array<[GatewayEcl6BoundaryState, GatewayEcl6BoundaryState]> = [
      [boundary(21, 15, 7, 'east'), boundary(22, 0, 7, 'east')],
      [boundary(22, 0, 7, 'west'), boundary(21, 15, 7, 'west')],
      [boundary(22, 15, 7, 'east'), boundary(23, 0, 7, 'east')],
      [boundary(22, 4, 15, 'south'), boundary(25, 0, 0, 'south')],
      [boundary(23, 0, 7, 'west'), boundary(22, 15, 7, 'west')],
      [boundary(23, 15, 7, 'east'), boundary(24, 0, 7, 'east')],
      [boundary(23, 3, 15, 'south'), boundary(25, 15, 0, 'south')],
      [boundary(23, 4, 15, 'south'), boundary(26, 0, 0, 'south')],
      [boundary(24, 0, 7, 'west'), boundary(23, 15, 7, 'west')],
      [boundary(24, 3, 15, 'south'), boundary(26, 15, 0, 'south')],
      [boundary(25, 15, 7, 'east'), boundary(26, 0, 7, 'east')],
      [boundary(25, 0, 0, 'north'), boundary(22, 4, 15, 'north')],
      [boundary(25, 12, 0, 'north'), boundary(23, 0, 15, 'north')],
      [boundary(26, 0, 7, 'west'), boundary(25, 15, 7, 'west')],
      [boundary(26, 0, 0, 'north'), boundary(23, 4, 15, 'north')],
      [boundary(26, 12, 0, 'north'), boundary(24, 0, 15, 'north')],
    ];
    for (const [before, after] of cases) expect(transitionGatewayEcl6Boundary(before)).toEqual(after);
  });

  it('preserves the retail guard rejections', () => {
    expect(transitionGatewayEcl6Boundary(boundary(21, 15, 7, 'west'))).toBeNull();
    expect(transitionGatewayEcl6Boundary(boundary(22, 3, 15, 'south'))).toBeNull();
    expect(transitionGatewayEcl6Boundary(boundary(25, 5, 1, 'north'))).toBeNull();
    expect(transitionGatewayEcl6Boundary(boundary(99, 0, 0, 'north'))).toBeNull();
  });
});

describe('Gateway ECL6 encounter cadence', () => {
  it('waits for three eligible calls, rolls 0..100 until hit, and resets only on a hit', () => {
    let counter = 0;
    for (const expected of [1, 2, 3]) {
      const result = advanceGatewayEcl6Encounter(counter, false, 3);
      expect(result).toMatchObject({ kind: 'cooldown', rolled: false, counterAfter: expected });
      counter = result.counterAfter;
    }
    const miss = advanceGatewayEcl6Encounter(counter, false, 3, 30);
    expect(miss).toMatchObject({ kind: 'miss', threshold: 30, roll: 30, counterAfter: 3 });
    const hit = advanceGatewayEcl6Encounter(miss.counterAfter, false, 3, 29);
    expect(hit).toMatchObject({ kind: 'encounter', threshold: 30, roll: 29, counterAfter: 0 });
    expect(() => advanceGatewayEcl6Encounter(3, false, 3, 101)).toThrow(/0\.\.100/);
  });

  it('consumes remount suppression and gates descriptors 18+', () => {
    expect(advanceGatewayEcl6Encounter(2, true, 3)).toMatchObject({
      kind: 'suppressed', counterAfter: 2, suppressAfter: false, rolled: false,
    });
    expect(advanceGatewayEcl6Encounter(3, false, 18)).toMatchObject({
      kind: 'descriptor-ineligible', counterAfter: 3, rolled: false,
    });
  });
});

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const required = ['ECL6.DAX', 'GEO6.DAX'];
const haveRetail = required.every((name) => existsSync(resolve(gateway, name)));

function daxIndex(name: string): Map<number, Uint8Array> {
  return new Map(
    readDaxDataBlocks(new Uint8Array(readFileSync(resolve(gateway, name))))
      .map((block) => [block.blockId, block.raw]),
  );
}

function retailInputs(): { ecl: Uint8Array; source: GatewayEcl6GeoSource } {
  const ecl = daxIndex('ECL6.DAX').get(21)!;
  const geo = daxIndex('GEO6.DAX');
  return { ecl, source: { geoBlock: (id) => geo.get(id) ?? null } };
}

const missHooks: GatewayEcl6ControllerHooks = { rollEncounter: () => 100 };

describe('Gateway ECL6 interactive wilderness controller — retail', () => {
  it.skipIf(!haveRetail)('pauses a boat move after 12 hours and commits YES with only the host minute', () => {
    const { ecl, source } = retailInputs();
    const controller = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(
        21,
        { x: 0, y: 0, facing: 'east' },
        { travelModeWord: 1 },
      ),
      missHooks,
    );
    const paused = controller.forward();
    expect(paused).toMatchObject({
      moved: false,
      elapsedMinutes: 720,
      prompt: {
        kind: 'boat-abandon',
        text: 'ABANDON THE BOAT?',
        continuation: {
          kind: 'interior',
          targetPose: { x: 1, y: 0, facing: 'east' },
          descriptor: 0,
        },
      },
      state: {
        phase: 'boat-abandon-prompt',
        travelModeWord: 1,
        pose: { x: 0, y: 0, facing: 'east' },
        clock: [0, 0, 0, 12, 0, 0, 0],
      },
    });
    expect(() => controller.turnLeft()).toThrow(/resolve it before moving/);

    const restored = GatewayEcl6WildernessController.restore(
      ecl,
      source,
      JSON.parse(JSON.stringify(controller.serialize())),
      missHooks,
    );
    const accepted = restored.resolveBoatAbandonChoice(0);
    expect(accepted).toMatchObject({
      action: 'boat-choice',
      choiceIndex: 0,
      moved: true,
      elapsedMinutes: 1,
      encounter: { kind: 'cooldown', counterAfter: 1 },
      state: {
        phase: 'active',
        travelModeWord: 0,
        pose: { x: 1, y: 0, facing: 'east' },
        clock: [0, 1, 0, 12, 0, 0, 0],
      },
    });
  });

  it.skipIf(!haveRetail)('keeps the boat and one-shot encounter suppression after NO', () => {
    const { ecl, source } = retailInputs();
    const controller = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(21, { x: 0, y: 0, facing: 'east' }, {
        travelModeWord: 2,
        cadenceCounter: 3,
      }),
      { rollEncounter: () => { throw new Error('suppressed encounter must not roll'); } },
    );
    controller.forward();
    expect(controller.resolveBoatAbandonChoice(1)).toMatchObject({
      moved: false,
      elapsedMinutes: 0,
      state: {
        travelModeWord: 2,
        suppressNextEncounter: true,
        pose: { x: 0, y: 0, facing: 'east' },
      },
    });
    controller.forward();
    const accepted = controller.resolveBoatAbandonChoice(0);
    expect(accepted.encounter).toMatchObject({ kind: 'suppressed', counterBefore: 3, counterAfter: 3 });
    expect(accepted.state).toMatchObject({ travelModeWord: 0, suppressNextEncounter: false });
  });

  it.skipIf(!haveRetail)('enforces exact water and mountain predicates with persistent suppression', () => {
    const { ecl, source } = retailInputs();
    const land = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(21, { x: 0, y: 1, facing: 'south' }),
      missHooks,
    );
    expect(land.forward()).toMatchObject({
      moved: false,
      blocked: 'water',
      elapsedMinutes: 720,
      message: 'THE WATER IS TOO DEEP.',
      state: { suppressNextEncounter: true, travelModeWord: 0 },
    });

    const boat = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(21, { x: 0, y: 1, facing: 'south' }, { travelModeWord: 1 }),
      missHooks,
    );
    expect(boat.forward()).toMatchObject({
      moved: true,
      elapsedMinutes: 721,
      state: { pose: { x: 0, y: 2, facing: 'south' }, travelModeWord: 1 },
    });

    const nonCanonicalBoat = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(21, { x: 3, y: 0, facing: 'east' }, { travelModeWord: 2 }),
      missHooks,
    );
    expect(nonCanonicalBoat.forward()).toMatchObject({ moved: false, blocked: 'water' });

    const mountain = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(21, { x: 7, y: 3, facing: 'south' }, { travelModeWord: 1 }),
      missHooks,
    );
    expect(mountain.forward()).toMatchObject({
      moved: false,
      blocked: 'mountain',
      message: 'THE MOUNTAINS ARE IMPASSIBLE.',
      state: { suppressNextEncounter: true, travelModeWord: 1 },
    });
  });

  it.skipIf(!haveRetail)('runs EREK and MUTHTUR then RISHPAL boundary guards with exact removal rules', () => {
    const { ecl, source } = retailInputs();
    const erek = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(23, { x: 3, y: 15, facing: 'south' }, {
        companions: [{ name: 'EREK', active: true }],
      }),
      missHooks,
    );
    expect(erek.forward()).toMatchObject({
      moved: false,
      prompt: {
        kind: 'companion', companion: 'EREK', pictureId: 0x66,
        choices: ['CONTINUE', 'GO BACK'],
      },
      state: { phase: 'companion-prompt' },
    });
    const restoredErek = GatewayEcl6WildernessController.restore(
      ecl,
      source,
      JSON.parse(JSON.stringify(erek.serialize())),
      missHooks,
    );
    expect(restoredErek.serialize()).toEqual(erek.serialize());
    expect(restoredErek.resolveCompanionChoice(1)).toMatchObject({
      moved: false,
      choiceIndex: 1,
      state: { suppressNextEncounter: true, companions: [{ name: 'EREK', active: true }] },
    });

    const inactive = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(23, { x: 3, y: 15, facing: 'south' }, {
        companions: [{ name: 'EREK', active: false }],
      }),
      missHooks,
    );
    expect(inactive.forward()).toMatchObject({
      moved: true,
      remount: { fromSelector: 23, toSelector: 25 },
      state: { companions: [] },
    });

    const ordered = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(26, { x: 12, y: 0, facing: 'north' }, {
        companions: [
          { name: 'RISHPAL', active: true },
          { name: 'MUTHTUR', active: true },
        ],
      }),
      missHooks,
    );
    expect(ordered.forward().prompt).toMatchObject({
      kind: 'companion', companion: 'MUTHTUR', pictureId: 0x4d,
    });
    const rishpal = ordered.resolveCompanionChoice(0);
    expect(rishpal).toMatchObject({
      moved: false,
      choiceIndex: 0,
      prompt: {
        kind: 'companion',
        companion: 'RISHPAL',
        pictureId: 0x22,
        text: "'I CANNOT GO TOO FAR FROM HOME, HE SAYS, 'AND LEAVE MY FAMILY UNPROTECTED.'",
      },
      state: { companions: [{ name: 'RISHPAL', active: true }] },
    });
    const goBackAtRishpal = GatewayEcl6WildernessController.restore(
      ecl,
      source,
      JSON.parse(JSON.stringify(ordered.serialize())),
      missHooks,
    ).resolveCompanionChoice(1);
    expect(goBackAtRishpal).toMatchObject({
      moved: false,
      state: {
        suppressNextEncounter: true,
        companions: [{ name: 'RISHPAL', active: true }],
      },
    });
    const continued = ordered.resolveCompanionChoice(0);
    expect(continued).toMatchObject({
      moved: true,
      choiceIndex: 0,
      remount: { fromSelector: 26, toSelector: 24 },
      state: { companions: [], phase: 'active' },
    });
  });

  it.skipIf(!haveRetail)('walks the ten-step GEO24 route with exact clock/cadence and pauses at Sundabar', () => {
    const { ecl, source } = retailInputs();
    const rollContexts: Parameters<GatewayEcl6ControllerHooks['rollEncounter']>[0][] = [];
    const controller = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 8, y: 2, facing: 'west' }),
      { rollEncounter: (context) => { rollContexts.push(context); return 100; } },
    );

    const steps = Array.from({ length: 4 }, () => controller.forward());
    controller.turnLeft();
    steps.push(controller.forward());
    controller.turnRight();
    for (let i = 0; i < 3; i++) steps.push(controller.forward());
    controller.turnLeft();
    steps.push(controller.forward());
    controller.turnRight();
    steps.push(controller.forward());

    expect(steps.every((step) => step.moved && step.elapsedMinutes === GATEWAY_ECL6_STEP_MINUTES)).toBe(true);
    expect(controller.serialize()).toMatchObject({
      selector: 24,
      pose: { x: 0, y: 4, facing: 'west' },
      clock: [0, 0, 1, 0, 5, 0, 0],
      cadenceCounter: 3,
      phase: 'active',
    });
    expect(rollContexts.length).toBeGreaterThan(0);
    expect(rollContexts.every((context) => context.maximumInclusive === 100)).toBe(true);

    const prompt = controller.forward();
    expect(prompt).toMatchObject({
      moved: false,
      blocked: 'edge',
      elapsedMinutes: 0,
      prompt: { kind: 'sundabar', text: 'ENTER SUNDABAR?', source: 'boundary' },
      state: { phase: 'sundabar-prompt', selector: 24, pose: { x: 0, y: 4, facing: 'west' } },
    });
    expect(() => controller.forward()).toThrow(/resolve it before moving/);

    const rejectedShortcut = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 8, y: 2, facing: 'south' }),
      missHooks,
    );
    expect(rejectedShortcut.forward()).toMatchObject({
      moved: false,
      blocked: 'mountain',
      elapsedMinutes: 720,
      state: { pose: { x: 8, y: 2, facing: 'south' }, clock: [0, 0, 0, 12, 0, 0, 0] },
    });
  });

  it.skipIf(!haveRetail)('round-trips paused state and applies exact NO/YES host results', () => {
    const { ecl, source } = retailInputs();
    const controller = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 0, y: 4, facing: 'west' }),
      missHooks,
    );
    controller.forward();
    const json = JSON.stringify(controller.serialize());
    const restored = GatewayEcl6WildernessController.restore(
      ecl,
      source,
      JSON.parse(json),
      missHooks,
    );
    expect(restored.serialize()).toEqual(controller.serialize());
    expect(restored.getSelectedMap()).toMatchObject({ geoBlockId: 24, rawPieceOperands: [18, 56, 57] });

    const no = restored.resolveSundabarChoice(1);
    expect(no).toMatchObject({
      choiceIndex: 1,
      state: { phase: 'active', chain: null, travelModeWord: 0, suppressNextEncounter: true },
    });
    restored.forward();
    const yes = restored.resolveSundabarChoice(0);
    expect(yes).toMatchObject({
      choiceIndex: 0,
      chain: { gameArea: 5, eclBlockId: 19 },
      state: { phase: 'chained', chain: { gameArea: 5, eclBlockId: 19 } },
    });
    expect(() => restored.turnLeft()).toThrow(/resolve it before moving/);

    const boatMode = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(
        24,
        { x: 0, y: 4, facing: 'west' },
        { travelModeWord: 1 },
      ),
      missHooks,
    );
    boatMode.forward();
    expect(boatMode.resolveSundabarChoice(1)).toMatchObject({
      moved: false,
      state: { phase: 'active', travelModeWord: 1, suppressNextEncounter: false },
    });
  });

  it.skipIf(!haveRetail)('migrates a serialized v1 controller state with safe travel defaults', () => {
    const { ecl, source } = retailInputs();
    const current = createGatewayEcl6ControllerState(24, { x: 8, y: 2, facing: 'west' }, {
      cadenceCounter: 2,
      suppressNextEncounter: true,
    });
    const { travelModeWord: _travelModeWord, companions: _companions, ...withoutV2 } = current;
    const legacy = { ...withoutV2, version: 1 as const };
    const restored = GatewayEcl6WildernessController.restore(
      ecl,
      source,
      JSON.parse(JSON.stringify(legacy)),
      missHooks,
    );
    expect(restored.serialize()).toMatchObject({
      version: 2,
      selector: 24,
      pose: { x: 8, y: 2, facing: 'west' },
      cadenceCounter: 2,
      suppressNextEncounter: true,
      travelModeWord: 0,
      companions: [],
    });
  });

  it.skipIf(!haveRetail)('remounts each exact boundary seed and consumes one encounter suppression', () => {
    const { ecl, source } = retailInputs();
    const seeds: Array<[GatewayEcl6BoundaryState, GatewayEcl6BoundaryState]> = [
      [boundary(21, 15, 7, 'east'), boundary(22, 0, 7, 'east')],
      [boundary(22, 4, 15, 'south'), boundary(25, 0, 0, 'south')],
      [boundary(23, 3, 15, 'south'), boundary(25, 15, 0, 'south')],
      [boundary(23, 4, 15, 'south'), boundary(26, 0, 0, 'south')],
      [boundary(25, 12, 0, 'north'), boundary(23, 0, 15, 'north')],
      [boundary(26, 12, 0, 'north'), boundary(24, 0, 15, 'north')],
    ];
    for (const [before, after] of seeds) {
      const controller = new GatewayEcl6WildernessController(
        ecl,
        source,
        createGatewayEcl6ControllerState(before.selector, before.pose, { cadenceCounter: 2 }),
        missHooks,
      );
      const result = controller.forward();
      expect(result).toMatchObject({
        moved: true,
        elapsedMinutes: 0,
        remount: {
          fromSelector: before.selector,
          toSelector: after.selector,
          fromPose: before.pose,
          toPose: after.pose,
        },
        state: {
          selector: after.selector,
          pose: after.pose,
          suppressNextEncounter: false,
          clock: [0, 0, 0, 0, 0, 0, 0],
        },
      });
      expect(result.encounterChecks).toHaveLength(2);
      expect(result.encounterChecks![0]).toMatchObject({
        kind: 'suppressed', counterBefore: 2, counterAfter: 2,
      });
      expect(result.encounter).toBe(result.encounterChecks![1]);
      expect(result.state.cadenceCounter).toBe(result.encounter!.counterAfter);
      expect(controller.getSelectedMap().geoBlockId).toBe(after.selector);
    }
  });

  it.skipIf(!haveRetail)('serializes active progress without changing deterministic continuation', () => {
    const { ecl, source } = retailInputs();
    const make = () => new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 8, y: 2, facing: 'west' }),
      missHooks,
    );
    const uninterrupted = make();
    const resumedStart = make();
    for (const controller of [uninterrupted, resumedStart]) {
      for (let i = 0; i < 4; i++) controller.forward();
      controller.turnLeft();
      controller.forward();
      controller.turnRight();
    }
    const resumed = GatewayEcl6WildernessController.restore(
      ecl,
      source,
      JSON.parse(JSON.stringify(resumedStart.serialize())),
      missHooks,
    );
    for (let i = 0; i < 3; i++) {
      uninterrupted.forward();
      resumed.forward();
    }
    uninterrupted.turnLeft(); resumed.turnLeft();
    uninterrupted.forward(); resumed.forward();
    uninterrupted.turnRight(); resumed.turnRight();
    uninterrupted.forward(); resumed.forward();
    expect(resumed.serialize()).toEqual(uninterrupted.serialize());
  });

  it.skipIf(!haveRetail)('routes injected encounter decisions and preserves exact blockers/prompt facing', () => {
    const { ecl, source } = retailInputs();
    const contexts: Parameters<GatewayEcl6ControllerHooks['rollEncounter']>[0][] = [];
    const encounter = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 1, y: 4, facing: 'west' }, { cadenceCounter: 3 }),
      { rollEncounter: (context) => { contexts.push(context); return 0; } },
    );
    expect(encounter.forward().encounter).toMatchObject({
      kind: 'encounter', descriptor: 9, threshold: 6, roll: 0, counterAfter: 0,
    });
    expect(contexts).toEqual([
      expect.objectContaining({ maximumInclusive: 100, descriptor: 9, threshold: 6 }),
    ]);

    const avalanche = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 3, y: 5, facing: 'south' }),
      missHooks,
    );
    expect(avalanche.forward()).toMatchObject({
      moved: false, blocked: 'avalanche', elapsedMinutes: 0,
      state: { clock: [0, 0, 0, 0, 0, 0, 0], cadenceCounter: 0 },
    });

    const mapProbe = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 8, y: 2, facing: 'west' }),
      missHooks,
    ).getSelectedMap().map;
    const directions: Direction[] = ['north', 'east', 'south', 'west'];
    let wallSeed: { x: number; y: number; facing: Direction } | null = null;
    for (let y = 1; y < 15 && !wallSeed; y++) {
      for (let x = 1; x < 15 && !wallSeed; x++) {
        const cell = mapProbe.cells[y * 16 + x];
        const facing = directions.find((direction) =>
          cell.walls[direction] !== 0 && (cell.doors?.[direction] ?? 0) === 0);
        if (facing) wallSeed = { x, y, facing };
      }
    }
    expect(wallSeed).not.toBeNull();
    const wall = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, wallSeed!),
      missHooks,
    );
    expect(wall.forward()).toMatchObject({
      moved: false,
      blocked: 'wall',
      elapsedMinutes: GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES,
      state: { clock: [0, 0, 0, 12, 0, 0, 0], cadenceCounter: 0 },
    });

    // The literal ECL lower-remap arms omit N/S guards because the host/GEO owns tried-exit.
    // Retail directed edges prevent unrelated north-boundary poses from reaching those arms.
    for (const selector of [23, 24]) {
      const unrelatedEdge = new GatewayEcl6WildernessController(
        ecl,
        source,
        createGatewayEcl6ControllerState(selector, { x: 8, y: 0, facing: 'north' }),
        missHooks,
      );
      expect(unrelatedEdge.forward()).toMatchObject({
        moved: false,
        elapsedMinutes: 0,
        state: {
          selector,
          pose: { x: 8, y: 0, facing: 'north' },
          suppressNextEncounter: false,
        },
      });
      expect(unrelatedEdge.serialize().clock).toEqual([0, 0, 0, 0, 0, 0, 0]);
    }

    const invalidPassableRemap = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 4, y: 0, facing: 'north' }),
      missHooks,
    );
    expect(invalidPassableRemap.forward()).toMatchObject({
      moved: false,
      blocked: 'edge',
      elapsedMinutes: 0,
      state: {
        selector: 24,
        pose: { x: 4, y: 0, facing: 'north' },
        suppressNextEncounter: true,
      },
    });

    const adjacentFacing = new GatewayEcl6WildernessController(
      ecl,
      source,
      createGatewayEcl6ControllerState(24, { x: 0, y: 4, facing: 'east' }),
      missHooks,
    );
    const step = adjacentFacing.forward();
    expect(step.prompt).toBeUndefined();
    expect(step.state.phase).toBe('active');
  });
});
