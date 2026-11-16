/**
 * Party combatant builder (M2.S5/S6 bridge).
 *
 * 1) Derivation: THAC0 (best across classes, minus STR/magic), DEX-adjusted AC, STR-boosted damage.
 * 2) Golden: a real PC party (built via addnd1e) fights real CoK monsters to a deterministic result.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addnd1e,
  partyCombatant,
  monsterCombatant,
  runCombat,
  decodeMonsterArchive,
  type PartyMemberSpec,
  type Combatant,
} from '../src/index.js';

const FIGHTER: PartyMemberSpec = {
  id: 'tanis',
  name: 'Tanis',
  classes: { fighter: 7 },
  abilities: { str: 18, strPct: 100, int: 12, wis: 10, dex: 16, con: 16, cha: 14 },
  hp: 60,
  maxHp: 60,
  baseAc: 4, // chain + shield
  weaponDamage: { count: 1, sides: 8, bonus: 0 }, // long sword
};

describe('partyCombatant — derivation', () => {
  it('derives THAC0, AC, and damage through the ruleset', () => {
    const str = addnd1e.abilityMods.strength(18, 100);
    const dex = addnd1e.abilityMods.dexterity(16);
    const c = partyCombatant(FIGHTER, addnd1e);

    expect(c.side).toBe('party');
    expect(c.thac0).toBe(addnd1e.thac0!('fighter', 7) - str.hit); // 14 − STR hit
    expect(c.ac).toBe(4 + dex.defensiveAc); // DEX lowers AC
    expect(c.damage).toEqual({ count: 1, sides: 8, bonus: str.damage }); // 1d8 + STR dmg
    expect(c.hp).toBe(60);
    // M25.S1 — the Dex missile-attack bonus (DEX 16 → +1, COAB `DexReactionAdj`) reaches the Combatant.
    expect(c.missileHitBonus).toBe(dex.missile);
    expect(c.missileHitBonus).toBe(1);
  });

  // M25.S1 — real character sheets at DEX 18 vs DEX 9 (via the ruleset's own dexterity() table, not a
  // hand-rolled number), proving the bonus is undefined/zero for an average archer and present for a
  // sharp-eyed one, mirroring M23.S2/M24.S1's "real data reaches the real object" proof shape.
  it('a high-Dex sheet gets the corrected +3 missile bonus; an average one gets none', () => {
    const sharp = partyCombatant({ ...FIGHTER, abilities: { ...FIGHTER.abilities, dex: 18 } }, addnd1e);
    const average = partyCombatant({ ...FIGHTER, abilities: { ...FIGHTER.abilities, dex: 9 } }, addnd1e);
    expect(sharp.missileHitBonus).toBe(3); // COAB-corrected DEX 18 row (M25.S1 abilities.ts fix)
    expect(average.missileHitBonus).toBeUndefined();
  });

  it('folds in magic weapon bonuses and takes the best THAC0 across multiclass', () => {
    const str = addnd1e.abilityMods.strength(18, 100);
    const c = partyCombatant(
      { ...FIGHTER, classes: { fighter: 5, magicUser: 6 }, magicHitBonus: 1, magicDamageBonus: 2 },
      addnd1e,
    );
    const best = Math.min(addnd1e.thac0!('fighter', 5), addnd1e.thac0!('magicUser', 6));
    expect(c.thac0).toBe(best - str.hit - 1);
    expect(c.damage.bonus).toBe(str.damage + 2);
  });

  it('throws on a ruleset without THAC0 or a member with no classes', () => {
    const noThac0 = { ...addnd1e, thac0: undefined };
    expect(() => partyCombatant(FIGHTER, noThac0)).toThrow(/thac0/);
    expect(() => partyCombatant({ ...FIGHTER, classes: {} }, addnd1e)).toThrow(/no classes/);
  });
});

// --- Golden: a real PC party vs real CoK monsters ----------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const monPath = resolve(here, '..', '..', '..', 'Champions of Krynn', 'MON1CHA.DAX');

describe('runCombat — golden PC party vs CoK monsters', () => {
  it.skipIf(!existsSync(monPath))('a competent party defeats goblins deterministically', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const goblin = mons.find((m) => m.name === 'GOBLIN')!;

    const CARAMON: PartyMemberSpec = {
      id: 'caramon',
      name: 'Caramon',
      classes: { fighter: 6 },
      abilities: { str: 17, int: 10, wis: 10, dex: 15, con: 17, cha: 12 },
      hp: 52,
      maxHp: 52,
      baseAc: 5,
      weaponDamage: { count: 1, sides: 8, bonus: 0 },
    };
    // runCombat mutates HP in place, so build a fresh set for each run.
    const build = (): Combatant[] => [
      partyCombatant(FIGHTER, addnd1e),
      partyCombatant(CARAMON, addnd1e),
      monsterCombatant(goblin, 'gob1'),
      monsterCombatant(goblin, 'gob2'),
      monsterCombatant(goblin, 'gob3'),
      monsterCombatant(goblin, 'gob4'),
    ];

    const a = runCombat(build(), { seed: 0x2024 });
    const b = runCombat(build(), { seed: 0x2024 });
    expect(a.log).toEqual(b.log); // determinism

    // Two strong fighters vs four 4-hp goblins: the party wins and banks 4 × goblin XP.
    expect(a.outcome).toBe('party');
    expect(a.xpAwarded).toBe(4 * goblin.xp);
    // The to-hit rule held on every swing.
    for (const e of a.log) {
      if (e.type !== 'attack') continue;
      const expectHit = e.roll === 20 ? true : e.roll === 1 ? false : e.roll! >= e.needed!;
      expect(e.hit).toBe(expectHit);
    }
  });
});
