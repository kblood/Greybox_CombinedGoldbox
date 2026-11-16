/**
 * CoK/DoK → DQK game-data assembly (E4.1) — the pipeline that turns a Gen1 (Champions / Death Knights)
 * game's content into the **DQK Gen2 container set** a Dark-Queen-engine build loads. This is the data
 * half of "build the DOS executable": it wires the E3 content ports (E3.1 GEO, E3.2 MON, E3.3 ECL) +
 * the E1 HLIB writer into one call that emits the three core libraries the engine reads —
 * `GEO.GLB` (dungeon maps), `MONCHA.GLB` (bestiary), `ECL.GLB` (scripts) — keyed in a **shared area-id
 * namespace** so a map, its script, and its monsters pair by id, exactly as DQK's own data does.
 *
 * The id used for every container is the source **DAX block id**: in the Gen1 games a dungeon's GEO map,
 * its ECL event script and (where present) its encounter records share the block id that identifies the
 * area, so carrying that id straight into the Gen2 id tables reproduces DQK's map↔script pairing. The
 * returned {@link DqkGameData.manifest} reports which areas ended up **playable** (have *both* a GEO map
 * and an ECL script).
 *
 * Verified end-to-end in `buildDqkGame.test.ts`: a real CoK `GEO1.DAX` + `MON1CHA.DAX` + `ECL1.DAX` build
 * to the three GLBs, and every emitted library re-decodes through the DQK loaders
 * (`decodeGen2GeoArchive` / `decodeMonchaGlb` / `decodeEclGlb`) into a coherent, id-consistent game.
 *
 * **Remaining for E4.2 (the executable itself):** assemble these libraries + the E2 Amiga→HLIB art TILEs
 * and the shared DQK audio into a game directory, point a (possibly string-patched) `DQK.EXE` at it, and
 * boot under DOSBox. That step needs the real engine binary + DOSBox and is tracked separately.
 */
import { readDaxDataBlocks } from './dax.js';
import type { DaxDataBlock } from './dax.js';
import { decodeGeoBlock, sniffGeoBlock } from './geo.js';
import { decodeMonsterRecord, sniffMonsterRecord } from './monster.js';
import { encodeGen2GeoArchive, DQK_GEO_PLACEHOLDER_SET_IDS } from './geoEncode.js';
import { encodeMonchaArchive } from './monchaEncode.js';
import { portGen1EclArchiveToGen2, planEntryStub, sniffGen1EclBlock, type EclArchivePortOptions } from './eclEncode.js';
import type { EclDialect } from '../ecl/disassemble.js';
import { mergeMonsterSideTables, mergeMonsterWizTables } from './monsterSideTables.js';
import type { MonsterSideEntry, MonsterWizEntry } from './monsterSideTables.js';
import { remapEclBlockAreaIds } from './eclAreaIdRemap.js';

/**
 * Options shared by {@link buildDqkGameData} and {@link buildDqkGameDataMulti} (round-12/13
 * id-collision mitigation — `docs/engine/research/cok-m4-fidelity-plan.md` §20/§21).
 */
export interface DqkGameBuildOptions {
  /**
   * Shift EVERY ported GEO/ECL area id by this constant before packing. CoK/DoK's own per-disk
   * id bands (16–36/48–68/80–99) are disjoint across CoK's OWN three disks but were never checked
   * against DQK's own native-occupied GEO/ECL id space — 3 of CoK's 15 ported GEO areas (34, 50, 66)
   * and 12 of its 23 ported ECL areas collide with a real, native DQK area (round 12, §20.1). This
   * option shifts the whole ported id space by a constant into a band with zero native overlap, and
   * rewrites every STATIC `NEWECL #areaId` cross-reference inside the ported ECL bytecode so in-game
   * area transitions keep resolving post-shift (see {@link remapEclBlockAreaIds}'s own doc for the
   * disclosed, corpus-checked scope limit — one dynamic/indirect NEWECL in the whole CoK corpus is
   * not covered). Monster slot ids are a separate namespace and are never shifted. `0` (the default)
   * is a strict no-op — output is byte-identical to omitting this option entirely.
   */
  idOffset?: number;
  /**
   * The source game's Gen1 ECL dialect, forwarded to the operand-frame transcoder
   * ({@link portGen1EclArchiveToGen2}'s `sourceDialect`): CoK = `ECL_GEN1` (the default),
   * DoK = `ECL_GEN1_SHORT`. Getting this wrong mis-frames SETUP_MONSTER (CoK 3-op vs DoK 4-op)
   * during the reachability walk and emits wrong trampolines — see eclEncode.ts's module note.
   */
  eclSourceDialect?: EclDialect;
}

/** DQK.EXE loads this ECL area id on a fresh "Begin Adventuring" (E6.1); CoK/DoK get a stub here. */
const DQK_NEWGAME_ECL_AREA = 1;

/** Raw Gen1 (CoK/DoK) source archives for one game. Each is the raw bytes of a `.DAX` container. */
export interface DqkGameInput {
  /** A `GEO{n}.DAX` archive (dungeon maps). */
  geo: Uint8Array;
  /** A `MON{n}CHA.DAX` archive (bestiary). */
  mon: Uint8Array;
  /** An `ECL{n}.DAX` archive (event/dialogue/combat scripts). */
  ecl: Uint8Array;
  /** Optional `MON{n}ITM.DAX` archive — monster carried-item side-table (Gap G2). */
  itm?: Uint8Array;
  /** Optional `MON{n}SPC.DAX` archive — monster special/affect side-table (Gap G2). */
  spc?: Uint8Array;
  /**
   * Optional `MON{n}WIZ.DAX` archive — monster memorized-spell side-table (DoK-only; CoK ships no such
   * file). Carried id-keyed on {@link DqkGameData.monsterWizTables} (audit gap 3, `cok-content-port-plan.md` §9).
   */
  wiz?: Uint8Array;
}

/**
 * The multi-disk source set for a complete CoK/DoK game (E4.1 / M3.1). Each array is the per-disk
 * `.DAX` archives **in disk order** (`GEO1.DAX`, `GEO2.DAX`, `GEO3.DAX`, …); the merge unions every
 * disk's blocks into the single shared area-id namespace the DQK engine reads.
 *
 * The three arrays are independent — a game with three GEO disks but only one `MON1CHA.DAX` (DoK) is
 * fine. A missing/unparseable archive contributes no blocks (never throws). See
 * {@link buildDqkGameDataMulti} for the merge semantics (disjoint GEO/ECL area ids vs. the
 * dedup-by-identity monster-slot merge).
 */
export interface DqkGameInputMulti {
  /** The `GEO{n}.DAX` archives in disk order (dungeon maps; disjoint area ids across disks). */
  geo: Uint8Array[];
  /** The `MON{n}CHA.DAX` archives in disk order (bestiary; per-disk slot ids that overlap — see merge). */
  mon: Uint8Array[];
  /** The `ECL{n}.DAX` archives in disk order (scripts; disjoint area ids across disks). */
  ecl: Uint8Array[];
  /** Optional `MON{n}ITM.DAX` archives in disk order — monster carried-item side-tables (Gap G2). */
  itm?: Uint8Array[];
  /** Optional `MON{n}SPC.DAX` archives in disk order — monster special/affect side-tables (Gap G2). */
  spc?: Uint8Array[];
  /**
   * Optional `MON{n}WIZ.DAX` archives in disk order — monster memorized-spell side-tables (DoK-only;
   * audit gap 3, `cok-content-port-plan.md` §9). Merged by monster id, last disk wins (same semantics
   * as `itm`/`spc`).
   */
  wiz?: Uint8Array[];
}

/** What the assembly reported about the rebuilt game. */
export interface DqkGameManifest {
  /** Area ids that produced a GEO map. */
  geoAreas: number[];
  /** Area ids that produced an ECL script. */
  eclAreas: number[];
  /** Number of monster records packed into `MONCHA.GLB`. */
  monsters: number;
  /** Areas with **both** a map and a script — the playable areas (sorted). */
  pairedAreas: number[];
  /**
   * The synthetic new-game entry stub injected into `ECL.GLB`, or null if none was needed. `DQK.EXE`
   * loads `EclBlockId = 1` on a fresh "Begin Adventuring" (E6.1), but CoK/DoK have no area-1 script, so a
   * stub at `areaId` forwards (`NEWECL`) to `forwardsTo` (the real overland entry). See
   * docs/engine/research/dqk-newgame-entry.md.
   */
  newGameEntry: { areaId: number; forwardsTo: number } | null;
  /**
   * The cross-disk merge audit (M3.2). Present whenever the build merged more than one source archive
   * per category (i.e. the multi-disk path); a single-archive build leaves it `null`. Reports how the
   * three source archives combined into the unified GLBs and which ids collided across disks.
   */
  merge: DqkMergeAudit | null;
  /**
   * Monster side-table coverage (Gap G2 + audit gap 3). Reports how many monsters carry an item table,
   * a special/affect table, and/or a memorized-spell (WIZ) table after merging `MON{n}ITM.DAX` /
   * `MON{n}SPC.DAX` / `MON{n}WIZ.DAX`. Zero across the board when no side-table archives were supplied
   * (e.g. the GEO/MON/ECL-only legacy build). The full per-monster tables are on
   * {@link DqkGameData.monsterSideTables} / {@link DqkGameData.monsterWizTables}.
   */
  sideTables: {
    withItems: number;
    withAffects: number;
    totalItems: number;
    totalAffects: number;
    /** Monsters with a memorized-spell (`MON{n}WIZ.DAX`) table — DoK casters only. */
    withSpells: number;
    /** Total memorized-spell slots across all WIZ tables. */
    totalSpells: number;
  };
  /**
   * Gen1 → Gen2 ECL operand-frame transcode summary (2026-07-23, cok-m4-fidelity-plan.md §25):
   * how many reachable frame-drifted sites were rewritten into GOTO trampolines
   * (`transcodeGen1EclBlockToGen2`) and which reachable drifted sites were honestly left
   * untranslated (no proven semantic mapping — e.g. long-dialect PARLAY 6→4).
   */
  eclTranscode: {
    /** Trampolined sites per opcode, e.g. `{ "12": 88, "33": 10 }` (keys are decimal opcodes). */
    patched: Record<number, number>;
    untranslated: { areaId: number; opcode: number; vaddr: number; reason: string }[];
  };
}

/**
 * What the multi-disk merge (M3.1/M3.2) found and did, for honest reporting. GEO and ECL ids are
 * **disjoint** across disks (CoK/DoK use a per-disk area-id band: 16–36 / 48–68 / 80–99), so they
 * union without remap and any same-id appearance across GEO/ECL disks is a hard error. Monster **slot
 * ids overlap** across disks (each `MON{n}CHA.DAX` numbers its bestiary from a shared table — id 1 =
 * BAAZ on every disk), but the colliding records are **byte-identical**, so monsters union with
 * dedup-by-identity. A same-id monster with *differing* bytes would be a real conflict and is reported.
 */
export interface DqkMergeAudit {
  /** Source archive count per category, e.g. `{ geo: 3, mon: 3, ecl: 3 }`. */
  sources: { geo: number; mon: number; ecl: number };
  /** GEO area ids contributed per disk (disk order), for the disjointness audit. */
  geoIdsPerDisk: number[][];
  /** ECL area ids contributed per disk (disk order). */
  eclIdsPerDisk: number[][];
  /** Monster slot ids contributed per disk (disk order). */
  monIdsPerDisk: number[][];
  /**
   * Monster slot ids that appeared on more than one disk with **byte-identical** records (the expected,
   * benign case — the disks share one bestiary). Deduped to a single member in `MONCHA.GLB`.
   */
  monDedupedIds: number[];
  /**
   * Monster slot ids that appeared on more than one disk with **conflicting** (non-identical) bytes.
   * Empty on real CoK/DoK data. The first occurrence wins and the conflict is logged here, never
   * silently dropped — a non-empty list means the area-scoped bestiary assumption broke and ECL
   * `LOAD_MONSTER` refs would need rewriting (out of M3.1 scope).
   */
  monConflictingIds: number[];
}

/** The emitted DQK Gen2 container set + a manifest. */
export interface DqkGameData {
  /** `GEO.GLB` — HLIB DATA library of Gen2 dungeon maps (id table + members). */
  geoGlb: Uint8Array;
  /** `MONCHA.GLB` — HLIB DATA library of Gen2 monster records. */
  monchaGlb: Uint8Array;
  /** `ECL.GLB` — HLIB DATA library of Gen2 ECL scripts. */
  eclGlb: Uint8Array;
  /**
   * Per-monster carried-item + special/affect side-tables (Gap G2), keyed by monster id, merged across
   * disks. Empty when no `MON{n}ITM.DAX` / `MON{n}SPC.DAX` archives were supplied. These are carried as
   * id-keyed structures (not folded into the DQK 108-byte MONCHA record, which has no item/affect
   * fields) — the faithful representation of the original engine's separate-file load. See
   * {@link ./monsterSideTables.js}.
   */
  monsterSideTables: MonsterSideEntry[];
  /**
   * Per-monster memorized-spell tables (`MON{n}WIZ.DAX`, DoK-only — audit gap 3,
   * `cok-content-port-plan.md` §9), keyed by monster id, merged across disks and sorted by id. Empty
   * when no WIZ archives were supplied (always empty for CoK, which ships no such file). Like the
   * ITM/SPC side-tables these are NOT folded into the DQK 108-byte `MONCHA.GLB` record (it has no
   * spell-list field — see `monchaEncode.ts`); the id-keyed carry is the faithful representation of
   * the original engine's separate-file load, and it is what the browser combat engine's
   * `applyPreparedSpellIds` join consumes.
   */
  monsterWizTables: { id: number; entry: MonsterWizEntry }[];
  manifest: DqkGameManifest;
}

/** Read a DAX archive's data blocks, tolerating an absent/unparseable source (→ no blocks). */
function safeDaxBlocks(bytes: Uint8Array): DaxDataBlock[] {
  try {
    return readDaxDataBlocks(bytes);
  } catch {
    return [];
  }
}

/** Decoded, id-keyed source entries for one game (after sniff + decode, before GLB packing). */
interface DecodedSources {
  geo: { id: number; geo: ReturnType<typeof decodeGeoBlock> }[];
  mon: { id: number; monster: ReturnType<typeof decodeMonsterRecord>; raw: Uint8Array }[];
  ecl: { id: number; block: Uint8Array }[];
}

/** Decode the GEO/MON/ECL blocks of a single source DAX archive (tolerant of an absent/bad archive). */
function decodeOneArchive(geo: Uint8Array, mon: Uint8Array, ecl: Uint8Array): DecodedSources {
  return {
    geo: safeDaxBlocks(geo)
      .filter((b) => sniffGeoBlock(b.raw))
      .map((b) => ({ id: b.blockId, geo: decodeGeoBlock(b.raw, `geo${b.blockId}`) })),
    mon: safeDaxBlocks(mon)
      .filter((b) => sniffMonsterRecord(b.raw))
      .map((b) => ({ id: b.blockId, monster: decodeMonsterRecord(b.raw, b.blockId), raw: b.raw })),
    ecl: safeDaxBlocks(ecl)
      .filter((b) => sniffGen1EclBlock(b.raw))
      .map((b) => ({ id: b.blockId, block: b.raw })),
  };
}

/**
 * The set of ported GEO+ECL area ids across one or more decoded archives — the domain a
 * {@link DqkGameBuildOptions.idOffset} remap shifts. Computed across ALL disks at once (not per-disk):
 * a `NEWECL` in a disk-1 script can legitimately target a disk-2/3 area (round-13 found real
 * cross-disk NEWECL references, e.g. CoK ECL1 block 16 → area 64 on disk 2), so scoping the ported-id
 * set to a single disk's own ids would miss remapping those and leave a stale, now-nonexistent
 * pre-shift id behind.
 */
function portedIdSet(archives: DecodedSources[]): Set<number> {
  const ids = new Set<number>();
  for (const src of archives) {
    for (const e of src.geo) ids.add(e.id);
    for (const e of src.ecl) ids.add(e.id);
  }
  return ids;
}

/**
 * Apply an id remap to one archive's decoded sources: shift every GEO/ECL id present in `remap`'s
 * domain (MON ids are a separate namespace and are always left untouched) and rewrite any matching
 * STATIC `NEWECL` cross-reference inside the ECL bytecode (see `eclAreaIdRemap.ts`). `remap` is null
 * for a strict no-op — returns `src` itself, unchanged (byte-for-byte back-compat when
 * {@link DqkGameBuildOptions.idOffset} is 0/omitted).
 */
function applyIdRemap(src: DecodedSources, remap: ((id: number) => number) | null): DecodedSources {
  if (!remap) return src;
  return {
    geo: src.geo.map((e) => ({ ...e, id: remap(e.id) })),
    mon: src.mon,
    ecl: src.ecl.map((e) => ({ id: remap(e.id), block: remapEclBlockAreaIds(e.block, remap) })),
  };
}

/** Build the `id -> id+offset` remap function for {@link DqkGameBuildOptions.idOffset}, or null for a no-op. */
function makeIdRemap(archives: DecodedSources[], idOffset: number | undefined): ((id: number) => number) | null {
  if (!idOffset) return null;
  const ported = portedIdSet(archives);
  return (id: number): number => (ported.has(id) ? id + idOffset : id);
}

/** Byte-equality of two Uint8Arrays (for the monster dedup-vs-conflict decision). */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Pack the decoded, merged sources into the three Gen2 GLBs. Shared by the single- and multi-archive
 * front-ends so both emit byte-identical libraries for the same id-keyed input. `merge` is carried
 * through to the manifest unchanged; `sideTables` (Gap G2) and `wizTables` (audit gap 3) are carried
 * verbatim and summarised.
 */
function assembleGlbs(
  src: DecodedSources,
  merge: DqkMergeAudit | null,
  sideTables: MonsterSideEntry[],
  wizTables: Map<number, MonsterWizEntry> = new Map(),
  eclSourceDialect?: EclDialect,
): DqkGameData {
  const eclIds = src.ecl.map((e) => e.id);
  const transcodePatched: Record<number, number> = {};
  const transcodeUntranslated: { areaId: number; opcode: number; vaddr: number; reason: string }[] = [];
  const entryOpts: EclArchivePortOptions = {
    entryAreaId: DQK_NEWGAME_ECL_AREA,
    sourceDialect: eclSourceDialect,
    onTranscode: (areaId, report) => {
      for (const p of report.patched) transcodePatched[p.opcode] = (transcodePatched[p.opcode] ?? 0) + 1;
      for (const u of report.untranslated) transcodeUntranslated.push({ areaId, ...u });
    },
  };

  // Gen2 GEO header bytes 2-7 are the area's resource-set ids (walls → 8x8d banks, backdrops →
  // BACK.TLB), NOT reserved: zeros name a set no shipped bank has, and DQK.EXE's dungeon loader then
  // spins in its wrong-disk retry loop ("DISK READ ERROR", black 3-D view) on area entry — the
  // cok-m4-fidelity blocker (cok-m4-fidelity-plan.md §8). Until the Gen1 wall-art port packs the
  // source game's own sets into the build's banks, stamp a native-DQK combo proven to load.
  const geoGlb = encodeGen2GeoArchive(
    src.geo.map((e) => ({ id: e.id, geo: e.geo, header: DQK_GEO_PLACEHOLDER_SET_IDS })),
  );
  const monchaGlb = encodeMonchaArchive(src.mon.map((e) => ({ id: e.id, monster: e.monster })));
  // Inject the area-1 new-game entry stub so DQK.EXE's fresh "Begin Adventuring" load resolves (E6.1).
  const eclGlb = portGen1EclArchiveToGen2(
    src.ecl.map((e) => ({ id: e.id, block: e.block })),
    entryOpts,
  );

  const geoAreas = src.geo.map((e) => e.id);
  const eclSet = new Set(eclIds);
  const pairedAreas = geoAreas.filter((id) => eclSet.has(id)).sort((a, b) => a - b);
  const newGameEntry = planEntryStub(eclIds, entryOpts);

  const monsterWizTables = [...wizTables.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, entry]) => ({ id, entry }));

  const sideSummary = {
    withItems: sideTables.filter((s) => s.items.length > 0).length,
    withAffects: sideTables.filter((s) => s.affects.length > 0).length,
    totalItems: sideTables.reduce((n, s) => n + s.items.length, 0),
    totalAffects: sideTables.reduce((n, s) => n + s.affects.length, 0),
    withSpells: monsterWizTables.filter((w) => w.entry.spells.length > 0).length,
    totalSpells: monsterWizTables.reduce((n, w) => n + w.entry.spells.length, 0),
  };

  return {
    geoGlb,
    monchaGlb,
    eclGlb,
    monsterSideTables: sideTables,
    monsterWizTables,
    manifest: {
      geoAreas,
      eclAreas: eclIds,
      monsters: src.mon.length,
      pairedAreas,
      newGameEntry,
      merge,
      sideTables: sideSummary,
      eclTranscode: { patched: transcodePatched, untranslated: transcodeUntranslated },
    },
  };
}

/**
 * Assemble a Gen1 game's GEO/MON/ECL content into the DQK Gen2 container set from a **single** source
 * DAX trio. Decodes each archive, ports every block through the matching E3 encoder, and packs the
 * three GLBs in the shared area-id namespace. Areas that have both a map and a script are reported as
 * `pairedAreas`. For a complete (multi-disk) game, use {@link buildDqkGameDataMulti}; this single-trio
 * API is kept verbatim for back-compat (`manifest.merge` is `null`).
 */
export function buildDqkGameData(input: DqkGameInput, opts: DqkGameBuildOptions = {}): DqkGameData {
  const sideTables = mergeMonsterSideTables(
    input.itm ? [input.itm] : [],
    input.spc ? [input.spc] : [],
  );
  const wizTables = mergeMonsterWizTables(input.wiz ? [input.wiz] : []);
  const one = decodeOneArchive(input.geo, input.mon, input.ecl);
  const decoded = applyIdRemap(one, makeIdRemap([one], opts.idOffset));
  return assembleGlbs(decoded, null, sideTables, wizTables, opts.eclSourceDialect);
}

/**
 * Assemble a **complete** CoK/DoK game from its multi-disk source set (E4.1 / M3.1) — merge the
 * per-disk `GEO{1..3}.DAX` / `ECL{1..3}.DAX` / `MON{1..3}CHA.DAX` block sets into one unified
 * `GEO.GLB` / `ECL.GLB` / `MONCHA.GLB`, then pack exactly as {@link buildDqkGameData} does.
 *
 * **Merge keying (verified against real CoK & DoK bytes — see `manifest.merge`):**
 *  - **GEO + ECL — straight union, no remap.** Each game numbers its areas in a per-disk band
 *    (disk 1 = 16–36, disk 2 = 48–68, disk 3 = 80–99), so the area ids are **globally disjoint** across
 *    disks. The source block id *is* the global area id; carrying it straight through reproduces DQK's
 *    map↔script pairing. A genuine same-area-id appearance on two GEO (or two ECL) disks would mean two
 *    different maps claim one area — unrecoverable without a remap — so it **throws** rather than
 *    silently dropping (it does not occur on real data).
 *  - **MON — union with dedup-by-identity.** Unlike areas, each `MON{n}CHA.DAX` numbers its bestiary
 *    from a **shared, overlapping** slot table (id 1 = BAAZ on every disk; ECL `LOAD_MONSTER` refs this
 *    disk-local slot id). The colliding records are **byte-identical** across disks, so the same slot id
 *    collapses to one `MONCHA.GLB` member — faithful, and it leaves every ECL `LOAD_MONSTER` operand
 *    resolving to the same monster it always did (no operand rewrite, so the ECL-identity gate holds).
 *    A same-slot-id monster with *differing* bytes would break that assumption; the first occurrence
 *    wins and the conflict is recorded in `manifest.merge.monConflictingIds` (never silently dropped).
 *
 * The new-game area-1 entry stub is injected exactly once (it is keyed off the merged ECL id set, and
 * area 1 is below every disk's band, so it is added once for the whole game).
 */
export function buildDqkGameDataMulti(input: DqkGameInputMulti, opts: DqkGameBuildOptions = {}): DqkGameData {
  const perDisk = maxLen(input.geo, input.mon, input.ecl);
  const rawDecoded: DecodedSources[] = [];
  for (let d = 0; d < perDisk; d++) {
    rawDecoded.push(decodeOneArchive(input.geo[d] ?? EMPTY, input.mon[d] ?? EMPTY, input.ecl[d] ?? EMPTY));
  }
  // The remap domain is computed across ALL disks at once, BEFORE shifting any of them, so a
  // cross-disk NEWECL (disk 1's script targeting a disk 2/3 area) resolves against the same global
  // ported-id set every disk's own remap uses — see portedIdSet's own doc.
  const idRemap = makeIdRemap(rawDecoded, opts.idOffset);
  const decoded = rawDecoded.map((one) => applyIdRemap(one, idRemap));

  // GEO + ECL: disjoint-id union (throws on a real area-id collision across disks).
  const geo = unionDisjoint(decoded.map((s) => s.geo), 'GEO');
  const ecl = unionDisjoint(decoded.map((s) => s.ecl), 'ECL');

  // MON: union with dedup-by-identity; record benign dedups and any real byte conflicts.
  const monDedupedIds: number[] = [];
  const monConflictingIds: number[] = [];
  const monById = new Map<number, DecodedSources['mon'][number]>();
  for (const disk of decoded) {
    for (const e of disk.mon) {
      const prev = monById.get(e.id);
      if (!prev) {
        monById.set(e.id, e);
      } else if (bytesEqual(prev.raw, e.raw)) {
        if (!monDedupedIds.includes(e.id)) monDedupedIds.push(e.id);
      } else if (!monConflictingIds.includes(e.id)) {
        monConflictingIds.push(e.id); // first occurrence kept; conflict surfaced, not dropped
      }
    }
  }
  const mon = [...monById.values()].sort((a, b) => a.id - b.id);

  const merge: DqkMergeAudit = {
    sources: { geo: input.geo.length, mon: input.mon.length, ecl: input.ecl.length },
    geoIdsPerDisk: decoded.map((s) => s.geo.map((e) => e.id)),
    eclIdsPerDisk: decoded.map((s) => s.ecl.map((e) => e.id)),
    monIdsPerDisk: decoded.map((s) => s.mon.map((e) => e.id)),
    monDedupedIds: monDedupedIds.sort((a, b) => a - b),
    monConflictingIds: monConflictingIds.sort((a, b) => a - b),
  };

  // Monster side-tables (Gap G2 + audit gap 3): merge MON{n}ITM / MON{n}SPC / MON{n}WIZ across disks
  // by monster id.
  const sideTables = mergeMonsterSideTables(input.itm ?? [], input.spc ?? []);
  const wizTables = mergeMonsterWizTables(input.wiz ?? []);

  return assembleGlbs({ geo, mon, ecl }, merge, sideTables, wizTables, opts.eclSourceDialect);
}

/** A shared empty archive for absent per-disk slots (decodes to no blocks). */
const EMPTY = new Uint8Array(0);

/** Longest of the three per-disk arrays (the number of disks to walk). */
function maxLen(...arrs: unknown[][]): number {
  return arrs.reduce((m, a) => Math.max(m, a.length), 0);
}

/**
 * Union id-keyed entries across disks under the **disjoint** assumption: the same id must not appear on
 * two disks. Throws with a precise message on a real collision (it does not occur on CoK/DoK GEO/ECL —
 * the per-disk area bands don't overlap). Preserves disk-then-source order.
 */
function unionDisjoint<T extends { id: number }>(perDisk: T[][], label: string): T[] {
  const seen = new Map<number, number>(); // id -> disk index that first contributed it
  const out: T[] = [];
  for (let d = 0; d < perDisk.length; d++) {
    for (const e of perDisk[d]) {
      const prev = seen.get(e.id);
      if (prev !== undefined) {
        throw new Error(
          `${label} merge: area id ${e.id} appears on both disk ${prev + 1} and disk ${d + 1}; ` +
            `${label} ids are expected to be globally disjoint across disks (per-disk area bands). ` +
            `A genuine collision needs an explicit remap — refusing to silently drop one.`,
        );
      }
      seen.set(e.id, d);
      out.push(e);
    }
  }
  return out;
}
