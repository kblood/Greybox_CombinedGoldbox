/**
 * B3 — Import a party from a Champions of Krynn save.
 *
 * The Krynn trilogy's signature feature is carrying your party forward: you finish Champions of
 * Krynn and import those same characters into Death Knights of Krynn (and on into Dark Queen). This
 * reads CoK's `SAVE/CHRDATA{n}.SAV` files (the engine `decodeSavedCharacter` does the byte work),
 * turns each into a playable `CharacterSheet`, and installs them as the active roster so the very
 * next dungeon — including DoK via `?explore=dok` — is fought by *your imported heroes*.
 *
 * **Faithful vs derived.** Every combat-relevant number is taken byte-for-byte from the save:
 * name, the six ability scores, HP, AC, THAC0 and all five saving throws.
 *
 * **Class and race are now read from the save too (2026-09-07).** This paragraph used to say CoK
 * "does not store the per-class level breakdown / race in a position we have pinned yet", and that the
 * class was inferred "from the prime-requisite abilities". Both are superseded: the class is byte 91
 * and the race is byte 90 (`savedCharacter.ts` carries the enums, the three corroborating signals and
 * their nulls). The ability heuristic in {@link inferClass} survives only as a fallback for a byte
 * outside the game's own 17-entry enum, and for the two enum entries — Druid and Paladin — that the
 * engine's `DragonlanceClassId` set cannot express.
 *
 * **Reading the real race retires a workaround; it does NOT fix a live corruption — checked before
 * claiming otherwise.** The hardcoded `race: 'human'` did feed `convertImportedCharacter`, which
 * re-applies race ability caps (ovr017 `EnforceRaceSexLimits`), and under a human cap of 18 that
 * lowered MOLLY's and KAL's real DEX 19. But `importCokParty` already knew: it deliberately never
 * copied `conv.abilities` back onto the fighting sheet, and said so in a comment naming this exact
 * case ("human caps would wrongly lower e.g. KAL's DEX 19→18"). **So no shipped party member ever had
 * a corrupted ability score, and this change does not move one.** What it does is remove the need for
 * that workaround: clamping each of the six records against its OWN race is a no-op on 6 of 6, all
 * six abilities each, so the capped and uncapped values now agree and the divergence the comment was
 * defending against is gone at the source. The visible change is that `CharacterSheet.race` is the
 * real race instead of `'human'` for **5 of the 6** pregens (SIR STRONGSWORD genuinely is Human,
 * which is part of why the hardcoding survived).
 *
 * **Still derived:** the level (no campaign-level byte is pinned) and, for a multiclass code, the
 * per-component level split — see {@link inferClass}. The character still fights with its exact saved
 * stats. This is flagged in the import summary.
 */
import {
  decodeSavedCharacter,
  sniffSavedCharacter,
  dragonlanceClassForCode,
  dragonlanceClassesForCode,
  dragonlanceRaceForCode,
  cokClassLabel,
  spellSlots as coreSpellSlots,
  clericSpellSlots,
  blankCharacter,
  convertImportedCharacter,
  addPlayer,
  PLATINUM_TO_STEEL,
  type SavedCharacter,
  type CharacterSheet,
  type DragonlanceClassId,
  type DragonlanceRaceId,
  type PlayerCharacter,
  type RosterMember,
  type Roster,
  type AddPlayerReason,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { type AssetSource } from './assetSource.js';
import { clearParty, addToParty, setXp, getParty, addGold, getGold } from './party.js';

/** The CoK save files, spelled as literals so `scripts/bundle-assets.mjs` ships them. */
const CHRDATA_PATHS = [
  'Champions of Krynn/SAVE/CHRDATA1.SAV',
  'Champions of Krynn/SAVE/CHRDATA2.SAV',
  'Champions of Krynn/SAVE/CHRDATA3.SAV',
  'Champions of Krynn/SAVE/CHRDATA4.SAV',
  'Champions of Krynn/SAVE/CHRDATA5.SAV',
  'Champions of Krynn/SAVE/CHRDATA6.SAV',
];

/** Average hit-die roll per class, used to back out a plausible level from saved HP. */
const CLASS_AVG_HD: Record<DragonlanceClassId, number> = {
  fighter: 5.5, // d10
  knight: 5.5, // d10
  ranger: 5.5, // d10 (1e ranger uses d8 early; close enough for a derived level)
  thief: 3.5, // d6
  cleric: 4.5, // d8
  magicUser: 2.5, // d4
};

/**
 * The on-screen rejection message for each {@link AddPlayerReason}, transcribed from the original-game
 * strings in `decompile-ovr017-save-import.md` so a gated character reads the way the DOS engine said.
 * Exported (M94.S1) so `create.ts`'s hand-made "Add to party" flow, gated by the same `addPlayer()`,
 * surfaces the identical wording rather than duplicating this literal.
 */
export const REASON_MESSAGE: Record<AddPlayerReason, string> = {
  duplicate: 'is already in the party',
  'party-full': 'the party is full (6 heroes max)',
  'roster-full': 'no room in the roster (8 max)',
  'paladin-rejects-evil': 'paladins do not join with evil scum',
  'evil-rejects-paladin': 'will tolerate no evil!',
  'too-many-rangers': 'too many rangers in party',
};

/** The 1e core class whose spell table a Dragonlance class uses. */
function coreOf(cls: DragonlanceClassId): 'cleric' | 'fighter' | 'magicUser' | 'thief' | 'ranger' {
  return cls === 'knight' ? 'fighter' : cls;
}

/**
 * Determine the primary class from the save's class code (offset 91), falling back to abilities only
 * when the code names something the engine cannot express.
 *
 * **The code and the offset both changed on 2026-09-07.** This used to read offset 90 — the race byte —
 * through a three-entry map, and its comment justified that with "e.g. ISTAN is a mage with STR 18".
 * ISTAN is not a mage; his class byte is 4, `Ranger`. The example was built to fit the wrong byte.
 *
 * The fallback survives for exactly two reasons, both narrow: a byte outside the game's 17-entry enum,
 * and the codes `Druid` (1) and `Paladin` (3), which have no `DragonlanceClassId`. **Neither case
 * occurs in the six retail records** — all six now take the pinned branch, where before, 3 of 6 took a
 * pinned branch that was reading the wrong byte and 3 fell through to the heuristic.
 *
 * For a multiclass code this returns the FIRST component (`Cleric/Mage` → `cleric`), because a
 * `CharacterSheet` needs one class to key its single derived level. That is a real, stated gap, not a
 * claim the character is single-classed: {@link sheetFromSaved} records the full component list, and
 * no per-component level split is invented because no level byte is pinned to split.
 */
function inferClass(sc: SavedCharacter): DragonlanceClassId {
  const pinned = dragonlanceClassForCode(sc.classCode);
  if (pinned) return pinned;
  const a = sc.abilities;
  const candidates: [DragonlanceClassId, number][] = [
    ['fighter', a.str],
    ['thief', a.dex],
    ['cleric', a.wis >= 9 ? a.wis : -1],
    ['magicUser', a.int >= 9 ? a.int : -1],
  ];
  candidates.sort((x, y) => y[1] - x[1]);
  return candidates[0][1] >= 0 ? candidates[0][0] : 'fighter';
}

/** Back out a level from saved HP and the class hit die, clamped to a sane campaign range. */
function inferLevel(hp: number, cls: DragonlanceClassId): number {
  const lvl = Math.round(hp / CLASS_AVG_HD[cls]);
  return Math.max(1, Math.min(9, lvl || 1));
}

/**
 * The `DragonlanceRaceId` a saved record names (offset 90), or `'human'` when the byte is the
 * unplayable `Monster` code or falls outside the game's 8-entry enum. `'human'` is this engine's
 * default race everywhere else, so it is the honest stand-in — but note it is now a *fallback that
 * never fires on real data* (6 of 6 retail records decode to a real playable race), where it used to
 * be the hardcoded answer for every character.
 */
function raceOf(sc: SavedCharacter): DragonlanceRaceId {
  return dragonlanceRaceForCode(sc.raceCode) ?? 'human';
}

/** Build a playable sheet from a saved character: exact combat stats, class/race read from the save,
 * level still inferred. */
export function sheetFromSaved(sc: SavedCharacter): CharacterSheet {
  const cls = inferClass(sc);
  const level = inferLevel(sc.hitPoints, cls);
  // Every class the save's code names, in the game's own label order — `Cleric/Mage` is two classes,
  // not one. Falls back to the single heuristic class when the code is outside the enum.
  const components = dragonlanceClassesForCode(sc.classCode) ?? [cls];

  // Each component is recorded at the SAME derived level. **That split is an approximation and the
  // only invented number here**: no per-class level byte is pinned in the record (offsets 206/214
  // hold small 1-3 enums, not campaign levels), and real AD&D multiclassing divides earned XP between
  // the classes, so a Fighter/Mage's two levels need not be equal. The level was already flagged as
  // derived before this — `inferLevel` backs it out of HP against a hit die — so this extends an
  // existing approximation rather than adding a new kind of one. The alternative, keeping only the
  // primary class, is not more honest: it would silently discard a byte-faithful fact (that GARIN is
  // a Fighter/Mage) and, with it, his mage spell slots.
  const classes: Partial<Record<DragonlanceClassId, number>> = {};
  for (const c of components) classes[c] = level;

  const spellSlots: Partial<Record<DragonlanceClassId, number[]>> = {};
  for (const c of components) {
    if (c === 'cleric') {
      spellSlots[c] = clericSpellSlots(level, sc.abilities.wis);
    } else {
      const sp = coreSpellSlots(coreOf(c), level);
      if (sp.some((n) => n > 0)) spellSlots[c] = sp;
    }
  }

  return {
    name: sc.name.trim() || 'IMPORTED',
    // Read from save byte 90 as of 2026-09-07; hardcoded 'human' before that. `sex` is still
    // hardcoded — no byte is pinned for it, and unlike race no enum has been located.
    race: raceOf(sc),
    sex: 'male',
    ...(sc.appearance
      ? { appearance: { ...sc.appearance, paletteBytes: [...sc.appearance.paletteBytes] } }
      : {}),
    classes,
    abilities: { ...sc.abilities },
    // Combat numbers come straight from the save (not recomputed) so the import is byte-faithful.
    thac0: sc.thac0,
    ac: sc.armorClass,
    savingThrows: { ...sc.savingThrows },
    spellSlots,
    hp: sc.hitPoints,
    maxHp: sc.hitPoints,
    // Byte-located at save offset 219 on 2026-08-26 and carried through verbatim. Not recomputed:
    // `recalcThiefSkills` still lacks a Dragonlance race-row mapping (see `thiefSkills.ts`), and the
    // stored bytes are the game's own answer. All zero for a non-thief.
    thiefSkills: sc.thiefSkills.slice(),
  };
}

/**
 * Build the engine {@link PlayerCharacter} the ovr017 import pipeline operates on. This feeds
 * {@link convertImportedCharacter} (stipend / animate_dead / race-cap) and the {@link addPlayer} roster
 * gates — it is NOT the fighting sheet, so the byte-faithful combat stats stay in {@link sheetFromSaved}.
 *
 * CoK saves don't store sex, alignment, or paladin/ranger level in a pinned position (see
 * `savedCharacter.ts`), so those are defaulted: sex `male`, alignment 0 (Good — CoK has no stored
 * alignment), paladinLevel 0 (Krynn has Knights, not paladins), and rangerLevel only when the class
 * is `ranger`. **Race is no longer in that list** — it is byte 90 and is read, mirroring
 * `sheetFromSaved`. `modId = slot+1` gives each save slot a
 * stable, distinct id so the dedupe gate cannot false-collide two same-named saves.
 */
function playerCharacterFromSaved(
  sc: SavedCharacter,
  cls: DragonlanceClassId,
  level: number,
  slot: number,
): PlayerCharacter {
  return blankCharacter({
    name: sc.name.trim() || 'IMPORTED',
    // Read from save byte 90. This one matters beyond labelling: `convertImportedCharacter` re-applies
    // race ability caps to this PlayerCharacter (ovr017 `EnforceRaceSexLimits`), so the previous
    // hardcoded 'human' was clamping MOLLY's and KAL's real DEX 19 down to 18. See the file header.
    race: raceOf(sc),
    sex: 'male',
    abilities: { ...sc.abilities },
    thac0: sc.thac0,
    baseAc: sc.armorClass,
    hitPointMax: sc.hitPoints,
    hitDice: level,
    exp: sc.xp,
    controlMorale: 0, // imported saves are PCs (control_morale < NPC_BASE)
    alignment: 0, // CoK does not store alignment — documented gap, default Good
    paladinLevel: 0, // Krynn has Knights, not paladins; unmapped
    rangerLevel: cls === 'ranger' ? level : 0,
    modId: slot + 1, // stable per-slot id so the dedupe gate can't false-collide
    // NOTE: thief skills deliberately NOT set here. This PlayerCharacter feeds the roster gates and
    // is then discarded — only `sheetFromSaved`'s CharacterSheet reaches the party — so setting it
    // here would look like wiring while carrying nothing.
  });
}

export interface ImportResult {
  /** Names of the characters that were imported, in slot order. */
  imported: string[];
  /** Per-character summary for display. M60.S1 — `saves` is the real byte-faithful five-save
   * quintuple (`sheetFromSaved()`'s `savingThrows`), pre-formatted "P/P/R/B/S"-style exactly as
   * `create.ts`'s own live preview already renders it (`create.ts:312`) — named in this screen's own
   * paragraph ("...and saves are taken byte-for-byte from your save") since before M51.S1, still
   * never threaded into the table until now. */
  summary: { name: string; cls: string; level: number; hp: number; xp: number; ac: number; thac0: number; saves: string }[];
  /** Characters the {@link addPlayer} roster gates refused, with the typed reason + on-screen message. */
  rejected: { name: string; reason: AddPlayerReason; message: string }[];
  /**
   * Per-head platinum stipend granted by {@link convertImportedCharacter} (for the on-screen
   * message). M23.S1: also actually banked — `PLATINUM_TO_STEEL` (`ovr022 GetGoldWorth`) once per
   * imported hero, via `addGold`, so the party's steel pool reflects the real arrival grant instead
   * of just describing it.
   */
  stipend: number;
  /**
   * Set only when the caller's `isCurrent` guard turned false before the party was mutated. A
   * cancelled import read nothing into the party, XP, gold or the {@link lastImport} cache, so the
   * caller must not show its outcome. Absent for every completed import.
   */
  cancelled?: boolean;
}

async function fetchSave(path: string, assetSource?: AssetSource): Promise<Uint8Array | null> {
  try {
    // A Library-selected install is an explicit request to use that game's files.  Do not
    // silently blend its campaign state with the bundled pregenerated party: a missing selected
    // character file is an honest "no character here", not a reason to substitute another save.
    if (assetSource) return assetSource.readAsset(path.split('/').pop()!);
    if (import.meta.env.PROD) return null; // Public builds never bundle saved characters.
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/** The result of an import whose caller stopped owning it. Nothing was mutated or cached. */
function cancelledImport(): ImportResult {
  return { imported: [], summary: [], rejected: [], stipend: 0, cancelled: true };
}

/**
 * Read the CoK save party and install it as the active roster (replacing any current party). Returns
 * which characters were imported; an empty result means no save files were present.
 *
 * `isCurrent` lets a caller revoke the import while it waits on save reads (a menu that was torn down,
 * or a newer import or roster change). It is checked before the first read, after every read, and once
 * more before the synchronous mutation phase, so a stale import returns `cancelled` with no party, XP,
 * gold, `lastImport` or status change. Omitting it keeps the original behaviour for every existing caller.
 */
export async function importCokParty(
  assetSource?: AssetSource,
  isCurrent: () => boolean = () => true,
): Promise<ImportResult> {
  if (!isCurrent()) return cancelledImport();
  const result: ImportResult = { imported: [], summary: [], rejected: [], stipend: 0 };
  const sheets: {
    sheet: CharacterSheet;
    sc: SavedCharacter;
    cls: DragonlanceClassId;
    level: number;
    slot: number;
  }[] = [];

  for (let slot = 0; slot < CHRDATA_PATHS.length; slot++) {
    const bytes = await fetchSave(CHRDATA_PATHS[slot], assetSource);
    if (!isCurrent()) return cancelledImport();
    if (!bytes || !sniffSavedCharacter(bytes)) continue;
    const sc = decodeSavedCharacter(bytes);
    if (!sc.name.trim()) continue;
    const sheet = sheetFromSaved(sc);
    const cls = Object.keys(sheet.classes)[0] as DragonlanceClassId;
    const level = sheet.classes[cls] ?? 1;
    sheets.push({ sheet, sc, cls, level, slot });
  }

  // The one ownership check before any persistent write. Everything below is synchronous, so once the
  // mutation phase starts no other menu action can interleave with it.
  if (!isCurrent()) return cancelledImport();

  if (sheets.length === 0) {
    lastImport = result;
    return result;
  }

  clearParty();
  // The ovr018 AddPlayer gates run against a growing roster; the byte-faithful CharacterSheet is what
  // actually fights. conv is used for stipend/animate_dead/gate.
  //
  // This used to add: "we never copy the race-capped conv.abilities back into it — race is a CoK gap
  // and human caps would wrongly lower e.g. KAL's DEX 19→18". The first clause still describes what
  // the code does, but its REASON expired on 2026-09-07: race is no longer a CoK gap (byte 90), and
  // `playerCharacterFromSaved` now passes each character's real race, under which `clampToRace` is a
  // no-op on all 6 records × 6 abilities. KAL is a Qualinesti Elf, whose DEX ceiling is 19, so the
  // clash this comment was guarding cannot arise. The copy-back is still not done — but now because
  // the sheet is already byte-faithful, not because the cap would damage it.
  let roster: Roster = { members: [] };
  for (const { sheet, sc, cls, level, slot } of sheets) {
    const pc = playerCharacterFromSaved(sc, cls, level, slot);
    const conv = convertImportedCharacter(pc); // +300pp stipend, clears animate_dead, multiclassLevel, race-cap
    const member: RosterMember = {
      name: conv.name,
      modId: conv.modId,
      controlMorale: conv.controlMorale,
      alignment: conv.alignment,
      paladinLevel: conv.paladinLevel,
      rangerLevel: conv.rangerLevel,
    };
    const gate = addPlayer(roster, member);
    if (!gate.ok) {
      result.rejected.push({ name: member.name, reason: gate.reason, message: REASON_MESSAGE[gate.reason] });
      continue; // skip addToParty; do not break — later slots may still differ
    }
    roster = gate.roster;
    if (!addToParty(sheet)) {
      // Storage guard agrees with the gate (both cap at 6); treat as party-full for display parity.
      result.rejected.push({ name: member.name, reason: 'party-full', message: REASON_MESSAGE['party-full'] });
      continue;
    }
    if (sc.xp > 0) setXp(sheet.name, sc.xp);
    result.imported.push(sheet.name);
    // M51.S1 — sheet.ac is byte-faithful from the save (sheetFromSaved()) but never reached the
    // on-screen summary, despite this screen's own displayed copy already claiming AC is shown.
    // M59.S1 — sheet.thac0 has the identical gap: named in the same displayed sentence as AC, byte-
    // faithful from the save, already in scope right here, never threaded through until now.
    // M60.S1 — sheet.savingThrows has the identical gap: named in the same displayed sentence, byte-
    // faithful from the save, already in scope right here. Formatted exactly like create.ts:312's own
    // live preview ("saves P/P/R/B/S") — a real, already-shipped compact-cell convention, not a new one.
    const sv = sheet.savingThrows;
    const saves = `${sv.paralyzePoisonDeath}/${sv.petrifyPolymorph}/${sv.rodStaffWand}/${sv.breath}/${sv.spell}`;
    const classLabel = dragonlanceClassesForCode(sc.classCode) ? cokClassLabel(sc.classCode) : cls;
    result.summary.push({ name: sheet.name, cls: classLabel, level, hp: sc.hitPoints, xp: sc.xp, ac: sheet.ac, thac0: sheet.thac0, saves });
    result.stipend = conv.platinum;
    addGold(conv.platinum * PLATINUM_TO_STEEL); // M23.S1 — actually bank the arrival stipend, not just display it
  }
  lastImport = result;
  return result;
}

/** The most recent {@link importCokParty} result, cached so the e2e seam can read back gate reasons. */
let lastImport: ImportResult | null = null;

/** Headless seam for e2e: trigger the import and read back what landed in the roster. */
export function installImportSeam(): void {
  (window as unknown as { __import?: Record<string, unknown> }).__import = {
    run: () => importCokParty(),
    runWithSyntheticFiles: (files: Record<string, number[]>) => importCokParty({
      async readAsset(basename) {
        const bytes = files[basename];
        return bytes ? Uint8Array.from(bytes) : null;
      },
    }),
    party: () => getParty().map((s) => ({ name: s.name, race: s.race, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, savingThrows: s.savingThrows, abilities: s.abilities, thiefSkills: s.thiefSkills, appearance: s.appearance })),
    rejected: () => lastImport?.rejected ?? [],
    stipend: () => lastImport?.stipend ?? 0,
    gold: () => getGold(),
  };
}
