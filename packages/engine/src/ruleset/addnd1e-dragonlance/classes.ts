/**
 * Champions of Krynn — Dragonlance class rules (M2.S4): the race/class allowance matrix, the
 * (very low) max-level caps, and the Knight of Solamnia orders. CoK adds **Knight** to the AD&D-1e
 * class set; a Knight fights on the **fighter** combat tables and gains clerical spellcasting at
 * high level (so combat math delegates to `fighter` — see index.ts `knightThac0`/`knightSaves`).
 *
 * Sources: "Maximum Level Limits by Race, Class and Prime Requisite" (Journal printed p. 56) and the
 * class/race prose (printed pp. 4-6). See docs/engine/research/cok-dragonlance-rules.md §5, §7, §8.
 */
import type { AbilityScores, ClassId } from '../types.js';
import type { DragonlanceRaceId } from './races.js';

/** The CoK class set: the AD&D-1e `ClassId`s the game uses, plus the Dragonlance-only `knight`. */
export type DragonlanceClassId = Extract<ClassId, 'cleric' | 'fighter' | 'ranger' | 'magicUser' | 'thief'> | 'knight';

export const DL_CLASSES: readonly DragonlanceClassId[] = [
  'cleric', 'fighter', 'ranger', 'knight', 'magicUser', 'thief',
] as const;

/**
 * Max level by race × class. `null` = the race may not take that class. A `number` is a flat cap; a
 * `tiered` entry caps by the prime-requisite (STR for fighter/ranger) — in CoK only **Kender**
 * fighter/ranger actually vary (5/6/7 by STR 16-/17/18+); every other cell is flat.
 *
 * The matrix is exactly the appendix chart (§7). Note the one prose/table conflict the oracle
 * flags: **Silvanesti Thief** = the appendix's authoritative "No" (prose disagrees).
 */
type Cap = number | null | { str16: number; str17: number; str18: number };

const FLAT = (n: number | null): Cap => n;
const KENDER_FR: Cap = { str16: 5, str17: 6, str18: 7 };

const MAX_LEVEL: Record<DragonlanceRaceId, Record<DragonlanceClassId, Cap>> = {
  human:         { cleric: 8, fighter: 8, ranger: 7, knight: 7, magicUser: 8, thief: 9 },
  silvanestiElf: { cleric: 8, fighter: 8, ranger: 7, knight: FLAT(null), magicUser: 8, thief: FLAT(null) },
  qualinestiElf: { cleric: 8, fighter: 8, ranger: 7, knight: FLAT(null), magicUser: 8, thief: 9 },
  halfElf:       { cleric: 8, fighter: 8, ranger: 7, knight: 7, magicUser: 8, thief: 9 },
  hillDwarf:     { cleric: 8, fighter: 8, ranger: 7, knight: FLAT(null), magicUser: FLAT(null), thief: 9 },
  mountainDwarf: { cleric: 8, fighter: 8, ranger: FLAT(null), knight: FLAT(null), magicUser: FLAT(null), thief: 8 },
  kender:        { cleric: 8, fighter: KENDER_FR, ranger: KENDER_FR, knight: FLAT(null), magicUser: FLAT(null), thief: 9 },
};

/** Whether a race may take a class at all (ignoring ability minimums). */
export function allowsClass(race: DragonlanceRaceId, classId: DragonlanceClassId): boolean {
  return MAX_LEVEL[race][classId] !== null;
}

/** The classes a race may take, in canonical order. */
export function classesForRace(race: DragonlanceRaceId): DragonlanceClassId[] {
  return DL_CLASSES.filter((c) => allowsClass(race, c));
}

/**
 * Max attainable level for `race` in `classId`. Returns `null` if the class is disallowed. `str` is
 * only consulted for the Kender fighter/ranger tiers (16-/17/18+); pass the character's STR.
 */
export function maxLevel(
  race: DragonlanceRaceId,
  classId: DragonlanceClassId,
  str = 0,
): number | null {
  const cap = MAX_LEVEL[race][classId];
  if (cap === null) return null;
  if (typeof cap === 'number') return cap;
  return str >= 18 ? cap.str18 : str === 17 ? cap.str17 : cap.str16;
}

/** Non-humans may multi/triple-class; humans may not (Journal printed p. 6). */
export function isMultiClassAllowed(race: DragonlanceRaceId): boolean {
  return race !== 'human';
}

/**
 * DQK's OWN "Maximum Level Limits by Race and Class" (`The Dark Queen of Krynn/Journal.pdf` p.49,
 * page-image transcription, M93 — a materially more permissive table than CoK's `MAX_LEVEL` above for
 * humans/elves, but NOT uniformly uncapped: several race/class cells carry a real, finite ceiling
 * (e.g. Half-Elf Fighter 9, Silvanesti Elf Fighter 10, Kender Fighter 5). `null` here overloads both
 * "Max" (uncapped) and the manual's "No" (race may not take the class) — every "No" cell already
 * duplicates a disallow CoK's own `MAX_LEVEL` enforces at creation (`createCharacter()` only ever
 * validates against `MAX_LEVEL`, never this table), so no character reaching a DQK session can hold
 * one of these combos; the distinction is moot unless `createCharacter()` is ever extended to validate
 * against this table too. DQK's manual also prints a separate "Paladin" row this engine's
 * `DragonlanceClassId` does not model (Solamnic "Knight" is the only Dragonlance paladin-analogue) —
 * omitted.
 */
const DQK_MAX_LEVEL: Record<DragonlanceRaceId, Record<DragonlanceClassId, number | null>> = {
  human:         { cleric: null, fighter: null, ranger: null, knight: null, magicUser: null, thief: null },
  silvanestiElf: { cleric: null, fighter: 10,   ranger: null, knight: null, magicUser: null, thief: null },
  qualinestiElf: { cleric: null, fighter: 14,   ranger: null, knight: null, magicUser: null, thief: null },
  halfElf:       { cleric: null, fighter: 9,    ranger: 11,   knight: 10,   magicUser: 10,   thief: null },
  hillDwarf:     { cleric: 10,   fighter: null, ranger: 8,    knight: null, magicUser: null, thief: 10   },
  mountainDwarf: { cleric: 10,   fighter: null, ranger: null, knight: null, magicUser: null, thief: 8    },
  kender:        { cleric: 12,   fighter: 5,    ranger: 5,    knight: null, magicUser: null, thief: null },
};

/** DQK's own max attainable level for `race` in `classId`. `null` = uncapped in DQK (or the race/class
 * combo is disallowed at creation and so never reaches training — see {@link DQK_MAX_LEVEL}'s doc). */
export function dqkMaxLevel(race: DragonlanceRaceId, classId: DragonlanceClassId): number | null {
  return DQK_MAX_LEVEL[race][classId];
}

// --- Knight of Solamnia ---------------------------------------------------------------------

/** The three ascending knightly orders. A knight petitions the next order on meeting its minimums. */
export type KnightOrder = 'crown' | 'sword' | 'rose';

export const KNIGHT_ORDERS: readonly KnightOrder[] = ['crown', 'sword', 'rose'] as const;

/**
 * Minimum ability scores to petition each order (Journal printed p. 9). The Crown (entry) order's
 * explicit minimums were not separately printed — a knight just needs the STR/WIS prime-requisite
 * floor — so Crown is modelled as no extra gate beyond being a knight. Sword and Rose are verbatim.
 * M96 — `sword`'s DEX/CON were mis-transcribed as Rose's values (12/15) from M2.S4 through M95;
 * page-image-verified and corrected (the real Sword floor is DEX 9, CON 10).
 */
export const KNIGHT_ORDER_MINIMUMS: Record<KnightOrder, Partial<AbilityScores>> = {
  crown: {},
  sword: { str: 12, int: 9, wis: 13, dex: 9, con: 10 },
  rose: { str: 15, int: 10, wis: 13, dex: 12, con: 15 },
};

function meetsMinimums(scores: AbilityScores, min: Partial<AbilityScores>): boolean {
  return (Object.keys(min) as (keyof AbilityScores)[]).every((k) => (scores[k] ?? 0) >= (min[k] ?? 0));
}

/**
 * The highest Knight order a character qualifies for given their ability scores. Returns the entry
 * order `'crown'` when only the prime-requisite floor is met, escalating to `'sword'`/`'rose'` as the
 * minimums are reached. (Order advancement is also level-gated in-game; this is the ability gate.)
 */
export function petitionableOrder(scores: AbilityScores): KnightOrder {
  if (meetsMinimums(scores, KNIGHT_ORDER_MINIMUMS.rose)) return 'rose';
  if (meetsMinimums(scores, KNIGHT_ORDER_MINIMUMS.sword)) return 'sword';
  return 'crown';
}
