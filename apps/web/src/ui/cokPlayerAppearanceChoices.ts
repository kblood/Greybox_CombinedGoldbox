import type { CokCharacterAppearanceRecord } from '@goldbox/engine';
import manifest from './cokPlayerAppearanceManifest.json';

type SourceTuple = Readonly<Omit<CokCharacterAppearanceRecord, 'paletteBytes'>>;

export interface CokPlayerAppearanceChoice {
  readonly id: string;
  readonly label: string;
  readonly sourceTuple: SourceTuple;
}

// Neutral source colors, not a claim about the retail creation default. The source-mapped
// selectors [1,2,3,4,6,7] each keep their own low index and its +8 high counterpart unchanged.
const NEUTRAL_PALETTE = Object.freeze([0x91, 0xa2, 0xb3, 0xc4, 0xe6, 0xf7]);
const CANONICAL_IDS = ['cok-player-05-18-00-02', 'cok-player-05-01-01-02', 'cok-player-05-17-04-02', 'cok-player-03-0b-03-01'] as const;
const CHOICES: readonly CokPlayerAppearanceChoice[] = Object.freeze(CANONICAL_IDS.map((id, index) => {
  const entry = manifest.appearances.find((appearance) => appearance.appearanceId === id);
  if (!entry) throw new Error(`Missing admitted CoK creation icon: ${id}`);
  // These ids identify the canonical tuple; storage-slot aliases do not become additional choices.
  const sourceTuple = entry.sourceTuples.find((tuple) => `cok-player-${[
    tuple.cHeadRequest, tuple.cBodyBlock, tuple.cBodySlot, tuple.suffixCode,
  ].map((byte) => byte.toString(16).padStart(2, '0')).join('-')}` === id);
  if (!sourceTuple) throw new Error(`Missing canonical CoK creation tuple: ${id}`);
  return Object.freeze({ id, label: `Icon ${index + 1}`, sourceTuple: Object.freeze({ ...sourceTuple }) });
}));

/** Read-only explicit choices. No appearance is inferred from race, class, sex or party position. */
export function cokPlayerAppearanceChoices(): readonly CokPlayerAppearanceChoice[] {
  return CHOICES;
}

/** Make an independent record on each call; absent/unknown ids keep the existing no-icon path. */
export function cokPlayerAppearanceForChoice(id: string | undefined): CokCharacterAppearanceRecord | undefined {
  const choice = CHOICES.find((entry) => entry.id === id);
  return choice ? { ...choice.sourceTuple, paletteBytes: [...NEUTRAL_PALETTE] } : undefined;
}
