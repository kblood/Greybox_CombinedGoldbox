/**
 * Deterministic combat core (M2.S5).
 *
 * Resolves a Gold Box / AD&D-1e melee encounter between two sides on a neutral `Combatant` model:
 * everything it needs — THAC0, AC, HP, damage dice — is engine-neutral, so the monster side is fed
 * straight from the verified `MON{n}CHA.DAX` loader (`loaders/monster.ts`) and the party side from a
 * ruleset once the PC to-hit/damage tables land (M2.S3b / base-item table). With a seeded `Rng` the
 * whole battle is reproducible, which is what the golden fixture pins.
 *
 * Rules modelled (faithful 1e melee subset; ranged/spells/morale come later):
 *  - **Initiative**: each round, every living combatant rolls 1d10; lower acts first (1e), ties
 *    broken party-before-enemy then by stable id. Re-rolled each round.
 *  - **Targeting**: an attacker hits the first living opponent in stable id order.
 *  - **To-hit**: roll d20; a hit needs `d20 >= THAC0 − targetAC`. Natural 20 always hits, natural 1
 *    always misses (Gold Box convention).
 *  - **Damage**: on a hit, roll the attacker's damage dice (minimum 1). HP ≤ 0 ⇒ slain & removed.
 *  - **XP**: defeating an enemy accrues its `xp` to the party pool (awarded only for enemy deaths).
 *  - **End**: one side wiped ⇒ the other wins; a `roundCap` (default 100) ⇒ 'draw'.
 */
import { Rng } from '../util/rng.js';
import type { DamageDice, CarriedLoot, MonsterAbilities } from '../loaders/monster.js';
import type { SavingThrows } from '../ruleset/types.js';
import type { CokCharacterAppearanceRecord } from '../ruleset/addnd1e-dragonlance/character.js';

export type CombatSide = 'party' | 'enemy';

export interface Combatant {
  /** Unique id within the battle (used for stable ordering and targeting). */
  id: string;
  name: string;
  side: CombatSide;
  /** Source-backed CoK head/body identity for a persistent player; renderers resolve the art. */
  cokAppearance?: CokCharacterAppearanceRecord;
  /** Current hit points. */
  hp: number;
  /** Maximum hit points. */
  maxHp: number;
  /** To-hit armour-class-0. */
  thac0: number;
  /** Armour class (lower is better; may be negative). */
  ac: number;
  /** Melee damage roll. */
  damage: DamageDice;
  /** Experience awarded when this combatant is slain (relevant for enemies). */
  xp?: number;
  /** CoK's title-local `calc_battle_exp` per-HP XP multiplier, when decoded from a CCH record. */
  perHpXp?: number;
  /** CoK's title-local rolled-HP input to `calc_battle_exp`, when decoded from a CCH record. */
  rolledHp?: number;
  /** Hit Dice — used by HD-capped status effects (Sleep's ≤4-HD rule) and turn-undead. Omit ⇒ not cap-gated. */
  hd?: number;
  /** True for undead — the only valid targets of a cleric's turn-undead (CT.5b). */
  undead?: boolean;
  /** True for undead that **cannot be turned** (Death Knights — CoK manual rule). Implies {@link undead}. */
  turnImmune?: boolean;
  /**
   * Morale as a **percentage** 0..102 (CoK `morale_check`: `(control_morale & 0x7F)*2`, clamped 102). A
   * monster breaks — and flees or surrenders (CT.6) — when this is below the percent of HP it (or its side)
   * has lost. Omit for figures that never check morale (the party; undead/constructs). 100+ ⇒ never breaks.
   */
  morale?: number;
  /**
   * True for MONCHA-backed NPC combatants rather than player-created PCs. CoAB stores this as
   * `control_morale >= Control.NPC_Base` and uses it for party limits and for the confirmed
   * `Attack Ally:` branch, where healthy NPC allies turn hostile. Ordinary party members leave this
   * unset/false.
   */
  npcControlled?: boolean;
  /**
   * **Rear AC** — the figure's effective armor class when struck from **behind** (CT.7a; COAB `ac_behind`
   * @0x19B). Should be ≥ {@link ac} (easier to hit from the rear). Omit ⇒ no stored value: a rear melee
   * strike instead takes the 1e-standard generic rear bonus (+2 to hit; negates shield + Dexterity).
   */
  rearAc?: number;
  /**
   * Combat-icon footprint hint in cells per side (1 = Small 1×1, 2 = Large 2×2; CT.7f). Carried from a
   * monster record's byte-located size byte ({@link monsterCombatant}); the tactical layer reads it when
   * placing the figure, falling back to a name heuristic when omitted. Party figures are always 1×1.
   */
  combatSize?: number;
  /**
   * Source combat footprint low bits from the record size indicator (CoAB `field_DE`, CoK `0xcf`, DoK
   * `0x29`). This is intentionally separate from {@link combatSize}: source placement uses tall/wide/big
   * footprint shapes, while the tactical runtime still renders/moves with its square size model.
   */
  coabSourceSize?: number;
  /**
   * Innate "heal N HP at the start of every combat round, capped at {@link maxHp}" special (COAB
   * `Affects.regen_3_hp`, `AffectRegen3Hp`, ticked once per round by `BattleRoundChecks`'s
   * `CheckType.Type_19` sweep). Sourced from a monster's `MON{n}SPC.DAX` side-table via
   * `applyRegenAffect` (`loaders/monsterSideTables.ts`) — undefined ⇒ no regen (the common case; party
   * figures never have this).
   */
  regenPerRound?: number;
  /**
   * Innate "halve all incoming weapon damage" special (COAB `Affects.half_damage`, swept every hit by
   * `BattleRoundChecks`'s `CheckType.Type_5` list). Sourced from a monster's `MON{n}SPC.DAX` side-table
   * via `applyHalfDamageAffect` (`loaders/monsterSideTables.ts`) — undefined ⇒ full damage (the common
   * case; party figures never have this).
   */
  halfDamage?: boolean;
  /**
   * Dexterity missile-attack to-hit bonus (COAB `DexReactionAdj`/`CalculateAttackValues`, `ovr025.cs`
   * `sub_66023` — applied to `hitBonus` only when the equipped item is a ranged weapon, never melee).
   * Sourced from `ADND1E_ABILITIES.dexterity(dex).missile` by the party-combatant builders
   * (`apps/web/src/ui/party.ts`'s `sheetToCombatant`, `combat/party.ts`'s `partyCombatant`) — undefined
   * ⇒ no bonus (the common case for monsters, whose THAC0 comes pre-resolved from `MON{n}CHA.DAX`, and
   * for any melee-only figure). This abstract resolver has no missile branch to apply it to (see its
   * own header comment); `tactical.ts`'s `resolveHit()` is where it actually lands.
   */
  missileHitBonus?: number;
  /**
   * The `plus` of each item this (monster) combatant carries (COAB `Item.plus`, summed as
   * `Σ item.plus·400` post-combat XP by `calcBattleExp`/`ovr006.cs calc_battle_exp`). Sourced from a
   * monster's `MON{n}ITM.DAX` side-table via `applyItemPluses` (`loaders/monsterSideTables.ts`) —
   * undefined ⇒ no carried magic items (the common case; party figures never have this — a defeated
   * foe's carried loot, not the party's own gear). Read once, at battle end, by the caller that awards
   * XP (`apps/web/src/ui/combat.ts`'s `finalize()`); neither combat engine's round loop touches it.
   */
  itemPluses?: number[];
  /**
   * Every carried item's identity (`{baseTypeId, count}`), unfiltered — the loot-table sibling to
   * {@link itemPluses} (same `MON{n}ITM.DAX` decode, keyed on identity instead of `.plus`). Sourced
   * from a monster's `MON{n}ITM.DAX` side-table via `applyCarriedItems` (`loaders/monsterSideTables.ts`)
   * — undefined ⇒ no carried items (the common case; party figures never have this). Read once, at
   * battle end, by `rollTreasure` (`items/treasure.ts`), which decides which entries resolve to a real
   * catalogue item; neither combat engine's round loop touches it.
   */
  carriedItems?: CarriedLoot[];
  /**
   * The d20 save-vs-spell target from this monster's own `MON{n}CHA.DAX` saving-throw block (offset
   * 208-212, the "spell" column) — sourced by {@link monsterCombatant} from
   * `MonsterRecord.savingThrows.spell` (`loaders/monster.ts`). Undefined ⇒ no data (DoK's compact
   * record, or an unresolved/demo enemy); the tactical layer then leaves the figure's own `save` unset,
   * the pre-existing safe default (never saves, full effect). Party figures never carry this — see
   * `apps/web/src/ui/party.ts`'s `spellSaveForMember` for their equivalent (a different field,
   * `CharacterSheet.savingThrows`, computed from class/level rather than decoded from a DAX byte). The
   * other four `SavingThrows` columns (`paralyzePoisonDeath`, `petrifyPolymorph`, `rodStaffWand`,
   * `breath`) are decoded but have no consuming mechanic in either combat engine yet (no poison/
   * petrification/rod-staff-wand/breath-weapon effect exists) — flagged, not wired, by M27's audit.
   */
  monsterSpellSave?: number;
  /**
   * A Con-derived bonus added to the die roll (not the target) when this monster's own
   * `Affects.con_saving_bonus` (COAB `0x61`, `ovr013.cs con_saving_bonus`) is present — see
   * `applyConSavingBonus` (`loaders/monsterSideTables.ts`). Undefined ⇒ no bonus (the common case;
   * party figures never carry this — no equivalent per-roll mechanism is wired for PC saves, distinct
   * from the already-shipped `conPoisonSaveBonus`, which is a different save column applied once at
   * chargen). Sourced by {@link monsterCombatant} from `MonsterRecord.conSaveBonus`.
   */
  conSaveBonus?: number;
  /** CoAB cloud-protection movement gate for Stinking Cloud-style noxious tiles. */
  noxiousCloudEntryImmune?: boolean;
  /** CoAB post-entry noxious-cloud exposure gate (`in_poison_cloud`). */
  noxiousCloudExposureImmune?: boolean;
  /** CoAB cloud-protection movement gate for low-HD Cloudkill/poisonous-cloud entry. */
  poisonCloudEntryImmune?: boolean;
  /** Poisonous-cloud exposure gate; only populated when a source-backed provider proves one. */
  poisonCloudExposureImmune?: boolean;
  /**
   * M31.S1 — every spell this monster has memorized, as raw DoK global spell numbers (unfiltered,
   * including duplicates and ids with no modelled tactical geometry). Sourced from a monster's
   * `MON{n}WIZ.DAX` side-table via `applyPreparedSpellIds` (`loaders/monsterSideTables.ts`, DoK-only)
   * — undefined ⇒ no memorized spells (the common case; only ~14/64 DoK area-1 monsters cast). This
   * abstract combat engine's own round loop never reads it — it exists purely so the id survives from
   * `MonsterRecord` to the tactical-combat assembly point (`apps/web/src/ui/combat.ts`'s `makeTC()`),
   * which crosswalks the raw ids to real `TacticalSpell`s for `TacticalCombatant.preparedSpells`.
   */
  preparedSpellIds?: number[];
  /**
   * Intelligence score, consulted only by the tactical layer's morale-break branch
   * ({@link TacticalCombatant.int} in `combat/tactical.ts`, CT.6 / ovr010 `FleeCheck_001`): a monster
   * whose morale breaks surrenders when `int > 5` and otherwise routs. Sourced by
   * {@link monsterCombatant} from `MonsterRecord.abilities.int` (`loaders/monster.ts`) — undefined ⇒
   * the tactical layer falls back to its legacy break model. Party figures never carry this.
   */
  int?: number;
}

export type CombatEventType = 'attack' | 'slain' | 'end';

export interface CombatEvent {
  round: number;
  type: CombatEventType;
  /** Acting combatant id (absent for the terminal 'end' event). */
  attacker?: string;
  /** Target combatant id (attack/slain events). */
  target?: string;
  /** The d20 roll (attack events). */
  roll?: number;
  /** The number the attacker needed to hit (THAC0 − targetAC; attack events). */
  needed?: number;
  hit?: boolean;
  /** Damage dealt on a hit. */
  damage?: number;
  /** Target HP after the hit (attack events). */
  targetHpAfter?: number;
  /** Outcome string on the terminal 'end' event. */
  outcome?: CombatOutcome;
}

export type CombatOutcome = 'party' | 'enemy' | 'draw';

export interface CombatResult {
  outcome: CombatOutcome;
  /** Number of full rounds executed. */
  rounds: number;
  log: CombatEvent[];
  /** Combatants still standing (hp > 0). */
  survivors: Combatant[];
  /** Total XP accrued by the party for enemies slain. */
  xpAwarded: number;
  /** True when the party withdrew instead of winning/losing. Tactical combat sets this for party flee. */
  fled?: boolean;
}

export interface CombatOptions {
  seed?: number;
  /** Max rounds before declaring a draw (safety against stalemates). */
  roundCap?: number;
}

/** Stable ordering: party before enemy, then by id, so a tie is always resolved the same way.
 * Exported so the interactive stepper (`combatStepper.ts`) targets/orders identically — one source
 * of truth for the deterministic tie-break, never a second copy that could drift. */
export function bySideThenId(a: Combatant, b: Combatant): number {
  if (a.side !== b.side) return a.side === 'party' ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function livingOf(combatants: Combatant[], side: CombatSide): Combatant[] {
  return combatants.filter((c) => c.side === side && c.hp > 0);
}

/**
 * Run a full combat to its conclusion. `combatants` are mutated in place (hp decremented); pass
 * clones if the caller needs the originals. Returns the structured log + outcome.
 */
export function runCombat(combatants: Combatant[], opts: CombatOptions = {}): CombatResult {
  const rng = new Rng(opts.seed ?? 0x1234);
  const roundCap = opts.roundCap ?? 100;
  const log: CombatEvent[] = [];
  let xpAwarded = 0;
  let round = 0;

  const sidesAlive = () => ({
    party: livingOf(combatants, 'party').length,
    enemy: livingOf(combatants, 'enemy').length,
  });

  while (round < roundCap) {
    const alive = sidesAlive();
    if (alive.party === 0 || alive.enemy === 0) break;
    round++;

    // COAB `BattleRoundChecks` (battle01) ticks regen once per round, before initiative — the same
    // spot `CheckType.Type_19`'s `regen_3_hp` sweep runs at.
    for (const c of combatants) {
      if (c.hp > 0 && c.regenPerRound) c.hp = Math.min(c.maxHp, c.hp + c.regenPerRound);
    }

    // Roll initiative for the round (1d10 each); lower acts first.
    const order = combatants
      .filter((c) => c.hp > 0)
      .map((c) => ({ c, init: rng.die(10) }))
      .sort((a, b) => a.init - b.init || bySideThenId(a.c, b.c))
      .map((e) => e.c);

    for (const attacker of order) {
      if (attacker.hp <= 0) continue; // died earlier this round
      const foeSide: CombatSide = attacker.side === 'party' ? 'enemy' : 'party';
      const foes = livingOf(combatants, foeSide).sort(bySideThenId);
      if (foes.length === 0) break;
      const target = foes[0];

      const roll = rng.die(20);
      const needed = attacker.thac0 - target.ac;
      const hit = roll === 20 ? true : roll === 1 ? false : roll >= needed;

      if (!hit) {
        log.push({
          round,
          type: 'attack',
          attacker: attacker.id,
          target: target.id,
          roll,
          needed,
          hit: false,
          targetHpAfter: target.hp,
        });
        continue;
      }

      let dmg = Math.max(1, rng.roll(attacker.damage.count, attacker.damage.sides, attacker.damage.bonus));
      // M24.S1 — COAB `half_damage` (Type_5 sweep): halved on the defender, finalizing the hit.
      if (target.halfDamage) dmg = Math.floor(dmg / 2);
      target.hp -= dmg;
      const slain = target.hp <= 0;
      log.push({
        round,
        type: 'attack',
        attacker: attacker.id,
        target: target.id,
        roll,
        needed,
        hit: true,
        damage: dmg,
        targetHpAfter: Math.max(0, target.hp),
      });
      if (slain) {
        log.push({ round, type: 'slain', attacker: attacker.id, target: target.id });
        if (target.side === 'enemy') xpAwarded += target.xp ?? 0;
      }
    }
  }

  const alive = sidesAlive();
  const outcome: CombatOutcome =
    alive.enemy === 0 && alive.party > 0
      ? 'party'
      : alive.party === 0 && alive.enemy > 0
        ? 'enemy'
        : 'draw';
  log.push({ round, type: 'end', outcome });

  return {
    outcome,
    rounds: round,
    log,
    survivors: combatants.filter((c) => c.hp > 0),
    xpAwarded,
  };
}

/**
 * Build a battle-ready `Combatant` from a decoded monster record (one instance). CT.7k-2 carries the
 * record's **byte-located** combat fidelity through: its **morale** % (CoK `control_morale` @231,
 * VERIFIED — undefined ⇒ the monster never checks morale) and its **size** (CoK icon byte @207, Large iff
 * > 1). Both are omitted by formats where the field is not located (DoK compact record), so the combat
 * layer falls back to its name heuristic / no-morale default exactly as before.
 */
export function monsterCombatant(
  mon: {
    name: string;
    hitPoints: number;
    thac0: number;
    armorClass: number;
    damage: DamageDice;
    xp: number;
    perHpXp?: number;
    rolledHp?: number;
    morale?: number;
    combatSize?: number;
    coabSourceSize?: number;
    regenPerRound?: number;
    halfDamage?: boolean;
    itemPluses?: number[];
    carriedItems?: CarriedLoot[];
    savingThrows?: SavingThrows;
    conSaveBonus?: number;
    noxiousCloudEntryImmune?: boolean;
    noxiousCloudExposureImmune?: boolean;
    poisonCloudEntryImmune?: boolean;
    poisonCloudExposureImmune?: boolean;
    preparedSpellIds?: number[];
    abilities?: MonsterAbilities;
  },
  id: string,
  side: CombatSide = 'enemy',
): Combatant {
  return {
    id,
    name: mon.name,
    side,
    hp: mon.hitPoints,
    maxHp: mon.hitPoints,
    thac0: mon.thac0,
    ac: mon.armorClass,
    damage: mon.damage,
    xp: mon.xp,
    perHpXp: mon.perHpXp,
    rolledHp: mon.rolledHp,
    morale: mon.morale,
    npcControlled: true,
    combatSize: mon.combatSize,
    coabSourceSize: mon.coabSourceSize,
    regenPerRound: mon.regenPerRound,
    halfDamage: mon.halfDamage,
    itemPluses: mon.itemPluses,
    carriedItems: mon.carriedItems,
    monsterSpellSave: mon.savingThrows?.spell,
    conSaveBonus: mon.conSaveBonus,
    noxiousCloudEntryImmune: mon.noxiousCloudEntryImmune,
    noxiousCloudExposureImmune: mon.noxiousCloudExposureImmune,
    poisonCloudEntryImmune: mon.poisonCloudEntryImmune,
    poisonCloudExposureImmune: mon.poisonCloudExposureImmune,
    preparedSpellIds: mon.preparedSpellIds,
    int: mon.abilities?.int,
  };
}
