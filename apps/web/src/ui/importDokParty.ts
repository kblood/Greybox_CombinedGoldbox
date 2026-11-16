/**
 * M14 — Import a party from a Death Knights of Krynn save into Dark Queen of Krynn (the trilogy's
 * closing carry-over hop: `?import=cok` (B3) already carries CoK → DoK; this is DoK → DQK).
 *
 * DoK's `CHRDATA{n}.GAM` (M13's `decodeDokSavedCharacter`) is a much thinner record than CoK's
 * dedicated 409-byte `.SAV`: it reuses the compact 216-byte *monster* struct, and stores AC/damage as
 * the unarmoured-human BASELINE rather than the character's effective fighting stats (see
 * `dokSavedCharacter.ts`'s file doc).
 *
 * **CORRECTED 2026-09-07 — it does NOT lack a hit-point field.** This paragraph used to say the
 * struct "genuinely has no hit-point field", and listed HP among the values that "are all DERIVED
 * ... not read from the save". Hit points are at byte 40, with a second store at byte 214 that equals
 * it in 6 of 6 retail records; `decodeDokSavedCharacter` had been receiving the correct value from
 * `decodeMonsterRecord` and discarding it. **HP is now carried byte-faithfully**, so this importer
 * carries name, the six ability scores AND hit points from the save. What is still genuinely derived
 * is class, level and effective AC/THAC0, through the same `addnd1e-dragonlance` `createCharacter`
 * path `dqkParty.ts`'s Heroes of the Lance already use:
 *
 *   - **class**: `.GAM`'s `classCode`@32 is only "RESOLVED to exist and correlate with caster-vs-not,
 *     NOT resolved to specific class names" (research doc §2.3) — BUT that caster/non-caster split
 *     is itself independently validated (both real `classCode===6` samples have an all-zero `.WIZ`;
 *     every other observed code has populated `.WIZ` spell data), so it safely narrows the choice to
 *     {cleric, magicUser} vs {fighter, thief} before picking within the pair. Restricting the pool
 *     this way — instead of letting all four classes compete on raw ability score like B3's CoK
 *     fallback does — avoids the failure mode CoK's own B5 fix was needed for (a maxed-STR caster
 *     reads as a fighter): DoK's 6 real pregens run 14-18 across EVERY ability, so an unrestricted
 *     heuristic picks fighter for casters almost every time. (Bonus cross-check: codes 1→cleric and
 *     2→magicUser land the same way CoK's *validated* mapping does, though the research doc is
 *     explicit this isn't confirmed to be the same enum.) **Within {cleric, magicUser} (M33.S1):** the
 *     save's own real `.WIZ` memorized-spell ids are voted cleric-vs-magicUser
 *     (`dokSpellClass.ts`'s `classVoteFromDokIds`, over `hackdocs_extracted/SPELBOOK.TXT`'s full
 *     spell-number table) — a much stronger signal than ability scores, since it's the class the
 *     character actually cast spells as. Only on a tie (or no `.WIZ` data at all) does this fall back
 *     to the original WIS-vs-INT tie-break. Fighter/thief is still ability-score only (`.WIZ` is
 *     empty for non-casters, so there's no vote signal to have).
 *   - **level**: `.GAM`'s THAC0 byte IS read byte-faithfully — inverted against the inferred class's
 *     own `thac0(class, level)` table (the exact ruleset table `dqkParty.ts`'s Heroes are built from)
 *     to find the level whose table THAC0 is closest. Derived, but grounded in a real saved byte, not
 *     a guess; searched over the human race cap (level ≤ 8) so `createCharacter` never rejects it.
 *   - **hp/maxHp**: READ FROM THE SAVE (byte 40) as of 2026-09-07. This used to synthesize them as
 *     `level * levelHpGain(hitDie(cls)) + level * conBonus`, which was a reasonable reconstruction of
 *     a number the game was storing all along. For the six retail pregens the synthesized values were
 *     63/80/70/60/55 against stored 95/102/78/52/58/53 — off by between 3 and 32 points, and in both
 *     directions, so it was not even a consistent over- or under-estimate.
 *
 *     **The null carried from `dokSavedCharacter.ts`, because it decides how much this claims:** the
 *     record has TWO hit-point stores (byte 40 and byte 214) that are equal in 6 of 6 records, and
 *     since every shipped pregen is undamaged, **nothing in the corpus distinguishes maximum HP from
 *     current HP**. `hp` and `maxHp` are therefore both set from `sc.hitPoints` (byte 40) — correct
 *     for every record that ships, and honest about not knowing which store is which. A damaged
 *     character would be the first evidence able to settle it.
 *   - **baseAc**: `.GAM`'s `baseArmorClass` is always `10` (the unarmoured-human baseline — see
 *     `dokSavedCharacter.ts`'s own file doc) and is **NOT** what `CharacterRequest.baseAc` wants
 *     ("worn-armour AC before Dexterity"); an earlier version of this comment claimed it "carries
 *     straight through," which was simply wrong — `.GAM`'s AC field and the effective fighting AC
 *     are two different numbers by that same file doc's own admission. **Fixed (M34.S1):** the
 *     save's real `.JNK` inventory (readied armour/shield) is decoded and turned into `baseAc` via
 *     `wornArmorAc` instead — see the M34.S1 note below.
 *
 * The import summary discloses which fields are derived so this reads as "your named DoK heroes,
 * freshly statted for the level their save implies," not a false claim of byte-for-byte fidelity.
 *
 * **M32.S1 — real memorized spells now carry over too.** `CHRDATA{n}.WIZ` is the same 220-byte
 * spell-memorization record `monsterSideTables.ts`'s `decodeMonsterWizRecord` decodes for *monsters*
 * (M31.S1) — these player saves were in fact that format's own validation set, so no new decode was
 * needed. Each surviving id is crosswalked (`dokSpellCrosswalk.ts`'s `DOK_SPELL_CROSSWALK`) and then
 * kept only if it matches the inferred class — a real spell that mismatches (druid-track ids, or ids
 * with no crosswalk/geometry entry) is silently dropped, never used to override the class inference.
 *
 * **M33.S1 — the class inference itself got more accurate.** M32 found that 2 of the then-4 real
 * caster pregens (Tanar, Neacail) had their real `.WIZ` spells mismatch the ability-score-inferred
 * class. Re-investigating found Neacail was REJECTED from the roster regardless of class (her saved
 * DEX, 19, exceeded the human race's 3-18 range — `character.ts`'s ability-range check runs before any
 * class-specific logic), so only Tanar's outcome was ever actually at stake **at the time**. **M86.S1
 * superseded the "rejected" half of this**: abilities are now re-capped via `clampToRace` before this
 * check ever runs (ovr017's real `EnforceRaceSexLimits`, the same fixup the CoK→DoK sibling importer
 * already applied), so Neacail's DEX clamps to 18 and she now joins the roster instead of being turned
 * away — matching the original mechanic instead of contradicting it. Fixing `inferDokClass` to
 * vote on the save's own real spells first (see the class-doc comment above) flips Tanar from
 * `magicUser` to `cleric` — matching her real, overwhelmingly cleric-prefixed spell list — while
 * independently re-verified NOT to change Flavius's or Celeste's results (Celeste's vote is an exact
 * cleric-vs-magicUser tie, so she still falls back to the unchanged ability-score rule). See
 * `docs/engine/research/m33-audit.md` for the full re-derivation and the concrete "does it regress"
 * check.
 *
 * **M34.S1 — imported characters now fight at their real armour class, not the unarmoured baseline.**
 * `.GAM`'s AC byte is always `10` (see the "baseAc" bullet above); this importer used to pass that
 * straight through, so every imported DoK hero fought at AC 10-minus-Dex even when their real save
 * showed them wearing plate mail and a shield. Fixed by decoding `.JNK`'s real readied gear — the
 * SAME 63-byte VOCAB-coded item-instance layout `monsterSideTables.ts`'s `decodeMonsterItem`
 * already decodes for `MON{n}ITM.DAX` (`.JNK`'s byte@42 "stale heap pointer" quirk documented in
 * `dokSavedCharacter.ts` is a DIFFERENT, unrelated offset — the real identity fields are at 0x2e,
 * see that file's updated doc) — crosswalked (`dokGearCrosswalk.ts`'s `DOK_GEAR_CROSSWALK`, scoped
 * to the armour/shield subset verified against real bytes: every real pregen wears Plate Mail
 * and/or a Shield, never Ring Mail as an earlier draft of the audit mis-transcribed) into a minimal
 * `Inventory` fed to `wornArmorAc`. Real-bytes verification (this round, via the actual decode path
 * — not the audit doc's own table, which had a wrong armour-type label that happened not to change
 * its final numbers): DRYDEN keeps only his Shield recognized (his "Solamnic Plate Mail" is a
 * separate, uncracked named-artifact encoding — `baseAc` 10→9); LILLITH/TANAR/FLAVIUS/CELESTE all
 * wear Plate Mail + Shield (`baseAc` 10→2); NEACAIL computes the same Plate-Mail-only `baseAc` 10→3 —
 * at the time this landed she never reached the roster regardless (M33.S1 finding, since superseded by
 * M86.S1's ability-clamp fix — she is admitted today). See `docs/engine/research/m34-audit.md` for the
 * audit and its correction addendum.
 */
import {
  decodeDokSavedCharacter,
  sniffDokSavedCharacter,
  createCharacter,
  thac0 as classThac0,
  decodeMonsterWizRecord,
  memorizationFromDokIds,
  classVoteFromDokIds,
  MON_WIZ_RECORD_SIZE,
  decodeDokJnkFile,
  inventoryFromDokJnk,
  wornArmorAc,
  clampToRace,
  IMPORT_PLATINUM_STIPEND,
  PLATINUM_TO_STEEL,
  type DokSavedCharacter,
  type CharacterSheet,
  type CharacterRequest,
  type Memorization,
  type Inventory,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { clearParty, addToParty, getParty, setMemorization, getMemorization, setInventory, getInventory, addGold, getGold } from './party.js';

/** Only the 4 classes a save's abilities alone can safely imply — Knight/Ranger need a race/order
 * this data doesn't carry a signal for (mirrors B3's own CoK fallback candidate set). */
type CoreClassId = 'fighter' | 'thief' | 'cleric' | 'magicUser';

/** classCode 6 is VALIDATED non-caster (both sampled code-6 characters have an all-zero `.WIZ`);
 * every other observed code (0, 1, 2, 5) had populated `.WIZ` spell data (research doc §2.3/§4). */
const NONCASTER_CODE = 6;
/** The engine's own THAC0 table clamps at level 12 (`combatTables.ts`'s `MAX_COL`) — searching further
 * can never change the best-fit answer. Was artificially 8 (M14), solely to keep every inferred level
 * under CoK's flat human level cap since `createCharacter()` had no other table to validate against yet;
 * now that this importer's request opts into DQK's own, materially more permissive table (M95,
 * `levelCapRuleset: 'dqk'`, uncapped for a human in all four of these classes), the search can honestly
 * range over the table's full real extent instead of pre-emptively truncating it. */
const MAX_INFERRED_LEVEL = 12;
/** Generic human-allowed deity for an inferred Cleric with no stored deity (mirrors `dqkParty.ts`'s
 * own Goldmoon default). */
const DEFAULT_DEITY = 'mishakal';

/** The DoK `.GAM` save files, spelled as literals so `scripts/bundle-assets.mjs` ships them. */
const DOK_CHRDATA_PATHS = [
  'Death Knights of Krynn/SAVE/CHRDATA1.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA2.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA3.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA4.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA5.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA6.GAM',
];

/** The matching `.WIZ` memorized-spell saves (M32.S1), same slot order as {@link DOK_CHRDATA_PATHS} —
 * literals for the same `bundle-assets.mjs` reason. Absent/unreadable is a normal "no data" case, not
 * an error (mirrors {@link DOK_CHRDATA_PATHS}'s own graceful-skip contract). */
const DOK_CHRDATA_WIZ_PATHS = [
  'Death Knights of Krynn/SAVE/CHRDATA1.WIZ',
  'Death Knights of Krynn/SAVE/CHRDATA2.WIZ',
  'Death Knights of Krynn/SAVE/CHRDATA3.WIZ',
  'Death Knights of Krynn/SAVE/CHRDATA4.WIZ',
  'Death Knights of Krynn/SAVE/CHRDATA5.WIZ',
  'Death Knights of Krynn/SAVE/CHRDATA6.WIZ',
];

/** The matching `.JNK` inventory saves (M34.S1), same slot order as {@link DOK_CHRDATA_PATHS} —
 * literals for the same `bundle-assets.mjs` reason. Fetched for every candidate (unlike `.WIZ`,
 * worn gear isn't caster-gated); absent/unreadable falls back to the unarmoured `.GAM` baseline. */
const DOK_CHRDATA_JNK_PATHS = [
  'Death Knights of Krynn/SAVE/CHRDATA1.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA2.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA3.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA4.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA5.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA6.JNK',
];

/** Caster/non-caster split from `classCode` (validated); within the caster pair, a real-spell vote
 * (M33.S1, `spellIds` — the save's own `.WIZ` memorized-spell ids) takes priority over the
 * ability-score tie-break, falling back to it only on a tie/no-data. Fighter/thief has no vote signal
 * (non-casters carry no `.WIZ` data) so stays ability-score only — never lets a high-STR caster read
 * as a fighter (see file doc). */
function inferDokClass(sc: DokSavedCharacter, spellIds?: number[]): CoreClassId {
  const a = sc.abilities;
  const isCaster = sc.classCode !== NONCASTER_CODE;
  if (isCaster) return classVoteFromDokIds(spellIds) ?? (a.wis >= a.int ? 'cleric' : 'magicUser');
  return a.str >= a.dex ? 'fighter' : 'thief';
}

/** The level (1..12) whose `thac0(class, level)` best matches the save's byte-faithful THAC0 byte. */
function inferDokLevel(cls: CoreClassId, thac0: number): number {
  let best = 1;
  let bestDiff = Infinity;
  for (let lvl = 1; lvl <= MAX_INFERRED_LEVEL; lvl++) {
    const diff = Math.abs(classThac0(cls, lvl) - thac0);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = lvl;
    }
  }
  return best;
}

interface DokImportCandidate {
  sheet: CharacterSheet;
  cls: CoreClassId;
  level: number;
  hp: number;
  /** Real memorized spells recovered from the matching `.WIZ` save (M32.S1), already crosswalked and
   * class-filtered. `undefined` for a non-caster, a missing/malformed `.WIZ` file, or when nothing
   * survives the filter — the importer skips {@link setMemorization} entirely in that case. */
  mem?: Memorization;
  /** M66.S1 — the real crosswalked `.JNK` worn-gear Inventory (M34.S1), already computed above to
   * derive `baseAc`, but previously discarded once that scalar was read. Carried here so the party-
   * add loop can also persist it via {@link setInventory} — the same setter `mem` already gets one
   * line below — instead of letting `party.ts`'s `getInventory()` fabricate a class-generic starter
   * kit the first time any screen reads this character's pack. `undefined` when `.JNK` is
   * absent/unreadable or carries no crosswalked gear (mirrors `mem`'s own honest-omission contract). */
  inv?: Inventory;
}

/** Build a playable DQK sheet from a DoK save: byte-faithful name/abilities, derived class/level/HP
 * through the real `addnd1e-dragonlance` creation+validation path. `spellIds` (M33.S1) lets
 * `inferDokClass` vote on the save's own real spells before falling back to ability scores.
 * `baseAc` (M34.S1) defaults to the `.GAM` unarmoured baseline but is normally supplied from the
 * save's real `.JNK` worn gear (see `importDokParty()`).
 *
 * M86.S1 — abilities are re-capped via {@link clampToRace} before validation, mirroring
 * `save/import.ts`'s `convertImportedCharacter` (ovr017 `EnforceRaceSexLimits`), the same fixup the
 * CoK→DoK sibling importer (`importParty.ts`) already applies. This project's own decompile research
 * (`decompile-ovr017-save-import.md`) documents the *original* engine clamping, not rejecting, an
 * out-of-range ability at every hop of the trilogy's import chain — a save's own byte can legally
 * exceed the destination race's range (e.g. NEACAIL's real DEX 19 vs. human's 3-18 cap), and the
 * original mechanic re-caps it rather than refusing the character outright. */
function sheetFromDokSaved(sc: DokSavedCharacter, spellIds?: number[], baseAc = sc.baseArmorClass): DokImportCandidate | null {
  const cls = inferDokClass(sc, spellIds);
  const level = inferDokLevel(cls, sc.thac0);
  const abilities = clampToRace(sc.abilities, 'human', 'male');
  // Byte-faithful as of 2026-09-07. What stood here was:
  //   const conBonus = ADND1E_ABILITIES.constitution(abilities.con, cls === 'fighter').hp;
  //   const hp = level * levelHpGain(hitDie(cls)) + level * conBonus;
  // — a synthesized number, built while this file believed `.GAM` had no HP field. It does; see the
  // file header. Note the level inference above is UNAFFECTED by this change: `inferDokLevel` fits
  // THAC0, never HP, so class and level come out identical before and after.
  const hp = sc.hitPoints;
  const req: CharacterRequest = {
    name: sc.name.trim() || 'IMPORTED',
    race: 'human',
    sex: 'male',
    classes: { [cls]: level },
    abilities,
    deity: cls === 'cleric' ? DEFAULT_DEITY : undefined,
    hp,
    maxHp: hp,
    baseAc,
    // M95.S1 — every character this importer builds is destined for a DQK session (the DoK->DQK
    // hand-off), so it must be validated against DQK's own, materially more permissive level table
    // (dqkMaxLevel()), not CoK/DoK's flat cap createCharacter() defaults to.
    levelCapRuleset: 'dqk',
  };
  const res = createCharacter(req);
  return res.ok ? { sheet: res.sheet, cls, level, hp } : null;
}

export interface DokImportResult {
  /** Names of the characters that were imported, in slot order. */
  imported: string[];
  /** Per-character "name — Class L<level>" summary for display. `mem` is the real carried-over
   * memorized-spell TOTAL (post-crosswalk, post-class-filter — the exact figure
   * `combatSpellsForMember()` already builds real combat spells from), `undefined` for a
   * non-caster or a caster whose `.WIZ` spells didn't survive the crosswalk/class filter (never
   * fabricated as "0 spells"). M61.S1 — `thac0` is `sheet.thac0`, the real derived combat number
   * `sheetToCombatant()` already feeds into every DoK-imported hero's real to-hit roll in DQK
   * combat — named in this file's own doc comment ("effective AC/THAC0 are all DERIVED") in the
   * same breath as `ac` (M51.S1), but never threaded through until now. */
  summary: { name: string; cls: CoreClassId; level: number; hp: number; ac: number; thac0: number; mem?: number }[];
  /** Names that couldn't be validated by `createCharacter` (e.g. an out-of-range ability score). */
  rejectedInvalid: string[];
  /** Names skipped because the 6-hero party was already full. */
  rejectedPartyFull: string[];
  /** M86.S1 — per-head platinum stipend granted on import (ovr017's `ConvertPoolRadPlayer`, mirroring
   * `importParty.ts`'s identical `stipend` field), banked once per surviving character via `addGold`. */
  stipend: number;
}

async function fetchSave(path: string, assetSource?: AssetSource): Promise<Uint8Array | null> {
  try {
    // A selected Library source is authoritative. Missing save/sidecar files stay missing rather
    // than being silently blended with bundled pregens. AssetSource's basename contract is
    // case-insensitive, so this also works when a real install uses different filename casing.
    if (assetSource) return assetSource.readAsset(basenameOf(path));
    if (import.meta.env.PROD) return null; // Saved characters are local-only in public builds.
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Read the DoK save party and install it as the active roster (replacing any current party), then
 * hand off into the DQK dungeon. Returns which characters were imported; an empty result means no
 * save files were present.
 */
export async function importDokParty(assetSource?: AssetSource): Promise<DokImportResult> {
  const result: DokImportResult = { imported: [], summary: [], rejectedInvalid: [], rejectedPartyFull: [], stipend: 0 };
  const candidates: DokImportCandidate[] = [];

  for (let i = 0; i < DOK_CHRDATA_PATHS.length; i++) {
    const bytes = await fetchSave(DOK_CHRDATA_PATHS[i], assetSource);
    if (!bytes || !sniffDokSavedCharacter(bytes)) continue;
    const sc = decodeDokSavedCharacter(bytes);
    if (!sc.name.trim()) continue;

    // M33.S1 — fetch+decode `.WIZ` BEFORE class inference (not after, like M32.S1 did) so the real
    // spell ids can vote on cleric-vs-magicUser instead of only feeding the post-inference memorization
    // join. Only casters ever carry `.WIZ` data (validated `classCode` split), so non-casters skip the
    // fetch entirely.
    let spellIds: number[] | undefined;
    if (sc.classCode !== NONCASTER_CODE) {
      const wizBytes = await fetchSave(DOK_CHRDATA_WIZ_PATHS[i], assetSource);
      if (wizBytes && wizBytes.length === MON_WIZ_RECORD_SIZE) {
        spellIds = decodeMonsterWizRecord(wizBytes).spells.map((s) => s.spellId);
      }
    }

    // M34.S1 — the save's real worn armour/shield, not the `.GAM` unarmoured baseline. Fetched for
    // every candidate (gear isn't caster-gated); falls back to `sc.baseArmorClass` (10) if `.JNK` is
    // absent/unreadable or carries no crosswalked gear.
    let baseAc = sc.baseArmorClass;
    let inv: Inventory | undefined;
    const jnkBytes = await fetchSave(DOK_CHRDATA_JNK_PATHS[i], assetSource);
    if (jnkBytes) {
      const decoded = inventoryFromDokJnk(decodeDokJnkFile(jnkBytes));
      if (decoded.entries.length) {
        baseAc = wornArmorAc(decoded);
        inv = decoded;
      }
    }

    const candidate = sheetFromDokSaved(sc, spellIds, baseAc);
    if (!candidate) {
      result.rejectedInvalid.push(sc.name.trim());
      continue;
    }
    // M66.S1 — carry the same real gear that already derived `baseAc` above through to the party-add
    // loop, so it can be persisted (see `setInventory` call below), not just used for the AC scalar.
    if (inv) candidate.inv = inv;
    if (spellIds && (candidate.cls === 'cleric' || candidate.cls === 'magicUser')) {
      candidate.mem = memorizationFromDokIds(spellIds, candidate.cls);
    }
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    lastImport = result;
    return result;
  }

  clearParty();
  for (const { sheet, cls, level, hp, mem, inv } of candidates) {
    if (!addToParty(sheet)) {
      result.rejectedPartyFull.push(sheet.name);
      continue;
    }
    result.imported.push(sheet.name);
    // M51.S1 — sheet.ac (M34.S1's real worn-gear-derived AC) was already computed and destructured
    // above, but never reached the on-screen summary; thread it through.
    // M58.S1 — mem (the real carried-over Memorization, already computed above and already fed to
    // setMemorization one line below) was never folded into the on-screen summary; thread the total
    // memorized-spell count through so the import screen discloses it like every other derived stat.
    // M61.S1 — sheet.thac0 has the identical gap: named in this file's own doc comment in the same
    // breath as ac ("effective AC/THAC0 are all DERIVED"), computed by the exact same createCharacter()
    // call, already in scope right here — thread it through the same way.
    result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac, thac0: sheet.thac0, mem: mem ? mem.byLevel.flat().length : undefined });
    // M86.S1 — actually bank the arrival stipend per surviving hero, not just describe it (mirrors
    // importParty.ts's identical M23.S1 precedent).
    result.stipend = IMPORT_PLATINUM_STIPEND;
    addGold(IMPORT_PLATINUM_STIPEND * PLATINUM_TO_STEEL);
    if (mem) setMemorization(sheet.name, mem);
    // M66.S1 — inv (the real crosswalked `.JNK` worn gear, already computed above to derive sheet.ac)
    // was never persisted, so the FIRST screen to call getInventory() for this hero (the Inventory
    // screen, or the Character Sheet's own MV row, M63.S1) would silently seed and permanently persist
    // a class-generic starter kit instead — real but wrong gear that contradicts the AC shown above.
    if (inv) setInventory(sheet.name, inv);
  }
  lastImport = result;
  return result;
}

/** The most recent {@link importDokParty} result, cached so the e2e seam can read it back. */
let lastImport: DokImportResult | null = null;

/** Headless seam for e2e: trigger the import and read back what landed in the roster. */
export function installImportDokSeam(): void {
  (window as unknown as { __importDok?: Record<string, unknown> }).__importDok = {
    run: () => importDokParty(),
    // M66.S1 — `inv` exposes the real persisted gear (base-type ids) so e2e can prove `setInventory`
    // actually ran, not just that `sheet.ac` was derived from it.
    party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities, inv: getInventory(s).entries.map((e) => e.baseTypeId) })),
    rejected: () => lastImport ? [...lastImport.rejectedInvalid, ...lastImport.rejectedPartyFull] : [],
    // M32.S1 — flat list of memorized spell ids across all 5 levels, for a named imported character.
    memorization: (name: string) => getMemorization(name).byLevel.flat(),
    // M86.S1 — the per-head platinum stipend actually banked this import, mirrors importParty.ts's seam.
    stipend: () => lastImport?.stipend ?? 0,
    gold: () => getGold(),
  };
}
