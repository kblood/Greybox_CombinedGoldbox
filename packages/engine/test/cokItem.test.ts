/**
 * CoK item → DQK item.dat port + VOCAB recode (Gap G3) — proven on REAL CoK `ITEM1.DAX` bytes.
 *
 * CoK item records carry namenum codes that index CoK's OWN reordered item-name table; carried verbatim
 * they would name the wrong item on the DQK engine (CoK 12="Quarrel" vs DQK 12="Bolt"). The port recodes
 * each namenum into DQK's index by string match. The decisive test: for every real CoK item whose name
 * components all exist in DQK's vocab, the name rendered from the SOURCE codes under CoK's table equals
 * the name rendered from the RECODED codes under DQK's table — i.e. the name round-trips.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optionalFixtureSkipTitle } from './optionalFixtureSkip.js';
import {
  portCokItemToDqk,
  recodeCokNamenum,
  nameFromCodes,
  decodeDqkItemRecord,
  readDaxDataBlocks,
  COK_VOCAB,
  DQK_VOCAB,
  NO_DQK_VOCAB,
} from '../src/index.js';

const ITEM_RECORD_SIZE = 63;
const F = { type: 0x2e, nn1: 0x2f, nn2: 0x30, nn3: 0x31, value: 0x3a, weight: 0x37 };

describe('recodeCokNamenum — byte-grounded mapping facts', () => {
  it('maps shared weapon entries to the same DQK index where the tables align', () => {
    // The first ~23 weapon entries are identical in both tables (verified from the two EXEs).
    for (const i of [1, 8, 18, 28, 37]) {
      expect(COK_VOCAB[i]).toBe(DQK_VOCAB[recodeCokNamenum(i)]);
    }
    expect(recodeCokNamenum(18)).toBe(18); // Long Sword aligns
  });

  it('remaps the reordered entries to the DQK index that names the same word', () => {
    // CoK 12 = "Quarrel"; DQK puts "Bolt" at 12 and "Quarrel" at the tail (129).
    expect(COK_VOCAB[12]).toBe('Quarrel');
    expect(DQK_VOCAB[recodeCokNamenum(12)]).toBe('Quarrel');
    expect(recodeCokNamenum(12)).not.toBe(12);
    // CoK 28 "Sling" -> DQK 26; CoK 37 "Shield" -> DQK 34 (the −2/−3 shift region).
    expect(DQK_VOCAB[recodeCokNamenum(28)]).toBe('Sling');
    expect(DQK_VOCAB[recodeCokNamenum(37)]).toBe('Shield');
    // Tail relocations: CoK 67 "Hoopak" -> DQK "Hoopak", CoK 12 to DQK tail, etc.
    expect(DQK_VOCAB[recodeCokNamenum(67)]).toBe('Hoopak');
  });

  it('applies the spelling/grammar aliases', () => {
    // CoK "Elven Chain" (61) -> DQK "Elfin Chain"; CoK "3 Spell" (102) -> DQK "3 Spells".
    expect(COK_VOCAB[61]).toBe('Elven Chain');
    expect(DQK_VOCAB[recodeCokNamenum(61)]).toBe('Elfin Chain');
    expect(COK_VOCAB[102]).toBe('3 Spell');
    expect(DQK_VOCAB[recodeCokNamenum(102)]).toBe('3 Spells');
  });

  it('returns NO_DQK_VOCAB for a CoK-only word and passes through 0 / out-of-range', () => {
    // "Long Bow" (24) has no DQK equivalent (DQK only has Composite Long Bow).
    expect(COK_VOCAB[24]).toBe('Long Bow');
    expect(recodeCokNamenum(24)).toBe(NO_DQK_VOCAB);
    expect(recodeCokNamenum(0)).toBe(0);
    expect(recodeCokNamenum(250)).toBe(250); // beyond the table — unchanged, never throws
  });
});

describe('portCokItemToDqk — field mapping (synthetic)', () => {
  it('maps base type, recoded names, value/weight into the 18-byte record', () => {
    const raw = new Uint8Array(ITEM_RECORD_SIZE);
    raw[F.type] = 10;
    raw[F.nn1] = 0;
    raw[F.nn2] = 0;
    raw[F.nn3] = 18; // "Long Sword" (CoK 18 -> DQK 18)
    raw[F.weight] = 0x40;
    raw[F.value] = 0x07;
    const ported = decodeDqkItemRecord(portCokItemToDqk(raw));
    expect(ported.baseTypeId).toBe(10);
    expect(ported.nameCodes).toEqual([18, 0, 0]); // [noun, adj, qual] order from dqkItem decode
    expect(ported.value).toBe(7);
    expect(ported.encumbrance).toBe(0x40);
    expect(nameFromCodes([0, 0, 18], DQK_VOCAB)).toBe('Long Sword');
  });

  it('throws on a too-small record', () => {
    expect(() => portCokItemToDqk(new Uint8Array(10))).toThrow(/too small/);
  });
});

// --- Golden: real CoK ITEM1.DAX name round-trip --------------------------------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const itemPath = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ITEM1.DAX');

/** Every 63-byte item record across a CoK ITEM archive's blocks. */
function cokItemRecords(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const b of readDaxDataBlocks(bytes)) {
    if (b.raw.length === 0 || b.raw.length % ITEM_RECORD_SIZE !== 0) continue;
    for (let off = 0; off + ITEM_RECORD_SIZE <= b.raw.length; off += ITEM_RECORD_SIZE) {
      out.push(b.raw.subarray(off, off + ITEM_RECORD_SIZE));
    }
  }
  return out;
}

describe('portCokItemToDqk — real CoK ITEM1.DAX name round-trip (Gap G3)', () => {
  const hasItemFixture = existsSync(itemPath);
  const itemFixture = 'Champions of Krynn/ITEM1.DAX';

  it.skipIf(!hasItemFixture)(
    optionalFixtureSkipTitle('CoK names render identically after the recode', hasItemFixture ? [] : [itemFixture]),
    async () => {
      const recs = cokItemRecords(new Uint8Array(await readFile(itemPath)));
      expect(recs.length).toBe(39);

      let checked = 0;
      let allComponentsMappable = 0;
      for (const raw of recs) {
        const srcCodes: [number, number, number] = [raw[F.nn1], raw[F.nn2], raw[F.nn3]];
        const cokName = nameFromCodes(srcCodes, COK_VOCAB);

        const ported = decodeDqkItemRecord(portCokItemToDqk(raw));
        // dqkItem decodes nameCodes as [noun(byte3), adj(byte2), qual(byte1)]; nameFromCodes wants
        // [nn1,nn2,nn3] = [qual, adj, noun] — so feed the reversed triple.
        const dqkCodes: [number, number, number] = [ported.nameCodes[2], ported.nameCodes[1], ported.nameCodes[0]];
        const dqkName = nameFromCodes(dqkCodes, DQK_VOCAB);

        // base type carries through unchanged.
        expect(ported.baseTypeId).toBe(raw[F.type]);

        // Only assert exact name equality for items whose every non-zero source component (a) has a DQK
        // equivalent and (b) is NOT an intentional spelling/grammar alias ("Elven Chain"→"Elfin Chain",
        // "3 Spell"→"3 Spells"). For those the recode is lossless and the rendered name is byte-identical.
        // Items with a CoK-only word ("Vial" special items, compose-fragment "White"/"Red" scrolls) are a
        // documented partial loss; aliased items normalise spelling (asserted separately below).
        const components = srcCodes.filter((c) => c > 0);
        const mappable = components.every((c) => recodeCokNamenum(c) !== NO_DQK_VOCAB);
        const aliased = components.some((c) => DQK_VOCAB[recodeCokNamenum(c)] !== COK_VOCAB[c]);
        if (cokName !== '' && mappable && !aliased) {
          expect(dqkName, `name round-trip for codes ${JSON.stringify(srcCodes)} (CoK="${cokName}")`).toBe(cokName);
          allComponentsMappable++;
        }
        checked++;
      }
      expect(checked).toBe(39);
      // The bulk of CoK stock + magic items round-trip losslessly.
      expect(allComponentsMappable, 'most CoK items round-trip their name losslessly').toBeGreaterThan(20);
    },
  );

  it.skipIf(!hasItemFixture)(
    optionalFixtureSkipTitle('specific known items name correctly after the recode', hasItemFixture ? [] : [itemFixture]),
    async () => {
      const recs = cokItemRecords(new Uint8Array(await readFile(itemPath)));
      const dqkNameOf = (raw: Uint8Array): string => {
        const p = decodeDqkItemRecord(portCokItemToDqk(raw));
        return nameFromCodes([p.nameCodes[2], p.nameCodes[1], p.nameCodes[0]], DQK_VOCAB);
      };
      // Long Sword: CoK codes (0,0,18) -> DQK "Long Sword".
      const longSword = recs.find((r) => r[F.nn3] === 18 && r[F.nn2] === 0 && r[F.nn1] === 0);
      expect(longSword && dqkNameOf(longSword)).toBe('Long Sword');
      // Sling (0,0,28) -> "Sling".
      const sling = recs.find((r) => r[F.nn3] === 28 && r[F.nn2] === 0 && r[F.nn1] === 0);
      expect(sling && dqkNameOf(sling)).toBe('Sling');
      // Leather Armor: CoK (0,48,31) "Armor"+"Leather" -> DQK "Leather Armor".
      const leather = recs.find((r) => r[F.nn3] === 31 && r[F.nn2] === 48);
      expect(leather && dqkNameOf(leather)).toBe('Leather Armor');
      // Scroll with "3 Spell" qualifier: CoK (102,38,39) "Scroll Cler 3 Spell" normalises to the DQK
      // grammar "Scroll Cler 3 Spells" (the documented "3 Spell"->"3 Spells" alias) — still names the
      // same item, just DQK's spelling.
      const scroll3 = recs.find((r) => r[F.nn1] === 102 && r[F.nn3] === 39);
      expect(scroll3 && dqkNameOf(scroll3)).toBe('Scroll Cler 3 Spells');
    },
  );
});
