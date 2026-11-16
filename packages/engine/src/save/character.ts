/**
 * Engine-neutral Krynn `Player` record — the field inventory a character *is* (ovr017/ovr018).
 *
 * Reverse-engineered from the COAB oracle `coab_extracted/Classes/Player.cs` +
 * `engine/ovr017.cs` `ConvertPoolRadPlayer` (the authoritative enumeration of "what defines a
 * character") and cross-checked against the spec `docs/engine/research/decompile-ovr017-save-import.md`.
 *
 * The SSI AD&D Gold Box family (Pool of Radiance / Curse of the Azure Bonds / Secret of the Silver
 * Blades / Hillsfar / Krynn) all share this **logical** field set; only the on-disk byte offsets
 * drift per game (a loader's job — `savedCharacter.ts` decodes CoK's `.CCH`). So cross-game import at
 * this engine-neutral layer is a per-field semantic copy plus a few Krynn-specific fixups, NOT a
 * `memcpy` — see `import.ts`.
 *
 * Pure data + constants: no DOM, no Node, no file-format types.
 */
import type { AbilityScores, ClassId } from '../ruleset/types.js';
import type { DragonlanceRaceId, Sex } from '../ruleset/addnd1e-dragonlance/races.js';

/** `Spells.animate_dead` (COAB `Spells.cs`): the spell id force-cleared on import (`spellBook[id-1]=0`). */
export const ANIMATE_DEAD_SPELL_ID = 0x24;
/** Spell-book length (`0x38` = 56 slots). */
export const SPELLBOOK_SIZE = 0x38;
/** Multiclass per-class level array length (`ClassLevel[8]`). */
export const CLASS_LEVEL_SLOTS = 8;
/** Thief-skill array length. */
export const THIEF_SKILL_SLOTS = 8;
/** Combat-icon recolour array length. */
export const ICON_COLOUR_SLOTS = 6;
/** Saving-throw "verse" array length. */
export const SAVE_VERSE_SLOTS = 5;
/** Fixed platinum stipend granted to every imported character (`Money.SetCoins(Platinum, 300)`). */
export const IMPORT_PLATINUM_STIPEND = 300;
/** `Control.NPC_Base` (0x80): `control_morale < NPC_Base` ⇒ a player character; `>=` ⇒ an NPC. */
export const NPC_BASE = 0x80;

/** One of a character's two melee attack profiles (the `*_Base` pre-modifier values import copies). */
export interface DualAttackProfile {
  diceCountBase: number;
  diceSizeBase: number;
  damageBonusBase: number;
}

/**
 * The Krynn `Player` record, engine-neutral. Every field `ConvertPoolRadPlayer` copies is modelled so
 * the import is a complete transfer; combat-math/derived caches the engine recomputes are omitted.
 */
export interface PlayerCharacter {
  // --- Identity ---
  race: DragonlanceRaceId;
  sex: Sex;
  name: string;
  /** Six ability scores; `strPct` is the exceptional-STR percentile (`Str00`). */
  abilities: AbilityScores;

  // --- Combat core ---
  thac0: number;
  classId: ClassId;
  age: number;
  hitPointMax: number;
  baseMovement: number;
  hitDice: number;
  /** Set to `hitDice` on import (`multiclassLevel = HitDice`). */
  multiclassLevel: number;
  lostLevels: number;
  lostHp: number;
  baseAc: number;
  attackLevel: number;
  /** Experience points (carried verbatim; Hillsfar raises it). */
  exp: number;

  // --- Multiclass ---
  /** 8-slot per-class level array (the same `ClassLevel[]` ovr026's recalc reads). */
  classLevels: number[];
  classFlags: number;
  attacksCount: number;
  attack1: DualAttackProfile;
  attack2: DualAttackProfile;

  // --- Magic ---
  /** 56-slot spell book; index `ANIMATE_DEAD_SPELL_ID-1` is force-cleared on import. */
  spellBook: number[];
  /** `spellCastCount[group][level]` cast-counters (copied verbatim). */
  spellCastCount: number[][];
  /** 5-slot saving-throw verse array. */
  saveVerse: number[];

  // --- Skills / flags ---
  /** 8 thief-skill percentages. */
  thiefSkills: number[];
  /** `field_E9` — turn-undead effective level. */
  turnUndeadLevel: number;
  /** `control_morale`: `< NPC_BASE` ⇒ PC. */
  controlMorale: number;
  monsterType: number;
  /** Raw 0..8 alignment; `(alignment+1)%3 === 0` ⇒ evil (LE/NE/CE). */
  alignment: number;
  npcTreasureShareCount: number;

  // --- Class-derived levels the roster gates read directly (ovr018) ---
  /** `paladin_lvl` (>0 ⇒ this character is a paladin). */
  paladinLevel: number;
  /** `ranger_lvl` (>0 ⇒ this character is a ranger). */
  rangerLevel: number;

  // --- Icon ---
  headIcon: number;
  weaponIcon: number;
  iconSize: number;
  iconColours: number[];

  // --- Identity for de-duplication (`name` + `mod_id`) ---
  modId: number;

  // --- Economy ---
  /** Platinum coins (import sets this to `IMPORT_PLATINUM_STIPEND`). */
  platinum: number;
}

/** True when a record is a player character (not an NPC): `control_morale < NPC_BASE`. */
export function isPlayerCharacter(c: Pick<PlayerCharacter, 'controlMorale'>): boolean {
  return c.controlMorale < NPC_BASE;
}

/** True when an alignment is evil (LE/NE/CE): `(alignment+1) % 3 === 0`. */
export function isEvilAlignment(alignment: number): boolean {
  return (((alignment % 3) + 3) % 3) === 2; // (alignment+1)%3===0, sign-safe
}

/** Deep-copy a {@link PlayerCharacter} (arrays cloned) so transforms never mutate the source. */
export function cloneCharacter(c: PlayerCharacter): PlayerCharacter {
  return {
    ...c,
    abilities: { ...c.abilities },
    attack1: { ...c.attack1 },
    attack2: { ...c.attack2 },
    classLevels: c.classLevels.slice(),
    spellBook: c.spellBook.slice(),
    spellCastCount: c.spellCastCount.map((row) => row.slice()),
    saveVerse: c.saveVerse.slice(),
    thiefSkills: c.thiefSkills.slice(),
    iconColours: c.iconColours.slice(),
  };
}

/**
 * Build a blank {@link PlayerCharacter} (sane zero/defaults), optionally overridden — a convenience for
 * hosts assembling a fresh character and for tests. Defaults: human/male, all-10 abilities, fighter,
 * empty arrays sized to the record, controlMorale 0 (a PC).
 */
export function blankCharacter(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  const base: PlayerCharacter = {
    race: 'human',
    sex: 'male',
    name: '',
    abilities: { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 },
    thac0: 20,
    classId: 'fighter',
    age: 20,
    hitPointMax: 1,
    baseMovement: 12,
    hitDice: 1,
    multiclassLevel: 1,
    lostLevels: 0,
    lostHp: 0,
    baseAc: 10,
    attackLevel: 1,
    exp: 0,
    classLevels: new Array(CLASS_LEVEL_SLOTS).fill(0),
    classFlags: 0,
    attacksCount: 1,
    attack1: { diceCountBase: 1, diceSizeBase: 8, damageBonusBase: 0 },
    attack2: { diceCountBase: 0, diceSizeBase: 0, damageBonusBase: 0 },
    spellBook: new Array(SPELLBOOK_SIZE).fill(0),
    spellCastCount: [new Array(3).fill(0), new Array(3).fill(0), new Array(3).fill(0)],
    saveVerse: new Array(SAVE_VERSE_SLOTS).fill(0),
    thiefSkills: new Array(THIEF_SKILL_SLOTS).fill(0),
    turnUndeadLevel: 0,
    controlMorale: 0,
    monsterType: 0,
    alignment: 0,
    npcTreasureShareCount: 0,
    paladinLevel: 0,
    rangerLevel: 0,
    headIcon: 0,
    weaponIcon: 0,
    iconSize: 0,
    iconColours: new Array(ICON_COLOUR_SLOTS).fill(0),
    modId: 0,
    platinum: 0,
  };
  return { ...base, ...overrides };
}
