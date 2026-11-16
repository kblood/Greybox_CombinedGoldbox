/**
 * `addnd1e-dragonlance` (M2.S4) — the Champions of Krynn ruleset overlay. It **extends** `addnd1e`:
 * the core ability/THAC0/save/XP math is inherited unchanged, and this layer adds the CoK-specific
 * Dragonlance rules — the seven-race model with verified ability ranges, the race/class allowance
 * matrix and (low) level caps, the Knight of Solamnia orders (Knight fights on the fighter tables),
 * clerical deity grants, and the three-moons mage modifiers.
 *
 * The `RulesetPlugin` contract stays engine-neutral (it only knows the core `ClassId`s); the
 * Dragonlance-specific surface is exported as the `dragonlance` data object + named helpers, which
 * the character-creation UI and CoK host call directly. All values are sourced from the game's own
 * manual — see docs/engine/research/cok-dragonlance-rules.md.
 */
import type { RulesetPlugin, SavingThrows } from '../types.js';
import { addnd1e } from '../addnd1e/index.js';
import { thac0, savingThrows } from '../addnd1e/combatTables.js';

import {
  DL_RACES,
  abilityRange,
  exceptionalStrengthCap,
  clampToRace,
  type DragonlanceRaceId,
  type RaceDefinition,
  type AbilityRange,
  type AbilityKey,
  type Sex,
} from './races.js';
import {
  DL_CLASSES,
  allowsClass,
  classesForRace,
  maxLevel,
  dqkMaxLevel,
  isMultiClassAllowed,
  petitionableOrder,
  KNIGHT_ORDERS,
  KNIGHT_ORDER_MINIMUMS,
  type DragonlanceClassId,
  type KnightOrder,
} from './classes.js';
import {
  DL_DEITIES,
  isDeityAllowed,
  deitiesForRace,
  deityThac0Bonus,
  deityTurnUndeadBonus,
  deityHealDieBonus,
  type DeityId,
  type DeityGrant,
  type Alignment,
} from './deities.js';
import {
  MOONS,
  moonPhaseMods,
  moonPhaseForDay,
  moonPhasesForDay,
  MOON_CYCLE_DAYS,
  MOON_PHASE_ORDER,
  type RobeOrder,
  type MoonPhase,
  type MoonInfo,
  type MoonPhaseMods,
  type MoonReading,
} from './moons.js';
import {
  createCharacter,
  coreClass,
  type CharacterRequest,
  type CharacterSheet,
  type CokCharacterAppearanceRecord,
  type ValidationResult,
} from './character.js';
import {
  COK_SPELLS,
  knownSpells,
  spellsAtLevel,
  spellById,
  maxCastableLevel,
  type SpellDef,
  type SpellClass,
} from './spellList.js';
import {
  emptyMemorization,
  normalizeMemorization,
  memorizedAt,
  freeSlots,
  memorize,
  forget,
  memorizedCount,
  totalMemorized,
  type Memorization,
} from './memorize.js';
import {
  spellEffect,
  isCampCastable,
  rollSpellAmount,
  type SpellEffect,
  type SpellEffectKind,
  type SpellTargetMode,
  type SpellDice,
} from './spellEffects.js';
import {
  chanceToLearnSpell,
  maxSpellsPerLevel,
  minSpellsPerLevel,
  attemptScribe,
  prayerGrant,
  type ScribeAttempt,
  type PrayerGrant,
} from './scribe.js';
import { tacticalSpellFor, isTacticalCastable } from './combatSpells.js';
import {
  DOK_SPELL_CROSSWALK,
  preparedSpellsFromDokIds,
  memorizationFromDokIds,
  dokIdsFromMemorizedSlugs,
  exportDokWizFromMemorizedSlugs,
} from './dokSpellCrosswalk.js';
import { DOK_SPELL_CLASS, classVoteFromDokIds } from './dokSpellClass.js';
import {
  CLASS_FLAG,
  computeClassFlags,
  itemUsableByClassFlags,
  findItemsToUnready,
  type DragonlanceClassSlot,
} from './classFlags.js';

export const ADND1E_DRAGONLANCE_ID = 'addnd1e-dragonlance';

/**
 * The Dragonlance overlay plugin. It reuses every base member (ability mods, XP/level progression,
 * THAC0, saving throws) and declares `extends: 'addnd1e'` so the registry resolves the inheritance
 * chain. Knight-specific combat is exposed separately (it maps to fighter — see `knightThac0`).
 */
export const addnd1eDragonlance: RulesetPlugin = {
  ...addnd1e,
  id: ADND1E_DRAGONLANCE_ID,
  name: 'AD&D 1e — Dragonlance (Champions of Krynn)',
  extends: addnd1e.id,
};

/** A Knight of Solamnia fights on the fighter attack matrix. */
export function knightThac0(level: number): number {
  return thac0('fighter', level);
}

/** A Knight of Solamnia saves on the fighter saving-throw table. */
export function knightSavingThrows(level: number): SavingThrows {
  return savingThrows('fighter', level);
}

/**
 * The Dragonlance rules surface, grouped for ergonomic access (`dragonlance.races`,
 * `dragonlance.allowsClass(...)`, …). Everything here is also re-exported individually below.
 */
export const dragonlance = {
  id: ADND1E_DRAGONLANCE_ID,
  // Races
  races: DL_RACES,
  abilityRange,
  exceptionalStrengthCap,
  clampToRace,
  // Classes
  classes: DL_CLASSES,
  allowsClass,
  classesForRace,
  maxLevel,
  dqkMaxLevel,
  isMultiClassAllowed,
  // Knight of Solamnia
  knightOrders: KNIGHT_ORDERS,
  knightOrderMinimums: KNIGHT_ORDER_MINIMUMS,
  petitionableOrder,
  knightThac0,
  knightSavingThrows,
  // Deities
  deities: DL_DEITIES,
  isDeityAllowed,
  deitiesForRace,
  deityThac0Bonus,
  deityTurnUndeadBonus,
  deityHealDieBonus,
  // Moons
  moons: MOONS,
  moonPhaseMods,
  // Character creation
  createCharacter,
  coreClass,
} as const;

export {
  DL_RACES,
  abilityRange,
  exceptionalStrengthCap,
  clampToRace,
  DL_CLASSES,
  allowsClass,
  classesForRace,
  maxLevel,
  dqkMaxLevel,
  isMultiClassAllowed,
  petitionableOrder,
  KNIGHT_ORDERS,
  KNIGHT_ORDER_MINIMUMS,
  DL_DEITIES,
  isDeityAllowed,
  deitiesForRace,
  deityThac0Bonus,
  deityTurnUndeadBonus,
  deityHealDieBonus,
  MOONS,
  moonPhaseMods,
  moonPhaseForDay,
  moonPhasesForDay,
  MOON_CYCLE_DAYS,
  MOON_PHASE_ORDER,
  createCharacter,
  coreClass,
  COK_SPELLS,
  knownSpells,
  spellsAtLevel,
  spellById,
  maxCastableLevel,
  emptyMemorization,
  normalizeMemorization,
  memorizedAt,
  freeSlots,
  memorize,
  forget,
  memorizedCount,
  totalMemorized,
  spellEffect,
  isCampCastable,
  rollSpellAmount,
  tacticalSpellFor,
  isTacticalCastable,
  DOK_SPELL_CROSSWALK,
  preparedSpellsFromDokIds,
  memorizationFromDokIds,
  dokIdsFromMemorizedSlugs,
  exportDokWizFromMemorizedSlugs,
  DOK_SPELL_CLASS,
  classVoteFromDokIds,
  chanceToLearnSpell,
  maxSpellsPerLevel,
  minSpellsPerLevel,
  attemptScribe,
  prayerGrant,
  CLASS_FLAG,
  computeClassFlags,
  itemUsableByClassFlags,
  findItemsToUnready,
};
export type {
  DragonlanceRaceId,
  RaceDefinition,
  AbilityRange,
  AbilityKey,
  Sex,
  DragonlanceClassId,
  KnightOrder,
  DeityId,
  DeityGrant,
  Alignment,
  RobeOrder,
  MoonPhase,
  MoonInfo,
  MoonPhaseMods,
  MoonReading,
  CharacterRequest,
  CharacterSheet,
  CokCharacterAppearanceRecord,
  ValidationResult,
  SpellDef,
  SpellClass,
  Memorization,
  SpellEffect,
  SpellEffectKind,
  SpellTargetMode,
  SpellDice,
  ScribeAttempt,
  PrayerGrant,
  DragonlanceClassSlot,
};
