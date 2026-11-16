/**
 * `FruaGeo` → `ModuleMap` (M5.S2). Maps the byte-faithful subset representable in today's
 * `ModulePackage` model: Text Statement (type 2), plus bounded Question-Button (type 10), Combat
 * (type 1), and catalogue-backed Give Treasure (type 3) routes behind explicit caller allowlists.
 * Once-only/repeat state is represented exactly, while unsupported targets and the remaining
 * condition/movement/art semantics are reported rather than approximated.
 */
import type { Direction, MapCell, MapEntry } from '../../model/index.js';
import type { GiveTreasureEventBody, MessageEventBody, ModuleEvent, ModuleMap } from '../types.js';
import { FRUA_ITEM_RECORD_COUNT } from './items.js';
import type { FruaCondition, FruaGeo, FruaWall } from './types.js';

/**
 * Door-flag convention shared with the DAX/HLIB GEO loader (`loaders/geo.ts`): 0 = plain
 * wall, 1 = door, 2 = gateway/special. FRUA packs a lock-mechanic *kind* into the SAME byte
 * as the wall slot (GEOGRIDS.TXT), unlike DAX/HLIB's separate door plane, so this mapping is
 * a documented judgment call, not a verified 1:1 correspondence: `open`/`blocked` → plain
 * wall (no door mechanic — "Blocked" reads as a permanently shut wall, not an openable door);
 * every `locked*`/`wizardLocked*` kind → 1 (a door, lock state aside); `secret`/`falseDoor` →
 * 2 (the "special handling" bucket). Not verified against live FRUA behavior.
 */
function doorFlagFor(wall: FruaWall): number {
  switch (wall.kind) {
    case 'open':
    case 'blocked':
      return 0;
    case 'secret':
    case 'falseDoor':
      return 2;
    default:
      return 1; // locked, lockedSecret, wizardLocked, wizardLockedSecret, lockedKey
  }
}

export interface FruaUnmappedEvent {
  cellIndex: number;
  x: number;
  y: number;
  fruaSlot: number;
  fruaType: number;
  fruaTypeName: string;
}

export interface FruaUnsupportedQuestionButtonTarget {
  /** The question or recursively imported Text Statement whose outgoing edge was examined. */
  fromSlot: number;
  via: 'button' | 'textChain';
  button?: number;
  label?: string;
  targetSlot: number;
  targetType: number;
  targetTypeName: string;
  /** First decoded non-empty target string, retained as provenance but not imported as behavior. */
  targetText: string;
  /** Retained only for an explicit unsupported boundary imported into the event graph. */
  targetRaw16?: number[];
}

/** Audit trail for one bounded Question-Button import. Implemented state is separated from gaps so
 * callers cannot mistake retained source provenance for unsupported behavior. */
export interface FruaQuestionButtonImportReport {
  fruaSlot: number;
  importedTextTargetSlots: number[];
  unsupportedTargets: FruaUnsupportedQuestionButtonTarget[];
  /** Present only when an explicitly allowlisted Combat branch was imported. */
  importedCombatTargetSlots?: number[];
  /** Present only when an explicitly allowlisted, catalogue-backed Give Treasure descendant was imported. */
  importedGiveTreasureTargetSlots?: number[];
  state: {
    onceOnly: boolean;
    repeatQuestionButtons: number[];
    textTargets: Array<{ fruaSlot: number; onceOnly: boolean }>;
  };
  gaps: {
    condition: FruaCondition;
    chainMode: 'always' | 'ifHappens' | 'ifDoesntHappen';
    commonChainTarget: number;
    backupOneStepButtons: number[];
    pictureId: number;
    noArt: boolean;
    /** Unsupported condition/common-chain fields retained for each imported Text Statement. */
    textTargets: Array<{
      fruaSlot: number;
      condition: FruaCondition;
      chainMode: 'always' | 'ifHappens' | 'ifDoesntHappen';
      commonChainTarget: number;
    }>;
  };
}

export interface FruaGeoImportOptions {
  /** Combat slots whose behavior has independent route evidence. Absence means no Combat import. */
  supportedCombatSlots?: ReadonlySet<number>;
  /** Monster slots decoded from the caller-supplied bestiary capability. Both this set and the
   * explicit Combat allowlist are required before a Combat target becomes executable. */
  availableMonsterSlots?: ReadonlySet<number>;
  /** Give Treasure slots independently approved by the caller's route evidence. Catalogue bytes
   * alone never promote every type-3 event in an arbitrary design. */
  supportedGiveTreasureSlots?: ReadonlySet<number>;
  /** Addressable one-based ITEM.DAT ids supplied by the selected catalogue capability. */
  availableItemIds?: ReadonlySet<number>;
  /** Exact provenance labels for that catalogue. Both are required for promotion. */
  itemDatSourceName?: string;
  itemsDatSourceName?: string;
}

export interface FruaImportResult {
  map: ModuleMap;
  /** Cells whose FRUA event isn't representable as a `ModuleEvent` yet. */
  unmapped: FruaUnmappedEvent[];
  questionButtons: FruaQuestionButtonImportReport[];
  /** Source-local type-3 slots promoted through the explicit item-catalogue capability. */
  importedGiveTreasureSlots: number[];
}

/** Import one `GEOxxx.DAT` grid plus the bounded event subset described above into `name`. */
export function importFruaGeo(geo: FruaGeo, name: string, options: FruaGeoImportOptions = {}): FruaImportResult {
  const cells: MapCell[] = new Array(geo.width * geo.height);
  const unmapped: FruaUnmappedEvent[] = [];
  const questionButtons: FruaQuestionButtonImportReport[] = [];
  const importedGiveTreasureSlots: number[] = [];
  const eventsById = new Map<number, ModuleEvent>();

  const withOnceOnly = (event: ModuleEvent, onceOnly: boolean): ModuleEvent =>
    onceOnly ? { ...event, onceOnly: true } : event;

  const firstText = (slot: number): string => {
    const target = geo.events[slot - 1];
    return target ? (Object.values(target.strings).find((text) => text.length > 0) ?? '') : '';
  };

  const textBody = (event: FruaGeo['events'][number]): MessageEventBody => {
    const texts = ['statement1', 'statement2', 'statement3', 'statement4', 'statement5']
      .map((key) => event.strings[key] ?? '')
      .filter((text) => text.length > 0);
    return {
      text: texts[0] ?? '',
      ...(texts.length > 1 ? { additionalTexts: texts.slice(1) } : {}),
    };
  };

  const recordUnsupported = (
    report: FruaQuestionButtonImportReport | undefined,
    edge: Omit<FruaUnsupportedQuestionButtonTarget, 'targetType' | 'targetTypeName' | 'targetText'>,
  ): void => {
    if (!report) return;
    const target = geo.events[edge.targetSlot - 1];
    const item: FruaUnsupportedQuestionButtonTarget = {
      ...edge,
      targetType: target?.type ?? 0,
      targetTypeName: target?.typeName ?? 'Missing',
      targetText: firstText(edge.targetSlot),
    };
    const key = `${item.fromSlot}:${item.via}:${item.button ?? 0}:${item.targetSlot}`;
    if (!report.unsupportedTargets.some((candidate) =>
      `${candidate.fromSlot}:${candidate.via}:${candidate.button ?? 0}:${candidate.targetSlot}` === key)) {
      report.unsupportedTargets.push(item);
    }
  };

  const retainUnsupportedGiveTreasure = (
    target: FruaGeo['events'][number],
    report: FruaQuestionButtonImportReport,
    edge: Omit<FruaUnsupportedQuestionButtonTarget, 'targetSlot' | 'targetType' | 'targetTypeName' | 'targetText'>,
  ): number => {
    recordUnsupported(report, { ...edge, targetSlot: target.slot });
    const recorded = report.unsupportedTargets.find((item) =>
      item.fromSlot === edge.fromSlot && item.via === edge.via && item.button === edge.button &&
      item.targetSlot === target.slot);
    if (recorded) recorded.targetRaw16 = [...target.raw16];
    if (!eventsById.has(target.slot)) {
      eventsById.set(target.slot, withOnceOnly({
        id: target.slot,
        type: 'giveTreasure',
        unsupported: {
          sourceFormat: 'FRUA',
          sourceEventSlot: target.slot,
          sourceType: target.type,
          sourceTypeName: target.typeName,
        },
        body: { text: '' },
      }, target.onceOnly));
    }
    return target.slot;
  };

  /** Recursively close same-map Text Statement edges and capability-gated Give Treasure tails.
   * Other unsupported targets remain unchained and are retained in the question's report. */
  function importTextClosure(
    targetSlot: number,
    report: FruaQuestionButtonImportReport | undefined,
    walked: Set<number>,
    edge: Omit<FruaUnsupportedQuestionButtonTarget, 'targetSlot' | 'targetType' | 'targetTypeName' | 'targetText'>,
  ): number | undefined {
    if (targetSlot === 0) return undefined;
    const target = geo.events[targetSlot - 1];
    if (!target || target.type !== 2) {
      recordUnsupported(report, { ...edge, targetSlot });
      return undefined;
    }

    if (report) {
      if (!report.importedTextTargetSlots.includes(targetSlot)) report.importedTextTargetSlots.push(targetSlot);
      if (!report.state.textTargets.some((item) => item.fruaSlot === targetSlot)) {
        report.state.textTargets.push({ fruaSlot: targetSlot, onceOnly: target.onceOnly });
      }
      if (!report.gaps.textTargets.some((item) => item.fruaSlot === targetSlot)) {
        report.gaps.textTargets.push({
          fruaSlot: targetSlot,
          condition: { ...target.condition },
          chainMode: target.chainMode,
          commonChainTarget: target.chainToEvent,
        });
      }
    }
    if (!eventsById.has(targetSlot)) {
      eventsById.set(targetSlot, withOnceOnly({
        id: targetSlot,
        type: 'message',
        body: textBody(target),
      }, target.onceOnly));
    }
    if (walked.has(targetSlot)) return targetSlot;
    walked.add(targetSlot);

    if (target.chainToEvent > 0 && target.chainMode === 'always') {
      const continuation = geo.events[target.chainToEvent - 1];
      let next: number | undefined;
      if (continuation?.type === 3) {
        next = importGiveTreasureClosure(target.chainToEvent, report, walked);
        if (next === undefined && report) {
          next = retainUnsupportedGiveTreasure(continuation, report, {
            fromSlot: targetSlot,
            via: 'textChain',
          });
        }
      } else {
        next = importTextClosure(target.chainToEvent, report, walked, {
          fromSlot: targetSlot,
          via: 'textChain',
        });
      }
      if (next !== undefined) {
        eventsById.set(targetSlot, withOnceOnly({
          id: targetSlot,
          type: 'message',
          body: { ...textBody(target), chainTo: next },
        }, target.onceOnly));
      }
    }
    return targetSlot;
  }

  /** Promote only a caller-approved, unconditional type-3 record backed by an exact, labelled
   * ITEM.DAT/ITEMS.DAT capability. Its numeric ids remain source identities in the event body;
   * the decoded catalogue is returned by the design importer rather than embedded in JSON data. */
  function importGiveTreasureClosure(
    targetSlot: number,
    report: FruaQuestionButtonImportReport | undefined,
    walked: Set<number>,
  ): number | undefined {
    const target = geo.events[targetSlot - 1];
    const reward = target?.giveTreasure;
    const availableItemIds = options.availableItemIds;
    const itemDatSourceName = options.itemDatSourceName;
    const itemsDatSourceName = options.itemsDatSourceName;
    const itemIdsAvailable = availableItemIds !== undefined && reward !== undefined && reward.items.every((itemId) =>
      Number.isInteger(itemId) && itemId >= 1 && itemId <= FRUA_ITEM_RECORD_COUNT && availableItemIds.has(itemId));
    if (!target || target.type !== 3 || !reward || target.condition.kind !== 'always' ||
        options.supportedGiveTreasureSlots?.has(targetSlot) !== true || !itemIdsAvailable ||
        itemDatSourceName === undefined || itemDatSourceName.length === 0 ||
        itemsDatSourceName === undefined || itemsDatSourceName.length === 0) {
      return undefined;
    }

    if (!importedGiveTreasureSlots.includes(targetSlot)) importedGiveTreasureSlots.push(targetSlot);
    if (report) {
      report.importedGiveTreasureTargetSlots ??= [];
      if (!report.importedGiveTreasureTargetSlots.includes(targetSlot)) {
        report.importedGiveTreasureTargetSlots.push(targetSlot);
      }
    }

    const eventWithChain = (chainTo?: number): ModuleEvent => {
      const body: GiveTreasureEventBody = {
        platinum: reward.platinum,
        gems: reward.gems,
        jewelry: reward.jewelry,
        items: [...reward.items],
        itemsIdentified: reward.itemsIdentified,
        source: {
          format: 'frua',
          sourceEventSlot: target.slot,
          itemDatSourceName,
          itemsDatSourceName,
        },
        ...(chainTo === undefined ? {} : { chainTo }),
      };
      return withOnceOnly({ id: target.slot, type: 'giveTreasure', body }, target.onceOnly);
    };
    if (!eventsById.has(targetSlot)) eventsById.set(targetSlot, eventWithChain());
    if (walked.has(targetSlot)) return targetSlot;
    walked.add(targetSlot);

    let chainTo: number | undefined;
    if (target.chainMode === 'always' && target.chainToEvent > 0) {
      chainTo = importTextClosure(target.chainToEvent, report, walked, {
        fromSlot: targetSlot,
        via: 'textChain',
      });
    }
    eventsById.set(targetSlot, eventWithChain(chainTo));
    return targetSlot;
  }

  const importCombatClosure = (
    targetSlot: number,
    report: FruaQuestionButtonImportReport,
    walked: Set<number>,
    edge: Omit<FruaUnsupportedQuestionButtonTarget, 'targetSlot' | 'targetType' | 'targetTypeName' | 'targetText'>,
  ): number | undefined => {
    const target = geo.events[targetSlot - 1];
    const combat = target?.combat;
    const groups = combat?.groups.filter((group) => group.count > 0 && group.monsterSlot > 0) ?? [];
    const explicitlySupported = options.supportedCombatSlots?.has(targetSlot) === true;
    const rosterAvailable = groups.length > 0 && groups.every((group) =>
      options.availableMonsterSlots?.has(group.monsterSlot) === true);
    if (!target || target.type !== 1 || !combat || target.condition.kind !== 'always' ||
        !explicitlySupported || !rosterAvailable) {
      recordUnsupported(report, { ...edge, targetSlot });
      return undefined;
    }

    report.importedCombatTargetSlots ??= [];
    if (!report.importedCombatTargetSlots.includes(targetSlot)) report.importedCombatTargetSlots.push(targetSlot);

    let onVictory: number | undefined;
    if (target.chainMode === 'always' && target.chainToEvent > 0) {
      onVictory = importTextClosure(target.chainToEvent, report, walked, {
        fromSlot: targetSlot,
        via: 'textChain',
      });
    }
    eventsById.set(targetSlot, withOnceOnly({
      id: targetSlot,
      type: 'combat',
      body: {
        intro: combat.intro,
        monsters: groups.filter((group) => !group.friendly).map((group) => ({
          monsterId: group.monsterSlot,
          count: group.count,
          picBlockId: 0,
        })),
        friendlyMonsters: groups.filter((group) => group.friendly).map((group) => ({
          monsterId: group.monsterSlot,
          count: group.count,
          picBlockId: 0,
        })),
        source: {
          format: 'frua',
          pictureId: combat.pictureId,
          noArt: combat.noArt,
          moraleModifier: combat.moraleModifier,
          surprise: combat.surprise,
          outdoors: combat.outdoors,
          autoApproach: combat.autoApproach,
          partyNeverDies: combat.partyNeverDies,
          noTreasure: combat.noTreasure,
          magicWorks: combat.magicWorks,
          distance: combat.distance,
          attackDirections: [...combat.attackDirections],
          turnUndeadModifierBits: combat.turnUndeadModifierBits,
        },
        ...(onVictory === undefined ? {} : { onVictory }),
      },
    }, target.onceOnly));
    return targetSlot;
  };

  const importQuestionButton = (slot: number): boolean => {
    const source = geo.events[slot - 1];
    const question = source?.questionButton;
    if (!source || !question || question.labels.filter((label) => label.length > 0).length < 2) return false;
    // A nontrivial trigger condition cannot be evaluated by today's stateless ModuleEvent model;
    // leave that cell unmapped instead of making a conditional retail question unconditional.
    if (source.condition.kind !== 'always') return false;
    if (questionButtons.some((report) => report.fruaSlot === slot)) return true;

    const report: FruaQuestionButtonImportReport = {
      fruaSlot: slot,
      importedTextTargetSlots: [],
      unsupportedTargets: [],
      state: {
        onceOnly: source.onceOnly,
        repeatQuestionButtons: [...question.repeatQuestionButtons],
        textTargets: [],
      },
      gaps: {
        condition: { ...source.condition },
        chainMode: source.chainMode,
        commonChainTarget: source.chainToEvent,
        backupOneStepButtons: [...question.backupOneStepButtons],
        pictureId: source.pictureId ?? 0,
        noArt: question.noArt,
        textTargets: [],
      },
    };
    const walked = new Set<number>();
    const options = question.labels.flatMap((label, index) => {
      if (label.length === 0) return [];
      const targetSlot = question.branchTargets[index] ?? 0;
      const target = geo.events[targetSlot - 1];
      const edge = { fromSlot: slot, via: 'button' as const, button: index + 1, label };
      let chainTo: number | undefined;
      if (target?.type === 1) {
        chainTo = importCombatClosure(targetSlot, report, walked, edge);
      } else if (target?.type === 3) {
        chainTo = importGiveTreasureClosure(targetSlot, report, walked) ??
          retainUnsupportedGiveTreasure(target, report, edge);
      } else {
        chainTo = importTextClosure(targetSlot, report, walked, edge);
      }
      const repeatQuestion = question.repeatQuestionButtons.includes(index + 1);
      return [{
        label,
        ...(chainTo === undefined ? {} : { chainTo }),
        ...(repeatQuestion ? { repeatQuestion: true } : {}),
      }];
    });
    eventsById.set(slot, withOnceOnly(
      { id: slot, type: 'questionButton', body: { prompt: question.prompt, options } },
      source.onceOnly,
    ));
    questionButtons.push(report);
    return true;
  };

  for (let y = 0; y < geo.height; y++) {
    for (let x = 0; x < geo.width; x++) {
      const i = y * geo.width + x;
      const fc = geo.cells[i];
      const walls: Record<Direction, number> = {
        north: fc.north.slot,
        east: fc.east.slot,
        south: fc.south.slot,
        west: fc.west.slot,
      };
      const doors: Record<Direction, number> = {
        north: doorFlagFor(fc.north),
        east: doorFlagFor(fc.east),
        south: doorFlagFor(fc.south),
        west: doorFlagFor(fc.west),
      };

      let event: number | undefined;
      if (fc.eventSlot > 0) {
        const fe = geo.events[fc.eventSlot - 1];
        if (fe.type === 2) {
          event = fe.slot;
          if (!eventsById.has(fe.slot)) {
            eventsById.set(fe.slot, withOnceOnly(
              { id: fe.slot, type: 'message', body: textBody(fe) },
              fe.onceOnly,
            ));
          }
        } else if (fe.type === 10 && importQuestionButton(fe.slot)) {
          event = fe.slot;
        } else if (fe.type === 3 && importGiveTreasureClosure(fe.slot, undefined, new Set()) !== undefined) {
          event = fe.slot;
        } else {
          unmapped.push({ cellIndex: i, x, y, fruaSlot: fe.slot, fruaType: fe.type, fruaTypeName: fe.typeName });
        }
      }

      cells[i] = { walls, doors, event, flags: fc.backdropSlot | (fc.zone << 2) };
    }
  }

  const entries: MapEntry[] = geo.entryPoints.map((ep, id) => ({ id, x: ep.x, y: ep.y, facing: ep.facing }));

  return {
    map: { name, width: geo.width, height: geo.height, cells, entries, events: Array.from(eventsById.values()) },
    unmapped,
    questionButtons,
    importedGiveTreasureSlots,
  };
}
