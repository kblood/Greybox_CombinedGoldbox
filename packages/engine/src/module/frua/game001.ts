/**
 * FRUA `GAME001.DAT` (module/design settings) byte parser (M5.S2b). Per
 * `hackdocs_extracted/GAMEDAT.TXT` (Bil Simser's field table) — a flat 387-byte struct: the
 * adventure name, starting XP/PP/gems/jewelry, the starting-module + entry-point pair (the
 * design's real game-start, consumed by `design.ts`'s `importFruaDesign` to build
 * `ModulePackage.entrypoints[0]`), a starting-equipment code, 8 named "keys" and 12 named
 * "items" (the special-item slots FRUA's hasSpecialItem/lacksSpecialItem event condition
 * references — GEOEVENT.TXT), and a password.
 *
 * All strings here are plain ASCII, zero-terminated — GAMEDAT.TXT's own note ("the adventure
 * name must be terminated with a zero byte") describes a C-string buffer, NOT the 6-bit ECL
 * packing `GEOxxx.DAT`'s string table uses (that packing is called out explicitly where it
 * applies — GEODATA.TXT — and isn't mentioned here).
 */

const OFF = {
  adventureName: 0,
  startingXp: 32,
  startingPp: 36,
  startingGems: 40,
  startingJewelry: 44,
  startingModule: 48,
  entryPointInModule: 49,
  equipmentCode: 50,
  keys: 52,
  items: 180,
  password: 372,
} as const;

/** Through the end of the 15-byte password field (372 + 15). */
export const FRUA_GAME001_MIN_BYTES = 387;

export const FRUA_GAME001_OFFSETS = OFF;

export type FruaEquipmentCode =
  | 'none'
  | 'poor'
  | 'modest'
  | 'average'
  | 'prosperous'
  | '+1'
  | '+2'
  | '+3'
  | '+4';

/** Index = the raw GAMEDAT.TXT code byte (0-8). */
const EQUIPMENT_CODES: FruaEquipmentCode[] = [
  'none',
  'poor',
  'modest',
  'average',
  'prosperous',
  '+1',
  '+2',
  '+3',
  '+4',
];

export interface FruaGame001 {
  adventureName: string;
  startingXp: number;
  startingPp: number;
  startingGems: number;
  startingJewelry: number;
  /** The FRUA module number (`GEOxxx.DAT`'s `xxx`) the party starts in. */
  startingModule: number;
  /** Which of that module's 8 `GEOENTRY.TXT` entry-point slots the party starts at, normalized to
   * the engine's 0-based `FruaGeo.entryPoints` indexing. Retail HEIRS.DSN and TUTORIAL.DSN both
   * store `1` for their first entry, proving GAME001's field is 1-based. */
  entryPointInModule: number;
  equipmentCode: FruaEquipmentCode;
  keys: string[];
  items: string[];
  password: string;
}

function readAsciiZ(buf: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(offset + maxLen, buf.byteLength);
  while (end < limit && buf[end] !== 0) end++;
  let s = '';
  for (let i = offset; i < end; i++) s += String.fromCharCode(buf[i]);
  return s;
}

export function parseFruaGame001(buf: Uint8Array): FruaGame001 {
  if (buf.byteLength < FRUA_GAME001_MIN_BYTES) {
    throw new Error(`parseFruaGame001: buffer too short (${buf.byteLength} < ${FRUA_GAME001_MIN_BYTES})`);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const keys: string[] = [];
  for (let i = 0; i < 8; i++) keys.push(readAsciiZ(buf, OFF.keys + i * 16, 16));
  const items: string[] = [];
  for (let i = 0; i < 12; i++) items.push(readAsciiZ(buf, OFF.items + i * 16, 16));
  const rawEntryPoint = buf[OFF.entryPointInModule];
  if (rawEntryPoint < 1 || rawEntryPoint > 8) {
    throw new Error(`parseFruaGame001: entry point ${rawEntryPoint} is outside retail range 1..8`);
  }

  return {
    adventureName: readAsciiZ(buf, OFF.adventureName, 32),
    startingXp: dv.getUint32(OFF.startingXp, true),
    startingPp: dv.getUint32(OFF.startingPp, true),
    startingGems: dv.getUint32(OFF.startingGems, true),
    startingJewelry: dv.getUint32(OFF.startingJewelry, true),
    startingModule: buf[OFF.startingModule],
    entryPointInModule: rawEntryPoint - 1,
    equipmentCode: EQUIPMENT_CODES[buf[OFF.equipmentCode]] ?? 'none',
    keys,
    items,
    password: readAsciiZ(buf, OFF.password, buf.byteLength - OFF.password),
  };
}
