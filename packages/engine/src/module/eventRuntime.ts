/**
 * Stateful module-event driver.
 *
 * `ModuleEventVm` deliberately models one compiled ECL block. This layer owns the world semantics
 * that span blocks and map visits: automatic NEWECL traversal, once-only consumption, a
 * Question-Button option's return-to-question continuation, and a small versioned save snapshot.
 * Hosts therefore render the same behavior instead of independently re-implementing event state.
 */
import type {
  EclCombatOutcome,
  EclEffect,
  EclRunResult,
  EclStatus,
} from '../ecl/vm.js';
import {
  createModuleEventVm,
  type LoadedModule,
  type ModuleEventVm,
} from './loader.js';
import type {
  ChoiceEventBody,
  GiveTreasureEventBody,
  GiveTreasureEventEffect,
  ModuleEvent,
} from './types.js';
import {
  MODULE_EVENT_STATE_VERSION,
  normalizeModuleArtifactId,
  normalizeModuleEventStateSnapshot,
  type ModuleEventStateSnapshot,
} from './eventState.js';

/** A high-level stop after all immediately-following NEWECL blocks have been traversed. */
export type ModuleEventEffect = EclEffect | GiveTreasureEventEffect;

export interface ModuleEventRuntimeOptions {
  /** Opaque immutable identity for the exact package artifact. Snapshots restore only when this
   * value matches exactly, including whether it is absent for a legacy runtime. */
  artifactId?: string;
  /** Authorize a retained source-backed reward against host-owned capabilities. `true` permits the
   * effect; `false` or an absent callback halts honestly; a string is returned as the halt reason. */
  authorizeGiveTreasure?: (event: ModuleEvent, body: GiveTreasureEventBody) => boolean | string;
}

export interface ModuleEventRuntimeResult {
  /** `consumed` means traversal stopped at an already-consumed event. A top-level revisit is
   * silent; effects may be non-empty when earlier blocks in the same automatic chain already ran. */
  status: Exclude<EclStatus, 'chain'> | 'consumed';
  /** Effects accumulated across every automatically-followed block in this turn. */
  effects: ModuleEventEffect[];
  /** Source event at the final stop (or the consumed event for a silent trigger). */
  eventId: number;
  haltReason?: string;
}

type PausedStatus = 'awaiting-input' | 'combat';
interface ActiveEvent {
  eventId: number;
  vm: ModuleEventVm;
  status: PausedStatus;
}

/** Owns one loaded module's event state and current paused interaction. */
export class ModuleEventRuntime {
  private readonly events = new Map<number, ModuleEvent>();
  private readonly onceOnlyIds = new Set<number>();
  private readonly consumed = new Set<number>();
  private readonly treasureReceipts = new Map<number, GiveTreasureEventEffect>();
  private active: ActiveEvent | null = null;
  /** Completed branches return to these questions in LIFO order. A stack keeps nested questions
   * well-defined even though the current FRUA import accepts only a bounded Text-target subset. */
  private readonly repeatReturns: number[] = [];
  /** Copied from the caller's options so later mutation cannot change this runtime's identity. */
  private readonly artifactId: string | undefined;

  constructor(
    private readonly loaded: LoadedModule,
    snapshot?: unknown,
    private readonly options: ModuleEventRuntimeOptions = {},
  ) {
    if (options.artifactId !== undefined) {
      const artifactId = normalizeModuleArtifactId(options.artifactId);
      if (artifactId === null) {
        throw new Error('ModuleEventRuntime: invalid artifact identity');
      }
      this.artifactId = artifactId;
    }
    for (const map of loaded.pkg.maps) {
      for (const event of map.events) {
        this.events.set(event.id, event);
        if (event.onceOnly) this.onceOnlyIds.add(event.id);
      }
    }
    if (snapshot !== undefined) this.restore(snapshot);
  }

  /** Current host interaction, or null when movement/save is safe. */
  get awaiting(): PausedStatus | null {
    return this.active?.status ?? null;
  }

  get currentEventId(): number | null {
    return this.active?.eventId ?? null;
  }

  isConsumed(eventId: number): boolean {
    return this.consumed.has(eventId);
  }

  snapshot(): ModuleEventStateSnapshot {
    if (this.active) throw new Error('ModuleEventRuntime.snapshot: cannot save while an event is awaiting input');
    const treasureReceipts = [...this.treasureReceipts.values()]
      .sort((left, right) => left.eventId - right.eventId)
      .map((receipt) => ({ ...receipt, items: [...receipt.items] }));
    return {
      version: MODULE_EVENT_STATE_VERSION,
      moduleId: this.loaded.pkg.id,
      ...(this.artifactId !== undefined ? { artifactId: this.artifactId } : {}),
      consumedEventIds: [...this.consumed].sort((a, b) => a - b),
      ...(treasureReceipts.length > 0 ? { treasureReceipts } : {}),
    };
  }

  /** Replace durable state from a save. Paused ECL machines are intentionally not serialised, so
   * callers must load only at a stable host boundary. */
  restore(value: unknown): void {
    if (this.active) throw new Error('ModuleEventRuntime.restore: cannot restore while an event is awaiting input');
    const snapshot = normalizeModuleEventStateSnapshot(value);
    if (!snapshot) throw new Error('ModuleEventRuntime.restore: invalid event-state snapshot');
    if (snapshot.moduleId !== this.loaded.pkg.id) {
      throw new Error(
        `ModuleEventRuntime.restore: snapshot module ${JSON.stringify(snapshot.moduleId)} does not match ` +
        `${JSON.stringify(this.loaded.pkg.id)}`,
      );
    }
    if (snapshot.artifactId !== this.artifactId) {
      const snapshotIdentity = snapshot.artifactId === undefined
        ? 'an unfingerprinted legacy artifact'
        : JSON.stringify(snapshot.artifactId);
      const runtimeIdentity = this.artifactId === undefined
        ? 'an unfingerprinted legacy artifact'
        : JSON.stringify(this.artifactId);
      throw new Error(
        `ModuleEventRuntime.restore: snapshot artifact identity ${snapshotIdentity} does not match ` +
        `runtime artifact identity ${runtimeIdentity}`,
      );
    }
    this.consumed.clear();
    this.treasureReceipts.clear();
    const receiptIds = new Set((snapshot.treasureReceipts ?? []).map((receipt) => receipt.eventId));
    for (const id of snapshot.consumedEventIds) {
      if (!this.onceOnlyIds.has(id)) continue;
      const event = this.events.get(id);
      if (event?.type === 'giveTreasure') {
        // A receipt and consumption are one durable fact. Require both identifiers, then derive
        // every amount/item field from the loaded event rather than trusting save-file values.
        // Restoring is also an authorization boundary: an old valid receipt must not become a way
        // to consume/reveal a source-backed reward after the matching host capability disappears.
        // An inconsistent/tampered save must fail closed. Silently dropping the consumed bit here
        // would re-arm a once-only reward and allow it to be granted a second time.
        if (!receiptIds.has(id)) {
          throw new Error(
            `ModuleEventRuntime.restore: consumed Give Treasure event ${id} has no valid receipt`,
          );
        }
        if (event.unsupported) {
          throw new Error(
            `ModuleEventRuntime.restore: receipt event ${id} is an unsupported ` +
            `${event.unsupported.sourceFormat} ${event.unsupported.sourceTypeName}`,
          );
        }
        const body = event.body as GiveTreasureEventBody;
        const authorizationFailure = this.giveTreasureAuthorizationFailure(event, body);
        if (authorizationFailure) {
          throw new Error(`ModuleEventRuntime.restore: ${authorizationFailure}`);
        }
        const receipt = this.giveTreasureEffect(event, body);
        this.consumed.add(id);
        this.treasureReceipts.set(id, receipt);
      } else {
        this.consumed.add(id);
      }
    }
    this.repeatReturns.length = 0;
  }

  /** Fire a map/host event and follow every synchronous chain to its next player-facing stop. */
  fire(eventId: number): ModuleEventRuntimeResult {
    if (this.active) throw new Error('ModuleEventRuntime.fire: an event is already awaiting input');
    this.repeatReturns.length = 0;
    return this.start(eventId, [], false, 0);
  }

  /** Resume a numbered choice. `repeatQuestion` is read from the exact selected option before its
   * VM resumes, so its complete target chain can return to this question without a map re-trigger. */
  resumeChoice(value: number): ModuleEventRuntimeResult {
    const active = this.requireActive('awaiting-input');
    const event = this.events.get(active.eventId);
    const body = event?.body as ChoiceEventBody | undefined;
    if (!event || !body || !('options' in body)) {
      throw new Error(`ModuleEventRuntime.resumeChoice: event ${active.eventId} is not a choice event`);
    }
    const answer = Number.isFinite(value) ? Math.trunc(value) : 0;
    const option = body.options[answer - 1];
    if (option?.repeatQuestion) this.repeatReturns.push(active.eventId);
    this.active = null;
    return this.advance(active.vm, active.vm.resume(answer), active.eventId, [], 0);
  }

  resumeCombat(outcome: EclCombatOutcome): ModuleEventRuntimeResult {
    const active = this.requireActive('combat');
    this.active = null;
    return this.advance(active.vm, active.vm.resume(0, { combatOutcome: outcome }), active.eventId, [], 0);
  }

  private requireActive(status: PausedStatus): ActiveEvent {
    if (!this.active || this.active.status !== status) {
      throw new Error(`ModuleEventRuntime: not awaiting ${status === 'combat' ? 'combat' : 'a choice'}`);
    }
    return this.active;
  }

  private start(
    eventId: number,
    effects: ModuleEventEffect[],
    bypassConsumed: boolean,
    depth: number,
  ): ModuleEventRuntimeResult {
    if (depth > 1024) {
      return { status: 'halted', effects, eventId, haltReason: 'module event chain exceeded 1024 blocks' };
    }
    const event = this.events.get(eventId);
    if (!event) throw new Error(`ModuleEventRuntime: no event ${eventId}`);
    if (event.unsupported) {
      this.repeatReturns.length = 0;
      return {
        status: 'halted',
        effects,
        eventId,
        haltReason:
          `Unsupported ${event.unsupported.sourceFormat} event ${event.unsupported.sourceEventSlot}: ` +
          event.unsupported.sourceTypeName,
      };
    }
    if (event.onceOnly && this.consumed.has(eventId) && !bypassConsumed) {
      return this.complete({ status: 'consumed', effects, eventId }, depth);
    }
    let giveTreasure: GiveTreasureEventEffect | undefined;
    if (event.type === 'giveTreasure') {
      const body = event.body as GiveTreasureEventBody;
      const authorizationFailure = this.giveTreasureAuthorizationFailure(event, body);
      if (authorizationFailure) {
        this.repeatReturns.length = 0;
        return { status: 'halted', effects, eventId, haltReason: authorizationFailure };
      }
      giveTreasure = this.giveTreasureEffect(event, body);
    }
    if (event.onceOnly) this.consumed.add(eventId);
    if (giveTreasure) {
      if (event.onceOnly) this.treasureReceipts.set(eventId, { ...giveTreasure, items: [...giveTreasure.items] });
      effects.push(giveTreasure);
    }
    const vm = createModuleEventVm(this.loaded, eventId);
    return this.advance(vm, vm.run(), eventId, effects, depth);
  }

  private advance(
    vm: ModuleEventVm,
    result: EclRunResult,
    eventId: number,
    effects: ModuleEventEffect[],
    depth: number,
  ): ModuleEventRuntimeResult {
    effects.push(...result.effects);
    if (result.status === 'chain') {
      return this.start(result.chainBlockId!, effects, false, depth + 1);
    }
    if (result.status === 'awaiting-input' || result.status === 'combat') {
      this.active = { eventId, vm, status: result.status };
      return { status: result.status, effects, eventId };
    }
    if (result.status === 'halted') {
      this.repeatReturns.length = 0;
      return { status: result.status, effects, eventId, haltReason: result.haltReason };
    }
    return this.complete({ status: result.status, effects, eventId }, depth);
  }

  private complete(result: ModuleEventRuntimeResult, depth: number): ModuleEventRuntimeResult {
    this.active = null;
    const repeatEventId = this.repeatReturns.pop();
    if (repeatEventId !== undefined) {
      // The question may already be consumed; this is continuation of the SAME occurrence, not a
      // second map trigger, so it deliberately bypasses the once-only guard.
      return this.start(repeatEventId, result.effects, true, depth + 1);
    }
    return result;
  }

  private giveTreasureEffect(event: ModuleEvent, body: GiveTreasureEventBody): GiveTreasureEventEffect {
    return {
      type: 'giveTreasure',
      eventId: event.id,
      platinum: body.platinum,
      gems: body.gems,
      jewelry: body.jewelry,
      items: [...body.items],
      itemsIdentified: body.itemsIdentified,
    };
  }

  private giveTreasureAuthorizationFailure(event: ModuleEvent, body: GiveTreasureEventBody): string | null {
    if (!body.source) return null;
    const authorize = this.options.authorizeGiveTreasure;
    if (!authorize) return `Give Treasure event ${body.source.sourceEventSlot} requires source authorization`;
    try {
      const verdict = authorize(event, body);
      if (verdict === true) return null;
      if (typeof verdict === 'string' && verdict.length > 0) return verdict;
      return `Give Treasure event ${body.source.sourceEventSlot} source authorization was refused`;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return `Give Treasure event ${body.source.sourceEventSlot} source authorization failed: ${detail}`;
    }
  }
}
