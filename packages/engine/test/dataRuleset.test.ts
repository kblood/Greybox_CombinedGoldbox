/**
 * Data-driven ruleset tests (M5.S5) — `createDataRuleset` math, registering a custom ruleset
 * alongside the built-ins, and `loadModule`'s registry-override seam that makes "switch ruleset"
 * (including to a genuinely custom one) work end-to-end.
 */
import { describe, it, expect } from 'vitest';
import {
  createDataRuleset,
  createRulesetRegistry,
  defaultRulesets,
  ADND1E_ID,
  loadModule,
  createEmptyModuleMap,
  placeEntry,
  type ModulePackage,
  type RulesetTableData,
} from '../src/index.js';

const CUSTOM: RulesetTableData = {
  id: 'grim-1e',
  name: 'Grim 1e',
  classes: {
    fighter: { xp: [0, 500, 1000], perLevel: 1000, hitDie: 12, thac0: [19, 18, 5] },
  },
};

describe('createDataRuleset (M5.S5)', () => {
  it('computes xpForLevel/levelForXp/hitDie/thac0 from the authored table', () => {
    const rs = createDataRuleset(CUSTOM);
    expect(rs.id).toBe('grim-1e');
    expect(rs.xpForLevel('fighter', 1)).toBe(0);
    expect(rs.xpForLevel('fighter', 3)).toBe(1000);
    expect(rs.xpForLevel('fighter', 4)).toBe(2000); // +perLevel past the table
    expect(rs.levelForXp('fighter', 999)).toBe(2);
    expect(rs.levelForXp('fighter', 1000)).toBe(3);
    expect(rs.levelForXp('fighter', 2000)).toBe(4);
    expect(rs.hitDie?.('fighter', 1)).toBe(12);
    expect(rs.thac0?.('fighter', 1)).toBe(19);
    expect(rs.thac0?.('fighter', 3)).toBe(5);
    expect(rs.thac0?.('fighter', 99)).toBe(5); // clamps to the last entry
  });

  it('falls back to a generic progression for an undefined class', () => {
    const rs = createDataRuleset(CUSTOM);
    expect(rs.xpForLevel('cleric', 1)).toBe(0);
    expect(rs.hitDie?.('cleric', 1)).toBe(8);
    expect(rs.thac0?.('cleric', 1)).toBe(20);
  });

  it('uses flat (no-op) ability modifiers', () => {
    const rs = createDataRuleset(CUSTOM);
    expect(rs.abilityMods.strength(18, 100)).toEqual({ hit: 0, damage: 0 });
    expect(rs.abilityMods.dexterity(3)).toEqual({ missile: 0, defensiveAc: 0, reaction: 0 });
    expect(rs.abilityMods.constitution(18, true)).toEqual({ hp: 0 });
  });

  it('omits savingThrows/spellSlots (RulesetPlugin declares them optional)', () => {
    const rs = createDataRuleset(CUSTOM);
    expect(rs.savingThrows).toBeUndefined();
    expect(rs.spellSlots).toBeUndefined();
  });

  it('rejects a missing id', () => {
    expect(() => createDataRuleset({ id: '', name: 'x', classes: {} })).toThrow();
  });

  it('registers into a registry alongside the built-ins, resolvable by id', () => {
    const reg = defaultRulesets();
    reg.register(createDataRuleset(CUSTOM));
    expect(reg.ids()).toEqual(expect.arrayContaining([ADND1E_ID, 'grim-1e']));
    expect(reg.get('grim-1e')?.thac0?.('fighter', 1)).toBe(19);
  });
});

function fixturePackage(ruleset: string): ModulePackage {
  const map = placeEntry(createEmptyModuleMap('Ruleset Test', 1, 1), 0, 0, 0, 'north');
  return { schema: 1, id: 'ruleset-fixture', title: 'Ruleset Test', ruleset, maps: [map], entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }] };
}

function registryWithCustom(): ReturnType<typeof createRulesetRegistry> {
  const registry = createRulesetRegistry();
  const defaults = defaultRulesets();
  for (const id of defaults.ids()) registry.register(defaults.get(id)!);
  registry.register(createDataRuleset(CUSTOM));
  return registry;
}

describe('loadModule registry override (M5.S5 "switch ruleset" acceptance)', () => {
  it('resolves a custom ruleset when a registry containing it is supplied', () => {
    const loaded = loadModule(fixturePackage('grim-1e'), { registry: registryWithCustom() });
    expect(loaded.ruleset.id).toBe('grim-1e');
    expect(loaded.ruleset.thac0?.('fighter', 1)).toBe(19);
  });

  it('a plain built-in ruleset id still resolves with no registry override (default path unchanged)', () => {
    const loaded = loadModule(fixturePackage(ADND1E_ID));
    expect(loaded.ruleset.id).toBe(ADND1E_ID);
  });

  it('an unregistered custom ruleset id throws without the override (proves the switch is real, not a no-op)', () => {
    expect(() => loadModule(fixturePackage('grim-1e'))).toThrow(/unknown ruleset/);
  });

  it('switching the SAME package between two rulesets changes the resolved THAC0 math', () => {
    const registry = registryWithCustom();
    const asBuiltIn = loadModule(fixturePackage(ADND1E_ID), { registry });
    const asCustom = loadModule(fixturePackage('grim-1e'), { registry });
    expect(asBuiltIn.ruleset.thac0?.('fighter', 1)).not.toBe(asCustom.ruleset.thac0?.('fighter', 1));
  });
});
