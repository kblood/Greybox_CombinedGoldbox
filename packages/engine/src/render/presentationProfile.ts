/**
 * Per-system presentation profile (phase 1 of docs/engine/research/presentation-profiles-design-2026-11-10.md).
 *
 * A presentation profile is pure data that the renderers read: the platform's native screen
 * (`displayScale.ts`'s PlatformProfile) plus the combat grid for that system. It changes
 * presentation only. Movement and game logic never read it.
 *
 * Phase 1 covers DOS-EGA only. Its values are the existing constants, unchanged, so DOS output is
 * identical. Other systems are added with measured data only; `presentationProfileFor` throws for
 * any system without a profile rather than guessing one.
 */
import { DOS_EGA, type PlatformProfile } from './displayScale.js';
import { COK_COMBAT_GEOMETRY, type CombatGridGeometry } from './combatScreen.js';

export interface PresentationProfile {
  /** The platform's native framebuffer and display aspect. */
  readonly platform: PlatformProfile;
  /** The combat grid drawn on this system's battle screen. */
  readonly combatGrid: CombatGridGeometry;
  /** Where each value comes from: a source file or a dated research note. */
  readonly source: string;
}

/** DOS-EGA: the existing values, unchanged (phase 1 is pixel-identical by construction). */
export const DOS_EGA_PRESENTATION: PresentationProfile = Object.freeze({
  platform: DOS_EGA,
  combatGrid: COK_COMBAT_GEOMETRY,
  source: 'platform: render/displayScale.ts DOS_EGA (320×200, 4:3); combatGrid: render/combatScreen.ts COK_COMBAT_GEOMETRY (COAB oracle)',
});

const PROFILES: readonly PresentationProfile[] = Object.freeze([DOS_EGA_PRESENTATION]);

/**
 * Availability of a system's presentation. Only a profile in PROFILES counts as verified. Generic
 * platform constants (`DISPLAY_PROFILES` in displayScale.ts, e.g. AMIGA_PAL and C64) and art
 * availability never imply a profile, so every other system reports `no-data`.
 */
export type PresentationAvailability =
  | { readonly status: 'verified'; readonly system: string; readonly profile: PresentationProfile }
  | { readonly status: 'no-data'; readonly system: string; readonly label: string };

/** Label shown wherever a system has no verified presentation. */
export const NO_MEASURED_DATA_LABEL = 'no measured data';

/** Explicit Amiga battle grid status: no measured Amiga geometry exists, so none is inferred. */
export const AMIGA_COMBAT_GRID_LABEL = `Amiga battle grid: ${NO_MEASURED_DATA_LABEL}`;

/** The verified presentation for a system id, or an explicit `no-data` result. Never throws. */
export function presentationAvailability(systemId: string): PresentationAvailability {
  const profile = PROFILES.find((p) => p.platform.id === systemId);
  if (profile) return { status: 'verified', system: systemId, profile };
  return { status: 'no-data', system: systemId, label: `${systemId}: ${NO_MEASURED_DATA_LABEL}` };
}

/** The verified presentation profile for a platform id, or an error when none has been measured. */
export function presentationProfileFor(platformId: string): PresentationProfile {
  const availability = presentationAvailability(platformId);
  if (availability.status !== 'verified') throw new Error(`no verified presentation profile for "${platformId}"`);
  return availability.profile;
}
