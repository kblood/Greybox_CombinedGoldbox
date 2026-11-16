/**
 * Reference DB browser (D5, `?refdb=1`) — a Gold Box Companion-style cyclopedia over the game's own
 * decoded tables. Three categories: **Monsters** (engine `decodeMonsterArchive` over the real
 * `MON1CHA.DAX` bestiary — AC/HD/THAC0/HP/damage/XP/morale/size), **Items** (`decodeItemArchive`
 * over `ITEM1.DAX`, cross-referenced to the `BASE_ITEMS` catalogue for kind/damage/AC), and
 * **Spells** (the `COK_SPELLS` ruleset list + `spellEffect` mechanics). Tab cycles category, ↑/↓
 * scroll the name list, and the selected entry's stat sheet renders on the right.
 *
 * The engine compositor `composeReferenceDb` is data-neutral; this panel decodes the tables and
 * flattens each entry into `{name, tag}` + `{label, value}` detail rows. Mirrors the HUD/CharEditor
 * panels (load chrome → screen surface → keydown → `window.__refdb` e2e seam).
 */
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  decodeMonsterArchive,
  decodeItemArchive,
  baseItem,
  COK_SPELLS,
  spellEffect,
  tacticalSpellFor,
  DOK_SPELL_CROSSWALK,
  calcBattleExp,
  composeReferenceDb,
  REFERENCE_DB_LIST_ROWS,
  type MonsterRecord,
  type RefDbEntry,
  type RefDbDetailRow,
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
const MON_PATH = 'Champions of Krynn/MON1CHA.DAX';
const ITEM_PATH = 'Champions of Krynn/ITEM1.DAX';

// M10.S2: RefCategory + the three builders below are exported so the in-play Companion panel
// host (`companionPanel.ts`) can build the SAME categories from live session data (the game's own
// decoded monster/item tables already loaded by explore.ts) instead of this module's own
// standalone re-fetch — one table→view mapping, two data sources.
export interface RefCategory {
  key: string;
  label: string;
  entries: RefDbEntry[];
  details: RefDbDetailRow[][];
}

interface PanelState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  categories: RefCategory[];
  catIdx: number;
  sel: number; // selection index within the active category's full list
  top: number; // scroll offset (first visible row)
}

let state: PanelState | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

// --- table → view mapping -----------------------------------------------------

export function dmgText(d: { count: number; sides: number; bonus: number }): string {
  const base = `${d.count}d${d.sides}`;
  return d.bonus ? `${base}${d.bonus > 0 ? '+' : ''}${d.bonus}` : base;
}

// M37.S1 — DQK MONCHA.GLB's character/NPC records carry a class code + stored level (decoded since
// the C4.2b-2b-2 character-framing work, golden-tested in moncha.test.ts) that this panel never
// read, showing the tautological "Class: npc" for real companions like SELIAS/TASSLEHOFF/
// SIR DISCORE instead of their actual D&D class. (Names corrected in fidelity-plan §29: the old
// comment's BAKAI SHAMAN/SHARMAN/TASLEHOFF were mis-decoded — BAKALI SHAMAN is a bestiary record,
// and the NPC set is now the eleven records carrying is-monster flag 0 at offset 0x66.) Crosswalk verified against all 8 real MONCHA.GLB NPC
// records (zero contradictions) and cross-referenced against hackdocs_extracted/CCHFORM.TXT:53-69's
// FRUA "Current Class" enum (2/5/6 match verbatim; DQK's own doc comment simplifies FRUA's "8 = C/F"
// multiclass to a plain "Cleric" — kept as-is here, not re-litigated, see docs/engine/research/
// m37-audit.md's Open Questions). `undefined` for every Gen1 CoK/DoK record and every Gen2
// monster-framed record, so this is additive only — no other entry's Class row changes.
const NPC_CLASS_LABEL: Record<number, string> = { 2: 'Fighter', 5: 'Mage', 6: 'Thief', 8: 'Cleric' };

export function monsterCategory(monsters: MonsterRecord[]): RefCategory {
  const entries: RefDbEntry[] = [];
  const details: RefDbDetailRow[][] = [];
  for (const m of monsters) {
    entries.push({ name: m.name || `#${m.blockId}`, tag: m.combatSize && m.combatSize > 1 ? 'LG' : undefined });
    const classValue = m.npcClass !== undefined ? (NPC_CLASS_LABEL[m.npcClass] ?? `class ${m.npcClass}`) : m.category;
    // M55.S1 — a real DoK caster's memorized spells (MonsterRecord.preparedSpellIds, joined via
    // applyPreparedSpellIds since M31.S1) already decide whether it casts in combat
    // (combat.ts's preparedSpellsFromDokIds); count the real castable (crosswalked) spells so
    // the bestiary/Companion entry finally says so. `undefined` for every non-caster (most of
    // the bestiary, and the entire CoK side — MON{n}WIZ.DAX is DoK-only), so the row is
    // honestly omitted rather than shown as "0 spells".
    const castableSpellCount = m.preparedSpellIds
      ? new Set(m.preparedSpellIds.map((id) => DOK_SPELL_CROSSWALK[id]).filter(Boolean)).size
      : 0;
    // M56.S1 — a carried magic item's `plus` (MonsterRecord.itemPluses, joined via applyItemPluses
    // since M26.S1) already decides how much bonus XP the party earns for looting this monster
    // (calcBattleExp's Σ item.plus·400 term, combat.ts:721-724) — but that figure is swallowed into
    // a single lump `xpResult.total` even after the fight, and never shown at all beforehand.
    // Isolate just the loot term by calling the real ruleset function with zero enemies (only the
    // `itemPluses` loot side contributes). `undefined`/0 for the common case (no carried items, or
    // none enchanted), so the row is honestly omitted rather than shown as "+0".
    const lootBonusXp = m.itemPluses ? calcBattleExp([], { itemPluses: m.itemPluses }) : 0;
    details.push([
      { label: 'AC', value: `${m.armorClass}` },
      { label: 'HD', value: `${m.hitDice}` },
      { label: 'THAC0', value: `${m.thac0}` },
      { label: 'HP', value: `${m.hitPoints}` },
      { label: 'Damage', value: dmgText(m.damage) },
      { label: 'XP', value: `${m.xp}` },
      { label: 'Morale', value: m.morale === undefined ? '—' : `${m.morale}` },
      { label: 'Size', value: m.combatSize && m.combatSize > 1 ? 'Large' : 'Small' },
      { label: 'Class', value: classValue },
      // M83.S1 — MonsterAbilities.int is always decoded (never optional, unlike every row below) and
      // already decides a real live outcome: tactical.ts's moraleBreakOf() (wired since M81.S1) picks
      // surrender (Int > 5) vs. rout (Int <= 5) on a morale break. Placed early, before the conditional
      // rows that follow, so if a future record's row count ever exceeds the cap, a lower-priority
      // conditional row (e.g. Bonus XP) truncates first rather than this always-meaningful stat.
      { label: 'Int', value: `${m.abilities.int}` },
      ...(m.npcLevel !== undefined ? [{ label: 'Level', value: `${m.npcLevel}` }] : []),
      // M38.S1 — the .spell saving-throw target is the one SavingThrows column with a live combat
      // consumer (Combatant.monsterSpellSave, combat.ts, wired since M27.S1); shown here, unlike its
      // 4 siblings (paralyzePoisonDeath/petrifyPolymorph/rodStaffWand/breath), which are decoded but
      // still mechanically inert (no poison/petrify/rod-staff-wand/breath status-effect system
      // exists) — showing all 5 would misrepresent those 4 as equally meaningful.
      //
      // This row USED to be documented as "`undefined` for every DoK compact record … the compact
      // 216-byte layout has no room for it". Both halves are now false: commit fa07892 (2026-08-11)
      // byte-located DoK's saves at record offsets 42..46 and set `DOK_LAYOUT.saves = 42`, so the
      // row fires for every DoK record too. It stays conditional only because
      // `MonsterRecord.savingThrows` is still optional in the type for any future layout that
      // genuinely cannot locate the block; no shipped layout is in that state.
      ...(m.savingThrows ? [{ label: 'Save', value: `${m.savingThrows.spell}` }] : []),
      // M65.S1 — MonsterRecord.conSaveBonus (M28.S1): a flat Constitution-band bonus this monster
      // adds to its OWN saving-throw roll (not the Save row above, which is the target number) —
      // tactical.ts's applyCast() computes `rng.die(20) + conSaveBonus >= t.save`. M43.S1 originally
      // declined a bare "+2" row here as ambiguous (misreadable as modifying the Save target itself,
      // e.g. 17 -> 19) and asked for a label that clearly reads as a roll modifier instead — "Save
      // Roll" (rather than "Con Save") is that label. Undefined for the common case (no such affect,
      // or Con outside every band), so the row is honestly omitted rather than shown as "+0".
      ...(m.conSaveBonus !== undefined ? [{ label: 'Save Roll', value: `+${m.conSaveBonus}` }] : []),
      // M43.S1 — MON{n}SPC.DAX innate specials (M23.S2 regen_3_hp / M24.S1 half_damage): already
      // decoded, joined by explore.ts's dungeon-load pipeline, and deciding real combat outcomes
      // (tactical.ts's tickRegen()/melee resolver; combat.ts's round loop) since before this
      // M-series began — but never shown here. Undefined/false for the common case (most monsters
      // have neither), so both rows are honestly omitted rather than shown as "No"/"0".
      ...(m.regenPerRound !== undefined ? [{ label: 'Regen', value: `${m.regenPerRound}/rd` }] : []),
      ...(m.halfDamage ? [{ label: 'Half Dmg', value: 'Yes' }] : []),
      ...(castableSpellCount > 0
        ? [{ label: 'Spells', value: `${castableSpellCount} spell${castableSpellCount === 1 ? '' : 's'}` }]
        : []),
      ...(lootBonusXp > 0 ? [{ label: 'Bonus XP', value: `+${lootBonusXp}` }] : []),
    ]);
  }
  return { key: 'monsters', label: 'Monsters', entries, details };
}

export function itemCategory(items: { name: string; baseTypeId: number; count?: number }[]): RefCategory {
  const entries: RefDbEntry[] = [];
  const details: RefDbDetailRow[][] = [];
  for (const it of items) {
    const base = baseItem(it.baseTypeId);
    const kind = base?.kind ?? (it.baseTypeId === 0 ? 'special' : 'misc');
    entries.push({ name: it.name || `#${it.baseTypeId}`, tag: kind.slice(0, 3) });
    const rows: RefDbDetailRow[] = [{ label: 'Type', value: kind }, { label: 'Base id', value: `${it.baseTypeId}` }];
    // M39.S1 — CoK's ITEM{n}.DAX per-catalogue stack/bundle count (decoded + golden-tested since the
    // loader's inception, item.test.ts:75-78: real "20 Arrow".count===20), never reached this row
    // builder before now. DoK's ITEM0.DAX has no decoded equivalent (its byte-13 "bundle count" is a
    // documented-but-never-extracted field in the same 17-byte record the item-instance subsystem
    // blocker already flags as suspect), so `count` stays `undefined` there and this row is honestly
    // omitted rather than showing a fabricated 0.
    if (it.count) rows.push({ label: 'Qty', value: `${it.count}` });
    if (base?.damage) rows.push({ label: 'Damage', value: dmgText(base.damage) });
    if (base?.armorAc !== undefined) rows.push({ label: 'Armor AC', value: `${base.armorAc}` });
    if (base?.shieldBonus !== undefined) rows.push({ label: 'Shield', value: `+${base.shieldBonus}` });
    if (base?.ranged) rows.push({ label: 'Ranged', value: base.ranged });
    // M44.S1 — BaseItem.range (baseItems.ts): the weapon's real max shot distance in grid cells,
    // already read by the tactical engine's missileRangeBracket()/rangeBracketToHit() to compute the
    // real +1/0/-2 to-hit modifier on every missile shot (tactical.ts:1130-1132) and already narrated
    // indirectly via the combat log's "(point blank)"/"(long range)" tags (combat.ts's rangeTag()) —
    // but never shown as a flat number anywhere a player can see before stepping into a fight.
    // Undefined for every melee-only weapon, so honestly omitted rather than fabricated.
    if (base?.range !== undefined) rows.push({ label: 'Range', value: `${base.range} cells` });
    if (base?.twoHanded) rows.push({ label: 'Hands', value: '2H' });
    details.push(rows);
  }
  return { key: 'items', label: 'Items', entries, details };
}

export function spellCategory(): RefCategory {
  const entries: RefDbEntry[] = [];
  const details: RefDbDetailRow[][] = [];
  for (const sp of COK_SPELLS) {
    const tag = `${sp.class === 'cleric' ? 'C' : 'M'}${sp.level}`;
    entries.push({ name: sp.name, tag });
    const fx = spellEffect(sp.id);
    const rows: RefDbDetailRow[] = [
      { label: 'Class', value: sp.class === 'cleric' ? 'Cleric' : 'Mage' },
      { label: 'Level', value: `${sp.level}` },
      { label: 'Effect', value: fx.kind },
      { label: 'Target', value: fx.target },
    ];
    if (fx.dice) rows.push({ label: 'Dice', value: dmgText(fx.dice) + (fx.dice.perLevel ? '/L' : '') });
    // M45.S1 — combatSpells.ts's real tactical-combat geometry (range/area/radius/save-mode), reached
    // via the already-exported tacticalSpellFor(): the exact numbers tactical.ts's apply()/
    // spellAffected() apply to every real cast (the in-range gate, the burst/cone/line fan-out, the
    // half/negate save resolution) — more precise than the Target row above (which only says
    // "enemy"/"enemyGroup", never how far or how wide). Only the 20/79 COK_SPELLS with a modelled
    // tactical effect resolve non-null; every flavour-only utility/buff spell (Bless, Shield, Charm
    // Person, ...) is honestly omitted, not fabricated. casterLevel/usesLeft are nominal placeholders
    // (1, 1) — neither affects range/area/radius/save, only the (unused here) damage/heal magnitude
    // and remaining-uses count.
    const geo = tacticalSpellFor(sp.id, sp.name, 1, 1);
    if (geo) {
      rows.push({ label: 'Range', value: geo.range === 1 ? '1 cell' : `${geo.range} cells` });
      rows.push({ label: 'Area', value: geo.radius ? `${geo.area} r${geo.radius}` : geo.area });
      rows.push({ label: 'Save', value: geo.save });
      // M68.S1 — geo.inflict (combatSpells.ts's INFLICT table): the status condition this spell
      // mechanically inflicts (asleep/held/feared/slowed/hasted), already driving tactical.ts's real
      // turn loop (inflictStatus()/tickStatuses()) and already narrated post-hoc in the combat log
      // (combat.ts's statusVerb(), since M55) — but never previewed here, the one screen built to
      // show a spell's mechanics BEFORE it's cast. Undefined for the other geometried spells
      // (Fireball, Magic Missile, ...), so honestly omitted rather than fabricated.
      if (geo.inflict) rows.push({ label: 'Status', value: geo.inflict.status });
    }
    rows.push({ label: 'Camp', value: fx.campCastable ? 'Yes' : 'No' });
    if (fx.note) rows.push({ label: 'Note', value: fx.note });
    details.push(rows);
  }
  return { key: 'spells', label: 'Spells', entries, details };
}

// --- rendering ----------------------------------------------------------------

function clampScroll(): void {
  if (!state) return;
  const cat = state.categories[state.catIdx];
  const len = cat?.entries.length ?? 0;
  const rows = REFERENCE_DB_LIST_ROWS;
  state.sel = Math.max(0, Math.min(state.sel, len - 1));
  if (state.sel < state.top) state.top = state.sel;
  if (state.sel >= state.top + rows) state.top = state.sel - rows + 1;
  state.top = Math.max(0, Math.min(state.top, Math.max(0, len - rows)));
}

function drawScreen(): void {
  if (!state) return;
  clampScroll();
  const cat = state.categories[state.catIdx];
  const rows = REFERENCE_DB_LIST_ROWS;
  const windowed = cat ? cat.entries.slice(state.top, state.top + rows) : [];
  const fb = composeReferenceDb({
    frameTiles: state.frameTiles,
    font: state.font,
    view: {
      title: 'Reference DB',
      category: cat?.label ?? '—',
      game: 'COK',
      entries: windowed,
      selected: state.sel - state.top,
      detailTitle: cat?.entries[state.sel]?.name,
      detail: cat?.details[state.sel] ?? [],
      status: `${(state.sel + 1)}/${cat?.entries.length ?? 0}  TAB CATEGORY  ↑↓ NAV  ESC CLOSE`,
    },
    menu: { items: ['Monsters', 'Items', 'Spells', 'Exit'], selected: state.catIdx < 3 ? state.catIdx : -1 },
  });
  state.surface.paint(fb, EGA_PALETTE);
}

function move(delta: number): void {
  if (!state) return;
  state.sel += delta;
  drawScreen();
}

function selectCategory(idx: number): void {
  if (!state) return;
  const n = ((idx % state.categories.length) + state.categories.length) % state.categories.length;
  state.catIdx = n;
  state.sel = 0;
  state.top = 0;
  drawScreen();
  setStatus(`${state.categories[n].label}: ${state.categories[n].entries.length} entries.`);
}

// --- asset loading ------------------------------------------------------------

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadCategories(): Promise<RefCategory[]> {
  const cats: RefCategory[] = [];

  const monBytes = await fetchBytes(MON_PATH);
  if (monBytes) {
    try { cats.push(monsterCategory(decodeMonsterArchive(monBytes))); } catch { /* skip */ }
  }

  const itemBytes = await fetchBytes(ITEM_PATH);
  if (itemBytes) {
    try {
      const items = decodeItemArchive(itemBytes).map((it) => ({ name: it.name, baseTypeId: it.baseTypeId, count: it.count }));
      cats.push(itemCategory(items));
    } catch { /* skip */ }
  }

  // Spells are a static ruleset table — always available.
  cats.push(spellCategory());
  return cats;
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

// --- lifecycle ----------------------------------------------------------------

export function isReferenceDbOpen(): boolean {
  return !!state && document.body.contains(state.surface.canvas);
}

export function closeReferenceDb(): void {
  if (!state) return;
  window.removeEventListener('keydown', onKey);
  state = null;
  setStatus('Closed the reference DB.');
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  switch (e.key) {
    case 'Escape': e.preventDefault(); closeReferenceDb(); return;
    case 'ArrowUp': e.preventDefault(); move(-1); return;
    case 'ArrowDown': e.preventDefault(); move(1); return;
    case 'PageUp': e.preventDefault(); move(-REFERENCE_DB_LIST_ROWS); return;
    case 'PageDown': e.preventDefault(); move(REFERENCE_DB_LIST_ROWS); return;
    case 'Tab': case 'ArrowRight': e.preventDefault(); selectCategory(state.catIdx + 1); return;
    case 'ArrowLeft': e.preventDefault(); selectCategory(state.catIdx - 1); return;
  }
}

/** Boot the Reference DB browser (`?refdb=1`). Returns true once tables are loaded. */
export async function startReferenceDb(): Promise<boolean> {
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  setStatus('Opening the reference DB…');

  const { frameTiles, font } = await loadChrome();

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>Tab</b> category · <b>↑↓</b> browse · <b>Esc</b> close. A cyclopedia over the game\'s own decoded monster / item / spell tables.';
  frame.appendChild(menu);

  const bar = el('div', 'sheet-buttons');
  const mkBtn = (label: string, fn: () => void): void => {
    const b = el('button', 'gb-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  mkBtn('Monsters', () => selectCategory(0));
  mkBtn('Items', () => selectCategory(1));
  mkBtn('Spells', () => selectCategory(2));
  mkBtn('▲ Prev', () => move(-1));
  mkBtn('▼ Next', () => move(1));
  mkBtn('✕ Exit', () => closeReferenceDb());
  frame.appendChild(bar);

  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  const categories = await loadCategories();
  state = { surface, frameTiles, font, categories, catIdx: 0, sel: 0, top: 0 };
  drawScreen();
  surface.refresh();
  setStatus(`Reference DB: ${categories.map((c) => `${c.entries.length} ${c.label.toLowerCase()}`).join(', ')}.`);

  // Headless e2e seam.
  (window as unknown as { __refdb?: Record<string, unknown> }).__refdb = {
    open: () => startReferenceDb(),
    close: () => closeReferenceDb(),
    isOpen: () => isReferenceDbOpen(),
    categories: () => state?.categories.map((c) => c.label) ?? [],
    category: () => state?.categories[state.catIdx]?.label ?? '',
    categoryKey: () => state?.categories[state.catIdx]?.key ?? '',
    entryCount: () => state?.categories[state.catIdx]?.entries.length ?? 0,
    selected: () => state?.sel ?? -1,
    move: (d: number) => move(d),
    select: (i: number) => { if (state) { state.sel = i; drawScreen(); } },
    nextCategory: () => { if (state) selectCategory(state.catIdx + 1); },
    prevCategory: () => { if (state) selectCategory(state.catIdx - 1); },
    setCategory: (i: number) => selectCategory(i),
    current: () => {
      if (!state) return null;
      const cat = state.categories[state.catIdx];
      return cat ? { name: cat.entries[state.sel]?.name ?? '', tag: cat.entries[state.sel]?.tag ?? '', detail: cat.details[state.sel] ?? [] } : null;
    },
  };
  return categories.length > 0;
}
