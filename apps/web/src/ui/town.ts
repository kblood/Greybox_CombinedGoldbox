/**
 * Town hub view (A5.2, `?town=1`) — the in-town services a Gold Box party visits between adventures,
 * drawn the original way: the engine `composeTownScreen` paints the whole 320×200 EGA page (title,
 * the party's steel, a scrolling option list, status, command bar) into one indexed framebuffer a
 * `ScreenSurface` resolves at 4:3. From the hub the party enters four locations:
 *
 *   • Shop      — buy gear from the item catalogue / sell from the leader's pack (gold ↔ inventory).
 *   • Temple    — heal the wounded (per missing HP) and raise the dead (level-scaled fee).
 *   • Training  — level a member up when their XP has reached the next threshold and they can pay.
 *   • Tavern    — rumours + a journal stub (full journal is A5.4).
 *
 * All economy/eligibility math is pure engine code (`town/shop.ts`, `town/services.ts`); this
 * controller owns the demo town, navigation, asset loading, and the `window.__town` e2e seam. Party
 * gold/inventory/HP/XP are the same persisted stores the rest of the game uses (`party.ts`).
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  composeTownScreen,
  TOWN_LINE_DISABLED,
  buyPrice,
  sellStack,
  healCost,
  raiseCost,
  type TownView,
  type TownLine,
  type IndexedImage,
  type BitmapFont,
  type Palette,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { recordJournal } from './journal.js';
import {
  getGold,
  partyStatus,
  leaderInventory,
  buyForLeader,
  sellFromLeader,
  templeHealAll,
  templeRaiseFirstDead,
  trainMember,
  trainingStatus,
  getXp,
  addXp,
  classLabel,
  getParty,
} from './party.js';
import type { AssetSource } from './assetSource.js';
import { readRuntimeGraphicsMode, townGraphicsFallbackMessage, townGraphicsMode } from './runtimeGraphicsMode.js';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;
/** Reason a guarded seam returns when its Town visit is no longer current (Goal 227). */
const STALE_TOWN_REASON = 'stale town session';

type Mode = 'hub' | 'shop-buy' | 'shop-sell' | 'temple' | 'training' | 'tavern';

/** Hub locations, in display + hotkey order. */
const HUB = ['Shop', 'Temple', 'Training Hall', 'Tavern', 'Leave'] as const;

/** Catalogue ids stocked by the demo shop (base-type ids into BASE_ITEMS). */
const SHOP_STOCK = [10, 12, 14, 15, 81, 64, 8] as const; // sword, mace, shield, leather, chain, dagger, arrow

/** Static tavern rumours (flavour; the real journal arrives in A5.4). */
const RUMOURS = [
  'Draconians were seen on the road east of Throtl.',
  'They say a knight of Solamnia guards the old keep.',
  'The three moons favour bold deeds tonight.',
  'A merchant pays well for goblin-ears, or so I hear.',
];

interface TownState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  mode: Mode;
  cursor: number;
  status: string;
  rumour: number;
  /** M92.S1/M93.S1 — which race/class level-cap table the Training Hall enforces: `'cok'` (CoK/DoK's
   * printed table, the default) or `'dqk'` (DQK's own, materially more permissive but NOT uncapped,
   * table — a DQK session must enforce ITS OWN real ceiling, not none). */
  levelCapRuleset: 'cok' | 'dqk';
  /** M97.S1 — where "Leave" (hub select, or Escape-at-hub) returns the player: `undefined` (default —
   * CoK/DoK's own overland wilderness, unchanged for every pre-M97 caller) or a caller-supplied
   * callback for a game with its own "resume where you were" screen instead of the wilderness. */
  onLeave: (() => void) | undefined;
}

let state: TownState | null = null;
// Ownership generation for Town mounts. Every startTown takes a new value, and every closeTown (close,
// retire, Leave, or a main-menu start) bumps it even when no state is mounted. A startTown whose chrome
// load finishes after the value moved belongs to a Town nobody owns any more, so it mounts nothing.
let townSession = 0;

function memberName(i: number): string | null {
  return getParty()[i]?.name ?? null;
}

/** Build the list of body lines + the bottom menu for the active mode. */
function buildView(): { view: TownView; menu: readonly string[] } {
  const s = state!;
  const gold = getGold();
  let title = 'Town of Solace';
  let lines: TownLine[] = [];
  let menu: readonly string[] = ['Enter', 'Exit'];

  switch (s.mode) {
    case 'hub': {
      title = 'Town of Solace';
      lines = HUB.map((h) => ({ text: h }));
      menu = ['Select'];
      break;
    }
    case 'shop-buy': {
      title = 'Armoury — Buy';
      lines = SHOP_STOCK.map((id) => {
        const price = buyPrice(id);
        return { text: itemName(id), price, color: price > gold ? TOWN_LINE_DISABLED : undefined };
      });
      menu = ['Buy', 'Sell', 'Exit'];
      break;
    }
    case 'shop-sell': {
      title = 'Armoury — Sell';
      const inv = leaderInventory();
      // Price shown is the WHOLE stack's offer (M19.S1: selling now sells the entire entry at
      // once, via the real bulk-sale formula) — not a misleading per-unit number.
      lines = inv.length
        ? inv.map((e) => ({ text: `${e.name}${e.count > 1 ? ` x${e.count}` : ''}`, price: sellStack(0, e.baseTypeId, e.count, e.value).price }))
        : [{ text: '(leader carries nothing)', color: TOWN_LINE_DISABLED }];
      menu = ['Buy', 'Sell', 'Exit'];
      break;
    }
    case 'temple': {
      title = 'Temple of Mishakal';
      // M90.S1 — a merely-unconscious member (down but not dead, CT.7h) is wounded-and-healable
      // here too; only the permanently dead are excluded from the cheap heal and offered for Raise.
      const wounded = partyStatus().filter((m) => !m.dead && m.hp < m.maxHp);
      const missing = wounded.reduce((sum, m) => sum + (m.maxHp - m.hp), 0);
      const dead = partyStatus().find((m) => m.dead);
      const hCost = healCost(missing);
      lines = [
        { text: missing > 0 ? 'Heal the party' : 'Party is unwounded', price: missing > 0 ? hCost : undefined, color: missing > 0 && hCost <= gold ? undefined : TOWN_LINE_DISABLED },
        dead
          ? { text: `Raise ${dead.name}`, price: raiseCost(deadLevel(dead.name)), color: raiseCost(deadLevel(dead.name)) <= gold ? undefined : TOWN_LINE_DISABLED }
          : { text: 'No-one to raise', color: TOWN_LINE_DISABLED },
      ];
      menu = ['Select', 'Exit'];
      break;
    }
    case 'training': {
      title = 'Training Hall';
      const party = partyStatus();
      lines = party.length
        ? party.map((m) => {
            const t = trainingStatus(m.name, s.levelCapRuleset);
            if (!t) return { text: m.name, color: TOWN_LINE_DISABLED };
            const label = t.eligible ? `${m.name} ${m.cls} → ${t.level + 1}` : `${m.name} ${m.cls} (${reasonShort(t.reason)})`;
            return { text: label, price: t.eligible ? t.cost : undefined, color: t.eligible ? undefined : TOWN_LINE_DISABLED };
          })
        : [{ text: '(no party)', color: TOWN_LINE_DISABLED }];
      menu = ['Train', 'Exit'];
      break;
    }
    case 'tavern': {
      title = 'The Inn of the Last Home';
      lines = RUMOURS.map((r, i) => ({ text: r, color: i === s.rumour ? undefined : TOWN_LINE_DISABLED }));
      menu = ['Listen', 'Exit'];
      break;
    }
  }

  const view: TownView = { title, gold, lines, cursor: s.cursor, status: s.status || undefined };
  return { view, menu };
}

function itemName(id: number): string {
  // Names come from the engine catalogue via the price helpers' source; resolve through buyForLeader's
  // catalogue indirectly by a tiny lookup map to avoid importing baseItem here twice.
  return ITEM_NAMES[id] ?? `Item ${id}`;
}
const ITEM_NAMES: Record<number, string> = {
  10: 'Long Sword', 12: 'Mace', 14: 'Shield', 15: 'Leather Armor', 81: 'Chain Mail', 64: 'Dagger', 8: 'Arrow',
};

function reasonShort(reason?: string): string {
  if (!reason) return 'ready';
  if (/experience/i.test(reason)) return 'needs XP';
  if (/steel/i.test(reason)) return 'needs gold';
  if (/level cap/i.test(reason)) return 'at level cap';
  return reason;
}

/** Primary-class level of a (named) member, for the raise-dead fee. */
function deadLevel(name: string): number {
  const sheet = getParty().find((s) => s.name === name);
  if (!sheet) return 1;
  const lvls = Object.values(sheet.classes).filter((n): n is number => typeof n === 'number');
  return lvls.length ? Math.max(...lvls) : 1;
}

function setStatus(msg: string): void {
  if (state) state.status = msg;
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) {
    s.textContent = msg;
    s.className = 'status';
  }
}

function drawScreen(): void {
  if (!state) return;
  const { view, menu } = buildView();
  const fb = composeTownScreen({
    frameTiles: state.frameTiles,
    font: state.font,
    view,
    menu: { items: menu, selected: -1 },
  });
  state.surface.paint(fb, EGA_PALETTE);
}

/** Number of selectable rows in the active mode (for cursor clamping). */
function rowCount(): number {
  return buildView().view.lines.length;
}

function enter(mode: Mode): void {
  if (!state) return;
  state.mode = mode;
  state.cursor = 0;
  setStatus(modeIntro(mode));
  drawScreen();
}

function modeIntro(mode: Mode): string {
  switch (mode) {
    case 'shop-buy': return 'The armourer shows his wares.';
    case 'shop-sell': return 'What will you sell?';
    case 'temple': return 'The clerics offer healing.';
    case 'training': return 'The masters assess your party.';
    case 'tavern': return 'You settle in to listen.';
    default: return 'Where to in town?';
  }
}

/** Activate the cursor row in the active mode. */
function activate(): void {
  if (!state) return;
  const i = state.cursor;
  switch (state.mode) {
    case 'hub': {
      const loc = HUB[i];
      if (loc === 'Shop') enter('shop-buy');
      else if (loc === 'Temple') enter('temple');
      else if (loc === 'Training Hall') enter('training');
      else if (loc === 'Tavern') enter('tavern');
      else leaveTown();
      break;
    }
    case 'shop-buy': {
      const id = SHOP_STOCK[i];
      if (id === undefined) return;
      const r = buyForLeader(id);
      setStatus(r.ok ? `Bought ${r.item} for ${r.price} steel.` : `Cannot buy: ${r.reason}.`);
      drawScreen();
      break;
    }
    case 'shop-sell': {
      const inv = leaderInventory();
      if (!inv[i]) return;
      const r = sellFromLeader(i);
      setStatus(r.ok ? `Sold ${r.item} for ${r.price} steel.` : `Cannot sell: ${r.reason}.`);
      state.cursor = Math.min(state.cursor, Math.max(0, leaderInventory().length - 1));
      drawScreen();
      break;
    }
    case 'temple': {
      if (i === 0) {
        const r = templeHealAll();
        setStatus(r.ok ? `The party is healed (${r.healed} HP) for ${r.cost} steel.` : `Cannot heal: ${r.reason}.`);
      } else {
        const r = templeRaiseFirstDead();
        setStatus(r.ok ? `${r.name} is raised for ${r.cost} steel.` : `Cannot raise: ${r.reason}.`);
      }
      drawScreen();
      break;
    }
    case 'training': {
      const name = memberName(i);
      if (!name) return;
      const r = trainMember(name, state.levelCapRuleset);
      setStatus(r.ok ? `${name} trains to level ${r.newLevel}! (+${r.hpGain} HP, ${r.cost} steel)` : `${name} cannot train: ${r.reason}.`);
      drawScreen();
      break;
    }
    case 'tavern': {
      state.rumour = i;
      const text = RUMOURS[i] ?? '';
      // Recording a rumour you hear into the journal — entries 50+ are reserved for tavern talk so
      // re-listening to the same rumour is idempotent (the journal ignores a duplicate id).
      recordJournal({ id: 50 + i, title: `Tavern Rumour ${i + 1}`, body: text, category: 'rumour' });
      setStatus(`${text} (recorded in your journal)`);
      drawScreen();
      break;
    }
  }
}

function leaveTown(): void {
  // M97.S1 — a caller with its own "resume where you were" screen (DQK's dungeon) supplies `onLeave`;
  // every pre-M97 caller leaves it undefined and gets the original CoK/DoK wilderness route unchanged.
  const onLeave = state?.onLeave;
  closeTown();
  if (onLeave) {
    onLeave();
    return;
  }
  setStatus('You leave town and return to the road.');
  // The wilderness is the natural place to go; if it is not wired, just note it.
  history.replaceState(null, '', `?wild=1`);
  void import('./wilderness.js').then((m) => m.startWilderness()).catch(() => setStatus('You leave town.'));
}

/** Move the cursor (wrapping) within the active mode. */
function moveCursor(delta: number): void {
  if (!state) return;
  const n = Math.max(1, rowCount());
  state.cursor = ((state.cursor + delta) % n + n) % n;
  setStatus(''); // M101 — a Buy/Heal/Train/Listen confirmation is stale the moment the player looks elsewhere
  drawScreen();
}

function back(): void {
  if (!state) return;
  if (state.mode === 'hub') {
    leaveTown();
    return;
  }
  enter('hub');
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); moveCursor(-1); return;
    case 'ArrowDown': e.preventDefault(); moveCursor(1); return;
    case 'Enter': case ' ': e.preventDefault(); activate(); return;
    case 'Escape': case 'Backspace': e.preventDefault(); back(); return;
  }
  // Shop tab toggle: B = buy list, S = sell list.
  if (state.mode === 'shop-buy' || state.mode === 'shop-sell') {
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); enter('shop-buy'); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); enter('shop-sell'); }
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

/** Boot the town hub view (`?town=1`). Returns the number of hub locations (the render marker).
 * `levelCapRuleset` (default `'cok'`) selects which race/class level-cap table the Training Hall
 * enforces (M92.S1/M93.S1) — pass `'dqk'` for a DQK session, whose own manual prints a materially
 * more permissive, but not uncapped, table. `onLeave` (M97.S1) overrides where "Leave"/Escape-at-hub
 * returns the player — omit it (as every pre-M97 caller does) for the original CoK/DoK wilderness
 * route; a caller with its own "resume where you were" screen (DQK's dungeon) supplies one instead. */
export async function startTown(levelCapRuleset: 'cok' | 'dqk' = 'cok', onLeave?: () => void, assetSource?: AssetSource): Promise<number> {
  closeDungeon3d();
  closeTown();
  const session = ++townSession;
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  setStatus('Entering town…');

  const { frameTiles, font } = await loadChrome(assetSource);
  // A Town closed, retired or replaced while its chrome loaded mounts nothing: no DOM, listener, state,
  // focus, __town seam or __rendered. Returns 0 (no hub mounted) rather than the hub count.
  if (session !== townSession) return 0;

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>↑↓</b> Choose · <b>Enter</b> select · <b>Esc</b> back · in the shop <b>B</b>uy / <b>S</b>ell. ' +
    'Town of Solace — shop, temple, training hall, tavern.';
  const requestedGraphicsMode = townGraphicsMode(levelCapRuleset, () => readRuntimeGraphicsMode('cok'));
  const graphicsFallback = requestedGraphicsMode ? townGraphicsFallbackMessage(requestedGraphicsMode) : null;
  if (graphicsFallback) {
    const note = el('span', 'gb-town-graphics-fallback', graphicsFallback);
    note.setAttribute('role', 'status');
    menu.appendChild(note);
  }
  frame.appendChild(menu);
  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  state = { surface, frameTiles, font, mode: 'hub', cursor: 0, status: 'Where to in town?', rumour: 0, levelCapRuleset, onLeave };
  drawScreen();
  surface.canvas.focus();

  // Headless e2e seam. Mutators, navigation and grantXp are guarded per visit (Goal 227): they act only
  // while this visit's `session` is still the current townSession and a Town state is mounted. A stale
  // reference (closed, retired or replaced visit) does nothing: navigation and grantXp return undefined,
  // transactions return their existing failure shape, and nothing throws. Read methods are unguarded.
  const live = (): boolean => session === townSession && state !== null;
  (window as unknown as { __town?: Record<string, unknown> }).__town = {
    requestedGraphicsMode,
    graphicsFallback,
    mode: () => state?.mode ?? null,
    cursor: () => state?.cursor ?? -1,
    rows: () => rowCount(),
    lineText: (i: number) => buildView().view.lines[i]?.text ?? null,
    gold: () => getGold(),
    open: (mode: Mode) => { if (live()) enter(mode); },
    move: (d: number) => { if (live()) moveCursor(d); },
    select: (i: number) => { if (live() && state) { state.cursor = i; drawScreen(); } },
    activate: () => { if (live()) activate(); },
    back: () => { if (live()) back(); },
    status: () => state?.status ?? '',
    // Direct action seams (deterministic, bypass cursor) for e2e.
    buy: (id: number) => (live() ? buyForLeader(id) : { ok: false, reason: STALE_TOWN_REASON, gold: getGold(), price: 0 }),
    sell: (i: number) => (live() ? sellFromLeader(i) : { ok: false, reason: STALE_TOWN_REASON, gold: getGold(), price: 0 }),
    heal: () => (live() ? templeHealAll() : { ok: false, reason: STALE_TOWN_REASON, healed: 0, cost: 0 }),
    raise: () => (live() ? templeRaiseFirstDead() : { ok: false, reason: STALE_TOWN_REASON, cost: 0 }),
    train: (name: string) => (live() ? trainMember(name, state?.levelCapRuleset ?? 'cok') : { ok: false, name, reason: STALE_TOWN_REASON }),
    levelCapRuleset: () => state?.levelCapRuleset ?? null,
    grantXp: (name: string, amt: number) => (live() ? addXp(name, amt) : undefined),
    memberXp: (name: string) => getXp(name),
    leaderItems: () => leaderInventory().map((e) => ({ name: e.name, baseTypeId: e.baseTypeId, count: e.count, value: e.value })),
    party: () => partyStatus().map((m) => ({ name: m.name, hp: m.hp, maxHp: m.maxHp, cls: m.cls, down: m.down })),
    classLabelFor: (name: string) => { const s = getParty().find((p) => p.name === name); return s ? classLabel(s.classes) : ''; },
  };
  (window as unknown as { __rendered: number }).__rendered = HUB.length;
  return HUB.length;
}

export function closeTown(): void {
  // Always invalidate, even with no mounted state: a startTown still waiting on chrome must not mount
  // after this. Silent by design: onLeave is not called (leaveTown() invokes it itself, after this).
  townSession++;
  window.removeEventListener('keydown', onKey);
  state?.surface.dispose();
  state = null;
  (window as unknown as { __town?: Record<string, unknown> }).__town = undefined;
}
