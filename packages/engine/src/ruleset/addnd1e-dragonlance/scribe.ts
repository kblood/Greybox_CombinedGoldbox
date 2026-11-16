/**
 * Spell scribing (A2.3) — the AD&D 1e "Chance to Know Each Listed Spell" table plus the
 * minimum/maximum spells-known-per-level caps, the rules behind a magic-user copying a spell into
 * their spellbook. Pure data + a seeded attempt; the web Scribe flow uses these. Clerics do **not**
 * scribe — they pray, and their deity grants spells directly (see {@link prayerGrant}).
 *
 * Values are the classic 1e Intelligence table (PHB): higher INT → better odds and a deeper book.
 * We model Intelligence 9–19 (a magic-user needs INT ≥ 9); outside that range the helpers clamp.
 */
import { Rng } from '../../util/rng.js';
import { DL_DEITIES, type DeityId } from './deities.js';

/** "% Chance to Know Each Listed Spell" by Intelligence (AD&D 1e). */
const LEARN_CHANCE: Record<number, number> = {
  9: 35, 10: 35, 11: 40, 12: 40, 13: 45, 14: 45, 15: 50, 16: 55, 17: 65, 18: 75, 19: 85,
};

/** "Maximum Number of Spells per Level" a magic-user can know, by Intelligence (AD&D 1e). */
const MAX_PER_LEVEL: Record<number, number> = {
  9: 6, 10: 7, 11: 7, 12: 7, 13: 9, 14: 9, 15: 11, 16: 11, 17: 14, 18: 18, 19: 99,
};

/** "Minimum Number of Spells per Level" a magic-user is guaranteed, by Intelligence (AD&D 1e). */
const MIN_PER_LEVEL: Record<number, number> = {
  9: 4, 10: 5, 11: 5, 12: 5, 13: 6, 14: 6, 15: 7, 16: 7, 17: 8, 18: 9, 19: 10,
};

function clampInt(int: number): number {
  if (int < 9) return 9;
  if (int > 19) return 19;
  return Math.floor(int);
}

/** Percent chance a magic-user of the given Intelligence learns a spell when scribing (0 below INT 9). */
export function chanceToLearnSpell(int: number): number {
  if (int < 9) return 0;
  return LEARN_CHANCE[clampInt(int)];
}

/** Maximum spells a magic-user of the given Intelligence may know per spell level. */
export function maxSpellsPerLevel(int: number): number {
  if (int < 9) return 0;
  return MAX_PER_LEVEL[clampInt(int)];
}

/** Minimum spells a magic-user of the given Intelligence is guaranteed per spell level. */
export function minSpellsPerLevel(int: number): number {
  if (int < 9) return 0;
  return MIN_PER_LEVEL[clampInt(int)];
}

export interface ScribeAttempt {
  /** The % chance that applied (from {@link chanceToLearnSpell}). */
  chance: number;
  /** The d100 rolled (1–100). */
  roll: number;
  /** True when `roll <= chance`. */
  learned: boolean;
}

/**
 * Attempt to scribe a spell: roll d100 against the Intelligence learn chance. Deterministic for a
 * given `seed` so headless tests and replays agree. Returns the chance, the roll, and the verdict.
 */
export function attemptScribe(int: number, seed: number): ScribeAttempt {
  const chance = chanceToLearnSpell(int);
  const roll = new Rng(seed >>> 0).die(100);
  return { chance, roll, learned: roll <= chance };
}

/**
 * What a cleric's prayer grants. Clerics petition their deity for spells rather than studying; the
 * grant is flavour + the deity's bonus spells (1e granted/extra spells). Returns a short message and
 * the bonus-spell names. With no deity the prayer is unfocused but still answered.
 */
export interface PrayerGrant {
  message: string;
  deity: DeityId | null;
  bonusSpells: readonly string[];
}

export function prayerGrant(deity?: DeityId | null): PrayerGrant {
  if (deity && DL_DEITIES[deity]) {
    const g = DL_DEITIES[deity];
    return { message: `${g.name} answers your prayers`, deity, bonusSpells: g.extraSpells ?? [] };
  }
  return { message: 'Your prayers are answered', deity: null, bonusSpells: [] };
}
