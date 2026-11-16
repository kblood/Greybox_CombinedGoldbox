/**
 * GEO map loader — DOS Champions/Death Knights of Krynn dungeon grids (M1.S4).
 *
 * Decodes a decompressed GEO DAX block (see readDaxDataBlocks) into the engine-neutral
 * `GameMap` the Explorer walks.
 *
 *   raw[0:2]     = uint16_le header word. In Champions of Krynn this is the constant 1024 (the
 *                 trailing plane-data size); in **Death Knights of Krynn it is NOT 1024** — DoK
 *                 stores a different leading word (area/checksum) while keeping the exact same
 *                 1026-byte block with the four trailing planes at offset 2 (verified by the
 *                 nibble wall-edge symmetry test on DoK GEO 32/34/36: 0.70–0.89, same as CoK).
 *                 So the loader keys off the 1026-byte length, not the header value.
 *   raw[2:258]   = Plane 0 — (North << 4) | East  wall slots   (nibble-packed)
 *   raw[258:514] = Plane 1 — (South << 4) | West  wall slots   (nibble-packed)
 *   raw[514:770] = Plane 2 — backdrop / zone byte (NOT walls)
 *   raw[770:1026]= Plane 3 — door flags, 2 bits per direction (N=0-1,E=2-3,S=4-5,W=6-7)
 *
 * **Layout corrected 2026-06-21** (was: full-byte North in plane 0, full-byte East in
 * plane 1, S/W derived). The authentic layout — two nibble-packed wall directions per
 * plane, with all four edges stored explicitly per cell, plane 2 = backdrop and plane 3 =
 * door flags — comes from the COAB clean-room source (`Classes/GeoBlock.cs::MapInfo`) and
 * is verified against this repo's GEO blocks: under the nibble model the shared wall edges
 * are 62–91% symmetric (cell South slot == north-neighbour North slot, cell East slot ==
 * east-neighbour West slot), versus 0–13% for any full-byte reading, and every nibble stays
 * in the valid 0–15 slot range. See docs/engine/research/firstperson-wall-geometry-cok.md §5.2
 * and the resolved verdict in docs/engine/research/geo-map-format-cok.md.
 *
 * Each wall nibble is a **slot id**: 0 = open passage, 1–15 = a wall/door graphic slot
 * (the renderer turns it into WALLDEF tiles via wallset = (slot-1)/5, slice = (slot-1)%5).
 * Plane 3 carries per-edge **door flags** (2 bits/dir): 0 = plain wall, 1 = door, 2 =
 * gateway/special. Collision blocks a walled edge only when it has NO door flag — a
 * door/gateway edge is steppable-through (its slot is just the door's graphic).
 */
import type { Direction, GameMap, MapCell } from '../model/index.js';

export const GEO_GRID = 16;
const PLANE = GEO_GRID * GEO_GRID; // 256
const HEADER = 2;
export const GEO_BLOCK_SIZE = HEADER + 4 * PLANE; // 1026

/** Decoded wall slot (for renderers; collision only needs slot ≠ 0). */
export interface WallByte {
  /** Raw slot nibble (0–15). */
  raw: number;
  /** Wall graphic slot, 0 = open, 1–15 = wall. */
  slot: number;
  /** Which of the up-to-3 loaded WALLDEF symbol sets: (slot-1)/5, or -1 when open. */
  wallset: number;
  /** Wall-graphic variant row within the set: (slot-1)%5, or -1 when open. */
  slice: number;
}

/** Decompose a 4-bit wall slot into its WALLDEF set/variant routing. */
export function decodeWallByte(slot: number): WallByte {
  const s = slot & 0x0f;
  return s === 0
    ? { raw: s, slot: 0, wallset: -1, slice: -1 }
    : { raw: s, slot: s, wallset: Math.floor((s - 1) / 5), slice: (s - 1) % 5 };
}

/** Door-flag direction order within a plane-3 byte (2 bits each, low→high). */
const DOOR_DIRS: readonly Direction[] = ['north', 'east', 'south', 'west'];

/** Extract the 2-bit door flag for `dir` from a plane-3 byte (0 = plain wall/none). */
export function doorFlag(plane3Byte: number, dir: Direction): number {
  const shift = DOOR_DIRS.indexOf(dir) * 2;
  return (plane3Byte >> shift) & 0x03;
}

/** Result of decoding one GEO block: the playable map + the raw source planes. */
export interface GeoDecodeResult {
  map: GameMap;
  /** Plane 0 — (North<<4)|East wall slots, raw 256 bytes. */
  wallPlane0: Uint8Array;
  /** Plane 1 — (South<<4)|West wall slots, raw 256 bytes. */
  wallPlane1: Uint8Array;
  /** Plane 2 — backdrop / zone byte, raw 256 bytes. */
  backdropPlane: Uint8Array;
  /** Plane 3 — door flags (2 bits/dir), raw 256 bytes. */
  doorPlane: Uint8Array;
}

/**
 * Sniff: a decompressed GEO block is exactly 1026 bytes (2-byte header word + four 256-byte planes).
 * CoK's header word is the constant 1024; DoK's is a different area/checksum value, so the only
 * portable invariant is the block size — that's what we test.
 */
export function sniffGeoBlock(raw: Uint8Array): boolean {
  return raw.length === GEO_BLOCK_SIZE;
}

/** True iff the GEO block carries the CoK 1024 size-word header (false for DoK's area-word header). */
export function hasCokGeoHeader(raw: Uint8Array): boolean {
  return raw.length === GEO_BLOCK_SIZE && (raw[0] | (raw[1] << 8)) === PLANE * 4;
}

/**
 * Decode one decompressed GEO block into a GameMap (16×16). All four wall edges are read
 * explicitly per cell from the two nibble-packed wall planes; backdrop and door planes are
 * returned raw (door flags also stashed in `cell.flags` for later secret/locked handling).
 */
export function decodeGeoBlock(raw: Uint8Array, name = ''): GeoDecodeResult {
  // The block is always 1026 bytes = a 2-byte header word + four 256-byte planes. CoK's header word
  // is the constant 1024 (the plane-data size); DoK's is a different area/checksum value — both keep
  // the planes at offset 2, so we validate on the length, not the header (see header note above).
  if (raw.length !== GEO_BLOCK_SIZE) {
    throw new Error(
      `GEO: expected a ${GEO_BLOCK_SIZE}-byte block, got len=${raw.length} (header=${raw[0] | (raw[1] << 8)})`,
    );
  }
  return buildGeoResult(
    name,
    GEO_GRID,
    GEO_GRID,
    raw.slice(HEADER, HEADER + PLANE),
    raw.slice(HEADER + PLANE, HEADER + 2 * PLANE),
    raw.slice(HEADER + 2 * PLANE, HEADER + 3 * PLANE),
    raw.slice(HEADER + 3 * PLANE, HEADER + 4 * PLANE),
  );
}

/**
 * Shared plane → GameMap assembly used by both GEO generations. The four planes are
 * row-major W×H byte arrays with the identical semantics in Gen1 (DAX, fixed 16×16) and
 * Gen2 (HLIB, variable W×H): plane0 = (N<<4)|E walls, plane1 = (S<<4)|W walls, plane2 =
 * backdrop/zone byte, plane3 = door flags (2 bits/dir).
 */
function buildGeoResult(
  name: string,
  width: number,
  height: number,
  wallPlane0: Uint8Array,
  wallPlane1: Uint8Array,
  backdropPlane: Uint8Array,
  doorPlane: Uint8Array,
): GeoDecodeResult {
  const cellCount = width * height;
  const cells: MapCell[] = new Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const p0 = wallPlane0[i];
    const p1 = wallPlane1[i];
    const walls: Record<Direction, number> = {
      north: p0 >> 4,
      east: p0 & 0x0f,
      south: p1 >> 4,
      west: p1 & 0x0f,
    };
    const d = doorPlane[i];
    // Plane-3 door flags, 2 bits/direction (N=0-1,E=2-3,S=4-5,W=6-7): 0 = plain,
    // 1 = door, 2 = gateway/special. A door on a walled edge is steppable-through.
    const doors: Record<Direction, number> = {
      north: d & 0x03,
      east: (d >> 2) & 0x03,
      south: (d >> 4) & 0x03,
      west: (d >> 6) & 0x03,
    };
    cells[i] = { walls, doors, floor: backdropPlane[i], flags: d };
  }

  const map: GameMap = {
    name,
    width,
    height,
    cells,
    entries: [],
    // Each edge is stored independently on both cells (with whatever asymmetry the
    // designers used for one-way/secret walls); not a single shared-edge record.
    sharedEdges: false,
  };

  return { map, wallPlane0, wallPlane1, backdropPlane, doorPlane };
}

// ---------------------------------------------------------------------------
// Gen2 (DQK / HLIB DataLib) GEO maps
// ---------------------------------------------------------------------------
//
// The Dark Queen of Krynn stores its dungeon grids in GEO.GLB — a flat HLIB
// "DATA" container (magic=1: ptr[0] is a 20-entry id table, ptr[1..20] are the
// 20 maps). Each map member is:
//
//   byte 0      = width  (W)
//   byte 1      = height (H)
//   bytes 2..7  = 6 header bytes (per-map flags / start hints — purpose TBD,
//                 not needed for the walkable grid; preserved in `header`)
//   then 4 planes of W×H bytes, SAME semantics as Gen1:
//     plane0 = (N<<4)|E walls, plane1 = (S<<4)|W walls,
//     plane2 = backdrop, plane3 = door flags.
//
// Every member satisfies `len == 8 + 4*W*H` exactly, and the nibble wall model
// reproduces the Gen1 edge-symmetry (cell South == north-neighbour North, etc.;
// sym_E 0.85–1.00 across all 20 maps — same model that validated CoK/DoK). Unlike
// Gen1's fixed 16×16, Gen2 maps are variable-sized (10×10 … 39×20).

/** Fixed per-map header before the four planes (H, W, then 6 reserved bytes). */
export const GEN2_GEO_HEADER = 8;

/** One decoded Gen2 GEO map plus its 6 reserved header bytes. */
export interface Gen2GeoMap extends GeoDecodeResult {
  /**
   * Logical **area id** from the GEO.GLB id table (the SAME numbering ECL.GLB uses, so a map and
   * its event script pair by id — GEO area 34 ↔ ECL area 34). Falls back to the 1-based positional
   * index when no id table is present.
   */
  id: number;
  /** The HLIB member index this map came from (1-based; member 0 is the id table). */
  member: number;
  /** The 6 reserved header bytes (offsets 2–7) for this map. */
  header: Uint8Array;
}

/** Parse a Gen2 HLIB id table (`uint16 count`, then `count × {uint16 id, uint16 member}`). */
function parseGen2IdTable(table: Uint8Array): Map<number, number> {
  const memberToId = new Map<number, number>();
  if (table.length < 2) return memberToId;
  const dv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const count = dv.getUint16(0, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + 4 * i;
    if (o + 4 > table.length) break;
    memberToId.set(dv.getUint16(o + 2, true), dv.getUint16(o, true)); // member → id
  }
  return memberToId;
}

/**
 * A Gen2 GEO map member is well-formed when it is at least the 8-byte header long and
 * its length is exactly `8 + 4*W*H` for the W/H it declares (W,H both ≥ 1).
 */
export function sniffGen2GeoBlock(raw: Uint8Array): boolean {
  if (raw.length < GEN2_GEO_HEADER) return false;
  // Order is (height, width) — see decodeGen2GeoBlock. Irrelevant to this length check
  // (W*H commutes), named correctly so the two stay in agreement.
  const h = raw[0];
  const w = raw[1];
  if (w < 1 || h < 1) return false;
  return raw.length === GEN2_GEO_HEADER + 4 * w * h;
}

/** Decode one Gen2 GEO map member (variable W×H) into the engine GameMap. */
export function decodeGen2GeoBlock(raw: Uint8Array, name = '', id = 0, member = 0): Gen2GeoMap {
  if (raw.length < GEN2_GEO_HEADER) {
    throw new Error(`GEO(gen2): block too small (${raw.length} bytes, need ≥ ${GEN2_GEO_HEADER})`);
  }
  // Header byte order is HEIGHT then WIDTH, not W,H. Proven from DQK.EXE's own
  // GetFacingWallType (`2f0d:0628`, file 0x060F08): it clamps the X argument against
  // `es:[buf+1] - 1`, clamps Y against `es:[buf+0] - 1`, and indexes the plane as
  // `es:[buf+1] * Y + X` — so raw[1] is the row stride (width) and raw[0] is the row
  // count (height). Corroborated data-side: of the 8 non-square retail Gen2 maps, all 8
  // score higher wall-edge symmetry under this order (mean 0.877 vs 0.660), which is
  // also the only order that reproduces the 0.85–1.00 figure quoted above.
  const width = raw[1];
  const height = raw[0];
  const plane = width * height;
  const expected = GEN2_GEO_HEADER + 4 * plane;
  if (width < 1 || height < 1 || raw.length !== expected) {
    throw new Error(
      `GEO(gen2): ${width}×${height} implies ${expected} bytes but block is ${raw.length}`,
    );
  }
  const o = GEN2_GEO_HEADER;
  const result = buildGeoResult(
    name,
    width,
    height,
    raw.slice(o, o + plane),
    raw.slice(o + plane, o + 2 * plane),
    raw.slice(o + 2 * plane, o + 3 * plane),
    raw.slice(o + 3 * plane, o + 4 * plane),
  );
  return { ...result, id, member, header: raw.slice(2, GEN2_GEO_HEADER) };
}

/**
 * Walk a DQK GEO.GLB byte image and decode every dungeon map. The container is an
 * HLIB "DATA" library with magic=1, so member[0] is the id table and members[1..N]
 * are the maps. `members` are the raw HLIB member slices (from `decodeHlib().rawMembers`,
 * which for a magic=1 library are ptr[0]=id-table then ptr[1..N]=maps). Members that
 * don't pass the Gen2 sniff (e.g. the leading id table) are skipped.
 */
export function decodeGen2GeoArchive(members: Uint8Array[], baseName = 'GEO'): Gen2GeoMap[] {
  // member[0] is the id table (magic=1): it maps each map's HLIB member index → logical area id.
  const memberToId = members.length > 0 ? parseGen2IdTable(members[0]) : new Map<number, number>();
  const maps: Gen2GeoMap[] = [];
  let positional = 0;
  for (let mi = 0; mi < members.length; mi++) {
    const m = members[mi];
    if (!sniffGen2GeoBlock(m)) continue; // skips the leading id table (and any non-map member)
    positional++;
    const id = memberToId.get(mi) ?? positional;
    maps.push(decodeGen2GeoBlock(m, `${baseName}/area${id}`, id, mi));
  }
  return maps;
}
