/**
 * Gold Box Asset Viewer — single-page app that live-decodes real game files via
 * the format library and renders every frame to canvas.
 *
 * Two input paths:
 *   (a) drag-and-drop / file-picker for arbitrary .DAX/.DAA/.TLB/.GLB/.LBM files
 *       (works with no server);
 *   (b) a bundled-games catalog that fetches the REAL repo files via Vite's
 *       /@fs mechanism during `npm run dev`.
 *
 * For a selected/dropped file we call `decodeAsset`, then render each image frame
 * to its own pixelated <canvas> with an integer zoom control, dimensions label,
 * palette swatch strip, format badge, click-to-enlarge lightbox, and graceful
 * notes for unsupported/skipped frames.
 */
import {
  decodeAsset,
  renderHlibComposite,
  decodeC64Picture,
  readQsvRoster,
  readQsvLeadCharacterName,
  decodeDqkSaveHeader,
  DQK_QSV_PARTY_SIZE_OFFSET,
  walkQsvRecords,
  c64CharsetGlyphs,
  isC64Picture,
  C64_PICTURE_SIZES,
} from '@goldbox/engine';
import type { DecodedAsset } from '@goldbox/engine';
import type { IndexedImage } from '@goldbox/engine';
import { CATALOG, CATALOG_BY_ID, assetUrl } from './catalog.js';
import {
  el,
  setZoom,
  applyZoom,
  lazyRender,
  renderNow,
  makeSwatchStrip,
  openLightbox,
} from './render.js';
import { loadAndRenderGame, GAME_IDS } from './gameview.js';
import { getLibrary, setupLibrary, setLibrarySelectHandler, restoreLastModuleEntry, type LibraryEntry } from './library.js';
import { closeExplore, startCoabRegionalTravel, startExplore, startGatewayEcl5Fight } from './explore.js';
import { DUNGEON3D_TITLES, closeDungeon3d, startDungeon3dLazy } from './dungeon3dHost.js';
import { closeDqkExplore, startDqkExplore, startDqkQuest, DQK_TITLE_PATH } from './dqkExplore.js';
import { startModuleExplore } from './moduleExplore.js';
import { startImportSecretPanel } from './importSecretParty.js';
import { importCokParty, installImportSeam } from './importParty.js';
import { importDokParty, installImportDokSeam } from './importDokParty.js';
import { importDqkParty, installImportDqkSeam } from './importDqkParty.js';
import { startIntro } from './intro.js';
import { startCombat, startCombatDqkPreview, startCombatMvp } from './combat.js';
import { startAudio } from './audio.js';
import { startMenus } from './menus.js';
import { startCreate } from './create.js';
import { startInventory } from './inventory.js';
import { startWilderness } from './wilderness.js';
import { closeTown, startTown } from './town.js';
import { startDialogue } from './dialogue.js';
import { startJournal } from './journal.js';
import { startHud } from './hudPanel.js';
import { startAutomap } from './automapPanel.js';
import { startCharEditor } from './charEditor.js';
import { startEclInspector } from './eclInspector.js';
import { importCoabParty, installImportCoabSeam } from './importCoabParty.js';
import { installImportPoolsTreasuresSeam, startImportPoolsTreasuresPanel } from './importPoolsTreasuresParty.js';
import { installImportBuckSeam, startImportBuckPanel } from './importBuckParty.js';
import { startReferenceDb } from './referenceDb.js';
import { startMainMenu } from './mainMenu.js';
import { startDemo } from './demo.js';
import { startGen1Demo } from './demoGen1.js';
import {
  DOK_TITLE_PATH, DOK_DEMO_PROFILE,
  COAB_TITLE_PATH, COAB_DEMO_PROFILE,
  SECRET_TITLE_PATH, SECRET_DEMO_PROFILE,
  GATEWAY_TITLE_PATH, GATEWAY_DEMO_PROFILE,
  POOL_TITLE_PATH,
  TREASURES_TITLE_PATH, TREASURES_DEMO_PROFILE,
  POOLS_TITLE_PATH, POOLS_DEMO_PROFILE,
  NWN_TITLE_PATH,
} from './gen1Profiles.js';
import { startTitleMenu } from './titleMenu.js';
import { startDqkTitleMenu } from './dqkTitleMenu.js';
import { startDqkDemo } from './dqkDemo.js';
import { startGraphicSwitch } from './gswitch.js';
import { startArtMap } from './artmap.js';
import { startPlay } from './play.js';
import { startDocs } from './docs.js';
import { startSupportMatrix } from './support.js';
import { startNwnPreview } from './nwnPreview.js';
import { gameIdForProfile, type GameId } from './gameData.js';
import type { AssetSource } from './assetSource.js';
import { resolveCokPlayInstall } from './cok-play-source.mjs';
import type { AudioGameId } from '../audio/gameAudio.js';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

// --- Frame extraction from a DecodedAsset -----------------------------------

interface ExtractedFrame {
  key: string;
  image: IndexedImage | null;
  note?: string;
}

interface Extracted {
  format: string;
  detail: string;
  frames: ExtractedFrame[];
  notes: string[];
}

function extractFrames(decoded: DecodedAsset, bytes: Uint8Array): Extracted {
  const notes: string[] = [];
  if (decoded.format === 'hlib') {
    const a = decoded.archive;
    if (a.nonImage) {
      notes.push(
        `Non-image HLIB library (tag "${a.tag}") — ${a.rawMembers.length} raw member(s), payload not decoded (e.g. DATA/DIG4).`,
      );
    }
    const frames: ExtractedFrame[] = a.images.map((m, i) => ({
      key: `${i}: ${m.label} (method ${m.drawMethod})`,
      image: m.image,
    }));
    // Method-25 composites are parsed into `archive.composites` and deliberately kept out of
    // `archive.images` (they reference other members rather than carrying pixels). The note this
    // branch used to print -- "draw method 25 -- known-unsupported variant" -- outlived the
    // problem: the record layout was solved from DQK.EXE on 2026-08-22 and `renderHlibComposite`
    // has assembled them correctly ever since, with nothing calling it.
    let composed = 0;
    for (const [ci, c] of a.composites.entries()) {
      const img = renderHlibComposite(bytes, c);
      if (!img) continue;
      composed++;
      frames.push({ key: `composite ${ci} (method 25, ${c.parts.length} part(s))`, image: img });
    }
    if (a.composites.length > 0) {
      notes.push(
        `${a.composites.length} method-25 composite(s); ${composed} assembled from their source members.`,
      );
    }
    if (a.rawMembers.length > 0 && !a.nonImage) {
      const rawBytes = a.rawMembers.reduce((acc, m) => acc + m.byteLength, 0);
      notes.push(`${a.rawMembers.length} member region(s) (${rawBytes} byte(s)) not decoded as images.`);
    }
    return {
      format: 'HLIB',
      detail: `tag "${a.tag}" · ${frames.length} image member(s)`,
      frames,
      notes,
    };
  }
  if (decoded.format === 'glib') {
    // The big-endian Amiga sibling of HLIB. Until 2026-08-22 `decodeAsset` did not sniff GLIB at
    // all, so dropping any Amiga Curse/Secret/Pools/Gateway/Treasures/DQK container on this page
    // produced "unrecognized container format" -- 152 files across six titles, 13,884 images
    // (177 / 16,483 counting the German Pools pack, which duplicates the English one).
    const a = decoded.archive;
    const rawBytes = a.rawMembers.reduce((acc, m) => acc + m.byteLength, 0);
    if (a.images.length === 0) {
      notes.push(`Non-image GLIB library (tag "${a.tag}") — ${rawBytes} byte(s) of payload not decoded.`);
    } else if (rawBytes > 0) {
      notes.push(`${a.rawMembers.length} member region(s) (${rawBytes} byte(s)) not decoded as images.`);
    }
    // Method-0x19 composites, the big-endian twin of the HLIB pass above. `decodeGlib` assembles
    // them during its walk (an Amiga leaf may be compressed, so its members exist only in the
    // decompressed buffer) and keeps them out of `images` so positional indices never shift.
    const glibFrames: ExtractedFrame[] = a.images.map((m, i) => ({
      key: `${i}: ${m.label} (method ${m.drawMethod})`,
      image: m.image,
    }));
    let glibComposed = 0;
    for (const [ci, c] of a.composites.entries()) {
      if (!c.image) continue;
      glibComposed++;
      glibFrames.push({ key: `composite ${ci} (method 0x19, ${c.parts.length} part(s))`, image: c.image });
    }
    if (a.composites.length > 0) {
      notes.push(
        `${a.composites.length} method-0x19 composite(s); ${glibComposed} assembled from their source members.`,
      );
    }
    return {
      format: 'GLIB',
      detail: `tag "${a.tag}" · ${a.images.length} image member(s)`,
      frames: glibFrames,
      notes,
    };
  }

  if (decoded.format === 'ilbm') {
    const img = decoded.image;
    return {
      format: 'IFF/ILBM',
      detail: `${img.width}×${img.height} · ${img.planes} planes · ${img.compression ? 'ByteRun1' : 'uncompressed'}`,
      frames: [{ key: '0: ILBM', image: img.image }],
      notes,
    };
  }
  if (decoded.format === 'daa') {
    const a = decoded.archive;
    if (a.kind === 'index') {
      const frames: ExtractedFrame[] = [];
      let failed = 0;
      for (const s of a.subFrames) {
        if (s.frames.length > 0) {
          s.frames.forEach((img, fi) =>
            frames.push({ key: `block ${s.blockId} f${fi} (${img.width}×${img.height})`, image: img }),
          );
        } else {
          failed++;
        }
      }
      notes.push(
        `DAA 6-byte sub-frame index (SPRIT/PIC/HEAD) — ${a.subFrames.length} entries, ${frames.length} frame(s) decoded` +
          (failed ? `; ${failed} entr${failed === 1 ? 'y' : 'ies'} failed to decode` : '') +
          `.`,
      );
      return { format: 'DAA', detail: `${a.subFrames.length} sub-frame entries`, frames, notes };
    }
    const frames: ExtractedFrame[] = a.blocks.map((b) => ({
      key: `block ${b.blockId}`,
      image: b.image,
      note: b.image ? undefined : 'unrecognized header — skipped',
    }));
    return {
      format: 'DAA',
      detail: `${a.blocks.length} block(s)`,
      frames,
      notes,
    };
  }
  if (decoded.format === 'pool-amiga') {
    // Pool of Radiance's Amiga LZSS container -- the fourth Amiga container format, landed
    // 2026-09-03. It gets its own branch rather than falling through to the DAX catch-all
    // below for two independent reasons. First the label: the catch-all reports
    // `format: 'DAX'`, and these files are not DAX. Second the frame count: this page's DAX
    // reading surfaces every frame only for `animated`/`gateway-pic-multiframe` blocks, but
    // poolAmiga.ts emits multi-frame blocks under `kind: 'standard'` too (bacpac, 8x8d,
    // dungcom, wildcom, randcom, sqrpaci), so the shared reading would show one frame each.
    // The same omission cost `loadGame.ts` 928 of 1672 frames; this is the third of the three
    // `decoded.format ===` flattening sites, and R3 updated only `nwnPreview.ts`.
    const a = decoded.archive;
    const frames: ExtractedFrame[] = [];
    let dataBlocks = 0;
    for (const b of a.blocks) {
      if (b.frames && b.frames.length > 0) {
        b.frames.forEach((img, fi) =>
          frames.push({ key: `block ${b.blockId} f${fi} (${img.width}\u00d7${img.height})`, image: img }),
        );
      } else if (b.image) {
        frames.push({ key: `block ${b.blockId} (${b.kind})`, image: b.image });
      } else {
        dataBlocks++;
        frames.push({
          key: `block ${b.blockId} (${b.kind})`,
          image: null,
          note: 'non-graphics payload (geo/ecl/walldef/mon*/item) \u2014 no image by design',
        });
      }
    }
    if (dataBlocks > 0) {
      notes.push(`${dataBlocks} non-graphics block(s) carry no image by design.`);
    }
    return {
      format: 'Pool-Amiga',
      detail: `${a.blocks.length} block(s) \u00b7 ${frames.length - dataBlocks} image frame(s)`,
      frames,
      notes,
    };
  }

  // dax
  const a = decoded.archive;
  const frames: ExtractedFrame[] = [];
  for (const b of a.blocks) {
    if (
      (b.kind === 'animated' || b.kind === 'gateway-pic-multiframe') &&
      b.frames &&
      b.frames.length > 0
    ) {
      // Multi-frame picture (SPRIT view-sizes / PIC portrait frames / Gateway
      // planar5 XOR-delta animations): show them all.
      b.frames.forEach((img, fi) =>
        frames.push({ key: `block ${b.blockId} f${fi} (${img.width}×${img.height})`, image: img }),
      );
    } else {
      frames.push({
        key: `block ${b.blockId} (${b.kind})`,
        image: b.image,
        note:
          b.kind === 'complex'
            ? 'unsolved sub-frame variant — skipped'
            : b.kind === 'gateway-structure-record'
              ? 'pixel-less VGA structure record (color setup) — no image by design'
              : b.image
                ? undefined
                : 'no image',
      });
    }
  }
  return {
    format: 'DAX',
    detail: `${a.blocks.length} block(s)`,
    frames,
    notes,
  };
}

/**
 * C64 `PIC*` render, deliberately NOT routed through `decodeAsset`.
 *
 * `isC64Picture` is a bare length check for 2681 or 2682 bytes -- the format has no magic at
 * all. Adding it to the generic dispatcher would let it claim any unrelated file that happened
 * to be that long, so the catalog names the decoder (`kind: 'c64-picture'`) and supplies the
 * `CHARSET` companion instead of asking the bytes what they are.
 */
function renderC64Picture(bytes: Uint8Array, charset: Uint8Array, sourceName: string): number {
  if (!isC64Picture(bytes)) {
    throw new Error(
      `not a C64 picture: ${bytes.byteLength} bytes, expected ${C64_PICTURE_SIZES.join(' or ')}`,
    );
  }
  const image = decodeC64Picture(bytes, c64CharsetGlyphs(charset));
  return renderExtracted(
    {
      format: 'C64 PRG',
      detail: `${image.width}x${image.height} · 38x15 cells · VIC-II`,
      frames: [{ key: `0: ${sourceName}`, image }],
      notes: [],
    },
    sourceName,
  );
}

// --- Render the whole decoded asset -----------------------------------------

function renderAsset(decoded: DecodedAsset, sourceName: string, bytes: Uint8Array): number {
  return renderExtracted(extractFrames(decoded, bytes), sourceName);
}

function renderExtracted(ext: Extracted, sourceName: string): number {
  const out = $('#output');
  out.innerHTML = '';


  const header = el('div', 'asset-header');
  const badge = el('span', 'badge', ext.format);
  header.appendChild(badge);
  header.appendChild(el('span', 'asset-name', sourceName));
  header.appendChild(el('span', 'muted', ext.detail));
  out.appendChild(header);

  for (const note of ext.notes) {
    out.appendChild(el('div', 'note', note));
  }

  const renderable = ext.frames.filter((f) => f.image);
  const grid = el('div', 'frame-grid');
  out.appendChild(grid);

  let rendered = 0;
  for (const f of ext.frames) {
    const card = el('div', 'frame-card');
    const titleRow = el('div', 'frame-title', f.key);
    card.appendChild(titleRow);

    if (!f.image) {
      card.classList.add('skipped');
      card.appendChild(el('div', 'note small', f.note ?? 'skipped'));
      grid.appendChild(card);
      continue;
    }

    const image = f.image;
    const dims = el('div', 'dims', `${image.width}×${image.height}${image.encoding ? ` · enc ${image.encoding}` : ''}`);
    card.appendChild(dims);

    const canvasWrap = el('div', 'canvas-wrap');
    const canvas = el('canvas', 'pixelated');
    canvas.width = image.width;
    canvas.height = image.height;
    applyZoom(canvas, image);
    canvas.addEventListener('click', () => openLightbox(image, `${sourceName} · ${f.key}`));
    canvasWrap.appendChild(canvas);
    card.appendChild(canvasWrap);

    if (f.note) card.appendChild(el('div', 'note small', f.note));

    card.appendChild(makeSwatchStrip(image.palette));

    grid.appendChild(card);

    // Lazy render: defer the actual blit until the card scrolls near the viewport.
    lazyRender(canvas, image);
    rendered++;
  }

  if (renderable.length === 0 && ext.frames.length === 0) {
    grid.appendChild(el('div', 'note', 'No renderable image frames in this asset.'));
  }

  // Eagerly render the first frame so headless screenshots capture it without
  // depending on IntersectionObserver timing.
  const firstCanvas = grid.querySelector('canvas') as HTMLCanvasElement | null;
  if (firstCanvas) renderNow(firstCanvas);

  return rendered;
}

// --- Decode entry point -----------------------------------------------------

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = $('#status');
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

/**
 * A DQK `.QSV` save game, rendered as a party roster rather than as pictures.
 *
 * The records are found by SCANNING, not by striding: the record length is genuinely unsolved
 * (measured deltas run 508..788 bytes and an exhaustive search for a MONCHA-style count formula
 * returns zero exact fits across 58 records). So this reports the header's party-size byte and
 * the number of records the scan found as two separate numbers and says so when they disagree --
 * one shipped save in the corpus does, claiming a party of 1 while yielding two records both
 * named CALDOR. Smoothing that over in the UI would hide the single most interesting thing the
 * decoder knows.
 */
function renderDqkSave(bytes: Uint8Array, sourceName: string): number {
  const header = decodeDqkSaveHeader(bytes);
  const roster = readQsvRoster(bytes);
  const claimed = bytes[DQK_QSV_PARTY_SIZE_OFFSET] ?? 0;
  const lead = readQsvLeadCharacterName(bytes);

  const notes: string[] = [
    `Header: party size ${claimed} @${DQK_QSV_PARTY_SIZE_OFFSET}, lead character ${lead ?? '(none)'}, ` +
      `facing ${header.facing}, speed ${header.speed}, clock ${header.time.years}y ${header.time.months}m ` +
      `${header.time.days}d ${header.time.hours}h.`,
    'Records are located two independent ways and the results are compared. The scan looks for ' +
      'three simultaneous signals at MONCHA offsets (+0x66 monster flag, +0x68 NUL-padded name, ' +
      '+0x78 six ability pairs in 1..25). The walk is pure arithmetic: 0x1A1 fixed bytes, then ' +
      '17 x byte[0x08] inventory items, then 9-byte affect nodes until a NULL-pointer terminator.',
  ];
  const spans = walkQsvRecords(bytes);
  if (spans === null) {
    notes.push(
      'The forward walk declined this file: its item-count byte is not mirrored at +0xC9. That is ' +
      'the Amiga-native variant, whose pointers are 32-bit big-endian on a 10-byte stride. Only ' +
      'the scan applies here.',
    );
  } else {
    const offsets = spans.map((r) => r.offset).join(',');
    const agree = offsets === roster.slice(0, spans.length).map((e) => e.offset).join(',');
    notes.push(
      `The walk found ${spans.length} record(s) and ${agree ? 'agrees with' : 'DISAGREES with'} the ` +
        `scan on every boundary. The two share no predicate, so agreement is a real cross-check.`,
    );
  }
  if (roster.length !== claimed) {
    notes.push(
      `Disagreement, reported not smoothed: the header claims ${claimed} but the scan found ` +
        `${roster.length}. The likely reading is a stale record the engine never cleared.`,
    );
  }

  const frames = roster.map((entry, i) => {
    const span = spans?.find((r) => r.offset === entry.offset) ?? null;
    const pairs: string[] = [];
    for (let a = 0; a < 6; a++) pairs.push(`${entry.abilities[a * 2]}/${entry.abilities[a * 2 + 1]}`);
    return {
      key: `${i}: ${entry.name}`,
      image: null,
      note:
        `@0x${entry.offset.toString(16)} · ${entry.isMonster ? 'monster' : 'character'} · ` +
        `abilities (cur/max) ${pairs.join(' ')}` +
        (span
          ? ` · ${span.length} bytes = 0x1A1 + 17x${span.itemCount} items + 9x${span.affectNodes} affects + 6`
          : ''),
    };
  });

  // renderExtracted() returns the number of frames it BLITTED, and a roster has no images at
  // all -- so its return value is 0 here and says nothing. Report the record count instead.
  renderExtracted(
    {
      format: 'QSV',
      detail: `${bytes.byteLength} bytes · ${roster.length} record(s)`,
      frames,
      notes,
    },
    sourceName,
  );
  return roster.length;
}

function decodeAndRender(
  bytes: Uint8Array,
  name: string,
  companion?: Uint8Array,
  kind?: 'c64-picture' | 'dqk-save',
): number {
  try {
    closeMajorViews();
    if (kind === 'dqk-save') {
      const count = renderDqkSave(bytes, name);
      setStatus(`Decoded ${name} — ${count} roster record(s).`);
      return count;
    }
    if (companion) {
      const count = renderC64Picture(bytes, companion, name);
      setStatus(`Decoded ${name} — ${count} frame(s) rendered.`);
      return count;
    }
    const decoded = decodeAsset(bytes, name);
    const count = renderAsset(decoded, name, bytes);
    setStatus(`Decoded ${name} — ${count} frame(s) rendered.`);
    return count;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to decode ${name}: ${msg}`, 'error');
    const out = $('#output');
    out.innerHTML = '';
    out.appendChild(el('div', 'note error', `Failed to decode ${name}: ${msg}`));
    return 0;
  }
}

async function loadCatalogAsset(id: string): Promise<number> {
  closeMajorViews();
  const asset = CATALOG_BY_ID.get(id);
  if (!asset) {
    setStatus(`Unknown catalog asset id: ${id}`, 'error');
    return 0;
  }
  setStatus(`Fetching ${asset.label}…`);
  const url = assetUrl(asset.path);
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      setStatus(`Catalog fetch ${resp.status} for ${asset.path} — file not served (dev only?).`, 'error');
      const out = $('#output');
      out.innerHTML = '';
      out.appendChild(
        el('div', 'note error', `HTTP ${resp.status} fetching ${asset.path}. Bundled catalog needs \`npm run dev\` with fs access.`),
      );
      return 0;
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let companion: Uint8Array | undefined;
    if (asset.companionPath) {
      // A missing companion must fail loudly. Measured (c64-picture.test.ts tier 3): a Gateway
      // picture drawn without it loses 14,848 pixels, 40.7% of the image, and still renders as
      // one plausible-looking frame -- which is the worst outcome, not the safest.
      const cResp = await fetch(assetUrl(asset.companionPath));
      if (!cResp.ok) {
        setStatus(`Companion fetch ${cResp.status} for ${asset.companionPath}.`, 'error');
        const out = $('#output');
        out.innerHTML = '';
        out.appendChild(
          el('div', 'note error', `HTTP ${cResp.status} fetching companion ${asset.companionPath}.`),
        );
        return 0;
      }
      companion = new Uint8Array(await cResp.arrayBuffer());
    }
    const count = decodeAndRender(bytes, asset.hint, companion, asset.kind);
    highlightCatalog(id);
    return count;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Error fetching ${asset.path}: ${msg}`, 'error');
    return 0;
  }
}

// --- Catalog sidebar --------------------------------------------------------

function highlightCatalog(id: string): void {
  document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
  const node = document.querySelector(`[data-asset-id="${id}"]`);
  if (node) node.classList.add('active');
}

function buildCatalog(): void {
  const sidebar = $('#catalog');
  // Single assets load through the dev server only (/@fs), so the group is not offered in production.
  if (!import.meta.env.DEV) {
    $('#catalog-group').remove();
    return;
  }
  for (const game of CATALOG) {
    const group = el('div', 'cat-group');
    const h = el('div', 'cat-title');
    h.appendChild(el('span', 'cat-game', game.title));
    h.appendChild(el('span', 'cat-meta', `${game.platform} · ${game.format}`));
    group.appendChild(h);
    for (const asset of game.assets) {
      const item = el('div', 'cat-asset', asset.label);
      item.dataset.assetId = asset.id;
      item.addEventListener('click', () => {
        void loadCatalogAsset(asset.id);
        history.replaceState(null, '', `?asset=${asset.id}`);
      });
      group.appendChild(item);
    }
    sidebar.appendChild(group);
  }
}

// --- File picker / drag-and-drop -------------------------------------------

function setupFileInput(): void {
  const input = $('#file-input') as unknown as HTMLInputElement;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    decodeAndRender(new Uint8Array(buf), file.name);
    highlightCatalog('');
  });

  const drop = $('#drop-zone');
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('dragover');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
    }),
  );
  drop.addEventListener('drop', async (e) => {
    const dt = (e as DragEvent).dataTransfer;
    const file = dt?.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    decodeAndRender(new Uint8Array(buf), file.name);
    highlightCatalog('');
  });
  drop.addEventListener('click', () => input.click());
}

// --- Zoom control -----------------------------------------------------------

function setupZoom(): void {
  const zoomInput = $('#zoom') as unknown as HTMLInputElement;
  const zoomLabel = $('#zoom-label');
  const apply = () => {
    const z = Math.max(1, parseInt(zoomInput.value, 10) || 1);
    zoomLabel.textContent = `${z}×`;
    setZoom(z);
  };
  zoomInput.addEventListener('input', apply);
  apply();
}

// --- Whole-game picker ------------------------------------------------------

async function selectGame(id: string): Promise<number> {
  closeMajorViews();
  document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
  const node = document.querySelector(`[data-game-id="${id}"]`);
  if (node) node.classList.add('active');
  const count = await loadAndRenderGame(id);
  (window as unknown as { __rendered: number }).__rendered = count;
  return count;
}

function closeMajorViews(): void {
  closeDungeon3d();
  closeExplore();
  closeDqkExplore();
  closeTown();
}

/**
 * The title's real "Play"/"Demo" prompt (`titleMenu.ts`) — Play → the main game menu, Demo (hotkey
 * or idle timeout) → the attract sequence, which loops back to this same prompt on exit (matching
 * COAB's own title/demo loop, `docs/engine/research/cok-demo-decompile.md` §2.1).
 */
function bootTitleMenu(): void {
  startTitleMenu({
    onPlay: () => { void startMainMenu(); },
    onDemo: () => { void startDemo({ onExit: () => bootTitleMenu() }); },
  });
}

/**
 * Death Knights of Krynn's own title/demo loop — same Play/Demo prompt mechanism as CoK's
 * (`titleMenu.ts` is game-agnostic), but DoK has no bespoke main-menu/chargen flow built yet, so
 * Play drops straight into DoK's own dungeon (`explore.ts`'s existing `'dok'` profile) rather than
 * a party-formation screen.
 */
function bootDokTitleMenu(): void {
  startTitleMenu({
    title: 'Death Knights of Krynn',
    route: '?titlemenu=dok',
    onPlay: () => { void startExplore('dok'); },
    onDemo: () => { void startGen1Demo(DOK_DEMO_PROFILE, { route: '?demo=dok', onExit: () => bootDokTitleMenu() }); },
  });
}

/** Curse of the Azure Bonds' own title/demo loop — same shape as `bootDokTitleMenu`. */
function bootCoabTitleMenu(): void {
  startTitleMenu({
    title: 'Curse of the Azure Bonds',
    route: '?titlemenu=coab',
    onPlay: () => { void startExplore('coab'); },
    onDemo: () => { void startGen1Demo(COAB_DEMO_PROFILE, { route: '?demo=coab', onExit: () => bootCoabTitleMenu() }); },
  });
}

/** Secret of the Silver Blades' own title/demo loop — same shape as `bootDokTitleMenu`. */
function bootSecretTitleMenu(): void {
  startTitleMenu({
    title: 'Secret of the Silver Blades',
    route: '?titlemenu=secret',
    onPlay: () => { void startExplore('secret'); },
    onDemo: () => { void startGen1Demo(SECRET_DEMO_PROFILE, { route: '?demo=secret', onExit: () => bootSecretTitleMenu() }); },
  });
}

/** Gateway to the Savage Frontier's own title/demo loop — same shape as `bootDokTitleMenu`. */
function bootGatewayTitleMenu(): void {
  startTitleMenu({
    title: 'Gateway to the Savage Frontier',
    route: '?titlemenu=gateway',
    onPlay: () => { void startExplore('gateway'); },
    onDemo: () => { void startGen1Demo(GATEWAY_DEMO_PROFILE, { route: '?demo=gateway', onExit: () => bootGatewayTitleMenu() }); },
  });
}

/**
 * Pool of Radiance's own boot: title screens go straight into the dungeon, skipping
 * `titleMenu.ts` entirely — the original has no Play/Demo prompt at all (see `POOL_TITLE_PATH`'s
 * doc comment for the string-scan proof).
 */
function bootPoolAfterTitle(): void {
  void startExplore('pool');
}

/**
 * Neverwinter Nights (DOS/AOL)'s own boot: same shape as `bootPoolAfterTitle` — title screens go
 * straight into the dungeon, skipping `titleMenu.ts` entirely. `NWN_TITLE_PATH`'s doc comment has
 * the string-scan proof that GAME.OVR/GAME.EXE carry no Play/Demo prompt for this title (its
 * original AOL client was an online session, not a local attract-demo loop). Goes to the base
 * `nwn` explore profile (ECL0/GEO0 area), not `nwn-natural` (that route is reached only via
 * `?explore=nwn-natural` directly or the "walk any area" picker, same precedent as `dok-natural`/
 * `treasures-natural`, neither of which has a dedicated sidebar/intro entry point either).
 */
function bootNwnAfterTitle(): void {
  void startExplore('nwn');
}

/**
 * Treasures' retail title/demo loop. Native capture proved ECL1#4 is the real attract sequence;
 * the old failure was the wrong operand dialect, not a false-positive block.
 */
function bootTreasuresTitleMenu(): void {
  startTitleMenu({
    title: 'Treasures of the Savage Frontier',
    route: '?titlemenu=treasures',
    onPlay: () => { void startExplore('treasures'); },
    onDemo: () => { void startGen1Demo(TREASURES_DEMO_PROFILE, { route: '?demo=treasures', onExit: () => bootTreasuresTitleMenu() }); },
  });
}

/**
 * Pools of Darkness's own title/demo loop. Both halves are real: Demo is corroborated content
 * (`POOLS_DEMO_PROFILE` — narration, named NPCs, a clean exit, zero VM errors), and Play boots the
 * real dungeon (`GAME_DATA.pools`, `eclInitBlock: 18` — found via a bootability sweep and
 * corroborated by narration text matching independently-decoded GEO geometry, see
 * `docs/engine/research/pools-of-darkness-eclinit.md`).
 */
function bootPoolsTitleMenu(): void {
  startTitleMenu({
    title: 'Pools of Darkness',
    route: '?titlemenu=pools',
    onPlay: () => { void startExplore('pools'); },
    onDemo: () => { void startGen1Demo(POOLS_DEMO_PROFILE, { route: '?demo=pools', onExit: () => bootPoolsTitleMenu() }); },
  });
}

/**
 * The Dark Queen of Krynn's own title/prompt: `dqkTitleMenu.ts`'s "Play Demo Quit" chooser, not
 * the Gen1 `titleMenu.ts` (see that module's doc for why DQK needs its own). Play is proven to
 * lead into the real game entry (the DQK Gen2/HLIB dungeon, `dqkExplore.ts`); Demo plays the real
 * decoded attract script (`dqkDemo.ts`, `ECL.GLB` id 7 — see that module's doc for its two honest
 * content gaps) and loops back to this same prompt on exit, matching every other shipped title's
 * demo-loop convention; Quit closes back to the game picker.
 */
function bootDqkTitleMenu(): void {
  startDqkTitleMenu({
    onPlay: () => { void startDqkExplore(); },
    onDemo: () => { void startDqkDemo({ route: '?demo=dqk', onExit: () => bootDqkTitleMenu() }); },
    onQuit: () => {
      closeMajorViews();
      history.replaceState(null, '', '?');
      document.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
      const out = $('#output');
      if (out) out.innerHTML = '';
      setStatus('Select a game from the sidebar.');
    },
  });
}

// --- Sidebar groups ---------------------------------------------------------

/** Sidebar groups in series order (keys match the place() calls in buildGamePicker). */
const SIDEBAR_GROUPS: { key: string; title: string }[] = [
  { key: 'cok', title: 'Champions of Krynn' },
  { key: 'dok', title: 'Death Knights of Krynn' },
  { key: 'coab', title: 'Curse of the Azure Bonds' },
  { key: 'secret', title: 'Secret of the Silver Blades' },
  { key: 'pool', title: 'Pool of Radiance' },
  { key: 'pools', title: 'Pools of Darkness' },
  { key: 'gateway', title: 'Gateway to the Savage Frontier' },
  { key: 'treasures', title: 'Treasures of the Savage Frontier' },
  { key: 'dqk', title: 'The Dark Queen of Krynn' },
  { key: 'nwn', title: 'Neverwinter Nights (DOS/AOL)' },
  { key: 'buck', title: 'Buck Rogers: Countdown to Doomsday' },
  { key: 'frua', title: 'Unlimited Adventures (FRUA)' },
  { key: 'cokTools', title: 'Companion tools (mostly CoK)' },
  { key: 'restyle', title: 'AI restyle' },
];

function makeSidebarGroups(sidebar: HTMLElement): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  for (const g of SIDEBAR_GROUPS) {
    const d = document.createElement('details');
    d.className = 'sb-group';
    d.dataset.group = g.key;
    d.open = g.key === 'cok';
    const s = document.createElement('summary');
    s.className = 'sb-summary';
    s.textContent = g.title;
    d.appendChild(s);
    sidebar.appendChild(d);
    map.set(g.key, d);
  }
  return map;
}

/** Group of a manifest pick (GAME_IDS entry). Buck Rogers and FRUA get their own groups. */
function manifestGroup(id: string): string {
  if (id.startsWith('champions')) return 'cok';
  if (id.startsWith('death-knights')) return 'dok';
  if (id.startsWith('curse')) return 'coab';
  if (id.startsWith('secret')) return 'secret';
  if (id.startsWith('pools-')) return 'pools';
  if (id.startsWith('pool')) return 'pool';
  if (id.startsWith('gateway')) return 'gateway';
  if (id.startsWith('treasures')) return 'treasures';
  if (id.startsWith('dark-queen')) return 'dqk';
  if (id.startsWith('neverwinter')) return 'nwn';
  if (id.startsWith('buck-rogers')) return 'buck';
  return 'frua';
}

function buildGamePicker(): void {
  const sidebar = $('#games');
  if (!sidebar) return;

  // Operational support matrix (?support=1): first-stop overview of what the web and ASM/DOS tracks
  // currently support, what is only mapped, and what is still missing.
  const support = el('div', 'cat-asset game-pick explore-pick', 'Support matrix');
  support.addEventListener('click', () => {
    history.replaceState(null, '', `?support=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    support.classList.add('active');
    closeMajorViews();
    startSupportMatrix();
  });
  sidebar.appendChild(support);

  // Project documentation / status page (?docs=1) — plain HTML, not a game screen. Kept near the
  // top so a visitor can find "what is this / what works so far / how are the conversions going."
  const docs = el('div', 'cat-asset game-pick explore-pick', 'Project docs & status');
  docs.addEventListener('click', () => {
    history.replaceState(null, '', `?docs=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    docs.classList.add('active');
    closeMajorViews();
    startDocs();
  });
  sidebar.appendChild(docs);

  // Titles in series order, then tools, then the AI restyle pages. Items keep their labels, classes and
  // handlers; place() only chooses the <details> group. An unknown key falls back to the flat list.
  const groups = makeSidebarGroups(sidebar);
  const place = (node: HTMLElement, key: string): void => {
    (groups.get(key) ?? sidebar).appendChild(node);
  };

  // 3D dungeon view (?dungeon3d=<game>): the same GEO walls the 2D first-person view reads, as a 3D mesh.
  // The renderer is a lazily imported chunk; the entries below cost nothing until clicked.
  for (const t of DUNGEON3D_TITLES) {
    const item = el('div', 'cat-asset game-pick explore-pick', `3D dungeons - ${t.title}`);
    item.dataset.dungeon3d = t.id;
    item.title = `Read-only 3D view of ${t.title}'s dungeon maps (overland maps are not offered)`;
    item.addEventListener('click', () => {
      history.replaceState(null, '', `?dungeon3d=${t.id}`);
      document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
      item.classList.add('active');
      closeMajorViews();
      void startDungeon3dLazy(t.id);
    });
    place(item, t.id);
  }

  // Full flow (A6.3): the whole session stitched together — title → create → dungeon → save.
  const play = el('div', 'cat-asset game-pick explore-pick', '▶▶ Play Champions of Krynn (full)');
  play.addEventListener('click', () => {
    history.replaceState(null, '', `?play=cok`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    play.classList.add('active');
    closeMajorViews();
    startPlayRoute();
  });
  place(play, 'cok');

  // Title sequence (M4.S1): the original CoK boot screens, then into the dungeon.
  const intro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Champions of Krynn (intro)');
  intro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    intro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('1');
  });
  place(intro, 'cok');

  // Title sequence (Death Knights of Krynn): same real boot-screen method as CoK's own, generalized.
  const dokIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Death Knights of Krynn (intro)');
  dokIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=dok`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    dokIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('dok');
  });
  place(dokIntro, 'dok');

  // Title sequence (Curse of the Azure Bonds): same real boot-screen method, generalized.
  const coabIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Curse of the Azure Bonds (intro)');
  coabIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=coab`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    coabIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('coab');
  });
  place(coabIntro, 'coab');

  // Title sequence (Secret of the Silver Blades): same real boot-screen method, generalized.
  const secretIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Secret of the Silver Blades (intro)');
  secretIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=secret`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    secretIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('secret');
  });
  place(secretIntro, 'secret');

  // Title sequence (Gateway to the Savage Frontier): same real boot-screen method, generalized —
  // Gateway's own art is the VGA-extended codec (daxVgaPicture.ts), not plain EGA-16 like the rest.
  const gatewayIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Gateway to the Savage Frontier (intro)');
  gatewayIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=gateway`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    gatewayIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('gateway');
  });
  place(gatewayIntro, 'gateway');

  // Title sequence (Pool of Radiance): title-only — no Play/Demo prompt in the original (see
  // POOL_TITLE_PATH's doc comment), so onDone drops straight into the dungeon.
  const poolIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Pool of Radiance (intro)');
  poolIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=pool`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    poolIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('pool');
  });
  place(poolIntro, 'pool');

  // Title sequence (Treasures of the Savage Frontier): a third DAX picture codec (daxVga256Title.ts)
  // — Play boots the real dungeon route; Demo runs the native-capture-proven ECL1#4 sequence.
  const treasuresIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Treasures of the Savage Frontier (intro)');
  treasuresIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=treasures`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    treasuresIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('treasures');
  });
  place(treasuresIntro, 'treasures');

  // Title sequence (Pools of Darkness): same new codec as Treasures' own — Demo is real, corroborated
  // content; Play shows an honest gap (see bootPoolsTitleMenu's doc — no eclInitBlock proven yet).
  const poolsIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Pools of Darkness (intro)');
  poolsIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=pools`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    poolsIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('pools');
  });
  place(poolsIntro, 'pools');

  // Title sequence (Neverwinter Nights DOS/AOL): title-only, same shape as Pool of Radiance — a
  // GAME.OVR/GAME.EXE string scan found no Play/Demo prompt at all (see NWN_TITLE_PATH's doc
  // comment), consistent with its original AOL-hosted online-game model (no local attract demo).
  const nwnIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play Neverwinter Nights (DOS/AOL) (intro)');
  nwnIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=nwn`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    nwnIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('nwn');
  });
  place(nwnIntro, 'nwn');

  // Title sequence (The Dark Queen of Krynn): the Gen2/HLIB title art (mergePalettes-composited
  // credit screens, intro.ts's generalized HLIB path) + the real "Play Demo Quit" prompt
  // (dqkTitleMenu.ts) — the newest engine in the trilogy, distinct from the Gen1 titles above.
  const dqkIntro = el('div', 'cat-asset game-pick explore-pick', '▶ Play The Dark Queen of Krynn (intro)');
  dqkIntro.addEventListener('click', () => {
    history.replaceState(null, '', `?intro=dqk`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    dqkIntro.classList.add('active');
    closeMajorViews();
    void startIntroRoute('dqk');
  });
  place(dqkIntro, 'dqk');

  // Character creation (M2.S4d): build a CoK party the explore view fights with.
  const create = el('div', 'cat-asset game-pick explore-pick', '✦ Create party (CoK)');
  create.addEventListener('click', () => {
    history.replaceState(null, '', `?create=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    create.classList.add('active');
    closeMajorViews();
    startCreate();
  });
  place(create, 'cok');

  // Tactical combat screen (M4/CS.9): original CoK combat layout from real assets.
  const combat = el('div', 'cat-asset game-pick explore-pick', '⚔ CoK combat area (MVP)');
  combat.addEventListener('click', () => {
    history.replaceState(null, '', `?combat=mvp`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    combat.classList.add('active');
    closeMajorViews();
    void startCombatMvp('cok');
  });
  place(combat, 'cok');

  const secretCombat = el('div', 'cat-asset game-pick explore-pick', '⚔ Secret combat preview');
  secretCombat.addEventListener('click', () => {
    history.replaceState(null, '', `?combat=secret`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    secretCombat.classList.add('active');
    closeMajorViews();
    void startCombatMvp('secret');
  });
  place(secretCombat, 'secret');

  const poolCombat = el('div', 'cat-asset game-pick explore-pick', '⚔ Pool combat preview');
  poolCombat.addEventListener('click', () => {
    history.replaceState(null, '', `?combat=pool`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    poolCombat.classList.add('active');
    void startCombatMvp('pool');
  });
  place(poolCombat, 'pool');

  const coabCombat = el('div', 'cat-asset game-pick explore-pick', '⚔ CoAB combat preview');
  coabCombat.addEventListener('click', () => {
    history.replaceState(null, '', `?combat=coab`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    coabCombat.classList.add('active');
    void startCombatMvp('coab');
  });
  place(coabCombat, 'coab');

  const dqkCombat = el('div', 'cat-asset game-pick explore-pick', '⚔ DQK combat terrain preview');
  dqkCombat.addEventListener('click', () => {
    history.replaceState(null, '', `?combat=dqk`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    dqkCombat.classList.add('active');
    closeMajorViews();
    void startCombatDqkPreview();
  });
  place(dqkCombat, 'dqk');

  // Overland travel (A5.1): walk the party across a top-down regional map (time + encounters).
  const wild = el('div', 'cat-asset game-pick explore-pick', '⛰ Wilderness travel (CoK)');
  wild.addEventListener('click', () => {
    history.replaceState(null, '', `?wild=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    wild.classList.add('active');
    closeMajorViews();
    void startWilderness();
  });
  place(wild, 'cokTools');

  // Town hub (A5.2): shop / temple / training hall / tavern, against the live party economy.
  const town = el('div', 'cat-asset game-pick explore-pick', '🏠 Town hub (CoK)');
  town.addEventListener('click', () => {
    history.replaceState(null, '', `?town=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    town.classList.add('active');
    closeMajorViews();
    void startTown();
  });
  place(town, 'cokTools');

  // NPC dialogue (A5.3): a branching ECL-driven conversation through the engine DialogueRunner.
  const dialogue = el('div', 'cat-asset game-pick explore-pick', '💬 Talk to an NPC (CoK)');
  dialogue.addEventListener('click', () => {
    history.replaceState(null, '', `?dialogue=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    dialogue.classList.add('active');
    closeMajorViews();
    void startDialogue();
  });
  place(dialogue, 'cokTools');

  // Adventurer's Journal (A5.4): the recorded-entries log, read from a bordered screen.
  const journal = el('div', 'cat-asset game-pick explore-pick', '📖 Adventurer\'s Journal (CoK)');
  journal.addEventListener('click', () => {
    history.replaceState(null, '', `?journal=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    journal.classList.add('active');
    closeMajorViews();
    void startJournal();
  });
  place(journal, 'cokTools');

  // HUD companion panel (D2): always-available read-only party HP/XP/AC/class/condition glance.
  const hud = el('div', 'cat-asset game-pick explore-pick', '🛡 Party panel (HP/XP)');
  hud.addEventListener('click', () => {
    history.replaceState(null, '', `?hud=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    hud.classList.add('active');
    closeMajorViews();
    void startHud();
  });
  place(hud, 'cokTools');

  // Automap panel (D1): a persistent, full-screen map of the discovered dungeon level + pinned notes.
  const automap = el('div', 'cat-asset game-pick explore-pick', '🗺 Automap (CoK)');
  automap.addEventListener('click', () => {
    history.replaceState(null, '', `?automap=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    automap.classList.add('active');
    closeMajorViews();
    void startAutomap();
  });
  place(automap, 'cokTools');

  // Main game menu (CoK boot): the original party-formation / startup menu (intro → menu → adventure).
  const mainmenu = el('div', 'cat-asset game-pick explore-pick', '☰ CoK main menu (party / Begin)');
  mainmenu.addEventListener('click', () => {
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    mainmenu.classList.add('active');
    closeMajorViews();
    void startMainMenu();
  });
  place(mainmenu, 'cok');

  // Attract demo (CoK boot): the title's "Play Demo" — the engine auto-walks the real dungeon.
  const demo = el('div', 'cat-asset game-pick explore-pick', '▷ Play Demo (CoK attract)');
  demo.addEventListener('click', () => {
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    demo.classList.add('active');
    closeMajorViews();
    void startDemo();
  });
  place(demo, 'cok');

  // Attract demo (DoK boot): DoK's own real ECL1.DAX block 2 attract script.
  const dokDemo = el('div', 'cat-asset game-pick explore-pick', '▷ Play Demo (DoK attract)');
  dokDemo.addEventListener('click', () => {
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    dokDemo.classList.add('active');
    closeMajorViews();
    void startGen1Demo(DOK_DEMO_PROFILE);
  });
  place(dokDemo, 'dok');

  // Attract demo (CoAB boot): CoAB's own real ECL1.DAX block 82 attract script.
  const coabDemo = el('div', 'cat-asset game-pick explore-pick', '▷ Play Demo (CoAB attract)');
  coabDemo.addEventListener('click', () => {
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    coabDemo.classList.add('active');
    closeMajorViews();
    void startGen1Demo(COAB_DEMO_PROFILE);
  });
  place(coabDemo, 'coab');

  // Attract demo (Secret boot): Secret's own real ECL1.DAX block 3 attract script.
  const secretDemo = el('div', 'cat-asset game-pick explore-pick', '▷ Play Demo (Secret attract)');
  secretDemo.addEventListener('click', () => {
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    secretDemo.classList.add('active');
    closeMajorViews();
    void startGen1Demo(SECRET_DEMO_PROFILE);
  });
  place(secretDemo, 'secret');

  // Attract demo (Gateway boot): Gateway's own real ECL2.DAX block 82 attract script — narration
  // and combat only (its picture ids fall in the still-unsolved 'complex' portrait codec).
  const gatewayDemo = el('div', 'cat-asset game-pick explore-pick', '▷ Play Demo (Gateway attract)');
  gatewayDemo.addEventListener('click', () => {
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    gatewayDemo.classList.add('active');
    closeMajorViews();
    void startGen1Demo(GATEWAY_DEMO_PROFILE);
  });
  place(gatewayDemo, 'gateway');

  // Character/Save editor (D3): read + write an original CoK CHRDATA save (the .CCH 409-byte record).
  const chared = el('div', 'cat-asset game-pick explore-pick', '✎ Character editor (CoK save)');
  chared.addEventListener('click', () => {
    history.replaceState(null, '', `?chared=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    chared.classList.add('active');
    closeMajorViews();
    void startCharEditor('cok');
  });
  place(chared, 'cokTools');

  // DoK save viewer (M13): read-only view of a real CHRDATA{n}.GAM/.JNK/.EFF quad.
  const charedDok = el('div', 'cat-asset game-pick explore-pick', '👁 Save viewer (DoK save)');
  charedDok.addEventListener('click', () => {
    history.replaceState(null, '', `?chared=dok`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    charedDok.classList.add('active');
    closeMajorViews();
    void startCharEditor('dok');
  });
  place(charedDok, 'dok');

  // ECL inspector (D4): live single-stepper over real CoK ECL bytecode (disassembly + flags).
  const eclInsp = el('div', 'cat-asset game-pick explore-pick', '⌬ ECL inspector (CoK script VM)');
  eclInsp.addEventListener('click', () => {
    history.replaceState(null, '', `?ecl=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    eclInsp.classList.add('active');
    closeMajorViews();
    void startEclInspector();
  });
  place(eclInsp, 'cokTools');

  // Reference DB (D5): monster/item/spell cyclopedia from the game's own decoded tables.
  const refdb = el('div', 'cat-asset game-pick explore-pick', '📖 Reference DB (monsters/items/spells)');
  refdb.addEventListener('click', () => {
    history.replaceState(null, '', `?refdb=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    refdb.classList.add('active');
    closeMajorViews();
    void startReferenceDb();
  });
  place(refdb, 'cokTools');

  // Walkable dungeon (M1.S5): real CoK GEO map + Explorer, top-down automap.
  const explore = el('div', 'cat-asset game-pick explore-pick', '▶ Explore CoK dungeon (walk)');
  explore.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    explore.classList.add('active');
    closeMajorViews();
    void startExplore();
  });
  place(explore, 'cok');

  // Death Knights of Krynn dungeon (Phase B, B1): the same Gen1 DAX load path, DoK's own data.
  const exploreDok = el('div', 'cat-asset game-pick explore-pick', '▶ Explore DoK dungeon (walk)');
  exploreDok.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=dok`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    exploreDok.classList.add('active');
    closeMajorViews();
    void startExplore('dok');
  });
  place(exploreDok, 'dok');

  // Secret of the Silver Blades dungeon: Gen1 DAX data with a TPOV-mapped executable sidecar.
  const exploreSecret = el('div', 'cat-asset game-pick explore-pick', '▶ Explore Secret dungeon (walk)');
  exploreSecret.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=secret`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    exploreSecret.classList.add('active');
    closeMajorViews();
    void startExplore('secret');
  });
  place(exploreSecret, 'secret');

  const explorePool = el('div', 'cat-asset game-pick explore-pick', '▶ Explore Pool dungeon (walk)');
  explorePool.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=pool`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    explorePool.classList.add('active');
    void startExplore('pool');
  });
  place(explorePool, 'pool');

  const exploreCoab = el('div', 'cat-asset game-pick explore-pick', '▶ Explore CoAB dungeon (walk)');
  exploreCoab.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=coab`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    exploreCoab.classList.add('active');
    void startExplore('coab');
  });
  place(exploreCoab, 'coab');

  const exploreGateway = el('div', 'cat-asset game-pick explore-pick', '▶ Explore Gateway dungeon (walk)');
  exploreGateway.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=gateway`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    exploreGateway.classList.add('active');
    void startExplore('gateway');
  });
  place(exploreGateway, 'gateway');

  // Treasures of the Savage Frontier dungeon: same Gen1 DAX pipeline, no prior curated route — a
  // brand-new page (the base game had no `explore=` entry before the "walk any area" picker landed).
  const exploreTreasures = el('div', 'cat-asset game-pick explore-pick', '▶ Explore Treasures dungeon (walk)');
  exploreTreasures.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=treasures`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    exploreTreasures.classList.add('active');
    void startExplore('treasures');
  });
  place(exploreTreasures, 'treasures');

  // The Dark Queen of Krynn dungeon (Phase C, C1): the Gen2 HLIB GEO library — a different container
  // generation (the newest Gold Box engine). Decodes the 20 variable-size maps and walks them.
  const exploreDqk = el('div', 'cat-asset game-pick explore-pick', '▶ Explore DQK dungeon (Gen2/HLIB)');
  exploreDqk.addEventListener('click', () => {
    history.replaceState(null, '', `?dqk=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    exploreDqk.classList.add('active');
    closeMajorViews();
    void startDqkExplore();
  });
  place(exploreDqk, 'dqk');

  // Neverwinter Nights (DOS/AOL) dungeon: promoted from the `?nwn=1` preview below via a dedicated
  // eclInitBlock bootability sweep (docs/engine/research/neverwinter-nights-dos-eclinit.md) — the
  // same "walk any area" precedent as Treasures/Pools. `GameData.nwn`'s `eclInitBlock: 1` boots the
  // game's own real opening scene ("WELCOME TO NEVERWINTER!").
  const exploreNwn = el('div', 'cat-asset game-pick explore-pick', '▶ Explore Neverwinter Nights dungeon (walk)');
  exploreNwn.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=nwn`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    exploreNwn.classList.add('active');
    void startExplore('nwn');
  });
  place(exploreNwn, 'nwn');

  // Neverwinter Nights (DOS/AOL): visible browser-side extraction preview. This is not a finished
  // play client yet, but it shows the real decoded NWN graphics and map/script/data probes from the
  // user's extracted D:\Games archive instead of hiding the work in a manifest entry.
  const nwn = el('div', 'cat-asset game-pick explore-pick', '▶ Preview Neverwinter Nights (DOS/AOL)');
  nwn.addEventListener('click', () => {
    history.replaceState(null, '', `?nwn=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    nwn.classList.add('active');
    closeMajorViews();
    void startNwnPreview();
  });
  place(nwn, 'nwn');

  // Import a CoK save party and carry it into Death Knights of Krynn (Phase B, B3 — the series feature).
  const importEntry = el('div', 'cat-asset game-pick explore-pick', '⇪ Import CoK party → DoK');
  importEntry.addEventListener('click', () => {
    history.replaceState(null, '', `?import=cok`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    importEntry.classList.add('active');
    closeMajorViews();
    void startImport();
  });
  place(importEntry, 'cok');

  // Import a DoK save party and carry it into Dark Queen of Krynn (M14 — closes the trilogy's
  // series-feature chain: CoK→DoK already shipped as B3; this is the DoK→DQK hop).
  const importDokEntry = el('div', 'cat-asset game-pick explore-pick', '⇪ Import DoK party → DQK');
  importDokEntry.addEventListener('click', () => {
    history.replaceState(null, '', `?import=dok`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    importDokEntry.classList.add('active');
    closeMajorViews();
    void startImportDok();
  });
  place(importDokEntry, 'dqk');

  // R2 — import DQK's OWN saved-game party (`SAVGAMA.QSV`'s six pre-generated heroes) directly into
  // the DQK explorer, replacing the hand-authored "Heroes of the Lance" tech-demo roster.
  const importDqkEntry = el('div', 'cat-asset game-pick explore-pick', '⇪ Import DQK save party');
  importDqkEntry.addEventListener('click', () => {
    history.replaceState(null, '', `?import=dqk`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    importDqkEntry.classList.add('active');
    closeMajorViews();
    void startImportDqk();
  });
  place(importDqkEntry, 'dqk');

  // R2 — import Curse of the Azure Bonds' own six pregen CHRDATA*.SAV heroes.
  const importCoabEntry = el('div', 'cat-asset game-pick explore-pick', '⇪ Import CoAB pregens');
  importCoabEntry.addEventListener('click', () => {
    history.replaceState(null, '', `?import=coab`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    importCoabEntry.classList.add('active');
    closeMajorViews();
    void startImportCoab();
  });
  place(importCoabEntry, 'coab');

  // Live EGA↔Amiga switch (M3.S2): the headline best-of-art feature on CoK BIGPIC scenes.
  const gswitch = el('div', 'cat-asset game-pick explore-pick', '⇄ EGA ↔ Amiga (CoK BIGPIC)');
  gswitch.addEventListener('click', () => {
    history.replaceState(null, '', `?gswitch=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    gswitch.classList.add('active');
    closeMajorViews();
    void startGraphicSwitch('cok');
  });
  place(gswitch, 'cok');

  // DoK best-of-art switch (Phase B, B4): the same live EGA↔Amiga toggle on Death Knights' BIGPIC.
  const gswitchDok = el('div', 'cat-asset game-pick explore-pick', '⇄ EGA ↔ Amiga (DoK BIGPIC)');
  gswitchDok.addEventListener('click', () => {
    history.replaceState(null, '', `?gswitch=dok`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    gswitchDok.classList.add('active');
    closeMajorViews();
    void startGraphicSwitch('dok');
  });
  place(gswitchDok, 'dok');

  // M8.S3 — the Amiga art assignment editor for Gap G5's shape-mismatch DQK targets.
  const artmap = el('div', 'cat-asset game-pick explore-pick', '⊞ Art mapping editor (Amiga → DQK)');
  artmap.addEventListener('click', () => {
    history.replaceState(null, '', `?artmap=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    artmap.classList.add('active');
    closeMajorViews();
    void startArtMap();
  });
  place(artmap, 'dqk');

  const audio = el('div', 'cat-asset game-pick explore-pick', '♪ Music & sound (DOS ↔ Amiga)');
  audio.addEventListener('click', () => {
    history.replaceState(null, '', `?audio=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    audio.classList.add('active');
    closeMajorViews();
    void startAudio();
  });
  place(audio, 'cokTools');

  const menus = el('div', 'cat-asset game-pick explore-pick', '▤ CoK command menus (preview)');
  menus.addEventListener('click', () => {
    history.replaceState(null, '', `?menus=1`);
    document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
    menus.classList.add('active');
    closeMajorViews();
    void startMenus();
  });
  place(menus, 'cok');

  for (const g of GAME_IDS) {
    const item = el('div', 'cat-asset game-pick', g.label);
    item.dataset.gameId = g.id;
    item.addEventListener('click', () => {
      history.replaceState(null, '', `?game=${g.id}`);
      void selectGame(g.id);
    });
    place(item, manifestGroup(g.id));
  }

  // AI restyle pages: plain links, since they are separate pages rather than game views.
  for (const [label, href] of [
    ['Game graphics · IDs and versions', '?graphics=1'],
    ['Restyle before / after', '?restyle=1'],
    ['Animations (hub method)', './restyle/animations.html'],
  ] as const) {
    const a = document.createElement('a');
    a.className = 'cat-asset';
    a.textContent = label;
    a.href = href;
    place(a, 'restyle');
  }

  for (const d of groups.values()) if (!d.querySelector('.cat-asset')) d.remove();
}

// --- Library ----------------------------------------------------------------

// Maps a detected (game, platform) to an existing demo manifest where one exists.
// Variants without a manifest yet (e.g. Champions of Krynn DOS = M1 work) fall
// through to a status note so the Library still lists them as detected.
const DETECTED_TO_MANIFEST: Record<string, string> = {
  'champions-of-krynn/DOS': 'champions-dos',
  'champions-of-krynn/Amiga': 'champions-amiga',
  'death-knights-of-krynn/Amiga': 'death-knights-amiga',
  'dark-queen-of-krynn/DOS': 'dark-queen-dos',
  'pool-of-radiance/DOS': 'pool-of-radiance',
  'curse-of-the-azure-bonds/DOS': 'curse-of-the-azure-bonds',
  'gateway-to-the-savage-frontier/DOS': 'gateway-to-the-savage-frontier',
  'neverwinter-nights-dos/DOS': 'neverwinter-nights-dos',
  'secret-of-the-silver-blades/DOS': 'secret-of-the-silver-blades',
  'death-knights-of-krynn/DOS': 'death-knights-dos',
  'pools-of-darkness/DOS': 'pools-of-darkness',
  'treasures-of-the-savage-frontier/DOS': 'treasures-of-the-savage-frontier',
  'buck-rogers-countdown-to-doomsday/DOS': 'buck-rogers-countdown-to-doomsday',
  'buck-rogers-countdown-to-doomsday/Amiga': 'buck-rogers-amiga',
  'buck-rogers-matrix-cubed/DOS': 'buck-rogers-matrix-cubed',
  'forgotten-realms-unlimited-adventures/DOS': 'forgotten-realms-unlimited-adventures',
};

type GameLibraryEntry = Extract<LibraryEntry, { kind: 'game' }>;
interface IntroRouteSpec {
  profileId: string;
  titlePath: string;
  assetRelativePaths: string[];
  displayName: string;
  audioGame: AudioGameId;
  onDone: () => void;
}
const INTRO_ROUTES: Record<string, IntroRouteSpec> = {
  '1': { profileId: 'champions-of-krynn', titlePath: 'Champions of Krynn/TITLE.DAX',
    assetRelativePaths: ['Champions of Krynn/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Champions of Krynn', audioGame: 'cok', onDone: bootTitleMenu },
  dok: { profileId: 'death-knights-of-krynn', titlePath: DOK_TITLE_PATH,
    assetRelativePaths: ['Death Knights of Krynn/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Death Knights of Krynn', audioGame: 'dok', onDone: bootDokTitleMenu },
  coab: { profileId: 'curse-of-the-azure-bonds', titlePath: COAB_TITLE_PATH,
    assetRelativePaths: ['Curse of the Azure Bonds/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Curse of the Azure Bonds', audioGame: 'coab', onDone: bootCoabTitleMenu },
  secret: { profileId: 'secret-of-the-silver-blades', titlePath: SECRET_TITLE_PATH,
    assetRelativePaths: ['Secret of the Silver Blades/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Secret of the Silver Blades', audioGame: 'secret', onDone: bootSecretTitleMenu },
  gateway: { profileId: 'gateway-to-the-savage-frontier', titlePath: GATEWAY_TITLE_PATH,
    assetRelativePaths: ['Gateway to the Savage Frontier/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Gateway to the Savage Frontier', audioGame: 'gateway', onDone: bootGatewayTitleMenu },
  pool: { profileId: 'pool-of-radiance', titlePath: POOL_TITLE_PATH,
    assetRelativePaths: ['Pool of Radiance/POOLRAD/TITLE.DAX', 'POOLRAD/TITLE.DAX'],
    displayName: 'Pool of Radiance', audioGame: 'pool', onDone: bootPoolAfterTitle },
  dqk: { profileId: 'dark-queen-of-krynn', titlePath: DQK_TITLE_PATH,
    assetRelativePaths: ['The Dark Queen of Krynn/DISK1/TITLE.TLB', 'DISK1/TITLE.TLB'],
    displayName: 'The Dark Queen of Krynn', audioGame: 'dqk', onDone: bootDqkTitleMenu },
  treasures: { profileId: 'treasures-of-the-savage-frontier', titlePath: TREASURES_TITLE_PATH,
    assetRelativePaths: ['Treasures of the Savage Frontier/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Treasures of the Savage Frontier', audioGame: 'treasures', onDone: bootTreasuresTitleMenu },
  pools: { profileId: 'pools-of-darkness', titlePath: POOLS_TITLE_PATH,
    assetRelativePaths: ['Pools of Darkness/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Pools of Darkness', audioGame: 'pools', onDone: bootPoolsTitleMenu },
  nwn: { profileId: 'neverwinter-nights-dos', titlePath: NWN_TITLE_PATH,
    assetRelativePaths: ['neverwinter-nights/neverwint/TITLE.DAX', 'TITLE.DAX'],
    displayName: 'Neverwinter Nights (DOS/AOL)', audioGame: 'nwn', onDone: bootNwnAfterTitle },
};
let pendingIntroRoute: string | null = null;
let pendingPlayRoute = false;
let pendingCokDemoRoute = false;
let selectedGameEntry: GameLibraryEntry | null = null;

function isCokDosEntry(entry: GameLibraryEntry | null | undefined): entry is GameLibraryEntry {
  return !!entry && resolveCokPlayInstall([entry], entry).status === 'selected';
}

/** Start only from a matching CoK install; never borrow whichever unrelated Library entry was last selected. */
function startPlayRoute(selected?: GameLibraryEntry): void {
  const resolved = resolveCokPlayInstall(getLibrary(), selected ?? selectedGameEntry);
  if (resolved.status === 'missing' && import.meta.env.DEV) {
    pendingPlayRoute = false;
    void startPlay();
    return;
  }
  if (!resolved.entry) {
    pendingPlayRoute = true;
    setStatus(resolved.status === 'ambiguous'
      ? 'Select the DOS Champions of Krynn folder in Game Library to choose which install starts Play.'
      : 'Select a DOS Champions of Krynn folder in Game Library to start Play.');
    return;
  }
  pendingPlayRoute = false;
  void startPlay(resolved.entry.assetSource);
}

/** Run CoK's attract demo from the selected Library install in production. */
function startCokDemoRoute(selected?: GameLibraryEntry): void {
  const resolved = resolveCokPlayInstall(getLibrary(), selected ?? selectedGameEntry);
  if (resolved.status === 'missing' && import.meta.env.DEV) {
    pendingCokDemoRoute = false;
    void startDemo();
    return;
  }
  if (!resolved.entry) {
    pendingCokDemoRoute = true;
    setStatus(resolved.status === 'ambiguous'
      ? 'Select the DOS Champions of Krynn folder in Game Library to choose which install supplies the demo.'
      : 'Select a DOS Champions of Krynn folder in Game Library to run the demo from your own files.');
    return;
  }
  pendingCokDemoRoute = false;
  void startDemo({ assetSource: resolved.entry.assetSource });
}

function isStandaloneCokDemoRoute(): boolean {
  const value = new URLSearchParams(location.search).get('demo');
  return value === null || value === '' || value === '1';
}

function introSpec(route: string): IntroRouteSpec {
  return INTRO_ROUTES[route] ?? INTRO_ROUTES['1']!;
}

/** Load the title archive from the selected Library install; production never fetches game data. */
function startIntroRoute(route: string, selected?: GameLibraryEntry): void {
  const key = Object.hasOwn(INTRO_ROUTES, route) ? route : '1';
  const spec = introSpec(key);
  pendingIntroRoute = key;
  const selectedMatch = (entry: GameLibraryEntry | null | undefined) => entry
    && entry.match.profileId === spec.profileId && entry.match.platform === 'DOS';
  const matches = selectedMatch(selected) ? [selected!]
    : selectedMatch(selectedGameEntry) ? [selectedGameEntry!]
      : getLibrary().filter((entry): entry is GameLibraryEntry => entry.kind === 'game'
        && entry.match.profileId === spec.profileId && entry.match.platform === 'DOS');
  if (matches.length > 1 && !selectedMatch(selected)) {
    setStatus(`Select the ${spec.displayName} folder in Game Library to choose which install supplies its title screens.`);
    return;
  }
  const entry = matches[0];
  if (entry) pendingIntroRoute = null;
  void startIntro(spec.onDone, {
    titlePath: spec.titlePath,
    assetRelativePaths: spec.assetRelativePaths,
    displayName: spec.displayName,
    audioGame: spec.audioGame,
    ...(entry ? { assetSource: entry.assetSource } : {}),
  });
}

/**
 * "3D view" button for a Library route panel: opens `?dungeon3d=<title>` over the picked folder's files.
 * It is a VIEWER, not a source-backed play route, so it carries `data-view` and deliberately NOT
 * `data-route`: the route chooser's contract (`button[data-route]` = the routes that start a session,
 * pinned by the library-dok-save-handoff e2e case) stays exactly the play/import routes.
 */
function libraryDungeon3dButton(titleId: string, entry: Extract<LibraryEntry, { kind: 'game' }>): HTMLButtonElement {
  const b = el('button', 'gb-btn', '3D dungeon view') as HTMLButtonElement;
  b.type = 'button';
  b.dataset.view = `dungeon3d-${titleId}`;
  b.title = "Read-only 3D view of this title's dungeon maps (overland maps are not offered)";
  b.addEventListener('click', () => {
    history.replaceState(null, '', `?dungeon3d=${titleId}`);
    void startDungeon3dLazy(titleId, null, entry.assetSource);
  });
  return b;
}

/**
 * A selected Secret install has two source-backed entry points.  Keep its normal
 * ECL1#34 explorer entry available, but expose the independently verified
 * ECL3#97 Hydra route rather than silently replacing the game's ordinary start
 * with an evidence checkpoint.  Both choices retain the same Library AssetSource.
 */
function showSecretLibraryRoutes(entry: Extract<LibraryEntry, { kind: 'game' }>): void {
  const out = $('#output');
  out.innerHTML = '';
  const panel = el('section', 'sheet-panel');
  panel.appendChild(el('h2', '', 'Secret of the Silver Blades'));
  panel.appendChild(el('p', 'muted', `Using the selected folder “${entry.folderName}”. Choose a retail-byte route.`));
  const standard = el('button', 'gb-btn', 'Explore opening area') as HTMLButtonElement;
  standard.type = 'button';
  standard.addEventListener('click', () => {
    history.replaceState(null, '', '?explore=secret');
    void startExplore('secret', entry.assetSource);
  });
  const hydra = el('button', 'gb-btn', 'Verified Hydra encounter') as HTMLButtonElement;
  hydra.type = 'button';
  hydra.addEventListener('click', () => {
    history.replaceState(null, '', '?explore=secret-natural');
    void startExplore('secret-natural', entry.assetSource);
  });
  panel.append(standard, hydra);
  panel.appendChild(libraryDungeon3dButton('secret', entry));
  out.appendChild(panel);
  setStatus('Secret of the Silver Blades selected from your folder.');
}

/**
 * Keep CoAB's ordinary ECL2 explorer available while exposing the existing byte-proven
 * ECL4#37 natural encounter as an explicit release-contract route. Both choices retain the
 * selected folder's AssetSource; this does not imply a continuous browser quest journey.
 */
function showCoabLibraryRoutes(entry: Extract<LibraryEntry, { kind: 'game' }>): void {
  const out = $('#output');
  out.innerHTML = '';
  const panel = el('section', 'sheet-panel');
  panel.appendChild(el('h2', '', 'Curse of the Azure Bonds'));
  panel.appendChild(el('p', 'muted', `Using the selected folder “${entry.folderName}”. Choose a retail-byte route.`));
  const standard = el('button', 'gb-btn', 'Explore opening area') as HTMLButtonElement;
  standard.type = 'button';
  standard.addEventListener('click', () => {
    history.replaceState(null, '', '?explore=coab');
    void startExplore('coab', entry.assetSource);
  });
  const encounter = el('button', 'gb-btn', 'Verified Medusa/Griffon encounter') as HTMLButtonElement;
  encounter.type = 'button';
  encounter.addEventListener('click', () => {
    history.replaceState(null, '', '?explore=coab-natural');
    void startExplore('coab-natural', entry.assetSource);
  });
  panel.append(standard, encounter);
  panel.appendChild(libraryDungeon3dButton('coab', entry));
  out.appendChild(panel);
  setStatus('Curse of the Azure Bonds selected from your folder.');
}

/**
 * A selected DOS DoK install is both a playable source and the source of the trilogy's DoK -> DQK
 * party handoff. Keep those actions explicit and close both over the same Library AssetSource. The
 * imported roster survives Continue, but DQK deliberately boots without this DoK source.
 */
function showDokLibraryRoutes(entry: Extract<LibraryEntry, { kind: 'game' }>): void {
  const out = $('#output');
  out.innerHTML = '';
  const panel = el('section', 'sheet-panel');
  panel.appendChild(el('h2', '', 'Death Knights of Krynn'));
  panel.appendChild(el('p', 'muted', `Using the selected folder “${entry.folderName}”. Choose a source-backed action.`));
  const explore = el('button', 'gb-btn', 'Explore Death Knights of Krynn') as HTMLButtonElement;
  explore.type = 'button';
  explore.dataset.route = 'dok';
  explore.addEventListener('click', () => {
    history.replaceState(null, '', '?explore=dok');
    void startExplore('dok', entry.assetSource);
  });
  const importSave = el('button', 'gb-btn', 'Import selected save party → DQK') as HTMLButtonElement;
  importSave.type = 'button';
  importSave.dataset.route = 'dok-import';
  importSave.addEventListener('click', () => {
    history.replaceState(null, '', '?import=dok');
    void startImportDok(entry.assetSource);
  });
  panel.append(explore, importSave);
  panel.appendChild(libraryDungeon3dButton('dok', entry));
  out.appendChild(panel);
  setStatus('Death Knights of Krynn selected from your folder.');
}

/**
 * Keep Treasures' ordinary explorer available while exposing its completed two-wave persistent
 * route. Both choices close over the selected folder's AssetSource; Persistent is the honest
 * support tier until a wider six-leg campaign contract exists.
 */
function showTreasuresLibraryRoutes(entry: Extract<LibraryEntry, { kind: 'game' }>): void {
  const out = $('#output');
  out.innerHTML = '';
  const panel = el('section', 'sheet-panel');
  panel.appendChild(el('h2', '', 'Treasures of the Savage Frontier'));
  panel.appendChild(el('p', 'muted', `Using the selected folder “${entry.folderName}”. Choose a source-backed route.`));
  const standard = el('button', 'gb-btn', 'Explore available area (ECL1 #20)') as HTMLButtonElement;
  standard.type = 'button';
  standard.dataset.route = 'treasures';
  standard.addEventListener('click', () => {
    history.replaceState(null, '', '?explore=treasures');
    void startExplore('treasures', entry.assetSource);
  });
  const persistent = el('button', 'gb-btn', 'Persistent two-wave Yeti route') as HTMLButtonElement;
  persistent.type = 'button';
  persistent.dataset.route = 'treasures-natural';
  persistent.addEventListener('click', () => {
    history.replaceState(null, '', '?explore=treasures-natural');
    void startExplore('treasures-natural', entry.assetSource);
  });
  panel.append(standard, persistent);
  panel.appendChild(libraryDungeon3dButton('treasures', entry));
  out.appendChild(panel);
  setStatus('Treasures of the Savage Frontier selected from your folder.');
}

function onLibrarySelect(entry: LibraryEntry): void {
  closeMajorViews();
  selectedGameEntry = entry.kind === 'game' ? entry : null;
  if (pendingCokDemoRoute || isStandaloneCokDemoRoute()) {
    if (entry.kind === 'game' && isCokDosEntry(entry)) startCokDemoRoute(entry);
    else {
      pendingCokDemoRoute = true;
      setStatus('The CoK demo is waiting for a DOS Champions of Krynn folder. Select the matching install in Game Library.');
    }
    return;
  }
  if (pendingPlayRoute || new URLSearchParams(location.search).get('play') === 'cok') {
    if (entry.kind === 'game' && isCokDosEntry(entry)) {
      pendingPlayRoute = false;
      void startPlay(entry.assetSource);
    } else {
      pendingPlayRoute = true;
      setStatus('Full CoK Play is waiting for a DOS Champions of Krynn folder. Select the matching install in Game Library.');
    }
    return;
  }
  if (pendingIntroRoute !== null) {
    const route = pendingIntroRoute;
    const spec = introSpec(route);
    if (entry.kind === 'game' && entry.match.profileId === spec.profileId && entry.match.platform === 'DOS') {
      pendingIntroRoute = null;
      startIntroRoute(route, entry);
    } else {
      setStatus(`Title screens are waiting for a DOS ${spec.displayName} folder. Select the matching install in Game Library.`);
    }
    return;
  }
  // An imported authored module (M11.S3) is a first-class, distinct Library entry kind — no
  // profileId/platform to route on, just a whole ModulePackage ready for the real play path.
  if (entry.kind === 'module') {
    history.replaceState(null, '', `?module=1`);
    startModuleExplore(entry.pkg, entry.entryPointId ?? 0, {
      ...(entry.packageSha256 ? { artifactId: entry.packageSha256 } : {}),
      ...(entry.bestiarySource ? { monsterSource: entry.bestiarySource } : {}),
      ...(entry.itemSource ? { itemSource: entry.itemSource } : {}),
    });
    return;
  }

  if (entry.match.profileId === 'secret-of-the-silver-blades' && entry.match.platform === 'DOS') {
    showSecretLibraryRoutes(entry);
    return;
  }

  if (entry.match.profileId === 'curse-of-the-azure-bonds' && entry.match.platform === 'DOS') {
    showCoabLibraryRoutes(entry);
    return;
  }

  if (entry.match.profileId === 'death-knights-of-krynn' && entry.match.platform === 'DOS') {
    showDokLibraryRoutes(entry);
    return;
  }

  if (entry.match.profileId === 'treasures-of-the-savage-frontier' && entry.match.platform === 'DOS') {
    showTreasuresLibraryRoutes(entry);
    return;
  }

  // A DOS Krynn-Gen1 game we can actually PLAY (CoK / DoK) boots straight into its dungeon — this is
  // the "boot from the Library" path (B1 for Death Knights of Krynn). The DAX/GEO/ECL load path is
  // shared; only the asset folder + ECL init block differ (see gameData.ts).
  const playableId: GameId | null = gameIdForProfile(entry.match.profileId);
  if (playableId && entry.match.platform === 'DOS') {
    history.replaceState(null, '', `?explore=${playableId}`);
    void startExplore(playableId, entry.assetSource);
    return;
  }

  // The Dark Queen of Krynn (DOS) is the Gen2/HLIB game — boot its decoded GEO library straight into
  // the walkable dungeon (Phase C, C1). Its dungeons come from a different container than CoK/DoK.
  if (entry.match.profileId === 'dark-queen-of-krynn' && entry.match.platform === 'DOS') {
    history.replaceState(null, '', `?dqk=1`);
    void startDqkExplore(entry.assetSource);
    return;
  }

  const key = `${entry.match.profileId}/${entry.match.platform}`;
  const manifestId = DETECTED_TO_MANIFEST[key];
  if (manifestId && GAME_IDS.some((g) => g.id === manifestId)) {
    history.replaceState(null, '', `?game=${manifestId}`);
    void selectGame(manifestId);
  } else {
    setStatus(
      `${entry.match.title} (${entry.match.platform}, ${entry.match.graphicSet}) detected from "${entry.folderName}". ` +
        `Playable rendering for this variant arrives in a later milestone.`,
    );
  }
}

// B3 — import a Champions of Krynn save party and carry it into Death Knights of Krynn. Runs the
// import, shows who came across (faithful combat stats; class/level reconstructed), then offers to
// continue straight into the DoK dungeon fought by the imported heroes.
async function startImport(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Importing your Champions of Krynn party…');
  installImportSeam();

  let res;
  try {
    res = await importCokParty();
  } catch (err) {
    setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const panel = el('div', 'import-panel');
  if (res.imported.length === 0) {
    panel.innerHTML =
      '<h2>No Champions of Krynn save found</h2>' +
      '<p>Drop a CoK <code>SAVE/CHRDATA*.SAV</code> set (or run the dev server with the bundled GOG release) to import your party.</p>';
    out.appendChild(panel);
    setStatus('No CoK save party to import.');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  // M51.S1 — AC was already byte-faithfully read from the save (sheet.ac) and this screen's own copy
  // already claims it's shown, but the table itself never had a column for it; add one.
  // M59.S1 — s.thac0 (the real byte-faithful to-hit number, already computed and already used by
  // sheetToCombatant() for live combat) was named in this screen's own paragraph ("THAC0 ... taken
  // byte-for-byte from your save") but never had a column; add one, matching the AC fix's shape.
  // M60.S1 — s.saves (the real byte-faithful five-save quintuple, pre-formatted like create.ts's own
  // preview) was named in this screen's own paragraph ("...and saves are taken byte-for-byte from your
  // save") but never had a column; add one, matching the AC/THAC0 fixes' shape.
  const rows = res.summary
    .map(
      (s) =>
        `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>THAC0 ${s.thac0}</td><td>${s.saves}</td><td>${s.xp ? s.xp.toLocaleString() + ' XP' : '—'}</td></tr>`,
    )
    .join('');
  const stipendNote = res.stipend > 0
    ? ` Each imported hero receives a <strong>+${res.stipend} platinum</strong> arrival stipend.`
    : '';
  panel.innerHTML =
    `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Champions of Krynn</h2>` +
    '<p style="color:#9aa">Names, abilities, HP, AC, THAC0 and saves are taken byte-for-byte from your save; ' +
    'race and classes are read from the save. Class levels are estimated, with the same estimated level ' +
    'used for each multiclass component.' + stipendNote + '</p>' +
    `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th><th>Saves</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;
  out.appendChild(panel);

  // ovr018 AddPlayer gates: any character the roster refused is surfaced with its original-game reason.
  if (res.rejected.length) {
    const rej = el('div', 'import-rejected');
    rej.style.cssText = 'margin-top:10px;color:#c66';
    rej.innerHTML =
      '<h3 style="margin:0 0 4px;color:#c66">Could not join the party:</h3>' +
      res.rejected.map((r) => `<div>${r.name} — ${r.message}</div>`).join('');
    panel.appendChild(rej);
  }

  const go = el('button', 'gb-btn', '▶ Continue into Death Knights of Krynn') as HTMLButtonElement;
  go.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=dok`);
    void startExplore('dok');
  });
  panel.appendChild(go);

  const rejNote = res.rejected.length ? ` (${res.rejected.length} rejected)` : '';
  setStatus(`Imported ${res.imported.join(', ')}${rejNote} — ready to carry into Death Knights of Krynn.`);
  (window as unknown as { __rendered: number }).__rendered = res.imported.length;
  return res.imported.length;
}

// M14 — import a Death Knights of Krynn save party and carry it into Dark Queen of Krynn. Unlike
// startImport (B3), the save's effective-AC/class/level aren't stored in `.GAM`, so this derives them
// through the real ruleset creation path rather than reading them — disclosed in the summary (see
// importDokParty.ts's file doc for exactly what's byte-faithful vs derived).
//
// CORRECTED 2026-09-07: this comment used to include HP in that list ("the save's HP/effective-AC/
// class/level aren't stored in `.GAM` at all"). HP is stored, at byte 40, and is now read.
async function startImportDok(assetSource?: AssetSource): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Importing your Death Knights of Krynn party…');
  installImportDokSeam();

  let res;
  try {
    res = await importDokParty(assetSource);
  } catch (err) {
    setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const panel = el('div', 'import-panel');
  if (res.imported.length === 0) {
    panel.innerHTML =
      '<h2>No Death Knights of Krynn save found</h2>' +
      '<p>Drop a DoK <code>SAVE/CHRDATA*.GAM</code> set (or run the dev server with the bundled GOG release) to import your party.</p>';
    out.appendChild(panel);
    setStatus('No DoK save party to import.');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  // M51.S1 — the real worn-gear-derived AC (M34.S1) was already computed per character but never
  // reached this table; add it as its own column.
  // M58.S1 — s.mem (the real carried-over memorized-spell total, importDokParty.ts) was already
  // computed and already driving real combat via combatSpellsForMember(), but this table never
  // said so; add a Spells column, honestly showing "—" for a non-caster/no-surviving-spells case
  // instead of a fabricated "0 spells" (matches this codebase's established zero-omission idiom).
  // M61.S1 — s.thac0 (the real derived combat number, computed by the same createCharacter() call
  // as s.ac) was named in this screen's own paragraph ("...effective combat stats are freshly
  // derived...") and in importDokParty.ts's own doc comment ("effective AC/THAC0"), but never had a
  // column; add one, matching the AC fix's shape (M51.S1).
  const rows = res.summary
    .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>THAC0 ${s.thac0}</td><td>${s.mem ? `${s.mem} spell${s.mem === 1 ? '' : 's'}` : '—'}</td></tr>`)
    .join('');
  // M86.S1 — mirrors importParty.ts's identical CoK→DoK stipend note (M23.S1).
  const stipendNote = res.stipend > 0
    ? ` Each imported hero receives a <strong>+${res.stipend} platinum</strong> arrival stipend.`
    : '';
  panel.innerHTML =
    `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Death Knights of Krynn</h2>` +
    '<p style="color:#9aa">Name, ability scores and hit points are taken byte-for-byte from your save ' +
    '(abilities re-capped to the destination race\'s legal range, same as the CoK→DoK hop). DoK\'s compact ' +
    'save record stores only unarmoured-baseline AC, so class, level and effective combat stats are still ' +
    'freshly derived for the level your save\'s THAC0 implies (not read from the save).' + stipendNote + '</p>' +
    `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th><th>Spells</th></tr></thead><tbody>${rows}</tbody></table>`;
  out.appendChild(panel);

  const rejected = [...res.rejectedInvalid, ...res.rejectedPartyFull];
  if (rejected.length) {
    const rej = el('div', 'import-rejected');
    rej.style.cssText = 'margin-top:10px;color:#c66';
    rej.innerHTML =
      '<h3 style="margin:0 0 4px;color:#c66">Could not join the party:</h3>' +
      res.rejectedInvalid.map((n) => `<div>${n} — could not be validated</div>`).join('') +
      res.rejectedPartyFull.map((n) => `<div>${n} — the party is full (6 heroes max)</div>`).join('');
    panel.appendChild(rej);
  }

  const go = el('button', 'gb-btn', '▶ Continue into Dark Queen of Krynn') as HTMLButtonElement;
  go.addEventListener('click', () => {
    history.replaceState(null, '', `?dqk=1`);
    // Preserve the imported roster in party state, but do not retain the selected DoK filesystem
    // capability: the destination must read DQK assets, never probe them through the DoK source.
    void startDqkExplore();
  });
  panel.appendChild(go);

  const rejNote = rejected.length ? ` (${rejected.length} rejected)` : '';
  setStatus(`Imported ${res.imported.join(', ')}${rejNote} — ready to carry into Dark Queen of Krynn.`);
  (window as unknown as { __rendered: number }).__rendered = res.imported.length;
  return res.imported.length;
}

// R2 — import DQK's OWN saved-game party (`SAVGAMA.QSV`) directly into the DQK explorer. Unlike
// startImportDok (a cross-game hop), this reads the destination game's own save: name, abilities, HP
// and level are byte-faithful (DQK's save stores HP directly, unlike DoK's `.GAM`); class and the
/**
 * R2 — `?import=coab`: import Curse of the Azure Bonds' six pregen `SAVE/CHRDATA{1..6}.SAV` heroes.
 *
 * Name, ability scores (including `str00`, carried raw rather than clamped), race/class bytes,
 * the `ClassLevel[8]` array and HP come straight off the save's bytes. Class and race are then
 * TRANSLATED onto this engine's single Dragonlance ruleset — paladins fold into fighters, and
 * dwarf/elf pick one fixed Dragonlance variant each. Every such substitution is listed per hero
 * rather than smoothed over, because the translated sheet is not what CoAB stored.
 */
async function startImportCoab(assetSource?: AssetSource): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Importing the Curse of the Azure Bonds pregens…');
  installImportCoabSeam();

  let res;
  try {
    res = await importCoabParty(assetSource);
  } catch (err) {
    setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const panel = el('div', 'import-panel');
  if (res.imported.length === 0) {
    panel.innerHTML =
      '<h2>No Curse of the Azure Bonds pregens found</h2>' +
      "<p>Point a Library entry at your CoAB install's <code>SAVE/</code> folder, or run the dev " +
      'server with the GOG release in place.</p>';
    out.appendChild(panel);
    setStatus('No CoAB pregens to import.');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const rows = res.summary
    .map((c) => {
      const notes = [...c.substitutions, ...c.droppedClasses.map((d) => `dropped ${d}`)];
      return (
        `<tr><td>${c.name}</td><td>${c.classLabel ?? `class ${c.classCode}`}</td>` +
        `<td>${c.raceLabel ?? `race ${c.raceByte}`} &rarr; ${c.dlRace}</td>` +
        `<td>${c.hp} HP</td><td>THAC0 ${c.displayThac0} (raw ${c.rawThac0})</td>` +
        `<td style="color:#c96">${notes.join('; ') || '—'}</td></tr>`
      );
    })
    .join('');
  panel.innerHTML =
    `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Curse of the Azure Bonds</h2>` +
    '<p style="color:#9aa">Name, ability scores, race/class bytes, level array and HP are ' +
    "byte-faithful. Class and race are translated onto this engine's single shared Dragonlance " +
    'ruleset — the last column lists every substitution and dropped class that translation cost.</p>' +
    '<table class="import-table"><thead><tr><th>Name</th><th>CoAB class</th><th>Race</th><th>HP</th>' +
    `<th>THAC0</th><th>Translation notes</th></tr></thead><tbody>${rows}</tbody></table>`;
  out.appendChild(panel);

  const go = el('button', 'gb-btn', '▶ Open Curse of the Azure Bonds') as HTMLButtonElement;
  go.addEventListener('click', () => {
    history.replaceState(null, '', `?explore=coab`);
    void startExplore('coab');
  });
  panel.appendChild(go);

  setStatus(`Imported ${res.imported.join(', ')} — ready to explore Curse of the Azure Bonds.`);
  (window as unknown as { __rendered: number }).__rendered = res.imported.length;
  return res.imported.length;
}

// effective AC/THAC0 are derived — disclosed in the summary (see importDqkParty.ts's file doc).
async function startImportDqk(assetSource?: AssetSource): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Importing your Dark Queen of Krynn save party…');
  installImportDqkSeam();

  let res;
  try {
    res = await importDqkParty(assetSource);
  } catch (err) {
    setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const panel = el('div', 'import-panel');
  if (res.imported.length === 0) {
    panel.innerHTML =
      '<h2>No Dark Queen of Krynn save found</h2>' +
      '<p>Drop your own DQK <code>SAVGAMA.QSV</code> or select a local Library installation; public builds do not bundle saves.</p>';
    out.appendChild(panel);
    setStatus('No DQK save party to import.');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const rows = res.summary
    .map(
      (s) =>
        `<tr><td>${s.name}</td><td>${s.cls} L${s.level}${s.classSource === 'ability-heuristic' ? ' *' : ''}</td><td>${s.hp} HP</td><td>AC ${s.ac} (raw ${s.rawAc})</td><td>THAC0 ${s.thac0} (raw ${s.rawThac0})</td></tr>`,
    )
    .join('');
  panel.innerHTML =
    `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Dark Queen of Krynn</h2>` +
    '<p style="color:#9aa">Name, ability scores, HP and level are taken byte-for-byte from your save. ' +
    'Class is read from the save\'s class-code byte where it matches the known enum; a <code>*</code> marks a ' +
    'class inferred from ability scores instead (the byte was outside that enum). AC/THAC0 are shown both as ' +
    'the save\'s own raw value and as recomputed by the character-creation ruleset from the derived class ' +
    '+ level (the two need not match).</p>' +
    `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th></tr></thead><tbody>${rows}</tbody></table>`;
  out.appendChild(panel);

  const rejected = [...res.rejectedInvalid, ...res.rejectedPartyFull];
  if (rejected.length) {
    const rej = el('div', 'import-rejected');
    rej.style.cssText = 'margin-top:10px;color:#c66';
    rej.innerHTML =
      '<h3 style="margin:0 0 4px;color:#c66">Could not join the party:</h3>' +
      res.rejectedInvalid.map((n) => `<div>${n} — could not be validated</div>`).join('') +
      res.rejectedPartyFull.map((n) => `<div>${n} — the party is full (6 heroes max)</div>`).join('');
    panel.appendChild(rej);
  }

  const go = el('button', 'gb-btn', '▶ Open the Dark Queen of Krynn dungeon') as HTMLButtonElement;
  go.addEventListener('click', () => {
    history.replaceState(null, '', `?dqk=1`);
    // installDqkParty() (dqkParty.ts) defaults to force=false, so it will NOT clobber the roster
    // just imported here — see dqkParty.ts's own doc comment.
    void startDqkExplore();
  });
  panel.appendChild(go);

  const rejNote = rejected.length ? ` (${rejected.length} rejected)` : '';
  setStatus(`Imported ${res.imported.join(', ')}${rejNote} — ready to explore Dark Queen of Krynn.`);
  (window as unknown as { __rendered: number }).__rendered = res.imported.length;
  return res.imported.length;
}

// --- Boot -------------------------------------------------------------------

async function boot(): Promise<void> {
  buildGamePicker();
  buildCatalog();
  setupFileInput();
  setupZoom();
  setLibrarySelectHandler(onLibrarySelect);
  setupLibrary();

  const params = new URLSearchParams(location.search);
  const gameId = params.get('game');
  const assetId = params.get('asset');
  if (params.get('support') !== null || location.hash === '#support') {
    // Operational support matrix for both the browser/Electron and native DOS ASM tracks.
    startSupportMatrix();
  } else if (params.get('graphics') !== null) {
    // Source-first graphics identity browser; the existing Restyle comparison remains available.
    const { startGraphicsBrowser } = await import('./graphicsBrowser.js');
    await startGraphicsBrowser();
  } else if (params.get('restyle') !== null) {
    // Before/after viewer for the AI restyle pilot (images staged under ./restyle/ on the static build).
    const { startRestyle } = await import('./restyle.js');
    await startRestyle();
  } else if (params.get('docs') !== null || location.hash === '#docs') {
    // Project documentation / status page (plain HTML, not a game screen).
    startDocs();
  } else if (params.get('play') !== null) {
    if (params.get('play') === 'cok') startPlayRoute();
    else await startPlay();
  } else if (params.get('create') !== null) {
    startCreate();
  } else if (params.get('intro') !== null) {
    startIntroRoute(params.get('intro') || '1');
  } else if (params.get('demo') !== null) {
    const dv = params.get('demo');
    if (dv === 'dok') await startGen1Demo(DOK_DEMO_PROFILE, { route: '?demo=dok' });
    else if (dv === 'coab') await startGen1Demo(COAB_DEMO_PROFILE, { route: '?demo=coab' });
    else if (dv === 'secret') await startGen1Demo(SECRET_DEMO_PROFILE, { route: '?demo=secret' });
    else if (dv === 'gateway') await startGen1Demo(GATEWAY_DEMO_PROFILE, { route: '?demo=gateway' });
    else if (dv === 'dqk') await startDqkDemo({ route: '?demo=dqk', onExit: () => bootDqkTitleMenu() });
    else if (dv === 'pools') await startGen1Demo(POOLS_DEMO_PROFILE, { route: '?demo=pools', onExit: () => bootPoolsTitleMenu() });
    else if (dv === 'treasures') await startGen1Demo(TREASURES_DEMO_PROFILE, { route: '?demo=treasures', onExit: () => bootTreasuresTitleMenu() });
    else startCokDemoRoute();
  } else if (params.get('titlemenu') === 'dok') {
    bootDokTitleMenu();
  } else if (params.get('titlemenu') === 'coab') {
    bootCoabTitleMenu();
  } else if (params.get('titlemenu') === 'secret') {
    bootSecretTitleMenu();
  } else if (params.get('titlemenu') === 'gateway') {
    bootGatewayTitleMenu();
  } else if (params.get('titlemenu') === 'dqk') {
    bootDqkTitleMenu();
  } else if (params.get('titlemenu') === 'treasures') {
    bootTreasuresTitleMenu();
  } else if (params.get('titlemenu') === 'pools') {
    bootPoolsTitleMenu();
  } else if (params.get('combat') !== null) {
    closeExplore();
    closeDqkExplore();
    const cv = params.get('combat');
    if (cv === 'mvp') await startCombatMvp('cok');
    else if (cv === 'dok') await startCombatMvp('dok');
    else if (cv === 'pool') await startCombatMvp('pool');
    else if (cv === 'coab') await startCombatMvp('coab');
    else if (cv === 'secret') await startCombatMvp('secret');
    else if (cv === 'dqk') await startCombatDqkPreview();
    else await startCombat();
  } else if (params.get('import') !== null) {
    // `?import=cok` — import the Champions of Krynn save party (the series carry-over feature).
    // `?import=dok` (M14) — the second hop: import the Death Knights of Krynn save party into DQK.
    // `?import=dqk` (R2) — import DQK's OWN saved-game party directly (not a hop from another game).
    // `?import=coab` (R2) — import Curse of the Azure Bonds' own six pregen CHRDATA*.SAV heroes.
    // `?import=secret` (R2, round 30) — import Secret of the Silver Blades' own six pregen
    // heroes, decoded from its 439-byte saved-character record (class `0x6c`, class-level array
    // `0x111`), which is NOT a contiguous insertion relative to Curse's layout.
    // `?import=pools` / `?import=treasures` (R3, round 31) — Pools of Darkness (6) and Treasures
    // of the Savage Frontier (8) pregens, decoded from the SHARED 510-byte
    // POOLS_TREASURES_SAVED_CHARACTER_LAYOUT. Both titles' class/classLevel[8] oracle has a named
    // outlier (Pools' ABAGAIL, Treasures' OUGO) that ships classLevelAgrees: false — shown raw,
    // never translated.
    //
    // CORRECTED 2026-09-05 (round 35 R4 falsified the two sentences that used to stand here, and
    // nobody had updated them). This comment previously read: "...that ships classLevelAgrees:
    // false but still joins the roster. The roster misses are unrelated to that oracle: Pools'
    // BINKY and Treasures' CHERROD are each rejected by createCharacter (a real multiclass/race
    // combination this ruleset disallows), and Treasures' SMOKE is then excluded by the shared
    // 6-hero party cap — so it is CHERROD and SMOKE, not OUGO, that surface in the 'could not join
    // the party' list." That was true only under round 31's borrowed COAB_RACE_TO_DL race enum,
    // shipped then as a disclosed guess. Round 35 R4 read each title's OWN GAME.EXE race table
    // instead (Pools 0xAEAD, Treasures 0xD454, stride 9 x 7 entries — fencepost null 7/7 plausible
    // short PStrings at the real base vs. 0/16 at every shifted base; the 0-based read remains
    // argued by consequence, indexing instruction not located — see importPoolsTreasuresParty.ts).
    // Under each title's own table, BINKY and CHERROD are legal (CHERROD is a half-elf F3/MU3/T4,
    // not the mountain-dwarf the old enum made her) and BOTH JOIN; rule-rejections by
    // createCharacter are now 0 for both titles. What's actually excluded is OUGO and SMOKE, both
    // cut purely by the shared 6-hero party cap (Treasures has 8 candidates for 6 slots) — not by
    // any class/race legality problem. OUGO is the classLevelAgrees: false outlier named above:
    // she is cut by the cap, not by her disagreement, and her "class byte and level array disagree
    // — shown raw, not translated" badge survives the cut via
    // PoolsTreasuresImportResult.rejectedPartyFullDisagreements, re-attached in the rejected list
    // by startImportPoolsTreasuresPanel — the disclosure did not vanish with her roster slot.
    if (params.get('import') === 'dok') await startImportDok();
    else if (params.get('import') === 'dqk') await startImportDqk();
    else if (params.get('import') === 'coab') await startImportCoab();
    else if (params.get('import') === 'secret') {
      const out = document.querySelector('#output') as HTMLElement;
      const games = document.querySelector('#games');
      if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
      setStatus('Importing the Secret of the Silver Blades pregens…');
      await startImportSecretPanel(out);
    }
    else if (params.get('import') === 'pools' || params.get('import') === 'treasures') {
      const title = params.get('import') as 'pools' | 'treasures';
      const out = document.querySelector('#output') as HTMLElement;
      const games = document.querySelector('#games');
      if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
      setStatus(`Importing the ${title === 'pools' ? 'Pools of Darkness' : 'Treasures of the Savage Frontier'} pregens…`);
      installImportPoolsTreasuresSeam();
      await startImportPoolsTreasuresPanel(out, title);
    }
    else if (params.get('import') === 'buck') {
      // `?import=buck` (round 34 Phase B) — decode Buck Rogers: Countdown to Doomsday's six
      // pregen chrdata{n}.sav records and DISPLAY them (see importBuckParty.ts's file doc for
      // why this one does not join the roster like the AD&D importers above).
      const out = document.querySelector('#output') as HTMLElement;
      const games = document.querySelector('#games');
      if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
      setStatus('Decoding the Buck Rogers: Countdown to Doomsday pregens…');
      installImportBuckSeam();
      await startImportBuckPanel(out);
    }
    else await startImport();
  } else if (params.get('module') !== null) {
    // `?module=1` — reopen the most recently played authored module.
    //
    // This arm is the fix for a defect round 29 pinned rather than documented: `onLibrarySelect`
    // has always written `?module=1` into the address bar with `replaceState`, but nothing ever
    // read it back, so reloading or sharing that URL silently dropped the user at the Library.
    // A `?query=` the code writes but never reads is not a route.
    //
    // The module is restored from IndexedDB (`modulePersist.ts`) and re-validated through the
    // ordinary text-import path — the stored bytes are re-parsed, never trusted — so a corrupt
    // record yields `null` here rather than a half-mounted module.
    const restored = await restoreLastModuleEntry();
    if (restored && restored.kind === 'module') {
      startModuleExplore(restored.pkg, restored.entryPointId ?? 0, {
        ...(restored.packageSha256 ? { artifactId: restored.packageSha256 } : {}),
        ...(restored.bestiarySource ? { monsterSource: restored.bestiarySource } : {}),
        ...(restored.itemSource ? { itemSource: restored.itemSource } : {}),
      });
    } else {
      setStatus('No previously played module to restore — import one from the Library.');
    }
  } else if (params.get('coab-regional') !== null) {
    await startCoabRegionalTravel();
  } else if (params.get('gateway-fight') !== null) {
    await startGatewayEcl5Fight();
  } else if (params.get('dungeon3d') !== null) {
    // `?dungeon3d=<gameId>[&area=<disk:id>]` opens the 3D dungeon view (lazy chunk).
    await startDungeon3dLazy(params.get('dungeon3d') || 'cok', params.get('area'));
  } else if (params.get('explore') !== null) {
    // Named routes boot their retail-byte data configuration; anything else defaults to CoK.
    const ev = params.get('explore');
    await startExplore(ev === 'dok' ? 'dok' : ev === 'dok-natural' ? 'dok-natural' : ev === 'dok-natural-2' ? 'dok-natural-2' : ev === 'cok-natural' ? 'cok-natural' : ev === 'cok-natural-2' ? 'cok-natural-2' : ev === 'cok-natural-3' ? 'cok-natural-3' : ev === 'cok-natural-4' ? 'cok-natural-4' : ev === 'cok-natural-5' ? 'cok-natural-5' : ev === 'cok-natural-6' ? 'cok-natural-6' : ev === 'coab' ? 'coab' : ev === 'coab-natural' ? 'coab-natural' : ev === 'coab-natural-2' ? 'coab-natural-2' : ev === 'coab-natural-3' ? 'coab-natural-3' : ev === 'coab-natural-4' ? 'coab-natural-4' : ev === 'gateway' ? 'gateway' : ev === 'gateway-natural' ? 'gateway-natural' : ev === 'gateway-amiga' ? 'gateway-amiga' : ev === 'gateway-quest' ? 'gateway-quest' : ev === 'pool' ? 'pool' : ev === 'pool-natural-2' ? 'pool-natural-2' : ev === 'pool-natural-3' ? 'pool-natural-3' : ev === 'pool-natural-4' ? 'pool-natural-4' : ev === 'pool-natural-5' ? 'pool-natural-5' : ev === 'secret' ? 'secret' : ev === 'secret-natural' ? 'secret-natural' : ev === 'secret-natural-2' ? 'secret-natural-2' : ev === 'secret-natural-3' ? 'secret-natural-3' : ev === 'secret-natural-4' ? 'secret-natural-4' : ev === 'treasures' ? 'treasures' : ev === 'treasures-natural' ? 'treasures-natural' : ev === 'treasures-town' ? 'treasures-town' : ev === 'pools' ? 'pools' : ev === 'pools-natural' ? 'pools-natural' : ev === 'pools-town' ? 'pools-town' : ev === 'nwn' ? 'nwn' : ev === 'nwn-natural' ? 'nwn-natural' : 'cok');
  } else if (params.get('dqk') !== null) {
    // `?dqk=1` boots the Dark Queen of Krynn Gen2/HLIB dungeon (Phase C, C1).
    // `?dqk=quest` (R4) boots the same dungeon and then runs both arms of the [0x0187] bit-0x20
    // QUEST leg, rendering the result. Its Hamhand menu answer is auto-answered, not clicked —
    // stated on the panel itself.
    if (params.get('dqk') === 'quest') await startDqkQuest();
    else await startDqkExplore();
  } else if (params.get('nwn') !== null) {
    // `?nwn=1` opens the Neverwinter Nights DOS/AOL extracted-asset and data preview.
    await startNwnPreview();
  } else if (params.get('gswitch') !== null) {
    // `?gswitch=dok` switches DoK's BIGPIC art; anything else = CoK.
    await startGraphicSwitch(params.get('gswitch') === 'dok' ? 'dok' : 'cok');
  } else if (params.get('artmap') !== null) {
    // `?artmap=SPRIT.TLB` opens that target's pair; anything else/empty = the default (SPRIT.TLB).
    const t = params.get('artmap');
    await startArtMap(t && t !== '1' ? t : undefined);
  } else if (params.get('audio') !== null) {
    await startAudio();
  } else if (params.get('menus') !== null) {
    await startMenus();
  } else if (params.get('inv') !== null) {
    await startInventory();
  } else if (params.get('wild') !== null) {
    await startWilderness();
  } else if (params.get('town') !== null) {
    await startTown();
  } else if (params.get('dialogue') !== null) {
    await startDialogue();
  } else if (params.get('journal') !== null) {
    await startJournal();
  } else if (params.get('hud') !== null) {
    await startHud();
  } else if (params.get('mainmenu') !== null) {
    await startMainMenu();
  } else if (params.get('refdb') !== null) {
    await startReferenceDb();
  } else if (params.get('ecl') !== null) {
    // `?ecl=buck` (R6) opens Buck Rogers' own ecl2.dax under the binary-derived ECL_GEN1_BUCK
    // dialect. `?ecl=matrix` (round 31) opens Matrix Cubed's own ECL1.DAX under
    // ECL_GEN1_MATRIX, derived from Matrix's OWN FBOV overlay rather than inherited from its
    // sibling. Anything else = CoK's ECL1.DAX under ECL_GEN1.
    const eclKey = params.get('ecl');
    await startEclInspector(eclKey === 'buck' ? 'buck' : eclKey === 'matrix' ? 'matrix' : 'cok');
  } else if (params.get('chared') !== null) {
    // `?chared=dok` opens the read-only DoK save viewer; anything else = the CoK read/write editor.
    const cv = params.get('chared');
    await startCharEditor(cv === 'dok' ? 'dok' : 'cok');
  } else if (params.get('automap') !== null) {
    await startAutomap();
  } else if (gameId) {
    await selectGame(gameId);
  } else if (assetId && import.meta.env.DEV) {
    const count = await loadCatalogAsset(assetId);
    (window as unknown as { __rendered: number }).__rendered = count;
  } else if (assetId) {
    setStatus('Single-asset catalog previews are available in development only. Select a local game install from the Library, or open Graphics identities.');
  } else {
    (window as unknown as { __rendered: number }).__rendered = 0;
    setStatus('Pick a whole game, drop a file, or pick a single bundled asset (bundled requires `npm run dev`).');
  }
}

void boot();
