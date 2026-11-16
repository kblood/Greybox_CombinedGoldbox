/**
 * FRUA `.DSN` folder aggregation (M5.S2b). A `.DSN` design is a *folder* of files (confirmed
 * M5.S2 — see BUILD-QUEUE.md), not one importable file: `GAME001.DAT` (module settings,
 * `game001.ts`) plus one `GEOxxx.DAT` per map (`decode.ts`/`importer.ts`, M5.S2a) plus optional
 * `.TLB` art. This ties those pieces into one `ModulePackage`, so callers pass in the files
 * already read from that folder (Node `fs`, a browser File picker, a zipped upload — this module
 * does no I/O itself).
 */
import type {
  EntryPoint,
  ModuleEvent,
  ModuleMap,
  ModulePackage,
  ModuleSourceWarning,
} from '../types.js';
import type { FrameSet } from '../../model/index.js';
import { ADND1E_ID } from '../../ruleset/addnd1e/index.js';
import { parseFruaGeo } from './decode.js';
import {
  importFruaGeo,
  type FruaQuestionButtonImportReport,
  type FruaUnmappedEvent,
} from './importer.js';
import { parseFruaGame001, type FruaGame001 } from './game001.js';
import { importFruaTlb } from './tlb.js';
import { createEmptyModuleDatabase, type AuthoredMonster } from '../database.js';
import {
  decodeFruaMonsterCatalogue,
  type FruaMonsterDesignFile,
  type FruaMonsterRecord,
} from './monsters.js';
import { decodeFruaItemCatalogue, type FruaItemCatalogue } from './items.js';

/** GEOEVENT.TXT caps 100 event slots per `GEOxxx.DAT` — ample headroom to shift each map's
 * locally-numbered event ids into one globally-unique id space (`loadModule` requires unique
 * ids across the whole package; naively concatenating maps with their own 1-based slot numbers
 * would collide on every design with 2+ maps). */
const EVENT_ID_STRIDE = 1000;

export interface FruaDesignFiles {
  /** `GAME001.DAT` bytes (module settings). */
  game001: Uint8Array;
  /** `GEOxxx.DAT` bytes keyed by FRUA module number (1-40, GEODATA.TXT), sorted ascending into
   * `ModulePackage.maps`. */
  geos: Map<number, Uint8Array>;
  /** Optional `.TLB` HLIB art containers keyed by base filename (e.g. `"BIGPIC"`), imported into
   * `ModulePackage.graphicSets`. */
  tlbs?: Map<string, Uint8Array>;
  /** Exact global bestiary bytes supplied by the caller's selected UA-install capability. The
   * importer never searches for, fetches, or substitutes this file. */
  monstGlb?: Uint8Array;
  /** Provenance label for `monstGlb` (normally `DISK2/MONST.GLB`). */
  monstGlbSourceName?: string;
  /** Optional design-local `MONSTxxx.DAT` records, already read from the selected `.DSN`. */
  monsterOverrides?: FruaMonsterDesignFile[];
  /** Module-local Combat event slots independently approved by the caller's evidence gate. A
   * bestiary alone never promotes every type-1 event in an arbitrary design. */
  supportedCombatSlotsByModule?: ReadonlyMap<number, ReadonlySet<number>>;
  /** Exact global item-definition bytes from the caller's selected UA-install capability. The
   * catalogue is decoded only when both tables are supplied. */
  itemDat?: Uint8Array;
  itemsDat?: Uint8Array;
  /** Provenance labels for the supplied item tables. Both labels are required before a type-3
   * event can be promoted to executable Give Treasure behavior. */
  itemDatSourceName?: string;
  itemsDatSourceName?: string;
  /** Module-local Give Treasure slots independently approved by the caller's evidence gate. An
   * item catalogue alone never promotes every type-3 event in an arbitrary design. */
  supportedGiveTreasureSlotsByModule?: ReadonlyMap<number, ReadonlySet<number>>;
}

export interface FruaDesignImportResult {
  package: ModulePackage;
  game001: FruaGame001;
  /** FRUA module number -> `ModulePackage.maps` index, for callers that need to target a specific
   * `GEOxxx.DAT` by its real FRUA number (e.g. resolving a Transfer Module event once M5.S4 lands). */
  moduleNumberToMapIndex: Map<number, number>;
  unmapped: FruaUnmappedEvent[];
  /** Bounded Question-Button imports, tagged with their owning retail module/map so local FRUA
   * slots and unsupported-target reports remain unambiguous after package-wide renumbering. */
  questionButtons: Array<FruaQuestionButtonImportReport & { moduleNumber: number; mapIndex: number }>;
  /** Promoted source-local reward slots, tagged before their map events are package-renumbered. */
  importedGiveTreasures: Array<{ fruaSlot: number; moduleNumber: number; mapIndex: number }>;
  /** The exact decoded caller-supplied item capability, reusable by hosts for numeric-id display. */
  itemCatalogue?: FruaItemCatalogue;
}

function authoredMonsterFromFrua(record: FruaMonsterRecord): AuthoredMonster {
  const provenance = record.provenance;
  const global = provenance.kind === 'global' ? provenance : provenance.overrides;
  return {
    id: record.slot,
    name: record.name,
    hitPoints: record.hitPoints,
    armorClass: record.armorClass,
    thac0: record.thac0,
    damage: record.attacks[0]?.damage ?? { count: 0, sides: 0, bonus: 0 },
    xp: record.xp,
    combatSize: record.combatSize,
    source: {
      format: 'frua',
      recordId: record.slot,
      sourceName: provenance.sourceName,
      ...(provenance.kind === 'global' ? { memberIndex: provenance.memberIndex } : {}),
      ...(provenance.kind === 'design-local'
        ? { overrides: { sourceName: global.sourceName, memberIndex: global.memberIndex } }
        : {}),
      attacks: record.attacks.map((attack) => ({
        attacksPerTwoRounds: attack.attacksPerTwoRounds,
        damage: { ...attack.damage },
      })),
      carriedItems: record.items.map((item) => ({ ...item })),
      specialAbilityCodes: [...record.specialAbilityCodes],
    },
  };
}

function shiftedTarget(target: number | undefined, base: number): number | undefined {
  return target === undefined ? undefined : target + base;
}

/** Shift every same-map event reference into the map's package-unique host-id range. */
function renumberEvent(event: ModuleEvent, base: number): ModuleEvent {
  const body = event.body;
  if ('options' in body) {
    return {
      ...event,
      id: event.id + base,
      body: {
        ...body,
        options: body.options.map((option) =>
          option.chainTo === undefined
            ? { ...option }
            : { ...option, chainTo: shiftedTarget(option.chainTo, base) },
        ),
      },
    };
  }
  if ('monsters' in body) {
    return {
      ...event,
      id: event.id + base,
      body: {
        ...body,
        ...(body.onVictory === undefined
          ? {}
          : { onVictory: shiftedTarget(body.onVictory, base) }),
        ...(body.onDefeat === undefined ? {} : { onDefeat: shiftedTarget(body.onDefeat, base) }),
        ...(body.onFlee === undefined ? {} : { onFlee: shiftedTarget(body.onFlee, base) }),
      },
    };
  }
  if ('op' in body) {
    return {
      ...event,
      id: event.id + base,
      body: {
        ...body,
        ...(body.compare === undefined
          ? {}
          : {
              compare: {
                ...body.compare,
                ...(body.compare.onTrue === undefined
                  ? {}
                  : { onTrue: shiftedTarget(body.compare.onTrue, base) }),
                ...(body.compare.onFalse === undefined
                  ? {}
                  : { onFalse: shiftedTarget(body.compare.onFalse, base) }),
              },
            }),
      },
    };
  }
  if ('text' in body) {
    return {
      ...event,
      id: event.id + base,
      body: {
        ...body,
        ...(body.chainTo === undefined ? {} : { chainTo: shiftedTarget(body.chainTo, base) }),
      },
    };
  }
  return {
    ...event,
    id: event.id + base,
    body: {
      ...body,
      ...(body.chainTo === undefined ? {} : { chainTo: shiftedTarget(body.chainTo, base) }),
    },
  };
}

export function renumberMapEvents(map: ModuleMap, base: number): ModuleMap {
  return {
    ...map,
    events: map.events.map((event) => renumberEvent(event, base)),
    cells: map.cells.map((c) => (c.event === undefined ? c : { ...c, event: c.event + base })),
  };
}

/**
 * Aggregate a FRUA design's `GAME001.DAT` + its `GEOxxx.DAT` maps (+ optional `.TLB` art) into one
 * `ModulePackage`. `entrypoints[0]` is the real GAME001 game start (`startingModule` +
 * `entryPointInModule`); one further entrypoint is added per OTHER map (preferring that map's
 * FRUA entry slot 0, then its first retained in-bounds entry) so every usable map in the design is
 * independently reachable — proving cross-map
 * entrypoint resolution actually works end-to-end (`loadModule`/`resolveEntryPoint`/
 * `Explorer.atEntry`), not just that the data shape allows it for a single map (M5.S2a's scope).
 * Some retail designs retain stale entry coordinates after a map resize. Those source rows remain
 * explicit package warnings but are not portable `MapEntry` values: the real GAME001 start must be
 * valid, while each synthetic per-map preview chooses entry id 0 when it is valid and otherwise
 * the first valid source entry.
 *
 * Ruleset is fixed to `addnd1e` (`ADND1E_ID`) — FRUA is AD&D 1st-edition only, no per-design choice
 * to read (`docs/engine/research/frua-and-dungeon-craft.md`).
 */
export function importFruaDesign(name: string, files: FruaDesignFiles): FruaDesignImportResult {
  const game001 = parseFruaGame001(files.game001);
  const moduleNumbers = [...files.geos.keys()].sort((a, b) => a - b);
  if (moduleNumbers.length === 0) throw new Error('importFruaDesign: no GEOxxx.DAT files supplied');

  const maps: ModuleMap[] = [];
  const unmapped: FruaUnmappedEvent[] = [];
  const questionButtons: FruaDesignImportResult['questionButtons'] = [];
  const importedGiveTreasures: FruaDesignImportResult['importedGiveTreasures'] = [];
  const moduleNumberToMapIndex = new Map<number, number>();
  const sourceWarnings: ModuleSourceWarning[] = [];
  const sourceWarningKeys = new Set<string>();
  const retainSourceWarning = (key: string, warning: ModuleSourceWarning): void => {
    if (sourceWarningKeys.has(key)) return;
    sourceWarningKeys.add(key);
    sourceWarnings.push(warning);
  };
  const monsterCatalogue = files.monstGlb
    ? decodeFruaMonsterCatalogue(
        files.monstGlb,
        files.monsterOverrides ?? [],
        files.monstGlbSourceName ?? 'MONST.GLB',
      )
    : undefined;
  const itemCatalogue = files.itemDat !== undefined && files.itemsDat !== undefined
    ? decodeFruaItemCatalogue(files.itemDat, files.itemsDat)
    : undefined;
  const availableItemIds = itemCatalogue ? new Set(itemCatalogue.byId.keys()) : undefined;

  moduleNumbers.forEach((num, mapIndex) => {
    const geo = parseFruaGeo(files.geos.get(num)!);
    const sourceMap = `${name}/GEO${String(num).padStart(3, '0')}`;
    const { map, unmapped: u, questionButtons: q, importedGiveTreasureSlots } = importFruaGeo(
      geo,
      sourceMap,
      {
        supportedCombatSlots: files.supportedCombatSlotsByModule?.get(num),
        availableMonsterSlots: monsterCatalogue ? new Set(monsterCatalogue.bySlot.keys()) : undefined,
        supportedGiveTreasureSlots: files.supportedGiveTreasureSlotsByModule?.get(num),
        availableItemIds,
        itemDatSourceName: files.itemDatSourceName,
        itemsDatSourceName: files.itemsDatSourceName,
      },
    );
    const validEntries = map.entries.filter((entry) =>
      Number.isSafeInteger(entry.x) && Number.isSafeInteger(entry.y) &&
      entry.x >= 0 && entry.y >= 0 && entry.x < map.width && entry.y < map.height);
    for (const entry of map.entries) {
      if (validEntries.includes(entry)) continue;
      retainSourceWarning(`entry:${num}:${entry.id}`, {
        code: 'frua.out_of_bounds_entry',
        sourceFormat: 'FRUA',
        mapIndex,
        sourceMap,
        message:
          `FRUA module ${num} entry ${entry.id} at (${entry.x},${entry.y}) is outside ` +
          `${map.width}×${map.height} and was omitted from the portable map.`,
      });
    }
    const portableMap = validEntries.length === map.entries.length ? map : { ...map, entries: validEntries };
    maps.push(renumberMapEvents(portableMap, mapIndex * EVENT_ID_STRIDE));
    unmapped.push(...u);
    questionButtons.push(...q.map((report) => ({ ...report, moduleNumber: num, mapIndex })));
    importedGiveTreasures.push(...importedGiveTreasureSlots.map((fruaSlot) => ({
      fruaSlot,
      moduleNumber: num,
      mapIndex,
    })));
    for (const unsupported of u) {
      retainSourceWarning(`event:${num}:${unsupported.fruaSlot}:${unsupported.fruaType}`, {
        code: 'frua.unsupported_event',
        sourceFormat: 'FRUA',
        mapIndex,
        sourceMap,
        sourceEventId: unsupported.fruaSlot,
        message:
          `FRUA module ${num} event ${unsupported.fruaSlot} ` +
          `(type ${unsupported.fruaType}: ${unsupported.fruaTypeName}) is unsupported and was not made executable.`,
      });
    }
    // Question closures can discover unsupported descendants that are not themselves attached to
    // a map cell and therefore do not appear in `unmapped`. Retain the same source-event warning
    // contract for those edges without duplicating an event referenced by several buttons/cells.
    for (const report of q) {
      for (const unsupported of report.unsupportedTargets) {
        retainSourceWarning(`event:${num}:${unsupported.targetSlot}:${unsupported.targetType}`, {
          code: 'frua.unsupported_event',
          sourceFormat: 'FRUA',
          mapIndex,
          sourceMap,
          sourceEventId: unsupported.targetSlot,
          message:
            `FRUA module ${num} event ${unsupported.targetSlot} ` +
            `(type ${unsupported.targetType}: ${unsupported.targetTypeName}) is unsupported and was not made executable.`,
        });
      }
    }
    moduleNumberToMapIndex.set(num, mapIndex);
  });

  const startMapIndex = moduleNumberToMapIndex.get(game001.startingModule);
  if (startMapIndex === undefined) {
    throw new Error(
      `importFruaDesign: GAME001 starting module ${game001.startingModule} has no matching GEOxxx.DAT`,
    );
  }
  const startMap = maps[startMapIndex];
  if (!startMap.entries.some((entry) => entry.id === game001.entryPointInModule)) {
    throw new Error(
      `importFruaDesign: GAME001 start entry ${game001.entryPointInModule} on module ` +
      `${game001.startingModule} does not resolve to an in-bounds retained entry`,
    );
  }
  const entrypoints: EntryPoint[] = [{ id: 0, mapIndex: startMapIndex, entryId: game001.entryPointInModule }];
  let epId = 1;
  for (const [moduleNumber, mapIndex] of moduleNumberToMapIndex) {
    if (mapIndex === startMapIndex) continue;
    const map = maps[mapIndex];
    const previewEntry = map.entries.find((entry) => entry.id === 0) ?? map.entries[0];
    if (!previewEntry) {
      retainSourceWarning(`preview-entry:${moduleNumber}`, {
        code: 'frua.preview_entry_unavailable',
        sourceFormat: 'FRUA',
        mapIndex,
        sourceMap: map.name,
        message:
          `FRUA module ${moduleNumber} has no in-bounds source entry; its synthetic preview ` +
          'entrypoint was omitted.',
      });
      continue;
    }
    entrypoints.push({ id: epId++, mapIndex, entryId: previewEntry.id });
  }

  const graphicSets: FrameSet[] = [];
  if (files.tlbs) {
    for (const [baseName, bytes] of files.tlbs) graphicSets.push(importFruaTlb(bytes, baseName));
  }

  const pkg: ModulePackage = {
    schema: 1,
    id: name,
    title: game001.adventureName || name,
    ruleset: ADND1E_ID,
    maps,
    entrypoints,
  };
  if (graphicSets.length > 0) pkg.graphicSets = graphicSets;
  if (sourceWarnings.length > 0) pkg.sourceWarnings = sourceWarnings;
  const referencedMonsterSlots = new Set<number>();
  for (const map of maps) {
    for (const event of map.events) {
      if (!('monsters' in event.body)) continue;
      for (const group of event.body.monsters) referencedMonsterSlots.add(group.monsterId);
      for (const group of event.body.friendlyMonsters ?? []) referencedMonsterSlots.add(group.monsterId);
    }
  }
  if (monsterCatalogue && referencedMonsterSlots.size > 0) {
    pkg.databases = {
      ...createEmptyModuleDatabase(),
      monsters: [...monsterCatalogue.bySlot.values()]
        .filter((record) => referencedMonsterSlots.has(record.slot))
        .sort((left, right) => left.slot - right.slot)
        .map(authoredMonsterFromFrua),
    };
  }

  return {
    package: pkg,
    game001,
    moduleNumberToMapIndex,
    unmapped,
    questionButtons,
    importedGiveTreasures,
    ...(itemCatalogue === undefined ? {} : { itemCatalogue }),
  };
}
