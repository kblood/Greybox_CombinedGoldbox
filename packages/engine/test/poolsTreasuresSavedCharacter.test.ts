/**
 * R3 — Pools of Darkness / Treasures of the Savage Frontier saved-character loader tests. Golden
 * values were read directly off the real GOG installs' `SAVE\CHRDATA{n}.SAV` files (both titles
 * keep their saves under `SAVE\`, unlike Secret's install), not transcribed from the plan or the
 * layout doc's probe numbers. Skips if a GOG install isn't present on this machine (never vendored
 * into the repo).
 *
 * Reproduces every oracle `packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts`'s file doc
 * claims: the ability-block uniqueness sweep (combined 14 records), the class/classLevel
 * consistency oracle (5/6 and 7/8, with `ABAGAIL`/`OUGO` named as the misses), the THAC0 and exp
 * oracles against this engine's own `addnd1e` tables, the weak `hpMax` bound, the `savingThrows`
 * in-range check, the shifted-offset negative, and the cross-title null (Curse 422B / Secret 439B
 * rejected by length AND, with the length guard bypassed, by the oracle).
 *
 * **Round 35 R4 fix-up (this file).** The "three-reading table" block below used to re-declare the
 * shipped 0-based race mapping as a local literal (`READINGS.ownTableZeroBased`) and score that
 * copy — a claim about a test fixture, not about the shipped importer, that would have stayed green
 * even if the real map were changed or deleted. It now imports and scores
 * `POOLS_TREASURES_RACE_TO_DL` directly from `apps/web/src/ui/importPoolsTreasuresParty.ts` (the
 * module that actually defines and exports it), following the SAME test-only cross-package import
 * `dokImportAssetSource.test.ts` already uses for `importDokParty.ts` — `packages/engine`'s own
 * `tsconfig.json` excludes `test/` from its DOM/platform-free pure-core rule for exactly this
 * reason. Mutating one entry of the real map and re-running turns this file's "accepts 14 of 14"
 * test red (see that test's own comment for the transcript). A second new block below reproduces
 * the round 35 R4-fix-up to `importPoolsTreasuresParty.ts` itself: OUGO, bumped from the roster by
 * the party cap once the corrected race table let CHERROD join, still carries her class/level
 * disagreement disclosure via `rejectedPartyFullDisagreements` rather than a plain, silent
 * party-full refusal.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeGen1SavedCharacter,
  sniffGen1SavedCharacter,
  decodePoolsTreasuresSavedCharacter,
  sniffPoolsTreasuresSavedCharacter,
  poolsTreasuresClassLevelAgrees,
  POOLS_TREASURES_SAVED_CHARACTER_LAYOUT,
  POOLS_TREASURES_SAVED_CHARACTER_SIZE,
  coabExpectedClassLevelSlots,
  COAB_CLASS_LABEL,
  bestThac0,
  xpForLevel,
  SECRET_RACE_LABEL,
  createCharacter,
  clampToRace,
  isMultiClassAllowed,
  allowsClass,
  dqkMaxLevel,
  type Gen1SavedCharacterLayout,
  type ClassSlot,
  type ClassId,
  type DragonlanceClassId,
  type DragonlanceRaceId,
} from '../src/index.js';
// Not re-exported from `src/index.ts` this phase (that file belongs to the integrator), so the
// test reaches the constant at its definition site. Its live consumer is the layout below,
// which IS exported from the barrel and puts `raceLabel` on every decoded record.
import { POOLS_TREASURES_RACE_LABEL } from '../src/loaders/poolsTreasuresSavedCharacter.js';
// Test-only cross-package import of the SHIPPED UI-side race/import maps -- `packages/engine` is
// the DOM/UI-free production core and never imports `apps/web` from `src/`, but its `tsconfig.json`
// deliberately excludes `test/` from that rule, and `dokImportAssetSource.test.ts` already reaches
// into `apps/web/src/ui/importDokParty.ts` the same way. Importing the REAL constant/function here
// (rather than re-declaring a copy) is the whole point of this round's fix -- see the file doc.
import {
  POOLS_TREASURES_RACE_TO_DL,
  importPoolsTreasuresParty,
} from '../../../apps/web/src/ui/importPoolsTreasuresParty.js';
import type { AssetSource } from '../../../apps/web/src/ui/assetSource.js';

// --- Synthetic record builder -----------------------------------------------------------------

function makePoolsTreasuresSav(opts: {
  name: string;
  abilities: [number, number, number, number, number, number, number]; // str,int,wis,dex,con,cha,str00
  thac0: number;
  race: number;
  classCode: number;
  extraByte: number;
  age: number;
  hpMax: number;
  savingThrows: [number, number, number, number, number];
  classLevel: number[]; // 8
  baseAc: number;
  exp: number;
  partySlot: number;
}): Uint8Array {
  const raw = new Uint8Array(POOLS_TREASURES_SAVED_CHARACTER_SIZE);
  raw[0] = opts.name.length;
  for (let i = 0; i < opts.name.length; i++) raw[1 + i] = opts.name.charCodeAt(i);
  for (let s = 0; s < 7; s++) {
    raw[0x10 + s * 2] = opts.abilities[s];
    raw[0x10 + s * 2 + 1] = opts.abilities[s];
  }
  raw[0xac] = opts.thac0 & 0xff;
  raw[0xad] = opts.race;
  raw[0xae] = opts.classCode;
  raw[0xaf] = opts.extraByte;
  raw[0xb0] = opts.age & 0xff;
  raw[0xb1] = (opts.age >> 8) & 0xff;
  raw[0xb2] = opts.hpMax;
  for (let i = 0; i < 5; i++) raw[0x132 + i] = opts.savingThrows[i];
  for (let i = 0; i < 8; i++) raw[0x151 + i] = opts.classLevel[i] ?? 0;
  raw[0x170] = opts.baseAc;
  raw[0x172] = opts.exp & 0xff;
  raw[0x173] = (opts.exp >> 8) & 0xff;
  raw[0x174] = (opts.exp >> 16) & 0xff;
  raw[0x175] = (opts.exp >> 24) & 0xff;
  raw[0x19c] = opts.partySlot;
  return raw;
}

const SYNTH_OPTS = {
  name: 'TESTER',
  abilities: [18, 17, 16, 15, 14, 13, 75] as [number, number, number, number, number, number, number],
  thac0: 48,
  race: 5,
  classCode: 3, // paladin
  extraByte: 1,
  age: 34,
  hpMax: 100,
  savingThrows: [10, 9, 8, 12, 9] as [number, number, number, number, number],
  classLevel: [0, 0, 0, 12, 0, 0, 0, 0],
  baseAc: 0x32,
  exp: 1000000,
  partySlot: 1,
};

describe('decodeGen1SavedCharacter / decodePoolsTreasuresSavedCharacter — synthetic', () => {
  it('decodes name, abilities, thac0, race (raw), class, extraByte, age, hpMax, savingThrows, classLevel, baseAc, exp, partySlot', () => {
    const raw = makePoolsTreasuresSav(SYNTH_OPTS);
    const c = decodePoolsTreasuresSavedCharacter(raw);
    expect(c.name).toBe('TESTER');
    expect(c.abilities.str).toEqual({ cur: 18, full: 18 });
    expect(c.abilities.str00).toEqual({ cur: 75, full: 75 });
    expect(c.thac0).toBe(48);
    expect(c.race).toBe(5); // RAW -- not translated through any enum
    expect(c.classCode).toBe(3);
    expect(c.classLabel).toBe('paladin');
    expect(c.extraByte).toBe(1);
    expect(c.age).toBe(34);
    expect(c.hpMax).toBe(100);
    expect(c.savingThrows).toEqual({ paralyzePoisonDeath: 10, petrifyPolymorph: 9, rodStaffWand: 8, breath: 12, spell: 9 });
    expect(c.classLevel).toEqual([0, 0, 0, 12, 0, 0, 0, 0]);
    expect(c.baseAc).toBe(0x32);
    expect(c.exp).toBe(1000000);
    expect(c.partySlot).toBe(1);
    expect(c.unverified).toEqual([]); // this layout uses extraByte, not unverifiedOffsets
  });

  it('sniffs by size + sane PString length', () => {
    const raw = makePoolsTreasuresSav(SYNTH_OPTS);
    expect(sniffPoolsTreasuresSavedCharacter(raw)).toBe(true);
    expect(sniffPoolsTreasuresSavedCharacter(new Uint8Array(POOLS_TREASURES_SAVED_CHARACTER_SIZE))).toBe(false); // name len 0
    expect(sniffPoolsTreasuresSavedCharacter(new Uint8Array(POOLS_TREASURES_SAVED_CHARACTER_SIZE - 1))).toBe(false); // wrong size
  });

  it('throws on any size other than 510', () => {
    const raw = new Uint8Array(509);
    expect(() => decodePoolsTreasuresSavedCharacter(raw)).toThrow(/510/);
  });

  it('poolsTreasuresClassLevelAgrees: true when the class byte and classLevel window agree, false otherwise', () => {
    const agree = makePoolsTreasuresSav(SYNTH_OPTS); // paladin, slot 3 set -- agrees
    expect(poolsTreasuresClassLevelAgrees(decodePoolsTreasuresSavedCharacter(agree))).toBe(true);

    const disagree = makePoolsTreasuresSav({ ...SYNTH_OPTS, classCode: 5, classLevel: [0, 0, 0, 0, 0, 12, 0, 11] }); // ABAGAIL shape
    expect(poolsTreasuresClassLevelAgrees(decodePoolsTreasuresSavedCharacter(disagree))).toBe(false);
  });
});

// --- Golden: the real GOG installs' 14 pregens (6 Pools + 8 Treasures) -------------------------

const POOLS_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE';
const TREASURES_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE';
const havePools = existsSync(resolve(POOLS_DIR, 'CHRDATA1.SAV'));
const haveTreasures = existsSync(resolve(TREASURES_DIR, 'CHRDATA1.SAV'));
const haveBoth = havePools && haveTreasures;

interface Golden {
  dir: string;
  file: string;
  title: 'pools' | 'treasures';
  name: string;
  race: number;
  classCode: number;
  classLabel: string;
  classLevel: number[];
  thac0: number;
  age: number;
  hpMax: number;
  baseAc: number;
  exp: number;
  extraByte: number;
  partySlot: number;
  savingThrows: [number, number, number, number, number];
  /** Whether this record passes the class/classLevel consistency oracle -- false only for
   * ABAGAIL (Pools) and OUGO (Treasures). */
  agrees: boolean;
}

const POOLS_GOLDEN: Golden[] = [
  { dir: POOLS_DIR, file: 'CHRDATA1.SAV', title: 'pools', name: 'BINKY', race: 1, classCode: 14, classLabel: 'mc_f_t', classLevel: [0, 0, 8, 0, 0, 0, 13, 0], thac0: 46, age: 34, hpMax: 89, baseAc: 0x32, exp: 750000, extraByte: 0, partySlot: 0, savingThrows: [10, 9, 8, 12, 9], agrees: true },
  { dir: POOLS_DIR, file: 'CHRDATA2.SAV', title: 'pools', name: 'Guy de Valois', race: 5, classCode: 3, classLabel: 'paladin', classLevel: [0, 0, 0, 12, 0, 0, 0, 0], thac0: 50, age: 41, hpMax: 116, baseAc: 0x32, exp: 1500001, extraByte: 1, partySlot: 1, savingThrows: [5, 6, 7, 6, 8], agrees: true },
  { dir: POOLS_DIR, file: 'CHRDATA3.SAV', title: 'pools', name: 'CLARISSA', race: 5, classCode: 4, classLabel: 'ranger', classLevel: [0, 0, 0, 0, 13, 0, 0, 0], thac0: 52, age: 34, hpMax: 120, baseAc: 0x32, exp: 1500001, extraByte: 0, partySlot: 2, savingThrows: [5, 6, 7, 5, 8], agrees: true },
  { dir: POOLS_DIR, file: 'CHRDATA4.SAV', title: 'pools', name: 'DOMINIC', race: 5, classCode: 0, classLabel: 'cleric', classLevel: [14, 0, 0, 0, 0, 0, 0, 0], thac0: 48, age: 31, hpMax: 98, baseAc: 0x32, exp: 1500001, extraByte: 0, partySlot: 3, savingThrows: [5, 8, 9, 11, 10], agrees: true },
  { dir: POOLS_DIR, file: 'CHRDATA5.SAV', title: 'pools', name: 'ABAGAIL', race: 5, classCode: 5, classLabel: 'magic_user', classLevel: [0, 0, 0, 0, 0, 12, 0, 11], thac0: 46, age: 32, hpMax: 92, baseAc: 0x32, exp: 825000, extraByte: 0, partySlot: 4, savingThrows: [6, 9, 7, 11, 8], agrees: false },
  { dir: POOLS_DIR, file: 'CHRDATA6.SAV', title: 'pools', name: 'PAINE', race: 5, classCode: 5, classLabel: 'magic_user', classLevel: [0, 0, 0, 0, 0, 13, 0, 0], thac0: 48, age: 35, hpMax: 96, baseAc: 0x32, exp: 1275000, extraByte: 0, partySlot: 5, savingThrows: [8, 9, 7, 9, 8], agrees: true },
];

const TREASURES_GOLDEN: Golden[] = [
  { dir: TREASURES_DIR, file: 'CHRDATA1.SAV', title: 'treasures', name: 'MAXWELL', race: 5, classCode: 3, classLabel: 'paladin', classLevel: [0, 0, 0, 4, 0, 0, 0, 0], thac0: 42, age: 30, hpMax: 47, baseAc: 0x32, exp: 22600, extraByte: 1, partySlot: 0, savingThrows: [11, 12, 13, 14, 14], agrees: true },
  { dir: TREASURES_DIR, file: 'CHRDATA2.SAV', title: 'treasures', name: 'TRISTLE', race: 5, classCode: 4, classLabel: 'ranger', classLevel: [0, 0, 0, 0, 5, 0, 0, 0], thac0: 44, age: 33, hpMax: 54, baseAc: 0x32, exp: 22600, extraByte: 0, partySlot: 1, savingThrows: [11, 12, 13, 13, 14], agrees: true },
  { dir: TREASURES_DIR, file: 'CHRDATA3.SAV', title: 'treasures', name: 'MELLIA', race: 5, classCode: 0, classLabel: 'cleric', classLevel: [5, 0, 0, 0, 0, 0, 0, 0], thac0: 42, age: 32, hpMax: 41, baseAc: 0x32, exp: 22600, extraByte: 0, partySlot: 2, savingThrows: [9, 12, 13, 15, 14], agrees: true },
  { dir: TREASURES_DIR, file: 'CHRDATA4.SAV', title: 'treasures', name: 'CHERROD', race: 1, classCode: 15, classLabel: 'mc_f_mu_t', classLevel: [0, 0, 3, 0, 0, 3, 4, 0], thac0: 42, age: 46, hpMax: 20, baseAc: 0x32, exp: 7533, extraByte: 0, partySlot: 3, savingThrows: [13, 12, 11, 15, 12], agrees: true },
  { dir: TREASURES_DIR, file: 'CHRDATA5.SAV', title: 'treasures', name: 'SPARKLE', race: 5, classCode: 5, classLabel: 'magic_user', classLevel: [0, 0, 0, 0, 0, 5, 0, 0], thac0: 40, age: 38, hpMax: 24, baseAc: 0x32, exp: 22600, extraByte: 0, partySlot: 4, savingThrows: [14, 13, 11, 15, 12], agrees: true },
  { dir: TREASURES_DIR, file: 'CHRDATA6.SAV', title: 'treasures', name: 'FRAZZLE', race: 5, classCode: 5, classLabel: 'magic_user', classLevel: [0, 0, 0, 0, 0, 5, 0, 0], thac0: 40, age: 38, hpMax: 28, baseAc: 0x32, exp: 22600, extraByte: 0, partySlot: 5, savingThrows: [14, 13, 11, 15, 12], agrees: true },
  { dir: TREASURES_DIR, file: 'CHRDATA7.SAV', title: 'treasures', name: 'OUGO', race: 5, classCode: 2, classLabel: 'fighter', classLevel: [8, 0, 0, 0, 0, 0, 0, 0], thac0: 44, age: 25, hpMax: 80, baseAc: 0x32, exp: 151810, extraByte: 0, partySlot: 6, savingThrows: [7, 10, 11, 13, 12], agrees: false },
  { dir: TREASURES_DIR, file: 'CHRDATA8.SAV', title: 'treasures', name: 'SMOKE', race: 5, classCode: 5, classLabel: 'magic_user', classLevel: [0, 0, 0, 0, 0, 10, 0, 0], thac0: 41, age: 36, hpMax: 58, baseAc: 0x32, exp: 298321, extraByte: 0, partySlot: 7, savingThrows: [13, 11, 9, 13, 10], agrees: true },
];

const ALL_GOLDEN = [...POOLS_GOLDEN, ...TREASURES_GOLDEN];

async function readGolden(g: Golden): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(g.dir, g.file)));
}

describe('decodePoolsTreasuresSavedCharacter — golden GOG install pregens (ONE shared layout for both titles)', () => {
  it.skipIf(!haveBoth)(
    'decodes all 14 real pregens (6 Pools + 8 Treasures) through the SAME POOLS_TREASURES_SAVED_CHARACTER_LAYOUT',
    async () => {
      for (const g of ALL_GOLDEN) {
        const raw = await readGolden(g);
        expect(raw.length).toBe(POOLS_TREASURES_SAVED_CHARACTER_SIZE);
        const c = decodePoolsTreasuresSavedCharacter(raw);
        expect(c.name.trim()).toBe(g.name);
        expect(c.race).toBe(g.race);
        expect(c.classCode).toBe(g.classCode);
        expect(c.classLabel).toBe(g.classLabel);
        expect(c.classLevel).toEqual(g.classLevel);
        expect(c.thac0).toBe(g.thac0);
        expect(c.age).toBe(g.age);
        expect(c.hpMax).toBe(g.hpMax);
        expect(c.baseAc).toBe(g.baseAc);
        expect(c.exp).toBe(g.exp);
        expect(c.extraByte).toBe(g.extraByte);
        expect(c.partySlot).toBe(g.partySlot);
        expect(c.savingThrows).toEqual({
          paralyzePoisonDeath: g.savingThrows[0],
          petrifyPolymorph: g.savingThrows[1],
          rodStaffWand: g.savingThrows[2],
          breath: g.savingThrows[3],
          spell: g.savingThrows[4],
        });
        expect(poolsTreasuresClassLevelAgrees(c)).toBe(g.agrees);
      }
    },
  );

  it.skipIf(!haveBoth)(
    'MEASURED oracle 1/6 -- abilities uniqueness sweep over the 14 COMBINED records: 0x10 is the ' +
      'ONLY offset in 0..(size-12) where all 14 records show six (cur,full) pairs, cur==full, ' +
      'values 3..18, with at least one pair varying across the combined party',
    async () => {
      const raws = await Promise.all(ALL_GOLDEN.map(readGolden));
      const hits: number[] = [];
      for (let off = 0; off <= POOLS_TREASURES_SAVED_CHARACTER_SIZE - 12; off++) {
        let ok = true;
        let varyingAny = false;
        for (let i = 0; i < 6 && ok; i++) {
          const curs = raws.map((r) => r[off + i * 2]);
          const fulls = raws.map((r) => r[off + i * 2 + 1]);
          if (!curs.every((v, j) => v === fulls[j])) ok = false;
          else if (!curs.every((v) => v >= 3 && v <= 18)) ok = false;
          else if (new Set(curs).size > 1) varyingAny = true;
        }
        if (ok && varyingAny) hits.push(off);
      }
      expect(hits).toEqual([0x10]);
    },
  );

  it.skipIf(!haveBoth)(
    'MEASURED oracle 2/6 -- class@0xae / classLevel[8]@0x151 consistency oracle: Pools 5/6 (miss ' +
      'ABAGAIL), Treasures 7/8 (miss OUGO) -- the SAME two-field oracle coabSavedCharacter.ts and ' +
      'secretSavedCharacter.ts both rest on, reused unmodified',
    async () => {
      const scorePartial = async (goldens: Golden[]) => {
        let accept = 0;
        const misses: string[] = [];
        for (const g of goldens) {
          const raw = await readGolden(g);
          const c = decodePoolsTreasuresSavedCharacter(raw);
          if (poolsTreasuresClassLevelAgrees(c)) accept++;
          else misses.push(c.name.trim());
        }
        return { accept, misses };
      };
      const pools = await scorePartial(POOLS_GOLDEN);
      const treasures = await scorePartial(TREASURES_GOLDEN);
      expect(pools.accept).toBe(5);
      expect(pools.misses).toEqual(['ABAGAIL']);
      expect(treasures.accept).toBe(7);
      expect(treasures.misses).toEqual(['OUGO']);
    },
  );

  it.skipIf(!haveBoth)(
    'MEASURED oracle 3/6 -- thac0@0xac: 0x3C - raw vs this engine\'s own bestThac0() for the ' +
      "record's OWN nonzero classLevel slots, on the 12 oracle-accepted records: 4/12 (Treasures' " +
      'TRISTLE/MELLIA/CHERROD/SMOKE) -- BELOW the plan\'s >=10/12 estimate, reported as measured, ' +
      "not smoothed to match the prediction",
    async () => {
      const SLOT_TO_CLASS: Record<string, ClassId | null> = {
        cleric: 'cleric',
        druid: 'druid',
        fighter: 'fighter',
        paladin: 'paladin',
        ranger: 'ranger',
        magic_user: 'magicUser',
        thief: 'thief',
        monk: 'monk',
      };
      let accept = 0;
      let total = 0;
      const matches: string[] = [];
      for (const g of ALL_GOLDEN) {
        if (!g.agrees) continue; // only the 12 oracle-accepted records
        const raw = await readGolden(g);
        const c = decodePoolsTreasuresSavedCharacter(raw);
        total++;
        const displayThac0 = 0x3c - c.thac0;
        const slots: ClassSlot[] = c.classLevel
          .map((level, i) => ({ classId: SLOT_TO_CLASS[SLOT_LABEL_ORDER[i]], level }))
          .filter((s): s is ClassSlot => s.level > 0 && s.classId !== null);
        const expected = bestThac0(slots);
        if (expected === displayThac0) {
          accept++;
          matches.push(c.name.trim());
        }
      }
      expect(total).toBe(12);
      expect(accept).toBe(4);
      expect(matches.sort()).toEqual(['CHERROD', 'MELLIA', 'SMOKE', 'TRISTLE'].sort());
    },
  );

  it.skipIf(!haveBoth)(
    'MEASURED oracle 4/6 -- exp@0x172: xpForLevel(class,level) <= exp < xpForLevel(class,level+1) ' +
      'for EVERY active class, on the 12 oracle-accepted records: 8/12',
    async () => {
      const SLOT_TO_CLASS: Record<string, ClassId | null> = {
        cleric: 'cleric',
        druid: 'druid',
        fighter: 'fighter',
        paladin: 'paladin',
        ranger: 'ranger',
        magic_user: 'magicUser',
        thief: 'thief',
        monk: 'monk',
      };
      let accept = 0;
      let total = 0;
      for (const g of ALL_GOLDEN) {
        if (!g.agrees) continue;
        const raw = await readGolden(g);
        const c = decodePoolsTreasuresSavedCharacter(raw);
        total++;
        const exp = c.exp as number;
        const active = c.classLevel
          .map((level, i) => ({ classId: SLOT_TO_CLASS[SLOT_LABEL_ORDER[i]], level }))
          .filter((s): s is { classId: ClassId; level: number } => s.level > 0 && s.classId !== null);
        const allOk = active.every(({ classId, level }) => {
          const lo = xpForLevel(classId, level);
          const hi = xpForLevel(classId, level + 1);
          return exp >= lo && exp < hi;
        });
        if (allOk) accept++;
      }
      expect(total).toBe(12);
      expect(accept).toBe(8);
    },
  );

  it.skipIf(!haveBoth)(
    'BOUNDED (not proven) -- hpMax@0xb2: level <= hp <= level * (best active-class hit die + CON hp ' +
      "bonus), using the record's OWN nonzero classLevel slots (so ABAGAIL/OUGO are included too): " +
      '13/14, the one miss is Pools\' PAINE (magic-user 13, CON 16 -> ceiling 78, stored 96)',
    async () => {
      const HIT_DIE: Record<string, number> = { cleric: 8, druid: 8, fighter: 10, paladin: 10, ranger: 10, magic_user: 4, thief: 6, monk: 6 };
      const WARRIOR = new Set(['fighter', 'paladin', 'ranger']);
      const CON_TABLE: Record<number, [number, number]> = {
        3: [-2, -2], 4: [-1, -1], 5: [-1, -1], 6: [-1, -1], 7: [0, 0], 8: [0, 0], 9: [0, 0], 10: [0, 0],
        11: [0, 0], 12: [0, 0], 13: [0, 0], 14: [0, 0], 15: [1, 1], 16: [2, 2], 17: [2, 3], 18: [2, 4], 19: [2, 5],
      };
      const conBonus = (score: number, warrior: boolean) => {
        const s = Math.max(3, Math.min(19, Math.round(score)));
        const [nw, w] = CON_TABLE[s];
        return warrior ? w : nw;
      };
      let accept = 0;
      const misses: string[] = [];
      for (const g of ALL_GOLDEN) {
        const raw = await readGolden(g);
        const c = decodePoolsTreasuresSavedCharacter(raw);
        const active = c.classLevel
          .map((level, i) => ({ slot: SLOT_LABEL_ORDER[i], level }))
          .filter((s) => s.level > 0);
        if (active.length === 0) continue;
        const maxLevel = Math.max(...active.map((a) => a.level));
        const bestHitDie = Math.max(...active.map((a) => HIT_DIE[a.slot]));
        const isWarrior = active.some((a) => WARRIOR.has(a.slot));
        const bonus = conBonus(c.abilities.con.full, isWarrior);
        const lo = maxLevel;
        const hi = maxLevel * (bestHitDie + bonus);
        if (c.hpMax >= lo && c.hpMax <= hi) accept++;
        else misses.push(c.name.trim());
      }
      expect(accept).toBe(13);
      expect(misses).toEqual(['PAINE']);
    },
  );

  it.skipIf(!haveBoth)(
    'savingThrows@0x132 -- every byte on all 14 records falls inside [5, 20], the GLOBAL min/max of ' +
      "this engine's own addnd1e SAVES table (not an invented bound); a weak, non-unique check " +
      '(10 of the other 506 possible 5-byte offsets also pass it), so this stays a corroboration, not a discriminating oracle',
    async () => {
      let inRangeRecords = 0;
      for (const g of ALL_GOLDEN) {
        const raw = await readGolden(g);
        const c = decodePoolsTreasuresSavedCharacter(raw);
        const st = c.savingThrows!;
        const bytes = [st.paralyzePoisonDeath, st.petrifyPolymorph, st.rodStaffWand, st.breath, st.spell];
        if (bytes.every((v) => v >= 5 && v <= 20)) inRangeRecords++;
      }
      expect(inRangeRecords).toBe(14);
    },
  );

  it.skipIf(!haveBoth)('baseAc@0x170 is the constant 0x32 on all 14 records', async () => {
    let constantCount = 0;
    for (const g of ALL_GOLDEN) {
      const raw = await readGolden(g);
      const c = decodePoolsTreasuresSavedCharacter(raw);
      if (c.baseAc === 0x32) constantCount++;
    }
    expect(constantCount).toBe(14);
  });

  it.skipIf(!haveBoth)('partySlot@0x19c equals the record\'s own file index (0-based) on all 14 records', async () => {
    for (const g of ALL_GOLDEN) {
      const raw = await readGolden(g);
      const c = decodePoolsTreasuresSavedCharacter(raw);
      expect(c.partySlot).toBe(g.partySlot);
    }
  });

  it.skipIf(!haveBoth)(
    'shifted-offset negative (MUTATION i): reading class at 0xad or 0xaf instead of the real 0xae ' +
      'scores far below the real offset\'s 5/6 (Pools) and 7/8 (Treasures)',
    async () => {
      const acceptAtForTitle = async (goldens: Golden[], classOffset: number) => {
        let accept = 0;
        for (const g of goldens) {
          const raw = await readGolden(g);
          const classCode = raw[classOffset];
          const expected = coabExpectedClassLevelSlots(classCode);
          const actual = new Set<number>();
          for (let i = 0; i < 8; i++) if (raw[0x151 + i] !== 0) actual.add(i);
          if (expected !== null && expected.size > 0 && setsEqual(expected, actual)) accept++;
        }
        return accept;
      };
      expect(await acceptAtForTitle(POOLS_GOLDEN, 0xad)).toBe(1);
      expect(await acceptAtForTitle(POOLS_GOLDEN, 0xaf)).toBe(1);
      expect(await acceptAtForTitle(POOLS_GOLDEN, 0xae)).toBe(5); // the real offset, for contrast
      expect(await acceptAtForTitle(TREASURES_GOLDEN, 0xad)).toBe(3);
      expect(await acceptAtForTitle(TREASURES_GOLDEN, 0xaf)).toBe(2);
      expect(await acceptAtForTitle(TREASURES_GOLDEN, 0xae)).toBe(7); // the real offset, for contrast
    },
  );
});

const SLOT_LABEL_ORDER = ['cleric', 'druid', 'fighter', 'paladin', 'ranger', 'magic_user', 'thief', 'monk'];

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// --- The null: this layout's own offsets applied to OTHER titles must NOT also accept -----------

const CURSE_SAVE_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE';
const SECRET_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades';
const haveCurseCross = existsSync(resolve(CURSE_SAVE_DIR, 'CHRDATA1.SAV'));
const haveSecretCross = existsSync(resolve(SECRET_DIR, 'CHRDATA1.SAV'));

describe("cross-title null -- this layout's own offsets (0xae, 0x151) applied to OTHER titles' records", () => {
  it.skipIf(!haveCurseCross)(
    'MUTATION ii, part 1: decoding a 422-byte Curse record under the 510-byte layout throws on LENGTH alone',
    async () => {
      const raw = new Uint8Array(await readFile(resolve(CURSE_SAVE_DIR, 'CHRDATA1.SAV')));
      expect(raw.length).toBe(422);
      expect(() => decodeGen1SavedCharacter(raw, POOLS_TREASURES_SAVED_CHARACTER_LAYOUT)).toThrow(/510/);
    },
  );

  it.skipIf(!haveCurseCross)(
    'MUTATION ii, part 2: with a synthetic 422-byte variant of this layout (length guard bypassed), ' +
      "the class/classLevel oracle still rejects Curse's real bytes 0/6",
    async () => {
      const layout422: Gen1SavedCharacterLayout = { ...POOLS_TREASURES_SAVED_CHARACTER_LAYOUT, size: 422 };
      let accept = 0;
      for (let i = 1; i <= 6; i++) {
        const raw = new Uint8Array(await readFile(resolve(CURSE_SAVE_DIR, `CHRDATA${i}.SAV`)));
        const c = decodeGen1SavedCharacter(raw, layout422); // does not throw: size matches layout422
        if (poolsTreasuresClassLevelAgrees(c)) accept++;
      }
      expect(accept).toBe(0);
    },
  );

  it.skipIf(!haveSecretCross)(
    'MUTATION ii, part 3: decoding a 439-byte Secret record under the 510-byte layout throws on LENGTH alone',
    async () => {
      const raw = new Uint8Array(await readFile(resolve(SECRET_DIR, 'CHRDATA1.SAV')));
      expect(raw.length).toBe(439);
      expect(() => decodeGen1SavedCharacter(raw, POOLS_TREASURES_SAVED_CHARACTER_LAYOUT)).toThrow(/510/);
    },
  );

  it.skipIf(!haveSecretCross)(
    'MUTATION ii, part 4: with a synthetic 439-byte variant of this layout (length guard bypassed), ' +
      "the class/classLevel oracle still rejects Secret's real bytes 0/6",
    async () => {
      const layout439: Gen1SavedCharacterLayout = { ...POOLS_TREASURES_SAVED_CHARACTER_LAYOUT, size: 439 };
      let accept = 0;
      for (let i = 1; i <= 6; i++) {
        const raw = new Uint8Array(await readFile(resolve(SECRET_DIR, `CHRDATA${i}.SAV`)));
        const c = decodeGen1SavedCharacter(raw, layout439); // does not throw: size matches layout439
        if (poolsTreasuresClassLevelAgrees(c)) accept++;
      }
      expect(accept).toBe(0);
    },
  );
});


// --- Round 35 R4: POOLS_TREASURES_RACE_LABEL, its wiring, and the three named readings ----------
//
// The byte-side evidence (both tables located from each title's OWN unpacked GAME.EXE, the
// fencepost null, the class-byte 0-based corroboration) lives in
// `tools/pools_treasures_race_table.py` / `tools/test_pools_treasures_race_table.py`. What is
// pinned HERE is the engine-side consequence: the transcribed table, that the layout wires it, the
// per-hero labels it gives the 14 real records, and the three-reading legality table -- INCLUDING
// the measurement that the import outcome does NOT separate the 0-based reading from the 1-based
// one.

/** CoAB's own `Race` enum order, transcribed here only so the third reading below is named rather
 * than implied. Matches `coabSavedCharacter.ts`'s own enum and `importCoabParty.ts`'s
 * `COAB_RACE_TO_DL` keys. */
const COAB_RACE_LABEL_FOR_TEST: Readonly<Record<number, string>> = {
  0: 'monster', 1: 'dwarf', 2: 'elf', 3: 'gnome', 4: 'half_elf', 5: 'halfling', 6: 'half_orc', 7: 'human',
};

describe("POOLS_TREASURES_RACE_LABEL -- both titles' own GAME.EXE race string table", () => {
  it('is the 7-entry FRUA-order table, with no leading Tribble slot', () => {
    expect(POOLS_TREASURES_RACE_LABEL).toEqual({
      0: 'Elf', 1: 'Half-Elf', 2: 'Dwarf', 3: 'Gnome', 4: 'Halfling', 5: 'Human', 6: 'Monster',
    });
    expect(Object.keys(POOLS_TREASURES_RACE_LABEL)).toHaveLength(7);
  });

  it('POOLS_TREASURES_SAVED_CHARACTER_LAYOUT wires raceLabelTable to it (the consumer that makes it live)', () => {
    expect(POOLS_TREASURES_SAVED_CHARACTER_LAYOUT.raceLabelTable).toBe(POOLS_TREASURES_RACE_LABEL);
  });

  it("is NOT Secret's own table -- the enum is demonstrably not family-stable across Gen1", () => {
    // Secret's table (round 34) has 8 entries with `Tribble` at 0, so every index after it is
    // shifted by one: Secret's byte 5 is Halfling where these two titles' byte 5 is Human. Reusing
    // one title's numbering for another is exactly the mistake this pair of constants prevents.
    expect(SECRET_RACE_LABEL[0]).toBe('Tribble');
    expect(Object.keys(SECRET_RACE_LABEL)).toHaveLength(8);
    expect(POOLS_TREASURES_RACE_LABEL[5]).toBe('Human');
    expect(SECRET_RACE_LABEL[5]).toBe('Halfling');
    for (let i = 0; i < 7; i++) expect(POOLS_TREASURES_RACE_LABEL[i]).toBe(SECRET_RACE_LABEL[i + 1]);
  });

  it.skipIf(!haveBoth)(
    'gives all 14 real pregens a label: the 2 multi-class records read Half-Elf, the 12 single-class records read Human',
    async () => {
      const labelled: Record<string, string | undefined> = {};
      for (const g of ALL_GOLDEN) {
        const c = decodePoolsTreasuresSavedCharacter(await readGolden(g));
        labelled[g.name] = c.raceLabel;
      }
      expect(Object.keys(labelled)).toHaveLength(14);
      expect(labelled['BINKY']).toBe('Half-Elf');
      expect(labelled['CHERROD']).toBe('Half-Elf');
      const humans = Object.entries(labelled).filter(([, l]) => l === 'Human').map(([n]) => n).sort();
      expect(humans).toEqual([
        'ABAGAIL', 'CLARISSA', 'DOMINIC', 'FRAZZLE', 'Guy de Valois', 'MAXWELL', 'MELLIA', 'OUGO',
        'PAINE', 'SMOKE', 'SPARKLE', 'TRISTLE',
      ]);
    },
  );

  it('the two race bytes the corpus actually uses are exactly the multi/single-class split', () => {
    // 14/14: every record whose class byte is a MULTI-class entry (14 = Fighter/Thief,
    // 15 = Fighter/Magic-User/Thief) carries race byte 1, and every single-class record carries
    // race byte 5. Under the 0-based reading byte 5 is `Human` -- the ONE entry of the seven that
    // AD&D 1e, and this engine's own `isMultiClassAllowed`, forbid from multi-classing. That
    // correspondence is what the reading buys; under a uniform assignment of the seven labels to
    // byte 5 it would arise by chance 1 time in 7.
    const multi = ALL_GOLDEN.filter((g) => g.classCode >= 8);
    const single = ALL_GOLDEN.filter((g) => g.classCode < 8);
    expect(multi.map((g) => g.name).sort()).toEqual(['BINKY', 'CHERROD']);
    expect(new Set(multi.map((g) => g.race))).toEqual(new Set([1]));
    expect(single).toHaveLength(12);
    expect(new Set(single.map((g) => g.race))).toEqual(new Set([5]));
    expect(POOLS_TREASURES_RACE_LABEL[5]).toBe('Human');
    expect(isMultiClassAllowed('human')).toBe(false);
  });

  it('the paladin test: both class-byte-3 heroes read Human under the 0-based reading ONLY', () => {
    // The plan's stated discriminator, applied to the LABEL each reading assigns -- NOT to this
    // engine's post-mapping outcome, which is measured below and does NOT discriminate. Class byte
    // 3 is `Paladin` in each title's own adjacent class table; a 1e paladin is human-only.
    const paladins = ALL_GOLDEN.filter((g) => g.classCode === 3);
    expect(paladins.map((g) => g.name)).toEqual(['Guy de Valois', 'MAXWELL']);
    for (const p of paladins) {
      expect(p.race).toBe(5);
      expect(POOLS_TREASURES_RACE_LABEL[p.race]).toBe('Human');        // 0-based: legal
      expect(POOLS_TREASURES_RACE_LABEL[p.race - 1]).toBe('Halfling'); // 1-based: illegal
      expect(COAB_RACE_LABEL_FOR_TEST[p.race]).toBe('halfling');       // CoAB enum: illegal
    }
  });
});

describe('three-reading table over all 14 real pregens (the reading is argued, not located)', () => {
  /** Which `DragonlanceRaceId` each reading assigns to a raw race byte; `null` = no analog, which
   * every importer in this repo discloses and then falls back to `human` for.
   *
   * `ownTableZeroBased` is NOT a re-declared literal -- it IS
   * `POOLS_TREASURES_RACE_TO_DL`, imported directly from the shipping importer
   * (`apps/web/src/ui/importPoolsTreasuresParty.ts`). Scoring a local copy of this map would make
   * "the shipped reading accepts 14 of 14" a claim about a test fixture, not the shipped code --
   * exactly the failure mode this fix-up closes. `coabEnum` and `ownTableOneBased` stay local
   * literals: they are hypothetical/rejected alternatives that were never shipped, so there is no
   * "real" constant for them to import. */
  const READINGS: Record<string, Record<number, DragonlanceRaceId | null>> = {
    // Status quo before this round (`COAB_RACE_TO_DL`, a disclosed guess) -- never shipped for
    // these two titles once this round landed, kept here only as the falsified alternative.
    coabEnum: { 0: null, 1: 'mountainDwarf', 2: 'qualinestiElf', 3: null, 4: 'halfElf', 5: null, 6: null, 7: 'human' },
    // The SHIPPED reading: own table, 0-based -- the actual `POOLS_TREASURES_RACE_TO_DL` object,
    // not a copy of its literal.
    ownTableZeroBased: POOLS_TREASURES_RACE_TO_DL,
    // The named alternative: own table, 1-based (every index shifted by one) -- never shipped,
    // stays a local literal for the same reason `coabEnum` does.
    ownTableOneBased: { 1: 'qualinestiElf', 2: 'halfElf', 3: 'mountainDwarf', 4: null, 5: null, 6: 'human', 7: null },
  };

  const DL_SLOT: (DragonlanceClassId | null)[] = [
    'cleric', null, 'fighter', 'fighter', 'ranger', 'magicUser', 'thief', null,
  ];

  function classesOf(levels: number[]): Partial<Record<DragonlanceClassId, number>> {
    const out: Partial<Record<DragonlanceClassId, number>> = {};
    levels.forEach((v, i) => {
      const c = DL_SLOT[i];
      if (v > 0 && c) out[c] = Math.max(out[c] ?? 0, v);
    });
    return out;
  }

  async function scoreReading(reading: Record<number, DragonlanceRaceId | null>) {
    let accepted = 0;
    const rejected: string[] = [];
    const clamped: string[] = [];
    for (const g of ALL_GOLDEN) {
      const sc = decodePoolsTreasuresSavedCharacter(await readGolden(g));
      const race = (reading[sc.race] ?? 'human') as DragonlanceRaceId;
      const rawAbilities = {
        str: sc.abilities.str.full, int: sc.abilities.int.full, wis: sc.abilities.wis.full,
        dex: sc.abilities.dex.full, con: sc.abilities.con.full, cha: sc.abilities.cha.full,
        strPct: sc.abilities.str00.full,
      };
      const abilities = clampToRace(rawAbilities, race, 'male');
      const keys = Object.keys(rawAbilities) as (keyof typeof rawAbilities)[];
      if (keys.some((k) => rawAbilities[k] !== abilities[k])) clamped.push(sc.name.trim());
      const classes = classesOf(sc.classLevel);
      const res = createCharacter({
        name: sc.name.trim() || 'IMPORTED', race, sex: 'male', classes, abilities,
        deity: classes.cleric !== undefined ? 'mishakal' : undefined,
        hp: sc.hpMax, maxHp: sc.hpMax, baseAc: 10, levelCapRuleset: 'dqk',
      });
      if (res.ok) accepted++;
      else rejected.push(sc.name.trim());
    }
    return { accepted, rejected: rejected.sort(), clamped };
  }

  it.skipIf(!haveBoth)(
    "the CoAB enum (round 31's status quo) rejects exactly BINKY and CHERROD -- 12 of 14",
    async () => {
      const r = await scoreReading(READINGS.coabEnum);
      expect(r.accepted).toBe(12);
      expect(r.rejected).toEqual(['BINKY', 'CHERROD']);
      // Both rejections are translation artifacts, and these two lines name each mechanism: byte 1
      // read as mountainDwarf, whose DQK thief cap is 8 (BINKY is thief 13) and who may not be a
      // magic-user at all (CHERROD is F3/MU3/T4).
      expect(dqkMaxLevel('mountainDwarf', 'thief')).toBe(8);
      expect(allowsClass('mountainDwarf', 'magicUser')).toBe(false);
    },
  );

  it.skipIf(!haveBoth)(
    'the shipped 0-based own-table reading (the ACTUAL POOLS_TREASURES_RACE_TO_DL import, not a ' +
      'copy) accepts 14 of 14 with an empty rejection list, and clamps nobody',
    async () => {
      const r = await scoreReading(READINGS.ownTableZeroBased);
      expect(r.accepted).toBe(14);
      expect(r.rejected).toEqual([]);
      // Bar: "clampToRace delta -- number of heroes whose imported ability scores change".
      // MEASURED: zero, under this reading.
      expect(r.clamped).toEqual([]);
    },
  );

  it.skipIf(!haveBoth)(
    'MEASURED NON-DISCRIMINATOR: the 1-based reading ALSO accepts 14 of 14, so the import outcome ' +
      'cannot choose between the two own-table readings -- only the label they assign can',
    async () => {
      // The honest half of the finding, and it contradicts the natural expectation that "the party
      // comes out legal" selects the reading. Under 1-based, byte 5 reads `Halfling`, which has no
      // Dragonlance analog and therefore falls back to `human` ANYWAY -- producing the identical 12
      // sheets -- while byte 1 reads `Elf`, which may also multi-class. The outcome test falsifies
      // the CoAB enum and nothing else.
      const r = await scoreReading(READINGS.ownTableOneBased);
      expect(r.accepted).toBe(14);
      expect(r.rejected).toEqual([]);
      // Its one visible difference from the shipped reading is a clamp on CHERROD's exceptional-STR
      // percentile (qualinestiElf caps it at 75, halfElf at 90) -- one field on one hero, not a
      // legality signal.
      expect(r.clamped).toEqual(['CHERROD']);
    },
  );

  it.skipIf(!haveBoth)(
    'BINKY and CHERROD are legal under the shipped reading for the reasons the doc names',
    async () => {
      const binky = ALL_GOLDEN.find((g) => g.name === 'BINKY')!;
      const cherrod = ALL_GOLDEN.find((g) => g.name === 'CHERROD')!;
      expect(POOLS_TREASURES_RACE_LABEL[binky.race]).toBe('Half-Elf');
      expect(POOLS_TREASURES_RACE_LABEL[cherrod.race]).toBe('Half-Elf');
      expect(isMultiClassAllowed('halfElf')).toBe(true);
      expect(dqkMaxLevel('halfElf', 'thief')).toBeNull();     // BINKY thief 13 -- uncapped
      expect(dqkMaxLevel('halfElf', 'fighter')).toBe(9);      // BINKY fighter 8 -- inside the cap
      expect(allowsClass('halfElf', 'magicUser')).toBe(true); // CHERROD's magic-user slot
    },
  );
});

// --- Round 35 R4-fix-up: a party-cap refusal must still carry a live disagreement disclosure -----
//
// The corrected POOLS_TREASURES_RACE_TO_DL (scored directly above) makes Treasures' CHERROD legal,
// which lets her take the roster's 6th slot. Before this round's fix-up that slot instead went, by
// file order, to OUGO -- whose class byte disagrees with her own classLevel[8] array, and whose
// roster row therefore carried a bold "class byte and level array disagree" badge. Once CHERROD
// starts validating, OUGO is bumped to `rejectedPartyFull` instead, and a plain party-full refusal
// carries no hint that she was ever a disagreement. This block runs the ACTUAL shipping
// `importPoolsTreasuresParty()` (not a re-implementation) against the real Treasures fixtures, via a
// minimal real-file `AssetSource` (same shape as `dokImportAssetSource.test.ts`'s), and pins that
// the disclosure survives the refusal.

/** Reads real `CHRDATA{n}.SAV` bytes straight off disk by basename -- the importer only ever asks
 * for basenames (see `fetchSave`/`basenameOf` in `importPoolsTreasuresParty.ts`). */
function realFileAssetSource(dir: string): AssetSource {
  return {
    async readAsset(basename: string) {
      const path = resolve(dir, basename);
      if (!existsSync(path)) return null;
      return new Uint8Array(await readFile(path));
    },
  };
}

describe('importPoolsTreasuresParty (shipping importer, real Treasures fixtures) -- OUGO keeps her disagreement badge even when the party cap cuts her', () => {
  it.skipIf(!haveTreasures)(
    'CHERROD joins (round 35 R4 race fix intact) and OUGO is cut by the cap, not by her own bytes, ' +
      'with her disagreement carried in rejectedPartyFullDisagreements',
    async () => {
      const result = await importPoolsTreasuresParty('treasures', realFileAssetSource(TREASURES_DIR));

      // The R4 race-table fix is still live: CHERROD (a genuine, byte-agreeing multiclass) is now
      // legal and joins, displacing OUGO from the 6-hero cap. If this regresses back to CHERROD
      // being rejected as invalid, this line catches it first.
      expect(result.imported).toContain('CHERROD');
      expect(result.imported).toHaveLength(6);

      // OUGO does NOT appear in rejectedInvalid (her own bytes are fine -- she is only cut by the
      // cap) but DOES appear in rejectedPartyFull...
      expect(result.rejectedInvalid).not.toContain('OUGO');
      expect(result.rejectedPartyFull).toContain('OUGO');
      // ...and, this round's fix, ALSO in rejectedPartyFullDisagreements -- the disclosure that
      // would otherwise have silently vanished along with her roster row.
      expect(result.rejectedPartyFullDisagreements).toContain('OUGO');

      // Two-sided: nobody who agrees with their own class byte gets flagged as a disagreement, even
      // if they too are cut by the cap (SMOKE, the 8th record, agrees and is cut).
      expect(result.rejectedPartyFull).toContain('SMOKE');
      expect(result.rejectedPartyFullDisagreements).not.toContain('SMOKE');
    },
  );
});
