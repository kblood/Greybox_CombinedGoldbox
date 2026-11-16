/**
 * Natural healing / rest (A1.2) — the pure rules for resting the party in camp.
 *
 * AD&D 1st-edition (and the Gold Box engine that implements it) heals **1 hit point per full day of
 * undisturbed bed rest** per living character, independent of level — which is exactly why a cleric's
 * cure spells and the temple matter, and why a badly-wounded party that only rests will burn many
 * in-game days (and watch the moons swing) recovering. We model that here as a pure plan: given the
 * party's current/maximum HP, compute how long they rest and what each member's HP becomes, without
 * mutating anything. The caller (web roster / save) applies the results and advances the game clock.
 *
 * Dead members (hp ≤ 0) do NOT heal naturally — they need a raise/resurrection — so they are skipped
 * when sizing the rest and left untouched.
 */

import { MINUTES_PER_DAY } from './gameClock.js';

/** The minimum a character must expose to be rested: current and maximum HP. */
export interface Healable {
  hp: number;
  maxHp: number;
}

/** AD&D 1e bed-rest rate: 1 HP recovered per full day of rest. */
export const NATURAL_HEAL_HP_PER_DAY = 1;

/** What one member's rest did. */
export interface MemberRest {
  before: number;
  after: number;
  healed: number;
}

/** The outcome of resting the whole party for some number of days. */
export interface RestOutcome {
  /** Whole days rested. */
  days: number;
  /** Elapsed game time, in minutes (days × 1440) — what the clock advances by. */
  minutes: number;
  /** Per-member before/after HP, in party order. */
  results: MemberRest[];
  /** Total HP recovered across the party. */
  totalHealed: number;
}

export interface RestOptions {
  /** Rest a fixed number of days. Omit to rest exactly long enough to fully heal the party. */
  days?: number;
  /** HP recovered per living member per day (default {@link NATURAL_HEAL_HP_PER_DAY}). */
  hpPerDay?: number;
}

/** Days of bed rest the most-wounded living member needs to reach full HP at `hpPerDay`. */
export function daysToHealParty(
  party: readonly Healable[],
  hpPerDay: number = NATURAL_HEAL_HP_PER_DAY,
): number {
  if (hpPerDay <= 0) return 0;
  let max = 0;
  for (const m of party) {
    if (m.hp <= 0) continue; // dead — natural rest can't help
    const missing = Math.max(0, m.maxHp - m.hp);
    max = Math.max(max, Math.ceil(missing / hpPerDay));
  }
  return max;
}

/**
 * Plan a rest. With `opts.days` set, the party rests exactly that long; otherwise it rests just long
 * enough for everyone living to reach full HP (0 days if nobody is wounded). Pure — returns the new
 * HP values; the caller writes them back and advances the clock by `minutes`.
 */
export function planRest(party: readonly Healable[], opts: RestOptions = {}): RestOutcome {
  const hpPerDay = opts.hpPerDay ?? NATURAL_HEAL_HP_PER_DAY;
  const days = Math.max(0, Math.floor(opts.days ?? daysToHealParty(party, hpPerDay)));
  let totalHealed = 0;
  const results: MemberRest[] = party.map((m) => {
    const before = m.hp;
    // Dead members don't recover from rest; living ones gain hpPerDay/day, capped at maxHp.
    const after = m.hp <= 0 ? m.hp : Math.min(m.maxHp, m.hp + days * hpPerDay);
    const healed = after - before;
    totalHealed += healed;
    return { before, after, healed };
  });
  return { days, minutes: days * MINUTES_PER_DAY, results, totalHealed };
}
