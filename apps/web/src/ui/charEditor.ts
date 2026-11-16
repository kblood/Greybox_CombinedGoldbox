/**
 * Character/Save editor (D3, `?chared=1`) — a faithful reader **and writer** for an original
 * Champions of Krynn `SAVE/CHRDATA{n}.SAV` record (the 409-byte SSI `.CCH` family). Pick a slot,
 * and the engine `decodeSavedCharacter` parses the verified fields (name, the six ability scores,
 * HP, the inverted AC/THAC0 store, the five saving throws, XP, class code); they are shown on the
 * same emulated 320×200 EGA character page the in-game View screen uses via `composeCharSheet`.
 *
 * Edits go through `editSavedCharacter` (clamped to the pinned field bounds) and re-render live;
 * **Export** re-encodes a byte-stable 409-byte `.SAV` via `encodeSavedCharacter`, overlaying only
 * the modelled fields onto the original buffer so every byte we have *not* reversed (per-class
 * level breakdown, race, spell slots, alignment) is carried through untouched. Each export is
 * round-trip-checked (decode∘encode reproduces the edited fields) before the download is offered —
 * this writer is the same .CCH path the PRIMARY native-format goal needs.
 *
 * **DoK mode (M13, `?chared=dok`)** is a *reader only* over `SAVE/CHRDATA{n}.GAM` (216-byte
 * compact record, same struct family) plus its `.JNK` inventory and `.EFF` active-effect
 * sidecars. There is no Export here: `.GAM`'s AC/damage bytes are the unarmoured-human *baseline*,
 * not the character's effective fighting stats, so round-tripping "edits" to those fields would
 * silently misrepresent what the record actually means. The sheet shows that honestly
 * (`AC: N (base)`) rather than pretending to a full CoK-style editor.
 *
 * CORRECTED 2026-09-07: the reason given here used to begin "DoK's `.GAM` does not store hit points
 * at all (the engine rolls HP from hit dice at runtime)", and the sheet rendered `HP: n/a`. It does
 * store them, at byte 40, so HP is now shown. The AC/damage half of the argument is untouched and is
 * still why there is no Export.
 *
 * Mirrors the HUD/Automap panels (load chrome → screen surface → keydown → `window.__chared`
 * e2e seam) so it slots into the same sidebar/route pattern.
 */
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  composeCharSheet,
  decodeSavedCharacter,
  encodeSavedCharacter,
  editSavedCharacter,
  sniffSavedCharacter,
  cokClassLabel,
  cokRaceLabel,
  decodeDokSavedCharacter,
  sniffDokSavedCharacter,
  decodeDokJnkFile,
  decodeDokEffFile,
  type SavedCharacter,
  type SavedAbilities,
  type SavingThrows,
  type DokSavedCharacter,
  type DokJnkItem,
  type DokEffect,
  type CharSheetView,
  type IndexedImage,
  type BitmapFont,
  type Palette,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { dmgText } from './referenceDb.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX'; // shared UI chrome/font — every explore view reuses it
const FRAME_BLOCK = 202;

export type CharEditorMode = 'cok' | 'dok';

/** The CoK save slots, spelled as literals so `scripts/bundle-assets.mjs` ships them. */
const COK_SLOT_PATHS = [
  'Champions of Krynn/SAVE/CHRDATA1.SAV',
  'Champions of Krynn/SAVE/CHRDATA2.SAV',
  'Champions of Krynn/SAVE/CHRDATA3.SAV',
  'Champions of Krynn/SAVE/CHRDATA4.SAV',
  'Champions of Krynn/SAVE/CHRDATA5.SAV',
  'Champions of Krynn/SAVE/CHRDATA6.SAV',
];

/**
 * The DoK save slots. `.JNK`/`.EFF` paths are spelled out as their own literals (not derived by
 * string-replace on the `.GAM` path) so `scripts/bundle-assets.mjs`'s literal scan ships them too
 * — a computed path is invisible to that scan and would silently 404 in the static build.
 */
const DOK_SLOT_PATHS = [
  'Death Knights of Krynn/SAVE/CHRDATA1.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA2.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA3.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA4.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA5.GAM',
  'Death Knights of Krynn/SAVE/CHRDATA6.GAM',
];
const DOK_SLOT_JNK_PATHS = [
  'Death Knights of Krynn/SAVE/CHRDATA1.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA2.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA3.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA4.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA5.JNK',
  'Death Knights of Krynn/SAVE/CHRDATA6.JNK',
];
const DOK_SLOT_EFF_PATHS = [
  'Death Knights of Krynn/SAVE/CHRDATA1.EFF',
  'Death Knights of Krynn/SAVE/CHRDATA2.EFF',
  'Death Knights of Krynn/SAVE/CHRDATA3.EFF',
  'Death Knights of Krynn/SAVE/CHRDATA4.EFF',
  'Death Knights of Krynn/SAVE/CHRDATA5.EFF',
  'Death Knights of Krynn/SAVE/CHRDATA6.EFF',
];

function slotPaths(mode: CharEditorMode): string[] {
  return mode === 'dok' ? DOK_SLOT_PATHS : COK_SLOT_PATHS;
}

const SAVE_ROWS: { label: string; key: keyof SavedCharacter['savingThrows'] }[] = [
  { label: 'Paralyze/Poison/Death', key: 'paralyzePoisonDeath' },
  { label: 'Petrify/Polymorph', key: 'petrifyPolymorph' },
  { label: 'Rod/Staff/Wand', key: 'rodStaffWand' },
  { label: 'Breath Weapon', key: 'breath' },
  { label: 'Spell', key: 'spell' },
];

interface EditorState {
  mode: CharEditorMode;
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  slot: number; // 0-based index into the active mode's slot paths
  base: Uint8Array | null; // the original CoK 409-byte buffer (preserves unmodelled bytes) — cok mode only
  cur: SavedCharacter | null; // the working (possibly edited) CoK character — cok mode only
  dokCur: DokSavedCharacter | null; // the decoded DoK character — dok mode only
  dokItems: DokJnkItem[]; // .JNK inventory — dok mode only
  dokEffects: DokEffect[]; // .EFF active effects — dok mode only
  controls: HTMLElement | null;
  controlsGen: number; // renewed by each buildControls that replaces the CoK fields; older fields are inert
  loadGen: number; // renewed synchronously by each logical slot load; a load writes only while it is still the newest
  requestedSlot: number; // the slot most recently asked for (may be pending or missing); Next steps from it
  session: number; // identity of this open; async slot reads only write while it is still current
  returnToMenu: ReturnToMenu | null; // continuation supplied by the opener (main menu), if any
}

/**
 * How one logical slot load ended. `superseded` means a newer load of this open, or a newer open,
 * took over before this one could publish; it is not a missing save and must not start another probe.
 */
type LoadOutcome = 'loaded' | 'missing' | 'superseded';

/**
 * Optional continuation for callers that own a surrounding screen (the CoK main menu). Called at most
 * once per open, after the editor's own cleanup, with a short status line to show on return. Absent,
 * the editor behaves as the standalone `?chared=1` route always has.
 */
export type ReturnToMenu = (status: string) => void;

export interface CharEditorOptions {
  returnToMenu?: ReturnToMenu;
}

const CLOSED_STATUS = 'Closed the character editor.';
const PRODUCTION_UNAVAILABLE = 'Save editor unavailable: public builds do not distribute saved characters.';

let state: EditorState | null = null;
let sessionSeq = 0; // bumped by every startCharEditor and closeCharEditor call
let pendingOpen = false; // an open has started but has not yet installed `state`

/** True only while `session` is the open editor. A closed or replaced editor never passes. */
function isSessionOpen(session: number): boolean {
  return !!state && state.session === session;
}

/** True only while `session` is open and `token` is the controls generation of its newest CoK build. */
function isControlLive(session: number, token: number): boolean {
  return isSessionOpen(session) && !!state && state.controlsGen === token;
}

/**
 * The open's state while `session` is open and `req` is still its newest slot load; otherwise null.
 * Load publication (state, paint, controls, status) happens only after this returns a state.
 */
function liveLoad(session: number, req: number): EditorState | null {
  return isSessionOpen(session) && state && state.loadGen === req ? state : null;
}

/**
 * Drop the current editor's key listener and state silently: no return continuation and no status.
 * Used when a newer open replaces it; the caller owns what the screen shows next.
 */
function retireEditor(): void {
  window.removeEventListener('keydown', onKey);
  state = null;
}

/**
 * The class line for a CoK save: **the game's own label**, from the 17-entry `START.EXE` enum at
 * save byte 91 — so a multiclass reads "CLERIC/MAGE", the way the retail MODIFY CHARACTER screen
 * writes it, instead of being flattened to one component.
 *
 * Before 2026-09-07 this read byte 90 (the race) through a three-name map and fell back to
 * `CLASS <n>` for everything else, so 3 of the 6 shipped CoK saves displayed a wrong class name and
 * 3 displayed a bare number. `cokClassLabel` still falls back to `CLASS <n>` for a byte outside the
 * enum, which no retail record produces.
 */
function classLine(sc: SavedCharacter): string {
  return cokClassLabel(sc.classCode).toUpperCase();
}

/** Flatten a CoK saved character into the engine compositor's view model. */
function toView(sc: SavedCharacter, slot: number): CharSheetView {
  const ab = sc.abilities;
  return {
    name: sc.name.trim() || `SLOT ${slot + 1}`,
    // The game's own race label (save byte 90), not the placeholder 'COK SAVE' that stood here while
    // the race byte was believed unlocatable.
    raceLine: cokRaceLabel(sc.raceCode).toUpperCase(),
    classLine: classLine(sc),
    abilities: [
      { label: 'Str', value: `${ab.str}` },
      { label: 'Int', value: `${ab.int}` },
      { label: 'Wis', value: `${ab.wis}` },
      { label: 'Dex', value: `${ab.dex}` },
      { label: 'Con', value: `${ab.con}` },
      { label: 'Cha', value: `${ab.cha}` },
    ],
    ac: sc.armorClass,
    thac0: sc.thac0,
    hp: sc.hitPoints,
    maxHp: sc.hitPoints,
    saves: SAVE_ROWS.map((r) => ({ label: r.label, value: sc.savingThrows[r.key] })),
    footer: `XP ${sc.xp}`,
    index: `${slot + 1}/${COK_SLOT_PATHS.length}`,
  };
}

/**
 * Flatten a DoK `.GAM` character into the same compositor's view model. HP is read from byte 40
 * (`'n/a'` here until 2026-09-07); AC and DMG are both labelled `(base)` since they are the
 * unarmoured/unarmed baseline, not the character's effective fighting stats (see the file-level doc
 * comment). HP is shown WITHOUT a `(base)` qualifier because, unlike AC, it is the character's real
 * stored total — but note `dokSavedCharacter.ts` records that the corpus cannot say whether byte 40
 * is the maximum or the current total; every shipped pregen is undamaged and byte 214 agrees with it.
 */
function toViewDok(c: DokSavedCharacter, slot: number, items: DokJnkItem[], effects: DokEffect[]): CharSheetView {
  const ab = c.abilities;
  return {
    name: c.name.trim() || `SLOT ${slot + 1}`,
    raceLine: 'DOK SAVE (.GAM)',
    classLine: `CLASS CODE ${c.classCode}`,
    abilities: [
      { label: 'Str', value: `${ab.str}` },
      { label: 'Int', value: `${ab.int}` },
      { label: 'Wis', value: `${ab.wis}` },
      { label: 'Dex', value: `${ab.dex}` },
      { label: 'Con', value: `${ab.con}` },
      { label: 'Cha', value: `${ab.cha}` },
    ],
    ac: `${c.baseArmorClass} (base)`,
    // M67.S1 — the same decode call that produces `baseArmorClass` above also produces
    // `baseDamage` (the unarmed-strike baseline); it was decoded and e2e-asserted but never shown.
    dmg: `${dmgText(c.baseDamage)} (base)`,
    thac0: c.thac0,
    hp: c.hitPoints,
    maxHp: c.hitPoints,
    saves: SAVE_ROWS.map((r) => ({ label: r.label, value: '—' })), // not located in .GAM
    footer: `${items.length} item${items.length === 1 ? '' : 's'} · ${effects.length} active effect${effects.length === 1 ? '' : 's'}`,
    index: `${slot + 1}/${DOK_SLOT_PATHS.length}`,
  };
}

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

function drawScreen(): void {
  if (!state) return;
  if (state.mode === 'dok') {
    if (!state.dokCur) return;
    const fb = composeCharSheet({
      frameTiles: state.frameTiles,
      font: state.font,
      sheet: toViewDok(state.dokCur, state.slot, state.dokItems, state.dokEffects),
      menu: { items: ['Slot ▶', 'Exit'], selected: -1 },
    });
    state.surface.paint(fb, EGA_PALETTE);
    return;
  }
  if (!state.cur) return;
  const fb = composeCharSheet({
    frameTiles: state.frameTiles,
    font: state.font,
    sheet: toView(state.cur, state.slot),
    menu: { items: ['Export', 'Slot ▶', 'Exit'], selected: -1 },
  });
  state.surface.paint(fb, EGA_PALETTE);
}

/** Apply a clamped patch through the engine editor and re-render. CoK mode only. */
function applyPatch(patch: Parameters<typeof editSavedCharacter>[1]): void {
  if (!state || !state.cur) return;
  state.cur = editSavedCharacter(state.cur, patch);
  drawScreen();
  syncControls();
}

/** `applyPatch` for one open session only: a closed or replaced session changes nothing. */
function applyPatchFor(session: number, patch: Parameters<typeof editSavedCharacter>[1]): void {
  if (!isSessionOpen(session)) return;
  applyPatch(patch);
}

/** Re-encode the working character and verify decode∘encode reproduces the edited fields. CoK mode only. */
function exportBytes(): { bytes: Uint8Array; roundTrips: boolean } | null {
  if (!state || state.mode !== 'cok' || !state.cur) return null;
  const bytes = encodeSavedCharacter(state.cur, state.base ?? undefined);
  const back = decodeSavedCharacter(bytes);
  const c = state.cur;
  const roundTrips =
    back.name === c.name.slice(0, 15) &&
    back.abilities.str === c.abilities.str &&
    back.abilities.int === c.abilities.int &&
    back.abilities.wis === c.abilities.wis &&
    back.abilities.dex === c.abilities.dex &&
    back.abilities.con === c.abilities.con &&
    back.abilities.cha === c.abilities.cha &&
    back.hitPoints === c.hitPoints &&
    back.armorClass === c.armorClass &&
    back.thac0 === c.thac0 &&
    back.xp === c.xp &&
    SAVE_ROWS.every((r) => back.savingThrows[r.key] === c.savingThrows[r.key]);
  return { bytes, roundTrips };
}

/** Offer the re-encoded record as a download (only when the round-trip check passes). CoK mode only. */
function downloadExport(): void {
  const res = exportBytes();
  if (!res) return;
  if (!res.roundTrips) { setStatus('Export blocked: round-trip mismatch.'); return; }
  const blob = new Blob([res.bytes as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CHRDATA${state!.slot + 1}.SAV`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${a.download} — round-trip verified (409 bytes).`);
}

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Load a CoK slot's save. Decodes into locals and commits slot, base and character together, only after
 * the read is still the open's newest load. `missing` covers an absent file or a non-save (it writes the
 * "no CoK save" status); `superseded` writes nothing at all.
 */
async function loadCokSlot(session: number, req: number, idx: number): Promise<LoadOutcome> {
  const bytes = await fetchBytes(COK_SLOT_PATHS[idx]);
  const live = liveLoad(session, req);
  if (!live) return 'superseded';
  if (!bytes || !sniffSavedCharacter(bytes)) {
    setStatus(`Slot ${idx + 1}: no CoK save present.`);
    return 'missing';
  }
  const base = bytes.slice(0, 409);
  const cur = decodeSavedCharacter(bytes);
  live.slot = idx;
  live.base = base;
  live.cur = cur;
  drawScreen();
  buildControls();
  setStatus(`Loaded ${cur.name.trim() || `slot ${idx + 1}`} — edit and export.`);
  return 'loaded';
}

/**
 * Load a DoK slot's `.GAM`/`.JNK`/`.EFF` quad into the (read-only) editor. Every read is checked against the
 * open's newest load before the next one starts. Character, items and effects are staged and committed together
 * once the whole chain has finished. An absent `.JNK` or `.EFF` is an empty list, not a failure.
 */
async function loadDokSlot(session: number, req: number, idx: number): Promise<LoadOutcome> {
  const gamBytes = await fetchBytes(DOK_SLOT_PATHS[idx]);
  if (!liveLoad(session, req)) return 'superseded';
  if (!gamBytes || !sniffDokSavedCharacter(gamBytes)) {
    setStatus(`Slot ${idx + 1}: no DoK save present.`);
    return 'missing';
  }
  const dokCur = decodeDokSavedCharacter(gamBytes);
  const jnkBytes = await fetchBytes(DOK_SLOT_JNK_PATHS[idx]);
  if (!liveLoad(session, req)) return 'superseded';
  const dokItems = jnkBytes ? decodeDokJnkFile(jnkBytes) : [];
  const effBytes = await fetchBytes(DOK_SLOT_EFF_PATHS[idx]);
  const live = liveLoad(session, req);
  if (!live) return 'superseded';
  const dokEffects = effBytes ? decodeDokEffFile(effBytes) : [];
  live.slot = idx;
  live.dokCur = dokCur;
  live.dokItems = dokItems;
  live.dokEffects = dokEffects;
  drawScreen();
  buildControls();
  setStatus(`Loaded ${dokCur.name.trim() || `slot ${idx + 1}`} — read-only DoK save view.`);
  return 'loaded';
}

/**
 * Start one logical slot load for the given open. The request number is taken synchronously, before any
 * await, so a later load (Next, a seam call or a scan probe) supersedes this one. A closed or replaced
 * session starts nothing and resolves `superseded`.
 */
function startSlotLoad(session: number, idx: number): Promise<LoadOutcome> {
  if (!isSessionOpen(session) || !state) return Promise.resolve('superseded');
  const req = ++state.loadGen;
  const paths = slotPaths(state.mode);
  const wrapped = ((idx % paths.length) + paths.length) % paths.length;
  state.requestedSlot = wrapped;
  return state.mode === 'dok' ? loadDokSlot(session, req, wrapped) : loadCokSlot(session, req, wrapped);
}

/** Load slot `idx` for the given open session. Resolves `false` for missing, superseded or closed. */
function loadSlotFor(session: number, idx: number): Promise<boolean> {
  return startSlotLoad(session, idx).then((o) => o === 'loaded');
}

/**
 * Advance the given session to the next slot (wrapping), counting from the most recently requested slot so
 * that rapid Next presses step through slots in order. Returns the load's own promise so a caller
 * can await the `.GAM` -> `.JNK` -> `.EFF` fetch chain it starts — which is what lets the headless
 * `window.__chared.next()` seam settle before the harness reads `fields()`. The keyboard and
 * button callers below discard it.
 */
function nextSlotFor(session: number): Promise<boolean> {
  if (!isSessionOpen(session) || !state) return Promise.resolve(false);
  return loadSlotFor(session, state.requestedSlot + 1);
}

// --- Editor controls (HTML form beneath the emulated page) --------------------

const ABILITY_KEYS: (keyof SavedAbilities)[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

function numberField(label: string, value: number, min: number, max: number, on: (v: number) => void, live: () => boolean): HTMLElement {
  const wrap = el('label', 'chared-field');
  wrap.appendChild(el('span', 'chared-label', label));
  const input = el('input', 'chared-input') as HTMLInputElement;
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.addEventListener('change', () => { if (live()) on(Math.round(Number(input.value) || 0)); });
  wrap.appendChild(input);
  return wrap;
}

/** Read-only DoK inventory/effects list — no `<input>`s, since this mode never writes a file. */
function buildDokControls(): void {
  if (!state || !state.controls) return;
  const host = state.controls;
  host.innerHTML = '';

  const items = el('div', 'chared-list-field');
  items.appendChild(el('span', 'chared-label', 'Inventory (.JNK)'));
  const itemList = el('ul', 'chared-list');
  for (const it of state.dokItems) {
    const label = it.count > 0 ? `${it.name.trim()} ×${it.count}` : it.name.trim();
    itemList.appendChild(el('li', '', label));
  }
  if (state.dokItems.length === 0) itemList.appendChild(el('li', '', '(none)'));
  items.appendChild(itemList);
  host.appendChild(items);

  const effects = el('div', 'chared-list-field');
  effects.appendChild(el('span', 'chared-label', 'Active effects (.EFF)'));
  const effList = el('ul', 'chared-list');
  for (const e of state.dokEffects) {
    effList.appendChild(el('li', '', `type ${e.type} · ${e.minutes === 0 ? 'permanent' : `${e.minutes}min`}`));
  }
  if (state.dokEffects.length === 0) effList.appendChild(el('li', '', '(none)'));
  effects.appendChild(effList);
  host.appendChild(effects);
}

function buildControls(): void {
  if (!state || !state.controls) return;
  if (state.mode === 'dok') { buildDokControls(); return; }
  if (!state.cur) return;
  const host = state.controls;
  host.innerHTML = '';
  const c = state.cur;
  // This build replaces every field: renew the generation, so fields from any earlier build are inert.
  // Only this build's fields carry `live`; `syncControls` writes values without renewing it.
  const session = state.session;
  const token = ++state.controlsGen;
  const live = (): boolean => isControlLive(session, token);

  const nameWrap = el('label', 'chared-field');
  nameWrap.appendChild(el('span', 'chared-label', 'Name'));
  const nameInput = el('input', 'chared-input chared-name') as HTMLInputElement;
  nameInput.type = 'text';
  nameInput.maxLength = 15;
  nameInput.value = c.name;
  nameInput.addEventListener('change', () => { if (live()) applyPatch({ name: nameInput.value }); });
  nameWrap.appendChild(nameInput);
  host.appendChild(nameWrap);

  for (const k of ABILITY_KEYS) {
    host.appendChild(numberField(k.toUpperCase(), c.abilities[k], 1, 25, (v) => applyPatch({ abilities: { [k]: v } as Partial<SavedAbilities> }), live));
  }
  host.appendChild(numberField('HP', c.hitPoints, 0, 255, (v) => applyPatch({ hitPoints: v }), live));
  host.appendChild(numberField('AC', c.armorClass, -10, 10, (v) => applyPatch({ armorClass: v }), live));
  host.appendChild(numberField('THAC0', c.thac0, 0, 30, (v) => applyPatch({ thac0: v }), live));
  host.appendChild(numberField('XP', c.xp, 0, 0xffff, (v) => applyPatch({ xp: v }), live));
  for (const r of SAVE_ROWS) {
    host.appendChild(numberField(r.label, c.savingThrows[r.key], 0, 20, (v) => applyPatch({ savingThrows: { [r.key]: v } as Partial<SavingThrows> }), live));
  }
}

/** Push the current values back into the inputs after a clamped edit (so clamps show). CoK mode only. */
function syncControls(): void {
  if (!state || state.mode !== 'cok' || !state.cur || !state.controls) return;
  const c = state.cur;
  const inputs = state.controls.querySelectorAll('input');
  const name = state.controls.querySelector('.chared-name') as HTMLInputElement | null;
  if (name && document.activeElement !== name) name.value = c.name;
  const vals = [
    c.abilities.str, c.abilities.int, c.abilities.wis, c.abilities.dex, c.abilities.con, c.abilities.cha,
    c.hitPoints, c.armorClass, c.thac0, c.xp,
    ...SAVE_ROWS.map((r) => c.savingThrows[r.key]),
  ];
  // inputs[0] is the name (text); the numeric fields follow in order.
  let i = 1;
  for (const v of vals) {
    const inp = inputs[i++] as HTMLInputElement | undefined;
    if (inp && document.activeElement !== inp) inp.value = String(v);
  }
}

export function isCharEditorOpen(): boolean {
  return !!state && document.body.contains(state.surface.canvas);
}

/**
 * Remove the editor's listener and state (no continuation). Used by the headless seam and by Exit.
 * Also invalidates an open that is still waiting on chrome or slot reads, even before its state
 * exists, so that pending open mounts nothing and writes no status.
 */
export function closeCharEditor(): void {
  const wasActive = !!state || pendingOpen;
  retireCharEditorSilently();
  if (wasActive) setStatus(CLOSED_STATUS);
}

/**
 * Silently retire any mounted or pending editor for a caller that is taking the screen (a newer main
 * menu). No continuation runs and no status is written; a later Escape or slot read finds nothing open.
 */
export function retireCharEditorSilently(): void {
  sessionSeq++;
  pendingOpen = false;
  retireEditor();
}

/**
 * Explicit Exit/Escape for one open session. Cleanup (listener and state) runs first; the continuation
 * then runs once, if the opener supplied one. A stale Exit button from an earlier open does nothing.
 */
function exitCharEditor(session: number): void {
  if (!isSessionOpen(session) || !state) return;
  const back = state.returnToMenu;
  closeCharEditor();
  back?.(CLOSED_STATUS);
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // typing in a field
  switch (e.key) {
    case 'Escape': e.preventDefault(); exitCharEditor(state.session); return;
    case 'e': case 'E': if (state.mode === 'cok') { e.preventDefault(); downloadExport(); } return;
    case 'n': case 'N': e.preventDefault(); void nextSlotFor(state.session); return;
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

/**
 * Boot the character/save editor (`?chared=1` CoK read+write, `?chared=dok` DoK read-only).
 *
 * Return value: `true` only when a CoK/DoK slot was loaded. `false` means "no slot loaded", which
 * covers a mounted editor with no valid save, a public build (production), and an open that was
 * superseded or closed before it finished. Do NOT read `false` as "no editor is mounted". Use
 * `isCharEditorOpen()` for that.
 *
 * With `options.returnToMenu`, Exit/Escape hands control back once, and a production build returns
 * there with an honest status instead of mounting. Without it, both keep the standalone behaviour.
 */
export async function startCharEditor(mode: CharEditorMode = 'cok', options: CharEditorOptions = {}): Promise<boolean> {
  // A new open owns the screen from this synchronous point on: any mounted or still-pending editor is
  // dropped now, before any await, and silently (its continuation is not called).
  const session = ++sessionSeq;
  retireEditor();
  pendingOpen = true;
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  if (import.meta.env.PROD) {
    pendingOpen = false;
    if (options.returnToMenu) {
      options.returnToMenu(PRODUCTION_UNAVAILABLE);
      return false;
    }
    out?.appendChild(el('div', 'note', 'The save editor requires a local game installation; public builds do not distribute saved characters.'));
    setStatus('Save editor unavailable without local save data.');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return false;
  }
  setStatus(mode === 'dok' ? 'Opening the DoK save viewer…' : 'Opening the character editor…');

  const { frameTiles, font } = await loadChrome();
  // A newer open started while the chrome loaded; it owns the screen, so this one mounts nothing.
  if (session !== sessionSeq) return false;

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    mode === 'dok'
      ? '<b>N</b>ext slot · <b>Esc</b> close. Read-only view of a real DoK save — HP is not stored in .GAM, AC/damage shown are the unarmoured baseline.'
      : '<b>E</b>xport · <b>N</b>ext slot · <b>Esc</b> close. Edit a real CoK save below — unmodelled bytes are preserved on export.';
  frame.appendChild(menu);

  const controls = el('div', 'chared-controls');
  frame.appendChild(controls);

  const bar = el('div', 'sheet-buttons');
  const mkBtn = (label: string, fn: () => void): void => {
    const b = el('button', 'gb-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  // Toolbar actions act only for the session that owns this bar; a stale bar from a closed or replaced open does nothing.
  if (mode === 'cok') mkBtn('⬇ Export .SAV', () => { if (isSessionOpen(session)) downloadExport(); });
  mkBtn('Next slot ▶', () => { void nextSlotFor(session); });
  mkBtn('✕ Exit', () => exitCharEditor(session));
  frame.appendChild(bar);

  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  state = {
    mode, surface, frameTiles, font, slot: 0, base: null, cur: null, dokCur: null, dokItems: [], dokEffects: [], controls,
    controlsGen: 0, loadGen: 0, requestedSlot: 0, session, returnToMenu: options.returnToMenu ?? null,
  };
  pendingOpen = false;

  // Load the first present slot as one discovery operation. A `missing` probe moves on to the next slot;
  // a `superseded` probe (a Next, a seam load, or a newer open) ends the scan, since that navigation now
  // owns the screen. Cancellation is never read as "missing", so no further probe starts.
  let loaded = false;
  const paths = slotPaths(mode);
  for (let i = 0; i < paths.length; i++) {
    const outcome = await startSlotLoad(session, i);
    if (outcome === 'loaded') { loaded = true; break; }
    if (outcome === 'superseded') break;
  }

  // Publish only for the still-current open. A scan ended by navigation keeps the seam, so the live editor
  // stays drivable; its result is `false` because this scan itself loaded nothing.
  if (!isSessionOpen(session)) return false;
  surface.refresh();

  // Headless e2e seam (installed only for the still-current open, never over a newer one's seam).
  // Mutators are bound to this open's session, so a retained seam from a closed or replaced editor does nothing.
  // Reads keep reporting the current editor (unchanged semantics).
  (window as unknown as { __chared?: Record<string, unknown> }).__chared = {
    open: (m: CharEditorMode = 'cok') => startCharEditor(m),
    close: () => { if (isSessionOpen(session)) closeCharEditor(); },
    isOpen: () => isCharEditorOpen(),
    mode: () => state?.mode ?? null,
    slot: () => state?.slot ?? -1,
    loadSlot: (n: number) => loadSlotFor(session, n),
    next: () => nextSlotFor(session),
    fields: () => {
      if (!state) return null;
      if (state.mode === 'dok') {
        if (!state.dokCur) return null;
        const c = state.dokCur;
        return {
          name: c.name, abilities: { ...c.abilities }, thac0: c.thac0, classCode: c.classCode,
          baseArmorClass: c.baseArmorClass, baseDamage: { ...c.baseDamage },
          itemCount: state.dokItems.length, effectCount: state.dokEffects.length,
        };
      }
      if (!state.cur) return null;
      const c = state.cur;
      return {
        name: c.name, abilities: { ...c.abilities }, hitPoints: c.hitPoints, armorClass: c.armorClass,
        thac0: c.thac0, xp: c.xp, classCode: c.classCode, savingThrows: { ...c.savingThrows },
      };
    },
    edit: (patch: Parameters<typeof editSavedCharacter>[1]) => applyPatchFor(session, patch),
    exportBytes: () => {
      const r = exportBytes();
      return r ? { bytes: Array.from(r.bytes), roundTrips: r.roundTrips } : null;
    },
    // M67.S1 — the composed DMG row text (DoK mode only), proving `toViewDok()` actually rendered
    // `baseDamage`, not just that `fields()` can read the raw decoded value.
    dmg: () => (state?.mode === 'dok' && state.dokCur)
      ? toViewDok(state.dokCur, state.slot, state.dokItems, state.dokEffects).dmg ?? null
      : null,
  };
  return loaded;
}
