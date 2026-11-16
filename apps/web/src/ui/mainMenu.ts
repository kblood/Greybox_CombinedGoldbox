/**
 * CoK **main game menu** (`?mainmenu=1`, and the hub of `?play=cok`) — the party-formation / startup
 * screen the original engine shows after the title, before you enter the world. It renders the pure
 * engine `composeMainMenu` (the byte-verified 10-option command list over the bordered EGA page, with
 * the live party roster) and drives it by keyboard (↑/↓ move, first-letter hotkeys, Enter selects)
 * plus a mirrored HTML button list. Selecting a command routes to the existing view that implements
 * it — Create → the character builder, View → the character sheet, Begin Adventuring → the dungeon —
 * so the boot sequence runs "as the game would run": title → menu → adventure.
 *
 * Mirrors the HUD/Automap panels (load chrome → screen surface → keydown → `window.__mainmenu` seam).
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  composeMainMenu,
  COK_MAIN_MENU,
  type MainMenuMember,
  type IndexedImage,
  type BitmapFont,
  type Palette,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { getParty, partyStatus, partySize, removeFromParty } from './party.js';
import { startCreate, retireCreateSilently } from './create.js';
import { startExplore, type ExploreStartOptions } from './explore.js';
import { startTown, closeTown } from './town.js';
import { openCharSheet, retireCharSheetSilently } from './charSheet.js';
import { startCharEditor, retireCharEditorSilently } from './charEditor.js';
import { importCokParty } from './importParty.js';
import { readSlot, QUICK_SLOT } from './saveStore.js';
import type { AssetSource } from './assetSource.js';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;

/** Hooks let `?play=cok` reuse the same menu as its hub (Begin → dungeon, Exit → back to title). */
export interface MainMenuHooks {
  /**
   * Begin Adventuring with a mustered party. `loadSaved` is set only by the Load Saved Game
   * continuation, which restores the quick slot instead of starting the retail opening.
   */
  onBegin?: (opts?: ExploreStartOptions) => void;
  /** Exit to DOS / leave the menu. */
  onExit?: () => void;
  /** The history route to keep while the menu is mounted (default `?mainmenu=1`). */
  route?: string;
  /** Selected local game install used for archive-backed menu chrome. */
  assetSource?: AssetSource;
}

interface MenuState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  selected: number;
  status: string;
  hooks: MainMenuHooks;
  buttons: HTMLButtonElement[];
}

let state: MenuState | null = null;
// Bumped by every menu start and by every teardown/close. A mount whose chrome load finishes after
// the value moved belongs to a menu nobody owns any more, so it mounts nothing.
let menuSession = 0;
// Bumped by every Add Character import and by every Drop/Remove. A pending import whose token no
// longer matches belongs to a roster the player has already changed, so it must not land on it.
let importSeq = 0;

function roster(): MainMenuMember[] {
  return partyStatus().map((s) => ({
    name: s.name, cls: s.cls, ac: s.ac, hp: s.hp, maxHp: s.maxHp, down: s.down, dead: s.dead,
  }));
}

function setStatus(msg: string): void {
  if (state) state.status = msg;
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

function draw(): void {
  if (!state) return;
  const fb = composeMainMenu({
    frameTiles: state.frameTiles,
    font: state.font,
    view: { roster: roster(), options: COK_MAIN_MENU, selected: state.selected, status: state.status },
  });
  state.surface.paint(fb, EGA_PALETTE);
  state.buttons.forEach((b, i) => b.classList.toggle('sel', i === state!.selected));
}

function move(delta: number): void {
  if (!state) return;
  const n = COK_MAIN_MENU.length;
  state.selected = ((state.selected + delta) % n + n) % n;
  setStatus(''); // M102 — a Guard/Drop/Add/Load confirmation is stale the moment the player looks elsewhere
  draw();
}

function selectByHotkey(ch: string): boolean {
  const c = ch.toUpperCase();
  const idx = COK_MAIN_MENU.findIndex((o) => o[0]!.toUpperCase() === c);
  if (idx < 0 || !state) return false;
  state.selected = idx;
  draw();
  activate();
  return true;
}

/** Run the currently-selected command. */
function activate(): void {
  if (!state) return;
  const option = COK_MAIN_MENU[state.selected]!;
  const tiles = state.frameTiles;
  const font = state.font;
  const hooks = state.hooks;
  switch (option) {
    case 'Create New Character':
      teardown();
      // This menu session owns the creator's Return (goal 221). A return after any newer menu start or
      // teardown reports `false`: the creator keeps its draft and this menu remounts nothing. A newer
      // startCreate is a separate case, handled in create.ts (the older creator's Return never gets here).
      // Begin is not passed: Create never offers Begin here.
      {
        const session = menuSession;
        startCreate(undefined, () => {
          if (session !== menuSession) return false;
          void startMainMenu(hooks);
          return true;
        });
      }
      setStatus('Roll up a new champion, then return to the menu.');
      return;
    case 'Add Character to Party': {
      // The import is owned by this menu session and this import's token. Teardown or replacement, a
      // newer Add, or a Drop/Remove makes it stale: the importer then mutates nothing, and the callback
      // below writes no status and draws nothing.
      const session = menuSession;
      const token = ++importSeq;
      const current = (): boolean => session === menuSession && token === importSeq;
      void importCokParty(hooks.assetSource, current).then((r) => {
        if (r.cancelled || !current()) return;
        if (r.imported.length > 0) setStatus(`Added ${r.imported.length} character(s) to the party.`);
        else setStatus('No saved characters found to add.');
        draw();
      });
      return;
    }
    case 'Drop Character':
    case 'Remove Character from Party': {
      importSeq++; // a pending Add is cancelled even when there is no party to remove
      const n = partySize();
      if (n === 0) { setStatus('No characters to drop.'); return; }
      const name = roster()[n - 1]?.name ?? '';
      removeFromParty(n - 1);
      setStatus(`Dropped ${name}.`);
      draw();
      return;
    }
    case 'Modify Character':
      teardown();
      // Exit/Escape in the editor, or a public build with no save data, returns to this exact menu
      // (same route, AssetSource and Begin/Load hooks) and shows the editor's status line there.
      void startCharEditor('cok', {
        returnToMenu: (status) => { void startMainMenu(hooks, status); },
      });
      return;
    case 'Train Character': {
      teardown();
      // Town Leave / Escape-at-hub return to this exact menu (same AssetSource + Begin/Load hooks).
      // Town's own service Escape still steps back to the hub first (town.ts back()). The return is bound
      // to this menu session (goal 222): a Town left after any newer menu start or teardown remounts nothing.
      const session = menuSession;
      void startTown('cok', () => {
        if (session !== menuSession) return;
        void startMainMenu(hooks);
      }, hooks.assetSource);
      return;
    }
    case 'View Character':
      if (partySize() === 0) { setStatus('No characters to view.'); return; }
      teardown(false); // the sheet overlays; reopen menu on its close
      {
        // Goal 223: the return belongs to this menu session, captured after teardown. A sheet retired
        // by a newer menu start or a replacement never runs it, so no older menu remounts over that one.
        const session = menuSession;
        openCharSheet({
          frameTiles: tiles, font, graphicsGameId: 'cok',
          onClose: () => { if (session !== menuSession) return; void startMainMenu(hooks); },
        });
      }
      return;
    case 'Load Saved Game': {
      // Validate only. The dungeon mount applies the slot exactly once (explore's quickLoad), so the
      // menu never writes the stores itself and never starts the retail opening for a real save.
      const save = readSlot(QUICK_SLOT);
      if (!save) { setStatus('No saved game to load.'); return; }
      if (save.party.length === 0) { setStatus('That saved game has no party to load.'); return; }
      setStatus(`Loading saved game: ${save.name}…`);
      teardown();
      const continuation: ExploreStartOptions = { loadSaved: true };
      if (hooks.onBegin) hooks.onBegin(continuation);
      else void startExplore('cok', hooks.assetSource, continuation);
      return;
    }
    case 'Begin Adventuring':
      if (partySize() === 0) { setStatus('Create or add a character before adventuring.'); return; }
      // A fallen party stays out of the dungeon; Load Saved Game is the recovery route.
      if (getParty().every((member) => member.hp <= 0)) {
        setStatus('The whole party has fallen. Load a saved game to continue.');
        return;
      }
      teardown();
      (hooks.onBegin ?? (() => { void startExplore('cok', hooks.assetSource); }))();
      return;
    case 'Exit to DOS':
      teardown();
      if (hooks.onExit) hooks.onExit();
      else { history.replaceState(null, '', location.pathname); setStatus('Left the game menu.'); }
      return;
  }
}

export function isMainMenuOpen(): boolean {
  return !!state && document.body.contains(state.surface.canvas);
}

/**
 * Remove the menu listeners/state and invalidate any menu mount still waiting on chrome. The status
 * line is left intact (`clearStatus` is kept for the existing call sites; it is not acted on).
 */
function teardown(clearStatus = true): void {
  menuSession++;
  window.removeEventListener('keydown', onKey);
  state = null;
  if (clearStatus) { /* leave the last status visible */ }
}

export function closeMainMenu(): void {
  // Always tear down, even with no mounted state: the teardown bumps menuSession, so a startMainMenu()
  // whose chrome load is still in flight mounts nothing after this close. onExit runs only if mounted.
  const onExit = state?.hooks.onExit;
  teardown();
  if (onExit) onExit();
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  switch (e.key) {
    case 'ArrowDown': case 'ArrowRight': e.preventDefault(); move(1); return;
    case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); move(-1); return;
    case 'Enter': case ' ': e.preventDefault(); activate(); return;
    case 'Escape': e.preventDefault(); state.selected = COK_MAIN_MENU.length - 1; setStatus(''); draw(); return; // highlight Exit
    default:
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) { if (selectByHotkey(e.key)) e.preventDefault(); }
      return;
  }
}

async function loadChrome(assetSource?: AssetSource): Promise<{ frameTiles: IndexedImage[] | null; font: BitmapFont | null }> {
  try {
    let bytes: Uint8Array;
    if (assetSource) {
      const local = await assetSource.readAsset('8X8D1.DAX');
      if (!local) return { frameTiles: null, font: null };
      bytes = local;
    } else {
      const resp = await fetch(assetUrl(TILES_PATH));
      if (!resp.ok) return { frameTiles: null, font: null };
      bytes = new Uint8Array(await resp.arrayBuffer());
    }
    const blocks = new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
    const frameRaw = blocks.get(FRAME_BLOCK);
    const frameTiles = frameRaw ? decode8x8dBlock(frameRaw, `8X8D1#${FRAME_BLOCK}`, { transparentMagenta: true }).tiles : null;
    return { frameTiles, font: loadCokFont(bytes) };
  } catch {
    return { frameTiles: null, font: null };
  }
}

/**
 * Boot the main game menu. Returns the party size (the render marker).
 *
 * `returnStatus` is the line a returning caller (the character editor's Exit/Escape or the public-build
 * unavailable case) wants shown. It goes into the first state and paint, and the HTML status line,
 * so no later async write is needed. A mount whose chrome load finishes after a newer menu started,
 * or after this menu was torn down or closed, mounts nothing and shows nothing.
 */
export async function startMainMenu(hooks: MainMenuHooks = {}, returnStatus?: string): Promise<number> {
  const session = ++menuSession;
  // A newer menu replaces any mounted or pending one now, before the chrome await. A character editor
  // that is still mounted (or mid-open) is retired silently: its return continuation must not remount
  // an older menu over this one, and no status is written for it.
  window.removeEventListener('keydown', onKey);
  state = null;
  retireCharEditorSilently();
  // A creator that is still live (goal 221) is retired silently too: its Return then fails the session
  // check before any callback runs, so an old creator cannot remount an older menu over this one.
  retireCreateSilently();
  // A Town that is mounted or still loading (goal 222) is retired silently too. Its Leave continuation is
  // never run for it, so an old Town cannot remount an older menu over this one.
  closeTown();
  // A character sheet that is still open (goal 223) is retired silently too, with its own pack screen.
  // Its onClose (which would remount an older menu) never runs for it, and nothing is written.
  retireCharSheetSilently();
  closeDungeon3d();
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  history.replaceState(null, '', hooks.route ?? '?mainmenu=1');

  const { frameTiles, font } = await loadChrome(hooks.assetSource);
  if (session !== menuSession) return partySize();

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML = '<b>↑/↓</b> move · <b>Enter</b> select · first-letter hotkeys · <b>Esc</b> Exit. The original Champions of Krynn party menu.';
  frame.appendChild(menu);

  // Mirrored HTML button list (one per real option) for click interaction + e2e.
  const bar = el('div', 'menu-buttons');
  const buttons: HTMLButtonElement[] = [];
  COK_MAIN_MENU.forEach((label, i) => {
    const b = el('button', 'gb-btn menu-opt', label) as HTMLButtonElement;
    b.type = 'button';
    // Goal 222: each mirrored button is bound to the menu session that created it. A detached button from
    // an earlier menu (retained by a caller, or left behind by a replaced menu) must not drive the current one.
    b.addEventListener('click', () => {
      if (session !== menuSession || !state) return;
      state.selected = i; draw(); activate();
    });
    bar.appendChild(b);
    buttons.push(b);
  });
  frame.appendChild(bar);
  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  // Default cursor on "Begin Adventuring" if a party exists, else "Create New Character".
  const selected = partySize() > 0 ? COK_MAIN_MENU.indexOf('Begin Adventuring') : 0;
  state = {
    surface, frameTiles, font, selected, hooks, buttons,
    status: returnStatus ?? (partySize() > 0 ? 'Choose Begin Adventuring to enter the world.' : 'Create a character to begin.'),
  };
  if (returnStatus !== undefined) setStatus(returnStatus); // mirror the returned line to the HTML status too
  draw();
  surface.refresh();
  surface.canvas.focus();

  // Headless e2e seam. Its guard is local to this startMainMenu call: the seam acts only while this
  // menu session is still current and a menu state is mounted. A retained seam from an earlier menu
  // therefore changes nothing once a newer menu, a teardown, Exit or close has moved on.
  const live = (): boolean => session === menuSession && state !== null;
  (window as unknown as { __mainmenu?: Record<string, unknown> }).__mainmenu = {
    open: (h?: MainMenuHooks) => startMainMenu(h),
    isOpen: () => isMainMenuOpen(),
    options: () => [...COK_MAIN_MENU],
    selected: () => state?.selected ?? -1,
    title: () => 'Champions of Krynn',
    move: (d: number) => { if (live()) move(d); },
    select: (i: number) => { if (live() && state) { state.selected = i; draw(); } },
    hotkey: (c: string) => (live() ? selectByHotkey(c) : false),
    activate: () => { if (live()) activate(); },
    roster: () => roster(),
    status: () => state?.status ?? '',
    close: () => { if (live()) closeMainMenu(); },
  };
  (window as unknown as { __rendered: number }).__rendered = partySize();
  return partySize();
}
