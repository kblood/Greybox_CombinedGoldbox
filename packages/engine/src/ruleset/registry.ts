/**
 * Ruleset registry (M2.S3) — a tiny id → plugin map so games and the UI resolve a ruleset by
 * name (`profile.ruleset`) without importing the implementation directly. Overlays declare an
 * `extends` id; `resolve` returns the plugin plus its inheritance chain (base-first) so a caller
 * can fall back through layers (e.g. a Dragonlance overlay → `addnd1e`).
 */
import type { RulesetPlugin } from './types.js';

export interface RulesetRegistry {
  /** Register a plugin. Throws on a duplicate id (registration is build-time, not user input). */
  register(plugin: RulesetPlugin): void;
  /** Look up a plugin by id, or `undefined` if absent. */
  get(id: string): RulesetPlugin | undefined;
  /** All registered ids, in insertion order. */
  ids(): string[];
  /**
   * Resolve `id` to its inheritance chain, base-first (`[base, …, leaf]`). Returns `null` if `id`
   * is unknown; throws on a cycle or a missing `extends` target.
   */
  resolve(id: string): RulesetPlugin[] | null;
}

export function createRulesetRegistry(): RulesetRegistry {
  const plugins = new Map<string, RulesetPlugin>();

  return {
    register(plugin) {
      if (plugins.has(plugin.id)) throw new Error(`ruleset: duplicate id "${plugin.id}"`);
      plugins.set(plugin.id, plugin);
    },
    get(id) {
      return plugins.get(id);
    },
    ids() {
      return [...plugins.keys()];
    },
    resolve(id) {
      if (!plugins.has(id)) return null;
      const chain: RulesetPlugin[] = [];
      const seen = new Set<string>();
      let cur: RulesetPlugin | undefined = plugins.get(id);
      while (cur) {
        if (seen.has(cur.id)) throw new Error(`ruleset: inheritance cycle at "${cur.id}"`);
        seen.add(cur.id);
        chain.unshift(cur); // base ends up first
        if (!cur.extends) break;
        const parent = plugins.get(cur.extends);
        if (!parent) throw new Error(`ruleset: "${cur.id}" extends unknown "${cur.extends}"`);
        cur = parent;
      }
      return chain;
    },
  };
}
