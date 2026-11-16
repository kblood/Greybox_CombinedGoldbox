/**
 * MON content port (E3.2a) — emit the DQK Gen2 `MONCHA.GLB` monster format from a decoded MonsterRecord.
 * The encoders are the inverse of the moncha.ts decoder, verified three ways:
 *
 *  1) Member round-trip: `encodeMonchaMember` → `monchaRLE` reproduces the record byte-identically (the
 *     literal-only run stream the lossless port relies on).
 *  2) Archive round-trip: synthetic monsters → `encodeMonchaArchive` → `decodeMonchaGlb` → every Gen1
 *     field (name/AC/THAC0/hit-dice/damage/XP/abilities/saves) survives, and the id table pairs each
 *     monster back by id (`byId`). HP is **not** asserted equal: Gen2 rolls it from hit-dice (engine
 *     convention), so the round-trip preserves hit-dice and the decoder derives HP.
 *  3) Real content port (skip when CoK data absent): real `MON1CHA.DAX` Gen1 monsters → port → re-decode
 *     on the DQK path → the same combat fields match the Gen1 original (a CoK bestiary now loads through
 *     the DQK monster loader).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeMonchaMember,
  dqkRecordLength,
  decodeMonsterArchive,
  decodeMonchaGlb,
  decodeHlib,
  monchaRLE,
  encodeDqkMonsterRecord,
  encodeMonchaMember,
  encodeMonchaArchive,
  portGen1MonsterToGen2,
  type MonsterRecord,
} from '../src/index.js';

function makeMonster(over: Partial<MonsterRecord> = {}): MonsterRecord {
  return {
    blockId: -1,
    name: 'TEST WYRM',
    category: 'monster',
    hitPoints: 42,
    abilities: { str: 18, int: 7, wis: 9, dex: 12, con: 16, cha: 6 },
    savingThrows: { paralyzePoisonDeath: 11, petrifyPolymorph: 12, rodStaffWand: 13, breath: 14, spell: 15 },
    armorClass: 3,
    thac0: 13,
    hitDice: 9,
    damage: { count: 3, sides: 8, bonus: -2 },
    xp: 3000,
    raw: new Uint8Array(0),
    ...over,
  };
}

/** Compare the combat fields that the port preserves (HP excluded — Gen2 rolls it from hit-dice). */
function combatFieldsEqual(src: MonsterRecord, back: MonsterRecord): void {
  expect(back.name).toBe(src.name.slice(0, 16));
  expect(back.armorClass).toBe(src.armorClass);
  expect(back.thac0).toBe(src.thac0);
  expect(back.hitDice).toBe(src.hitDice);
  expect(back.damage).toEqual(src.damage);
  expect(back.xp).toBe(src.xp);
  expect(back.abilities).toEqual(src.abilities);
  expect(back.savingThrows).toEqual(src.savingThrows);
}

describe('encodeMonchaMember — literal-only RLE round-trip', () => {
  it('monchaRLE reproduces the record byte-identically (incl. repeat-opcode-valued bytes)', () => {
    // A record full of bytes that would be *repeat* opcodes (≥0x81) must still survive as literals.
    const rec = Uint8Array.from({ length: 108 }, (_, i) => (i % 2 ? 0xff : i & 0xff));
    const back = monchaRLE(encodeMonchaMember(rec).subarray(2)); // past the length word
    expect(Array.from(back)).toEqual(Array.from(rec));
  });

  it('emits the 2-byte big-endian length word DQK loads before decompressing (§29)', () => {
    const rec = encodeDqkMonsterRecord(makeMonster());
    expect(rec.length).toBe(0x1a0); // the real fixed-part length, not the old 108
    const stream = encodeMonchaMember(rec);
    // DQK's loader reads `(raw[0] << 8) | raw[1]` as the expected output size and starts the RLE at
    // byte 2. Without this word the engine would take our first two control bytes as the length.
    expect((stream[0] << 8) | stream[1]).toBe(rec.length);
    expect(decodeMonchaMember(stream).length).toBe(rec.length);
    expect(Array.from(decodeMonchaMember(stream))).toEqual(Array.from(rec));
    // 416 bytes = 4 literal runs (128+128+128+32), so 2 header + 4 controls + 416 payload.
    expect(stream[2]).toBe(127); // first run: 128 literals → control 127 (decoded as c+1)
    expect(stream.length).toBe(2 + 4 + 0x1a0);
  });

  it('rejects a member whose payload disagrees with its length word', () => {
    const rec = encodeDqkMonsterRecord(makeMonster());
    const bad = encodeMonchaMember(rec);
    bad[1] = (bad[1] + 1) & 0xff; // claim one more byte than the stream produces
    expect(() => decodeMonchaMember(bad)).toThrow(/header declares/);
  });
});

describe('encodeMonchaArchive — MONCHA.GLB round-trip', () => {
  it('packs monsters the DQK decoder reads back, paired by id, with combat fields intact', () => {
    const entries = [
      { id: 100, monster: makeMonster({ name: 'BLACK PUDDING', hitDice: 10, damage: { count: 3, sides: 8, bonus: 0 }, armorClass: 6, thac0: 10, xp: 3000 }) },
      { id: 7, monster: makeMonster({ name: 'BORING BEETLE', hitDice: 5, damage: { count: 5, sides: 4, bonus: 0 }, armorClass: 0, thac0: 15, xp: 270 }) },
      { id: 250, monster: makeMonster({ name: 'NIGHTMARE', hitDice: 7, damage: { count: 2, sides: 4, bonus: 1 }, armorClass: -4, thac0: 13, xp: 650 }) },
    ];
    const glb = encodeMonchaArchive(entries);
    const arc = decodeMonchaGlb(glb, 'MONCHA.GLB');
    expect(arc.total).toBe(entries.length);
    expect(arc.decoded).toBe(entries.length); // all three pass sniffDqkMonster + decode with stats
    for (const e of entries) {
      const back = arc.byId.get(e.id);
      expect(back, `id ${e.id} (${e.monster.name})`).toBeDefined();
      combatFieldsEqual(e.monster, back!);
    }
  });

  it('round-trips a negative AC and a signed damage bonus', () => {
    const m = makeMonster({ name: 'WRAITH', armorClass: -2, thac0: 12, hitDice: 6, damage: { count: 1, sides: 6, bonus: -3 } });
    const arc = decodeMonchaGlb(encodeMonchaArchive([{ id: 1, monster: m }]), 'MONCHA.GLB');
    const back = arc.byId.get(1)!;
    expect(back.armorClass).toBe(-2);
    expect(back.damage.bonus).toBe(-3);
  });
});

// --- Real content port (skip when CoK data is absent) -------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const monPath = resolve(repoRoot, 'Champions of Krynn', 'MON1CHA.DAX');
const dokMonPath = resolve(repoRoot, 'Death Knights of Krynn', 'MON1CHA.DAX');
const dqkMonchaPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK2', 'MONCHA.GLB');

/** The fields the DQK monster sniff requires to be in range — only such monsters port through cleanly. */
function isPortable(m: MonsterRecord): boolean {
  const DIE = new Set([1, 2, 3, 4, 6, 8, 10, 12, 20, 100]);
  return (
    m.thac0 >= 0 && m.thac0 <= 30 &&
    m.armorClass >= -12 && m.armorClass <= 16 &&
    m.hitDice >= 1 && m.hitDice <= 40 &&
    m.damage.count >= 1 && m.damage.count <= 20 &&
    DIE.has(m.damage.sides) &&
    m.name.length >= 1
  );
}

describe('portGen1MonsterToGen2 — real CoK MON1CHA.DAX bestiary onto the DQK monster path', () => {
  it.skipIf(!existsSync(monPath))('Gen1 CoK monsters load losslessly through the DQK decoder', async () => {
    const bytes = new Uint8Array(await readFile(monPath));
    const all = decodeMonsterArchive(bytes);
    const portable = all.filter(isPortable);
    expect(portable.length, 'MON1CHA.DAX must hold portable monster records').toBeGreaterThan(0);

    // Each ported monster re-expands and decodes byte-exact at the member level — through
    // `decodeMonchaMember`, i.e. via the 2-byte length word, the same way DQK's loader reads it.
    for (const m of portable.slice(0, 5)) {
      const rec = portGen1MonsterToGen2(m);
      expect(decodeMonchaMember(encodeMonchaMember(rec)).length).toBe(rec.length);
    }

    // Pack the bestiary into a MONCHA.GLB and read it back through the DQK loader, paired by id.
    const entries = portable.slice(0, 12).map((m, i) => ({ id: 1000 + i, monster: m }));
    const arc = decodeMonchaGlb(encodeMonchaArchive(entries), 'MONCHA.GLB');
    expect(arc.decoded).toBe(entries.length);
    for (const e of entries) {
      const back = arc.byId.get(e.id);
      expect(back, `${e.monster.name} (id ${e.id})`).toBeDefined();
      combatFieldsEqual(e.monster, back!);
    }
  });
});

// --- DoK's compact 216-byte record ports its saves and hit dice (Gap 4, saves/HD half) ---------
//
// The content-port plan's "Gap 4" reads "DoK monster saves/XP/HD zeroed". Two thirds of that is now
// stale: `DOK_LAYOUT` in monster.ts byte-locates saves at 42..46 and hit dice at 48, so the Gen1 ->
// Gen2 port carries both. Only XP is still `null` there. Nothing tested it — monchaEncode's real-data
// coverage was CoK-only, and `encodeDqkMonsterRecord`'s `m.savingThrows ?? NO_SAVES` fallback means a
// regression that dropped DoK's saves would emit an all-zero save block and no gate would notice.
//
// The expected values are read straight off the retail GOG `Death Knights of Krynn/MON1CHA.DAX`
// bytes (2026-08-18), not copied from the loader: GHOUL is block 22, its bytes 42..46 are
// 14 15 16 17 17 and byte 48 is 2; SIVAK is block 33, 11 12 13 13 14 and 6. GHOUL and SIVAK are the
// two records that also appear in CoK's own MON1CHA, which is what made them the cross-title anchors
// the DoK layout was located with in the first place. Asserting the exact rows (rather than merely
// "not all zero") is what makes this able to fail on a one-byte offset slip.
describe('portGen1MonsterToGen2 — DoK 216-byte records keep saves + hit dice through the port', () => {
  it.skipIf(!existsSync(dokMonPath))('DoK GHOUL/SIVAK saving throws and hit dice survive to Gen2', async () => {
    const bytes = new Uint8Array(await readFile(dokMonPath));
    const all = decodeMonsterArchive(bytes);
    expect(all.length, 'DoK MON1CHA.DAX must decode its bestiary').toBeGreaterThan(0);

    const ANCHORS = [
      { name: 'GHOUL', saves: { paralyzePoisonDeath: 14, petrifyPolymorph: 15, rodStaffWand: 16, breath: 17, spell: 17 }, hitDice: 2 },
      { name: 'SIVAK', saves: { paralyzePoisonDeath: 11, petrifyPolymorph: 12, rodStaffWand: 13, breath: 13, spell: 14 }, hitDice: 6 },
    ];

    const entries = ANCHORS.map((a, i) => {
      const src = all.find((m) => m.name.trim() === a.name);
      expect(src, `DoK MON1CHA.DAX must contain ${a.name}`).toBeDefined();
      // The Gen1 decode itself must already carry them — if this fails the loader regressed, not the port.
      expect(src!.savingThrows, `${a.name} Gen1 saves`).toEqual(a.saves);
      expect(src!.hitDice, `${a.name} Gen1 hit dice`).toBe(a.hitDice);
      return { id: 2000 + i, monster: src!, want: a };
    });

    const arc = decodeMonchaGlb(encodeMonchaArchive(entries.map((e) => ({ id: e.id, monster: e.monster }))), 'MONCHA.GLB');
    expect(arc.decoded).toBe(entries.length);
    for (const e of entries) {
      const back = arc.byId.get(e.id);
      expect(back, `${e.want.name} (id ${e.id})`).toBeDefined();
      expect(back!.savingThrows, `${e.want.name} Gen2 saves`).toEqual(e.want.saves);
      expect(back!.hitDice, `${e.want.name} Gen2 hit dice`).toBe(e.want.hitDice);
    }
  });

  // Gap 4's other half CLOSED 2026-08-19: DoK kill XP is at @109..110 (u16 LE flat) with the per-HP
  // multiplier at @111, located from GAME.OVR:0x4CED and the CoK-import table at 0x12DA3, not from a
  // statistical sweep. This test replaces the one that pinned "xp ports as 0" and was written to fail
  // on exactly this day. What it now guards is that the port carries the flat term across, which is
  // the same thing CoK's port carries (CoK's `xp` is also the flat term at 304, not the whole award).
  it.skipIf(!existsSync(dokMonPath))('DoK kill XP ports through as the flat term (Gap 4, closed half)', async () => {
    const all = decodeMonsterArchive(new Uint8Array(await readFile(dokMonPath)));
    expect(all.length).toBeGreaterThan(0);
    // Every record carries a nonzero award — the state before this was located was 0 on all 64.
    expect(all.every((m) => m.xp > 0), 'every DoK monster must carry a kill-XP term').toBe(true);

    const ghoul = all.find((m) => m.name.trim() === 'GHOUL')!;
    expect(ghoul.xp).toBe(65); // identical to CoK's own GHOUL flat term — the cross-title anchor
    const back = decodeMonchaGlb(encodeMonchaArchive([{ id: 2100, monster: ghoul }]), 'MONCHA.GLB').byId.get(2100)!;
    expect(back.xp).toBe(65);

    // The DQK Gen2 record stores XP as a u16 at offset 4, so a large DoK award must survive intact
    // rather than wrapping — IRON GOLEM's 14550 is the corpus maximum and is the case that would break.
    const golem = all.find((m) => m.name.trim() === 'IRON GOLEM')!;
    expect(golem.xp).toBe(14550);
    const golemBack = decodeMonchaGlb(encodeMonchaArchive([{ id: 2101, monster: golem }]), 'MONCHA.GLB').byId.get(2101)!;
    expect(golemBack.xp).toBe(14550);
  });
});

/**
 * cok-m4-fidelity-plan.md §29 (2026-08-20) — the corrected record model, replacing the §26/§27.4/§28
 * assertions that stood here.
 *
 * Every `MONCHA.GLB` member begins with a **2-byte big-endian uncompressed length**; the RLE stream
 * starts at byte 2. DQK's loader reads it at file `0x3570C` and hands it to the decompressor as the
 * bounded expected output size. Decoding from byte 0 — what this project did until §29 — consumed
 * that word as control bytes and left every record out of phase by a record-dependent amount, which
 * is what produced the §26 "0 of 98 fit", the §28 name offsets (0x27/0x22/0x1F) and the garbled names.
 *
 * With the word stripped the layout is uniform and the routine at canonical `2177:257C` makes sense:
 * the fixed part is 0x1A0 = 416 bytes ending with the two counts it reads at `0x19E`/`0x19F`, followed
 * by `[0x19E]` 5-byte entries and `[0x19F]` 17-byte entries, padded to an even length.
 */
describe('DQK MONCHA record model (cok-m4-fidelity-plan §29)', () => {
  /** Offsets the combat-setup routine reads as its two tail-array counts. */
  const CHAIN1 = 0x19e;
  const CHAIN2 = 0x19f;

  it('a ported Gen2 record now reaches the count offsets the routine reads', () => {
    const rec = encodeDqkMonsterRecord(makeMonster());
    expect(rec.length).toBe(0x1a0);
    expect(rec.length).toBeGreaterThan(CHAIN2);
    // The port emits both counts as zero: CoK/DoK monsters carry neither a DQK spell list nor a DQK
    // item chain, and fabricating entries would be invention rather than a port.
    expect(rec[CHAIN1]).toBe(0);
    expect(rec[CHAIN2]).toBe(0);
    expect(dqkRecordLength(0, 0)).toBe(rec.length);
  });

  it.skipIf(!existsSync(dqkMonchaPath))(
    'all 98 members declare their own length, and 97 match len = 0x1A0 + 5*c1 + 17*c2 padded even',
    async () => {
      const lib = decodeHlib(new Uint8Array(await readFile(dqkMonchaPath)), 'MONCHA.GLB');
      const raw = lib.rawMembers.slice(1); // member[0] is the id table
      expect(raw.length).toBe(98);

      // (1) The length word is real: every member's payload expands to exactly what its header says.
      // `decodeMonchaMember` throws on a mismatch, so 98 successful decodes IS the assertion.
      const members = raw.map((m) => decodeMonchaMember(m));
      for (let i = 0; i < raw.length; i++) {
        expect((raw[i][0] << 8) | raw[i][1], 'member ' + (i + 1)).toBe(members[i].length);
      }

      // (2) Every record reaches the count offsets — the shortest is exactly the 0x1A0 fixed part.
      const lens = members.map((m) => m.length);
      expect(Math.min(...lens)).toBe(0x1a0);
      expect(Math.max(...lens)).toBe(598);
      expect(members.every((m) => m.length > CHAIN2)).toBe(true);

      // (3) The two-width tail model. 97 of 98 reproduce exactly. The odd one out is member 27,
      // SAHUAGIN LORD: it declares 0 affects and 0 items yet runs 18 bytes past 0x1A0, and those
      // bytes hold one well-formed item record at +1. A defect in the shipped archive, pinned in
      // moncha.test.ts ('a shipped-archive defect, not a decoder gap').
      const fits = members.filter((m) => m.length === dqkRecordLength(m[CHAIN1], m[CHAIN2]));
      expect(fits.length).toBe(97);

      // The null. (5, 17) is the ONLY width pair in 1..40 x 1..40 that explains >= 97 of the 98 —
      // without this the fit above is just a curve with two free parameters. Median pair explains 9.
      let rivals = 0;
      for (let a = 1; a <= 40; a++) {
        for (let b = 1; b <= 40; b++) {
          if (a === 5 && b === 17) continue;
          const n = members.filter((m) => {
            const t = 0x1a0 + a * m[CHAIN1] + b * m[CHAIN2];
            return m.length === t + (t & 1);
          }).length;
          if (n >= 97) rivals++;
        }
      }
      expect(rivals).toBe(0);
    },
  );

  it.skipIf(!existsSync(dqkMonchaPath))('the length word is what fixes the phase: decoding from byte 0 desyncs', async () => {
    // The pre-§29 behaviour, kept as a live demonstration rather than a claim in a comment: decoding
    // the same member from byte 0 gives a different length AND loses the fixed name offset.
    const lib = decodeHlib(new Uint8Array(await readFile(dqkMonchaPath)), 'MONCHA.GLB');
    const m1 = lib.rawMembers[1];
    const good = decodeMonchaMember(m1);
    const shifted = monchaRLE(m1); // no header strip — the old path
    expect(good.length).toBe(436);
    expect(shifted.length).not.toBe(good.length);

    const nameAt = (d: Uint8Array, off: number) => {
      let s = '';
      for (let k = off; k < off + 16; k++) {
        const b = d[k];
        if (b < 0x20 || b > 0x7e) break;
        s += String.fromCharCode(b);
      }
      return s;
    };
    expect(nameAt(good, 0x68)).toBe('BLACK PUDDING');
    expect(nameAt(shifted, 0x68)).not.toBe('BLACK PUDDING');
  });

  /**
   * §27: the `'moncha1'` family name resolves, in `DQK.EXE`'s own code, to base `"moncha"` + bank `1`
   * through `sprintf(dst, "%s.glb", base)` at canonical `1fc4:0130`, and the id lookup at `1fc4:00c3`
   * keys members as **`bank * 100 + id`** after a raw-id attempt misses. Two consequences of that
   * arithmetic are properties of the shipped id tables, so they are pinned here.
   */
  it.skipIf(!existsSync(dqkMonchaPath))(
    'native MONCHA ids split into the two banks the bank*100+id key implies; the ported archive has no bank 1',
    async () => {
      const idsOf = (bytes: Uint8Array) => {
        const lib = decodeHlib(bytes, 'MONCHA.GLB');
        const t = lib.rawMembers[0]; // u16 count, then count x {u16 id, u16 member}
        const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
        const n = dv.getUint16(0, true);
        return Array.from({ length: n }, (_, i) => ({
          id: dv.getUint16(2 + 4 * i, true),
          member: dv.getUint16(2 + 4 * i + 2, true),
        }));
      };

      const bytes = new Uint8Array(await readFile(dqkMonchaPath));
      const native = idsOf(bytes);
      expect(native.length).toBe(98);
      const bank = (rows: { id: number }[], b: number) => rows.filter((r) => Math.floor(r.id / 100) === b).length;
      expect(bank(native, 0)).toBe(90); // ids 1..99
      expect(bank(native, 1)).toBe(8); // ids 112..119 — the records 'moncha1' names
      expect(Math.max(...native.map((r) => r.id))).toBe(119);

      // §27.5: the port numbers its monsters from 0, so every ported id lands in bank 0 and a 'moncha1'
      // (bank 1) request cannot resolve against ported content at all. This is a property of
      // `encodeMonchaArchive`'s caller, not of DQK.EXE, and it is why the assertion lives here.
      const ported = encodeMonchaArchive(
        [7, 12, 63].map((id) => ({ id, monster: makeMonster({ name: 'M' + id }) })),
      );
      const portedIds = idsOf(ported).map((r) => r.id);
      expect(portedIds).toEqual([7, 12, 63]);
      expect(portedIds.every((id) => id < 100)).toBe(true);
    },
  );

  /**
   * §28, re-stated on the corrected decode: bank 1 is DQK's **named NPC roster**, not more bestiary —
   * "MONCHA" is MONster + CHAracter and the bank digit picks the half. The §28 finding survives the
   * correction; only its offsets change, because the name is at a fixed 0x68 in every member rather
   * than the per-record 0x27/0x22/0x1F the shifted decode reported. Two of the names were also being
   * truncated by the shift: SELIA and TASLEHOFF are really SELIAS and TASSLEHOFF.
   */
  it.skipIf(!existsSync(dqkMonchaPath))('bank 1 resolves to the eight named DQK NPC records', async () => {
    const lib = decodeHlib(new Uint8Array(await readFile(dqkMonchaPath)), 'MONCHA.GLB');
    const t = lib.rawMembers[0];
    const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const n = dv.getUint16(0, true);
    const memberOfId = new Map<number, number>();
    for (let i = 0; i < n; i++) memberOfId.set(dv.getUint16(2 + 4 * i, true), dv.getUint16(2 + 4 * i + 2, true));

    const nameOf = (id: number) => {
      const dec = decodeMonchaMember(lib.rawMembers[memberOfId.get(id)!]);
      let s = '';
      for (let k = 0x68; k < 0x78; k++) {
        const b = dec[k];
        if (b === 0) break;
        s += String.fromCharCode(b);
      }
      return s;
    };

    expect(nameOf(112)).toBe('CAPTAIN DAENOR');
    expect(nameOf(113)).toBe('GRUNSCHKA');
    expect(nameOf(114)).toBe('SELIAS');
    expect(nameOf(115)).toBe('TASSLEHOFF');
    expect(nameOf(116)).toBe('BALDRIC');
    expect(nameOf(117)).toBe('SIR DISCORE');
    expect(nameOf(118)).toBe('ELGYNORA');
    expect(nameOf(119)).toBe('DAWNSHINE');

    // None of the eight is a bestiary record: the is-monster flag at 0x66 is 0 for all of them and 1
    // for all 90 of bank 0's — a cleaner statement of §28.1 than the type byte the shift invented.
    for (const id of [112, 113, 114, 115, 116, 117, 118, 119]) {
      expect(decodeMonchaMember(lib.rawMembers[memberOfId.get(id)!])[0x66], String(id)).toBe(0);
    }
  });

  /**
   * §27.7: control byte 0x80 is a NO-OP in DQK's own decompressor (canonical 00d7:0a1c, file 0x3B8C:
   * `or al,al / jl` then `cmp al,0x80 / je loop`), not a 129-byte literal copy. So a 129-byte literal
   * chunk emitted by `encodeMonchaMember` would round-trip through our decoder and be silently dropped
   * by the real engine. Never exercised by shipped data (0 of 6038 control bytes across DQK
   * MONCHA.GLB + FRUA MONST.GLB), which is exactly why it needs a test — and at the corrected
   * `DQK_RECORD_LEN` of 0x1A0 the encoder now emits multi-run streams, so it is no longer unreachable.
   */
  it('the encoder never emits the 0x80 no-op control, at any record length', () => {
    for (const len of [1, 108, 128, 129, 130, 257, 400, 0x1a0]) {
      const rec = Uint8Array.from({ length: len }, (_, i) => (i * 7 + 3) & 0xff);
      const stream = encodeMonchaMember(rec);
      // Walk the literal-only stream's own control bytes, past the 2-byte length word.
      const controls: number[] = [];
      for (let i = 2; i < stream.length; ) {
        controls.push(stream[i]);
        i += 1 + stream[i] + 1;
      }
      expect(controls.some((c) => c >= 0x80), 'len ' + len + ': control >= 0x80').toBe(false);
      // And it still round-trips through the engine-exact decoder.
      expect([...decodeMonchaMember(stream)], 'len ' + len + ': round-trip').toEqual([...rec]);
    }
  });

  it('monchaRLE treats control 0x80 as a no-op, the way DQK does', () => {
    // 0x80 between two literal runs must contribute nothing at all.
    const stream = Uint8Array.from([0x01, 0xaa, 0xbb, 0x80, 0x00, 0xcc]);
    expect([...monchaRLE(stream)]).toEqual([0xaa, 0xbb, 0xcc]);
  });
});
