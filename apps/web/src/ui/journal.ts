/**
 * Adventurer's Journal view + store (A5.4, `?journal=1`) — the in-game replacement for the Gold Box
 * "journal entries" (the original prints *"record it in Journal Entry N"* and you read the booklet).
 * Here the party carries a persistent log: ECL events, town visits, and quest progress *record*
 * numbered pages, and the player reads them back from a bordered screen the engine `composeJournalScreen`
 * paints into one 320×200 EGA framebuffer (entry list + reading pane + command bar).
 *
 * The journal model + screen are pure engine code (`world/journal.ts`, `render/journalScreen.ts`);
 * this module owns persistence (`greybox.journal.cok`), the demo seed (original-authored entries),
 * navigation/asset-loading, and the `recordJournal` helper other views call to log a page. The
 * `window.__journal` seam drives the headless e2e.
 */
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  Journal,
  composeJournalScreen,
  type JournalRecord,
  type JournalCategory,
  type JournalView,
  type JournalLineView,
  type IndexedImage,
  type BitmapFont,
  type Palette,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;
const STORE_KEY = 'greybox.journal.cok';

// ---- Persistent store ----------------------------------------------------------------------------

let cached: Journal | null = null;

/** Load the party's journal from localStorage (cached for the session). */
export function getJournal(): Journal {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    cached = raw ? Journal.fromJSON(JSON.parse(raw)) : new Journal();
  } catch {
    cached = new Journal();
  }
  return cached;
}

function saveJournal(j: Journal): void {
  cached = j;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(j.toJSON())); } catch { /* ignore quota */ }
}

/** Drop the cached journal so the next {@link getJournal} re-reads localStorage (after a Load). */
export function reloadJournal(): void {
  cached = null;
}

/**
 * Record a page in the party's journal (idempotent by entry number) and persist it. Other views call
 * this when an event happens — a tavern rumour, an NPC's warning, a quest beat. Returns the entry.
 */
export function recordJournal(rec: JournalRecord): ReturnType<Journal['record']> {
  const j = getJournal();
  const entry = j.record(rec);
  saveJournal(j);
  return entry;
}

/** Original-authored opening pages, seeded once so a fresh journal is never blank. */
const DEMO_ENTRIES: JournalRecord[] = [
  { id: 1, title: 'Setting Out', category: 'story', day: 1,
    body: 'The Whitestone Council has charged your company to scout the eastern road out of Solace. ' +
          'Draconian raiders have been seen near the old border keep, and the village folk are afraid.' },
  { id: 2, title: 'The Hermit\'s Omen', category: 'lore', day: 1,
    body: 'A roadside hermit spoke of the white moon Solinari waxing, and bid you press east while it ' +
          'is high. He named the keep as a mustering ground for the dragonarmies.' },
  { id: 3, title: 'A Knight\'s Charge', category: 'quest', day: 2,
    body: 'Sir Karl of the Sword bids you clear the keep\'s lower hall and recover the Whitestone ' +
          'banner taken in the last raid. Return it to the temple in Solace.' },
];

/**
 * Seed the demo opening pages the first time the journal is ever viewed (idempotent — no-op once
 * anything has been recorded). Exported (M10.S3) so the in-play Companion panel host
 * (`companionPanel.ts`) gives a first-time player the same real content this standalone
 * `?journal=1` route does, instead of a blank list.
 */
export function seedJournalIfEmpty(): void {
  const j = getJournal();
  if (j.size > 0) return;
  for (const e of DEMO_ENTRIES) j.record(e);
  saveJournal(j);
}

// ---- Viewer --------------------------------------------------------------------------------------

const FILTERS: (JournalCategory | null)[] = [null, 'story', 'quest', 'rumour', 'lore'];
const MENU = ['Read', 'Filter', 'Mark All', 'Exit'] as const;

interface JournalState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  cursor: number;
  filterIdx: number;
  readingId: number | null;
  status: string;
  menuSel: number;
}

let state: JournalState | null = null;

function filterCat(): JournalCategory | undefined {
  return FILTERS[state!.filterIdx] ?? undefined;
}

/** The currently-listed entries (after the active category filter). */
function listed(): JournalLineView[] {
  return getJournal().list(filterCat()).map((e) => ({ id: e.id, title: e.title, category: e.category, read: e.read }));
}

function buildView(): JournalView {
  const s = state!;
  const entries = listed();
  const reading = s.readingId != null ? getJournal().get(s.readingId) : null;
  const fname = FILTERS[s.filterIdx];
  return {
    title: 'Adventurer\'s Journal',
    entries,
    cursor: Math.min(s.cursor, Math.max(0, entries.length - 1)),
    reading: reading ? { id: reading.id, title: reading.title, body: reading.body, category: reading.category, day: reading.day } : null,
    status: s.status || (fname ? `Filter: ${fname}` : undefined),
  };
}

function drawScreen(): void {
  if (!state) return;
  const fb = composeJournalScreen({
    frameTiles: state.frameTiles,
    font: state.font,
    view: buildView(),
    menu: { items: MENU, selected: state.menuSel },
  });
  state.surface.paint(fb, EGA_PALETTE);
}

function setStatus(msg: string): void {
  if (state) state.status = msg;
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

function moveCursor(delta: number): void {
  if (!state) return;
  const n = Math.max(1, listed().length);
  state.cursor = ((state.cursor + delta) % n + n) % n;
  drawScreen();
}

/** Open the entry under the cursor for reading (marks it read). */
function readSelected(): void {
  if (!state) return;
  const entries = listed();
  const e = entries[Math.min(state.cursor, entries.length - 1)];
  if (!e) return;
  getJournal().markRead(e.id);
  saveJournal(getJournal());
  state.readingId = e.id;
  setStatus(`Reading entry ${e.id}: ${e.title}.`);
  drawScreen();
}

function cycleFilter(): void {
  if (!state) return;
  state.filterIdx = (state.filterIdx + 1) % FILTERS.length;
  state.cursor = 0;
  const f = FILTERS[state.filterIdx];
  setStatus(f ? `Showing ${f} entries.` : 'Showing all entries.');
  drawScreen();
}

function markAll(): void {
  getJournal().markAllRead();
  saveJournal(getJournal());
  setStatus('All entries marked read.');
  drawScreen();
}

function exitJournal(): void {
  setStatus('You close the journal.');
  history.replaceState(null, '', '?explore=1');
  void import('./explore.js').then((m) => m.startExplore()).catch(() => setStatus('You close the journal.'));
}

function activateMenu(i: number): void {
  if (!state) return;
  state.menuSel = i;
  const verb = MENU[i];
  if (verb === 'Read') readSelected();
  else if (verb === 'Filter') cycleFilter();
  else if (verb === 'Mark All') markAll();
  else exitJournal();
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); moveCursor(-1); return;
    case 'ArrowDown': e.preventDefault(); moveCursor(1); return;
    case 'ArrowLeft': e.preventDefault(); state.menuSel = (state.menuSel + MENU.length - 1) % MENU.length; drawScreen(); return;
    case 'ArrowRight': e.preventDefault(); state.menuSel = (state.menuSel + 1) % MENU.length; drawScreen(); return;
    case 'Enter': case ' ': e.preventDefault(); readSelected(); return;
    case 'f': case 'F': e.preventDefault(); cycleFilter(); return;
    case 'm': case 'M': e.preventDefault(); markAll(); return;
    case 'Escape': case 'Backspace': e.preventDefault(); exitJournal(); return;
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

/** Boot the journal view (`?journal=1`). Returns the entry count (the render marker). */
export async function startJournal(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  setStatus('Opening the journal…');

  seedJournalIfEmpty();
  const { frameTiles, font } = await loadChrome();

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>↑↓</b> Choose entry · <b>Enter</b> read · <b>F</b>ilter category · <b>M</b>ark all read · ' +
    '<b>Esc</b> close. The party records pages as events unfold.';
  frame.appendChild(menu);
  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  state = { surface, frameTiles, font, cursor: 0, filterIdx: 0, readingId: null, status: '', menuSel: 0 };
  // Open the first listed page so the reading pane is populated on entry.
  const first = listed()[0];
  if (first) { state.readingId = first.id; getJournal().markRead(first.id); saveJournal(getJournal()); }
  setStatus('The party reviews its journal.');
  drawScreen();
  surface.canvas.focus();

  // Headless e2e seam.
  (window as unknown as { __journal?: Record<string, unknown> }).__journal = {
    count: () => getJournal().size,
    unread: () => getJournal().unreadCount(),
    listedCount: () => listed().length,
    cursor: () => state?.cursor ?? -1,
    entryIdAt: (i: number) => listed()[i]?.id ?? null,
    readingId: () => state?.readingId ?? null,
    readingTitle: () => (state?.readingId != null ? getJournal().get(state.readingId)?.title ?? null : null),
    readingDay: () => (state?.readingId != null ? getJournal().get(state.readingId)?.day ?? null : null),
    titles: () => listed().map((e) => e.title),
    move: (d: number) => moveCursor(d),
    select: (i: number) => { if (state) { state.cursor = i; drawScreen(); } },
    read: () => readSelected(),
    filter: () => cycleFilter(),
    filterName: () => FILTERS[state?.filterIdx ?? 0] ?? 'all',
    markAll: () => markAll(),
    record: (rec: JournalRecord) => recordJournal(rec),
    menuSelect: (i: number) => activateMenu(i),
    status: () => state?.status ?? '',
  };
  (window as unknown as { __rendered: number }).__rendered = getJournal().size;
  return getJournal().size;
}
