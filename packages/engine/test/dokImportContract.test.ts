/**
 * Shipping import contract: what `apps/web/src/ui/importDokParty.ts` actually carries from a real
 * DoK `CHRDATA{n}.GAM/.JNK/.WIZ` save into the live DQK-destined Greybox party (2026-07-16,
 * BUILD-QUEUE P2.4 "Keep original DOS save import/export as a separate per-title format proof" — see
 * `docs/engine/research/original-save-import-export-status.md`, and the sibling CoK contract tests in
 * `savedCharacter.test.ts`'s own "shipping import contract" block).
 *
 * This retail-semantic contract deliberately remains engine-only: `packages/engine` is the
 * DOM/UI-free production core and `apps/web` depends on it, never the reverse. The separate
 * `dokImportAssetSource.test.ts` test-only adapter contract imports the shipping UI function to
 * exercise its selected-source branch at runtime; no web dependency enters engine source. Here we:
 *
 *  1. Exercises the exact engine primitives `inferDokClass()`/`inferDokLevel()`/`sheetFromDokSaved()`
 *     call — `decodeDokSavedCharacter`, `classVoteFromDokIds`, `decodeMonsterWizRecord`,
 *     `decodeDokJnkFile`, `inventoryFromDokJnk`, `wornArmorAc`, `memorizationFromDokIds`, `thac0` —
 *     against the real `Death Knights of Krynn/SAVE/CHRDATA{1..6}.{GAM,JNK,WIZ}` pregens, chained in
 *     the SAME order `importDokParty.ts` chains them (GAM classCode -> caster flag -> WIZ vote ->
 *     class -> level-fit -> JNK gear crosswalk -> AC -> class-filtered spell crosswalk), so a change to
 *     any of those primitives' behaviour fails here too. The class-inference and level-fit SEARCH
 *     LOOPS themselves (`inferDokClass`/`inferDokLevel`, importDokParty.ts:178-197) are simple enough
 *     to duplicate directly (cited by line range at each use) since engine can't import them.
 *  2. Where the claim is about *what importDokParty.ts's own source does* (which files it fetches),
 *     reads that file's literal source text and asserts on it directly — a concrete, drift-detecting
 *     proxy for "the shipping code still does X" without a module dependency. This is how the explicit
 *     `.EFF`/`SAVGAMA.PTY` omission the audit doc calls for is proven: a real `.EFF` file sits right
 *     next to the `.GAM`/`.JNK`/`.WIZ` this importer DOES fetch (`Death Knights of Krynn/SAVE/CHRDATA2.EFF`
 *     decodes to real non-empty data below), and the importer's source still never references it.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeDokSavedCharacter,
  decodeDokJnkFile,
  decodeDokEffFile,
  inventoryFromDokJnk,
  wornArmorAc,
  decodeMonsterWizRecord,
  classVoteFromDokIds,
  memorizationFromDokIds,
  thac0,
  MON_WIZ_RECORD_SIZE,
  type DokSavedCharacter,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const saveDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'SAVE');
const dryden = resolve(saveDir, 'CHRDATA1.GAM');

/** classCode 6 is VALIDATED non-caster (dok-chrdata-save-format.md §2.3) — mirrors NONCASTER_CODE
 * (importDokParty.ts:127). */
const NONCASTER_CODE = 6;

/** Mirrors importDokParty.ts's inferDokClass() (lines 178-183): caster/non-caster split from
 * classCode, then within-caster real-spell vote > ability tie-break; fighter/thief is ability-only. */
function inferDokClass(sc: DokSavedCharacter, spellIds: number[] | undefined): 'fighter' | 'thief' | 'cleric' | 'magicUser' {
  const a = sc.abilities;
  const isCaster = sc.classCode !== NONCASTER_CODE;
  if (isCaster) return classVoteFromDokIds(spellIds) ?? (a.wis >= a.int ? 'cleric' : 'magicUser');
  return a.str >= a.dex ? 'fighter' : 'thief';
}

/** Mirrors importDokParty.ts's inferDokLevel() (lines 186-197): the level (1..MAX_INFERRED_LEVEL)
 * whose thac0(class, level) best matches the save's byte-faithful THAC0. */
function inferDokLevel(cls: 'fighter' | 'thief' | 'cleric' | 'magicUser', thac0Byte: number): number {
  let best = 1;
  let bestDiff = Infinity;
  for (let lvl = 1; lvl <= 12; lvl++) {
    const diff = Math.abs(thac0(cls, lvl) - thac0Byte);
    if (diff < bestDiff) { bestDiff = diff; best = lvl; }
  }
  return best;
}

/** Load + decode one real pregen's .GAM, and (if a caster) its .WIZ spell ids. */
async function loadCandidate(n: number): Promise<{ sc: DokSavedCharacter; spellIds?: number[] }> {
  const sc = decodeDokSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, `CHRDATA${n}.GAM`))));
  let spellIds: number[] | undefined;
  if (sc.classCode !== NONCASTER_CODE) {
    const wizBytes = new Uint8Array(await readFile(resolve(saveDir, `CHRDATA${n}.WIZ`)));
    if (wizBytes.length === MON_WIZ_RECORD_SIZE) {
      spellIds = decodeMonsterWizRecord(wizBytes).spells.map((s) => s.spellId);
    }
  }
  return { sc, spellIds };
}

describe('shipping import contract — apps/web/src/ui/importDokParty.ts (real DoK SAVE fixtures)', () => {
  // RE-DERIVED 2026-09-07 and INVERTED. This test was titled "HP is never read from .GAM —
  // DokSavedCharacter has no hitPoints field for importDokParty.ts to carry (rebuilt via levelHpGain
  // instead)" and asserted `'hitPoints' in sc === false`. It was a golden matching a loader that
  // decoded byte 40 correctly and then dropped it. The numbers below are read straight off the retail
  // files, so they do not come from the code under test.
  it.skipIf(!existsSync(dryden))(
    'HP IS read from .GAM byte 40, and byte 214 agrees with it in 6 of 6 retail pregens',
    async () => {
      // Every shipped pregen, in slot order. Denominator stated: 6 of 6.
      const expected = [95, 102, 78, 52, 58, 53];
      let checked = 0;
      for (let n = 1; n <= 6; n++) {
        if (!existsSync(resolve(saveDir, `CHRDATA${n}.GAM`))) continue;
        const { sc } = await loadCandidate(n);
        expect(sc.hitPoints).toBe(expected[n - 1]);
        // The second store carries the same number in every record that ships.
        expect(sc.hitPointsMirror).toBe(sc.hitPoints);
        expect(sc.hitPointsMirrorAgrees).toBe(true);
        expect(sc.raw[40]).toBe(expected[n - 1]);
        expect(sc.raw[214]).toBe(expected[n - 1]);
        checked++;
      }
      expect(checked).toBe(6);
    },
  );

  // THE NULL, asserted rather than only written down: the equality above CANNOT tell max-HP from
  // current-HP, because a difference only appears on a damaged character and none ships. This test
  // exists so nobody reads the 6-of-6 agreement as if it had settled the question — it pins that the
  // discriminating case is absent from the corpus.
  it.skipIf(!existsSync(dryden))(
    'no shipped pregen is damaged, so b40 == b214 cannot discriminate max HP from current HP',
    async () => {
      const diffs: string[] = [];
      for (let n = 1; n <= 6; n++) {
        if (!existsSync(resolve(saveDir, `CHRDATA${n}.GAM`))) continue;
        const { sc } = await loadCandidate(n);
        if (sc.hitPoints !== sc.hitPointsMirror) diffs.push(`${sc.name.trim()} ${sc.hitPoints}/${sc.hitPointsMirror}`);
      }
      // If this ever goes red, the corpus has gained the record that WOULD settle it — and the
      // max-vs-current question in dokSavedCharacter.ts's file doc can finally be answered rather
      // than merely leaned on. That is a reason to look, not a regression.
      expect(diffs).toEqual([]);
    },
  );

  it.skipIf(!existsSync(dryden))(
    'SIR DRYDEN (classCode 6, non-caster): class is ability-only (str>=dex -> fighter), gear crosswalk recognizes only his Shield (Solamnic Plate is an uncracked named artifact, type 68) -> baseAc 10->9',
    async () => {
      const { sc, spellIds } = await loadCandidate(1);
      expect(sc.name).toBe('SIR DRYDEN');
      expect(sc.classCode).toBe(NONCASTER_CODE);
      expect(spellIds).toBeUndefined(); // non-casters never get .WIZ fetched (importDokParty.ts:308-309)
      const cls = inferDokClass(sc, spellIds);
      expect(cls).toBe('fighter'); // str 18 >= dex 17

      const level = inferDokLevel(cls, sc.thac0);
      expect(level).toBe(7); // thac0(fighter,7) is the closest table entry to his real THAC0 (14)

      const items = decodeDokJnkFile(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA1.JNK'))));
      const inv = inventoryFromDokJnk(items);
      expect(inv.entries.map((e) => e.name)).toEqual(['Shield']); // Solamnic Plate (type 68) is dropped, not crosswalked
      expect(wornArmorAc(inv)).toBe(9); // 10 (unarmoured) - 1 (shield bonus), NOT the .GAM baseline of 10
      expect(sc.baseArmorClass).toBe(10); // the .GAM baseline itself, for contrast — importer does NOT use this directly
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA2.GAM')))(
    'LILLITH (classCode 6, non-caster): full Plate Mail + Shield crosswalk -> baseAc 10->2',
    async () => {
      const { sc } = await loadCandidate(2);
      expect(sc.name).toBe('LILLITH');
      const items = decodeDokJnkFile(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA2.JNK'))));
      const inv = inventoryFromDokJnk(items);
      expect(inv.entries.map((e) => e.name).sort()).toEqual(['Plate Mail', 'Shield']);
      expect(wornArmorAc(inv)).toBe(2);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA4.GAM')))(
    'FLAVIUS (classCode 1, caster): the real .WIZ spell vote (not just ability tie-break) picks cleric, and memorizationFromDokIds class-filters to exactly C:Hold Person — the full GAM->WIZ->crosswalk chain on real bytes',
    async () => {
      const { sc, spellIds } = await loadCandidate(4);
      expect(sc.name).toBe('FLAVIUS');
      expect(spellIds).toBeDefined();
      expect(classVoteFromDokIds(spellIds)).toBe('cleric');
      const cls = inferDokClass(sc, spellIds);
      expect(cls).toBe('cleric');
      const mem = memorizationFromDokIds(spellIds, cls as 'cleric' | 'magicUser')!;
      expect(mem.byLevel.flat()).toEqual(['c2-hold-person']); // matches dokSpellCrosswalk.test.ts's independent proof
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA3.GAM')))(
    'TANAR (classCode 2, caster): ability scores alone (int 17 >= wis 14) would infer magicUser, but the real .WIZ spell vote overrides it to cleric — proving the save\'s own spells, not abilities, drive the class import',
    async () => {
      const { sc, spellIds } = await loadCandidate(3);
      expect(sc.name).toBe('TANAR');
      expect(sc.abilities.int).toBeGreaterThanOrEqual(sc.abilities.wis); // the ability tie-break would say magicUser
      expect(classVoteFromDokIds(spellIds)).toBe('cleric'); // but the real spell vote disagrees
      expect(inferDokClass(sc, spellIds)).toBe('cleric');
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA6.GAM')))(
    'CELESTE (classCode 0, caster): real .WIZ spell vote is an exact cleric/magicUser tie (undefined), so import correctly falls back to the ability heuristic -> magicUser',
    async () => {
      const { sc, spellIds } = await loadCandidate(6);
      expect(sc.name).toBe('CELESTE');
      expect(classVoteFromDokIds(spellIds)).toBeUndefined(); // tie
      expect(inferDokClass(sc, spellIds)).toBe('magicUser'); // int 17 > wis 15
      const mem = memorizationFromDokIds(spellIds, 'magicUser')!;
      expect(mem.byLevel[0]).toEqual(['m1-magic-missile', 'm1-magic-missile']);
      expect(mem.byLevel[2]).toEqual(['m3-fireball', 'm3-fireball']);
    },
  );

  it.skipIf(!existsSync(dryden))(
    'importDokParty.ts fetches CHRDATA{1..6}.GAM/.WIZ/.JNK — and NEVER .EFF or SAVGAMA.PTY, even though real .EFF data sits right next to the files it does fetch',
    async () => {
      // A real .EFF exists in this exact SAVE directory (not just the played cloud_saves corpus) and
      // decodes to real, non-empty affect data — proving the omission below is a real gap, not just an
      // absent-fixture non-issue.
      const effPath = resolve(saveDir, 'CHRDATA2.EFF');
      expect(existsSync(effPath)).toBe(true);
      const effects = decodeDokEffFile(new Uint8Array(await readFile(effPath)));
      expect(effects.length).toBeGreaterThan(0);
      // SAVGAMA.PTY is likewise real and present in this same directory.
      expect(existsSync(resolve(saveDir, 'SAVGAMA.PTY'))).toBe(true);

      const importDokPartySrc = resolve(here, '..', '..', '..', 'apps', 'web', 'src', 'ui', 'importDokParty.ts');
      const src = await readFile(importDokPartySrc, 'utf8');
      // The literal fetched-path arrays (importDokParty.ts:140-171).
      for (let i = 1; i <= 6; i++) {
        expect(src).toContain(`Death Knights of Krynn/SAVE/CHRDATA${i}.GAM`);
        expect(src).toContain(`Death Knights of Krynn/SAVE/CHRDATA${i}.WIZ`);
        expect(src).toContain(`Death Knights of Krynn/SAVE/CHRDATA${i}.JNK`);
      }
      // The explicit omission: no .EFF fetch, no SAVGAMA.PTY read, anywhere in the file.
      expect(src).not.toMatch(/\.EFF/);
      expect(src).not.toMatch(/SAVGAMA/);
      expect(src).not.toMatch(/\.PTY/);
    },
  );
});
