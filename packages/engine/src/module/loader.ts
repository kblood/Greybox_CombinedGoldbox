/**
 * `ModulePackage` loader (M5.S1) — adapts an authored module into the engine's real world/VM/
 * ruleset types so it loads and plays through the *same* path as an original decoded game
 * (ARCHITECTURE.md §2.5, ADR-0006): `GameMap` for `Explorer`, compiled ECL bytecode for `EclVm`,
 * and a resolved `RulesetPlugin` from the shared registry. No separate authoring runtime.
 */
import {
  EclVm,
  type EclCombatOutcome,
  type EclInputValue,
  type EclRunResult,
} from '../ecl/vm.js';
import { defaultRulesets } from '../ruleset/index.js';
import type { RulesetPlugin } from '../ruleset/types.js';
import type { RulesetRegistry } from '../ruleset/registry.js';
import type { GameMap } from '../model/index.js';
import type { ModuleMap, ModulePackage } from './types.js';
import { compileModuleEvent, compileTextEvent, encodeEclString } from './eventCompiler.js';

export { compileModuleEvent, encodeEclString };

/**
 * Build a minimal Gen1 ECL block (`ecl/disassemble.ts` `ECL_GEN1`) whose only action is
 * `PRINT <text>` then `EXIT` — the compiled form of a `'message'` `ModuleEvent`. Byte-faithful to
 * the real dialect: 22-byte header (0x1388 magic + five far pointers, all pointing at the code
 * entry 0x8014, mirroring `loaders/eclEncode.ts`'s `makeEclForwardStub`) + `11 80 <len> <packed
 * text>` (PRINT with an inline 6-bit string operand) + `00` (EXIT). Kept as a named export for
 * backward compatibility; `eventCompiler.ts`'s `compileTextEvent` is the same encoder generalized
 * to the other 19 text-shape event types (plus an optional trailing chain).
 */
export function makeGen1MessageBlock(text: string): Uint8Array {
  return compileTextEvent({ text });
}

function toGameMap(m: ModuleMap): GameMap {
  return { name: m.name, width: m.width, height: m.height, cells: m.cells, entries: m.entries };
}

export interface LoadedModule {
  pkg: ModulePackage;
  ruleset: RulesetPlugin;
  /** `ModulePackage.maps`, adapted to the engine's `GameMap` — feed straight to `Explorer`. */
  maps: GameMap[];
  /** Every map's events, compiled to ECL bytecode, keyed by `ModuleEvent.id` (ids are unique
   * across the whole package — a `MapCell.event` on any map resolves through this one table). */
  eventBlocks: Map<number, Uint8Array>;
  /** Per-source relocation tables for compiled NEWECL operands. The inner key is the one-byte
   * token present in `eventBlocks`; its value is the globally unique host event id exposed by
   * {@link ModuleEventVm}. Derived at load time and never serialized. */
  eventChainLinks: Map<number, ReadonlyMap<number, number>>;
}

/** An authored-module VM facade. Its underlying `EclVm` still executes a real one-byte NEWECL,
 * while `run()`/`resume()` translate that source block's private link token back to the globally
 * unique `ModuleEvent.id` expected by module hosts. */
export class ModuleEventVm extends EclVm {
  constructor(
    block: Uint8Array,
    readonly eventId: number,
    private readonly chainLinks: ReadonlyMap<number, number>,
  ) {
    super(block);
  }

  private translate(result: EclRunResult): EclRunResult {
    if (result.status !== 'chain') return result;
    const encoded = result.chainBlockId;
    const target = encoded === undefined ? undefined : this.chainLinks.get(encoded);
    if (target === undefined) {
      throw new Error(`ModuleEventVm: event ${this.eventId} emitted unknown NEWECL link token ${encoded}`);
    }
    return { ...result, chainBlockId: target };
  }

  override run(): EclRunResult {
    return this.translate(super.run());
  }

  override resume(value: EclInputValue = 0, opts?: { combatOutcome?: EclCombatOutcome }): EclRunResult {
    return this.translate(super.resume(value, opts));
  }
}

export interface LoadModuleOptions {
  /** Override the ruleset registry (defaults to a fresh `defaultRulesets()`) — lets a caller
   * register a custom/data-driven ruleset (`ruleset/dataRuleset.ts`'s `createDataRuleset`, M5.S5)
   * before `pkg.ruleset` is resolved. */
  registry?: RulesetRegistry;
}

/**
 * Load a `ModulePackage`: resolve its ruleset from the shared registry, adapt its maps to
 * `GameMap`, and compile every event to a real ECL block. Throws on an unknown schema/ruleset id,
 * a bad `entrypoints` reference, or a duplicate event id.
 */
export function loadModule(pkg: ModulePackage, opts?: LoadModuleOptions): LoadedModule {
  if (pkg.schema !== 1) throw new Error(`loadModule: unsupported schema ${pkg.schema}`);

  const registry = opts?.registry ?? defaultRulesets();
  const ruleset = registry.get(pkg.ruleset);
  if (!ruleset) throw new Error(`loadModule: unknown ruleset ${JSON.stringify(pkg.ruleset)}`);

  for (const ep of pkg.entrypoints) {
    const map = pkg.maps[ep.mapIndex];
    if (!map) throw new Error(`loadModule: entrypoint ${ep.id} references missing map index ${ep.mapIndex}`);
    if (!map.entries.some((e) => e.id === ep.entryId)) {
      throw new Error(`loadModule: entrypoint ${ep.id} references missing entry id ${ep.entryId} on map ${JSON.stringify(map.name)}`);
    }
  }

  // First collect the host-visible identity space. Compilation is a second pass because any
  // source may point forward to an event declared later in its map.
  const eventOwners = new Map<number, { mapIndex: number; mapName: string }>();
  pkg.maps.forEach((map, mapIndex) => {
    for (const event of map.events) {
      if (!Number.isSafeInteger(event.id) || event.id <= 0) {
        throw new Error(`loadModule: invalid event id ${event.id} on map ${JSON.stringify(map.name)}`);
      }
      if (eventOwners.has(event.id)) throw new Error(`loadModule: duplicate event id ${event.id}`);
      eventOwners.set(event.id, { mapIndex, mapName: map.name });
    }
  });

  const eventBlocks = new Map<number, Uint8Array>();
  const eventChainLinks = new Map<number, ReadonlyMap<number, number>>();
  pkg.maps.forEach((map, mapIndex) => {
    for (const event of map.events) {
      const encodedByTarget = new Map<number, number>();
      const targetByEncoded = new Map<number, number>();
      const encodeChainTarget = (targetEventId: number): number => {
        if (!Number.isSafeInteger(targetEventId) || targetEventId <= 0) {
          throw new Error(`loadModule: event ${event.id} has invalid chain target ${targetEventId}`);
        }
        const targetOwner = eventOwners.get(targetEventId);
        if (!targetOwner) {
          throw new Error(`loadModule: event ${event.id} has dangling chain target ${targetEventId}`);
        }
        if (targetOwner.mapIndex !== mapIndex) {
          throw new Error(
            `loadModule: event ${event.id} on map ${JSON.stringify(map.name)} has cross-map chain target ` +
            `${targetEventId} on map ${JSON.stringify(targetOwner.mapName)}`,
          );
        }

        const existing = encodedByTarget.get(targetEventId);
        if (existing !== undefined) return existing;

        let encoded: number | undefined;
        if (targetEventId <= 0xff && !targetByEncoded.has(targetEventId)) encoded = targetEventId;
        if (encoded === undefined) {
          for (let candidate = 1; candidate <= 0xff; candidate++) {
            if (!targetByEncoded.has(candidate)) {
              encoded = candidate;
              break;
            }
          }
        }
        if (encoded === undefined) {
          throw new Error(`loadModule: event ${event.id} has more than 255 distinct chain targets`);
        }
        encodedByTarget.set(targetEventId, encoded);
        targetByEncoded.set(encoded, targetEventId);
        return encoded;
      };

      eventBlocks.set(event.id, compileModuleEvent(event, { encodeChainTarget }));
      eventChainLinks.set(event.id, targetByEncoded);
    }
  });

  return { pkg, ruleset, maps: pkg.maps.map(toGameMap), eventBlocks, eventChainLinks };
}

/** Build a fresh, un-run, deliberately STATELESS `EclVm` for `eventId`'s compiled block. Gameplay
 * hosts should use `ModuleEventRuntime`, which owns chains, once-only state, repeat questions, and
 * save snapshots; this low-level factory remains useful for compiler/golden tests. Most event
 * shapes run to completion in one `run()`, but `choice`-shape events pause on INPUT_NUMBER and
 * `combat`-shape events pause on COMBAT — the caller drives those to completion itself via
 * `resume(value)` / `resume(0, {combatOutcome})`, keeping this same `EclVm` instance around
 * between calls (a fresh instance would lose the paused state). Throws if `eventId` has no
 * compiled block. */
export function createModuleEventVm(loaded: LoadedModule, eventId: number): ModuleEventVm {
  const block = loaded.eventBlocks.get(eventId);
  if (!block) throw new Error(`createModuleEventVm: no compiled block for event id ${eventId}`);
  const chainLinks = loaded.eventChainLinks.get(eventId);
  if (!chainLinks) throw new Error(`createModuleEventVm: no chain-link table for event id ${eventId}`);
  return new ModuleEventVm(block, eventId, chainLinks);
}

/** Run the compiled block for `eventId` (fresh stateless `EclVm`, default budget/seed) and return its
 * effects — the host inspects `result.effects` (e.g. the `'print'` text) same as it would for an
 * original game's event. For event shapes that pause immediately (`choice`, `combat`), this
 * returns the paused `EclRunResult` without resolving it; use `createModuleEventVm` directly to
 * drive those with `resume()`. Throws if `eventId` has no compiled block. */
export function runModuleEvent(loaded: LoadedModule, eventId: number): EclRunResult {
  return createModuleEventVm(loaded, eventId).run();
}

/** Resolve an `EntryPoint` id to its `{ map, entry }` pair — the arguments `Explorer.atEntry`
 * (or `new Explorer(map, {x,y,facing})`) needs to place the party at module start. */
export function resolveEntryPoint(loaded: LoadedModule, entryPointId: number): { map: GameMap; entryId: number } {
  const ep = loaded.pkg.entrypoints.find((e) => e.id === entryPointId);
  if (!ep) throw new Error(`resolveEntryPoint: unknown entrypoint id ${entryPointId}`);
  return { map: loaded.maps[ep.mapIndex], entryId: ep.entryId };
}
