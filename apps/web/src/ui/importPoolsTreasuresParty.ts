/**
 * R3 — Import Pools of Darkness's six and Treasures of the Savage Frontier's eight real pregen
 * `CHRDATA{n}.SAV` heroes into the active roster. Both titles share ONE 510-byte record layout
 * (`packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts`), so this single file serves both
 * `?import=pools` and `?import=treasures` — mirroring `importSecretParty.ts`'s pattern (a
 * same-shaped `*ImportResult`, an `install*Seam()` for e2e, the substitution/dropped-class
 * disclosure contract) and reusing its class-translation helper (`classesFromLevels`) directly,
 * exactly as that file reuses it from `importCoabParty.ts`. Race is NOT shared: round 35 R4
 * replaced the borrowed `COAB_RACE_TO_DL` guess with these titles' OWN table (see the "race"
 * section below), so each title-family now maps race through the binary that was actually read.
 *
 * **Byte-faithful, independently oracled** (see the loader's file doc and
 * `docs/engine/research/pools-treasures-chrdata-fields.md` for each check and its accept/reject
 * count over all 14 real records, combined across both titles):
 *  - `name`;
 *  - the six core ability scores — the SAME uniqueness sweep that located Secret's ability block,
 *    reproduced over the 14-record combined party;
 *  - `classCode`/`classLabel` and the `classLevel[8]` array — Pools **5/6**, Treasures **7/8**
 *    (see the "two outliers" section below);
 *  - `baseAc` (constant `0x32` on 14/14) and `partySlot` (exact, matches file index).
 *
 * **Reduced confidence, carried through but flagged, not silently treated as verified — and
 * MATERIALLY WEAKER than Secret's own numbers for the same two fields**:
 *  - `thac0` — only **4 of 12** oracle-accepted records match this engine's own `bestThac0()`
 *    (Secret matched 6/6). Pools' records are all level >= 12, past this engine's own documented
 *    THAC0-table ceiling; labelled "(plausible, not verified)" in the panel;
 *  - `exp` — only **8 of 12** match the `xpForLevel` range check (Secret matched 6/6); several
 *    records share a suspiciously identical value. Labelled "(plausible, not verified)";
 *  - `hpMax` — the same weak level/hit-die/CON bound as Secret holds on 13 of 14 (the one miss is
 *    named in the loader's doc); labelled "(bounded, not proven)";
 *  - `age` — range only; a cross-field correlation (the record whose `race` byte differs also has
 *    the largest age) holds for Treasures but NOT Pools — reported, not claimed as a rule; labelled
 *    "(not verified)";
 *  - `savingThrows` — every byte falls in this engine's own AD&D-1e save-target range, a weak,
 *    non-unique corroboration; carried but not surfaced as a translated value in the summary table
 *    (raw bytes only, see `Gen1SavedCharacter.savingThrows`).
 *
 * **THE TWO OUTLIERS — SHOWN DISAGREEING, NEVER TRANSLATED.** Pools' `ABAGAIL` (class byte reads
 * `magic_user`, but her `classLevel[8]` window sets BOTH `magic_user` and `monk`) and Treasures'
 * `OUGO` (class byte reads `fighter`, but the window sets `cleric` instead) both fail
 * `poolsTreasuresClassLevelAgrees`. This importer does NOT pick whichever byte "must" be right —
 * both heroes are built from their OWN `classLevel[8]` array (the SAME byte-faithful path every
 * other record uses; `classesFromLevels` reads that array directly, never the class byte), and the
 * summary carries an explicit `classLevelAgrees: false` plus a disclosure line naming the
 * disagreement. A panel that instead displayed `ABAGAIL` as a plain, unflagged magic-user would be
 * SMOOTHING OVER a measured disagreement — exactly what this file and its tests exist to prevent.
 *
 * **Translated (round 35 R4) — `race`**. `poolsTreasuresSavedCharacter.ts`'s `raceLabel` field
 * (from `POOLS_TREASURES_RACE_LABEL`, each title's OWN `GAME.EXE` string table — Pools `0xAEAD`,
 * Treasures `0xD454`, re-derivable from the retail bytes by `tools/pools_treasures_race_table.py`)
 * is looked up in {@link POOLS_TREASURES_RACE_TO_DL} below, defined in and owned by this file (kept
 * exported so `poolsTreasuresSavedCharacter.test.ts` can score the ACTUAL shipped mapping rather
 * than a re-declared copy — see that test's "three-reading table" section). This
 * REPLACES round 31's `COAB_RACE_TO_DL` attempt, which was a disclosed guess and was WRONG: under
 * CoAB's numbering byte 1 read `dwarf` and byte 5 read `halfling`, which forced BINKY out (thief 13
 * over the mountainDwarf DQK cap of 8) and CHERROD out (mountainDwarf may not be a magic-user).
 * Under each title's own table byte 1 is `Half-Elf` and byte 5 is `Human`, both of which are legal
 * for the classes those records actually carry, so the two rejections were translation artifacts.
 *
 * The 0-based reading is **argued by consequence, not located code** — exactly the label
 * `importSecretParty.ts` carries for Secret's own table. What argues it: the two class-byte-3
 * heroes (Guy de Valois, MAXWELL) are Paladins, and a 1e paladin is human-only; the class byte in
 * the SAME table block reads 0-based on 12 of 14 records against 0 of 14 1-based; and exactly the
 * two multi-class records carry the one race byte that is not `Human`. What does NOT argue it: this
 * engine's own import outcome, which accepts 14/14 under BOTH the 0-based and the 1-based reading
 * (1-based's `Halfling` has no Dragonlance analog and falls back to human anyway) — measured, and
 * reported in `docs/engine/research/pools-treasures-race-table.md` rather than passed off as
 * evidence. A name with no Dragonlance analog (Gnome/Halfling/Monster) still falls back to
 * {@link DEFAULT_RACE} with a disclosed substitution note, and the raw byte is always shown.
 *
 * **Class translation** (identical machinery to CoAB/Secret): paladin folds into fighter, druid/monk
 * have no analog and are dropped if encountered (Pools' `ABAGAIL`'s `monk` slot IS dropped this
 * way — disclosed as a dropped class, on top of the separate class/level-disagreement note).
 *
 * **Not decoded this round** (carried raw only): the byte at `class + 1` (`0xaf` for both titles).
 *
 * **Not modelled at all**: spellbook/equipment/thief-skills/alignment/sex bytes — same honest gap
 * every importer in this directory leaves for fields outside its own round's scope.
 *
 * **Round 35 R4-fix-up — a party-cap refusal must still carry a live disagreement disclosure.**
 * The corrected {@link POOLS_TREASURES_RACE_TO_DL} above makes Treasures' CHERROD (race byte 1 =
 * `Half-Elf`, previously `mountainDwarf` under the retired CoAB-enum guess) legal where she used to
 * be rejected as invalid. That is a genuine fix — but it has a side effect: CHERROD now takes the
 * 6th roster slot that, under the OLD reading, went unused by her and fell through to OUGO instead.
 * OUGO (class byte `fighter`, but her OWN `classLevel[8]` window says `cleric` — the SAME measured
 * disagreement `poolsTreasuresClassLevelAgrees` reports for every other record) is consequently now
 * rejected by the party cap, not by any change to her own bytes. Before this fix-up, that swapped
 * her out of `summary[]` entirely, and with it the bold "class byte and level array disagree" badge
 * her row used to carry — a deliberate round-31 disclosure silently disappearing because of an
 * unrelated, correct change elsewhere. {@link PoolsTreasuresImportResult.rejectedPartyFullDisagreements}
 * carries the same disclosure for anyone bumped by the cap while disagreeing, and
 * {@link startImportPoolsTreasuresPanel} renders the identical badge text/style in the rejected
 * list. The fix is to the disclosure, not the roster: CHERROD still joins, OUGO is still cut by the
 * cap — she just isn't shown as a *silent* cut.
 */
import {
  decodePoolsTreasuresSavedCharacter,
  sniffPoolsTreasuresSavedCharacter,
  poolsTreasuresClassLevelAgrees,
  POOLS_TREASURES_SAVED_CHARACTER_SIZE,
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

/** Which of the two titles this call targets — both share the loader's one layout. */
export type PoolsTreasuresTitle = 'pools' | 'treasures';

/** The 6 literal Pools `CHRDATA{n}.SAV` paths (GOG install's own `SAVE\`, unlike Secret's root).
 * Spelled out (not built from a template) so `scripts/bundle-assets.mjs`'s literal-path scan ships
 * them, following `importCoabParty.ts:COAB_CHRDATA_PATHS`'s own convention (reasoning repeated
 * there, not here, to avoid a second quoted game-data path literal sitting in an unrelated
 * docblock). */
const POOLS_CHRDATA_PATHS = [
  'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE/CHRDATA1.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE/CHRDATA2.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE/CHRDATA3.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE/CHRDATA4.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE/CHRDATA5.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SAVE/CHRDATA6.SAV',
];

/** The 8 literal Treasures `CHRDATA{n}.SAV` paths. Same spelling convention as
 * {@link POOLS_CHRDATA_PATHS}. */
const TREASURES_CHRDATA_PATHS = [
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA1.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA2.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA3.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA4.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA5.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA6.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA7.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/SAVE/CHRDATA8.SAV',
];

const TITLE_LABEL: Record<PoolsTreasuresTitle, string> = {
  pools: 'Pools of Darkness',
  treasures: 'Treasures of the Savage Frontier',
};

const TITLE_PATHS: Record<PoolsTreasuresTitle, readonly string[]> = {
  pools: POOLS_CHRDATA_PATHS,
  treasures: TREASURES_CHRDATA_PATHS,
};

/** Generic human-allowed deity for an inferred Cleric with no stored deity — same fallback every
 * other importer in this directory uses. */
const DEFAULT_DEITY = 'mishakal';

/**
 * Round 35 R4: BOTH titles' OWN `GAME.EXE` race table (`POOLS_TREASURES_RACE_LABEL` / `raceLabel`,
 * from `poolsTreasuresSavedCharacter.ts`, itself read out of Pools' `0xAEAD` and Treasures'
 * `0xD454` — NOT CoAB's `Race` enum, which numbers the same names differently, and NOT Secret's
 * own 8-entry table, whose leading `Tribble` shifts every index by one) mapped onto this ruleset's
 * own `DragonlanceRaceId`s. `null` marks a name with no Dragonlance analog (Gnome/Halfling/
 * Monster) — disclosed the same way `COAB_RACE_TO_DL`'s and `SECRET_RACE_TO_DL`'s own `null`
 * entries are. Keyed by the RAW `race` byte (0-based, each title's own compiled storage order).
 */
export const POOLS_TREASURES_RACE_TO_DL: Record<number, DragonlanceRaceId | null> = {
  0: 'qualinestiElf', // Elf -- disclosed pick, matches COAB_RACE_TO_DL's and SECRET_RACE_TO_DL's own elf mapping
  1: 'halfElf', // Half-Elf -- direct
  2: 'mountainDwarf', // Dwarf -- disclosed pick (neither table splits hill/mountain)
  3: null, // Gnome -- no Dragonlance analog (there is no gnome race at all)
  4: null, // Halfling -- no analog, kender culturally unrelated (see COAB_RACE_TO_DL's own note)
  5: 'human', // Human -- direct
  6: null, // Monster -- not a playable race
};

/** Disclosed default race for every imported hero whose raw `race` byte has no Dragonlance analog
 * in {@link POOLS_TREASURES_RACE_TO_DL} (see the file doc's "race" section). */
const DEFAULT_RACE: DragonlanceRaceId = 'human';

interface PoolsTreasuresImportCandidate {
  sheet: CharacterSheet;
  raw: Gen1SavedCharacter;
  classes: Partial<Record<DragonlanceClassId, number>>;
  race: DragonlanceRaceId;
  raceResolvedFromOwnTable: boolean;
  substitutions: string[];
  droppedClasses: string[];
  classLevelAgrees: boolean;
}

/** Build a playable Dragonlance sheet from one Pools/Treasures save, or `null` if every class slot
 * had no analog or `createCharacter` rejects the request outright. Built ALWAYS from the record's
 * OWN `classLevel[8]` array (never the class byte) — see the file doc's "two outliers" section for
 * why this is the byte-faithful choice even when the class byte disagrees. */
function sheetFromPoolsTreasuresSaved(sc: Gen1SavedCharacter): PoolsTreasuresImportCandidate | null {
  const ownTableMapped = POOLS_TREASURES_RACE_TO_DL[sc.race];
  const race = ownTableMapped ?? DEFAULT_RACE;
  const raceResolvedFromOwnTable = ownTableMapped !== null && ownTableMapped !== undefined;

  const { classes, substitutions, dropped } = classesFromLevels(sc);
  if (Object.keys(classes).length === 0) return null; // every class slot was a dropped analog

  const classLevelAgrees = poolsTreasuresClassLevelAgrees(sc);
  const substitutionNotes = [...substitutions];
  if (!classLevelAgrees) {
    substitutionNotes.push(
      `class byte reads ${sc.classLabel ?? sc.classCode} but the classLevel array disagrees — ` +
        'shown raw from the level array, not translated (see importPoolsTreasuresParty.ts)',
    );
  }
  if (!raceResolvedFromOwnTable) {
    substitutionNotes.push(
      `race byte ${sc.race} (${sc.raceLabel ?? 'unknown'}) has no Dragonlance analog (see importPoolsTreasuresParty.ts) — defaulted to human`,
    );
  }

  const sex = 'male'; // no sex byte located this round; same disclosed default as importSecretParty.ts
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
    classLevelAgrees,
  };
}

export interface PoolsTreasuresImportResult {
  title: PoolsTreasuresTitle;
  /** Names of the characters that were imported, in roster order. */
  imported: string[];
  /** Per-character summary for display. Byte-faithful fields are `name`/`abilities`/`classCode`/
   * `classLabel`/`classLevel`/`baseAc`/`partySlot`; `hp`(bounded)/`age`(unverified)/`rawThac0`/`exp`
   * are reduced-confidence (see the file doc). `classLevelAgrees: false` marks `ABAGAIL`/`OUGO` —
   * shown, never translated. `classes`/`ac`/`thac0` are the built sheet's DERIVED values. */
  summary: {
    name: string;
    raceByte: number;
    /** The label this title's OWN `GAME.EXE` race table gives the raw byte (round 35 R4). */
    raceLabel: string | undefined;
    raceResolvedFromOwnTable: boolean;
    dlRace: string;
    classCode: number;
    classLabel: string | undefined;
    classLevel: number[];
    classLevelAgrees: boolean;
    classes: Partial<Record<DragonlanceClassId, number>>;
    substitutions: string[];
    droppedClasses: string[];
    hp: number;
    hpConfidence: 'bounded, not proven';
    ac: number;
    rawThac0: number;
    displayThac0: number;
    thac0Confidence: 'plausible, not verified';
    age: number;
    ageConfidence: 'not verified';
    exp: number | undefined;
    expConfidence: 'plausible, not verified';
    baseAc: number | undefined;
    partySlot: number | undefined;
    extraByte: number | undefined;
    savingThrows: Gen1SavedCharacter['savingThrows'];
    abilities: AbilityScores;
  }[];
  /** Names that couldn't be validated by `createCharacter`, or whose every class slot had no
   * Dragonlance analog. */
  rejectedInvalid: string[];
  /** Names skipped because the 6-hero party was already full. */
  rejectedPartyFull: string[];
  /** Subset of {@link rejectedPartyFull} whose class byte disagrees with its own `classLevel[8]`
   * array (`poolsTreasuresClassLevelAgrees` false — e.g. Treasures' OUGO). Carried separately from
   * the plain name list so a caller can still show the "class byte and level array disagree"
   * disclosure for a hero the party cap cut, instead of a party-full refusal silently swallowing a
   * known data conflict (see the file doc's "Round 35 R4-fix-up" section). */
  rejectedPartyFullDisagreements: string[];
}

async function fetchSave(path: string, assetSource?: AssetSource): Promise<Uint8Array | null> {
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
 * Read the real Pools of Darkness (6) or Treasures of the Savage Frontier (8) pregens and install
 * them as the active roster (replacing any current party). An empty result means none of the
 * title's save files could be read/decoded.
 */
export async function importPoolsTreasuresParty(
  title: PoolsTreasuresTitle,
  assetSource?: AssetSource,
): Promise<PoolsTreasuresImportResult> {
  const result: PoolsTreasuresImportResult = {
    title, imported: [], summary: [], rejectedInvalid: [], rejectedPartyFull: [], rejectedPartyFullDisagreements: [],
  };
  const candidates: PoolsTreasuresImportCandidate[] = [];

  for (const path of TITLE_PATHS[title]) {
    const bytes = await fetchSave(path, assetSource);
    if (!bytes || bytes.length !== POOLS_TREASURES_SAVED_CHARACTER_SIZE || !sniffPoolsTreasuresSavedCharacter(bytes)) continue;
    const sc = decodePoolsTreasuresSavedCharacter(bytes);
    const candidate = sheetFromPoolsTreasuresSaved(sc);
    if (!candidate) {
      result.rejectedInvalid.push(sc.name.trim());
      continue;
    }
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    lastImport[title] = result;
    return result;
  }

  clearParty();
  for (const c of candidates) {
    if (!addToParty(c.sheet)) {
      result.rejectedPartyFull.push(c.sheet.name);
      if (!c.classLevelAgrees) result.rejectedPartyFullDisagreements.push(c.sheet.name);
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
      classLevelAgrees: c.classLevelAgrees,
      classes: c.classes,
      substitutions: c.substitutions,
      droppedClasses: c.droppedClasses,
      hp: c.sheet.hp,
      hpConfidence: 'bounded, not proven',
      ac: c.sheet.ac,
      rawThac0: c.raw.thac0,
      displayThac0: 0x3c - c.raw.thac0,
      thac0Confidence: 'plausible, not verified',
      age: c.raw.age,
      ageConfidence: 'not verified',
      exp: c.raw.exp,
      expConfidence: 'plausible, not verified',
      baseAc: c.raw.baseAc,
      partySlot: c.raw.partySlot,
      extraByte: c.raw.extraByte,
      savingThrows: c.raw.savingThrows,
      abilities: c.sheet.abilities,
    });
  }
  lastImport[title] = result;
  return result;
}

/** The most recent {@link importPoolsTreasuresParty} result per title, cached so the e2e seam can
 * read it back. */
const lastImport: Record<PoolsTreasuresTitle, PoolsTreasuresImportResult | null> = { pools: null, treasures: null };

/** Headless seam for e2e: `window.__importPools` and `window.__importTreasures`, one seam object
 * per title (mirrors `installImportSecretSeam`'s shape, doubled). */
export function installImportPoolsTreasuresSeam(): void {
  for (const title of ['pools', 'treasures'] as const) {
    const key = title === 'pools' ? '__importPools' : '__importTreasures';
    (window as unknown as Record<string, unknown>)[key] = {
      run: () => importPoolsTreasuresParty(title),
      party: () =>
        getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),
      summary: () => lastImport[title]?.summary ?? [],
      rejected: () => (lastImport[title] ? [...lastImport[title]!.rejectedInvalid, ...lastImport[title]!.rejectedPartyFull] : []),
      rejectedDisagreements: () => lastImport[title]?.rejectedPartyFullDisagreements ?? [],
    };
  }
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * `?import=pools` / `?import=treasures` panel renderer — mirrors `importSecretParty.ts`'s
 * `startImportSecretPanel` shape so Phase B's `main.ts` arm for each is a three-line call:
 * `installImportPoolsTreasuresSeam()`, then `startImportPoolsTreasuresPanel(root, title)`. Kept
 * here (not in `main.ts`) since this whole importer is a self-contained Phase A unit.
 */
export async function startImportPoolsTreasuresPanel(
  root: HTMLElement,
  title: PoolsTreasuresTitle,
  assetSource?: AssetSource,
): Promise<number> {
  root.innerHTML = '';
  installImportPoolsTreasuresSeam();

  let res: PoolsTreasuresImportResult;
  try {
    res = await importPoolsTreasuresParty(title, assetSource);
  } catch (err) {
    const errPanel = el('div', 'import-panel');
    errPanel.innerHTML = `<h2>Import failed</h2><p>${err instanceof Error ? err.message : String(err)}</p>`;
    root.appendChild(errPanel);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const panel = el('div', 'import-panel');
  const label = TITLE_LABEL[title];
  if (res.imported.length === 0) {
    panel.innerHTML =
      `<h2>No ${label} pregens found</h2>` +
      `<p>Point a Library entry at your ${label} install (its <code>SAVE/</code> folder), or run the ` +
      'dev server with the GOG release in place.</p>';
    root.appendChild(panel);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const rows = res.summary
    .map((c) => {
      const notes = [...c.substitutions, ...c.droppedClasses.map((d) => `dropped ${d}`)];
      const disagreeBadge = c.classLevelAgrees
        ? ''
        : ' <strong style="color:#e55">class byte and level array disagree — shown raw, not translated</strong>';
      return (
        `<tr><td>${c.name}</td><td>${c.classLabel ?? `class ${c.classCode}`}${disagreeBadge}</td>` +
        `<td>race byte ${c.raceByte} = ${c.raceLabel ?? '?'}${c.raceResolvedFromOwnTable ? '' : ' (no Dragonlance analog)'} &rarr; ${c.dlRace}</td>` +
        `<td>${c.hp} HP <span style="color:#888">(${c.hpConfidence})</span></td>` +
        `<td>THAC0 ${c.displayThac0} (raw ${c.rawThac0}) <span style="color:#888">(${c.thac0Confidence})</span></td>` +
        `<td>${c.age} <span style="color:#888">(${c.ageConfidence})</span></td>` +
        `<td style="color:#c96">${notes.join('; ') || '—'}</td></tr>`
      );
    })
    .join('');
  panel.innerHTML =
    `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from ${label}</h2>` +
    '<p style="color:#9aa">Name, ability scores and class/level are independently oracled against ' +
    'this record\'s own bytes (see <code>poolsTreasuresSavedCharacter.ts</code>). THAC0, XP, HP and ' +
    'age carry only reduced-confidence checks, flagged in their own column. Race is translated ' +
    "through THIS title's own GAME.EXE race table (Pools 0xAEAD / Treasures 0xD454, 7 entries, " +
    '0-based) — argued by consequence, not by a located indexing instruction, and the raw byte is ' +
    'shown beside the label. Any hero whose class byte disagrees with its own level array is ' +
    'flagged in bold, never smoothed over.</p>' +
    '<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>Race</th>' +
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
      res.rejectedPartyFull
        .map((n) => {
          // A party-cap refusal must not silently swallow a live class/level disagreement (round 35
          // R4-fix-up) — same badge text/style as the imported-table row would have carried.
          const disagreeBadge = res.rejectedPartyFullDisagreements.includes(n)
            ? ' <strong style="color:#e55">class byte and level array disagree — shown raw, not translated</strong>'
            : '';
          return `<div>${n} — the party is full (6 heroes max)${disagreeBadge}</div>`;
        })
        .join('');
    panel.appendChild(rej);
  }

  (window as unknown as { __rendered: number }).__rendered = res.imported.length;
  return res.imported.length;
}
