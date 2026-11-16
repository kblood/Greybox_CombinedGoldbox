/**
 * Inventory ("Items") overlay (A4.1) — the original Champions of Krynn pack screen, opened with the
 * **Items** verb on the character-sheet page. It composes the engine's pure {@link composeInventory}
 * screen (owner + recomputed AC/THAC0, the carried-item list with a cursor and READY tags, a
 * Ready/Use/Drop/Next/Exit command bar) into the same emulated 320×200 EGA surface the explorer
 * uses, and drives the immutable inventory model: ↑/↓ move the cursor, R readies/un-readies the
 * highlighted item (re-deriving AC/THAC0), U uses a consumable, D drops, N/P cycle party members,
 * Esc/X close. Each character's pack persists per name via the party store.
 *
 * A `window.__inv` seam drives it from headless e2e.
 */
import {
  composeInventory,
  makeEgaPalette,
  DOS_EGA,
  ADND1E_ABILITIES,
  readyItem,
  unreadyItem,
  dropItem,
  useItem,
  transferItem,
  computeArmorClass,
  computeThac0,
  inventoryWeightLb,
  inventoryWeightTenths,
  encumbrance,
  baseItem,
  decode8x8dBlock,
  readDaxDataBlocks,
  loadCokFont,
  type Inventory,
  type InventoryView,
  type CharacterSheet,
  type IndexedImage,
  type BitmapFont,
  type Palette,
  type ExploreFrameLayout,
} from '@goldbox/engine';
import { el } from './render.js';
import { assetUrl } from './catalog.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { getParty, getInventory, setInventory } from './party.js';

const EGA_PALETTE: Palette = makeEgaPalette();
const MENU = ['Ready', 'Use', 'Drop', 'Give', 'Next', 'Exit'] as const;
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;

function setStatusLine(msg: string): void {
  const s = document.querySelector('#status');
  if (s) s.textContent = msg;
}

/** Label an entry for display: prefix a stack count when > 1 ("20 Arrow"). */
function rowLabel(entry: Inventory['entries'][number]): string {
  return entry.count > 1 ? `${entry.count} ${entry.name}` : entry.name;
}

function toView(
  sheet: CharacterSheet,
  inv: Inventory,
  cursor: number,
  index: string,
  status: string,
): InventoryView {
  const dex = ADND1E_ABILITIES.dexterity(sheet.abilities.dex).defensiveAc;
  const enc = encumbrance(inventoryWeightTenths(inv), sheet.abilities.str, sheet.abilities.strPct);
  return {
    name: sheet.name,
    ac: computeArmorClass(inv, dex),
    thac0: computeThac0(sheet.thac0),
    rows: inv.entries.map((e) => ({ label: rowLabel(e), equipped: e.equipped })),
    cursor: inv.entries.length ? Math.max(0, Math.min(cursor, inv.entries.length - 1)) : -1,
    index,
    weight: `${inventoryWeightLb(inv).toFixed(1)} LB`,
    encumbrance: enc.label,
    status,
  };
}

interface InvSession {
  party: CharacterSheet[];
  cur: number; // party member index
  inv: Inventory;
  cursor: number; // item row index
  status: string; // last action message (e.g. a give result)
  overlay: HTMLElement;
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  frameLayout: ExploreFrameLayout | undefined;
  font: BitmapFont | null;
  onClose: (() => void) | null;
  /** The sheet (or other host) that opened this pack screen; `retireInventoryOwnedBy` matches on it. */
  owner: object | null;
}

let session: InvSession | null = null;

function loadMemberInv(): void {
  if (!session) return;
  const sheet = session.party[session.cur];
  session.inv = getInventory(sheet);
  session.cursor = 0;
  session.status = '';
}

function paint(): void {
  if (!session) return;
  const sheet = session.party[session.cur];
  if (!sheet) return;
  const fb = composeInventory({
    frameTiles: session.frameTiles,
    frameLayout: session.frameLayout,
    font: session.font,
    view: toView(
      sheet,
      session.inv,
      session.cursor,
      `${session.cur + 1}/${session.party.length}`,
      session.status,
    ),
    menu: { items: [...MENU], selected: -1 },
  });
  session.surface.paint(fb, EGA_PALETTE);
}

function commit(): void {
  if (!session) return;
  session.status = ''; // a ready/use/drop clears the last give message
  setInventory(session.party[session.cur].name, session.inv);
  paint();
}

function moveCursor(delta: number): void {
  if (!session || session.inv.entries.length === 0) return;
  const n = session.inv.entries.length;
  session.cursor = ((session.cursor + delta) % n + n) % n;
  session.status = ''; // M100 — a Give confirmation is stale the moment the player looks elsewhere
  paint();
}

function cycleMember(delta: number): void {
  if (!session) return;
  const n = session.party.length;
  session.cur = ((session.cur + delta) % n + n) % n;
  loadMemberInv();
  paint();
}

function doReady(): void {
  if (!session || session.inv.entries.length === 0) return;
  const entry = session.inv.entries[session.cursor];
  session.inv = entry.equipped
    ? unreadyItem(session.inv, session.cursor)
    : readyItem(session.inv, session.cursor);
  commit();
}

function doUse(): void {
  if (!session || session.inv.entries.length === 0) return;
  const r = useItem(session.inv, session.cursor);
  if (r.consumed) {
    session.inv = r.inventory;
    if (session.cursor >= session.inv.entries.length) session.cursor = Math.max(0, session.inv.entries.length - 1);
  }
  commit();
}

function doDrop(): void {
  if (!session || session.inv.entries.length === 0) return;
  session.inv = dropItem(session.inv, session.cursor);
  if (session.cursor >= session.inv.entries.length) session.cursor = Math.max(0, session.inv.entries.length - 1);
  commit();
}

/**
 * Trade (A4.2): give the cursor item to another party member. With a created roster of two it's
 * unambiguous (the other member); with more it hands to the next member in order. The engine
 * `transferItem` un-readies the item as it leaves (the readied-weapon rule); both packs persist.
 */
function doGive(targetIndex?: number): void {
  if (!session || session.inv.entries.length === 0) return;
  const n = session.party.length;
  if (n < 2) {
    session.status = 'NO ONE TO GIVE TO';
    paint();
    return;
  }
  const recIdx = ((targetIndex ?? session.cur + 1) % n + n) % n;
  if (recIdx === session.cur) return;
  const recipient = session.party[recIdx];
  const entry = session.inv.entries[session.cursor];
  const recInv = getInventory(recipient);
  const r = transferItem(session.inv, recInv, session.cursor);
  if (!r.moved) return;
  session.inv = r.from;
  setInventory(session.party[session.cur].name, session.inv);
  setInventory(recipient.name, r.to);
  session.status = `GAVE ${entry.name} TO ${recipient.name}`;
  if (session.cursor >= session.inv.entries.length) session.cursor = Math.max(0, session.inv.entries.length - 1);
  paint();
}

export function isInventoryOpen(): boolean {
  return session !== null;
}

/** Drop the live pack screen's ownership first, then its DOM and listener. No callback runs here. */
function detachInventory(s: InvSession): void {
  session = null;
  s.surface.dispose();
  s.overlay.remove();
  window.removeEventListener('keydown', onInvKey, true);
}

export function closeInventory(): void {
  const s = session;
  if (!s) return;
  detachInventory(s);
  s.onClose?.();
}

/**
 * Silently retire the live pack screen only if `owner` opened it (goal 223). An unrelated or newer
 * inventory is left mounted, and no `onClose` runs.
 */
export function retireInventoryOwnedBy(owner: object): void {
  const s = session;
  if (!s || s.owner !== owner) return;
  detachInventory(s);
}

function onInvKey(e: KeyboardEvent): void {
  if (!session) return;
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault(); e.stopPropagation(); moveCursor(1); break;
    case 'ArrowUp':
      e.preventDefault(); e.stopPropagation(); moveCursor(-1); break;
    case 'ArrowRight': case 'n': case 'N':
      e.preventDefault(); e.stopPropagation(); cycleMember(1); break;
    case 'ArrowLeft': case 'p': case 'P':
      e.preventDefault(); e.stopPropagation(); cycleMember(-1); break;
    case 'r': case 'R': case 'Enter':
      e.preventDefault(); e.stopPropagation(); doReady(); break;
    case 'u': case 'U':
      e.preventDefault(); e.stopPropagation(); doUse(); break;
    case 'd': case 'D':
      e.preventDefault(); e.stopPropagation(); doDrop(); break;
    case 'g': case 'G':
      e.preventDefault(); e.stopPropagation(); doGive(); break;
    case 'Escape': case 'x': case 'X':
      e.preventDefault(); e.stopPropagation(); closeInventory(); break;
  }
}

/**
 * Open the inventory overlay for a party member. Returns false (shows nothing) when there is no
 * created party. `tiles`/`font` are the explorer's 8X8D frame tiles + text font so the page matches
 * the emulated screen exactly.
 */
export function openInventory(opts: {
  frameTiles: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font: BitmapFont | null;
  startIndex?: number;
  onClose?: () => void;
  /** Owner used by `retireInventoryOwnedBy` (the character sheet that opens its Items). */
  owner?: object;
}): boolean {
  closeInventory();
  const party = getParty();
  if (party.length === 0) return false;

  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  panel.appendChild(emu);

  // This pack screen's own record. Its DOM controls act only while it is still the live session, so a
  // detached button from a closed or replaced pack screen does nothing.
  const mine: InvSession = {
    party,
    cur: Math.max(0, Math.min(party.length - 1, opts.startIndex ?? 0)),
    inv: { entries: [] },
    cursor: 0,
    status: '',
    overlay,
    surface,
    frameTiles: opts.frameTiles,
    frameLayout: opts.frameLayout,
    font: opts.font,
    onClose: opts.onClose ?? null,
    owner: opts.owner ?? null,
  };

  const bar = el('div', 'sheet-buttons');
  const mkBtn = (label: string, fn: () => void): void => {
    const b = el('button', 'gb-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => { if (session === mine) fn(); });
    bar.appendChild(b);
  };
  mkBtn('Ready', () => doReady());
  mkBtn('Use', () => doUse());
  mkBtn('Drop', () => doDrop());
  mkBtn('Give', () => doGive());
  mkBtn('◀ Prev', () => cycleMember(-1));
  mkBtn('Next ▶', () => cycleMember(1));
  mkBtn('✕ Exit', () => closeInventory());
  panel.appendChild(bar);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay && session === mine) closeInventory(); });
  document.body.appendChild(overlay);

  session = mine;
  loadMemberInv();
  window.addEventListener('keydown', onInvKey, true);
  paint();
  surface.refresh();

  // Headless e2e seam. Its mutators act only while this pack screen is the live session (goal 229); a
  // stale call returns `undefined` with no effect. Reads below stay unguarded.
  (window as unknown as { __inv?: Record<string, unknown> }).__inv = {
    isOpen: () => isInventoryOpen(),
    count: () => session?.inv.entries.length ?? 0,
    cursor: () => session?.cursor ?? -1,
    name: () => session?.party[session.cur]?.name ?? '',
    ac: () => {
      if (!session) return null;
      const s = session.party[session.cur];
      return computeArmorClass(session.inv, ADND1E_ABILITIES.dexterity(s.abilities.dex).defensiveAc);
    },
    rowEquipped: (i: number) => session?.inv.entries[i]?.equipped ?? false,
    rowName: (i: number) => session?.inv.entries[i]?.name ?? '',
    baseName: (id: number) => baseItem(id)?.name ?? '',
    weight: () => (session ? inventoryWeightLb(session.inv) : 0),
    encumbrance: () => {
      if (!session) return '';
      const s = session.party[session.cur];
      return encumbrance(inventoryWeightTenths(session.inv), s.abilities.str, s.abilities.strPct).label;
    },
    members: () => session?.party.map((p) => p.name) ?? [],
    member: () => session?.cur ?? -1,
    status: () => session?.status ?? '',
    move: (d: number) => (session === mine ? moveCursor(d) : undefined),
    select: (i: number) => { if (session === mine) { session.cursor = i; paint(); } },
    ready: () => (session === mine ? doReady() : undefined),
    use: () => (session === mine ? doUse() : undefined),
    drop: () => (session === mine ? doDrop() : undefined),
    give: (target?: number) => (session === mine ? doGive(target) : undefined),
    next: () => (session === mine ? cycleMember(1) : undefined),
    prev: () => (session === mine ? cycleMember(-1) : undefined),
    close: () => (session === mine ? closeInventory() : undefined),
  };
  return true;
}

/**
 * Standalone `?inv=1` route — opens the inventory for the current party (loading CoK frame tiles +
 * font best-effort so the page matches the emulated screen). Requires a created party; set up one
 * via `?create=1` first. Returns the number of party members shown.
 */
export async function startInventory(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  if (out) out.innerHTML = '';

  let frameTiles: IndexedImage[] | null = null;
  let font: BitmapFont | null = null;
  try {
    const resp = await fetch(assetUrl(TILES_PATH));
    if (resp.ok) {
      const tileBytes = new Uint8Array(await resp.arrayBuffer());
      const blocks = new Map(readDaxDataBlocks(tileBytes).map((b) => [b.blockId, b.raw]));
      const frameRaw = blocks.get(FRAME_BLOCK);
      if (frameRaw) frameTiles = decode8x8dBlock(frameRaw, `8X8D1#${FRAME_BLOCK}`, { transparentMagenta: true }).tiles;
      font = loadCokFont(tileBytes);
    }
  } catch {
    /* no game data — the model-driven screen still works with a null font */
  }

  const ok = openInventory({ frameTiles, font, startIndex: 0 });
  const n = ok ? getParty().length : 0;
  (window as unknown as { __rendered: number }).__rendered = n;
  setStatusLine(ok ? 'Champions of Krynn — inventory.' : 'Create a party first (?create=1) to view items.');
  return n;
}
