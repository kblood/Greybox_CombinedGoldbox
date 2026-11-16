/**
 * Tactical (grid) combat engine — the real Gold Box "D&D board game" battle (CT.1).
 *
 * The older `combat.ts`/`combatStepper.ts` resolve a *positionless* brawl (everyone hits "the first
 * living foe", `move` is a no-op). That is fine for an overland auto-resolve but it is NOT the game:
 * Gold Box combat is fought on a **grid of squares** where figures spend a movement allowance to walk
 * (8-directional), melee only an **adjacent** foe, loose **missiles/thrown** weapons across a clear
 * line of fire within range, cast **spells** (range + area + saving throw), use **abilities**, and may
 * **flee** off the map edge. This module is that engine — pure and deterministic (seeded `Rng`), with
 * positions as first-class state, so the UI can render movement, targeting cursors, missile lines and
 * spell bursts instead of a static screen.
 *
 * Scope of THIS layer (faithful, tested): grid + terrain, 8-dir movement with per-cell cost and
 * blockers, Chebyshev melee reach with multi-attack, missile fire (range + line-of-fire + ammo),
 * guard/wait, flee-off-edge, and the per-round initiative/turn loop. Spells, class abilities and
 * morale are typed into the model and surfaced as actions, with their resolution filled in the
 * following layers (CT.2 spells/abilities, CT.3 morale). The to-hit/damage math is the same 1e model
 * as `combat.ts` (`d20 ≥ THAC0 − AC`, nat-20 hits / nat-1 misses) so the two never diverge.
 *
 * CT.1b — verified against the COAB (same-generation Gold Box) decompile, see
 * `docs/engine/research/combat-mechanics-coab.md`. Corrections applied here so the engine matches the
 * original rather than generic AD&D-1e guesses:
 *   • Death threshold — 0 HP is *unconscious* (revivable); 1-9 HP below zero is *dying* with the
 *     negative depth stored in `bleeding`; a figure is only *dead* when a single blow leaves it 10+ HP
 *     below zero (`damage >= hp + 10` in CoAB `damage_player`). All are out of the fight but the
 *     distinction drives post-combat revive vs permadeath.
 *   • Diagonal movement — we carry the budget in **half-steps** (orthogonal = 2). The diagonal cost is
 *     now ruleset-dependent (`diagCost`): **Gen1 (CoK/DoK) = 4 (2×, Manhattan — no diagonal discount)**,
 *     CORRECTED from the old COAB 1.5× guess after RE.5/RE.6 VERIFIED it against CoK's own movement code
 *     (the diagonal handler at GAME.OVR file `0x118D8` deducts 4 from the budget and both axis counters;
 *     a full census of CoK's reconstructed FBOV call graph found no `3` on movement anywhere). The COAB
 *     "5-10-15" 1.5× diagonal (`diag=3`) was never present in any Gen1 Krynn binary. `gen2` (DQK) keeps
 *     1.5× provisionally — DQK's own diagonal cost is UNLOCATED. See disasm-combat-cok.md §3.4/§9.
 *   • Initiative — read from a stored per-combatant value (`charStruct.initiative` 0x1A5), ×2 hasted /
 *     ÷2 slowed, sorted high-first; it is NOT a fresh per-round d10 (`calc_group_inituative`).
 *   • Attacks/round — `attacksCount` is stored in *half-attacks*; a 3/2 fighter swings twice then once
 *     on alternating rounds (`sub_3EDD4`/`sub_3EF0D`), not a flat integer every round.
 *   • Morale — a *percentage* (0..102 = `(control_morale & 0x7F)*2`, capped), failing when it drops
 *     below the percent of HP the side has lost (`sub_3637F`); not a 2d6-vs-12 roll.
 *
 * RE.1 — the COAB-derived rules above are now VERIFIED against each Krynn game's OWN 16-bit binary
 * (clean-room disassembly via `tools/disasm_{cok,dok,dqk}.py`; see `docs/engine/research/
 * disasm-combat-{cok,dok,dqk}.md` and the synthesis in `disasm-combat-krynn-SUMMARY.md`):
 *   • CoK (`Champions of Krynn/GAME.OVR`, FBOV overlay) — death (`dmg >= hp+10`), morale, and initiative
 *     (stored byte, haste×2/slow÷2, no d10) CONFIRMED in CoK's own code. RE.3 added the movement
 *     half-step *unit* (ortho=2), and RE.5/RE.6 VERIFIED the diagonal cost = **2× (4 half-steps)** — the
 *     engine's gen1 diagonal is now corrected to match (was an unverified COAB 1.5×). Fractional attacks
 *     stay UNLOCATED for CoK (its swing-count is cross-thunked; field 0xFF is CoK's damage bonus, not
 *     half-attacks).
 *   • DoK (`Death Knights of Krynn/GAME.OVR`, FBOV overlay) — Gen1 byte-faithful: death (byte-identical
 *     `dmg >= hp+10`), fractional attacks (half-units field 0xFF), the half-step *unit* (ortho=2), morale,
 *     and haste×2/slow÷2 all CONFIRMED. (DoK confirms the *fractional-attack rule* CoK leaves unlocated,
 *     but the explicit `diag=3` 1.5× cost is UNLOCATED in DoK too — no Gen1 binary verifies 1.5×.)
 *   → So for the Gen1 games (CoK/DoK) the model in THIS file is verified against the originals: death,
 *     morale, initiative, fractional-attack rule, the ortho move unit, AND now the 2× diagonal cost. The
 *     last COAB assumption (1.5× diagonal) was tested against CoK's own code and CORRECTED to 2×. Struct
 *     offsets differ per game; the math is otherwise identical — tables in the docs.
 *   • DQK (`The Dark Queen of Krynn/DQK.EXE`, Gen2) — RE.2 forked the engine via the `ruleset` option.
 *     The ONE verified Gen2 divergence: the Gen1 `+10` overkill-death literal is ABSENT from DQK's
 *     combat region (byte scan: 0 hits for `add ax,0Ah` vs CoK 5 / DoK 4), so `gen2` does not apply it.
 *     A deeper trace (disasm-combat-dqk.md §8) REFUTED two first-pass claims: the "0–9 speed scale" is a
 *     global game-speed/animation UI setting, NOT per-combatant initiative; and the "7/12/14 threshold
 *     jump-table" is an affliction *ticker*, not the death handler. DQK's real death trigger and its
 *     morale flee-emit live in resident code and stay UNLOCATED — so `gen2` keeps the Gen1 initiative
 *     and morale models (not re-guessed) until those are pinned (BUILD-QUEUE RE.3+). The `ds:0x13CC`
 *     reaction table + the re-laid-out struct are real but unmodelled pending a verified flee rule.
 */
import { Rng } from '../util/rng.js';
import { bySideThenId, type Combatant, type CombatOutcome, type CombatSide } from './combat.js';
import type { DamageDice } from '../loaders/monster.js';
import { sortedCombatants, steppingPathDistance } from './geometry.js';

export interface GridPos {
  col: number;
  row: number;
}

/** 8-way facing index into {@link DIR8} (0 = east, going clockwise). */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Clockwise from east: E, SE, S, SW, W, NW, N, NE. Diagonals included (Gold Box 8-dir movement). */
export const DIR8: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

export type WeaponKind = 'melee' | 'missile' | 'thrown';

export interface Weapon {
  name: string;
  kind: WeaponKind;
  damage: DamageDice;
  /** Melee reach in cells (default 1 = must be adjacent). */
  reach?: number;
  /** Missile/thrown maximum range in cells (Chebyshev). Ignored for melee. */
  range?: number;
  /** Remaining ammunition (arrows / quarrels / throwables). `undefined` = unlimited (melee). */
  ammo?: number;
}

/**
 * `asleep`/`held` skip the turn (the figure is **helpless** — attacks against it auto-hit; CT.5a);
 * `coughing` is CoAB's `stinking_cloud` affect: it records a successful noxious-cloud save but does
 * not make the figure helpless.
 * `feared` figures can't attack and flee toward the nearest edge on their turn. `fled` removes the
 * figure (escaped off-edge). `hasted`/`slowed` modify the initiative value (×2 / ÷2).
 * `unconscious`/`dying`/`dead` mark a downed figure: all are out of the fight, but `dead` is the
 * permadeath case (10+ HP below zero in gen1), `unconscious` is exactly 0 HP, and `dying`
 * stores the negative depth in `bleeding`. Both non-dead states can be revived by rest/cure.
 *
 * The temporary conditions (`asleep`/`held`/`coughing`/`feared`/`slowed`/`hasted`) carry a **duration** (rounds)
 * when inflicted by a spell — see {@link TacticalSpell.inflict}; the engine ticks them down each round
 * and clears them when they expire (and wakes `asleep` figures that take damage). AD&D-1e-standard
 * mechanism; the per-spell durations/HD-caps are ruleset data, not hardcoded here.
 */
export type TacticalStatusFlag =
  | 'asleep' | 'held' | 'coughing' | 'feared' | 'fled' | 'surrendered' | 'hasted' | 'slowed' | 'unconscious' | 'dying' | 'dead'
  | 'guarding';

/** The subset of status flags a spell can inflict on a target (the temporary, save-able conditions). */
export type InflictableStatus = 'asleep' | 'held' | 'coughing' | 'feared' | 'slowed' | 'hasted';

/** A combatant positioned on the battle grid. Extends the engine-neutral {@link Combatant}. */
export interface TacticalCombatant extends Combatant {
  pos: GridPos;
  /**
   * CoAB `actions.target` analogue: the figure's current tactical target intent, when the host/AI has
   * selected one. This is intentionally smaller than the original action struct; it exists so recovered
   * flows that clear target state (notably confirmed `Attack Ally:` NPC hostility conversion) have a
   * durable state slot to update and test.
   */
  actionTargetId?: string | null;
  /**
   * Combat-icon footprint in cells (CT.7f): `1` (default) = a **Small** 1×1 icon, `2` = a **Large** 2×2
   * icon (dragons, giants, ogres). `pos` is the **top-left** anchor of the block. Drives multi-cell
   * occupancy: a Large figure blocks four cells, melees/threatens from any of them, is shot at / caught by
   * an AoE if any cell is in range, and must fit its whole footprint to move there. Grounded in Gold Box's
   * Small/Large icon-size picker (byte-located, {@link footprintCells}); the 2×2 geometry is the standard
   * inference. Omit for an ordinary 1×1 figure.
   */
  size?: number;
  /** Which way the figure faces (for the sprite + future backstab logic). */
  facing: Facing;
  /** Movement allowance in **whole cells** per round (carried internally as `move × 2` half-steps). */
  move: number;
  /** Melee attacks per round (≥1; high-level fighters / multi-attack monsters get more). */
  attacksPerRound: number;
  /**
   * Hit Dice / level, used by HD-capped status spells (e.g. Sleep affects only ≤4 HD; CT.5a). Omit for
   * a figure with no HD data — it is then NOT cap-gated (treated as affectable), rather than the engine
   * inventing a value.
   */
  hd?: number;
  /**
   * Effective **cleric turning level** for turn-undead (CT.5b) — the caster's cleric/priest level, plus
   * any deity bonus (Majere = +2; see `deities.ts`). Omit for a figure that cannot turn undead (it is
   * then offered no Turn action). The level vs. an undead's {@link hd} drives the 1e turning table.
   */
  turnLevel?: number;
  /**
   * **Thief level** for backstab (CT.5c) — set for a thief (or multi-class with thief). A melee strike on
   * a foe from **behind** ({@link isBehindTarget}) gets +4 to hit and a damage **multiplier** scaling with
   * this level (×2 L1–4, ×3 L5–8, ×4 L9–12, ×5 L13+ — {@link backstabMultiplier}). Omit for a non-thief
   * (no backstab). Backstab itself is **byte-confirmed present** in CoK/DoK ("-Backstabs- (from behind)"
   * messages in GAME.OVR/START.EXE); only the multiplier magnitudes are 1e-inferred — see
   * `disasm-spells-krynn.md` §14.
   */
  backstabLevel?: number;
  /**
   * Attacks expressed in COAB **half-attacks** (`charStruct.attacksCount`, 0x11C): 2 = 1/round,
   * 3 = 3/2 (two swings, then one, on alternating rounds), 5 = 5/2, … When set this takes precedence
   * over {@link attacksPerRound}; leave undefined for a plain integer attack count.
   */
  halfAttacks?: number;
  /**
   * Stored initiative value (COAB `charStruct.initiative`, 0x1A5). Higher acts first; doubled while
   * `hasted`, halved while `slowed`. Rolled once at battle start when omitted — never re-rolled per
   * round.
   */
  initiative?: number;
  /** Weapons; index 0 is the default melee weapon. A missile weapon may follow. */
  weapons: Weapon[];
  /** Status flags that gate acting (asleep/held skip the turn; fled/surrendered remove the figure). */
  flags: Set<TacticalStatusFlag>;
  /**
   * CoAB `actions.bleeding`: only meaningful while `flags` contains `dying`. Starts as the HP-below-zero
   * depth (1..9), increments in `BattleRoundChecks`, and becomes `dead` when it passes 9.
   */
  bleeding?: number;
  /**
   * The d20 target this figure must roll **≥** to make a saving throw against a spell (lower = better
   * saver). Sourced from the ruleset's verified save tables (`addnd1e` `savingThrows()`, grounded in the
   * engine's own `SaveThrowValues`). Omit for a figure with no save data — it then never saves (full
   * effect), rather than the engine inventing a number.
   */
  save?: number;
  /**
   * Intelligence score, used only by the **morale break** branch (CT.6 / ovr010 `FleeCheck_001`): a
   * monster whose morale breaks **surrenders** when `int > 5` (smart enough to give up) and otherwise
   * **routs** (panics and flees). Omit for a figure with no Int data — the engine then falls back to its
   * legacy break model (personally-bloodied ⇒ flee, side-collapse-while-sound ⇒ surrender) rather than
   * inventing an Int. Party figures never check morale, so this is a monster field in practice.
   */
  int?: number;
  /**
   * Spells this figure has memorized and can cast in combat. The combat engine is **data-driven**: it
   * applies whatever range / dice / save-mode each {@link TacticalSpell} carries — the per-spell numbers
   * come from the ruleset layer (`addnd1e-dragonlance` `spellEffect()`), NOT hardcoded here. (The Krynn
   * games' own in-binary combat spell-damage formula is cross-overlay/UNLOCATED — see
   * `docs/engine/research/disasm-spells-krynn.md`; DQK is confirmed dice-based, so the 1e/COAB dice model
   * is the faithful baseline shared by camp casting.)
   */
  preparedSpells?: TacticalSpell[];
  /**
   * Legacy broad noxious-cloud immunity override. Prefer the source-shaped entry/exposure split below
   * when the caller knows the exact CoAB affect family.
   */
  noxiousCloudImmune?: boolean;
  /**
   * CoAB noxious-cloud movement gate immunity (`ovr010.cs:323-335`): affects that let a figure enter a
   * Stinking Cloud-style cell without the pre-move save/rejection. This is intentionally separate from
   * exposure immunity because `ovr024.in_poison_cloud` checks a narrower affect set after entry.
   */
  noxiousCloudEntryImmune?: boolean;
  /** CoAB noxious-cloud exposure immunity (`ovr024.cs:412-416`), after the figure is in the cloud. */
  noxiousCloudExposureImmune?: boolean;
  /**
   * Legacy broad poisonous-cloud immunity override. Prefer the source-shaped entry/exposure split below
   * when the caller knows the exact CoAB affect family.
   */
  poisonCloudImmune?: boolean;
  /** CoAB poisonous-cloud movement gate immunity (`ovr010.cs:340-348`) for low-HD figures. */
  poisonCloudEntryImmune?: boolean;
  /** Poisonous-cloud exposure immunity. No MON*SPC affect is mapped here until a source gate is proven. */
  poisonCloudExposureImmune?: boolean;
}

/** How a successful saving throw modifies a spell's effect on the target. */
export type SpellSaveMode = 'none' | 'half' | 'negate';

/** The footprint a spell covers around its aim point. */
export type SpellAreaShape = 'single' | 'burst' | 'line' | 'cone';

/** A dice expression for spell damage/healing; `perLevel` scales `count` by the caster's level. */
export interface SpellAmount {
  count: number;
  sides: number;
  bonus: number;
  perLevel?: boolean;
}

/**
 * A castable spell as the **tactical engine** sees it — pure data the engine applies mechanically. The
 * ruleset/UI layer builds these from `spellEffect()` so the numbers (range, dice, save mode) live with
 * the rules, keeping the combat engine free of hardcoded spell balance.
 */
export interface TacticalSpell {
  id: string;
  name: string;
  /** `enemy` = damage foes; `ally` = heal allies; `self` = the caster only. */
  target: 'enemy' | 'ally' | 'self';
  /** Max Chebyshev range from caster to aim point (cells). Omit/0 = touch/self. */
  range?: number;
  area: SpellAreaShape;
  /** Burst/cone radius in cells (Chebyshev) around the aim point. Default 0 = the single aim cell. */
  radius?: number;
  save: SpellSaveMode;
  /** Damage rolled per affected enemy (omit for non-damage spells). */
  damage?: SpellAmount;
  /** HP healed per affected ally (omit for non-heal spells). */
  heal?: SpellAmount;
  /** Persistent map zone created by the spell; host/map layers decide the exact terrain overlay. */
  zone?: { kind: 'stinking' | 'cloudkill' | string; rounds: number };
  /** Caster level, for `perLevel` dice scaling (e.g. Fireball 1d6/level). Default 1. */
  casterLevel?: number;
  /** Remaining casts; decremented on use, and the cast is rejected at 0. Omit = not slot-gated. */
  usesLeft?: number;
  /**
   * AI casting **priority** (ovr010 `sub_3560B`: the monster AI draws spells in descending priority,
   * 7 highest). The built-in AI's offensive-spell pick (CT.6) prefers the highest-priority castable
   * spell. Default 0 — engine-applied ordering only; not part of the spell's mechanical resolution.
   */
  priority?: number;
  /**
   * A status condition the spell inflicts on each affected target (CT.5a) — Sleep → `asleep`,
   * Hold Person → `held`, Fear → `feared`, Slow → `slowed`, Haste → `hasted`. Applied for `rounds`
   * rounds; a failed save (per the spell's {@link save} mode) avoids it (`negate`) — `half` is treated
   * as `negate` for a status (you either get the condition or you don't). `hdCap`, if set, makes the
   * status affect only targets whose {@link TacticalCombatant.hd} ≤ `hdCap` (Sleep's 4-HD rule). The
   * numbers (rounds / hdCap / which status) are ruleset data carried here, not hardcoded in the engine.
   */
  inflict?: { status: InflictableStatus; rounds: number; hdCap?: number };
}

/**
 * Per-cell movement-cost tiers, transcribed from COAB's `BackGroundTiles` table (Gbl.cs 193-268,
 * `combat-mechanics-coab.md` §2): the first field of each terrain entry is a movement cost where
 * `0xFF` = impassable, `0`/`1` = open/normal, `2` = difficult, `4` = very difficult. The tiers are
 * a COAB MAP (a sibling Gold Box game) — Champions/Death Knights of Krynn store their own per-tile
 * cost as tile DATA (the same DGROUP/data class as the UNLOCATED spell tables, not in the flat code
 * image), so the *values* are inferred-from-COAB + labelled, not byte-verified in the Krynn binaries.
 * `cost()` multiplies the half-step move price (orthogonal 2 / diagonal `diagCost`) by this factor;
 * `IMPASSABLE` callers should route through `blocked` instead (it removes the cell entirely).
 */
export const TERRAIN_COST = {
  OPEN: 1,
  DIFFICULT: 2,
  VERY_DIFFICULT: 4,
} as const;

/**
 * A battlefield **hazard zone** (CT.7b): a cell that subjects a figure entering it — or beginning its
 * turn in it — to a condition and/or damage. This is the engine extension point for the Krynn games'
 * area "cloud" spells (Stinking Cloud — a modelled CoK spell, CT.5a — Cloudkill, Ice Storm, Web), which
 * persist on the grid rather than resolving instantly. A figure with a `save` may resist (`save: true`
 * gives a per-exposure saving throw that negates the status). Durations/dice are 1e/Gold-Box-inferred +
 * labelled — the games' own zone-persistence code is cross-overlay/UNLOCATED, like the spell numbers.
 */
export interface TerrainHazard {
  /** Display/log kind (e.g. `'web'`, `'cloud'`). Free-form so the ruleset/UI can label it. */
  kind: string;
  /**
   * CoAB noxious-cloud movement gate: a figure attempting to ENTER this cell must pass a saving throw
   * or the step is rejected before movement/exposure. Immunity affects are ruleset/host data and are
   * not inferred here.
   */
  blocksEntryOnFailedSave?: boolean;
  /**
   * CoAB noxious-cloud exposure (`in_poison_cloud`): poison-save success inflicts `coughing` for one
   * round; failure inflicts helplessness (`held` here) for d4+1 rounds.
   */
  noxiousCloud?: boolean;
  /**
   * CoAB poisonous-cloud movement gate: a figure with `hd` below this threshold cannot choose to enter
   * the cloud. Undefined `hd` is treated as unknown and is not blocked.
   */
  blocksEntryBelowHd?: number;
  /**
   * CoAB Cloudkill exposure: HD 0-4 die with no save; HD 5 save at -4 or die; HD 6 save normally or die;
   * HD 7+ are unaffected by the poison routine. This is separate from generic `damage`.
   */
  cloudkillPoison?: boolean;
  /** Status inflicted on a figure caught here (e.g. `'held'` for web, `'slowed'` for a thicker cloud). */
  status?: InflictableStatus;
  /** Rounds the inflicted status lasts (≥1). */
  rounds?: number;
  /** Damage dealt on exposure (e.g. cloudkill/ice storm). Applied through the shared death rule. */
  damage?: SpellAmount;
  /** When true the figure rolls its saving throw to NEGATE the status (no save data ⇒ no save). */
  save?: boolean;
}

/** Terrain under the grid: which cells block movement / block line-of-fire, movement cost, and hazards. */
export interface TerrainGrid {
  width: number;
  height: number;
  /** True if a figure cannot enter this cell (a wall/obstacle). Default: never. */
  blocked?: (col: number, row: number) => boolean;
  /** True if this cell blocks missile/spell line-of-fire (e.g. a wall). Default: same as blocked. */
  blocksSight?: (col: number, row: number) => boolean;
  /** Movement cost to ENTER this cell (≥1; see {@link TERRAIN_COST}). Default: 1 (open ground). */
  cost?: (col: number, row: number) => number;
  /** A hazard zone occupying this cell, or undefined for safe ground (CT.7b). */
  hazard?: (col: number, row: number) => TerrainHazard | undefined;
}

/**
 * Which game generation's verified combat rules to apply. `gen1` = Champions/Death Knights of Krynn
 * (CoK/DoK), whose mechanics are confirmed against their own `GAME.OVR` binaries. `gen2` = The Dark
 * Queen of Krynn (DQK), the newer engine — see `docs/engine/research/disasm-combat-dqk.md`. Only the
 * mechanics that DQK's own code is VERIFIED to do differently are forked; everything still unproven for
 * DQK stays on the Gen1 path (documented at each fork) rather than being re-guessed.
 */
export type CombatRuleset = 'gen1' | 'gen2';

export interface TacticalOptions {
  seed?: number;
  /** Max rounds before the battle is declared a draw (stalemate guard). Default 60. */
  roundCap?: number;
  /** Game-generation rule set (default `gen1`). DQK passes `gen2`. */
  ruleset?: CombatRuleset;
  /**
   * Built-in AI target-selection policy (CT.6). `'random'` (default) is the **spec-faithful** original
   * behaviour — ovr010 `sub_35DB1` picks a target at random from the reachable in-range list
   * (`nearTargets[ roll_dice(nearTargets.Count,1) - 1 ]`); it does **not** concentrate fire. `'focus'`
   * is the modern "finish the weakest" policy (lowest-HP foe, nearest tie-break). Random draws consume
   * the injected RNG only when ≥2 candidates exist, so single-target situations stay deterministic.
   */
  aiTargeting?: 'random' | 'focus';
  /**
   * Host hook fired after the combat round counter advances, before status aging, initiative order
   * rebuild, and begin-turn hazard exposure. Used by source-recovered map overlays whose timed-affect
   * clock must expire before a new round's cloud checks.
   */
  onRoundStart?: (round: number) => void;
}

export type TacticalActionType = 'move' | 'melee' | 'missile' | 'cast' | 'turn' | 'bandage' | 'guard' | 'wait' | 'delay' | 'flee' | 'endTurn';

export interface TacticalAction {
  type: TacticalActionType;
  /** Destination cell (move/flee) or aim point (cast AoE). Must be reachable / in range. */
  to?: GridPos;
  /** Target combatant id (melee/missile, or a single-target cast). */
  targetId?: string;
  /** Explicitly allow melee/missile against a same-side target after a host/UI confirmation. */
  allowAlly?: boolean;
  /** Spell id to cast (cast). Must be one of the actor's `preparedSpells` with a use left. */
  spellId?: string;
}

export type TacticalEventType =
  | 'move' | 'attack' | 'cast' | 'turn' | 'slain' | 'stand-up' | 'side-change' | 'flee' | 'party-flee' | 'bandage' | 'guard' | 'wait' | 'delay' | 'status' | 'hazard' | 'regen' | 'end';

export interface TacticalEvent {
  round: number;
  type: TacticalEventType;
  actor?: string;
  target?: string;
  /** Attack: the d20 roll, the number needed, hit flag, damage, and whether it was a missile. */
  roll?: number;
  needed?: number;
  hit?: boolean;
  missile?: boolean;
  damage?: number;
  targetHpAfter?: number;
  /** Slain: true if the blow was lethal (permadeath, 10+ HP below zero); false = merely downed. */
  dead?: boolean;
  /** Dying/bleeding counter copied from CoAB `actions.bleeding` when relevant. */
  bleeding?: number;
  /** Move/flee: the path of cells walked (excluding the start cell). */
  path?: GridPos[];
  /** Cast: the spell id, and (per affected target) whether the target made its saving throw + HP healed. */
  spellId?: string;
  saved?: boolean;
  healed?: number;
  /** Status (CT.5a): the condition inflicted on `target` (cast `inflict`) or that expired (`type:'status'`). */
  inflicted?: InflictableStatus;
  /** Status expiry: true when a `type:'status'` event reports a condition wearing off (else it was inflicted). */
  expired?: boolean;
  /** Attack: true when the target was helpless (asleep/held) so the blow auto-hit (CT.5a). */
  helpless?: boolean;
  /**
   * Attack/slain: true when a melee blow on a helpless (asleep/held) foe was a **coup de grace** — it
   * slays outright ("slays helpless … with one cruel blow", byte-located gen1; CT.7j). Gen1-only.
   */
  coupDeGrace?: boolean;
  /** Attack: true when the blow was a thief backstab (from behind: +4 to hit, multiplied damage — CT.5c). */
  backstab?: boolean;
  /** Attack: true when the (melee) blow came from the target's rear arc — rear/flank AC applied (CT.7a). */
  rear?: boolean;
  /** Attack: the missile shot's range band (short/medium/long) whose to-hit modifier was applied (CT.7c). */
  rangeBracket?: RangeBracket;
  /** Attack: true when the blow was a free/reaction strike outside the actor's normal attack action. */
  opportunity?: boolean;
  /** Attack: true when the blow was triggered before a foe moved out of melee reach. */
  leaving?: boolean;
  /** Guard: true when the `guard` event readied the figure (it is now Guarding) rather than passing (CT.7d). */
  guarding?: boolean;
  /** Side-change: old/new side when CoAB-style confirmed ally attack makes an NPC ally hostile. */
  fromSide?: CombatSide;
  toSide?: CombatSide;
  /** Turn-undead (CT.5b): per affected undead `target`, whether it was turned (flees) or destroyed. */
  turned?: boolean;
  destroyed?: boolean;
  /** Morale (CT.6): set on the `status`(feared)/`flee` event a monster's broken morale produced. */
  morale?: boolean;
  /** Morale (CT.6): true on a `flee` event when the monster gave up (surrendered) rather than ran. */
  surrendered?: boolean;
  /** Hazard (CT.7b): the kind of hazard zone (`'web'`/`'cloud'`/…) a `type:'hazard'` event reports. */
  hazard?: string;
  /** Party-flee (CT.7g): on a `type:'party-flee'` event, true = the party **Got Away**, false = **Escape is blocked**. */
  escaped?: boolean;
  /** End (CT.7g): true when the battle ended because the **party fled** (a withdraw, not a win or a loss). */
  fled?: boolean;
  outcome?: CombatOutcome;
}

export interface TacticalResult {
  outcome: CombatOutcome;
  rounds: number;
  log: TacticalEvent[];
  survivors: TacticalCombatant[];
  xpAwarded: number;
  /** True when the encounter ended by the party **fleeing** (CT.7g) — `outcome` is `'draw'` but it was a withdraw. */
  fled?: boolean;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────────────────────────

/** Chebyshev ("king move") distance — Gold Box treats a diagonal as one square, so this is range. */
export function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/**
 * The grid cells a `size`×`size` figure occupies, anchored at `pos` as its **top-left** cell (CT.7f).
 * `size ≤ 1` → the single anchor cell; `size = 2` → the 2×2 block a **Large** combat icon fills. Gold
 * Box's character/monster icon editor distinguishes **Small** vs **Large** icons (the `Small`/`Large`
 * strings are byte-located in CoK `GAME.OVR` @0x2423a/0x24240 and DoK `START.EXE` @0xebaa/0xebb0, beside
 * `Is this icon ok?`), so a two-tier footprint is grounded in the originals; the **2×2 geometry** of a
 * Large icon is the Gold-Box-standard inference (the exact occupancy math is cross-overlay/UNLOCATED) —
 * see `disasm-spells-krynn.md` §20.
 */
export function footprintCells(pos: GridPos, size = 1): GridPos[] {
  const n = Math.max(1, Math.floor(size));
  if (n === 1) return [{ col: pos.col, row: pos.row }];
  const cells: GridPos[] = [];
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) cells.push({ col: pos.col + dc, row: pos.row + dr });
  return cells;
}

/**
 * Chebyshev distance between two **footprints** — the minimum over every cell pair (CT.7f). For two 1×1
 * figures this is plain {@link chebyshev}; for a Large (2×2) figure it lets any of its cells reach/threaten,
 * so a big monster melees from — and is shot at — its nearest occupied square, not just its anchor.
 */
export function footprintDistance(aPos: GridPos, aSize: number, bPos: GridPos, bSize: number): number {
  let best = Infinity;
  for (const a of footprintCells(aPos, aSize)) {
    for (const b of footprintCells(bPos, bSize)) {
      const d = chebyshev(a, b);
      if (d < best) best = d;
    }
  }
  return best;
}

const samePos = (a: GridPos, b: GridPos): boolean => a.col === b.col && a.row === b.row;

/**
 * Cells reachable from `start` within `budget` movement points, as a `"col,row" → cost` map (the
 * start cell is included at cost 0). Dijkstra over 8-neighbours.
 *
 * **Costs and the budget are in half-steps** (so the engine passes `move × 2`): entering a cell
 * orthogonally costs `2 × terrainCost`, diagonally `diagCost × terrainCost`. `diagCost` defaults to **4**
 * — a diagonal costs 2× an orthogonal step (Manhattan / no diagonal discount), which is **VERIFIED
 * against Champions of Krynn's own movement code** (RE.5/RE.6: the diagonal handler at GAME.OVR file
 * `0x118D8` deducts 4 from the budget and both axis counters, with no `3` anywhere on movement — a full
 * census of CoK's reconstructed call graph confirms it; see `disasm-combat-cok.md` §9). Pass `diagCost
 * = 3` for the COAB "5-10-15" 1.5× rule (every diagonal = 1.5 cells) — used by the DQK `gen2` ruleset,
 * whose own diagonal cost is UNLOCATED and kept provisionally at 1.5×. Cells that are blocked terrain or
 * occupied by a `blockedCells` member are not traversable. Small battle grids make the plain O(N²)
 * frontier scan more than fast enough.
 */
export function reachableCells(
  start: GridPos,
  budget: number,
  terrain: TerrainGrid,
  blockedCells: ReadonlySet<string>,
  diagCost = 4,
  moverSize = 1,
): Map<string, number> {
  const key = (c: number, r: number): string => `${c},${r}`;
  const dist = new Map<string, number>([[key(start.col, start.row), 0]]);
  const cost = terrain.cost ?? (() => 1);
  const blocked = terrain.blocked ?? (() => false);
  // CT.7f — a Large (>1 cell) mover may only enter an anchor whose WHOLE footprint is in-bounds, on
  // passable terrain, and clear of other bodies. For a 1×1 mover this reduces to the single-cell test.
  const fits = (c: number, r: number): boolean => {
    for (const cell of footprintCells({ col: c, row: r }, moverSize)) {
      if (cell.col < 0 || cell.row < 0 || cell.col >= terrain.width || cell.row >= terrain.height) return false;
      if (blocked(cell.col, cell.row)) return false;
      if (blockedCells.has(key(cell.col, cell.row))) return false;
    }
    return true;
  };
  // Frontier of settled-but-unexpanded nodes; re-scan for the cheapest each step (grids are tiny).
  const open = new Set<string>([key(start.col, start.row)]);
  while (open.size > 0) {
    let bestKey: string | null = null;
    let bestCost = Infinity;
    for (const k of open) {
      const d = dist.get(k)!;
      if (d < bestCost) { bestCost = d; bestKey = k; }
    }
    if (bestKey === null) break;
    open.delete(bestKey);
    const [bc, br] = bestKey.split(',').map(Number) as [number, number];
    for (const [dc, dr] of DIR8) {
      const nc = bc + dc;
      const nr = br + dr;
      if (!fits(nc, nr)) continue; // out of bounds / blocked terrain / a body in the footprint
      const nk = key(nc, nr);
      const diagonal = dc !== 0 && dr !== 0;
      const step = bestCost + (diagonal ? diagCost : 2) * Math.max(1, cost(nc, nr));
      if (step > budget) continue;
      if (step < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, step);
        open.add(nk);
      }
    }
  }
  return dist;
}

/**
 * Cheapest deterministic path from `start` to any anchor whose full mover footprint is within
 * `range` of the target footprint. Unlike a greedy distance step, this can begin with an equal or
 * longer-looking detour around a wall. It uses the same terrain, body-blocking, footprint, and
 * half-step costs as {@link reachableCells}; a sealed target returns `null` rather than tunnelling.
 */
export function shortestPathToFootprintRange(
  start: GridPos,
  terrain: TerrainGrid,
  blockedCells: ReadonlySet<string>,
  target: GridPos,
  targetSize: number,
  range: number,
  diagCost = 4,
  moverSize = 1,
): GridPos[] | null {
  const key = (c: number, r: number): string => `${c},${r}`;
  const startKey = key(start.col, start.row);
  const dist = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const cost = terrain.cost ?? (() => 1);
  const blocked = terrain.blocked ?? (() => false);
  const fits = (c: number, r: number): boolean => {
    for (const cell of footprintCells({ col: c, row: r }, moverSize)) {
      if (cell.col < 0 || cell.row < 0 || cell.col >= terrain.width || cell.row >= terrain.height) return false;
      if (blocked(cell.col, cell.row) || blockedCells.has(key(cell.col, cell.row))) return false;
    }
    return true;
  };
  const open = new Set<string>([startKey]);
  let goalKey: string | null = null;
  while (open.size > 0) {
    let bestKey: string | null = null;
    let bestCost = Infinity;
    let bestCol = Infinity;
    let bestRow = Infinity;
    for (const candidate of open) {
      const d = dist.get(candidate)!;
      const [col, row] = candidate.split(',').map(Number) as [number, number];
      if (d < bestCost || (d === bestCost && (row < bestRow || (row === bestRow && col < bestCol)))) {
        bestKey = candidate;
        bestCost = d;
        bestCol = col;
        bestRow = row;
      }
    }
    if (bestKey === null) break;
    open.delete(bestKey);
    if (footprintDistance({ col: bestCol, row: bestRow }, moverSize, target, targetSize) <= range) {
      goalKey = bestKey;
      break;
    }
    for (const [dc, dr] of DIR8) {
      const nc = bestCol + dc;
      const nr = bestRow + dr;
      if (!fits(nc, nr)) continue;
      const nk = key(nc, nr);
      const diagonal = dc !== 0 && dr !== 0;
      const nextCost = bestCost + (diagonal ? diagCost : 2) * Math.max(1, cost(nc, nr));
      if (nextCost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nextCost);
        previous.set(nk, bestKey);
        open.add(nk);
      }
    }
  }
  if (goalKey === null) return null;
  const path: GridPos[] = [];
  for (let cursor = goalKey; cursor !== startKey;) {
    const [col, row] = cursor.split(',').map(Number) as [number, number];
    path.unshift({ col, row });
    const prior = previous.get(cursor);
    if (prior === undefined) return null;
    cursor = prior;
  }
  return path;
}

/**
 * The cells a Bresenham line from `a` to `b` passes THROUGH (exclusive of both endpoints). Used to
 * test missile/spell line-of-fire: a shot is blocked if any of these cells blocks sight or is
 * occupied by a living figure.
 */
export function lineCells(a: GridPos, b: GridPos): GridPos[] {
  const cells: GridPos[] = [];
  let x0 = a.col, y0 = a.row;
  const x1 = b.col, y1 = b.row;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!(x0 === a.col && y0 === a.row) && !(x0 === x1 && y0 === y1)) cells.push({ col: x0, row: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return cells;
}

function facingTo(from: GridPos, to: GridPos): Facing {
  const dc = Math.sign(to.col - from.col);
  const dr = Math.sign(to.row - from.row);
  const idx = DIR8.findIndex(([c, r]) => c === dc && r === dr);
  return (idx >= 0 ? idx : 0) as Facing;
}

/**
 * **Backstab damage multiplier** for a thief of the given level (AD&D-1e, CT.5c). The Krynn backstab
 * feature itself is byte-confirmed in the gen1 binaries ("-Backstabs- (from behind)" — CoK GAME.OVR
 * ~0x14fe3, DoK START.EXE ~0xe2d8); these magnitudes are the standard 1e table (the DGROUP table that
 * holds them stays cross-overlay UNLOCATED, so they are 1e-inferred — see `disasm-spells-krynn.md` §14).
 *
 * ×2 at L1–4, ×3 at L5–8, ×4 at L9–12, ×5 at L13+.
 */
export function backstabMultiplier(thiefLevel: number): number {
  if (thiefLevel >= 13) return 5;
  if (thiefLevel >= 9) return 4;
  if (thiefLevel >= 5) return 3;
  return 2;
}

/**
 * To-hit bonus for a **melee strike from a foe's rear arc** when the defender carries no explicit
 * {@link TacticalCombatant.rearAc} (CT.7a). AD&D-1e: attacking from behind negates the defender's shield
 * and Dexterity AC — a net **+2 to hit**. 1e-inferred + labelled: the Krynn attack code is positional
 * (CoK facing field 0x10A + the "(from behind)" message are byte-located) but the rear-AC magnitude lives
 * behind the cross-overlay to-hit call (UNLOCATED); COAB's separate `ac_behind` (0x19B) is the sibling MAP.
 */
const REAR_TO_HIT_BONUS = 2;

/**
 * True when `attackerPos` lies in `target`'s **rear arc** — the three cells opposite the way the target
 * faces — the positional precondition for a thief backstab ("from behind"). Uses the target's {@link Facing}
 * and the bearing from the target to the attacker; allows the exact-rear direction ±1 (a 3-cell arc).
 */
export function isBehindTarget(targetFacing: Facing, targetPos: GridPos, attackerPos: GridPos): boolean {
  const bearing = facingTo(targetPos, attackerPos);
  const rear = ((targetFacing + 4) % 8) as Facing;
  const diff = Math.min((bearing - rear + 8) % 8, (rear - bearing + 8) % 8);
  return diff <= 1;
}

/** A missile shot's distance band relative to the weapon's max range (CT.7c). */
export type RangeBracket = 'short' | 'medium' | 'long';

/**
 * Which range band a missile shot of `dist` cells falls in for a weapon of `maxRange` cells (CT.7c). The
 * Gold Box / AD&D-1e model splits a weapon's range into thirds: **short** (point-blank … ⅓), **medium**
 * (⅓ … ⅔), **long** (beyond ⅔, up to max). Boundaries use `maxRange/3` and `2·maxRange/3`; a shot at or
 * inside the short cutoff is short, beyond the long cutoff is long. `maxRange ≤ 0` (no real range) ⇒ short.
 */
export function missileRangeBracket(dist: number, maxRange: number): RangeBracket {
  if (maxRange <= 0) return 'short';
  if (dist <= maxRange / 3) return 'short';
  if (dist > (2 * maxRange) / 3) return 'long';
  return 'medium';
}

/**
 * The to-hit modifier (added to the attacker's effective bonus, i.e. SUBTRACTED from the d20 "needed")
 * for a missile shot in each range band (CT.7c): **short +1, medium 0, long −2**.
 *
 * **RE-gate (honest):** CoK's combat *is* range-aware — the targeting UI prints **`Range = N`** to the
 * player (string byte-located in `GAME.OVR` @0x17d5a/0x1810e) and has a **`Cannot target `** restriction
 * (@0x1708b), so the engine computes shot distance. But the code that turns the range into a to-hit
 * modifier is cross-overlay (the string xref resolves to none in-segment, the recurring VROOMM wall), and
 * the bracket magnitudes themselves live in COAB's item data (seg600 ~0x5D10, UNLOCATED even there). So the
 * **+1/0/−2 values are the AD&D-1e / Gold-Box-community standard, labelled inferred** — the same policy as
 * the spell/turn/backstab/rear-AC numbers. See `combat-mechanics-coab.md` §6, `disasm-spells-krynn.md` §17.
 */
export function rangeBracketToHit(bracket: RangeBracket): number {
  return bracket === 'short' ? 1 : bracket === 'long' ? -2 : 0;
}

// ── Engine ─────────────────────────────────────────────────────────────────────────────────────

export interface TacticalCombat {
  readonly combatants: TacticalCombatant[];
  readonly terrain: TerrainGrid;
  readonly log: TacticalEvent[];
  round(): number;
  isOver(): boolean;
  /** CoAB `area2_ptr.field_666`: set once a same-side attack is explicitly confirmed. */
  allyAttackConfirmed(): boolean;
  /** CoAB `CountCombatTeamMembers()` analogue: active party/enemy counts after side changes/removals. */
  teamCounts(): { party: number; enemy: number };
  /** CoAB `actions.target` analogue for `id`, or null when no current target intent is retained. */
  targetIntentOf(id: string): string | null;
  /** The combatant whose turn it is (null when over). */
  current(): TacticalCombatant | null;
  /** Movement the current actor has left this turn, in **whole cells** (gen1 diagonals cost 2, gen2 1.5). */
  movementLeft(): number;
  /** Has the current actor used its attack/action this turn? */
  hasActed(): boolean;
  /** Cells the current actor can still reach this turn (`"col,row" → path cost in half-steps`). */
  reachable(): Map<string, number>;
  /** Foes the current actor could melee right now (in reach), in stable order. */
  meleeTargets(): TacticalCombatant[];
  /** Foes the current actor could shoot right now (missile weapon, in range, clear line), stable. */
  missileTargets(): TacticalCombatant[];
  /** Legal actions for the current actor at this instant. */
  legalActions(): TacticalAction[];
  /** True when the current actor is a cleric/turner with undead foes in turning reach (CT.5b). */
  canTurnUndead(): boolean;
  /** True when the current party actor can bandage the first dying party member (CoAB `bandage(true)`). */
  canBandage(): boolean;
  /**
   * True when the current actor is a thief positioned to backstab `targetId` right now — a melee foe
   * in reach that the actor stands behind ({@link isBehindTarget}). With no `targetId`, true if **any**
   * in-reach foe could be backstabbed. Drives the UI "Backstab!" hint (CT.5c).
   */
  canBackstab(targetId?: string): boolean;
  /**
   * True when the current actor stands in `targetId`'s **rear arc** — a melee strike would get the rear/
   * flank AC advantage (CT.7a). Unlike {@link canBackstab} this is for ANY attacker, driving a UI hint.
   */
  isBehind(targetId: string): boolean;
  /** The hazard zone occupying a cell (web/cloud), or undefined for safe ground (CT.7b). */
  hazardAt(col: number, row: number): TerrainHazard | undefined;
  /**
   * The range band (short/medium/long) the current actor's missile weapon would hit `targetId` in, or
   * null if it has no missile weapon (CT.7c). Drives the "(long range)" UI hint.
   */
  missileBracket(targetId: string): RangeBracket | null;
  /** True when `id` is in the readied **Guard** stance — it will strike the first foe to enter reach (CT.7d). */
  isGuarding(id: string): boolean;
  /** True when the current actor may **Delay** — defer its turn later this round (start-of-turn only; CT.7e). */
  canDelay(): boolean;
  /**
   * True when this ruleset's **coup de grace** is active — a melee blow on a helpless (asleep/held) foe
   * slays it outright ("slays helpless … with one cruel blow", byte-located gen1; CT.7j). Gen1 → true,
   * gen2 (DQK, unverified) → false. A pure ruleset predicate (drives the UI hint / e2e seam).
   */
  slaysHelpless(): boolean;
  /** Footprint size of `id` in cells (1 = Small 1×1, 2 = Large 2×2; CT.7f) — for multi-cell sprite rendering. */
  sizeOf(id: string): number;
  /**
   * Post-battle condition of `id` for roster bring-up (CT.7h): `'dead'` = slain (permadeath, the gen1
   * 10+ HP-below-zero rule — needs Raise Dead), `'unconscious'` = recoverable downed state
   * (`unconscious` at 0 HP or source-shaped `dying` with `bleeding`, both revivable by rest/cure), `'ok'` =
   * still standing. Drives carry-over of the dead-vs-down distinction to the exploration roster.
   */
  conditionOf(id: string): 'ok' | 'unconscious' | 'dead';
  /** True when the whole party could flee the field right now — every living member can reach a border (CT.7g). */
  partyCanEscape(): boolean;
  /**
   * Attempt a **party-wide flee** (CT.7g). Returns the `party-flee` event (`escaped` = Got Away vs Escape is
   * blocked) and, on success, the `end` event — the battle ends as a withdraw (`outcome:'draw'`, `fled`).
   */
  attemptPartyFlee(): TacticalEvent[];
  /** What the built-in AI would do for the current actor (also drives auto-resolve). */
  aiAction(): TacticalAction;
  /** Apply an action for the current actor; returns the events it produced and advances state. */
  apply(action: TacticalAction): TacticalEvent[];
  /** Resolve the whole battle with the AI acting for every combatant; returns the final result. */
  finish(): TacticalResult;
  result(): TacticalResult;
}

const foeSideOf = (c: TacticalCombatant): CombatSide => (c.side === 'party' ? 'enemy' : 'party');
const isActive = (c: TacticalCombatant): boolean => c.hp > 0 && !c.flags.has('fled') && !c.flags.has('surrendered');
const posKey = (p: GridPos): string => `${p.col},${p.row}`;

/** Stored initiative, doubled while hasted, halved while slowed (COAB `calc_group_inituative`). */
function effectiveInitiative(c: TacticalCombatant): number {
  let v = c.initiative ?? 0;
  if (c.flags.has('hasted')) v *= 2;
  else if (c.flags.has('slowed')) v = Math.floor(v / 2);
  return v;
}

/** How a monster's morale breaks (CT.6): `flee` (it runs) / `surrender` (it gives up) / null (it holds). */
export type MoraleBreak = 'flee' | 'surrender' | null;

/** Morale score is a percentage clamped to 102 — CoK `morale_check` clamps `(control_morale&0x7F)*2` to 0x66. */
const MORALE_CLAMP = 102;
/** How many rounds a morale-broken monster keeps fleeing (1e-inferred; the rout duration is UNLOCATED). */
const MORALE_FLEE_ROUNDS = 3;
/** d20 save-target at/under which the monster AI predicts a foe will make its save (ovr010 spell skip). */
const AI_SAVE_LIKELY = 10;

/** Percent of its HP a figure has lost: `100 − HP·100/maxHP` (CoK `morale_check`'s `percent_wounded`). */
function pctLost(c: TacticalCombatant): number {
  const maxHp = c.maxHp || c.hp;
  return maxHp > 0 ? Math.round((1 - Math.max(0, c.hp) / maxHp) * 100) : 0;
}

/** Outcome of consulting the turn-undead table for one undead: destroy / auto-turn / a d20 target / no effect. */
export type TurnOutcome = 'destroy' | 'turn' | 'none' | number;

/**
 * The AD&D-1e **turn-undead** table (CT.5b), as the canonical d20 matrix: a cleric of `clericLevel`
 * vs. undead of `undeadHd` Hit Dice. The published 1e table is perfectly regular — across a row each
 * stronger undead adds **+3** to the d20 target; each cleric level subtracts **3** — so it collapses to
 * the closed form `t = 10 + 3·HD − 3·level` (verified to reproduce the PHB cells: L1 vs 1HD = 10, L1 vs
 * 2HD = 13, L3 vs 1HD = 4, L4 vs 1HD = auto-turn, L6 vs 1HD = destroy). The hardest still-possible cell
 * needs a natural 20; beyond that the undead is unaffectable.
 *
 * **RE-gate (honest):** the Krynn games' OWN turning table is **UNLOCATED** — a DGROUP data table, not
 * addressable by the flat code-offset disasm tools (a byte scan of CoK/DoK `GAME.OVR` for the 4/7/10/13/
 * 16/19/20 sequence found nothing), exactly like the gen1 spell/save tables (see
 * `disasm-spells-krynn.md` §12, which also notes undead-immunity is UNLOCATED). So this is the **standard
 * 1e table, labelled inferred** — the same faithful-baseline policy used for the spell geometry (CT.4b)
 * and status durations (CT.5a). Undead HD is used directly as the table's "type" column.
 */
export function turnUndeadOutcome(clericLevel: number, undeadHd: number): TurnOutcome {
  const hd = Math.max(1, Math.floor(undeadHd));
  const lvl = Math.max(1, Math.floor(clericLevel));
  const t = 10 + 3 * hd - 3 * lvl; // d20 target (≡ 1 mod 3 for integer HD/level)
  if (t <= 3) return t <= -3 ? 'destroy' : 'turn'; // {1,−2} auto-turn band, then destroy
  if (t <= 19) return t;                            // need d20 ≥ t
  if (t <= 22) return 20;                           // hardest case: a natural 20
  return 'none';                                    // beyond the table → cannot be affected
}

/** Max range (cells, Chebyshev) at which a cleric's turning reaches undead. 1e-inferred (line of sight). */
const TURN_RANGE = 12;
/** How many rounds a *turned* (not destroyed) undead flees. 1e-inferred (turned undead flee ~3+ rounds). */
const TURN_FLEE_ROUNDS = 3;

export function createTacticalCombat(
  combatants: TacticalCombatant[],
  terrain: TerrainGrid,
  opts: TacticalOptions = {},
): TacticalCombat {
  const rng = new Rng(opts.seed ?? 0x1234);
  const roundCap = opts.roundCap ?? 60;
  const ruleset: CombatRuleset = opts.ruleset ?? 'gen1';
  // Diagonal movement cost in half-steps. Gen1 (CoK/DoK) = 4 (2×, Manhattan) — VERIFIED against CoK's
  // own GAME.OVR (RE.6; file 0x118D8 deducts 4, no `3` on movement anywhere). Gen2 (DQK) keeps the COAB
  // 1.5× (3) provisionally — DQK's own diagonal cost is UNLOCATED (plausibly the newer engine's refinement).
  const diagCost = ruleset === 'gen2' ? 3 : 4;
  // CT.6 — AI target policy. 'random' (default) matches the original ovr010 random in-reach pick; 'focus'
  // keeps the "finish the weakest" modern behaviour. See TacticalOptions.aiTargeting.
  const aiTargeting: 'random' | 'focus' = opts.aiTargeting ?? 'random';
  const log: TacticalEvent[] = [];

  let round = 0;
  let order: TacticalCombatant[] = [];
  let oidx = 0;
  let over = false;
  let xpAwarded = 0;
  let partyFled = false; // CT.7g — the battle ended because the party withdrew (Got Away), not a win/loss.
  let allyAttackConfirmedFlag = false;

  // Per-turn state for the actor at order[oidx].
  let moveLeft = 0; // in half-steps (orthogonal = 2, diagonal = diagCost); = actor.move × 2 at turn start.
  let acted = false;
  let forcedFlee = false; // morale broke for this (monster) actor → AI must flee this turn.
  // CT.7e — ids that have already used Delay this round (a figure may defer its turn at most once per
  // round, so it can't loop forever). Cleared at the start of each round.
  const delayedThisRound = new Set<string>();

  // CT.5a — remaining rounds for each combatant's temporary status conditions (asleep/held/feared/
  // slowed/hasted). Keyed by combatant id → status → rounds left. Decremented at each round start; a
  // condition is cleared (and a `status` expiry event emitted) when it hits 0. AD&D-1e-standard mechanism.
  const statusTimers = new Map<string, Map<InflictableStatus, number>>();

  /** Inflict `status` on `target` for `rounds` rounds (sets the flag + records the timer). */
  function inflictStatus(target: TacticalCombatant, status: InflictableStatus, rounds: number): void {
    target.flags.add(status);
    let m = statusTimers.get(target.id);
    if (!m) { m = new Map(); statusTimers.set(target.id, m); }
    m.set(status, Math.max(1, Math.floor(rounds)));
  }

  /** Clear `status` from `target` immediately (e.g. a slept figure waking when struck). */
  function clearStatus(target: TacticalCombatant, status: InflictableStatus): void {
    target.flags.delete(status);
    statusTimers.get(target.id)?.delete(status);
  }

  /**
   * M23.S2 — COAB `BattleRoundChecks`'s `CheckType.Type_19` sweep: any figure carrying the innate
   * `regen_3_hp` special (`regenPerRound`, from its `MON{n}SPC.DAX` side-table) heals that many HP at
   * the start of every round it's active, capped at max HP. Ticks alongside {@link tickStatuses} at
   * round start, before initiative order is built.
   */
  function tickRegen(): void {
    for (const c of combatants) {
      if (!isActive(c) || !c.regenPerRound || c.hp >= c.maxHp) continue;
      c.hp = Math.min(c.maxHp, c.hp + c.regenPerRound);
      log.push({ round, type: 'regen', target: c.id, healed: c.regenPerRound, targetHpAfter: c.hp });
    }
  }

  /** Tick every active timer down a round; clear expired conditions and log their wear-off. */
  function tickStatuses(): void {
    for (const c of combatants) {
      const m = statusTimers.get(c.id);
      if (!m) continue;
      for (const [status, left] of [...m]) {
        const next = left - 1;
        if (next <= 0) {
          m.delete(status);
          if (c.flags.has(status)) {
            c.flags.delete(status);
            log.push({ round, type: 'status', target: c.id, inflicted: status, expired: true });
          }
        } else {
          m.set(status, next);
        }
      }
    }
  }

  /**
   * CoAB `BattleRoundChecks` (`ovr009.cs:371-381`): fallen `dying` figures keep bleeding while out of
   * the active turn order. `actions.bleeding` starts as the HP below zero in `damage_player`; every new
   * combat round increments it, and `> 9` promotes the figure to permanent `dead`.
   */
  function tickDyingBleeding(): void {
    if (ruleset === 'gen2') return;
    for (const c of combatants) {
      if (!c.flags.has('dying') || c.flags.has('dead')) continue;
      const next = Math.max(1, c.bleeding ?? Math.max(1, -c.hp)) + 1;
      c.bleeding = next;
      log.push({ round, type: 'status', target: c.id, bleeding: next });
      if (next > 9) {
        c.flags.delete('dying');
        c.flags.delete('unconscious');
        c.flags.add('dead');
        c.hp = Math.min(0, c.hp);
        log.push({ round, type: 'slain', target: c.id, dead: true, bleeding: next });
      }
    }
  }

  /**
   * CT.7b — subject `c` to the hazard zone (web/cloud) on its current cell, if any. Fired when a figure
   * **enters** a hazard cell (the end of a move/flee) and when it **begins its turn** standing in one, so
   * a lingering cloud re-applies each round the figure stays. A `save: true` hazard lets a figure with
   * save data negate the *status* (per-exposure d20 ≥ its `save`); `damage` always lands (through the
   * shared death rule). Emits a `hazard` event (+ a `slain` event if the damage downs the figure).
   * Faithful note: a figure only walking *through* a hazard cell isn't caught — exposure is on ending in
   * or starting in it (the games' own zone-persistence code is cross-overlay/UNLOCATED; this is the
   * 1e/Gold-Box-inferred model, labelled).
   */
  function passesSavingThrow(c: TacticalCombatant, penalty = 0): boolean {
    return c.save !== undefined && rng.die(20) + (c.conSaveBonus ?? 0) + penalty >= c.save;
  }

  function ignoresNoxiousCloudEntry(c: TacticalCombatant): boolean {
    return c.noxiousCloudImmune === true || c.noxiousCloudEntryImmune === true;
  }

  function ignoresNoxiousCloudExposure(c: TacticalCombatant): boolean {
    return c.noxiousCloudImmune === true || c.noxiousCloudExposureImmune === true;
  }

  function ignoresPoisonCloudEntry(c: TacticalCombatant): boolean {
    return c.poisonCloudImmune === true || c.poisonCloudEntryImmune === true;
  }

  function ignoresPoisonCloudExposure(c: TacticalCombatant): boolean {
    return c.poisonCloudImmune === true || c.poisonCloudExposureImmune === true;
  }

  function applyHazardTo(c: TacticalCombatant, trigger: 'begin-turn' | 'entry' = 'entry'): TacticalEvent[] {
    if (!isActive(c)) return [];
    const haz = terrain.hazard?.(c.pos.col, c.pos.row);
    if (!haz) return [];
    const events: TacticalEvent[] = [];
    if (haz.cloudkillPoison && !ignoresPoisonCloudExposure(c)) {
      const hd = Math.floor(c.hd ?? 7);
      let killed = false;
      if (hd <= 4) killed = true;
      else if (hd === 5) killed = !passesSavingThrow(c, -4);
      else if (hd === 6) killed = !passesSavingThrow(c);
      if (killed) {
        const before = Math.max(1, c.hp);
        c.hp = 0;
        c.flags.delete('dying');
        c.flags.delete('unconscious');
        c.flags.add('dead');
        c.bleeding = undefined;
        if (c.side === 'enemy') xpAwarded += c.xp ?? 0;
        events.push({ round, type: 'hazard', target: c.id, hazard: haz.kind, damage: before, targetHpAfter: 0 });
        events.push({ round, type: 'slain', target: c.id, dead: true });
      }
    }
    if (!isActive(c)) {
      log.push(...events);
      return events;
    }
    if (trigger === 'entry' && haz.noxiousCloud && isActive(c) && !c.flags.has('held') && !ignoresNoxiousCloudExposure(c)) {
      const saved = passesSavingThrow(c);
      const inflicted: InflictableStatus = saved ? 'coughing' : 'held';
      const rounds = saved ? 1 : rng.die(4) + 1;
      inflictStatus(c, inflicted, rounds);
      events.push({ round, type: 'hazard', target: c.id, hazard: haz.kind, inflicted, saved: saved || undefined });
    }
    if (haz.damage) {
      const dmg = Math.max(1, rng.roll(haz.damage.count, haz.damage.sides, haz.damage.bonus));
      const dead = applyHpLoss(c, dmg);
      events.push({ round, type: 'hazard', target: c.id, hazard: haz.kind, damage: dmg, targetHpAfter: Math.max(0, c.hp) });
      if (c.hp <= 0) events.push({ round, type: 'slain', target: c.id, dead });
    }
    if (haz.status && isActive(c)) {
      const saved = haz.save === true && passesSavingThrow(c);
      if (!saved) inflictStatus(c, haz.status, haz.rounds ?? 1);
      events.push({ round, type: 'hazard', target: c.id, hazard: haz.kind, inflicted: haz.status, saved: saved || undefined });
    }
    log.push(...events);
    return events;
  }

  function canEnterHazard(c: TacticalCombatant, haz: TerrainHazard | undefined): boolean {
    if (!haz) return true;
    if (c.flags.has('feared')) return true;
    if (haz.blocksEntryBelowHd !== undefined && c.hd !== undefined && c.hd < haz.blocksEntryBelowHd && !ignoresPoisonCloudEntry(c)) return false;
    if (haz.blocksEntryOnFailedSave) {
      if (ignoresNoxiousCloudEntry(c)) return true;
      if (c.flags.has('held') || c.flags.has('coughing')) return true;
      const saved = passesSavingThrow(c);
      if (!saved) return false;
    }
    return true;
  }

  // Initiative is a STORED per-combatant value (COAB 0x1A5), not a per-round roll. Seed any that the
  // caller left unset with a single battle-start d10 so the turn order is stable across all rounds.
  for (const c of combatants) if (c.initiative === undefined) c.initiative = rng.die(10);

  const living = (side: CombatSide): TacticalCombatant[] =>
    combatants.filter((c) => c.side === side && isActive(c)).sort(bySideThenId);
  const sidesAlive = () => ({ party: living('party').length, enemy: living('enemy').length });
  const teamCounts = () => sidesAlive();

  // ── Morale (CT.6) ──────────────────────────────────────────────────────────────────────────
  // Faithful to CoK's OWN `morale_check` @0xD83D (VERIFIED, disasm-combat-cok.md §3.3): a monster's
  // morale_score = clamp((control_morale & 0x7F)*2, 102) is compared against TWO percentages — the
  // figure's own `percent_wounded` AND its side's team-health loss (`100 − [di+0x58C]`). Failing the
  // individual test routs it (flee, "is forced to flee"); failing on team collapse while personally
  // sound is the surrender branch ("Surrenders"). It is a deterministic PERCENTAGE threshold, NOT a 2d6
  // roll. The two comparisons + both outcomes are byte-located; only the flee-vs-surrender *assignment*
  // (which located test drives which string) and the rout DURATION are inferred + labelled here.

  /** A side's team-health loss percent: `100 − Σ current HP · 100 / Σ max HP` over its morale-checking foes. */
  function sidePctLost(side: CombatSide): number {
    let cur = 0, max = 0;
    for (const c of combatants) {
      if (c.side !== side || c.morale === undefined) continue;
      cur += Math.max(0, c.hp);
      max += c.maxHp || c.hp;
    }
    return max > 0 ? Math.round((1 - cur / max) * 100) : 0;
  }

  /** Resolve a monster's morale outcome (CT.6). Party/undead/constructs (no `morale`) never break. */
  function moraleBreakOf(c: TacticalCombatant): MoraleBreak {
    if (c.side !== 'enemy' || c.morale === undefined || !isActive(c)) return null;
    const score = Math.min(MORALE_CLAMP, c.morale);
    const personallyBroken = score < pctLost(c);       // this figure is bloodied past its nerve
    const teamBroken = score < sidePctLost(c.side);    // its whole side has collapsed
    if (!personallyBroken && !teamBroken) return null; // morale holds
    // ovr010 `FleeCheck_001`: on a break a smart monster (`Int > 5`) **Surrenders**, a dumb one (`Int ≤ 5`)
    // just **routs** (panic flee). When no `int` is supplied we keep the legacy split — personally bloodied
    // ⇒ flee, side-collapse-while-personally-sound ⇒ surrender — so existing callers are unchanged.
    if (c.int !== undefined) return c.int > 5 ? 'surrender' : 'flee';
    return personallyBroken ? 'flee' : 'surrender';
  }

  /** Apply a monster's morale break once (flee → `feared`; surrender → out of the fight). Returns its event. */
  function applyMoraleOutcome(c: TacticalCombatant): TacticalEvent | null {
    if (!isActive(c) || c.flags.has('feared') || c.flags.has('surrendered')) return null;
    const br = moraleBreakOf(c);
    if (br === 'flee') {
      inflictStatus(c, 'feared', MORALE_FLEE_ROUNDS);
      const ev: TacticalEvent = { round, type: 'status', actor: c.id, target: c.id, inflicted: 'feared', morale: true };
      log.push(ev);
      return ev;
    }
    if (br === 'surrender') {
      c.flags.add('surrendered');
      const ev: TacticalEvent = { round, type: 'flee', actor: c.id, surrendered: true, morale: true };
      log.push(ev);
      return ev;
    }
    return null;
  }

  /** After a blow lands (or a foe falls), re-check every monster's morale; collect the breaks that occur. */
  function checkMoraleSweep(): TacticalEvent[] {
    const evs: TacticalEvent[] = [];
    for (const c of combatants) {
      const ev = applyMoraleOutcome(c);
      if (ev) evs.push(ev);
    }
    return evs;
  }

  /** Every cell `c` occupies — its full footprint (1×1, or the 2×2 block of a Large icon; CT.7f). */
  function cellsOf(c: TacticalCombatant): GridPos[] {
    return footprintCells(c.pos, c.size ?? 1);
  }
  /** Footprint-aware Chebyshev distance between two figures (CT.7f) — min over their occupied cells. */
  function figureDistance(a: TacticalCombatant, b: TacticalCombatant): number {
    return footprintDistance(a.pos, a.size ?? 1, b.pos, b.size ?? 1);
  }
  /** Nearest Chebyshev distance from any of `c`'s cells to a single point (for AoE gather; CT.7f). */
  function figureToPoint(c: TacticalCombatant, p: GridPos): number {
    let best = Infinity;
    for (const cell of cellsOf(c)) { const d = chebyshev(cell, p); if (d < best) best = d; }
    return best;
  }

  /** Cells occupied by a living figure other than `self` — movement blockers (full footprints; CT.7f). */
  function occupied(self?: TacticalCombatant): Set<string> {
    const s = new Set<string>();
    for (const c of combatants) if (isActive(c) && c !== self) for (const cell of cellsOf(c)) s.add(posKey(cell));
    return s;
  }

  function beginRound(): void {
    round++;
    opts.onRoundStart?.(round);
    delayedThisRound.clear(); // CT.7e — a fresh round restores everyone's right to Delay once
    tickRegen(); // M23.S2 — regen_3_hp heals before this round's order is built (COAB Type_19 sweep)
    tickStatuses(); // CT.5a — age temporary conditions before this round's order is built
    tickDyingBleeding(); // CT.7h — CoAB dying figures bleed toward permanent death while inactive
    // Sort by the STORED initiative (haste/slow adjusted), highest first — not a fresh d10 each round.
    order = combatants
      .filter(isActive)
      .map((c) => ({ c, init: effectiveInitiative(c) }))
      .sort((a, b) => b.init - a.init || bySideThenId(a.c, b.c))
      .map((e) => e.c);
    oidx = 0;
  }

  function beginTurn(actor: TacticalCombatant): void {
    moveLeft = actor.move * 2; // half-steps (orthogonal 2 / diagonal = diagCost: gen1 4 / gen2 3)
    acted = false;
    // CT.7d — a readied guard that never triggered lapses when the figure's own turn comes round again,
    // so it takes a fresh action instead of staying frozen in the guard stance.
    actor.flags.delete('guarding');
    // A monster whose morale has broken — or ANY figure that is `feared` (CT.5a) — is forced to flee
    // this turn and cannot attack (party morale is otherwise the player's call). A monster that breaks
    // exactly as its turn opens routs/surrenders now (covers a figure wounded before any sweep ran).
    applyMoraleOutcome(actor);
    // CT.7b — a figure that begins its turn standing in a hazard zone (web/cloud) is subjected to it
    // again (re-roll a web save, take another tick of cloud damage) before it can act.
    applyHazardTo(actor, 'begin-turn');
    forcedFlee = actor.flags.has('feared');
  }

  /**
   * Attacks the actor makes this round. With {@link TacticalCombatant.halfAttacks} set, COAB's
   * fractional system applies: `floor(half/2)` swings every round plus one extra on odd rounds when
   * `half` is odd (so 3 → 2,1,2,1…). Otherwise the plain integer `attacksPerRound` (min 1).
   */
  function attacksThisRound(actor: TacticalCombatant): number {
    if (actor.halfAttacks !== undefined) {
      const base = Math.floor(actor.halfAttacks / 2);
      const extra = actor.halfAttacks % 2 === 1 && round % 2 === 1 ? 1 : 0;
      return Math.max(0, base + extra);
    }
    return Math.max(1, actor.attacksPerRound);
  }

  function finalizeEnd(): void {
    const alive = sidesAlive();
    const outcome: CombatOutcome =
      alive.enemy === 0 && alive.party > 0 ? 'party'
        : alive.party === 0 && alive.enemy > 0 ? 'enemy'
          : 'draw';
    log.push({ round, type: 'end', outcome });
    over = true;
  }

  /** Advance the cursor to the next actor that will actually take a turn; handle round/end. */
  function positionCursor(): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (over) return;
      if (oidx >= order.length) {
        const alive = sidesAlive();
        if (alive.party === 0 || alive.enemy === 0) return finalizeEnd();
        if (round >= roundCap) return finalizeEnd();
        beginRound();
        if (order.length === 0) return finalizeEnd();
        beginTurn(order[0]!);
        continue;
      }
      const actor = order[oidx]!;
      if (!isActive(actor)) { oidx++; continue; }
      if (living(foeSideOf(actor)).length === 0) { finalizeEnd(); return; }
      if (actor.flags.has('asleep') || actor.flags.has('held')) { oidx++; if (oidx < order.length) beginTurn(order[oidx]!); continue; }
      return; // cursor sits on a valid actor whose turn is in progress
    }
  }

  function current(): TacticalCombatant | null {
    positionCursor();
    return over ? null : order[oidx] ?? null;
  }

  /** End the current actor's turn and move on. */
  function endTurn(): void {
    oidx++;
    if (oidx < order.length) beginTurn(order[oidx]!);
    positionCursor();
  }

  function defaultWeapon(actor: TacticalCombatant): Weapon {
    return actor.weapons[0] ?? { name: 'fists', kind: 'melee', damage: actor.damage, reach: 1 };
  }
  function canGuard(actor: TacticalCombatant): boolean {
    return defaultWeapon(actor).kind !== 'missile';
  }
  function firstDyingPartyMember(): TacticalCombatant | undefined {
    return combatants.find((c) => c.side === 'party' && c.flags.has('dying') && !c.flags.has('dead'));
  }
  function canBandage(actor: TacticalCombatant): boolean {
    return actor.side === 'party' && !acted && !actor.flags.has('feared') && !!firstDyingPartyMember();
  }
  function applyBandage(actor: TacticalCombatant): TacticalEvent[] {
    if (!canBandage(actor)) return [];
    const target = firstDyingPartyMember();
    if (!target) return [];
    target.flags.delete('dying');
    target.flags.add('unconscious');
    target.bleeding = undefined;
    target.hp = 0;
    const ev: TacticalEvent = { round, type: 'bandage', actor: actor.id, target: target.id };
    log.push(ev);
    acted = true;
    endTurn();
    return [ev];
  }
  function missileWeapon(actor: TacticalCombatant): Weapon | null {
    return actor.weapons.find((w) => (w.kind === 'missile' || w.kind === 'thrown') && (w.ammo ?? 1) > 0) ?? null;
  }

  function attackSideTargets(actor: TacticalCombatant, side: CombatSide): TacticalCombatant[] {
    return combatants.filter((c) => c !== actor && c.side === side && isActive(c)).sort(bySideThenId);
  }

  function isConfirmedAllyTarget(actor: TacticalCombatant, targetId: string | undefined, allowAlly: boolean): boolean {
    return !!allowAlly && !!targetId && combatants.find((c) => c.id === targetId)?.side === actor.side;
  }

  function convertNpcAlliesAfterConfirmedAllyAttack(): TacticalEvent[] {
    allyAttackConfirmedFlag = true;
    const events: TacticalEvent[] = [];
    for (const c of combatants) {
      if (!c.npcControlled || c.side === 'enemy' || !isActive(c)) continue;
      const fromSide = c.side;
      c.side = 'enemy';
      c.actionTargetId = null;
      events.push({ round, type: 'side-change', target: c.id, fromSide, toSide: c.side });
    }
    log.push(...events);
    return events;
  }

  function meleeTargets(actor: TacticalCombatant, side: CombatSide = foeSideOf(actor)): TacticalCombatant[] {
    const reach = defaultWeapon(actor).reach ?? 1;
    // CT.7f — footprint-aware reach: a Large figure melees from (and is reached by) any of its cells.
    return attackSideTargets(actor, side).filter((f) => figureDistance(actor, f) <= reach);
  }

  function clearLineOfFire(from: GridPos, to: GridPos): boolean {
    const blocksSight = terrain.blocksSight ?? terrain.blocked ?? (() => false);
    const occ = occupied();
    for (const cell of lineCells(from, to)) {
      if (blocksSight(cell.col, cell.row)) return false;
      if (occ.has(posKey(cell))) return false; // a body blocks the shot
    }
    return true;
  }

  /**
   * CT.7f — figure-to-figure line-of-fire: clear if ANY sightline between a shooter cell and a target
   * cell is unobstructed. The shooter's and target's OWN footprint cells never block the shot (a big
   * creature is not blocked by its own body); other bodies and sight-blocking terrain do.
   */
  function clearLineOfFireBetweenAt(actor: TacticalCombatant, actorPos: GridPos, target: TacticalCombatant): boolean {
    const blocksSight = terrain.blocksSight ?? terrain.blocked ?? (() => false);
    const actorCells = footprintCells(actorPos, actor.size ?? 1);
    const own = new Set<string>([...actorCells, ...cellsOf(target)].map(posKey));
    const occ = occupied(actor);
    for (const fromCell of actorCells) {
      for (const toCell of cellsOf(target)) {
        let blockedLine = false;
        for (const cell of lineCells(fromCell, toCell)) {
          const k = posKey(cell);
          if (blocksSight(cell.col, cell.row) || (occ.has(k) && !own.has(k))) { blockedLine = true; break; }
        }
        if (!blockedLine) return true; // at least one clear sightline exists
      }
    }
    return false;
  }

  function clearLineOfFireBetween(actor: TacticalCombatant, target: TacticalCombatant): boolean {
    return clearLineOfFireBetweenAt(actor, actor.pos, target);
  }

  function missileTargets(actor: TacticalCombatant, side: CombatSide = foeSideOf(actor)): TacticalCombatant[] {
    const w = missileWeapon(actor);
    if (!w) return [];
    const range = w.range ?? 1;
    return attackSideTargets(actor, side).filter(
      (f) => figureDistance(actor, f) <= range && clearLineOfFireBetween(actor, f),
    );
  }

  /** Resolve one swing/shot; pushes the attack (+slain) events and returns them. */
  function resolveHit(actor: TacticalCombatant, target: TacticalCombatant, weapon: Weapon, missile: boolean, backstab = false): TacticalEvent[] {
    const events: TacticalEvent[] = [];
    const roll = rng.die(20);
    // CT.7a — REAR/FLANK AC. A melee attacker in the target's rear arc finds it easier to hit: the
    // defender's facing-aware AC is used (COAB `ac_behind` @0x19B — `rearAc` here when the bestiary
    // supplies it), else a 1e-standard rear advantage (negate shield+dex ≈ +2 to hit). The Krynn
    // attack code IS positional — CoK's facing field 0x10A + the "(from behind)" message are byte-
    // located (disasm-combat-cok.md §3, disasm-spells-krynn.md §14) — but the rear-AC magnitude lives
    // behind the cross-overlay to-hit `lcall` (UNLOCATED), so the value is 1e-inferred + labelled.
    const fromRear = !missile && isBehindTarget(target.facing, target.pos, actor.pos);
    const effAc = fromRear && target.rearAc !== undefined ? target.rearAc : target.ac;
    // CT.5c — a thief backstab adds its own +4 (the thief's from-behind bonus); a non-thief rear strike
    // gets the generic +2 only when no stored `rearAc` already encodes the rear penalty (no double-count).
    let needed = actor.thac0 - effAc;
    if (backstab) needed -= 4;
    else if (fromRear && target.rearAc === undefined) needed -= REAR_TO_HIT_BONUS;
    // CT.7c — MISSILE RANGE BRACKET. A shot's to-hit shifts by distance band: short +1 / medium 0 /
    // long −2 (a bonus lowers `needed`, a penalty raises it). CoK's targeting IS range-aware (the
    // "Range = N" readout is byte-located), but the bracket magnitudes are cross-overlay/COAB-item-data
    // (UNLOCATED) → 1e-inferred + labelled. Thrown weapons use the same banding off their `range`.
    let bracket: RangeBracket | undefined;
    if (missile) {
      // CT.7f — measure the band from the nearest cells of each figure (a Large target is "closer").
      bracket = missileRangeBracket(figureDistance(actor, target), weapon.range ?? 0);
      needed -= rangeBracketToHit(bracket);
      needed -= actor.missileHitBonus ?? 0; // M25.S1 — COAB DexReactionAdj, ranged weapons only
    }
    // CT.5a — a helpless target (asleep/held) is hit automatically (AD&D-1e: a sleeping/held opponent
    // can be struck without a roll); nat-1 still whiffs only against a defending foe, not a helpless one.
    const helpless = target.flags.has('asleep') || target.flags.has('held');
    const hit = helpless ? true : roll === 20 ? true : roll === 1 ? false : roll >= needed;
    // CT.7j — COUP DE GRACE. A *melee* strike on a helpless foe doesn't just auto-hit (CT.5a) — it
    // finishes the target outright ("slays helpless … with one cruel blow", byte-located CoK GAME.OVR
    // @0x14fee/0x15019, DoK START.EXE @0x1eeff). The feature + its helpless precondition are PROVEN from
    // the strings; that it is an instant kill is AD&D-1e standard ("slays" = a kill, not a knockout) and
    // labelled. Gen1-verified only → gen2 (DQK, unverified) keeps the ordinary auto-hit + damage roll.
    const coupDeGrace = hit && !missile && helpless && ruleset !== 'gen2';
    if (!hit) {
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: false, missile, targetHpAfter: target.hp, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
    } else if (coupDeGrace) {
      // Slay outright, bypassing the hp+10 overkill check — a helpless foe gets no reprieve. The blow's
      // reported damage is the victim's remaining HP; it dies (the permadeath flag, carried to the roster
      // by CT.7h if it was a party member). A slept victim never wakes — it is finished.
      if (target.flags.has('asleep')) clearStatus(target, 'asleep');
      const dmg = Math.max(1, target.hp);
      target.hp = 0;
      target.flags.delete('dying');
      target.flags.delete('unconscious');
      target.flags.add('dead');
      target.bleeding = undefined;
      if (target.side === 'enemy') xpAwarded += target.xp ?? 0;
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: 0, helpless: true, coupDeGrace: true, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
      events.push({ round, type: 'slain', actor: actor.id, target: target.id, dead: true, coupDeGrace: true });
    } else {
      let dmg = Math.max(1, rng.roll(weapon.damage.count, weapon.damage.sides, weapon.damage.bonus));
      // CT.5c — backstab multiplies the rolled weapon damage by the thief's level-banded factor (×2..×5).
      if (backstab) dmg *= backstabMultiplier(actor.backstabLevel ?? 1);
      // M24.S1 — COAB `half_damage` (Type_5 sweep): applied after backstab multiply, before HP loss —
      // the same order COAB's `sub_3E192` computes it (backstab multiply, then the defender-side sweep).
      if (target.halfDamage) dmg = Math.floor(dmg / 2);
      // A slept figure that survives a blow wakes (held is magical and does NOT break on damage).
      if (target.flags.has('asleep')) clearStatus(target, 'asleep');
      const dead = applyHpLoss(target, dmg);
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: Math.max(0, target.hp), helpless: helpless || undefined, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
      if (target.hp <= 0) events.push({ round, type: 'slain', actor: actor.id, target: target.id, dead });
    }
    log.push(...events);
    return events;
  }

  /**
   * Apply `dmg` to `target`, set its downed/dead flag using the verified per-generation death rule, and
   * award XP for a slain foe. Returns whether the blow was lethal (permadeath). Shared by melee/missile
   * and spell resolution so the death rule lives in exactly one place.
   *
   * Gen1 (CoK/DoK, verified in their own `GAME.OVR`): a single blow kills outright only at
   * `damage >= hp + 10` (COAB `damage_player`, byte-identical in DoK); otherwise the figure is downed
   * (unconscious at exactly 0, dying with the negative depth stored in `bleeding`) and can be
   * revived after the battle. Gen2 (DQK): the `+10` overkill
   * literal is VERIFIED ABSENT (byte scan `add ax,0Ah` = 0 in DQK vs 5/4 in CoK/DoK); RE.4 located DQK's
   * HP word (+0x4c) and its HP≤0 down-check but no distinct permadeath constant, so we conservatively
   * down rather than invent a kill threshold (disasm-combat-dqk.md §9). Refine when the trigger is pinned.
   */
  function applyHpLoss(target: TacticalCombatant, dmg: number): boolean {
    const hpBefore = target.hp;
    const hpAfter = hpBefore - dmg;
    target.hp = hpAfter;
    if (target.hp > 0) return false;
    const negHp = Math.max(0, dmg - hpBefore);
    const lethal = ruleset === 'gen2' ? false : negHp > 9;
    target.flags.delete('unconscious');
    target.flags.delete('dying');
    target.flags.delete('dead');
    target.flags.add(lethal ? 'dead' : negHp === 0 ? 'unconscious' : 'dying');
    target.bleeding = ruleset !== 'gen2' && !lethal && negHp > 0 ? negHp : undefined;
    target.hp = 0;
    if (target.side === 'enemy') xpAwarded += target.xp ?? 0;
    return lethal;
  }

  /** Roll a spell amount (damage/heal), scaling `count` by caster level when `perLevel`. */
  function rollAmount(a: SpellAmount, casterLevel: number): number {
    const n = a.perLevel ? Math.max(1, a.count * Math.max(1, Math.floor(casterLevel))) : a.count;
    if (a.sides <= 0) return Math.max(0, a.bonus);
    return Math.max(0, rng.roll(n, a.sides, a.bonus));
  }

  function applyMelee(actor: TacticalCombatant, targetId?: string, allowAlly = false): TacticalEvent[] {
    if (actor.flags.has('feared')) return []; // CT.5a — a feared figure cannot attack
    const confirmedAlly = isConfirmedAllyTarget(actor, targetId, allowAlly);
    const targetSide = confirmedAlly
      ? actor.side
      : foeSideOf(actor);
    const inReach = meleeTargets(actor, targetSide);
    let target: TacticalCombatant | undefined = (targetId && inReach.find((t) => t.id === targetId)) || inReach[0];
    if (!target) return [];
    actor.actionTargetId = target.id;
    // CT.5c — backstab: a thief striking a foe from its rear arc lands one multiplied opening blow.
    // Evaluated against the chosen target's facing/position BEFORE the attacker turns to face it, and
    // applied only to the first swing (the "one cruel blow").
    const canBackstab = actor.backstabLevel !== undefined && isBehindTarget(target.facing, target.pos, actor.pos);
    actor.facing = facingTo(actor.pos, target.pos);
    const weapon = defaultWeapon(actor);
    const events: TacticalEvent[] = confirmedAlly ? convertNpcAlliesAfterConfirmedAllyAttack() : [];
    // Full attack routine: every attack this round, retargeting to another in-reach foe if the
    // current one drops (Gold Box lets a high-level fighter's extra swings spill onto a fresh foe).
    // A figure on the "off" round of a fractional (e.g. 3/2) attack gets 0 swings.
    for (let i = 0, n = attacksThisRound(actor); i < n; i++) {
      if (!target || target.hp <= 0) {
        target = targetSide === actor.side ? undefined : meleeTargets(actor)[0];
        if (!target) break;
      }
      events.push(...resolveHit(actor, target, weapon, false, i === 0 && canBackstab));
    }
    acted = true;
    return events;
  }

  function applyMissile(actor: TacticalCombatant, targetId?: string, allowAlly = false): TacticalEvent[] {
    if (actor.flags.has('feared')) return []; // CT.5a — a feared figure cannot fire
    const w = missileWeapon(actor);
    if (!w) return [];
    const confirmedAlly = isConfirmedAllyTarget(actor, targetId, allowAlly);
    const targetSide = confirmedAlly
      ? actor.side
      : foeSideOf(actor);
    const inRange = missileTargets(actor, targetSide);
    let target: TacticalCombatant | undefined = (targetId && inRange.find((t) => t.id === targetId)) || inRange[0];
    if (!target) return [];
    actor.actionTargetId = target.id;
    actor.facing = facingTo(actor.pos, target.pos);
    const events: TacticalEvent[] = confirmedAlly ? convertNpcAlliesAfterConfirmedAllyAttack() : [];
    for (let i = 0, n = attacksThisRound(actor); i < n; i++) {
      if ((w.ammo ?? 1) <= 0) break;
      if (!target || target.hp <= 0) {
        target = targetSide === actor.side ? undefined : missileTargets(actor)[0];
        if (!target) break;
      }
      if (w.ammo !== undefined) w.ammo -= 1;
      events.push(...resolveHit(actor, target, w, true));
    }
    acted = true;
    return events;
  }

  function canSpellAffect(actor: TacticalCombatant, spell: TacticalSpell, target: TacticalCombatant): boolean {
    if (spell.target === 'self') return target.id === actor.id;
    const wantSide: CombatSide = spell.target === 'enemy' ? foeSideOf(actor) : actor.side;
    if (target.side !== wantSide) return false;
    if (isActive(target)) return true;
    return !!spell.heal && target.hp <= 0 && !target.flags.has('dead') && !target.flags.has('fled') && !target.flags.has('surrendered');
  }

  /** The aim cell a cast is centred on: an explicit target's cell, else the `to` cell, else self. */
  function castAimPoint(actor: TacticalCombatant, spell: TacticalSpell, to?: GridPos, targetId?: string): GridPos | null {
    if (spell.target === 'self') return { ...actor.pos };
    if (targetId) {
      const t = combatants.find((c) => c.id === targetId && canSpellAffect(actor, spell, c));
      if (t) return { ...t.pos };
    }
    return to ? { ...to } : null;
  }

  /** Living figures a spell's area covers, given its aim point and shape. */
  function spellAffected(actor: TacticalCombatant, spell: TacticalSpell, aim: GridPos): TacticalCombatant[] {
    if (spell.target === 'self') return [actor];
    const pool = combatants.filter((c) => canSpellAffect(actor, spell, c));
    const radius = Math.max(0, spell.radius ?? 0);
    switch (spell.area) {
      // CT.7f — a Large figure is caught if ANY of its cells is in the area.
      case 'single':
        return pool.filter((c) => cellsOf(c).some((cell) => samePos(cell, aim)));
      case 'burst':
      case 'cone': // cone is approximated as a burst around the aim point (true cone shape is a later refinement)
        return pool.filter((c) => figureToPoint(c, aim) <= radius);
      case 'line': {
        const onLine = new Set(lineCells(actor.pos, aim).map(posKey));
        onLine.add(posKey(aim));
        return pool.filter((c) => cellsOf(c).some((cell) => onLine.has(posKey(cell))));
      }
      default:
        return [];
    }
  }

  /**
   * Cast `spellId` at an aim cell / target. Faithful-by-construction mechanics: range gate (Chebyshev),
   * line-of-fire for single/line spells, area gather, a d20 saving throw per target (half/negate per the
   * spell's `save` mode and the target's `save` value), damage/heal application, and prepared-slot
   * consumption. The per-spell numbers are carried by the {@link TacticalSpell} (ruleset data); the
   * Krynn games' in-binary spell-damage formula itself is UNLOCATED (disasm-spells-krynn.md).
   */
  function applyCast(actor: TacticalCombatant, spellId?: string, to?: GridPos, targetId?: string): TacticalEvent[] {
    if (actor.flags.has('feared')) return []; // CT.5a — a feared figure cannot cast
    const spell = actor.preparedSpells?.find((s) => s.id === spellId && (s.usesLeft ?? 1) > 0);
    if (!spell) return [];
    const aim = castAimPoint(actor, spell, to, targetId);
    if (!aim) return [];
    if (chebyshev(actor.pos, aim) > (spell.range ?? 0) && spell.target !== 'self') return []; // out of range
    if ((spell.area === 'single' || spell.area === 'line') && !samePos(aim, actor.pos) && !clearLineOfFire(actor.pos, aim)) return [];

    actor.facing = facingTo(actor.pos, aim);
    if (spell.usesLeft !== undefined) spell.usesLeft -= 1;
    acted = true;

    const level = spell.casterLevel ?? 1;
    const affected = spell.zone && !spell.damage && !spell.heal && !spell.inflict ? [] : spellAffected(actor, spell, aim);
    actor.actionTargetId = targetId ?? affected[0]?.id ?? null;
    const events: TacticalEvent[] = [];
    // A spell with no targets still fires (and burns the slot) — emit a bare cast event.
    if (affected.length === 0) {
      events.push({ round, type: 'cast', actor: actor.id, spellId: spell.id });
    }
    for (const t of affected) {
      const ev: TacticalEvent = { round, type: 'cast', actor: actor.id, target: t.id, spellId: spell.id };
      // One saving throw per target, shared by damage mitigation and status negation (CT.5a). A spell
      // with `save:'none'` (Sleep, Magic Missile, a buff) gives no save; a target with no `save` value
      // never saves (the engine doesn't invent one). `conSaveBonus` (M28.S1, COAB `con_saving_bonus`)
      // adds to the roll, not the target — matches `gbl.savingThrowRoll += save_bonus` (ovr013.cs).
      const rollsSave = spell.save !== 'none' && t.save !== undefined;
      const saved = rollsSave ? rng.die(20) + (t.conSaveBonus ?? 0) >= t.save! : false;
      if (rollsSave) ev.saved = saved;

      if (spell.heal) {
        const amt = rollAmount(spell.heal, level);
        const before = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + amt);
        ev.healed = t.hp - before;
        ev.targetHpAfter = t.hp;
      }

      let dead = false;
      if (spell.damage) {
        let dmg = rollAmount(spell.damage, level);
        if (saved) dmg = spell.save === 'negate' ? 0 : Math.floor(dmg / 2);
        ev.damage = dmg;
        if (dmg > 0) {
          // Mirrors resolveHit()'s own wake-on-damage step: a slept figure that takes real damage
          // wakes, whatever the source; `held` stays persistent (magical) and does not clear here.
          if (t.flags.has('asleep')) clearStatus(t, 'asleep');
          dead = applyHpLoss(t, dmg);
          ev.targetHpAfter = Math.max(0, t.hp);
        }
      }

      // Status infliction (CT.5a): a failed save (or no save) applies it, HD-capped if specified. Only
      // a still-standing target gets a condition (a slain figure is already out of the fight).
      if (spell.inflict && t.hp > 0) {
        const cap = spell.inflict.hdCap;
        const capOk = cap === undefined || t.hd === undefined || t.hd <= cap;
        if (!saved && capOk) {
          inflictStatus(t, spell.inflict.status, spell.inflict.rounds);
          ev.inflicted = spell.inflict.status;
        }
      }

      events.push(ev);
      if (spell.heal && t.hp > 0 && ev.healed !== undefined && ev.healed > 0 && ev.targetHpAfter !== undefined && (ev.targetHpAfter - ev.healed) <= 0 && !t.flags.has('dead')) {
        t.flags.delete('unconscious');
        t.flags.delete('dying');
        t.bleeding = undefined;
        events.push({ round, type: 'stand-up', actor: actor.id, target: t.id, targetHpAfter: t.hp });
      }
      if (spell.damage && t.hp <= 0) events.push({ round, type: 'slain', actor: actor.id, target: t.id, dead });
    }
    log.push(...events);
    return events;
  }

  /** Walk the actor to `to` if reachable within `moveLeft`; deduct the path cost. */
  function applyMove(actor: TacticalCombatant, to: GridPos): TacticalEvent[] {
    if (samePos(actor.pos, to)) return [];
    const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
    const cost = reach.get(posKey(to));
    if (cost === undefined) return []; // unreachable this turn
    if (!canEnterHazard(actor, terrain.hazard?.(to.col, to.row))) return [];
    const from = { ...actor.pos };
    const leaving = triggerLeavingReactions(actor, to);
    if (!isActive(actor)) return leaving;
    actor.facing = facingTo(from, to);
    actor.pos = { ...to };
    moveLeft -= cost;
    const ev: TacticalEvent = { round, type: 'move', actor: actor.id, path: [{ ...to }] };
    log.push(ev);
    void from;
    // CT.7b — ending the move in a hazard cell (web/cloud) subjects the figure to it.
    // CT.7d — advancing into a Guarding foe's reach provokes its readied strike.
    return [...leaving, ev, ...applyHazardTo(actor, 'entry'), ...triggerGuardReactions(actor)];
  }

  /**
   * CoAB `move_step_away_attack(dir, player)` equivalent: before the mover leaves its origin cell,
   * foes that can currently melee it and would no longer threaten the destination get a free strike.
   */
  function triggerLeavingReactions(mover: TacticalCombatant, to: GridPos): TacticalEvent[] {
    if (!isActive(mover)) return [];
    const events: TacticalEvent[] = [];
    const moved = { ...mover, pos: { ...to } };
    for (const foe of living(foeSideOf(mover))) {
      if (foe.flags.has('asleep') || foe.flags.has('held') || foe.flags.has('feared')) continue;
      const weapon = defaultWeapon(foe);
      if (weapon.kind === 'missile') continue;
      const reach = weapon.reach ?? 1;
      if (figureDistance(foe, mover) > reach) continue;
      if (figureDistance(foe, moved) <= reach) continue;
      foe.facing = facingTo(foe.pos, mover.pos);
      const strikes = resolveHit(foe, mover, weapon, false);
      for (const e of strikes) if (e.type === 'attack') { e.opportunity = true; e.leaving = true; }
      events.push(...strikes);
      if (!isActive(mover)) break;
    }
    if (events.length) events.push(...checkMoraleSweep());
    return events;
  }

  /**
   * CT.7d — readied **GUARD** reactions. After `mover` finishes a move, every foe that is **Guarding**
   * (readied its action via the guard command) and now within its melee reach gets ONE free strike at the
   * mover, then spends the readied action. Models Champions of Krynn's own **Guard/Guarding** stance (the
   * `Guard ` command @0xbf28 and the `Guarding` state string @0x38f51 are byte-located in `GAME.OVR`). A
   * guard that is itself disabled (asleep/held/feared) can't react. The "one reaction, spent on the first
   * foe to enter reach" detail is 1e/Gold-Box-inferred + labelled (the trigger condition is cross-overlay).
   */
  function triggerGuardReactions(mover: TacticalCombatant): TacticalEvent[] {
    if (!isActive(mover)) return [];
    const events: TacticalEvent[] = [];
    for (const g of living(foeSideOf(mover))) {
      if (!g.flags.has('guarding')) continue;
      if (g.flags.has('asleep') || g.flags.has('held') || g.flags.has('feared')) continue;
      if (figureDistance(g, mover) > (defaultWeapon(g).reach ?? 1)) continue; // CT.7f footprint-aware reach
      g.flags.delete('guarding');             // the readied action is spent
      g.facing = facingTo(g.pos, mover.pos);  // turn to face the advancing foe
      const strikes = resolveHit(g, mover, defaultWeapon(g), false);
      for (const e of strikes) if (e.type === 'attack') e.opportunity = true;
      events.push(...strikes);
      if (!isActive(mover)) break;            // mover downed → no further guards strike it
    }
    if (events.length) events.push(...checkMoraleSweep()); // a guard kill can rout the survivors (CT.6)
    return events;
  }

  /** Flee: step toward the nearest map edge; if the actor reaches an edge it leaves the battle. */
  function applyFlee(actor: TacticalCombatant): TacticalEvent[] {
    const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
    // Prefer the reachable cell nearest a border (distance to the closest edge), then farthest moved.
    const edgeDist = (p: GridPos): number => Math.min(p.col, p.row, terrain.width - 1 - p.col, terrain.height - 1 - p.row);
    let best: GridPos | null = null;
    let bestScore = Infinity;
    for (const k of reach.keys()) {
      const [c, r] = k.split(',').map(Number) as [number, number];
      const p = { col: c, row: r };
      const score = edgeDist(p);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    const events: TacticalEvent[] = [];
    if (best && !samePos(best, actor.pos)) {
      actor.facing = facingTo(actor.pos, best);
      actor.pos = best;
      const ev: TacticalEvent = { round, type: 'flee', actor: actor.id, path: [{ ...best }] };
      log.push(ev);
      events.push(ev);
    }
    if (edgeDist(actor.pos) === 0) {
      actor.flags.add('fled'); // reached the border → escapes the field
    } else {
      // CT.7b — a figure that flees into (and stops in) a hazard cell is still caught by it.
      events.push(...applyHazardTo(actor, 'entry'));
      // CT.7d — fleeing past (or into) a Guarding foe's reach provokes its readied strike too,
      // exactly as an ordinary move does (applyMove, above).
      events.push(...triggerGuardReactions(actor));
    }
    acted = true;
    endTurn();
    return events;
  }

  /** True if any cell of a `size`-footprint figure anchored at `p` touches the map border (CT.7g). */
  function touchesBorder(p: GridPos, size: number): boolean {
    return footprintCells(p, size).some(
      (c) => c.col === 0 || c.row === 0 || c.col === terrain.width - 1 || c.row === terrain.height - 1,
    );
  }

  /** A party member can withdraw if it stands on — or can still reach this turn — a border cell (CT.7g). */
  function canReachBorder(c: TacticalCombatant): boolean {
    const size = c.size ?? 1;
    if (touchesBorder(c.pos, size)) return true;
    const reach = reachableCells(c.pos, c.move * 2, terrain, occupied(c), diagCost, size);
    for (const k of reach.keys()) {
      const [col, row] = k.split(',').map(Number) as [number, number];
      if (touchesBorder({ col, row }, size)) return true;
    }
    return false;
  }

  /**
   * CT.7g — can the **whole party** flee the field right now? Champions of Krynn's combat bar offers a
   * party **Flee** command (`Flee:` @0xbadf) whose two outcomes are byte-located: **`Got Away`** and
   * **`Escape is blocked`** (CoK `GAME.OVR` @0x15b18/@0x15b20), with **`The party has fled.`** the banner
   * (@0x6d0d). The faithful escape *condition* itself is cross-overlay/UNLOCATED, so the engine uses a
   * reachability model — the party gets away only if **every** living member can reach the border (none is
   * boxed in by foes/walls); if any is trapped, escape is blocked. The model is labelled inferred — see
   * `disasm-spells-krynn.md` §21.
   */
  function partyCanEscape(): boolean {
    const party = combatants.filter((c) => c.side === 'party' && isActive(c));
    if (party.length === 0) return false;
    return party.every(canReachBorder);
  }

  /**
   * CT.7g — attempt a **party-wide flee**. Emits a `party-flee` event with `escaped` set: on success every
   * living party member leaves the field and the battle ends as a **withdraw** (`end` outcome `'draw'` with
   * `fled:true` — "The party has fled.", neither a win nor a loss); on failure ("Escape is blocked") the
   * attempt is a no-op and combat continues. Distinct from the single-figure {@link applyFlee} action (an
   * individual rout used by feared monsters / AI).
   */
  function attemptPartyFlee(): TacticalEvent[] {
    if (over) return [];
    const escaped = partyCanEscape();
    const ev: TacticalEvent = { round, type: 'party-flee', escaped };
    log.push(ev);
    if (!escaped) return [ev]; // Escape is blocked — the party stays in the fight
    for (const c of combatants) if (c.side === 'party' && isActive(c)) c.flags.add('fled');
    partyFled = true;
    const endEv: TacticalEvent = { round, type: 'end', outcome: 'draw', fled: true };
    log.push(endEv);
    over = true;
    return [ev, endEv];
  }

  /**
   * True when the current actor could still **Delay** (CT.7e): it is at the very start of its turn (nothing
   * moved or acted), it hasn't already delayed this round, and at least one active figure is still due to
   * act after it this round (otherwise there is no later slot to defer into).
   */
  function canDelay(): boolean {
    if (over) return false;
    const actor = order[oidx];
    if (!actor || delayedThisRound.has(actor.id)) return false;
    if (acted || moveLeft !== actor.move * 2) return false; // only at the untouched start of the turn
    for (let i = oidx + 1; i < order.length; i++) {
      const c = order[i]!;
      if (isActive(c) && !c.flags.has('asleep') && !c.flags.has('held')) return true;
    }
    return false;
  }

  /**
   * CT.7e — **DELAY**: defer the current actor to act LATER this round. Champions of Krynn's own combat bar
   * offers `Delay ` (byte-located @0xbf28, beside `Guard `). The actor is moved to the end of this round's
   * turn order and the next figure acts now; the deferred actor still gets its **full** turn when reached.
   * Capped at one Delay per figure per round so it can't loop forever. A no-op when not deferrable (the UI
   * just re-prompts). The exact ordering Delay drops you into is cross-overlay/UNLOCATED — "act after all
   * others still pending" is the 1e/Gold-Box-inferred model, labelled.
   */
  function applyDelay(actor: TacticalCombatant): TacticalEvent[] {
    if (!canDelay()) return [];
    delayedThisRound.add(actor.id);
    order.splice(oidx, 1); // pull the actor out of its current slot…
    order.push(actor);     // …and re-queue it after everyone still to act this round
    const ev: TacticalEvent = { round, type: 'delay', actor: actor.id };
    log.push(ev);
    // Removing the current actor slid the next figure into oidx. Open its turn only when it is a real
    // actor; an asleep/held figure is left for positionCursor to skip (which begins the first live turn),
    // so beginTurn's per-turn hazard/morale tick never fires on a figure that won't actually act.
    const next = order[oidx];
    if (next && isActive(next) && !next.flags.has('asleep') && !next.flags.has('held')) beginTurn(next);
    positionCursor();
    return [ev];
  }

  /** Living undead foes a would-be turner can reach (within {@link TURN_RANGE}), weakest HD first. */
  function turnableUndead(actor: TacticalCombatant): TacticalCombatant[] {
    return living(foeSideOf(actor))
      .filter((f) => f.undead && chebyshev(actor.pos, f.pos) <= TURN_RANGE)
      .sort((a, b) => (a.hd ?? 1) - (b.hd ?? 1));
  }

  /**
   * Cleric **turn undead** (CT.5b). One attempt affects up to **2d6 Hit Dice** of undead, weakest first
   * (1e). Each undead is looked up on the {@link turnUndeadOutcome} table vs the turner's `turnLevel`:
   * `destroy` removes it, `turn` (or a made d20 roll) makes it **flee** (reuses CT.5a `feared`),
   * `none`/a failed roll spares it. **Death Knights** (`turnImmune`) are never affected (CoK manual). The
   * action ends the turn.
   */
  function applyTurn(actor: TacticalCombatant): TacticalEvent[] {
    if (actor.turnLevel === undefined || actor.flags.has('feared')) { acted = true; endTurn(); return []; }
    const undead = turnableUndead(actor);
    acted = true;
    let hdBudget = rng.die(6) + rng.die(6); // 2d6 HD turned this attempt
    const roll = rng.die(20);               // one d20 for the attempt, applied to each "number-needed" undead
    const events: TacticalEvent[] = [];
    for (const u of undead) {
      const hd = Math.max(1, Math.floor(u.hd ?? 1));
      if (hdBudget < hd) break;             // not enough turning power left this attempt
      if (u.turnImmune) continue;           // Death Knights cannot be turned (no budget spent)
      const outcome = turnUndeadOutcome(actor.turnLevel, hd);
      const affected = outcome === 'destroy' || outcome === 'turn'
        || (typeof outcome === 'number' && roll >= outcome);
      if (!affected) continue;
      actor.actionTargetId ??= u.id;
      hdBudget -= hd;
      if (outcome === 'destroy') {
        u.hp = 0;
        u.flags.delete('dying');
        u.flags.delete('unconscious');
        u.flags.add('dead'); // destroyed undead are gone for good (no revive)
        u.bleeding = undefined;
        if (u.side === 'enemy') xpAwarded += u.xp ?? 0; // matches applyHpLoss()/coupDeGrace's award
        events.push({ round, type: 'turn', actor: actor.id, target: u.id, destroyed: true });
        events.push({ round, type: 'slain', actor: actor.id, target: u.id, dead: true });
      } else {
        inflictStatus(u, 'feared', TURN_FLEE_ROUNDS); // turned undead flee (CT.5a status)
        events.push({ round, type: 'turn', actor: actor.id, target: u.id, turned: true });
      }
    }
    if (events.length === 0) events.push({ round, type: 'turn', actor: actor.id }); // attempt fizzled
    log.push(...events);
    endTurn();
    return events;
  }

  /** The built-in AI: shoot if a clear shot exists, else close and melee, else advance, else guard. */
  /**
   * The built-in tactical AI (CT.6). Target choice follows {@link TacticalOptions.aiTargeting}: the
   * default `'random'` matches the original ovr010 `sub_35DB1` (a RANDOM reachable in-range foe — the
   * games do NOT concentrate fire), while `'focus'` finishes the weakest. Offensive spells are picked
   * priority-descending and **save-aware** (ovr010 `sub_3560B`: skip a save-or-negate spell every target
   * would shrug off). **Role-aware positioning:** a *ranged* figure (missile weapon or an offensive
   * enemy-spell) **hangs back / kites** — it shoots or casts at range and steps AWAY from an adjacent
   * threat instead of walking into melee; a *melee* figure closes on its target. A broken-morale monster
   * (`forcedFlee`, CT.6) routs instead.
   */
  function aiAction(): TacticalAction {
    const actor = current();
    if (!actor) return { type: 'endTurn' };
    // 0) Morale broke → rout toward the nearest edge (CT.6).
    // `forcedFlee` is captured when the turn opens, but a status can also be applied after that
    // point (for example while a host redispatches an already-current actor). Consult the actor's
    // live flag as well so a newly feared figure can never fall through to ordinary attack/move AI.
    if (forcedFlee || actor.flags.has('feared')) return { type: 'flee' };
    const foes = living(foeSideOf(actor));
    if (foes.length === 0) return acted ? { type: 'endTurn' } : { type: 'guard' };

    // 1) Act: cast an offensive spell, then a missile shot, then a melee swing. Target choice follows the
    //    aiTargeting policy — RANDOM among the reachable foes by default (faithful to ovr010 sub_35DB1),
    //    or the weakest under 'focus'. The spell pick is priority-descending and save-aware (sub_3560B).
    if (!acted) {
      const cast = chooseOffensiveCast(actor, foes);
      if (cast) return cast;
      const shots = missileTargets(actor);
      if (shots.length > 0) return { type: 'missile', targetId: pickTarget(actor, shots).id };
      const melee = meleeTargets(actor);
      if (melee.length > 0) return { type: 'melee', targetId: pickTarget(actor, melee).id };
    }

    // 2) Reposition with any movement left.
    if (moveLeft > 0) {
      const goal = pickTarget(actor, foes);
      if (isRangedActor(actor)) {
        // Kite: if a foe is in melee reach, back away to reopen distance rather than trade blows.
        if (meleeTargets(actor).length > 0) {
          const away = stepAwayFrom(actor, nearest(actor, foes));
          if (away) return { type: 'move', to: away };
        }
        // A missile user with no current shot should first seek a reachable cell that actually opens
        // line of fire. Merely moving closer can leave it stuck behind the same wall turn after turn.
        if (!acted && missileWeapon(actor)) {
          const firingPosition = stepToMissileFiringPosition(actor, goal);
          if (firingPosition) return { type: 'move', to: firingPosition };
        }
        // Otherwise close to the edge of range. Being nominally in range is not enough when every
        // cast/shot/melee failed its legality checks (for example, a wall blocks line of fire): an
        // unacted ranged figure must keep repositioning instead of guarding forever behind cover.
        if (!acted || chebyshev(actor.pos, goal.pos) > engageRange(actor)) {
          const step = stepToward(actor, goal);
          if (step) return { type: 'move', to: step };
        }
      } else {
        const step = stepToward(actor, goal); // melee: close on the weakest foe
        if (step) return { type: 'move', to: step };
      }
    }

    // 3) Nothing useful left — guard if we never acted, else end the turn.
    return acted ? { type: 'endTurn' } : { type: 'guard' };
  }

  function nearest(actor: TacticalCombatant, list: TacticalCombatant[]): TacticalCombatant {
    // Nearest by the SteppingPath half-step metric (ovr032 §1a: orthogonal 2 / diagonal 3 = 1.5×), the
    // original's reach metric, rather than plain Chebyshev — so a diagonal foe ranks one band farther.
    return list.reduce(
      (best, c) => (steppingPathDistance(actor.pos, c.pos) < steppingPathDistance(actor.pos, best.pos) ? c : best),
      list[0]!,
    );
  }

  /** Focus-fire pick: the lowest-HP foe in `list`, tie-broken by the nearest (finish the wounded). */
  function weakest(actor: TacticalCombatant, list: TacticalCombatant[]): TacticalCombatant {
    return list.reduce((best, c) => {
      if (c.hp !== best.hp) return c.hp < best.hp ? c : best;
      return steppingPathDistance(actor.pos, c.pos) < steppingPathDistance(actor.pos, best.pos) ? c : best;
    }, list[0]!);
  }

  /**
   * Pick a target from `list` per the {@link TacticalOptions.aiTargeting} policy. `'focus'` → the
   * {@link weakest}. `'random'` (default, faithful to ovr010 `sub_35DB1`) → a RANDOM in-reach target:
   * `list[ rng.die(list.length) - 1 ]`, where `list` is first ordered by the SortedCombatant ranking
   * (nearest half-steps, then facing) so the draw index is deterministic on the seed. A single-candidate
   * list never consumes RNG (single-target battles stay RNG-stable).
   */
  function pickTarget(actor: TacticalCombatant, list: TacticalCombatant[]): TacticalCombatant {
    if (list.length <= 1) return list[0]!;
    if (aiTargeting === 'focus') return weakest(actor, list);
    const ordered = sortedCombatants(actor, list).map((e) => e.combatant);
    return ordered[rng.die(ordered.length) - 1]!;
  }

  /**
   * Whether the AI predicts `target` will make its saving throw vs `spell` — the gate ovr010's
   * `ShouldCastSpellX_sub1` uses to avoid wasting a save-or-negate spell. A target with no save data
   * never saves (full effect ⇒ not skipped). Otherwise it "would save" when its d20 save-target is easy
   * (`save <= AI_SAVE_LIKELY`, i.e. it saves on a majority of rolls). The −2-vs-party save shift is folded
   * into the threshold (an enemy caster's foes are the party). 1e/COAB-inferred threshold, labelled.
   */
  function aiTargetWouldSave(spell: TacticalSpell, target: TacticalCombatant): boolean {
    if (spell.save === 'none' || target.save === undefined) return false;
    return target.save <= AI_SAVE_LIKELY;
  }

  /**
   * The AI's offensive cast decision (CT.6 / ovr010 `sub_3560B`): scan prepared enemy-offensive spells in
   * DESCENDING {@link TacticalSpell.priority}, and cast the first with a valid in-range, clear-line target
   * that is **worth casting** — a save-allowing spell is skipped when EVERY in-range target would make its
   * save ({@link aiTargetWouldSave}). The aim falls on a non-saver when one exists, else the policy pick.
   * Returns the cast action, or null to fall through to missile/melee.
   */
  function chooseOffensiveCast(actor: TacticalCombatant, foes: TacticalCombatant[]): TacticalAction | null {
    const spells = (actor.preparedSpells ?? [])
      .filter((s) => (s.usesLeft ?? 1) > 0 && s.target === 'enemy' && (s.damage || s.inflict || s.zone))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const s of spells) {
      const inRange = foes.filter(
        (f) => chebyshev(actor.pos, f.pos) <= (s.range ?? 0) && clearLineOfFire(actor.pos, f.pos),
      );
      if (inRange.length === 0) continue;
      if (s.save !== 'none' && inRange.every((f) => aiTargetWouldSave(s, f))) continue; // all would save → skip
      const vulnerable = s.save !== 'none' ? inRange.filter((f) => !aiTargetWouldSave(s, f)) : inRange;
      const pool = vulnerable.length > 0 ? vulnerable : inRange;
      return { type: 'cast', spellId: s.id, targetId: pickTarget(actor, pool).id };
    }
    return null;
  }

  /** A ready offensive spell the AI would throw at a foe (an enemy-targeted damage/disable spell). */
  function offensiveSpell(actor: TacticalCombatant): TacticalSpell | null {
    for (const s of actor.preparedSpells ?? []) {
      if ((s.usesLeft ?? 1) <= 0) continue;
      if (s.target === 'enemy' && (s.damage || s.inflict || s.zone)) return s;
    }
    return null;
  }

  /** A figure that prefers to fight at range — has a missile weapon or an offensive spell. */
  function isRangedActor(actor: TacticalCombatant): boolean {
    return missileWeapon(actor) !== null || offensiveSpell(actor) !== null;
  }

  /** The farthest reach (cells) at which a ranged figure can still attack (missile range or spell range). */
  function engageRange(actor: TacticalCombatant): number {
    const mw = missileWeapon(actor);
    const sp = offensiveSpell(actor);
    return Math.max(mw?.range ?? 0, sp?.range ?? 0, 1);
  }

  /** The reachable cell this turn that gets the actor FARTHEST from `foe` (kiting / opening distance). */
  function stepAwayFrom(actor: TacticalCombatant, foe: TacticalCombatant): GridPos | null {
    const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
    let best: GridPos | null = null;
    let bestD = chebyshev(actor.pos, foe.pos);
    for (const k of reach.keys()) {
      const [c, r] = k.split(',').map(Number) as [number, number];
      const p = { col: c, row: r };
      const d = chebyshev(p, foe.pos);
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Cheapest reachable cell that puts `target` in missile range with a clear line of fire. */
  function stepToMissileFiringPosition(actor: TacticalCombatant, target: TacticalCombatant): GridPos | null {
    const weapon = missileWeapon(actor);
    if (!weapon) return null;
    const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
    let best: GridPos | null = null;
    let bestCost = Infinity;
    let bestDistance = -Infinity;
    for (const [k, cost] of reach) {
      if (k === posKey(actor.pos)) continue;
      const [c, r] = k.split(',').map(Number) as [number, number];
      const p = { col: c, row: r };
      const distance = footprintDistance(p, actor.size ?? 1, target.pos, target.size ?? 1);
      if (distance > (weapon.range ?? 1) || !clearLineOfFireBetweenAt(actor, p, target)) continue;
      // Preserve movement first; when equally cheap, hang back at the greater firing distance.
      if (cost < bestCost || (cost === bestCost && distance > bestDistance)) {
        best = p;
        bestCost = cost;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** The reachable cell this turn that gets the actor closest to `goal` (for AI/auto movement). */
  function stepToward(actor: TacticalCombatant, goal: TacticalCombatant): GridPos | null {
    const path = shortestPathToFootprintRange(
      actor.pos,
      terrain,
      occupied(actor),
      goal.pos,
      goal.size ?? 1,
      defaultWeapon(actor).reach ?? 1,
      diagCost,
      actor.size ?? 1,
    );
    if (!path || path.length === 0) return null;
    const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
    let best: GridPos | null = null;
    for (const waypoint of path) {
      if (!reach.has(posKey(waypoint))) break;
      best = waypoint;
    }
    return best;
  }

  function legalActions(): TacticalAction[] {
    const actor = current();
    if (!actor) return [];
    const actions: TacticalAction[] = [];
    // A `feared` figure (CT.5a) cannot attack or cast this turn — only move/flee.
    if (!acted && !actor.flags.has('feared')) {
      for (const t of meleeTargets(actor)) actions.push({ type: 'melee', targetId: t.id });
      for (const t of missileTargets(actor)) actions.push({ type: 'missile', targetId: t.id });
      for (const s of actor.preparedSpells ?? []) {
        if ((s.usesLeft ?? 1) <= 0) continue;
        if (s.target === 'self') { actions.push({ type: 'cast', spellId: s.id }); continue; }
        const want: CombatSide = s.target === 'enemy' ? foeSideOf(actor) : actor.side;
        for (const t of living(want)) {
          if (chebyshev(actor.pos, t.pos) <= (s.range ?? 0)) actions.push({ type: 'cast', spellId: s.id, targetId: t.id });
        }
      }
      // Cleric turn-undead (CT.5b): offered when a turner has undead foes in reach.
      if (actor.turnLevel !== undefined && turnableUndead(actor).length > 0) actions.push({ type: 'turn' });
      if (canBandage(actor)) actions.push({ type: 'bandage', targetId: firstDyingPartyMember()!.id });
    }
    if (moveLeft > 0) {
      const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
      for (const k of reach.keys()) {
        if (k === posKey(actor.pos)) continue;
        const [c, r] = k.split(',').map(Number) as [number, number];
        actions.push({ type: 'move', to: { col: c, row: r } });
      }
    }
    actions.push({ type: 'flee' });
    if (canGuard(actor)) actions.push({ type: 'guard' });
    actions.push({ type: 'wait' }, { type: 'endTurn' });
    if (canDelay()) actions.push({ type: 'delay' }); // CT.7e — defer this turn (start-of-turn only)
    return actions;
  }

  function apply(action: TacticalAction): TacticalEvent[] {
    // M74.S1 — captured before `current()` (which can itself advance the cursor) so the return below
    // also carries any beginRound()/beginTurn() tick (regen, status-expiry, a hazard/morale check at the
    // top of the next actor's turn) that this call's own cursor advance triggers as a side effect. Every
    // resolver below already log.push()es exactly what it returns (confirmed for each one), so slicing
    // the shared log from this mark is a superset of the old hand-assembled `events`, not a behavior
    // change for anything that already worked — it just stops silently dropping what `positionCursor()`/
    // `beginRound()`/`beginTurn()` logged as bare-statement side effects.
    const startLen = log.length;
    const actor = current();
    if (!actor) return log.slice(startLen);
    switch (action.type) {
      case 'move':
        if (action.to) applyMove(actor, action.to);
        break;
      case 'melee':
        applyMelee(actor, action.targetId, action.allowAlly);
        break;
      case 'missile':
        applyMissile(actor, action.targetId, action.allowAlly);
        break;
      case 'cast':
        applyCast(actor, action.spellId, action.to, action.targetId);
        break;
      case 'turn':
        applyTurn(actor);
        checkMoraleSweep();
        return log.slice(startLen);
      case 'bandage':
        applyBandage(actor);
        return log.slice(startLen);
      case 'flee':
        applyFlee(actor);
        return log.slice(startLen);
      case 'guard': {
        if (!canGuard(actor)) return log.slice(startLen);
        // CT.7d — readying a GUARD: the figure holds its action; the first foe to move into its melee
        // reach takes a free strike (see triggerGuardReactions). Models CoK's own Guard/Guarding stance.
        actor.flags.add('guarding');
        const ev: TacticalEvent = { round, type: 'guard', actor: actor.id, guarding: true };
        log.push(ev);
        acted = true;
        endTurn();
        return log.slice(startLen);
      }
      case 'wait':
        log.push({ round, type: 'wait', actor: actor.id });
        endTurn();
        return log.slice(startLen);
      case 'delay':
        applyDelay(actor); // CT.7e — defer to act later this round (no turn-advance if it deferred)
        return log.slice(startLen);
      case 'endTurn':
        endTurn();
        return log.slice(startLen);
    }
    // CT.6 — a blow that landed (or felled a foe) can break the survivors' morale: re-check now so a
    // rout/surrender is reactive (the instant an ally drops), not deferred to the monster's next turn.
    if (action.type === 'melee' || action.type === 'missile' || action.type === 'cast') {
      checkMoraleSweep();
    }
    // After an attack with no movement left, or a move that used the last point while already
    // acted, the turn is spent — advance. Otherwise leave the cursor for another sub-action.
    if (acted && moveLeft <= 0) endTurn();
    else positionCursor();
    return log.slice(startLen);
  }

  function finish(): TacticalResult {
    let guard = 0;
    while (!over && guard++ < 10000) {
      if (!current()) break;
      apply(aiAction());
    }
    positionCursor();
    return result();
  }

  function result(): TacticalResult {
    return {
      outcome: over ? (log.at(-1)?.outcome ?? 'draw') : 'draw',
      rounds: round,
      log,
      survivors: combatants.filter(isActive),
      xpAwarded,
      fled: partyFled,
    };
  }

  // Kick off the first round/turn so `current()` is valid immediately.
  positionCursor();

  return {
    combatants,
    terrain,
    log,
    round: () => round,
    isOver: () => { positionCursor(); return over; },
    allyAttackConfirmed: () => allyAttackConfirmedFlag,
    teamCounts,
    targetIntentOf: (id: string) => combatants.find((c) => c.id === id)?.actionTargetId ?? null,
    current,
    movementLeft: () => moveLeft / 2, // expose whole cells to the UI (internal budget is half-steps)
    hasActed: () => acted,
    reachable: () => {
      const actor = current();
      return actor ? reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1) : new Map();
    },
    meleeTargets: () => { const a = current(); return a ? meleeTargets(a) : []; },
    missileTargets: () => { const a = current(); return a ? missileTargets(a) : []; },
    legalActions,
    canTurnUndead: () => { const a = current(); return !!a && a.turnLevel !== undefined && !a.flags.has('feared') && !acted && turnableUndead(a).length > 0; },
    canBandage: () => { const a = current(); return !!a && canBandage(a); },
    canBackstab: (targetId?: string) => {
      const a = current();
      if (!a || a.backstabLevel === undefined || a.flags.has('feared')) return false;
      const reach = meleeTargets(a).filter((t) => !targetId || t.id === targetId);
      return reach.some((t) => isBehindTarget(t.facing, t.pos, a.pos));
    },
    isBehind: (targetId: string) => {
      const a = current();
      const t = combatants.find((c) => c.id === targetId);
      return !!a && !!t && isBehindTarget(t.facing, t.pos, a.pos);
    },
    hazardAt: (col: number, row: number) => terrain.hazard?.(col, row),
    missileBracket: (targetId: string) => {
      const a = current();
      const t = combatants.find((c) => c.id === targetId);
      if (!a || !t) return null;
      const w = missileWeapon(a);
      if (!w) return null;
      // M51.S1 — footprint-aware, matching resolveHit()'s own to-hit measurement (a plain anchor-to-
      // anchor chebyshev() disagreed with figureDistance() for a Large (2x2) attacker/target near a
      // bracket boundary).
      return missileRangeBracket(figureDistance(a, t), w.range ?? 0);
    },
    isGuarding: (id: string) => combatants.find((c) => c.id === id)?.flags.has('guarding') ?? false,
    canDelay,
    sizeOf: (id: string) => combatants.find((c) => c.id === id)?.size ?? 1,
    slaysHelpless: () => ruleset !== 'gen2',
    conditionOf: (id: string) => {
      const c = combatants.find((x) => x.id === id);
      if (!c) return 'ok';
      if (c.flags.has('dead')) return 'dead';
      if (c.flags.has('unconscious') || c.flags.has('dying') || c.hp <= 0) return 'unconscious';
      return 'ok';
    },
    partyCanEscape,
    attemptPartyFlee,
    aiAction,
    apply,
    finish,
    result,
  };
}
