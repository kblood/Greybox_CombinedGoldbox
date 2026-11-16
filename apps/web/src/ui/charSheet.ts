/**
 * Character-sheet ("View") overlay (A1.3) — the original Champions of Krynn full-screen character
 * page, shown when you pick **View** on the dungeon command bar or in camp. It composes the engine's
 * pure {@link composeCharSheet} screen (name/race/class, the six ability scores, the derived
 * AC/THAC0/HP line, the five saving throws, deity/Knight-order footer, and a Next/Prev/Exit command
 * bar) into the same emulated 320×200 EGA surface the explorer uses — not a CSS rebuild — and lets
 * you cycle through the party members. Data comes straight off the ruleset-derived `CharacterSheet`.
 *
 * It mounts as a modal overlay over the explore view (like the encounter panel): arrow keys / N / P
 * cycle members, Esc / Enter / X close. A `window.__sheet` seam drives it from headless e2e.
 */
import {
  composeCharSheet,
  makeEgaPalette,
  DOS_EGA,
  MOONS,
  encumbrance,
  inventoryWeightTenths,
  coreClass,
  warriorMultipleAttacks,
  type CharSheetView,
  type CharacterSheet,
  type DragonlanceClassId,
  type IndexedImage,
  type BitmapFont,
  type Palette,
  type ExploreFrameLayout,
} from '@goldbox/engine';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { getParty, classLabel, getInventory } from './party.js';
import { openInventory, isInventoryOpen, retireInventoryOwnedBy } from './inventory.js';
import { prepareCokPlayerAppearance, resolveCokPlayerPresentation, type CokPlayerAppearance, type CokPlayerPreparation } from './cokPlayerAppearance.js';
import { readRuntimeGraphicsFallback, readRuntimeGraphicsMode, runtimeGraphicsGameId, type RuntimeGraphicsMode } from './runtimeGraphicsMode.js';
import { cokGraphicsControls } from './cokGraphicsControls.js';

const EGA_PALETTE: Palette = makeEgaPalette();
const SAVE_ROWS: { label: string; key: keyof CharacterSheet['savingThrows'] }[] = [
  { label: 'Paralyze/Poison/Death', key: 'paralyzePoisonDeath' },
  { label: 'Petrify/Polymorph', key: 'petrifyPolymorph' },
  { label: 'Rod/Staff/Wand', key: 'rodStaffWand' },
  { label: 'Breath Weapon', key: 'breath' },
  { label: 'Spell', key: 'spell' },
];

/** Title-case a lower-case id like "human" → "Human". */
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Flatten a ruleset CharacterSheet into the engine compositor's view model. Exported (M10.S3) so
 * the in-play Companion panel host (`companionPanel.ts`) can reuse the SAME mapping instead of
 * re-deriving it.
 *
 * M40.S1 — the footer's third branch shows a mage's Robe of the Moons order. `.robe` already drives
 * two live mechanics (spell-slot effective level in `magic.ts`'s `casterInfo()`, and the combat
 * spell-save target in `party.ts`'s `spellSaveForMember()` → `combat.ts`), but was never shown on the
 * one screen built to display a character's permanent facts. CoK-only in practice: no DoK/DQK import
 * path (`importParty.ts`/`importDokParty.ts`) ever sets `.robe`, so the branch is simply unreached
 * there, not specially excluded.
 */
export function toView(s: CharacterSheet, index: string): CharSheetView {
  const ab = s.abilities;
  const strVal = ab.strPct && ab.strPct > 0 ? `${ab.str}/${ab.strPct}` : `${ab.str}`;
  // M63.S1 — the same live encumbrance computation party.ts's moveRateForMember() does for real
  // combat (CT.7k-1), recomputed here (not read from a stored field — CharacterSheet doesn't carry
  // one) so a re-equip is reflected the next time the sheet is opened. AC (below) uses the opposite
  // strategy — a stored field kept in sync by setInventory()'s own recompute (M105.S1) rather than
  // recomputed here — both converge on the same up-to-date number.
  const enc = encumbrance(inventoryWeightTenths(getInventory(s)), ab.str, ab.strPct);
  // M64.S1 — the same "3 attacks per 2 rounds" breakpoint party.ts's multiAttackHalfSteps() computes
  // for real combat (fighter/paladin level 7+, ranger level 8+; a Knight qualifies too via
  // coreClass() mapping to the fighter table — matches the manual's own "fighters and knights"
  // wording). Recomputed here directly off the sheet's own classes, same as `move` above.
  const slots = (Object.entries(s.classes) as [DragonlanceClassId, number | undefined][])
    .filter((e): e is [DragonlanceClassId, number] => (e[1] ?? 0) >= 1)
    .map(([cls, lvl]) => ({ classId: coreClass(cls), level: lvl }));
  const attacks = warriorMultipleAttacks(slots) ? '3/2' : undefined;
  const footer = s.knightOrder
    ? `Knight of the ${titleCase(s.knightOrder)}`
    : s.deity
      ? `Worships ${titleCase(String(s.deity))}`
      : s.robe
        ? `${titleCase(s.robe)} Robe (${MOONS[s.robe].moon})`
        : '';
  return {
    name: s.name,
    raceLine: `${titleCase(s.race)} ${titleCase(s.sex)}`,
    classLine: classLabel(s.classes as Partial<Record<DragonlanceClassId, number>>),
    abilities: [
      { label: 'Str', value: strVal },
      { label: 'Int', value: `${ab.int}` },
      { label: 'Wis', value: `${ab.wis}` },
      { label: 'Dex', value: `${ab.dex}` },
      { label: 'Con', value: `${ab.con}` },
      { label: 'Cha', value: `${ab.cha}` },
    ],
    ac: s.ac,
    thac0: s.thac0,
    hp: s.hp,
    maxHp: s.maxHp,
    move: enc.moveRate,
    attacks,
    saves: SAVE_ROWS.map((r) => ({ label: r.label, value: s.savingThrows[r.key] })),
    footer,
    index,
  };
}

interface SheetSession {
  party: CharacterSheet[];
  cur: number;
  overlay: HTMLElement;
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  frameLayout: ExploreFrameLayout | undefined;
  font: BitmapFont | null;
  playerArtCanvas: HTMLCanvasElement;
  playerArtLabel: HTMLSpanElement;
  playerArtCompletion?: Promise<CokPlayerAppearance>;
  playerArtRevision: number;
  playerArtCache: Map<string, Promise<CokPlayerPreparation | null>>;
  playerArtFailures: Set<string>;
  graphicsGameId: 'cok' | null;
  onClose: (() => void) | null;
}

let session: SheetSession | null = null;

const MENU = ['Items', 'Next', 'Prev', 'Exit'] as const;

/**
 * Open the inventory overlay for the currently-viewed member (keeps the sheet mounted beneath). The pack
 * screen is owned by `owner`: retiring that sheet retires it silently; its own Exit refreshes `owner`.
 */
function openItems(owner: SheetSession): void {
  if (session !== owner) return;
  openInventory({
    frameTiles: owner.frameTiles,
    frameLayout: owner.frameLayout,
    font: owner.font,
    startIndex: owner.cur,
    owner,
    onClose: () => { if (session === owner) paint(); }, // refresh the sheet when the pack screen closes
  });
}

function paint(): void {
  if (!session) return;
  const s = session.party[session.cur];
  if (!s) return;
  const fb = composeCharSheet({
    frameTiles: session.frameTiles,
    frameLayout: session.frameLayout,
    font: session.font,
    sheet: toView(s, `${session.cur + 1}/${session.party.length}`),
    menu: { items: [...MENU], selected: -1 },
  });
  session.surface.paint(fb, EGA_PALETTE);
}

function cycle(delta: number): void {
  if (!session) return;
  const n = session.party.length;
  session.cur = ((session.cur + delta) % n + n) % n;
  paint();
  void paintPlayerAppearance();
}

export function isSheetOpen(): boolean {
  return session !== null;
}

/**
 * Drop ownership first, then the DOM, listeners and the sheet's own pack screen (only if this sheet
 * opened it). No callback runs here; callers decide whether `onClose` is due.
 */
function detachSheet(s: SheetSession): void {
  session = null;
  retireInventoryOwnedBy(s);
  s.surface.dispose();
  s.overlay.remove();
  window.removeEventListener('keydown', onSheetKey, true);
  window.removeEventListener('goldbox:graphics-mode', onSheetGraphicsMode as EventListener);
  window.removeEventListener('goldbox:local-asset-pack', onSheetLocalAssetPack);
}

/** Normal Exit/Escape/backdrop close: the sheet's `onClose` runs exactly once. */
export function closeCharSheet(): void {
  const s = session;
  if (!s) return;
  detachSheet(s);
  s.onClose?.();
}

/**
 * Silent retirement (goal 223): no `onClose`, no status. Used before a newer main-menu start's first
 * await, so an older menu's return cannot remount over it, and when a replacement sheet opens.
 */
export function retireCharSheetSilently(): void {
  const s = session;
  if (!s) return;
  detachSheet(s);
}

function onSheetGraphicsMode(event: Event): void {
  const detail = (event as CustomEvent<{ gameId?: string; mode?: string }>).detail;
  if (session?.graphicsGameId === 'cok' && detail?.gameId === 'cok') void paintPlayerAppearance(detail.mode === 'Restyle');
}

function onSheetLocalAssetPack(): void {
  if (session?.graphicsGameId !== 'cok') return;
  session.playerArtCache.clear();
  session.playerArtFailures.clear();
  void paintPlayerAppearance();
}

async function paintPlayerAppearance(retry = false): Promise<void> {
  const current = session;
  if (!current || current.graphicsGameId !== 'cok') return;
  const sheet = current.party[current.cur];
  const record = sheet?.appearance;
  const revision = ++current.playerArtRevision;
  const ctx = current.playerArtCanvas.getContext('2d');
  if (!ctx) return;
  current.playerArtCanvas.hidden = true;
  current.playerArtLabel.textContent = record ? 'Loading character icon…' : 'No mapped character icon';
  if (!record) return;
  const cacheKey = JSON.stringify([
    record.cHeadRequest, record.cBodyBlock, record.cBodySlot, record.suffixCode, record.paletteBytes,
  ]);
  let loading = current.playerArtCache.get(cacheKey);
  if (!loading) {
    loading = prepareCokPlayerAppearance(record, undefined, 'primary');
    current.playerArtCache.set(cacheKey, loading);
  }
  try {
    let prepared = await loading;
    if (retry && prepared && session === current && current.playerArtFailures.delete(cacheKey)) {
      loading = prepareCokPlayerAppearance(record, prepared.original, 'primary');
      current.playerArtCache.set(cacheKey, loading);
      prepared = await loading;
    }
    const paint = (appearance: CokPlayerAppearance | undefined) => {
      if (session !== current || current.playerArtRevision !== revision) return;
      if (!appearance) {
        current.playerArtLabel.textContent = 'Character icon not mapped';
        return;
      }
      const mode: RuntimeGraphicsMode = readRuntimeGraphicsMode('cok');
      const presentation = resolveCokPlayerPresentation(appearance, { consumer: 'character-sheet', mode,
        fallback: readRuntimeGraphicsFallback('cok'), playback: 'still' });
      current.playerArtLabel.textContent = presentation.label;
      if (presentation.state !== 'ready') { current.playerArtCanvas.hidden = true; return; }
      const art = presentation.art;
      current.playerArtCanvas.width = art.width;
      current.playerArtCanvas.height = art.height;
      const pixels = new Uint8ClampedArray(art.pixels);
      current.playerArtCanvas.getContext('2d')?.putImageData(new ImageData(pixels, art.width, art.height), 0, 0);
      current.playerArtCanvas.hidden = false;
    };
    current.playerArtCompletion = prepared?.restyleReady;
    paint(prepared?.original);
    if (prepared) {
      const completed = await prepared.restyleReady;
      if (completed.frames.some((frame) => frame.restyleStatus.state === 'failed')) current.playerArtFailures.add(cacheKey);
      paint(completed);
    }
  } catch (error) {
    if (session !== current || current.playerArtRevision !== revision) return;
    current.playerArtLabel.textContent = `Character icon unavailable · ${error instanceof Error ? error.message : 'source not loaded'}`;
  }
}

function onSheetKey(e: KeyboardEvent): void {
  if (!session) return;
  if (isInventoryOpen()) return; // the pack overlay owns the keyboard while it's up
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'n':
    case 'N':
      e.preventDefault();
      e.stopPropagation();
      cycle(1);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'p':
    case 'P':
      e.preventDefault();
      e.stopPropagation();
      cycle(-1);
      break;
    case 'i':
    case 'I':
      e.preventDefault();
      e.stopPropagation();
      openItems(session);
      break;
    case 'Escape':
    case 'Enter':
    case 'x':
    case 'X':
      e.preventDefault();
      e.stopPropagation();
      closeCharSheet();
      break;
  }
}

/**
 * Open the character-sheet overlay for the current party. Returns false (and shows nothing) when
 * there is no created party — the demo four have no full ruleset sheet to display. `tiles`/`font`
 * are the explorer's 8X8D frame tiles + text font so the page matches the emulated screen exactly.
 */
export function openCharSheet(opts: {
  frameTiles: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font: BitmapFont | null;
  startIndex?: number;
  /** Explicit host context; absent for DQK and other games sharing this sheet. */
  graphicsGameId?: string;
  onClose?: () => void;
}): boolean {
  // A replacement sheet retires the live one silently (goal 223): its onClose does not run.
  retireCharSheetSilently();
  const party = getParty();
  if (party.length === 0) return false;

  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel');
  const stage = el('div', 'sheet-stage');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  stage.appendChild(emu);
  const playerArt = el('aside', 'sheet-player-art');
  const graphicsGameId = opts.graphicsGameId && runtimeGraphicsGameId(opts.graphicsGameId) === 'cok' ? 'cok' : null;
  playerArt.hidden = graphicsGameId === null;
  const playerArtCanvas = el('canvas', 'sheet-player-art-canvas') as HTMLCanvasElement;
  playerArtCanvas.width = 96;
  playerArtCanvas.height = 96;
  playerArtCanvas.hidden = true;
  const playerArtLabel = el('span', 'sheet-player-art-label') as HTMLSpanElement;
  playerArt.append(playerArtCanvas, playerArtLabel);
  if (graphicsGameId) playerArt.appendChild(cokGraphicsControls());
  stage.appendChild(playerArt);
  panel.appendChild(stage);

  // This sheet's own record. Its DOM controls (and its backdrop) act only while it is still the live
  // session, so a detached button from a closed or replaced sheet does nothing.
  const mine: SheetSession = {
    party,
    cur: Math.max(0, Math.min(party.length - 1, opts.startIndex ?? 0)),
    overlay,
    surface,
    frameTiles: opts.frameTiles,
    frameLayout: opts.frameLayout,
    font: opts.font,
    playerArtCanvas,
    playerArtLabel,
    playerArtRevision: 0,
    playerArtCache: new Map(),
    playerArtFailures: new Set(),
    graphicsGameId,
    onClose: opts.onClose ?? null,
  };

  const bar = el('div', 'sheet-buttons');
  const mkBtn = (label: string, fn: () => void): void => {
    const b = el('button', 'gb-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => { if (session === mine) fn(); });
    bar.appendChild(b);
  };
  mkBtn('⚔ Items', () => openItems(mine));
  mkBtn('◀ Prev', () => cycle(-1));
  mkBtn('Next ▶', () => cycle(1));
  mkBtn('✕ Exit', () => closeCharSheet());
  panel.appendChild(bar);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay && session === mine) closeCharSheet(); });
  document.body.appendChild(overlay);

  session = mine;
  // Capture-phase so the sheet's keys win over the explorer's window handler.
  window.addEventListener('keydown', onSheetKey, true);
  window.addEventListener('goldbox:graphics-mode', onSheetGraphicsMode as EventListener);
  window.addEventListener('goldbox:local-asset-pack', onSheetLocalAssetPack);
  paint();
  void paintPlayerAppearance();
  surface.refresh();

  // Headless e2e seam.
  (window as unknown as { __sheet?: Record<string, unknown> }).__sheet = {
    isOpen: () => isSheetOpen(),
    count: () => session?.party.length ?? 0,
    index: () => session?.cur ?? -1,
    name: () => session?.party[session.cur]?.name ?? '',
    footer: () => { const s = session?.party[session.cur]; return s ? toView(s, '').footer : ''; },
    // M63.S1 — the real encumbrance-derived movement rate (AD&D inches) now shown on the sheet.
    move: () => { const s = session?.party[session.cur]; return s ? toView(s, '').move ?? null : null; },
    // M64.S1 — "3/2" for a level-7+ fighter/paladin/Knight or level-8+ ranger, else null.
    attacks: () => { const s = session?.party[session.cur]; return s ? toView(s, '').attacks ?? null : null; },
    playerAppearanceMode: () => session?.playerArtLabel.textContent ?? '',
    playerAppearanceCompletion: () => session?.playerArtCompletion,
    playerAppearanceVisible: () => !!session && !session.playerArtCanvas.hidden,
    // Actions act only while this sheet still owns the session; a stale seam call returns undefined with no effect.
    next: () => { if (session === mine) cycle(1); },
    prev: () => { if (session === mine) cycle(-1); },
    items: () => { if (session === mine) openItems(mine); },
    close: () => { if (session === mine) closeCharSheet(); },
  };
  return true;
}
