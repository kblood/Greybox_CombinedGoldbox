/**
 * R2 — Curse of the Azure Bonds saved-character loader tests. Golden values below were read
 * directly off the real GOG install's `SAVE/CHRDATA{1..6}.SAV` (see
 * `packages/engine/src/loaders/coabSavedCharacter.ts` for every offset's `Player.cs` citation),
 * not transcribed from the plan doc's probe. Skips if the GOG install isn't present on this
 * machine (never vendored into the repo).
 *
 * The "consistency oracle" (case 2 below) is the byte-faithfulness claim this importer rests on:
 * the `_class` byte@0x75 and the independently-stored `ClassLevel[8]`@0x109 array agree on all 6
 * real records. The shifted-offset null (case 3) proves the oracle can actually fail — decoding at
 * record start ±1 byte must NOT also pass 6/6, or the oracle isn't testing anything.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeCoabSavedCharacter,
  sniffCoabSavedCharacter,
  coabExpectedClassLevelSlots,
  coabDisplayThac0,
  coabDisplayBaseAc,
  COAB_SAVED_CHARACTER_SIZE,
  COAB_RACE_LABEL,
  COAB_CLASS_LABEL,
  COAB_CLASS_LEVEL_SLOT_LABEL,
} from '../src/index.js';

function makeSav(opts: {
  name: string;
  abilities: [number, number, number, number, number, number, number]; // str,int,wis,dex,con,cha,str00
  thac0: number;
  race: number;
  classCode: number;
  age: number;
  hpMax: number;
  classLevel: number[]; // 8
  sex: number;
  alignment: number;
  baseAc: number;
  exp: number;
  hitPointRolled: number;
}): Uint8Array {
  const raw = new Uint8Array(COAB_SAVED_CHARACTER_SIZE);
  raw[0] = opts.name.length;
  for (let i = 0; i < opts.name.length; i++) raw[1 + i] = opts.name.charCodeAt(i);
  for (let s = 0; s < 7; s++) {
    raw[0x10 + s * 2] = opts.abilities[s];
    raw[0x10 + s * 2 + 1] = opts.abilities[s];
  }
  raw[0x73] = opts.thac0 & 0xff;
  raw[0x74] = opts.race;
  raw[0x75] = opts.classCode;
  raw[0x76] = opts.age & 0xff;
  raw[0x77] = (opts.age >> 8) & 0xff;
  raw[0x78] = opts.hpMax;
  for (let i = 0; i < 8; i++) raw[0x109 + i] = opts.classLevel[i] ?? 0;
  raw[0x119] = opts.sex;
  raw[0x11b] = opts.alignment;
  raw[0x124] = opts.baseAc;
  raw[0x127] = opts.exp & 0xff;
  raw[0x128] = (opts.exp >> 8) & 0xff;
  raw[0x129] = (opts.exp >> 16) & 0xff;
  raw[0x12a] = (opts.exp >> 24) & 0xff;
  raw[0x12c] = opts.hitPointRolled;
  return raw;
}

describe('decodeCoabSavedCharacter — synthetic', () => {
  it('decodes name, abilities (incl. str00), thac0, race, class, level array, sex, alignment, ac, exp', () => {
    const raw = makeSav({
      name: 'TESTER',
      abilities: [18, 17, 16, 15, 14, 13, 75],
      thac0: 44,
      race: 7,
      classCode: 3, // paladin
      age: 20,
      hpMax: 49,
      classLevel: [0, 0, 0, 5, 0, 0, 0, 0],
      sex: 0,
      alignment: 0,
      baseAc: 50,
      exp: 25000,
      hitPointRolled: 34,
    });
    const c = decodeCoabSavedCharacter(raw);
    expect(c.name).toBe('TESTER');
    expect(c.abilities.str).toEqual({ cur: 18, full: 18 });
    expect(c.abilities.str00).toEqual({ cur: 75, full: 75 });
    expect(c.thac0).toBe(44);
    expect(coabDisplayThac0(c.thac0)).toBe(16);
    expect(c.race).toBe(7);
    expect(c.raceLabel).toBe('human');
    expect(c.classCode).toBe(3);
    expect(c.classLabel).toBe('paladin');
    expect(c.age).toBe(20);
    expect(c.hpMax).toBe(49);
    expect(c.classLevel).toEqual([0, 0, 0, 5, 0, 0, 0, 0]);
    expect(c.sex).toBe(0);
    expect(c.sexLabel).toBe('male');
    expect(c.alignment).toBe(0);
    expect(c.baseAc).toBe(50);
    expect(coabDisplayBaseAc(c.baseAc)).toBe(10);
    expect(c.exp).toBe(25000);
    expect(c.hitPointRolled).toBe(34);
  });

  it('does NOT clamp str00 to 25 (unlike the literal StatValue.Read, Player.cs:83-88) — MATHEW\'s real 100 must survive', () => {
    const raw = makeSav({
      name: 'X',
      abilities: [18, 10, 10, 10, 10, 10, 100],
      thac0: 40,
      race: 7,
      classCode: 2,
      age: 20,
      hpMax: 10,
      classLevel: [0, 0, 1, 0, 0, 0, 0, 0],
      sex: 0,
      alignment: 0,
      baseAc: 50,
      exp: 0,
      hitPointRolled: 5,
    });
    const c = decodeCoabSavedCharacter(raw);
    expect(c.abilities.str00.cur).toBe(100);
    expect(c.abilities.str00.full).toBe(100);
  });

  it('sniffs by size + sane PString length', () => {
    const raw = makeSav({
      name: 'X',
      abilities: [10, 10, 10, 10, 10, 10, 0],
      thac0: 40,
      race: 7,
      classCode: 2,
      age: 20,
      hpMax: 10,
      classLevel: [0, 0, 1, 0, 0, 0, 0, 0],
      sex: 0,
      alignment: 0,
      baseAc: 50,
      exp: 0,
      hitPointRolled: 5,
    });
    expect(sniffCoabSavedCharacter(raw)).toBe(true);
    expect(sniffCoabSavedCharacter(new Uint8Array(COAB_SAVED_CHARACTER_SIZE))).toBe(false); // name len 0
    expect(sniffCoabSavedCharacter(new Uint8Array(COAB_SAVED_CHARACTER_SIZE - 1))).toBe(false); // wrong size
  });
});

describe('coabExpectedClassLevelSlots', () => {
  it('maps a single-class code to its own slot', () => {
    expect(coabExpectedClassLevelSlots(0)).toEqual(new Set([0])); // cleric
    expect(coabExpectedClassLevelSlots(2)).toEqual(new Set([2])); // fighter
    expect(coabExpectedClassLevelSlots(3)).toEqual(new Set([3])); // paladin
    expect(coabExpectedClassLevelSlots(5)).toEqual(new Set([5])); // magic_user
    expect(coabExpectedClassLevelSlots(6)).toEqual(new Set([6])); // thief
  });
  it('maps a multiclass mc_X_Y code to both component slots', () => {
    expect(coabExpectedClassLevelSlots(14)).toEqual(new Set([2, 6])); // mc_f_t: fighter+thief
    expect(coabExpectedClassLevelSlots(13)).toEqual(new Set([2, 5])); // mc_f_mu: fighter+magic_user
  });
  it('returns null for the unknown code', () => {
    expect(coabExpectedClassLevelSlots(17)).toBeNull();
    expect(coabExpectedClassLevelSlots(99)).toBeNull();
  });
});

// --- Golden: the real GOG install's 6 pregens ---

const saveDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE';
const chr1 = resolve(saveDir, 'CHRDATA1.SAV');
const haveSaves = existsSync(chr1);

interface Golden {
  file: string;
  name: string;
  race: number;
  raceLabel: string;
  classCode: number;
  classLabel: string;
  classLevel: number[];
  thac0: number;
  hpMax: number;
  sex: number;
  alignment: number;
  exp: number;
}

const GOLDEN: Golden[] = [
  { file: 'CHRDATA1.SAV', name: 'MATHEW', race: 7, raceLabel: 'human', classCode: 3, classLabel: 'paladin', classLevel: [0, 0, 0, 5, 0, 0, 0, 0], thac0: 44, hpMax: 49, sex: 0, alignment: 0, exp: 25000 },
  { file: 'CHRDATA2.SAV', name: 'MARK', race: 7, raceLabel: 'human', classCode: 3, classLabel: 'paladin', classLevel: [0, 0, 0, 5, 0, 0, 0, 0], thac0: 44, hpMax: 51, sex: 0, alignment: 0, exp: 25000 },
  { file: 'CHRDATA3.SAV', name: 'TRAVIS', race: 1, raceLabel: 'dwarf', classCode: 14, classLabel: 'mc_f_t', classLevel: [0, 0, 4, 0, 0, 0, 5, 0], thac0: 43, hpMax: 34, sex: 0, alignment: 4, exp: 12500 },
  { file: 'CHRDATA4.SAV', name: 'LEDERA', race: 2, raceLabel: 'elf', classCode: 13, classLabel: 'mc_f_mu', classLevel: [0, 0, 4, 0, 0, 4, 0, 0], thac0: 43, hpMax: 28, sex: 0, alignment: 0, exp: 12500 },
  { file: 'CHRDATA5.SAV', name: 'SHARA', race: 7, raceLabel: 'human', classCode: 0, classLabel: 'cleric', classLevel: [5, 0, 0, 0, 0, 0, 0, 0], thac0: 42, hpMax: 29, sex: 1, alignment: 0, exp: 25000 },
  { file: 'CHRDATA6.SAV', name: 'PHILIPPE', race: 7, raceLabel: 'human', classCode: 5, classLabel: 'magic_user', classLevel: [0, 0, 0, 0, 0, 5, 0, 0], thac0: 40, hpMax: 27, sex: 1, alignment: 0, exp: 25000 },
];

describe('decodeCoabSavedCharacter — golden GOG SAVE pregens', () => {
  it.skipIf(!haveSaves)('decodes all 6 real pregens with their verified stats', async () => {
    for (const g of GOLDEN) {
      const raw = new Uint8Array(await readFile(resolve(saveDir, g.file)));
      expect(raw.length).toBe(COAB_SAVED_CHARACTER_SIZE);
      const c = decodeCoabSavedCharacter(raw);
      expect(c.name).toBe(g.name);
      expect(c.race).toBe(g.race);
      expect(c.raceLabel).toBe(g.raceLabel);
      expect(c.classCode).toBe(g.classCode);
      expect(c.classLabel).toBe(g.classLabel);
      expect(c.classLevel).toEqual(g.classLevel);
      expect(c.thac0).toBe(g.thac0);
      expect(c.hpMax).toBe(g.hpMax);
      expect(c.sex).toBe(g.sex);
      expect(c.alignment).toBe(g.alignment);
      expect(c.exp).toBe(g.exp);
    }
  });

  it.skipIf(!haveSaves)(
    'consistency oracle: the _class byte and the ClassLevel[8] array agree on all 6 real records — ' +
      'the byte-faithfulness claim this importer rests on',
    async () => {
      let accept = 0;
      for (const g of GOLDEN) {
        const raw = new Uint8Array(await readFile(resolve(saveDir, g.file)));
        const c = decodeCoabSavedCharacter(raw);
        const expected = coabExpectedClassLevelSlots(c.classCode);
        const actual = new Set(c.classLevel.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0));
        if (expected !== null && expected.size > 0 && setsEqual(expected, actual)) accept++;
      }
      expect(accept).toBe(6);
    },
  );

  it.skipIf(!haveSaves)(
    'shifted-offset null: decoding at record start +-1 byte must NOT also pass the oracle ' +
      '(reports all three counts; true offset must dominate)',
    async () => {
      const counts: Record<number, number> = { [-1]: 0, [0]: 0, [1]: 0 };
      for (const shift of [-1, 0, 1]) {
        for (const g of GOLDEN) {
          const full = new Uint8Array(await readFile(resolve(saveDir, g.file)));
          // Build a COAB_SAVED_CHARACTER_SIZE-byte window starting `shift` bytes into the file,
          // zero-padding past either end so decodeCoabSavedCharacter never throws on size.
          const window = new Uint8Array(COAB_SAVED_CHARACTER_SIZE);
          for (let i = 0; i < COAB_SAVED_CHARACTER_SIZE; i++) {
            const srcIdx = i + shift;
            window[i] = srcIdx >= 0 && srcIdx < full.length ? full[srcIdx] : 0;
          }
          const c = decodeCoabSavedCharacter(window);
          const expected = coabExpectedClassLevelSlots(c.classCode);
          const actual = new Set(c.classLevel.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0));
          if (expected !== null && expected.size > 0 && setsEqual(expected, actual)) counts[shift]++;
        }
      }
      // Numbers reported in the R2 handoff: shift=-1 -> 0/6, shift=0 -> 6/6, shift=+1 -> 0/6.
      expect(counts[0]).toBe(6);
      expect(counts[-1]).toBe(0);
      expect(counts[1]).toBe(0);
    },
  );
});

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

describe('COAB_RACE_LABEL / COAB_CLASS_LABEL / COAB_CLASS_LEVEL_SLOT_LABEL — transcribed from Enums.cs', () => {
  it('has the 8 Race members', () => {
    expect(Object.keys(COAB_RACE_LABEL)).toHaveLength(8);
    expect(COAB_RACE_LABEL[7]).toBe('human');
  });
  it('has the 18 ClassId members', () => {
    expect(Object.keys(COAB_CLASS_LABEL)).toHaveLength(18);
    expect(COAB_CLASS_LABEL[17]).toBe('unknown');
  });
  it('has the 8 SkillType slots in ClassLevel array order', () => {
    expect(COAB_CLASS_LEVEL_SLOT_LABEL).toEqual([
      'cleric', 'druid', 'fighter', 'paladin', 'ranger', 'magic_user', 'thief', 'monk',
    ]);
  });
});

// --- R3: the cross-title null becomes a standing test ---
//
// `tools/goldbox_capabilities.json:271` (as of a63efc6) says the cross-title null "is a
// one-time measurement ... NOT a standing test — nothing goes red if it silently stops
// holding". This describe block is that standing test: it reapplies CoAB's OWN fixed offsets
// (class byte@0x75, ClassLevel[8]@0x109..0x110) directly to the raw bytes of all four titles'
// CHRDATA saves, at whatever size those titles' records actually are (`decodeCoabSavedCharacter`
// itself throws on any length != 422, `coabSavedCharacter.ts:269`, so it cannot be reused here —
// the oracle is re-applied locally instead, exactly the way the R2 one-time measurement did it).
//
// Counts pinned here (measured on the real GOG installs, not restated from the plan doc):
// Curse 6/6 (the home title — this is the calibration case), Secret 1/6 (MALACHITE, and ONLY
// because a coincidental zero-region class byte + a coincidentally-placed nonzero level byte
// line up — see docs/engine/research/secret-chrdata-layout.md for the real offset, which is
// nowhere near CoAB's), Pools 0/6, Treasures 0/8.

/** Apply the CoAB oracle (class byte@0x75, ClassLevel[8]@0x109..0x110) directly to raw bytes of
 * ANY length — deliberately bypassing `decodeCoabSavedCharacter`'s 422-byte-only guard, since
 * this test exists precisely to ask whether CoAB's fixed offsets mean anything on a
 * differently-sized record. Local to this test file — `coabSavedCharacter.ts` is out of scope
 * for R3 (must-not-touch list). */
function oracleAcceptsAtCoabOffsets(raw: Uint8Array): boolean {
  const classCode = raw[0x75];
  const expected = coabExpectedClassLevelSlots(classCode);
  if (expected === null || expected.size === 0) return false;
  const actual = new Set<number>();
  for (let i = 0; i < 8; i++) {
    if (raw[0x109 + i] !== 0) actual.add(i);
  }
  return setsEqual(expected, actual);
}

/** `PString`@0x00 read for a raw record of any length — mirrors the private `readPString` in
 * `coabSavedCharacter.ts`, duplicated here rather than exported (must-not-touch list). */
function readNameAtOffsetZero(raw: Uint8Array, maxLen = 15): string {
  const len = Math.min(raw[0] ?? 0, maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = raw[1 + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

const CURSE_SAVE_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE';
// Secret's CHRDATA files are in the GOG install ROOT — its SAVE\ subfolder is empty (verified
// on-disk, not assumed from the plan doc).
const SECRET_SAVE_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades';
const POOLS_SAVE_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE';
const TREASURES_SAVE_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE';

const haveCurseCross = existsSync(resolve(CURSE_SAVE_DIR, 'CHRDATA1.SAV'));
const haveSecretCross = existsSync(resolve(SECRET_SAVE_DIR, 'CHRDATA1.SAV'));
const havePoolsCross = existsSync(resolve(POOLS_SAVE_DIR, 'CHRDATA1.SAV'));
const haveTreasuresCross = existsSync(resolve(TREASURES_SAVE_DIR, 'CHRDATA1.SAV'));

async function loadRawRecords(dir: string, count: number): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(new Uint8Array(await readFile(resolve(dir, `CHRDATA${i}.SAV`))));
  }
  return out;
}

describe('cross-title null — CoAB\'s own fixed offsets (0x75, 0x109) applied to the other three ' +
  'Forgotten Realms trilogy titles\' CHRDATA saves (standing test for goldbox_capabilities.json:271)', () => {
  it.skipIf(!haveCurseCross)('Curse (422-byte, the home title): 6/6 accept — the calibration case', async () => {
    const records = await loadRawRecords(CURSE_SAVE_DIR, 6);
    const accept = records.filter(oracleAcceptsAtCoabOffsets).length;
    expect(accept).toBe(6);
  });

  it.skipIf(!haveSecretCross)(
    'Secret (439-byte): 1/6 accept, and it is MALACHITE — a coincidence, not a partial layout ' +
      'overlap (see docs/engine/research/secret-chrdata-layout.md for the real offset)',
    async () => {
      const records = await loadRawRecords(SECRET_SAVE_DIR, 6);
      const passing = records.filter(oracleAcceptsAtCoabOffsets);
      expect(passing.length).toBe(1);
      expect(readNameAtOffsetZero(passing[0])).toBe('MALACHITE');
    },
  );

  it.skipIf(!havePoolsCross)('Pools (510-byte): 0/6 accept', async () => {
    const records = await loadRawRecords(POOLS_SAVE_DIR, 6);
    const accept = records.filter(oracleAcceptsAtCoabOffsets).length;
    expect(accept).toBe(0);
  });

  it.skipIf(!haveTreasuresCross)('Treasures (510-byte): 0/8 accept', async () => {
    const records = await loadRawRecords(TREASURES_SAVE_DIR, 8);
    const accept = records.filter(oracleAcceptsAtCoabOffsets).length;
    expect(accept).toBe(0);
  });
});
