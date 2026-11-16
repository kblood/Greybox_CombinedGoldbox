/**
 * CoK title menu — the real **"Play" / "Demo"** two-hotkey prompt shown at the title screen
 * (`START.EXE` file offset `0x21e`, byte-verified: `docs/engine/research/cok-demo-decompile.md`
 * §1). It appears after the boot title frames (`intro.ts`) finish and before the main game menu:
 *
 *   - **P** selects Play (continues to the real party-formation menu, `mainMenu.ts`).
 *   - **D** selects Demo (launches the attract sequence, `demo.ts`).
 *   - `,` / `.` cycle which word is highlighted; **Enter** / **Space** confirms the highlighted word
 *     (COAB `ovr027.displayInput`'s `BuildInputKeys`/selection contract — see the research doc §1.2).
 *   - Left untouched for `idleMs` (default 30000, matching COAB's `displayInputSecondsToWait=30`
 *     with `displayInputTimeoutValue='D'`), the prompt **auto-selects Demo** — the classic
 *     arcade attract-mode idle behaviour the user described.
 *
 * This replaces the prior placeholder (a bare "press any key… D = Play Demo" hint baked into
 * `intro.ts`) with the actual two-option menu the original renders, and is the one place `D`
 * (or idle) reaches the demo now — see `docs/engine/research/cok-demo-decompile.md` §4-5.
 *
 * **Honesty (RE):** the two-hotkey structure, the `,`/`.`/Enter selection contract, and "idle
 * defaults to Demo" are byte-located (the string) + COAB-source-verified (the mechanism) — see
 * the research doc. The *exact* 30-second duration is a COAB literal, not independently
 * re-confirmed against CoK's own compiled constant (doc §1.2's caveat); it is used here as the
 * best-evidence default and is deliberately **injectable** (`idleMs`) so tests never wait a real
 * 30 seconds — see `startTitleMenu`'s `hooks.idleMs`.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import { el } from './render.js';

export interface TitleMenuHooks {
  /** Play was chosen (hotkey `P`, confirmed highlight, or Enter/Space with Play highlighted). */
  onPlay?: () => void;
  /** Demo was chosen (hotkey `D`, confirmed highlight, or the idle timeout). */
  onDemo?: () => void;
  /** Idle timeout before auto-selecting Demo, in ms. Default 30000 (COAB's `displayInputSecondsToWait`). */
  idleMs?: number;
  /** History route to keep while the menu is shown (default `?titlemenu=1`). */
  route?: string;
  /** Status-bar title (default `'Champions of Krynn v1.2'`). */
  title?: string;
}

type Word = 'play' | 'demo';

interface State {
  hooks: TitleMenuHooks;
  highlighted: Word;
  timer: number | null;
  idleMs: number;
  box: HTMLElement;
}

let state: State | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

function render(): void {
  if (!state) return;
  state.box.querySelector('.tm-play')?.classList.toggle('sel', state.highlighted === 'play');
  state.box.querySelector('.tm-demo')?.classList.toggle('sel', state.highlighted === 'demo');
}

/** Highlight `w` on `session` — a replaced or closed prompt's session changes nothing. */
function highlight(w: Word, session: State | null = state): void {
  if (!session || session !== state) return;
  session.highlighted = w;
  render();
}

/** Tear down listeners/timer/DOM without firing a hook (used both by `fire` and a bare close). */
function teardown(): void {
  if (!state) return;
  if (state.timer !== null) { window.clearTimeout(state.timer); state.timer = null; }
  window.removeEventListener('keydown', onKey, true);
  state.box.remove();
  state = null;
}

/**
 * Confirm `which` on `session` — tear down, then call its matching hook exactly once. Only the
 * live prompt (`session === state`) acts, so a retained button, timer or seam call from a prompt
 * that was replaced by a newer `startTitleMenu` returns with no effect.
 */
function fire(which: Word, session: State | null = state): void {
  if (!session || session !== state) return;
  const hooks = session.hooks;
  teardown();
  if (which === 'demo') hooks.onDemo?.();
  else hooks.onPlay?.();
}

function onKey(e: KeyboardEvent): void {
  if (!state) return;
  if (e.target instanceof Element && e.target.closest('[data-cok-title-graphics]')) return;
  switch (e.key) {
    case 'p': case 'P': e.preventDefault(); fire('play'); return;
    case 'd': case 'D': e.preventDefault(); fire('demo'); return;
    case ',': case '.': e.preventDefault(); highlight(state.highlighted === 'play' ? 'demo' : 'play'); return;
    case 'Enter': case ' ': e.preventDefault(); fire(state.highlighted); return;
    default: return;
  }
}

export function isTitleMenuOpen(): boolean {
  return state !== null;
}

/** Confirm the currently-highlighted word (mirrors an Enter press) — a small helper for the seam. */
export function confirmTitleMenu(): void {
  if (state) fire(state.highlighted);
}

/**
 * Show the title's real Play/Demo prompt. Mounts over whatever is already in `#output .gb-frame`
 * (the last title frame `intro.ts` left on screen — the original overlays this prompt on the same
 * title art, it doesn't cut to a blank screen), so no image is loaded here. Falls back to a plain
 * `#output` container if no frame exists (e.g. the standalone `?titlemenu=1` route).
 */
export function startTitleMenu(hooks: TitleMenuHooks = {}): void {
  closeDungeon3d();
  teardown(); // never stack two menus
  history.replaceState(null, '', hooks.route ?? '?titlemenu=1');
  setStatus(hooks.title ?? 'Champions of Krynn v1.2');

  // Drop any leftover intro hint/demo-button (the placeholder this replaces) so only one prompt shows.
  document.querySelectorAll('.gb-intro-hint').forEach((n) => n.remove());

  const host = (document.querySelector('#output .gb-frame') as HTMLElement | null)
    ?? (document.querySelector('#output') as HTMLElement | null)
    ?? document.body;

  const idleMs = hooks.idleMs ?? 30000;
  const box = el('div', 'gb-menu gb-title-menu');
  // This mount's session; its object identity is the guard. Buttons, the idle timer and the seam
  // act only while it is still `state` (see `fire`/`highlight`), so a replaced prompt's retained
  // references cannot act on a newer prompt.
  const mine: State = { hooks, highlighted: 'play', timer: null, idleMs, box };
  const line = el('span');
  const playWord = el('b', 'tm-word tm-play', 'Play');
  const demoWord = el('b', 'tm-word tm-demo', 'Demo');
  line.appendChild(playWord);
  line.appendChild(document.createTextNode(' '));
  line.appendChild(demoWord);
  line.appendChild(document.createTextNode(' — press '));
  const pKey = el('b', undefined, 'P'); line.appendChild(pKey);
  line.appendChild(document.createTextNode('/'));
  const dKey = el('b', undefined, 'D'); line.appendChild(dKey);
  box.appendChild(line);
  const hint = el('div', 'gb-title-menu-hint', ', / . to choose · Enter to confirm · idle auto-starts Demo');
  box.appendChild(hint);

  const bar = el('div', 'menu-buttons');
  const playBtn = el('button', 'gb-btn menu-opt', '▶ Play') as HTMLButtonElement;
  playBtn.type = 'button';
  playBtn.addEventListener('click', () => fire('play', mine));
  const demoBtn = el('button', 'gb-btn menu-opt', '▷ Demo') as HTMLButtonElement;
  demoBtn.type = 'button';
  demoBtn.addEventListener('click', () => fire('demo', mine));
  bar.appendChild(playBtn);
  bar.appendChild(demoBtn);
  box.appendChild(bar);

  host.appendChild(box);

  mine.timer = window.setTimeout(() => fire('demo', mine), idleMs);

  state = mine;
  render();
  window.addEventListener('keydown', onKey, true);

  // Headless e2e seam. Reads answer for the live prompt; actions are bound to this mount, so a
  // retained seam object from a replaced prompt does nothing once a newer one has mounted.
  (window as unknown as { __titleMenu?: Record<string, unknown> }).__titleMenu = {
    isOpen: () => isTitleMenuOpen(),
    highlighted: () => state?.highlighted ?? null,
    idleMs: () => state?.idleMs ?? idleMs,
    cycle: () => highlight(mine.highlighted === 'play' ? 'demo' : 'play', mine),
    hotkey: (c: string) => { if (c === 'p' || c === 'P') fire('play', mine); else if (c === 'd' || c === 'D') fire('demo', mine); },
    confirm: () => fire(mine.highlighted, mine),
    // Deterministic stand-in for waiting out the real timeout — never sleep 30s in a test.
    fireTimeout: () => fire('demo', mine),
  };
  (window as unknown as { __rendered: number }).__rendered = 1;
}
