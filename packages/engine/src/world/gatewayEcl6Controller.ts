/**
 * Pure interactive controller for Gateway's ECL6#21 six-map wilderness.
 *
 * The controller owns only deterministic engine state.  Disk access is supplied as decompressed
 * GEO blocks, encounter randomness is an injected decision, and UI prompts are explicit paused
 * states.  Rendering remains the responsibility of `gatewayOverland.ts`.
 */
import type { Direction } from '../model/index.js';
import {
  SLOT_HOUR,
  SLOT_MINUTE,
  TIME_SCALES,
  newClock,
  stepGameTime,
  type ClockSlots,
} from './gameClock.js';
import {
  GATEWAY_ECL6_GEO_IDS,
  GATEWAY_ECL6_GEO_SELECTOR_ADDR,
  GATEWAY_ECL6_WILDERNESS_BLOCK_ID,
  classifyGatewayEcl6Terrain,
  runGatewayEcl6BoatAbandonChoice,
  runGatewayEcl6SundabarChoice,
  selectGatewayEcl6WildernessMap,
  type GatewayEcl6GeoSource,
  type GatewayEcl6SelectedMap,
} from './gatewayEcl6.js';
import { Explorer, type Pose } from './explorer.js';

export const GATEWAY_ECL6_CONTROLLER_STATE_VERSION = 2 as const;
export const GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES = 12 * 60;
export const GATEWAY_ECL6_STEP_MINUTES = 12 * 60 + 1;
export const GATEWAY_ECL6_ENCOUNTER_THRESHOLDS = [
  7, 0, 15, 30, 20, 0, 0, 25, 5, 6, 6, 0, 6, 0, 0, 6, 35, 35,
] as const;

export type GatewayEcl6ControllerPhase =
  | 'active'
  | 'boat-abandon-prompt'
  | 'companion-prompt'
  | 'sundabar-prompt'
  | 'chained';
export type GatewayEcl6SundabarPromptSource = 'boundary' | 'location';

export interface GatewayEcl6SundabarPrompt {
  kind: 'sundabar';
  text: 'ENTER SUNDABAR?';
  source: GatewayEcl6SundabarPromptSource;
}

export interface GatewayEcl6InteriorContinuation {
  kind: 'interior';
  targetPose: Pose;
  descriptor: number;
}

export interface GatewayEcl6BoundaryContinuation {
  kind: 'boundary';
  selector: number;
  pose: Pose;
  nextGuardIndex: number;
}

export interface GatewayEcl6BoatAbandonPrompt {
  kind: 'boat-abandon';
  text: 'ABANDON THE BOAT?';
  continuation: GatewayEcl6InteriorContinuation;
}

export type GatewayEcl6CompanionName = 'EREK' | 'MUTHTUR' | 'RISHPAL';

export interface GatewayEcl6CompanionState {
  name: GatewayEcl6CompanionName;
  active: boolean;
}

export interface GatewayEcl6CompanionPrompt {
  kind: 'companion';
  companion: GatewayEcl6CompanionName;
  pictureId: 0x66 | 0x4d | 0x22;
  text: string;
  choices: readonly ['CONTINUE', 'GO BACK'];
  continuation: GatewayEcl6BoundaryContinuation;
}

export type GatewayEcl6PendingPrompt =
  | GatewayEcl6SundabarPrompt
  | GatewayEcl6BoatAbandonPrompt
  | GatewayEcl6CompanionPrompt;

export interface GatewayEcl6ChainState {
  gameArea: 5;
  eclBlockId: 19;
}

/** JSON-safe state. Restoring it remounts `selector` while retaining ECL block 21 identity. */
export interface GatewayEcl6ControllerState {
  version: typeof GATEWAY_ECL6_CONTROLLER_STATE_VERSION;
  eclBlockId: typeof GATEWAY_ECL6_WILDERNESS_BLOCK_ID;
  selector: number;
  pose: Pose;
  clock: ClockSlots;
  cadenceCounter: number;
  suppressNextEncounter: boolean;
  travelModeWord: number;
  companions: GatewayEcl6CompanionState[];
  phase: GatewayEcl6ControllerPhase;
  pendingPrompt: GatewayEcl6PendingPrompt | null;
  chain: GatewayEcl6ChainState | null;
}

/** Read-only compatibility shape for controller saves emitted before travel/companion state v2. */
export interface GatewayEcl6ControllerStateV1 extends Omit<
  GatewayEcl6ControllerState,
  'version' | 'travelModeWord' | 'companions' | 'phase' | 'pendingPrompt'
> {
  version: 1;
  phase: 'active' | 'sundabar-prompt' | 'chained';
  pendingPrompt: GatewayEcl6SundabarPrompt | null;
}

export type GatewayEcl6RestorableControllerState =
  | GatewayEcl6ControllerState
  | GatewayEcl6ControllerStateV1;

export interface GatewayEcl6EncounterRollContext {
  selector: number;
  pose: Pose;
  descriptor: number;
  threshold: number;
  counter: number;
  /** Gateway opcode 08 with operand 100 yields the inclusive domain 0..100. */
  maximumInclusive: 100;
}

export interface GatewayEcl6ControllerHooks {
  /** Required deterministic replacement for Gateway's native RANDOM 100 call. */
  rollEncounter(context: GatewayEcl6EncounterRollContext): number;
}

export type GatewayEcl6EncounterKind =
  | 'suppressed'
  | 'descriptor-ineligible'
  | 'cooldown'
  | 'miss'
  | 'encounter';

export interface GatewayEcl6EncounterResult {
  kind: GatewayEcl6EncounterKind;
  descriptor: number;
  threshold: number;
  counterBefore: number;
  counterAfter: number;
  suppressAfter: false;
  rolled: boolean;
  roll: number | null;
  encounter: boolean;
}

export interface GatewayEcl6BoundaryState {
  selector: number;
  pose: Pose;
}

export interface GatewayEcl6Remount {
  fromSelector: number;
  toSelector: number;
  fromPose: Pose;
  toPose: Pose;
}

export type GatewayEcl6BlockReason = 'wall' | 'edge' | 'avalanche' | 'mountain' | 'water';
export type GatewayEcl6ControllerAction =
  | 'turn-left'
  | 'turn-right'
  | 'turn-around'
  | 'forward'
  | 'boat-choice'
  | 'companion-choice'
  | 'sundabar-choice';

export interface GatewayEcl6ControllerResult {
  action: GatewayEcl6ControllerAction;
  state: GatewayEcl6ControllerState;
  moved: boolean;
  blocked?: GatewayEcl6BlockReason;
  elapsedMinutes: number;
  encounter?: GatewayEcl6EncounterResult;
  /** One pass normally; remount loader fallthrough produces suppressed + host passes. */
  encounterChecks?: readonly GatewayEcl6EncounterResult[];
  remount?: GatewayEcl6Remount;
  prompt?: GatewayEcl6PendingPrompt;
  chain?: GatewayEcl6ChainState;
  choiceIndex?: 0 | 1;
  message?: string;
}

function copyPose(pose: Pose): Pose {
  return { x: pose.x, y: pose.y, facing: pose.facing };
}

function copyPrompt(prompt: GatewayEcl6PendingPrompt | null): GatewayEcl6PendingPrompt | null {
  if (!prompt) return null;
  if (prompt.kind === 'sundabar') return { ...prompt };
  if (prompt.kind === 'boat-abandon') {
    return {
      ...prompt,
      continuation: { ...prompt.continuation, targetPose: copyPose(prompt.continuation.targetPose) },
    };
  }
  return {
    ...prompt,
    choices: ['CONTINUE', 'GO BACK'],
    continuation: { ...prompt.continuation, pose: copyPose(prompt.continuation.pose) },
  };
}

function copyState(state: GatewayEcl6ControllerState): GatewayEcl6ControllerState {
  return {
    ...state,
    pose: copyPose(state.pose),
    clock: [...state.clock],
    pendingPrompt: copyPrompt(state.pendingPrompt),
    companions: state.companions.map((companion) => ({ ...companion })),
    chain: state.chain ? { ...state.chain } : null,
  };
}

/** Build a validated active-state seed without inventing a default campaign entrance. */
export function createGatewayEcl6ControllerState(
  selector: number,
  pose: Pose,
  options: {
    clock?: ClockSlots;
    cadenceCounter?: number;
    suppressNextEncounter?: boolean;
    travelModeWord?: number;
    companions?: readonly GatewayEcl6CompanionState[];
  } = {},
): GatewayEcl6ControllerState {
  const state: GatewayEcl6ControllerState = {
    version: GATEWAY_ECL6_CONTROLLER_STATE_VERSION,
    eclBlockId: GATEWAY_ECL6_WILDERNESS_BLOCK_ID,
    selector,
    pose: copyPose(pose),
    clock: options.clock ? [...options.clock] : newClock(),
    cadenceCounter: options.cadenceCounter ?? 0,
    suppressNextEncounter: options.suppressNextEncounter ?? false,
    travelModeWord: options.travelModeWord ?? 0,
    companions: (options.companions ?? []).map((companion) => ({ ...companion })),
    phase: 'active',
    pendingPrompt: null,
    chain: null,
  };
  validateState(state);
  return state;
}

function isDirection(value: unknown): value is Direction {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west';
}

function validateState(state: GatewayEcl6ControllerState): void {
  if (state.version !== GATEWAY_ECL6_CONTROLLER_STATE_VERSION ||
      state.eclBlockId !== GATEWAY_ECL6_WILDERNESS_BLOCK_ID) {
    throw new Error('Gateway ECL6 controller state has an unsupported identity/version');
  }
  if (!(GATEWAY_ECL6_GEO_IDS as readonly number[]).includes(state.selector)) {
    throw new Error(`Gateway ECL6 controller selector ${state.selector} is outside retail GEO 21..26`);
  }
  if (!Number.isInteger(state.pose.x) || !Number.isInteger(state.pose.y) ||
      state.pose.x < 0 || state.pose.x > 15 || state.pose.y < 0 || state.pose.y > 15 ||
      !isDirection(state.pose.facing)) {
    throw new Error('Gateway ECL6 controller pose is invalid');
  }
  if (!Array.isArray(state.clock) || state.clock.length !== 7 ||
      state.clock.some((value, index) => !Number.isInteger(value) || value < 0 || value >= TIME_SCALES[index])) {
    throw new Error('Gateway ECL6 controller clock is invalid');
  }
  if (!Number.isInteger(state.cadenceCounter) || state.cadenceCounter < 0 || state.cadenceCounter > 3) {
    throw new Error('Gateway ECL6 controller cadence counter must be 0..3');
  }
  if (!Number.isInteger(state.travelModeWord) || state.travelModeWord < 0 || state.travelModeWord > 0xffff) {
    throw new Error('Gateway ECL6 controller travel mode word must be a uint16');
  }
  const companionNames = new Set<GatewayEcl6CompanionName>();
  if (!Array.isArray(state.companions) || state.companions.some((companion) => {
    const validName = companion.name === 'EREK' || companion.name === 'MUTHTUR' || companion.name === 'RISHPAL';
    const duplicate = companionNames.has(companion.name);
    companionNames.add(companion.name);
    return !validName || duplicate || typeof companion.active !== 'boolean';
  })) {
    throw new Error('Gateway ECL6 controller companion state is invalid');
  }
  if (typeof state.suppressNextEncounter !== 'boolean' ||
      !['active', 'boat-abandon-prompt', 'companion-prompt', 'sundabar-prompt', 'chained'].includes(state.phase)) {
    throw new Error('Gateway ECL6 controller phase/suppression state is invalid');
  }
  if (state.phase === 'active' && (state.pendingPrompt !== null || state.chain !== null)) {
    throw new Error('Gateway ECL6 active state cannot carry a prompt or chain');
  }
  if (state.phase === 'sundabar-prompt' &&
      (state.pendingPrompt?.kind !== 'sundabar' || state.pendingPrompt.text !== 'ENTER SUNDABAR?' ||
       (state.pendingPrompt.source !== 'boundary' && state.pendingPrompt.source !== 'location') ||
       state.chain !== null)) {
    throw new Error('Gateway ECL6 prompt state is incomplete');
  }
  if (state.phase === 'boat-abandon-prompt') {
    const prompt = state.pendingPrompt;
    const delta = FORWARD_DELTA[state.pose.facing];
    if (prompt?.kind !== 'boat-abandon' || prompt.text !== 'ABANDON THE BOAT?' || state.chain !== null ||
        prompt.continuation.kind !== 'interior' || prompt.continuation.descriptor < 0 ||
        prompt.continuation.descriptor > 127 || !Number.isInteger(prompt.continuation.descriptor) ||
        !Number.isInteger(prompt.continuation.targetPose.x) || !Number.isInteger(prompt.continuation.targetPose.y) ||
        prompt.continuation.targetPose.x < 0 || prompt.continuation.targetPose.x > 15 ||
        prompt.continuation.targetPose.y < 0 || prompt.continuation.targetPose.y > 15 ||
        !isDirection(prompt.continuation.targetPose.facing) || state.travelModeWord === 0 ||
        prompt.continuation.targetPose.x !== state.pose.x + delta.dx ||
        prompt.continuation.targetPose.y !== state.pose.y + delta.dy ||
        prompt.continuation.targetPose.facing !== state.pose.facing ||
        classifyGatewayEcl6Terrain(prompt.continuation.descriptor, state.travelModeWord).kind !== 'boat-abandon') {
      throw new Error('Gateway ECL6 boat prompt state is incomplete');
    }
  }
  if (state.phase === 'companion-prompt') {
    const prompt = state.pendingPrompt;
    const guard = prompt?.kind === 'companion'
      ? GATEWAY_ECL6_COMPANION_GUARDS.find((candidate) => candidate.name === prompt.companion)
      : undefined;
    const guardIndex = guard ? GATEWAY_ECL6_COMPANION_GUARDS.indexOf(guard) : -1;
    const companion = prompt?.kind === 'companion'
      ? state.companions.find((candidate) => candidate.name === prompt.companion)
      : undefined;
    if (prompt?.kind !== 'companion' || state.chain !== null || prompt.continuation.kind !== 'boundary' ||
        !guard || prompt.pictureId !== guard.pictureId || prompt.text !== guard.text ||
        !companion?.active || prompt.continuation.nextGuardIndex !== guardIndex + 1 ||
        prompt.continuation.selector !== state.selector ||
        JSON.stringify(prompt.continuation.pose) !== JSON.stringify(state.pose) ||
        !Number.isInteger(prompt.continuation.nextGuardIndex) || prompt.continuation.nextGuardIndex < 0 ||
        prompt.continuation.nextGuardIndex > 3 || prompt.choices[0] !== 'CONTINUE' ||
        prompt.choices[1] !== 'GO BACK') {
      throw new Error('Gateway ECL6 companion prompt state is incomplete');
    }
  }
  if (state.phase === 'chained' &&
      (state.pendingPrompt !== null || state.chain?.gameArea !== 5 || state.chain.eclBlockId !== 19)) {
    throw new Error('Gateway ECL6 chained state is incomplete');
  }
}

/**
 * Literal ECL transition function at 0x893D..0x8B2F. The native host owns the passable outward-edge
 * predicate; the interactive controller establishes it through Explorer before calling this helper.
 */
export function transitionGatewayEcl6Boundary(
  state: GatewayEcl6BoundaryState,
): GatewayEcl6BoundaryState | null {
  const { selector, pose } = state;
  const { x, y, facing } = pose;
  const target = (next: number, nx: number, ny: number): GatewayEcl6BoundaryState => ({
    selector: next,
    pose: { x: nx, y: ny, facing },
  });
  if (selector === 21) return facing === 'east' ? target(22, 0, y) : null;
  if (selector === 22) {
    if (x === 15 && facing === 'east') return target(23, 0, y);
    if (x === 0) return target(21, 15, y);
    if (y !== 15 || x < 4) return null;
    return target(25, x - 4, 0);
  }
  if (selector === 23) {
    if (x === 15 && facing === 'east') return target(24, 0, y);
    if (x === 0 && facing === 'west') return target(22, 15, y);
    return x < 4 ? target(25, x + 12, 0) : target(26, x - 4, 0);
  }
  if (selector === 24) {
    if (x === 0 && facing === 'west') return target(23, 15, y);
    return target(26, x + 12, 0);
  }
  if (selector === 25) {
    if (x === 15 && facing === 'east') return target(26, 0, y);
    if (y !== 0) return null;
    return x < 12 ? target(22, x + 4, 15) : target(23, x - 12, 15);
  }
  if (selector === 26) {
    if (x === 0 && facing === 'west') return target(25, 15, y);
    if (y !== 0) return null;
    return x < 12 ? target(23, x + 4, 15) : target(24, x - 12, 15);
  }
  return null;
}

/** Exact SearchLocation encounter cadence, with the native inclusive 0..100 roll supplied. */
export function advanceGatewayEcl6Encounter(
  counter: number,
  suppress: boolean,
  descriptor: number,
  roll?: number,
): GatewayEcl6EncounterResult {
  if (!Number.isInteger(counter) || counter < 0 || counter > 3 ||
      !Number.isInteger(descriptor) || descriptor < 0) {
    throw new Error('Gateway ECL6 encounter state is invalid');
  }
  const threshold = descriptor >= 0 && descriptor < GATEWAY_ECL6_ENCOUNTER_THRESHOLDS.length
    ? GATEWAY_ECL6_ENCOUNTER_THRESHOLDS[descriptor]
    : 0;
  const base = {
    descriptor,
    threshold,
    counterBefore: counter,
    suppressAfter: false as const,
  };
  if (suppress) {
    return { ...base, kind: 'suppressed', counterAfter: counter, rolled: false, roll: null, encounter: false };
  }
  if (descriptor >= 18) {
    return {
      ...base,
      kind: 'descriptor-ineligible',
      counterAfter: counter,
      rolled: false,
      roll: null,
      encounter: false,
    };
  }
  if (counter < 3) {
    return {
      ...base,
      kind: 'cooldown',
      counterAfter: counter + 1,
      rolled: false,
      roll: null,
      encounter: false,
    };
  }
  if (!Number.isInteger(roll) || roll! < 0 || roll! > 100) {
    throw new Error('Gateway ECL6 eligible encounter check requires an integer roll in 0..100');
  }
  const encounter = roll! < threshold;
  return {
    ...base,
    kind: encounter ? 'encounter' : 'miss',
    counterAfter: encounter ? 0 : counter,
    rolled: true,
    roll: roll!,
    encounter,
  };
}

function isOutwardBoundary(pose: Pose): boolean {
  return (pose.facing === 'north' && pose.y === 0) ||
    (pose.facing === 'east' && pose.x === 15) ||
    (pose.facing === 'south' && pose.y === 15) ||
    (pose.facing === 'west' && pose.x === 0);
}

function isSundabarBoundary(selector: number, pose: Pose): boolean {
  return selector === 24 && pose.x === 0 && pose.y === 4 && pose.facing === 'west';
}

function isAvalancheBlocked(selector: number, pose: Pose): boolean {
  return selector === 24 && pose.x === 3 &&
    ((pose.y === 5 && pose.facing === 'south') || (pose.y === 6 && pose.facing === 'north'));
}

const FORWARD_DELTA: Readonly<Record<Direction, { dx: number; dy: number }>> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

export const GATEWAY_ECL6_COMPANION_GUARDS: readonly {
  name: GatewayEcl6CompanionName;
  selector: 23 | 26;
  pictureId: 0x66 | 0x4d | 0x22;
  text: string;
}[] = [
  {
    name: 'EREK',
    selector: 23,
    pictureId: 0x66,
    text: "EREK STOPS AND REFUSES TO GO FORWARD, SAYING 'I CANNOT LEAVE THIS REGION SO LONG AS AMANITAS NEEDS MY HELP.'",
  },
  {
    name: 'MUTHTUR',
    selector: 26,
    pictureId: 0x4d,
    text: "'THIS, MY FRIENDS, IS AS FAR AS I DARE GO. HALF-ORCS AREN'T WELCOME IN THIS PART OF THE REALMS.'",
  },
  {
    name: 'RISHPAL',
    selector: 26,
    pictureId: 0x22,
    text: "'I CANNOT GO TOO FAR FROM HOME, HE SAYS, 'AND LEAVE MY FAMILY UNPROTECTED.'",
  },
];

function locationDescriptor(selected: GatewayEcl6SelectedMap, x: number, y: number): number {
  return (selected.map.cells[y * selected.map.width + x]?.floor ?? 0) & 0x7f;
}

export class GatewayEcl6WildernessController {
  private readonly ecl: Uint8Array;
  private readonly sources: GatewayEcl6GeoSource;
  private readonly hooks: GatewayEcl6ControllerHooks;
  private state: GatewayEcl6ControllerState;
  private selected!: GatewayEcl6SelectedMap;
  private explorer!: Explorer;

  constructor(
    ecl: Uint8Array,
    sources: GatewayEcl6GeoSource,
    state: GatewayEcl6ControllerState,
    hooks: GatewayEcl6ControllerHooks,
  ) {
    validateState(state);
    this.ecl = ecl;
    this.sources = sources;
    this.hooks = hooks;
    this.state = copyState(state);
    this.mount(this.state.selector, this.state.pose);
  }

  /** Restore from a JSON-round-tripped state. */
  static restore(
    ecl: Uint8Array,
    sources: GatewayEcl6GeoSource,
    state: GatewayEcl6RestorableControllerState,
    hooks: GatewayEcl6ControllerHooks,
  ): GatewayEcl6WildernessController {
    const current: GatewayEcl6ControllerState = state.version === 1
      ? {
        ...state,
        version: GATEWAY_ECL6_CONTROLLER_STATE_VERSION,
        travelModeWord: 0,
        companions: [],
      }
      : state;
    return new GatewayEcl6WildernessController(ecl, sources, current, hooks);
  }

  serialize(): GatewayEcl6ControllerState {
    return copyState(this.state);
  }

  /** Selected map/terrain/piece view for the exact overland compositor. */
  getSelectedMap(): GatewayEcl6SelectedMap {
    return this.selected;
  }

  private mount(selector: number, pose: Pose): void {
    this.selected = selectGatewayEcl6WildernessMap(
      this.ecl,
      this.sources,
      new Map([[GATEWAY_ECL6_GEO_SELECTOR_ADDR, selector]]),
    );
    this.explorer = new Explorer(this.selected.map, pose);
    this.state.selector = selector;
    this.state.pose = copyPose(pose);
  }

  private requireActive(): void {
    if (this.state.phase !== 'active') {
      throw new Error(`Gateway ECL6 controller is ${this.state.phase}; resolve it before moving`);
    }
  }

  private result(
    action: GatewayEcl6ControllerAction,
    fields: Omit<GatewayEcl6ControllerResult, 'action' | 'state'>,
  ): GatewayEcl6ControllerResult {
    return { action, state: this.serialize(), ...fields };
  }

  private turn(action: 'turn-left' | 'turn-right' | 'turn-around'): GatewayEcl6ControllerResult {
    this.requireActive();
    if (action === 'turn-left') this.explorer.turnLeft();
    else if (action === 'turn-right') this.explorer.turnRight();
    else this.explorer.turnAround();
    this.state.pose = this.explorer.getPose();
    return this.result(action, { moved: false, elapsedMinutes: 0 });
  }

  turnLeft(): GatewayEcl6ControllerResult { return this.turn('turn-left'); }
  turnRight(): GatewayEcl6ControllerResult { return this.turn('turn-right'); }
  turnAround(): GatewayEcl6ControllerResult { return this.turn('turn-around'); }

  private advanceStepClock(): void {
    // Native host movement costs one minute; ECL6#21 then executes ECL_CLOCK 12,3.
    this.state.clock = stepGameTime(this.state.clock, SLOT_MINUTE, 1).clock;
    this.state.clock = stepGameTime(this.state.clock, SLOT_HOUR, 12).clock;
  }

  private advanceHostMoveClock(): void {
    this.state.clock = stepGameTime(this.state.clock, SLOT_MINUTE, 1).clock;
  }

  private advanceBlockedTerrainClock(): void {
    // The ECL terrain probe clock ran, but the native host movement (and its minute) did not.
    this.state.clock = stepGameTime(this.state.clock, SLOT_HOUR, 12).clock;
  }

  private checkEncounter(): GatewayEcl6EncounterResult {
    const descriptor = locationDescriptor(this.selected, this.state.pose.x, this.state.pose.y);
    let roll: number | undefined;
    if (!this.state.suppressNextEncounter && descriptor < 18 && this.state.cadenceCounter >= 3) {
      const threshold = GATEWAY_ECL6_ENCOUNTER_THRESHOLDS[descriptor] ?? 0;
      roll = this.hooks.rollEncounter({
        selector: this.state.selector,
        pose: copyPose(this.state.pose),
        descriptor,
        threshold,
        counter: this.state.cadenceCounter,
        maximumInclusive: 100,
      });
    }
    const result = advanceGatewayEcl6Encounter(
      this.state.cadenceCounter,
      this.state.suppressNextEncounter,
      descriptor,
      roll,
    );
    this.state.cadenceCounter = result.counterAfter;
    this.state.suppressNextEncounter = false;
    return result;
  }

  private pauseSundabar(source: GatewayEcl6SundabarPromptSource): GatewayEcl6PendingPrompt {
    const prompt: GatewayEcl6SundabarPrompt = { kind: 'sundabar', text: 'ENTER SUNDABAR?', source };
    this.state.phase = 'sundabar-prompt';
    this.state.pendingPrompt = prompt;
    return prompt;
  }

  private pauseBoatAbandon(targetPose: Pose, descriptor: number): GatewayEcl6BoatAbandonPrompt {
    const prompt: GatewayEcl6BoatAbandonPrompt = {
      kind: 'boat-abandon',
      text: 'ABANDON THE BOAT?',
      continuation: { kind: 'interior', targetPose: copyPose(targetPose), descriptor },
    };
    this.state.phase = 'boat-abandon-prompt';
    this.state.pendingPrompt = prompt;
    return prompt;
  }

  private pauseCompanion(
    guardIndex: number,
    selector: number,
    pose: Pose,
  ): GatewayEcl6CompanionPrompt {
    const guard = GATEWAY_ECL6_COMPANION_GUARDS[guardIndex];
    const prompt: GatewayEcl6CompanionPrompt = {
      kind: 'companion',
      companion: guard.name,
      pictureId: guard.pictureId,
      text: guard.text,
      choices: ['CONTINUE', 'GO BACK'],
      continuation: {
        kind: 'boundary',
        selector,
        pose: copyPose(pose),
        nextGuardIndex: guardIndex + 1,
      },
    };
    this.state.phase = 'companion-prompt';
    this.state.pendingPrompt = prompt;
    return prompt;
  }

  private removeCompanion(name: GatewayEcl6CompanionName): void {
    this.state.companions = this.state.companions.filter((companion) => companion.name !== name);
  }

  private continueBoundaryAttempt(
    action: 'forward' | 'companion-choice',
    beforeSelector: number,
    beforePose: Pose,
    startGuardIndex: number,
    choiceIndex?: 0 | 1,
  ): GatewayEcl6ControllerResult {
    for (let index = startGuardIndex; index < GATEWAY_ECL6_COMPANION_GUARDS.length; index++) {
      const guard = GATEWAY_ECL6_COMPANION_GUARDS[index];
      if (guard.selector !== beforeSelector) continue;
      const companion = this.state.companions.find((candidate) => candidate.name === guard.name);
      if (!companion) continue;
      if (!companion.active) {
        this.removeCompanion(companion.name);
        continue;
      }
      const prompt = this.pauseCompanion(index, beforeSelector, beforePose);
      return this.result(action, {
        moved: false,
        blocked: 'edge',
        elapsedMinutes: 0,
        prompt,
        ...(choiceIndex === undefined ? {} : { choiceIndex }),
      });
    }

    if (isSundabarBoundary(beforeSelector, beforePose)) {
      const prompt = this.pauseSundabar('boundary');
      return this.result(action, {
        moved: false,
        blocked: 'edge',
        elapsedMinutes: 0,
        prompt,
        ...(choiceIndex === undefined ? {} : { choiceIndex }),
      });
    }
    const target = transitionGatewayEcl6Boundary({ selector: beforeSelector, pose: beforePose });
    if (!target || target.pose.x < 0 || target.pose.x > 15 || target.pose.y < 0 || target.pose.y > 15) {
      // The retail no-transition arms converge on 0x8B43 after the host has accepted the outward
      // edge: cancel the host move and carry encounter suppression into the next SearchLocation.
      this.state.suppressNextEncounter = true;
      return this.result(action, {
        moved: false,
        blocked: 'edge',
        elapsedMinutes: 0,
        ...(choiceIndex === undefined ? {} : { choiceIndex }),
      });
    }
    this.mount(target.selector, target.pose);
    this.state.suppressNextEncounter = true;
    const suppressedEncounter = this.checkEncounter();
    const encounter = this.checkEncounter();
    const remount: GatewayEcl6Remount = {
      fromSelector: beforeSelector,
      toSelector: target.selector,
      fromPose: copyPose(beforePose),
      toPose: copyPose(target.pose),
    };
    const descriptor = locationDescriptor(this.selected, this.state.pose.x, this.state.pose.y);
    const prompt = !encounter.encounter && descriptor === 120 ? this.pauseSundabar('location') : undefined;
    return this.result(action, {
      moved: true,
      elapsedMinutes: 0,
      encounter,
      encounterChecks: [suppressedEncounter, encounter],
      remount,
      ...(prompt ? { prompt } : {}),
      ...(choiceIndex === undefined ? {} : { choiceIndex }),
    });
  }

  forward(): GatewayEcl6ControllerResult {
    this.requireActive();
    const beforeSelector = this.state.selector;
    const beforePose = copyPose(this.state.pose);

    if (isAvalancheBlocked(beforeSelector, beforePose)) {
      return this.result('forward', { moved: false, blocked: 'avalanche', elapsedMinutes: 0 });
    }

    if (isOutwardBoundary(beforePose)) {
      // Native sets tried_to_exit_map only after the directed edge is host-passable. Explorer's
      // result preserves that ownership: a wall remains a wall, while an open edge may remount.
      const edgeProbe = this.explorer.forward();
      if (edgeProbe.blocked !== 'edge') {
        return this.result('forward', { moved: false, blocked: 'wall', elapsedMinutes: 0 });
      }
      return this.continueBoundaryAttempt('forward', beforeSelector, beforePose, 0);
    }

    const delta = FORWARD_DELTA[beforePose.facing];
    const prospectiveX = beforePose.x + delta.dx;
    const prospectiveY = beforePose.y + delta.dy;
    const prospectiveDescriptor = locationDescriptor(this.selected, prospectiveX, prospectiveY);
    const terrain = classifyGatewayEcl6Terrain(prospectiveDescriptor, this.state.travelModeWord);
    if (terrain.kind === 'blocked') {
      this.advanceBlockedTerrainClock();
      this.state.suppressNextEncounter = true;
      return this.result('forward', {
        moved: false,
        blocked: terrain.reason,
        elapsedMinutes: GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES,
        message: terrain.text,
      });
    }
    if (terrain.kind === 'boat-abandon') {
      this.advanceBlockedTerrainClock();
      const prompt = this.pauseBoatAbandon(
        { x: prospectiveX, y: prospectiveY, facing: beforePose.facing },
        terrain.descriptor,
      );
      return this.result('forward', {
        moved: false,
        elapsedMinutes: GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES,
        prompt,
      });
    }

    const step = this.explorer.forward();
    if (!step.moved) {
      this.advanceBlockedTerrainClock();
      return this.result('forward', {
        moved: false,
        blocked: step.blocked ?? 'wall',
        elapsedMinutes: GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES,
      });
    }
    this.state.pose = this.explorer.getPose();
    this.advanceStepClock();
    const encounter = this.checkEncounter();
    const descriptor = locationDescriptor(this.selected, this.state.pose.x, this.state.pose.y);
    const prompt = !encounter.encounter && descriptor === 120 ? this.pauseSundabar('location') : undefined;
    return this.result('forward', {
      moved: true,
      elapsedMinutes: GATEWAY_ECL6_STEP_MINUTES,
      encounter,
      encounterChecks: [encounter],
      ...(prompt ? { prompt } : {}),
    });
  }

  resolveBoatAbandonChoice(choiceIndex: 0 | 1): GatewayEcl6ControllerResult {
    if (this.state.phase !== 'boat-abandon-prompt' || this.state.pendingPrompt?.kind !== 'boat-abandon') {
      throw new Error('Gateway ECL6 controller has no boat-abandon prompt to resolve');
    }
    const prompt = this.state.pendingPrompt;
    const outcome = runGatewayEcl6BoatAbandonChoice(this.ecl, this.state.travelModeWord, choiceIndex);
    if (outcome.status !== 'exited') throw new Error('Gateway ECL6 boat-abandon contract changed');
    this.state.pendingPrompt = null;
    this.state.phase = 'active';
    this.state.travelModeWord = outcome.travelModeWord;

    if (choiceIndex === 1) {
      if (!outcome.cancelHostMove || !outcome.suppressNextEncounter) {
        throw new Error('Gateway ECL6 boat-abandon NO contract changed');
      }
      this.state.suppressNextEncounter = true;
      return this.result('boat-choice', { moved: false, elapsedMinutes: 0, choiceIndex });
    }
    if (outcome.cancelHostMove || outcome.suppressNextEncounter || outcome.travelModeWord !== 0) {
      throw new Error('Gateway ECL6 boat-abandon YES contract changed');
    }

    const step = this.explorer.forward();
    if (!step.moved) {
      return this.result('boat-choice', {
        moved: false,
        blocked: step.blocked ?? 'wall',
        elapsedMinutes: 0,
        choiceIndex,
      });
    }
    this.state.pose = this.explorer.getPose();
    if (JSON.stringify(this.state.pose) !== JSON.stringify(prompt.continuation.targetPose)) {
      throw new Error('Gateway ECL6 deferred boat move target changed');
    }
    this.advanceHostMoveClock();
    const encounter = this.checkEncounter();
    const descriptor = locationDescriptor(this.selected, this.state.pose.x, this.state.pose.y);
    const nextPrompt = !encounter.encounter && descriptor === 120 ? this.pauseSundabar('location') : undefined;
    return this.result('boat-choice', {
      moved: true,
      elapsedMinutes: 1,
      encounter,
      encounterChecks: [encounter],
      choiceIndex,
      ...(nextPrompt ? { prompt: nextPrompt } : {}),
    });
  }

  resolveCompanionChoice(choiceIndex: 0 | 1): GatewayEcl6ControllerResult {
    if (this.state.phase !== 'companion-prompt' || this.state.pendingPrompt?.kind !== 'companion') {
      throw new Error('Gateway ECL6 controller has no companion prompt to resolve');
    }
    const prompt = this.state.pendingPrompt;
    this.state.pendingPrompt = null;
    this.state.phase = 'active';
    if (choiceIndex === 1) {
      this.state.suppressNextEncounter = true;
      return this.result('companion-choice', { moved: false, blocked: 'edge', elapsedMinutes: 0, choiceIndex });
    }
    this.removeCompanion(prompt.companion);
    return this.continueBoundaryAttempt(
      'companion-choice',
      prompt.continuation.selector,
      prompt.continuation.pose,
      prompt.continuation.nextGuardIndex,
      choiceIndex,
    );
  }

  resolveSundabarChoice(choiceIndex: 0 | 1): GatewayEcl6ControllerResult {
    if (this.state.phase !== 'sundabar-prompt' || !this.state.pendingPrompt) {
      throw new Error('Gateway ECL6 controller has no Sundabar prompt to resolve');
    }
    const outcome = runGatewayEcl6SundabarChoice(this.ecl, choiceIndex, this.state.travelModeWord);
    this.state.pendingPrompt = null;
    if (choiceIndex === 0) {
      if (outcome.status !== 'chain' || outcome.gameArea !== 5 || outcome.chainBlockId !== 19 ||
          outcome.travelModeWord !== this.state.travelModeWord) {
        throw new Error('Gateway ECL6 Sundabar YES contract changed');
      }
      this.state.phase = 'chained';
      this.state.chain = { gameArea: 5, eclBlockId: 19 };
      return this.result('sundabar-choice', {
        moved: false,
        elapsedMinutes: 0,
        choiceIndex,
        chain: { ...this.state.chain },
      });
    }
    const cancels = this.state.travelModeWord === 0;
    if (outcome.status !== 'exited' || outcome.gameArea !== null || outcome.chainBlockId !== null ||
        outcome.travelModeWord !== this.state.travelModeWord || outcome.cancelHostMove !== cancels ||
        outcome.suppressNextEncounter !== cancels) {
      throw new Error('Gateway ECL6 Sundabar NO contract changed');
    }
    if (outcome.suppressNextEncounter) this.state.suppressNextEncounter = true;
    this.state.phase = 'active';
    this.state.chain = null;
    return this.result('sundabar-choice', {
      moved: false,
      elapsedMinutes: 0,
      choiceIndex,
    });
  }
}
