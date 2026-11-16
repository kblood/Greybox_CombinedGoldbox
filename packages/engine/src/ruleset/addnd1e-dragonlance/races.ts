/**
 * Champions of Krynn — Dragonlance race model (M2.S4). CoK ships **seven** playable races (the
 * Journal, printed p. 4): Human, Hill Dwarf, Mountain Dwarf, Silvanesti Elf, Qualinesti Elf,
 * Half-Elf, Kender — note the Elf/Dwarf splits and that there is **no Gnome**.
 *
 * Racial differences are encoded by SSI primarily as **ability-score ranges** (min..max per
 * ability), not as additive ±N adjustments — the one explicit additive the manual prints is the
 * dwarven **+1 CON** (which the CON ceiling of 19 already reflects, so callers must not re-add it).
 * Values transcribed from the "Range of Ability Scores by Race" table (Journal printed p. 56);
 * see docs/engine/research/cok-dragonlance-rules.md §2 for the full table and confidence notes.
 *
 * The `(nn)` exceptional-STR percentile applies only to a fighter-type (fighter/knight/ranger) who
 * rolls 18 STR; it is the *max* percentile that race may roll.
 */
import type { AbilityScores } from '../types.js';

export type DragonlanceRaceId =
  | 'human'
  | 'hillDwarf'
  | 'mountainDwarf'
  | 'silvanestiElf'
  | 'qualinestiElf'
  | 'halfElf'
  | 'kender';

export type Sex = 'male' | 'female';

/** Inclusive ability-score bounds. */
export interface AbilityRange {
  min: number;
  max: number;
}

/** Per-race strength bounds, split by sex, with the exceptional-percentile cap for 18 STR. */
interface StrengthRange {
  male: AbilityRange;
  female: AbilityRange;
  /** Max exceptional-STR percentile (1..100; 100 stored as "00" in the manual). 0 = no exceptional
   *  strength available (e.g. Kender, capped at 16). Only meaningful for a fighter-type at STR 18. */
  exceptionalPct: number;
}

export interface RaceDefinition {
  id: DragonlanceRaceId;
  name: string;
  /** STR bounds (sex-dependent) + exceptional cap. */
  str: StrengthRange;
  /** The other five abilities (sex-independent in CoK). */
  int: AbilityRange;
  wis: AbilityRange;
  dex: AbilityRange;
  con: AbilityRange;
  cha: AbilityRange;
  /** Non-humans may multi/triple-class; humans may not (Journal printed p. 6). */
  multiClass: boolean;
}

const r = (min: number, max: number): AbilityRange => ({ min, max });

/** The seven CoK races with their verified ability ranges. */
export const DL_RACES: Record<DragonlanceRaceId, RaceDefinition> = {
  human: {
    id: 'human', name: 'Human', multiClass: false,
    // NOTE (M103): the Journal's printed "Range of Ability Scores by Race" table (p.56) shows "3-8" for
    // Male INT/WIS/DEX -- verified via direct page-image read, almost certainly a print defect (dropped
    // "1"); the Female row two lines down correctly shows 3-18, matching 1e AD&D's actual rules (no
    // gender-based INT/WIS/DEX asymmetry). Intentionally kept at 3-18 for both sexes; do not "fix" to
    // match the literal Male-row print.
    str: { male: r(3, 18), female: r(3, 18), exceptionalPct: 100 },
    int: r(3, 18), wis: r(3, 18), dex: r(3, 18), con: r(3, 18), cha: r(3, 18),
  },
  hillDwarf: {
    id: 'hillDwarf', name: 'Hill Dwarf', multiClass: true,
    str: { male: r(9, 18), female: r(3, 17), exceptionalPct: 99 },
    int: r(3, 18), wis: r(3, 18), dex: r(3, 17), con: r(14, 19), cha: r(3, 12),
  },
  mountainDwarf: {
    id: 'mountainDwarf', name: 'Mountain Dwarf', multiClass: true,
    str: { male: r(8, 18), female: r(3, 17), exceptionalPct: 99 },
    int: r(3, 18), wis: r(3, 18), dex: r(3, 17), con: r(12, 19), cha: r(3, 16),
  },
  silvanestiElf: {
    id: 'silvanestiElf', name: 'Silvanesti Elf', multiClass: true,
    str: { male: r(3, 18), female: r(3, 16), exceptionalPct: 75 },
    int: r(10, 18), wis: r(6, 18), dex: r(7, 19), con: r(6, 18), cha: r(12, 18),
  },
  qualinestiElf: {
    id: 'qualinestiElf', name: 'Qualinesti Elf', multiClass: true,
    str: { male: r(7, 18), female: r(3, 16), exceptionalPct: 75 },
    int: r(8, 18), wis: r(6, 18), dex: r(7, 19), con: r(7, 18), cha: r(8, 18),
  },
  halfElf: {
    id: 'halfElf', name: 'Half-Elf', multiClass: true,
    str: { male: r(3, 18), female: r(3, 17), exceptionalPct: 90 },
    int: r(4, 18), wis: r(3, 18), dex: r(6, 18), con: r(6, 18), cha: r(3, 18),
  },
  kender: {
    id: 'kender', name: 'Kender', multiClass: true,
    str: { male: r(6, 16), female: r(6, 16), exceptionalPct: 0 },
    int: r(6, 18), wis: r(3, 16), dex: r(8, 19), con: r(10, 18), cha: r(6, 18),
  },
};

export type AbilityKey = keyof AbilityScores & ('str' | 'int' | 'wis' | 'dex' | 'con' | 'cha');

/** The allowed range for one ability of a race (STR depends on `sex`; the rest ignore it). */
export function abilityRange(
  race: DragonlanceRaceId,
  ability: AbilityKey,
  sex: Sex = 'male',
): AbilityRange {
  const def = DL_RACES[race];
  if (ability === 'str') return def.str[sex];
  return def[ability];
}

/** Max exceptional-STR percentile a race's fighter-type may roll at STR 18 (0 = none). */
export function exceptionalStrengthCap(race: DragonlanceRaceId): number {
  return DL_RACES[race].str.exceptionalPct;
}

/**
 * Clamp a generated `AbilityScores` to a race's legal ranges (for `sex`). Returns a new object;
 * also clamps the exceptional-STR percentile to the racial cap when STR is 18. This is the
 * character-creation gate the manual describes as "all racial modifiers calculated" automatically.
 */
export function clampToRace(
  scores: AbilityScores,
  race: DragonlanceRaceId,
  sex: Sex = 'male',
): AbilityScores {
  const clamp = (v: number, range: AbilityRange) => Math.min(range.max, Math.max(range.min, v));
  const def = DL_RACES[race];
  const str = clamp(scores.str, def.str[sex]);
  const out: AbilityScores = {
    str,
    int: clamp(scores.int, def.int),
    wis: clamp(scores.wis, def.wis),
    dex: clamp(scores.dex, def.dex),
    con: clamp(scores.con, def.con),
    cha: clamp(scores.cha, def.cha),
  };
  if (scores.strPct !== undefined) {
    // Exceptional percentile only matters at STR 18; cap it to the race's max (0 = strip it).
    out.strPct = str >= 18 ? Math.min(scores.strPct, def.str.exceptionalPct) : 0;
  }
  return out;
}
