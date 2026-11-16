/**
 * Ruleset plugin contract (M2.S3) — the pluggable rules layer the VM, combat loop, and
 * character sheet call into. A `RulesetPlugin` is pure data+math over engine-neutral types: it
 * never touches the DOM, decoded assets, or game files. Games pick a ruleset by id (e.g. CoK →
 * `addnd1e-dragonlance`, which layers over `addnd1e`); the registry resolves the id to a plugin.
 *
 * This file is the stable interface. The first implementation (`addnd1e`) supplies ability-score
 * modifiers and class XP/level progression; the combat-math tables (attack matrices, saving
 * throws, spell slots) are optional here and filled in by a later slice so partial rulesets are
 * legal and testable in isolation.
 */

/** Single-class identifiers the rulesets understand. Multi-class is modelled by the caller as a
 * set of these with the level for each. */
export type ClassId =
  | 'fighter'
  | 'paladin'
  | 'ranger'
  | 'cleric'
  | 'druid'
  | 'magicUser'
  | 'illusionist'
  | 'thief'
  | 'assassin'
  | 'monk'
  | 'bard';

/** The six classic ability scores. `strPct` is the 1e exceptional-strength percentile (1..100,
 * only meaningful at STR 18 for warriors); omit/0 for non-exceptional. */
export interface AbilityScores {
  str: number;
  strPct?: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}

/** Strength's melee modifiers: `hit` to attack rolls, `damage` to damage rolls. */
export interface StrengthMods {
  hit: number;
  damage: number;
}

/** Dexterity's combat modifiers. `defensiveAc` is added to the armour class *number* (negative =
 * better AC, matching the descending-AC convention). `missile` adjusts ranged attack rolls;
 * `reaction` adjusts initiative/surprise. */
export interface DexterityMods {
  missile: number;
  defensiveAc: number;
  reaction: number;
}

/** Constitution's hit-point adjustment, applied per Hit Die. */
export interface ConstitutionMods {
  hp: number;
}

/** Ability-score → modifier tables. Each is a total function clamped to the table's bounds. */
export interface AbilityModifiers {
  /** Melee to-hit/damage. Pass the exceptional-strength percentile for STR 18 warriors. */
  strength(score: number, percentile?: number): StrengthMods;
  /** Missile to-hit, defensive AC adjustment, and reaction/initiative. */
  dexterity(score: number): DexterityMods;
  /** Per-Hit-Die hit-point bonus. Warriors get the extended high-CON bonuses. */
  constitution(score: number, isWarrior?: boolean): ConstitutionMods;
}

/** Saving-throw target numbers (roll d20 ≥ value to save) for the five 1e categories. */
export interface SavingThrows {
  paralyzePoisonDeath: number;
  petrifyPolymorph: number;
  rodStaffWand: number;
  breath: number;
  spell: number;
}

/**
 * A complete (or partial) ruleset. Required: identity + ability modifiers + class progression.
 * Combat-math members are optional so a ruleset can be built and tested incrementally.
 */
export interface RulesetPlugin {
  readonly id: string;
  readonly name: string;
  /** Ruleset id this one layers over (e.g. a Dragonlance overlay → `addnd1e`), if any. */
  readonly extends?: string;

  readonly abilityMods: AbilityModifiers;

  /** Cumulative experience required to *be* `level` in `classId` (level 1 = 0). */
  xpForLevel(classId: ClassId, level: number): number;
  /** Highest level `classId` reaches with `xp` experience (≥ 1). */
  levelForXp(classId: ClassId, xp: number): number;
  /** Hit-die size (d`hitDie`) for `classId` at `level` (1e: fixed dice up to name level). */
  hitDie?(classId: ClassId, level: number): number;

  /** To-hit Armour Class 0 for `classId` at `level` (the attack-matrix base). */
  thac0?(classId: ClassId, level: number): number;
  /** Saving-throw targets for `classId` at `level`. */
  savingThrows?(classId: ClassId, level: number): SavingThrows;
  /** Memorizable spell slots per spell level (index 0 = level-1 slots) for `classId` at `level`. */
  spellSlots?(classId: ClassId, level: number): number[];
}
