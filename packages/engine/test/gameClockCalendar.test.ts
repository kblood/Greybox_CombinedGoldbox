/**
 * 7-slot mixed-radix calendar + affect/rest/learn timers (ovr021).
 *
 * Covers the additions layered over the flat `totalMinutes` model: NormalizeClock carry,
 * step_game_time slot semantics (normal +1 min / careful +10 min), year-rollover party
 * aging, affect time-out expiry, natural rest healing (+1 HP / 288 ticks), and the
 * level×3 spell-learn timer.
 */
import { describe, it, expect } from 'vitest';
import {
  TIME_SCALES,
  SLOT_MINUTE,
  SLOT_TEN_MINUTE,
  SLOT_DAY,
  SLOT_YEAR,
  newClock,
  normalizeClock,
  stepGameTime,
  minutesForStep,
  calendarFromClock,
  clockFromMinutes,
  minutesFromClock,
  applyAging,
  tickAffects,
  advanceRestHealing,
  learnTicksForLevel,
  newSpellLearnState,
  advanceSpellLearning,
  REST_TICKS_PER_HEAL,
  type ClockSlots,
} from '../src/index.js';

describe('7-slot mixed-radix calendar', () => {
  it('has the canonical radices {10,10,6,24,30,12,256}', () => {
    expect([...TIME_SCALES]).toEqual([10, 10, 6, 24, 30, 12, 0x100]);
  });

  it('NormalizeClock carries through the whole chain', () => {
    // 65 minutes (slot 1) -> 1 hour 5 minutes: minute=5, tenMinute=0, hour=1.
    const { clock } = normalizeClock([0, 65, 0, 0, 0, 0, 0]);
    const c = calendarFromClock(clock);
    expect({ minute: c.minute, tenMinute: c.tenMinute, hour: c.hour }).toEqual({
      minute: 5,
      tenMinute: 0,
      hour: 1,
    });
    // 5 = 5*1 ; 60 min carried -> 1 hour. flat round-trips.
    expect(minutesFromClock(clock)).toBe(65);
  });

  it('carries days into months and months into years', () => {
    // 30 days -> 1 month ; 12 months -> 1 year.
    const oneMonth = normalizeClock([0, 0, 0, 0, 30, 0, 0]).clock;
    expect(calendarFromClock(oneMonth)).toMatchObject({ day: 0, month: 1, year: 0 });
    const oneYear = normalizeClock([0, 0, 0, 0, 0, 12, 0]).clock;
    expect(calendarFromClock(oneYear)).toMatchObject({ month: 0, year: 1 });
  });

  it('round-trips flat minutes <-> calendar', () => {
    const minutes = 5 * 360 * 24 * 60 + 7 * 30 * 24 * 60 + 3 * 24 * 60 + 14 * 60 + 25; // 5y 7mo 3d 14:25
    const clock = clockFromMinutes(minutes);
    expect(minutesFromClock(clock)).toBe(minutes);
    const c = calendarFromClock(clock);
    expect(c).toMatchObject({ year: 5, month: 7, day: 3, hour: 14, minute: 5, tenMinute: 2 });
  });
});

describe('step_game_time slot semantics (ovr015/ovr021)', () => {
  it('a normal step adds +1 minute (slot 1)', () => {
    const r = stepGameTime(newClock(), SLOT_MINUTE, 1);
    expect(r.elapsedMinutes).toBe(1);
    expect(calendarFromClock(r.clock).minute).toBe(1);
    expect(r.yearRollovers).toBe(0);
  });

  it('a careful/search step adds +10 minutes (slot 2)', () => {
    const r = stepGameTime(newClock(), SLOT_TEN_MINUTE, 1);
    expect(r.elapsedMinutes).toBe(10);
    // 10 minutes = one 10-minute unit
    expect(calendarFromClock(r.clock)).toMatchObject({ minute: 0, tenMinute: 1 });
  });

  it('minutesForStep matches the slot weights', () => {
    expect(minutesForStep(SLOT_MINUTE, 1)).toBe(1);
    expect(minutesForStep(SLOT_TEN_MINUTE, 1)).toBe(10);
    expect(minutesForStep(SLOT_DAY, 1)).toBe(24 * 60);
  });
});

describe('year-rollover ages the party', () => {
  it('reports yearRollovers when slot 6 overflows 256', () => {
    // Seed year at 255 and add one more year -> 1 rollover, year resets to 0.
    const clock: ClockSlots = [0, 0, 0, 0, 0, 0, 255];
    const r = stepGameTime(clock, SLOT_YEAR, 1);
    expect(r.yearRollovers).toBe(1);
    expect(calendarFromClock(r.clock).year).toBe(0);
  });

  it('applyAging bumps every member age by the rollover count, purely', () => {
    const party = [{ age: 21 }, { age: 40 }];
    const aged = applyAging(party, 2);
    expect(aged.map((m) => m.age)).toEqual([23, 42]);
    expect(party.map((m) => m.age)).toEqual([21, 40]); // input untouched
    expect(applyAging(party, 0)).not.toBe(party); // still a copy
  });
});

describe('affect time-out (CheckAffectsTimingOut)', () => {
  it('decrements timed affects and removes expired ones; keeps permanents', () => {
    const affects = [
      { minutes: 0, name: 'permanent' }, // never expires
      { minutes: 15, name: 'short' },
      { minutes: 60, name: 'long' },
    ];
    const r = tickAffects(affects, 20); // 20 minutes pass
    expect(r.expired.map((a) => a.name)).toEqual(['short']);
    const survivors = Object.fromEntries(r.survivors.map((a) => [a.name, a.minutes]));
    expect(survivors).toEqual({ permanent: 0, long: 40 });
  });

  it('elapsed exactly equal to remaining expires the affect', () => {
    const r = tickAffects([{ minutes: 10 }], 10);
    expect(r.survivors).toHaveLength(0);
    expect(r.expired).toHaveLength(1);
  });
});

describe('natural rest healing (+1 HP / 288 ticks)', () => {
  it('heals once per 288 rest ticks, skipping the permadead, capping at maxHp', () => {
    const party = [
      { hp: 10, maxHp: 44 },
      { hp: 0, maxHp: 30, dead: true }, // permanently slain (CT.7h) — never heals
      { hp: 30, maxHp: 30 }, // already full
    ];
    const r = advanceRestHealing(party, REST_TICKS_PER_HEAL * 3);
    expect(r.heals).toBe(3);
    expect(r.party.map((m) => m.hp)).toEqual([13, 0, 30]);
    expect(r.carry).toBe(0);
  });

  it('M89.S1 — a merely-unconscious member (0 HP, not dead) heals on rest too', () => {
    const party = [{ hp: 0, maxHp: 30 }]; // down but not dead: no `dead` field set
    const r = advanceRestHealing(party, REST_TICKS_PER_HEAL * 3);
    expect(r.heals).toBe(3);
    expect(r.party[0].hp).toBe(3);
  });

  it('carries leftover ticks across calls', () => {
    const party = [{ hp: 10, maxHp: 44 }];
    const a = advanceRestHealing(party, 200); // < 288, no heal yet
    expect(a.heals).toBe(0);
    expect(a.party[0].hp).toBe(10);
    const b = advanceRestHealing(a.party, 100, a.carry); // 200+100=300 -> one heal
    expect(b.heals).toBe(1);
    expect(b.party[0].hp).toBe(11);
    expect(b.carry).toBe(300 - REST_TICKS_PER_HEAL);
  });
});

describe('rest-time spell learning (level × 3 ticks)', () => {
  it('learnTicksForLevel = level*3 (and *2 deferred)', () => {
    expect(learnTicksForLevel(3)).toBe(9);
    expect(learnTicksForLevel(3, true)).toBe(6);
  });

  it('commits each queued spell after level×3 rest ticks', () => {
    const queue = [1, 2]; // a level-1 then a level-2 spell
    let state = newSpellLearnState();
    // After 3 ticks the level-1 spell (cost 3) is learnt; nothing else yet.
    let r = advanceSpellLearning(state, queue, 3);
    expect(r.learned).toEqual([0]);
    state = r.state;
    // The level-2 spell needs 6 ticks; 5 isn't enough...
    r = advanceSpellLearning(state, queue, 5);
    expect(r.learned).toEqual([]);
    state = r.state;
    // ...one more tick (6 total) commits it.
    r = advanceSpellLearning(state, queue, 1);
    expect(r.learned).toEqual([1]);
    expect(r.state.index).toBe(2); // queue exhausted
  });

  it('can commit several spells in one long rest', () => {
    const queue = [1, 1, 2]; // 3 + 3 + 6 = 12 ticks total
    const r = advanceSpellLearning(newSpellLearnState(), queue, 12);
    expect(r.learned).toEqual([0, 1, 2]);
  });
});
