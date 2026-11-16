/**
 * Cross-game character import (ovr017 `ConvertPoolRadPlayer` / `TransferHillsFarCharacter`).
 *
 * Importing a hero from a prior SSI AD&D Gold Box game into Krynn is a **per-field semantic copy** of
 * the source record (the family shares the field set; only byte offsets drift — a loader decodes those
 * into a {@link PlayerCharacter}) followed by Krynn-specific fixups. Two shapes:
 *
 *  - **Full convert** — Pool of Radiance / Curse of the Azure Bonds / Secret of the Silver Blades.
 *    `ConvertPoolRadPlayer`: copy every field, then (1) re-apply race/sex ability caps
 *    (`EnforceRaceSexLimits`), (2) force-clear `animate_dead` in the spell book, (3) set
 *    `multiclassLevel = HitDice`, (4) grant a fixed **300-platinum** stipend overriding source coins.
 *  - **Partial transfer** — Hillsfar. `TransferHillsFarCharacter`: a *raise-only* merge onto an
 *    already-imported character (Hillsfar was an action spin-off that trained a stat subset), bumping
 *    a stat / xp / age only when the Hillsfar value is higher.
 *
 * Source: COAB `engine/ovr017.cs` lines 234–433; spec `decompile-ovr017-save-import.md`.
 * Pure + deterministic: no RNG, no IO. Inputs are never mutated (a new record is returned).
 */
import type { AbilityScores } from '../ruleset/types.js';
import { clampToRace } from '../ruleset/addnd1e-dragonlance/races.js';
import {
  ANIMATE_DEAD_SPELL_ID,
  IMPORT_PLATINUM_STIPEND,
  cloneCharacter,
  type PlayerCharacter,
} from './character.js';

/** Prior SSI games a Krynn character can be imported from. */
export type ImportSource = 'pool' | 'curse' | 'silver' | 'hillsfar';

/** The three games whose characters are a full record convert (`ConvertPoolRadPlayer`). */
export const FULL_CONVERT_SOURCES: readonly ImportSource[] = ['pool', 'curse', 'silver'] as const;

/**
 * Full cross-game convert (`ConvertPoolRadPlayer`) — Pool / Curse / Silver Blades → Krynn.
 *
 * Copies `src` verbatim (deep clone), then applies the four documented Krynn fixups:
 *  1. **`EnforceRaceSexLimits`** — clamp the six abilities (+ exceptional-STR percentile) to the
 *     character's race/sex legal ranges via {@link clampToRace}.
 *  2. **animate_dead cleared** — `spellBook[ANIMATE_DEAD_SPELL_ID-1] = 0`.
 *  3. **`multiclassLevel = HitDice`**.
 *  4. **300-platinum stipend** — `platinum = IMPORT_PLATINUM_STIPEND` (overrides source coins).
 *
 * Returns a NEW {@link PlayerCharacter}; `src` is untouched.
 */
export function convertImportedCharacter(src: PlayerCharacter): PlayerCharacter {
  const out = cloneCharacter(src);

  // (1) EnforceRaceSexLimits — re-cap abilities + Str00 percentile to the race/sex ranges.
  out.abilities = clampToRace(src.abilities, src.race, src.sex);

  // (2) Force-clear animate_dead in the copied spell book.
  if (ANIMATE_DEAD_SPELL_ID - 1 < out.spellBook.length) {
    out.spellBook[ANIMATE_DEAD_SPELL_ID - 1] = 0;
  }

  // (3) multiclassLevel mirrors HitDice on import.
  out.multiclassLevel = src.hitDice;

  // (4) Fixed platinum stipend, overriding whatever coins the source carried.
  out.platinum = IMPORT_PLATINUM_STIPEND;

  return out;
}

/** The subset of fields a Hillsfar character can raise on the target (raise-only merge). */
export interface HillsfarTransfer {
  /** Hillsfar-trained ability scores (only those higher than the target are taken). */
  abilities: AbilityScores;
  /** Hillsfar experience (taken only if higher than the target's). */
  exp: number;
  /** Hillsfar age (taken only if higher — the character aged in Hillsfar). */
  age: number;
  /** Hillsfar coin worth in platinum (taken only if higher than the target's). */
  platinum?: number;
}

/**
 * Partial Hillsfar transfer (`TransferHillsFarCharacter`) — a *raise-only* merge of Hillsfar-trained
 * values onto an already-imported `target`. Each ability (incl. the exceptional-STR percentile), xp,
 * age, and coin worth is taken from `hf` only when it **exceeds** the target's current value; nothing
 * is ever lowered. Returns a NEW {@link PlayerCharacter}; `target` is untouched.
 */
export function transferHillsfarCharacter(
  target: PlayerCharacter,
  hf: HillsfarTransfer,
): PlayerCharacter {
  const out = cloneCharacter(target);
  const a = out.abilities;
  const h = hf.abilities;

  const raise = (cur: number | undefined, next: number | undefined): number =>
    Math.max(cur ?? 0, next ?? 0);

  a.str = raise(a.str, h.str);
  if (h.strPct !== undefined || a.strPct !== undefined) a.strPct = raise(a.strPct, h.strPct);
  a.int = raise(a.int, h.int);
  a.wis = raise(a.wis, h.wis);
  a.dex = raise(a.dex, h.dex);
  a.con = raise(a.con, h.con);
  a.cha = raise(a.cha, h.cha);

  if (target.exp < hf.exp) out.exp = hf.exp;
  if (target.age < hf.age) out.age = hf.age;
  if (hf.platinum !== undefined && target.platinum < hf.platinum) out.platinum = hf.platinum;

  return out;
}

/**
 * Dispatch an import by source game. Pool/Curse/Silver run {@link convertImportedCharacter} on `src`.
 * Hillsfar runs {@link transferHillsfarCharacter}, which **requires** an existing `target` to raise —
 * passing `'hillsfar'` without `opts.target` throws.
 */
export function importCharacter(
  source: ImportSource,
  src: PlayerCharacter,
  opts: { target?: PlayerCharacter; hillsfar?: HillsfarTransfer } = {},
): PlayerCharacter {
  if (source === 'hillsfar') {
    if (!opts.target) {
      throw new Error("importCharacter: Hillsfar import requires an existing 'target' to raise");
    }
    const hf: HillsfarTransfer = opts.hillsfar ?? {
      abilities: src.abilities,
      exp: src.exp,
      age: src.age,
      platinum: src.platinum,
    };
    return transferHillsfarCharacter(opts.target, hf);
  }
  return convertImportedCharacter(src);
}
