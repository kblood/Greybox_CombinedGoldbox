/**
 * `addnd1e` — the AD&D 1st-edition core ruleset. Supplies ability-score modifiers and class
 * XP/level progression (M2.S3a) plus the **THAC0 attack matrix and saving-throw tables** (M2.S3b),
 * transcribed from the SSI engine (coab decompile) and cross-validated against Champions of Krynn's
 * own NPC data — see `combatTables.ts`. Spell-slot progression (`spells.ts`) is the same accumulation
 * the SSI engine uses. Dragonlance rules (CoK classes/races, lunar magic) layer on top as
 * `addnd1e-dragonlance` (M2.S4) via `extends`.
 */
import type { ClassId, RulesetPlugin } from '../types.js';
import { ADND1E_ABILITIES } from './abilities.js';
import { hitDie, levelForXp, xpForLevel } from './progression.js';
import { thac0, savingThrows } from './combatTables.js';
import { spellSlots } from './spells.js';

export const ADND1E_ID = 'addnd1e';

export const addnd1e: RulesetPlugin = {
  id: ADND1E_ID,
  name: 'Advanced D&D (1st Edition)',
  abilityMods: ADND1E_ABILITIES,
  xpForLevel,
  levelForXp,
  hitDie: (classId: ClassId) => hitDie(classId),
  thac0,
  savingThrows,
  spellSlots,
};

export { ADND1E_ABILITIES } from './abilities.js';
export { xpForLevel, levelForXp, hitDie } from './progression.js';
export { thac0, savingThrows } from './combatTables.js';
export { spellSlots, clericWisdomBonusSpells, clericSpellSlots, SPELL_LEVELS } from './spells.js';
export {
  calcBattleExp,
  calcDuelExp,
  hasPrimeRequisiteBonus,
  characterXpShare,
  awardCombatExperience,
  XP_PER_ITEM_PLUS,
  XP_PER_DUEL_HIT_DIE,
  type DefeatedEnemy,
  type BattleLoot,
  type XpRecipient,
  type XpAward,
} from './experience.js';
export {
  bestThac0,
  maxClassLevel,
  warriorMultipleAttacks,
  dualClassWarriorReactivates,
  conPoisonSaveBonus,
  recalcCombatProfile,
  type ClassSlot,
  type CombatProfile,
} from './recalc.js';
