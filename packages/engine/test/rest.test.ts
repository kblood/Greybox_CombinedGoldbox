import { describe, it, expect } from 'vitest';
import {
  timeFromMinutes,
  gameDayFromMinutes,
  formatTimeOfDay,
  formatGameTime,
  formatDuration,
  MINUTES_PER_DAY,
  daysToHealParty,
  planRest,
  NATURAL_HEAL_HP_PER_DAY,
} from '../src/index.js';

describe('game clock', () => {
  it('decomposes minutes into day/hour/minute', () => {
    expect(timeFromMinutes(0)).toEqual({ day: 0, hour: 0, minute: 0 });
    expect(timeFromMinutes(6 * 60)).toEqual({ day: 0, hour: 6, minute: 0 });
    // 2 days, 14:30
    expect(timeFromMinutes(2 * MINUTES_PER_DAY + 14 * 60 + 30)).toEqual({ day: 2, hour: 14, minute: 30 });
  });

  it('clamps negatives to the epoch', () => {
    expect(timeFromMinutes(-100)).toEqual({ day: 0, hour: 0, minute: 0 });
    expect(gameDayFromMinutes(-5)).toBe(0);
  });

  it('keys the whole-day count the moons phase off', () => {
    expect(gameDayFromMinutes(6 * 60)).toBe(0); // morning of day 0
    expect(gameDayFromMinutes(MINUTES_PER_DAY)).toBe(1);
    expect(gameDayFromMinutes(3 * MINUTES_PER_DAY + 60)).toBe(3);
  });

  it('formats time of day and 1-based game time', () => {
    expect(formatTimeOfDay(6 * 60)).toBe('06:00');
    expect(formatTimeOfDay(2 * MINUTES_PER_DAY + 14 * 60 + 5)).toBe('14:05');
    expect(formatGameTime(0)).toBe('Day 1 00:00'); // day index 0 shows as Day 1
    expect(formatGameTime(2 * MINUTES_PER_DAY + 6 * 60)).toBe('Day 3 06:00');
  });

  it('formats elapsed durations', () => {
    expect(formatDuration(0)).toBe('no time');
    expect(formatDuration(MINUTES_PER_DAY)).toBe('1 day');
    expect(formatDuration(3 * MINUTES_PER_DAY)).toBe('3 days');
    expect(formatDuration(8 * 60)).toBe('8 hours');
    expect(formatDuration(2 * MINUTES_PER_DAY + 6 * 60)).toBe('2 days 6 hours');
    expect(formatDuration(45)).toBe('45 minutes');
  });
});

describe('natural healing / rest', () => {
  it('costs one day per HP for the most-wounded living member', () => {
    const party = [
      { hp: 44, maxHp: 44 }, // full
      { hp: 30, maxHp: 46 }, // 16 missing
      { hp: 28, maxHp: 30 }, // 2 missing
    ];
    expect(daysToHealParty(party)).toBe(16);
  });

  it('plans a heal-to-full rest and reports days/minutes/HP', () => {
    const party = [
      { hp: 40, maxHp: 44 }, // 4 missing
      { hp: 30, maxHp: 46 }, // 16 missing -> drives the duration
    ];
    const out = planRest(party);
    expect(out.days).toBe(16);
    expect(out.minutes).toBe(16 * MINUTES_PER_DAY);
    expect(out.results[0].after).toBe(44); // capped at max, fully healed long before day 16
    expect(out.results[1].after).toBe(46);
    expect(out.totalHealed).toBe(4 + 16);
  });

  it('honours a fixed number of days and caps at max HP', () => {
    const party = [{ hp: 10, maxHp: 44 }];
    const out = planRest(party, { days: 3, hpPerDay: NATURAL_HEAL_HP_PER_DAY });
    expect(out.days).toBe(3);
    expect(out.results[0].after).toBe(13); // 10 + 3*1
    expect(out.totalHealed).toBe(3);
  });

  it('does not heal the dead and rests 0 days for a full party', () => {
    const party = [
      { hp: 0, maxHp: 30 }, // dead
      { hp: 44, maxHp: 44 }, // full
    ];
    expect(daysToHealParty(party)).toBe(0);
    const out = planRest(party);
    expect(out.days).toBe(0);
    expect(out.results[0].after).toBe(0); // still down
    expect(out.totalHealed).toBe(0);
  });
});
