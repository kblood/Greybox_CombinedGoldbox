/**
 * Save game (A6.1) — a versioned, serialisable snapshot of a campaign in progress: the party roster
 * and its per-character stores (memorised spells, spellbooks, packs, XP, the gold pool), the journal,
 * the party's position + facing in the world, the game clock, and an open-ended `flags` map for
 * quest/story state. A host bundles its scattered persistence (in the web build, several localStorage
 * keys) into one of these, writes it to a named slot, and restores it on Load.
 *
 * Pure / DOM-free and self-validating: {@link serializeSave} emits canonical JSON, {@link deserializeSave}
 * parses + version-checks + repairs a slot (dropping junk, defaulting missing fields) so a partial or
 * older blob never throws at the call site — it returns a usable `SaveGame` or `null` if it is not a
 * save at all. The party is the engine's own {@link CharacterSheet}; the per-name spell/pack stores are
 * kept opaque (the host owns their exact shape) so this stays decoupled from the UI store internals.
 */
import type { CharacterSheet } from '../ruleset/addnd1e-dragonlance/character.js';
import type { JournalData } from './journal.js';
import {
  normalizeModuleEventStateSnapshot,
  type ModuleEventStateSnapshot,
} from '../module/eventState.js';

/** Bump when the on-disk shape changes incompatibly; {@link deserializeSave} migrates older blobs. */
export const SAVE_VERSION = 2;

/** Compass facing, matching the explorer `Pose` facing union. */
export type SaveFacing = 'north' | 'east' | 'south' | 'west';
const FACINGS: readonly SaveFacing[] = ['north', 'east', 'south', 'west'];

/** Where the party stands when the game was saved. `area` identifies the map/dungeon. */
export interface SavePosition {
  area: string;
  x: number;
  y: number;
  facing: SaveFacing;
  /**
   * Optional Gen1 archive/disk number and ECL/GEO area id. Older save-v2 slots only carried the
   * human-facing map label; these stable numeric coordinates let a host re-mount the correct retail
   * archive before restoring x/y/facing. They are additive, so old slots remain valid.
   */
  disk?: number;
  areaId?: number;
}

/** The per-character / pooled stores, kept opaque (the host defines their inner shape). */
export interface SaveStores {
  /** Memorised-spell selections, keyed by character name. */
  memorize?: Record<string, unknown>;
  /** Known-spell books, keyed by character name. */
  spellbook?: Record<string, unknown>;
  /** Carried packs, keyed by character name. */
  inventory?: Record<string, unknown>;
  /** Experience, keyed by character name. */
  xp?: Record<string, number>;
  /** The shared steel/gold pool. */
  gold?: number;
}

export interface SaveGame {
  version: number;
  /** Human-facing slot label, e.g. "Quick Save" or "Throtl, Day 3". */
  name: string;
  /** Host-supplied stamp (epoch millis or game-minutes); 0 when unknown. The engine never reads a clock. */
  savedAt: number;
  party: CharacterSheet[];
  stores: SaveStores;
  journal: JournalData;
  position: SavePosition | null;
  /** In-game minutes since the campaign epoch. */
  clockMinutes: number;
  /** Open-ended quest/story flags. */
  flags: Record<string, number>;
  /** Per-area ECL memory words, keyed first by stable area id/name and then numeric address string. */
  areaMemory: Record<string, Record<string, number>>;
  /** Additive authored/FRUA module-event consumption state. Absent from original-game and older
   * save-v2 slots; when present, its module id prevents cross-design application. */
  moduleEventState?: ModuleEventStateSnapshot;
}

/**
 * Everything a caller may supply to {@link makeSave}; only `name` is required. Fields are loosely
 * typed (`unknown` where they will be normalised) so a raw parsed blob can be passed straight in.
 */
export interface SaveInput {
  name: string;
  savedAt?: number;
  party?: CharacterSheet[];
  stores?: unknown;
  journal?: unknown;
  position?: unknown;
  clockMinutes?: number;
  flags?: unknown;
  areaMemory?: unknown;
  moduleEventState?: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Coerce an arbitrary value into a `Record<string, number>` (drops non-numeric entries). */
function numberMap(v: unknown): Record<string, number> {
  if (!isObject(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
  return out;
}

/** Coerce nested per-area ECL memories while dropping malformed areas/values. */
function areaMemoryMap(v: unknown): Record<string, Record<string, number>> {
  if (!isObject(v)) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [area, memory] of Object.entries(v)) {
    if (!isObject(memory)) continue;
    out[area] = numberMap(memory);
  }
  return out;
}

function recordMap(v: unknown): Record<string, unknown> {
  return isObject(v) ? { ...v } : {};
}

/** Normalise a grid position (or null) — rejects fractional/negative coordinates and clamps facing
 * to a known compass point. Map-specific upper bounds are checked by the restoring Explorer. */
function cleanPosition(v: unknown): SavePosition | null {
  if (!isObject(v)) return null;
  const { area, x, y, facing } = v as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' ||
      !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0) return null;
  const clean: SavePosition = {
    area: typeof area === 'string' ? area : '',
    x,
    y,
    facing: FACINGS.includes(facing as SaveFacing) ? (facing as SaveFacing) : 'north',
  };
  if (typeof v.disk === 'number' && Number.isInteger(v.disk) && v.disk >= 0) clean.disk = v.disk;
  if (typeof v.areaId === 'number' && Number.isInteger(v.areaId) && v.areaId >= 0) clean.areaId = v.areaId;
  return clean;
}

function cleanStores(v: unknown): SaveStores {
  const s = isObject(v) ? v : {};
  return {
    memorize: recordMap(s.memorize),
    spellbook: recordMap(s.spellbook),
    inventory: recordMap(s.inventory),
    xp: numberMap(s.xp),
    gold: typeof s.gold === 'number' ? s.gold : 0,
  };
}

function cleanJournal(v: unknown): JournalData {
  if (isObject(v) && Array.isArray((v as { entries?: unknown }).entries)) {
    return { entries: (v as unknown as JournalData).entries };
  }
  return { entries: [] };
}

/** Build a fully-formed, normalised SaveGame from a loose input (fills every field with a default). */
export function makeSave(input: SaveInput): SaveGame {
  const save: SaveGame = {
    version: SAVE_VERSION,
    name: input.name,
    savedAt: typeof input.savedAt === 'number' ? input.savedAt : 0,
    party: Array.isArray(input.party) ? input.party : [],
    stores: cleanStores(input.stores),
    journal: cleanJournal(input.journal),
    position: cleanPosition(input.position),
    clockMinutes: typeof input.clockMinutes === 'number' ? input.clockMinutes : 0,
    flags: numberMap(input.flags),
    areaMemory: areaMemoryMap(input.areaMemory),
  };
  const moduleEventState = normalizeModuleEventStateSnapshot(input.moduleEventState) ?? undefined;
  if (moduleEventState) save.moduleEventState = moduleEventState;
  return save;
}

/** Canonical JSON for a save slot. */
export function serializeSave(save: SaveGame): string {
  return JSON.stringify(makeSave(save));
}

/**
 * Parse + validate + repair a save blob (a JSON string or an already-parsed object). Returns a
 * normalised {@link SaveGame}, or `null` when the input is not a save at all (unparseable / not an
 * object / no recognisable fields). Forward-compatible: an unknown future `version` is still loaded
 * best-effort rather than rejected.
 */
export function deserializeSave(input: string | unknown): SaveGame | null {
  let obj: unknown = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch { return null; }
  }
  if (!isObject(obj)) return null;
  // A save must carry at least one of the structural fields; otherwise it is some other blob.
  const looksLikeSave =
    'party' in obj || 'stores' in obj || 'position' in obj || 'journal' in obj ||
    'areaMemory' in obj || 'moduleEventState' in obj || 'version' in obj;
  if (!looksLikeSave) return null;
  return makeSave({
    name: typeof obj.name === 'string' ? obj.name : 'Save',
    savedAt: typeof obj.savedAt === 'number' ? obj.savedAt : 0,
    party: Array.isArray(obj.party) ? (obj.party as CharacterSheet[]) : [],
    stores: obj.stores,
    journal: obj.journal as JournalData,
    position: obj.position,
    clockMinutes: typeof obj.clockMinutes === 'number' ? obj.clockMinutes : 0,
    flags: obj.flags,
    areaMemory: obj.areaMemory,
    moduleEventState: obj.moduleEventState,
  });
}

/** A short, host-friendly summary of a slot for a load list (does not mutate the save). */
export interface SaveSummary {
  name: string;
  members: number;
  area: string | null;
  savedAt: number;
}

export function summarizeSave(save: SaveGame): SaveSummary {
  return {
    name: save.name,
    members: save.party.length,
    area: save.position?.area ?? null,
    savedAt: save.savedAt,
  };
}
