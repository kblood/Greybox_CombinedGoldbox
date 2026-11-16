/**
 * HUD companion panel (D2, `?hud=1`) — an always-available, read-only roster sheet the player can
 * pop over any screen to check the party at a glance: name / HP (cur/max) / XP / AC / class +
 * condition (active / down / dead). It reads the live shared roster via `partyStatus()` and the
 * name-keyed XP store via `getXp`, feeds those rows to the pure engine `composeHudPanel` compositor
 * (one 320×200 EGA framebuffer), and closes on Esc. No game state is mutated — this is a viewer.
 *
 * Mirrors the Journal overlay structure (load chrome → screen surface → keydown → `window.__hud`
 * e2e seam) so the slice slots into the same sidebar/route pattern as the other panels.
 */
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  composeHudPanel,
  type HudRow,
  type IndexedImage,
  type BitmapFont,
  type Palette,
} from '@goldbox/engine';
import { partyStatus, getXp } from './party.js';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;

interface HudUiState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
}

let state: HudUiState | null = null;

/**
 * Build the live HUD rows from the shared roster + XP store (read-only). Exported (M10.S2) so
 * the in-play Companion panel host (`companionPanel.ts`) can reuse the exact same live-data
 * projection instead of re-implementing it — there is only one roster/XP store to read.
 */
export function buildRows(): HudRow[] {
  return partyStatus().map((s) => ({
    name: s.name,
    hp: s.hp,
    maxHp: s.maxHp,
    xp: getXp(s.name),
    ac: s.ac,
    cls: s.cls,
    down: s.down,
    dead: s.dead,
  }));
}

export function statusLine(rows: HudRow[]): string {
  if (rows.length === 0) return 'No party — create or import one first.';
  const down = rows.filter((r) => r.down && !r.dead).length;
  const dead = rows.filter((r) => r.dead).length;
  const parts = [`${rows.length} in party`];
  if (down) parts.push(`${down} down`);
  if (dead) parts.push(`${dead} slain`);
  return parts.join(' · ');
}

function drawScreen(): void {
  if (!state) return;
  const rows = buildRows();
  const fb = composeHudPanel({
    frameTiles: state.frameTiles,
    font: state.font,
    title: 'Party Status',
    rows,
    status: statusLine(rows),
    menu: { items: ['Close'], selected: 0 },
  });
  state.surface.paint(fb, EGA_PALETTE);
}

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

/** True while the HUD overlay is mounted. */
export function isHudOpen(): boolean {
  return !!state && document.body.contains(state.surface.canvas);
}

/** Close the HUD and return to the exploration screen. */
export function closeHud(): void {
  if (!state) return;
  window.removeEventListener('keydown', onKey);
  state = null;
  history.replaceState(null, '', '?explore=1');
  setStatus('You close the party panel.');
  void import('./explore.js').then((m) => m.startExplore()).catch(() => { /* explore may need data */ });
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  switch (e.key) {
    case 'Escape': case 'Backspace': case 'Enter': case ' ':
      e.preventDefault();
      closeHud();
      return;
    case 'r': case 'R':
      e.preventDefault();
      drawScreen(); // manual refresh of the live values
      return;
  }
}

async function loadChrome(): Promise<{ frameTiles: IndexedImage[] | null; font: BitmapFont | null }> {
  try {
    const resp = await fetch(assetUrl(TILES_PATH));
    if (!resp.ok) return { frameTiles: null, font: null };
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const blocks = new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
    const frameRaw = blocks.get(FRAME_BLOCK);
    const frameTiles = frameRaw ? decode8x8dBlock(frameRaw, `8X8D1#${FRAME_BLOCK}`, { transparentMagenta: true }).tiles : null;
    return { frameTiles, font: loadCokFont(bytes) };
  } catch {
    return { frameTiles: null, font: null };
  }
}

/** Boot the HUD companion panel (`?hud=1`). Returns the party size (the render marker). */
export async function startHud(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  setStatus('Opening the party panel…');

  const { frameTiles, font } = await loadChrome();

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>Esc</b> close · <b>R</b>efresh. A read-only glance at the party — HP, XP, AC, class and condition.';
  frame.appendChild(menu);
  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  state = { surface, frameTiles, font };
  drawScreen();
  surface.canvas.focus();
  setStatus('The party checks itself over.');

  // Headless e2e seam.
  (window as unknown as { __hud?: Record<string, unknown> }).__hud = {
    open: () => startHud(),
    close: () => closeHud(),
    isOpen: () => isHudOpen(),
    rows: () => buildRows(),
    names: () => buildRows().map((r) => r.name),
    count: () => buildRows().length,
    refresh: () => drawScreen(),
  };
  (window as unknown as { __rendered: number }).__rendered = buildRows().length;
  return buildRows().length;
}
