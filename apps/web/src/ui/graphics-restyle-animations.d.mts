import type { CokGeneratedAnimation, CokGeneratedAsset, CokGeneratedInventory } from './cok-generated-inventory.mjs';

export interface RestyleAnimationSource {
  id: string;
  decoded?: { sha256: string } | null;
}
export interface RestyleAnimationRecord {
  id: string;
  sourceAssetIds: string[];
  externalReferences?: { system: string; id: string; reference: string }[];
  outputs: { sha256: string }[];
}
export interface ResolvedRestyleAnimation {
  restyleId: string;
  item: CokGeneratedAsset;
  animation: CokGeneratedAnimation;
}
export function restyleAnimationsForSource(
  asset: RestyleAnimationSource,
  restyles: RestyleAnimationRecord[],
  inventory: CokGeneratedInventory,
): ResolvedRestyleAnimation[];
