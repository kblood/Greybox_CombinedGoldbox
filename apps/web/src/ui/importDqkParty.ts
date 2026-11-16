/**
 * R2 — Import the DQK saved-game party (`SAVGAMA.QSV`) into the active roster.
 *
 * The repo ships a real, played `SAVGAMA.QSV` (`The Dark Queen of Krynn/SAVGAMA.QSV`, 7965 bytes,
 * `partySize` @31 = 6) carrying **six pre-generated heroes** — SIR DRYDEN, JORIS THE WISE, LENDUIRA,
 * neacail, ALARIC THE BOLD, MAIGUREIGNE. This is a DIFFERENT roster from `dqkParty.ts`'s
 * hand-authored "Heroes of the Lance" (STURM, CARAMON, TANIS, GOLDMOON, RAISTLIN, TASSLEHOFF) that
 * `?dqk=1` seeds when no party exists — that roster is original content for the tech-demo explorer;
 * this importer reads the game's OWN saved characters, the same series feature `importParty.ts`
 * (CoK→DoK) and `importDokParty.ts` (DoK→DQK) already ship for the earlier two hops.
 *
 * `packages/engine/src/loaders/dqkSave.ts`'s `readQsvRoster` (extended for R2) decodes each record's
 * combat stats by reusing `moncha.ts`'s `decodeNpcRecord` at the SAME `+0x78` ability offset MONCHA's
 * character/NPC framing uses — no new deltas were invented for this importer.
 *
 * **Byte-faithful** (read straight from the save, not recomputed):
 *  - name, the twelve stored (current, max) ability bytes (`QsvRosterEntry.abilities`);
 *  - **HP** (`stats.hitPoints`, `+0x78+17`) — stored directly, unlike DoK's `.GAM`, which has no HP
 *    field at all and forces `importDokParty.ts` to derive HP from a level-average formula. DQK's
 *    save does not have that gap;
 *  - **level** (`stats.npcLevel`, `+0x78+25`);
 *  - **race byte** (`QsvRosterEntry.race`, `+0x58`) and **class-code byte** (`stats.npcClass`,
 *    `+0x78+71`) are both read byte-faithfully but, per the two bullets below, are NOT yet mapped to
 *    ruleset enums with the same confidence as the other fields — see `dqk-save-format.md` §6.
 *
 * **Derived, and disclosed as such in {@link DqkImportResult.summary}:**
 *  - **class**: the raw class-code byte is checked against the SAME enum `referenceDb.ts`'s
 *    `NPC_CLASS_LABEL` uses for MONCHA's bestiary NPCs (`{2:'Fighter',5:'Mage',6:'Thief',
 *    8:'Cleric'}`, M37) — but that enum was validated against *bestiary* records, not player heroes,
 *    and of the six shipped codes (16, 130, 11, 6, 9, 3) only **neacail's (6, Thief)** actually lands
 *    inside it. Rather than invent a mapping for the other five, this falls back to the SAME
 *    prime-requisite ability heuristic `importParty.ts`'s CoK importer already uses for its own
 *    "unconfirmed code" case (fighter/thief by STR/DEX, cleric/magicUser by WIS/INT ≥ 9, ties broken
 *    in that fixed order). Every inferred class carries `classSource: 'code' | 'ability-heuristic'`
 *    so a heuristic guess is never presented as a verified byte.
 *  - **race**: no player-race enum has been established for the `+0x58` byte (the bestiary reading —
 *    "7 = plain monster, 6 = humanoid" — does not obviously extend to player heroes; the six values
 *    seen are 0/1/5/6, never 7). Every imported hero is therefore built as `race: 'human'`
 *    (disclosed), with `clampToRace` reconciling the three ability scores (JORIS, neacail and ALARIC
 *    all store DEX 19) that exceed the human 3-18 range — the same fixup `importDokParty.ts`'s
 *    M86.S1 applied for its own out-of-range NEACAIL.
 *  - **thac0 / ac**: `createCharacter()` recomputes both from the inferred class+level table and
 *    `baseAc` (fed the byte-faithful `stats.armorClass`, which reads 10 — the AD&D-1e unarmoured
 *    baseline — for all six shipped heroes, the same convention DoK's `.GAM` uses), so the built
 *    sheet's `thac0`/`ac` do NOT equal the save's own inverted-store bytes pinned in
 *    `dqkSave.test.ts`. Both the raw byte and the recomputed sheet value are threaded into the
 *    summary so the gap is visible, not hidden.
 *
 * A class code outside the known enum is a disclosed derivation, never a guess presented as fact —
 * see the project's `goldbox-the-null-decides-the-finding` / "never invent a field" standard.
 */
import {
  createCharacter,
  clampToRace,
  readQsvRoster,
  type CharacterSheet,
  type CharacterRequest,
  type QsvRosterEntry,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { clearParty, addToParty, getParty } from './party.js';

/** The four classes a DQK QSV record's class code / ability scores alone can safely imply (mirrors
 * `importDokParty.ts`'s own `CoreClassId` — Knight/Ranger need a race/order signal neither save format
 * carries). */
type CoreClassId = 'fighter' | 'thief' | 'cleric' | 'magicUser';

/** The literal `SAVGAMA.QSV` path — spelled out (not built from a template) so
 * `scripts/bundle-assets.mjs`'s literal-path scan ships the file, the same convention every other
 * importer in this directory relies on. */
const DQK_SAVGAMA_PATH = 'The Dark Queen of Krynn/SAVGAMA.QSV';

/** `referenceDb.ts`'s `NPC_CLASS_LABEL` (M37), converted from its display labels to
 * `CoreClassId`s. Validated for MONCHA bestiary NPC records; only checked here, not assumed to hold
 * for player heroes — see the file doc's "class" bullet. */
const NPC_CLASS_CODE_TO_CLASS: Readonly<Record<number, CoreClassId>> = {
  2: 'fighter', // 'Fighter'
  5: 'magicUser', // 'Mage'
  6: 'thief', // 'Thief'
  8: 'cleric', // 'Cleric'
};

/** Generic human-allowed deity for an inferred Cleric with no stored deity (mirrors `dqkParty.ts`'s
 * own Goldmoon default and `importDokParty.ts`'s identical fallback). */
const DEFAULT_DEITY = 'mishakal';

/** One imported hero, with everything the summary needs to disclose byte-faithful vs derived. */
interface DqkImportCandidate {
  sheet: CharacterSheet;
  cls: CoreClassId;
  classSource: 'code' | 'ability-heuristic';
  rawClassCode: number;
  race: number;
  level: number;
  hp: number;
  rawThac0: number;
  rawAc: number;
}

/**
 * Infer the class for one roster entry. Tries the validated M37 code mapping first; falls back to
 * the ability-score heuristic ONLY when the byte is outside that enum, and says which happened.
 */
function inferDqkClass(entry: QsvRosterEntry): { cls: CoreClassId; classSource: 'code' | 'ability-heuristic' } {
  const code = entry.stats!.npcClass;
  const pinned = code !== undefined ? NPC_CLASS_CODE_TO_CLASS[code] : undefined;
  if (pinned) return { cls: pinned, classSource: 'code' };

  const a = entry.stats!.abilities; // current values, same framing importParty.ts's inferClass uses
  const candidates: [CoreClassId, number][] = [
    ['fighter', a.str],
    ['thief', a.dex],
    ['cleric', a.wis >= 9 ? a.wis : -1],
    ['magicUser', a.int >= 9 ? a.int : -1],
  ];
  candidates.sort((x, y) => y[1] - x[1]);
  return { cls: candidates[0][1] >= 0 ? candidates[0][0] : 'fighter', classSource: 'ability-heuristic' };
}

/** Build a playable DQK sheet from one QSV roster entry, or `null` if `createCharacter` rejects it
 * (an out-of-range value `clampToRace` didn't fix, or a missing stat block). */
function sheetFromQsvEntry(entry: QsvRosterEntry): DqkImportCandidate | null {
  const stats = entry.stats;
  if (!stats) return null;
  const { cls, classSource } = inferDqkClass(entry);
  const level = stats.npcLevel ?? 1;
  // human is a DISCLOSED default — see the file doc's "race" bullet; clampToRace reconciles any
  // ability the human 3-18 range doesn't allow (JORIS/neacail/ALARIC's saved DEX 19 -> 18).
  const abilities = clampToRace(stats.abilities, 'human', 'male');
  const hp = stats.hitPoints; // byte-faithful — DQK's save stores HP directly, unlike DoK's `.GAM`
  const req: CharacterRequest = {
    name: entry.name.trim() || 'IMPORTED',
    race: 'human',
    sex: 'male',
    classes: { [cls]: level },
    abilities,
    deity: cls === 'cleric' ? DEFAULT_DEITY : undefined,
    hp,
    maxHp: hp,
    baseAc: stats.armorClass, // byte-faithful; createCharacter derives the EFFECTIVE sheet.ac from it
    // R2 — every character built here is destined for the DQK explorer, so validate against DQK's
    // own, materially more permissive level table (dqkMaxLevel()), the same choice
    // importDokParty.ts (M95.S1) and dqkParty.ts's own Heroes already make.
    levelCapRuleset: 'dqk',
  };
  const res = createCharacter(req);
  if (!res.ok) return null;
  return {
    sheet: res.sheet,
    cls,
    classSource,
    rawClassCode: stats.npcClass ?? -1,
    race: entry.race,
    level,
    hp,
    rawThac0: stats.thac0,
    rawAc: stats.armorClass,
  };
}

export interface DqkImportResult {
  /** Names of the characters that were imported, in roster order. */
  imported: string[];
  /** Per-character summary for display, every derived field labelled (mirrors
   * `importDokParty.ts`'s identical contract). `ac`/`thac0` are the built sheet's (derived,
   * recomputed by `createCharacter`); `rawAc`/`rawThac0` are the save's own byte-faithful inverted-
   * store values, for comparison. */
  summary: {
    name: string;
    cls: CoreClassId;
    classSource: 'code' | 'ability-heuristic';
    rawClassCode: number;
    race: number;
    level: number;
    hp: number;
    ac: number;
    rawAc: number;
    thac0: number;
    rawThac0: number;
  }[];
  /** Names that couldn't be validated by `createCharacter` (or had no decodable stat block). */
  rejectedInvalid: string[];
  /** Names skipped because the 6-hero party was already full. */
  rejectedPartyFull: string[];
}

async function fetchSavgama(assetSource?: AssetSource): Promise<Uint8Array | null> {
  try {
    // A selected Library source is authoritative, same contract as every other importer here.
    if (assetSource) return assetSource.readAsset(basenameOf(DQK_SAVGAMA_PATH));
    if (import.meta.env.PROD) return null; // The public bundle intentionally contains no QSV saves.
    const resp = await fetch(assetUrl(DQK_SAVGAMA_PATH));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Read the DQK save's party and install it as the active roster (replacing any current party). An
 * empty result means no save file was present, or it decoded to zero roster records.
 */
export async function importDqkParty(assetSource?: AssetSource): Promise<DqkImportResult> {
  const result: DqkImportResult = { imported: [], summary: [], rejectedInvalid: [], rejectedPartyFull: [] };
  const bytes = await fetchSavgama(assetSource);
  if (!bytes) {
    lastImport = result;
    return result;
  }

  const roster = readQsvRoster(bytes);
  const candidates: DqkImportCandidate[] = [];
  for (const entry of roster) {
    const candidate = sheetFromQsvEntry(entry);
    if (!candidate) {
      result.rejectedInvalid.push(entry.name.trim());
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
      cls: c.cls,
      classSource: c.classSource,
      rawClassCode: c.rawClassCode,
      race: c.race,
      level: c.level,
      hp: c.hp,
      ac: c.sheet.ac,
      rawAc: c.rawAc,
      thac0: c.sheet.thac0,
      rawThac0: c.rawThac0,
    });
  }
  lastImport = result;
  return result;
}

/** The most recent {@link importDqkParty} result, cached so the e2e seam can read it back. */
let lastImport: DqkImportResult | null = null;

/** Headless seam for e2e: trigger the import and read back what landed in the roster. */
export function installImportDqkSeam(): void {
  (window as unknown as { __importDqk?: Record<string, unknown> }).__importDqk = {
    run: () => importDqkParty(),
    party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),
    summary: () => lastImport?.summary ?? [],
    rejected: () => (lastImport ? [...lastImport.rejectedInvalid, ...lastImport.rejectedPartyFull] : []),
  };
}
