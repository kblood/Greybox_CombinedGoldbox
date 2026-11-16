/**
 * Gen2 ECL container loader — DQK `ECL.GLB` (Phase C, C2).
 *
 * The Dark Queen of Krynn ships its event/dialogue/combat scripts in `ECL.GLB`, a flat HLIB
 * **DATA** library (the same Gen2 container family as `GEO.GLB`). It is `magic=1`, so the first
 * member is a directory id table and the rest are the ECL blocks:
 *
 *   - member[0]  = id table: `uint16 count`, then `count × {uint16 areaId, uint16 memberIndex}`.
 *     The `areaId` is the SAME logical area number the GEO library uses (so ECL area 34 pairs
 *     with GEO area 34 — see `decodeGen2GeoArchive`), and `memberIndex` indexes the HLIB members.
 *   - member[1..N] = the ECL blocks, each in the **Gen2 ECL header dialect** (`ECL_GEN2`): five
 *     far pointers, NO 0x1388 magic word, code entry at byte 20 (vaddr 0x8014). The bytecode body
 *     is the SAME dialect the Gen1 disassembler/VM already speak. See `ecl/disassemble.ts`.
 *
 * This loader turns the container into a {@link BlockSource} keyed by **logical area id**, so a DQK
 * dungeon's init/search/dialogue script can be run straight through the existing `EclVm` /
 * `runEclChain` by passing `{ dialect: ECL_GEN2 }`.
 */
import { decodeHlib } from './hlib.js';
import type { BlockSource } from '../ecl/program.js';

export interface EclGlbArchive {
  name: string;
  /** Raw HLIB member slices: member[0] is the id table; member[1..N] are the ECL blocks. */
  members: Uint8Array[];
  /** Logical area id → member index (into `members`), from the id table. */
  idToMember: Map<number, number>;
  /** A {@link BlockSource} keyed by LOGICAL area id (resolves through the id table). */
  blockSourceById: BlockSource;
  /** A {@link BlockSource} keyed by raw member index (1-based; member 0 is the id table). */
  blockSourceByMember: BlockSource;
}

/** Parse the member-0 id table: `count`, then `count × {areaId, memberIndex}` little-endian. */
function parseIdTable(idTable: Uint8Array): Map<number, number> {
  const map = new Map<number, number>();
  if (idTable.length < 2) return map;
  const dv = new DataView(idTable.buffer, idTable.byteOffset, idTable.byteLength);
  const count = dv.getUint16(0, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + 4 * i;
    if (o + 4 > idTable.length) break;
    const areaId = dv.getUint16(o, true);
    const memberIndex = dv.getUint16(o + 2, true);
    map.set(areaId, memberIndex);
  }
  return map;
}

/**
 * Decode a DQK `ECL.GLB` byte image into an addressable script archive. Throws if the bytes are
 * not an HLIB DATA library. The returned block sources hand raw Gen2 ECL block bytes to the VM
 * (run them with `{ dialect: ECL_GEN2 }`).
 */
export function decodeEclGlb(bytes: Uint8Array, name = 'ECL.GLB'): EclGlbArchive {
  const arch = decodeHlib(bytes, name);
  if (!arch.nonImage || arch.rawMembers.length < 2) {
    throw new Error(`ECL.GLB: expected an HLIB DATA library with an id table + blocks (tag=${arch.tag})`);
  }
  const members = arch.rawMembers;
  const idToMember = parseIdTable(members[0]);

  const blockSourceByMember: BlockSource = (idx) =>
    idx >= 1 && idx < members.length ? members[idx] : undefined;
  const blockSourceById: BlockSource = (areaId) => {
    const idx = idToMember.get(areaId);
    return idx === undefined ? undefined : blockSourceByMember(idx);
  };

  return { name, members, idToMember, blockSourceById, blockSourceByMember };
}
