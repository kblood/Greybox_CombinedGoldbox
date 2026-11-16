/**
 * `buckrogers` ruleset tests (M5.S6). Validates the career→class approximation layer
 * (`BUCK_ROGERS_CAREERS` / `classForCareer`) and that the ruleset otherwise honestly inherits
 * `addnd1e`'s combat/XP math via `extends` — see `ruleset/buckrogers/index.ts` for why no
 * Buck-Rogers-specific numbers are invented here.
 */
import { describe, it, expect } from 'vitest';
import {
  addnd1e,
  buckrogers,
  BUCKROGERS_ID,
  BUCK_ROGERS_CAREERS,
  classForCareer,
  defaultRulesets,
  type BuckRogersCareer,
} from '../src/index.js';

describe('BUCK_ROGERS_CAREERS mapping', () => {
  it('covers exactly the 5 real careers (no Psionicist)', () => {
    expect(Object.keys(BUCK_ROGERS_CAREERS).sort()).toEqual(
      ['engineer', 'medic', 'rocketJock', 'rogue', 'warrior'].sort(),
    );
  });

  it('maps each career to a sensible analogous 1e class', () => {
    expect(classForCareer('warrior')).toBe('fighter');
    expect(classForCareer('rogue')).toBe('thief');
    expect(classForCareer('medic')).toBe('cleric');
    expect(classForCareer('engineer')).toBe('magicUser');
    expect(classForCareer('rocketJock')).toBe('ranger');
  });

  it('throws on an unknown career', () => {
    expect(() => classForCareer('psionicist' as BuckRogersCareer)).toThrow(/unknown career/);
  });

  it('every mapped class resolves to a working combat/XP curve via the inherited ruleset', () => {
    for (const career of Object.keys(BUCK_ROGERS_CAREERS) as BuckRogersCareer[]) {
      const cls = classForCareer(career);
      expect(buckrogers.xpForLevel(cls, 1)).toBe(0);
      expect(typeof buckrogers.thac0?.(cls, 5)).toBe('number');
    }
  });
});

describe('buckrogers inherits combat/XP math from addnd1e', () => {
  it('shares ability modifiers, XP progression, and THAC0 with addnd1e', () => {
    expect(buckrogers.abilityMods).toBe(addnd1e.abilityMods);
    expect(buckrogers.xpForLevel('fighter', 5)).toBe(addnd1e.xpForLevel('fighter', 5));
    expect(buckrogers.thac0?.('fighter', 5)).toBe(addnd1e.thac0?.('fighter', 5));
  });

  it('declares its base via extends, and has a distinct id/name', () => {
    expect(buckrogers.id).toBe(BUCKROGERS_ID);
    expect(buckrogers.extends).toBe(addnd1e.id);
    expect(buckrogers.name).not.toBe(addnd1e.name);
  });
});

describe('buckrogers registration', () => {
  it('is registered in the default registry and resolves its inheritance chain', () => {
    const reg = defaultRulesets();
    expect(reg.get(BUCKROGERS_ID)).toBe(buckrogers);
    expect(reg.resolve(BUCKROGERS_ID)?.map((p) => p.id)).toEqual([addnd1e.id, BUCKROGERS_ID]);
  });
});
