import { ECL_GEN2_DQK_AREA5, parseEclHeader } from '../ecl/disassemble.js';
import { EclVm, type EclRunResult } from '../ecl/vm.js';
import { primeVmRun1 } from './dungeonEvents.js';

/**
 * Dark Queen of Krynn area 5's overland terrain grid.
 *
 * This is intentionally separate from Gen2 GEO dungeon maps. Area 5's vmRun1
 * routine selects thirty inline GETTABLE rows, each 38 bytes wide. The values
 * are script terrain/encounter selectors, not GEO cell descriptors.
 */
export const DQK_AREA5_OVERLAND_WIDTH = 38;
export const DQK_AREA5_OVERLAND_HEIGHT = 30;
export const DQK_AREA5_OVERLAND_TABLE_VADDR = 0xa97d;
export const DQK_ECL_VBASE = 0x8000;

/** The eight `vmRun1` branches at Area-5 virtual 0x843B, in retail selector order. */
export type DqkArea5TravelDirection = 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west';

/**
 * Build the logical ECL-memory input for Area 5's overland `vmRun1` host.
 *
 * These are VM/clean-room host keys—not original DQK.EXE DGROUP offsets. In
 * particular, do not merge this with `dqkVmRun1Seed()`, which models GEO
 * dungeon descriptor dispatch through `[0x002d]`.
 */
export function dqkArea5VmRunSeed(
  direction: DqkArea5TravelDirection,
  x: number,
  y: number,
): Record<number, number> {
  const selector: Record<DqkArea5TravelDirection, number> = {
    north: 0,
    'north-east': 1,
    east: 2,
    'south-east': 3,
    south: 4,
    'south-west': 5,
    west: 6,
    'north-west': 7,
  };
  return {
    0x001b: 5,
    0x0023: selector[direction],
    0x0111: x & 0xffff,
    0x0112: y & 0xffff,
  };
}

export interface DqkArea5OverlandGrid {
  readonly width: typeof DQK_AREA5_OVERLAND_WIDTH;
  readonly height: typeof DQK_AREA5_OVERLAND_HEIGHT;
  /** Raw ECL GETTABLE values, row-major. Do not assign display names without more evidence. */
  readonly values: Uint8Array;
  valueAt(x: number, y: number): number | undefined;
}

/** A source-level Area-5 overland position, before the script's selected move is applied. */
export interface DqkArea5OverlandPosition {
  x: number;
  y: number;
}

/** Result from one genuine Area-5 `vmRun1` transition. */
export interface DqkArea5OverlandStep {
  readonly from: DqkArea5OverlandPosition;
  readonly to: DqkArea5OverlandPosition;
  /** False when the ECL movement branch left the 38×30 terrain table. */
  readonly moved: boolean;
  readonly direction: DqkArea5TravelDirection;
  /** Raw GETTABLE terrain/encounter selector, if the move remained in bounds. */
  readonly terrain?: number;
  /** Low/high terrain nibbles that Area-5 writes to 0x00CB/0x00CA. */
  readonly terrainLow?: number;
  readonly terrainHigh?: number;
  readonly run: EclRunResult;
}

/** Decode the inline retail Area-5 terrain table from the decompressed ECL member. */
export function decodeDqkArea5Overland(block: Uint8Array): DqkArea5OverlandGrid {
  const offset = DQK_AREA5_OVERLAND_TABLE_VADDR - DQK_ECL_VBASE;
  const length = DQK_AREA5_OVERLAND_WIDTH * DQK_AREA5_OVERLAND_HEIGHT;
  if (offset < 20 || offset + length > block.length) {
    throw new Error(`DQK area 5 overland table is absent (need [0x${offset.toString(16)}, 0x${(offset + length).toString(16)}), block=${block.length})`);
  }
  const values = block.slice(offset, offset + length);
  return {
    width: DQK_AREA5_OVERLAND_WIDTH,
    height: DQK_AREA5_OVERLAND_HEIGHT,
    values,
    valueAt(x: number, y: number): number | undefined {
      if (x < 0 || y < 0 || x >= DQK_AREA5_OVERLAND_WIDTH || y >= DQK_AREA5_OVERLAND_HEIGHT) return undefined;
      return values[y * DQK_AREA5_OVERLAND_WIDTH + x];
    },
  };
}

/**
 * Stateful, pure-engine owner for Area 5's *ECL* overland movement contract.
 *
 * It uses the retail vmRun1 script to advance the coordinate and derive terrain,
 * retaining its VM memory between steps. It does not turn a terrain result into
 * combat: the original host's later CampInterrupted/encounter handoff remains a
 * separate, explicitly labelled adapter boundary.
 */
export class DqkArea5OverlandSession {
  readonly grid: DqkArea5OverlandGrid;
  readonly memory = new Map<number, number>();
  private rng = 0x1234;
  private position: DqkArea5OverlandPosition;

  constructor(private readonly block: Uint8Array, initial: DqkArea5OverlandPosition) {
    this.grid = decodeDqkArea5Overland(block);
    this.position = { ...initial };
  }

  getPosition(): DqkArea5OverlandPosition {
    return { ...this.position };
  }

  step(direction: DqkArea5TravelDirection): DqkArea5OverlandStep {
    const from = this.getPosition();
    const vm = primeVmRun1(this.block, {
      dialect: ECL_GEN2_DQK_AREA5,
      memory: this.memory,
      seedMemory: dqkArea5VmRunSeed(direction, from.x, from.y),
      seed: this.rng,
    });
    if (!vm) throw new Error('DQK area 5 has no vmRun1 handler');
    const run = vm.run();
    this.rng = vm.rngState;
    const to = {
      x: this.memory.get(0x00c0) ?? from.x,
      y: this.memory.get(0x00c1) ?? from.y,
    };
    const terrain = this.grid.valueAt(to.x, to.y);
    const moved = terrain !== undefined;
    if (moved) this.position = { ...to };
    return {
      from,
      to,
      moved,
      direction,
      ...(terrain === undefined ? {} : {
        terrain,
        terrainLow: this.memory.get(0x00cb),
        terrainHigh: this.memory.get(0x00ca),
      }),
      run,
    };
  }

  /**
   * Enter Area 5's real CampInterrupted far-pointer handler after the proven
   * `0xE5` vmRun result. The three sparse rows are the documented CCECL
   * clean-room bridge contract; they are not original DQK.EXE memory offsets.
   *
   * Returns null for every other terrain state, so callers cannot turn an
   * arbitrary overland cell into the dragon fight.
   */
  beginCampInterrupted(partyStrength = 0): EclVm | null {
    if (this.memory.get(0x001b) !== 5 ||
      this.memory.get(0x00ca) !== 14 ||
      this.memory.get(0x00cb) !== 5 ||
      this.memory.get(0x00cc) !== 0xe5) return null;
    // CampInterrupted itself writes this flag after its COMBAT continuation.
    // Honour that retail state on revisit/reload instead of replaying a resolved
    // encounter merely because the host remains on its triggering terrain cell.
    if (this.memory.get(0x003a) === 1) return null;
    // `derive_dqk_handler_state`, native/src/ccecl.asm:1598–1629.
    this.memory.set(0x0112, 16);
    this.memory.set(0x00c1, 3);
    this.memory.set(0x00c2, 2);
    const entry = parseEclHeader(this.block, ECL_GEN2_DQK_AREA5).campInterrupted - ECL_GEN2_DQK_AREA5.vbase;
    if (entry < ECL_GEN2_DQK_AREA5.headerLen || entry >= this.block.length) return null;
    return new EclVm(this.block, {
      dialect: ECL_GEN2_DQK_AREA5,
      memory: this.memory,
      entry,
      seed: this.rng,
      partyStrength,
    });
  }

  /** Retain RNG state after a host has driven a CampInterrupted VM through its pause. */
  retainRng(vm: EclVm): void {
    this.rng = vm.rngState;
  }
}
