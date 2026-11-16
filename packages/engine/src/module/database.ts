/**
 * Database editing (M5.S5) — pure, author-facing records for monsters/items/spells/classes/races,
 * mirroring `module/editor.ts`'s immutable-upsert pattern (ADR-0006: no separate authoring
 * runtime). A `ModuleDatabase` hangs off `ModulePackage.databases`.
 *
 * Scope, per the M5.S5 research pass: **monsters and items are close to free** — `monsterCombatant`
 * (`combat/combat.ts`) and the inventory/combat-equip layer already consume plain structural
 * records (no decoded-bytes dependency), so an `AuthoredMonster`/`BaseItem` plugs straight in.
 * **Spells** need a small extension: the built-in `COK_SPELLS`/`spellEffect` split is two
 * id-keyed tables that must stay in sync, and the effects table is module-private — not reusable
 * for author-added spells — so {@link AuthoredSpell} inlines its effect into one self-contained
 * record instead. **Classes/races** stay intentionally simple (flat data, not the full AD&D-1e
 * ability-range/exceptional-% model `DL_RACES` uses, and not wired into `createCharacter`, which
 * stays hardcoded to the Dragonlance types) — genuinely authoring a new *character-creation* system
 * is out of scope here; a custom ruleset (see `ruleset/dataRuleset.ts`) is the piece that actually
 * changes gameplay math (XP/THAC0/hit dice) when switched.
 */
import type { DamageDice } from '../loaders/monster.js';
import { BASE_ITEMS, type BaseItem } from '../items/baseItems.js';
import { COK_SPELLS, type SpellDef } from '../ruleset/addnd1e-dragonlance/spellList.js';
import { spellEffect as builtinSpellEffect, type SpellEffect } from '../ruleset/addnd1e-dragonlance/spellEffects.js';
import { monsterCombatant, type Combatant, type CombatSide } from '../combat/combat.js';

/** An authored monster — the exact structural shape {@link monsterCombatant}/combat consumes.
 * Deliberately lighter than the decoded `MonsterRecord` (no `raw` bytes, `abilities`,
 * `savingThrows`, `hitDice`, `category` — nothing downstream of the DAX/HLIB decoders reads those
 * fields once a monster reaches combat). */
export interface AuthoredMonster {
  id: number;
  name: string;
  hitPoints: number;
  armorClass: number;
  thac0: number;
  damage: DamageDice;
  xp: number;
  morale?: number;
  combatSize?: number;
  /** Optional source-shaped compatibility data. Combat consumes the normalized fields above;
   * importers retain attacks/items/provenance here so fidelity is not destroyed merely because
   * the current tactical model only executes one damage column. */
  source?: AuthoredMonsterSource;
}

export interface AuthoredMonsterSource {
  format: string;
  recordId: number;
  sourceName: string;
  memberIndex?: number;
  overrides?: { sourceName: string; memberIndex?: number };
  attacks?: Array<{ attacksPerTwoRounds: number; damage: DamageDice }>;
  carriedItems?: Array<{ recordIndex: number; itemId: number; quantityCode: number }>;
  specialAbilityCodes?: number[];
}

/** An authored spell — {@link SpellDef} plus its effect inlined into one self-contained record. */
export interface AuthoredSpell extends SpellDef {
  effect: SpellEffect;
}

/** A minimal, generic race — flat ability floors, not `DL_RACES`'s male/female range +
 * exceptional-strength-percentile model (that stays specific to the built-in Dragonlance
 * ruleset). Not wired into `createCharacter`; authored for reference/display + future rulesets. */
export interface AuthoredRace {
  id: string;
  name: string;
  minAbilities?: Partial<Record<'str' | 'int' | 'wis' | 'dex' | 'con' | 'cha', number>>;
  allowedClasses?: string[];
}

/** A minimal, generic class — hit die + prime requisite only. Not wired into `createCharacter`. */
export interface AuthoredClass {
  id: string;
  name: string;
  hitDie: number;
  primeRequisite?: ('str' | 'int' | 'wis' | 'dex' | 'con' | 'cha')[];
}

/** The five authorable database categories, hung off `ModulePackage.databases`. */
export interface ModuleDatabase {
  monsters: AuthoredMonster[];
  items: BaseItem[];
  spells: AuthoredSpell[];
  classes: AuthoredClass[];
  races: AuthoredRace[];
}

/** An empty database — every category starts as an empty list. */
export function createEmptyModuleDatabase(): ModuleDatabase {
  return { monsters: [], items: [], spells: [], classes: [], races: [] };
}

// ── Monsters ───────────────────────────────────────────────────────────────────────────────────

/** Add a new authored monster, or replace the existing one with the same `id`. */
export function upsertMonster(db: ModuleDatabase, monster: AuthoredMonster): ModuleDatabase {
  if (!Number.isInteger(monster.id) || monster.id <= 0) throw new Error(`upsertMonster: invalid id ${monster.id}`);
  const monsters = db.monsters.filter((m) => m.id !== monster.id).concat(monster).sort((a, b) => a.id - b.id);
  return { ...db, monsters };
}

/** Remove monster `id` from the database, if present. */
export function removeMonster(db: ModuleDatabase, id: number): ModuleDatabase {
  return { ...db, monsters: db.monsters.filter((m) => m.id !== id) };
}

/** Adapt an `AuthoredMonster` into a real, battle-ready `Combatant` — the exact same conversion a
 * decoded `MonsterRecord` goes through (`monsterCombatant`), proving an authored monster is real
 * combat data, not a display-only stub. */
export function authoredMonsterCombatant(monster: AuthoredMonster, id: string, side: CombatSide = 'enemy'): Combatant {
  return monsterCombatant(monster, id, side);
}

// ── Items ──────────────────────────────────────────────────────────────────────────────────────

/** Add a new authored item, or replace the existing one with the same `id`. */
export function upsertItem(db: ModuleDatabase, item: BaseItem): ModuleDatabase {
  if (!Number.isInteger(item.id) || item.id <= 0) throw new Error(`upsertItem: invalid id ${item.id}`);
  const items = db.items.filter((i) => i.id !== item.id).concat(item).sort((a, b) => a.id - b.id);
  return { ...db, items };
}

/** Remove item `id` from the database, if present. */
export function removeItem(db: ModuleDatabase, id: number): ModuleDatabase {
  return { ...db, items: db.items.filter((i) => i.id !== id) };
}

/** The built-in `BASE_ITEMS` catalogue overlaid with `db.items` (an authored entry wins on id
 * collision) — merged at lookup time, never mutates the shared global table. */
export function mergedBaseItems(db: ModuleDatabase): Record<number, BaseItem> {
  const merged: Record<number, BaseItem> = { ...BASE_ITEMS };
  for (const item of db.items) merged[item.id] = item;
  return merged;
}

// ── Spells ─────────────────────────────────────────────────────────────────────────────────────

/** Add a new authored spell, or replace the existing one with the same `id`. */
export function upsertSpell(db: ModuleDatabase, spell: AuthoredSpell): ModuleDatabase {
  if (!spell.id) throw new Error('upsertSpell: id required');
  const spells = db.spells.filter((s) => s.id !== spell.id).concat(spell).sort((a, b) => a.id.localeCompare(b.id));
  return { ...db, spells };
}

/** Remove spell `id` from the database, if present. */
export function removeSpell(db: ModuleDatabase, id: string): ModuleDatabase {
  return { ...db, spells: db.spells.filter((s) => s.id !== id) };
}

/** `COK_SPELLS` overlaid with `db.spells` (an authored entry wins on id collision). */
export function mergedSpells(db: ModuleDatabase): SpellDef[] {
  const overriding = new Set(db.spells.map((s) => s.id));
  return [...COK_SPELLS.filter((s) => !overriding.has(s.id)), ...db.spells];
}

/** An authored spell's inline effect if `spellId` names one, else the built-in effect table, else
 * a flavour-only utility effect. */
export function spellEffectFor(db: ModuleDatabase, spellId: string): SpellEffect {
  const authored = db.spells.find((s) => s.id === spellId);
  return authored ? authored.effect : builtinSpellEffect(spellId);
}

// ── Classes / races ────────────────────────────────────────────────────────────────────────────

/** Add a new authored class, or replace the existing one with the same `id`. */
export function upsertClass(db: ModuleDatabase, cls: AuthoredClass): ModuleDatabase {
  if (!cls.id) throw new Error('upsertClass: id required');
  const classes = db.classes.filter((c) => c.id !== cls.id).concat(cls).sort((a, b) => a.id.localeCompare(b.id));
  return { ...db, classes };
}

/** Remove class `id` from the database, if present. */
export function removeClass(db: ModuleDatabase, id: string): ModuleDatabase {
  return { ...db, classes: db.classes.filter((c) => c.id !== id) };
}

/** Add a new authored race, or replace the existing one with the same `id`. */
export function upsertRace(db: ModuleDatabase, race: AuthoredRace): ModuleDatabase {
  if (!race.id) throw new Error('upsertRace: id required');
  const races = db.races.filter((r) => r.id !== race.id).concat(race).sort((a, b) => a.id.localeCompare(b.id));
  return { ...db, races };
}

/** Remove race `id` from the database, if present. */
export function removeRace(db: ModuleDatabase, id: string): ModuleDatabase {
  return { ...db, races: db.races.filter((r) => r.id !== id) };
}

// ── Persistence ────────────────────────────────────────────────────────────────────────────────

/** `ModuleDatabase` has no `Map`/`Set` fields, so it round-trips through `JSON.stringify` directly
 * — mirrors `module/editor.ts`'s `serializeModuleMap`. */
export function serializeModuleDatabase(db: ModuleDatabase): string {
  return JSON.stringify(db);
}

function isModuleDatabaseShape(v: unknown): v is ModuleDatabase {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    Array.isArray(d.monsters) &&
    Array.isArray(d.items) &&
    Array.isArray(d.spells) &&
    Array.isArray(d.classes) &&
    Array.isArray(d.races)
  );
}

/** Parse + validate a `serializeModuleDatabase` payload. Throws on malformed JSON or a shape
 * mismatch — a corrupt save is reported, not silently patched. */
export function deserializeModuleDatabase(json: string): ModuleDatabase {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new Error(`deserializeModuleDatabase: invalid JSON (${(err as Error).message})`);
  }
  if (!isModuleDatabaseShape(data)) throw new Error('deserializeModuleDatabase: not a ModuleDatabase-shaped object');
  return data;
}
