import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRUA_BASE_ITEM_RECORD_COUNT,
  FRUA_BASE_ITEM_RECORD_SIZE,
  FRUA_ITEM_DAT_SIZE,
  FRUA_ITEM_RECORD_COUNT,
  FRUA_ITEM_RECORD_SIZE,
  FRUA_ITEMS_DAT_SIZE,
  FRUA_ITEM_VOCAB,
  decodeFruaBaseItemRecord,
  decodeFruaItemCatalogue,
  decodeFruaItemDat,
  decodeFruaItemRecord,
  decodeFruaItemsDat,
  fruaItemNameFromCodes,
  requireFruaItem,
} from '../src/module/frua/items.js';

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

function putU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >>> 8;
}

describe('FRUA ITEM.DAT / ITEMS.DAT decoder', () => {
  it('uses the FRUA vocabulary, concealment bits, and exact source fields', () => {
    const raw = new Uint8Array(FRUA_ITEM_RECORD_SIZE);
    raw[0] = 47;
    raw[1] = 104; // Invisibility (displayed last)
    raw[2] = 90; // of
    raw[3] = 53; // Potion (displayed first)
    putU16(raw, 4, 20);
    putU16(raw, 6, 100);
    raw[8] = 1;
    raw[11] = 6; // hide byte2 + byte1, retaining only Potion
    raw[14] = 1;
    raw[15] = 97;

    const item = decodeFruaItemRecord(raw, 246);
    expect(FRUA_ITEM_VOCAB[30]).toBe('Arrow');
    expect(fruaItemNameFromCodes([18, 112, 0])).toBe('Long Sword +2');
    expect(item).toMatchObject({
      id: 246,
      baseTypeId: 47,
      nameCodes: [53, 90, 104],
      name: 'Potion of Invisibility',
      unidentifiedName: 'Potion',
      weightCoins: 20,
      valuePlatinum: 100,
      magicBonus: 1,
      secondaryCode: 0,
      ready: false,
      identifyMask: 6,
      cursed: false,
      bundleCount: 0,
      charges: 1,
      effectCode: 97,
      specialCode: 0,
      reserved: 0,
    });
    expect(item.raw).toEqual(raw);
    expect(item.raw).not.toBe(raw);
  });

  it('uses one-based ITEM.DAT offsets and zero-based ITEMS.DAT offsets', () => {
    const itemDat = new Uint8Array(FRUA_ITEM_DAT_SIZE);
    const itemsDat = new Uint8Array(FRUA_ITEMS_DAT_SIZE);

    const itemTwo = itemDat.subarray(FRUA_ITEM_RECORD_SIZE, FRUA_ITEM_RECORD_SIZE * 2);
    itemTwo[0] = 30;
    itemTwo[2] = 112;
    itemTwo[3] = 30;
    itemTwo[11] = 6;
    itemTwo[13] = 10;

    const arrowBaseOffset = 30 * FRUA_BASE_ITEM_RECORD_SIZE;
    const arrowBase = itemsDat.subarray(arrowBaseOffset, arrowBaseOffset + FRUA_BASE_ITEM_RECORD_SIZE);
    arrowBase.set([10, 0, 1, 6, 0, 2, 0, 1, 0, 1, 6, 0, 22, 236, 18, 0]);

    const catalogue = decodeFruaItemCatalogue(itemDat, itemsDat);
    expect(catalogue.byId.size).toBe(FRUA_ITEM_RECORD_COUNT);
    expect(catalogue.baseById.size).toBe(FRUA_BASE_ITEM_RECORD_COUNT);
    expect(requireFruaItem(catalogue, 1).baseTypeId).toBe(0);
    expect(requireFruaItem(catalogue, 2)).toMatchObject({
      id: 2,
      baseTypeId: 30,
      name: 'Arrow +2',
      unidentifiedName: 'Arrow',
      bundleCount: 10,
      base: {
        id: 30,
        name: 'Arrow(s)',
        carryLocation: 10,
        damageVsLarge: { count: 1, sides: 6, bonus: 0 },
        rateOfFire: 2,
        damageVsSmall: { count: 1, sides: 6, bonus: 0 },
        range: 22,
        classMask: 236,
        missileType: 18,
      },
    });
  });

  it('rejects truncation, trailing bytes, reserved-byte drift, and out-of-range ids/codes', () => {
    expect(() => decodeFruaItemDat(new Uint8Array(FRUA_ITEM_DAT_SIZE - 1))).toThrow(
      /ITEM\.DAT: expected 4572 bytes, got 4571/,
    );
    expect(() => decodeFruaItemDat(new Uint8Array(FRUA_ITEM_DAT_SIZE + 1))).toThrow(
      /ITEM\.DAT: expected 4572 bytes, got 4573/,
    );
    expect(() => decodeFruaItemsDat(new Uint8Array(FRUA_ITEMS_DAT_SIZE - 1))).toThrow(
      /ITEMS\.DAT: expected 2048 bytes, got 2047/,
    );
    expect(() => decodeFruaBaseItemRecord(new Uint8Array(FRUA_BASE_ITEM_RECORD_SIZE), 128)).toThrow(
      /base item id 128 is outside 0\.\.127/,
    );
    expect(() => decodeFruaItemRecord(new Uint8Array(FRUA_ITEM_RECORD_SIZE), 0)).toThrow(
      /item id 0 is outside 1\.\.254/,
    );
    expect(() => decodeFruaItemRecord(new Uint8Array(FRUA_ITEM_RECORD_SIZE), 255)).toThrow(
      /item id 255 is outside 1\.\.254/,
    );

    const badBase = new Uint8Array(FRUA_ITEM_RECORD_SIZE);
    badBase[0] = 128;
    expect(() => decodeFruaItemRecord(badBase, 1)).toThrow(/base item pointer 128 is outside 0\.\.127/);
    const badName = new Uint8Array(FRUA_ITEM_RECORD_SIZE);
    badName[3] = FRUA_ITEM_VOCAB.length;
    expect(() => decodeFruaItemRecord(badName, 1)).toThrow(/name code 1 .* outside 0\.\.125/);
    const badTail = new Uint8Array(FRUA_ITEM_RECORD_SIZE);
    badTail[17] = 1;
    expect(() => decodeFruaItemRecord(badTail, 1)).toThrow(/reserved byte 17 is 1, expected 0/);
  });
});

const uaRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures';
const itemDatPath = resolve(uaRoot, 'DISK1', 'ITEM.DAT');
const itemsDatPath = resolve(uaRoot, 'DISK1', 'ITEMS.DAT');
const hasRetail = existsSync(itemDatPath) && existsSync(itemsDatPath);

describe('FRUA retail item source — HEIRS event 45 golden', () => {
  it.skipIf(!hasRetail)('hash-locks and resolves item ids 96, 246, 80, 80 without zero-based drift', () => {
    const itemDat = new Uint8Array(readFileSync(itemDatPath));
    const itemsDat = new Uint8Array(readFileSync(itemsDatPath));
    expect(itemDat).toHaveLength(4_572);
    expect(itemsDat).toHaveLength(2_048);
    expect(sha256(itemDat)).toBe('00dcfdea515ec9021ff70f9104d68c6f2aa2d204c350ae80ff26a19664862211');
    expect(sha256(itemsDat)).toBe('87ef0a1b564c282f24156d07492b0e8b83a6f383a629463e99249af985217fcb');

    const catalogue = decodeFruaItemCatalogue(itemDat, itemsDat);
    const sword = requireFruaItem(catalogue, 96);
    const potion = requireFruaItem(catalogue, 246);
    const arrows = requireFruaItem(catalogue, 80);

    expect([...sword.raw]).toEqual([
      0x12, 0x00, 0x70, 0x12, 0x3c, 0x00, 0xe8, 0x03, 0x02,
      0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(sword).toMatchObject({
      id: 96,
      baseTypeId: 18,
      nameCodes: [18, 112, 0],
      name: 'Long Sword +2',
      unidentifiedName: 'Long Sword',
      weightCoins: 60,
      valuePlatinum: 1000,
      magicBonus: 2,
      identifyMask: 6,
      bundleCount: 0,
      charges: 0,
      effectCode: 0,
      specialCode: 0,
      base: {
        id: 18,
        name: 'Long Sword',
        carryLocation: 0,
        handsRequired: 1,
        damageVsLarge: { count: 1, sides: 12, bonus: 0 },
        damageVsSmall: { count: 1, sides: 8, bonus: 0 },
        classMask: 236,
        missileType: 4,
      },
    });

    expect([...potion.raw]).toEqual([
      0x2f, 0x68, 0x5a, 0x35, 0x14, 0x00, 0x64, 0x00, 0x01,
      0x00, 0x00, 0x06, 0x00, 0x00, 0x01, 0x61, 0x00, 0x00,
    ]);
    expect(potion).toMatchObject({
      id: 246,
      baseTypeId: 47,
      nameCodes: [53, 90, 104],
      name: 'Potion of Invisibility',
      unidentifiedName: 'Potion',
      weightCoins: 20,
      valuePlatinum: 100,
      magicBonus: 1,
      identifyMask: 6,
      bundleCount: 0,
      charges: 1,
      effectCode: 97,
      specialCode: 0,
      base: { id: 47, name: 'Special Item', carryLocation: 10, classMask: 255 },
    });

    expect([...arrows.raw]).toEqual([
      0x1e, 0x00, 0x70, 0x1e, 0x02, 0x00, 0x06, 0x00, 0x02,
      0x00, 0x00, 0x06, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(arrows).toMatchObject({
      id: 80,
      baseTypeId: 30,
      nameCodes: [30, 112, 0],
      name: 'Arrow +2',
      unidentifiedName: 'Arrow',
      weightCoins: 2,
      valuePlatinum: 6,
      magicBonus: 2,
      identifyMask: 6,
      bundleCount: 10,
      charges: 0,
      effectCode: 0,
      specialCode: 0,
      base: {
        id: 30,
        name: 'Arrow(s)',
        carryLocation: 10,
        damageVsLarge: { count: 1, sides: 6, bonus: 0 },
        rateOfFire: 2,
        damageVsSmall: { count: 1, sides: 6, bonus: 0 },
        range: 22,
        classMask: 236,
        missileType: 18,
      },
    });

    expect([96, 246, 80, 80].map((id) => requireFruaItem(catalogue, id).name)).toEqual([
      'Long Sword +2', 'Potion of Invisibility', 'Arrow +2', 'Arrow +2',
    ]);
    expect([96, 246, 80, 80].map((id) => requireFruaItem(catalogue, id).unidentifiedName)).toEqual([
      'Long Sword', 'Potion', 'Arrow', 'Arrow',
    ]);
  });
});
