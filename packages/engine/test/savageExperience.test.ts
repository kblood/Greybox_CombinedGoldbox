import { describe, expect, it } from 'vitest';
import {
  SAVAGE_XP_PER_ITEM_PLUS,
  calcGatewayBattleExp,
  calcTreasuresBattleExp,
} from '../src/index.js';

describe('Savage Frontier battle XP', () => {
  it('reproduces Gateway monster, raw treasure, item-plus, and living-party terms', () => {
    const award = calcGatewayBattleExp(
      [
        { flatXp: 30, rolledHp: 8, perHpXp: 5 },
        { flatXp: 70, rolledHp: 10, perHpXp: 3 },
      ],
      {
        bucket822c: 400,
        bucket8230: 40,
        bucket8234: 4,
        bucket8238: 3,
        bucket823c: 2,
        bucket8240: 1,
        bucket8244: 1,
        itemPluses: [0, -1, 1, 2],
      },
      6,
    );
    const monsters = (30 + 8 * 5) + (70 + 10 * 3);
    const treasure = 2 + 2 + 2 + 3 + 10 + 250 + 2200;
    expect(SAVAGE_XP_PER_ITEM_PLUS).toBe(400);
    expect(award).toEqual({
      total: monsters + treasure + 3 * 400,
      livingPartyCount: 6,
      perMember: Math.floor((monsters + treasure + 3 * 400) / 6),
    });
  });

  it('reproduces Treasures flat monster and division terms without Gateway HP scaling', () => {
    expect(calcTreasuresBattleExp(
      [{ flatXp: 101 }, { flatXp: 205 }],
      { bucket9e02: 5, bucket9e06: 501, bucket9e0a: 4401, itemPluses: [2] },
      4,
    )).toEqual({
      total: 306 + 2 + 2 + 2 + 800,
      livingPartyCount: 4,
      perMember: 278,
    });
  });

  it('rejects impossible raw values and a zero living-party divisor', () => {
    expect(() => calcGatewayBattleExp([], { itemPluses: [128] }, 1)).toThrow(/signed byte/);
    expect(() => calcTreasuresBattleExp([{ flatXp: -1 }], {}, 1)).toThrow(/non-negative/);
    expect(() => calcTreasuresBattleExp([], {}, 0)).toThrow(/living party count/);
  });
});
