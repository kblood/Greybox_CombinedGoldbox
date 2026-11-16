/**
 * CoK monster-record decoder tests (M2.S6 prerequisite).
 *
 * 1) Synthetic: framing, name length/padding, ability pairs, category map, HP, saves.
 * 2) Golden: real CoK MON1CHA.DAX — known monsters with verified HP/saves/abilities
 *    (Goblin, Red Dragon, Ogre, Hill Giant). Skips if data absent.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeMonsterRecord,
  decodeMonsterArchive,
  sniffMonsterRecord,
  monsterCombatant,
  MONSTER_RECORD_SIZE,
  COAB_MONSTER_RECORD_SIZE,
  POOL_MONSTER_RECORD_SIZE,
  SECRET_MONSTER_RECORD_SIZE,
  GATEWAY_MONSTER_RECORD_SIZE,
  TREASURES_MONSTER_RECORD_SIZE,
} from '../src/index.js';

function makeRecord(name: string, opts: Partial<{
  category: number;
  hp: number;
  abilities: [number, number, number, number, number, number];
  saves: [number, number, number, number, number];
  ac: number;
  thac0: number;
  hitDice: number;
  damage: [number, number, number]; // count, sides, bonus
  xp: number;
  rolledHp: number;
  perHpXp: number;
  iconSize: number; // raw byte at 207 (1 small, 130 = 128+2 large, …)
  moraleByte: number; // raw control_morale byte at 231 (128 + morale)
}> = {}): Uint8Array {
  const raw = new Uint8Array(MONSTER_RECORD_SIZE);
  raw[0] = name.length;
  for (let i = 0; i < name.length; i++) raw[1 + i] = name.charCodeAt(i);
  if (opts.iconSize !== undefined) raw[207] = opts.iconSize;
  if (opts.moraleByte !== undefined) raw[231] = opts.moraleByte;
  const ab = opts.abilities ?? [10, 10, 10, 10, 10, 10];
  for (let s = 0; s < 6; s++) {
    raw[16 + s * 2] = ab[s];
    raw[16 + s * 2 + 1] = ab[s]; // max = current
  }
  if (opts.thac0 !== undefined) raw[89] = 60 - opts.thac0; // inverted store
  raw[90] = opts.category ?? 7;
  raw[98] = opts.hp ?? 0;
  const sv = opts.saves ?? [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) raw[208 + i] = sv[i];
  if (opts.hitDice !== undefined) raw[214] = opts.hitDice;
  if (opts.damage) {
    raw[269] = opts.damage[0];
    raw[271] = opts.damage[1];
    raw[270] = opts.damage[2];
  }
  if (opts.ac !== undefined) raw[275] = 60 - opts.ac; // inverted store
  if (opts.xp !== undefined) {
    raw[304] = opts.xp & 0xff;
    raw[305] = (opts.xp >> 8) & 0xff;
  }
  if (opts.rolledHp !== undefined) raw[0x11b] = opts.rolledHp;
  if (opts.perHpXp !== undefined) raw[0x132] = opts.perHpXp;
  return raw;
}

function makeCoabRecord(name: string, opts: Partial<{
  hp: number;
  ac: number;
  thac0: number;
  damage: [number, number, number]; // count, sides, bonus
  xp: number;
  fieldDE: number;
}> = {}): Uint8Array {
  const raw = new Uint8Array(COAB_MONSTER_RECORD_SIZE);
  raw[0] = name.length;
  for (let i = 0; i < name.length; i++) raw[1 + i] = name.charCodeAt(i);
  raw[0x74] = 0; // Race.monster
  raw[0x11a] = 1; // monsterType
  raw[0xde] = opts.fieldDE ?? 1;
  raw[0x1a4] = opts.hp ?? 7;
  raw[0x199] = 60 - (opts.thac0 ?? 20);
  raw[0x19a] = 60 - (opts.ac ?? 5);
  const dmg = opts.damage ?? [1, 6, 0];
  raw[0x19e] = dmg[0];
  raw[0x1a0] = dmg[1];
  raw[0x1a2] = dmg[2] & 0xff;
  if (opts.xp !== undefined) {
    raw[0x127] = opts.xp & 0xff;
    raw[0x128] = (opts.xp >> 8) & 0xff;
    raw[0x129] = (opts.xp >> 16) & 0xff;
    raw[0x12a] = (opts.xp >> 24) & 0xff;
  }
  return raw;
}

describe('decodeMonsterRecord — synthetic', () => {
  it('parses name, category, hp, abilities, and saves', () => {
    const rec = decodeMonsterRecord(
      makeRecord('GOBLIN', {
        category: 7,
        hp: 4,
        abilities: [10, 12, 10, 14, 10, 8],
        saves: [16, 17, 18, 20, 19],
        ac: 6,
        thac0: 21,
        hitDice: 1,
        damage: [1, 6, 0],
        xp: 10,
        rolledHp: 7,
        perHpXp: 5,
      }),
      9,
    );
    expect(rec.blockId).toBe(9);
    expect(rec.name).toBe('GOBLIN');
    expect(rec.category).toBe('monster');
    expect(rec.hitPoints).toBe(4);
    expect(rec.abilities).toEqual({ str: 10, int: 12, wis: 10, dex: 14, con: 10, cha: 8 });
    expect(rec.savingThrows).toEqual({
      paralyzePoisonDeath: 16,
      petrifyPolymorph: 17,
      rodStaffWand: 18,
      breath: 20,
      spell: 19,
    });
    expect(rec.armorClass).toBe(6);
    expect(rec.thac0).toBe(21);
    expect(rec.hitDice).toBe(1);
    expect(rec.damage).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(rec.xp).toBe(10);
    expect(rec.rolledHp).toBe(7);
    expect(rec.perHpXp).toBe(5);
  });

  it('recovers a 16-bit XP award and negative (better-than-0) AC', () => {
    const rec = decodeMonsterRecord(makeRecord('RED DRAGON', { ac: -1, xp: 1950 }));
    expect(rec.armorClass).toBe(-1);
    expect(rec.xp).toBe(1950);
  });

  it('maps the category byte (7/6/5 → monster/humanoid/npc, else unknown)', () => {
    expect(decodeMonsterRecord(makeRecord('A', { category: 7 })).category).toBe('monster');
    expect(decodeMonsterRecord(makeRecord('A', { category: 6 })).category).toBe('humanoid');
    expect(decodeMonsterRecord(makeRecord('A', { category: 5 })).category).toBe('npc');
    expect(decodeMonsterRecord(makeRecord('A', { category: 0 })).category).toBe('unknown');
  });

  it('caps the name at 15 bytes and stops at a NUL', () => {
    const rec = decodeMonsterRecord(makeRecord('GIANT CENTIPEDE')); // exactly 15
    expect(rec.name).toBe('GIANT CENTIPEDE');
  });

  it('sniffs by size + sane name length and rejects junk', () => {
    expect(sniffMonsterRecord(makeRecord('OGRE'))).toBe(true);
    expect(sniffMonsterRecord(new Uint8Array(409))).toBe(false); // name len 0
    const coab = new Uint8Array(COAB_MONSTER_RECORD_SIZE);
    coab[0] = 1;
    coab[1] = 'A'.charCodeAt(0);
    expect(sniffMonsterRecord(coab)).toBe(true);
    expect(sniffMonsterRecord(new Uint8Array(100))).toBe(false); // wrong size
  });

  it('each half of the name check can reject on its own', () => {
    // The corpus sweep in `blockSniffScope.test.ts` cannot separate these two: every block the
    // name check rejects there (Pools of Darkness `CHEAD.DAX` ids 0..13, whose "name" begins
    // `03 00 ...`) trips BOTH clauses at once -- 0x03 is unprintable, and the NUL right after it
    // ends the scan with zero letters. Deleting either clause alone leaves that sweep green. So
    // the isolating cases have to be built, one property at a time, from a record that is
    // otherwise valid.
    expect(sniffMonsterRecord(makeRecord('OGRE'))).toBe(true);

    // Printable, and nothing else wrong -- but no letter anywhere. Only the letter clause rejects.
    expect(sniffMonsterRecord(makeRecord('12 34'))).toBe(false);

    // Has letters, and nothing else wrong -- but one byte is outside printable ASCII. The letter
    // clause is satisfied before the scan reaches it, so only the printable clause rejects.
    const highByte = makeRecord('OGREX');
    highByte[5] = 0x81; // the 'X'
    expect(sniffMonsterRecord(highByte)).toBe(false);

    // And the NUL is a terminator, not a rejection: a short name padded with NULs still passes.
    const padded = makeRecord('OGRE');
    padded[0] = 10; // claims 10 bytes of name; bytes 5..10 are already NUL
    expect(sniffMonsterRecord(padded)).toBe(true);
  });

  it('throws on a too-small record', () => {
    expect(() => decodeMonsterRecord(new Uint8Array(40))).toThrow(/too small/);
  });

  it('decodes combat-icon size (CT.7k-2, offset 207): 1 → Small, > 1 → Large', () => {
    const goblin = decodeMonsterRecord(makeRecord('GOBLIN', { iconSize: 1 }));
    const ogre = decodeMonsterRecord(makeRecord('OGRE', { iconSize: 130 }));
    const dragon = decodeMonsterRecord(makeRecord('RED DRAGON', { iconSize: 131 }));
    expect(goblin.combatSize).toBe(1);
    expect(goblin.coabSourceSize).toBe(1);
    expect(ogre.combatSize).toBe(2); // 128+2
    expect(ogre.coabSourceSize).toBe(2); // source footprint low bits, not collapsed size
    expect(dragon.combatSize).toBe(2); // 128+3
    expect(dragon.coabSourceSize).toBe(3);
    expect(decodeMonsterRecord(makeRecord('NObyte')).combatSize).toBe(1); // absent byte = 0 → Small
  });

  it('keeps source footprint low bits distinct from high-bit large-target combatSize', () => {
    const rec = decodeMonsterRecord(makeRecord('ODD LARGE', { iconSize: 129 }));
    expect(rec.combatSize).toBe(2);
    expect(rec.coabSourceSize).toBe(1);
  });

  it('decodes morale % (CT.7k-2, offset 231): (ctrl & 0x7F)·2 clamp 102, brave ≤ 0x7F → undefined', () => {
    // ctrl > 0x7F → checks morale.
    expect(decodeMonsterRecord(makeRecord('A', { moraleByte: 0x80 })).morale).toBe(0); // 128 + 0
    expect(decodeMonsterRecord(makeRecord('A', { moraleByte: 178 })).morale).toBe(100); // 128 + 50
    expect(decodeMonsterRecord(makeRecord('A', { moraleByte: 228 })).morale).toBe(102); // 128 + 100 → clamp
    // ctrl ≤ 0x7F → brave, never checks (undefined).
    expect(decodeMonsterRecord(makeRecord('A', { moraleByte: 0x7f })).morale).toBeUndefined();
    expect(decodeMonsterRecord(makeRecord('A')).morale).toBeUndefined(); // absent byte = 0
  });

  it('monsterCombatant carries the record morale + size (CT.7k-2)', () => {
    const ogre = decodeMonsterRecord(makeRecord('OGRE', { iconSize: 130, moraleByte: 228, hp: 18 }));
    const c = monsterCombatant(ogre, 'e0');
    expect(c.combatSize).toBe(2);
    expect(c.morale).toBe(102);
    // A small/brave monster carries Small + no morale (so the combat layer never breaks it).
    const rat = decodeMonsterRecord(makeRecord('GIANT RAT', { iconSize: 1, moraleByte: 0x40, hp: 2 }));
    const cr = monsterCombatant(rat, 'e1');
    expect(cr.combatSize).toBe(1);
    expect(cr.morale).toBeUndefined();
  });

  it('decodes and carries CoAB field_DE source footprint separately from tactical combatSize', () => {
    const rec = decodeMonsterRecord(makeCoabRecord('AZURE OGRE', { fieldDE: 0x84 }));
    expect(rec.combatSize).toBeUndefined();
    expect(rec.coabSourceSize).toBe(4);

    const c = monsterCombatant(rec, 'e0');
    expect(c.combatSize).toBeUndefined();
    expect(c.coabSourceSize).toBe(4);
  });
});

// --- Golden: real CoK MON1CHA.DAX (skips if data absent) --------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const monPath = resolve(here, '..', '..', '..', 'Champions of Krynn', 'MON1CHA.DAX');

describe('decodeMonsterArchive — golden CoK MON1CHA', () => {
  it.skipIf(!existsSync(monPath))('decodes known monsters with verified stats', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(monPath)));
    const by = (n: string) => mons.find((m) => m.name === n);

    expect(mons.length).toBe(26);

    const goblin = by('GOBLIN')!;
    expect(goblin.category).toBe('monster');
    expect(goblin.hitPoints).toBe(4);
    expect(goblin.savingThrows).toEqual({
      paralyzePoisonDeath: 16,
      petrifyPolymorph: 17,
      rodStaffWand: 18,
      breath: 20,
      spell: 19,
    });

    expect(by('RED DRAGON')!.hitPoints).toBe(33);
    expect(by('RED DRAGON')!.savingThrows!.paralyzePoisonDeath).toBe(7); // best saves
    expect(by('RED DRAGON')!.savingThrows!.spell).toBe(10); // M27.S1: feeds monsterSpellSave
    expect(by('HILL GIANT')!.abilities.str).toBe(19); // giant strength
    expect(by('OGRE')!.abilities.str).toBe(19);
    expect(by('GIANT RAT')!.abilities.int).toBe(3); // animal intellect
    expect(by('WARRIOR')!.category).toBe('humanoid');
    expect(by('KILDIRF')!.category).toBe('npc');

    // Combat block (AC=60−b275, THAC0=60−b89, HD@214, dmg 269d271+270, XP u16@304)
    expect(goblin.armorClass).toBe(6);
    expect(goblin.thac0).toBe(21);
    expect(goblin.hitDice).toBe(0); // 1−1 HD store
    expect(goblin.damage).toEqual({ count: 1, sides: 6, bonus: 0 }); // 1d6
    expect(goblin.xp).toBe(10);

    expect(by('OGRE')!.damage).toEqual({ count: 1, sides: 10, bonus: 0 }); // 1d10
    expect(by('OGRE')!.xp).toBe(90);
    expect(by('HILL GIANT')!.armorClass).toBe(4);
    expect(by('HILL GIANT')!.damage).toEqual({ count: 2, sides: 8, bonus: 0 }); // 2d8
    expect(by('HILL GIANT')!.xp).toBe(1400);
    expect(by('RED DRAGON')!.armorClass).toBe(-1);
    expect(by('RED DRAGON')!.xp).toBe(1950);
    expect(by('GIANT SNAKE')!.damage).toEqual({ count: 3, sides: 6, bonus: 0 }); // 3d6
    expect(by('GHOUL')!.damage).toEqual({ count: 1, sides: 3, bonus: 1 }); // 1d3+1

    // CT.7k-2 — combat-icon size byte (offset 207): big creatures decode Large (2×2), the rest Small.
    expect(by('OGRE')!.combatSize).toBe(2);
    expect(by('HILL GIANT')!.combatSize).toBe(2);
    expect(by('RED DRAGON')!.combatSize).toBe(2);
    expect(by('GOBLIN')!.combatSize).toBe(1);
    expect(by('GIANT RAT')!.combatSize).toBe(1);

    // CT.7k-2 — control_morale byte (offset 231, 128 + morale): OGRE high, undead mid, most 0.
    expect(by('OGRE')!.morale).toBe(102); // 228 = 128 + 100 → clamp
    expect(by('GHOUL')!.morale).toBe(100); // 178 = 128 + 50
    expect(by('SKELETON')!.morale).toBe(100); // 178
    expect(by('GOBLIN')!.morale).toBe(0); // 128 = 128 + 0 (still checks; breaks when wounded)
    expect(by('RED DRAGON')!.morale).toBe(0); // 128
  });
});

// --- Golden: real CoAB MON5CHA.DAX — 422-byte Player records (skips if data absent) ----------

const coabMon5Path = resolve(here, '..', '..', '..', 'coab_extracted', 'Data', 'MON5CHA.DAX');

describe('decodeMonsterArchive — golden CoAB MON5CHA (422-byte Player format)', () => {
  it.skipIf(!existsSync(coabMon5Path))('decodes block-50 combat monsters with CoAB runtime combat fields', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(coabMon5Path)));
    const by = (n: string) => mons.find((m) => m.name === n);

    expect(mons.length).toBe(13);
    for (const m of mons) expect(m.raw.length).toBe(COAB_MONSTER_RECORD_SIZE);

    const salamander = by('SALAMANDER')!;
    expect(salamander.blockId).toBe(57);
    expect(salamander.category).toBe('monster');
    expect(salamander.hitPoints).toBe(42);
    expect(salamander.thac0).toBe(15);
    expect(salamander.armorClass).toBe(3);
    expect(salamander.hitDice).toBe(8);
    expect(salamander.damage).toEqual({ count: 2, sides: 6, bonus: 0 });
    expect(salamander.savingThrows).toEqual({
      paralyzePoisonDeath: 10,
      petrifyPolymorph: 11,
      rodStaffWand: 12,
      breath: 12,
      spell: 13,
    });
    expect(salamander.morale).toBe(0);

    const darkElf = by('DK ELF FIGHTER')!;
    expect(darkElf.blockId).toBe(49);
    expect(darkElf.category).toBe('humanoid');
    expect(darkElf.hitPoints).toBe(38);
    expect(darkElf.thac0).toBe(16);
    expect(darkElf.armorClass).toBe(4);
    expect(darkElf.damage).toEqual({ count: 1, sides: 0, bonus: 0 }); // weapon-driven in the real record
    expect(darkElf.morale).toBe(0);

    const akabar = by('AKABAR BEL AKAS')!;
    expect(akabar.xp).toBe(21915); // CoAB stores XP as a 32-bit Player.exp field.
  });
});

const coabRetailMon2Path = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON2CHA.DAX';

describe('decodeMonsterArchive — retail CoAB MON2CHA', () => {
  it.skipIf(!existsSync(coabRetailMon2Path))('decodes the area-2 Troll used by the browser combat route', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(coabRetailMon2Path)));
    const troll = mons.find((m) => m.blockId === 7)!;

    expect(mons).toHaveLength(12);
    for (const m of mons) expect(m.raw).toHaveLength(COAB_MONSTER_RECORD_SIZE);
    expect(troll.name).toBe('TROLL');
    expect(troll.hitPoints).toBe(36);
    expect(troll.armorClass).toBe(4);
    expect(troll.thac0).toBe(13);
    expect(troll.hitDice).toBe(7);
    expect(troll.damage).toEqual({ count: 1, sides: 4, bonus: 4 });
    expect(troll.coabSourceSize).toBe(2);
    expect(troll.savingThrows?.spell).toBe(13);
  });
});

// --- Golden: real DoK MON1CHA.DAX — 216-byte compact records (skips if data absent) ----------

const dokMonPath = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'MON1CHA.DAX');

describe('decodeMonsterArchive — golden DoK MON1CHA (216-byte format)', () => {
  it.skipIf(!existsSync(dokMonPath))('decodes undead with verified AC/THAC0/damage', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(dokMonPath)));
    const by = (n: string) => mons.find((m) => m.name === n);

    // All 64 blocks are 216-byte monster records.
    expect(mons.length).toBe(64);
    for (const m of mons) expect(m.raw.length).toBe(216);

    // Canonical AD&D undead armour classes land exactly (AC = 60 − byte[95]).
    expect(by('NIGHTMARE')!.armorClass).toBe(-4);
    expect(by('LICH')!.armorClass).toBe(0);
    expect(by('WRAITH')!.armorClass).toBe(4);
    expect(by('WIGHT')!.armorClass).toBe(5);
    expect(by('SPECTRE')!.armorClass).toBe(2);

    // THAC0 (= 60 − byte[31]) and damage (byte[89] d byte[91] + byte[90]).
    expect(by('NIGHTMARE')!.thac0).toBe(13);
    expect(by('NIGHTMARE')!.damage).toEqual({ count: 2, sides: 4, bonus: 2 });
    expect(by('SKEL WARRIOR')!.damage).toEqual({ count: 1, sides: 12, bonus: 0 });
    expect(by('LICH')!.damage).toEqual({ count: 1, sides: 10, bonus: 3 });

    // Abilities share the CoK offset (16): the Vampire keeps its 18 strength.
    expect(by('VAMPIRE')!.abilities.str).toBe(18);
    // Category enum is the same (7 = monster) at the compact offset (32).
    expect(by('NIGHTMARE')!.category).toBe('monster');

    // RED DRAGON appears in both games; the 216-byte record yields the same AC as the CoK 409-byte one.
    expect(by('RED DRAGON')!.armorClass).toBe(-1);

    // B5 (this pass) — hp/saves/hitDice located by byte-correlation against real GOG DoK MON1CHA
    // records; see the DOK_LAYOUT / class-docstring comments in monster.ts for the full evidence.

    // hp @40 (mirrored @214 on 64/64 records, disambiguated from the ruled-out @108 impostor by the
    // SKOMP counter-example). Matches the AD&D-canon reference points given for this slice, plus the
    // CoK-cross-title SIVAK=27 anchor.
    expect(by('NIGHTMARE')!.hitPoints).toBe(33);
    expect(by('WRAITH')!.hitPoints).toBe(28);
    expect(by('WIGHT')!.hitPoints).toBe(21);
    expect(by('SIVAK')!.hitPoints).toBe(27); // exact match vs CoK's own SIVAK hp
    // SKOMP is the ONE record (of 64) where @108 (61) disagrees with the real hp @40/@214 mirror pair
    // (81) — the assertion that pins down @40 over @108. @108 is no longer "an impostor of unknown
    // purpose": it is the ROLLED hp that `calc_battle_exp` multiplies the per-HP XP byte against
    // (GAME.OVR:0x4CED reads `es:[di+0x6c]`), which is exactly why it can differ from base hp.
    expect(by('SKOMP')!.hitPoints).toBe(81);

    // saves @42-46: a structurally sane ascending 5-slot table on every record. DoK's GHOUL matches
    // CoK's GHOUL saves [14,15,16,16,17] on 4/5 (breath is a 1-point DoK rebalance).
    expect(by('GHOUL')!.savingThrows).toEqual({
      paralyzePoisonDeath: 14,
      petrifyPolymorph: 15,
      rodStaffWand: 16,
      breath: 17,
      spell: 17,
    });
    expect(by('WIGHT')!.savingThrows).toEqual({
      paralyzePoisonDeath: 11,
      petrifyPolymorph: 12,
      rodStaffWand: 13,
      breath: 13,
      spell: 14,
    });

    // hitDice @48: exact cross-title match vs CoK (GHOUL=2, SIVAK=6), populated on all 64 records
    // (unlike the @71 near-duplicate, which reads 0 for every classed humanoid/NPC record).
    expect(by('GHOUL')!.hitDice).toBe(2);
    expect(by('SIVAK')!.hitDice).toBe(6);
    expect(by('NIGHTMARE')!.hitDice).toBe(7);
    expect(by('WIGHT')!.hitDice).toBe(4);
    expect(by('WRAITH')!.hitDice).toBe(5);

    // xp @109..110 (u16 LE flat term) — LOCATED 2026-08-19 from GAME.OVR, not from statistics; the
    // per-HP multiplier lives at @111 and the full award is `xp + rec[111] * rec[108]`. The pin that
    // makes this more than a plausible offset is GHOUL: CoK's own MON1CHA carries (65, 2) at 304/306
    // and DoK carries (65, 2) at 109/111 — the flat term AND the multiplier agree across titles. In
    // DoK's GHOUL record `u16le == 65` occurs at offset 109 and nowhere else in the 216 bytes.
    expect(by('GHOUL')!.xp).toBe(65); // cross-title identical to CoK's GHOUL
    expect(by('SIVAK')!.xp).toBe(2000); // DoK re-costed this one (CoK: 350) — why the old dual-anchor sweep found nothing
    expect(by('NIGHTMARE')!.xp).toBe(600);
    expect(by('LICH')!.xp).toBe(10500);
    expect(by('WERETIGER')!.xp).toBe(525); // hand-authored 1e Monster Manual values, not a derived column
    expect(by('IRON GOLEM')!.xp).toBe(14550);
    // Populated on every record — a decoder reading the wrong offset would leave zeros behind.
    expect(mons.every((m) => m.xp > 0)).toBe(true);

    // CT.7k-3 — the compact record's icon-size (@41) and control_morale (@62) bytes ARE located (B2-style
    // correlation: 7/7 size agreement + 7/7 morale-gate vs the shared CoK monsters). Same decode as CoK.
    // Size (>1 = Large 2×2): dragons / giants / golems Large, undead-humanoids & NPCs Small.
    expect(by('RED DRAGON')!.combatSize).toBe(2); // @41 = 132 (128 + "big")
    expect(by('RED DRAGON')!.coabSourceSize).toBe(4); // low bits preserve source 2x2 footprint
    expect(by('NIGHTMARE')!.combatSize).toBe(2); // @41 = 131
    expect(by('NIGHTMARE')!.coabSourceSize).toBe(3);
    expect(by('ZOMBIE GIANT')!.combatSize).toBe(2); // @41 = 130
    expect(by('ZOMBIE GIANT')!.coabSourceSize).toBe(2);
    expect(by('IRON GOLEM')!.combatSize).toBe(2); // @41 = 130
    expect(by('HELLHOUND')!.combatSize).toBe(2); // @41 = 3 (raw "wide", still > 1)
    expect(by('HELLHOUND')!.coabSourceSize).toBe(3);
    expect(by('LICH')!.combatSize).toBe(1); // @41 = 1
    expect(by('LICH')!.coabSourceSize).toBe(1);
    expect(by('GHOUL')!.combatSize).toBe(1);
    expect(by('LORD SOTH')!.combatSize).toBe(1); // NPC = Small
    // Morale (128 + morale, gated > 0x7F): undead 178 → 100; dragons 128 → 0.
    expect(by('GHOUL')!.morale).toBe(100); // @62 = 178
    expect(by('WRAITH')!.morale).toBe(100); // @62 = 178
    expect(by('RED DRAGON')!.morale).toBe(0); // @62 = 128 (still checks; breaks when wounded)
    expect(by('NIGHTMARE')!.morale).toBe(0); // @62 = 128
  });
});

// --- Golden: real Pool MON1CHA.DAX — 285-byte early Gen1 records -----------------------------

const poolMonPath = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON1CHA.DAX';

describe('decodeMonsterArchive — golden Pool MON1CHA (285-byte format)', () => {
  it.skipIf(!existsSync(poolMonPath))('decodes Pool early-Gen1 combat-tail fields from real GOG data', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(poolMonPath)));
    const by = (n: string) => mons.find((m) => m.name === n);

    expect(mons.length).toBe(15);
    for (const m of mons) expect(m.raw.length).toBe(POOL_MONSTER_RECORD_SIZE);

    const goblin = by('GOBLIN GUARD')!;
    expect(goblin.blockId).toBe(2);
    expect(goblin.abilities).toEqual({ str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 });
    expect(goblin.hitPoints).toBe(4);
    expect(goblin.thac0).toBe(19);
    expect(goblin.armorClass).toBe(7);
    expect(goblin.hitDice).toBe(0);
    expect(goblin.damage).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(goblin.savingThrows).toEqual({
      paralyzePoisonDeath: 14,
      petrifyPolymorph: 15,
      rodStaffWand: 16,
      breath: 17,
      spell: 17,
    });
    expect(goblin.combatSize).toBe(1);

    const ogre = by('OGRE')!;
    expect(ogre.abilities.str).toBe(18);
    expect(ogre.hitPoints).toBe(21);
    expect(ogre.thac0).toBe(15);
    expect(ogre.armorClass).toBe(5);
    expect(ogre.hitDice).toBe(5);
    expect(ogre.damage).toEqual({ count: 1, sides: 10, bonus: 0 });
    expect(ogre.combatSize).toBe(2);
    expect(ogre.coabSourceSize).toBe(2);

    const vampire = by('VAMPIRE')!;
    expect(vampire.hitPoints).toBe(43);
    expect(vampire.armorClass).toBe(1);
    expect(vampire.damage).toEqual({ count: 1, sides: 6, bonus: 4 });
    expect(vampire.savingThrows?.spell).toBe(11);

    const fighter = by('6TH LVL FIGHTER')!;
    expect(fighter.abilities.cha).toBe(14);
    expect(fighter.thac0).toBe(13);
    expect(fighter.damage).toEqual({ count: 1, sides: 8, bonus: 2 });

    // XP, category, and control_morale are not located in Pool's 285-byte record yet.
    expect(ogre.xp).toBe(0);
    expect(ogre.category).toBe('unknown');
    expect(ogre.morale).toBeUndefined();
  });
});

// --- Golden: real Secret MON1CHA.DAX — 439-byte expanded Gen1 records -------------------------

const secretMonPath = 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX';

describe('decodeMonsterArchive — golden Secret MON1CHA (439-byte format)', () => {
  it.skipIf(!existsSync(secretMonPath))('decodes the expanded Secret combat-tail layout', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(secretMonPath)));
    const by = (n: string) => mons.find((m) => m.name === n);

    expect(mons.length).toBe(70);
    for (const m of mons) expect(m.raw.length).toBe(SECRET_MONSTER_RECORD_SIZE);

    const red = by('RED DRAGON')!;
    expect(red.blockId).toBe(5);
    expect(red.armorClass).toBe(-1);
    expect(red.thac0).toBe(10);
    expect(red.hitPoints).toBe(44);
    expect(red.hitDice).toBe(11);
    expect(red.damage).toEqual({ count: 1, sides: 8, bonus: 3 });
    expect(red.savingThrows).toEqual({
      paralyzePoisonDeath: 7,
      petrifyPolymorph: 8,
      rodStaffWand: 9,
      breath: 8,
      spell: 10,
    });
    expect(red.combatSize).toBe(2);
    expect(red.coabSourceSize).toBe(3);

    const hill = by('HILL GIANT')!;
    expect(hill.armorClass).toBe(4);
    expect(hill.thac0).toBe(12);
    expect(hill.hitPoints).toBe(38);
    expect(hill.damage).toEqual({ count: 2, sides: 8, bonus: 0 });
    expect(hill.combatSize).toBe(2);
    expect(hill.coabSourceSize).toBe(2);

    const sieglinda = by('SIEGLINDA')!;
    expect(sieglinda.category).toBe('humanoid');
    expect(sieglinda.armorClass).toBe(-7);
    expect(sieglinda.hitPoints).toBe(102);

    // XP and control_morale are not located in the 439-byte record yet; keep them honest.
    expect(red.xp).toBe(0);
    expect(red.morale).toBeUndefined();
  });
});

// --- Golden: ECL ADD_NPC (0x36) real-record join (M35.S1) --------------------

describe('monsterCombatant — golden ADD_NPC companion join (M35.S1)', () => {
  it.skipIf(!existsSync(dokMonPath))('DoK id 48 (SIR DRYDEN) joins the party side with the COAB morale override applied', async () => {
    const mons = decodeMonsterArchive(new Uint8Array(await readFile(dokMonPath)));
    const rec = mons.find((m) => m.blockId === 48)!;
    expect(rec).toBeDefined();
    expect(rec.name).toBe('SIR DRYDEN');
    // COAB CMD_AddNPC overwrites the record's own stored morale (60) with the ECL operand (100) —
    // the host applies this before constructing the combatant, exactly like explore.ts's `allies`.
    const c = monsterCombatant({ ...rec, morale: 100 }, 'n48', 'party');
    expect(c.side).toBe('party');
    expect(c.name).toBe('SIR DRYDEN');
    expect(c.morale).toBe(100); // not the record's own stored 60
  });
});

// --- Savage Frontier title-scoped layouts -----------------------------------

const gatewayMon2Path = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON2CHA.DAX';
const treasuresMon1Path = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1CHA.DAX';

describe('decodeMonsterArchive — Savage Frontier title-scoped records', () => {
  it.skipIf(!existsSync(gatewayMon2Path))('decodes Gateway route monster without applying CoAB tail offsets', async () => {
    const bytes = new Uint8Array(await readFile(gatewayMon2Path));
    const monsters = decodeMonsterArchive(bytes, 'gateway-to-the-savage-frontier');
    const squid = monsters.find((monster) => monster.blockId === 68)!;

    expect(monsters).toHaveLength(15);
    expect(squid.raw).toHaveLength(GATEWAY_MONSTER_RECORD_SIZE);
    expect(squid.name).toBe('GIANT SQUID');
    expect(squid.hitPoints).toBe(18);
    expect(squid.thac0).toBe(9);
    expect(squid.armorClass).toBe(7);
    expect(squid.damage).toEqual({ count: 1, sides: 2, bonus: 0 });
    expect(squid.coabSourceSize).toBe(4);
    expect(squid.combatSize).toBe(2);
    expect(squid.savingThrows).toEqual({
      paralyzePoisonDeath: 9,
      petrifyPolymorph: 10,
      rodStaffWand: 11,
      breath: 10,
      spell: 12,
    });
    expect(squid.hitDice).toBe(6);
    expect(squid.morale).toBe(80);
    expect(squid.xp).toBe(1);
    expect(monsters.find((monster) => monster.blockId === 60)?.xp).toBe(3005);
  });

  it.skipIf(!existsSync(treasuresMon1Path))('decodes Treasures 510-byte combat fields', async () => {
    const bytes = new Uint8Array(await readFile(treasuresMon1Path));
    const monsters = decodeMonsterArchive(bytes, 'treasures-of-the-savage-frontier');
    const guard = monsters.find((monster) => monster.blockId === 72)!;

    expect(monsters).toHaveLength(102);
    expect(guard.raw).toHaveLength(TREASURES_MONSTER_RECORD_SIZE);
    expect(guard.name).toBe('TRIBOAR GUARD');
    expect(guard.category).toBe('humanoid');
    expect(guard.hitPoints).toBe(12);
    expect(guard.thac0).toBe(14);
    expect(guard.armorClass).toBe(10);
    expect(guard.damage).toEqual({ count: 1, sides: 2, bonus: 0 });
    expect(guard.savingThrows).toEqual({
      paralyzePoisonDeath: 10,
      petrifyPolymorph: 11,
      rodStaffWand: 12,
      breath: 12,
      spell: 13,
    });
    expect(guard.hitDice).toBe(7);
    expect(guard.coabSourceSize).toBe(1);
    expect(guard.combatSize).toBe(1);
    expect(guard.morale).toBe(98);
    expect(guard.xp).toBe(0);
    expect(monsters.find((monster) => monster.blockId === 2)?.xp).toBe(17999);
    expect(monsters.find((monster) => monster.blockId === 1)?.category).toBe('monster');
  });
});

// R2, round 34. Buck Rogers' mon0cha.dax decompresses to 263-byte records, Matrix Cubed's
// MON0CHA.DAX to 259-byte records (round 33, docs/engine/research/buck-containers.md). This file's
// own doc comment (the `MonsterLayoutProfile` block above `layoutFor`) explains why NEITHER size
// gets a layout entry this round: MonsterLayout.ac/.thac0 are non-optional and AC/THAC0 were not
// located, despite the record family itself being identified (see
// packages/engine/src/loaders/buckSavedCharacter.ts and docs/engine/research/buck-record-layout.md
// for the save-side decode and the full cross-title evidence). These two cases pin that this stays
// an honest "not supported" rather than a silent nearest-size fit, and that decodeMorale — needed by
// buckSavedCharacter.ts — is exported.
describe('259/263-byte Buck Rogers / Matrix Cubed records — deliberately unmapped (R2, round 34)', () => {
  it('sniffMonsterRecord and layoutFor reject 259- and 263-byte records (no MonsterLayoutProfile claims them)', () => {
    const rec259 = new Uint8Array(259);
    rec259[0] = 4;
    rec259.set([0x5a, 0x41, 0x4e, 0x45], 1); // "ZANE" — name-plausible, size is the only reason to reject
    const rec263 = new Uint8Array(263);
    rec263[0] = 4;
    rec263.set([0x5a, 0x41, 0x4e, 0x45], 1);
    expect(sniffMonsterRecord(rec259)).toBe(false);
    expect(sniffMonsterRecord(rec263)).toBe(false);
    expect(() => decodeMonsterRecord(rec259)).toThrow();
    expect(() => decodeMonsterRecord(rec263)).toThrow();
  });

  it('exports decodeMorale for buckSavedCharacter.ts to reuse verbatim', async () => {
    const { decodeMorale } = await import('../src/loaders/monster.js');
    expect(typeof decodeMorale).toBe('function');
    expect(decodeMorale(new Uint8Array([0x94]), 0)).toBe(40); // (0x94 & 0x7f) * 2 = 40
    expect(decodeMorale(new Uint8Array([0x10]), 0)).toBeUndefined(); // <= 0x7F: never checks
  });
});
