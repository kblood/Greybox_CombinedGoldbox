/**
 * DoK saved-character loader (M13) — reads the `CHRDATA{n}.GAM`/`.JNK`/`.EFF` save quad Death
 * Knights of Krynn writes to `SAVE/`. The CoK-side counterpart is `savedCharacter.ts`
 * (`CHRDATA{n}.SAV`); the format reversal behind every field here is
 * `docs/engine/research/dok-chrdata-save-format.md`.
 *
 * **`.GAM` (216 bytes)** is byte-identical to the DoK *compact monster* record `monster.ts`
 * already decodes as `DOK_LAYOUT` (monsters and characters share one struct in this engine
 * family), so {@link decodeDokSavedCharacter} is a thin wrapper over {@link decodeMonsterRecord}.
 * Two things do NOT carry over from the monster reading, both confirmed against the 6 real pregen
 * saves (`SAVE/CHRDATA1..6.GAM`):
 *   - **AC/damage are the unarmoured-human BASELINE, not the character's effective fighting
 *     stats.** Every sampled character decodes to `AC 10, 1d2+0` even when `.JNK` shows them
 *     wearing plate mail and wielding magic swords — the compact record stores the PC's base
 *     stats and the engine applies equipped gear at runtime. These fields are deliberately named
 *     {@link DokSavedCharacter.baseArmorClass}/{@link DokSavedCharacter.baseDamage} (not
 *     `armorClass`/`damage`, unlike CoK's `SavedCharacter`) so a caller can't mistake them for
 *     ready-to-fight numbers.
 *   - **Hit points ARE located in `.GAM`, at byte 40, with a second store at byte 214.**
 *
 *     **CORRECTED 2026-09-07.** This bullet used to read: *"Hit points are not located in `.GAM`
 *     (`DOK_LAYOUT.hp === null` — DoK rolls HP from hit dice at runtime rather than storing a total),
 *     so this loader reports no `hitPoints` field at all rather than a misleading always-0."* Every
 *     clause of that is false today, and the parenthesised justification is the part worth noticing:
 *     it cited a code condition, and that condition had flipped. `monster.ts`'s `DOK_LAYOUT` sets
 *     `hp: 40`. It was `null` when this comment was written (`69cd58c`, 2026-07-03) and stopped being
 *     `null` in `fa07892` (2026-08-11), so the comment spent that whole span asserting the negation of
 *     a value sitting three files away — and `decodeDokSavedCharacter` was already calling
 *     `decodeMonsterRecord`, receiving the correct `hitPoints`, and discarding it.
 *
 *     The bytes, all six retail pregens (`SAVE/CHRDATA{1..6}.GAM`): byte 40 = 95, 102, 78, 52, 58, 53,
 *     and **byte 214 equals byte 40 in 6 of 6**. CoK's 409-byte record mirrors the same way (byte 98
 *     == byte 407 in 6 of 6), so the redundant store is a family convention, not a DoK quirk.
 *     Corroboration independent of our TypeScript: a disassembly of retail `GAME.OVR` counts offset 40
 *     at **53 reads / 8 writes** and offset 214 at **36 reads / 20 writes**
 *     (`docs/engine/research/dok-chrdata-save-format.md`), so neither byte is scratch.
 *
 *     **THE NULL, and it is not resolved: `b40 == b214` CANNOT discriminate max-HP from current-HP.**
 *     All six shipped pregens are undamaged, and no damaged character ships with the game, so the
 *     equality is exactly as consistent with "40 is max, 214 is current" as with the reverse or with
 *     the two being one field written twice. The write-count asymmetry (20 at 214 against 8 at 40)
 *     *leans* toward 214 being the mutable one, but a lean is not a result — the counts cover one
 *     addressing form and a maximum gets written too (level gain, magical bonuses).
 *
 *     **What this loader therefore does:** exposes {@link DokSavedCharacter.hitPoints} from byte 40 —
 *     the offset `DOK_LAYOUT` already names `hp`, and the one the 64-record DoK *monster* corpus
 *     independently pins as the MAXIMUM (there, byte 108 is live HP and diverges from 40 on SKOMP,
 *     81 against 61) — and exposes byte 214 separately and by its offset as
 *     {@link DokSavedCharacter.hitPointsMirror}, deliberately NOT named `currentHitPoints`, because
 *     naming it that would assert the thing the evidence does not settle. Callers that need one number
 *     should use `hitPoints`; the two are equal on every record that ships.
 *
 *     (Note the character record and the monster record are NOT interchangeable in this range: byte
 *     108 is live HP in the monster record but reads 74/70/59/46/51/41 in these character records
 *     against a byte 40 of 95/102/78/52/58/53, so it is something else here.)
 * `classCode`@32 (the monster reading's `category`) correlates with caster-vs-not across the 6
 * real samples but is NOT resolved to specific class names (research doc §2.3) — exposed as the
 * raw byte only, same honesty as CoK's `SavedCharacter.classCode` for its unvalidated codes.
 *
 * **`.JNK` (an exact multiple of 63 bytes)** is the character's inventory, one record per carried
 * item — the SAME 63-byte record size as CoK's `item.ts` `ITEM_RECORD_SIZE`, but DoK bakes the
 * readied flag into the name text itself (`" Yes  Ring Of Prot +3 "` / `" No   127 Arrows +1 "`)
 * rather than a separate byte, and byte@42 — which looks like `item.ts`'s `baseTypeId` at first
 * glance — is actually the low byte of a stale heap pointer (it increments by exactly 63 mod 256
 * from one record to the next within a file), so it is reported as {@link DokJnkItem.scratch42},
 * never `baseTypeId` (research doc §3.2). **The real, usable identity/stat fields are at offset
 * 0x2e (M34.S1)** — `.JNK` shares the exact same 63-byte VOCAB-coded item-instance layout
 * `monsterSideTables.ts`'s {@link decodeMonsterItem}/`ITEM_FIELD` already decodes for
 * `MON{n}ITM.DAX` (a sibling format nobody tried this file against before, since this loader was
 * modeled on CoK's *different* offset-42 convention) — reported as {@link DokJnkItem.item}. This
 * is what finally lets a real character's worn armour/shield reach `CharacterRequest.baseAc` (see
 * `apps/web/src/ui/importDokParty.ts`'s M34.S1 note) instead of the `.GAM` unarmoured baseline
 * this file's own next paragraph warns about.
 *
 * **`.EFF` (an exact multiple of 9 bytes, absent entirely when a character has no active
 * effects)** reuses `monsterSideTables.ts`'s {@link decodeMonsterAffect} record-for-record — the
 * layout is byte-identical to the `MON*SPC.DAX` affect record (research doc §5).
 *
 * **`.WIZ` (220 bytes, spell memorization) is NOT decoded by this loader** — but is no longer an
 * open format question: it is byte-identical to the DoK *monster* `MON{n}WIZ.DAX` memorized-spell
 * record (`monsterSideTables.ts`'s {@link decodeMonsterWizRecord}, cracked in M31.S1 using these very
 * player saves as its own validation set), and `apps/web/src/ui/importDokParty.ts` reads a
 * character's `.WIZ` directly through that function (M32.S1/M33.S1) rather than through this file.
 * **Still genuinely out of scope**: the party-level `SAVGAMA.PTY` remains PARTIAL per the research
 * doc — the `.PTY` ~196–513 hot zone is a real, still-open decode gap, unrelated to `.WIZ`.
 *
 * **Export (2026-07-16, BUILD-QUEUE P2.4 "original save import/export" — DoK half).**
 * {@link exportDokSavedCharacter} synthesizes a full 216-byte `.GAM` record from scratch out of a
 * Greybox in-session character — the DoK sibling of `savedCharacter.ts`'s `exportSavedCharacter`, but
 * scoped to a narrower verified surface (see that file's own header for the CoK side's wider one):
 *   - name, abilities (current AND max, current === max for a fresh character), THAC0 — same
 *     confidence as the decoder above, VERIFIED offsets.
 *   - `classCode`@32 — writes ONLY the VALIDATED `NONCASTER_CODE` (6) for a non-caster, or one fixed
 *     observed caster code otherwise (see {@link classCodeForDokCaster}). Unlike CoK, this does NOT
 *     attempt to encode a *specific* class (cleric vs magicUser): §2.3 of the research doc shows two
 *     different real casters (FLAVIUS code 1, TANAR code 2) both actually being cleric, so the code
 *     alone never distinguished class in the real data either — `importDokParty.ts`'s own class
 *     inference reaches cleric-vs-magicUser through the `.WIZ` spell vote instead
 *     (`classVoteFromDokIds`, `ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`'s
 *     `exportDokWizFromMemorizedSlugs`), not through this byte. Writing a specific caster class code
 *     here would be inventing precision the retail data doesn't have.
 *   - iconSize@41 = 1 and controlMorale@62 = 0 — both CONSTANT across all 6 real pregens (§2.1), so
 *     these are written as fixed values, not caller inputs.
 *   - baseDamage@89-91 and baseArmorClass@95 — ALSO constant across all 6 real pregens regardless of
 *     the character's actual gear (`1d2+0` / AC 10, the unarmoured-human baseline — §2.2). Writing the
 *     observed constant is the faithful encoding; a caller's *effective* AC/damage belongs in `.JNK`
 *     gear instead (`dokGearCrosswalk.ts`'s {@link exportDokJnkFile}), exactly mirroring how the
 *     decoder above refuses to call these fields `armorClass`/`damage`.
 *   - hit points ARE written, to BOTH byte 40 and byte 214, when {@link ExportDokCharacterInput}
 *     supplies them — matching the 6-of-6 retail convention. This bullet used to read "hit points are
 *     NOT written (no field exists in this record — see above)"; see the corrected bullet above for
 *     why that was wrong and for the max-vs-current null the single input value does not resolve.
 *   - the rest of bytes 96..215 (stale far-pointers, an unidentified paired 2-byte field) is left `0`
 *     on the zero-filled base — PARTIAL/unmapped, not invented (§2.4). "PC-only scratch tail" was
 *     always too broad a label for this range and is no longer used here: byte 214 is hit points and
 *     byte 199 is a status gate the engine tests directly, per the research doc's own 2026-09-07
 *     correction.
 */
import { decodeMonsterRecord, DOK_MONSTER_RECORD_SIZE, type DamageDice } from './monster.js';
import {
  decodeMonsterAffect,
  MON_AFFECT_SIZE,
  type MonsterAffect,
  decodeMonsterItem,
  type MonsterItem,
} from './monsterSideTables.js';

/** Size of a DoK `.GAM` record — same struct as the DoK compact monster record. */
export const DOK_SAVED_CHARACTER_SIZE = DOK_MONSTER_RECORD_SIZE;
/** Size of one `.JNK` inventory record (same size as CoK's `ITEM_RECORD_SIZE`). */
export const DOK_JNK_RECORD_SIZE = 63;
const JNK_NAME_MAX = 56; // stays clear of count@57
const GAM_NAME_MAX = 15;
const TO_HIT_BASE = 60;
const GAM_ABILITY_OFFSET = 16;
const GAM_THAC0_OFFSET = 31;
const GAM_CLASS_OFFSET = 32;
const GAM_ICON_SIZE_OFFSET = 41;
const GAM_MORALE_OFFSET = 62;
const GAM_DMG_COUNT_OFFSET = 89;
const GAM_DMG_BONUS_OFFSET = 90;
const GAM_DMG_SIDES_OFFSET = 91;
const GAM_AC_OFFSET = 95;
/** Hit points, primary store. Mirrors `monster.ts`'s `DOK_LAYOUT.hp`. */
const GAM_HP_OFFSET = 40;
/** Hit points, second store — equal to byte 40 in 6 of 6 retail records. See the file doc's null. */
const GAM_HP_MIRROR_OFFSET = 214;

/** `category`@32 value VALIDATED (dok-chrdata-save-format.md §2.3) as non-caster (fighter/thief-type):
 * the only 2 real pregens with this exact code (SIR DRYDEN, LILLITH) both have an all-zero `.WIZ` —
 * every other observed code (0, 1, 2, 5) has real spell data. Mirrors the identically-named local
 * constant in `dokImportContract.test.ts`. */
export const NONCASTER_CODE = 6;
/** One OBSERVED real caster code (FLAVIUS, a cleric) — used only as "a nonzero code", never as a
 * class-specific write; see {@link classCodeForDokCaster}. */
const OBSERVED_CASTER_CODE = 1;

/** Six ability scores in Gold Box order. */
export interface DokSavedAbilities {
  str: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}

/** A character read out of a DoK `CHRDATA{n}.GAM` file. */
export interface DokSavedCharacter {
  name: string;
  abilities: DokSavedAbilities;
  /** THAC0 recovered from the inverted store (60 − byte[31]). */
  thac0: number;
  /**
   * Hit points as stored at **byte 40** — the offset `monster.ts`'s `DOK_LAYOUT` names `hp`.
   *
   * New 2026-09-07; this loader decoded the value and dropped it before that. Read the file-level doc
   * comment before using it: byte 40 and {@link hitPointsMirror} are equal in 6 of 6 shipped records
   * and **the evidence does not settle which is the maximum and which the current total**, because
   * every pregen ships undamaged.
   */
  hitPoints: number;
  /**
   * The second hit-point store, at **byte 214**.
   *
   * It is NOT called `currentHitPoints`: the retail `GAME.OVR` write counts (20 at 214 against 8 at
   * 40) lean toward 214 being the mutable one, but no damaged character ships, so nothing in the
   * corpus can distinguish max from current. Equal to {@link hitPoints} in 6 of 6 records. A caller
   * that finds them differing has found the first evidence that would settle it.
   */
  hitPointsMirror: number;
  /**
   * `raw[40] === raw[214]`. True in 6 of 6 shipped pregens.
   *
   * Named after `buckSavedCharacter.ts`'s `hitPointsMirrorAgrees` rather than after this record's
   * offsets: Buck Rogers' 259-byte record stores hit points at 69 and mirrors them at 227, and this
   * project already decided how to surface that. One name across both games means a sweep for records
   * that break their mirror is one grep, not two. (Chosen over the offset-explicit `hitPointsMirror`
   * this field first shipped as, on 2026-09-07, before either name had a consumer outside tests.)
   */
  hitPointsMirrorAgrees: boolean;
  /** Raw class-code-like byte @32 — correlates with caster-vs-not, not resolved to a class name. */
  classCode: number;
  /**
   * Unarmoured-human baseline AC (60 − byte[95]). NOT the character's effective fighting AC —
   * see the file-level doc comment.
   */
  baseArmorClass: number;
  /** Unarmed-strike baseline damage (1d2+0 for every sampled character). NOT equipped-weapon damage. */
  baseDamage: DamageDice;
  /** The full 216-byte record. */
  raw: Uint8Array;
}

/** One carried item read out of a `.JNK` record. */
export interface DokJnkItem {
  /** Index of this record within the file (0-based). */
  index: number;
  /** Item name; DoK bakes the readied `" Yes "`/`" No  "` flag into the leading text. */
  name: string;
  /** Stack/quantity count (0 for non-stackables). Same offset (57) and semantics as CoK's item record. */
  count: number;
  /** Low byte of a stale heap pointer, NOT an item-type id (research doc §3.2) — kept for provenance only. */
  scratch42: number;
  /** The real, usable identity/stat fields (M34.S1) — decoded at offset 0x2e, the SAME 63-byte
   * VOCAB-coded item-instance layout `monsterSideTables.ts` already decodes for `MON{n}ITM.DAX`.
   * NOT `scratch42`'s offset (42) — see the file doc's `.JNK` section. */
  item: MonsterItem;
  /** The full 63-byte record. */
  raw: Uint8Array;
}

/** One `.EFF` active-effect record — byte-identical to a `MON*SPC.DAX` affect record. */
export type DokEffect = MonsterAffect;

function readPrefixedName(raw: Uint8Array, max: number): string {
  const len = Math.min(raw[0] ?? 0, max);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = raw[1 + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** True when a blob is the right size and carries a sane name-length byte for a `.GAM` record. */
export function sniffDokSavedCharacter(raw: Uint8Array): boolean {
  return raw.length === DOK_SAVED_CHARACTER_SIZE && raw[0] >= 1 && raw[0] <= GAM_NAME_MAX;
}

/** Decode one 216-byte DoK `CHRDATA{n}.GAM` record. Throws if it is not that size. */
export function decodeDokSavedCharacter(raw: Uint8Array): DokSavedCharacter {
  if (raw.length !== DOK_SAVED_CHARACTER_SIZE) {
    throw new Error(`dokSavedCharacter: expected a ${DOK_SAVED_CHARACTER_SIZE}-byte record, got ${raw.length}`);
  }
  const m = decodeMonsterRecord(raw);
  return {
    name: m.name,
    abilities: { ...m.abilities },
    thac0: m.thac0,
    // `decodeMonsterRecord` has returned this correctly since `DOK_LAYOUT.hp` became 40 (`fa07892`,
    // 2026-08-11); it was decoded and then dropped on the floor here until 2026-09-07.
    hitPoints: m.hitPoints,
    hitPointsMirror: raw[GAM_HP_MIRROR_OFFSET] ?? 0,
    hitPointsMirrorAgrees: (raw[GAM_HP_OFFSET] ?? 0) === (raw[GAM_HP_MIRROR_OFFSET] ?? 0),
    classCode: raw[32] ?? 0,
    baseArmorClass: m.armorClass,
    baseDamage: { ...m.damage },
    raw,
  };
}

/**
 * Map "is this character a caster" to a `.GAM` `classCode` byte for EXPORT — the write-direction
 * counterpart of the `category`@32 read above, with the same evidence tier called out there:
 *  - non-caster → {@link NONCASTER_CODE} (6), VALIDATED both directions (two real pregens carry this
 *    exact code and both have an all-zero `.WIZ`).
 *  - caster → a single fixed OBSERVED nonzero code (FLAVIUS's real code, 1). This is NOT a claim that
 *    code 1 means "cleric" or any other specific class — real DoK casters use at least 4 different
 *    nonzero codes (0, 1, 2, 5) with no confirmed 1:1 class mapping (dok-chrdata-save-format.md §2.3:
 *    codes 1 AND 2 both turned out to be real clerics). Any nonzero code makes `importDokParty.ts`'s
 *    `inferDokClass` take the caster branch (`sc.classCode !== NONCASTER_CODE`), which is genuinely all
 *    this byte controls on import — the cleric/magicUser split itself comes from the `.WIZ` spell vote,
 *    not from this code, so writing a class-specific number here would invent precision the retail data
 *    doesn't have.
 */
export function classCodeForDokCaster(isCaster: boolean): number {
  return isCaster ? OBSERVED_CASTER_CODE : NONCASTER_CODE;
}

/** A Greybox in-session character's `.GAM`-modellable fields, for {@link exportDokSavedCharacter}. Not a
 * `CharacterSheet` import to keep this loader UI/ruleset-shape-agnostic, matching CoK's
 * `ExportCharacterInput` (`savedCharacter.ts`). */
export interface ExportDokCharacterInput {
  name: string;
  abilities: DokSavedAbilities;
  thac0: number;
  /**
   * Hit points, written to BOTH byte 40 and byte 214 — the arrangement all six retail records use.
   * Optional; omitted leaves both bytes 0, which is what this exporter did unconditionally before
   * 2026-09-07. ONE value is written to both stores because a synthesized character is undamaged, the
   * same reasoning by which abilities are written with current === max — and because the corpus does
   * not say which store is the maximum, so writing two different numbers would be inventing an answer
   * to an open question rather than declining to.
   */
  hitPoints?: number;
  /** Whether the character is a spellcaster — see {@link classCodeForDokCaster} for why this is a
   * boolean, not a specific class id. */
  isCaster: boolean;
}

/**
 * Synthesize a full 216-byte DoK `CHRDATA{n}.GAM` record from a Greybox in-session character — the DoK
 * sibling of `savedCharacter.ts`'s `exportSavedCharacter`. See this file's header doc comment ("Export")
 * for exactly which fields are written and why the rest (hit points, a specific caster class, bytes
 * 96..215) are honestly left out rather than invented.
 *
 * `decodeDokSavedCharacter(exportDokSavedCharacter(input))` reproduces `input`'s
 * name/abilities/thac0/hitPoints, and reports `classCode === NONCASTER_CODE` iff `!input.isCaster`
 * (the one caster/non-caster fact the byte is validated to carry).
 */
export function exportDokSavedCharacter(input: ExportDokCharacterInput): Uint8Array {
  const out = new Uint8Array(DOK_SAVED_CHARACTER_SIZE);

  const name = input.name.slice(0, GAM_NAME_MAX);
  out[0] = name.length;
  for (let i = 0; i < GAM_NAME_MAX; i++) out[1 + i] = i < name.length ? name.charCodeAt(i) & 0x7f : 0;

  // Abilities: (current, max) pairs, current === max for a freshly-synthesized character (no stat drain
  // to represent) — same default CoK's exportSavedCharacter uses.
  const ab = [
    input.abilities.str,
    input.abilities.int,
    input.abilities.wis,
    input.abilities.dex,
    input.abilities.con,
    input.abilities.cha,
  ];
  ab.forEach((v, slot) => {
    out[GAM_ABILITY_OFFSET + slot * 2] = v & 0xff;
    out[GAM_ABILITY_OFFSET + slot * 2 + 1] = v & 0xff;
  });

  out[GAM_THAC0_OFFSET] = (TO_HIT_BASE - input.thac0) & 0xff;
  out[GAM_CLASS_OFFSET] = classCodeForDokCaster(input.isCaster) & 0xff;
  out[GAM_ICON_SIZE_OFFSET] = 1; // CONSTANT across all 6 real pregens — PCs are always 1x1 (§2.1)
  out[GAM_MORALE_OFFSET] = 0; // CONSTANT — control_morale, PCs never rout (§2.1)
  out[GAM_DMG_COUNT_OFFSET] = 1; // 1d2+0 unarmoured-strike baseline, CONSTANT across all 6 (§2.2)
  out[GAM_DMG_BONUS_OFFSET] = 0;
  out[GAM_DMG_SIDES_OFFSET] = 2;
  out[GAM_AC_OFFSET] = TO_HIT_BASE - 10; // AC 10 unarmoured baseline, CONSTANT across all 6 (§2.2)
  if (input.hitPoints !== undefined) {
    const hp = input.hitPoints & 0xff;
    out[GAM_HP_OFFSET] = hp;
    out[GAM_HP_MIRROR_OFFSET] = hp; // both stores, as all 6 retail records do
  }
  // The rest of bytes 96..215 (stale far-pointers, an unidentified paired field, §2.4) stays 0.

  return out;
}

/** A slice looks like a `.JNK` item record: the right size with a sane name-length byte. */
export function sniffDokJnkRecord(raw: Uint8Array): boolean {
  return raw.length >= DOK_JNK_RECORD_SIZE && raw[0] >= 1 && raw[0] <= JNK_NAME_MAX;
}

/** Decode one 63-byte `.JNK` inventory record. */
export function decodeDokJnkRecord(raw: Uint8Array, index = -1): DokJnkItem {
  if (raw.length < DOK_JNK_RECORD_SIZE) {
    throw new Error(`dokJnk: record too small (${raw.length} bytes, need ${DOK_JNK_RECORD_SIZE})`);
  }
  const sliced = raw.slice(0, DOK_JNK_RECORD_SIZE);
  return {
    index,
    name: readPrefixedName(raw, JNK_NAME_MAX),
    count: raw[57] ?? 0,
    scratch42: raw[42] ?? 0,
    item: decodeMonsterItem(sliced),
    raw: sliced,
  };
}

/** Decode a whole `.JNK` file (an exact multiple of 63 bytes) into its carried items, in file order. */
export function decodeDokJnkFile(bytes: Uint8Array): DokJnkItem[] {
  const out: DokJnkItem[] = [];
  for (let off = 0; off + DOK_JNK_RECORD_SIZE <= bytes.length; off += DOK_JNK_RECORD_SIZE) {
    const rec = bytes.subarray(off, off + DOK_JNK_RECORD_SIZE);
    if (!sniffDokJnkRecord(rec)) break;
    out.push(decodeDokJnkRecord(rec, out.length));
  }
  return out;
}

/** Decode a whole `.EFF` file (an exact multiple of 9 bytes; the file is absent when there are no active effects). */
export function decodeDokEffFile(bytes: Uint8Array): DokEffect[] {
  const out: DokEffect[] = [];
  for (let off = 0; off + MON_AFFECT_SIZE <= bytes.length; off += MON_AFFECT_SIZE) {
    out.push(decodeMonsterAffect(bytes.subarray(off, off + MON_AFFECT_SIZE)));
  }
  return out;
}
