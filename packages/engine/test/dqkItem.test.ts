/**
 * DQK item format + the ITEM content port (E3.2b).
 *
 *  1) Base-item catalogue: decode the real `DISK1/ITEMS.DAT` (16-byte `items.dat` records) and assert the
 *     documented weapon/armour stats (Battle Axe 1d8, Hand Axe 1d6 throwable, Dagger 1d4/1d3, Leather AC 8,
 *     Plate AC 3) — proves the field map against real bytes + AD&D canon.
 *  2) item.dat round-trip: `encodeDqkItemRecord` ∘ `decodeDqkItemRecord` is a fixed point (17 bytes).
 *  3) The port: real DoK `ITEM0.DAX` (17-byte records) → `portDokItemToDqk` → `decodeDqkItemRecord`
 *     reproduces every DoK field (base type / name codes / encumbrance / value / magic bonus / charges /
 *     ready / cursed) — a DoK item now loads through the DQK 18-byte item path, byte-for-byte.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeDqkBaseItem,
  decodeDqkItemsCatalogue,
  decodeDqkItemRecord,
  encodeDqkItemRecord,
  portDokItemToDqk,
  decodeDokItemArchive,
  DQK_BASE_ITEM_SIZE,
  DQK_ITEM_SIZE,
  type DqkItemRecord,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const itemsDatPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK1', 'ITEMS.DAT');
const dokItemPath = resolve(repoRoot, 'Death Knights of Krynn', 'ITEM0.DAX');

describe('decodeDqkBaseItem — synthetic field map', () => {
  it('reads damage dice vs L and vs S-M, melee flag, and body-armour AC', () => {
    // A made-up "scale mail" body record: carry=2, protection 185 → AC 3.
    const armor = new Uint8Array(DQK_BASE_ITEM_SIZE);
    armor[0] = 2; armor[6] = 185;
    const a = decodeDqkBaseItem(armor, 33);
    expect(a.carryLocation).toBe(2);
    expect(a.baseArmorClass).toBe(3);
    expect(a.meleeUsable).toBe(true);

    // A made-up dart: not melee-usable (byte8=128), 1d3 vs S-M.
    const dart = new Uint8Array(DQK_BASE_ITEM_SIZE);
    dart[8] = 128; dart[9] = 1; dart[10] = 3;
    const d = decodeDqkBaseItem(dart, 5);
    expect(d.meleeUsable).toBe(false);
    expect(d.damageVsSmall).toEqual({ count: 1, sides: 3, bonus: 0 });
    expect(d.baseArmorClass).toBeNull();
  });
});

describe('encodeDqkItemRecord — item.dat round-trip', () => {
  it('decode ∘ encode is a fixed point over all 17 bytes', () => {
    const item: DqkItemRecord = {
      index: 0,
      baseTypeId: 18, // Long Sword
      nameCodes: [40, 12, 0],
      encumbrance: 60,
      value: 1500,
      magicBonus: 2,
      secondaryCode: 0,
      ready: true,
      identifyMask: 0,
      cursed: false,
      bundleCount: 0,
      charges: 0,
      effectCode: 0,
      specialCode: 0,
      raw: new Uint8Array(0),
    };
    const bytes = encodeDqkItemRecord(item);
    expect(bytes.length).toBe(DQK_ITEM_SIZE);
    const back = decodeDqkItemRecord(bytes);
    expect(back.baseTypeId).toBe(18);
    expect(back.nameCodes).toEqual([40, 12, 0]);
    expect(back.value).toBe(1500);
    expect(back.magicBonus).toBe(2);
    expect(back.ready).toBe(true);
    expect(Array.from(encodeDqkItemRecord(back))).toEqual(Array.from(bytes));
  });
});

describe('decodeDqkItemsCatalogue — real DQK ITEMS.DAT', () => {
  it.skipIf(!existsSync(itemsDatPath))('matches the documented weapon/armour stats byte-exact', async () => {
    const cat = decodeDqkItemsCatalogue(new Uint8Array(await readFile(itemsDatPath)));
    expect(cat.length).toBe(128); // 2048 / 16

    const battleAxe = cat[1];
    expect(battleAxe.carryLocation).toBe(0); // weapon hand
    expect(battleAxe.damageVsSmall).toEqual({ count: 1, sides: 8, bonus: 0 }); // 1d8

    const handAxe = cat[2];
    expect(handAxe.damageVsLarge).toEqual({ count: 1, sides: 4, bonus: 0 }); // 1d4 vs L
    expect(handAxe.damageVsSmall).toEqual({ count: 1, sides: 6, bonus: 0 }); // 1d6 vs S-M
    expect(handAxe.missileType).toBe(0x14); // 20 = hand-held, can be thrown

    const dagger = cat[4];
    expect(dagger.damageVsLarge).toEqual({ count: 1, sides: 3, bonus: 0 });
    expect(dagger.damageVsSmall).toEqual({ count: 1, sides: 4, bonus: 0 });

    const leather = cat[31];
    expect(leather.carryLocation).toBe(2); // body
    expect(leather.baseArmorClass).toBe(8);

    const plate = cat[36];
    expect(plate.baseArmorClass).toBe(3);
  });
});

describe('portDokItemToDqk — real DoK ITEM0.DAX onto the DQK item path', () => {
  it.skipIf(!existsSync(dokItemPath))('a DoK item loads losslessly as a 17-byte item.dat record', async () => {
    const dokItems = decodeDokItemArchive(new Uint8Array(await readFile(dokItemPath)));
    expect(dokItems.length, 'ITEM0.DAX must hold DoK item records').toBeGreaterThan(0);

    for (const dok of dokItems.slice(0, 20)) {
      const bytes = portDokItemToDqk(dok);
      expect(bytes.length).toBe(DQK_ITEM_SIZE);
      const back = decodeDqkItemRecord(bytes);
      // Every field DoK carries survives the port byte-for-byte.
      expect(back.baseTypeId).toBe(dok.baseTypeId);
      expect(back.nameCodes).toEqual(dok.nameCodes);
      expect(back.encumbrance).toBe(dok.encumbrance);
      expect(back.value).toBe(dok.value);
      expect(back.magicBonus).toBe(dok.magicBonus);
      expect(back.charges).toBe(dok.charges);
      expect(back.ready).toBe(dok.ready);
      expect(back.cursed).toBe(dok.cursed);
      // The ported record IS the DoK record — same 17 bytes, nothing appended.
      expect(Array.from(bytes)).toEqual(Array.from(dok.raw.subarray(0, 17)));
    }
  });
});

/**
 * The stride itself, pinned to the shipped files rather than to the hackdocs.
 *
 * `DQK_ITEM_SIZE` was 18 until 2026-08-21. That is FRUA's stride, and the two games are easy to
 * confuse because they ship the SAME number of records — so a record count cannot tell them
 * apart, and only the file length can. FRUA is the null here: if the reasoning that produced 18
 * were sound, DQK's file would divide by 18 too. It does not, and FRUA's does not divide by 17.
 */
describe('DQK item.dat stride, against the shipped files', () => {
  const dqkItemDat = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK1', 'ITEM.DAT');
  const fruaItemDat = 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/DISK1/ITEM.DAT';

  it.skipIf(!existsSync(dqkItemDat))("DQK's own ITEM.DAT is an exact multiple of DQK_ITEM_SIZE", async () => {
    const n = (await readFile(dqkItemDat)).length;
    expect({ bytes: n, mod17: n % 17, mod18: n % 18 }).toEqual({ bytes: 4318, mod17: 0, mod18: 16 });
    expect(n % DQK_ITEM_SIZE).toBe(0);
    expect(n / DQK_ITEM_SIZE).toBe(254);
  });

  it.skipIf(!existsSync(dqkItemDat))('reads structurally at stride 17 across all 254 records', async () => {
    const buf = new Uint8Array(await readFile(dqkItemDat));
    const count = buf.length / DQK_ITEM_SIZE;
    let readySet = 0;
    const special = new Map<number, number>();
    for (let i = 0; i < count; i++) {
      const rec = decodeDqkItemRecord(buf.subarray(i * DQK_ITEM_SIZE, (i + 1) * DQK_ITEM_SIZE), i);
      if (rec.ready) readySet++;
      special.set(rec.specialCode, (special.get(rec.specialCode) ?? 0) + 1);
    }
    // `ready` is a per-instance runtime flag: zero in every record of a shipped catalogue.
    expect(readySet).toBe(0);
    // `specialCode`: 0 = "byte 15 is a spell", 128 = "special ability", 1..127 = scroll. A
    // misaligned stride scatters this byte across the record and destroys that grouping.
    expect(special.get(0)).toBe(224);
    expect(special.get(128)).toBe(22);
  });

  it.skipIf(!existsSync(fruaItemDat))('FRUA is the null: same record count, stride 18', async () => {
    const n = (await readFile(fruaItemDat)).length;
    expect({ bytes: n, mod17: n % 17, mod18: n % 18, records: n / 18 }).toEqual({
      bytes: 4572,
      mod17: 16,
      mod18: 0,
      records: 254,
    });
  });
});
