/**
 * CoK saved-character loader tests (B3 — import a party from a CoK save).
 *
 * 1) Synthetic: framing, name, abilities, the inverted AC/THAC0 store, saves, XP.
 * 2) Golden: the real CoK `SAVE/CHRDATA{n}.SAV` files — the named party members (SIR STRONGSWORD,
 *    ISTAN HORBIN, GARIN) with their verified ability scores and HP. Skips if the saves are absent.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeSavedCharacter,
  encodeSavedCharacter,
  editSavedCharacter,
  sniffSavedCharacter,
  dragonlanceClassForCode,
  dragonlanceClassesForCode,
  dragonlanceRaceForCode,
  classCodeForDragonlanceClass,
  raceCodeForDragonlanceRace,
  cokClassLabel,
  cokRaceLabel,
  COK_CLASS_NAMES,
  COK_RACE_NAMES,
  exportSavedCharacter,
  SAVED_CHARACTER_SIZE,
  spellSlots,
  clericSpellSlots,
  type ExportCharacterInput,
  type DragonlanceClassId,
} from '../src/index.js';

function makeChar(name: string, opts: Partial<{
  abilities: [number, number, number, number, number, number];
  hp: number;
  ac: number;
  thac0: number;
  saves: [number, number, number, number, number];
  xp: number;
}> = {}): Uint8Array {
  const raw = new Uint8Array(SAVED_CHARACTER_SIZE);
  raw[0] = name.length;
  for (let i = 0; i < name.length; i++) raw[1 + i] = name.charCodeAt(i);
  const ab = opts.abilities ?? [10, 10, 10, 10, 10, 10];
  for (let s = 0; s < 6; s++) {
    raw[16 + s * 2] = ab[s];
    raw[16 + s * 2 + 1] = ab[s];
  }
  if (opts.thac0 !== undefined) raw[89] = 60 - opts.thac0;
  raw[98] = opts.hp ?? 0;
  const sv = opts.saves ?? [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) raw[208 + i] = sv[i];
  if (opts.ac !== undefined) raw[275] = 60 - opts.ac;
  if (opts.xp !== undefined) {
    raw[304] = opts.xp & 0xff;
    raw[305] = (opts.xp >> 8) & 0xff;
  }
  return raw;
}

describe('decodeSavedCharacter — synthetic', () => {
  it('retains the verified CHEAD/CBODY selector tuple and palette bytes', () => {
    const raw = makeChar('TANIS');
    raw.set([5, 24, 0, 2, 0, 0, 0, 0, 0, 0], 0x135);
    const character = decodeSavedCharacter(raw);
    expect(character.appearance).toEqual({
      cHeadRequest: 5,
      cBodyBlock: 24,
      cBodySlot: 0,
      suffixCode: 2,
      paletteBytes: [0, 0, 0, 0, 0, 0],
    });
    expect(decodeSavedCharacter(encodeSavedCharacter(character)).appearance).toEqual(character.appearance);
  });

  it('parses name, abilities, hp, inverted AC/THAC0, saves, xp', () => {
    const c = decodeSavedCharacter(
      makeChar('TANIS', {
        abilities: [16, 12, 13, 16, 15, 14],
        hp: 42,
        ac: 4,
        thac0: 16,
        saves: [13, 14, 15, 16, 17],
        xp: 12000,
      }),
    );
    expect(c.name).toBe('TANIS');
    expect(c.abilities).toEqual({ str: 16, int: 12, wis: 13, dex: 16, con: 15, cha: 14 });
    expect(c.hitPoints).toBe(42);
    expect(c.armorClass).toBe(4);
    expect(c.thac0).toBe(16);
    expect(c.savingThrows).toEqual({
      paralyzePoisonDeath: 13,
      petrifyPolymorph: 14,
      rodStaffWand: 15,
      breath: 16,
      spell: 17,
    });
    expect(c.xp).toBe(12000);
  });

  it('sniffs by size + sane name length', () => {
    expect(sniffSavedCharacter(makeChar('GOLDMOON'))).toBe(true);
    expect(sniffSavedCharacter(new Uint8Array(SAVED_CHARACTER_SIZE))).toBe(false); // name len 0
    expect(sniffSavedCharacter(new Uint8Array(216))).toBe(false); // wrong size
  });

  it('throws on a wrong-size record', () => {
    expect(() => decodeSavedCharacter(new Uint8Array(216))).toThrow(/409-byte/);
  });

  // RE-DERIVED 2026-09-07. The version of this test that stood here read `c[90] = 2` and asserted
  // `dragonlanceClassForCode(1) === 'cleric'`, `(2) === 'magicUser'`, `(6) === 'knight'` — a golden
  // written to match the three-entry map in the code under test, so it could never have voted on
  // whether that map was right. Every expectation below instead comes from the `START.EXE` enum
  // unpacked tables (class 0xCBBA, race 0xCDA0) transcribed in `savedCharacter.ts`, which owe nothing to our
  // decoder.
  it('reads the class code at offset 91 and the race code at offset 90', () => {
    const c = makeChar('RAISTLIN');
    c[90] = 6; // Human
    c[91] = 5; // Mage
    const d = decodeSavedCharacter(c);
    expect(d.classCode).toBe(5);
    expect(d.raceCode).toBe(6);
    // The two bytes are read independently: moving one must not move the other.
    const swapped = makeChar('RAISTLIN');
    swapped[90] = 5;
    swapped[91] = 6;
    expect(decodeSavedCharacter(swapped).classCode).toBe(6);
    expect(decodeSavedCharacter(swapped).raceCode).toBe(5);
  });

  it("maps class codes through the game's own 17-entry enum, multiclasses included", () => {
    expect(dragonlanceClassForCode(0)).toBe('cleric');
    expect(dragonlanceClassForCode(2)).toBe('fighter');
    expect(dragonlanceClassForCode(4)).toBe('ranger');
    expect(dragonlanceClassForCode(5)).toBe('magicUser');
    expect(dragonlanceClassForCode(6)).toBe('thief');
    expect(dragonlanceClassForCode(7)).toBe('knight');
    // A multiclass resolves to ALL its components, in the game's own label order; the singular
    // accessor returns the first.
    expect(dragonlanceClassesForCode(11)).toEqual(['cleric', 'magicUser']); // Cleric/Mage
    expect(dragonlanceClassesForCode(9)).toEqual(['cleric', 'fighter', 'magicUser']);
    expect(dragonlanceClassesForCode(14)).toEqual(['fighter', 'thief']);
    expect(dragonlanceClassForCode(11)).toBe('cleric');
    // Druid(1) and Paladin(3) are real enum entries with no DragonlanceClassId — null, not a
    // substituted neighbour.
    expect(dragonlanceClassesForCode(1)).toBeNull();
    expect(dragonlanceClassesForCode(3)).toBeNull();
    expect(dragonlanceClassForCode(1)).toBeNull();
    // Outside the 17-entry table.
    expect(dragonlanceClassesForCode(17)).toBeNull();
    expect(dragonlanceClassForCode(200)).toBeNull();
    // Labels are the game's own strings.
    expect(cokClassLabel(11)).toBe('Cleric/Mage');
    expect(cokClassLabel(7)).toBe('Knight');
    expect(cokClassLabel(99)).toBe('CLASS 99');
  });

  it("maps race codes through the game's own 8-entry enum", () => {
    expect(dragonlanceRaceForCode(0)).toBe('silvanestiElf');
    expect(dragonlanceRaceForCode(1)).toBe('qualinestiElf');
    expect(dragonlanceRaceForCode(2)).toBe('halfElf');
    expect(dragonlanceRaceForCode(3)).toBe('mountainDwarf');
    expect(dragonlanceRaceForCode(4)).toBe('hillDwarf');
    expect(dragonlanceRaceForCode(5)).toBe('kender');
    expect(dragonlanceRaceForCode(6)).toBe('human');
    expect(dragonlanceRaceForCode(7)).toBeNull(); // 'Monster' — a real entry, not a playable race
    expect(dragonlanceRaceForCode(8)).toBeNull();
    expect(cokRaceLabel(5)).toBe('Kender');
    expect(cokRaceLabel(7)).toBe('Monster');
    expect(cokRaceLabel(99)).toBe('RACE 99');
  });
});

describe('editSavedCharacter + encodeSavedCharacter — round-trip writer (D3)', () => {
  const base = makeChar('TANIS', {
    abilities: [16, 12, 13, 16, 15, 14], hp: 42, ac: 4, thac0: 16, saves: [13, 14, 15, 16, 17], xp: 12000,
  });

  it('encode∘decode is a fixed point (decoded fields survive a write)', () => {
    const c = decodeSavedCharacter(base);
    const round = decodeSavedCharacter(encodeSavedCharacter(c));
    expect(round.name).toBe(c.name);
    expect(round.abilities).toEqual(c.abilities);
    expect(round.hitPoints).toBe(c.hitPoints);
    expect(round.armorClass).toBe(c.armorClass);
    expect(round.thac0).toBe(c.thac0);
    expect(round.savingThrows).toEqual(c.savingThrows);
    expect(round.xp).toBe(c.xp);
    expect(round.classCode).toBe(c.classCode);
  });

  it('editing a field changes only that field through the round-trip', () => {
    const c = decodeSavedCharacter(base);
    const edited = editSavedCharacter(c, { abilities: { str: 18 }, hitPoints: 55, armorClass: -2, xp: 99999 });
    const round = decodeSavedCharacter(encodeSavedCharacter(edited));
    expect(round.abilities.str).toBe(18);
    expect(round.abilities.int).toBe(12); // untouched
    expect(round.hitPoints).toBe(55);
    expect(round.armorClass).toBe(-2);
    expect(round.xp).toBe(65535); // clamped to the u16 ceiling by editSavedCharacter
    expect(round.thac0).toBe(16); // untouched
  });

  it('clamps out-of-range edits to the field bounds', () => {
    const c = decodeSavedCharacter(base);
    const edited = editSavedCharacter(c, { abilities: { str: 99, con: 0 }, hitPoints: 9000, thac0: -5 });
    expect(edited.abilities.str).toBe(25); // ability ceiling
    expect(edited.abilities.con).toBe(1); // ability floor
    expect(edited.hitPoints).toBe(255); // byte ceiling
    expect(edited.thac0).toBe(0); // thac0 floor
  });

  it('preserves the unmodelled bytes (class/level/spell-slot data) when overlaying an edit', () => {
    // Stamp some "unknown" bytes the decoder does not model; an HP edit must not disturb them.
    const withExtra = base.slice();
    withExtra[79] = 3; withExtra[80] = 2; withExtra[81] = 1; // e.g. cleric spell slots
    withExtra[206] = 7; // some level/enum byte
    const c = decodeSavedCharacter(withExtra);
    const out = encodeSavedCharacter(editSavedCharacter(c, { hitPoints: 50 }));
    expect(out[98]).toBe(50); // the edit landed
    expect([out[79], out[80], out[81]]).toEqual([3, 2, 1]); // preserved
    expect(out[206]).toBe(7); // preserved
    expect(out.length).toBe(SAVED_CHARACTER_SIZE);
  });

  it('writes the inverted AC/THAC0 store the decoder expects', () => {
    const c = decodeSavedCharacter(makeChar('X'));
    const out = encodeSavedCharacter(editSavedCharacter(c, { armorClass: 4, thac0: 16 }));
    expect(out[275]).toBe(60 - 4); // AC inverted
    expect(out[89]).toBe(60 - 16); // THAC0 inverted
  });
});

// --- Golden: the real CoK SAVE party (skips if absent) -----------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const saveDir = resolve(here, '..', '..', '..', 'Champions of Krynn', 'SAVE');
const chr1 = resolve(saveDir, 'CHRDATA1.SAV');

describe('decodeSavedCharacter — golden CoK SAVE', () => {
  it.skipIf(!existsSync(chr1))('imports the saved party with verified stats', async () => {
    const load = async (f: string) => decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, f))));
    const sir = await load('CHRDATA1.SAV');
    expect(sir.name).toBe('SIR STRONGSWORD');
    expect(sir.abilities.str).toBe(18); // a mighty knight
    expect(sir.hitPoints).toBe(27);
    expect(sir.thac0).toBe(20);
    // Fighter-class saves (good vs paralyze/breath at this level).
    expect(sir.savingThrows.paralyzePoisonDeath).toBe(11);

    if (existsSync(resolve(saveDir, 'CHRDATA2.SAV'))) {
      const istan = await load('CHRDATA2.SAV');
      expect(istan.name).toBe('ISTAN HORBIN');
      expect(istan.hitPoints).toBe(30);
      // Classic poor low-level Magic-User saves.
      expect(istan.savingThrows.spell).toBe(17);
    }
    if (existsSync(resolve(saveDir, 'CHRDATA3.SAV'))) {
      const garin = await load('CHRDATA3.SAV');
      expect(garin.name.trim()).toBe('GARIN');
      expect(garin.hitPoints).toBe(22);
    }
  });

  // RE-DERIVED 2026-09-07 from the retail bytes and the `START.EXE` enums. What stood here asserted
  // `istan.classCode === 2` / `'magicUser'` and `kal.classCode === 1` / `'cleric'` off offset 90, and
  // justified them with "ISTAN is a Magic-User with STR 18" and "KAL is a Cleric with DEX 19". Those
  // were goldens read out of the code under test: offset 90 is the RACE byte, ISTAN's 2 is Half-elf
  // and KAL's 1 is Qualinesti Elf.
  it.skipIf(!existsSync(chr1))('pins the class code (offset 91) and the race code (offset 90) for the whole retail party', async () => {
    const load = async (f: string) => decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, f))));
    // Every one of the six shipped records, class and race, straight off disk. Denominator 6 of 6.
    const expected: Record<string, { cls: number; race: number; label: string; raceLabel: string }> = {
      'CHRDATA1.SAV': { cls: 7, race: 6, label: 'Knight', raceLabel: 'Human' },
      'CHRDATA2.SAV': { cls: 4, race: 2, label: 'Ranger', raceLabel: 'Half-elf' },
      'CHRDATA3.SAV': { cls: 13, race: 2, label: 'Fighter/Mage', raceLabel: 'Half-elf' },
      'CHRDATA4.SAV': { cls: 14, race: 5, label: 'Fighter/Thief', raceLabel: 'Kender' },
      'CHRDATA5.SAV': { cls: 11, race: 1, label: 'Cleric/Mage', raceLabel: 'Qualinesti Elf' },
      'CHRDATA6.SAV': { cls: 9, race: 1, label: 'Cleric/Fighter/Mage', raceLabel: 'Qualinesti Elf' },
    };
    let checked = 0;
    for (const [file, want] of Object.entries(expected)) {
      if (!existsSync(resolve(saveDir, file))) continue;
      const sc = await load(file);
      expect(sc.classCode).toBe(want.cls);
      expect(sc.raceCode).toBe(want.race);
      expect(cokClassLabel(sc.classCode)).toBe(want.label);
      expect(cokRaceLabel(sc.raceCode)).toBe(want.raceLabel);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(4); // at least the party this repo ships with
  });

  // The discriminator that identified these two bytes, asserted directly so a swap back cannot pass.
  // This is the file header's "signal 1": the class enum has 17 entries and the race enum 8, so the
  // assignment is NOT symmetric and the two bytes cannot simply be exchanged.
  it.skipIf(!existsSync(chr1))('offset 90 holds a legal race in 6 of 6 records, while offset 91 exceeds the 8-entry race enum in 4 of 6 — the swap is not viable', async () => {
    const load = async (f: string) => decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, f))));
    const files = ['CHRDATA1.SAV', 'CHRDATA2.SAV', 'CHRDATA3.SAV', 'CHRDATA4.SAV', 'CHRDATA5.SAV', 'CHRDATA6.SAV']
      .filter((f) => existsSync(resolve(saveDir, f)));
    expect(files.length).toBe(6);
    const recs = await Promise.all(files.map(load));

    // As read: every race byte indexes the 8-entry table, every class byte the 17-entry table.
    expect(recs.filter((r) => r.raceCode < COK_RACE_NAMES.length).length).toBe(6);
    expect(recs.filter((r) => r.classCode < COK_CLASS_NAMES.length).length).toBe(6);

    // The null: read the other way round, 4 of the 6 class bytes (13, 14, 11, 9) are not races at all.
    const wouldBeIllegalRaces = recs.filter((r) => r.classCode >= COK_RACE_NAMES.length);
    expect(wouldBeIllegalRaces.length).toBe(4);
    expect(wouldBeIllegalRaces.map((r) => r.classCode).sort((x, y) => x - y)).toEqual([9, 11, 13, 14]);
  });

  // Signal 2: two in-record fields that are independent of both bytes agree with the class reading,
  // with zero false positives and zero misses. Under the old offset-90 reading the cleric slots
  // belonged to a code the map called plain 'cleric' and MOLLY's code was not mapped at all.
  it.skipIf(!existsSync(chr1))('cleric spell slots and thief skills fall exactly on the class codes that name those classes', async () => {
    const load = async (f: string) => decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, f))));
    const files = ['CHRDATA1.SAV', 'CHRDATA2.SAV', 'CHRDATA3.SAV', 'CHRDATA4.SAV', 'CHRDATA5.SAV', 'CHRDATA6.SAV']
      .filter((f) => existsSync(resolve(saveDir, f)));
    expect(files.length).toBe(6);
    for (const f of files) {
      const sc = await load(f);
      const parts = dragonlanceClassesForCode(sc.classCode) ?? [];
      const hasClericSlots = sc.raw[79] + sc.raw[80] + sc.raw[81] > 0;
      const hasThiefSkills = sc.thiefSkills.some((n) => n > 0);
      // Both directions, per record: the field is present iff the class code names that class.
      expect(hasClericSlots).toBe(parts.includes('cleric'));
      expect(hasThiefSkills).toBe(parts.includes('thief'));
    }
  });
});

// --- Shipping import contract: what apps/web/src/ui/importParty.ts actually carries into the live
// Greybox party (2026-07-16, BUILD-QUEUE P2.4 "Keep original DOS save import/export as a separate
// per-title format proof" — see docs/engine/research/original-save-import-export-status.md).
//
// importParty.ts cannot be imported here: packages/engine is the DOM/UI-free core and apps/web
// *depends on* it, never the reverse, so importing UI code into an engine test would invert the
// package graph. Instead these tests (a) exercise the exact engine primitives `sheetFromSaved()` /
// `playerCharacterFromSaved()` call — `decodeSavedCharacter`, `dragonlanceClassForCode`,
// `clericSpellSlots`/`spellSlots` — against the same real party fixtures decoded above, so a change to
// those primitives' behaviour fails here too, and (b) where the claim is about *what importParty.ts's
// own source does* (which fields it fetches/spreads) rather than a decode primitive, read that file's
// literal source text and assert on it directly — a concrete, drift-detecting proxy for "the shipping
// code still does X" without a module dependency.
describe('shipping import contract — apps/web/src/ui/importParty.ts (real CoK SAVE fixtures)', () => {
  const importPartySrc = resolve(here, '..', '..', '..', 'apps', 'web', 'src', 'ui', 'importParty.ts');

  it.skipIf(!existsSync(chr1))(
    'carries name/abilities/hp/ac/thac0/saves/xp byte-for-byte into the CharacterSheet (importParty.ts:120-133 spreads sc.* verbatim)',
    async () => {
      const sir = decodeSavedCharacter(new Uint8Array(await readFile(chr1)));
      // sheetFromSaved(): name: sc.name.trim()||'IMPORTED', abilities: {...sc.abilities}, thac0: sc.thac0,
      // ac: sc.armorClass, savingThrows: {...sc.savingThrows}, hp/maxHp: sc.hitPoints — every one of these
      // is an identity copy off the decoded record, so proving the decode is byte-faithful (below, against
      // the real save) is proving the shipped sheet is byte-faithful for these fields.
      expect(sir.name.trim()).toBe('SIR STRONGSWORD');
      expect(sir.abilities).toEqual({ str: 18, int: 17, wis: 13, dex: 17, con: 18, cha: 16 });
      expect(sir.hitPoints).toBe(27);
      expect(sir.armorClass).toBe(10);
      expect(sir.thac0).toBe(20);
      expect(sir.savingThrows).toEqual({
        paralyzePoisonDeath: 11,
        petrifyPolymorph: 10,
        rodStaffWand: 10,
        breath: 14,
        spell: 11,
      });
      expect(sir.xp).toBe(0); // importParty.ts only calls setXp() when sc.xp > 0 — this mid-campaign save has none

      if (existsSync(resolve(saveDir, 'CHRDATA5.SAV'))) {
        const kal = decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA5.SAV'))));
        expect(kal.name.trim()).toBe('KAL');
        expect(kal.abilities).toEqual({ str: 15, int: 17, wis: 18, dex: 19, con: 18, cha: 16 });
        expect(kal.hitPoints).toBe(21);
      }
    },
  );

  // RE-DERIVED 2026-09-07. This test used to be titled "does NOT carry race/sex/alignment" and
  // asserted `'race' in sir === false`, describing importParty.ts's `race: 'human'` as necessarily
  // hardcoded "because the decoder never produces these keys". The decoder now produces `raceCode`
  // (offset 90) and importParty.ts reads it, so the claim is inverted for race and unchanged for the
  // other two. The key list is re-derived from `SavedCharacter`'s own declaration.
  it.skipIf(!existsSync(chr1))(
    'carries a save-derived raceCode, but still NOT sex or alignment (no byte is pinned for those, so they stay hardcoded male/Good-0)',
    async () => {
      const sir = decodeSavedCharacter(new Uint8Array(await readFile(chr1)));
      const keys = Object.keys(sir).sort();
      expect(keys).toEqual(
        // `thiefSkills` joined this list on 2026-08-26, `raceCode` on 2026-09-07, and `appearance`
        // on 2026-10-26 from the source-mapped CoK record tuple at 0x135..0x13E.
        ['abilities', 'appearance', 'armorClass', 'classCode', 'raceCode', 'hitPoints', 'name', 'raw', 'savingThrows', 'thac0', 'thiefSkills', 'xp'].sort(),
      );
      expect('raceCode' in sir).toBe(true);
      // SIR STRONGSWORD is Human — and he is the only one of the six who is, which is why the old
      // hardcoded 'human' went unnoticed.
      expect(sir.raceCode).toBe(6);
      // Still genuinely absent: no byte is pinned for either.
      expect('sex' in sir).toBe(false);
      expect('alignment' in sir).toBe(false);
    },
  );

  it.skipIf(!existsSync(chr1))(
    'class carries forward (dragonlanceClassForCode) for the three retail-validated codes; unvalidated codes fall through to importParty.ts\'s ability heuristic',
    async () => {
      const load = async (f: string) => decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, f))));
      // Every classCode actually present in the real shipped party, decoded straight off disk.
      const files = ['CHRDATA1.SAV', 'CHRDATA2.SAV', 'CHRDATA3.SAV', 'CHRDATA4.SAV', 'CHRDATA5.SAV', 'CHRDATA6.SAV'];
      const present = files.filter((f) => existsSync(resolve(saveDir, f)));
      expect(present.length).toBeGreaterThanOrEqual(4); // at least the party this repo ships with
      const pinned: string[] = [];
      const heuristic: string[] = [];
      for (const f of present) {
        const sc = await load(f);
        (dragonlanceClassForCode(sc.classCode) ? pinned : heuristic).push(sc.name.trim());
      }
      // RE-DERIVED 2026-09-07. This used to expect MOLLY in `heuristic` (her offset-90 byte, 5, was
      // unmapped) and only SIR STRONGSWORD / ISTAN / KAL in `pinned`. Reading offset 91 against the
      // game's own 17-entry enum, all 6 of 6 take the pinned branch — MOLLY included, as
      // Fighter/Thief (14). The ability heuristic is now unreached on retail data.
      expect(heuristic).toEqual([]);
      expect(pinned.length).toBe(present.length);
      expect(pinned).toEqual(
        expect.arrayContaining(['SIR STRONGSWORD', 'ISTAN HORBIN', 'GARIN', 'MOLLY', 'KAL', 'SIRRION']),
      );
    },
  );

  it.skipIf(!existsSync(chr1))(
    'spell-slot progression is a pure function of (class, level, wisdom) computed by importParty.ts — never read from the save (raw bytes 79-81 are provably unused)',
    async () => {
      const kal = decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA5.SAV'))));
      // importParty.ts's inferLevel(): Math.round(hp / CLASS_AVG_HD[cls]), clamped [1,9] (importParty.ts:49-56,99-103).
      // Duplicated here (packages/engine can't import the UI constant) — cleric's avg HD is 4.5 (d8).
      const level = Math.max(1, Math.min(9, Math.round(kal.hitPoints / 4.5) || 1));
      expect(level).toBe(5); // 21 hp / 4.5 -> round(4.67) = 5

      const slots = clericSpellSlots(level, kal.abilities.wis);
      expect(slots.some((n) => n > 0)).toBe(true);

      // Proof the save's own raw bytes never feed this: clericSpellSlots()/spellSlots() take only
      // (class-derived level, wisdom) as parameters — no SavedCharacter or raw buffer. Mutating bytes
      // 79-81 (KAL's own real cleric spell-slot bytes, used only to VALIDATE the class-code mapping in
      // the golden test above — savedCharacter.test.ts:201-209) cannot change decodeSavedCharacter's
      // output at all, because SAVED fields never read those offsets, so it cannot change slots either.
      const mutated = kal.raw.slice();
      mutated[79] = 0xff; mutated[80] = 0xff; mutated[81] = 0xff;
      const kalMutated = decodeSavedCharacter(mutated);
      expect(kalMutated.hitPoints).toBe(kal.hitPoints);
      expect(kalMutated.abilities).toEqual(kal.abilities);
      const slotsMutated = clericSpellSlots(level, kalMutated.abilities.wis);
      expect(slotsMutated).toEqual(slots);

      // spellSlots()/clericSpellSlots() are exported engine functions taking (ClassId|'cleric', level[, wis])
      // — sanity-check the non-cleric path (magicUser) importParty.ts also uses (importParty.ts:116-117) is
      // likewise raw-byte-free.
      const istan = existsSync(resolve(saveDir, 'CHRDATA2.SAV'))
        ? decodeSavedCharacter(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA2.SAV'))))
        : null;
      if (istan) {
        const istanLevel = Math.max(1, Math.min(9, Math.round(istan.hitPoints / 2.5) || 1));
        const mu = spellSlots('magicUser', istanLevel);
        expect(mu).toHaveLength(5);
      }
    },
  );

  it.skipIf(!existsSync(importPartySrc))(
    'importParty.ts only fetches CHRDATA{1..6}.SAV — never the CoK .STF/.SFX sidecars (they have no production consumer per the format-status audit)',
    async () => {
      const src = await readFile(importPartySrc, 'utf8');
      // The 6 literal asset paths the bundler ships (importParty.ts:39-46).
      for (let i = 1; i <= 6; i++) {
        expect(src).toContain(`Champions of Krynn/SAVE/CHRDATA${i}.SAV`);
      }
      expect(src).not.toMatch(/\.STF/);
      expect(src).not.toMatch(/\.SFX/);
    },
  );
});

// --- exportSavedCharacter: synthesize a Greybox in-session character into a retail CoK record
// (2026-07-16, BUILD-QUEUE P2.4 "Keep original DOS save import/export as a separate per-title format
// proof" — CoK export half). Unlike encodeSavedCharacter (which overlays edits onto an ALREADY-LOADED
// record), exportSavedCharacter builds a full 409-byte record from scratch with no source `.SAV` file —
// the gap the 2026-07-16 status audit flagged as missing.

// RE-DERIVED 2026-09-07 against the `START.EXE` class enum. The three tests here previously pinned
// `cleric`->1, `magicUser`->2, `knight`->6, `thief`->5 and `fighter`/`ranger`->0, and one was named
// "writes 0 (no retail evidence) for fighter/ranger rather than inventing a code". Every one of those
// codes was wrong, and the 0 sentinel was the most dangerous: 0 is `Cleric` in the real enum, so
// writing 0 for "no evidence" asserted a class rather than declining to.
describe('classCodeForDragonlanceClass — the write-direction class-code map', () => {
  it('round-trips ALL SIX Dragonlance classes - every one has an exact single-class entry in the game enum', () => {
    const classes: DragonlanceClassId[] = ['cleric', 'fighter', 'ranger', 'knight', 'magicUser', 'thief'];
    expect(classes.map(classCodeForDragonlanceClass)).toEqual([0, 2, 4, 7, 5, 6]);
    for (const cls of classes) {
      expect(dragonlanceClassForCode(classCodeForDragonlanceClass(cls))).toBe(cls);
    }
  });

  it('has no "unknown class" byte available, because code 0 is a real Cleric', () => {
    expect(cokClassLabel(0)).toBe('Cleric');
    expect(dragonlanceClassForCode(0)).toBe('cleric');
    // Nothing in the write map may emit a code that decodes to null — that would be an unreadable
    // record, not an honest "unknown".
    const classes: DragonlanceClassId[] = ['cleric', 'fighter', 'ranger', 'knight', 'magicUser', 'thief'];
    for (const cls of classes) expect(dragonlanceClassForCode(classCodeForDragonlanceClass(cls))).not.toBeNull();
  });

  it('round-trips all seven playable races through raceCodeForDragonlanceRace', () => {
    const races = ['human', 'hillDwarf', 'mountainDwarf', 'silvanestiElf', 'qualinestiElf', 'halfElf', 'kender'] as const;
    for (const race of races) {
      expect(dragonlanceRaceForCode(raceCodeForDragonlanceRace(race))).toBe(race);
    }
    expect(raceCodeForDragonlanceRace('kender')).toBe(5);
    expect(raceCodeForDragonlanceRace('human')).toBe(6);
  });
});

describe('exportSavedCharacter — synthesize a full record from scratch (synthetic)', () => {
  const cleric: ExportCharacterInput = {
    name: 'GOLDMOON',
    abilities: { str: 12, int: 13, wis: 18, dex: 11, con: 14, cha: 16 },
    hitPoints: 21,
    armorClass: 4,
    thac0: 18,
    savingThrows: { paralyzePoisonDeath: 10, petrifyPolymorph: 11, rodStaffWand: 13, breath: 15, spell: 12 },
    classId: 'cleric',
    xp: 8500,
  };

  it('is the right size and every input field survives decode byte-for-byte', () => {
    const raw = exportSavedCharacter(cleric);
    expect(raw.length).toBe(SAVED_CHARACTER_SIZE);
    const back = decodeSavedCharacter(raw);
    expect(back.name).toBe(cleric.name);
    expect(back.abilities).toEqual(cleric.abilities);
    expect(back.hitPoints).toBe(cleric.hitPoints);
    expect(back.armorClass).toBe(cleric.armorClass);
    expect(back.thac0).toBe(cleric.thac0);
    expect(back.savingThrows).toEqual(cleric.savingThrows);
    expect(back.xp).toBe(cleric.xp);
    // RE-DERIVED 2026-09-07: cleric is code 0 in the game's own enum, not 1 (1 is Druid).
    expect(back.classCode).toBe(0);
    expect(dragonlanceClassForCode(back.classCode)).toBe('cleric'); // recovers the class through the REAL map
    // Race defaults to human (6) when `raceId` is omitted — a stated default, not an unset byte.
    expect(back.raceCode).toBe(6);
    expect(decodeSavedCharacter(exportSavedCharacter({ ...cleric, raceId: 'kender' })).raceCode).toBe(5);
  });

  it('writes the ability MAX byte equal to current (a fresh character has taken no stat drain)', () => {
    const raw = exportSavedCharacter(cleric);
    // Offsets per savedCharacter.ts: ABILITY_OFFSET=16, (cur,max) pairs of 2 bytes each, str..cha order.
    const pairs: [number, keyof typeof cleric.abilities][] = [
      [16, 'str'], [18, 'int'], [20, 'wis'], [22, 'dex'], [24, 'con'], [26, 'cha'],
    ];
    for (const [curOffset, key] of pairs) {
      expect(raw[curOffset]).toBe(cleric.abilities[key]); // current
      expect(raw[curOffset + 1]).toBe(cleric.abilities[key]); // max === current
    }
  });

  it('defaults xp to 0 when omitted, matching a freshly-created character', () => {
    const { xp: _xp, ...noXp } = cleric;
    const raw = exportSavedCharacter(noXp);
    expect(decodeSavedCharacter(raw).xp).toBe(0);
  });

  it('leaves every unmodelled byte at 0 — genuinely unknown fields are not invented', () => {
    const raw = exportSavedCharacter(cleric);
    // Cleric spell-slot bytes (79-81) and a level/enum byte (206) the decoder does not model — these are
    // exactly the "still not mapped" bytes documented at the top of savedCharacter.ts.
    expect([raw[79], raw[80], raw[81]]).toEqual([0, 0, 0]);
    expect(raw[206]).toBe(0);
  });

  it('clamps out-of-range synthesized fields the same way the editor does', () => {
    const raw = exportSavedCharacter({
      ...cleric,
      abilities: { ...cleric.abilities, str: 99, con: 0 },
      hitPoints: 9000,
      armorClass: -99,
      thac0: -5,
      xp: 999999,
    });
    const back = decodeSavedCharacter(raw);
    expect(back.abilities.str).toBe(25); // ability ceiling
    expect(back.abilities.con).toBe(1); // ability floor
    expect(back.hitPoints).toBe(255); // byte ceiling
    expect(back.armorClass).toBe(-10); // AC floor
    expect(back.thac0).toBe(0); // thac0 floor
    expect(back.xp).toBe(65535); // u16 ceiling
  });

  it('every DragonlanceClassId produces a decodable, byte-stable record even where the class code has no retail evidence', () => {
    const classes: DragonlanceClassId[] = ['cleric', 'fighter', 'ranger', 'knight', 'magicUser', 'thief'];
    for (const classId of classes) {
      const raw = exportSavedCharacter({ ...cleric, classId });
      expect(raw.length).toBe(SAVED_CHARACTER_SIZE);
      const back = decodeSavedCharacter(raw);
      expect(back.classCode).toBe(classCodeForDragonlanceClass(classId));
      // Every combat-relevant field survives regardless of class-code confidence.
      expect(back.hitPoints).toBe(cleric.hitPoints);
      expect(back.abilities).toEqual(cleric.abilities);
    }
  });
});

// --- Real-fixture-guarded: exportSavedCharacter's byte offsets/encodings are grounded against the
// REAL retail CHRDATA2.SAV (ISTAN HORBIN, Magic-User, classCode 2) and CHRDATA5.SAV (KAL, Cleric,
// classCode 1) — decode the genuine save to get ground-truth field values, feed those same values back
// through the SYNTHESIS path (not encodeSavedCharacter's overlay path), and prove the resulting bytes
// match the real file byte-for-byte at every offset this module models. This is the oracle proof the
// task asked for: the exporter's field encodings are not invented, they reproduce what a real retail
// save actually contains.
describe('exportSavedCharacter — grounded against real CoK SAVE fixtures (oracle proof)', () => {
  const chr2 = resolve(saveDir, 'CHRDATA2.SAV');
  const chr5 = resolve(saveDir, 'CHRDATA5.SAV');

  // Byte offsets under test, mirrored from savedCharacter.ts's own constants (kept literal here so a
  // change to those constants would have to also break this file's independent oracle check).
  const OFFSETS = {
    // RE-DERIVED 2026-09-07: `classCode` was 90 here, which is the RACE byte. Both are now listed.
    nameLen: 0, name: 1, ability: 16, thac0: 89, raceCode: 90, classCode: 91, hp: 98, saves: 208, ac: 275, xp: 304,
  };

  // RE-DERIVED 2026-09-07 — including this test's own PREMISE. It was titled "a synthesized ISTAN
  // HORBIN (Magic-User)" and asserted `real.classCode === 2` as "the real save's own validated
  // Magic-User code". ISTAN is not a Magic-User: byte 91 is 4, `Ranger`, and byte 90 is 2, `Half-elf`
  // — the 2 the old test read as a class. His stored saves 14/15/16/17/17 are this engine's own
  // `addnd1e` fighter/ranger row for levels 1-2, not any magic-user row, which is independent
  // confirmation that owes nothing to the enum.
  //
  // The test is STRONGER after the correction, not merely different: the race byte is now a second
  // modelled field the synthesis has to reproduce against the real file.
  it.skipIf(!existsSync(chr2))(
    'a synthesized ISTAN HORBIN (Ranger, Half-elf) matches CHRDATA2.SAV byte-for-byte on every modelled field',
    async () => {
      const realRaw = new Uint8Array(await readFile(chr2));
      const real = decodeSavedCharacter(realRaw);
      expect(real.classCode).toBe(4); // ground truth off disk: Ranger
      expect(real.raceCode).toBe(2); // ground truth off disk: Half-elf

      const synthesized = exportSavedCharacter({
        name: real.name,
        abilities: real.abilities,
        hitPoints: real.hitPoints,
        armorClass: real.armorClass,
        thac0: real.thac0,
        savingThrows: real.savingThrows,
        classId: 'ranger',
        raceId: 'halfElf',
        xp: real.xp,
      });

      // Name framing + ASCII bytes.
      expect(synthesized[OFFSETS.nameLen]).toBe(realRaw[OFFSETS.nameLen]);
      for (let i = 0; i < realRaw[OFFSETS.nameLen]; i++) {
        expect(synthesized[OFFSETS.name + i]).toBe(realRaw[OFFSETS.name + i]);
      }
      // Current ability bytes (the six 2-byte cur/max pairs' CURRENT half).
      for (let slot = 0; slot < 6; slot++) {
        expect(synthesized[OFFSETS.ability + slot * 2]).toBe(realRaw[OFFSETS.ability + slot * 2]);
      }
      expect(synthesized[OFFSETS.thac0]).toBe(realRaw[OFFSETS.thac0]);
      expect(synthesized[OFFSETS.classCode]).toBe(realRaw[OFFSETS.classCode]); // both are 4 (Ranger)
      expect(synthesized[OFFSETS.raceCode]).toBe(realRaw[OFFSETS.raceCode]); // both are 2 (Half-elf)
      expect(synthesized[OFFSETS.hp]).toBe(realRaw[OFFSETS.hp]);
      for (let i = 0; i < 5; i++) {
        expect(synthesized[OFFSETS.saves + i]).toBe(realRaw[OFFSETS.saves + i]);
      }
      expect(synthesized[OFFSETS.ac]).toBe(realRaw[OFFSETS.ac]);
      expect(synthesized[OFFSETS.xp]).toBe(realRaw[OFFSETS.xp]);
      expect(synthesized[OFFSETS.xp + 1]).toBe(realRaw[OFFSETS.xp + 1]);

      // And the round trip recovers class AND race through the real maps, same as the shipping
      // importer would.
      expect(dragonlanceClassForCode(decodeSavedCharacter(synthesized).classCode)).toBe('ranger');
      expect(dragonlanceRaceForCode(decodeSavedCharacter(synthesized).raceCode)).toBe('halfElf');
    },
  );

  // RE-DERIVED 2026-09-07, and this one now records a real EXPORT GAP rather than a clean match.
  // The old test was titled "a synthesized KAL (Cleric)" and asserted `real.classCode === 1` as "the
  // real save's own validated Cleric code". KAL's byte 91 is 11, `Cleric/Mage`, and her byte 90 is 1,
  // `Qualinesti Elf` — the 1 the old test read as a class. Her stored saves 10/13/11/15/12 are exactly
  // the AD&D "best of each component" combination of this engine's own cleric and magic-user rows,
  // which is independent of the enum.
  //
  // `exportSavedCharacter` takes ONE `classId`, so it cannot synthesize a multiclass code. That is a
  // real limitation and is asserted here as a concrete inequality rather than skipped over, so it goes
  // red the day the exporter learns multiclass and this comment needs updating.
  it.skipIf(!existsSync(chr5))(
    'a synthesized KAL (Cleric/Mage, Qualinesti Elf) matches CHRDATA5.SAV on every modelled field EXCEPT the multiclass code the exporter cannot write',
    async () => {
      const realRaw = new Uint8Array(await readFile(chr5));
      const real = decodeSavedCharacter(realRaw);
      expect(real.classCode).toBe(11); // ground truth off disk: Cleric/Mage
      expect(real.raceCode).toBe(1); // ground truth off disk: Qualinesti Elf
      expect(dragonlanceClassesForCode(real.classCode)).toEqual(['cleric', 'magicUser']);

      const synthesized = exportSavedCharacter({
        name: real.name,
        abilities: real.abilities,
        hitPoints: real.hitPoints,
        armorClass: real.armorClass,
        thac0: real.thac0,
        savingThrows: real.savingThrows,
        classId: 'cleric', // the PRIMARY component; the exporter has no way to express the pair
        raceId: 'qualinestiElf',
        xp: real.xp,
      });

      expect(synthesized[OFFSETS.nameLen]).toBe(realRaw[OFFSETS.nameLen]);
      for (let slot = 0; slot < 6; slot++) {
        expect(synthesized[OFFSETS.ability + slot * 2]).toBe(realRaw[OFFSETS.ability + slot * 2]);
      }
      expect(synthesized[OFFSETS.thac0]).toBe(realRaw[OFFSETS.thac0]);
      expect(synthesized[OFFSETS.hp]).toBe(realRaw[OFFSETS.hp]);
      expect(synthesized[OFFSETS.ac]).toBe(realRaw[OFFSETS.ac]);
      // The race byte DOES reproduce exactly — races have no multi-valued codes.
      expect(synthesized[OFFSETS.raceCode]).toBe(realRaw[OFFSETS.raceCode]);

      // THE GAP, stated as concrete values on both sides rather than a bare `.not`: the real record
      // says Cleric/Mage (11), the synthesis can only say Cleric (0).
      expect(realRaw[OFFSETS.classCode]).toBe(11);
      expect(synthesized[OFFSETS.classCode]).toBe(0);

      expect(dragonlanceClassForCode(decodeSavedCharacter(synthesized).classCode)).toBe('cleric');
      expect(dragonlanceRaceForCode(decodeSavedCharacter(synthesized).raceCode)).toBe('qualinestiElf');
    },
  );

  // Full round-trip through the SAME class/level-inference logic importParty.ts's sheetFromSaved()
  // actually runs (duplicated here for the same reason the "shipping import contract" block above
  // duplicates it — packages/engine cannot import apps/web UI code without inverting the package
  // graph). This proves a synthesized-from-scratch record produces a SANE, non-crashing sheet through
  // the real import formulas, not just a byte-identical decode.
  it.skipIf(!existsSync(chr5))(
    'a synthesized KAL round-trips through importParty.ts\'s own class/level/spell-slot inference into a sane sheet',
    async () => {
      const realRaw = new Uint8Array(await readFile(chr5));
      const real = decodeSavedCharacter(realRaw);

      const synthesized = exportSavedCharacter({
        name: real.name,
        abilities: real.abilities,
        hitPoints: real.hitPoints,
        armorClass: real.armorClass,
        thac0: real.thac0,
        savingThrows: real.savingThrows,
        classId: 'cleric',
        xp: real.xp,
      });
      const reimported = decodeSavedCharacter(synthesized);

      // importParty.ts's inferClass(): the validated class code short-circuits the ability heuristic.
      const cls = dragonlanceClassForCode(reimported.classCode);
      expect(cls).toBe('cleric');

      // importParty.ts's inferLevel(): Math.round(hp / CLASS_AVG_HD[cls]), clamped [1,9]; cleric d8 avg 4.5.
      const level = Math.max(1, Math.min(9, Math.round(reimported.hitPoints / 4.5) || 1));
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(9);

      // importParty.ts's sheetFromSaved() spell-slot branch for cleric.
      const slots = clericSpellSlots(level, reimported.abilities.wis);
      expect(slots).toHaveLength(5);

      // Every combat-relevant field the sheet copies verbatim from the decoded record is unchanged.
      expect(reimported.hitPoints).toBe(real.hitPoints);
      expect(reimported.armorClass).toBe(real.armorClass);
      expect(reimported.thac0).toBe(real.thac0);
      expect(reimported.savingThrows).toEqual(real.savingThrows);
      expect(reimported.abilities).toEqual(real.abilities);
    },
  );
});
