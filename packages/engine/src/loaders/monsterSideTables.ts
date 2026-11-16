/**
 * Monster item / special side-tables (E5.M5.1 / Gap G2) — the per-monster **carried-items** and
 * **special-attack/defense (affect)** tables that ride alongside a Gen1 (CoK/DoK) bestiary, so a
 * ported monster keeps its loot and innate specials instead of fighting with default loot/abilities.
 *
 * **Where they live & how they key (verified, COAB-grounded).** A Gen1 game ships, per area `n`:
 *   - `MON{n}CHA.DAX` — the bestiary (one monster per DAX block; the block id IS the monster id).
 *   - `MON{n}ITM.DAX` — the carried-item tables, **keyed by the same block id as the monster**.
 *   - `MON{n}SPC.DAX` — the special/affect tables, **keyed by the same block id as the monster**.
 *
 * This keying + the record layouts are read straight from the COAB clean-room decompile
 * (`coab_extracted/engine/ovr017.cs` `load_mob`, the same engine family):
 *
 *   load_decode_dax(out data, …, monster_id, "MON" + area + "CHA.dax");   // the monster
 *   load_decode_dax(out data, …, monster_id, "MON" + area + "SPC.dax");   // → Affect[] (9 bytes each)
 *       for (offset = 0; offset < size; offset += 9)  player.affects.Add(new Affect(data, offset));
 *   load_decode_dax(out data, …, monster_id, "MON" + area + "ITM.dax");   // → Item[]  (0x3F bytes each)
 *       for (offset = 0; offset < size; offset += Item.StructSize)  player.items.Add(new Item(data, offset));
 *
 * So both files are looked up by the monster's id (not by file order), and each block is a flat array
 * of fixed-size records. Verified on real bytes: every `MON*SPC` block is an exact multiple of 9 and
 * every `MON*ITM` block an exact multiple of 63 across CoK (areas 1–3) and DoK (area 1).
 *
 * **Affect record (9 bytes — COAB `Classes/Affect.cs`):**
 *   0    u8   type        (the COAB `Affects` enum — e.g. 0x43 = thri_kreen_paralyze)
 *   1..2 u16  minutes     (duration; 0 for an innate/permanent monster ability)
 *   3    u8   affect_data (per-affect parameter; 0xff is the common "innate" marker)
 *   4    u8   callAffectTable (bool — invoke the affect jump-list)
 *   5..8      4 bytes the engine ignores on load (runtime/scratch affect fields), preserved verbatim
 *
 * **Item record (63 = 0x3F bytes — COAB `Classes/Item.cs`).** This is the engine's internal item-
 * instance struct (the SAME 63-byte record the CoK `ITEM{n}.DAX` archives use — see
 * {@link ./dqkItem.js portCokItemToDqk}). For a monster's carried item only the identity/stat fields
 * matter; the leading 0..0x29 "name" region is editor/runtime scratch (often raw garbage in MON*ITM):
 *   0x2e u8   base-type id (ItemType)          0x37..38 u16 weight
 *   0x2f u8   namenum1                          0x39    u8  count
 *   0x30 u8   namenum2                          0x3a..3b u16 value
 *   0x31 u8   namenum3                          0x3c    u8  affect_1
 *   0x32 i8   plus                              0x3d    u8  affect_2
 *   0x33 u8   plus_save                         0x3e    u8  affect_3
 *   0x34 bool readied   0x35 hidden_names_flag  0x36 cursed
 *
 * **Carry semantics (the port).** These side-tables are id-keyed, exactly the way the original engine
 * loads them, so they are merged across disks **by monster id** and carried on the build's game-data
 * output keyed by monster id. They are NOT folded into the DQK 108-byte `MONCHA.GLB` record (which has
 * no item/affect fields); preserving them as id-keyed structures is the faithful representation of the
 * original two-file design.
 *
 * **Savage Frontier delta.** Gateway retains the 63-byte ITM and 9-byte SPC shapes above. Treasures
 * retains 9-byte SPC records but stores only the 17-byte field tail that retail expands into runtime
 * item offsets 0x2E..0x3E; archive block ids still key directly to MON1CHA. Pass its profile id to
 * {@link decodeMonsterItmArchive} to select that decoder.
 *
 * **`MON{n}WIZ.DAX` — monster spellbook/memorization side-table (DoK only, decompile-mon1wiz, RESOLVED
 * for the part that matters).** COAB's `load_mob` does NOT reference this file (no `"WIZ"` load call
 * exists anywhere in the decompile), so there is no COAB struct to cite directly. The layout below is
 * reverse-engineered empirically from the real `Death Knights of Krynn/MON1WIZ.DAX` (14 blocks, ids
 * `{14,20,21,40,49,50,66,67,68,69,70,71,74,97}` — all confirmed monster ids, all with `raw_size===220`)
 * cross-checked against the real player-save companion files `Death Knights of Krynn/SAVE/CHRDATA*.WIZ`
 * (also exactly **220 bytes each** — same format, reused verbatim for monsters). Full writeup:
 * `docs/engine/research/decompile-mon1wiz.md`.
 *
 *   0x00-0x49  74 bytes  memorized-spell instance list: flat `u8[74]`, each nonzero byte is a DoK
 *              global spell number **1-126** (`hackdocs_extracted/SPELBOOK.TXT`'s numbered table;
 *              high bit set = COAB `SpellList`'s "still learning" flag, `id & 0x7F` the real spell id
 *              — inferred by analogy, never observed set in real data). 0 = empty slot. A repeated
 *              spell number means multiple simultaneously-memorized castings of it (the standard Gold
 *              Box mage-memorization mechanic). VERIFIED: every one of the ~350 nonzero bytes recovered
 *              from all 14 real MON1WIZ.DAX blocks *and* 4 real player `.WIZ` saves resolves to a
 *              correctly-classed spell name in SPELBOOK.TXT's 1-126 table — zero unresolved values.
 *              Monster-editor blocks pack entries from the FRONT (unsorted, as authored); real player
 *              saves pack them from the BACK — right-aligned, ascending — matching COAB
 *              `SpellList.Save`'s fill order (`idx = SpellListSize-1; ...; idx -= 1`).
 *   0x4A-0xAD  100 bytes "known spell" boolean table (one byte per spell, 0/1; index i = spell i+1),
 *              observed only in real player `.WIZ` saves (always all-zero in the 14 monster blocks —
 *              monster templates carry only the instance list above, not a browsable spellbook). Same
 *              SIZE (100) as COAB `Player.spellBook` (`[DataOffset(0x79, ByteArray, 100)]`), suggesting
 *              COAB's static offset is actually backed by this separate file at runtime — a detail no
 *              decompiled overlay's load routine currently shows. INFERRED (size match + semantics
 *              check only), not proven against a COAB struct.
 *   0xAE-0xDB  46 bytes  small-integer sub-table, plausibly per-level memorized-spell counts (one real
 *              player save showed clean clusters `6,4,2,1` and `4,2,2` — a plausible two-class spells-
 *              per-day progression). Always unused in the 14 monster blocks; where nonzero there, the
 *              bytes are uninitialized editor-tool memory carried through unmodified — several are
 *              literally fragments of unrelated Pascal-style UI strings (`"Select log option"`, a
 *              length-prefixed `"Friends"`, `"Quit"`), never valid spell data. UNRESOLVED / not needed
 *              for the monster decoder (monsters never populate this region).
 *
 * Only the first sub-region is meaningful for **monster** loading, so {@link decodeMonsterWizArchive}
 * decodes just that: the per-monster memorized-spell list, in file order, id-keyed exactly like SPC/ITM.
 */
import { readDaxDataBlocks } from './dax.js';
import type { MonsterRecord } from './monster.js';

/** Bytes per monster special/affect record (COAB `Affect.StructSize`). */
export const MON_AFFECT_SIZE = 9;
/** Bytes per monster carried-item record (COAB `Item.StructSize` = 0x3F). */
export const MON_ITEM_SIZE = 63;
/** Treasures compact item tail, copied byte-for-byte into runtime item offsets 0x2E..0x3E. */
export const MON_COMPACT_ITEM_SIZE = 17;

/** Field offsets within the 63-byte COAB item-instance record (shared by MON*ITM and CoK ITEM*.DAX). */
export const ITEM_FIELD = {
  type: 0x2e,
  namenum1: 0x2f,
  namenum2: 0x30,
  namenum3: 0x31,
  plus: 0x32,
  plusSave: 0x33,
  readied: 0x34,
  hiddenNamesFlag: 0x35,
  cursed: 0x36,
  weight: 0x37,
  count: 0x39,
  value: 0x3a,
  affect1: 0x3c,
  affect2: 0x3d,
  affect3: 0x3e,
} as const;

/** One decoded monster special/affect (9-byte record). */
export interface MonsterAffect {
  /** Affect type id (COAB `Affects` enum value). */
  type: number;
  /** Duration in minutes (0 = innate/permanent). */
  minutes: number;
  /** Per-affect parameter byte (0xff is the common innate marker). */
  affectData: number;
  /** Whether the engine invokes the affect jump-list for this affect. */
  callAffectTable: boolean;
  /** The full 9-byte record (the trailing 4 scratch bytes preserved verbatim). */
  raw: Uint8Array;
}

/** One decoded monster carried-item (the identity/stat fields of the 63-byte record). */
export interface MonsterItem {
  /** Source instance layout. */
  format?: 'legacy63' | 'compact17';
  /** Exact runtime `Item.type` at 0x2e (or byte 0 of the compact runtime tail). */
  itemTypeId: number;
  /** Legacy catalogue-lookup identity retained for existing consumers; currently mirrors `itemTypeId`. */
  baseTypeId: number;
  /** VOCAB name codes `[namenum1, namenum2, namenum3]` at 0x2f..0x31. */
  nameCodes: [number, number, number];
  /** Magic bonus (signed, +N) at 0x32. */
  plus: number;
  /** Stack/quantity count at 0x39. */
  count: number;
  /** Value/price (u16 @0x3a). */
  value: number;
  /** Encumbrance/weight (u16 @0x37). */
  weight: number;
  /** Whether the monster has this item readied (0x34). */
  readied: boolean;
  /** Up to three item affect codes `[affect_1, affect_2, affect_3]` at 0x3c..0x3e. */
  affects: [number, number, number];
  /** Compact-instance fields retained when `format === 'compact17'`. */
  compact?: {
    plusSave: number;
    hiddenNamesFlag: number;
    cursed: boolean;
  };
  /** The complete source record (63-byte legacy record or 17-byte compact tail). */
  raw: Uint8Array;
}

/** The item + special tables for ONE monster, keyed externally by the monster's id. */
export interface MonsterSideEntry {
  /** Monster id (the MON{n}CHA / MON{n}ITM / MON{n}SPC shared block id). */
  id: number;
  /** Carried items (may be empty). */
  items: MonsterItem[];
  /** Special/affect entries (may be empty). */
  affects: MonsterAffect[];
}

const u16 = (raw: Uint8Array, o: number): number => (raw[o] ?? 0) | ((raw[o + 1] ?? 0) << 8);
const i8 = (b: number): number => (b > 127 ? b - 256 : b);

/** Decode one 9-byte affect record (COAB `Affect(byte[],offset)`). */
export function decodeMonsterAffect(raw: Uint8Array): MonsterAffect {
  return {
    type: raw[0] ?? 0,
    minutes: u16(raw, 1),
    affectData: raw[3] ?? 0,
    callAffectTable: (raw[4] ?? 0) !== 0,
    raw: raw.slice(0, MON_AFFECT_SIZE),
  };
}

/** Decode one 63-byte carried-item record (COAB `Item(byte[],offset)` identity/stat fields). */
export function decodeMonsterItem(raw: Uint8Array): MonsterItem {
  const itemTypeId = raw[ITEM_FIELD.type] ?? 0;
  return {
    format: 'legacy63',
    itemTypeId,
    baseTypeId: itemTypeId,
    nameCodes: [raw[ITEM_FIELD.namenum1] ?? 0, raw[ITEM_FIELD.namenum2] ?? 0, raw[ITEM_FIELD.namenum3] ?? 0],
    plus: i8(raw[ITEM_FIELD.plus] ?? 0),
    count: raw[ITEM_FIELD.count] ?? 0,
    value: u16(raw, ITEM_FIELD.value),
    weight: u16(raw, ITEM_FIELD.weight),
    readied: (raw[ITEM_FIELD.readied] ?? 0) !== 0,
    affects: [raw[ITEM_FIELD.affect1] ?? 0, raw[ITEM_FIELD.affect2] ?? 0, raw[ITEM_FIELD.affect3] ?? 0],
    raw: raw.slice(0, MON_ITEM_SIZE),
  };
}

/** Decode Treasures' compact serialization of the canonical runtime item tail. */
export function decodeCompactMonsterItem(raw: Uint8Array): MonsterItem {
  if (raw.length < MON_COMPACT_ITEM_SIZE) {
    throw new Error(`compact monster item: record too small (${raw.length} bytes)`);
  }
  return {
    format: 'compact17',
    itemTypeId: raw[0],
    baseTypeId: raw[0],
    nameCodes: [raw[1], raw[2], raw[3]],
    plus: i8(raw[4]),
    count: raw[11],
    value: u16(raw, 12),
    weight: u16(raw, 9),
    readied: raw[6] !== 0,
    affects: [raw[14], raw[15], raw[16]],
    compact: {
      plusSave: raw[5],
      hiddenNamesFlag: raw[7],
      cursed: raw[8] !== 0,
    },
    raw: raw.slice(0, MON_COMPACT_ITEM_SIZE),
  };
}

/** Read a DAX archive's blocks, tolerating an absent/unparseable source (→ no blocks). */
function safeBlocks(bytes: Uint8Array): ReturnType<typeof readDaxDataBlocks> {
  try {
    return readDaxDataBlocks(bytes);
  } catch {
    return [];
  }
}

/**
 * Parse a `MON{n}SPC.DAX` archive into id → affects. Each block is a flat array of 9-byte records keyed
 * by the monster's block id (COAB `load_mob`). A block whose length is not a multiple of 9 is skipped
 * (it isn't a special table). Returns a map so the caller can join by monster id.
 */
export function decodeMonsterSpcArchive(bytes: Uint8Array): Map<number, MonsterAffect[]> {
  const out = new Map<number, MonsterAffect[]>();
  for (const block of safeBlocks(bytes)) {
    const raw = block.raw;
    if (raw.length === 0 || raw.length % MON_AFFECT_SIZE !== 0) continue;
    const affects: MonsterAffect[] = [];
    for (let off = 0; off + MON_AFFECT_SIZE <= raw.length; off += MON_AFFECT_SIZE) {
      affects.push(decodeMonsterAffect(raw.subarray(off, off + MON_AFFECT_SIZE)));
    }
    out.set(block.blockId, affects);
  }
  return out;
}

/**
 * COAB `Affects.regen_3_hp` (0x62) — the innate "heal 3 HP at the start of every combat round, capped
 * at max HP" special (`ovr013.AffectRegen3Hp`, ticked once per round for every team member by
 * `BattleRoundChecks`'s `CheckType.Type_19` sweep, `ovr009.cs:371`/`ovr024.cs:351`). Real-bytes check
 * (M23.S2 probe over CoK areas 1-3 + DoK area 1): every `MON{n}SPC.DAX` record observed has
 * `minutes=0, affectData=0xff, callAffectTable=false` — i.e. every affect in these files is the
 * innate/permanent kind, never a dynamically-triggered spell-like jump-table call. `regen_3_hp` is the
 * most common regen-family value (8 of 169 real monster specials) and the only one whose effect is a
 * single flat number with no extra state (the `troll_regen`/`TrollRegen` pair additionally gate on the
 * round's damage type, which this engine's tactical layer doesn't track — out of scope here).
 */
export const REGEN_3_HP_AFFECT = 0x62;

/**
 * Join each monster's `MON{n}SPC.DAX` side-table onto its `MonsterRecord`, setting
 * {@link MonsterRecord.regenPerRound} = 3 for any monster whose affects include
 * {@link REGEN_3_HP_AFFECT}. Monsters without the affect (and monsters with no side-table entry) are
 * returned unchanged. Keyed by `blockId`, matching the `MON{n}CHA`/`MON{n}SPC` shared id (COAB
 * `load_mob`), same join the item/affect merge already uses.
 */
export function applyRegenAffect(records: MonsterRecord[], spc: Map<number, MonsterAffect[]>): MonsterRecord[] {
  return records.map((r) => {
    const affects = spc.get(r.blockId);
    return affects?.some((a) => a.type === REGEN_3_HP_AFFECT) ? { ...r, regenPerRound: 3 } : r;
  });
}

/**
 * COAB `Affects.half_damage` (0x51) — the innate "halve all incoming weapon damage" special
 * (`ovr013.half_damage`: `gbl.damage /= 2`), swept on every melee/missile hit via `BattleRoundChecks`'s
 * `CheckType.Type_5` list (`ovr024.cs:181-198`), invoked from the generic weapon-damage routine
 * (`ovr014.cs:84-102 sub_3E192`) right after any backstab multiply and before the target's HP is
 * reduced. Real-bytes check (M24 audit): found only in `Death Knights of Krynn/MON1SPC.DAX`, on the
 * VAMPIRE family (ids 19/20/21) — `minutes=0, affectData=0xff, callAffectTable=false`, the same
 * innate/permanent shape {@link REGEN_3_HP_AFFECT} has. Unconditional (no "non-magical weapon" gate) —
 * COAB's own one-liner has no such check, so halving *all* damage is the faithful-to-the-decompile
 * reading, not a narrowed one.
 */
export const HALF_DAMAGE_AFFECT = 0x51;

/**
 * Join each monster's `MON{n}SPC.DAX` side-table onto its `MonsterRecord`, setting
 * {@link MonsterRecord.halfDamage} = true for any monster whose affects include
 * {@link HALF_DAMAGE_AFFECT}. Same shape as {@link applyRegenAffect}.
 */
export function applyHalfDamageAffect(records: MonsterRecord[], spc: Map<number, MonsterAffect[]>): MonsterRecord[] {
  return records.map((r) => {
    const affects = spc.get(r.blockId);
    return affects?.some((a) => a.type === HALF_DAMAGE_AFFECT) ? { ...r, halfDamage: true } : r;
  });
}

/**
 * COAB `Affects.con_saving_bonus` (0x61, `ovr013.cs con_saving_bonus`/`sub_3BE42`) — a flat Constitution-
 * band bonus added to the *roll* (not the target) on any Spell or RodStaffWand saving throw, swept by
 * `CheckAffectsEffect` from inside `RollSavingThrow` (`ovr024.cs:554-583`) — the exact same roll M27
 * wired `MonsterRecord.savingThrows.spell` to feed the target side of. Real-bytes check (M28 audit): every
 * carrier found across CoK areas 1-3 + DoK area 1 (the undead family — GHOUL/SKELETON/ZOMBIE/GHAST/
 * SKELETAL KNIGHT/SKELETAL DRAGON/DREAD WOLF) has Con 10, landing in the 7-10 band. `minutes=0,
 * affectData=0xff, callAffectTable=false` — innate/permanent, same shape as every other `MON{n}SPC.DAX`
 * affect wired so far.
 */
export const CON_SAVING_BONUS_AFFECT = 0x61;

/**
 * COAB `con_saving_bonus`'s own Con-band table, transcribed verbatim (`ovr013.cs:1207-1236`). Deliberately
 * NOT the same function as `addnd1e/recalc.ts`'s `conPoisonSaveBonus` — that's a different COAB source
 * (`SaveVersePoisonBonus`, `ovr026.cs:377`) for a different save column (`paralyzePoisonDeath`, applied
 * once at chargen), whose own band table is open-ended above Con 18 (always +5). This table shares every
 * band boundary in the 3-20 range but closes at 20 (returns 0 above it), matching COAB's own bounded
 * `if`-chain exactly — no real monster observed carries Con > 20, so this never bites in practice today,
 * but reusing the sibling verbatim would silently import the wrong tail if one ever did.
 */
export function conSpellSaveBonus(con: number): number {
  if (con >= 4 && con <= 6) return 1;
  if (con >= 7 && con <= 10) return 2;
  if (con >= 11 && con <= 13) return 3;
  if (con >= 14 && con <= 17) return 4;
  if (con >= 18 && con <= 20) return 5;
  return 0;
}

/**
 * Join each monster's `MON{n}SPC.DAX` side-table onto its `MonsterRecord`, setting
 * {@link MonsterRecord.conSaveBonus} from {@link conSpellSaveBonus} of the record's own decoded
 * `abilities.con`, for any monster whose affects include {@link CON_SAVING_BONUS_AFFECT}. A monster
 * with the affect but a Con score outside every band (e.g. below 4) is left unchanged — same
 * "undefined ⇒ no bonus" convention as {@link applyRegenAffect}/{@link applyHalfDamageAffect}.
 */
export function applyConSavingBonus(records: MonsterRecord[], spc: Map<number, MonsterAffect[]>): MonsterRecord[] {
  return records.map((r) => {
    const affects = spc.get(r.blockId);
    if (!affects?.some((a) => a.type === CON_SAVING_BONUS_AFFECT)) return r;
    const bonus = conSpellSaveBonus(r.abilities.con);
    return bonus > 0 ? { ...r, conSaveBonus: bonus } : r;
  });
}

export const STINKING_CLOUD_AFFECT = 0x1e;
export const HELPLESS_AFFECT = 0x1f;
export const ANIMATE_DEAD_AFFECT = 0x20;
export const MINOR_GLOBE_OF_INVULNERABILITY_AFFECT = 0x3f;
export const CLOUD_PROTECT_6F_AFFECT = 0x6f;
export const CLOUD_PROTECT_7D_AFFECT = 0x7d;
export const PROTECT_MAGIC_AFFECT = 0x81;
export const CLOUD_PROTECT_85_AFFECT = 0x85;

const NOXIOUS_ENTRY_IMMUNITY_AFFECTS = new Set<number>([
  ANIMATE_DEAD_AFFECT,
  STINKING_CLOUD_AFFECT,
  CLOUD_PROTECT_6F_AFFECT,
  CLOUD_PROTECT_7D_AFFECT,
  PROTECT_MAGIC_AFFECT,
  MINOR_GLOBE_OF_INVULNERABILITY_AFFECT,
]);

const NOXIOUS_EXPOSURE_IMMUNITY_AFFECTS = new Set<number>([
  HELPLESS_AFFECT,
  ANIMATE_DEAD_AFFECT,
  CLOUD_PROTECT_6F_AFFECT,
  CLOUD_PROTECT_7D_AFFECT,
]);

const POISON_ENTRY_IMMUNITY_AFFECTS = new Set<number>([
  PROTECT_MAGIC_AFFECT,
  CLOUD_PROTECT_6F_AFFECT,
  CLOUD_PROTECT_85_AFFECT,
  CLOUD_PROTECT_7D_AFFECT,
]);

/**
 * Join CoAB cloud-protection affect gates from `MON{n}SPC.DAX` onto monster records. This mirrors the
 * source split instead of collapsing everything into one immunity:
 *
 * - `ovr010.cs:323-335` noxious movement-entry gate:
 *   `animate_dead`, `stinking_cloud`, `affect_6f`, `affect_7d`, `protect_magic`, `minor_globe`.
 * - `ovr024.cs:412-416` noxious post-entry exposure gate:
 *   `helpless`, `animate_dead`, `affect_6f`, `affect_7d`.
 * - `ovr010.cs:340-348` poisonous movement-entry gate:
 *   `protect_magic`, `affect_6f`, `affect_85`, `affect_7d`.
 *
 * `ovr024.in_poison_cloud` has no equivalent MON*SPC affect gate for poisonous post-entry exposure in
 * the recovered source, so `poisonCloudExposureImmune` is deliberately left unset here.
 */
export function applyCloudProtectionAffects(records: MonsterRecord[], spc: Map<number, MonsterAffect[]>): MonsterRecord[] {
  return records.map((r) => {
    const affects = spc.get(r.blockId);
    if (!affects?.length) return r;
    const types = new Set(affects.map((a) => a.type));
    const noxiousCloudEntryImmune = Array.from(types).some((t) => NOXIOUS_ENTRY_IMMUNITY_AFFECTS.has(t));
    const noxiousCloudExposureImmune = Array.from(types).some((t) => NOXIOUS_EXPOSURE_IMMUNITY_AFFECTS.has(t));
    const poisonCloudEntryImmune = Array.from(types).some((t) => POISON_ENTRY_IMMUNITY_AFFECTS.has(t));
    if (!noxiousCloudEntryImmune && !noxiousCloudExposureImmune && !poisonCloudEntryImmune) return r;
    return {
      ...r,
      noxiousCloudEntryImmune: noxiousCloudEntryImmune || undefined,
      noxiousCloudExposureImmune: noxiousCloudExposureImmune || undefined,
      poisonCloudEntryImmune: poisonCloudEntryImmune || undefined,
    };
  });
}

/**
 * Parse a `MON{n}ITM.DAX` archive into id → items. The default is the 63-byte COAB/Gateway shape;
 * Treasures' profile selects compact 17-byte records. Both remain keyed by the MON{n}CHA block id.
 */
export function decodeMonsterItmArchive(bytes: Uint8Array, profileId?: string): Map<number, MonsterItem[]> {
  const compact = profileId === 'treasures-of-the-savage-frontier';
  const recordSize = compact ? MON_COMPACT_ITEM_SIZE : MON_ITEM_SIZE;
  const out = new Map<number, MonsterItem[]>();
  for (const block of safeBlocks(bytes)) {
    const raw = block.raw;
    if (raw.length === 0 || raw.length % recordSize !== 0) continue;
    const items: MonsterItem[] = [];
    for (let off = 0; off + recordSize <= raw.length; off += recordSize) {
      const record = raw.subarray(off, off + recordSize);
      items.push(compact ? decodeCompactMonsterItem(record) : decodeMonsterItem(record));
    }
    out.set(block.blockId, items);
  }
  return out;
}

/**
 * Join each monster's `MON{n}ITM.DAX` carried-item table onto its `MonsterRecord`, setting
 * {@link MonsterRecord.itemPluses} to the full `plus` array of every carried item (COAB `Item.plus`,
 * the same magic-bonus byte `calc_battle_exp` sums as `Σ item.plus·400` for the post-combat XP award —
 * `ovr006.cs:93-96`). Stores zero/negative pluses too (mirrors COAB collecting a defeated monster's
 * *entire* carried-item list unconditionally, `readied` or not, before the `plus > 0` filter is
 * applied at the summing step in `calcBattleExp`) — this join's only job is decode + attach; the
 * ruleset math does the filtering. Monsters without a `MON{n}ITM.DAX` entry are returned unchanged.
 * Same id-keying (`blockId`) as {@link applyRegenAffect}/{@link applyHalfDamageAffect}.
 */
export function applyItemPluses(records: MonsterRecord[], itm: Map<number, MonsterItem[]>): MonsterRecord[] {
  return records.map((r) => {
    const items = itm.get(r.blockId);
    return items?.length ? { ...r, itemPluses: items.map((i) => i.plus) } : r;
  });
}

/**
 * Join each monster's `MON{n}ITM.DAX` carried-item table onto its `MonsterRecord`, setting
 * {@link MonsterRecord.carriedItems} to every carried item's exact runtime type plus legacy
 * `{baseTypeId, count, value}` identity, unfiltered —
 * the post-combat loot-table sibling to {@link applyItemPluses} (M26.S1's XP-tally consumer of the same
 * decode), keyed on identity/count instead of `.plus`. Same "decode dumb, let the consumer filter"
 * layering: whether a `baseTypeId` resolves to a known catalogue entry is `rollTreasure`'s job
 * (`items/treasure.ts`), not this join's. `value` (M30.S1) is carried too — 0 (the common case) maps to
 * `undefined`, "no recorded value", so the shop's real sell formula can fall back to its own catalogue
 * price without a foe-side check. Monsters without a `MON{n}ITM.DAX` entry are returned unchanged. Same
 * id-keying (`blockId`) as {@link applyItemPluses}.
 */
export function applyCarriedItems(records: MonsterRecord[], itm: Map<number, MonsterItem[]>): MonsterRecord[] {
  return records.map((r) => {
    const items = itm.get(r.blockId);
    return items?.length
      ? {
          ...r,
          carriedItems: items.map((i) => ({
            itemTypeId: i.itemTypeId,
            baseTypeId: i.baseTypeId,
            count: i.count,
            value: i.value > 0 ? i.value : undefined,
          })),
        }
      : r;
  });
}

/**
 * Join each monster's `MON{n}WIZ.DAX` memorized-spell list onto its `MonsterRecord`, setting
 * {@link MonsterRecord.preparedSpellIds} to the raw DoK spell numbers (1-126), unfiltered — including
 * duplicates and ids with no modelled tactical-combat geometry. Same "decode dumb, let the consumer
 * filter" layering as {@link applyItemPluses}/{@link applyCarriedItems}: whether an id maps to this
 * engine's own spell catalogue is the combat-assembly crosswalk's job, not this join's. Monsters
 * without a `MON{n}WIZ.DAX` entry (most of the bestiary — only casters get one) are returned unchanged.
 * Same id-keying (`blockId`) as {@link applyItemPluses}.
 */
export function applyPreparedSpellIds(records: MonsterRecord[], wiz: Map<number, MonsterWizEntry>): MonsterRecord[] {
  return records.map((r) => {
    const entry = wiz.get(r.blockId);
    return entry?.spells.length ? { ...r, preparedSpellIds: entry.spells.map((s) => s.spellId) } : r;
  });
}

/**
 * Merge a per-disk set of `MON{n}ITM.DAX` + `MON{n}SPC.DAX` archives into one id-keyed side-table set,
 * for the multi-disk port (Gap G2). The two arrays are independent per-disk lists; each disk's tables
 * are unioned by monster id. As with the area-scoped bestiary, the same monster id on multiple disks
 * carries the same records (the side-tables are part of the shared bestiary slot), so the **last disk
 * wins** for a duplicate id — deterministic and faithful to the original area-local load. The result is
 * sorted by id; a monster with neither items nor affects produces no entry.
 */
export function mergeMonsterSideTables(itm: Uint8Array[], spc: Uint8Array[]): MonsterSideEntry[] {
  const items = new Map<number, MonsterItem[]>();
  const affects = new Map<number, MonsterAffect[]>();
  for (const a of itm) for (const [id, list] of decodeMonsterItmArchive(a)) items.set(id, list);
  for (const a of spc) for (const [id, list] of decodeMonsterSpcArchive(a)) affects.set(id, list);

  const ids = new Set<number>([...items.keys(), ...affects.keys()]);
  return [...ids]
    .sort((x, y) => x - y)
    .map((id) => ({ id, items: items.get(id) ?? [], affects: affects.get(id) ?? [] }));
}

/**
 * Merge a per-disk set of `MON{n}WIZ.DAX` archives into one id-keyed memorized-spell table, for the
 * multi-disk port (the DoK M4 build-audit gap 3 — `cok-content-port-plan.md` §9). Same merge semantics
 * as {@link mergeMonsterSideTables}: archives are walked in disk order and the **last disk wins** for a
 * duplicate monster id (the side-tables are part of the shared bestiary slot). In practice DoK ships a
 * single `MON1WIZ.DAX` (14 caster blocks) and CoK ships none, so the merge is trivial today — but the
 * shape matches ITM/SPC so a future multi-WIZ game needs no new code.
 */
export function mergeMonsterWizTables(wiz: Uint8Array[]): Map<number, MonsterWizEntry> {
  const out = new Map<number, MonsterWizEntry>();
  for (const a of wiz) for (const [id, entry] of decodeMonsterWizArchive(a)) out.set(id, entry);
  return out;
}

/** Bytes per `MON{n}WIZ.DAX` / player `.WIZ` record (verified: every real block/save is exactly this size). */
export const MON_WIZ_RECORD_SIZE = 220;
/**
 * Bytes occupied by the memorized-spell instance list (the only sub-region monster templates use).
 * See the format writeup in this file's header doc comment and `docs/engine/research/decompile-mon1wiz.md`.
 */
export const MON_WIZ_SPELL_LIST_SIZE = 74;
/** High bit of a WIZ spell-list byte — COAB `SpellList`'s "still learning" flag (inferred by analogy; see doc). */
const MON_WIZ_LEARNING_BIT = 0x80;

/** One memorized-spell slot from a WIZ spell-list byte. */
export interface MonsterWizSpell {
  /** Global DoK spell number, 1-126 (`hackdocs_extracted/SPELBOOK.TXT`). */
  spellId: number;
  /** Whether the "still learning" high bit was set on this byte (never observed set in real data). */
  learning: boolean;
}

/** The decoded memorized-spell list for one caster monster (or player-save character). */
export interface MonsterWizEntry {
  /** Memorized spell slots in file order (duplicates = multiple simultaneous castings of the same spell). */
  spells: MonsterWizSpell[];
  /** The full 220-byte record, verbatim. */
  raw: Uint8Array;
}

/**
 * Decode one 220-byte WIZ record's memorized-spell list (the first 74 bytes; the remaining 146 bytes are
 * either player-save-only sub-tables or, for monster templates, unused/uninitialized — see the file's
 * header doc comment). A record shorter than {@link MON_WIZ_SPELL_LIST_SIZE} is read to its actual length.
 */
export function decodeMonsterWizRecord(raw: Uint8Array): MonsterWizEntry {
  const spells: MonsterWizSpell[] = [];
  const n = Math.min(MON_WIZ_SPELL_LIST_SIZE, raw.length);
  for (let i = 0; i < n; i++) {
    const b = raw[i] ?? 0;
    if (b === 0) continue;
    spells.push({ spellId: b & ~MON_WIZ_LEARNING_BIT, learning: (b & MON_WIZ_LEARNING_BIT) !== 0 });
  }
  return { spells, raw: raw.slice(0, MON_WIZ_RECORD_SIZE) };
}

/**
 * Encode a 220-byte `.WIZ` record's memorized-spell list — the write-direction counterpart of
 * {@link decodeMonsterWizRecord}, scoped to ONLY the CONFIRMED sub-region (2026-07-16, BUILD-QUEUE
 * P2.4 "original save import/export" — DoK half): `dok-chrdata-save-format.md` §4.1 confirms, via a
 * real before/after level-up byte diff, that a real PLAYER `.WIZ`'s memorized-spell-instance list is
 * right-justified (zero-padded on the left) within the 74-byte window and its values appear in
 * ascending order — as opposed to monster-editor blocks, which pack unsorted from the front. This
 * writes exactly that: `ids` sorted ascending, right-justified into offsets
 * `[MON_WIZ_SPELL_LIST_SIZE - ids.length, MON_WIZ_SPELL_LIST_SIZE)`, zero elsewhere.
 *
 * Bytes 74..219 — the "known spell" boolean table, the per-level-count sub-table, and the still-open
 * 180-219 tail (§4.2 of the research doc: exact indexing unresolved, part of it looks class-static) —
 * are deliberately left `0`. This is a genuine scope limit, not an oversight: writing those regions
 * would require inventing an encoding this project has not verified. `decodeMonsterWizRecord` never
 * reads them for the monster-template case, and the CONFIRMED region alone is enough to drive
 * `classVoteFromDokIds`/`memorizationFromDokIds` (`ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`),
 * which is this function's only intended consumer.
 *
 * Throws if `ids.length` exceeds {@link MON_WIZ_SPELL_LIST_SIZE} (the fixed-size buffer would overflow
 * into the unresolved tail) — the same "don't invent, refuse" stance `items/dokGearCrosswalk.ts`'s
 * `exportDokJnkFile` takes for an unsupported item.
 */
export function exportMonsterWizSpellList(ids: readonly number[]): Uint8Array {
  if (ids.length > MON_WIZ_SPELL_LIST_SIZE) {
    throw new Error(
      `exportMonsterWizSpellList: ${ids.length} ids exceeds the ${MON_WIZ_SPELL_LIST_SIZE}-byte memorized-spell-list window`,
    );
  }
  const out = new Uint8Array(MON_WIZ_RECORD_SIZE);
  const sorted = [...ids].sort((a, b) => a - b);
  const start = MON_WIZ_SPELL_LIST_SIZE - sorted.length;
  sorted.forEach((id, i) => { out[start + i] = id & 0xff; });
  return out;
}

/**
 * Parse a `MON{n}WIZ.DAX` archive into id → memorized-spell list. Each block is one monster's 220-byte
 * WIZ record, keyed by the monster's block id (same id-keying as SPC/ITM, per `decodeMonsterSpcArchive`'s
 * doc). A block whose length is not a multiple of {@link MON_WIZ_RECORD_SIZE} is skipped (it isn't a WIZ
 * table). Only caster monsters get a block at all — DoK area 1 ships 14 of ~64 monsters.
 */
export function decodeMonsterWizArchive(bytes: Uint8Array): Map<number, MonsterWizEntry> {
  const out = new Map<number, MonsterWizEntry>();
  for (const block of safeBlocks(bytes)) {
    const raw = block.raw;
    if (raw.length === 0 || raw.length % MON_WIZ_RECORD_SIZE !== 0) continue;
    out.set(block.blockId, decodeMonsterWizRecord(raw.subarray(0, MON_WIZ_RECORD_SIZE)));
  }
  return out;
}
