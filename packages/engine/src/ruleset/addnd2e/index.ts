/**
 * `addnd2e` — an AD&D 2nd-edition overlay for Gateway to the Savage Frontier (M5.S6 "broader
 * roster"). Layers over `addnd1e` (`extends: addnd1e.id`) and overrides ONLY the one genuinely
 * cited, verified 2e delta this engine has a hook for: **THAC0**. 2e's headline combat
 * simplification replaced 1e's irregular per-class lookup tables with a clean per-level FORMULA
 * grouped into four progression families (warriors / priests / rogues / wizards), each improving
 * THAC0 at a different fixed rate. Rates below (1/level, 1/3 levels, 1/2 levels, 1/5 levels) are
 * transcribed from the PHB Table 52 progression-rate summary at
 * https://adnd2e.fandom.com/wiki/Calculating_THAC0_(PHB) — a secondary source. Unlike the Krynn
 * combat tables (verified against a decompiled binary), no Gateway to the Savage Frontier binary
 * or manual exists in this repo to cross-check, so this is a formula reproduction of the cited
 * RATE, not a verbatim transcription of the PHB's own per-level table.
 *
 * Everything else — ability-score modifiers, XP/level progression, hit dice, saving throws, spell
 * slots — honestly INHERITS `addnd1e`'s values unchanged; none of it was independently re-sourced
 * for 2e. This matches the scope `docs/engine/ARCHITECTURE.md` itself anticipated ("`addnd2e`
 * overrides THAC0/proficiency" — proficiency has no `RulesetPlugin` hook yet, so it's not
 * modelled either).
 *
 * Assassin and monk are not core 2e PHB classes (dropped until later splatbooks); both fall back
 * to the rogue-family rate here — the same "closest core group" convention
 * `ruleset/addnd1e/progression.ts` already uses for its own out-of-table classes.
 */
import type { ClassId, RulesetPlugin } from '../types.js';
import { addnd1e } from '../addnd1e/index.js';

export const ADND2E_ID = 'addnd2e';

/** Class → 2e THAC0 progression-rate family: levels needed per 1-point THAC0 improvement. */
const RATE: Record<ClassId, number> = {
  fighter: 1,
  paladin: 1,
  ranger: 1, // warriors: 1 pt/level
  cleric: 3,
  druid: 3, // priests: 1 pt/3 levels
  thief: 2,
  bard: 2,
  assassin: 2, // not core 2e — rogue-family fallback (see file header)
  monk: 2, // not core 2e — rogue-family fallback (see file header)
  magicUser: 5,
  illusionist: 5, // wizards: 1 pt/5 levels
};

/** 2e THAC0: everyone starts at 20 (level 1), improving at the class-family's rate. */
export function thac0(classId: ClassId, level: number): number {
  const lvl = Math.max(1, Math.floor(level));
  return 20 - Math.floor((lvl - 1) / RATE[classId]);
}

export const addnd2e: RulesetPlugin = {
  ...addnd1e,
  id: ADND2E_ID,
  name: 'AD&D 2nd Edition (Gateway to the Savage Frontier)',
  extends: addnd1e.id,
  thac0,
};

export {
  calcGatewayBattleExp,
  calcTreasuresBattleExp,
  SAVAGE_XP_PER_ITEM_PLUS,
} from './experience.js';
export type {
  SavageBattleXpResult,
  GatewayDefeatedEnemyXp,
  GatewayTreasureXp,
  TreasuresDefeatedEnemyXp,
  TreasuresTreasureXp,
} from './experience.js';
