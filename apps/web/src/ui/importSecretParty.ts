/**
 * R2 — Import Secret of the Silver Blades' six real pregen `CHRDATA{1..6}.SAV` heroes
 * (`?import=secret`) into the active roster. Mirrors `importCoabParty.ts`'s pattern (a same-shaped
 * `*ImportResult`, an `install*Seam()` for e2e, the substitution/dropped-class disclosure contract)
 * and reuses its translation helpers (`CLASS_LEVEL_SLOT_TO_DL`, `COAB_RACE_TO_DL`,
 * `classesFromLevels`) directly — Secret's `ClassLevel[8]` array uses the SAME `SkillType` slot
 * order CoAB's does, verified by the shared `coabExpectedClassLevelSlots` consistency oracle
 * (`secretSavedCharacter.ts`'s file doc, reproduced in `secretSavedCharacter.test.ts`).
 *
 * **Byte-faithful, independently oracled** (see `secretSavedCharacter.ts`'s file doc for each
 * check and its accept/reject count):
 *  - `name`;
 *  - the six core ability scores (`str/int/wis/dex/con/cha`) — the uniqueness sweep that located
 *    the block is the SAME kind of offset search CoAB's own ability block never needed (CoAB's
 *    offset came straight from the `Player.cs` decompile);
 *  - `classCode`/`classLabel` and the `classLevel[8]` array — the discriminating offset sweep
 *    (`docs/engine/research/secret-chrdata-layout.md`), reproduced against the retail bytes by this
 *    round, not merely cited;
 *  - `thac0` — matches this engine's OWN `bestThac0()` (the best/lowest THAC0 across the pinned
 *    class/level slots) for 6/6 real records, including the multiclass record;
 *  - `exp` — falls inside `xpForLevel(class, level)..xpForLevel(class, level+1)` for every active
 *    class/level, 6/6.
 *
 * **Reduced confidence, carried through but flagged, not silently treated as verified**:
 *  - `hpMax` — only a weak level/hit-die/CON bound holds (see the loader's file doc); labelled
 *    "(bounded, not proven)" in the panel;
 *  - `age` — a single cross-field correlation (the one hero with a different `race` byte also has
 *    by far the largest age), not a verified table; labelled "(not verified)" in the panel;
 *  - `str00` (exceptional-STR percentile) — corroborating (cur==full on 6/6, plausible values) but
 *    outside the range filter that made the ability-block offset UNIQUE, so it is carried as a
 *    byte-faithful read with a slightly weaker discriminating claim than the other six pairs.
 *
 * **Translated (round 34 R3) — `race`**. `secretSavedCharacter.ts`'s `raceLabel` field (from
 * `SECRET_RACE_LABEL`, Secret's OWN `START.EXE` string table at `0xEB91` — see that file's
 * "TRANSLATED" doc section for the byte evidence, the class-table/FRUA-hackdoc corroboration, and
 * the honestly-disclosed gap: the indexing *instruction* was not located, only the table itself)
 * is looked up in {@link SECRET_RACE_TO_DL} below, a mapping private to this file (Secret's own
 * numbering is NOT CoAB's `Race` enum — the two share no order, see the loader's rejection of that
 * alternative "by quoting the indexing code, not by fit"). Both of the two raw values the six real
 * pregens actually carry resolve to a *named* Dragonlance race (`3` -> Dwarf -> `mountainDwarf`,
 * `6` -> Human -> `human`); a name with no Dragonlance analog (Tribble/Gnome/Halfling/Monster)
 * still falls back to {@link DEFAULT_RACE} with a disclosed substitution note, exactly as before.
 *
 * **Class translation** (identical machinery to CoAB, see that file's doc for the "class" bullet):
 * paladin folds into fighter (no Paladin class in this ruleset); druid/monk have no analog and are
 * dropped if ever encountered (none of the 6 real saves exercises this). MALACHITE's
 * `fighter`+`thief` levels map onto this ruleset's own real multiclassing directly.
 *
 * **Not decoded this round** (carried raw only, see the loader's file doc): the byte at
 * `class - 1` (`0x6d` for Secret) — no hypothesis for it survived contact with the party.
 *
 * **Not modelled at all**: spellbook/equipment/thief-skills/saving-throw bytes — same honest gap
 * every importer in this directory leaves for fields outside its own round's scope.
 */
import {
  decodeSecretSavedCharacter,
  sniffSecretSavedCharacter,
  SECRET_SAVED_CHARACTER_SIZE,
  createCharacter,
  clampToRace,
  type Gen1SavedCharacter,
  type CharacterSheet,
  type CharacterRequest,
  type DragonlanceClassId,
  type DragonlanceRaceId,
  type AbilityScores,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { clearParty, addToParty, getParty } from './party.js';
import { classesFromLevels } from './importCoabParty.js';

/** The 6 literal `CHRDATA{n}.SAV` paths — the GOG install ROOT, no `SAVE/` segment (its own
 * `SAVE\` subfolder is empty, verified on-disk, see `secret-chrdata-layout.md`). Spelled out (not
 * built from a template) so `scripts/bundle-assets.mjs`'s literal-path scan ships them, following
 * `importCoabParty.ts:COAB_CHRDATA_PATHS`'s own convention and reasoning (repeated in full there —
 * not repeated here to avoid a second quoted game-data path literal sitting in an unrelated
 * docblock). */
const SECRET_CHRDATA_PATHS = [
  'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CHRDATA1.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CHRDATA2.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CHRDATA3.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CHRDATA4.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CHRDATA5.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CHRDATA6.SAV',
];

/** Generic human-allowed deity for an inferred Cleric with no stored deity — same fallback every
 * other importer in this directory uses. */
const DEFAULT_DEITY = 'mishakal';

/** Round 34 R3: Secret's OWN race table (`SECRET_RACE_LABEL` / `raceLabel`, from
 * `secretSavedCharacter.ts`, itself read from Secret's own `START.EXE` string table at `0xEB91` —
 * NOT CoAB's `Race` enum, which shares no numbering with it) mapped onto this ruleset's own
 * `DragonlanceRaceId`s. `null` marks a name with no Dragonlance analog (Tribble/Gnome/Halfling/
 * Monster) — disclosed the same way `COAB_RACE_TO_DL`'s own `null` entries are. Keyed by the RAW
 * `race` byte (0-based, Secret's own compiled table order — see the loader's file doc). */
const SECRET_RACE_TO_DL: Record<number, DragonlanceRaceId | null> = {
  0: null, // Tribble -- no analog
  1: 'qualinestiElf', // Elf -- disclosed pick, matches COAB_RACE_TO_DL's own elf mapping
  2: 'halfElf', // Half-Elf -- direct
  3: 'mountainDwarf', // Dwarf -- disclosed pick, matches COAB_RACE_TO_DL's own dwarf mapping
  4: null, // Gnome -- no analog
  5: null, // Halfling -- no analog, kender culturally unrelated (see COAB_RACE_TO_DL's own halfling note)
  6: 'human', // Human -- direct
  7: null, // Monster -- no analog
};

/** Disclosed default race for every imported hero whose raw `race` byte has no Dragonlance analog
 * in {@link SECRET_RACE_TO_DL} (see the file doc's "race" section). */
const DEFAULT_RACE: DragonlanceRaceId = 'human';

interface SecretImportCandidate {
  sheet: CharacterSheet;
  raw: Gen1SavedCharacter;
  classes: Partial<Record<DragonlanceClassId, number>>;
  race: DragonlanceRaceId;
  raceResolvedFromOwnTable: boolean;
  substitutions: string[];
  droppedClasses: string[];
}

/** Build a playable Dragonlance sheet from one Secret save, or `null` if every class slot had no
 * analog or `createCharacter` rejects the request outright. Race is never `null` here — a race
 * byte with no Dragonlance analog does not reject the hero, it falls back to {@link DEFAULT_RACE}
 * (disclosed), mirroring `importDqkParty.ts`'s own precedent. */
function sheetFromSecretSaved(sc: Gen1SavedCharacter): SecretImportCandidate | null {
  const ownTableMapped = SECRET_RACE_TO_DL[sc.race];
  const race = ownTableMapped ?? DEFAULT_RACE;
  const raceResolvedFromOwnTable = ownTableMapped !== null && ownTableMapped !== undefined;

  const { classes, substitutions, dropped } = classesFromLevels(sc);
  if (Object.keys(classes).length === 0) return null; // every class slot was a dropped analog

  const substitutionNotes = [...substitutions];
  if (!raceResolvedFromOwnTable) {
    substitutionNotes.push(
      `race byte ${sc.race} (${sc.raceLabel ?? 'unknown'}) has no Dragonlance analog (see importSecretParty.ts) — defaulted to human`,
    );
  }

  const sex = 'male'; // no sex byte located this round; every real Secret pregen name reads male-coded
  const rawAbilities: AbilityScores = {
    str: sc.abilities.str.full,
    int: sc.abilities.int.full,
    wis: sc.abilities.wis.full,
    dex: sc.abilities.dex.full,
    con: sc.abilities.con.full,
    cha: sc.abilities.cha.full,
    strPct: sc.abilities.str00.full,
  };
  const abilities = clampToRace(rawAbilities, race, sex);
  const hasCleric = classes.cleric !== undefined;

  const req: CharacterRequest = {
    name: sc.name.trim() || 'IMPORTED',
    race,
    sex,
    classes,
    abilities,
    deity: hasCleric ? DEFAULT_DEITY : undefined,
    hp: sc.hpMax,
    maxHp: sc.hpMax,
    baseAc: 10, // this ruleset's own unarmoured baseline -- see importCoabParty.ts's "thac0/ac" bullet
    levelCapRuleset: 'dqk',
  };
  const res = createCharacter(req);
  if (!res.ok) return null;
  return {
    sheet: res.sheet,
    raw: sc,
    classes,
    race,
    raceResolvedFromOwnTable,
    substitutions: substitutionNotes,
    droppedClasses: dropped,
  };
}

export interface SecretImportResult {
  /** Names of the characters that were imported, in roster order. */
  imported: string[];
  /** Per-character summary for display. Byte-faithful fields are `name`/`abilities`/`hpMax`
   * (bounded)/`age` (unverified)/`rawThac0`/`classCode`/`classLabel`/`classLevel`; `classes`/`ac`/
   * `thac0` are the built sheet's DERIVED values. `substitutions`/`droppedClasses` disclose every
   * translation the save's own bytes went through, INCLUDING the race default (see file doc). */
  summary: {
    name: string;
    raceByte: number;
    raceLabel: string | undefined;
    raceResolvedFromOwnTable: boolean;
    dlRace: string;
    classCode: number;
    classLabel: string | undefined;
    classLevel: number[];
    classes: Partial<Record<DragonlanceClassId, number>>;
    substitutions: string[];
    droppedClasses: string[];
    hp: number;
    hpConfidence: 'bounded, not proven';
    ac: number;
    rawThac0: number;
    displayThac0: number;
    age: number;
    ageConfidence: 'not verified';
    exp: number | undefined;
    baseAc: number | undefined;
    unverified: { offset: number; byte: number }[];
    abilities: AbilityScores;
  }[];
  /** Names that couldn't be validated by `createCharacter`, or whose every class slot had no
   * Dragonlance analog. */
  rejectedInvalid: string[];
  /** Names skipped because the 6-hero party was already full. */
  rejectedPartyFull: string[];
}

async function fetchSecretSave(path: string, assetSource?: AssetSource): Promise<Uint8Array | null> {
  try {
    if (assetSource) return assetSource.readAsset(basenameOf(path));
    if (import.meta.env.PROD) return null; // Public builds do not distribute saved characters.
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Read the six real Secret of the Silver Blades pregens and install them as the active roster
 * (replacing any current party). An empty result means none of the six save files could be
 * read/decoded.
 */
export async function importSecretParty(assetSource?: AssetSource): Promise<SecretImportResult> {
  const result: SecretImportResult = { imported: [], summary: [], rejectedInvalid: [], rejectedPartyFull: [] };
  const candidates: SecretImportCandidate[] = [];

  for (const path of SECRET_CHRDATA_PATHS) {
    const bytes = await fetchSecretSave(path, assetSource);
    if (!bytes || bytes.length !== SECRET_SAVED_CHARACTER_SIZE || !sniffSecretSavedCharacter(bytes)) continue;
    const sc = decodeSecretSavedCharacter(bytes);
    const candidate = sheetFromSecretSaved(sc);
    if (!candidate) {
      result.rejectedInvalid.push(sc.name.trim());
      continue;
    }
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    lastImport = result;
    return result;
  }

  clearParty();
  for (const c of candidates) {
    if (!addToParty(c.sheet)) {
      result.rejectedPartyFull.push(c.sheet.name);
      continue;
    }
    result.imported.push(c.sheet.name);
    result.summary.push({
      name: c.sheet.name,
      raceByte: c.raw.race,
      raceLabel: c.raw.raceLabel,
      raceResolvedFromOwnTable: c.raceResolvedFromOwnTable,
      dlRace: c.race,
      classCode: c.raw.classCode,
      classLabel: c.raw.classLabel,
      classLevel: c.raw.classLevel,
      classes: c.classes,
      substitutions: c.substitutions,
      droppedClasses: c.droppedClasses,
      hp: c.sheet.hp,
      hpConfidence: 'bounded, not proven',
      ac: c.sheet.ac,
      rawThac0: c.raw.thac0,
      displayThac0: 0x3c - c.raw.thac0,
      age: c.raw.age,
      ageConfidence: 'not verified',
      exp: c.raw.exp,
      baseAc: c.raw.baseAc,
      unverified: c.raw.unverified,
      abilities: c.sheet.abilities,
    });
  }
  lastImport = result;
  return result;
}

/** The most recent {@link importSecretParty} result, cached so the e2e seam can read it back. */
let lastImport: SecretImportResult | null = null;

/** Headless seam for e2e: trigger the import and read back what landed in the roster. */
export function installImportSecretSeam(): void {
  (window as unknown as { __importSecret?: Record<string, unknown> }).__importSecret = {
    run: () => importSecretParty(),
    party: () =>
      getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),
    summary: () => lastImport?.summary ?? [],
    rejected: () => (lastImport ? [...lastImport.rejectedInvalid, ...lastImport.rejectedPartyFull] : []),
  };
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * `?import=secret` panel renderer — mirrors `main.ts`'s own `startImportCoab`/`startImportDqk`
 * shape so Phase B's `main.ts` arm is a three-line call: `installImportSecretSeam()`,
 * `importSecretParty()`, `startImportSecretPanel(root)`. Kept here (not in `main.ts`) since this
 * whole importer is a self-contained Phase A unit.
 */
export async function startImportSecretPanel(root: HTMLElement, assetSource?: AssetSource): Promise<number> {
  root.innerHTML = '';
  installImportSecretSeam();

  let res: SecretImportResult;
  try {
    res = await importSecretParty(assetSource);
  } catch (err) {
    const errPanel = el('div', 'import-panel');
    errPanel.innerHTML = `<h2>Import failed</h2><p>${err instanceof Error ? err.message : String(err)}</p>`;
    root.appendChild(errPanel);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const panel = el('div', 'import-panel');
  if (res.imported.length === 0) {
    panel.innerHTML =
      '<h2>No Secret of the Silver Blades pregens found</h2>' +
      "<p>Point a Library entry at your Secret install's ROOT folder (its <code>SAVE/</code> is " +
      'empty), or run the dev server with the GOG release in place.</p>';
    root.appendChild(panel);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const rows = res.summary
    .map((c) => {
      const notes = [...c.substitutions, ...c.droppedClasses.map((d) => `dropped ${d}`)];
      return (
        `<tr><td>${c.name}</td><td>${c.classLabel ?? `class ${c.classCode}`}</td>` +
        `<td>race byte ${c.raceByte} (${c.raceLabel ?? 'unknown'})${c.raceResolvedFromOwnTable ? '' : ' — no analog'} &rarr; ${c.dlRace}</td>` +
        `<td>${c.hp} HP <span style="color:#888">(${c.hpConfidence})</span></td>` +
        `<td>THAC0 ${c.displayThac0} (raw ${c.rawThac0})</td>` +
        `<td>${c.age} <span style="color:#888">(${c.ageConfidence})</span></td>` +
        `<td style="color:#c96">${notes.join('; ') || '—'}</td></tr>`
      );
    })
    .join('');
  panel.innerHTML =
    `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Secret of the Silver Blades</h2>` +
    '<p style="color:#9aa">Name, ability scores, class/level, THAC0 and XP are independently ' +
    'oracled against this record\'s own bytes (see <code>secretSavedCharacter.ts</code>). HP and ' +
    'age carry only a weak bound / a single correlation, flagged in their own column. Race is read ' +
    "from Secret's OWN <code>START.EXE</code> string table (round 34 R3) — a name with no " +
    'Dragonlance analog still defaults to human, disclosed in the last column, not smoothed over.</p>' +
    '<table class="import-table"><thead><tr><th>Name</th><th>Secret class</th><th>Race</th>' +
    '<th>HP</th><th>THAC0</th><th>Age</th><th>Translation notes</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`;
  root.appendChild(panel);

  const rejected = [...res.rejectedInvalid, ...res.rejectedPartyFull];
  if (rejected.length) {
    const rej = el('div', 'import-rejected');
    rej.style.cssText = 'margin-top:10px;color:#c66';
    rej.innerHTML =
      '<h3 style="margin:0 0 4px;color:#c66">Could not join the party:</h3>' +
      res.rejectedInvalid.map((n) => `<div>${n} — could not be validated</div>`).join('') +
      res.rejectedPartyFull.map((n) => `<div>${n} — the party is full (6 heroes max)</div>`).join('');
    panel.appendChild(rej);
  }

  (window as unknown as { __rendered: number }).__rendered = res.imported.length;
  return res.imported.length;
}
