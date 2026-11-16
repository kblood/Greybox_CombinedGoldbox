/**
 * `addnd2e` ruleset tests (M5.S6). Asserts ONLY the genuinely-cited 2e delta (the THAC0
 * progression-rate formula — see docs/engine/research/broader-roster-detection.md) plus that
 * everything else honestly inherits `addnd1e` via `extends`. Not asserting invented 2e-specific
 * XP/ability numbers that were never independently sourced for this ruleset.
 */
import { describe, it, expect } from 'vitest';
import { addnd1e, addnd2e, ADND2E_ID, defaultRulesets } from '../src/index.js';

describe('addnd2e THAC0 progression-rate formula', () => {
  it('warriors improve 1 point per level', () => {
    expect(addnd2e.thac0?.('fighter', 1)).toBe(20);
    expect(addnd2e.thac0?.('fighter', 2)).toBe(19);
    expect(addnd2e.thac0?.('paladin', 10)).toBe(11);
    expect(addnd2e.thac0?.('ranger', 20)).toBe(1);
  });

  it('priests improve 1 point per 3 levels', () => {
    expect(addnd2e.thac0?.('cleric', 1)).toBe(20);
    expect(addnd2e.thac0?.('cleric', 3)).toBe(20);
    expect(addnd2e.thac0?.('cleric', 4)).toBe(19);
    expect(addnd2e.thac0?.('druid', 7)).toBe(18);
  });

  it('rogues improve 1 point per 2 levels', () => {
    expect(addnd2e.thac0?.('thief', 1)).toBe(20);
    expect(addnd2e.thac0?.('thief', 2)).toBe(20);
    expect(addnd2e.thac0?.('thief', 3)).toBe(19);
    expect(addnd2e.thac0?.('bard', 5)).toBe(18);
  });

  it('wizards improve 1 point per 5 levels (slowest)', () => {
    expect(addnd2e.thac0?.('magicUser', 1)).toBe(20);
    expect(addnd2e.thac0?.('magicUser', 5)).toBe(20);
    expect(addnd2e.thac0?.('magicUser', 6)).toBe(19);
    expect(addnd2e.thac0?.('illusionist', 11)).toBe(18);
  });

  it('assassin and monk (not core 2e classes) fall back to the rogue-family rate', () => {
    expect(addnd2e.thac0?.('assassin', 3)).toBe(addnd2e.thac0?.('thief', 3));
    expect(addnd2e.thac0?.('monk', 5)).toBe(addnd2e.thac0?.('thief', 5));
  });

  it('clamps sub-1 levels to level 1', () => {
    expect(addnd2e.thac0?.('fighter', 0)).toBe(20);
  });
});

describe('addnd2e inherits everything else from addnd1e', () => {
  it('shares ability modifiers, XP progression, and hit dice with addnd1e', () => {
    expect(addnd2e.abilityMods).toBe(addnd1e.abilityMods);
    expect(addnd2e.xpForLevel('fighter', 5)).toBe(addnd1e.xpForLevel('fighter', 5));
    expect(addnd2e.levelForXp('thief', 5000)).toBe(addnd1e.levelForXp('thief', 5000));
    expect(addnd2e.hitDie?.('cleric', 1)).toBe(addnd1e.hitDie?.('cleric', 1));
  });

  it('declares its base via extends, and has a distinct id/name', () => {
    expect(addnd2e.id).toBe(ADND2E_ID);
    expect(addnd2e.extends).toBe(addnd1e.id);
    expect(addnd2e.name).not.toBe(addnd1e.name);
  });
});

describe('addnd2e registration', () => {
  it('is registered in the default registry and resolves its inheritance chain', () => {
    const reg = defaultRulesets();
    expect(reg.get(ADND2E_ID)).toBe(addnd2e);
    expect(reg.resolve(ADND2E_ID)?.map((p) => p.id)).toEqual([addnd1e.id, ADND2E_ID]);
  });
});
