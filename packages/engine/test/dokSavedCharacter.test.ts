/**
 * DoK saved-character loader tests (M13 — `CHRDATA{n}.GAM`/`.JNK`/`.EFF`).
 *
 * 1) Synthetic: framing + the base-stat honesty (`.GAM` reuses `DOK_LAYOUT`, so most of the
 *    decode is already covered by `monster.test.ts` — these tests focus on the character-shaped
 *    wrapper's own contract).
 * 2) Golden: the real DoK `SAVE/CHRDATA{1..6}.GAM` pregens (Dryden/Lillith/Tanar/Flavius/
 *    Neacail/Celeste) and `.JNK`/`.EFF` samples from `cloud_saves/SAVE/`. Values below were read
 *    directly off the real files, not transcribed from the research doc. Skips if the saves are
 *    absent.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeDokSavedCharacter,
  sniffDokSavedCharacter,
  decodeDokJnkFile,
  decodeDokJnkRecord,
  sniffDokJnkRecord,
  decodeDokEffFile,
  exportDokSavedCharacter,
  classCodeForDokCaster,
  NONCASTER_CODE,
  DOK_SAVED_CHARACTER_SIZE,
  DOK_JNK_RECORD_SIZE,
} from '../src/index.js';

function makeGam(name: string, abilities: [number, number, number, number, number, number]): Uint8Array {
  const raw = new Uint8Array(DOK_SAVED_CHARACTER_SIZE);
  raw[0] = name.length;
  for (let i = 0; i < name.length; i++) raw[1 + i] = name.charCodeAt(i);
  for (let s = 0; s < 6; s++) {
    raw[16 + s * 2] = abilities[s];
    raw[16 + s * 2 + 1] = abilities[s];
  }
  raw[31] = 60 - 14; // thac0 14
  raw[32] = 6; // classCode
  raw[89] = 1; raw[90] = 0; raw[91] = 2; // 1d2+0
  raw[95] = 60 - 10; // ac 10
  return raw;
}

describe('decodeDokSavedCharacter — synthetic', () => {
  // RE-DERIVED 2026-09-07. This test was titled "... and never reports hitPoints" and asserted
  // `'hitPoints' in c === false`. That was a golden written to match the loader, which was itself
  // written when `monster.ts`'s `DOK_LAYOUT.hp` was `null`; it became `40` in `fa07892` (2026-08-11)
  // and this assertion went on pinning the absence for another 27 days. The HP expectations below are
  // set by `makeGam` writing known bytes at 40 and 214, so they cannot be read back out of the loader.
  it('parses name, abilities, thac0, classCode, base AC/damage — and BOTH hit-point stores', () => {
    const raw = makeGam('TANAR', [18, 17, 14, 17, 17, 14]);
    raw[40] = 78;
    raw[214] = 78;
    const c = decodeDokSavedCharacter(raw);
    expect(c.name).toBe('TANAR');
    expect(c.abilities).toEqual({ str: 18, int: 17, wis: 14, dex: 17, con: 17, cha: 14 });
    expect(c.thac0).toBe(14);
    expect(c.classCode).toBe(6);
    expect(c.baseArmorClass).toBe(10);
    expect(c.baseDamage).toEqual({ count: 1, bonus: 0, sides: 2 });
    expect(c.hitPoints).toBe(78);
    expect(c.hitPointsMirror).toBe(78);
    expect(c.hitPointsMirrorAgrees).toBe(true);
  });

  // The two stores are read from their own bytes, not from each other. This is the assertion no
  // retail record can make — all six pregens are undamaged, so `b40 === b214` there — and it is
  // exactly the case that would arise for a damaged character. It does NOT claim which store is the
  // maximum; it only proves the loader would report a divergence rather than hide one.
  it('reads bytes 40 and 214 independently, so a divergence would be visible', () => {
    const raw = makeGam('WOUNDED', [10, 10, 10, 10, 10, 10]);
    raw[40] = 60;
    raw[214] = 17;
    const c = decodeDokSavedCharacter(raw);
    expect(c.hitPoints).toBe(60);
    expect(c.hitPointsMirror).toBe(17);
    // `hitPointsMirrorAgrees` follows `buckSavedCharacter.ts`'s field of the same name: it is the
    // flag that goes false on the record that would settle max-vs-current. No retail DoK record can
    // make it false, so this synthetic one is the only place it is ever seen doing its job.
    expect(c.hitPointsMirrorAgrees).toBe(false);
  });

  it('sniffs by size + sane name length', () => {
    expect(sniffDokSavedCharacter(makeGam('X', [10, 10, 10, 10, 10, 10]))).toBe(true);
    expect(sniffDokSavedCharacter(new Uint8Array(DOK_SAVED_CHARACTER_SIZE))).toBe(false); // name len 0
    expect(sniffDokSavedCharacter(new Uint8Array(409))).toBe(false); // wrong size (CoK's)
  });

  it('throws on a wrong-size record', () => {
    expect(() => decodeDokSavedCharacter(new Uint8Array(409))).toThrow(/216-byte/);
  });
});

// --- exportDokSavedCharacter: synthesize a Greybox in-session character into a retail DoK .GAM record
// (2026-07-16, BUILD-QUEUE P2.4 "original save import/export" — DoK half). Scoped narrower than CoK's
// exportSavedCharacter: classCode only proves caster-vs-not (NONCASTER_CODE), never a specific class —
// see dokSavedCharacter.ts's "Export" header section and classCodeForDokCaster's own doc comment for why.

describe('classCodeForDokCaster — the write-direction caster/non-caster map', () => {
  it('non-caster -> NONCASTER_CODE (6), the VALIDATED code', () => {
    expect(classCodeForDokCaster(false)).toBe(NONCASTER_CODE);
    expect(NONCASTER_CODE).toBe(6);
  });

  it('caster -> a fixed nonzero code (never NONCASTER_CODE)', () => {
    expect(classCodeForDokCaster(true)).not.toBe(NONCASTER_CODE);
    expect(classCodeForDokCaster(true)).not.toBe(0);
  });
});

describe('exportDokSavedCharacter — synthesize a full record from scratch (synthetic)', () => {
  const fighter = {
    name: 'SIR TEST',
    abilities: { str: 18, int: 10, wis: 10, dex: 12, con: 16, cha: 11 },
    thac0: 14,
    isCaster: false,
  };

  it('writes name, abilities (current === max), thac0, classCode — reproduced by decodeDokSavedCharacter', () => {
    const raw = exportDokSavedCharacter(fighter);
    expect(raw).toHaveLength(DOK_SAVED_CHARACTER_SIZE);
    const c = decodeDokSavedCharacter(raw);
    expect(c.name).toBe('SIR TEST');
    expect(c.abilities).toEqual(fighter.abilities);
    expect(c.thac0).toBe(14);
    expect(c.classCode).toBe(NONCASTER_CODE);
  });

  it('writes BOTH ability bytes of each (current,max) pair identically (fresh character, no stat drain)', () => {
    const raw = exportDokSavedCharacter(fighter);
    for (let slot = 0; slot < 6; slot++) {
      expect(raw[16 + slot * 2]).toBe(raw[16 + slot * 2 + 1]);
    }
  });

  it('writes the CONSTANT baseline fields observed across all 6 real pregens (icon size, morale, dmg, AC)', () => {
    const raw = exportDokSavedCharacter(fighter);
    const c = decodeDokSavedCharacter(raw);
    expect(c.baseArmorClass).toBe(10); // unarmoured baseline, not gear-derived
    expect(c.baseDamage).toEqual({ count: 1, bonus: 0, sides: 2 }); // 1d2+0 baseline
    expect(raw[41]).toBe(1); // iconSize — small, constant
    expect(raw[62]).toBe(0); // control_morale — never routs, constant
  });

  // RE-DERIVED 2026-09-07. Was "never writes a hitPoints byte — the record has no HP field to write
  // (matches the decoder)". It matched the decoder; both were wrong together, which is precisely why a
  // round-trip test cannot adjudicate the offsets it round-trips.
  it('writes hit points to BOTH stores (bytes 40 and 214) when given them, matching all 6 real pregens', () => {
    const raw = exportDokSavedCharacter({ ...fighter, hitPoints: 95 });
    expect(raw[40]).toBe(95);
    expect(raw[214]).toBe(95);
    const c = decodeDokSavedCharacter(raw);
    expect(c.hitPoints).toBe(95);
    expect(c.hitPointsMirror).toBe(95);
  });

  it('leaves both HP stores 0 when no hit points are supplied — an omitted field is not invented', () => {
    const raw = exportDokSavedCharacter(fighter);
    expect(raw[40]).toBe(0);
    expect(raw[214]).toBe(0);
  });

  // NARROWED 2026-09-07: was "leaves bytes 96..215 (the PC-only scratch tail — stale pointers,
  // unmapped) zero" over the whole range. Byte 214 is hit points, so the range is no longer uniformly
  // unmapped and the old title's premise is retired. The remainder is still checked, both with and
  // without an HP input, so the narrowing does not quietly stop testing anything else.
  it('leaves bytes 96..215 zero apart from the hit-point store at 214', () => {
    const zeroOutside214 = (raw: Uint8Array) =>
      [...raw.slice(96, 216)].every((b, i) => (96 + i === 214 ? true : b === 0));
    expect(zeroOutside214(exportDokSavedCharacter(fighter))).toBe(true);
    expect(zeroOutside214(exportDokSavedCharacter({ ...fighter, hitPoints: 95 }))).toBe(true);
    // And with no HP supplied, 214 itself is zero too — i.e. the exception above is not a licence.
    expect(exportDokSavedCharacter(fighter)[214]).toBe(0);
  });

  it('a caster export has classCode !== NONCASTER_CODE, so importDokParty.ts\'s isCaster gate takes the caster branch', () => {
    const raw = exportDokSavedCharacter({ ...fighter, isCaster: true });
    const c = decodeDokSavedCharacter(raw);
    expect(c.classCode).not.toBe(NONCASTER_CODE);
  });

  it('truncates a name past the 15-char field, same clamp CoK\'s exporter uses', () => {
    const raw = exportDokSavedCharacter({ ...fighter, name: 'A VERY LONG CHARACTER NAME' });
    const c = decodeDokSavedCharacter(raw);
    expect(c.name.length).toBeLessThanOrEqual(15);
  });
});

describe('decodeDokJnkRecord — synthetic', () => {
  it('reads the readied-flag-baked-in name and the count field, and reports scratch42 honestly', () => {
    const raw = new Uint8Array(DOK_JNK_RECORD_SIZE);
    const name = ' Yes  Ring Of Prot +3 ';
    raw[0] = name.length;
    for (let i = 0; i < name.length; i++) raw[1 + i] = name.charCodeAt(i);
    raw[42] = 141; // looks like a baseTypeId but is not one (research doc §3.2)
    raw[57] = 0;
    const item = decodeDokJnkRecord(raw);
    expect(item.name).toBe(' Yes  Ring Of Prot +3 ');
    expect(item.count).toBe(0);
    expect(item.scratch42).toBe(141);
  });

  it('also decodes the real identity/stat fields at 0x2e via .item (M34.S1) — a DIFFERENT offset than scratch42', () => {
    const raw = new Uint8Array(DOK_JNK_RECORD_SIZE);
    raw[0] = 1;
    raw[1] = 'X'.charCodeAt(0);
    raw[0x2e] = 37; // type: Shield
    raw[0x34] = 1; // readied
    const rec = decodeDokJnkRecord(raw);
    expect(rec.item.baseTypeId).toBe(37);
    expect(rec.item.readied).toBe(true);
  });

  it('sniffs a record by size + sane name length', () => {
    expect(sniffDokJnkRecord(new Uint8Array(DOK_JNK_RECORD_SIZE))).toBe(false); // name len 0
    const raw = new Uint8Array(DOK_JNK_RECORD_SIZE);
    raw[0] = 5;
    expect(sniffDokJnkRecord(raw)).toBe(true);
  });
});

// --- Golden: the real DoK SAVE party + a played cloud_saves sample (skips if absent) ---------

const here = fileURLToPath(new URL('.', import.meta.url));
const saveDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'SAVE');
const cloudSaveDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'cloud_saves', 'SAVE');
const dryden = resolve(saveDir, 'CHRDATA1.GAM');

describe('decodeDokSavedCharacter — golden DoK SAVE pregens', () => {
  it.skipIf(!existsSync(dryden))('decodes the six real pregens with their verified stats', async () => {
    const load = async (f: string) => decodeDokSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, f))));

    const drydenC = await load('CHRDATA1.GAM');
    expect(drydenC.name).toBe('SIR DRYDEN');
    expect(drydenC.abilities).toEqual({ str: 18, int: 13, wis: 17, dex: 17, con: 17, cha: 16 });
    expect(drydenC.thac0).toBe(14);
    expect(drydenC.classCode).toBe(6);
    expect(drydenC.baseArmorClass).toBe(10);
    expect(drydenC.baseDamage).toEqual({ count: 1, bonus: 0, sides: 2 });

    if (existsSync(resolve(saveDir, 'CHRDATA4.GAM'))) {
      const flavius = await load('CHRDATA4.GAM');
      expect(flavius.name).toBe('FLAVIUS');
      expect(flavius.abilities).toEqual({ str: 18, int: 14, wis: 15, dex: 16, con: 15, cha: 17 });
      expect(flavius.thac0).toBe(13);
      expect(flavius.classCode).toBe(1);
    }
  });

  it.skipIf(!existsSync(dryden))('reads .JNK inventories, including the readied-flag-in-name convention', async () => {
    const jnkPath = resolve(saveDir, 'CHRDATA1.JNK');
    if (!existsSync(jnkPath)) return;
    const items = decodeDokJnkFile(new Uint8Array(await readFile(jnkPath)));
    expect(items.length).toBe(4); // fresh save: 4 starting items
    expect(items.some((i) => i.name.includes('Long Sword'))).toBe(true);
    expect(items.some((i) => i.name.startsWith(' Yes'))).toBe(true); // readied-flag-in-name
  });

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA2.JNK')))(
    'reads .JNK real item identity/stat fields via .item (M34.S1) — Lillith wears Plate Mail + Shield',
    async () => {
      const items = decodeDokJnkFile(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA2.JNK'))));
      // Read directly off real bytes this round (docs/engine/research/m34-audit.md's own addendum
      // corrects an earlier draft that mislabeled this as Ring Mail — it is genuinely Plate Mail).
      const shield = items.find((i) => i.item.baseTypeId === 37);
      const plate = items.find((i) => i.item.baseTypeId === 36);
      expect(shield?.item.readied).toBe(true);
      expect(plate?.item.readied).toBe(true);
    },
  );

  it.skipIf(!existsSync(resolve(cloudSaveDir, 'CHRDATA1.JNK')))(
    'reads a played 14-item .JNK, including a stackable count',
    async () => {
      const items = decodeDokJnkFile(new Uint8Array(await readFile(resolve(cloudSaveDir, 'CHRDATA1.JNK'))));
      expect(items.length).toBe(14);
      const arrows = items.find((i) => i.name.includes('Arrows'));
      expect(arrows?.count).toBe(127);
    },
  );

  it.skipIf(!existsSync(resolve(cloudSaveDir, 'CHRDATA3.EFF')))('reads .EFF active-effect records', async () => {
    const effects = decodeDokEffFile(new Uint8Array(await readFile(resolve(cloudSaveDir, 'CHRDATA3.EFF'))));
    expect(effects.length).toBe(3);
    for (const e of effects) expect(e.minutes).toBe(0); // permanent, item-granted effects in this sample
  });
});

// --- Real-fixture-guarded: exportDokSavedCharacter's byte offsets/encodings are grounded against the
// REAL retail CHRDATA1.GAM (SIR DRYDEN, non-caster, classCode 6) and CHRDATA4.GAM (FLAVIUS, caster,
// classCode 1) — decode the genuine save to get ground-truth field values, feed those same values back
// through the SYNTHESIS path, and prove the resulting bytes match the real file at every offset this
// module models to the confidence that offset actually has (exact byte match for the VALIDATED
// non-caster code and the CONSTANT baseline fields; caster-vs-not only for the caster case, since no
// single caster classCode number is validated — see dokSavedCharacter.ts's "Export" header section).
describe('exportDokSavedCharacter — grounded against real DoK SAVE fixtures (oracle proof)', () => {
  const chr1 = resolve(saveDir, 'CHRDATA1.GAM');
  const chr4 = resolve(saveDir, 'CHRDATA4.GAM');

  it.skipIf(!existsSync(chr1))(
    'a synthesized SIR DRYDEN (non-caster) matches CHRDATA1.GAM byte-for-byte on every modelled field',
    async () => {
      const realRaw = new Uint8Array(await readFile(chr1));
      const real = decodeDokSavedCharacter(realRaw);
      expect(real.classCode).toBe(6); // ground truth: the VALIDATED non-caster code

      const synthesized = exportDokSavedCharacter({
        name: real.name,
        abilities: real.abilities,
        thac0: real.thac0,
        isCaster: real.classCode !== NONCASTER_CODE,
      });

      expect(synthesized[0]).toBe(realRaw[0]); // name length
      for (let i = 0; i < realRaw[0]; i++) expect(synthesized[1 + i]).toBe(realRaw[1 + i]);
      for (let slot = 0; slot < 6; slot++) {
        expect(synthesized[16 + slot * 2]).toBe(realRaw[16 + slot * 2]); // current ability byte
      }
      expect(synthesized[31]).toBe(realRaw[31]); // thac0
      expect(synthesized[32]).toBe(realRaw[32]); // classCode — exact match, both are the VALIDATED 6
      expect(synthesized[41]).toBe(realRaw[41]); // iconSize — constant
      expect(synthesized[62]).toBe(realRaw[62]); // control_morale — constant
      expect(synthesized[89]).toBe(realRaw[89]); // dmgCount — constant
      expect(synthesized[90]).toBe(realRaw[90]); // dmgBonus — constant
      expect(synthesized[91]).toBe(realRaw[91]); // dmgSides — constant
      expect(synthesized[95]).toBe(realRaw[95]); // AC — constant baseline

      // Round-trips back to non-caster through the real decode path.
      expect(decodeDokSavedCharacter(synthesized).classCode).toBe(NONCASTER_CODE);
    },
  );

  it.skipIf(!existsSync(chr4))(
    'a synthesized FLAVIUS (caster) matches CHRDATA4.GAM on every CONSTANT/verified field, and is caster-flagged (not a specific class)',
    async () => {
      const realRaw = new Uint8Array(await readFile(chr4));
      const real = decodeDokSavedCharacter(realRaw);
      expect(real.classCode).not.toBe(6); // ground truth: FLAVIUS is a real caster

      const synthesized = exportDokSavedCharacter({
        name: real.name,
        abilities: real.abilities,
        thac0: real.thac0,
        isCaster: true,
      });

      expect(synthesized[0]).toBe(realRaw[0]);
      for (let slot = 0; slot < 6; slot++) {
        expect(synthesized[16 + slot * 2]).toBe(realRaw[16 + slot * 2]);
      }
      expect(synthesized[31]).toBe(realRaw[31]);
      // classCode itself is NOT asserted byte-identical — no single caster code is validated (§2.3),
      // only that both the real save and the synthesis land on a nonzero (caster) code.
      expect(synthesized[32]).not.toBe(6);
      expect(realRaw[32]).not.toBe(6);
      // The constant baseline fields still match exactly regardless of class.
      expect(synthesized[41]).toBe(realRaw[41]);
      expect(synthesized[62]).toBe(realRaw[62]);
      expect(synthesized[89]).toBe(realRaw[89]);
      expect(synthesized[95]).toBe(realRaw[95]);

      expect(decodeDokSavedCharacter(synthesized).classCode).not.toBe(NONCASTER_CODE);
    },
  );
});
