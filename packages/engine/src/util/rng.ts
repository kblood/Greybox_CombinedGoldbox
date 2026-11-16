/**
 * Tiny deterministic PRNG — a Numerical-Recipes LCG, the same recurrence the ECL VM uses for its
 * RANDOM opcode (`ecl/vm.ts`). Seedable so combat, scripts, and tests are fully reproducible in
 * headless runs. Not cryptographic; good enough for game dice.
 */
export class Rng {
  private state: number;

  constructor(seed = 0x1234) {
    this.state = seed >>> 0;
  }

  /** Advance and return the next 32-bit unsigned word. */
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }

  /** Roll a single die with `sides` faces, returning 1..sides (a non-positive `sides` yields 0). */
  die(sides: number): number {
    if (sides <= 0) return 0;
    if (sides === 1) return 1;
    return (this.next() % sides) + 1;
  }

  /** Roll `count` dice of `sides` faces plus a flat `bonus` (e.g. 2d8+1). */
  roll(count: number, sides: number, bonus = 0): number {
    let total = bonus;
    for (let i = 0; i < count; i++) total += this.die(sides);
    return total;
  }
}
