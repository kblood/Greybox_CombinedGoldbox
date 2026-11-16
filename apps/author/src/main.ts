/**
 * Greybox Author — map editor (M5.S3). A thin client over `@goldbox/engine`'s pure `ModuleMap`
 * authoring functions (`module/editor.ts`) and the real `loadModule`/`Explorer` play path
 * (ADR-0006: an authored map is a real, loadable `ModuleMap` from the first click — there is no
 * separate authoring runtime). Edit mode and playtest mode share one renderer, `composeAutomapPanel`
 * (from Phase D1's Automap panel): edit mode feeds it an "always visited" read-model so the whole
 * grid is always shown; playtest feeds it a real `Automap` that fills in with fog-of-war as the
 * party walks, exactly like the in-game automap does.
 */
import {
  createEmptyModuleMap,
  setWall,
  setFloor,
  setZone,
  placeEntry,
  setCellEvent,
  upsertEvent,
  removeEvent,
  loadModule,
  resolveEntryPoint,
  ModuleEventRuntime,
  Explorer,
  Automap,
  composeAutomapPanel,
  automapGridLayout,
  makeEgaPalette,
  DOS_EGA,
  ADND1E_ID,
  createEmptyModuleDatabase,
  upsertMonster,
  removeMonster,
  upsertItem,
  removeItem,
  upsertSpell,
  removeSpell,
  upsertClass,
  removeClass,
  upsertRace,
  removeRace,
  serializeModulePackage,
  deserializeModulePackage,
  validateModulePackage,
  createRulesetRegistry,
  defaultRulesets,
  createDataRuleset,
  indexedToRGBA,
  type ModuleMap,
  type ModulePackage,
  type ModuleSourceWarning,
  type ModuleEvent,
  type ModuleEventType,
  type ModuleDatabase,
  type CombatEventBody,
  type LoadedModule,
  type GiveTreasureEventEffect,
  type ModuleEventRuntimeResult,
  type ModuleValidationDiagnostic,
  type ModuleValidationReport,
  type EclCombatOutcome,
  type Direction,
  type Palette,
  type StepResult,
  type RulesetRegistry,
  type RulesetTableData,
  type ClassId,
  type FrameSet,
  type IndexedImage,
} from '@goldbox/engine';
import { attachScreenSurface } from '@goldbox/ui-kit';

const EGA_PALETTE: Palette = makeEgaPalette();
// M11.S2: a named-module list replaces the old single anonymous map+db slot (`greybox.author.map`
// / `greybox.author.db`, both retired — no migration shim, this is a local dev tool with no real
// users yet). Each saved design is a whole serialized `ModulePackage` (M11.S1's serializer) keyed
// by name, so Save/Load/Export/Import all go through the exact same real round-trip.
const STORE_KEY_INDEX = 'greybox.author.modules';
const STORE_KEY_LAST = 'greybox.author.lastModule';
function moduleStoreKey(name: string): string {
  return `greybox.author.module.${name}`;
}

type Tool = 'wall-north' | 'wall-east' | 'wall-south' | 'wall-west' | 'floor' | 'zone' | 'entry' | 'event';
type DbCategory = 'monsters' | 'items' | 'spells' | 'classes' | 'races';

const ALWAYS_VISIBLE = { isVisited: () => true, getNote: () => null };

/** What the shared module runtime is waiting on. Combat retains its source event id so the UI can
 * resolve authored monsters against the database (M5.S5). */
type EventAwaiting = { kind: 'choice' | 'combat'; eventId: number };

interface PlaytestState {
  automap: Automap;
  explorer: Explorer;
  /** Kept around (not just discarded after `startPlaytest`) so a stepped-on `MapCell.event` can be
   * fired through the real `EclVm` chain — M5.S4. */
  loaded: LoadedModule;
  eventRuntime: ModuleEventRuntime;
  /** Accumulated PRINT text from the event chain currently on screen (cleared on the next fire). */
  eventLog: string[];
  awaiting: EventAwaiting | null;
}

interface AuthorState {
  /** The named module's own name (M11.S2) — the `id`/`title` `buildPackage()` writes into the
   * exported/saved `ModulePackage`; independent of `map.name` (a module may grow multiple maps
   * later, though the editor only edits one at a time today). */
  moduleName: string;
  map: ModuleMap;
  tool: Tool;
  toolValue: number;
  entryId: number;
  entryFacing: Direction;
  playtest: PlaytestState | null;
  lastStep: StepResult | null;
  /** Authored monsters/items/spells/classes/races (M5.S5) — shared by this module's map, and reset
   * when New starts a distinct module so prior imported data cannot leak into its export. */
  db: ModuleDatabase;
  /** Selected ruleset id — a built-in id (`defaultRulesets().ids()`) or `customRuleset.id`. */
  ruleset: string;
  /** At most one authored custom ruleset per session (M5.S5's "author your own ruleset" path). */
  customRuleset: RulesetTableData | null;
  /** Imported art (M5.S2b/M11.S4). There is no in-app art importer; Import can populate it, while
   * New clears it so a fresh copyright-clean module never inherits an earlier package's assets. */
  graphicSets: FrameSet[] | undefined;
  /** Portable source limitations remain visible across a one-map import/export round trip. */
  sourceWarnings: ModuleSourceWarning[] | undefined;
  artIndex: number;
}

let state: AuthorState = {
  moduleName: 'Untitled',
  map: createEmptyModuleMap('Untitled', 6, 6),
  tool: 'wall-north',
  toolValue: 1,
  entryId: 0,
  entryFacing: 'north',
  playtest: null,
  lastStep: null,
  db: createEmptyModuleDatabase(),
  ruleset: ADND1E_ID,
  customRuleset: null,
  graphicSets: undefined,
  sourceWarnings: undefined,
  artIndex: 0,
};

const canvas = document.querySelector('#gb-canvas') as HTMLCanvasElement;
const surface = attachScreenSurface(canvas, DOS_EGA);
const statusEl = document.querySelector('#status') as HTMLElement;
const editTools = document.querySelector('#edit-tools') as HTMLElement;
const playtestTools = document.querySelector('#playtest-tools') as HTMLElement;
const entryRow = document.querySelector('#entry-row') as HTMLElement;
const eventJsonInput = document.querySelector('#event-json') as HTMLTextAreaElement;
const eventListEl = document.querySelector('#event-list') as HTMLElement;
const eventFireTools = document.querySelector('#event-fire-tools') as HTMLElement;
const eventFireText = document.querySelector('#event-fire-text') as HTMLElement;
const eventFireChoice = document.querySelector('#event-fire-choice') as HTMLElement;
const eventFireCombat = document.querySelector('#event-fire-combat') as HTMLElement;
const eventAnswerInput = document.querySelector('#ev-answer') as HTMLInputElement;
const eventFireMonsters = document.querySelector('#event-fire-monsters') as HTMLElement;
const dbCategorySelect = document.querySelector('#db-category') as HTMLSelectElement;
const dbJsonInput = document.querySelector('#db-json') as HTMLTextAreaElement;
const dbListEl = document.querySelector('#db-list') as HTMLElement;
const rulesetSelect = document.querySelector('#ruleset-select') as HTMLSelectElement;
const rulesetJsonInput = document.querySelector('#ruleset-json') as HTMLTextAreaElement;
const moduleNameInput = document.querySelector('#module-name') as HTMLInputElement;
const mapNameInput = document.querySelector('#map-name') as HTMLInputElement;
const moduleSelect = document.querySelector('#module-select') as HTMLSelectElement;
const importFileInput = document.querySelector('#import-file') as HTMLInputElement;
const validateCompleteCampaignInput = document.querySelector('#validate-complete-campaign') as HTMLInputElement;
const validationSummaryEl = document.querySelector('#validation-summary') as HTMLElement;
const validationFindingsEl = document.querySelector('#validation-findings') as HTMLUListElement;
const artPanel = document.querySelector('#art-panel') as HTMLElement;
const artLabel = document.querySelector('#art-label') as HTMLElement;
const artCanvas = document.querySelector('#art-canvas') as HTMLCanvasElement;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function renderValidationReport(report: ModuleValidationReport | null): void {
  validationFindingsEl.replaceChildren();
  if (!report) {
    validationSummaryEl.textContent = 'Not validated since the last edit.';
    delete validationSummaryEl.dataset.status;
    delete validationSummaryEl.dataset.errors;
    delete validationSummaryEl.dataset.warnings;
    return;
  }
  validationSummaryEl.dataset.status = report.ok ? 'valid' : 'invalid';
  validationSummaryEl.dataset.errors = String(report.errors.length);
  validationSummaryEl.dataset.warnings = String(report.warnings.length);
  validationSummaryEl.textContent =
    `Validation: ${report.errors.length} error${report.errors.length === 1 ? '' : 's'}, ` +
    `${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'}.`;
  for (const finding of report.diagnostics) {
    const li = document.createElement('li');
    li.dataset.code = finding.code;
    li.dataset.severity = finding.severity;
    li.dataset.path = finding.path;
    li.textContent = `[${finding.code}] ${finding.path}: ${finding.message}`;
    validationFindingsEl.appendChild(li);
  }
}

function markValidationStale(): void {
  renderValidationReport(null);
}

function appendAuthorDiagnostic(
  report: ModuleValidationReport,
  finding: ModuleValidationDiagnostic,
): ModuleValidationReport {
  const diagnostics = [finding, ...report.diagnostics];
  const errors = finding.severity === 'error' ? [finding, ...report.errors] : report.errors;
  const warnings = finding.severity === 'warning' ? [finding, ...report.warnings] : report.warnings;
  return { ok: errors.length === 0, diagnostics, errors, warnings };
}

/** Validate against the engine contract plus the editor's honest one-map import boundary. */
function validateAuthorPackage(pkg: ModulePackage): ModuleValidationReport {
  let report = validateModulePackage(pkg, {
    registry: buildRegistry(),
    ...(validateCompleteCampaignInput.checked ? { completeCampaign: true } : {}),
  });
  if (pkg.maps.length !== 1) {
    report = appendAuthorDiagnostic(report, {
      code: 'author.map_count',
      severity: 'error',
      path: '$.maps',
      message: `Greybox Author currently edits exactly one map; this package contains ${pkg.maps.length}.`,
    });
  }
  return report;
}

function validateForAction(pkg: ModulePackage, action: string): ModuleValidationReport {
  const report = validateAuthorPackage(pkg);
  renderValidationReport(report);
  if (!report.ok) {
    setStatus(`${action} blocked by ${report.errors.length} validation error${report.errors.length === 1 ? '' : 's'}.`);
  } else if (report.warnings.length > 0) {
    setStatus(`${action} validation passed with ${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'}.`);
  } else {
    setStatus(`${action} validation passed.`);
  }
  return report;
}

moduleNameInput.addEventListener('input', () => {
  state.moduleName = moduleNameInput.value;
  markValidationStale();
});
mapNameInput.addEventListener('input', () => {
  state.map = { ...state.map, name: mapNameInput.value };
  markValidationStale();
});
mapNameInput.addEventListener('change', draw);
validateCompleteCampaignInput.addEventListener('change', markValidationStale);

// ── Imported art panel (M11.S2b `graphicSets` carried through M11.S1's Export/Import — M11.S4) ──
// There is no in-app art importer (no folder-picker in this app); `state.graphicSets` only ever
// arrives via Import of a `.gbmod` that already embeds it (`applyImportedPackage`). Every decoded
// frame across every set is shown as a browsable prev/next gallery, painted through the same
// `indexedToRGBA`-then-`putImageData` pattern `apps/web`'s DQK VGA art preview established —
// there's no per-cell mapping from a `MapCell` to a specific picture yet, so this is a plain
// gallery, not placed on the map.
interface ModuleArtFrame { setName: string; frameId: number; image: IndexedImage }

function flattenArtFrames(sets: FrameSet[] | undefined): ModuleArtFrame[] {
  const out: ModuleArtFrame[] = [];
  for (const set of sets ?? []) {
    for (const [frameId, image] of [...set.frames].sort((a, b) => a[0] - b[0])) {
      if (image.width > 0 && image.height > 0) out.push({ setName: set.name, frameId, image });
    }
  }
  return out;
}

function renderArtPanel(): void {
  const frames = flattenArtFrames(state.graphicSets);
  if (frames.length === 0) {
    artPanel.style.display = 'none';
    return;
  }
  artPanel.style.display = 'block';
  state.artIndex = ((state.artIndex % frames.length) + frames.length) % frames.length;
  const frame = frames[state.artIndex];
  artCanvas.width = frame.image.width;
  artCanvas.height = frame.image.height;
  const ctx = artCanvas.getContext('2d');
  if (ctx) {
    const rgba = indexedToRGBA(frame.image, frame.image.palette);
    const imgData = ctx.createImageData(frame.image.width, frame.image.height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);
  }
  artLabel.textContent =
    `${frame.setName} frame ${frame.frameId} — art ${state.artIndex + 1}/${frames.length} ` +
    `(${frame.image.width}×${frame.image.height})`;
}

document.querySelector('#art-prev')!.addEventListener('click', () => { state.artIndex--; renderArtPanel(); });
document.querySelector('#art-next')!.addEventListener('click', () => { state.artIndex++; renderArtPanel(); });

function toolLabel(t: Tool): string {
  switch (t) {
    case 'wall-north': return 'wall N';
    case 'wall-east': return 'wall E';
    case 'wall-south': return 'wall S';
    case 'wall-west': return 'wall W';
    case 'floor': return 'floor tile';
    case 'zone': return 'zone';
    case 'entry': return 'entry point';
    case 'event': return 'event link';
  }
}

// ── Event authoring (M5.S4) ─────────────────────────────────────────────────────────────────
// Which compiled shape (`eventCompiler.ts`) each ModuleEventType uses — a UI-only
// grouping (for template prefill) mirroring the same 35-type list `types.ts` documents; the real
// compile-time dispatch lives in the engine, not here.
const TEXT_EVENT_TYPES = new Set<ModuleEventType>([
  'message', 'damage', 'trainingHall', 'tavern', 'shop', 'temple', 'guidedTour',
  'addNpc', 'npcSays', 'sounds', 'smallTown', 'vault', 'combatTreasure', 'gainExperience',
  'passTime', 'camp', 'removeNpc', 'tavernTales', 'specialItems',
]);
const CHOICE_EVENT_TYPES = new Set<ModuleEventType>([
  'stairs', 'questionButton', 'transferModule', 'whoTries', 'whoPays', 'enterPassword',
  'questionList', 'teleporter', 'questStage', 'questionYesNo', 'encounter',
]);
const COMBAT_EVENT_TYPES = new Set<ModuleEventType>(['combat', 'pickOneCombat']);

function templateBodyFor(type: ModuleEventType): unknown {
  if (type === 'giveTreasure') {
    return { platinum: 100, gems: 0, jewelry: 0, items: [], itemsIdentified: false };
  }
  if (TEXT_EVENT_TYPES.has(type)) return { text: 'SOME TEXT' };
  if (CHOICE_EVENT_TYPES.has(type)) return { prompt: 'A QUESTION?', options: [{ label: 'Yes', chainTo: 0 }, { label: 'No', chainTo: 0 }] };
  if (COMBAT_EVENT_TYPES.has(type)) return { monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }], onVictory: 0, onDefeat: 0, onFlee: 0 };
  if (type === 'utilities') return { op: 'store', variable: 1, value: 1 };
  return { chainTo: 0 }; // 'chain'
}

function renderEventList(): void {
  eventListEl.replaceChildren();
  for (const ev of state.map.events) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.textContent = `#${ev.id} ${ev.type}`;
    label.style.flex = '1';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => { eventJsonInput.value = JSON.stringify(ev, null, 2); });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      state.map = removeEvent(state.map, ev.id);
      markValidationStale();
      renderEventList();
      setStatus(`Deleted event #${ev.id}.`);
    });
    row.append(label, editBtn, delBtn);
    eventListEl.appendChild(row);
  }
}

function isModuleEventShape(v: unknown): v is ModuleEvent {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === 'number' && typeof e.type === 'string' && typeof e.body === 'object' && e.body !== null;
}

const eventTemplateSelect = document.querySelector('#event-template') as HTMLSelectElement;
eventTemplateSelect.addEventListener('change', () => {
  const type = eventTemplateSelect.value as ModuleEventType;
  if (!type) return;
  const nextId = state.map.events.length > 0 ? Math.max(...state.map.events.map((e) => e.id)) + 1 : 1;
  eventJsonInput.value = JSON.stringify({ id: nextId, type, body: templateBodyFor(type) }, null, 2);
  eventTemplateSelect.value = '';
});

document.querySelector('#btn-event-upsert')!.addEventListener('click', () => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventJsonInput.value);
  } catch (err) {
    setStatus(`Event JSON parse failed: ${(err as Error).message}`);
    return;
  }
  if (!isModuleEventShape(parsed)) {
    setStatus('Event JSON must have numeric "id", string "type", and object "body".');
    return;
  }
  try {
    state.map = upsertEvent(state.map, parsed);
    markValidationStale();
    renderEventList();
    setStatus(`Saved event #${parsed.id} (${parsed.type}).`);
  } catch (err) {
    setStatus(`Event rejected: ${(err as Error).message}`);
  }
});

// ── Database authoring (M5.S5) ──────────────────────────────────────────────────────────────
// One generic JSON editor reused across all 5 categories (same tactic the event editor uses) —
// a category selector picks which `ModuleDatabase` list + upsert/remove pair is in play.

function dbTemplateFor(cat: DbCategory): unknown {
  switch (cat) {
    case 'monsters': return { id: 1, name: 'GOBLIN', hitPoints: 7, armorClass: 6, thac0: 19, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15 };
    case 'items': return { id: 200, name: 'Custom Sword', kind: 'weapon', damage: { count: 1, sides: 8, bonus: 0 }, weightTenths: 40 };
    case 'spells': return { id: 'm1-custom-bolt', name: 'Custom Bolt', class: 'magicUser', level: 1, effect: { kind: 'damage', target: 'enemy', dice: { count: 1, sides: 6, bonus: 0 }, campCastable: false } };
    case 'classes': return { id: 'warder', name: 'Warder', hitDie: 8, primeRequisite: ['str'] };
    case 'races': return { id: 'kobold', name: 'Kobold', minAbilities: { con: 9 } };
  }
}

function dbCategoryList(cat: DbCategory): { id: number | string; name?: string }[] {
  switch (cat) {
    case 'monsters': return state.db.monsters;
    case 'items': return state.db.items;
    case 'spells': return state.db.spells;
    case 'classes': return state.db.classes;
    case 'races': return state.db.races;
  }
}

function upsertDbRecord(cat: DbCategory, rec: unknown): void {
  switch (cat) {
    case 'monsters': state.db = upsertMonster(state.db, rec as never); break;
    case 'items': state.db = upsertItem(state.db, rec as never); break;
    case 'spells': state.db = upsertSpell(state.db, rec as never); break;
    case 'classes': state.db = upsertClass(state.db, rec as never); break;
    case 'races': state.db = upsertRace(state.db, rec as never); break;
  }
}

function deleteDbRecord(cat: DbCategory, id: number | string): void {
  switch (cat) {
    case 'monsters': state.db = removeMonster(state.db, id as number); break;
    case 'items': state.db = removeItem(state.db, id as number); break;
    case 'spells': state.db = removeSpell(state.db, id as string); break;
    case 'classes': state.db = removeClass(state.db, id as string); break;
    case 'races': state.db = removeRace(state.db, id as string); break;
  }
  markValidationStale();
  renderDbList();
}

function renderDbList(): void {
  const cat = dbCategorySelect.value as DbCategory;
  dbListEl.replaceChildren();
  for (const rec of dbCategoryList(cat)) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.textContent = `#${rec.id}${rec.name ? ` ${rec.name}` : ''}`;
    label.style.flex = '1';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => { dbJsonInput.value = JSON.stringify(rec, null, 2); });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => { deleteDbRecord(cat, rec.id); setStatus(`Deleted ${cat} #${rec.id}.`); });
    row.append(label, editBtn, delBtn);
    dbListEl.appendChild(row);
  }
}

dbCategorySelect.addEventListener('change', renderDbList);

document.querySelector('#btn-db-template')!.addEventListener('click', () => {
  dbJsonInput.value = JSON.stringify(dbTemplateFor(dbCategorySelect.value as DbCategory), null, 2);
});

document.querySelector('#btn-db-upsert')!.addEventListener('click', () => {
  const cat = dbCategorySelect.value as DbCategory;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dbJsonInput.value);
  } catch (err) {
    setStatus(`Database JSON parse failed: ${(err as Error).message}`);
    return;
  }
  try {
    upsertDbRecord(cat, parsed);
    markValidationStale();
    renderDbList();
    setStatus(`Saved ${cat} record.`);
  } catch (err) {
    setStatus(`Database record rejected: ${(err as Error).message}`);
  }
});

// ── Ruleset picker + custom ruleset (M5.S5) ─────────────────────────────────────────────────

function rulesetIds(): string[] {
  const builtIn = defaultRulesets().ids();
  return state.customRuleset ? [...builtIn, state.customRuleset.id] : builtIn;
}

function renderRulesetOptions(): void {
  rulesetSelect.replaceChildren(
    ...rulesetIds().map((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      return opt;
    }),
  );
  rulesetSelect.value = state.ruleset;
}

rulesetSelect.addEventListener('change', () => {
  state.ruleset = rulesetSelect.value;
  markValidationStale();
});

document.querySelector('#btn-ruleset-register')!.addEventListener('click', () => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rulesetJsonInput.value);
  } catch (err) {
    setStatus(`Ruleset JSON parse failed: ${(err as Error).message}`);
    return;
  }
  const data = parsed as RulesetTableData;
  if (!data.id || !data.name) {
    setStatus('Ruleset JSON needs "id" and "name".');
    return;
  }
  try {
    createDataRuleset(data); // validates the shape before it's accepted
  } catch (err) {
    setStatus(`Ruleset rejected: ${(err as Error).message}`);
    return;
  }
  state.customRuleset = data;
  state.ruleset = data.id;
  markValidationStale();
  renderRulesetOptions();
  setStatus(`Registered custom ruleset "${data.id}".`);
});

/** The registry `startPlaytest` loads against — the built-ins plus this session's custom ruleset,
 * if one was registered. Built fresh per playtest so an edited custom ruleset JSON takes effect
 * on the next Playtest click without a page reload. */
function buildRegistry(): RulesetRegistry {
  const registry = createRulesetRegistry();
  const defaults = defaultRulesets();
  for (const id of defaults.ids()) registry.register(defaults.get(id)!);
  if (state.customRuleset) registry.register(createDataRuleset(state.customRuleset));
  return registry;
}

// ── Playtest event firing (M5.S4) ───────────────────────────────────────────────────────────

function formatTreasureEffect(effect: GiveTreasureEventEffect): string {
  const items = effect.items.length > 0
    ? effect.items.map((id) => `Item #${id}`).join(', ')
    : 'none';
  return `Treasure received: ${effect.platinum} platinum, ${effect.gems} gems, ` +
    `${effect.jewelry} jewelry; items: ${items}.`;
}

/** Keep prints and source-less authored reward receipts in their exact compiled chain order. */
function foldEventEffects(log: string[], result: ModuleEventRuntimeResult): void {
  for (const effect of result.effects) {
    if (effect.type === 'print' && effect.text !== undefined) log.push(effect.text);
    else if (effect.type === 'giveTreasure') log.push(formatTreasureEffect(effect));
  }
}

/** Render a high-level stop after the shared engine runtime has handled chains/state/repeats. */
function applyEventResult(result: ModuleEventRuntimeResult): void {
  const pt = state.playtest;
  if (!pt) return;
  foldEventEffects(pt.eventLog, result);
  pt.awaiting = result.status === 'awaiting-input'
    ? { kind: 'choice', eventId: result.eventId }
    : result.status === 'combat'
      ? { kind: 'combat', eventId: result.eventId }
      : null;
  if (result.status === 'halted' && result.haltReason) pt.eventLog.push(`[event halted: ${result.haltReason}]`);
  draw();
}

function fireEvent(eventId: number): void {
  const pt = state.playtest;
  if (!pt) return;
  pt.eventLog = [];
  pt.awaiting = null;
  try {
    applyEventResult(pt.eventRuntime.fire(eventId));
  } catch (err) {
    pt.eventLog = [`[event error: ${(err as Error).message}]`];
    draw();
  }
}

function answerChoice(n: number): void {
  const pt = state.playtest;
  if (!pt?.awaiting || pt.awaiting.kind !== 'choice') return;
  try {
    applyEventResult(pt.eventRuntime.resumeChoice(n));
  } catch (err) {
    pt.eventLog.push(`[event answer error: ${(err as Error).message}]`);
    pt.awaiting = null;
    draw();
  }
}

function answerCombat(outcome: EclCombatOutcome): void {
  const pt = state.playtest;
  if (!pt?.awaiting || pt.awaiting.kind !== 'combat') return;
  try {
    applyEventResult(pt.eventRuntime.resumeCombat(outcome));
  } catch (err) {
    pt.eventLog.push(`[event combat error: ${(err as Error).message}]`);
    pt.awaiting = null;
    draw();
  }
}

/** The paused combat event's authored monster list, resolved against the database (falls back to
 * `Monster #id` for an id with no authored record — harmless, matches an event authored before
 * the referenced monster existed). Empty outside a `combat` pause. */
function combatMonsterSummaries(): { monsterId: number; count: number; name: string }[] {
  const awaiting = state.playtest?.awaiting;
  if (!awaiting || awaiting.kind !== 'combat') return [];
  const eventId = awaiting.eventId;
  const ev = state.map.events.find((e) => e.id === eventId);
  const body = ev?.body as CombatEventBody | undefined;
  if (!body) return [];
  return body.monsters.map((m) => ({
    monsterId: m.monsterId,
    count: m.count,
    name: state.db.monsters.find((am) => am.id === m.monsterId)?.name ?? `Monster #${m.monsterId}`,
  }));
}

document.querySelector('#ev-answer-btn')!.addEventListener('click', () => answerChoice(Math.max(1, Number(eventAnswerInput.value) || 1)));
document.querySelector('#ev-victory')!.addEventListener('click', () => answerCombat('victory'));
document.querySelector('#ev-defeat')!.addEventListener('click', () => answerCombat('defeat'));
document.querySelector('#ev-flee')!.addEventListener('click', () => answerCombat('flee'));

function syncEventFireUI(): void {
  const pt = state.playtest;
  if (!pt || (pt.eventLog.length === 0 && !pt.awaiting)) {
    eventFireTools.style.display = 'none';
    return;
  }
  eventFireTools.style.display = 'block';
  eventFireText.textContent = pt.eventLog.join('\n');
  eventFireChoice.style.display = pt.awaiting?.kind === 'choice' ? 'flex' : 'none';
  eventFireCombat.style.display = pt.awaiting?.kind === 'combat' ? 'flex' : 'none';
  eventFireMonsters.textContent = pt.awaiting?.kind === 'combat'
    ? combatMonsterSummaries().map((m) => `${m.count}x ${m.name}`).join(', ')
    : '';
}

function draw(): void {
  renderEventList();
  renderDbList();
  if (state.playtest) {
    const pose = state.playtest.explorer.getPose();
    const fb = composeAutomapPanel({
      title: `Playtest · ${state.map.name}`,
      map: state.map,
      automap: state.playtest.automap,
      pose,
      status: state.lastStep && !state.lastStep.moved ? `Blocked (${state.lastStep.blocked ?? 'wall'})` : `At (${pose.x},${pose.y}) facing ${pose.facing}`,
    });
    surface.paint(fb, EGA_PALETTE);
    syncEventFireUI();
  } else {
    const entry = state.map.entries.find((e) => e.id === state.entryId) ?? null;
    const fb = composeAutomapPanel({
      title: `Edit · ${state.map.name}`,
      map: state.map,
      automap: ALWAYS_VISIBLE,
      pose: entry,
      status: `${state.map.width}x${state.map.height} · tool: ${toolLabel(state.tool)} = ${state.toolValue}`,
    });
    surface.paint(fb, EGA_PALETTE);
  }
  (window as unknown as { __rendered: number }).__rendered = state.map.cells.length;
}

// ── Editing ──────────────────────────────────────────────────────────────────────────────────

function applyTool(x: number, y: number, clear: boolean): void {
  const value = clear ? 0 : state.toolValue;
  switch (state.tool) {
    case 'wall-north': state.map = setWall(state.map, x, y, 'north', value); break;
    case 'wall-east': state.map = setWall(state.map, x, y, 'east', value); break;
    case 'wall-south': state.map = setWall(state.map, x, y, 'south', value); break;
    case 'wall-west': state.map = setWall(state.map, x, y, 'west', value); break;
    case 'floor': state.map = setFloor(state.map, x, y, value); break;
    case 'zone': state.map = setZone(state.map, x, y, value); break;
    case 'entry': state.map = placeEntry(state.map, state.entryId, x, y, state.entryFacing); break;
    case 'event': state.map = setCellEvent(state.map, x, y, value); break;
  }
  markValidationStale();
  draw();
}

function cellAtCanvasPixel(px: number, py: number): { x: number; y: number } | null {
  const { cellPx, originX, originY } = automapGridLayout(state.map.width, state.map.height);
  if (cellPx <= 0) return null;
  const x = Math.floor((px - originX) / cellPx);
  const y = Math.floor((py - originY) / cellPx);
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return null;
  return { x, y };
}

function pixelFromEvent(ev: MouseEvent): { px: number; py: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    px: Math.floor(((ev.clientX - rect.left) / rect.width) * 320),
    py: Math.floor(((ev.clientY - rect.top) / rect.height) * 200),
  };
}

canvas.addEventListener('click', (ev) => {
  if (state.playtest) return;
  const { px, py } = pixelFromEvent(ev);
  const cell = cellAtCanvasPixel(px, py);
  if (cell) applyTool(cell.x, cell.y, false);
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (state.playtest) return;
  const { px, py } = pixelFromEvent(ev);
  const cell = cellAtCanvasPixel(px, py);
  if (cell && state.tool.startsWith('wall-')) applyTool(cell.x, cell.y, true);
});

// ── Toolbar ──────────────────────────────────────────────────────────────────────────────────

function selectTool(tool: Tool): void {
  state.tool = tool;
  document.querySelectorAll('.tool-btn').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tool === tool));
  entryRow.style.display = tool === 'entry' ? 'flex' : 'none';
  draw();
}

document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectTool((btn as HTMLElement).dataset.tool as Tool));
});

const toolValueInput = document.querySelector('#tool-value') as HTMLInputElement;
toolValueInput.addEventListener('input', () => { state.toolValue = Math.max(0, Math.min(255, Number(toolValueInput.value) || 0)); });

const entryFacingSelect = document.querySelector('#entry-facing') as HTMLSelectElement;
entryFacingSelect.addEventListener('change', () => { state.entryFacing = entryFacingSelect.value as Direction; });

const entryIdInput = document.querySelector('#entry-id') as HTMLInputElement;
entryIdInput.addEventListener('input', () => {
  state.entryId = Math.max(0, Number(entryIdInput.value) || 0);
  markValidationStale();
});

function createNewModule(w: number, h: number): void {
  stopPlaytest();
  state.map = createEmptyModuleMap('Untitled', w, h);
  state.moduleName = 'Untitled';
  state.entryId = 0;
  state.entryFacing = 'north';
  state.toolValue = 1;
  state.db = createEmptyModuleDatabase();
  state.ruleset = ADND1E_ID;
  state.customRuleset = null;
  state.graphicSets = undefined;
  state.sourceWarnings = undefined;
  state.artIndex = 0;
  moduleNameInput.value = 'Untitled';
  mapNameInput.value = 'Untitled';
  entryIdInput.value = '0';
  entryFacingSelect.value = 'north';
  toolValueInput.value = '1';
  eventJsonInput.value = '';
  dbJsonInput.value = '';
  rulesetJsonInput.value = '';
  renderRulesetOptions();
  renderArtPanel();
  markValidationStale();
  setStatus(`New ${w}x${h} map.`);
  draw();
}

document.querySelector('#btn-new')!.addEventListener('click', () => {
  const w = Math.max(1, Math.min(24, Number((document.querySelector('#new-w') as HTMLInputElement).value) || 6));
  const h = Math.max(1, Math.min(24, Number((document.querySelector('#new-h') as HTMLInputElement).value) || 6));
  createNewModule(w, h);
});

// ── Named modules: save / load / export / import (M11.S2) ──────────────────────────────────────
// A design is a whole `ModulePackage` (map + db + ruleset id + entry), serialized with M11.S1's
// `serializeModulePackage` and keyed by name — Save/Load/Export/Import all share this one path,
// so "export then re-import" and "save then reload the page" are the exact same round-trip.

function buildPackage(): ModulePackage {
  const pkg: ModulePackage = {
    schema: 1,
    id: slugify(state.moduleName),
    title: state.moduleName,
    ruleset: state.ruleset,
    maps: [state.map],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: state.entryId }],
    databases: state.db,
  };
  // M11.S4 — carry imported art through Save/Export too, not just Import: re-exporting a module
  // that was itself imported with art must not silently drop it.
  if (state.graphicSets && state.graphicSets.length > 0) pkg.graphicSets = state.graphicSets;
  if (state.sourceWarnings && state.sourceWarnings.length > 0) {
    pkg.sourceWarnings = state.sourceWarnings.map((warning) => ({ ...warning }));
  }
  return pkg;
}

document.querySelector('#btn-validate')!.addEventListener('click', () => {
  validateForAction(buildPackage(), 'Package');
});

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'module';
}

function moduleIndex(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY_INDEX);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function renderModuleOptions(): void {
  moduleSelect.replaceChildren(
    ...moduleIndex().map((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      return opt;
    }),
  );
  moduleSelect.value = state.moduleName;
}

function saveNamedModule(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) { setStatus('Module needs a name before it can be saved.'); return; }
  try {
    localStorage.setItem(moduleStoreKey(trimmed), serializeModulePackage(buildPackage()));
    const names = moduleIndex();
    if (!names.includes(trimmed)) localStorage.setItem(STORE_KEY_INDEX, JSON.stringify([...names, trimmed]));
    localStorage.setItem(STORE_KEY_LAST, trimmed);
    if (state.moduleName !== trimmed) markValidationStale();
    state.moduleName = trimmed;
    moduleNameInput.value = trimmed;
    renderModuleOptions();
    setStatus(`Saved "${trimmed}".`);
  } catch {
    setStatus('Save failed (storage quota?).');
  }
}
document.querySelector('#btn-save')!.addEventListener('click', () => saveNamedModule(moduleNameInput.value));

/** Shared by Load-by-name and Import-from-file — both end in "replace the editor with this
 * package", they only differ in where the JSON text comes from. */
function applyImportedPackage(text: string, statusOverride?: string): boolean {
  let pkg: ModulePackage;
  try {
    pkg = deserializeModulePackage(text);
  } catch (err) {
    setStatus(`Import failed: ${(err as Error).message}`);
    return false;
  }
  const report = validateForAction(pkg, 'Import');
  if (!report.ok) return false;
  stopPlaytest();
  state.map = pkg.maps[0];
  state.db = pkg.databases ?? createEmptyModuleDatabase();
  state.ruleset = pkg.ruleset;
  state.entryId = pkg.entrypoints[0]?.entryId ?? 0;
  state.moduleName = pkg.title || pkg.id || 'Imported';
  if (state.customRuleset?.id !== pkg.ruleset) state.customRuleset = null;
  state.graphicSets = pkg.graphicSets;
  state.sourceWarnings = pkg.sourceWarnings?.map((warning) => ({ ...warning }));
  state.artIndex = 0;
  moduleNameInput.value = state.moduleName;
  mapNameInput.value = state.map.name;
  entryIdInput.value = String(state.entryId);
  const importedEntry = state.map.entries.find((entry) => entry.id === state.entryId);
  state.entryFacing = importedEntry?.facing ?? 'north';
  entryFacingSelect.value = state.entryFacing;
  renderRulesetOptions();
  renderModuleOptions();
  renderArtPanel();
  setStatus(statusOverride ?? `Imported "${state.moduleName}".`);
  draw();
  return true;
}

function loadNamedModule(name: string): void {
  const raw = localStorage.getItem(moduleStoreKey(name));
  if (!raw) { setStatus(`No saved module named "${name}".`); return; }
  if (applyImportedPackage(raw, `Loaded "${name}".`)) localStorage.setItem(STORE_KEY_LAST, name);
}
document.querySelector('#btn-load')!.addEventListener('click', () => loadNamedModule(moduleSelect.value));

function exportPayload(): { filename: string; content: string } | null {
  const pkg = buildPackage();
  if (!validateForAction(pkg, 'Export').ok) return null;
  return { filename: `${slugify(state.moduleName)}.gbmod`, content: serializeModulePackage(pkg) };
}

document.querySelector('#btn-export')!.addEventListener('click', () => {
  const payload = exportPayload();
  if (!payload) return;
  const { filename, content } = payload;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported "${filename}".`);
});

document.querySelector('#btn-import')!.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  file.text()
    .then((text) => applyImportedPackage(text))
    .catch((err) => setStatus(`Import failed: ${(err as Error).message}`))
    .finally(() => { importFileInput.value = ''; });
});

// ── Playtest ─────────────────────────────────────────────────────────────────────────────────

function startPlaytest(): void {
  const pkg = buildPackage();
  if (!validateForAction(pkg, 'Playtest').ok) return;
  let loaded: LoadedModule;
  try {
    loaded = loadModule(pkg, { registry: buildRegistry() });
  } catch (err) {
    setStatus(`Playtest failed after validation: ${(err as Error).message}`);
    return;
  }
  const { map, entryId } = resolveEntryPoint(loaded, 0);
  const explorer = Explorer.atEntry(map, entryId);
  const automap = new Automap(state.map.width, state.map.height);
  automap.visit(explorer.getPose().x, explorer.getPose().y);
  state.playtest = {
    automap,
    explorer,
    loaded,
    eventRuntime: new ModuleEventRuntime(loaded),
    eventLog: [],
    awaiting: null,
  };
  state.lastStep = null;
  editTools.style.display = 'none';
  playtestTools.style.display = 'block';
  document.querySelector('#btn-playtest')!.textContent = 'Stop Playtest';
  setStatus('Playtesting — walk the map you authored.');
  draw();
}

function stopPlaytest(): void {
  if (!state.playtest) return;
  state.playtest = null;
  state.lastStep = null;
  editTools.style.display = 'block';
  playtestTools.style.display = 'none';
  document.querySelector('#btn-playtest')!.textContent = 'Playtest';
  draw();
}

document.querySelector('#btn-playtest')!.addEventListener('click', () => {
  if (state.playtest) stopPlaytest();
  else startPlaytest();
});

function playtestMove(action: 'forward' | 'backward' | 'turnLeft' | 'turnRight'): void {
  const pt = state.playtest;
  if (!pt) return;
  if (pt.eventRuntime.awaiting) return;
  if (action === 'turnLeft') { pt.explorer.turnLeft(); draw(); return; }
  if (action === 'turnRight') { pt.explorer.turnRight(); draw(); return; }
  const step = action === 'forward' ? pt.explorer.forward() : pt.explorer.backward();
  state.lastStep = step;
  if (step.moved) {
    pt.automap.visit(step.pose.x, step.pose.y);
    if (step.event) { fireEvent(step.event); return; } // fireEvent() already draw()s
    pt.eventLog = [];
    pt.awaiting = null;
  }
  draw();
}

document.querySelector('#pt-forward')!.addEventListener('click', () => playtestMove('forward'));
document.querySelector('#pt-back')!.addEventListener('click', () => playtestMove('backward'));
document.querySelector('#pt-left')!.addEventListener('click', () => playtestMove('turnLeft'));
document.querySelector('#pt-right')!.addEventListener('click', () => playtestMove('turnRight'));

window.addEventListener('keydown', (e) => {
  if (!state.playtest) return;
  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); playtestMove('forward'); break;
    case 'ArrowDown': e.preventDefault(); playtestMove('backward'); break;
    case 'ArrowLeft': e.preventDefault(); playtestMove('turnLeft'); break;
    case 'ArrowRight': e.preventDefault(); playtestMove('turnRight'); break;
  }
});

// ── Boot + e2e seam ──────────────────────────────────────────────────────────────────────────

(function boot(): void {
  const lastModule = localStorage.getItem(STORE_KEY_LAST);
  if (lastModule) {
    const raw = localStorage.getItem(moduleStoreKey(lastModule));
    if (raw) applyImportedPackage(raw, `Restored "${lastModule}".`);
    else setStatus('Last module was missing — starting fresh.');
  }
  renderModuleOptions();
  renderRulesetOptions();
  selectTool('wall-north');
  draw();

  (window as unknown as { __author?: Record<string, unknown> }).__author = {
    dims: () => ({ width: state.map.width, height: state.map.height }),
    layout: () => automapGridLayout(state.map.width, state.map.height),
    newMap: (w: number, h: number) => createNewModule(w, h),
    setTool: (tool: Tool) => selectTool(tool),
    setValue: (n: number) => { state.toolValue = n; toolValueInput.value = String(n); },
    setEntryFacing: (f: Direction) => { state.entryFacing = f; entryFacingSelect.value = f; },
    setEntryId: (id: number) => { state.entryId = id; entryIdInput.value = String(id); markValidationStale(); },
    clickCell: (x: number, y: number) => applyTool(x, y, false),
    clearCell: (x: number, y: number) => applyTool(x, y, true),
    wallAt: (x: number, y: number, dir: Direction) => state.map.cells[y * state.map.width + x]?.walls[dir] ?? 0,
    floorAt: (x: number, y: number) => state.map.cells[y * state.map.width + x]?.floor ?? 0,
    zoneAt: (x: number, y: number) => state.map.cells[y * state.map.width + x]?.flags ?? 0,
    entries: () => state.map.entries,
    // Named modules: save / load / export / import (M11.S2).
    moduleName: () => state.moduleName,
    setModuleName: (name: string) => { state.moduleName = name; moduleNameInput.value = name; markValidationStale(); },
    mapName: () => state.map.name,
    setMapName: (name: string) => { state.map = { ...state.map, name }; mapNameInput.value = name; markValidationStale(); draw(); },
    modules: () => moduleIndex(),
    saveModule: (name?: string) => saveNamedModule(name ?? moduleNameInput.value),
    loadModuleByName: (name: string) => loadNamedModule(name),
    exportModule: () => exportPayload(),
    importModuleJson: (text: string) => applyImportedPackage(text),
    startPlaytest,
    stopPlaytest,
    isPlaytesting: () => !!state.playtest,
    pose: () => state.playtest?.explorer.getPose() ?? null,
    move: (action: 'forward' | 'backward' | 'turnLeft' | 'turnRight') => { playtestMove(action); return state.lastStep; },
    canMove: (dir: Direction) => state.playtest?.explorer.canMove(dir) ?? null,
    // Event authoring + firing (M5.S4).
    events: () => state.map.events,
    upsertEventJson: (json: string) => { eventJsonInput.value = json; document.querySelector('#btn-event-upsert')!.dispatchEvent(new Event('click')); },
    deleteEvent: (id: number) => { state.map = removeEvent(state.map, id); markValidationStale(); draw(); },
    setCellEventDirect: (x: number, y: number, eventId: number) => { state.map = setCellEvent(state.map, x, y, eventId); markValidationStale(); draw(); },
    eventLog: () => state.playtest?.eventLog.slice() ?? [],
    awaitingKind: () => state.playtest?.awaiting?.kind ?? null,
    answerChoice,
    answerCombat,
    // Database editors + ruleset picker (M5.S5).
    db: () => state.db,
    upsertDbJson: (category: DbCategory, json: string) => {
      dbCategorySelect.value = category;
      dbJsonInput.value = json;
      document.querySelector('#btn-db-upsert')!.dispatchEvent(new Event('click'));
    },
    deleteDbRecord: (category: DbCategory, id: number | string) => { deleteDbRecord(category, id); },
    combatMonsters: () => combatMonsterSummaries(),
    rulesetIds,
    setRuleset: (id: string) => { state.ruleset = id; rulesetSelect.value = id; markValidationStale(); },
    registerCustomRulesetJson: (json: string) => {
      rulesetJsonInput.value = json;
      document.querySelector('#btn-ruleset-register')!.dispatchEvent(new Event('click'));
    },
    loadedRulesetId: () => state.playtest?.loaded.ruleset.id ?? null,
    thac0For: (classId: string, level: number) => state.playtest?.loaded.ruleset.thac0?.(classId as ClassId, level) ?? null,
    // Imported art panel (M11.S4).
    artFrameCount: () => flattenArtFrames(state.graphicSets).length,
    artIndex: () => state.artIndex,
    artStep: (delta: number) => { state.artIndex += delta; renderArtPanel(); },
  };
})();
