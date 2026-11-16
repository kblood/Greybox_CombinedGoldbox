/**
 * Bounded support for Gateway to the Savage Frontier's ECL6#21 wilderness hub.
 *
 * This is deliberately not a campaign-route simulator.  The retail block owns one persistent
 * ECL area while selecting six different GEO maps through `[0x4C24]`; callers can use
 * {@link selectGatewayEcl6WildernessMap} to decode the currently selected map without pretending the
 * GEO id is a new ECL/save area.  {@link inspectGatewayEcl6Wilderness} pins the small byte-backed
 * contract needed by a browser/debug inspector: dynamic map selection, the three-step wandering
 * encounter gate, and Sundabar's native prompt call.  The exact non-dungeon renderer lives in
 * `gatewayOverland.ts`; an interactive route controller remains deliberately separate.
 */
import { decodeInstructionAt, ECL_GEN1_SHORT_GATEWAY, type EclInstruction } from '../ecl/disassemble.js';
import { EclVm, type EclCallRoutine, type EclEffect, type EclStatus } from '../ecl/vm.js';
import { decodeGeoBlock } from '../loaders/geo.js';
import type { GameMap } from '../model/index.js';
import { Explorer, type Pose } from './explorer.js';

export const GATEWAY_ECL6_WILDERNESS_BLOCK_ID = 21;
export const GATEWAY_ECL6_GEO_SELECTOR_ADDR = 0x4c24;
export const GATEWAY_ECL6_GEO_IDS = [21, 22, 23, 24, 25, 26] as const;

const VADDR = {
  loadFiles: 0x8094,
  encounterReset: 0x8136,
  cadenceCompare: 0x8bec,
  cadenceIncrement: 0x8bf7,
  encounterRoll: 0x8c0b,
  sundabarPrompt: 0x8803,
  sundabarCall: 0x8812,
  sundabarGameArea: 0x881e,
  sundabarChain: 0x8824,
  boatAbandonPrompt: 0x8373,
} as const;

const GATEWAY_ECL6_TRAVEL_MODE_WORD_ADDR = 0x4cf5;
const GATEWAY_ECL6_CANCEL_HOST_MOVE_ADDR = 0x7ec9;
const GATEWAY_ECL6_SUPPRESS_ENCOUNTER_ADDR = 0x7f80;

export type GatewayEcl6TerrainProbe =
  | { kind: 'pass'; descriptor: number }
  | { kind: 'location'; descriptor: number }
  | { kind: 'boat-abandon'; descriptor: number; text: 'ABANDON THE BOAT?' }
  | {
    kind: 'blocked';
    descriptor: number;
    reason: 'water' | 'mountain';
    text: 'THE WATER IS TOO DEEP.' | 'THE MOUNTAINS ARE IMPASSIBLE.';
  };

export interface GatewayEcl6BoatAbandonOutcome {
  choiceIndex: 0 | 1;
  status: EclStatus;
  travelModeWord: number;
  cancelHostMove: boolean;
  suppressNextEncounter: boolean;
}

function gatewayWord(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`Gateway ECL6 ${label} must be a uint16`);
  }
  return value;
}

/** Exact 0x8337 terrain table plus its 18..127 fallthrough ranges. */
export function classifyGatewayEcl6Terrain(
  rawDescriptor: number,
  travelModeWord: number,
): GatewayEcl6TerrainProbe {
  if (!Number.isInteger(rawDescriptor) || rawDescriptor < 0 || rawDescriptor > 0xff) {
    throw new Error('Gateway ECL6 terrain descriptor must be a byte');
  }
  const mode = gatewayWord(travelModeWord, 'travel mode word');
  const descriptor = rawDescriptor & 0x7f;
  if (descriptor >= 115) return { kind: 'location', descriptor };
  if (descriptor >= 65) return { kind: 'pass', descriptor };
  if (descriptor === 6) {
    return {
      kind: 'blocked',
      descriptor,
      reason: 'mountain',
      text: 'THE MOUNTAINS ARE IMPASSIBLE.',
    };
  }
  if (descriptor === 1 || descriptor === 10) {
    return mode === 1
      ? { kind: 'pass', descriptor }
      : {
        kind: 'blocked',
        descriptor,
        reason: 'water',
        text: 'THE WATER IS TOO DEEP.',
      };
  }
  if (descriptor === 12 || descriptor === 15 || descriptor === 17) {
    return { kind: 'pass', descriptor };
  }
  return mode === 0
    ? { kind: 'pass', descriptor }
    : { kind: 'boat-abandon', descriptor, text: 'ABANDON THE BOAT?' };
}

export interface GatewayEcl6MapInspection {
  geoBlockId: number;
  width: number;
  height: number;
  nativeSaveCellDescriptor: number;
  rawPieceOperands: [number, number, number];
}

export interface GatewayEcl6GeoSource {
  geoBlock(blockId: number): Uint8Array | null;
}

export interface GatewayEcl6SelectedMap {
  map: GameMap;
  /** Raw GEO plane 0; GAME.OVR treats this as the overland terrain-symbol byte plane. */
  terrainPlane: Uint8Array;
  geoBlockId: number;
  rawPieceOperands: [number, number, number];
}

export interface GatewayEcl6SundabarOutcome {
  choiceIndex: 0 | 1;
  status: EclStatus;
  chainBlockId: number | null;
  gameArea: number | null;
  travelModeWord: number;
  cancelHostMove: boolean;
  suppressNextEncounter: boolean;
}

export interface GatewayEcl6WildernessInspection {
  eclBlockId: 21;
  selectorAddress: number;
  loadFilesVaddr: number;
  loadFilesOperandKind: 'word';
  maps: GatewayEcl6MapInspection[];
  cadence: {
    counterAddress: number;
    minimumSteps: number;
    increment: number;
    resetVaddr: number;
    rollVaddr: number;
  };
  movementClock: {
    vaddr: number;
    timeStep: number;
    timeSlot: number;
  };
  sundabar: {
    prompt: string;
    callVaddr: number;
    callOperand: number;
    callRoutineId: number;
    recognizedRoutine: EclCallRoutine | null;
    hostReturnChannelModeled: true;
    interactiveDecisionModeled: false;
    yesResultIndex: 0;
    noResultIndex: 1;
    continueWhenCompareEqual: false;
    modeledOutcomes: {
      yes: GatewayEcl6SundabarOutcome;
      no: GatewayEcl6SundabarOutcome;
    };
    gate: { geoBlockId: 24; x: 0; y: 4; facing: 3; descriptor: 120 };
    nativeRoute: {
      start: Pose;
      startDescriptor: number;
      actions: readonly string[];
      successfulSteps: number;
      allStepsMoved: true;
      end: Pose;
      endCellDescriptor: number;
      outwardBlocked: 'edge';
    };
    gameArea: number;
    chainBlockId: number;
  };
}

function at(ecl: Uint8Array, vaddr: number, opcode: number): EclInstruction {
  const offset = vaddr - ECL_GEN1_SHORT_GATEWAY.vbase;
  const decoded = decodeInstructionAt(ecl, offset, ECL_GEN1_SHORT_GATEWAY.vbase, ECL_GEN1_SHORT_GATEWAY);
  if (!decoded.ins || decoded.badOpcode || decoded.truncated || decoded.ins.opcode !== opcode) {
    throw new Error(`Gateway ECL6#21 contract mismatch at 0x${vaddr.toString(16)}`);
  }
  return decoded.ins;
}

function wordAddress(arg: EclInstruction['args'][number] | undefined, label: string): number {
  if (!arg || arg.kind !== 'word') throw new Error(`Gateway ECL6#21 ${label} is not a word operand`);
  return arg.word;
}

function immediate(arg: EclInstruction['args'][number] | undefined, label: string): number {
  if (!arg || arg.kind !== 'imm') throw new Error(`Gateway ECL6#21 ${label} is not an immediate operand`);
  return arg.word;
}

/**
 * Decode the GEO selected by retail `[0x4C24]`, preserving ECL block 21 as the area's identity.
 * The supplied memory map is shared with `EclVm`, so initial-entry writes remain available to a
 * later live remount/save integration.  Its raw plane 0 and piece operands feed the dedicated
 * Gateway overland compositor; unlike the first-person dungeon path, this branch needs no WALLDEF.
 */
export function selectGatewayEcl6WildernessMap(
  ecl: Uint8Array,
  sources: GatewayEcl6GeoSource,
  memory: Map<number, number>,
): GatewayEcl6SelectedMap {
  const selected = memory.get(GATEWAY_ECL6_GEO_SELECTOR_ADDR);
  if (selected === undefined || !(GATEWAY_ECL6_GEO_IDS as readonly number[]).includes(selected)) {
    throw new Error('Gateway ECL6#21 requires [0x4C24] to select retail GEO 21..26');
  }
  const vm = new EclVm(ecl, {
    memory,
    dialect: ECL_GEN1_SHORT_GATEWAY,
  });
  const run = vm.run();
  const loadFiles = run.effects.find((effect): effect is Extract<EclEffect, { type: 'loadFiles' }> => effect.type === 'loadFiles');
  const loadPieces = run.effects.find((effect): effect is Extract<EclEffect, { type: 'loadPieces' }> => effect.type === 'loadPieces');
  if (!loadFiles || !loadPieces) throw new Error('Gateway ECL6#21 initial entry emitted no complete GEO/piece selection');
  if (loadFiles.geoBlockId !== selected) {
    throw new Error(`Gateway ECL6#21 selected GEO ${selected} but LOAD_FILES emitted ${loadFiles.geoBlockId}`);
  }
  const geo = sources.geoBlock(selected);
  if (!geo) throw new Error(`Gateway ECL6#21 GEO6 block ${selected} not found`);
  const decoded = decodeGeoBlock(geo, `Gateway ECL6#21 / GEO6#${selected}`);
  return {
    map: decoded.map,
    terrainPlane: decoded.wallPlane0,
    geoBlockId: selected,
    rawPieceOperands: [...loadPieces.operands],
  };
}

/**
 * Run only retail ECL6#21's Sundabar prompt tail with the proven GAME.OVR choice comparison.
 * This is a pure engine driver for tests/future UI: it does not itself present or choose a menu.
 */
export function runGatewayEcl6SundabarChoice(
  ecl: Uint8Array,
  choiceIndex: 0 | 1,
  travelModeWord = 0,
): GatewayEcl6SundabarOutcome {
  const mode = gatewayWord(travelModeWord, 'travel mode word');
  const memory = new Map<number, number>([[GATEWAY_ECL6_TRAVEL_MODE_WORD_ADDR, mode]]);
  let handled = false;
  const vm = new EclVm(ecl, {
    entry: VADDR.sundabarPrompt - ECL_GEN1_SHORT_GATEWAY.vbase,
    dialect: ECL_GEN1_SHORT_GATEWAY,
    memory,
    onCall: (effect) => {
      if (effect.routineId !== 0x880d) return;
      handled = true;
      return { comparison: { left: choiceIndex, right: 1 } };
    },
  });
  const run = vm.run();
  if (!handled) throw new Error('Gateway ECL6#21 Sundabar host routine 0x880D was not dispatched');
  const setGameArea = run.effects.find((effect) => effect.type === 'setGameArea');
  return {
    choiceIndex,
    status: run.status,
    chainBlockId: run.chainBlockId ?? null,
    gameArea: setGameArea?.type === 'setGameArea' ? setGameArea.gameArea : null,
    travelModeWord: memory.get(GATEWAY_ECL6_TRAVEL_MODE_WORD_ADDR) ?? 0,
    cancelHostMove: (memory.get(GATEWAY_ECL6_CANCEL_HOST_MOVE_ADDR) ?? 0) === 0xff,
    suppressNextEncounter: (memory.get(GATEWAY_ECL6_SUPPRESS_ENCOUNTER_ADDR) ?? 0) === 0xff,
  };
}

/** Execute the retail `ABANDON THE BOAT?` tail with GAME.OVR's zero-based YES/NO result. */
export function runGatewayEcl6BoatAbandonChoice(
  ecl: Uint8Array,
  travelModeWord: number,
  choiceIndex: 0 | 1,
): GatewayEcl6BoatAbandonOutcome {
  const mode = gatewayWord(travelModeWord, 'travel mode word');
  if (mode === 0) throw new Error('Gateway ECL6 boat-abandon choice requires a nonzero travel mode');
  const memory = new Map<number, number>([[GATEWAY_ECL6_TRAVEL_MODE_WORD_ADDR, mode]]);
  let handled = false;
  const vm = new EclVm(ecl, {
    entry: VADDR.boatAbandonPrompt - ECL_GEN1_SHORT_GATEWAY.vbase,
    dialect: ECL_GEN1_SHORT_GATEWAY,
    memory,
    onCall: (effect) => {
      if (effect.routineId !== 0x880d) return;
      handled = true;
      return { comparison: { left: choiceIndex, right: 1 } };
    },
  });
  const run = vm.run();
  if (!handled) throw new Error('Gateway ECL6#21 boat host routine 0x880D was not dispatched');
  return {
    choiceIndex,
    status: run.status,
    travelModeWord: memory.get(GATEWAY_ECL6_TRAVEL_MODE_WORD_ADDR) ?? 0,
    cancelHostMove: (memory.get(GATEWAY_ECL6_CANCEL_HOST_MOVE_ADDR) ?? 0) === 0xff,
    suppressNextEncounter: (memory.get(GATEWAY_ECL6_SUPPRESS_ENCOUNTER_ADDR) ?? 0) === 0xff,
  };
}

/** Inspect only ECL6#21's byte-supported map/cadence/host-call boundary. */
export function inspectGatewayEcl6Wilderness(
  ecl: Uint8Array,
  sources: GatewayEcl6GeoSource,
): GatewayEcl6WildernessInspection {
  const loadFiles = at(ecl, VADDR.loadFiles, 0x21);
  const selectorAddress = wordAddress(loadFiles.args[0], 'LOAD_FILES selector');
  if (selectorAddress !== GATEWAY_ECL6_GEO_SELECTOR_ADDR) {
    throw new Error(`Gateway ECL6#21 LOAD_FILES selector moved to 0x${selectorAddress.toString(16)}`);
  }

  const cadenceCompare = at(ecl, VADDR.cadenceCompare, 0x03);
  const counterAddress = wordAddress(cadenceCompare.args[0], 'cadence counter');
  const minimumSteps = immediate(cadenceCompare.args[1], 'cadence threshold');
  const cadenceIncrement = at(ecl, VADDR.cadenceIncrement, 0x04);
  const increment = immediate(cadenceIncrement.args[0], 'cadence increment');
  const incrementSource = wordAddress(cadenceIncrement.args[1], 'cadence increment source');
  const incrementDest = wordAddress(cadenceIncrement.args[2], 'cadence increment destination');
  const encounterReset = at(ecl, VADDR.encounterReset, 0x09);
  if (incrementSource !== counterAddress || incrementDest !== counterAddress ||
      immediate(encounterReset.args[0], 'encounter reset') !== 0 ||
      wordAddress(encounterReset.args[1], 'encounter reset destination') !== counterAddress) {
    throw new Error('Gateway ECL6#21 wandering-encounter counter contract changed');
  }
  at(ecl, VADDR.encounterRoll, 0x08);

  const movementClockVm = new EclVm(ecl, {
    entry: 0x82db - ECL_GEN1_SHORT_GATEWAY.vbase,
    dialect: ECL_GEN1_SHORT_GATEWAY,
  });
  const movementClockStep = movementClockVm.step();
  const movementClock = movementClockStep.effects.find((effect) => effect.type === 'eclClock');
  if (!movementClock || movementClock.type !== 'eclClock') {
    throw new Error('Gateway ECL6#21 movement ECL_CLOCK emitted no clock effect');
  }

  const promptIns = at(ecl, VADDR.sundabarPrompt, 0x12);
  const prompt = promptIns.args[0]?.text ?? '';
  const callIns = at(ecl, VADDR.sundabarCall, 0x2d);
  const callVm = new EclVm(ecl, {
    entry: callIns.offset,
    dialect: ECL_GEN1_SHORT_GATEWAY,
  });
  const callStep = callVm.step();
  const call = callStep.effects.find((effect) => effect.type === 'call');
  if (!call || call.type !== 'call') throw new Error('Gateway ECL6#21 Sundabar CALL emitted no host effect');
  const gameAreaIns = at(ecl, VADDR.sundabarGameArea, 0x09);
  const chainIns = at(ecl, VADDR.sundabarChain, 0x20);

  const maps = GATEWAY_ECL6_GEO_IDS.map((geoBlockId) => {
    const selected = selectGatewayEcl6WildernessMap(
      ecl,
      sources,
      new Map<number, number>([[GATEWAY_ECL6_GEO_SELECTOR_ADDR, geoBlockId]]),
    );
    return {
      geoBlockId,
      width: selected.map.width,
      height: selected.map.height,
      nativeSaveCellDescriptor: selected.map.cells[2 * selected.map.width + 8]?.floor ?? 0,
      rawPieceOperands: selected.rawPieceOperands,
    };
  });
  const geo24 = selectGatewayEcl6WildernessMap(
    ecl,
    sources,
    new Map<number, number>([[GATEWAY_ECL6_GEO_SELECTOR_ADDR, 24]]),
  );
  const routeExplorer = new Explorer(geo24.map, { x: 8, y: 2, facing: 'west' });
  const routeActions = [
    ...Array<string>(4).fill('forward'),
    'left', 'forward', 'right',
    ...Array<string>(3).fill('forward'),
    'left', 'forward', 'right', 'forward',
  ] as const;
  let successfulSteps = 0;
  for (const action of routeActions) {
    if (action === 'left') routeExplorer.turnLeft();
    else if (action === 'right') routeExplorer.turnRight();
    else {
      const pose = routeExplorer.getPose();
      const step = routeExplorer.forward();
      if (!step.moved) throw new Error(`Gateway ECL6#21 native route blocked at (${pose.x},${pose.y}) ${pose.facing}`);
      successfulSteps++;
    }
  }
  const routeEnd = routeExplorer.getPose();
  const outward = routeExplorer.forward();
  if (outward.blocked !== 'edge') throw new Error('Gateway ECL6#21 Sundabar route does not end at the west map edge');
  const yesOutcome = runGatewayEcl6SundabarChoice(ecl, 0);
  const noOutcome = runGatewayEcl6SundabarChoice(ecl, 1);

  return {
    eclBlockId: GATEWAY_ECL6_WILDERNESS_BLOCK_ID,
    selectorAddress,
    loadFilesVaddr: VADDR.loadFiles,
    loadFilesOperandKind: 'word',
    maps,
    cadence: {
      counterAddress,
      minimumSteps,
      increment,
      resetVaddr: VADDR.encounterReset,
      rollVaddr: VADDR.encounterRoll,
    },
    movementClock: {
      vaddr: 0x82db,
      timeStep: movementClock.timeStep,
      timeSlot: movementClock.timeSlot,
    },
    sundabar: {
      prompt,
      callVaddr: VADDR.sundabarCall,
      callOperand: call.operand,
      callRoutineId: call.routineId,
      recognizedRoutine: call.routine ?? null,
      hostReturnChannelModeled: true,
      interactiveDecisionModeled: false,
      // Gateway GAME.OVR's own `~Yes ~No` host menu compares its zero-based result with index 1:
      // YES(0) leaves NE true and falls through; NO(1) leaves EQ true for the following IF_EQ.
      // This is inspection metadata only — EclVm does not yet accept a CALL comparison result.
      yesResultIndex: 0,
      noResultIndex: 1,
      continueWhenCompareEqual: false,
      modeledOutcomes: { yes: yesOutcome, no: noOutcome },
      gate: { geoBlockId: 24, x: 0, y: 4, facing: 3, descriptor: 120 },
      nativeRoute: {
        start: { x: 8, y: 2, facing: 'west' },
        startDescriptor: geo24.map.cells[2 * geo24.map.width + 8]?.floor ?? 0,
        actions: routeActions,
        successfulSteps,
        allStepsMoved: true,
        end: routeEnd,
        endCellDescriptor: routeExplorer.currentCell().floor ?? 0,
        outwardBlocked: 'edge',
      },
      gameArea: immediate(gameAreaIns.args[0], 'Sundabar game_area'),
      chainBlockId: immediate(chainIns.args[0], 'Sundabar NEWECL target'),
    },
  };
}
