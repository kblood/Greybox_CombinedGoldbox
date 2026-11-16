/**
 * Pure map-authoring operations on a {@link ModuleMap} (M5.S3). No DOM/canvas — `apps/author`'s
 * UI is a thin client over these functions, matching ADR-0006's "no separate authoring runtime"
 * principle: an authored map is a real `ModuleMap` from the very first click, loadable through the
 * exact same `loadModule`/`Explorer` path as an imported or hand-written one.
 *
 * Scope: M5.S3 added tiles/walls/zones/entrypoints. M5.S4 adds event authoring — linking a cell's
 * `event` slot to an authored `ModuleEvent` (compiled to real ECL bytecode by
 * `eventCompiler.ts`'s `compileModuleEvent`, per the full 35-type vocabulary in `types.ts`).
 */
import type { Direction, MapCell, MapEntry } from '../model/index.js';
import type { ModuleEvent, ModuleMap } from './types.js';

/** Wall/door graphic ids are single bytes, matching every other Krynn container generation
 * (DAX/HLIB/FRUA all pack a wall slot into one byte). */
const MAX_WALL_SLOT = 255;

function assertInBounds(map: ModuleMap, x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) {
    throw new Error(`out of bounds: (${x},${y}) on a ${map.width}x${map.height} map`);
  }
  return y * map.width + x;
}

/** A blank `width`×`height` map: every wall open, one entry point at (0,0) facing north, no events. */
export function createEmptyModuleMap(name: string, width: number, height: number): ModuleMap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`createEmptyModuleMap: invalid dimensions ${width}x${height}`);
  }
  const cells: MapCell[] = Array.from({ length: width * height }, () => ({
    walls: { north: 0, east: 0, south: 0, west: 0 },
  }));
  const entries: MapEntry[] = [{ id: 0, x: 0, y: 0, facing: 'north' }];
  return { name, width, height, cells, entries, events: [] };
}

/** Set the wall/door graphic id on one edge of one cell. Returns a new `ModuleMap` (cells array +
 * the touched cell are copied; everything else is shared) — callers hold the previous map's
 * reference safely (undo, comparison) the same way `MapCell`'s consumers already expect. */
export function setWall(map: ModuleMap, x: number, y: number, dir: Direction, slot: number): ModuleMap {
  const idx = assertInBounds(map, x, y);
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_WALL_SLOT) {
    throw new Error(`setWall: slot out of range 0-${MAX_WALL_SLOT}: ${slot}`);
  }
  const cells = map.cells.slice();
  cells[idx] = { ...cells[idx], walls: { ...cells[idx].walls, [dir]: slot } };
  return { ...map, cells };
}

/** Set a cell's floor tile id (`MapCell.floor` — the "tiles" half of M5.S3's scope; 0/undefined is
 * the default floor). */
export function setFloor(map: ModuleMap, x: number, y: number, tile: number): ModuleMap {
  const idx = assertInBounds(map, x, y);
  if (!Number.isInteger(tile) || tile < 0 || tile > MAX_WALL_SLOT) {
    throw new Error(`setFloor: tile out of range 0-${MAX_WALL_SLOT}: ${tile}`);
  }
  const cells = map.cells.slice();
  cells[idx] = { ...cells[idx], floor: tile };
  return { ...map, cells };
}

/** Set a cell's zone tag (a plain numeric grouping id — the same field FRUA's importer fills from
 * its backdrop/zone byte, `MapCell.flags`; an authored map has no backdrop art to pack alongside
 * it, so this just stores the zone value directly). */
export function setZone(map: ModuleMap, x: number, y: number, zone: number): ModuleMap {
  const idx = assertInBounds(map, x, y);
  if (!Number.isInteger(zone) || zone < 0 || zone > MAX_WALL_SLOT) {
    throw new Error(`setZone: zone out of range 0-${MAX_WALL_SLOT}: ${zone}`);
  }
  const cells = map.cells.slice();
  cells[idx] = { ...cells[idx], flags: zone };
  return { ...map, cells };
}

/** Place (or move) entry point `id` at `(x,y)` facing `facing`. Upserts by id. */
export function placeEntry(map: ModuleMap, id: number, x: number, y: number, facing: Direction): ModuleMap {
  assertInBounds(map, x, y);
  if (!Number.isInteger(id) || id < 0) throw new Error(`placeEntry: invalid entry id ${id}`);
  const entries = map.entries.filter((e) => e.id !== id);
  entries.push({ id, x, y, facing });
  entries.sort((a, b) => a.id - b.id);
  return { ...map, entries };
}

/** Remove entry point `id`, if present. */
export function removeEntry(map: ModuleMap, id: number): ModuleMap {
  return { ...map, entries: map.entries.filter((e) => e.id !== id) };
}

/** Link (or unlink, with `eventId: 0`) a cell to an authored `ModuleEvent` (`MapCell.event` —
 * "non-zero links this cell to an ECL event", `model/index.ts`). The event's actual behavior
 * lives in `map.events`; see {@link upsertEvent}. `0` clears the link rather than pointing at
 * event id 0, matching the existing decoded-game/FRUA-importer convention. */
export function setCellEvent(map: ModuleMap, x: number, y: number, eventId: number): ModuleMap {
  const idx = assertInBounds(map, x, y);
  if (!Number.isInteger(eventId) || eventId < 0 || eventId > MAX_WALL_SLOT) {
    throw new Error(`setCellEvent: event id out of range 0-${MAX_WALL_SLOT}: ${eventId}`);
  }
  const cells = map.cells.slice();
  const { event: _current, ...rest } = cells[idx];
  cells[idx] = eventId === 0 ? rest : { ...rest, event: eventId };
  return { ...map, cells };
}

/** Add a new authored `ModuleEvent`, or replace the existing one with the same `id`. */
export function upsertEvent(map: ModuleMap, event: ModuleEvent): ModuleMap {
  if (!Number.isInteger(event.id) || event.id <= 0 || event.id > MAX_WALL_SLOT) {
    throw new Error(`upsertEvent: event id out of range 1-${MAX_WALL_SLOT}: ${event.id}`);
  }
  const events = map.events.filter((e) => e.id !== event.id).concat(event).sort((a, b) => a.id - b.id);
  return { ...map, events };
}

/** Remove event `id` from `map.events`, if present. `loadModule` does not cross-check
 * `MapCell.event` against `map.events` (a cell's event id is resolved lazily, the same way a real
 * decoded game's GEO event slot is); a cell still linking to a removed event will only surface as
 * a "no compiled block for event id" error the moment the party steps onto it and the host calls
 * `runModuleEvent`. */
export function removeEvent(map: ModuleMap, id: number): ModuleMap {
  return { ...map, events: map.events.filter((e) => e.id !== id) };
}

/** `ModuleMap` has no `Map`/`Set` fields (unlike `ModulePackage.graphicSets`), so it round-trips
 * through `JSON.stringify`/`JSON.parse` directly — this pair exists so `apps/author` (and tests)
 * have one named, validated entry point instead of inlining `JSON.parse` + trusting the shape. */
export function serializeModuleMap(map: ModuleMap): string {
  return JSON.stringify(map);
}

function isModuleMapShape(v: unknown): v is ModuleMap {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.name === 'string' &&
    typeof m.width === 'number' &&
    typeof m.height === 'number' &&
    Array.isArray(m.cells) &&
    Array.isArray(m.entries) &&
    Array.isArray(m.events)
  );
}

/** Parse + validate a `serializeModuleMap` payload. Throws on malformed JSON, a shape mismatch, or
 * a cell count that doesn't match `width*height` — a corrupt save is reported, not silently patched. */
export function deserializeModuleMap(json: string): ModuleMap {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new Error(`deserializeModuleMap: invalid JSON (${(err as Error).message})`);
  }
  if (!isModuleMapShape(data)) throw new Error('deserializeModuleMap: not a ModuleMap-shaped object');
  if (data.cells.length !== data.width * data.height) {
    throw new Error(`deserializeModuleMap: cell count ${data.cells.length} != ${data.width}x${data.height}`);
  }
  return data;
}
