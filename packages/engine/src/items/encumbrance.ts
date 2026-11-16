/**
 * Encumbrance model (A4.2) — turns a carried weight (from {@link inventoryWeightTenths}) and a
 * character's Strength into an encumbrance level + movement rate, the way the Gold Box engine slows
 * a weighed-down party. AD&D-1e bases a character's carrying capacity on Strength (the heavier the
 * Strength, the more they shrug off), and steps movement down through unencumbered → light →
 * moderate → heavy → overloaded as the load climbs.
 *
 * The Strength→allowance table and the step fractions are **CANDIDATE** (self-consistent and
 * monotonic, calibrated to the AD&D weight-allowance shape) pending a screenshot/oracle pin like the
 * one that promoted the combat geometry — they are isolated here so that pin is a one-file change.
 */

export type EncumbranceLevel = 'unencumbered' | 'light' | 'moderate' | 'heavy' | 'overloaded';

export interface Encumbrance {
  level: EncumbranceLevel;
  /** Display label, e.g. "LIGHT". */
  label: string;
  /** Combat/exploration movement rate in inches (AD&D "). 0 = can't move under the load. */
  moveRate: number;
  /** The unencumbered allowance for this Strength, in tenths of a pound. */
  allowanceTenths: number;
  /** The overloaded threshold (carry beyond this and you can't move), tenths of a pound. */
  maxLoadTenths: number;
}

/** Unencumbered weight allowance in **pounds** by Strength 3..18 (CANDIDATE, AD&D-allowance shaped). */
const STR_ALLOWANCE_LB: number[] = [
  // 3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18
  10, 15, 15, 20, 20, 35, 35, 40, 40, 45, 45, 55, 55, 70, 85, 110,
];

/** Extra unencumbered allowance (lb) for exceptional Strength (18/xx) by percentile. CANDIDATE. */
function exceptionalBonusLb(pct: number): number {
  if (pct <= 0) return 0;
  if (pct <= 50) return 10;
  if (pct <= 75) return 25;
  if (pct <= 90) return 50;
  if (pct <= 99) return 75;
  return 125; // 18/00
}

const MOVE_BY_LEVEL: Record<EncumbranceLevel, number> = {
  unencumbered: 12,
  light: 9,
  moderate: 6,
  heavy: 3,
  overloaded: 0,
};

/** The unencumbered allowance for a Strength score (+ optional 18/xx percentile), tenths of a pound. */
export function allowanceTenths(str: number, strPct = 0): number {
  const i = Math.max(0, Math.min(STR_ALLOWANCE_LB.length - 1, Math.round(str) - 3));
  let lb = STR_ALLOWANCE_LB[i];
  if (Math.round(str) === 18 && strPct > 0) lb += exceptionalBonusLb(strPct);
  return lb * 10;
}

/**
 * Classify a carried weight (tenths of a pound) for a Strength. Steps at 1×/2×/3×/4× the
 * unencumbered allowance: ≤1× unencumbered, ≤2× light, ≤3× moderate, ≤4× heavy, beyond → overloaded.
 */
export function encumbrance(weightTenths: number, str: number, strPct = 0): Encumbrance {
  const a = allowanceTenths(str, strPct);
  const max = a * 4;
  let level: EncumbranceLevel;
  if (weightTenths <= a) level = 'unencumbered';
  else if (weightTenths <= a * 2) level = 'light';
  else if (weightTenths <= a * 3) level = 'moderate';
  else if (weightTenths <= max) level = 'heavy';
  else level = 'overloaded';
  return {
    level,
    label: level.toUpperCase(),
    moveRate: MOVE_BY_LEVEL[level],
    allowanceTenths: a,
    maxLoadTenths: max,
  };
}
