/**
 * Data-driven ruleset factory (M5.S5) — builds a `RulesetPlugin` from plain, JSON-authorable class
 * tables (XP progression, THAC0, hit die), the "author your own ruleset" half of the database
 * editors. `RulesetPlugin`'s ability-modifier contract is function-shaped (`StrengthMods` depends
 * on an exceptional-strength percentile, `ConstitutionMods` on a warrior/non-warrior split — no
 * flat JSON table captures that cleanly), so a data ruleset always uses flat, no-op ability
 * modifiers; authoring genuinely custom ability math is a deeper surface left out of scope here.
 * `savingThrows`/`spellSlots` are likewise omitted — `RulesetPlugin` declares them optional exactly
 * so a ruleset can ship incrementally (see `ruleset/types.ts`'s file header).
 */
import type { AbilityModifiers, ClassId, RulesetPlugin } from './types.js';

/** One class's progression: XP thresholds, hit die, and THAC0 by level — the subset of
 * `addnd1e/progression.ts` + `combatTables.ts`'s tables an author can plausibly hand-write. */
export interface DataClassProgression {
  /** Cumulative XP to reach level i+1; index 0 = level 1 (usually 0). */
  xp: number[];
  /** Flat XP added per level beyond the table. */
  perLevel: number;
  /** Hit-die size (dN). */
  hitDie: number;
  /** THAC0 by level; index 0 = level 1. Levels past the table clamp to the last entry. */
  thac0: number[];
}

export interface RulesetTableData {
  id: string;
  name: string;
  /** Ruleset id this one layers over, if any (see `RulesetPlugin.extends`). */
  extends?: string;
  /** Only the classes an author defines are custom; any other `ClassId` falls back to a generic
   * fighter-shaped progression so every class stays usable. */
  classes: Partial<Record<ClassId, DataClassProgression>>;
}

const FLAT_ABILITY_MODS: AbilityModifiers = {
  strength: () => ({ hit: 0, damage: 0 }),
  dexterity: () => ({ missile: 0, defensiveAc: 0, reaction: 0 }),
  constitution: () => ({ hp: 0 }),
};

const DEFAULT_PROGRESSION: DataClassProgression = {
  xp: [0, 2000, 4000, 8000, 18000, 35000, 70000, 125000, 250000],
  perLevel: 250000,
  hitDie: 8,
  thac0: [20, 20, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9],
};

function progressionFor(data: RulesetTableData, classId: ClassId): DataClassProgression {
  return data.classes[classId] ?? DEFAULT_PROGRESSION;
}

/** Build a `RulesetPlugin` from plain data tables. Throws if `data.id` is missing (the registry
 * requires a non-empty id to register). */
export function createDataRuleset(data: RulesetTableData): RulesetPlugin {
  if (!data.id) throw new Error('createDataRuleset: id required');
  return {
    id: data.id,
    name: data.name,
    extends: data.extends,
    abilityMods: FLAT_ABILITY_MODS,
    xpForLevel(classId, level) {
      const p = progressionFor(data, classId);
      const lvl = Math.max(1, Math.floor(level));
      if (lvl <= p.xp.length) return p.xp[lvl - 1];
      return p.xp[p.xp.length - 1] + (lvl - p.xp.length) * p.perLevel;
    },
    levelForXp(classId, xp) {
      const p = progressionFor(data, classId);
      if (xp < 0) return 1;
      let level = 1;
      for (let i = 0; i < p.xp.length; i++) {
        if (xp >= p.xp[i]) level = i + 1;
        else return level;
      }
      const past = xp - p.xp[p.xp.length - 1];
      return p.xp.length + Math.floor(past / p.perLevel);
    },
    hitDie(classId) {
      return progressionFor(data, classId).hitDie;
    },
    thac0(classId, level) {
      const t = progressionFor(data, classId).thac0;
      const idx = Math.min(Math.max(1, Math.floor(level)), t.length) - 1;
      return t[idx];
    },
  };
}
