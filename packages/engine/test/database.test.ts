/**
 * `ModuleDatabase` tests (M5.S5) — authored monster/item/spell/class/race CRUD, the built-in
 * catalogue merge (items/spells), and the authored-monster → real-`Combatant` adapter that proves
 * an edited monster is real combat data, not a display-only stub.
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyModuleDatabase,
  upsertMonster,
  removeMonster,
  authoredMonsterCombatant,
  upsertItem,
  removeItem,
  mergedBaseItems,
  upsertSpell,
  removeSpell,
  mergedSpells,
  spellEffectFor,
  upsertClass,
  removeClass,
  upsertRace,
  removeRace,
  serializeModuleDatabase,
  deserializeModuleDatabase,
  runCombat,
  BASE_ITEMS,
  COK_SPELLS,
  spellEffect,
  type ModuleDatabase,
  type AuthoredMonster,
  type Combatant,
} from '../src/index.js';

const TEST_OGRE: AuthoredMonster = {
  id: 1,
  name: 'TEST OGRE',
  hitPoints: 20,
  armorClass: 4,
  thac0: 15,
  damage: { count: 1, sides: 8, bonus: 2 },
  xp: 100,
};

describe('createEmptyModuleDatabase (M5.S5)', () => {
  it('starts with every category empty', () => {
    expect(createEmptyModuleDatabase()).toEqual({ monsters: [], items: [], spells: [], classes: [], races: [] });
  });
});

describe('monster CRUD (M5.S5)', () => {
  it('upserts by id, replacing rather than duplicating', () => {
    const withOne = upsertMonster(createEmptyModuleDatabase(), TEST_OGRE);
    expect(withOne.monsters).toHaveLength(1);
    const renamed = upsertMonster(withOne, { ...TEST_OGRE, name: 'BIG TEST OGRE' });
    expect(renamed.monsters).toHaveLength(1);
    expect(renamed.monsters[0].name).toBe('BIG TEST OGRE');
  });

  it('rejects a non-positive id', () => {
    expect(() => upsertMonster(createEmptyModuleDatabase(), { ...TEST_OGRE, id: 0 })).toThrow();
    expect(() => upsertMonster(createEmptyModuleDatabase(), { ...TEST_OGRE, id: -1 })).toThrow();
  });

  it('removes by id', () => {
    const withOne = upsertMonster(createEmptyModuleDatabase(), TEST_OGRE);
    expect(removeMonster(withOne, 1).monsters).toEqual([]);
  });
});

describe('authoredMonsterCombatant (M5.S5 acceptance) — an edited monster is real combat data', () => {
  it('adapts an AuthoredMonster into the same Combatant shape monsterCombatant produces', () => {
    const combatant = authoredMonsterCombatant(TEST_OGRE, 'enemy-1');
    expect(combatant).toMatchObject({
      id: 'enemy-1',
      name: 'TEST OGRE',
      side: 'enemy',
      hp: 20,
      maxHp: 20,
      thac0: 15,
      ac: 4,
      damage: { count: 1, sides: 8, bonus: 2 },
      xp: 100,
    });
  });

  it('plays a full deterministic combat against a hand-built party, resolving to a real outcome', () => {
    const hero: Combatant = {
      id: 'hero', name: 'Hero', side: 'party', hp: 30, maxHp: 30, thac0: 12, ac: 2,
      damage: { count: 1, sides: 8, bonus: 1 },
    };
    const enemy = authoredMonsterCombatant(TEST_OGRE, 'enemy-1');
    const result = runCombat([hero, enemy], { seed: 7 });
    expect(['party', 'enemy', 'draw']).toContain(result.outcome);
    expect(result.rounds).toBeGreaterThan(0);
    // Editing the monster (higher HP) measurably changes the fight: a near-unkillable ogre can't lose.
    const toughened = authoredMonsterCombatant({ ...TEST_OGRE, hitPoints: 5000 }, 'enemy-1');
    const stalemate = runCombat([{ ...hero }, toughened], { seed: 7, roundCap: 20 });
    expect(stalemate.outcome).not.toBe('party');
  });
});

describe('item CRUD + merge (M5.S5)', () => {
  const CUSTOM_SWORD = { id: 200, name: 'Custom Sword', kind: 'weapon' as const, damage: { count: 1, sides: 8, bonus: 0 }, weightTenths: 40 };

  it('upserts/removes by id', () => {
    const withOne = upsertItem(createEmptyModuleDatabase(), CUSTOM_SWORD);
    expect(withOne.items).toHaveLength(1);
    expect(removeItem(withOne, 200).items).toEqual([]);
  });

  it('rejects a non-positive id', () => {
    expect(() => upsertItem(createEmptyModuleDatabase(), { ...CUSTOM_SWORD, id: 0 })).toThrow();
  });

  it('mergedBaseItems overlays authored items onto BASE_ITEMS without mutating the global table', () => {
    const db = upsertItem(createEmptyModuleDatabase(), CUSTOM_SWORD);
    const merged = mergedBaseItems(db);
    expect(merged[200]).toEqual(CUSTOM_SWORD);
    expect(merged[10]).toEqual(BASE_ITEMS[10]); // built-in Long Sword untouched
    expect(BASE_ITEMS[200]).toBeUndefined(); // global table not mutated

    // An authored item at a BUILT-IN id wins (override, not a silent no-op).
    const overridden = upsertItem(db, { ...BASE_ITEMS[10], name: 'Rusty Long Sword' });
    expect(mergedBaseItems(overridden)[10].name).toBe('Rusty Long Sword');
    expect(BASE_ITEMS[10].name).toBe('Long Sword'); // still not mutated
  });
});

describe('spell CRUD + merge (M5.S5)', () => {
  const CUSTOM_SPELL = {
    id: 'm1-arcane-bolt', name: 'Arcane Bolt', class: 'magicUser' as const, level: 1,
    effect: { kind: 'damage' as const, target: 'enemy' as const, dice: { count: 1, sides: 6, bonus: 0 }, campCastable: false },
  };

  it('upserts/removes by id', () => {
    const withOne = upsertSpell(createEmptyModuleDatabase(), CUSTOM_SPELL);
    expect(withOne.spells).toHaveLength(1);
    expect(removeSpell(withOne, CUSTOM_SPELL.id).spells).toEqual([]);
  });

  it('rejects a missing id', () => {
    expect(() => upsertSpell(createEmptyModuleDatabase(), { ...CUSTOM_SPELL, id: '' })).toThrow();
  });

  it('mergedSpells overlays authored spells onto COK_SPELLS', () => {
    const db = upsertSpell(createEmptyModuleDatabase(), CUSTOM_SPELL);
    const merged = mergedSpells(db);
    expect(merged).toHaveLength(COK_SPELLS.length + 1);
    expect(merged.find((s) => s.id === CUSTOM_SPELL.id)).toBeDefined();
    expect(merged.find((s) => s.id === 'm1-magic-missile')).toBeDefined(); // built-in untouched
  });

  it('spellEffectFor prefers an authored inline effect, falls back to the built-in table', () => {
    const db = upsertSpell(createEmptyModuleDatabase(), CUSTOM_SPELL);
    expect(spellEffectFor(db, CUSTOM_SPELL.id)).toEqual(CUSTOM_SPELL.effect);
    expect(spellEffectFor(db, 'm1-magic-missile')).toEqual(spellEffect('m1-magic-missile'));
    expect(spellEffectFor(db, 'not-a-real-spell').kind).toBe('utility'); // flavour-only fallback
  });
});

describe('class/race CRUD (M5.S5)', () => {
  it('upserts/removes classes by id', () => {
    const db = upsertClass(createEmptyModuleDatabase(), { id: 'warder', name: 'Warder', hitDie: 8 });
    expect(db.classes).toHaveLength(1);
    expect(removeClass(db, 'warder').classes).toEqual([]);
    expect(() => upsertClass(createEmptyModuleDatabase(), { id: '', name: 'x', hitDie: 4 })).toThrow();
  });

  it('upserts/removes races by id', () => {
    const db = upsertRace(createEmptyModuleDatabase(), { id: 'kobold', name: 'Kobold' });
    expect(db.races).toHaveLength(1);
    expect(removeRace(db, 'kobold').races).toEqual([]);
    expect(() => upsertRace(createEmptyModuleDatabase(), { id: '', name: 'x' })).toThrow();
  });
});

describe('serializeModuleDatabase / deserializeModuleDatabase (M5.S5)', () => {
  it('round-trips a populated database exactly', () => {
    let db = createEmptyModuleDatabase();
    db = upsertMonster(db, TEST_OGRE);
    db = upsertClass(db, { id: 'warder', name: 'Warder', hitDie: 8 });
    const json = serializeModuleDatabase(db);
    expect(deserializeModuleDatabase(json)).toEqual(db);
  });

  it('rejects malformed JSON and shape mismatches', () => {
    expect(() => deserializeModuleDatabase('not json')).toThrow();
    expect(() => deserializeModuleDatabase(JSON.stringify({ monsters: [] }))).toThrow();
  });
});

// Type-only smoke check — ModuleDatabase is exported and usable by consumers.
const _typeCheck: ModuleDatabase = createEmptyModuleDatabase();
void _typeCheck;
