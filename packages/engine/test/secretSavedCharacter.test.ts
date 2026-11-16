/**
 * R2 — Secret of the Silver Blades saved-character loader tests. Golden values below were read
 * directly off the real GOG install's `CHRDATA{1..6}.SAV` (install root — its `SAVE\` is empty),
 * not transcribed from the plan doc's probe. Skips if the GOG install isn't present on this
 * machine (never vendored into the repo).
 *
 * These tests reproduce every oracle `packages/engine/src/loaders/secretSavedCharacter.ts`'s file
 * doc claims, rather than trusting the plan/doc's numbers: the ability-block uniqueness sweep, the
 * THAC0-vs-addnd1e-table check, the exp-vs-XP-progression-table check, the shifted-offset negative,
 * and a cross-title null (Secret's own offsets applied to CURSE bytes must NOT also accept).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeGen1SavedCharacter,
  sniffGen1SavedCharacter,
  decodeSecretSavedCharacter,
  sniffSecretSavedCharacter,
  SECRET_SAVED_CHARACTER_LAYOUT,
  SECRET_SAVED_CHARACTER_SIZE,
  POOLS_TREASURES_SAVED_CHARACTER_LAYOUT,
  coabExpectedClassLevelSlots,
  COAB_RACE_LABEL,
  bestThac0,
  xpForLevel,
  allowsClass,
  isMultiClassAllowed,
  dqkMaxLevel,
  type Gen1SavedCharacterLayout,
  type ClassSlot,
  type ClassId,
} from '../src/index.js';
// NOT (yet) exported from '../src/index.js' -- `index.ts` is Phase B territory this round
// (ground rule 10's Phase-B file list). Imported directly from the loader so this test does not
// wait on that wiring; the missing index.ts export is filed as a Phase B patch in the report.
import { SECRET_RACE_LABEL } from '../src/loaders/secretSavedCharacter.js';

// --- Synthetic record builder -----------------------------------------------------------------

function makeSecretSav(opts: {
  name: string;
  abilities: [number, number, number, number, number, number, number]; // str,int,wis,dex,con,cha,str00
  thac0: number;
  race: number;
  classCode: number;
  extraByte: number; // the unverified 0x6d byte
  age: number;
  hpMax: number;
  classLevel: number[]; // 8
  baseAc: number;
  exp: number;
}): Uint8Array {
  const raw = new Uint8Array(SECRET_SAVED_CHARACTER_SIZE);
  raw[0] = opts.name.length;
  for (let i = 0; i < opts.name.length; i++) raw[1 + i] = opts.name.charCodeAt(i);
  for (let s = 0; s < 7; s++) {
    raw[0x10 + s * 2] = opts.abilities[s];
    raw[0x10 + s * 2 + 1] = opts.abilities[s];
  }
  raw[0x6a] = opts.thac0 & 0xff;
  raw[0x6b] = opts.race;
  raw[0x6c] = opts.classCode;
  raw[0x6d] = opts.extraByte;
  raw[0x6e] = opts.age & 0xff;
  raw[0x6f] = (opts.age >> 8) & 0xff;
  raw[0x70] = opts.hpMax;
  for (let i = 0; i < 8; i++) raw[0x111 + i] = opts.classLevel[i] ?? 0;
  raw[0x129] = opts.baseAc;
  raw[0x12c] = opts.exp & 0xff;
  raw[0x12d] = (opts.exp >> 8) & 0xff;
  raw[0x12e] = (opts.exp >> 16) & 0xff;
  raw[0x12f] = (opts.exp >> 24) & 0xff;
  return raw;
}

describe('decodeGen1SavedCharacter / decodeSecretSavedCharacter — synthetic', () => {
  it('decodes name, abilities (incl. str00), thac0, race (raw), class, classLevel, hpMax, age, baseAc, exp, and the unverified byte', () => {
    const raw = makeSecretSav({
      name: 'TESTER',
      abilities: [18, 17, 16, 15, 14, 13, 75],
      thac0: 44,
      race: 6,
      classCode: 3, // paladin
      extraByte: 9,
      age: 20,
      hpMax: 95,
      classLevel: [0, 0, 0, 8, 0, 0, 0, 0],
      baseAc: 0x32,
      exp: 200000,
    });
    const c = decodeSecretSavedCharacter(raw);
    expect(c.name).toBe('TESTER');
    expect(c.abilities.str).toEqual({ cur: 18, full: 18 });
    expect(c.abilities.str00).toEqual({ cur: 75, full: 75 });
    expect(c.thac0).toBe(44);
    expect(c.race).toBe(6); // RAW byte, unchanged
    expect(c.raceLabel).toBe('Human'); // round 34 R3 -- SECRET_RACE_LABEL[6], from Secret's own START.EXE table
    expect(c.classCode).toBe(3);
    expect(c.classLabel).toBe('paladin');
    expect(c.age).toBe(20);
    expect(c.hpMax).toBe(95);
    expect(c.classLevel).toEqual([0, 0, 0, 8, 0, 0, 0, 0]);
    expect(c.baseAc).toBe(0x32);
    expect(c.exp).toBe(200000);
    expect(c.unverified).toEqual([{ offset: 0x6d, byte: 9 }]);
  });

  it('sniffs by size + sane PString length', () => {
    const raw = makeSecretSav({
      name: 'X',
      abilities: [10, 10, 10, 10, 10, 10, 0],
      thac0: 40,
      race: 6,
      classCode: 2,
      extraByte: 0,
      age: 20,
      hpMax: 10,
      classLevel: [0, 0, 1, 0, 0, 0, 0, 0],
      baseAc: 0x32,
      exp: 0,
    });
    expect(sniffSecretSavedCharacter(raw)).toBe(true);
    expect(sniffSecretSavedCharacter(new Uint8Array(SECRET_SAVED_CHARACTER_SIZE))).toBe(false); // name len 0
    expect(sniffSecretSavedCharacter(new Uint8Array(SECRET_SAVED_CHARACTER_SIZE - 1))).toBe(false); // wrong size
  });

  it('throws on any size other than 439', () => {
    const raw = new Uint8Array(438);
    expect(() => decodeSecretSavedCharacter(raw)).toThrow(/439/);
  });

  it('sniffGen1SavedCharacter is the layout-parameterised form sniffSecretSavedCharacter delegates to', () => {
    const raw = makeSecretSav({
      name: 'X',
      abilities: [10, 10, 10, 10, 10, 10, 0],
      thac0: 40,
      race: 6,
      classCode: 2,
      extraByte: 0,
      age: 20,
      hpMax: 10,
      classLevel: [0, 0, 1, 0, 0, 0, 0, 0],
      baseAc: 0x32,
      exp: 0,
    });
    expect(sniffGen1SavedCharacter(raw, SECRET_SAVED_CHARACTER_LAYOUT)).toBe(true);
    expect(sniffGen1SavedCharacter(raw, { ...SECRET_SAVED_CHARACTER_LAYOUT, size: 422 })).toBe(false);
  });
});

// --- Golden: the real GOG install's 6 pregens ---------------------------------------------------

const SECRET_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades';
const chr1 = resolve(SECRET_DIR, 'CHRDATA1.SAV');
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
  age: number;
  hpMax: number;
  baseAc: number;
  exp: number;
  extraByte: number;
}

const GOLDEN: Golden[] = [
  { file: 'CHRDATA1.SAV', name: 'Guy de Valois', race: 6, raceLabel: 'Human', classCode: 3, classLabel: 'paladin', classLevel: [0, 0, 0, 8, 0, 0, 0, 0], thac0: 47, age: 20, hpMax: 95, baseAc: 0x32, exp: 200000, extraByte: 1 },
  { file: 'CHRDATA2.SAV', name: 'PAINE', race: 6, raceLabel: 'Human', classCode: 4, classLabel: 'ranger', classLevel: [0, 0, 0, 0, 8, 0, 0, 0], thac0: 47, age: 22, hpMax: 74, baseAc: 0x32, exp: 200000, extraByte: 0 },
  { file: 'CHRDATA3.SAV', name: 'EPONA', race: 6, raceLabel: 'Human', classCode: 2, classLabel: 'fighter', classLevel: [0, 0, 8, 0, 0, 0, 0, 0], thac0: 47, age: 17, hpMax: 91, baseAc: 0x32, exp: 200000, extraByte: 0 },
  { file: 'CHRDATA4.SAV', name: 'MALACHITE', race: 3, raceLabel: 'Dwarf', classCode: 14, classLabel: 'mc_f_t', classLevel: [0, 0, 7, 0, 0, 0, 8, 0], thac0: 46, age: 60, hpMax: 58, baseAc: 0x32, exp: 100000, extraByte: 0 },
  { file: 'CHRDATA5.SAV', name: 'DOMINIC', race: 6, raceLabel: 'Human', classCode: 0, classLabel: 'cleric', classLevel: [8, 0, 0, 0, 0, 0, 0, 0], thac0: 44, age: 19, hpMax: 78, baseAc: 0x32, exp: 200000, extraByte: 0 },
  { file: 'CHRDATA6.SAV', name: 'MORGAINE', race: 6, raceLabel: 'Human', classCode: 5, classLabel: 'magic_user', classLevel: [0, 0, 0, 0, 0, 9, 0, 0], thac0: 41, age: 27, hpMax: 35, baseAc: 0x32, exp: 200000, extraByte: 0 },
];

async function readGolden(g: Golden): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(SECRET_DIR, g.file)));
}

describe('decodeSecretSavedCharacter — golden GOG install pregens', () => {
  it.skipIf(!haveSaves)('decodes all 6 real pregens with their verified stats (name is trimmed of the trailing PString padding for comparison)', async () => {
    for (const g of GOLDEN) {
      const raw = await readGolden(g);
      expect(raw.length).toBe(SECRET_SAVED_CHARACTER_SIZE);
      const c = decodeSecretSavedCharacter(raw);
      expect(c.name.trim()).toBe(g.name);
      expect(c.race).toBe(g.race);
      expect(c.raceLabel).toBe(g.raceLabel);
      expect(c.classCode).toBe(g.classCode);
      expect(c.classLabel).toBe(g.classLabel);
      expect(c.classLevel).toEqual(g.classLevel);
      expect(c.thac0).toBe(g.thac0);
      expect(c.age).toBe(g.age);
      expect(c.hpMax).toBe(g.hpMax);
      expect(c.baseAc).toBe(g.baseAc);
      expect(c.exp).toBe(g.exp);
      expect(c.unverified).toEqual([{ offset: 0x6d, byte: g.extraByte }]);
    }
  });

  it.skipIf(!haveSaves)(
    'MEASURED oracle 1/4 -- abilities uniqueness sweep: 0x10 is the ONLY offset in 0..(size-12) ' +
      'where all 6 real records show six (cur,full) pairs, cur==full, values 3..18, with at least ' +
      'one pair varying across the party',
    async () => {
      const raws = await Promise.all(GOLDEN.map(readGolden));
      const hits: number[] = [];
      for (let off = 0; off <= SECRET_SAVED_CHARACTER_SIZE - 12; off++) {
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
      // Reject count is every other offset in the search space.
      const searchSpace = SECRET_SAVED_CHARACTER_SIZE - 12 + 1;
      expect(hits).toEqual([0x10]);
      expect(searchSpace - hits.length).toBe(searchSpace - 1); // exactly 1 accept, the rest reject
    },
  );

  it.skipIf(!haveSaves)(
    'MEASURED oracle 2/4 -- thac0@0x6a: 0x3C - raw equals this engine\'s own bestThac0() for the ' +
      'record\'s pinned classLevel slots, 6/6 (incl. the one multiclass record, MALACHITE, whose ' +
      'stored value is the MINIMUM of fighter-7 and thief-8, not either alone)',
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
      for (const g of GOLDEN) {
        const raw = await readGolden(g);
        const c = decodeSecretSavedCharacter(raw);
        const displayThac0 = 0x3c - c.thac0;
        const slots: ClassSlot[] = c.classLevel
          .map((level, i) => ({ classId: SLOT_TO_CLASS[SLOT_LABEL_ORDER[i]], level }))
          .filter((s): s is ClassSlot => s.level > 0 && s.classId !== null);
        const expected = bestThac0(slots);
        if (expected === displayThac0) accept++;
      }
      expect(accept).toBe(6);
    },
  );

  it.skipIf(!haveSaves)(
    'MEASURED oracle 3/4 -- exp@0x12c: for every active class/level, xpForLevel(class, level) <= ' +
      'exp < xpForLevel(class, level + 1), 6/6 (both class ranges checked for the multiclass record)',
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
      for (const g of GOLDEN) {
        const raw = await readGolden(g);
        const c = decodeSecretSavedCharacter(raw);
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
      expect(accept).toBe(6);
    },
  );

  it.skipIf(!haveSaves)(
    'MEASURED oracle 4/4 (consistency): the _class byte@0x6c and the ClassLevel[8]@0x111 array ' +
      'agree via coabExpectedClassLevelSlots on all 6 real records -- the same two-field oracle ' +
      'coabSavedCharacter.ts rests on, reused unmodified',
    async () => {
      let accept = 0;
      for (const g of GOLDEN) {
        const raw = await readGolden(g);
        const c = decodeSecretSavedCharacter(raw);
        const expected = coabExpectedClassLevelSlots(c.classCode);
        const actual = new Set(c.classLevel.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0));
        if (expected !== null && expected.size > 0 && setsEqual(expected, actual)) accept++;
      }
      expect(accept).toBe(6);
    },
  );

  it.skipIf(!haveSaves)(
    'shifted-offset negative (MUTATION i): reading class at 0x6b or 0x6d instead of the real 0x6c ' +
      'breaks the consistency oracle (does NOT also reach 6/6)',
    async () => {
      const raws = await Promise.all(GOLDEN.map(readGolden));
      const acceptAt = (classOffset: number) => {
        let accept = 0;
        for (const raw of raws) {
          const classCode = raw[classOffset];
          const expected = coabExpectedClassLevelSlots(classCode);
          const actual = new Set<number>();
          for (let i = 0; i < 8; i++) if (raw[0x111 + i] !== 0) actual.add(i);
          if (expected !== null && expected.size > 0 && setsEqual(expected, actual)) accept++;
        }
        return accept;
      };
      // Real observed numbers (reported in the R2 handoff): 0x6b -> 0/6, 0x6d -> 1/6 (a partial
      // coincidence, same shape as CoAB's own MALACHITE-vs-0x75 coincidence), 0x6c -> 6/6.
      expect(acceptAt(0x6b)).toBe(0);
      expect(acceptAt(0x6d)).toBe(1);
      expect(acceptAt(0x6c)).toBe(6); // the real offset, for contrast
    },
  );
});

const SLOT_LABEL_ORDER = ['cleric', 'druid', 'fighter', 'paladin', 'ranger', 'magic_user', 'thief', 'monk'];

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// --- The null: Secret's own offsets applied to a DIFFERENT title must NOT also accept -----------

const CURSE_SAVE_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE';
const haveCurseCross = existsSync(resolve(CURSE_SAVE_DIR, 'CHRDATA1.SAV'));

describe('cross-title null -- Secret\'s own offsets (0x6c, 0x111) applied to CURSE\'s 422-byte records', () => {
  it.skipIf(!haveCurseCross)(
    'MUTATION ii, part 1: decoding a 422-byte Curse record under the 439-byte SECRET_SAVED_CHARACTER_LAYOUT throws on LENGTH alone (not yet a test of the oracle)',
    async () => {
      const raw = new Uint8Array(await readFile(resolve(CURSE_SAVE_DIR, 'CHRDATA1.SAV')));
      expect(raw.length).toBe(422);
      expect(() => decodeGen1SavedCharacter(raw, SECRET_SAVED_CHARACTER_LAYOUT)).toThrow(/439/);
    },
  );

  it.skipIf(!haveCurseCross)(
    'MUTATION ii, part 2: with a synthetic 422-byte variant of the Secret layout (bypassing the ' +
      'length guard), the class/classLevel oracle still rejects Curse\'s real bytes 6/6 -- proving ' +
      'the earlier throw was not doing the real work',
    async () => {
      const layout422: Gen1SavedCharacterLayout = { ...SECRET_SAVED_CHARACTER_LAYOUT, size: 422 };
      let accept = 0;
      for (let i = 1; i <= 6; i++) {
        const raw = new Uint8Array(await readFile(resolve(CURSE_SAVE_DIR, `CHRDATA${i}.SAV`)));
        const c = decodeGen1SavedCharacter(raw, layout422); // does not throw: size matches layout422
        const expected = coabExpectedClassLevelSlots(c.classCode);
        const actual = new Set(c.classLevel.map((v, idx) => (v !== 0 ? idx : -1)).filter((idx) => idx >= 0));
        if (expected !== null && expected.size > 0 && setsEqual(expected, actual)) accept++;
      }
      expect(accept).toBe(0);
    },
  );
});

// --- Round 34 R3: SECRET_RACE_LABEL, its wiring, and the three named alternatives ---------------

describe('SECRET_RACE_LABEL — Secret\'s own START.EXE race string table (tools/secret_race_table.py re-derives these bytes)', () => {
  it('is the 8-entry table at unpacked file offset 0xEB91, stride 9, 0-based', () => {
    expect(SECRET_RACE_LABEL).toEqual({
      0: 'Tribble',
      1: 'Elf',
      2: 'Half-Elf',
      3: 'Dwarf',
      4: 'Gnome',
      5: 'Halfling',
      6: 'Human',
      7: 'Monster',
    });
  });

  it('SECRET_SAVED_CHARACTER_LAYOUT wires raceLabelTable to SECRET_RACE_LABEL', () => {
    expect(SECRET_SAVED_CHARACTER_LAYOUT.raceLabelTable).toBe(SECRET_RACE_LABEL);
  });

  // SUPERSEDED BY ROUND 35 R4, deliberately. This assertion used to read
  // `expect(POOLS_TREASURES_SAVED_CHARACTER_LAYOUT.raceLabelTable).toBeUndefined()`, guarding
  // round 34's "additive only" promise: Secret got its own race table and no OTHER title's
  // decode was allowed to move. That promise was correct FOR ROUND 34 and it has now been
  // discharged on purpose -- round 35 R4's whole task was to locate Pools' and Treasures' own
  // tables, and it did: Pools at unpacked GAME.EXE 0xAEAD, Treasures at 0xD454, both stride 9 x7
  // (Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster), each located from its OWN binary's
  // class-table landmark and its stride measured from its own Elf->Half-Elf delta rather than
  // copied across. The fencepost null discriminates for both: 7/7 plausible short PStrings at the
  // real base, 0 at every one of the 16 shifted bases (+/-1..8).
  //
  // So this file now asserts the OPPOSITE, and that is a corrected expectation, not a weakened
  // one -- the flip is backed by located bytes and a measured null, which is exactly the bar this
  // repo requires before a pin may move. Note the standing caveat R4 itself refused to drop: the
  // race byte is read 0-BASED by argument from consequence, NOT from a located indexing
  // instruction (`imul r16, imm8` has zero hits in these 8086-targeted builds), so the constant,
  // the importer and the memo all carry the phrase "argued by consequence".
  it('is NO LONGER additive, on purpose: POOLS_TREASURES_SAVED_CHARACTER_LAYOUT now wires its own ' +
    'raceLabelTable (round 35 R4 located Pools 0xAEAD / Treasures 0xD454, fencepost null 7/7 vs ' +
    '0/16 shifts), superseding round 34\'s "no other title moves" guarantee', () => {
    expect(POOLS_TREASURES_SAVED_CHARACTER_LAYOUT.raceLabelTable).toBeDefined();
    // The two titles' table is NOT Secret's: Secret's has 8 entries with a leading Tribble, so
    // its byte 5 is Halfling where these two read Human. A shared-table shortcut would fail here.
    expect(POOLS_TREASURES_SAVED_CHARACTER_LAYOUT.raceLabelTable).not.toBe(SECRET_RACE_LABEL);
  });

  it('decodeGen1SavedCharacter leaves raceLabel undefined when the layout sets no raceLabelTable ' +
    '(exercises the actual decode path Pools/Treasures runs through, not just the layout object)', () => {
    const layoutWithoutTable: Gen1SavedCharacterLayout = { ...SECRET_SAVED_CHARACTER_LAYOUT, raceLabelTable: undefined };
    const raw = new Uint8Array(SECRET_SAVED_CHARACTER_SIZE);
    raw[0] = 1;
    raw[1] = 88; // 'X'
    raw[0x6b] = 6; // would be "Human" under Secret's own table
    const c = decodeGen1SavedCharacter(raw, layoutWithoutTable);
    expect(c.race).toBe(6);
    expect(c.raceLabel).toBeUndefined();
  });

  it('a race byte outside the table\'s 0..7 range decodes raceLabel as undefined, not a guess', () => {
    const raw = new Uint8Array(SECRET_SAVED_CHARACTER_SIZE);
    raw[0] = 1;
    raw[1] = 88;
    raw[0x6b] = 200;
    const c = decodeSecretSavedCharacter(raw);
    expect(c.race).toBe(200);
    expect(c.raceLabel).toBeUndefined();
  });

  // --- The three alternatives the plan requires be rejected by code, not fit ------------------

  it('REJECTS alternative (ii), CoAB\'s OWN Race enum, by quoting that enum\'s code: CoAB\'s ' +
    '3 = gnome and 6 = half_orc, neither of which is a Dragonlance race -- this is why ' +
    'importSecretParty.ts\'s predecessor (round 30) already found trying CoAB\'s table on ' +
    'Secret\'s bytes to be a dead end, before this round ever looked for Secret\'s OWN table', () => {
    expect(COAB_RACE_LABEL[3]).toBe('gnome');
    expect(COAB_RACE_LABEL[6]).toBe('half_orc');
  });

  it('REJECTS alternative (i), reusing FRUA\'s own numeric race codes (0=Elf,1=Half-Elf,2=Dwarf,' +
    '3=Gnome,4=Halfling,5=Human,6=Monster -- hackdocs_extracted/CCHFORM.TXT) directly against ' +
    'Secret\'s bytes, by showing Secret\'s own table is that SAME 7-entry list, in the SAME order, ' +
    'with an extra 8th slot (Tribble) prepended -- so applying FRUA\'s numbers to Secret\'s bytes ' +
    'reads Secret\'s table one slot short, not a plausible alternative encoding', () => {
    const secretEntries = Object.values(SECRET_RACE_LABEL);
    const fruaOrder = ['Elf', 'Half-Elf', 'Dwarf', 'Gnome', 'Halfling', 'Human', 'Monster'];
    expect(secretEntries.slice(1)).toEqual(fruaOrder);
    // Under FRUA's own numbering applied directly, byte 3 = Gnome and byte 6 = Monster --
    // DIFFERENT names than the 0-based read of Secret's own table gives for the SAME bytes.
    expect(fruaOrder[3]).toBe('Gnome');
    expect(fruaOrder[6]).toBe('Monster');
    expect(SECRET_RACE_LABEL[3]).not.toBe(fruaOrder[3]);
    expect(SECRET_RACE_LABEL[6]).not.toBe(fruaOrder[6]);
  });

  it('the two race bytes actually observed across the six real pregens (3, 6) both resolve to ' +
    'legal, ALLOWED race/class combinations in this ruleset\'s own tables -- Bar B: mountainDwarf ' +
    'may be a fighter and a thief (level 7/level 8, both within its DQK-ruleset cap of 8) AND may ' +
    'multi-class; human may be any of fighter/ranger/cleric/magicUser but may NOT multi-class', () => {
    // MALACHITE: race byte 3 (Dwarf) -> mountainDwarf (this round's disclosed pick, matching the
    // SAME convention COAB_RACE_TO_DL already uses for its own generic 'dwarf'), fighter 7 / thief 8.
    expect(isMultiClassAllowed('mountainDwarf')).toBe(true);
    expect(allowsClass('mountainDwarf', 'fighter')).toBe(true);
    expect(allowsClass('mountainDwarf', 'thief')).toBe(true);
    expect(dqkMaxLevel('mountainDwarf', 'thief')).toBe(8); // level 8 required, exactly the cap
    // The five race-byte-6 pregens -> human, single-classed (fighter/ranger/cleric/magicUser)
    // -- all allowed, and human correctly forbids multi-classing (the rule the OLD "default to
    // human" fallback accidentally triggered on MALACHITE too, rejecting her).
    expect(isMultiClassAllowed('human')).toBe(false);
    for (const cls of ['fighter', 'ranger', 'cleric', 'magicUser'] as const) {
      expect(allowsClass('human', cls)).toBe(true);
    }
  });
});
