/**
 * AD&D 1st-edition **multiclass / dual-class character recalculation** — the `ovr026`
 * `ReclacClassBonuses` glue that composes the single-class table lookups into a multiclass
 * character's derived combat profile (`docs/engine/research/decompile-ovr026-class-recalc.md`).
 *
 * The engine already has the single-class `thac0`/`savingThrows` tables; what was missing is the
 * compositing: a multiclass character attacks on its **best** class matrix, has the **highest**
 * class level as hit dice, and gets warrior multiple attacks at the fighter/paladin 7 / ranger 8
 * breakpoint (plus the dual-class reactivation variant). Pure functions over engine-neutral types.
 */
import type { ClassId } from '../types.js';
import { thac0 as defaultThac0 } from './combatTables.js';

/** One of a character's class slots: the class and the level reached in it (`ClassLevel[0..7]`). */
export interface ClassSlot {
  classId: ClassId;
  level: number;
}

/** Only slots with a real level count toward any derived value. */
function active(slots: readonly ClassSlot[]): ClassSlot[] {
  return slots.filter((s) => s.level >= 1);
}

/**
 * **Best (lowest) THAC0** across a character's class slots (`ReclacClassBonuses` step 1): a
 * multiclass character attacks on its best class's matrix. The decompile takes the `max` of the
 * *inverted* stored table (`0x3C − value`); in our actual-THAC0 space (lower = better) that is the
 * **minimum** `thac0(class, level)`. Defaults to 20 (the 1e base) when the character has no class
 * level. `lookup` is injectable for testing.
 */
export function bestThac0(
  slots: readonly ClassSlot[],
  lookup: (classId: ClassId, level: number) => number = defaultThac0,
): number {
  const a = active(slots);
  if (a.length === 0) return 20;
  return Math.min(...a.map((s) => lookup(s.classId, s.level)));
}

/** **Hit-dice level** = the character's highest single-class level (`ReclacClassBonuses` step 2). */
export function maxClassLevel(slots: readonly ClassSlot[]): number {
  const a = active(slots);
  return a.length === 0 ? 0 : Math.max(...a.map((s) => s.level));
}

/**
 * Whether the character's **current** classes grant warrior multiple attacks (`ReclacClassBonuses`
 * step 3): fighter ≥ 7, **or** paladin ≥ 7, **or** ranger ≥ 8. (AD&D-1e's 3 attacks / 2 rounds
 * breakpoint — the engine encodes it as `attacksCount = 3`.)
 */
export function warriorMultipleAttacks(slots: readonly ClassSlot[]): boolean {
  return active(slots).some(
    (s) =>
      ((s.classId === 'fighter' || s.classId === 'paladin') && s.level >= 7) ||
      (s.classId === 'ranger' && s.level >= 8),
  );
}

/**
 * Whether a **dual-classed** character's reactivated **old** warrior class grants multiple attacks
 * (`DualClassExceedLastLevel` branch): old fighter/paladin level > 6, or old ranger level > 7.
 * Pass only the old slots that are reactivated (i.e. when the new class level has exceeded the old
 * class's final level — the caller owns that test).
 */
export function dualClassWarriorReactivates(oldSlots: readonly ClassSlot[]): boolean {
  return active(oldSlots).some(
    (s) =>
      ((s.classId === 'fighter' || s.classId === 'paladin') && s.level > 6) ||
      (s.classId === 'ranger' && s.level > 7),
  );
}

/**
 * **Constitution poison-save bonus** (`SaveVersePoisonBonus`) — the AD&D-1e Con-scaled bonus to
 * the poison/death save. The caller applies it **only to dwarves and halflings** (in Krynn:
 * hill/mountain dwarves and kender). Verified tiers: 4–6 → +1, 7–10 → +2, 11–13 → +3, 14–17 → +4.
 * Con 18+ continues the pattern to +5 (inferred — the decompile's table runs past the captured
 * lines; below the captured range, no bonus).
 */
export function conPoisonSaveBonus(con: number): number {
  if (con >= 18) return 5; // inferred continuation past the captured table
  if (con >= 14) return 4;
  if (con >= 11) return 3;
  if (con >= 7) return 2;
  if (con >= 4) return 1;
  return 0;
}

/** A character's derived combat numbers after a recalc (`ReclacClassBonuses` output subset). */
export interface CombatProfile {
  /** Best (lowest) THAC0 across current + reactivated-old class matrices. */
  thac0: number;
  /** Hit-dice level = highest current class level. */
  hitDiceLevel: number;
  /** True when any warrior breakpoint (current or reactivated dual-class old) is met. */
  multipleAttacks: boolean;
}

/**
 * Compose a character's {@link CombatProfile} from its current class slots and any **reactivated**
 * old (dual-class) slots (`ReclacClassBonuses`): THAC0 = best of all matrices, hit dice = max
 * **current** class level (old slots don't raise hit dice), multiple attacks if any current or
 * reactivated-old warrior breakpoint is met. Pass `oldSlots` empty unless the dual-class old class
 * is reactivated.
 */
export function recalcCombatProfile(
  slots: readonly ClassSlot[],
  oldSlots: readonly ClassSlot[] = [],
  lookup: (classId: ClassId, level: number) => number = defaultThac0,
): CombatProfile {
  return {
    thac0: bestThac0([...slots, ...oldSlots], lookup),
    hitDiceLevel: maxClassLevel(slots),
    multipleAttacks: warriorMultipleAttacks(slots) || dualClassWarriorReactivates(oldSlots),
  };
}
