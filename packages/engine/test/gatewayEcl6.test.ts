import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GATEWAY_ECL6_GEO_SELECTOR_ADDR,
  classifyGatewayEcl6Terrain,
  inspectGatewayEcl6Wilderness,
  runGatewayEcl6BoatAbandonChoice,
  runGatewayEcl6SundabarChoice,
  selectGatewayEcl6WildernessMap,
  readDaxDataBlocks,
  type GatewayEcl6GeoSource,
} from '../src/index.js';

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const required = ['ECL6.DAX', 'GEO6.DAX'];
const haveRetail = required.every((name) => existsSync(resolve(gateway, name)));

describe('Gateway ECL6#21 terrain classifier', () => {
  it('preserves the exact common, water, mountain, direct-exit, and location predicates', () => {
    for (const descriptor of [0, 2, 3, 4, 5, 7, 8, 9, 11, 13, 14, 16, 18, 64]) {
      expect(classifyGatewayEcl6Terrain(descriptor, 0)).toMatchObject({ kind: 'pass', descriptor });
      expect(classifyGatewayEcl6Terrain(descriptor, 1)).toEqual({
        kind: 'boat-abandon', descriptor, text: 'ABANDON THE BOAT?',
      });
      expect(classifyGatewayEcl6Terrain(descriptor, 0xffff)).toMatchObject({ kind: 'boat-abandon' });
    }
    for (const descriptor of [1, 10]) {
      expect(classifyGatewayEcl6Terrain(descriptor, 1)).toEqual({ kind: 'pass', descriptor });
      expect(classifyGatewayEcl6Terrain(descriptor, 0)).toMatchObject({
        kind: 'blocked', reason: 'water', text: 'THE WATER IS TOO DEEP.',
      });
      expect(classifyGatewayEcl6Terrain(descriptor, 2)).toMatchObject({ kind: 'blocked', reason: 'water' });
    }
    expect(classifyGatewayEcl6Terrain(6, 1)).toMatchObject({
      kind: 'blocked', reason: 'mountain', text: 'THE MOUNTAINS ARE IMPASSIBLE.',
    });
    for (const descriptor of [12, 15, 17, 65, 114]) {
      expect(classifyGatewayEcl6Terrain(descriptor, 1)).toEqual({ kind: 'pass', descriptor });
    }
    for (const descriptor of [115, 120, 127]) {
      expect(classifyGatewayEcl6Terrain(descriptor, 1)).toEqual({ kind: 'location', descriptor });
    }
    expect(classifyGatewayEcl6Terrain(0x86, 0)).toMatchObject({ kind: 'blocked', descriptor: 6 });
    expect(() => classifyGatewayEcl6Terrain(0, -1)).toThrow(/uint16/);
  });
});

function daxIndex(name: string): Map<number, Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(readFileSync(resolve(gateway, name))));
  return new Map(blocks.map((block) => [block.blockId, block.raw]));
}

describe('Gateway ECL6#21 dynamic wilderness contract', () => {
  it.skipIf(!haveRetail)('executes the exact boat-abandon YES/NO memory tails', () => {
    const ecl = daxIndex('ECL6.DAX').get(21)!;
    expect(runGatewayEcl6BoatAbandonChoice(ecl, 1, 0)).toEqual({
      choiceIndex: 0,
      status: 'exited',
      travelModeWord: 0,
      cancelHostMove: false,
      suppressNextEncounter: false,
    });
    expect(runGatewayEcl6BoatAbandonChoice(ecl, 2, 1)).toEqual({
      choiceIndex: 1,
      status: 'exited',
      travelModeWord: 2,
      cancelHostMove: true,
      suppressNextEncounter: true,
    });
    expect(() => runGatewayEcl6BoatAbandonChoice(ecl, 0, 0)).toThrow(/nonzero travel mode/);
  });

  it.skipIf(!haveRetail)('loads all six retail GEO selections while retaining ECL block 21 identity', () => {
    const ecl = daxIndex('ECL6.DAX').get(21)!;
    const geo = daxIndex('GEO6.DAX');
    const sources: GatewayEcl6GeoSource = {
      geoBlock: (id) => geo.get(id) ?? null,
    };

    const inspection = inspectGatewayEcl6Wilderness(ecl, sources);
    expect(inspection.eclBlockId).toBe(21);
    expect(inspection.selectorAddress).toBe(0x4c24);
    expect(inspection.loadFilesOperandKind).toBe('word');
    expect(inspection.maps.map((map) => map.geoBlockId)).toEqual([21, 22, 23, 24, 25, 26]);
    expect(inspection.maps.map((map) => [map.width, map.height])).toEqual(Array(6).fill([16, 16]));
    expect(inspection.maps.map((map) => map.nativeSaveCellDescriptor)).toEqual([4, 10, 8, 9, 2, 3]);
    expect(inspection.maps.map((map) => map.rawPieceOperands)).toEqual([
      [18, 50, 51],
      [18, 52, 53],
      [18, 54, 55],
      [18, 56, 57],
      [18, 58, 59],
      [18, 60, 61],
    ]);

    expect(inspection.cadence).toMatchObject({
      counterAddress: 0x4c00,
      minimumSteps: 3,
      increment: 1,
      resetVaddr: 0x8136,
      rollVaddr: 0x8c0b,
    });
    expect(inspection.movementClock).toEqual({ vaddr: 0x82db, timeStep: 12, timeSlot: 3 });
    expect(inspection.sundabar).toMatchObject({
      prompt: 'ENTER SUNDABAR?',
      callVaddr: 0x8812,
      callOperand: 0x080c,
      callRoutineId: 0x880d,
      recognizedRoutine: null,
      hostReturnChannelModeled: true,
      interactiveDecisionModeled: false,
      yesResultIndex: 0,
      noResultIndex: 1,
      continueWhenCompareEqual: false,
      gate: { geoBlockId: 24, x: 0, y: 4, facing: 3, descriptor: 120 },
      gameArea: 5,
      chainBlockId: 19,
    });
    expect(inspection.sundabar.modeledOutcomes).toEqual({
      yes: {
        choiceIndex: 0, status: 'chain', chainBlockId: 19, gameArea: 5,
        travelModeWord: 0, cancelHostMove: false, suppressNextEncounter: false,
      },
      no: {
        choiceIndex: 1, status: 'exited', chainBlockId: null, gameArea: null,
        travelModeWord: 0, cancelHostMove: true, suppressNextEncounter: true,
      },
    });
    expect(runGatewayEcl6SundabarChoice(ecl, 0)).toEqual({
      choiceIndex: 0, status: 'chain', chainBlockId: 19, gameArea: 5,
      travelModeWord: 0, cancelHostMove: false, suppressNextEncounter: false,
    });
    expect(runGatewayEcl6SundabarChoice(ecl, 1)).toEqual({
      choiceIndex: 1, status: 'exited', chainBlockId: null, gameArea: null,
      travelModeWord: 0, cancelHostMove: true, suppressNextEncounter: true,
    });
    expect(runGatewayEcl6SundabarChoice(ecl, 1, 1)).toEqual({
      choiceIndex: 1, status: 'exited', chainBlockId: null, gameArea: null,
      travelModeWord: 1, cancelHostMove: false, suppressNextEncounter: false,
    });
    expect(inspection.sundabar.nativeRoute).toEqual({
      start: { x: 8, y: 2, facing: 'west' },
      startDescriptor: 9,
      actions: [
        ...Array(4).fill('forward'),
        'left', 'forward', 'right',
        ...Array(3).fill('forward'),
        'left', 'forward', 'right', 'forward',
      ],
      successfulSteps: 10,
      allStepsMoved: true,
      end: { x: 0, y: 4, facing: 'west' },
      endCellDescriptor: 9,
      outwardBlocked: 'edge',
    });

    const persistedMemory = new Map<number, number>([[GATEWAY_ECL6_GEO_SELECTOR_ADDR, 24]]);
    const reloaded = selectGatewayEcl6WildernessMap(ecl, sources, persistedMemory);
    expect(reloaded.geoBlockId).toBe(24);
    expect(persistedMemory.get(GATEWAY_ECL6_GEO_SELECTOR_ADDR)).toBe(24);
  });

  it.skipIf(!haveRetail)('rejects an invented GEO selector instead of treating one submap as the wilderness', () => {
    const ecl = daxIndex('ECL6.DAX').get(21)!;
    const sources: GatewayEcl6GeoSource = { geoBlock: () => null };
    expect(() => selectGatewayEcl6WildernessMap(ecl, sources, new Map([[GATEWAY_ECL6_GEO_SELECTOR_ADDR, 20]])))
      .toThrow(/retail GEO 21\.\.26/);
  });
});
