/**
 * Monster item / special side-tables (Gap G2) — parse + merge, proven on REAL CoK & DoK DAX bytes.
 *
 * The format + id-keying are taken from the COAB clean-room decompile (`ovr017.cs load_mob`): per area,
 * `MON{n}SPC.DAX` holds 9-byte Affect records and `MON{n}ITM.DAX` 63-byte Item records, both DAX-keyed
 * by the monster's block id (the SAME id as the `MON{n}CHA.DAX` block). The tests assert:
 *   1) synthetic field decode for both record kinds;
 *   2) every real CoK/DoK SPC block is a 9-multiple and ITM block a 63-multiple (the structural gate);
 *   3) the side-table ids are a subset of the bestiary (`MON{n}CHA`) ids — i.e. they really key by
 *      monster id, not by file order;
 *   4) the merge unions across disks and surfaces non-empty item/affect coverage;
 *   5) the build (`buildDqkGameDataMulti`) carries the side-tables and reports the manifest summary.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeMonsterAffect,
  decodeMonsterItem,
  decodeCompactMonsterItem,
  decodeMonsterSpcArchive,
  decodeMonsterItmArchive,
  mergeMonsterSideTables,
  mergeMonsterWizTables,
  decodeMonsterWizRecord,
  decodeMonsterWizArchive,
  exportMonsterWizSpellList,
  applyRegenAffect,
  REGEN_3_HP_AFFECT,
  applyHalfDamageAffect,
  HALF_DAMAGE_AFFECT,
  applyConSavingBonus,
  CON_SAVING_BONUS_AFFECT,
  conSpellSaveBonus,
  applyCloudProtectionAffects,
  ANIMATE_DEAD_AFFECT,
  CLOUD_PROTECT_85_AFFECT,
  PROTECT_MAGIC_AFFECT,
  applyItemPluses,
  applyCarriedItems,
  applyPreparedSpellIds,
  decodeMonsterArchive,
  monsterCombatant,
  buildDqkGameDataMulti,
  readDaxDataBlocks,
  MON_AFFECT_SIZE,
  MON_ITEM_SIZE,
  MON_COMPACT_ITEM_SIZE,
  MON_WIZ_RECORD_SIZE,
  type MonsterAffect,
  type MonsterItem,
  type MonsterRecord,
  type MonsterWizEntry,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const cok = (f: string) => resolve(repoRoot, 'Champions of Krynn', f);
const dok = (f: string) => resolve(repoRoot, 'Death Knights of Krynn', f);
const coab = (f: string) => resolve('C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds', f);

async function bytes(p: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(p));
}

describe('monster side-tables — synthetic field decode', () => {
  it('decodes a 9-byte affect (type/minutes/affect_data/callAffectTable)', () => {
    // 0x45 type, minutes=5 (05 00), affect_data=0xff, call=1, then 4 scratch bytes.
    const raw = Uint8Array.from([0x45, 0x05, 0x00, 0xff, 0x01, 0x11, 0x22, 0x33, 0x44]);
    const a = decodeMonsterAffect(raw);
    expect(a.type).toBe(0x45);
    expect(a.minutes).toBe(5);
    expect(a.affectData).toBe(0xff);
    expect(a.callAffectTable).toBe(true);
    expect(a.raw.length).toBe(MON_AFFECT_SIZE);
  });

  it('decodes a WIZ memorized-spell-list record (nonzero bytes -> spell slots, 0x80 = learning flag)', () => {
    const raw = new Uint8Array(MON_WIZ_RECORD_SIZE);
    raw[0] = 47; // Fireball
    raw[1] = 47; // Fireball again (2nd memorized casting)
    raw[2] = 0x80 | 15; // Magic Missile, still learning
    raw[73] = 21; // Sleep — last byte of the 74-byte spell-list region
    raw[74] = 99; // just past the spell-list region -> must NOT be decoded
    const e = decodeMonsterWizRecord(raw);
    expect(e.spells).toEqual([
      { spellId: 47, learning: false },
      { spellId: 47, learning: false },
      { spellId: 15, learning: true },
      { spellId: 21, learning: false },
    ]);
    expect(e.raw.length).toBe(MON_WIZ_RECORD_SIZE);
  });

  it('exportMonsterWizSpellList: round-trips through decodeMonsterWizRecord (BUILD-QUEUE P2.4)', () => {
    const raw = exportMonsterWizSpellList([47, 15, 47, 21]);
    expect(raw).toHaveLength(MON_WIZ_RECORD_SIZE);
    const e = decodeMonsterWizRecord(raw);
    // Sorted ascending, right-justified — matches the CONFIRMED real-save packing convention
    // (dok-chrdata-save-format.md §4.1). Duplicates (47 twice) are preserved as separate entries.
    expect(e.spells.map((s) => s.spellId)).toEqual([15, 21, 47, 47]);
    expect(e.spells.every((s) => !s.learning)).toBe(true);
  });

  it('exportMonsterWizSpellList: right-justifies into the 74-byte window, zero elsewhere', () => {
    const raw = exportMonsterWizSpellList([21]);
    expect(raw[73]).toBe(21); // last slot of the window
    expect(raw.slice(0, 73).every((b) => b === 0)).toBe(true);
    // Bytes 74..219 (the still-unresolved "known spell" table / tail) are always left zero.
    expect(raw.slice(74).every((b) => b === 0)).toBe(true);
  });

  it('exportMonsterWizSpellList([]) produces an all-zero record (a non-caster)', () => {
    const raw = exportMonsterWizSpellList([]);
    expect(raw.every((b) => b === 0)).toBe(true);
    expect(decodeMonsterWizRecord(raw).spells).toHaveLength(0);
  });

  it('exportMonsterWizSpellList throws when ids overflow the 74-byte window', () => {
    expect(() => exportMonsterWizSpellList(new Array(75).fill(1))).toThrow(/74-byte/);
  });

  it('decodes a 63-byte carried-item (type @0x2e, namenum @0x2f-31, value @0x3a, count @0x39)', () => {
    const raw = new Uint8Array(MON_ITEM_SIZE);
    raw[0x2e] = 18; // base type
    raw[0x2f] = 1;
    raw[0x30] = 2;
    raw[0x31] = 3; // namenum1/2/3
    raw[0x32] = 0xfe; // plus = -2 (signed)
    raw[0x34] = 1; // readied
    raw[0x37] = 0x80; // weight low
    raw[0x39] = 5; // count
    raw[0x3a] = 0x00;
    raw[0x3b] = 0x06; // value = 1536
    raw[0x3c] = 0x10; // affect_1
    const it = decodeMonsterItem(raw);
    expect(it.itemTypeId).toBe(18);
    expect(it.baseTypeId).toBe(18);
    expect(it.nameCodes).toEqual([1, 2, 3]);
    expect(it.plus).toBe(-2);
    expect(it.readied).toBe(true);
    expect(it.weight).toBe(0x80);
    expect(it.count).toBe(5);
    expect(it.value).toBe(1536);
    expect(it.affects).toEqual([0x10, 0, 0]);
  });

  it('decodes the Treasures compact 17-byte runtime-tail serialization', () => {
    const raw = Uint8Array.from([
      0x24, 0x10, 0x11, 0x12, 0xfe, 0x03, 0x01, 0x04, 0x01,
      0x34, 0x12, 0x05, 0x78, 0x56, 0xaa, 0xbb, 0xcc,
    ]);
    const item = decodeCompactMonsterItem(raw);
    expect(item.format).toBe('compact17');
    expect(item.raw).toHaveLength(MON_COMPACT_ITEM_SIZE);
    expect(item.itemTypeId).toBe(0x24);
    expect(item.baseTypeId).toBe(0x24);
    expect(item.nameCodes).toEqual([0x10, 0x11, 0x12]);
    expect(item.weight).toBe(0x1234);
    expect(item.value).toBe(0x5678);
    expect(item.plus).toBe(-2);
    expect(item.readied).toBe(true);
    expect(item.count).toBe(5);
    expect(item.affects).toEqual([0xaa, 0xbb, 0xcc]);
    expect(item.compact).toEqual({
      plusSave: 0x03,
      hiddenNamesFlag: 0x04,
      cursed: true,
    });
  });
});

const treasuresItmPath = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1ITM.DAX';

describe('Treasures compact MON1ITM side table', () => {
  it.skipIf(!existsSync(treasuresItmPath))('decodes all block-72 items by monster id and 17-byte boundaries', async () => {
    const archive = decodeMonsterItmArchive(await bytes(treasuresItmPath), 'treasures-of-the-savage-frontier');
    const items = archive.get(72)!;
    expect(archive.size).toBe(46);
    expect(items).toHaveLength(4);
    expect(items.every((item) => item.format === 'compact17' && item.raw.length === 17)).toBe(true);
    expect(items[0]).toMatchObject({
      baseTypeId: 0x24,
      nameCodes: [0, 0x2f, 0x24],
      plus: 0,
      weight: 450,
      count: 0,
      value: 80,
      readied: true,
      affects: [0, 0, 0],
    });
  });
});

function makeMonster(over: Partial<MonsterRecord> = {}): MonsterRecord {
  return {
    blockId: 1,
    name: 'TEST TROLL',
    category: 'monster',
    hitPoints: 42,
    abilities: { str: 18, int: 7, wis: 9, dex: 12, con: 16, cha: 6 },
    savingThrows: { paralyzePoisonDeath: 11, petrifyPolymorph: 12, rodStaffWand: 13, breath: 14, spell: 15 },
    armorClass: 3,
    thac0: 13,
    hitDice: 9,
    damage: { count: 3, sides: 8, bonus: -2 },
    xp: 3000,
    raw: new Uint8Array(0),
    ...over,
  };
}

const affect = (type: number): MonsterAffect => ({ type, minutes: 0, affectData: 0xff, callAffectTable: false, raw: new Uint8Array(9) });

describe('applyRegenAffect (M23.S2) — joins MON{n}SPC.DAX regen_3_hp onto MonsterRecord', () => {
  it('sets regenPerRound=3 on a monster whose side-table includes regen_3_hp', () => {
    const troll = makeMonster({ blockId: 5 });
    const spc = new Map<number, MonsterAffect[]>([[5, [affect(REGEN_3_HP_AFFECT)]]]);
    const [out] = applyRegenAffect([troll], spc);
    expect(out.regenPerRound).toBe(3);
    expect(out).not.toBe(troll); // returns a new record, doesn't mutate the input
    expect(troll.regenPerRound).toBeUndefined();
  });

  it('leaves a monster with a different (or no) affect unchanged', () => {
    const goblin = makeMonster({ blockId: 6 });
    const spc = new Map<number, MonsterAffect[]>([[6, [affect(0x18)]]]); // detect_invisibility, not regen
    const noTable = makeMonster({ blockId: 7 });
    const [withOther, withoutEntry] = applyRegenAffect([goblin, noTable], spc);
    expect(withOther.regenPerRound).toBeUndefined();
    expect(withoutEntry.regenPerRound).toBeUndefined();
  });

  it('real CoK/DoK MON{n}CHA + MON{n}SPC: every regen_3_hp monster gets regenPerRound=3, nobody else does', async () => {
    const chaHave = existsSync(cok('MON1CHA.DAX')) && existsSync(cok('MON1SPC.DAX'));
    if (!chaHave) return;
    const records = decodeMonsterArchive(await bytes(cok('MON1CHA.DAX')));
    const spc = decodeMonsterSpcArchive(await bytes(cok('MON1SPC.DAX')));
    const joined = applyRegenAffect(records, spc);
    const expectedIds = new Set([...spc.entries()].filter(([, a]) => a.some((x) => x.type === REGEN_3_HP_AFFECT)).map(([id]) => id));
    for (const r of joined) {
      if (expectedIds.has(r.blockId)) expect(r.regenPerRound, `monster ${r.blockId}`).toBe(3);
      else expect(r.regenPerRound, `monster ${r.blockId}`).toBeUndefined();
    }
  });
});

describe('applyHalfDamageAffect (M24.S1) — joins MON{n}SPC.DAX half_damage onto MonsterRecord', () => {
  it('sets halfDamage=true on a monster whose side-table includes half_damage', () => {
    const vampire = makeMonster({ blockId: 19, name: 'VAMPIRE' });
    const spc = new Map<number, MonsterAffect[]>([[19, [affect(HALF_DAMAGE_AFFECT)]]]);
    const [out] = applyHalfDamageAffect([vampire], spc);
    expect(out.halfDamage).toBe(true);
    expect(out).not.toBe(vampire); // returns a new record, doesn't mutate the input
    expect(vampire.halfDamage).toBeUndefined();
  });

  it('leaves a monster with a different (or no) affect unchanged', () => {
    const ghoul = makeMonster({ blockId: 22, name: 'GHOUL' });
    const spc = new Map<number, MonsterAffect[]>([[22, [affect(0x60)]]]); // owlbear_hug_check, not half_damage
    const noTable = makeMonster({ blockId: 23 });
    const [withOther, withoutEntry] = applyHalfDamageAffect([ghoul, noTable], spc);
    expect(withOther.halfDamage).toBeUndefined();
    expect(withoutEntry.halfDamage).toBeUndefined();
  });

  it('real DoK MON1CHA + MON1SPC: the VAMPIRE family (ids 19-21) gets halfDamage=true, GHOUL (22) does not', async () => {
    const chaHave = existsSync(dok('MON1CHA.DAX')) && existsSync(dok('MON1SPC.DAX'));
    if (!chaHave) return;
    const records = decodeMonsterArchive(await bytes(dok('MON1CHA.DAX')));
    const spc = decodeMonsterSpcArchive(await bytes(dok('MON1SPC.DAX')));
    const joined = applyHalfDamageAffect(records, spc);
    const expectedIds = new Set([19, 20, 21]);
    for (const r of joined) {
      if (expectedIds.has(r.blockId)) expect(r.halfDamage, `monster ${r.blockId} (${r.name})`).toBe(true);
      else expect(r.halfDamage, `monster ${r.blockId} (${r.name})`).toBeUndefined();
    }
    // Sanity: the expected ids are really present and really named the vampire family (not a fluke).
    const names = new Map(records.map((r) => [r.blockId, r.name]));
    expect(names.get(19)).toBe('VAMPIRE');
    expect(names.get(20)).toBe('VAMPIRE MAGE');
    expect(names.get(21)).toBe('VAMPIRE CLERIC');
    expect(names.get(22)).toBe('GHOUL');
  });
});

describe('applyItemPluses (M26.S1) — joins MON{n}ITM.DAX carried-item pluses onto MonsterRecord', () => {
  const item = (plus: number): MonsterItem => ({
    itemTypeId: 1, baseTypeId: 1, nameCodes: [0, 0, 0], plus, count: 1, value: 0, weight: 0, readied: false,
    affects: [0, 0, 0], raw: new Uint8Array(63),
  });

  it('sets itemPluses to the full per-item plus array (including zero/negative)', () => {
    const knight = makeMonster({ blockId: 64, name: 'SOLAMNIC KNIGHT' });
    const itm = new Map<number, MonsterItem[]>([[64, [item(0), item(-1), item(2)]]]);
    const [out] = applyItemPluses([knight], itm);
    expect(out.itemPluses).toEqual([0, -1, 2]);
    expect(out).not.toBe(knight); // returns a new record, doesn't mutate the input
    expect(knight.itemPluses).toBeUndefined();
  });

  it('leaves a monster with no MON{n}ITM.DAX entry unchanged', () => {
    const noTable = makeMonster({ blockId: 99 });
    const itm = new Map<number, MonsterItem[]>([[64, [item(1)]]]);
    const [out] = applyItemPluses([noTable], itm);
    expect(out.itemPluses).toBeUndefined();
  });

  it('real DoK MON1CHA + MON1ITM: SOLAMNIC KNIGHT (id 64) gets its real +1 item; a control id with no MON1ITM.DAX entry gets undefined', async () => {
    const chaHave = existsSync(dok('MON1CHA.DAX')) && existsSync(dok('MON1ITM.DAX'));
    if (!chaHave) return;
    const records = decodeMonsterArchive(await bytes(dok('MON1CHA.DAX')));
    const itm = decodeMonsterItmArchive(await bytes(dok('MON1ITM.DAX')));
    const joined = applyItemPluses(records, itm);
    const knight = joined.find((r) => r.blockId === 64)!;
    expect(knight.name).toBe('SOLAMNIC KNIGHT');
    expect(knight.itemPluses).toEqual([0, 0, 1]); // real bytes: 3 carried items, one +1
    // NIGHTMARE (id 0) is a real record with NO MON1ITM.DAX entry at all — a same-real-data negative control.
    const noItem = joined.find((r) => r.blockId === 0)!;
    expect(noItem.name).toBe('NIGHTMARE');
    expect(noItem.itemPluses).toBeUndefined();
  });
});

describe('applyCarriedItems (M29.S1) — joins MON{n}ITM.DAX carried-item identities onto MonsterRecord', () => {
  const item = (baseTypeId: number, count: number): MonsterItem => ({
    itemTypeId: baseTypeId, baseTypeId, nameCodes: [0, 0, 0], plus: 0, count, value: 0, weight: 0, readied: false,
    affects: [0, 0, 0], raw: new Uint8Array(63),
  });

  it('sets carriedItems to the full {baseTypeId, count} array, unfiltered (including ids outside BASE_ITEMS)', () => {
    const mage = makeMonster({ blockId: 38, name: 'BLACK ROBE MAGE' });
    const itm = new Map<number, MonsterItem[]>([[38, [item(5, 9), item(999, 1)]]]);
    const [out] = applyCarriedItems([mage], itm);
    expect(out.carriedItems).toEqual([
      { itemTypeId: 5, baseTypeId: 5, count: 9 },
      { itemTypeId: 999, baseTypeId: 999, count: 1 },
    ]);
    expect(out).not.toBe(mage); // returns a new record, doesn't mutate the input
    expect(mage.carriedItems).toBeUndefined();
  });

  it('leaves a monster with no MON{n}ITM.DAX entry unchanged', () => {
    const noTable = makeMonster({ blockId: 99 });
    const itm = new Map<number, MonsterItem[]>([[38, [item(5, 9)]]]);
    const [out] = applyCarriedItems([noTable], itm);
    expect(out.carriedItems).toBeUndefined();
  });

  it('real CoK MON1CHA + MON1ITM: BLACK ROBE MAGE (id 38) joins to its real Vial x9; RED DRAGON (id 21, no MON1ITM.DAX entry) stays undefined', async () => {
    const chaHave = existsSync(cok('MON1CHA.DAX')) && existsSync(cok('MON1ITM.DAX'));
    if (!chaHave) return;
    const records = decodeMonsterArchive(await bytes(cok('MON1CHA.DAX')));
    const itm = decodeMonsterItmArchive(await bytes(cok('MON1ITM.DAX')));
    const joined = applyCarriedItems(records, itm);
    const mage = joined.find((r) => r.blockId === 38)!;
    expect(mage.name).toBe('BLACK ROBE MAGE');
    expect(mage.carriedItems).toContainEqual({ itemTypeId: 5, baseTypeId: 5, count: 9 }); // real bytes: Vial x9
    // RED DRAGON (id 21) — the same id M27's audit golden-tested for .savingThrows — has no MON1ITM.DAX entry.
    const dragon = joined.find((r) => r.blockId === 21)!;
    expect(dragon.name).toBe('RED DRAGON');
    expect(dragon.carriedItems).toBeUndefined();
  });

  it('M30.S1: threads a nonzero MonsterItem.value through as carriedItems[].value; a zero value becomes undefined', () => {
    const mage = makeMonster({ blockId: 66, name: 'BLACK MAGE' });
    const withValue = (baseTypeId: number, count: number, value: number): MonsterItem => ({
      itemTypeId: baseTypeId, baseTypeId, nameCodes: [0, 0, 0], plus: 0, count, value, weight: 0, readied: false,
      affects: [0, 0, 0], raw: new Uint8Array(63),
    });
    const itm = new Map<number, MonsterItem[]>([[66, [withValue(15, 1, 900), withValue(5, 8, 0)]]]);
    const [out] = applyCarriedItems([mage], itm);
    expect(out.carriedItems).toEqual([
      { itemTypeId: 15, baseTypeId: 15, count: 1, value: 900 },
      { itemTypeId: 5, baseTypeId: 5, count: 8, value: undefined },
    ]);
  });

  it('real DoK MON1CHA + MON1ITM: BLACK MAGE (id 66) joins to its real value-900 Leather Armor + value-undefined Vial', async () => {
    const chaHave = existsSync(dok('MON1CHA.DAX')) && existsSync(dok('MON1ITM.DAX'));
    if (!chaHave) return;
    const records = decodeMonsterArchive(await bytes(dok('MON1CHA.DAX')));
    const itm = decodeMonsterItmArchive(await bytes(dok('MON1ITM.DAX')));
    const joined = applyCarriedItems(records, itm);
    const blackMage = joined.find((r) => r.blockId === 66)!;
    expect(blackMage.name).toBe('BLACK MAGE');
    // real Leather Armor: readied gear stores count 0 (worn, not stacked) — carried through as-is, unfiltered.
    expect(blackMage.carriedItems).toContainEqual({ itemTypeId: 15, baseTypeId: 15, count: 0, value: 900 });
    expect(blackMage.carriedItems).toContainEqual({ itemTypeId: 5, baseTypeId: 5, count: 8, value: undefined }); // real Vial, value 0 -> undefined
  });

  it.skipIf(!existsSync(coab('MON5CHA.DAX')) || !existsSync(coab('MON5ITM.DAX')))(
    'real CoAB DK ELF FIGHTER carries sunlight-vulnerable runtime item types 96 and 97',
    async () => {
      const records = decodeMonsterArchive(await bytes(coab('MON5CHA.DAX')));
      const itm = decodeMonsterItmArchive(await bytes(coab('MON5ITM.DAX')));
      const fighter = applyCarriedItems(records, itm).find((record) => record.blockId === 49)!;
      expect(fighter.name).toBe('DK ELF FIGHTER');
      expect(fighter.carriedItems?.map((item) => item.itemTypeId)).toEqual([73, 42, 97, 59, 96]);
      expect(fighter.carriedItems).toEqual(expect.arrayContaining([
        expect.objectContaining({ itemTypeId: 96, count: 0 }),
        expect.objectContaining({ itemTypeId: 97, count: 0 }),
      ]));
      expect(itm.get(51)).toEqual(expect.arrayContaining([
        expect.objectContaining({ itemTypeId: 94, plus: 3 }),
      ]));
    },
  );
});

describe('applyPreparedSpellIds (M31.S1) — joins MON{n}WIZ.DAX memorized spells onto MonsterRecord', () => {
  const wizEntry = (spellIds: number[]): MonsterWizEntry => ({
    spells: spellIds.map((spellId) => ({ spellId, learning: false })),
    raw: new Uint8Array(MON_WIZ_RECORD_SIZE),
  });

  it('sets preparedSpellIds to the raw spell-id list, unfiltered (including duplicates)', () => {
    const mage = makeMonster({ blockId: 97, name: 'MAGE' });
    const wiz = new Map<number, MonsterWizEntry>([[97, wizEntry([47, 32, 33, 34, 10, 15, 21])]]);
    const [out] = applyPreparedSpellIds([mage], wiz);
    expect(out.preparedSpellIds).toEqual([47, 32, 33, 34, 10, 15, 21]);
    expect(out).not.toBe(mage); // returns a new record, doesn't mutate the input
    expect(mage.preparedSpellIds).toBeUndefined();
  });

  it('leaves a monster with no MON{n}WIZ.DAX entry unchanged', () => {
    const noTable = makeMonster({ blockId: 99 });
    const wiz = new Map<number, MonsterWizEntry>([[97, wizEntry([47])]]);
    const [out] = applyPreparedSpellIds([noTable], wiz);
    expect(out.preparedSpellIds).toBeUndefined();
  });

  it('real DoK MON1CHA + MON1WIZ: monster id 97 (IGORF) joins to its real memorized list; a non-caster (id 9, UNDEAD BEAST) stays undefined', async () => {
    const chaHave = existsSync(dok('MON1CHA.DAX')) && existsSync(dok('MON1WIZ.DAX'));
    if (!chaHave) return;
    const records = decodeMonsterArchive(await bytes(dok('MON1CHA.DAX')));
    const wiz = decodeMonsterWizArchive(await bytes(dok('MON1WIZ.DAX')));
    const joined = applyPreparedSpellIds(records, wiz);
    const caster = joined.find((r) => r.blockId === 97)!;
    expect(caster.name).toBe('IGORF');
    expect(caster.preparedSpellIds).toEqual([47, 32, 33, 34, 10, 15, 21]);
    // id 9 (UNDEAD BEAST) is a real DoK monster id with no MON1WIZ.DAX entry — a real negative control.
    const nonCaster = joined.find((r) => r.blockId === 9)!;
    expect(nonCaster.name).toBe('UNDEAD BEAST');
    expect(nonCaster.preparedSpellIds).toBeUndefined();
  });
});

describe('conSpellSaveBonus (M28.S1) — COAB con_saving_bonus Con-band table', () => {
  it('matches every COAB band boundary exactly, closing at 20 (unlike the sibling conPoisonSaveBonus)', () => {
    expect(conSpellSaveBonus(3)).toBe(0);
    expect(conSpellSaveBonus(4)).toBe(1);
    expect(conSpellSaveBonus(6)).toBe(1);
    expect(conSpellSaveBonus(7)).toBe(2);
    expect(conSpellSaveBonus(10)).toBe(2);
    expect(conSpellSaveBonus(11)).toBe(3);
    expect(conSpellSaveBonus(13)).toBe(3);
    expect(conSpellSaveBonus(14)).toBe(4);
    expect(conSpellSaveBonus(17)).toBe(4);
    expect(conSpellSaveBonus(18)).toBe(5);
    expect(conSpellSaveBonus(20)).toBe(5);
    // Intentional divergence from conPoisonSaveBonus(21)===5 — con_saving_bonus's own table has no
    // band past 20, so a future refactor shouldn't "simplify" the two functions back into one.
    expect(conSpellSaveBonus(21)).toBe(0);
  });
});

describe('applyConSavingBonus (M28.S1) — joins MON{n}SPC.DAX con_saving_bonus onto MonsterRecord', () => {
  it('sets conSaveBonus from the Con-band table on a monster whose side-table includes con_saving_bonus', () => {
    const ghoul = makeMonster({ blockId: 7, name: 'GHOUL', abilities: { str: 12, int: 6, wis: 12, dex: 14, con: 10, cha: 6 } });
    const spc = new Map<number, MonsterAffect[]>([[7, [affect(CON_SAVING_BONUS_AFFECT)]]]);
    const [out] = applyConSavingBonus([ghoul], spc);
    expect(out.conSaveBonus).toBe(2); // Con 10 -> the 7-10 band
    expect(out).not.toBe(ghoul); // returns a new record, doesn't mutate the input
    expect(ghoul.conSaveBonus).toBeUndefined();
  });

  it('leaves a monster with the affect but a Con score outside every band unchanged', () => {
    const weak = makeMonster({ blockId: 8, abilities: { str: 10, int: 10, wis: 10, dex: 10, con: 2, cha: 10 } });
    const spc = new Map<number, MonsterAffect[]>([[8, [affect(CON_SAVING_BONUS_AFFECT)]]]);
    const [out] = applyConSavingBonus([weak], spc);
    expect(out.conSaveBonus).toBeUndefined();
  });

  it('leaves a monster with a different (or no) affect unchanged', () => {
    const goblin = makeMonster({ blockId: 9 });
    const spc = new Map<number, MonsterAffect[]>([[9, [affect(0x60)]]]); // owlbear_hug_check, not con_saving_bonus
    const noTable = makeMonster({ blockId: 10 });
    const [withOther, withoutEntry] = applyConSavingBonus([goblin, noTable], spc);
    expect(withOther.conSaveBonus).toBeUndefined();
    expect(withoutEntry.conSaveBonus).toBeUndefined();
  });

  it('real CoK MON1CHA + MON1SPC: GHOUL (id 7) gets conSaveBonus=2; GOBLIN (id 9) and RED DRAGON (id 21) — real negative controls with no con_saving_bonus affect — get undefined', async () => {
    const chaHave = existsSync(cok('MON1CHA.DAX')) && existsSync(cok('MON1SPC.DAX'));
    if (!chaHave) return;
    const records = decodeMonsterArchive(await bytes(cok('MON1CHA.DAX')));
    const spc = decodeMonsterSpcArchive(await bytes(cok('MON1SPC.DAX')));
    const joined = applyConSavingBonus(records, spc);
    const ghoul = joined.find((r) => r.blockId === 7)!;
    expect(ghoul.name).toBe('GHOUL');
    expect(ghoul.conSaveBonus).toBe(2);
    const goblin = joined.find((r) => r.blockId === 9)!;
    expect(goblin.name).toBe('GOBLIN');
    expect(goblin.conSaveBonus).toBeUndefined();
    const dragon = joined.find((r) => r.blockId === 21)!;
    expect(dragon.name).toBe('RED DRAGON');
    expect(dragon.conSaveBonus).toBeUndefined();
  });
});

describe('applyCloudProtectionAffects — joins source-shaped CoAB cloud gate affects onto MonsterRecord', () => {
  it('maps protect_magic to noxious/poisonous entry gates but not post-entry exposure immunity', () => {
    const mage = makeMonster({ blockId: 11, name: 'PROTECTED MAGE' });
    const spc = new Map<number, MonsterAffect[]>([[11, [affect(PROTECT_MAGIC_AFFECT)]]]);
    const [out] = applyCloudProtectionAffects([mage], spc);
    expect(out.noxiousCloudEntryImmune).toBe(true);
    expect(out.poisonCloudEntryImmune).toBe(true);
    expect(out.noxiousCloudExposureImmune).toBeUndefined();
    expect(out.poisonCloudExposureImmune).toBeUndefined();
    expect(mage.noxiousCloudEntryImmune).toBeUndefined();
  });

  it('maps animate_dead to noxious entry and noxious exposure gates only', () => {
    const skeleton = makeMonster({ blockId: 12, name: 'SKELETON' });
    const spc = new Map<number, MonsterAffect[]>([[12, [affect(ANIMATE_DEAD_AFFECT)]]]);
    const [out] = applyCloudProtectionAffects([skeleton], spc);
    expect(out.noxiousCloudEntryImmune).toBe(true);
    expect(out.noxiousCloudExposureImmune).toBe(true);
    expect(out.poisonCloudEntryImmune).toBeUndefined();
  });

  it('maps affect_85 to poisonous entry gate only', () => {
    const protectedFoe = makeMonster({ blockId: 13 });
    const spc = new Map<number, MonsterAffect[]>([[13, [affect(CLOUD_PROTECT_85_AFFECT)]]]);
    const [out] = applyCloudProtectionAffects([protectedFoe], spc);
    expect(out.poisonCloudEntryImmune).toBe(true);
    expect(out.noxiousCloudEntryImmune).toBeUndefined();
    expect(out.noxiousCloudExposureImmune).toBeUndefined();
  });

  it('monsterCombatant carries joined cloud-protection gates into combat', () => {
    const protectedFoe = makeMonster({ blockId: 16 });
    const spc = new Map<number, MonsterAffect[]>([[16, [affect(PROTECT_MAGIC_AFFECT)]]]);
    const [joined] = applyCloudProtectionAffects([protectedFoe], spc);
    const c = monsterCombatant(joined, 'e0');
    expect(c.noxiousCloudEntryImmune).toBe(true);
    expect(c.poisonCloudEntryImmune).toBe(true);
    expect(c.noxiousCloudExposureImmune).toBeUndefined();
  });

  it('leaves unrelated affects and missing side-table entries unchanged', () => {
    const unrelated = makeMonster({ blockId: 14 });
    const missing = makeMonster({ blockId: 15 });
    const spc = new Map<number, MonsterAffect[]>([[14, [affect(CON_SAVING_BONUS_AFFECT)]]]);
    const [withOther, withoutEntry] = applyCloudProtectionAffects([unrelated, missing], spc);
    expect(withOther.noxiousCloudEntryImmune).toBeUndefined();
    expect(withOther.poisonCloudEntryImmune).toBeUndefined();
    expect(withoutEntry.noxiousCloudEntryImmune).toBeUndefined();
  });
});

interface Game {
  name: string;
  cha: string[];
  itm: string[];
  spc: string[];
  loc: (f: string) => string;
}
const COK: Game = {
  name: 'CoK',
  cha: ['MON1CHA.DAX', 'MON2CHA.DAX', 'MON3CHA.DAX'],
  itm: ['MON1ITM.DAX', 'MON2ITM.DAX', 'MON3ITM.DAX'],
  spc: ['MON1SPC.DAX', 'MON2SPC.DAX', 'MON3SPC.DAX'],
  loc: cok,
};
const DOK: Game = {
  name: 'DoK',
  cha: ['MON1CHA.DAX'],
  itm: ['MON1ITM.DAX'],
  spc: ['MON1SPC.DAX'],
  loc: dok,
};

function have(g: Game): boolean {
  return [...g.cha, ...g.itm, ...g.spc].every((f) => existsSync(g.loc(f)));
}

for (const g of [COK, DOK]) {
  describe(`monster side-tables — real ${g.name} bytes`, () => {
    it.skipIf(!have(g))('SPC blocks are 9-multiples, ITM blocks are 63-multiples (structural gate)', async () => {
      for (const f of g.spc) {
        for (const b of readDaxDataBlocks(await bytes(g.loc(f)))) {
          expect(b.raw.length % MON_AFFECT_SIZE, `${f} block ${b.blockId}`).toBe(0);
        }
      }
      for (const f of g.itm) {
        for (const b of readDaxDataBlocks(await bytes(g.loc(f)))) {
          expect(b.raw.length % MON_ITEM_SIZE, `${f} block ${b.blockId}`).toBe(0);
        }
      }
    });

    it.skipIf(!have(g))('side-table ids key by monster id (subset of MON{n}CHA ids)', async () => {
      // Per area, every ITM/SPC block id must be a real monster id in that area's bestiary.
      for (let i = 0; i < g.cha.length; i++) {
        const chaIds = new Set(readDaxDataBlocks(await bytes(g.loc(g.cha[i]))).map((b) => b.blockId));
        for (const id of decodeMonsterItmArchive(await bytes(g.loc(g.itm[i]))).keys()) {
          expect(chaIds.has(id), `${g.itm[i]} id ${id} is a ${g.cha[i]} monster`).toBe(true);
        }
        for (const id of decodeMonsterSpcArchive(await bytes(g.loc(g.spc[i]))).keys()) {
          expect(chaIds.has(id), `${g.spc[i]} id ${id} is a ${g.cha[i]} monster`).toBe(true);
        }
      }
    });

    it.skipIf(!have(g))('merge unions side-tables across all disks with non-empty coverage', async () => {
      const itm = await Promise.all(g.itm.map((f) => bytes(g.loc(f))));
      const spc = await Promise.all(g.spc.map((f) => bytes(g.loc(f))));
      const merged = mergeMonsterSideTables(itm, spc);
      expect(merged.length, `${g.name} has monsters with side-tables`).toBeGreaterThan(0);
      // ids sorted ascending, unique.
      const ids = merged.map((m) => m.id);
      expect([...ids].sort((a, b) => a - b)).toEqual(ids);
      expect(new Set(ids).size).toBe(ids.length);
      // At least one monster carries items and at least one carries an affect (verified true on both games).
      expect(merged.some((m) => m.items.length > 0), `${g.name} some monster carries items`).toBe(true);
      expect(merged.some((m) => m.affects.length > 0), `${g.name} some monster has specials`).toBe(true);
      // Every entry has at least one of the two tables (empty-empty entries are not produced).
      expect(merged.every((m) => m.items.length > 0 || m.affects.length > 0)).toBe(true);
    });

    it.skipIf(!have(g))('buildDqkGameDataMulti carries side-tables + manifest summary (Gap G2)', async () => {
      const itm = await Promise.all(g.itm.map((f) => bytes(g.loc(f))));
      const spc = await Promise.all(g.spc.map((f) => bytes(g.loc(f))));
      const cha = await Promise.all(g.cha.map((f) => bytes(g.loc(f))));
      const game = buildDqkGameDataMulti({ geo: [], mon: cha, ecl: [], itm, spc });
      expect(game.monsterSideTables.length).toBeGreaterThan(0);
      const s = game.manifest.sideTables;
      expect(s.withItems).toBeGreaterThan(0);
      expect(s.withAffects).toBeGreaterThan(0);
      expect(s.totalItems).toBeGreaterThanOrEqual(s.withItems);
      expect(s.totalAffects).toBeGreaterThanOrEqual(s.withAffects);
      // The summary counts match the carried tables exactly.
      expect(s.withItems).toBe(game.monsterSideTables.filter((m) => m.items.length > 0).length);
      expect(s.totalItems).toBe(game.monsterSideTables.reduce((n, m) => n + m.items.length, 0));
      // Side-table monster ids are bestiary ids (the build merged MON{n}CHA too).
      const monIds = new Set(game.manifest.merge!.monIdsPerDisk.flat());
      for (const m of game.monsterSideTables) expect(monIds.has(m.id), `side id ${m.id} in bestiary`).toBe(true);
    });

    it.skipIf(!have(g))('omitting side-table archives leaves the summary zeroed (back-compat)', async () => {
      const cha = await Promise.all(g.cha.map((f) => bytes(g.loc(f))));
      const game = buildDqkGameDataMulti({ geo: [], mon: cha, ecl: [] });
      expect(game.monsterSideTables).toEqual([]);
      expect(game.monsterWizTables).toEqual([]);
      expect(game.manifest.sideTables).toEqual({
        withItems: 0,
        withAffects: 0,
        totalItems: 0,
        totalAffects: 0,
        withSpells: 0,
        totalSpells: 0,
      });
    });
  });
}

// `MON1WIZ.DAX` — DoK-only monster spellbook/memorization side-table (decompile-mon1wiz).
// See docs/engine/research/decompile-mon1wiz.md for the full reverse-engineering writeup.
describe('MON1WIZ.DAX — DoK monster spellbook side-table (decompile-mon1wiz)', () => {
  const wizPath = dok('MON1WIZ.DAX');
  const chaPath = dok('MON1CHA.DAX');
  const haveWiz = existsSync(wizPath) && existsSync(chaPath);

  it.skipIf(!haveWiz)('every block is exactly one 220-byte record (structural gate)', async () => {
    for (const b of readDaxDataBlocks(await bytes(wizPath))) {
      expect(b.raw.length, `block ${b.blockId}`).toBe(MON_WIZ_RECORD_SIZE);
    }
  });

  it.skipIf(!haveWiz)('WIZ block ids are a subset of MON1CHA monster ids (id-keyed, like SPC/ITM)', async () => {
    const chaIds = new Set(readDaxDataBlocks(await bytes(chaPath)).map((b) => b.blockId));
    for (const id of decodeMonsterWizArchive(await bytes(wizPath)).keys()) {
      expect(chaIds.has(id), `MON1WIZ.DAX id ${id} is a MON1CHA monster`).toBe(true);
    }
  });

  it.skipIf(!haveWiz)('every memorized spell id falls in the real DoK spell range 1-126 (SPELBOOK.TXT)', async () => {
    const wiz = decodeMonsterWizArchive(await bytes(wizPath));
    expect(wiz.size).toBeGreaterThan(0);
    let totalSpells = 0;
    for (const [id, entry] of wiz) {
      expect(entry.spells.length, `monster ${id} has a memorized-spell list`).toBeGreaterThan(0);
      for (const s of entry.spells) {
        expect(s.spellId, `monster ${id} spell id`).toBeGreaterThanOrEqual(1);
        expect(s.spellId, `monster ${id} spell id`).toBeLessThanOrEqual(126);
      }
      totalSpells += entry.spells.length;
    }
    expect(totalSpells).toBeGreaterThan(0);
  });

  it.skipIf(!haveWiz)('spot-check: monster id 97 memorizes the exact mage spell list [47,32,33,34,10,15,21]', async () => {
    // Fireball, Mirror Image, Ray of Enfeeblement, Stinking Cloud, Charm Person, Magic Missile, Sleep —
    // verified by hand against hackdocs_extracted/SPELBOOK.TXT's numbered spell table.
    const wiz = decodeMonsterWizArchive(await bytes(wizPath));
    const entry = wiz.get(97);
    expect(entry).toBeDefined();
    expect(entry!.spells.map((s) => s.spellId)).toEqual([47, 32, 33, 34, 10, 15, 21]);
    expect(entry!.spells.every((s) => !s.learning)).toBe(true);
  });

  it.skipIf(!haveWiz)('mergeMonsterWizTables unions per-disk archives (last disk wins on a duplicate id)', async () => {
    const raw = await bytes(wizPath);
    const merged = mergeMonsterWizTables([raw]);
    const direct = decodeMonsterWizArchive(raw);
    expect(merged.size).toBe(direct.size);
    for (const [id, entry] of direct) {
      expect(merged.get(id)?.spells.map((s) => s.spellId)).toEqual(entry.spells.map((s) => s.spellId));
    }
    // Feeding the same archive twice keeps the same (last-wins) table — deterministic union.
    expect(mergeMonsterWizTables([raw, raw]).size).toBe(direct.size);
    expect(mergeMonsterWizTables([]).size).toBe(0);
  });

  it.skipIf(!haveWiz)('buildDqkGameDataMulti carries the WIZ tables + manifest spell summary (audit gap 3)', async () => {
    // The DoK M4 build audit (cok-content-port-plan.md §9 gap 3): DqkGameInput{,Multi} had no `wiz`
    // field, so DoK caster monsters lost their memorized-spell data in the DOS-port assembly. This
    // exercises the exact assembly path tools/build-dqk-dir.mts calls.
    const [cha, wizRaw] = await Promise.all([bytes(chaPath), bytes(wizPath)]);
    const game = buildDqkGameDataMulti({ geo: [], mon: [cha], ecl: [], wiz: [wizRaw] });
    const direct = decodeMonsterWizArchive(wizRaw);
    expect(game.monsterWizTables.length).toBe(direct.size); // all 14 DoK area-1 casters carried
    // Sorted by id, ids unique, every table belongs to a real bestiary monster.
    const ids = game.monsterWizTables.map((w) => w.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    const monIds = new Set(game.manifest.merge!.monIdsPerDisk.flat());
    for (const w of game.monsterWizTables) {
      expect(monIds.has(w.id), `wiz id ${w.id} in bestiary`).toBe(true);
      expect(w.entry.spells.map((s) => s.spellId)).toEqual(direct.get(w.id)!.spells.map((s) => s.spellId));
    }
    // Manifest summary matches the carried tables exactly.
    const s = game.manifest.sideTables;
    expect(s.withSpells).toBe(game.monsterWizTables.filter((w) => w.entry.spells.length > 0).length);
    expect(s.totalSpells).toBe(game.monsterWizTables.reduce((n, w) => n + w.entry.spells.length, 0));
    expect(s.withSpells).toBeGreaterThan(0);
    expect(s.totalSpells).toBeGreaterThan(s.withSpells); // casters memorize multiple spells
  });
});
