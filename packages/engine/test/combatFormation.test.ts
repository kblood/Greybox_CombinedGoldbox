/**
 * Battle-setup deployment (#45, ovr011) + combat-map geometry / AI fidelity deltas (#46, ovr010/032).
 *
 * Covers the formation generator (`deployCombatants`/`applyDeployment`), the SteppingPath half-step
 * distance (diagonal 1.5×), the `SortedCombatant` ordering, terrain-HEIGHT occlusion, and the tactical-AI
 * deltas: random (not focus-fire) target selection under a seeded RNG, save-aware spell choice, and the
 * morale Int>5 surrender-vs-rout split. Specs: docs/engine/research/decompile-ovr011-battle-setup.md,
 * decompile-ovr010-monster-ai.md, decompile-ovr032-combat-map.md.
 */
import { describe, it, expect } from 'vitest';
import {
  createTacticalCombat,
  deployCombatants,
  deployCoabSourceCombatants,
  coabSourceFootprintCells,
  applyDeployment,
  frontRankWidth,
  DEPLOY_REGION,
  steppingPathDistance,
  steppingPathCells,
  combatDirection,
  canReachWithHeight,
  sortedCombatants,
  monsterCombatant,
  preparedSpellsFromDokIds,
  type TacticalCombatant,
  type TacticalSpell,
  type Weapon,
  type TerrainGrid,
  type GridPos,
  type MonsterAbilities,
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

const inRegion = (p: GridPos, w = DEPLOY_REGION.width, h = DEPLOY_REGION.height): boolean =>
  p.col >= 0 && p.row >= 0 && p.col < w && p.row < h;

// ── #45 deployCombatants (ovr011) ─────────────────────────────────────────────────────────────────

describe('deployCombatants — ovr011 formation (#45)', () => {
  it('front-rank width is (count+1)/2 (half rounded up)', () => {
    expect(frontRankWidth(1)).toBe(1);
    expect(frontRankWidth(2)).toBe(1);
    expect(frontRankWidth(3)).toBe(2);
    expect(frontRankWidth(4)).toBe(2);
    expect(frontRankWidth(5)).toBe(3);
    expect(frontRankWidth(6)).toBe(3);
  });

  it('the placement region is 11×6 (x 0..10, y 0..5)', () => {
    expect(DEPLOY_REGION).toEqual({ width: 11, height: 6 });
  });

  it('anchors the party at corner (0,0) and the enemy encounter_distance away, facing back', () => {
    const d = deployCombatants(3, 3, 4, 8);
    // Party: anchor (0,0); front rank of 2 along +row, then the 3rd spills a rank back (+col).
    expect(d.party.map((p) => p.pos)).toEqual([
      { col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 0 },
    ]);
    // Enemy: anchored 8 cells along the facing axis (+col), same front-rank shape.
    expect(d.enemies.map((p) => p.pos)).toEqual([
      { col: 8, row: 0 }, { col: 8, row: 1 }, { col: 9, row: 0 },
    ]);
    // Normalized grid facings: party looks east (0), enemy west (4).
    expect(d.party.every((p) => p.facing === 0)).toBe(true);
    expect(d.enemies.every((p) => p.facing === 4)).toBe(true);
  });

  it('reproduces the spec 4-way overland facings: mapDirection/2 and ((mapDirection+4)%8)/2', () => {
    expect(deployCombatants(1, 1, 4, 6)).toMatchObject({ partyFacing4: 2, enemyFacing4: 0 });
    expect(deployCombatants(1, 1, 2, 6)).toMatchObject({ partyFacing4: 1, enemyFacing4: 3 });
    expect(deployCombatants(1, 1, 0, 6)).toMatchObject({ partyFacing4: 0, enemyFacing4: 2 });
    expect(deployCombatants(1, 1, 6, 6)).toMatchObject({ partyFacing4: 3, enemyFacing4: 1 });
  });

  it('keeps every placed figure inside the 11×6 region, even for an oversized team', () => {
    const d = deployCombatants(30, 30, 4, 6);
    const all = [...d.party, ...d.enemies].map((p) => p.pos);
    expect(all.every((p) => inRegion(p))).toBe(true);
    // No two figures share a cell (party + enemy share the one region).
    const keys = new Set(all.map((p) => `${p.col},${p.row}`));
    expect(keys.size).toBe(all.length);
  });

  it('never double-books a cell when the enemy anchors right next to the party (shared occupancy)', () => {
    const d = deployCombatants(3, 3, 4, 1); // enemy anchor col 1 — overlaps the party block
    const all = [...d.party, ...d.enemies].map((p) => `${p.pos.col},${p.pos.row}`);
    expect(new Set(all).size).toBe(all.length); // all distinct
  });

  it('applyDeployment seeds pos + facing onto live combatants in roster order', () => {
    const party = [fighter('p1', 'party', 99, 99), fighter('p2', 'party', 99, 99)];
    const enemies = [fighter('e1', 'enemy', 99, 99), fighter('e2', 'enemy', 99, 99)];
    applyDeployment(party, enemies, 4, 5);
    expect(party[0]!.pos).toEqual({ col: 0, row: 0 });
    expect(party[0]!.facing).toBe(0);
    expect(enemies[0]!.pos.col).toBe(5); // enemy anchored at encounter_distance 5
    expect(enemies[0]!.facing).toBe(4);
    // The deployed positions are all in-region and distinct.
    const all = [...party, ...enemies].map((c) => `${c.pos.col},${c.pos.row}`);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('deployCoabSourceCombatants — table-shaped CoAB placement oracle', () => {
  it('mirrors CoAB ovr033 size footprint deltas', () => {
    expect(coabSourceFootprintCells({ col: 10, row: 20 }, 1)).toEqual([{ col: 10, row: 20 }]);
    expect(coabSourceFootprintCells({ col: 10, row: 20 }, 2)).toEqual([{ col: 10, row: 20 }, { col: 10, row: 21 }]);
    expect(coabSourceFootprintCells({ col: 10, row: 20 }, 3)).toEqual([{ col: 10, row: 20 }, { col: 11, row: 20 }]);
    expect(coabSourceFootprintCells({ col: 10, row: 20 }, 4)).toEqual([
      { col: 10, row: 20 }, { col: 11, row: 20 }, { col: 10, row: 21 }, { col: 11, row: 21 },
    ]);
  });

  it('uses the recovered place_combatant tables instead of the web-normalized corner grid', () => {
    const d = deployCoabSourceCombatants(3, 3, 2, 1);

    expect(d.party.map((p) => p.local)).toEqual([
      { col: 4, row: 2 },
      { col: 5, row: 3 },
      { col: 2, row: 2 },
    ]);
    expect(d.party.map((p) => p.pos)).toEqual([
      { col: 26, row: 12 },
      { col: 27, row: 13 },
      { col: 24, row: 12 },
    ]);
    expect(d.enemies.map((p) => p.local)).toEqual([
      { col: 6, row: 3 },
      { col: 5, row: 2 },
      { col: 7, row: 3 },
    ]);
    expect(d.enemies.map((p) => p.pos)).toEqual([
      { col: 34, row: 13 },
      { col: 33, row: 12 },
      { col: 35, row: 13 },
    ]);
    expect(d.party.map((p) => p.sourceSize)).toEqual([1, 1, 1]);
  });

  it('keeps CoAB raw encounter_distance semantics instead of clamping to the visible region', () => {
    const d = deployCoabSourceCombatants(0, 1, 2, 8);

    expect(d.enemies[0]?.teamStart).toEqual({ col: 8, row: 0 });
    expect(d.enemies[0]?.pos).toEqual({ col: 76, row: 13 });
  });

  it('supports Gateway\'s mapPos-floorOrigin party start without changing the shared placement tables', () => {
    const d = deployCoabSourceCombatants(1, 1, 2, 1, { partyStart: { col: 2, row: -1 } });

    expect(d.party[0]?.teamStart).toEqual({ col: 2, row: -1 });
    expect(d.party[0]?.pos).toEqual({ col: 33, row: 7 });
    expect(d.enemies[0]?.teamStart).toEqual({ col: 3, row: -1 });
    expect(d.enemies[0]?.pos).toEqual({ col: 41, row: 8 });
  });

  it('pins Gateway ECL6 west-facing six-by-six wilderness placement at raw distance one', () => {
    const d = deployCoabSourceCombatants(6, 6, 6, 1, {
      partyStart: { col: 0, row: 0 },
      wilderness: true,
      blocked: (col, row) => col < 0 || row < 0 || col > 49 || row > 24,
    });

    expect(d.party.map((p) => [p.pos.col, p.pos.row])).toEqual([
      [28, 13], [27, 12], [29, 14], [30, 13], [29, 12], [31, 14],
    ]);
    expect(d.enemies.map((p) => [p.pos.col, p.pos.row])).toEqual([
      [20, 12], [21, 13], [19, 11], [19, 12], [20, 13], [18, 11],
    ]);
  });

  it('probes the next source candidate when terrain rejects the first final cell', () => {
    const d = deployCoabSourceCombatants(1, 0, 2, 1, {
      blocked: (col, row) => col === 26 && row === 12,
    });

    expect(d.party[0]?.pos).toEqual({ col: 24, row: 12 });
  });

  it('uses CoAB source-size footprints for placement occupancy', () => {
    const d = deployCoabSourceCombatants(3, 0, 2, 1, { partySizes: [4, 1, 1] });

    expect(d.party[0]?.sourceSize).toBe(4);
    expect(d.party[0]?.pos).toEqual({ col: 26, row: 12 });
    // The first size-4 figure occupies the 2x2 block including the normal second candidate (27,13),
    // so the source loop rejects that occupied footprint and keeps probing.
    expect(coabSourceFootprintCells(d.party[0]!.pos, d.party[0]!.sourceSize)).toEqual([
      { col: 26, row: 12 }, { col: 27, row: 12 }, { col: 26, row: 13 }, { col: 27, row: 13 },
    ]);
    expect(d.party[1]?.pos).toEqual({ col: 24, row: 12 });
  });
});

// ── #46 SteppingPath half-step distance (ovr032 §1a) ──────────────────────────────────────────────

describe('SteppingPath half-step distance — diagonal 1.5× (#46)', () => {
  it('counts orthogonal=2, diagonal=3 per cell (range in halves)', () => {
    expect(steppingPathDistance({ col: 0, row: 0 }, { col: 3, row: 0 })).toBe(6); // 3 orthogonal × 2
    expect(steppingPathDistance({ col: 0, row: 0 }, { col: 3, row: 3 })).toBe(9); // 3 diagonal × 3 (= 1.5×)
    expect(steppingPathDistance({ col: 0, row: 0 }, { col: 3, row: 1 })).toBe(7); // 1 diag(3) + 2 orth(4)
    expect(steppingPathDistance({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(3); // one diagonal = 1.5 cells
    expect(steppingPathDistance({ col: 5, row: 5 }, { col: 5, row: 5 })).toBe(0);
  });

  it('a single diagonal (3 half-steps) is dearer than a single orthogonal (2) but cheaper than two orth (4)', () => {
    const orth = steppingPathDistance({ col: 0, row: 0 }, { col: 1, row: 0 }); // 2
    const diag = steppingPathDistance({ col: 0, row: 0 }, { col: 1, row: 1 }); // 3
    const twoOrth = steppingPathDistance({ col: 0, row: 0 }, { col: 2, row: 0 }); // 4
    expect(orth).toBeLessThan(diag);
    expect(diag).toBeLessThan(twoOrth); // diagonal ≈ 1.5 cells, NOT Chebyshev's 1.0
  });

  it('combatDirection returns the MapDirection code (0=N,2=E,4=S,6=W; odd=diagonal; 8=no move)', () => {
    expect(combatDirection({ col: 0, row: 0 }, { col: 0, row: -1 })).toBe(0); // north
    expect(combatDirection({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(2);  // east
    expect(combatDirection({ col: 0, row: 0 }, { col: 0, row: 1 })).toBe(4);  // south
    expect(combatDirection({ col: 0, row: 0 }, { col: -1, row: 0 })).toBe(6); // west
    expect(combatDirection({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(3);  // SE (odd → diagonal)
    expect(combatDirection({ col: 0, row: 0 }, { col: 0, row: 0 })).toBe(8);  // no move
  });
});

// ── #46 SortedCombatant ordering (ovr032/033 §3) ──────────────────────────────────────────────────

describe('sortedCombatants ordering — nearest half-steps, then facing (#46)', () => {
  const actor = { id: 'a', pos: { col: 5, row: 5 } };

  it('ranks nearest-in-half-steps first (a diagonal foe can out-rank a farther orthogonal one)', () => {
    const cands = [
      { id: 'far', pos: { col: 5, row: 9 } },     // 4 orthogonal = 8 half-steps
      { id: 'diag', pos: { col: 6, row: 6 } },    // 1 diagonal = 3 half-steps
      { id: 'orth', pos: { col: 7, row: 5 } },    // 2 orthogonal = 4 half-steps
    ];
    const order = sortedCombatants(actor, cands).map((e) => e.combatant.id);
    expect(order).toEqual(['diag', 'orth', 'far']);
  });

  it('breaks a steps tie by ascending facing code', () => {
    // Both at half-step distance 7 (one diagonal + one orthogonal), different facing codes.
    const cands = [
      { id: 'se', pos: { col: 8, row: 6 } }, // SE-ish, dir 3
      { id: 'ne', pos: { col: 8, row: 4 } }, // NE-ish, dir 1
    ];
    const ranked = sortedCombatants(actor, cands);
    expect(ranked[0]!.steps).toBe(ranked[1]!.steps); // same distance
    expect(ranked.map((e) => e.combatant.id)).toEqual(['ne', 'se']); // lower dir first
  });

  it('is footprint-aware: a Large (2×2) target is reached from its nearest cell', () => {
    const big = { id: 'D', pos: { col: 8, row: 5 }, size: 2 }; // fills (8,5)..(9,6)
    const [entry] = sortedCombatants(actor, [big]);
    expect(entry!.steps).toBe(steppingPathDistance({ col: 5, row: 5 }, { col: 8, row: 5 })); // nearest cell (8,5)
    expect(entry!.targetCell).toEqual({ col: 8, row: 5 });
  });
});

// ── #46 terrain-HEIGHT occlusion (ovr032 §1b) ─────────────────────────────────────────────────────

describe('canReachWithHeight — wall-height occlusion (#46)', () => {
  it('a wall TALLER than the eye-ray blocks; the range stops at the wall', () => {
    const terrain = { height: (c: number, _r: number) => (c === 2 ? 3 : 0) };
    const res = canReachWithHeight({ col: 0, row: 0 }, { col: 4, row: 0 }, terrain, 1);
    expect(res.reachable).toBe(false);
    expect(res.stoppedAt).toEqual({ col: 2, row: 0 });
    expect(res.range).toBe(4); // 2 orthogonal hops to the wall cell
  });

  it('a LOW obstacle the ray clears does NOT block (the key delta vs a binary blocker)', () => {
    const terrain = { height: (c: number, _r: number) => (c === 2 ? 1 : 0) }; // height 1, eye 1 → 1 > 1 false
    const res = canReachWithHeight({ col: 0, row: 0 }, { col: 4, row: 0 }, terrain, 1);
    expect(res.reachable).toBe(true);
    expect(res.range).toBe(8); // full 4-cell orthogonal range
  });

  it('ignoreWalls bypasses the height test entirely', () => {
    const terrain = { height: () => 99 };
    expect(canReachWithHeight({ col: 0, row: 0 }, { col: 3, row: 0 }, terrain, 0, true).reachable).toBe(true);
  });

  it('steppingPathCells lists the crossed cells exclusive of the endpoints', () => {
    expect(steppingPathCells({ col: 0, row: 0 }, { col: 3, row: 0 })).toEqual([
      { col: 1, row: 0 }, { col: 2, row: 0 },
    ]);
    expect(steppingPathCells({ col: 0, row: 0 }, { col: 1, row: 0 })).toEqual([]); // adjacent → nothing between
  });
});

// ── #46 AI deltas: random target, save-aware spell, Int>5 morale (ovr010) ─────────────────────────

describe('AI random target selection — ovr010 (not focus-fire) (#46)', () => {
  // One enemy, three reachable party foes of differing HP. Default policy is 'random'.
  const make = (seed: number, over: Parameters<typeof createTacticalCombat>[2] = {}) =>
    createTacticalCombat(
      [
        fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20 }),
        fighter('p1', 'party', 4, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 }),
        fighter('p2', 'party', 6, 5, { hp: 5, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 }),
        fighter('p3', 'party', 5, 4, { hp: 12, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1 }),
      ],
      openField(11, 11),
      { seed, ...over },
    );

  it('picks a RANDOM reachable foe, deterministic on the seed', () => {
    const a1 = make(7).aiAction();
    const a2 = make(7).aiAction();
    expect(a1.type).toBe('melee');
    expect(a1.targetId).toBe(a2.targetId); // same seed → same pick
    expect(['p1', 'p2', 'p3']).toContain(a1.targetId);
  });

  it('does NOT always focus the weakest — different seeds reach different targets', () => {
    const picks = new Set<string | undefined>();
    for (let s = 1; s <= 40; s++) picks.add(make(s).aiAction().targetId);
    expect(picks.size).toBeGreaterThan(1); // a focus-fire AI would only ever pick p2
  });

  it("the opt-in 'focus' policy still concentrates on the weakest", () => {
    const a = make(7, { aiTargeting: 'focus' }).aiAction();
    expect(a.targetId).toBe('p2'); // lowest HP
  });

  it('a single reachable foe is chosen without consuming RNG (deterministic regardless of seed)', () => {
    const oneFoe = (seed: number) => createTacticalCombat(
      [fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20 }), fighter('p', 'party', 6, 5, { move: 0, attacksPerRound: 0, weapons: [], initiative: 1 })],
      openField(11, 11), { seed },
    ).aiAction();
    expect(oneFoe(1).targetId).toBe('p');
    expect(oneFoe(999).targetId).toBe('p');
  });
});

describe('AI save-aware spell choice — ovr010 sub_3560B (#46)', () => {
  const hold: TacticalSpell = { id: 'hold', name: 'Hold Person', target: 'enemy', range: 8, area: 'single', save: 'negate', inflict: { status: 'held', rounds: 6 }, priority: 5, usesLeft: 3 };
  const mm: TacticalSpell = { id: 'mm', name: 'Magic Missile', target: 'enemy', range: 8, area: 'single', save: 'none', damage: { count: 1, sides: 1, bonus: 0 }, priority: 1, usesLeft: 3 };

  it('skips a save-or-negate spell when the only target would make its save', () => {
    const e = fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20, preparedSpells: [{ ...hold }] });
    const p = fighter('p', 'party', 6, 5, { move: 0, attacksPerRound: 0, weapons: [], initiative: 1, save: 1 }); // always saves
    const c = createTacticalCombat([e, p], openField(11, 11), { seed: 3 });
    const a = c.aiAction();
    expect(a.type).not.toBe('cast'); // Hold wasted on an easy saver → falls through to melee
    expect(a.type).toBe('melee');
  });

  it('casts the save spell at a target that would FAIL its save', () => {
    const e = fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20, preparedSpells: [{ ...hold }] });
    const p = fighter('p', 'party', 6, 5, { move: 0, attacksPerRound: 0, weapons: [], initiative: 1, save: 21 }); // never saves
    const c = createTacticalCombat([e, p], openField(11, 11), { seed: 3 });
    const a = c.aiAction();
    expect(a.type).toBe('cast');
    expect(a.spellId).toBe('hold');
  });

  it('prefers the higher-priority spell, but falls through to a lower-priority no-save spell when the first is wasted', () => {
    // vs a never-saver → high-priority Hold wins.
    const eVuln = fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20, preparedSpells: [{ ...mm }, { ...hold }] });
    const vuln = fighter('p', 'party', 6, 5, { move: 0, attacksPerRound: 0, weapons: [], initiative: 1, save: 21 });
    expect(createTacticalCombat([eVuln, vuln], openField(11, 11), { seed: 3 }).aiAction().spellId).toBe('hold');
    // vs an always-saver → Hold is skipped, the no-save Magic Missile is cast instead.
    const eSafe = fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20, preparedSpells: [{ ...mm }, { ...hold }] });
    const safe = fighter('p', 'party', 6, 5, { move: 0, attacksPerRound: 0, weapons: [], initiative: 1, save: 1 });
    expect(createTacticalCombat([eSafe, safe], openField(11, 11), { seed: 3 }).aiAction().spellId).toBe('mm');
  });
});

describe('morale Int>5 surrender vs rout — ovr010 FleeCheck_001 (#46)', () => {
  const club = (bonus: number): Weapon => ({ name: 'club', kind: 'melee', damage: { count: 1, sides: 1, bonus }, reach: 1 });
  const hero = (col: number, bonus: number): TacticalCombatant =>
    fighter('p', 'party', col, 5, { thac0: 1, move: 0, initiative: 20, weapons: [club(bonus)] });

  it('a SMART broken monster (Int>5) surrenders', () => {
    const p = hero(5, 15); // 16 dmg
    const e = fighter('e', 'enemy', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, morale: 30, int: 12 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e' }); // 20 → 4 HP = 80% lost > morale 30 → break
    expect(e.flags.has('surrendered')).toBe(true);
    expect(e.flags.has('feared')).toBe(false);
  });

  it('a DUMB broken monster (Int≤5) routs (flees), it does not surrender', () => {
    const p = hero(5, 15);
    const e = fighter('e', 'enemy', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, morale: 30, int: 3 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e' });
    expect(e.flags.has('feared')).toBe(true);
    expect(e.flags.has('surrendered')).toBe(false);
  });

  it('a steady smart monster (morale holds) neither surrenders nor flees', () => {
    const p = hero(5, 15); // 80% lost
    const e = fighter('e', 'enemy', 6, 5, { hp: 20, maxHp: 20, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, morale: 90, int: 12 });
    const c = createTacticalCombat([p, e], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e' });
    expect(e.flags.has('surrendered')).toBe(false);
    expect(e.flags.has('feared')).toBe(false);
  });
});

// M81.S1 — the Int>5 branch above was only ever proven against a hand-built TacticalCombatant literal.
// This proves the real production wiring: a decoded MonsterRecord's abilities.int now survives
// monsterCombatant() (the function every real encounter's spawnEnemies() calls) into Combatant.int,
// which the tactical layer's spread (apps/web's makeTC()) carries through unchanged.
describe('monsterCombatant() wires a MonsterRecord\'s real Int into the tactical morale branch (M81.S1)', () => {
  const abilities = (int: number): MonsterAbilities => ({ str: 10, int, wis: 10, dex: 10, con: 10, cha: 10 });
  const spawnMonster = (int: number): TacticalCombatant => {
    const c = monsterCombatant(
      { name: 'e', hitPoints: 20, thac0: 15, armorClass: 5, damage: { count: 1, sides: 8, bonus: 0 }, xp: 10, morale: 30, abilities: abilities(int) },
      'e',
    );
    return { ...c, pos: { col: 6, row: 5 }, facing: 4, move: 0, attacksPerRound: 0, weapons: [], initiative: 1, flags: new Set() };
  };
  const attacker = (): TacticalCombatant =>
    fighter('p', 'party', 5, 5, { thac0: 1, initiative: 20, weapons: [{ name: 'club', kind: 'melee', damage: { count: 1, sides: 1, bonus: 15 }, reach: 1 }] });

  it('a real MonsterRecord with Int>5, spawned via monsterCombatant(), surrenders on a morale break', () => {
    const e = spawnMonster(12);
    expect(e.int).toBe(12); // the field actually survived the conversion
    const c = createTacticalCombat([attacker(), e], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e' });
    expect(e.flags.has('surrendered')).toBe(true);
    expect(e.flags.has('feared')).toBe(false);
  });

  it('a real MonsterRecord with Int<=5, spawned via monsterCombatant(), routs on a morale break', () => {
    const e = spawnMonster(3);
    expect(e.int).toBe(3);
    const c = createTacticalCombat([attacker(), e], openField(11, 11), { seed: 3 });
    c.apply({ type: 'melee', targetId: 'e' });
    expect(e.flags.has('feared')).toBe(true);
    expect(e.flags.has('surrendered')).toBe(false);
  });
});

// M84.S1 — the priority-ordering branch above (line 277) was only ever proven against hand-built
// TacticalSpell literals with an explicit `priority`. This proves the real production wiring: a real
// DoK monster's memorized spells (FLAVIUS, MON1CHA block id 50, per docs/engine/research/m31-audit.md)
// crosswalk via preparedSpellsFromDokIds() — the same real function makeTC() calls — to two real
// TacticalSpells that now carry real, COAB-decompiled AI priorities (tacticalSpellFor()'s PRIORITY
// table), and chooseOffensiveCast() now correctly prefers the higher-priority Lightning Bolt (6) over
// FLAVIUS's earlier-memorized but lower-priority Stinking Cloud (5).
describe('tacticalSpellFor() wires a real COAB AI priority into chooseOffensiveCast (M84.S1)', () => {
  it("FLAVIUS's real crosswalked spellbook (raw ids [34 stinking-cloud, 51 lightning-bolt]) casts the higher-priority Lightning Bolt, not raw memorization order", () => {
    const spells = preparedSpellsFromDokIds([34, 51], 10)!;
    expect(spells.find((s) => s.id === 'm2-stinking-cloud')?.priority).toBe(5);
    expect(spells.find((s) => s.id === 'm3-lightning-bolt')?.priority).toBe(6);
    const e = fighter('e', 'enemy', 5, 5, { move: 0, initiative: 20, preparedSpells: spells });
    const p = fighter('p', 'party', 10, 5, { move: 0, attacksPerRound: 0, weapons: [], initiative: 1, save: 15 });
    const c = createTacticalCombat([e, p], openField(11, 11), { seed: 3 });
    expect(c.aiAction().spellId).toBe('m3-lightning-bolt');
  });
});
