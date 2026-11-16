/**
 * MON content port (E3.2a) — emit the DQK (Gen2) `MONCHA.GLB` monster format from a decoded
 * {@link MonsterRecord}, so a Champions/Death-Knights (Gen1 `.CCH`-family) bestiary entry can be loaded
 * by the DQK engine's monster path ({@link decodeMonchaGlb}). Second piece of the PRIMARY native goal's
 * content port (after E3.1 GEO); it writes through the E1 HLIB writer.
 *
 * **The record-layout drift this bridges.** The two monster formats store the *same* combat fields but
 * at different offsets and with a different container:
 *   - **Gen1 (CoK 409-byte / DoK 216-byte):** name length-prefixed at offset 1; abilities @16; THAC0/AC
 *     stored inverted (`60 − x`); the archive is a `MON{n}CHA.DAX` (one monster per DAX block).
 *   - **Gen2 (DQK):** a fixed-width record — type tag `0x08` @2, XP @4, a 16-byte name field @24,
 *     abilities @40, THAC0 @55, saves @59, hit-dice @65, damage @101/103/105, AC @107 (the same `60 − x`
 *     inversion) — each **monchaRLE-compressed**, the records packed (with an id table) into `MONCHA.GLB`,
 *     an HLIB `DATA` library (`magic=1`).
 *
 * So porting a Gen1 monster is loss-free for every field Gen1 carries: re-lay the decoded values into the
 * Gen2 fixed offsets and compress. The offsets here mirror moncha.ts's `DQK_LAYOUT` / `ABILITY_DELTA`
 * (the decoder is the single source of truth); the round-trip is proven by decoding the emitted
 * `MONCHA.GLB` straight back through {@link decodeMonchaGlb} against a real CoK `MON1CHA.DAX` in
 * `monchaEncode.test.ts`.
 *
 * **Compression.** Each member is emitted with a **literal-only** {@link monchaRLE} stream (control byte
 * `n−1` then `n ≤ 129` literal bytes). That is a valid MONCHA run stream the decoder reads back exactly,
 * and being literal-only it sidesteps the original format's data-encoding pathology where an AC/stat byte
 * equal to a repeat opcode is consumed by the compressor (the "UMBERHULK AC" failure mode) — so the port
 * is guaranteed lossless, the same reasoning E1 uses for HLIB raw draw-method 16.
 */
import type { MonsterRecord } from './monster.js';
import { encodeHlibDataLibrary } from './hlibEncode.js';

/** The engine stores AC and THAC0 inverted as (60 − value). */
const TO_HIT_BASE = 60;

/**
 * The DQK monster fixed-offset layout (mirrors moncha.ts `DQK_LAYOUT` + `ABILITY_DELTA`, the canonical
 * "clean" record the decoder validates first via `sniffDqkMonster`). ability = 40 and every stat sits at
 * its standard delta from there, so the emitted record decodes on the fast fixed-offset path.
 */
const OUT = {
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
} as const;

/** `race` 7 = plain monster, matching all 90 bank-0 records that are not humanoids. */
const RACE_MONSTER = 7;

/**
 * A DQK record's **fixed part** is 0x1A0 = 416 bytes, ending with the two tail-array counts at
 * `0x19E` (5-byte spell entries) and `0x19F` (17-byte item entries). This is the length the shipped
 * archive uses: its shortest member is exactly 416 bytes with both counts zero, and
 * `len = 0x1A0 + 5·spells + 17·items` rounded up to even reproduces the stored length of 97 of the 98
 * members (see `dqkRecordLength` in moncha.ts for the solve and its null).
 *
 * This **replaces the 108-byte record** documented here as a port gap on 2026-08-19
 * (`cok-m4-fidelity-plan.md` §26.3). That gap was real but mis-stated: the native members were
 * measured at "88..533 bytes, median 321" through a decoder that was two bytes out of phase, and
 * their true range is 416..598. A ported member now reaches the `0x19E`/`0x19F` offsets DQK's
 * combat-setup routine at `2177:257C` reads, instead of stopping 306 bytes short of them. The port
 * still emits both counts as **0** — CoK/DoK monsters carry neither a DQK spell list nor a DQK item
 * chain, and fabricating entries is not a port. See §29.
 */
const DQK_RECORD_LEN = 0x1a0;

/**
 * All-zero saves for a Gen1 record whose saves are genuinely unlocated. This is now a fallback for
 * layouts that carry no save block at all — **not** for DoK. The comment here used to say "DoK's
 * compact record", which was true when written and is not any more: `DOK_LAYOUT` in monster.ts
 * byte-locates DoK's saves at 42..46 (43/64 records reproduce the exact AD&D 1e fighter row keyed off
 * their own hit-dice byte, and 0/64 do so at any of the other 211 candidate windows — see
 * `docs/engine/research/dok-save-key-sweep.md`), so a DoK monster reaches this encoder with a real
 * `savingThrows` object and never takes this branch. Pinned by monchaEncode.test.ts's DoK
 * GHOUL/SIVAK anchors, which fail if the fallback starts being used again.
 */
const NO_SAVES = { paralyzePoisonDeath: 0, petrifyPolymorph: 0, rodStaffWand: 0, breath: 0, spell: 0 };

/**
 * Serialise a decoded monster into one **decompressed** DQK Gen2 record (the clean fixed-offset layout).
 * Carries every field Gen1 stores. For DoK that now includes saving throws (@42..46), hit dice (@48)
 * **and kill XP (@109..110)** — the last of these located 2026-08-19 from `GAME.OVR` rather than from a
 * statistical sweep (see the XP paragraph in monster.ts), which closes what the content-port plan called
 * Gap 4. One caveat the port must respect: `xp` is the FLAT term only, in both Gen1 titles and here. The
 * engine's real award is `xp + perHpByte * rolledHp`, and Gen2's 108-byte record has the same shape, so
 * a per-HP multiplier is not something this encoder invents or drops — it simply is not part of
 * `MonsterRecord`. Anything else a layout lacks is written as its decoded value, i.e. 0. The caller decides
 * whether such a record is portable (a monster with HD 0 won't pass the engine's monster sniff; see the
 * module note). Inverts AC/THAC0 with `60 − x` and writes the damage bonus as a raw signed byte.
 */
export function encodeDqkMonsterRecord(m: MonsterRecord): Uint8Array {
  const out = new Uint8Array(DQK_RECORD_LEN);
  out[OUT.isMonster] = 1;
  out[OUT.race] = RACE_MONSTER;
  out[OUT.xp] = m.xp & 0xff;
  out[OUT.xp + 1] = (m.xp >> 8) & 0xff;

  const name = m.name.slice(0, OUT.nameMax);
  for (let i = 0; i < name.length; i++) out[OUT.name + i] = name.charCodeAt(i) & 0x7f;

  const a = m.abilities;
  const scores = [a.str, a.int, a.wis, a.dex, a.con, a.cha];
  for (let i = 0; i < 6; i++) {
    out[OUT.ability + i * 2] = scores[i] & 0xff; // current
    out[OUT.ability + i * 2 + 1] = scores[i] & 0xff; // max (mirror — decoder reads current only)
  }

  out[OUT.thac0] = (TO_HIT_BASE - m.thac0) & 0xff;

  const s = m.savingThrows ?? NO_SAVES;
  out[OUT.saves] = s.paralyzePoisonDeath & 0xff;
  out[OUT.saves + 1] = s.petrifyPolymorph & 0xff;
  out[OUT.saves + 2] = s.rodStaffWand & 0xff;
  out[OUT.saves + 3] = s.breath & 0xff;
  out[OUT.saves + 4] = s.spell & 0xff;

  out[OUT.hitDice] = m.hitDice & 0xff;
  out[OUT.dmgNdice] = m.damage.count & 0xff;
  out[OUT.dmgDsize] = m.damage.sides & 0xff;
  out[OUT.dmgBonus] = m.damage.bonus & 0xff; // signed bonus stored as a raw byte (decoder reads it signed)
  out[OUT.ac] = (TO_HIT_BASE - m.armorClass) & 0xff;
  return out;
}

/** Longest literal run a MONCHA control byte can express: control `c` copies `c + 1` bytes for
 * `c ≤ 0x7F`, so 128 — **not** 129. Control 0x80 is not a 129-literal copy; DQK's own decompressor
 * (canonical 00d7:0a1c) treats it as a no-op that emits nothing, so a 129-byte chunk emitted here
 * would be silently DROPPED by the real engine while round-tripping fine through our own decoder.
 * Unreachable at today's `DQK_RECORD_LEN` of 108, but it sits directly on the path of the §26.3
 * longer-record direction, which is why it is fixed now rather than when it first bites. */
const MAX_LITERAL_RUN = 128;

/**
 * Compress a decompressed record into a **literal-only** MONCHA run stream: control byte `n−1` followed
 * by `n` literal bytes, `n ≤ 128` ({@link MAX_LITERAL_RUN}). {@link monchaRLE} reads each control
 * `c < 0x80` as "copy c+1 literals", so this round-trips byte-exact and never emits either a repeat
 * opcode or the 0x80 no-op (the lossless guarantee — see the module note).
 */
export function encodeMonchaMember(record: Uint8Array): Uint8Array {
  // The 2-byte big-endian uncompressed length DQK's loader reads before decompressing (it passes the
  // value to the decompressor as its bounded expected-output size). Emitting the stream without it —
  // as this encoder did until §29 — makes the engine read our first two RLE bytes as the length, so
  // every ported member decodes to the wrong size on real hardware while round-tripping perfectly
  // through our own reader.
  const out: number[] = [(record.length >> 8) & 0xff, record.length & 0xff];
  let i = 0;
  while (i < record.length) {
    const run = Math.min(record.length - i, MAX_LITERAL_RUN);
    out.push(run - 1);
    for (let k = 0; k < run; k++) out.push(record[i++]);
  }
  return Uint8Array.from(out);
}

/** One monster to place in a Gen2 `MONCHA.GLB`. `id` is the logical id ECL uses to summon it. */
export interface MonchaPortEntry {
  id: number;
  monster: MonsterRecord;
}

/** Build the id-table member: `u16 count`, then `count × {u16 id, u16 member}` (member = 1-based slot). */
function encodeIdTable(ids: number[]): Uint8Array {
  const out = new Uint8Array(2 + 4 * ids.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, ids.length, true);
  for (let i = 0; i < ids.length; i++) {
    dv.setUint16(2 + 4 * i, ids[i] & 0xffff, true); // id (areaId namespace ECL.GLB shares)
    dv.setUint16(2 + 4 * i + 2, i + 1, true); // member index (member[0] is this table)
  }
  return out;
}

/**
 * Pack monsters into a complete DQK `MONCHA.GLB`: member[0] = the id table, then one literal-RLE-
 * compressed Gen2 monster record per entry, all wrapped in an HLIB `DATA` library (`magic=1`) through
 * E1's {@link encodeHlibDataLibrary}. Round-trips through {@link decodeMonchaGlb}. This is what the
 * CoK/DoK → DQK port emits for the bestiary.
 */
export function encodeMonchaArchive(entries: MonchaPortEntry[]): Uint8Array {
  const members: Uint8Array[] = [encodeIdTable(entries.map((e) => e.id))];
  for (const e of entries) members.push(encodeMonchaMember(encodeDqkMonsterRecord(e.monster)));
  return encodeHlibDataLibrary(members, { tag: 'DATA', magic: 1 });
}

/**
 * Port a Gen1 (CoK/DoK) decoded monster to a Gen2 `MONCHA.GLB` member (decompressed). Named alias of
 * {@link encodeDqkMonsterRecord} for the port pipeline; pair with {@link encodeMonchaMember} /
 * {@link encodeMonchaArchive} to compress + pack.
 */
export function portGen1MonsterToGen2(m: MonsterRecord): Uint8Array {
  return encodeDqkMonsterRecord(m);
}
