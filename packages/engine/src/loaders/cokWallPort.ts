/**
 * CoK/DoK wall-art port (M4 follow-up — cok-m4-fidelity-plan.md §8's "faithful CoK wall art"
 * residual; generalized to DoK 2026-07-19 for the `dok-dqk-release` packaging round — see
 * `docs/engine/HANDOFF.md`'s "DoK wall art" entry for what changed and what stays unverified).
 *
 * `buildDqkGame.ts` currently stamps {@link DQK_GEO_PLACEHOLDER_SET_IDS} — one fixed NATIVE DQK wall
 * combo — on every ported CoK/DoK area, because the Gen2 GEO header bytes 2-7 name resource-set ids
 * the DQK dungeon loader looks up in the `8x8d%c` TLB set-id tables (see `geoEncode.ts`'s doc
 * comment), and an unresolved id sends the loader into its wrong-disk retry loop ("DISK READ
 * ERROR"). That placeholder loads, but shows DQK's own wall art in every ported CoK dungeon.
 *
 * This module packs the source game's OWN wall art instead, per area, wherever it can be PROVEN:
 *
 * 1. **Resolve.** Run an area's own ECL block through the pure `EclVm` from a fresh entry (the
 *    normal "walk into this dungeon" path — dungeon-init blocks emit LOAD_PIECES before exiting or
 *    chaining, per `dungeon.ts`'s own docstring, and this is verified against real CoK bytes in
 *    `dungeon.test.ts`'s ECL1 block 34 golden). Decoded under the caller's `dialect` (default
 *    `ECL_GEN1`, CoK's own dialect) — **DoK requires `ECL_GEN1_SHORT`** (`buildDqkGame.ts`'s target
 *    picks it the same way `apps/web/src/ui/gameData.ts`'s `dok` profile does, via
 *    `eclDialect: 'gen1-short'`): decoding DoK's own short 0x1D/0x22/0x2C operand frames under the
 *    long (CoK) dialect desyncs the instruction stream, per
 *    `docs/engine/research/dok-natural-route.md`'s dialect-split findings — a wrong dialect here
 *    would silently corrupt `resolveAreaPieces`'s LOAD_PIECES resolution rather than throw (the VM
 *    happily decodes garbage opcodes as *something*), so this is a correctness-critical, not
 *    cosmetic, parameter. If the run emits no `loadPieces` effect, the area's own script never names
 *    a wall combo when entered fresh (COMMONLY because the combo is set by a PREDECESSOR area's
 *    script and only *resumed* by this one, or because this area isn't a first-person view at all)
 *    — that area is reported `residual` and keeps the DQK-native placeholder, honestly.
 * 2. **Load.** Feed the resolved `setBlockIds` (WALLDEF block ids) through the SAME
 *    `loadDungeonWalls` the browser engine's own first-person renderer uses, against the matching
 *    disk's real `WALLDEF{n}.DAX`/`8X8D{n}.DAX` archives, to get the actual decoded EGA tile pools
 *    for wallsets 1..3 (0xFF/Reset resolves to `null`, matching the SAME "no set" convention as the
 *    DQK header's own `0xff` sentinel — no translation needed there). One documented, evidence-gated
 *    exception: when the load fails ONLY because the named set-2 WALLDEF block was never shipped on
 *    any disk, the two-set mapping `[var3, Reset, var1]` is retried — the region-persistent two-set
 *    flags (0x4be7/0x4be8) default to 0 in a fresh VM run, but the shipped data proves the two-set
 *    path is the only one such an area can ever have taken (closes CoK areas 66/97; full grounding
 *    in the fallback's own inline comment inside {@link buildCokWallArtPort}).
 * 3. **Convert.** Each non-null tile pool becomes one DQK HLIB leaf `TILE` (method 21 — matches
 *    `8X8DB.TLB`'s real draw method, `docs/hlib-format.md` §5), palette-relocated EGA→VGA: index 13
 *    (EGA magenta, CoK's own wall-tile transparent key) maps to the HLIB transparent key 255,
 *    every other EGA index i maps to `WALL_PALETTE_BASE + i` (the "walls" DAC window, `UAPALETT.TXT`
 *    / `docs/hlib-format.md` §2 — a lossless EGA→VGA widen, no information lost). Identical tile
 *    pools (the common case — many areas within one region share one WALLDEF/8X8D pair) are
 *    deduped by content, so each distinct pool gets exactly one new set id.
 * 4. **Assign + stamp.** New set ids start at {@link COK_WALL_SET_ID_BASE} (18) — clear of every id
 *    this repo has directly observed in `8X8DC.TLB` (10-17; `8X8DB.TLB`'s own 1-9 is a DIFFERENT,
 *    irrelevant range now — see the bank-routing note below) — and are packed as NEW sets appended
 *    to `8X8DC.TLB` via {@link appendHlibMasterSets}. Header bytes 2-4 (the three wall-set slots) are
 *    stamped with the assigned ids (or `0xff` for a Reset/empty wallset); bytes 5-7 (backdrops) are
 *    left on the existing DQK-native placeholder — CoK's Gen1 first-person view has no analogous
 *    "backdrop texture" layer to source from, so there is no evidence-based mapping to make (an
 *    honest `no-amiga-source`-style residual, not a guess).
 *
 * **Bank routing — SOLVED (2026-07-19), corrects two earlier wrong theories.** `DQK.EXE`'s
 * `8x8d%c%d`-format wall-bank filename does not search a shared id space across `8X8DB.TLB`/
 * `8X8DC.TLB`, and it is NOT `bank = 'b' + floor(id / 100)` either (that theory was proposed, coded
 * as `COK_WALL_SET_ID_BASE = 20`, and then DIRECTLY REFUTED by a same-day re-trace: id 21 reproduced
 * the identical infinite retry loop as id 101, byte-for-byte). The real rule, confirmed by static
 * Unicorn tracing both this game's own build AND `cok-dqk-release` (CoK's real wall-art build, ids
 * 100-121) side by side, plus a controlled fix-and-retest: **`DQK.EXE` picks the bank letter purely
 * from a fixed threshold on the id value — `id <= 9` opens `8X8DB.TLB`, any `id > 9` opens
 * `8X8DC.TLB`, full stop.** It never even attempts to open `8X8DB.TLB` for an id above 9, regardless
 * of which physical file `appendHlibMasterSets` actually wrote that id into. Both this module's
 * original `BASE = 100` AND the once-tried `BASE = 20` appended new sets to `8X8DB.TLB` — the WRONG
 * file for any id > 9 — so every appended id, at any base above 9, sent `DQK.EXE` into its
 * "wrong-disk retry loop" (hundreds of `8x8dc.tlb`/`A:\8x8dc.tlb` reopens, on screen: "DISK READ
 * ERROR"). This reproduced identically in CoK's own already-shipped `cok-dqk-release` build (ids
 * 100-121) — its README's "wall art... verified both statically and live" claim was WRONG: the only
 * live-verified build was the DQK-placeholder-only `cok-on-dqk-m4fidelity`, never a real-wall-art
 * build; commit `c801066`'s own message honestly flagged the live check as skipped, not as passing.
 * **The fix, proven working** (static trace: three clean `8x8dc.tlb` opens + a clean `back.tlb`
 * open, zero retry, matching the known-good signature): append new sets to `8X8DC.TLB` instead, with
 * every assigned id kept `> 9` (so the threshold still picks `8X8DC.TLB`, the file they are actually
 * in) and clear of `8X8DC.TLB`'s native 10-17. Full evidence trail: `docs/engine/HANDOFF.md`'s "DoK
 * wall-set-id bank routing — real root cause: id<=9 threshold, not a >=100 split" entry.
 */
import type { IndexedImage, Palette, RGB, TileSet } from '../model/index.js';
import { EclVm, type EclEffect } from '../ecl/vm.js';
import { ECL_GEN1, type EclDialect } from '../ecl/disassemble.js';
import { loadDungeonWalls, WALLDEF_RESET, WALLDEF_DEFAULT_SET1, type DungeonWalls } from '../world/dungeonWalls.js';
import { TILE8X8_TRANSPARENT } from './tiles8x8.js';
import { EGA16 } from '../render/palette.js';
import { encodeHlibTile, appendHlibMasterSets } from './hlibEncode.js';
import { decodeHlib } from './hlib.js';
import { encodeHlibDataLibrary } from './hlibEncode.js';
import { DQK_GEO_PLACEHOLDER_SET_IDS } from './geoEncode.js';

/** First new CoK/DoK wall-set id. Must be `> 9` (DQK.EXE's `8x8d%c` bank-letter selector is a
 * hardcoded `id <= 9 ? 'b' : 'c'` threshold — see this file's header comment, "Bank routing —
 * SOLVED", for the evidence trail) AND clear of `8X8DC.TLB`'s native ids 10-17, since new sets are
 * appended to `8X8DC.TLB` (via {@link appendHlibMasterSets}), the file this threshold actually
 * routes any id > 9 to. Do not lower this to <= 17 (collides with native sets) or use any id <= 9
 * (routes to `8X8DB.TLB`, where the new sets are NOT — reproduces the "DISK READ ERROR" bug). */
export const COK_WALL_SET_ID_BASE = 18;

/** DQK's "walls" DAC window starts at palette index 32 (`UAPALETT.TXT`; matches `DQK_ART_LAYOUT`'s
 * `8X8DB.TLB`/`8X8DC.TLB` `paletteBase: 32`). EGA index i (0..15) relocates to `base + i`. */
export const WALL_PALETTE_BASE = 32;

/** HLIB transparent key (methods 17/21/23) — always 255, independent of palette base. */
const HLIB_TRANSPARENT = 255;

/** One disk's CoK wall-art sources: its own area ECL blocks + its own WALLDEF/8X8D DAX archives
 * (CoK ships per-disk `WALLDEF{n}.DAX`/`8X8D{n}.DAX`, addressed by small per-disk block ids that are
 * NOT globally unique across disks — mirrors the per-disk area-band convention `buildDqkGame.ts`
 * documents for GEO/ECL/MON). */
export interface CokWallDiskSource {
  /** This disk's decoded ECL area blocks (area id = the shared GEO/ECL/MON namespace). */
  ecl: { id: number; block: Uint8Array }[];
  /** Decompressed `WALLDEF{disk}.DAX` block by id, or null if absent. */
  walldefBlock(blockId: number): Uint8Array | null;
  /** Decompressed `8X8D{disk}.DAX` block by id, or null if absent. */
  tileBlock(blockId: number): Uint8Array | null;
}

/** One area whose own ECL script proved a real wall-set combo (LOAD_PIECES resolved + the named
 * WALLDEF/8X8D blocks all loaded). */
export interface CokWallResolvedArea {
  areaId: number;
  /** The 6-byte Gen2 GEO header sextet to stamp (wall ids or 0xff, then the placeholder backdrop). */
  header: Uint8Array;
  /** Assigned set id per wallset 1..3, or null where that wallset is Reset/empty (header byte 0xff). */
  wallSetIds: [number | null, number | null, number | null];
  /** Present when the resolution took a documented non-default path (e.g. the evidence-gated
   * two-set fallback for a never-shipped set-2 WALLDEF block — see `buildCokWallArtPort`). */
  note?: string;
}

/** One area that could NOT be resolved — stays on the DQK-native placeholder, honestly reported. */
export interface CokWallResidualArea {
  areaId: number;
  reason: string;
}

export interface CokWallPortResult {
  /** `8X8DC.TLB` with the new CoK wall sets appended (undefined when nothing was resolved). See
   * this module's header comment ("Bank routing — SOLVED") for why `8X8DC.TLB`, not `8X8DB.TLB`. */
  wallBankTlb: Uint8Array | undefined;
  /** Newly assigned set ids, in append order, with a short provenance label. */
  newSets: { id: number; label: string }[];
  /** Areas with a real, provable per-area wall-set header. */
  resolved: CokWallResolvedArea[];
  /** Areas that keep the DQK-native placeholder, with the honest reason why. */
  residual: CokWallResidualArea[];
}

/** Run one area's own ECL block from a fresh entry and extract its LOAD_PIECES resolution, if any.
 * Never throws — a malformed/incompatible block is reported as an `undefined` resolution (caller
 * treats it as residual), matching this module's "prove it or leave it" contract. */
function resolveAreaPieces(
  block: Uint8Array,
  dialect: EclDialect,
): { setBlockIds: [number, number, number]; twoSet: boolean } | undefined {
  try {
    const vm = new EclVm(block, { dialect });
    const result = vm.run();
    const eff = result.effects.find(
      (e): e is Extract<EclEffect, { type: 'loadPieces' }> => e.type === 'loadPieces',
    );
    return eff ? { setBlockIds: eff.setBlockIds, twoSet: eff.twoSet } : undefined;
  } catch {
    return undefined;
  }
}

/** Build a VGA `Palette` for the EGA-16 wall art, relocated to `base` (docs/hlib-format.md §2). */
function egaWallPalette(base: number): Palette {
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < EGA16.length; i++) colors[base + i] = { ...EGA16[i] };
  return { colors, source: 'hlib-range', firstColor: base, count: EGA16.length };
}

/** Relocate one decoded EGA tile's indices to the VGA wall palette window, keying EGA magenta (the
 * CoK wall-tile transparent convention, `TILE8X8_TRANSPARENT`) to the HLIB 255 transparent index. */
function egaTileToVga(image: IndexedImage, base: number): { width: number; height: number; indices: Uint8Array } {
  const out = new Uint8Array(image.indices.length);
  for (let i = 0; i < image.indices.length; i++) {
    const v = image.indices[i];
    out[i] = v === TILE8X8_TRANSPARENT ? HLIB_TRANSPARENT : base + v;
  }
  return { width: image.width, height: image.height, indices: out };
}

/** Encode one decoded CoK wall tile pool as a DQK HLIB leaf `TILE` (method 21, matching
 * `8X8DB.TLB`'s real draw method). */
function encodeCokWallSet(tiles: TileSet): Uint8Array {
  const images = tiles.tiles.map((t) => egaTileToVga(t, WALL_PALETTE_BASE));
  return encodeHlibTile(images, egaWallPalette(WALL_PALETTE_BASE), { method: 21 });
}

/** Cheap, exact content key for dedup (small tile-pool leaves — a handful of KB at most). */
function contentKey(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** One disk's raw block-id -> bytes map for {@link buildCrossDiskBlockSource} (a WALLDEF{k}.DAX or
 * 8X8D{k}.DAX archive, already DAX-decompressed and indexed by block id). */
export interface CrossDiskBlockSourceDisk {
  diskNum: number;
  blocks: Map<number, Uint8Array>;
}

/** A block-id resolver spanning every disk's own archive, with an explicit, evidence-checked
 * cross-disk fallback. */
export interface CrossDiskBlockSource {
  /** Resolve `id`, preferring `preferredDisk`'s own archive; falls back to any OTHER disk holding
   * the same id only when every disk that has it agrees byte-for-byte. Returns null if the id is
   * absent everywhere, or present on 2+ disks with DIFFERING content under a non-preferred disk
   * (a genuinely ambiguous cross-disk reuse — see {@link ambiguousIds}). */
  lookup(preferredDisk: number, id: number): Uint8Array | null;
  /** Ids that appear on 2+ disks with DIFFERENT bytes — never cross-disk-resolved, only ever
   * returned by {@link lookup} when `preferredDisk` itself is one of the disagreeing disks. */
  ambiguousIds: number[];
}

/**
 * Build a block-id index across every disk's own WALLDEF{k}.DAX/8X8D{k}.DAX-style archive, so a
 * caller isn't limited to "an area's ECL/GEO disk number names its ONLY valid wall-tile source
 * disk" — a real assumption for CoK (3 WALLDEF/3 8X8D disks, one per ECL/GEO/MON disk) but a FALSE
 * one for DoK, which ships 5 WALLDEF/8X8D disks against only 3 ECL/GEO/MON disks: DoK's own
 * WALLDEF/8X8D block-id space is split across disks by an axis this project has not identified
 * (not the ECL/GEO disk number), so an area's LOAD_PIECES block id can legitimately live on a
 * WALLDEF/8X8D disk numbered differently from the area's own ECL disk (see
 * `docs/engine/research/dok-wall-art-cross-disk.md`).
 *
 * Cross-disk fallback is only ever taken when it is PROVABLY safe: real inspection of this repo's
 * own CoK data shows block ids ARE intentionally reused across CoK's 3 WALLDEF/8X8D disks with
 * DIFFERENT content (e.g. `WALLDEF1.DAX` id 23 is a different wall-tile pool than `WALLDEF3.DAX`
 * id 23) — so a blind "search every disk" merge would silently substitute the WRONG wall art for
 * CoK. This function protects against that: an id is only resolved from a non-preferred disk when
 * ALL disks holding that id agree on its bytes exactly (verified DoK-wide: zero WALLDEF/8X8D id
 * collisions across its 5 disks). A disagreeing id is reported via `ambiguousIds` and never
 * silently guessed.
 */
export function buildCrossDiskBlockSource(perDisk: CrossDiskBlockSourceDisk[]): CrossDiskBlockSource {
  const byId = new Map<number, { diskNum: number; bytes: Uint8Array }[]>();
  for (const { diskNum, blocks } of perDisk) {
    for (const [id, bytes] of blocks) {
      let entries = byId.get(id);
      if (!entries) {
        entries = [];
        byId.set(id, entries);
      }
      entries.push({ diskNum, bytes });
    }
  }
  const ambiguousIds: number[] = [];
  const ambiguous = new Set<number>();
  for (const [id, entries] of byId) {
    if (entries.length < 2) continue;
    const first = entries[0].bytes;
    if (!entries.every((e) => bytesEqual(e.bytes, first))) {
      ambiguousIds.push(id);
      ambiguous.add(id);
    }
  }
  const lookup = (preferredDisk: number, id: number): Uint8Array | null => {
    const entries = byId.get(id);
    if (!entries || entries.length === 0) return null;
    const own = entries.find((e) => e.diskNum === preferredDisk);
    if (own) return own.bytes; // own-disk hit always wins — zero change to already-correct behavior
    if (ambiguous.has(id)) return null; // disagreeing content elsewhere — never guess
    return entries[0].bytes; // present on exactly one OTHER disk (or several that all agree) — safe
  };
  return { lookup, ambiguousIds: ambiguousIds.sort((a, b) => a - b) };
}

/**
 * Build the CoK/DoK wall-art port: resolve every area's own LOAD_PIECES, load + convert the wall
 * tile pools it proves, dedupe them into new `8X8DC.TLB` sets (see this module's header comment,
 * "Bank routing — SOLVED", for why `8X8DC.TLB` and not `8X8DB.TLB`), and stamp per-area GEO headers.
 * Never throws — every failure mode (no LOAD_PIECES, a missing WALLDEF/8X8D block) is captured in
 * `residual` instead.
 *
 * **DoK's single-bank case.** `loadDungeonWalls` packs DoK's shared 256-tile 8X8D bank into
 * `walls.tileSets[1..3]` — all THREE slots point at the SAME `TileSet` object (see
 * `dungeonWalls.ts`'s own doc comment). This function does not special-case that: it runs the
 * exact same per-slot `encodeCokWallSet(walls.tileSets[s])` CoK's per-set catalogs already use,
 * which for DoK naturally encodes the whole bank three times and lets the existing content-hash
 * dedup (`byContent`) collapse the three identical leaves into ONE new set id shared by all three
 * header bytes — the smallest generalization of the proven CoK path, not a new bespoke scheme.
 * This mirrors how the browser engine's own `dungeonWallGraphicSet.ts` addresses a DoK single-bank
 * (by the GLOBAL relocated id, not a per-set-local slice) rather than inventing a different,
 * unevidenced per-set slicing scheme. **Caveat:** whether the real `DQK.EXE` binary's own
 * wall-set-id→tile lookup for a *ported* area actually expects this "whole shared bank, one id
 * reused three times" shape is UNVERIFIED — exactly the same class of open, undischarged risk
 * CoK's own already-shipped wall art carries (see this file's header comment and
 * `docs/engine/HANDOFF.md`'s wall-art entries); this port has only ever been checked
 * structurally (byte/shape sanity, `tools/cok_m4_static_verify.mts`-style checks), never via a
 * DOSBox-X visual render of the packaged build.
 */
export function buildCokWallArtPort(
  disks: CokWallDiskSource[],
  wallBankOriginal: Uint8Array,
  opts: { baseSetId?: number; dialect?: EclDialect } = {},
): CokWallPortResult {
  const backdropPlaceholder = DQK_GEO_PLACEHOLDER_SET_IDS.subarray(3, 6);
  const resolved: CokWallResolvedArea[] = [];
  const residual: CokWallResidualArea[] = [];
  const newSets: { id: number; leaf: Uint8Array; label: string }[] = [];
  const byContent = new Map<string, number>();
  let nextId = opts.baseSetId ?? COK_WALL_SET_ID_BASE;
  const dialect = opts.dialect ?? ECL_GEN1;

  disks.forEach((disk, diskIndex) => {
    for (const { id: areaId, block } of disk.ecl) {
      const pieces = resolveAreaPieces(block, dialect);
      if (!pieces) {
        residual.push({
          areaId,
          reason:
            'own ECL script emits no LOAD_PIECES from a fresh run (the wall combo is set by a ' +
            'predecessor/region-entry script, or this area is not a first-person dungeon view)',
        });
        continue;
      }

      let walls: DungeonWalls;
      let note: string | undefined;
      try {
        walls = loadDungeonWalls(pieces.setBlockIds, {
          walldefBlock: disk.walldefBlock,
          tileBlock: disk.tileBlock,
        });
      } catch (err) {
        // Evidence-gated TWO-SET FALLBACK (closes CoK areas 66/97 — commit c801066's "2 reference a
        // missing WALLDEF block" residuals). The two-set flags 0x4be7/0x4be8 (COAB `field_1CE`/
        // `field_1D0`, `docs/engine/research/firstperson-wall-walk-cok.md` §3.3) are REGION-PERSISTENT
        // game-data bytes, not per-block state: a fresh VM run defaults them to 0 (three-set path),
        // but a block that never writes them actually inherits whatever the region's other blocks set.
        // When the three-set read is IMPOSSIBLE against the game's own shipped data — the named set-2
        // WALLDEF block does not exist in the caller's (cross-disk) lookup — the only path the shipped
        // game can ever have taken through this LOAD_PIECES is the two-set one (set 2 skipped), so we
        // retry with the two-set mapping `[var3, Reset, var1]`. Grounding, from CoK's own data: every
        // two-set sibling block pairs (id, id+1) operands whose "+1" set-2 block was NEVER shipped on
        // ANY disk — 57/64 name (19,20), 67 names (21,22), 96 names (15,16), 99 names (17,18); blocks
        // 20/22/16/18 exist nowhere, and all those siblings survive only because their own flag-SAVEs
        // make the engine skip set 2. Areas 66/97 name the IDENTICAL pairs as their resolved siblings
        // 67/99 (region entry set the flags = 1 before them), and COAB's decompile documents the same
        // shape for ECL1 block 34 (set-2 operand 4, also never shipped, also skipped). The fallback
        // NEVER fires when the named set-2 block actually exists — a real three-set load failure for
        // any other reason still lands in `residual`, honestly.
        const [s1, s2, s3] = pieces.setBlockIds;
        const canFallback =
          !pieces.twoSet &&
          s1 !== WALLDEF_DEFAULT_SET1 &&
          s2 !== WALLDEF_RESET &&
          disk.walldefBlock(s2) === null;
        if (!canFallback) {
          residual.push({ areaId, reason: `loadDungeonWalls failed: ${(err as Error).message}` });
          continue;
        }
        try {
          walls = loadDungeonWalls([s1, WALLDEF_RESET, s3], {
            walldefBlock: disk.walldefBlock,
            tileBlock: disk.tileBlock,
          });
          note =
            `two-set fallback: set-2 WALLDEF block ${s2} was never shipped on any disk, so the ` +
            `shipped game can only ever have run this LOAD_PIECES on the two-set path (flags ` +
            `0x4be7/0x4be8 inherited =1 from the region's entry blocks); resolved as [${s1}, skip, ` +
            `${s3 === WALLDEF_RESET ? 'Reset' : s3}]`;
        } catch (err2) {
          residual.push({
            areaId,
            reason:
              `loadDungeonWalls failed: ${(err as Error).message}; two-set fallback ` +
              `(set-2 block ${s2} never shipped) also failed: ${(err2 as Error).message}`,
          });
          continue;
        }
      }

      // All three wallsets landing 0xFF/Reset (e.g. a var_3===0x7F "blank set" area) is still a REAL
      // resolution, not a failure — an all-0xff wall header is honest, faithfully-empty output, so it
      // is stamped like any other resolved area (never falls through to `residual`).
      const wallSetIds: [number | null, number | null, number | null] = [null, null, null];
      for (let s = 1; s <= 3; s++) {
        const ts = walls.tileSets[s];
        if (!ts || ts.tiles.length === 0) continue; // Reset/empty -> stays 0xff
        const leaf = encodeCokWallSet(ts);
        const key = contentKey(leaf);
        let id = byContent.get(key);
        if (id === undefined) {
          id = nextId++;
          byContent.set(key, id);
          newSets.push({
            id,
            leaf,
            label: `area ${areaId} wallset ${s} (disk ${diskIndex + 1}, ${ts.tiles.length} tiles)`,
          });
        }
        wallSetIds[s - 1] = id;
      }
      const header = new Uint8Array(6);
      header[0] = wallSetIds[0] ?? WALLDEF_RESET;
      header[1] = wallSetIds[1] ?? WALLDEF_RESET;
      header[2] = wallSetIds[2] ?? WALLDEF_RESET;
      header.set(backdropPlaceholder, 3);
      resolved.push({ areaId, header, wallSetIds, ...(note !== undefined ? { note } : {}) });
    }
  });

  const wallBankTlb =
    newSets.length > 0
      ? appendHlibMasterSets(wallBankOriginal, newSets.map(({ id, leaf }) => ({ id, leaf })))
      : undefined;
  return {
    wallBankTlb,
    newSets: newSets.map(({ id, label }) => ({ id, label })),
    resolved,
    residual,
  };
}

/**
 * Patch already-built `GEO.GLB` bytes with the resolved per-area headers (bytes 2-7 of each Gen2 GEO
 * member) from {@link buildCokWallArtPort}'s `resolved` list. Areas not present in `headers` are left
 * completely untouched (they keep whatever header `buildDqkGame.ts` already stamped — the DQK-native
 * placeholder). Never rewrites plane data — the header lives at a fixed 6-byte offset within an
 * already-encoded Gen2 GEO member, so this is a pure byte patch, not a decode/re-encode round trip.
 * Throws if `geoGlb` isn't a Gen2 `DATA` archive (mirrors `decodeGen2GeoArchive`'s own expectations).
 */
export function stampCokWallHeaders(
  geoGlb: Uint8Array,
  headers: Map<number, Uint8Array>,
): { geoGlb: Uint8Array; stamped: number[] } {
  const archive = decodeHlib(geoGlb, 'GEO.GLB');
  if (!archive.nonImage || archive.tag !== 'DATA') {
    throw new Error(`stampCokWallHeaders: expected a DATA GEO.GLB archive, got tag ${JSON.stringify(archive.tag)}`);
  }
  const members = archive.rawMembers.map((m) => new Uint8Array(m)); // copy — never mutate the decode's views
  if (members.length === 0) return { geoGlb, stamped: [] };
  const table = members[0];
  const dv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const count = dv.getUint16(0, true);
  const stamped: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = dv.getUint16(2 + 4 * i, true);
    const memberIdx = dv.getUint16(2 + 4 * i + 2, true);
    const header = headers.get(id);
    if (header && members[memberIdx] && members[memberIdx].length >= 8) {
      members[memberIdx].set(header.subarray(0, 6), 2);
      stamped.push(id);
    }
  }
  return { geoGlb: encodeHlibDataLibrary(members, { tag: 'DATA', magic: 1 }), stamped };
}
