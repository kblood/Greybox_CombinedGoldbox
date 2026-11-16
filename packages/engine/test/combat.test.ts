/**
 * Combat core tests (M2.S5).
 *
 * 1) Rng: seeded reproducibility + die/roll ranges.
 * 2) Synthetic: to-hit math (natural 1/20, THAC0−AC threshold), XP award, draw on cap.
 * 3) Golden: a real CoK battle (GOBLIN ×3 vs OGRE) is fully deterministic for a fixed seed.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Rng,
  runCombat,
  monsterCombatant,
  decodeMonsterArchive,
  decodeMonsterSpcArchive,
  applyConSavingBonus,
  decodeMonsterItmArchive,
  applyCarriedItems,
  type Combatant,
} from '../src/index.js';

describe('Rng', () => {
  it('is reproducible for a fixed seed and diverges for different seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    const seqC = Array.from({ length: 8 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('die(n) stays in 1..n and roll sums dice + bonus', () => {
    const r = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const d = r.die(6);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
    const r2 = new Rng(7);
    for (let i = 0; i < 100; i++) {
      const v = r2.roll(2, 8, 3);
      expect(v).toBeGreaterThanOrEqual(2 + 3); // 2×1 + 3
      expect(v).toBeLessThanOrEqual(16 + 3); // 2×8 + 3
    }
  });
});

function fighter(id: string, side: 'party' | 'enemy', over: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    side,
    hp: 10,
    maxHp: 10,
    thac0: 20,
    ac: 10,
    damage: { count: 1, sides: 6, bonus: 0 },
    ...over,
  };
}

describe('runCombat — synthetic', () => {
  it('an unbeatable hero clears the field and accrues enemy XP', () => {
    const hero = fighter('hero', 'party', { hp: 100, maxHp: 100, thac0: 1, ac: -10, damage: { count: 10, sides: 10, bonus: 10 } });
    const goblinA = fighter('gobA', 'enemy', { hp: 4, thac0: 60, ac: 10, xp: 10 }); // thac0 60 = can never hit AC -10
    const goblinB = fighter('gobB', 'enemy', { hp: 4, thac0: 60, ac: 10, xp: 10 });
    const res = runCombat([hero, goblinA, goblinB], { seed: 1 });
    expect(res.outcome).toBe('party');
    expect(res.survivors.map((c) => c.id)).toEqual(['hero']);
    expect(res.xpAwarded).toBe(20);
    expect(res.log.at(-1)).toMatchObject({ type: 'end', outcome: 'party' });
  });

  it('natural 1 always misses and natural 20 always hits regardless of THAC0/AC', () => {
    // Seed the d20 by finding rolls — instead, assert the rule via two impossible matchups.
    const cantHit = fighter('a', 'party', { thac0: 99, ac: 10 }); // needs 99−ac; only nat 20 lands
    const cantBeHurt = fighter('b', 'enemy', { ac: -50, hp: 5 }); // needed huge; nat 20 still hits
    const res = runCombat([cantHit, cantBeHurt], { seed: 5, roundCap: 200 });
    // a only ever connects on a natural 20, and b cannot hit a (symmetric), so combat resolves by
    // nat-20s alone — it must terminate with a winner, not stall as a draw.
    expect(['party', 'enemy']).toContain(res.outcome);
    const nat20Hits = res.log.filter((e) => e.type === 'attack' && e.roll === 20);
    expect(nat20Hits.every((e) => e.hit === true)).toBe(true);
    const nat1 = res.log.filter((e) => e.type === 'attack' && e.roll === 1);
    expect(nat1.every((e) => e.hit === false)).toBe(true);
  });

  it('declares a draw when neither side can land a blow within the round cap', () => {
    const a = fighter('a', 'party', { thac0: 99, ac: -50 });
    const b = fighter('b', 'enemy', { thac0: 99, ac: -50 });
    // Both need >20 except nat-20; with ac -50 even nat-20 deals only 1, hp 10 → eventually dies.
    // Use a tiny cap so we exercise the draw branch before any nat-20 chain finishes.
    const res = runCombat([a, b], { seed: 2, roundCap: 1 });
    if (res.rounds >= 1 && res.survivors.length === 2) {
      expect(res.outcome).toBe('draw');
    }
  });

  it('is fully deterministic — same seed yields an identical log', () => {
    const make = () => [fighter('h', 'party', { hp: 12 }), fighter('o', 'enemy', { hp: 12, thac0: 18 })];
    const a = runCombat(make(), { seed: 99 });
    const b = runCombat(make(), { seed: 99 });
    expect(a.log).toEqual(b.log);
    expect(a.outcome).toBe(b.outcome);
  });

  // M23.S2 — COAB `regen_3_hp` (`AffectRegen3Hp`, `BattleRoundChecks` Type_19 sweep): +3 HP every
  // round, capped at maxHp, applied before that round's attacks land. Both sides are unhittable
  // (thac0 99 vs ac -50, only a natural 20 could ever land) so troll's HP path is regen-only.
  it('regenPerRound heals at the start of each round, capped at maxHp', () => {
    const troll = fighter('troll', 'enemy', { hp: 5, maxHp: 20, thac0: 99, ac: -50, regenPerRound: 3 });
    const harmless = fighter('harmless', 'party', { thac0: 99, ac: -50 });
    const res = runCombat([harmless, troll], { seed: 3, roundCap: 3 });
    expect(res.rounds).toBe(3);
    expect(troll.hp).toBe(14); // 5 -> 8 -> 11 -> 14, all three rounds' regen, no attack ever lands
  });

  it('regenPerRound never pushes HP above maxHp', () => {
    const troll = fighter('troll', 'enemy', { hp: 19, maxHp: 20, thac0: 99, ac: -50, regenPerRound: 3 });
    const harmless = fighter('harmless', 'party', { thac0: 99, ac: -50 });
    runCombat([harmless, troll], { seed: 3, roundCap: 3 });
    expect(troll.hp).toBe(20);
  });

  // M24.S1 — COAB `half_damage` (Type_5 sweep): halves every hit taken by a flagged defender. A 1d1
  // weapon always rolls the same total (deterministic damage) regardless of RNG; thac0 1 vs ac 15
  // means only a natural 1 ever misses, so several rounds guarantee at least one observed hit.
  it('halfDamage halves every hit a flagged monster takes', () => {
    const attacker = fighter('atk', 'party', { thac0: 1, damage: { count: 1, sides: 1, bonus: 6 } }); // always rolls 7
    const vampire = fighter('vamp', 'enemy', { hp: 100, maxHp: 100, ac: 15, thac0: 99, halfDamage: true });
    const res = runCombat([attacker, vampire], { seed: 3, roundCap: 5 });
    const hits = res.log.filter((e) => e.type === 'attack' && e.attacker === 'atk' && e.hit);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.damage).toBe(3); // floor(7/2)
  });

  it('a non-flagged target takes the same attack at full damage', () => {
    const attacker = fighter('atk', 'party', { thac0: 1, damage: { count: 1, sides: 1, bonus: 6 } }); // always rolls 7
    const goblin = fighter('gob', 'enemy', { hp: 100, maxHp: 100, ac: 15, thac0: 99 });
    const res = runCombat([attacker, goblin], { seed: 3, roundCap: 5 });
    const hits = res.log.filter((e) => e.type === 'attack' && e.attacker === 'atk' && e.hit);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.damage).toBe(7);
  });
});

describe('monsterCombatant (M26.S1) — carries a joined MonsterRecord.itemPluses onto the Combatant', () => {
  it('passes itemPluses through unchanged', () => {
    const mon = {
      name: 'SOLAMNIC KNIGHT',
      hitPoints: 20,
      thac0: 15,
      armorClass: 5,
      damage: { count: 1, sides: 8, bonus: 0 },
      xp: 175,
      itemPluses: [0, 0, 1],
    };
    const c = monsterCombatant(mon, 'knight1', 'enemy');
    expect(c.itemPluses).toEqual([0, 0, 1]);
  });

  it('is undefined when the monster has no carried-item record', () => {
    const mon = { name: 'GOBLIN', hitPoints: 7, thac0: 19, armorClass: 6, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15 };
    const c = monsterCombatant(mon, 'gob1', 'enemy');
    expect(c.itemPluses).toBeUndefined();
  });
});

// --- Golden: real CoK MON1CHA battle (skips if data absent) ------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const monPath = resolve(here, '..', '..', '..', 'Champions of Krynn', 'MON1CHA.DAX');

describe('monsterCombatant (M27.S1) — carries MonsterRecord.savingThrows.spell onto Combatant.monsterSpellSave', () => {
  it('extracts .spell from a full savingThrows object', () => {
    const mon = {
      name: 'BLACK ROBE MAGE',
      hitPoints: 12,
      thac0: 18,
      armorClass: 8,
      damage: { count: 1, sides: 4, bonus: 0 },
      xp: 65,
      savingThrows: { paralyzePoisonDeath: 14, petrifyPolymorph: 13, rodStaffWand: 11, breath: 15, spell: 12 },
    };
    const c = monsterCombatant(mon, 'mage1', 'enemy');
    expect(c.monsterSpellSave).toBe(12);
  });

  it('is undefined when the monster has no located saves (DoK shape)', () => {
    const mon = { name: 'NIGHTMARE', hitPoints: 0, thac0: 13, armorClass: -4, damage: { count: 2, sides: 4, bonus: 2 }, xp: 0 };
    const c = monsterCombatant(mon, 'nm1', 'enemy');
    expect(c.monsterSpellSave).toBeUndefined();
  });

  it('real CoK MON1CHA: GOBLIN and RED DRAGON carry their own real, different spell-save values', async () => {
    if (!existsSync(monPath)) return;
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const by = (n: string) => mons.find((m) => m.name === n)!;
    expect(monsterCombatant(by('GOBLIN'), 'e0').monsterSpellSave).toBe(19);
    expect(monsterCombatant(by('RED DRAGON'), 'e1').monsterSpellSave).toBe(10);
  });
});

describe('monsterCombatant (M28.S1) — carries MonsterRecord.conSaveBonus onto Combatant.conSaveBonus', () => {
  it('passes conSaveBonus through unchanged', () => {
    const mon = {
      name: 'GHOUL', hitPoints: 13, thac0: 19, armorClass: 6,
      damage: { count: 1, sides: 3, bonus: 0 }, xp: 175, conSaveBonus: 2,
    };
    const c = monsterCombatant(mon, 'gh1', 'enemy');
    expect(c.conSaveBonus).toBe(2);
  });

  it('is undefined when the monster record has no conSaveBonus', () => {
    const mon = { name: 'GOBLIN', hitPoints: 5, thac0: 21, armorClass: 6, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15 };
    const c = monsterCombatant(mon, 'gob1', 'enemy');
    expect(c.conSaveBonus).toBeUndefined();
  });

  it('real CoK MON1CHA + MON1SPC: GHOUL joins to conSaveBonus=2 via the real side-table', async () => {
    if (!existsSync(monPath)) return;
    const spcPath = resolve(monPath, '..', 'MON1SPC.DAX');
    if (!existsSync(spcPath)) return;
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const spc = decodeMonsterSpcArchive(new Uint8Array(await readFile(spcPath)));
    const joined = applyConSavingBonus(mons, spc);
    const ghoul = joined.find((m) => m.name === 'GHOUL')!;
    expect(monsterCombatant(ghoul, 'e0').conSaveBonus).toBe(2);
  });
});

describe('monsterCombatant (M29.S1) — carries MonsterRecord.carriedItems onto Combatant.carriedItems', () => {
  it('passes carriedItems through unchanged, including ids outside BASE_ITEMS', () => {
    const mon = {
      name: 'BLACK ROBE MAGE', hitPoints: 12, thac0: 18, armorClass: 8,
      damage: { count: 1, sides: 4, bonus: 0 }, xp: 65,
      carriedItems: [{ baseTypeId: 5, count: 9 }, { baseTypeId: 999, count: 1 }],
    };
    const c = monsterCombatant(mon, 'mage1', 'enemy');
    expect(c.carriedItems).toEqual([{ baseTypeId: 5, count: 9 }, { baseTypeId: 999, count: 1 }]);
  });

  it('is undefined when the monster record has no carriedItems', () => {
    const mon = { name: 'GOBLIN', hitPoints: 5, thac0: 21, armorClass: 6, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15 };
    const c = monsterCombatant(mon, 'gob1', 'enemy');
    expect(c.carriedItems).toBeUndefined();
  });

  it('real CoK MON1CHA + MON1ITM: BLACK ROBE MAGE joins to its real Vial x9 via the real side-table', async () => {
    if (!existsSync(monPath)) return;
    const itmPath = resolve(monPath, '..', 'MON1ITM.DAX');
    if (!existsSync(itmPath)) return;
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const itm = decodeMonsterItmArchive(new Uint8Array(await readFile(itmPath)));
    const joined = applyCarriedItems(mons, itm);
    const mage = joined.find((m) => m.name === 'BLACK ROBE MAGE')!;
    expect(monsterCombatant(mage, 'e0').carriedItems).toContainEqual({
      itemTypeId: 5, baseTypeId: 5, count: 9, value: undefined,
    });
  });
});

describe('runCombat — golden CoK GOBLIN ×3 vs OGRE', () => {
  it.skipIf(!existsSync(monPath))('resolves deterministically from real monster stats', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const goblin = mons.find((m) => m.name === 'GOBLIN')!;
    const ogre = mons.find((m) => m.name === 'OGRE')!;

    // Sanity: the stats feeding combat are the verified ones.
    expect(goblin.thac0).toBe(21);
    expect(goblin.armorClass).toBe(6);
    expect(goblin.damage).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(ogre.hitPoints).toBe(18);
    expect(ogre.damage).toEqual({ count: 1, sides: 10, bonus: 0 });
    expect(ogre.xp).toBe(90);

    const build = (): Combatant[] => [
      monsterCombatant(goblin, 'gob1', 'party'),
      monsterCombatant(goblin, 'gob2', 'party'),
      monsterCombatant(goblin, 'gob3', 'party'),
      monsterCombatant(ogre, 'ogre1', 'enemy'),
    ];

    const a = runCombat(build(), { seed: 0x1234 });
    const b = runCombat(build(), { seed: 0x1234 });
    // Determinism: identical replays.
    expect(a.log).toEqual(b.log);
    // A real, terminating battle (not a draw, not zero rounds).
    expect(['party', 'enemy']).toContain(a.outcome);
    expect(a.rounds).toBeGreaterThan(0);
    expect(a.rounds).toBeLessThan(100);
    // Every attack event respects the to-hit rule.
    for (const e of a.log) {
      if (e.type !== 'attack') continue;
      const expectHit = e.roll === 20 ? true : e.roll === 1 ? false : e.roll! >= e.needed!;
      expect(e.hit).toBe(expectHit);
    }
    // If the goblins win, they bag the ogre's 90 XP.
    if (a.outcome === 'party') expect(a.xpAwarded).toBe(90);
  });
});
