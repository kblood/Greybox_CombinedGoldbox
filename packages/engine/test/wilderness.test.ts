/**
 * Wilderness / overland travel (A5.1) — terrain costs, blocking, time passage, encounter checks, and
 * deterministic journeys, plus the ASCII map authoring helper.
 */
import { describe, it, expect } from 'vitest';
import {
  Rng,
  TERRAIN,
  checkEncounter,
  WildernessTravel,
  wildernessFromAscii,
  type WildernessMap,
} from '../src/index.js';

// A small region: a road running east past a town, plains around it, a river (water) walling the
// south edge, and mountains in the north-east corner.
//   = = = T .
//   . . f . .
//   ~ ~ ~ ~ ~
const MAP: WildernessMap = wildernessFromAscii(
  'Test Vale',
  ['===T.', '..f..', '~~~~~'],
  { start: { x: 0, y: 0 }, locations: [{ x: 3, y: 0, name: 'Riverside' }] },
);

describe('wildernessFromAscii', () => {
  it('builds a grid with the right dimensions, terrain, and named site', () => {
    expect(MAP.width).toBe(5);
    expect(MAP.height).toBe(3);
    expect(MAP.tiles[0]!.terrain).toBe('road');
    expect(MAP.tiles[4]!.terrain).toBe('plains');
    expect(MAP.tiles[2 * 5 + 0]!.terrain).toBe('water');
    expect(MAP.tiles[1 * 5 + 2]!.terrain).toBe('forest');
    // The Riverside site sits on the town tile at (3,0).
    expect(MAP.tiles[3]!.terrain).toBe('town');
    expect(MAP.tiles[3]!.location).toBe('Riverside');
  });

  it('throws on a ragged grid', () => {
    expect(() => wildernessFromAscii('Bad', ['===', '=='])).toThrow();
  });
});

describe('checkEncounter', () => {
  it('never fires at 0% and always fires at 100%', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 50; i++) {
      expect(checkEncounter(0, rng)).toBe(false);
      expect(checkEncounter(100, rng)).toBe(true);
    }
  });
});

describe('WildernessTravel', () => {
  it('moves across passable terrain and accrues that terrain’s travel minutes', () => {
    const t = new WildernessTravel(MAP, 0x10);
    const s = t.step('east'); // (0,0) road → (1,0) road
    expect(s.moved).toBe(true);
    expect(s.pos).toEqual({ x: 1, y: 0 });
    expect(s.terrain).toBe('road');
    expect(s.minutes).toBe(TERRAIN.road.minutes);
  });

  it('blocks at the map edge with no time passing', () => {
    const t = new WildernessTravel(MAP, 0x10);
    const s = t.step('north'); // (0,0) → off the top edge
    expect(s.moved).toBe(false);
    expect(s.blocked).toBe('edge');
    expect(s.minutes).toBe(0);
    expect(s.encounter).toBe(false);
    expect(t.pos).toEqual({ x: 0, y: 0 });
  });

  it('blocks on impassable water with no time passing', () => {
    const t = new WildernessTravel(MAP, 0x10);
    t.step('south'); // (0,0) → (0,1) plains
    const s = t.step('south'); // (0,1) → (0,2) water (impassable)
    expect(s.moved).toBe(false);
    expect(s.blocked).toBe('impassable');
    expect(s.terrain).toBe('water');
    expect(t.pos).toEqual({ x: 0, y: 1 });
  });

  it('announces arrival when stepping onto a named site', () => {
    const t = new WildernessTravel(MAP, 0x10);
    t.step('east'); // →(1,0)
    t.step('east'); // →(2,0)
    const s = t.step('east'); // →(3,0) = Riverside (town)
    expect(s.moved).toBe(true);
    expect(s.terrain).toBe('town');
    expect(s.arrived).toBe('Riverside');
  });

  it('accumulates elapsed time over a multi-step journey', () => {
    const t = new WildernessTravel(MAP, 0x10);
    let minutes = 0;
    for (const dir of ['east', 'east', 'south'] as const) minutes += t.step(dir).minutes;
    // road + road + forest (the (2,1) tile is 'f')
    expect(minutes).toBe(TERRAIN.road.minutes * 2 + TERRAIN.forest.minutes);
  });

  it('replays an identical journey for the same seed (and town tiles never spawn encounters)', () => {
    const path = ['east', 'east', 'east', 'south', 'west'] as const;
    const run = (seed: number) => {
      const t = new WildernessTravel(MAP, seed);
      return path.map((d) => {
        const s = t.step(d);
        return { moved: s.moved, terrain: s.terrain, encounter: s.encounter };
      });
    };
    expect(run(0xabcd)).toEqual(run(0xabcd)); // determinism
    // The town step (3rd, onto Riverside) is a safe haven — encounterPct 0 → never an encounter.
    expect(run(0xabcd)[2]!.encounter).toBe(false);
  });

  it('can produce an encounter on dangerous terrain for some seed', () => {
    // Forest is 18% — sweep seeds until the move onto (2,1) forest triggers a wandering monster.
    let everEncountered = false;
    for (let seed = 1; seed <= 60 && !everEncountered; seed++) {
      const t = new WildernessTravel(MAP, seed);
      t.step('east');
      t.step('east');
      if (t.step('south').encounter) everEncountered = true; // onto forest (2,1)
    }
    expect(everEncountered).toBe(true);
  });
});
