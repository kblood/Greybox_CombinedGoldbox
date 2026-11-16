/**
 * ECL chain runner (M2.S2b) — drives the single-block {@link EclVm} across NEWECL chains.
 *
 * One ECL block is a single subroutine that ends in EXIT, RETURN, or a NEWECL that hands
 * control to ANOTHER block (the game's events are stitched together this way — e.g. a
 * zone-transition block chains to the area's main block). The VM handles one block; this
 * layer follows the `chain` status: it loads the next block from an injected `BlockSource`
 * and continues with the SAME memory and host VM context, so game state (flags,
 * variables, party query inputs, encounter distance, and ECL_CLOCK time) persists
 * across the whole event the way it does in the real engine.
 *
 * Pure and DOM-free. Input/menu/WHO and COMBAT still surface as pauses the host resolves;
 * for a fully-headless transcript, pass `autoInput` to answer them deterministically. A
 * `maxBlocks` guard bounds runaway NEWECL loops.
 */
import { EclVm, type EclCombatOutcome, type EclEffect, type EclInputValue, type EclRunResult, type EclVmOptions } from './vm.js';

/** Resolve an ECL block id to its decompressed bytes (e.g. from ECL1/2/3.DAX), or undefined. */
export type BlockSource = (blockId: number) => Uint8Array | undefined;

type RunChainVmOptions = Pick<EclVmOptions,
  | 'memory'
  | 'seed'
  | 'stepBudget'
  | 'dialect'
  | 'partyStrength'
  | 'encounterDistance'
  | 'inDungeon'
  | 'partyHasRanger'
  | 'selectedPartyIndex'
  | 'partyMemberAffects'
  | 'partyAffects'
  | 'partyMovements'
  | 'partyThiefSkills'
  | 'partyItemTypes'
  | 'selectedPlayerAffects'
  | 'partySpellLists'
  | 'findCharacter'
  | 'clock'
>;

export interface RunChainOptions extends RunChainVmOptions {
  /** Max blocks to run before bailing out (default 64). */
  maxBlocks?: number;
  /**
   * Headless auto-responder for input/menu/WHO pauses: given the pausing result, return the
   * value to resume with. If omitted, the runner STOPS at the first such pause and returns
   * control to the host (which calls the returned `resume`). COMBAT always stops (the host
   * must run combat) unless `autoCombat` is set.
   */
  autoInput?: (r: EclRunResult) => EclInputValue;
  /**
   * Headless: auto-continue past COMBAT. `true` preserves the VM's conservative
   * default outcome; a callback can return the real/desired ECL outcome.
   */
  autoCombat?: boolean | ((r: EclRunResult) => EclCombatOutcome);
  /**
   * Cap on TOTAL auto-driven resumes (autoInput + autoCombat) before the runner bails out with
   * `status: 'halted'` (default 2000). Real retail scripts contain genuinely interactive prompt
   * loops that re-ask until the answer is valid — e.g. DQK's debug-bootstrap block 2 re-prompts
   * its jump-to-area INPUT_NUMBER forever when `autoInput` keeps answering 0 (exposed 2026-07-23
   * when the corrected Gen2 zero-operand PARTY_SURPRISE decode let that block run its REAL flow;
   * the old mis-framed decode happened to halt on a garbage opcode first). Without this cap such
   * a loop spins the process out of memory instead of returning.
   */
  maxAutoResumes?: number;
  /**
   * Cross-archive resolver (ADR-0009): given a `game_area` (set by an ECL `SAVE …,0x7F12`),
   * return that area's ECL {@link BlockSource}. When present, `runEclChain` rebinds the active
   * source whenever a `setGameArea` effect fires, so a `NEWECL` immediately after resolves
   * against the NEW area's archive instead of the one the chain started in. Omit for the
   * existing single-archive callers — behavior is then identical to before this option existed.
   */
  areaSource?: (gameArea: number) => BlockSource | undefined;
  /**
   * Initial `game_area`, purely informational bookkeeping until the first `setGameArea` effect
   * (the start block is still loaded via the flat `source` passed to `runEclChain`). Ignored
   * unless `areaSource` is also set.
   */
  startGameArea?: number;
  /**
   * Override the FIRST block's VM entry offset (bytes into the block, past the header),
   * for blocks whose own `initial_entry` header pointer leads to a no-op stub on synthetic
   * boot (established precedent: Pool's ECL8#29 needs 0x35d). Only applies to the block
   * loaded at `startBlockId` — every chained block after it still boots at its own
   * `initial_entry` (the default `EclVm` behavior), matching how the real engine only takes
   * an explicit entry point for the block the host itself loads.
   */
  entry?: number;
}

export interface RunChainResult {
  /** Terminal status: 'exited' (chain ran out), or a pause the host must handle. */
  status: EclRunResult['status'];
  /** Every effect emitted across all blocks, in order. */
  effects: EclEffect[];
  /** Block ids entered, in order (length ≤ maxBlocks). */
  visited: number[];
  /** The shared memory after the run (game state). */
  memory: Map<number, number>;
  /** Set when `status === 'halted'`. */
  haltReason?: string;
  /**
   * When the run paused on input/menu/WHO/combat, a continuation that resumes the CURRENT
   * block with `value` and keeps following the chain. Null when terminal.
   */
  resume: ((value?: EclInputValue, opts?: { combatOutcome?: EclCombatOutcome }) => RunChainResult) | null;
}

/**
 * Run an ECL event starting at `startBlockId`, following NEWECL chains via `source` and
 * carrying memory across blocks. See {@link RunChainOptions}.
 */
export function runEclChain(
  startBlockId: number,
  source: BlockSource,
  opts: RunChainOptions = {},
): RunChainResult {
  const memory = opts.memory ?? new Map<number, number>();
  const maxBlocks = opts.maxBlocks ?? 64;
  const maxAutoResumes = opts.maxAutoResumes ?? 2000;
  let autoResumes = 0;
  const effects: EclEffect[] = [];
  const visited: number[] = [];
  const partyItemTypes = new Set(Array.from(opts.partyItemTypes ?? [], (value) => value & 0xff));
  let clock = opts.clock;

  const vmOptions = (entry?: number): EclVmOptions => ({
    memory,
    seed: opts.seed,
    stepBudget: opts.stepBudget,
    dialect: opts.dialect,
    partyStrength: opts.partyStrength,
    encounterDistance: opts.encounterDistance,
    inDungeon: opts.inDungeon,
    partyHasRanger: opts.partyHasRanger,
    selectedPartyIndex: opts.selectedPartyIndex,
    partyMemberAffects: opts.partyMemberAffects,
    partyAffects: opts.partyAffects,
    partyMovements: opts.partyMovements,
    partyThiefSkills: opts.partyThiefSkills,
    partyItemTypes,
    selectedPlayerAffects: opts.selectedPlayerAffects,
    partySpellLists: opts.partySpellLists,
    findCharacter: opts.findCharacter,
    clock,
    ...(entry !== undefined ? { entry } : {}),
  });

  const start = source(startBlockId);
  if (!start) {
    return { status: 'halted', effects, visited, memory, haltReason: `block ${startBlockId} not found`, resume: null };
  }

  // ADR-0009: the active source starts as the flat `source` passed in; a `setGameArea` effect
  // (from a SAVE …,0x7F12) rebinds it to `areaSource(gameArea)` when the host supplies one.
  // Single-archive callers never pass `areaSource`, so `activeSource` never moves — no
  // behavior change for them.
  let activeSource = source;
  let currentGameArea = opts.startGameArea;

  let vm = new EclVm(start, vmOptions(opts.entry));
  let currentId = startBlockId;
  visited.push(currentId);

  // Drive `result` forward, following chains; returns when terminal or a host pause remains.
  const drive = (result: EclRunResult): RunChainResult => {
    for (;;) {
      effects.push(...result.effects);
      for (const effect of result.effects) {
        if (effect.type === 'destroyItems') partyItemTypes.delete(effect.itemTypeId & 0xff);
      }

      if (opts.areaSource) {
        for (const effect of result.effects) {
          if (effect.type === 'setGameArea') {
            currentGameArea = effect.gameArea;
            activeSource = opts.areaSource(effect.gameArea) ?? activeSource;
          }
        }
      }

      if (result.status === 'chain') {
        if (visited.length >= maxBlocks) {
          return done('halted', `maxBlocks (${maxBlocks}) reached`);
        }
        const nextId = result.chainBlockId!;
        const bytes = activeSource(nextId);
        if (!bytes) return done('halted', `chained block ${nextId} not found (game_area ${currentGameArea ?? 'n/a'})`);
        // Preserve the departed block only for dialects whose retail engine and scripts identify
        // the backing address. Pools GAME.OVR+0x0e4a stores EclBlockId at Area+0x15 and ECL1#69
        // immediately consumes logical [0x0016] as that predecessor. Keeping the address on the
        // dialect avoids silently changing titles whose equivalent state has not been located.
        const lastBlockIdAddr = opts.dialect?.lastBlockIdAddr;
        if (lastBlockIdAddr !== undefined) memory.set(lastBlockIdAddr, currentId & 0xff);
        currentId = nextId;
        visited.push(currentId);
        clock = vm.gameClock;
        vm = new EclVm(bytes, vmOptions());
        result = vm.run();
        continue;
      }

      if (result.status === 'awaiting-input') {
        if (opts.autoInput) {
          if (++autoResumes > maxAutoResumes) {
            return done('halted', `auto-resume budget (${maxAutoResumes}) exceeded`);
          }
          result = vm.resume(opts.autoInput(result));
          continue;
        }
        return pause('awaiting-input');
      }

      if (result.status === 'combat') {
        if (opts.autoCombat) {
          if (++autoResumes > maxAutoResumes) {
            return done('halted', `auto-resume budget (${maxAutoResumes}) exceeded`);
          }
          const combatOutcome = typeof opts.autoCombat === 'function' ? opts.autoCombat(result) : undefined;
          result = vm.resume(0, combatOutcome ? { combatOutcome } : undefined);
          continue;
        }
        return pause('combat');
      }

      // 'exited' or 'halted'
      return done(result.status, result.haltReason);
    }
  };

  const done = (status: RunChainResult['status'], haltReason?: string): RunChainResult => ({
    status,
    effects,
    visited,
    memory,
    ...(haltReason ? { haltReason } : {}),
    resume: null,
  });

  const pause = (status: RunChainResult['status']): RunChainResult => ({
    status,
    effects,
    visited,
    memory,
    resume: (value = 0, resumeOpts?: { combatOutcome?: EclCombatOutcome }) => drive(vm.resume(value, resumeOpts)),
  });

  return drive(vm.run());
}

/**
 * Build a {@link BlockSource} from already-decompressed ECL blocks (e.g. the union of
 * `readDaxDataBlocks(ECL1/2/3.DAX)`). Later entries win on id collision.
 */
export function blockSourceFrom(blocks: Array<{ blockId: number; raw: Uint8Array }>): BlockSource {
  const map = new Map<number, Uint8Array>();
  for (const b of blocks) map.set(b.blockId, b.raw);
  return (id) => map.get(id);
}
