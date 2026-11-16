import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRUA_MONSTER_OFFSETS as O,
  FRUA_GAME001_OFFSETS,
  FRUA_MONSTER_RECORD_SIZE,
  applyFruaMonsterOverrides,
  decodeFruaMonstGlb,
  decodeFruaMonsterCatalogue,
  decodeFruaMonsterRecord,
  encodeHlibDataLibrary,
  encodeHlibSetIdTable,
  fruaMonsterSlotFromFileName,
  importFruaDesign,
  type FruaGlobalMonsterProvenance,
  type FruaMonsterAttack,
} from '../src/index.js';

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

function putU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >>> 8;
}

function putName(bytes: Uint8Array, name: string): void {
  bytes.fill(0, O.name, O.name + O.nameBytes);
  bytes.set(Array.from(name).map((char) => char.charCodeAt(0)), O.name);
}

function fixtureRecord(name: string): Uint8Array {
  const raw = new Uint8Array(FRUA_MONSTER_RECORD_SIZE);
  putName(raw, name);
  putU16(raw, O.xp, 321);
  raw[O.race] = 6;
  raw[O.combatMode] = 1;
  raw[O.baseThac0] = 44; // THAC0 16
  raw[O.maxHp] = 28;
  raw[O.currentHp] = 27;
  raw[O.size] = 1;
  raw[O.baseAc] = 50; // AC 10
  raw[O.attacksPerTwoRounds] = 2;
  raw[O.damageDice] = 1;
  raw[O.damageSides] = 8;
  raw[O.damageBonus] = 0xff; // signed -1
  raw[O.itemIds] = 13;
  raw[O.itemQuantityCodes] = 4;
  raw[O.specialAbilityCodes] = 66;
  return raw;
}

/**
 * Literal-only MONCHA stream, prefixed by FRUA's per-member `01 C2` marker.
 *
 * Chunked at **128**, not 129 (corrected 2026-08-19). A 129-byte chunk needs control byte 0x80, and
 * 0x80 is a no-op in the real decompressor — DQK's own, disassembled at canonical 00d7:0a1c, falls
 * straight back to the loop on `cmp al,0x80 / je` — so this fixture was building a stream the shipping
 * engine would have silently dropped 129 bytes of. The real `MONST.GLB` never emits one (0 of 3959
 * control bytes), so nothing about the shipped corpus changes; only this synthetic builder was wrong.
 */
function encodeGlobalMember(raw: Uint8Array): Uint8Array {
  const bytes: number[] = [0x01, 0xc2];
  for (let offset = 0; offset < raw.length; offset += 128) {
    const chunk = raw.subarray(offset, Math.min(raw.length, offset + 128));
    bytes.push(chunk.length - 1, ...chunk);
  }
  return Uint8Array.from(bytes);
}

const syntheticProvenance: FruaGlobalMonsterProvenance = {
  kind: 'global',
  sourceName: 'DISK2/MONST.GLB',
  memberIndex: 1,
};

describe('FRUA 450-byte monster record', () => {
  it('decodes bounded combat fields while retaining attack cadence, items, specials, and provenance', () => {
    const raw = fixtureRecord('ROAD TEST');
    const record = decodeFruaMonsterRecord(raw, 111, syntheticProvenance);

    expect(record).toMatchObject({
      slot: 111,
      embeddedSlot: 0,
      name: 'ROAD TEST',
      race: 6,
      combatMode: 1,
      hitPoints: 28,
      currentHitPoints: 27,
      thac0: 16,
      armorClass: 10,
      xp: 321,
      sourceSize: 1,
      combatSize: 1,
      largeEvenIfOneByOne: false,
      itemIds: [13],
      specialAbilityCodes: [66],
      provenance: syntheticProvenance,
    });
    expect(record.attacks).toEqual([
      { attacksPerTwoRounds: 2, damage: { count: 1, sides: 8, bonus: -1 } },
    ]);
    expect(record.items).toEqual([{ recordIndex: 0, itemId: 13, quantityCode: 4 }]);
    expect(record.raw).toBe(raw);
    expect(() => decodeFruaMonsterRecord(raw.subarray(1), 111, syntheticProvenance)).toThrow(
      /expected 450 bytes, got 449/,
    );
  });
});

describe('FRUA MONST.GLB HLIB mapping and design-local precedence', () => {
  function mappedFixture(): Uint8Array {
    const memberOne = fixtureRecord('MEMBER ONE');
    const memberTwo = fixtureRecord('MEMBER TWO');
    const table = encodeHlibSetIdTable([
      { id: 7, ptr: 2 },
      { id: 99, ptr: 1 },
    ]);
    return encodeHlibDataLibrary(
      [table, encodeGlobalMember(memberOne), encodeGlobalMember(memberTwo)],
      { tag: 'DATA', magic: 1 },
    );
  }

  it('uses member 0 instead of positional slot assumptions and requires exact FRUA framing', () => {
    const bytes = mappedFixture();
    const catalogue = decodeFruaMonstGlb(bytes, 'DISK2/MONST.GLB');

    expect(catalogue.total).toBe(2);
    expect([...catalogue.slotToMember]).toEqual([
      [7, 2],
      [99, 1],
    ]);
    expect(catalogue.bySlot.get(7)?.name).toBe('MEMBER TWO');
    expect(catalogue.bySlot.get(7)?.provenance).toEqual({
      kind: 'global',
      sourceName: 'DISK2/MONST.GLB',
      memberIndex: 2,
    });
    expect(catalogue.bySlot.get(99)?.name).toBe('MEMBER ONE');
    expect(catalogue.bySlot.get(7)?.raw).toHaveLength(FRUA_MONSTER_RECORD_SIZE);

    // §29: the leading `01 C2` is not a marker, it is the big-endian uncompressed length (0x01C2 =
    // 450 = FRUA_MONSTER_RECORD_SIZE), the same member header DQK's loader reads. Corrupting the high
    // byte therefore fails as a bad *length*, which is a strictly stronger check than the old literal
    // comparison — it rejects this member and also members whose header and payload merely disagree.
    const badMember = encodeGlobalMember(fixtureRecord('BAD MARKER'));
    badMember[0] = 0;
    const bad = encodeHlibDataLibrary(
      [encodeHlibSetIdTable([{ id: 1, ptr: 1 }]), badMember],
      { tag: 'DATA', magic: 1 },
    );
    expect(() => decodeFruaMonstGlb(bad)).toThrow(/declares length 194, expected 450/);
  });

  it('overlays only a filename/embedded-slot-matched design record and leaves the base immutable', () => {
    const base = decodeFruaMonstGlb(mappedFixture(), 'DISK2/MONST.GLB');
    const local = fixtureRecord('LOCAL SEVEN');
    local[O.embeddedSlot] = 7;
    const resolved = applyFruaMonsterOverrides(base, [
      { name: 'HEIRS.DSN/MONST007.DAT', bytes: local },
    ]);

    expect(base.bySlot.get(7)?.name).toBe('MEMBER TWO');
    expect(base.overrides.size).toBe(0);
    expect(resolved.bySlot.get(7)?.name).toBe('LOCAL SEVEN');
    expect(resolved.overrides.get(7)).toBe(resolved.bySlot.get(7));
    expect(resolved.bySlot.get(7)?.provenance).toEqual({
      kind: 'design-local',
      sourceName: 'HEIRS.DSN/MONST007.DAT',
      overrides: {
        kind: 'global',
        sourceName: 'DISK2/MONST.GLB',
        memberIndex: 2,
      },
    });
    expect(resolved.bySlot.get(99)).toBe(base.bySlot.get(99));

    const mismatch = fixtureRecord('WRONG SLOT');
    mismatch[O.embeddedSlot] = 99;
    expect(() =>
      applyFruaMonsterOverrides(base, [{ name: 'MONST007.DAT', bytes: mismatch }]),
    ).toThrow(/embedded slot 99 does not match filename slot 7/);
  });

  it('recognizes only explicit MONSTxxx.DAT filenames', () => {
    expect(fruaMonsterSlotFromFileName('MONST004.DAT')).toBe(4);
    expect(fruaMonsterSlotFromFileName('HEIRS.DSN\\monst111.dat')).toBe(111);
    expect(fruaMonsterSlotFromFileName('MONST.GLB')).toBeNull();
    expect(fruaMonsterSlotFromFileName('MONST000.DAT')).toBeNull();
  });
});

const uaRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures';
const globalPath = resolve(uaRoot, 'DISK2', 'MONST.GLB');
const heirsRoot = resolve(uaRoot, 'HEIRS.DSN');
const heirsGeo001Path = resolve(heirsRoot, 'GEO001.DAT');
const designFiles = ['MONST101.DAT', 'MONST102.DAT', 'MONST108.DAT', 'MONST109.DAT'];
const hasRetail = existsSync(globalPath) && designFiles.every((name) => existsSync(resolve(heirsRoot, name)));
const hasRetailDesign = hasRetail && existsSync(heirsGeo001Path);

interface RetailExpected {
  name: string;
  rawSha256: string;
  hp: number;
  ac: number;
  thac0: number;
  attacks: FruaMonsterAttack[];
  xp: number;
  size: number;
  itemIds: number[];
}

const retailExpected: Record<number, RetailExpected> = {
  4: {
    name: 'HOBGOBLIN',
    rawSha256: 'a26bddd11f239259e6fc768f3cd25bd84e9c59001a90df278ee9b5fea8074cba',
    hp: 6,
    ac: 5,
    thac0: 18,
    attacks: [{ attacksPerTwoRounds: 2, damage: { count: 1, sides: 8, bonus: 0 } }],
    xp: 35,
    size: 1,
    itemIds: [38, 29],
  },
  6: {
    name: 'HOBGOBLIN LDR',
    rawSha256: '990d3eb43494633423286defacb4fcc4290751ffda7ef66dae9b76a6a406e2cc',
    hp: 6,
    ac: 5,
    thac0: 18,
    attacks: [{ attacksPerTwoRounds: 2, damage: { count: 1, sides: 8, bonus: 0 } }],
    xp: 35,
    size: 1,
    itemIds: [1, 7, 27, 37, 43],
  },
  60: {
    name: 'ETTIN',
    rawSha256: '6af169c030baac0a10069adfb43dfed7d617b8b3f97a66252fd0f8e6df298a98',
    hp: 45,
    ac: 3,
    thac0: 10,
    attacks: [
      { attacksPerTwoRounds: 2, damage: { count: 2, sides: 8, bonus: 0 } },
      { attacksPerTwoRounds: 2, damage: { count: 3, sides: 6, bonus: 0 } },
    ],
    xp: 2580,
    size: 2,
    itemIds: [],
  },
  111: {
    name: 'ROAD GUARD',
    rawSha256: '292ab7fbed1c13c6f1d244a8fb44bbb6bb33d27c0fc53fae13fc377d1e2838bb',
    hp: 28,
    ac: 10,
    thac0: 16,
    attacks: [{ attacksPerTwoRounds: 2, damage: { count: 1, sides: 2, bonus: 0 } }],
    xp: 175,
    size: 1,
    itemIds: [13, 36, 33],
  },
};

describe('FRUA MONST.GLB — installed Unlimited Adventures retail golden', () => {
  it.skipIf(!hasRetail)('hash-locks HLIB mapping and exact Caravan roster fields', () => {
    const bytes = new Uint8Array(readFileSync(globalPath));
    expect(bytes).toHaveLength(14_765);
    expect(sha256(bytes)).toBe('b402b28fd48c5fcdfa7b6f1c8744fdf1621f511758d38d6e21772f618f6bf3de');

    const catalogue = decodeFruaMonstGlb(bytes, 'DISK2/MONST.GLB');
    expect(catalogue.total).toBe(127);
    expect(catalogue.bySlot.size).toBe(127);
    expect(catalogue.overrides.size).toBe(0);
    for (let slot = 1; slot <= 127; slot++) {
      expect(catalogue.slotToMember.get(slot), `slot ${slot} member mapping`).toBe(slot);
      expect(catalogue.bySlot.get(slot)?.raw, `slot ${slot} expanded size`).toHaveLength(450);
    }

    for (const [slotText, expected] of Object.entries(retailExpected)) {
      const slot = Number(slotText);
      const record = catalogue.bySlot.get(slot)!;
      expect(sha256(record.raw), `slot ${slot} decompressed hash`).toBe(expected.rawSha256);
      expect(record).toMatchObject({
        slot,
        embeddedSlot: 0,
        name: expected.name,
        combatMode: 1,
        hitPoints: expected.hp,
        currentHitPoints: expected.hp,
        armorClass: expected.ac,
        thac0: expected.thac0,
        xp: expected.xp,
        sourceSize: expected.size,
        combatSize: expected.size,
        itemIds: expected.itemIds,
        provenance: {
          kind: 'global',
          sourceName: 'DISK2/MONST.GLB',
          memberIndex: slot,
        },
      });
      expect(record.attacks).toEqual(expected.attacks);
    }
  });

  it.skipIf(!hasRetail)('gives HEIRS design-local records explicit precedence and provenance', () => {
    const globalBytes = new Uint8Array(readFileSync(globalPath));
    const base = decodeFruaMonstGlb(globalBytes, 'DISK2/MONST.GLB');
    const localHashes: Record<string, string> = {
      'MONST101.DAT': '660ed8f38a6011ab7d80468616967a07d138d6cf82c747ea04138829b9e08f52',
      'MONST102.DAT': 'a23290661cd171e812eee5a84dcce85e48f6dbdf1a59f708228bbd9c7ef09ec4',
      'MONST108.DAT': '991e6ed5edd1d559b60516d5b0eba3692e9e4c3df56da3cc600fbba0820001d0',
      'MONST109.DAT': '7b8ede06ea01c70506c28fbf30bfcf16139d89b913ff64bfe76e959bf3666cfd',
    };
    const localNames: Record<number, string> = {
      101: 'Khulzond',
      102: 'mordroka',
      108: 'keremish',
      109: 'xelez-dar',
    };
    const globalNames: Record<number, string> = {
      101: 'VAMPIRE LORD',
      102: 'VAMPIRESS',
      108: 'VAMPIRE PRIEST',
      109: 'DROW AMAZON',
    };
    const files = designFiles.map((name) => {
      const bytes = new Uint8Array(readFileSync(resolve(heirsRoot, name)));
      expect(bytes).toHaveLength(FRUA_MONSTER_RECORD_SIZE);
      expect(sha256(bytes), name).toBe(localHashes[name]);
      return { name: `HEIRS.DSN/${name}`, bytes };
    });

    const resolved = decodeFruaMonsterCatalogue(globalBytes, files, 'DISK2/MONST.GLB');
    expect([...resolved.overrides.keys()].sort((a, b) => a - b)).toEqual([101, 102, 108, 109]);
    for (const [slotText, expectedName] of Object.entries(localNames)) {
      const slot = Number(slotText);
      const record = resolved.bySlot.get(slot)!;
      expect(base.bySlot.get(slot)?.name).toBe(globalNames[slot]);
      expect(record.name).toBe(expectedName);
      expect(record.embeddedSlot).toBe(slot);
      expect(record.provenance).toEqual({
        kind: 'design-local',
        sourceName: `HEIRS.DSN/MONST${String(slot).padStart(3, '0')}.DAT`,
        overrides: {
          kind: 'global',
          sourceName: 'DISK2/MONST.GLB',
          memberIndex: slot,
        },
      });
      expect(sha256(record.raw)).not.toBe(sha256(base.bySlot.get(slot)!.raw));
    }

    // HEIRS has no local replacement for the Caravan roster: those slots remain exact globals.
    for (const slot of [4, 6, 60, 111]) {
      expect(sha256(resolved.bySlot.get(slot)!.raw)).toBe(sha256(base.bySlot.get(slot)!.raw));
      expect(resolved.bySlot.get(slot)?.provenance.kind).toBe('global');
    }
  });

  it.skipIf(!hasRetailDesign)('projects only the allowlisted Caravan roster into the module database', () => {
    const game001 = new Uint8Array(FRUA_GAME001_OFFSETS.password + 15);
    game001.set(Array.from('HEIRS COMBAT TEST').map((char) => char.charCodeAt(0)), FRUA_GAME001_OFFSETS.adventureName);
    game001[FRUA_GAME001_OFFSETS.startingModule] = 1;
    game001[FRUA_GAME001_OFFSETS.entryPointInModule] = 1;
    const imported = importFruaDesign('HEIRS.DSN', {
      game001,
      geos: new Map([[1, new Uint8Array(readFileSync(heirsGeo001Path))]]),
      monstGlb: new Uint8Array(readFileSync(globalPath)),
      monstGlbSourceName: 'DISK2/MONST.GLB',
      supportedCombatSlotsByModule: new Map([[1, new Set([12])]]),
    });

    expect(imported.package.databases?.monsters.map((monster) => [monster.id, monster.name])).toEqual([
      [4, 'HOBGOBLIN'],
      [6, 'HOBGOBLIN LDR'],
      [60, 'ETTIN'],
      [111, 'ROAD GUARD'],
    ]);
    const ettin = imported.package.databases?.monsters.find((monster) => monster.id === 60);
    expect(ettin?.source).toMatchObject({
      format: 'frua',
      recordId: 60,
      sourceName: 'DISK2/MONST.GLB',
      memberIndex: 60,
      attacks: [
        { attacksPerTwoRounds: 2, damage: { count: 2, sides: 8, bonus: 0 } },
        { attacksPerTwoRounds: 2, damage: { count: 3, sides: 6, bonus: 0 } },
      ],
    });
    expect(imported.package.databases?.monsters.find((monster) => monster.id === 111)?.source?.carriedItems)
      .toEqual([
        expect.objectContaining({ itemId: 13 }),
        expect.objectContaining({ itemId: 36 }),
        expect.objectContaining({ itemId: 33 }),
      ]);
    expect(imported.package.maps[0].events.find((event) => event.id === 12)).toMatchObject({
      type: 'combat',
      body: {
        monsters: [
          { monsterId: 6, count: 5 },
          { monsterId: 4, count: 20 },
          { monsterId: 60, count: 12 },
        ],
        friendlyMonsters: [{ monsterId: 111, count: 6 }],
        onVictory: 14,
      },
    });
  });
});
