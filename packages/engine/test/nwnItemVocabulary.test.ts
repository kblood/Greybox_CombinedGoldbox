/** Retail-byte regression for NWN's executable-resident MONITM name vocabulary. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeMonsterItmArchive } from '../src/loaders/monsterSideTables.js';
import { nameFromCodes } from '../src/loaders/cokItem.js';
import {
  decodeNwnItemVocabulary,
  NWN_ITEM_VOCABULARY_COUNT,
} from '../src/loaders/nwnItemVocabulary.js';

const NWN_DIR = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const EXE_PATH = resolve(NWN_DIR, 'GAME.EXE');
const MONITM_PATH = resolve(NWN_DIR, 'MONITM.DAX');
const haveNwn = existsSync(EXE_PATH) && existsSync(MONITM_PATH);

describe.skipIf(!haveNwn)('NWN item vocabulary — retail GAME.EXE/MONITM.DAX', () => {
  it('walks all 254 executable records without losing alignment at padded long names', () => {
    const vocabulary = decodeNwnItemVocabulary(readFileSync(EXE_PATH));

    expect(vocabulary).toHaveLength(NWN_ITEM_VOCABULARY_COUNT + 1);
    expect(vocabulary[0]).toBe('');
    expect(vocabulary[1]).toBe('Battle Axe');
    expect(vocabulary[4]).toBe('Bec De Corbin'); // Pascal string[20] record, not a tagged suffix
    expect(vocabulary[36]).toBe('Long Sword');
    expect(vocabulary[59]).toBe('Shield');
    expect(vocabulary[61]).toBe('Arrow');
    expect(vocabulary[254]).toBe('Cursed');
  });

  it('resolves every extended name code actually used by MONITM', () => {
    const vocabulary = decodeNwnItemVocabulary(readFileSync(EXE_PATH));
    const monsterItems = decodeMonsterItmArchive(readFileSync(MONITM_PATH));
    const extendedCodes = new Set<number>();

    for (const items of monsterItems.values()) {
      for (const item of items) {
        for (const code of item.nameCodes) if (code >= 125) extendedCodes.add(code);
      }
    }

    expect([...extendedCodes].sort((a, b) => a - b)).toEqual([159, 160, 162, 163, 175, 216, 222, 244]);
    expect(Object.fromEntries([...extendedCodes].sort((a, b) => a - b).map((code) => [code, vocabulary[code]])))
      .toEqual({
        159: 'Drow',
        160: 'Wagon',
        162: '+2',
        163: '+3',
        175: 'Copper',
        216: 'Bone',
        222: 'AC 3',
        244: 'Diamond',
      });
    for (const code of extendedCodes) {
      expect(vocabulary.indexOf(vocabulary[code]), `round-trip code ${code}`).toBe(code);
    }
  });

  it('composes retail high-code records into exact monster-loot names', () => {
    const vocabulary = decodeNwnItemVocabulary(readFileSync(EXE_PATH));
    const monsterItems = decodeMonsterItmArchive(readFileSync(MONITM_PATH));
    const itemName = (blockId: number, recordIndex: number): string => {
      const item = monsterItems.get(blockId)?.[recordIndex];
      expect(item, `MONITM block ${blockId} record ${recordIndex}`).toBeDefined();
      return nameFromCodes(item!.nameCodes, vocabulary);
    };

    // These pin high codes in context, including the title-specific low words whose indices differ
    // from CoK/DoK (NWN 47=Sling, 23=Mace, 55=Chain, 79=Bracers).
    expect(itemName(3, 0)).toBe('Drow Sling');          // [0,47,159]
    expect(itemName(3, 1)).toBe('+2 Mace');             // [0,23,162]
    expect(itemName(5, 1)).toBe('Bracers AC 3');        // [0,222,79]
    expect(itemName(43, 1)).toBe('+3 Wagon Mace');      // [23,160,163]
    expect(itemName(49, 0)).toBe('Bone Diamond');       // [0,244,216]
  });

  it('rejects bytes that do not contain the verified NWN table signature', () => {
    expect(() => decodeNwnItemVocabulary(new Uint8Array(512))).toThrow(/signature not found/);
  });

  it('rejects a GAME.EXE truncated after the signature instead of returning a partial table', () => {
    const truncated = readFileSync(EXE_PATH).subarray(0, 0xa600);
    expect(() => decodeNwnItemVocabulary(truncated)).toThrow(/decoded \d+ entries, expected 254/);
  });
});
