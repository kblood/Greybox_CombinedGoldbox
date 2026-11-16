/**
 * Champions of Krynn — clerical deities and their granted powers (M2.S4). A CoK cleric must choose a
 * deity, and the deity gates the cleric's alignment and grants Powers and/or Extra spells. The
 * mechanically-relevant grants (a +1 THAC0, a +1 healing die, a turn-undead level boost) are encoded
 * here so combat/healing can apply them. All dwarven clerics must take Reorx (and are thus neutral).
 *
 * Source: "Clerical Deities" table (Journal printed pp. 17-18); see
 * docs/engine/research/cok-dragonlance-rules.md §9b.
 */
import type { DragonlanceRaceId } from './races.js';

export type Alignment = 'good' | 'neutral';

export type DeityId =
  | 'paladine'
  | 'majere'
  | 'kiriJolith'
  | 'mishakal'
  | 'sirrion'
  | 'reorx'
  | 'shinare';

export interface DeityGrant {
  id: DeityId;
  name: string;
  alignment: Alignment;
  /** Flat THAC0 improvement granted to the cleric (Kiri-Jolith, Reorx-for-dwarves). */
  thac0Bonus?: number;
  /** Extra dice added to every healing spell the cleric casts (Mishakal). */
  healingDieBonus?: number;
  /** Turn-undead is resolved as if the cleric were this many levels higher (Majere). */
  turnUndeadLevelBonus?: number;
  /** Bonus spells the deity always grants, by name — shown to the player on Pray (M98), but not
   * modelled mechanically yet (these spells are not made castable/known beyond the normal rules). */
  extraSpells?: readonly string[];
  /** Reorx's THAC0 bonus applies to dwarves only. */
  dwarfOnlyThac0?: boolean;
}

export const DL_DEITIES: Record<DeityId, DeityGrant> = {
  paladine: { id: 'paladine', name: 'Paladine', alignment: 'good', extraSpells: ["Protection from Evil 10' radius"] },
  majere: { id: 'majere', name: 'Majere', alignment: 'good', turnUndeadLevelBonus: 2, extraSpells: ["Silence 15' radius"] },
  kiriJolith: { id: 'kiriJolith', name: 'Kiri-Jolith', alignment: 'good', thac0Bonus: 1, extraSpells: ['Detect Magic'] },
  mishakal: { id: 'mishakal', name: 'Mishakal', alignment: 'good', healingDieBonus: 1, extraSpells: ['Charm Person', 'Remove Curse', 'Bless'] },
  sirrion: { id: 'sirrion', name: 'Sirrion', alignment: 'neutral', extraSpells: ['Burning Hands'] },
  reorx: { id: 'reorx', name: 'Reorx', alignment: 'neutral', thac0Bonus: 1, dwarfOnlyThac0: true },
  shinare: { id: 'shinare', name: 'Shinare', alignment: 'neutral', extraSpells: ['Charm Person'] },
};

/** All dwarven clerics must worship Reorx (Journal printed p. 17). */
export function isDeityAllowed(deity: DeityId, race: DragonlanceRaceId): boolean {
  const isDwarf = race === 'hillDwarf' || race === 'mountainDwarf';
  if (isDwarf) return deity === 'reorx';
  return true; // non-dwarves may pick any deity (alignment-permitting)
}

/** Deities a race's cleric may worship. */
export function deitiesForRace(race: DragonlanceRaceId): DeityGrant[] {
  return (Object.keys(DL_DEITIES) as DeityId[])
    .filter((d) => isDeityAllowed(d, race))
    .map((d) => DL_DEITIES[d]);
}

/** The cleric's effective THAC0 bonus from their deity, given the worshipper's race. */
export function deityThac0Bonus(deity: DeityId, race: DragonlanceRaceId): number {
  const g = DL_DEITIES[deity];
  if (!g.thac0Bonus) return 0;
  if (g.dwarfOnlyThac0 && race !== 'hillDwarf' && race !== 'mountainDwarf') return 0;
  return g.thac0Bonus;
}

/** Levels added to a cleric's turn-undead level from their deity (Majere = +2; CT.5b). 0 if none/unset. */
export function deityTurnUndeadBonus(deity?: DeityId | null): number {
  return (deity && DL_DEITIES[deity]?.turnUndeadLevelBonus) || 0;
}

/** Extra healing dice a cleric's every healing spell gets from their deity (Mishakal = +1). 0 if none/unset. */
export function deityHealDieBonus(deity?: DeityId | null): number {
  return (deity && DL_DEITIES[deity]?.healingDieBonus) || 0;
}
