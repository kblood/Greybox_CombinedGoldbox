/**
 * Krynn-Gen1 monster-record loader (M2.S6 prerequisite). A `MON{n}CHA.DAX` archive holds one
 * monster per DAX block (monsters are characters in the Gold Box engine, sharing the .CCH-family
 * layout). **Two Gen1 record sizes exist** and are dispatched on length:
 *
 * **CoK — 409-byte "character" record** (the full .CCH layout). Verified offset map:
 *   0        u8   name length (≤ 15)
 *   1..15    ascii name (NUL-padded to 15 bytes)
 *   16..27   6 ability scores, 2 bytes each (current, max): STR, INT, WIS, DEX, CON, CHA
 *   89       u8   THAC0, stored inverted: to-hit-AC0 = 60 − byte
 *   90       u8   category: 7 = monster, 6 = humanoid class (warrior/cleric/mage), 5 = special NPC
 *   98       u8   hit points
 *   207      u8   combat-icon size: 1 = Small (1×1); >1 = Large (2×2). CCHFORM.TXT field:
 *                 1=small/2=tall/3=wide/4=big/5=huge, +128 = "large even if 1×1" → "UA regards as
 *                 large all combatants … set to a value greater than 1". Byte-located: GOBLIN/RAT=1,
 *                 OGRE/HILL GIANT/MINOTAUR=130 (128+2), RED/WHITE DRAGON=131 (128+3).
 *   208..212 u8×5 saving throws: paralyze/poison/death, petrify/polymorph, rod/staff/wand,
 *                 breath, spell (roll d20 ≥ value) — matches 1e monster save tables
 *   214      u8   hit-dice count (also mirrored at 251)
 *   231      u8   control_morale = 128 + morale (CCHFORM.TXT field "128 + Morale"). Read at runtime
 *                 struct offset 0xE7 (=231) by `morale_check` @0xD83D (VERIFIED myself: `cmp
 *                 es:[di+0xe7],0x7f / ja / and al,0x7f / shl ax,1`): a monster with the byte > 0x7F
 *                 checks morale; morale% = (byte & 0x7F)·2, clamped 102. Byte-located: OGRE=228
 *                 (+100 → 102), undead/SIVAK/GHOUL/SKELETON=178 (+50 → 100), goblins/dragons=128 (+0).
 *   269      u8   damage: number of dice
 *   270      u8   damage: flat bonus
 *   271      u8   damage: die size (so damage = 269 d 271 + 270)
 *   275      u8   armour class, stored inverted: AC = 60 − byte
 *   283      u8   rolled hit points used by `calc_battle_exp` (GAME.OVR:0x640e)
 *   304..305 u16  flat experience-point term (little-endian; GAME.OVR:0x642b)
 *   306      u8   per-HP experience multiplier (GAME.OVR:0x641a)
 *
 * **CoAB — 422-byte Player record.** Curse of the Azure Bonds stores a fuller CoAB `Player`
 * layout (`Player.StructSize = 0x1A6`) with the base character fields and the recalculated combat
 * tail both present. The combat-facing values used here mirror the engine debug dump and native
 * `CCCOMBAT` handoff:
 *   16..27   6 ability scores, 2 bytes each (same offset as CoK)
 *   0x74     race (`Race.monster = 0`)
 *   0xde     `field_DE`; CoAB combat source footprint byte. Placement uses `field_DE & 7`
 *            (`ovr011 PlaceCombatants`), while other paths also inspect the high bit/raw value.
 *   0xdf     five saving throws
 *   0xe5     hit-dice count
 *   0xf7     control_morale (same >0x7f gate / percent decode as CoK)
 *   0x11a    monsterType (nonzero for monster-family creatures; 0 for classed humanoids/NPCs)
 *   0x127    experience-point award (`int32`, little-endian)
 *   0x199    hitBonus, stored inverted: THAC0 = 60 − byte
 *   0x19a    AC byte, stored inverted: AC = 60 − byte
 *   0x19e    attack1 dice count
 *   0x19f    attack2 dice count
 *   0x1a0    attack1 die size
 *   0x1a1    attack2 die size
 *   0x1a2    attack1 flat damage bonus (signed)
 *   0x1a3    attack2 flat damage bonus (signed)
 *   0x1a4    current HP; if a dumped record ever leaves this zero, `hit_point_max` is at 0x78.
 *
 * **DoK — 216-byte compact monster record.** Death Knights of Krynn ships a tighter record (no
 * full PC scratch fields). The offsets below were reverse-engineered by correlating the three
 * monsters present in BOTH CoK and DoK MON1CHA (RED DRAGON, GHOUL, SIVAK) — their CoK-decoded
 * AC/THAC0/damage values locate the same fields in the DoK bytes — then sanity-checked across all
 * 64 DoK blocks (AC in range 0/64; canonical undead ACs land exactly: NIGHTMARE −4, LICH 0,
 * WRAITH 4, WIGHT 5, SPECTRE 2, VAMPIRE STR 18):
 *   0..15    name (same as CoK)
 *   16..27   6 ability scores, 2 bytes each (same offset as CoK)
 *   31       u8   THAC0, inverted (60 − byte)
 *   32       u8   category (same 7/6/5 enum)
 *   41       u8   combat-icon size (SAME +128/">1 = large" encoding as CoK @207 — see
 *                 {@link decodeCombatSize}). **Located by B2-style correlation (CT.7k-3):** across the 7
 *                 monsters present in BOTH games this byte agrees 7/7 with the CoK size@207 large/small
 *                 verdict, and the whole 64-record bestiary is semantically perfect — dragons 131/132,
 *                 ZOMBIE GIANT/MINOTAUR/SKELETAL GIANT/IRON GOLEM 130, FLESH GOLEM/KUO TOA/WERETIGER 129,
 *                 HELLHOUND 3, all undead-humanoids (LICH/WRAITH/WIGHT/SPECTRE/VAMPIRE/GHOUL) & NPCs = 1.
 *   62       u8   control_morale (SAME "128 + morale" encoding & runtime gate as CoK @231 — see
 *                 {@link decodeMorale}). **Located by the same correlation (CT.7k-3):** 7/7 on the
 *                 morale-check gate (byte > 0x7F) and 5/7 exact-byte vs CoK @231 (the 2 misses, SPECTRAL
 *                 MINION 228→178 and SIVAK 178→128, are genuine DoK morale rebalances that still pass the
 *                 gate); no other offset competes (next-best exact was 0/7). Dragons 128 → morale 0,
 *                 undead 178 → 100 — matching the CoK decode.
 *   40       u8   hit points, **mirrored exactly at byte 214 on all 64/64 records** (zero exceptions —
 *                 the same redundant-store convention already used by CoK's own HD field (@214,
 *                 mirrored @251) and Secret's current-hp field (@305, mirrored @437)). Matches the
 *                 AD&D-canon spot values NIGHTMARE 33, WRAITH 28, WIGHT 21, plus the CoK-cross-title
 *                 SIVAK 27 exactly. **Byte 108 is the third column, and it is no longer unidentified:**
 *                 it matches all 4 of those reference values too, but diverges from the 40/214 mirror
 *                 pair on exactly one record — SKOMP (@40/@214 = 81, @108 = 61), the only mismatch in
 *                 the whole 64-record corpus. That single divergence is the tell: 108 is the **rolled**
 *                 HP (CoK's `CCH+0x11B` = 283, which the import table at `GAME.OVR:0x12DA3`'s
 *                 neighbourhood maps to 108), the value `calc_battle_exp` multiplies the per-HP XP
 *                 byte against — see the XP entry below, where `0x4CED` reads `es:[di+0x6c]` for
 *                 exactly this purpose. 40/214 remain the base/max HP the loader exposes.
 *   42..46   u8×5 saving throws (same 5-slot layout as CoK): all 64 records decode a structurally sane
 *                 ascending paralyze≤...≤spell table. Cross-checked against CoK's own GHOUL saves
 *                 [14,15,16,16,17] — DoK's GHOUL decodes [14,15,16,17,17], matching 4/5 exactly (the
 *                 5th, breath, is a 1-point DoK rebalance, the same kind of small delta already seen in
 *                 the morale field above). **Offset 42 is not an off-by-one into a neighbouring field.**
 *                 A 216-byte record holds 212 candidate 5-byte windows; sweeping all of them against the
 *                 canonical AD&D 1e class save tables, keyed to each record's OWN hit-dice byte (@48),
 *                 **43/64 records reproduce the exact 1e fighter row at offset 42, and 0/64 do so at any
 *                 of the other 211 windows** — reproduced 2026-08-18 by three scratch sweeps written
 *                 independently of each other and of this loader (own DAX TOC + signed-byte RLE over the
 *                 retail GOG `MON1CHA.DAX`), all agreeing on both figures.
 *                 One caveat the number needs: the **43** is table-variant-dependent. It counts against a
 *                 1e fighter table whose top two bands are 15-16 = [4,5,6,4,7] and 17+ = [3,4,5,4,6] — the
 *                 variant the retail bytes themselves support (four records carry [3,4,5,4,6] at hd 18-20,
 *                 one carries [4,5,6,4,7] at hd 15, none carry the commonly-printed alternatives), so to
 *                 that extent the count is mildly circular, and under the other printed top bands it reads
 *                 39/64 with LORD SOTH moving out of the no-canonical-row group. **The 0/64-at-all-211-
 *                 other-windows half is table-independent**, and that is the half the anti-off-by-one
 *                 conclusion actually rests on. The 21 non-matches are a measured
 *                 residue rather than a tidied-away one: 7 are another class's canonical row at their own
 *                 hd (clerics/magic-users/a thief), 10 a canonical row from some table at a DIFFERENT
 *                 level band (mostly plain non-casting monsters — ZOMBIE MASTODON, SKELETAL GIANT,
 *                 WIGHT…), and 4 (UNDEAD BEAST, BLACK MAGE, EVIL WARRIOR, LORD SOTH) are no canonical
 *                 row at all. The record-by-record breakdown of that residue lives in the
 *                 `runMonsterSpellSave` preamble in `apps/web/test/e2e.mjs`, which is also where the
 *                 GHOUL/DEATH DRAGON byte rows this pin asserts are listed.
 *                 Full method, the per-record residue table, and the null distributions the two counts
 *                 are read against: `docs/engine/research/dok-save-key-sweep.md`.
 *                 **Engineering consequence, load-bearing for the CoK/DoK -> DQK port: read this block,
 *                 never recompute it.** The 43/64 figure is also a measurement of how far a
 *                 derive-saves-from-hit-dice shortcut would get: 21 of DoK's 64 monsters do NOT carry
 *                 the fighter row their own @48 hit-dice byte implies, so a port that synthesises saves
 *                 from HD (rather than copying bytes 42..46 across) silently mis-saves a third of the
 *                 bestiary — and 7 of those 21 are wrong specifically because they wear another CLASS's
 *                 canonical row (the kuo-toa clerics, the black/high wizards, ROGUE), i.e. exactly the
 *                 records whose spell column a fighter-table shortcut would corrupt.
 *   48       u8   hit-dice count. Cross-title exact match against CoK: GHOUL=2, SIVAK=6 (both exact).
 *                 Populated (nonzero) on all 64 records, unlike the near-duplicate at byte 71 (see
 *                 below), which disambiguates the pair.
 *   71       u8   a partial hit-dice mirror — the near-duplicate that byte 48 has to be told apart
 *                 from. It reads 0 on 16 of the 64 records, and where nonzero it equals byte 48 on
 *                 47 of the remaining 48. Mostly classed humanoids/NPCs (SIR DRYDEN, TANAR, the
 *                 wizards/priests/knights, DURFEY/UNDEAD DURFEY), but the split is NOT by category:
 *                 the zero set spans categories 2, 6 and 7, and 4 of the 45 category-7 "monster"
 *                 records (VAMPIRE MAGE, VAMPIRE CLERIC, KUO TOA CLERIC, IGORF) also read 0. The one
 *                 nonzero disagreement is block 45 ROGUE (byte 48 = 8, byte 71 = 1). Not surfaced as
 *                 a public field; recorded only because byte 48 being nonzero on all 64 records,
 *                 where this one is not, is what identifies 48 as the true hit-dice field.
 *   109..110 u16 LE flat per-monster kill XP, and 111 u8 the per-hit-point XP multiplier — the
 *                 same (flat, perHp) PAIR CoK keeps at 304..305 / 306, renumbered. `MonsterRecord.xp`
 *                 carries the flat term only, exactly as it does for CoK; the full award the engine
 *                 computes is `u16le(rec+109) + rec[111] * rec[108]`.
 *                 **LOCATED 2026-08-19 from the code, after the statistics had failed.** Two
 *                 independent sites in `Death Knights of Krynn/GAME.OVR`, both re-read byte-exact:
 *                   * `0x4CED` — the XP core of DoK's `calc_battle_exp`:
 *                       `c4 7e fc`       les di,[bp-4]
 *                       `26 8a 45 6c`    mov al, es:[di+0x6c]   ; 0x6c = 108, rolled HP
 *                       `30 e4 8b d0`    xor ah,ah / mov dx,ax
 *                       `c4 7e fc`       les di,[bp-4]
 *                       `26 8a 45 6f`    mov al, es:[di+0x6f]   ; 0x6f = 111, per-HP multiplier
 *                       `30 e4 f7 e2`    xor ah,ah / mul dx
 *                       `99 8b c8 8b da` cwd / mov cx,ax / mov bx,dx
 *                       `26 8b 45 6d`    mov ax, es:[di+0x6d]   ; 0x6d = 109, u16 flat term
 *                     `f7 e2 99 8b c8 8b da` occurs exactly ONCE in all 252,469 bytes of GAME.OVR.
 *                     Note this reads the record at `es:di` directly: DoK's RUNTIME combatant record
 *                     is also 216 bytes, so unlike CoK there is no 409-byte expansion to see through.
 *                   * `0x12DA3` — the CoK-import field table, which copies **3 bytes** from the CoK
 *                     409-byte side to the DoK 216-byte side: `81 c7 30 01` (add di, 0x130 = 304) then
 *                     `81 c7 6d 00` (add di, 0x6d = 109) then `mov ax, 3`. CoK 304/305/306 -> DoK
 *                     109/110/111, i.e. SSI's own translation key says these are the same three fields.
 *                 Cross-title check on the retail bytes: **GHOUL is (65, 2) in BOTH titles** — CoK
 *                 `MON1CHA.DAX` @304/@306 and DoK @109/@111 agree on the flat term AND the multiplier.
 *                 In DoK's GHOUL record `u16le == 65` occurs at offset 109 and NOWHERE else in the
 *                 216 bytes (u16BE: nowhere at all), and the joint pattern "flat 65 at o, multiplier 2
 *                 at o+2" is likewise unique. Null: drawing each byte independently from its own
 *                 column's observed multiset across the 64 records, 2000 draws produced that joint
 *                 pattern **0 times** (mean 0.000, max 0).
 *                 The flat column also reads as hand-authored AD&D 1e Monster Manual values rather
 *                 than anything derived — WEREBOAR 275+6, WERETIGER 525+8, GHAST 190+4, WRAITH 575+6,
 *                 SPECTRE 1650+10, LICH 10500+14 — which is independent of both code sites.
 *                 **Why the earlier sweeps missed it, precisely.** The exact-anchor sweep required
 *                 GHOUL=65 AND SIVAK=350 at a COMMON offset. GHOUL=65 does hit, uniquely, at 109;
 *                 SIVAK hits nowhere, because DoK re-costed it from CoK's (350, 6) to (2000, 0). The
 *                 conjunction was unsatisfiable by construction, so the sweep's "zero hits at every one
 *                 of the 216 offsets" was true of the PAIR and false of each anchor separately — a
 *                 negative reported without its own null. The correlation sweeps could not have found
 *                 it either: u16LE@109 ranks 7th of 101 against hit dice (Spearman rho 0.699), sitting
 *                 directly behind the six already-located saves/hd windows at 41..47 — i.e. inside the
 *                 very band the old note dismissed as "the located fields and their immediate
 *                 neighbours". Full method, refutation record and the claims that died:
 *                 `docs/engine/research/dok-kill-xp.md`.
 *                 Still open, and NOT part of this: DoK pools **3** money slots into the
 *                 treasure->XP conversion where CoK pools **7** (loop-start byte `c6 46 fb 04` vs
 *                 `c6 46 fb 00`), so the money term of the battle total is not a pure renumbering of
 *                 CoK's and must not be ported as one.
 *   rearAc (the from-behind AC bonus): UNLOCATED in BOTH formats — COAB `ac_behind` @0x19B = byte 411
 *   is past even the CoK 409-byte record, and CoK's to-hit AC math is cross-overlay (RE.5/FBOV-resolver
 *   territory) → the combat layer keeps a generic +2 rear bonus. See {@link MonsterRecord.combatSize}.
 *
 * The 60−x inversion for AC and THAC0 is the engine's stored "to-be-hit" convention.
 *
 * **Pool of Radiance — 285-byte early Gen1 record.** Pool keeps a length-prefixed 15-byte name, but
 * ability scores are six one-byte values (not current/max pairs) and the combat tail is smaller:
 *   16..21   6 ability scores: STR, INT, WIS, DEX, CON, CHA
 *   45       u8   THAC0, inverted (60 − byte)
 *   50       u8   current hit points
 *   108      u8   combat-icon size (same +128/">1 = large" encoding as later Gen1)
 *   109..113 u8×5 saving throws
 *   115      u8   hit-dice count
 *   163      u8   damage dice count
 *   165      u8   damage die size
 *   167      u8   damage bonus
 *   169      u8   armour class, inverted (60 − byte)
 *   XP / category / control_morale: not located yet; reported as 0/unknown/undefined.
 *
 * **Secret of the Silver Blades — 439-byte expanded Gen1 record.** Secret keeps the same
 * name/ability prefix as CoK, but moves the combat tail:
 *   106      u8   THAC0, inverted (60 − byte)
 *   107      u8   category (same 7/6/5 enum)
 *   231      u8   combat-icon size (same +128/">1 = large" encoding as CoK @207)
 *   232..236 u8×5 saving throws
 *   238      u8   hit-dice count
 *   291      u8   damage dice count
 *   292      u8   damage bonus
 *   293      u8   damage die size
 *   297      u8   armour class, inverted (60 − byte)
 *   305      u8   current hit points (mirrored at 437 for 67/70 decoded records)
 *   XP / control_morale: not located yet; reported as 0/undefined.
 */
import type { SavingThrows } from '../ruleset/types.js';
import { readDaxDataBlocks } from './dax.js';

/** CoK full character-record size (kept as the public constant for back-compat). */
export const MONSTER_RECORD_SIZE = 409;
/** Curse of the Azure Bonds Player/monster record size. */
export const COAB_MONSTER_RECORD_SIZE = 422;
/** DoK compact monster-record size. */
export const DOK_MONSTER_RECORD_SIZE = 216;
/** Pool of Radiance early Gen1 monster-record size. */
export const POOL_MONSTER_RECORD_SIZE = 285;
/** Secret of the Silver Blades expanded Gen1 monster-record size. */
export const SECRET_MONSTER_RECORD_SIZE = 439;
/** Gateway's record size collides with CoAB but uses a different combat tail. */
export const GATEWAY_MONSTER_RECORD_SIZE = 422;
/** Treasures expands the Savage Frontier record rather than retaining Gateway's layout. */
export const TREASURES_MONSTER_RECORD_SIZE = 510;
const NAME_OFFSET = 1;
const NAME_MAX = 15;
/** The engine stores AC and THAC0 inverted as (60 − value); recover with this base. */
const TO_HIT_BASE = 60;

/** Per-format offset map. `null` = field not present/located in that record format. */
interface MonsterLayout {
  size: number;
  ability: number;
  abilityStride?: 1 | 2;
  thac0: number;
  category: number | null;
  categoryKind?: 'legacy' | 'coab' | 'savage2e';
  race?: number;
  monsterType?: number;
  hp: number | null;
  hpFallback?: number;
  saves: number | null;
  hitDice: number | null;
  dmgNdice: number;
  dmgBonus: number;
  signedDmgBonus?: boolean;
  dmgDsize: number;
  ac: number;
  xp: number | null;
  xpBytes?: 2 | 4;
  /** Combat-icon size byte (offset 207 in CoK) — see {@link decodeCombatSize}. `null` = not located. */
  iconSize: number | null;
  /** Source-footprint size byte — see {@link decodeSourceFootprintSize}. `null` = not located. */
  coabSourceSize: number | null;
  /** `control_morale` byte (offset 231 in CoK) — see {@link decodeMorale}. `null` = not located. */
  morale: number | null;
}

const COK_LAYOUT: MonsterLayout = {
  size: 409,
  ability: 16,
  thac0: 89,
  category: 90,
  categoryKind: 'legacy',
  hp: 98,
  saves: 208,
  hitDice: 214,
  dmgNdice: 269,
  dmgBonus: 270,
  dmgDsize: 271,
  ac: 275,
  xp: 304,
  xpBytes: 2,
  iconSize: 207,
  coabSourceSize: 207,
  morale: 231,
};

const COAB_LAYOUT: MonsterLayout = {
  size: 422,
  ability: 16,
  thac0: 0x199,
  category: null,
  categoryKind: 'coab',
  race: 0x74,
  monsterType: 0x11a,
  hp: 0x1a4,
  hpFallback: 0x78,
  saves: 0xdf,
  hitDice: 0xe5,
  dmgNdice: 0x19e,
  dmgBonus: 0x1a2,
  signedDmgBonus: true,
  dmgDsize: 0x1a0,
  ac: 0x19a,
  xp: 0x127,
  xpBytes: 4,
  iconSize: null,
  coabSourceSize: 0xde,
  morale: 0xf7,
};

// DoK's compact record dropped the PC scratch fields, but the icon-size (@41) and control_morale (@62)
// bytes ARE present — located by the B2-style correlation against shared monsters (CT.7k-3). B5 closed
// hp/saves/hitDice against real GOG DoK MON1CHA records (see the class docstring above for the full
// evidence, including why the @108 hp impostor was ruled out).
// WITHDRAWN 2026-08-21: this comment used to end "XP stays genuinely UNLOCATED after an exhaustive
// byte/u16/u32 exact-match + correlation search". It was located on 2026-08-19 from DoK's own code —
// flat u16 @109 + per-HP multiplier @111, read by `calc_battle_exp` at GAME.OVR:0x4CED and confirmed by
// the CoK-import field table at 0x12DA3 — which is why `xp: 109` sits in the layout below. The class
// docstring's `109..110` entry carries the evidence and the account of why the sweeps missed it.
const DOK_LAYOUT: MonsterLayout = {
  size: 216,
  ability: 16,
  thac0: 31,
  category: 32,
  categoryKind: 'legacy',
  hp: 40,
  saves: 42,
  hitDice: 48,
  dmgNdice: 89,
  dmgBonus: 90,
  dmgDsize: 91,
  ac: 95,
  xp: 109,
  xpBytes: 2,
  iconSize: 41,
  coabSourceSize: 41,
  morale: 62,
};

// Pool's earliest Gen1 MON1CHA record uses one byte per ability score, then a compact combat tail.
// The offsets are byte-located from the real GOG POOLRAD MON1CHA.DAX records: goblin/orc/ogre/vampire
// saves, HP, THAC0, damage, AC, HD, and icon-size all line up with expected AD&D 1e values.
const POOL_LAYOUT: MonsterLayout = {
  size: POOL_MONSTER_RECORD_SIZE,
  ability: 16,
  abilityStride: 1,
  thac0: 45,
  category: null,
  categoryKind: 'legacy',
  hp: 50,
  saves: 109,
  hitDice: 115,
  dmgNdice: 163,
  dmgBonus: 167,
  dmgDsize: 165,
  ac: 169,
  xp: null,
  xpBytes: 2,
  iconSize: 108,
  coabSourceSize: 108,
  morale: null,
};

// Secret's 439-byte record keeps the CoK name/ability prefix but uses a different combat tail.
// Real-byte correlation against shared CoK monsters plus sanity over all 70 Secret records locates
// HP/AC/THAC0/damage/saves/icon size; XP and morale remain unlocated, so decode them as absent.
const SECRET_LAYOUT: MonsterLayout = {
  size: SECRET_MONSTER_RECORD_SIZE,
  ability: 16,
  thac0: 106,
  category: 107,
  categoryKind: 'legacy',
  hp: 305,
  saves: 232,
  hitDice: 238,
  dmgNdice: 291,
  dmgBonus: 292,
  dmgDsize: 293,
  ac: 297,
  xp: null,
  xpBytes: 2,
  iconSize: 231,
  coabSourceSize: 231,
  morale: null,
};

// Gateway descriptor 29 copies these source fields into the runtime combat record at
// GAME.OVR+0x3FDB9..0x3FE3A. This must be selected by profile because CoAB is also 422 bytes.
const GATEWAY_LAYOUT: MonsterLayout = {
  size: GATEWAY_MONSTER_RECORD_SIZE,
  ability: 16,
  thac0: 0x73,
  category: null,
  categoryKind: 'coab',
  race: 0x74,
  monsterType: 0x11a,
  hp: 0xe4,
  saves: 0xdf,
  hitDice: 0xe5,
  dmgNdice: 0x11e,
  dmgBonus: 0x122,
  signedDmgBonus: true,
  dmgDsize: 0x120,
  ac: 0x124,
  xp: 0x127,
  xpBytes: 4,
  iconSize: 0xde,
  coabSourceSize: 0xde,
  morale: 0xf7,
};

// Treasures descriptor 27 performs the equivalent source-to-combat copy at
// GAME.OVR+0x3EEA4..0x3EF1A. The 32-bit experience accumulator is independently consumed at
// 0x172..0x175; this locates the stored value but does not by itself prove the complete combat-award formula.
const TREASURES_LAYOUT: MonsterLayout = {
  size: TREASURES_MONSTER_RECORD_SIZE,
  ability: 16,
  thac0: 0xac,
  category: 0xad,
  categoryKind: 'savage2e',
  hp: 0x137,
  saves: 0x132,
  hitDice: 0x138,
  dmgNdice: 0x16a,
  dmgBonus: 0x16e,
  signedDmgBonus: true,
  dmgDsize: 0x16c,
  ac: 0x170,
  xp: 0x172,
  xpBytes: 4,
  iconSize: 0x131,
  coabSourceSize: 0x131,
  morale: 0x147,
};

/**
 * **Buck Rogers XXVc / Matrix Cubed — 259/263-byte record family (R2, round 34). Deliberately NOT
 * given a `MonsterLayoutProfile` entry below.** Round 33 (`docs/engine/research/buck-containers.md`)
 * found Buck's `mon0cha.dax` decompresses to 54 name-plausible 263-byte records and Matrix Cubed's
 * `MON0CHA.DAX` to 63 name-plausible 259-byte records, neither matching any of the six sizes above,
 * and warned against fitting either to the nearest existing profile.
 *
 * R2 confirmed the two ARE one record family, using Buck's own six pregenerated party members
 * (`chrdata1..6.sav`, 259 bytes each, uncompressed on disk — not inside a DAX container) as a THIRD
 * oracle alongside the 19 monster names Buck and Matrix share:
 *  - **Structural**: a uniqueness sweep over every offset pair `(a, a+158)` in the 259-byte pregen
 *    party (same technique `secretSavedCharacter.ts` uses) finds exactly one non-trivial 7-byte
 *    duplicate block, at `16..22` / `23..29` — all 6 pregens carry `raw[16+i] == raw[23+i]`, with the
 *    septet varying across the party (range 9..21, i.e. wider than classic 3..18 D&D but the same
 *    "current == max at creation" shape CoAB/Secret/etc. use for their own ability blocks) — the
 *    plan's "7-wide 3..18 run and its max twin" oracle, found at 16 rather than assumed there.
 *  - **HP, independently discovered by the SAME uniqueness-sweep technique**: byte 69 mirrors byte
 *    227 on all 6 pregens with 6 DISTINCT nonzero values (26/22/16/16/14/13) — the one other
 *    multi-valued mirror pair the sweep turns up (`54`/`229`, values 15/15/12/12/9/9) is a second,
 *    unidentified field, kept raw rather than misnamed. Cross-title check: Matrix's own monster
 *    "ZANE" (one of the 19 shared names) reads `(4, 4)` at the same `(69, 227)` pair against Buck's
 *    `(8, 8)` — both internally consistent, both plausible small monster HP, at the SAME offset the
 *    pregen oracle names, with **no shift** (see the insertion-point finding below).
 *  - **control_morale-style byte @231**: Buck's own pregens sit ≤ 0x7F here (the "brave, never
 *    checks" gate {@link decodeMorale} already decodes elsewhere in this file); Matrix's "ZANE" reads
 *    148 there against Buck's 128 — both > 0x7F, i.e. both trip the SAME gate at the SAME un-shifted
 *    offset. Exported {@link decodeMorale} so `buckSavedCharacter.ts` can reuse it verbatim.
 *  - **The 4-byte size difference is a genuine mid-record insertion, not a simple truncation**: a
 *    per-offset A/B crossover sweep (`buck[i]` vs `matrix[i]`, the no-shift hypothesis, against
 *    `buck[i+4]` vs `matrix[i]`, the shifted hypothesis; all 19 shared-name pairs, every offset
 *    0..258) shows the no-shift hypothesis winning almost everywhere — INCLUDING at 69/227/231 above
 *    — until a transition zone at offset 249..251, after which the shifted hypothesis wins with
 *    3 offsets (255/257/258) matching on ALL 19 pairs. This lands inside the round-33/round-34-plan
 *    estimate of "~251", corroborated by an oracle round 33 did not use.
 *
 * **What did NOT reproduce, reported rather than silently dropped (ground rule 3): the plan's own
 * "662 shuffled vs 1111 real" insertion-point score.** Neither a raw per-byte-equality sum (real
 * 4280/4921 at k=251 vs a 200-trial shuffled-pairing null of 3719-3896) nor a zero-excluding variant
 * (real 675 vs null 210-378) reproduces those two numbers, AND the raw/zero-excluding score is
 * **NOT even a discriminating oracle for the insertion point** — it ties (675 vs 675, 4280 vs 4240)
 * between k=251 and "no insertion anywhere" (k=259), because only ~8 of 259 offsets fall in the
 * region the insertion could affect and most of those are zero-padding either way. The per-offset
 * A/B crossover above is what actually locates k; it is reported instead of the plan's number, per
 * ground rule 3 ("a bar whose null you cannot reproduce is void, not pass or fail"). Full numbers:
 * `docs/engine/research/buck-record-layout.md`.
 *
 * **Why no `BUCK_LAYOUT`/`MATRIX_LAYOUT` const exists here, despite the above.** `MonsterLayout.ac`
 * and `.thac0` are non-optional — every existing profile supplies a real byte offset, and
 * `decodeMonsterRecord` unconditionally reads `raw[layout.ac]`/`raw[layout.thac0]` with no null path
 * (unlike `category`/`hp`/`saves`/`hitDice`/`xp`/`iconSize`/`morale`, which ARE `| null`). Buck
 * Rogers XXVc is a different (percentile/TECH-based) ruleset from the AD&D titles above, its AC/
 * THAC0 byte(s) were NOT located this round (no digitized XXVc monster-manual table exists in this
 * repo to cross-check against — `hackdocs_extracted/` and this repo have zero Buck-specific hits),
 * and the round's own standing warning is explicit: "do not add a `buck (263)`/`matrix (259)`
 * MonsterLayoutProfile without deriving and testing its field offsets against known monster stats
 * first." Widening `MonsterLayout.ac`/`.thac0` to `number | null` to accommodate a partial profile
 * would ripple into `combat.ts`, `module/validate.ts`, `monchaEncode.ts` and others outside this
 * item's writable-file list. The save-only fields (name/abilities/hp/morale) are instead exposed
 * through the new, independent `buckSavedCharacter.ts` (259-byte layout only, no `ac`/`thac0`
 * fields to fabricate). See that file's doc comment for the full field table, and this file's
 * `sniffMonsterRecord`/`layoutFor` — both correctly return `false`/`null` for 259/263-byte input,
 * which is the honest behaviour until AC/THAC0 are real.
 */

export type MonsterLayoutProfile =
  | 'gateway-to-the-savage-frontier'
  | 'treasures-of-the-savage-frontier'
  | string;

/** Pick the title-scoped offset map, using length only where it is unambiguous. */
function layoutFor(len: number, profileId?: MonsterLayoutProfile): MonsterLayout | null {
  if (len === COK_LAYOUT.size) return COK_LAYOUT;
  if (len === GATEWAY_LAYOUT.size && profileId === 'gateway-to-the-savage-frontier') return GATEWAY_LAYOUT;
  // Neverwinter Nights (DOS/AOL) MONCHA.DAX also collides with COAB_LAYOUT at 422 bytes, but decodes
  // as constant/degenerate AC=60,THAC0=60 under COAB_LAYOUT versus sane, diverse, D&D-plausible
  // values (AC -10..10, THAC0 0..20) for all 100/100 records under GATEWAY_LAYOUT, including the
  // expected DRACOLICH/HOODED MEDUSA names — see
  // docs/engine/research/neverwinter-nights-dos-eclinit.md §6.
  if (len === GATEWAY_LAYOUT.size && profileId === 'neverwinter-nights-dos') return GATEWAY_LAYOUT;
  if (len === COAB_LAYOUT.size) return COAB_LAYOUT;
  if (len === DOK_LAYOUT.size) return DOK_LAYOUT;
  if (len === POOL_LAYOUT.size) return POOL_LAYOUT;
  if (len === SECRET_LAYOUT.size) return SECRET_LAYOUT;
  if (len === TREASURES_LAYOUT.size) return TREASURES_LAYOUT;
  return null;
}

/**
 * What a creature record's `category` means. `'sub'` is a DQK-only tag for records that sit in the
 * bestiary half of `MONCHA.GLB` (`isMonster` = 1) but are **not standalone roster combatants** —
 * currently the five per-colour dragon "HEAD" breath/head sub-entries the parent dragon's combat AI
 * references. They do hold a stat block, but one no combatant gate accepts — a negative stored THAC0 —
 * so they carry a name and this tag and nothing else (see the DQK MONCHA decoder's
 * `isDragonHeadSubRecord` for the byte detail). Corrected 2026-08-21 (fidelity-plan §29) from "records
 * that carry a monster type byte": there is no type byte, the old offset 2 sat inside the member's
 * 2-byte length word.
 */
export type MonsterCategory = 'monster' | 'humanoid' | 'npc' | 'unknown' | 'sub';

export interface MonsterAbilities {
  str: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}

/** A melee damage roll: `count` dice of `sides` sides, plus a flat `bonus`. */
export interface DamageDice {
  count: number;
  sides: number;
  bonus: number;
}

/**
 * A carried item's identity, unfiltered — {@link MonsterRecord.carriedItems}'s element shape (M29.S1).
 * Declared here, not `loaders/monsterSideTables.ts`, to keep that file's existing import direction:
 * it imports types from this file, not the reverse.
 */
export interface CarriedLoot {
  /** Exact runtime `Item.type` used by ECL FIND_ITEM/DESTROY_ITEMS. */
  itemTypeId?: number;
  /** COAB `ItemType` base-type id (`ITEM_FIELD.type`, offset 0x2e). */
  baseTypeId: number;
  /** Stack/quantity count (`ITEM_FIELD.count`, offset 0x39). */
  count: number;
  /**
   * M30.S1 — stored intrinsic value (`ITEM_FIELD.value`, u16 offset 0x3a). `undefined` ⇒ no recorded
   * value (the common case, e.g. common stock like arrows/vials) — a real nonzero value feeds the
   * town shop's real sell formula (`sellOffer`, `town/pricing.ts`) in place of the catalogue's
   * CANDIDATE per-type price (`town/shop.ts`'s `itemPrice`).
   */
  value?: number;
}

/** A decoded CoK monster, with the unparsed record kept for the not-yet-mapped fields. */
export interface MonsterRecord {
  /** DAX block id this monster came from. */
  blockId: number;
  name: string;
  category: MonsterCategory;
  hitPoints: number;
  abilities: MonsterAbilities;
  /**
   * The five 1e saving-throw target numbers (roll d20 ≥ value), byte-located at CoK offset 208-212
   * (M27.S1: `.spell` feeds {@link Combatant.monsterSpellSave}/`TacticalCombatant.save`; the other four
   * columns are decoded but have no consuming mechanic yet — see `combat/combat.ts`'s doc comment).
   * DoK's compact 216-byte record ALSO carries them, at offsets 42..46 — commit fa07892 (2026-08-11)
   * byte-located that window and set `DOK_LAYOUT.saves = 42` in this file, closing what this docstring
   * used to call "gap B5". (The class docstring's own `42..46` entry above carries the evidence: 43/64
   * records reproduce the exact 1e fighter row for their own hd byte @48, and 0/64 do so at any of the
   * other 211 windows.)
   * The field stays optional because {@link readSaves} returns `undefined` for any layout whose
   * `saves` is `null` — a format with no located save block must read as honestly absent rather than
   * fabricate an all-zero placeholder that would mean "always saves". No shipped layout is `null`
   * today (CoK 208, CoAB 0xdf, DoK 42, Pool 109, Secret 232, Gateway 0xdf, Treasures 0x132), so in
   * practice every decoded record does carry saves.
   */
  savingThrows?: SavingThrows;
  /** Armour class (recovered from the inverted store: 60 − byte[275]). */
  armorClass: number;
  /** THAC0 — to-hit armour-class-0 (recovered from 60 − byte[89]). */
  thac0: number;
  /** Hit-dice count. */
  hitDice: number;
  /** Melee damage roll (count d sides + bonus). */
  damage: DamageDice;
  /** Experience-point award for defeating this monster. */
  xp: number;
  /** CoK-only rolled HP input to `calc_battle_exp` (CCH +0x11B); absent in other layouts. */
  rolledHp?: number;
  /** CoK-only per-HP XP multiplier (CCH +0x132); absent in other layouts. */
  perHpXp?: number;
  /**
   * Combat-icon footprint in cells per side: **1** = Small (1×1), **2** = Large (2×2). Decoded from the
   * record's combat-icon size byte (CoK offset 207; CCHFORM "1=small…5=huge, +128, >1 = large"). Undefined
   * only when the field is not located in the record format — callers then fall back to a name heuristic.
   * WITHDRAWN 2026-08-21: this used to name "(DoK compact record)" as that unlocated case. DoK's byte was
   * byte-located at offset 41 by the CT.7k-3 correlation and `DOK_LAYOUT.iconSize = 41` reads it; every
   * layout in this file now carries an `iconSize`, so no shipped format leaves this undefined.
   * See {@link decodeCombatSize}.
   */
  combatSize?: number;
  /**
   * Source combat footprint low bits (`raw size byte & 7`): CoAB `Player.field_DE`, CoK CCH size
   * indicator `0xcf`, or DoK compact size indicator `0x29`. This is separate from {@link combatSize}:
   * source placement distinguishes tall/wide/big footprints (`1..4`) while the current tactical renderer
   * still uses a square size model. Undefined for formats whose equivalent byte is unlocated.
   */
  coabSourceSize?: number;
  /**
   * Combat morale as a **percentage** (0..102), faithful to CoK `morale_check` @0xD83D
   * (`(control_morale & 0x7F)·2`, clamped 102). **Undefined** when the monster never checks morale
   * (`control_morale ≤ 0x7F`, the binary's brave gate) or the field is not located — which today means
   * Pool and Secret, not DoK: WITHDRAWN 2026-08-21, this used to read "or the field is not located
   * (DoK)", but DoK's `control_morale` was byte-located at offset 62 by the same CT.7k-3 correlation and
   * `DOK_LAYOUT.morale = 62` reads it. The combat engine breaks a monster whose morale% drops below its
   * %HP-lost (CT.6). See {@link decodeMorale}.
   */
  morale?: number;
  /**
   * Character/NPC class code, for `category: 'npc'` records only (DQK `MONCHA.GLB` character framing):
   * 2 = fighter/warrior, 5 = magic-user, 8 = cleric, 6 = thief/special (best-effort). Undefined for
   * monster-framed records. See {@link decodeNpcRecord}.
   */
  npcClass?: number;
  /** Character/NPC stored level, for `category: 'npc'` records only. Undefined for monsters. */
  npcLevel?: number;
  /**
   * Provenance of {@link armorClass} when it is **not** read straight from the record's stored byte:
   * `'canon'` would mark an AC injected from a published value. **Nothing sets it today** — no decoder
   * in this engine injects an armour class, and every decoded record's AC comes from data. The field is
   * kept as the audit hook such an injection would have to use, and as the thing a test can assert is
   * absent.
   *
   * RETIRED 2026-08-21 — fidelity-plan §29. Its one producer was the DQK `MONCHA.GLB` short-tail decode,
   * which claimed UMBER HULK's "AC byte equals a valid monchaRLE opcode and was consumed during
   * compression" and injected AD&D's published AC 2. The premise was an artefact of a decoder that
   * consumed each member's 2-byte big-endian length word as RLE control bytes: with the word stripped,
   * UMBER HULK's AC 2 is on disk (raw byte 58 at ability+67) and decodes on the fixed path. Archive-wide
   * `acSource` count is 0.
   */
  acSource?: 'canon';
  /**
   * M23.S2 — innate "heal N HP at the start of every combat round, capped at {@link hitPoints}" special
   * (COAB `Affects.regen_3_hp` / `AffectRegen3Hp`, ticked once per round by `BattleRoundChecks`'s
   * `CheckType.Type_19` sweep). **Not decoded from `MON{n}CHA.DAX`** — this record format has no such
   * byte — it is populated by {@link applyRegenAffect} after joining the monster's `MON{n}SPC.DAX`
   * side-table (`loaders/monsterSideTables.ts`). Undefined for the common case (no regen special).
   */
  regenPerRound?: number;
  /**
   * M24.S1 — innate "halve all incoming weapon damage" special (COAB `Affects.half_damage`,
   * `ovr013.half_damage`, swept every hit by `BattleRoundChecks`'s `CheckType.Type_5` list).
   * **Not decoded from `MON{n}CHA.DAX`** — populated by {@link applyHalfDamageAffect} after joining the
   * monster's `MON{n}SPC.DAX` side-table (`loaders/monsterSideTables.ts`). Undefined for the common
   * case (no half-damage special).
   */
  halfDamage?: boolean;
  /**
   * M26.S1 — the `plus` of each item this monster carries (COAB `Item.plus`, `MON{n}ITM.DAX`'s
   * 63-byte carried-item records), for the post-combat `Σ item.plus·400` XP bonus (`calcBattleExp`,
   * `ovr006.cs calc_battle_exp`). **Not decoded from `MON{n}CHA.DAX`** — populated by
   * {@link applyItemPluses} after joining the monster's `MON{n}ITM.DAX` side-table
   * (`loaders/monsterSideTables.ts`). The full array (including zero/negative pluses) is stored;
   * `calcBattleExp` does the `plus > 0` filtering. Undefined for the common case (no carried items).
   */
  itemPluses?: number[];
  /**
   * M29.S1 — every carried item's identity (`{baseTypeId, count}`), unfiltered — the post-combat
   * loot-table sibling to {@link itemPluses} (same `MON{n}ITM.DAX` decode, keyed on identity instead
   * of `.plus`). **Not decoded from `MON{n}CHA.DAX`** — populated by {@link applyCarriedItems} after
   * joining the monster's `MON{n}ITM.DAX` side-table (`loaders/monsterSideTables.ts`). Whether a
   * `baseTypeId` resolves to a real catalogue entry is `rollTreasure`'s job, not this field's.
   * Undefined for the common case (no carried items).
   */
  carriedItems?: CarriedLoot[];
  /**
   * M28.S1 — a flat Constitution-band bonus added to this monster's own saving-throw *roll* (not the
   * target) against Spell/RodStaffWand saves (COAB `Affects.con_saving_bonus`, `ovr013.cs
   * con_saving_bonus`/`sub_3BE42`). **Not decoded from `MON{n}CHA.DAX`** — populated by
   * {@link applyConSavingBonus} after joining the monster's `MON{n}SPC.DAX` side-table
   * (`loaders/monsterSideTables.ts`), using this record's own already-decoded {@link abilities}`.con`.
   * Undefined for the common case (no such affect, or a Con score outside every band).
   */
  conSaveBonus?: number;
  /**
   * CoAB cloud-protection affect gates joined from `MON{n}SPC.DAX`. These are split to match source:
   * noxious and poisonous movement-entry gates live in `ovr010`, while noxious post-entry exposure uses
   * the narrower `ovr024.in_poison_cloud` affect list. Poisonous post-entry exposure is intentionally
   * not mapped from MON*SPC until a source affect gate is proven.
   */
  noxiousCloudEntryImmune?: boolean;
  noxiousCloudExposureImmune?: boolean;
  poisonCloudEntryImmune?: boolean;
  poisonCloudExposureImmune?: boolean;
  /**
   * M31.S1 — every spell this monster has memorized, as raw DoK global spell numbers (1-126,
   * `hackdocs_extracted/SPELBOOK.TXT`), unfiltered — including duplicates (multiple simultaneous
   * castings of the same spell) and ids with no modelled tactical-combat geometry. **Not decoded from
   * `MON{n}CHA.DAX`** — populated by {@link applyPreparedSpellIds} after joining the monster's
   * `MON{n}WIZ.DAX` side-table (`loaders/monsterSideTables.ts`, DoK-only; CoK has no such file).
   * Whether an id maps to this engine's own spell catalogue is the combat assembly's job (the crosswalk
   * in `ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`), not this field's. Undefined for the common
   * case (no memorized spells — most monsters aren't casters).
   */
  preparedSpellIds?: number[];
  /**
   * The full record, whichever layout {@link layoutFor} selected — 409-byte CoK, 422-byte CoAB/Gateway,
   * 216-byte DoK, 285-byte Pool, 439-byte Secret or 510-byte Treasures. Verified fields are parsed; a
   * few bytes in each layout remain unmapped and are reachable only here.
   */
  raw: Uint8Array;
}

/**
 * Combat-icon footprint from the size byte. CoK stores 1=Small / 2=tall / 3=wide / 4=big / 5=huge, plus
 * +128 for "large even if 1×1"; CCHFORM.TXT: "UA regards as large all combatants … set to a value greater
 * than 1." We collapse to the engine's two tiers (CT.7f): **Large (2×2) iff byte > 1**, else **Small (1×1)**.
 * The 2×2 geometry of a Large icon is the Gold-Box-standard inference (CT.7f); the size **byte** is
 * byte-located (offset 207).
 */
function decodeCombatSize(raw: Uint8Array, off: number | null): number | undefined {
  if (off === null) return undefined;
  return raw[off] > 1 ? 2 : 1;
}

/** Source-footprint value from the raw size indicator; source placement uses exactly `sizeByte & 7`. */
function decodeSourceFootprintSize(raw: Uint8Array, off: number | null): number | undefined {
  if (off === null) return undefined;
  return raw[off] & 7;
}

/**
 * Combat morale % from the `control_morale` byte (VERIFIED against CoK `morale_check` @0xD83D). A monster
 * with the byte > 0x7F checks morale at `(byte & 0x7F)·2` clamped to 102; a byte ≤ 0x7F is the binary's
 * "never checks" (brave) gate → undefined (the engine then never breaks it, like the party/undead).
 */
/**
 * Exported (R2, round 34) so {@link ../buckSavedCharacter.js} can reuse the SAME >0x7F control_morale
 * gate for Buck Rogers' 259-byte XXVc record family — its byte 231 shows the identical convention
 * (cross-checked against a Matrix Cubed monster record: ZANE reads 148/128, both > 0x7F, at the SAME
 * offset a Buck pregen carries a >0x7F byte). No behaviour change for any existing caller.
 */
export function decodeMorale(raw: Uint8Array, off: number | null): number | undefined {
  if (off === null) return undefined;
  const ctrl = raw[off];
  if (ctrl <= 0x7f) return undefined;
  return Math.min((ctrl & 0x7f) * 2, 102);
}

function categoryOf(byte: number): MonsterCategory {
  switch (byte) {
    case 7:
      return 'monster';
    case 6:
      return 'humanoid';
    case 5:
      return 'npc';
    default:
      return 'unknown';
  }
}

function categoryFor(raw: Uint8Array, layout: MonsterLayout): MonsterCategory {
  if (layout.categoryKind === 'coab') {
    const race = layout.race === undefined ? 0xff : raw[layout.race];
    const monsterType = layout.monsterType === undefined ? 0 : raw[layout.monsterType];
    return race === 0 || monsterType !== 0 ? 'monster' : 'humanoid';
  }
  if (layout.categoryKind === 'savage2e') {
    // Treasures' 2e race discriminator uses 6 for monsters; other values are playable/NPC races.
    return layout.category !== null && raw[layout.category] === 6 ? 'monster' : 'humanoid';
  }
  return categoryOf(layout.category === null ? 0 : raw[layout.category]);
}

function readName(raw: Uint8Array): string {
  const len = Math.min(raw[0] ?? 0, NAME_MAX);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = raw[NAME_OFFSET + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function readAbilities(raw: Uint8Array, layout: MonsterLayout): MonsterAbilities {
  const stride = layout.abilityStride ?? 2;
  const a = (slot: number) => raw[layout.ability + slot * stride]; // current byte of each (cur,max) pair unless stride=1
  return { str: a(0), int: a(1), wis: a(2), dex: a(3), con: a(4), cha: a(5) };
}

function readSaves(raw: Uint8Array, base: number | null): SavingThrows | undefined {
  if (base === null) return undefined;
  return {
    paralyzePoisonDeath: raw[base],
    petrifyPolymorph: raw[base + 1],
    rodStaffWand: raw[base + 2],
    breath: raw[base + 3],
    spell: raw[base + 4],
  };
}

function readHp(raw: Uint8Array, layout: MonsterLayout): number {
  if (layout.hp === null) return 0;
  const hp = raw[layout.hp];
  if (hp !== 0 || layout.hpFallback === undefined) return hp;
  return raw[layout.hpFallback];
}

function readSignedByte(v: number): number {
  return v & 0x80 ? v - 0x100 : v;
}

function readXp(raw: Uint8Array, layout: MonsterLayout): number {
  if (layout.xp === null) return 0;
  if (layout.xpBytes === 4) {
    return (
      raw[layout.xp] |
      (raw[layout.xp + 1] << 8) |
      (raw[layout.xp + 2] << 16) |
      (raw[layout.xp + 3] << 24)
    );
  }
  return raw[layout.xp] | (raw[layout.xp + 1] << 8);
}

/** CoK's own `calc_battle_exp` reads these CCH offsets; no other record layout inherits them. */
function readCokXpComponents(raw: Uint8Array, layout: MonsterLayout): Pick<MonsterRecord, 'rolledHp' | 'perHpXp'> {
  if (layout !== COK_LAYOUT) return {};
  return { rolledHp: raw[0x11b], perHpXp: raw[0x132] };
}

/**
 * Decode one decompressed monster record (`blockId` is for provenance only). The record format —
 * Most formats are selected by length. Gateway must supply its profile because its 422-byte length
 * collides with CoAB while using a different combat tail.
 */
export function decodeMonsterRecord(
  raw: Uint8Array,
  blockId = -1,
  profileId?: MonsterLayoutProfile,
): MonsterRecord {
  const layout = layoutFor(raw.length, profileId);
  if (!layout) {
    const reason = raw.length < DOK_MONSTER_RECORD_SIZE ? 'too small' : 'unsupported';
    throw new Error(
      `monster: record ${reason} (${raw.length} bytes for profile ${profileId ?? 'unspecified'})`,
    );
  }
  return {
    blockId,
    name: readName(raw),
    category: categoryFor(raw, layout),
    hitPoints: readHp(raw, layout),
    abilities: readAbilities(raw, layout),
    savingThrows: readSaves(raw, layout.saves),
    armorClass: TO_HIT_BASE - raw[layout.ac],
    thac0: TO_HIT_BASE - raw[layout.thac0],
    hitDice: layout.hitDice === null ? 0 : raw[layout.hitDice],
    damage: {
      count: raw[layout.dmgNdice],
      sides: raw[layout.dmgDsize],
      bonus: layout.signedDmgBonus ? readSignedByte(raw[layout.dmgBonus]) : raw[layout.dmgBonus],
    },
    xp: readXp(raw, layout),
    ...readCokXpComponents(raw, layout),
    combatSize: decodeCombatSize(raw, layout.iconSize),
    coabSourceSize: decodeSourceFootprintSize(raw, layout.coabSourceSize),
    morale: decodeMorale(raw, layout.morale),
    raw,
  };
}

/**
 * A decompressed block looks like a monster record: a known size, a sane name-length byte, and a
 * name that reads as text.
 *
 * The name check was added 2026-08-25 after sweeping all 6347 DAX/DAA blocks we hold. On size and
 * name-length alone the sniffer claimed **927** blocks: 912 real records in `MON*CHA.DAX` plus 15
 * strays that merely happen to be 422 bytes long -- ids 0..13 of Pools of Darkness' `CHEAD.DAX`
 * (a 2x2 portrait family; nameLen reads 10 and the "name" is `03 00 00 00 00 01 00 60 2F 08`) and
 * Treasures of the Savage Frontier `LUCK.DAX#104`. The rule below is the one `sniffDqkMonster`
 * already applies -- stop at the NUL terminator, every byte printable ASCII, at least one letter --
 * and it costs nothing: **912 of 912** genuine records pass it, and 14 of the 15 strays fail.
 *
 * The residual is `LUCK.DAX#104`, whose nameLen is 2 and whose name is `" t"` -- printable, and it
 * contains a letter. It is recorded rather than fitted away. The check that would kill it is "a
 * name does not begin with a space", and the corpus does support it (0 of 912 genuine names start
 * with one, though 481 of 912 contain a space elsewhere, so the rule has to be about the first byte
 * specifically). It is declined because its entire justification is one file: a categorical rule
 * whose only positive evidence is an absence, drawn after seeing the single block it excludes. Take
 * it if a second impostor ever turns up that it also catches. `packages/engine/test/blockSniffScope
 * .test.ts` pins all of these counts, including that one.
 *
 * Note what the corpus can and cannot prove here. The two halves of the name rule -- printable, and
 * at least one letter -- are redundant *against this corpus*: the 14 blocks they reject trip both
 * at once (`03` is unprintable, and the NUL right behind it ends the scan with no letters), so
 * deleting either one alone leaves the sweep green. Only deleting both turns it red. The cases that
 * separate them are built rather than found, in `monster.test.ts`.
 */
export function sniffMonsterRecord(raw: Uint8Array, profileId?: MonsterLayoutProfile): boolean {
  if (layoutFor(raw.length, profileId) === null) return false;
  if (!(raw[0] >= 1 && raw[0] <= NAME_MAX)) return false;
  let letters = 0;
  for (let i = 0; i < raw[0]; i++) {
    const c = raw[NAME_OFFSET + i];
    if (c === 0) break;
    if (c < 0x20 || c > 0x7e) return false;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) letters++;
  }
  return letters > 0;
}

/** Decode every monster in a `MON{n}CHA.DAX` archive (raw container bytes), in block order. */
export function decodeMonsterArchive(bytes: Uint8Array, profileId?: MonsterLayoutProfile): MonsterRecord[] {
  return readDaxDataBlocks(bytes)
    .filter((b) => sniffMonsterRecord(b.raw, profileId))
    .map((b) => decodeMonsterRecord(b.raw, b.blockId, profileId));
}
