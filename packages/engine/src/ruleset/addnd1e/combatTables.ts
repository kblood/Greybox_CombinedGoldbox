/**
 * `addnd1e` combat-math tables (M2.S3b) — THAC0 (the attack matrix) and the five saving-throw
 * targets, by class and level.
 *
 * Provenance: these are the canonical AD&D-1st-edition tables exactly as SSI encoded them in the
 * Gold Box engine. They were transcribed from the `simeonpilgrim/coab` decompile (Curse of the
 * Azure Bonds — the engine generation immediately before the Krynn games), specifically
 * `engine/ovr018.cs` `thac0_table` and `engine/ovr026.cs` `SaveThrowValues`, and then
 * **cross-validated against Champions of Krynn's own data**: the CoK NPC-class monster records
 * (`MON1CHA.DAX`) store each NPC's THAC0, and WARRIOR (fighter, HD 3) → 18, SOLDIER (fighter, HD 7)
 * → 14, BLACK ROBE MAGE (HD 3) → 21 match this table's fighter[3]=18 / fighter[7]=14 /
 * magicUser[3]=21 exactly. The engine stores THAC0 inverted as `0x3C − value` (0x3C = 60), the same
 * `60 − x` convention we recovered for monster THAC0/AC — so the numbers below are the *already
 * decoded* THAC0 (lower = better attacker).
 *
 * Tables are indexed [level], level 0..12 (column 0 is the engine's "no class" placeholder; PCs use
 * level ≥ 1). Levels beyond 12 clamp to the last column (the engine caps here). Saving-throw rows
 * are `[paralyzePoisonDeath, petrifyPolymorph, rodStaffWand, breath, spell]` (roll d20 ≥ value);
 * for a multi-class character the caller takes the best (lowest) of each class's row.
 */
import type { ClassId, SavingThrows } from '../types.js';

const MAX_COL = 12;

/** Class → row index in the source engine tables (extra PC classes map to their 1e save/attack
 * group: illusionist saves as magic-user, assassin/bard as thief). */
const ROW: Record<ClassId, ClassId> = {
  cleric: 'cleric',
  druid: 'druid',
  fighter: 'fighter',
  paladin: 'paladin',
  ranger: 'ranger',
  magicUser: 'magicUser',
  illusionist: 'magicUser',
  thief: 'thief',
  assassin: 'thief',
  bard: 'thief',
  monk: 'monk',
};

/** THAC0 (to-hit AC 0) by level 0..12. Source: coab `ovr018.cs thac0_table` (= 60 − stored). */
const THAC0: Record<ClassId, readonly number[]> = {
  cleric: [20, 20, 20, 20, 18, 18, 18, 16, 16, 16, 14, 14, 14],
  druid: [20, 20, 20, 20, 18, 18, 18, 16, 16, 16, 14, 14, 14],
  fighter: [21, 20, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9],
  paladin: [20, 20, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9],
  ranger: [20, 20, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9],
  magicUser: [21, 21, 21, 21, 21, 21, 19, 19, 19, 19, 19, 17, 17],
  thief: [20, 20, 20, 20, 20, 19, 19, 19, 19, 16, 16, 16, 16],
  monk: [20, 20, 20, 20, 18, 18, 18, 16, 16, 16, 14, 14, 14],
  illusionist: [21, 21, 21, 21, 21, 21, 19, 19, 19, 19, 19, 17, 17],
  assassin: [20, 20, 20, 20, 20, 19, 19, 19, 19, 16, 16, 16, 16],
  bard: [20, 20, 20, 20, 20, 19, 19, 19, 19, 16, 16, 16, 16],
};

/** Saving-throw targets [PPD, PetPoly, RSW, Breath, Spell] by level 0..12. Source: coab
 * `ovr026.cs SaveThrowValues`. */
const SAVES: Record<ClassId, readonly (readonly number[])[]> = {
  cleric: [[20, 20, 20, 20, 20], [10, 13, 14, 16, 15], [10, 13, 14, 16, 15], [10, 13, 14, 16, 15], [9, 12, 13, 15, 14], [9, 12, 13, 15, 14], [9, 12, 13, 15, 14], [7, 10, 11, 13, 12], [7, 10, 11, 13, 12], [7, 10, 11, 13, 12], [6, 9, 10, 12, 11], [6, 9, 10, 12, 11], [6, 9, 10, 12, 11]],
  druid: [[20, 20, 20, 20, 20], [10, 13, 14, 16, 15], [10, 13, 14, 16, 15], [10, 13, 14, 16, 15], [9, 12, 13, 15, 14], [9, 12, 13, 15, 14], [9, 12, 13, 15, 14], [7, 10, 11, 13, 12], [7, 10, 11, 13, 12], [7, 10, 11, 13, 12], [6, 9, 10, 12, 11], [6, 9, 10, 12, 11], [6, 9, 10, 12, 11]],
  fighter: [[20, 20, 20, 20, 20], [14, 15, 16, 17, 17], [14, 15, 16, 17, 17], [13, 14, 15, 16, 16], [13, 14, 15, 16, 16], [11, 12, 13, 13, 14], [11, 12, 13, 13, 14], [10, 11, 12, 12, 13], [10, 11, 12, 12, 13], [8, 9, 10, 9, 11], [8, 9, 10, 9, 11], [7, 8, 9, 8, 10], [7, 8, 9, 8, 10]],
  paladin: [[20, 20, 20, 20, 20], [12, 13, 14, 15, 15], [12, 13, 14, 15, 15], [11, 12, 13, 14, 14], [11, 12, 13, 14, 14], [9, 9, 11, 11, 12], [9, 9, 11, 11, 12], [8, 9, 10, 10, 11], [9, 9, 10, 10, 11], [6, 7, 8, 7, 9], [6, 7, 8, 7, 9], [5, 6, 7, 6, 8], [5, 6, 7, 6, 8]],
  ranger: [[20, 20, 20, 20, 20], [14, 15, 16, 17, 17], [14, 15, 16, 17, 17], [13, 14, 15, 16, 16], [13, 14, 15, 16, 16], [11, 12, 13, 13, 14], [11, 12, 13, 13, 14], [10, 11, 12, 12, 13], [10, 11, 12, 12, 13], [8, 9, 10, 9, 11], [8, 9, 10, 9, 11], [7, 8, 9, 8, 10], [7, 8, 9, 8, 10]],
  magicUser: [[20, 20, 20, 20, 20], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [11, 9, 7, 11, 8], [11, 9, 7, 11, 8]],
  thief: [[20, 20, 20, 20, 20], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11]],
  monk: [[20, 20, 20, 20, 20], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [11, 10, 10, 14, 11], [13, 11, 9, 13, 10], [11, 9, 7, 11, 8], [11, 9, 7, 11, 8]],
  illusionist: [[20, 20, 20, 20, 20], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [14, 13, 11, 15, 12], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [13, 11, 9, 13, 10], [11, 9, 7, 11, 8], [11, 9, 7, 11, 8]],
  assassin: [[20, 20, 20, 20, 20], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11]],
  bard: [[20, 20, 20, 20, 20], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [13, 12, 14, 16, 15], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [12, 11, 12, 15, 13], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11], [11, 10, 10, 14, 11]],
};

function col(level: number): number {
  if (level < 1) return 1; // PCs are ≥ 1; the level-0 placeholder column is never the answer
  return level > MAX_COL ? MAX_COL : level;
}

/** THAC0 for `classId` at `level` (lower is better). */
export function thac0(classId: ClassId, level: number): number {
  return THAC0[ROW[classId]][col(level)];
}

/** The five saving-throw targets for `classId` at `level` (roll d20 ≥ value to save). */
export function savingThrows(classId: ClassId, level: number): SavingThrows {
  const [paralyzePoisonDeath, petrifyPolymorph, rodStaffWand, breath, spell] =
    SAVES[ROW[classId]][col(level)];
  return { paralyzePoisonDeath, petrifyPolymorph, rodStaffWand, breath, spell };
}
