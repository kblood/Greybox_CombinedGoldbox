/**
 * Interactive combat stepper (CS.8 / A3.2).
 *
 * `runCombat` (combat.ts) resolves a whole battle internally — perfect for the auto-resolve path
 * and the goldens, but the *player-facing* tactical screen (CS.9) needs to drive combat one action
 * at a time: show whose turn it is, offer legal actions, take input, apply it, append to the log,
 * repeat. This module adds that **without duplicating any rules**: it re-uses the exact same
 * `Rng`, initiative model, targeting order (`bySideThenId`/`livingOf`), to-hit threshold and damage
 * roll, in the **same draw order** as `runCombat`. Driving the stepper with `defaultAction()` every
 * step therefore produces a byte-identical log + result to `runCombat` — pinned by
 * `combatStepper.test.ts`. The interactive layer just lets the controller substitute a different
 * (still legal) action for a party unit before `apply`.
 *
 * Turn model (mirrors `runCombat` precisely):
 *  - At a round boundary: if either side is wiped or the round cap is reached, push the terminal
 *    `end` event and stop; otherwise begin a new round — roll 1d10 initiative for **every** living
 *    combatant in array order, sort ascending (ties: party-before-enemy then id).
 *  - Walk the initiative order; an actor that died earlier in the round is skipped (no roll); if the
 *    acting side's foes are all dead mid-round the round ends immediately (exactly `runCombat`'s
 *    `break`). The acting unit takes one action.
 *  - `attack` is the only RNG-consuming / rules action (d20 to-hit then damage dice); `guard`/`wait`
 *    /`move` forgo the attack and consume no RNG (stepper-level — the rules core has no positions).
 */
import { Rng } from '../util/rng.js';
import {
  bySideThenId,
  livingOf,
  type Combatant,
  type CombatSide,
  type CombatEvent,
  type CombatOutcome,
  type CombatResult,
  type CombatOptions,
} from './combat.js';

export type CombatActionType = 'attack' | 'guard' | 'wait' | 'move';

export interface CombatAction {
  type: CombatActionType;
  /** Acting combatant id (defaults to the current actor when omitted). */
  actorId?: string;
  /** Target id (attack). Defaults to the first living foe in stable order. */
  targetId?: string;
  /** Destination cell (move) — stepper-level only; the rules core has no positions. */
  to?: { col: number; row: number };
}

export interface CombatStepper {
  /** The live combatant array (mutated in place — hp decrements). */
  readonly combatants: Combatant[];
  /** The structured event log (grows as actions apply). */
  readonly log: CombatEvent[];
  /** Current round number (0 before the first round begins). */
  round(): number;
  /** True once the terminal `end` event has been pushed. */
  isOver(): boolean;
  /** The combatant about to act, or null when combat is over. */
  current(): Combatant | null;
  /** The legal actions for the current actor (attack each living foe, or guard/wait). */
  legalActions(): CombatAction[];
  /** The action the rules core would take by default (attack the first living foe). */
  defaultAction(): CombatAction | null;
  /** Apply an action for the current actor (defaults to {@link defaultAction}); returns the events
   *  it produced and advances to the next actor. */
  apply(action?: CombatAction): CombatEvent[];
  /** Resolve the rest of the battle with the default action each step; returns the final result. */
  finish(): CombatResult;
  /** The current result snapshot (outcome/rounds/log/survivors/xp). */
  result(): CombatResult;
}

const foeSideOf = (c: Combatant): CombatSide => (c.side === 'party' ? 'enemy' : 'party');

/**
 * Create an interactive combat stepper over `combatants` (mutated in place — pass clones to keep
 * the originals). Same `seed`/`roundCap` semantics as `runCombat`.
 */
export function createCombat(combatants: Combatant[], opts: CombatOptions = {}): CombatStepper {
  const rng = new Rng(opts.seed ?? 0x1234);
  const roundCap = opts.roundCap ?? 100;
  const log: CombatEvent[] = [];

  let round = 0;
  let order: Combatant[] = [];
  let oidx = 0;
  let over = false;
  let xpAwarded = 0;

  const sidesAlive = () => ({
    party: livingOf(combatants, 'party').length,
    enemy: livingOf(combatants, 'enemy').length,
  });

  function beginRound(): void {
    round++;
    order = combatants
      .filter((c) => c.hp > 0)
      .map((c) => ({ c, init: rng.die(10) }))
      .sort((a, b) => a.init - b.init || bySideThenId(a.c, b.c))
      .map((e) => e.c);
    oidx = 0;
  }

  function finalizeEnd(): void {
    const alive = sidesAlive();
    const outcome: CombatOutcome =
      alive.enemy === 0 && alive.party > 0
        ? 'party'
        : alive.party === 0 && alive.enemy > 0
          ? 'enemy'
          : 'draw';
    log.push({ round, type: 'end', outcome });
    over = true;
  }

  /** Move the cursor to the next actor that will actually act, handling round boundaries + end. */
  function positionCursor(): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (over) return;
      if (oidx >= order.length) {
        // Round boundary (or pre-start). Resolve end conditions exactly as runCombat's while-head.
        const alive = sidesAlive();
        if (alive.party === 0 || alive.enemy === 0) return finalizeEnd();
        if (round >= roundCap) return finalizeEnd();
        beginRound();
        continue;
      }
      const actor = order[oidx]!;
      if (actor.hp <= 0) {
        oidx++; // died earlier this round → skipped, no roll
        continue;
      }
      if (livingOf(combatants, foeSideOf(actor)).length === 0) {
        // Foe side wiped mid-round → runCombat `break`s the round; jump to the boundary check.
        oidx = order.length;
        continue;
      }
      return; // cursor is on a valid actor
    }
  }

  function current(): Combatant | null {
    positionCursor();
    return over ? null : order[oidx] ?? null;
  }

  function defaultAction(): CombatAction | null {
    const actor = current();
    if (!actor) return null;
    const foes = livingOf(combatants, foeSideOf(actor)).sort(bySideThenId);
    return { type: 'attack', actorId: actor.id, targetId: foes[0]!.id };
  }

  function legalActions(): CombatAction[] {
    const actor = current();
    if (!actor) return [];
    const foes = livingOf(combatants, foeSideOf(actor)).sort(bySideThenId);
    const actions: CombatAction[] = foes.map((f) => ({ type: 'attack', actorId: actor.id, targetId: f.id }));
    actions.push({ type: 'guard', actorId: actor.id }, { type: 'wait', actorId: actor.id });
    return actions;
  }

  function applyAttack(actor: Combatant, targetId: string | undefined): CombatEvent[] {
    const foes = livingOf(combatants, foeSideOf(actor)).sort(bySideThenId);
    const target = (targetId && combatants.find((c) => c.id === targetId && c.hp > 0)) || foes[0]!;
    const roll = rng.die(20);
    const needed = actor.thac0 - target.ac;
    const hit = roll === 20 ? true : roll === 1 ? false : roll >= needed;
    const events: CombatEvent[] = [];

    if (!hit) {
      events.push({ round, type: 'attack', attacker: actor.id, target: target.id, roll, needed, hit: false, targetHpAfter: target.hp });
      log.push(...events);
      return events;
    }

    const dmg = Math.max(1, rng.roll(actor.damage.count, actor.damage.sides, actor.damage.bonus));
    target.hp -= dmg;
    const slain = target.hp <= 0;
    events.push({
      round,
      type: 'attack',
      attacker: actor.id,
      target: target.id,
      roll,
      needed,
      hit: true,
      damage: dmg,
      targetHpAfter: Math.max(0, target.hp),
    });
    if (slain) {
      events.push({ round, type: 'slain', attacker: actor.id, target: target.id });
      if (target.side === 'enemy') xpAwarded += target.xp ?? 0;
    }
    log.push(...events);
    return events;
  }

  function apply(action?: CombatAction): CombatEvent[] {
    const actor = current();
    if (!actor) return [];
    const act = action ?? defaultAction()!;
    let events: CombatEvent[] = [];
    if (act.type === 'attack') {
      events = applyAttack(actor, act.targetId);
    }
    // guard / wait / move: the actor forgoes its attack — no RNG, no core event.
    oidx++; // this actor's turn is done
    return events;
  }

  function finish(): CombatResult {
    while (!over) {
      const a = defaultAction();
      if (!a) break;
      apply(a);
    }
    positionCursor();
    return result();
  }

  function result(): CombatResult {
    return {
      outcome: over ? (log.at(-1)?.outcome ?? 'draw') : 'draw',
      rounds: round,
      log,
      survivors: combatants.filter((c) => c.hp > 0),
      xpAwarded,
    };
  }

  return {
    combatants,
    log,
    round: () => round,
    isOver: () => {
      positionCursor();
      return over;
    },
    current,
    legalActions,
    defaultAction,
    apply,
    finish,
    result,
  };
}

/**
 * Re-express `runCombat` over the stepper: drive it with the default action every step. Produces a
 * byte-identical `CombatResult` to `runCombat` (proven in `combatStepper.test.ts`) — the regression
 * anchor that the interactive path shares the auto-resolve path's exact math.
 */
export function runCombatViaStepper(combatants: Combatant[], opts: CombatOptions = {}): CombatResult {
  return createCombat(combatants, opts).finish();
}
