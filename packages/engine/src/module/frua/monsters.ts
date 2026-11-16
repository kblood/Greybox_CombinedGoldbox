/**
 * FRUA default/design-local monster loader — `DISK2/MONST.GLB` + `MONSTxxx.DAT`.
 *
 * The global file is an HLIB `DATA` library whose member 0 maps logical monster slots to HLIB
 * members. Every referenced member begins `01 C2`; the remaining bytes use the MONCHA RLE dialect
 * and must expand to one 450-byte FRUA character/monster record. A design may replace a global slot
 * with an uncompressed 450-byte `MONSTxxx.DAT` record. This module keeps that choice explicit in
 * each record's provenance and never searches for or substitutes a bestiary on its own.
 *
 * The field offsets come from the FRUA `CCHFORM.TXT` record description and are pinned against the
 * installed Unlimited Adventures `MONST.GLB` plus HEIRS' design-local records in the dedicated
 * golden tests. Fields whose runtime meaning is not yet consumed (item quantity codes and special
 * ability codes) remain source-shaped rather than being promoted to invented engine semantics.
 */
import type { SavingThrows } from '../../ruleset/types.js';
import type { DamageDice } from '../../loaders/monster.js';
import { decodeHlib } from '../../loaders/hlib.js';
import { monchaRLE } from '../../util/rle.js';

export const FRUA_MONSTER_RECORD_SIZE = 450;

/** Byte offsets in one decompressed/global or design-local FRUA monster record. */
export const FRUA_MONSTER_OFFSETS = {
  xp: 84,
  race: 88,
  currentClass: 89,
  combatMode: 95,
  name: 96,
  nameBytes: 15,
  abilities: 112,
  baseThac0: 127,
  maxHp: 129,
  size: 130,
  saves: 131,
  attacksPerTwoRounds: 171,
  damageDice: 173,
  damageSides: 175,
  damageBonus: 177,
  baseAc: 179,
  currentHp: 395,
  embeddedSlot: 397,
  itemIds: 398,
  itemQuantityCodes: 414,
  itemSlots: 16,
  specialAbilityCodes: 430,
  specialAbilitySlots: 20,
} as const;

export interface FruaMonsterAbilityScore {
  /** Source byte labelled "raw" by CCHFORM.TXT. */
  raw: number;
  /** Parallel source byte labelled "modified" by CCHFORM.TXT. */
  modified: number;
}

export interface FruaMonsterAbilities {
  str: FruaMonsterAbilityScore;
  int: FruaMonsterAbilityScore;
  wis: FruaMonsterAbilityScore;
  dex: FruaMonsterAbilityScore;
  con: FruaMonsterAbilityScore;
  cha: FruaMonsterAbilityScore;
}

/** One source attack column. Cadence is preserved exactly instead of rounded to attacks/round. */
export interface FruaMonsterAttack {
  attacksPerTwoRounds: number;
  damage: DamageDice;
}

/** One populated entry in the 16-slot carried-item tail. `quantityCode` is intentionally raw. */
export interface FruaMonsterItemRef {
  recordIndex: number;
  itemId: number;
  quantityCode: number;
}

export interface FruaGlobalMonsterProvenance {
  kind: 'global';
  sourceName: string;
  /** HLIB member index resolved through member 0's id table. */
  memberIndex: number;
}

export interface FruaDesignLocalMonsterProvenance {
  kind: 'design-local';
  sourceName: string;
  /** The exact global member this design-local record supersedes. */
  overrides: FruaGlobalMonsterProvenance;
}

export type FruaMonsterProvenance =
  | FruaGlobalMonsterProvenance
  | FruaDesignLocalMonsterProvenance;

/** A bounded, source-shaped decode of one 450-byte FRUA monster/character record. */
export interface FruaMonsterRecord {
  /** Logical FRUA monster slot (1-based). */
  slot: number;
  /** Offset 397. Global records store zero; design-local records identify their replaced slot. */
  embeddedSlot: number;
  name: string;
  race: number;
  currentClass: number;
  combatMode: number;
  abilities: FruaMonsterAbilities;
  savingThrows: SavingThrows;
  /** Maximum HP at offset 129, used as the stable combat HP pool. */
  hitPoints: number;
  /** Current HP scratch value at offset 395, retained independently. */
  currentHitPoints: number;
  /** Base THAC0 recovered from the source's `60 - THAC0` byte at offset 127. */
  thac0: number;
  /** Base AC recovered from the source's `60 - AC` byte at offset 179. */
  armorClass: number;
  /** Populated attack columns from offsets 171..178; ETTIN carries two. */
  attacks: FruaMonsterAttack[];
  /** XP-for-killing, little-endian u16 at offsets 84..85. */
  xp: number;
  /** Low seven bits of the source icon-size byte (1=small, 2=tall, etc.). */
  sourceSize: number;
  /** Current engine footprint tier: source size byte >1 is large, matching FRUA's documented gate. */
  combatSize: 1 | 2;
  largeEvenIfOneByOne: boolean;
  items: FruaMonsterItemRef[];
  /** Convenience projection of {@link items}, preserving the exact non-zero source IDs. */
  itemIds: number[];
  /** Non-zero codes from the 20-byte special-ability tail; interpretation remains deferred. */
  specialAbilityCodes: number[];
  provenance: FruaMonsterProvenance;
  /** The full, decompressed 450-byte record. */
  raw: Uint8Array;
}

export interface FruaMonsterDesignFile {
  /** Filename or relative path ending in `MONSTxxx.DAT`. */
  name: string;
  /** One uncompressed 450-byte design-local record. */
  bytes: Uint8Array;
}

export interface FruaMonsterCatalogue {
  globalSourceName: string;
  /** Number of logical slots declared by the HLIB member-0 table. */
  total: number;
  /** Logical monster slot -> HLIB member index, retained as direct mapping evidence. */
  slotToMember: Map<number, number>;
  /** Resolved records. Design-local entries replace their global slot here. */
  bySlot: Map<number, FruaMonsterRecord>;
  /** Only the active design-local replacements, keyed by slot. */
  overrides: Map<number, FruaMonsterRecord>;
}

const TO_HIT_BASE = 60;

function readU16(raw: Uint8Array, offset: number): number {
  return raw[offset] | (raw[offset + 1] << 8);
}

function signedByte(value: number): number {
  return value & 0x80 ? value - 0x100 : value;
}

function readName(raw: Uint8Array): string {
  const start = FRUA_MONSTER_OFFSETS.name;
  const end = start + FRUA_MONSTER_OFFSETS.nameBytes;
  let text = '';
  for (let i = start; i < end; i++) {
    if (raw[i] === 0) break;
    text += String.fromCharCode(raw[i]);
  }
  return text.trimEnd();
}

function readAbilities(raw: Uint8Array): FruaMonsterAbilities {
  const score = (index: number): FruaMonsterAbilityScore => {
    const offset = FRUA_MONSTER_OFFSETS.abilities + index * 2;
    return { raw: raw[offset], modified: raw[offset + 1] };
  };
  return {
    str: score(0),
    int: score(1),
    wis: score(2),
    dex: score(3),
    con: score(4),
    cha: score(5),
  };
}

function readSavingThrows(raw: Uint8Array): SavingThrows {
  const offset = FRUA_MONSTER_OFFSETS.saves;
  return {
    paralyzePoisonDeath: raw[offset],
    petrifyPolymorph: raw[offset + 1],
    rodStaffWand: raw[offset + 2],
    breath: raw[offset + 3],
    spell: raw[offset + 4],
  };
}

function readAttacks(raw: Uint8Array): FruaMonsterAttack[] {
  const attacks: FruaMonsterAttack[] = [];
  for (let index = 0; index < 2; index++) {
    const attack: FruaMonsterAttack = {
      attacksPerTwoRounds: raw[FRUA_MONSTER_OFFSETS.attacksPerTwoRounds + index],
      damage: {
        count: raw[FRUA_MONSTER_OFFSETS.damageDice + index],
        sides: raw[FRUA_MONSTER_OFFSETS.damageSides + index],
        bonus: signedByte(raw[FRUA_MONSTER_OFFSETS.damageBonus + index]),
      },
    };
    if (
      attack.attacksPerTwoRounds !== 0 ||
      attack.damage.count !== 0 ||
      attack.damage.sides !== 0 ||
      attack.damage.bonus !== 0
    ) {
      attacks.push(attack);
    }
  }
  return attacks;
}

function readItems(raw: Uint8Array): FruaMonsterItemRef[] {
  const items: FruaMonsterItemRef[] = [];
  for (let index = 0; index < FRUA_MONSTER_OFFSETS.itemSlots; index++) {
    const itemId = raw[FRUA_MONSTER_OFFSETS.itemIds + index];
    if (itemId === 0) continue;
    items.push({
      recordIndex: index,
      itemId,
      quantityCode: raw[FRUA_MONSTER_OFFSETS.itemQuantityCodes + index],
    });
  }
  return items;
}

/** Decode one already-expanded design/global record while retaining explicit source provenance. */
export function decodeFruaMonsterRecord(
  raw: Uint8Array,
  slot: number,
  provenance: FruaMonsterProvenance,
): FruaMonsterRecord {
  if (raw.length !== FRUA_MONSTER_RECORD_SIZE) {
    throw new Error(
      `FRUA monster slot ${slot}: expected ${FRUA_MONSTER_RECORD_SIZE} bytes, got ${raw.length}`,
    );
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > 0xffff) {
    throw new Error(`FRUA monster: invalid logical slot ${slot}`);
  }

  const sizeByte = raw[FRUA_MONSTER_OFFSETS.size];
  const items = readItems(raw);
  const specialAbilityCodes = Array.from(
    raw.subarray(
      FRUA_MONSTER_OFFSETS.specialAbilityCodes,
      FRUA_MONSTER_OFFSETS.specialAbilityCodes + FRUA_MONSTER_OFFSETS.specialAbilitySlots,
    ),
  ).filter((code) => code !== 0);

  return {
    slot,
    embeddedSlot: raw[FRUA_MONSTER_OFFSETS.embeddedSlot],
    name: readName(raw),
    race: raw[FRUA_MONSTER_OFFSETS.race],
    currentClass: raw[FRUA_MONSTER_OFFSETS.currentClass],
    combatMode: raw[FRUA_MONSTER_OFFSETS.combatMode],
    abilities: readAbilities(raw),
    savingThrows: readSavingThrows(raw),
    hitPoints: raw[FRUA_MONSTER_OFFSETS.maxHp],
    currentHitPoints: raw[FRUA_MONSTER_OFFSETS.currentHp],
    thac0: TO_HIT_BASE - raw[FRUA_MONSTER_OFFSETS.baseThac0],
    armorClass: TO_HIT_BASE - raw[FRUA_MONSTER_OFFSETS.baseAc],
    attacks: readAttacks(raw),
    xp: readU16(raw, FRUA_MONSTER_OFFSETS.xp),
    sourceSize: sizeByte & 0x7f,
    combatSize: sizeByte > 1 ? 2 : 1,
    largeEvenIfOneByOne: (sizeByte & 0x80) !== 0,
    items,
    itemIds: items.map((item) => item.itemId),
    specialAbilityCodes,
    provenance,
    raw,
  };
}

interface FruaMonsterMemberMapping {
  slot: number;
  memberIndex: number;
}

function parseMemberTable(table: Uint8Array, memberCount: number): FruaMonsterMemberMapping[] {
  if (table.length < 2) throw new Error('FRUA MONST.GLB: member-0 id table is truncated');
  const count = readU16(table, 0);
  const expectedBytes = 2 + count * 4;
  if (table.length !== expectedBytes) {
    throw new Error(
      `FRUA MONST.GLB: member-0 id table expected ${expectedBytes} bytes, got ${table.length}`,
    );
  }
  if (count !== memberCount) {
    throw new Error(
      `FRUA MONST.GLB: id table declares ${count} slots for ${memberCount} record members`,
    );
  }

  const mappings: FruaMonsterMemberMapping[] = [];
  const slots = new Set<number>();
  const members = new Set<number>();
  for (let index = 0; index < count; index++) {
    const offset = 2 + index * 4;
    const slot = readU16(table, offset);
    const memberIndex = readU16(table, offset + 2);
    if (slot === 0 || slots.has(slot)) {
      throw new Error(`FRUA MONST.GLB: invalid or duplicate logical slot ${slot}`);
    }
    if (memberIndex < 1 || memberIndex > memberCount || members.has(memberIndex)) {
      throw new Error(`FRUA MONST.GLB: invalid or duplicate member index ${memberIndex}`);
    }
    slots.add(slot);
    members.add(memberIndex);
    mappings.push({ slot, memberIndex });
  }
  return mappings;
}

/**
 * The two bytes this used to call the `01 C2` "record marker" are the **big-endian uncompressed
 * length** — `0x01C2` = 450 = {@link FRUA_MONSTER_RECORD_SIZE} — the same member header DQK's own
 * loader reads before decompressing (see `decodeMonchaMember`). It looked like a constant marker only
 * because every FRUA monster record is the same size. Checking it as a length rather than a literal
 * is strictly stronger: it still rejects everything the old test rejected, and it now also rejects a
 * member whose header and payload disagree.
 */
function expandGlobalMember(member: Uint8Array, slot: number, memberIndex: number): Uint8Array {
  const declared = member.length >= 2 ? (member[0] << 8) | member[1] : -1;
  if (declared !== FRUA_MONSTER_RECORD_SIZE) {
    throw new Error(
      `FRUA MONST.GLB: slot ${slot} member ${memberIndex} declares length ${declared}, expected ${FRUA_MONSTER_RECORD_SIZE}`,
    );
  }
  const raw = monchaRLE(member.subarray(2));
  if (raw.length !== FRUA_MONSTER_RECORD_SIZE) {
    throw new Error(
      `FRUA MONST.GLB: slot ${slot} member ${memberIndex} expands to ${raw.length} bytes, expected ${FRUA_MONSTER_RECORD_SIZE}`,
    );
  }
  return raw;
}

/** Decode a global FRUA `MONST.GLB`, resolving slots through its member-0 HLIB id table. */
export function decodeFruaMonstGlb(
  bytes: Uint8Array,
  sourceName = 'MONST.GLB',
): FruaMonsterCatalogue {
  const archive = decodeHlib(bytes, sourceName);
  if (!archive.nonImage || archive.tag !== 'DATA' || bytes[11] !== 1 || archive.rawMembers.length < 2) {
    throw new Error(
      `FRUA MONST.GLB: expected an HLIB DATA/magic-1 library with an id table + records (tag=${archive.tag})`,
    );
  }

  const members = archive.rawMembers;
  const mappings = parseMemberTable(members[0], members.length - 1);
  const slotToMember = new Map<number, number>();
  const bySlot = new Map<number, FruaMonsterRecord>();
  for (const { slot, memberIndex } of mappings) {
    slotToMember.set(slot, memberIndex);
    const provenance: FruaGlobalMonsterProvenance = {
      kind: 'global',
      sourceName,
      memberIndex,
    };
    const raw = expandGlobalMember(members[memberIndex], slot, memberIndex);
    bySlot.set(slot, decodeFruaMonsterRecord(raw, slot, provenance));
  }

  return {
    globalSourceName: sourceName,
    total: mappings.length,
    slotToMember,
    bySlot,
    overrides: new Map(),
  };
}

/** Return the 1-based slot encoded by a `MONSTxxx.DAT` filename/path, or `null`. */
export function fruaMonsterSlotFromFileName(name: string): number | null {
  const match = /(?:^|[\\/])MONST(\d{3})\.DAT$/i.exec(name);
  if (!match) return null;
  const slot = Number.parseInt(match[1], 10);
  return slot > 0 ? slot : null;
}

/**
 * Overlay uncompressed design-local records on a decoded global catalogue. The filename and embedded
 * slot must agree, and the slot must exist in the global id table. The input catalogue is not mutated.
 */
export function applyFruaMonsterOverrides(
  base: FruaMonsterCatalogue,
  files: Iterable<FruaMonsterDesignFile>,
): FruaMonsterCatalogue {
  const bySlot = new Map(base.bySlot);
  const overrides = new Map(base.overrides);

  for (const file of files) {
    const slot = fruaMonsterSlotFromFileName(file.name);
    if (slot === null) {
      throw new Error(`FRUA monster override: unsupported filename ${JSON.stringify(file.name)}`);
    }
    if (overrides.has(slot)) {
      throw new Error(`FRUA monster override: duplicate design-local slot ${slot}`);
    }
    const memberIndex = base.slotToMember.get(slot);
    if (memberIndex === undefined) {
      throw new Error(`FRUA monster override: slot ${slot} is absent from ${base.globalSourceName}`);
    }
    if (file.bytes.length !== FRUA_MONSTER_RECORD_SIZE) {
      throw new Error(
        `FRUA monster override ${file.name}: expected ${FRUA_MONSTER_RECORD_SIZE} bytes, got ${file.bytes.length}`,
      );
    }
    const embeddedSlot = file.bytes[FRUA_MONSTER_OFFSETS.embeddedSlot];
    if (embeddedSlot !== slot) {
      throw new Error(
        `FRUA monster override ${file.name}: embedded slot ${embeddedSlot} does not match filename slot ${slot}`,
      );
    }

    const record = decodeFruaMonsterRecord(file.bytes, slot, {
      kind: 'design-local',
      sourceName: file.name,
      overrides: {
        kind: 'global',
        sourceName: base.globalSourceName,
        memberIndex,
      },
    });
    overrides.set(slot, record);
    bySlot.set(slot, record);
  }

  return {
    globalSourceName: base.globalSourceName,
    total: base.total,
    slotToMember: new Map(base.slotToMember),
    bySlot,
    overrides,
  };
}

/** Decode the global catalogue and immediately apply any supplied design-local records. */
export function decodeFruaMonsterCatalogue(
  globalBytes: Uint8Array,
  designFiles: Iterable<FruaMonsterDesignFile> = [],
  sourceName = 'MONST.GLB',
): FruaMonsterCatalogue {
  return applyFruaMonsterOverrides(decodeFruaMonstGlb(globalBytes, sourceName), designFiles);
}
