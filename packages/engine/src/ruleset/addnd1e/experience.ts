/**
 * AD&D 1st-edition **post-combat experience award + split** — the glue the combat loop calls
 * after a battle to turn defeated enemies + loot into per-character XP.
 *
 * This implements the two VERIFIED formulas from the Champions of Krynn `ovr006`
 * (`calc_battle_exp` / `addExp`) decompile — see
 * `docs/engine/research/decompile-ovr006-xp-treasure.md`:
 *
 *   battle XP = Σ_enemies (perHpXp·rolledHp + flatXp) + gold-as-XP + Σ (item.plus · 400)
 *   per-char share = battle XP / (party size − animated count)
 *   per char: single class → +10 % if its prime requisite is 16+ ; multiclass → share / nClasses
 *
 * Pure math over engine-neutral types — no assets, no DOM, no game files. The combat layer
 * already tracks each enemy's stored XP (`monster.ts` @304 = the flat term; CoK also decodes
 * the title-local rolled-HP and per-HP inputs); this module supplies
 * the award/division/bonus that the engine was missing (the ovr006 "GAP").
 */
import type { AbilityScores, ClassId } from '../types.js';

/** One defeated enemy's XP components (`calc_battle_exp`). A monster contributes
 * `perHpXp·rolledHp + flatXp`: the HD-scaled term plus the flat per-kill award. When only the
 * stored `flatXp` is known (our `monster.ts` exposes the single u16 @304), pass it alone. */
export interface DefeatedEnemy {
  /** Flat per-monster XP. CoK CCH +0x130 (stored u16 @304); other layouts differ. */
  flatXp: number;
  /** Per-HP XP multiplier. CoK CCH +0x132; omit when the title layout is unknown. */
  perHpXp?: number;
  /** The monster's rolled hit points — `monster.hit_point_rolled`. Omit when unknown. */
  rolledHp?: number;
}

/** Loot a battle yields that converts to XP (`calc_battle_exp`). */
export interface BattleLoot {
  /** Gold's XP worth — `money.GetExpWorth()` (1e: 1 XP per gp). */
  goldXpWorth?: number;
  /** The `plus` of each collected magic item (+1…+n); each adds `plus · 400` XP. Non-positive
   * pluses contribute nothing (mundane gear). */
  itemPluses?: number[];
}

/** XP per point of item enchantment (`addExp`: `item.plus · 400`). */
export const XP_PER_ITEM_PLUS = 400;
/** A duel awards the selected fighter `HitDice · 100` (`calc_battle_exp` duel branch). */
export const XP_PER_DUEL_HIT_DIE = 100;

/**
 * Total raw XP a normal battle is worth, **before** the per-character split (`calc_battle_exp`).
 * Sums each defeated enemy's `perHpXp·rolledHp + flatXp`, the gold's XP worth, and `plus·400`
 * for every collected magic item with a positive plus.
 */
export function calcBattleExp(enemies: readonly DefeatedEnemy[], loot: BattleLoot = {}): number {
  let total = 0;
  for (const e of enemies) {
    if (e.perHpXp && e.rolledHp) total += e.perHpXp * e.rolledHp;
    total += e.flatXp;
  }
  total += loot.goldXpWorth ?? 0;
  for (const plus of loot.itemPluses ?? []) {
    if (plus > 0) total += plus * XP_PER_ITEM_PLUS;
  }
  return total;
}

/** Duel XP: the selected combatant's hit dice × 100 (`calc_battle_exp` duel branch). */
export function calcDuelExp(hitDice: number): number {
  return Math.max(0, Math.floor(hitDice)) * XP_PER_DUEL_HIT_DIE;
}

/**
 * Whether a **single-class** character qualifies for the AD&D-1e **+10 % prime-requisite XP
 * bonus** (`addExp`): the relevant ability (all of them, for paladin/ranger) must be 16+ (the
 * decompile tests `> 15`). Classes outside the Krynn six fall back to their natural 1e prime
 * requisite where unambiguous, else no bonus. Knights of Solamnia map onto the fighter branch
 * (Str), consistent with the ruleset placing them on the fighter tables.
 */
export function hasPrimeRequisiteBonus(classId: ClassId, ab: AbilityScores): boolean {
  switch (classId) {
    case 'fighter':
      return ab.str > 15;
    case 'paladin':
      return ab.str > 15 && ab.wis > 15;
    case 'ranger':
      return ab.str > 15 && ab.int > 15 && ab.wis > 15;
    case 'cleric':
    case 'druid':
      return ab.wis > 15;
    case 'magicUser':
    case 'illusionist':
      return ab.int > 15;
    case 'thief':
    case 'assassin':
      return ab.dex > 15;
    default:
      // monk (Wis+Dex), bard — no single defended prime-req in the Krynn games; no bonus.
      return false;
  }
}

/** A party member considered for the post-combat XP split (`addExp` input). */
export interface XpRecipient {
  abilities: AbilityScores;
  /** The character's class set: 1 entry = single-class, 2 = dual, 3 = triple. Multiclass splits
   * the share evenly (÷ length) and takes **no** prime-requisite bonus. */
  classes: readonly ClassId[];
  /** Animated dead / non-living member — excluded from the split entirely (neither counted in the
   * divisor nor awarded). */
  animated?: boolean;
  /** Whether the member took part in the battle (`in_combat`). A member who sat out earns nothing
   * but **still counts** toward the divisor (matches `calc_battle_exp`'s `party_size` basis).
   * Defaults to true. */
  inCombat?: boolean;
}

/**
 * The XP **one recipient** gains from a per-character `share` (`addExp` body): a multiclass
 * character takes `share / nClasses` (÷2 dual, ÷3 triple); a single-class character takes the
 * full share plus 10 % when its prime requisite is 16+. Truncated to an integer (the original is
 * integer XP). A member that sat the battle out or is animated gains nothing.
 */
export function characterXpShare(share: number, recipient: XpRecipient): number {
  if (recipient.animated || recipient.inCombat === false) return 0;
  const n = recipient.classes.length;
  if (n >= 2) return Math.floor(share / n);
  const cls = recipient.classes[0];
  if (cls && hasPrimeRequisiteBonus(cls, recipient.abilities)) {
    return share + Math.floor(share / 10);
  }
  return share;
}

/** One recipient's resolved award, returned by {@link awardCombatExperience}. */
export interface XpAward {
  /** Index of the recipient in the input `party` array. */
  index: number;
  /** XP added to this character (0 if animated or absent from the battle). */
  awarded: number;
}

/**
 * Distribute a battle's total XP across the party (`AfterCombatExpAndTreasure` → `addExp`): split
 * `totalExp` by the number of **non-animated** members (`party_size − animatedCount`), then give
 * each member its {@link characterXpShare}. Returns the per-member award (XP to add to each
 * character's running `exp`); the caller applies it and re-checks level-ups via `levelForXp`.
 *
 * `totalExp` is what {@link calcBattleExp}/{@link calcDuelExp} produced. The divisor floors at 1
 * so an all-animated edge case can't divide by zero.
 */
export function awardCombatExperience(
  party: readonly XpRecipient[],
  totalExp: number,
): XpAward[] {
  const animatedCount = party.reduce((n, p) => n + (p.animated ? 1 : 0), 0);
  const divisor = Math.max(1, party.length - animatedCount);
  const share = Math.floor(totalExp / divisor);
  return party.map((recipient, index) => ({
    index,
    awarded: characterXpShare(share, recipient),
  }));
}
