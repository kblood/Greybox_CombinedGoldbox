/**
 * Encumbrance model (A4.2). The Strength→allowance numbers are CANDIDATE, so the asserts pin the
 * model's *shape* — monotonic in load, scaled by Strength, stepping down the movement rate — not
 * specific magic constants beyond the documented step fractions.
 */
import { describe, it, expect } from 'vitest';
import { encumbrance, allowanceTenths } from '../src/items/encumbrance.js';

describe('encumbrance', () => {
  it('a stronger character carries more before the same load encumbers them', () => {
    expect(allowanceTenths(18)).toBeGreaterThan(allowanceTenths(9));
    expect(allowanceTenths(9)).toBeGreaterThan(allowanceTenths(3));
  });

  it('18/00 exceptional Strength beats plain 18', () => {
    expect(allowanceTenths(18, 100)).toBeGreaterThan(allowanceTenths(18, 0));
  });

  it('steps unencumbered → light → moderate → heavy → overloaded at 1×..4× allowance', () => {
    const str = 12;
    const a = allowanceTenths(str);
    expect(encumbrance(0, str).level).toBe('unencumbered');
    expect(encumbrance(a, str).level).toBe('unencumbered'); // ≤ 1× allowance
    expect(encumbrance(a + 1, str).level).toBe('light');
    expect(encumbrance(a * 2, str).level).toBe('light');
    expect(encumbrance(a * 2 + 1, str).level).toBe('moderate');
    expect(encumbrance(a * 3 + 1, str).level).toBe('heavy');
    expect(encumbrance(a * 4 + 1, str).level).toBe('overloaded');
  });

  it('movement rate steps down with the level; overloaded can\'t move', () => {
    const str = 12;
    const a = allowanceTenths(str);
    expect(encumbrance(0, str).moveRate).toBe(12);
    expect(encumbrance(a + 1, str).moveRate).toBe(9);
    expect(encumbrance(a * 2 + 1, str).moveRate).toBe(6);
    expect(encumbrance(a * 3 + 1, str).moveRate).toBe(3);
    expect(encumbrance(a * 4 + 1, str).moveRate).toBe(0);
  });

  it('reports the allowance and overloaded cap', () => {
    const e = encumbrance(0, 16);
    expect(e.maxLoadTenths).toBe(e.allowanceTenths * 4);
    expect(e.label).toBe('UNENCUMBERED');
  });
});
