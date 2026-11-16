/**
 * Tactical (grid) combat engine tests (CT.1).
 *
 * Covers the spatial mechanics the positionless `combat.ts` never had: Chebyshev range, movement
 * reachability with cost + blockers, line-of-fire occlusion, melee adjacency gating, missile
 * range/LoF/ammo, flee-off-edge, and a full AI-driven battle that terminates deterministically.
 */
import { describe, it, expect } from 'vitest';
import { shortestPathToFootprintRange } from '../src/combat/tactical.js';
import {
  createTacticalCombat,
  chebyshev,
  reachableCells,
  lineCells,
  turnUndeadOutcome,
  classifyUndead,
  backstabMultiplier,
  isBehindTarget,
  missileRangeBracket,
  rangeBracketToHit,
  footprintCells,
  footprintDistance,
  TERRAIN_COST,
  type TacticalCombatant,
  type TerrainGrid,
  type Weapon,
  type TacticalSpell,
} from '../src/index.js';

const openField = (width: number, height: number): TerrainGrid => ({ width, height });

function fighter(id: string, side: 'party' | 'enemy', col: number, row: number, over: Partial<TacticalCombatant> = {}): TacticalCombatant {
  return {
    id, name: id, side,
    hp: 20, maxHp: 20, thac0: 15, ac: 5,
    damage: { count: 1, sides: 8, bonus: 0 },
    pos: { col, row }, facing: 0, move: 4, attacksPerRound: 1,
    weapons: [{ name: 'sword', kind: 'melee', damage: { count: 1, sides: 8, bonus: 0 }, reach: 1 }],
    flags: new Set(),
    xp: 10,
    ...over,
  };
}

const bow: Weapon = { name: 'bow', kind: 'missile', damage: { count: 1, sides: 6, bonus: 0 }, range: 8, ammo: 20 };

describe('tactical geometry helpers', () => {
  it('chebyshev treats a diagonal as one square', () => {
    expect(chebyshev({ col: 0, row: 0 }, { col: 3, row: 0 })).toBe(3);
    expect(chebyshev({ col: 0, row: 0 }, { col: 3, row: 3 })).toBe(3); // pure diagonal = 3, not 6
    expect(chebyshev({ col: 1, row: 1 }, { col: 1, row: 1 })).toBe(0);
  });

  it('reachableCells charges half-steps: orthogonal 2, gen1 diagonal 4 (Manhattan 2×, RE.6-verified)', () => {
    // Default diagCost = 4 (gen1 = CoK/DoK, verified 2×/Manhattan in CoK's own movement handler 0x118D8).
    // Budget 4 half-steps = 2 orthogonal cells, or exactly 1 diagonal step.
    const reach = reachableCells({ col: 5, row: 5 }, 4, openField(11, 11), new Set());
    expect(reach.get('5,5')).toBe(0);
    expect(reach.get('7,5')).toBe(4); // 2 orthogonal east = 2+2
    expect(reach.get('3,5')).toBe(4); // 2 orthogonal west
    expect(reach.get('6,6')).toBe(4); // one diagonal = 4 half-steps (2 cells, gen1 2×)
    expect(reach.has('7,7')).toBe(false); // 2 diagonals = 8 > 4
    expect(reach.has('8,5')).toBe(false); // 3 orthogonal = 6 > 4
  });

  it('reachableCells diagCost override charges gen2 diagonal 3 (DQK provisional 1.5×)', () => {
    // Passing diagCost = 3 reproduces the gen2/DQK provisional 1.5× diagonal cost.
    const reach = reachableCells({ col: 5, row: 5 }, 4, openField(11, 11), new Set(), 3);
    expect(reach.get('6,6')).toBe(3); // one diagonal = 3 half-steps (1.5 cells)
    expect(reach.has('7,7')).toBe(false); // 2 diagonals = 6 > 4
  });

  it('reachableCells routes around a blocked figure', () => {
    // A wall of blockers at col 6, rows 4..6 forces a diagonal detour around its top.
    const blocked = new Set(['6,4', '6,5', '6,6']);
    const reach = reachableCells({ col: 5, row: 5 }, 6, openField(11, 11), blocked);
    expect(reach.has('6,5')).toBe(false); // occupied
    expect(reach.has('7,3')).toBe(false); // crossing past the wall to col 7 needs >6 half-steps
    expect(reach.get('6,3')).toBe(6); // detour (5,5)→(5,4) orth 2 → (6,3) diag 4 = 6 (gen1 2×)
  });

  it('reachableCells honours per-cell terrain cost (scaled by the half-step rule)', () => {
    const terrain: TerrainGrid = { width: 11, height: 11, cost: (c) => (c === 6 ? 3 : 1) };
    const reach = reachableCells({ col: 5, row: 5 }, 4, terrain, new Set());
    expect(reach.has('6,5')).toBe(false); // entering col 6 orthogonally costs 2×3 = 6 > 4
    expect(reach.get('5,3')).toBe(4); // 2 open vertical cells = 2+2
  });

  it.each([
    { terrainName: 'expensive middle', middleCost: 10, diagCost: 4, expectedCost: 12 },
    { terrainName: 'expensive middle', middleCost: 10, diagCost: 3, expectedCost: 10 },
    { terrainName: 'all-open control', middleCost: 1, diagCost: 4, expectedCost: 8 },
    { terrainName: 'all-open control', middleCost: 1, diagCost: 3, expectedCost: 8 },
  ])('shortestPathToFootprintRange minimizes terrain cost: $terrainName, diagonal $diagCost', ({ middleCost, diagCost, expectedCost }) => {
    const start = { col: 0, row: 1 };
    const target = { col: 4, row: 1 };
    const isMiddle = (col: number, row: number) => row === 1 && col >= 1 && col <= 3;
    const cellCost = (col: number, row: number) => isMiddle(col, row) ? middleCost : 1;
    const terrain: TerrainGrid = { width: 5, height: 3, cost: cellCost };
    const path = shortestPathToFootprintRange(start, terrain, new Set(), target, 1, 0, diagCost);

    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual(target);
    expect(path!).not.toContainEqual(start);
    if (middleCost > 1) {
      expect(path!.some(({ col, row }) => isMiddle(col, row))).toBe(false);
    }
    // Paths exclude start; charge each destination from the preceding position, not by length.
    let previous = start;
    let totalCost = 0;
    for (const cell of path!) {
      const diagonal = cell.col !== previous.col && cell.row !== previous.row;
      totalCost += (diagonal ? diagCost : 2) * Math.max(1, cellCost(cell.col, cell.row));
      previous = cell;
    }
    expect(totalCost).toBe(expectedCost); // Equal-cost routes may differ; do not pin waypoints.
  });

  it('lineCells lists the cells strictly between two points', () => {
    const cells = lineCells({ col: 0, row: 0 }, { col: 4, row: 0 });
    expect(cells).toEqual([{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }]);
    expect(lineCells({ col: 0, row: 0 }, { col: 1, row: 0 })).toEqual([]); // adjacent → nothing between
  });
});

describe('tactical melee', () => {
  it('only lets an adjacent foe be meleed', () => {
    const p = fighter('p', 'party', 5, 5);
    const e = fighter('e', 'enemy', 7, 5); // 2 away — out of reach
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 1 });
    // Force p to act first regardless of initiative by checking targets for whoever is up.
    const actor = c.current()!;
    if (actor.id === 'p') {
      expect(c.meleeTargets().length).toBe(0); // nothing adjacent
      c.apply({ type: 'move', to: { col: 6, row: 5 } }); // close to adjacency
      expect(c.meleeTargets().map((t) => t.id)).toContain('e');
    }
    expect(c.isOver()).toBe(false);
  });

  it('a melee attack rolls to-hit and can damage / slay', () => {
    // thac0 1 ⇒ always hits; a maul doing 10×1+50 ⇒ ~60 dmg one-shots. Melee uses the WEAPON's
    // damage (not the combatant's `damage` fallback, which only voices weaponless monsters/fists).
    const p = fighter('p', 'party', 5, 5, { thac0: 1, weapons: [{ name: 'maul', kind: 'melee', damage: { count: 10, sides: 1, bonus: 50 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { hp: 12, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    // p acts (enemy has move 0 / no attacks, can't meaningfully act): drive until p melees.
    let guard = 0;
    while (!c.isOver() && guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'p') { c.apply({ type: 'melee', targetId: 'e' }); break; }
      c.apply(c.aiAction());
    }
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(c.log.some((ev) => ev.type === 'slain' && ev.target === 'e')).toBe(true);
  });

  it('a high-level fighter makes all its attacks in one melee action', () => {
    const p = fighter('p', 'party', 5, 5, { thac0: 1, attacksPerRound: 3, damage: { count: 1, sides: 1, bonus: 0 } });
    const e = fighter('e', 'enemy', 6, 5, { hp: 99, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    let guard = 0;
    while (guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'p') { const evs = c.apply({ type: 'melee', targetId: 'e' });
        expect(evs.filter((ev) => ev.type === 'attack').length).toBe(3); break; }
      c.apply(c.aiAction());
    }
  });

  it('requires explicit confirmation to melee an ally', () => {
    const p = fighter('p', 'party', 5, 5, { thac0: 1, initiative: 20 });
    const ally = fighter('a', 'party', 6, 5, { hp: 20, maxHp: 20, ac: 10, initiative: 10 });
    const e = fighter('e', 'enemy', 9, 5, { initiative: 1 });
    const c = createTacticalCombat([p, ally, e], openField(12, 10), { seed: 1 });
    expect(c.current()?.id).toBe('p');
    expect(c.allyAttackConfirmed()).toBe(false);
    expect(c.teamCounts()).toEqual({ party: 2, enemy: 1 });
    expect(c.legalActions().some((a) => a.type === 'melee' && a.targetId === 'a')).toBe(false);
    expect(c.apply({ type: 'melee', targetId: 'a' })).toEqual([]);
    expect(c.allyAttackConfirmed()).toBe(false);
    expect(c.teamCounts()).toEqual({ party: 2, enemy: 1 });
    const evs = c.apply({ type: 'melee', targetId: 'a', allowAlly: true });
    const hit = evs.find((ev) => ev.type === 'attack' && ev.target === 'a');
    expect(hit).toBeTruthy();
    expect(evs.some((ev) => ev.type === 'side-change')).toBe(false);
    expect(c.allyAttackConfirmed()).toBe(true);
    expect(c.teamCounts()).toEqual({ party: 2, enemy: 1 });
    expect(ally.hp).toBeLessThan(20);
  });

  it('turns healthy NPC-controlled allies hostile after confirmed ally attack', () => {
    const p = fighter('p', 'party', 5, 5, { thac0: 1, initiative: 20 });
    const pc = fighter('pc', 'party', 4, 5, { hp: 20, maxHp: 20, ac: 10, initiative: 10, actionTargetId: 'e' });
    const npcTarget = fighter('n1', 'party', 6, 5, { hp: 20, maxHp: 20, ac: 10, initiative: 9, npcControlled: true, actionTargetId: 'e' });
    const npcBystander = fighter('n2', 'party', 5, 6, { hp: 20, maxHp: 20, initiative: 8, npcControlled: true, actionTargetId: 'pc' });
    const downNpc = fighter('down', 'party', 1, 1, { hp: 0, maxHp: 20, initiative: 7, npcControlled: true, actionTargetId: 'e', flags: new Set(['unconscious']) });
    const e = fighter('e', 'enemy', 9, 5, { initiative: 1 });
    const c = createTacticalCombat([p, pc, npcTarget, npcBystander, downNpc, e], openField(12, 10), { seed: 1 });
    expect(c.allyAttackConfirmed()).toBe(false);
    expect(c.teamCounts()).toEqual({ party: 4, enemy: 1 });
    expect(c.targetIntentOf('n1')).toBe('e');
    expect(c.targetIntentOf('n2')).toBe('pc');
    expect(c.targetIntentOf('pc')).toBe('e');
    expect(c.targetIntentOf('down')).toBe('e');

    const evs = c.apply({ type: 'melee', targetId: 'n1', allowAlly: true });

    expect(c.allyAttackConfirmed()).toBe(true);
    expect(c.teamCounts()).toEqual({ party: 2, enemy: 3 });
    expect(evs.filter((ev) => ev.type === 'side-change').map((ev) => ev.target).sort()).toEqual(['n1', 'n2']);
    expect(npcTarget.side).toBe('enemy');
    expect(npcBystander.side).toBe('enemy');
    expect(pc.side).toBe('party');
    expect(downNpc.side).toBe('party');
    expect(c.targetIntentOf('p')).toBe('n1');
    expect(c.targetIntentOf('n1')).toBeNull();
    expect(c.targetIntentOf('n2')).toBeNull();
    expect(c.targetIntentOf('pc')).toBe('e');
    expect(c.targetIntentOf('down')).toBe('e');
    expect(evs.some((ev) => ev.type === 'attack' && ev.target === 'n1')).toBe(true);
  });
});

describe('tactical missiles', () => {
  it('shoots a foe in range over a clear line', () => {
    const p = fighter('p', 'party', 1, 1, { thac0: 1, weapons: [bow], attacksPerRound: 1 });
    const e = fighter('e', 'enemy', 5, 1, { hp: 8, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 7 });
    let guard = 0;
    while (!c.isOver() && guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'p') {
        expect(c.missileTargets().map((t) => t.id)).toContain('e');
        c.apply({ type: 'missile', targetId: 'e' });
        break;
      }
      c.apply(c.aiAction());
    }
    expect(p.weapons[0]!.ammo).toBe(19); // one arrow spent
    expect(c.log.some((ev) => ev.type === 'attack' && ev.missile)).toBe(true);
  });

  it('a body between shooter and target blocks the shot', () => {
    const p = fighter('p', 'party', 1, 1, { weapons: [bow] });
    const blocker = fighter('b', 'enemy', 3, 1, { move: 0 });
    const e = fighter('e', 'enemy', 5, 1, { move: 0 });
    const c = createTacticalCombat([p, blocker, e], openField(11, 11), { seed: 9 });
    // Whoever p is, p's missile targets must exclude the shadowed 'e' (blocked by 'b' at 3,1).
    const actor = c.current()!;
    if (actor.id === 'p') {
      const ids = c.missileTargets().map((t) => t.id);
      expect(ids).toContain('b'); // the nearer foe is shootable
      expect(ids).not.toContain('e'); // the farther foe is shadowed
    }
  });

  it('a foe beyond range cannot be shot', () => {
    const p = fighter('p', 'party', 0, 0, { weapons: [{ ...bow, range: 3 }] });
    const e = fighter('e', 'enemy', 9, 0, { move: 0 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 11 });
    const actor = c.current()!;
    if (actor.id === 'p') expect(c.missileTargets().length).toBe(0);
  });
});

describe('tactical flee + full battle', () => {
  it('a fleeing figure that reaches the edge leaves the field', () => {
    const p = fighter('p', 'party', 2, 5, { move: 4 });
    const e = fighter('e', 'enemy', 8, 5, { move: 0 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 13 });
    let guard = 0;
    while (!c.isOver() && guard++ < 30) {
      const a = c.current()!;
      if (a.id === 'p') { c.apply({ type: 'flee' }); }
      else c.apply(c.aiAction());
      if (p.flags.has('fled')) break;
    }
    expect(p.flags.has('fled')).toBe(true);
    expect(p.pos.col).toBe(0); // walked to the west border
  });

  it('a sleeping figure is skipped and takes no turn', () => {
    const p = fighter('p', 'party', 5, 5);
    const e = fighter('e', 'enemy', 6, 5, { flags: new Set(['asleep']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 2 });
    // The enemy must never appear as the current actor (asleep → skipped every round).
    let sawEnemyTurn = false;
    let guard = 0;
    while (!c.isOver() && guard++ < 50) {
      const a = c.current();
      if (a?.id === 'e') sawEnemyTurn = true;
      c.apply(a?.id === 'p' ? { type: 'melee', targetId: 'e' } : c.aiAction());
    }
    expect(sawEnemyTurn).toBe(false);
  });

  it('0 HP is unconscious (revivable); a 10-below-zero blow is lethal (COAB damage_player)', () => {
    // Survivable down: 12 HP, take 12 damage -> exactly 0 HP, so unconscious, not dead.
    const p = fighter('p', 'party', 5, 5, { initiative: 20, thac0: 1, weapons: [{ name: 'club', kind: 'melee', damage: { count: 1, sides: 1, bonus: 11 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { initiative: 10, hp: 12, maxHp: 12, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    let guard = 0;
    while (!c.isOver() && guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'p') { c.apply({ type: 'melee', targetId: 'e' }); break; }
      c.apply(c.aiAction());
    }
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(e.flags.has('unconscious')).toBe(true);
    expect(e.flags.has('dying')).toBe(false);
    expect(e.flags.has('dead')).toBe(false);
    expect(c.log.find((ev) => ev.type === 'slain' && ev.target === 'e')?.dead).toBe(false);
  });

  it('a blow that leaves a target 1-9 HP below zero is dying, not dead', () => {
    const p = fighter('p', 'party', 5, 5, { initiative: 20, thac0: 1, weapons: [{ name: 'club', kind: 'melee', damage: { count: 1, sides: 1, bonus: 20 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { initiative: 10, hp: 12, maxHp: 12, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    let guard = 0;
    while (!c.isOver() && guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'p') { c.apply({ type: 'melee', targetId: 'e' }); break; }
      c.apply(c.aiAction());
    }
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(e.flags.has('dying')).toBe(true);
    expect(e.bleeding).toBe(9);
    expect(e.flags.has('unconscious')).toBe(false);
    expect(e.flags.has('dead')).toBe(false);
    expect(c.log.find((ev) => ev.type === 'slain' && ev.target === 'e')?.dead).toBe(false);
  });

  it('a blow exactly at hp+10 marks the target dead', () => {
    const p = fighter('p', 'party', 5, 5, { initiative: 20, thac0: 1, weapons: [{ name: 'maul', kind: 'melee', damage: { count: 1, sides: 1, bonus: 21 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { initiative: 10, hp: 12, maxHp: 12, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    let guard = 0;
    while (!c.isOver() && guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'p') { c.apply({ type: 'melee', targetId: 'e' }); break; }
      c.apply(c.aiAction());
    }
    expect(e.flags.has('dead')).toBe(true);
    expect(c.log.find((ev) => ev.type === 'slain' && ev.target === 'e')?.dead).toBe(true);
  });

  it('RE.2: under the DQK gen2 ruleset the `+10` overkill-death rule does NOT apply', () => {
    // Same overkill blow that kills outright under gen1 (CoK/DoK). DQK's combat code has no `+10`
    // literal (verified: 0 `add ax,0Ah` in its combat region), so a downed figure is recoverable,
    // not dead — see disasm-combat-dqk.md §2.4/§8.
    const p = fighter('p', 'party', 5, 5, { initiative: 20, thac0: 1, weapons: [{ name: 'maul', kind: 'melee', damage: { count: 1, sides: 1, bonus: 22 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { initiative: 10, hp: 12, maxHp: 12, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3, ruleset: 'gen2' });
    let guard = 0;
    while (!c.isOver() && guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'p') { c.apply({ type: 'melee', targetId: 'e' }); break; }
      c.apply(c.aiAction());
    }
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(e.flags.has('dying')).toBe(true);
    expect(e.flags.has('dead')).toBe(false);
    expect(c.log.find((ev) => ev.type === 'slain' && ev.target === 'e')?.dead).toBe(false);
  });

  it('a 3/2 (halfAttacks=3) fighter swings 2,1,2,1… on alternating rounds', () => {
    const p = fighter('p', 'party', 5, 5, { thac0: 1, move: 0, halfAttacks: 3, weapons: [{ name: 'pin', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { hp: 999, maxHp: 999, move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    const swingsByRound: number[] = [];
    let guard = 0;
    while (swingsByRound.length < 2 && guard++ < 40) {
      const a = c.current()!;
      if (a.id === 'p') {
        const r = c.round();
        const evs = c.apply({ type: 'melee', targetId: 'e' });
        swingsByRound[r - 1] = evs.filter((ev) => ev.type === 'attack').length;
      } else c.apply(c.aiAction());
    }
    // Round 1 (odd) = 2 swings, round 2 (even) = 1 swing.
    expect(swingsByRound[0]).toBe(2);
    expect(swingsByRound[1]).toBe(1);
  });

  it('initiative is a stored value, sorted high-first and stable across rounds (no per-round d10)', () => {
    const slow = fighter('slow', 'party', 1, 5, { initiative: 2, move: 0 });
    const fast = fighter('fast', 'enemy', 9, 5, { initiative: 9, move: 0 });
    const c = createTacticalCombat([slow, fast], openField(11, 11), { seed: 42 });
    // The higher-initiative figure is the current actor at the very start of every round.
    const firstOfRound: string[] = [];
    let lastRound = 0;
    let guard = 0;
    while (!c.isOver() && guard++ < 40 && firstOfRound.length < 3) {
      const a = c.current()!;
      if (c.round() !== lastRound) { firstOfRound.push(a.id); lastRound = c.round(); }
      c.apply({ type: 'guard' });
    }
    expect(firstOfRound.every((id) => id === 'fast')).toBe(true); // init 9 always leads, every round
  });

  it('a wounded monster whose morale breaks flees under AI control', () => {
    // morale 10% but 60% wounded ⇒ moraleFails ⇒ AI flees toward the edge.
    const e = fighter('e', 'enemy', 2, 5, { hp: 8, maxHp: 20, move: 4, morale: 10 });
    const p = fighter('p', 'party', 9, 5, { move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([e, p], openField(11, 11), { seed: 17 });
    let guard = 0;
    while (!c.isOver() && guard++ < 30) {
      const a = c.current()!;
      c.apply(a.id === 'p' ? { type: 'guard' } : c.aiAction());
      if (e.flags.has('fled')) break;
    }
    expect(c.log.some((ev) => ev.type === 'flee' && ev.actor === 'e')).toBe(true);
  });

  it('an AI-driven battle terminates with a decisive, reproducible outcome', () => {
    const make = () => createTacticalCombat(
      [
        fighter('p1', 'party', 1, 4, { weapons: [bow], hp: 24 }),
        fighter('p2', 'party', 1, 6, { hp: 28, thac0: 12 }),
        fighter('e1', 'enemy', 9, 4, { hp: 14, thac0: 17 }),
        fighter('e2', 'enemy', 9, 6, { hp: 12, thac0: 18 }),
      ],
      openField(11, 11),
      { seed: 0x55, roundCap: 60 },
    );
    const r1 = make().finish();
    const r2 = make().finish();
    expect(['party', 'enemy', 'draw']).toContain(r1.outcome);
    expect(r1.outcome).toBe(r2.outcome); // deterministic on the seed
    expect(r1.rounds).toBe(r2.rounds);
    expect(r1.log.length).toBe(r2.log.length);
    expect(r1.log.at(-1)?.type).toBe('end');
  });

  it('routes melee AI around a footprint-aware wall detour instead of guarding at a local minimum', () => {
    const wall = new Set(Array.from({ length: 7 }, (_, i) => `${i + 2},6`)); // opening at col 9
    const terrain: TerrainGrid = {
      width: 12,
      height: 12,
      blocked: (col, row) => wall.has(`${col},${row}`),
    };
    const hero = fighter('p', 'party', 6, 5, {
      initiative: 20,
      move: 2,
      thac0: 1,
      weapons: [{ name: 'maul', kind: 'melee', damage: { count: 1, sides: 1, bonus: 50 }, reach: 1 }],
    });
    const largeTarget = fighter('e', 'enemy', 6, 8, {
      size: 2,
      initiative: 1,
      move: 0,
      attacksPerRound: 0,
      weapons: [],
    });
    const combat = createTacticalCombat([hero, largeTarget], terrain, { seed: 0x1077, roundCap: 30 });
    const result = combat.finish();
    expect(result.outcome).toBe('party');
    expect(combat.log.some((event) => event.type === 'move' && event.actor === 'p')).toBe(true);
    expect(combat.log.some((event) => event.type === 'attack' && event.actor === 'p' && event.target === 'e')).toBe(true);
  });

  it('guards without tunnelling when a footprint target is fully sealed off', () => {
    const wall = new Set(Array.from({ length: 12 }, (_, col) => `${col},6`));
    const terrain: TerrainGrid = {
      width: 12,
      height: 12,
      blocked: (col, row) => wall.has(`${col},${row}`),
    };
    const hero = fighter('p', 'party', 6, 5, { initiative: 20, move: 2 });
    const largeTarget = fighter('e', 'enemy', 6, 8, {
      size: 2,
      initiative: 1,
      move: 0,
      attacksPerRound: 0,
      weapons: [],
    });
    const combat = createTacticalCombat([hero, largeTarget], terrain, { seed: 0x1077, roundCap: 3 });
    const result = combat.finish();
    expect(result.outcome).toBe('draw');
    expect(hero.pos).toEqual({ col: 6, row: 5 });
    expect(largeTarget.hp).toBe(20);
    expect(combat.log.some((event) => event.type === 'move' || event.type === 'attack')).toBe(false);
    expect(footprintCells(hero.pos, hero.size ?? 1).some((cell) => wall.has(`${cell.col},${cell.row}`))).toBe(false);
  });
});

describe('tactical in-combat spellcasting (CT.4)', () => {
  // Deterministic dice: sides=1 means each die rolls exactly 1, so {count:N,sides:1} = N. Saves are made
  // deterministic by extremes: save<=1 ⇒ d20≥1 always saves; save>=21 ⇒ never saves. (See the data-driven
  // `TacticalSpell` contract — the engine applies whatever numbers the spell carries.)
  const caster = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('w', 'party', 0, 0, { move: 0, initiative: 20, ...over });

  it('a single-target damage spell hits the aimed foe, deals its dice, and burns a slot', () => {
    const mm: TacticalSpell = { id: 'mm', name: 'Magic Missile', target: 'enemy', range: 8, area: 'single', save: 'none', damage: { count: 5, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [mm] });
    const e = fighter('e', 'enemy', 3, 0, { hp: 20, maxHp: 20, move: 0, initiative: 1, weapons: [] });
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 7 });
    expect(c.current()!.id).toBe('w');
    const evs = c.apply({ type: 'cast', spellId: 'mm', targetId: 'e' });
    const hit = evs.find((ev) => ev.type === 'cast' && ev.target === 'e')!;
    expect(hit.damage).toBe(5);
    expect(e.hp).toBe(15);
    expect(mm.usesLeft).toBe(0);
    // Out of slots ⇒ a second cast is rejected (no events, HP unchanged).
    expect(c.apply({ type: 'cast', spellId: 'mm', targetId: 'e' })).toEqual([]);
    expect(e.hp).toBe(15);
  });

  it('a burst spell with a half-save hits every foe in radius; savers take half, non-savers full', () => {
    const fb: TacticalSpell = { id: 'fb', name: 'Fireball', target: 'enemy', range: 8, area: 'burst', radius: 1, save: 'half', damage: { count: 10, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [fb] });
    const a = fighter('a', 'enemy', 5, 5, { hp: 30, maxHp: 30, move: 0, initiative: 1, weapons: [], save: 21 }); // never saves → 10
    const b = fighter('b', 'enemy', 5, 6, { hp: 30, maxHp: 30, move: 0, initiative: 1, weapons: [], save: 1 });  // always saves → 5
    const far = fighter('far', 'enemy', 9, 9, { hp: 30, maxHp: 30, move: 0, initiative: 1, weapons: [], save: 21 }); // out of radius
    const c = createTacticalCombat([w, a, b, far], openField(11, 11), { seed: 3 });
    c.apply({ type: 'cast', spellId: 'fb', to: { col: 5, row: 5 } });
    expect(a.hp).toBe(20); // 30 − 10 (failed save, full)
    expect(b.hp).toBe(25); // 30 − 5  (made save, half)
    expect(far.hp).toBe(30); // untouched, outside radius 1
  });

  it('a healing spell restores an ally up to its max HP and never overheals', () => {
    const cure: TacticalSpell = { id: 'cure', name: 'Cure Serious', target: 'ally', range: 1, area: 'single', save: 'none', heal: { count: 6, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [cure] });
    const hurt = fighter('h', 'party', 1, 0, { hp: 5, maxHp: 8, move: 0, initiative: 1, weapons: [] });
    const foe = fighter('z', 'enemy', 10, 10, { hp: 50, maxHp: 50, move: 0, initiative: 0, weapons: [] }); // keeps the battle live
    const c = createTacticalCombat([w, hurt, foe], openField(11, 11), { seed: 9 });
    const evs = c.apply({ type: 'cast', spellId: 'cure', targetId: 'h' });
    expect(hurt.hp).toBe(8); // 5 + 6 → clamped to maxHp 8
    expect(evs.find((ev) => ev.type === 'cast' && ev.target === 'h')!.healed).toBe(3);
  });

  it('a healing spell can get an unconscious ally back up in combat', () => {
    const cure: TacticalSpell = { id: 'cure', name: 'Cure Light', target: 'ally', range: 1, area: 'single', save: 'none', heal: { count: 6, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [cure] });
    const down = fighter('h', 'party', 1, 0, { hp: 0, maxHp: 8, move: 0, initiative: 1, weapons: [], flags: new Set(['unconscious']) });
    const foe = fighter('z', 'enemy', 10, 10, { hp: 50, maxHp: 50, move: 0, initiative: 0, weapons: [] });
    const c = createTacticalCombat([w, down, foe], openField(11, 11), { seed: 9 });

    const evs = c.apply({ type: 'cast', spellId: 'cure', targetId: 'h' });

    expect(down.hp).toBe(6);
    expect(down.flags.has('unconscious')).toBe(false);
    expect(evs.find((ev) => ev.type === 'cast' && ev.target === 'h')?.healed).toBe(6);
    expect(evs.find((ev) => ev.type === 'stand-up' && ev.target === 'h')?.targetHpAfter).toBe(6);
  });

  it('a healing spell can get a dying ally back up and clears the dying flag', () => {
    const cure: TacticalSpell = { id: 'cure', name: 'Cure Light', target: 'ally', range: 1, area: 'single', save: 'none', heal: { count: 6, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = fighter('w', 'party', 1, 1, { initiative: 10, preparedSpells: [cure], weapons: [] });
    const down = fighter('h', 'party', 1, 0, { hp: 0, maxHp: 8, move: 0, initiative: 1, weapons: [], flags: new Set(['dying']), bleeding: 2 });
    const foe = fighter('e', 'enemy', 10, 10, { move: 0, initiative: 0 });
    const c = createTacticalCombat([w, down, foe], openField(11, 11), { seed: 9 });

    const evs = c.apply({ type: 'cast', spellId: 'cure', targetId: 'h' });
    expect(down.hp).toBe(6);
    expect(down.flags.has('dying')).toBe(false);
    expect(down.flags.has('unconscious')).toBe(false);
    expect(evs.find((ev) => ev.type === 'stand-up' && ev.target === 'h')?.targetHpAfter).toBe(6);
  });

  it('a healing spell that stands up a dying ally also clears the bleeding counter', () => {
    const cure: TacticalSpell = { id: 'cure', name: 'Cure Light', target: 'ally', range: 1, area: 'single', save: 'none', heal: { count: 6, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = fighter('w', 'party', 1, 1, { initiative: 10, preparedSpells: [cure], weapons: [] });
    const down = fighter('h', 'party', 1, 0, { hp: 0, maxHp: 8, move: 0, initiative: 1, weapons: [], flags: new Set(['dying']), bleeding: 2 });
    const foe = fighter('e', 'enemy', 10, 10, { move: 0, initiative: 0 });
    const c = createTacticalCombat([w, down, foe], openField(11, 11), { seed: 9 });

    c.apply({ type: 'cast', spellId: 'cure', targetId: 'h' });

    expect(down.hp).toBe(6);
    expect(down.bleeding).toBeUndefined();
  });

  it('a normal healing spell cannot stand up a dead target', () => {
    const cure: TacticalSpell = { id: 'cure', name: 'Cure Light', target: 'ally', range: 1, area: 'single', save: 'none', heal: { count: 6, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [cure] });
    const dead = fighter('h', 'party', 1, 0, { hp: 0, maxHp: 8, move: 0, initiative: 1, weapons: [], flags: new Set(['dead']) });
    const foe = fighter('z', 'enemy', 10, 10, { hp: 50, maxHp: 50, move: 0, initiative: 0, weapons: [] });
    const c = createTacticalCombat([w, dead, foe], openField(11, 11), { seed: 9 });

    expect(c.apply({ type: 'cast', spellId: 'cure', targetId: 'h' })).toEqual([]);
    expect(dead.hp).toBe(0);
    expect(cure.usesLeft).toBe(1);
  });

  it('a spell whose aim is out of range is rejected and keeps its slot', () => {
    const mm: TacticalSpell = { id: 'mm', name: 'Magic Missile', target: 'enemy', range: 2, area: 'single', save: 'none', damage: { count: 5, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [mm] });
    const e = fighter('e', 'enemy', 6, 0, { hp: 20, maxHp: 20, move: 0, initiative: 1, weapons: [] }); // distance 6 > range 2
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 1 });
    expect(c.apply({ type: 'cast', spellId: 'mm', targetId: 'e' })).toEqual([]);
    expect(e.hp).toBe(20);
    expect(mm.usesLeft).toBe(1); // not consumed
  });

  it('a zone-only spell casts without immediate damage/status and burns its slot', () => {
    const cloudkill: TacticalSpell = { id: 'cloudkill', name: 'Cloudkill', target: 'enemy', range: 8, area: 'burst', save: 'none', zone: { kind: 'cloudkill', rounds: 5 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [cloudkill] });
    const e = fighter('e', 'enemy', 3, 0, { hp: 20, maxHp: 20, move: 0, initiative: 1, weapons: [] });
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 1 });

    const evs = c.apply({ type: 'cast', spellId: 'cloudkill', to: { col: 3, row: 0 } });

    expect(evs).toEqual([{ round: 1, type: 'cast', actor: 'w', spellId: 'cloudkill' }]);
    expect(e.hp).toBe(20);
    expect(e.flags.size).toBe(0);
    expect(cloudkill.usesLeft).toBe(0);
  });
});

describe('tactical status conditions (CT.5a)', () => {
  // 1e-standard conditions inflicted by spells (sleep/hold/fear/slow/haste): see combatSpells.ts.
  const caster = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('w', 'party', 0, 0, { move: 0, initiative: 20, ...over });
  const sleep: TacticalSpell = { id: 'sleep', name: 'Sleep', target: 'enemy', range: 12, area: 'burst', radius: 2, save: 'none', inflict: { status: 'asleep', rounds: 99, hdCap: 4 }, usesLeft: 1 };

  it('Sleep puts a low-HD foe to sleep (no save) and burns the slot', () => {
    const w = caster({ preparedSpells: [{ ...sleep }] });
    const e = fighter('e', 'enemy', 3, 0, { hd: 2, move: 0, initiative: 1, weapons: [] });
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 7 });
    const evs = c.apply({ type: 'cast', spellId: 'sleep', to: { col: 3, row: 0 } });
    expect(e.flags.has('asleep')).toBe(true);
    expect(evs.find((ev) => ev.type === 'cast' && ev.target === 'e')!.inflicted).toBe('asleep');
  });

  it('Sleep does NOT affect a foe over the 4-HD cap', () => {
    const w = caster({ preparedSpells: [{ ...sleep }] });
    const big = fighter('big', 'enemy', 3, 0, { hd: 8, move: 0, initiative: 1, weapons: [] });
    const c = createTacticalCombat([w, big], openField(11, 11), { seed: 7 });
    c.apply({ type: 'cast', spellId: 'sleep', to: { col: 3, row: 0 } });
    expect(big.flags.has('asleep')).toBe(false);
  });

  it('a status with a negate save is avoided by a target that always saves', () => {
    const hold: TacticalSpell = { id: 'hold', name: 'Hold Person', target: 'enemy', range: 8, area: 'single', save: 'negate', inflict: { status: 'held', rounds: 6 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [hold] });
    const e = fighter('e', 'enemy', 3, 0, { move: 0, initiative: 1, weapons: [], save: 1 }); // d20≥1 ⇒ always saves
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 4 });
    const evs = c.apply({ type: 'cast', spellId: 'hold', targetId: 'e' });
    expect(e.flags.has('held')).toBe(false);
    expect(evs.find((ev) => ev.type === 'cast' && ev.target === 'e')!.saved).toBe(true);
  });

  it('conSaveBonus (M28.S1) is added to the roll, not the target — an extreme bonus flips a save regardless of the die', () => {
    const hold: TacticalSpell = { id: 'hold', name: 'Hold Person', target: 'enemy', range: 8, area: 'single', save: 'negate', inflict: { status: 'held', rounds: 6 }, usesLeft: 1 };
    const w = caster({ preparedSpells: [{ ...hold }] });
    // save: 21 alone never saves (baseline, same as the test above) — d20 max is 20, 20 < 21.
    const noBonus = fighter('nb', 'enemy', 3, 0, { move: 0, initiative: 1, weapons: [], save: 21 });
    const c1 = createTacticalCombat([w, noBonus], openField(11, 11), { seed: 4 });
    const evs1 = c1.apply({ type: 'cast', spellId: 'hold', targetId: 'nb' });
    expect(evs1.find((ev) => ev.type === 'cast' && ev.target === 'nb')!.saved).toBe(false);
    expect(noBonus.flags.has('held')).toBe(true);
    // Same save: 21, but conSaveBonus: 21 ⇒ even the minimum roll (1) clears it: 1 + 21 = 22 >= 21 — always saves.
    const w2 = caster({ preparedSpells: [{ ...hold }] });
    const withBonus = fighter('wb', 'enemy', 3, 0, { move: 0, initiative: 1, weapons: [], save: 21, conSaveBonus: 21 });
    const c2 = createTacticalCombat([w2, withBonus], openField(11, 11), { seed: 4 });
    const evs2 = c2.apply({ type: 'cast', spellId: 'hold', targetId: 'wb' });
    expect(evs2.find((ev) => ev.type === 'cast' && ev.target === 'wb')!.saved).toBe(true);
    expect(withBonus.flags.has('held')).toBe(false);
  });

  it('an asleep (helpless) target is auto-hit by a MISSILE and wakes when it survives the shot', () => {
    // A RANGED hit auto-lands on the helpless (CT.5a) but is no coup-de-grace (that is melee, CT.7j), so
    // a sleeper that survives the arrow wakes. thac0 30 ⇒ only the helpless auto-hit lands the shot.
    const p = fighter('p', 'party', 1, 1, { thac0: 30, initiative: 20, move: 0, weapons: [{ name: 'bow', kind: 'missile', damage: { count: 1, sides: 1, bonus: 0 }, range: 8, ammo: 20 }] });
    const e = fighter('e', 'enemy', 5, 1, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['asleep']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    expect(c.current()!.id).toBe('p');
    const evs = c.apply({ type: 'missile', targetId: 'e' });
    const atk = evs.find((ev) => ev.type === 'attack')!;
    expect(atk.hit).toBe(true);
    expect(atk.helpless).toBe(true);
    expect(atk.coupDeGrace).toBeUndefined(); // no cruel blow at range
    expect(e.hp).toBe(19);
    expect(e.flags.has('asleep')).toBe(false); // a struck-but-surviving sleeper wakes
  });

  // M79.S1 — applyCast()'s damage branch previously never called clearStatus(t, 'asleep') before
  // applying HP loss, unlike resolveHit()'s melee/missile branch (the test above), so a sleeper hit
  // by a survived damage spell stayed incorrectly `asleep` — which then fed the engine's own real
  // helpless/coup-de-grace gate on the very next melee swing against it.
  it('an asleep target that survives a damage SPELL also wakes, exactly like a survived missile', () => {
    const mm: TacticalSpell = { id: 'mm', name: 'Magic Missile', target: 'enemy', range: 8, area: 'single', save: 'none', damage: { count: 5, sides: 1, bonus: 0 }, usesLeft: 1 };
    const w = fighter('w', 'party', 0, 0, { move: 0, initiative: 20, preparedSpells: [mm] });
    const e = fighter('e', 'enemy', 3, 0, { hp: 20, maxHp: 20, move: 0, initiative: 1, weapons: [], flags: new Set(['asleep']) });
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 7 });
    const evs = c.apply({ type: 'cast', spellId: 'mm', targetId: 'e' });
    const hit = evs.find((ev) => ev.type === 'cast' && ev.target === 'e')!;
    expect(hit.damage).toBe(5);
    expect(e.hp).toBe(15);
    expect(e.flags.has('asleep')).toBe(false); // a struck-but-surviving sleeper wakes, same as the missile case
  });

  it('a held target is auto-hit by a MISSILE but does NOT break on damage (magical hold)', () => {
    const p = fighter('p', 'party', 1, 1, { thac0: 30, initiative: 20, move: 0, weapons: [{ name: 'bow', kind: 'missile', damage: { count: 1, sides: 1, bonus: 0 }, range: 8, ammo: 20 }] });
    const e = fighter('e', 'enemy', 5, 1, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['held']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    const evs = c.apply({ type: 'missile', targetId: 'e' });
    expect(evs.find((ev) => ev.type === 'attack')!.helpless).toBe(true);
    expect(e.hp).toBe(19);
    expect(e.flags.has('held')).toBe(true); // hold persists through the blow
  });

  it('a spell-inflicted condition ticks down each round and wears off, logging a status-expiry event', () => {
    const hold: TacticalSpell = { id: 'hold', name: 'Hold Person', target: 'enemy', range: 8, area: 'single', save: 'negate', inflict: { status: 'held', rounds: 2 }, usesLeft: 1 };
    // Caster has movement (move 2) so the cast does NOT immediately end its turn — the held state is
    // observable within the round it was cast, before any round boundary ticks the timer.
    const w = caster({ preparedSpells: [hold], move: 2 }); // no save on the foe ⇒ never saves ⇒ held lands
    const e = fighter('e', 'enemy', 3, 0, { move: 0, initiative: 1, weapons: [], attacksPerRound: 0 });
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 6 });
    c.apply({ type: 'cast', spellId: 'hold', targetId: 'e' }); // round 1: held for 2 rounds
    expect(e.flags.has('held')).toBe(true);
    expect(c.round()).toBe(1);
    // End round 1 → round 2 tick (2→1, still held); end round 2 → round 3 tick (1→0, expires).
    c.apply({ type: 'endTurn' });
    expect(c.round()).toBe(2);
    expect(e.flags.has('held')).toBe(true); // one round elapsed, still held
    c.apply({ type: 'endTurn' });
    expect(c.round()).toBe(3);
    expect(e.flags.has('held')).toBe(false); // expired
    expect(c.log.some((ev) => ev.type === 'status' && ev.target === 'e' && ev.expired && ev.inflicted === 'held')).toBe(true);
  });

  it('a feared figure cannot attack and the AI makes it flee', () => {
    const e = fighter('e', 'enemy', 2, 5, { move: 4, initiative: 20, flags: new Set(['feared']) });
    const p = fighter('p', 'party', 3, 5, { move: 0, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([e, p], openField(11, 11), { seed: 8 });
    expect(c.current()!.id).toBe('e');
    expect(c.aiAction().type).toBe('flee'); // forced to flee, not attack
    expect(c.apply({ type: 'melee', targetId: 'p' })).toEqual([]); // a feared figure can't melee
    expect(e.hp).toBeGreaterThan(0);
  });

  it('a figure feared after its turn begins still flees and yields to the next live actor', () => {
    const routed = fighter('p1', 'party', 2, 5, { move: 4, initiative: 20 });
    const next = fighter('p2', 'party', 3, 6, { move: 0, initiative: 10, attacksPerRound: 0, weapons: [] });
    const enemy = fighter('e', 'enemy', 9, 5, { move: 0, initiative: 1, attacksPerRound: 0, weapons: [] });
    const c = createTacticalCombat([routed, next, enemy], openField(11, 11), { seed: 8 });

    expect(c.current()!.id).toBe('p1'); // beginTurn() has already cached its initial, unafraid state
    routed.flags.add('feared');
    const action = c.aiAction();
    expect(action.type).toBe('flee');

    const events = c.apply(action);
    expect(events.some((event) => event.type === 'flee' && event.actor === 'p1')).toBe(true);
    expect(routed.flags.has('fled')).toBe(true);
    expect(routed.pos.col).toBe(0);
    expect(c.teamCounts()).toEqual({ party: 1, enemy: 1 });
    expect(c.isOver()).toBe(false);
    expect(c.current()!.id).toBe('p2');
  });
});

// M23.S2 — COAB `regen_3_hp` (`AffectRegen3Hp`, `BattleRoundChecks`'s `CheckType.Type_19` sweep):
// +3 HP at the start of every round the figure is active, capped at maxHp. Both figures act with no
// weapons/movement so the only thing moving troll's HP across rounds is the regen tick itself.
describe('tactical regen (M23.S2)', () => {
  it('heals regenPerRound at each round start, logs a regen event, capped at maxHp', () => {
    const troll = fighter('troll', 'enemy', 5, 5, { hp: 10, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, regenPerRound: 3 });
    const p = fighter('p', 'party', 0, 0, { move: 0, attacksPerRound: 0, weapons: [], initiative: 20 });
    const c = createTacticalCombat([p, troll], openField(11, 11), { seed: 5 });
    // Round 1 already began (lazily, on first cursor access) by the time anything is observable.
    expect(c.round()).toBe(1);
    expect(troll.hp).toBe(13); // 10 + 3
    c.apply({ type: 'endTurn' }); // p's turn ends
    c.apply({ type: 'endTurn' }); // troll's turn ends -> round 2 begins, regen ticks again
    expect(c.round()).toBe(2);
    expect(troll.hp).toBe(16); // 13 + 3
    expect(c.log.some((ev) => ev.type === 'regen' && ev.target === 'troll' && ev.healed === 3)).toBe(true);
  });

  it('never pushes HP above maxHp', () => {
    const troll = fighter('troll', 'enemy', 5, 5, { hp: 19, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, regenPerRound: 3 });
    const p = fighter('p', 'party', 0, 0, { move: 0, attacksPerRound: 0, weapons: [], initiative: 20 });
    const c = createTacticalCombat([p, troll], openField(11, 11), { seed: 5 });
    expect(c.round()).toBe(1);
    expect(troll.hp).toBe(20); // capped, not 22
  });

  it('a figure with no regenPerRound is unaffected (the common case)', () => {
    const e = fighter('e', 'enemy', 5, 5, { hp: 10, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const p = fighter('p', 'party', 0, 0, { move: 0, attacksPerRound: 0, weapons: [], initiative: 20 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    expect(c.round()).toBe(1);
    expect(e.hp).toBe(10);
    expect(c.log.some((ev) => ev.type === 'regen')).toBe(false);
  });
});

// M74.S1 — a round-boundary tick (regen/status-expiry) previously reached `c.log` but never
// `apply()`'s own return value, since `beginRound()` only ever fired as a side effect of a bare
// `positionCursor()`/`endTurn()` statement whose result nothing captured. `apply()` now returns
// `log.slice(<call start>)`, so every real UI (which only ever reads `apply()`'s return, never `c.log`
// directly) can finally see these. Same fixtures as the `c.log`-based tests above, asserting the
// return value instead.
describe('tactical apply() return value carries round-boundary ticks (M74.S1)', () => {
  it('a regen tick crossing a round boundary appears in the endTurn call that triggers it', () => {
    const troll = fighter('troll', 'enemy', 5, 5, { hp: 10, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, regenPerRound: 3 });
    const p = fighter('p', 'party', 0, 0, { move: 0, attacksPerRound: 0, weapons: [], initiative: 20 });
    const c = createTacticalCombat([p, troll], openField(11, 11), { seed: 5 });
    const ev1 = c.apply({ type: 'endTurn' }); // p's turn ends; no round boundary yet
    expect(ev1.some((ev) => ev.type === 'regen')).toBe(false);
    const ev2 = c.apply({ type: 'endTurn' }); // troll's turn ends -> round 2 begins, regen ticks
    expect(troll.hp).toBe(16); // 13 + 3, same golden as the c.log-based test above
    expect(ev2.some((ev) => ev.type === 'regen' && ev.target === 'troll' && ev.healed === 3)).toBe(true);
  });

  it('a status-expiry tick crossing a round boundary appears in the endTurn call that triggers it', () => {
    const hold: TacticalSpell = { id: 'hold', name: 'Hold Person', target: 'enemy', range: 8, area: 'single', save: 'negate', inflict: { status: 'held', rounds: 2 }, usesLeft: 1 };
    const w = fighter('w', 'party', 0, 0, { move: 2, initiative: 20, preparedSpells: [hold] });
    const e = fighter('e', 'enemy', 3, 0, { move: 0, initiative: 1, weapons: [], attacksPerRound: 0 });
    const c = createTacticalCombat([w, e], openField(11, 11), { seed: 6 });
    c.apply({ type: 'cast', spellId: 'hold', targetId: 'e' }); // round 1: held for 2 rounds
    const ev1 = c.apply({ type: 'endTurn' }); // round 2: timer 2->1, still held, no expiry yet
    expect(ev1.some((ev) => ev.type === 'status' && ev.expired)).toBe(false);
    const ev2 = c.apply({ type: 'endTurn' }); // round 3: timer 1->0, expires
    expect(e.flags.has('held')).toBe(false);
    expect(ev2.some((ev) => ev.type === 'status' && ev.target === 'e' && ev.expired && ev.inflicted === 'held')).toBe(true);
  });
});

// M24.S1 — COAB `half_damage` (`ovr013.half_damage`: `gbl.damage /= 2`, swept every hit via
// `BattleRoundChecks`'s `CheckType.Type_5` list): halves the damage a flagged defender takes, applied
// after any backstab multiply and before HP loss, matching COAB's `sub_3E192` order exactly.
describe('tactical half_damage (M24.S1)', () => {
  // A fixed-bonus 1d1 weapon always rolls the same total regardless of seed/RNG — deterministic damage.
  const oddWeapon: Weapon = { name: 'club', kind: 'melee', damage: { count: 1, sides: 1, bonus: 6 }, reach: 1 }; // always 7

  it('halves an ordinary hit, rounding down', () => {
    const vampire = fighter('vamp', 'enemy', 6, 5, { ac: 15, hp: 50, maxHp: 50, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, halfDamage: true });
    const atk = fighter('atk', 'party', 5, 5, { thac0: 1, initiative: 20, move: 0, weapons: [oddWeapon], damage: oddWeapon.damage });
    const c = createTacticalCombat([atk, vampire], openField(11, 11), { seed: 3 });
    const evs = c.apply({ type: 'melee', targetId: 'vamp' });
    const ev = evs.find((e) => e.type === 'attack')!;
    expect(ev.hit).toBe(true);
    expect(ev.damage).toBe(3); // floor(7/2)
  });

  it('a non-flagged target takes full damage from the same attack', () => {
    const goblin = fighter('gob', 'enemy', 6, 5, { ac: 15, hp: 50, maxHp: 50, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const atk = fighter('atk', 'party', 5, 5, { thac0: 1, initiative: 20, move: 0, weapons: [oddWeapon], damage: oddWeapon.damage });
    const c = createTacticalCombat([atk, goblin], openField(11, 11), { seed: 3 });
    const evs = c.apply({ type: 'melee', targetId: 'gob' });
    const ev = evs.find((e) => e.type === 'attack')!;
    expect(ev.hit).toBe(true);
    expect(ev.damage).toBe(7);
  });

  it('halves AFTER the backstab multiply, matching COAB order (not the reverse)', () => {
    const dagger: Weapon = { name: 'dagger', kind: 'melee', damage: { count: 1, sides: 1, bonus: 6 }, reach: 1 }; // always 7
    // Level-6 thief -> x3 backstab. Correct order: (7 * 3) / 2 = floor(21/2) = 10.
    // Wrong (reversed) order would give floor(7/2) * 3 = 3 * 3 = 9 -- a different number, so this proves the order.
    const vampire = fighter('vamp', 'enemy', 6, 5, { facing: 0, ac: 15, hp: 50, maxHp: 50, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, halfDamage: true });
    const thief = fighter('th', 'party', 5, 5, { backstabLevel: 6, thac0: 1, initiative: 20, move: 0, weapons: [dagger], damage: dagger.damage });
    const c = createTacticalCombat([thief, vampire], openField(11, 11), { seed: 3 });
    expect(c.canBackstab('vamp')).toBe(true); // thief is west of the vampire, which faces east (away)
    const evs = c.apply({ type: 'melee', targetId: 'vamp' });
    const ev = evs.find((e) => e.type === 'attack')!;
    expect(ev.backstab).toBe(true);
    expect(ev.damage).toBe(10);
  });
});

describe('tactical missile Dexterity bonus (M25.S1)', () => {
  // COAB `DexReactionAdj`: a flat, per-shot to-hit bonus applied only on the missile branch.
  it("lowers the to-hit number needed by exactly the archer's missileHitBonus", () => {
    const run = (missileHitBonus?: number) => {
      const p = fighter('p', 'party', 1, 1, { thac0: 15, weapons: [bow], missileHitBonus });
      const e = fighter('e', 'enemy', 5, 1, { hp: 8, ac: 10, move: 0, attacksPerRound: 0, weapons: [] });
      const c = createTacticalCombat([p, e], openField(11, 11), { seed: 7 });
      let guard = 0;
      let ev;
      while (!c.isOver() && guard++ < 20) {
        const a = c.current()!;
        if (a.id === 'p') { ev = c.apply({ type: 'missile', targetId: 'e' }).find((x) => x.type === 'attack'); break; }
        c.apply(c.aiAction());
      }
      return ev!.needed!;
    };
    expect(run(0) - run(2)).toBe(2);
  });

  it('is not applied to a melee attack (party-side Dex/Str are mutually exclusive per weapon kind)', () => {
    const sword: Weapon = { name: 'sword', kind: 'melee', damage: { count: 1, sides: 8, bonus: 0 }, reach: 1 };
    const run = (missileHitBonus?: number) => {
      const p = fighter('p', 'party', 5, 5, { thac0: 15, weapons: [sword], missileHitBonus });
      const e = fighter('e', 'enemy', 6, 5, { hp: 8, ac: 10, move: 0, attacksPerRound: 0, weapons: [] });
      const c = createTacticalCombat([p, e], openField(11, 11), { seed: 7 });
      let guard = 0;
      let ev;
      while (!c.isOver() && guard++ < 20) {
        const a = c.current()!;
        if (a.id === 'p') { ev = c.apply({ type: 'melee', targetId: 'e' }).find((x) => x.type === 'attack'); break; }
        c.apply(c.aiAction());
      }
      return ev!.needed!;
    };
    expect(run(2)).toBe(run(undefined)); // same regardless of missileHitBonus -- melee never reads it
  });
});

describe('turn undead (CT.5b)', () => {
  // The 1e d20 turning table, labelled inferred (the games' own table is DGROUP-UNLOCATED — see
  // disasm-spells-krynn.md §12). turnUndeadOutcome(level, HD): destroy / 'turn' / a d20 target / 'none'.
  it('turnUndeadOutcome reproduces the canonical 1e d20 turning matrix', () => {
    expect(turnUndeadOutcome(1, 1)).toBe(10); // L1 vs 1HD: roll 10+
    expect(turnUndeadOutcome(1, 2)).toBe(13); // each stronger undead = +3 to the target
    expect(turnUndeadOutcome(3, 1)).toBe(4);  // each cleric level = −3
    expect(turnUndeadOutcome(4, 1)).toBe('turn');    // auto-turn band
    expect(turnUndeadOutcome(6, 1)).toBe('destroy'); // destroyed outright
    expect(turnUndeadOutcome(1, 7)).toBe('none');    // far out of a L1 cleric's reach
    expect(turnUndeadOutcome(14, 11)).toBe('turn');  // a high-level cleric handles a lich
  });

  const cleric = (lvl: number, over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('clr', 'party', 5, 5, { move: 0, initiative: 20, turnLevel: lvl, ...over });
  const skeleton = (id: string, col: number, over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter(id, 'enemy', col, 5, { hp: 6, maxHp: 6, move: 0, attacksPerRound: 0, weapons: [], undead: true, hd: 1, initiative: 1, ...over });

  it('a cleric turns a weak undead, which then flees (feared)', () => {
    const clr = cleric(5); // L5 vs 1HD = auto-turn
    const sk = skeleton('sk', 6);
    const c = createTacticalCombat([clr, sk], openField(11, 11), { seed: 3 });
    expect(c.current()!.id).toBe('clr');
    expect(c.canTurnUndead()).toBe(true);
    const evs = c.apply({ type: 'turn' });
    expect(sk.flags.has('feared')).toBe(true);
    expect(sk.hp).toBeGreaterThan(0); // turned, not destroyed
    expect(evs.some((e) => e.type === 'turn' && e.target === 'sk' && e.turned)).toBe(true);
  });

  it('a high-level cleric destroys a weak undead outright', () => {
    const clr = cleric(7); // L7 vs 1HD = destroy
    const sk = skeleton('sk', 6);
    const c = createTacticalCombat([clr, sk], openField(11, 11), { seed: 3 });
    const evs = c.apply({ type: 'turn' });
    expect(sk.hp).toBe(0);
    expect(sk.flags.has('dead')).toBe(true);
    expect(evs.some((e) => e.type === 'turn' && e.target === 'sk' && e.destroyed)).toBe(true);
    expect(evs.some((e) => e.type === 'slain' && e.target === 'sk' && e.dead)).toBe(true);
    // M78.S1 — a destroyed undead's xp must reach xpAwarded exactly like every other kill path does.
    expect(c.result().xpAwarded).toBe(sk.xp);
  });

  it('Death Knights (turnImmune) cannot be turned', () => {
    const clr = cleric(14);
    const dk = skeleton('dk', 6, { undead: true, turnImmune: true, hd: 9, hp: 80, maxHp: 80 });
    const c = createTacticalCombat([clr, dk], openField(11, 11), { seed: 3 });
    const evs = c.apply({ type: 'turn' });
    expect(dk.flags.has('feared')).toBe(false);
    expect(dk.hp).toBe(80);
    expect(evs.every((e) => !(e.type === 'turn' && (e.turned || e.destroyed)))).toBe(true);
  });

  it('turn undead is not offered against non-undead foes', () => {
    const clr = cleric(9);
    const drac = fighter('d', 'enemy', 6, 5, { hp: 14, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const c = createTacticalCombat([clr, drac], openField(11, 11), { seed: 3 });
    expect(c.canTurnUndead()).toBe(false);
    expect(c.legalActions().some((a) => a.type === 'turn')).toBe(false);
  });

  it('classifyUndead tags the Krynn undead roster and immune Death Knights', () => {
    expect(classifyUndead('Skeleton').undead).toBe(true);
    expect(classifyUndead('Wight').undead).toBe(true);
    expect(classifyUndead('Lord Soth').turnImmune).toBe(true);
    expect(classifyUndead('Death Knight').turnImmune).toBe(true);
    expect(classifyUndead('Draconian').undead).toBe(false);
    expect(classifyUndead('Shadow Dragon').undead).toBe(false); // living dragon, not the 'shadow' undead
    expect(classifyUndead('Dracolich').undead).toBe(true);
  });
});

describe('thief backstab (CT.5c)', () => {
  // The 1e level-banded multiplier (the games' own table is DGROUP-UNLOCATED — backstab itself is
  // byte-confirmed present in CoK/DoK, "-Backstabs- (from behind)"; see disasm-spells-krynn.md §14).
  it('backstabMultiplier scales by thief level band (×2/×3/×4/×5)', () => {
    expect(backstabMultiplier(1)).toBe(2);
    expect(backstabMultiplier(4)).toBe(2);
    expect(backstabMultiplier(5)).toBe(3);
    expect(backstabMultiplier(8)).toBe(3);
    expect(backstabMultiplier(9)).toBe(4);
    expect(backstabMultiplier(12)).toBe(4);
    expect(backstabMultiplier(13)).toBe(5);
    expect(backstabMultiplier(20)).toBe(5);
  });

  it('isBehindTarget reads the rear arc opposite the target facing', () => {
    // Target faces east (0); its rear arc is W / SW / NW.
    expect(isBehindTarget(0, { col: 5, row: 5 }, { col: 4, row: 5 })).toBe(true);  // due west = behind
    expect(isBehindTarget(0, { col: 5, row: 5 }, { col: 4, row: 4 })).toBe(true);  // NW = rear flank
    expect(isBehindTarget(0, { col: 5, row: 5 }, { col: 6, row: 5 })).toBe(false); // due east = front
    expect(isBehindTarget(0, { col: 5, row: 5 }, { col: 5, row: 4 })).toBe(false); // due north = side
  });

  // A 1d1 dagger always rolls 1, so the multiplied damage is deterministic regardless of seed.
  const dagger: Weapon = { name: 'dagger', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 };
  const thief = (col: number, over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('th', 'party', col, 5, { backstabLevel: 6, initiative: 20, move: 0, thac0: 15,
      weapons: [dagger], damage: { count: 1, sides: 1, bonus: 0 }, ...over });
  const foe = (facing: 0 | 4, over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('foe', 'enemy', 6, 5, { facing, move: 0, attacksPerRound: 0, weapons: [], initiative: 1,
      ac: 5, hp: 50, maxHp: 50, ...over });

  it('a thief behind a foe backstabs: +4 to hit and ×multiplier damage', () => {
    const th = thief(5);                 // west of the foe
    const f = foe(0);                    // facing east (away from the thief) → its back is to the thief
    const c = createTacticalCombat([th, f], openField(11, 11), { seed: 3 });
    expect(c.current()!.id).toBe('th');
    expect(c.canBackstab('foe')).toBe(true);
    const evs = c.apply({ type: 'melee', targetId: 'foe' });
    const atk = evs.find((e) => e.type === 'attack')!;
    expect(atk.backstab).toBe(true);
    expect(atk.hit).toBe(true);
    expect(atk.damage).toBe(3);                         // base 1 × ×3 (level-6 thief)
    expect(atk.needed).toBe(15 - 5 - 4);                // +4 to hit from behind
  });

  it('a frontal thief strike is an ordinary hit (no multiplier, no +4)', () => {
    const th = thief(5);                 // west of the foe
    const f = foe(4);                    // facing west (toward the thief) → frontal
    const c = createTacticalCombat([th, f], openField(11, 11), { seed: 3 });
    expect(c.canBackstab('foe')).toBe(false);
    const evs = c.apply({ type: 'melee', targetId: 'foe' });
    const atk = evs.find((e) => e.type === 'attack')!;
    expect(atk.backstab).toBeFalsy();
    expect(atk.damage).toBe(1);                         // base 1, unmultiplied
    expect(atk.needed).toBe(15 - 5);                    // no from-behind bonus
  });

  it('a non-thief gains no backstab even from behind', () => {
    const grunt = thief(5, { backstabLevel: undefined }); // same position, but not a thief
    const f = foe(0);
    const c = createTacticalCombat([grunt, f], openField(11, 11), { seed: 3 });
    expect(c.canBackstab('foe')).toBe(false);
    const evs = c.apply({ type: 'melee', targetId: 'foe' });
    const atk = evs.find((e) => e.type === 'attack')!;
    expect(atk.backstab).toBeFalsy();
    expect(atk.damage).toBe(1);
  });

  it('a higher-level thief multiplies harder (×5 at L13+)', () => {
    const th = thief(5, { backstabLevel: 13 });
    const f = foe(0);
    const c = createTacticalCombat([th, f], openField(11, 11), { seed: 3 });
    const evs = c.apply({ type: 'melee', targetId: 'foe' });
    const atk = evs.find((e) => e.type === 'attack')!;
    expect(atk.damage).toBe(5);                          // base 1 × ×5
  });

  // M76.S1 — a missed backstab attempt previously dropped `backstab` from its event entirely (unlike
  // the sibling `rear`/`rangeBracket` fields, which already survived a miss), so the log narrated it
  // identically to an ordinary rear-arc miss. Same rig as the tests above; seed 4 rolls a 4 against
  // `needed: 6` (15 thac0 − 5 AC − 4 backstab), a genuine miss on a genuine backstab attempt.
  it('a missed backstab attempt still records backstab: true on its (miss) event', () => {
    const th = thief(5);                 // west of the foe
    const f = foe(0);                    // facing east (away from the thief) → its back is to the thief
    const c = createTacticalCombat([th, f], openField(11, 11), { seed: 4 });
    expect(c.canBackstab('foe')).toBe(true);
    const evs = c.apply({ type: 'melee', targetId: 'foe' });
    const atk = evs.find((e) => e.type === 'attack')!;
    expect(atk.hit).toBe(false);
    expect(atk.backstab).toBe(true);
    expect(atk.rear).toBe(true);
  });
});

describe('morale + monster AI (CT.6)', () => {
  // A 1d1 club +N does exactly N+1 damage every time — deterministic wounds for the morale threshold.
  const club = (bonus: number): Weapon => ({ name: 'club', kind: 'melee', damage: { count: 1, sides: 1, bonus }, reach: 1 });
  // A hero that one-shots nothing but reliably bloodies: thac0 1 always hits.
  const hero = (col: number, bonus: number): TacticalCombatant =>
    fighter('p', 'party', col, 5, { thac0: 1, move: 0, initiative: 20, weapons: [club(bonus)] });

  it('a bloodied monster whose morale fails breaks and flees (feared)', () => {
    const p = hero(5, 15);                 // 16 damage
    const e = fighter('e', 'enemy', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, morale: 30 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    const evs = c.apply({ type: 'melee', targetId: 'e' });   // 20 → 4 HP = 80% lost > morale 30
    expect(e.hp).toBe(4);
    expect(e.flags.has('feared')).toBe(true);
    expect(evs.some((ev) => ev.type === 'status' && ev.target === 'e' && ev.morale && ev.inflicted === 'feared')).toBe(true);
  });

  it('a steady monster (high morale) holds when only lightly wounded', () => {
    const p = hero(5, 15);                 // 16 damage = 80% lost
    const e = fighter('e', 'enemy', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, morale: 90 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e' });
    expect(e.flags.has('feared')).toBe(false); // 80% lost < morale 90 → holds
  });

  it('a monster never breaks with no morale field (undead/constructs)', () => {
    const p = hero(5, 15);
    const e = fighter('e', 'enemy', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 }); // no morale
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e' });
    expect(e.flags.has('feared')).toBe(false);
  });

  it('a personally-sound monster surrenders when its side collapses (team-health test)', () => {
    const p = hero(5, 99);                 // overkills the wounded ally
    const e1 = fighter('e1', 'enemy', 1, 1, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, morale: 50 });
    const e2 = fighter('e2', 'enemy', 6, 5, { hp: 1, maxHp: 60, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, morale: 50 });
    const c = createTacticalCombat([p, e1, e2], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e2' });   // team HP 20/80 → 75% lost > 50; e1 itself unhurt
    expect(e2.hp).toBeLessThanOrEqual(0);
    expect(e1.flags.has('surrendered')).toBe(true);
    expect(e1.flags.has('feared')).toBe(false);   // gave up, not routed
  });

  it('AI focus-fires the weakest reachable foe under the opt-in focus policy', () => {
    // NOTE: the DEFAULT aiTargeting is now 'random' (spec-faithful: ovr010 picks a RANDOM in-reach foe,
    // it does not concentrate fire). Focus-fire is the modern opt-in — exercised here with aiTargeting:'focus'.
    const e = fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20 });
    const strong = fighter('p1', 'party', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const weak = fighter('p2', 'party', 4, 5, { hp: 5, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const c = createTacticalCombat([e, strong, weak], openField(11, 11), { seed: 3, aiTargeting: 'focus' });
    expect(c.current()!.id).toBe('e');
    const a = c.aiAction();
    expect(a.type).toBe('melee');
    expect(a.targetId).toBe('p2'); // the wounded foe, not the nearer/stronger one
  });

  it('a ranged monster kites — shoots, then steps away from an adjacent foe', () => {
    // A fresh bow (the module-level `bow` is shared + its ammo is drained by earlier tests).
    const freshBow: Weapon = { name: 'bow', kind: 'missile', damage: { count: 1, sides: 6, bonus: 0 }, range: 8, ammo: 20 };
    const e = fighter('e', 'enemy', 5, 5, { move: 4, initiative: 20, weapons: [freshBow] });
    const p = fighter('p', 'party', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const c = createTacticalCombat([e, p], openField(11, 11), { seed: 3 });
    const shot = c.aiAction();
    expect(shot.type).toBe('missile');
    c.apply(shot);
    const move = c.aiAction();
    expect(move.type).toBe('move');
    expect(chebyshev(move.to!, p.pos)).toBeGreaterThan(chebyshev(e.pos, p.pos)); // opened distance
  });

  it('a ranged monster repositions when a foe is in nominal range but blocked from line of fire', () => {
    const wall = new Set(['3,2']);
    const terrain: TerrainGrid = {
      width: 7,
      height: 5,
      blocked: (col, row) => wall.has(`${col},${row}`),
      blocksSight: (col, row) => wall.has(`${col},${row}`),
    };
    const freshBow: Weapon = { name: 'bow', kind: 'missile', damage: { count: 1, sides: 6, bonus: 0 }, range: 8, ammo: 20 };
    const e = fighter('e', 'enemy', 1, 2, { move: 4, initiative: 20, weapons: [freshBow] });
    const p = fighter('p', 'party', 5, 2, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const c = createTacticalCombat([e, p], terrain, { seed: 3 });

    expect(c.missileTargets()).toEqual([]);
    const move = c.aiAction();
    expect(move.type).toBe('move');
    expect(move.to).toBeDefined();
    c.apply(move);

    expect(c.missileTargets().map((target) => target.id)).toEqual(['p']);
    const shot = c.aiAction();
    expect(shot).toEqual({ type: 'missile', targetId: 'p' });
    c.apply(shot);
    expect(freshBow.ammo).toBe(19);
    expect(c.log.some((event) => event.type === 'attack' && event.actor === 'e' && event.target === 'p' && event.missile)).toBe(true);
  });

  it('a caster hangs back — casts at range instead of meleeing an adjacent foe', () => {
    const bolt: TacticalSpell = { id: 'mm', name: 'Magic Missile', target: 'enemy', range: 8, area: 'single', save: 'none', damage: { count: 1, sides: 1, bonus: 0 }, usesLeft: 3 };
    const e = fighter('e', 'enemy', 5, 5, { move: 4, initiative: 20, preparedSpells: [bolt] }); // also has a default melee weapon
    const p = fighter('p', 'party', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    const c = createTacticalCombat([e, p], openField(11, 11), { seed: 3 });
    const a = c.aiAction();
    expect(a.type).toBe('cast');     // prefers the spell over a melee swing
    expect(a.spellId).toBe('mm');
  });
});

describe('rear / flank AC (CT.7a)', () => {
  // thac0 15 vs AC 5 ⇒ frontal needs a 10. `needed` is reported on the attack event regardless of the roll.
  const dagger: Weapon = { name: 'dagger', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 };
  const attacker = (col: number, over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('a', 'party', col, 5, { thac0: 15, move: 0, initiative: 20, weapons: [dagger], ...over });
  // The mark stands at col 6; facing 0 (east) ⇒ an attacker to its west is behind it, facing 4 ⇒ frontal.
  const mark = (facing: 0 | 4, over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('f', 'enemy', 6, 5, { facing, ac: 5, hp: 50, maxHp: 50, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, ...over });

  it('a rear melee strike gets the generic +2 to hit (negates shield/dex)', () => {
    const c = createTacticalCombat([attacker(5), mark(0)], openField(11, 11), { seed: 3 });
    const ev = c.apply({ type: 'melee', targetId: 'f' }).find((e) => e.type === 'attack')!;
    expect(ev.rear).toBe(true);
    expect(ev.needed).toBe(15 - 5 - 2);   // +2 from behind
  });

  it('a frontal melee strike gets no rear bonus', () => {
    const c = createTacticalCombat([attacker(5), mark(4)], openField(11, 11), { seed: 3 });
    const ev = c.apply({ type: 'melee', targetId: 'f' }).find((e) => e.type === 'attack')!;
    expect(ev.rear).toBeFalsy();
    expect(ev.needed).toBe(15 - 5);
  });

  it('a stored rearAc (COAB ac_behind) is used from the rear instead of the +2', () => {
    const c = createTacticalCombat([attacker(5), mark(0, { rearAc: 8 })], openField(11, 11), { seed: 3 });
    const ev = c.apply({ type: 'melee', targetId: 'f' }).find((e) => e.type === 'attack')!;
    expect(ev.rear).toBe(true);
    expect(ev.needed).toBe(15 - 8);       // uses rearAc 8, NOT ac 5 − 2
  });

  it('a backstab from behind takes its +4, not an additional +2 (no double-count)', () => {
    const c = createTacticalCombat([attacker(5, { backstabLevel: 6 }), mark(0)], openField(11, 11), { seed: 3 });
    const ev = c.apply({ type: 'melee', targetId: 'f' }).find((e) => e.type === 'attack')!;
    expect(ev.backstab).toBe(true);
    expect(ev.rear).toBe(true);
    expect(ev.needed).toBe(15 - 5 - 4);   // thief's +4 only
  });

  it('rear AC does NOT apply to a missile shot from behind', () => {
    // range 4 ⇒ the dist-2 shot is medium band (no CT.7c range modifier), isolating the rear assertion.
    const freshBow: Weapon = { name: 'bow', kind: 'missile', damage: { count: 1, sides: 1, bonus: 0 }, range: 4, ammo: 20 };
    const c = createTacticalCombat([attacker(4, { weapons: [freshBow] }), mark(0)], openField(11, 11), { seed: 3 });
    const ev = c.apply({ type: 'missile', targetId: 'f' }).find((e) => e.type === 'attack')!;
    expect(ev.rear).toBeFalsy();
    expect(ev.needed).toBe(15 - 5);
  });

  it('isBehind reports the current actor in the target rear arc', () => {
    expect(createTacticalCombat([attacker(5), mark(0)], openField(11, 11), { seed: 3 }).isBehind('f')).toBe(true);
    expect(createTacticalCombat([attacker(5), mark(4)], openField(11, 11), { seed: 3 }).isBehind('f')).toBe(false);
  });
});

describe('terrain hazards + difficult ground (CT.7b)', () => {
  // A 11×11 field with a web zone (held, save-negates) at one cell.
  const webField = (wc: number, wr: number): TerrainGrid => ({
    width: 11, height: 11,
    hazard: (c, r) => (c === wc && r === wr ? { kind: 'web', status: 'held', rounds: 3, save: true } : undefined),
  });
  // …and one with a damaging cloud (cloudkill/ice-storm analogue) at one cell.
  const cloudField = (cc: number, cr: number): TerrainGrid => ({
    width: 11, height: 11,
    hazard: (c, r) => (c === cc && r === cr ? { kind: 'cloud', damage: { count: 2, sides: 6, bonus: 0 } } : undefined),
  });
  const mover = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('p', 'party', 4, 5, { move: 4, initiative: 20, ...over });
  const lazyFoe = (): TacticalCombatant => fighter('e', 'enemy', 9, 5, { move: 0, initiative: 1 });

  it('a figure that ends a move in a web is held (no save data ⇒ no save)', () => {
    const f = mover();
    const c = createTacticalCombat([f, lazyFoe()], webField(5, 5), { seed: 1 });
    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });
    const hz = evs.find((e) => e.type === 'hazard');
    expect(hz?.hazard).toBe('web');
    expect(hz?.inflicted).toBe('held');
    expect(f.flags.has('held')).toBe(true);
  });

  it('a saving throw negates the web hold', () => {
    const f = mover({ save: 1 }); // d20 ≥ 1 always succeeds
    const c = createTacticalCombat([f, lazyFoe()], webField(5, 5), { seed: 1 });
    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });
    const hz = evs.find((e) => e.type === 'hazard');
    expect(hz?.saved).toBe(true);
    expect(f.flags.has('held')).toBe(false);
  });

  it('a noxious cloud can block entry on a failed saving throw', () => {
    const f = mover({ save: 21 }); // d20 >= 21 cannot succeed
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'stinking-cloud', blocksEntryOnFailedSave: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    expect(c.apply({ type: 'move', to: { col: 5, row: 5 } })).toEqual([]);
    expect(f.pos).toEqual({ col: 4, row: 5 });
  });

  it('a noxious cloud entry succeeds when the saving throw passes', () => {
    const f = mover({ save: 1 }); // d20 >= 1 always succeeds
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'stinking-cloud', blocksEntryOnFailedSave: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });
    expect(evs.find((e) => e.type === 'move')?.actor).toBe('p');
    expect(f.pos).toEqual({ col: 5, row: 5 });
  });

  it('a noxious cloud save success inflicts coughing, not helplessness', () => {
    const f = mover({ save: 1 }); // d20 >= 1 always succeeds
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'stinking-cloud', blocksEntryOnFailedSave: true, noxiousCloud: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });
    const hz = evs.find((e) => e.type === 'hazard');
    expect(hz).toMatchObject({ hazard: 'stinking-cloud', target: 'p', inflicted: 'coughing', saved: true });
    expect(f.flags.has('coughing')).toBe(true);
    expect(f.flags.has('held')).toBe(false);
  });

  it('a noxious cloud failed save makes the figure helpless for d4+1 rounds', () => {
    const f = mover({ save: 21 }); // d20 >= 21 cannot succeed
    let cloudActive = true;
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (cloudActive && c === 5 && r === 5 ? { kind: 'stinking-cloud', noxiousCloud: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, {
      seed: 1, // first d20 fails; following d4+1 is 5 rounds.
      onRoundStart: (round) => { if (round > 1) cloudActive = false; },
    });

    const entry = c.apply({ type: 'move', to: { col: 5, row: 5 } });
    expect(entry.find((e) => e.type === 'hazard')).toMatchObject({ hazard: 'stinking-cloud', target: 'p', inflicted: 'held' });
    expect(f.flags.has('held')).toBe(true);

    for (let i = 0; i < 4; i++) {
      c.apply({ type: 'endTurn' });
      expect(f.flags.has('held')).toBe(true);
    }
    const evs = c.apply({ type: 'endTurn' });
    expect(evs.some((e) => e.type === 'status' && e.target === 'p' && e.inflicted === 'held' && e.expired)).toBe(true);
    expect(f.flags.has('held')).toBe(false);
    expect(c.current()?.id).toBe('p');
  });

  it('a noxious-cloud immune figure can enter and is not made coughing or helpless', () => {
    const f = mover({ save: 21, noxiousCloudImmune: true });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'stinking-cloud', blocksEntryOnFailedSave: true, noxiousCloud: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });

    expect(evs.find((e) => e.type === 'move')?.actor).toBe('p');
    expect(evs.find((e) => e.type === 'hazard' && e.hazard === 'stinking-cloud')).toBeUndefined();
    expect(f.pos).toEqual({ col: 5, row: 5 });
    expect(f.flags.has('coughing')).toBe(false);
    expect(f.flags.has('held')).toBe(false);
  });

  it('a noxious entry-immune figure can enter but still suffers source-shaped post-entry exposure', () => {
    const f = mover({ save: 21, noxiousCloudEntryImmune: true });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'stinking-cloud', blocksEntryOnFailedSave: true, noxiousCloud: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });

    expect(evs.find((e) => e.type === 'move')?.actor).toBe('p');
    expect(evs.find((e) => e.type === 'hazard' && e.hazard === 'stinking-cloud')).toMatchObject({ target: 'p', inflicted: 'held' });
    expect(f.pos).toEqual({ col: 5, row: 5 });
    expect(f.flags.has('held')).toBe(true);
  });

  it('a noxious exposure-immune figure still must pass the source-shaped entry gate', () => {
    const f = mover({ save: 21, noxiousCloudExposureImmune: true });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'stinking-cloud', blocksEntryOnFailedSave: true, noxiousCloud: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    expect(c.apply({ type: 'move', to: { col: 5, row: 5 } })).toEqual([]);
    expect(f.pos).toEqual({ col: 4, row: 5 });
    expect(f.flags.has('held')).toBe(false);
  });

  it('a figure beginning its turn in a noxious cloud is not re-exposed to cough/helplessness', () => {
    const f = fighter('p', 'party', 5, 5, { move: 0, initiative: 20, save: 21 });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'stinking-cloud', noxiousCloud: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    expect(c.current()?.id).toBe('p');
    expect(c.log.find((e) => e.type === 'hazard' && e.hazard === 'stinking-cloud')).toBeUndefined();
    expect(f.flags.has('held')).toBe(false);
    expect(f.flags.has('coughing')).toBe(false);
  });

  it('a poisonous cloud blocks voluntary entry for figures below 7 HD', () => {
    const f = mover({ hd: 6 });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', blocksEntryBelowHd: 7 } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    expect(c.apply({ type: 'move', to: { col: 5, row: 5 } })).toEqual([]);
    expect(f.pos).toEqual({ col: 4, row: 5 });
  });

  it('a poisonous cloud entry gate allows figures at 7 HD or above', () => {
    const f = mover({ hd: 7 });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', blocksEntryBelowHd: 7 } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });
    expect(evs.find((e) => e.type === 'move')?.actor).toBe('p');
    expect(f.pos).toEqual({ col: 5, row: 5 });
  });

  it('a poison-cloud immune low-HD figure can voluntarily enter poisonous clouds', () => {
    const f = mover({ hd: 4, poisonCloudImmune: true });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', blocksEntryBelowHd: 7 } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });

    expect(evs.find((e) => e.type === 'move')?.actor).toBe('p');
    expect(f.pos).toEqual({ col: 5, row: 5 });
  });

  it('a poison entry-immune low-HD figure can voluntarily enter poisonous clouds without broad poison exposure immunity', () => {
    const f = mover({ hd: 4, poisonCloudEntryImmune: true });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', blocksEntryBelowHd: 7 } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });

    expect(evs.find((e) => e.type === 'move')?.actor).toBe('p');
    expect(f.pos).toEqual({ col: 5, row: 5 });
  });

  it('a figure entering a cloud takes damage', () => {
    const f = mover({ hp: 30, maxHp: 30 });
    const c = createTacticalCombat([f, lazyFoe()], cloudField(5, 5), { seed: 1 });
    const evs = c.apply({ type: 'move', to: { col: 5, row: 5 } });
    const hz = evs.find((e) => e.type === 'hazard' && e.damage !== undefined);
    expect(hz?.hazard).toBe('cloud');
    expect(hz!.damage!).toBeGreaterThanOrEqual(2);
    expect(f.hp).toBeLessThan(30);
  });

  it('a figure that BEGINS its turn in a cloud is hit again', () => {
    const f = fighter('p', 'party', 5, 5, { move: 0, initiative: 20, hp: 30, maxHp: 30 });
    const c = createTacticalCombat([f, lazyFoe()], cloudField(5, 5), { seed: 1 });
    c.current(); // first turn opens on f → begins-in-hazard tick fires
    const hz = c.log.find((e) => e.type === 'hazard');
    expect(hz?.hazard).toBe('cloud');
    expect(f.hp).toBeLessThan(30);
  });

  it('CoAB Cloudkill poison kills 0-4 HD figures without a save', () => {
    const f = fighter('p', 'party', 5, 5, { move: 0, initiative: 20, hp: 30, maxHp: 30, hd: 4, save: 1 });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', cloudkillPoison: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    c.current();
    expect(f.flags.has('dead')).toBe(true);
    expect(c.log.find((e) => e.type === 'slain' && e.target === 'p')?.dead).toBe(true);
  });

  it('CoAB Cloudkill poison does not kill poison-cloud immune low-HD figures', () => {
    const f = fighter('p', 'party', 5, 5, { move: 0, initiative: 20, hp: 30, maxHp: 30, hd: 4, save: 21, poisonCloudImmune: true });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', cloudkillPoison: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    c.current();

    expect(f.hp).toBe(30);
    expect(f.flags.has('dead')).toBe(false);
    expect(c.log.find((e) => e.type === 'hazard' && e.hazard === 'cloudkill')).toBeUndefined();
  });

  it('CoAB Cloudkill poison kills a 5-HD figure on failed save', () => {
    const f = fighter('p', 'party', 5, 5, { move: 0, initiative: 20, hp: 30, maxHp: 30, hd: 5, save: 21 });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', cloudkillPoison: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    c.current();
    expect(f.flags.has('dead')).toBe(true);
  });

  it('CoAB Cloudkill poison does not affect 7-HD figures', () => {
    const f = fighter('p', 'party', 5, 5, { move: 0, initiative: 20, hp: 30, maxHp: 30, hd: 7, save: 21 });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (c === 5 && r === 5 ? { kind: 'cloudkill', cloudkillPoison: true } : undefined),
    };
    const c = createTacticalCombat([f, lazyFoe()], field, { seed: 1 });

    c.current();
    expect(f.hp).toBe(30);
    expect(f.flags.has('dead')).toBe(false);
    expect(c.log.find((e) => e.type === 'hazard')).toBeUndefined();
  });

  it('onRoundStart runs before begin-turn hazard exposure', () => {
    let cloudActive = true;
    const f = fighter('p', 'party', 5, 5, { move: 0, initiative: 20, hp: 30, maxHp: 30 });
    const field: TerrainGrid = {
      width: 11, height: 11,
      hazard: (c, r) => (cloudActive && c === 5 && r === 5 ? { kind: 'cloud', damage: { count: 2, sides: 6, bonus: 0 } } : undefined),
    };

    const c = createTacticalCombat([f, lazyFoe()], field, {
      seed: 1,
      onRoundStart: () => { cloudActive = false; },
    });

    c.current();
    expect(c.log.find((e) => e.type === 'hazard')).toBeUndefined();
    expect(f.hp).toBe(30);
  });

  it('difficult ground (cost 2) shrinks the reachable set', () => {
    const open = reachableCells({ col: 5, row: 5 }, 8, { width: 11, height: 11 }, new Set(), 4);
    const rough = reachableCells({ col: 5, row: 5 }, 8, { width: 11, height: 11, cost: () => TERRAIN_COST.DIFFICULT }, new Set(), 4);
    expect(rough.size).toBeLessThan(open.size);
  });

  it('TERRAIN_COST mirrors the COAB BackGroundTiles tiers', () => {
    expect(TERRAIN_COST.OPEN).toBe(1);
    expect(TERRAIN_COST.DIFFICULT).toBe(2);
    expect(TERRAIN_COST.VERY_DIFFICULT).toBe(4);
  });

  it('hazardAt exposes the zone for the UI', () => {
    const c = createTacticalCombat([mover(), lazyFoe()], webField(5, 5), { seed: 1 });
    expect(c.hazardAt(5, 5)?.kind).toBe('web');
    expect(c.hazardAt(0, 0)).toBeUndefined();
  });
});

describe('missile range brackets (CT.7c)', () => {
  // A maxRange-9 bow: short ≤ 3, medium 4..6, long > 6.
  it('missileRangeBracket splits the weapon range into thirds', () => {
    expect(missileRangeBracket(1, 9)).toBe('short');
    expect(missileRangeBracket(3, 9)).toBe('short');
    expect(missileRangeBracket(4, 9)).toBe('medium');
    expect(missileRangeBracket(6, 9)).toBe('medium');
    expect(missileRangeBracket(7, 9)).toBe('long');
    expect(missileRangeBracket(9, 9)).toBe('long');
    expect(missileRangeBracket(2, 0)).toBe('short'); // no real range ⇒ short
  });

  it('rangeBracketToHit is short +1 / medium 0 / long −2', () => {
    expect(rangeBracketToHit('short')).toBe(1);
    expect(rangeBracketToHit('medium')).toBe(0);
    expect(rangeBracketToHit('long')).toBe(-2);
  });

  // A shooter at col 0; a target at varying distance along row 5. thac0 15 vs AC 5 ⇒ base needed 10.
  const archer = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('a', 'party', 0, 5, { thac0: 15, move: 0, initiative: 20, ...over });
  const dummy = (col: number): TacticalCombatant =>
    fighter('t', 'enemy', col, 5, { ac: 5, hp: 99, maxHp: 99, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
  // Fresh bow each call (the shared-`bow` ammo gotcha): maxRange 9 ⇒ short ≤3, long >6.
  const freshBow = (): Weapon => ({ name: 'bow', kind: 'missile', damage: { count: 1, sides: 1, bonus: 0 }, range: 9, ammo: 20 });

  it('a short-range shot gets +1 to hit (needed drops by 1)', () => {
    const c = createTacticalCombat([archer({ weapons: [freshBow()] }), dummy(3)], openField(13, 11), { seed: 3 });
    const ev = c.apply({ type: 'missile', targetId: 't' }).find((e) => e.type === 'attack')!;
    expect(ev.rangeBracket).toBe('short');
    expect(ev.needed).toBe(15 - 5 - 1);
  });

  it('a medium-range shot has no modifier', () => {
    const c = createTacticalCombat([archer({ weapons: [freshBow()] }), dummy(5)], openField(13, 11), { seed: 3 });
    const ev = c.apply({ type: 'missile', targetId: 't' }).find((e) => e.type === 'attack')!;
    expect(ev.rangeBracket).toBe('medium');
    expect(ev.needed).toBe(15 - 5);
  });

  it('a long-range shot takes −2 to hit (needed rises by 2)', () => {
    const c = createTacticalCombat([archer({ weapons: [freshBow()] }), dummy(8)], openField(13, 11), { seed: 3 });
    const ev = c.apply({ type: 'missile', targetId: 't' }).find((e) => e.type === 'attack')!;
    expect(ev.rangeBracket).toBe('long');
    expect(ev.needed).toBe(15 - 5 + 2);
  });

  it('a melee blow carries no range bracket', () => {
    // The target faces WEST (4) toward the attacker at its west ⇒ frontal (no rear bonus).
    const tgt = fighter('t', 'enemy', 6, 5, { ac: 5, hp: 99, maxHp: 99, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, facing: 4 });
    const atk = fighter('a', 'party', 5, 5, { thac0: 15, move: 0, initiative: 20 });
    const c = createTacticalCombat([atk, tgt], openField(13, 11), { seed: 3 });
    const ev = c.apply({ type: 'melee', targetId: 't' }).find((e) => e.type === 'attack')!;
    expect(ev.rangeBracket).toBeUndefined();
    expect(ev.needed).toBe(15 - 5); // frontal ⇒ no rear bonus, no range bracket
  });

  it('missileBracket seam reports the band for the current archer', () => {
    const c = createTacticalCombat([archer({ weapons: [freshBow()] }), dummy(8)], openField(13, 11), { seed: 3 });
    expect(c.missileBracket('t')).toBe('long');
    const noBow = createTacticalCombat([archer(), dummy(8)], openField(13, 11), { seed: 3 });
    expect(noBow.missileBracket('t')).toBeNull();
  });

  // M51.S1 — missileBracket() used to measure anchor-to-anchor chebyshev() while resolveHit() (the
  // real to-hit roll) measures footprint-aware figureDistance(); these disagree for a Large (2x2)
  // target whose nearest occupied cell is closer than its anchor. Approaching from the far corner:
  // anchor-to-anchor is 7 (long, >6) but the nearest footprint cell is 6 away (medium, 4..6).
  it('missileBracket measures footprint distance, not anchor distance, for a Large target', () => {
    const attacker = fighter('a', 'party', 10, 10, { thac0: 15, move: 0, initiative: 20, weapons: [freshBow()] });
    const dragon = fighter('t', 'enemy', 3, 3, { size: 2, ac: 5, hp: 99, maxHp: 99, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 });
    expect(chebyshev({ col: 10, row: 10 }, { col: 3, row: 3 })).toBe(7);
    expect(footprintDistance({ col: 10, row: 10 }, 1, { col: 3, row: 3 }, 2)).toBe(6);
    const c = createTacticalCombat([attacker, dragon], openField(20, 20), { seed: 3 });
    expect(c.missileBracket('t')).toBe('medium');
  });
});

describe('guard readied reactions (CT.7d)', () => {
  // Guardian 'g' (party) acts first; advancer 'm' (enemy) closes on it.
  const guardian = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('g', 'party', 5, 5, { thac0: 5, move: 0, initiative: 20, ...over }); // thac0 5 ⇒ near-certain hit
  const advancer = (col: number, over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('m', 'enemy', col, 5, { ac: 10, hp: 30, maxHp: 30, move: 6, initiative: 1, ...over });

  it('the guard action readies the Guarding stance and ends the turn', () => {
    const g = guardian();
    const c = createTacticalCombat([g, advancer(8)], openField(13, 11), { seed: 1 });
    const evs = c.apply({ type: 'guard' });
    expect(evs.find((e) => e.type === 'guard')?.guarding).toBe(true);
    expect(g.flags.has('guarding')).toBe(true);
    expect(c.isGuarding('g')).toBe(true);
    expect(c.current()?.id).toBe('m'); // turn passed to the advancer
  });

  it('a pure missile weapon cannot ready Guard', () => {
    const archer = guardian({ weapons: [{ ...bow }], move: 4 });
    const c = createTacticalCombat([archer, advancer(8)], openField(13, 11), { seed: 1 });
    const evs = c.apply({ type: 'guard' });
    expect(evs).toEqual([]);
    expect(archer.flags.has('guarding')).toBe(false);
    expect(c.legalActions().some((a) => a.type === 'guard')).toBe(false);
    expect(c.current()?.id).toBe('g'); // rejected action does not spend the turn
  });

  it('a thrown/ranged-melee weapon can still ready Guard', () => {
    const dart: Weapon = { name: 'dart', kind: 'melee', damage: { count: 1, sides: 3, bonus: 0 }, reach: 1, range: 5 };
    const thrower = guardian({ weapons: [dart], move: 4 });
    const c = createTacticalCombat([thrower, advancer(8)], openField(13, 11), { seed: 1 });
    expect(c.legalActions().some((a) => a.type === 'guard')).toBe(true);
    const evs = c.apply({ type: 'guard' });
    expect(evs.find((e) => e.type === 'guard')?.guarding).toBe(true);
    expect(thrower.flags.has('guarding')).toBe(true);
    expect(c.current()?.id).toBe('m');
  });

  it('a foe that moves into reach provokes the readied strike (opportunity)', () => {
    const g = guardian();
    const m = advancer(8);
    const c = createTacticalCombat([g, m], openField(13, 11), { seed: 1 });
    c.apply({ type: 'guard' });                       // g readies
    const evs = c.apply({ type: 'move', to: { col: 6, row: 5 } }); // m steps adjacent to g
    const op = evs.find((e) => e.type === 'attack' && e.opportunity);
    expect(op).toBeTruthy();
    expect(op?.actor).toBe('g');
    expect(op?.target).toBe('m');
    expect(g.flags.has('guarding')).toBe(false);      // reaction spent
  });

  // M77.S1 — applyFlee() relocates a combatant through the identical reachableCells() machinery as
  // applyMove(), but previously never called triggerGuardReactions() afterward, so a routed foe got
  // a free pass past a readied guard purely because it fled instead of moved. g sits one orthogonal
  // step from the map's top edge; f (move: 1 ⇒ exactly one reachable orthogonal step, budget 2) has
  // its nearest-edge cell blocked by g's own occupied cell, so its best reachable (lowest edge-
  // distance) cell is the one directly adjacent to g.
  it('a fleeing foe that ends up in a guard\'s reach provokes the readied strike too', () => {
    const g = fighter('g', 'party', 6, 1, { thac0: 5, move: 0, initiative: 20 });
    const f = fighter('f', 'enemy', 6, 3, { ac: 10, hp: 30, maxHp: 30, move: 1, initiative: 1 });
    const c = createTacticalCombat([g, f], openField(13, 11), { seed: 1 });
    c.apply({ type: 'guard' });                  // g readies
    const evs = c.apply({ type: 'flee' });        // f's only escape-ward cell lands beside g
    expect(f.pos).toEqual({ col: 6, row: 2 });
    const op = evs.find((e) => e.type === 'attack' && e.opportunity);
    expect(op).toBeTruthy();
    expect(op?.actor).toBe('g');
    expect(op?.target).toBe('f');
    expect(g.flags.has('guarding')).toBe(false);  // reaction spent, same as the move-triggered case
  });

  it('a foe that stays out of reach does not provoke', () => {
    const g = guardian();
    const c = createTacticalCombat([g, advancer(8)], openField(13, 11), { seed: 1 });
    c.apply({ type: 'guard' });
    const evs = c.apply({ type: 'move', to: { col: 7, row: 5 } }); // 2 cells away — not adjacent
    expect(evs.some((e) => e.type === 'attack')).toBe(false);
    expect(g.flags.has('guarding')).toBe(true);       // still readied
  });

  it('a disabled guard (held) cannot react', () => {
    const g = guardian();
    const c = createTacticalCombat([g, advancer(8)], openField(13, 11), { seed: 1 });
    c.apply({ type: 'guard' });
    g.flags.add('held');                               // magically held before the foe closes
    const evs = c.apply({ type: 'move', to: { col: 6, row: 5 } });
    expect(evs.some((e) => e.type === 'attack')).toBe(false);
  });

  it('the readied guard lapses when the guardian’s own turn comes round again', () => {
    const g = guardian();
    const c = createTacticalCombat([g, advancer(8)], openField(13, 11), { seed: 1 });
    c.apply({ type: 'guard' });           // round 1: g readies
    c.apply({ type: 'wait' });            // round 1: m waits (no approach)
    expect(c.current()?.id).toBe('g');    // round 2: back to g
    expect(g.flags.has('guarding')).toBe(false); // the stale guard cleared at beginTurn
  });
});

describe('leaving melee reach reactions', () => {
  it('a foe gets a free strike before the mover leaves its melee reach', () => {
    const mover = fighter('m', 'party', 6, 5, { ac: 10, hp: 30, maxHp: 30, move: 6, initiative: 20 });
    const foe = fighter('f', 'enemy', 5, 5, { thac0: 5, move: 0, initiative: 1 });
    const c = createTacticalCombat([mover, foe], openField(13, 11), { seed: 1 });
    const evs = c.apply({ type: 'move', to: { col: 8, row: 5 } });
    const leaveIdx = evs.findIndex((e) => e.type === 'attack' && e.leaving);
    const moveIdx = evs.findIndex((e) => e.type === 'move');
    expect(leaveIdx).toBeGreaterThanOrEqual(0);
    expect(moveIdx).toBeGreaterThan(leaveIdx);
    expect(evs[leaveIdx]?.actor).toBe('f');
    expect(evs[leaveIdx]?.target).toBe('m');
    expect(mover.pos).toEqual({ col: 8, row: 5 });
  });

  it('does not trigger when the destination is still inside the foe reach', () => {
    const mover = fighter('m', 'party', 6, 5, { ac: 10, hp: 30, maxHp: 30, move: 6, initiative: 20 });
    const foe = fighter('f', 'enemy', 5, 5, { thac0: 5, move: 0, initiative: 1 });
    const c = createTacticalCombat([mover, foe], openField(13, 11), { seed: 1 });
    const evs = c.apply({ type: 'move', to: { col: 6, row: 6 } });
    expect(evs.some((e) => e.type === 'attack' && e.leaving)).toBe(false);
    expect(mover.pos).toEqual({ col: 6, row: 6 });
  });
});

describe('delay command (CT.7e)', () => {
  // Three fighters, fixed initiative so the round order is deterministic: a (20) → b (10) → e (1).
  const a = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('a', 'party', 2, 5, { initiative: 20, ...over });
  const b = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('b', 'party', 3, 5, { initiative: 10, ...over });
  const e = (over: Partial<TacticalCombatant> = {}): TacticalCombatant =>
    fighter('e', 'enemy', 10, 5, { initiative: 1, ...over });

  it('delay defers the actor to the end of the round; the next figure acts now', () => {
    const c = createTacticalCombat([a(), b(), e()], openField(13, 11), { seed: 1 });
    expect(c.current()?.id).toBe('a');                 // a leads
    const evs = c.apply({ type: 'delay' });
    expect(evs.find((ev) => ev.type === 'delay')?.actor).toBe('a');
    expect(c.current()?.id).toBe('b');                 // b slides up and is now acting
  });

  it('the deferred figure still gets its full turn later in the same round', () => {
    const c = createTacticalCombat([a(), b(), e()], openField(13, 11), { seed: 1 });
    c.apply({ type: 'delay' });                         // a → end of order: b, e, a
    expect(c.current()?.id).toBe('b');
    c.apply({ type: 'wait' });
    expect(c.current()?.id).toBe('e');
    c.apply({ type: 'wait' });
    expect(c.current()?.id).toBe('a');                 // a finally acts, last this round
    expect(c.round()).toBe(1);                          // still round 1 — it deferred, didn't skip
    // a's turn is untouched: full movement budget restored.
    expect(c.legalActions().some((act) => act.type === 'move')).toBe(true);
  });

  it('a figure can only Delay once per round (no infinite deferral)', () => {
    const c = createTacticalCombat([a(), b(), e()], openField(13, 11), { seed: 1 });
    c.apply({ type: 'delay' });                         // a defers once
    c.apply({ type: 'wait' });                          // b
    c.apply({ type: 'wait' });                          // e
    expect(c.current()?.id).toBe('a');
    expect(c.canDelay()).toBe(false);                   // already delayed this round
    expect(c.legalActions().some((act) => act.type === 'delay')).toBe(false);
    expect(c.apply({ type: 'delay' })).toEqual([]);     // a no-op
    expect(c.current()?.id).toBe('a');                  // still a's turn (re-prompt)
  });

  it('the last figure to act cannot Delay (no later slot to defer into)', () => {
    const c = createTacticalCombat([a(), b(), e()], openField(13, 11), { seed: 1 });
    c.apply({ type: 'wait' });                          // a
    c.apply({ type: 'wait' });                          // b
    expect(c.current()?.id).toBe('e');                 // last in the round
    expect(c.canDelay()).toBe(false);
    expect(c.apply({ type: 'delay' })).toEqual([]);
  });

  it('Delay is illegal once the actor has moved (start-of-turn only)', () => {
    const c = createTacticalCombat([a(), b(), e()], openField(13, 11), { seed: 1 });
    expect(c.canDelay()).toBe(true);
    c.apply({ type: 'move', to: { col: 3, row: 6 } });  // a spends part of its move
    // a still has movement, but having acted it can no longer defer.
    expect(c.canDelay()).toBe(false);
    expect(c.legalActions().some((act) => act.type === 'delay')).toBe(false);
  });

  it('a fresh round restores the right to Delay', () => {
    const c = createTacticalCombat([a(), b(), e()], openField(13, 11), { seed: 1 });
    c.apply({ type: 'delay' });                         // round 1: a defers
    c.apply({ type: 'wait' });                          // b
    c.apply({ type: 'wait' });                          // e
    c.apply({ type: 'wait' });                          // a (now last)
    expect(c.round()).toBe(2);                          // into round 2
    expect(c.current()?.id).toBe('a');
    expect(c.canDelay()).toBe(true);                    // delayedThisRound cleared
  });
});

describe('large (>1 cell) monster multi-cell occupancy (CT.7f)', () => {
  it('footprintCells maps size to a top-left-anchored block', () => {
    expect(footprintCells({ col: 4, row: 4 })).toEqual([{ col: 4, row: 4 }]); // default 1×1
    expect(footprintCells({ col: 4, row: 4 }, 1)).toEqual([{ col: 4, row: 4 }]);
    expect(footprintCells({ col: 4, row: 4 }, 2)).toEqual([
      { col: 4, row: 4 }, { col: 5, row: 4 }, { col: 4, row: 5 }, { col: 5, row: 5 },
    ]);
  });

  it('footprintDistance measures from the NEAREST cells of each figure', () => {
    // A 2×2 anchored at (5,5) fills (5,5)..(6,6); a 1×1 at (8,5) is 2 cells from the near edge (6,5),
    // not 3 from the anchor.
    expect(footprintDistance({ col: 5, row: 5 }, 2, { col: 8, row: 5 }, 1)).toBe(2);
    expect(chebyshev({ col: 5, row: 5 }, { col: 8, row: 5 })).toBe(3); // anchor-only would over-state it
    // Two 1×1 figures fall back to plain Chebyshev.
    expect(footprintDistance({ col: 0, row: 0 }, 1, { col: 3, row: 4 }, 1)).toBe(4);
  });

  it('a Large figure blocks all four of its cells for movement', () => {
    const ogre = fighter('O', 'enemy', 5, 5, { size: 2, move: 0 });    // fills (5,5)..(6,6)
    const hero = fighter('h', 'party', 5, 7, { move: 4 });             // 2 cells below the block
    const c = createTacticalCombat([hero, ogre], openField(13, 13), { seed: 1 });
    const reach = c.reachable();
    expect(reach.has('5,6')).toBe(false); // an ogre cell — blocked
    expect(reach.has('6,6')).toBe(false); // an ogre cell — blocked
    expect(reach.has('5,7')).toBe(true);  // its own start cell is reachable (cost 0)
    expect(reach.has('4,6')).toBe(true);  // beside the block — free
  });

  it('a Large mover may not move where its footprint would leave the grid', () => {
    // A 2×2 hero anchored at (10,5) on an 12-wide field fills cols 10,11 — it cannot step its anchor to
    // col 11 (that would put its right column at col 12, off the 0..11 grid).
    const big = fighter('B', 'party', 10, 5, { size: 2, move: 6 });
    const foe = fighter('e', 'enemy', 2, 2, { move: 0 });
    const c = createTacticalCombat([big, foe], openField(12, 11), { seed: 1 });
    const reach = c.reachable();
    expect(reach.has('11,5')).toBe(false); // right column would fall off the east edge
    expect(reach.has('9,5')).toBe(true);   // westward is fine
    expect(reach.has('10,6')).toBe(true);  // southward keeps both columns on-grid
  });

  it('a Large monster melees from any of its cells (footprint reach), 2 cells beyond its anchor', () => {
    const dragon = fighter('D', 'enemy', 5, 5, { size: 2, move: 0, initiative: 20 }); // (5,5)..(6,6), acts first
    const hero = fighter('h', 'party', 7, 6, { move: 0, initiative: 1 });             // touches cell (6,6)
    const c = createTacticalCombat([dragon, hero], openField(13, 13), { seed: 1 });
    expect(c.current()?.id).toBe('D');
    const melee = c.legalActions().filter((a) => a.type === 'melee').map((a) => a.targetId);
    expect(melee).toContain('h'); // reach 1 from the (6,6) cell — anchor (5,5)→(7,6) chebyshev would be 2
    expect(chebyshev(dragon.pos, hero.pos)).toBe(2); // proves the anchor alone is out of reach-1
  });

  it('a foe adjacent only to a Large monster’s far cell is still a legal melee target', () => {
    const dragon = fighter('D', 'enemy', 5, 5, { size: 2, initiative: 1 }); // acts after the hero
    const hero = fighter('h', 'party', 7, 6, { move: 0, initiative: 20 });  // touches cell (6,6)
    const c = createTacticalCombat([hero, dragon], openField(13, 13), { seed: 1 });
    expect(c.current()?.id).toBe('h');
    const melee = c.legalActions().filter((a) => a.type === 'melee').map((a) => a.targetId);
    expect(melee).toContain('D'); // the hero can hit the dragon's near cell
  });

  it('a burst spell catches a Large monster if any of its cells is in the blast', () => {
    const mage = fighter('m', 'party', 1, 1, {
      move: 0, initiative: 20,
      preparedSpells: [{ id: 'fb', name: 'Fireball', target: 'enemy', area: 'burst', radius: 1, range: 12, damage: { count: 3, sides: 6, bonus: 0 } }],
    });
    const dragon = fighter('D', 'enemy', 6, 6, { size: 2, hp: 40, maxHp: 40, initiative: 1 }); // (6,6)..(7,7)
    const c = createTacticalCombat([mage, dragon], openField(13, 13), { seed: 1 });
    // Aim the burst at (8,8): radius 1 around it reaches the dragon's (7,7) cell but not its anchor (6,6).
    const evs = c.apply({ type: 'cast', spellId: 'fb', to: { col: 8, row: 8 } });
    const hit = evs.find((e) => e.type === 'cast' && e.target === 'D');
    expect(hit).toBeTruthy();
    expect(dragon.hp).toBeLessThan(40);
  });
});

describe('party flee — Got Away vs Escape is blocked (CT.7g)', () => {
  it('partyCanEscape is true when every member can reach the border', () => {
    const h1 = fighter('h1', 'party', 1, 4, { move: 4 }); // 1 cell from the west edge
    const h2 = fighter('h2', 'party', 1, 3, { move: 4 });
    const e = fighter('e', 'enemy', 8, 4, { move: 0 });
    const c = createTacticalCombat([h1, h2, e], openField(9, 9), { seed: 1 });
    expect(c.partyCanEscape()).toBe(true);
  });

  it('a member already standing on the edge counts as able to withdraw', () => {
    const onEdge = fighter('h1', 'party', 0, 4, { move: 0 }); // on the west border, can't move but already out
    const e = fighter('e', 'enemy', 8, 4, { move: 0 });
    const c = createTacticalCombat([onEdge, e], openField(9, 9), { seed: 1 });
    expect(c.partyCanEscape()).toBe(true);
  });

  it('attemptPartyFlee succeeds — the whole party Gets Away and the battle ends as a withdraw', () => {
    const h1 = fighter('h1', 'party', 1, 4, { move: 4 });
    const h2 = fighter('h2', 'party', 1, 5, { move: 4 });
    const e = fighter('e', 'enemy', 8, 4, { move: 0 });
    const c = createTacticalCombat([h1, h2, e], openField(9, 9), { seed: 1 });
    const evs = c.attemptPartyFlee();
    const pf = evs.find((ev) => ev.type === 'party-flee');
    expect(pf?.escaped).toBe(true);
    expect(evs.find((ev) => ev.type === 'end')?.fled).toBe(true);
    expect(c.isOver()).toBe(true);
    const res = c.result();
    expect(res.fled).toBe(true);
    expect(res.outcome).toBe('draw'); // a withdraw is neither a win nor a loss
    expect(h1.flags.has('fled')).toBe(true);
    expect(h2.flags.has('fled')).toBe(true);
  });

  it('Escape is blocked when a member is boxed in (cannot reach any border)', () => {
    const free = fighter('h1', 'party', 0, 4, { move: 4 });      // already on the edge
    const trapped = fighter('h2', 'party', 4, 4, { move: 0 });   // interior, immobile → cannot withdraw
    const e = fighter('e', 'enemy', 8, 4, { move: 0 });
    const c = createTacticalCombat([free, trapped, e], openField(9, 9), { seed: 1 });
    expect(c.partyCanEscape()).toBe(false);
    const evs = c.attemptPartyFlee();
    expect(evs.find((ev) => ev.type === 'party-flee')?.escaped).toBe(false);
    expect(evs.some((ev) => ev.type === 'end')).toBe(false); // no end event — the fight goes on
    expect(c.isOver()).toBe(false);
    expect(c.result().fled).toBe(false);
    expect(trapped.flags.has('fled')).toBe(false);
  });

  it('the single-figure flee action is unaffected (an individual rout, not the party withdraw)', () => {
    const h1 = fighter('h1', 'party', 1, 4, { move: 4, initiative: 20 });
    const e = fighter('e', 'enemy', 7, 4, { move: 0, initiative: 1 });
    const c = createTacticalCombat([h1, e], openField(9, 9), { seed: 1 });
    expect(c.current()?.id).toBe('h1');
    c.apply({ type: 'flee' });          // h1 routs toward the edge on its own
    expect(c.result().fled).toBe(false); // NOT a party-flee withdraw
  });
});

describe('post-battle bring-up: conditionOf dead vs unconscious (CT.7h)', () => {
  // Drive an enemy maul into a party member, then read the engine's post-battle condition seam that
  // the roster bring-up uses to carry the dead-vs-down distinction across to the exploration party.
  function meleeTarget(c: ReturnType<typeof createTacticalCombat>): void {
    let guard = 0;
    while (!c.isOver() && guard++ < 20) {
      const a = c.current()!;
      if (a.id === 'e') { c.apply({ type: 'melee', targetId: 'h' }); break; }
      c.apply(c.aiAction());
    }
  }

  it('a standing (and a missing) figure reports ok', () => {
    const h = fighter('h', 'party', 5, 5);
    const e = fighter('e', 'enemy', 7, 5, { move: 0 });
    const c = createTacticalCombat([h, e], openField(11, 11), { seed: 1 });
    expect(c.conditionOf('h')).toBe('ok');
    expect(c.conditionOf('nobody')).toBe('ok');
  });

  it('a blow that drops a figure 1-9 HP below zero leaves it dying (revivable)', () => {
    const h = fighter('h', 'party', 6, 5, { hp: 8, maxHp: 8, ac: 10 });
    const e = fighter('e', 'enemy', 5, 5, { thac0: 1, move: 0, attacksPerRound: 1,
      weapons: [{ name: 'club', kind: 'melee', damage: { count: 1, sides: 1, bonus: 16 }, reach: 1 }] }); // 17 dmg: leaves the 8-HP target at -9
    const c = createTacticalCombat([h, e], openField(11, 11), { seed: 3 });
    meleeTarget(c);
    expect(h.hp).toBeLessThanOrEqual(0);
    expect(h.flags.has('dying')).toBe(true);
    expect(h.bleeding).toBe(9);
    expect(h.flags.has('unconscious')).toBe(false);
    expect(h.flags.has('dead')).toBe(false);
    expect(c.conditionOf('h')).toBe('unconscious');
  });

  it('a blow that reaches 10 HP below zero slays the figure outright -- dead (needs Raise Dead)', () => {
    const h = fighter('h', 'party', 6, 5, { hp: 1, maxHp: 20, ac: 10 });
    const e = fighter('e', 'enemy', 5, 5, { thac0: 1, move: 0, attacksPerRound: 1,
      weapons: [{ name: 'maul', kind: 'melee', damage: { count: 1, sides: 1, bonus: 10 }, reach: 1 }] }); // 11 dmg: leaves the 1-HP target at -10
    const c = createTacticalCombat([h, e], openField(11, 11), { seed: 3 });
    meleeTarget(c);
    expect(h.flags.has('dead')).toBe(true);
    expect(c.conditionOf('h')).toBe('dead');
  });

  it('under the gen2 ruleset the same overkill is only unconscious — no permadeath to carry over', () => {
    const h = fighter('h', 'party', 6, 5, { hp: 1, maxHp: 20, ac: 10 });
    const e = fighter('e', 'enemy', 5, 5, { thac0: 1, move: 0, attacksPerRound: 1,
      weapons: [{ name: 'maul', kind: 'melee', damage: { count: 1, sides: 1, bonus: 30 }, reach: 1 }] });
    const c = createTacticalCombat([h, e], openField(11, 11), { seed: 3, ruleset: 'gen2' });
    meleeTarget(c);
    expect(h.hp).toBeLessThanOrEqual(0);
    expect(h.flags.has('dying')).toBe(true);
    expect(c.conditionOf('h')).toBe('unconscious');
  });

  it('a dying figure carries CoAB actions.bleeding and bleeds to dead at the next round when it passes 9', () => {
    const down = fighter('h', 'party', 1, 1, { hp: 0, maxHp: 12, move: 0, initiative: 1, weapons: [], flags: new Set(['dying']), bleeding: 8 });
    const guard = fighter('g', 'party', 2, 1, { hp: 12, maxHp: 12, move: 0, initiative: 20, weapons: [] });
    const foe = fighter('e', 'enemy', 7, 1, { hp: 12, maxHp: 12, move: 0, initiative: 10, weapons: [] });
    const c = createTacticalCombat([down, guard, foe], openField(11, 11), { seed: 1 });

    expect(down.bleeding).toBe(9); // combat construction begins round 1 and runs BattleRoundChecks once
    c.apply({ type: 'endTurn' }); // guard
    const evs = c.apply({ type: 'endTurn' }); // foe; round 2 begins and bleeding ticks 9 -> 10

    expect(evs.some((ev) => ev.type === 'status' && ev.target === 'h' && ev.bleeding === 10)).toBe(true);
    expect(evs.some((ev) => ev.type === 'slain' && ev.target === 'h' && ev.dead === true && ev.bleeding === 10)).toBe(true);
    expect(down.flags.has('dying')).toBe(false);
    expect(down.flags.has('dead')).toBe(true);
    expect(c.conditionOf('h')).toBe('dead');
  });

  it('bandage converts the first dying party member to unconscious and stops bleeding', () => {
    const down = fighter('h', 'party', 1, 1, { hp: 0, maxHp: 12, move: 0, initiative: 1, weapons: [], flags: new Set(['dying']), bleeding: 5 });
    const helper = fighter('g', 'party', 2, 1, { hp: 12, maxHp: 12, move: 0, initiative: 20, weapons: [] });
    const foe = fighter('e', 'enemy', 7, 1, { hp: 12, maxHp: 12, move: 0, initiative: 10, weapons: [] });
    const c = createTacticalCombat([down, helper, foe], openField(11, 11), { seed: 1 });

    expect(c.canBandage()).toBe(true);
    expect(c.legalActions().some((a) => a.type === 'bandage' && a.targetId === 'h')).toBe(true);
    const evs = c.apply({ type: 'bandage' });

    expect(evs).toContainEqual({ round: 1, type: 'bandage', actor: 'g', target: 'h' });
    expect(down.flags.has('dying')).toBe(false);
    expect(down.flags.has('unconscious')).toBe(true);
    expect(down.flags.has('dead')).toBe(false);
    expect(down.bleeding).toBeUndefined();
    expect(c.conditionOf('h')).toBe('unconscious');

    c.apply({ type: 'endTurn' }); // foe; round 2 begins, but h no longer bleeds
    expect(down.flags.has('dead')).toBe(false);
  });
});

describe('coup de grace — slays the helpless in melee (CT.7j)', () => {
  // A melee blow on a helpless (asleep/held) foe is the byte-located "slays helpless … with one cruel
  // blow" coup-de-grace: it finishes the target outright, regardless of HP or the +10 overkill rule.
  it('a melee strike on a SLEEPING foe slays it outright (a weak weapon, a huge HP pool)', () => {
    // thac0 30 + a 1-damage tap: nothing but the coup-de-grace could kill a 99-HP target.
    const p = fighter('p', 'party', 5, 5, { thac0: 30, initiative: 20, move: 0, weapons: [{ name: 'tap', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { hp: 99, maxHp: 99, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['asleep']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    expect(c.current()!.id).toBe('p');
    const evs = c.apply({ type: 'melee', targetId: 'e' });
    const atk = evs.find((ev) => ev.type === 'attack')!;
    expect(atk.hit).toBe(true);
    expect(atk.helpless).toBe(true);
    expect(atk.coupDeGrace).toBe(true);
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(e.flags.has('dead')).toBe(true); // "slays" → a kill, not a knockout
    expect(evs.find((ev) => ev.type === 'slain' && ev.target === 'e')?.coupDeGrace).toBe(true);
  });

  it('a melee strike on a HELD foe slays it outright (hold no longer protects from the cruel blow)', () => {
    const p = fighter('p', 'party', 5, 5, { thac0: 30, initiative: 20, move: 0, weapons: [{ name: 'tap', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { hp: 50, maxHp: 50, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['held']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    const evs = c.apply({ type: 'melee', targetId: 'e' });
    expect(evs.find((ev) => ev.type === 'attack')!.coupDeGrace).toBe(true);
    expect(e.flags.has('dead')).toBe(true);
  });

  it('a coup-de-grace on a party member carries to the roster as DEAD (CT.7h), not merely down', () => {
    const monster = fighter('e', 'enemy', 6, 5, { thac0: 30, initiative: 20, move: 0, weapons: [{ name: 'claw', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 }] });
    const hero = fighter('p1', 'party', 5, 5, { hp: 40, maxHp: 40, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['held']) });
    const c = createTacticalCombat([monster, hero], openField(11, 11), { seed: 5 });
    expect(c.current()!.id).toBe('e');
    c.apply({ type: 'melee', targetId: 'p1' });
    expect(hero.flags.has('dead')).toBe(true);
    expect(c.conditionOf('p1')).toBe('dead');
  });

  it('a MISSILE on a helpless foe auto-hits but never coup-de-graces (no cruel blow at range)', () => {
    const p = fighter('p', 'party', 1, 1, { thac0: 30, initiative: 20, move: 0, weapons: [{ name: 'bow', kind: 'missile', damage: { count: 1, sides: 1, bonus: 0 }, range: 8, ammo: 20 }] });
    const e = fighter('e', 'enemy', 5, 1, { hp: 99, maxHp: 99, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['held']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    const evs = c.apply({ type: 'missile', targetId: 'e' });
    const atk = evs.find((ev) => ev.type === 'attack')!;
    expect(atk.helpless).toBe(true);
    expect(atk.coupDeGrace).toBeUndefined();
    expect(e.flags.has('dead')).toBe(false); // survives — no instant slay at range
  });

  it('a coup-de-grace ends the multi-attack routine (the slain foe is not struck a second time)', () => {
    const p = fighter('p', 'party', 5, 5, { thac0: 30, initiative: 20, move: 0, attacksPerRound: 3, weapons: [{ name: 'tap', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { hp: 99, maxHp: 99, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['asleep']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5 });
    const evs = c.apply({ type: 'melee', targetId: 'e' });
    // Only ONE attack lands — the first coup-de-grace kills the only foe; the remaining swings find nobody.
    expect(evs.filter((ev) => ev.type === 'attack').length).toBe(1);
    expect(evs.filter((ev) => ev.type === 'slain').length).toBe(1);
  });

  it('under the gen2 ruleset (DQK, unverified) a helpless melee is NOT a coup-de-grace — it auto-hits only', () => {
    const p = fighter('p', 'party', 5, 5, { thac0: 30, initiative: 20, move: 0, weapons: [{ name: 'tap', kind: 'melee', damage: { count: 1, sides: 1, bonus: 0 }, reach: 1 }] });
    const e = fighter('e', 'enemy', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], flags: new Set(['asleep']) });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 5, ruleset: 'gen2' });
    const evs = c.apply({ type: 'melee', targetId: 'e' });
    const atk = evs.find((ev) => ev.type === 'attack')!;
    expect(atk.hit).toBe(true);
    expect(atk.helpless).toBe(true);
    expect(atk.coupDeGrace).toBeUndefined(); // gen2 keeps the ordinary auto-hit; instant slay unverified
    expect(e.flags.has('dead')).toBe(false);
  });
});
