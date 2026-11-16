/**
 * Automap panel (D1, `?automap=1`) — a dedicated, persistent overview of a dungeon level: every cell
 * the party has discovered (fog of war), the walls/doors found on them, the party's start position,
 * and player-pinned notes per cell. The DOS games shipped *no* in-game map (you drew grids on graph
 * paper); this is the Greybox companion aid, lifted into the engine so it persists across sessions.
 *
 * Mirrors the HUD / Journal overlays (load chrome → screen surface → keydown → `window.__automap`
 * e2e seam) so it slots into the same sidebar/route pattern. The visited cells + notes live in the
 * pure engine {@link Automap} model and round-trip through localStorage (`greybox.automap.cok`); the
 * pure engine {@link composeAutomapPanel} renders one 320×200 EGA framebuffer. Clicking a cell on the
 * canvas selects + reveals it; the note bar pins JSON notes to the selected cell.
 */
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  loadDungeon,
  makeEgaPalette,
  DOS_EGA,
  Automap,
  composeAutomapPanel,
  automapGridLayout,
  type IndexedImage,
  type BitmapFont,
  type Palette,
  type GameMap,
  type DungeonSources,
} from '@goldbox/engine';
import { gameData } from './gameData.js';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { followPresentationScale, presentationFitOptions } from './runtimeGraphicsMode.js';

const EGA_PALETTE: Palette = makeEgaPalette();
const FRAME_BLOCK = 202;
const STORE_KEY = 'greybox.automap.cok';

interface AutomapUiState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  map: GameMap;
  automap: Automap;
  pose: { x: number; y: number; facing: 'north' | 'east' | 'south' | 'west' } | null;
  selected: { x: number; y: number } | null;
}

let state: AutomapUiState | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

/** Restore the persisted automap for this map's dimensions (or a fresh one). */
function restoreAutomap(map: GameMap): Automap {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Only reuse persisted data when it matches this map's grid; else start fresh.
      if (data && data.width === map.width && data.height === map.height) {
        return Automap.fromJSON(data, map.width, map.height);
      }
    }
  } catch { /* corrupt store → fresh */ }
  return new Automap(map.width, map.height);
}

function persist(): void {
  if (!state) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.automap.toJSON())); } catch { /* quota */ }
}

function statusLine(): string {
  if (!state) return '';
  const total = state.map.width * state.map.height;
  const parts = [`${state.automap.visitedCount}/${total} cells`];
  if (state.automap.noteCount) parts.push(`${state.automap.noteCount} notes`);
  if (state.selected) parts.push(`sel (${state.selected.x},${state.selected.y})`);
  return parts.join(' · ');
}

function drawScreen(): void {
  if (!state) return;
  const fb = composeAutomapPanel({
    frameTiles: state.frameTiles,
    font: state.font,
    title: `Automap · ${state.map.name}`,
    map: state.map,
    automap: state.automap,
    pose: state.pose,
    status: statusLine(),
    menu: { items: ['Pin Note', 'Close'], selected: 0 },
  });
  state.surface.paint(fb, EGA_PALETTE);
  updateNoteBar();
}

/** Update the note input bar to reflect the currently selected cell. */
function updateNoteBar(): void {
  if (!state) return;
  const label = document.querySelector('#am-sel') as HTMLElement | null;
  const input = document.querySelector('#am-note') as HTMLInputElement | null;
  if (label) label.textContent = state.selected ? `(${state.selected.x}, ${state.selected.y})` : '— click a cell —';
  if (input && state.selected) input.value = state.automap.getNote(state.selected.x, state.selected.y) ?? '';
}

/** Map a canvas-pixel click to a grid cell, or null if outside the grid. */
function cellAtPixel(px: number, py: number): { x: number; y: number } | null {
  if (!state) return null;
  const { cellPx, originX, originY } = automapGridLayout(state.map.width, state.map.height);
  if (cellPx <= 0) return null;
  const x = Math.floor((px - originX) / cellPx);
  const y = Math.floor((py - originY) / cellPx);
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return null;
  return { x, y };
}

function onCanvasClick(ev: MouseEvent): void {
  if (!state) return;
  // Same letterboxed rectangle the surface paints into: a click on a bar maps to no native pixel.
  const native = state.surface.nativePointAt(ev.clientX, ev.clientY);
  if (!native) return;
  const cell = cellAtPixel(native.x, native.y);
  if (!cell) return;
  state.selected = cell;
  state.automap.visit(cell.x, cell.y); // clicking reveals the cell
  persist();
  drawScreen();
}

/** Pin (or clear when empty) a note on the selected cell. */
function pinNote(): void {
  if (!state || !state.selected) { setStatus('Click a cell first, then pin a note.'); return; }
  const input = document.querySelector('#am-note') as HTMLInputElement | null;
  const text = input ? input.value : '';
  state.automap.setNote(state.selected.x, state.selected.y, text);
  persist();
  drawScreen();
  setStatus(text.trim() ? 'Note pinned.' : 'Note cleared.');
}

export function isAutomapOpen(): boolean {
  return !!state && document.body.contains(state.surface.canvas);
}

export function closeAutomap(): void {
  if (!state) return;
  window.removeEventListener('keydown', onKey);
  state = null;
  history.replaceState(null, '', '?explore=1');
  setStatus('You fold up the map.');
  void import('./explore.js').then((m) => m.startExplore()).catch(() => { /* explore may need data */ });
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  switch (e.key) {
    case 'Escape': case 'Backspace':
      e.preventDefault(); closeAutomap(); return;
    case 'r': case 'R':
      e.preventDefault(); drawScreen(); return;
  }
}

async function loadChrome(tilesPath: string): Promise<{ frameTiles: IndexedImage[] | null; font: BitmapFont | null; bytes: Uint8Array | null }> {
  try {
    const resp = await fetch(assetUrl(tilesPath));
    if (!resp.ok) return { frameTiles: null, font: null, bytes: null };
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const blocks = new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
    const frameRaw = blocks.get(FRAME_BLOCK);
    const frameTiles = frameRaw ? decode8x8dBlock(frameRaw, `8X8D1#${FRAME_BLOCK}`, { transparentMagenta: true }).tiles : null;
    return { frameTiles, font: loadCokFont(bytes), bytes };
  } catch {
    return { frameTiles: null, font: null, bytes: null };
  }
}

/** Fetch a DAX archive and index its DATA blocks by id → decompressed bytes. */
async function fetchDaxBlocks(path: string): Promise<Map<number, Uint8Array>> {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  return new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
}

/** Load just the CoK dungeon map geometry (ECL init → GEO + walls), no ECL run / audio. */
async function loadCokMap(): Promise<GameMap> {
  const gd = gameData('cok');
  const [eclIdx, geoIdx, wdIdx] = await Promise.all([
    fetchDaxBlocks(gd.eclPath),
    fetchDaxBlocks(gd.geoPath),
    fetchDaxBlocks(gd.walldefPath),
  ]);
  const initEcl = eclIdx.get(gd.eclInitBlock);
  if (!initEcl) throw new Error(`ECL block ${gd.eclInitBlock} not found`);
  const sources: DungeonSources = {
    geoBlock: (id) => geoIdx.get(id) ?? null,
    walldefBlock: (id) => wdIdx.get(id) ?? null,
    tileBlock: () => null, // map geometry only — no tile art needed for the automap
  };
  return loadDungeon(initEcl, sources, { label: `${gd.title} ECL1#${gd.eclInitBlock}` }).map;
}

/** Boot the Automap panel (`?automap=1`). Returns the visited-cell count (the render marker). */
export async function startAutomap(): Promise<number> {
  // The standalone map inspector reads fixed CoK archives directly. Production
  // game data is user-supplied through the Library and is not copied into the app.
  if (import.meta.env.PROD) {
    setStatus('Open Champions of Krynn from the Library to view its map.');
    return 0;
  }
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  setStatus('Unrolling the map…');

  const gd = gameData('cok');
  const { frameTiles, font } = await loadChrome(gd.tilesPath);

  let map: GameMap;
  try {
    map = await loadCokMap();
  } catch (err) {
    setStatus(`Automap unavailable: ${(err as Error).message}`);
    // Minimal empty map so the panel still mounts (e2e + offline degrade).
    map = { name: 'No Map', width: 8, height: 8, cells: Array.from({ length: 64 }, () => ({ walls: { north: 0, east: 0, south: 0, west: 0 } })), entries: [] };
  }

  const automap = restoreAutomap(map);
  const start = map.entries[0] ?? null;
  const pose = start ? { x: start.x, y: start.y, facing: start.facing } : null;
  if (pose) automap.visit(pose.x, pose.y); // the party's start square is known

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA, presentationFitOptions('cok'));
  followPresentationScale(surface, 'cok');
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  // Note bar — select a cell on the canvas, then pin a JSON note to it.
  const noteBar = el('div', 'gb-menu');
  noteBar.innerHTML =
    'Click a cell to reveal + select it. Selected: <b id="am-sel">— click a cell —</b> &nbsp; ' +
    '<input id="am-note" type="text" maxlength="48" placeholder="note for this cell" style="width:14em">';
  const pinBtn = el('button', 'gb-btn', '📌 Pin note') as HTMLButtonElement;
  pinBtn.type = 'button';
  pinBtn.addEventListener('click', () => pinNote());
  noteBar.appendChild(pinBtn);
  frame.appendChild(noteBar);

  const menu = el('div', 'gb-menu');
  menu.innerHTML = '<b>Esc</b> close · <b>R</b>efresh · click reveals a cell. Walls <span style="color:#7fd0ff">━</span> doors <span style="color:#ffce54">╴╴</span> notes <span style="color:#ff77ff">■</span>.';
  frame.appendChild(menu);
  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.style.cursor = 'crosshair';
  surface.canvas.addEventListener('click', onCanvasClick);
  window.addEventListener('keydown', onKey);

  state = { surface, frameTiles, font, map, automap, pose, selected: pose ? { ...pose } : null };
  persist();
  drawScreen();
  surface.canvas.focus();
  setStatus(`Automap: ${automap.visitedCount} cells known.`);

  // Headless e2e seam.
  (window as unknown as { __automap?: Record<string, unknown> }).__automap = {
    open: () => startAutomap(),
    close: () => closeAutomap(),
    isOpen: () => isAutomapOpen(),
    dims: () => (state ? { width: state.map.width, height: state.map.height } : null),
    visitedCount: () => state?.automap.visitedCount ?? 0,
    isVisited: (x: number, y: number) => state?.automap.isVisited(x, y) ?? false,
    visit: (x: number, y: number) => { const r = state?.automap.visit(x, y) ?? false; persist(); drawScreen(); return r; },
    select: (x: number, y: number) => { if (state) { state.selected = { x, y }; drawScreen(); } },
    selected: () => state?.selected ?? null,
    note: (x: number, y: number, text: string) => { const r = state?.automap.setNote(x, y, text) ?? false; persist(); drawScreen(); return r; },
    noteAt: (x: number, y: number) => state?.automap.getNote(x, y) ?? null,
    clearNote: (x: number, y: number) => { const r = state?.automap.clearNote(x, y) ?? false; persist(); drawScreen(); return r; },
    noteCount: () => state?.automap.noteCount ?? 0,
    notes: () => state?.automap.notes() ?? [],
    reset: () => { state?.automap.reset(); persist(); drawScreen(); },
    refresh: () => drawScreen(),
  };
  (window as unknown as { __rendered: number }).__rendered = automap.visitedCount;
  return automap.visitedCount;
}
