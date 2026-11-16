/**
 * Champions of Krynn — the three moons of Krynn and their effect on mage power (M2.S4). A PC mage
 * draws power from one moon by robe order: White Robe → Solinari (good), Red Robe → Lunitari
 * (neutral). Black Robe → Nuitari is NPC-only. The current phase of the mage's own moon shifts their
 * saving throws, grants additional spells, and at full moon raises their effective casting level.
 *
 * Source: the moon-phase effect table (Journal printed pp. 15-16); see
 * docs/engine/research/cok-dragonlance-rules.md §9a.
 */

export type RobeOrder = 'white' | 'red' | 'black';

export interface MoonInfo {
  robe: RobeOrder;
  moon: string;
  alignment: 'good' | 'neutral' | 'evil';
  /** Black Robe (Nuitari) is NPC-only — not selectable for the player party. */
  playerSelectable: boolean;
}

export const MOONS: Record<RobeOrder, MoonInfo> = {
  white: { robe: 'white', moon: 'Solinari', alignment: 'good', playerSelectable: true },
  red: { robe: 'red', moon: 'Lunitari', alignment: 'neutral', playerSelectable: true },
  black: { robe: 'black', moon: 'Nuitari', alignment: 'evil', playerSelectable: false },
};

/** Moon phases, low→high power. */
export type MoonPhase = 'lowSanction' | 'waning' | 'waxing' | 'highSanction';

/** Phase order low→high power, the cycle a moon walks as it waxes from new to full. */
export const MOON_PHASE_ORDER: readonly MoonPhase[] = [
  'lowSanction',
  'waxing',
  'highSanction',
  'waning',
];

/**
 * Approximate full-cycle length, in game days, of each moon. The Krynn moons cycle at different
 * rates — which is why they rarely share a phase — but the Journal does not print exact day counts,
 * so these are plausible *distinct* defaults that exist only to drive the on-screen phase display.
 * The phase→effect mechanic (`moonPhaseMods`) is the authoritative, sourced part; these periods are
 * a presentation choice and can be retuned if a primary source surfaces.
 */
export const MOON_CYCLE_DAYS: Record<RobeOrder, number> = {
  white: 36, // Solinari, the slow white moon
  red: 28, // Lunitari
  black: 8, // Nuitari, the fast dark moon
};

/** The phase of `robe`'s moon on game `day` (day 0 = every moon new / low sanction). */
export function moonPhaseForDay(robe: RobeOrder, day: number): MoonPhase {
  const period = MOON_CYCLE_DAYS[robe];
  const d = ((Math.floor(day) % period) + period) % period;
  const idx = Math.floor((d / period) * MOON_PHASE_ORDER.length) % MOON_PHASE_ORDER.length;
  return MOON_PHASE_ORDER[idx];
}

/** One moon's current standing, for the on-screen three-moons display. */
export interface MoonReading {
  robe: RobeOrder;
  info: MoonInfo;
  phase: MoonPhase;
  /** Normalised illumination 0 (new) → 1 (full), for drawing the disc. */
  illumination: number;
}

const PHASE_ILLUMINATION: Record<MoonPhase, number> = {
  lowSanction: 0,
  waxing: 0.5,
  highSanction: 1,
  waning: 0.5,
};

/** All three moons' phase for a game `day`, in white→red→black order (the display order). */
export function moonPhasesForDay(day: number): MoonReading[] {
  return (Object.keys(MOONS) as RobeOrder[]).map((robe) => {
    const phase = moonPhaseForDay(robe, day);
    return { robe, info: MOONS[robe], phase, illumination: PHASE_ILLUMINATION[phase] };
  });
}

export interface MoonPhaseMods {
  /** Adjustment to the mage's saving throws (the table's "Saving Throws" column). */
  saveMod: number;
  /** Additional memorizable spells (of any castable level) this phase grants. */
  additionalSpells: number;
  /** Adjustment to effective casting level (the table's "Effective Level" column). */
  effectiveLevelMod: number;
}

/**
 * The mage's modifiers for the current phase of their moon. The +1 effective level at High Sanction
 * (Full Moon) applies **only** to a mage of level ≥ 6 who also has INT ≥ 15 (the table's footnote);
 * otherwise the full-moon effective-level bonus is 0. Pass the mage's `level` and `int` for that gate.
 */
export function moonPhaseMods(
  phase: MoonPhase,
  ctx: { level?: number; int?: number } = {},
): MoonPhaseMods {
  switch (phase) {
    case 'lowSanction':
      return { saveMod: -1, additionalSpells: 0, effectiveLevelMod: -1 };
    case 'waning':
      return { saveMod: 0, additionalSpells: 0, effectiveLevelMod: 0 };
    case 'waxing':
      return { saveMod: 0, additionalSpells: 1, effectiveLevelMod: 0 };
    case 'highSanction': {
      const qualifies = (ctx.level ?? 0) >= 6 && (ctx.int ?? 0) >= 15;
      return { saveMod: 1, additionalSpells: 2, effectiveLevelMod: qualifies ? 1 : 0 };
    }
  }
}
