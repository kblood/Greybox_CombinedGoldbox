/**
 * Authored-module explore mode (M11.S3) — "the headline": an imported `.gbmod` `ModulePackage`
 * boots through the exact same real play path original games use (`loadModule` →
 * `resolveEntryPoint` → `Explorer` → `EclVm`), landing in a genuinely walkable session with the
 * same M10 in-play Companion host (`companionPanel.ts`) `explore.ts`/`dqkExplore.ts` already give
 * CoK/DoK/DQK. This is `apps/web`'s first use of `loadModule` — previously only `apps/author`'s
 * playtest mode exercised it.
 *
 * One honest deviation from the original-game explore views: there is no per-cell mapping from a
 * `MapCell` to a specific imported picture (FRUA/DQK `.TLB` art has no such linkage in the module
 * model yet), so the PRIMARY screen stays the `composeAutomapPanel` view (the same D1 Automap
 * model + compositor the Companion's own Automap tab uses), fed by real walking instead of
 * click-reveal — exactly the pattern `apps/author`'s playtest already established for the same
 * reason. M11.S4 adds a secondary browsable **art panel** when the imported module carries
 * `graphicSets` (M5.S2b): every decoded frame across every set, stepped prev/next and painted
 * through `indexedToRGBA` straight onto a plain canvas — the exact same pattern `dqkExplore.ts`'s
 * "DQK VGA art" preview already uses for BIGPIC, reused here rather than inventing a new one.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  loadModule,
  resolveEntryPoint,
  ModuleEventRuntime,
  Explorer,
  Automap,
  makeSave,
  serializeSave,
  deserializeSave,
  composeAutomapPanel,
  makeEgaPalette,
  indexedToRGBA,
  authoredMonsterCombatant,
  validateModulePackage,
  DOS_EGA,
  type CombatEventBody,
  type Combatant,
  type CombatResult,
  type EclCombatOutcome,
  type FruaBaseItemRecord,
  type FruaItemCatalogue,
  type FruaResolvedItemRecord,
  type GiveTreasureEventBody,
  type GiveTreasureEventEffect,
  type ModulePackage,
  type LoadedModule,
  type ModuleEventRuntimeOptions,
  type ModuleEventRuntimeResult,
  type GameMap,
  type IndexedImage,
  type Palette,
  type Pose,
} from '@goldbox/engine';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { openCompanionPanel, isCompanionOpen, type CompanionTab } from './companionPanel.js';
import {
  launchCombat,
  moduleCombatParty,
  moduleNeutralCombatAssets,
} from './combat.js';
import { moduleSaveKey } from './moduleSaveKey.js';

const EGA_PALETTE: Palette = makeEgaPalette();

type MoveAction = 'forward' | 'back' | 'left' | 'right';

/** One flattened, browsable frame from `ModulePackage.graphicSets` — a set name + its own
 * source frame id (the module model has no per-cell linkage yet, so these are shown as a plain
 * browsable gallery, not placed on the map). */
interface ModuleArtFrame {
  setName: string;
  frameId: number;
  image: IndexedImage;
}

/** Every real (non-zero-sized) frame across every imported graphic set, in set order then frame
 * id order. Empty if the module has no `graphicSets` (the common case — most authored modules are
 * text/choice/combat content with no imported art). */
function flattenArtFrames(pkg: ModulePackage): ModuleArtFrame[] {
  const out: ModuleArtFrame[] = [];
  for (const set of pkg.graphicSets ?? []) {
    for (const [frameId, image] of [...set.frames].sort((a, b) => a[0] - b[0])) {
      if (image.width > 0 && image.height > 0) out.push({ setName: set.name, frameId, image });
    }
  }
  return out;
}

/** What the shared engine runtime is waiting on after a choice/combat event pauses. */
type EventAwaiting = { kind: 'choice' | 'combat'; eventId: number };

/** The M11.S4 art panel's own live state — absent entirely when the module has no `graphicSets`. */
interface ModuleArtState {
  frames: ModuleArtFrame[];
  index: number;
  canvas: HTMLCanvasElement;
}

interface ModuleExploreState {
  pkg: ModulePackage;
  entryPointId: number;
  artifactId: string | undefined;
  loaded: LoadedModule;
  eventRuntime: ModuleEventRuntime;
  map: GameMap;
  explorer: Explorer;
  automap: Automap;
  surface: ScreenSurface;
  eventLog: string[];
  awaiting: EventAwaiting | null;
  art: ModuleArtState | null;
  combatLaunching: boolean;
  monsterSource: ModuleMonsterSourceEvidence | null;
  itemSource: ModuleItemSourceCapability | null;
  treasureReceipts: ModuleTreasureReceipt[];
}

// FRUA event 12 has 37 hostiles, including twelve 2x2 ettins, plus six friendly guards.  The
// shared combat demo's deliberately cramped 13x9 obstacle course cannot seat that exact roster.
// Use an honestly source-neutral, open tactical field until FRUA combat-map art/terrain is decoded;
// 50x25 is the native shared tactical-map extent and leaves every source footprint intact.
const MODULE_NEUTRAL_COMBAT_TERRAIN = { width: 50, height: 25 } as const;
const MODULE_NEUTRAL_PARTY_ANCHOR = { col: 6, row: 12 } as const;
const MODULE_NEUTRAL_ENEMY_ANCHOR = { col: 34, row: 12 } as const;

export interface ModuleMonsterSourceEvidence {
  path: string;
  sha256: string;
}

export interface ModuleItemFileEvidence {
  path: string;
  sha256: string;
}

/** Host-owned capability retained from the selected UA install. The catalogue never enters the
 * portable module and is deliberately removed from the browser's JSON-safe evidence seam. */
export interface ModuleItemSourceCapability {
  itemDat: ModuleItemFileEvidence;
  itemsDat: ModuleItemFileEvidence;
  catalogue: FruaItemCatalogue;
}

type JsonFruaBaseItemRecord = Omit<FruaBaseItemRecord, 'raw'> & { raw: number[] };
type JsonFruaResolvedItemRecord = Omit<FruaResolvedItemRecord, 'nameCodes' | 'raw' | 'base'> & {
  nameCodes: number[];
  raw: number[];
  base: JsonFruaBaseItemRecord;
};

export interface ModuleTreasureReceiptItem {
  /** One-based ordinal after FRUA's zero-valued empty item fields are removed. Repeated item IDs
   * remain separate bundles; this does not claim to preserve gaps in the eight source fields. */
  ordinal: number;
  id: number;
  displayName: string;
  identifiedName: string;
  bundleCount: number;
  /** Full selected-root ITEM.DAT + ITEMS.DAT record, present only for an authorized FRUA reward. */
  source?: JsonFruaResolvedItemRecord;
}

export interface ModuleTreasureReceipt {
  eventId: number;
  platinum: number;
  gems: number;
  jewelry: number;
  itemsIdentified: boolean;
  items: ModuleTreasureReceiptItem[];
}

export interface ModuleExploreOptions {
  /** Lower-case SHA-256 (or another immutable artifact identity) for exact save scoping. */
  artifactId?: string;
  monsterSource?: ModuleMonsterSourceEvidence;
  itemSource?: ModuleItemSourceCapability;
}

let state: ModuleExploreState | null = null;

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (!s) return;
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

function jsonFruaItem(item: FruaResolvedItemRecord): JsonFruaResolvedItemRecord {
  return {
    ...item,
    nameCodes: [...item.nameCodes],
    raw: [...item.raw],
    base: { ...item.base, raw: [...item.base.raw] },
  };
}

function receiptForEffect(effect: GiveTreasureEventEffect): ModuleTreasureReceipt {
  const event = moduleEvent(effect.eventId);
  const body = event?.type === 'giveTreasure' ? event.body as GiveTreasureEventBody : undefined;
  const catalogue = body?.source?.format === 'frua' ? state?.itemSource?.catalogue : undefined;
  return {
    eventId: effect.eventId,
    platinum: effect.platinum,
    gems: effect.gems,
    jewelry: effect.jewelry,
    itemsIdentified: effect.itemsIdentified,
    items: effect.items.map((id, index) => {
      const record = catalogue?.byId.get(id);
      const displayName = record
        ? (effect.itemsIdentified ? record.name : record.unidentifiedName)
        : `Item #${id}`;
      return {
        ordinal: index + 1,
        id,
        displayName,
        identifiedName: record?.name ?? `Item #${id}`,
        bundleCount: record?.bundleCount ?? 0,
        ...(record ? { source: jsonFruaItem(record) } : {}),
      };
    }),
  };
}

function formatTreasureReceipt(receipt: ModuleTreasureReceipt): string {
  const itemText = receipt.items.length === 0
    ? 'none'
    : receipt.items.map((item) => item.bundleCount > 1
      ? `${item.displayName} (bundle of ${item.bundleCount})`
      : item.displayName).join(', ');
  return `Treasure received: ${receipt.platinum} platinum, ${receipt.gems} gems, ` +
    `${receipt.jewelry} jewelry; items: ${itemText}.`;
}

function retainTreasureReceipt(receipt: ModuleTreasureReceipt): void {
  if (!state) return;
  const index = state.treasureReceipts.findIndex((candidate) => candidate.eventId === receipt.eventId);
  if (index < 0) state.treasureReceipts.push(receipt);
  else state.treasureReceipts[index] = receipt;
}

/** Preserve effect order across automatic chains: the receipt belongs between the last pre-reward
 * print and the first continuation print, rather than in a separately batched host pass. */
function foldEventEffects(log: string[], result: ModuleEventRuntimeResult): void {
  for (const effect of result.effects) {
    if (effect.type === 'print' && effect.text !== undefined) {
      log.push(effect.text);
    } else if (effect.type === 'giveTreasure') {
      const receipt = receiptForEffect(effect);
      retainTreasureReceipt(receipt);
      log.push(formatTreasureReceipt(receipt));
    }
  }
}

/** Render one stop from the shared engine driver. NEWECL traversal, once-only consumption, and
 * return-to-question continuations have already happened inside `ModuleEventRuntime`. */
function applyEventResult(result: ModuleEventRuntimeResult): void {
  if (!state) return;
  foldEventEffects(state.eventLog, result);
  state.awaiting =
    result.status === 'awaiting-input'
      ? { kind: 'choice', eventId: result.eventId }
      : result.status === 'combat'
        ? { kind: 'combat', eventId: result.eventId }
        : null;
  if (result.status === 'halted' && result.haltReason) state.eventLog.push(`[event halted: ${result.haltReason}]`);
  draw();
  if (result.status === 'combat') void launchModuleEventCombat(result.eventId);
}

function moduleEvent(eventId: number) {
  for (const map of state?.pkg.maps ?? []) {
    const event = map.events.find((candidate) => candidate.id === eventId);
    if (event) return event;
  }
  return undefined;
}

function sameCapabilityPath(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return left.replace(/\\/g, '/').toLowerCase() === right.replace(/\\/g, '/').toLowerCase();
}

function eventRuntimeOptions(
  itemSource: ModuleItemSourceCapability | null,
  artifactId?: string,
): ModuleEventRuntimeOptions {
  return {
    ...(artifactId !== undefined ? { artifactId } : {}),
    authorizeGiveTreasure: (_event, body) => {
      const source = body.source;
      if (!source) return true;
      if (!itemSource) {
        return `FRUA Give Treasure event ${source.sourceEventSlot} requires selected-install ` +
          'DISK1/ITEM.DAT and DISK1/ITEMS.DAT evidence';
      }
      if (!sameCapabilityPath(source.itemDatSourceName, itemSource.itemDat.path) ||
          !sameCapabilityPath(source.itemsDatSourceName, itemSource.itemsDat.path)) {
        return `FRUA Give Treasure event ${source.sourceEventSlot} item-table paths do not match ` +
          'the selected-install catalogue';
      }
      const unresolved = body.items.find((id) => !itemSource.catalogue.byId.has(id));
      if (unresolved !== undefined) {
        return `FRUA Give Treasure event ${source.sourceEventSlot} item ${unresolved} is unresolved ` +
          'in the selected-install catalogue';
      }
      return true;
    },
  };
}

function spawnModuleMonsterGroups(
  eventId: number,
  groups: CombatEventBody['monsters'],
  side: 'party' | 'enemy',
  provenance: 'authored' | 'frua',
  requiredSource?: ModuleMonsterSourceEvidence,
): Combatant[] {
  if (!state?.pkg.databases) {
    throw new Error(
      provenance === 'frua'
        ? 'FRUA combat has no imported monster database'
        : 'authored combat has no module monster database',
    );
  }
  const byId = new Map(state.pkg.databases.monsters.map((monster) => [monster.id, monster]));
  const combatants: Combatant[] = [];
  let ordinal = 0;
  for (const group of groups) {
    const monster = byId.get(group.monsterId);
    if (!monster) {
      throw new Error(
        provenance === 'frua'
          ? `FRUA monster slot ${group.monsterId} is unresolved`
          : `authored monster ${group.monsterId} is unresolved`,
      );
    }
    if (requiredSource) {
      const source = monster.source;
      const tracesToSelectedBestiary = source?.format === 'frua' && (
        sameCapabilityPath(source.sourceName, requiredSource.path) ||
        (source.overrides !== undefined && sameCapabilityPath(source.overrides.sourceName, requiredSource.path))
      );
      if (!tracesToSelectedBestiary) {
        throw new Error(
          `FRUA monster slot ${group.monsterId} does not trace to selected bestiary ${requiredSource.path}`,
        );
      }
    }
    for (let copy = 0; copy < group.count; copy++) {
      const prefix = provenance === 'frua'
        ? (side === 'enemy' ? 'frua-e' : 'frua-a')
        : (side === 'enemy' ? 'authored-e' : 'authored-a');
      combatants.push(authoredMonsterCombatant(monster, `${prefix}${eventId}-${ordinal++}`, side));
    }
  }
  return combatants;
}

/** Hand a paused ModuleEventRuntime Combat block to the same interactive tactical overlay used by
 * original-game encounters. The VM resumes only after that overlay's finished result is dismissed. */
async function launchModuleEventCombat(eventId: number): Promise<void> {
  if (!state || state.combatLaunching || state.awaiting?.kind !== 'combat') return;
  const event = moduleEvent(eventId);
  const body = event?.body as CombatEventBody | undefined;
  if (!event || (event.type !== 'combat' && event.type !== 'pickOneCombat') ||
      !body || !('monsters' in body)) {
    state.eventLog.push(`[combat unavailable: module event ${eventId} has no executable roster]`);
    draw();
    return;
  }

  try {
    const provenance = body.source?.format === 'frua' ? 'frua' : 'authored';
    const requiredSource = provenance === 'frua' ? state.monsterSource : undefined;
    if (provenance === 'frua' && !requiredSource) {
      throw new Error('FRUA combat requires selected-install MONST.GLB evidence');
    }
    const enemies = spawnModuleMonsterGroups(
      eventId,
      body.monsters,
      'enemy',
      provenance,
      requiredSource ?? undefined,
    );
    const friendlyNpcs = spawnModuleMonsterGroups(
      eventId,
      body.friendlyMonsters ?? [],
      'party',
      provenance,
      requiredSource ?? undefined,
    );
    if (enemies.length === 0) throw new Error('the hostile roster is empty');
    const { party, demo } = moduleCombatParty();
    state.combatLaunching = true;
    const combatLabel = provenance === 'frua' ? 'source-backed FRUA combat' : 'authored combat';
    setStatus(demo
      ? `Launching ${combatLabel} with the preview party (${enemies.length} foes, ${friendlyNpcs.length} allies)…`
      : `Launching ${combatLabel} (${enemies.length} foes, ${friendlyNpcs.length} allies)…`);
    await launchCombat({
      party,
      friendlyNpcs,
      enemies,
      demo,
      assets: moduleNeutralCombatAssets(
        `${state.pkg.id}:${provenance === 'frua' ? 'frua-no-art' : 'authored-no-art'}`,
      ),
      terrain: MODULE_NEUTRAL_COMBAT_TERRAIN,
      partyAnchor: MODULE_NEUTRAL_PARTY_ANCHOR,
      enemyAnchor: MODULE_NEUTRAL_ENEMY_ANCHOR,
      coabSourcePlacement: false,
      coabTileMutations: false,
      seed: ((provenance === 'frua' ? 0x46525541 : 0x4d4f4455) ^ eventId) >>> 0,
      intro: body.intro ?? 'The enemy attacks!',
      // Module events own their authored/source reward chain. Suppress the combat screen's generic
      // synthetic drops so the tactical host never invents a second reward.
      scriptedTreasure: { gold: 0, items: [] },
      onEnd: (result: CombatResult) => {
        if (!state || state.eventRuntime.currentEventId !== eventId) return;
        state.combatLaunching = false;
        const outcome: EclCombatOutcome = result.fled
          ? 'flee'
          : result.outcome === 'party'
            ? 'victory'
            : 'defeat';
        answerCombat(outcome);
      },
    });
  } catch (err) {
    if (!state) return;
    state.combatLaunching = false;
    state.eventLog.push(`[combat unavailable: ${(err as Error).message}]`);
    setStatus(`Could not launch module combat: ${(err as Error).message}`, 'error');
    draw();
  }
}

function fireEvent(eventId: number): void {
  if (!state) return;
  state.eventLog = [];
  state.awaiting = null;
  try {
    applyEventResult(state.eventRuntime.fire(eventId));
  } catch (err) {
    state.eventLog = [`[event error: ${(err as Error).message}]`];
    draw();
  }
}

function answerChoice(n: number): void {
  if (!state?.awaiting || state.awaiting.kind !== 'choice') return;
  try {
    applyEventResult(state.eventRuntime.resumeChoice(n));
  } catch (err) {
    state.eventLog.push(`[event answer error: ${(err as Error).message}]`);
    state.awaiting = null;
    draw();
  }
}

function answerCombat(outcome: EclCombatOutcome): void {
  if (!state?.awaiting || state.awaiting.kind !== 'combat') return;
  // The real tactical overlay owns the outcome while it is open.  In particular, keep the browser
  // seam from resuming the event VM behind a live overlay and falsely bypassing onEnd/dismissal.
  if (state.combatLaunching) return;
  try {
    applyEventResult(state.eventRuntime.resumeCombat(outcome));
  } catch (err) {
    state.eventLog.push(`[event combat error: ${(err as Error).message}]`);
    state.awaiting = null;
    draw();
  }
}

/** Persist stable map position plus the shared event snapshot through the engine SaveGame codec. */
function saveModuleSession(): boolean {
  if (!state) return false;
  if (state.eventRuntime.awaiting) {
    setStatus('Finish the current event before saving.', 'error');
    return false;
  }
  try {
    const pose = state.explorer.getPose();
    const save = makeSave({
      name: `${state.pkg.title} — module quick save`,
      savedAt: Date.now(),
      position: { area: state.map.name, x: pose.x, y: pose.y, facing: pose.facing },
      moduleEventState: state.eventRuntime.snapshot(),
    });
    localStorage.setItem(
      moduleSaveKey(state.pkg.id, state.entryPointId, state.artifactId),
      serializeSave(save),
    );
    state.eventLog = ['Module position and event state saved.'];
    setStatus(`Saved "${state.pkg.title}" module state.`);
    draw();
    return true;
  } catch (err) {
    setStatus(`Could not save module state: ${(err as Error).message}`, 'error');
    return false;
  }
}

/** Restore only a save scoped to this exact module id/entry and current map. */
function loadModuleSession(): boolean {
  if (!state) return false;
  if (state.eventRuntime.awaiting) {
    setStatus('Finish the current event before loading.', 'error');
    return false;
  }
  try {
    const raw = localStorage.getItem(moduleSaveKey(state.pkg.id, state.entryPointId, state.artifactId));
    const save = raw ? deserializeSave(raw) : null;
    if (!save?.moduleEventState || !save.position || save.position.area !== state.map.name) {
      setStatus('No compatible module save exists for this entry.', 'error');
      return false;
    }
    const restoredRuntime = new ModuleEventRuntime(
      state.loaded,
      save.moduleEventState,
      eventRuntimeOptions(state.itemSource, state.artifactId),
    );
    state.explorer.setPose({ x: save.position.x, y: save.position.y, facing: save.position.facing });
    state.eventRuntime = restoredRuntime;
    state.treasureReceipts = (restoredRuntime.snapshot().treasureReceipts ?? [])
      .map((receipt) => receiptForEffect(receipt));
    state.awaiting = null;
    state.eventLog = ['Module position and consumed-event state loaded.'];
    setStatus(`Loaded "${state.pkg.title}" module state.`);
    draw();
    return true;
  } catch (err) {
    setStatus(`Could not load module state: ${(err as Error).message}`, 'error');
    return false;
  }
}

/**
 * Open the M10 Companion host over the live module session — the SAME `companionPanel.ts` host
 * every original game uses, fed from this module's own `map`/`automap`/pose. `monsters`/`items`
 * are empty: an authored `AuthoredMonster` (`module/database.ts`) is deliberately lighter than the
 * decoded `MonsterRecord` the Companion's Reference DB tab expects (no abilities/saves/hit dice) —
 * inventing those fields would violate the project's no-invented-data convention, the exact same
 * call DQK's own `dqkExplore.ts` makes for its `items` source.
 */
function openCompanion(tab?: CompanionTab): void {
  if (!state) return;
  const pose = state.explorer.getPose();
  openCompanionPanel({
    source: {
      frameTiles: null,
      font: null,
      map: state.map,
      automap: state.automap,
      pose: { x: pose.x, y: pose.y, facing: pose.facing },
      monsters: [],
      items: [],
    },
    initialTab: tab,
    onClose: () => setStatus('You close the companion panel.'),
  });
}

/** Paint the current art-panel frame to its own plain canvas (M11.S4) — same
 * indexedToRGBA-then-putImageData pattern as `dqkExplore.ts`'s BIGPIC preview. */
function paintArt(): void {
  if (!state?.art) return;
  const { frames, index, canvas } = state.art;
  const frame = frames[index];
  canvas.width = frame.image.width;
  canvas.height = frame.image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rgba = indexedToRGBA(frame.image, frame.image.palette);
  const imgData = ctx.createImageData(frame.image.width, frame.image.height);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);
  const label = document.querySelector('#module-artlabel') as HTMLElement | null;
  if (label) {
    label.textContent =
      `${frame.setName} frame ${frame.frameId} — art ${index + 1}/${frames.length} ` +
      `(${frame.image.width}×${frame.image.height})`;
  }
}

/** Step the art panel to the previous/next decoded frame (M11.S4). */
function artStep(delta: number): void {
  if (!state?.art) return;
  const n = state.art.frames.length;
  state.art.index = (state.art.index + delta + n) % n;
  paintArt();
}

function draw(): void {
  if (!state) return;
  const pose = state.explorer.getPose();
  state.automap.visit(pose.x, pose.y);
  const fb = composeAutomapPanel({
    title: `${state.pkg.title} — ${state.map.name}`,
    map: state.map,
    automap: state.automap,
    pose,
    status: `(${pose.x},${pose.y}) facing ${pose.facing} · ${state.automap.visitedCount}/${state.map.width * state.map.height} cells known`,
  });
  state.surface.paint(fb, EGA_PALETTE);

  const evLine = document.querySelector('#module-eventline') as HTMLElement | null;
  if (evLine) evLine.textContent = state.eventLog.join('\n');
  const receiptLine = document.querySelector('#module-treasure-receipts') as HTMLElement | null;
  if (receiptLine) {
    // During the award turn the ordered event log already contains the receipt. Once that
    // transient log is cleared/replaced, show the durable ledger without rendering it twice.
    const currentEventLog = state.eventLog;
    const durableOnly = state.treasureReceipts
      .map(formatTreasureReceipt)
      .filter((receipt) => !currentEventLog.includes(receipt));
    receiptLine.textContent = durableOnly.join('\n');
    receiptLine.style.display = durableOnly.length > 0 ? 'block' : 'none';
  }
  const choiceRow = document.querySelector('#module-choice-row') as HTMLElement | null;
  if (choiceRow) choiceRow.style.display = state.awaiting?.kind === 'choice' ? 'flex' : 'none';
  const combatRow = document.querySelector('#module-combat-row') as HTMLElement | null;
  if (combatRow) combatRow.style.display = state.awaiting?.kind === 'combat' ? 'flex' : 'none';
}

function applyMove(action: MoveAction): Pose {
  if (!state) return { x: 0, y: 0, facing: 'north' };
  // A choice/combat VM owns the interaction until it resumes. Exploration movement here would
  // otherwise change pose underneath a paused retail event and break its branch provenance.
  if (state.eventRuntime.awaiting) return state.explorer.getPose();
  if (action === 'left') { state.explorer.turnLeft(); draw(); return state.explorer.getPose(); }
  if (action === 'right') { state.explorer.turnRight(); draw(); return state.explorer.getPose(); }
  const step = action === 'forward' ? state.explorer.forward() : state.explorer.backward();
  if (step.moved) {
    if (step.event) { fireEvent(step.event); return state.explorer.getPose(); } // fireEvent() already draw()s
    state.eventLog = [];
    state.awaiting = null;
  }
  draw();
  return state.explorer.getPose();
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  if (isCompanionOpen()) return; // the Companion overlay handles its own keys (capture phase)
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); openCompanion(); return; }
  const map: Record<string, MoveAction> = { ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right' };
  const action = map[e.key];
  if (action) { e.preventDefault(); applyMove(action); }
}

/**
 * Boot an imported `.gbmod` `ModulePackage` into a real, walkable session — the Library's "module"
 * entries route here (see `main.ts`'s `onLibrarySelect`), the same way a detected game routes into
 * `startExplore`/`startDqkExplore`.
 */
export function startModuleExplore(pkg: ModulePackage, entryPointId = 0, options: ModuleExploreOptions = {}): number {
  closeDungeon3d();
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus(`Loading authored module "${pkg.title}"…`);

  // Library import validates before registration, but startModuleExplore is also called by
  // playtest/e2e routes and receives a mutable object. Re-check at this trust boundary so an
  // invalid or subsequently modified package never reaches loadModule.
  const validation = validateModulePackage(pkg);
  if (!validation.ok) {
    const details = validation.errors
      .map((finding) => `[${finding.code}] ${finding.path}: ${finding.message}`)
      .join('; ');
    setStatus(`Could not load module "${pkg.title}": validation failed: ${details}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  let loaded: LoadedModule;
  try {
    loaded = loadModule(pkg);
  } catch (err) {
    setStatus(`Could not load module "${pkg.title}": ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  let resolved: ReturnType<typeof resolveEntryPoint>;
  try {
    resolved = resolveEntryPoint(loaded, entryPointId);
  } catch (err) {
    setStatus(
      `Could not load module "${pkg.title}": ${err instanceof Error ? err.message : String(err)}`,
      'error',
    );
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  const { map, entryId } = resolved;
  const explorer = Explorer.atEntry(map, entryId);
  const automap = new Automap(map.width, map.height);
  const itemSource = options.itemSource ?? null;
  const artifactId = options.artifactId;
  let eventRuntime: ModuleEventRuntime;
  try {
    eventRuntime = new ModuleEventRuntime(loaded, undefined, eventRuntimeOptions(itemSource, artifactId));
  } catch (err) {
    setStatus(
      `Could not load module "${pkg.title}": ${err instanceof Error ? err.message : String(err)}`,
      'error',
    );
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const screen = el('div', 'gb-screen');
  screen.appendChild(el('div', 'gb-panel-h', `${pkg.title} — authored module (walkable)`));
  screen.appendChild(
    el('div', 'gb-note', `Loaded map "${map.name}" (${map.width}×${map.height}) from an imported .gbmod file.`),
  );

  const aid = el('div', 'gb-aid');
  aid.appendChild(el('div', 'gb-panel-h', 'Explore'));
  const amBox = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  surface.canvas.classList.add('gb-automap');
  surface.canvas.tabIndex = 0;
  amBox.appendChild(surface.canvas);
  aid.appendChild(amBox);
  screen.appendChild(aid);

  const menu = el('div', 'gb-menu');
  menu.innerHTML = '<b>↑↓←→</b> Move/turn · <b>M</b> Companion (read-only automap/party/databases) · ';
  const saveBtn = el('button', '', 'Save') as HTMLButtonElement;
  const loadBtn = el('button', '', 'Load') as HTMLButtonElement;
  saveBtn.type = 'button';
  loadBtn.type = 'button';
  saveBtn.id = 'module-save';
  loadBtn.id = 'module-load';
  saveBtn.addEventListener('click', saveModuleSession);
  loadBtn.addEventListener('click', loadModuleSession);
  menu.appendChild(saveBtn);
  menu.appendChild(document.createTextNode(' '));
  menu.appendChild(loadBtn);
  screen.appendChild(menu);

  // M11.S4 — the imported-art panel: only mounted when the module actually carries `graphicSets`
  // (most authored modules have none). Browsable prev/next gallery over every decoded frame,
  // painted through the real render pipeline — see `paintArt`'s header comment.
  const artFrames = flattenArtFrames(pkg);
  let artCanvas: HTMLCanvasElement | null = null;
  if (artFrames.length > 0) {
    const artWrap = el('div', 'gb-aid');
    artWrap.appendChild(el('div', 'gb-panel-h', 'Imported art'));
    const artLabel = el('div', 'gb-note', '');
    artLabel.id = 'module-artlabel';
    artWrap.appendChild(artLabel);
    artCanvas = el('canvas', 'pixelated') as HTMLCanvasElement;
    artCanvas.id = 'module-art';
    artCanvas.style.imageRendering = 'pixelated';
    artCanvas.style.maxWidth = '100%';
    artWrap.appendChild(artCanvas);
    const artNav = el('div', 'gb-menu');
    const prevBtn = el('button', '', '◀ Prev') as HTMLButtonElement;
    const nextBtn = el('button', '', 'Next ▶') as HTMLButtonElement;
    prevBtn.type = 'button';
    nextBtn.type = 'button';
    prevBtn.addEventListener('click', () => artStep(-1));
    nextBtn.addEventListener('click', () => artStep(1));
    artNav.appendChild(prevBtn);
    artNav.appendChild(document.createTextNode(' '));
    artNav.appendChild(nextBtn);
    artWrap.appendChild(artNav);
    screen.appendChild(artWrap);
  }

  const eventLine = el('div', 'gb-note', '');
  eventLine.id = 'module-eventline';
  screen.appendChild(eventLine);

  // Durable receipts remain visible after the transient event log is cleared or a save is loaded.
  // This is only a source-shaped ledger: it does not mutate Party currency, inventory, or gear.
  const receiptLine = el('div', 'gb-note', '');
  receiptLine.id = 'module-treasure-receipts';
  receiptLine.style.display = 'none';
  screen.appendChild(receiptLine);

  const choiceRow = el('div', 'gb-menu');
  choiceRow.id = 'module-choice-row';
  choiceRow.style.display = 'none';
  const answerInput = el('input', '') as HTMLInputElement;
  answerInput.type = 'number';
  answerInput.min = '1';
  answerInput.max = '9';
  answerInput.value = '1';
  answerInput.id = 'module-answer';
  const answerBtn = el('button', '', 'Answer') as HTMLButtonElement;
  answerBtn.type = 'button';
  answerBtn.addEventListener('click', () => answerChoice(Math.max(1, Number(answerInput.value) || 1)));
  choiceRow.appendChild(answerInput);
  choiceRow.appendChild(answerBtn);
  screen.appendChild(choiceRow);

  out.appendChild(screen);

  state = {
    pkg, entryPointId, artifactId, loaded,
    eventRuntime,
    map, explorer, automap,
    surface, eventLog: [], awaiting: null,
    art: artCanvas ? { frames: artFrames, index: 0, canvas: artCanvas } : null,
    combatLaunching: false,
    monsterSource: options.monsterSource ?? null,
    itemSource,
    treasureReceipts: [],
  };
  draw();
  if (state.art) paintArt();
  surface.canvas.focus();

  // Headless e2e seam.
  (window as unknown as { __module?: Record<string, unknown> }).__module = {
    loaded: () => !!state,
    title: () => state?.pkg.title ?? '',
    mapName: () => state?.map.name ?? '',
    dims: () => (state ? { w: state.map.width, h: state.map.height } : null),
    getPose: () => state?.explorer.getPose() ?? null,
    move: (a: MoveAction) => applyMove(a),
    eventLog: () => state?.eventLog.join('\n') ?? '',
    awaiting: () => state?.awaiting?.kind ?? null,
    answerChoice: (n: number) => answerChoice(n),
    answerCombat: (o: EclCombatOutcome) => answerCombat(o),
    save: () => saveModuleSession(),
    load: () => loadModuleSession(),
    restart: () => startModuleExplore(pkg, entryPointId, options),
    saveKey: () => moduleSaveKey(pkg.id, entryPointId, artifactId),
    isConsumed: (eventId: number) => state?.eventRuntime.isConsumed(eventId) ?? false,
    eventState: () => state?.eventRuntime.snapshot() ?? null,
    combatLaunching: () => state?.combatLaunching ?? false,
    monsterSource: () => state?.monsterSource ?? null,
    itemSource: () => state?.itemSource ? {
      itemDat: { ...state.itemSource.itemDat },
      itemsDat: { ...state.itemSource.itemsDat },
    } : null,
    treasureReceipts: () => state?.treasureReceipts.map((receipt) => ({
      ...receipt,
      items: receipt.items.map((item) => ({
        ...item,
        ...(item.source ? {
          source: {
            ...item.source,
            nameCodes: [...item.source.nameCodes],
            raw: [...item.source.raw],
            base: { ...item.source.base, raw: [...item.source.base.raw] },
          },
        } : {}),
      })),
    })) ?? [],
    automapVisitedCount: () => state?.automap.visitedCount ?? 0,
    openCompanion: (tab?: CompanionTab) => { openCompanion(tab); return isCompanionOpen(); },
    companionOpen: () => isCompanionOpen(),
    // M11.S4 — the imported-art panel.
    artFrameCount: () => state?.art?.frames.length ?? 0,
    artIndex: () => state?.art?.index ?? -1,
    artStep: (delta: number) => artStep(delta),
    artDims: () => {
      if (!state?.art) return null;
      const im = state.art.frames[state.art.index].image;
      return { w: im.width, h: im.height };
    },
    // Distinct colours in the painted canvas — proves the art actually decoded and rendered
    // (not just that the frame metadata survived the round trip). Mirrors dqkExplore.ts's
    // artDistinctColors seam.
    artDistinctColors: () => {
      if (!state?.art) return 0;
      const ctx = state.art.canvas.getContext('2d');
      if (!ctx) return 0;
      const { width, height } = state.art.canvas;
      if (width === 0 || height === 0) return 0;
      const data = ctx.getImageData(0, 0, width, height).data;
      const set = new Set<number>();
      for (let i = 0; i < data.length; i += 4) set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return set.size;
    },
  };

  window.addEventListener('keydown', onKey);

  (window as unknown as { __rendered: number }).__rendered = map.cells.length;
  return map.cells.length;
}
