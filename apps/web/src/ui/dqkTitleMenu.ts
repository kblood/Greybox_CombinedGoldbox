/**
 * The Dark Queen of Krynn's own title prompt — **"Play Demo Quit"**.
 *
 * This is a *different* mechanism from the Gen1 titles' `titleMenu.ts` (CoK/DoK/CoAB/Secret/
 * Gateway all share one COAB-source-verified `,`/`.`-cycle + hotkey + 30s-idle-to-Demo contract).
 * DQK is Gen2: `docs/engine/research/dqk-start-load-route-anchors.md` byte-verified the exact
 * string `Play Demo Quit` (far pointer `422e:4ed4`, live-dumped by a Unicorn trace at `0bdb:1e3d`)
 * and proved it's rendered by a *different* internal widget — a resident "mode-2 generic form"
 * (`0bdb:1008`), not the overlay-027 `displayInput` two-hotkey widget CoK/COAB use. The same trace
 * proved the form is **case-sensitive**: the fake BIOS key `0x1970` (scan 0x19, ascii `'p'`) did
 * NOT select Play, but `0x1950` (scan 0x19, ascii `'P'`) did, and advanced the route into the real
 * overlay-7 party/load form (`25a4:33ef` party-menu-dispatch-loop-entry, traced live).
 *
 * **What's proven vs. approximated, honestly:**
 *   - PROVEN: the exact three-word string, that it's shown after the boot title frames, and that
 *     (uppercase) `P` selects Play and leads to the real party/load game entry.
 *   - NOT YET LOCATED: what Demo's uppercase-`D` selection actually plays — no live trace has
 *     reached and decoded that branch yet (see `docs/engine/research/dqk-demo-route.md` if that
 *     research has landed; if the doc doesn't exist yet, it's still an open gap). Per this
 *     project's "don't invent content" rule, `onDemo` below does NOT play a fabricated attract
 *     sequence — the caller should show an honest "not yet located" state instead.
 *   - NOT INDEPENDENTLY VERIFIED: the exact on-screen navigation contract (arrow/`,`/`.`-cycle,
 *     which key confirms a highlight, idle-timeout-to-Demo). The trace only proves direct hotkeys
 *     work. This module reproduces a plain, reasonable 3-word chooser (arrow keys or click to
 *     highlight, Enter/click to confirm, direct `P`/`D`/`Q` hotkeys) rather than asserting a
 *     byte-matched interaction model it doesn't have evidence for.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import { el } from './render.js';

export interface DqkTitleMenuHooks {
  /** Play was chosen — proven to lead into the real party/load game entry. */
  onPlay?: () => void;
  /** Demo was chosen — target content is genuinely unresolved (see module doc); no fabricated demo. */
  onDemo?: () => void;
  /** Quit was chosen. */
  onQuit?: () => void;
  /** History route to keep while the menu is shown (default `?titlemenu=dqk`). */
  route?: string;
  /** Status-bar title (default `'The Dark Queen of Krynn'`). */
  title?: string;
}

type Word = 'play' | 'demo' | 'quit';
const WORDS: Word[] = ['play', 'demo', 'quit'];

interface State {
  hooks: DqkTitleMenuHooks;
  highlighted: Word;
  box: HTMLElement;
}

let state: State | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

function render(): void {
  if (!state) return;
  for (const w of WORDS) {
    state.box.querySelector(`.dtm-${w}`)?.classList.toggle('sel', state.highlighted === w);
  }
}

function highlight(w: Word): void {
  if (!state) return;
  state.highlighted = w;
  render();
}

function teardown(): void {
  if (!state) return;
  window.removeEventListener('keydown', onKey, true);
  state.box.remove();
  state = null;
}

function fire(which: Word): void {
  if (!state) return;
  const hooks = state.hooks;
  teardown();
  if (which === 'play') hooks.onPlay?.();
  else if (which === 'demo') hooks.onDemo?.();
  else hooks.onQuit?.();
}

function onKey(e: KeyboardEvent): void {
  if (!state) return;
  switch (e.key) {
    case 'p': case 'P': e.preventDefault(); fire('play'); return;
    case 'd': case 'D': e.preventDefault(); fire('demo'); return;
    case 'q': case 'Q': e.preventDefault(); fire('quit'); return;
    case 'ArrowLeft': case ',': {
      e.preventDefault();
      const i = WORDS.indexOf(state.highlighted);
      highlight(WORDS[(i + WORDS.length - 1) % WORDS.length]!);
      return;
    }
    case 'ArrowRight': case '.': {
      e.preventDefault();
      const i = WORDS.indexOf(state.highlighted);
      highlight(WORDS[(i + 1) % WORDS.length]!);
      return;
    }
    case 'Enter': case ' ': e.preventDefault(); fire(state.highlighted); return;
    default: return;
  }
}

export function isDqkTitleMenuOpen(): boolean {
  return state !== null;
}

export function confirmDqkTitleMenu(): void {
  if (state) fire(state.highlighted);
}

/**
 * Show DQK's real "Play Demo Quit" prompt. Mounts over whatever `intro.ts` left on screen (the
 * last title frame), matching the same "overlay the prompt on the title art" pattern the Gen1
 * `titleMenu.ts` uses.
 */
export function startDqkTitleMenu(hooks: DqkTitleMenuHooks = {}): void {
  closeDungeon3d();
  teardown();
  history.replaceState(null, '', hooks.route ?? '?titlemenu=dqk');
  setStatus(hooks.title ?? 'The Dark Queen of Krynn');

  document.querySelectorAll('.gb-intro-hint').forEach((n) => n.remove());

  const host = (document.querySelector('#output .gb-frame') as HTMLElement | null)
    ?? (document.querySelector('#output') as HTMLElement | null)
    ?? document.body;

  const box = el('div', 'gb-menu gb-title-menu gb-dqk-title-menu');
  const line = el('span');
  const playWord = el('b', 'tm-word dtm-play', 'Play');
  const demoWord = el('b', 'tm-word dtm-demo', 'Demo');
  const quitWord = el('b', 'tm-word dtm-quit', 'Quit');
  line.appendChild(playWord);
  line.appendChild(document.createTextNode(' '));
  line.appendChild(demoWord);
  line.appendChild(document.createTextNode(' '));
  line.appendChild(quitWord);
  box.appendChild(line);
  const hint = el('div', 'gb-title-menu-hint', '←/→ to choose · Enter to confirm · P/D/Q hotkeys');
  box.appendChild(hint);

  const bar = el('div', 'menu-buttons');
  const playBtn = el('button', 'gb-btn menu-opt', '▶ Play') as HTMLButtonElement;
  playBtn.type = 'button';
  playBtn.addEventListener('click', () => fire('play'));
  const demoBtn = el('button', 'gb-btn menu-opt', '▷ Demo') as HTMLButtonElement;
  demoBtn.type = 'button';
  demoBtn.addEventListener('click', () => fire('demo'));
  const quitBtn = el('button', 'gb-btn menu-opt', '✕ Quit') as HTMLButtonElement;
  quitBtn.type = 'button';
  quitBtn.addEventListener('click', () => fire('quit'));
  bar.appendChild(playBtn);
  bar.appendChild(demoBtn);
  bar.appendChild(quitBtn);
  box.appendChild(bar);

  host.appendChild(box);

  state = { hooks, highlighted: 'play', box };
  render();
  window.addEventListener('keydown', onKey, true);

  // Headless e2e seam.
  (window as unknown as { __dqkTitleMenu?: Record<string, unknown> }).__dqkTitleMenu = {
    isOpen: () => isDqkTitleMenuOpen(),
    highlighted: () => state?.highlighted ?? null,
    cycle: (dir: 'left' | 'right' = 'right') => {
      if (!state) return;
      const i = WORDS.indexOf(state.highlighted);
      highlight(dir === 'right' ? WORDS[(i + 1) % WORDS.length]! : WORDS[(i + WORDS.length - 1) % WORDS.length]!);
    },
    hotkey: (c: string) => {
      if (c === 'p' || c === 'P') fire('play');
      else if (c === 'd' || c === 'D') fire('demo');
      else if (c === 'q' || c === 'Q') fire('quit');
    },
    confirm: () => confirmDqkTitleMenu(),
  };
  (window as unknown as { __rendered: number }).__rendered = 1;
}
