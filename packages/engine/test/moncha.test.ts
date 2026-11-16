/**
 * DQK (Gen2) MONCHA.GLB monster-loader tests (Phase C, C4.2).
 *
 * 1) The MONCHA run-length variant ({@link monchaRLE}) — the documented `≤128`-copy / `257−c`-repeat
 *    scheme (one higher boundary + one larger repeat than the DAX/DAA {@link signedByteRLE}).
 * 2) Synthetic record: the verified Gen2 layout (type tag @2, name @24, THAC0 @55, HD @65,
 *    damage @101/103/105, AC @107, all the 60−x inversions) round-trips through the decoder + sniff.
 * 3) Golden (skips if data absent): real `MONCHA.GLB` decodes faithful DQK monsters whose stats match
 *    canon — BLACK PUDDING (AC 6 / HD 10 / 3d8 / THAC0 10) and BORING BEETLE (AC 0 / HD 5 / 5d4).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  monchaRLE,
  signedByteRLE,
  decodeDqkMonsterRecord,
  sniffDqkMonster,
  scanMonsterName,
  reconstructDqkRecord,
  findAbilityBlock,
  decodeMonchaGlb,
  decodeHlib,
  decodeMonchaMember,
  decodeNpcRecord,
  decodeMonchaCarriedItems,
  decodeDqkItemRecord,
  dqkRecordLength,
  MONCHA_MEMBER_27_UNDECLARED_TAIL,
} from '../src/index.js';

/** Valid polyhedral die sizes (mirrors the loader's DIE_SIZES) for the golden range checks. */
const DIE_OK = new Set([1, 2, 3, 4, 6, 8, 10, 12, 20, 100]);

describe('monchaRLE — DQK run-length variant', () => {
  it('copies literals (c ≤ 128) and repeats with the 257−c count', () => {
    // 0x02 → copy 3 literals [aa bb cc]; 0xfe → repeat next byte (257−254=3) ×; 0x00 → copy 1 [99].
    const src = Uint8Array.from([0x02, 0xaa, 0xbb, 0xcc, 0xfe, 0x00, 0x00, 0x99]);
    expect([...monchaRLE(src)]).toEqual([0xaa, 0xbb, 0xcc, 0x00, 0x00, 0x00, 0x99]);
  });

  it('repeats one MORE time than signedByteRLE for the same control byte', () => {
    const src = Uint8Array.from([0xfe, 0x07]); // 0xfe over a single value byte
    expect(monchaRLE(src).length).toBe(3); // 257 − 254
    expect(signedByteRLE(src).length).toBe(2); // 256 − 254 (the DAX scheme)
  });

  // CORRECTED 2026-08-19. This used to assert "0x80 = copy 129 literals", taken from the hackdocs
  // description. DQK's own decompressor says otherwise: canonical 00d7:0a1c (file 0x3B8C) does
  // `or al,al / jl repeat` and then, in the repeat branch, `cmp al,0x80 / je loop` — so 0x80 falls
  // through to the top of the loop having consumed nothing and emitted nothing. The literal branch
  // therefore tops out at control 0x7F = 128 bytes. No shipped data distinguishes the two readings
  // (0 of 6038 control bytes across DQK's MONCHA.GLB and FRUA's MONST.GLB is 0x80), which is why
  // the wrong reading survived; `encodeMonchaMember` is capped at 128 so we never emit one either.
  it('treats 0x80 as a NO-OP, the way the DQK decompressor does', () => {
    // 0x80 contributes nothing, then 0x01 copies two literals.
    expect([...monchaRLE(Uint8Array.from([0x80, 0x01, 0xaa, 0xbb]))]).toEqual([0xaa, 0xbb]);
    // A 0x80 in the middle of a stream is skipped without disturbing either side.
    expect([...monchaRLE(Uint8Array.from([0x00, 0xaa, 0x80, 0x00, 0xbb]))]).toEqual([0xaa, 0xbb]);
  });
});

/**
 * Build a decompressed Gen2 monster record at the verified offsets.
 *
 * RE-ANCHORED (§29): the record is 0x1A0 bytes with the name at 0x68, the ability block at 0x78 and
 * the stat fields at the same `ABILITY_DELTA` deltas from it. The previous version of this helper used
 * name@24 / ability@40 / ac@107, which is the layout our decoder saw while it was decompressing from
 * byte 0 and consuming the member's 2-byte big-endian length word as RLE control bytes. The deltas
 * were always right; the anchor was 0x50 bytes early.
 */
function makeDqkRecord(opts: {
  name: string;
  xp?: number;
  thac0?: number;
  hitDice?: number;
  dmg?: [number, number, number]; // count, sides, bonus
  ac?: number;
  isMonster?: number;
}): Uint8Array {
  const A = 0x78;
  const raw = new Uint8Array(0x1a0);
  raw[0x66] = opts.isMonster ?? 1;
  raw[0x58] = 7; // race 7 = plain monster
  raw[0x54] = (opts.xp ?? 0) & 0xff;
  raw[0x55] = ((opts.xp ?? 0) >> 8) & 0xff;
  for (let i = 0; i < opts.name.length && i < 16; i++) raw[0x68 + i] = opts.name.charCodeAt(i);
  raw[A + 15] = 60 - (opts.thac0 ?? 20); // inverted
  raw[A + 25] = opts.hitDice ?? 1;
  const [dc, ds, db] = opts.dmg ?? [1, 8, 0];
  raw[A + 61] = dc; raw[A + 63] = ds; raw[A + 65] = db;
  raw[A + 67] = 60 - (opts.ac ?? 10); // inverted
  return raw;
}

describe('decodeDqkMonsterRecord — synthetic Gen2 layout', () => {
  it('reads name/THAC0/HD/damage/AC/XP at the verified offsets with the 60−x inversion', () => {
    const raw = makeDqkRecord({ name: 'TEST WYRM', xp: 1234, thac0: 11, hitDice: 8, dmg: [2, 6, 1], ac: 3 });
    expect(sniffDqkMonster(raw)).toBe(true);
    const rec = decodeDqkMonsterRecord(raw, 7);
    expect(rec.name).toBe('TEST WYRM');
    expect(rec.blockId).toBe(7);
    expect(rec.category).toBe('monster');
    expect(rec.thac0).toBe(11);
    expect(rec.armorClass).toBe(3);
    expect(rec.hitDice).toBe(8);
    expect(rec.damage).toEqual({ count: 2, sides: 6, bonus: 1 });
    expect(rec.xp).toBe(1234);
    expect(rec.hitPoints).toBe(Math.round(8 * 4.5)); // average HP from HD
  });

  it('sniff rejects a character record and an empty/garbled name', () => {
    // The discriminator is the byte-grounded is-monster flag at 0x66: 1 for all 90 bank-0 bestiary
    // records, 0 for all 8 bank-1 NPCs (and for the two GNOME records that sit in bank 0).
    expect(sniffDqkMonster(makeDqkRecord({ name: 'CHAR', isMonster: 0 }))).toBe(false);
    const noName = makeDqkRecord({ name: '' });
    expect(sniffDqkMonster(noName)).toBe(false);
    const tooShort = new Uint8Array(50);
    tooShort[0x66] = 1;
    expect(sniffDqkMonster(tooShort)).toBe(false);
  });
});

describe('scanMonsterName — offset-independent name decode', () => {
  it('finds the name at an arbitrary offset (records are variable-length, not fixed @24)', () => {
    const dec = new Uint8Array(80);
    // binary header noise, then the name well past offset 24
    dec.set([0xb4, 0xaf, 0x08, 0x00, 0xfe, 0x00], 0);
    const name = 'GREATR OTYUGH';
    for (let i = 0; i < name.length; i++) dec[40 + i] = name.charCodeAt(i);
    const hit = scanMonsterName(dec);
    expect(hit).not.toBeNull();
    expect(hit!.name).toBe('GREATR OTYUGH');
    expect(hit!.offset).toBe(40);
  });

  it('prefers the longest qualifying run and ignores sub-3-char/letterless noise', () => {
    const dec = new Uint8Array(60);
    for (let i = 0; i < 2; i++) dec[18 + i] = 'AB'.charCodeAt(i); // 2 chars — too short
    const name = 'RED DRAGON';
    for (let i = 0; i < name.length; i++) dec[30 + i] = name.charCodeAt(i);
    expect(scanMonsterName(dec)!.name).toBe('RED DRAGON');
  });

  it('returns null when there is no plausible name', () => {
    expect(scanMonsterName(new Uint8Array([1, 2, 3, 0xff, 0xfe, 0xfd]))).toBeNull();
  });
});

describe('reconstructDqkRecord + findAbilityBlock — inline-compressed stat block', () => {
  it('re-expands an inline-RLE stat block and decodes via the ability anchor', () => {
    // Build the canonical 68-byte stat tail (abilities @0, THAC0 @15, saves @19, HD @25,
    // damage @61/63/65, AC @67 — all relative to ability start), then RLE-compress its head.
    const tail = new Uint8Array(68);
    for (let i = 0; i < 12; i++) tail[i] = 0x0a; // abilities (cur,max ×6)
    tail[15] = 60 - 15; // THAC0 15
    tail[19] = 5; tail[20] = 6; tail[21] = 7; tail[22] = 8; tail[23] = 9; // saves
    tail[25] = 8; // HD
    tail[61] = 2; tail[63] = 6; tail[65] = 1; // damage 2d6+1
    tail[67] = 60 - 3; // AC 3
    // Compressed tail: f5 0a (0a ×12) · fe 00 (00 ×3) · then literal-copy bytes [15..67] (c=52 → 53).
    const lit = tail.slice(15); // 53 bytes
    const comp = Uint8Array.from([0xf5, 0x0a, 0xfe, 0x00, lit.length - 1, ...lit]);

    // Record: header (type 8 @2), a name "ORC" @24, then the compressed tail at the name end (27).
    const dec = new Uint8Array(27 + comp.length);
    dec[2] = 0x08;
    dec[24] = 0x4f; dec[25] = 0x52; dec[26] = 0x43; // ORC
    dec.set(comp, 27);
    // Not yet decodable at fixed offsets (the stat block is still compressed).
    expect(sniffDqkMonster(dec)).toBe(false);

    const rec = reconstructDqkRecord(dec);
    const A = findAbilityBlock(rec);
    expect(A).toBe(27); // abilities land right after the 3-char name
    const mon = decodeDqkMonsterRecord(rec, 9, { ability: A, name: scanMonsterName(dec)!.name });
    expect(mon.name).toBe('ORC');
    expect(mon.thac0).toBe(15);
    expect(mon.hitDice).toBe(8);
    expect(mon.damage).toEqual({ count: 2, sides: 6, bonus: 1 });
    expect(mon.armorClass).toBe(3);
  });

  it('reconstruct is a no-op shape for a record with no scannable name', () => {
    const noName = Uint8Array.from([1, 2, 3, 0xff, 0xfe]);
    expect(reconstructDqkRecord(noName)).toEqual(noName);
  });
});

// --- Golden: real DQK MONCHA.GLB (skips if data absent) ----------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const monchaPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK2', 'MONCHA.GLB');

describe('decodeMonchaGlb — golden DQK MONCHA.GLB', () => {
  it.skipIf(!existsSync(monchaPath))('decodes faithful DQK monsters whose stats match canon', async () => {
    const arch = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    expect(arch.total).toBeGreaterThan(50); // ~98 creature members
    expect(arch.decoded).toBeGreaterThan(0);
    expect(arch.monsters.length).toBe(arch.decoded);

    const byName = new Map(arch.monsters.map((m) => [m.name, m]));
    const pudding = byName.get('BLACK PUDDING');
    expect(pudding).toBeDefined();
    expect(pudding!.armorClass).toBe(6);
    expect(pudding!.hitDice).toBe(10);
    expect(pudding!.thac0).toBe(10);
    expect(pudding!.damage).toEqual({ count: 3, sides: 8, bonus: 0 });
    expect(pudding!.xp).toBe(3000);

    const beetle = byName.get('BORING BEETLE');
    expect(beetle).toBeDefined();
    expect(beetle!.armorClass).toBe(0);
    expect(beetle!.hitDice).toBe(5);
    expect(beetle!.damage).toEqual({ count: 5, sides: 4, bonus: 0 });

    // Every decoded record is a real creature with a non-empty name and a usable HP pool.
    for (const m of arch.monsters) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.hitPoints).toBeGreaterThan(0);
      expect(['monster', 'npc']).toContain(m.category); // monster-framed + character/NPC-framed
    }
  });

  // --- §29 -------------------------------------------------------------------------------------
  // The five tests that used to sit here (C4.2b-2b-1 / -2a / -2b / -2b-ii / -2b-iii) pinned a staged
  // recovery — "reconstruct the inline-compressed stat block", "member-dependent ability offset",
  // "canon-inject UMBERHULK's AC because the compressor ate it" — that existed only to compensate for
  // a decoder which decompressed each member from byte 0 and so consumed its 2-byte big-endian length
  // word as RLE control bytes. With the word stripped, every record is fixed-offset, so the staged
  // machinery has nothing left to do and the assertions below replace it. Its most visible symptom
  // was garbled names: SAUAGIN / IRON OLEM / THENOL FNATIC / SKEL WARROR / UVWW. are all artefacts.

  it.skipIf(!existsSync(monchaPath))('every member decodes at FIXED offsets — name@0x68, ability@0x78 (§29)', async () => {
    const arch = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    expect(arch.total).toBe(98);
    // Full validated stats for 86 of 98, against ~20 under the shifted decode. The 12 that stay out
    // are honest: creatures whose stored damage is 0d0 because their attack is special (GAS SPORE,
    // LICH, the spiders, SEA SNAKE), the five dragon HEAD sub-records, and the CHROMATIC DRAGN boss.
    expect(arch.decoded).toBe(86);
    expect(arch.monsters.length).toBe(arch.decoded);

    // Names are now real words at one fixed offset — the clearest evidence the phase was wrong before.
    const names = new Set(arch.roster.map((e) => e.name));
    for (const n of ['SAHUAGIN', 'IRON GOLEM', 'THENOL FANATIC', 'SKEL WARRIOR', 'LICH', 'UMBER HULK', 'TASSLEHOFF', 'SELIAS']) {
      expect(names.has(n), n).toBe(true);
    }
    for (const garbled of ['SAUAGIN', 'IRON OLEM', 'THENOL FNATIC', 'SKEL WARROR', 'UVWW.', 'TASLEHOFF', 'SELIA']) {
      expect(names.has(garbled), garbled + ' was a decode artefact').toBe(false);
    }

    // Canon cross-checks straight off the fixed offsets, no reconstruction anywhere in the path.
    const byName = new Map(arch.monsters.map((m) => [m.name, m]));
    expect(byName.get('BLACK PUDDING')).toMatchObject({ armorClass: 6, hitDice: 10, thac0: 10, xp: 3000 });
    expect(byName.get('IRON GOLEM')).toMatchObject({ armorClass: 3, hitDice: 18, xp: 14550 });
    expect(byName.get('GHAST')).toMatchObject({ armorClass: 4, hitDice: 4 });
    expect(byName.get('HYDRA')).toMatchObject({ armorClass: 5, thac0: 7, hitDice: 16 });
    expect(byName.get('RED DRAGON')!.armorClass).toBeLessThan(0);

    // BLACK PUDDING's saves are the exact AD&D 1e fighter row for 10 hit dice — five independent
    // bytes agreeing with a published table is not something a mis-phased decode produces.
    expect(byName.get('BLACK PUDDING')!.savingThrows).toEqual({
      paralyzePoisonDeath: 8, petrifyPolymorph: 9, rodStaffWand: 10, breath: 9, spell: 11,
    });

    // No garbage leaked in with the widening.
    for (const m of arch.monsters) {
      expect(m.thac0).toBeGreaterThanOrEqual(0);
      expect(m.thac0).toBeLessThanOrEqual(30);
      expect(m.armorClass).toBeGreaterThanOrEqual(-12);
      expect(m.armorClass).toBeLessThanOrEqual(16);
      expect(DIE_OK.has(m.damage.sides)).toBe(true);
    }
  });

  it.skipIf(!existsSync(monchaPath))('UMBER HULK reads its AC from data — the canon-AC injection is retired (§29)', async () => {
    const arch = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const uh = arch.monsters.find((m) => m.name === 'UMBER HULK');
    expect(uh, 'UMBER HULK decodes').toBeDefined();
    expect(uh!.armorClass).toBe(2); // AD&D MM canon — and now actually present on disk
    expect(uh!.thac0).toBe(12);
    expect(uh!.hitDice).toBe(10);
    // The old path could not find this byte and injected the canon value, flagging it acSource:
    // 'canon'. Nothing in the archive needs that any more, which is the point of the assertion.
    expect(uh!.acSource).toBeUndefined();
    expect(arch.monsters.filter((m) => m.acSource).length).toBe(0);
  });

  it.skipIf(!existsSync(monchaPath))('category comes from the record bytes: isMonster@0x66 + race@0x58 (§29)', async () => {
    const arch = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const cat = (c: string) => arch.roster.filter((e) => e.category === c).map((e) => e.name);

    // race 6 = humanoid. That byte selects exactly the eight humanoid entries — no name heuristics.
    expect(cat('humanoid').sort()).toEqual(
      ['BLACK ROGUE', 'DARK WIZARD', 'SHARKMAN', 'THENOL FANATIC', 'THENOL PRIEST', 'THENOL WARLORD', 'THENOL WARRIOR', 'THENOL WIZARD'].sort(),
    );
    // isMonster = 0 marks the eight bank-1 named NPCs plus three records that live in bank 0: the two
    // GNOMEs and a second BALDRIC (bank 0 and bank 1 each carry one, with different ability spreads —
    // race 7 vs race 6 — so the duplicate name is real data, not a decode artefact).
    expect(cat('npc').sort()).toEqual(
      ['BALDRIC', 'BALDRIC', 'CAPTAIN DAENOR', 'DAWNSHINE', 'ELGYNORA', 'GNOME TINKER', 'GNOME WARRIOR', 'GRUNSCHKA', 'SELIAS', 'SIR DISCORE', 'TASSLEHOFF'].sort(),
    );
    // The five per-colour dragon HEAD records are breath sub-entries, not standalone combatants.
    expect(cat('sub').sort()).toEqual(['BLACK HEAD', 'BLUE HEAD', 'GREEN HEAD', 'RED HEAD', 'WHITE HEAD'].sort());
    for (const e of arch.roster.filter((x) => x.category === 'sub')) expect(e.hasStats, e.name).toBe(false);
  });

  it.skipIf(!existsSync(monchaPath))('named NPCs decode with stored HP, level and class at the NPC deltas (§29)', async () => {
    const arch = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const byName = new Map(arch.monsters.map((m) => [m.name, m]));
    // These are the SAME numbers the pre-§29 test asserted for SELIA / TASLEHOFF — the NPC deltas
    // were always right, it was the name (and the ability anchor) that the shift was mangling.
    const expected: Record<string, { thac0: number; hp: number; level: number; cls: number }> = {
      SELIAS: { thac0: 10, hp: 89, level: 27, cls: 6 },
      TASSLEHOFF: { thac0: 10, hp: 64, level: 22, cls: 6 },
      'CAPTAIN DAENOR': { thac0: 4, hp: 139, level: 30, cls: 3 },
      'SIR DISCORE': { thac0: 4, hp: 151, level: 34, cls: 1 },
    };
    for (const [name, e] of Object.entries(expected)) {
      const r = byName.get(name);
      expect(r, name).toBeDefined();
      expect(r!.category, name).toBe('npc');
      expect(r!.thac0, name).toBe(e.thac0);
      expect(r!.hitPoints, name).toBe(e.hp); // stored HP, not a hit-dice average
      expect(r!.hitDice, name).toBe(0);
      expect(r!.npcLevel, name).toBe(e.level);
      expect(r!.npcClass, name).toBe(e.cls);
    }
    // Undead / intelligent monsters are still not mistaken for characters.
    expect(byName.get('ZOMBIE')?.category).not.toBe('npc');
    expect(byName.get('LICH')?.category).not.toBe('npc');
  });
  it('decodeNpcRecord reads the character deltas from a synthetic record', () => {
    // Ability block at offset A=4: a rolled fighter spread (STR 16), then stats at the NPC deltas.
    const A = 4;
    const rec = new Uint8Array(A + 80);
    // abilities (cur,max) — STR 16, rest 10
    const ab = [16, 16, 10, 10, 10, 10, 12, 12, 14, 14, 11, 11];
    rec.set(ab, A);
    rec[A + 15] = 60 - 5; // THAC0 5
    rec[A + 17] = 64; // HP 64
    rec[A + 19] = 8; // a saving throw
    rec[A + 25] = 12; // level 12
    rec[A + 67] = 60 - 4; // AC 4
    rec[A + 71] = 2; // class 2 = fighter
    const npc = decodeNpcRecord(rec, 7, A, 'TEST FIGHTER');
    expect(npc).not.toBeNull();
    expect(npc!.category).toBe('npc');
    expect(npc!.name).toBe('TEST FIGHTER');
    expect(npc!.thac0).toBe(5);
    expect(npc!.hitPoints).toBe(64);
    expect(npc!.hitDice).toBe(0);
    expect(npc!.armorClass).toBe(4);
    expect(npc!.npcLevel).toBe(12);
    expect(npc!.npcClass).toBe(2);
    expect(npc!.abilities.str).toBe(16);
    // Implausible stats (THAC0 out of range) → null.
    const bad = new Uint8Array(A + 80);
    bad.set(ab, A);
    bad[A + 15] = 10; // THAC0 = 60-10 = 50, out of range
    bad[A + 17] = 40;
    bad[A + 25] = 10;
    expect(decodeNpcRecord(bad, 7, A, 'BAD')).toBeNull();
  });

  it.skipIf(!existsSync(monchaPath))('decodes the FULL bestiary roster (names for all 98 members)', async () => {
    const arch = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    // Names for (essentially) the whole library — a big widening over the validated-stat subset.
    expect(arch.named).toBeGreaterThanOrEqual(arch.total - 1);
    expect(arch.roster.length).toBe(arch.named);
    expect(arch.named).toBeGreaterThan(arch.decoded); // many more named than fully stat-decoded

    const names = new Set(arch.roster.map((e) => e.name));
    // Spot-check across the bestiary: a beholder, a dragon, the Thenol troops, and named bosses.
    for (const n of ['BLACK PUDDING', 'RED DRAGON', 'BLACK DRAGON', 'SHAMBLING MOUND', 'CAPTAIN DAENOR', 'DAWNSHINE']) {
      expect(names.has(n)).toBe(true);
    }
    // The validated-stat members are flagged in the roster and present in `monsters`.
    const statNames = new Set(arch.monsters.map((m) => m.name));
    for (const e of arch.roster) {
      if (e.hasStats) expect(statNames.has(e.name)).toBe(true);
    }
    expect(arch.roster.filter((e) => e.hasStats).length).toBe(arch.decoded);
    // Member indices are unique and 1-based.
    const idx = arch.roster.map((e) => e.memberIndex);
    expect(new Set(idx).size).toBe(idx.length);
    expect(Math.min(...idx)).toBeGreaterThanOrEqual(1);
  });
});

// --- The 5-byte tail entries are special-ability (affect) records, not spells ----------------
/**
 * `dqkRecordLength`'s widths were solved from the shipped lengths (§29.3), but the 5-byte array
 * was NAMED `spellCount`/`SPELL_ENTRY` on the strength of "the wizards carry the largest counts".
 * They are special-ability records. This suite pins both the evidence and its null: if the entries
 * were spells, the top of the count ranking would be casters, and it is not — it is undead.
 *
 * Field layout per hackdocs `CCHFORM.TXT`: `{u8 code, u8 zero-for-constant, u16 duration in rounds
 * (0 = permanent), u8 level of effect (255 = N/A)}`.
 */
describe.skipIf(!existsSync(monchaPath))('MONCHA 5-byte tail = special-ability records', () => {
  const AFFECT_COUNT = 0x19e;
  const ITEM_COUNT = 0x19f;
  const FIXED_LEN = 0x1a0;

  async function tails() {
    const arch = decodeHlib(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const out: { name: string; affects: number[][]; count: number }[] = [];
    for (let m = 1; m < arch.rawMembers.length; m++) {
      const raw = decodeMonchaMember(arch.rawMembers[m]!);
      if (raw.length < FIXED_LEN) continue;
      const n = raw[AFFECT_COUNT]!;
      const affects: number[][] = [];
      for (let k = 0; k < n; k++) {
        affects.push([...raw.subarray(FIXED_LEN + k * 5, FIXED_LEN + (k + 1) * 5)]);
      }
      const nameBytes = raw.subarray(0x68, 0x78);
      const end = nameBytes.indexOf(0);
      out.push({
        name: new TextDecoder('latin1').decode(end < 0 ? nameBytes : nameBytes.subarray(0, end)).trim(),
        affects,
        count: raw[ITEM_COUNT]!,
      });
    }
    return out;
  }

  it('every entry fits the CCHFORM special-ability layout, sentinels included', async () => {
    const all = (await tails()).flatMap((t) => t.affects);
    expect(all.length).toBe(285);
    // Byte 4 is "set to zero for constant effect" — zero in every shipped entry.
    expect(all.every((a) => a[4] === 0)).toBe(true);
    // Duration is a u16 whose high byte never fires (max observed 100 rounds).
    expect(all.every((a) => a[2] === 0)).toBe(true);
    const permanent = all.filter((a) => a[1] === 0 && a[2] === 0).length;
    const naLevel = all.filter((a) => a[3] === 255).length;
    const both = all.filter((a) => a[1] === 0 && a[2] === 0 && a[3] === 255).length;
    // The two independent sentinels — "0 = permanent" and "255 = N/A" — pick out the same entries.
    expect({ permanent, naLevel, both }).toEqual({ permanent: 227, naLevel: 227, both: 226 });
    // Timed effects carry round-numbered combat durations, not arbitrary bytes.
    const durations = [...new Set(all.filter((a) => a[1] !== 0).map((a) => a[1]))].sort((x, y) => x - y);
    expect(durations).toEqual([4, 5, 7, 8, 10, 11, 12, 14, 15, 16, 20, 30, 40, 50, 80, 100]);
  });

  it('the count ranking is undead, not casters — the null for the spell reading', async () => {
    const t = await tails();
    const top = [...t].sort((a, b) => b.affects.length - a.affects.length).slice(0, 8).map((x) => x.name);
    // MUMMY, VAMPIRE, VAMPIRE THIEF and SKEL WARRIOR cast nothing. Under a "spells" reading their
    // presence here is unexplained; under "special abilities" it is the expected result.
    expect(top).toContain('MUMMY');
    expect(top).toContain('VAMPIRE');
    expect(top).toContain('VAMPIRE THIEF');
    const nonCasterUndead = ['MUMMY', 'VAMPIRE', 'VAMPIRE THIEF', 'SKEL WARRIOR', 'SPECTRAL MINION'];
    for (const nm of nonCasterUndead) {
      const e = t.find((x) => x.name === nm);
      expect(e, `${nm} is in the bestiary`).toBeTruthy();
      expect(e!.affects.length, `${nm} carries entries despite casting nothing`).toBeGreaterThanOrEqual(5);
    }
    // And the members with none are the plain physical monsters / plain fighters.
    const zero = t.filter((x) => x.affects.length === 0).map((x) => x.name);
    expect(zero.length).toBe(18);
    for (const nm of ['HYDRA', 'ETTIN', 'MINOTAUR', 'GIANT TROLL', 'BORING BEETLE', 'HUGE BAT']) {
      expect(zero, `${nm} has no special abilities`).toContain(nm);
    }
    // 82% of a bestiary casting spells is not credible; 82% having an ability is.
    expect(t.filter((x) => x.affects.length > 0).length).toBe(80);
  });
});

// --- The 17-byte tail entries are the creature's carried equipment ---------------------------
/**
 * These were counted (as `itemCount`) but never read. They are ordinary 17-byte `item.dat`
 * records — the same record `DQK_ITEM_SIZE` pins against DQK's own `DISK1/ITEM.DAT`.
 *
 * The discriminator is a structural identity with a real null: a monster's stock kit names
 * itself, so the primary noun (byte 3) should equal the base-type id (byte 0). Reading the tail
 * at a shifted offset destroys that immediately.
 */
describe.skipIf(!existsSync(monchaPath))('MONCHA 17-byte tail = carried item records', () => {
  it('89 of 106 entries name their own base type — against 0/0/0/1 for shifted reads', async () => {
    const arch = decodeHlib(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const raws: Uint8Array[] = [];
    for (let m = 1; m < arch.rawMembers.length; m++) {
      const dec = decodeMonchaMember(arch.rawMembers[m]!);
      if (dec.length < 0x1a0) continue;
      const n = dec[0x19f]!;
      const base = 0x1a0 + 5 * dec[0x19e]!;
      for (let k = 0; k < n; k++) {
        const at = base + k * 17;
        if (at + 17 <= dec.length) raws.push(dec.subarray(at, at + 17));
      }
    }
    expect(raws.length).toBe(106);
    // Count only non-zero matches: an unfiltered count scores 44 at shift 2 purely on `0 === 0`,
    // which would make the null look like signal.
    const hits = (shift: number) =>
      raws.filter((r) => r[shift] !== 0 && r[shift] === r[shift + 3]).length;
    expect({ aligned: hits(0), s1: hits(1), s2: hits(2), s3: hits(3), s4: hits(4) }).toEqual({
      aligned: 89,
      s1: 0,
      s2: 0,
      s3: 0,
      s4: 1,
    });
  });

  it('every carried item indexes the real ITEMS.DAT catalogue and reads sanely', async () => {
    const arch = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const items = arch.roster.flatMap((e) => e.items);
    expect(items.length).toBe(106);
    expect(arch.roster.filter((e) => e.items.length > 0).length).toBe(28);
    // 128-record catalogue: every base-type pointer must land inside it.
    expect(items.every((i) => i.baseTypeId < 128)).toBe(true);
    // Documented sentinels on real bestiary kit.
    expect(items.filter((i) => i.cursed).length).toBe(0);
    expect(items.filter((i) => i.charges === 0).length).toBe(105);
    expect(items.filter((i) => i.specialCode === 0).length).toBe(97);
    expect(items.filter((i) => i.specialCode === 128).length).toBe(7);
    // BLACK ROGUE and THENOL WARLORD both carry base type 18 — the Long Sword.
    for (const nm of ['BLACK ROGUE', 'THENOL WARLORD']) {
      const e = arch.roster.find((x) => x.name === nm);
      expect(e, `${nm} is in the bestiary`).toBeTruthy();
      expect(e!.items.map((i) => i.baseTypeId), `${nm} carries a long sword`).toContain(18);
    }
  });
});

/**
 * Member 27 (SAHUAGIN LORD) — the one member `dqkRecordLength` cannot reproduce.
 *
 * Pinned here so the 97/98 in `monchaEncode.test.ts` has a named cause instead of a footnote, and
 * so that "the decoder returns no items for this member" is a recorded decision rather than an
 * accident. If a future change starts recovering the record, this test goes red on purpose: the
 * count byte is what the retail engine reads, so recovering it would make our roster wrong.
 */
describe('MONCHA member 27 — a shipped-archive defect, not a decoder gap', () => {
  it.skipIf(!existsSync(monchaPath))('has 18 bytes its own counts do not declare', async () => {
    const lib = decodeHlib(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const m = decodeMonchaMember(lib.rawMembers[27]!); // rawMembers[0] is the id table
    expect(m.length).toBe(434);
    expect([m[0x19e], m[0x19f]]).toEqual([0, 0]); // affectCount, itemCount
    expect(m.length - 0x1a0).toBe(MONCHA_MEMBER_27_UNDECLARED_TAIL);
    // It is the ONLY member of 98 whose declared counts miss its length.
    const off = lib.rawMembers
      .slice(1)
      .map((r) => decodeMonchaMember(r))
      .filter((d) => d.length !== dqkRecordLength(d[0x19e]!, d[0x19f]!));
    expect(off.length).toBe(1);
  });

  it.skipIf(!existsSync(monchaPath))('reads those bytes as one item record at +1, not at the base', async () => {
    const lib = decodeHlib(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    const m = decodeMonchaMember(lib.rawMembers[27]!);
    const at1 = decodeDqkItemRecord(m.subarray(0x1a1, 0x1a1 + 17), 0);
    // Non-zero self-naming, and every field inside the 106-item population's range.
    expect(at1.baseTypeId).toBe(37);
    expect(at1.nameCodes[0]).toBe(37);
    expect(at1.encumbrance).toBe(100);
    expect(at1.value).toBe(6);
    expect(at1.ready).toBe(true);
    expect(at1.cursed).toBe(false);
    // The null: the same 17 bytes at the count-driven base are junk, and their name-identity is the
    // `0 === 0` artefact rather than a second candidate alignment.
    const at0 = decodeDqkItemRecord(m.subarray(0x1a0, 0x1a0 + 17), 0);
    expect(at0.baseTypeId).toBe(0);
    expect(at0.encumbrance).toBe(25637); // population max is 450
  });

  it.skipIf(!existsSync(monchaPath))('is left undecoded, because the count byte is what the game reads', async () => {
    const lib = decodeHlib(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    expect(decodeMonchaCarriedItems(decodeMonchaMember(lib.rawMembers[27]!))).toEqual([]);
    const arc = decodeMonchaGlb(new Uint8Array(await readFile(monchaPath)), 'MONCHA.GLB');
    expect(arc.roster[26]!.name).toBe('SAHUAGIN LORD');
    expect(arc.roster[26]!.items).toEqual([]);
  });
});
