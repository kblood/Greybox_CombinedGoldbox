/**
 * AD&D 1st-edition ability-score modifier tables (PHB, the tables the Gold Box engine uses).
 * Pure lookups, total over all integer inputs (clamped to the printed range). Values transcribed
 * from the 1e Players Handbook ability tables — see docs/engine/research/addnd1e-tables.md for the
 * per-row citation and confidence notes.
 */
import type { AbilityModifiers, ConstitutionMods, DexterityMods, StrengthMods } from '../types.js';

/** Non-exceptional strength rows 3..19 → [hit, damage]. Index 0 = STR 3. */
const STR_BASE: ReadonlyArray<readonly [number, number]> = [
  [-3, -1], // 3
  [-2, -1], // 4
  [-2, -1], // 5
  [-1, 0], // 6
  [-1, 0], // 7
  [0, 0], // 8
  [0, 0], // 9
  [0, 0], // 10
  [0, 0], // 11
  [0, 0], // 12
  [0, 0], // 13
  [0, 0], // 14
  [0, 0], // 15
  [0, 1], // 16
  [1, 1], // 17
  [1, 2], // 18
  [3, 7], // 19
];

/** STR 18 exceptional-strength percentile bands → [hit, damage]. */
const STR_18_PCT: ReadonlyArray<readonly [number, number, number]> = [
  // [maxPercentile, hit, damage]
  [50, 1, 3], // 18/01–50
  [75, 2, 3], // 18/51–75
  [90, 2, 4], // 18/76–90
  [99, 2, 5], // 18/91–99
  [100, 3, 6], // 18/00
];

/**
 * Dexterity rows 3..25 → [missileAttack, defensiveAcAdj, reaction]. defensiveAcAdj is added to the
 * AC number (negative = better). Index 0 = DEX 3.
 *
 * **Row 18 + the 20-25 extension are COAB-corrected, not the 1e PHB's own numbers** (M25.S1): the
 * decompiled Gold Box engine's own missile/reaction table (`ovr025.cs DexReactionAdj`, `sub_66023`)
 * gives `18 → +3` (one point above the PHB's `+2`, matching its own 19-20 plateau one row early) and
 * extends `21-23 → +4`, `24-25 → +5` (the PHB table stops at 18/19). Per this project's established
 * precedent of trusting the game's own code over the rulebook when they diverge (see the diagonal-
 * move-cost and AC-encoding corrections in `combat-mechanics-coab.md`), the game's own values are
 * encoded here; `defensiveAc` is left at its PHB value throughout (COAB's routine only computes the
 * missile/reaction column, not AC). See `docs/engine/research/m25-audit.md` for the full trace.
 */
const DEX: ReadonlyArray<readonly [number, number, number]> = [
  [-3, 4, -3], // 3
  [-2, 3, -2], // 4
  [-1, 2, -1], // 5
  [0, 1, 0], // 6
  [0, 0, 0], // 7
  [0, 0, 0], // 8
  [0, 0, 0], // 9
  [0, 0, 0], // 10
  [0, 0, 0], // 11
  [0, 0, 0], // 12
  [0, 0, 0], // 13
  [0, 0, 0], // 14
  [0, -1, 0], // 15
  [1, -2, 1], // 16
  [2, -3, 2], // 17
  [3, -4, 3], // 18 -- COAB: stat-15 = +3 (PHB says +2)
  [3, -4, 3], // 19
  [3, -4, 3], // 20 -- COAB's 19-20 band, +3
  [4, -4, 4], // 21
  [4, -4, 4], // 22
  [4, -4, 4], // 23 -- COAB's 21-23 band, +4
  [5, -4, 5], // 24
  [5, -4, 5], // 25 -- COAB's 24-25 band, +5
];

/** Constitution rows 3..19 → [hpNonWarrior, hpWarrior]. Index 0 = CON 3. Warriors get the
 * extended bonuses at 17+ (1e: non-warriors cap at +2). */
const CON: ReadonlyArray<readonly [number, number]> = [
  [-2, -2], // 3
  [-1, -1], // 4
  [-1, -1], // 5
  [-1, -1], // 6
  [0, 0], // 7
  [0, 0], // 8
  [0, 0], // 9
  [0, 0], // 10
  [0, 0], // 11
  [0, 0], // 12
  [0, 0], // 13
  [0, 0], // 14
  [1, 1], // 15
  [2, 2], // 16
  [2, 3], // 17
  [2, 4], // 18
  [2, 5], // 19
];

function clampRow<T>(table: ReadonlyArray<T>, score: number, firstScore: number): T {
  const i = Math.max(0, Math.min(table.length - 1, Math.round(score) - firstScore));
  return table[i];
}

export const ADND1E_ABILITIES: AbilityModifiers = {
  strength(score: number, percentile = 0): StrengthMods {
    if (Math.round(score) === 18 && percentile > 0) {
      for (const [maxPct, hit, damage] of STR_18_PCT) {
        if (percentile <= maxPct) return { hit, damage };
      }
    }
    const [hit, damage] = clampRow(STR_BASE, score, 3);
    return { hit, damage };
  },
  dexterity(score: number): DexterityMods {
    const [missile, defensiveAc, reaction] = clampRow(DEX, score, 3);
    return { missile, defensiveAc, reaction };
  },
  constitution(score: number, isWarrior = false): ConstitutionMods {
    const [nonWarrior, warrior] = clampRow(CON, score, 3);
    return { hp: isWarrior ? warrior : nonWarrior };
  },
};
