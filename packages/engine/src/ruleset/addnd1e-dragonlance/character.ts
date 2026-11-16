/**
 * Champions of Krynn character creation + validation (M2.S4c). Turns a creation request (race, sex,
 * class/levels, ability scores, deity) into a validated `CharacterSheet` with all derived combat and
 * spell stats, or a list of rule violations. This is the engine-pure core a character-creation UI
 * sits on top of; it composes the M2.S4 overlay (race ranges, class matrix, deities, Knight orders)
 * with the base AD&D-1e math (THAC0, saves, spell slots) and the combat party bridge.
 *
 * Validation enforces the manual's rules: classes must be allowed for the race, multi-class only for
 * non-humans, level ≤ the racial cap, ability scores within the racial ranges, a cleric must pick a
 * deity (dwarves must pick Reorx). The derived sheet uses the best (lowest) THAC0/save across the
 * character's classes — Knight fights on the fighter tables — plus the deity THAC0 grant, and spell
 * slots per caster class (cleric with the Wisdom bonus).
 */
import type { AbilityScores, ClassId, SavingThrows } from '../types.js';
import { thac0 as baseThac0, savingThrows as baseSaves } from '../addnd1e/combatTables.js';
import { spellSlots, clericSpellSlots } from '../addnd1e/spells.js';
import { ADND1E_ABILITIES } from '../addnd1e/abilities.js';
import { conPoisonSaveBonus } from '../addnd1e/recalc.js';

import { abilityRange, type DragonlanceRaceId, type Sex, type AbilityKey } from './races.js';
import {
  allowsClass,
  maxLevel,
  dqkMaxLevel,
  isMultiClassAllowed,
  petitionableOrder,
  type DragonlanceClassId,
  type KnightOrder,
} from './classes.js';
import { isDeityAllowed, deityThac0Bonus, type DeityId } from './deities.js';
import type { RobeOrder } from './moons.js';

/** A character-creation request (the UI's input). `classes` maps each chosen class to its level. */
export interface CharacterRequest {
  name: string;
  race: DragonlanceRaceId;
  sex?: Sex;
  classes: Partial<Record<DragonlanceClassId, number>>;
  abilities: AbilityScores;
  /** Required when the character has a Cleric class; dwarves must choose Reorx. */
  deity?: DeityId;
  /** Optional source identity of the CoK head/body icon; never inferred from class or race. */
  appearance?: CokCharacterAppearanceRecord;
  /**
   * A magic-user's robe order (white/red — black is NPC-only, rejected). Optional: an unset robe
   * models a "Rogue mage" (Journal p. 16, refused/skipped the Test of High Sorcery) — legal, but
   * they "gain no moon benefits" ({@link moonPhaseMods}).
   */
  robe?: RobeOrder;
  hp: number;
  maxHp: number;
  /** Worn-armour AC before Dexterity (10 = unarmoured; lower = better). */
  baseAc: number;
  /** Which race/class level-cap table to validate against (M95). Absent/`'cok'` = the flat, low CoK/DoK
   * ceiling (`maxLevel()`, Journal p.56) — the correct default for every existing CoK/DoK caller.
   * `'dqk'` = DQK's own, materially more permissive table (`dqkMaxLevel()`, M93) — for callers building
   * a DQK-destined sheet (DoK→DQK import, the hand-authored DQK heroes). */
  levelCapRuleset?: 'cok' | 'dqk';
}

/** Raw appearance selectors from the CoK character record, retained until a verified art mapping
 * resolves them. The tuple is CHEAD request, CBODY block, CBODY pointer-table slot, filename suffix
 * selector, followed by the six palette bytes. */
export interface CokCharacterAppearanceRecord {
  cHeadRequest: number;
  cBodyBlock: number;
  cBodySlot: number;
  suffixCode: number;
  paletteBytes: number[];
}

/** A fully-derived, validated CoK character. */
export interface CharacterSheet {
  name: string;
  race: DragonlanceRaceId;
  sex: Sex;
  /** Source-backed head/body identity when imported or explicitly selected. */
  appearance?: CokCharacterAppearanceRecord;
  classes: Partial<Record<DragonlanceClassId, number>>;
  abilities: AbilityScores;
  deity?: DeityId;
  /** A magic-user's robe order (undefined = Rogue mage, no moon benefits). See {@link CharacterRequest.robe}. */
  robe?: RobeOrder;
  /** Best (lowest) effective THAC0 across classes, incl. STR to-hit + deity grant. */
  thac0: number;
  /** Armour class incl. the Dexterity defensive adjustment. */
  ac: number;
  /** Best (lowest) saving throw per category across the character's classes. */
  savingThrows: SavingThrows;
  /** Memorizable spell slots per caster class (`[L1..L5]`); absent for non-casters. */
  spellSlots: Partial<Record<DragonlanceClassId, number[]>>;
  hp: number;
  maxHp: number;
  /** The Knight order the character qualifies for (only when a Knight class is present). */
  knightOrder?: KnightOrder;
  /**
   * The eight thief-skill percentages in `.CCH` order, when they came from a save.
   *
   * **Carried, never computed.** `recalcThiefSkills` (`ruleset/addnd1e/thiefSkills.ts`) implements
   * the real routine, but its race-modifier row is only resolved for COAB's `Race` enum — the
   * Dragonlance race set is different and larger, so computing a Krynn character's skills would mean
   * inventing that mapping. {@link createCharacter} therefore leaves this undefined, and only the
   * save importer sets it, from the bytes CoK itself stored at record offset 219
   * (`loaders/savedCharacter.ts`). Undefined means "not known", not "zero".
   */
  thiefSkills?: number[];
}

export type ValidationResult =
  | { ok: true; sheet: CharacterSheet; warnings: string[] }
  | { ok: false; errors: string[] };

/** Map a Dragonlance class to the core AD&D-1e class whose tables it uses (Knight → fighter).
 * Exported for callers outside character creation that need the same mapping — e.g. the post-combat
 * XP split ({@link characterXpShare} / `hasPrimeRequisiteBonus`), which reads prime-requisite ability
 * scores off the core AD&D-1e class table. */
export function coreClass(classId: DragonlanceClassId): ClassId {
  return classId === 'knight' ? 'fighter' : classId;
}

const ABILITY_KEYS: AbilityKey[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

const SAVE_CATEGORIES: (keyof SavingThrows)[] = [
  'paralyzePoisonDeath',
  'petrifyPolymorph',
  'rodStaffWand',
  'breath',
  'spell',
];

/** Races the manual calls "resistant to magic & poison" (Journal p. 4) — the poison-save half. */
const POISON_RESISTANT_RACES = new Set<DragonlanceRaceId>(['hillDwarf', 'mountainDwarf', 'kender']);

/**
 * Validate a creation request and, if legal, produce the derived sheet. Returns `{ ok:false, errors }`
 * listing every rule violation (so a UI can show them all at once), or `{ ok:true, sheet, warnings }`.
 */
export function createCharacter(req: CharacterRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sex: Sex = req.sex ?? 'male';
  const entries = Object.entries(req.classes).filter(([, lvl]) => (lvl ?? 0) > 0) as [
    DragonlanceClassId,
    number,
  ][];

  // --- class legality ---
  if (entries.length === 0) errors.push(`${req.name}: must have at least one class`);
  if (entries.length > 1 && !isMultiClassAllowed(req.race)) {
    errors.push(`${req.race} may not multi-class (humans are single-class only)`);
  }
  for (const [cls, level] of entries) {
    if (!allowsClass(req.race, cls)) {
      errors.push(`${req.race} may not be a ${cls}`);
      continue;
    }
    const cap = req.levelCapRuleset === 'dqk'
      ? dqkMaxLevel(req.race, cls)
      : maxLevel(req.race, cls, req.abilities.str);
    if (cap !== null && level > cap) {
      errors.push(`${cls} level ${level} exceeds the ${req.race} cap of ${cap}`);
    }
  }

  // --- ability ranges ---
  for (const key of ABILITY_KEYS) {
    const range = abilityRange(req.race, key, sex);
    const v = req.abilities[key];
    if (v < range.min || v > range.max) {
      errors.push(`${key.toUpperCase()} ${v} out of ${req.race} range ${range.min}-${range.max}`);
    }
  }

  // --- deity (clerics) ---
  const hasCleric = entries.some(([c]) => c === 'cleric');
  if (hasCleric) {
    if (!req.deity) {
      errors.push(`${req.name}: a Cleric must choose a deity`);
    } else if (!isDeityAllowed(req.deity, req.race)) {
      errors.push(`${req.race} clerics must worship Reorx, not ${req.deity}`);
    }
  } else if (req.deity) {
    warnings.push(`deity ${req.deity} ignored (no Cleric class)`);
  }

  // --- robe (magic-users) — black robe is NPC-only (Journal p. 16); unset is a legal "Rogue mage" ---
  const hasMagicUser = entries.some(([c]) => c === 'magicUser');
  if (hasMagicUser) {
    if (req.robe === 'black') errors.push(`${req.name}: Black Robe is NPC-only`);
  } else if (req.robe) {
    warnings.push(`robe ${req.robe} ignored (no Magic-User class)`);
  }

  if (errors.length > 0) return { ok: false, errors };

  // --- derive the sheet (request is legal) ---
  const str = ADND1E_ABILITIES.strength(req.abilities.str, req.abilities.strPct);
  const dex = ADND1E_ABILITIES.dexterity(req.abilities.dex);
  const deityHit = req.deity ? deityThac0Bonus(req.deity, req.race) : 0;

  let bestThac0 = Infinity;
  const saves: SavingThrows = {
    paralyzePoisonDeath: 20,
    petrifyPolymorph: 20,
    rodStaffWand: 20,
    breath: 20,
    spell: 20,
  };
  const slots: Partial<Record<DragonlanceClassId, number[]>> = {};

  for (const [cls, level] of entries) {
    const core = coreClass(cls);
    bestThac0 = Math.min(bestThac0, baseThac0(core, level));
    const cs = baseSaves(core, level);
    for (const cat of SAVE_CATEGORIES) saves[cat] = Math.min(saves[cat], cs[cat]);
    // Spell slots per caster class (cleric gets the Wisdom bonus).
    if (cls === 'cleric') slots[cls] = clericSpellSlots(level, req.abilities.wis);
    else {
      const sp = spellSlots(core, level);
      if (sp.some((n) => n > 0)) slots[cls] = sp;
    }
  }

  // Hill Dwarf / Mountain Dwarf / Kender are "resistant to magic & poison" (Journal p. 4, the
  // poison half — `cok-dragonlance-rules.md` §1): fold in the Con-scaled poison-save bonus
  // (`ovr026` `SaveVersePoisonBonus`, `conPoisonSaveBonus`) on top of the class-table save. A
  // lower saving-throw number is better, so the bonus subtracts.
  if (POISON_RESISTANT_RACES.has(req.race)) {
    saves.paralyzePoisonDeath -= conPoisonSaveBonus(req.abilities.con);
  }

  const sheet: CharacterSheet = {
    name: req.name,
    race: req.race,
    sex,
    ...(req.appearance ? { appearance: { ...req.appearance, paletteBytes: [...req.appearance.paletteBytes] } } : {}),
    classes: req.classes,
    abilities: req.abilities,
    deity: hasCleric ? req.deity : undefined,
    robe: hasMagicUser ? req.robe : undefined,
    thac0: bestThac0 - str.hit - deityHit,
    ac: req.baseAc + dex.defensiveAc,
    savingThrows: saves,
    spellSlots: slots,
    hp: req.hp,
    maxHp: req.maxHp,
  };
  if (entries.some(([c]) => c === 'knight')) sheet.knightOrder = petitionableOrder(req.abilities);

  return { ok: true, sheet, warnings };
}
