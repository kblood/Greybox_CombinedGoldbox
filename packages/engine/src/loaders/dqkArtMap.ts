/**
 * DQK art-library map (E5.2) — the grounded catalogue of every DQK graphics `.TLB`, its real container
 * shape, and which CoK Amiga art archive (if any) can be lifted into it for a rebuild.
 *
 * E5.1 proved the *mechanism* (a whole Amiga `.DAA` → a DQK **master** `.TLB` drop-in, demonstrated on
 * BIGPIC). E5.2 is the *survey + verdicts*: it records, for all 19 DQK art libraries, the exact shape
 * the engine expects (`master` HLIB vs leaf `TILE`, draw method, palette base, frame geometry, image
 * count — every value read from the real GOG files, asserted in `dqkArtMap.test.ts`), and pairs each
 * with its candidate Amiga source and an honest verdict:
 *
 *  - `portable-master` — solved Amiga `blocks` source, geometry matches a master target → liftable NOW
 *    via {@link buildAmigaArtOverride} (BIGPIC).
 *  - `portable-leaf` — solved source whose target is a leaf `TILE` (one shared palette across frames);
 *    liftable NOW via the shared-palette leaf emit (E5.3, COMSPR): indices lossless, the source
 *    background colour mapped to the 255 transparent key, frame palettes merged into one table.
 *  - `blocked-unsolved-source` — the Amiga archive's pixel encoding has no decoder at all, so no frames
 *    decode and nothing is portable yet. Historically this covered the 6-byte sub-frame index used by
 *    `SPRIT*`/`pic*`/big `HEAD*`, but that format is now SOLVED end-to-end (2026-06-25, see
 *    `daa.ts`'s module doc + `docs/daa-format.md` §1b) — `SPRIT1.DAA`/`pic1.daa` decode real frames
 *    today, so those rows moved to `shape-mismatch` (the source decodes, but its frame count/geometry
 *    doesn't line up with the DQK target — see PICA/PICB/PICC/SPRIT below). This verdict is kept in the
 *    taxonomy for any genuinely-undecoded format encountered in the future.
 *  - `shape-mismatch` — a solved source whose frame size/count doesn't match the DQK library (the DQK
 *    tile *banks* DUNGCOM/WILDCOM/8X8D pack far more tiles than one Amiga archive holds; CPIC is 24×24
 *    on Amiga but 48×48 in DQK; SPRIT1.DAA/pic1.daa decode fine but hold far fewer distinct
 *    sprites/portraits than DQK's SPRIT/PICA/PICB/PICC libraries need) → needs per-asset repacking or
 *    curated id-mapping, not a drop-in *automatically* — but IS liftable slot-by-slot once a human
 *    supplies the mapping (M8: `artSlotMapping.ts`'s `AmigaSlotMapping` + the `?artmap=1` editor build
 *    it, {@link buildMappedArtOverride} mechanically repacks it — see M8.S4).
 *  - `no-amiga-source` — no corresponding Amiga `.DAA` (endgame FINAL/BACK, UI FRAME/GEN; the Amiga
 *    TITLE ships as a separate IFF/ILBM `.LBM`, a different path).
 *
 * This is deliberately a verdict table, not invented conversions: it scopes exactly what art the
 * project can lift today and what stays blocked on shape mismatches / per-asset curation work.
 */
import type { IndexedImage } from '../model/index.js';
import type { DaaArchive } from './daa.js';
import {
  amigaArchiveToHlibMaster,
  amigaArchiveToHlibLeaf,
  amigaImageToVga,
  detectTransparentBackground,
  detectFrameTransparentBackground,
  type AmigaFrameSource,
} from './amigaToHlib.js';
import { mapHlibMasterSlots } from './hlib.js';
import { rebuildHlibMasterWithSlotReplacements, type HlibSlotReplacement } from './hlibEncode.js';
import { validateSlotMapping, type AmigaSlotMapping } from './artSlotMapping.js';

/** HLIB transparent key index for see-through draw methods (21/23). */
const HLIB_TRANSPARENT_KEY = 255;

/** The container form the DQK engine expects for a given art `.TLB`. */
export type DqkArtContainer = 'master' | 'leaf';

/** How an Amiga art archive relates to its DQK target. */
export type AmigaArtVerdict =
  | 'portable-master'
  | 'portable-leaf'
  | 'blocked-unsolved-source'
  | 'shape-mismatch'
  | 'no-amiga-source';

/** One DQK art library's real shape (every field measured from the GOG release) + its Amiga verdict. */
export interface DqkArtEntry {
  /** TLB file name, e.g. `BIGPIC.TLB`. */
  name: string;
  /** Disk it ships on. */
  disk: 'DISK1' | 'DISK2' | 'DISK3';
  /** Master HLIB (multi-set) or leaf TILE (single set). */
  container: DqkArtContainer;
  /** Draw method of its images (16/18 opaque, 21/23 transparent). */
  drawMethod: number;
  /** Palette base (firstColor) of the first image, or null when the leaf stores no colour table. */
  paletteBase: number | null;
  /** First image geometry. */
  width: number;
  height: number;
  /** Number of decoded images. */
  imageCount: number;
  /** Candidate CoK Amiga source archive (file name), or null when none exists. */
  amigaSource: string | null;
  /** The honest portability verdict. */
  verdict: AmigaArtVerdict;
  /**
   * Optional EXPLICIT transparent source index for a `portable-leaf` target. Normally left undefined —
   * the converter auto-detects the transparent background per source archive (it is game-specific:
   * CoK COMSPR = 8, DoK COMSPR = 16), so a fixed value here would be wrong for the other game. Set it
   * only to force a value when auto-detection would be wrong.
   */
  transparentSourceIndex?: number;
  /** Short rationale for `shape-mismatch` / `blocked` / `no-amiga-source`. */
  note?: string;
}

/**
 * The DQK art catalogue. Shapes are the real decoded values (asserted against the GOG files in the
 * test); verdicts pair each with the CoK Amiga art and classify portability. DoK shares the same DQK
 * target shapes (the rebuild reuses this map; only the source archive differs).
 */
export const DQK_ART_LAYOUT: readonly DqkArtEntry[] = [
  // ── Picture / scene art ──────────────────────────────────────────────────────
  { name: 'BIGPIC.TLB', disk: 'DISK2', container: 'master', drawMethod: 18, paletteBase: 32, width: 304, height: 120, imageCount: 3,
    amigaSource: 'BIGPIC1.DAA', verdict: 'portable-master' },
  { name: 'FINAL.TLB', disk: 'DISK3', container: 'master', drawMethod: 18, paletteBase: 32, width: 304, height: 120, imageCount: 47,
    amigaSource: null, verdict: 'no-amiga-source', note: 'DQK endgame scenes; no CoK Amiga equivalent' },
  { name: 'PICA.TLB', disk: 'DISK2', container: 'master', drawMethod: 18, paletteBase: 32, width: 88, height: 88, imageCount: 37,
    amigaSource: 'pic1.daa', verdict: 'shape-mismatch',
    note: 'pic1.daa\'s 6-byte sub-frame index is now SOLVED (88×88 matches!) but it holds only 27 base ' +
      'sprites (50 distance/zoom frames total) shared across PICA+PICB+PICC (37+36+47=120 needed); no ' +
      'id mapping exists from the 27 Amiga entries to the 120 DQK slots, so this is a count mismatch, ' +
      'not a drop-in' },
  { name: 'PICB.TLB', disk: 'DISK2', container: 'master', drawMethod: 18, paletteBase: 32, width: 88, height: 88, imageCount: 36,
    amigaSource: 'pic1.daa', verdict: 'shape-mismatch',
    note: 'pic1.daa\'s 6-byte sub-frame index is now SOLVED (88×88 matches!) but it holds only 27 base ' +
      'sprites (50 distance/zoom frames total) shared across PICA+PICB+PICC (37+36+47=120 needed); no ' +
      'id mapping exists from the 27 Amiga entries to the 120 DQK slots, so this is a count mismatch, ' +
      'not a drop-in' },
  { name: 'PICC.TLB', disk: 'DISK2', container: 'master', drawMethod: 18, paletteBase: 32, width: 88, height: 88, imageCount: 47,
    amigaSource: 'pic1.daa', verdict: 'shape-mismatch',
    note: 'pic1.daa\'s 6-byte sub-frame index is now SOLVED (88×88 matches!) but it holds only 27 base ' +
      'sprites (50 distance/zoom frames total) shared across PICA+PICB+PICC (37+36+47=120 needed); no ' +
      'id mapping exists from the 27 Amiga entries to the 120 DQK slots, so this is a count mismatch, ' +
      'not a drop-in' },
  { name: 'CPIC.TLB', disk: 'DISK2', container: 'leaf', drawMethod: 21, paletteBase: 144, width: 48, height: 48, imageCount: 190,
    amigaSource: 'CPIC1.DAA', verdict: 'shape-mismatch', note: 'Amiga CPIC1 frames are 24×24 (mixed); DQK CPIC is 48×48' },
  // ── Combat / overworld sprites & icons ───────────────────────────────────────
  { name: 'SPRIT.TLB', disk: 'DISK2', container: 'master', drawMethod: 23, paletteBase: 176, width: 72, height: 25, imageCount: 96,
    amigaSource: 'SPRIT1.DAA', verdict: 'shape-mismatch',
    note: 'SPRIT1.DAA\'s 6-byte sub-frame index is now SOLVED (17 base sprites × 3 distance/zoom ' +
      'frames, all 88×88 monster/portrait art) but DQK SPRIT.TLB is 72×25 overworld-map icons × 96 — ' +
      'both geometry and count mismatch, not a drop-in' },
  { name: 'COMSPR.TLB', disk: 'DISK2', container: 'leaf', drawMethod: 21, paletteBase: 64, width: 24, height: 24, imageCount: 46,
    amigaSource: 'comspr.daa', verdict: 'portable-leaf',
    note: 'solved Amiga COMSPR = 24×24 sprites; shared-palette leaf emit, transparent bg auto-detected per game (CoK=8, DoK=16)' },
  { name: 'CBODY.TLB', disk: 'DISK3', container: 'leaf', drawMethod: 21, paletteBase: 96, width: 24, height: 24, imageCount: 98,
    amigaSource: 'BODY1.DAA', verdict: 'shape-mismatch', note: 'Amiga BODY1 is one 88×48 frame; DQK CBODY is 24×24 icons' },
  { name: 'TOPVIEW.TLB', disk: 'DISK2', container: 'leaf', drawMethod: 16, paletteBase: null, width: 8, height: 8, imageCount: 20,
    amigaSource: null, verdict: 'no-amiga-source', note: 'palette-less 8×8 overhead tiles; no direct Amiga archive' },
  // ── Tile banks (DQK packs many more tiles than one Amiga archive holds) ───────
  { name: 'WILDCOM.TLB', disk: 'DISK2', container: 'master', drawMethod: 16, paletteBase: 32, width: 24, height: 24, imageCount: 160,
    amigaSource: 'WILDCOM.DAA', verdict: 'shape-mismatch', note: 'tile bank: Amiga WILDCOM.DAA holds 1 frame vs DQK 160' },
  { name: 'DUNGCOM.TLB', disk: 'DISK2', container: 'master', drawMethod: 16, paletteBase: 32, width: 24, height: 24, imageCount: 136,
    amigaSource: 'DUNGCOM.DAA', verdict: 'shape-mismatch', note: 'tile bank: Amiga DUNGCOM.DAA holds 1 frame vs DQK 136' },
  { name: '8X8DB.TLB', disk: 'DISK2', container: 'master', drawMethod: 21, paletteBase: 32, width: 8, height: 8, imageCount: 423,
    amigaSource: '8X8D1.DAA', verdict: 'shape-mismatch', note: 'tile bank: Amiga 8X8D1.DAA holds 12 frames vs DQK 423' },
  { name: '8X8DC.TLB', disk: 'DISK2', container: 'master', drawMethod: 21, paletteBase: 32, width: 8, height: 1, imageCount: 376,
    amigaSource: '8X8D1.DAA', verdict: 'shape-mismatch', note: 'tile bank: Amiga 8X8D1.DAA holds 12 frames vs DQK 376' },
  { name: 'BACK.TLB', disk: 'DISK2', container: 'master', drawMethod: 16, paletteBase: 144, width: 88, height: 88, imageCount: 20,
    amigaSource: null, verdict: 'no-amiga-source', note: 'DQK combat backdrops; no matching Amiga archive (BODY1 differs)' },
  // ── UI chrome / fonts / title ────────────────────────────────────────────────
  { name: 'FRAME.TLB', disk: 'DISK3', container: 'leaf', drawMethod: 18, paletteBase: 16, width: 320, height: 8, imageCount: 40,
    amigaSource: null, verdict: 'no-amiga-source', note: 'DQK UI frame strips; Amiga UI differs entirely' },
  { name: 'GEN.TLB', disk: 'DISK3', container: 'leaf', drawMethod: 18, paletteBase: 16, width: 320, height: 90, imageCount: 1,
    amigaSource: null, verdict: 'no-amiga-source', note: 'DQK generic UI panel; no Amiga archive' },
  { name: 'TITLE.TLB', disk: 'DISK1', container: 'master', drawMethod: 18, paletteBase: 0, width: 320, height: 200, imageCount: 15,
    amigaSource: null, verdict: 'no-amiga-source', note: 'Amiga title ships as a separate IFF/ILBM .LBM, not a .DAA' },
  { name: 'ALWAYS.TLB', disk: 'DISK1', container: 'leaf', drawMethod: 21, paletteBase: 0, width: 16, height: 16, imageCount: 29,
    amigaSource: null, verdict: 'no-amiga-source', note: 'DQK always-resident UI icons; no matching Amiga archive' },
];

/** Result of assembling the portable Amiga-art override set for a rebuild. */
export interface PortableArtResult {
  /** `{ 'BIGPIC.TLB': bytes, … }` — ready to pass straight to `planDqkBuild({ overrides })`. */
  overrides: Record<string, Uint8Array>;
  /** Targets actually converted (a source archive was supplied and decoded to frames). */
  lifted: { target: string; from: string }[];
  /** Portable targets whose Amiga source was not supplied (copied from the DQK release instead). */
  unavailable: { target: string; from: string }[];
}

/**
 * Assemble the Amiga-art override map for a rebuild from a set of decoded Amiga archives, keyed by the
 * archive's file name (e.g. `{ 'BIGPIC1.DAA': decodeDaa(...), 'comspr.daa': decodeDaa(...) }`). Every
 * `portable-master`/`portable-leaf` entry in {@link DQK_ART_LAYOUT} whose `amigaSource` is present in
 * `sources` is converted via {@link buildAmigaArtOverride}; portable targets with no supplied source are
 * reported in `unavailable` (the caller copies those from the DQK release). Non-portable targets are
 * never touched — UNLESS `mappings` (M8.S3's human-authored `AmigaSlotMapping[]`) supplies a valid,
 * non-empty mapping for a `shape-mismatch` target: that target is then repacked via
 * {@link buildMappedArtOverride} and reported `lifted` too, upgrading it from "copied from DQK" (the
 * default when no mapping exists) to "lifted" art. A mapping that fails validation, or whose assigned
 * frames aren't found in `sources`, is reported `unavailable` rather than throwing — this function is a
 * best-effort assembly step, matching how a missing Amiga source is already handled. The returned
 * `overrides` plug directly into `planDqkBuild` — this is the art-assembly step of the "best-of Amiga art
 * on the newest DQK engine" build (E5.4 / M8).
 *
 * `originals` (optional) supplies the REAL original `.TLB` bytes per target name: a mapped
 * `shape-mismatch` master is then rebuilt as a **drop-in replacement** (real set-id table preserved,
 * unmapped sets carried over verbatim — see {@link buildMappedArtOverride}) instead of the legacy
 * assigned-slots-only container. The real cok-on-dqk build always passes them.
 */
export function buildPortableArtOverrides(
  sources: Record<string, DaaArchive>,
  mappings?: AmigaSlotMapping[],
  originals?: Record<string, Uint8Array>,
): PortableArtResult {
  const norm = (s: string) => s.toUpperCase();
  const byName = new Map(Object.entries(sources).map(([k, v]) => [norm(k), v] as const));
  const mappingByTarget = new Map((mappings ?? []).map((m) => [m.target, m] as const));
  const overrides: Record<string, Uint8Array> = {};
  const lifted: { target: string; from: string }[] = [];
  const unavailable: { target: string; from: string }[] = [];
  for (const e of DQK_ART_LAYOUT) {
    if (e.verdict === 'portable-master' || e.verdict === 'portable-leaf') {
      const from = e.amigaSource ?? '';
      const src = e.amigaSource ? byName.get(norm(e.amigaSource)) : undefined;
      if (!src || src.frameSet.frames.size === 0) {
        unavailable.push({ target: e.name, from });
        continue;
      }
      overrides[e.name] = buildAmigaArtOverride(e.name, src);
      lifted.push({ target: e.name, from });
      continue;
    }
    if (e.verdict === 'shape-mismatch') {
      const mapping = mappingByTarget.get(e.name);
      if (!mapping || mapping.assignments.length === 0) continue; // no human mapping -> stays untouched
      try {
        overrides[e.name] = buildMappedArtOverride(e.name, sources, mapping, originals?.[e.name]);
        lifted.push({ target: e.name, from: mapping.source });
      } catch {
        unavailable.push({ target: e.name, from: mapping.source });
      }
    }
  }
  return { overrides, lifted, unavailable };
}

/** Look up a DQK art entry by `.TLB` name (case-insensitive). */
export function dqkArtEntry(name: string): DqkArtEntry | undefined {
  const upper = name.toUpperCase();
  return DQK_ART_LAYOUT.find((e) => e.name === upper);
}

/** All art entries with a given verdict (e.g. everything `portable-master`). */
export function dqkArtByVerdict(verdict: AmigaArtVerdict): DqkArtEntry[] {
  return DQK_ART_LAYOUT.filter((e) => e.verdict === verdict);
}

/**
 * Build the Amiga-art override bytes for a DQK art `.TLB`, or throw with the blocking verdict.
 * `portable-master` targets convert to a master `.TLB` (per-frame palettes) via
 * {@link amigaArchiveToHlibMaster}; `portable-leaf` targets convert to a shared-palette leaf `TILE` via
 * {@link amigaArchiveToHlibLeaf} (mapping the entry's `transparentSourceIndex` to the 255 key). Both
 * relocate to the target's palette base and draw method. Every other verdict throws a descriptive error
 * naming the reason — callers assemble a partial art-override set from the portable entries and copy the
 * rest from the DQK release.
 */
export function buildAmigaArtOverride(targetName: string, source: DaaArchive): Uint8Array {
  const entry = dqkArtEntry(targetName);
  if (!entry) throw new Error(`unknown DQK art TLB "${targetName}"`);
  if (entry.verdict !== 'portable-master' && entry.verdict !== 'portable-leaf') {
    throw new Error(`${entry.name}: not portable now (${entry.verdict}${entry.note ? ` — ${entry.note}` : ''})`);
  }
  if (source.frameSet.frames.size === 0) {
    throw new Error(`${entry.name}: source "${source.name}" decoded no frames`);
  }
  if (entry.verdict === 'portable-leaf') {
    // Transparent background is game-specific (CoK COMSPR=8, DoK=16) — auto-detect from the source
    // unless the entry forces an explicit value.
    const transparentSourceIndex = entry.transparentSourceIndex ?? detectTransparentBackground(source);
    return amigaArchiveToHlibLeaf(source, {
      method: entry.drawMethod,
      paletteBase: entry.paletteBase ?? 0,
      transparentSourceIndex,
    });
  }
  return amigaArchiveToHlibMaster(source, {
    method: entry.drawMethod,
    paletteBase: entry.paletteBase ?? 0,
  });
}

/** Look up one decoded Amiga source frame by its `{blockId, frameIndex}` (the `AmigaSlotMapping`
 * assignment key), regardless of the archive's `kind` — mirrors `apps/web/src/ui/artmap.ts`'s
 * `findSourceFrame`, but pure/engine-side so {@link buildMappedArtOverride} doesn't need the DOM layer. */
function findMappedSourceFrame(archive: DaaArchive, blockId: number, frameIndex: number): IndexedImage | null {
  if (archive.kind === 'index') {
    const s = archive.subFrames.find((sf) => sf.blockId === blockId);
    return s?.frames[frameIndex] ?? null;
  }
  const b = archive.blocks.find((bl) => bl.blockId === blockId);
  return frameIndex === 0 ? (b?.image ?? null) : null;
}

/** Crop or pad (top-left anchor) an image's indices to exactly `width`×`height` — the purely mechanical
 * geometry transform M8.S4 allows: excess rows/columns are dropped, missing ones filled with `fill`.
 * Never scales/interpolates, so it neither invents new art content nor loses any pixel that fits. A frame
 * already the right size is returned unchanged. Operates on whatever index space the caller hands in — see
 * {@link relocateThenCropPad} for why that must be POST-relocation (VGA) space, not the raw Amiga source. */
function cropPadImage(image: IndexedImage, width: number, height: number, fill: number): IndexedImage {
  if (image.width === width && image.height === height) return image;
  const out = new Uint8Array(width * height).fill(fill);
  const copyW = Math.min(image.width, width);
  const copyH = Math.min(image.height, height);
  for (let y = 0; y < copyH; y++) {
    const srcRow = y * image.width;
    const dstRow = y * width;
    for (let x = 0; x < copyW; x++) out[dstRow + x] = image.indices[srcRow + x];
  }
  return { ...image, width, height, indices: out };
}

/**
 * Relocate a raw Amiga source frame to `paletteBase` (the same 32→256-colour step
 * {@link amigaArchiveToHlibMaster}/`...Leaf` apply internally) and THEN crop/pad it to the target
 * geometry, with `fill` chosen in the ALREADY-relocated (VGA/target) index space. Order matters: cropping
 * in raw source-index space first and relocating after would shift the pad `fill` value by the frame's
 * delta too, so a literal 255 could land anywhere (or trip `amigaImageToVga`'s bounds check) — relocating
 * first means the returned image's palette already sits at `paletteBase`, so the later relocation inside
 * `amigaArchiveToHlibMaster`/`...Leaf` computes a delta of exactly 0 (a no-op) and `fill` passes through
 * unchanged.
 */
function relocateThenCropPad(image: IndexedImage, width: number, height: number, paletteBase: number, fill: number): IndexedImage {
  const vga = amigaImageToVga(image, paletteBase);
  const relocated: IndexedImage = { ...image, width: vga.width, height: vga.height, indices: vga.indices, palette: vga.palette };
  return cropPadImage(relocated, width, height, fill);
}

/**
 * Mechanically repack a human-authored {@link AmigaSlotMapping} (M8.S3) into real HLIB override bytes for
 * its `shape-mismatch` target — the second half of Gap G5 (the first half, choosing which Amiga frame
 * goes where, is deliberately a human decision made in the `?artmap=1` editor, not this function's job).
 *
 * Each assignment pulls the named `{sourceBlockId, frameIndex}` frame out of the decoded archive named
 * by `assignment.source ?? mapping.source` (looked up case-insensitively in `sources` — the optional
 * per-assignment override lets one target draw on several Amiga archives).
 *
 * **Drop-in mode (`original` supplied — what the real cok-on-dqk build uses).** For a `master` target,
 * the override is rebuilt FROM the original `.TLB` via {@link rebuildHlibMasterWithSlotReplacements}:
 * the real set-id table is preserved byte-for-byte, every unmapped set is carried over verbatim (same
 * engine id coverage as the original file), and each mapped slot is replaced in place using the SLOT's
 * own original geometry and draw method — the frame is relocated to the target's palette base, keyed
 * transparent for see-through slots (methods 21/23: the frame's measured background colour — its
 * dominant border pixel, {@link detectFrameTransparentBackground} — becomes the HLIB 255 key, so the
 * method-23 encoder emits skip runs instead of an opaque box), then cropped/padded top-left to the
 * slot's real original `width`×`height` (per-slot, NOT the table's first-image geometry). The Amiga
 * frame's 32-colour palette is patched over the owning set's colour-table slice so the art keeps its
 * colours without disturbing the rest of the set's table.
 *
 * **Legacy mode (no `original`).** Packs ONLY the assigned slots into a fresh container with a
 * placeholder set-id table, cropping to the layout entry's table-wide geometry — kept for callers
 * without the original bytes (backward compatible; not engine-addressable by picture id).
 *
 * Never invents art for a slot the human didn't choose.
 *
 * Throws if: the target is unknown or not `shape-mismatch`, the mapping doesn't validate against
 * {@link DQK_ART_LAYOUT} (target/slot-range/duplicate checks — see `validateSlotMapping`), an
 * assignment's source archive isn't in `sources`, an assignment names a `{blockId, frameIndex}` the
 * source didn't decode, or (drop-in mode) the target isn't a `master` container.
 */
export function buildMappedArtOverride(
  targetName: string,
  sources: Record<string, DaaArchive>,
  mapping: AmigaSlotMapping,
  original?: Uint8Array,
): Uint8Array {
  const entry = dqkArtEntry(targetName);
  if (!entry) throw new Error(`unknown DQK art TLB "${targetName}"`);
  if (entry.verdict !== 'shape-mismatch') {
    throw new Error(
      `${entry.name}: buildMappedArtOverride is for shape-mismatch targets (verdict: ${entry.verdict})`,
    );
  }
  if (mapping.target !== entry.name) {
    throw new Error(`${entry.name}: mapping.target "${mapping.target}" does not match`);
  }
  const validation = validateSlotMapping(mapping, DQK_ART_LAYOUT);
  if (!validation.valid) {
    throw new Error(`${entry.name}: invalid mapping (${validation.errors.join('; ')})`);
  }
  if (mapping.assignments.length === 0) {
    throw new Error(`${entry.name}: mapping has no assignments`);
  }
  const norm = (s: string) => s.toUpperCase();
  const byName = new Map(Object.entries(sources).map(([k, v]) => [norm(k), v] as const));
  const resolveFrame = (a: { slot: number; sourceBlockId: number; frameIndex: number; source?: string }): IndexedImage => {
    const srcName = a.source ?? mapping.source;
    const src = byName.get(norm(srcName));
    if (!src) throw new Error(`${entry.name}: source archive "${srcName}" not supplied`);
    const image = findMappedSourceFrame(src, a.sourceBlockId, a.frameIndex);
    if (!image) {
      throw new Error(
        `${entry.name}: source "${srcName}" has no decoded frame for block ${a.sourceBlockId}.${a.frameIndex} (slot ${a.slot})`,
      );
    }
    return image;
  };
  const paletteBase = entry.paletteBase ?? 0;

  if (original) {
    // Drop-in rebuild: real set-id table + verbatim carry-over of every unmapped set.
    if (entry.container !== 'master') {
      throw new Error(`${entry.name}: drop-in rebuild (original supplied) is only implemented for master targets`);
    }
    const refs = mapHlibMasterSlots(original);
    if (refs.length !== entry.imageCount) {
      throw new Error(
        `${entry.name}: original decodes ${refs.length} images, layout table records ${entry.imageCount} — not the expected original file`,
      );
    }
    const replacements = new Map<number, HlibSlotReplacement>();
    for (const a of mapping.assignments) {
      const image = resolveFrame(a);
      const ref = refs[a.slot];
      const transparent = ref.drawMethod === 21 || ref.drawMethod === 23;
      const vga = amigaImageToVga(image, paletteBase);
      if (transparent) {
        // Key the frame's measured background to the HLIB transparent key BEFORE cropping, comparing
        // in the source index space (pre-relocation) like amigaArchiveToHlibLeaf does.
        const bg = detectFrameTransparentBackground(image);
        for (let i = 0; i < vga.indices.length; i++) if (image.indices[i] === bg) vga.indices[i] = HLIB_TRANSPARENT_KEY;
      }
      const relocated: IndexedImage = { ...image, width: vga.width, height: vga.height, indices: vga.indices, palette: vga.palette };
      const fitted = cropPadImage(relocated, ref.width, ref.height, transparent ? HLIB_TRANSPARENT_KEY : 0);
      replacements.set(a.slot, {
        image: { width: fitted.width, height: fitted.height, indices: fitted.indices },
        palette: vga.palette,
      });
    }
    return rebuildHlibMasterWithSlotReplacements(original, replacements);
  }

  // Legacy assigned-slots-only container (no original bytes supplied).
  const fill = entry.drawMethod === 21 || entry.drawMethod === 23 ? HLIB_TRANSPARENT_KEY : 0;
  const frames = new Map<number, IndexedImage>();
  for (const a of [...mapping.assignments].sort((x, y) => x.slot - y.slot)) {
    const image = resolveFrame(a);
    frames.set(a.slot, relocateThenCropPad(image, entry.width, entry.height, paletteBase, fill));
  }

  const synthetic: AmigaFrameSource = { frameSet: { frames } };
  const opts = { method: entry.drawMethod, paletteBase };
  return entry.container === 'leaf' ? amigaArchiveToHlibLeaf(synthetic, opts) : amigaArchiveToHlibMaster(synthetic, opts);
}
