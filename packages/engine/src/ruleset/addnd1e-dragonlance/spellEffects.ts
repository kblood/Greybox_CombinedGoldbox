/**
 * Spell effects (A2.2) — the pure, rules-side resolution of what a Champions of Krynn spell *does*:
 * healing dice for the cure line, damage dice for the attack line, plus buff/cure/utility/revive
 * tags. This is shared by camp casting (healing/utility) and, later, the in-combat cast hook — the
 * effect descriptors live with the ruleset so both call sites resolve a spell the same way.
 *
 * Dice are the canonical AD&D-1e / Gold Box values (e.g. Cure Light Wounds 1d8, Magic Missile 1d4+1,
 * Fireball is per-caster-level so the web layer scales `count` by level). Only the spells with a
 * concrete mechanical effect are listed; anything else resolves to a flavour-only `utility` effect.
 */
import { Rng } from '../../util/rng.js';

export type SpellEffectKind = 'heal' | 'cure' | 'revive' | 'damage' | 'buff' | 'utility';

/** Who the spell is aimed at. */
export type SpellTargetMode = 'ally' | 'allyGroup' | 'self' | 'enemy' | 'enemyGroup' | 'none';

export interface SpellDice {
  count: number;
  sides: number;
  bonus: number;
  /** When true, `count` is per caster level (e.g. Fireball 1d6/level) — the caller scales it. */
  perLevel?: boolean;
}

export interface SpellEffect {
  kind: SpellEffectKind;
  target: SpellTargetMode;
  /** Healing or damage dice, if the effect rolls an amount. */
  dice?: SpellDice;
  /** Castable usefully while camped (heals, cures, revives, party buffs). */
  campCastable: boolean;
  /** Short UI note (e.g. the buff a spell would confer once buffs are modelled). */
  note?: string;
}

const heal = (count: number, sides: number, bonus = 0): SpellEffect => ({
  kind: 'heal', target: 'ally', dice: { count, sides, bonus }, campCastable: true,
});
const dmg = (target: SpellTargetMode, count: number, sides: number, bonus = 0, perLevel = false): SpellEffect => ({
  kind: 'damage', target, dice: { count, sides, bonus, perLevel }, campCastable: false,
});
const cure = (note: string): SpellEffect => ({ kind: 'cure', target: 'ally', campCastable: true, note });
const buff = (note: string, target: SpellTargetMode = 'ally'): SpellEffect => ({ kind: 'buff', target, campCastable: true, note });

/** Effect table keyed by the {@link COK_SPELLS} ids. Spells absent here are flavour-only utility. */
const EFFECTS: Record<string, SpellEffect> = {
  // ── Cleric heals / cures / revive ──
  'c1-cure-light-wounds': heal(1, 8),
  'c4-cure-serious-wounds': heal(2, 8, 1),
  'c5-cure-critical-wounds': heal(3, 8, 3),
  'c3-cure-disease': cure('cures disease'),
  'c3-cure-blindness': cure('cures blindness'),
  'c4-neutralize-poison': cure('neutralizes poison'),
  'c5-raise-dead': { kind: 'revive', target: 'ally', campCastable: true, note: 'raises a dead ally to 1 HP' },
  // ── Cleric buffs ──
  'c1-bless': buff('+1 to hit (party)', 'allyGroup'),
  'c3-prayer': buff('+1 party / −1 foes', 'allyGroup'),
  // ── Cleric attack ──
  'c1-cause-light-wounds': dmg('enemy', 1, 8),
  'c5-cause-critical-wounds': dmg('enemy', 3, 8, 3),
  'c5-flame-strike': dmg('enemyGroup', 6, 8),
  'c5-slay-living': dmg('enemy', 0, 0, 0),

  // ── Mage attack ──
  'm1-magic-missile': dmg('enemy', 1, 4, 1),
  'm1-burning-hands': dmg('enemy', 1, 3),
  'm1-shocking-grasp': dmg('enemy', 1, 8, 0),
  'm2-stinking-cloud': dmg('enemyGroup', 0, 0, 0),
  'm3-fireball': dmg('enemyGroup', 1, 6, 0, true),
  'm3-lightning-bolt': dmg('enemyGroup', 1, 6, 0, true),
  'm4-ice-storm': dmg('enemyGroup', 3, 10),
  'm5-cloudkill': dmg('enemyGroup', 0, 0, 0),
  'm5-cone-of-cold': dmg('enemyGroup', 1, 4, 0, true),
  // ── Mage buffs / utility ──
  'm1-shield': buff('better AC', 'self'),
  'm1-enlarge': buff('grows an ally', 'ally'),
  'm2-strength': buff('+STR', 'ally'),
  'm3-haste': buff('hastens the party', 'allyGroup'),
};

/** The effect of a spell id, or a flavour-only utility effect if it has no modelled mechanics. */
export function spellEffect(spellId: string): SpellEffect {
  return EFFECTS[spellId] ?? { kind: 'utility', target: 'none', campCastable: false };
}

/** True if the spell does something useful in camp (heal/cure/revive/party buff). */
export function isCampCastable(spellId: string): boolean {
  return spellEffect(spellId).campCastable;
}

/**
 * Roll the amount (HP healed or damage dealt) for an effect, scaling per-level dice by `casterLevel`.
 * Returns 0 for effects without dice (cures, buffs, fixed-result spells). `seed` makes it deterministic.
 */
export function rollSpellAmount(effect: SpellEffect, casterLevel: number, seed = 0x1234): number {
  if (!effect.dice) return 0;
  const { count, sides, bonus, perLevel } = effect.dice;
  const n = perLevel ? Math.max(1, count * Math.max(1, Math.floor(casterLevel))) : count;
  if (sides <= 0) return Math.max(0, bonus);
  const rng = new Rng(seed);
  return Math.max(0, rng.roll(n, sides, bonus));
}
