/**
 * GEO content port (E3.1) — emit the DQK (Gen2 / HLIB) GEO format from a decoded GameMap, so a
 * Champions/Death-Knights (Gen1 DAX) dungeon grid can be loaded by the DQK engine's GEO path. This is
 * the first piece of the PRIMARY native goal's content port (porting the older games' GEO/MON/ITEM/ECL
 * onto the newest engine); it writes through the E1 HLIB writer.
 *
 * The two GEO generations share the **same four wall/door/backdrop planes** (plane0 = (N<<4)|E walls,
 * plane1 = (S<<4)|W walls, plane2 = backdrop, plane3 = door flags) — only the *container* differs:
 *   - **Gen1 (CoK/DoK):** a 1026-byte DAX block = `{u16 header}` + 4 × 256-byte planes (fixed 16×16).
 *   - **Gen2 (DQK):** an HLIB `DATA` member = `{u8 W, u8 H, 6 reserved}` + 4 × W·H planes (variable size),
 *     and the maps live in `GEO.GLB` (magic=1: member[0] = id table, members[1..N] = maps).
 *
 * So porting a Gen1 map is loss-free: copy its four planes under a Gen2 8-byte header (W=H=16). The
 * encoders here are the exact inverse of `decodeGen2GeoBlock` / `decodeGen2GeoArchive`, verified by
 * round-trip and by a real CoK `GEO1.DAX` golden in `geoEncode.test.ts`.
 */
import type { GeoDecodeResult } from './geo.js';
import { GEN2_GEO_HEADER } from './geo.js';
import { encodeHlibDataLibrary } from './hlibEncode.js';

/**
 * The six Gen2 GEO header bytes at offsets 2–7 are **NOT reserved padding** — they are the area's
 * resource-set id list, consumed by DQK.EXE's dungeon loader immediately after the GEO member read
 * (cok-m4-fidelity root-cause, `docs/engine/research/cok-m4-fidelity-plan.md` §8): bytes 2–4 name the
 * wall/tile sets looked up in the `8x8d%c` TLB set-id tables, bytes 5–7 the backdrop sets in
 * `BACK.TLB`, with `0xff` = "no set in this slot". A set id that exists in no shipped bank (0 was our
 * zero-fill; DQK's `8X8DB.TLB` carries sets 1–9, `8X8DC.TLB` set 11, `BACK.TLB` 1–17/32–35) sends the
 * loader into its wrong-disk retry loop — on screen: "DISK READ ERROR", black 3-D view. Every native
 * DQK GEO member carries non-zero ids here; ported Gen1 maps must too.
 *
 * This placeholder sextet is a **native DQK dungeon combo proven to load in the ported build** (walls
 * render with DQK art until the CoK/DoK wall-art port lands — the faithful per-area ids come from the
 * source game's `LOAD_PIECES` chain once the matching art is packed into the build's 8x8d banks).
 */
export const DQK_GEO_PLACEHOLDER_SET_IDS: Uint8Array = Uint8Array.from([0x01, 0x02, 0x08, 0x01, 0x08, 0xff]);

/** One map to place in a Gen2 GEO archive. */
export interface Gen2GeoEntry {
  /** Logical area id (the SAME numbering ECL.GLB uses, so map + script pair by id). */
  id: number;
  /** The decoded map (Gen1 `decodeGeoBlock` or Gen2 `decodeGen2GeoBlock` result). */
  geo: GeoDecodeResult;
  /**
   * Optional 6 header bytes (offsets 2–7) — the area resource-set ids (see
   * {@link DQK_GEO_PLACEHOLDER_SET_IDS}); defaults to zeros, which DQK.EXE cannot load.
   */
  header?: Uint8Array;
}

/**
 * Serialise a decoded GEO map into one Gen2 HLIB `DATA` member: `{u8 W, u8 H, 6 reserved}` then the
 * four W·H planes. Works for a Gen1 map (16×16) or a Gen2 map (variable). Throws when W/H are not
 * integer values in 1..255 or the planes are the wrong length.
 */
export function encodeGen2GeoBlock(geo: GeoDecodeResult, header?: Uint8Array): Uint8Array {
  const width = geo.map.width;
  const height = geo.map.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 255 || height > 255) {
    throw new Error(`GEO(gen2) encode: W/H must be 1..255, got ${width}×${height}`);
  }
  const plane = width * height;
  for (const [nm, p] of [
    ['wallPlane0', geo.wallPlane0], ['wallPlane1', geo.wallPlane1],
    ['backdropPlane', geo.backdropPlane], ['doorPlane', geo.doorPlane],
  ] as const) {
    if (p.length !== plane) throw new Error(`GEO(gen2) encode: ${nm} is ${p.length} bytes, expected ${plane} (${width}×${height})`);
  }

  const out = new Uint8Array(GEN2_GEO_HEADER + 4 * plane);
  // (height, width) — the retail header order; see decodeGen2GeoBlock's derivation from
  // DQK.EXE's GetFacingWallType. Keep these two in lockstep or the round-trip transposes.
  out[0] = height;
  out[1] = width;
  if (header) out.set(header.subarray(0, 6), 2); // reserved bytes (else left zero)
  let o = GEN2_GEO_HEADER;
  out.set(geo.wallPlane0, o); o += plane;
  out.set(geo.wallPlane1, o); o += plane;
  out.set(geo.backdropPlane, o); o += plane;
  out.set(geo.doorPlane, o);
  return out;
}

/** Build the Gen2 id table member: `u16 count`, then `count × {u16 id, u16 member}` (member = 1-based slot). */
function encodeGen2IdTable(ids: number[]): Uint8Array {
  const out = new Uint8Array(2 + 4 * ids.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, ids.length, true);
  for (let i = 0; i < ids.length; i++) {
    dv.setUint16(2 + 4 * i, ids[i] & 0xffff, true); // id
    dv.setUint16(2 + 4 * i + 2, i + 1, true); // member index (member[0] is this table)
  }
  return out;
}

/**
 * Pack maps into a complete DQK `GEO.GLB`-style HLIB `DATA` library: member[0] = the id table, then
 * one Gen2 GEO member per map. Round-trips through `decodeHlib().rawMembers` → `decodeGen2GeoArchive`.
 * This is what the CoK/DoK → DQK port emits for the dungeon grids.
 */
export function encodeGen2GeoArchive(entries: Gen2GeoEntry[]): Uint8Array {
  const members: Uint8Array[] = [encodeGen2IdTable(entries.map((e) => e.id))];
  for (const e of entries) members.push(encodeGen2GeoBlock(e.geo, e.header));
  return encodeHlibDataLibrary(members, { tag: 'DATA', magic: 1 });
}

/**
 * Port a Gen1 (CoK/DoK) decoded GEO map to a Gen2 HLIB `DATA` member — the loss-free dungeon-grid
 * conversion (its four planes copied under the Gen2 8-byte header; the Gen1 header word is dropped and
 * the 6 Gen2 reserved bytes default to zero — they are not needed for the walkable grid). Alias of
 * {@link encodeGen2GeoBlock}, named for the port pipeline.
 */
export function portGen1GeoToGen2(geo: GeoDecodeResult, header?: Uint8Array): Uint8Array {
  return encodeGen2GeoBlock(geo, header);
}
