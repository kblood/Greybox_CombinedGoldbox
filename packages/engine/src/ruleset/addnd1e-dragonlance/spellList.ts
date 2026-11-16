/**
 * Champions of Krynn spell list (A2.1) — the named cleric and magic-user spells available to a
 * player caster, levels 1–5 (CoK caps both tracks at 5th-level spells). This is the spell *book*
 * the memorization screen lists; the slot *counts* come from `spellSlots`/`clericSpellSlots`.
 *
 * Names + class/level are the canonical Champions of Krynn player spell selection (Adventurer's
 * Journal spell lists, cross-checked against the AD&D-1e PHB). Druid/illusionist tracks aren't
 * player-available in CoK and so aren't listed. IDs are stable kebab-case slugs for persistence.
 */

export type SpellClass = 'cleric' | 'magicUser';

export interface SpellDef {
  /** Stable id for persistence (memorized sets reference this). */
  id: string;
  name: string;
  class: SpellClass;
  /** Spell level 1–5. */
  level: number;
}

function mk(cls: SpellClass, level: number, names: string[]): SpellDef[] {
  return names.map((name) => ({
    id: `${cls === 'cleric' ? 'c' : 'm'}${level}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
    name,
    class: cls,
    level,
  }));
}

/** The full CoK player spellbook (cleric + magic-user, levels 1–5). */
export const COK_SPELLS: readonly SpellDef[] = [
  // ── Cleric ──────────────────────────────────────────────────────────────────────────────
  ...mk('cleric', 1, [
    'Bless', 'Curse', 'Cure Light Wounds', 'Cause Light Wounds', 'Detect Magic',
    'Protection from Evil', 'Protection from Good', 'Resist Cold',
  ]),
  ...mk('cleric', 2, [
    'Find Traps', 'Hold Person', 'Resist Fire', 'Silence 15’ Radius', 'Slow Poison',
    'Snake Charm', 'Spiritual Hammer',
  ]),
  ...mk('cleric', 3, [
    'Animate Dead', 'Bestow Curse', 'Cure Blindness', 'Cause Blindness', 'Cure Disease',
    'Cause Disease', 'Dispel Magic', 'Prayer', 'Remove Curse', 'Remove Paralysis',
  ]),
  ...mk('cleric', 4, [
    'Cure Serious Wounds', 'Cause Serious Wounds', 'Neutralize Poison', 'Poison',
    'Protection from Evil 10’ Radius', 'Sticks to Snakes',
  ]),
  ...mk('cleric', 5, [
    'Cure Critical Wounds', 'Cause Critical Wounds', 'Dispel Evil', 'Flame Strike',
    'Raise Dead', 'Slay Living',
  ]),

  // ── Magic-user ──────────────────────────────────────────────────────────────────────────
  ...mk('magicUser', 1, [
    'Burning Hands', 'Charm Person', 'Detect Magic', 'Enlarge', 'Friends', 'Magic Missile',
    'Protection from Evil', 'Read Magic', 'Shield', 'Shocking Grasp', 'Sleep',
  ]),
  ...mk('magicUser', 2, [
    'Detect Invisibility', 'Invisibility', 'Knock', 'Mirror Image', 'Ray of Enfeeblement',
    'Stinking Cloud', 'Strength',
  ]),
  ...mk('magicUser', 3, [
    'Blink', 'Dispel Magic', 'Fireball', 'Haste', 'Hold Person', 'Invisibility 10’ Radius',
    'Lightning Bolt', 'Protection from Evil 10’ Radius', 'Protection from Normal Missiles', 'Slow',
  ]),
  ...mk('magicUser', 4, [
    'Charm Monster', 'Confusion', 'Dimension Door', 'Fear', 'Fire Shield', 'Fumble', 'Ice Storm',
    'Minor Globe of Invulnerability', 'Remove Curse', 'Wall of Fire',
  ]),
  ...mk('magicUser', 5, [
    'Cloudkill', 'Cone of Cold', 'Feeblemind', 'Hold Monster',
  ]),
];

/** Every spell a `cls` caster could know, capped at `maxSpellLevel` (1–5). */
export function knownSpells(cls: SpellClass, maxSpellLevel: number): SpellDef[] {
  const cap = Math.max(0, Math.min(5, Math.floor(maxSpellLevel)));
  return COK_SPELLS.filter((s) => s.class === cls && s.level <= cap);
}

/** Spells of `cls` at exactly spell-level `level`. */
export function spellsAtLevel(cls: SpellClass, level: number): SpellDef[] {
  return COK_SPELLS.filter((s) => s.class === cls && s.level === level);
}

/** Look up a spell by id. */
export function spellById(id: string): SpellDef | undefined {
  return COK_SPELLS.find((s) => s.id === id);
}

/** Highest spell level (1–5) for which `slots` grants at least one slot; 0 if a non-caster. */
export function maxCastableLevel(slots: readonly number[]): number {
  let max = 0;
  for (let i = 0; i < slots.length && i < 5; i++) if (slots[i] > 0) max = i + 1;
  return max;
}
