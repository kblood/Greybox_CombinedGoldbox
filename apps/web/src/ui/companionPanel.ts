/**
 * In-play Companion panel host (M10.S2) — a single read-only overlay over the live explore
 * session that shows the Companion panels (Automap, Party HUD, Reference DB) without leaving
 * the game. Mirrors `charSheet.ts`'s overlay lifecycle (module-level session, capture-phase
 * keydown, `onClose` callback, `window.__companion` e2e seam) — the pattern every other explore
 * overlay already uses.
 *
 * Each panel's data comes from the SAME source the standalone `?automap=1`/`?hud=1`/`?refdb=1`
 * pages use, just pulled from the live running session instead of a standalone re-fetch: Automap
 * reuses Phase D1's `Automap` model (M10.S1's live-fed instance), HUD reuses `hudPanel.ts`'s own
 * `buildRows`, and Reference DB reuses `referenceDb.ts`'s own category builders against the live
 * decoded bestiary/item tables `explore.ts` already loaded for THIS game. Nothing in this module
 * mutates play state — every panel here is a viewer.
 */
import {
  composeAutomapPanel,
  composeHudPanel,
  composeReferenceDb,
  composeJournalScreen,
  composeCharSheet,
  createFramebuffer,
  drawText,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  makeEgaPalette,
  DOS_EGA,
  REFERENCE_DB_LIST_ROWS,
  type Automap,
  type GameMap,
  type Direction,
  type IndexedImage,
  type IndexedFramebuffer,
  type BitmapFont,
  type Palette,
  type MonsterRecord,
  type JournalCategory,
  type JournalLineView,
  type ExploreFrameLayout,
} from '@goldbox/engine';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { followPresentationScale, presentationFitOptions } from './runtimeGraphicsMode.js';
import { buildRows as buildHudRows, statusLine as hudStatusLine } from './hudPanel.js';
import { monsterCategory, itemCategory, spellCategory, type RefCategory } from './referenceDb.js';
import { getJournal, seedJournalIfEmpty } from './journal.js';
import { toView as charSheetView } from './charSheet.js';
import { getParty } from './party.js';

const EGA_PALETTE: Palette = makeEgaPalette();

export type CompanionTab = 'automap' | 'hud' | 'refdb' | 'journal' | 'char';
const TABS: CompanionTab[] = ['automap', 'hud', 'refdb', 'journal', 'char'];
const TAB_LABEL: Record<CompanionTab, string> = {
  automap: 'Automap',
  hud: 'Party',
  refdb: 'Databases',
  journal: 'Journal',
  char: 'Char',
};
/** Mirrors `journal.ts`'s own private FILTERS list — kept local since it's a tiny UI constant. */
const JOURNAL_FILTERS: (JournalCategory | null)[] = [null, 'story', 'quest', 'rumour', 'lore'];

/** A snapshot of the live session data the panels render from, captured once at open. */
export interface CompanionLiveSource {
  frameTiles: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font: BitmapFont | null;
  map: GameMap;
  automap: Automap;
  pose: { x: number; y: number; facing: Direction };
  monsters: MonsterRecord[];
  items: { name: string; baseTypeId: number; count?: number }[];
}

interface CompanionSession {
  overlay: HTMLElement;
  surface: ScreenSurface;
  source: CompanionLiveSource;
  tab: CompanionTab;
  refCats: RefCategory[];
  refCatIdx: number;
  refSel: number;
  refTop: number;
  journalCursor: number;
  journalFilterIdx: number;
  journalReadingId: number | null;
  charIdx: number;
  onClose: (() => void) | null;
}

let session: CompanionSession | null = null;

export function isCompanionOpen(): boolean {
  return !!session && document.body.contains(session.overlay);
}

export function companionTab(): CompanionTab | null {
  return session?.tab ?? null;
}

export function closeCompanionPanel(): void {
  if (!session) return;
  const onClose = session.onClose;
  session.surface.dispose();
  session.overlay.remove();
  window.removeEventListener('keydown', onKey, true);
  session = null;
  onClose?.();
}

function tabMenu(selected: CompanionTab): { items: string[]; selected: number } {
  return { items: [...TABS.map((t) => TAB_LABEL[t]), 'Close'], selected: TABS.indexOf(selected) };
}

/** The currently-listed journal entries (after the active category filter) — mirrors `journal.ts`'s `listed()`. */
function journalListed(): JournalLineView[] {
  if (!session) return [];
  const cat = JOURNAL_FILTERS[session.journalFilterIdx] ?? undefined;
  return getJournal().list(cat).map((e) => ({ id: e.id, title: e.title, category: e.category, read: e.read }));
}

/** A minimal centred-text fallback frame for panels with no data to show (e.g. no created party). */
function emptyMessageFrame(font: BitmapFont | null, msg: string): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, 0);
  if (font) drawText(fb, font, msg, 16, 96, 15);
  return fb;
}

function clampRefScroll(): void {
  if (!session) return;
  const cat = session.refCats[session.refCatIdx];
  const len = cat?.entries.length ?? 0;
  const rows = REFERENCE_DB_LIST_ROWS;
  session.refSel = Math.max(0, Math.min(session.refSel, len - 1));
  if (session.refSel < session.refTop) session.refTop = session.refSel;
  if (session.refSel >= session.refTop + rows) session.refTop = session.refSel - rows + 1;
  session.refTop = Math.max(0, Math.min(session.refTop, Math.max(0, len - rows)));
}

function paint(): void {
  if (!session) return;
  const { source, tab, surface } = session;
  if (tab === 'automap') {
    const fb = composeAutomapPanel({
      frameTiles: source.frameTiles,
      frameLayout: source.frameLayout,
      font: source.font,
      title: `Automap · ${source.map.name}`,
      map: source.map,
      automap: source.automap,
      pose: source.pose,
      status: `${source.automap.visitedCount}/${source.map.width * source.map.height} cells known`,
      menu: tabMenu('automap'),
    });
    surface.paint(fb, EGA_PALETTE);
    return;
  }
  if (tab === 'hud') {
    const rows = buildHudRows();
    const fb = composeHudPanel({
      frameTiles: source.frameTiles,
      frameLayout: source.frameLayout,
      font: source.font,
      title: 'Party Status',
      rows,
      status: hudStatusLine(rows),
      menu: tabMenu('hud'),
    });
    surface.paint(fb, EGA_PALETTE);
    return;
  }
  if (tab === 'refdb') {
    clampRefScroll();
    const cat = session.refCats[session.refCatIdx];
    const rows = REFERENCE_DB_LIST_ROWS;
    const windowed = cat ? cat.entries.slice(session.refTop, session.refTop + rows) : [];
    const fb = composeReferenceDb({
      frameTiles: source.frameTiles,
      frameLayout: source.frameLayout,
      font: source.font,
      view: {
        title: 'Reference DB',
        category: cat?.label ?? '—',
        game: source.map.name,
        entries: windowed,
        selected: session.refSel - session.refTop,
        detailTitle: cat?.entries[session.refSel]?.name,
        detail: cat?.details[session.refSel] ?? [],
        status: `${cat && cat.entries.length ? session.refSel + 1 : 0}/${cat?.entries.length ?? 0}  ←→ category  ↑↓ nav  Tab panel  Esc close`,
      },
      menu: tabMenu('refdb'),
    });
    surface.paint(fb, EGA_PALETTE);
    return;
  }
  if (tab === 'journal') {
    seedJournalIfEmpty(); // first-time viewers see the same real demo pages `?journal=1` does, not a blank list
    const entries = journalListed();
    session.journalCursor = Math.min(session.journalCursor, Math.max(0, entries.length - 1));
    const reading = session.journalReadingId != null ? getJournal().get(session.journalReadingId) : null;
    const filterName = JOURNAL_FILTERS[session.journalFilterIdx];
    const fb = composeJournalScreen({
      frameTiles: source.frameTiles,
      frameLayout: source.frameLayout,
      font: source.font,
      view: {
        title: "Adventurer's Journal",
        entries,
        cursor: entries.length ? session.journalCursor : -1,
        reading: reading
          ? { id: reading.id, title: reading.title, body: reading.body, category: reading.category, day: reading.day }
          : null,
        status: filterName ? `Filter: ${filterName}` : undefined,
      },
      menu: tabMenu('journal'),
    });
    surface.paint(fb, EGA_PALETTE);
    return;
  }
  // char
  const party = getParty();
  if (party.length === 0) {
    surface.paint(emptyMessageFrame(source.font, 'No party — create or import one first.'), EGA_PALETTE);
    return;
  }
  session.charIdx = Math.max(0, Math.min(party.length - 1, session.charIdx));
  const member = party[session.charIdx]!;
  const fb = composeCharSheet({
    frameTiles: source.frameTiles,
    frameLayout: source.frameLayout,
    font: source.font,
    sheet: charSheetView(member, `${session.charIdx + 1}/${party.length}`),
    menu: tabMenu('char'),
  });
  surface.paint(fb, EGA_PALETTE);
}

function switchTab(tab: CompanionTab): void {
  if (!session) return;
  session.tab = tab;
  paint();
}

function cycleTab(delta: number): void {
  if (!session) return;
  const i = TABS.indexOf(session.tab);
  switchTab(TABS[((i + delta) % TABS.length + TABS.length) % TABS.length]!);
}

function moveRef(delta: number): void {
  if (!session || session.tab !== 'refdb') return;
  session.refSel += delta;
  paint();
}

function cycleRefCategory(delta: number): void {
  if (!session || session.tab !== 'refdb') return;
  const n = session.refCats.length;
  if (n === 0) return;
  session.refCatIdx = ((session.refCatIdx + delta) % n + n) % n;
  session.refSel = 0;
  session.refTop = 0;
  paint();
}

function moveJournalCursor(delta: number): void {
  if (!session || session.tab !== 'journal') return;
  const n = Math.max(1, journalListed().length);
  session.journalCursor = ((session.journalCursor + delta) % n + n) % n;
  paint();
}

/** Open the entry under the cursor for reading (marks it read) — mirrors `journal.ts`'s `readSelected`. */
function readJournalSelected(): void {
  if (!session || session.tab !== 'journal') return;
  const entries = journalListed();
  const e = entries[Math.min(session.journalCursor, entries.length - 1)];
  if (!e) return;
  getJournal().markRead(e.id);
  session.journalReadingId = e.id;
  paint();
}

function cycleJournalFilter(): void {
  if (!session || session.tab !== 'journal') return;
  session.journalFilterIdx = (session.journalFilterIdx + 1) % JOURNAL_FILTERS.length;
  session.journalCursor = 0;
  paint();
}

function cycleChar(delta: number): void {
  if (!session || session.tab !== 'char') return;
  const n = getParty().length;
  if (n === 0) return;
  session.charIdx = ((session.charIdx + delta) % n + n) % n;
  paint();
}

/** `ArrowUp`/`ArrowDown` drive whichever tab has a scrollable list (refdb entries, journal cursor). */
function moveList(delta: number): void {
  if (!session) return;
  if (session.tab === 'refdb') moveRef(delta);
  else if (session.tab === 'journal') moveJournalCursor(delta);
}

/** `ArrowLeft`/`ArrowRight` drive whichever tab has a secondary axis (refdb category, char member). */
function cycleSecondary(delta: number): void {
  if (!session) return;
  if (session.tab === 'refdb') cycleRefCategory(delta);
  else if (session.tab === 'char') cycleChar(delta);
}

function onKey(e: KeyboardEvent): void {
  if (!session) return;
  switch (e.key) {
    case 'Escape':
      e.preventDefault(); e.stopPropagation(); closeCompanionPanel(); return;
    case 'Tab':
      e.preventDefault(); e.stopPropagation(); cycleTab(e.shiftKey ? -1 : 1); return;
    case 'ArrowUp':
      e.preventDefault(); e.stopPropagation(); moveList(-1); return;
    case 'ArrowDown':
      e.preventDefault(); e.stopPropagation(); moveList(1); return;
    case 'ArrowLeft':
      e.preventDefault(); e.stopPropagation(); cycleSecondary(-1); return;
    case 'ArrowRight':
      e.preventDefault(); e.stopPropagation(); cycleSecondary(1); return;
    case 'Enter': case ' ':
      e.preventDefault(); e.stopPropagation(); readJournalSelected(); return;
    case 'f': case 'F':
      e.preventDefault(); e.stopPropagation(); cycleJournalFilter(); return;
  }
}

/**
 * Open the Companion panel host over the live session. `source` is captured ONCE at open — a
 * snapshot of whatever the running game's data is right now (the party/monster/item tables don't
 * themselves change while a read-only panel is modally blocking play). Play state is never
 * touched by anything below; closing always hands control straight back to the caller unchanged.
 */
export function openCompanionPanel(opts: {
  source: CompanionLiveSource;
  initialTab?: CompanionTab;
  onClose?: () => void;
  /** Game whose presentation preference applies. Only CoK ids follow the shared CoK scale. */
  presentationGameId?: string;
}): void {
  closeCompanionPanel();

  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel');
  const emu = el('div', 'gb-emu');
  const presentationGameId = opts.presentationGameId ?? '';
  const surface = createScreenSurface(DOS_EGA, presentationFitOptions(presentationGameId));
  followPresentationScale(surface, presentationGameId);
  emu.appendChild(surface.canvas);
  panel.appendChild(emu);

  const bar = el('div', 'sheet-buttons');
  const mkBtn = (label: string, fn: () => void): void => {
    const b = el('button', 'gb-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  mkBtn('🗺 Automap', () => switchTab('automap'));
  mkBtn('👥 Party', () => switchTab('hud'));
  mkBtn('📚 Databases', () => switchTab('refdb'));
  mkBtn('📖 Journal', () => switchTab('journal'));
  mkBtn('📜 Char', () => switchTab('char'));
  mkBtn('✕ Close', () => closeCompanionPanel());
  panel.appendChild(bar);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeCompanionPanel(); });
  document.body.appendChild(overlay);

  const refCats = [
    monsterCategory(opts.source.monsters),
    itemCategory(opts.source.items),
    spellCategory(),
  ];

  session = {
    overlay,
    surface,
    source: opts.source,
    tab: opts.initialTab ?? 'automap',
    refCats,
    refCatIdx: 0,
    refSel: 0,
    refTop: 0,
    journalCursor: 0,
    journalFilterIdx: 0,
    journalReadingId: null,
    charIdx: 0,
    onClose: opts.onClose ?? null,
  };
  // Capture-phase so the panel's keys win over the explorer's window handler (matches charSheet.ts).
  window.addEventListener('keydown', onKey, true);
  surface.canvas.tabIndex = 0;
  paint();
  surface.refresh();
  surface.canvas.focus();

  // Headless e2e seam.
  (window as unknown as { __companion?: Record<string, unknown> }).__companion = {
    isOpen: () => isCompanionOpen(),
    tab: () => session?.tab ?? null,
    switchTo: (t: CompanionTab) => switchTab(t),
    cycleTab: (d = 1) => cycleTab(d),
    close: () => closeCompanionPanel(),
    hudRows: () => buildHudRows(),
    automapVisitedCount: () => session?.source.automap.visitedCount ?? 0,
    refCategories: () => session?.refCats.map((c) => c.label) ?? [],
    refCategory: () => session?.refCats[session.refCatIdx]?.label ?? '',
    refEntryCount: () => session?.refCats[session.refCatIdx]?.entries.length ?? 0,
    refMove: (d: number) => moveRef(d),
    refCycleCategory: (d: number) => cycleRefCategory(d),
    refSelected: () =>
      session
        ? {
            name: session.refCats[session.refCatIdx]?.entries[session.refSel]?.name ?? '',
            detail: session.refCats[session.refCatIdx]?.details[session.refSel] ?? [],
          }
        : null,
    journalListedCount: () => journalListed().length,
    journalCursor: () => session?.journalCursor ?? -1,
    journalMove: (d: number) => moveJournalCursor(d),
    journalRead: () => readJournalSelected(),
    journalReadingId: () => session?.journalReadingId ?? null,
    journalReadingTitle: () =>
      session?.journalReadingId != null ? getJournal().get(session.journalReadingId)?.title ?? null : null,
    journalReadingDay: () =>
      session?.journalReadingId != null ? getJournal().get(session.journalReadingId)?.day ?? null : null,
    journalFilter: () => cycleJournalFilter(),
    journalFilterName: () => JOURNAL_FILTERS[session?.journalFilterIdx ?? 0] ?? 'all',
    charCount: () => getParty().length,
    charIndex: () => session?.charIdx ?? -1,
    charName: () => getParty()[session?.charIdx ?? -1]?.name ?? '',
    charMove: (d: number) => cycleChar(d),
  };
}
