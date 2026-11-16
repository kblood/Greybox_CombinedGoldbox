/**
 * CoAB / Krynn Gen1 Area1 host-state decoder.
 *
 * The clean-room CoAB source stores `gbl.area_ptr` as an 0x800-byte Area1 record. Combat-map setup uses
 * a tiny subset of that host state, notably `current_city` at offset 0x342 for wilderness combat
 * `CityInfo[]` selection. This loader deliberately decodes only source-anchored host fields that are
 * currently consumed or documented by Greybox.
 */

export const COAB_AREA1_SIZE = 0x800;
export const COAB_AREA2_SIZE = 0x800;
export const COAB_SAVGAMA_AREA1_OFFSET = 1;
export const COAB_SAVGAMA_AREA2_OFFSET = COAB_SAVGAMA_AREA1_OFFSET + COAB_AREA1_SIZE;

/**
 * Gen1 ECL's persistent-word window.  The original VM maps this whole range into
 * the serialized Area1 record; it is not a separate, transient ECL heap.
 *
 * CoAB `ovr008.vm_GetMemoryValueType()` selects Area1 for 0x4b00..0x4eff, then
 * reads it at `(0x6a00 + address * 2) & 0xffff`.  That is a permutation of all
 * 0x800 Area1 bytes, so a CoK `SAVGAM?.DAT` preserves every word in this range.
 */
export const COAB_ECL_MEMORY_START = 0x4b00;
export const COAB_ECL_MEMORY_END = 0x4eff;
export const COAB_ECL_MEMORY_WORD_COUNT = (COAB_ECL_MEMORY_END - COAB_ECL_MEMORY_START + 1);

export const COAB_AREA1_OFFSETS = {
  current3DMapBlockId: 0x18a,
  inDungeon: 0x1cc,
  lastXPos: 0x1e0,
  lastYPos: 0x1e2,
  lastEclBlockId: 0x1e4,
  blockAreaView: 0x1f6,
  outdoorSkyColour: 0x1fa,
  indoorSkyColour: 0x1fc,
  canCastSpells: 0x1ff,
  currentCity: 0x342,
} as const;

export const COAB_AREA2_OFFSETS = {
  gameArea: 0x624,
} as const;

export interface CoabArea1HostState {
  byteLength: number;
  current3DMapBlockId: number;
  /** CoAB `area_ptr.inDungeon`: 0 = wilderness/overland, non-zero = dungeon. */
  inDungeon: number;
  lastPos: { x: number; y: number };
  lastEclBlockId: number;
  blockAreaView: number;
  outdoorSkyColour: number;
  indoorSkyColour: number;
  canCastSpells: boolean;
  /** CoAB `area_ptr.current_city` at offset 0x342, used by `SetupWildernessFloor()`. */
  currentCity: number;
}

export interface CoabSavgamaArea1HostState {
  /** CoAB `gbl.game_area`, stored as the first byte before the Area1 record. */
  gameArea: number;
  /** CoAB `area2_ptr.game_area`, which `loadSaveGame()` copies back into runtime `gbl.game_area`. */
  area2GameArea?: number;
  /** Offset of the embedded Area1 record inside the save file. */
  offset: number;
  /** Decoded Area1 host record. */
  area: CoabArea1HostState;
}

export interface CoabArea1HostPatch {
  current3DMapBlockId?: number;
  inDungeon?: number;
  lastPos?: Partial<{ x: number; y: number }>;
  lastEclBlockId?: number;
  blockAreaView?: number;
  outdoorSkyColour?: number;
  indoorSkyColour?: number;
  canCastSpells?: boolean;
  currentCity?: number;
}

export interface CoabSavgamaArea1HostPatch extends CoabArea1HostPatch {
  gameArea?: number;
  area2GameArea?: number;
}

function need(bytes: Uint8Array, offset: number): void {
  if (offset < 0 || !Number.isInteger(offset)) throw new Error(`CoAB Area1: invalid offset ${offset}`);
  if (bytes.byteLength < offset + COAB_AREA1_SIZE) {
    throw new Error(`CoAB Area1: ${bytes.byteLength - offset} bytes at offset ${offset}; need ${COAB_AREA1_SIZE}`);
  }
}

function u8(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function s16le(bytes: Uint8Array, offset: number): number {
  const v = u16le(bytes, offset);
  return v & 0x8000 ? v - 0x10000 : v;
}

function writeU8(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = Math.trunc(value) & 0xff;
}

function writeU16le(bytes: Uint8Array, offset: number, value: number): void {
  const v = Math.trunc(value) & 0xffff;
  bytes[offset] = v & 0xff;
  bytes[offset + 1] = (v >> 8) & 0xff;
}

function writeBoolByte(bytes: Uint8Array, offset: number, value: boolean): void {
  bytes[offset] = value ? 1 : 0;
}

/**
 * Return the byte offset, within an Area1 record, for a persistent Gen1 ECL
 * word address.  This follows the original VM's 16-bit arithmetic exactly.
 */
export function coabArea1OffsetForEclMemory(address: number): number {
  if (!Number.isInteger(address) || address < COAB_ECL_MEMORY_START || address > COAB_ECL_MEMORY_END) {
    throw new Error(`CoAB ECL memory: address ${address} is outside ${COAB_ECL_MEMORY_START.toString(16)}..${COAB_ECL_MEMORY_END.toString(16)}`);
  }
  return (0x6a00 + address * 2) & 0xffff;
}

/** Decode the non-zero persistent ECL words stored by one Area1 record. */
export function decodeCoabArea1EclMemory(bytes: Uint8Array, offset = 0): Map<number, number> {
  need(bytes, offset);
  const memory = new Map<number, number>();
  for (let address = COAB_ECL_MEMORY_START; address <= COAB_ECL_MEMORY_END; address++) {
    const value = u16le(bytes, offset + coabArea1OffsetForEclMemory(address));
    // A sparse map matches EclVm's missing-word-is-zero semantics and avoids
    // representing 512 synthetic values as user-visible campaign state.
    if (value !== 0) memory.set(address, value);
  }
  return memory;
}

/** Decode the source-anchored Area1 host fields from an 0x800-byte record. */
export function decodeCoabArea1HostState(bytes: Uint8Array, offset = 0): CoabArea1HostState {
  need(bytes, offset);
  const o = COAB_AREA1_OFFSETS;
  return {
    byteLength: COAB_AREA1_SIZE,
    current3DMapBlockId: u8(bytes, offset + o.current3DMapBlockId),
    inDungeon: s16le(bytes, offset + o.inDungeon),
    lastPos: {
      x: s16le(bytes, offset + o.lastXPos),
      y: s16le(bytes, offset + o.lastYPos),
    },
    lastEclBlockId: u16le(bytes, offset + o.lastEclBlockId),
    blockAreaView: s16le(bytes, offset + o.blockAreaView),
    outdoorSkyColour: u16le(bytes, offset + o.outdoorSkyColour),
    indoorSkyColour: u16le(bytes, offset + o.indoorSkyColour),
    canCastSpells: u8(bytes, offset + o.canCastSpells) !== 0,
    currentCity: u8(bytes, offset + o.currentCity),
  };
}

/**
 * Return a copy of an Area1 record with selected source-anchored host fields patched. This is used for
 * deterministic fixtures and save-wrapper experiments; it does not fabricate a whole save, only edits
 * fields whose offsets are already represented by this loader.
 */
export function patchCoabArea1HostState(
  bytes: Uint8Array,
  patch: CoabArea1HostPatch,
  offset = 0,
): Uint8Array {
  need(bytes, offset);
  const out = new Uint8Array(bytes);
  const o = COAB_AREA1_OFFSETS;
  if (patch.current3DMapBlockId !== undefined) writeU8(out, offset + o.current3DMapBlockId, patch.current3DMapBlockId);
  if (patch.inDungeon !== undefined) writeU16le(out, offset + o.inDungeon, patch.inDungeon);
  if (patch.lastPos?.x !== undefined) writeU16le(out, offset + o.lastXPos, patch.lastPos.x);
  if (patch.lastPos?.y !== undefined) writeU16le(out, offset + o.lastYPos, patch.lastPos.y);
  if (patch.lastEclBlockId !== undefined) writeU16le(out, offset + o.lastEclBlockId, patch.lastEclBlockId);
  if (patch.blockAreaView !== undefined) writeU16le(out, offset + o.blockAreaView, patch.blockAreaView);
  if (patch.outdoorSkyColour !== undefined) writeU16le(out, offset + o.outdoorSkyColour, patch.outdoorSkyColour);
  if (patch.indoorSkyColour !== undefined) writeU16le(out, offset + o.indoorSkyColour, patch.indoorSkyColour);
  if (patch.canCastSpells !== undefined) writeBoolByte(out, offset + o.canCastSpells, patch.canCastSpells);
  if (patch.currentCity !== undefined) writeU8(out, offset + o.currentCity, patch.currentCity);
  return out;
}

/**
 * Decode the Area1 host record embedded in an early Krynn/CoAB-style `SAVGAMA.DAT` save.
 *
 * Local CoK saves carry a one-byte prefix before the 0x800-byte Area1 record; keep the default offset
 * explicit so callers can still pass raw Area1 records to `decodeCoabArea1HostState()` when no save
 * wrapper is present.
 */
export function decodeCoabSavgamaArea1HostState(
  bytes: Uint8Array,
  offset = COAB_SAVGAMA_AREA1_OFFSET,
): CoabSavgamaArea1HostState {
  if (offset <= 0) throw new Error(`CoAB SAVGAMA: invalid Area1 offset ${offset}; expected prefix byte before Area1`);
  const area2Offset = offset + COAB_AREA1_SIZE;
  const area2GameAreaOffset = area2Offset + COAB_AREA2_OFFSETS.gameArea;
  return {
    gameArea: u8(bytes, offset - 1),
    ...(bytes.byteLength > area2GameAreaOffset ? { area2GameArea: u8(bytes, area2GameAreaOffset) } : {}),
    offset,
    area: decodeCoabArea1HostState(bytes, offset),
  };
}

/** Decode the persistent Gen1 ECL word window from an early Krynn/CoAB save wrapper. */
export function decodeCoabSavgamaEclMemory(
  bytes: Uint8Array,
  offset = COAB_SAVGAMA_AREA1_OFFSET,
): Map<number, number> {
  if (offset <= 0) throw new Error(`CoAB SAVGAMA: invalid Area1 offset ${offset}; expected prefix byte before Area1`);
  return decodeCoabArea1EclMemory(bytes, offset);
}

/** Patch selected source-anchored host fields inside a CoAB/Krynn `SAVGAM?.DAT` save wrapper. */
export function patchCoabSavgamaArea1HostState(
  bytes: Uint8Array,
  patch: CoabSavgamaArea1HostPatch,
  offset = COAB_SAVGAMA_AREA1_OFFSET,
): Uint8Array {
  if (offset <= 0) throw new Error(`CoAB SAVGAMA: invalid Area1 offset ${offset}; expected prefix byte before Area1`);
  const out = patchCoabArea1HostState(bytes, patch, offset);
  const area2GameArea = patch.area2GameArea ?? patch.gameArea;
  if (patch.gameArea !== undefined) writeU8(out, offset - 1, patch.gameArea);
  if (area2GameArea !== undefined) {
    const area2GameAreaOffset = offset + COAB_AREA1_SIZE + COAB_AREA2_OFFSETS.gameArea;
    if (out.byteLength > area2GameAreaOffset) writeU8(out, area2GameAreaOffset, area2GameArea);
  }
  return out;
}

/**
 * Return the wilderness-combat host context only when the Area1 record is in wilderness mode. Dungeon
 * encounters should use the dungeon combat-map builder instead of `current_city`.
 */
export function coabWildernessCombatHostFromArea1(area: CoabArea1HostState): { currentCity: number } | null {
  return area.inDungeon === 0 ? { currentCity: area.currentCity } : null;
}
