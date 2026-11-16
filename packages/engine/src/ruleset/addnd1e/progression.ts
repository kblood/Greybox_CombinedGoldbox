/**
 * AD&D 1st-edition class experience progression (PHB), as used by the Gold Box games.
 *
 * Each class has an explicit cumulative-XP table up to "name level"; beyond the table a fixed
 * per-level increment applies (1e adds a flat amount for every level past the last printed row).
 * Hit dice are dN up to name level, then a flat +hp (no Con bonus) per level — modelled by
 * `hitDie` returning the die size while the table lasts. Values: docs/engine/research/addnd1e-tables.md.
 */
import type { ClassId } from '../types.js';

interface ClassProgression {
  /** Cumulative XP to reach level i+1 (xp[0] = 0 for level 1). */
  xp: number[];
  /** Flat XP added per level beyond the table. */
  perLevel: number;
  /** Hit-die size up to name level. */
  hitDie: number;
}

// Cumulative XP thresholds (level 1 .. name level). 1e PHB.
const FIGHTER: ClassProgression = {
  xp: [0, 2000, 4000, 8000, 18000, 35000, 70000, 125000, 250000],
  perLevel: 250000,
  hitDie: 10,
};
const CLERIC: ClassProgression = {
  xp: [0, 1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000],
  perLevel: 225000,
  hitDie: 8,
};
const MAGIC_USER: ClassProgression = {
  xp: [0, 2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000],
  perLevel: 375000,
  hitDie: 4,
};
const THIEF: ClassProgression = {
  xp: [0, 1250, 2500, 5000, 10000, 20000, 42500, 70000, 110000, 160000, 220000],
  perLevel: 220000,
  hitDie: 6,
};

/** Class → progression. Paladin/ranger/druid/illusionist/etc. fall back to their closest core
 * group until their own 1e tables are transcribed (tracked in the research doc). */
const TABLE: Record<ClassId, ClassProgression> = {
  fighter: FIGHTER,
  paladin: FIGHTER,
  ranger: FIGHTER,
  cleric: CLERIC,
  druid: CLERIC,
  magicUser: MAGIC_USER,
  illusionist: MAGIC_USER,
  thief: THIEF,
  assassin: THIEF,
  monk: THIEF,
  bard: THIEF,
};

function prog(classId: ClassId): ClassProgression {
  return TABLE[classId] ?? FIGHTER;
}

/** Cumulative XP required to *be* `level` in `classId` (level 1 → 0). */
export function xpForLevel(classId: ClassId, level: number): number {
  const p = prog(classId);
  const lvl = Math.max(1, Math.floor(level));
  if (lvl <= p.xp.length) return p.xp[lvl - 1];
  const overName = lvl - p.xp.length;
  return p.xp[p.xp.length - 1] + overName * p.perLevel;
}

/** Highest level reachable in `classId` with `xp` experience (≥ 1). */
export function levelForXp(classId: ClassId, xp: number): number {
  const p = prog(classId);
  if (xp < 0) return 1;
  // Within the printed table.
  let level = 1;
  for (let i = 0; i < p.xp.length; i++) {
    if (xp >= p.xp[i]) level = i + 1;
    else return level;
  }
  // Past name level: each `perLevel` chunk is one more level.
  const past = xp - p.xp[p.xp.length - 1];
  return p.xp.length + Math.floor(past / p.perLevel);
}

/** Hit-die size for `classId` (constant up to name level in 1e). */
export function hitDie(classId: ClassId): number {
  return prog(classId).hitDie;
}
