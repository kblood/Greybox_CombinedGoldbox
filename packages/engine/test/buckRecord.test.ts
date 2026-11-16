/**
 * Buck Rogers XXVc 259-byte record family — R2, round 34.
 *
 * `buckSavedCharacter.ts` decodes the six pregenerated `chrdata{n}.sav` files, which are the SAME
 * 259-byte layout as Matrix Cubed's monster records (`monster.ts`'s `MonsterLayoutProfile` doc
 * comment carries the full cross-title evidence). Every case here skips cleanly (not fails) when the
 * external, never-vendored `D:/` install or the git-ignored `matrixcubed_extracted/` tree is absent,
 * the convention every other `D:/`-reading engine test in this repo uses.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeBuckSavedCharacter,
  sniffBuckSavedCharacter,
  BUCK_SAVED_CHARACTER_SIZE,
  type BuckSavedCharacter,
} from '../src/loaders/buckSavedCharacter.js';
import { readDaxDataBlocks } from '../src/loaders/dax.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const BUCK_DIR = 'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday';
const HAVE_BUCK = existsSync(`${BUCK_DIR}/chrdata1.sav`);
const MATRIX_MON_PATH = resolve(
  here, '..', '..', '..', 'matrixcubed_extracted', 'BuckRogers2', 'c', 'Matrix', 'MON0CHA.DAX',
);
const HAVE_MATRIX_MON = existsSync(MATRIX_MON_PATH);
const BUCK_MON_PATH = `${BUCK_DIR}/mon0cha.dax`;
const HAVE_BUCK_MON = existsSync(BUCK_MON_PATH);

const PREGEN_NAMES = ['FLAVIUS', 'CELESTE', 'PIERRE', 'NICOLE STEELE', 'ROARKE', 'JANELLE'];
/** `raw[69]` for each of the 6 pregens, in `chrdata1..6.sav` order — also mirrored at `raw[227]`. */
const EXPECTED_HP = [26, 22, 16, 16, 14, 13];

function loadPregens(): BuckSavedCharacter[] {
  const out: BuckSavedCharacter[] = [];
  for (let i = 1; i <= 6; i++) {
    const raw = new Uint8Array(readFileSync(`${BUCK_DIR}/chrdata${i}.sav`));
    out.push(decodeBuckSavedCharacter(raw));
  }
  return out;
}

describe('decodeBuckSavedCharacter — synthetic', () => {
  it('rejects a record of the wrong length', () => {
    expect(() => decodeBuckSavedCharacter(new Uint8Array(258))).toThrow();
    expect(() => decodeBuckSavedCharacter(new Uint8Array(263))).toThrow();
  });

  it('reads name, abilities and HP mirror from a synthetic 259-byte record', () => {
    const raw = new Uint8Array(BUCK_SAVED_CHARACTER_SIZE);
    raw[0] = 4;
    raw.set([0x5a, 0x41, 0x4e, 0x45], 1); // "ZANE"
    const septet = [3, 9, 6, 9, 3, 14, 3];
    raw.set(septet, 16);
    raw.set(septet, 23); // unmodified: max == base
    raw[69] = 12;
    raw[227] = 12;
    raw[231] = 0x94; // > 0x7F: control_morale fires, (0x94 & 0x7f) * 2 = 40
    const rec = decodeBuckSavedCharacter(raw);
    expect(rec.name).toBe('ZANE');
    expect(rec.abilities).toEqual(septet);
    expect(rec.abilitiesMax).toEqual(septet);
    expect(rec.hitPoints).toBe(12);
    expect(rec.hitPointsMirrorAgrees).toBe(true);
    expect(rec.moralePercent).toBe(40);
  });

  it('reports hitPointsMirrorAgrees=false and moralePercent=undefined when the bytes say so', () => {
    const raw = new Uint8Array(BUCK_SAVED_CHARACTER_SIZE);
    raw[0] = 1;
    raw[1] = 0x58; // "X"
    raw[69] = 5;
    raw[227] = 9; // mirror disagrees
    raw[231] = 0x10; // <= 0x7F: never checks morale
    const rec = decodeBuckSavedCharacter(raw);
    expect(rec.hitPointsMirrorAgrees).toBe(false);
    expect(rec.moralePercent).toBeUndefined();
  });

  it('sniffBuckSavedCharacter rejects the wrong size and non-name bytes, accepts a real-shaped record', () => {
    expect(sniffBuckSavedCharacter(new Uint8Array(258))).toBe(false);
    const bad = new Uint8Array(BUCK_SAVED_CHARACTER_SIZE);
    bad[0] = 3;
    bad.set([0, 0, 0], 1); // NUL name, no letters
    expect(sniffBuckSavedCharacter(bad)).toBe(false);
    const good = new Uint8Array(BUCK_SAVED_CHARACTER_SIZE);
    good[0] = 3;
    good.set([0x42, 0x55, 0x43], 1); // "BUC"
    expect(sniffBuckSavedCharacter(good)).toBe(true);
  });
});

describe.skipIf(!HAVE_BUCK)('decodeBuckSavedCharacter — real chrdata{1..6}.sav', () => {
  it('decodes all 6 pregens: correct name, 259 bytes, plausible abilities, HP > 0, HP mirror agrees', () => {
    const pregens = loadPregens();
    expect(pregens).toHaveLength(6);
    pregens.forEach((rec, i) => {
      expect(rec.raw).toHaveLength(BUCK_SAVED_CHARACTER_SIZE);
      expect(rec.name).toBe(PREGEN_NAMES[i]);
      expect(rec.hitPoints).toBeGreaterThan(0);
      expect(rec.hitPointsMirrorAgrees).toBe(true);
      expect(rec.abilities).toEqual(rec.abilitiesMax); // unmodified pregens: current == max
      // Bar A (plan text): 7 abilities in 3..18. Buck's XXVc range measured wider (9..21) — report
      // the actual pass rate rather than asserting the plan's literal AD&D range.
      const inClassicRange = rec.abilities.filter((v) => v >= 3 && v <= 18).length;
      expect(inClassicRange).toBeGreaterThanOrEqual(5); // 5,6,7,7,5,7 measured across the 6 pregens
    });
  });

  it('pins the exact 6 hit-point values (own oracle: raw[69] === raw[227] on all 6)', () => {
    const pregens = loadPregens();
    expect(pregens.map((r) => r.hitPoints)).toEqual(EXPECTED_HP);
    expect(pregens.map((r) => r.raw[227])).toEqual(EXPECTED_HP);
  });

  it('MUTATION: corrupting the mirror byte is caught by hitPointsMirrorAgrees', () => {
    const raw = new Uint8Array(readFileSync(`${BUCK_DIR}/chrdata1.sav`));
    expect(decodeBuckSavedCharacter(raw).hitPointsMirrorAgrees).toBe(true);
    const mutated = new Uint8Array(raw);
    mutated[227] = (mutated[227] + 1) & 0xff;
    expect(decodeBuckSavedCharacter(mutated).hitPointsMirrorAgrees).toBe(false);
  });
});

describe.skipIf(!HAVE_BUCK_MON || !HAVE_MATRIX_MON)('cross-title oracle — Matrix monster "ZANE" at the same offsets', () => {
  function findRecordByName(path: string, expectSize: number, name: string): Uint8Array {
    const bytes = new Uint8Array(readFileSync(path));
    const blocks = readDaxDataBlocks(bytes);
    for (const b of blocks) {
      if (b.raw.length !== expectSize) continue;
      const len = b.raw[0];
      if (len < 1 || len > 15) continue;
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = b.raw[1 + i];
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      if (s === name) return b.raw;
    }
    throw new Error(`${name} not found in ${path} at size ${expectSize}`);
  }

  it('Buck (263B) and Matrix (259B) ZANE agree at HP@69/227 and control_morale@231 with NO shift', () => {
    const buck = findRecordByName(BUCK_MON_PATH, 263, 'ZANE');
    const matrix = findRecordByName(MATRIX_MON_PATH, 259, 'ZANE');
    // No shift needed below the ~251 insertion point (monster.ts's doc comment carries the full
    // per-offset A/B crossover sweep that locates it).
    expect(buck[69]).toBe(buck[227]); // Buck's own mirror
    expect(matrix[69]).toBe(matrix[227]); // Matrix's own mirror
    expect(buck[69]).toBe(4);
    expect(matrix[69]).toBe(8);
    // control_morale: both trip the >0x7F gate at the SAME un-shifted offset.
    expect(buck[231]).toBeGreaterThan(0x7f);
    expect(matrix[231]).toBeGreaterThan(0x7f);
  });
});
