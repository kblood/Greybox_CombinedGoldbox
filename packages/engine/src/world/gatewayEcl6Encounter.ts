/**
 * Retail wandering-encounter runner for Gateway to the Savage Frontier ECL6#21.
 *
 * This intentionally executes the original ECL branch instead of copying its descriptor tables,
 * ATTACK/FLEE menu, or combat roster into a parallel model. The outer wilderness controller has
 * already performed the cadence/threshold check when it creates this runner; ECL resumes at the
 * hit arm, resets the cadence word, builds the encounter, and pauses through the ordinary
 * {@link DialogueRunner} lifecycle.
 *
 * Gateway's GAME.OVR proves that opcode 08 treats its operand as an inclusive maximum, but the
 * original PRNG algorithm/state is not recovered. Callers therefore supply the roll source
 * explicitly. The separate combat-floor builder consumes the `current_city` word this runner writes
 * immediately before yielding COMBAT; this helper itself remains responsible only for ECL execution.
 */
import { ECL_GEN1_SHORT_GATEWAY } from '../ecl/disassemble.js';
import { EclVm } from '../ecl/vm.js';
import { DialogueRunner } from './dialogue.js';

export const GATEWAY_ECL6_ENCOUNTER_ENTRY_VADDR = 0x8136;
export const GATEWAY_ECL6_ENCOUNTER_DESCRIPTOR_ADDR = 0x4c02;
export const GATEWAY_ECL6_CURRENT_CELL_DESCRIPTOR_ADDR = 0xc04f;
export const GATEWAY_ECL6_TRAVEL_MODE_ADDR = 0x4cf5;
/** Area1/ECL word written with `current_city` immediately before the runner yields COMBAT. */
export const GATEWAY_ECL6_CURRENT_CITY_ADDR = 0x4ca1;

export interface GatewayEcl6EncounterRunnerOptions {
  /** Host-owned inclusive roll: for the proven encounter operands N<255, Gateway writes 0..N. */
  rollRandomInclusive(maximumInclusive: number): number;
  /** Optional shared memory, exposed so the host can inspect ECL-written state such as current_city. */
  memory?: Map<number, number>;
  /**
   * Host encounter-distance seed. The retail wilderness branch rolls its own maximum distance and
   * a failed FLEE zeroes that maximum; 0xFF lets SETUP_MONSTER clamp to exactly that ECL-owned value.
   */
  encounterDistance?: number;
  /** Raw native `[0x4CF5]` word. Nonzero changes the retail encounter narration. */
  travelModeWord?: number;
}

/**
 * Create a dialogue runner at ECL6#21's successful wandering-encounter arm.
 *
 * The caller may supply the controller-owned `[0x4CF5]` word. When omitted, a value already present
 * in shared memory is preserved; otherwise the backward-compatible land value zero is used.
 */
export function createGatewayEcl6EncounterRunner(
  ecl: Uint8Array,
  descriptor: number,
  options: GatewayEcl6EncounterRunnerOptions,
): DialogueRunner {
  if (!Number.isInteger(descriptor) || descriptor < 0 || descriptor > 17) {
    throw new Error('Gateway ECL6 wandering encounter descriptor must be 0..17');
  }
  const memory = options.memory ?? new Map<number, number>();
  memory.set(GATEWAY_ECL6_ENCOUNTER_DESCRIPTOR_ADDR, descriptor);
  // The roster dispatch reads the cached Area1 descriptor, while the pre-COMBAT current_city
  // subroutine refreshes that cache from the live host cell register. Both hold the same value at
  // a real SearchLocation hit and must remain coherent when entering this tail directly.
  memory.set(GATEWAY_ECL6_CURRENT_CELL_DESCRIPTOR_ADDR, descriptor);
  const travelModeWord = options.travelModeWord ?? memory.get(GATEWAY_ECL6_TRAVEL_MODE_ADDR) ?? 0;
  if (!Number.isInteger(travelModeWord) || travelModeWord < 0 || travelModeWord > 0xffff) {
    throw new Error('Gateway ECL6 travel mode word must be a uint16');
  }
  memory.set(GATEWAY_ECL6_TRAVEL_MODE_ADDR, travelModeWord);
  const vm = new EclVm(ecl, {
    entry: GATEWAY_ECL6_ENCOUNTER_ENTRY_VADDR - ECL_GEN1_SHORT_GATEWAY.vbase,
    dialect: ECL_GEN1_SHORT_GATEWAY,
    memory,
    inDungeon: false,
    encounterDistance: options.encounterDistance ?? 0xff,
    rollRandomInclusive: options.rollRandomInclusive,
  });
  return new DialogueRunner(vm);
}
