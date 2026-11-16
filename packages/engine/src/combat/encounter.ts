/**
 * Encounter resolution (M2.S6) — the glue between a script-triggered fight and the combat core.
 *
 * When the ECL VM pauses with a `combat` effect it hands over an `EncounterMonster[]` roster (the
 * groups queued by LOAD_MONSTER). This maps those `monsterId`s — block ids in the loaded
 * `MON{n}CHA.DAX` — to decoded `MonsterRecord`s, spawns `count` combatants per group, adds the
 * party, and runs the deterministic combat. The host calls this, then `resume()`s the VM. Keeping
 * it here (pure, DOM-free) means the whole encounter→outcome path is unit-testable without a player.
 */
import type { EncounterMonster } from '../ecl/vm.js';
import type { MonsterRecord } from '../loaders/monster.js';
import {
  monsterCombatant,
  runCombat,
  type Combatant,
  type CombatOptions,
  type CombatResult,
} from './combat.js';

/** Resolve a monster id (a `MON{n}CHA` block id) to its decoded record, or undefined if unknown. */
export type MonsterLookup = (monsterId: number) => MonsterRecord | undefined;

/** Build a `MonsterLookup` from a decoded `MON{n}CHA` archive, keyed by block id. */
export function monsterLookupFromArchive(records: MonsterRecord[]): MonsterLookup {
  const byId = new Map<number, MonsterRecord>();
  for (const r of records) byId.set(r.blockId, r);
  return (id) => byId.get(id);
}

export interface EncounterResult extends CombatResult {
  /** Roster entries whose `monsterId` had no matching record (host may surface/log these). */
  unresolved: number[];
}

export interface SpawnedEnemies {
  /** One `Combatant` per monster instance (`count` per group), ids `e0`, `e1`, … in roster order. */
  enemies: Combatant[];
  /** Roster entries whose `monsterId` had no matching record. */
  unresolved: number[];
}

/**
 * Spawn the enemy combatants for a roster **without** running combat — the shared front half of an
 * encounter. The auto-resolve path ({@link resolveEncounter}) and the *interactive* combat screen
 * (the web combat controller, CS.9) both call this so the two paths spawn an identical enemy line-up
 * (same ids `e0..`, same per-group `count`). Unknown monster ids are skipped and reported.
 */
export function spawnEnemies(roster: EncounterMonster[], lookup: MonsterLookup): SpawnedEnemies {
  const enemies: Combatant[] = [];
  const unresolved: number[] = [];
  let n = 0;
  for (const group of roster) {
    const rec = lookup(group.monsterId);
    if (!rec) {
      unresolved.push(group.monsterId);
      continue;
    }
    for (let i = 0; i < group.count; i++) {
      enemies.push(monsterCombatant(rec, `e${n++}`));
    }
  }
  return { enemies, unresolved };
}

/**
 * Spawn the `roster` against the `party` and run combat to completion (the auto-resolve path).
 * Unknown monster ids are skipped and reported in `unresolved` rather than throwing, so a single bad
 * id never aborts an encounter.
 */
export function resolveEncounter(
  roster: EncounterMonster[],
  lookup: MonsterLookup,
  party: Combatant[],
  opts: CombatOptions = {},
): EncounterResult {
  const { enemies, unresolved } = spawnEnemies(roster, lookup);
  const result = runCombat([...party, ...enemies], opts);
  return { ...result, unresolved };
}
