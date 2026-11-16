/**
 * **`classFlags` item-usability gating + `UndreadyAll`** — the last piece of `ReclacClassBonuses`
 * (`ovr026.cs` sub_6A3C6, lines 211-222) left TODO by `recalc.ts`
 * (docs/engine/research/decompile-ovr026-class-recalc.md). After every level-up/dual-class/load
 * recalc, the engine rebuilds a bitmask of the classes the character currently qualifies as, then
 * un-readies any worn/wielded item that bitmask doesn't cover (e.g. a mage who loses fighter
 * privileges on a dual-class carryover drops any fighter-only gear it had readied).
 *
 * The bit values are confirmed from **two independent sources**, not just the decompile:
 * - `coab_extracted/engine/ovr018.cs:308` — `unk_1A1B2 = {0x02,0x10,0x08,0x40,0x40,0x01,0x04,0x20}`
 *   (one byte per `ClassLevel[0..7]` slot).
 * - `hackdocs_extracted/CCHFORM.TXT` offset 183 "Item Use Indicator" — the *same* bitmask,
 *   independently documented by the community from the `.cch` save format: 1 Magic-User,
 *   2 Cleric, 4 Thief, 8 Fighter, 16 Knight, 64 Paladin/Ranger (32 and 128 undocumented there).
 * - `hackdocs_extracted/ITEMS.TXT` byte 13 "one bit set per class that can use this item" — the
 *   item-side field the player mask is ANDed against (`ovr026.cs:693`, `Player.cs:308`). DQK's own
 *   `ITEMS.DAT` catalogue already decodes this real byte — see {@link DqkBaseItem.classMask} in
 *   `../../loaders/dqkItem.js`.
 *
 * Cross-referencing the two sources against `DL_CLASSES` (CoK/DoK's six-class Dragonlance set —
 * no base Paladin, Ranger takes its 0x40 bit) resolves 6 of the 8 slots unambiguously; slots 6/7
 * (0x20, and the COAB table's slot index that hackdocs leaves as "???") aren't part of the
 * Dragonlance class set and are omitted rather than guessed.
 */
import type { DragonlanceClassId } from './classes.js';

/** `ClassLevel[0..7]` → item-use bit, restricted to the Dragonlance class set (`DL_CLASSES`). */
export const CLASS_FLAG: Record<DragonlanceClassId, number> = {
  magicUser: 0x01,
  cleric: 0x02,
  thief: 0x04,
  fighter: 0x08,
  knight: 0x10,
  ranger: 0x40,
};

/** One of a character's class slots for `classFlags` purposes: the class and its level. */
export interface DragonlanceClassSlot {
  classId: DragonlanceClassId;
  level: number;
}

/**
 * Rebuild `player.classFlags` (`ovr026.cs:211-220`): OR together the item-use bit of every class
 * the character **currently** has a level in, plus every **old** (dual-classed-out) class whose
 * frozen level is *below* `hitDiceLevel` (current highest active level) — i.e. the old class's
 * item-use privileges are **reactivated** once the new class has progressed far enough to exceed
 * the old class's final level, same direction and same trigger as {@link dualClassWarriorReactivates}
 * reactivating old combat bonuses (`DualClassExceedLastLevel`). Until that point a dual-classed
 * character is gated to its new class(es) only — old-class gear stays unusable, matching AD&D-1e
 * dual-class rules (verified against a failing-then-fixed test; an earlier draft of this comment
 * had the direction backwards).
 */
export function computeClassFlags(
  slots: readonly DragonlanceClassSlot[],
  oldSlots: readonly DragonlanceClassSlot[],
  hitDiceLevel: number,
): number {
  let flags = 0;
  for (const s of slots) if (s.level > 0) flags |= CLASS_FLAG[s.classId];
  for (const s of oldSlots) if (s.level > 0 && s.level < hitDiceLevel) flags |= CLASS_FLAG[s.classId];
  return flags;
}

/**
 * Whether an item is usable given the character's current `classFlags` (`ovr026.cs:693`,
 * `Player.cs:308`): usable when the item's own class-usability bitmask shares **any** bit with
 * the player's. A byte-faithful AND-check — deliberately **not** special-casing `itemClassFlags
 * === 0` as "unrestricted": real `ITEMS.DAT` records confirm `0` does occur on populated (non-empty)
 * records, not only on unused catalogue slots, so silently treating it as "usable by all" would be
 * an undocumented deviation from the source rather than a safe default. Catalogues that haven't
 * decoded/populated a real class-usability byte yet (e.g. CoK's hand-authored `BASE_ITEMS`) should
 * pass an explicit "all classes" sentinel (`0xFF`) rather than `0` for "no restriction data".
 */
export function itemUsableByClassFlags(itemClassFlags: number, playerClassFlags: number): boolean {
  return (itemClassFlags & playerClassFlags) !== 0;
}

/**
 * Port of `Player.UndreadyAll(classFlags)`: given a list of item slots (each exposing whether it's
 * equipped, its class-usability bitmask, and whether it's cursed), returns the **indices** that
 * should be un-readied — equipped, non-cursed items the new `classFlags` no longer covers. Cursed
 * items stay readied (they can't be removed) even if no longer class-usable, matching the source.
 * Generic over the caller's item-slot shape so it composes with any of the engine's several
 * item-instance types (CoK `InventoryEntry`, DQK `DqkItemRecord`, DoK `DokItemRecord`) once each
 * carries a `classFlags` lookup back to its base-item catalogue.
 */
export function findItemsToUnready<T>(
  slots: readonly T[],
  playerClassFlags: number,
  get: (slot: T) => { equipped: boolean; itemClassFlags: number; cursed: boolean },
): number[] {
  const out: number[] = [];
  slots.forEach((slot, index) => {
    const { equipped, itemClassFlags, cursed } = get(slot);
    if (equipped && !cursed && !itemUsableByClassFlags(itemClassFlags, playerClassFlags)) {
      out.push(index);
    }
  });
  return out;
}
