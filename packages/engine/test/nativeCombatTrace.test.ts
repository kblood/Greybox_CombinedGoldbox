import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createTacticalCombat,
  type Facing,
  type TacticalCombatant,
  type TacticalEvent,
  type TerrainGrid,
} from '../src/index.js';

const TRACE_ENV = 'GOLDBOX_NATIVE_CCCOMBAT_TRACE';
const openField = (width: number, height: number): TerrainGrid => ({ width, height });

const expectedFixtureTrace = [
  '1 init p0 - - - - - - -',
  '1 init p1 - - - - - - -',
  '1 init e0 - - - - - - -',
  '1 init e1 - - - - - - -',
  '1 init e2 - - - - - - -',
  '1 attack e1 p1 19 12 1 6 6 -',
  '1 attack p0 e1 5 8 0 - 5 -',
  '1 attack e0 p1 8 12 0 - 6 -',
  '1 attack e2 p0 7 13 0 - 14 -',
  '1 attack p1 e1 18 9 1 5 0 -',
  '1 slain p1 e1 - - - - 0 0',
  '2 attack p0 e0 16 8 1 4 3 -',
  '2 attack e0 p1 2 12 0 - 6 -',
  '2 attack e2 p0 13 13 1 5 9 -',
  '2 attack p1 e0 19 9 1 4 0 -',
  '2 slain p1 e0 - - - - 0 0',
  '3 attack p0 e2 13 7 1 9 0 -',
  '3 slain p0 e2 - - - - 0 0',
  '3 end - party - - - - - -',
];

function combatant(over: {
  id: string;
  side: 'party' | 'enemy';
  hp: number;
  thac0: number;
  ac: number;
  damage: { count: number; sides: number; bonus: number };
  xp: number;
  col: number;
  row: number;
  facing: Facing;
}): TacticalCombatant {
  return {
    id: over.id,
    name: over.id,
    side: over.side,
    hp: over.hp,
    maxHp: over.hp,
    thac0: over.thac0,
    ac: over.ac,
    damage: over.damage,
    xp: over.xp,
    pos: { col: over.col, row: over.row },
    facing: over.facing,
    move: 4,
    attacksPerRound: 1,
    weapons: [{ name: 'melee', kind: 'melee', damage: over.damage, reach: 1 }],
    flags: new Set(),
  };
}

function nativeFixtureCombatants(): TacticalCombatant[] {
  return [
    combatant({ id: 'p0', side: 'party', hp: 14, thac0: 15, ac: 5, damage: { count: 1, sides: 8, bonus: 1 }, xp: 0, col: 4, row: 5, facing: 0 }),
    combatant({ id: 'p1', side: 'party', hp: 12, thac0: 16, ac: 6, damage: { count: 1, sides: 6, bonus: 2 }, xp: 0, col: 4, row: 6, facing: 0 }),
    combatant({ id: 'e0', side: 'enemy', hp: 7, thac0: 18, ac: 7, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15, col: 5, row: 5, facing: 4 }),
    combatant({ id: 'e1', side: 'enemy', hp: 5, thac0: 18, ac: 7, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15, col: 5, row: 6, facing: 4 }),
    combatant({ id: 'e2', side: 'enemy', hp: 9, thac0: 18, ac: 8, damage: { count: 1, sides: 4, bonus: 1 }, xp: 20, col: 5, row: 4, facing: 4 }),
  ];
}

function traceValue(value: number | string | boolean | undefined): string {
  if (value === undefined) return '-';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

function formatTraceEvent(ev: TacticalEvent): string {
  const actor = ev.actor ?? '-';
  const target = ev.target ?? '-';
  switch (ev.type) {
    case 'attack':
      return [
        ev.round,
        'attack',
        actor,
        target,
        traceValue(ev.roll),
        traceValue(ev.needed),
        traceValue(ev.hit),
        ev.hit ? traceValue(ev.damage) : '-',
        traceValue(ev.targetHpAfter),
        '-',
      ].join(' ');
    case 'slain':
      return `${ev.round} slain ${actor} ${target} - - - - 0 ${ev.dead ? 1 : 0}`;
    case 'move': {
      const last = ev.path?.at(-1);
      return `${ev.round} move ${actor} - - - - - - - ${traceValue(last?.col)} ${traceValue(last?.row)}`;
    }
    case 'end':
      return `${ev.round} end - ${ev.outcome ?? 'draw'} - - - - - -`;
    default:
      throw new Error(`Unexpected fixture event: ${ev.type}`);
  }
}

function tsOracleTrace(combatants = nativeFixtureCombatants()): string[] {
  const combat = createTacticalCombat(combatants, openField(10, 10), {
    seed: 4660,
    aiTargeting: 'focus',
  });

  let guard = 0;
  while (!combat.isOver()) {
    const actor = combat.current()?.id;
    const action = combat.aiAction();
    combat.apply(action);
    // CCCOMBAT.COM spends the actor's turn after a strike; the richer TS engine permits
    // post-attack movement, so the oracle driver applies the native trace contract here.
    if ((action.type === 'melee' || action.type === 'missile' || action.type === 'cast') && !combat.isOver() && combat.current()?.id === actor) {
      combat.apply({ type: 'endTurn' });
    }
    if (++guard > 200) throw new Error('Native fixture oracle did not terminate');
  }

  return [
    ...combatants.map(({ id }) => `1 init ${id} - - - - - - -`),
    // CCCOMBAT's Tier-1 trace predates the richer TS status/hazard/regen bookkeeping. Compare the
    // shared Tier-1 vocabulary only; dedicated native fixtures cover those later event families.
    ...combat.log
      .filter((event) => event.type === 'attack' || event.type === 'slain' || event.type === 'move' || event.type === 'end')
      .map(formatTraceEvent),
  ];
}

function readNativeTrace(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe('native CCCOMBAT trace oracle', () => {
  it('matches the TypeScript oracle for the Tier-1 fixture', () => {
    const oracle = tsOracleTrace();
    expect(oracle).toEqual(expectedFixtureTrace);

    const nativeTracePath = process.env[TRACE_ENV];
    if (nativeTracePath) {
      expect(existsSync(nativeTracePath), `${TRACE_ENV} path exists`).toBe(true);
      expect(readNativeTrace(nativeTracePath)).toEqual(oracle);
    }
  });

  // These raw-BIN handoffs have no D0xx provenance tag, so they use one
  // primary strike. The tagged native fixtures separately test retail rates.
  // Stats are decoded from MONCHA.GLB's id-table members 10/12 and 55/64:
  // HD 16/10 and 9/18, HP=(9*HD+1)>>1; THAC0/AC and dice at A+15/67/61/63.
  for (const [name, finalRound, stats] of [
    ['DQKST', 3, [[72, 7, 5, 1, 12], [45, 12, 2, 3, 4]]],
    ['DQKNPC', 7, [[41, 14, 7, 1, 2], [81, 6, 6, 1, 6]]],
  ] as const) {
    it(`derives the untagged ${name} attack sequence independently`, () => {
      const party = nativeFixtureCombatants().slice(0, 2);
      const enemies = stats.map(([hp, thac0, ac, count, sides], i) => combatant({
        id: `e${i}`, side: 'enemy', hp, thac0, ac,
        damage: { count, sides, bonus: 0 }, xp: 0, col: 5, row: 4 + i, facing: 4,
      }));
      const oracle = tsOracleTrace([...party, ...enemies]);
      expect(oracle.at(-1)).toBe(`${finalRound} end - enemy - - - - - -`);
      const nativeTracePath = process.env[TRACE_ENV];
      if (nativeTracePath) {
        // Native emits every entered route cell and may choose a different
        // adjacent anchor; PowerShell pins that exact route separately.
        const actions = (trace: string[]) => trace.filter((line) => !line.includes(' move '));
        const path = join(dirname(nativeTracePath), `${name}.TRC`);
        expect(existsSync(path), `${name} trace exists`).toBe(true);
        expect(actions(readNativeTrace(path))).toEqual(actions(oracle));
      }
    });
  }
});
