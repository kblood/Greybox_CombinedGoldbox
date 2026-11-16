/**
 * Character creation view (M2.S4d) — build a Champions of Krynn party in the browser on top of the
 * engine's `createCharacter` validator. Pick race / sex / class(es) / abilities / deity; the view
 * validates live (showing every rule violation) and previews the derived sheet (THAC0, AC, saves,
 * spell slots, Knight order). A valid character is added to the persistent party roster (`party.ts`),
 * which the explore view then fights encounters with.
 *
 * A `window.__create` seam lets the headless e2e drive the whole flow without synthetic DOM events.
 */
import {
  DL_RACES,
  classesForRace,
  deitiesForRace,
  abilityRange,
  createCharacter,
  ADND1E_ABILITIES,
  hitDie,
  MOONS,
  addPlayer,
  type DragonlanceRaceId,
  type DragonlanceClassId,
  type DeityId,
  type Sex,
  type AbilityScores,
  type CharacterRequest,
  type CharacterSheet,
  type RobeOrder,
  type Roster,
  type RosterMember,
} from '@goldbox/engine';
import { el } from './render.js';
import { addToParty, getParty, removeFromParty, partySize } from './party.js';
import { REASON_MESSAGE } from './importParty.js';
import { cokPlayerAppearanceChoices, cokPlayerAppearanceForChoice } from './cokPlayerAppearanceChoices.js';
import { prepareCokPlayerAppearance, resolveCokPlayerPresentation, type CokPlayerAppearance, type CokPlayerPreparation } from './cokPlayerAppearance.js';
import { readRuntimeGraphicsFallback, readRuntimeGraphicsMode } from './runtimeGraphicsMode.js';
import { cokGraphicsControls } from './cokGraphicsControls.js';

/**
 * M94.S1 — the same `RosterMember` shape `importParty.ts`'s save-import gate builds, for a hand-made
 * `CharacterSheet`. `alignment`/`paladinLevel` are hard-defaulted to values that can never trigger the
 * paladin/evil gates (mirroring `importParty.ts`'s own precedent for data a `CharacterSheet` cannot
 * carry at all); `rangerLevel` is the one field that both exists and matters here.
 */
function toRosterMember(sheet: CharacterSheet): RosterMember {
  return {
    name: sheet.name,
    modId: 0,
    controlMorale: 0,
    alignment: 0,
    paladinLevel: 0,
    rangerLevel: sheet.classes.ranger ?? 0,
  };
}

function currentRoster(): Roster {
  return { members: getParty().map(toRosterMember) };
}

const ABILITIES: (keyof AbilityScores & ('str' | 'int' | 'wis' | 'dex' | 'con' | 'cha'))[] = [
  'str', 'int', 'wis', 'dex', 'con', 'cha',
];

const ARMOR: { label: string; ac: number }[] = [
  { label: 'Unarmored (10)', ac: 10 },
  { label: 'Leather (8)', ac: 8 },
  { label: 'Chain (5)', ac: 5 },
  { label: 'Plate (3)', ac: 3 },
];

interface Draft {
  name: string;
  race: DragonlanceRaceId;
  sex: Sex;
  classes: Partial<Record<DragonlanceClassId, number>>;
  abilities: AbilityScores;
  deity?: DeityId;
  robe?: RobeOrder;
  baseAc: number;
  shield: boolean;
  appearanceId?: string;
}

function rollAbility(): number {
  // 4d6 drop lowest.
  const d = [0, 0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b);
  return d[1] + d[2] + d[3];
}

/** Clamp one ability to the race's legal range (STR uses sex). */
function clampAbility(
  race: DragonlanceRaceId,
  sex: Sex,
  key: (typeof ABILITIES)[number],
  value: number,
): number {
  const r = abilityRange(race, key, sex);
  return Math.min(r.max, Math.max(r.min, value));
}

/** Estimate HP: best level × average hit die (across classes) + per-level Con bonus. */
function estimateHp(draft: Draft): number {
  const entries = Object.entries(draft.classes).filter(([, l]) => (l ?? 0) > 0) as [
    DragonlanceClassId,
    number,
  ][];
  if (entries.length === 0) return 1;
  const level = Math.max(...entries.map(([, l]) => l));
  const isWarrior = entries.some(([c]) => c === 'fighter' || c === 'knight' || c === 'ranger');
  const avgDie =
    entries.reduce((sum, [c]) => sum + hitDie(c === 'knight' ? 'fighter' : c), 0) / entries.length;
  const con = ADND1E_ABILITIES.constitution(draft.abilities.con, isWarrior).hp;
  return Math.max(1, Math.round(level * (avgDie / 2 + 0.5)) + level * con);
}

function draftToRequest(draft: Draft): CharacterRequest {
  const hp = estimateHp(draft);
  const appearance = cokPlayerAppearanceForChoice(draft.appearanceId);
  return {
    name: draft.name,
    race: draft.race,
    sex: draft.sex,
    classes: draft.classes,
    abilities: draft.abilities,
    deity: draft.deity,
    robe: draft.robe,
    hp,
    maxHp: hp,
    baseAc: draft.baseAc - (draft.shield ? 1 : 0),
    ...(appearance ? { appearance } : {}),
  };
}

let draft: Draft;
let rerender: () => void = () => {};
/** One `startCreate` call's ownership record. Its rendered Return and Begin controls capture this object; the
 *  newest `startCreate` replaces `activeCreate`, so every older control becomes a no-op for Return. */
interface CreateSession {
  /** Set by the `?play=cok` flow (A6.3): when present and the party is non-empty, the form shows a
   *  "Begin Adventure" button that hands off to the dungeon. Bound to this session, so an old button never
   *  calls a replacement creator's callback. Unset in the standalone `?create=1` view. */
  onBegin: (() => void) | undefined;
  /** Set by a main-menu Create (goal 221): the form shows "Return to Main Menu" instead of Begin Adventure,
   *  even with an empty party. Consumed (cleared) before it is invoked, so the continuation fires at most once.
   *  Returns `false` when the menu that started it has been replaced; that return then does nothing. */
  onReturnToMenu: (() => boolean) | undefined;
}
/** The creator whose draft is live. Only this session's Return controls may touch `draft`. */
let activeCreate: CreateSession | undefined;
/** Monotonic id of the newest rendered form. Each `buildForm` takes a fresh token; a control whose token is no
 *  longer the newest belongs to a detached form, so it must not act even if its creator is still live. */
let renderToken = 0;
/** A DOM-triggered action bound to one session and one render is live only while both are current: its creator
 *  is the live `activeCreate` and its form is the newest render. Used by every form control and preview request. */
function isLiveRender(session: CreateSession, token: number): boolean {
  return session === activeCreate && token === renderToken;
}
/** M94.S1 — the `addPlayer()` rejection message from the e2e seam's most recent `add()` call, if any
 *  (`null` after a successful add, or when `add()` hasn't run). Read via the seam's `addRejectReason()`. */
let lastAddReason: string | null = null;
let playerPreviewRevision = 0;
let playerPreview: {
  variants: { canvas: HTMLCanvasElement; label: HTMLElement }[];
  appearanceId: string | undefined;
  /** True only while the form that owns this preview is live (see `isLiveRender`). */
  live: () => boolean;
} | undefined;
type PlayerPreviewPreparation = CokPlayerPreparation & { scope: 'all' | 'primary' };
let playerPreviewLoads = new Map<string, Promise<PlayerPreviewPreparation | null>>();

let playerPreviewCompletion: Promise<CokPlayerAppearance> | undefined;
let playerPreviewFailures = new Set<string>();

/** The preview is paintable only while its owning form is live and its canvases are still on the page. */
function isLivePlayerPreview(): boolean {
  return !!playerPreview && playerPreview.live() && playerPreview.variants.every(({ canvas }) => canvas.isConnected);
}

async function paintPlayerPreview(retry = false): Promise<void> {
  const current = playerPreview;
  // A preview from a superseded or detached form starts nothing and leaves the live preview's revision alone.
  if (current && !current.live()) return;
  const revision = ++playerPreviewRevision;
  playerPreviewCompletion = undefined;
  if (!current) return;
  const isCurrent = () => playerPreview === current && revision === playerPreviewRevision && current.live()
    && current.variants.every(({ canvas }) => canvas.isConnected);
  for (const preview of current.variants) preview.canvas.hidden = true;
  const record = cokPlayerAppearanceForChoice(current.appearanceId);
  if (!record) {
    for (const preview of current.variants) preview.label.textContent = 'No character icon selected';
    return;
  }
  for (const preview of current.variants) preview.label.textContent = 'Loading character icon…';
  const appearanceId = current.appearanceId!;
  let loading = playerPreviewLoads.get(appearanceId);
  if (!loading) {
    loading = prepareCokPlayerAppearance(record).then((prepared) => prepared && { ...prepared, scope: 'all' as const });
    playerPreviewLoads.set(appearanceId, loading);
  }
  const shared = loading;
  const failures = playerPreviewFailures;
  try {
    let prepared: PlayerPreviewPreparation | null;
    try {
      prepared = await shared;
    } catch {
      // The shared strict load may have been started by an earlier render. The primary-only fallback is owned by the
      // render awaiting it: a superseded render starts nothing and drops its rejected entry, so a later live preview
      // re-prepares; the live render recovers with the valid primary preview.
      if (!isCurrent()) {
        if (playerPreviewLoads.get(appearanceId) === shared) playerPreviewLoads.delete(appearanceId);
        return;
      }
      loading = prepareCokPlayerAppearance(record, undefined, 'primary').then((next) => next && { ...next, scope: 'primary' as const });
      playerPreviewLoads.set(appearanceId, loading);
      prepared = await loading;
    }
    if (!isCurrent()) return;
    // The retry fallback is prepared only after a live check immediately before it starts (no await in between).
    if (retry && prepared && isCurrent() && failures.delete(current.appearanceId!)) {
      const scope = prepared.scope;
      loading = prepareCokPlayerAppearance(record, prepared.original, scope)
        .then((next) => next && { ...next, scope });
      playerPreviewLoads.set(current.appearanceId!, loading);
      prepared = await loading;
      if (!isCurrent()) return;
    }
    const paint = (appearance: CokPlayerAppearance | undefined) => {
      if (!isCurrent()) return;
      const mode = readRuntimeGraphicsMode('cok');
      for (const [index, preview] of current.variants.entries()) {
        const presentation = resolveCokPlayerPresentation(appearance, { consumer: 'creator-preview', mode,
          fallback: readRuntimeGraphicsFallback('cok'), playback: 'still', variantIndex: index });
        if (presentation.state !== 'ready') {
          preview.canvas.hidden = true;
          preview.label.textContent = presentation.label;
          continue;
        }
        const art = presentation.art;
        preview.canvas.width = art.width;
        preview.canvas.height = art.height;
        preview.canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(art.pixels), art.width, art.height), 0, 0);
        preview.canvas.hidden = false;
        preview.label.textContent = presentation.label;
      }
    };
    playerPreviewCompletion = prepared?.restyleReady;
    paint(prepared?.original);
    if (prepared) {
      const completed = await prepared.restyleReady;
      if (!isCurrent()) return;
      if (completed.frames.some((frame) => frame.restyleStatus.state === 'failed')) failures.add(current.appearanceId!);
      paint(completed);
    }
  } catch {
    if (!isCurrent()) return;
    for (const preview of current.variants) preview.label.textContent = 'Character icon preview unavailable';
  }
}

// The preview is presentation only. Once the creation view is replaced, a mode event cannot
// repaint it; each new form/selection also invalidates pending loads from the previous form.
window.addEventListener('goldbox:graphics-mode', (event: Event) => {
  const detail = (event as CustomEvent<{ gameId?: string; mode?: string }>).detail;
  if (detail?.gameId === 'cok' && isLivePlayerPreview()) void paintPlayerPreview(detail.mode === 'Restyle');
});
window.addEventListener('goldbox:local-asset-pack', () => {
  if (!isLivePlayerPreview()) return;
  playerPreviewLoads.clear();
  playerPreviewFailures.clear();
  void paintPlayerPreview();
});

function choosePlayerAppearance(id: string | undefined): boolean {
  if (id && !cokPlayerAppearanceChoices().some((choice) => choice.id === id)) return false;
  draft.appearanceId = id || undefined;
  rerender();
  return true;
}

function freshDraft(): Draft {
  const race: DragonlanceRaceId = 'human';
  const sex: Sex = 'male';
  const abilities: AbilityScores = { str: 0, strPct: 0, int: 0, wis: 0, dex: 0, con: 0, cha: 0 };
  for (const k of ABILITIES) abilities[k] = abilityRange(race, k, sex).min;
  return { name: 'Adventurer', race, sex, classes: { fighter: 1 }, abilities, baseAc: 10, shield: false };
}

/** Re-clamp every ability into the current race/sex ranges (called on race/sex change). */
function reclampAbilities(): void {
  for (const k of ABILITIES) draft.abilities[k] = clampAbility(draft.race, draft.sex, k, draft.abilities[k]);
}

// --- rendering --------------------------------------------------------------

function buildForm(root: HTMLElement, session: CreateSession): void {
  playerPreviewRevision++;
  const token = ++renderToken;
  const live = () => isLiveRender(session, token);
  /** Wrap one DOM-triggered action of this render: a no-op unless this session and render are still live. */
  const guard = (action: () => void) => () => { if (live()) action(); };
  root.innerHTML = '';
  const view = el('div', 'create-view');

  const h = el('h2', 'create-title', 'Create a Champion');
  view.appendChild(h);

  // Name
  const nameRow = el('div', 'cc-row');
  nameRow.appendChild(el('label', 'cc-label', 'Name'));
  const nameInput = el('input', 'cc-input') as HTMLInputElement;
  nameInput.value = draft.name;
  nameInput.addEventListener('input', guard(() => { draft.name = nameInput.value; rerender(); }));
  nameRow.appendChild(nameInput);
  view.appendChild(nameRow);

  // Race + Sex
  const raceRow = el('div', 'cc-row');
  raceRow.appendChild(el('label', 'cc-label', 'Race'));
  const raceSel = el('select', 'cc-input') as HTMLSelectElement;
  for (const id of Object.keys(DL_RACES) as DragonlanceRaceId[]) {
    const o = document.createElement('option');
    o.value = id; o.textContent = DL_RACES[id].name;
    raceSel.appendChild(o);
  }
  raceSel.value = draft.race;
  raceSel.addEventListener('change', guard(() => {
    draft.race = raceSel.value as DragonlanceRaceId;
    // Drop classes the new race can't take; ensure at least one.
    const allowed = new Set(classesForRace(draft.race));
    for (const c of Object.keys(draft.classes) as DragonlanceClassId[]) if (!allowed.has(c)) delete draft.classes[c];
    if (Object.keys(draft.classes).length === 0) draft.classes = { [classesForRace(draft.race)[0]]: 1 };
    reclampAbilities();
    draft.deity = undefined;
    rerender();
  }));
  raceRow.appendChild(raceSel);

  raceRow.appendChild(el('label', 'cc-label', 'Sex'));
  const sexSel = el('select', 'cc-input') as HTMLSelectElement;
  for (const s of ['male', 'female'] as Sex[]) {
    const o = document.createElement('option');
    o.value = s; o.textContent = s[0].toUpperCase() + s.slice(1);
    sexSel.appendChild(o);
  }
  sexSel.value = draft.sex;
  sexSel.addEventListener('change', guard(() => { draft.sex = sexSel.value as Sex; reclampAbilities(); rerender(); }));
  raceRow.appendChild(sexSel);
  view.appendChild(raceRow);

  const appearanceRow = el('div', 'cc-row');
  const appearanceLabel = el('label', 'cc-label', 'Character icon');
  appearanceLabel.htmlFor = 'cc-appearance';
  appearanceRow.appendChild(appearanceLabel);
  const appearanceSelect = el('select', 'cc-input') as HTMLSelectElement;
  appearanceSelect.id = 'cc-appearance';
  const noAppearance = document.createElement('option');
  noAppearance.value = '';
  noAppearance.textContent = 'No icon';
  appearanceSelect.appendChild(noAppearance);
  for (const choice of cokPlayerAppearanceChoices()) {
    const option = document.createElement('option');
    option.value = choice.id;
    option.textContent = choice.label;
    appearanceSelect.appendChild(option);
  }
  appearanceSelect.value = draft.appearanceId ?? '';
  appearanceSelect.addEventListener('change', guard(() => {
    if (!choosePlayerAppearance(appearanceSelect.value)) appearanceSelect.value = draft.appearanceId ?? '';
  }));
  appearanceRow.appendChild(appearanceSelect);
  appearanceRow.appendChild(el('span', 'note small muted', 'Original icon colors'));
  view.appendChild(appearanceRow);
  const previewRow = el('div', 'cc-row cc-player-preview');
  const previewVariants = el('div', 'cc-player-preview-variants');
  const variants = [0, 1].map((index) => {
    const variant = el('div', 'cc-player-preview-variant');
    variant.appendChild(el('span', 'cc-player-preview-variant-label', `Variant ${index + 1}`));
    const canvas = el('canvas', 'cc-player-preview-canvas') as HTMLCanvasElement;
    canvas.setAttribute('aria-label', `Variant ${index + 1}`);
    canvas.width = canvas.height = 96;
    canvas.hidden = true;
    const label = el('span', 'note small muted');
    label.setAttribute('role', 'status');
    variant.append(canvas, label);
    previewVariants.appendChild(variant);
    return { canvas, label };
  });
  previewRow.appendChild(previewVariants);
  // Two ownership scopes share this group. The icon-mode buttons are render-bound: a detached group must not write the
  // mode or repaint the preview, so their events stop at the group's capture phase unless this render is live. The
  // folder picker (button, Clear, fallback file input) is creator-session-bound: it is not stopped here, so a pick
  // pending across a same-session rerender still applies, and addLocalAssetPackPicker drops it only once this
  // creator is retired or replaced (`activeCreate !== session`).
  const graphicsControls = cokGraphicsControls(() => activeCreate === session);
  for (const type of ['click', 'change', 'input']) {
    graphicsControls.addEventListener(type, (event) => {
      const onModeButton = event.target instanceof Element && event.target.closest('[data-runtime-graphics-mode]') !== null;
      if (onModeButton && !live()) event.stopPropagation();
    }, true);
  }
  previewRow.appendChild(graphicsControls);
  view.appendChild(previewRow);
  playerPreview = { variants, appearanceId: draft.appearanceId, live };
  void paintPlayerPreview();

  // Classes (filtered by race)
  const classRow = el('div', 'cc-row cc-classes');
  classRow.appendChild(el('label', 'cc-label', 'Classes'));
  const classBox = el('div', 'cc-class-box');
  const multi = draft.race !== 'human';
  for (const c of classesForRace(draft.race)) {
    const wrap = el('label', 'cc-class');
    const cb = el('input', '') as HTMLInputElement;
    cb.type = 'checkbox';
    cb.checked = (draft.classes[c] ?? 0) > 0;
    cb.addEventListener('change', guard(() => {
      if (cb.checked) {
        if (!multi) draft.classes = {}; // single-class races: replace
        draft.classes[c] = draft.classes[c] || 1;
      } else {
        delete draft.classes[c];
      }
      rerender();
    }));
    wrap.appendChild(cb);
    wrap.appendChild(el('span', 'cc-class-name', c));
    const lvl = el('input', 'cc-level') as HTMLInputElement;
    lvl.type = 'number'; lvl.min = '1'; lvl.max = '9'; lvl.value = String(draft.classes[c] ?? 1);
    lvl.disabled = !cb.checked;
    lvl.addEventListener('input', guard(() => { draft.classes[c] = Math.max(1, parseInt(lvl.value, 10) || 1); rerender(); }));
    wrap.appendChild(lvl);
    classBox.appendChild(wrap);
  }
  classRow.appendChild(classBox);
  if (!multi) classRow.appendChild(el('div', 'note small muted', 'Humans are single-class.'));
  view.appendChild(classRow);

  // Abilities
  const abilRow = el('div', 'cc-row cc-abilities');
  abilRow.appendChild(el('label', 'cc-label', 'Abilities'));
  const abilBox = el('div', 'cc-abil-box');
  for (const k of ABILITIES) {
    const r = abilityRange(draft.race, k, draft.sex);
    const cell = el('div', 'cc-abil');
    cell.appendChild(el('span', 'cc-abil-key', k.toUpperCase()));
    const inp = el('input', 'cc-abil-input') as HTMLInputElement;
    inp.type = 'number'; inp.min = String(r.min); inp.max = String(r.max); inp.value = String(draft.abilities[k]);
    inp.addEventListener('input', guard(() => {
      draft.abilities[k] = clampAbility(draft.race, draft.sex, k, parseInt(inp.value, 10) || r.min);
      rerender();
    }));
    cell.appendChild(inp);
    cell.appendChild(el('span', 'cc-abil-range muted', `${r.min}-${r.max}`));
    abilBox.appendChild(cell);
  }
  abilRow.appendChild(abilBox);
  const rollBtn = el('button', 'cc-roll', 'Roll 4d6') as HTMLButtonElement;
  rollBtn.type = 'button';
  rollBtn.addEventListener('click', guard(() => {
    for (const k of ABILITIES) draft.abilities[k] = clampAbility(draft.race, draft.sex, k, rollAbility());
    rerender();
  }));
  abilRow.appendChild(rollBtn);
  view.appendChild(abilRow);

  // Armor + shield
  const acRow = el('div', 'cc-row');
  acRow.appendChild(el('label', 'cc-label', 'Armor'));
  const acSel = el('select', 'cc-input') as HTMLSelectElement;
  for (const a of ARMOR) {
    const o = document.createElement('option');
    o.value = String(a.ac); o.textContent = a.label;
    acSel.appendChild(o);
  }
  acSel.value = String(draft.baseAc);
  acSel.addEventListener('change', guard(() => { draft.baseAc = parseInt(acSel.value, 10); rerender(); }));
  acRow.appendChild(acSel);
  const shieldWrap = el('label', 'cc-class');
  const shieldCb = el('input', '') as HTMLInputElement;
  shieldCb.type = 'checkbox'; shieldCb.checked = draft.shield;
  shieldCb.addEventListener('change', guard(() => { draft.shield = shieldCb.checked; rerender(); }));
  shieldWrap.appendChild(shieldCb);
  shieldWrap.appendChild(el('span', 'cc-class-name', 'Shield (−1)'));
  acRow.appendChild(shieldWrap);
  view.appendChild(acRow);

  // Deity (only if a cleric class is chosen)
  const hasCleric = (draft.classes.cleric ?? 0) > 0;
  if (hasCleric) {
    const deityRow = el('div', 'cc-row');
    deityRow.appendChild(el('label', 'cc-label', 'Deity'));
    const deitySel = el('select', 'cc-input') as HTMLSelectElement;
    const none = document.createElement('option');
    none.value = ''; none.textContent = '— choose —';
    deitySel.appendChild(none);
    for (const d of deitiesForRace(draft.race)) {
      const o = document.createElement('option');
      o.value = d.id; o.textContent = `${d.name} (${d.alignment})`;
      deitySel.appendChild(o);
    }
    deitySel.value = draft.deity ?? '';
    deitySel.addEventListener('change', guard(() => { draft.deity = (deitySel.value || undefined) as DeityId | undefined; rerender(); }));
    deityRow.appendChild(deitySel);
    view.appendChild(deityRow);
  }

  // Robe order (only if a magic-user class is chosen) — governs which of the Three Moons powers
  // the mage; Black Robe (Nuitari) is NPC-only, so only the two player-selectable orders are listed.
  // Leaving it unset is a legal "Rogue mage" (no moon benefits, but no restriction either).
  const hasMagicUser = (draft.classes.magicUser ?? 0) > 0;
  if (hasMagicUser) {
    const robeRow = el('div', 'cc-row');
    robeRow.appendChild(el('label', 'cc-label', 'Robe'));
    const robeSel = el('select', 'cc-input') as HTMLSelectElement;
    const none = document.createElement('option');
    none.value = ''; none.textContent = '— Rogue mage (no moon benefits) —';
    robeSel.appendChild(none);
    for (const m of Object.values(MOONS)) {
      if (!m.playerSelectable) continue;
      const o = document.createElement('option');
      o.value = m.robe; o.textContent = `${m.robe[0].toUpperCase()}${m.robe.slice(1)} Robe (${m.moon})`;
      robeSel.appendChild(o);
    }
    robeSel.value = draft.robe ?? '';
    robeSel.addEventListener('change', guard(() => { draft.robe = (robeSel.value || undefined) as RobeOrder | undefined; rerender(); }));
    robeRow.appendChild(robeSel);
    view.appendChild(robeRow);
  }

  // Validation + preview
  const result = createCharacter(draftToRequest(draft));
  const panel = el('div', 'cc-panel');
  const addBtn = el('button', 'cc-add primary-btn', `Add to party (${partySize()}/6)`) as HTMLButtonElement;
  addBtn.type = 'button';
  if (result.ok) {
    panel.classList.add('ok');
    const s = result.sheet;
    panel.appendChild(el('div', 'cc-ok-title', `✔ ${s.name} — ${describe(s)}`));
    const stats = el('div', 'cc-stats');
    stats.appendChild(el('span', 'cc-stat', `THAC0 ${s.thac0}`));
    stats.appendChild(el('span', 'cc-stat', `AC ${s.ac}`));
    stats.appendChild(el('span', 'cc-stat', `HP ${s.hp}`));
    if (s.knightOrder) stats.appendChild(el('span', 'cc-stat', `Knight of the ${cap(s.knightOrder)}`));
    const sv = s.savingThrows;
    stats.appendChild(el('span', 'cc-stat', `saves ${sv.paralyzePoisonDeath}/${sv.petrifyPolymorph}/${sv.rodStaffWand}/${sv.breath}/${sv.spell}`));
    panel.appendChild(stats);
    for (const [cls, slots] of Object.entries(s.spellSlots)) {
      if (slots && slots.some((n) => n > 0)) {
        panel.appendChild(el('div', 'cc-spells small', `${cls} spells: ${slots.slice(0, firstZero(slots)).join('/')}`));
      }
    }
    for (const w of result.warnings) panel.appendChild(el('div', 'note small muted', w));
    addBtn.disabled = partySize() >= 6;
    let rejectMsg: HTMLElement | null = null;
    // Adds the sheet this render validated (`result.sheet`); a superseded render cannot add its captured sheet.
    addBtn.addEventListener('click', guard(() => {
      // M94.S1 — the same roster-composition gate importParty.ts's save-import already enforces
      // (e.g. "at most 2 rangers"), now also checked for a hand-made character before it joins.
      const gate = addPlayer(currentRoster(), toRosterMember(result.sheet));
      if (!gate.ok) {
        if (!rejectMsg) { rejectMsg = el('div', 'note small error'); panel.appendChild(rejectMsg); }
        rejectMsg.textContent = REASON_MESSAGE[gate.reason];
        return;
      }
      if (addToParty(result.sheet)) { draft = freshDraft(); rerender(); }
    }));
  } else {
    panel.classList.add('bad');
    panel.appendChild(el('div', 'cc-bad-title', `✖ ${result.errors.length} problem(s):`));
    for (const e of result.errors) panel.appendChild(el('div', 'note small error', e));
    addBtn.disabled = true;
  }
  view.appendChild(panel);
  view.appendChild(addBtn);

  root.appendChild(view);
  root.appendChild(buildRoster(live));

  // Menu-origin creation (goal 221): always offer a return to the menu, even with no party. It replaces
  // Begin Adventure for this caller. Unsaved draft is discarded; the party is kept.
  if (session.onReturnToMenu) {
    const ret = el('button', 'cc-return primary-btn', 'Return to Main Menu') as HTMLButtonElement;
    ret.type = 'button';
    ret.addEventListener('click', guard(() => returnToMenu(session)));
    root.appendChild(ret);
  } else if (session.onBegin && partySize() > 0) {
    // A6.3 full-flow hook: once at least one champion is mustered, offer to start the adventure.
    const begin = el('button', 'cc-begin primary-btn', `Begin Adventure ▶ (${partySize()} in party)`) as HTMLButtonElement;
    begin.type = 'button';
    const onBegin = session.onBegin;
    begin.addEventListener('click', guard(() => onBegin()));
    root.appendChild(begin);
  }
}

function describe(s: CharacterSheet): string {
  const cls = Object.entries(s.classes).map(([c, l]) => `${c} ${l}`).join('/');
  return `${DL_RACES[s.race].name} ${cls}`;
}
function cap(s: string): string { return s[0].toUpperCase() + s.slice(1); }
function firstZero(slots: number[]): number {
  let n = slots.length;
  while (n > 0 && slots[n - 1] === 0) n--;
  return Math.max(1, n);
}

function buildRoster(live: () => boolean): HTMLElement {
  const box = el('div', 'cc-roster');
  box.appendChild(el('h2', 'cc-roster-title', `Party (${partySize()}/6)`));
  const party = getParty();
  if (party.length === 0) {
    box.appendChild(el('div', 'note small muted', 'No champions yet — create one above.'));
    return box;
  }
  party.forEach((s, i) => {
    const row = el('div', 'cc-member');
    row.appendChild(el('span', 'cc-member-name', s.name));
    row.appendChild(el('span', 'cc-member-desc muted', describe(s)));
    row.appendChild(el('span', 'cc-member-stat', `THAC0 ${s.thac0} · AC ${s.ac} · HP ${s.hp}`));
    const rm = el('button', 'cc-remove', '✕') as HTMLButtonElement;
    rm.type = 'button';
    rm.title = 'Remove';
    // Removes the captured record only: a stale button, or one whose slot no longer holds its sheet, does nothing.
    rm.addEventListener('click', () => {
      if (!live() || getParty()[i] !== s) return;
      removeFromParty(i);
      rerender();
    });
    row.appendChild(rm);
    box.appendChild(row);
  });
  return box;
}

/**
 * Silently retire the live creator (a newer main menu is taking the screen). Clears `activeCreate` only:
 * no callback runs, no status is written, and the draft is left as it is. Any Return control captured by
 * an earlier session then fails the session check in `returnToMenu` before its callback can be reached.
 */
export function retireCreateSilently(): void {
  activeCreate = undefined;
}

/**
 * Return from creation to the main menu, bound to the creator session whose control was clicked.
 * A superseded session (a newer `startCreate` replaced `activeCreate`, or a newer menu retired it) is a
 * total no-op: it reads and writes no module state and calls nothing. For the live session the captured
 * callback is consumed (cleared) before it is invoked, so a synchronous re-entry or repeated click finds
 * nothing to call. If the callback returns `false` the menu was superseded: this session is retired, and
 * no draft is touched. If it returns `true`, the global draft is reset only while this same session is
 * still active; a menu start that already retired the session (the normal case) leaves the draft alone.
 */
function returnToMenu(session: CreateSession): void {
  if (session !== activeCreate) return;
  const cb = session.onReturnToMenu;
  if (!cb) return;
  session.onReturnToMenu = undefined;
  if (!cb()) {
    if (session === activeCreate) retireCreateSilently();
    return;
  }
  if (session !== activeCreate) return;
  draft = freshDraft();
}

/**
 * Boot the character-creation view. Returns the current party size (for the headless harness).
 * `onBegin`, when supplied (the `?play=cok` flow), adds a "Begin Adventure" button that hands the
 * mustered party off to the dungeon; the standalone `?create=1` view passes nothing.
 * `onReturnToMenuCallback`, when supplied (the main-menu Create flow, goal 221), shows "Return to Main Menu"
 * in place of Begin Adventure, always. It must return `false` when its menu is superseded, which makes
 * that Return a no-op; `true` means the menu was remounted. Each call replaces the previous creator: its
 * Return controls become no-ops, and its callback is never invoked.
 */
export function startCreate(onBegin?: () => void, onReturnToMenuCallback?: () => boolean): number {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  const session: CreateSession = { onBegin, onReturnToMenu: onReturnToMenuCallback };
  activeCreate = session;
  draft = freshDraft();
  playerPreviewLoads = new Map();
  playerPreviewFailures = new Set();
  // A superseded or retired creator never rebuilds the form: the shared rerender is a no-op for it.
  rerender = () => { if (activeCreate === session) buildForm(out, session); };
  rerender();

  const status = document.querySelector('#status') as HTMLElement | null;
  if (status) { status.textContent = 'Create your Champions of Krynn party.'; status.className = 'status'; }

  // Headless e2e seam: drive the draft directly and inspect validation/roster.
  // Ownership: this seam belongs to `session`. A retained copy of any function here is a no-op once `session` is no
  // longer `activeCreate` (replaced or retired): it neither writes the draft nor rerenders the newer form. Mutators
  // return the same neutral value a rejected call gives (`false` for setAppearance/add). Reads still report the
  // newest draft and never mutate anything.
  const owns = () => activeCreate === session;
  (window as unknown as { __create?: Record<string, unknown> }).__create = {
    setName: (v: string) => { if (!owns()) return; draft.name = v; rerender(); },
    setRace: (v: DragonlanceRaceId) => { if (!owns()) return; draft.race = v; const allowed = new Set(classesForRace(v)); for (const c of Object.keys(draft.classes) as DragonlanceClassId[]) if (!allowed.has(c)) delete draft.classes[c]; if (Object.keys(draft.classes).length === 0) draft.classes = { [classesForRace(v)[0]]: 1 }; reclampAbilities(); draft.deity = undefined; rerender(); },
    setSex: (v: Sex) => { if (!owns()) return; draft.sex = v; reclampAbilities(); rerender(); },
    setClass: (c: DragonlanceClassId, level: number) => { if (!owns()) return; if (level > 0) draft.classes[c] = level; else delete draft.classes[c]; rerender(); },
    onlyClass: (c: DragonlanceClassId, level: number) => { if (!owns()) return; draft.classes = { [c]: level }; rerender(); },
    setAbility: (k: (typeof ABILITIES)[number], v: number) => { if (!owns()) return; draft.abilities[k] = v; rerender(); },
    setAbilities: (a: Partial<AbilityScores>) => { if (!owns()) return; Object.assign(draft.abilities, a); rerender(); },
    setDeity: (d: DeityId | undefined) => { if (!owns()) return; draft.deity = d; rerender(); },
    setRobe: (r: RobeOrder | undefined) => { if (!owns()) return; draft.robe = r; rerender(); },
    setArmor: (ac: number, shield = false) => { if (!owns()) return; draft.baseAc = ac; draft.shield = shield; rerender(); },
    setAppearance: (id: string | undefined) => (owns() ? choosePlayerAppearance(id) : false),
    appearanceId: () => draft.appearanceId ?? null,
    appearanceRequest: () => draftToRequest(draft).appearance,
    playerAppearanceCompletion: () => playerPreviewCompletion,
    validate: () => createCharacter(draftToRequest(draft)),
    add: () => {
      if (!owns()) return false;
      const r = createCharacter(draftToRequest(draft));
      if (!r.ok) { lastAddReason = null; return false; }
      const gate = addPlayer(currentRoster(), toRosterMember(r.sheet));
      if (!gate.ok) { lastAddReason = REASON_MESSAGE[gate.reason]; return false; }
      lastAddReason = null;
      if (addToParty(r.sheet)) { draft = freshDraft(); rerender(); return true; }
      return false;
    },
    addRejectReason: () => lastAddReason,
    roster: () => getParty().map((s) => s.name),
    partySize: () => partySize(),
  };
  (window as unknown as { __rendered: number }).__rendered = 1;
  return partySize();
}
