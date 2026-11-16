/**
 * DQK (Gen2) monster loader — `MONCHA.GLB` (Phase C, C4.2).
 *
 * The Dark Queen of Krynn ships its bestiary in `MONCHA.GLB` (**MON**sters + **CHA**racters), a flat
 * HLIB **DATA** library (`magic=1`): member[0] is an id table (`uint16 count`, then
 * `count × {uint16 areaId, uint16 memberIndex}` — same shape as `ECL.GLB`/`GEO.GLB`), and
 * members[1..N] are individual creature records. Each record member opens with a **2-byte big-endian
 * uncompressed length** ({@link DQK_MEMBER_HEADER}); the **MONCHA run-length variant**
 * ({@link monchaRLE} — the `≤128`-copy / `257−c`-repeat scheme from hackdocs MONSTDAT.TXT) starts at
 * byte 2 and expands to exactly that many bytes.
 *
 * **Decompressed record layout (verified on 98 of 98 shipped members).** Offsets are into the
 * decompressed record, i.e. past the length word. Unlike the Gen1 .CCH-family record
 * (`loaders/monster.ts`, name at offset 1) every field below sits at a **fixed** offset in every
 * member — nothing here is searched for. The stat offsets were located by correlating the decoded
 * records against canonical AD&D values — BLACK PUDDING (AC 6 / HD 10 / 3d8 / THAC0 10, XP 3000) and
 * BORING BEETLE (AC 0 / HD 5 / 5d4 / THAC0 15, XP 270):
 *
 *   0x54     u16  experience-point award (little-endian)
 *   0x58     u8   race: 7 = plain monster, 6 = humanoid, plus 1/4/5 on some named NPCs (5 =
 *                 TASSLEHOFF, a kender). Raw byte distribution over the 98: 7×82, 6×12, 5×2, 4×1, 1×1
 *                 — read *after* the is-monster flag below, which claims 3 of the 82 and 4 of the 12
 *   0x66     u8   is-monster flag: 1 on 87 members, 0 on 11 — the 8 bank-1 named NPCs plus three
 *                 bank-0 records (two GNOMEs and one of the two BALDRICs)
 *   0x68     16   ascii name (NUL-padded, 16-byte field)
 *   0x78     12   6 ability scores, 2 bytes each (current, max) — monsters default to 10s
 *   0x87     u8   THAC0, stored inverted: to-hit-AC0 = 60 − byte           (ability + 15)
 *   0x8b..8f u8×5 saving throws (paralyze/poison/death, petrify, rod, breath, spell) (ability + 19)
 *   0x91     u8   hit-dice count                                           (ability + 25)
 *   0xb5     u8   damage: number of dice                                   (ability + 61)
 *   0xb7     u8   damage: die size                                         (ability + 63)
 *   0xb9     u8   damage: flat bonus (so damage = 0xb5 d 0xb7 + 0xb9)      (ability + 65)
 *   0xbb     u8   armour class, stored inverted: AC = 60 − byte            (ability + 67)
 *   0x19e    u8   count of 5-byte special-ability (affect) entries          (see {@link AFFECT_ENTRY})
 *   0x19f    u8   count of 17-byte carried-item entries
 *   0x1a0         end of the fixed part; the two tail arrays follow — see {@link dqkRecordLength}
 *
 * The `60 − x` inversion for AC/THAC0 is the same engine convention Gen1 uses. HP is not stored in
 * the monster record (the original rolls it from HD), so {@link decodeDqkMonsterRecord} reports the
 * **average** roll, `round(HD × 4.5)`, as a stable hit-point value the combat model can use; the
 * character/NPC framing *does* store HP ({@link decodeNpcRecord}).
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** Everything this header used to say about the record
 * shape was an artefact of decompressing each member from byte 0, which consumed the 2-byte length
 * word as two RLE control bytes and left every record out of phase by a record-dependent amount:
 *
 *  - "a record-type tag at offset 2 (`0x08` = monster)" — there is no type byte. Old offset 2 was
 *    *inside* the length word. Category now comes from `isMonster`@0x66 + `race`@0x58.
 *  - "name field at offset 24 … abilities at 40 … THAC0 55 … AC 107" — the real offsets are those
 *    plus 0x50 (name 0x68, abilities 0x78, THAC0 0x87, AC 0xbb).
 *  - the "Coverage note (honest, C4.2a)" that only a subset decompress cleanly because the library
 *    "interleaves type-8 monster records with type-3 *character* records" — the library interleaves
 *    nothing of the kind, and 98 of 98 members now decompress to their declared length. Full
 *    validated stats went from ~20 members to 86 of 98; record lengths reported as 88…533 (median
 *    321) are really 416…598 (median 436).
 *
 * See docs/engine/research/cok-m4-fidelity-plan.md §29.
 */
import { decodeHlib } from './hlib.js';
import { decodeDqkItemRecord, DQK_ITEM_SIZE, type DqkItemRecord } from './dqkItem.js';
import { monchaRLE } from '../util/rle.js';
import type { SavingThrows } from '../ruleset/types.js';
import type { DamageDice, MonsterAbilities, MonsterCategory, MonsterRecord } from './monster.js';

/** The engine stores AC and THAC0 inverted as (60 − value); recover with this base. */
const TO_HIT_BASE = 60;

/**
 * Every member of `MONCHA.GLB` begins with a **2-byte big-endian uncompressed length**, and the RLE
 * stream starts at byte 2. This is not an inference: DQK's own loader reads it, at canonical
 * `2177:257C` + 0x30 (file `0x3570C`), as
 * `len = (raw[0] << 8) | raw[1]`, copies the payload from `raw + 2`, and passes `len` to the
 * decompressor at `00d7:0a1c` as its bounded expected-output length. Holds for **98 of 98** shipped
 * members. FRUA's `MONST.GLB` carries the same word — what {@link module:frua/monsters} called the
 * `01 C2` "record marker" is simply `0x01C2` = 450 = its fixed record size.
 */
const DQK_MEMBER_HEADER = 2;

/**
 * Verified decompressed-record offset map for a DQK Gen2 monster, anchored past
 * {@link DQK_MEMBER_HEADER}. Every field is at a **fixed** offset in every one of the 98 shipped
 * members — the name at 0x68 in all 98, the ability block at 0x78 — and the stat fields sit at the
 * same {@link ABILITY_DELTA} deltas from the ability block that were always in this table.
 *
 * The previously documented "member-dependent ability offset (measured range 21…300+)" was **our own
 * decoder desyncing**: it decompressed from byte 0, so the 2-byte length word above was consumed as
 * RLE control bytes and every record drifted by a record-dependent amount. That is also why
 * {@link reconstructDqkRecord}'s "the inner stat block is still compressed" reading appeared to work —
 * a second RLE pass over the tail happened to re-synchronise the shifted stream. See
 * cok-m4-fidelity-plan.md §29.
 */
const DQK_LAYOUT = {
  race: 0x58,
  isMonster: 0x66,
  xp: 0x54,
  name: 0x68,
  nameMax: 16,
  ability: 0x78,
  thac0: 0x78 + 15,
  saves: 0x78 + 19,
  hitDice: 0x78 + 25,
  dmgNdice: 0x78 + 61,
  dmgDsize: 0x78 + 63,
  dmgBonus: 0x78 + 65,
  ac: 0x78 + 67,
  affectCount: 0x19e,
  itemCount: 0x19f,
  fixedLen: 0x1a0,
} as const;

/** `DQK_LAYOUT.race` = 7 for a plain monster, 6 for a humanoid (BLACK ROGUE, the THENOL ranks,
 * SHARKMAN), and 1/4/5 for the named NPCs (5 = TASSLEHOFF, a kender). */
const RACE_MONSTER = 7;
const RACE_HUMANOID = 6;

/**
 * Widths of the two variable tail arrays a record ends with: `affectCount` 5-byte entries then
 * `itemCount` 17-byte entries, the whole record padded to an even length. Solved against the
 * shipped corpus — see {@link dqkRecordLength}.
 *
 * **The 5-byte entries are special-ability / affect records, not spells** (renamed from
 * `SPELL_ENTRY`/`spellCount` on 2026-08-21). Two independent lines of evidence:
 *
 *  - **Who carries them, and who does not.** 80 of the 98 members have at least one. The largest
 *    counts are **undead, not casters**: VAMPIRE CLERIC 10, VAMPIRE MAGE 10, MUMMY 9, VAMPIRE 7,
 *    VAMPIRE THIEF 7, SKEL WARRIOR 6, SPECTRAL MINION 5, LICH 5. A MUMMY casts nothing but has
 *    nine special abilities (undead immunities, fear aura, mummy rot, hit-only-by-magic, …); a
 *    VAMPIRE casts nothing but has energy drain, charm gaze, gaseous form, regeneration. The 18
 *    members carrying **zero** are the plain physical monsters and plain human fighters —
 *    BORING BEETLE, HUGE BAT, HYDRA, ETTIN, MINOTAUR, MINOTAUR CHAMP, GIANT TROLL, HUGE
 *    CROCODILE, SHARKMAN, SIVAK DRACONIAN, THENOL WARRIOR/WARLORD/FANATIC, BLACK ROGUE.
 *
 *    This also *explains* the observation that first suggested "spells" (recorded in
 *    `cok-m4-fidelity-plan.md` §29.3): the wizards do carry large counts — DARK WIZARD 10,
 *    ELGYNORA 9, THENOL WIZARD 6 — but they are not the top of the list, and spellcasting is
 *    itself registered here as abilities. Under a spell reading, MUMMY with 9 and VAMPIRE with 7
 *    is not explicable; under an ability reading both lists fall out exactly.
 *  - **The field layout.** hackdocs `CCHFORM.TXT` documents the Gold Box "special ability record"
 *    as `{u8 code, u8 zero-for-constant-effect, u16 duration in rounds (0 = permanent), u8 level
 *    of effect (255 = N/A), …}`. Read that way, all 285 shipped entries fit, including both
 *    sentinels: the duration word is 0 in **227 of 285**, the level byte is 255 in **227 of 285**,
 *    and those are the same 226 entries — i.e. the constant effects. The 58 timed effects carry
 *    round-numbered durations (4, 5, 7, 8, 10, 11, 12, 14, 15, 16, 20, 30, 40, 50, 80, 100 rounds)
 *    and mostly plausible caster levels (7..31). The trailing byte is 0 in all 285, as
 *    "set to zero for constant effect" requires.
 *
 * Not everything is explained: four of the 58 timed entries carry level bytes of 108/116/118/155,
 * which no caster-level reading covers. The code byte spans 1..213 with 103 distinct values and is
 * not decoded here — only counted, which is all `dqkRecordLength` needs.
 *
 * `ITEM_ENTRY` is 17 because these are ordinary per-instance `item.dat` records, the same 17-byte
 * record DQK's `DISK1/ITEM.DAT` and DoK's `ITEM0.DAX` both store (see `dqkItem.ts`
 * `DQK_ITEM_SIZE`). They are counted but not yet decoded; routing them through
 * `decodeDqkItemRecord` would give every monster its carried treasure.
 */
const AFFECT_ENTRY = 5;
const ITEM_ENTRY = DQK_ITEM_SIZE;

/**
 * Decode the carried-item array a member's tail ends with: `itemCount`@0x19F ordinary 17-byte
 * `item.dat` records, sitting immediately after the `affectCount` 5-byte ability records.
 *
 * These were counted but never read until 2026-08-21. That they really are `item.dat` records is
 * settled by a structural identity with a clean null: a monster's stock kit **names itself**, so
 * `nameCodes[0]` (byte 3, the primary noun) should equal `baseTypeId` (byte 0). Across the 106
 * entries in DQK's shipped `MONCHA.GLB` that holds **89 times**, against **0, 0, 0 and 1** for the
 * same comparison read at offsets shifted by 1, 2, 3 and 4 bytes (counting only non-zero matches —
 * an unfiltered count scores 44 at shift 2 purely on `0 == 0`). Corroborating: every one of the 106
 * `baseTypeId`s indexes inside the real 128-record `DISK1/ITEMS.DAT` catalogue, and their carry
 * slots span 0..10; `cursed` is 0 in all 106, `charges` in 105, `specialCode` is 0 in 97 and the
 * documented 128 ("special ability") in 7. BLACK ROGUE and THENOL WARLORD both carry base type 18,
 * the Long Sword.
 *
 * The pad byte **trails**: 18 of the 28 item-bearing members have an odd unpadded tail, and reading
 * their records at the count-driven base scores 66 name-identities against **0** at base+1. So the
 * `0x1A0 + 5*affectCount` arithmetic below needs no parity correction.
 *
 * Returns [] when the member declares no items or its tail is short.
 */
export function decodeMonchaCarriedItems(dec: Uint8Array): DqkItemRecord[] {
  if (dec.length < DQK_LAYOUT.fixedLen) return [];
  const count = dec[DQK_LAYOUT.itemCount] ?? 0;
  if (count === 0) return [];
  const base = DQK_LAYOUT.fixedLen + AFFECT_ENTRY * (dec[DQK_LAYOUT.affectCount] ?? 0);
  const out: DqkItemRecord[] = [];
  for (let k = 0; k < count; k++) {
    const at = base + k * ITEM_ENTRY;
    // Yield the items actually present rather than throwing, so one malformed member cannot take the
    // whole library down. No shipped DQK member trips this — see the member-27 note below.
    if (at + ITEM_ENTRY > dec.length) break;
    out.push(decodeDqkItemRecord(dec.subarray(at, at + ITEM_ENTRY), k));
  }
  return out;
}

/**
 * Member 27, SAHUAGIN LORD — the one member of 98 that {@link dqkRecordLength} does not reproduce.
 *
 * This is a defect in the shipped archive, not a gap in the decoder. The member's length word says
 * 434, its `affectCount` and `itemCount` are both **0**, and 0x1A0 + 0 + 0 = 416 — so 18 bytes are
 * undeclared. They are not noise: at 0x1A1 they read as one well-formed `item.dat` record — base
 * type 37 (a shield-hand item), primary name code 37 (the same value, and non-zero, so it is not
 * the `0 == 0` false positive that reading the same bytes at 0x1A0 produces), encumbrance 100,
 * value 6, `ready` set, nothing cursed or charged. Every field lands inside the range the other 106
 * carried items occupy (base 1..105, encumbrance 1..450, value 0..25000). Reading the same 17 bytes
 * at 0x1A0 instead gives base type 0 and encumbrance 25637, well outside that population.
 *
 * The offset is the tell: every other odd-tail member pads at the END (66 name-identities at the
 * count-driven base, 0 at base+1), so this record sitting at +1 with both counts zeroed is one
 * corrupt record, most likely a count byte lost during authoring.
 *
 * Deliberately NOT special-cased. `itemCount` is what the record publishes, so DQK's own loader
 * reads zero items here too and the SAHUAGIN LORD never receives the shield at runtime — recovering
 * it would make our roster differ from the retail game's. {@link decodeMonchaCarriedItems} returns
 * `[]` for this member, which is the faithful answer.
 */
export const MONCHA_MEMBER_27_UNDECLARED_TAIL = 18;

/**
 * Total length of a DQK record carrying `affects` 5-byte special-ability entries and `items`
 * 17-byte item entries: a 0x1A0-byte fixed part, the two tail arrays, padded up to an even length.
 *
 * Solved from the shipped bytes, not assumed: over the 98 members, `(5, 17)` is the **only** width
 * pair in 1..40 × 1..40 that reproduces the stored length for ≥ 97 of them (0 other pairs qualify;
 * the median pair explains 9). Member 27 is the sole exception, 18 bytes long.
 */
export function dqkRecordLength(affects: number, items: number): number {
  const n = DQK_LAYOUT.fixedLen + AFFECT_ENTRY * affects + ITEM_ENTRY * items;
  return n + (n & 1);
}

/**
 * Decompress one `MONCHA.GLB` member the way DQK's loader does: read the 2-byte big-endian
 * uncompressed length, decompress from byte 2, and **check the result against that length**. The
 * length word is the engine's own bound (it is passed to the decompressor as the expected output
 * size), so a mismatch means a desync rather than an unusual record — throwing is what keeps a silent
 * two-byte drift like the one this replaced from ever being read as data again.
 */
export function decodeMonchaMember(member: Uint8Array): Uint8Array {
  if (member.length < DQK_MEMBER_HEADER) throw new Error('MONCHA member: too short for the length word');
  const want = (member[0] << 8) | member[1];
  const dec = monchaRLE(member.subarray(DQK_MEMBER_HEADER));
  if (dec.length !== want) {
    throw new Error(`MONCHA member: expanded to ${dec.length} bytes, header declares ${want}`);
  }
  return dec;
}

/** Each stat field's offset measured from the ability-block start (verified on the clean goldens). */
const ABILITY_DELTA = {
  thac0: 15,
  saves: 19,
  hitDice: 25,
  dmgNdice: 61,
  dmgDsize: 63,
  dmgBonus: 65,
  ac: 67,
} as const;

/**
 * **Compact / short-tail** stat-field deltas from the ability block: attack count at `A+42`, damage
 * dice/size/bonus at `A+43`/`A+44`/`A+45` and raw AC at `A+46`, with THAC0/HD/saves/abilities/XP still
 * at the standard {@link ABILITY_DELTA} offsets. Retained purely as a data-driven fallback for a record
 * whose standard stat block does not validate; **it fires 0 of 98 times on the shipped archive**
 * (measured 2026-08-21).
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** This block used to be presented as located evidence:
 * "a few multi-attack type-8 monsters (HYDRA) pack their attack/damage/AC fields 21 bytes earlier …
 * Verified: HYDRA AC 5, THAC0 7, HD 16, 8×1d12 — exact MM cross-check". That was measured on records
 * still out of phase by their un-stripped 2-byte length word. On the corrected bytes HYDRA is an
 * ordinary fixed-layout record: `A+61..A+67` read 1d12 and raw AC 55 → AC 5 (THAC0 7, HD 16, all as
 * before), while `A+42..A+46` are **all zero** — so `A+46` would decode AC 60 and this sniff cannot
 * validate for HYDRA at all. No shipped record is known to use this layout; the widths below are kept,
 * unclaimed, rather than deleted, because nothing has been shown to *rule it out* either.
 */
const COMPACT_DELTA = {
  attackCount: 42,
  dmgNdice: 43,
  dmgDsize: 44,
  dmgBonus: 45,
  ac: 46,
} as const;

/**
 * The five per-colour dragon **"HEAD" sub-records** (BLACK/BLUE/GREEN/RED/WHITE HEAD): the breath/head
 * attack sub-entries the parent dragon's combat AI references, rather than creatures the party meets on
 * their own. Keyed on the ` HEAD` name suffix — the only classification left in this file keyed on a
 * name — and categorized `'sub'`, name-only; **no combat stats invented**.
 *
 * What the corrected bytes say about them, measured 2026-08-21 (all five are 436 bytes, `isMonster` = 1,
 * `race` 7): they share one XP award (10000) and one saving-throw row (1,2,3,2,4), carry real hit dice
 * (WHITE 7, BLACK 8, GREEN 9, BLUE 10, RED 11) and real damage at the standard deltas (2d8+10 … 3d10+10),
 * and the +10-per-colour power ladder the old note described **does** survive the correction — it sits at
 * decompressed offset 0xCC (ability + 84): WHITE 170, BLACK 180, GREEN 190, BLUE 200, RED 210. Null: of
 * the 436 offsets, 6 carry any strictly increasing tuple in that colour order and exactly 1 carries this
 * ladder. What keeps them out of the full-stat tier is not a missing stat block but
 * {@link sniffDqkMonster}'s plausibility gates: every head stores a **negative** THAC0 (raw > 60, so
 * 60 − raw is −2…−5) and RED HEAD an AC of −14.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** This comment used to assert they have "**no
 * ability/stat block** (the standard decode reads HD 0)" and "a uniform compact head layout: after the
 * name, `f5 0a fe 00 0a <xx> 00 <xx> <0x80|heads> …`". Neither is a record layout: HD reads 7…11, and
 * `f5 0a fe 00` is a monchaRLE opcode pair (repeat `0a`, repeat `00`) that was only visible because the
 * loader was reading a stream still out of phase by the member's 2-byte length word. The head-count
 * reading `0x81`/`0x82` came from the same bytes and is **not** re-established here — treat it as
 * UNLOCATED, not as a retained finding.
 *
 * **REMOVED 2026-08-21 — fidelity-plan §29.** A `TYPE8_NPC_NAMES` set used to sit here alongside this,
 * demoting `'THENOL FNATIC'` and `'PRINCE ALHOOK'` to `'npc'` on the grounds that they were
 * "character/NPC-framed bosses wearing a type-8 byte". Both halves are gone: those spellings were
 * decode artefacts (the records are THENOL FANATIC and PRINCE TALHOOK, so the set could never match
 * again), and both records decode as monsters from their own bytes — PRINCE TALHOOK with real stats
 * (AC −2, 10 HD, THAC0 8, 1d6+3) and THENOL FANATIC as `race` 6 = humanoid. There was never a type-8
 * byte for them to wear; old offset 2 was inside the length word. Removing the set moved 0 of the 98
 * roster categories.
 */
function isDragonHeadSubRecord(name: string): boolean {
  return / HEAD$/.test(name);
}

/** The 6 ability scores are 12 bytes (6 × cur,max), each a believable score in [1,25]. */
const ABILITY_BYTES = 12;

/**
 * Character/NPC stat-field deltas from the ability block (the **character framing**, distinct from the
 * monster {@link ABILITY_DELTA}). DQK's named NPC roster — the `isMonster` = 0 half of MONCHA, i.e.
 * MONster + CHAracter — stores a *rolled* ability spread, then its combat numbers at these offsets.
 * Unlike monsters, HP is **stored** at `+17` (not rolled from hit-dice). Ten of the 11 flag-0 records
 * decode here, and their numbers survived the §29 correction untouched (SELIAS THAC0 10 / 89 hp /
 * level 27, TASSLEHOFF 10 / 64 / 22, CAPTAIN DAENOR 4 / 139 / 30, SIR DISCORE 4 / 151 / 34) — the
 * deltas were always right; it was the name and the ability anchor that the shift was mangling.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** The cross-checks this comment used to cite are gone
 * with the names they were built on: "Bakai Shaman level 9 / THAC0 14 = exact 1e cleric match" (the
 * record is BAKALI SHAMAN, a monster with 9 hit dice), "Sharman STR 16 / level 18 / THAC0 6 =
 * high-level fighter" (SHARKMAN, a `race` 6 humanoid), and "the wizards INT 18 / THAC0 11–13" (DARK
 * WIZARD / THENOL WIZARD, also flag 1). All three carry `isMonster` = 1 and decode on the monster path;
 * none is an NPC record, so none of them ever validated these deltas.
 */
const NPC_DELTA = {
  thac0: 15,
  hp: 17,
  saves: 19,
  level: 25,
  ac: 67,
  classCode: 71,
} as const;

/**
 * One entry in the **full** DQK bestiary roster — every creature member, named. All 98 members decode a
 * name and a category from fixed offsets (0x68 / 0x66 + 0x58); `hasStats` flags the 86 that also carry
 * a validated combat stat block and so appear in {@link MonchaArchive.monsters}. The 12 that do not are
 * an honest residue, not a decode failure — each one is a record whose stored numbers fall outside
 * {@link sniffDqkMonster}'s plausibility gates, and the reason is measured (2026-08-21), not assumed:
 *
 *  - **4 store 0d0 damage**, i.e. no melee attack to validate, because their attack is special:
 *    ENORMOUS SPIDER, GAS SPORE, SEA SNAKE, LICH.
 *  - **7 store a negative THAC0** (the raw byte exceeds 60, so `60 − raw` is −2…−7) — SEA DRAGON,
 *    DEATH DRAGON and the five dragon HEAD sub-records; RED HEAD also stores AC −14. These are
 *    engine-legal always-hit values, not garbage, but they sit outside the gate's `[0,30]` window.
 *  - **1 is a placeholder**: CHROMATIC DRAGN, whose whole stat block reads THAC0 raw 0, HD 50, AC raw
 *    100 and all-zero saves — a boss the engine evidently drives from somewhere other than this record.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** "The record layout is variable-length and
 * self-describing (the name offset alone ranges 21…300+ across the library)" was false. The record is
 * variable-length only in its two tail arrays; every field this loader reads is at a fixed offset, and
 * that 21…300+ range was the un-stripped 2-byte length word shifting each member by its own amount.
 */
export interface MonchaEntry {
  /** 1-based member index in the library. */
  memberIndex: number;
  /** Decoded creature name (SSI abbreviates to fit, e.g. "ENORMUS SPIDER", "GREATR OTYUGH"). */
  name: string;
  /**
   * The **is-monster flag** at offset 0x66: 1 on the 87 bestiary members, 0 on the 11 named-NPC ones.
   * The field keeps its old name for callers, but it is no longer a "record-type tag at offset 2 —
   * 8 = monster; 0/1/2/3/6/10/12 = other creature/NPC kinds" (§29, 2026-08-21): there is no type byte,
   * old offset 2 sat inside the member's 2-byte length word, and no member reads anything but 0 or 1.
   */
  typeByte: number;
  /** Byte-grounded creature category — `isMonster`@0x66 then `race`@0x58, see {@link classifyCategory}. */
  category: MonsterCategory;
  /** True if this member also decoded to a full validated stat record (present in `monsters`). */
  hasStats: boolean;
  /**
   * The creature's carried equipment, decoded from the member's 17-byte tail records — its stock
   * kit (BLACK ROGUE's long sword, THENOL PRIEST's mace and armour). Empty for the 70 members that
   * declare none. See {@link decodeMonchaCarriedItems}.
   */
  items: DqkItemRecord[];
}

/** A DQK monster record + the member index it came from. Shares the Gen1 `MonsterRecord` shape. */
export interface MonchaArchive {
  name: string;
  /** Total creature members in the library (member 0 is the id table, so this is `members − 1`). */
  total: number;
  /**
   * How many members decoded to a clean, validated full-stat record — monster-framed records **and**
   * the character/NPC-framed records (`category: 'npc'`, see {@link decodeNpcRecord}). = {@link monsters}.length.
   */
  decoded: number;
  /** How many members yielded a decoded name (the full bestiary roster — see {@link roster}). */
  named: number;
  /** The full bestiary roster: every member, named, in member order (stats only where `hasStats`). */
  roster: MonchaEntry[];
  /**
   * The decoded creatures with full validated stats, in member order — monster-framed (`category:
   * 'monster'`) plus character/NPC-framed (`category: 'npc'`, stored HP + class + level). Filter by
   * `category` for monsters only.
   */
  monsters: MonsterRecord[];
  /** Logical area/monster id → decoded record (from the member-0 id table), validated members only. */
  byId: Map<number, MonsterRecord>;
  /** Decoded record by 1-based member index (validated members only). */
  byMember: Map<number, MonsterRecord>;
}

/**
 * The pre-§29 record-type enum. **Unreachable on the shipped archive** (called 0 of 98 times, measured
 * 2026-08-21): its only caller, {@link classifyCategory}, now decides from `isMonster`@0x66 and
 * `race`@0x58 and returns before this line for all 98 members, and the argument it would be handed is
 * the 0/1 flag rather than a type byte, so cases 8/6/3/5 can never match. Kept as the last-resort
 * default for foreign/synthetic input rather than deleted.
 */
function categoryOf(typeByte: number): MonsterCategory {
  switch (typeByte) {
    case 8:
      return 'monster';
    case 6:
      return 'humanoid';
    case 3:
    case 5:
      return 'npc';
    default:
      return 'unknown';
  }
}

function readName(raw: Uint8Array): string {
  let s = '';
  for (let i = 0; i < DQK_LAYOUT.nameMax; i++) {
    const c = raw[DQK_LAYOUT.name + i];
    if (c === undefined || c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/**
 * Read a creature name **without** assuming any fixed offset: SSI stores names as an uppercase-ASCII
 * run (letters, digits, space, `.`/`'`/`-`), abbreviated to fit (e.g. "PURPLE WORM"), so we take the
 * longest qualifying run (≥3 chars, ≥2 letters) at or past offset 16 (clearing the binary header).
 * Returns `null` if no plausible name is found.
 *
 * **Fallback only, and not a good one.** {@link DQK_LAYOUT}`.name` = 0x68 holds the name in all 98
 * shipped members, and {@link decodeMonchaGlb} reads it there; this scan exists for a record that does
 * not carry one at 0x68 (synthetic and Gen1-ported input). On the real archive it disagrees with the
 * fixed read on member 31, whose longest printable run is `UVWW.` rather than its name, `LICH`.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** This comment used to justify the scan by claiming "the
 * DQK record is variable-length and self-describing — the name sits at a member-dependent offset
 * (measured range 21…300+)". The record is variable-length, but the name is not: that measured range
 * was the un-stripped length word shifting each record by a record-dependent amount.
 */
export function scanMonsterName(dec: Uint8Array): { name: string; offset: number } | null {
  const isNameByte = (c: number): boolean =>
    (c >= 0x41 && c <= 0x5a) || // A–Z
    c === 0x20 || // space
    (c >= 0x30 && c <= 0x39) || // 0–9
    c === 0x2e || c === 0x27 || c === 0x2d; // . ' -
  let best: { name: string; offset: number } | null = null;
  let start = -1;
  for (let i = 0; i <= dec.length; i++) {
    const c = i < dec.length ? dec[i] : 0;
    if (i >= 16 && isNameByte(c)) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      let end = i;
      while (end > start && dec[end - 1] === 0x20) end--; // trim trailing spaces
      let letters = 0;
      for (let k = start; k < end; k++) if (dec[k] >= 0x41 && dec[k] <= 0x5a) letters++;
      if (end - start >= 3 && letters >= 2) {
        const name = String.fromCharCode(...dec.slice(start, end));
        if (!best || name.length > best.name.length) best = { name, offset: start };
      }
      start = -1;
    }
  }
  return best;
}

function readAbilities(raw: Uint8Array, ability: number): MonsterAbilities {
  const a = (slot: number) => raw[ability + slot * 2] ?? 0; // current byte of each (cur,max) pair
  return { str: a(0), int: a(1), wis: a(2), dex: a(3), con: a(4), cha: a(5) };
}

function readSaves(raw: Uint8Array, ability: number): SavingThrows {
  const b = ability + ABILITY_DELTA.saves;
  return {
    paralyzePoisonDeath: raw[b] ?? 0,
    petrifyPolymorph: raw[b + 1] ?? 0,
    rodStaffWand: raw[b + 2] ?? 0,
    breath: raw[b + 3] ?? 0,
    spell: raw[b + 4] ?? 0,
  };
}

/** Allowed polyhedral die sizes for a sane damage roll (rejects desynced garbage). */
const DIE_SIZES = new Set([1, 2, 3, 4, 6, 8, 10, 12, 20, 100]);

/**
 * Splice a record's header+name (unchanged) with a second {@link monchaRLE} pass over its post-name
 * tail. **This is a synthetic-input helper, not a description of the DQK format.** It is exported and
 * covered by a test that feeds it a record whose tail really is an inline-compressed stat block; on the
 * real archive it is still invoked as a fallback by {@link decodeFullStatMonster} for the members that
 * miss the fixed-offset sniff, where it yields **0 accepted decodes of 98** (measured 2026-08-21). No
 * shipped record's stats come from it.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** The premise this function was built on — "the DQK
 * monster record stores its ability/THAC0/saves/HD/damage/AC block with the same monchaRLE scheme; for
 * many members the member-level decompression leaves that inner block still compressed" — is false.
 * DQK stores no inner compression. What the second pass actually did was re-synchronise a stream that
 * the loader had shifted by consuming the member's 2-byte big-endian length word as RLE control bytes;
 * with the word stripped ({@link decodeMonchaMember}) every stat block is already expanded, at the
 * fixed offset 0x78. A coincidence that happened to work is not a format.
 */
export function reconstructDqkRecord(dec: Uint8Array): Uint8Array {
  const nm = scanMonsterName(dec);
  if (!nm) return dec;
  const end = nm.offset + nm.name.length;
  try {
    const tail = monchaRLE(dec.slice(end));
    const merged = new Uint8Array(end + tail.length);
    merged.set(dec.slice(0, end), 0);
    merged.set(tail, end);
    return merged;
  } catch {
    return dec;
  }
}

/**
 * Locate the 12-byte ability block in a (possibly reconstructed) record: the first run of 12 bytes all
 * in the believable score range [1,25] immediately followed by the `00 00 00` separator, with a
 * non-ability byte before it. The stat block is then read at fixed deltas from this offset
 * ({@link ABILITY_DELTA}). Returns −1 if no block is found.
 */
export function findAbilityBlock(rec: Uint8Array): number {
  for (let A = 1; A + ABILITY_DELTA.ac < rec.length; A++) {
    let ok = true;
    for (let k = 0; k < ABILITY_BYTES; k++) {
      const v = rec[A + k];
      if (v < 1 || v > 25) { ok = false; break; }
    }
    if (!ok) continue;
    if (rec[A + ABILITY_BYTES] !== 0 || rec[A + ABILITY_BYTES + 1] !== 0 || rec[A + ABILITY_BYTES + 2] !== 0) continue;
    const prev = rec[A - 1];
    if (prev >= 1 && prev <= 25) continue; // must be the block start, not mid-run
    return A;
  }
  return -1;
}

/** The 6 *current* ability bytes (the first of each (cur,max) pair) of the block at offset `A`. */
function abilityCurrents(rec: Uint8Array, A: number): number[] {
  return [0, 1, 2, 3, 4, 5].map((s) => rec[A + s * 2] ?? 0);
}

/**
 * True if the ability block at `A` is a **monster-default** block — the monster combat framing — as
 * opposed to a *rolled character* block. DQK creatures come in two record kinds that share the same
 * container and the same name/RLE scheme but frame combat differently:
 *
 *  - **Monster-framed**: the ability block is the monster default — every score is **10** (`0x0a`),
 *    except undead, which carry a few low mental `3`s (ZOMBIE, GHAST, SKEL WARRIOR) — followed by the
 *    real THAC0/HD/damage/AC fields.
 *  - **Character/NPC-framed** (the named NPC roster: SELIAS, TASSLEHOFF, CAPTAIN DAENOR…): the ability
 *    block is a *rolled* character spread (scores 7…19), and the monster-damage/AC fields after it are
 *    placeholders (AC 10 default, 1d2) because a character's combat derives from class + level +
 *    equipment elsewhere in the record. Decoding these as monsters would emit placeholder garbage.
 *
 * A monster-default block has **≥4 of its 6 current scores equal to 10 and none above 10**; a rolled
 * character spread contains scores > 10 and is rejected.
 *
 * **Scope, measured 2026-08-21.** Every caller gates on `isMonster` (0x66) ≠ 1 first, so this is only
 * ever asked about the 11 flag-0 records. Exactly one of them answers yes — member 80 BALDRIC, an
 * all-10 spread that then decodes as a real combatant (AC −1, THAC0 6, HD 11, 1d6+4) — and that single
 * yes is what this function is still load-bearing for. The other 10 are rolled spreads and route to
 * {@link decodeNpcRecord}.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** This comment used to sort the library by a "type byte":
 * monster-framed meant "type 8 *and* many type 0/3/12 records — Sahuagin, Spectre, Wraith, Fire Giant,
 * Skeleton Warrior", character-framed meant "Black Ogre, Dark Wizard, the named bosses Selia/…". There
 * is no type byte (old offset 2 sat inside the member's length word), and every creature it named as an
 * example — SAHUAGIN, SPECTRE, WRAITH, FIRE GIANT, SKEL WARRIOR, BLACK ROGUE (not "Black Ogre"), DARK
 * WIZARD — carries `isMonster` = 1 and now decodes on the fixed path, never reaching this function.
 */
function isMonsterDefaultAbility(rec: Uint8Array, A: number): boolean {
  if (A < 0) return false;
  const cur = abilityCurrents(rec, A);
  const tens = cur.filter((v) => v === 10).length;
  if (tens >= 4 && cur.every((v) => v >= 1 && v <= 10)) return true; // all-10 (+ low undead 3s)
  // The "intelligent monster" pattern: every score is the default 10 except INT (slot 1) = 18. This
  // clause was written for member 31 — read under the shifted decode as a caster-type monster with the
  // garbled name "UVWW.", which is really LICH. It is now inert: all 11 records carrying that exact
  // spread (LICH, FIRESHADOW, AURAK/BOZAK DRACONIAN and the chromatic dragons) have `isMonster` = 1, so
  // they take the fixed path and are never passed here, and it fires 0 of 98 times (2026-08-21). Kept
  // rather than deleted because it tests bytes, not a name, and nothing has shown it to be *wrong* —
  // only unused. Its stated job, keeping a caster-type monster off the character path, is now done
  // upstream by the `isMonster` flag at 0x66.
  const non10 = cur.map((v, i) => [v, i] as const).filter(([v]) => v !== 10);
  return non10.length === 1 && non10[0][1] === 1 && non10[0][0] === 18;
}

/** Validate the stat block anchored at ability offset `A` (the ability-relative form of the sniff). */
function sniffAtAbility(rec: Uint8Array, A: number): boolean {
  if (A < 0 || A + ABILITY_DELTA.ac >= rec.length) return false;
  const thac0 = TO_HIT_BASE - rec[A + ABILITY_DELTA.thac0];
  const ac = TO_HIT_BASE - rec[A + ABILITY_DELTA.ac];
  const hd = rec[A + ABILITY_DELTA.hitDice];
  const dc = rec[A + ABILITY_DELTA.dmgNdice];
  const ds = rec[A + ABILITY_DELTA.dmgDsize];
  return (
    thac0 >= 0 && thac0 <= 30 &&
    ac >= -12 && ac <= 16 &&
    hd >= 1 && hd <= 40 &&
    dc >= 1 && dc <= 12 &&
    ds >= 2 && DIE_SIZES.has(ds)
  );
}

/**
 * Validate the **compact / short-tail** stat block: THAC0/HD at the standard deltas but damage/AC at the
 * {@link COMPACT_DELTA} offsets. The AC range gate (`60 − rec[A+46] ∈ [-12,16]`) is what keeps it from
 * firing on the dragon "HEAD" sub-records, whose whole `A+42..A+46` window is zero → AC 60, out of range.
 * Corrected 2026-08-21 (§29): the gate rationale used to add "and whose `A+25` HD reads 0". It does not —
 * the heads carry hit dice 7…11 — so the AC gate is carrying this alone, and the THAC0 gate rejects them
 * again for good measure (their stored THAC0 is negative). No shipped member reaches or passes this.
 */
function sniffCompactMonster(rec: Uint8Array, A: number): boolean {
  if (A < 0 || A + COMPACT_DELTA.ac >= rec.length) return false;
  const thac0 = TO_HIT_BASE - rec[A + ABILITY_DELTA.thac0];
  const ac = TO_HIT_BASE - rec[A + COMPACT_DELTA.ac];
  const hd = rec[A + ABILITY_DELTA.hitDice];
  const dc = rec[A + COMPACT_DELTA.dmgNdice];
  const ds = rec[A + COMPACT_DELTA.dmgDsize];
  return (
    thac0 >= 0 && thac0 <= 30 &&
    ac >= -12 && ac <= 16 &&
    hd >= 1 && hd <= 40 &&
    dc >= 1 && dc <= 12 &&
    ds >= 2 && DIE_SIZES.has(ds)
  );
}

/**
 * A decompressed member looks like a clean DQK monster record: long enough, the type tag is the
 * monster value, a printable non-empty name, and AC/THAC0/HD/damage all in believable ranges. This
 * rejects both the interleaved type-3 character records and any record the decompressor desynced.
 */
export function sniffDqkMonster(raw: Uint8Array): boolean {
  if (raw.length <= DQK_LAYOUT.ac) return false;
  if (raw[DQK_LAYOUT.isMonster] !== 1) return false;
  // Name: at least one letter, every byte printable ASCII (no control/high bytes from a desync).
  let letters = 0;
  for (let i = 0; i < DQK_LAYOUT.nameMax; i++) {
    const c = raw[DQK_LAYOUT.name + i];
    if (c === 0) break;
    if (c < 0x20 || c > 0x7e) return false;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) letters++;
  }
  if (letters === 0) return false;
  const thac0 = TO_HIT_BASE - raw[DQK_LAYOUT.thac0];
  const ac = TO_HIT_BASE - raw[DQK_LAYOUT.ac];
  const hd = raw[DQK_LAYOUT.hitDice];
  const dc = raw[DQK_LAYOUT.dmgNdice];
  const ds = raw[DQK_LAYOUT.dmgDsize];
  return (
    thac0 >= 0 && thac0 <= 30 &&
    ac >= -12 && ac <= 16 &&
    hd >= 1 && hd <= 40 &&
    dc >= 1 && dc <= 20 &&
    DIE_SIZES.has(ds)
  );
}

/** Average hit points for `hd` hit dice (the d8-per-die mean), at least `hd`. */
function avgHpForHd(hd: number): number {
  return Math.max(hd, Math.round(hd * 4.5));
}

/**
 * A damage **flat bonus** is a signed byte: 0xfd would be −3, not +253.
 *
 * **Untested by shipped data, and the example it used to give was wrong.** This comment read "0xfd = −3
 * (UMBERHULK)"; UMBER HULK's bonus byte is 0 (it deals 3d4), and across all 98 corrected members **no**
 * record stores a bonus byte above 127 — the signed branch fires 0 times (measured 2026-08-21, §29).
 * The sign handling is kept because the field is plainly a signed slot and Gen1 uses one, but no DQK
 * record demonstrates it.
 */
function signedByte(b: number): number {
  return b > 127 ? b - 256 : b;
}

/**
 * Decode one **already-decompressed** DQK monster record, with the stat block anchored at ability
 * offset `ability` (default {@link DQK_LAYOUT}`.ability` = 0x78, where all 98 shipped members keep it).
 * `memberIndex` is provenance only (stored as
 * `blockId`); `name` overrides the fixed-offset name read (used when the record was reconstructed and
 * the name sits at a scanned offset). Assumes the stat block validated ({@link sniffDqkMonster} or
 * {@link sniffAtAbility}).
 */
export function decodeDqkMonsterRecord(
  raw: Uint8Array,
  memberIndex = -1,
  opts: { ability?: number; name?: string; ac?: number; damage?: DamageDice; acSource?: 'canon' } = {},
): MonsterRecord {
  const ability = opts.ability ?? DQK_LAYOUT.ability;
  const hitDice = raw[ability + ABILITY_DELTA.hitDice];
  // Damage/AC default to the standard single-attack deltas; a caller may override them (the compact
  // fallback passes damage/AC read from COMPACT_DELTA). `opts.acSource` marks an AC that did NOT come
  // from the record's own byte — no shipped DQK record needs it since §29 retired the canon-AC
  // injection, so on `MONCHA.GLB` it is never set.
  const damage: DamageDice = opts.damage ?? {
    count: raw[ability + ABILITY_DELTA.dmgNdice],
    sides: raw[ability + ABILITY_DELTA.dmgDsize],
    bonus: signedByte(raw[ability + ABILITY_DELTA.dmgBonus]),
  };
  return {
    blockId: memberIndex,
    name: opts.name ?? readName(raw),
    // A record only reaches here once its stat block validated as monster-framed, so the record itself
    // is a monster. Roster placement is a separate, byte-grounded decision ({@link classifyCategory}):
    // member 80 BALDRIC validates as a combatant here while its `isMonster` = 0 flag files it as an NPC.
    category: 'monster',
    hitPoints: avgHpForHd(hitDice),
    abilities: readAbilities(raw, ability),
    savingThrows: readSaves(raw, ability),
    armorClass: opts.ac ?? TO_HIT_BASE - raw[ability + ABILITY_DELTA.ac],
    thac0: TO_HIT_BASE - raw[ability + ABILITY_DELTA.thac0],
    hitDice,
    damage,
    xp: (raw[DQK_LAYOUT.xp] ?? 0) | ((raw[DQK_LAYOUT.xp + 1] ?? 0) << 8),
    ...(opts.acSource ? { acSource: opts.acSource } : {}),
    raw,
  };
}

/**
 * Decode a full-stat DQK monster from a decompressed member. The fixed-offset layout is the path that
 * matters: it takes 75 of the 98 shipped members outright. The three fallbacks below it are kept for
 * synthetic and Gen1-ported input and together contribute exactly one shipped record (member 80,
 * BALDRIC, via the direct-`dec` anchor). Returns `null` if no path yields a validated monster — so the
 * caller's set stays faithful.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** This used to describe itself as "handling the
 * **inline-compressed** stat block … ability @40". There is no inline compression, and the ability
 * block is at 0x78, not 40; see {@link reconstructDqkRecord} for what the second RLE pass was really
 * doing.
 */
function decodeFullStatMonster(dec: Uint8Array, memberIndex: number, name: string): MonsterRecord | null {
  if (sniffDqkMonster(dec)) return decodeDqkMonsterRecord(dec, memberIndex, { name });
  const rec = reconstructDqkRecord(dec);
  const A = findAbilityBlock(rec);
  if (sniffAtAbility(rec, A)) {
    // Reconstruction path. It accepts 0 of the 98 shipped members (measured 2026-08-21) — every record
    // that gets this far has already been re-compressed into garbage by the second RLE pass — but the
    // monster-framed gate below is kept in step with the direct-`dec` path so the two cannot disagree:
    // a flag-0 record only yields monster stats when its ability block is the monster default.
    if (dec[DQK_LAYOUT.isMonster] !== 1 && !isMonsterDefaultAbility(rec, A)) return null;
    return decodeDqkMonsterRecord(rec, memberIndex, { ability: A, name });
  }
  // Direct-`dec` anchor: the record's stat block is already expanded (which, since §29, is true of every
  // shipped member), so the second RLE pass above only damages it — anchor on the untouched bytes
  // instead. On the real archive this is what {@link sniffDqkMonster} would have done except for its
  // `isMonster` = 1 requirement, and `findAbilityBlock` returns the same fixed 0x78. It contributes
  // exactly one shipped record: member 80 BALDRIC, flagged NPC but carrying a monster-default ability
  // block and real combat numbers (THAC0 6 / HD 11 / 1d6+4 / AC −1). Same monster-framed gate as above,
  // so the 10 rolled-ability NPC records are not misread as monsters.
  //
  // **WITHDRAWN 2026-08-21 — fidelity-plan §29.** This path used to be justified by "GIANT ANEMONE
  // (ability @90 → THAC0 7 / HD 16 / 1d4 / AC 2) and GIANT SQUID (ability @39 → THAC0 9 / HD 12 / 1d6 /
  // AC 3)". Both were measured on shifted records; both now decode on the fixed path with the ability
  // block at 0x78, and neither reaches this line.
  const Adec = findAbilityBlock(dec);
  if (sniffAtAbility(dec, Adec)) {
    if (dec[DQK_LAYOUT.isMonster] !== 1 && !isMonsterDefaultAbility(dec, Adec)) return null;
    return decodeDqkMonsterRecord(dec, memberIndex, { ability: Adec, name });
  }
  // Compact / short-tail fallback: a bestiary record with a located ability block whose *standard*
  // stat block didn't validate, but whose attack/damage/AC read at {@link COMPACT_DELTA}. Fires 0 of
  // 98 times on the shipped archive (see COMPACT_DELTA) and is kept only as a data-driven fallback.
  //
  // **REMOVED 2026-08-21 — fidelity-plan §29.** A second fallback used to sit here: if the record
  // validated in every field *except* AC, inject the published AD&D value from a `CANON_AC` table and
  // flag the result `acSource: 'canon'`. Its whole case was UMBER HULK, whose AC byte was said to
  // equal a valid monchaRLE COPY opcode and to have been consumed during compression. It was not:
  // UMBER HULK's AC 2 is on disk at ability+67 (raw byte 58) and decodes on the fixed path. The table
  // was also keyed `UMBERHULK`, a spelling the corrected decode can no longer produce, so the branch
  // could not have fired anyway. Archive-wide `acSource` count is now 0 — nothing in `MONCHA.GLB`
  // carries an injected value.
  if (dec[DQK_LAYOUT.isMonster] === 1 && A >= 0 && sniffCompactMonster(rec, A)) {
    return decodeDqkMonsterRecord(rec, memberIndex, {
      ability: A,
      name,
      ac: TO_HIT_BASE - rec[A + COMPACT_DELTA.ac],
      damage: {
        count: rec[A + COMPACT_DELTA.dmgNdice],
        sides: rec[A + COMPACT_DELTA.dmgDsize],
        bonus: signedByte(rec[A + COMPACT_DELTA.dmgBonus] ?? 0),
      },
    });
  }
  return null;
}

/**
 * Categorize a creature member from its own bytes: `isMonster`@0x66 = 0 is an `npc`; `race`@0x58 = 6 is
 * a `humanoid`; anything else with stats or `race` 7 is a `monster`. No name heuristics are involved,
 * and the {@link categoryOf} fallback on the last line is unreachable for all 98 shipped members.
 * Roster totals: 74 monster, 8 humanoid, 11 npc, plus the 5 dragon HEAD records that
 * {@link decodeMonchaGlb} demotes to `sub` afterwards (they are the one name-keyed step left, because
 * they carry no stat block to key on).
 */
function classifyCategory(dec: Uint8Array, typeByte: number, hasStats: boolean): MonsterCategory {
  // Byte-grounded now that the record decodes at fixed offsets: `isMonster` (0x66) is 1 for all 90
  // bank-0 bestiary records and 0 for all 8 bank-1 NPCs, and `race` (0x58) is 7 for a plain monster
  // and 6 for a humanoid — which selects exactly BLACK ROGUE, the five THENOL ranks, DARK WIZARD and
  // SHARKMAN. No name heuristics involved.
  const race = dec[DQK_LAYOUT.race] ?? 0;
  if (dec[DQK_LAYOUT.isMonster] === 0) return 'npc';
  if (race === RACE_HUMANOID) return 'humanoid';
  if (hasStats || race === RACE_MONSTER) return 'monster';
  return categoryOf(typeByte);
}

/**
 * True if the ability block at `A` is a **rolled character spread** — at least one current score is
 * *above* the monster default 10 (all in [1,25]). It separates the named NPCs (SELIAS 16/17/19/18/16/16,
 * ELGYNORA, DAWNSHINE, the GNOMEs…) from **undead monsters**, whose ability block is 10s with a few
 * *low* `3` mental stats (ZOMBIE, GHAST — max 10, never above). Used to route a record to
 * {@link decodeNpcRecord}, and only ever consulted for a record whose `isMonster` byte is not 1.
 *
 * **WITHDRAWN 2026-08-21 — fidelity-plan §29.** The examples this comment used to give — "Black Ogre
 * 15/18, the wizards INT 18, Bakai Shaman WIS 15" — are not characters. BLACK ROGUE ("Black Ogre" was
 * a mis-read) and DARK WIZARD are `race` 6 humanoids with `isMonster` = 1; BAKALI SHAMAN ("Bakai") is a
 * bestiary record with 9 hit dice, not a level-9 cleric. None of them reach this function.
 */
function isRolledAbility(rec: Uint8Array, A: number): boolean {
  if (A < 0) return false;
  const cur = abilityCurrents(rec, A);
  if (!cur.every((v) => v >= 1 && v <= 25)) return false;
  return cur.some((v) => v > 10);
}

/**
 * Decode a DQK **character/NPC** record (the rolled-ability framing) anchored at ability offset `A`.
 * Reads the real combat stats at the {@link NPC_DELTA} offsets — THAC0 (+15), **stored** HP (+17, not
 * rolled), 5 saving throws (+19), level (+25), AC (+67, the stored value when equipped, else the
 * placeholder 10), and class code (+71). Returns a {@link MonsterRecord} with `category: 'npc'`, or
 * `null` if the decoded stats aren't plausible. The melee `damage` and absolute-offset XP are
 * placeholders for character records (real weapon damage / kill-XP aren't in the monster fields), so
 * those are reported as a nominal 1d2 / 0 — the verified deliverable is THAC0/HP/AC/level/class.
 */
export function decodeNpcRecord(rec: Uint8Array, memberIndex: number, A: number, name: string): MonsterRecord | null {
  if (A < 0 || A + NPC_DELTA.classCode >= rec.length) return null;
  const thac0 = TO_HIT_BASE - rec[A + NPC_DELTA.thac0];
  const hp = rec[A + NPC_DELTA.hp];
  const level = rec[A + NPC_DELTA.level];
  const acByte = rec[A + NPC_DELTA.ac];
  if (thac0 < 0 || thac0 > 30 || hp < 1 || hp > 255 || level < 1 || level > 40) return null;
  return {
    blockId: memberIndex,
    name,
    category: 'npc',
    hitPoints: hp, // stored directly — NOT rolled from hit-dice
    abilities: readAbilities(rec, A),
    savingThrows: readSaves(rec, A),
    armorClass: TO_HIT_BASE - acByte, // stored AC (real when acByte ≠ the placeholder 50)
    thac0,
    hitDice: 0, // characters store HP directly; no hit-dice roll
    damage: { count: 1, sides: 2, bonus: 0 }, // placeholder — real damage is by equipped weapon (unmapped)
    xp: 0, // offset-4 is not a kill reward for character records
    npcClass: rec[A + NPC_DELTA.classCode],
    npcLevel: level,
    raw: rec,
  };
}

/** Parse the member-0 id table: `count`, then `count × {areaId, memberIndex}` little-endian. */
function parseIdTable(idTable: Uint8Array): Array<{ areaId: number; memberIndex: number }> {
  const out: Array<{ areaId: number; memberIndex: number }> = [];
  if (idTable.length < 2) return out;
  const dv = new DataView(idTable.buffer, idTable.byteOffset, idTable.byteLength);
  const count = dv.getUint16(0, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + 4 * i;
    if (o + 4 > idTable.length) break;
    out.push({ areaId: dv.getUint16(o, true), memberIndex: dv.getUint16(o + 2, true) });
  }
  return out;
}

/**
 * Decode a DQK `MONCHA.GLB` byte image into its bestiary. Throws if the bytes are not an HLIB DATA
 * library. Members are decompressed with {@link monchaRLE}; every member yields a roster entry (name +
 * category from the fixed offsets 0x68 / 0x66 + 0x58), and 86 of the 98 also get a full validated stat
 * record via {@link decodeFullStatMonster} or {@link decodeNpcRecord}. Records that don't validate carry
 * name + category only (`hasStats=false`).
 */
export function decodeMonchaGlb(bytes: Uint8Array, name = 'MONCHA.GLB'): MonchaArchive {
  const arch = decodeHlib(bytes, name);
  if (!arch.nonImage || arch.rawMembers.length < 2) {
    throw new Error(`MONCHA.GLB: expected an HLIB DATA library with an id table + records (tag=${arch.tag})`);
  }
  const members = arch.rawMembers;
  const byMember = new Map<number, MonsterRecord>();
  const monsters: MonsterRecord[] = [];
  const roster: MonchaEntry[] = [];
  for (let m = 1; m < members.length; m++) {
    let dec: Uint8Array;
    try {
      dec = decodeMonchaMember(members[m]);
    } catch {
      continue;
    }
    // Roster decode for every member: the name is at the **fixed** offset 0x68 in all 98 shipped
    // members now that the length word is stripped, so read it there and keep the offset-independent
    // scan only as a fallback for a record that does not carry one (it survives for synthetic and
    // Gen1-ported input). The scan alone mis-reads m31, whose longest printable run is not its name.
    const fixed = readName(dec);
    const scanned = fixed ? { name: fixed, offset: DQK_LAYOUT.name } : scanMonsterName(dec);
    if (!scanned) continue;
    // `typeByte` is now the byte-grounded is-monster flag at 0x66 (1 = bestiary, 0 = NPC).
    const typeByte = dec[DQK_LAYOUT.isMonster] ?? 0;
    // Full-stat decode, in two framings, both now at the **fixed** ability offset 0x78 — the record
    // is not self-describing and never needed the reconstruction search (§29). First the **monster**
    // framing; if that fails, the **character/NPC** framing (a rolled ability spread → real
    // THAC0/HP/AC/level/class at the NPC deltas). Null from both → roster-only (name + category).
    let rec = decodeFullStatMonster(dec, m, scanned.name);
    let category: MonsterCategory;
    if (rec) {
      category = classifyCategory(dec, typeByte, true);
    } else {
      const A = DQK_LAYOUT.ability;
      // Character/NPC framing: a rolled spread that is NOT the monster-default / intelligent-monster
      // signature (the latter is a caster-type monster, e.g. LICH, not a character).
      if (typeByte !== 1 && isRolledAbility(dec, A) && !isMonsterDefaultAbility(dec, A)) {
        rec = decodeNpcRecord(dec, m, A, scanned.name);
      }
      category = rec ? 'npc' : classifyCategory(dec, typeByte, false);
    }
    // The five dragon HEAD breath sub-entries carry `isMonster` = 1 and so would otherwise default to
    // 'monster'; demote them to 'sub'. Only applies when no full stats were decoded, so a validated
    // monster is never demoted, and it never fires on one: all five store a negative THAC0 and so miss
    // every stat gate (see {@link isDragonHeadSubRecord} for what their bytes do hold). No stats invented.
    if (rec === null && isDragonHeadSubRecord(scanned.name)) category = 'sub';
    const hasStats = rec !== null;
    if (rec) {
      byMember.set(m, rec);
      monsters.push(rec);
    }
    roster.push({ memberIndex: m, name: scanned.name, typeByte, category, hasStats, items: decodeMonchaCarriedItems(dec) });
  }
  const byId = new Map<number, MonsterRecord>();
  for (const { areaId, memberIndex } of parseIdTable(members[0])) {
    const rec = byMember.get(memberIndex);
    if (rec) byId.set(areaId, rec);
  }
  return {
    name,
    total: members.length - 1,
    decoded: monsters.length,
    named: roster.length,
    roster,
    monsters,
    byId,
    byMember,
  };
}
