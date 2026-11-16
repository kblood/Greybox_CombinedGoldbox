/**
 * AD&D 1st-edition spell-slot progression (M2.S4b) — memorizable spells per spell level for the
 * Gold Box caster classes. The engine builds a caster's slots by **accumulating per-level deltas**:
 * a class starts with one 1st-level slot, then for each level gained it adds that level's delta row.
 * This matches the SSI engine exactly (verified against the `simeonpilgrim/coab` decompile's
 * `ClericSpellLevels` / `MU_spell_lvl_learn` accumulation in `ovr026`/`ovr020`) and reproduces the
 * canonical PHB tables (e.g. magic-user L5 = 4/2/1, cleric L9 = 4/4/3/2/1).
 *
 * Slots are returned as a 5-element array, index 0 = 1st-level spells … index 4 = 5th-level. (The
 * Gold Box games cap usable spell levels at 5 for these classes.) Clerical Wisdom bonus spells are a
 * separate, ability-driven adjustment — see `clericWisdomBonusSpells` — because the `RulesetPlugin`
 * `spellSlots(classId, level)` contract is class+level only.
 */
import type { ClassId } from '../types.js';

export const SPELL_LEVELS = 5;

/** Per-level delta rows for the magic-user track (index 0 applied at level 2, etc.). PHB. */
const MAGIC_USER_DELTAS: readonly (readonly number[])[] = [
  [1, 0, 0, 0, 0], // L2
  [0, 1, 0, 0, 0], // L3
  [1, 1, 0, 0, 0], // L4
  [1, 0, 1, 0, 0], // L5
  [0, 0, 1, 0, 0], // L6
  [0, 1, 0, 1, 0], // L7
  [0, 0, 1, 1, 0], // L8
  [0, 0, 0, 0, 1], // L9
  [0, 1, 0, 0, 1], // L10
  [0, 0, 1, 1, 1], // L11
  [0, 0, 0, 1, 1], // L12
];

/** Per-level delta rows for the cleric track. PHB. */
const CLERIC_DELTAS: readonly (readonly number[])[] = [
  [1, 0, 0, 0, 0], // L2
  [0, 1, 0, 0, 0], // L3
  [1, 1, 0, 0, 0], // L4
  [0, 1, 1, 0, 0], // L5
  [0, 0, 1, 0, 0], // L6
  [0, 0, 0, 1, 0], // L7
  [0, 0, 1, 1, 0], // L8
  [1, 1, 0, 0, 1], // L9
  [0, 0, 0, 1, 1], // L10
  [1, 0, 1, 0, 0], // L11
];

type CasterKind = 'cleric' | 'magicUser' | null;

/** Map a class to its caster track (illusionist casts as magic-user; druid as cleric). */
function casterKind(classId: ClassId): CasterKind {
  switch (classId) {
    case 'cleric':
    case 'druid':
      return 'cleric';
    case 'magicUser':
    case 'illusionist':
      return 'magicUser';
    default:
      return null; // fighter/thief/ranger/paladin/etc. have no base arcane/divine slots here
  }
}

function accumulate(deltas: readonly (readonly number[])[], level: number): number[] {
  const slots = [1, 0, 0, 0, 0]; // every caster starts with one 1st-level slot at L1
  const upto = Math.min(level - 1, deltas.length); // deltas[0] is the L2 row
  for (let i = 0; i < upto; i++) {
    for (let s = 0; s < SPELL_LEVELS; s++) slots[s] += deltas[i][s];
  }
  return slots;
}

/**
 * Base memorizable spell slots for `classId` at `level` (no ability bonus). Returns a 5-element
 * array (index 0 = 1st-level). Non-casters and level < 1 return all zeros.
 */
export function spellSlots(classId: ClassId, level: number): number[] {
  const kind = casterKind(classId);
  const lvl = Math.floor(level);
  if (!kind || lvl < 1) return [0, 0, 0, 0, 0];
  return accumulate(kind === 'cleric' ? CLERIC_DELTAS : MAGIC_USER_DELTAS, lvl);
}

/**
 * The 1e Wisdom bonus spells a cleric earns (added on top of `spellSlots('cleric', level)`), as a
 * 5-element delta: Wis 13/14 → +1/+2 at 1st level, 15/16 → +1/+2 at 2nd, 17 → +1 at 3rd, 18 → +1 at
 * 4th. The bonus only applies at a spell level where the cleric already has ≥1 base slot, so pass the
 * cleric `level` to gate it (matching the SSI engine's `spellCastCount[..] > 0` guard).
 */
export function clericWisdomBonusSpells(wis: number, level: number): number[] {
  const base = spellSlots('cleric', level);
  const bonus = [0, 0, 0, 0, 0];
  const add = (idx: number) => {
    if (base[idx] + bonus[idx] > 0) bonus[idx] += 1;
  };
  if (wis > 12) add(0);
  if (wis > 13) add(0);
  if (wis > 14) add(1);
  if (wis > 15) add(1);
  if (wis > 16) add(2);
  if (wis > 17) add(3);
  return bonus;
}

/** Convenience: a cleric's total slots including the Wisdom bonus. */
export function clericSpellSlots(level: number, wis: number): number[] {
  const base = spellSlots('cleric', level);
  const bonus = clericWisdomBonusSpells(wis, level);
  return base.map((n, i) => n + bonus[i]);
}
