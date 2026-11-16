/**
 * Whole-module validation for portable `.gbmod` packages.
 *
 * `deserializeModulePackage` deliberately performs a cheap outer package-shape check plus
 * embedded-art conversion-structure checks, not exhaustive semantic, metadata or base64 validation.
 * `loadModule` historically stopped at the first loader/compiler error. Authoring and Library
 * import need a non-mutating, exhaustive report instead: every finding has a stable code, severity,
 * and JSON-style location, and no invalid value is repaired or reordered behind the user's back.
 */
import { BASE_ITEMS } from '../items/baseItems.js';
import { DIRECTIONS, type Direction } from '../model/index.js';
import { defaultRulesets } from '../ruleset/index.js';
import type { RulesetRegistry } from '../ruleset/registry.js';
import { compileModuleEvent } from './eventCompiler.js';
import type { ModuleEvent } from './types.js';

export type ModuleValidationSeverity = 'error' | 'warning';

export interface ModuleValidationDiagnostic {
  /** Stable machine-readable identifier. UI copy may change without changing this code. */
  code: string;
  severity: ModuleValidationSeverity;
  /** JSON-style location rooted at `$`, for example `$.maps[0].events[2].body.chainTo`. */
  path: string;
  message: string;
}

export interface ModuleValidationReport {
  ok: boolean;
  diagnostics: ModuleValidationDiagnostic[];
  errors: ModuleValidationDiagnostic[];
  warnings: ModuleValidationDiagnostic[];
}

export interface CompleteCampaignValidationOptions {
  /** Package entrypoint to analyse. Defaults to the first declared entrypoint. */
  entryPointId?: number;
}

export interface ModuleValidationOptions {
  /** Registry used to resolve `pkg.ruleset`; defaults to all built-in rulesets. */
  registry?: RulesetRegistry;
  /** Enables P6's one-map complete-campaign graph contract in addition to base package checks. */
  completeCampaign?: boolean | CompleteCampaignValidationOptions;
}

export interface ModuleEventTarget {
  target: number;
  path: string;
  role:
    | 'chain'
    | 'choice'
    | 'victory'
    | 'defeat'
    | 'flee'
    | 'true'
    | 'false';
}

const TEXT_TYPES: ReadonlySet<string> = new Set([
  'message', 'damage', 'trainingHall', 'tavern', 'shop', 'temple', 'guidedTour',
  'addNpc', 'npcSays', 'sounds', 'smallTown', 'vault', 'combatTreasure', 'gainExperience',
  'passTime', 'camp', 'removeNpc', 'tavernTales', 'specialItems',
]);
const CHOICE_TYPES: ReadonlySet<string> = new Set([
  'stairs', 'questionButton', 'transferModule', 'whoTries', 'whoPays', 'enterPassword',
  'questionList', 'teleporter', 'questStage', 'questionYesNo', 'encounter',
]);
const COMBAT_TYPES: ReadonlySet<string> = new Set(['combat', 'pickOneCombat']);
const EVENT_TYPES: ReadonlySet<string> = new Set([
  ...TEXT_TYPES, 'giveTreasure', ...CHOICE_TYPES, ...COMBAT_TYPES, 'utilities', 'chain',
]);
const ITEM_KINDS = new Set(['weapon', 'armor', 'shield', 'ammo', 'misc']);
const COMPARE_OPS = new Set(['eq', 'ne', 'lt', 'gt', 'le', 'ge']);
const DIRECTIONS_SET = new Set<string>(DIRECTIONS);
const COMBAT_SURPRISE = new Set(['none', 'party', 'monsters', 'reserved']);
const COMBAT_DISTANCE = new Set(['upClose', 'nearby', 'farAway', 'reserved']);
const SPELL_CLASSES = new Set(['cleric', 'magicUser']);
const SPELL_EFFECT_KINDS = new Set(['heal', 'cure', 'revive', 'damage', 'buff', 'utility']);
const SPELL_TARGET_MODES = new Set(['ally', 'allyGroup', 'self', 'enemy', 'enemyGroup', 'none']);
const ABILITY_KEYS = new Set(['str', 'int', 'wis', 'dex', 'con', 'cha']);

// Portable authored combat expands every group eagerly before the tactical overlay starts. Keep
// that work comfortably finite while retaining the complete FRUA source envelope (six groups of
// at most 31 creatures = 186) and substantial authored headroom. HP retains the engine's existing
// 5,000-HP stress fixture while stopping effectively unbounded manual fights; XP uses a signed
// 32-bit ceiling so a maximum-size roster still sums exactly in JavaScript.
const MAX_COMBAT_GROUPS = 64;
const MAX_COMBATANTS = 256;
const MAX_AUTHORED_MONSTER_HP = 0xffff;
const MAX_AUTHORED_MONSTER_XP = 0x7fffffff;
const ASSET_KINDS = new Set([
  'bigpic', 'pic', 'cpic', 'back', 'sprite', 'comspr', 'tile8x8', 'walldef', 'title',
  'frame-ui', 'topview', 'cbody', 'chead', 'cursor', 'sky', 'unknown',
]);

type JsonRecord = Record<string, unknown>;

/** Reject malformed JSON-decoded strings containing an unpaired UTF-16 surrogate. Browser storage
 * encoders require a Unicode scalar sequence; accepting such an id here would let a package pass
 * validation and then fail only when the user first tried to save it. */
function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

interface EventInfo {
  event: ModuleEvent;
  mapIndex: number;
  eventIndex: number;
  path: string;
  targets: ModuleEventTarget[];
}

interface MapInfo {
  map: JsonRecord;
  mapIndex: number;
  path: string;
  width?: number;
  height?: number;
  cells: unknown[];
  entries: unknown[];
  events: unknown[];
}

interface EntryPointInfo {
  id: number;
  mapIndex: number;
  entryId: number;
  path: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isByte(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0 && value <= 0xff;
}

function isInt16(value: unknown): value is number {
  return isSafeInteger(value) && value >= -0x8000 && value <= 0x7fff;
}

function isDamageDice(value: unknown, allowZero: boolean): boolean {
  if (!isRecord(value) || !isByte(value.count) || !isByte(value.sides) || !isInt16(value.bonus)) {
    return false;
  }
  return allowZero || (value.count > 0 && value.sides > 0);
}

function isAuthoredMonsterSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value.format !== 'string' || value.format.trim().length === 0 ||
      !isSafeInteger(value.recordId) || value.recordId < 0 ||
      typeof value.sourceName !== 'string' || value.sourceName.trim().length === 0 ||
      (value.memberIndex !== undefined && (!isSafeInteger(value.memberIndex) || value.memberIndex < 0))) {
    return false;
  }
  if (value.overrides !== undefined) {
    const overrides = value.overrides;
    if (!isRecord(overrides) || typeof overrides.sourceName !== 'string' ||
        overrides.sourceName.trim().length === 0 ||
        (overrides.memberIndex !== undefined &&
          (!isSafeInteger(overrides.memberIndex) || overrides.memberIndex < 0))) return false;
  }
  if (value.attacks !== undefined && (!Array.isArray(value.attacks) ||
      !value.attacks.every((attack) => isRecord(attack) && isByte(attack.attacksPerTwoRounds) &&
        isDamageDice(attack.damage, true)))) return false;
  if (value.carriedItems !== undefined && (!Array.isArray(value.carriedItems) ||
      !value.carriedItems.every((item) => isRecord(item) && isByte(item.recordIndex) &&
        isByte(item.itemId) && item.itemId > 0 && isByte(item.quantityCode)))) return false;
  return value.specialAbilityCodes === undefined || (
    Array.isArray(value.specialAbilityCodes) && value.specialAbilityCodes.every(isByte)
  );
}

function positiveId(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isValidUnsupportedMetadata(value: unknown): value is JsonRecord {
  return isRecord(value) &&
    typeof value.sourceFormat === 'string' && value.sourceFormat.trim().length > 0 &&
    positiveId(value.sourceEventSlot) &&
    isSafeInteger(value.sourceType) && value.sourceType >= 1 && value.sourceType <= 39 &&
    typeof value.sourceTypeName === 'string' && value.sourceTypeName.trim().length > 0;
}

function targetValues(event: ModuleEvent, eventPath: string): ModuleEventTarget[] {
  if (isValidUnsupportedMetadata(event.unsupported) || !isRecord(event.body)) return [];
  const body = event.body as unknown as JsonRecord;
  const out: ModuleEventTarget[] = [];
  const add = (value: unknown, path: string, role: ModuleEventTarget['role']): void => {
    if (positiveId(value)) out.push({ target: value, path, role });
  };
  if (TEXT_TYPES.has(event.type) || event.type === 'giveTreasure' || event.type === 'chain') {
    add(body.chainTo, `${eventPath}.body.chainTo`, 'chain');
  } else if (CHOICE_TYPES.has(event.type)) {
    const options = body.options;
    if (Array.isArray(options)) options.forEach((option, index) => {
      if (isRecord(option)) add(option.chainTo, `${eventPath}.body.options[${index}].chainTo`, 'choice');
    });
  } else if (COMBAT_TYPES.has(event.type)) {
    add(body.onVictory, `${eventPath}.body.onVictory`, 'victory');
    add(body.onDefeat, `${eventPath}.body.onDefeat`, 'defeat');
    add(body.onFlee, `${eventPath}.body.onFlee`, 'flee');
  } else if (event.type === 'utilities' && isRecord(body.compare)) {
    add(body.compare.onTrue, `${eventPath}.body.compare.onTrue`, 'true');
    add(body.compare.onFalse, `${eventPath}.body.compare.onFalse`, 'false');
  }
  return out;
}

/** Return every positive, structurally present outgoing event edge in source order. */
export function moduleEventTargets(event: ModuleEvent, path = '$.event'): ModuleEventTarget[] {
  return targetValues(event, path);
}

/** Validate a complete portable module without mutating it or stopping at the first error. */
export function validateModulePackage(
  value: unknown,
  options: ModuleValidationOptions = {},
): ModuleValidationReport {
  const diagnostics: ModuleValidationDiagnostic[] = [];
  const add = (
    code: string,
    severity: ModuleValidationSeverity,
    path: string,
    message: string,
  ): void => {
    diagnostics.push({ code, severity, path, message });
  };

  if (!isRecord(value)) {
    add('package.not_object', 'error', '$', 'Module package must be an object.');
    return finishReport(diagnostics);
  }
  const pkg = value;
  if (pkg.schema !== 1) add('package.schema', 'error', '$.schema', 'Module package schema must be 1.');
  if (typeof pkg.id !== 'string' || pkg.id.trim().length === 0) {
    add('package.id', 'error', '$.id', 'Module package id must be a non-empty string.');
  } else if (!isWellFormedUtf16(pkg.id)) {
    add(
      'package.id_unicode',
      'error',
      '$.id',
      'Module package id must contain well-formed Unicode text (no unpaired UTF-16 surrogates).',
    );
  }
  if (typeof pkg.title !== 'string' || pkg.title.trim().length === 0) {
    add('package.title', 'error', '$.title', 'Module package title must be a non-empty string.');
  }
  if (typeof pkg.ruleset !== 'string' || pkg.ruleset.trim().length === 0) {
    add('package.ruleset', 'error', '$.ruleset', 'Module package ruleset must be a non-empty string.');
  } else {
    const registry = options.registry ?? defaultRulesets();
    if (!registry.get(pkg.ruleset)) {
      add('package.ruleset_unknown', 'error', '$.ruleset', `Unknown ruleset ${JSON.stringify(pkg.ruleset)}.`);
    }
  }

  const monsterIds = new Set<number>();
  const authoredItemIds = new Set<number>();
  validateDatabase(pkg.databases, add, monsterIds, authoredItemIds);
  validateGraphicSets(pkg.graphicSets, add);
  const availableItemIds = new Set<number>([
    ...Object.keys(BASE_ITEMS).map(Number).filter(Number.isSafeInteger),
    ...authoredItemIds,
  ]);

  const mapInfos: MapInfo[] = [];
  if (!Array.isArray(pkg.maps) || pkg.maps.length === 0) {
    add('package.maps', 'error', '$.maps', 'Module package must contain at least one map.');
  } else {
    pkg.maps.forEach((rawMap, mapIndex) => {
      const path = `$.maps[${mapIndex}]`;
      if (!isRecord(rawMap)) {
        add('map.shape', 'error', path, 'Map must be an object.');
        return;
      }
      const info: MapInfo = {
        map: rawMap,
        mapIndex,
        path,
        cells: Array.isArray(rawMap.cells) ? rawMap.cells : [],
        entries: Array.isArray(rawMap.entries) ? rawMap.entries : [],
        events: Array.isArray(rawMap.events) ? rawMap.events : [],
      };
      mapInfos.push(info);
      if (typeof rawMap.name !== 'string' || rawMap.name.trim().length === 0) {
        add('map.name', 'error', `${path}.name`, 'Map name must be a non-empty string.');
      }
      if (!positiveId(rawMap.width) || !positiveId(rawMap.height) ||
          !Number.isSafeInteger(rawMap.width * rawMap.height)) {
        add('map.dimensions', 'error', path, 'Map width and height must be positive safe integers.');
      } else {
        info.width = rawMap.width;
        info.height = rawMap.height;
      }
      if (!Array.isArray(rawMap.cells)) {
        add('map.cells', 'error', `${path}.cells`, 'Map cells must be an array.');
      } else if (info.width !== undefined && info.height !== undefined &&
          rawMap.cells.length !== info.width * info.height) {
        add(
          'map.cell_count', 'error', `${path}.cells`,
          `Map has ${rawMap.cells.length} cells; expected ${info.width * info.height}.`,
        );
      }
      if (!Array.isArray(rawMap.entries)) {
        add('map.entries', 'error', `${path}.entries`, 'Map entries must be an array.');
      }
      if (!Array.isArray(rawMap.events)) {
        add('map.events', 'error', `${path}.events`, 'Map events must be an array.');
      }
      validateCells(info, add);
      validateEntries(info, add);
    });
  }

  validateSourceWarnings(pkg.sourceWarnings, mapInfos, add);

  const eventOwners = new Map<number, EventInfo>();
  const eventInfos: EventInfo[] = [];
  for (const info of mapInfos) {
    info.events.forEach((rawEvent, eventIndex) => {
      const path = `${info.path}.events[${eventIndex}]`;
      if (!isRecord(rawEvent)) {
        add('event.shape', 'error', path, 'Event must be an object.');
        return;
      }
      if (!positiveId(rawEvent.id)) {
        add('event.id', 'error', `${path}.id`, 'Event id must be a positive safe integer.');
        return;
      }
      const existing = eventOwners.get(rawEvent.id);
      if (existing) {
        add(
          'event.duplicate_id', 'error', `${path}.id`,
          `Event id ${rawEvent.id} is already declared at ${existing.path}.`,
        );
        return;
      }
      if (typeof rawEvent.type !== 'string' || !EVENT_TYPES.has(rawEvent.type)) {
        add('event.type', 'error', `${path}.type`, `Unknown module event type ${JSON.stringify(rawEvent.type)}.`);
      }
      if (!isRecord(rawEvent.body)) {
        add('event.body', 'error', `${path}.body`, 'Event body must be an object.');
      }
      if (rawEvent.onceOnly !== undefined && typeof rawEvent.onceOnly !== 'boolean') {
        add('event.once_only', 'error', `${path}.onceOnly`, 'onceOnly must be boolean when present.');
      }
      const event = rawEvent as unknown as ModuleEvent;
      const eventInfo: EventInfo = {
        event,
        mapIndex: info.mapIndex,
        eventIndex,
        path,
        targets: [],
      };
      eventOwners.set(rawEvent.id, eventInfo);
      eventInfos.push(eventInfo);
      if (rawEvent.unsupported !== undefined &&
          !validateUnsupportedMetadata(rawEvent.unsupported, `${path}.unsupported`, add)) {
        // Invalid provenance is not an executable exemption. Continue through normal body and
        // compiler validation so `{ unsupported: {} }` cannot bless an arbitrary placeholder.
      } else if (rawEvent.unsupported !== undefined) {
        add(
          'event.unsupported_source', 'warning', `${path}.unsupported`,
          unsupportedMessage(rawEvent.unsupported),
        );
        return;
      }
      const errorsBeforeBody = diagnostics.filter((d) => d.severity === 'error').length;
      validateEventBody(event, path, add, monsterIds, availableItemIds);
      eventInfo.targets = targetValues(event, path);
      const errorsAfterBody = diagnostics.filter((d) => d.severity === 'error').length;
      if (errorsAfterBody === errorsBeforeBody && EVENT_TYPES.has(rawEvent.type as string)) {
        try {
          compileModuleEvent(event, { encodeChainTarget: () => 1 });
        } catch (error) {
          add(
            'event.compile', 'error', path,
            `Event cannot compile: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });
  }

  for (const info of eventInfos) {
    for (const target of info.targets) {
      const owner = eventOwners.get(target.target);
      if (!owner) {
        add('event.target_dangling', 'error', target.path, `Event target ${target.target} does not exist.`);
      } else if (owner.mapIndex !== info.mapIndex) {
        add(
          'event.target_cross_map', 'error', target.path,
          `Event target ${target.target} belongs to map ${owner.mapIndex}, not map ${info.mapIndex}.`,
        );
      }
    }
  }
  validateCellEventLinks(mapInfos, eventOwners, add);

  const entryPoints = validateEntryPoints(pkg.entrypoints, mapInfos, add);
  warnMapsWithoutEntryPoints(mapInfos, entryPoints, add);
  warnUnreachableEvents(mapInfos, entryPoints, eventInfos, eventOwners, add);

  if (options.completeCampaign) {
    const campaignOptions = options.completeCampaign === true ? {} : options.completeCampaign;
    validateCompleteCampaign(
      mapInfos,
      entryPoints,
      eventOwners,
      eventInfos,
      campaignOptions,
      add,
    );
  }

  return finishReport(diagnostics);
}

function finishReport(diagnostics: ModuleValidationDiagnostic[]): ModuleValidationReport {
  const errors = diagnostics.filter((finding) => finding.severity === 'error');
  const warnings = diagnostics.filter((finding) => finding.severity === 'warning');
  return { ok: errors.length === 0, diagnostics, errors, warnings };
}

function unsupportedMessage(value: unknown): string {
  if (!isRecord(value)) return 'Event retains an unsupported source boundary.';
  const format = typeof value.sourceFormat === 'string' ? value.sourceFormat : 'source';
  const slot = isSafeInteger(value.sourceEventSlot) ? ` event ${value.sourceEventSlot}` : ' event';
  const type = typeof value.sourceTypeName === 'string' ? ` (${value.sourceTypeName})` : '';
  return `${format}${slot}${type} is retained but not executable.`;
}

function validateUnsupportedMetadata(
  value: unknown,
  path: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): boolean {
  if (isValidUnsupportedMetadata(value)) return true;
  add(
    'event.unsupported_metadata', 'error', path,
    'Unsupported source metadata requires a non-empty format/name, a positive event slot, and a FRUA type in 1-39.',
  );
  return false;
}

function validateSourceWarnings(
  value: unknown,
  maps: MapInfo[],
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add('source.warnings_shape', 'error', '$.sourceWarnings', 'Source warnings must be an array.');
    return;
  }
  value.forEach((rawWarning, index) => {
    const path = `$.sourceWarnings[${index}]`;
    if (!isRecord(rawWarning)) {
      add('source.warning_shape', 'error', path, 'Source warning must be an object.');
      return;
    }
    const codeValid = typeof rawWarning.code === 'string' &&
      /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/.test(rawWarning.code);
    const messageValid = typeof rawWarning.message === 'string' && rawWarning.message.trim().length > 0;
    const formatValid = typeof rawWarning.sourceFormat === 'string' && rawWarning.sourceFormat.trim().length > 0;
    const mapIndexValid = rawWarning.mapIndex === undefined ||
      (isSafeInteger(rawWarning.mapIndex) && rawWarning.mapIndex >= 0 && rawWarning.mapIndex < maps.length);
    const sourceMapValid = rawWarning.sourceMap === undefined ||
      (typeof rawWarning.sourceMap === 'string' && rawWarning.sourceMap.trim().length > 0);
    const sourceEventIdValid = rawWarning.sourceEventId === undefined || positiveId(rawWarning.sourceEventId);
    if (!codeValid || !messageValid || !formatValid || !mapIndexValid ||
        !sourceMapValid || !sourceEventIdValid) {
      add(
        'source.warning_shape', 'error', path,
        'Source warning requires a stable dotted code, non-empty message/format, and valid optional source location.',
      );
      return;
    }
    add(rawWarning.code as string, 'warning', path, rawWarning.message as string);
  });
}

function validateGraphicSets(
  value: unknown,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add('graphic_sets.shape', 'error', '$.graphicSets', 'graphicSets must be an array of decoded frame sets.');
    return;
  }
  value.forEach((rawSet, setIndex) => {
    const path = `$.graphicSets[${setIndex}]`;
    if (!isRecord(rawSet) || typeof rawSet.name !== 'string' || rawSet.name.trim().length === 0 ||
        typeof rawSet.kind !== 'string' || !ASSET_KINDS.has(rawSet.kind) || !(rawSet.frames instanceof Map)) {
      add(
        'graphic_sets.frame_set', 'error', path,
        'Frame set requires a non-empty name, known asset kind, and a Map of decoded frames.',
      );
      return;
    }
    for (const [rawFrameId, rawImage] of rawSet.frames as Map<unknown, unknown>) {
      const framePath = `${path}.frames[${JSON.stringify(rawFrameId)}]`;
      if (!isSafeInteger(rawFrameId) || rawFrameId < 0 || !isRecord(rawImage)) {
        add('graphic_sets.frame', 'error', framePath, 'Frame id must be non-negative and image must be an object.');
        continue;
      }
      const pixelCount = positiveId(rawImage.width) && positiveId(rawImage.height) &&
        Number.isSafeInteger(rawImage.width * rawImage.height)
        ? rawImage.width * rawImage.height
        : -1;
      const paletteValid = rawImage.palette === null || (
        isRecord(rawImage.palette) && Array.isArray(rawImage.palette.colors) &&
        typeof rawImage.palette.source === 'string'
      );
      if (pixelCount < 0 || !(rawImage.indices instanceof Uint8Array) ||
          rawImage.indices.byteLength !== pixelCount || !isSafeInteger(rawImage.xOffset) ||
          !isSafeInteger(rawImage.yOffset) ||
          !(rawImage.transparentIndex === null || isByte(rawImage.transparentIndex)) ||
          !paletteValid || (rawImage.encoding !== undefined && typeof rawImage.encoding !== 'string')) {
        add(
          'graphic_sets.image', 'error', framePath,
          'Decoded image dimensions, pixels, offsets, transparency, or palette are invalid.',
        );
      }
    }
  });
}

function validateDatabase(
  value: unknown,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
  monsterIds: Set<number>,
  itemIds: Set<number>,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add('database.shape', 'error', '$.databases', 'Module database must be an object.');
    return;
  }
  const categories = ['monsters', 'items', 'spells', 'classes', 'races'] as const;
  for (const category of categories) {
    if (!Array.isArray(value[category])) {
      add('database.category', 'error', `$.databases.${category}`, `${category} must be an array.`);
    }
  }
  const monsters = Array.isArray(value.monsters) ? value.monsters : [];
  monsters.forEach((rawMonster, index) => {
    const path = `$.databases.monsters[${index}]`;
    if (!isRecord(rawMonster)) {
      add('database.monster', 'error', path, 'Monster must be an object.');
      return;
    }
    if (!positiveId(rawMonster.id)) {
      add('database.monster_id', 'error', `${path}.id`, 'Monster id must be a positive safe integer.');
    } else if (monsterIds.has(rawMonster.id)) {
      add('database.monster_duplicate', 'error', `${path}.id`, `Duplicate monster id ${rawMonster.id}.`);
    } else {
      monsterIds.add(rawMonster.id);
    }
    if (typeof rawMonster.name !== 'string' || rawMonster.name.trim().length === 0 ||
        !isSafeInteger(rawMonster.armorClass) || !isSafeInteger(rawMonster.thac0)) {
      add('database.monster_fields', 'error', path, 'Monster combat fields are incomplete or invalid.');
    }
    if (!positiveId(rawMonster.hitPoints) || rawMonster.hitPoints > MAX_AUTHORED_MONSTER_HP) {
      add(
        'database.monster_hit_points', 'error', `${path}.hitPoints`,
        `Monster hitPoints must be an integer in 1-${MAX_AUTHORED_MONSTER_HP}.`,
      );
    }
    if (!isSafeInteger(rawMonster.xp) || rawMonster.xp < 0 || rawMonster.xp > MAX_AUTHORED_MONSTER_XP) {
      add(
        'database.monster_xp', 'error', `${path}.xp`,
        `Monster xp must be an integer in 0-${MAX_AUTHORED_MONSTER_XP}.`,
      );
    }
    if (!isDamageDice(rawMonster.damage, false)) {
      add(
        'database.monster_damage', 'error', `${path}.damage`,
        'Monster damage must use 1-255 dice with 1-255 sides and a signed 16-bit bonus.',
      );
    }
    if (rawMonster.morale !== undefined &&
        (!isSafeInteger(rawMonster.morale) || rawMonster.morale < 0 || rawMonster.morale > 102)) {
      add('database.monster_morale', 'error', `${path}.morale`, 'Monster morale must be an integer from 0 to 102.');
    }
    if (rawMonster.combatSize !== undefined && rawMonster.combatSize !== 1 && rawMonster.combatSize !== 2) {
      add('database.monster_combat_size', 'error', `${path}.combatSize`, 'Monster combatSize must be 1 or 2.');
    }
    if (rawMonster.source !== undefined && !isAuthoredMonsterSource(rawMonster.source)) {
      add(
        'database.monster_source', 'error', `${path}.source`,
        'Monster source provenance or its retained attacks/items/ability codes are invalid.',
      );
    }
  });
  const items = Array.isArray(value.items) ? value.items : [];
  items.forEach((rawItem, index) => {
    const path = `$.databases.items[${index}]`;
    if (!isRecord(rawItem)) {
      add('database.item', 'error', path, 'Item must be an object.');
      return;
    }
    if (!positiveId(rawItem.id)) {
      add('database.item_id', 'error', `${path}.id`, 'Item id must be a positive safe integer.');
    } else if (itemIds.has(rawItem.id)) {
      add('database.item_duplicate', 'error', `${path}.id`, `Duplicate authored item id ${rawItem.id}.`);
    } else {
      itemIds.add(rawItem.id);
    }
    if (typeof rawItem.name !== 'string' || rawItem.name.trim().length === 0 ||
        typeof rawItem.kind !== 'string' || !ITEM_KINDS.has(rawItem.kind) ||
        typeof rawItem.weightTenths !== 'number' || !Number.isFinite(rawItem.weightTenths) ||
        rawItem.weightTenths < 0) {
      add('database.item_fields', 'error', path, 'Authored item fields are incomplete or invalid.');
    }
  });

  const spellIds = new Set<string>();
  const spells = Array.isArray(value.spells) ? value.spells : [];
  spells.forEach((rawSpell, index) => {
    const path = `$.databases.spells[${index}]`;
    if (!isRecord(rawSpell)) {
      add('database.spell', 'error', path, 'Spell must be an object.');
      return;
    }
    const idValid = typeof rawSpell.id === 'string' && rawSpell.id.trim().length > 0;
    if (!idValid) {
      add('database.spell_id', 'error', `${path}.id`, 'Spell id must be a non-empty string.');
    } else if (spellIds.has(rawSpell.id as string)) {
      add('database.spell_duplicate', 'error', `${path}.id`, `Duplicate authored spell id ${JSON.stringify(rawSpell.id)}.`);
    } else {
      spellIds.add(rawSpell.id as string);
    }
    if (typeof rawSpell.name !== 'string' || rawSpell.name.trim().length === 0) {
      add('database.spell_name', 'error', `${path}.name`, 'Spell name must be a non-empty string.');
    }
    if (typeof rawSpell.class !== 'string' || !SPELL_CLASSES.has(rawSpell.class)) {
      add('database.spell_class', 'error', `${path}.class`, 'Spell class must be cleric or magicUser.');
    }
    if (!isSafeInteger(rawSpell.level) || rawSpell.level < 1 || rawSpell.level > 5) {
      add('database.spell_level', 'error', `${path}.level`, 'Spell level must be an integer from 1 to 5.');
    }
    validateSpellEffect(rawSpell.effect, `${path}.effect`, add);
  });

  const authoredClassIds = new Set<string>();
  const classes = Array.isArray(value.classes) ? value.classes : [];
  classes.forEach((rawClass, index) => {
    const path = `$.databases.classes[${index}]`;
    if (!isRecord(rawClass)) {
      add('database.class', 'error', path, 'Class must be an object.');
      return;
    }
    const idValid = typeof rawClass.id === 'string' && rawClass.id.trim().length > 0;
    if (!idValid) {
      add('database.class_id', 'error', `${path}.id`, 'Class id must be a non-empty string.');
    } else if (authoredClassIds.has(rawClass.id as string)) {
      add('database.class_duplicate', 'error', `${path}.id`, `Duplicate authored class id ${JSON.stringify(rawClass.id)}.`);
    } else {
      authoredClassIds.add(rawClass.id as string);
    }
    if (typeof rawClass.name !== 'string' || rawClass.name.trim().length === 0) {
      add('database.class_name', 'error', `${path}.name`, 'Class name must be a non-empty string.');
    }
    if (!isByte(rawClass.hitDie) || rawClass.hitDie === 0) {
      add('database.class_hit_die', 'error', `${path}.hitDie`, 'Class hitDie must be an integer from 1 to 255.');
    }
    validateAbilityList(rawClass.primeRequisite, `${path}.primeRequisite`, 'database.class_prime_requisite', add);
  });

  const raceIds = new Set<string>();
  const races = Array.isArray(value.races) ? value.races : [];
  races.forEach((rawRace, index) => {
    const path = `$.databases.races[${index}]`;
    if (!isRecord(rawRace)) {
      add('database.race', 'error', path, 'Race must be an object.');
      return;
    }
    const idValid = typeof rawRace.id === 'string' && rawRace.id.trim().length > 0;
    if (!idValid) {
      add('database.race_id', 'error', `${path}.id`, 'Race id must be a non-empty string.');
    } else if (raceIds.has(rawRace.id as string)) {
      add('database.race_duplicate', 'error', `${path}.id`, `Duplicate authored race id ${JSON.stringify(rawRace.id)}.`);
    } else {
      raceIds.add(rawRace.id as string);
    }
    if (typeof rawRace.name !== 'string' || rawRace.name.trim().length === 0) {
      add('database.race_name', 'error', `${path}.name`, 'Race name must be a non-empty string.');
    }
    validateRaceAbilities(rawRace.minAbilities, `${path}.minAbilities`, add);
    validateAllowedClasses(rawRace.allowedClasses, `${path}.allowedClasses`, add);
  });
}

function validateSpellEffect(
  value: unknown,
  path: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  if (!isRecord(value)) {
    add('database.spell_effect', 'error', path, 'Spell effect must be an object.');
    return;
  }
  if (typeof value.kind !== 'string' || !SPELL_EFFECT_KINDS.has(value.kind)) {
    add('database.spell_effect_kind', 'error', `${path}.kind`, 'Spell effect kind is unknown.');
  }
  if (typeof value.target !== 'string' || !SPELL_TARGET_MODES.has(value.target)) {
    add('database.spell_effect_target', 'error', `${path}.target`, 'Spell target mode is unknown.');
  }
  if (typeof value.campCastable !== 'boolean') {
    add('database.spell_effect_camp_castable', 'error', `${path}.campCastable`, 'campCastable must be boolean.');
  }
  if (value.dice !== undefined) {
    if (!isDamageDice(value.dice, true) ||
        (isRecord(value.dice) && value.dice.perLevel !== undefined && typeof value.dice.perLevel !== 'boolean')) {
      add(
        'database.spell_effect_dice', 'error', `${path}.dice`,
        'Spell dice require count/sides in 0-255, a signed 16-bit bonus, and optional boolean perLevel.',
      );
    }
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    add('database.spell_effect_note', 'error', `${path}.note`, 'Spell effect note must be a string when present.');
  }
}

function validateAbilityList(
  value: unknown,
  path: string,
  code: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add(code, 'error', path, 'Ability list must be an array.');
    return;
  }
  const seen = new Set<string>();
  value.forEach((ability, index) => {
    const abilityPath = `${path}[${index}]`;
    if (typeof ability !== 'string' || !ABILITY_KEYS.has(ability)) {
      add(code, 'error', abilityPath, 'Ability must be one of str/int/wis/dex/con/cha.');
    } else if (seen.has(ability)) {
      add(code, 'error', abilityPath, `Duplicate ability ${JSON.stringify(ability)}.`);
    } else {
      seen.add(ability);
    }
  });
}

function validateRaceAbilities(
  value: unknown,
  path: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    add('database.race_min_abilities', 'error', path, 'Race minAbilities must be an object.');
    return;
  }
  for (const [ability, score] of Object.entries(value)) {
    const abilityPath = `${path}[${JSON.stringify(ability)}]`;
    if (!ABILITY_KEYS.has(ability)) {
      add('database.race_ability', 'error', abilityPath, `Unknown ability ${JSON.stringify(ability)}.`);
    } else if (!isSafeInteger(score) || score < 1 || score > 25) {
      add('database.race_ability', 'error', abilityPath, 'Minimum ability score must be an integer from 1 to 25.');
    }
  }
}

function validateAllowedClasses(
  value: unknown,
  path: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add('database.race_allowed_classes', 'error', path, 'Race allowedClasses must be an array.');
    return;
  }
  // AuthoredRace is intentionally future/pluggable reference data. RulesetRegistry can prove a
  // package ruleset exists but cannot enumerate its class vocabulary, so opaque IDs are valid here;
  // only the string identity contract and per-race uniqueness can be checked without guessing.
  const seen = new Set<string>();
  value.forEach((classId, index) => {
    const classPath = `${path}[${index}]`;
    if (typeof classId !== 'string' || classId.trim().length === 0) {
      add('database.race_allowed_class', 'error', classPath, 'Allowed class id must be a non-empty string.');
    } else if (seen.has(classId)) {
      add('database.race_allowed_class', 'error', classPath, `Duplicate allowed class id ${JSON.stringify(classId)}.`);
    } else {
      seen.add(classId);
    }
  });
}

function validateCells(
  info: MapInfo,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  info.cells.forEach((rawCell, index) => {
    const path = `${info.path}.cells[${index}]`;
    if (!isRecord(rawCell)) {
      add('cell.shape', 'error', path, 'Map cell must be an object.');
      return;
    }
    const walls = rawCell.walls;
    if (!isRecord(walls) || DIRECTIONS.some((direction) => !isByte(walls[direction]))) {
      add('cell.walls', 'error', `${path}.walls`, 'Cell walls must provide byte values for all four directions.');
    }
    const doors = rawCell.doors;
    if (doors !== undefined && (
      !isRecord(doors) ||
      DIRECTIONS.some((direction) => !isSafeInteger(doors[direction]) ||
        (doors[direction] as number) < 0 || (doors[direction] as number) > 3)
    )) {
      add(
        'cell.doors', 'error', `${path}.doors`,
        'Cell doors must provide 2-bit values (0-3) for all four directions.',
      );
    }
    const doorsOpen = rawCell.doorsOpen;
    if (doorsOpen !== undefined && (
      !isRecord(doorsOpen) ||
      Object.entries(doorsOpen).some(([direction, open]) =>
        !DIRECTIONS_SET.has(direction) || typeof open !== 'boolean')
    )) {
      add('cell.doors_open', 'error', `${path}.doorsOpen`, 'Open-door state must contain only direction booleans.');
    }
    if (rawCell.event !== undefined && !positiveId(rawCell.event)) {
      add('cell.event_id', 'error', `${path}.event`, 'Cell event must be a positive safe integer when present.');
    }
  });
}

function validateEntries(
  info: MapInfo,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  const ids = new Set<number>();
  info.entries.forEach((rawEntry, index) => {
    const path = `${info.path}.entries[${index}]`;
    if (!isRecord(rawEntry)) {
      add('entry.shape', 'error', path, 'Map entry must be an object.');
      return;
    }
    if (!isSafeInteger(rawEntry.id) || rawEntry.id < 0) {
      add('entry.id', 'error', `${path}.id`, 'Map entry id must be a non-negative safe integer.');
    } else if (ids.has(rawEntry.id)) {
      add('entry.duplicate_id', 'error', `${path}.id`, `Duplicate map entry id ${rawEntry.id}.`);
    } else {
      ids.add(rawEntry.id);
    }
    const inBounds = info.width !== undefined && info.height !== undefined &&
      isSafeInteger(rawEntry.x) && isSafeInteger(rawEntry.y) && rawEntry.x >= 0 && rawEntry.y >= 0 &&
      rawEntry.x < info.width && rawEntry.y < info.height;
    if (!inBounds) add('entry.bounds', 'error', path, 'Map entry coordinates are outside the map.');
    if (typeof rawEntry.facing !== 'string' || !DIRECTIONS_SET.has(rawEntry.facing)) {
      add('entry.facing', 'error', `${path}.facing`, 'Map entry facing must be north/east/south/west.');
    }
  });
}

function validateEventBody(
  event: ModuleEvent,
  path: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
  monsterIds: ReadonlySet<number>,
  availableItemIds: ReadonlySet<number>,
): void {
  if (!EVENT_TYPES.has(event.type) || !isRecord(event.body)) return;
  const body = event.body as unknown as JsonRecord;
  const checkTarget = (value: unknown, targetPath: string): void => {
    if (value !== undefined && !positiveId(value)) {
      add('event.target_invalid', 'error', targetPath, 'Event target must be a positive safe integer when present.');
    }
  };
  if (TEXT_TYPES.has(event.type)) {
    if (typeof body.text !== 'string') add('event.text', 'error', `${path}.body.text`, 'Text event requires a string.');
    if (body.additionalTexts !== undefined &&
        (!Array.isArray(body.additionalTexts) || body.additionalTexts.some((text) => typeof text !== 'string'))) {
      add('event.additional_texts', 'error', `${path}.body.additionalTexts`, 'Additional texts must be a string array.');
    }
    checkTarget(body.chainTo, `${path}.body.chainTo`);
    return;
  }
  if (event.type === 'giveTreasure') {
    const integerField = (key: 'platinum' | 'gems' | 'jewelry', max: number): void => {
      const field = body[key];
      if (!isSafeInteger(field) || field < 0 || field > max) {
        add('reward.amount', 'error', `${path}.body.${key}`, `${key} must be an integer in 0-${max}.`);
      }
    };
    integerField('platinum', 0x7fffffff);
    integerField('gems', 0xffff);
    integerField('jewelry', 0xffff);
    const sourceValid = body.source === undefined || (
      isRecord(body.source) && body.source.format === 'frua' &&
      positiveId(body.source.sourceEventSlot) &&
      typeof body.source.itemDatSourceName === 'string' && body.source.itemDatSourceName.trim().length > 0 &&
      typeof body.source.itemsDatSourceName === 'string' && body.source.itemsDatSourceName.trim().length > 0
    );
    if (!sourceValid) {
      add(
        'reward.source', 'error', `${path}.body.source`,
        'Reward source requires FRUA format, a positive event slot, and both non-empty item catalogue names.',
      );
    }
    if (!Array.isArray(body.items) || body.items.length > 8 || body.items.some((id) => !isByte(id) || id === 0)) {
      add('reward.items', 'error', `${path}.body.items`, 'Reward items must contain at most eight ids in 1-255.');
    } else if (body.source === undefined || !sourceValid) {
      body.items.forEach((id, index) => {
        if (!availableItemIds.has(id as number)) {
          add(
            'reward.item_unresolved', 'error', `${path}.body.items[${index}]`,
            `Authored reward item ${id} is absent from the merged item catalogue.`,
          );
        }
      });
    }
    if (typeof body.itemsIdentified !== 'boolean') {
      add('reward.identified', 'error', `${path}.body.itemsIdentified`, 'itemsIdentified must be boolean.');
    }
    checkTarget(body.chainTo, `${path}.body.chainTo`);
    return;
  }
  if (CHOICE_TYPES.has(event.type)) {
    if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
      add('choice.prompt', 'error', `${path}.body.prompt`, 'Choice requires a non-empty prompt.');
    }
    if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 9) {
      add('choice.options', 'error', `${path}.body.options`, 'Choice requires two to nine options.');
    } else {
      body.options.forEach((rawOption, index) => {
        const optionPath = `${path}.body.options[${index}]`;
        if (!isRecord(rawOption)) {
          add('choice.option', 'error', optionPath, 'Choice option must be an object.');
          return;
        }
        if (typeof rawOption.label !== 'string' || rawOption.label.length === 0) {
          add('choice.label', 'error', `${optionPath}.label`, 'Choice option label must be non-empty.');
        }
        checkTarget(rawOption.chainTo, `${optionPath}.chainTo`);
        if (rawOption.repeatQuestion !== undefined && typeof rawOption.repeatQuestion !== 'boolean') {
          add('choice.repeat', 'error', `${optionPath}.repeatQuestion`, 'repeatQuestion must be boolean.');
        }
      });
    }
    return;
  }
  if (COMBAT_TYPES.has(event.type)) {
    if (body.source !== undefined) {
      const source = body.source;
      const booleanFields = [
        'noArt', 'outdoors', 'autoApproach', 'partyNeverDies', 'noTreasure', 'magicWorks',
      ];
      const valid = isRecord(source) && source.format === 'frua' && isByte(source.pictureId) &&
        isSafeInteger(source.moraleModifier) && source.moraleModifier >= 0 && source.moraleModifier <= 0x7f &&
        typeof source.surprise === 'string' && COMBAT_SURPRISE.has(source.surprise) &&
        typeof source.distance === 'string' && COMBAT_DISTANCE.has(source.distance) &&
        booleanFields.every((field) => typeof source[field] === 'boolean') &&
        Array.isArray(source.attackDirections) &&
        source.attackDirections.every((direction) => typeof direction === 'string' && DIRECTIONS_SET.has(direction)) &&
        new Set(source.attackDirections).size === source.attackDirections.length &&
        [0, 64, 128, 192].includes(source.turnUndeadModifierBits as number);
      if (!valid) {
        add(
          'combat.source', 'error', `${path}.body.source`,
          'FRUA combat source metadata is incomplete or contains invalid flags/directions.',
        );
      }
    }
    validateMonsterGroups(body.monsters, `${path}.body.monsters`, add, monsterIds, false);
    if (body.friendlyMonsters !== undefined) {
      validateMonsterGroups(body.friendlyMonsters, `${path}.body.friendlyMonsters`, add, monsterIds, true);
    }
    validateCombatWorkload(body.monsters, body.friendlyMonsters, `${path}.body`, add);
    if (body.intro !== undefined && typeof body.intro !== 'string') {
      add('combat.intro', 'error', `${path}.body.intro`, 'Combat intro must be a string.');
    }
    checkTarget(body.onVictory, `${path}.body.onVictory`);
    checkTarget(body.onDefeat, `${path}.body.onDefeat`);
    checkTarget(body.onFlee, `${path}.body.onFlee`);
    return;
  }
  if (event.type === 'utilities') {
    if (typeof body.op !== 'string' || !new Set(['store', 'add', 'subtract']).has(body.op)) {
      add('utilities.op', 'error', `${path}.body.op`, 'Utilities op must be store/add/subtract.');
    }
    if (!isByte(body.variable)) add('utilities.variable', 'error', `${path}.body.variable`, 'Utilities variable must be 0-255.');
    if (!isByte(body.value)) add('utilities.value', 'error', `${path}.body.value`, 'Utilities value must be 0-255.');
    if (body.compare !== undefined) {
      if (!isRecord(body.compare)) {
        add('utilities.compare', 'error', `${path}.body.compare`, 'Utilities compare must be an object.');
      } else {
        if (typeof body.compare.op !== 'string' || !COMPARE_OPS.has(body.compare.op)) {
          add('utilities.compare_op', 'error', `${path}.body.compare.op`, 'Unknown comparison operator.');
        }
        if (!isByte(body.compare.value)) {
          add('utilities.compare_value', 'error', `${path}.body.compare.value`, 'Comparison value must be 0-255.');
        }
        checkTarget(body.compare.onTrue, `${path}.body.compare.onTrue`);
        checkTarget(body.compare.onFalse, `${path}.body.compare.onFalse`);
      }
    }
    return;
  }
  checkTarget(body.chainTo, `${path}.body.chainTo`);
}

function validateMonsterGroups(
  value: unknown,
  path: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
  monsterIds: ReadonlySet<number>,
  allowEmpty: boolean,
): void {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    add('combat.groups', 'error', path, allowEmpty ? 'Monster groups must be an array.' : 'Combat needs at least one hostile group.');
    return;
  }
  value.forEach((rawGroup, index) => {
    const groupPath = `${path}[${index}]`;
    if (!isRecord(rawGroup) || !positiveId(rawGroup.monsterId) || !isByte(rawGroup.count) ||
        rawGroup.count === 0 || !isByte(rawGroup.picBlockId)) {
      add('combat.group', 'error', groupPath, 'Combat group needs monsterId>0, count 1-255, and picBlockId 0-255.');
      return;
    }
    if (!monsterIds.has(rawGroup.monsterId)) {
      add(
        'combat.monster_unresolved', 'error', `${groupPath}.monsterId`,
        `Combat monster ${rawGroup.monsterId} is absent from ModuleDatabase.monsters.`,
      );
    }
  });
}

function validateCombatWorkload(
  hostile: unknown,
  friendly: unknown,
  path: string,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  const hostileGroups = Array.isArray(hostile) ? hostile : [];
  const friendlyGroups = Array.isArray(friendly) ? friendly : [];
  const groupCount = hostileGroups.length + friendlyGroups.length;
  if (groupCount > MAX_COMBAT_GROUPS) {
    add(
      'combat.group_limit', 'error', path,
      `Combat may contain at most ${MAX_COMBAT_GROUPS} hostile and friendly group rows combined; got ${groupCount}.`,
    );
  }
  let combatants = 0;
  for (const groups of [hostileGroups, friendlyGroups]) {
    for (const rawGroup of groups) {
      if (isRecord(rawGroup) && isByte(rawGroup.count) && rawGroup.count > 0) {
        combatants += rawGroup.count;
      }
    }
  }
  if (combatants > MAX_COMBATANTS) {
    add(
      'combat.workload', 'error', path,
      `Combat may spawn at most ${MAX_COMBATANTS} hostile and friendly monsters combined; got ${combatants}.`,
    );
  }
}

function validateCellEventLinks(
  maps: MapInfo[],
  owners: ReadonlyMap<number, EventInfo>,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  for (const info of maps) info.cells.forEach((rawCell, cellIndex) => {
    if (!isRecord(rawCell) || !positiveId(rawCell.event)) return;
    const path = `${info.path}.cells[${cellIndex}].event`;
    const owner = owners.get(rawCell.event);
    if (!owner) add('cell.event_dangling', 'error', path, `Cell event ${rawCell.event} does not exist.`);
    else if (owner.mapIndex !== info.mapIndex) {
      add('cell.event_cross_map', 'error', path, `Cell event ${rawCell.event} belongs to another map.`);
    }
  });
}

function validateEntryPoints(
  value: unknown,
  maps: MapInfo[],
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): EntryPointInfo[] {
  if (!Array.isArray(value) || value.length === 0) {
    add('package.entrypoints', 'error', '$.entrypoints', 'Module package must declare at least one entrypoint.');
    return [];
  }
  const out: EntryPointInfo[] = [];
  const ids = new Set<number>();
  value.forEach((rawEntryPoint, index) => {
    const path = `$.entrypoints[${index}]`;
    if (!isRecord(rawEntryPoint)) {
      add('entrypoint.shape', 'error', path, 'Package entrypoint must be an object.');
      return;
    }
    if (!isSafeInteger(rawEntryPoint.id) || rawEntryPoint.id < 0) {
      add('entrypoint.id', 'error', `${path}.id`, 'Entrypoint id must be a non-negative safe integer.');
      return;
    }
    if (ids.has(rawEntryPoint.id)) {
      add('entrypoint.duplicate_id', 'error', `${path}.id`, `Duplicate entrypoint id ${rawEntryPoint.id}.`);
      return;
    }
    ids.add(rawEntryPoint.id);
    if (!isSafeInteger(rawEntryPoint.mapIndex) || rawEntryPoint.mapIndex < 0 ||
        !isSafeInteger(rawEntryPoint.entryId) || rawEntryPoint.entryId < 0) {
      add('entrypoint.reference', 'error', path, 'Entrypoint mapIndex/entryId must be non-negative integers.');
      return;
    }
    const map = maps.find((candidate) => candidate.mapIndex === rawEntryPoint.mapIndex);
    if (!map) {
      add('entrypoint.map_missing', 'error', `${path}.mapIndex`, `Map index ${rawEntryPoint.mapIndex} does not exist.`);
      return;
    }
    const entry = map.entries.find(
      (candidate): candidate is JsonRecord => isRecord(candidate) && candidate.id === rawEntryPoint.entryId,
    );
    if (!entry) {
      add(
        'entrypoint.entry_missing', 'error', `${path}.entryId`,
        `Map ${rawEntryPoint.mapIndex} has no entry id ${rawEntryPoint.entryId}.`,
      );
      return;
    }
    if (!isUsableMapEntry(map, entry)) {
      add(
        'entrypoint.entry_invalid', 'error', `${path}.entryId`,
        `Map ${rawEntryPoint.mapIndex} entry ${rawEntryPoint.entryId} is not a usable in-bounds entry.`,
      );
      return;
    }
    out.push({
      id: rawEntryPoint.id,
      mapIndex: rawEntryPoint.mapIndex,
      entryId: rawEntryPoint.entryId,
      path,
    });
  });
  return out;
}

function isUsableMapEntry(map: MapInfo, entry: JsonRecord): boolean {
  return map.width !== undefined && map.height !== undefined &&
    isSafeInteger(entry.id) && entry.id >= 0 &&
    isSafeInteger(entry.x) && entry.x >= 0 && entry.x < map.width &&
    isSafeInteger(entry.y) && entry.y >= 0 && entry.y < map.height &&
    typeof entry.facing === 'string' && DIRECTIONS_SET.has(entry.facing);
}

function warnMapsWithoutEntryPoints(
  maps: MapInfo[],
  entryPoints: EntryPointInfo[],
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  const mapped = new Set(entryPoints.map((entryPoint) => entryPoint.mapIndex));
  for (const map of maps) {
    if (!mapped.has(map.mapIndex)) {
      add(
        'map.unreachable', 'warning', map.path,
        `Map ${map.mapIndex} has no valid package entrypoint.`,
      );
    }
  }
}

function warnUnreachableEvents(
  maps: MapInfo[],
  entryPoints: EntryPointInfo[],
  events: EventInfo[],
  owners: ReadonlyMap<number, EventInfo>,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  for (const map of maps) {
    const reachableCells = new Set<number>();
    for (const entryPoint of entryPoints.filter((candidate) => candidate.mapIndex === map.mapIndex)) {
      const entry = map.entries.find(
        (candidate): candidate is JsonRecord => isRecord(candidate) && candidate.id === entryPoint.entryId,
      );
      if (!entry) continue;
      for (const cellIndex of reachableCellIndexes(map, entry)) reachableCells.add(cellIndex);
    }
    const roots = [...reachableCells].flatMap((cellIndex) => {
      const cell = map.cells[cellIndex];
      return isRecord(cell) && positiveId(cell.event) && owners.get(cell.event)?.mapIndex === map.mapIndex
        ? [cell.event]
        : [];
    });
    const reachable = graphReachable(roots, owners, map.mapIndex);
    for (const event of events) {
      if (event.mapIndex === map.mapIndex && !reachable.has(event.event.id)) {
        add('event.unreachable', 'warning', event.path, `Event ${event.event.id} is not reachable from a map cell.`);
      }
    }
  }
}

function graphReachable(
  roots: Iterable<number>,
  owners: ReadonlyMap<number, EventInfo>,
  mapIndex: number,
): Set<number> {
  const reached = new Set<number>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (reached.has(id)) continue;
    const info = owners.get(id);
    if (!info || info.mapIndex !== mapIndex) continue;
    reached.add(id);
    for (const target of info.targets) pending.push(target.target);
  }
  return reached;
}

function reachableCellIndexes(map: MapInfo, entry: JsonRecord): Set<number> {
  if (map.width === undefined || map.height === undefined || !isSafeInteger(entry.x) || !isSafeInteger(entry.y)) {
    return new Set();
  }
  const start = entry.y * map.width + entry.x;
  const reached = new Set<number>([start]);
  const pending = [start];
  const deltas: Record<Direction, { dx: number; dy: number }> = {
    north: { dx: 0, dy: -1 }, east: { dx: 1, dy: 0 },
    south: { dx: 0, dy: 1 }, west: { dx: -1, dy: 0 },
  };
  while (pending.length > 0) {
    const index = pending.pop()!;
    const cell = map.cells[index];
    if (!isRecord(cell) || !isRecord(cell.walls)) continue;
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    for (const direction of DIRECTIONS) {
      const wall = cell.walls[direction];
      const door = isRecord(cell.doors) ? cell.doors[direction] : undefined;
      if (wall !== 0 && door === 0) continue;
      if (wall !== 0 && door === undefined) continue;
      const nextX = x + deltas[direction].dx;
      const nextY = y + deltas[direction].dy;
      if (nextX < 0 || nextY < 0 || nextX >= map.width || nextY >= map.height) continue;
      const next = nextY * map.width + nextX;
      if (!reached.has(next)) {
        reached.add(next);
        pending.push(next);
      }
    }
  }
  return reached;
}

function isDurableTerminal(info: EventInfo | undefined): info is EventInfo {
  return info !== undefined && info.event.onceOnly === true &&
    !isValidUnsupportedMetadata(info.event.unsupported) && info.targets.length === 0 &&
    TEXT_TYPES.has(info.event.type) && isRecord(info.event.body) &&
    typeof info.event.body.text === 'string' && info.event.body.text.trim().length > 0;
}

function terminalEvents(
  roots: Iterable<number>,
  owners: ReadonlyMap<number, EventInfo>,
  mapIndex: number,
): Set<number> {
  return new Set(
    [...graphReachable(roots, owners, mapIndex)]
      .filter((id) => isDurableTerminal(owners.get(id))),
  );
}

function isQualifyingCurrencyReward(info: EventInfo | undefined): info is EventInfo {
  if (!info || info.event.type !== 'giveTreasure' || info.event.onceOnly !== true ||
      isValidUnsupportedMetadata(info.event.unsupported) || !isRecord(info.event.body)) return false;
  const body = info.event.body;
  return body.source === undefined && Array.isArray(body.items) && body.items.length === 0 &&
    isSafeInteger(body.platinum) && body.platinum >= 0 &&
    isSafeInteger(body.gems) && body.gems >= 0 &&
    isSafeInteger(body.jewelry) && body.jewelry >= 0 &&
    (body.platinum > 0 || body.gems > 0 || body.jewelry > 0);
}

/** Victory terminals that are reached after, not merely alongside, a qualifying reward. */
function rewardedVictoryTerminals(
  branchRoot: number,
  owners: ReadonlyMap<number, EventInfo>,
  mapIndex: number,
): Set<number> {
  const branch = graphReachable([branchRoot], owners, mapIndex);
  const terminals = new Set<number>();
  for (const eventId of branch) {
    const reward = owners.get(eventId);
    if (!isQualifyingCurrencyReward(reward)) continue;
    const afterReward = terminalEvents(reward.targets.map((target) => target.target), owners, mapIndex);
    for (const terminal of afterReward) terminals.add(terminal);
  }
  return terminals;
}

/** Choice edges that actually end their branch. A repeatQuestion option deliberately returns to
 * the already-consumed question after its entire target chain, so it cannot be either the campaign
 * acceptance route or its independent decline ending. */
function nonRepeatingChoiceTargets(choice: EventInfo): ModuleEventTarget[] {
  if (!isRecord(choice.event.body) || !Array.isArray(choice.event.body.options)) return [];
  const options = choice.event.body.options;
  return choice.targets.filter((target) => {
    if (target.role !== 'choice') return false;
    const match = /\.body\.options\[(\d+)\]\.chainTo$/.exec(target.path);
    const option = match ? options[Number(match[1])] : undefined;
    return !isRecord(option) || option.repeatQuestion !== true;
  });
}

function validateCompleteCampaign(
  maps: MapInfo[],
  entryPoints: EntryPointInfo[],
  owners: ReadonlyMap<number, EventInfo>,
  events: EventInfo[],
  options: CompleteCampaignValidationOptions,
  add: (code: string, severity: ModuleValidationSeverity, path: string, message: string) => void,
): void {
  if (maps.length !== 1) {
    add('campaign.map_count', 'error', '$.maps', 'Complete reference campaign must contain exactly one map.');
  }
  const selected = options.entryPointId === undefined
    ? entryPoints[0]
    : entryPoints.find((entryPoint) => entryPoint.id === options.entryPointId);
  if (!selected) {
    add('campaign.entrypoint', 'error', '$.entrypoints', 'Complete campaign entrypoint is missing or invalid.');
    return;
  }
  const map = maps.find((candidate) => candidate.mapIndex === selected.mapIndex);
  const entry = map?.entries.find((candidate) => isRecord(candidate) && candidate.id === selected.entryId);
  if (!map || !isRecord(entry)) return;
  const cellIndexes = reachableCellIndexes(map, entry);
  const startIndex = map.width === undefined ? -1 : (entry.y as number) * map.width + (entry.x as number);
  const roots = [...cellIndexes].flatMap((index) => {
    const cell = map.cells[index];
    return isRecord(cell) && positiveId(cell.event) && owners.get(cell.event)?.mapIndex === map.mapIndex
      ? [{ id: cell.event, index }]
      : [];
  });
  if (cellIndexes.size < 2 || !roots.some((root) => root.index !== startIndex)) {
    add('campaign.legal_walk', 'error', map.path, 'Campaign needs a legal walk from its entry to an event cell.');
  }
  // The campaign promise is a legal walk *to* the quest, not merely a walk to unrelated content
  // while a complete choice graph happens to sit on the starting cell. Only event roots reached
  // on a non-start cell may seed the qualifying campaign graph.
  const walkedRoots = roots.filter((root) => root.index !== startIndex).map((root) => root.id);
  const reachable = graphReachable(walkedRoots, owners, map.mapIndex);
  const reachableEvents = events.filter((event) => event.mapIndex === map.mapIndex && reachable.has(event.event.id));
  const choices = reachableEvents.filter((event) => CHOICE_TYPES.has(event.event.type));
  if (choices.length === 0) {
    add('campaign.choice_missing', 'error', map.path, 'Campaign route needs a reachable quest choice.');
  }
  const combats = reachableEvents.filter((event) => COMBAT_TYPES.has(event.event.type));
  if (combats.length === 0) {
    add('campaign.combat_missing', 'error', map.path, 'Campaign route needs a reachable combat.');
    return;
  }
  const choiceLinkedCombats = new Set<number>();
  const linkedCombatsByChoice = new Map<EventInfo, Set<EventInfo>>();
  for (const choice of choices) {
    const linked = new Set<EventInfo>();
    for (const option of nonRepeatingChoiceTargets(choice)) {
      const optionRoute = graphReachable([option.target], owners, map.mapIndex);
      for (const combat of combats) {
        if (optionRoute.has(combat.event.id)) {
          choiceLinkedCombats.add(combat.event.id);
          linked.add(combat);
        }
      }
    }
    if (linked.size > 0) linkedCombatsByChoice.set(choice, linked);
  }
  if (choices.length > 0 && choiceLinkedCombats.size === 0) {
    add(
      'campaign.choice_to_combat', 'error', map.path,
      'No reachable quest-choice option leads to a reachable combat.',
    );
  }
  const linkedChoices = [...linkedCombatsByChoice.entries()];
  if (linkedChoices.length > 0 && !linkedChoices.some(([choice]) => choice.event.onceOnly === true)) {
    add(
      'campaign.choice_once_only', 'error', `${linkedChoices[0][0].path}.onceOnly`,
      'The walked quest choice that leads to combat must be once-only.',
    );
  }
  const linkedCombatList = [...new Set(linkedChoices.flatMap(([, linked]) => [...linked]))];
  const combatsLinkedFromOnceOnlyChoice = [...new Set(
    linkedChoices
      .filter(([choice]) => choice.event.onceOnly === true)
      .flatMap(([, linked]) => [...linked]),
  )];
  const durabilityScope = combatsLinkedFromOnceOnlyChoice.length > 0
    ? combatsLinkedFromOnceOnlyChoice
    : linkedCombatList;
  if (durabilityScope.length > 0 && !durabilityScope.some((combat) => combat.event.onceOnly === true)) {
    add(
      'campaign.combat_once_only', 'error', `${durabilityScope[0].path}.onceOnly`,
      'The quest combat reached from the choice must be once-only.',
    );
  }

  // A complete quest needs an explicit refusal/decline route. It must not merely exit the choice,
  // and it must not alias any victory/defeat/flee ending of a combat option from that same choice.
  const choicesWithDistinctDecline = new Set<EventInfo>();
  let anyDeclineTerminal = false;
  for (const [choice, linked] of linkedChoices) {
    const declineTerminals = new Set<number>();
    for (const option of nonRepeatingChoiceTargets(choice)) {
      const optionRoute = graphReachable([option.target], owners, map.mapIndex);
      if (combats.some((combat) => optionRoute.has(combat.event.id))) continue;
      for (const terminal of terminalEvents([option.target], owners, map.mapIndex)) {
        declineTerminals.add(terminal);
      }
    }
    anyDeclineTerminal ||= declineTerminals.size > 0;
    const outcomeTerminals = new Set<number>();
    for (const combat of linked) {
      for (const edge of combat.targets.filter((target) =>
        target.role === 'victory' || target.role === 'defeat' || target.role === 'flee')) {
        for (const terminal of terminalEvents([edge.target], owners, combat.mapIndex)) {
          outcomeTerminals.add(terminal);
        }
      }
    }
    if (declineTerminals.size > 0 && [...declineTerminals].every((terminal) => !outcomeTerminals.has(terminal))) {
      choicesWithDistinctDecline.add(choice);
    }
  }
  if (linkedChoices.length > 0 && choicesWithDistinctDecline.size === 0) {
    add(
      anyDeclineTerminal ? 'campaign.decline_not_distinct' : 'campaign.decline_terminal',
      'error', `${linkedChoices[0][0].path}.body.options`,
      anyDeclineTerminal
        ? 'A non-combat choice option must reach its own once-only terminal, distinct from every combat outcome.'
        : 'A non-combat choice option must reach a once-only terminal text event.',
    );
  }
  const qualifyingChoiceLinkedCombats = new Set<number>();
  for (const [choice, linked] of linkedChoices) {
    if (choice.event.onceOnly !== true || !choicesWithDistinctDecline.has(choice)) continue;
    for (const combat of linked) {
      if (combat.event.onceOnly === true) qualifyingChoiceLinkedCombats.add(combat.event.id);
    }
  }
  let victoryRewardFound = false;
  for (const combat of combats) {
    const terminalsByRole = new Map<'victory' | 'defeat' | 'flee', Set<number>>();
    for (const role of ['victory', 'defeat', 'flee'] as const) {
      const edge = combat.targets.find((target) => target.role === role);
      if (!edge || !owners.has(edge.target)) {
        add('campaign.outcome_missing', 'error', `${combat.path}.body`, `Combat ${combat.event.id} needs an ${role} branch.`);
        terminalsByRole.set(role, new Set());
        continue;
      }
      const terminals = terminalEvents([edge.target], owners, combat.mapIndex);
      if (role === 'victory') {
        const orderedTerminals = rewardedVictoryTerminals(edge.target, owners, combat.mapIndex);
        victoryRewardFound ||= qualifyingChoiceLinkedCombats.has(combat.event.id) && orderedTerminals.size > 0;
      }
      terminalsByRole.set(role, terminals);
      if (terminals.size === 0) {
        add(
          'campaign.outcome_terminal', 'error', edge.path,
          `Combat ${combat.event.id} ${role} branch has no reachable once-only terminal text event.`,
        );
      }
    }
    const terminalRoles = [...terminalsByRole.entries()];
    for (let left = 0; left < terminalRoles.length; left++) {
      for (let right = left + 1; right < terminalRoles.length; right++) {
        const overlap = [...terminalRoles[left][1]].find((id) => terminalRoles[right][1].has(id));
        if (overlap !== undefined) {
          add(
            'campaign.outcome_not_distinct', 'error', combat.path,
            `Combat outcomes ${terminalRoles[left][0]} and ${terminalRoles[right][0]} share terminal event ${overlap}.`,
          );
        }
      }
    }
  }
  if (!victoryRewardFound) {
    add(
      'campaign.reward_missing', 'error', map.path,
      'At least one combat victory path must reach a once-only, positive, source-less, currency-only Give Treasure event and then a once-only terminal text event.',
    );
  }
}
