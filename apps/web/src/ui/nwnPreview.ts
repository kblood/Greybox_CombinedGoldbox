/**
 * Neverwinter Nights (DOS/AOL) preview.
 *
 * This is deliberately not wired into the Krynn dungeon runner yet: NWN's AOL-era
 * data set is close enough to Gen1 DAX to decode many assets, but its boot/play
 * path still needs game-specific validation. The preview makes that progress
 * visible in the app: real decoded art, GEO map probes, ECL probes and data table
 * counts from the user's extracted NWN folder.
 */
import {
  decodeAsset,
  decodeGeoBlock,
  decodeMonsterItmArchive,
  decodeNwnItemVocabulary,
  disassembleEclBlock,
  nameFromCodes,
  readDaxDataBlocks,
  loadCokFont,
  renderHlibComposite,
  createFramebuffer,
  drawText,
  makeEgaPalette,
  type DecodedAsset,
  type GameMap,
  type IndexedImage,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el, makeFrameCard } from './render.js';

const ROOT = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';

const GRAPHICS = [
  { path: `${ROOT}/TITLE.DAX`, label: 'TITLE.DAX', role: 'Title screens' },
  { path: `${ROOT}/PIC.DAX`, label: 'PIC.DAX', role: 'Animated scenes' },
  { path: `${ROOT}/BACK.DAX`, label: 'BACK.DAX', role: 'Backdrops' },
  { path: `${ROOT}/SKY.DAX`, label: 'SKY.DAX', role: 'Sky and backdrop bands' },
  { path: `${ROOT}/CPIC.DAX`, label: 'CPIC.DAX', role: 'Combat portraits' },
  { path: `${ROOT}/HEAD.DAX`, label: 'HEAD.DAX', role: 'Large character heads' },
  { path: `${ROOT}/CHEAD.DAX`, label: 'CHEAD.DAX', role: 'Character heads' },
  { path: `${ROOT}/SPRIT.DAX`, label: 'SPRIT.DAX', role: 'Creature sprites' },
  { path: `${ROOT}/COMSPR.DAX`, label: 'COMSPR.DAX', role: 'Combat sprites' },
  { path: `${ROOT}/8X8D.DAX`, label: '8X8D.DAX', role: 'Wall and tile art' },
  { path: `${ROOT}/DUNGCOM.DAX`, label: 'DUNGCOM.DAX', role: 'Dungeon combat terrain' },
  { path: `${ROOT}/RANDCOM.DAX`, label: 'RANDCOM.DAX', role: 'Random combat terrain' },
  { path: `${ROOT}/BODY.DAX`, label: 'BODY.DAX', role: 'Paperdoll body art' },
  { path: `${ROOT}/CBODY.DAX`, label: 'CBODY.DAX', role: 'Compact body art' },
] as const;

const GEO_FILES = ['GEO0.DAX', 'GEO1.DAX', 'GEO2.DAX', 'GEO3.DAX'] as const;
const ECL_FILES = ['ECL0.DAX', 'ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX', 'ECL5.DAX', 'ECL7.DAX'] as const;
const DATA_FILES = ['MONCHA.DAX', 'MONITM.DAX', 'MONSPC.DAX', 'ITEM.DAX', 'WALLDEF.DAX'] as const;

interface FramePick {
  label: string;
  image: IndexedImage;
}

interface DataRow {
  name: string;
  status: string;
}

interface MapCatalogueRow {
  archive: string;
  id: number;
  width: number;
  height: number;
}

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (!s) return;
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

/**
 * Name NWN's monster loot instead of counting its blocks.
 *
 * `MONITM.DAX` stores three one-byte name codes per item, and NWN's code table is not the
 * CoK/DoK `VOCAB.TXT` one -- it lives inside `GAME.EXE`. `decodeNwnItemVocabulary` recovered that
 * table on 2026-08-08 and passed its retail-byte tests from that day on with **no caller anywhere
 * outside its own test**, which is precisely the shape the "solved but unwired" rule exists to
 * catch. This is the consumer.
 *
 * The vocabulary needs a second file, so a missing/unreadable `GAME.EXE` must not take the
 * archive's own block count down with it: on failure the row keeps the count and says why the
 * names are absent.
 */
async function nwnLootNames(monitm: Uint8Array): Promise<string> {
  if (import.meta.env.PROD) return ', loot vocabulary unavailable in deployed preview';
  let vocabulary: readonly string[];
  try {
    vocabulary = decodeNwnItemVocabulary(await readAssetBytes(`${ROOT}/GAME.EXE`));
  } catch (err) {
    return `, names unavailable (${err instanceof Error ? err.message : String(err)})`;
  }
  const named: string[] = [];
  for (const items of decodeMonsterItmArchive(monitm).values()) {
    for (const item of items) {
      const label = nameFromCodes(item.nameCodes, vocabulary).trim();
      if (label) named.push(label);
    }
  }
  const distinct = [...new Set(named)].sort();
  if (!distinct.length) return ', no named loot';
  // Sample evenly across the sorted names rather than taking the head: the list opens with a run
  // of `+2 ...` entries, which would make the whole table look like enchantment prefixes.
  const sample = [0, 1, 2, 3].map((i) => distinct[Math.floor((i * distinct.length) / 4)]!);
  return `, ${named.length} loot item(s) naming ${distinct.length} distinct items from ${vocabulary.length - 1} GAME.EXE vocabulary entries (${sample.join(', ')})`;
}

async function readAssetBytes(path: string): Promise<Uint8Array> {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Flatten one decoded container into preview frames.
 *
 * `bytes` is the file's own buffer and is used only by the HLIB composite pass: method-25 slots
 * name other members of the same leaf, and `renderHlibComposite` resolves them through the leaf's
 * pointer table, which lives in the file rather than in the decoded archive. This preview reaches
 * no HLIB/GLIB file today (every entry in `GRAPHICS` is NWN `.DAX`), so the pass is a
 * completeness fix at this site, not a recovered frame count — see
 * `docs/engine/research/hlib-glib-composites.md`.
 */
function framesFromDecoded(decoded: DecodedAsset, label: string, bytes: Uint8Array): FramePick[] {
  const frames: FramePick[] = [];
  if (decoded.format === 'dax') {
    for (const block of decoded.archive.blocks) {
      if (block.frames?.length) {
        block.frames.forEach((image, i) => frames.push({ label: `${label} #${block.blockId}.${i}`, image }));
      } else if (block.image) {
        frames.push({ label: `${label} #${block.blockId}`, image: block.image });
      }
    }
  } else if (decoded.format === 'daa') {
    const archive = decoded.archive;
    if (archive.kind === 'index') {
      for (const sub of archive.subFrames) {
        sub.frames.forEach((image, i) => frames.push({ label: `${label} #${sub.blockId}.${i}`, image }));
      }
    } else {
      for (const block of archive.blocks) {
        if (block.image) frames.push({ label: `${label} #${block.blockId}`, image: block.image });
      }
    }
  } else if (decoded.format === 'hlib' || decoded.format === 'glib') {
    // GLIB is the big-endian Amiga sibling of HLIB with the same member shape. It was folded in
    // here when `decodeAsset` learned to sniff it; before that this function could never see one.
    decoded.archive.images.forEach((image, i) => frames.push({ label: `${label} ${image.label || `#${i}`}`, image: image.image }));
    // Composite (image-id list) members are kept out of `images` by both decoders so positional
    // indices never shift, which means every flattening site must add this pass for itself.
    if (decoded.format === 'hlib') {
      decoded.archive.composites.forEach((c, ci) => {
        const image = renderHlibComposite(bytes, c);
        if (image) frames.push({ label: `${label} composite #${ci}`, image });
      });
    } else {
      decoded.archive.composites.forEach((c, ci) => {
        if (c.image) frames.push({ label: `${label} composite #${ci}`, image: c.image });
      });
    }
  } else if (decoded.format === 'pool-amiga') {
    // Pool-Amiga blocks have the same {frames?, image} shape as DAX blocks (see the
    // 'dax' branch above) — added when decodeAsset learned to sniff this container.
    for (const block of decoded.archive.blocks) {
      if (block.frames?.length) {
        block.frames.forEach((image, i) => frames.push({ label: `${label} #${block.blockId}.${i}`, image }));
      } else if (block.image) {
        frames.push({ label: `${label} #${block.blockId}`, image: block.image });
      }
    }
  } else {
    frames.push({ label, image: decoded.image.image });
  }
  return frames;
}

function mapStats(map: GameMap): { walls: number; doors: number; events: number } {
  let walls = 0;
  let doors = 0;
  let events = 0;
  for (const cell of map.cells) {
    for (const v of Object.values(cell.walls)) if (v) walls++;
    if (cell.doors) for (const v of Object.values(cell.doors)) if (v) doors++;
    if (cell.event) events++;
  }
  return { walls, doors, events };
}

function drawMapPreview(map: GameMap, title: string): HTMLElement {
  const wrap = el('div', 'nwn-map-card');
  wrap.appendChild(el('div', 'frame-title', title));
  const canvas = el('canvas', 'nwn-map');
  const scale = 10;
  canvas.width = map.width * scale;
  canvas.height = map.height * scale;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const cell = map.cells[y * map.width + x];
        const anyWall = Object.values(cell.walls).some((v) => v !== 0);
        const anyDoor = cell.doors ? Object.values(cell.doors).some((v) => v !== 0) : false;
        ctx.fillStyle = cell.event ? '#b88b2a' : anyDoor ? '#4a90d9' : anyWall ? '#46516a' : '#182036';
        ctx.fillRect(x * scale + 1, y * scale + 1, scale - 2, scale - 2);
        ctx.strokeStyle = '#0b101b';
        ctx.strokeRect(x * scale + 0.5, y * scale + 0.5, scale, scale);
      }
    }
  }
  wrap.appendChild(canvas);
  const st = mapStats(map);
  wrap.appendChild(el('div', 'dims', `${map.width}x${map.height} · walls ${st.walls} · doors ${st.doors} · events ${st.events}`));
  return wrap;
}

async function renderGraphics(out: HTMLElement): Promise<number> {
  const section = el('section', 'nwn-section');
  section.appendChild(el('h2', 'nwn-title', 'Decoded NWN art'));
  const grid = el('div', 'frame-grid');
  section.appendChild(grid);
  out.appendChild(section);

  let rendered = 0;
  for (const entry of GRAPHICS) {
    try {
      const assetBytes = await readAssetBytes(entry.path);
      const decoded = decodeAsset(assetBytes, entry.label);
      const frames = framesFromDecoded(decoded, entry.label, assetBytes);
      const shown = frames.slice(0, 8);
      for (let i = 0; i < shown.length; i++) {
        const card = makeFrameCard(shown[i].image, `${entry.role} · ${shown[i].label}`, {
          showSwatches: false,
          eager: rendered < 12,
        });
        grid.appendChild(card);
        rendered++;
      }
      if (frames.length > shown.length) {
        const note = el('div', 'note small', `${entry.label}: showing ${shown.length} of ${frames.length} decoded frame(s).`);
        grid.appendChild(note);
      }
    } catch (err) {
      grid.appendChild(el('div', 'note small error', `${entry.label}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  return rendered;
}

/**
 * Render the `8X8D.DAX` block-201 text font (177 8×8 glyphs). The generic `decodeAsset` path used
 * by {@link renderGraphics} deliberately leaves this block as an empty `complex` classification —
 * by design, not a miss: it's not a standard 8×8-tileset header, it's a flat 1bpp glyph table read
 * by the dedicated `loadCokFont` loader (see docs/engine/research/neverwinter-nights-dos-format-
 * coverage.md's 8X8D detail section, which confirms this decodes byte-length-identical to CoK's
 * own font: 1416 bytes / 8 = 177 glyphs). Without this function the preview showed nothing for
 * block 201 at all — "complex, no frames" — even though the font genuinely renders; this closes
 * that gap (coverage doc follow-up item 3) by calling `loadCokFont` directly and drawing a sample
 * string through it, the same way `renderExplore.manual.test.ts` visually verifies CoK's own font.
 */
async function renderFontPreview(out: HTMLElement): Promise<number> {
  const section = el('section', 'nwn-section');
  section.appendChild(el('h2', 'nwn-title', 'Decoded text font (8X8D.DAX block 201)'));
  const grid = el('div', 'frame-grid');
  section.appendChild(grid);
  out.appendChild(section);

  let rendered = 0;
  try {
    const bytes = await readAssetBytes(`${ROOT}/8X8D.DAX`);
    const font = loadCokFont(bytes);
    if (!font) {
      grid.appendChild(el('div', 'note small error', '8X8D.DAX block 201: font not found or too short.'));
      return 0;
    }
    const palette = makeEgaPalette();
    const lines = ['NEVERWINTER NIGHTS', 'DOS/AOL 1991', '0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    for (const text of lines) {
      const w = Math.max(8, text.length * font.glyphWidth + 8);
      const h = font.glyphHeight + 8;
      const fb = createFramebuffer(w, h, 0); // black background
      drawText(fb, font, text, 4, 4, 15); // bright white, no bg fill (transparent gaps stay black)
      const image: IndexedImage = {
        width: fb.width,
        height: fb.height,
        indices: fb.indices,
        xOffset: 0,
        yOffset: 0,
        transparentIndex: null,
        palette,
        encoding: 'nwn-font-sample',
      };
      const card = makeFrameCard(image, `8X8D.DAX #201 · "${text}"`, { showSwatches: false, eager: true });
      grid.appendChild(card);
      rendered++;
    }
    grid.appendChild(el('div', 'note small', `Font: ${font.count} glyphs, ${font.glyphWidth}×${font.glyphHeight}px each — decoded via loadCokFont (byte-length-identical layout to CoK's own font).`));
  } catch (err) {
    grid.appendChild(el('div', 'note small error', `8X8D.DAX block 201: ${err instanceof Error ? err.message : String(err)}`));
  }
  return rendered;
}

async function renderDataProbes(out: HTMLElement): Promise<number> {
  const section = el('section', 'nwn-section');
  section.appendChild(el('h2', 'nwn-title', 'Decoded data probes'));
  const rows: DataRow[] = [];
  const catalogue: MapCatalogueRow[] = [];
  let decodedMaps = 0;

  const mapGrid = el('div', 'nwn-map-grid');
  for (const [archiveIndex, name] of GEO_FILES.entries()) {
    try {
      const blocks = readDaxDataBlocks(await readAssetBytes(`${ROOT}/${name}`));
      const maps: { id: number; map: GameMap }[] = [];
      for (const block of blocks) {
        try {
          const map = decodeGeoBlock(block.raw, `${name}#${block.blockId}`).map;
          maps.push({ id: block.blockId, map });
          catalogue.push({ archive: name, id: block.blockId, width: map.width, height: map.height });
        } catch {
          /* Not every DAX data block is guaranteed to be a Krynn-style 16x16 GEO payload. */
        }
      }
      decodedMaps += maps.length;
      rows.push({ name, status: `${blocks.length} DAX block(s), ${maps.length} map block(s) decoded; paired with ECL${archiveIndex}.DAX` });
      if (maps[0]) mapGrid.appendChild(drawMapPreview(maps[0].map, `${name} #${maps[0].id}`));
    } catch (err) {
      rows.push({ name, status: `unreadable: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  for (const name of ECL_FILES) {
    try {
      const blocks = readDaxDataBlocks(await readAssetBytes(`${ROOT}/${name}`));
      let disassembled = 0;
      let instructions = 0;
      for (const block of blocks.slice(0, 24)) {
        try {
          const ecl = disassembleEclBlock(block.raw);
          disassembled++;
          instructions += ecl.instructions.length;
        } catch {
          /* Preserve count-only status for blocks whose entry/header differs. */
        }
      }
      rows.push({ name, status: `${blocks.length} script block(s), ${disassembled} sampled disassembly block(s), ${instructions} instruction(s)` });
    } catch (err) {
      rows.push({ name, status: `unreadable: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  for (const name of DATA_FILES) {
    try {
      const raw = await readAssetBytes(`${ROOT}/${name}`);
      const blocks = readDaxDataBlocks(raw);
      let status = `${blocks.length} DAX data block(s) present`;
      if (name === 'MONITM.DAX') status += await nwnLootNames(raw);
      rows.push({ name, status });
    } catch (err) {
      rows.push({ name, status: `unreadable: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  if (mapGrid.childElementCount) section.appendChild(mapGrid);
  const catalogueTitle = el('h3', 'nwn-title', `Offline map catalogue (${catalogue.length} shipped GEO maps)`);
  section.appendChild(catalogueTitle);
  const catalogueNote = el(
    'div',
    'note small',
    'Every listed map is decoded directly from the local DOS/AOL client. Select “Dungeon area” in the explorer to mount a verified first-person route where possible; event-only maps open as a read-only raw-GEO atlas. AOL server state is not reconstructed.',
  );
  section.appendChild(catalogueNote);
  const catalogueTable = el('table', 'nwn-data-table nwn-map-catalogue');
  catalogueTable.innerHTML = '<thead><tr><th>GEO archive</th><th>Map</th><th>Dimensions</th><th>Offline availability</th></tr></thead>';
  const catalogueBody = document.createElement('tbody');
  for (const map of catalogue.sort((a, b) => a.archive.localeCompare(b.archive) || a.id - b.id)) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', undefined, map.archive));
    tr.appendChild(el('td', undefined, String(map.id)));
    tr.appendChild(el('td', undefined, `${map.width}×${map.height}`));
    tr.appendChild(el('td', undefined, 'Client-data preview (explorer route or raw atlas)'));
    catalogueBody.appendChild(tr);
  }
  catalogueTable.appendChild(catalogueBody);
  section.appendChild(catalogueTable);
  const table = el('table', 'nwn-data-table');
  table.innerHTML = '<thead><tr><th>File</th><th>Probe result</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', undefined, row.name));
    tr.appendChild(el('td', undefined, row.status));
    body.appendChild(tr);
  }
  table.appendChild(body);
  section.appendChild(table);
  out.appendChild(section);
  return decodedMaps;
}

export async function startNwnPreview(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  if (!out) return 0;
  document.querySelectorAll('.cat-asset').forEach((e) => e.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading Neverwinter Nights DOS/AOL preview...');

  const header = el('div', 'game-header nwn-header');
  header.appendChild(el('span', 'badge', 'NWN'));
  header.appendChild(el('span', 'asset-name', 'Neverwinter Nights (DOS/AOL)'));
  header.appendChild(el('span', 'muted', 'real extracted client assets · offline reconstruction only'));
  out.appendChild(header);
  out.appendChild(
    el(
      'div',
      'note',
      'This is a faithful offline reconstruction from the surviving DOS/AOL client: decoded graphics, all shipped client maps, and verified offline routes. AOL accounts, server state, multiplayer, and persistent-world progression are unavailable and are not simulated.',
    ),
  );

  const frames = await renderGraphics(out);
  const fontFrames = await renderFontPreview(out);
  const maps = await renderDataProbes(out);
  const total = frames + fontFrames + maps;
  (window as unknown as { __rendered: number }).__rendered = total;
  setStatus(`Loaded NWN preview — ${frames} art frame(s), ${fontFrames} font sample(s), ${maps} map preview(s).`);
  return total;
}
