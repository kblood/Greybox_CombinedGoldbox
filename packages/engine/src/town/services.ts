/**
 * Town services (A5.2) — the temple (healing / raising the dead) and the training hall (level-up)
 * economies, as pure cost + eligibility functions. The host owns gold, party HP, and XP; these
 * functions just price the service and decide whether it is allowed, mirroring how `shop.ts` prices
 * goods. Costs are CANDIDATE tuning values, isolated here for a later oracle pin.
 *
 * Training keys off the AD&D-1e experience tables (`xpForLevel`): a character may train into the next
 * level once their experience reaches that level's threshold AND they can pay the hall's fee. The
 * deterministic hit-point gain (`levelHpGain`) uses the class hit-die average so the level-up is
 * reproducible (the original games roll the die; Constitution is folded in by the host if modelled).
 */
import { xpForLevel } from '../ruleset/addnd1e/progression.js';
import type { ClassId } from '../ruleset/types.js';

// ── Temple ────────────────────────────────────────────────────────────────────────────────────
/** Steel pieces to cure one hit point of damage. */
export const HEAL_COST_PER_HP = 3;
/** Base steel cost to raise a fallen character. */
export const RAISE_BASE_COST = 750;
/** Additional steel per character level to raise the dead (higher-level heroes cost more). */
export const RAISE_COST_PER_LEVEL = 250;

/** Cost to cure `missingHp` points of damage (0 when nothing is missing). */
export function healCost(missingHp: number): number {
  return Math.max(0, Math.ceil(missingHp)) * HEAL_COST_PER_HP;
}

/** Cost to raise a character of the given level from the dead. */
export function raiseCost(level: number): number {
  return RAISE_BASE_COST + Math.max(1, Math.floor(level)) * RAISE_COST_PER_LEVEL;
}

// ── Training hall ─────────────────────────────────────────────────────────────────────────────
/** Steel per level charged to train into the next level. */
export const TRAIN_COST_PER_LEVEL = 1000;

/** Steel cost to train INTO `targetLevel` (the level being gained). */
export function trainingCost(targetLevel: number): number {
  return Math.max(1, Math.floor(targetLevel)) * TRAIN_COST_PER_LEVEL;
}

/**
 * Deterministic hit-point gain for advancing one level: the class hit-die's average (d10 → 6, d8 → 5,
 * d6 → 4, d4 → 3). Constitution per-level bonus, if modelled, is added by the host on top.
 */
export function levelHpGain(hitDie: number): number {
  if (hitDie <= 0) return 1;
  return Math.floor(hitDie / 2) + 1;
}

export interface TrainingCheck {
  eligible: boolean;
  currentLevel: number;
  targetLevel: number;
  /** Steel cost to train into `targetLevel`. */
  cost: number;
  /** Cumulative XP required to be `targetLevel`. */
  needXp: number;
  haveXp: number;
  reason?: string;
}

/**
 * Decide whether a character may train to their next level, given current experience and the party
 * gold. Eligible when XP has reached the next level's threshold and the fee is affordable; otherwise
 * `eligible` is false with a `reason`. Pure — the XP threshold comes from the injected `classId`'s
 * 1e table. M92.S1 — `levelCap`, if given, additionally refuses training past a race/class ceiling
 * the ruleset defines (this module stays ruleset-agnostic: the caller computes the cap and passes a
 * plain number, rather than this file importing ruleset-specific race/class types).
 */
export function checkTraining(
  classId: ClassId,
  currentLevel: number,
  xp: number,
  gold: number,
  levelCap?: number | null,
): TrainingCheck {
  const targetLevel = Math.max(1, Math.floor(currentLevel)) + 1;
  const needXp = xpForLevel(classId, targetLevel);
  const cost = trainingCost(targetLevel);
  let eligible = true;
  let reason: string | undefined;
  if (levelCap != null && targetLevel > levelCap) {
    eligible = false;
    reason = `at the level cap (${levelCap})`;
  } else if (xp < needXp) {
    eligible = false;
    reason = 'not enough experience';
  } else if (gold < cost) {
    eligible = false;
    reason = 'not enough steel';
  }
  return { eligible, currentLevel: Math.max(1, Math.floor(currentLevel)), targetLevel, cost, needXp, haveXp: xp, reason };
}
