/**
 * CoK wall-art port (M4 follow-up — cok-m4-fidelity-plan.md §8 residual) tests.
 *
 *  1) `appendHlibMasterSets`/`decodeHlibSetIdTable`/`encodeHlibSetIdTable`: synthetic master
 *     round-trip — new sets decode with the right geometry, existing sets/ids survive verbatim,
 *     duplicate ids are rejected.
 *  2) `stampCokWallHeaders`: synthetic GEO.GLB — only the named area ids get their header bytes
 *     2-7 rewritten; everything else (including plane data) is untouched.
 *  3) `buildCokWallArtPort`: synthetic ECL/WALLDEF/8X8D sources — an area whose init block calls
 *     LOAD_PIECES resolves to a real per-area header + new wall-bank sets; an area with no
 *     LOAD_PIECES is honestly reported `residual`.
 *  4) Golden (skipped when CoK/DQK game data is absent): real CoK `ECL1.DAX`/`WALLDEF1.DAX`/
 *     `8X8D1.DAX` block 34 (the SAME two-set area `dungeon.test.ts` golden-verifies as
 *     `setBlockIds [3, 0xff, 23]`) ports through end-to-end against the real DQK `8X8DB.TLB`.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeHlib,
  mapHlibMasterSlots,
  encodeHlibTile,
  encodeHlibMaster,
  appendHlibMasterSets,
  decodeHlibSetIdTable,
  encodeHlibSetIdTable,
  encodeGen2GeoArchive,
  decodeGen2GeoBlock,
  readDaxDataBlocks,
  sniffGen1EclBlock,
  buildCokWallArtPort,
  stampCokWallHeaders,
  buildCrossDiskBlockSource,
  COK_WALL_SET_ID_BASE,
  DQK_GEO_PLACEHOLDER_SET_IDS,
  ECL_HEADER_LEN,
  ECL_GEN1_SHORT,
  type GeoDecodeResult,
  type CokWallDiskSource,
} from '../src/index.js';

// --- synthetic builders ------------------------------------------------------

/** A single-image leaf TILE (8x8, index 0) — enough shape to be a valid "set". */
function tinySet(fill: number): Uint8Array {
  const indices = new Uint8Array(8 * 8).fill(fill);
  return encodeHlibTile([{ width: 8, height: 8, indices }], null, { method: 16 });
}

/** A 3-set master HLIB with a real {id, ptr#} set-id table, ids 1..3. */
function syntheticMaster(): Uint8Array {
  const sets = [tinySet(1), tinySet(2), tinySet(3)];
  const idTable = encodeHlibSetIdTable([{ id: 1, ptr: 1 }, { id: 2, ptr: 2 }, { id: 3, ptr: 3 }]);
  return encodeHlibMaster(sets, { magic: 1, setIdTable: idTable });
}

describe('appendHlibMasterSets / set-id table round-trip', () => {
  it('appends new sets without disturbing the existing ones', () => {
    const original = syntheticMaster();
    const before = decodeHlib(original);
    expect(before.images.length).toBe(3);

    const extended = appendHlibMasterSets(original, [
      { id: 100, leaf: tinySet(9) },
      { id: 101, leaf: tinySet(8) },
    ]);
    const after = decodeHlib(extended);
    expect(after.images.length).toBe(5);
    // Existing 3 sets' pixel content is byte-identical (verbatim carry-over).
    for (let i = 0; i < 3; i++) {
      expect(Array.from(after.images[i].image.indices)).toEqual(Array.from(before.images[i].image.indices));
    }
    expect(Array.from(after.images[3].image.indices)).toEqual(new Array(64).fill(9));
    expect(Array.from(after.images[4].image.indices)).toEqual(new Array(64).fill(8));

    // Set-id table: 3 original entries survive + 2 new ones, correctly numbered.
    const refs = mapHlibMasterSlots(extended);
    expect(refs.length).toBe(5);
    const hdr = decodeHlib(extended);
    expect(hdr.tag).toBe('HLIB');
  });

  it('the extended set-id table decodes to the right {id, ptr#} rows', () => {
    const original = syntheticMaster();
    const extended = appendHlibMasterSets(original, [{ id: 100, leaf: tinySet(9) }]);
    // Re-derive the table ourselves (public decoder round-trip): member[0] of a master sits at ptr[0]..ptr[1].
    const dv = new DataView(extended.buffer, extended.byteOffset, extended.byteLength);
    const count = dv.getUint16(8, true) + 1;
    const ptrs = Array.from({ length: count }, (_, i) => dv.getUint32(16 + 4 * i, true));
    const table = extended.subarray(ptrs[0], ptrs[1]);
    const entries = decodeHlibSetIdTable(table);
    expect(entries).toEqual([
      { id: 1, ptr: 1 },
      { id: 2, ptr: 2 },
      { id: 3, ptr: 3 },
      { id: 100, ptr: 4 },
    ]);
  });

  it('rejects an id that already exists in the table', () => {
    const original = syntheticMaster();
    expect(() => appendHlibMasterSets(original, [{ id: 2, leaf: tinySet(9) }])).toThrow(/already present/);
  });

  it('encodeHlibSetIdTable is the exact inverse of decodeHlibSetIdTable', () => {
    const entries = [{ id: 5, ptr: 1 }, { id: 200, ptr: 2 }, { id: 65000, ptr: 3 }];
    expect(decodeHlibSetIdTable(encodeHlibSetIdTable(entries))).toEqual(entries);
  });
});

describe('buildCrossDiskBlockSource', () => {
  const b = (...bytes: number[]) => Uint8Array.from(bytes);

  it('always prefers the requested disk\'s own copy of an id, even when other disks also have it', () => {
    const src = buildCrossDiskBlockSource([
      { diskNum: 1, blocks: new Map([[23, b(1, 1, 1)]]) },
      { diskNum: 3, blocks: new Map([[23, b(9, 9, 9)]]) }, // real CoK case: same id, DIFFERENT content
    ]);
    expect(src.lookup(1, 23)).toEqual(b(1, 1, 1));
    expect(src.lookup(3, 23)).toEqual(b(9, 9, 9));
    expect(src.ambiguousIds).toEqual([23]);
  });

  it('falls back to another disk when the id is unique to it (the real DoK case: block 2 lives only on disk 4)', () => {
    const src = buildCrossDiskBlockSource([
      { diskNum: 1, blocks: new Map([[1, b(1)]]) },
      { diskNum: 4, blocks: new Map([[2, b(2)]]) },
    ]);
    // Area on ECL disk 1 asks for block id 2, which only exists on disk 4 -- resolved.
    expect(src.lookup(1, 2)).toEqual(b(2));
    // Symmetric: an area on disk 4 asking for id 1 (which only exists on disk 1) also resolves --
    // the fallback isn't a one-way "always prefer the lower disk number" rule, just "unique wins".
    expect(src.lookup(4, 1)).toEqual(b(1));
  });

  it('refuses to guess when a non-preferred-disk id is genuinely ambiguous (disagreeing content on 2+ OTHER disks)', () => {
    const src = buildCrossDiskBlockSource([
      { diskNum: 4, blocks: new Map([[2, b(1, 2, 3)]]) },
      { diskNum: 5, blocks: new Map([[2, b(9, 9, 9)]]) },
    ]);
    // Neither disk 4 nor 5 is the "preferred" disk here -- id 2 disagrees between them, so a
    // request from a third disk must not silently pick one.
    expect(src.lookup(1, 2)).toBeNull();
    expect(src.ambiguousIds).toEqual([2]);
    // The disks that actually HOLD it still resolve their own copy correctly.
    expect(src.lookup(4, 2)).toEqual(b(1, 2, 3));
    expect(src.lookup(5, 2)).toEqual(b(9, 9, 9));
  });

  it('returns null for an id absent from every disk', () => {
    const src = buildCrossDiskBlockSource([{ diskNum: 1, blocks: new Map([[1, b(1)]]) }]);
    expect(src.lookup(1, 99)).toBeNull();
  });

  it('multiple disks agreeing byte-for-byte on the same id is NOT reported ambiguous', () => {
    const src = buildCrossDiskBlockSource([
      { diskNum: 1, blocks: new Map([[7, b(5, 5)]]) },
      { diskNum: 2, blocks: new Map([[7, b(5, 5)]]) },
    ]);
    expect(src.ambiguousIds).toEqual([]);
    expect(src.lookup(3, 7)).toEqual(b(5, 5)); // neither disk 1 nor 2 is preferred -- still resolves
  });
});

describe('stampCokWallHeaders', () => {
  /** A deterministic Gen2 GEO map (mirrors geoEncode.test.ts's synthGeo). */
  function synthGeo(seed: number): GeoDecodeResult {
    const n = 16 * 16;
    const p = (k: number) => Uint8Array.from({ length: n }, (_, i) => (i * k + seed) & 0xff);
    const blk = new Uint8Array(8 + 4 * n);
    blk[0] = 16; blk[1] = 16;
    blk.set(p(7), 8); blk.set(p(13), 8 + n); blk.set(p(3), 8 + 2 * n); blk.set(p(5), 8 + 3 * n);
    return decodeGen2GeoBlock(blk, 'synth');
  }

  it('patches only the named area ids, leaving everything else byte-identical', () => {
    const g1 = synthGeo(1);
    const g2 = synthGeo(2);
    const g3 = synthGeo(3);
    const before = encodeGen2GeoArchive([
      { id: 10, geo: g1, header: DQK_GEO_PLACEHOLDER_SET_IDS },
      { id: 20, geo: g2, header: DQK_GEO_PLACEHOLDER_SET_IDS },
      { id: 30, geo: g3, header: DQK_GEO_PLACEHOLDER_SET_IDS },
    ]);
    const newHeader = Uint8Array.from([100, 0xff, 101, 1, 8, 0xff]);
    const { geoGlb: after, stamped } = stampCokWallHeaders(before, new Map([[20, newHeader]]));
    expect(stamped).toEqual([20]);

    const beforeMembers = decodeHlib(before).rawMembers;
    const afterMembers = decodeHlib(after).rawMembers;
    expect(afterMembers.length).toBe(beforeMembers.length);
    // member[0] (id table) untouched; area 10 and 30 members untouched; area 20's header changed but
    // plane data (byte 8 onward) untouched.
    expect(Array.from(afterMembers[0])).toEqual(Array.from(beforeMembers[0]));
    // Find which raw member holds id 20 via the (now-shared) id table format.
    const dv = new DataView(beforeMembers[0].buffer, beforeMembers[0].byteOffset, beforeMembers[0].byteLength);
    const count = dv.getUint16(0, true);
    let member20 = -1;
    for (let i = 0; i < count; i++) {
      if (dv.getUint16(2 + 4 * i, true) === 20) member20 = dv.getUint16(2 + 4 * i + 2, true);
    }
    expect(member20).toBeGreaterThan(0);
    expect(Array.from(afterMembers[member20].subarray(2, 8))).toEqual(Array.from(newHeader));
    expect(Array.from(afterMembers[member20].subarray(8))).toEqual(Array.from(beforeMembers[member20].subarray(8)));
    // Untouched members (not id 20) stay fully byte-identical.
    for (let i = 1; i < afterMembers.length; i++) {
      if (i === member20) continue;
      expect(Array.from(afterMembers[i])).toEqual(Array.from(beforeMembers[i]));
    }
  });

  it('is a no-op when no ids match', () => {
    const g1 = synthGeo(1);
    const before = encodeGen2GeoArchive([{ id: 10, geo: g1, header: DQK_GEO_PLACEHOLDER_SET_IDS }]);
    const { geoGlb: after, stamped } = stampCokWallHeaders(before, new Map([[999, Uint8Array.from([1, 2, 3, 4, 5, 6])]]));
    expect(stamped).toEqual([]);
    expect(Array.from(after)).toEqual(Array.from(before));
  });
});

describe('buildCokWallArtPort — synthetic', () => {
  const RECORD = 780;
  function eclBlock(...body: number[]): Uint8Array {
    const raw = new Uint8Array(ECL_HEADER_LEN + body.length);
    raw[0] = 0x88; raw[1] = 0x13; raw[2] = 0x01; raw[3] = 0x01;
    raw.set(body, ECL_HEADER_LEN);
    return raw;
  }
  const imm = (v: number) => [0x00, v & 0xff];
  /** LOAD_FILES geo ; LOAD_PIECES s1,s2,s3 ; EXIT. */
  function initBlock(geo: number, pieces: [number, number, number]): Uint8Array {
    return eclBlock(
      0x21, ...imm(geo), ...imm(0), ...imm(0xff),
      0x37, ...imm(pieces[0]), ...imm(pieces[1]), ...imm(pieces[2]),
      0x00,
    );
  }
  /** LOAD_FILES only (no LOAD_PIECES) ; EXIT — the "residual" case. */
  function noPiecesBlock(geo: number): Uint8Array {
    return eclBlock(0x21, ...imm(geo), ...imm(0), ...imm(0xff), 0x00);
  }
  function walldef(records: number, id: number, col: number): Uint8Array {
    const raw = new Uint8Array(records * RECORD);
    for (let r = 0; r < records; r++) raw[r * RECORD + 0 * 156 + col] = id & 0xff;
    return raw;
  }
  function tiles8x8(count: number, salt = 1): Uint8Array {
    const raw = new Uint8Array(17 + count * 32);
    raw[0] = 8; raw[2] = 1; raw[8] = count;
    for (let i = 0; i < count; i++) {
      const nib = (i + salt) & 0x0f; // salt varies content per source block (avoid 0 = all-magenta)
      raw.fill((nib << 4) | nib, 17 + i * 32, 17 + (i + 1) * 32);
    }
    return raw;
  }

  it('resolves an area with LOAD_PIECES into real new wall-bank sets + header', () => {
    const wd: Record<number, Uint8Array> = { 5: walldef(1, 0x30, 10), 6: walldef(1, 0x30, 10), 7: walldef(1, 0x30, 10) };
    const tl: Record<number, Uint8Array> = { 5: tiles8x8(4, 1), 6: tiles8x8(4, 2), 7: tiles8x8(4, 3) };
    const disk: CokWallDiskSource = {
      ecl: [{ id: 42, block: initBlock(42, [5, 6, 7]) }],
      walldefBlock: (id) => wd[id] ?? null,
      tileBlock: (id) => tl[id] ?? null,
    };
    const original = syntheticMaster();
    const result = buildCokWallArtPort([disk], original);

    expect(result.residual).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    const [area] = result.resolved;
    expect(area.areaId).toBe(42);
    // 3 distinct WALLDEF blocks (5,6,7) all point at the SAME tile id (0x30) at pool column 10, but each
    // loads its OWN 8X8D block (5/6/7 respectively) — distinct pixel content (fill nibble varies) -> 3
    // distinct new sets, all >= COK_WALL_SET_ID_BASE.
    expect(area.wallSetIds.every((id) => id !== null && id >= COK_WALL_SET_ID_BASE)).toBe(true);
    expect(area.header.length).toBe(6);
    expect(Array.from(area.header.subarray(0, 3))).toEqual(area.wallSetIds);
    // Backdrop bytes stay the documented placeholder (no CoK backdrop source).
    expect(Array.from(area.header.subarray(3, 6))).toEqual(Array.from(DQK_GEO_PLACEHOLDER_SET_IDS.subarray(3, 6)));

    // 3 distinct source 8X8D blocks (5/6/7, each salted differently) -> 3 distinct new sets.
    expect(result.newSets).toHaveLength(3);
    expect(result.wallBankTlb).toBeDefined();
    const decoded = decodeHlib(result.wallBankTlb!);
    // 3 synthetic original sets (1 tile each) + the new sets' own tile counts (4 tiles each here).
    expect(decoded.images.length).toBe(3 + sumTileCounts(result));
  });

  it('reports an area with no LOAD_PIECES as residual and leaves the wall bank untouched', () => {
    const disk: CokWallDiskSource = {
      ecl: [{ id: 99, block: noPiecesBlock(99) }],
      walldefBlock: () => null,
      tileBlock: () => null,
    };
    const result = buildCokWallArtPort([disk], syntheticMaster());
    expect(result.resolved).toEqual([]);
    expect(result.residual).toHaveLength(1);
    expect(result.residual[0].areaId).toBe(99);
    expect(result.residual[0].reason).toMatch(/no LOAD_PIECES/);
    expect(result.wallBankTlb).toBeUndefined();
    expect(result.newSets).toEqual([]);
  });

  it('dedupes identical tile pools across areas into one shared set id', () => {
    const wd: Record<number, Uint8Array> = { 5: walldef(1, 0x30, 10) };
    const tl: Record<number, Uint8Array> = { 5: tiles8x8(4) };
    const disk: CokWallDiskSource = {
      ecl: [
        { id: 1, block: initBlock(1, [5, 0xff, 0xff]) },
        { id: 2, block: initBlock(2, [5, 0xff, 0xff]) },
      ],
      walldefBlock: (id) => wd[id] ?? null,
      tileBlock: (id) => tl[id] ?? null,
    };
    const result = buildCokWallArtPort([disk], syntheticMaster());
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved[0].wallSetIds[0]).toBe(result.resolved[1].wallSetIds[0]);
    // Both areas' set2/set3 are Reset (0xff operand) -> null wallSetIds -> header byte 0xff.
    expect(result.resolved[0].header[1]).toBe(0xff);
    expect(result.resolved[0].header[2]).toBe(0xff);
    // Exactly ONE new set was created despite two areas resolving wallset 1.
    expect(result.newSets).toHaveLength(1);
  });

  it('two-set fallback: a set-2 WALLDEF block absent from the lookup resolves via the two-set path, with a note', () => {
    // Mirrors real CoK areas 66/97: LOAD_PIECES names (s1, s2, Reset) where s2 was never shipped.
    // A fresh VM run leaves the region-persistent two-set flags 0x4be7/0x4be8 at 0 (three-set
    // path), which is impossible against the shipped data — the port must retry as two-set.
    const wd: Record<number, Uint8Array> = { 5: walldef(1, 0x30, 10) };
    const tl: Record<number, Uint8Array> = { 5: tiles8x8(4) };
    const disk: CokWallDiskSource = {
      ecl: [{ id: 66, block: initBlock(66, [5, 99, 0xff]) }],
      walldefBlock: (id) => wd[id] ?? null,
      tileBlock: (id) => tl[id] ?? null,
    };
    const result = buildCokWallArtPort([disk], syntheticMaster());
    expect(result.residual).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    const [area] = result.resolved;
    expect(area.areaId).toBe(66);
    expect(area.note).toMatch(/two-set fallback/);
    expect(area.note).toMatch(/block 99/);
    // Set 1 resolved for real; set 2 skipped (the whole point); set 3 was Reset in the operands.
    expect(area.wallSetIds[0]).not.toBeNull();
    expect(area.wallSetIds[1]).toBeNull();
    expect(area.wallSetIds[2]).toBeNull();
    expect(area.header[1]).toBe(0xff);
  });

  it('two-set fallback NEVER fires when the named set-2 WALLDEF block exists — any other load failure stays residual', () => {
    // Set-1's WALLDEF block 99 is missing (a genuine, fatal load error) while set-2's block 6
    // EXISTS: the fallback gate (walldefBlock(s2) === null) must keep this residual rather than
    // paper over a real data problem with a two-set guess.
    const wd: Record<number, Uint8Array> = { 6: walldef(1, 0x30, 10) };
    const tl: Record<number, Uint8Array> = { 6: tiles8x8(4) };
    const disk: CokWallDiskSource = {
      ecl: [{ id: 66, block: initBlock(66, [99, 6, 0xff]) }],
      walldefBlock: (id) => wd[id] ?? null,
      tileBlock: (id) => tl[id] ?? null,
    };
    const result = buildCokWallArtPort([disk], syntheticMaster());
    expect(result.resolved).toEqual([]);
    expect(result.residual).toHaveLength(1);
    expect(result.residual[0].reason).toMatch(/loadDungeonWalls failed/);
    expect(result.residual[0].reason).not.toMatch(/two-set fallback/);
  });

  it('DoK-style single-bank: a multi-record WALLDEF block filling sets 1-3 from ONE shared 8X8D bank packs to one deduped set id', () => {
    // Trigger loadDungeonWalls' `usesSingleBank` branch (dungeonWalls.ts): a 3-record WALLDEF block
    // (k=3) referenced by wallset 1 alone, backed by a >=128-tile 8X8D bank at the SAME block id and
    // NO per-record sub-block (id*10+1 absent) -- exactly DoK's shared-256-tile packing, just smaller.
    const wd: Record<number, Uint8Array> = { 5: walldef(3, 0x30, 10) };
    const tl: Record<number, Uint8Array> = { 5: tiles8x8(128, 7) }; // no key 51 -> forces single-bank detection
    const disk: CokWallDiskSource = {
      ecl: [{ id: 77, block: initBlock(77, [5, 0xff, 0xff]) }],
      walldefBlock: (id) => wd[id] ?? null,
      tileBlock: (id) => tl[id] ?? null,
    };
    const result = buildCokWallArtPort([disk], syntheticMaster());
    expect(result.residual).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    const [area] = result.resolved;
    // All three wallsets resolve (the k=3 record expansion fills slots 1,2,3 from operand[0] alone);
    // since `tileSets[1..3]` all point at the SAME `singleBank` object, encoding each slot produces
    // byte-identical leaves -> the content-hash dedup collapses them to exactly ONE new set id, shared
    // by all three header bytes (the minimal generalization documented on buildCokWallArtPort itself).
    expect(area.wallSetIds.every((id) => id !== null)).toBe(true);
    expect(area.wallSetIds[0]).toBe(area.wallSetIds[1]);
    expect(area.wallSetIds[1]).toBe(area.wallSetIds[2]);
    expect(result.newSets).toHaveLength(1);
  });

  it('the `dialect` option is threaded through to ECL decoding: a short-frame opcode before LOAD_PIECES resolves under ECL_GEN1_SHORT but desyncs under the default long dialect', () => {
    // Opcode 0x1D (PARTYSTRENGTH) takes 0 operand words under ECL_GEN1_SHORT and 1 under the
    // default ECL_GEN1 (disassemble.ts's `ECL_GEN1_SHORT.wordSetOverrides[0x1d] = 0`, matching the
    // real DoK/Gateway/Treasures/PoD corpus-wide finding in dok-natural-route.md). Bytes below are
    // written assuming the SHORT (0-operand) framing: opcode 0x1D immediately followed by LOAD_PIECES
    // (0x37). Under the long dialect the decoder wrongly eats the next word (LOAD_PIECES' own opcode
    // byte + the first byte of its first operand) as 0x1D's operand, desyncing everything after it —
    // proving `resolveAreaPieces` actually uses the caller's dialect, not silently defaulting to
    // ECL_GEN1 regardless of what's passed (the exact bug class this option was added to fix).
    const block = eclBlock(
      0x21, ...imm(5), ...imm(0), ...imm(0xff), // LOAD_FILES 5 (unaffected by the dialect delta)
      0x1d, // PARTYSTRENGTH — 0 operands under SHORT, 1 under LONG
      0x37, ...imm(1), ...imm(0xff), ...imm(0xff), // LOAD_PIECES 1,0xff,0xff (correct only if 0x1D took 0 operands)
      0x00, // EXIT
    );
    const wd: Record<number, Uint8Array> = { 1: walldef(1, 0x30, 10) };
    const tl: Record<number, Uint8Array> = { 1: tiles8x8(4) };
    const disk: CokWallDiskSource = {
      ecl: [{ id: 55, block }],
      walldefBlock: (id) => wd[id] ?? null,
      tileBlock: (id) => tl[id] ?? null,
    };
    const short = buildCokWallArtPort([disk], syntheticMaster(), { dialect: ECL_GEN1_SHORT });
    const long = buildCokWallArtPort([disk], syntheticMaster()); // default dialect = ECL_GEN1 (wrong here)
    expect(short.residual).toEqual([]);
    expect(short.resolved).toHaveLength(1);
    expect(short.resolved[0].wallSetIds[0]).not.toBeNull();
    // The long (wrong) dialect must NOT reach the same resolved state — either it desyncs into a bad
    // opcode (residual) or, in principle, a spuriously "resolved" but WRONG header; either outcome
    // proves the option is load-bearing, not silently ignored.
    if (long.resolved.length === 1) {
      expect(Array.from(long.resolved[0].header)).not.toEqual(Array.from(short.resolved[0].header));
    } else {
      expect(long.residual.length).toBeGreaterThan(0);
    }
  });
});

// --- golden: real CoK ECL1 block 34 (the SAME area dungeon.test.ts golden-verifies) --------------

const here = fileURLToPath(new URL('.', import.meta.url));
const cok = resolve(here, '..', '..', '..', 'Champions of Krynn');
const dqk = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn');
const have =
  ['ECL1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'].every((f) => existsSync(resolve(cok, f))) &&
  existsSync(resolve(dqk, 'DISK2', '8X8DB.TLB'));

async function daxIndex(file: string, base: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(base, file))));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe.skipIf(!have)('buildCokWallArtPort — golden CoK ECL1 block 34', () => {
  it('ports the real two-set area into new 8X8DB.TLB sets + a real header', async () => {
    const ecl = await daxIndex('ECL1.DAX', cok);
    const wd = await daxIndex('WALLDEF1.DAX', cok);
    const tl = await daxIndex('8X8D1.DAX', cok);
    const original = new Uint8Array(await readFile(resolve(dqk, 'DISK2', '8X8DB.TLB')));
    const originalCount = decodeHlib(original).images.length;

    const disk: CokWallDiskSource = {
      ecl: [{ id: 34, block: ecl.get(34)! }],
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const result = buildCokWallArtPort([disk], original);

    expect(result.residual).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    const [area] = result.resolved;
    expect(area.areaId).toBe(34);
    // dungeon.test.ts's golden: setBlockIds = [3, 0xff, 23] (twoSet area). WALLDEF block 3 is a
    // 2-record block, so its expansion fills wallsets 1 AND 2 (loadDungeonWalls' `slot = s + i`);
    // wallset 3 is filled independently from block 23 — so ALL THREE resolve (matches dungeon.test.ts's
    // own golden: `for (ws=0..2) expect(walldefBlocks[ws]).not.toBeNull()`), none stay 0xff/Reset here.
    expect(area.wallSetIds.every((id) => id !== null)).toBe(true);
    expect(Array.from(area.header.subarray(0, 3)).every((b) => b !== 0xff)).toBe(true);

    // The extended bank decodes cleanly and carries the original sets through verbatim + the new ones.
    expect(result.wallBankTlb).toBeDefined();
    const extended = decodeHlib(result.wallBankTlb!);
    expect(extended.images.length).toBe(originalCount + sumTileCounts(result));
    // Every new set id referenced by the resolved header actually exists in the extended table.
    const dv = new DataView(result.wallBankTlb!.buffer, result.wallBankTlb!.byteOffset, result.wallBankTlb!.byteLength);
    const count = dv.getUint16(8, true) + 1;
    const ptrs = Array.from({ length: count }, (_, i) => dv.getUint32(16 + 4 * i, true));
    const table = decodeHlibSetIdTable(result.wallBankTlb!.subarray(ptrs[0], ptrs[1]));
    const ids = new Set(table.map((e) => e.id));
    for (const id of [area.wallSetIds[0]!, area.wallSetIds[2]!]) expect(ids.has(id)).toBe(true);
  });
});

// --- golden: real DoK ECL1 block 34 (the SAME area dungeonEvents.test.ts golden-verifies, under
// DoK's OWN ECL_GEN1_SHORT dialect -- proves the dialect-threading fix, not just that the port
// "runs without crashing" under the wrong dialect (a silent-desync bug would still produce SOME
// residual/resolved result, not a thrown error) ------------------------------------------------

const dokDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn');
const haveDok =
  ['ECL1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX'].every((f) => existsSync(resolve(dokDir, f))) &&
  existsSync(resolve(dqk, 'DISK2', '8X8DB.TLB'));

describe.skipIf(!haveDok)('buildCokWallArtPort — golden DoK ECL1 block 34 (ECL_GEN1_SHORT dialect)', () => {
  it('resolves the real SIVAK-ambush area under the short dialect', async () => {
    const ecl = await daxIndex('ECL1.DAX', dokDir);
    const wd = await daxIndex('WALLDEF1.DAX', dokDir);
    const tl = await daxIndex('8X8D1.DAX', dokDir);
    const original = new Uint8Array(await readFile(resolve(dqk, 'DISK2', '8X8DB.TLB')));

    const disk: CokWallDiskSource = {
      ecl: [{ id: 34, block: ecl.get(34)! }],
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const result = buildCokWallArtPort([disk], original, { dialect: ECL_GEN1_SHORT });
    expect(result.residual).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].areaId).toBe(34);
  });

  it('DoK ECL1 block 34 happens to resolve identically under both dialects (documented, not a regression)', async () => {
    // Empirically (not assumed): this SPECIFIC block's own path to LOAD_PIECES never crosses a
    // 0x1D/0x22/0x2C instruction, so the long dialect's wrong operand framing never has anything to
    // desync before LOAD_PIECES fires -- both dialects resolve the SAME setBlockIds/header here. This
    // does NOT mean the dialect fix is unnecessary: `buildCokWallArtPort — synthetic`'s own
    // "dialect option is threaded through" test constructs a block that DOES cross the delta and
    // proves the threading is load-bearing there. Real DoK blocks that resolve wall art AND cross the
    // delta before LOAD_PIECES would show the divergence; none of DoK's own 9 currently-resolved
    // areas (`build/dok-dqk-release`'s own wall-art log) happen to be that block — an honest negative,
    // recorded here so a future contributor doesn't assume this test ever demonstrated the risk.
    const ecl = await daxIndex('ECL1.DAX', dokDir);
    const wd = await daxIndex('WALLDEF1.DAX', dokDir);
    const tl = await daxIndex('8X8D1.DAX', dokDir);
    const original = new Uint8Array(await readFile(resolve(dqk, 'DISK2', '8X8DB.TLB')));
    const disk: CokWallDiskSource = {
      ecl: [{ id: 34, block: ecl.get(34)! }],
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    };
    const short = buildCokWallArtPort([disk], original, { dialect: ECL_GEN1_SHORT });
    const long = buildCokWallArtPort([disk], original); // default dialect = ECL_GEN1
    expect(short.resolved).toHaveLength(1);
    expect(long.resolved).toHaveLength(1);
    expect(Array.from(long.resolved[0].header)).toEqual(Array.from(short.resolved[0].header));
  });
});

// --- golden: real DoK, ALL 3 ECL disks against ALL 5 WALLDEF/8X8D disks via buildCrossDiskBlockSource
// -- proves the cross-disk fallback fix. DoK ships WALLDEF1-5.DAX/8X8D1-5.DAX (5 archives) against only
// 3 GEO/ECL/MON disks; a naive "one WALLDEF/8X8D disk per ECL disk" pairing (what this port originally
// did) leaves 11 of 19 playable areas residual because their LOAD_PIECES block id lives on a
// WALLDEF/8X8D disk numbered differently from their own ECL disk (e.g. area 32 is on ECL disk 1 but its
// WALLDEF block 2 lives ONLY on WALLDEF4.DAX) -- see docs/engine/research/dok-wall-art-cross-disk.md.
// This test proves buildCrossDiskBlockSource resolves them without regressing CoK's own disk-scoped
// correctness (verified separately by buildCrossDiskBlockSource's own ambiguous-id unit tests above,
// using CoK's REAL id-23-collides-across-disks fact) --------------------------------------------------

const haveDokAllDisks =
  [1, 2, 3].every((k) => existsSync(resolve(dokDir, `ECL${k}.DAX`)) && existsSync(resolve(dokDir, `GEO${k}.DAX`))) &&
  [1, 2, 3, 4, 5].every((k) => existsSync(resolve(dokDir, `WALLDEF${k}.DAX`)) && existsSync(resolve(dokDir, `8X8D${k}.DAX`))) &&
  existsSync(resolve(dqk, 'DISK2', '8X8DB.TLB'));

describe.skipIf(!haveDokAllDisks)('buildCokWallArtPort — golden DoK, all 3 ECL disks x cross-disk WALLDEF/8X8D fallback', () => {
  it('resolves areas whose WALLDEF block lives on a WALLDEF disk numbered differently from their own ECL disk', async () => {
    const original = new Uint8Array(await readFile(resolve(dqk, 'DISK2', '8X8DB.TLB')));

    const perDiskWalldef = await Promise.all(
      [1, 2, 3, 4, 5].map(async (k) => ({
        diskNum: k,
        blocks: await daxIndex(`WALLDEF${k}.DAX`, dokDir),
      })),
    );
    const perDiskTiles = await Promise.all(
      [1, 2, 3, 4, 5].map(async (k) => ({
        diskNum: k,
        blocks: await daxIndex(`8X8D${k}.DAX`, dokDir),
      })),
    );
    const wdSource = buildCrossDiskBlockSource(perDiskWalldef);
    const tlSource = buildCrossDiskBlockSource(perDiskTiles);
    // Real DoK data has zero WALLDEF/8X8D id collisions across its 5 disks (unlike CoK's real
    // WALLDEF1/WALLDEF3 id-23 collision) -- an empty ambiguousIds list is itself evidence this fallback
    // is safe to apply here, not an assumption.
    expect(wdSource.ambiguousIds).toEqual([]);
    expect(tlSource.ambiguousIds).toEqual([]);

    const disks: CokWallDiskSource[] = [];
    for (const diskNum of [1, 2, 3]) {
      const eclBytes = new Uint8Array(await readFile(resolve(dokDir, `ECL${diskNum}.DAX`)));
      disks.push({
        ecl: readDaxDataBlocks(eclBytes)
          .filter((b) => sniffGen1EclBlock(b.raw))
          .map((b) => ({ id: b.blockId, block: b.raw })),
        walldefBlock: (id) => wdSource.lookup(diskNum, id),
        tileBlock: (id) => tlSource.lookup(diskNum, id),
      });
    }
    const result = buildCokWallArtPort(disks, original, { dialect: ECL_GEN1_SHORT });

    // Every area previously reported residual by build/dok-dqk-release's own wall-art log (README's
    // "8/19" coverage entry) because its WALLDEF block sat on a differently-numbered disk now resolves.
    const previouslyResidualNowResolved = [32, 48, 51, 65, 66, 67, 80, 96, 97, 98, 99];
    const resolvedIds = new Set(result.resolved.map((a) => a.areaId));
    for (const id of previouslyResidualNowResolved) expect(resolvedIds.has(id)).toBe(true);

    // Every resolved area's wall-set ids are non-null / non-placeholder (a real header, not the DQK
    // native 0xff-carried-through-as-"resolved" edge case).
    for (const id of previouslyResidualNowResolved) {
      const area = result.resolved.find((a) => a.areaId === id)!;
      expect(area.wallSetIds.some((s) => s !== null)).toBe(true);
    }
  });
});

// --- golden: real CoK areas 66/97 — the two "missing WALLDEF block" residuals from commit c801066,
// now closed by the evidence-gated two-set fallback. Their LOAD_PIECES operands, (21,22,255) and
// (17,18,255), name a set-2 block (22 / 18) that exists on NO CoK disk; their resolved region
// siblings 67 and 99 name the IDENTICAL pairs but survive via their own two-set flag-SAVEs. The
// fallback must resolve 66/97 to byte-identical wall sets as those siblings (content dedup ⇒ the
// very same appended set ids). ---------------------------------------------------------------------

const haveCok6697 =
  ['ECL2.DAX', 'WALLDEF2.DAX', '8X8D2.DAX', 'ECL3.DAX', 'WALLDEF3.DAX', '8X8D3.DAX'].every((f) =>
    existsSync(resolve(cok, f)),
  ) && existsSync(resolve(dqk, 'DISK2', '8X8DC.TLB'));

describe.skipIf(!haveCok6697)('buildCokWallArtPort — golden CoK areas 66/97 (two-set fallback)', () => {
  it('resolves both former missing-WALLDEF residuals to the same deduped sets as their region siblings 67/99', async () => {
    const original = new Uint8Array(await readFile(resolve(dqk, 'DISK2', '8X8DC.TLB')));
    const disks: CokWallDiskSource[] = [];
    for (const diskNum of [2, 3]) {
      const ecl = await daxIndex(`ECL${diskNum}.DAX`, cok);
      const wd = await daxIndex(`WALLDEF${diskNum}.DAX`, cok);
      const tl = await daxIndex(`8X8D${diskNum}.DAX`, cok);
      const wanted = diskNum === 2 ? [66, 67] : [97, 99];
      disks.push({
        ecl: wanted.map((id) => ({ id, block: ecl.get(id)! })),
        walldefBlock: (id) => wd.get(id) ?? null,
        tileBlock: (id) => tl.get(id) ?? null,
      });
    }
    const result = buildCokWallArtPort(disks, original);

    expect(result.residual).toEqual([]);
    const byId = new Map(result.resolved.map((a) => [a.areaId, a]));
    for (const [fallbackId, siblingId, neverShippedBlock] of [
      [66, 67, 22],
      [97, 99, 18],
    ] as const) {
      const fb = byId.get(fallbackId)!;
      const sib = byId.get(siblingId)!;
      expect(fb).toBeDefined();
      expect(sib).toBeDefined();
      // The fallback area carries the provenance note naming the never-shipped block…
      expect(fb.note).toMatch(/two-set fallback/);
      expect(fb.note).toContain(`block ${neverShippedBlock}`);
      // …while the sibling resolved on the ordinary path (its own flag-SAVEs made it two-set).
      expect(sib.note).toBeUndefined();
      // Identical wall content ⇒ content-hash dedup assigns the SAME set ids to both areas.
      expect(fb.wallSetIds).toEqual(sib.wallSetIds);
      expect(Array.from(fb.header)).toEqual(Array.from(sib.header));
    }
  });
});

/** Sum of decoded image counts across every newly-appended set (order-independent check helper). */
function sumTileCounts(result: { newSets: { id: number; label: string }[] }): number {
  // label carries "(disk N, K tiles)" — pull K back out rather than re-decoding each leaf again.
  let total = 0;
  for (const s of result.newSets) {
    const m = /(\d+) tiles/.exec(s.label);
    if (m) total += Number(m[1]);
  }
  return total;
}
