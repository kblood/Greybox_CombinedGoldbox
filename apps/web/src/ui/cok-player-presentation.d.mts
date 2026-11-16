import type { RgbaArt } from '@goldbox/engine';
import type { CokPlayerAppearance, CokPlayerAppearanceFrame, CokPlayerPreparation } from './cokPlayerAppearance.js';

export interface CokPlayerPresentationRequest {
  consumer: 'creator-preview' | 'character-sheet' | 'combat-party-icon' | 'party-roster';
  mode: string;
  fallback: string;
  playback: 'still' | 'playback';
  variantIndex?: number;
}
export type CokPlayerPresentation = {
  state: 'held'; reason: string; art: null; frame: null; variantIndex: null;
  source: null; playback: 'held'; label: string;
} | {
  state: 'ready'; reason: string; art: RgbaArt; frame: CokPlayerAppearanceFrame; variantIndex: number;
  source: 'Restyle' | 'DOS-EGA'; playback: 'held'; label: string;
};
export function presentCokPartyRosterIcon(preparation: Promise<CokPlayerPreparation | null>,
  request: Pick<CokPlayerPresentationRequest, 'mode' | 'fallback'>, isCurrent: () => boolean,
  paint: (presentation: CokPlayerPresentation) => void, unavailable: () => void): Promise<void>;
export function resolveCokPlayerPresentation(appearance: CokPlayerAppearance | undefined,
  request: CokPlayerPresentationRequest): CokPlayerPresentation;
