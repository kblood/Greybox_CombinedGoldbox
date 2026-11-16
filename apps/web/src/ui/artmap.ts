/**
 * M8.S3 — the Amiga art assignment editor (Gap G5's human-in-the-loop half). For a
 * `shape-mismatch` DQK target (see `dqkArtMap.ts`'s `DQK_ART_LAYOUT`) the decoded Amiga source
 * has no automatic frame→slot correspondence, so this tool lets a human click an Amiga source
 * frame and then click a DQK target slot to assign it. The assignment is stored as a pure
 * `AmigaSlotMapping` (`@goldbox/engine`) and persisted to `localStorage`, mirroring
 * `automapPanel.ts`'s `STORE_KEY`/`restore()`/`persist()` tactic. No repack happens here — M8.S4
 * turns a validated mapping into real HLIB bytes; this view only builds and previews the mapping.
 */
import {
  decodeDaa,
  decodeHlib,
  DQK_ART_LAYOUT,
  createEmptySlotMapping,
  assignSlot,
  unassignSlot,
  validateSlotMapping,
  serializeSlotMapping,
  deserializeSlotMapping,
  type DaaArchive,
  type HlibArchive,
  type IndexedImage,
  type AmigaSlotMapping,
} from '@goldbox/engine';
import { CATALOG_BY_ID, assetUrl } from './catalog.js';
import { el, renderToCanvas, applyZoom } from './render.js';

interface ArtMapPair {
  /** `DqkArtEntry.name` — the DQK target being mapped onto. */
  target: string;
  /** Catalog id (see `catalog.ts`, M8.S2) for the target `.TLB`. */
  targetCatalogId: string;
  /** Catalog id (see `catalog.ts`, M8.S1) for the Amiga source `.DAA`. */
  sourceCatalogId: string;
}

/** The 7 unique `shape-mismatch` Amiga sources, expanded to their 9 DQK targets — every entry
 * `DQK_ART_LAYOUT` marks `shape-mismatch`, all already browsable individually since M8.S1/M8.S2
 * (reusing those catalog ids here ties this editor to the exact same bundled files). */
const ART_MAP_PAIRS: ArtMapPair[] = [
  { target: 'SPRIT.TLB', targetCatalogId: 'dqk-sprit', sourceCatalogId: 'cok-amiga-sprit1' },
  { target: 'PICA.TLB', targetCatalogId: 'dqk-pica', sourceCatalogId: 'cok-amiga-pic1' },
  { target: 'PICB.TLB', targetCatalogId: 'dqk-picb', sourceCatalogId: 'cok-amiga-pic1' },
  { target: 'PICC.TLB', targetCatalogId: 'dqk-picc', sourceCatalogId: 'cok-amiga-pic1' },
  { target: 'CPIC.TLB', targetCatalogId: 'dqk-cpic', sourceCatalogId: 'cok-amiga-cpic1' },
  { target: 'CBODY.TLB', targetCatalogId: 'dqk-cbody', sourceCatalogId: 'cok-amiga-body1' },
  { target: 'WILDCOM.TLB', targetCatalogId: 'dqk-wildcom', sourceCatalogId: 'cok-amiga-wildcom' },
  { target: 'DUNGCOM.TLB', targetCatalogId: 'dqk-dungcom', sourceCatalogId: 'cok-amiga-dungcom' },
  { target: '8X8DC.TLB', targetCatalogId: 'dqk-8x8dc', sourceCatalogId: 'cok-amiga-8x8d1' },
];

const STORE_PREFIX = 'greybox.artmap.';

interface SourceFrame {
  blockId: number;
  frameIndex: number;
  image: IndexedImage;
}

interface ArtMapState {
  pair: ArtMapPair;
  source: DaaArchive;
  target: HlibArchive;
  sourceFrames: SourceFrame[];
  mapping: AmigaSlotMapping;
  selected: { blockId: number; frameIndex: number } | null;
}

let state: ArtMapState | null = null;

function storeKey(target: string): string {
  return `${STORE_PREFIX}${target}`;
}

function restoreMapping(pair: ArtMapPair): AmigaSlotMapping {
  try {
    const raw = localStorage.getItem(storeKey(pair.target));
    if (raw) return deserializeSlotMapping(raw);
  } catch {
    // fall through to a blank mapping on any parse/shape error
  }
  const sourceName = CATALOG_BY_ID.get(pair.sourceCatalogId)?.hint ?? pair.sourceCatalogId;
  return createEmptySlotMapping(pair.target, sourceName);
}

function persist(): void {
  if (!state) return;
  try {
    localStorage.setItem(storeKey(state.mapping.target), serializeSlotMapping(state.mapping));
  } catch {
    // quota or serialization failure — the in-memory mapping still works this session
  }
}

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (!s) return;
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/** Flatten a `DaaArchive` into one list of selectable source frames, regardless of `kind`
 * (mirrors `main.ts`'s `extractFrames` DAA branch, which already handles both shapes). */
function flattenSourceFrames(a: DaaArchive): SourceFrame[] {
  const out: SourceFrame[] = [];
  if (a.kind === 'index') {
    for (const s of a.subFrames) {
      s.frames.forEach((image, fi) => out.push({ blockId: s.blockId, frameIndex: fi, image }));
    }
  } else {
    for (const b of a.blocks) {
      if (b.image) out.push({ blockId: b.blockId, frameIndex: 0, image: b.image });
    }
  }
  return out;
}

function findSourceFrame(blockId: number, frameIndex: number): IndexedImage | null {
  if (!state) return null;
  return state.sourceFrames.find((f) => f.blockId === blockId && f.frameIndex === frameIndex)?.image ?? null;
}

function assignmentFor(slot: number): { blockId: number; frameIndex: number } | null {
  if (!state) return null;
  const a = state.mapping.assignments.find((x) => x.slot === slot);
  return a ? { blockId: a.sourceBlockId, frameIndex: a.frameIndex } : null;
}

function makeCard(image: IndexedImage, title: string, onClick: () => void): HTMLElement {
  const card = el('div', 'frame-card');
  card.appendChild(el('div', 'frame-title', title));
  card.appendChild(el('div', 'dims', `${image.width}×${image.height}`));
  const wrap = el('div', 'canvas-wrap');
  const canvas = el('canvas', 'pixelated') as HTMLCanvasElement;
  canvas.width = image.width;
  canvas.height = image.height;
  applyZoom(canvas, image);
  renderToCanvas(canvas, image);
  wrap.appendChild(canvas);
  card.appendChild(wrap);
  card.addEventListener('click', onClick);
  return card;
}

function drawScreen(): void {
  if (!state) return;
  const out = document.querySelector('#output') as HTMLElement;
  out.innerHTML = '';

  const entry = DQK_ART_LAYOUT.find((e) => e.name === state!.pair.target);
  const header = el('div', 'asset-header');
  header.appendChild(el('span', 'badge', 'ART MAP'));
  header.appendChild(el('span', 'asset-name', `${state.pair.target} ← ${state.mapping.source}`));
  header.appendChild(
    el(
      'span',
      'muted',
      entry
        ? `shape-mismatch: ${entry.imageCount} target slots vs a differently-shaped Amiga source. ` +
          'Click a source frame, then a target slot, to assign it.'
        : 'Click a source frame, then a target slot, to assign it.',
    ),
  );
  out.appendChild(header);

  // Pair picker.
  const pairBar = el('div', 'gswitch-bar');
  for (const p of ART_MAP_PAIRS) {
    const b = el('button', 'gswitch-plat', p.target) as HTMLButtonElement;
    b.type = 'button';
    b.classList.toggle('active', p.target === state.pair.target);
    b.addEventListener('click', () => {
      void loadPair(p);
    });
    pairBar.appendChild(b);
  }
  out.appendChild(pairBar);

  const validation = validateSlotMapping(state.mapping, DQK_ART_LAYOUT);
  if (!validation.valid) {
    const note = el('div', 'note error');
    note.textContent = `Mapping errors: ${validation.errors.join('; ')}`;
    out.appendChild(note);
  }
  const summary = el(
    'div',
    'note small',
    `${state.mapping.assignments.length} of ${entry?.imageCount ?? '?'} slots assigned` +
      (state.selected ? ` — selected: block ${state.selected.blockId}.${state.selected.frameIndex}` : ' — click a source frame to select one'),
  );
  out.appendChild(summary);

  const exportBtn = el('button', 'ghost-btn', '⬇ Export mapping JSON') as HTMLButtonElement;
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', () => downloadMapping());
  const clearBtn = el('button', 'ghost-btn', '✕ Clear mapping') as HTMLButtonElement;
  clearBtn.type = 'button';
  clearBtn.addEventListener('click', () => clearMapping());
  const toolbar = el('div', 'gswitch-bar');
  toolbar.appendChild(exportBtn);
  toolbar.appendChild(clearBtn);
  out.appendChild(toolbar);

  const columns = el('div', 'artmap-columns');

  const sourceCol = el('div', 'artmap-col');
  sourceCol.appendChild(el('div', 'asset-name', `Amiga source — ${state.mapping.source} (${state.sourceFrames.length} frames)`));
  const sourceGrid = el('div', 'frame-grid');
  for (const f of state.sourceFrames) {
    const isSelected = state.selected?.blockId === f.blockId && state.selected?.frameIndex === f.frameIndex;
    const card = makeCard(f.image, `block ${f.blockId}.${f.frameIndex}`, () => selectSource(f.blockId, f.frameIndex));
    card.classList.toggle('selected', isSelected);
    sourceGrid.appendChild(card);
  }
  sourceCol.appendChild(sourceGrid);
  columns.appendChild(sourceCol);

  const targetCol = el('div', 'artmap-col');
  targetCol.appendChild(el('div', 'asset-name', `DQK target — ${state.pair.target} (${state.target.images.length} slots)`));
  const targetGrid = el('div', 'frame-grid');
  state.target.images.forEach((member, slot) => {
    const a = assignmentFor(slot);
    const assignedImage = a ? findSourceFrame(a.blockId, a.frameIndex) : null;
    const shown = assignedImage ?? member.image;
    const title = a ? `slot ${slot} ← ${a.blockId}.${a.frameIndex}` : `slot ${slot} (unassigned)`;
    const card = makeCard(shown, title, () => assignSelectedTo(slot));
    card.classList.toggle('assigned', !!a);
    targetGrid.appendChild(card);
  });
  targetCol.appendChild(targetGrid);
  columns.appendChild(targetCol);

  out.appendChild(columns);

  setStatus(
    `Art mapping editor — ${state.pair.target}. ${state.mapping.assignments.length} assigned. ` +
      'Click a source frame to select it, then a target slot to assign.',
  );
}

function selectSource(blockId: number, frameIndex: number): void {
  if (!state) return;
  state.selected = { blockId, frameIndex };
  drawScreen();
}

function assignSelectedTo(slot: number): void {
  if (!state || !state.selected) return;
  state.mapping = assignSlot(state.mapping, slot, state.selected.blockId, state.selected.frameIndex);
  persist();
  drawScreen();
}

function unassign(slot: number): void {
  if (!state) return;
  state.mapping = unassignSlot(state.mapping, slot);
  persist();
  drawScreen();
}

function clearMapping(): void {
  if (!state) return;
  state.mapping = createEmptySlotMapping(state.mapping.target, state.mapping.source);
  persist();
  drawScreen();
}

function downloadMapping(): void {
  if (!state) return;
  const json = serializeSlotMapping(state.mapping);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.mapping.target.replace(/\.TLB$/i, '')}.mapping.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${a.download}.`);
}

async function loadPair(pair: ArtMapPair): Promise<void> {
  const targetPath = CATALOG_BY_ID.get(pair.targetCatalogId)?.path;
  const sourcePath = CATALOG_BY_ID.get(pair.sourceCatalogId)?.path;
  if (!targetPath || !sourcePath) {
    setStatus(`Art map: missing catalog entry for ${pair.target}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return;
  }
  setStatus(`Loading ${pair.target} + ${pair.sourceCatalogId} for art mapping…`);
  try {
    const [targetBytes, sourceBytes] = await Promise.all([fetchBytes(targetPath), fetchBytes(sourcePath)]);
    const targetName = targetPath.split('/').pop() ?? targetPath;
    const sourceName = sourcePath.split('/').pop() ?? sourcePath;
    const target = decodeHlib(targetBytes, targetName);
    const source = decodeDaa(sourceBytes, sourceName);
    const sourceFrames = flattenSourceFrames(source);
    const mapping = restoreMapping(pair);
    state = { pair, source, target, sourceFrames, mapping, selected: null };
  } catch (err) {
    setStatus(`Could not load ${pair.target}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return;
  }

  drawScreen();
  installSeam();
  (window as unknown as { __rendered: number }).__rendered = state.target.images.length;
}

function installSeam(): void {
  (window as unknown as { __artmap?: Record<string, unknown> }).__artmap = {
    pairs: () => ART_MAP_PAIRS.map((p) => p.target),
    currentTarget: () => state?.pair.target ?? null,
    setPair: (target: string) => {
      const p = ART_MAP_PAIRS.find((x) => x.target === target);
      if (p) void loadPair(p);
    },
    sourceFrameCount: () => state?.sourceFrames.length ?? 0,
    sourceFrames: () => state?.sourceFrames.map((f) => ({ blockId: f.blockId, frameIndex: f.frameIndex })) ?? [],
    targetSlotCount: () => state?.target.images.length ?? 0,
    select: (blockId: number, frameIndex: number) => selectSource(blockId, frameIndex),
    assign: (slot: number, sourceBlockId: number, frameIndex: number) => {
      if (!state) return;
      state.mapping = assignSlot(state.mapping, slot, sourceBlockId, frameIndex);
      persist();
      drawScreen();
    },
    unassign: (slot: number) => unassign(slot),
    mapping: () => (state ? JSON.parse(serializeSlotMapping(state.mapping)) : null),
    validate: () => (state ? validateSlotMapping(state.mapping, DQK_ART_LAYOUT) : { valid: false, errors: ['no state'] }),
    clear: () => clearMapping(),
  };
}

export async function startArtMap(target?: string): Promise<number> {
  const pair = ART_MAP_PAIRS.find((p) => p.target === target) ?? ART_MAP_PAIRS[0];
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  await loadPair(pair);
  return state?.target.images.length ?? 0;
}
