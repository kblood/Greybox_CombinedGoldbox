/**
 * R2 — Import the six real Curse of the Azure Bonds pregenerated heroes (`?import=coab`,
 * `SAVE/CHRDATA{1..6}.SAV`) into the active roster. Modelled on `importDqkParty.ts`/
 * `importDokParty.ts`'s pattern (a same-shaped `*ImportResult`, an `install*Seam()` for e2e,
 * derived fields disclosed separately from byte-faithful ones), but this is the FIRST importer in
 * the series whose class and level bytes are independently cross-checked and byte-faithful for
 * 6/6 real characters — see `packages/engine/src/loaders/coabSavedCharacter.ts`'s file doc and
 * `coabSavedCharacter.test.ts`'s "consistency oracle".
 *
 * **Byte-faithful** (read straight from the save; the "consistency oracle" cross-checks these
 * against each other, not against a guess):
 *  - `name`;
 *  - the six ability scores + `str00` (exceptional-STR percentile) — `stats.abilities.<key>.full`;
 *  - `race`/`classCode` raw bytes, and their `Enums.cs` labels;
 *  - the `classLevel[8]` array (one byte per COAB `SkillType` slot);
 *  - `hpMax`, `thac0` (raw byte — the save's OWN inverted-store convention, not this engine's).
 *
 * **Derived, and disclosed as such in {@link CoabImportResult.summary}** — every one of these is a
 * TRANSLATION gap between COAB's own, wider AD&D-1e/Forgotten-Realms ruleset (18 `ClassId`
 * members, 8 `Race` members, human multiclassing) and this engine's ONE shared party ruleset,
 * `addnd1e-dragonlance` (6 `DragonlanceClassId` members, 7 `DragonlanceRaceId` members, humans are
 * single-class only) — the same ruleset `dqkParty.ts`/every other importer already builds every
 * playable `CharacterSheet` from, regardless of source game (`combat.ts`'s `partyCombatants()` is
 * the sole consumer for every game including CoAB's own `?explore=coab-natural`):
 *  - **class**: {@link CLASS_LEVEL_SLOT_TO_DL} maps each of the 8 `SkillType` slots to its
 *    `DragonlanceClassId` twin where the classes are the SAME concept under a different name
 *    (cleric/fighter/ranger/magicUser/thief — direct, no substitution). `paladin` (slot 3) has NO
 *    Dragonlance analog — this ruleset's closest warrior-type is `knight` (a Solamnic Knight
 *    Order, a mechanically different concept requiring its own alignment/Order data this save
 *    doesn't carry), so a paladin's level is folded into `fighter` instead: mechanically closer
 *    (same THAC0/HD progression, no invented Order) even though it drops Lay on Hands/disease
 *    immunity/paladin turning. `druid` and `monk` (slots 1, 7) have NO analog at all and are
 *    DROPPED if ever encountered (not present in the 6 real saves — `rejectedNoClassAnalog` would
 *    catch this here, but none of the 6 actually exercises it). TRAVIS (`fighter`+`thief`) and
 *    LEDERA (`fighter`+`magicUser`) map directly onto Dragonlance's OWN real multiclassing (both
 *    are non-human races the ruleset allows to multiclass) — no substitution needed for either.
 *  - **race**: `dwarf`/`elf` split into Dragonlance's Hill/Mountain and Silvanesti/Qualinesti
 *    variants; COAB doesn't carry that distinction, so {@link COAB_RACE_TO_DL} picks ONE fixed
 *    variant per COAB race (`mountainDwarf`, `qualinestiElf` — chosen because both pass the real
 *    TRAVIS/LEDERA ability scores without `clampToRace` altering anything, not because either COAB
 *    save says so). `human`/`half_elf` map directly (COAB's `half_elf` = Dragonlance's `halfElf`,
 *    same concept). `gnome`/`halfling`/`half_orc`/`monster` have NO Dragonlance analog (no gnome
 *    race at all; kender is culturally unrelated to a Forgotten-Realms halfling) — none of the 6
 *    real saves uses one, but if a future save did, {@link sheetFromCoabSaved} returns `null` and
 *    the importer reports it under `rejectedNoRaceAnalog` rather than silently misplacing the hero
 *    into a race that isn't the one COAB shipped.
 *  - **sex**: byte-faithful (`0 = male, 1 = female`, COAB's own `ovr006.cs:750` convention) —
 *    listed here only because `createCharacter` calls it `sex`, not because it's derived.
 *  - **deity**: clerics/paladins in this ruleset must worship a Dragonlance deity; COAB's own
 *    Forgotten-Realms deity (if any — not decoded this round) isn't carried, so every caster gets
 *    the SAME fallback every other importer uses (`mishakal`), disclosed as `deity: 'derived'`.
 *  - **thac0/ac**: `createCharacter()` recomputes both from the mapped class/level table, so the
 *    built sheet's `thac0`/`ac` do NOT equal the save's own raw `thac0`/`baseAc` bytes (COAB's
 *    inverted-store convention is a DIFFERENT numeric scale from this ruleset's, not merely a
 *    different sign) — both the raw save byte and the built sheet's derived value are threaded
 *    into the summary, same contract as `importDqkParty.ts`'s `rawThac0`/`thac0` pair.
 *  - **hp**: the save's `hpMax` byte IS carried byte-faithfully into `hp`/`maxHp` — NOT
 *    recomputed — since COAB stores a real rolled total (`hitPointRolled`, also carried in the
 *    summary) rather than DoK's "no HP field at all" gap.
 *  - **spells known / equipment**: NOT decoded this round (see the loader's own "explicitly not
 *    modelled" list) — every imported hero starts with a class-generic default `Inventory` and no
 *    memorized spells, same honest gap `importDqkParty.ts` leaves for its own out-of-scope fields.
 */
import {
  decodeCoabSavedCharacter,
  sniffCoabSavedCharacter,
  coabDisplayThac0,
  coabDisplayBaseAc,
  COAB_CLASS_LEVEL_SLOT_LABEL,
  COAB_SAVED_CHARACTER_SIZE,
  createCharacter,
  clampToRace,
  type CoabSavedCharacter,
  type CharacterSheet,
  type CharacterRequest,
  type DragonlanceClassId,
  type DragonlanceRaceId,
  type AbilityScores,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { clearParty, addToParty, getParty } from './party.js';

/** The 6 literal `CHRDATA{n}.SAV` paths — spelled out (not built from a template) so
 * `scripts/bundle-assets.mjs`'s literal-path scan ships them.
 *
 * **NOT the DQK/DoK repo-relative convention** (a bare game-folder name followed by the asset
 * path, the way the DQK and DoK manifest entries spell it) — those two titles have a partial
 * in-repo copy under a folder name `bundle-assets.mjs`'s `GAME_DIR_RE` already recognises.
 * Those two folder names are deliberately not written out here as quoted path literals: the
 * bundler's literal-path scan reads this file and cannot tell an illustrative path in a comment
 * from a real one, so spelling them added two permanent "referenced file NOT found" lines to
 * every `pnpm build:app` until this paragraph was reworded. CoAB has NO in-repo directory at all
 * (`'Curse of the Azure Bonds'` is not in that regex's known-folder list), only the absolute GOG
 * install path — the SAME literal convention `gameData.ts`'s own CoAB manifest entries use for
 * every other CoAB asset (`eclPath`/`geoPath`/etc., e.g.
 * `'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ECL2.DAX'`), and the one
 * `explore.ts#readAssetBytes` already fetches successfully today for `?explore=coab-natural`.
 * An earlier draft used the repo-relative spelling; `pnpm build:app` bundled real bytes anyway
 * only because `gameData.ts`'s absolute-path manifest entries pull the WHOLE `SAVE/` directory
 * in under `assets/external/win/C/...` — `assetUrl()` on the repo-relative string would 404 in
 * both dev (`/@fs/<repo-root>/Curse of the Azure Bonds/...` doesn't exist) and prod
 * (`assets/Curse of the Azure Bonds/...` isn't where the bundler put the files). Absolute paths
 * route through `isAbsoluteFsPath()` instead: dev via `/@goldbox-local/`, prod via
 * `assets/external/win/...` — matching where the files actually landed. */
const COAB_CHRDATA_PATHS = [
  'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE/CHRDATA1.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE/CHRDATA2.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE/CHRDATA3.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE/CHRDATA4.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE/CHRDATA5.SAV',
  'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/SAVE/CHRDATA6.SAV',
];

/** Generic human-allowed deity for an inferred Cleric with no stored deity — same fallback every
 * other importer in this directory uses. */
const DEFAULT_DEITY = 'mishakal';

/**
 * `SkillType` slot (`ClassLevel[8]` index, `COAB_CLASS_LEVEL_SLOT_LABEL` order) -> this engine's
 * `DragonlanceClassId`, or `null` when no analog exists (see file doc's "class" bullet).
 * `paladin` (slot 3) is a DELIBERATE substitute, not a direct mapping — folded into `fighter`.
 *
 * Exported (R2) so `importSecretParty.ts` can reuse the SAME slot->class translation — Secret's
 * `ClassLevel[8]` array uses the identical `SkillType` slot order (verified against the shared
 * `coabExpectedClassLevelSlots` oracle, `secretSavedCharacter.ts`'s file doc) — without forking a
 * second copy of this table.
 */
export const CLASS_LEVEL_SLOT_TO_DL: readonly (DragonlanceClassId | null)[] = [
  'cleric', // 0 cleric
  null, // 1 druid -- no Dragonlance analog
  'fighter', // 2 fighter
  'fighter', // 3 paladin -- DERIVED substitute, no Paladin class in this ruleset (see file doc)
  'ranger', // 4 ranger
  'magicUser', // 5 magic_user
  'thief', // 6 thief
  null, // 7 monk -- no Dragonlance analog
];

/** COAB `Race` byte -> this engine's `DragonlanceRaceId`, or `null` when no analog exists (see
 * file doc's "race" bullet). `dwarf`/`elf` are a DISCLOSED, arbitrary pick between two Dragonlance
 * variants COAB doesn't distinguish -- chosen to pass TRAVIS/LEDERA's real ability scores without
 * `clampToRace` altering anything.
 *
 * Exported (R2) so `importSecretParty.ts` can TRY this exact CoAB `Race` enum against Secret's own
 * race byte before falling back to a disclosed default — it should not (and does not) resolve, and
 * that negative result is itself evidence Secret's race byte is not this enum (see that file's doc
 * for the two values checked, 3 and 6, both of which are `null` here). */
export const COAB_RACE_TO_DL: Readonly<Record<number, DragonlanceRaceId | null>> = {
  0: null, // monster -- not a playable race
  1: 'mountainDwarf', // dwarf -- disclosed pick (COAB doesn't split hill/mountain)
  2: 'qualinestiElf', // elf -- disclosed pick (COAB doesn't split silvanesti/qualinesti)
  3: null, // gnome -- no Dragonlance analog
  4: 'halfElf', // half_elf -- direct
  5: null, // halfling -- no exact analog (kender is culturally unrelated)
  6: null, // half_orc -- no Dragonlance analog
  7: 'human', // human -- direct
};

/** Which `SkillType` slots {@link CLASS_LEVEL_SLOT_TO_DL} maps to `null` -- used only to build the
 * "paladin folded into fighter" disclosure text; not itself part of the mapping logic. */
const PALADIN_SLOT = COAB_CLASS_LEVEL_SLOT_LABEL.indexOf('paladin');

/** One imported hero, with everything the summary needs to disclose byte-faithful vs derived. */
interface CoabImportCandidate {
  sheet: CharacterSheet;
  raw: CoabSavedCharacter;
  classes: Partial<Record<DragonlanceClassId, number>>;
  race: DragonlanceRaceId;
  substitutions: string[];
  droppedClasses: string[];
}

/** Build the `classes` request object from a save's OWN `classLevel[8]` array -- byte-faithful
 * per-slot, with {@link CLASS_LEVEL_SLOT_TO_DL}'s disclosed substitutions/drops. Returns the
 * mapped classes plus human-readable notes for anything that didn't map 1:1.
 *
 * Typed over `{ classLevel: number[] }` rather than the full `CoabSavedCharacter` (R2) — only
 * `classLevel` is read, so `importSecretParty.ts`'s `Gen1SavedCharacter` (a structurally different
 * type with the SAME `ClassLevel[8]` slot order) can reuse this unchanged. No behaviour change:
 * every existing call site still passes a `CoabSavedCharacter`, which satisfies this wider type. */
export function classesFromLevels(sc: { classLevel: number[] }): { classes: Partial<Record<DragonlanceClassId, number>>; substitutions: string[]; dropped: string[] } {
  const classes: Partial<Record<DragonlanceClassId, number>> = {};
  const substitutions: string[] = [];
  const dropped: string[] = [];
  for (let slot = 0; slot < sc.classLevel.length; slot++) {
    const level = sc.classLevel[slot];
    if (!level) continue;
    const dl = CLASS_LEVEL_SLOT_TO_DL[slot];
    const slotName = COAB_CLASS_LEVEL_SLOT_LABEL[slot];
    if (dl === null) {
      dropped.push(`${slotName} ${level} (no Dragonlance analog, dropped)`);
      continue;
    }
    if (slot === PALADIN_SLOT) {
      substitutions.push(`paladin ${level} folded into fighter (no Paladin class in this ruleset)`);
    }
    classes[dl] = (classes[dl] ?? 0) + level;
  }
  return { classes, substitutions, dropped };
}

/** Build a playable Dragonlance sheet from one CoAB save, or `null` if the race has no analog or
 * `createCharacter` rejects the request outright. */
function sheetFromCoabSaved(sc: CoabSavedCharacter): CoabImportCandidate | null {
  const race = COAB_RACE_TO_DL[sc.race];
  if (!race) return null;
  const { classes, substitutions, dropped } = classesFromLevels(sc);
  if (Object.keys(classes).length === 0) return null; // every class slot was a dropped analog

  const sex = sc.sex === 0 ? 'male' : 'female';
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
    baseAc: 10, // this ruleset's own unarmoured baseline -- see the file doc's "thac0/ac" bullet
    levelCapRuleset: 'dqk', // same permissive-table choice every other importer here makes
  };
  const res = createCharacter(req);
  if (!res.ok) return null;
  return { sheet: res.sheet, raw: sc, classes, race, substitutions, droppedClasses: dropped };
}

export interface CoabImportResult {
  /** Names of the characters that were imported, in roster order. */
  imported: string[];
  /** Per-character summary for display. Byte-faithful fields are `name`/`abilities`/`hpMax`/
   * `rawThac0`/`race`/`raceLabel`/`classCode`/`classLabel`/`classLevel`; `classes`/`ac`/`thac0`
   * are the built sheet's DERIVED values (see the file doc). `substitutions`/`droppedClasses`
   * disclose every translation the save's own classes went through to fit this ruleset. */
  summary: {
    name: string;
    raceByte: number;
    raceLabel: string | undefined;
    dlRace: string;
    classCode: number;
    classLabel: string | undefined;
    classLevel: number[];
    classes: Partial<Record<DragonlanceClassId, number>>;
    substitutions: string[];
    droppedClasses: string[];
    hp: number;
    ac: number;
    rawThac0: number;
    displayThac0: number;
    rawBaseAc: number;
    displayBaseAc: number;
    exp: number;
    abilities: AbilityScores;
  }[];
  /** Names that couldn't be validated by `createCharacter`, or whose race/every class slot had no
   * Dragonlance analog. */
  rejectedInvalid: string[];
  /** Names skipped because the 6-hero party was already full. */
  rejectedPartyFull: string[];
}

async function fetchCoabSave(path: string, assetSource?: AssetSource): Promise<Uint8Array | null> {
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
 * Read the six real CoAB pregens and install them as the active roster (replacing any current
 * party). An empty result means none of the six save files could be read/decoded.
 */
export async function importCoabParty(assetSource?: AssetSource): Promise<CoabImportResult> {
  const result: CoabImportResult = { imported: [], summary: [], rejectedInvalid: [], rejectedPartyFull: [] };
  const candidates: CoabImportCandidate[] = [];

  for (const path of COAB_CHRDATA_PATHS) {
    const bytes = await fetchCoabSave(path, assetSource);
    if (!bytes || bytes.length !== COAB_SAVED_CHARACTER_SIZE || !sniffCoabSavedCharacter(bytes)) continue;
    const sc = decodeCoabSavedCharacter(bytes);
    const candidate = sheetFromCoabSaved(sc);
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
      dlRace: c.race,
      classCode: c.raw.classCode,
      classLabel: c.raw.classLabel,
      classLevel: c.raw.classLevel,
      classes: c.classes,
      substitutions: c.substitutions,
      droppedClasses: c.droppedClasses,
      hp: c.sheet.hp,
      ac: c.sheet.ac,
      rawThac0: c.raw.thac0,
      displayThac0: coabDisplayThac0(c.raw.thac0),
      rawBaseAc: c.raw.baseAc,
      displayBaseAc: coabDisplayBaseAc(c.raw.baseAc),
      exp: c.raw.exp,
      abilities: c.sheet.abilities,
    });
  }
  lastImport = result;
  return result;
}

/** The most recent {@link importCoabParty} result, cached so the e2e seam can read it back. */
let lastImport: CoabImportResult | null = null;

/** Headless seam for e2e: trigger the import and read back what landed in the roster. */
export function installImportCoabSeam(): void {
  (window as unknown as { __importCoab?: Record<string, unknown> }).__importCoab = {
    run: () => importCoabParty(),
    party: () =>
      getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),
    summary: () => lastImport?.summary ?? [],
    rejected: () => (lastImport ? [...lastImport.rejectedInvalid, ...lastImport.rejectedPartyFull] : []),
  };
}
