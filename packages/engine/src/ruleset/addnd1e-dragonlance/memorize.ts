/**
 * Spell memorization model (A2.1) — the pure rules for choosing which spells a caster prepares.
 *
 * A caster has a number of memorizable **slots per spell level** (from `spellSlots` /
 * `clericSpellSlots`). Memorizing fills a slot with a chosen spell; the same spell may be memorized
 * more than once (the games let you prep, e.g., two Magic Missiles) up to the available slots. This
 * module is a small immutable state machine over that: a `Memorization` is a per-spell-level list of
 * chosen spell ids, and `memorize`/`forget` return a new state, never exceeding the slot counts.
 *
 * Pure / data-only. The web layer persists a `Memorization` per character and feeds the slot counts
 * (which already fold in the cleric Wisdom bonus and the mage's moon phase, computed elsewhere).
 */

/** Memorized spell ids, keyed by spell level 1–5. `byLevel[0]` = level-1 spells. */
export interface Memorization {
  byLevel: string[][];
}

/** An empty memorization (five empty levels). */
export function emptyMemorization(): Memorization {
  return { byLevel: [[], [], [], [], []] };
}

/** Defensive copy / normalize an arbitrary value into a 5-level Memorization. */
export function normalizeMemorization(value: unknown): Memorization {
  const mem = emptyMemorization();
  const byLevel = (value as Memorization | null)?.byLevel;
  if (Array.isArray(byLevel)) {
    for (let i = 0; i < 5; i++) {
      const row = byLevel[i];
      if (Array.isArray(row)) mem.byLevel[i] = row.filter((x): x is string => typeof x === 'string');
    }
  }
  return mem;
}

/** Spells memorized at spell `level` (1–5). */
export function memorizedAt(mem: Memorization, level: number): string[] {
  return mem.byLevel[level - 1] ?? [];
}

/** How many slots remain at spell `level` given the slot count for that level. */
export function freeSlots(mem: Memorization, level: number, slotsAtLevel: number): number {
  return Math.max(0, slotsAtLevel - memorizedAt(mem, level).length);
}

/**
 * Memorize one copy of `spellId` at `level` (1–5) if a slot is free. Returns a NEW Memorization
 * (unchanged if no slot is free or the level is out of range).
 */
export function memorize(
  mem: Memorization,
  spellId: string,
  level: number,
  slotsAtLevel: number,
): Memorization {
  if (level < 1 || level > 5) return mem;
  if (freeSlots(mem, level, slotsAtLevel) <= 0) return mem;
  const next = normalizeMemorization(mem);
  next.byLevel[level - 1] = [...next.byLevel[level - 1], spellId];
  return next;
}

/**
 * Forget ONE copy of `spellId` at `level` (the last one added). Returns a NEW Memorization
 * (unchanged if that spell isn't memorized at that level).
 */
export function forget(mem: Memorization, spellId: string, level: number): Memorization {
  if (level < 1 || level > 5) return mem;
  const row = memorizedAt(mem, level);
  const idx = row.lastIndexOf(spellId);
  if (idx < 0) return mem;
  const next = normalizeMemorization(mem);
  next.byLevel[level - 1] = [...row.slice(0, idx), ...row.slice(idx + 1)];
  return next;
}

/** Count of a given spell id memorized at `level`. */
export function memorizedCount(mem: Memorization, spellId: string, level: number): number {
  return memorizedAt(mem, level).filter((x) => x === spellId).length;
}

/** Total memorized spells across all levels. */
export function totalMemorized(mem: Memorization): number {
  return mem.byLevel.reduce((n, row) => n + row.length, 0);
}
