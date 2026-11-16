/**
 * Gen1 (CoK/DoK/CoAB/Pool/Secret/Gateway/Treasures) "which areas are actually playable" index —
 * a pure, browser-safe helper factored out of `buildDqkGame.ts`'s `decodeOneArchive`/`assembleGlbs`
 * pairing logic (`pairedAreas = geoAreas.filter(id => eclIds.has(id))`) so callers that only need the
 * GEO+ECL pairing — not the full DQK content-port pipeline — can reuse the exact same criterion
 * without duplicating it. First consumer: the web app's Gen1 area picker (`apps/web/src/ui/explore.ts`),
 * which enumerates every walkable area across a base game's disks for its "walk any area" dropdown.
 *
 * An area is "playable" when its DAX block id has BOTH a real GEO map (`sniffGeoBlock`) and a real
 * ECL script (`sniffGen1EclBlock`) — the same criterion `buildDqkGame.ts`'s own `pairedAreas` field
 * uses. `readDaxDataBlocks`, `sniffGeoBlock`, `decodeGeoBlock` and `sniffGen1EclBlock` are all pure
 * byte-array functions with no Node-only dependencies, so this (and its callers) run fine in a
 * browser bundle.
 */
import { readDaxDataBlocks } from './dax.js';
import { decodeGeoBlock, sniffGeoBlock } from './geo.js';
import { sniffGen1EclBlock } from './eclEncode.js';

/** One playable (GEO+ECL paired) area found in a disk's archives. */
export interface Gen1PlayableArea {
  /** DAX block id shared by the GEO map and the ECL script — the area id. */
  id: number;
  width: number;
  height: number;
}

/** One structurally valid Gen1 GEO map, whether or not its disk also has an ECL block at that id. */
export interface Gen1GeoArea {
  /** DAX block id of the GEO map. */
  id: number;
  /** Gen1's on-disk GEO layout is fixed at 16×16; kept explicit for catalogue consumers. */
  width: number;
  height: number;
}

/**
 * Return every real GEO map in an archive, independent of ECL pairing.
 *
 * A map without a matching ECL block is still valuable catalogue data, but cannot be mounted into
 * the first-person game view: the ECL boot supplies its WALLDEF/8X8D resource selection.  Keeping
 * this distinct from {@link listPairedGen1Areas} prevents the UI from silently pretending those
 * maps do not exist while preserving the strict, resource-safe mount path.
 */
export function listGen1GeoAreas(geoBytes: Uint8Array): Gen1GeoArea[] {
  try {
    return readDaxDataBlocks(geoBytes)
      .filter((b) => sniffGeoBlock(b.raw))
      .map((b) => {
        const { map } = decodeGeoBlock(b.raw, `geo${b.blockId}`);
        return { id: b.blockId, width: map.width, height: map.height };
      })
      .sort((a, b) => a.id - b.id);
  } catch {
    return [];
  }
}

/**
 * Read one disk's GEO + ECL archives and return every area id with BOTH a decodable map and a
 * decodable script, sorted by id ascending. Tolerates an absent/unparseable archive (contributes no
 * areas — never throws), the same graceful-degrade convention `buildDqkGame.ts`'s `safeDaxBlocks`
 * uses.
 */
export function listPairedGen1Areas(geoBytes: Uint8Array, eclBytes: Uint8Array): Gen1PlayableArea[] {
  let geoBlocks: ReturnType<typeof readDaxDataBlocks> = [];
  let eclIds = new Set<number>();
  try {
    geoBlocks = readDaxDataBlocks(geoBytes).filter((b) => sniffGeoBlock(b.raw));
  } catch {
    geoBlocks = [];
  }
  try {
    eclIds = new Set(readDaxDataBlocks(eclBytes).filter((b) => sniffGen1EclBlock(b.raw)).map((b) => b.blockId));
  } catch {
    eclIds = new Set();
  }
  return geoBlocks
    .filter((b) => eclIds.has(b.blockId))
    .map((b) => {
      const { map } = decodeGeoBlock(b.raw, `geo${b.blockId}`);
      return { id: b.blockId, width: map.width, height: map.height };
    })
    .sort((a, b) => a.id - b.id);
}
