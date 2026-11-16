/**
 * Party-side combatant builder (M2.S5/S6 bridge).
 *
 * Turns a PC sheet (class/level + ability scores + equipped weapon/armour) into the same neutral
 * `Combatant` the combat core consumes, deriving the combat-relevant numbers through a
 * `RulesetPlugin` so the rules stay pluggable:
 *  - **THAC0** = the best (lowest) of the ruleset's `thac0(class, level)` across the PC's classes,
 *    improved by the Strength to-hit modifier and any magic weapon bonus.
 *  - **AC** = the armour's base AC adjusted by the Dexterity defensive modifier (lower = better).
 *  - **damage** = the weapon's dice with the Strength damage modifier and magic bonus folded in.
 *
 * Hit points are taken from the sheet (HP is rolled at level-up from hit dice + Con, which is
 * character-generation, not combat). The monster side comes from `monsterCombatant()`.
 */
import type { Combatant } from './combat.js';
import type { DamageDice } from '../loaders/monster.js';
import type { AbilityScores, ClassId, RulesetPlugin } from '../ruleset/types.js';

export interface PartyMemberSpec {
  id: string;
  name: string;
  /** Class → level (one entry for single-class; several for multi-class). */
  classes: Partial<Record<ClassId, number>>;
  abilities: AbilityScores;
  /** Current and maximum hit points (from the character sheet). */
  hp: number;
  maxHp: number;
  /** Armour class from worn armour/shield before Dexterity (10 = unarmoured; lower = better). */
  baseAc: number;
  /** Equipped weapon's base damage dice. */
  weaponDamage: DamageDice;
  /** Magic weapon bonuses (+N to-hit / +N damage). */
  magicHitBonus?: number;
  magicDamageBonus?: number;
}

/** Build a battle-ready party `Combatant` from a PC sheet, using `ruleset` for the combat math. */
export function partyCombatant(spec: PartyMemberSpec, ruleset: RulesetPlugin): Combatant {
  if (!ruleset.thac0) {
    throw new Error(`partyCombatant: ruleset "${ruleset.id}" has no thac0 table`);
  }

  const entries = Object.entries(spec.classes) as [ClassId, number][];
  if (entries.length === 0) {
    throw new Error(`partyCombatant: "${spec.name}" has no classes`);
  }

  // Best (lowest) THAC0 across the character's classes.
  let baseThac0 = Infinity;
  for (const [cls, level] of entries) {
    baseThac0 = Math.min(baseThac0, ruleset.thac0(cls, level));
  }

  const str = ruleset.abilityMods.strength(spec.abilities.str, spec.abilities.strPct);
  const dex = ruleset.abilityMods.dexterity(spec.abilities.dex);

  // A positive hit modifier lowers the number you need, i.e. lowers effective THAC0.
  const thac0 = baseThac0 - str.hit - (spec.magicHitBonus ?? 0);
  const ac = spec.baseAc + dex.defensiveAc;
  const damage: DamageDice = {
    count: spec.weaponDamage.count,
    sides: spec.weaponDamage.sides,
    bonus: spec.weaponDamage.bonus + str.damage + (spec.magicDamageBonus ?? 0),
  };

  return {
    id: spec.id,
    name: spec.name,
    side: 'party',
    hp: spec.hp,
    maxHp: spec.maxHp,
    thac0,
    ac,
    damage,
    // M25.S1 — COAB DexReactionAdj: a missile-only to-hit bonus (tactical.ts's resolveHit applies it;
    // the abstract melee-only resolver above has nothing to apply it to).
    missileHitBonus: dex.missile || undefined,
  };
}

export type CombatRosterCondition = 'ok' | 'unconscious' | 'dying' | 'dead' | 'running' | 'animated';

export interface RecoverableRosterMember {
  hp: number;
  maxHp: number;
  /**
   * Permanently slain members are not touched by cure/rest healing. Raise Dead clears this and restores
   * the member to 1 HP.
   */
  dead?: boolean;
}

export interface CombatCleanupRosterMember extends RecoverableRosterMember {
  /**
   * Optional temporary combat status carried by callers that preserve more source state than the
   * public roster `dead` flag. The web roster still only persists `dead`; tactical/native callers can
   * use this to mirror CoAB cleanup before collapsing to HP/dead.
   */
  condition?: CombatRosterCondition;
  /** True for NPC/non-party members in the combat TeamList; normal party cleanup stops before them. */
  nonTeamMember?: boolean;
  /** Source-shaped marker for party members removed after a flee or total party kill. */
  removed?: boolean;
}

export interface RaiseDeadRosterMember extends RecoverableRosterMember {
  condition?: CombatRosterCondition;
  /** Race name/id when known; spell Raise Dead rejects elves in CoAB. */
  race?: string;
  /** Current Constitution when known; spell Raise Dead rejects CON <= 0 and decrements it on success. */
  con?: number;
  /** Whether the member is under Animate Dead; both CoAB temple/spell Raise Dead can target it. */
  animated?: boolean;
  /** Whether the member has a poison affect; Raise Dead removes it on success. */
  poisoned?: boolean;
}

export type RaiseDeadFailureReason = 'missing' | 'not-dead' | 'elf' | 'no-con';

export interface RaiseDeadRulesOptions {
  /** CoAB spell path (`SpellRaiseDead`) rejects elves and CON <= 0; temple has no race/CON rejection. */
  source?: 'spell' | 'temple';
}

export interface CombatRosterCleanupOptions {
  /** CoAB `area2_ptr.isDuel`: dying/unconscious members are restored to ok at 1 HP after a duel. */
  duel?: boolean;
  /** CoAB `party_fled`: only `running` members remain; others are removed from the party list. */
  partyFled?: boolean;
  /** CoAB `party_killed`: all party members are removed. */
  partyKilled?: boolean;
}

export interface CombatRosterCombatant {
  id: string;
  side: Combatant['side'];
  hp: number;
}

function partyRosterIndex(id: string): number | null {
  if (!/^p\d+$/.test(id)) return null;
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}

function clampHp(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(Math.max(0, Math.round(maxHp)), Math.round(hp)));
}

/**
 * Pure post-combat roster carry-over for the `p{n}` party ids emitted by {@link partyCombatant} and the
 * tactical/web party builders. HP is written back for matching party members, and the optional
 * `conditionOf` seam carries the Gold Box dead-vs-unconscious distinction: `dead` marks a permanent
 * death that needs Raise Dead, while `unconscious` stays merely down and remains healable by cure/rest.
 */
export function applyCombatRosterCarryOver<T extends RecoverableRosterMember>(
  roster: readonly T[],
  combatants: readonly CombatRosterCombatant[],
  conditionOf?: (id: string) => CombatRosterCondition,
): T[] {
  const out = roster.map((m) => ({ ...m }));
  for (const c of combatants) {
    if (c.side !== 'party') continue;
    const idx = partyRosterIndex(c.id);
    if (idx === null || idx >= out.length) continue;
    const member = out[idx]!;
    member.hp = clampHp(c.hp, member.maxHp);
    if (conditionOf?.(c.id) === 'dead') member.dead = true;
  }
  return out;
}

/**
 * Pure non-combat cure/rest helper. Permanently dead members are skipped; unconscious members with
 * `hp <= 0` but no `dead` flag are valid targets and can be brought back above zero.
 */
export function healRosterMember<T extends RecoverableRosterMember>(
  roster: readonly T[],
  index: number,
  amount: number,
): { roster: T[]; healed: number } {
  const out = roster.map((m) => ({ ...m }));
  const member = out[index];
  if (!member || member.dead) return { roster: out, healed: 0 };
  const before = member.hp;
  member.hp = clampHp(member.hp + Math.max(0, Math.round(amount)), member.maxHp);
  return { roster: out, healed: member.hp - before };
}

/**
 * Pure Raise Dead helper. Only a permanently dead member can be raised; a merely unconscious member is
 * intentionally rejected because cures/rest handle that case. On success the member returns at 1 HP.
 */
export function raiseRosterMember<T extends RecoverableRosterMember>(
  roster: readonly T[],
  index: number,
): { roster: T[]; raised: boolean } {
  const out = roster.map((m) => ({ ...m }));
  const member = out[index];
  if (!member || !member.dead) return { roster: out, raised: false };
  member.hp = Math.min(1, Math.max(0, Math.round(member.maxHp)));
  member.dead = false;
  return { roster: out, raised: true };
}

function isRaiseDeadEligible(member: RaiseDeadRosterMember): boolean {
  return member.dead === true || member.animated === true || member.condition === 'dead' || member.condition === 'animated';
}

function isElfRace(race: string | undefined): boolean {
  return race?.toLowerCase().includes('elf') === true;
}

/**
 * Source-shaped Raise Dead helper. This preserves {@link raiseRosterMember}'s simple MVP API while
 * exposing the recovered CoAB spell gates for callers that have race/CON/affect state available:
 * the spell raises `dead` or `animated` non-elves with CON > 0, removes animate/poison state,
 * decrements CON, and restores 1 HP. Temple Raise Dead has no elf/CON rejection, but still decrements
 * CON when it is known and above zero.
 */
export function raiseRosterMemberWithRules<T extends RaiseDeadRosterMember>(
  roster: readonly T[],
  index: number,
  options: RaiseDeadRulesOptions = { source: 'spell' },
): { roster: T[]; raised: boolean; reason?: RaiseDeadFailureReason } {
  const out = roster.map((m) => ({ ...m }));
  const member = out[index];
  if (!member) return { roster: out, raised: false, reason: 'missing' };
  if (!isRaiseDeadEligible(member)) return { roster: out, raised: false, reason: 'not-dead' };

  const source = options.source ?? 'spell';
  if (source === 'spell') {
    if (isElfRace(member.race)) return { roster: out, raised: false, reason: 'elf' };
    if (member.con !== undefined && member.con <= 0) return { roster: out, raised: false, reason: 'no-con' };
  }

  member.hp = Math.min(1, Math.max(0, Math.round(member.maxHp)));
  member.dead = false;
  member.condition = 'ok';
  member.animated = false;
  member.poisoned = false;
  if (member.con !== undefined && member.con > 0) member.con -= 1;
  return { roster: out, raised: true };
}

function memberCondition(member: CombatCleanupRosterMember): CombatRosterCondition {
  if (member.condition) return member.condition;
  if (member.dead) return 'dead';
  return member.hp > 0 ? 'ok' : 'unconscious';
}

/**
 * Pure subset of CoAB `CleanupPlayersStateAfterCombat` for party roster state. It handles the durable
 * states Greybox carries after tactical combat:
 * - normal combat: `dying` demotes to recoverable `unconscious`
 * - duel cleanup: `dying`/`unconscious` become `ok` at 1 HP
 * - party fled: only `running` members remain; others are marked removed
 * - party killed: all party members are marked removed
 *
 * A caller that only persists HP + permadead can ignore `condition`; this helper exists so richer
 * tactical/native callers can do source-shaped cleanup before collapsing to the public roster model.
 */
export function cleanupCombatRosterAfterCombat<T extends CombatCleanupRosterMember>(
  roster: readonly T[],
  options: CombatRosterCleanupOptions = {},
): T[] {
  const out = roster.map((m) => ({ ...m }));
  for (const member of out) {
    if (member.nonTeamMember) break;
    const condition = memberCondition(member);
    if (options.partyKilled) {
      member.removed = true;
      continue;
    }
    if (options.partyFled) {
      if (condition === 'running') {
        member.condition = 'ok';
        member.dead = false;
        member.removed = false;
      } else {
        member.removed = true;
      }
      continue;
    }
    if (condition === 'running') {
      member.condition = 'ok';
      member.dead = false;
    } else if (condition === 'dying') {
      if (options.duel) {
        member.condition = 'ok';
        member.dead = false;
        member.hp = Math.min(1, Math.max(0, Math.round(member.maxHp)));
      } else {
        member.condition = 'unconscious';
        member.dead = false;
        member.hp = 0;
      }
    } else if (condition === 'unconscious' && options.duel) {
      member.condition = 'ok';
      member.dead = false;
      member.hp = Math.min(1, Math.max(0, Math.round(member.maxHp)));
    }
  }
  return out;
}
