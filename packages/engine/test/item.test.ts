/**
 * CoK item-record decoder tests (M2.S6 prerequisite).
 *
 * 1) Synthetic: 63-byte framing, name length/NUL-stop, base-type id, multi-record split.
 * 2) Golden: real CoK ITEM1.DAX — 39 records with known names and the stock-gear base ids.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeItemRecord,
  decodeItemArchive,
  sniffItemRecord,
  ITEM_RECORD_SIZE,
  decodeDokItemArchive,
  decodeDokItemRecord,
  sniffDokItemRecord,
  DOK_ITEM_RECORD_SIZE,
} from '../src/index.js';

function makeItem(name: string, baseTypeId = 0, count = 0, itemTypeId = 0): Uint8Array {
  const raw = new Uint8Array(ITEM_RECORD_SIZE);
  raw[0] = name.length;
  for (let i = 0; i < name.length; i++) raw[1 + i] = name.charCodeAt(i);
  raw[42] = baseTypeId;
  raw[0x2e] = itemTypeId;
  raw[57] = count;
  return raw;
}

describe('decodeItemRecord — synthetic', () => {
  it('parses name, base-type id, and stack count', () => {
    const rec = decodeItemRecord(makeItem('Long Sword', 10, 0, 37), 5, 22, 3);
    expect(rec.index).toBe(5);
    expect(rec.archiveBlockId).toBe(22);
    expect(rec.blockItemIndex).toBe(3);
    expect(rec.name).toBe('Long Sword');
    expect(rec.baseTypeId).toBe(10);
    expect(rec.itemTypeId).toBe(37);
    expect(rec.count).toBe(0);

    const arrows = decodeItemRecord(makeItem('20 Arrow', 8, 20));
    expect(arrows.count).toBe(20);
  });

  it('sniffs by size + name-length and rejects junk', () => {
    expect(sniffItemRecord(makeItem('Mace'))).toBe(true);
    expect(sniffItemRecord(new Uint8Array(63))).toBe(false); // name len 0
    expect(sniffItemRecord(new Uint8Array(20))).toBe(false); // too small
  });

  it('throws on a too-small record', () => {
    expect(() => decodeItemRecord(new Uint8Array(10))).toThrow(/too small/);
  });
});

// --- Golden: real CoK ITEM1.DAX (skips if data absent) ----------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const itemPath = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ITEM1.DAX');

describe('decodeItemArchive — golden CoK ITEM1', () => {
  it.skipIf(!existsSync(itemPath))('decodes 39 items with known names and stock base ids', async () => {
    const items = decodeItemArchive(new Uint8Array(await readFile(itemPath)));
    expect(items.length).toBe(39);
    const names = items.map((i) => i.name);
    expect(names).toContain('Long Sword');
    expect(names).toContain('Potion of Healing');
    expect(names).toContain('Wand of Magic Missiles');

    const byName = (n: string) => items.find((i) => i.name === n)!;
    expect(byName('Long Sword').baseTypeId).toBe(10);
    expect(byName('Mace').baseTypeId).toBe(12);
    expect(byName('Sling').baseTypeId).toBe(7);
    expect(byName('Potion of Healing').baseTypeId).toBe(0); // special/unique

    // Stack count: ammo carries its quantity, plain gear is 0.
    expect(byName('20 Arrow').count).toBe(20);
    expect(byName('4 Dart').count).toBe(4);
    expect(byName('Long Sword').count).toBe(0);
  });
});

// --- Golden: Pool quest-item identity and ITEM-block provenance -----------------------------

const poolDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD';
const poolItem1Path = resolve(poolDir, 'ITEM1.DAX');
const poolItem4Path = resolve(poolDir, 'ITEM4.DAX');
const poolItem6Path = resolve(poolDir, 'ITEM6.DAX');
const poolItem8Path = resolve(poolDir, 'ITEM8.DAX');

describe('decodeItemArchive — golden Pool FIND_ITEM identities', () => {
  it.skipIf(!existsSync(poolItem1Path))('maps type 74 to ITEM1#22 Leather Holy Symbols', async () => {
    const items = decodeItemArchive(new Uint8Array(await readFile(poolItem1Path)));
    const holySymbols = items.filter((item) => item.itemTypeId === 74);
    expect(holySymbols).toHaveLength(1);
    expect(holySymbols[0]).toMatchObject({
      name: '6 Leather Holy Symbol',
      archiveBlockId: 22,
      blockItemIndex: 0,
      count: 6,
    });
  });

  it.skipIf(!existsSync(poolItem4Path))('maps type 75 to ITEM4#38 Brass Key', async () => {
    const items = decodeItemArchive(new Uint8Array(await readFile(poolItem4Path)));
    const brassKeys = items.filter((item) => item.itemTypeId === 75);
    expect(brassKeys).toHaveLength(1);
    expect(brassKeys[0]).toMatchObject({
      name: 'Brass Key',
      archiveBlockId: 38,
      blockItemIndex: 6,
      count: 0,
    });
  });

  it.skipIf(!existsSync(poolItem8Path))('maps type 82 to ITEM8#50 Efreeti Bottle', async () => {
    const items = decodeItemArchive(new Uint8Array(await readFile(poolItem8Path)));
    const bottles = items.filter((item) => item.itemTypeId === 82);
    expect(bottles).toHaveLength(1);
    expect(bottles[0]).toMatchObject({
      name: 'Efreeti Bottle',
      archiveBlockId: 50,
      blockItemIndex: 0,
      count: 0,
    });
  });

  it.skipIf(!existsSync(poolItem6Path))('maps type 91 to ITEM6#57 Pass', async () => {
    const items = decodeItemArchive(new Uint8Array(await readFile(poolItem6Path)));
    const passes = items.filter((item) => item.itemTypeId === 91);
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      name: 'Pass',
      archiveBlockId: 57,
      blockItemIndex: 0,
      count: 0,
    });
  });
});

// --- DoK ITEM0 is a different (coded) format: the loader must not emit junk for it ---------

const dokItemPath = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'ITEM0.DAX');

describe('decodeItemArchive — DoK ITEM0 coded format', () => {
  it.skipIf(!existsSync(dokItemPath))('the CoK 63-byte loader returns nothing for the packed table', async () => {
    // DoK ITEM0 is a single 1632-byte VOCAB-coded table (not a multiple of 63); the CoK loader
    // skips it rather than slicing plausible-looking junk records out of binary stat bytes.
    const items = decodeItemArchive(new Uint8Array(await readFile(dokItemPath)));
    expect(items).toEqual([]);
  });
});

// --- B5: the DoK 17-byte item table decodes with the FRUA-family field layout ---------------

describe('decodeDokItemRecord — synthetic', () => {
  it('parses base-type, name codes, value, encumbrance and flags from a 17-byte record', () => {
    const raw = Uint8Array.from([
      10, /*0 base*/ 0x39, 0x05, 0x08, /*1-3 name*/ 0x03, 0x00, /*4-5 enc=3*/ 0x00, 0x06, /*6-7 val=1536*/
      1, /*8 +1*/ 1, /*9 sec*/ 1, /*10 ready*/ 0, /*11 ident*/ 0, /*12 cursed*/ 0, /*13 bundle*/ 5, /*14 charges*/ 0, /*15 eff*/ 0, /*16 special*/
    ]);
    const rec = decodeDokItemRecord(raw, 3);
    expect(rec.index).toBe(3);
    expect(rec.baseTypeId).toBe(10);
    expect(rec.nameCodes).toEqual([0x08, 0x05, 0x39]); // read byte3→byte1
    expect(rec.encumbrance).toBe(3);
    expect(rec.value).toBe(1536);
    expect(rec.magicBonus).toBe(1);
    expect(rec.charges).toBe(5);
    expect(rec.ready).toBe(true);
    expect(rec.identified).toBe(true);
    expect(rec.cursed).toBe(false);
  });

  it('sniff accepts a sane record and rejects out-of-range tail slots', () => {
    const ok = new Uint8Array(DOK_ITEM_RECORD_SIZE);
    ok[0] = 12; // base-type pointer in range
    expect(sniffDokItemRecord(ok)).toBe(true);
    const garbage = new Uint8Array(DOK_ITEM_RECORD_SIZE);
    garbage[0] = 246; // pointer out of catalogue range
    expect(sniffDokItemRecord(garbage)).toBe(false);
    const badReady = new Uint8Array(DOK_ITEM_RECORD_SIZE);
    badReady[0] = 12;
    badReady[10] = 46; // ready flag not boolean
    expect(sniffDokItemRecord(badReady)).toBe(false);
  });
});

describe('decodeDokItemArchive — golden DoK ITEM0', () => {
  it.skipIf(!existsSync(dokItemPath))('decodes the 96-slot table to 91 valid 17-byte items', async () => {
    const items = decodeDokItemArchive(new Uint8Array(await readFile(dokItemPath)));
    // 1632 bytes = 96 × 17; the leading 91 slots are real items, the tail is unused/garbage.
    expect(items.length).toBe(91);
    // First record: base-type 5 (a "vial"/consumable template) with no price.
    expect(items[0].baseTypeId).toBe(5);
    expect(items[0].value).toBe(0);
    // Base templates (name adjective/qualifier zero) sit between the named variants.
    expect(items[8].baseTypeId).toBe(18);
    // The magic weapons block (records ~52–57) carries charges + a real price.
    const magic = items.filter((i) => i.charges > 0 && i.value >= 5000);
    expect(magic.length).toBeGreaterThan(0);
    // Every decoded record is well-formed.
    expect(items.every((i) => i.baseTypeId >= 1 && i.baseTypeId <= 150)).toBe(true);
  });
});
