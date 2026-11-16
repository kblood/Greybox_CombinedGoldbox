/**
 * Menus view (`?menus=1`) — the original Champions of Krynn in-game command menus, drawn the
 * way the game drew them: the dungeon command bar ("Area Cast View Encamp Search Look") and the
 * Encamp sub-menu ("Save View Magic Rest Alter Fix Exit"), rendered on the real exploration
 * screen chrome via `composeExploreScreen` + the engine's shared Gold Box menu renderer.
 *
 * Selection moves with ←/→ (wrapping); Enter or the verb's hotkey letter activates it. Choosing
 * Encamp opens the camp sub-menu; Exit returns to the dungeon bar. This is the menu look + flow;
 * the verbs' full effects (real Save/Magic/Rest) land as the explore loop adopts these menus.
 *
 * `window.__menus` is the headless e2e seam.
 */
import {
  decode8x8dBlock,
  readDaxDataBlocks,
  composeExploreScreen,
  loadCokFont,
  makeEgaPalette,
  menuHotkey,
  GB_MENU_DUNGEON,
  GB_MENU_ENCAMP,
  DOS_EGA,
  type IndexedImage,
  type Palette,
  type BitmapFont,
  type ExploreParty,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;

type MenuMode = 'dungeon' | 'encamp';

const MENUS: Record<MenuMode, readonly string[]> = {
  dungeon: GB_MENU_DUNGEON,
  encamp: GB_MENU_ENCAMP,
};

const DEMO_PARTY: ExploreParty[] = [
  { name: 'Sturm', ac: 2, hp: 44, active: true },
  { name: 'Caramon', ac: 3, hp: 46 },
  { name: 'Goldmoon', ac: 4, hp: 30 },
  { name: 'Raistlin', ac: 8, hp: 16 },
  { name: 'Tasslehoff', ac: 5, hp: 28 },
  { name: 'Tanis', ac: 4, hp: 40 },
];

interface MenuState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  mode: MenuMode;
  selected: Record<MenuMode, number>;
  message: string;
}

let state: MenuState | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status');
  if (s) s.textContent = msg;
}

async function fetchDaxBytes(path: string): Promise<Uint8Array> {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

function items(): readonly string[] {
  return MENUS[state!.mode];
}

function draw(): void {
  if (!state) return;
  const fb = composeExploreScreen({
    frameTiles: state.frameTiles,
    font: state.font,
    party: DEMO_PARTY,
    position: state.mode === 'encamp' ? 'CAMP' : '12,7 NORTH 06:30',
    message: state.message,
    menu: { items: items(), selected: state.selected[state.mode] },
  });
  state.surface.paint(fb, EGA_PALETTE);
}

/** Run the effect of the selected verb (mode change + a faithful status message). */
function activate(index: number): void {
  if (!state) return;
  const verb = items()[index];
  if (!verb) return;
  state.selected[state.mode] = index;
  if (state.mode === 'dungeon') {
    if (verb === 'Encamp') {
      state.mode = 'encamp';
      state.message = 'You make camp.';
    } else {
      state.message = `${verb.toUpperCase()}…`;
    }
  } else {
    if (verb === 'Exit') {
      state.mode = 'dungeon';
      state.message = 'You break camp.';
    } else if (verb === 'Save') {
      state.message = 'Game saved.';
    } else if (verb === 'Rest') {
      state.message = 'The party rests. Wounds are tended.';
    } else if (verb === 'Magic') {
      state.message = 'Whose magic? (Cast / Memorize / Scribe…)';
    } else {
      state.message = `${verb.toUpperCase()}…`;
    }
  }
  draw();
}

function move(delta: number): void {
  if (!state) return;
  const n = items().length;
  state.selected[state.mode] = ((state.selected[state.mode] + delta) % n + n) % n;
  draw();
}

function pressHotkey(key: string): boolean {
  if (!state) return false;
  const k = key.toUpperCase();
  const idx = items().findIndex((v) => menuHotkey(v) === k);
  if (idx < 0) return false;
  activate(idx);
  return true;
}

function onKey(e: KeyboardEvent): void {
  switch (e.key) {
    case 'ArrowLeft': move(-1); break;
    case 'ArrowRight': move(1); break;
    case 'Enter': case ' ': activate(state!.selected[state!.mode]); break;
    default:
      if (e.key.length === 1 && pressHotkey(e.key)) e.preventDefault();
      return;
  }
  e.preventDefault();
}

export async function startMenus(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading CoK menu assets…');

  let frameTiles: IndexedImage[] | null = null;
  let font: BitmapFont | null = null;
  try {
    const tileBytes = await fetchDaxBytes(TILES_PATH);
    const blocks = new Map(readDaxDataBlocks(tileBytes).map((b) => [b.blockId, b.raw]));
    const frameRaw = blocks.get(FRAME_BLOCK);
    if (frameRaw) frameTiles = decode8x8dBlock(frameRaw, `8X8D1#${FRAME_BLOCK}`, { transparentMagenta: true }).tiles;
    font = loadCokFont(tileBytes);
  } catch (err) {
    setStatus(`Could not load menus: ${err instanceof Error ? err.message : String(err)}`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const help = el('div', 'gb-menu');
  help.innerHTML =
    '<b>← →</b> Choose · <b>Enter</b> select · <b>hotkey letter</b> jumps &nbsp; ' +
    '<span style="color:#9aa">(original dungeon &amp; Encamp menus)</span>';
  frame.appendChild(help);
  screen.appendChild(frame);
  out.appendChild(screen);

  state = {
    surface,
    frameTiles,
    font,
    mode: 'dungeon',
    selected: { dungeon: 0, encamp: 0 },
    message: 'The corridor stretches north.',
  };
  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);
  draw();
  surface.canvas.focus();
  setStatus('Champions of Krynn — in-game command menus.');

  (window as unknown as { __menus?: Record<string, unknown> }).__menus = {
    mode: () => state?.mode ?? null,
    items: () => [...items()],
    selected: () => state?.selected[state!.mode] ?? -1,
    move: (d: number) => move(d),
    activate: (i: number) => activate(i),
    hotkey: (k: string) => pressHotkey(k),
    message: () => state?.message ?? '',
  };
  (window as unknown as { __rendered: number }).__rendered = GB_MENU_DUNGEON.length;
  return GB_MENU_DUNGEON.length;
}
