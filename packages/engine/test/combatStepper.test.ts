/**
 * CS.8 / A3.2 — interactive combat stepper.
 *
 * The headline guarantee: driving the stepper with the default action every step reproduces
 * `runCombat` **byte-for-byte** (same log, outcome, rounds, XP) across seeds and rosters — so the
 * interactive path shares the auto-resolve path's exact rules + RNG draw order, no duplication.
 * Plus stepper-specific behaviour: current actor / legal actions, player-chosen target, and the
 * guard/wait turn-skip.
 */
import { describe, it, expect } from 'vitest';
import {
  runCombat,
  runCombatViaStepper,
  createCombat,
  type Combatant,
} from '../src/index.js';

function fighter(id: string, side: 'party' | 'enemy', over: Partial<Combatant> = {}): Combatant {
  return { id, name: id, side, hp: 10, maxHp: 10, thac0: 20, ac: 10, damage: { count: 1, sides: 6, bonus: 0 }, ...over };
}

/** Three rosters that exercise different end conditions (clean win, draw-on-cap, attrition). */
const rosters: Array<{ name: string; make: () => Combatant[]; opts: { seed: number; roundCap?: number } }> = [
  {
    name: 'hero clears the field',
    make: () => [
      fighter('hero', 'party', { hp: 100, maxHp: 100, thac0: 1, ac: -10, damage: { count: 10, sides: 10, bonus: 10 } }),
      fighter('gobA', 'enemy', { hp: 4, thac0: 60, ac: 10, xp: 10 }),
      fighter('gobB', 'enemy', { hp: 4, thac0: 60, ac: 10, xp: 10 }),
    ],
    opts: { seed: 1 },
  },
  {
    name: 'even brawl',
    make: () => [fighter('h', 'party', { hp: 12 }), fighter('o', 'enemy', { hp: 12, thac0: 18, xp: 35 })],
    opts: { seed: 99 },
  },
  {
    name: 'multi-vs-multi attrition',
    make: () => [
      fighter('p1', 'party', { hp: 14, thac0: 16, xp: 0 }),
      fighter('p2', 'party', { hp: 11, thac0: 17 }),
      fighter('e1', 'enemy', { hp: 9, thac0: 18, ac: 8, xp: 20 }),
      fighter('e2', 'enemy', { hp: 13, thac0: 17, ac: 6, xp: 40 }),
      fighter('e3', 'enemy', { hp: 7, thac0: 19, ac: 9, xp: 15 }),
    ],
    opts: { seed: 0x1234, roundCap: 200 },
  },
];

describe('combat stepper — runCombat equivalence', () => {
  for (const r of rosters) {
    it(`reproduces runCombat byte-for-byte: ${r.name}`, () => {
      const expected = runCombat(r.make(), r.opts);
      const viaStepper = runCombatViaStepper(r.make(), r.opts);
      expect(viaStepper.log).toEqual(expected.log);
      expect(viaStepper.outcome).toBe(expected.outcome);
      expect(viaStepper.rounds).toBe(expected.rounds);
      expect(viaStepper.xpAwarded).toBe(expected.xpAwarded);
      expect(viaStepper.survivors.map((c) => c.id).sort()).toEqual(expected.survivors.map((c) => c.id).sort());
    });
  }

  it('matches runCombat over many seeds (fuzz)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const make = (): Combatant[] => [
        fighter('p1', 'party', { hp: 13, thac0: 17 }),
        fighter('p2', 'party', { hp: 10, thac0: 18 }),
        fighter('e1', 'enemy', { hp: 12, thac0: 18, ac: 7, xp: 25 }),
        fighter('e2', 'enemy', { hp: 8, thac0: 19, ac: 9, xp: 15 }),
      ];
      const a = runCombat(make(), { seed, roundCap: 200 });
      const b = runCombatViaStepper(make(), { seed, roundCap: 200 });
      expect(b.log).toEqual(a.log);
      expect(b.outcome).toBe(a.outcome);
    }
  });
});

describe('combat stepper — interactive surface', () => {
  it('exposes the current actor and its legal actions', () => {
    const s = createCombat([fighter('h', 'party', { hp: 30, thac0: 10 }), fighter('o', 'enemy', { hp: 30, thac0: 10 })], { seed: 3 });
    const actor = s.current();
    expect(actor).not.toBeNull();
    const actions = s.legalActions();
    // At least one attack (the single foe) plus guard + wait.
    expect(actions.some((a) => a.type === 'attack')).toBe(true);
    expect(actions.some((a) => a.type === 'guard')).toBe(true);
    expect(actions.some((a) => a.type === 'wait')).toBe(true);
    const def = s.defaultAction();
    expect(def?.type).toBe('attack');
  });

  it('lets the controller pick a specific target (still deterministic math)', () => {
    const s = createCombat(
      [
        fighter('hero', 'party', { hp: 50, thac0: 1, damage: { count: 1, sides: 4, bonus: 0 } }),
        fighter('weak', 'enemy', { hp: 100, ac: 10, xp: 5 }),
        fighter('boss', 'enemy', { hp: 100, ac: 10, xp: 500 }),
      ],
      { seed: 7 },
    );
    // Force the hero (if acting first) to strike 'boss' instead of the default 'boss'/'weak' order.
    const actor = s.current();
    if (actor?.side === 'party') {
      const before = s.combatants.find((c) => c.id === 'boss')!.hp;
      const events = s.apply({ type: 'attack', targetId: 'boss' });
      const atk = events.find((e) => e.type === 'attack');
      expect(atk?.target).toBe('boss');
      if (atk?.hit) {
        expect(s.combatants.find((c) => c.id === 'boss')!.hp).toBeLessThan(before);
      }
    }
  });

  it('guard/wait forgo the attack and consume no RNG (same d20 stream as a later attack)', () => {
    // A guard turn must not advance the RNG: the subsequent attacker's roll matches a run where
    // the first actor attacked nobody only because there were no foes... so instead compare the
    // d20 of actor 2 between "actor1 guards" and a control where we read the same stream directly.
    const mk = (): Combatant[] => [
      fighter('a', 'party', { hp: 40, thac0: 10 }),
      fighter('b', 'enemy', { hp: 40, thac0: 10 }),
    ];
    const guarded = createCombat(mk(), { seed: 11 });
    guarded.apply({ type: 'guard' }); // actor 1 skips — no d20
    const evGuard = guarded.apply({ type: 'attack' }); // actor 2 attacks → first d20 of the battle
    const rollAfterGuard = evGuard.find((e) => e.type === 'attack')?.roll;

    const control = createCombat(mk(), { seed: 11 });
    const evCtrl = control.apply({ type: 'attack' }); // actor 1 attacks → first d20 of the battle
    const firstRoll = evCtrl.find((e) => e.type === 'attack')?.roll;

    // Both consume initiative (2× d10) at round start; the guard path's first d20 equals the
    // control's first d20 because guard drew no RNG in between.
    expect(rollAfterGuard).toBe(firstRoll);
  });
});
