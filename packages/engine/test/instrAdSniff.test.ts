/**
 * `sniffInstrAd` claimed 40 files and one of them was a bank.
 *
 * The docblock on that function has always described a `0xFFFF`-terminated `{patch, bank, offset}`
 * table over 14-byte records. The check tested only the last clause: `firstOffset` in range, and
 * `(length - firstOffset) % 14 === 0` — a condition roughly one arbitrary file in fourteen meets.
 * Swept over the ten GOG DOS installs and the ten Amiga WHDLoad titles it accepted 40 files of
 * which 2 were banks, and those 2 are byte-identical copies of one bank. The other 38: ten
 * `unins000.exe`, a `.zip`, a `.PCX`, an `.lbm`, a `.sav`, four Amiga `Docs.info`, and twenty
 * game archives.
 *
 * Nothing dispatched on it — `decodeInstrAd` is called on a fixed path in `gameAudio.ts` and
 * `dqkExplore.ts` — so no shipped route was mis-routing. That is what made it survive: an export
 * with no consumer has no symptom, only a wrong answer waiting for its first caller.
 *
 * This file pins the two-sided result and, in particular, ranks the four clauses so the weakest
 * is on the record. Sources are the user's read-only GOG installs and WHDLoad pack — absent
 * source => SKIP.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { decodeInstrAd, sniffInstrAd, INSTR_AD_RECORD_BYTES } from '../src/audio/instrAd.js';

const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';
const WHD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';

const DQK_BANK = `${GOG}/The Dark Queen of Krynn/DISK1/INSTR.AD`;
const FRUA_BANK = `${GOG}/Unlimited Adventures/DISK1/INSTR.AD`;
/**
 * The outside control. Only one Gold Box bank exists — DQK's and FRUA's copies are byte-identical
 * — so a corpus of one would not show the sniffer generalises. `Azrael's Tear` is an unrelated
 * 1996 adventure that ships its own Miles bank.
 */
const OUTSIDE_BANK = `${GOG}/Azrael's Tear/GAME/AZRAEL/SAMPLE.AD`;

/**
 * Every file the old check accepted that the format does not contain, one per shape it wore.
 * Exact paths, not names: `MON2SPC.DAX` old-passes in Gateway and not in Pool of Radiance, and a
 * name-keyed list quietly picks the wrong copy — which it did on the first attempt here.
 */
const IMPOSTORS: string[] = [
  `${GOG}/Champions of Krynn/SKY.DAX`,
  `${GOG}/Champions of Krynn/unins000.exe`,
  `${GOG}/Curse of the Azure Bonds/ECL3.DAX`,
  `${GOG}/Death Knights of Krynn/8X8D1.DAX`,
  `${GOG}/Gateway to the Savage Frontier/BIGPIC5.DAX`,
  `${GOG}/Gateway to the Savage Frontier/ECL6.DAX`,
  // The one file that satisfies `entriesInRange` on its own.
  `${GOG}/Gateway to the Savage Frontier/MON2SPC.DAX`,
  `${GOG}/Pool of Radiance/POOLRAD/BODY2.DAX`,
  `${GOG}/Pool of Radiance/POOLRAD/ECL1.DAX`,
  `${GOG}/Secret of the Silver Blades/GEO3.DAX`,
  `${GOG}/Secret of the Silver Blades/PIC1.DAX`,
  `${GOG}/Unlimited Adventures/ART/DRAWCPIC.PCX`,
  `${WHD}/BuckRogersCountdownDday/data/pic1.daa`,
  // The four files that satisfy the terminator clause on their own — the Amiga icon sidecars.
  `${WHD}/ChampionsOfKrynn/Docs.info`,
  `${WHD}/DeathKnightsOfKrynn/Docs.info`,
  `${WHD}/DarkQueenOfKrynn/Docs.info`,
  `${WHD}/PoolsOfDarkness/Docs.info`,
  `${WHD}/ChampionsOfKrynn/data/save/CHRDATA5.sav`,
  `${WHD}/ChampionsOfKrynn/data/scrn1b.lbm`,
  `${WHD}/PoolOfRadiance/data/8x8d.dax`,
  `${WHD}/PoolOfRadiance/data/body.dax`,
  `${WHD}/PoolOfRadiance/data/item.dax`,
];
const read = (p: string) => new Uint8Array(readFileSync(p));
const have =
  [DQK_BANK, FRUA_BANK, OUTSIDE_BANK].every((p) => existsSync(p)) &&
  IMPOSTORS.every((p) => existsSync(p));

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** The four clauses, each scored on its own so the table in the docblock is reproducible. */
function clauses(b: Uint8Array) {
  const first = u32(b, 2);
  // The OLD lower bound (6), deliberately, so every file the old check accepted gets scored.
  // The new bound is 8, because the terminator needs two bytes of the table's tail — which is
  // by itself enough to reject Gateway's `MON2SPC.DAX` (`first === 7`).
  if (first < 6 || first > b.length) return null;
  const recs = Math.floor((b.length - first) / INSTR_AD_RECORD_BYTES);
  let entries = true;
  let recLen = true;
  let count = 0;
  for (let off = 0; off + 6 <= first; off += 6) {
    if (b[off] === 0xff && b[off + 1] === 0xff) break;
    count++;
    const ro = u32(b, off + 2);
    if (
      ro < first ||
      ro + INSTR_AD_RECORD_BYTES > b.length ||
      (ro - first) % INSTR_AD_RECORD_BYTES !== 0
    ) {
      entries = false;
    } else if (u16(b, ro) !== INSTR_AD_RECORD_BYTES) {
      recLen = false;
    }
  }
  return {
    terminator: first >= 8 && u16(b, first - 2) === 0xffff,
    entriesInRange: entries,
    recordLength14: recLen,
    countMatches: count === recs,
  };
}

describe.skipIf(!have)('sniffInstrAd', () => {
  it('accepts the Gold Box bank and an unrelated developer\u2019s bank', () => {
    for (const p of [DQK_BANK, FRUA_BANK, OUTSIDE_BANK]) {
      expect(`${p.slice(p.lastIndexOf('/') + 1)}:${sniffInstrAd(read(p))}`).toBe(
        `${p.slice(p.lastIndexOf('/') + 1)}:true`,
      );
    }
    // 199 instruments for the Gold Box bank, 181 for the outside one: the decoder reads both, so
    // the sniffer is not being propped up by a format that only ever has one shape.
    expect(decodeInstrAd(read(DQK_BANK)).instruments.length).toBe(199);
    expect(decodeInstrAd(read(OUTSIDE_BANK)).instruments.length).toBe(181);
  });

  it('the two Gold Box copies are the same bytes, which is why the outside control exists', () => {
    const a = read(DQK_BANK);
    const b = read(FRUA_BANK);
    expect(a.byteLength).toBe(3982);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(read(OUTSIDE_BANK).byteLength).toBe(3622);
  });

  it('rejects every file the old check accepted', () => {
    for (const p of IMPOSTORS) {
      const name = p.slice(p.lastIndexOf('/') + 1);
      const b = read(p);
      // The old condition, restated, so the corpus is proved to still exercise the bug.
      const first = u32(b, 2);
      const oldCheck =
        b.length >= 6 + INSTR_AD_RECORD_BYTES &&
        first >= 6 &&
        first <= b.length &&
        b.length - first > 0 &&
        (b.length - first) % INSTR_AD_RECORD_BYTES === 0;
      expect(`${name}:old=${oldCheck}`).toBe(`${name}:old=true`);
      expect(`${name}:new=${sniffInstrAd(b)}`).toBe(`${name}:new=false`);
    }
  });

  it('ranks the four clauses, and the obvious one is the weakest', () => {
    const scored = IMPOSTORS.map((p) => clauses(read(p))).filter((c) => c !== null);
    expect(scored.length).toBe(IMPOSTORS.length);
    const survivors = (key: keyof NonNullable<ReturnType<typeof clauses>>) =>
      scored.filter((c) => c![key]).length;
    // The terminator is what one reaches for first and it is the LEAST discriminating clause
    // here: the four Amiga `Docs.info` icon sidecars carry a 0xFFFF at exactly that spot.
    // `entriesInRange` alone lets Gateway's `MON2SPC.DAX` through — a 7-byte-header file that
    // the raised lower bound rejects anyway. Only the last two clauses are clean on this set,
    // and that is a thin claim on 22 files, which is why all four are kept.
    expect(survivors('terminator')).toBe(4);
    expect(survivors('entriesInRange')).toBe(1);
    expect(survivors('recordLength14')).toBe(0);
    expect(survivors('countMatches')).toBe(0);
    // ... and all four hold for both a Gold Box bank and the outside one.
    for (const p of [DQK_BANK, OUTSIDE_BANK]) {
      const c = clauses(read(p))!;
      expect(`${p.slice(p.lastIndexOf('/') + 1)}:${Object.values(c).join(',')}`).toBe(
        `${p.slice(p.lastIndexOf('/') + 1)}:true,true,true,true`,
      );
    }
  });

  it('the in-range clause is redundant, and no input can isolate it', () => {
    // Recorded rather than asserted with a mutation, because the mutation cannot exist. With
    // `dataLen % 14 === 0` enforced, the aligned offsets tile the data exactly and the last one
    // ends on EOF — so an aligned `recordOffset >= firstOffset` either fits, or starts at/past
    // EOF where the length read returns 0 and the record-length clause rejects it first.
    // Verified by mutation: deleting the in-range clause kills no test. It is kept because it
    // makes the bounds argument local to the loop instead of a property of the whole function.
    const base = read(DQK_BANK);
    const first = u32(base, 2);
    expect((base.length - first) % INSTR_AD_RECORD_BYTES).toBe(0);
    const lastAligned = first + INSTR_AD_RECORD_BYTES * ((base.length - first) / INSTR_AD_RECORD_BYTES - 1);
    expect(lastAligned + INSTR_AD_RECORD_BYTES).toBe(base.length);
    // The next aligned slot is EOF itself, and reads as 0 — not 14.
    expect(u16(base, base.length)).toBe(0);
  });

  it('each new clause can reject on its own', () => {
    // As with the DAA index arm, the impostors violate several clauses at once, so the corpus
    // cannot show any single clause is load-bearing. Perturbing a real bank one way each can.
    const base = read(DQK_BANK);
    expect(sniffInstrAd(base)).toBe(true);
    const first = u32(base, 2);

    const noTerm = base.slice();
    noTerm[first - 2] = 0x00; // break the 0xFFFF terminator only
    expect(sniffInstrAd(noTerm)).toBe(false);

    // Alignment needs a hand-built input, and it took three tries to build one that isolates it.
    // Nudging an entry's offset also breaks the record-length clause, so that mutant dies to the
    // wrong check; writing the decoy `u16` at record 5 byte +1 corrupts record 5's OWN length
    // field, which entry 5 reads, so that dies to the wrong check too. The decoy has to sit in
    // the operator region (bytes +2..+12) where no clause reads: entry 3 then points at a
    // 14-carrying offset that is not on the 14-byte grid, and nothing else changes.
    const misaligned = base.slice();
    const spot = first + INSTR_AD_RECORD_BYTES * 5 + 4;
    // Entry i lives at `i * 6`; its offset field is at `i * 6 + 2`. (Writing at `2 + i * 6 + 2`
    // instead spills across the next entry, and the mutant then dies to the range clause.)
    new DataView(misaligned.buffer).setUint32(6 * 3 + 2, spot, true);
    misaligned[spot] = INSTR_AD_RECORD_BYTES;
    misaligned[spot + 1] = 0;
    expect(u16(misaligned, spot)).toBe(INSTR_AD_RECORD_BYTES); // the record-length clause is happy
    expect((spot - first) % INSTR_AD_RECORD_BYTES).not.toBe(0); // ... and only alignment is wrong
    for (let k = 0; k < 199; k++) {
      // every real record header still reads 14, so no other clause can be the one that fires
      expect(u16(misaligned, first + k * INSTR_AD_RECORD_BYTES)).toBe(INSTR_AD_RECORD_BYTES);
    }
    expect(sniffInstrAd(misaligned)).toBe(false);

    const badRecLen = base.slice();
    badRecLen[first] = 0x0d; // first record declares length 13
    expect(sniffInstrAd(badRecLen)).toBe(false);

    const shortTable = base.slice();
    shortTable[6 * 5] = 0xff; // terminate the table early: count no longer matches record count
    shortTable[6 * 5 + 1] = 0xff;
    expect(sniffInstrAd(shortTable)).toBe(false);
  });
});
